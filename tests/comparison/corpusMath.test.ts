/**
 * §8's corpus mathematics: Lance–Williams, PAM, silhouette, Jacobi, classical MDS, seriation.
 *
 * Every algorithm here is checked against an oracle that shares no line with it: a definition, a
 * closed form, a brute-force enumeration. Asserting the outputs a first run happened to produce
 * would pin this implementation rather than the mathematics.
 */
import { describe, it, expect } from 'vitest';
import {
  agglomerate,
  pam,
  silhouette,
  type DistanceMatrix,
  type Partition,
} from '../../src/comparison/clustering.js';
import {
  classicalMds,
  doubleCentered,
  jacobiEigen,
  seriationOrder,
} from '../../src/comparison/embedding.js';
import { elementAt, numberAt } from '../../src/prelude/index.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Checked random access into the flat `n × n` row-major arrays §8 uses. Every read here is a
 * computed index, and an unchecked slip produces `NaN` several assertions downstream.
 */
const cell = (matrix: DistanceMatrix, row: number, column: number): number =>
  numberAt(matrix.values, row * matrix.n + column, `a ${String(matrix.n)}-item distance matrix`);

const flatAt = (values: readonly number[], index: number, what: string): number =>
  numberAt(values, index, what);

/** The labels of a permuted corpus, read back through the permutation. */
const relabel = (labels: readonly string[], order: readonly number[]): readonly string[] =>
  order.map((index) => elementAt(labels, index, 'the label list'));

