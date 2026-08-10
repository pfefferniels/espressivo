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
import { dynamicsSegmentAt, volumeAt, type DynamicsCurve } from './dynamicsCurve.js';
import type { ComparisonWindow } from './window.js';

/**
 * The subdivision count for a cell where BOTH sides are live Bézier transitions —
 * **16**, per AD-31, which supersedes AD-30's 4.
 *
 * Fixed and equal: deterministic and structure-blind, in the graded mesh's spirit. There is
 * no closed-form critical point for a Bézier pair the way there is for power-vs-power tempo
 * (§5.0 rule 2), so completeness is bought by subdividing rather than by solving, and
 * `integrateAbsolute` resolves one crossing per sub-interval.
 *
 * **16 rather than 4 because 4 was measured insufficient.** AD-30 set 4 on the argument that
 * the smoothstep's bounded curvature makes three crossings inside one quarter-cell
 * impossible. That argument lives in `t`; the clustering lives in `x`, after the monotone
 * reparametrization, and strong protraction pushes crossings together there. On an ordinary
 * non-degenerate pair — `40→80` at `curvature 0.9, protraction 0.9` against `38→84` at
 * `curvature 0, protraction 0.9`, control points in range and `x(t)` monotone — the log
 * difference crosses at `x = 0.598, 0.914, 0.984`, the last two 0.07 apart and inside one
 * quarter. Measured against a 4·10⁵-point Simpson reference:
 *
 * | K | relative error |
 * |---|---|
 * | 1, 2, 4 | 6.5·10⁻² |
 * | 8 | 4.8·10⁻² |
 * | **16** | **2.7·10⁻⁸** |
 *
 * The cost is confined to cells where both sides are transitions; every constant-vs-anything
 * cell is untouched.
 */
const BEZIER_PAIR_SUBDIVISIONS = 16;

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
 * **Bézier-pair cells are subdivided** (AD-30). Two Bézier segments over one span can cross
 * more than once, and `integrateAbsolute` resolves only one crossing per sub-interval, so a
 * single-interval reading integrates such a cell slightly LOW — the absolute value is
 * evaluated with the wrong sign over part of it. Unlike the power-vs-power tempo family
 * there is no closed-form critical point to split on, so the ruling buys completeness by
 * fixed subdivision instead: any cell where BOTH sides are live transitions is cut into
 * {@link BEZIER_PAIR_SUBDIVISIONS} equal pieces before integration. Cost is confined to
 * those cells; every constant-vs-anything cell is untouched.
 *
 * The count is {@link BEZIER_PAIR_SUBDIVISIONS}, whose doc carries the measurement that set
 * it. Residual risk: a pair crossing three or more times inside a SIXTEENTH of a cell would
 * still be under-resolved. That is not argued away here — the same style of argument is what
 * AD-30 got wrong — it is simply far outside anything the measured sweep produced, and the
 * quadrature-level test pins the sweep so a future change to the constant has to face it.
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

    // AD-30: subdivide only where both sides are live transitions. The segment governing the
    // cell is the one at its left edge — the grid carries every breakpoint of both curves,
    // so no segment boundary falls strictly inside a cell.
    const bothBezier =
      dynamicsSegmentAt(a, cellStart)?.kind === 'bezier' &&
      dynamicsSegmentAt(b, cellStart)?.kind === 'bezier';
    const splitPoints: number[] = [];
    if (bothBezier)
      for (let k = 1; k < BEZIER_PAIR_SUBDIVISIONS; ++k)
        splitPoints.push(cellStart + ((cellEnd - cellStart) * k) / BEZIER_PAIR_SUBDIVISIONS);

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
