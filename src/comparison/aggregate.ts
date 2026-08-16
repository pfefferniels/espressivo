/**
 * §7's aggregation and AD-19's canonical closing table.
 *
 * `D = Σ_k ω_k d_k`, the aggregate deviation density `p_D = Σ_k ω_k p_k`, its maximal
 * above-threshold segments by Ruzzo–Tompa, and the rows × (segments + remainder) table that
 * closes on `D`.
 *
 * ## What this module takes, and why it is a measure rather than a function
 *
 * §5.0: *"Densities are measures. `p_k` = an absolutely continuous part (curves, step
 * functions, distribution spans) plus **atoms** at event dates."* {@link DimensionDensity}
 * carries both, because the table has to sum both and a representation that flattened atoms
 * into an average density would put an articulation event's mass in the wrong column — atoms
 * are exactly where the mass is concentrated, so smearing them is not a rounding choice.
 *
 * A matched pair of events at DIFFERENT dates is not an atom: AD-7 spreads its mass uniformly
 * over `[min(dA, dB), max(dA, dB)]`, so `λ_date` is visible in the timeline instead of
 * teleporting the difference to one end. {@link DensityAtom} therefore carries an interval,
 * and a point mass is the case where the two ends coincide.
 *
 * ## The one honest gap: root refinement needs a pointwise density
 *
 * AD-19/M9b requires the segment boundaries to be refined to the ROOTS of `p_D − τ_D`, because
 * `p_D` is continuous inside a cell for the curve dimensions and a cell-quantized edge can sit
 * many bars from the true crossing. That needs `p_k` evaluated at a point — and the shipped
 * distance modules return cells carrying `mass` only. {@link DensityCell.densityAt} is
 * therefore optional: where a dimension supplies it the roots are found and the boundaries are
 * exact, and where it does not the cell's mean density stands in and
 * {@link SegmentPass.cellQuantizedDimensions} NAMES the dimensions that fell back, so a report
 * can say which boundaries are approximate rather than implying all of them are exact.
 *
 * This is a real limitation and it is reported rather than hidden. The remedy is to have each
 * `*Distance` module hand back the integrand it already evaluates; that is a cross-module
 * change and it belongs to whoever wires the dimensions in, not here.
 *
 * ## The table closes for ANY partition, which is the point of stating it
 *
 * For any partition `{S_s}` of the window, `Σ_s ∫_{S_s} p_k = d_k` by countable additivity and
 * `Σ_k ω_k Σ_s c_{k,s} = D` because `D` is a weighted sum (AD-19, R4). Ruzzo–Tompa decides only
 * WHICH partition is reported. Saying so keeps the headline capability from being entangled
 * with the thresholding — a reader who distrusts the segmentation can still trust `D`.
 */
import { CompensatedSum, bisectSignChange, gaussLegendre10 } from './quadrature.js';
import { COMPARISON_DIMENSIONS, type ComparisonDimension } from './registry.js';

/**
 * §7.1's event constant, in QUARTERS.
 *
 * `κ` makes one 1-JND event commensurable with `κ` quarters of 1-JND sustained deviation,
 * which is what lets an atom and a cell share a column of the same table. The unit is the
 * whole content of the constant: an alignment's optimum is in JND, the table is in
 * JND·quarters, and `κ` is the bridge. Default 1 [convention], non-overridable in v1
 * (AD-25.7) — it is documented registry data, not a knob.
 */
export const EVENT_KAPPA_QUARTERS = 1;

/** §7.3's per-dimension threshold: one JND, by construction of the units. */
export const DEFAULT_THRESHOLD_JND = 1;

/**
 * The absolutely continuous part of one dimension's density over one cell of its own grid.
 *
 * `mass` is the authority — it is what the dimension integrated and what the row sum must
 * reproduce. `densityAt` is an optional refinement used only to locate threshold crossings
 * inside the cell; a caller that supplies one whose integral disagrees with `mass` would move
 * a segment boundary without moving any reported mass, which is why the two are kept apart.
 */
export interface DensityCell {
  readonly startQuarters: number;
  readonly endQuarters: number;
  /** `∫_cell p_k`, in JND·quarters. */
  readonly mass: number;
  /** `p_k(t)` in JND per quarter, or null where the dimension cannot evaluate a point. */
  readonly densityAt: ((quarters: number) => number) | null;
}

