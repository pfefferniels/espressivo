import { describe, expect, test } from 'vitest';
import {
  dateBeforeRubato,
  rubatoAt,
  type Rubato,
} from '../../src/mpm/elements/maps/data/rubato.js';

const FRAME = 720;

const frame = (over: Partial<Rubato> = {}): Rubato => ({
  startDate: 0,
  endDate: Number.MAX_VALUE,
  frameLength: FRAME,
  intensity: 1,
  lateStart: 0,
  earlyEnd: 1,
  loop: true,
  ...over,
});

/**
 * The shapes a resolved `<rubato>` can take. Every one of them is a frame the renderer would
 * accept: `resolveRubato` has already floored `lateStart`, capped `earlyEnd` and widened an
 * inverted window, so nothing degenerate reaches an evaluator.
 */
const SHAPES: [string, Rubato][] = [
  ['the identity warp', frame()],
  ['a delaying curve', frame({ intensity: 1.6 })],
  ['a rushing curve', frame({ intensity: 0.6 })],
  ['a window inside the frame', frame({ intensity: 1.6, lateStart: 0.2, earlyEnd: 0.9 })],
  ['a linear warp into a window', frame({ intensity: 1, lateStart: 0.25, earlyEnd: 0.75 })],
  [
    'a frame that does not start at 0',
    frame({ startDate: 2160, intensity: 2.2, lateStart: 0.1, earlyEnd: 0.8 }),
  ],
  ['a strongly delaying curve', frame({ intensity: 3.4, lateStart: 0.05, earlyEnd: 0.95 })],
];

/** Three frames of it, so the `%` that makes the warp repeat is actually exercised. */
const positionsOf = (r: Rubato): number[] => {
  const dates: number[] = [];
  for (let repetition = 0; repetition < 3; repetition++) {
    for (let local = 0; local < FRAME; local += 7.5) {
      dates.push(r.startDate + repetition * FRAME + local);
    }
  }
  return dates;
};

describe('dateBeforeRubato inverts rubatoAt', () => {
  /**
   * Stated as a round trip rather than against a table of expected ticks, for the reason the
   * tempo pair states: a table is computed with the same arithmetic, so it agrees with a wrong
   * implementation as readily as with a right one.
   *
   * The tolerance is floating-point noise and nothing else. This inverse is algebra, not a
   * search — there is no bracket it was stopped at, which is what an iterative inverse of the
   * same curve is accurate only to. One measured at a 1-tick output tolerance was out by up to
   * 11 ticks.
   */
  test.each(SHAPES)('over %s, across three frames', (_, r) => {
    for (const date of positionsOf(r)) {
      const warped = rubatoAt(r, date);
      expect(Number.isFinite(warped), `${date} warped to ${warped}`).toBe(true);
      expect(dateBeforeRubato(r, warped)).toBeCloseTo(date, 6);
    }
  });

  /** And the other way round, which is the direction a caller taking a warp off actually uses. */
  test.each(SHAPES)('and rubatoAt inverts it, over %s', (_, r) => {
    for (const date of positionsOf(r)) {
      const original = dateBeforeRubato(r, date);
      if (!Number.isFinite(original)) continue;
      expect(rubatoAt(r, original)).toBeCloseTo(date, 6);
    }
  });
});

describe('the warp itself', () => {
  test('leaves every date where it was when the window is the whole frame at intensity 1', () => {
    const r = frame();
    for (const date of positionsOf(r)) expect(rubatoAt(r, date)).toBeCloseTo(date, 9);
  });

  test('pins a frame boundary, which no curve may move', () => {
    for (const [, r] of SHAPES) {
      // At the start of a frame the local position is 0, so the curve contributes `lateStart`
      // of a frame and nothing else — the one place the answer is knowable without the curve.
      expect(rubatoAt(r, r.startDate)).toBeCloseTo(r.startDate + r.lateStart * FRAME, 9);
    }
  });

  test('stays inside its window, which is what makes the inverse total on that window', () => {
    for (const [, r] of SHAPES) {
      for (const date of positionsOf(r)) {
        const local = (rubatoAt(r, date) - r.startDate) % FRAME;
        expect(local).toBeGreaterThanOrEqual(r.lateStart * FRAME - 1e-9);
        expect(local).toBeLessThan(r.earlyEnd * FRAME + 1e-9);
      }
    }
  });
});

describe('what does not come back as a plausible tick', () => {
  /**
   * A date outside the window is one no date under this instruction warps to. The honest answer
   * is that there is none — a clamp would hand back a tick that looks like an answer, and a
   * caller has no way to tell the difference.
   */
  test('a position the warp cannot produce is NaN, not the nearest one it can', () => {
    const r = frame({ intensity: 1.6, lateStart: 0.2, earlyEnd: 0.9 });
    expect(dateBeforeRubato(r, r.startDate + 10)).toBeNaN();
    expect(dateBeforeRubato(r, r.startDate + 0.95 * FRAME)).toBeNaN();
  });

  test('an unknown date is NaN in both directions', () => {
    const r = frame({ intensity: 1.6, lateStart: 0.2, earlyEnd: 0.9 });
    expect(rubatoAt(r, NaN)).toBeNaN();
    expect(dateBeforeRubato(r, NaN)).toBeNaN();
  });

  /**
   * NaN travels — `data/rubato.ts`'s header is the record of it. A `frameLength="banana"`
   * survives resolution as `NaN` rather than falling back to a def, and every date under it
   * comes out `NaN` rather than unwarped.
   */
  test('a malformed frame warps by NaN rather than by the identity', () => {
    const r = frame({ frameLength: NaN });
    expect(rubatoAt(r, 360)).toBeNaN();
    expect(dateBeforeRubato(r, 360)).toBeNaN();
  });
});
