/**
 * §7.4's invariance modes reaching the DISTANCE, not only the decomposition (AD-20, C9).
 *
 * A mode must reach `d_k` and not only `decomposition`. The canonicalization is expressed as
 * DATA (`CurveCanonicalization`, `shift` and `scale` in T-space) and handed to the integrand,
 * and `applyInvariance` is defined through the same data so the curve form and the integrand
 * form cannot drift apart.
 *
 * The tests are the two halves of §7.4's own table, which is exactly right for log spaces and
 * silently wrong elsewhere:
 *
 * - in a LOG space `'level'` removes a multiplicative factor — a roll read 10 % fast compares
 *   at zero;
 * - in a LINEAR space it removes an additive offset ONLY, because `c·x − mean(c·x) =
 *   c(x − mean x)` leaves the factor standing. A test that only checked tempo would report the
 *   mode as working and leave asynchrony's trap unseen.
 */
import { describe, it, expect } from 'vitest';
import { readComparisonPair, readScopeMapViews } from '../../src/comparison/document.js';
import type { ComparisonDocument, ComparisonPair } from '../../src/comparison/document.js';
import {
  quarterBpmAt,
  readTempoSegments,
  type TempoCurve,
} from '../../src/comparison/tempoCurve.js';
import { refinementGridTicks, tempoDistance } from '../../src/comparison/tempoDistance.js';
import {
  offsetAt,
  readAsynchronySegments,
  type AsynchronyCurve,
} from '../../src/comparison/asynchronyCurve.js';
import {
  asynchronyDistance,
  asynchronyGridTicks,
} from '../../src/comparison/asynchronyDistance.js';
import {
  applyInvariance,
  canonicalizationFor,
  curveMoments,
  IDENTITY_CANONICAL_PAIR,
  type CanonicalPair,
  type InvarianceMode,
  type SampledCurve,
} from '../../src/comparison/decomposition.js';
import { isBottom } from '../../src/comparison/values.js';

const NS = 'http://www.cemfi.de/mpm/ns/1.0';
const WINDOW = { start: 0, end: 8 };

const doc = (mapName: string, body: string): string =>
  `<mpm xmlns="${NS}"><performance name="p" pulsesPerQuarter="720">` +
  `<global><header/><dated><${mapName}>${body}</${mapName}></dated></global>` +
  '</performance></mpm>';

const pairOf = (mapName: string, a: string, b: string): ComparisonPair =>
  readComparisonPair({ a: doc(mapName, a), b: doc(mapName, b), window: WINDOW });

const scopeOf = (document: ComparisonDocument, mapName: string) => {
  const scope = document.scopes.find((candidate) => candidate.scope === 'global');
  if (scope === undefined) throw new Error('no global scope');
  return readScopeMapViews(scope).get(mapName) ?? null;
};

/**
 * The canonicalization pair for one mode, over one dimension's grid.
 *
 * Both moments are taken on the SHARED refinement grid here, which is sound because GL-10 is
 * exact on cells carrying no breakpoint: adding the other document's breakpoints subdivides
 * without changing the integral. The driver takes each document's own grid instead, which makes
 * the same value pair-independent by construction rather than by that argument.
 */
function canonicalFor(
  mode: InvarianceMode,
  curveA: SampledCurve,
  curveB: SampledCurve,
  grid: readonly number[],
): CanonicalPair {
  return {
    a: canonicalizationFor(mode, curveMoments(curveA, grid)),
    b: canonicalizationFor(mode, curveMoments(curveB, grid)),
  };
}

