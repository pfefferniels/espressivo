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
import type { Element } from '../xml/XomTypes.js';
import { attribute } from '../xml/tree.js';
import { RUBATO_MAP, RUBATO_STYLE } from '../mpm/names.js';
import { readAttributeValue, readNumericAttributeValue } from '../expression/attributes.js';
import { findStyleDef } from '../expression/styleScope.js';
import type { MpmEnvironment } from '../expression/mpmTree.js';
import { assertSpanEndRule } from './spanEnds.js';
import type { OrderedMapView } from './document.js';

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
}

export interface RubatoCurveNote {
  readonly kind: 'renderer-skip' | 'grid-truncated';
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
  let low = Number.isFinite(lateStart) ? lateStart : 0;
  let high = Number.isFinite(earlyEnd) ? earlyEnd : 1;
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
function readRawRubato(
  element: Element,
  styleName: string | null,
  environment: MpmEnvironment,
  globalEnvironment: MpmEnvironment,
): {
  frameLength: number;
  intensity: number;
  lateStart: number;
  earlyEnd: number;
  loop: boolean;
} | null {
  const def = findRubatoDef(
    readAttributeValue(element, 'name.ref'),
    styleName,
    environment,
    globalEnvironment,
  );

  const inherited = (name: string): number => {
    const own = readNumericAttributeValue(element, name);
    if (!Number.isNaN(own)) return own;
    if (def === null) return NaN;
    return readNumericAttributeValue(def, name);
  };

  const frameLength = inherited('frameLength');
  if (!Number.isFinite(frameLength) || frameLength <= 0) return null;

  const intensityRaw = inherited('intensity');
  const lateStartRaw = inherited('lateStart');
  const earlyEndRaw = inherited('earlyEnd');

  const { lateStart, earlyEnd } = clampWindow(
    Number.isNaN(lateStartRaw) ? 0 : lateStartRaw,
    Number.isNaN(earlyEndRaw) ? 1 : earlyEndRaw,
  );

  return {
    frameLength,
    // RubatoData's initializers: 1.0 / 0.0 / 1.0 — the identity warp.
    intensity: Number.isNaN(intensityRaw) ? 1 : intensityRaw,
    lateStart,
    earlyEnd,
    // `@loop` is never inherited from the def (§7.16's note on the same attribute).
    loop: readAttributeValue(element, 'loop') === 'true',
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

  const raws: { dateTicks: number; element: Element; styleName: string | null }[] = [];
  for (const [index, entry] of view.entries.entries()) {
    if (entry.element.getLocalName() !== 'rubato') continue;
    if (!Number.isFinite(entry.date)) continue;
    raws.push({
      dateTicks: entry.date * scaleFactor,
      element: entry.element,
      styleName: view.styleNames[index],
    });
  }
  if (raws.length === 0) return neutralRubatoCurve();

  const segments: RubatoSegment[] = [];
  const notes: RubatoCurveNote[] = [];
  const breakpoints = new Set<number>([0]);

  for (const [index, raw] of raws.entries()) {
    // getEndDate scans for the next <rubato> regardless of whether it parses, so a skipped
    // instruction still ends this span.
    const next = raws[index + 1] as (typeof raws)[number] | undefined;
    const endTicks = next?.dateTicks ?? Number.POSITIVE_INFINITY;

    const parsed = readRawRubato(raw.element, raw.styleName, environment, globalEnvironment);
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

    const frameLengthTicks = parsed.frameLength * scaleFactor;
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
