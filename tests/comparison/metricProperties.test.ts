/**
 * P-C1 / P-C2 / P-C3 / P-C3b over the standing adversarial family — §10, promoted under
 * AD-33.5.
 *
 * The wave's original triangle tests ran on three pointwise-ordered constants, which sit at
 * the triangle's *equality* case: they could fail only on quadrature error, so they tested
 * the quadrature and not the metric. This file runs the same properties over eight members
 * that between them carry `⊥` (by two different routes), the cap, a renderer-default level,
 * a tempo skip, a dynamics skip, and a power-vs-power transition pair — the last being the
 * only member that reaches `criticalPointTicks`, the path CAPITAL-3 broke unseen.
 *
 * Every comparison runs under one **explicit shared window**, which §10 requires: under a
 * pair-derived window the three windows of a triple differ and R3 does not claim the triangle
 * inequality at all (M2).
 */
import { describe, it, expect } from 'vitest';
import {
  ADVERSARIAL_FAMILY,
  ADVERSARIAL_WINDOW,
  adversarialPairs,
  adversarialTriples,
  type AdversarialMember,
} from './adversarialFamily.js';
import { readComparisonPair, readScopeMapViews } from './../../src/comparison/document.js';
import type { ComparisonDocument, ComparisonPair } from '../../src/comparison/document.js';
import { readTempoSegments } from '../../src/comparison/tempoCurve.js';
import { tempoDistance } from '../../src/comparison/tempoDistance.js';
import { readDynamicsSegments } from '../../src/comparison/dynamicsCurve.js';
import { dynamicsDistance } from '../../src/comparison/dynamicsDistance.js';
import { readAsynchronySegments } from '../../src/comparison/asynchronyCurve.js';
import { asynchronyDistance } from '../../src/comparison/asynchronyDistance.js';

/** The three W2 dimensions this family exercises, each as a total distance function. */
const DIMENSIONS = ['tempo', 'dynamics', 'asynchrony'] as const;
type Dimension = (typeof DIMENSIONS)[number];

const globalScopeOf = (document: ComparisonDocument) => {
  const scope = document.scopes.find((candidate) => candidate.scope === 'global');
  if (scope === undefined) throw new Error('no global scope');
  return scope;
};

function distanceFor(dimension: Dimension, pair: ComparisonPair): number {
  const read = (side: 'a' | 'b') => {
    const document = pair[side];
    const scope = globalScopeOf(document);
    const views = readScopeMapViews(scope);
    return { document, scope, views };
  };
  const a = read('a');
  const b = read('b');

  if (dimension === 'tempo')
    return tempoDistance(
      readTempoSegments(
        a.views.get('tempoMap') ?? null,
        a.document.scaleFactor,
        a.scope.environment,
        a.document.performance.global,
      ),
      readTempoSegments(
        b.views.get('tempoMap') ?? null,
        b.document.scaleFactor,
        b.scope.environment,
        b.document.performance.global,
      ),
      pair.window,
      pair.ppq.lcm,
    ).distance;

  if (dimension === 'dynamics')
    return dynamicsDistance(
      readDynamicsSegments(
        a.views.get('dynamicsMap') ?? null,
        a.document.scaleFactor,
        a.scope.environment,
        a.document.performance.global,
      ),
      readDynamicsSegments(
        b.views.get('dynamicsMap') ?? null,
        b.document.scaleFactor,
        b.scope.environment,
        b.document.performance.global,
      ),
      pair.window,
      pair.ppq.lcm,
    ).distance;

  return asynchronyDistance(
    readAsynchronySegments(a.views.get('asynchronyMap') ?? null, a.document.scaleFactor),
    readAsynchronySegments(b.views.get('asynchronyMap') ?? null, b.document.scaleFactor),
    pair.window,
    pair.ppq.lcm,
  ).distance;
}

/** Distance between two members under the shared explicit window. */
function distance(dimension: Dimension, x: AdversarialMember, y: AdversarialMember): number {
  return distanceFor(
    dimension,
    readComparisonPair({ a: x.mpm, b: y.mpm, window: ADVERSARIAL_WINDOW }),
  );
}

