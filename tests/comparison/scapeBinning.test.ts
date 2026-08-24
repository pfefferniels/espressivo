/**
 * WHERE a point atom's mass sits in the scape triangle — `binOf`, pinned by placement.
 *
 * A negative control on `binOf`'s bin arithmetic came back green: shifting every answer by one
 * bin (`Math.min(edge, count − 1)` for `Math.min(edge − 1, count − 1)`) left every test in
 * `tests/comparison` passing. The shift really did move mass between cells — instrumenting
 * `binOf` over `scape.test.ts` logs masses of 1.1 to 7 landing in bins 0 through 48.
 *
 * Nothing noticed because `scape.test.ts` tests internal consistency, and every property there
 * is invariant under a permutation of mass across bins: additivity, closure, triangle shape, and
 * a narrowed-window agreement whose relative band absorbs a one-bin shift of a small atom inside
 * a large cell. Its one placement case puts the atom at the window END, the one position where
 * the shift is a no-op: no edge is greater, so both spellings fall through to the closed last
 * bin.
 *
 * A scape's purpose is to say WHERE the difference sits, so "the rows add up" is not enough.
 * These cases pin the placement itself, at four positions and at an interior edge.
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

  it('gives an atom exactly on an interior edge to the bin it OPENS', () => {
    // Right-continuity at an interior edge, where the window-end case cannot decide it:
    // 4 belongs to [4, 6), never to [2, 4).
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
