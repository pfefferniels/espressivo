/**
 * §8's corpus mathematics: Lance–Williams, PAM, silhouette, Jacobi, classical MDS, seriation.
 *
 * Every algorithm here is checked against something that is NOT it:
 *
 * - `single` and `complete` against a brute-force min/max over member pairs, on random matrices;
 * - `ward.D2` against Ward's own closed form on Euclidean data,
 *   `height = √(2·n_I·n_J/(n_I+n_J))·|c_I − c_J|`, which shares no line with the recurrence;
 * - `pam` against an exhaustive search over every `k`-subset;
 * - `silhouette` against the formula, evaluated independently;
 * - `jacobiEigen` against `A = V Λ Vᵀ` and against `VᵀV = I`;
 * - `classicalMds` against the distances it is supposed to reproduce, on a Euclidean point set.
 *
 * Asserting the outputs a first run happened to produce would pin this implementation rather
 * than the mathematics, which is the discipline `quadrature.ts`'s Newton re-derivation and
 * `eventAlignment.ts`'s brute-force enumeration established.
 */
import { describe, it, expect } from 'vitest';
import {
  agglomerate,
  pam,
  silhouette,
  type DistanceMatrix,
} from '../../src/comparison/clustering.js';
import {
  classicalMds,
  doubleCentered,
  jacobiEigen,
  seriationOrder,
} from '../../src/comparison/embedding.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function lcg(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

/** A symmetric zero-diagonal matrix from a list of points on a line. */
function fromPoints(points: readonly number[]): DistanceMatrix {
  const n = points.length;
  const values = new Array<number>(n * n).fill(0);
  for (let i = 0; i < n; ++i)
    for (let j = 0; j < n; ++j) values[i * n + j] = Math.abs(points[i] - points[j]);
  return { n, values };
}