function lcg(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

/** `matrix` with its items reordered by `order` — entry `(i, j)` becomes `(order[i], order[j])`. */
const permute = (matrix: DistanceMatrix, order: readonly number[]): DistanceMatrix => ({
  n: matrix.n,
  values: Array.from({ length: matrix.n * matrix.n }, (_unused, index) =>
    cell(
      matrix,
      elementAt(order, Math.floor(index / matrix.n), 'the permutation'),
      elementAt(order, index % matrix.n, 'the permutation'),
    ),
  ),
});

/** A Fisher–Yates permutation of `0 … n − 1`, drawn from `next`. */
const shuffleOf = (n: number, next: () => number): readonly number[] => {
  const order = Array.from({ length: n }, (_unused, index) => index);
  const what = 'the permutation under construction';
  for (let i = n - 1; i > 0; --i) {
    const j = Math.floor(next() * (i + 1));
    const held = elementAt(order, i, what);
    order[i] = elementAt(order, j, what);
    order[j] = held;
  }
  return order;
};

/**
 * Whether an order really rearranges anything.
 *
 * Every permutation test below asserts an invariance over `cases`, and an identity order
 * satisfies all of them by comparing a run against itself. Negative control: returning
 * `0 … n − 1` unchanged from `shuffleOf` leaves every test in this file green, because the
 * `cases > 500` guards count comparisons rather than rearrangements.
 *
 * The counts are pinned exactly rather than as a fraction, so a single identity draw reds. At
 * `n ≥ 12` every draw rearranges; at `n = 4..7` four of 600 do not.
 */
const rearranges = (order: readonly number[]): boolean =>
  order.some((index, position) => index !== position);

/** `pam`'s partition, or a failure naming the corpus that produced none. */
const partitionOf = (matrix: DistanceMatrix, k: number, labels: readonly string[]): Partition => {
  const result = pam(matrix, k, labels);
  if (result === null)
    throw new Error(`pam found no partition of ${String(matrix.n)} items at k = ${String(k)}`);
  return result;
};

/** A symmetric zero-diagonal matrix from a list of points on a line. */
function fromPoints(points: readonly number[]): DistanceMatrix {
  const n = points.length;
  const values = new Array<number>(n * n).fill(0);
  for (const [i, from] of points.entries())
    for (const [j, to] of points.entries()) values[i * n + j] = Math.abs(from - to);
  return { n, values };
}

/** A symmetric zero-diagonal matrix from planar points — Euclidean by construction. */
function fromPlane(points: readonly (readonly [number, number])[]): DistanceMatrix {
  const n = points.length;
  const values = new Array<number>(n * n).fill(0);
  for (const [i, [fromX, fromY]] of points.entries())
    for (const [j, [toX, toY]] of points.entries())
      values[i * n + j] = Math.hypot(fromX - toX, fromY - toY);
  return { n, values };
}

function randomMatrix(next: () => number, n: number): DistanceMatrix {
  const values = new Array<number>(n * n).fill(0);
  for (let i = 0; i < n; ++i)
    for (let j = i + 1; j < n; ++j) {
      const value = Math.round(next() * 100) / 10;
      values[i * n + j] = value;
      values[j * n + i] = value;
    }
  return { n, values };
}

const labelsOf = (n: number) =>
  Array.from({ length: n }, (_unused, index) => `p${String(index).padStart(2, '0')}`);

/** The leaves under a dendrogram node, in the SciPy id convention. */
function leavesOf(
  merges: readonly { left: number; right: number }[],
  n: number,
  node: number,
): readonly number[] {
  if (node < n) return [node];
  const merge = elementAt(merges, node - n, 'the dendrogram’s merge list');
  return [...leavesOf(merges, n, merge.left), ...leavesOf(merges, n, merge.right)];
}

// ---------------------------------------------------------------------------
// Linkage
// ---------------------------------------------------------------------------

describe('Lance–Williams agglomeration', () => {
  it('reproduces single and complete linkage’s DEFINITIONS on random matrices', () => {
    const next = lcg(20260817);
    for (const linkage of ['single', 'complete'] as const)
      for (let trial = 0; trial < 25; ++trial) {
        const n = 3 + Math.floor(next() * 5);
        const matrix = randomMatrix(next, n);
        const labels = labelsOf(n);
        const { merges } = agglomerate(matrix, linkage, labels);

        // Each merge's height must be the min (or max) distance between the two clusters'
        // members, the definition the recurrence is a shortcut for.
        for (const [index, merge] of merges.entries()) {
          const left = leavesOf(merges, n, merge.left);
          const right = leavesOf(merges, n, merge.right);
          let expected = linkage === 'single' ? Infinity : -Infinity;
          for (const i of left)
            for (const j of right)
              expected =
                linkage === 'single'
                  ? Math.min(expected, cell(matrix, i, j))
                  : Math.max(expected, cell(matrix, i, j));
          expect({ trial, index, height: merge.height }).toEqual({
            trial,
            index,
            height: expected,
          });
        }
      }
  });

  it('reproduces UPGMA’s definition — the MEAN inter-cluster distance', () => {
    const next = lcg(4242);
    for (let trial = 0; trial < 25; ++trial) {
      const n = 3 + Math.floor(next() * 5);
      const matrix = randomMatrix(next, n);
      const { merges } = agglomerate(matrix, 'average', labelsOf(n));
      for (const merge of merges) {
        const left = leavesOf(merges, n, merge.left);
        const right = leavesOf(merges, n, merge.right);
        let total = 0;
        for (const i of left) for (const j of right) total += cell(matrix, i, j);
        expect(merge.height).toBeCloseTo(total / (left.length * right.length), 10);
      }
    }
  });

  it('reproduces Ward’s closed form on Euclidean data', () => {
    // `height = √(2·n_I·n_J/(n_I+n_J))·|c_I − c_J|`, which is Ward's criterion itself and shares
    // no line with the Lance–Williams recurrence the implementation runs.
    const points = [0, 1, 3, 7, 8, 20];
    const matrix = fromPoints(points);
    const { merges } = agglomerate(matrix, 'ward.D2', labelsOf(points.length));
    for (const merge of merges) {
      const left = leavesOf(merges, points.length, merge.left);
      const right = leavesOf(merges, points.length, merge.right);
      const centroid = (group: readonly number[]) =>
        group.reduce((sum, index) => sum + elementAt(points, index, 'the point list'), 0) /
        group.length;
      const expected =
        Math.sqrt((2 * left.length * right.length) / (left.length + right.length)) *
        Math.abs(centroid(left) - centroid(right));
      expect(merge.height).toBeCloseTo(expected, 9);
    }
  });

  it('is a valid dendrogram: n−1 merges, every leaf once, sizes consistent', () => {
    const next = lcg(31337);
    for (const linkage of ['average', 'single', 'complete', 'weighted', 'ward.D2'] as const)
      for (let trial = 0; trial < 6; ++trial) {
        const n = 2 + Math.floor(next() * 6);
        const { merges, order } = agglomerate(randomMatrix(next, n), linkage, labelsOf(n));
        expect(merges).toHaveLength(n - 1);
        expect([...order].sort((x, y) => x - y)).toEqual(
          Array.from({ length: n }, (_unused, index) => index),
        );
        for (const merge of merges)
          expect(merge.size).toBe(
            leavesOf(merges, n, merge.left).length + leavesOf(merges, n, merge.right).length,
          );
      }
  });

  it('degenerates cleanly at N = 0 and N = 1', () => {
    expect(agglomerate({ n: 0, values: [] }, 'average', [])).toEqual({ merges: [], order: [] });
    expect(agglomerate({ n: 1, values: [0] }, 'average', ['only'])).toEqual({
      merges: [],
      order: [0],
    });
  });
});

describe('AD-25.2: every tie is broken on a LABEL, so the corpus is permutation-equivariant', () => {
  // A tie-rich matrix: every distance equal, which is what a corpus of `both-neutral`
  // dimensions or a duplicated document produces. Under index-keyed rules this is exactly where
  // a permutation changes the merge structure rather than relabeling it.
  const n = 5;
  const flat: DistanceMatrix = {
    n,
    values: Array.from({ length: n * n }, (_unused, index) => (index % (n + 1) === 0 ? 0 : 1)),
  };

  it('relabels the dendrogram under a permutation rather than restructuring it', () => {
    const labels = labelsOf(n);
    const order = [3, 1, 4, 0, 2];
    const straight = agglomerate(flat, 'average', labels);
    const shuffled = agglomerate(permute(flat, order), 'average', relabel(labels, order));

    // Map the permuted result back through the permutation: leaf `i` there is leaf `order[i]`
    // here, and internal ids are positional, so the two merge lists must coincide exactly.
    const back = (id: number) => (id < n ? order[id] : id);
    expect(
      shuffled.merges.map((merge) => ({
        left: back(merge.left),
        right: back(merge.right),
        height: merge.height,
        size: merge.size,
      })),
    ).toEqual([...straight.merges]);
    expect(shuffled.order.map(back)).toEqual([...straight.order]);
  });

  it('is non-vacuous: the permuted matrix really is a different array', () => {
    const order = [3, 1, 4, 0, 2];
    const scattered: DistanceMatrix = {
      n,
      values: Array.from({ length: n * n }, (_unused, index) => {
        const i = Math.floor(index / n);
        const j = index % n;
        return i === j ? 0 : Math.abs(i - j);
      }),
    };
    expect(permute(scattered, order).values).not.toEqual([...scattered.values]);
  });

  /**
   * The corpus-level P-C6 test uses a tie-free corpus with one fixed permutation and no `k`, so
   * `medoids` is null there and PAM's tie rule is never reached.
   *
   * The matrix is two clean blocks with an interior distance of 0, so `{one from each block}`
   * ties with every other such pair. The labels are not in index order: the failure mode is a
   * key that is label-valued but index-ordered, which reads as a label rule and is not one, and
   * an index-sorted label list hides it.
   */
  it('names the same medoids and the same clusters under every permutation of a tie-rich corpus', () => {
    const size = 4;
    const blocks: DistanceMatrix = {
      n: size,
      // prettier-ignore
      values: [
        0, 0, 2, 2,
        0, 0, 2, 2,
        2, 2, 0, 0,
        2, 2, 0, 0,
      ],
    };
    const labels = ['L02', 'L00', 'L01', 'L03'];

    const answers = new Set<string>();
    const permutations: number[][] = [];
    const build = (rest: readonly number[], acc: readonly number[]): void => {
      if (rest.length === 0) permutations.push([...acc]);
      for (const [position, index] of rest.entries())
        build([...rest.slice(0, position), ...rest.slice(position + 1)], [...acc, index]);
    };
    build([0, 1, 2, 3], []);
    expect(permutations).toHaveLength(24);

    for (const order of permutations) {
      const shuffled = pam(permute(blocks, order), 2, relabel(labels, order));
      if (shuffled === null) throw new Error('pam refused a 4-item corpus at k = 2');
      expect(shuffled.exhaustive).toBe(true);
      // Read back in the caller's own labels, the only frame two differently-ordered corpora
      // can be compared in.
      const own = (item: number) =>
        elementAt(labels, elementAt(order, item, 'the permutation'), 'the label list');
      const medoids = shuffled.medoids.map(own);
      const clusters = shuffled.clusters
        .map(
          (cluster, item) =>
            `${own(item)}→${own(elementAt(shuffled.medoids, cluster, 'the medoid list'))}`,
        )
        .sort();
      answers.add(JSON.stringify({ medoids, clusters }));
    }

    // One answer, not two. Without the sort in `exhaustiveMedoids`' key this set holds two:
    // `{L00,L01}` under 20 permutations and `{L00,L03}` under the other 4, each reported with
    // `exhaustive: true` — two different global optima for the same corpus.
    expect([...answers]).toHaveLength(1);
    const only = elementAt([...answers], 0, 'the set of distinct answers');
    expect((JSON.parse(only) as { readonly medoids: readonly string[] }).medoids).toEqual([
      'L00',
      'L01',
    ]);
  });

  it('is non-vacuous: the tie-rich matrix really does have cost-equal optima', () => {
    // On a corpus with a unique optimum no tie rule is consulted and invariance is free.
    const size = 4;
    const blocks: DistanceMatrix = {
      n: size,
      // prettier-ignore
      values: [
        0, 0, 2, 2,
        0, 0, 2, 2,
        2, 2, 0, 0,
        2, 2, 0, 0,
      ],
    };
    const costOf = (chosen: readonly number[]) => {
      let total = 0;
      for (let i = 0; i < size; ++i)
        total += Math.min(...chosen.map((medoid) => cell(blocks, i, medoid)));
      return total;
    };
    const optima = [];
    for (let i = 0; i < size; ++i)
      for (let j = i + 1; j < size; ++j) if (costOf([i, j]) === 0) optima.push([i, j]);
    expect(optima).toHaveLength(4);
  });
});

// ---------------------------------------------------------------------------
// PAM and silhouette
// ---------------------------------------------------------------------------

describe('PAM', () => {
  /** Every `k`-subset, scored by the same objective PAM minimizes. */
  function bruteForce(matrix: DistanceMatrix, k: number): number {
    const n = matrix.n;
    let best = Number.POSITIVE_INFINITY;
    const walk = (start: number, chosen: readonly number[]): void => {
      if (chosen.length === k) {
        let total = 0;
        for (let i = 0; i < n; ++i)
          total += Math.min(...chosen.map((medoid) => cell(matrix, i, medoid)));
        best = Math.min(best, total);
        return;
      }
      for (let index = start; index < n; ++index) walk(index + 1, [...chosen, index]);
    };
    walk(0, []);
    return best;
  }

  it('finds the exhaustive optimum wherever the search space allows', () => {
    const next = lcg(90210);
    for (let trial = 0; trial < 30; ++trial) {
      const n = 4 + Math.floor(next() * 4);
      const matrix = randomMatrix(next, n);
      const k = 1 + Math.floor(next() * Math.min(3, n - 1));
      const result = pam(matrix, k, labelsOf(n));
      expect(result).not.toBeNull();
      expect(result?.exhaustive).toBe(true);
      expect(result?.cost).toBeCloseTo(bruteForce(matrix, k), 9);
      expect(result?.medoids).toHaveLength(k);
    }
  });

  it('[MEASURED] BUILD + SWAP alone misses, which is why the exhaustive pass exists', () => {
    // The heuristic's own answer, before the exhaustive pass replaces it: over 200 random
    // corpora of 4–7 items it lands above the optimum 12 times, worst excess 41 %. A medoid is
    // the one product whose value is naming a real performer. This is the sweep's worst case.
    const matrix: DistanceMatrix = {
      n: 4,
      values: [0, 6.7, 8.2, 4.8, 6.7, 0, 2.7, 6.7, 8.2, 2.7, 0, 7.7, 4.8, 6.7, 7.7, 0],
    };
    const result = pam(matrix, 2, labelsOf(4));
    expect(result?.exhaustive).toBe(true);
    expect(result?.cost).toBeCloseTo(bruteForce(matrix, 2), 12);
  });

  it('falls back to the heuristic above the limit, and says so', () => {
    // `C(60, 4)` is 487 635, past `PAM_EXHAUSTIVE_LIMIT`, so the field reports the heuristic.
    const next = lcg(555);
    const matrix = randomMatrix(next, 60);
    const result = pam(matrix, 4, labelsOf(60));
    expect(result?.exhaustive).toBe(false);
    expect(result?.medoids).toHaveLength(4);
    // Still SWAP-locally optimal: no single exchange improves it, PAM's own promise.
    const medoids = result?.medoids ?? [];
    const cost = result?.cost ?? 0;
    for (const position of medoids.keys())
      for (let candidate = 0; candidate < 60; ++candidate) {
        if (medoids.includes(candidate)) continue;
        const trial = [...medoids];
        trial[position] = candidate;
        let trialCost = 0;
        for (let i = 0; i < 60; ++i) trialCost += Math.min(...trial.map((m) => cell(matrix, i, m)));
        expect({ position, candidate, better: trialCost < cost - 1e-9 }).toEqual({
          position,
          candidate,
          better: false,
        });
      }
  });

  it('assigns every item to its nearest medoid', () => {
    const matrix = fromPoints([0, 1, 2, 10, 11, 12]);
    const result = pam(matrix, 2, labelsOf(6));
    expect(result).not.toBeNull();
    const clusters = result?.clusters ?? [];
    expect(clusters[0]).toBe(clusters[1]);
    expect(clusters[1]).toBe(clusters[2]);
    expect(clusters[3]).toBe(clusters[4]);
    expect(clusters[4]).toBe(clusters[5]);
    expect(clusters[0]).not.toBe(clusters[3]);
  });

  it('is null for a k outside its domain', () => {
    const matrix = fromPoints([0, 1]);
    expect(pam(matrix, 0, labelsOf(2))).toBeNull();
    expect(pam(matrix, 3, labelsOf(2))).toBeNull();
    expect(pam({ n: 0, values: [] }, 1, [])).toBeNull();
  });

  /**
   * `C(n, k) = C(n, n − k)`, and the pruning guard that has to land with it.
   *
   * Multiplying along the row up to `k` overstates the count: `C(n, j)` is unimodal, so for a
   * `k` near `n` an intermediate product blows the limit while the answer is tiny — 841 legal
   * `(n, k)` pairs then get `exhaustive: false`, when `C(26, 24)` is 325 and `C(21, 21)` is 1.
   *
   * The guard is the other half and not an optimization: without it `walk` visits
   * `Σ_{j≤k} C(n, j)` nodes, so a correct count alone turns a false flag into a hang —
   * `pam(30, 28)` measures 51054 ms in that state against 8 ms with the guard. Unguarded, this
   * test does not fail, it stops.
   */
  it('is exhaustive for a k near n, where C(n, k) is small but the row’s middle is not', () => {
    /** A deterministic non-degenerate matrix; the values are irrelevant, the sizes are not. */
    const spread = (n: number): DistanceMatrix => {
      const values = new Array<number>(n * n).fill(0);
      for (let i = 0; i < n; ++i)
        for (let j = i + 1; j < n; ++j) {
          const value = ((i * 7 + j * 13) % 19) + 1;
          values[i * n + j] = value;
          values[j * n + i] = value;
        }
      return { n, values };
    };

    for (const [n, k] of [
      [21, 21],
      [26, 24],
      [30, 28],
    ] as const) {
      const result = pam(spread(n), k, labelsOf(n));
      expect({ n, k, exhaustive: result?.exhaustive }).toEqual({ n, k, exhaustive: true });
      expect(result?.medoids).toHaveLength(k);
    }

    // …and the answer really is the global optimum, checked by enumerating the items to exclude
    // rather than the ones to keep — `C(26, 2) = 325` subsets, a different enumeration from the
    // one the implementation runs.
    const n = 26;
    const k = 24;
    const matrix = spread(n);
    const result = pam(matrix, k, labelsOf(n));
    let bestCost = Number.POSITIVE_INFINITY;
    for (let x = 0; x < n; ++x)
      for (let y = x + 1; y < n; ++y) {
        const kept = Array.from({ length: n }, (_unused, item) => item).filter(
          (item) => item !== x && item !== y,
        );
        let total = 0;
        for (let i = 0; i < n; ++i)
          total += Math.min(...kept.map((medoid) => cell(matrix, i, medoid)));
        bestCost = Math.min(bestCost, total);
      }
    expect(result?.cost).toBeCloseTo(bestCost, 12);
  });
});

describe('silhouette', () => {
  it('reproduces (b − a)/max(a, b) evaluated independently', () => {
    const matrix = fromPoints([0, 1, 2, 10, 11, 12]);
    const clusters = [0, 0, 0, 1, 1, 1];
    const scores = silhouette(matrix, clusters);
    for (const [item, mine] of clusters.entries()) {
      const own = clusters
        .map((c, i) => [c, i] as const)
        .filter(([c, i]) => c === mine && i !== item);
      const other = clusters.map((c, i) => [c, i] as const).filter(([c]) => c !== mine);
      const a = own.reduce((sum, [, i]) => sum + cell(matrix, item, i), 0) / own.length;
      const b = other.reduce((sum, [, i]) => sum + cell(matrix, item, i), 0) / other.length;
      expect(elementAt(scores, item, 'the silhouette scores')).toBeCloseTo(
        (b - a) / Math.max(a, b),
        12,
      );
    }
  });

  /**
   * The silhouette under permutation (AD-72.2), on a corpus big enough to show it.
   *
   * `a` and `b` sum a cluster's members, collected in the caller's item order, and
   * floating-point addition is not associative. The six-item vendored corpus does not show it —
   * its clusters are small enough that the additions reassociate exactly. At `n = 12..19`,
   * `k = 3`, over 2844 per-item comparisons: 1242 differ bit-wise without the label ordering,
   * 0 with it.
   */
  it('gives bit-identical scores under permutation, on a corpus large enough to show it', () => {
    const next = lcg(31337);
    let disagreements = 0;
    let cases = 0;
    let attempts = 0;
    let rearranged = 0;

    for (let trial = 0; trial < 12; ++trial) {
      const n = 12 + Math.floor(next() * 8);
      const values = new Array<number>(n * n).fill(0);
      for (let i = 0; i < n; ++i)
        for (let j = i + 1; j < n; ++j) {
          // Values with long binary expansions, which is what makes reassociation visible at
          // all — a matrix of small integers sums exactly in any order.
          const value = Math.round(next() * 1e6) / 7919;
          values[i * n + j] = value;
          values[j * n + i] = value;
        }
      const matrix: DistanceMatrix = { n, values };
      const labels = labelsOf(n);
      const straight = silhouette(matrix, partitionOf(matrix, 3, labels).clusters, labels);
      const byLabel = new Map(
        labels.map((label, item) => [label, elementAt(straight, item, 'the silhouette scores')]),
      );

      for (let attempt = 0; attempt < 6; ++attempt) {
        const order = shuffleOf(n, next);
        attempts += 1;
        if (rearranges(order)) rearranged += 1;
        const permutedLabels = relabel(labels, order);
        const permuted = permute(matrix, order);
        const shuffled = silhouette(
          permuted,
          partitionOf(permuted, 3, permutedLabels).clusters,
          permutedLabels,
        );
        for (const [item, label] of permutedLabels.entries()) {
          cases += 1;
          if (byLabel.get(label) !== elementAt(shuffled, item, 'the permuted silhouette scores'))
            disagreements += 1;
        }
      }
    }

    expect(cases).toBeGreaterThan(1000);
    // …and every one really was a rearrangement — see {@link rearranges}.
    expect(rearranged).toBe(attempts);
    expect(disagreements).toBe(0);
  });

  /**
   * Total-order label comparators do not deliver permutation-invariance under duplicate labels:
   * `pam`'s cost still takes 2 distinct values over 40 permutations at `n = 12` with three
   * labels shared twelve ways, and the index fallback cannot help because the index is what
   * permutes. The cause is one level up, in `exhaustiveMedoids`' tie key: two subsets with
   * different costs can share a label multiset, and no label-keyed rule can choose between them.
   *
   * That is why §8 requires labels unique after expansion. What the requirement buys is
   * asserted here: invariance on the supported domain.
   */
  it('rests its invariance on §8’s unique labels, and refuses the domain where it fails', () => {
    const n = 12;
    const next = lcg(20260817);
    const values = new Array<number>(n * n).fill(0);
    for (let i = 0; i < n; ++i)
      for (let j = i + 1; j < n; ++j) {
        const value = Math.round(next() * 1e6) / 7919;
        values[i * n + j] = value;
        values[j * n + i] = value;
      }
    const matrix: DistanceMatrix = { n, values };
    const unique = labelsOf(n);

    const answers = new Set<string>();
    let rearranged = 0;
    for (let attempt = 0; attempt < 40; ++attempt) {
      const order = shuffleOf(n, next);
      if (rearranges(order)) rearranged += 1;
      const permuted = permute(matrix, order);
      const permutedLabels = relabel(unique, order);
      const result = partitionOf(permuted, 3, permutedLabels);
      answers.add(
        [
          result.cost.toPrecision(17),
          [...relabel(permutedLabels, result.medoids)].sort().join(','),
          silhouette(permuted, result.clusters, permutedLabels)
            .map((score) => score.toPrecision(17))
            .sort()
            .join(','),
        ].join(' | '),
      );
    }
    // One answer over 40 permutations, all of which really rearrange (see {@link rearranges}).
    expect(rearranged).toBe(40);
    expect(answers.size).toBe(1);
  });

  it('scores a singleton cluster 0, and a zero-distance corpus 0', () => {
    expect(silhouette(fromPoints([0, 5, 9]), [0, 1, 2])).toEqual([0, 0, 0]);
    expect(silhouette({ n: 2, values: [0, 0, 0, 0] }, [0, 0])).toEqual([0, 0]);
  });
});

// ---------------------------------------------------------------------------
// Jacobi and MDS
// ---------------------------------------------------------------------------

describe('cyclic Jacobi', () => {
  it('reconstructs A = V Λ Vᵀ and keeps V orthonormal', () => {
    const next = lcg(1234567);
    for (let trial = 0; trial < 20; ++trial) {
      const n = 2 + Math.floor(next() * 6);
      const values = new Array<number>(n * n).fill(0);
      for (let i = 0; i < n; ++i)
        for (let j = i; j < n; ++j) {
          const value = next() * 10 - 5;
          values[i * n + j] = value;
          values[j * n + i] = value;
        }
      const { values: eigen, vectors } = jacobiEigen({ n, values });

      const vector = (row: number, column: number) =>
        flatAt(vectors, row * n + column, 'the eigenvector matrix');

      for (let i = 0; i < n; ++i)
        for (let j = 0; j < n; ++j) {
          let reconstructed = 0;
          for (let k = 0; k < n; ++k)
            reconstructed += vector(i, k) * flatAt(eigen, k, 'the spectrum') * vector(j, k);
          expect(reconstructed).toBeCloseTo(flatAt(values, i * n + j, 'the input matrix'), 10);

          let dot = 0;
          for (let k = 0; k < n; ++k) dot += vector(k, i) * vector(k, j);
          expect(dot).toBeCloseTo(i === j ? 1 : 0, 10);
        }
    }
  });

  it('finds the eigenvalues of a matrix whose spectrum is known by hand', () => {
    // `[[2,1],[1,2]]` has eigenvalues 3 and 1, eigenvectors (1,1)/√2 and (1,−1)/√2.
    const { values } = jacobiEigen({ n: 2, values: [2, 1, 1, 2] });
    expect(
      [...values].sort((x, y) => y - x).map((value) => Math.round(value * 1e10) / 1e10),
    ).toEqual([3, 1]);
  });
});

describe('classical MDS', () => {
  const square: readonly (readonly [number, number])[] = [
    [0, 0],
    [3, 0],
    [3, 4],
    [0, 4],
    [1.5, 2],
  ];

  it('reproduces a Euclidean corpus’s own distances exactly', () => {
    const matrix = fromPlane(square);
    const embedding = classicalMds(matrix, 2, labelsOf(square.length));
    const plotted = (item: number, axis: number) =>
      flatAt(embedding.coordinates, item * 2 + axis, 'the two-axis embedding');
    for (let i = 0; i < matrix.n; ++i)
      for (let j = 0; j < matrix.n; ++j) {
        const recovered = Math.hypot(plotted(i, 0) - plotted(j, 0), plotted(i, 1) - plotted(j, 1));
        expect(recovered).toBeCloseTo(cell(matrix, i, j), 9);
      }
    expect(embedding.negativeEigenvalueMass).toBeCloseTo(0, 12);
    expect(embedding.degenerate).toBe(false);
  });

  it('reports the negative mass a non-Euclidean corpus really has', () => {
    // The triangle inequality holds — `2 ≤ 1 + 1` with equality — but no Euclidean space
    // realizes it: three points mutually 2 apart lie on an equilateral triangle whose centre is
    // `2/√3 ≈ 1.155` from each vertex, and this metric puts the fourth point at 1.
    const n = 4;
    const values = new Array<number>(n * n).fill(0);
    const set = (i: number, j: number, value: number) => {
      values[i * n + j] = value;
      values[j * n + i] = value;
    };
    set(0, 1, 2);
    set(0, 2, 2);
    set(1, 2, 2);
    set(0, 3, 1);
    set(1, 3, 1);
    set(2, 3, 1);
    const embedding = classicalMds({ n, values }, 2, labelsOf(n));
    expect(embedding.negativeEigenvalueMass).toBeGreaterThan(0);

    // Explained variance is over `Σ|λ|`, so the retained axes never claim the negative mass, and
    // it is signed: `λ_j / Σ|λ|`. Both axes retained here are positive, so this assertion cannot
    // tell the two readings apart; the test below is the one that can.
    const total = embedding.eigenvalues.reduce((sum, value) => sum + Math.abs(value), 0);
    for (const [axis, share] of embedding.explainedVariance.entries())
      expect(share).toBeCloseTo(flatAt(embedding.eigenvalues, axis, 'the spectrum') / total, 12);
    const retained = embedding.explainedVariance.reduce<number>(
      (sum, share) => sum + (share ?? 0),
      0,
    );
    expect(retained).toBeLessThan(1);
    // …and the flattering reading — over `Σλ⁺` — really would be larger, so the choice matters.
    const positive = embedding.eigenvalues.reduce((sum, value) => sum + Math.max(0, value), 0);
    const flattering = embedding.eigenvalues
      .slice(0, 2)
      .reduce((sum, value) => sum + Math.max(0, value) / positive, 0);
    expect(flattering).toBeGreaterThan(retained);
  });

  /**
   * `Math.abs(eigenvalue) / total` credits an imaginary direction with positive variance. Both
   * facts about such an axis point the other way: only `eigenvalue > 0` is embedded, so its
   * `coordinates` are all zero, and its eigenvalue is negative because the corpus is not
   * Euclidean. On the vendored corpus at `embeddingAxes: 9 = n−1` the absolute reading credits
   * 2.28 % of the variance to two axes that are not there.
   */
  it('gives a negative axis a NEGATIVE share, and no coordinates', () => {
    const n = 4;
    const values = new Array<number>(n * n).fill(0);
    const set = (i: number, j: number, value: number) => {
      values[i * n + j] = value;
      values[j * n + i] = value;
    };
    set(0, 1, 2);
    set(0, 2, 2);
    set(1, 2, 2);
    set(0, 3, 1);
    set(1, 3, 1);
    set(2, 3, 1);
    // Every axis retained, so the negative one is reported rather than dropped.
    const embedding = classicalMds({ n, values }, n, labelsOf(n));

    // λ = [2, 2, ~0, −0.25]: the last is the non-Euclidean direction.
    expect(embedding.eigenvalues[3]).toBeCloseTo(-0.25, 12);
    const total = embedding.eigenvalues.reduce((sum, value) => sum + Math.abs(value), 0);
    expect(embedding.explainedVariance[3]).toBeCloseTo(-0.25 / total, 12);
    expect(embedding.explainedVariance[3]).toBeLessThan(0);

    // The axis carries no coordinates at all — the fact a positive share denies.
    for (let item = 0; item < n; ++item) expect(embedding.coordinates[item * n + 3]).toBe(0);

    // The shares sum to `Σλ / Σ|λ|`, i.e. below 1 by exactly twice the negative mass.
    const summed = embedding.explainedVariance.reduce<number>(
      (sum, share) => sum + (share ?? 0),
      0,
    );
    expect(summed).toBeCloseTo(1 - 2 * embedding.negativeEigenvalueMass, 12);
    expect(summed).toBeLessThan(1);
  });

  it('flags a corpus with no spread as degenerate rather than dividing by zero (A3b)', () => {
    const embedding = classicalMds({ n: 3, values: new Array<number>(9).fill(0) }, 2, labelsOf(3));
    expect(embedding.degenerate).toBe(true);
    expect(embedding.explainedVariance).toEqual([null, null]);
    expect(embedding.negativeEigenvalueMass).toBe(0);
    expect(embedding.coordinates).toEqual([0, 0, 0, 0, 0, 0]);
  });

  /**
   * AD-67.1's sign rule: among the components tied at the peak relatively, the lowest-label one
   * is positive. On a corpus with a unique peak that is the naive rule verbatim.
   *
   * The naive rule — largest magnitude positive, ties on exactly equal magnitude to the lowest
   * label — does not survive floats. On this square the four corners are at ±2 and tied in exact
   * arithmetic, but the computed magnitudes differ in the last ulp: `1.99999999999999911`,
   * `1.99999999999999978`, `2.00000000000000000`, `1.99999999999999933`. The exact tie test
   * never fires, the anchor is whichever corner wins by an ulp, and a permuted corpus can hand
   * that ulp to a corner of the opposite sign and mirror the whole plot — `A-tel` at
   * `+634.1636783061936` under four item orders and `−634.1636783061933` under two.
   */
  it('anchors each axis on the lowest-label component at its peak, so two runs are not mirrors', () => {
    const matrix = fromPlane(square);
    const labels = labelsOf(square.length);
    const once = classicalMds(matrix, 2, labels);
    const twice = classicalMds(matrix, 2, labels);
    expect(twice.coordinates).toEqual([...once.coordinates]);

    for (let axis = 0; axis < once.axes; ++axis) {
      const column = Array.from({ length: matrix.n }, (_unused, item) =>
        flatAt(once.coordinates, item * once.axes + axis, 'the embedding'),
      );
      const peak = Math.max(...column.map((value) => Math.abs(value)));
      if (peak === 0) continue;
      // `labelsOf` is index-ordered, so the first index at the peak IS the lowest label.
      const anchor = column.findIndex((value) => Math.abs(value) >= peak * (1 - 1e-9));
      const anchored = elementAt(column, anchor, `axis ${String(axis)} of the embedding`);
      expect({ axis, anchored }).toEqual({ axis, anchored: Math.abs(anchored) });
    }
  });

  it('is non-vacuous: on this square the anchor is NOT the strict maximum', () => {
    // Without this the test above would pass under the exact-tie rule too. The strict maximum of
    // axis 0 is a corner of the opposite sign, one ulp above the anchor — the ulp that rule
    // decides the plot's orientation on.
    const once = classicalMds(fromPlane(square), 2, labelsOf(square.length));
    const column = Array.from({ length: square.length }, (_unused, item) =>
      flatAt(once.coordinates, item * once.axes, 'axis 0 of the embedding'),
    );
    const peak = Math.max(...column.map((value) => Math.abs(value)));
    const strictest = column.findIndex((value) => Math.abs(value) === peak);
    const anchor = column.findIndex((value) => Math.abs(value) >= peak * (1 - 1e-9));
    expect(strictest).not.toBe(anchor);
    const strictestValue = elementAt(column, strictest, 'axis 0 of the embedding');
    const anchoredValue = elementAt(column, anchor, 'axis 0 of the embedding');
    expect(strictestValue).toBeLessThan(0);
    expect(anchoredValue).toBeGreaterThan(0);
    expect(Math.abs(strictestValue)).toBeCloseTo(Math.abs(anchoredValue), 12);
  });

  it('pads the retained axes rather than dropping them', () => {
    const embedding = classicalMds(fromPoints([0, 1, 2]), 5, labelsOf(3));
    expect(embedding.axes).toBe(5);
    expect(embedding.coordinates).toHaveLength(15);
    expect(embedding.coordinates.every((value) => Number.isFinite(value))).toBe(true);

    // What "padded" means, which finiteness alone does not say: a 3-item corpus has 3
    // eigenvalues, so axes 3 and 4 have no column to take and must read as absent rather than as
    // a recycled one. Zero coordinates and a zero variance share are that reading. Negative
    // control: turning `classicalMds`'s out-of-range sentinel from `-1` into any real column
    // index leaves the rest of the suite green and reds these four expectations.
    for (const axis of [3, 4]) {
      expect({
        axis,
        column: [0, 1, 2].map((item) => embedding.coordinates[item * 5 + axis]),
      }).toEqual({ axis, column: [0, 0, 0] });
      expect({ axis, share: embedding.explainedVariance[axis] }).toEqual({ axis, share: 0 });
    }
  });

  it('double-centres as B = −½ J D² J', () => {
    // Independently: build `J D² J` from the definition with explicit matrix products.
    const matrix = fromPoints([0, 2, 5]);
    const n = matrix.n;
    const squared = matrix.values.map((value) => value * value);
    const j = Array.from(
      { length: n * n },
      (_unused, index) => (Math.floor(index / n) === index % n ? 1 : 0) - 1 / n,
    );
    const product = (x: readonly number[], y: readonly number[]) =>
      Array.from({ length: n * n }, (_unused, index) => {
        const row = Math.floor(index / n);
        const column = index % n;
        let total = 0;
        for (let k = 0; k < n; ++k)
          total +=
            flatAt(x, row * n + k, 'the left factor') *
            flatAt(y, k * n + column, 'the right factor');
        return total;
      });
    const expected = product(product(j, squared), j).map((value) => -0.5 * value);
    for (const [index, value] of doubleCentered(matrix).values.entries())
      expect(value).toBeCloseTo(flatAt(expected, index, 'the independently built −½ J D² J'), 10);
  });
});

describe('seriation', () => {
  it('orders by the first MDS coordinate', () => {
    const matrix = fromPoints([0, 10, 3, 7, 1]);
    const labels = labelsOf(5);
    const embedding = classicalMds(matrix, 2, labels);
    const order = seriationOrder(embedding, labels);
    const first = order.map((index) =>
      flatAt(embedding.coordinates, index * embedding.axes, 'axis 0 of the embedding'),
    );
    expect([...first].sort((x, y) => x - y)).toEqual(first);
    expect([...order].sort((x, y) => x - y)).toEqual([0, 1, 2, 3, 4]);
    // On a one-dimensional corpus the order is the line, up to the sign the rule fixes.
    // Points 0, 10, 3, 7, 1: ascending along the line is 0, 1, 3, 7, 10 — indices 0, 4, 2, 3, 1.
    expect(order).toEqual([0, 4, 2, 3, 1]);
  });
});

/**
 * Permuting a corpus reruns Jacobi's rotations in a different sequence, so every quantity here
 * arrives with ulp-level noise on it, and a tie rule that tests `===` before falling back to the
 * label decides on that noise. The exact tie is not repairable at this layer, and the module
 * says so in data: where two retained eigenvalues coincide, the eigenspace has no canonical
 * basis and `degenerate` is true (AD-67.1).
 */
describe('AD-67.1: the embedding is permutation-equivariant, and says where it is not', () => {
  /** Both products read back in the caller's own labels, which is the only comparable frame. */
  const readback = (matrix: DistanceMatrix, labels: readonly string[]) => {
    const embedding = classicalMds(matrix, 2, labels);
    const byLabel = new Map<string, readonly [number, number]>();
    for (const [item, label] of labels.entries())
      byLabel.set(label, [
        flatAt(embedding.coordinates, item * 2, 'the two-axis embedding'),
        flatAt(embedding.coordinates, item * 2 + 1, 'the two-axis embedding'),
      ]);
    return {
      degenerate: embedding.degenerate,
      seriation: relabel(labels, seriationOrder(embedding, labels)).join(','),
      byLabel,
      eigenvalues: embedding.eigenvalues,
      coordinates: [...byLabel.entries()]
        .sort(([x], [y]) => (x < y ? -1 : 1))
        .map(([label, point]) => `${label}:${point[0].toPrecision(12)},${point[1].toPrecision(12)}`)
        .join('|'),
    };
  };

  /**
   * Whether one run's axis is the other's mirror — the failure the sign anchor exists to stop.
   *
   * Per-coordinate `Math.sign` would be the wrong test: an item at the corpus centroid sits at
   * `1e-17` on an axis and its sign carries no information. The whole vector against its own
   * negation is robust to those near-zero entries.
   */
  const isMirrored = (
    left: ReadonlyMap<string, readonly [number, number]>,
    right: ReadonlyMap<string, readonly [number, number]>,
    axis: 0 | 1,
  ): boolean => {
    let same = 0;
    let flipped = 0;
    for (const [label, point] of left) {
      const other = right.get(label) ?? [0, 0];
      same += Math.abs(point[axis] - other[axis]);
      flipped += Math.abs(point[axis] + other[axis]);
    }
    return flipped < same;
  };

  /**
   * The sign and the order are discrete choices and are exactly reproducible. The coordinate
   * values are not bit-reproducible and never could be — a permuted matrix runs Jacobi's
   * rotations in a different sequence — so they are asserted to a relative `1e-9`,
   * {@link TIE_EPSILON}'s own band.
   *
   * Without the sign and order rules: 211 of 600 permutations disagree on the seriation, 15 axes
   * come back mirrored, and the worst relative coordinate displacement is 2.0, which is what a
   * mirror is. The seriation figure is the largest because
   * `coordinates[x*axes] - coordinates[y*axes] || label` reaches its label branch only on an
   * exact float equality, which two permuted runs essentially never produce.
   */
  it('gives the same seriation, the same orientation and the same coordinates under permutation', () => {
    const next = lcg(777);
    let seriationDisagreements = 0;
    let mirroredAxes = 0;
    let worstRelative = 0;
    let cases = 0;
    let rearranged = 0;

    for (let trial = 0; trial < 20; ++trial) {
      const n = 4 + Math.floor(next() * 4);
      // Planar points, half of them duplicated, so exact zero distances and near-tied
      // coordinates are common rather than a lucky accident.
      const distinct = Array.from(
        { length: trial % 2 === 1 ? Math.ceil(n / 2) : n },
        () => [Math.round(next() * 40) / 4, Math.round(next() * 40) / 4] as const,
      );
      const points = (trial % 2 === 1 ? [...distinct, ...distinct] : distinct).slice(0, n);
      const matrix = fromPlane(points);
      const labels = labelsOf(n);
      const straight = readback(matrix, labels);
      if (straight.degenerate) continue;

      // Whether this axis carries material spread at all — see the note in the first loop.
      const material = (axis: 0 | 1) => {
        const scale = Math.abs(flatAt(straight.eigenvalues, 0, 'the spectrum'));
        return Math.abs(flatAt(straight.eigenvalues, axis, 'the spectrum')) > 1e-9 * scale;
      };

      for (let attempt = 0; attempt < 30; ++attempt) {
        const order = shuffleOf(n, next);
        const shuffled = readback(permute(matrix, order), relabel(labels, order));
        cases += 1;
        if (rearranges(order)) rearranged += 1;
        if (shuffled.seriation !== straight.seriation) seriationDisagreements += 1;
        for (const axis of [0, 1] as const) {
          // Only an axis that exists can be mirrored. A collinear corpus has
          // `λ = [70.3, 2.08e-15, -1.11e-15]`: its second axis is rounding error, its
          // coordinates peak at `2.6e-8`, and asking which way round it points is not a
          // question. Skipping it is the same materiality rule `classicalMds` uses to decide
          // whether a repeated eigenvalue is worth flagging, applied to the same end.
          if (!material(axis)) continue;
          if (isMirrored(straight.byLabel, shuffled.byLabel, axis)) mirroredAxes += 1;
        }
        for (const axis of [0, 1] as const) {
          if (!material(axis)) continue;
          // Relative to the axis's own extent, not to each coordinate: an item sitting at the
          // corpus centroid is at `~0` on that axis, and a per-coordinate ratio there reports
          // an enormous relative error for a difference no plot could render. The axis extent
          // is the scale a reader actually sees.
          let extent = 0;
          for (const [, point] of straight.byLabel)
            extent = Math.max(extent, Math.abs(point[axis]));
          if (extent === 0) continue;
          for (const [label, point] of straight.byLabel) {
            const other = shuffled.byLabel.get(label) ?? [0, 0];
            worstRelative = Math.max(worstRelative, Math.abs(point[axis] - other[axis]) / extent);
          }
        }
      }
    }

    expect(cases).toBeGreaterThan(500);
    // …and 596 of them really rearranged the corpus. `n` is 4–7 here, so an identity draw is not
    // vanishingly rare the way it is at `n = 12`: four of 600 are. See {@link rearranges}.
    expect({ rearranged, cases }).toEqual({ rearranged: 596, cases: 600 });
    expect({ seriationDisagreements, mirroredAxes }).toEqual({
      seriationDisagreements: 0,
      mirroredAxes: 0,
    });
    expect(worstRelative).toBeLessThan(1e-9);
  });

  /**
   * The carve-out, as an observable rather than as a sentence.
   *
   * Three documents each listed twice, every cross-document distance equal; the spectrum is
   * `[9, 9, ~0, ~0, ~0, 0]`. The top eigenvalue is double, so the plane it spans has no
   * distinguished pair of axes and every rotation within it is as valid as every other. No sign
   * rule reaches that, which is why the honest answer is the flag.
   */
  it('flags a repeated retained eigenvalue, where no sign rule can canonicalise the basis', () => {
    const n = 6;
    const block = (item: number) => Math.floor(item / 2);
    const matrix: DistanceMatrix = {
      n,
      values: Array.from({ length: n * n }, (_unused, index) =>
        block(Math.floor(index / n)) === block(index % n) ? 0 : 3,
      ),
    };
    const labels = labelsOf(n);
    const embedding = classicalMds(matrix, 2, labels);

    expect(embedding.eigenvalues[0]).toBeCloseTo(9, 9);
    expect(embedding.eigenvalues[1]).toBeCloseTo(9, 9);
    expect(embedding.degenerate).toBe(true);
    // The narrower A3b condition is not what is true here — `Σ|λ| > 0` and the variance shares
    // are real numbers. The flag is the wider one; `explainedVariance`'s contract is not.
    expect(embedding.explainedVariance.every((share) => share !== null)).toBe(true);

    // Non-vacuity, and the reason the flag is not decoration: the coordinates really do move —
    // 78 distinct coordinate sets and 6 distinct seriations over all 720 orders.
    const seen = new Set<string>();
    for (const order of [
      [0, 1, 2, 3, 4, 5],
      [1, 0, 2, 3, 4, 5],
      [2, 3, 0, 1, 4, 5],
      [5, 4, 3, 2, 1, 0],
    ])
      seen.add(readback(permute(matrix, order), relabel(labels, order)).coordinates);
    expect(seen.size).toBeGreaterThan(1);
  });

  /**
   * The same carve-out at the cut — the half of `hasRepeatedAxis`'s contract the test above
   * cannot reach.
   *
   * Its pair range is positions `0 … width`, inclusive of the first dropped one, because a
   * degeneracy straddling the cut makes the last retained eigenvector just as arbitrary as one
   * wholly inside. At `axes = 2` the double eigenvalue sits wholly inside the retained block, so
   * the inclusive end never decides; at `axes = 1` the same pair `(λ₀, λ₁) = (9, 9)` straddles
   * it, and the single retained axis is an arbitrary direction in the plane the two span. Only
   * this case distinguishes the inclusive bound from the exclusive one.
   *
   * Negative control: dropping the `+ 1` from `hasRepeatedAxis`'s pair range leaves the whole
   * suite green without this test, and reds exactly this one with it.
   */
  it('flags a repeated eigenvalue that straddles the retained cut, not only one inside it', () => {
    const n = 6;
    const block = (item: number) => Math.floor(item / 2);
    const matrix: DistanceMatrix = {
      n,
      values: Array.from({ length: n * n }, (_unused, index) =>
        block(Math.floor(index / n)) === block(index % n) ? 0 : 3,
      ),
    };
    const embedding = classicalMds(matrix, 1, labelsOf(n));

    // The pair really does straddle: the first is retained, the second is the first dropped.
    expect(embedding.axes).toBe(1);
    expect(embedding.eigenvalues[0]).toBeCloseTo(9, 9);
    expect(embedding.eigenvalues[1]).toBeCloseTo(9, 9);
    // …and both carry material variance, so this is the flag's subject and not its tail.
    expect(embedding.explainedVariance[0]).toBeGreaterThan(0.4);
    expect(embedding.degenerate).toBe(true);
  });

  /**
   * Two numeric honesties, pinned so the prose cannot drift from them.
   *
   * `negativeEigenvalueMass` is a measured quantity, and a perfectly Euclidean corpus can report
   * a value at the noise floor because Jacobi leaves a zero eigenvalue at `±1e-16` with an
   * arbitrary sign. It is not clamped — a threshold would hide the small-but-real
   * non-Euclideanness the field exists to report — so what is pinned is that it stays at the
   * floor rather than that it is zero.
   *
   * `Math.hypot(...a)` in `jacobiEigen` spreads `n²` arguments against V8's measured
   * 105741-argument limit, so it throws at `n ≥ 326`, as `RangeError` or as `Maximum call stack
   * size exceeded` depending on how the engine reports the limit that run. That variability is
   * itself the argument: `DEFAULT_MAX_ITEMS = 256` leaves 1.61× headroom, and a ceiling that
   * depends on an engine's argument handling is not one anyone can reason about. Accumulated
   * instead.
   */
  it('reports noise-floor negative mass on a Euclidean simplex, and survives past N = 326', () => {
    for (const k of [3, 4, 5, 7, 12]) {
      const values = new Array<number>(k * k).fill(0);
      for (let i = 0; i < k; ++i) for (let j = 0; j < k; ++j) values[i * k + j] = i === j ? 0 : 1;
      const embedding = classicalMds({ n: k, values }, 2, labelsOf(k));
      // A regular simplex is exactly Euclidean, so the true value is 0 and anything above the
      // floor is a real defect rather than a rounding residue.
      expect({ k, atFloor: embedding.negativeEigenvalueMass < 1e-14 }).toEqual({
        k,
        atFloor: true,
      });
    }

    // Past the `Math.hypot` ceiling. `n = 330` is 108900 arguments, comfortably over V8's
    // measured 105741.
    //
    // The matrix is diagonal, which is what keeps this cheap: the ceiling lives in the very
    // first statement, where the off-diagonal threshold is computed by spreading all `n²`
    // entries, and a matrix that is already diagonal exits the sweep loop on its first check.
    // So this exercises the argument count — the whole of the claim — in `O(n²)` work rather
    // than the `O(n³)`-per-sweep of a full eigendecomposition. A dense 330×330 matrix here costs
    // 33 s under a loaded runner and times out.
    const n = 330;
    const values = new Array<number>(n * n).fill(0);
    for (let i = 0; i < n; ++i) values[i * n + i] = 1 + (i % 7);
    const spectrum = jacobiEigen({ n, values });
    expect(spectrum.values).toHaveLength(n);
    // The eigenvalues of a diagonal matrix are its diagonal, so the result is checkable too.
    expect([...spectrum.values].sort((x, y) => x - y)).toEqual(
      Array.from({ length: n }, (_unused, i) => 1 + (i % 7)).sort((x, y) => x - y),
    );
  });

  it('does not flag the ordinary corpus, so the carve-out stays narrow', () => {
    // A near-zero tail is not a degeneracy a reader can see: `√λ·v` at the noise floor is below
    // the resolution of any plot, and flagging it would make every `axes = N−1` corpus
    // degenerate and the field useless. Asked for every axis it has, this corpus is still clean.
    const matrix = fromPlane([
      [0, 0],
      [3, 0],
      [3, 4],
      [0, 4],
      [1.5, 2],
    ]);
    expect(classicalMds(matrix, 2, labelsOf(5)).degenerate).toBe(false);
    expect(classicalMds(matrix, 4, labelsOf(5)).degenerate).toBe(false);
  });
});
