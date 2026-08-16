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
    expect(report.items.every((item) => !item.synthetic)).toBe(true);

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
    const withoutContext = corpus(items, { k: 2, embeddingAxes: 2 });
    expect(withoutContext.context).toBeNull();
    expect(withoutContext.matrices.aggregate).toEqual([...report.matrices.aggregate]);
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
