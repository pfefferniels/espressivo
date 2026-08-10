/**
 * The rubato deviation density and its integral — DESIGN.md §5.2.
 *
 * `p_rubato(t) = |δ_A(t) − δ_B(t)| / jnd_rubato`, with `δ` the displacement in **quarters**
 * and the JND likewise in quarters (1/16 by default). Integrated over the window, the unit
 * is JND·quarters, as everywhere else.
 *
 * The grid carries every frame boundary the curve reader admitted, capped per §5.2/AD-10.
 * Those boundaries matter more here than in the other dimensions: `δ` has a **saw-tooth
 * discontinuity** at each one — it climbs across the frame and drops back at the wrap — so a
 * cell that straddled a boundary would have GL-10 integrating across a jump. Putting every
 * boundary in the grid is what keeps each cell smooth.
 */
import { comparisonRowFor } from './registry.js';
import { CompensatedSum, integrateAbsolute, powerCriticalPoint } from './quadrature.js';
import {
  displacementTicksAt,
  rubatoSegmentAt,
  type RubatoCurve,
  type RubatoSegment,
} from './rubatoCurve.js';
import type { ComparisonWindow } from './window.js';

/**
 * Fallback subdivision where the two sides' frames do not align — §5.0 rule 2c (AD-33.3b).
 *
 * 16, matching AD-31's Bézier constant. It is a fallback and not the primary device: measured
 * over 3906 legal frame-aligned rubato pairs, fixed subdivision ALONE leaves 226 pairs wrong
 * by >0.1 % even at K=16 (and 62 at K=32), where the structural split leaves 10. Rubato needs
 * the structural device; subdivision only covers the case where there is no shared frame to
 * be structural about.
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
function rubatoCriticalPointTicks(
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
}

export interface RubatoDistance {
  readonly distance: number;
  readonly mean: number | null;
  readonly cells: readonly RubatoCell[];
  readonly jnd: number;
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
): RubatoDistance {
  const jnd = jndOverride ?? comparisonRowFor('rubato/rubato@frameLength').jnd;
  const grid = rubatoGridTicks(a, b, window, ticksPerQuarter);

  const cells: RubatoCell[] = [];
  const total = new CompensatedSum();

  for (let i = 0; i < grid.length - 1; ++i) {
    const cellStart = grid[i];
    const cellEnd = grid[i + 1];

    const difference = (ticks: number) =>
      (displacementTicksAt(a, ticks) - displacementTicksAt(b, ticks)) / ticksPerQuarter;

    // §5.0 rule 2c: structural split for frame-aligned cells, fixed subdivision otherwise.
    const segmentA = rubatoSegmentAt(a, cellStart);
    const segmentB = rubatoSegmentAt(b, cellStart);
    const splitPoints: number[] =
      segmentA === null || segmentB === null
        ? []
        : [...rubatoCriticalPointTicks(segmentA, segmentB, cellStart, cellEnd)];
    if (splitPoints.length === 0 && segmentA !== null && segmentB !== null)
      for (let k = 1; k < RUBATO_FALLBACK_SUBDIVISIONS; ++k)
        splitPoints.push(cellStart + ((cellEnd - cellStart) * k) / RUBATO_FALLBACK_SUBDIVISIONS);

    const mass =
      integrateAbsolute(difference, cellStart, cellEnd, splitPoints) / ticksPerQuarter / jnd;
    total.add(mass);
    cells.push({
      startTicks: cellStart,
      endTicks: cellEnd,
      startQuarters: cellStart / ticksPerQuarter,
      endQuarters: cellEnd / ticksPerQuarter,
      mass,
    });
  }

  const length = window.endQuarters - window.startQuarters;
  return {
    distance: total.total,
    mean: length > 0 ? total.total / length : null,
    cells,
    jnd,
  };
}
