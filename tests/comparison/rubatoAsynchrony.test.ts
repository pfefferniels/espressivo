/**
 * Rubato and asynchrony.
 *
 * The two dimensions that are not logarithmic curves: rubato is a saw-toothed displacement in
 * quarters, asynchrony a step function in milliseconds priced by the capped metric. Between
 * them they carry the `⊥` path, the `grid-truncated` path, and the `@loop` gate — the three
 * behaviours a reader is most likely to get backwards.
 */
import { describe, it, expect } from 'vitest';
import { readComparisonPair, readScopeMapViews } from '../../src/comparison/document.js';
import type { ComparisonDocument, ComparisonPair } from '../../src/comparison/document.js';
import {
  RUBATO_FRAME_BOUNDARY_CAP,
  displacementTicksAt,
  neutralRubatoCurve,
  readRubatoSegments,
  type RubatoCurve,
} from '../../src/comparison/rubatoCurve.js';
import { rubatoCriticalPointTicks, rubatoDistance } from '../../src/comparison/rubatoDistance.js';
import {
  neutralAsynchronyCurve,
  offsetAt,
  readAsynchronySegments,
  type AsynchronyCurve,
} from '../../src/comparison/asynchronyCurve.js';
import { asynchronyDistance } from '../../src/comparison/asynchronyDistance.js';
import { isBottom } from '../../src/comparison/values.js';
import { DEFAULT_DELTA_JND } from '../../src/comparison/registry.js';

const doc = (mapName: string, body: string, header = '') =>
  '<mpm xmlns="http://www.cemfi.de/mpm/ns/1.0"><performance name="p" pulsesPerQuarter="720">' +
  `<global><header>${header}</header><dated><${mapName}>${body}</${mapName}></dated></global>` +
  '</performance></mpm>';

const rubatoCurveOf = (pair: ComparisonPair, side: 'a' | 'b'): RubatoCurve => {
  const document: ComparisonDocument = pair[side];
  const scope = document.scopes.find((candidate) => candidate.scope === 'global');
  if (scope === undefined) throw new Error('no global scope');
  return readRubatoSegments(
    readScopeMapViews(scope).get('rubatoMap') ?? null,
    document.scaleFactor,
    scope.environment,
    document.performance.global,
  );
};

const rubatoFor = (body: string, header = ''): RubatoCurve =>
  rubatoCurveOf(readComparisonPair({ a: doc('rubatoMap', body, header) }), 'a');

const asynchronyCurveOf = (pair: ComparisonPair, side: 'a' | 'b'): AsynchronyCurve => {
  const document: ComparisonDocument = pair[side];
  const scope = document.scopes.find((candidate) => candidate.scope === 'global');
  if (scope === undefined) throw new Error('no global scope');
  return readAsynchronySegments(
    readScopeMapViews(scope).get('asynchronyMap') ?? null,
    document.scaleFactor,
  );
};

const asynchronyFor = (body: string): AsynchronyCurve =>
  asynchronyCurveOf(readComparisonPair({ a: doc('asynchronyMap', body) }), 'a');

// ---------------------------------------------------------------------------
// Rubato
// ---------------------------------------------------------------------------

describe('rubato: the @loop gate', () => {
  const WARP = 'frameLength="720.0" intensity="2.0"';

  it('warps only the FIRST frame when @loop is absent', () => {
    // The repo's own fixtures are written this way; a cyclic reading warps the whole span.
    const curve = rubatoFor(
      `<rubato date="0.0" ${WARP}/><rubato date="2880.0" frameLength="720.0"/>`,
    );
    expect(displacementTicksAt(curve, 360)).not.toBe(0);
    expect(displacementTicksAt(curve, 1080)).toBe(0);
    expect(displacementTicksAt(curve, 2000)).toBe(0);
  });

  it('warps every frame of the span when @loop is true', () => {
    const curve = rubatoFor(
      `<rubato date="0.0" ${WARP} loop="true"/><rubato date="2880.0" frameLength="720.0"/>`,
    );
    // The same position inside the second, third and fourth frames warps identically.
    expect(displacementTicksAt(curve, 1080)).toBeCloseTo(displacementTicksAt(curve, 360), 9);
    expect(displacementTicksAt(curve, 1800)).toBeCloseTo(displacementTicksAt(curve, 360), 9);
    expect(displacementTicksAt(curve, 2520)).toBeCloseTo(displacementTicksAt(curve, 360), 9);
  });

  it('costs a nonzero distance between loop on and loop off', () => {
    const pair = readComparisonPair({
      a: doc(
        'rubatoMap',
        `<rubato date="0.0" ${WARP} loop="true"/><rubato date="2880.0" frameLength="720.0"/>`,
      ),
      b: doc(
        'rubatoMap',
        `<rubato date="0.0" ${WARP}/><rubato date="2880.0" frameLength="720.0"/>`,
      ),
    });
    const distance = rubatoDistance(
      rubatoCurveOf(pair, 'a'),
      rubatoCurveOf(pair, 'b'),
      pair.window,
      pair.ppq.lcm,
    ).distance;
    expect(distance).toBeGreaterThan(0);
  });
});

