/**
 * AD-27.8's scape: the aggregate difference at every position AND every timescale at once.
 *
 * survey-lit's §6.0 verdict promoted this from a stretch goal to a committed deliverable because
 * it is central to the field's practice — Sapp's timescape is how a musicologist SEES that two
 * readings agree bar by bar and diverge over the phrase, or the reverse. The object is a
 * triangle: one cell per (start, size) sub-window, `B(B+1)/2` of them for `B` bins.
 *
 * ## Prefix sums, and a binning that conserves mass EXACTLY
 *
 * `p_D` is a MEASURE, so its mass over `[a, b)` is additive in the interval: bin the window
 * once, take running totals, and every cell is one subtraction. That is `O(B)` work for `O(B²)`
 * cells — but the reason to write it this way is not the arithmetic. A reader of a scape
 * compares a phrase-length cell against the bars beneath it, so a triangle whose rows do not add
 * up is unreadable in exactly the way it is read.
 *
 * The binning is therefore NOT `aggregate.massIn` per bin, and the difference was measured
 * rather than assumed: that function apportions a partly-covered cell by integrating the
 * dimension's own sampler over the overlap, and GL-10 over two halves is not GL-10 over the
 * whole, so the binned total came out **0.05 % below `aggregate.distance`** on the Telemann pair
 * at 8 bins — and by a different amount at every other bin count, which is what identifies
 * quadrature rather than an edge convention. Here each density CELL is apportioned across the
 * bins it touches and the shares are then RESCALED to the cell's own `mass`, which is the
 * authority (`aggregate.ts`'s own shape-versus-scale rule, one level further out). The bins of
 * one cell then sum to that cell exactly, the bins of one dimension to `d_k`, and the whole
 * triangle's top cell to `D`.
 *
 * ## Layout
 *
 * `cells` is row-major over SIZES, smallest first: row `s` (`s = 1 … B`, in bins) holds the
 * `B − s + 1` sub-windows of that size in ascending start order, so
 *
 *     index(s, start) = (s − 1)·B − (s − 1)(s − 2)/2 + start
 *
 * and the very last entry is the whole window — which is `D` itself, and is pinned as such.
 * Written out because a triangular packing that a consumer has to reverse-engineer is a
 * different kind of defect from a wrong number.
 */
import type { DimensionDensity, DimensionWeights } from './aggregate.js';
import { CompensatedSum, gaussLegendre10 } from './quadrature.js';
import { COMPARISON_DIMENSIONS } from './registry.js';

/** §9.4's ceiling on `scape.bins`: `256` bins is `32 896` cells, which a report can carry. */
export const SCAPE_MAX_BINS = 256;

export interface Scape {
  readonly bins: number;
  /** `B(B+1)/2` values in JND·quarters, laid out as the module doc describes. */
  readonly cells: readonly number[];
}

/** The index of the `(size, start)` cell — exported so a consumer never re-derives the packing. */
export function scapeIndex(bins: number, size: number, start: number): number {
  return (size - 1) * bins - ((size - 1) * (size - 2)) / 2 + start;
}

/**
 * The aggregate scape of one comparison.
 *
 * The binned quantity is `Σ_k ω_k p_k` — the same aggregate density §7's segments are cut out
 * of, so a scape cell and a segment mass are the same units and the same measure. Bins are
 * equal in SCORE TIME, which is the abscissa every distance in this module is quoted in.
 */
