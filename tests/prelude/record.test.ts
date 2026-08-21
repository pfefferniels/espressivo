/**
 * The two total-record constructors.
 *
 * These stand in for the casts they replace, so the property under test is the one a cast
 * asserts: every key of the vocabulary is present. Asserting the values would miss the point
 * — a builder that skips a key still returns the right values for the keys it did not skip,
 * and the type says nothing is missing either way.
 */
import { describe, expect, it } from 'vitest';
import { fromEntriesExact, mapValues } from '../../src/prelude/record.js';

const VOCABULARY = Object.freeze(['tempo', 'dynamics', 'rubato'] as const);
type Word = (typeof VOCABULARY)[number];

describe('fromEntriesExact', () => {
  it('produces a key for every member of the vocabulary, in its order', () => {
    const record = fromEntriesExact(VOCABULARY, (word) => word.length);
    expect(Object.keys(record)).toEqual(['tempo', 'dynamics', 'rubato']);
    expect(record).toEqual({ tempo: 5, dynamics: 8, rubato: 6 });
  });

  it('calls the value function exactly once per key, in vocabulary order', () => {
    const seen: Word[] = [];
    fromEntriesExact(VOCABULARY, (word) => {
      seen.push(word);
      return 0;
    });
    expect(seen).toEqual(['tempo', 'dynamics', 'rubato']);
  });

  it('keeps a falsy value rather than leaving the key absent', () => {
    // The failure mode a `{} as Record<…>` loop with an `if (v) out[k] = v` guard produces:
    // a key the type promises and the object does not have.
    const record = fromEntriesExact(VOCABULARY, () => 0);
    for (const word of VOCABULARY) expect(Object.hasOwn(record, word)).toBe(true);
  });

  it('allocates a fresh record per call, so two callers cannot share one', () => {
    const first = fromEntriesExact(VOCABULARY, () => 1);
    const second = fromEntriesExact(VOCABULARY, () => 1);
    expect(first).not.toBe(second);
    expect(first).toEqual(second);
  });

  it('is the empty record for an empty vocabulary, not a throw', () => {
    expect(fromEntriesExact([], () => 1)).toEqual({});
  });

  it('accepts any iterable, not only an array', () => {
    expect(fromEntriesExact(new Set(VOCABULARY), (word) => word.length)).toEqual({
      tempo: 5,
      dynamics: 8,
      rubato: 6,
    });
  });
});

describe('mapValues', () => {
  const source: Readonly<Record<Word, number>> = Object.freeze({
    tempo: 1,
    dynamics: 2,
    rubato: 3,
  });

  it('keeps every key of the source and maps every value', () => {
    expect(mapValues(source, (value) => value * 10)).toEqual({
      tempo: 10,
      dynamics: 20,
      rubato: 30,
    });
  });

  it('passes the key alongside the value', () => {
    expect(mapValues(source, (value, key) => `${key}=${String(value)}`)).toEqual({
      tempo: 'tempo=1',
      dynamics: 'dynamics=2',
      rubato: 'rubato=3',
    });
  });

  it('does not mutate or alias the source — the defensive-copy use case', () => {
    const nested: Readonly<Record<Word, { readonly n: number }>> = Object.freeze({
      tempo: { n: 1 },
      dynamics: { n: 2 },
      rubato: { n: 3 },
    });
    const copy = mapValues(nested, (value) => ({ ...value }));
    expect(copy).toEqual(nested);
    expect(copy).not.toBe(nested);
    for (const word of VOCABULARY) expect(copy[word]).not.toBe(nested[word]);
  });
});
