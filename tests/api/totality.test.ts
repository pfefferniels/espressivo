/**
 * RULE E4's totality obligation, as a property rather than as a list of cases.
 *
 * The rule says the facade validates domains and not types, and that this is affordable only
 * because the domain predicates are total. The part that is NOT free is a check that reads a
 * field: `window.start` on a non-object faults before the domain row runs, and what escapes is
 * a raw `TypeError` rather than one of the classes. Before the rule existed, all nine nested
 * option objects on the comparison surface did exactly that on `null`.
 *
 * So this sweeps every option field that is declared as an object or a list with the values an
 * untyped caller actually produces, and asserts only that what comes back is a `MeicoError`.
 * It deliberately does not pin WHICH class or which sentence — that is `comparison-facade`'s
 * validation table, and pinning it twice would make one file's message a second file's problem.
 */
import { describe, it, expect } from 'vitest';
import {
  MeicoError,
  compareMpm,
  compareMpmCorpus,
  diffMpm,
  exaggerateMpm,
  neutralMpm,
  spotlightMpm,
} from '../../src/api/index.js';

const MPM = neutralMpm();

/**
 * What a JavaScript caller hands over where a `.d.ts` says "object". `undefined` is absent and
 * legal everywhere here, so it is not in the sweep; `null` is the one that matters, because it
 * is what `JSON.parse`, a database column and an unset form field all produce.
 */
const NOT_AN_OBJECT = [null, 0, 1, '', 'nope', true, false, NaN] as const;

/** Run `call` for every hostile value and report the ones that escaped as a raw error. */
function escapes(call: (value: unknown) => unknown): readonly string[] {
  const leaked: string[] = [];
  for (const value of NOT_AN_OBJECT) {
    try {
      call(value);
    } catch (thrown) {
      if (thrown instanceof MeicoError) continue;
      leaked.push(
        `${String(JSON.stringify(value) ?? String(value))} -> ${
          thrown instanceof Error ? `${thrown.constructor.name}: ${thrown.message}` : String(thrown)
        }`,
      );
    }
  }
  return leaked;
}

/** Every nested option object on the facade, named as a caller would write it. */
const FIELD_READERS: readonly (readonly [string, (value: unknown) => unknown])[] = [
  ['compareMpm options', (v) => compareMpm(v as never)],
  ['compareMpm window', (v) => compareMpm({ a: MPM, b: MPM, window: v as never })],
  ['compareMpm weights', (v) => compareMpm({ a: MPM, b: MPM, weights: v as never })],
  ['compareMpm jnd', (v) => compareMpm({ a: MPM, b: MPM, jnd: v as never })],
  ['compareMpm plausibleRange', (v) => compareMpm({ a: MPM, b: MPM, plausibleRange: v as never })],
  ['compareMpm invariance', (v) => compareMpm({ a: MPM, b: MPM, invariance: v as never })],
  ['compareMpm profile', (v) => compareMpm({ a: MPM, b: MPM, profile: v as never })],
  [
    'compareMpm profile.dimensions',
    (v) => compareMpm({ a: MPM, b: MPM, profile: { dimensions: v as never } }),
  ],
  ['compareMpm profile.grid', (v) => compareMpm({ a: MPM, b: MPM, profile: { grid: v as never } })],
  ['compareMpm scape', (v) => compareMpm({ a: MPM, b: MPM, scape: v as never })],
  ['diffMpm options', (v) => diffMpm(v as never)],
  ['diffMpm window', (v) => diffMpm({ a: MPM, b: MPM, window: v as never })],
  ['compareMpmCorpus options', (v) => compareMpmCorpus(v as never)],
  ['compareMpmCorpus items', (v) => compareMpmCorpus({ items: v as never })],
  ['compareMpmCorpus items[0]', (v) => compareMpmCorpus({ items: [v] as never })],
  ['compareMpmCorpus weights', (v) => compareMpmCorpus({ items: [], weights: v as never })],
  ['exaggerateMpm options', (v) => exaggerateMpm(MPM, v as never)],
  ['exaggerateMpm factors', (v) => exaggerateMpm(MPM, { factors: v as never })],
  ['spotlightMpm options', (v) => spotlightMpm(MPM, v as never)],
  ['spotlightMpm ids', (v) => spotlightMpm(MPM, { ids: v as never, attenuation: 0.5 })],
];

describe('RULE E4 — a check that reads a field is total', () => {
  it.each(FIELD_READERS)('%s rejects a non-object with a typed error', (_name, call) => {
    expect(escapes(call)).toEqual([]);
  });

  /**
   * The whole surface at once, so a field added later without a `checkNested` row is caught
   * here rather than by a consumer. The per-field cases above name the offender; this one is
   * the invariant.
   */
  it('leaks no raw error anywhere on the option surface', () => {
    const leaked = FIELD_READERS.flatMap(([name, call]) =>
      escapes(call).map((line) => `${name}: ${line}`),
    );
    expect(leaked).toEqual([]);
  });
});

describe('RULE E4 — the domain predicates are total, so the type tests are redundant', () => {
  /**
   * The measurement the rule rests on. If a future ECMAScript edition made these coerce, the
   * rule's "write the domain row alone" would silently stop rejecting wrong types, and every
   * validator in `src/api/` would loosen at once.
   */
  it.each([null, undefined, '3', '', [], [3], true, false, {}])(
    'Number.isFinite and Number.isInteger reject %s without coercing',
    (value) => {
      expect(Number.isFinite(value)).toBe(false);
      expect(Number.isInteger(value)).toBe(false);
    },
  );

  it('rejects a wrong-typed weight through the domain row alone', () => {
    // `weights.tempo` is checked as `Number.isFinite(v) && v >= 0`, with no `typeof` in front.
    expect(() => compareMpm({ a: MPM, b: MPM, weights: { tempo: '1' as never } })).toThrow(
      MeicoError,
    );
  });
});
