/**
 * The dynamics deviation density and its integral — DESIGN.md §5.3.
 *
 * `p_dynamics(t) = |ln volume_A(t) − ln volume_B(t)| / jnd_dynamics`, integrated over the
 * window in quarters, so the unit is JND·quarters as everywhere else.
 *
 * Structurally the same as `tempoDistance`: sorted-union grid in integer lcm-ticks,
 * compensated summation in date order, only the row's `jnd` consumed. What differs is the
 * cell integration. Tempo needs AD-28.1's graded mesh because `u^e` has a boundary layer
 * whose width depends on `e`; the Bézier has no such parameter-dependent layer — it is a
 * fixed-degree polynomial reparametrized by a monotone cubic — so plain GL-10 per cell,
 * with the absolute value resolved at crossings, is the right rule for it.
 *
 * **The curve integrated here is the ideal one** (§5.0 rule 3): `volumeAt` inverts the
 * x-component to machine precision rather than to `tForDate`'s one-tick tolerance. That is
 * what makes GL-10 meaningful — against the renderer's staircase it would be integrating a
 * function with thousands of jump discontinuities.
 */
import { comparisonRowFor } from './registry.js';
import { CompensatedSum, integrateAbsolute } from './quadrature.js';
import { volumeAt, type DynamicsCurve } from './dynamicsCurve.js';
import type { ComparisonWindow } from './window.js';

export interface DynamicsCell {
  readonly startTicks: number;
  readonly endTicks: number;
  readonly startQuarters: number;
  readonly endQuarters: number;
  readonly mass: number;
}

export interface DynamicsDistance {
  readonly distance: number;
  readonly mean: number | null;
  readonly cells: readonly DynamicsCell[];
  readonly jnd: number;
}

/** The sorted, deduplicated union of both curves' breakpoints, clipped to the window. */
export function dynamicsGridTicks(
  a: DynamicsCurve,
  b: DynamicsCurve,
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
 * `d_dynamics` over the window, cell by cell.
 *
 * No structural split points are supplied. Two Bézier segments over the same span *can*
 * cross more than once in principle, and `integrateAbsolute`'s bisection finds only one
 * crossing per sub-interval — but unlike the tempo case there is no closed-form critical
 * point to split on, and §5.0 mandates the bracketing device for the power-versus-power
 * family specifically. The honest position: a multi-crossing dynamics cell is integrated
 * with one crossing resolved, which is exact whenever the difference crosses at most once
 * and slightly low when it does not. This is recorded rather than hidden; if it matters in
 * practice the remedy is the same as tempo's — a structural split, here at the difference's
 * stationary point, which needs a conductor ruling because §5.0 does not specify one.
 */
export function dynamicsDistance(
  a: DynamicsCurve,
  b: DynamicsCurve,
  window: ComparisonWindow,
  ticksPerQuarter: number,
  jndOverride?: number,
): DynamicsDistance {
  const jnd = jndOverride ?? comparisonRowFor('dynamics/dynamics@volume').jnd;
  const grid = dynamicsGridTicks(a, b, window, ticksPerQuarter);

  const cells: DynamicsCell[] = [];
  const total = new CompensatedSum();

  for (let i = 0; i < grid.length - 1; ++i) {
    const cellStart = grid[i];
    const cellEnd = grid[i + 1];

    const difference = (ticks: number) =>
      Math.log(volumeAt(a, ticks)) - Math.log(volumeAt(b, ticks));

    const mass = integrateAbsolute(difference, cellStart, cellEnd) / ticksPerQuarter / jnd;
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
