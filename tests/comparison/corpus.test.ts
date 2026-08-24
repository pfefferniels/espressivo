/**
 * `compareMpmCorpus` over the vendored corpus.
 *
 * Every cell equals the `compareMpm` number for the same pair under the same window, so a corpus
 * cannot drift from the product it is assembled from. The corpus clause is asserted against a
 * permuted re-run rather than against a stored expectation.
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
import { elementAt, numberAt } from '../../src/prelude/index.js';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');
const fixture = (name: string) => readFileSync(join(FIXTURES, `${name}.mpm`), 'utf-8') as XmlText;
const TELEMANN = fixture('telemann-grave');
const VULPIUS = fixture('vulpius-die-helle-sonn');
const ALBERT = fixture('albert-du-mein-einzig-licht');

/** A window short enough for a whole matrix, long enough to carry every dimension. */
const SHORT = { start: 0, end: 16 } as const;

interface CorpusItem {
  mpm: XmlText;
  performance?: string | number;
  label?: string;
}

const corpus = (
  items: readonly CorpusItem[],
  overrides: Record<string, unknown> = {},
): CorpusReport => compareMpmCorpus({ items, window: SHORT, ...overrides }).report;

/**
 * Checked reads into the flat `n × n` matrices, its label list and its per-item products. Every
 * read here is a computed index, and an unchecked slip yields `NaN` several lines later.
 */
const cellOf = (matrix: readonly number[], n: number, i: number, j: number, what: string) =>
  numberAt(matrix, i * n + j, what);

const labelAt = (report: CorpusReport, item: number) =>
  elementAt(report.labels, item, 'the corpus label list');

/** `xs` reordered by `order` — a permuted corpus, or a set of medoids read back as labels. */
const pick = <T extends NonNullable<unknown>>(
  xs: readonly T[],
  order: readonly number[],
  what: string,
): readonly T[] => order.map((index) => elementAt(xs, index, what));

// ---------------------------------------------------------------------------