describe('rubato: the neutral parametrization is EXACTLY zero', () => {
  it('returns 0 without arithmetic for intensity 1 / lateStart 0 / earlyEnd 1', () => {
    const curve = rubatoFor(
      '<rubato date="0.0" frameLength="22.0" intensity="1.0" lateStart="0.0" earlyEnd="1.0" loop="true"/>' +
        '<rubato date="2880.0" frameLength="720.0"/>',
    );
    // (22, 15) is one of the integer pairs where L*(tau/L) - tau does NOT round-trip.
    for (const ticks of [15, 7, 21, 43, 100, 1000])
      expect(displacementTicksAt(curve, ticks)).toBe(0);
  });

  it('defaults an attribute-free <rubato> to the identity warp', () => {
    const curve = rubatoFor(
      '<rubato date="0.0" frameLength="25.0" loop="true"/><rubato date="2880.0" frameLength="720.0"/>',
    );
    for (const ticks of [7, 25, 57, 999]) expect(displacementTicksAt(curve, ticks)).toBe(0);
  });

  it('makes an identity warp cost exactly 0 against an absent map', () => {
    const pair = readComparisonPair({
      a: doc(
        'rubatoMap',
        '<rubato date="0.0" frameLength="22.0" loop="true"/><rubato date="2880.0" frameLength="720.0"/>',
      ),
      b:
        '<mpm xmlns="http://www.cemfi.de/mpm/ns/1.0"><performance name="p" pulsesPerQuarter="720">' +
        '<global><header/><dated/></global></performance></mpm>',
    });
    expect(
      rubatoDistance(rubatoCurveOf(pair, 'a'), rubatoCurveOf(pair, 'b'), pair.window, pair.ppq.lcm)
        .distance,
    ).toBe(0);
  });
});

describe('rubato: clamps run before evaluation (RubatoMap.ts:136-141)', () => {
  it('resets an inverted window to the full frame, performing no warp', () => {
    // The bounds must NOT sum to 1: with ls=0.8/ee=0.2 the unclamped warp is
    // 0.5*L*(ee + ls - 1) = 0 at the midpoint, so a probe there passes whether or not the reset
    // exists. ls=0.9/ee=0.3 gives -72 unclamped at t=360.
    const curve = rubatoFor(
      '<rubato date="0.0" frameLength="720.0" lateStart="0.9" earlyEnd="0.3" loop="true"/>' +
        '<rubato date="2880.0" frameLength="720.0"/>',
    );
    for (const ticks of [0, 180, 360, 540, 719]) expect(displacementTicksAt(curve, ticks)).toBe(0);
  });

  it('floors lateStart at 0 and caps earlyEnd at 1', () => {
    const clamped = rubatoFor(
      '<rubato date="0.0" frameLength="720.0" lateStart="-5" earlyEnd="9" loop="true"/>' +
        '<rubato date="2880.0" frameLength="720.0"/>',
    );
    expect(displacementTicksAt(clamped, 360)).toBe(0);
  });
});

describe('rubato: skipped instructions and the frame cap', () => {
  it('leaves an unwarped gap with a breakpoint where @frameLength is missing', () => {
    const curve = rubatoFor(
      '<rubato date="0.0" frameLength="720.0" intensity="2.0" loop="true"/>' +
        '<rubato date="1440.0" intensity="3.0"/>' +
        '<rubato date="2880.0" frameLength="720.0"/>',
    );
    expect(displacementTicksAt(curve, 360)).not.toBe(0);
    expect(displacementTicksAt(curve, 1800)).toBe(0);
    expect(curve.notes.some((note) => note.kind === 'renderer-skip')).toBe(true);
    expect(curve.breakpointsTicks).toContain(1440);
  });

  it('caps the frame boundaries and reports it', () => {
    // frameLength=1 over a long span would otherwise put ~10^6 boundaries in the grid.
    const curve = rubatoFor(
      '<rubato date="0.0" frameLength="1.0" intensity="2.0" loop="true"/>' +
        '<rubato date="720000.0" frameLength="720.0"/>',
    );
    expect(curve.breakpointsTicks.length).toBeLessThanOrEqual(RUBATO_FRAME_BOUNDARY_CAP + 4);
    expect(curve.notes.some((note) => note.kind === 'grid-truncated')).toBe(true);
  });

  it('is 0 everywhere for an absent map', () => {
    expect(displacementTicksAt(neutralRubatoCurve(), 500)).toBe(0);
  });
});

