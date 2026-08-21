/**
 * The comparison facade — DESIGN.md §9's surface, at the boundary a consumer sees.
 *
 * Three things are tested here and nowhere else: the validation table (§9.4), which is the whole
 * of what a caller can get wrong; the typed errors and their document identity, because "MPM a"
 * versus "MPM b" is the difference between a fixable message and a bisection; and the plain-data
 * contract (RULE F1, §9.6), which the interior cannot check because it is a statement about what
 * crosses the boundary.
 *
 * The numbers themselves are pinned in `tests/comparison/compare.test.ts`, against the interior.
 * Re-pinning them here would be pinning the same computation twice.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { MessageChannel } from 'worker_threads';
import {
  COMPARISON_DIMENSIONS,
  COMPARISON_JND_KEYS,
  ComparisonEngineError,
  InvalidOptionError,
  ParseError,
  PerformanceNotFoundError,
  compareMpm,
  neutralMpm,
} from '../../src/api/index.js';
import * as barrel from '../../src/index.js';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), '..', 'comparison', 'fixtures');
const TELEMANN = readFileSync(join(FIXTURES, 'telemann-grave.mpm'), 'utf-8');
const TELEMANN_MSM = readFileSync(join(FIXTURES, 'telemann-grave.msm'), 'utf-8');
const MINIMAL = readFileSync(join(FIXTURES, 'minimal.mpm'), 'utf-8');

const NS = 'http://www.cemfi.de/mpm/ns/1.0';
const simple = (bpm: number): string =>
  `<mpm xmlns="${NS}"><performance name="p" pulsesPerQuarter="720"><global><header/><dated>` +
  `<tempoMap><tempo date="0.0" bpm="${String(bpm)}" beatLength="0.25"/>` +
  '<tempo date="2880.0" bpm="60" beatLength="0.25"/></tempoMap>' +
  '</dated></global></performance></mpm>';

describe('compareMpm end to end', () => {
  it('compares two performances of one document with `b` omitted (C16)', () => {
    const { report } = compareMpm({
      a: TELEMANN,
      performanceA: 'Baroque',
      performanceB: 'Romantic',
      msm: TELEMANN_MSM,
    });
    expect(report.aggregate.distance).toBeGreaterThan(0);
    expect(report.window.rule).toBe('msm');
    expect(Object.keys(report.dimensions)).toEqual([...COMPARISON_DIMENSIONS]);
  });

  it('is exactly 0 against itself, under Object.is after the −0 normalization (P-C1)', () => {
    const { report } = compareMpm({ a: simple(90), b: simple(90) });
    expect(Object.is(report.aggregate.distance, 0)).toBe(true);
    for (const dimension of COMPARISON_DIMENSIONS) {
      expect(Object.is(report.dimensions[dimension].distance, 0)).toBe(true);
      // The signed descriptors too, under `Object.is` rather than `===`, which would accept
      // `-0` — the assertion §10's P-C1 asks for by name (A20).
      const signed = report.dimensions[dimension].meanSigned;
      if (signed !== null) expect(Object.is(signed, 0)).toBe(true);
    }
  });

  /**
   * MINOR-2's normalization, pinned on a value that really carries `-0`.
   *
   * No shipped computation produces `-0`: every distance passes through `Math.abs` or a
   * non-negative accumulator, and a signed descriptor of an identical pair is `x − x`, which is
   * `+0` in IEEE754. Measured — deleting the normalizer fails nothing on an identity
   * comparison, so a pin there would be vacuous. It is a guard rather than a repair.
   *
   * The reachable path is the caller's: `-0` is a finite number `>= 0`, so it passes the weight
   * validator and lands in the echoed weight vector, where `Object.is`-based assertions and the
   * JSON round trip would then disagree about a value the caller can see.
   */
  it('normalizes −0 to +0 at the boundary, so JSON and Object.is agree (MINOR-2, A20)', () => {
    const { report } = compareMpm({
      a: simple(90),
      b: simple(120),
      window: { start: 0, end: 4 },
      weights: { pedal: -0 },
    });
    expect(Object.is(report.aggregate.weights.pedal, -0)).toBe(false);
    expect(Object.is(report.aggregate.weights.pedal, 0)).toBe(true);
    expect(Object.is(report.inputs.settings.weights.pedal, 0)).toBe(true);
    // …and the standing guard: nothing anywhere in a report is `-0`.
    for (const [path, value] of walk(report)) {
      if (typeof value !== 'number') continue;
      expect(Object.is(value, -0), `${path} is not −0`).toBe(false);
    }
  });

  it('returns plain data: no undefined, no Map, no class, every number finite or null', () => {
    const { report } = compareMpm({
      a: TELEMANN,
      performanceA: 'Baroque',
      performanceB: 'Fast',
      msm: TELEMANN_MSM,
      profile: { dimensions: ['tempo'], grid: 'refinement' },
    });
    for (const [path, value] of walk(report)) {
      if (value === null || ['string', 'number', 'boolean'].includes(typeof value)) {
        if (typeof value === 'number')
          expect(Number.isFinite(value), `${path} is finite`).toBe(true);
        continue;
      }
      expect(typeof value, `${path} is not a function or symbol`).toBe('object');
      expect(value instanceof Map || value instanceof Set, `${path} is not a Map/Set`).toBe(false);
      const prototype = Object.getPrototypeOf(value as object) as unknown;
      expect(
        prototype === Object.prototype || prototype === Array.prototype,
        `${path} is a plain object or array`,
      ).toBe(true);
      for (const key of Object.keys(value as object))
        expect(
          Object.getOwnPropertyDescriptor(value, key)?.value,
          `${path}.${key} is not undefined`,
        ).not.toBeUndefined();
    }
  });

  it('survives a structured-clone hop to another thread (RULE I3)', async () => {
    const { report } = compareMpm({ a: simple(90), b: simple(120) });
    const { port1, port2 } = new MessageChannel();
    const arrived = await new Promise<unknown>((resolve) => {
      port2.once('message', resolve);
      port1.postMessage(report);
      port1.close();
    });
    port2.close();
    expect(arrived).toEqual(report);
  });

  it('allocates a fresh result each call, so `===` memoization sees a change (RULE I3b)', () => {
    const first = compareMpm({ a: simple(90), b: simple(120) }).report;
    const second = compareMpm({ a: simple(90), b: simple(120) }).report;
    expect(first).toEqual(second);
    expect(first).not.toBe(second);
    expect(first.inputs.epsilon).not.toBe(second.inputs.epsilon);
    expect(first.dimensions.tempo).not.toBe(second.dimensions.tempo);
  });

  it('echoes the settings and never the documents (A12)', () => {
    const { report } = compareMpm({
      a: simple(90),
      b: simple(120),
      window: { start: 0, end: 4 },
      weights: { pedal: 0 },
    });
    expect(JSON.stringify(report.inputs)).not.toContain('tempoMap');
    expect(report.inputs.settings.weights.pedal).toBe(0);
    expect(report.inputs.settings.weights.tempo).toBe(1);
    expect(Object.keys(report.inputs.jnd)).toEqual([...COMPARISON_JND_KEYS]);
  });
});

