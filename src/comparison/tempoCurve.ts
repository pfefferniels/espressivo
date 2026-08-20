/**
 * The tempo curve, as the renderer performs it — DESIGN.md §5.1.
 *
 * `g(t) = ln(qbpm(t))`, `qbpm = bpm · beatLength · 4`. Natural log, pinned by AD-26.1: the
 * base is a coherence invariant with `expression/transforms.ts`, JND normalization makes the
 * reported distances base-free anyway, and every reported log quantity is tagged `nepers`.
 * **Direction is pinned too, because the field mixes conventions**: MPM stores BPM, a *rate*,
 * so a positive log difference means **A is FASTER**. In the seconds-per-beat convention
 * (partitura, Cancino-Chacón 2018 §4.3) positive means slower; the two are reciprocal.
 *
 * This module is the *curve*, not the distance. It reads a document into a list of segments
 * and evaluates them; pricing, JND normalization and integration belong to the density layer.
 *
 * ## What makes this more than "read bpm, interpolate"
 *
 * Four renderer behaviours, each of which changes the curve and none of which is guessable:
 *
 * 1. **Trailing transitions are inert** (AD-8). `TempoMap.getEndDate:166-175` returns
 *    `Number.MAX_VALUE` when no later `<tempo>` exists, so `u ≈ 0` for every real date and
 *    the tempo stays pinned at `bpm₀`. An instruction with no successor performs as a
 *    **constant at its own bpm**; its `@transition.to` and `@meanTempoAt` are inert. The
 *    repo's own `all_maps.mpm` ends with `transition.to="90"` from 120, and reading it as a
 *    ritardando would invent the most audible gesture in the file.
 * 2. **A skipped instruction still ends the previous span, and opens a 100-qbpm gap**
 *    (AD-9i). `getTempoDataOf` returns null iff `@bpm` or `@beatLength` is absent, but
 *    `getEndDate` scans for the next element *named* `tempo` regardless of whether it
 *    parses. The render then `continue`s past it and times the intervening notes at the
 *    no-tempo default — `computeDiffTiming(date, ppq, null)`, i.e. 100 quarter-bpm.
 * 3. **The pre-first-instruction region is also 100 qbpm** (AD-9ii/R11), not a left
 *    extension of the first instruction.
 * 4. **The degenerate table** (AD-9iii) — four cases, and "collapses to a constant" is wrong
 *    on half of them by a factor of two. See {@link readTempoSegments}.
 *
 * Reading is right-continuous (A-B1): the value **at** an instruction's date is that
 * instruction's value. `TempoMap.getTempoAt` is strictly-before and would read date 0 as the
 * 100 default even where a document places an instruction there; the divergence is measure
 * zero for an integral and is documented rather than reproduced.
 */
import {
  elementAtOrNull,
  filterMap,
  isNonEmpty,
  last,
  upperBoundBy,
  withNext,
} from '../prelude/index.js';
import { optionAt } from '../prelude/seq.js';
import type { Element } from '../xml/XomTypes.js';
import { attribute } from '../xml/tree.js';
import { readAttributeValue, readNumericAttributeValue } from '../expression/attributes.js';
import type { MpmEnvironment } from '../expression/mpmTree.js';
import { resolveComparisonLevel } from './values.js';
import { TEMPO_MAP } from '../mpm/names.js';
import { assertSpanEndRule } from './spanEnds.js';
import { resolutionAt, type OrderedMapView } from './document.js';

/** MPM's no-tempo default, in quarter-bpm: `computeMillisecondsForNoTempo` is `600·date/ppq`. */
export const NO_TEMPO_QUARTER_BPM = 100;

/**
 * One span of the performed tempo curve, in **common ticks**.
 *
 * `power` carries the already-normalized quarter-bpm endpoints, because `beatLength` is
 * constant within one instruction and therefore factors straight through the interpolation:
 * `(bpm₀ + Δ·u^e)·beatLength·4 = qbpm₀ + Δqbpm·u^e`.
 */
