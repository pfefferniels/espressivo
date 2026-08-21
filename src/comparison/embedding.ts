/**
 * §8's embedding: classical MDS by cyclic Jacobi, and the seriation that falls out of it.
 *
 * Nothing here knows what a performance is. The input is a symmetric distance matrix in the
 * row-major `N²` layout §8 pins, plus the LABELS every tie is broken on (AD-25.2), and the
 * output is plain data.
 *
 * ## Honest about a non-Euclidean input
 *
 * `D` here is an `L¹`-type sum and is generally NOT Euclidean, so `B = −½ J D⁽²⁾ J` has negative
 * eigenvalues. Three things are therefore reported ALWAYS: the full spectrum rather than the
 * retained part; explained variance over `Σ|λ|` and never over `Σλ⁺`, which would flatter the
 * result by pretending the negative mass is not there; and
 * `negativeEigenvalueMass = Σ|λ⁻| / Σ|λ|`, the explicit "how non-Euclidean is this?" figure.
 *
 * ## Determinism, and the exact limit of it (AD-67.1)
 *
 * The sweep order is fixed `(p, q)` ascending, so the rotations are a function of the input.
 * Eigenvectors are defined up to sign and the sign is FIXED — largest-magnitude component
 * positive, ties by lowest LABEL — because without it two runs produce mirror-image plots and
 * §10's P-C6 would be false for a reason that has nothing to do with the metric.
 *
 * Two runs of the SAME matrix are byte-identical. P-C6's corpus clause, about two runs of a
 * PERMUTED matrix, reads:
 *
 * > Permuting the corpus relabels the embedding WHEN the retained eigenvalues are distinct.
 * > Where two of them coincide the eigenspace has no canonical basis and no sign rule can make
 * > one — the coordinates are then one arbitrary orthonormal choice among infinitely many, and
 * > `degenerate` says so.
 *
 * Jacobi's rotation sequence depends on the matrix's storage order, so a permuted corpus
 * produces eigenvalues and components that agree in exact arithmetic and differ in the last ulp.
 * Every tie rule here therefore compares with a RELATIVE epsilon before falling back to the label
 * ({@link TIE_EPSILON}): an exact `===` never reaches its label branch on float noise, which made
 * the published order follow the noise instead (W4 CAPITAL-3). That repairs the near-tie, not the
 * exact tie, where the arbitrariness is in the mathematics: a corpus with a repeated eigenvalue
 * (three documents each listed twice gives `λ = [9, 9, ~0, ~0, 0, ~0]`) has a two-dimensional
 * eigenspace, and every rotation within it is as valid as every other. Canonicalising that block
 * is deep numerics for a rare and DETECTABLE case, so this module detects and reports it instead.
 *
 * ## What the narrowed contract costs the reader (W4 MINOR-R1)
 *
 * Four published fields are NOT bit-reproducible under relabelling — `coordinates`,
 * `eigenvalues`, `explainedVariance`, `negativeEigenvalueMass` — since a permuted corpus reruns
 * Jacobi's rotations in a different sequence. The ORDER and the ORIENTATION are exact (the
 * seriation, the sign anchor, which axis is which), because those are discrete choices the tie
 * rules above make functions of the corpus; the magnitudes drift materially rather than around
 * zero: at `n = 6`, `negativeEigenvalueMass` moves in the 15th significant figure of 0.048.
 * Comparing those four across differently-ordered runs needs a tolerance.
 */

import { pairwise } from '../prelude/index.js';

import { elementAt } from '../prelude/seq.js';

/** A symmetric matrix in §8's layout: `n` rows of `n`, row-major, `m[i*n + j]`. */
export interface SquareMatrix {
  readonly n: number;
  readonly values: readonly number[];
}

/**
 * One read from a flat `N²` buffer.
 *
 * Every matrix here is a flat `readonly number[]` addressed by computed indices, and one Jacobi
 * sweep does thirty such reads, so a stride bug should read as a `RangeError` naming the buffer
 * rather than as a `NaN` that reaches a published eigenvalue.
 */