describe('§9.4’s validation table', () => {
  const compare = (options: Parameters<typeof compareMpm>[0]) => () => compareMpm(options);
  const a = simple(90);

  it('validates BEFORE parsing, so a misspelled option beats a malformed document', () => {
    // The document is not XML at all; the caller is told about the option they can fix.
    expect(compare({ a: 'not xml', weights: { nonsense: 1 } as never })).toThrow(
      /unknown weight dimension/,
    );
  });

  it('rejects an unknown dimension, naming every offender', () => {
    expect(compare({ a, weights: { tempoo: 1, dinamics: 2 } as never })).toThrow(
      /tempoo, dinamics/,
    );
  });

  it('rejects a negative or non-finite weight', () => {
    expect(compare({ a, weights: { tempo: -1 } })).toThrow(InvalidOptionError);
    expect(compare({ a, weights: { tempo: Number.NaN } })).toThrow(/finite/);
  });

  it('rejects an unknown jnd key and a non-positive jnd', () => {
    expect(compare({ a, jnd: { 'tempo/tempo@nope': 1 } as never })).toThrow(/unknown jnd key/);
    expect(compare({ a, jnd: { 'tempo/tempo@bpm': 0 } })).toThrow(/> 0/);
  });

  it('rejects an inverted, negative or non-finite window (A16)', () => {
    expect(compare({ a, window: { start: 4, end: 4 } })).toThrow(/must be < window.end/);
    expect(compare({ a, window: { start: -1, end: 4 } })).toThrow(/>= 0/);
    expect(compare({ a, window: { start: 0, end: Number.POSITIVE_INFINITY } })).toThrow(/finite/);
  });

  it('rejects an invariance mode on an EVENT dimension (AD-20)', () => {
    expect(compare({ a, invariance: { articulation: 'level' } })).toThrow(/no curve to centre/);
    expect(compare({ a, invariance: { ornamentation: 'level-gain' } })).toThrow(InvalidOptionError);
    // …and accepts it on a curve dimension.
    expect(compare({ a, invariance: { tempo: 'level' } })).not.toThrow();
  });

  it('rejects a selector that is not a non-negative integer (A17)', () => {
    expect(compare({ a, performanceA: -1 })).toThrow(/non-negative integer/);
    expect(compare({ a, performanceB: 1.5 })).toThrow(InvalidOptionError);
  });

  it('rejects a plausibleRange that is not an ordered pair of finite numbers', () => {
    expect(compare({ a, plausibleRange: { 'tempo/tempo@bpm': [400, 10] } })).toThrow(/low <= high/);
  });

  it('rejects a profile step that is not positive and finite', () => {
    expect(compare({ a, profile: { grid: { step: 0 } } })).toThrow(/> 0/);
  });
});

