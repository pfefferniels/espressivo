/**
 * The ornament dictionary: that the table transcribes `ornaments.dict` faithfully, and that the
 * lookup finds an entry by every spelling the dict's header promises.
 *
 * The expected sequences below are written out from the source file
 * (LarsEngeln/meico @ 3deb141c, `src/resources/ornaments.dict`, quoted per entry), not read back
 * out of the table — a test that derived them from `ORNAMENT_SHAPES` would agree with any
 * transcription error.
 */
import { describe, it, expect } from 'vitest';
import {
  ORNAMENT_SHAPES,
  distinctSteps,
  lookupOrnamentShape,
  normalizeOrnamentName,
} from '../../src/mei/ornamentsDict.js';

describe('ornaments.dict table', () => {
  it('holds the seven shipped entries, in file order', () => {
    expect(ORNAMENT_SHAPES.map((s) => s.name)).toEqual([
      'trill',
      'upper turn',
      'lower turn',
      'upper mordent',
      'lower mordent',
      'trill with mordent',
      'double cadence lower prefix',
    ]);
  });

  // Each case is the dict's `#` line(s) and the alteration line that follows it.
  it.each([
    // # trill              /  |: 0 1 :|
    ['trill', ['|:', 0, 1, ':|']],
    // # upper turn         /  1 0 -1 0
    ['upper turn', [1, 0, -1, 0]],
    // # lower turn         /  -1 0 1 0
    ['lower turn', [-1, 0, 1, 0]],
    // # upper mordent      /  0 1 0
    ['upper mordent', [0, 1, 0]],
    // # lower mordent      /  0 -1 0
    ['lower mordent', [0, -1, 0]],
    // # trill with mordent /  |: 0 1 :| 0 -1 0
    ['trill with mordent', ['|:', 0, 1, ':|', 0, -1, 0]],
    // # double cadence lower prefix / -1 0 |: 1 0 :|
    ['double cadence lower prefix', [-1, 0, '|:', 1, 0, ':|']],
  ])('transcribes %s', (name, sequence) => {
    expect(lookupOrnamentShape(name)!.sequence).toEqual(sequence);
  });

  it('carries the dict alias for the double cadence', () => {
    // The dict's only explicit second `#` line (its line 41).
    expect(lookupOrnamentShape('ornamentPrecompDoubleCadenceLowerPrefix')!.name).toBe(
      'double cadence lower prefix',
    );
  });
});

describe('normalizeOrnamentName', () => {
  it('turns a SMuFL glyph name into the dict spelling', () => {
    // The dict header's own example (lines 4-5).
    expect(normalizeOrnamentName('ornamentPrecompDoubleCadenceLowerPrefix')).toBe(
      'double cadence lower prefix',
    );
  });

  it('strips the bare "ornament" prefix too', () => {
    // Blueprint §7.5, third defect: the reference strips only "ornamentPrecomp", so this name
    // normalises to "ornament trill" there, misses the dictionary and throws.
    expect(normalizeOrnamentName('ornamentTrill')).toBe('trill');
    expect(lookupOrnamentShape('ornamentTrill')!.name).toBe('trill');
  });

  it('leaves a dict spelling untouched and ignores case and padding', () => {
    expect(normalizeOrnamentName('upper mordent')).toBe('upper mordent');
    expect(normalizeOrnamentName('  Upper   Mordent ')).toBe('upper mordent');
    expect(lookupOrnamentShape('  UPPER MORDENT  ')!.name).toBe('upper mordent');
  });
});

describe('lookupOrnamentShape', () => {
  it('returns null for a name the dictionary does not define', () => {
    // The two shapes that reach this in practice: a bare <mordent/> with no @form (which the
    // reference dereferences null on — blueprint §7.5, second defect), and an unknown glyph.
    expect(lookupOrnamentShape('mordent')).toBeNull();
    expect(lookupOrnamentShape('turn')).toBeNull();
    expect(lookupOrnamentShape('ornamentPrecompSlide')).toBeNull();
    expect(lookupOrnamentShape('')).toBeNull();
    expect(lookupOrnamentShape('   ')).toBeNull();
  });
});

describe('distinctSteps', () => {
  it('keeps first-appearance order and drops repeats and barlines', () => {
    // An upper turn plays four notes over three distinct pitches: the 0 recurs.
    expect(distinctSteps(lookupOrnamentShape('upper turn')!.sequence)).toEqual([1, 0, -1]);
    expect(distinctSteps(lookupOrnamentShape('trill')!.sequence)).toEqual([0, 1]);
    expect(distinctSteps(lookupOrnamentShape('trill with mordent')!.sequence)).toEqual([0, 1, -1]);
  });

  it('is empty for a sequence of nothing but barlines', () => {
    expect(distinctSteps(['|:', ':|'])).toEqual([]);
  });
});
