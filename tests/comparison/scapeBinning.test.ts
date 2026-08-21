/**
 * WHERE a point atom's mass sits in the scape triangle — `binOf`, pinned by placement.
 *
 * A negative control on `binOf`'s bin arithmetic came back **green**: shifting every answer by
 * one bin (`Math.min(edge, count − 1)` in place of `Math.min(edge − 1, count − 1)`) left all
 * 1347 tests in `tests/comparison` passing.
 *
 * The root cause was measured rather than guessed, in two steps. First, `binOf` is genuinely
 * reached — throwing from its first line fails `scape.test.ts`, `properties.test.ts` and
 * `readmeRecipes.test.ts` — and it is reached with real, non-zero masses landing in bins other
 * than the last: instrumenting it over `scape.test.ts` logged answers in bins 0, 1, 2, 3, 4, 5,
 * 7, 14 and 48, carrying masses from 1.1 to 7. So the shift really did move mass between cells.
 *
 * Second, why nothing noticed. `scape.test.ts`'s own header names the property it tests —
 * *"the load-bearing property is INTERNAL CONSISTENCY"* — and every case there is invariant
 * under a permutation of mass across bins: additivity ("a cell is the sum of the two below it"),
 * closure ("the top cell IS the aggregate distance"), triangle shape, and a narrowed-window
 * agreement whose relative band absorbs a one-bin shift of a small atom inside a large cell. Its
 * one placement case, "keeps a point atom that sits exactly there", puts the atom at the window
 * END, which is the one position where the shift is a no-op: no edge is greater, so both
 * spellings fall through to the closed last bin.
 *
 * A scape's entire purpose is to say WHERE the difference sits, so "the rows add up" is not
 * enough. These cases pin the placement itself, at four positions and at an interior edge.
 */
import { describe, it, expect } from 'vitest';
import { scapeIndex, scapeOf } from '../../src/comparison/scape.js';
import { defaultWeights } from '../../src/comparison/aggregate.js';

/** Window `[0, 8)` in 4 bins, so the edges are 0, 2, 4, 6, 8 and a bin is two quarters. */
const BINS = 4;
const END = 8;

const unitCells = (
  atoms: readonly { startQuarters: number; endQuarters: number; mass: number }[],
) => {
  const scape = scapeOf(
    [{ dimension: 'articulation' as const, cells: [], atoms, distance: 0 }],
    defaultWeights(),
    0,
    END,
    BINS,
  );
  expect(scape.bins).toBe(BINS);
  return Array.from({ length: BINS }, (_unused, bin) => scape.cells[scapeIndex(BINS, 1, bin)]);
};

describe('a point atom lands in the bin that contains it', () => {
  it('places four atoms in four different bins, each by its own position', () => {
    // 0 opens bin 0; 2.5 is inside [2,4); 5 is inside [4,6); 7 is inside [6,8).
    expect(
      unitCells([
        { startQuarters: 0, endQuarters: 0, mass: 11 },
        { startQuarters: 2.5, endQuarters: 2.5, mass: 22 },
        { startQuarters: 5, endQuarters: 5, mass: 33 },
        { startQuarters: 7, endQuarters: 7, mass: 44 },
      ]),
    ).toEqual([11, 22, 33, 44]);
  });

  it('gives an atom exactly on an interior edge to the bin it OPENS (A-B1/R27)', () => {
    // Right-continuity, at the one kind of position where the half-open rule is decidable and
    // the existing window-end case is not: 4 belongs to [4, 6), never to [2, 4).
    expect(unitCells([{ startQuarters: 4, endQuarters: 4, mass: 9 }])).toEqual([0, 0, 9, 0]);
  });

  it('still adds up — the placement above does not come at conservation’s expense', () => {
    const atoms = [
      { startQuarters: 0, endQuarters: 0, mass: 11 },
      { startQuarters: 2.5, endQuarters: 2.5, mass: 22 },
      { startQuarters: 5, endQuarters: 5, mass: 33 },
      { startQuarters: 7, endQuarters: 7, mass: 44 },
    ];
    const scape = scapeOf(
      [{ dimension: 'articulation' as const, cells: [], atoms, distance: 110 }],
      defaultWeights(),
      0,
      END,
      BINS,
    );
    expect(scape.cells[scapeIndex(BINS, BINS, 0)]).toBe(110);
  });
});
