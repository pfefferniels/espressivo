import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { InstrumentsDictionary } from '../../src/midi/InstrumentsDictionary.js';

// getProgramChange() reports every lookup on stdout (Java: InstrumentsDictionary.java:157/168).
// That is expected behaviour, but it drowns the test output, so it is muted here.
let logSpy: ReturnType<typeof vi.spyOn>;
beforeAll(() => {
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
});
afterAll(() => {
  logSpy.mockRestore();
});

// The dictionary is expensive to build (838 entries), so it is shared across the tests.
// Java rebuilds it per instance too; nothing in getProgramChange() mutates it.
const dict = new InstrumentsDictionary();

describe('InstrumentsDictionary.DefaultNames', () => {
  it('should list exactly the 128 General MIDI programs', () => {
    expect(InstrumentsDictionary.DefaultNames.length).toBe(128);
  });

  it('should map the well-known GM program numbers to their names', () => {
    expect(InstrumentsDictionary.DefaultNames[0]).toBe('Acoustic Grand Piano');
    expect(InstrumentsDictionary.DefaultNames[6]).toBe('Harpsichord');
    expect(InstrumentsDictionary.DefaultNames[40]).toBe('Violin');
    expect(InstrumentsDictionary.DefaultNames[56]).toBe('Trumpet');
    expect(InstrumentsDictionary.DefaultNames[73]).toBe('Flute');
    expect(InstrumentsDictionary.DefaultNames[127]).toBe('Gunshot');
  });
});

describe('InstrumentsDictionary – distance method constants', () => {
  it('should number the distance methods 0x00..0x0A as in Java', () => {
    expect(InstrumentsDictionary.Levenshtein).toBe(0x00);
    expect(InstrumentsDictionary.NormalizedLevenshtein).toBe(0x01);
    expect(InstrumentsDictionary.Damerau).toBe(0x02);
    expect(InstrumentsDictionary.JaroWinkler).toBe(0x03);
    expect(InstrumentsDictionary.LongestCommonSubsequence).toBe(0x04);
    expect(InstrumentsDictionary.MetricLCS).toBe(0x05);
    expect(InstrumentsDictionary.NGram).toBe(0x06);
    expect(InstrumentsDictionary.QGram).toBe(0x07);
    expect(InstrumentsDictionary.Cosine).toBe(0x08);
    expect(InstrumentsDictionary.Jaccard).toBe(0x09);
    expect(InstrumentsDictionary.SorensenDice).toBe(0x0a);
  });
});

describe('InstrumentsDictionary.getProgramChange – exact matches', () => {
  it('should return 0 (Acoustic Grand Piano) for an empty name', () => {
    expect(dict.getProgramChange('')).toBe(0);
  });

  it('should resolve the canonical English GM names', () => {
    expect(dict.getProgramChange('Acoustic Grand Piano')).toBe(0);
    expect(dict.getProgramChange('Harpsichord')).toBe(6);
    expect(dict.getProgramChange('Violin')).toBe(40);
    expect(dict.getProgramChange('Viola')).toBe(41);
    expect(dict.getProgramChange('Trumpet')).toBe(56);
    expect(dict.getProgramChange('Flute')).toBe(73);
  });

  it('should ignore case, because both sides are lower-cased before comparison', () => {
    expect(dict.getProgramChange('VIOLIN')).toBe(40);
    expect(dict.getProgramChange('violin')).toBe(40);
    expect(dict.getProgramChange('ViOlIn')).toBe(40);
  });

  it('should resolve the German synonyms that the dictionary adds beyond GM', () => {
    expect(dict.getProgramChange('Geige')).toBe(40);
    expect(dict.getProgramChange('Bratsche')).toBe(41);
    expect(dict.getProgramChange('Kontrabass')).toBe(43);
    expect(dict.getProgramChange('Cembalo')).toBe(6);
    expect(dict.getProgramChange('Klavier')).toBe(0);
    expect(dict.getProgramChange('Waldhorn')).toBe(60);
  });

  it('should resolve entries with non-ASCII characters', () => {
    expect(dict.getProgramChange('Flöte')).toBe(73);
    expect(dict.getProgramChange('Flügel')).toBe(0);
  });
});