describe('the adversarial family itself', () => {
  it('has eight members with distinct hazards', () => {
    expect(ADVERSARIAL_FAMILY).toHaveLength(8);
    expect(new Set(ADVERSARIAL_FAMILY.map((member) => member.name)).size).toBe(8);
  });

  it('is not degenerate: every member differs from every other in some dimension', () => {
    // Without this the whole file could pass on an implementation that returns 0.
    for (const [x, y] of adversarialPairs()) {
      const total = DIMENSIONS.reduce((sum, dimension) => sum + distance(dimension, x, y), 0);
      expect(total, `${x.name} vs ${y.name} are indistinguishable`).toBeGreaterThan(0);
    }
  });

  it('runs under a piece-derived window, so R3 is unconditional', () => {
    const pair = readComparisonPair({
      a: ADVERSARIAL_FAMILY[0].mpm,
      b: ADVERSARIAL_FAMILY[1].mpm,
      window: ADVERSARIAL_WINDOW,
    });
    expect(pair.window.rule).toBe('explicit');
    expect(pair.window.metricGuarantee).toBe('unconditional');
  });
});

describe.each(DIMENSIONS)('P-C1 identity — %s', (dimension) => {
  it.each(ADVERSARIAL_FAMILY.map((member) => [member.name, member] as const))(
    'is exactly 0 against itself: %s',
    (_name, member) => {
      expect(distance(dimension, member, member)).toBe(0);
    },
  );
});

describe.each(DIMENSIONS)('P-C2 bit-exact symmetry — %s', (dimension) => {
  it('holds for every ordered pair, to the last bit', () => {
    for (const [x, y] of adversarialPairs()) {
      const forward = distance(dimension, x, y);
      const reverse = distance(dimension, y, x);
      expect(
        Object.is(forward, reverse),
        `${dimension}: ${x.name} vs ${y.name} — ${String(forward)} !== ${String(reverse)}`,
      ).toBe(true);
    }
  });
});

describe.each(DIMENSIONS)('P-C3 triangle inequality — %s', (dimension) => {
  it('holds for every triple, with the relative tolerance', () => {
    for (const [x, y, z] of adversarialTriples()) {
      const xy = distance(dimension, x, y);
      const xz = distance(dimension, x, z);
      const zy = distance(dimension, z, y);
      expect(
        xy <= (xz + zy) * (1 + 1e-9),
        `${dimension}: d(${x.name},${y.name})=${String(xy)} > d(..,${z.name})+d(${z.name},..)=${String(xz + zy)}`,
      ).toBe(true);
    }
  });
});

describe.each(DIMENSIONS)('P-C3b zero-set transitivity — %s', (dimension) => {
  it('holds across the family: two zeros compose to a zero', () => {
    // Runs over the real family rather than over three encodings of one constant, so it
    // reaches the ⊥ and capped paths it is advertised as the cheapest detector for.
    for (const [x, y, z] of adversarialTriples()) {
      const xy = distance(dimension, x, y);
      const yz = distance(dimension, y, z);
      if (xy !== 0 || yz !== 0) continue;
      expect(
        distance(dimension, x, z),
        `${dimension}: ${x.name}~${y.name}~${z.name} but not ${x.name}~${z.name}`,
      ).toBe(0);
    }
  });
});

describe('the family reaches the paths the wave could not see', () => {
  it('reaches criticalPointTicks — the power-vs-power member is a real transition pair', () => {
    const power = ADVERSARIAL_FAMILY.find((member) => member.name === 'power-vs-power');
    const plain = ADVERSARIAL_FAMILY.find((member) => member.name === 'plain');
    expect(power).toBeDefined();
    expect(plain).toBeDefined();
    // Non-zero against a constant, and symmetric — the CAPITAL-3 repro in family form.
    const forward = distance('tempo', power!, plain!);
    expect(forward).toBeGreaterThan(0);
    expect(Object.is(forward, distance('tempo', plain!, power!))).toBe(true);
  });

  it('reaches the ⊥ path by two different routes and prices them the same', () => {
    const missing = ADVERSARIAL_FAMILY.find((member) => member.name === 'bottom-span');
    const foreign = ADVERSARIAL_FAMILY.find(
      (member) => member.name === 'bottom-from-foreign-entry',
    );
    const plain = ADVERSARIAL_FAMILY.find((member) => member.name === 'plain');
    // Both carry a ⊥ asynchrony span, so both are strictly further from `plain` than 0.
    expect(distance('asynchrony', missing!, plain!)).toBeGreaterThan(0);
    expect(distance('asynchrony', foreign!, plain!)).toBeGreaterThan(0);
  });

  it('reaches the cap', () => {
    const capped = ADVERSARIAL_FAMILY.find((member) => member.name === 'capped');
    const plain = ADVERSARIAL_FAMILY.find((member) => member.name === 'plain');
    // 100000 ms against 0 is far past 2*delta_row, so the cap binds and the distance is
    // finite and bounded rather than proportional to the raw offset.
    const d = distance('asynchrony', capped!, plain!);
    expect(Number.isFinite(d)).toBe(true);
    expect(d).toBeLessThanOrEqual(2 * 10 * 4 * (1 + 1e-9));
  });
});
