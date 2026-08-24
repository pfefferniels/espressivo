/**
 * `d_imprecision` — the density, the decomposition, the invariance.
 *
 * the fixture obligations for this dimension: one per row of the degenerate table (in
 * `imprecisionLaws.test.ts`, where the laws are read) and the SPAN PROPORTIONALITY pin
 * below — the same difference over one bar and over the whole piece, with the RATIO asserted
 * rather than the two numbers separately, because the ratio is the claim.
 */
import { describe, expect, it } from 'vitest';
import { readComparisonPair, readScopeMapViews } from '../../src/comparison/document.js';
import {
  readImprecisionSpans,
  type ImprecisionReading,
} from '../../src/comparison/imprecisionLaws.js';
import {
  imprecisionDistance,
  imprecisionGridTicks,
  lawDistance,
  lawMoments,
} from '../../src/comparison/imprecisionDistance.js';
import {
  DELTA_ZERO,
  affineLaw,
  gaussianLaw,
  triangularLaw,
  uniformLaw,
  wasserstein1,
  type ImprecisionLaw,
} from '../../src/comparison/distributions.js';
import {
  ASYNCHRONY_JND_MS,
  DEFAULT_DELTA_JND,
  comparisonRowAt,
  type ComparisonRegistryRow,
} from '../../src/comparison/registry.js';
import { bottom, valued } from '../../src/comparison/values.js';
import type { ComparisonWindow } from '../../src/comparison/window.js';

const doc = (body: string): string =>
  '<mpm xmlns="http://www.cemfi.de/mpm/ns/1.0"><performance name="p" pulsesPerQuarter="720">' +
  `<global><header/><dated><imprecisionMap.timing>${body}</imprecisionMap.timing></dated></global>` +
  '</performance></mpm>';

const readingFor = (body: string): ImprecisionReading => {
  const pair = readComparisonPair({ a: doc(body) });
  const scope = pair.a.scopes.find((candidate) => candidate.scope === 'global');
  if (scope === undefined) throw new Error('no global scope');
  return readImprecisionSpans(
    readScopeMapViews(scope).get('imprecisionMap.timing') ?? null,
    'imprecisionTiming',
    pair.a.scaleFactor,
  );
};

/** An EXPLICIT shared window, so the metric guarantee is unconditional. */
const windowOf = (endQuarters: number): ComparisonWindow => ({
  startQuarters: 0,
  endQuarters,
  rule: 'explicit',
  metricGuarantee: 'unconditional',
});

const TICKS = 720;

const uniform = (date: string, lower: number, upper: number): string =>
  `<distribution.uniform date="${date}" limit.lower="${String(lower)}" limit.upper="${String(upper)}" milliseconds.timingBasis="300"/>`;

const distanceOf = (
  aBody: string,
  bBody: string,
  endQuarters = 8,
  invariance: 'none' | 'level' | 'level-gain' = 'none',
) =>
  imprecisionDistance(
    readingFor(aBody),
    readingFor(bBody),
    windowOf(endQuarters),
    TICKS,
    invariance,
  );

describe('the density is duration-proportional (the fixture obligation)', () => {
  it('the same difference over one bar and over the whole piece scales exactly', () => {
    // One bar = 4 quarters of an 8-quarter window; then the same difference throughout.
    const oneBar = distanceOf(
      `${uniform('0.0', -30, 30)}<style date="2880.0" name.ref="none"/>`,
      '',
      8,
    );
    const whole = distanceOf(uniform('0.0', -30, 30), '', 8);
    expect(oneBar.distance).toBeGreaterThan(0);
    // Exactly half the mass, because exactly half the duration carries the difference.
    expect(whole.distance / oneBar.distance).toBeCloseTo(2, 9);
  });

  it('a difference lasting a quarter is a quarter of one lasting four', () => {
    const shortSpan = distanceOf(
      `${uniform('0.0', -30, 30)}<style date="720.0" name.ref="none"/>`,
      '',
      8,
    );
    const longSpan = distanceOf(
      `${uniform('0.0', -30, 30)}<style date="2880.0" name.ref="none"/>`,
      '',
      8,
    );
    expect(longSpan.distance / shortSpan.distance).toBeCloseTo(4, 9);
  });

  it('the mass is the closed-form W₁ times the duration, divided by the JND', () => {
    // W₁(U(-30,30), δ₀) = 15 ms; over 8 quarters at 30 ms per JND.
    const result = distanceOf(uniform('0.0', -30, 30), '', 8);
    expect(result.distance).toBeCloseTo((15 / ASYNCHRONY_JND_MS) * 8, 9);
    expect(result.mean).toBeCloseTo(15 / ASYNCHRONY_JND_MS, 9);
    expect(result.jnd).toBe(ASYNCHRONY_JND_MS);
  });
});