describe('InstrumentsDictionary.getProgramChange – fuzzy matches', () => {
  it('should resolve a transposing instrument name with its key suffix', () => {
    // "klarinette in b" is not a dictionary key, but "klarinette in" is
    expect(dict.getProgramChange('Klarinette in B')).toBe(71);
    expect(dict.getProgramChange('Trompete in C')).toBe(56);
    expect(dict.getProgramChange('Horn in F')).toBe(60);
  });

  it('should tolerate a typo', () => {
    expect(dict.getProgramChange('Violine')).toBe(40);
    expect(dict.getProgramChange('Violn')).toBe(40);
    expect(dict.getProgramChange('Trumpett')).toBe(56);
  });

  it('should still return a valid program number for a name it cannot match', () => {
    const pc = dict.getProgramChange('zzzzzzzz');
    expect(pc).toBeGreaterThanOrEqual(0);
    expect(pc).toBeLessThanOrEqual(127);
  });
});

describe('InstrumentsDictionary.getProgramChange – distance methods', () => {
  const methods: [string, number][] = [
    ['Levenshtein', InstrumentsDictionary.Levenshtein],
    ['NormalizedLevenshtein', InstrumentsDictionary.NormalizedLevenshtein],
    ['Damerau', InstrumentsDictionary.Damerau],
    ['JaroWinkler', InstrumentsDictionary.JaroWinkler],
    ['LongestCommonSubsequence', InstrumentsDictionary.LongestCommonSubsequence],
    ['MetricLCS', InstrumentsDictionary.MetricLCS],
    ['NGram', InstrumentsDictionary.NGram],
    ['QGram', InstrumentsDictionary.QGram],
    ['Cosine', InstrumentsDictionary.Cosine],
    ['Jaccard', InstrumentsDictionary.Jaccard],
    ['SorensenDice', InstrumentsDictionary.SorensenDice],
  ];

  it.each(methods)('%s should short-circuit on an exact dictionary hit', (_name, method) => {
    // A distance of 0 returns immediately (Java: InstrumentsDictionary.java:155-159), so
    // every metric has to agree on names that are dictionary keys.
    expect(dict.getProgramChange('violin', method)).toBe(40);
    expect(dict.getProgramChange('harpsichord', method)).toBe(6);
  });

  it.each(methods)('%s should stay within the valid program change range', (_name, method) => {
    const pc = dict.getProgramChange('Klarinette in B', method);
    expect(Number.isInteger(pc)).toBe(true);
    expect(pc).toBeGreaterThanOrEqual(0);
    expect(pc).toBeLessThanOrEqual(127);
  });

  it('should fall back to Normalized Levenshtein for an unknown method id', () => {
    // Java: the default branch of the switch, InstrumentsDictionary.java:150-152
    const fallback = dict.getProgramChange('Klarinett', 99);
    expect(fallback).toBe(
      dict.getProgramChange('Klarinett', InstrumentsDictionary.NormalizedLevenshtein),
    );
  });

  it('should default to Normalized Levenshtein when no method is given', () => {
    // Java: getProgramChange(String) delegates with NormalizedLevenshtein,
    // InstrumentsDictionary.java:93-95
    expect(dict.getProgramChange('Flauto traverso')).toBe(
      dict.getProgramChange('Flauto traverso', InstrumentsDictionary.NormalizedLevenshtein),
    );
  });

  it('should let length normalisation change the outcome on a partial match', () => {
    // "flauto traverso" is no dictionary key. Raw Levenshtein has no length
    // normalisation and therefore prefers a same-length key over the "flauto"
    // prefix, whereas the token/set based metrics settle on Flute (73).
    const raw = dict.getProgramChange('Flauto traverso', InstrumentsDictionary.Levenshtein);
    const cosine = dict.getProgramChange('Flauto traverso', InstrumentsDictionary.Cosine);
    const jaccard = dict.getProgramChange('Flauto traverso', InstrumentsDictionary.Jaccard);
    const sorensen = dict.getProgramChange('Flauto traverso', InstrumentsDictionary.SorensenDice);

    expect(cosine).toBe(73);
    expect(jaccard).toBe(73);
    expect(sorensen).toBe(73);
    expect(raw).not.toBe(cosine);
  });

  it('should treat a transposition as one edit under Damerau but two under Levenshtein', () => {
    // "vioiln" is "violin" with the last two characters swapped
    expect(dict.getProgramChange('vioiln', InstrumentsDictionary.Damerau)).toBe(40);
    expect(dict.getProgramChange('vioiln', InstrumentsDictionary.Levenshtein)).toBe(40);

    // "vioiln" alone does not separate the metrics: both assertions above stay green with
    // the transposition rule deleted from `damerauLevenshteinDistance` entirely — measured
    // as a control, whole suite green. "vioal" is "viola" with its last two characters
    // swapped: one edit for Damerau, which lands on Viola (41), and two for plain
    // Levenshtein, which prefers Cello (42) at the same cost and earlier in the table.
    expect(dict.getProgramChange('vioal', InstrumentsDictionary.Damerau)).toBe(41);
    expect(dict.getProgramChange('vioal', InstrumentsDictionary.Levenshtein)).toBe(42);
  });

  // The two LCS metrics share one `lcsLength` helper. Every other assertion about them is
  // either an exact dictionary hit (distance 0, which returns before the recurrence
  // matters) or a range check, so replacing its `Math.max` with `Math.min` also left the
  // suite green — measured. A transposed tail is the cheapest input that makes the
  // subsequence length decide the answer.
  it('should match on the longest common subsequence, not merely on a common one', () => {
    expect(
      dict.getProgramChange('acoustic grand piaon', InstrumentsDictionary.LongestCommonSubsequence),
    ).toBe(0);
    expect(dict.getProgramChange('acoustic grand piaon', InstrumentsDictionary.MetricLCS)).toBe(0);

    // A prefix of a key, where the metric has to see the ten shared characters rather than
    // stop at the first mismatch.
    expect(
      dict.getProgramChange('acoustic g', InstrumentsDictionary.LongestCommonSubsequence),
    ).toBe(0);
    expect(dict.getProgramChange('acoustic g', InstrumentsDictionary.MetricLCS)).toBe(0);
  });
});

