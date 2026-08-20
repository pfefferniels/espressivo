/**
 * `compareMpmCorpus` — §8 over the vendored corpus.
 *
 * Three claims carry this file, and each has a test that can fail:
 *
 * 1. **The matrix is one function.** Every cell equals the `compareMpm` number for the same pair
 *    under the same window, so a corpus cannot drift from the product it is assembled from.
 * 2. **P-C6's corpus clause.** Permuting `items` permutes the matrices and relabels the
 *    dendrogram, and changes nothing else — asserted against a PERMUTED re-run, not against a
 *    stored expectation.
 * 3. **The window is corpus-shared.** One window for every cell (R3), derived once, and the
 *    stamps say which rule produced it.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { compareMpm, compareMpmCorpus, neutralMpm } from '../../src/api/comparison.js';
import { InvalidOptionError, ParseError } from '../../src/api/errors.js';
import { COMPARISON_DIMENSIONS } from '../../src/comparison/registry.js';
import type { XmlText } from '../../src/api/types.js';
import type { CorpusReport } from '../../src/comparison/report.js';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');
const fixture = (name: string) => readFileSync(join(FIXTURES, `${name}.mpm`), 'utf-8') as XmlText;
const TELEMANN = fixture('telemann-grave');
const VULPIUS = fixture('vulpius-die-helle-sonn');
const ALBERT = fixture('albert-du-mein-einzig-licht');

/** A window short enough for a whole matrix, long enough to carry every dimension. */
const SHORT = { start: 0, end: 16 } as const;

const corpus = (
  items: readonly { mpm: XmlText; performance?: string | number; label?: string }[],
  overrides: Record<string, unknown> = {},
): CorpusReport => compareMpmCorpus({ items, window: SHORT, ...overrides }).report;

// ---------------------------------------------------------------------------

describe('the matrix is one function (R3)', () => {
  it('reproduces compareMpm’s own numbers cell by cell', () => {
    const report = corpus([
      { mpm: TELEMANN, label: 'tel' },
      { mpm: ALBERT, label: 'alb' },
    ]);
    expect(report.n).toBe(5);

    for (let i = 0; i < report.n; ++i)
      for (let j = 0; j < report.n; ++j) {
        if (i === j) continue;
        const a = report.items[i];
        const b = report.items[j];
        const pair = compareMpm({
          a: a.itemIndex === 0 ? TELEMANN : ALBERT,
          b: b.itemIndex === 0 ? TELEMANN : ALBERT,
          performanceA: a.performance,
          performanceB: b.performance,
          window: SHORT,
        }).report;
        expect({ i, j, d: report.matrices.aggregate[i * report.n + j] }).toEqual({
          i,
          j,
          d: pair.aggregate.distance,
        });
        for (const dimension of COMPARISON_DIMENSIONS)
          expect({
            i,
            j,
            dimension,
            d: report.matrices.byDimension[dimension][i * report.n + j],
          }).toEqual({ i, j, dimension, d: pair.dimensions[dimension].distance });
      }
  });

  it('is bit-symmetric with a zero diagonal (A4)', () => {
    const report = corpus([
      { mpm: TELEMANN, label: 'tel' },
      { mpm: VULPIUS, label: 'vul' },
    ]);
    const n = report.n;
    for (const matrix of [
      report.matrices.aggregate,
      ...COMPARISON_DIMENSIONS.map((dimension) => report.matrices.byDimension[dimension]),
    ]) {
      expect(matrix).toHaveLength(n * n);
      for (let i = 0; i < n; ++i) {
        expect(matrix[i * n + i]).toBe(0);
        for (let j = 0; j < n; ++j) expect(matrix[i * n + j]).toBe(matrix[j * n + i]);
      }
    }
  });

  it('shares ONE window across every cell, and stamps which rule made it', () => {
    const report = corpus([
      { mpm: TELEMANN, label: 'tel' },
      { mpm: ALBERT, label: 'alb' },
    ]);
    expect(report.window.startQuarters).toBe(SHORT.start);
    expect(report.window.endQuarters).toBe(SHORT.end);
    expect(report.window.rule).toBe('explicit');
    expect(report.settings.window).toEqual({ start: SHORT.start, end: SHORT.end });

    // Without an explicit window the corpus derives ONE end for the whole matrix, which is what
    // makes AD-4's guarantee survive: it does not vary with the pair.
    const derived = compareMpmCorpus({
      items: [
        { mpm: TELEMANN, label: 'tel' },
        { mpm: ALBERT, label: 'alb' },
      ],
    }).report;
    expect(derived.window.rule).toBe('corpus');
    expect(derived.window.endQuarters).toBeGreaterThan(0);
  });
});

