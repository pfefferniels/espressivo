/**
 * The rubato deviation density and its integral — DESIGN.md §5.2.
 *
 * `p_rubato(t) = |δ_A(t) − δ_B(t)| / jnd_rubato`, with `δ` the displacement in quarters and the
 * JND likewise in quarters (1/16 by default). Integrated over the window, the unit is
 * JND·quarters, as everywhere else.
 *
 * The grid carries every frame boundary the curve reader admitted, capped per §5.2/AD-10.
 * Those boundaries matter more here than in the other dimensions: `δ` has a saw-tooth
 * discontinuity at each one — it climbs across the frame and drops back at the wrap — so a cell
 * straddling a boundary would have GL-10 integrating across a jump.
 */
import { pairwise } from '../prelude/index.js';
import { comparisonRowFor, localDistance } from './registry.js';
import { CompensatedSum, integrateCappedAbsolute, powerCriticalPoint } from './quadrature.js';
import {
  displacementTicksAt,
  isRubatoBottomAt,
  rubatoSegmentAt,
  type RubatoCurve,
  type RubatoSegment,
} from './rubatoCurve.js';
import { bottom, valued } from './values.js';
import type { ComparisonWindow } from './window.js';
import { IDENTITY_CANONICAL_PAIR, canonicalValue, type CanonicalPair } from './decomposition.js';

/**
 * Subdivision count for rubato cells — §5.0 rule 2c (AD-33.3b as refined by AD-34.1).
 *
 * 16, matching AD-31's Bézier constant. Emitted alongside the structural split rather than as
 * a fallback for cells whose frames do not align; see the call site for RG-3's numbers.
 */
const RUBATO_FALLBACK_SUBDIVISIONS = 16;

/**
 * The structural split point of a frame-aligned rubato cell — §5.0 rule 2c.
 *
 * Within one shared frame `Δδ(x) = L·[α·x^p − β·x^q + (ls_A − ls_B)]` with
 * `α = ee_A − ls_A`, `β = ee_B − ls_B`. Its derivative has exactly one positive root, so the
 * difference has exactly one interior stationary point and at most two zeros — the same
 * structure §5.0 rule 2 already solves for tempo. Splitting there leaves two monotone
 * branches and makes the existing bisection complete.
 *
 * Arguments are canonically ordered by `(intensity, L·(ee−ls))` smaller-first, for the reason
 * AD-33.2 gives: `Math.pow` is not reciprocal-symmetric, so document order would leak into
 * the reported bits and break R2.
 */
export function rubatoCriticalPointTicks(
  a: RubatoSegment,
  b: RubatoSegment,
  cellStart: number,
  cellEnd: number,
): readonly number[] {
  if (a.neutral || b.neutral) return [];
  if (a.frameLengthTicks !== b.frameLengthTicks) return [];
  const frameLength = a.frameLengthTicks;
  if (!Number.isFinite(frameLength) || frameLength <= 0) return [];
  // Frames must be in phase as well as equal in length, or `x` is not a shared coordinate.
  const phaseA = ((a.startTicks % frameLength) + frameLength) % frameLength;
  const phaseB = ((b.startTicks % frameLength) + frameLength) % frameLength;
  if (phaseA !== phaseB) return [];

  const spanA = a.earlyEnd - a.lateStart;
  const spanB = b.earlyEnd - b.lateStart;
  const [first, second] =
    a.intensity !== b.intensity
      ? a.intensity < b.intensity
        ? [
            { delta: frameLength * spanA, exponent: a.intensity },
            { delta: frameLength * spanB, exponent: b.intensity },
          ]
        : [
            { delta: frameLength * spanB, exponent: b.intensity },
            { delta: frameLength * spanA, exponent: a.intensity },
          ]
      : frameLength * spanA <= frameLength * spanB
        ? [
            { delta: frameLength * spanA, exponent: a.intensity },
            { delta: frameLength * spanB, exponent: b.intensity },
          ]
        : [
            { delta: frameLength * spanB, exponent: b.intensity },
            { delta: frameLength * spanA, exponent: a.intensity },
          ];

  const u = powerCriticalPoint(first.delta, first.exponent, second.delta, second.exponent);
  if (u === null) return [];

  // Map u into every frame the cell touches. The grid already carries frame boundaries, so
  // in practice a cell lies inside one frame — the loop is what makes that an observation
  // rather than an assumption.
  const points: number[] = [];
  const firstFrame = Math.floor((cellStart - a.startTicks) / frameLength);
  const lastFrame = Math.floor((cellEnd - a.startTicks) / frameLength);
  for (let k = firstFrame; k <= lastFrame; ++k) {
    const t = a.startTicks + (k + u) * frameLength;
    if (t > cellStart && t < cellEnd) points.push(t);
  }
  return points;
}

export interface RubatoCell {
  readonly startTicks: number;
  readonly endTicks: number;
  readonly startQuarters: number;
  readonly endQuarters: number;
  readonly mass: number;
  /** True where §4's cap bound this cell — a `⊥` interval, or a difference past `2·δ_row`. */
  readonly capped: boolean;
  /**
   * `p_rubato(t)` in JND per quarter, at a position in QUARTERS (AD-51.1). Exposed rather than
   * recomputed because AD-19 refines segment boundaries to the ROOTS of `p_D − τ_D` and a
   * cell-quantized edge can sit many bars from the crossing. `mass` stays the authority: the
   * aggregation rescales the sampler's shape onto it.
   */
  readonly densityAt: (quarters: number) => number;
}

export interface RubatoDistance {
  readonly distance: number;
  readonly mean: number | null;
  readonly cells: readonly RubatoCell[];
  readonly jnd: number;
  /** True when any cell was capped, i.e. a `⊥` interval or a difference past `2·δ_row`. */
  readonly capped: boolean;
}