describe('rubato: the structural u* split (rule 2c) — RG-2', () => {
  /**
   * Tested at the FUNCTION level, deliberately: the integrator emits the structural split AND the K=16
   * mesh together, and those two are measured identical over 3906 pairs (0 wrong, worst
   * 2.718e-4), so no distance-level assertion can distinguish "rule 2c is present" from "rule 2c
   * was deleted". The device is therefore pinned directly.
   */
  const segment = (
    intensity: number,
    lateStart: number,
    earlyEnd: number,
    startTicks = 0,
    frameLengthTicks = 720,
  ) => ({
    startTicks,
    endTicks: startTicks + 4 * frameLengthTicks,
    frameLengthTicks,
    intensity,
    lateStart,
    earlyEnd,
    loop: true,
    neutral: false,
    poisonedEndTicks: null,
  });

  it('returns the closed-form u* for a frame-aligned pair', () => {
    // u* = (q*beta / (p*alpha))^(1/(p-q)) with alpha = ee_A - ls_A, beta = ee_B - ls_B,
    // scaled by L on both sides so the factor cancels.
    const a = segment(0.6, 0.1, 0.5);
    const b = segment(2.5, 0.15, 0.85);
    const [t] = rubatoCriticalPointTicks(a, b, 0, 720);
    expect(t).toBeDefined();
    const alpha = 720 * (0.5 - 0.1);
    const beta = 720 * (0.85 - 0.15);
    const expected = 720 * Math.pow((2.5 * beta) / (0.6 * alpha), 1 / (0.6 - 2.5));
    expect(t).toBeCloseTo(expected, 9);
  });

  it('is canonically ordered: swapping the sides gives the same point, bit for bit', () => {
    const a = segment(0.6, 0.1, 0.5);
    const b = segment(2.5, 0.15, 0.85);
    const forward = rubatoCriticalPointTicks(a, b, 0, 720);
    const reverse = rubatoCriticalPointTicks(b, a, 0, 720);
    expect(forward).toHaveLength(1);
    expect(Object.is(forward[0], reverse[0])).toBe(true);
  });

  it('declines when the two frames differ in LENGTH — no shared coordinate', () => {
    const a = segment(0.6, 0.1, 0.5, 0, 720);
    const b = segment(2.5, 0.15, 0.85, 0, 480);
    expect(rubatoCriticalPointTicks(a, b, 0, 480)).toHaveLength(0);
  });

  it('declines when the frames differ in PHASE, even at equal length', () => {
    // Equal frameLength alone does not give a shared x: two frames of the same length
    // starting at different dates have no common u.
    const a = segment(0.6, 0.1, 0.5, 0, 720);
    const b = segment(2.5, 0.15, 0.85, 360, 720);
    expect(rubatoCriticalPointTicks(a, b, 360, 720)).toHaveLength(0);
  });

  it('declines on a neutral side, which has no warp to be stationary about', () => {
    const a = { ...segment(1, 0, 1), neutral: true };
    const b = segment(2.5, 0.15, 0.85);
    expect(rubatoCriticalPointTicks(a, b, 0, 720)).toHaveLength(0);
  });
});