describe('§8’s expansion and labels', () => {
  it('expands a multi-performance item and leaves a single-performance one alone', () => {
    const report = corpus([
      { mpm: TELEMANN, label: 'tel' },
      { mpm: ALBERT, label: 'alb' },
    ]);
    // Telemann carries three performances, Albert two.
    expect(report.labels).toEqual([
      'tel:Baroque',
      'tel:Fast',
      'tel:Romantic',
      'alb:Axel Berndt',
      'alb:Like a robot',
    ]);
    expect(report.items.map((item) => item.itemIndex)).toEqual([0, 0, 0, 1, 1]);
    // AD-63.1 / W4 MINOR-3: the row carries the two fields it can say something about.
    // `synthetic` went with `corpusAverage` — the pseudo-performance was its only producer, so
    // the flag could report nothing but `false` for every row of every corpus.
    expect(Object.keys(report.items[0]!)).toEqual(['itemIndex', 'performance']);

    // A named performance does NOT expand and keeps the caller's own label.
    const named = corpus([{ mpm: TELEMANN, performance: 'Fast', label: 'just-fast' }]);
    expect(named.labels).toEqual(['just-fast']);
  });

  it('defaults a label to its item index', () => {
    const report = corpus([
      { mpm: TELEMANN, performance: 0 },
      { mpm: ALBERT, performance: 0 },
    ]);
    expect(report.labels).toEqual(['items[0]', 'items[1]']);
  });

  it('refuses colliding labels, naming every collision and its items (A8)', () => {
    expect(() =>
      corpus([
        { mpm: TELEMANN, performance: 0, label: 'Welte 1905' },
        { mpm: ALBERT, performance: 0, label: 'Welte 1905' },
      ]),
    ).toThrow(InvalidOptionError);
    try {
      corpus([
        { mpm: TELEMANN, performance: 0, label: 'dup' },
        { mpm: ALBERT, performance: 0, label: 'dup' },
      ]);
      expect.unreachable('should have thrown');
    } catch (error) {
      expect((error as Error).message).toContain('"dup"');
      expect((error as Error).message).toContain('items 0, 1');
    }
  });
});

describe('P-C6: permuting the items permutes the matrices and relabels the dendrogram', () => {
  const items = [
    { mpm: TELEMANN, performance: 'Baroque' as const, label: 'a-baroque' },
    { mpm: TELEMANN, performance: 'Fast' as const, label: 'b-fast' },
    { mpm: TELEMANN, performance: 'Romantic' as const, label: 'c-romantic' },
    { mpm: ALBERT, performance: 0, label: 'd-axel' },
  ];
  const order = [2, 0, 3, 1];

  it('is equivariant, matrix cell by matrix cell and merge by merge', () => {
    const straight = corpus(items);
    const shuffled = corpus(order.map((index) => items[index]));
    const n = straight.n;

    for (let i = 0; i < n; ++i)
      for (let j = 0; j < n; ++j)
        expect({ i, j, d: shuffled.matrices.aggregate[i * n + j] }).toEqual({
          i,
          j,
          d: straight.matrices.aggregate[order[i] * n + order[j]],
        });

    // The dendrogram RELABELS: leaf `i` in the shuffled run is leaf `order[i]` in the straight
    // one, and internal ids are positional, so the merge lists must coincide exactly.
    const back = (id: number) => (id < n ? order[id] : id);
    expect(
      shuffled.dendrogram.merges.map((merge) => ({
        ...merge,
        left: back(merge.left),
        right: back(merge.right),
      })),
    ).toEqual([...straight.dendrogram.merges]);
    expect(shuffled.dendrogram.order.map(back)).toEqual([...straight.dendrogram.order]);
    expect(shuffled.seriationOrder.map(back)).toEqual([...straight.seriationOrder]);
  });

  it('is non-vacuous: the permutation really does reorder the labels', () => {
    const straight = corpus(items);
    const shuffled = corpus(order.map((index) => items[index]));
    expect(shuffled.labels).not.toEqual([...straight.labels]);
    expect([...shuffled.labels].sort()).toEqual([...straight.labels].sort());
  });
});

/**
 * P-C6 on a TIE-RICH corpus — the blind spot the test above has, and where W4 CAPITAL-2 lived.
 *
 * The corpus above is tie-free and passes no `k`, so `medoids` is null there and PAM's tie rule
 * is never consulted: it asserts equivariance on a corpus that has nothing to be equivariant
 * about. This one is built to tie. Each of the three vendored documents is listed TWICE at the
 * same performance under two labels, so the matrix has three exact 0 cells off the diagonal and
 * the `k = 2` optimum is reached by several different subsets.
 *
 * The permutation is not random and not a sweep: it is the minimal witness — the first two
 * items swapped. Before the sort landed in `exhaustiveMedoids`' tie key that single swap changed
 * which performance the corpus called the most typical, from `B-vul-1` to `E-vul-2`, with
 * `exhaustive: true` on both. [MEASURED] over all 720 orders of this corpus, 600 said
 * `{A-tel-1, B-vul-1}` and 120 said `{A-tel-1, E-vul-2}`.
 *
 * §8 makes the medoid the one corpus product whose entire value is naming a real performer, so
 * this is the level the finding has to be pinned at, not only at `pam`'s own.
 */
