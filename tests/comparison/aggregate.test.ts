/**
 * §7's aggregation and AD-19's closing table.
 *
 * Two disciplines carried over from the waves below. Ruzzo–Tompa is tested against a BRUTE
 * FORCE enumeration of every subsequence rather than against expected segment lists, for the
 * reason `eventAlignment.test.ts` gives about the DP: asserting "these are the segments" pins
 * one answer out of possibly several and passes on an implementation that optimizes the wrong
 * thing. And the table's closure is asserted on synthetic densities whose exact totals are
 * known by construction, so the residual is checked against arithmetic rather than against
 * itself.
 */
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_THRESHOLD_JND,
  EVENT_KAPPA_QUARTERS,
  aggregateDistance,
  attributionTable,
  defaultThresholds,
  defaultWeights,
  equivalenceBlock,
  massIn,
  maximalScoringRuns,
  segmentPass,
  type DimensionDensity,
  type DimensionWeights,
} from '../../src/comparison/aggregate.js';
import { COMPARISON_DIMENSIONS } from '../../src/comparison/registry.js';

/** A dimension whose density is constant `value` on `[start, end)`. */
const flat = (
  dimension: DimensionDensity['dimension'],
  start: number,
  end: number,
  value: number,
  densityAt: ((quarters: number) => number) | null = null,
): DimensionDensity => ({
  dimension,
  cells: [{ startQuarters: start, endQuarters: end, mass: value * (end - start), densityAt }],
  atoms: [],
  distance: value * (end - start),
});

/** A dimension built from explicit cells, with `distance` derived so it cannot disagree. */
const stepped = (
  dimension: DimensionDensity['dimension'],
  cells: readonly (readonly [number, number, number])[],
): DimensionDensity => ({
  dimension,
  cells: cells.map(([start, end, value]) => ({
    startQuarters: start,
    endQuarters: end,
    mass: value * (end - start),
    densityAt: () => value,
  })),
  atoms: [],
  distance: cells.reduce((sum, [start, end, value]) => sum + value * (end - start), 0),
});

// --- Ruzzo–Tompa ----------------------------------------------------------------------------

/** Every maximal scoring subsequence, by definition, in O(n³). The reference. */
function bruteForceMaximalRuns(
  scores: readonly number[],
): readonly { start: number; end: number }[] {
  const sum = (start: number, end: number): number => {
    let total = 0;
    for (let i = start; i <= end; ++i) total += scores[i];
    return total;
  };
  /** (1) every PROPER subsequence scores strictly lower. */
  const satisfiesLowerSubsequences = (start: number, end: number): boolean => {
    const score = sum(start, end);
    for (let i = start; i <= end; ++i)
      for (let j = i; j <= end; ++j) {
        if (i === start && j === end) continue;
        if (sum(i, j) >= score) return false;
      }
    return true;
  };

  const out: { start: number; end: number }[] = [];
  for (let start = 0; start < scores.length; ++start)
    for (let end = start; end < scores.length; ++end) {
      const score = sum(start, end);
      if (!(score > 0)) continue;
      if (!satisfiesLowerSubsequences(start, end)) continue;
      // (2) no proper SUPERSEQUENCE that itself satisfies (1) scores at least as much.
      //
      // The qualifier "that itself satisfies (1)" is load-bearing and the first version of
      // this reference omitted it, which made it disagree with the algorithm on [1,-2,3]:
      // there [0,2] scores 2 against [0,0]'s 1, but [0,2] contains [2,2] scoring 3, so it is
      // not a competitor and [0,0] survives. Ruzzo & Tompa's definition, not a paraphrase.
      let dominated = false;
      for (let i = 0; i <= start && !dominated; ++i)
        for (let j = end; j < scores.length; ++j) {
          if (i === start && j === end) continue;
          if (sum(i, j) >= score && satisfiesLowerSubsequences(i, j)) dominated = true;
        }
      if (dominated) continue;
      out.push({ start, end });
    }
  return out;
}

