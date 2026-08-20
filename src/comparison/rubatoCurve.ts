/**
 * The rubato displacement curve — DESIGN.md §5.2.
 *
 * The compared object is the **displacement** `δ(t) = warp(t) − t`, in quarters, not the
 * warped date itself. Neutral is `δ ≡ 0`, which is what an absent map, an unwarped gap and
 * an identity window all perform, so the dimension is total over the window without special
 * cases at its edges.
 *
 * Within one frame of length `L` starting at the instruction's date `t₀`, with
 * `τ = (t − t₀) mod L` (`RubatoMap.computeRubatoTransformation:166-173`):
 *
 *     δ = L·((τ/L)^intensity·(earlyEnd − lateStart) + lateStart) − τ
 *
 * ## Four renderer behaviours, each of which changes the curve
 *
 * 1. **`@loop` gates the cycle** (AD-10). `RubatoData.loop` defaults to **false**
 *    (`RubatoData.ts:37`) and `renderRubatoToMap` breaks out of the span at the first frame
 *    boundary when it is off (`RubatoMap.ts:199-203`). The `mod` in the formula *is* the
 *    repetition `@loop` controls, so with the flag off the warp applies on `[t₀, t₀ + L)`
 *    and `δ ≡ 0` across the rest of the span. The repo's own fixtures carry
 *    `<rubato frameLength="720.0" lateStart="0.25" earlyEnd="0.75"/>` with **no** `@loop`,
 *    which a cyclic reading would warp across its whole span.
 * 2. **A skipped instruction leaves a neutral gap that still has a breakpoint** (AD-16,
 *    R23). `getRubatoDataOf` returns null when neither the element nor a referenced
 *    `rubatoDef` supplies `@frameLength` — "without a frame there is nothing to warp" — but
 *    `getEndDate` scans for the next `<rubato>` regardless of validity, so the skipped
 *    element still ends the preceding span and opens an unwarped gap.
 * 3. **Clamps run before evaluation** (`RubatoMap.ts:136-141`): `lateStart` floored at 0,
 *    `earlyEnd` capped at 1, and an inverted or empty window reset to the full frame
 *    `(0, 1)`. Applying them afterwards would compare inverted warps the renderer never
 *    performs.
 * 4. **The neutral parametrization is special-cased** (AD-21, M18). When
 *    `intensity === 1 && lateStart === 0 && earlyEnd === 1` the evaluator returns exactly 0
 *    without arithmetic: `L·(τ/L) − τ` does **not** round-trip for all integer pairs —
 *    `(22, 15)` gives `−1.78e−15`, `(25, 7)` gives `+8.88e−16` — so a fixture that happened
 *    to pick such a pair would fail an "exactly 0" assertion for a reason that has nothing
 *    to do with rubato.
 *
 * Defaults for absent `@intensity` / `@lateStart` / `@earlyEnd` with no def are
 * `RubatoData`'s own initializers **1.0 / 0.0 / 1.0** — the identity warp.
 * `@frameLength` is tick-valued and therefore ppq-sensitive; `@intensity` and the window
 * bounds are dimensionless and are not rescaled.
 */
import { zipWith } from '../prelude/index.js';
import { optionAt } from './indexing.js';
import type { Element } from '../xml/XomTypes.js';
import { attribute } from '../xml/tree.js';
import { RUBATO_MAP, RUBATO_STYLE } from '../mpm/names.js';
import { readAttributeValue } from '../expression/attributes.js';
import { findStyleDef } from '../expression/styleScope.js';
import type { MpmEnvironment } from '../expression/mpmTree.js';
import { assertSpanEndRule } from './spanEnds.js';
import { resolutionAt, type OrderedMapView } from './document.js';

/**
 * The `<rubatoDef name="…">` a `<rubato name.ref="…">` inherits from, or null.
 *
 * Style resolution goes through `styleScope.findStyleDef`, which §5.0 requires: a part
 * header declaring `styleDef name="A"` hides the global `"A"` entirely, defs and all, and a
 * direct header scan gets that wrong in a way that changes a rendered warp.
 *
 * The def element is then read RAW. Constructing `RubatoDef` would add
 * `intensity`/`lateStart`/`earlyEnd` to the document and respell present values
 * (`"1.0"` → `"1"`) — `RubatoDef.ts:41-73` — which R1 forbids.
 */