describe('P-C6 where the ties are: the medoid does not depend on the caller’s item order', () => {
  const tied = [
    { mpm: TELEMANN, performance: 0, label: 'A-tel-1' },
    { mpm: VULPIUS, performance: 0, label: 'B-vul-1' },
    { mpm: ALBERT, performance: 0, label: 'C-alb-1' },
    { mpm: TELEMANN, performance: 0, label: 'D-tel-2' },
    { mpm: VULPIUS, performance: 0, label: 'E-vul-2' },
    { mpm: ALBERT, performance: 0, label: 'F-alb-2' },
  ];
  const swapFirstTwo = [1, 0, 2, 3, 4, 5];

  it('names the same medoids and the same clusters when two items trade places', () => {
    const straight = corpus(tied, { k: 2 });
    const shuffled = corpus(
      swapFirstTwo.map((index) => tied[index]),
      { k: 2 },
    );

    // Read both back in LABELS. Indices mean different things in the two runs, and the labels
    // are the frame in which "the same answer" is even a statement.
    const medoidsOf = (report: CorpusReport) =>
      (report.medoids ?? []).map((item) => report.labels[item]);
    const clustersOf = (report: CorpusReport) =>
      (report.clusters ?? [])
        .map((cluster, item) => `${report.labels[item]}→${report.labels[report.medoids![cluster]]}`)
        .sort();

    expect(medoidsOf(shuffled)).toEqual(medoidsOf(straight));
    expect(clustersOf(shuffled)).toEqual(clustersOf(straight));
    // Both runs claim the exhaustive global optimum — the absence of the heuristic note is how
    // the corpus surface says so — which is what made the disagreement a contradiction rather
    // than two heuristics differing.
    for (const report of [straight, shuffled])
      expect(report.notes.some((entry) => entry.message.includes('BUILD + SWAP'))).toBe(false);
  });

  /**
   * The same swap, through the other two published fields (W4 CAPITAL-3, AD-67.1).
   *
   * The seriation and the embedding failed permutation-invariance for a different reason than
   * the medoid did — not an index-keyed tie rule but an EXACT one, which a permuted Jacobi's
   * ulp-level noise never reaches. Measured before the repair on this corpus's own matrix:
   * 7 distinct seriations over 20 permutations, and `A-tel-1`'s first coordinate taking 16
   * distinct values, all `≈ −45.2370019107607`.
   */
  it('gives the same seriation and the same embedding when two items trade places', () => {
    const straight = corpus(tied, { k: 2, embeddingAxes: 2 });
    const shuffled = corpus(
      swapFirstTwo.map((index) => tied[index]),
      { k: 2, embeddingAxes: 2 },
    );

    expect(shuffled.seriationOrder.map((item) => shuffled.labels[item])).toEqual(
      straight.seriationOrder.map((item) => straight.labels[item]),
    );

    // Not bit-identical and it cannot be: the permuted matrix runs Jacobi's rotations in a
    // different sequence. The claim is that the difference stays inside the band the tie rules
    // were widened to absorb, rather than flipping an axis or reordering the plot.
    const pointOf = (report: CorpusReport, label: string) => {
      const item = report.labels.indexOf(label);
      return [report.embedding.coordinates[item * 2], report.embedding.coordinates[item * 2 + 1]];
    };
    const extent = Math.max(
      ...straight.labels.map((label) => Math.abs(pointOf(straight, label)[0])),
    );
    for (const label of straight.labels)
      for (const axis of [0, 1])
        expect({
          label,
          axis,
          within:
            Math.abs(pointOf(straight, label)[axis] - pointOf(shuffled, label)[axis]) <
            1e-9 * extent,
        }).toEqual({ label, axis, within: true });
  });

  /**
   * AD-72.2's sweep, landed: every published PER-ITEM number is bit-identical under permutation.
   *
   * AD-72.1 repaired `partitionCost`, whose caller-order summation let float non-associativity
   * break exact ties one level below the tie key, and AD-72.2 asked whether the disease had
   * siblings. It does: `profiles[i].toMeanDistance` is the mean of the same set of distances
   * under any permutation, but accumulated in the caller's item order it is not the same double
   * — measured, it differed BIT-WISE in 4 of 24 permutation cases before the repair.
   *
   * `silhouette` has the identical shape and measured clean on this corpus, its clusters being
   * small enough that the additions happen to reassociate exactly. It is repaired and pinned
   * anyway: "no permutation has reordered these particular sums yet" is not a property, and the
   * next corpus is not this one.
   */
  it('gives bit-identical per-item numbers under permutation (AD-72.2)', () => {
    // An EIGHT-quarter window, and the size is measured rather than chosen: at the 16 quarters
    // this file uses elsewhere the reassociated sums happen to agree bit for bit, so the defect
    // is invisible there. It is the same six items either way — which is the point, and the
    // reason a single fixed window is a poor detector for a float-association defect.
    const shorter = { window: { start: 0, end: 8 }, k: 2 } as const;
    const straight = corpus(tied, shorter);
    const readback = (report: CorpusReport) => {
      const byLabel = new Map<string, { silhouette: number; toMeanDistance: number }>();
      for (let item = 0; item < report.n; ++item)
        byLabel.set(report.labels[item], {
          silhouette: (report.silhouette ?? [])[item],
          toMeanDistance: report.profiles[item].toMeanDistance,
        });
      return byLabel;
    };
    const base = readback(straight);

    // Several orders, including reversal and two derangements, because the defect showed on
    // some permutations and not others — a single fixed order is what let it ship.
    for (const order of [
      [1, 0, 2, 3, 4, 5],
      [5, 4, 3, 2, 1, 0],
      [2, 4, 0, 5, 1, 3],
      [3, 1, 5, 0, 4, 2],
    ]) {
      const shuffled = readback(
        corpus(
          order.map((index) => tied[index]),
          shorter,
        ),
      );
      for (const [label, values] of base) {
        // `toBe`, not `toBeCloseTo`: the claim is bit-identity, and a tolerance here would be
        // exactly the epsilon AD-72.1 rejected in favour of a canonical order.
        expect({ label, ...(shuffled.get(label) ?? {}) }).toEqual({ label, ...values });
      }
    }

    // Non-vacuity: these are real numbers with real spread, not a corpus of zeros where any
    // summation order agrees.
    expect(new Set([...base.values()].map((entry) => entry.toMeanDistance)).size).toBeGreaterThan(
      1,
    );
  });

  it('is non-vacuous: this corpus really does tie, and the swap really does move the items', () => {
    const straight = corpus(tied, { k: 2 });
    // Three exact-0 off-diagonal cells: each document against its own duplicate.
    const zeros = [];
    for (let i = 0; i < straight.n; ++i)
      for (let j = i + 1; j < straight.n; ++j)
        if (straight.matrices.aggregate[i * straight.n + j] === 0) zeros.push([i, j]);
    expect(zeros).toHaveLength(3);

    const shuffled = corpus(
      swapFirstTwo.map((index) => tied[index]),
      { k: 2 },
    );
    expect(shuffled.labels).not.toEqual([...straight.labels]);
  });
});

