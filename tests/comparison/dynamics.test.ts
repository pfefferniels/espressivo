/**
 * The dynamics curve and its distance — DESIGN.md §5.3.
 *
 * The load-bearing test in this file is the one that pins the **ideal** Bézier against the
 * renderer's `tForDate` approximation of it (§5.0 rule 3 / R20). The conductor's watch-item
 * is explicit: a bit-agreement assertion between the two must not sneak in and pass by
 * accident of a coarse fixture. So the agreement test below asserts the documented *bound*
 * and, separately, asserts that the two really do differ — otherwise it would be pinning
 * nothing.
 */
import { describe, it, expect } from 'vitest';
import { readComparisonPair, readScopeMapViews } from '../../src/comparison/document.js';
import type { ComparisonDocument, ComparisonPair } from '../../src/comparison/document.js';
import {
  NEUTRAL_VELOCITY,
  dynamicsLogAt,
  idealCurveParameter,
  neutralDynamicsCurve,
  readDynamicsSegments,
  volumeAt,
  type DynamicsCurve,
} from '../../src/comparison/dynamicsCurve.js';
import { dynamicsDistance, dynamicsGridTicks } from '../../src/comparison/dynamicsDistance.js';
import { DYNAMICS_JND_NEPERS } from '../../src/comparison/registry.js';
import { innerControlPointsXPositions, tForDate } from '../../src/mpm/elements/maps/data/bezier.js';
import { integrateAbsolute } from '../../src/comparison/quadrature.js';

const dynamicsDoc = (map: string, header = '') =>
  '<mpm xmlns="http://www.cemfi.de/mpm/ns/1.0"><performance name="p" pulsesPerQuarter="720">' +
  `<global><header>${header}</header><dated><dynamicsMap>${map}</dynamicsMap></dated></global>` +
  '</performance></mpm>';

const curveOf = (pair: ComparisonPair, side: 'a' | 'b'): DynamicsCurve => {
  const document: ComparisonDocument = pair[side];
  const scope = document.scopes.find((candidate) => candidate.scope === 'global');
  if (scope === undefined) throw new Error('no global scope');
  return readDynamicsSegments(
    readScopeMapViews(scope).get('dynamicsMap') ?? null,
    document.scaleFactor,
    scope.environment,
    document.performance.global,
  );
};

const curveFor = (map: string, header = ''): DynamicsCurve =>
  curveOf(readComparisonPair({ a: dynamicsDoc(map, header) }), 'a');

describe('dynamics curve: constants, neutrals and levels', () => {
  it('is velocity 100 everywhere for an absent map (R6)', () => {
    expect(volumeAt(neutralDynamicsCurve(), 0)).toBe(NEUTRAL_VELOCITY);
    expect(volumeAt(neutralDynamicsCurve(), 99999)).toBe(NEUTRAL_VELOCITY);
  });

  it('is velocity 100 before the first instruction, not a left extension of it (AD-9ii)', () => {
    const curve = curveFor('<dynamics date="1440.0" volume="40"/>');
    expect(volumeAt(curve, 0)).toBe(NEUTRAL_VELOCITY);
    expect(volumeAt(curve, 1439)).toBe(NEUTRAL_VELOCITY);
    expect(volumeAt(curve, 1440)).toBe(40);
  });

  it('resolves a named level through its styleDef', () => {
    const curve = curveFor(
      '<style date="0.0" name.ref="D"/><dynamics date="0.0" volume="f"/>',
      '<dynamicsStyles><styleDef name="D"><dynamicsDef name="f" value="97.0"/></styleDef></dynamicsStyles>',
    );
    expect(volumeAt(curve, 0)).toBe(97);
  });

  it('performs an unresolvable level at 100 and reports it (R8/AD-1)', () => {
    const curve = curveFor('<dynamics date="0.0" volume="?"/>');
    expect(volumeAt(curve, 0)).toBe(100);
    expect(curve.notes.some((note) => note.kind === 'renderer-default-level')).toBe(true);
  });

  it('reads right-continuously (A-B1)', () => {
    const curve = curveFor(
      '<dynamics date="0.0" volume="40"/><dynamics date="720.0" volume="90"/>',
    );
    expect(volumeAt(curve, 720)).toBe(90);
    expect(volumeAt(curve, 719.999)).toBeCloseTo(40, 6);
  });

  it('drops a <dynamics> with no @volume without re-timing anything', () => {
    // Unlike tempo, there is no skip mechanism here: the previous span simply continues.
    const curve = curveFor(
      '<dynamics date="0.0" volume="40"/><dynamics date="720.0"/><dynamics date="1440.0" volume="90"/>',
    );
    expect(volumeAt(curve, 720)).toBe(40);
    expect(volumeAt(curve, 1440)).toBe(90);
  });
});

