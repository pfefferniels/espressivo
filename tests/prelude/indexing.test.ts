import { describe, it, expect } from 'vitest';
import {
  elementAt,
  elementAtOrNull,
  optionAt,
  numberAt,
  findLast,
  removeAt,
} from '../../src/prelude/seq.js';

/**
 * The checked readers — the most-used thing in the prelude, at ~129 call sites, and until now
 * untested anywhere.
 *
 * The gap was introduced by consolidation rather than by omission: `src/comparison/indexing.ts`
 * and `src/mei/indexing.ts` were folded into `seq.ts`, and their tests went with the modules.
 * Nothing noticed, because every caller is covered by its own suite — which is exactly the
 * shape of blind spot this campaign kept finding, arriving this time in our own vocabulary.
 */
describe('elementAt', () => {
  it('returns the element at an index in range', () => {
    expect(elementAt(['a', 'b', 'c'], 1, 'letters')).toBe('b');
  });

  it('throws a RangeError naming the index, the bound and the sequence', () => {
    expect(() => elementAt(['a', 'b'], 5, 'letters')).toThrow(RangeError);
    expect(() => elementAt(['a', 'b'], 5, 'letters')).toThrow(/index 5/);
    expect(() => elementAt(['a', 'b'], 5, 'letters')).toThrow(/2 entries/);
    expect(() => elementAt(['a', 'b'], 5, 'letters')).toThrow(/letters/);
  });

  it('throws for a negative index too', () => {
    expect(() => elementAt(['a'], -1, 'letters')).toThrow(RangeError);
  });

  /**
   * The distinction that cost three red tests when this function briefly used
   * `xs[index] ?? outOfRange(...)`.
   *
   * `??` treats a null ELEMENT as a missing one. `RandomNumberProvider.series` is declared
   * `number[]` and genuinely holds `null` on a documented degenerate path, where the null
   * coerces to 0 and produces the delta-0 that `tests/comparison/imprecisionLaws.test.ts`
   * pins — so reading it as a miss and throwing broke a modelled behaviour.
   *
   * The signature's `NonNullable` constraint stops an honest caller reaching this, so the cast
   * here stands in for the type that lies about itself.
   */
  it('does not treat a null element as a missing one', () => {
    const lying = [null, 1] as unknown as number[];
    expect(elementAt(lying, 0, 'series')).toBeNull();
    expect(() => elementAt(lying, 9, 'series')).toThrow(RangeError);
  });

  it('returns falsy-but-present elements rather than throwing', () => {
    expect(elementAt([0, 1], 0, 'n')).toBe(0);
    expect(elementAt([''], 0, 's')).toBe('');
    expect(elementAt([false], 0, 'b')).toBe(false);
  });
});

describe('elementAtOrNull', () => {
  it('answers null for an index that misses, rather than throwing', () => {
    expect(elementAtOrNull(['a'], 0)).toBe('a');
    expect(elementAtOrNull(['a'], 3)).toBeNull();
    expect(elementAtOrNull([], 0)).toBeNull();
  });
});

describe('optionAt', () => {
  it('distinguishes a null element from an index that misses', () => {
    // The whole reason it exists beside elementAt: over a sequence that may legitimately hold
    // null, "there is nothing at index 1" and "index 9 is off the end" are different answers.
    const xs: readonly (string | null)[] = ['a', null];
    expect(optionAt(xs, 0, 'entries')).toBe('a');
    expect(optionAt(xs, 1, 'entries')).toBeNull();
    expect(() => optionAt(xs, 9, 'entries')).toThrow(RangeError);
    expect(() => optionAt(xs, -1, 'entries')).toThrow(RangeError);
  });
});

describe('numberAt', () => {
  it('reads a typed array, which satisfies no readonly T[] parameter', () => {
    const buffer = new Float64Array([1.5, 2.5]);
    expect(numberAt(buffer, 1, 'dp table')).toBe(2.5);
    expect(() => numberAt(buffer, 2, 'dp table')).toThrow(/dp table/);
  });

  it('reads a plain number[] used as a buffer', () => {
    expect(numberAt([7, 8], 0, 'row')).toBe(7);
  });

  it('returns a stored 0 rather than reading it as absent', () => {
    expect(numberAt(new Int32Array([0, 1]), 0, 'row')).toBe(0);
  });
});

describe('findLast', () => {
  it('returns the LAST match, not the first', () => {
    expect(findLast([1, 2, 3, 4], (n) => n % 2 === 0)).toBe(4);
  });

  it('returns null when nothing matches, and on an empty sequence', () => {
    expect(findLast([1, 3], (n) => n % 2 === 0)).toBeNull();
    expect(findLast([], () => true)).toBeNull();
  });
});

describe('removeAt', () => {
  it('removes and returns the element, mutating the array', () => {
    const xs = ['a', 'b', 'c'];
    expect(removeAt(xs, 1)).toBe('b');
    expect(xs).toEqual(['a', 'c']);
  });

  it('answers null and leaves the array alone for an index that misses', () => {
    const xs = ['a'];
    expect(removeAt(xs, 5)).toBeNull();
    expect(removeAt(xs, -1)).toBeNull();
    expect(xs).toEqual(['a']);
  });
});