export type TempoSegment =
  | {
      readonly kind: 'constant';
      readonly startTicks: number;
      readonly endTicks: number;
      readonly qbpm: number;
    }
  | {
      readonly kind: 'power';
      readonly startTicks: number;
      readonly endTicks: number;
      readonly qbpm0: number;
      readonly qbpm1: number;
      /** `ln 0.5 / ln(meanTempoAt)`, always finite and > 0 here. */
      readonly exponent: number;
    };

/** Why a span carries the 100-qbpm default rather than an authored tempo. */
export type TempoGapCause = 'pre-first' | 'skip';

/** One reportable event the curve reader met. */
export interface TempoCurveNote {
  readonly kind: 'renderer-skip' | 'renderer-default-level' | 'inert-transition';
  readonly dateTicks: number;
  readonly detail: string;
}

export interface TempoCurve {
  /** Contiguous, ascending, gap-free over `[0, lastEndTicks]`. */
  readonly segments: readonly TempoSegment[];
  /** Segment boundaries in common ticks — the grid's contribution from this dimension. */
  readonly breakpointsTicks: readonly number[];
  readonly notes: readonly TempoCurveNote[];
}

/** The neutral tempo curve: 100 qbpm everywhere, which is what an absent map performs (R6). */
export function neutralTempoCurve(): TempoCurve {
  return {
    segments: [
      {
        kind: 'constant',
        startTicks: 0,
        endTicks: Number.POSITIVE_INFINITY,
        qbpm: NO_TEMPO_QUARTER_BPM,
      },
    ],
    breakpointsTicks: [0],
    notes: [],
  };
}

/** `bpm · beatLength · 4`, the quarter-note-normalized rate every comparison is made in. */
function quarterBpm(bpm: number, beatLength: number): number {
  return bpm * beatLength * 4;
}

interface RawTempo {
  readonly element: Element;
  readonly dateTicks: number;
  /** Null when the renderer would skip this instruction (`@bpm` or `@beatLength` absent). */
  readonly parsed: {
    readonly qbpm: number;
    readonly transitionToQbpm: number | null;
    readonly meanTempoAt: number | null;
    readonly rendererDefault: boolean;
  } | null;
}

/**
 * Read one `<tempo>` the way `TempoMap.getTempoDataOf` reads it, stopping short of the
 * end-date scan.
 *
 * The skip test is exactly the renderer's: `@bpm` **or** `@beatLength` absent ⇒ null
 * (`TempoMap.ts:118-121`). Note that an unresolvable *level* is not a skip — R8/AD-1 makes it
 * the renderer's fabricated 100.0 — while a missing attribute is.
 */
function readRawTempo(
  element: Element,
  dateTicks: number,
  scaleFactor: number,
  styleName: string | null,
  environment: MpmEnvironment,
  globalEnvironment: MpmEnvironment,
): RawTempo {
  const bpmText = readAttributeValue(element, 'bpm');
  const beatLengthText = readAttributeValue(element, 'beatLength');
  if (bpmText === null || beatLengthText === null) return { element, dateTicks, parsed: null };

  const beatLength = parseFloat(beatLengthText);
  const bpm = resolveComparisonLevel(bpmText, 'tempo', styleName, environment, globalEnvironment);

  const transitionToText = readAttributeValue(element, 'transition.to');
  const transitionTo =
    transitionToText === null
      ? null
      : resolveComparisonLevel(
          transitionToText,
          'tempo',
          styleName,
          environment,
          globalEnvironment,
        );

  const meanTempoAtRaw = readNumericAttributeValue(element, 'meanTempoAt');

  return {
    element,
    dateTicks: dateTicks * scaleFactor,
    parsed: {
      qbpm: quarterBpm(bpm.value, beatLength),
      transitionToQbpm: transitionTo === null ? null : quarterBpm(transitionTo.value, beatLength),
      meanTempoAt: Number.isNaN(meanTempoAtRaw) ? null : meanTempoAtRaw,
      rendererDefault:
        bpm.source === 'renderer-default' ||
        (transitionTo !== null && transitionTo.source === 'renderer-default'),
    },
  };
}

