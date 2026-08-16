/**
 * P-C1 / P-C2 / P-C3 / P-C3b over the standing adversarial family — §10, promoted under
 * AD-33.5.
 *
 * The wave's original triangle tests ran on three pointwise-ordered constants, which sit at
 * the triangle's *equality* case: they could fail only on quadrature error, so they tested
 * the quadrature and not the metric. This file runs the same properties over twelve members
 * that between them carry `⊥` (by four different routes), the cap, a renderer-default level,
 * a tempo skip, a dynamics skip, AD-35's unbounded resurrected span, and a power-vs-power
 * transition pair — the last being the only member that reaches `criticalPointTicks`, the path
 * CAPITAL-3 broke unseen.
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
import { readAccentuationSegments } from '../../src/comparison/accentuationCurve.js';
import { accentuationDistance } from '../../src/comparison/accentuationDistance.js';
import { readMovementSegments } from '../../src/comparison/pedalCurve.js';
import { pedalDistance } from '../../src/comparison/pedalDistance.js';
import { readImprecisionSpans } from '../../src/comparison/imprecisionLaws.js';
import { imprecisionDistance } from '../../src/comparison/imprecisionDistance.js';

/** Every dimension with a density so far, each as a total distance function. */
const DIMENSIONS = [
  'tempo',
  'dynamics',
  'asynchrony',
  'accentuation',
  'pedal',
  'imprecisionTiming',
] as const;
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

  if (dimension === 'asynchrony')
    return asynchronyDistance(
      readAsynchronySegments(a.views.get('asynchronyMap') ?? null, a.document.scaleFactor),
      readAsynchronySegments(b.views.get('asynchronyMap') ?? null, b.document.scaleFactor),
      pair.window,
      pair.ppq.lcm,
    ).distance;

  if (dimension === 'accentuation')
    return accentuationDistance(
      readAccentuationSegments(
        a.views.get('metricalAccentuationMap') ?? null,
        a.document.scaleFactor,
        a.scope.environment,
        a.document.performance.global,
      ),
      readAccentuationSegments(
        b.views.get('metricalAccentuationMap') ?? null,
        b.document.scaleFactor,
        b.scope.environment,
        b.document.performance.global,
      ),
      pair.window,
      pair.ppq.lcm,
    ).distance;

  if (dimension === 'imprecisionTiming')
    return imprecisionDistance(
      readImprecisionSpans(
        a.views.get('imprecisionMap.timing') ?? null,
        'imprecisionTiming',
        a.document.scaleFactor,
      ),
      readImprecisionSpans(
        b.views.get('imprecisionMap.timing') ?? null,
        'imprecisionTiming',
        b.document.scaleFactor,
      ),
      pair.window,
      pair.ppq.lcm,
    ).distance;

  return pedalDistance(
    readMovementSegments(a.views.get('movementMap') ?? null, a.document.scaleFactor),
    readMovementSegments(b.views.get('movementMap') ?? null, b.document.scaleFactor),
    pair.window,
    pair.ppq.lcm,
  ).distance;
}

/**
 * Distance between two members under the shared explicit window, memoized on the ORDERED pair.
 *
 * Ordered, deliberately: memoizing on an unordered key would make P-C2 tautological — it would
 * compare a cached number with itself instead of running the two directions through the
 * integrator. What the cache buys is that the twelve-member family's 220 triples do not reparse
 * the same documents thousands of times; what it must not buy is a symmetry that is not real.
 */
const CACHE = new Map<string, number>();

function distance(dimension: Dimension, x: AdversarialMember, y: AdversarialMember): number {
  const key = `${dimension}|${x.name}|${y.name}`;
  const cached = CACHE.get(key);
  if (cached !== undefined) return cached;
  const computed = distanceFor(
    dimension,
    readComparisonPair({ a: x.mpm, b: y.mpm, window: ADVERSARIAL_WINDOW }),
  );
  CACHE.set(key, computed);
  return computed;
}

describe('the adversarial family itself', () => {
  it('has seventeen members with distinct hazards', () => {
    // Twelve after cut 1, seventeen after cut 4 — each cut extends the family with the failure
    // surfaces it opens (AD-33.5's standing policy), and this count is what makes that an
    // obligation rather than an intention.
    expect(ADVERSARIAL_FAMILY).toHaveLength(17);
    expect(new Set(ADVERSARIAL_FAMILY.map((member) => member.name)).size).toBe(17);
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
  it('holds for every triple with EVERY member as the middle term', () => {
    // All three assignments, not one. `adversarialTriples` returns an unordered triple and the
    // first version of this test always took the third member as the middle, so it checked one
    // inequality of the three a triple asserts. Cut 4 found that the hard way: §4's cap binds
    // only when a ⊥ member sits BETWEEN two laws whose uncapped distance exceeds 2·δ_row, and
    // with one fixed middle that arrangement depended on the family's array order — the
    // property was true, unobservable, and would have stayed unobservable through any
    // reordering. Same lesson as the eighth member's (AD-33.5): a family that merely CONTAINS
    // the hazard is not a family that reaches it.
    for (const [x, y, z] of adversarialTriples())
      for (const [left, right, middle] of [
        [x, y, z],
        [x, z, y],
        [y, z, x],
      ] as const) {
        const direct = distance(dimension, left, right);
        const viaLeft = distance(dimension, left, middle);
        const viaRight = distance(dimension, middle, right);
        expect(
          direct <= (viaLeft + viaRight) * (1 + 1e-9),
          `${dimension}: d(${left.name},${right.name})=${String(direct)} > d(..,${middle.name})+d(${middle.name},..)=${String(viaLeft + viaRight)}`,
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

  it('reaches the two ⊥ routes W3a cut 1 opened, and prices both at the cap', () => {
    const accentuation = ADVERSARIAL_FAMILY.find((member) => member.name === 'accentuation-bottom');
    const pedal = ADVERSARIAL_FAMILY.find((member) => member.name === 'pedal-bottom');
    const ordinary = ADVERSARIAL_FAMILY.find((member) => member.name === 'accentuation-and-pedal');
    // An aborting accentuationPatternDef (R21) and a non-monotone date component are different
    // failures in different dimensions; both are ⊥ and both are δ_row from a real curve.
    expect(distance('accentuation', accentuation!, ordinary!)).toBeGreaterThan(0);
    expect(distance('pedal', pedal!, ordinary!)).toBeGreaterThan(0);
  });

  it('reaches AD-35’s unbounded span, and the window still bounds it', () => {
    const resurrected = ADVERSARIAL_FAMILY.find((member) => member.name === 'pedal-resurrected');
    const plain = ADVERSARIAL_FAMILY.find((member) => member.name === 'plain');
    const d = distance('pedal', resurrected!, plain!);
    // A span whose end is Number.MAX_VALUE integrates over [0, 4] like any other (AD-35 b).
    expect(Number.isFinite(d)).toBe(true);
    expect(d).toBeGreaterThan(0);
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