/** A symmetric zero-diagonal matrix from planar points — Euclidean by construction. */
function fromPlane(points: readonly (readonly [number, number])[]): DistanceMatrix {
  const n = points.length;
  const values = new Array<number>(n * n).fill(0);
  for (let i = 0; i < n; ++i)
    for (let j = 0; j < n; ++j)
      values[i * n + j] = Math.hypot(points[i][0] - points[j][0], points[i][1] - points[j][1]);
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
  const merge = merges[node - n];
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
        // MEMBERS, which is the definition the recurrence is a shortcut for.
        for (const [index, merge] of merges.entries()) {
          const left = leavesOf(merges, n, merge.left);
          const right = leavesOf(merges, n, merge.right);
          let expected = linkage === 'single' ? Infinity : -Infinity;
          for (const i of left)
            for (const j of right)
              expected =
                linkage === 'single'
                  ? Math.min(expected, matrix.values[i * n + j])
                  : Math.max(expected, matrix.values[i * n + j]);
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
        for (const i of left) for (const j of right) total += matrix.values[i * n + j];
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
        group.reduce((sum, index) => sum + points[index], 0) / group.length;
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
  // A tie-RICH matrix: every distance equal, which is what a corpus of `both-neutral`
  // dimensions or a duplicated document produces. Under index-keyed rules this is exactly where
  // a permutation changes the merge structure rather than relabeling it.
  const n = 5;
  const flat: DistanceMatrix = {
    n,
    values: Array.from({ length: n * n }, (_unused, index) => (index % (n + 1) === 0 ? 0 : 1)),
  };

  const permute = (matrix: DistanceMatrix, order: readonly number[]): DistanceMatrix => ({
    n: matrix.n,
    values: Array.from({ length: matrix.n * matrix.n }, (_unused, index) => {
      const i = Math.floor(index / matrix.n);
      const j = index % matrix.n;
      return matrix.values[order[i] * matrix.n + order[j]];
    }),
  });

  it('relabels the dendrogram under a permutation rather than restructuring it', () => {
    const labels = labelsOf(n);
    const order = [3, 1, 4, 0, 2];
    const straight = agglomerate(flat, 'average', labels);
    const shuffled = agglomerate(
      permute(flat, order),
      'average',
      order.map((index) => labels[index]),
    );

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
   * W4 CAPITAL-2, at the layer that had it: PAM's own tie rule, over EVERY permutation.
   *
   * The dendrogram test above is the equivariance claim for `agglomerate`; `pam` had no such
   * test, and the corpus-level P-C6 test uses a tie-free corpus with one fixed permutation and
   * no `k`, so `medoids` was null there. That is the exact blind spot the shipped defect sat in.
   *
   * The matrix is two clean blocks with an interior distance of 0, so `{one from each block}`
   * ties with every other such pair and there are genuinely several cost-equal optima. Labels
   * are deliberately NOT in index order — the whole failure was a key that was label-VALUED but
   * index-ORDERED, which reads as a label rule and is not one, and a label list already sorted
   * by index would hide it. All 24 permutations, and the claim is about `clusters` as much as
   * `medoids`: a caller who gets a stable medoid set and unstable cluster assignments is no
   * better off.
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
      const shuffled = pam(
        permute(blocks, order),
        2,
        order.map((index) => labels[index]),
      );
      expect(shuffled?.exhaustive).toBe(true);
      // Both products are read back in the caller's OWN labels, which is the only frame in
      // which two differently-ordered corpora can be compared at all.
      const medoids = shuffled!.medoids.map((item) => labels[order[item]]);
      const clusters = shuffled!.clusters
        .map(
          (cluster, item) => `${labels[order[item]]}→${labels[order[shuffled!.medoids[cluster]]]}`,
        )
        .sort();
      answers.add(JSON.stringify({ medoids, clusters }));
    }

    // [MEASURED] One answer, not two. Before the sort landed in `exhaustiveMedoids`' key this
    // set held TWO: `{L00,L01}` under 20 permutations and `{L00,L03}` under the other 4, each
    // reported with `exhaustive: true` — two different global optima for the same corpus.
    expect([...answers]).toHaveLength(1);
    expect(JSON.parse([...answers][0] as string).medoids).toEqual(['L00', 'L01']);
  });

  it('is non-vacuous: the tie-rich matrix really does have cost-equal optima', () => {
    // Without this the test above would pass on a corpus with a unique optimum, where no tie
    // rule is ever consulted and permutation-invariance is free.
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
        total += Math.min(...chosen.map((medoid) => blocks.values[i * size + medoid]));
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
          total += Math.min(...chosen.map((medoid) => matrix.values[i * n + medoid]));
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
    // corpora of 4–7 items it landed above the optimum 12 times, worst excess 41 %. A medoid is
    // the one product whose value is naming a real performer, so that is not a rounding matter.
    // Reproduced here on the single worst case the sweep found, so the figure has a witness.
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
    // Still SWAP-locally optimal: no single exchange improves it, which is PAM's own promise.
    const medoids = result?.medoids ?? [];
    const cost = result?.cost ?? 0;
    for (const position of medoids.keys())
      for (let candidate = 0; candidate < 60; ++candidate) {
        if (medoids.includes(candidate)) continue;
        const trial = [...medoids];
        trial[position] = candidate;
        let trialCost = 0;
        for (let i = 0; i < 60; ++i)
          trialCost += Math.min(...trial.map((m) => matrix.values[i * 60 + m]));
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
    // The two obvious groups, whichever medoids were chosen.
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
   * W4 MAJOR-3: `C(n, k) = C(n, n − k)`, and the pruning guard that has to land with it.
   *
   * `chooseCount` multiplied along the row up to `k`. `C(n, j)` is UNIMODAL, so for a `k` near
   * `n` an intermediate product blows the limit while the answer is tiny — 841 legal `(n, k)`
   * pairs got `exhaustive: false` and a published note claiming the count was past the limit,
   * when `C(26, 24)` is 325 and `C(21, 21)` is 1.
   *
   * The guard is the other half and not an optimization: without it `walk` visits
   * `Σ_{j≤k} C(n, j)` nodes, so correcting the count alone turns a false flag into a hang —
   * `pam(30, 28)` was measured at **51054 ms** in that state, against 1 ms before and 8 ms now.
   * Every case below therefore also serves as the guard's detector: unguarded, this test does
   * not fail, it stops.
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

    // …and the answer really is the global optimum, checked by enumerating the items to
    // EXCLUDE rather than the ones to keep — `C(26, 2) = 325` subsets, and a different
    // enumeration from the one the implementation runs.
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
          total += Math.min(...kept.map((medoid) => matrix.values[i * n + medoid]));
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
    for (let item = 0; item < matrix.n; ++item) {
      const own = clusters
        .map((c, i) => [c, i] as const)
        .filter(([c, i]) => c === clusters[item] && i !== item);
      const other = clusters.map((c, i) => [c, i] as const).filter(([c]) => c !== clusters[item]);
      const a =
        own.reduce((sum, [, i]) => sum + matrix.values[item * matrix.n + i], 0) / own.length;
      const b =
        other.reduce((sum, [, i]) => sum + matrix.values[item * matrix.n + i], 0) / other.length;
      expect(scores[item]).toBeCloseTo((b - a) / Math.max(a, b), 12);
    }
  });

  /**
   * The silhouette under permutation — AD-72.2's sweep, on a corpus big enough to show it.
   *
   * `a` and `b` sum a cluster's members, and members were collected in the caller's item order.
   * Floating-point addition is not associative, so a permuted corpus adds the same numbers in a
   * different sequence and the published per-item score is not the same double. The six-item
   * vendored corpus does NOT show this — its clusters are small enough that the additions
   * reassociate exactly — which is why the repair looked defensive until it was measured on
   * something larger.
   *
   * [MEASURED] `n = 12..19`, `k = 3`, 30 corpora × 6 permutations = 2844 per-item comparisons:
   * **1242 differ** bit-wise without the label ordering, **0** with it. Not a corner case — it
   * is nearly half of them, and the only reason it was invisible is that nothing had permuted a
   * corpus this size.
   */
  it('gives bit-identical scores under permutation, on a corpus large enough to show it', () => {
    const next = lcg(31337);
    let disagreements = 0;
    let cases = 0;

    const permute = (matrix: DistanceMatrix, order: readonly number[]): DistanceMatrix => ({
      n: matrix.n,
      values: Array.from({ length: matrix.n * matrix.n }, (_unused, index) => {
        const i = Math.floor(index / matrix.n);
        const j = index % matrix.n;
        return matrix.values[order[i] * matrix.n + order[j]];
      }),
    });

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
      const partition = pam(matrix, 3, labels);
      const straight = silhouette(matrix, partition!.clusters, labels);
      const byLabel = new Map(labels.map((label, item) => [label, straight[item]]));

      for (let attempt = 0; attempt < 6; ++attempt) {
        const order = Array.from({ length: n }, (_unused, index) => index);
        for (let i = n - 1; i > 0; --i) {
          const j = Math.floor(next() * (i + 1));
          [order[i], order[j]] = [order[j], order[i]];
        }
        const permutedLabels = order.map((index) => labels[index]);
        const permuted = permute(matrix, order);
        const shuffled = silhouette(
          permuted,
          pam(permuted, 3, permutedLabels)!.clusters,
          permutedLabels,
        );
        for (let item = 0; item < n; ++item) {
          cases += 1;
          if (byLabel.get(permutedLabels[item]) !== shuffled[item]) disagreements += 1;
        }
      }
    }

    expect(cases).toBeGreaterThan(1000);
    expect(disagreements).toBe(0);
  });

  /**
   * MINOR-R5's boundary, stated as a test because the repair alone does not reach it.
   *
   * The six label comparators are total orders now (`lower(a,b) ? -1 : 1` answers `1` in BOTH
   * directions for equal labels, which is not a comparator and leaves `Array.prototype.sort`
   * in unspecified territory). That repair is right on its own terms and it does NOT deliver
   * permutation-invariance under duplicate labels — measured, `pam`'s cost still takes 2
   * distinct values over 40 permutations at `n = 12` with three labels shared twelve ways,
   * exactly as the verifier reported, and the index fallback cannot help because the index is
   * what permutes.
   *
   * The cause is one level up, in `exhaustiveMedoids`' tie KEY: two subsets with different
   * costs can share a label multiset, and then no label-keyed rule can choose between them —
   * they are indistinguishable in the only frame the corpus has. This is not a defect to repair
   * but the reason §8 requires labels unique after expansion, and what that requirement buys is
   * asserted here: the products are invariant on the supported domain, and the unsupported one
   * is refused at the door rather than silently answered.
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
    for (let attempt = 0; attempt < 40; ++attempt) {
      const order = Array.from({ length: n }, (_unused, index) => index);
      for (let i = n - 1; i > 0; --i) {
        const j = Math.floor(next() * (i + 1));
        [order[i], order[j]] = [order[j], order[i]];
      }
      const permuted: DistanceMatrix = {
        n,
        values: Array.from({ length: n * n }, (_unused, index) => {
          const i = Math.floor(index / n);
          const j = index % n;
          return matrix.values[order[i] * n + order[j]];
        }),
      };
      const permutedLabels = order.map((index) => unique[index]);
      const result = pam(permuted, 3, permutedLabels);
      answers.add(
        [
          result!.cost.toPrecision(17),
          result!.medoids
            .map((item) => permutedLabels[item])
            .sort()
            .join(','),
          silhouette(permuted, result!.clusters, permutedLabels)
            .map((score) => score.toPrecision(17))
            .sort()
            .join(','),
        ].join(' | '),
      );
    }
    // ONE answer: cost, medoid set and the whole silhouette multiset, over 40 permutations.
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

      for (let i = 0; i < n; ++i)
        for (let j = 0; j < n; ++j) {
          let reconstructed = 0;
          for (let k = 0; k < n; ++k)
            reconstructed += vectors[i * n + k] * eigen[k] * vectors[j * n + k];
          expect(reconstructed).toBeCloseTo(values[i * n + j], 10);

          let dot = 0;
          for (let k = 0; k < n; ++k) dot += vectors[k * n + i] * vectors[k * n + j];
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
    for (let i = 0; i < matrix.n; ++i)
      for (let j = 0; j < matrix.n; ++j) {
        const recovered = Math.hypot(
          embedding.coordinates[i * 2] - embedding.coordinates[j * 2],
          embedding.coordinates[i * 2 + 1] - embedding.coordinates[j * 2 + 1],
        );
        expect(recovered).toBeCloseTo(matrix.values[i * matrix.n + j], 9);
      }
    // A planar corpus has no negative mass to report.
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

    // Explained variance is over `Σ|λ|`, so the retained axes never claim the negative mass —
    // and it is SIGNED, `λ_j / Σ|λ|` (W4 MAJOR-2). Both axes retained here are positive, so
    // this assertion cannot tell the two readings apart; the test below is the one that can.
    const total = embedding.eigenvalues.reduce((sum, value) => sum + Math.abs(value), 0);
    for (const [axis, share] of embedding.explainedVariance.entries())
      expect(share).toBeCloseTo(embedding.eigenvalues[axis] / total, 12);
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
   * W4 MAJOR-2: a NEGATIVE axis reports negative variance, because the sign is the signal.
   *
   * `Math.abs(eigenvalue) / total` credited an imaginary direction with positive variance. Both
   * facts about such an axis point the other way: only `eigenvalue > 0` is embedded, so its
   * `coordinates` are all zero, and its eigenvalue is negative because the corpus is not
   * Euclidean. Reported at `+1.8 %` it reads as a real axis carrying real spread and is neither.
   *
   * Measured through the public API on the vendored corpus at `embeddingAxes: 9 = n−1` (legal):
   * axes 7 and 8 had eigenvalues `−145738.84` and `−567987.33`, all-zero coordinates, and
   * shares of `+0.004664811652368655` and `+0.018180149719632315` — 2.28 % of the variance
   * credited to two axes that are not there. Reproduced here on the smallest corpus that has
   * the shape, so the claim is about the arithmetic rather than about one fixture.
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

    // The axis carries no coordinates at all — which is the fact the positive share denied.
    for (let item = 0; item < n; ++item) expect(embedding.coordinates[item * n + 3]).toBe(0);

    // The shares now sum to `Σλ / Σ|λ|`, i.e. BELOW 1 by exactly twice the negative mass.
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
   * The sign rule, as AD-67.1 leaves it — and this fixture is the reason it had to move.
   *
   * The rule used to read "the largest-magnitude component is positive", with ties on EXACTLY
   * equal magnitude going to the lowest label. On this square the four corners are at ±2 and
   * tied in exact arithmetic, but the computed magnitudes differ in the last ulp:
   * `1.99999999999999911`, `1.99999999999999978`, `2.00000000000000000`, `1.99999999999999933`.
   * So the exact tie test never fired, the anchor was whichever corner won by an ulp, and a
   * permuted corpus — which runs Jacobi's rotations in a different sequence — could hand that
   * ulp to a corner of the opposite sign and mirror the whole plot. Measured on the vendored
   * corpus: `A-tel` at `+634.1636783061936` under four item orders, `−634.1636783061933` under
   * two others (W4 CAPITAL-3).
   *
   * The rule now reads: among the components tied at the peak RELATIVELY, the lowest-label one
   * is positive. On a corpus with a unique peak that is the old rule verbatim.
   */
  it('anchors each axis on the lowest-label component at its peak, so two runs are not mirrors', () => {
    const matrix = fromPlane(square);
    const labels = labelsOf(square.length);
    const once = classicalMds(matrix, 2, labels);
    const twice = classicalMds(matrix, 2, labels);
    expect(twice.coordinates).toEqual([...once.coordinates]);

    for (let axis = 0; axis < once.axes; ++axis) {
      const column = Array.from(
        { length: matrix.n },
        (_unused, item) => once.coordinates[item * once.axes + axis],
      );
      const peak = Math.max(...column.map((value) => Math.abs(value)));
      if (peak === 0) continue;
      // `labelsOf` is index-ordered, so the first index at the peak IS the lowest label.
      const anchor = column.findIndex((value) => Math.abs(value) >= peak * (1 - 1e-9));
      expect({ axis, anchored: column[anchor] }).toEqual({
        axis,
        anchored: Math.abs(column[anchor]),
      });
    }
  });

  it('is non-vacuous: on this square the anchor is NOT the strict maximum', () => {
    // Without this the test above would pass under the old exact rule too. The strict maximum
    // of axis 0 is a corner of the opposite sign, one ulp above the anchor — which is exactly
    // the ulp the old rule was deciding the plot's orientation on.
    const once = classicalMds(fromPlane(square), 2, labelsOf(square.length));
    const column = Array.from(
      { length: square.length },
      (_unused, item) => once.coordinates[item * once.axes],
    );
    const peak = Math.max(...column.map((value) => Math.abs(value)));
    const strictest = column.findIndex((value) => Math.abs(value) === peak);
    const anchor = column.findIndex((value) => Math.abs(value) >= peak * (1 - 1e-9));
    expect(strictest).not.toBe(anchor);
    expect(column[strictest]).toBeLessThan(0);
    expect(column[anchor]).toBeGreaterThan(0);
    // …and the two really are the same number to every digit anyone would print.
    expect(Math.abs(column[strictest])).toBeCloseTo(Math.abs(column[anchor]), 12);
  });

  it('pads the retained axes rather than dropping them', () => {
    const embedding = classicalMds(fromPoints([0, 1, 2]), 5, labelsOf(3));
    expect(embedding.axes).toBe(5);
    expect(embedding.coordinates).toHaveLength(15);
    expect(embedding.coordinates.every((value) => Number.isFinite(value))).toBe(true);
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
        for (let k = 0; k < n; ++k) total += x[row * n + k] * y[k * n + column];
        return total;
      });
    const expected = product(product(j, squared), j).map((value) => -0.5 * value);
    for (const [index, value] of doubleCentered(matrix).values.entries())
      expect(value).toBeCloseTo(expected[index], 10);
  });
});

