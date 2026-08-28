import { describe, expect, test } from 'vitest';
import {
  fitMeanTempoAt,
  meanTempoAtForElapsedTime,
  type TempoSample,
  type TimedTempoTransitionSpan,
} from '../../src/mpm/tempoFit.js';
import { millisecondsAt, resolveSpan } from '../../src/mpm/timing.js';
import { tempoAt } from '../../src/mpm/elements/maps/data/tempo.js';

const PPQ = 720;

/** Four bars of 4/4 at 720 ppq, accelerating. */
const RISING: TimedTempoTransitionSpan = {
  startDate: 720,
  endDate: 720 + 16 * 720,
  bpm: 60,
  transitionTo: 120,
  beatLength: 0.25,
};

/** The same span, the other way round — where the elapsed time runs the other way with it. */
const FALLING: TimedTempoTransitionSpan = { ...RISING, bpm: 132, transitionTo: 66 };

const resolvedWith = (span: TimedTempoTransitionSpan, meanTempoAt: number) =>
  resolveSpan({
    date: span.startDate,
    endDate: span.endDate,
    beatLength: span.beatLength,
    bpm: span.bpm,
    transitionTo: span.transitionTo,
    meanTempoAt,
  });

/** The tempi a known shape actually holds, sampled the way a beat tracker would sample them. */
const samplesOf = (
  span: TimedTempoTransitionSpan,
  meanTempoAt: number,
  count = 32,
): TempoSample[] => {
  const curve = resolvedWith(span, meanTempoAt);
  const samples: TempoSample[] = [];
  for (let i = 1; i < count; i++) {
    const date = span.startDate + ((span.endDate - span.startDate) * i) / count;
    samples.push({ date, bpm: tempoAt(curve, date) });
  }
  return samples;
};

const elapsedOf = (span: TimedTempoTransitionSpan, meanTempoAt: number): number =>
  millisecondsAt(span.endDate, resolvedWith(span, meanTempoAt), PPQ);

const SHAPES = [0.05, 0.2, 0.35, 0.5, 0.65, 0.8, 0.95];

describe('a tempo curve this package can draw is a curve it can recover', () => {
  test.each(SHAPES)('recovers meanTempoAt %s from its own samples, accelerating', (shape) => {
    const fitted = fitMeanTempoAt(RISING, samplesOf(RISING, shape));

    expect(fitted).not.toBeNull();
    expect(fitted?.meanTempoAt).toBeCloseTo(shape, 6);
  });

  test.each(SHAPES)('and the same decelerating, where the curve bends the other way', (shape) => {
    const fitted = fitMeanTempoAt(FALLING, samplesOf(FALLING, shape));

    expect(fitted?.meanTempoAt).toBeCloseTo(shape, 6);
  });

  /**
   * The error is reported in bpm², so on samples the curve passes through exactly it is the
   * floating-point residue and nothing else. Measured: below 1e-16 for every shape above.
   */
  test('and explains them, not merely lands near them', () => {
    for (const shape of SHAPES) {
      const fitted = fitMeanTempoAt(RISING, samplesOf(RISING, shape));
      expect(fitted?.error).toBeLessThan(1e-12);
    }
  });

  test('twice, identically — there is no randomness in it', () => {
    const samples = samplesOf(RISING, 0.42);

    expect(fitMeanTempoAt(RISING, samples)).toEqual(fitMeanTempoAt(RISING, samples));
  });

  test('and stays inside the domain the reader keeps a transition in', () => {
    for (const shape of [0.001, 0.999]) {
      const fitted = fitMeanTempoAt(RISING, samplesOf(RISING, shape));
      expect(fitted?.meanTempoAt).toBeGreaterThan(0);
      expect(fitted?.meanTempoAt).toBeLessThan(1);
    }
  });
});

describe('a question with no answer gets none', () => {
  test('a span with no interior sample', () => {
    const outside: TempoSample[] = [
      { date: RISING.startDate, bpm: 60 },
      { date: RISING.endDate, bpm: 120 },
      { date: RISING.endDate + 480, bpm: 130 },
    ];

    expect(fitMeanTempoAt(RISING, outside)).toBeNull();
    expect(fitMeanTempoAt(RISING, [])).toBeNull();
  });

  test('a span whose two tempi are the same, where every shape draws the same line', () => {
    const flat = { ...RISING, transitionTo: RISING.bpm };

    expect(fitMeanTempoAt(flat, samplesOf(RISING, 0.3))).toBeNull();
  });

  test('and a span of no length', () => {
    expect(fitMeanTempoAt({ ...RISING, endDate: RISING.startDate }, samplesOf(RISING, 0.3))).toBe(
      null,
    );
  });
});

describe('the shape that makes a span last a given time', () => {
  test.each(SHAPES)('round-trips the elapsed time of shape %s', (shape) => {
    const target = elapsedOf(RISING, shape);
    const solved = meanTempoAtForElapsedTime(RISING, target, PPQ);

    expect(solved).not.toBeNull();
    expect(solved).toBeCloseTo(shape, 6);
  });

  test('and does so where the span decelerates, so elapsed time runs the other way', () => {
    const target = elapsedOf(FALLING, 0.3);
    const solved = meanTempoAtForElapsedTime(FALLING, target, PPQ);

    expect(solved).toBeCloseTo(0.3, 6);
  });

  /** The claim that matters to a caller: the span really does take the time it asked for. */
  test('lands on the renderer’s own timing, not near it', () => {
    const target = elapsedOf(RISING, 0.62);
    const solved = meanTempoAtForElapsedTime(RISING, target, PPQ);

    expect(elapsedOf(RISING, solved ?? 0)).toBeCloseTo(target, 6);
  });

  test('stops early when the caller says how close is close enough', () => {
    const target = elapsedOf(RISING, 0.62);
    const loose = meanTempoAtForElapsedTime(RISING, target, PPQ, { tolerance: 5 });

    expect(Math.abs(elapsedOf(RISING, loose ?? 0) - target)).toBeLessThanOrEqual(5);
  });

  /**
   * The reachable interval is bounded by the two constants the reader collapses the instruction
   * to at the ends of the domain: the whole span at `@transition.to`, or the whole span at
   * `@bpm`. Bending the curve cannot leave it.
   */
  test('and refuses a time no shape can reach', () => {
    const atTransitionTo = elapsedOf(RISING, 0.000001);
    const atBpm = elapsedOf(RISING, 0.999999);

    expect(
      meanTempoAtForElapsedTime(RISING, Math.min(atTransitionTo, atBpm) * 0.9, PPQ),
    ).toBeNull();
    expect(
      meanTempoAtForElapsedTime(RISING, Math.max(atTransitionTo, atBpm) * 1.1, PPQ),
    ).toBeNull();
  });

  test('as it refuses a target that is not a time', () => {
    expect(meanTempoAtForElapsedTime(RISING, 0, PPQ)).toBeNull();
    expect(meanTempoAtForElapsedTime(RISING, -1, PPQ)).toBeNull();
    expect(meanTempoAtForElapsedTime(RISING, NaN, PPQ)).toBeNull();
  });
});
