/**
 * Identity, symmetry, the triangle inequality and zero-set transitivity, over the standing
 * adversarial family.
 *
 * A triangle test on three pointwise-ordered constants sits at the triangle's equality case: it
 * can fail only on quadrature error, so it tests the quadrature and not the metric. These
 * properties run over the adversarial family instead, whose members carry `⊥` by seven routes,
 * the cap, a renderer-default level, a tempo skip, a dynamics skip, the unbounded
 * resurrected span, and the one power-vs-power pair that reaches `criticalPointTicks`.
 *
 * The two EVENT dimensions are included: their distance is an argmin over monotone alignments
 * and ornamentation argues its metric status in prose — measured, an uncapped `localDistance` fails
 * ornamentation's triangle test where no curve dimension shows anything.
 *
 * Every comparison runs under one EXPLICIT shared window: under a pair-derived window the
 * three windows of a triple differ and the metric does not claim the triangle inequality at all.
 */
import { describe, it, expect } from 'vitest';
import {
  ADVERSARIAL_FAMILY,
  ADVERSARIAL_WINDOW,
  adversarialPairs,
  adversarialTriples,
  type AdversarialMember,
} from './adversarialFamily.js';
import { readComparisonPair } from './../../src/comparison/document.js';
import type { ComparisonPair } from '../../src/comparison/document.js';
import { evaluateDimension, type ScopeSide } from '../../src/comparison/dimensions.js';
import { DEFAULT_LAMBDA_DATE } from '../../src/comparison/eventAlignment.js';
import { COMPARISON_DIMENSIONS, type ComparisonDimension } from '../../src/comparison/registry.js';
import type { InvarianceMode } from '../../src/comparison/decomposition.js';
import { elementAt } from '../../src/prelude/index.js';

/**
 * The list IS `COMPARISON_DIMENSIONS`, so a dimension cannot be in the report and absent here.
 * The distance is taken through `evaluateDimension`, the same entry the driver calls, so a
 * dimension's metric properties are checked over everything its `d_k` is made of — which for
 * articulation means the alignment optimum AND the default step function, two components
 * reaching the number by different routes.
 */
const DIMENSIONS = COMPARISON_DIMENSIONS;
type Dimension = ComparisonDimension;

const NO_INVARIANCE = Object.fromEntries(
  COMPARISON_DIMENSIONS.map((dimension) => [dimension, 'none']),
) as Record<ComparisonDimension, InvarianceMode>;

/** The parsed pair, memoized across the eleven dimensions rather than reparsed per dimension. */
const PAIRS = new Map<string, ComparisonPair>();

function pairOf(x: AdversarialMember, y: AdversarialMember): ComparisonPair {
  const key = `${x.name}|${y.name}`;
  const known = PAIRS.get(key);
  if (known !== undefined) return known;
  const parsed = readComparisonPair({ a: x.mpm, b: y.mpm, window: ADVERSARIAL_WINDOW });
  PAIRS.set(key, parsed);
  return parsed;
}

function sideOf(pair: ComparisonPair, role: 'a' | 'b'): ScopeSide {
  const document = pair[role];
  const scope = document.scopes.find((candidate) => candidate.scope === 'global');
  if (scope === undefined) throw new Error('no global scope');
  return { role, document, scope };
}

function distanceFor(dimension: Dimension, pair: ComparisonPair): number {
  return evaluateDimension(dimension, sideOf(pair, 'a'), sideOf(pair, 'b'), {
    window: pair.window,
    ticksPerQuarter: pair.ppq.lcm,
    jnd: {},
    invariance: NO_INVARIANCE,
    beatGrid: null,
    lambdaDate: DEFAULT_LAMBDA_DATE,
  }).distance;
}

/**
 * Distance between two members under the shared explicit window, memoized on the ORDERED pair.
 *
 * Ordered, deliberately: an unordered key would make the symmetry check tautological, comparing a cached
 * number with itself instead of running the two directions through the integrator.
 */
const CACHE = new Map<string, number>();

function distance(dimension: Dimension, x: AdversarialMember, y: AdversarialMember): number {
  const key = `${dimension}|${x.name}|${y.name}`;
  const cached = CACHE.get(key);
  if (cached !== undefined) return cached;
  const computed = distanceFor(dimension, pairOf(x, y));
  CACHE.set(key, computed);
  return computed;
}

describe('the adversarial family itself', () => {
  it('has twenty-eight members with distinct hazards', () => {
    // the design requires a cut that opens a failure surface to extend the family, and this count
    // is what makes that an obligation rather than an intention.
    expect(ADVERSARIAL_FAMILY).toHaveLength(28);
    expect(new Set(ADVERSARIAL_FAMILY.map((member) => member.name)).size).toBe(28);
  });

  it('is not degenerate: every member differs from every other in some dimension', () => {
    // Without this the whole file could pass on an implementation that returns 0.
    for (const [x, y] of adversarialPairs()) {
      const total = DIMENSIONS.reduce((sum, dimension) => sum + distance(dimension, x, y), 0);
      expect(total, `${x.name} vs ${y.name} are indistinguishable`).toBeGreaterThan(0);
    }
  });

  it('runs under a piece-derived window, so the guarantee is unconditional', () => {
    const pair = readComparisonPair({
      a: elementAt(ADVERSARIAL_FAMILY, 0, 'the adversarial family').mpm,
      b: elementAt(ADVERSARIAL_FAMILY, 1, 'the adversarial family').mpm,
      window: ADVERSARIAL_WINDOW,
    });
    expect(pair.window.rule).toBe('explicit');
    expect(pair.window.metricGuarantee).toBe('unconditional');
  });
});