describe('§9.4’s errors carry the document’s identity', () => {
  it('names which document failed to parse, in the order a, b, msm', () => {
    expect(() => compareMpm({ a: 'not xml', b: simple(90) })).toThrow(/^MPM a:/);
    expect(() => compareMpm({ a: simple(90), b: '<nope/>' })).toThrow(/^MPM b:/);
    expect(() => compareMpm({ a: simple(90), b: simple(90), msm: 'not xml' })).toThrow(/^MSM:/);
    expect(() => compareMpm({ a: 'not xml' })).toThrow(ParseError);
  });

  it('rejects a document whose root is not <mpm>', () => {
    expect(() => compareMpm({ a: '<msm/>' })).toThrow(/expected a <mpm> root element/);
  });

  it('names the document a multi-performance ambiguity is about', () => {
    expect(() => compareMpm({ a: TELEMANN })).toThrow(InvalidOptionError);
    expect(() => compareMpm({ a: TELEMANN })).toThrow(/MPM a: performance selector required/);
    // …and lists the candidates, so the caller does not have to open the file.
    expect(() => compareMpm({ a: TELEMANN })).toThrow(/Baroque/);
  });

  it('routes a selector that matches nothing to PerformanceNotFoundError', () => {
    expect(() =>
      compareMpm({ a: TELEMANN, performanceA: 'Nope', performanceB: 'Baroque' }),
    ).toThrow(PerformanceNotFoundError);
    expect(() => compareMpm({ a: TELEMANN, performanceA: 99, performanceB: 'Baroque' })).toThrow(
      /MPM a: document a has no performance 99/,
    );
  });

  it('routes a document with no <performance> to PerformanceNotFoundError (C8)', () => {
    const empty = `<mpm xmlns="${NS}"/>`;
    expect(() => compareMpm({ a: empty })).toThrow(PerformanceNotFoundError);
    expect(() => compareMpm({ a: empty })).toThrow(/contains no <performance>/);
  });

  it('rejects a document that resolves a non-positive tempo (M11)', () => {
    const zero =
      `<mpm xmlns="${NS}"><performance name="p" pulsesPerQuarter="720"><global><header/>` +
      '<dated><tempoMap><tempo date="0.0" bpm="0" beatLength="0.25"/></tempoMap></dated>' +
      '</global></performance></mpm>';
    expect(() => compareMpm({ a: zero, b: simple(90) })).toThrow(InvalidOptionError);
    expect(() => compareMpm({ a: zero, b: simple(90) })).toThrow(/MPM a: .*quarter-BPM/);
  });

  it('exports ComparisonEngineError as its own class, not EngineInvariantError’s (A15)', () => {
    expect(new ComparisonEngineError('x')).toBeInstanceOf(Error);
    expect(barrel.ComparisonEngineError).toBe(ComparisonEngineError);
    expect(ComparisonEngineError).not.toBe(barrel.EngineInvariantError);
  });
});