function findRubatoDef(
  nameRef: string | null,
  styleName: string | null,
  environment: MpmEnvironment,
  globalEnvironment: MpmEnvironment,
): Element | null {
  if (nameRef === null || nameRef === '') return null;
  const style = findStyleDef(RUBATO_STYLE, styleName, environment, globalEnvironment);
  if (style === null) return null;
  let found: Element | null = null;
  for (const candidate of style.styleDef.getChildElements('rubatoDef').toArray())
    if (attribute('name', candidate)?.getValue() === nameRef) found = candidate;
  return found;
}

/**
 * The per-instruction frame-boundary budget (AD-10 / R25), a [convention] slot §5.2 leaves
 * unfilled.
 *
 * `frameLength="1"` is legal and would put 1.7 M boundaries in the grid for one instruction
 * on one part, and R10's budget is expressed in *instructions*, which does not bound this at
 * all. 1024 is chosen because it clears every musically plausible frame — a 200-quarter
 * piece warped on a sixteenth-note frame needs 800 — while cutting the pathological case by
 * three orders of magnitude. When it bites, a `grid-truncated` note is emitted: the warp is
 * still evaluated correctly everywhere, only the *grid* stops subdividing, so the effect is
 * quadrature resolution rather than a wrong curve.
 */
export const RUBATO_FRAME_BOUNDARY_CAP = 1024;

/** One frame-warped span, in common ticks. */
export interface RubatoSegment {
  readonly startTicks: number;
  readonly endTicks: number;
  /** Frame length in common ticks. Zero-length frames never reach here. */
  readonly frameLengthTicks: number;
  readonly intensity: number;
  readonly lateStart: number;
  readonly earlyEnd: number;
  readonly loop: boolean;
  /** True when the clamped parameters are the identity warp — `δ ≡ 0` exactly (M18). */
  readonly neutral: boolean;
  /**
   * The end of the `⊥` interval this segment opens at its own start, or null where it opens
   * none (MINOR-4).
   *
   * A warp the renderer computes as `NaN` erases every note it touches, and WHERE it touches
   * is the render loop's guard: the whole span under `@loop` or an unusable `@frameLength`,
   * the first frame otherwise. Modelled as an interval rather than as a segment kind because
   * it is a sub-interval of the span, exactly as the `@loop`-off warp itself is.
   */
  readonly poisonedEndTicks: number | null;
}

export interface RubatoCurveNote {
  readonly kind: 'renderer-skip' | 'grid-truncated' | 'renderer-error';
  readonly dateTicks: number;
  readonly detail: string;
}

export interface RubatoCurve {
  readonly segments: readonly RubatoSegment[];
  readonly breakpointsTicks: readonly number[];
  readonly notes: readonly RubatoCurveNote[];
}

/** The neutral rubato curve: `δ ≡ 0` everywhere (R6). */
export function neutralRubatoCurve(): RubatoCurve {
  return { segments: [], breakpointsTicks: [0], notes: [] };
}

/**
 * `RubatoMap.ts:136-141`'s boundary handling, applied before the curve is evaluated.
 *
 * The final rule is the one that matters most: an inverted or empty window is reset to the
 * **full frame**, not to something near it, so `earlyEnd < lateStart` performs as no warp at
 * all rather than as a backwards one.
 */
function clampWindow(lateStart: number, earlyEnd: number): { lateStart: number; earlyEnd: number } {
  let low = lateStart;
  let high = earlyEnd;
  // `NaN` fails all three comparisons and SURVIVES, exactly as it does in the renderer
  // (`RubatoMap.ts:136-141`). Repairing it to 0/1 was this module's first reading and it is a
  // divergence: the renderer carries the NaN into `computeRubatoTransformation`, which then
  // writes `date.perf="NaN"` and the note vanishes from the MIDI export (MINOR-4, R24).
  if (low < 0) low = 0;
  if (high > 1) high = 1;
  if (low >= high) return { lateStart: 0, earlyEnd: 1 };
  return { lateStart: low, earlyEnd: high };
}