describe('the capped metric on two laws', () => {
  const row = comparisonRowAt(
    'imprecisionTiming',
    'distribution.uniform',
    'limit.upper',
  ) as ComparisonRegistryRow;

  it('prices ⊥ at δ_row from a law and 0 from itself', () => {
    expect(lawDistance(row, valued(DELTA_ZERO), bottom('renderer-error')).distance).toBe(
      DEFAULT_DELTA_JND,
    );
    expect(lawDistance(row, bottom('renderer-error'), bottom('renderer-error'))).toEqual({
      distance: 0,
      capped: false,
    });
  });

  it('caps a runaway difference at 2·δ_row — which a ⊥ middle term makes necessary', () => {
    const enormous = uniformLaw(-1e7, 1e7);
    const result = lawDistance(row, valued(enormous), valued(DELTA_ZERO));
    expect(result.distance).toBe(2 * DEFAULT_DELTA_JND);
    expect(result.capped).toBe(true);
    // What forces the cap: d(x, ⊥) + d(⊥, y) = 2δ must not be less than d(x, y).
    expect(result.distance).toBeLessThanOrEqual(2 * DEFAULT_DELTA_JND);
  });

  it('is 0 on identical laws and symmetric otherwise', () => {
    const law = valued(uniformLaw(-30, 30));
    expect(lawDistance(row, law, law).distance).toBe(0);
    const other = valued(triangularLaw(-30, 30, 0) as ImprecisionLaw);
    expect(lawDistance(row, law, other).distance).toBe(lawDistance(row, other, law).distance);
  });

  it('a ⊥ span costs δ_row per quarter and is reported capped', () => {
    // An empty <distribution.list> is one of the measured ⊥ routes.
    const result = distanceOf('<distribution.list date="0.0"/>', '', 8);
    expect(result.distance).toBeCloseTo(DEFAULT_DELTA_JND * 8, 9);
    expect(result.capped).toBe(true);
    expect(result.cells.every((cell) => cell.capped)).toBe(true);
  });
});

describe('the grid, and reading the law at a cell’s left edge', () => {
  it('carries every span edge of both documents', () => {
    const a = readingFor(uniform('0.0', -30, 30) + uniform('1440.0', -10, 10));
    const b = readingFor(uniform('720.0', -20, 20));
    const grid = imprecisionGridTicks(a, b, windowOf(4), TICKS);
    expect(grid).toEqual([0, 720, 1440, 2880]);
  });

  it('is empty for a degenerate window, and the distance is then 0 with a null mean', () => {
    const result = distanceOf(uniform('0.0', -30, 30), '', 0);
    expect(result.cells).toEqual([]);
    expect(result.distance).toBe(0);
    expect(result.mean).toBeNull();
  });

  it('gives distance exactly 0 for two identical documents', () => {
    const body = uniform('0.0', -30, 30) + uniform('1440.0', -10, 10);
    expect(distanceOf(body, body, 8).distance).toBe(0);
  });

  it('is symmetric to the last bit', () => {
    const a = uniform('0.0', -30, 30) + uniform('1440.0', -10, 10);
    const b =
      '<distribution.triangular date="0.0" limit.lower="-40" limit.upper="20" mode="0" clip.lower="-40" clip.upper="20" milliseconds.timingBasis="300"/>';
    expect(distanceOf(a, b, 8).distance).toBe(distanceOf(b, a, 8).distance);
  });

  it('satisfies the triangle inequality across a mixed family', () => {
    const bodies = [
      '',
      uniform('0.0', -30, 30),
      uniform('0.0', -10, 10) + uniform('1440.0', -40, 40),
      '<distribution.triangular date="0.0" limit.lower="-30" limit.upper="30" mode="0" clip.lower="-30" clip.upper="30" milliseconds.timingBasis="300"/>',
      '<distribution.gaussian date="0.0" deviation.standard="12" limit.lower="-25" limit.upper="25" milliseconds.timingBasis="300"/>',
      '<distribution.list date="0.0"/>',
      '<distribution.correlated.brownianNoise date="0.0" stepWidth.max="3" limit.lower="-30" limit.upper="30" milliseconds.timingBasis="300"/>',
    ];
    for (const a of bodies)
      for (const b of bodies)
        for (const c of bodies)
          expect(distanceOf(a, c, 8).distance).toBeLessThanOrEqual(
            (distanceOf(a, b, 8).distance + distanceOf(b, c, 8).distance) * (1 + 1e-9),
          );
  });

  it('separates that family, so the triangle test cannot pass on a zero function', () => {
    const bodies = [
      '',
      uniform('0.0', -30, 30),
      '<distribution.triangular date="0.0" limit.lower="-30" limit.upper="30" mode="0" clip.lower="-30" clip.upper="30" milliseconds.timingBasis="300"/>',
      '<distribution.list date="0.0"/>',
    ];
    for (const [i, left] of bodies.entries())
      for (const right of bodies.slice(i + 1))
        expect(distanceOf(left, right, 8).distance).toBeGreaterThan(1e-6);
  });
});