function cell(values: readonly number[], index: number): number {
  return elementAt(values, index, 'a flat N² matrix buffer');
}

export interface Embedding {
  /** `N × axes`, row-major. */
  readonly coordinates: readonly number[];
  /**
   * The FULL spectrum, descending — not only the retained axes.
   *
   * Like `coordinates`, `explainedVariance` and `negativeEigenvalueMass`, these agree to working
   * precision and NOT to the bit across a permuted corpus (MINOR-R1). Their ORDER is exact.
   */
  readonly eigenvalues: readonly number[];
  /**
   * Per retained axis, `λ_j / Σ|λ|`; every entry null exactly when `Σ|λ| = 0` (A3b).
   *
   * SIGNED. A negative entry is an axis with a negative eigenvalue — an imaginary direction the
   * corpus's non-Euclidean geometry produced — and its `coordinates` are all zero, since only a
   * positive eigenvalue is embedded. Reading `|share|` there would credit an axis that is not
   * there with variance it does not carry (W4 MAJOR-2).
   */
  readonly explainedVariance: readonly (number | null)[];
  /**
   * True when the eigenbasis is NOT unique, so `coordinates` are one arbitrary choice among
   * infinitely many and permuting the corpus need not relabel them (AD-67.1).
   *
   * Two causes:
   *
   * - `Σ|λ| = 0` — one document listed twice, or a corpus of equals. `explainedVariance` is
   *   all-null exactly here (A3b), which is the narrower condition.
   * - A REPEATED eigenvalue at or across the retained cut, where at least one of the pair
   *   carries material variance. That eigenspace has dimension ≥ 2 and no canonical basis.
   *
   * The first implies the second, so `DESIGN.md`'s invariant `Σ|λ| = 0 ⇒ degenerate` holds. A
   * consumer plotting `coordinates` should read this as "the axes are real, their orientation is
   * not".
   */
  readonly degenerate: boolean;
  /**
   * `Σ|λ⁻| / Σ|λ|`, or 0 in the degenerate case.
   *
   * It is a MEASURED quantity and not a proof of non-Euclideanness: a perfectly Euclidean corpus
   * can report a value at the noise floor, because Jacobi's rotations leave a zero eigenvalue at
   * `±1e-16` rather than at 0 and the sign of that residue is arbitrary. Measured on regular
   * simplices, which are exactly Euclidean: `0` at `k = 5, 6, 8, 10` and `6.1e-17`, `2.3e-17`,
   * `5.8e-17`, `4.7e-17` at `k = 3, 4, 7, 12` (W4 MINOR-11).
   *
   * Deliberately NOT clamped: a threshold would have to be chosen and would hide genuine
   * small-but-real non-Euclideanness, which is what this field exists to report. Read the figure
   * against the spectrum, published in full beside it.
   */
  readonly negativeEigenvalueMass: number;
  readonly axes: number;
}

/**
 * The RELATIVE band inside which two quantities count as tied, so the label rule is reached
 * (AD-67.1) [convention].
 *
 * It has to sit above the arithmetic and below anything meaningful, and the gap is wide. Above:
 * `jacobiEigen`'s own residuals are `|VΛVᵀ−A| ≤ 1.18e-11` and `|VᵀV−I| ≤ 3.78e-15`, so `1e-9`
 * clears the permutation noise by orders. Below: two performances whose first MDS coordinates
 * differ by one part in `10⁹` are the same point on any plot anyone will draw, and the label rule
 * orders them.
 *
 * An epsilon comparison is not transitive, so this is not a total order in theory. The residue is
 * bounded: for a chain to resolve differently two coordinates must straddle the band's own edge,
 * which needs a corpus constructed to do it. The EXACT tie cannot be fixed here at all, and
 * `degenerate` reports it.
 */