describe('Ruzzo–Tompa finds exactly the maximal scoring subsequences', () => {
  it('agrees with a brute-force enumeration on hand-picked shapes', () => {
    const shapes: readonly (readonly number[])[] = [
      [],
      [1],
      [-1],
      [0],
      [1, -2, 3],
      [4, -5, 4],
      [2, -1, 2, -1, 2],
      [-1, 3, -1, 3, -10, 5],
      [3, -1, 3, -6, 3, -1, 3],
      [1, 2, 3, -100, 1, 2, 3],
      [0, 1, 0, -1, 0, 1, 0],
      [-3, -2, -1],
      [5, 0, 5],
    ];
    for (const scores of shapes)
      expect(maximalScoringRuns(scores), JSON.stringify(scores)).toEqual(
        bruteForceMaximalRuns(scores),
      );
  });

  it('agrees on 400 random sequences, which is where a merge bug lives', () => {
    // The step-3 absorption loop is the part a hand-picked case can miss: it fires only when a
    // later run's cumulative low-water mark undercuts an earlier one's.
    let seed = 20260816;
    const next = (): number => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    for (let trial = 0; trial < 400; ++trial) {
      const length = 1 + Math.floor(next() * 9);
      const scores = Array.from({ length }, () => Math.round((next() * 2 - 1) * 6));
      expect(maximalScoringRuns(scores), JSON.stringify(scores)).toEqual(
        bruteForceMaximalRuns(scores),
      );
    }
  });

  it('never absorbs a boundary zero, which is what makes the set canonical', () => {
    // §7.3: a run extended by a zero-score cell contains a proper subsequence of equal score
    // and therefore fails maximality. If it did absorb, the run would be [0,2] not [1,1].
    expect(maximalScoringRuns([0, 5, 0])).toEqual([{ start: 1, end: 1 }]);
    expect(maximalScoringRuns([0, 0, 0])).toEqual([]);
  });

  it('merges across a shallow trough and does not across a deep one', () => {
    expect(maximalScoringRuns([3, -1, 3])).toEqual([{ start: 0, end: 2 }]);
    expect(maximalScoringRuns([3, -4, 3])).toEqual([
      { start: 0, end: 0 },
      { start: 2, end: 2 },
    ]);
  });
});

// --- §7.2 aggregation ------------------------------------------------------------------------

describe('§7.2: D = Σ ω_k d_k', () => {
  it('sums the weighted distances', () => {
    const densities = [flat('tempo', 0, 4, 3), flat('dynamics', 0, 4, 5)];
    expect(aggregateDistance(densities, defaultWeights())).toBeCloseTo(12 + 20, 12);
  });

  it('honours a zero weight in D while leaving d_k alone', () => {
    const densities = [flat('tempo', 0, 4, 3), flat('dynamics', 0, 4, 5)];
    const weights: DimensionWeights = { ...defaultWeights(), dynamics: 0 };
    expect(aggregateDistance(densities, weights)).toBeCloseTo(12, 12);
    // The dimension is still computed — AD-19's whole point, and what makes §7.4's
    // dimension-selective recipe a recipe rather than a deletion.
    expect(densities[1].distance).toBeCloseTo(20, 12);
  });

  it('is summed in COMPARISON_DIMENSIONS order, not arrival order (R2)', () => {
    const forward = [flat('tempo', 0, 4, 0.1), flat('pedal', 0, 4, 0.2)];
    const reversed = [forward[1], forward[0]];
    expect(aggregateDistance(forward, defaultWeights())).toBe(
      aggregateDistance(reversed, defaultWeights()),
    );
  });

  it('ignores a dimension with no density rather than treating it as absent data', () => {
    expect(aggregateDistance([], defaultWeights())).toBe(0);
  });
});

// --- mass, cells and atoms --------------------------------------------------------------------

describe('the density is a measure: cells plus atoms (§5.0)', () => {
  it('charges a point mass to the cell it OPENS, right-continuously', () => {
    const density: DimensionDensity = {
      dimension: 'articulation',
      cells: [],
      atoms: [{ startQuarters: 2, endQuarters: 2, mass: 7 }],
      distance: 7,
    };
    expect(massIn(density, 0, 2)).toBe(0);
    expect(massIn(density, 2, 4)).toBe(7);
    // Charged exactly once across a partition that meets at the atom.
    expect(massIn(density, 0, 2) + massIn(density, 2, 4)).toBe(7);
  });

  it('spreads a matched pair’s mass uniformly over its date interval (AD-7)', () => {
    const density: DimensionDensity = {
      dimension: 'ornamentation',
      cells: [],
      atoms: [{ startQuarters: 1, endQuarters: 3, mass: 8 }],
      distance: 8,
    };
    expect(massIn(density, 1, 2)).toBeCloseTo(4, 12);
    expect(massIn(density, 0, 4)).toBeCloseTo(8, 12);
  });

  it('splits a cell proportionally when an interval covers part of it', () => {
    const density = flat('tempo', 0, 4, 3);
    expect(massIn(density, 0, 1)).toBeCloseTo(3, 12);
    expect(massIn(density, 1, 4)).toBeCloseTo(9, 12);
  });

  it('exposes κ as a named constant with the unit that makes it meaningful', () => {
    expect(EVENT_KAPPA_QUARTERS).toBe(1);
    expect(DEFAULT_THRESHOLD_JND).toBe(1);
  });
});