describe('rubato: distance', () => {
  const WARPED =
    '<rubato date="0.0" frameLength="720.0" intensity="2.0" loop="true"/>' +
    '<rubato date="2880.0" frameLength="720.0"/>';

  const distanceBetween = (a: string, b: string) => {
    const pair = readComparisonPair({ a: doc('rubatoMap', a), b: doc('rubatoMap', b) });
    return rubatoDistance(
      rubatoCurveOf(pair, 'a'),
      rubatoCurveOf(pair, 'b'),
      pair.window,
      pair.ppq.lcm,
    ).distance;
  };

  it('identity: exactly 0 against itself', () => {
    expect(distanceBetween(WARPED, WARPED)).toBe(0);
  });

  it('symmetry: bit-exact under swapping', () => {
    const other = WARPED.replace('intensity="2.0"', 'intensity="3.0"');
    expect(distanceBetween(WARPED, other)).toBe(distanceBetween(other, WARPED));
  });

  it('is positive between different intensities', () => {
    expect(
      distanceBetween(WARPED, WARPED.replace('intensity="2.0"', 'intensity="3.0"')),
    ).toBeGreaterThan(0);
  });

  it('varies lateStart/earlyEnd, the family that hid CAPITAL-4', () => {
    // At lateStart=0 / earlyEnd=1, delta-delta vanishes at both frame ends and is single-signed
    // between them — the ONE parameter family in which the sign-cancellation defect cannot
    // occur, and the family every other distance case here sits in.
    const windowed = (i: string, ls: string, ee: string) =>
      `<rubato date="0.0" frameLength="720.0" intensity="${i}" lateStart="${ls}" earlyEnd="${ee}" loop="true"/>` +
      '<rubato date="2880.0" frameLength="720.0"/>';

    const d = distanceBetween(windowed('0.6', '0.10', '0.50'), windowed('2.5', '0.15', '0.85'));
    // Over a single 1-quarter frame this pair is 1.5876 JND*quarters, and an unsplit reading
    // gives 0.000315 — three and a half orders low. The fixture loops the same warp over the
    // 4-quarter span, so the value is 4x that: 6.3503.
    expect(d).toBeCloseTo(4 * 1.587576, 2);
  });

  it('stays symmetric on a windowed pair', () => {
    const windowed = (i: string, ls: string, ee: string) =>
      `<rubato date="0.0" frameLength="720.0" intensity="${i}" lateStart="${ls}" earlyEnd="${ee}" loop="true"/>` +
      '<rubato date="2880.0" frameLength="720.0"/>';
    const a = windowed('0.6', '0.10', '0.50');
    const b = windowed('2.5', '0.15', '0.85');
    expect(Object.is(distanceBetween(a, b), distanceBetween(b, a))).toBe(true);
  });

  it('triangle with the relative tolerance', () => {
    const two = WARPED;
    const three = WARPED.replace('intensity="2.0"', 'intensity="3.0"');
    const four = WARPED.replace('intensity="2.0"', 'intensity="4.0"');
    const ab = distanceBetween(two, four);
    const ac = distanceBetween(two, three);
    const cb = distanceBetween(three, four);
    expect(ab).toBeLessThanOrEqual((ac + cb) * (1 + 1e-9));
  });
});

// ---------------------------------------------------------------------------
// Asynchrony
// ---------------------------------------------------------------------------

describe('asynchrony: the step curve', () => {
  it('is 0 ms everywhere for an absent map', () => {
    const offset = offsetAt(neutralAsynchronyCurve(), 500);
    expect(isBottom(offset)).toBe(false);
    expect(offset.kind === 'value' && offset.value).toBe(0);
  });

  it('steps at each instruction, right-continuously', () => {
    const curve = asynchronyFor(
      '<asynchrony date="0.0" milliseconds.offset="50.0"/>' +
        '<asynchrony date="1440.0" milliseconds.offset="-30.0"/>',
    );
    const at = (ticks: number) => {
      const value = offsetAt(curve, ticks);
      return value.kind === 'value' ? value.value : NaN;
    };
    expect(at(0)).toBe(50);
    expect(at(1439)).toBe(50);
    expect(at(1440)).toBe(-30);
    expect(at(99999)).toBe(-30);
  });

  it('is 0 ms BEFORE the first instruction, as a value and not ⊥', () => {
    const curve = asynchronyFor('<asynchrony date="1440.0" milliseconds.offset="50.0"/>');
    const before = offsetAt(curve, 0);
    expect(isBottom(before)).toBe(false);
    expect(before.kind === 'value' && before.value).toBe(0);
  });
});

describe('asynchrony: ANY entry ends the span, and a foreign one is ⊥', () => {
  const STYLED =
    '<asynchrony date="0.0" milliseconds.offset="50.0"/>' +
    '<style date="1440.0" name.ref="S"/>' +
    '<asynchrony date="2880.0" milliseconds.offset="-30.0"/>';

  it('opens a ⊥ span on a <style>, not a neutral gap', () => {
    // The map reads an offset off the <style> with no local-name test, gets
    // parseFloat('') = NaN, and every note in the span vanishes from the MIDI export — the
    // condition through a foreign element. Priced as a neutral gap instead, the disputed span
    // is out by a factor of 30.
    const curve = asynchronyFor(STYLED);
    const at = (ticks: number) => {
      const value = offsetAt(curve, ticks);
      return value.kind === 'value' ? value.value : NaN;
    };
    expect(at(720)).toBe(50);
    expect(isBottom(offsetAt(curve, 1440))).toBe(true);
    expect(isBottom(offsetAt(curve, 2000))).toBe(true);
    expect(at(2880)).toBe(-30);
    expect(curve.notes.some((note) => note.kind === 'renderer-error')).toBe(true);
  });

  it('prices the styled span at δ_row, the same as a missing offset', () => {
    const pair = readComparisonPair({
      a: doc('asynchronyMap', STYLED),
      b: doc('asynchronyMap', '<asynchrony date="0.0" milliseconds.offset="50.0"/>'),
    });
    const result = asynchronyDistance(
      asynchronyCurveOf(pair, 'a'),
      asynchronyCurveOf(pair, 'b'),
      pair.window,
      pair.ppq.lcm,
    );
    expect(result.capped).toBe(true);
    // The ⊥ span runs 1440..2880 ticks = 2 quarters at δ_row each.
    expect(result.distance).toBeGreaterThanOrEqual(DEFAULT_DELTA_JND * 2);
  });
});