describe('the products §8 reads off the matrix', () => {
  const items = [
    { mpm: TELEMANN, performance: 'Baroque' as const, label: 'tel-baroque' },
    { mpm: TELEMANN, performance: 'Fast' as const, label: 'tel-fast' },
    { mpm: TELEMANN, performance: 'Romantic' as const, label: 'tel-romantic' },
    { mpm: VULPIUS, performance: 'Baroque' as const, label: 'vul-baroque' },
    { mpm: VULPIUS, performance: 'Amateur' as const, label: 'vul-amateur' },
  ];

  it('clusters, embeds, seriates and profiles', () => {
    const report = corpus(items, { k: 2, embeddingAxes: 2, noiseFloor: true });
    expect(report.n).toBe(5);
    expect(report.dendrogram.merges).toHaveLength(4);
    expect(report.medoids).toHaveLength(2);
    expect(report.clusters).toHaveLength(5);
    expect(report.silhouette).toHaveLength(5);
    // Five items is well under twenty, so the caveat is a FIELD rather than prose (A22).
    expect(report.silhouetteReliable).toBe(false);
    expect(report.notes.some((entry) => entry.message.includes('silhouette is noisy'))).toBe(true);

    expect(report.embedding.coordinates).toHaveLength(10);
    expect(report.embedding.eigenvalues).toHaveLength(5);
    expect(report.embedding.axes).toBe(2);
    expect([...report.seriationOrder].sort((x, y) => x - y)).toEqual([0, 1, 2, 3, 4]);

    expect(report.profiles).toHaveLength(5);
    for (const profile of report.profiles) {
      expect(Number.isFinite(profile.toMeanDistance)).toBe(true);
      for (const dimension of COMPARISON_DIMENSIONS)
        expect(profile.toMedoid[dimension]).toBeGreaterThanOrEqual(0);
    }

    // AD-26.3's context is CONTEXT: the matrices are untouched by it.
    expect(report.context).not.toBeNull();
    expect(report.context?.percentile).toHaveLength(25);

    // …and the three figures are the quantiles of the off-diagonal distances the report also
    // ships, which is what makes them readable beside the matrix rather than beside nothing.
    //
    // Five items give TEN off-diagonal pairs, so every one of the three positions falls
    // BETWEEN two order statistics — `0.5·9 = 4.5`, `0.25·9 = 2.25`, `0.75·9 = 6.75` — and the
    // interpolation is therefore the whole of the answer. The median is stated as the textbook
    // average of the two central samples, which shares no line with the implementation.
    //
    // [NEGATIVE CONTROL, MEASURED] Making the interpolation read its LOWER neighbour twice, so
    // that a percentile degenerates to a selection, leaves the other 1311 tests green and reds
    // exactly these four expectations.
    const offDiagonal: number[] = [];
    for (let i = 0; i < 5; ++i)
      for (let j = i + 1; j < 5; ++j) offDiagonal.push(report.matrices.aggregate[i * 5 + j]);
    const sorted = [...offDiagonal].sort((x, y) => x - y);
    expect(sorted).toHaveLength(10);

    const median = (sorted[4] + sorted[5]) / 2;
    // The empirical-CDF quantile at `p`: the sample at `p·(n−1)`, linearly between neighbours.
    const lowerQuartile = sorted[2] + (sorted[3] - sorted[2]) * 0.25;
    const upperQuartile = sorted[6] + (sorted[7] - sorted[6]) * 0.75;

    expect(report.context?.corpusMedian).toBeCloseTo(median, 9);
    expect(report.context?.noiseFloor).toBeCloseTo(median, 9);
    expect(report.context?.corpusIqr).toBeCloseTo(upperQuartile - lowerQuartile, 9);
    // Non-vacuous: an interpolated quantile is not one of the samples it sits between.
    expect(sorted).not.toContain(report.context?.noiseFloor);
    const withoutContext = corpus(items, { k: 2, embeddingAxes: 2 });
    expect(withoutContext.context).toBeNull();
    expect(withoutContext.matrices.aggregate).toEqual([...report.matrices.aggregate]);
  });

  it('ranks every off-diagonal cell AT-or-below, which is what makes ties share a rank', () => {
    /**
     * A closed oracle gap.
     *
     * The block above pins `percentile`'s LENGTH and nothing else, and no other test in the
     * tree reads a value out of it — `readmeRecipes` asks one cell to be `> 0`. Measured:
     * replacing the at-or-below count with a strictly-below one (`lowerBoundBy` for
     * `upperBoundBy`) left all 1313 comparison tests green, even though the matrix is
     * SYMMETRIC and therefore every off-diagonal value is itself one of the ranked samples —
     * so the two disagree in every single cell, by that value's own multiplicity.
     *
     * The rule the module states is "a rank, so equal distances share a rank": the fraction
     * of pairs at or below this one, ties included. Derived here from the published aggregate
     * matrix by the textbook definition, which shares no line with the implementation.
     */
    const report = corpus(items, { k: 2, noiseFloor: true });
    const n = report.n;
    const percentile = report.context?.percentile;
    expect(percentile).toBeDefined();
    if (percentile === undefined) return;

    const offDiagonal: number[] = [];
    for (let i = 0; i < n; ++i)
      for (let j = i + 1; j < n; ++j) offDiagonal.push(report.matrices.aggregate[i * n + j]!);

    for (let i = 0; i < n; ++i)
      for (let j = 0; j < n; ++j) {
        const cell = percentile[i * n + j];
        if (i === j) {
          // The diagonal is never ranked — it is filled with 0 and skipped.
          expect({ i, j, cell }).toEqual({ i, j, cell: 0 });
          continue;
        }
        const value = report.matrices.aggregate[i * n + j]!;
        const atOrBelow = offDiagonal.filter((other) => other <= value).length;
        expect({ i, j, cell }).toEqual({ i, j, cell: atOrBelow / offDiagonal.length });
        // Non-vacuous, and the exact thing a strictly-below count gets wrong: the cell's own
        // distance is one of the ranked samples, so no off-diagonal rank can be 0.
        expect({ i, j, positive: cell! > 0 }).toEqual({ i, j, positive: true });
      }

    // …and the largest distance in the corpus is at the top of its own ranking.
    expect(Math.max(...percentile)).toBe(1);
  });

  it('takes profiles against the CORPUS medoid, whatever k was asked for', () => {
    // `toMedoid` is 0 exactly at the corpus medoid, which is the single most typical item.
    const report = corpus(items, { k: 3 });
    const zeroRows = report.profiles.filter((profile) =>
      COMPARISON_DIMENSIONS.every((dimension) => profile.toMedoid[dimension] === 0),
    );
    expect(zeroRows).toHaveLength(1);
  });

  it('normalizes by AD-25.5’s median formula when asked', () => {
    const fixed = corpus(items);
    const normalized = corpus(items, { normalization: 'corpus' });
    expect(fixed.normalizationConstants).toBeNull();
    expect(normalized.normalizationConstants).not.toBeNull();

    for (const dimension of COMPARISON_DIMENSIONS) {
      const nonzero: number[] = [];
      for (let i = 0; i < normalized.n; ++i)
        for (let j = i + 1; j < normalized.n; ++j) {
          const value = normalized.matrices.byDimension[dimension][i * normalized.n + j];
          if (value !== 0) nonzero.push(value);
        }
      const constant = normalized.normalizationConstants?.[dimension] ?? null;
      if (nonzero.length === 0) {
        expect(constant).toBeNull();
        continue;
      }
      const sorted = [...nonzero].sort((x, y) => x - y);
      const middle = sorted.length >> 1;
      const expected =
        sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
      expect(constant).toBeCloseTo(expected, 12);
    }

    // The per-dimension matrices are UNCHANGED — normalization rescales the aggregate only.
    expect(normalized.matrices.byDimension.tempo).toEqual([...fixed.matrices.byDimension.tempo]);
    expect(normalized.matrices.aggregate).not.toEqual([...fixed.matrices.aggregate]);
    // …and the rescaled aggregate is exactly `Σ ω_k d_k` with the derived weights.
    for (let i = 0; i < normalized.n; ++i)
      for (let j = i + 1; j < normalized.n; ++j) {
        let total = 0;
        for (const dimension of COMPARISON_DIMENSIONS) {
          const constant = normalized.normalizationConstants?.[dimension] ?? null;
          const omega = constant === null || constant === 0 ? 1 : 1 / constant;
          total += omega * normalized.matrices.byDimension[dimension][i * normalized.n + j];
        }
        expect(normalized.matrices.aggregate[i * normalized.n + j]).toBeCloseTo(total, 9);
      }
  });

  it('surfaces suspectPairs so a heterogeneous folder announces itself (C7)', () => {
    // Telemann against Albert: different pieces, and Albert's deadpan reading has no instruction
    // after date 0, so C7's length arm fires — which is the case the field exists for.
    const report = corpus([
      { mpm: TELEMANN, performance: 'Baroque', label: 'tel' },
      { mpm: ALBERT, performance: 'Like a robot', label: 'alb' },
    ]);
    expect(report.suspectPairs.length).toBeGreaterThan(0);
    expect(report.suspectPairs[0]).toMatchObject({ i: 0, j: 1, reason: 'length-mismatch' });
  });
});

