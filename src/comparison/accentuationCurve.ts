/**
 * The metrical-accentuation curve — DESIGN.md §5.4.
 *
 * The compared object is the **per-beat velocity contribution**
 * `scale · patternDef.getAccentuationAt(beat)`, in velocity units. Neutral is 0: an absent
 * map, an unlooped span past its first pattern, and a pattern of all-zero accentuations all
 * add nothing to a note's velocity, so the dimension is total over the window without
 * special cases at its edges.
 *
 * ## Phase anchors at the TIME SIGNATURE, never at the instruction (AD-12, R8)
 *
 * ```
 * stickToMeasures (default TRUE):  beat = 1 + ((t − tsDate) mod measureTicks)   / ticksPerBeat
 * otherwise:                       beat = 1 + ((t − tsDate) mod patternLength)  / ticksPerBeat
 * ```
 *
 * Both branches of `MetricalAccentuationMap.ts:162-165` subtract `tsDate`, the date of the
 * time-signature entry in force — **never** `md.startDate`. Executed with no
 * `timeSignatureMap`, moving the instruction from date 0 to date 360 changes nothing: the
 * velocities are identical. Two documents whose patterns agree but whose instructions sit at
 * different dates therefore perform identically, and a per-instruction cycle model would
 * invent a phase difference between them.
 *
 * ## Without an MSM the renderer still answers exactly (AD-12)
 *
 * There is no approximation to make. With no time-signature information the initialisers give
 * `tsDate = 0`, 4/4, `ticksPerBeat = ppq`, `measureTicks = 4·ppq` and
 * `patternLengthTicks = length·4·ppq/denominator` (`MetricalAccentuationMap.ts:124-134`), so
 * the contribution is an exact piecewise-linear function of score time. That is evaluated and
 * reported as `timeSignatureSource: 'renderer-default'`; with an MSM the real map is walked
 * with the same forward-only rule and reported as `'msm'`.
 *
 * ## Unresolvable patterns are `⊥`, and this is the one place exclusion was right (R21)
 *
 * `getMetricalAccentuationDataOf` returns a **non-null** datum with
 * `accentuationPatternDef = null` when the style resolves but the def name does not, and the
 * render then dereferences it unguarded: `TypeError: Cannot read properties of null (reading
 * 'getLength')` — the whole performance render throws. There is no performed function to
 * compare, so the span reads `⊥`. Contrast tempo and dynamics, whose unresolvable levels DO
 * have a performed value (R8's fabricated 100.0); §5.4 exists partly to say which
 * unresolvables are which.
 *
 * Separately, an `<accentuationPattern>` before the map's first `<style>` switch is silently
 * skipped even with a perfectly good `@name.ref` (`:88-90` returns null when no style is in
 * scope) — a renderer skip, reported as one, not a `⊥`.
 *
 * ## Reading discipline
 *
 * The `accentuationPatternDef` is read **raw**. Constructing `AccentuationPatternDef` would
 * add `length="4"` to the document and reorder its `<accentuation>` children by beat
 * (`AccentuationPatternDef.ts:36-40`, `:67` → `:192-199`), which R1 forbids.
 */
import type { Element } from '../xml/XomTypes.js';
import { attribute } from '../xml/tree.js';
import { METRICAL_ACCENTUATION_MAP, METRICAL_ACCENTUATION_STYLE } from '../mpm/names.js';
import { readAttributeValue, readNumericAttributeValue } from '../expression/attributes.js';
import { findStyleDef } from '../expression/styleScope.js';
import type { MpmEnvironment } from '../expression/mpmTree.js';
import { assertSpanEndRule } from './spanEnds.js';
import { bottom, valued, type Valued } from './values.js';
import type { OrderedMapView } from './document.js';

/** `AccentuationPatternDef`'s own default, which it also writes onto the element at parse. */
export const DEFAULT_PATTERN_LENGTH = 4;

/** Where the beat grid came from — §9.1's `TimeSignatureSource`. */
export type TimeSignatureSource = 'msm' | 'renderer-default';

/**
 * One `<accentuation>`, in `getAccentuationAt`'s own tuple order.
 *
 * The defaulting chain is the parser's: `@transition.from` falls back to `@value`, and
 * `@transition.to` falls back to `@transition.from` — so a bare `<accentuation beat value>`
 * is a flat segment at `value` rather than a ramp to zero.
 */
export interface PatternPoint {
  readonly beat: number;
  readonly value: number;
  readonly transitionFrom: number;
  readonly transitionTo: number;
}

