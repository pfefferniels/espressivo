/**
 * The level / gain / shape decomposition (§1.2, AD-18), the invariance modes (§7.4, AD-20), and
 * P-C3b zero-set transitivity.
 *
 * The oracle is the closing identity: if `level² + gain² + 2σ_Aσ_B(1−r)` does not equal
 * `‖h_A − h_B‖₂²` then one of the four fields is wrong, and a plausible-looking number would
 * not reveal which. Every case below checks the identity as well as the fields.
 */
import { describe, it, expect } from 'vitest';
import {
  applyInvariance,
  curveMoments,
  decomposeCurves,
  isShapelessUnder,
  type SampledCurve,
} from '../../src/comparison/decomposition.js';
import { readComparisonPair, readScopeMapViews } from '../../src/comparison/document.js';
import type { ComparisonDocument, ComparisonPair } from '../../src/comparison/document.js';
import {
  readTempoSegments,
  quarterBpmAt,
  type TempoCurve,
} from '../../src/comparison/tempoCurve.js';
import { refinementGridTicks, tempoDistance } from '../../src/comparison/tempoDistance.js';
import { readMovementSegments } from '../../src/comparison/pedalCurve.js';
import { pedalGridTicks, pedalSampler } from '../../src/comparison/pedalDistance.js';
import { readAccentuationSegments } from '../../src/comparison/accentuationCurve.js';
import {
  accentuationGridTicks,
  accentuationSampler,
} from '../../src/comparison/accentuationDistance.js';
import { elementAt } from '../../src/prelude/index.js';

/** Scope 0 — the global one — of one side of a comparison pair, checked. */
const sideScope = (pair: ComparisonPair, side: 'a' | 'b') =>
  elementAt(pair[side].scopes, 0, `document ${side}'s scopes`);

/** A uniform grid over [0, span], fine enough that GL-10 sees smooth cells. */
const uniformGrid = (span: number, cells: number): number[] =>
  Array.from({ length: cells + 1 }, (_, i) => (i * span) / cells);

const SPAN = 2880;
const GRID = uniformGrid(SPAN, 8);

describe('curveMoments', () => {
  it('gives a constant curve its value as mean and zero spread', () => {
    const moments = curveMoments(() => 4.2, GRID);
    expect(moments.mean).toBeCloseTo(4.2, 12);
    expect(moments.variance).toBe(0);
    expect(moments.sigma).toBe(0);
  });

  it('matches the closed form on a linear ramp', () => {
    // h(t) = t/span on [0, span]: mean 1/2, variance 1/12.
    const moments = curveMoments((t) => t / SPAN, GRID);
    expect(moments.mean).toBeCloseTo(0.5, 10);
    expect(moments.variance).toBeCloseTo(1 / 12, 10);
  });

  it('is computed against the NORMALIZED measure, so it is span-independent (AD-18)', () => {
    const short = curveMoments((t) => t / 720, uniformGrid(720, 8));
    const long = curveMoments((t) => t / 7200, uniformGrid(7200, 8));
    expect(short.mean).toBeCloseTo(long.mean, 10);
    expect(short.variance).toBeCloseTo(long.variance, 10);
  });
});