describe('the degenerate corpora §8 makes legal (A3, M19)', () => {
  it('handles N = 0 and N = 1 without an error', () => {
    const empty = compareMpmCorpus({ items: [] }).report;
    expect(empty.n).toBe(0);
    expect(empty.matrices.aggregate).toEqual([]);
    expect(empty.dendrogram.merges).toEqual([]);
    expect(empty.medoids).toBeNull();
    expect(empty.embedding.degenerate).toBe(true);

    const single = compareMpmCorpus({ items: [{ mpm: neutralMpm(), label: 'one' }] }).report;
    expect(single.n).toBe(1);
    expect(single.matrices.aggregate).toEqual([0]);
    expect(single.dendrogram.order).toEqual([0]);
    expect(single.profiles[0].toMeanDistance).toBe(0);
  });

  it('flags a corpus of identical performances as degenerate rather than dividing by zero', () => {
    const report = corpus([
      { mpm: TELEMANN, performance: 'Baroque', label: 'x' },
      { mpm: TELEMANN, performance: 'Baroque', label: 'y' },
      { mpm: TELEMANN, performance: 'Baroque', label: 'z' },
    ]);
    expect(report.matrices.aggregate.every((value) => value === 0)).toBe(true);
    expect(report.embedding.degenerate).toBe(true);
    expect(report.embedding.explainedVariance.every((share) => share === null)).toBe(true);
  });

  /**
   * W4 MAJOR-9: the corpus forwards every note kind, once per distinct FACT.
   *
   * It used to filter on `kind === 'length-mismatch'`, so `capped`, `plausibility`,
   * `renderer-*`, `grid-truncated`, `invariance-space` and `estimate-degradation` findings from
   * the `N(N−1)/2` comparisons were unobservable at the corpus facade — and `plausibleRange` was
   * accepted, validated and inert here, since notes are its only product.
   *
   * Forwarding them verbatim is not the fix either. Most notes are about a DOCUMENT, and a
   * document sits in `N−1` pairs: measured on this five-item corpus, the pairwise pass produces
   * 664 `structural` notes over 10 pairs, of which 654 name a document. That is `O(N²)` copies
   * of an `O(N)` fact. They are deduplicated on their content, and `itemIndex` — not `document`,
   * which is pair-relative and meaningless once the pair is gone — carries the identity.
   */
  it('carries every note kind, deduplicated, with itemIndex naming the document', () => {
    const items = [
      { mpm: TELEMANN, performance: 'Baroque' as const, label: 'tel-b' },
      { mpm: TELEMANN, performance: 'Fast' as const, label: 'tel-f' },
      { mpm: TELEMANN, performance: 'Romantic' as const, label: 'tel-r' },
      { mpm: VULPIUS, performance: 'Baroque' as const, label: 'vul-b' },
      { mpm: ALBERT, performance: 0, label: 'alb' },
    ];
    const report = corpus(items);

    // More than one kind, which is the whole finding.
    const kinds = new Set(report.notes.map((entry) => entry.kind));
    expect(kinds.size).toBeGreaterThan(1);
    for (const kind of ['structural', 'capped', 'estimate-degradation', 'length-mismatch'])
      expect({ kind, present: kinds.has(kind as (typeof report.notes)[number]['kind']) }).toEqual({
        kind,
        present: true,
      });

    // `document` is dropped and `itemIndex` replaces it — the same file is `a` in one comparison
    // and `b` in the next, so the pair-relative field cannot survive the corpus.
    expect(report.notes.every((entry) => entry.document === null)).toBe(true);
    const documentScoped = report.notes.filter((entry) => entry.itemIndex !== null);
    expect(documentScoped.length).toBeGreaterThan(0);
    for (const entry of documentScoped)
      expect(entry.message.startsWith(`${report.labels[entry.itemIndex!]}: `)).toBe(true);

    // Deduplicated: 104 notes against the 713 the ten pairwise reports carry between them, and
    // no two say the same thing about the same item over the same span. The span belongs in the
    // identity — one document can be capped in two different places, and those are two facts.
    expect(report.notes.length).toBeLessThan(200);
    const fingerprints = report.notes.map((entry) =>
      JSON.stringify([
        entry.kind,
        entry.dimension,
        entry.itemIndex,
        entry.site,
        entry.startQuarters,
        entry.endQuarters,
        entry.message,
      ]),
    );
    expect(new Set(fingerprints).size).toBe(fingerprints.length);
  });

  /**
   * MAJOR-R2: the note dedupe folds pairwise reports into corpus facts WITHOUT keeping any
   * pair-relative data in the key or in the text.
   *
   * The first version of MAJOR-9's repair applied that reasoning to the top-level `document`
   * field and not to the copy inside `site`, and named only `pairs[0]` in the prefix. Three
   * measured symptoms, all fixed here and each asserted separately:
   *
   * (a) the note COUNT depended on item order — 100 against 104 for the same three-item corpus;
   * (b) a note firing on some-but-not-all pairs named only the first and the rest VANISHED,
   *     which for `length-mismatch` was strictly worse than the filter this repair replaced:
   *     `suspectPairs` naming five pairs beside a single note, one report contradicting itself;
   * (c) the message text varied under permutation, the same note reading `"C | B: …"` under one
   *     listing and `"B | C: …"` under another.
   */
  it('gives the same notes, the same count and the same text under every item order', () => {
    const three = [
      { mpm: TELEMANN, performance: 'Baroque' as const, label: 'tel-b' },
      { mpm: TELEMANN, performance: 'Fast' as const, label: 'tel-f' },
      { mpm: ALBERT, performance: 0, label: 'alb' },
    ];
    // ALL SIX orders of three items — the defect showed on some and not others, so a single
    // fixed permutation is exactly the instrument that missed it the first time.
    const orders = [
      [0, 1, 2],
      [0, 2, 1],
      [1, 0, 2],
      [1, 2, 0],
      [2, 0, 1],
      [2, 1, 0],
    ];
    const counts = new Set<number>();
    const texts = new Set<string>();
    for (const order of orders) {
      const report = corpus(order.map((index) => three[index]));
      counts.add(report.notes.length);
      texts.add(
        report.notes
          .map(
            (entry) =>
              `${entry.kind}|${entry.itemIndex === null ? '-' : report.labels[entry.itemIndex]}|${entry.message}`,
          )
          .sort()
          .join('\n'),
      );
    }
    // (a) one count, and (c) one text set — not two of either.
    expect([...counts]).toHaveLength(1);
    expect(texts.size).toBe(1);

    // Non-vacuity: there really are notes to disagree about.
    expect([...counts][0]).toBeGreaterThan(50);
  });

  it('names EVERY pair a note fired on, so nothing contradicts suspectPairs', () => {
    const four = [
      { mpm: TELEMANN, performance: 'Baroque' as const, label: 'tel-b' },
      { mpm: TELEMANN, performance: 'Fast' as const, label: 'tel-f' },
      { mpm: VULPIUS, performance: 'Baroque' as const, label: 'vul-b' },
      { mpm: ALBERT, performance: 0, label: 'alb' },
    ];
    const report = corpus(four);

    // `length-mismatch` fires on the pairs `suspectPairs` names, and the note has to account for
    // all of them — this is symptom (b), where four of the five silently disappeared.
    const mismatch = report.notes.filter((entry) => entry.kind === 'length-mismatch');
    expect(mismatch).toHaveLength(1);
    expect(report.suspectPairs.length).toBeGreaterThan(1);
    for (const pair of report.suspectPairs) {
      const [left, right] = [report.labels[pair.i], report.labels[pair.j]].sort();
      expect({
        pair: `${left} | ${right}`,
        named: mismatch[0].message.includes(`${left} | ${right}`),
      }).toEqual({ pair: `${left} | ${right}`, named: true });
    }

    // The pairs are listed in a canonical order, so the sentence is a function of the corpus.
    const listed = mismatch[0].message.split(':')[0].split('; ');
    expect(listed).toEqual([...listed].sort());
  });

  it('makes plausibleRange live at the corpus, which is the option’s only product', () => {
    const items = [
      { mpm: TELEMANN, performance: 'Baroque' as const, label: 'tel-b' },
      { mpm: TELEMANN, performance: 'Fast' as const, label: 'tel-f' },
      { mpm: VULPIUS, performance: 'Baroque' as const, label: 'vul-b' },
    ];
    const plain = corpus(items);
    const banded = corpus(items, { plausibleRange: { 'tempo/tempo@bpm': [200, 400] } });

    const plausibility = (report: CorpusReport) =>
      report.notes.filter((entry) => entry.kind === 'plausibility');
    expect(plausibility(banded).length).toBeGreaterThan(plausibility(plain).length);
    expect(plausibility(banded)[0].message).toContain('outside its plausible band [200, 400]');
    // Every one names the item it is about, so a reader can act on it.
    expect(plausibility(banded).every((entry) => entry.itemIndex !== null)).toBe(true);
  });

  /**
   * W4 MAJOR-10: `embeddingAxes`' declared domain is `[1, N−1]`, which at `N ≤ 1` is EMPTY.
   *
   * The guard read `n > 1 && axes > n - 1`, so exactly where nothing is legal, everything was
   * accepted: a one-item corpus reported `axes === 7`, and an empty one reported five all-null
   * variance shares. AD-25.1's first branch applies — `items.length` is in the same option bag,
   * so the caller could have known without reading a document.
   */
  it('rejects an explicit embeddingAxes where the domain is empty (N ≤ 1)', () => {
    expect(() =>
      corpus([{ mpm: TELEMANN, performance: 'Baroque', label: 'only' }], {
        embeddingAxes: 7,
      }),
    ).toThrow(InvalidOptionError);
    expect(() => corpus([], { embeddingAxes: 5 })).toThrow(InvalidOptionError);
    // Even 1 is out of an empty domain — there is no axis in a one-point cloud.
    expect(() =>
      corpus([{ mpm: TELEMANN, performance: 'Baroque', label: 'only' }], {
        embeddingAxes: 1,
      }),
    ).toThrow(InvalidOptionError);

    // …and the DEFAULT still degrades rather than erroring, which is the other half of §9.4's
    // rule: a caller who never set the option has made no mistake to be told about.
    const single = corpus([{ mpm: TELEMANN, performance: 'Baroque', label: 'only' }]);
    expect(single.n).toBe(1);
    expect(single.embedding.axes).toBe(1);
    expect(corpus([]).n).toBe(0);
  });

  it('is plain data: finite or null everywhere, no undefined, no -0', () => {
    const report = corpus(
      [
        { mpm: TELEMANN, performance: 'Baroque', label: 'a' },
        { mpm: TELEMANN, performance: 'Fast', label: 'b' },
        { mpm: VULPIUS, performance: 'Baroque', label: 'c' },
      ],
      { k: 2, noiseFloor: true, normalization: 'corpus' },
    );
    const walk = (value: unknown, path: string): void => {
      if (typeof value === 'number') {
        expect({ path, ok: Number.isFinite(value) && !Object.is(value, -0) }).toEqual({
          path,
          ok: true,
        });
        return;
      }
      if (value === null || typeof value !== 'object') {
        expect({ path, undef: value === undefined }).toEqual({ path, undef: false });
        return;
      }
      if (Array.isArray(value)) {
        for (const [index, item] of value.entries()) walk(item, `${path}[${String(index)}]`);
        return;
      }
      for (const [key, item] of Object.entries(value)) walk(item, `${path}.${key}`);
    };
    walk(report, 'report');
  });
});

