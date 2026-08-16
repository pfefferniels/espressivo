/**
 * §8's embedding: classical MDS by cyclic Jacobi, and the seriation that falls out of it.
 *
 * Nothing here knows what a performance is. The input is a symmetric distance matrix in the
 * row-major `N²` layout §8 pins, plus the LABELS every tie is broken on (AD-25.2), and the
 * output is plain data. That is `aggregate.ts`'s shape and `editScript.ts`'s: an algorithm over
 * an interface can be gated on its own.
 *
 * ## Honest about a non-Euclidean input
 *
 * `D` here is an `L¹`-type sum and is generally NOT Euclidean, so `B = −½ J D⁽²⁾ J` has negative
 * eigenvalues. Three things are therefore reported ALWAYS, and the third is the one the
 * literature keeps asking for:
 *
 * - the full eigenvalue spectrum, not the retained part;
 * - explained variance over `Σ|λ|`, never over `Σλ⁺` — the latter flatters the result by
 *   pretending the negative mass is not there;
 * - `negativeEigenvalueMass = Σ|λ⁻| / Σ|λ|`, the explicit "how non-Euclidean is this?" figure.
 *
 * ## Determinism
 *
 * The sweep order is fixed `(p, q)` ascending, so the rotations are a function of the input.
 * Eigenvectors are defined up to sign and the sign is FIXED — largest-magnitude component
 * positive, ties by lowest LABEL — because without it two runs produce mirror-image plots and
 * §10's P-C6 would be false for a reason that has nothing to do with the metric.
 */

/** A symmetric matrix in §8's layout: `n` rows of `n`, row-major, `m[i*n + j]`. */
export interface SquareMatrix {
  readonly n: number;
  readonly values: readonly number[];
}

export interface Embedding {
  /** `N × axes`, row-major. */
  readonly coordinates: readonly number[];
  /** The FULL spectrum, descending — not only the retained axes. */
  readonly eigenvalues: readonly number[];
  /** Per retained axis, `λ_j / Σ|λ|`; every entry null exactly when `Σ|λ| = 0` (A3b). */
  readonly explainedVariance: readonly (number | null)[];
  /** True exactly when `Σ|λ| = 0` — one document listed twice, or a corpus of equals. */
  readonly degenerate: boolean;
  /** `Σ|λ⁻| / Σ|λ|`, or 0 in the degenerate case. */
  readonly negativeEigenvalueMass: number;
  readonly axes: number;
}

/** Off-diagonal Frobenius norm relative to the whole matrix — Jacobi's stopping rule. */
const JACOBI_TOLERANCE = 1e-12;

/** A cap, so the loop terminates on any input; the tolerance is reached long before it. */
const JACOBI_MAX_SWEEPS = 100;

/**
 * The symmetric eigenproblem by CYCLIC Jacobi, in a fixed sweep order.
 *
 * Returns eigenvalues and eigenvectors as columns of `vectors` (`vectors[i*n + j]` is component
 * `i` of eigenvector `j`), unsorted. ~60 lines and no dependency, which is what §5 of
 * survey-algo promises; quadratic convergence makes the sweep count small in practice.
 */