describe('the decomposition identity closes (§1.2)', () => {
  const closes = (a: SampledCurve, b: SampledCurve, grid = GRID) => {
    const result = decomposeCurves(a, b, grid);
    expect(result.identity).toBeCloseTo(result.l2Squared, 8);
    return result;
  };

  it('closes for two constants — pure level', () => {
    const result = closes(
      () => Math.log(60),
      () => Math.log(120),
    );
    expect(result.level).toBeCloseTo(Math.log(2), 10);
    expect(result.gain).toBe(0);
    expect(result.shapeless).toBe(true);
  });

  it('closes for a ramp against its own shifted copy — pure level, no shape', () => {
    const result = closes(
      (t) => t / SPAN,
      (t) => t / SPAN + 3,
    );
    expect(result.level).toBeCloseTo(3, 8);
    expect(result.gain).toBeCloseTo(0, 8);
    expect(result.r).toBeCloseTo(1, 8);
    expect(result.shape).toBeCloseTo(0, 6);
  });

  it('closes for a ramp against a scaled copy — pure gain, no shape', () => {
    const result = closes(
      (t) => t / SPAN,
      (t) => (2 * t) / SPAN,
    );
    expect(result.r).toBeCloseTo(1, 8);
    expect(result.shape).toBeCloseTo(0, 6);
    expect(result.gain).toBeGreaterThan(0);
  });

  it('closes for a ramp against its mirror — maximal shape difference', () => {
    const result = closes(
      (t) => t / SPAN,
      (t) => 1 - t / SPAN,
    );
    expect(result.r).toBeCloseTo(-1, 8);
    // shape = sqrt(2(1-r)) = sqrt(4) = 2 at r = -1
    expect(result.shape).toBeCloseTo(2, 6);
    expect(result.level).toBeCloseTo(0, 8);
    expect(result.gain).toBeCloseTo(0, 8);
  });

  it('closes for two genuinely different shapes', () => {
    closes(
      (t) => Math.sin((4 * Math.PI * t) / SPAN),
      (t) => t / SPAN,
      uniformGrid(SPAN, 16),
    );
  });

  it('is exactly 0 in every field against itself', () => {
    const curve = (t: number) => Math.log(60 + (60 * t) / SPAN);
    const result = decomposeCurves(curve, curve, GRID);
    expect(result.level).toBe(0);
    expect(result.gain).toBe(0);
    expect(result.l2Squared).toBeCloseTo(0, 12);
    expect(result.shape).toBeCloseTo(0, 6);
  });
});

describe('the shapeless convention (§1.2 / C14)', () => {
  it('nulls shape and r, flags shapeless, and keeps the identity exact', () => {
    const result = decomposeCurves(
      () => Math.log(60),
      (t) => t / SPAN,
      GRID,
    );
    expect(result.shapeless).toBe(true);
    expect(result.shape).toBeNull();
    expect(result.r).toBeNull();
    // The shape term is 0 by convention, so the identity still closes exactly.
    expect(result.identity).toBeCloseTo(result.level ** 2 + result.gain ** 2, 12);
  });

  it('does NOT report r = 0 on a constant window', () => {
    // r is undefined there; reporting 0 would claim the curves are uncorrelated when one of
    // them has nothing to correlate.
    expect(
      decomposeCurves(
        () => 1,
        () => 2,
        GRID,
      ).r,
    ).toBeNull();
  });

  it('flags shapeless on the CONSTANT side whichever side it is', () => {
    // What needs pinning is that the flag tracks the data, not the argument position.
    const constant: SampledCurve = () => 1;
    const varying: SampledCurve = (t) => t / SPAN;
    expect(decomposeCurves(constant, varying, GRID).shapeless).toBe(true);
    expect(decomposeCurves(varying, constant, GRID).shapeless).toBe(true);
    expect(decomposeCurves(varying, varying, GRID).shapeless).toBe(false);
  });
});