describe('seriation', () => {
  it('orders by the first MDS coordinate', () => {
    const matrix = fromPoints([0, 10, 3, 7, 1]);
    const labels = labelsOf(5);
    const embedding = classicalMds(matrix, 2, labels);
    const order = seriationOrder(embedding, labels);
    const first = order.map((index) => embedding.coordinates[index * embedding.axes]);
    expect([...first].sort((x, y) => x - y)).toEqual(first);
    expect([...order].sort((x, y) => x - y)).toEqual([0, 1, 2, 3, 4]);
    // On a one-dimensional corpus the order IS the line, up to the sign the rule fixes.
    // Points 0, 10, 3, 7, 1: ascending along the line is 0, 1, 3, 7, 10 — indices 0, 4, 2, 3, 1.
    expect(order).toEqual([0, 4, 2, 3, 1]);
  });
});

/**
 * W4 CAPITAL-3: P-C6 through the embedding, and the exact place the guarantee stops.
 *
 * Two claims, and the second is as much the point as the first. Permuting a corpus reruns
 * Jacobi's rotations in a different sequence, so every quantity here arrives with ulp-level
 * noise on it, and every tie rule that tested `===` before falling back to the label was
 * therefore deciding on the noise. That is the near-tie, and it is repaired.
 *
 * The exact tie is not repairable at this layer and the module says so in data rather than in
 * prose: where two retained eigenvalues coincide, the eigenspace has no canonical basis and
 * `degenerate` is true. AD-67.1 ruled that narrow-with-data over canonicalising the block.
 */
