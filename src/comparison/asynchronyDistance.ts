/**
 * The asynchrony deviation density and its integral — DESIGN.md §5.7.
 *
 * `p_asynchrony(t) = d_row(offset_A(t), offset_B(t))` where `d_row` is §4's **capped local
 * metric**, not a bare difference. This is the one W2 dimension that uses `localDistance`
 * rather than integrating a curve, and the reason is `⊥`: a span the renderer poisons with
 * NaN has no value to subtract, and §4 prices it at `δ_row` from everything and 0 from
 * itself. Feeding it through the same function that prices ordinary offsets is what keeps
 * the density total over the window (§5.0) and the metric axioms intact.
 *
 * Both curves are step functions, so every cell of the refinement grid is constant and the
 * integral over a cell is `d_row × cell length` — **exact**, no quadrature error. This
 * dimension's entry in §9.3's per-family epsilon record is therefore 0 in both units.
 *
 * The `step` role is what `localDistance` was built for (§4's own wording, and w2a's note):
 * curve dimensions integrate and consume only the row's `jnd`; step and event rows use the
 * capped attribute metric.
 */
import { comparisonRowFor } from './registry.js';
import { CompensatedSum } from './quadrature.js';
import { localDistance } from './registry.js';
import { offsetAt, type AsynchronyCurve } from './asynchronyCurve.js';
import type { ComparisonWindow } from './window.js';

export interface AsynchronyCell {
  readonly startTicks: number;
  readonly endTicks: number;
  readonly startQuarters: number;
  readonly endQuarters: number;
  readonly mass: number;
  /** True where §4's cap bound this cell — reported through the `capped` note kind. */
  readonly capped: boolean;
}

export interface AsynchronyDistance {
  readonly distance: number;
  readonly mean: number | null;
  readonly cells: readonly AsynchronyCell[];
  readonly jnd: number;
  /** True when any cell was capped, i.e. a `⊥` span or a difference past `2·δ_row`. */
  readonly capped: boolean;
}

/** The sorted, deduplicated union of both curves' breakpoints, clipped to the window. */
export function asynchronyGridTicks(
  a: AsynchronyCurve,
  b: AsynchronyCurve,
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
 * `d_asynchrony` over the window — exact, cell by cell.
 *
 * The offset is read at the cell's **left edge**, which is sound precisely because the grid
 * carries every breakpoint of both curves: no step falls strictly inside a cell, so the left
 * edge's value is the cell's value throughout. Right-continuity (A-B1) is what makes the
 * left edge the correct probe.
 */
export function asynchronyDistance(
  a: AsynchronyCurve,
  b: AsynchronyCurve,
  window: ComparisonWindow,
  ticksPerQuarter: number,
): AsynchronyDistance {
  const row = comparisonRowFor('asynchrony/asynchrony@milliseconds.offset');
  const grid = asynchronyGridTicks(a, b, window, ticksPerQuarter);

  const cells: AsynchronyCell[] = [];
  const total = new CompensatedSum();
  let anyCapped = false;

  for (let i = 0; i < grid.length - 1; ++i) {
    const cellStart = grid[i];
    const cellEnd = grid[i + 1];

    const local = localDistance(row, offsetAt(a, cellStart), offsetAt(b, cellStart));
    const lengthQuarters = (cellEnd - cellStart) / ticksPerQuarter;
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
    });
  }

  const length = window.endQuarters - window.startQuarters;
  return {
    distance: total.total,
    mean: length > 0 ? total.total / length : null,
    cells,
    jnd: row.jnd,
    capped: anyCapped,
  };
}