describe('tempo, a LOG space: “level” removes a multiplicative factor (§7.4)', () => {
  const RAMP = (bpm: number, to: number) =>
    `<tempo date="0.0" bpm="${String(bpm)}" beatLength="0.25" transition.to="${String(to)}" meanTempoAt="0.5"/>` +
    `<tempo date="5760.0" bpm="${String(to)}" beatLength="0.25"/>`;

  const setUp = (a: string, b: string) => {
    const pair = pairOf('tempoMap', a, b);
    const read = (side: 'a' | 'b'): TempoCurve => {
      const document = pair[side];
      const scope = document.scopes.find((candidate) => candidate.scope === 'global');
      if (scope === undefined) throw new Error('no global scope');
      return readTempoSegments(
        scopeOf(document, 'tempoMap'),
        document.scaleFactor,
        scope.environment,
        document.performance.global,
      );
    };
    const curveA = read('a');
    const curveB = read('b');
    const grid = refinementGridTicks(curveA, curveB, pair.window, pair.ppq.lcm);
    const sampler =
      (curve: TempoCurve): SampledCurve =>
      (ticks) =>
        Math.log(quarterBpmAt(curve, ticks));
    const distance = (mode: InvarianceMode) =>
      tempoDistance(
        curveA,
        curveB,
        pair.window,
        pair.ppq.lcm,
        undefined,
        canonicalFor(mode, sampler(curveA), sampler(curveB), grid),
      ).distance;
    return { distance, curveA, curveB, grid, sampler, pair };
  };

  it('scores a 10 % faster reading of the same gesture at zero under “level”', () => {
    const { distance } = setUp(RAMP(60, 90), RAMP(66, 99));
    expect(distance('none')).toBeGreaterThan(1);
    expect(distance('level')).toBeLessThan(1e-9);
  });

  it('still sees a difference in SHAPE under “level”', () => {
    const { distance } = setUp(RAMP(60, 90), RAMP(60, 60));
    expect(distance('level')).toBeGreaterThan(1);
  });

  it('is exactly 0 against itself under every mode (P-C1)', () => {
    for (const mode of ['none', 'level', 'level-gain'] as const) {
      const { distance } = setUp(RAMP(60, 90), RAMP(60, 90));
      expect(distance(mode)).toBe(0);
    }
  });

  /**
   * Two STEPS rather than two ramps: `T` of a power transition is not affine in the endpoints'
   * logs, so scaling `transition.to` does not scale the log-space SHAPE — two ramps that look
   * like a dilation of one another are a different shape once the renderer's interpolation is
   * applied. A step curve has no interpolation to distort, so `ln B = 2·ln A − ln 60` really is
   * the same shape at twice the amplitude, which is what `'level-gain'` claims to see through.
   */
  it('scores a doubled log-amplitude at zero under “level-gain” but not under “level”', () => {
    const steps = (low: number, high: number) =>
      `<tempo date="0.0" bpm="${String(low)}" beatLength="0.25"/>` +
      `<tempo date="2880.0" bpm="${String(high)}" beatLength="0.25"/>`;
    const { distance } = setUp(steps(60, 90), steps(60, (90 * 90) / 60));
    expect(distance('level')).toBeGreaterThan(1);
    expect(distance('level-gain')).toBeLessThan(1e-6);
  });

  it('collapses a constant curve to the ZERO curve under “level-gain” (AD-20)', () => {
    const constant = '<tempo date="0.0" bpm="60" beatLength="0.25"/>';
    const other = '<tempo date="0.0" bpm="90" beatLength="0.25"/>';
    const { distance } = setUp(constant, other);
    // Both sides are constant, so both canonicalize to the identically zero curve and the
    // distance is EXACTLY zero — AD-20's rule is stronger than "do not divide by zero": a
    // scale of 1 on a constant curve would leave floating-point residue behind.
    expect(distance('level-gain')).toBe(0);
  });

  it('applies the same transform through applyInvariance as through the integrand', () => {
    const { curveA, grid, sampler } = setUp(RAMP(60, 90), RAMP(66, 99));
    const raw = sampler(curveA);
    const moments = curveMoments(raw, grid);
    const canonical = canonicalizationFor('level-gain', moments);
    const wrapped = applyInvariance(raw, 'level-gain', moments);
    for (const ticks of [0, 720, 2880, 5000])
      expect(wrapped(ticks)).toBeCloseTo(canonical.scale * (raw(ticks) - canonical.shift), 12);
  });
});

describe('asynchrony, a LINEAR space: “level” removes an offset only (§7.4’s trap, C9)', () => {
  const setUp = (a: string, b: string) => {
    const pair = pairOf('asynchronyMap', a, b);
    const read = (side: 'a' | 'b'): AsynchronyCurve =>
      readAsynchronySegments(scopeOf(pair[side], 'asynchronyMap'), pair[side].scaleFactor);
    const curveA = read('a');
    const curveB = read('b');
    const grid = asynchronyGridTicks(curveA, curveB, pair.window, pair.ppq.lcm);
    const sampler =
      (curve: AsynchronyCurve): SampledCurve =>
      (ticks) => {
        const value = offsetAt(curve, ticks);
        if (isBottom(value)) throw new Error('the fixture is ⊥-free by construction');
        return value.value;
      };
    const distance = (mode: InvarianceMode) =>
      asynchronyDistance(
        curveA,
        curveB,
        pair.window,
        pair.ppq.lcm,
        canonicalFor(mode, sampler(curveA), sampler(curveB), grid),
      ).distance;
    return { distance };
  };

  const STEPS = (scale: number, offset: number) =>
    `<asynchrony date="0.0" milliseconds.offset="${String(scale * -20 + offset)}"/>` +
    `<asynchrony date="2880.0" milliseconds.offset="${String(scale * 40 + offset)}"/>`;

  it('scores a constant lag of 25 ms at zero — the offset really is removed', () => {
    const { distance } = setUp(STEPS(1, 0), STEPS(1, 25));
    expect(distance('none')).toBeGreaterThan(1);
    expect(distance('level')).toBeLessThan(1e-12);
  });

  /**
   * A roll read 10 % slower has all its inter-onset offsets stretched 10 %, and `'level'` does
   * NOT remove that — the same physical uncertainty it removes from tempo stays here. This is
   * the measurement behind the plain-words warning §7.4 requires of the report.
   */
  it('does NOT remove a 10 % stretch, which the same mode removes from tempo', () => {
    const { distance } = setUp(STEPS(1, 0), STEPS(1.1, 0));
    expect(distance('level')).toBeGreaterThan(0.01);
    expect(distance('level-gain')).toBeLessThan(1e-12);
  });

  it('is symmetric under the swap in every mode (P-C2)', () => {
    const forward = setUp(STEPS(1, 0), STEPS(1.1, 25));
    const reverse = setUp(STEPS(1.1, 25), STEPS(1, 0));
    for (const mode of ['none', 'level', 'level-gain'] as const)
      expect(Object.is(forward.distance(mode), reverse.distance(mode))).toBe(true);
  });

  it('is unchanged by the identity pair, which is what “none” resolves to', () => {
    const pair = pairOf('asynchronyMap', STEPS(1, 0), STEPS(1, 25));
    const read = (side: 'a' | 'b'): AsynchronyCurve =>
      readAsynchronySegments(scopeOf(pair[side], 'asynchronyMap'), pair[side].scaleFactor);
    const explicit = asynchronyDistance(
      read('a'),
      read('b'),
      pair.window,
      pair.ppq.lcm,
      IDENTITY_CANONICAL_PAIR,
    ).distance;
    const defaulted = asynchronyDistance(read('a'), read('b'), pair.window, pair.ppq.lcm).distance;
    expect(Object.is(explicit, defaulted)).toBe(true);
  });
});
