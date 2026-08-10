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
import { CompensatedSum, integrateAbsolute } from './quadrature.js';
import { displacementTicksAt, type RubatoCurve } from './rubatoCurve.js';
import type { ComparisonWindow } from './window.js';

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