/**
 * Event mass (§5.0's atoms, AD-7's spreading rule).
 *
 * A point mass has `startQuarters === endQuarters`. A matched pair at differing dates spreads
 * uniformly over the interval between them.
 */
export interface DensityAtom {
  readonly startQuarters: number;
  readonly endQuarters: number;
  /** JND·quarters — already multiplied by {@link EVENT_KAPPA_QUARTERS} by the caller. */
  readonly mass: number;
}

export interface DimensionDensity {
  readonly dimension: ComparisonDimension;
  readonly cells: readonly DensityCell[];
  readonly atoms: readonly DensityAtom[];
  /** `d_k` as the dimension computed it — the row sum's authority (see {@link DensityCell}). */
  readonly distance: number;
}

/** A cell of the SEGMENT grid, scored against the threshold. */
export interface ScoredCell {
  readonly startQuarters: number;
  readonly endQuarters: number;
  /** Mass of `p_D` in this cell, weighted. */
  readonly mass: number;
  /** `mass − τ_D · length` (AD-19, M9c) — the mass form, so atoms and zero-width cells work. */
  readonly score: number;
}

/** A maximal above-threshold run, before the report's shape is put on it. */
export interface AggregateSegment {
  readonly startQuarters: number;
  readonly endQuarters: number;
  readonly lengthQuarters: number;
  /** JND·quarters. */
  readonly mass: number;
  /** JND per quarter. */
  readonly mean: number;
  /** JND per quarter — the maximum cell density inside the run. */
  readonly peak: number;
  readonly peakAtQuarters: number;
  /** Ruzzo–Tompa's score for the run: `mass − τ_D · length`. */
  readonly score: number;
  readonly rank: number;
}

export interface SegmentPass {
  readonly cells: readonly ScoredCell[];
  readonly segments: readonly AggregateSegment[];
  /** Mass of `p_D` outside every segment — the table's last column. */
  readonly remainderMass: number;
  readonly thresholdPerQuarter: number;
  /**
   * Dimensions whose cells carried no pointwise density, so their threshold crossings were
   * located at cell resolution rather than exactly (AD-19/M9b's own concern, reported).
   */
  readonly cellQuantizedDimensions: readonly ComparisonDimension[];
}

/** AD-19's rows × (segments + remainder) table, row-major. */
export interface AttributionTable {
  readonly dimensions: readonly ComparisonDimension[];
  readonly columnCount: number;
  /** UNWEIGHTED `c_{k,s}`, row-major: `dimensions.length × columnCount`. */
  readonly cells: readonly number[];
  /** `= d_k`, unweighted. */
  readonly rowSums: readonly number[];
  /** Weighted column totals. */
  readonly columnSums: readonly number[];
  /** `= D`. */
  readonly total: number;
  /** `|Σ columnSums − D|`; pinned at `≤ 1e−12 · D` (§7.3). */
  readonly residual: number;
}

/** The weight vector, defaulted and validated by the caller (§7.2's `ω_k = 1`). */
export type DimensionWeights = Readonly<Record<ComparisonDimension, number>>;

/** `ω_k = 1` for every dimension — §7.2's default, kept because it is defensible, not neutral. */
export function defaultWeights(): DimensionWeights {
  return Object.fromEntries(
    COMPARISON_DIMENSIONS.map((dimension) => [dimension, 1]),
  ) as DimensionWeights;
}

/** `τ_k = 1` JND for every dimension — §7.3's threshold. */
export function defaultThresholds(): DimensionWeights {
  return Object.fromEntries(
    COMPARISON_DIMENSIONS.map((dimension) => [dimension, DEFAULT_THRESHOLD_JND]),
  ) as DimensionWeights;
}

/**
 * `D = Σ_k ω_k d_k` (§7.2).
 *
 * Compensated, and summed in `COMPARISON_DIMENSIONS` order rather than in the order the
 * densities arrive: floating-point addition is not associative, so an order that depended on
 * which document was `a` would put a one-ulp asymmetry into the headline number (R2).
 */
export function aggregateDistance(
  densities: readonly DimensionDensity[],
  weights: DimensionWeights,
): number {
  const byDimension = new Map(densities.map((density) => [density.dimension, density]));
  const total = new CompensatedSum();
  for (const dimension of COMPARISON_DIMENSIONS) {
    const density = byDimension.get(dimension);
    if (density === undefined) continue;
    total.add(weights[dimension] * density.distance);
  }
  return total.total;
}