describe('the matrix is one function', () => {
  it('reproduces compareMpm’s own numbers cell by cell', () => {
    const report = corpus([
      { mpm: TELEMANN, label: 'tel' },
      { mpm: ALBERT, label: 'alb' },
    ]);
    expect(report.n).toBe(5);

    for (let i = 0; i < report.n; ++i)
      for (let j = 0; j < report.n; ++j) {
        if (i === j) continue;
        const a = elementAt(report.items, i, 'the corpus item list');
        const b = elementAt(report.items, j, 'the corpus item list');
        const pair = compareMpm({
          a: a.itemIndex === 0 ? TELEMANN : ALBERT,
          b: b.itemIndex === 0 ? TELEMANN : ALBERT,
          performanceA: a.performance,
          performanceB: b.performance,
          window: SHORT,
        }).report;
        expect({
          i,
          j,
          d: cellOf(report.matrices.aggregate, report.n, i, j, 'the aggregate matrix'),
        }).toEqual({
          i,
          j,
          d: pair.aggregate.distance,
        });
        for (const dimension of COMPARISON_DIMENSIONS)
          expect({
            i,
            j,
            dimension,
            d: cellOf(
              report.matrices.byDimension[dimension],
              report.n,
              i,
              j,
              `the ${dimension} matrix`,
            ),
          }).toEqual({ i, j, dimension, d: pair.dimensions[dimension].distance });
      }
  });

  it('is bit-symmetric with a zero diagonal', () => {
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
      const at = (i: number, j: number) => cellOf(matrix, n, i, j, 'a corpus matrix');
      for (let i = 0; i < n; ++i) {
        expect(at(i, i)).toBe(0);
        for (let j = 0; j < n; ++j) expect(at(i, j)).toBe(at(j, i));
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

    // Without an explicit window the corpus derives one end for the whole matrix, which is what
    // makes the guarantee survive: it does not vary with the pair.
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

describe('the expansion and labels', () => {
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
    // the row carries only the two fields it can say something about.
    expect(Object.keys(report.items[0]!)).toEqual(['itemIndex', 'performance']);

    // A named performance does not expand and keeps the caller's own label.
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

  it('refuses colliding labels, naming every collision and its items', () => {
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

describe('permuting the items permutes the matrices and relabels the dendrogram', () => {
  const items = [
    { mpm: TELEMANN, performance: 'Baroque' as const, label: 'a-baroque' },
    { mpm: TELEMANN, performance: 'Fast' as const, label: 'b-fast' },
    { mpm: TELEMANN, performance: 'Romantic' as const, label: 'c-romantic' },
    { mpm: ALBERT, performance: 0, label: 'd-axel' },
  ];
  const order = [2, 0, 3, 1];

  it('is equivariant, matrix cell by matrix cell and merge by merge', () => {
    const straight = corpus(items);
    const shuffled = corpus(pick(items, order, 'the corpus item list'));
    const n = straight.n;

    for (let i = 0; i < n; ++i)
      for (let j = 0; j < n; ++j)
        expect({
          i,
          j,
          d: cellOf(shuffled.matrices.aggregate, n, i, j, 'the permuted aggregate matrix'),
        }).toEqual({
          i,
          j,
          d: cellOf(
            straight.matrices.aggregate,
            n,
            elementAt(order, i, 'the permutation'),
            elementAt(order, j, 'the permutation'),
            'the aggregate matrix',
          ),
        });

    // The dendrogram relabels: leaf `i` in the shuffled run is leaf `order[i]` in the straight
    // one, and internal ids are positional, so the merge lists must coincide exactly.
    const back = (id: number) => (id < n ? elementAt(order, id, 'the permutation') : id);
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
    const shuffled = corpus(pick(items, order, 'the corpus item list'));
    expect(shuffled.labels).not.toEqual([...straight.labels]);
    expect([...shuffled.labels].sort()).toEqual([...straight.labels].sort());
  });
});

/**
 * The corpus above is tie-free and passes no `k`, so `medoids` is null there and PAM's tie rule
 * is never consulted. This one is built to tie: each of the three vendored documents is listed
 * twice at the same performance under two labels, so the matrix has three exact 0 cells off the
 * diagonal and the `k = 2` optimum is reached by several different subsets.
 *
 * The permutation is the minimal witness — the first two items swapped. Without the sort in
 * `exhaustiveMedoids`' tie key that single swap changes which performance the corpus calls the
 * most typical, from `B-vul-1` to `E-vul-2`, with `exhaustive: true` on both: over all 720
 * orders, 600 say `{A-tel-1, B-vul-1}` and 120 say `{A-tel-1, E-vul-2}`. The design makes the medoid the
 * one corpus product whose value is naming a real performer, so it is pinned here as well as at
 * `pam`'s own layer.
 */
describe('where the ties are: the medoid does not depend on the caller’s item order', () => {
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
    const shuffled = corpus(pick(tied, swapFirstTwo, 'the corpus item list'), { k: 2 });

    // Read back in labels: indices mean different things in the two runs.
    const medoidsOf = (report: CorpusReport) =>
      pick(report.labels, report.medoids ?? [], 'the corpus label list');
    const clustersOf = (report: CorpusReport) => {
      const medoids = report.medoids ?? [];
      return (report.clusters ?? [])
        .map(
          (cluster, item) =>
            `${labelAt(report, item)}→${labelAt(report, elementAt(medoids, cluster, 'the medoid list'))}`,
        )
        .sort();
    };

    expect(medoidsOf(shuffled)).toEqual(medoidsOf(straight));
    expect(clustersOf(shuffled)).toEqual(clustersOf(straight));
    // Both runs claim the exhaustive global optimum, so a disagreement here is a contradiction
    // rather than two heuristics differing. The absent heuristic note is how the surface says it.
    for (const report of [straight, shuffled])
      expect(report.notes.some((entry) => entry.message.includes('BUILD + SWAP'))).toBe(false);
  });

  /**
   * The same swap, through the other two published fields.
   *
   * The seriation and the embedding fail permutation-invariance for a different reason than the
   * medoid does — not an index-keyed tie rule but an exact one, which a permuted Jacobi's
   * ulp-level noise never reaches. On this corpus's own matrix that costs 7 distinct seriations
   * over 20 permutations, and `A-tel-1`'s first coordinate takes 16 distinct values, all
   * `≈ −45.2370019107607`.
   */
  it('gives the same seriation and the same embedding when two items trade places', () => {
    const straight = corpus(tied, { k: 2, embeddingAxes: 2 });
    const shuffled = corpus(pick(tied, swapFirstTwo, 'the corpus item list'), {
      k: 2,
      embeddingAxes: 2,
    });

    expect(shuffled.seriationOrder.map((item) => shuffled.labels[item])).toEqual(
      straight.seriationOrder.map((item) => straight.labels[item]),
    );

    // Not bit-identical and it cannot be: the permuted matrix runs Jacobi's rotations in a
    // different sequence. The claim is that the difference stays inside the tie rules' band
    // rather than flipping an axis or reordering the plot.
    const pointOf = (report: CorpusReport, label: string) => {
      const item = report.labels.indexOf(label);
      const what = `the embedding of '${label}'`;
      return [
        numberAt(report.embedding.coordinates, item * 2, what),
        numberAt(report.embedding.coordinates, item * 2 + 1, what),
      ];
    };
    const extent = Math.max(
      ...straight.labels.map((label) =>
        Math.abs(numberAt(pointOf(straight, label), 0, 'the straight point')),
      ),
    );
    for (const label of straight.labels)
      for (const axis of [0, 1] as const)
        expect({
          label,
          axis,
          within:
            Math.abs(
              numberAt(pointOf(straight, label), axis, 'the straight point') -
                numberAt(pointOf(shuffled, label), axis, 'the permuted point'),
            ) <
            1e-9 * extent,
        }).toEqual({ label, axis, within: true });
  });

  /**
   * every published per-item number is bit-identical under permutation.
   *
   * `profiles[i].toMeanDistance` is the mean of the same set of distances under any permutation,
   * but accumulated in the caller's item order it is not the same double — bit-wise different in
   * 4 of 24 permutation cases. `silhouette` has the identical shape and measures clean on this
   * corpus, its clusters being small enough that the additions reassociate exactly; it is pinned
   * anyway, because "no permutation has reordered these particular sums yet" is not a property.
   */
  it('gives bit-identical per-item numbers under permutation', () => {
    // The window size is measured rather than chosen: at the 16 quarters this file uses
    // elsewhere the reassociated sums agree bit for bit on the same six items, so a single
    // fixed window is a poor detector for a float-association defect.
    const shorter = { window: { start: 0, end: 8 }, k: 2 } as const;
    const straight = corpus(tied, shorter);
    const readback = (report: CorpusReport) => {
      const byLabel = new Map<string, { silhouette: number; toMeanDistance: number }>();
      const silhouette = report.silhouette ?? [];
      for (let item = 0; item < report.n; ++item)
        byLabel.set(labelAt(report, item), {
          silhouette: numberAt(silhouette, item, 'the silhouette scores'),
          toMeanDistance: elementAt(report.profiles, item, 'the item profiles').toMeanDistance,
        });
      return byLabel;
    };
    const base = readback(straight);

    // Several orders, including reversal and two derangements: the defect shows on some
    // permutations and not others, so a single fixed order does not detect it.
    for (const order of [
      [1, 0, 2, 3, 4, 5],
      [5, 4, 3, 2, 1, 0],
      [2, 4, 0, 5, 1, 3],
      [3, 1, 5, 0, 4, 2],
    ]) {
      const shuffled = readback(corpus(pick(tied, order, 'the corpus item list'), shorter));
      for (const [label, values] of base) {
        // `toBe`, not `toBeCloseTo`: the claim is bit-identity, and a tolerance here would be
        // exactly the epsilon rejected in favour of a canonical order.
        expect({ label, ...(shuffled.get(label) ?? {}) }).toEqual({ label, ...values });
      }
    }

    // Non-vacuity: real numbers with real spread, not zeros that sum the same in any order.
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

    const shuffled = corpus(pick(tied, swapFirstTwo, 'the corpus item list'), { k: 2 });
    expect(shuffled.labels).not.toEqual([...straight.labels]);
  });
});

describe('the products the design reads off the matrix', () => {
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
    // Five items is well under twenty, so the caveat is a field rather than prose.
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

    // the context is context: the matrices are untouched by it.
    expect(report.context).not.toBeNull();
    expect(report.context?.percentile).toHaveLength(25);

    // …and the three figures are the quantiles of the off-diagonal distances the report ships.
    // Five items give ten off-diagonal pairs, so each of the three positions falls between two
    // order statistics — `0.5·9 = 4.5`, `0.25·9 = 2.25`, `0.75·9 = 6.75` — and the interpolation
    // is the whole of the answer. Negative control: making the interpolation read its lower
    // neighbour twice, so that a percentile degenerates to a selection, leaves the rest of the
    // suite green and reds exactly these four expectations.
    const offDiagonal: number[] = [];
    for (let i = 0; i < 5; ++i)
      for (let j = i + 1; j < 5; ++j)
        offDiagonal.push(cellOf(report.matrices.aggregate, 5, i, j, 'the aggregate matrix'));
    const sorted = [...offDiagonal].sort((x, y) => x - y);
    expect(sorted).toHaveLength(10);

    const sample = (rank: number) => numberAt(sorted, rank, 'the sorted off-diagonal distances');
    const median = (sample(4) + sample(5)) / 2;
    // The empirical-CDF quantile at `p`: the sample at `p·(n−1)`, linearly between neighbours.
    const lowerQuartile = sample(2) + (sample(3) - sample(2)) * 0.25;
    const upperQuartile = sample(6) + (sample(7) - sample(6)) * 0.75;

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
     * A closed blind spot. The block above pins `percentile`'s length and nothing else, and no
     * other test in the tree reads a value out of it. Replacing the at-or-below count with a
     * strictly-below one (`lowerBoundBy` for `upperBoundBy`) left the whole comparison suite
     * green, even though the matrix is symmetric and therefore every off-diagonal value is
     * itself one of the ranked samples — so the two disagree in every single cell.
     *
     * The rule is "a rank, so equal distances share a rank": the fraction of pairs at or below
     * this one, ties included. Derived here from the published aggregate matrix by the textbook
     * definition, which shares no line with the implementation.
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
    // `toMedoid` is 0 exactly at the corpus medoid, the single most typical item.
    const report = corpus(items, { k: 3 });
    const zeroRows = report.profiles.filter((profile) =>
      COMPARISON_DIMENSIONS.every((dimension) => profile.toMedoid[dimension] === 0),
    );
    expect(zeroRows).toHaveLength(1);
  });

  it('normalizes by the median formula when asked', () => {
    const fixed = corpus(items);
    const normalized = corpus(items, { normalization: 'corpus' });
    expect(fixed.normalizationConstants).toBeNull();
    expect(normalized.normalizationConstants).not.toBeNull();

    for (const dimension of COMPARISON_DIMENSIONS) {
      const nonzero: number[] = [];
      for (let i = 0; i < normalized.n; ++i)
        for (let j = i + 1; j < normalized.n; ++j) {
          const value = cellOf(
            normalized.matrices.byDimension[dimension],
            normalized.n,
            i,
            j,
            `the ${dimension} matrix`,
          );
          if (value !== 0) nonzero.push(value);
        }
      const constant = normalized.normalizationConstants?.[dimension] ?? null;
      if (nonzero.length === 0) {
        expect(constant).toBeNull();
        continue;
      }
      const sorted = [...nonzero].sort((x, y) => x - y);
      const middle = sorted.length >> 1;
      const what = `the sorted nonzero ${dimension} distances`;
      const expected =
        sorted.length % 2 === 1
          ? numberAt(sorted, middle, what)
          : (numberAt(sorted, middle - 1, what) + numberAt(sorted, middle, what)) / 2;
      expect(constant).toBeCloseTo(expected, 12);
    }

    // The per-dimension matrices are unchanged — normalization rescales the aggregate only.
    expect(normalized.matrices.byDimension.tempo).toEqual([...fixed.matrices.byDimension.tempo]);
    expect(normalized.matrices.aggregate).not.toEqual([...fixed.matrices.aggregate]);
    // …and the rescaled aggregate is exactly `Σ ω_k d_k` with the derived weights.
    for (let i = 0; i < normalized.n; ++i)
      for (let j = i + 1; j < normalized.n; ++j) {
        let total = 0;
        for (const dimension of COMPARISON_DIMENSIONS) {
          const constant = normalized.normalizationConstants?.[dimension] ?? null;
          const omega = constant === null || constant === 0 ? 1 : 1 / constant;
          total +=
            omega *
            cellOf(
              normalized.matrices.byDimension[dimension],
              normalized.n,
              i,
              j,
              `the ${dimension} matrix`,
            );
        }
        expect(
          cellOf(normalized.matrices.aggregate, normalized.n, i, j, 'the aggregate matrix'),
        ).toBeCloseTo(total, 9);
      }
  });

  it('surfaces suspectPairs so a heterogeneous folder announces itself', () => {
    // Telemann against Albert: different pieces, and Albert's deadpan reading has no instruction
    // after date 0, so the length arm fires.
    const report = corpus([
      { mpm: TELEMANN, performance: 'Baroque', label: 'tel' },
      { mpm: ALBERT, performance: 'Like a robot', label: 'alb' },
    ]);
    expect(report.suspectPairs.length).toBeGreaterThan(0);
    expect(report.suspectPairs[0]).toMatchObject({ i: 0, j: 1, reason: 'length-mismatch' });
  });
});

describe('the degenerate corpora the design makes legal', () => {
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
    expect(elementAt(single.profiles, 0, 'the item profiles').toMeanDistance).toBe(0);
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
   * Filtering on one kind leaves `capped`, `plausibility`, `renderer-*`, `grid-truncated`,
   * `invariance-space` and `estimate-degradation` findings from the `N(N−1)/2` comparisons
   * unobservable at the corpus facade, and `plausibleRange` inert here, since notes are its only
   * product. Forwarding them verbatim is not the answer either: most notes are about a document,
   * and a document sits in `N−1` pairs — on this five-item corpus the pairwise pass produces 664
   * `structural` notes over 10 pairs, of which 654 name a document. They are deduplicated on
   * their content, and `itemIndex` carries the identity rather than `document`, which is
   * pair-relative and meaningless once the pair is gone.
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

    // More than one kind.
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

    // Deduplicated: 104 notes against the 713 the ten pairwise reports carry between them. The
    // span belongs in the identity — one document capped in two places is two facts.
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
   * The note dedupe folds pairwise reports into corpus facts without keeping any pair-relative
   * data in the key or in the text — including the copy of `document` inside `site`, and every
   * pair a note fired on rather than `pairs[0]`.
   *
   * Three symptoms of getting that wrong, each asserted separately:
   *
   * (a) the note count depends on item order — 100 against 104 for the same three-item corpus;
   * (b) a note firing on some-but-not-all pairs names only the first and the rest vanish, which
   *     for `length-mismatch` is worse than filtering the kind out altogether: `suspectPairs`
   *     names five pairs beside a single note, one report contradicting itself;
   * (c) the message text varies under permutation, the same note reading `"C | B: …"` under one
   *     listing and `"B | C: …"` under another.
   */
  it('gives the same notes, the same count and the same text under every item order', () => {
    const three = [
      { mpm: TELEMANN, performance: 'Baroque' as const, label: 'tel-b' },
      { mpm: TELEMANN, performance: 'Fast' as const, label: 'tel-f' },
      { mpm: ALBERT, performance: 0, label: 'alb' },
    ];
    // All six orders of three items: the defect shows on some and not others, so a single fixed
    // permutation does not detect it.
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
      const report = corpus(pick(three, order, 'the corpus item list'));
      counts.add(report.notes.length);
      texts.add(
        report.notes
          .map(
            (entry) =>
              `${entry.kind}|${entry.itemIndex === null ? '-' : labelAt(report, entry.itemIndex)}|${entry.message}`,
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

    // `length-mismatch` fires on the pairs `suspectPairs` names, and the note has to account
    // for all of them — symptom (b), where four of the five silently disappear.
    const mismatch = report.notes.filter((entry) => entry.kind === 'length-mismatch');
    expect(mismatch).toHaveLength(1);
    const only = elementAt(mismatch, 0, 'the length-mismatch notes');
    expect(report.suspectPairs.length).toBeGreaterThan(1);
    for (const pair of report.suspectPairs) {
      const sides = [labelAt(report, pair.i), labelAt(report, pair.j)].sort();
      const left = elementAt(sides, 0, 'the suspect pair');
      const right = elementAt(sides, 1, 'the suspect pair');
      expect({
        pair: `${left} | ${right}`,
        named: only.message.includes(`${left} | ${right}`),
      }).toEqual({ pair: `${left} | ${right}`, named: true });
    }

    // The pairs are listed in a canonical order, so the sentence is a function of the corpus.
    const listed = elementAt(only.message.split(':'), 0, 'the note’s message').split('; ');
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
    expect(elementAt(plausibility(banded), 0, 'the plausibility notes').message).toContain(
      'outside its plausible band [200, 400]',
    );
    // Every one names the item it is about, so a reader can act on it.
    expect(plausibility(banded).every((entry) => entry.itemIndex !== null)).toBe(true);
  });

  /**
   * `embeddingAxes`' declared domain is `[1, N−1]`, which at `N ≤ 1` is empty. A guard of the
   * form `n > 1 && axes > n - 1` accepts everything exactly where nothing is legal: a one-item
   * corpus reports `axes === 7`, and an empty one five all-null variance shares. The first
   * branch applies — `items.length` is in the same option bag.
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

    // …and the default still degrades rather than erroring, which is the other half of the
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

describe('the surface', () => {
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

  it('accepts every linkage the design names', () => {
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
