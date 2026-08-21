/**
 * The options layer: DESIGN.md §4's defaults and A11's rejections.
 *
 * Everything rejected here is a **programmer error**, never a document condition, and each
 * message names the offender — because the facade that wraps these into `InvalidOptionError`
 * (W3) cannot reconstruct which key was wrong from a bare failure.
 *
 * The distinction the last block draws is the one that is mathematics rather than hygiene: a
 * dimension whose scale space's `T` ranges over a half-line has no meaning at `s < 0`, and
 * quietly substituting 0 would answer a question the caller did not pose.
 */
import { describe, expect, it } from 'vitest';
import { applyExaggeration } from '../../src/expression/applier.js';
import { parseMpmRoot } from '../../src/expression/mpmDocument.js';
import {
  DEFAULT_MIN_RUBATO_WINDOW,
  DEFAULT_SCOPE,
  DEFAULT_VELOCITY_RANGE,
  requestedFactors,
  resolveFactors,
  resolveOptions,
  type ExaggerateOptions,
} from '../../src/expression/options.js';
import type { Result } from '../../src/prelude/index.js';
import { EXPRESSION_DIMENSIONS, type ExaggerationFactors } from '../../src/expression/registry.js';
import { globalDocument } from './applierFixtures.js';

const DOCUMENT = globalDocument(
  '',
  '<dynamicsMap><dynamics id="d1" date="0.0" volume="60"/></dynamicsMap>',
);

/** The applier's own entry point, so the rejections are proven where a caller meets them. */
function run(factors: ExaggerationFactors, options?: ExaggerateOptions): void {
  applyExaggeration(parseMpmRoot(DOCUMENT), factors, options);
}

/**
 * The refusal a resolver answered with, having asserted that it refused at all.
 *
 * Stricter than the `expect(() => …).toThrow(/…/)` these assertions used to be: `toThrow`
 * accepts ANY throw, so a `TypeError` from a bug inside the resolver would have satisfied it.
 * Here the value has to be a refusal, and the message has to match.
 */
function refusal(result: Result<unknown, string>): string {
  expect(result.ok).toBe(false);
  if (result.ok) throw new Error('expected a refusal, got a resolved value');
  return result.error;
}

/** The value a resolver answered with, having asserted that it resolved at all. */
function resolved<T>(result: Result<T, string>): T {
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(`expected a resolved value, got the refusal: ${result.error}`);
  return result.value;
}

describe('resolveOptions — defaults (§4)', () => {
  it('fills in every option', () => {
    expect(resolved(resolveOptions())).toEqual({
      performance: null,
      scope: DEFAULT_SCOPE,
      center: {},
      velocityRange: DEFAULT_VELOCITY_RANGE,
      minRubatoWindow: DEFAULT_MIN_RUBATO_WINDOW,
    });
  });

  it('defaults the velocity floor to 1, not 0 — velocity 0 is a note-off (R6a)', () => {
    expect(DEFAULT_VELOCITY_RANGE).toEqual({ min: 1, max: 127 });
  });

  it('defaults the rubato guard to the documented IEEE saturation bound (A6)', () => {
    expect(DEFAULT_MIN_RUBATO_WINDOW).toBe(1e-6);
  });

  it('defaults the scope to global, the one that is not a no-op on the dominant corpus', () => {
    expect(DEFAULT_SCOPE).toBe('global');
  });
});

describe('resolveOptions — rejections (A11)', () => {
  it('rejects an inverted velocity range', () => {
    expect(refusal(resolveOptions({ velocityRange: { min: 100, max: 10 } }))).toMatch(
      /velocityRange\.min must be below/,
    );
  });

  it('rejects a velocity floor of 0, which the log space cannot write back', () => {
    expect(refusal(resolveOptions({ velocityRange: { min: 0, max: 127 } }))).toMatch(/note-off/);
  });

  it('rejects a non-finite velocity range', () => {
    expect(refusal(resolveOptions({ velocityRange: { min: 1, max: NaN } }))).toMatch(/finite/);
  });

  it('rejects a rubato guard outside (0,1)', () => {
    expect(refusal(resolveOptions({ minRubatoWindow: 0 }))).toMatch(/\(0,1\)/);
    expect(refusal(resolveOptions({ minRubatoWindow: 1 }))).toMatch(/\(0,1\)/);
  });

  it('rejects a center outside its dimension’s own domain, naming the key', () => {
    expect(refusal(resolveOptions({ center: { tempo: 0 } }))).toMatch(/center\.tempo/);
    expect(refusal(resolveOptions({ center: { dynamics: -5 } }))).toMatch(/center\.dynamics/);
  });

  it('keeps a valid center and drops nothing else', () => {
    expect(resolved(resolveOptions({ center: { tempo: 96 } })).center).toEqual({ tempo: 96 });
  });

  it('rejects a non-integer performance index', () => {
    expect(refusal(resolveOptions({ performance: 1.5 }))).toMatch(/integer index/);
  });
});

describe('resolveFactors — R3 and A11', () => {
  it('defaults every missing key to the identity', () => {
    const factors = resolved(resolveFactors({ tempo: 2 }));
    expect(factors.tempo).toBe(2);
    for (const dimension of EXPRESSION_DIMENSIONS) {
      if (dimension === 'tempo') continue;
      expect(factors[dimension]).toBe(1);
    }
  });

  it('distinguishes "not requested" from "requested as 1"', () => {
    const requested = requestedFactors({ tempo: 1 });
    expect(requested.tempo).toBe(1);
    expect(requested.dynamics).toBeNull();
  });

  it('rejects an unknown key and lists the vocabulary', () => {
    // The failure mode A11 exists for: a misspelt key would otherwise be a silent identity,
    // and a caller sampling factors into a record has no way to notice.
    expect(() => run({ tempoShapes: 1.4 } as unknown as ExaggerationFactors)).toThrow(
      /unknown exaggeration dimension: "tempoShapes"/,
    );
  });

  it('rejects a non-finite factor, naming the dimension', () => {
    expect(() => run({ dynamics: NaN })).toThrow(/factor for dynamics must be finite/);
    expect(() => run({ tempo: Infinity })).toThrow(/factor for tempo must be finite/);
  });

  it('rejects a negative factor where the scale space ranges over a half-line', () => {
    for (const dimension of ['pedalShape', 'rubato', 'accentuation', 'ornamentSpread'] as const) {
      expect(() => run({ [dimension]: -1 })).toThrow(
        new RegExp(`factor for ${dimension} must be ≥ 0`),
      );
    }
  });

  it('accepts a negative factor where the space is all of ℝ', () => {
    expect(() => run({ tempo: -1, asynchrony: -2, articulation: -0.5 })).not.toThrow();
  });

  it('accepts 0 everywhere — it is the closed-form "write the neutral" (A3)', () => {
    const zeros = Object.fromEntries(
      EXPRESSION_DIMENSIONS.map((dimension) => [dimension, 0]),
    ) as ExaggerationFactors;
    expect(() => run(zeros)).not.toThrow();
  });
});