describe('invariance modes (§7.4 / AD-20)', () => {
  const ramp: SampledCurve = (t) => Math.log(60) + (2 * t) / SPAN;
  const moments = curveMoments(ramp, GRID);

  it("'none' is the identity", () => {
    expect(applyInvariance(ramp, 'none', moments)(1000)).toBe(ramp(1000));
  });

  it("'level' centres the curve on its own window mean", () => {
    const centred = applyInvariance(ramp, 'level', moments);
    expect(curveMoments(centred, GRID).mean).toBeCloseTo(0, 10);
    // The shape is untouched: differences between points are preserved exactly.
    expect(centred(2000) - centred(1000)).toBeCloseTo(ramp(2000) - ramp(1000), 12);
  });

  it("'level' removes a MULTIPLICATIVE factor in a log space", () => {
    // A roll read k times faster adds ln k everywhere; centring removes it entirely.
    const faster: SampledCurve = (t) => ramp(t) + Math.log(1.1);
    const a = applyInvariance(ramp, 'level', curveMoments(ramp, GRID));
    const b = applyInvariance(faster, 'level', curveMoments(faster, GRID));
    expect(decomposeCurves(a, b, GRID).l2Squared).toBeCloseTo(0, 12);
  });

  it("'level' removes only an OFFSET in a linear space, leaving the factor (§7.4's table)", () => {
    // c*x - mean(c*x) = c(x - mean x): the factor survives. The trap the table exists to
    // prevent.
    const linear: SampledCurve = (t) => t / SPAN;
    const scaled: SampledCurve = (t) => (1.5 * t) / SPAN;
    const a = applyInvariance(linear, 'level', curveMoments(linear, GRID));
    const b = applyInvariance(scaled, 'level', curveMoments(scaled, GRID));
    expect(decomposeCurves(a, b, GRID).l2Squared).toBeGreaterThan(1e-3);
  });

  it("'level-gain' normalizes to pure shape, so a scaled copy is identical", () => {
    const scaled: SampledCurve = (t) => 5 * ramp(t) + 100;
    const a = applyInvariance(ramp, 'level-gain', curveMoments(ramp, GRID));
    const b = applyInvariance(scaled, 'level-gain', curveMoments(scaled, GRID));
    expect(decomposeCurves(a, b, GRID).l2Squared).toBeCloseTo(0, 10);
  });

  it("'level-gain' on a CONSTANT curve gives the zero curve, not a division by zero", () => {
    const constant: SampledCurve = () => Math.log(60);
    const constantMoments = curveMoments(constant, GRID);
    const canonical = applyInvariance(constant, 'level-gain', constantMoments);
    expect(canonical(0)).toBe(0);
    expect(canonical(1500)).toBe(0);
    expect(Number.isNaN(canonical(1500))).toBe(false);
    expect(isShapelessUnder('level-gain', constantMoments)).toBe(true);
  });

  it("does not flag shapeless under 'none' or 'level'", () => {
    const constantMoments = curveMoments(() => 1, GRID);
    expect(isShapelessUnder('none', constantMoments)).toBe(false);
    expect(isShapelessUnder('level', constantMoments)).toBe(false);
  });
});

describe('P-C3b zero-set transitivity (AD-21)', () => {
  /**
   * `d(A,B) = 0 ∧ d(B,C) = 0 ⟹ d(A,C) = 0` — the cheapest detector for an M1-class defect. Run
   * on the tempo dimension, where the zero set is populated by genuinely different encodings of
   * one performed curve.
   */
  const tempoDoc = (map: string, header = '') =>
    '<mpm xmlns="http://www.cemfi.de/mpm/ns/1.0"><performance name="p" pulsesPerQuarter="720">' +
    `<global><header>${header}</header><dated><tempoMap>${map}</tempoMap></dated></global>` +
    '</performance></mpm>';

  const curveOf = (pair: ComparisonPair, side: 'a' | 'b'): TempoCurve => {
    const document: ComparisonDocument = pair[side];
    const scope = document.scopes.find((candidate) => candidate.scope === 'global');
    if (scope === undefined) throw new Error('no global scope');
    return readTempoSegments(
      readScopeMapViews(scope).get('tempoMap') ?? null,
      document.scaleFactor,
      scope.environment,
      document.performance.global,
    );
  };

  const distance = (x: string, y: string) => {
    const pair = readComparisonPair({ a: tempoDoc(x), b: tempoDoc(y) });
    return tempoDistance(curveOf(pair, 'a'), curveOf(pair, 'b'), pair.window, pair.ppq.lcm)
      .distance;
  };

  // Three encodings of one performed curve: 60 qbpm throughout.
  // A: a bare constant.
  // B: the same value reached through a styleDef, with a <style> switch.
  // C: the same value written twice, the second instruction redundant.
  const A =
    '<tempo date="0.0" bpm="60" beatLength="0.25"/><tempo date="2880.0" bpm="60" beatLength="0.25"/>';
  const B_MAP =
    '<style date="0.0" name.ref="T"/><tempo date="0.0" bpm="Andante" beatLength="0.25"/>' +
    '<tempo date="2880.0" bpm="Andante" beatLength="0.25"/>';
  const B_HEADER =
    '<tempoStyles><styleDef name="T"><tempoDef name="Andante" value="60.0"/></styleDef></tempoStyles>';
  const C =
    '<tempo date="0.0" bpm="60" beatLength="0.25"/><tempo date="1440.0" bpm="60" beatLength="0.25"/>' +
    '<tempo date="2880.0" bpm="60" beatLength="0.25"/>';

  const distanceWithHeaders = (
    x: { map: string; header?: string },
    y: { map: string; header?: string },
  ) => {
    const pair = readComparisonPair({
      a: tempoDoc(x.map, x.header ?? ''),
      b: tempoDoc(y.map, y.header ?? ''),
    });
    return tempoDistance(curveOf(pair, 'a'), curveOf(pair, 'b'), pair.window, pair.ppq.lcm)
      .distance;
  };

  it('holds across three different encodings of one performed curve', () => {
    const ab = distanceWithHeaders({ map: A }, { map: B_MAP, header: B_HEADER });
    const bc = distanceWithHeaders({ map: B_MAP, header: B_HEADER }, { map: C });
    const ac = distanceWithHeaders({ map: A }, { map: C });

    expect(ab).toBe(0);
    expect(bc).toBe(0);
    expect(ac).toBe(0);
  });

  it('holds where the middle document differs only by a redundant instruction', () => {
    expect(distance(A, C)).toBe(0);
    expect(distance(C, A)).toBe(0);
  });

  it('is not vacuous: the same machinery gives a NONZERO distance for a real difference', () => {
    // Without this, every assertion above would pass on an implementation that returns 0.
    const different =
      '<tempo date="0.0" bpm="90" beatLength="0.25"/><tempo date="2880.0" bpm="90" beatLength="0.25"/>';
    expect(distance(A, different)).toBeGreaterThan(0);
  });

  it('keeps the zero set closed under an inert trailing transition (AD-8)', () => {
    // A trailing @transition.to is inert, so this performs the same curve as A.
    const inert =
      '<tempo date="0.0" bpm="60" beatLength="0.25"/>' +
      '<tempo date="2880.0" bpm="60" beatLength="0.25" transition.to="200" meanTempoAt="0.5"/>';
    expect(distance(A, inert)).toBe(0);
    expect(distance(inert, C)).toBe(0);
  });
});