const TIE_EPSILON = 1e-9;

/** Off-diagonal Frobenius norm relative to the whole matrix — Jacobi's stopping rule. */
const JACOBI_TOLERANCE = 1e-12;

/** A cap, so the loop terminates on any input; the tolerance is reached long before it. */
const JACOBI_MAX_SWEEPS = 100;

/**
 * The symmetric eigenproblem by CYCLIC Jacobi, in a fixed sweep order.
 *
 * Returns eigenvalues and eigenvectors as columns of `vectors` (`vectors[i*n + j]` is component
 * `i` of eigenvector `j`), unsorted. Quadratic convergence keeps the sweep count small.
 */
export function jacobiEigen(matrix: SquareMatrix): {
  readonly values: readonly number[];
  readonly vectors: readonly number[];
} {
  const n = matrix.n;
  const a = [...matrix.values];
  const v = new Array<number>(n * n).fill(0);
  for (let i = 0; i < n; ++i) v[i * n + i] = 1;

  // Accumulated rather than `Math.hypot(...a)`, which spreads `n²` arguments against V8's
  // measured limit of 105741 and so throws `RangeError` at `n ≥ 326` (W4 MINOR-13);
  // `DEFAULT_MAX_ITEMS = 256` needs 65536, only 1.61× headroom under a ceiling C17 may raise.
  // Same number: `Math.hypot`'s scaling guards overflow in the SQUARES, and these are
  // distance-matrix entries whose squares cannot overflow a double at any `n` this module takes.
  let sumOfSquares = 0;
  for (const value of a) sumOfSquares += value * value;
  const norm = Math.sqrt(sumOfSquares);
  const threshold = JACOBI_TOLERANCE * (norm === 0 ? 1 : norm);

  for (let sweep = 0; sweep < JACOBI_MAX_SWEEPS; ++sweep) {
    let off = 0;
    for (let p = 0; p < n; ++p)
      for (let q = p + 1; q < n; ++q) off += 2 * cell(a, p * n + q) * cell(a, p * n + q);
    if (Math.sqrt(off) <= threshold) break;

    for (let p = 0; p < n; ++p)
      for (let q = p + 1; q < n; ++q) {
        const apq = cell(a, p * n + q);
        if (apq === 0) continue;
        // The standard stable form: `t` is the smaller root of `t² + 2θt − 1 = 0`, computed
        // without cancellation, and `θ` is guarded against overflow for a nearly-diagonal pair.
        const theta = (cell(a, q * n + q) - cell(a, p * n + p)) / (2 * apq);
        const t =
          theta >= 0
            ? 1 / (theta + Math.sqrt(1 + theta * theta))
            : -1 / (-theta + Math.sqrt(1 + theta * theta));
        const c = 1 / Math.sqrt(1 + t * t);
        const s = t * c;

        for (let k = 0; k < n; ++k) {
          const akp = cell(a, k * n + p);
          const akq = cell(a, k * n + q);
          a[k * n + p] = c * akp - s * akq;
          a[k * n + q] = s * akp + c * akq;
        }
        for (let k = 0; k < n; ++k) {
          const apk = cell(a, p * n + k);
          const aqk = cell(a, q * n + k);
          a[p * n + k] = c * apk - s * aqk;
          a[q * n + k] = s * apk + c * aqk;
        }
        for (let k = 0; k < n; ++k) {
          const vkp = cell(v, k * n + p);
          const vkq = cell(v, k * n + q);
          v[k * n + p] = c * vkp - s * vkq;
          v[k * n + q] = s * vkp + c * vkq;
        }
      }
  }

  return { values: Array.from({ length: n }, (_unused, i) => cell(a, i * n + i)), vectors: v };
}

/**
 * `B = −½ J D⁽²⁾ J` with `J = I − 11ᵀ/N` — Torgerson's double centering.
 *
 * Written as row/column/grand means rather than as two matrix products: the two are the same
 * arithmetic and this form is `O(N²)` where the products are `O(N³)`.
 */