/**
 * Resolve one instruction's span into a segment, applying §5.1's **degenerate table**.
 *
 * | case | performed |
 * |---|---|
 * | `@transition.to` equals `@bpm` | constant at `bpm` |
 * | `meanTempoAt ≤ 0` | constant at **`transition.to`** — `TempoMap.ts:144-151` reassigns `bpm := transitionTo` |
 * | `meanTempoAt ≥ 1` | constant at `bpm` |
 * | `@meanTempoAt` absent, `@transition.to` present and differing | linear ramp, `e = 1` |
 *
 * The second row is the one "collapses to a constant" gets wrong by a factor of two.
 * `isTrailing` folds in AD-8: no successor means the transition never develops, so the span
 * is a constant at `bpm` whatever the transition attributes say.
 */
function segmentFor(
  parsed: NonNullable<RawTempo['parsed']>,
  startTicks: number,
  endTicks: number,
  isTrailing: boolean,
): { segment: TempoSegment; inertTransition: boolean } {
  const constant = (qbpm: number): TempoSegment => ({
    kind: 'constant',
    startTicks,
    endTicks,
    qbpm,
  });

  const { qbpm, transitionToQbpm, meanTempoAt } = parsed;

  if (transitionToQbpm === null) return { segment: constant(qbpm), inertTransition: false };
  if (isTrailing) return { segment: constant(qbpm), inertTransition: true };
  if (transitionToQbpm === qbpm) return { segment: constant(qbpm), inertTransition: false };

  if (meanTempoAt === null)
    return {
      segment: {
        kind: 'power',
        startTicks,
        endTicks,
        qbpm0: qbpm,
        qbpm1: transitionToQbpm,
        exponent: 1,
      },
      inertTransition: false,
    };

  if (meanTempoAt <= 0) return { segment: constant(transitionToQbpm), inertTransition: false };
  if (meanTempoAt >= 1) return { segment: constant(qbpm), inertTransition: false };

  return {
    segment: {
      kind: 'power',
      startTicks,
      endTicks,
      qbpm0: qbpm,
      qbpm1: transitionToQbpm,
      exponent: Math.log(0.5) / Math.log(meanTempoAt),
    },
    inertTransition: false,
  };
}

/**
 * Build the performed tempo curve of one scope.
 *
 * The span-end rule is `same-local-name` (AD-14ii): the next element **named `tempo`** ends
 * the span whether or not it parses, and a `<style>` between two tempi is transparent. That
 * asymmetry — the end-date scan ignores validity while the data read does not — is exactly
 * what produces the 100-qbpm gap of behaviour 2.
 */
