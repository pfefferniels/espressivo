/**
 * C13's cumulative drift: what the two tempo curves do to the clock.
 *
 * A-Q3 compares the curve rather than the millisecond map because cumulative time integrates
 * every earlier difference — two performances agreeing everywhere but one held note diverge in
 * seconds for the rest of the piece. The drift is still the quantity a listener notices, so it
 * ships as a labelled SECONDARY and is not a distance: it enters no `d_k`, no `D`, no table cell.
 *
 * Seconds are `∫ 60 / qbpm(t) dt` over the window in quarters, on the tempo dimension's own
 * refinement grid with the graded mesh the distance uses (AD-28.1), so one curve has one
 * accuracy to reason about.
 *
 * This integrates the DEFINED curve exactly rather than reproducing the renderer's Simpson
 * accumulation: §5.1's non-monotone millisecond map at a skipped instruction would need the
 * renderer's own accumulator, which §9.7 keeps out of the comparison layer. The divergence is
 * confined to documents that trip that quirk.
 */
import { pairwise } from '../prelude/index.js';
import { CompensatedSum, bisectSignChange, gaussLegendre10 } from './quadrature.js';
import { quarterBpmAt, segmentAt, type TempoCurve } from './tempoCurve.js';
import { gradedBoundariesIn } from './tempoDistance.js';

/** §9.3's `cumulativeDrift` block (C13). */
export interface CumulativeDrift {
  readonly secondsA: number;
  readonly secondsB: number;
  /** `secondsA − secondsB`; a DESCRIPTOR, so it negates under the a/b swap (§9.5). */
  readonly difference: number;
  /** `secondsA / secondsB`; inverts under the swap. */
  readonly ratio: number;
  /** The largest absolute divergence of the two clocks anywhere inside the window. */
  readonly maxAbsMs: number;
}

/**
 * The drift over one window, on a grid that already carries every breakpoint of both curves.
 *
 * @param grid the tempo refinement grid in common ticks — the caller's, so that the drift and
 *   the distance see one partition of the window.
 */
export function cumulativeDrift(
  a: TempoCurve,
  b: TempoCurve,
  grid: readonly number[],
  ticksPerQuarter: number,
): CumulativeDrift {
  const secondsA = new CompensatedSum();
  const secondsB = new CompensatedSum();
  let maxAbsSeconds = 0;

  for (const [cellStart, cellEnd] of pairwise(grid)) {
    const secondsPerQuarter = (curve: TempoCurve) => (ticks: number) =>
      60 / quarterBpmAt(curve, ticks);

    // The stationary point of the two clocks' difference is where their INTEGRANDS cross, so
    // the extremum inside a cell is bracketed there rather than sampled for. Without such a
    // point the difference is monotone and its extremes are the edges the loop visits anyway.
    const crossing = bisectSignChange(
      (ticks) => secondsPerQuarter(a)(ticks) - secondsPerQuarter(b)(ticks),
      cellStart,
      cellEnd,
    );

    const probes = crossing === null ? [cellEnd] : [crossing, cellEnd];
    let low = cellStart;
    for (const high of probes) {
      if (!(high > low)) continue;
      secondsA.add(integrateClock(a, low, high, ticksPerQuarter));
      secondsB.add(integrateClock(b, low, high, ticksPerQuarter));
      maxAbsSeconds = Math.max(maxAbsSeconds, Math.abs(secondsA.total - secondsB.total));
      low = high;
    }
  }

  const totalA = secondsA.total;
  const totalB = secondsB.total;
  return {
    secondsA: totalA,
    secondsB: totalB,
    difference: totalA - totalB,
    // Two empty windows take the same time, and `0/0` is not a ratio — the same convention
    // `comparability.lengthRatio` uses for two empty documents, and for the same reason.
    ratio: totalB > 0 ? totalA / totalB : totalA > 0 ? Number.MAX_VALUE : 1,
    maxAbsMs: maxAbsSeconds * 1000,
  };
}

/** `∫ 60/qbpm dt` over one interval of common ticks, in seconds. */
function integrateClock(
  curve: TempoCurve,
  startTicks: number,
  endTicks: number,
  ticksPerQuarter: number,
): number {
  const segment = segmentAt(curve, startTicks);
  const boundaries = segment === null ? [] : gradedBoundariesIn(segment, startTicks, endTicks);
  const points = [startTicks, ...boundaries, endTicks];
  const total = new CompensatedSum();
  for (const [low, high] of pairwise(points))
    total.add(gaussLegendre10((ticks) => 60 / quarterBpmAt(curve, ticks), low, high));
  return total.total / ticksPerQuarter;
}