/** A resolved `accentuationPatternDef`. */
export interface AccentuationPattern {
  readonly length: number;
  /** Ascending by beat, stable on ties — the parser's insertion order. */
  readonly points: readonly PatternPoint[];
}

/** One `<accentuationPattern>` instruction's governed span. */
export interface AccentuationSegment {
  readonly startTicks: number;
  readonly endTicks: number;
  readonly scale: number;
  readonly stickToMeasures: boolean;
  readonly loop: boolean;
  /** `⊥` where the style resolved but the def name did not — the render throws (R21). */
  readonly pattern: Valued<AccentuationPattern>;
}

export interface AccentuationCurveNote {
  readonly kind: 'renderer-error' | 'renderer-skip';
  readonly dateTicks: number;
  readonly detail: string;
}

/** The beat grid a span is evaluated on. */
export interface BeatGrid {
  readonly tsDate: number;
  readonly numerator: number;
  readonly denominator: number;
  readonly source: TimeSignatureSource;
}

/** `MetricalAccentuationMap.ts:124-129`'s initialisers — 4/4 anchored at 0. */
export function rendererDefaultBeatGrid(): BeatGrid {
  return { tsDate: 0, numerator: 4, denominator: 4, source: 'renderer-default' };
}

export interface AccentuationCurve {
  readonly segments: readonly AccentuationSegment[];
  readonly breakpointsTicks: readonly number[];
  readonly notes: readonly AccentuationCurveNote[];
  readonly timeSignatureSource: TimeSignatureSource;
}

/** The neutral curve: no contribution anywhere, which an absent map performs (R6). */
export function neutralAccentuationCurve(): AccentuationCurve {
  return {
    segments: [],
    breakpointsTicks: [0],
    notes: [],
    timeSignatureSource: 'renderer-default',
  };
}

/**
 * Read an `accentuationPatternDef` element without constructing one.
 *
 * `@length` defaults to {@link DEFAULT_PATTERN_LENGTH}; an `<accentuation>` with no `@beat`
 * is skipped exactly as the parser skips it. Points are sorted ascending by beat with ties
 * keeping document order, which is what the parser's backwards insertion scan produces.
 */
export function readAccentuationPattern(def: Element): AccentuationPattern {
  const rawLength = readNumericAttributeValue(def, 'length');
  const points: PatternPoint[] = [];

  for (const child of def.getChildElements('accentuation').toArray()) {
    const beat = readNumericAttributeValue(child, 'beat');
    if (Number.isNaN(beat)) continue;
    const value = readNumericAttributeValue(child, 'value');
    const resolvedValue = Number.isNaN(value) ? 0 : value;
    const from = readNumericAttributeValue(child, 'transition.from');
    const resolvedFrom = Number.isNaN(from) ? resolvedValue : from;
    const to = readNumericAttributeValue(child, 'transition.to');
    points.push({
      beat,
      value: resolvedValue,
      transitionFrom: resolvedFrom,
      transitionTo: Number.isNaN(to) ? resolvedFrom : to,
    });
  }

  // On `@beat` alone: two `<accentuation>` children of one def sharing a beat keep their
  // document order, which is the order the renderer applies them in. Stable, single-document,
  // and therefore invisible to the a/b swap — stated because it was implicit (W3 MINOR-7).
  points.sort((a, b) => a.beat - b.beat);
  return {
    length: Number.isFinite(rawLength) ? rawLength : DEFAULT_PATTERN_LENGTH,
    points,
  };
}

/**
 * `AccentuationPatternDef.getAccentuationAt`, transliterated — including its **deliberate
 * asymmetry**, which is the whole reason this is not a two-line interpolation.
 *
 * - Before the first accentuation's beat: **0**.
 * - At or after `length + 1`: the last accentuation's `@transition.to`.
 * - Exactly on an accentuation's beat: that accentuation's `@value` — not its
 *   `@transition.from`, which is a different number whenever the two were both authored.
 * - Otherwise ramp from the preceding accentuation's `@transition.from` towards its
 *   `@transition.to` over `[beat, segmentEnd)`, where `segmentEnd` is the **next**
 *   accentuation's beat for every accentuation that has a successor, and `length + 1` for
 *   the **last** one. That `i < points.length - 1` guard is the asymmetry: upstream
 *   cemfi/meico spells it `i > length - 1`, which can never hold, so every segment ran to the
 *   pattern end and all but the last interpolation was flattened. The fork fixed it (TD3) and
 *   regenerated the affected ground truth; this follows the fixed form.
 *
 * A pattern with no accentuations throws in the renderer; here it contributes 0, because the
 * caller has already decided whether the span exists at all.
 */
