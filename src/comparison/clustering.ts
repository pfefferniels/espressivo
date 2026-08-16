/**
 * §8's clustering: Lance–Williams agglomeration, PAM, and the silhouette that guides `k`.
 *
 * Plain data in, plain data out, and every tie broken on a LABEL. That last part is the whole
 * of AD-25.2 and it is not pedantry: exact ties are STRUCTURAL here rather than measure-zero.
 * P-C1 makes `compare(A, A)` exactly 0, R6's never-drop rule makes `both-neutral` dimensions
 * produce large blocks of exactly-equal distances, and §8's item expansion makes duplicate
 * content easy to introduce by accident. Under index-based rules a tie that resolved to `(0,3)`
 * before a permutation resolves to `(1,2)` after — a DIFFERENT merge, not a relabeling — and
 * P-C6's corpus clause would be false.
 */

/** §8's five linkages. `ward.D2` is named in full because `ward.D` is a silent-wrong-answer trap. */
export type Linkage = 'average' | 'single' | 'complete' | 'weighted' | 'ward.D2';

export interface DendrogramMerge {
  /** Cluster ids in the SciPy/`hclust` convention: `0..n-1` are leaves, `n+i` the `i`-th merge. */
  readonly left: number;
  readonly right: number;
  /** The dissimilarity at which the merge happened, in the matrix's own units. */
  readonly height: number;
  /** How many leaves the merged cluster contains. */
  readonly size: number;
}

export interface Dendrogram {
  readonly merges: readonly DendrogramMerge[];
  /** A leaf order for plotting: depth-first, children by smallest contained label. */
  readonly order: readonly number[];
}

/** `m[i*n + j]`, symmetric, zero diagonal — §8's layout. */
export interface DistanceMatrix {
  readonly n: number;
  readonly values: readonly number[];
}

/**
 * The Lance–Williams coefficients, per §2.F's table.
 *
 * `ward.D2` runs the recurrence on SQUARED dissimilarities and reports `√height`, which is what
 * `hclust(method = "ward.D2")` does and what makes it the defensible one of the two Ward
 * spellings. Its RECURRENCE remains valid on a non-Euclidean input (Székely & Rizzo 2005;
 * Strauss & von Maltitz 2017) while its minimum-variance INTERPRETATION does not
 * (Murtagh & Legendre 2014) — the docs say so, because `D` here is an `L¹`-type sum and is
 * generally not Euclidean.
 */
function lanceWilliams(
  linkage: Linkage,
  dIm: number,
  dJm: number,
  dIj: number,
  sizeI: number,
  sizeJ: number,
  sizeM: number,
): number {
  switch (linkage) {
    // `Math.min`/`Math.max` rather than the table's `½a + ½b ∓ ½|a−b|`. The two are the same
    // number in exact arithmetic and NOT the same double: measured on a 4-item corpus, the
    // nested form gave a final single-linkage height of 6.699999999999999 where the matrix
    // entry it is supposed to BE reads 6.7. A merge height is published data a consumer plots
    // and compares, so it is worth the ulp — and the definition is the min, not the average of
    // two numbers minus half their gap.
    case 'single':
      return Math.min(dIm, dJm);
    case 'complete':
      return Math.max(dIm, dJm);
    case 'weighted':
      return 0.5 * dIm + 0.5 * dJm;
    case 'ward.D2': {
      const total = sizeI + sizeJ + sizeM;
      return ((sizeI + sizeM) * dIm + (sizeJ + sizeM) * dJm - sizeM * dIj) / total;
    }
    default: {
      const total = sizeI + sizeJ;
      return (sizeI * dIm + sizeJ * dJm) / total;
    }
  }
}

/** Code-unit order (`<`), never `localeCompare` — locale dependence would break R2. */
function lower(x: string, y: string): boolean {
  return x < y;
}

/**
 * Agglomerative clustering by the naive `O(N³)` Lance–Williams update.
 *
 * `N ≤ 256` (R10/C17), so the naive form is `1.7·10⁷` operations at the ceiling and needs no
 * nearest-neighbour chain. Determinism is the selection criterion here, not speed.
 *
 * Ties merge the pair whose `(min label, max label)` is lexicographically smallest, where a
 * cluster's label is the smallest label it contains — the same key the child order uses, so a
 * tie and a child order cannot disagree about which cluster is "first".
 */
