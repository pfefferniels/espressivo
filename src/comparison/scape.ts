/**
 * AD-27.8's scape: the aggregate difference at every position AND every timescale at once.
 *
 * survey-lit's §6.0 verdict promoted this from a stretch goal to a committed deliverable because
 * it is central to the field's practice — Sapp's timescape is how a musicologist SEES that two
 * readings agree bar by bar and diverge over the phrase, or the reverse. The object is a
 * triangle: one cell per (start, size) sub-window, `B(B+1)/2` of them for `B` bins.
 *
 * ## Prefix sums, and a binning that conserves mass to the last ulp
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
 * one cell then sum to that cell, the bins of one dimension to `d_k`, and the whole triangle's
 * top cell to `D`.
 *
 * "Conserves" here means to the last ULP, not bit-for-bit, and the distinction is the honest one
 * (W4 MINOR-12): the sums are floating-point additions in a different association from the one
 * that produced `D`, so at `bins = 1` the top cell reads `2526.4921488423447` against a `D` of
 * `2526.4921488423442`. Measured across the bin counts the tests cover, the worst relative gap
 * is `5.4e-16` — one or two ulps — and every cell equals the sum of the unit cells beneath it to
 * `2.22e-16`. That is conservation in every sense a reader of a triangle needs, and it is not
 * the word "exactly", which this paragraph used to claim.
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
import { pairwise, scanl, zipWith } from '../prelude/index.js';

import type { DimensionDensity, DimensionWeights } from './aggregate.js';
import { numberAt } from '../prelude/seq.js';
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

  // Accumulated bin-vector by bin-vector rather than cell by cell: the two are the same
  // additions in the same dimension order, and zipping says that the two vectors are the same
  // length instead of trusting two loop bounds to agree.
  let perBin: readonly number[] = new Array<number>(count).fill(0);
  for (const dimension of COMPARISON_DIMENSIONS) {
    const density = byDimension.get(dimension);
    if (density === undefined) continue;
    const weight = weights[dimension];
    if (weight === 0) continue;
    perBin = zipWith(perBin, binnedMass(density, edges), (sum, mass) => sum + weight * mass);
  }

  // Running totals: `prefix[i]` is the mass in `[start, edges[i])`. `scanl` is the shape —
  // seed first, one state per bin — so `prefix` has `count + 1` entries by construction rather
  // than by an off-by-one the reader has to check.
  const running = new CompensatedSum();
  const prefix = scanl(perBin, 0, (_unused, mass) => {
    running.add(mass);
    return running.total;
  });

  const cells = new Array<number>((count * (count + 1)) / 2).fill(0);
  for (let size = 1; size <= count; ++size)
    for (let start = 0; start + size <= count; ++start)
      cells[scapeIndex(count, size, start)] =
        numberAt(prefix, start + size, PREFIX) - numberAt(prefix, start, PREFIX);

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

  // The one accumulating write, named. `bins[bin] += x` is a READ as well as a write, so under
  // `noUncheckedIndexedAccess` it needs the same answer every other read here needs — and the
  // alternative, rebuilding the vector with `zipWith` per cell, would allocate one array per
  // density cell on a path that has thousands of them.
  const addTo = (bin: number, mass: number): void => {
    bins[bin] = numberAt(bins, bin, BINS) + mass;
  };

  // `pairwise(edges)` IS the bin list: bin `i` is `[edges[i], edges[i+1])`, which is the fact the
  // two indexed reads used to spell out.
  const spans = pairwise(edges);

  for (const cell of density.cells) {
    if (!(cell.endQuarters > cell.startQuarters)) continue;
    const shares = spans.map(([binLow, binHigh]) => {
      const low = Math.max(cell.startQuarters, binLow);
      const high = Math.min(cell.endQuarters, binHigh);
      if (!(high > low)) return 0;
      const sampler = cell.densityAt;
      return sampler === null ? high - low : Math.abs(gaussLegendre10(sampler, low, high));
    });
    // Adding the skipped bins' exact zeros changes no double, so this is the same total the
    // `continue`-guarded accumulation produced.
    const total = shares.reduce((sum, share) => sum + share, 0);
    if (total <= 0) continue;
    for (const [bin, share] of shares.entries())
      if (share !== 0) addTo(bin, (cell.mass * share) / total);
  }

  for (const atom of density.atoms) {
    if (atom.endQuarters === atom.startQuarters) {
      const bin = binOf(edges, atom.startQuarters);
      if (bin >= 0) addTo(bin, atom.mass);
      continue;
    }
    const shares = spans.map(([binLow, binHigh]) => {
      const low = Math.max(atom.startQuarters, binLow);
      const high = Math.min(atom.endQuarters, binHigh);
      return high > low ? high - low : 0;
    });
    const total = shares.reduce((sum, share) => sum + share, 0);
    if (total <= 0) {
      const bin = binOf(edges, atom.startQuarters);
      if (bin >= 0) addTo(bin, atom.mass);
      continue;
    }
    for (const [bin, share] of shares.entries())
      if (share !== 0) addTo(bin, (atom.mass * share) / total);
  }

  return bins;
}

/**
 * The bin a point belongs to: half-open, with the LAST bin closed at the window end.
 *
 * **`partitionPoint` is the considered-and-rejected alternative**, and it is named here because
 * it is the obvious one and it is nearly right. `edges` is non-decreasing and line 203 has
 * already bracketed `quarters` inside it, so
 * `Math.min(count - 1, partitionPoint(count, i => numberAt(edges, i + 1, EDGES) <= quarters))`
 * reproduces every finite case exactly, including the last-bin-closed rule that
 * `bin === count - 1` encodes.
 *
 * It differs at `NaN`, and not harmlessly. The bracket test on line 203 does NOT reject a `NaN`
 * — `NaN < low` and `NaN > high` are both false — so a `NaN` position reaches the scan, where
 * every `quarters < high` fails and the `bin === count - 1` arm puts its mass in the LAST bin.
 * Under the bound, `edges[i + 1] <= NaN` fails at every `i`, the answer is 0, and the same mass
 * lands in the FIRST bin. A scape is a published picture of where mass sits in time; silently
 * moving a bin's worth of it from one end of the window to the other is not a loop-shape change.
 * Which of the two is *right* is a question about line 203's bracket, not about this scan, and
 * it belongs to whoever rules on that.
 *
 * What did change is the allocation. `edges.slice(1).entries()` copied the edge array on every
 * call — once per atom, from `binnedMass` — and then allocated a two-element tuple per step on
 * top of it. `findIndex` is the same walk with neither, and the same answer: the first edge
 * index past 0 that `quarters` falls short of, whose bin is one less; no such edge means the
 * closed last bin, which is what `-1` maps to.
 */
function binOf(edges: readonly number[], quarters: number): number {
  const count = edges.length - 1;
  // A grid with no bins has no bin to name. The old spelling reached the same answer through
  // `undefined` comparisons that are false either way; this states it.
  if (count <= 0) return -1;
  if (quarters < numberAt(edges, 0, EDGES) || quarters > numberAt(edges, count, EDGES)) return -1;
  // Edge `i` for `i >= 1` is bin `i - 1`'s upper end.
  const edge = edges.findIndex((high, index) => index > 0 && quarters < high);
  return edge === -1 ? count - 1 : Math.min(edge - 1, count - 1);
}

/** What an out-of-range read into one of this module's vectors is called (`indexing.ts`). */
const PREFIX = "the scape's prefix sums";
const BINS = "the scape's per-bin masses";
const EDGES = "the scape's bin edges";
