import { describe, it, expect } from 'vitest';
import {
  chunkBy,
  filterMap,
  foldl,
  groupBy,
  head,
  insertionIndexBy,
  isNonEmpty,
  last,
  lowerBoundBy,
  pairwise,
  partitionPoint,
  partitionWith,
  scanl,
  stableSortBy,
  unfold,
  upperBoundBy,
  windows,
  withNext,
  zipWith,
} from '../../src/prelude/seq.js';

describe('NonEmptyArray', () => {
  it('isNonEmpty narrows so head and last need no null check', () => {
    const xs: readonly number[] = [1, 2, 3];
    expect(isNonEmpty(xs)).toBe(true);
    if (isNonEmpty(xs)) {
      expect(head(xs)).toBe(1);
      expect(last(xs)).toBe(3);
    }
    expect(isNonEmpty([])).toBe(false);
  });

  it('head and last agree on a single element', () => {
    expect(head([7])).toBe(7);
    expect(last([7])).toBe(7);
  });
});

describe('filterMap', () => {
  it('maps and filters in one pass', () => {
    expect(filterMap(['1', 'x', '3'], (s) => (Number.isNaN(Number(s)) ? null : Number(s)))).toEqual(
      [1, 3],
    );
  });

  it('passes the index', () => {
    expect(filterMap(['a', 'b', 'c'], (s, i) => (i % 2 === 0 ? `${s}${i}` : null))).toEqual([
      'a0',
      'c2',
    ]);
  });

  it('keeps falsy-but-present results, dropping only null', () => {
    expect(filterMap([1, 2, 3], (n) => (n === 2 ? null : n - 1))).toEqual([0, 2]);
  });

  it('accepts any iterable', () => {
    expect(filterMap(new Set([1, 2, 3]), (n) => (n > 1 ? n : null))).toEqual([2, 3]);
  });
});

describe('partitionWith, groupBy, chunkBy', () => {
  it('partitionWith keeps both halves in order', () => {
    const { yes, no } = partitionWith([1, 2, 3, 4, 5], (n) => n % 2 === 1);
    expect(yes).toEqual([1, 3, 5]);
    expect(no).toEqual([2, 4]);
  });

  it('groupBy buckets by key, preserving encounter order inside a bucket', () => {
    const g = groupBy(['apple', 'avocado', 'beet'], (s) => s[0]);
    expect(g.get('a')).toEqual(['apple', 'avocado']);
    expect(g.get('b')).toEqual(['beet']);
    expect(g.size).toBe(2);
  });

  it('chunkBy splits into consecutive runs, not global buckets', () => {
    // The difference from groupBy that matters for a date-sorted instruction list.
    expect(chunkBy([1, 1, 2, 2, 1], (n) => n)).toEqual([[1, 1], [2, 2], [1]]);
    expect(groupBy([1, 1, 2, 2, 1], (n) => n).get(1)).toEqual([1, 1, 1]);
  });

  it('chunkBy of an empty sequence is empty', () => {
    expect(chunkBy([], (n) => n)).toEqual([]);
  });
});

describe('folds', () => {
  it('foldl accumulates left to right with the index', () => {
    expect(foldl([1, 2, 3], 0, (acc, n) => acc + n)).toBe(6);
    expect(foldl(['a', 'b'], '', (acc, s, i) => `${acc}${i}${s}`)).toBe('0a1b');
  });

  it('foldl of an empty sequence is the seed', () => {
    expect(foldl([], 'seed', () => 'other')).toBe('seed');
  });

  it('scanl keeps every intermediate state, seed first', () => {
    expect(scanl([1, 2, 3], 0, (acc, n) => acc + n)).toEqual([0, 1, 3, 6]);
  });

  it('scanl of an empty sequence is just the seed', () => {
    expect(scanl([], 5, (acc: number) => acc)).toEqual([5]);
  });

  it("scanl's last state equals foldl", () => {
    const step = (acc: number, n: number): number => acc * 2 + n;
    const states = scanl([1, 2, 3, 4], 1, step);
    expect(last(states)).toBe(foldl([1, 2, 3, 4], 1, step));
  });
});