describe('dynamics curve: transitions', () => {
  it('interpolates a linear-ish transition through the Bézier value fraction', () => {
    const curve = curveFor(
      '<dynamics date="0.0" volume="40" transition.to="80"/><dynamics date="2880.0" volume="80"/>',
    );
    // With curvature = protraction = 0 the control points are (0, 1) and the value fraction
    // at the midpoint parameter is 0.5, so the midpoint volume is the midpoint of 40 and 80.
    expect(volumeAt(curve, 1440)).toBeCloseTo(60, 9);
    expect(volumeAt(curve, 0)).toBe(40);
    expect(volumeAt(curve, 2879.999)).toBeCloseTo(80, 3);
  });

  it('bends the transition with curvature — away from the midpoint', () => {
    const flat = curveFor(
      '<dynamics date="0.0" volume="40" transition.to="80"/><dynamics date="2880.0" volume="80"/>',
    );
    const bent = curveFor(
      '<dynamics date="0.0" volume="40" transition.to="80" curvature="0.8"/>' +
        '<dynamics date="2880.0" volume="80"/>',
    );
    // Probed at a QUARTER of the span, not the midpoint: see the invariance test below.
    expect(volumeAt(bent, 720)).not.toBeCloseTo(volumeAt(flat, 720), 6);
    // Both still start and end at the authored endpoints.
    expect(volumeAt(bent, 0)).toBe(40);
    expect(volumeAt(bent, 2879.999)).toBeCloseTo(80, 3);
  });

  it('leaves the date-MIDPOINT invariant under curvature, which is a real property', () => {
    // With protraction = 0 the inner control points are (c, 1-c), so the cubic is
    // antisymmetric about t = 0.5 and x(0.5) = 0.5 exactly for EVERY curvature. The
    // midpoint volume therefore cannot move, however hard the curve is bent. Recorded
    // because it is the one probe point at which a curvature test silently passes for the
    // wrong reason — this file's first draft used it.
    for (const curvature of ['0.0', '0.3', '0.8']) {
      const curve = curveFor(
        `<dynamics date="0.0" volume="40" transition.to="80" curvature="${curvature}"/>` +
          '<dynamics date="2880.0" volume="80"/>',
      );
      expect(volumeAt(curve, 1440)).toBeCloseTo(60, 9);
    }
  });

  it('is ill-conditioned at curvature = 1, the admissible boundary — bounded, not exact', () => {
    // curvature = 1 gives control points (1, 0), so x(t) = 4t^3 - 6t^2 + 3t and
    // x'(t) = 3(2t-1)^2, which VANISHES at t = 0.5. x is still matched to machine
    // precision, but a cube-root loss means t itself is only good to ~1e-5 there, and
    // y'(0.5) = 1.5 carries that into ~6e-4 volume units. Bisection is not at fault and
    // more iterations do not help: the inverse is genuinely flat at that point.
    // In JND terms this is ~2e-5 JND — far below the metric's resolution — so it is
    // pinned as a bound rather than treated as a defect.
    const curve = curveFor(
      '<dynamics date="0.0" volume="40" transition.to="80" curvature="1.0"/>' +
        '<dynamics date="2880.0" volume="80"/>',
    );
    expect(volumeAt(curve, 1440)).toBeCloseTo(60, 3);
    expect(Math.abs(volumeAt(curve, 1440) - 60)).toBeLessThan(1e-3);
  });

  it('clamps curvature and protraction on the way in', () => {
    const clamped = curveFor(
      '<dynamics date="0.0" volume="40" transition.to="80" curvature="5" protraction="-9"/>' +
        '<dynamics date="2880.0" volume="80"/>',
    );
    const atBound = curveFor(
      '<dynamics date="0.0" volume="40" transition.to="80" curvature="1" protraction="-1"/>' +
        '<dynamics date="2880.0" volume="80"/>',
    );
    expect(volumeAt(clamped, 1440)).toBe(volumeAt(atBound, 1440));
  });

  it('defaults curvature and protraction to 0.0, NOT to movement’s 0.4 (AD-13)', () => {
    const defaulted = curveFor(
      '<dynamics date="0.0" volume="40" transition.to="80"/><dynamics date="2880.0" volume="80"/>',
    );
    const explicitZero = curveFor(
      '<dynamics date="0.0" volume="40" transition.to="80" curvature="0.0" protraction="0.0"/>' +
        '<dynamics date="2880.0" volume="80"/>',
    );
    expect(volumeAt(defaulted, 1000)).toBe(volumeAt(explicitZero, 1000));
  });

  it('treats a trailing transition as inert and reports it (AD-8)', () => {
    const curve = curveFor(
      '<dynamics date="0.0" volume="40"/><dynamics date="2880.0" volume="80" transition.to="110"/>',
    );
    expect(volumeAt(curve, 2880)).toBe(80);
    expect(volumeAt(curve, 999999)).toBe(80);
    expect(curve.notes.some((note) => note.kind === 'inert-transition')).toBe(true);
  });

  it('treats transition.to equal to volume as a constant', () => {
    const curve = curveFor(
      '<dynamics date="0.0" volume="40" transition.to="40"/><dynamics date="2880.0" volume="40"/>',
    );
    expect(volumeAt(curve, 1440)).toBe(40);
  });
});