export function doubleCentered(distances: SquareMatrix): SquareMatrix {
  const n = distances.n;
  if (n === 0) return { n: 0, values: [] };

  const squared = distances.values.map((value) => value * value);
  const rowMean = new Array<number>(n).fill(0);
  let grand = 0;
  for (let i = 0; i < n; ++i) {
    let total = 0;
    for (let j = 0; j < n; ++j) total += cell(squared, i * n + j);
    rowMean[i] = total / n;
    grand += total;
  }
  grand /= n * n;

  const values = new Array<number>(n * n);
  for (let i = 0; i < n; ++i)
    for (let j = 0; j < n; ++j)
      values[i * n + j] =
        -0.5 * (cell(squared, i * n + j) - cell(rowMean, i) - cell(rowMean, j) + grand);
  return { n, values };
}

/**
 * Classical MDS (PCoA) of a distance matrix.
 *
 * Coordinates are `x_ij = √λ_j · v_ij` over the retained axes, which are the `axes` largest
 * eigenvalues that are POSITIVE. A retained slot with no positive eigenvalue left is filled
 * with zeros rather than dropped, so `coordinates` is always `N × axes` and a consumer's index
 * arithmetic never depends on how Euclidean the corpus turned out to be.
 */
export function classicalMds(
  distances: SquareMatrix,
  axes: number,
  labels: readonly string[],
): Embedding {
  const n = distances.n;
  const width = Math.max(0, Math.trunc(axes));
  if (n === 0)
    return {
      coordinates: [],
      eigenvalues: [],
      explainedVariance: Array.from({ length: width }, () => null),
      degenerate: true,
      negativeEigenvalueMass: 0,
      axes: width,
    };

  const { values, vectors } = jacobiEigen(doubleCentered(distances));

  // Descending by eigenvalue, ties by the eigenvector's own label key, so the ORDER of two equal
  // eigenvalues is a function of the corpus rather than of Jacobi's rotation history. The tie
  // test is RELATIVE (AD-67.1): under a permutation two eigenvalues equal in exact arithmetic
  // differ in the last ulp, and an exact `||` never reaches the key at all.
  const spectralScale = values.reduce((peak, value) => Math.max(peak, Math.abs(value)), 0);
  const order = Array.from({ length: n }, (_unused, index) => index).sort((x, y) =>
    tied(cell(values, x), cell(values, y), spectralScale)
      ? compareVectorKeys(vectors, n, x, y, labels)
      : cell(values, y) - cell(values, x),
  );

  const total = values.reduce((sum, value) => sum + Math.abs(value), 0);
  const negative = values.reduce((sum, value) => sum + (value < 0 ? -value : 0), 0);
  // A3b's condition, which governs `explainedVariance` and `negativeEigenvalueMass` — the
  // NARROWER of the two degeneracies, and deliberately not the `degenerate` flag.
  const zeroSpectrum = total === 0;

  const coordinates = new Array<number>(n * width).fill(0);
  const explainedVariance: (number | null)[] = [];
  for (let axis = 0; axis < width; ++axis) {
    // `-1` is "no axis left": `width` may exceed `order.length`, and the two guards below turn
    // that into an all-zero column rather than a dropped one.
    const column = order[axis] ?? -1;
    const eigenvalue = column < 0 ? 0 : cell(values, column);
    // `λ_j / Σ|λ|` — SIGNED (W4 MAJOR-2). An `Math.abs` here credits a NEGATIVE axis with
    // positive variance: it is an imaginary direction, its `coordinates` are all zero because
    // the retention test is `eigenvalue > 0`, and reporting it at `+1.8 %` says the opposite of
    // what it means. Measured on the vendored corpus at `embeddingAxes: 9 = n−1` (legal): axes 7
    // and 8 have eigenvalues `−145738.84` and `−567987.33`, empty coordinates, and were reported
    // at `+0.004664811652368655` and `+0.018180149719632315` — 2.28 % of the variance credited to
    // two axes that are not there. The shares therefore sum to at most 1 and can go below it.
    explainedVariance.push(zeroSpectrum ? null : eigenvalue / total);
    if (column < 0 || !(eigenvalue > 0)) continue;
    const sign = signOf(vectors, n, column, labels);
    const scale = Math.sqrt(eigenvalue) * sign;
    for (let i = 0; i < n; ++i)
      coordinates[i * width + axis] = scale * cell(vectors, i * n + column);
  }

  const descending = order.map((column) => cell(values, column));
  return {
    coordinates,
    eigenvalues: descending,
    explainedVariance,
    degenerate: zeroSpectrum || hasRepeatedAxis(descending, width),
    negativeEigenvalueMass: zeroSpectrum ? 0 : negative / total,
    axes: width,
  };
}