// --- §7.3 the segment pass ---------------------------------------------------------------------

describe('§7.3: the segment pass', () => {
  const thresholds = defaultThresholds();

  it('finds nothing when every dimension sits below its threshold', () => {
    // One dimension present ⇒ τ_D = 1 JND per quarter; a density of 0.5 never exceeds it.
    const pass = segmentPass([flat('tempo', 0, 8, 0.5)], defaultWeights(), thresholds, 0, 8);
    expect(pass.segments).toEqual([]);
    expect(pass.remainderMass).toBeCloseTo(4, 12);
    expect(pass.thresholdPerQuarter).toBe(1);
  });

  it('finds the above-threshold stretch and only it', () => {
    const density = stepped('tempo', [
      [0, 2, 0.2],
      [2, 4, 5],
      [4, 8, 0.2],
    ]);
    const pass = segmentPass([density], defaultWeights(), thresholds, 0, 8);
    expect(pass.segments).toHaveLength(1);
    expect(pass.segments[0].startQuarters).toBe(2);
    expect(pass.segments[0].endQuarters).toBe(4);
    expect(pass.segments[0].mass).toBeCloseTo(10, 12);
    expect(pass.segments[0].mean).toBeCloseTo(5, 12);
    expect(pass.segments[0].peak).toBeCloseTo(5, 12);
    expect(pass.remainderMass).toBeCloseTo(0.2 * 6, 12);
  });

  it('ranks by mass descending, then earliest start, then shortest', () => {
    // The troughs are deliberately LONGER than the peaks: Ruzzo–Tompa merges two runs across a
    // trough whenever the trough costs less than the second run gains, so a shallow trough
    // would have produced one segment and tested nothing about ranking.
    const density = stepped('tempo', [
      [0, 1, 6],
      [1, 7, 0],
      [7, 8, 6],
    ]);
    const pass = segmentPass([density], defaultWeights(), thresholds, 0, 8);
    expect(pass.segments.map((segment) => segment.mass)).toEqual(
      [...pass.segments.map((segment) => segment.mass)].sort((x, y) => y - x),
    );
    // The two 1-quarter runs carry equal mass, so the tie falls to the earlier start.
    const ties = pass.segments.filter((segment) => Math.abs(segment.mass - 6) < 1e-9);
    expect(ties.length).toBeGreaterThanOrEqual(2);
    expect(ties[0].startQuarters).toBeLessThan(ties[1].startQuarters);
    expect(pass.segments.map((segment) => segment.rank)).toEqual(
      pass.segments.map((_, index) => index),
    );
  });

  it('refines a boundary to the ROOT of p_D − τ_D, not to the cell edge (AD-19/M9b)', () => {
    // ONE long cell whose density ramps through the threshold at t = 4. A density is
    // non-negative by construction (it is |Δ|/jnd), so the ramp is `t/4` rather than
    // something that changes sign. Without root refinement the only available boundaries are
    // the cell edges and the segment would start four quarters early, at 0.
    const ramp = (quarters: number): number => quarters / 4;
    const density: DimensionDensity = {
      dimension: 'tempo',
      cells: [{ startQuarters: 0, endQuarters: 8, mass: 8, densityAt: ramp }],
      atoms: [],
      distance: 8,
    };
    const pass = segmentPass([density], defaultWeights(), defaultThresholds(), 0, 8);
    expect(pass.segments).toHaveLength(1);
    expect(pass.segments[0].startQuarters).toBeCloseTo(4, 6);
    expect(pass.segments[0].endQuarters).toBe(8);
    expect(pass.segments[0].mass).toBeCloseTo(6, 6);
    expect(pass.cellQuantizedDimensions).toEqual([]);
  });

  it('NAMES the dimensions whose boundaries are only cell-resolution', () => {
    const pass = segmentPass([flat('pedal', 0, 8, 4)], defaultWeights(), thresholds, 0, 8);
    expect(pass.cellQuantizedDimensions).toEqual(['pedal']);
  });

  it('excludes a zero-weight dimension from p_D entirely', () => {
    const weights: DimensionWeights = { ...defaultWeights(), dynamics: 0 };
    const densities = [flat('tempo', 0, 8, 0.2), flat('dynamics', 0, 8, 50)];
    const pass = segmentPass(densities, weights, thresholds, 0, 8);
    expect(pass.segments).toEqual([]);
    // …and τ_D counts only the weighted dimension, so the threshold is 1 and not 2.
    expect(pass.thresholdPerQuarter).toBe(1);
  });

  it('scores a zero-width cell as its atom mass, since τ · 0 = 0 (AD-19/M9c)', () => {
    const density: DimensionDensity = {
      dimension: 'articulation',
      cells: [{ startQuarters: 0, endQuarters: 8, mass: 0, densityAt: () => 0 }],
      atoms: [{ startQuarters: 4, endQuarters: 4, mass: 9 }],
      distance: 9,
    };
    const pass = segmentPass([density], defaultWeights(), thresholds, 0, 8);
    expect(pass.segments).toHaveLength(1);
    expect(pass.segments[0].mass).toBeCloseTo(9, 12);
    // A zero-width segment has no continuous density, so `peak` reports 0 rather than ∞ —
    // §9.6's finiteness discipline, and the mass is where the atom is visible.
    expect(Number.isFinite(pass.segments[0].peak)).toBe(true);
  });
});