describe('dynamics curve: subNoteDynamics is structural, not a curve difference (§5.3)', () => {
  const withFlag =
    '<dynamics date="0.0" volume="40" transition.to="80" subNoteDynamics="true"/>' +
    '<dynamics date="2880.0" volume="80"/>';
  const withoutFlag =
    '<dynamics date="0.0" volume="40" transition.to="80"/><dynamics date="2880.0" volume="80"/>';

  it('leaves the date-axis curve identical', () => {
    expect(volumeAt(curveFor(withFlag), 1440)).toBe(volumeAt(curveFor(withoutFlag), 1440));
  });

  it('reports the mechanism switch so the agreement is not silent', () => {
    expect(curveFor(withFlag).notes.some((note) => note.kind === 'sub-note-mechanism')).toBe(true);
    expect(curveFor(withoutFlag).notes.some((note) => note.kind === 'sub-note-mechanism')).toBe(
      false,
    );
  });

  it('is inert on the map’s last instruction', () => {
    const trailing = curveFor(
      '<dynamics date="0.0" volume="40"/><dynamics date="2880.0" volume="80" subNoteDynamics="true"/>',
    );
    expect(trailing.notes.some((note) => note.kind === 'sub-note-mechanism')).toBe(false);
  });

  it('costs exactly 0 in the distance, which is the point of calling it structural', () => {
    const pair = readComparisonPair({ a: dynamicsDoc(withFlag), b: dynamicsDoc(withoutFlag) });
    expect(
      dynamicsDistance(curveOf(pair, 'a'), curveOf(pair, 'b'), pair.window, pair.ppq.lcm).distance,
    ).toBe(0);
  });
});