describe('neutralMpm (C8)', () => {
  it('is a document with one empty performance, and compares to itself at 0', () => {
    const neutral = neutralMpm();
    const { report } = compareMpm({ a: neutral, b: neutral });
    expect(report.aggregate.distance).toBe(0);
    for (const dimension of COMPARISON_DIMENSIONS)
      expect(report.dimensions[dimension].state).toBe('both-neutral');
  });

  it('is the baseline a document can be measured against', () => {
    const { report } = compareMpm({
      a: simple(90),
      b: neutralMpm(),
      window: { start: 0, end: 4 },
    });
    // 90 qbpm against the renderer's own neutral 100.
    expect(report.dimensions.tempo.distance).toBeCloseTo(
      (4 * Math.abs(Math.log(90 / 100))) / Math.log(1.025),
      6,
    );
  });

  it('takes a ppq and rejects one that is not a positive integer', () => {
    expect(neutralMpm({ ppq: 480 })).toContain('pulsesPerQuarter="480"');
    expect(() => neutralMpm({ ppq: 0 })).toThrow(InvalidOptionError);
    expect(() => neutralMpm({ ppq: 1.5 })).toThrow(/positive integer/);
  });

  it('is usable against the degenerate vendored document, which has no maps', () => {
    const { report } = compareMpm({ a: MINIMAL, b: neutralMpm() });
    expect(report.aggregate.distance).toBe(0);
  });
});

describe('the export surface (§9.7)', () => {
  it('re-exports the facade member by member from the package root', () => {
    expect(barrel.compareMpm).toBe(compareMpm);
    expect(barrel.neutralMpm).toBe(neutralMpm);
    expect(barrel.COMPARISON_DIMENSIONS).toBe(COMPARISON_DIMENSIONS);
    expect(barrel.COMPARISON_JND_KEYS).toBe(COMPARISON_JND_KEYS);
  });

  it('hands the consumer the SAME frozen vocabulary the validator reads (A25)', () => {
    expect(Object.isFrozen(COMPARISON_DIMENSIONS)).toBe(true);
    expect(Object.isFrozen(COMPARISON_JND_KEYS)).toBe(true);
    // Frozen matters because the ESM re-export hands out the object the option validator reads:
    // unfrozen, a `push` from outside would widen this package's notion of a legal dimension
    // process-wide, and `as const` stops that at compile time only.
    expect(() => (COMPARISON_DIMENSIONS as unknown as string[]).push('nonsense')).toThrow();
  });
});

/** Every node of a plain-data value, with a readable path for the failure message. */
function* walk(
  value: unknown,
  path = '$',
  seen = new Set<unknown>(),
): Generator<[string, unknown]> {
  yield [path, value];
  if (value === null || typeof value !== 'object' || seen.has(value)) return;
  seen.add(value);
  if (Array.isArray(value)) {
    for (const [index, item] of value.entries())
      yield* walk(item, `${path}[${String(index)}]`, seen);
    return;
  }
  for (const [key, item] of Object.entries(value)) yield* walk(item, `${path}.${key}`, seen);
}