describe('decomposition on the W3a cut 1 dimensions', () => {
  const NS = 'http://www.cemfi.de/mpm/ns/1.0';
  const pedalDoc = (map: string) =>
    `<mpm xmlns="${NS}"><performance name="p" pulsesPerQuarter="720">` +
    `<global><header/><dated><movementMap>${map}</movementMap></dated></global>` +
    '</performance></mpm>';

  const pedalCurveOf = (pair: ComparisonPair, side: 'a' | 'b') =>
    readMovementSegments(
      readScopeMapViews(sideScope(pair, side)).get('movementMap') ?? null,
      pair[side].scaleFactor,
    );

  it('closes the identity on a pedal pair, in fractions of full travel', () => {
    // T is the identity for a gain space, so the moments are pedal positions and `level` can be
    // checked against the two curves by eye.
    const pair = readComparisonPair({
      a: pedalDoc(
        '<movement date="0.0" position="1.0" transition.to="0.0"/>' +
          '<movement date="1440.0" position="0.0"/>',
      ),
      b: pedalDoc(
        '<movement date="0.0" position="0.6" transition.to="0.2" curvature="0.9"/>' +
          '<movement date="1440.0" position="0.2"/>',
      ),
      window: { start: 0, end: 2 },
    });
    const curveA = pedalCurveOf(pair, 'a');
    const curveB = pedalCurveOf(pair, 'b');
    const a = pedalSampler(curveA, pair.window, pair.ppq.lcm);
    const b = pedalSampler(curveB, pair.window, pair.ppq.lcm);
    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
    if (a === null || b === null) throw new Error('unreachable');

    const grid = pedalGridTicks(curveA, curveB, pair.window, pair.ppq.lcm);
    const result = decomposeCurves(a, b, grid);
    expect(result.identity).toBeCloseTo(result.l2Squared, 10);
    expect(result.level).toBeGreaterThan(0);
    expect(result.level).toBeLessThan(1);
  });

  it('refuses to decompose a window carrying a ⊥ span, rather than substituting a number', () => {
    // §1.2 takes moments: a mean and a variance. ⊥ has nothing to contribute to either, and a
    // stand-in would be read back as a pedal position.
    const pair = readComparisonPair({
      a: pedalDoc(
        '<movement date="0.0" position="0.0" transition.to="1.0" curvature="4"/>' +
          '<movement date="1440.0" position="1.0"/>' +
          '<style date="2160.0" name.ref="S"/>',
      ),
      window: { start: 0, end: 2 },
    });
    expect(pedalSampler(pedalCurveOf(pair, 'a'), pair.window, pair.ppq.lcm)).toBeNull();
  });

  it('closes the identity on an accentuation pair, in velocity units', () => {
    const styles =
      '<metricalAccentuationStyles><styleDef name="M">' +
      '<accentuationPatternDef name="p" length="4.0">' +
      '<accentuation beat="1" value="20" transition.to="-5"/>' +
      '<accentuation beat="3" value="-10" transition.to="8"/>' +
      '</accentuationPatternDef></styleDef></metricalAccentuationStyles>';
    const accentuationDoc = (scale: string) =>
      `<mpm xmlns="${NS}"><performance name="p" pulsesPerQuarter="720">` +
      `<global><header>${styles}</header><dated><metricalAccentuationMap>` +
      '<style date="0.0" name.ref="M"/>' +
      `<accentuationPattern date="0.0" name.ref="p" scale="${scale}" loop="true"/>` +
      '</metricalAccentuationMap></dated></global></performance></mpm>';

    const pair = readComparisonPair({
      a: accentuationDoc('1.0'),
      b: accentuationDoc('2.0'),
      window: { start: 0, end: 8 },
    });
    const curveFor = (side: 'a' | 'b') =>
      readAccentuationSegments(
        readScopeMapViews(sideScope(pair, side)).get('metricalAccentuationMap') ?? null,
        pair[side].scaleFactor,
        sideScope(pair, side).environment,
        pair[side].performance.global,
      );
    const a = accentuationSampler(curveFor('a'), pair.window, pair.ppq.lcm);
    const b = accentuationSampler(curveFor('b'), pair.window, pair.ppq.lcm);
    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
    if (a === null || b === null) throw new Error('unreachable');

    const grid = accentuationGridTicks(curveFor('a'), curveFor('b'), pair.window, pair.ppq.lcm);
    const result = decomposeCurves(a, b, grid);
    expect(result.identity).toBeCloseTo(result.l2Squared, 8);
    // One is exactly twice the other, so they are perfectly correlated: pure level and gain,
    // no shape difference — the case §1.2 exists to separate.
    expect(result.shapeless).toBe(false);
    expect(result.r).toBeCloseTo(1, 8);
    expect(result.shape).toBeCloseTo(0, 6);
    expect(result.gain).toBeGreaterThan(0);
  });
});