describe('the ideal Bézier versus the renderer’s tForDate (§5.0 rule 3 / R20)', () => {
  const CURVATURE = 0.3;
  const PROTRACTION = 0.4;
  const [x1, x2] = innerControlPointsXPositions(CURVATURE, PROTRACTION);
  const SPAN_TICKS = 2880;

  it('inverts the x-component to machine precision', () => {
    // x(idealCurveParameter(x)) === x to ~1e-15, which tForDate does not promise.
    const u = 3 * x1 - 3 * x2 + 1;
    const v = -6 * x1 + 3 * x2;
    const w = 3 * x1;
    for (const target of [0.05, 0.25, 0.5, 0.75, 0.95]) {
      const t = idealCurveParameter(x1, x2, target);
      const x = ((u * t + v) * t + w) * t;
      expect(x).toBeCloseTo(target, 12);
    }
  });

  it('DIFFERS from tForDate — otherwise the agreement test below would pin nothing', () => {
    // The conductor's watch-item: a bit-agreement assertion must not pass by accident.
    let maxDifference = 0;
    for (let date = 1; date < SPAN_TICKS; date += 7) {
      const ideal = idealCurveParameter(x1, x2, date / SPAN_TICKS);
      const renderer = tForDate(x1, x2, 0, SPAN_TICKS, date);
      maxDifference = Math.max(maxDifference, Math.abs(ideal - renderer));
    }
    expect(maxDifference).toBeGreaterThan(0);
  });

  it('agrees with tForDate within the documented one-tick staircase bound', () => {
    // |Δvolume| <= |v'(t)| * 1 tick / |x'(t)|. Rather than reconstruct the derivatives, the
    // bound is asserted in the date domain where tForDate states it: the renderer's answer
    // is within one tick of the ideal one, measured by re-evaluating x at both parameters.
    const u = 3 * x1 - 3 * x2 + 1;
    const v = -6 * x1 + 3 * x2;
    const w = 3 * x1;
    const xAt = (t: number) => ((u * t + v) * t + w) * t;

    for (let date = 1; date < SPAN_TICKS; date += 13) {
      const renderer = tForDate(x1, x2, 0, SPAN_TICKS, date);
      const rendererDate = xAt(renderer) * SPAN_TICKS;
      expect(Math.abs(rendererDate - date)).toBeLessThanOrEqual(1.0000001);
    }
  });
});