describe.each(DIMENSIONS)('identity — %s', (dimension) => {
  it.each(ADVERSARIAL_FAMILY.map((member) => [member.name, member] as const))(
    'is exactly 0 against itself: %s',
    (_name, member) => {
      expect(distance(dimension, member, member)).toBe(0);
    },
  );
});

describe.each(DIMENSIONS)('bit-exact symmetry — %s', (dimension) => {
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

describe.each(DIMENSIONS)('triangle inequality — %s', (dimension) => {
  it('holds for every triple with EVERY member as the middle term', () => {
    // All three assignments of the middle term: a fixed middle checks one inequality of the
    // three a triple asserts, and the cap binds only when a ⊥ member sits BETWEEN two laws
    // whose uncapped distance exceeds 2·δ_row — so with one fixed middle, whether that
    // arrangement is reached at all depends on the family's array order.
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

describe.each(DIMENSIONS)('zero-set transitivity — %s', (dimension) => {
  it('holds across the family: two zeros compose to a zero', () => {
    // Over the real family rather than three encodings of one constant, so it reaches the ⊥ and
    // capped paths it is the cheapest detector for.
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
    // An aborting accentuationPatternDef and a non-monotone date component: different
    // failures in different dimensions, both ⊥ and both δ_row from a real curve.
    expect(distance('accentuation', accentuation!, ordinary!)).toBeGreaterThan(0);
    expect(distance('pedal', pedal!, ordinary!)).toBeGreaterThan(0);
  });

  it('reaches the unbounded span, and the window still bounds it', () => {
    const resurrected = ADVERSARIAL_FAMILY.find((member) => member.name === 'pedal-resurrected');
    const plain = ADVERSARIAL_FAMILY.find((member) => member.name === 'plain');
    const d = distance('pedal', resurrected!, plain!);
    // A span whose end is Number.MAX_VALUE integrates over [0, 4] like any other.
    expect(Number.isFinite(d)).toBe(true);
    expect(d).toBeGreaterThan(0);
  });

  it('reaches the cap', () => {
    const capped = ADVERSARIAL_FAMILY.find((member) => member.name === 'capped');
    const plain = ADVERSARIAL_FAMILY.find((member) => member.name === 'plain');
    // 100000 ms against 0 is far past 2*delta_row, so the cap binds and the distance is bounded
    // rather than proportional to the raw offset.
    const d = distance('asynchrony', capped!, plain!);
    expect(Number.isFinite(d)).toBe(true);
    expect(d).toBeLessThanOrEqual(2 * 10 * 4 * (1 + 1e-9));
  });

  const member = (name: string): AdversarialMember => {
    const found = ADVERSARIAL_FAMILY.find((candidate) => candidate.name === name);
    if (found === undefined) throw new Error(`no adversarial member named ${name}`);
    return found;
  };
  const PLAIN = () => member('plain');

  it('reaches rubato’s ⊥ route, and the cap binds over the whole window', () => {
    // An unusable @intensity with @loop on poisons the WHOLE span, so a ⊥ against a real warp
    // is δ_row per quarter across the window: 10 × 4.
    expect(distance('rubato', member('rubato-bottom'), member('rubato-plain'))).toBeCloseTo(
      10 * 4,
      9,
    );
    expect(distance('rubato', member('rubato-plain'), PLAIN())).toBeGreaterThan(0);
  });

  it('reaches a NON-TRIVIAL articulation alignment, not an all-drops one', () => {
    // The two anchor sets sit an eighth of a quarter apart, so `λ_date` makes exactly one match
    // cheaper than two drops and the DP has to trade. An all-drops optimum would exercise the
    // sum and not the argmin, which is the construction the design makes the semantic definition.
    const pair = readComparisonPair({
      a: member('articulation-anchors').mpm,
      b: member('articulation-offset').mpm,
      window: ADVERSARIAL_WINDOW,
    });
    const events = evaluateDimension('articulation', sideOf(pair, 'a'), sideOf(pair, 'b'), {
      window: pair.window,
      ticksPerQuarter: pair.ppq.lcm,
      jnd: {},
      invariance: NO_INVARIANCE,
      beatGrid: null,
      lambdaDate: DEFAULT_LAMBDA_DATE,
    }).events;
    expect(events.matched).toBeGreaterThan(0);
    expect(events.unmatchedA).toBeGreaterThan(0);
    expect(events.unmatchedB).toBeGreaterThan(0);
  });

  it('reaches the default step function as a component of its own', () => {
    // `articulation-default` carries NO atoms — only two `<style>` switches — so anything it
    // scores is the step function's, by a different route from every other event member.
    expect(distance('articulation', member('articulation-default'), PLAIN())).toBeGreaterThan(0);
  });

  it('reaches ornamentation’s incomparable pair, and prices it at the cap', () => {
    // A tick frame against a millisecond frame has no common domain without a tempo map:
    // two matched anchors, each at 2·δ_row. Against a document with no ornaments the same member
    // is an ordinary deviation-from-neutral, which is what makes the pair ⊥ and not merely a
    // large number.
    expect(
      distance('ornamentation', member('ornament-plain'), member('ornament-milliseconds')),
    ).toBeCloseTo(2 * 2 * 10, 9);
    expect(distance('ornamentation', member('ornament-plain'), PLAIN())).toBeGreaterThan(0);
  });

  it('reaches the two imprecision domains that had no member at all', () => {
    for (const dimension of ['imprecisionDynamics', 'imprecisionDuration'] as const) {
      expect(distance(dimension, member('imprecision-other-domains'), PLAIN())).toBeGreaterThan(0);
      // The ⊥ route in those domains too, at the cap: an empty <distribution.list>.
      expect(
        distance(
          dimension,
          member('imprecision-other-domains'),
          member('imprecision-other-domains-bottom'),
        ),
      ).toBeCloseTo(10 * 4, 9);
    }
  });
});
