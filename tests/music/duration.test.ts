import { describe, it, expect } from 'vitest';
import {
  decimalDuration2HtmlUnicode,
  duration2decimal,
  duration2word,
  pulseDuration2decimal,
} from '../../src/music/duration.js';

// Moved verbatim from tests/mei/Helper.test.ts by T14: duration conversions.

// ---------------------------------------------------------------------------
// duration2decimal
// ---------------------------------------------------------------------------
describe('duration2decimal', () => {
  it('should convert "maxima" to 8.0', () => {
    expect(duration2decimal('maxima')).toBe(8.0);
  });

  it('should convert "long" to 4.0', () => {
    expect(duration2decimal('long')).toBe(4.0);
  });

  it('should convert "breve" to 2.0', () => {
    expect(duration2decimal('breve')).toBe(2.0);
  });

  it('should convert "1" (whole) to 1.0', () => {
    expect(duration2decimal('1')).toBe(1.0);
  });

  it('should convert "2" (half) to 0.5', () => {
    expect(duration2decimal('2')).toBe(0.5);
  });

  it('should convert "4" (quarter) to 0.25', () => {
    expect(duration2decimal('4')).toBe(0.25);
  });

  it('should convert "8" (eighth) to 0.125', () => {
    expect(duration2decimal('8')).toBe(0.125);
  });

  it('should convert "16" to 0.0625', () => {
    expect(duration2decimal('16')).toBe(0.0625);
  });

  it('should convert "32" to 0.03125', () => {
    expect(duration2decimal('32')).toBe(0.03125);
  });

  it('should convert "64" to 0.015625', () => {
    expect(duration2decimal('64')).toBe(0.015625);
  });

  it('should convert "128" to 0.0078125', () => {
    expect(duration2decimal('128')).toBe(0.0078125);
  });

  it('should convert "256" to 0.00390625', () => {
    expect(duration2decimal('256')).toBe(0.00390625);
  });

  it('should convert "512" to 0.001953125', () => {
    expect(duration2decimal('512')).toBe(0.001953125);
  });

  it('should convert "1024" to 0.0009765625', () => {
    expect(duration2decimal('1024')).toBe(0.0009765625);
  });

  it('should convert "2048" to 0.00048828125', () => {
    expect(duration2decimal('2048')).toBe(0.00048828125);
  });

  it('should return 0.0 for unknown values', () => {
    expect(duration2decimal('unknown')).toBe(0.0);
    expect(duration2decimal('')).toBe(0.0);
  });
});

// ---------------------------------------------------------------------------
// getAttribute – various namespace scenarios
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// duration2word
// ---------------------------------------------------------------------------
describe('duration2word', () => {
  it('should convert numeric durations to words', () => {
    expect(duration2word('1')).toBe('whole');
    expect(duration2word('2')).toBe('half');
    expect(duration2word('4')).toBe('quarter');
    expect(duration2word('8')).toBe('eighth');
  });

  it('should keep named durations as-is', () => {
    expect(duration2word('maxima')).toBe('maxima');
    expect(duration2word('long')).toBe('long');
    expect(duration2word('breve')).toBe('breve');
  });

  it('should add suffix for larger numeric durations', () => {
    expect(duration2word('16')).toBe('16th');
    expect(duration2word('32')).toBe('32nd');
    expect(duration2word('64')).toBe('64th');
  });

  it('should return input for unknown durations', () => {
    expect(duration2word('unknown')).toBe('unknown');
  });
});

// ---------------------------------------------------------------------------
// extractAllIntegersFromString
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// pulseDuration2decimal
// ---------------------------------------------------------------------------
describe('pulseDuration2decimal', () => {
  it('should convert pulse duration to decimal based on ppq', () => {
    // 720 pulses at ppq=720 = 720/(720*4) = 0.25 (quarter note)
    expect(pulseDuration2decimal(720, 720)).toBe(0.25);
  });

  it('should convert whole note at ppq=720', () => {
    // 2880 pulses at ppq=720 = 2880/(720*4) = 1.0 (whole note)
    expect(pulseDuration2decimal(2880, 720)).toBe(1.0);
  });
});

// ---------------------------------------------------------------------------
// addToListAttribute
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// decimalDuration2HtmlUnicode
// ---------------------------------------------------------------------------
describe('decimalDuration2HtmlUnicode', () => {
  it('should map the plain note values onto their musical symbols', () => {
    expect(decimalDuration2HtmlUnicode(1.0, false)).toBe('&#119133;'); // whole
    expect(decimalDuration2HtmlUnicode(0.5, false)).toBe('&#119134;'); // half
    expect(decimalDuration2HtmlUnicode(0.25, false)).toBe('&#119135;'); // quarter
    expect(decimalDuration2HtmlUnicode(0.125, false)).toBe('&#119136;'); // eighth
    expect(decimalDuration2HtmlUnicode(0.0625, false)).toBe('&#119137;');
    expect(decimalDuration2HtmlUnicode(0.03125, false)).toBe('&#119138;');
    expect(decimalDuration2HtmlUnicode(0.015625, false)).toBe('&#119139;');
    expect(decimalDuration2HtmlUnicode(0.0078125, false)).toBe('&#119140;');
  });

  it('should map the long note values, breve upwards', () => {
    expect(decimalDuration2HtmlUnicode(2.0, false)).toBe('&#119132;');
    expect(decimalDuration2HtmlUnicode(4.0, false)).toBe('&#119223;');
    expect(decimalDuration2HtmlUnicode(8.0, false)).toBe('&#119222;');
  });

  it('should use the rest symbols when isRest is set', () => {
    expect(decimalDuration2HtmlUnicode(1.0, true)).toBe('&#119099;');
    expect(decimalDuration2HtmlUnicode(0.25, true)).toBe('&#119101;');
    expect(decimalDuration2HtmlUnicode(2.0, true)).toBe('2 &#119098;');
    expect(decimalDuration2HtmlUnicode(4.0, true)).toBe('4 &#119098;');
    expect(decimalDuration2HtmlUnicode(8.0, true)).toBe('8 &#119098;');
  });

  it('should append one dot per augmentation', () => {
    expect(decimalDuration2HtmlUnicode(0.375, false)).toBe('&#119135;.'); // dotted quarter
    expect(decimalDuration2HtmlUnicode(0.4375, false)).toBe('&#119135;..'); // double dotted quarter
    expect(decimalDuration2HtmlUnicode(0.75, false)).toBe('&#119134;.'); // dotted half
    expect(decimalDuration2HtmlUnicode(1.5, false)).toBe('&#119133;.'); // dotted whole
    expect(decimalDuration2HtmlUnicode(0.375, true)).toBe('&#119101;.'); // dotted quarter rest
  });

  it('should dot the short note values too', () => {
    expect(decimalDuration2HtmlUnicode(0.0234375, false)).toBe('&#119139;.'); // dotted 1/64
  });

  it('should not add dots below the shortest representable value', () => {
    // the dot loop stops at 1/128, so the augmentation of a 1/128 note is dropped
    expect(decimalDuration2HtmlUnicode(0.01171875, false)).toBe('&#119140;');
  });

  it('should give up below 1/128 and above a maxima', () => {
    expect(decimalDuration2HtmlUnicode(0.001, false)).toBe('note');
    expect(decimalDuration2HtmlUnicode(0.001, true)).toBe('rest');
    expect(decimalDuration2HtmlUnicode(16.0, false)).toBe('note');
    expect(decimalDuration2HtmlUnicode(16.0, true)).toBe('rest');
  });
});

// ---------------------------------------------------------------------------
// accidental conversions – the remaining cases
// ---------------------------------------------------------------------------