// --- AD-19's table -----------------------------------------------------------------------------

describe('AD-19: the table closes', () => {
  const thresholds = defaultThresholds();

  it('rows sum to d_k and the grand total is D', () => {
    const densities = [
      stepped('tempo', [
        [0, 2, 0.2],
        [2, 4, 5],
        [4, 8, 0.2],
      ]),
      stepped('dynamics', [
        [0, 4, 1.5],
        [4, 8, 0.1],
      ]),
    ];
    const weights = defaultWeights();
    const pass = segmentPass(densities, weights, thresholds, 0, 8);
    const table = attributionTable(densities, weights, pass.segments, 0, 8);

    for (const density of densities) {
      const row = table.dimensions.indexOf(density.dimension);
      expect(table.rowSums[row]).toBeCloseTo(density.distance, 9);
    }
    expect(table.total).toBeCloseTo(aggregateDistance(densities, weights), 9);
    expect(table.residual).toBeLessThanOrEqual(1e-12 * Math.max(1, table.total));
  });

  it('closes for an ARBITRARY partition too — Ruzzo–Tompa only picks which one', () => {
    const densities = [stepped('tempo', [[0, 8, 3]])];
    const weights = defaultWeights();
    // A partition nothing would ever choose: three ragged segments.
    const arbitrary = [
      {
        startQuarters: 0,
        endQuarters: 1.5,
        lengthQuarters: 1.5,
        mass: 0,
        mean: 0,
        peak: 0,
        peakAtQuarters: 0,
        score: 0,
        rank: 0,
      },
      {
        startQuarters: 3,
        endQuarters: 3.25,
        lengthQuarters: 0.25,
        mass: 0,
        mean: 0,
        peak: 0,
        peakAtQuarters: 3,
        score: 0,
        rank: 1,
      },
      {
        startQuarters: 6,
        endQuarters: 8,
        lengthQuarters: 2,
        mass: 0,
        mean: 0,
        peak: 0,
        peakAtQuarters: 6,
        score: 0,
        rank: 2,
      },
    ];
    const table = attributionTable(densities, weights, arbitrary, 0, 8);
    expect(table.total).toBeCloseTo(24, 9);
    expect(table.residual).toBeLessThanOrEqual(1e-12 * table.total);
  });

  it('has one row per dimension in COMPARISON_DIMENSIONS order, whatever arrived', () => {
    const table = attributionTable([flat('pedal', 0, 4, 1)], defaultWeights(), [], 0, 4);
    expect(table.dimensions).toEqual([...COMPARISON_DIMENSIONS]);
    expect(table.cells).toHaveLength(COMPARISON_DIMENSIONS.length * table.columnCount);
    expect(table.columnCount).toBe(1);
  });

  it('keeps the cells UNWEIGHTED while the column sums are weighted', () => {
    const densities = [flat('tempo', 0, 4, 2), flat('dynamics', 0, 4, 2)];
    const weights: DimensionWeights = { ...defaultWeights(), dynamics: 3 };
    const table = attributionTable(densities, weights, [], 0, 4);
    const tempoRow = table.dimensions.indexOf('tempo');
    const dynamicsRow = table.dimensions.indexOf('dynamics');
    expect(table.cells[tempoRow * table.columnCount]).toBeCloseTo(8, 12);
    expect(table.cells[dynamicsRow * table.columnCount]).toBeCloseTo(8, 12);
    expect(table.columnSums[0]).toBeCloseTo(8 + 3 * 8, 12);
  });

  it('is exactly zero throughout for two identical documents (P-C1’s shape)', () => {
    const table = attributionTable([flat('tempo', 0, 4, 0)], defaultWeights(), [], 0, 4);
    expect(table.total).toBe(0);
    expect(table.residual).toBe(0);
    expect(table.cells.every((cell) => cell === 0)).toBe(true);
  });
});