/**
 * Read one `<rubato>`, inheriting from its `rubatoDef` where the element is silent.
 *
 * The def is read **raw**: constructing `RubatoDef` would add `intensity`/`lateStart`/
 * `earlyEnd` to the document and respell present values (`"1.0"` → `"1"`), which R1 forbids
 * and which is the founding observation of the expression module's D-A discipline.
 *
 * Returns null exactly where `getRubatoDataOf` does — no `@frameLength` from either source.
 */
type RawRubato =
  | {
      readonly poisoned?: undefined;
      readonly frameLength: number;
      readonly intensity: number;
      readonly lateStart: number;
      readonly earlyEnd: number;
      readonly loop: boolean;
    }
  /** The warp the renderer performs here is `NaN`, so the notes it touches vanish (R24). */
  | {
      readonly poisoned: 'span' | 'warped';
      readonly loop: boolean;
      readonly frameLength?: number;
    };

function readRawRubato(
  element: Element,
  styleName: string | null,
  environment: MpmEnvironment,
  globalEnvironment: MpmEnvironment,
): RawRubato | null {
  const def = findRubatoDef(
    readAttributeValue(element, 'name.ref'),
    styleName,
    environment,
    globalEnvironment,
  );

  // `getRubatoDataOf` tests the attribute's PRESENCE, not its usability:
  // `if (att !== null) rd.x = parseFloat(att.getValue()); else if (def) rd.x = def.getX();`
  // So a present-but-unusable value keeps its `NaN` and the def is NEVER consulted for it
  // (MINOR-4, confirmed at source and through `performMsm`). Reading it as "unusable, so
  // inherit" was this module's first version and it silently performed the def's warp where
  // the renderer performs none at all.
  const resolved = (name: string): { present: boolean; value: number } => {
    const own = readAttributeValue(element, name);
    if (own !== null) return { present: true, value: parseFloat(own) };
    if (def !== null) {
      const inherited = readAttributeValue(def, name);
      if (inherited !== null) return { present: true, value: parseFloat(inherited) };
    }
    return { present: false, value: NaN };
  };

  const frame = resolved('frameLength');
  // `else return null` — no `@frameLength` from either source is the one skip the renderer makes.
  if (!frame.present) return null;

  const loop = readAttributeValue(element, 'loop') === 'true';

  // An UNUSABLE frame length poisons the whole span even without `@loop`: the render loop's
  // guard is `!loop && date >= startDate + frameLength`, and `NaN` fails it, so every note in
  // the span is warped and every warp is `NaN`. Measured: all four notes `date.perf="NaN"`.
  if (Number.isNaN(frame.value)) return { poisoned: 'span', loop };

  // A frame length of exactly 0 with `@loop`: `(date − start) % 0` is `NaN`. Without `@loop`
  // the same guard breaks on the first note and NOTHING is warped, and a NEGATIVE frame length
  // performs the identity on the dates the renderer visits — both measured, and both the
  // existing skip-to-a-neutral-gap reading.
  if (frame.value <= 0) return frame.value === 0 && loop ? { poisoned: 'span', loop } : null;

  const intensityRaw = resolved('intensity');
  const lateStartRaw = resolved('lateStart');
  const earlyEndRaw = resolved('earlyEnd');

  const { lateStart, earlyEnd } = clampWindow(
    lateStartRaw.present ? lateStartRaw.value : 0,
    earlyEndRaw.present ? earlyEndRaw.value : 1,
  );
  // RubatoData's initializers: 1.0 / 0.0 / 1.0 — the identity warp.
  const intensity = intensityRaw.present ? intensityRaw.value : 1;

  if (!Number.isFinite(intensity + lateStart + earlyEnd))
    return { poisoned: 'warped', loop, frameLength: frame.value };

  return {
    frameLength: frame.value,
    intensity,
    lateStart,
    earlyEnd,
    loop,
  };
}

