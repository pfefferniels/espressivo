import { describe, it, expect, vi } from 'vitest';
import {
  accidDecimal2String,
  accidDecimal2unicodeString,
  accidString2decimal,
  accidString2word,
  midi2PnameAccidOct,
  midi2PnameAndAccid,
  midi2pname,
  pname2midi,
} from '../../src/music/pitch.js';

// Moved verbatim from tests/mei/Helper.test.ts by T14: pitch and accidental conversions.

// ---------------------------------------------------------------------------
// accidString2decimal / accidDecimal2String
// ---------------------------------------------------------------------------
describe('accidental conversions', () => {
  it('accidString2decimal should convert common accidentals', () => {
    expect(accidString2decimal('s')).toBe(1);
    expect(accidString2decimal('f')).toBe(-1);
    expect(accidString2decimal('ss')).toBe(2);
    expect(accidString2decimal('ff')).toBe(-2);
    expect(accidString2decimal('n')).toBe(0);
  });

  it('accidDecimal2String should convert back', () => {
    expect(accidDecimal2String(1)).toBe('s');
    expect(accidDecimal2String(-1)).toBe('f');
    expect(accidDecimal2String(0)).toBe('n');
  });

  it('accidDecimal2String should accept string input', () => {
    expect(accidDecimal2String('1.0')).toBe('s');
    expect(accidDecimal2String('-1.0')).toBe('f');
  });

  it('accidDecimal2String should return null for null', () => {
    expect(accidDecimal2String(null)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// pname2midi
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// pname2midi
// ---------------------------------------------------------------------------
describe('pname2midi', () => {
  it('should convert basic pitch names', () => {
    expect(pname2midi('c')).toBe(0);
    expect(pname2midi('d')).toBe(2);
    expect(pname2midi('e')).toBe(4);
    expect(pname2midi('f')).toBe(5);
    expect(pname2midi('g')).toBe(7);
    expect(pname2midi('a')).toBe(9);
    expect(pname2midi('b')).toBe(11);
  });

  it('should handle uppercase pitch names', () => {
    expect(pname2midi('C')).toBe(0);
    expect(pname2midi('D')).toBe(2);
  });

  it('should return -1 for unknown', () => {
    expect(pname2midi('z')).toBe(-1);
  });
});

// ---------------------------------------------------------------------------
// cloneElement
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// accidental conversions – the remaining cases
// ---------------------------------------------------------------------------
describe('accidString2decimal – quarter tones and enharmonics', () => {
  it('should convert the double and triple accidentals', () => {
    expect(accidString2decimal('x')).toBe(2);
    expect(accidString2decimal('xs')).toBe(3);
    expect(accidString2decimal('ts')).toBe(3);
    expect(accidString2decimal('tf')).toBe(-3);
  });

  it('should convert the neutral combinations', () => {
    expect(accidString2decimal('nf')).toBe(-1);
    expect(accidString2decimal('ns')).toBe(1);
  });

  it('should convert the quarter tone accidentals', () => {
    expect(accidString2decimal('su')).toBe(1.5);
    expect(accidString2decimal('sd')).toBe(0.5);
    expect(accidString2decimal('fu')).toBe(-0.5);
    expect(accidString2decimal('fd')).toBe(-1.5);
    expect(accidString2decimal('nu')).toBe(0.5);
    expect(accidString2decimal('nd')).toBe(-0.5);
    expect(accidString2decimal('1qf')).toBe(-0.5);
    expect(accidString2decimal('3qf')).toBe(-1.5);
    expect(accidString2decimal('1qs')).toBe(0.5);
    expect(accidString2decimal('3qs')).toBe(1.5);
  });

  it('should return 0 for anything it does not know', () => {
    expect(accidString2decimal('zzz')).toBe(0);
    expect(accidString2decimal('')).toBe(0);
  });
});

describe('accidDecimal2String – the remaining cases', () => {
  it('should convert the double and triple accidentals', () => {
    expect(accidDecimal2String(2)).toBe('ss');
    expect(accidDecimal2String(-2)).toBe('ff');
    expect(accidDecimal2String(3)).toBe('xs');
    expect(accidDecimal2String(-3)).toBe('tf');
  });

  it('should convert the quarter tone accidentals', () => {
    expect(accidDecimal2String('0.5')).toBe('1qs');
    expect(accidDecimal2String('1.5')).toBe('3qs');
    expect(accidDecimal2String('-0.5')).toBe('1qf');
    expect(accidDecimal2String('-1.5')).toBe('3qf');
  });

  it('should pass an unrecognised value through unchanged', () => {
    expect(accidDecimal2String('7')).toBe('7');
  });

  it('should round-trip against accidString2decimal', () => {
    for (const accid of ['s', 'f', 'ss', 'ff', 'n', '1qs', '3qs', '1qf', '3qf']) {
      const decimal = accidString2decimal(accid);
      expect(accidString2decimal(accidDecimal2String(decimal)!)).toBe(decimal);
    }
  });
});

describe('accidString2word', () => {
  it('should name the plain accidentals', () => {
    expect(accidString2word('s')).toBe('sharp');
    expect(accidString2word('f')).toBe('flat');
    expect(accidString2word('n')).toBe('natural');
    expect(accidString2word('ss')).toBe('sharp-sharp');
    expect(accidString2word('x')).toBe('double-sharp');
    expect(accidString2word('ff')).toBe('flat-flat');
  });

  it('should share one word between the two triple sharp spellings', () => {
    expect(accidString2word('xs')).toBe('triple-sharp');
    expect(accidString2word('ts')).toBe('triple-sharp');
    expect(accidString2word('tf')).toBe('triple-flat');
  });

  it('should name the combined and microtonal accidentals', () => {
    expect(accidString2word('nf')).toBe('natural-flat');
    expect(accidString2word('ns')).toBe('natural-sharp');
    expect(accidString2word('su')).toBe('sharp-up');
    expect(accidString2word('sd')).toBe('sharp-down');
    expect(accidString2word('fu')).toBe('flat-up');
    expect(accidString2word('fd')).toBe('flat-down');
    expect(accidString2word('nu')).toBe('natural-up');
    expect(accidString2word('nd')).toBe('natural-down');
    expect(accidString2word('1qf')).toBe('quarter-flat');
    expect(accidString2word('3qf')).toBe('three-quarters-flat');
    expect(accidString2word('1qs')).toBe('quarter-sharp');
    expect(accidString2word('3qs')).toBe('three-quarters-sharp');
  });

  it('should return an empty string for anything unknown', () => {
    expect(accidString2word('zzz')).toBe('');
  });
});

describe('accidDecimal2unicodeString', () => {
  it('should return nothing for a natural', () => {
    expect(accidDecimal2unicodeString(0.0)).toBe('');
  });

  it('should map the semitone accidentals', () => {
    expect(accidDecimal2unicodeString(1.0)).toBe('&#9839;');
    expect(accidDecimal2unicodeString(-1.0)).toBe('&#9837;');
    expect(accidDecimal2unicodeString(2.0)).toBe('&#119082;');
    expect(accidDecimal2unicodeString(-2.0)).toBe('&#119083;');
    expect(accidDecimal2unicodeString(3.0)).toBe('&#119082;&#9839;');
    expect(accidDecimal2unicodeString(-3.0)).toBe('&#9837;&#9837;&#9837;');
  });

  it('should map the quarter tone accidentals', () => {
    expect(accidDecimal2unicodeString(1.5)).toBe('&#119088;');
    expect(accidDecimal2unicodeString(0.5)).toBe('&#119090;');
    expect(accidDecimal2unicodeString(-0.5)).toBe('&#119091;');
    expect(accidDecimal2unicodeString(-1.5)).toBe('&#119085;');
  });

  it('should return a question mark for a value it cannot render', () => {
    expect(accidDecimal2unicodeString(0.25)).toBe('?');
    expect(accidDecimal2unicodeString(4.0)).toBe('?');
  });
});

// ---------------------------------------------------------------------------
// pitch conversions
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// pitch conversions
// ---------------------------------------------------------------------------
describe('pname2midi – accidental spellings', () => {
  it('should resolve the enharmonic spellings onto one pitch class', () => {
    expect(pname2midi('b#')).toBe(0);
    expect(pname2midi('bs')).toBe(0);
    expect(pname2midi('c#')).toBe(1);
    expect(pname2midi('cs')).toBe(1);
    expect(pname2midi('db')).toBe(1);
    expect(pname2midi('df')).toBe(1);
    expect(pname2midi('ds')).toBe(3);
    expect(pname2midi('ef')).toBe(3);
    expect(pname2midi('fb')).toBe(4);
    expect(pname2midi('ff')).toBe(4);
    expect(pname2midi('es')).toBe(5);
    expect(pname2midi('fs')).toBe(6);
    expect(pname2midi('gf')).toBe(6);
    expect(pname2midi('gs')).toBe(8);
    expect(pname2midi('af')).toBe(8);
    expect(pname2midi('cf')).toBe(11);
    expect(pname2midi('cb')).toBe(11);
  });

  it('should accept the upper case spellings as well', () => {
    expect(pname2midi('B#')).toBe(0);
    expect(pname2midi('Db')).toBe(1);
    expect(pname2midi('Ef')).toBe(3);
    expect(pname2midi('Gs')).toBe(8);
    expect(pname2midi('Cb')).toBe(11);
  });

  it('should return -1 for an empty name', () => {
    expect(pname2midi('')).toBe(-1);
  });
});

describe('midi2pname', () => {
  it('should name every pitch class of the first octave', () => {
    expect([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((p) => midi2pname(p))).toEqual([
      'C',
      'C# Db',
      'D',
      'D# Eb',
      'E',
      'F',
      'F# Gb',
      'G',
      'G# Ab',
      'A',
      'A# Bb',
      'B',
    ]);
  });

  it('should fold higher octaves onto the same pitch classes', () => {
    expect(midi2pname(60)).toBe('C');
    expect(midi2pname(69)).toBe('A');
    expect(midi2pname(71)).toBe('B');
  });

  it('should round a fractional pitch to the nearest pitch class', () => {
    expect(midi2pname(60.4)).toBe('C');
    expect(midi2pname(60.6)).toBe('C# Db');
  });

  it('should return an empty string when the pitch class falls outside 0..11', () => {
    // rounding 11.5 gives 12, which no case covers
    expect(midi2pname(11.5)).toBe('');
    expect(midi2pname(-1)).toBe('');
  });
});

describe('midi2PnameAndAccid', () => {
  it('should give the naturals no accidental', () => {
    for (const [pitch, name] of [
      [60, 'C'],
      [62, 'D'],
      [64, 'E'],
      [65, 'F'],
      [67, 'G'],
      [69, 'A'],
      [71, 'B'],
    ] as [number, string][]) {
      const out = ['', ''];
      midi2PnameAndAccid(true, pitch, out);
      expect(out).toEqual([name, '0.0']);
    }
  });

  it('should spell the black keys as sharps when asked to', () => {
    const results = [61, 63, 66, 68, 70].map((pitch) => {
      const out = ['', ''];
      midi2PnameAndAccid(true, pitch, out);
      return out;
    });
    expect(results).toEqual([
      ['C', '1.0'],
      ['D', '1.0'],
      ['F', '1.0'],
      ['G', '1.0'],
      ['A', '1.0'],
    ]);
  });

  it('should spell the black keys as flats otherwise', () => {
    const results = [61, 63, 66, 68, 70].map((pitch) => {
      const out = ['', ''];
      midi2PnameAndAccid(false, pitch, out);
      return out;
    });
    expect(results).toEqual([
      ['D', '-1.0'],
      ['E', '-1.0'],
      ['G', '-1.0'],
      ['A', '-1.0'],
      ['B', '-1.0'],
    ]);
  });

  it('should blank both entries when the pitch class falls outside 0..11', () => {
    const out = ['x', 'y'];
    midi2PnameAndAccid(true, -1, out);
    expect(out).toEqual(['', '']);
  });

  it('should complain and leave the array alone when it is too short', () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const out = ['x'];
    midi2PnameAndAccid(true, 60, out);

    expect(out).toEqual(['x']);
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });
});

describe('midi2PnameAccidOct', () => {
  it('should add the octave to pitch name and accidental', () => {
    const out = ['', '', ''];
    midi2PnameAccidOct(false, 60, out);
    expect(out[0]).toBe('C');
    expect(out[1]).toBe('0.0');
    expect(out[2]).toBe('4');
  });

  it('should map the octave boundaries the way the MIDI octave table does', () => {
    const octaveOf = (pitch: number) => {
      const out = ['', '', ''];
      midi2PnameAccidOct(true, pitch, out);
      return out[2];
    };

    expect(octaveOf(21)).toBe('0');
    expect(octaveOf(23)).toBe('0');
    expect(octaveOf(24)).toBe('1');
    expect(octaveOf(36)).toBe('2');
    expect(octaveOf(48)).toBe('3');
    expect(octaveOf(60)).toBe('4');
    expect(octaveOf(72)).toBe('5');
    expect(octaveOf(84)).toBe('6');
    expect(octaveOf(96)).toBe('7');
    expect(octaveOf(108)).toBe('8');
    expect(octaveOf(127)).toBe('8');
  });

  it('should report octave -1 below the table', () => {
    const out = ['', '', ''];
    midi2PnameAccidOct(true, 20, out);
    expect(out[2]).toBe('-1');
  });

  it('should leave the octave untouched when the pitch class is out of range', () => {
    const out = ['', '', 'untouched'];
    midi2PnameAccidOct(true, -1, out);
    expect(out[2]).toBe('untouched');
  });

  it('should complain and leave the array alone when it is too short', () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const out = ['x', 'y'];
    midi2PnameAccidOct(true, 60, out);

    expect(out).toEqual(['x', 'y']);
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// prettyXml – declaration and nesting
// ---------------------------------------------------------------------------