export function readTempoSegments(
  view: OrderedMapView | null,
  scaleFactor: number,
  environment: MpmEnvironment,
  globalEnvironment: MpmEnvironment,
): TempoCurve {
  assertSpanEndRule(TEMPO_MAP, 'same-local-name');

  if (view === null) return neutralTempoCurve();

  // Read each entry, skip the ones that are not a dated `<tempo>`, keep the rest — `filterMap`,
  // with the two `continue`s becoming the two `null` returns. The index the body still needs is
  // the one `filterMap` passes; it addresses the view's PARALLEL arrays (`styleNames`,
  // `entryResolutions`), not the entries, which is why it survives where the accumulator did not.
  const raws = filterMap(view.entries, (entry, index) => {
    if (entry.element.getLocalName() !== 'tempo') return null;
    if (!Number.isFinite(entry.date)) return null;
    const resolution = resolutionAt(view, index, scaleFactor, environment, globalEnvironment);
    return readRawTempo(
      entry.element,
      entry.date,
      resolution.scaleFactor,
      optionAt(view.styleNames, index, 'a map view style-name list'),
      resolution.environment,
      resolution.globalEnvironment,
    );
  });

  if (raws.length === 0) return neutralTempoCurve();

  const segments: TempoSegment[] = [];
  const notes: TempoCurveNote[] = [];

  // Every VALID instruction with the position it holds in `raws`, ascending — the one structure
  // both look-aheads below need. It replaces `raws.slice(index + 1).find(...)` inside the loop
  // over `raws`, which copied the whole tail once per skipped instruction: quadratic in time AND
  // in allocation, for an answer the whole map shares.
  //
  // The positions ascend because `filterMap` preserves order, so "the first valid instruction
  // strictly after `index`" is `upperBoundBy` — O(log n) after one O(n) pass. Measured on the
  // isolated shape at 16 000 entries, 5% of them valid: 167 ms for the tail-slice scan, 529 ms
  // for the `find((c, at) => at > index && …)` that removes only the allocation — a JS predicate
  // call per skipped element costs far more than the memcpy it saves — and 0.07 ms for this.
  const valid = filterMap(raws, (raw, at) =>
    raw.parsed === null ? null : { at, dateTicks: raw.dateTicks },
  );

  // Behaviour 3: [0, firstValidDate) performs at the no-tempo default. The FIRST VALID
  // instruction bounds it, not the first instruction — a leading skip extends the default.
  const firstValidDate = valid[0]?.dateTicks ?? Number.POSITIVE_INFINITY;
  if (firstValidDate > 0)
    segments.push({
      kind: 'constant',
      startTicks: 0,
      endTicks: firstValidDate,
      qbpm: NO_TEMPO_QUARTER_BPM,
    });

  // The next element named `tempo`, valid or not (getEndDate ignores validity).
  // The neighbour is PAIRED with its own instruction rather than read at `index + 1`. "There is
  // no next one" is then a value — `null` — instead of an out-of-range read that the type system
  // had to be told about with `as … | undefined`.
  // `withNext` IS this pair of lines: every entry with its successor, and `null` for the
  // last. The `[...xs.slice(1), null]` array and the zip that consumed it were one shape
  // spelled out, and it is the shape `pairwise` cannot serve — `pairwise` drops the last
  // entry, and the last instruction is a span too.
  const paired = withNext(raws);
  // The index survives only as a BOUND in the look-ahead predicate below, never as a read.
  for (const [index, [raw, next]] of paired.entries()) {
    const isTrailing = next === null;
    const endTicks = next?.dateTicks ?? Number.POSITIVE_INFINITY;

    if (raw.parsed === null) {
      // Behaviour 2: the skip ends the previous span (already handled, since the previous
      // segment's end is this date) and opens a default gap up to the next VALID instruction.
      notes.push({
        kind: 'renderer-skip',
        dateTicks: raw.dateTicks,
        detail: 'missing @bpm or @beatLength — the renderer skips it and performs 100 qbpm here',
      });
      const nextValid = elementAtOrNull(
        valid,
        upperBoundBy(valid, (entry) => entry.at, index),
      );
      segments.push({
        kind: 'constant',
        startTicks: raw.dateTicks,
        endTicks: nextValid?.dateTicks ?? Number.POSITIVE_INFINITY,
        qbpm: NO_TEMPO_QUARTER_BPM,
      });
      continue;
    }

    // A valid instruction whose span is entirely swallowed by a following skip gap still
    // starts here; the gap segment above begins at the skip's own date, so the two abut.
    const { segment, inertTransition } = segmentFor(
      raw.parsed,
      raw.dateTicks,
      endTicks,
      isTrailing,
    );
    segments.push(segment);

    if (inertTransition)
      notes.push({
        kind: 'inert-transition',
        dateTicks: raw.dateTicks,
        detail:
          'last <tempo> of the map: getEndDate is MAX_VALUE, so @transition.to and ' +
          '@meanTempoAt are inert and the span performs as a constant (AD-8)',
      });
    if (raw.parsed.rendererDefault)
      notes.push({
        kind: 'renderer-default-level',
        dateTicks: raw.dateTicks,
        detail: 'unresolvable level performed at the renderer default of 100.0 (R8/AD-1)',
      });
  }

  // Sorted on the date alone, so two segments opening at one tick keep their MAP order — sort
  // stability, and deliberate rather than overlooked (W3 MINOR-7 named it as implicit). It is
  // the right order and not merely a stable one: co-dated instructions are applied in document
  // order by the renderer too, and the array reaching here came from ONE document, so no a/b
  // orientation can leak through it (§9.5's concern is arrays built from both).
  segments.sort((a, b) => a.startTicks - b.startTicks);

  return {
    segments,
    breakpointsTicks: [...new Set(segments.map((segment) => segment.startTicks))].sort(
      (a, b) => a - b,
    ),
    notes,
  };
}