/**
 * The mass `p_k` places in `[start, end)`, cells and atoms together.
 *
 * A cell is assumed to distribute its mass UNIFORMLY when it is only partly covered, which is
 * exact whenever the segment grid carries every cell edge — and it does, by construction of
 * {@link segmentPass}. The clause exists so that a caller passing a coarser interval still
 * gets a defined answer rather than a silently wrong one.
 */
export function massIn(
  density: DimensionDensity,
  startQuarters: number,
  endQuarters: number,
): number {
  const total = new CompensatedSum();
  for (const cell of density.cells) {
    const low = Math.max(cell.startQuarters, startQuarters);
    const high = Math.min(cell.endQuarters, endQuarters);
    if (!(high > low)) continue;
    total.add(cellMassBetween(cell, low, high));
  }
  for (const atom of density.atoms) {
    if (atom.endQuarters === atom.startQuarters) {
      // A point mass belongs to the cell it OPENS — right-continuity (A-B1, R27), the same
      // convention every curve reader uses, so an atom on a boundary is charged once.
      if (atom.startQuarters >= startQuarters && atom.startQuarters < endQuarters)
        total.add(atom.mass);
      continue;
    }
    const overlap = overlapLength(atom, startQuarters, endQuarters);
    if (overlap <= 0) continue;
    total.add((atom.mass * overlap) / (atom.endQuarters - atom.startQuarters));
  }
  return total.total;
}

/**
 * The part of a cell's mass lying in `[low, high]`.
 *
 * Where the cell carries a sampler, the SHAPE comes from the sampler and the SCALE from
 * `mass`: the sub-interval's share is `∫_low^high p / ∫_cell p`, rescaled to `mass`. Pro-rating
 * by length instead would let the root refinement move a boundary without moving any mass —
 * the exact inconsistency this module's own doc warns about — and the first version of this
 * function did precisely that, which its test caught by finding no segment at all where the
 * density plainly crosses the threshold.
 *
 * Rescaling rather than trusting the sampler's own integral keeps `mass` the authority, so the
 * row sums still reproduce `d_k` exactly whatever the sampler's quadrature error. A shape
 * integrating to zero falls back to the uniform split, which is the only defined answer.
 */
function cellMassBetween(cell: DensityCell, low: number, high: number): number {
  const length = cell.endQuarters - cell.startQuarters;
  if (!(length > 0)) return cell.mass;
  const sampler = cell.densityAt;
  if (sampler === null) return (cell.mass * (high - low)) / length;
  const whole = gaussLegendre10(sampler, cell.startQuarters, cell.endQuarters);
  if (!(Math.abs(whole) > 0)) return (cell.mass * (high - low)) / length;
  return (cell.mass * gaussLegendre10(sampler, low, high)) / whole;
}

function overlapLength(
  span: { readonly startQuarters: number; readonly endQuarters: number },
  startQuarters: number,
  endQuarters: number,
): number {
  return Math.min(span.endQuarters, endQuarters) - Math.max(span.startQuarters, startQuarters);
}

/** `p_D(t) = Σ_k ω_k p_k(t)`, in JND per quarter — the pointwise form the roots need. */
function aggregateDensityAt(
  densities: readonly DimensionDensity[],
  weights: DimensionWeights,
  quarters: number,
): number {
  const total = new CompensatedSum();
  for (const dimension of COMPARISON_DIMENSIONS) {
    const density = densities.find((candidate) => candidate.dimension === dimension);
    if (density === undefined) continue;
    const weight = weights[dimension];
    if (weight === 0) continue;
    total.add(weight * pointwiseDensityAt(density, quarters));
  }
  return total.total;
}

/**
 * One dimension's `p_k(t)`: its sampler where it has one, else the covering cell's mean.
 *
 * SUMMED over every covering cell, not taken from the first. A dimension evaluated per part
 * carries one cell list per part and they overlap in time — which is not a defect but the
 * meaning of `p_k(t) = Σ_parts p_{k,part}(t)`, and it is exactly what {@link massIn} already
 * does. A first-match lookup would make the root refinement see a fraction of the density the
 * mass reports, which is the shape-versus-scale inconsistency this module's own doc warns
 * about, one level down.
 */