export function accentuationAt(pattern: AccentuationPattern, beatPosition: number): number {
  const points = pattern.points;
  if (points.length === 0) return 0;
  if (beatPosition < points[0].beat) return 0;
  if (beatPosition >= pattern.length + 1) return points[points.length - 1].transitionTo;

  let found: PatternPoint | null = null;
  let segmentEnd = pattern.length + 1;
  for (let i = points.length - 1; i >= 0; --i) {
    found = points[i];
    if (beatPosition === found.beat) return found.value;
    if (beatPosition > found.beat) {
      if (i < points.length - 1) segmentEnd = points[i + 1].beat;
      break;
    }
  }
  if (found === null) return 0;

  return (
    ((beatPosition - found.beat) * (found.transitionTo - found.transitionFrom)) /
      (segmentEnd - found.beat) +
    found.transitionFrom
  );
}

/** `ppq4 / denominator` — the renderer's beat length in ticks. */
function ticksPerBeatOf(grid: BeatGrid, ticksPerQuarter: number): number {
  return (4 * ticksPerQuarter) / grid.denominator;
}

/** `ticksPerBeat · numerator`. */
function measureTicksOf(grid: BeatGrid, ticksPerQuarter: number): number {
  return ticksPerBeatOf(grid, ticksPerQuarter) * grid.numerator;
}

/** `length · 4 · ppq / denominator`. */
function patternLengthTicksOf(
  pattern: AccentuationPattern,
  grid: BeatGrid,
  ticksPerQuarter: number,
): number {
  return (pattern.length * 4 * ticksPerQuarter) / grid.denominator;
}

/**
 * The beat position `t` falls on, under a span's own `@stickToMeasures`.
 *
 * The modulus is against the **measure** when `stickToMeasures` is true (its default) and
 * against the **pattern** otherwise — two different cycles, and the choice is per instruction.
 */
export function beatAt(
  ticks: number,
  segment: AccentuationSegment,
  pattern: AccentuationPattern,
  grid: BeatGrid,
  ticksPerQuarter: number,
): number {
  const ticksPerBeat = ticksPerBeatOf(grid, ticksPerQuarter);
  const cycle = segment.stickToMeasures
    ? measureTicksOf(grid, ticksPerQuarter)
    : patternLengthTicksOf(pattern, grid, ticksPerQuarter);
  if (!(cycle > 0)) return 1;
  const offset = ticks - grid.tsDate;
  // The renderer uses `%`, which keeps the sign of the dividend; a date before the time
  // signature is not something the forward-only walk can produce, but the modulus is written
  // the same way so that if one ever arrives it behaves identically.
  return 1 + (offset % cycle) / ticksPerBeat;
}

/**
 * Build the performed accentuation curve of one scope.
 *
 * Span ends follow the same-local-name rule (`getEndDate:91-99` scans for the next
 * `<accentuationPattern>`), so a `<style>` between two instructions is transparent to the
 * span — though a `<style>` *before* the first instruction is what makes that instruction
 * resolvable at all.
 */