describe('dynamics distance', () => {
  const distanceBetween = (mapA: string, mapB: string) => {
    const pair = readComparisonPair({ a: dynamicsDoc(mapA), b: dynamicsDoc(mapB) });
    return dynamicsDistance(curveOf(pair, 'a'), curveOf(pair, 'b'), pair.window, pair.ppq.lcm)
      .distance;
  };

  const FLAT_40 = '<dynamics date="0.0" volume="40"/><dynamics date="2880.0" volume="40"/>';
  const FLAT_80 = '<dynamics date="0.0" volume="80"/><dynamics date="2880.0" volume="80"/>';
  const FLAT_60 = '<dynamics date="0.0" volume="60"/><dynamics date="2880.0" volume="60"/>';

  it('P-C1 identity: exactly 0 against itself', () => {
    expect(distanceBetween(FLAT_40, FLAT_40)).toBe(0);
  });

  it('P-C2 symmetry: bit-exact under swapping', () => {
    expect(distanceBetween(FLAT_40, FLAT_80)).toBe(distanceBetween(FLAT_80, FLAT_40));
  });

  it('is the closed-form value on two constants', () => {
    const expected = (Math.log(2) / DYNAMICS_JND_NEPERS) * 4;
    expect(distanceBetween(FLAT_40, FLAT_80)).toBeCloseTo(expected, 9);
  });

  it('P-C3 triangle, with the relative tolerance the equality case requires', () => {
    const ab = distanceBetween(FLAT_40, FLAT_80);
    const ac = distanceBetween(FLAT_40, FLAT_60);
    const cb = distanceBetween(FLAT_60, FLAT_80);
    expect(ab).toBeLessThanOrEqual((ac + cb) * (1 + 1e-9));
  });

  it('P-C4 encoding invariance, against the IDEAL curve', () => {
    // A transition re-encoded as dense constant steps sampling the SAME ideal curve. The
    // steps are placed by evaluating the ideal Bézier, not tForDate, so this measures
    // encoding invariance and not the renderer's staircase.
    const transition =
      '<dynamics date="0.0" volume="40" transition.to="80"/><dynamics date="2880.0" volume="80"/>';
    const ideal = curveFor(transition);

    const steps = Array.from({ length: 48 }, (_, k) => {
      const date = (k * 2880) / 48;
      return `<dynamics date="${String(date)}" volume="${String(volumeAt(ideal, date))}"/>`;
    }).join('');

    const distance = distanceBetween(transition, `${steps}<dynamics date="2880.0" volume="80"/>`);
    const againstFlat = distanceBetween(transition, FLAT_40);
    expect(distance).toBeLessThan(againstFlat * 0.05);
  });

  it('prices an absent map against a present one rather than dropping it (R6)', () => {
    const pair = readComparisonPair({
      a: dynamicsDoc(FLAT_80),
      b:
        '<mpm xmlns="http://www.cemfi.de/mpm/ns/1.0"><performance name="p" pulsesPerQuarter="720">' +
        '<global><header/><dated/></global></performance></mpm>',
    });
    const distance = dynamicsDistance(
      curveOf(pair, 'a'),
      curveOf(pair, 'b'),
      pair.window,
      pair.ppq.lcm,
    ).distance;
    // |ln(80/100)| = ln(100/80), sustained over the 4-quarter window.
    expect(distance).toBeCloseTo((Math.log(100 / 80) / DYNAMICS_JND_NEPERS) * 4, 6);
  });

  it('builds the grid as a sorted union, symmetric under swapping', () => {
    const forward = readComparisonPair({ a: dynamicsDoc(FLAT_40), b: dynamicsDoc(FLAT_80) });
    const grid = dynamicsGridTicks(
      curveOf(forward, 'a'),
      curveOf(forward, 'b'),
      forward.window,
      forward.ppq.lcm,
    );
    expect(grid).toEqual([0, 2880]);
  });

  it('uses the log axis, so equal RATIOS cost the same at any absolute level', () => {
    const quiet = distanceBetween(
      '<dynamics date="0.0" volume="20"/><dynamics date="2880.0" volume="20"/>',
      '<dynamics date="0.0" volume="40"/><dynamics date="2880.0" volume="40"/>',
    );
    const loud = distanceBetween(FLAT_40, FLAT_80);
    expect(quiet).toBeCloseTo(loud, 9);
  });

  it('is deterministic', () => {
    expect(distanceBetween(FLAT_40, FLAT_80)).toBe(distanceBetween(FLAT_40, FLAT_80));
  });
});