/**
 * `g(t) = ln(qbpm(t))` at a position in **common ticks**, right-continuous (A-B1).
 *
 * Past the last segment the curve holds its final value, which is what the renderer does:
 * the trailing instruction's span runs to `MAX_VALUE`.
 */
export function tempoLogAt(curve: TempoCurve, ticks: number): number {
  return Math.log(quarterBpmAt(curve, ticks));
}

/** `qbpm(t)` at a position in common ticks. Right-continuous; holds past the end. */
export function quarterBpmAt(curve: TempoCurve, ticks: number): number {
  const segment = segmentAt(curve, ticks);
  if (segment === null) return NO_TEMPO_QUARTER_BPM;
  if (segment.kind === 'constant') return segment.qbpm;

  const span = segment.endTicks - segment.startTicks;
  if (!Number.isFinite(span) || span <= 0) return segment.qbpm0;
  const u = (ticks - segment.startTicks) / span;
  if (u <= 0) return segment.qbpm0;
  if (u >= 1) return segment.qbpm1;
  return segment.qbpm0 + (segment.qbpm1 - segment.qbpm0) * Math.pow(u, segment.exponent);
}

/**
 * The segment governing `ticks`, right-continuous: `[start, end)`.
 *
 * **A SCAN, deliberately, where the accentuation, rubato and pedal siblings are a binary
 * search** — see `segments.ts`'s `coveringSegmentAt`, which they share and this does not. Three
 * differences, and each of them alone is enough:
 *
 * 1. `|| !Number.isFinite(segment.endTicks)` makes an `Infinity`-ended segment count as covering
 *    a tick it does not contain. A bare containment test after the bound drops that arm, which
 *    is a silent behaviour change and not a speed-up.
 * 2. `?? last(curve.segments)` returns the LAST segment where the bound returns `null`. Past the
 *    end the two coincide; BEFORE the first segment they do not, and the bound gives −1.
 * 3. The segments genuinely overlap, where the other three provably do not: a skipped
 *    instruction opens a gap running to the next VALID instruction, so two consecutive skips
 *    give `[d1, dv)` and `[d2, dv)` — nested, sharing a right end. `coveringSegmentAt`'s whole
 *    proof is that at most one segment covers a tick, and that does not hold here.
 *
 * The overlap is survivable — every overlapping family shares its right endpoint, and only
 * invalid instructions lie strictly inside a gap, so "last start wins" is preserved. Clauses 1
 * and 2 are not: both decide what a published report field says at a tick nothing covers, and
 * the metric's own hazard is a `NaN` tick, where a wrong answer LOOKS like an answer. Left as a
 * scan until someone can show the two clauses are unreachable rather than merely unlikely.
 */
export function segmentAt(curve: TempoCurve, ticks: number): TempoSegment | null {
  let found: TempoSegment | null = null;
  for (const segment of curve.segments) {
    if (segment.startTicks > ticks) break;
    if (ticks < segment.endTicks || !Number.isFinite(segment.endTicks)) found = segment;
  }
  return found ?? (isNonEmpty(curve.segments) ? last(curve.segments) : null);
}

/** Whether `element` is a `<tempo>` the renderer would skip — exported for the grid. */
export function isSkippedTempo(element: Element): boolean {
  return attribute('bpm', element) === null || attribute('beatLength', element) === null;
}