describe('decomposition on a real tempo pair', () => {
  it('closes on the Telemann Baroque/Fast pair', () => {
    const text =
      '<mpm xmlns="http://www.cemfi.de/mpm/ns/1.0"><performance name="p" pulsesPerQuarter="720">' +
      '<global><header/><dated><tempoMap>' +
      '<tempo date="0.0" bpm="58" beatLength="0.25"/>' +
      '<tempo date="1440.0" bpm="72" beatLength="0.25" transition.to="52" meanTempoAt="0.6"/>' +
      '<tempo date="2880.0" bpm="58" beatLength="0.25"/>' +
      '</tempoMap></dated></global></performance></mpm>';
    const other = text.replace(/bpm="58"/g, 'bpm="123"').replace('bpm="72"', 'bpm="130"');

    const pair = readComparisonPair({ a: text, b: other });
    const curveA = readTempoSegments(
      readScopeMapViews(sideScope(pair, 'a')).get('tempoMap') ?? null,
      pair.a.scaleFactor,
      sideScope(pair, 'a').environment,
      pair.a.performance.global,
    );
    const curveB = readTempoSegments(
      readScopeMapViews(sideScope(pair, 'b')).get('tempoMap') ?? null,
      pair.b.scaleFactor,
      sideScope(pair, 'b').environment,
      pair.b.performance.global,
    );
    const grid = refinementGridTicks(curveA, curveB, pair.window, pair.ppq.lcm);

    const result = decomposeCurves(
      (ticks) => Math.log(quarterBpmAt(curveA, ticks)),
      (ticks) => Math.log(quarterBpmAt(curveB, ticks)),
      grid,
    );
    expect(result.identity).toBeCloseTo(result.l2Squared, 6);
    // The two differ mostly in level — one is roughly twice the other throughout.
    expect(result.level).toBeGreaterThan(result.gain);
  });
});