describe('processParameters — the component the marginal cannot carry', () => {
  const brownian = (step: number): string =>
    `<distribution.correlated.brownianNoise date="0.0" stepWidth.max="${String(step)}" limit.lower="-30" limit.upper="30" milliseconds.timingBasis="300"/>`;

  it('separates two brownian walks whose declared MARGINAL is identical', () => {
    // Same limits, same index-0 law — the whole difference is in the process.
    const result = distanceOf(brownian(3), brownian(30), 8);
    expect(result.processDistance).toBeGreaterThan(0);
    expect(result.distance).toBe(result.processDistance);
    // …and the marginal really is identical, which is what the separate component is for.
    expect(result.cells.every((cell) => cell.density === 0)).toBe(true);
  });

  it('prices a parameter present on one side only at δ_row (⊥, not a neutral)', () => {
    // stepWidth.max = 0 is a definite behaviour (a frozen walk), so absence has no neutral.
    const result = distanceOf(brownian(3), uniform('0.0', -15, 15), 8);
    expect(result.processDistance).toBeGreaterThan(0);
    expect(result.capped).toBe(true);
  });

  it('folds the timing basis into the process for a correlated family, and only there', () => {
    const differingBasis = distanceOf(
      brownian(3),
      brownian(3).replace('timingBasis="300"', 'timingBasis="900"'),
      8,
    );
    expect(differingBasis.processDistance).toBeGreaterThan(0);
    // The i.i.d. control: the same basis difference costs exactly nothing.
    const iid = distanceOf(
      uniform('0.0', -30, 30),
      uniform('0.0', -30, 30).replace('timingBasis="300"', 'timingBasis="900"'),
      8,
    );
    expect(iid.distance).toBe(0);
  });
});

describe('the decomposition, on the normalized measure', () => {
  it('closes the identity over the window', () => {
    const result = distanceOf(
      uniform('0.0', -30, 30),
      '<distribution.gaussian date="0.0" deviation.standard="12" limit.lower="-40" limit.upper="40" milliseconds.timingBasis="300"/>',
      8,
    );
    const { decomposition } = result;
    expect(decomposition.closingResidual).toBeLessThan(1e-6 * Math.max(1, decomposition.w2 ** 2));
  });

  it('reads a pure location difference as location and nothing else', () => {
    const result = distanceOf(uniform('0.0', -10, 10), uniform('0.0', 20, 40), 8);
    expect(result.decomposition.location).toBeCloseTo(30, 6);
    expect(result.decomposition.spread).toBeCloseTo(0, 6);
    expect(result.decomposition.rho).toBeCloseTo(1, 6);
  });

  it('reads a pure spread difference as spread', () => {
    const result = distanceOf(uniform('0.0', -10, 10), uniform('0.0', -40, 40), 8);
    expect(result.decomposition.location).toBeCloseTo(0, 6);
    expect(result.decomposition.spread).toBeGreaterThan(1);
    expect(result.decomposition.rho).toBeCloseTo(1, 6);
  });

  it('marks a window with no comparable spread shapeless rather than dividing by it', () => {
    const result = distanceOf('', uniform('0.0', -30, 30), 8);
    expect(result.decomposition.shapeless).toBe(true);
    expect(result.decomposition.rho).toBeNull();
    expect(result.decomposition.shape).toBe(0);
  });

  it('drops a ⊥ cell from the decomposition while keeping its δ_row in the headline', () => {
    const result = distanceOf('<distribution.list date="0.0"/>', uniform('0.0', -30, 30), 8);
    expect(result.distance).toBeGreaterThan(0);
    // No cell contributed moments, so the decomposition is empty rather than invented.
    expect(result.decomposition.w2).toBe(0);
    expect(result.decomposition.shapeless).toBe(true);
  });
});