describe('zipWith, pairwise, windows, unfold', () => {
  it('zipWith stops at the shorter sequence', () => {
    expect(zipWith([1, 2, 3], ['a', 'b'], (n, s) => `${n}${s}`)).toEqual(['1a', '2b']);
    expect(zipWith([], [1], () => 0)).toEqual([]);
  });

  it('pairwise gives each element with its successor', () => {
    expect(pairwise([1, 2, 3])).toEqual([
      [1, 2],
      [2, 3],
    ]);
  });

  it('pairwise of fewer than two elements is empty', () => {
    expect(pairwise([1])).toEqual([]);
    expect(pairwise([])).toEqual([]);
  });

  it('withNext keeps the LAST element, paired with null — the whole difference from pairwise', () => {
    expect(withNext([1, 2, 3])).toEqual([
      [1, 2],
      [2, 3],
      [3, null],
    ]);
    // Stated as the contrast, because it is the reason `withNext` exists: nine span readers
    // needed n pairs and `pairwise` gives n − 1.
    expect(withNext([1, 2, 3])).toHaveLength(3);
    expect(pairwise([1, 2, 3])).toHaveLength(2);
  });

  it('withNext of one element is that element with null; of none, nothing', () => {
    expect(withNext([1])).toEqual([[1, null]]);
    expect(withNext([])).toEqual([]);
  });

  it('withNext distinguishes a null ELEMENT from the end of the sequence', () => {
    // A sequence may legitimately hold nulls. Only the tail pairing is manufactured, and a
    // reader that collapsed the two would end a span early on such a sequence.
    expect(withNext([1, null, 3])).toEqual([
      [1, null],
      [null, 3],
      [3, null],
    ]);
  });

  it('withNext does not mutate or alias its input', () => {
    const xs = [1, 2, 3];
    const out = withNext(xs);
    expect(xs).toEqual([1, 2, 3]);
    // Each pair is its own tuple, so a caller cannot reach the source array through one.
    expect(out.map((pair) => pair[0])).toEqual(xs);
  });

  it('windows gives overlapping slices and nothing when too short', () => {
    expect(windows([1, 2, 3, 4], 2)).toEqual([
      [1, 2],
      [2, 3],
      [3, 4],
    ]);
    expect(windows([1, 2], 3)).toEqual([]);
    expect(windows([1, 2], 0)).toEqual([]);
    expect(windows([1, 2], -1)).toEqual([]);
  });

  it('unfold builds until the step returns null', () => {
    expect(unfold(1, (n) => (n > 4 ? null : [n, n + 1]))).toEqual([1, 2, 3, 4]);
    expect(unfold(9, (n) => (n > 4 ? null : [n, n + 1]))).toEqual([]);
  });
});

describe('stableSortBy', () => {
  it('does not mutate its input', () => {
    const xs = [3, 1, 2];
    const sorted = stableSortBy(xs, (a, b) => a - b);
    expect(sorted).toEqual([1, 2, 3]);
    expect(xs).toEqual([3, 1, 2]);
  });

  it('keeps equal elements in their original order', () => {
    const xs = [
      { k: 1, tag: 'first' },
      { k: 0, tag: 'x' },
      { k: 1, tag: 'second' },
    ];
    const sorted = stableSortBy(xs, (a, b) => a.k - b.k);
    expect(sorted.map((e) => e.tag)).toEqual(['x', 'first', 'second']);
  });
});

