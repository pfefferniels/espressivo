/**
 * §8's clustering: Lance–Williams agglomeration, PAM, and the silhouette that guides `k`.
 *
 * Plain data in, plain data out, and every tie broken on a label (AD-25.2). Exact ties are
 * structural here rather than measure-zero: P-C1 makes `compare(A, A)` exactly 0, R6's
 * never-drop rule makes `both-neutral` dimensions produce large blocks of exactly-equal
 * distances, and §8's item expansion makes duplicate content easy to introduce by accident.
 * Under index-based rules a tie that resolved to `(0,3)` before a permutation resolves to
 * `(1,2)` after — a different merge, not a relabeling — and P-C6's corpus clause would be false.
 */

import { elementAt, numberAt } from '../prelude/seq.js';

/** What an out-of-range read into one of this module's sequences is called (`indexing.ts`). */
const MATRIX = "the distance matrix's flat N x N buffer";
const MEDOIDS = 'the medoid list';

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
 * `ward.D2` runs the recurrence on squared dissimilarities and reports `√height`, as
 * `hclust(method = "ward.D2")` does. Its recurrence stays valid on a non-Euclidean input
 * (Székely & Rizzo 2005; Strauss & von Maltitz 2017) while its minimum-variance interpretation
 * does not (Murtagh & Legendre 2014) — which the docs state, because `D` here is an `L¹`-type
 * sum and generally not Euclidean.
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
    // `Math.min`/`Math.max` rather than the table's `½a + ½b ∓ ½|a−b|`: the same number in
    // exact arithmetic, not the same double. Measured on a 4-item corpus, the nested form gave
    // a final single-linkage height of 6.699999999999999 where the matrix entry it is supposed
    // to be reads 6.7. A merge height is published data a consumer plots and compares.
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
    // Named rather than left to a `default`, so that a sixth linkage is a compile error
    // instead of silently being computed as an average.
    case 'average': {
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
 * A total order on item indices by label, falling back to the index where labels are equal.
 *
 * `lower(a, b) ? -1 : 1` is not a comparator: it answers `1` in both directions for two equal
 * labels, which puts `Array.prototype.sort` in unspecified territory (W4 MINOR-R5). §8 requires
 * labels unique after expansion, so `compareMpmCorpus` never reaches the tie; a direct caller of
 * `pam`, `silhouette` or `agglomerate` can.
 *
 * It does not make the products permutation-invariant under duplicate labels: `pam`'s cost still
 * takes 2-3 distinct values over 40 permutations at `n = 12` with duplicated labels, and the
 * index fallback cannot help because the index is what a permutation changes. The cause is one
 * level up, in {@link exhaustiveMedoids}' tie key — two subsets with different costs can share a
 * label multiset, and in the only frame the corpus has they are the same subset. That is why §8
 * requires unique labels, enforced by `compareMpmCorpus` before any of this runs.
 */
function byLabelThenIndex(labels: readonly string[], x: number, y: number): number {
  const left = labels[x] ?? '';
  const right = labels[y] ?? '';
  return lower(left, right) ? -1 : lower(right, left) ? 1 : x - y;
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
      const value = at(matrix, i, j);
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

    // Children ordered by smallest contained label, so a permutation of the items relabels the
    // dendrogram rather than restructuring it (P-C6's corpus clause).
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
  /** Indices into `labels`; medoids are real performances, which is the point (§2.F). */
  readonly medoids: readonly number[];
  /** Per item, the index into {@link medoids} of the cluster it belongs to. */
  readonly clusters: readonly number[];
  /** `Σ_i d(i, nearest medoid)` — what BUILD and SWAP minimize. */
  readonly cost: number;
  /**
   * Whether the medoid set is the global optimum rather than a swap-local one.
   *
   * BUILD + SWAP is a heuristic and it misses: measured over 200 random corpora of 4–7 items, it
   * landed above the exhaustive optimum 12 times, worst excess 41 %. A medoid's entire value is
   * naming a real performer — "the most typical Hofmann" — so a 41 % worse answer matters. Where
   * the search space is small enough (see {@link PAM_EXHAUSTIVE_LIMIT}) every `k`-subset is
   * scored and this is `true`; above it the heuristic stands and this is `false`, which the
   * report states rather than leaving a caller to assume.
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

/**
 * `C(n, k)`, saturating at `limit + 1` so a huge corpus cannot overflow the count.
 *
 * The `Math.min(k, n − k)` is `C(n, k) = C(n, n − k)`, and it is load-bearing (W4 MAJOR-3).
 * Multiplying up to `k` walks along the row, and `C(n, j)` is unimodal: an intermediate product
 * can blow the limit while the answer itself is tiny. Swept over the legal domain
 * (`n ≤ DEFAULT_MAX_ITEMS = 256`, `1 ≤ k ≤ n`) the unsymmetrized form reported `limit + 1` for
 * 841 pairs whose true `C(n, k)` is at or below the limit, the smallest being `n = 21, k = 21`
 * where `C = 1`. Each got `exhaustive: false` and a note saying the count was past the limit —
 * false in the safe direction (`n = 26, k = 24` is `C = 325`): the optimum was given up, never
 * wrongly claimed.
 */
function chooseCount(n: number, k: number, limit: number): number {
  const steps = Math.min(k, n - k);
  if (steps < 0) return 0;
  let total = 1;
  for (let step = 0; step < steps; ++step) {
    total = (total * (n - step)) / (step + 1);
    if (total > limit) return limit + 1;
  }
  return Math.round(total);
}

/**
 * The globally cheapest `k`-subset, ties by the sorted label sequence. Null where the space is
 * too big.
 *
 * The sort is AD-25.2 at this call site (W4 CAPITAL-2). `walk` enumerates subsets in ascending
 * index order, so an unsorted key is the subset's labels *in the caller's own item order* —
 * label-valued but index-ordered, which is not a tie rule at all: two cost-equal subsets compare
 * differently depending on how the corpus was listed. Measured before the sort, on
 * `[0,0,2,2, 0,0,2,2, 2,2,0,0, 2,2,0,0]` with labels `['L02','L00','L01','L03']` and `k = 2`:
 * `{L00,L01}` under 20 of the 24 permutations and `{L00,L03}` under the other 4, both claiming
 * to be the exhaustive global optimum. `k = 1` was immune throughout, because a one-element key
 * has no order — which is why the corpus medoid feeding `profiles` and the corpus scape never
 * showed it.
 */
function exhaustiveMedoids(
  matrix: DistanceMatrix,
  k: number,
  labels: readonly string[],
  order: readonly number[],
): readonly number[] | null {
  const n = matrix.n;
  if (chooseCount(n, k, PAM_EXHAUSTIVE_LIMIT) > PAM_EXHAUSTIVE_LIMIT) return null;

  const keyOf = (subset: readonly number[]): string =>
    subset
      .map((index) => labels[index] ?? '')
      .sort()
      .join('\u0000');

  let best: readonly number[] | null = null;
  let bestKey = '';
  let bestCost = Number.POSITIVE_INFINITY;
  const walk = (start: number, chosen: readonly number[]): void => {
    if (chosen.length === k) {
      const cost = partitionCost(matrix, chosen, labels, order);
      // Only a tie needs a key, and a tie is the rare case: computing one per candidate would
      // put an `O(k log k)` sort inside the hot loop of a `2·10⁵`-subset enumeration.
      if (cost > bestCost) return;
      const key = keyOf(chosen);
      if (cost < bestCost || (best !== null && lower(key, bestKey))) {
        bestCost = cost;
        bestKey = key;
        best = chosen;
      }
      return;
    }
    // Prune the branches that cannot reach `k`. This belongs with `chooseCount`'s symmetry and
    // not after it (W4 MAJOR-3): without the guard the walk visits `Σ_{j≤k} C(n, j)` nodes, so
    // correcting the count alone turns a false flag into a hang — measured, `pam(n = 30,
    // k = 28)` went from 1 ms to 51054 ms. With it the walk visits exactly `C(n, k)` leaves,
    // which is what the limit sizes.
    if (n - start < k - chosen.length) return;
    for (let index = start; index < n; ++index) walk(index + 1, [...chosen, index]);
  };
  walk(0, []);
  return best;
}

const at = (matrix: DistanceMatrix, i: number, j: number): number =>
  numberAt(matrix.values, i * matrix.n + j, MATRIX);

/** The nearest medoid's position in `medoids`, ties by lowest label. */
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
      (value === bestValue &&
        lower(labels[medoid] ?? '', labels[elementAt(medoids, best, MEDOIDS)] ?? ''))
    ) {
      bestValue = value;
      best = position;
    }
  }
  return best;
}

