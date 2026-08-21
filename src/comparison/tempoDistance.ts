/**
 * The tempo deviation density and its integral — DESIGN.md §5.1 and §5.0's refinement grid.
 *
 * `p_tempo(t) = |g_A(t) − g_B(t)| / jnd_tempo` with `g = ln qbpm`, and
 * `d_tempo = ∫ p_tempo dt` over the comparison window in quarters, so the unit is
 * JND·quarters — additive and length-dependent, exactly as §9.3's `distance` field says.
 *
 * Only the row's `jnd` is consumed here, never `localDistance`: summing the attribute-level
 * metric over `@bpm` and `@transition.to` would double-count and lose the span the difference
 * holds for. `localDistance` belongs to the edit path and the step rows (§4).
 *
 * §5.0's refinement grid is the sorted union of both documents' breakpoints for the dimension,
 * deduplicated exactly in integer lcm-ticks — which is why everything below is in common ticks
 * and only the measure is converted to quarters: two breakpoints that are the same beat must
 * compare equal, and float quarters would not.
 *
 * Transition *ends* enter the grid only where a transition is actually performed (AD-8): a
 * trailing instruction's span runs to `MAX_VALUE` and the curve reader has already collapsed it
 * to a constant, so no synthetic breakpoint is inserted at the window end.
 */
import { filterMap, pairwise } from '../prelude/index.js';
import { comparisonRowFor } from './registry.js';
import {
  CompensatedSum,
  gradedPanelBounds,
  integrateAbsolute,
  powerCriticalPoint,
} from './quadrature.js';
import { quarterBpmAt, segmentAt, type TempoCurve, type TempoSegment } from './tempoCurve.js';
import type { ComparisonWindow } from './window.js';
import { IDENTITY_CANONICAL_PAIR, canonicalValue, type CanonicalPair } from './decomposition.js';

/** One cell of the refinement grid, with the mass it carries. */
export interface TempoCell {
  readonly startTicks: number;
  readonly endTicks: number;
  readonly startQuarters: number;
  readonly endQuarters: number;
  /** JND·quarters contributed by this cell. */
  readonly mass: number;
  /**
   * `p_tempo(t)` in JND per quarter, at a position in QUARTERS (AD-51.1). Exposed rather than
   * recomputed because AD-19 refines segment boundaries to the ROOTS of `p_D − τ_D` and a
   * cell-quantized edge can sit many bars from the crossing. `mass` stays the authority: the
   * aggregation rescales the sampler's shape onto it.
   */
  readonly densityAt: (quarters: number) => number;
}

export interface TempoDistance {
  /** `d_tempo` in JND·quarters. */
  readonly distance: number;
  /** `d_tempo / L`, the length-normalized headline, or null for an empty window. */
  readonly mean: number | null;
  readonly cells: readonly TempoCell[];
  readonly jnd: number;
}

/**
 * The sorted, deduplicated union of both curves' breakpoints, clipped to the window.
 *
 * Integer ticks throughout, so `Set` deduplication is exact. The window bounds are always
 * present, so the returned array is a partition of `[start, end]` whenever it has ≥ 2 entries.
 */
