import { describe, expect, test } from 'vitest';
import { innerControlPointsXPositions } from '../../src/mpm/elements/maps/data/bezier.js';
import {
  fitTransitionCurve,
  transitionValueAt,
  type CurveSample,
  type TransitionShape,
  type TransitionSpan,
} from '../../src/mpm/curveFit.js';

const SPAN: TransitionSpan = { startDate: 720, endDate: 720 + 4 * 720, from: 40, to: 110 };

/**
 * mulberry32. The module takes its randomness from the caller precisely so a test can pin it;
 * a fit that cannot be reproduced cannot be asserted about.
 */
const seeded = (seed: number) => {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

/** The curve a known shape actually draws, sampled the way a recording would sample it. */
const samplesOf = (shape: TransitionShape, count = 24): CurveSample[] => {
  const [x1, x2] = innerControlPointsXPositions(shape.curvature, shape.protraction);
  const samples: CurveSample[] = [];
  for (let i = 0; i <= count; i++) {
    const date = SPAN.startDate + ((SPAN.endDate - SPAN.startDate) * i) / count;
    samples.push({
      date,
      value: transitionValueAt(x1, x2, SPAN.startDate, SPAN.endDate, SPAN.from, SPAN.to, date),
    });
  }
  return samples;
};

const SHAPES: [string, TransitionShape][] = [
  ['a straight ramp', { curvature: 0.5, protraction: 0 }],
  ['a gentle bend', { curvature: 0.2, protraction: 0 }],
  ['a late-arriving curve', { curvature: 0.3, protraction: 0.6 }],
  ['an early-arriving curve', { curvature: 0.3, protraction: -0.6 }],
  ['a strong bend, protracted', { curvature: 0.05, protraction: 0.4 }],
];

describe('a curve this package can draw is a curve it can recover', () => {
  /**
   * The bound is per sample rather than total, so it does not quietly loosen as the series
   * lengthens. Measured: every shape here lands under 0.016 of one MIDI velocity step, over a
   * span running from 40 to 110, against a starting error of up to 12.1.
   */
  test.each(SHAPES)('recovers %s from its own samples', (_, shape) => {
    const samples = samplesOf(shape);
    const fitted = fitTransitionCurve(SPAN, samples, { random: seeded(1) });

    expect(fitted.error / samples.length).toBeLessThan(0.05);
  });

  /**
   * And the stronger statement, which holds here and is worth pinning: it finds the actual two
   * numbers, not merely a curve that happens to pass through the samples.
   *
   * It holds *because these samples are noiseless* — they are the exact curve the shape draws.
   * `curvature` and `protraction` do trade off against each other, so on a real series with
   * measurement error in it two distant pairs can explain the data about equally well and this
   * assertion would be the wrong one to make. It is made here to say the search is not merely
   * finding some local excuse: given data that has one right answer, it arrives at it.
   */
  test.each(SHAPES)('and finds the parameters themselves, over %s', (_, shape) => {
    const fitted = fitTransitionCurve(SPAN, samplesOf(shape), { random: seeded(1) });

    expect(fitted.curvature).toBeCloseTo(shape.curvature, 2);
    expect(fitted.protraction).toBeCloseTo(shape.protraction, 2);
  });

  test.each(SHAPES)('and beats the shape it started from, over %s', (_, shape) => {
    const samples = samplesOf(shape);
    const initial = { curvature: 0.5, protraction: 0 };
    const fitted = fitTransitionCurve(SPAN, samples, { random: seeded(7) });
    const startingError = fitTransitionCurve(SPAN, samples, { maxIterations: 0, initial }).error;

    expect(fitted.error).toBeLessThanOrEqual(startingError);
  });

  test('stays inside the attribute domains, whatever the search does', () => {
    for (const [, shape] of SHAPES) {
      const fitted = fitTransitionCurve(SPAN, samplesOf(shape), { random: seeded(3) });
      expect(fitted.curvature).toBeGreaterThanOrEqual(0);
      expect(fitted.curvature).toBeLessThanOrEqual(1);
      expect(fitted.protraction).toBeGreaterThanOrEqual(-1);
      expect(fitted.protraction).toBeLessThanOrEqual(1);
    }
  });
});

describe('the caller owns the randomness, and therefore the reproducibility', () => {
  test('the same seed fits the same curve, exactly', () => {
    const samples = samplesOf({ curvature: 0.3, protraction: 0.6 });
    const a = fitTransitionCurve(SPAN, samples, { random: seeded(42) });
    const b = fitTransitionCurve(SPAN, samples, { random: seeded(42) });

    expect(a).toEqual(b);
  });

  /** Non-vacuous: the seed really is what makes the two runs above agree. */
  test('a different seed takes a different path, and still lands somewhere good', () => {
    const samples = samplesOf({ curvature: 0.3, protraction: 0.6 });
    const a = fitTransitionCurve(SPAN, samples, { random: seeded(42) });
    const b = fitTransitionCurve(SPAN, samples, { random: seeded(99) });

    expect(a).not.toEqual(b);
    expect(b.error / samples.length).toBeLessThan(0.05);
  });
});

describe('what the caller decides and this module does not', () => {
  test('"close enough" is the caller\'s: a tolerance it already meets stops it at once', () => {
    const samples = samplesOf({ curvature: 0.3, protraction: 0.6 });
    const initial = { curvature: 0.5, protraction: 0 };
    const untouched = fitTransitionCurve(SPAN, samples, { maxIterations: 0, initial });

    const stopped = fitTransitionCurve(SPAN, samples, {
      random: seeded(5),
      initial,
      tolerance: untouched.error,
    });

    expect(stopped).toEqual(untouched);
  });

  test('the default tolerance is 0, so nothing stops early by itself', () => {
    const samples = samplesOf({ curvature: 0.2, protraction: 0 });
    const short = fitTransitionCurve(SPAN, samples, { random: seeded(11), maxIterations: 20 });
    const long = fitTransitionCurve(SPAN, samples, { random: seeded(11), maxIterations: 5000 });

    expect(long.error).toBeLessThan(short.error);
  });

  test("a series with nothing in it is not this module's to refuse", () => {
    const initial = { curvature: 0.25, protraction: -0.5 };
    expect(fitTransitionCurve(SPAN, [], { initial })).toEqual({ ...initial, error: 0 });
  });
});

describe('transitionValueAt answers its endpoints exactly', () => {
  /**
   * `tForDate` stops within one tick on the x-axis, so it returns neither exactly 0 nor exactly
   * 1 for the endpoints. Without the guard this reads 109.9x where the instruction says 110.
   */
  test.each(SHAPES)('over %s', (_, shape) => {
    const [x1, x2] = innerControlPointsXPositions(shape.curvature, shape.protraction);
    const at = (date: number) =>
      transitionValueAt(x1, x2, SPAN.startDate, SPAN.endDate, SPAN.from, SPAN.to, date);

    expect(at(SPAN.startDate)).toBe(SPAN.from);
    expect(at(SPAN.endDate)).toBe(SPAN.to);
    expect(at(SPAN.startDate - 1000)).toBe(SPAN.from);
    expect(at(SPAN.endDate + 1000)).toBe(SPAN.to);
  });

  test('a transition to the value it already holds is constant', () => {
    const [x1, x2] = innerControlPointsXPositions(0.3, 0.6);
    expect(transitionValueAt(x1, x2, 0, 720, 64, 64, 360)).toBe(64);
  });

  test('and is monotone between them, which is what makes a fit meaningful', () => {
    const [x1, x2] = innerControlPointsXPositions(0.3, 0.6);
    let previous = -Infinity;
    for (let date = SPAN.startDate; date <= SPAN.endDate; date += 60) {
      const value = transitionValueAt(
        x1,
        x2,
        SPAN.startDate,
        SPAN.endDate,
        SPAN.from,
        SPAN.to,
        date,
      );
      expect(value).toBeGreaterThanOrEqual(previous);
      previous = value;
    }
  });
});
