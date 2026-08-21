import { describe, it, expect } from 'vitest';
import {
  andThen,
  attempt,
  collect,
  err,
  isErr,
  isOk,
  mapErr,
  mapOk,
  matchResult,
  ok,
  partitionResults,
  recover,
  sequence,
  traverse,
  unwrapOr,
  unwrapOrElse,
  type Result,
} from '../../src/prelude/result.js';

describe('Result construction and interrogation', () => {
  it('ok and err build the two arms with the discriminant set', () => {
    expect(ok(3)).toEqual({ ok: true, value: 3 });
    expect(err('nope')).toEqual({ ok: false, error: 'nope' });
  });

  it('isOk and isErr narrow', () => {
    const r: Result<number, string> = ok(1);
    expect(isOk(r)).toBe(true);
    expect(isErr(r)).toBe(false);
    if (isOk(r)) expect(r.value).toBe(1);

    const e: Result<number, string> = err('bad');
    expect(isOk(e)).toBe(false);
    expect(isErr(e)).toBe(true);
    if (isErr(e)) expect(e.error).toBe('bad');
  });

  it('carries a null value without collapsing into the failure arm', () => {
    // The whole point of Result over `T | null`: a successful "there is nothing here"
    // is distinguishable from a failure.
    const r: Result<number | null, string> = ok(null);
    expect(isOk(r)).toBe(true);
    expect(unwrapOr(r, 7)).toBeNull();
  });
});

// A `const r: Result<A, E> = ok(1)` is narrowed by the compiler to `Ok<A>`, which is
// correct and makes `ErrOf<typeof r>` be `never`. These helpers hand the combinators a
// value whose static type really is the union, which is the interesting case.
const okOf = (n: number): Result<number, string> => ok(n);
const errOf = (e: string): Result<number, string> => err(e);

describe('Result mapping', () => {
  it('mapOk transforms the value and leaves a failure alone', () => {
    expect(mapOk(okOf(2), (n) => n * 3)).toEqual(ok(6));
    const e = errOf('bad');
    expect(mapOk(e, (n) => n * 3)).toBe(e);
  });

  it('infers the callback parameter from a union-typed result without annotation', () => {
    // Regression guard for the reason the signatures use OkOf/ErrOf rather than
    // `Result<A, E>`: with the naive signature both of these callbacks receive `unknown`.
    expect(mapOk(okOf(2), (n) => n.toFixed(1))).toEqual(ok('2.0'));
    expect(mapErr(errOf('bad'), (s) => s.toUpperCase())).toEqual(err('BAD'));
  });

  it('mapErr transforms the error and leaves a success alone', () => {
    expect(mapErr(errOf('bad'), (s) => s.toUpperCase())).toEqual(err('BAD'));
    const o = okOf(2);
    expect(mapErr(o, (s) => s.toUpperCase())).toBe(o);
  });

  it('mapOk does not call f on a failure', () => {
    let calls = 0;
    mapErr(ok(1), () => {
      calls += 1;
      return 'x';
    });
    mapOk(errOf('bad'), () => {
      calls += 1;
      return 1;
    });
    expect(calls).toBe(0);
  });
});

describe('Result sequencing', () => {
  it('andThen chains and short-circuits on the first failure', () => {
    const half = (n: number): Result<number, string> =>
      n % 2 === 0 ? ok(n / 2) : err(`${n} is odd`);
    expect(andThen(ok(8), half)).toEqual(ok(4));
    expect(andThen(ok(7), half)).toEqual(err('7 is odd'));
    expect(andThen(errOf('earlier'), half)).toEqual(err('earlier'));
  });

  it('recover replaces a failure and leaves a success alone', () => {
    expect(recover(err('bad'), () => ok(0))).toEqual(ok(0));
    expect(recover(ok(5), () => ok(0))).toEqual(ok(5));
    expect(recover(err('bad'), (e) => err(`${e}!`))).toEqual(err('bad!'));
  });

  it('unwrapOr and unwrapOrElse supply a fallback only on failure', () => {
    expect(unwrapOr(ok(1), 9)).toBe(1);
    expect(unwrapOr(errOf('bad'), 9)).toBe(9);
    expect(unwrapOrElse(ok(1), () => 9)).toBe(1);
    expect(unwrapOrElse(err('bad'), (e) => e.length)).toBe(3);
  });

  it('matchResult collapses both arms', () => {
    const describe_ = (r: Result<number, string>): string =>
      matchResult(r, { ok: (n) => `got ${n}`, err: (e) => `failed: ${e}` });
    expect(describe_(ok(4))).toBe('got 4');
    expect(describe_(err('nope'))).toBe('failed: nope');
  });
});

describe('Result over collections', () => {
  const parse = (s: string): Result<number, string> => {
    const n = Number(s);
    return Number.isNaN(n) ? err(`not a number: ${s}`) : ok(n);
  };

  it('traverse collects every value, or stops at the first failure', () => {
    expect(traverse(['1', '2', '3'], parse)).toEqual(ok([1, 2, 3]));
    expect(traverse(['1', 'x', 'y'], parse)).toEqual(err('not a number: x'));
  });

  it('traverse passes the index and stops evaluating after a failure', () => {
    const seen: number[] = [];
    traverse(['1', 'x', '3'], (s, i) => {
      seen.push(i);
      return parse(s);
    });
    expect(seen).toEqual([0, 1]);
  });

  it('traverse of an empty sequence succeeds with nothing', () => {
    expect(traverse([], parse)).toEqual(ok([]));
  });

  it('sequence is traverse with the function already applied', () => {
    expect(sequence([ok(1), ok(2)])).toEqual(ok([1, 2]));
    expect(sequence([ok(1), err('bad'), ok(3)])).toEqual(err('bad'));
  });

  it('partitionResults keeps both halves', () => {
    const { values, errors } = partitionResults([ok(1), err('a'), ok(2), err('b')]);
    expect(values).toEqual([1, 2]);
    expect(errors).toEqual(['a', 'b']);
  });

  it('collect accumulates every error rather than the first', () => {
    expect(collect(['1', '2'], parse)).toEqual(ok([1, 2]));
    expect(collect(['x', '2', 'y'], parse)).toEqual(err(['not a number: x', 'not a number: y']));
  });

  it('collect differs from traverse exactly in reporting every failure', () => {
    const inputs = ['x', 'y'];
    expect(traverse(inputs, parse)).toEqual(err('not a number: x'));
    expect(collect(inputs, parse)).toEqual(err(['not a number: x', 'not a number: y']));
  });
});

describe('attempt', () => {
  it('captures a return value', () => {
    expect(attempt(() => 42)).toEqual(ok(42));
  });

  it('captures a throw as a value without rethrowing', () => {
    const boom = new Error('boom');
    const r = attempt(() => {
      throw boom;
    });
    expect(isErr(r)).toBe(true);
    if (isErr(r)) expect(r.error).toBe(boom);
  });

  it('captures a non-Error throw unchanged', () => {
    const r = attempt(() => {
      throw 'a string';
    });
    expect(r).toEqual(err('a string'));
  });
});