function pointwiseDensityAt(density: DimensionDensity, quarters: number): number {
  const total = new CompensatedSum();
  for (const cell of density.cells) {
    if (quarters < cell.startQuarters || quarters >= cell.endQuarters) continue;
    if (cell.densityAt !== null) {
      total.add(cell.densityAt(quarters));
      continue;
    }
    const length = cell.endQuarters - cell.startQuarters;
    total.add(length > 0 ? cell.mass / length : 0);
  }
  return total.total;
}

/**
 * §7.3's segment pass: score the grid, run Ruzzo–Tompa, rank the survivors.
 *
 * The grid is the union of every dimension's cell edges and atom endpoints, clipped to the
 * window, PLUS the roots of `p_D − τ_D` inside cells where a pointwise density is available
 * (AD-19/M9b). Cell edges are in the grid because a dimension's density can jump there, and
 * atom endpoints because that is where mass is concentrated.
 *
 * A ZERO-WIDTH cell is legal and is why the score is a mass rather than a sample (AD-19/M9c):
 * co-dated instructions really occur, an atom's cell has `τ · 0 = 0`, and the score is then the
 * atom mass itself.
 */
export function segmentPass(
  densities: readonly DimensionDensity[],
  weights: DimensionWeights,
  thresholds: DimensionWeights,
  windowStartQuarters: number,
  windowEndQuarters: number,
): SegmentPass {
  const thresholdPerQuarter = weightedThreshold(densities, weights, thresholds);
  const boundaries = segmentGrid(
    densities,
    weights,
    thresholdPerQuarter,
    windowStartQuarters,
    windowEndQuarters,
  );

  const cells: ScoredCell[] = [];
  for (let i = 0; i < boundaries.length - 1; ++i) {
    const start = boundaries[i];
    const end = boundaries[i + 1];
    const mass = weightedMassIn(densities, weights, start, end);
    cells.push({
      startQuarters: start,
      endQuarters: end,
      mass,
      score: mass - thresholdPerQuarter * (end - start),
    });
  }

  const runs = maximalScoringRuns(cells.map((cell) => cell.score));
  const segments = runs
    .map((run) => summarize(cells, run))
    .sort(compareSegments)
    .map((segment, index) => ({ ...segment, rank: index }));

  const covered = new CompensatedSum();
  for (const run of runs) for (let i = run.start; i <= run.end; ++i) covered.add(cells[i].mass);
  const totalMass = weightedMassIn(densities, weights, windowStartQuarters, windowEndQuarters);

  return {
    cells,
    segments,
    remainderMass: totalMass - covered.total,
    thresholdPerQuarter,
    cellQuantizedDimensions: densities
      .filter(
        (density) =>
          weights[density.dimension] !== 0 &&
          density.cells.some(
            (cell) => cell.densityAt === null && cell.endQuarters > cell.startQuarters,
          ),
      )
      .map((density) => density.dimension),
  };
}

/** `τ_D = Σ_k ω_k τ_k`, over the dimensions actually present (§7.3). */
function weightedThreshold(
  densities: readonly DimensionDensity[],
  weights: DimensionWeights,
  thresholds: DimensionWeights,
): number {
  const total = new CompensatedSum();
  for (const dimension of COMPARISON_DIMENSIONS) {
    if (!densities.some((density) => density.dimension === dimension)) continue;
    total.add(weights[dimension] * thresholds[dimension]);
  }
  return total.total;
}

function weightedMassIn(
  densities: readonly DimensionDensity[],
  weights: DimensionWeights,
  startQuarters: number,
  endQuarters: number,
): number {
  const total = new CompensatedSum();
  for (const dimension of COMPARISON_DIMENSIONS) {
    const density = densities.find((candidate) => candidate.dimension === dimension);
    if (density === undefined) continue;
    const weight = weights[dimension];
    // A ZERO-WEIGHT dimension is excluded from `p_D` and therefore from the segment pass, but
    // its `d_k` is still computed and reported (AD-19) — which is what makes §7.4's
    // dimension-selective recipe work rather than merely hiding a dimension.
    if (weight === 0) continue;
    total.add(weight * massIn(density, startQuarters, endQuarters));
  }
  return total.total;
}