describe('the invariance for a distribution dimension', () => {
  it('‘level’ removes a shared location offset', () => {
    const centred = distanceOf(uniform('0.0', -10, 10), uniform('0.0', 40, 60), 8, 'level');
    expect(centred.distance).toBeCloseTo(0, 9);
    // The control: without the mode it is a real difference.
    expect(distanceOf(uniform('0.0', -10, 10), uniform('0.0', 40, 60), 8).distance).toBeGreaterThan(
      1,
    );
  });

  it('‘level’ leaves a spread difference standing, which is what makes it a location mode', () => {
    const result = distanceOf(uniform('0.0', -10, 10), uniform('0.0', -40, 40), 8, 'level');
    expect(result.distance).toBeGreaterThan(0.1);
  });

  it('‘level-gain’ additionally removes the spread — a pure shape comparison', () => {
    const result = distanceOf(uniform('0.0', -10, 10), uniform('0.0', 20, 100), 8, 'level-gain');
    expect(result.distance).toBeCloseTo(0, 6);
    // …and it does NOT collapse two genuinely different SHAPES.
    const shapes = distanceOf(
      uniform('0.0', -10, 10),
      '<distribution.triangular date="0.0" limit.lower="-10" limit.upper="10" mode="0" clip.lower="-10" clip.upper="10" milliseconds.timingBasis="300"/>',
      8,
      'level-gain',
    );
    expect(shapes.distance).toBeGreaterThan(1e-3);
  });

  it('leaves a document with no spread alone rather than scaling by zero', () => {
    const result = distanceOf('', uniform('0.0', -10, 10), 8, 'level-gain');
    expect(Number.isFinite(result.distance)).toBe(true);
    expect(result.distance).toBeGreaterThan(0);
  });

  it('the mode is stamped on the result', () => {
    expect(distanceOf('', '', 8, 'level').invariance).toBe('level');
  });
});

describe('affineLaw and lawMoments — the machinery invariance rests on', () => {
  it('folds every law kind rather than wrapping it', () => {
    expect(affineLaw(uniformLaw(-10, 10), 2, 5).kind).toBe('uniform');
    expect(affineLaw(triangularLaw(-10, 10, 3) as ImprecisionLaw, 2, 5).kind).toBe('triangular');
    expect(affineLaw(gaussianLaw(4, -8, 8), 2, 5).kind).toBe('gaussian');
    expect(affineLaw(DELTA_ZERO, 2, 5)).toEqual({ kind: 'delta', at: 5 });
  });

  it('shifts the moments exactly, Gaussian included', () => {
    for (const law of [
      uniformLaw(-10, 10),
      triangularLaw(-10, 10, 3) as ImprecisionLaw,
      gaussianLaw(4, -8, 8),
      gaussianLaw(4, 0, 0),
    ]) {
      const before = lawMoments(law);
      const after = lawMoments(affineLaw(law, 3, 7));
      expect(after.mean).toBeCloseTo(3 * before.mean + 7, 6);
      expect(after.sigma).toBeCloseTo(3 * before.sigma, 6);
    }
  });

  it('is the identity at scale 1 and shift 0, by reference', () => {
    const law = uniformLaw(-10, 10);
    expect(affineLaw(law, 1, 0)).toBe(law);
  });

  it('W₁ is equivariant under a shared shift, which is why ‘level’ is metric-safe', () => {
    const a = uniformLaw(-10, 10);
    const b = triangularLaw(-30, 30, 0) as ImprecisionLaw;
    expect(wasserstein1(affineLaw(a, 1, 17), affineLaw(b, 1, 17))).toBeCloseTo(
      wasserstein1(a, b),
      9,
    );
  });

  it('refuses a non-positive scale rather than reflecting the law', () => {
    expect(() => affineLaw(uniformLaw(-10, 10), -1, 0)).toThrow(/positive finite scale/);
    expect(() => affineLaw(uniformLaw(-10, 10), 0, 0)).toThrow(/positive finite scale/);
  });
});
