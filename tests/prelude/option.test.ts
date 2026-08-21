import { describe, it, expect } from 'vitest';
import {
  bothPresent,
  compact,
  firstPresent,
  flatMapPresent,
  isAbsent,
  isPresent,
  keepIf,
  mapPresent,
  normalize,
  orCompute,
  orDefault,
  presentOrError,
} from '../../src/prelude/option.js';
import { isErr, isOk } from '../../src/prelude/result.js';

describe('presence tests', () => {
  it('isPresent and isAbsent narrow a nullable', () => {
    const x: string | null = 'a';
    expect(isPresent(x)).toBe(true);
    expect(isAbsent(x)).toBe(false);
    if (isPresent(x)) expect(x.length).toBe(1);
    expect(isPresent(null)).toBe(false);
    expect(isAbsent(null)).toBe(true);
  });

  it('treats falsy-but-present values as present', () => {
    // The bug `if (x)` has and `if (x !== null)` does not.
    expect(isPresent(0)).toBe(true);
    expect(isPresent('')).toBe(true);
    expect(isPresent(false)).toBe(true);
    expect(isPresent(NaN)).toBe(true);
  });

  it('does not treat undefined as absent', () => {
    // RULE N1: null is domain absence, undefined is "not supplied". Only `normalize`
    // is allowed to conflate them.
    expect(isPresent(undefined as unknown as string | null)).toBe(true);
    expect(normalize(undefined)).toBeNull();
    expect(normalize(null)).toBeNull();
    expect(normalize(0)).toBe(0);
  });
});

describe('mapping over presence', () => {
  it('mapPresent applies f only when there is a value', () => {
    expect(mapPresent('ab', (s) => s.length)).toBe(2);
    expect(mapPresent<string, number>(null, (s) => s.length)).toBeNull();
  });

  it('mapPresent does not call f on absence', () => {
    let calls = 0;
    mapPresent<string, number>(null, () => ++calls);
    expect(calls).toBe(0);
  });

  it('flatMapPresent flattens one level', () => {
    expect(flatMapPresent('ab', (s) => (s.length > 1 ? s : null))).toBe('ab');
    expect(flatMapPresent('a', (s) => (s.length > 1 ? s : null))).toBeNull();
    expect(flatMapPresent<string, string>(null, (s) => s)).toBeNull();
  });

  it('keepIf drops a value that fails the predicate', () => {
    expect(keepIf(4, (n) => n % 2 === 0)).toBe(4);
    expect(keepIf(5, (n) => n % 2 === 0)).toBeNull();
    expect(keepIf<number>(null, () => true)).toBeNull();
  });
});

describe('defaults and choice', () => {
  it('orDefault and orCompute supply a fallback only for absence', () => {
    expect(orDefault(1, 9)).toBe(1);
    expect(orDefault<number>(null, 9)).toBe(9);
    expect(orDefault(0, 9)).toBe(0);
    expect(orCompute<number>(null, () => 9)).toBe(9);
  });

  it('orCompute does not evaluate the fallback when there is a value', () => {
    let calls = 0;
    expect(
      orCompute(1, () => {
        calls += 1;
        return 9;
      }),
    ).toBe(1);
    expect(calls).toBe(0);
  });

  it('firstPresent returns the first non-null argument', () => {
    expect(firstPresent(null, null, 'c', 'd')).toBe('c');
    expect(firstPresent<string>(null, null)).toBeNull();
    expect(firstPresent<number>(null, 0, 1)).toBe(0);
    expect(firstPresent<number>()).toBeNull();
  });

  it('bothPresent gives a pair only when neither side is absent', () => {
    expect(bothPresent(1, 'a')).toEqual([1, 'a']);
    expect(bothPresent<number, string>(null, 'a')).toBeNull();
    expect(bothPresent<number, string>(1, null)).toBeNull();
  });
});

describe('compact', () => {
  it('drops absent elements and keeps order', () => {
    expect(compact([1, null, 2, null, 3])).toEqual([1, 2, 3]);
  });

  it('keeps falsy-but-present elements', () => {
    expect(compact([0, null, '', false])).toEqual([0, '', false]);
  });

  it('accepts any iterable', () => {
    expect(compact(new Set([1, null, 2]))).toEqual([1, 2]);
  });
});

describe('presentOrError', () => {
  it('turns a value into a success', () => {
    const r = presentOrError('x', () => 'missing');
    expect(isOk(r)).toBe(true);
  });

  it('turns absence into an explained failure', () => {
    const r = presentOrError<string, string>(null, () => 'missing dated');
    expect(isErr(r)).toBe(true);
    if (isErr(r)) expect(r.error).toBe('missing dated');
  });

  it('does not build the error when there is a value', () => {
    let calls = 0;
    presentOrError('x', () => {
      calls += 1;
      return 'e';
    });
    expect(calls).toBe(0);
  });
});
