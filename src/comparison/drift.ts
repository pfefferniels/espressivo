/**
 * C13's cumulative drift: what the two tempo curves do to the CLOCK.
 *
 * `d_tempo` is a statement about the tempo curve, and A-Q3's whole argument for comparing the
 * curve rather than the millisecond map is that cumulative time integrates every earlier
 * difference — two performances that agree everywhere except one held note diverge in seconds
 * for the rest of the piece, and a millisecond metric reports that as a difference at every
 * subsequent moment. The drift is nevertheless the quantity a listener notices and a scholar
 * quotes ("this roll runs forty seconds long"), so it ships as a SECONDARY, plainly labelled,
 * and it is not a distance: it enters no `d_k`, no `D` and no table cell.
 *
 * Seconds are `∫ 60 / qbpm(t) dt` over the window in quarters, integrated on the tempo
 * dimension's own refinement grid with the same graded mesh the distance uses (AD-28.1) — two
 * meshes over one curve would be two accuracies to reason about, and the second one would be
 * nobody's measured figure.
 *
 * **This is the exact integral of the DEFINED curve, not a reproduction of the renderer's own
 * Simpson accumulation.** §5.1 reproduces the renderer's absolute-time quirk — its
 * non-monotone millisecond map at a skipped instruction — in the drift secondary and nowhere
 * else, and doing that faithfully means running the renderer's own accumulator, which the
 * comparison layer may not import (§9.7's zone). The divergence is confined to documents that
 * trip that quirk and is reported here rather than left for a reader to discover.
 */
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

  for (let i = 0; i < grid.length - 1; ++i) {
    const cellStart = grid[i];
    const cellEnd = grid[i + 1];
    const secondsPerQuarter = (curve: TempoCurve) => (ticks: number) =>
      60 / quarterBpmAt(curve, ticks);

    // The stationary point of the two clocks' difference is where their INTEGRANDS cross, so
    // the extremum inside a cell is bracketed there rather than sampled for. Outside such a
    // point the difference is monotone in the cell and its extremes are the two edges, which
    // the loop visits anyway.
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
  for (let i = 0; i < points.length - 1; ++i)
    total.add(
      gaussLegendre10((ticks) => 60 / quarterBpmAt(curve, ticks), points[i], points[i + 1]),
    );
  return total.total / ticksPerQuarter;
}