export function agglomerate(
  matrix: DistanceMatrix,
  linkage: Linkage,
  labels: readonly string[],
): Dendrogram {
  const n = matrix.n;
  if (n === 0) return { merges: [], order: [] };
  if (n === 1) return { merges: [], order: [0] };

  // `ward.D2` agglomerates on squares and reports roots; every other linkage is its own units.
  const squared = linkage === 'ward.D2';
  const working = new Map<number, Map<number, number>>();
  const size = new Map<number, number>();
  const minLabel = new Map<number, string>();
  const contains = new Map<number, readonly number[]>();

  for (let i = 0; i < n; ++i) {
    const row = new Map<number, number>();
    for (let j = 0; j < n; ++j) {
      if (i === j) continue;
      const value = matrix.values[i * n + j];
      row.set(j, squared ? value * value : value);
    }
    working.set(i, row);
    size.set(i, 1);
    minLabel.set(i, labels[i] ?? '');
    contains.set(i, [i]);
  }

  const merges: DendrogramMerge[] = [];
  const children = new Map<number, readonly [number, number]>();
  let next = n;

  while (working.size > 1) {
    let bestI = -1;
    let bestJ = -1;
    let bestValue = Number.POSITIVE_INFINITY;
    let bestKey: readonly [string, string] = ['', ''];

    for (const [i, row] of working)
      for (const [j, value] of row) {
        if (j <= i) continue;
        const labelI = minLabel.get(i) ?? '';
        const labelJ = minLabel.get(j) ?? '';
        const key: readonly [string, string] = lower(labelI, labelJ)
          ? [labelI, labelJ]
          : [labelJ, labelI];
        if (
          value < bestValue ||
          (value === bestValue &&
            bestI >= 0 &&
            (lower(key[0], bestKey[0]) || (key[0] === bestKey[0] && lower(key[1], bestKey[1]))))
        ) {
          bestValue = value;
          bestI = i;
          bestJ = j;
          bestKey = key;
        }
      }

    if (bestI < 0 || bestJ < 0) break;

    const sizeI = size.get(bestI) ?? 1;
    const sizeJ = size.get(bestJ) ?? 1;
    const dIj = working.get(bestI)?.get(bestJ) ?? 0;

    // Children ordered by smallest contained label, so the dendrogram RELABELS under a
    // permutation of the items rather than restructuring (P-C6's corpus clause).
    const labelI = minLabel.get(bestI) ?? '';
    const labelJ = minLabel.get(bestJ) ?? '';
    const [left, right] = lower(labelI, labelJ) ? [bestI, bestJ] : [bestJ, bestI];

    const merged = next++;
    merges.push({
      left,
      right,
      height: squared ? Math.sqrt(Math.max(0, dIj)) : dIj,
      size: sizeI + sizeJ,
    });
    children.set(merged, [left, right]);
    contains.set(merged, [...(contains.get(left) ?? []), ...(contains.get(right) ?? [])]);
    size.set(merged, sizeI + sizeJ);
    minLabel.set(merged, lower(labelI, labelJ) ? labelI : labelJ);

    const row = new Map<number, number>();
    for (const [m, dIm] of working.get(bestI) ?? []) {
      if (m === bestJ) continue;
      const dJm = working.get(bestJ)?.get(m);
      if (dJm === undefined) continue;
      row.set(m, lanceWilliams(linkage, dIm, dJm, dIj, sizeI, sizeJ, size.get(m) ?? 1));
    }

    working.delete(bestI);
    working.delete(bestJ);
    for (const other of working.values()) {
      other.delete(bestI);
      other.delete(bestJ);
    }
    for (const [m, value] of row) working.get(m)?.set(merged, value);
    working.set(merged, row);
  }

  // The plot order: depth-first from the last merge, children as recorded.
  const order: number[] = [];
  const walk = (node: number): void => {
    const pair = children.get(node);
    if (pair === undefined) {
      order.push(node);
      return;
    }
    walk(pair[0]);
    walk(pair[1]);
  };
  for (const root of working.keys()) walk(root);

  return { merges, order };
}

// ---------------------------------------------------------------------------
// PAM
// ---------------------------------------------------------------------------

