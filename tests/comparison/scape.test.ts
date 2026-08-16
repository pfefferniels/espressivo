/**
 * AD-27.8's scape, at both levels.
 *
 * The load-bearing property is INTERNAL CONSISTENCY, and it is what the prefix-sum
 * implementation exists to guarantee: a cell is the sum of any partition of itself. A scape
 * whose rows did not add up would be unreadable in exactly the way a musicologist reads one —
 * comparing a phrase-length cell against the bars beneath it — and re-integrating each
 * sub-window would break it by that sub-window's own quadrature error. So the tests assert
 * additivity, the closure of the top cell against `aggregate.distance`, and agreement with
 * `compareMpm` over an explicitly narrowed window, which is the same quantity computed by a
 * completely different route.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { compareMpm, compareMpmCorpus } from '../../src/api/comparison.js';
import { InvalidOptionError } from '../../src/api/errors.js';
import { scapeIndex, scapeOf, SCAPE_MAX_BINS } from '../../src/comparison/scape.js';
import { defaultWeights } from '../../src/comparison/aggregate.js';
import type { XmlText } from '../../src/api/types.js';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');
const fixture = (name: string) => readFileSync(join(FIXTURES, `${name}.mpm`), 'utf-8') as XmlText;
const TELEMANN = fixture('telemann-grave');
const VULPIUS = fixture('vulpius-die-helle-sonn');

const WINDOW = { start: 0, end: 16 } as const;

describe('the pairwise scape', () => {
  const report = compareMpm({
    a: TELEMANN,
    performanceA: 0,
    performanceB: 1,
    window: WINDOW,
    scape: { bins: 8 },
  }).report;

  it('is a full triangle of the size it reports', () => {
    expect(report.scape).not.toBeNull();
    expect(report.scape?.bins).toBe(8);
    expect(report.scape?.cells).toHaveLength((8 * 9) / 2);
    expect(report.scape?.cells.every((value) => Number.isFinite(value) && value >= 0)).toBe(true);
  });

  it('closes: the top cell IS the aggregate distance', () => {
    const cells = report.scape?.cells ?? [];
    expect(cells[scapeIndex(8, 8, 0)]).toBeCloseTo(report.aggregate.distance, 9);
  });

  it('is additive — a cell is the sum of the two below it, exactly', () => {
    // The property the prefix sums buy. Re-integrating each sub-window would give a triangle
    // whose rows disagree with each other by their own quadrature error.
    const cells = report.scape?.cells ?? [];
    for (let size = 2; size <= 8; ++size)
      for (let start = 0; start + size <= 8; ++start) {
        const whole = cells[scapeIndex(8, size, start)];
        for (let split = 1; split < size; ++split) {
          const left = cells[scapeIndex(8, split, start)];
          const right = cells[scapeIndex(8, size - split, start + split)];
          // Relative, because a cell is a DIFFERENCE of two running totals and two such
          // differences do not recombine bit for bit — the cancellation, not the binning, which
          // conserves mass exactly. Measured slack on this pair is at the last few ulps.
          expect(left + right).toBeCloseTo(whole, 9);
        }
      }
  });

  it('agrees with compareMpm over the same sub-window, computed a different way', () => {
    // A bin here is two quarters; the third bin is `[4, 6)`. Running the whole comparison over
    // that window is a completely independent route to the same number — different grid,
    // different segment pass, different aggregation — so agreement is evidence rather than a
    // restatement.
    const cells = report.scape?.cells ?? [];
    let worst = 0;
    for (const [start, size] of [
      [0, 1],
      [2, 1],
      [1, 3],
      [4, 4],
    ] as const) {
      const narrowed = compareMpm({
        a: TELEMANN,
        performanceA: 0,
        performanceB: 1,
        window: { start: start * 2, end: (start + size) * 2 },
      }).report;
      // A RELATIVE band, and the two routes really are different: the narrowed run re-reads the
      // documents and rebuilds every dimension's own refinement grid for that window, while the
      // scape apportions the full-window cells across bins. The worst divergence over these four
      // sub-windows is asserted separately below, so the band cannot absorb a regression.
      const cell = cells[scapeIndex(8, size, start)];
      worst = Math.max(
        worst,
        Math.abs(cell - narrowed.aggregate.distance) / narrowed.aggregate.distance,
      );
      expect(cell).toBeCloseTo(narrowed.aggregate.distance, 0);
    }
    // [MEASURED] The two routes agree to better than a tenth of a percent, which is far below
    // the metric's own JND resolution and inside the residual AD-34.1 documents for rubato.
    expect(worst).toBeLessThan(1e-3);
    expect(worst).toBeGreaterThan(0);
  });

  it('is null when not asked for, and every bin count is a legal triangle', () => {
    const quiet = compareMpm({
      a: TELEMANN,
      performanceA: 0,
      performanceB: 1,
      window: WINDOW,
    }).report;
    expect(quiet.scape).toBeNull();

    for (const bins of [1, 2, 5, 17]) {
      const scaped = compareMpm({
        a: TELEMANN,
        performanceA: 0,
        performanceB: 1,
        window: WINDOW,
        scape: { bins },
      }).report;
      expect(scaped.scape?.bins).toBe(bins);
      expect(scaped.scape?.cells).toHaveLength((bins * (bins + 1)) / 2);
      expect(scaped.scape?.cells[scapeIndex(bins, bins, 0)]).toBeCloseTo(
        scaped.aggregate.distance,
        9,
      );
    }
  });

  it('rejects a bin count outside §9.4’s range', () => {
    const base = { a: TELEMANN, performanceA: 0, performanceB: 1, window: WINDOW } as const;
    expect(() => compareMpm({ ...base, scape: { bins: 0 } })).toThrow(InvalidOptionError);
    expect(() => compareMpm({ ...base, scape: { bins: SCAPE_MAX_BINS + 1 } })).toThrow(
      InvalidOptionError,
    );
    expect(() => compareMpm({ ...base, scape: { bins: 2.5 } })).toThrow(InvalidOptionError);
  });
});

describe('the last bin is pinned at the window end', () => {
  // `49 · (16/49)` is `15.999999999999998`, so an unpinned last edge sits INSIDE the window.
  // For a density CELL that costs nothing — the shares are rescaled to the cell's own mass, so
  // a dropped sliver changes no total — and the guard's remaining job is a POINT ATOM sitting
  // exactly at the window end, which `binOf` would then read as outside the triangle. No
  // vendored document places one there, so the evidence goes down a layer to the function
  // itself (the RG-2 move): a negative control on the pin passes every corpus test in this file.
  const atomAtTheEnd = {
    dimension: 'articulation' as const,
    cells: [],
    atoms: [{ startQuarters: 16, endQuarters: 16, mass: 7 }],
    distance: 7,
  };

  it('keeps a point atom that sits exactly there', () => {
    expect(49 * (16 / 49)).toBeLessThan(16);
    const scape = scapeOf([atomAtTheEnd], defaultWeights(), 0, 16, 49);
    expect(scape.bins).toBe(49);
    expect(scape.cells[scapeIndex(49, 49, 0)]).toBe(7);
    // …and it lands in the LAST bin, which is the one the pin extends.
    expect(scape.cells[scapeIndex(49, 1, 48)]).toBe(7);
    expect(scape.cells[scapeIndex(49, 1, 47)]).toBe(0);
  });
});

describe('the corpus scape (Sapp’s variant)', () => {
  const items = [
    { mpm: TELEMANN, performance: 'Baroque' as const, label: 'tel-baroque' },
    { mpm: TELEMANN, performance: 'Fast' as const, label: 'tel-fast' },
    { mpm: TELEMANN, performance: 'Romantic' as const, label: 'tel-romantic' },
    { mpm: VULPIUS, performance: 'Baroque' as const, label: 'vul-baroque' },
  ];

  it('names an item per cell, and says in the data that it does', () => {
    const report = compareMpmCorpus({ items, window: WINDOW, scape: { bins: 6 } }).report;
    expect(report.scape).not.toBeNull();
    expect(report.scape?.kind).toBe('closest-to-medoid');
    expect(report.scape?.bins).toBe(6);
    expect(report.scape?.cells).toHaveLength((6 * 7) / 2);
    expect(report.scape?.medoid).not.toBeNull();

    for (const index of report.scape?.cells ?? []) {
      expect(Number.isInteger(index)).toBe(true);
      expect(index).toBeGreaterThanOrEqual(0);
      expect(index).toBeLessThan(report.n);
      // The medoid is 0 from itself and would win every cell, so the answer is one of the rest.
      expect(index).not.toBe(report.scape?.medoid);
    }
  });

  it('picks the item its own pairwise scape says is closest, cell by cell', () => {
    // The reduction is checked against the rows it reduces: for each cell, the named item's
    // distance to the medoid must be the minimum over the other items.
    const report = compareMpmCorpus({ items, window: WINDOW, scape: { bins: 4 } }).report;
    const medoid = report.scape?.medoid ?? 0;
    const documentOf = (itemIndex: number) => (itemIndex === 3 ? VULPIUS : TELEMANN);
    const rows = new Map<number, readonly number[]>();
    for (const [index, item] of report.items.entries()) {
      if (index === medoid) continue;
      const other = report.items[medoid];
      const pair = compareMpm({
        a: documentOf(item.itemIndex),
        b: documentOf(other.itemIndex),
        performanceA: item.performance,
        performanceB: other.performance,
        window: WINDOW,
        scape: { bins: 4 },
      }).report;
      rows.set(index, pair.scape?.cells ?? []);
    }

    for (const [cell, chosen] of (report.scape?.cells ?? []).entries()) {
      const values = [...rows].map(([, cells]) => cells[cell]);
      expect({ cell, value: rows.get(chosen)?.[cell] }).toEqual({
        cell,
        value: Math.min(...values),
      });
    }
  });

  it('is null when not asked for', () => {
    expect(compareMpmCorpus({ items, window: WINDOW }).report.scape).toBeNull();
  });

  it('rejects a bin count outside §9.4’s range', () => {
    expect(() => compareMpmCorpus({ items, window: WINDOW, scape: { bins: 0 } })).toThrow(
      InvalidOptionError,
    );
    expect(() =>
      compareMpmCorpus({ items, window: WINDOW, scape: { bins: SCAPE_MAX_BINS + 1 } }),
    ).toThrow(InvalidOptionError);
  });
});
