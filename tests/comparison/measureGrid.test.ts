/**
 * The measure grid's arithmetic — `readComparisonMsm`'s `measures`, and the `measure` field
 * every §9.3 op and §7.3 segment carries.
 *
 * Bar k starts at `first + k · length`, never at a running sum: repeated addition of a
 * non-representable length compounds its rounding error once per bar.
 *
 * Every power-of-two denominator gives a representable length — 4/4 is 4, 6/8 is 3, 7/8 is
 * 3.5 — so the whole vendored corpus is exact under either spelling and no other test here can
 * tell them apart. 5/6 gives 3.3333333333333335, and the two grids part company by 1.1e-13 by
 * bar 57 and never reconverge. Measure numbers and beats are published report fields, and
 * `measurePositionAt` divides `startQuarters` straight into the reported `beat`, so the drift
 * reaches the output rather than staying an internal detail.
 *
 * The 4/4 case is the control: it passes under both spellings.
 */
import { describe, it, expect } from 'vitest';
import { readComparisonMsm, measurePositionAt, parseMsmRoot } from '../../src/comparison/msm.js';

const PPQ = 720;

/** One signature, and one note long enough to make the grid run for `bars` measures. */
const msmWith = (numerator: number, denominator: number, bars: number): string => {
  const lengthQuarters = (numerator * 4) / denominator;
  const durationTicks = Math.ceil(lengthQuarters * bars * PPQ);
  return (
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<msm title="grid" pulsesPerQuarter="${String(PPQ)}">` +
    `<global><header/><dated><timeSignatureMap>` +
    `<timeSignature date="0.0" numerator="${String(numerator)}" denominator="${String(denominator)}"/>` +
    `</timeSignatureMap></dated></global>` +
    `<part name="p" number="1" midi.channel="0" midi.port="0"><header/><dated><score>` +
    `<note date="0.0" midi.pitch="60.0" duration="${String(durationTicks)}"/>` +
    `</score></dated></part>` +
    `</msm>`
  );
};

const gridOf = (numerator: number, denominator: number, bars: number) =>
  readComparisonMsm(parseMsmRoot(msmWith(numerator, denominator, bars))).measures;

describe('the measure grid is first + k·length, not a running sum', () => {
  it('places every 5/6 bar exactly where the multiplication puts it', () => {
    const length = (5 * 4) / 6; // 3.3333333333333335 — not representable
    const measures = gridOf(5, 6, 60);
    expect(measures.length).toBeGreaterThanOrEqual(58);

    // Exact equality, not `toBeCloseTo`: a tolerance would pass for the accumulator too.
    for (const [k, measure] of measures.entries())
      expect({ k, start: measure.startQuarters }).toEqual({ k, start: 0 + k * length });

    // Non-vacuous: the accumulator really does answer something else by bar 57.
    let accumulated = 0;
    for (let k = 0; k < 57; k += 1) accumulated += length;
    expect(accumulated).not.toBe(57 * length);
  });

  it('numbers the bars from 1, consecutively, whatever the length does', () => {
    const measures = gridOf(5, 6, 20);
    expect(measures.map((measure) => measure.number)).toEqual(
      measures.map((_measure, index) => index + 1),
    );
  });

  it('reports a beat computed off the undrifted bar start', () => {
    const length = (5 * 4) / 6;
    const measures = gridOf(5, 6, 60);
    // Three quarters into bar 58. `beat` is one-based in the denominator's own unit, so a
    // sixth-note here: 1 + 3 / (4/6).
    const position = measurePositionAt(measures, 57 * length + 3);
    expect(position).toEqual({ number: 58, beat: 1 + 3 / (4 / 6) });
  });

  it('4/4 is exact under either spelling — the control', () => {
    const measures = gridOf(4, 4, 40);
    expect(measures.length).toBeGreaterThanOrEqual(40);
    for (const [k, measure] of measures.entries())
      expect({ k, start: measure.startQuarters }).toEqual({ k, start: k * 4 });
  });
});