export interface Partition {
  /** Indices into `labels`; medoids are REAL performances, which is the point (§2.F). */
  readonly medoids: readonly number[];
  /** Per item, the index into {@link medoids} of the cluster it belongs to. */
  readonly clusters: readonly number[];
  /** `Σ_i d(i, nearest medoid)` — what BUILD and SWAP minimize. */
  readonly cost: number;
  /**
   * Whether the medoid set is the GLOBAL optimum rather than a swap-local one.
   *
   * BUILD + SWAP is a heuristic and it misses: measured over 200 random corpora of 4–7 items,
   * it landed above the exhaustive optimum **12 times, worst excess 41 %**. A medoid is the one
   * corpus product whose entire value is naming a real performer — "the most typical Hofmann" —
   * so a 41 % worse answer is not a rounding matter. Where the search space is small enough
   * (see {@link PAM_EXHAUSTIVE_LIMIT}) every `k`-subset is scored and this is `true`; above it
   * the heuristic stands and this is `false`, which is a fact the report states rather than a
   * quality a caller has to assume.
   */
  readonly exhaustive: boolean;
}

/**
 * The largest `C(n, k)` the exhaustive pass will enumerate [convention].
 *
 * Each candidate costs `O(n·k)`, so `2·10⁵` subsets is a few tens of millions of operations —
 * about a second at the ceiling and instant on anything a hand-assembled corpus produces. It
 * covers every vendored corpus outright, and a 121-item folder at `k = 2` (`7260` subsets); a
 * 121-item folder at `k = 3` is `2.9·10⁵` and falls back to PAM, which the field records.
 */
export const PAM_EXHAUSTIVE_LIMIT = 200_000;

/** `C(n, k)`, saturating at `limit + 1` so a huge corpus cannot overflow the count. */
function chooseCount(n: number, k: number, limit: number): number {
  let total = 1;
  for (let step = 0; step < k; ++step) {
    total = (total * (n - step)) / (step + 1);
    if (total > limit) return limit + 1;
  }
  return Math.round(total);
}

/** The globally cheapest `k`-subset, ties by the label sequence. Null where the space is too big. */
function exhaustiveMedoids(
  matrix: DistanceMatrix,
  k: number,
  labels: readonly string[],
): readonly number[] | null {
  const n = matrix.n;
  if (chooseCount(n, k, PAM_EXHAUSTIVE_LIMIT) > PAM_EXHAUSTIVE_LIMIT) return null;

  let best: readonly number[] | null = null;
  let bestCost = Number.POSITIVE_INFINITY;
  const walk = (start: number, chosen: readonly number[]): void => {
    if (chosen.length === k) {
      const cost = partitionCost(matrix, chosen, labels);
      const key = chosen.map((index) => labels[index] ?? '').join('\u0000');
      const bestKey = best === null ? '' : best.map((index) => labels[index] ?? '').join('\u0000');
      if (cost < bestCost || (cost === bestCost && best !== null && lower(key, bestKey))) {
        bestCost = cost;
        best = chosen;
      }
      return;
    }
    for (let index = start; index < n; ++index) walk(index + 1, [...chosen, index]);
  };
  walk(0, []);
  return best;
}

const at = (matrix: DistanceMatrix, i: number, j: number): number =>
  matrix.values[i * matrix.n + j];

/** The nearest medoid's position in `medoids`, ties by lowest LABEL. */
function nearestMedoid(
  matrix: DistanceMatrix,
  medoids: readonly number[],
  item: number,
  labels: readonly string[],
): number {
  let best = 0;
  let bestValue = Number.POSITIVE_INFINITY;
  for (const [position, medoid] of medoids.entries()) {
    const value = at(matrix, item, medoid);
    if (
      value < bestValue ||
      (value === bestValue && lower(labels[medoid] ?? '', labels[medoids[best]] ?? ''))
    ) {
      bestValue = value;
      best = position;
    }
  }
  return best;
}

function partitionCost(
  matrix: DistanceMatrix,
  medoids: readonly number[],
  labels: readonly string[],
): number {
  let total = 0;
  for (let i = 0; i < matrix.n; ++i)
    total += at(matrix, i, medoids[nearestMedoid(matrix, medoids, i, labels)]);
  return total;
}

/**
 * k-medoids by BUILD + SWAP, with every tie on the lowest label.
 *
 * PAM rather than k-means because its exemplars are REAL performances — "the most typical
 * Hofmann" — which is musicologically usable where a centroid corresponding to no recording is
 * not. That is also why §8 requires labels unique after expansion: two documents legitimately
 * labelled `"Welte 1905"` would make the medoid ambiguous, and ambiguity is the one thing this
 * product cannot have.
 */