export function jacobiEigen(matrix: SquareMatrix): {
  readonly values: readonly number[];
  readonly vectors: readonly number[];
} {
  const n = matrix.n;
  const a = [...matrix.values];
  const v = new Array<number>(n * n).fill(0);
  for (let i = 0; i < n; ++i) v[i * n + i] = 1;

  const norm = Math.hypot(...a);
  const threshold = JACOBI_TOLERANCE * (norm === 0 ? 1 : norm);

  for (let sweep = 0; sweep < JACOBI_MAX_SWEEPS; ++sweep) {
    let off = 0;
    for (let p = 0; p < n; ++p)
      for (let q = p + 1; q < n; ++q) off += 2 * a[p * n + q] * a[p * n + q];
    if (Math.sqrt(off) <= threshold) break;

    for (let p = 0; p < n; ++p)
      for (let q = p + 1; q < n; ++q) {
        const apq = a[p * n + q];
        if (apq === 0) continue;
        // The standard stable form: `t` is the smaller root of `t² + 2θt − 1 = 0`, computed
        // without cancellation, and `θ` is guarded against overflow for a nearly-diagonal pair.
        const theta = (a[q * n + q] - a[p * n + p]) / (2 * apq);
        const t =
          theta >= 0
            ? 1 / (theta + Math.sqrt(1 + theta * theta))
            : -1 / (-theta + Math.sqrt(1 + theta * theta));
        const c = 1 / Math.sqrt(1 + t * t);
        const s = t * c;

        for (let k = 0; k < n; ++k) {
          const akp = a[k * n + p];
          const akq = a[k * n + q];
          a[k * n + p] = c * akp - s * akq;
          a[k * n + q] = s * akp + c * akq;
        }
        for (let k = 0; k < n; ++k) {
          const apk = a[p * n + k];
          const aqk = a[q * n + k];
          a[p * n + k] = c * apk - s * aqk;
          a[q * n + k] = s * apk + c * aqk;
        }
        for (let k = 0; k < n; ++k) {
          const vkp = v[k * n + p];
          const vkq = v[k * n + q];
          v[k * n + p] = c * vkp - s * vkq;
          v[k * n + q] = s * vkp + c * vkq;
        }
      }
  }

  return { values: Array.from({ length: n }, (_unused, i) => a[i * n + i]), vectors: v };
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
    for (let j = 0; j < n; ++j) total += squared[i * n + j];
    rowMean[i] = total / n;
    grand += total;
  }
  grand /= n * n;

  const values = new Array<number>(n * n);
  for (let i = 0; i < n; ++i)
    for (let j = 0; j < n; ++j)
      values[i * n + j] = -0.5 * (squared[i * n + j] - rowMean[i] - rowMean[j] + grand);
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

  // Descending by eigenvalue, ties by the eigenvector's own label key, so the ORDER of two
  // equal eigenvalues is a function of the corpus rather than of Jacobi's rotation history.
  const order = Array.from({ length: n }, (_unused, index) => index).sort(
    (x, y) => values[y] - values[x] || compareVectorKeys(vectors, n, x, y, labels),
  );

  const total = values.reduce((sum, value) => sum + Math.abs(value), 0);
  const negative = values.reduce((sum, value) => sum + (value < 0 ? -value : 0), 0);
  const degenerate = total === 0;

  const coordinates = new Array<number>(n * width).fill(0);
  const explainedVariance: (number | null)[] = [];
  for (let axis = 0; axis < width; ++axis) {
    // A BOUNDS test rather than an `=== undefined` test on the indexed read: this project does
    // not set `noUncheckedIndexedAccess`, so the read is typed non-optional and the guard would
    // be deleted as unreachable by `no-unnecessary-condition` (`document.ts`'s own note).
    const column = axis < order.length ? order[axis] : -1;
    const eigenvalue = column < 0 ? 0 : values[column];
    explainedVariance.push(degenerate ? null : Math.abs(eigenvalue) / total);
    if (column < 0 || !(eigenvalue > 0)) continue;
    const sign = signOf(vectors, n, column, labels);
    const scale = Math.sqrt(eigenvalue) * sign;
    for (let i = 0; i < n; ++i) coordinates[i * width + axis] = scale * vectors[i * n + column];
  }

  return {
    coordinates,
    eigenvalues: order.map((column) => values[column]),
    explainedVariance,
    degenerate,
    negativeEigenvalueMass: degenerate ? 0 : negative / total,
    axes: width,
  };
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
  let best = -1;
  let bestMagnitude = -1;
  for (let i = 0; i < n; ++i) {
    const magnitude = Math.abs(vectors[i * n + column]);
    if (
      magnitude > bestMagnitude ||
      (magnitude === bestMagnitude && best >= 0 && lower(labels, i, best))
    ) {
      bestMagnitude = magnitude;
      best = i;
    }
  }
  if (best < 0 || bestMagnitude === 0) return 1;
  return vectors[best * n + column] >= 0 ? 1 : -1;
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
  for (let i = 0; i < n; ++i) {
    const delta = signX * vectors[i * n + x] - signY * vectors[i * n + y];
    if (delta !== 0) return delta < 0 ? -1 : 1;
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
 * The cheap version survey-algo recommends. Optimal leaf ordering is `O(N³)` and affordable at
 * `N ≤ 256`, but the first coordinate is deterministic, free once the MDS is computed, and good
 * enough for a distance heatmap — which is what the ordering is for.
 */
export function seriationOrder(embedding: Embedding, labels: readonly string[]): readonly number[] {
  const n = embedding.axes === 0 ? labels.length : embedding.coordinates.length / embedding.axes;
  const order = Array.from({ length: n }, (_unused, index) => index);
  if (embedding.axes === 0) return order;
  return order.sort(
    (x, y) =>
      embedding.coordinates[x * embedding.axes] - embedding.coordinates[y * embedding.axes] ||
      (lower(labels, x, y) ? -1 : 1),
  );
}