/** The sorted, deduplicated union of both curves' breakpoints, clipped to the window. */
export function rubatoGridTicks(
  a: RubatoCurve,
  b: RubatoCurve,
  window: ComparisonWindow,
  ticksPerQuarter: number,
): readonly number[] {
  const startTicks = window.startQuarters * ticksPerQuarter;
  const endTicks = window.endQuarters * ticksPerQuarter;
  if (!(endTicks > startTicks)) return [];

  const points = new Set<number>([startTicks, endTicks]);
  for (const breakpoint of [...a.breakpointsTicks, ...b.breakpointsTicks])
    if (breakpoint > startTicks && breakpoint < endTicks) points.add(breakpoint);

  return [...points].sort((x, y) => x - y);
}

/**
 * `d_rubato` over the window.
 *
 * The displacement is converted from ticks to quarters *before* the difference is taken, so
 * the integrand is already in the JND's unit and the only remaining conversion is the
 * abscissa's — the same `/ ticksPerQuarter` every dimension applies once per cell.
 */
export function rubatoDistance(
  a: RubatoCurve,
  b: RubatoCurve,
  window: ComparisonWindow,
  ticksPerQuarter: number,
  jndOverride?: number,
  canonical: CanonicalPair = IDENTITY_CANONICAL_PAIR,
): RubatoDistance {
  const row = comparisonRowFor('rubato/rubato@frameLength');
  const jnd = jndOverride ?? row.jnd;
  const cap = 2 * row.delta;
  const grid = rubatoGridTicks(a, b, window, ticksPerQuarter);

  const cells: RubatoCell[] = [];
  const total = new CompensatedSum();
  let anyCapped = false;

  for (const [cellStart, cellEnd] of pairwise(grid)) {
    const lengthQuarters = (cellEnd - cellStart) / ticksPerQuarter;

    // MINOR-4 gave this dimension a `⊥` route, so AD-36.2's capped integrator is forced here as
    // for accentuation and pedal: an uncapped value-value integral alongside a `δ`-priced `⊥`
    // breaks the triangle inequality the moment a `⊥` document is the middle term. The `⊥`-ness
    // is decided at the cell's left edge, sound because the grid carries every poisoned
    // interval's end (A-B1).
    const bottomA = isRubatoBottomAt(a, cellStart);
    const bottomB = isRubatoBottomAt(b, cellStart);
    if (bottomA || bottomB) {
      const local = localDistance(
        row,
        bottomA
          ? bottom('renderer-error')
          : valued(displacementTicksAt(a, cellStart) / ticksPerQuarter),
        bottomB
          ? bottom('renderer-error')
          : valued(displacementTicksAt(b, cellStart) / ticksPerQuarter),
      );
      const mass = local.distance * lengthQuarters;
      if (local.capped) anyCapped = true;
      total.add(mass);
      cells.push({
        startTicks: cellStart,
        endTicks: cellEnd,
        startQuarters: cellStart / ticksPerQuarter,
        endQuarters: cellEnd / ticksPerQuarter,
        mass,
        capped: local.capped,
        densityAt: () => local.distance,
      });
      continue;
    }

    const difference = (ticks: number) =>
      canonicalValue(canonical.a, displacementTicksAt(a, ticks) / ticksPerQuarter) -
      canonicalValue(canonical.b, displacementTicksAt(b, ticks) / ticksPerQuarter);

    // §5.0 rule 2c: structural split for frame-aligned cells, fixed subdivision otherwise.
    const segmentA = rubatoSegmentAt(a, cellStart);
    const segmentB = rubatoSegmentAt(b, cellStart);
    // AD-34.1: emit BOTH sets, not one or the other. With AD-33.3a's half-open probe in place,
    // RG-3 measured u* alone leaving 4 of 3906 pairs wrong by >0.1 % (worst 1.400e-3) where
    // K=16 alone left 0 (worst 2.718e-4). Both worst cases are `intensity = 0.25`, whose x^0.25
    // has an infinite slope at x = 0 — a boundary layer a two-panel structural split leaves
    // inside one GL-10 panel and a sixteen-panel mesh confines. Emitting both keeps rule 2c's
    // structural claim and takes the residual to 0 of 3906, worst 2.718e-4.
    const splitPoints: number[] = [];
    if (segmentA !== null && segmentB !== null) {
      splitPoints.push(...rubatoCriticalPointTicks(segmentA, segmentB, cellStart, cellEnd));
      for (let k = 1; k < RUBATO_FALLBACK_SUBDIVISIONS; ++k)
        splitPoints.push(cellStart + ((cellEnd - cellStart) * k) / RUBATO_FALLBACK_SUBDIVISIONS);
    }

    const integral = integrateCappedAbsolute(
      (ticks) => difference(ticks) / jnd,
      cap,
      cellStart,
      cellEnd,
      splitPoints,
    );
    const mass = integral.mass / ticksPerQuarter;
    if (integral.capped) anyCapped = true;
    total.add(mass);
    cells.push({
      startTicks: cellStart,
      endTicks: cellEnd,
      startQuarters: cellStart / ticksPerQuarter,
      endQuarters: cellEnd / ticksPerQuarter,
      mass,
      capped: integral.capped,
      densityAt: (quarters) =>
        Math.min(Math.abs(difference(quarters * ticksPerQuarter)) / jnd, cap),
    });
  }

  const length = window.endQuarters - window.startQuarters;
  return {
    distance: total.total,
    mean: length > 0 ? total.total / length : null,
    cells,
    jnd,
    capped: anyCapped,
  };
}