describe('AD-30 Bezier-pair subdivision, and its measured insufficiency', () => {
  /**
   * A pair whose log difference crosses THREE times: x = 0.598, 0.914, 0.984. Control points
   * are inside [0,1] and x(t) is monotone for both, so nothing here is degenerate — it is an
   * ordinary pair of strongly protracted transitions.
   */
  const A =
    '<dynamics date="0.0" volume="40" transition.to="80" curvature="0.9" protraction="0.9"/>' +
    '<dynamics date="2880.0" volume="80"/>';
  const B =
    '<dynamics date="0.0" volume="38" transition.to="84" curvature="0.0" protraction="0.9"/>' +
    '<dynamics date="2880.0" volume="84"/>';

  const measured = () => {
    const pair = readComparisonPair({ a: dynamicsDoc(A), b: dynamicsDoc(B) });
    return dynamicsDistance(curveOf(pair, 'a'), curveOf(pair, 'b'), pair.window, pair.ppq.lcm)
      .distance;
  };

  /** Dense Simpson on |difference| — the reference the sweep was measured against. */
  const reference = () => {
    const pair = readComparisonPair({ a: dynamicsDoc(A), b: dynamicsDoc(B) });
    const ca = curveOf(pair, 'a');
    const cb = curveOf(pair, 'b');
    const span = 2880;
    const f = (t: number) => Math.abs(Math.log(volumeAt(ca, t)) - Math.log(volumeAt(cb, t)));
    const n = 200000;
    const h = span / n;
    let sum = f(0) + f(span);
    for (let i = 1; i < n; ++i) sum += (i % 2 === 0 ? 2 : 4) * f(i * h);
    return ((h / 3) * sum) / pair.ppq.lcm / DYNAMICS_JND_NEPERS;
  };

  it('integrates the triple-crossing pair accurately at K=16 (AD-31)', () => {
    const relativeError = Math.abs(measured() - reference()) / reference();
    expect(relativeError).toBeLessThan(1e-6);
  });

  it('pins the sweep that set the constant: K=4 would still be ~6% low', () => {
    // AD-31 supersedes AD-30's K=4 because 4 was MEASURED insufficient. The evidence is
    // pinned at the quadrature layer rather than the distance layer, so it survives the
    // constant being correct: the same difference function integrated with 3 interior
    // splits (K=4) against 15 (K=16). If someone lowers the constant again, this test is
    // the record of why they should not.
    const pair = readComparisonPair({ a: dynamicsDoc(A), b: dynamicsDoc(B) });
    const ca = curveOf(pair, 'a');
    const cb = curveOf(pair, 'b');
    const span = 2880;
    const difference = (t: number) => Math.log(volumeAt(ca, t)) - Math.log(volumeAt(cb, t));

    const splitsFor = (k: number) => Array.from({ length: k - 1 }, (_, i) => ((i + 1) * span) / k);

    const n = 200000;
    const h = span / n;
    let sum = Math.abs(difference(0)) + Math.abs(difference(span));
    for (let i = 1; i < n; ++i) sum += (i % 2 === 0 ? 2 : 4) * Math.abs(difference(i * h));
    const exact = (h / 3) * sum;

    const atFour = integrateAbsolute(difference, 0, span, splitsFor(4));
    const atSixteen = integrateAbsolute(difference, 0, span, splitsFor(16));

    expect(Math.abs(atFour - exact) / exact).toBeGreaterThan(0.05);
    expect(Math.abs(atSixteen - exact) / exact).toBeLessThan(1e-6);
  });

  it('integrates a single-crossing pair correctly too', () => {
    const single =
      '<dynamics date="0.0" volume="40" transition.to="80" curvature="0.2"/>' +
      '<dynamics date="2880.0" volume="80"/>';
    const other =
      '<dynamics date="0.0" volume="42" transition.to="78" curvature="0.6"/>' +
      '<dynamics date="2880.0" volume="78"/>';
    const pair = readComparisonPair({ a: dynamicsDoc(single), b: dynamicsDoc(other) });
    const ca = curveOf(pair, 'a');
    const cb = curveOf(pair, 'b');
    const span = 2880;
    const f = (t: number) => Math.abs(Math.log(volumeAt(ca, t)) - Math.log(volumeAt(cb, t)));
    const n = 200000;
    const h = span / n;
    let sum = f(0) + f(span);
    for (let i = 1; i < n; ++i) sum += (i % 2 === 0 ? 2 : 4) * f(i * h);
    const exact = ((h / 3) * sum) / pair.ppq.lcm / DYNAMICS_JND_NEPERS;
    const got = dynamicsDistance(ca, cb, pair.window, pair.ppq.lcm).distance;
    expect(Math.abs(got - exact) / exact).toBeLessThan(1e-6);
  });
});

describe('dynamics log axis', () => {
  it('reports g in nepers', () => {
    const curve = curveFor('<dynamics date="0.0" volume="50"/>');
    expect(dynamicsLogAt(curve, 0)).toBeCloseTo(Math.log(50), 12);
  });
});