describe('InstrumentsDictionary.getInstrumentName', () => {
  it('should return the GM default name when useGmDefaultNames is set', () => {
    expect(InstrumentsDictionary.getInstrumentName(0, true)).toBe('Acoustic Grand Piano');
    expect(InstrumentsDictionary.getInstrumentName(40, true)).toBe('Violin');
    expect(InstrumentsDictionary.getInstrumentName(127, true)).toBe('Gunshot');
  });

  it('should take the name from the dictionary by default', () => {
    // dictionary keys are stored lower case (Java: dict.put(line.toLowerCase(), pc))
    expect(InstrumentsDictionary.getInstrumentName(0)).toBe('acoustic grand piano');
    expect(InstrumentsDictionary.getInstrumentName(40)).toBe('violin');
    expect(InstrumentsDictionary.getInstrumentName(6)).toBe('harpsichord');
  });

  it('should return names that map back onto the same program change number', () => {
    for (const pc of [0, 6, 40, 41, 42, 43, 56, 60, 71, 73, 127]) {
      const name = InstrumentsDictionary.getInstrumentName(pc);
      expect(name).not.toBe('');
      expect(dict.getProgramChange(name)).toBe(pc);
    }
  });

  it('should cover every one of the 128 program change numbers', () => {
    for (let pc = 0; pc < 128; ++pc) {
      expect(InstrumentsDictionary.getInstrumentName(pc)).not.toBe('');
    }
  });

  it('should return an empty string for a number that is not in the dictionary', () => {
    expect(InstrumentsDictionary.getInstrumentName(200)).toBe('');
  });

  // `DefaultNames[200]` is `undefined`, so the GM path has to answer for out-of-range
  // numbers itself to keep the `string` return type honest. Both paths return '', which is
  // what the dictionary-less fallback needs — it takes the GM name for any program number.
  it('should return an empty string for an out-of-range number under GM names too', () => {
    expect(InstrumentsDictionary.getInstrumentName(200, true)).toBe('');
    expect(InstrumentsDictionary.getInstrumentName(-1, true)).toBe('');
    expect(InstrumentsDictionary.getInstrumentName(127, true)).toBe('Gunshot');
  });
});