/**
 * Whether a repeated eigenvalue makes the retained basis non-unique (AD-67.1).
 *
 * The spectrum arrives descending. A pair counts when it is adjacent, tied within
 * {@link TIE_EPSILON} of the spectral scale, and reaches the retained axes — which means
 * positions `0 … width`, INCLUSIVE of the first dropped one, because a degeneracy straddling
 * the cut makes the last retained eigenvector just as arbitrary as one wholly inside.
 *
 * At least one of the pair must carry MATERIAL variance, which is what keeps the flag
 * informative rather than universal. Every real corpus has a tail of near-zero eigenvalues all
 * mutually tied at this epsilon; their eigenvectors are indeed arbitrary, but the coordinates
 * they produce are `√λ·v` with `λ` at the noise floor, below the resolution of any plot. So the
 * flag answers the question a reader has: is an axis I can SEE arbitrarily oriented?
 */
function hasRepeatedAxis(descending: readonly number[], width: number): boolean {
  const scale = descending.reduce((peak, value) => Math.max(peak, Math.abs(value)), 0);
  if (scale === 0) return false;
  // Adjacent pairs over the retained prefix, INCLUSIVE of the first dropped axis — hence `+ 1`.
  const retained = descending.slice(0, Math.min(width, descending.length - 1) + 1);
  for (const [here, next] of pairwise(retained)) {
    if (!tied(here, next, scale)) continue;
    if (Math.abs(here) > TIE_EPSILON * scale || Math.abs(next) > TIE_EPSILON * scale) return true;
  }
  return false;
}

/**
 * The sign that puts an eigenvector's largest-magnitude component positive (AD-25.2).
 *
 * Ties on EQUAL magnitude go to the lowest label, not the lowest index: §8 makes every corpus
 * tie label-keyed so that permuting `items` permutes the matrices and relabels the dendrogram
 * and changes nothing else. An all-zero vector gets `+1`, which is a choice and not a
 * computation — there is no largest component to point at.
 */
function signOf(
  vectors: readonly number[],
  n: number,
  column: number,
  labels: readonly string[],
): number {
  // Two passes (W4 CAPITAL-3). Comparing each magnitude against the RUNNING best with `===` left
  // two components equal in exact arithmetic but one ulp apart under a permuted Jacobi never
  // reaching the label branch, so the sign followed the noise and mirrored whole plots: measured
  // on the vendored corpus, `A-tel` anchored at `+634.1636783061936` under four item orders and
  // `−634.1636783061933` under two others. A threshold fixed by the peak is a function of the
  // vector alone, so the candidate SET is the same under every permutation.
  let peak = 0;
  for (let i = 0; i < n; ++i) peak = Math.max(peak, Math.abs(cell(vectors, i * n + column)));
  if (peak === 0) return 1;

  const threshold = peak * (1 - TIE_EPSILON);
  let best = -1;
  for (let i = 0; i < n; ++i) {
    if (Math.abs(cell(vectors, i * n + column)) < threshold) continue;
    if (best < 0 || lower(labels, i, best)) best = i;
  }
  if (best < 0) return 1;
  return cell(vectors, best * n + column) >= 0 ? 1 : -1;
}

