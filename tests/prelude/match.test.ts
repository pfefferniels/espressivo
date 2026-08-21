import { describe, it, expect } from 'vitest';
import { assertNever, matchKind, matchOn } from '../../src/prelude/match.js';
import { flow, identity, pipe } from '../../src/prelude/fn.js';
import { refiner, unsafeBrand, type Brand } from '../../src/prelude/newtype.js';
import { isErr, isOk } from '../../src/prelude/result.js';

type Shape =
  | { readonly kind: 'circle'; readonly r: number }
  | { readonly kind: 'rect'; readonly w: number; readonly h: number };

describe('matchKind', () => {
  it('dispatches to the handler for the arm and narrows it', () => {
    const area = (s: Shape): number =>
      matchKind(s, {
        circle: (c) => Math.PI * c.r * c.r,
        rect: (r) => r.w * r.h,
      });
    expect(area({ kind: 'rect', w: 2, h: 3 })).toBe(6);
    expect(area({ kind: 'circle', r: 1 })).toBeCloseTo(Math.PI);
  });

  it('is an expression, so every arm must produce the result', () => {
    const name = matchKind<Shape, string>(
      { kind: 'circle', r: 1 },
      { circle: () => 'circle', rect: () => 'rect' },
    );
    expect(name).toBe('circle');
  });
});

describe('matchOn', () => {
  type Event =
    | { readonly type: 'note'; readonly pitch: number }
    | { readonly type: 'rest'; readonly ticks: number };

  it('dispatches on a discriminant named something other than kind', () => {
    const describe_ = (e: Event): string =>
      matchOn(e, 'type', {
        note: (n) => `note ${n.pitch}`,
        rest: (r) => `rest ${r.ticks}`,
      });
    expect(describe_({ type: 'note', pitch: 60 })).toBe('note 60');
    expect(describe_({ type: 'rest', ticks: 4 })).toBe('rest 4');
  });
});

describe('assertNever', () => {
  it('throws when a value escapes the narrowing, naming what was unhandled', () => {
    const rogue = { kind: 'triangle' } as unknown as never;
    expect(() => assertNever(rogue, 'shape')).toThrow(/Unhandled shape/);
    expect(() => assertNever(rogue, 'shape')).toThrow(/triangle/);
  });

  it('defaults its context word', () => {
    expect(() => assertNever(1 as unknown as never)).toThrow(/Unhandled value/);
  });
});

describe('pipe and flow', () => {
  const inc = (n: number): number => n + 1;
  const double = (n: number): number => n * 2;
  const show = (n: number): string => `n=${n}`;

  it('pipe threads a value left to right', () => {
    expect(pipe(1)).toBe(1);
    expect(pipe(1, inc)).toBe(2);
    expect(pipe(1, inc, double)).toBe(4);
    expect(pipe(1, inc, double, show)).toBe('n=4');
    expect(pipe(1, inc, double, show, (s) => s.length)).toBe(3);
  });

  /**
   * The long arities exist for the render pipeline in `Performance.renderPart`, whose seven
   * stages each change the state's type. This pins them the way that pipeline needs them: the
   * chain is heterogeneous at every step, so a wrong overload would be a compile error here
   * rather than a surprise there.
   */
  it('pipe keeps inferring through a seven-function chain', () => {
    expect(pipe(1, inc, double, show, (s) => s.length, inc, double)).toBe(8);
    expect(
      pipe(
        1,
        inc,
        double,
        show,
        (s) => s.length,
        inc,
        double,
        (n) => `n=${n}`,
      ),
    ).toBe('n=8');
  });

  it('flow composes without a value, and keeps the first function’s arity', () => {
    expect(flow(inc)(1)).toBe(2);
    expect(flow(inc, double)(1)).toBe(4);
    expect(flow(inc, double, show)(1)).toBe('n=4');
    const add = (a: number, b: number): number => a + b;
    expect(flow(add, double)(1, 2)).toBe(6);
  });

  it('pipe and flow agree', () => {
    expect(pipe(3, inc, double)).toBe(flow(inc, double)(3));
  });

  it('identity returns its argument', () => {
    const o = { a: 1 };
    expect(identity(o)).toBe(o);
  });
});

describe('newtype', () => {
  type Ppq = Brand<number, 'ppq'>;
  const makePpq = refiner<number, 'ppq', string>(
    (v) => Number.isInteger(v) && v > 0,
    (v) => `ppq must be a positive integer, got ${v}`,
  );

  it('a refiner accepts a value that satisfies the predicate', () => {
    const r = makePpq(720);
    expect(isOk(r)).toBe(true);
    if (isOk(r)) {
      const ppq: Ppq = r.value;
      expect(ppq).toBe(720);
    }
  });

  it('a refiner rejects one that does not, with the reason', () => {
    for (const bad of [0, -1, 1.5, NaN, Infinity]) {
      const r = makePpq(bad);
      expect(isErr(r)).toBe(true);
      if (isErr(r)) expect(r.error).toContain('positive integer');
    }
  });

  it('a branded value is still its base value at runtime', () => {
    const r = makePpq(480);
    if (isOk(r)) expect(r.value + 1).toBe(481);
  });

  it('unsafeBrand applies the brand without checking, as documented', () => {
    const ppq = unsafeBrand<number, 'ppq'>(-3);
    expect(ppq).toBe(-3);
  });
});