export function scapeOf(
  densities: readonly DimensionDensity[],
  weights: DimensionWeights,
  startQuarters: number,
  endQuarters: number,
  bins: number,
): Scape {
  const count = Math.min(SCAPE_MAX_BINS, Math.max(1, Math.trunc(bins)));
  const length = endQuarters - startQuarters;

  // A zero-length window has no positions to bin. Every cell is 0, which is the same answer the
  // aggregate gives it (§9.6's degenerate shape) rather than a division by zero.
  const width = length > 0 ? length / count : 0;
  const byDimension = new Map(densities.map((density) => [density.dimension, density]));

  // The bin EDGES, with the last one pinned at the window end: a rounding in `start + i·width`
  // must not leave a sliver of the window outside the triangle.
  const edges = Array.from({ length: count + 1 }, (_unused, bin) =>
    bin === count ? endQuarters : startQuarters + bin * width,
  );

  const perBin = new Array<number>(count).fill(0);
  for (const dimension of COMPARISON_DIMENSIONS) {
    const density = byDimension.get(dimension);
    if (density === undefined) continue;
    const weight = weights[dimension];
    if (weight === 0) continue;
    for (const [bin, mass] of binnedMass(density, edges).entries()) perBin[bin] += weight * mass;
  }

  // Running totals: `prefix[i]` is the mass in `[start, edges[i])`.
  const prefix = new Array<number>(count + 1).fill(0);
  const running = new CompensatedSum();
  for (let bin = 0; bin < count; ++bin) {
    running.add(perBin[bin]);
    prefix[bin + 1] = running.total;
  }

  const cells = new Array<number>((count * (count + 1)) / 2).fill(0);
  for (let size = 1; size <= count; ++size)
    for (let start = 0; start + size <= count; ++start)
      cells[scapeIndex(count, size, start)] = prefix[start + size] - prefix[start];

  return { bins: count, cells };
}

/**
 * One dimension's mass per bin, conserving `d_k` exactly.
 *
 * Cells are apportioned by the SHAPE their sampler gives and then rescaled to the SCALE their
 * `mass` field carries, which is `aggregate.ts`'s own rule for the same reason it has it: a cell
 * whose sampled shares did not sum back to its mass would move mass between bins without any
 * dimension having reported a different number. A cell with no sampler is apportioned by LENGTH,
 * which is the uniform reading and sums back just as exactly.
 *
 * Atoms are placed the way §5.0 places them: a point mass in the bin it OPENS (right-continuity,
 * A-B1/R27) with the LAST bin closed at the window end so an atom exactly there is not lost, and
 * a spread pair (AD-7) apportioned over the bins its interval covers.
 */
function binnedMass(density: DimensionDensity, edges: readonly number[]): readonly number[] {
  const count = edges.length - 1;
  const bins = new Array<number>(count).fill(0);
  if (count <= 0) return bins;

  for (const cell of density.cells) {
    if (!(cell.endQuarters > cell.startQuarters)) continue;
    const shares = new Array<number>(count).fill(0);
    let total = 0;
    for (let bin = 0; bin < count; ++bin) {
      const low = Math.max(cell.startQuarters, edges[bin]);
      const high = Math.min(cell.endQuarters, edges[bin + 1]);
      if (!(high > low)) continue;
      const sampler = cell.densityAt;
      const share = sampler === null ? high - low : Math.abs(gaussLegendre10(sampler, low, high));
      shares[bin] = share;
      total += share;
    }
    if (total <= 0) continue;
    for (let bin = 0; bin < count; ++bin)
      if (shares[bin] !== 0) bins[bin] += (cell.mass * shares[bin]) / total;
  }

  for (const atom of density.atoms) {
    if (atom.endQuarters === atom.startQuarters) {
      const bin = binOf(edges, atom.startQuarters);
      if (bin >= 0) bins[bin] += atom.mass;
      continue;
    }
    const shares = new Array<number>(count).fill(0);
    let total = 0;
    for (let bin = 0; bin < count; ++bin) {
      const low = Math.max(atom.startQuarters, edges[bin]);
      const high = Math.min(atom.endQuarters, edges[bin + 1]);
      if (!(high > low)) continue;
      shares[bin] = high - low;
      total += high - low;
    }
    if (total <= 0) {
      const bin = binOf(edges, atom.startQuarters);
      if (bin >= 0) bins[bin] += atom.mass;
      continue;
    }
    for (let bin = 0; bin < count; ++bin)
      if (shares[bin] !== 0) bins[bin] += (atom.mass * shares[bin]) / total;
  }

  return bins;
}

/** The bin a point belongs to: half-open, with the LAST bin closed at the window end. */
function binOf(edges: readonly number[], quarters: number): number {
  const count = edges.length - 1;
  if (quarters < edges[0] || quarters > edges[count]) return -1;
  for (let bin = 0; bin < count; ++bin)
    if (quarters < edges[bin + 1] || bin === count - 1) return bin;
  return -1;
}