/** Build the performed rubato displacement curve of one scope. */
export function readRubatoSegments(
  view: OrderedMapView | null,
  scaleFactor: number,
  environment: MpmEnvironment,
  globalEnvironment: MpmEnvironment,
): RubatoCurve {
  assertSpanEndRule(RUBATO_MAP, 'same-local-name');

  if (view === null) return neutralRubatoCurve();

  const raws: {
    dateTicks: number;
    element: Element;
    styleName: string | null;
    environment: MpmEnvironment;
    globalEnvironment: MpmEnvironment;
    /** This instruction's own tick scale, which its tick-VALUED `@frameLength` is read in. */
    scaleFactor: number;
  }[] = [];
  for (const [index, entry] of view.entries.entries()) {
    if (entry.element.getLocalName() !== 'rubato') continue;
    if (!Number.isFinite(entry.date)) continue;
    const resolution = resolutionAt(view, index, scaleFactor, environment, globalEnvironment);
    raws.push({
      dateTicks: entry.date * resolution.scaleFactor,
      element: entry.element,
      styleName: optionAt(view.styleNames, index, 'a map view style-name list'),
      environment: resolution.environment,
      globalEnvironment: resolution.globalEnvironment,
      scaleFactor: resolution.scaleFactor,
    });
  }
  if (raws.length === 0) return neutralRubatoCurve();

  const segments: RubatoSegment[] = [];
  const notes: RubatoCurveNote[] = [];
  const breakpoints = new Set<number>([0]);

  // getEndDate scans for the next <rubato> regardless of whether it parses, so a skipped
  // instruction still ends this span.
  // The end is PAIRED with its entry rather than read at `index + 1`. "There is no next
  // entry" is then a VALUE — `+Infinity` — instead of an out-of-range read that the type
  // system had to be told about with `as (typeof xs)[number] | undefined`.
  const endsAt = [...raws.slice(1).map((next) => next.dateTicks), Number.POSITIVE_INFINITY];
  for (const [raw, endTicks] of zipWith(raws, endsAt, (at, ends) => [at, ends] as const)) {
    const parsed = readRawRubato(
      raw.element,
      raw.styleName,
      raw.environment,
      raw.globalEnvironment,
    );
    breakpoints.add(raw.dateTicks);

    if (parsed === null) {
      // Behaviour 2: an unwarped gap, which still gets its breakpoint.
      notes.push({
        kind: 'renderer-skip',
        dateTicks: raw.dateTicks,
        detail:
          'no @frameLength on the element or its rubatoDef — the renderer skips it and the ' +
          'span is unwarped (AD-16/R23)',
      });
      continue;
    }

    if (parsed.poisoned !== undefined) {
      // The warp is `NaN` wherever it applies, so every note it touches gets
      // `date.perf="NaN"` and vanishes from the MIDI export — R24's condition, priced `⊥`
      // (AD-1, AD-33.1). WHERE it applies is the render loop's own guard: the whole span when
      // `@loop` is on or the frame length itself is unusable, the first frame otherwise.
      const frameLengthTicks =
        parsed.frameLength === undefined
          ? Number.POSITIVE_INFINITY
          : parsed.frameLength * raw.scaleFactor;
      const poisonedEnd =
        parsed.poisoned === 'span' || parsed.loop
          ? endTicks
          : Math.min(endTicks, raw.dateTicks + frameLengthTicks);
      segments.push({
        startTicks: raw.dateTicks,
        endTicks,
        frameLengthTicks: Number.isFinite(frameLengthTicks)
          ? frameLengthTicks
          : endTicks - raw.dateTicks,
        intensity: 1,
        lateStart: 0,
        earlyEnd: 1,
        loop: parsed.loop,
        neutral: true,
        poisonedEndTicks: poisonedEnd,
      });
      breakpoints.add(poisonedEnd);
      notes.push({
        kind: 'renderer-error',
        dateTicks: raw.dateTicks,
        detail:
          'an unusable @frameLength, @intensity, @lateStart or @earlyEnd leaves the warp NaN, ' +
          'so every note it touches gets date.perf="NaN" and vanishes from the MIDI export ' +
          '(R24): the interval reads ⊥ rather than an unwarped gap',
      });
      continue;
    }

    const frameLengthTicks = parsed.frameLength * raw.scaleFactor;
    const neutral = parsed.intensity === 1 && parsed.lateStart === 0 && parsed.earlyEnd === 1;

    segments.push({
      startTicks: raw.dateTicks,
      endTicks,
      frameLengthTicks,
      intensity: parsed.intensity,
      lateStart: parsed.lateStart,
      earlyEnd: parsed.earlyEnd,
      loop: parsed.loop,
      neutral,
      poisonedEndTicks: null,
    });

    // Frame boundaries enter the grid: one when @loop is off (the single frame's end), and
    // the capped cycle count when it is on.
    if (!parsed.loop) {
      breakpoints.add(raw.dateTicks + frameLengthTicks);
      continue;
    }
    const span = endTicks - raw.dateTicks;
    const wanted = Number.isFinite(span) ? Math.ceil(span / frameLengthTicks) : 1;
    const frames = Math.min(wanted, RUBATO_FRAME_BOUNDARY_CAP);
    for (let k = 1; k <= frames; ++k) {
      const boundary = raw.dateTicks + k * frameLengthTicks;
      if (boundary >= endTicks) break;
      breakpoints.add(boundary);
    }
    if (wanted > RUBATO_FRAME_BOUNDARY_CAP)
      notes.push({
        kind: 'grid-truncated',
        dateTicks: raw.dateTicks,
        detail:
          `frame boundaries capped at ${String(RUBATO_FRAME_BOUNDARY_CAP)} of ` +
          `${String(wanted)} (AD-10/R25): the warp is still evaluated exactly, only the ` +
          'refinement grid stops subdividing',
      });
  }

  return {
    segments,
    breakpointsTicks: [...breakpoints].sort((a, b) => a - b),
    notes,
  };
}

