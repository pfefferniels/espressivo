/**
 * §7's aggregation and AD-19's closing table.
 *
 * Ruzzo–Tompa is tested against a brute-force enumeration of every subsequence rather than
 * against expected segment lists: asserting "these are the segments" pins one answer out of
 * possibly several and passes on an implementation that optimizes the wrong thing. The table's
 * closure is asserted on synthetic densities whose exact totals are known by construction.
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
import { elementAt, numberAt } from '../../src/prelude/index.js';
import type { AggregateSegment, SegmentPass } from '../../src/comparison/aggregate.js';

/** Segment `index` of a segmentation pass, checked. */
const segmentAt = (pass: SegmentPass, index = 0): AggregateSegment =>
  elementAt(pass.segments, index, 'the segments this pass found');

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
    for (let i = start; i <= end; ++i) total += numberAt(scores, i, 'the score sequence');
    return total;
  };
  /** (1) every proper subsequence scores strictly lower. */
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
      // (2) no proper supersequence that itself satisfies (1) scores at least as much.
      //
      // The qualifier "that itself satisfies (1)" is load-bearing. On [1,-2,3], [0,2] scores 2
      // against [0,0]'s 1, but [0,2] contains [2,2] scoring 3, so it is not a competitor and
      // [0,0] survives. Ruzzo & Tompa's definition, not a paraphrase.
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
    // The dimension is still computed (AD-19), which is what makes §7.4's dimension-selective
    // recipe a recipe rather than a deletion.
    expect(elementAt(densities, 1, 'the dimension densities').distance).toBeCloseTo(20, 12);
  });

  it('is summed in COMPARISON_DIMENSIONS order, not arrival order (R2)', () => {
    const forward = [flat('tempo', 0, 4, 0.1), flat('pedal', 0, 4, 0.2)];
    const reversed = [
      elementAt(forward, 1, 'the arrival-ordered densities'),
      elementAt(forward, 0, 'the arrival-ordered densities'),
    ];
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
    const only = segmentAt(pass);
    expect(only.startQuarters).toBe(2);
    expect(only.endQuarters).toBe(4);
    expect(only.mass).toBeCloseTo(10, 12);
    expect(only.mean).toBeCloseTo(5, 12);
    expect(only.peak).toBeCloseTo(5, 12);
    expect(pass.remainderMass).toBeCloseTo(0.2 * 6, 12);
  });

  it('ranks by mass descending, then earliest start, then shortest', () => {
    // The troughs are longer than the peaks on purpose: Ruzzo–Tompa merges two runs across a
    // trough that costs less than the second run gains, so a shallow one would produce a single
    // segment and test nothing about ranking.
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
    const tie = (index: number) => elementAt(ties, index, 'the equal-mass segments');
    expect(tie(0).startQuarters).toBeLessThan(tie(1).startQuarters);
    expect(pass.segments.map((segment) => segment.rank)).toEqual(
      pass.segments.map((_, index) => index),
    );
  });

  it('refines a boundary to the ROOT of p_D − τ_D, not to the cell edge (AD-19/M9b)', () => {
    // One long cell whose density ramps through the threshold at t = 4. A density is
    // non-negative by construction (|Δ|/jnd), so the ramp is `t/4` rather than something that
    // changes sign. Without root refinement the only boundaries available are the cell edges,
    // and the segment starts four quarters early at 0.
    const ramp = (quarters: number): number => quarters / 4;
    const density: DimensionDensity = {
      dimension: 'tempo',
      cells: [{ startQuarters: 0, endQuarters: 8, mass: 8, densityAt: ramp }],
      atoms: [],
      distance: 8,
    };
    const pass = segmentPass([density], defaultWeights(), defaultThresholds(), 0, 8);
    expect(pass.segments).toHaveLength(1);
    const only = segmentAt(pass);
    expect(only.startQuarters).toBeCloseTo(4, 6);
    expect(only.endQuarters).toBe(8);
    expect(only.mass).toBeCloseTo(6, 6);
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
    expect(segmentAt(pass).mass).toBeCloseTo(9, 12);
    // A zero-width segment has no continuous density, so `peak` reports 0 rather than ∞ —
    // §9.6's finiteness discipline, and the mass is where the atom is visible.
    expect(Number.isFinite(segmentAt(pass).peak)).toBe(true);
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

  /**
   * The field is a fraction, and a dimension evaluated over several part scopes carries one
   * overlapping cell list per scope. Summing each cell's own length counts the same quarter once
   * per part, so three parts deviating everywhere report 3.0 — outside `[0, 1]`, and §7.3's
   * mandated sentence would print "300 % of the window". A single synthetic scope pinning 0.5 is
   * blind to it: on the vendored documents telemann's tempo row measures 3.0000.
   */
  it('stays a fraction when a dimension is evaluated over several part scopes', () => {
    const threeParts: DimensionDensity = {
      dimension: 'tempo',
      // Three scopes, each covering the whole window — what `densityOf` concatenates when three
      // parts inherit one global map.
      cells: [0, 1, 2].map(() => ({
        startQuarters: 0,
        endQuarters: 8,
        mass: 9 * 8,
        densityAt: () => 9,
      })),
      atoms: [],
      distance: 3 * 9 * 8,
    };
    const block = equivalenceBlock(
      [threeParts],
      defaultThresholds(),
      [],
      0,
      threeParts.distance,
      0,
      8,
    );
    expect(block.byDimension.tempo.aboveThresholdLengthFraction).toBe(1);

    // Not clamped into range: a dimension above threshold on half the window still reports 0.5
    // with three scopes, so this is a measure and not a `Math.min`.
    const halfAbove: DimensionDensity = {
      dimension: 'pedal',
      cells: [0, 1, 2].flatMap(() => [
        { startQuarters: 0, endQuarters: 4, mass: 9 * 4, densityAt: () => 9 },
        { startQuarters: 4, endQuarters: 8, mass: 0, densityAt: () => 0 },
      ]),
      atoms: [],
      distance: 3 * 9 * 4,
    };
    const second = equivalenceBlock(
      [halfAbove],
      defaultThresholds(),
      [],
      0,
      halfAbove.distance,
      0,
      8,
    );
    expect(second.byDimension.pedal.aboveThresholdLengthFraction).toBeCloseTo(0.5, 12);
  });

  it('sums the overlapping scopes’ densities rather than taking one of them', () => {
    // Three scopes each at 0.4 JND per quarter are below the threshold alone and above it
    // together — `p_k(t) = Σ_parts p_{k,part}(t)`, the same summation `massIn` performs.
    const together: DimensionDensity = {
      dimension: 'dynamics',
      cells: [0, 1, 2].map(() => ({
        startQuarters: 0,
        endQuarters: 8,
        mass: 0.4 * 8,
        densityAt: () => 0.4,
      })),
      atoms: [],
      distance: 3 * 0.4 * 8,
    };
    const block = equivalenceBlock([together], defaultThresholds(), [], 0, together.distance, 0, 8);
    expect(block.byDimension.dynamics.aboveThresholdLengthFraction).toBe(1);
  });
});