// ---------------------------------------------------------------------------
// Ordered lookup — the replacement for GenericMap's four hand-written binary
// searches. Each is defined here in terms of the two primitives, and checked
// against a brute-force linear scan over pseudo-random data. The four Java-ported
// originals carry a comment saying every comparison in them is load-bearing;
// this is the evidence that the two-primitive form means the same thing.
// ---------------------------------------------------------------------------
describe('partitionPoint and the bounds', () => {
  it('partitionPoint finds where a monotone predicate stops holding', () => {
    const xs = [1, 3, 5, 7];
    expect(partitionPoint(xs.length, (i) => xs[i] < 5)).toBe(2);
    expect(partitionPoint(xs.length, () => true)).toBe(4);
    expect(partitionPoint(xs.length, () => false)).toBe(0);
    expect(partitionPoint(0, () => true)).toBe(0);
  });

  it('lowerBoundBy and upperBoundBy bracket a run of equal keys', () => {
    const xs = [{ d: 1 }, { d: 2 }, { d: 2 }, { d: 3 }];
    const key = (e: { d: number }): number => e.d;
    expect(lowerBoundBy(xs, key, 2)).toBe(1);
    expect(upperBoundBy(xs, key, 2)).toBe(3);
    expect(lowerBoundBy(xs, key, 0)).toBe(0);
    expect(upperBoundBy(xs, key, 9)).toBe(4);
  });

  it('insertionIndexBy places a new element after its equals, as a stable sort would', () => {
    const xs = [{ d: 1 }, { d: 2 }, { d: 2 }, { d: 3 }];
    expect(insertionIndexBy(xs, (e) => e.d, 2)).toBe(3);
    expect(insertionIndexBy(xs, (e) => e.d, 0)).toBe(0);
    expect(insertionIndexBy(xs, (e) => e.d, 4)).toBe(4);
  });

  it('reproduces GenericMap’s four searches over 2000 random cases', () => {
    const key = (e: { d: number }): number => e.d;

    // The four semantics, as GenericMap documents them, in terms of the primitives.
    const indexBeforeAt = (xs: readonly { d: number }[], t: number): number =>
      upperBoundBy(xs, key, t) - 1; // last with date <= t
    const indexBefore = (xs: readonly { d: number }[], t: number): number =>
      lowerBoundBy(xs, key, t) - 1; // last with date < t
    const indexAfter = (xs: readonly { d: number }[], t: number): number => {
      const i = upperBoundBy(xs, key, t); // first with date > t
      return i === xs.length ? -1 : i;
    };
    const indexAtAfter = (xs: readonly { d: number }[], t: number): number => {
      const i = lowerBoundBy(xs, key, t); // first with date >= t
      return i === xs.length ? -1 : i;
    };

    // Brute force, independently written.
    const scanLast = (xs: readonly { d: number }[], p: (d: number) => boolean): number => {
      let found = -1;
      for (let i = 0; i < xs.length; ++i) if (p(xs[i].d)) found = i;
      return found;
    };
    const scanFirst = (xs: readonly { d: number }[], p: (d: number) => boolean): number => {
      for (let i = 0; i < xs.length; ++i) if (p(xs[i].d)) return i;
      return -1;
    };

    // Deterministic LCG so a failure is reproducible.
    let seed = 12345;
    const next = (): number => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;

    for (let trial = 0; trial < 2000; ++trial) {
      const n = Math.floor(next() * 8);
      // Small key range, so ties and misses are common rather than rare.
      const dates = Array.from({ length: n }, () => Math.floor(next() * 6)).sort((a, b) => a - b);
      const xs = dates.map((d) => ({ d }));
      const t = Math.floor(next() * 8) - 1;

      expect(indexBeforeAt(xs, t)).toBe(scanLast(xs, (d) => d <= t));
      expect(indexBefore(xs, t)).toBe(scanLast(xs, (d) => d < t));
      expect(indexAfter(xs, t)).toBe(scanFirst(xs, (d) => d > t));
      expect(indexAtAfter(xs, t)).toBe(scanFirst(xs, (d) => d >= t));
    }
  });
});
