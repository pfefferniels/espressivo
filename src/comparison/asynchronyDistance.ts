/**
 * The asynchrony deviation density and its integral — DESIGN.md §5.7.
 *
 * `p_asynchrony(t) = d_row(offset_A(t), offset_B(t))` where `d_row` is §4's capped local metric,
 * not a bare difference. This is the one dimension whose density IS `localDistance` rather
 * than an integral over a curve, and the reason is `⊥`: a span the renderer poisons with NaN has no value
 * to subtract, and §4 prices it at `δ_row` from everything and 0 from itself. Feeding it
 * through the same function that prices ordinary offsets keeps the density total over the
 * window (§5.0) and the metric axioms intact.
 *
 * Both curves are step functions, so every cell of the refinement grid is constant and the
 * integral over a cell is `d_row × cell length` — exact, no quadrature error. This dimension's
 * entry in §9.3's per-family epsilon record is therefore 0 in both units.
 *
 * The `step` role is what `localDistance` was built for (§4): curve dimensions integrate and
 * consume only the row's `jnd`; step and event rows use the capped attribute metric.
 */
import { pairwise } from '../prelude/index.js';
import { comparisonRowFor } from './registry.js';
import { CompensatedSum } from './quadrature.js';
import { canonicalLocalDistance } from './registry.js';
import { offsetAt, type AsynchronyCurve } from './asynchronyCurve.js';
import type { ComparisonWindow } from './window.js';
import { IDENTITY_CANONICAL_PAIR, type CanonicalPair } from './decomposition.js';

export interface AsynchronyCell {
  readonly startTicks: number;
  readonly endTicks: number;
  readonly startQuarters: number;
  readonly endQuarters: number;
  readonly mass: number;
  /** True where §4's cap bound this cell — reported through the `capped` note kind. */
  readonly capped: boolean;
  /**
   * `p_asynchrony(t)` in JND per quarter, at a position in quarters (AD-51.1).
   *
   * The integrand this cell's mass was computed from, exposed so AD-19 can refine segment
   * boundaries to the roots of `p_D − τ_D`. `mass` stays the authority — see `DensityCell`.
   */
  readonly densityAt: (quarters: number) => number;
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
 * The offset is read at the cell's left edge, which is sound because the grid carries every
 * breakpoint of both curves: no step falls strictly inside a cell, so the left edge's value is
 * the cell's value throughout. Right continuity (A-B1) makes the left edge the correct probe.
 */
export function asynchronyDistance(
  a: AsynchronyCurve,
  b: AsynchronyCurve,
  window: ComparisonWindow,
  ticksPerQuarter: number,
  canonical: CanonicalPair = IDENTITY_CANONICAL_PAIR,
  jndOverride?: number,
): AsynchronyDistance {
  const registryRow = comparisonRowFor('asynchrony/asynchrony@milliseconds.offset');
  const row = jndOverride === undefined ? registryRow : { ...registryRow, jnd: jndOverride };
  const grid = asynchronyGridTicks(a, b, window, ticksPerQuarter);

  const cells: AsynchronyCell[] = [];
  const total = new CompensatedSum();
  let anyCapped = false;

  for (const [cellStart, cellEnd] of pairwise(grid)) {
    const local = canonicalLocalDistance(
      row,
      offsetAt(a, cellStart),
      offsetAt(b, cellStart),
      canonical,
    );
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
      // Constant across the cell — see this function's note on the left-edge probe.
      densityAt: () => local.distance,
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