/**
 * Item indices in label order — the sequence every cost is summed in.
 *
 * Computed once per `pam` call and threaded down, because it sits inside the exhaustive walk's
 * hot loop and sorting `n` labels per candidate would be `O(C(n,k)·n log n)`.
 */
function labelOrder(n: number, labels: readonly string[]): readonly number[] {
  return Array.from({ length: n }, (_unused, index) => index).sort((x, y) =>
    byLabelThenIndex(labels, x, y),
  );
}

/**
 * The objective PAM minimizes: every item's distance to its nearest medoid.
 *
 * Summed in label order, not the caller's item order. Floating-point addition is not
 * associative, so a permuted corpus adds the same numbers in a different sequence and two
 * genuinely cost-equal subsets come out differing by an ulp; `exhaustiveMedoids` then decides on
 * `cost < bestCost` and AD-25.2's label rule is never consulted.
 *
 * Measured on the adversarial corpus at `n = 9, k = 3`, where five subsets attain the optimum:
 * summed in index order the winner `{bottom-span, capped, renderer-default-level}` and the
 * runner-up `{bottom-span, renderer-default-level, skips}` are bit-equal in one item order
 * (`177.47768677583286490` both) and differ by `2.842e-14` in another, so the corpus named a
 * different set of typical performances. Same disease as W4 CAPITAL-3's exact-equality tie
 * tests, one level below the key the gate found.
 *
 * A canonical summation order is the exact repair rather than an epsilon one: the same numbers
 * added in the same sequence give bit-identical totals under every permutation, so the tie stays
 * a tie and {@link exhaustiveMedoids}' sorted-label key decides it.
 */