export function readAccentuationSegments(
  view: OrderedMapView | null,
  scaleFactor: number,
  environment: MpmEnvironment,
  globalEnvironment: MpmEnvironment,
  grid: BeatGrid = rendererDefaultBeatGrid(),
): AccentuationCurve {
  assertSpanEndRule(METRICAL_ACCENTUATION_MAP, 'same-local-name');
  if (view === null) return neutralAccentuationCurve();

  const raws: { dateTicks: number; element: Element; styleName: string | null }[] = [];
  for (const [index, entry] of view.entries.entries()) {
    if (entry.element.getLocalName() !== 'accentuationPattern') continue;
    if (!Number.isFinite(entry.date)) continue;
    raws.push({
      dateTicks: entry.date * scaleFactor,
      element: entry.element,
      styleName: view.styleNames[index],
    });
  }
  if (raws.length === 0) return neutralAccentuationCurve();

  const segments: AccentuationSegment[] = [];
  const notes: AccentuationCurveNote[] = [];
  const breakpoints = new Set<number>([0]);

  for (const [index, raw] of raws.entries()) {
    const next = raws[index + 1] as (typeof raws)[number] | undefined;
    const endTicks = next?.dateTicks ?? Number.POSITIVE_INFINITY;
    breakpoints.add(raw.dateTicks);

    const nameRef = readAttributeValue(raw.element, 'name.ref');
    const scale = readNumericAttributeValue(raw.element, 'scale');

    // `@name.ref` and `@scale` are both mandatory: without either, getMetricalAccentuationDataOf
    // returns null and the instruction is skipped outright.
    if (nameRef === null || Number.isNaN(scale)) {
      notes.push({
        kind: 'renderer-skip',
        dateTicks: raw.dateTicks,
        detail:
          'missing @name.ref or @scale — getMetricalAccentuationDataOf returns null and the ' +
          'renderer skips the instruction entirely',
      });
      continue;
    }

    const style = findStyleDef(
      METRICAL_ACCENTUATION_STYLE,
      raw.styleName,
      environment,
      globalEnvironment,
    );

    // No style in scope — an instruction before the map's first <style> switch — is skipped
    // even with a perfectly good @name.ref (§5.4). A renderer SKIP, not a ⊥: nothing throws.
    if (style === null) {
      notes.push({
        kind: 'renderer-skip',
        dateTicks: raw.dateTicks,
        detail:
          'no metricalAccentuationStyle in scope: the instruction is silently skipped even ' +
          'with a valid @name.ref (MetricalAccentuationMap.ts:88-90)',
      });
      continue;
    }

    let def: Element | null = null;
    for (const candidate of style.styleDef.getChildElements('accentuationPatternDef').toArray())
      if (attribute('name', candidate)?.getValue() === nameRef) def = candidate;

    if (def === null) {
      // The style resolved but the def name did not: the datum is non-null with a null def,
      // and the render dereferences it — TypeError, the whole render throws (R21).
      segments.push({
        startTicks: raw.dateTicks,
        endTicks,
        scale,
        stickToMeasures: readAttributeValue(raw.element, 'stickToMeasures') !== 'false',
        loop: readAttributeValue(raw.element, 'loop') === 'true',
        pattern: bottom('renderer-error'),
      });
      notes.push({
        kind: 'renderer-error',
        dateTicks: raw.dateTicks,
        detail:
          `no <accentuationPatternDef name="${nameRef}"> in the style in scope: the datum is ` +
          'non-null with a null def and the render dereferences it — TypeError, the whole ' +
          'performance render throws, so the span is ⊥ (R21/AD-1)',
      });
      continue;
    }

    segments.push({
      startTicks: raw.dateTicks,
      endTicks,
      scale,
      // Default TRUE — the one boolean in this module whose absent-default is not false.
      stickToMeasures: readAttributeValue(raw.element, 'stickToMeasures') !== 'false',
      loop: readAttributeValue(raw.element, 'loop') === 'true',
      pattern: valued(readAccentuationPattern(def)),
    });
  }

  return {
    segments,
    breakpointsTicks: [...breakpoints].sort((a, b) => a - b),
    notes,
    timeSignatureSource: grid.source,
  };
}

/** The segment governing `ticks`, right-continuous (A-B1), or null where none does. */
export function accentuationSegmentAt(
  curve: AccentuationCurve,
  ticks: number,
): AccentuationSegment | null {
  for (const segment of curve.segments) {
    if (ticks < segment.startTicks) break;
    if (ticks < segment.endTicks) return segment;
  }
  return null;
}

/**
 * The velocity contribution at `ticks` — `scale · getAccentuationAt(beat)`, or `⊥`.
 *
 * Zero outside every segment, and zero past the first pattern when `@loop` is off: the
 * renderer breaks out of the span at `startDate + patternLengthTicks` (`:157-161`), the same
 * one-frame-then-identity shape as rubato's `@loop`.
 */
export function accentuationContributionAt(
  curve: AccentuationCurve,
  ticks: number,
  ticksPerQuarter: number,
  grid: BeatGrid = rendererDefaultBeatGrid(),
): Valued<number> {
  const segment = accentuationSegmentAt(curve, ticks);
  if (segment === null) return valued(0);
  if (segment.pattern.kind === 'bottom') return segment.pattern;

  const pattern = segment.pattern.value;
  if (!segment.loop) {
    const patternLength = patternLengthTicksOf(pattern, grid, ticksPerQuarter);
    if (ticks >= segment.startTicks + patternLength) return valued(0);
  }

  const beat = beatAt(ticks, segment, pattern, grid, ticksPerQuarter);
  return valued(segment.scale * accentuationAt(pattern, beat));
}