describe('the surface (§9.4)', () => {
  it('rejects options a caller could have known were wrong', () => {
    const items = [
      { mpm: TELEMANN, performance: 'Baroque' as const, label: 'a' },
      { mpm: TELEMANN, performance: 'Fast' as const, label: 'b' },
    ];
    expect(() => corpus(items, { k: 0 })).toThrow(InvalidOptionError);
    expect(() => corpus(items, { k: 3 })).toThrow(InvalidOptionError);
    expect(() => corpus(items, { embeddingAxes: 2 })).toThrow(InvalidOptionError);
    expect(() => corpus(items, { linkage: 'ward.D' })).toThrow(InvalidOptionError);
    expect(() => corpus(items, { normalization: 'none' })).toThrow(InvalidOptionError);
    expect(() => corpus(items, { maxItems: 1 })).toThrow(InvalidOptionError);
    expect(() => corpus([{ mpm: '<not-mpm/>' as XmlText }])).toThrow(ParseError);
  });

  it('names the failing item in a parse error', () => {
    try {
      compareMpmCorpus({
        items: [{ mpm: TELEMANN, performance: 0 }, { mpm: '<nope' as XmlText }],
      });
      expect.unreachable('should have thrown');
    } catch (error) {
      expect((error as Error).message).toContain('items[1]');
    }
  });

  it('accepts every linkage §8 names', () => {
    const items = [
      { mpm: TELEMANN, performance: 'Baroque' as const, label: 'a' },
      { mpm: TELEMANN, performance: 'Fast' as const, label: 'b' },
      { mpm: TELEMANN, performance: 'Romantic' as const, label: 'c' },
    ];
    for (const linkage of ['average', 'single', 'complete', 'weighted', 'ward.D2'] as const) {
      const report = corpus(items, { linkage });
      expect(report.dendrogram.merges).toHaveLength(2);
      expect(report.dendrogram.merges.every((merge) => Number.isFinite(merge.height))).toBe(true);
    }
  });

  it('is deterministic across calls', () => {
    const items = [
      { mpm: TELEMANN, performance: 'Baroque' as const, label: 'a' },
      { mpm: VULPIUS, performance: 'Baroque' as const, label: 'b' },
    ];
    expect(JSON.stringify(corpus(items, { k: 1 }))).toBe(JSON.stringify(corpus(items, { k: 1 })));
  });
});