function partitionCost(
  matrix: DistanceMatrix,
  medoids: readonly number[],
  labels: readonly string[],
  order: readonly number[],
): number {
  let total = 0;
  for (const i of order)
    total += at(matrix, i, elementAt(medoids, nearestMedoid(matrix, medoids, i, labels), MEDOIDS));
  return total;
}

/**
 * k-medoids by BUILD + SWAP, with every tie on the lowest label.
 *
 * PAM rather than k-means because its exemplars are real performances — "the most typical
 * Hofmann" — where a centroid corresponds to no recording. That is also why §8 requires labels
 * unique after expansion: two documents legitimately labelled `"Welte 1905"` would make the
 * medoid ambiguous.
 */
export function pam(
  matrix: DistanceMatrix,
  k: number,
  labels: readonly string[],
): Partition | null {
  const n = matrix.n;
  if (n === 0 || k <= 0 || k > n) return null;

  // One canonical summation order for every cost this call computes — see `partitionCost`.
  const order = labelOrder(n, labels);

  // BUILD: the first medoid minimizes the total distance to everything; each further one is
  // the candidate whose addition reduces the total most.
  const medoids: number[] = [];
  for (let step = 0; step < k; ++step) {
    let best = -1;
    let bestCost = Number.POSITIVE_INFINITY;
    for (let candidate = 0; candidate < n; ++candidate) {
      if (medoids.includes(candidate)) continue;
      const cost = partitionCost(matrix, [...medoids, candidate], labels, order);
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
  // iterations so the loop terminates on any input.
  let cost = partitionCost(matrix, medoids, labels, order);
  for (let iteration = 0; iteration < n * k; ++iteration) {
    let bestCost = cost;
    let bestOut = -1;
    let bestIn = -1;
    for (const [position, medoid] of medoids.entries())
      for (let candidate = 0; candidate < n; ++candidate) {
        if (medoids.includes(candidate)) continue;
        const trial = [...medoids];
        trial[position] = candidate;
        const trialCost = partitionCost(matrix, trial, labels, order);
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
  const exact = exhaustiveMedoids(matrix, k, labels, order);
  const chosen = exact === null ? medoids : [...exact];

  // Reported in label order, so the medoid list itself is permutation-equivariant.
  chosen.sort((x, y) => byLabelThenIndex(labels, x, y));
  const clusters = Array.from({ length: n }, (_unused, item) =>
    nearestMedoid(matrix, chosen, item, labels),
  );
  return {
    medoids: chosen,
    clusters,
    cost: partitionCost(matrix, chosen, labels, order),
    exhaustive: exact !== null,
  };
}

/**
 * Silhouette per item: `s(i) = (b − a) / max(a, b)`, valid on any dissimilarity.
 *
 * Two conventions, both §2.F's: a singleton cluster scores 0 (there is no `a` to compute), and
 * `max(a, b) = 0` scores 0 rather than `0/0`. At `N < 20` the figure is noisy, which §8 carries
 * as a reported field — `silhouetteReliable` — so a caller cannot read a cluster count off it
 * without seeing the caveat.
 */
export function silhouette(
  matrix: DistanceMatrix,
  clusters: readonly number[],
  labels: readonly string[] = [],
): readonly number[] {
  const n = matrix.n;
  // Written out rather than `groupBy`, on two counts. It buckets the wrong thing: `groupBy`
  // collects the elements it iterates, where a bucket here holds the item index keyed by the
  // cluster at that index — a value projection it does not take. And the buckets are mutated in
  // place: the `members.sort(...)` below is AD-72.1's repair, and `groupBy`'s
  // `ReadonlyMap<K, NonEmptyArray<A>>` has no `.sort`.
  const groups = new Map<number, number[]>();
  for (const [item, cluster] of clusters.entries()) {
    const members = groups.get(cluster);
    if (members === undefined) groups.set(cluster, [item]);
    else members.push(item);
  }
  // Members in label order, so `a` and `b` accumulate the same numbers in the same sequence
  // under any permutation of the caller's items (AD-72.1's form, AD-72.2's sweep). The vendored
  // corpus measured clean here — its clusters are small enough that the additions reassociate
  // exactly — but that is a property of those inputs, not of the code. `labels` defaults to
  // empty, which leaves index order for the algorithm-layer callers that pass none.
  for (const members of groups.values()) members.sort((x, y) => byLabelThenIndex(labels, x, y));

  // Item -> its own cluster's members, so the walk below reads a map rather than indexing
  // `clusters` at an `item` that may run past it: `n` is the matrix's size and `clusters` is the
  // caller's, and the `?? [item]` singleton is what the two disagreeing means here.
  const ownOf = new Map<number, readonly number[]>(
    clusters.map((cluster, item) => [item, groups.get(cluster) ?? [item]]),
  );

  return Array.from({ length: n }, (_unused, item) => {
    const own = ownOf.get(item) ?? [item];
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