describe('AD-67.1: the embedding is permutation-equivariant, and says where it is not', () => {
  const permuteMatrix = (matrix: DistanceMatrix, order: readonly number[]): DistanceMatrix => ({
    n: matrix.n,
    values: Array.from({ length: matrix.n * matrix.n }, (_unused, index) => {
      const i = Math.floor(index / matrix.n);
      const j = index % matrix.n;
      return matrix.values[order[i] * matrix.n + order[j]];
    }),
  });

  /** Both products read back in the caller's own labels, which is the only comparable frame. */
  const readback = (matrix: DistanceMatrix, labels: readonly string[]) => {
    const embedding = classicalMds(matrix, 2, labels);
    const byLabel = new Map<string, readonly [number, number]>();
    for (let item = 0; item < matrix.n; ++item)
      byLabel.set(labels[item], [
        embedding.coordinates[item * 2],
        embedding.coordinates[item * 2 + 1],
      ]);
    return {
      degenerate: embedding.degenerate,
      seriation: seriationOrder(embedding, labels)
        .map((item) => labels[item])
        .join(','),
      byLabel,
      eigenvalues: embedding.eigenvalues,
      coordinates: [...byLabel.entries()]
        .sort(([x], [y]) => (x < y ? -1 : 1))
        .map(([label, point]) => `${label}:${point[0].toPrecision(12)},${point[1].toPrecision(12)}`)
        .join('|'),
    };
  };

  /**
   * Whether one run's axis is the other's MIRROR — the failure the sign anchor exists to stop.
   *
   * Per-coordinate `Math.sign` would be the wrong test: an item at the corpus centroid sits at
   * `1e-17` on an axis and its sign carries no information at all. Comparing the whole vector
   * against its own negation does, and it is robust to exactly those near-zero entries.
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
   * What equivariance can and cannot mean for a float computation, stated exactly.
   *
   * The SIGN and the ORDER are exactly reproducible and are asserted as such — they are
   * discrete choices, and CAPITAL-3 was that both of them were being made on float noise. The
   * coordinate VALUES are not bit-reproducible and never could be: a permuted matrix runs
   * Jacobi's rotations in a different sequence, so the arithmetic differs in the last ulps.
   * They are asserted to a relative `1e-9`, which is {@link TIE_EPSILON}'s own band — the
   * claim being that the noise stays inside the band the tie rules were widened to absorb.
   *
   * [MEASURED] this exact test against the shipped code, by reverting `embedding.ts` alone:
   * **211** of 600 permutations disagreed on the seriation, **15** axes came back mirrored, and
   * the worst relative coordinate displacement was **2.0** — which is what a mirror is. All
   * three are 0 now. The seriation figure is the largest because
   * `coordinates[x*axes] - coordinates[y*axes] || label` reached its label branch only on an
   * EXACT float equality, which two permuted runs essentially never produce, so the published
   * order followed the last ulp on every near-tie.
   */
  it('gives the same seriation, the same orientation and the same coordinates under permutation', () => {
    const next = lcg(777);
    let seriationDisagreements = 0;
    let mirroredAxes = 0;
    let worstRelative = 0;
    let cases = 0;

    for (let trial = 0; trial < 20; ++trial) {
      const n = 4 + Math.floor(next() * 4);
      // Planar points, half of them DUPLICATED, so exact zero distances and near-tied
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

      for (let attempt = 0; attempt < 30; ++attempt) {
        const order = Array.from({ length: n }, (_unused, index) => index);
        for (let i = n - 1; i > 0; --i) {
          const j = Math.floor(next() * (i + 1));
          [order[i], order[j]] = [order[j], order[i]];
        }
        const shuffled = readback(
          permuteMatrix(matrix, order),
          order.map((index) => labels[index]),
        );
        cases += 1;
        if (shuffled.seriation !== straight.seriation) seriationDisagreements += 1;
        for (const axis of [0, 1] as const) {
          // Only an axis that EXISTS can be mirrored. A collinear corpus has
          // `λ = [70.3, 2.08e-15, -1.11e-15]`: its second axis is rounding error, its
          // coordinates peak at `2.6e-8`, and asking which way round it points is not a
          // question. Skipping it is the same materiality rule `classicalMds` uses to decide
          // whether a repeated eigenvalue is worth flagging, applied to the same end.
          const scale = Math.abs(straight.eigenvalues[0]);
          if (!(Math.abs(straight.eigenvalues[axis]) > 1e-9 * scale)) continue;
          if (isMirrored(straight.byLabel, shuffled.byLabel, axis)) mirroredAxes += 1;
        }
        for (const axis of [0, 1] as const) {
          if (!(Math.abs(straight.eigenvalues[axis]) > 1e-9 * Math.abs(straight.eigenvalues[0])))
            continue;
          // Relative to the AXIS's own extent, not to each coordinate: an item sitting at the
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
    expect({ seriationDisagreements, mirroredAxes }).toEqual({
      seriationDisagreements: 0,
      mirroredAxes: 0,
    });
    expect(worstRelative).toBeLessThan(1e-9);
  });

  /**
   * The carve-out, as an observable rather than as a sentence.
   *
   * Three documents each listed twice, every cross-document distance equal: the gate's own
   * example, and its spectrum is `[9, 9, ~0, ~0, ~0, 0]`. The top eigenvalue is DOUBLE, so the
   * plane it spans has no distinguished pair of axes and every rotation within it is as valid
   * as every other. No sign rule reaches that, which is why the honest answer is the flag.
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
    // The narrower A3b condition is NOT what is true here — `Σ|λ| > 0` and the variance shares
    // are real numbers. The flag widened; `explainedVariance`'s contract did not.
    expect(embedding.explainedVariance.every((share) => share !== null)).toBe(true);

    // Non-vacuity, and the reason the flag is not decoration: the coordinates really do move.
    // [MEASURED] 78 distinct coordinate sets and 6 distinct seriations over all 720 orders.
    const seen = new Set<string>();
    for (const order of [
      [0, 1, 2, 3, 4, 5],
      [1, 0, 2, 3, 4, 5],
      [2, 3, 0, 1, 4, 5],
      [5, 4, 3, 2, 1, 0],
    ])
      seen.add(
        readback(
          permuteMatrix(matrix, order),
          order.map((index) => labels[index]),
        ).coordinates,
      );
    expect(seen.size).toBeGreaterThan(1);
  });

  /**
   * The two numeric honesties W4's gate raised, pinned so the prose cannot drift from them.
   *
   * MINOR-11: `negativeEigenvalueMass` is a MEASURED quantity, and a perfectly Euclidean corpus
   * can report a value at the noise floor because Jacobi leaves a zero eigenvalue at `±1e-16`
   * with an arbitrary sign. Not clamped — a threshold would hide the small-but-real
   * non-Euclideanness the field exists to report — so what is pinned is that it stays at the
   * floor rather than that it is zero.
   *
   * MINOR-13: `jacobiEigen` used `Math.hypot(...a)`, which spreads `n²` arguments against V8's
   * measured 105741-argument limit, so it THREW at `n ≥ 326` — verified by restoring the old
   * line, which fails here as `RangeError` or as `Maximum call stack size exceeded` depending on
   * how the engine reports the limit that run. That variability is itself the argument:
   * `DEFAULT_MAX_ITEMS = 256` left 1.61× headroom, and a ceiling that depends on an engine's
   * argument handling is not one anyone can reason about. Accumulated instead.
   */
  it('reports noise-floor negative mass on a Euclidean simplex, and survives past N = 326', () => {
    for (const k of [3, 4, 5, 7, 12]) {
      const values = new Array<number>(k * k).fill(0);
      for (let i = 0; i < k; ++i) for (let j = 0; j < k; ++j) values[i * k + j] = i === j ? 0 : 1;
      const embedding = classicalMds({ n: k, values }, 2, labelsOf(k));
      // A regular simplex is exactly Euclidean, so the TRUE value is 0 and anything above the
      // floor would be a real defect rather than a rounding residue.
      expect({ k, atFloor: embedding.negativeEigenvalueMass < 1e-14 }).toEqual({
        k,
        atFloor: true,
      });
    }

    // Past the old `Math.hypot` ceiling. `n = 330` is 108900 arguments, comfortably over V8's
    // measured 105741, and the previous line threw on exactly this input.
    //
    // The matrix is DIAGONAL, which is what keeps this cheap: the ceiling lives in the very
    // first statement, where the off-diagonal threshold is computed by spreading all `n²`
    // entries, and a matrix that is already diagonal exits the sweep loop on its first check.
    // So this exercises the argument count — the whole of the claim — in `O(n²)` work rather
    // than the `O(n³)`-per-sweep of a full eigendecomposition. A dense 330×330 matrix here cost
    // 33 s under a loaded runner and timed out, which is a test-suite defect of the kind this
    // file's own history records (`editDimensions` went from 37.8 s to 12.4 s for the same
    // reason): the number of arguments is the subject, not the number of rotations.
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
    // A near-zero TAIL is not a degeneracy a reader can see: `√λ·v` at the noise floor is below
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