/** The segment grid: structural edges, then the roots of `p_D − τ_D` inside each interval. */
function segmentGrid(
  densities: readonly DimensionDensity[],
  weights: DimensionWeights,
  thresholdPerQuarter: number,
  windowStartQuarters: number,
  windowEndQuarters: number,
): readonly number[] {
  const points = new Set<number>([windowStartQuarters, windowEndQuarters]);
  const add = (quarters: number): void => {
    if (quarters > windowStartQuarters && quarters < windowEndQuarters) points.add(quarters);
  };
  for (const density of densities) {
    if (weights[density.dimension] === 0) continue;
    for (const cell of density.cells) {
      add(cell.startQuarters);
      add(cell.endQuarters);
    }
    for (const atom of density.atoms) {
      add(atom.startQuarters);
      add(atom.endQuarters);
    }
  }

  const structural = [...points].sort((x, y) => x - y);
  if (!densities.some((density) => density.cells.some((cell) => cell.densityAt !== null)))
    return structural;

  // AD-19/M9b: inside a structural interval `p_D` can cross `τ_D`, and a cell-quantized edge
  // can be many bars from the crossing. The bracketing device is §5.0's own.
  const excess = (quarters: number): number =>
    aggregateDensityAt(densities, weights, quarters) - thresholdPerQuarter;
  const refined = new Set<number>(structural);
  for (let i = 0; i < structural.length - 1; ++i) {
    const root = bisectSignChange(excess, structural[i], structural[i + 1]);
    if (root !== null && root > structural[i] && root < structural[i + 1]) refined.add(root);
  }
  return [...refined].sort((x, y) => x - y);
}

function summarize(
  cells: readonly ScoredCell[],
  run: { readonly start: number; readonly end: number },
): Omit<AggregateSegment, 'rank'> {
  const startQuarters = cells[run.start].startQuarters;
  const endQuarters = cells[run.end].endQuarters;
  const mass = new CompensatedSum();
  const score = new CompensatedSum();
  let peak = 0;
  let peakAtQuarters = startQuarters;
  for (let i = run.start; i <= run.end; ++i) {
    const cell = cells[i];
    mass.add(cell.mass);
    score.add(cell.score);
    const length = cell.endQuarters - cell.startQuarters;
    // A zero-width cell is an atom: its "density" is unbounded, so `peak` reports the
    // continuous part only and the atom's contribution is visible in `mass`. Reporting
    // Infinity here would poison §9.6's finiteness discipline for a real document.
    if (length <= 0) continue;
    const density = cell.mass / length;
    if (density > peak) {
      peak = density;
      peakAtQuarters = cell.startQuarters;
    }
  }
  const lengthQuarters = endQuarters - startQuarters;
  return {
    startQuarters,
    endQuarters,
    lengthQuarters,
    mass: mass.total,
    mean: lengthQuarters > 0 ? mass.total / lengthQuarters : mass.total,
    peak,
    peakAtQuarters,
    score: score.total,
  };
}

/** §7.3's documented tie rule: mass descending, then earliest start, then shortest. */
function compareSegments(
  x: Omit<AggregateSegment, 'rank'>,
  y: Omit<AggregateSegment, 'rank'>,
): number {
  if (x.mass !== y.mass) return y.mass - x.mass;
  if (x.startQuarters !== y.startQuarters) return x.startQuarters - y.startQuarters;
  return x.lengthQuarters - y.lengthQuarters;
}

/**
 * Ruzzo–Tompa: every maximal scoring subsequence of `scores`, in left-to-right order.
 *
 * A subsequence is maximal when it scores positively, contains no proper subsequence of
 * greater score, and is contained in no longer subsequence of greater-or-equal score. The set
 * is CANONICAL — a run extended by a zero-score cell contains a proper subsequence of equal
 * score and therefore fails maximality, so boundary zeros are never absorbed (§7.3, and the
 * math lens attacked exactly this).
 *
 * The algorithm is Ruzzo & Tompa's (1999) verbatim, with `leftTotal` the cumulative score
 * immediately before a run and `rightTotal` the cumulative score at its end. Its list carries
 * the invariant that both sequences are strictly increasing, which is what makes the backward
 * scan for "the last `j` with `L_j < L_k`" terminate immediately in the common case.
 */