export function refinementGridTicks(
  a: TempoCurve,
  b: TempoCurve,
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
 * The graded-mesh panel boundaries of one transition, in the transition's own u-coordinate,
 * intersected with a cell.
 *
 * When the other document's breakpoint splits a transition, the cell covers only part of it, and
 * the mesh must still be graded against the transition's `[t0, t1]`: the grading tracks that
 * transition's boundary layer, which sits at the transition's own `u = 1`, not at the cell's
 * edge. Grading in the cell's coordinate would put the panels in the wrong place and lose the
 * accuracy the mesh was adopted for (AD-28.1).
 *
 * Exported for §5.1's cumulative-drift secondary (C13), which integrates `60/qbpm` over the same
 * cells: two meshes over one curve would be two accuracies to reason about.
 */
export function gradedBoundariesIn(
  segment: TempoSegment,
  cellStart: number,
  cellEnd: number,
): readonly number[] {
  if (segment.kind !== 'power') return [];
  const span = segment.endTicks - segment.startTicks;
  if (!Number.isFinite(span) || span <= 0) return [];

  // Shared with `integrateGradedPower` (MINOR-3), so an edit to one cannot silently diverge.
  // The two ENDS of the unit mesh are 0 and 1 — the segment's own edges, already grid points —
  // so only the interior fractions are contributed, which is what the `slice` says.
  return filterMap(gradedPanelBounds(segment.exponent).slice(1, -1), (fraction) => {
    const t = segment.startTicks + fraction * span;
    return t > cellStart && t < cellEnd ? t : null;
  });
}

/**
 * The two power segments in a canonical order — AD-33.2's symmetry repair.
 *
 * Sorted by `(exponent, Δqbpm)`, smaller first. Both keys are needed: two segments can share an
 * exponent and differ only in their span, and a total order is what makes the downstream
 * `Math.pow` call independent of which document was passed as `a`.
 */
function orderPowerSegments(
  a: Extract<TempoSegment, { kind: 'power' }>,
  b: Extract<TempoSegment, { kind: 'power' }>,
): readonly [Extract<TempoSegment, { kind: 'power' }>, Extract<TempoSegment, { kind: 'power' }>] {
  if (a.exponent !== b.exponent) return a.exponent < b.exponent ? [a, b] : [b, a];
  const deltaA = a.qbpm1 - a.qbpm0;
  const deltaB = b.qbpm1 - b.qbpm0;
  return deltaA <= deltaB ? [a, b] : [b, a];
}

/**
 * Where the difference of two power segments can turn — §5.0 rule 2's `u*`, mapped from the
 * shared `u` of whichever segment the cell sits in onto the tick axis.
 *
 * Only meaningful when both sides are transitions over the *same* span; when they are not,
 * their breakpoints are already grid points and each cell sees at most one transition
 * developing against a constant, where the difference is monotone and needs no split.
 */
function criticalPointTicks(
  a: TempoSegment,
  b: TempoSegment,
  cellStart: number,
  cellEnd: number,
): readonly number[] {
  if (a.kind !== 'power' || b.kind !== 'power') return [];
  if (a.startTicks !== b.startTicks || a.endTicks !== b.endTicks) return [];
  const span = a.endTicks - a.startTicks;
  if (!Number.isFinite(span) || span <= 0) return [];

  // CANONICAL ORDER (AD-33.2). Passing the segments in document order breaks R2's bit-exact
  // symmetry: swapping the documents computes (p·Δ_a/(q·Δ_b))^{1/(q−p)} instead of
  // (q·Δ_b/(p·Δ_a))^{1/(p−q)}, algebraically equal and NOT equal in IEEE754 —
  // separately-rounded reciprocals, and Math.pow is not reciprocal-symmetric. A 400 000-set
  // sweep found 11.7 % of non-null results differing by one ulp, which moves the split point,
  // hence the GL-10 abscissae, hence the reported bits. Ordering by (exponent, Δqbpm)
  // smaller-first makes the call independent of which document is `a`; the same sweep then
  // gives 0 asymmetric results.
  const [first, second] = orderPowerSegments(a, b);
  const u = powerCriticalPoint(
    first.qbpm1 - first.qbpm0,
    first.exponent,
    second.qbpm1 - second.qbpm0,
    second.exponent,
  );
  if (u === null) return [];
  const t = a.startTicks + u * span;
  return t > cellStart && t < cellEnd ? [t] : [];
}

/**
 * `d_tempo` over the window, cell by cell.
 *
 * The per-cell integral is taken on the tick axis and divided by `ticksPerQuarter` once at the
 * end of each cell rather than by converting the abscissa: `∫|f| dt_quarters =
 * (∫|f| dt_ticks) / ticksPerQuarter` exactly, and this keeps every abscissa an integer tick so
 * the grid's exactness survives into the quadrature.
 *
 * Cells are summed with compensation in ascending date order (R2), so the total mirrors
 * bit-exactly under swapping the documents — `|g_A − g_B|` is symmetric pointwise and the grid
 * is a sorted union.
 */
export function tempoDistance(
  a: TempoCurve,
  b: TempoCurve,
  window: ComparisonWindow,
  ticksPerQuarter: number,
  jndOverride?: number,
  canonical: CanonicalPair = IDENTITY_CANONICAL_PAIR,
): TempoDistance {
  const jnd = jndOverride ?? comparisonRowFor('tempo/tempo@bpm').jnd;
  const grid = refinementGridTicks(a, b, window, ticksPerQuarter);

  const cells: TempoCell[] = [];
  const total = new CompensatedSum();

  for (const [cellStart, cellEnd] of pairwise(grid)) {
    // The segment governing the cell is the one at its left edge: the grid is built from
    // every breakpoint of both curves, so no segment boundary falls strictly inside a cell.
    const segmentA = segmentAt(a, cellStart);
    const segmentB = segmentAt(b, cellStart);

    const difference = (ticks: number) =>
      canonicalValue(canonical.a, Math.log(quarterBpmAt(a, ticks))) -
      canonicalValue(canonical.b, Math.log(quarterBpmAt(b, ticks)));

    const splitPoints = [
      ...(segmentA === null ? [] : gradedBoundariesIn(segmentA, cellStart, cellEnd)),
      ...(segmentB === null ? [] : gradedBoundariesIn(segmentB, cellStart, cellEnd)),
      ...(segmentA === null || segmentB === null
        ? []
        : criticalPointTicks(segmentA, segmentB, cellStart, cellEnd)),
    ];

    const tickIntegral = integrateAbsolute(difference, cellStart, cellEnd, splitPoints);
    const mass = tickIntegral / ticksPerQuarter / jnd;

    total.add(mass);
    cells.push({
      startTicks: cellStart,
      endTicks: cellEnd,
      startQuarters: cellStart / ticksPerQuarter,
      endQuarters: cellEnd / ticksPerQuarter,
      mass,
      densityAt: (quarters) => Math.abs(difference(quarters * ticksPerQuarter)) / jnd,
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