/** The segment governing `ticks`, right-continuous, or null where nothing warps. */
export function rubatoSegmentAt(curve: RubatoCurve, ticks: number): RubatoSegment | null {
  for (const segment of curve.segments) {
    if (ticks < segment.startTicks) break;
    if (ticks < segment.endTicks) return segment;
  }
  return null;
}

/**
 * `δ(t)` in **common ticks** — the displacement the renderer applies at `t`.
 *
 * Zero outside every segment, zero on the neutral parametrization (exactly, by the M18
 * guard), and zero past the first frame when `@loop` is off.
 */
export function displacementTicksAt(curve: RubatoCurve, ticks: number): number {
  const segment = rubatoSegmentAt(curve, ticks);
  if (segment === null || segment.neutral) return 0;

  const offset = ticks - segment.startTicks;
  // @loop off: the warp applies to the FIRST frame only; the rest of the span is unwarped.
  if (!segment.loop && offset >= segment.frameLengthTicks) return 0;

  const tau = offset % segment.frameLengthTicks;
  const fraction = tau / segment.frameLengthTicks;
  const warped =
    segment.frameLengthTicks *
    (Math.pow(fraction, segment.intensity) * (segment.earlyEnd - segment.lateStart) +
      segment.lateStart);
  return warped - tau;
}

/** `δ(t)` in quarters, which is the unit §5.2's JND is stated in. */
export function displacementQuartersAt(
  curve: RubatoCurve,
  ticks: number,
  ticksPerQuarter: number,
): number {
  return displacementTicksAt(curve, ticks) / ticksPerQuarter;
}

/** The intervals where the renderer's warp is `NaN` — §4's `⊥`, in common ticks (MINOR-4). */
export function rubatoBottomSpans(
  curve: RubatoCurve,
): readonly { readonly startTicks: number; readonly endTicks: number }[] {
  return curve.segments
    .filter((segment) => segment.poisonedEndTicks !== null)
    .map((segment) => ({
      startTicks: segment.startTicks,
      endTicks: segment.poisonedEndTicks as number,
    }));
}

/** Whether `t` falls in a `⊥` interval — the probe the distance takes at each cell's edge. */
export function isRubatoBottomAt(curve: RubatoCurve, ticks: number): boolean {
  const segment = rubatoSegmentAt(curve, ticks);
  return segment !== null && segment.poisonedEndTicks !== null && ticks < segment.poisonedEndTicks;
}