describe('asynchrony: a missing offset is ⊥, not 0', () => {
  const POISONED =
    '<asynchrony date="0.0" milliseconds.offset="50.0"/>' +
    '<asynchrony date="1440.0"/>' +
    '<asynchrony date="2880.0" milliseconds.offset="-30.0"/>';

  it('reads the span as ⊥ and reports a renderer-error', () => {
    const curve = asynchronyFor(POISONED);
    expect(isBottom(offsetAt(curve, 1440))).toBe(true);
    expect(isBottom(offsetAt(curve, 2000))).toBe(true);
    expect(isBottom(offsetAt(curve, 720))).toBe(false);
    expect(curve.notes.some((note) => note.kind === 'renderer-error')).toBe(true);
  });

  it('prices the ⊥ span at δ_row per quarter and flags the cap', () => {
    const pair = readComparisonPair({
      a: doc('asynchronyMap', POISONED),
      b: doc('asynchronyMap', '<asynchrony date="0.0" milliseconds.offset="50.0"/>'),
    });
    const result = asynchronyDistance(
      asynchronyCurveOf(pair, 'a'),
      asynchronyCurveOf(pair, 'b'),
      pair.window,
      pair.ppq.lcm,
    );
    expect(result.capped).toBe(true);
    // The ⊥ span runs 1440..2880 ticks = 2 quarters, priced at δ_row each.
    expect(result.distance).toBeGreaterThanOrEqual(DEFAULT_DELTA_JND * 2);
  });

  it('makes ⊥ against ⊥ cost 0, not 2·δ', () => {
    const pair = readComparisonPair({
      a: doc('asynchronyMap', POISONED),
      b: doc('asynchronyMap', POISONED),
    });
    expect(
      asynchronyDistance(
        asynchronyCurveOf(pair, 'a'),
        asynchronyCurveOf(pair, 'b'),
        pair.window,
        pair.ppq.lcm,
      ).distance,
    ).toBe(0);
  });
});

describe('asynchrony: distance is exact', () => {
  const distanceBetween = (a: string, b: string) => {
    const pair = readComparisonPair({ a: doc('asynchronyMap', a), b: doc('asynchronyMap', b) });
    return asynchronyDistance(
      asynchronyCurveOf(pair, 'a'),
      asynchronyCurveOf(pair, 'b'),
      pair.window,
      pair.ppq.lcm,
    );
  };

  const FIFTY =
    '<asynchrony date="0.0" milliseconds.offset="50.0"/><asynchrony date="2880.0" milliseconds.offset="50.0"/>';
  const TWENTY =
    '<asynchrony date="0.0" milliseconds.offset="20.0"/><asynchrony date="2880.0" milliseconds.offset="20.0"/>';

  it('is the closed-form value on two constants — exact, no quadrature error', () => {
    const result = distanceBetween(FIFTY, TWENTY);
    // |50 - 20| / 30 ms = 1 JND, sustained over 4 quarters.
    expect(result.distance).toBeCloseTo(4, 12);
    expect(result.capped).toBe(false);
  });

  it('identity and symmetry', () => {
    expect(distanceBetween(FIFTY, FIFTY).distance).toBe(0);
    expect(distanceBetween(FIFTY, TWENTY).distance).toBe(distanceBetween(TWENTY, FIFTY).distance);
  });

  it('caps a difference past 2·δ_row rather than letting it run away', () => {
    const huge =
      '<asynchrony date="0.0" milliseconds.offset="100000.0"/>' +
      '<asynchrony date="2880.0" milliseconds.offset="100000.0"/>';
    const result = distanceBetween(huge, TWENTY);
    expect(result.capped).toBe(true);
    // 2*delta per quarter over 4 quarters.
    expect(result.distance).toBeCloseTo(2 * DEFAULT_DELTA_JND * 4, 9);
  });
});
