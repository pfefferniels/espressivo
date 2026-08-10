/**
 * Rubato and asynchrony — DESIGN.md §5.2 and §5.7.
 *
 * These two are paired because they are the W2 dimensions that are *not* logarithmic curves:
 * rubato is a saw-toothed displacement in quarters, asynchrony a step function in
 * milliseconds priced by §4's capped metric. Between them they carry the wave's `⊥` path,
 * its `grid-truncated` path, and the `@loop` gate — the three behaviours a reader is most
 * likely to get backwards.
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
import { rubatoDistance } from '../../src/comparison/rubatoDistance.js';
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

describe('rubato: the @loop gate (AD-10)', () => {
  const WARP = 'frameLength="720.0" intensity="2.0"';

  it('warps only the FIRST frame when @loop is absent', () => {
    // The repo's own fixtures are written this way; a cyclic reading warps the whole span.
    const curve = rubatoFor(
      `<rubato date="0.0" ${WARP}/><rubato date="2880.0" frameLength="720.0"/>`,
    );
    expect(displacementTicksAt(curve, 360)).not.toBe(0);
    // Past the first frame the span is unwarped.
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

describe('rubato: the neutral parametrization is EXACTLY zero (M18)', () => {
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
    const curve = rubatoFor(
      '<rubato date="0.0" frameLength="720.0" lateStart="0.8" earlyEnd="0.2" loop="true"/>' +
        '<rubato date="2880.0" frameLength="720.0"/>',
    );
    // lateStart >= earlyEnd resets to (0, 1), which with intensity 1 is the identity.
    expect(displacementTicksAt(curve, 360)).toBe(0);
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
  it('leaves an unwarped gap with a breakpoint where @frameLength is missing (R23)', () => {
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

  it('caps the frame boundaries and reports it (AD-10/R25)', () => {
    // frameLength=1 over a long span would otherwise put ~10^6 boundaries in the grid.
    const curve = rubatoFor(
      '<rubato date="0.0" frameLength="1.0" intensity="2.0" loop="true"/>' +
        '<rubato date="720000.0" frameLength="720.0"/>',
    );
    expect(curve.breakpointsTicks.length).toBeLessThanOrEqual(RUBATO_FRAME_BOUNDARY_CAP + 4);
    expect(curve.notes.some((note) => note.kind === 'grid-truncated')).toBe(true);
  });

  it('is 0 everywhere for an absent map (R6)', () => {
    expect(displacementTicksAt(neutralRubatoCurve(), 500)).toBe(0);
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

  it('P-C1 identity: exactly 0 against itself', () => {
    expect(distanceBetween(WARPED, WARPED)).toBe(0);
  });

  it('P-C2 symmetry: bit-exact under swapping', () => {
    const other = WARPED.replace('intensity="2.0"', 'intensity="3.0"');
    expect(distanceBetween(WARPED, other)).toBe(distanceBetween(other, WARPED));
  });

  it('is positive between different intensities', () => {
    expect(
      distanceBetween(WARPED, WARPED.replace('intensity="2.0"', 'intensity="3.0"')),
    ).toBeGreaterThan(0);
  });

  it('P-C3 triangle with the relative tolerance', () => {
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
  it('is 0 ms everywhere for an absent map (R6)', () => {
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

describe('asynchrony: ANY entry ends the span (AD-29 / §5.7)', () => {
  it('lets a <style> end the span and open a neutral gap', () => {
    // This is the behaviour §5.0's original table got wrong. Under the same-local-name
    // reading the 50 ms offset would keep applying straight through the style switch.
    const curve = asynchronyFor(
      '<asynchrony date="0.0" milliseconds.offset="50.0"/>' +
        '<style date="1440.0" name.ref="S"/>' +
        '<asynchrony date="2880.0" milliseconds.offset="-30.0"/>',
    );
    const at = (ticks: number) => {
      const value = offsetAt(curve, ticks);
      return value.kind === 'value' ? value.value : NaN;
    };
    expect(at(720)).toBe(50);
    expect(at(1440)).toBe(0); // the gap the style switch opened
    expect(at(2000)).toBe(0);
    expect(at(2880)).toBe(-30);
  });
});

describe('asynchrony: a missing offset is ⊥, not 0 (R24/AD-1)', () => {
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

  it('P-C1 identity and P-C2 symmetry', () => {
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