/** Two values tied within {@link TIE_EPSILON}, relative to a scale their own magnitudes set. */
function tied(x: number, y: number, scale: number): boolean {
  return Math.abs(x - y) <= TIE_EPSILON * Math.max(scale, Math.abs(x), Math.abs(y));
}

/** A total order on two eigenvectors, for the equal-eigenvalue tie: their sign-fixed profiles. */
function compareVectorKeys(
  vectors: readonly number[],
  n: number,
  x: number,
  y: number,
  labels: readonly string[],
): number {
  const signX = signOf(vectors, n, x, labels);
  const signY = signOf(vectors, n, y, labels);
  // Relative again, and against the two vectors' own peak: components are unit-normalized, so
  // an absolute epsilon would be a different rule for a 3-item corpus than for a 200-item one.
  let peak = 0;
  for (let i = 0; i < n; ++i)
    peak = Math.max(peak, Math.abs(cell(vectors, i * n + x)), Math.abs(cell(vectors, i * n + y)));
  for (let i = 0; i < n; ++i) {
    const componentX = signX * cell(vectors, i * n + x);
    const componentY = signY * cell(vectors, i * n + y);
    if (tied(componentX, componentY, peak)) continue;
    return componentX < componentY ? -1 : 1;
  }
  return x - y;
}

function lower(labels: readonly string[], i: number, j: number): boolean {
  // Code-unit order, never `localeCompare` — locale dependence would break R2's byte-identity.
  return (labels[i] ?? '') < (labels[j] ?? '');
}

/**
 * §8's seriation: order by the first MDS coordinate, ties by label.
 *
 * Optimal leaf ordering is `O(N³)` and affordable at `N ≤ 256`, but the first coordinate is
 * deterministic, free once the MDS is computed, and good enough for the distance heatmap the
 * ordering is for.
 */
export function seriationOrder(embedding: Embedding, labels: readonly string[]): readonly number[] {
  const n = embedding.axes === 0 ? labels.length : embedding.coordinates.length / embedding.axes;
  const order = Array.from({ length: n }, (_unused, index) => index);
  if (embedding.axes === 0) return order;

  const first = (item: number) => cell(embedding.coordinates, item * embedding.axes);
  const scale = order.reduce((peak, item) => Math.max(peak, Math.abs(first(item))), 0);

  // Sorted by LABEL first, then by coordinate, with a RELATIVE comparison (W4 CAPITAL-3). An
  // exact `||` never reached the label branch, because a permuted Jacobi puts two equal
  // coordinates one ulp apart and the published order then followed the noise: measured at 7
  // distinct seriations over 20 permutations of one six-item corpus, with `A-tel-1`'s own
  // coordinate taking 16 distinct values, all `≈ −45.2370019107607`. An epsilon comparison is not
  // transitive, so `sort`'s pivot choices can still see a chain of near-ties; seeding it with the
  // LABEL order rather than the caller's index order makes even that outcome a function of the
  // corpus. `Array.prototype.sort` is stable (ES2019), so the seed survives every comparison that
  // returns 0.
  //
  // `byLabel` must be TOTAL at both sorts: `lower(...) ? -1 : 1` answers 1 in both directions for
  // equal labels, which is not a comparator and reintroduces the caller's order through the back
  // door (MINOR-R5). The index fallback settles genuinely equal labels.
  const byLabel = (x: number, y: number) =>
    lower(labels, x, y) ? -1 : lower(labels, y, x) ? 1 : x - y;
  order.sort(byLabel);
  return order.sort((x, y) =>
    tied(first(x), first(y), scale) ? byLabel(x, y) : first(x) - first(y),
  );
}