export function maximalScoringRuns(
  scores: readonly number[],
): readonly { readonly start: number; readonly end: number }[] {
  interface Run {
    start: number;
    end: number;
    leftTotal: number;
    rightTotal: number;
  }
  const runs: Run[] = [];
  let cumulative = 0;

  for (let i = 0; i < scores.length; ++i) {
    const score = scores[i];
    if (!(score > 0)) {
      cumulative += score;
      continue;
    }
    let candidate: Run = {
      start: i,
      end: i,
      leftTotal: cumulative,
      rightTotal: cumulative + score,
    };
    cumulative = candidate.rightTotal;

    for (;;) {
      let j = -1;
      for (let k = runs.length - 1; k >= 0; --k)
        if (runs[k].leftTotal < candidate.leftTotal) {
          j = k;
          break;
        }
      if (j < 0 || runs[j].rightTotal >= candidate.rightTotal) break;
      // Step 3: absorb runs[j..] into the candidate and reconsider.
      candidate = {
        start: runs[j].start,
        end: candidate.end,
        leftTotal: runs[j].leftTotal,
        rightTotal: candidate.rightTotal,
      };
      runs.length = j;
    }
    runs.push(candidate);
  }
  return runs.map((run) => ({ start: run.start, end: run.end }));
}

/**
 * AD-19's table: unweighted `c_{k,s}` per dimension per column, with the closure check.
 *
 * Columns are the ranked segments followed by ONE remainder column, and the cells are
 * unweighted so that a reader can apply their own weights to the same table — which is also
 * why `rowSums` reproduces `d_k` exactly rather than `ω_k d_k`.
 */
export function attributionTable(
  densities: readonly DimensionDensity[],
  weights: DimensionWeights,
  segments: readonly AggregateSegment[],
  windowStartQuarters: number,
  windowEndQuarters: number,
): AttributionTable {
  const dimensions = [...COMPARISON_DIMENSIONS];
  const columnCount = segments.length + 1;
  const cells: number[] = [];
  const rowSums: number[] = [];

  for (const dimension of dimensions) {
    const density = densities.find((candidate) => candidate.dimension === dimension);
    const rowTotal =
      density === undefined ? 0 : massIn(density, windowStartQuarters, windowEndQuarters);
    const inSegments = new CompensatedSum();
    for (const segment of segments) {
      const cell =
        density === undefined ? 0 : massIn(density, segment.startQuarters, segment.endQuarters);
      inSegments.add(cell);
      cells.push(cell);
    }
    // The remainder column is the row's own total minus what the segments took, so the row
    // sums to `d_k` by construction rather than by a second integration that could disagree.
    cells.push(rowTotal - inSegments.total);
    rowSums.push(rowTotal);
  }

  const columnSums: number[] = [];
  for (let column = 0; column < columnCount; ++column) {
    const total = new CompensatedSum();
    for (let row = 0; row < dimensions.length; ++row)
      total.add(weights[dimensions[row]] * cells[row * columnCount + column]);
    columnSums.push(total.total);
  }

  const grand = new CompensatedSum();
  for (const sum of columnSums) grand.add(sum);
  const total = aggregateDistanceFromRows(dimensions, rowSums, weights);

  return {
    dimensions,
    columnCount,
    cells,
    rowSums,
    columnSums,
    total,
    residual: Math.abs(grand.total - total),
  };
}

function aggregateDistanceFromRows(
  dimensions: readonly ComparisonDimension[],
  rowSums: readonly number[],
  weights: DimensionWeights,
): number {
  const total = new CompensatedSum();
  for (let i = 0; i < dimensions.length; ++i) total.add(weights[dimensions[i]] * rowSums[i]);
  return total.total;
}

/** §7.3's C11 equivalence block — derived from numbers already present, never re-integrated. */
export interface EquivalenceBlock {
  readonly subThresholdMassFraction: number;
  readonly aboveThresholdLengthFraction: number;
  readonly byDimension: Readonly<
    Record<
      ComparisonDimension,
      {
        readonly subThresholdMassFraction: number;
        readonly aboveThresholdLengthFraction: number;
      }
    >
  >;
}

/**
 * "93 % of the weighted deviation mass is below the perceptual threshold" — the sentence a
 * scholar wants, as data (AD-23, C11).
 *
 * This is the module's methodological answer to Hall's prohibition on attacking a music roll
 * with a ruler: the JND threshold is what makes "these two are the same performance" a claim
 * with a number behind it, and leaving the division to the caller left the claim unmade. It
 * also answers mlign's question directly — "is the augmented sample distinguishable?" is
 * `aboveThresholdLengthFraction > 0`.
 *
 * Fractions of ZERO are `0`, not `NaN`: a pair with no deviation at all has none of it above
 * threshold, which is the true answer and the one §9.6's finiteness discipline requires.
 */
