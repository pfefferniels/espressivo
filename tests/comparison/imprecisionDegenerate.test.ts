/**
 * Cut-4 degenerate-table pins (AD-46 inheritance #1, answered by execution — AD-47).
 *
 * The clip-less triangular draws null into a number-typed field (DistributionData initialises
 * every parameter to null); the write-back coerces it arithmetically (attValue + null =
 * attValue) and String() wraps only the finite sum, so no path stringifies the raw null. The
 * performed effect is exactly no imprecision, never NaN, chord shake path included. The
 * renderer does re-serialize touched attributes ("0.0" -> "0"), a byte fingerprint with no
 * numeric content.
 */
import { describe, expect, it } from 'vitest';
import { performMsm } from '../../src/index.js';
import { filterMap } from '../../src/prelude/index.js';

const MSM = `<?xml version="1.0" encoding="UTF-8"?>
<msm title="probe" pulsesPerQuarter="720" xmlns:xml="http://www.w3.org/XML/1998/namespace">
  <global><header/><dated/></global>
  <part name="p" number="1" midi.channel="0" midi.port="0">
    <header/>
    <dated>
      <score>
        <note date="0.0" midi.pitch="60.0" duration="360.0" velocity="80.0"/>
        <note date="0.0" midi.pitch="64.0" duration="360.0" velocity="80.0"/>
        <note date="720.0" midi.pitch="67.0" duration="360.0" velocity="80.0"/>
      </score>
    </dated>
  </part>
</msm>`;

const mpm = (dist: string): string => `<?xml version="1.0" encoding="UTF-8"?>
<mpm xmlns="http://www.cemfi.de/mpm/ns/1.0">
  <performance name="perf" pulsesPerQuarter="720">
    <global><header/><dated/></global>
    <part name="p" number="1" midi.channel="0" midi.port="0">
      <header/>
      <dated>
        <imprecisionMap.timing>
          ${dist}
        </imprecisionMap.timing>
      </dated>
    </part>
  </performance>
</mpm>`;

describe('AD-46 probe: clip-less triangular through the full pipeline', () => {
  it('performs as exactly no imprecision (δ₀), never NaN — chord included', () => {
    const clipless = mpm(
      '<distribution.triangular date="0.0" limit.lower="-30.0" limit.upper="30.0" mode="0.0" milliseconds.timingBasis="300.0"/>',
    );
    // Seeded: this is the only arm that draws, and without `@seed` it would draw from
    // `Math.random()`.
    const withClips = mpm(
      '<distribution.triangular date="0.0" seed="20260816" limit.lower="-30.0" limit.upper="30.0" mode="0.0" clip.lower="-30.0" clip.upper="30.0" milliseconds.timingBasis="300.0"/>',
    );
    const none = mpm('');

    const rClipless = performMsm({ msm: MSM, mpm: clipless });
    const rNone = performMsm({ msm: MSM, mpm: none });
    const rClips = performMsm({ msm: MSM, mpm: withClips });

    const msDates = (xml: string): readonly string[] =>
      filterMap([...xml.matchAll(/milliseconds\.date="([^"]+)"/g)], (m) => m[1] ?? null);

    const a = msDates(rClipless);
    const b = msDates(rNone);
    // Numerically, not byte-wise: the write-back re-serializes the attributes it touches.
    expect(a.map(Number)).toEqual(b.map(Number));
    expect(a.some((v) => v.includes('NaN'))).toBe(false);
    expect(a.length).toBeGreaterThan(0);
    // Non-vacuity control: with clips the imprecision genuinely moves dates.
    const c = msDates(rClips);
    expect(c).not.toEqual(b);
  });
});