// --- C11's equivalence block ---------------------------------------------------------------------

describe('C11: the equivalence block', () => {
  it('reports the sub-threshold mass fraction the sentence needs', () => {
    const densities = [
      stepped('tempo', [
        [0, 2, 0.2],
        [2, 4, 5],
        [4, 8, 0.2],
      ]),
    ];
    const weights = defaultWeights();
    const thresholds = defaultThresholds();
    const pass = segmentPass(densities, weights, thresholds, 0, 8);
    const total = aggregateDistance(densities, weights);
    const block = equivalenceBlock(
      densities,
      thresholds,
      pass.segments,
      pass.remainderMass,
      total,
      0,
      8,
    );

    expect(block.subThresholdMassFraction).toBeCloseTo(1.2 / 11.2, 9);
    expect(block.aboveThresholdLengthFraction).toBeCloseTo(2 / 8, 9);
    expect(block.byDimension.tempo.subThresholdMassFraction).toBeCloseTo(1.2 / 11.2, 9);
  });

  it('answers 0 rather than NaN when there is no deviation at all (§9.6)', () => {
    const densities = [flat('tempo', 0, 8, 0)];
    const thresholds = defaultThresholds();
    const block = equivalenceBlock(densities, thresholds, [], 0, 0, 0, 8);
    expect(block.subThresholdMassFraction).toBe(0);
    expect(block.aboveThresholdLengthFraction).toBe(0);
    for (const dimension of COMPARISON_DIMENSIONS) {
      expect(Number.isFinite(block.byDimension[dimension].subThresholdMassFraction)).toBe(true);
      expect(Number.isFinite(block.byDimension[dimension].aboveThresholdLengthFraction)).toBe(true);
    }
  });

  it('gives every dimension an entry, present or not', () => {
    const block = equivalenceBlock([flat('pedal', 0, 4, 9)], defaultThresholds(), [], 0, 0, 0, 4);
    expect(Object.keys(block.byDimension).sort()).toEqual([...COMPARISON_DIMENSIONS].sort());
  });

  it('measures the per-dimension length fraction against that dimension’s OWN threshold', () => {
    // Aggregate segments are one set shared by all rows, so a per-dimension length fraction
    // copied from them would be identical everywhere and say nothing.
    const densities = [
      stepped('tempo', [
        [0, 4, 9],
        [4, 8, 0.1],
      ]),
      stepped('pedal', [[0, 8, 0.1]]),
    ];
    const thresholds = defaultThresholds();
    const weights = defaultWeights();
    const pass = segmentPass(densities, weights, thresholds, 0, 8);
    const block = equivalenceBlock(
      densities,
      thresholds,
      pass.segments,
      pass.remainderMass,
      aggregateDistance(densities, weights),
      0,
      8,
    );
    expect(block.byDimension.tempo.aboveThresholdLengthFraction).toBeCloseTo(0.5, 9);
    expect(block.byDimension.pedal.aboveThresholdLengthFraction).toBe(0);
  });
});