export function pam(
  matrix: DistanceMatrix,
  k: number,
  labels: readonly string[],
): Partition | null {
  const n = matrix.n;
  if (n === 0 || k <= 0 || k > n) return null;

  // BUILD: the first medoid minimizes the total distance to everything; each further one is
  // the candidate whose addition reduces the total most.
  const medoids: number[] = [];
  for (let step = 0; step < k; ++step) {
    let best = -1;
    let bestCost = Number.POSITIVE_INFINITY;
    for (let candidate = 0; candidate < n; ++candidate) {
      if (medoids.includes(candidate)) continue;
      const cost = partitionCost(matrix, [...medoids, candidate], labels);
      if (
        cost < bestCost ||
        (cost === bestCost && best >= 0 && lower(labels[candidate] ?? '', labels[best] ?? ''))
      ) {
        bestCost = cost;
        best = candidate;
      }
    }
    if (best < 0) break;
    medoids.push(best);
  }

  // SWAP: exchange one medoid for one non-medoid while that reduces the total. Bounded by `n·k`
  // iterations so the loop terminates on any input, which a strict-improvement rule already
  // gives but which is worth being explicit about.
  let cost = partitionCost(matrix, medoids, labels);
  for (let iteration = 0; iteration < n * k; ++iteration) {
    let bestCost = cost;
    let bestOut = -1;
    let bestIn = -1;
    for (const [position, medoid] of medoids.entries())
      for (let candidate = 0; candidate < n; ++candidate) {
        if (medoids.includes(candidate)) continue;
        const trial = [...medoids];
        trial[position] = candidate;
        const trialCost = partitionCost(matrix, trial, labels);
        const better =
          trialCost < bestCost ||
          (trialCost === bestCost &&
            bestOut >= 0 &&
            (lower(labels[medoid] ?? '', labels[bestOut] ?? '') ||
              (labels[medoid] === labels[bestOut] &&
                lower(labels[candidate] ?? '', labels[bestIn] ?? ''))));
        if (better) {
          bestCost = trialCost;
          bestOut = medoid;
          bestIn = candidate;
        }
      }
    if (bestOut < 0) break;
    medoids[medoids.indexOf(bestOut)] = bestIn;
    cost = bestCost;
  }

  // Where the space allows, replace the heuristic's answer with the global optimum outright.
  const exact = exhaustiveMedoids(matrix, k, labels);
  const chosen = exact === null ? medoids : [...exact];

  // Reported in label order, so the medoid list itself is permutation-equivariant.
  chosen.sort((x, y) => (lower(labels[x] ?? '', labels[y] ?? '') ? -1 : 1));
  const clusters = Array.from({ length: n }, (_unused, item) =>
    nearestMedoid(matrix, chosen, item, labels),
  );
  return {
    medoids: chosen,
    clusters,
    cost: partitionCost(matrix, chosen, labels),
    exhaustive: exact !== null,
  };
}

/**
 * Silhouette per item: `s(i) = (b − a) / max(a, b)`, valid on any dissimilarity.
 *
 * Two conventions, both §2.F's: a singleton cluster scores 0 (there is no `a` to compute), and
 * `max(a, b) = 0` scores 0 rather than `0/0`. At `N < 20` the figure is noisy and §8 carries
 * that as a REPORTED FIELD rather than as prose — `silhouetteReliable` — so a caller cannot
 * read a cluster count off it without seeing the caveat.
 */
export function silhouette(matrix: DistanceMatrix, clusters: readonly number[]): readonly number[] {
  const n = matrix.n;
  const groups = new Map<number, number[]>();
  for (const [item, cluster] of clusters.entries()) {
    const members = groups.get(cluster);
    if (members === undefined) groups.set(cluster, [item]);
    else members.push(item);
  }

  return Array.from({ length: n }, (_unused, item) => {
    const own = groups.get(clusters[item]) ?? [item];
    if (own.length <= 1) return 0;

    let a = 0;
    for (const other of own) if (other !== item) a += at(matrix, item, other);
    a /= own.length - 1;

    let b = Number.POSITIVE_INFINITY;
    for (const [cluster, members] of groups) {
      if (cluster === clusters[item] || members.length === 0) continue;
      let total = 0;
      for (const other of members) total += at(matrix, item, other);
      b = Math.min(b, total / members.length);
    }
    if (!Number.isFinite(b)) return 0;

    const scale = Math.max(a, b);
    return scale === 0 ? 0 : (b - a) / scale;
  });
}

/** §8's `silhouetteReliable`: the figure is noisy below this and the field says so (A22). */
export const SILHOUETTE_RELIABLE_MINIMUM = 20;