/**
 * The LENGTH of `{ t ∈ window : p_k(t) > τ_k }`, at cell resolution.
 *
 * Summing each cell's own length was wrong wherever a dimension is evaluated over several part
 * scopes: the cell lists then OVERLAP in time — which is not a defect but the meaning of
 * `p_k(t) = Σ_parts p_{k,part}(t)` — so three parts deviating everywhere reported a "fraction"
 * of 3.0, and §7.3's mandated sentence would have printed "300 % of the window" (W3 MAJOR-4).
 *
 * So the measure is taken over the union of the cell edges, and each elementary interval carries
 * the density of every cell covering it, which is the same summation {@link massIn} and
 * {@link pointwiseDensityAt} already perform. The result is a length inside the window by
 * construction, so the fraction cannot leave `[0, 1]`.
 */
function aboveThresholdLength(
  density: DimensionDensity,
  threshold: number,
  windowStartQuarters: number,
  windowEndQuarters: number,
): number {
  const edges = new Set<number>([windowStartQuarters, windowEndQuarters]);
  for (const cell of density.cells) {
    if (cell.startQuarters > windowStartQuarters && cell.startQuarters < windowEndQuarters)
      edges.add(cell.startQuarters);
    if (cell.endQuarters > windowStartQuarters && cell.endQuarters < windowEndQuarters)
      edges.add(cell.endQuarters);
  }
  const grid = [...edges].sort((x, y) => x - y);

  const total = new CompensatedSum();
  for (let i = 0; i < grid.length - 1; ++i) {
    const low = grid[i];
    const high = grid[i + 1];
    const length = high - low;
    if (!(length > 0)) continue;
    // Cells only: an ATOM is a point mass, and a set of measure zero is never "above threshold
    // for a length". Its mass is where the event dimensions are visible, in the mass fraction.
    const mass = new CompensatedSum();
    for (const cell of density.cells) {
      if (cell.endQuarters <= low || cell.startQuarters >= high) continue;
      mass.add(
        cellMassBetween(cell, Math.max(cell.startQuarters, low), Math.min(cell.endQuarters, high)),
      );
    }
    if (mass.total / length > threshold) total.add(length);
  }
  return total.total;
}

export function equivalenceBlock(
  densities: readonly DimensionDensity[],
  thresholds: DimensionWeights,
  segments: readonly AggregateSegment[],
  remainderMass: number,
  aggregate: number,
  windowStartQuarters: number,
  windowEndQuarters: number,
): EquivalenceBlock {
  const windowLength = windowEndQuarters - windowStartQuarters;
  const segmentLength = new CompensatedSum();
  for (const segment of segments) segmentLength.add(segment.lengthQuarters);

  const byDimension = Object.fromEntries(
    COMPARISON_DIMENSIONS.map((dimension) => {
      const density = densities.find((candidate) => candidate.dimension === dimension);
      if (density === undefined)
        return [dimension, { subThresholdMassFraction: 0, aboveThresholdLengthFraction: 0 }];
      const total = massIn(density, windowStartQuarters, windowEndQuarters);
      const inSegments = new CompensatedSum();
      for (const segment of segments)
        inSegments.add(massIn(density, segment.startQuarters, segment.endQuarters));
      // The per-dimension LENGTH fraction is this dimension's OWN above-threshold length, not
      // the aggregate segments' — the aggregate figure is identical for every dimension and
      // would make the field vacuous. §7.3 licenses exactly this as the secondary,
      // explicitly non-closing per-dimension product; it is measured at cell resolution,
      // without the aggregate pass's root refinement, which is why it is a descriptor.
      const above = aboveThresholdLength(
        density,
        thresholds[dimension],
        windowStartQuarters,
        windowEndQuarters,
      );
      return [
        dimension,
        {
          subThresholdMassFraction: total > 0 ? (total - inSegments.total) / total : 0,
          aboveThresholdLengthFraction: windowLength > 0 ? above / windowLength : 0,
        },
      ];
    }),
  ) as EquivalenceBlock['byDimension'];

  return {
    subThresholdMassFraction: aggregate > 0 ? remainderMass / aggregate : 0,
    aboveThresholdLengthFraction: windowLength > 0 ? segmentLength.total / windowLength : 0,
    byDimension,
  };
}
