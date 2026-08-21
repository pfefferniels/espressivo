/**
 * P-C1 / P-C2 / P-C3 / P-C3b over the standing adversarial family — §10, promoted under
 * AD-33.5.
 *
 * The wave's original triangle tests ran on three pointwise-ordered constants, which sit at
 * the triangle's *equality* case: they could fail only on quadrature error, so they tested
 * the quadrature and not the metric. This file runs the same properties over twenty-six members
 * that between them carry `⊥` (by seven different routes), the cap, a renderer-default level,
 * a tempo skip, a dynamics skip, AD-35's unbounded resurrected span, a power-vs-power
 * transition pair — the last being the only member that reaches `criticalPointTicks`, the path
 * CAPITAL-3 broke unseen — and, since the W3 fix wave, the five dimensions the list of
 * DIMENSIONS used to omit.
 *
 * It runs over **all eleven dimensions** (W3 MAJOR-1). The six it covered left out the two
 * EVENT dimensions, whose distance is an argmin over monotone alignments and whose metric
 * status §5.6 argues in prose; measured, an uncapped `localDistance` fails ornamentation's
 * triangle test and nothing in the old six would have seen it.
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
import { readComparisonPair } from './../../src/comparison/document.js';
import type { ComparisonPair } from '../../src/comparison/document.js';
import { evaluateDimension, type ScopeSide } from '../../src/comparison/dimensions.js';
import { DEFAULT_LAMBDA_DATE } from '../../src/comparison/eventAlignment.js';
import { COMPARISON_DIMENSIONS, type ComparisonDimension } from '../../src/comparison/registry.js';
import type { InvarianceMode } from '../../src/comparison/decomposition.js';
import { elementAt } from '../../src/prelude/index.js';

/**
 * ALL ELEVEN (W3 MAJOR-1). The suite covered six, and the five it skipped included the two
 * EVENT dimensions — whose distance is an argmin over monotone alignments, the only construction
 * in the module where the triangle inequality is a structural question rather than a numerical
 * one, and whose metric argument §5.6 makes in prose — plus rubato, which gained its first four
 * `⊥` routes and the capped integrator in the very wave that shipped this list.
 *
 * The distance is now taken through `evaluateDimension`, the same entry the driver calls, rather
 * than through eleven hand-wired reader/distance pairs. Two things follow and both are the
 * point: a dimension cannot be in the report and absent here (the list IS
 * `COMPARISON_DIMENSIONS`), and a dimension's metric properties are checked over everything its
 * `d_k` is made of — which for articulation now means the alignment optimum AND AD-55.1's
 * default step function, two components that reach the number by different routes.
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
  const computed = distanceFor(dimension, pairOf(x, y));
  CACHE.set(key, computed);
  return computed;
}

describe('the adversarial family itself', () => {
  it('has twenty-eight members with distinct hazards', () => {
    // Twelve after cut 1, seventeen after cut 4, twenty-six after the W3 fix wave, twenty-eight
    // after W4 — each cut extends the family with the failure surfaces it opens (AD-33.5's
    // standing policy), and this count is what makes that an obligation rather than an
    // intention. The nine added at MAJOR-1 are the surfaces of the five dimensions the suite
    // never ran on: rubato's ordinary warp and its first ⊥ route, the two event dimensions'
    // ordinary, offset and incomparable cases, articulation's default step function, and the two
    // imprecision domains that had no member at all. W4's two are a PAIR — the same map text
    // resolving through different `tempoDef`s — which is the surface §6's edit path opened and
    // which every other member misses by stating its levels as literals.
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

  it('runs under a piece-derived window, so R3 is unconditional', () => {
    const pair = readComparisonPair({
      a: elementAt(ADVERSARIAL_FAMILY, 0, 'the adversarial family').mpm,
      b: elementAt(ADVERSARIAL_FAMILY, 1, 'the adversarial family').mpm,
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

  // W3 MAJOR-1. The five dimensions the suite never ran on, each shown to REACH its own
  // failure surface and not merely to contain a member. AD-50.3's lesson, applied to the
  // additions it licensed: a family that contains a hazard is not one that reaches it.
  const member = (name: string): AdversarialMember => {
    const found = ADVERSARIAL_FAMILY.find((candidate) => candidate.name === name);
    if (found === undefined) throw new Error(`no adversarial member named ${name}`);
    return found;
  };
  const PLAIN = () => member('plain');

  it('reaches rubato’s ⊥ route, and the cap binds over the whole window', () => {
    // An unusable @intensity with @loop on poisons the WHOLE span, so a ⊥ against a real warp
    // is δ_row per quarter across the window: 10 × 4. Rubato's four ⊥ routes and its capped
    // integrator both arrived in W3b with no family member reaching either.
    expect(distance('rubato', member('rubato-bottom'), member('rubato-plain'))).toBeCloseTo(
      10 * 4,
      9,
    );
    expect(distance('rubato', member('rubato-plain'), PLAIN())).toBeGreaterThan(0);
  });

  it('reaches a NON-TRIVIAL articulation alignment, not an all-drops one', () => {
    // The two anchor sets sit an eighth of a quarter apart, so `λ_date` makes exactly one match
    // cheaper than two drops and the DP has to trade. An all-drops optimum would exercise the
    // sum and not the argmin, which is the construction §5.6 makes the semantic definition.
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

  it('reaches AD-55.1’s default step function as a component of its own', () => {
    // `articulation-default` carries NO atoms — only two `<style>` switches — so anything it
    // scores is the step function's, by a different route from every other event member.
    expect(distance('articulation', member('articulation-default'), PLAIN())).toBeGreaterThan(0);
  });

  it('reaches ornamentation’s incomparable pair, and prices it at the cap', () => {
    // A tick frame against a millisecond frame has no common domain without a tempo map
    // (§5.6): two matched anchors, each at 2·δ_row. Against a document with no ornaments the
    // same member is an ordinary deviation-from-neutral, which is what makes the pair a ⊥ and
    // not merely a large number.
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
