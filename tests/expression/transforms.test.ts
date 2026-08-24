/**
 * The scale spaces of `src/expression/transforms.ts`, against the properties.
 *
 * P1–P5 hold automatically for any monotone bijection with `T(neutral) = 0`,
 * so this suite cannot validate a single registry choice — that is the job and the render
 * tests'. It pins that the closed forms are the ones DESIGN specifies, that they behave in
 * IEEE-754 the way the design says they do rather than the way they would over ℝ, and that every
 * departure is a refusal rather than a written NaN.
 *
 * No RNG. Every sweep is a loop over a fixed grid.
 */
import { describe, it, expect } from 'vitest';
import {
  SCALE_SPACE_FACTOR_DOMAINS,
  boundaryPowerHigh,
  boundaryPowerLow,
  forwardBoundaryPowerHigh,
  forwardBoundaryPowerLow,
  forwardGain,
  forwardInSpace,
  forwardLogAroundCenter,
  forwardLogAroundOne,
  forwardLogit,
  gain,
  geometricMean,
  isAdmissibleFactor,
  isInValueDomain,
  jointTrimWindow,
  logAroundCenter,
  logAroundOne,
  logit,
  neutralOf,
  orderedGain,
  transformInSpace,
} from '../../src/expression/transforms.js';
import type {
  RubatoWindow,
  ScaleSpace,
  ScaleSpaceTag,
  TransformResult,
} from '../../src/expression/transforms.js';
import { numberAt, pairwise } from '../../src/prelude/index.js';

/**
 * P2 is exact "only on the clamp-free subdomain and only to ~1 ULP". Measured
 * over the grids below, the worst conditioned deviation is 1.07 ULP; 8 is the budget, enough
 * headroom for a `Math.pow` slightly less accurate than this machine's. Conditioned is the
 * load-bearing word — see {@link amplificationAt}. The budget is far too loose to discriminate
 * between closed forms: an `exp`/`log` round trip passes it at 2.2e-2 where the closed form
 * reaches 2.7e-2, and even a different METRIC passes — the rejected log-1-over-`exponent`
 * reading of `meanTempoAt` comes in at 2.0e-2. P1-P5 constrain the neutral and
 * not the metric, which is why the metric anchors below are a separate block.
 */
const COMPOSITION_ULPS = 8;

/**
 * The joint trim gets its own budget because it is six roundings deep, not two: `t'`, both
 * ratio divisions, both multiplications, and the `1 − b'` reconstruction.
 */
const JOINT_TRIM_ULPS = 24;

/**
 * How far a value's distance from the nearest bound amplifies one ULP of error.
 *
 * Conditioning, not a defect, is why raw deviations exceed the "~1 ULP": a `curvature` of
 * 0.99999999 stored as a double has 8 significant digits of distance from 1 left, which the
 * second transform's `1 − x` recovers with relative error `eps/(1−x)`. At `x = 0.99, s₂ = 4`
 * that costs 1.3e-11 absolute; every interior triple stays at 1 ULP.
 *
 * `scale / distance` is an upper bound on the transform's own amplification: the derivative of
 * `1 − (1−x)^s` is `s·d^(s−1)`, and `s·d^s ≤ 1` for `d < 1/e` and `s ≥ 0`, so `s·d^(s−1) ≤ 1/d`.
 */
function amplificationAt(
  value: number,
  boundDistance: (x: number) => number,
  scale: number,
): number {
  return Math.max(1, scale / boundDistance(value));
}

/**
 * Deviation of `actual` from `expected`, relative to the larger of the two magnitudes and the
 * space's own scale.
 *
 * `scale` keeps the measure honest near a space's neutral: a `protraction` result of 1e-17
 * against an expected 0 is nothing on an interval of width 2, but a pure relative measure calls
 * it infinite. Log spaces pass `0` and are measured purely relatively — their values are ratios
 * and their closed forms never subtract, so they carry no cancellation.
 */
function deviation(actual: number, expected: number, scale: number): number {
  if (Object.is(actual, expected)) return 0;
  return Math.abs(actual - expected) / Math.max(Math.abs(actual), Math.abs(expected), scale);
}

function expectOk(result: TransformResult): number {
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error('unreachable');
  return result.value;
}

interface SpaceUnderTest {
  readonly name: string;
  readonly space: ScaleSpace;
  /** In-domain values, including every bound the space admits. */
  readonly values: readonly number[];
  /** Admissible factors, both attenuating and amplifying, excluding the identity. */
  readonly factors: readonly number[];
  /** Characteristic magnitude for {@link deviation}; 0 means "measure relatively". */
  readonly scale: number;
  /**
   * Distance from a value to the nearest bound whose recovery costs precision, i.e. the one
   * the closed form reaches by subtraction. `Infinity` where there is none — the log spaces
   * bound at 0 but never subtract to get there.
   */
  readonly boundDistance: (x: number) => number;
}

const UNCONDITIONED = () => Infinity;
const unitDistance = (x: number) => Math.min(x, 1 - x);

const POSITIVE_FACTORS = [0.25, 0.5, 2, 4] as const;
const REAL_FACTORS = [-2, -0.5, 0.25, 0.5, 2, 4] as const;

/**
 * One entry per scalar scale space of the table. The `logit` interval and the
 * `log-around-center` center are the registry's own.
 */
const SPACES: readonly SpaceUnderTest[] = [
  {
    name: 'log-around-center',
    space: { kind: 'log-around-center', center: 72 },
    values: [1e-3, 0.5, 20, 48, 60, 72, 100, 120, 1e3, 1e6],
    factors: REAL_FACTORS,
    scale: 0,
    boundDistance: UNCONDITIONED,
  },
  {
    name: 'log-around-1',
    space: { kind: 'log-around-1' },
    values: [1e-3, 0.1, 0.5, 1, 1.5, 2, 5, 100],
    factors: REAL_FACTORS,
    scale: 0,
    boundDistance: UNCONDITIONED,
  },
  {
    name: 'logit(0,1) — meanTempoAt',
    space: { kind: 'logit', lower: 0, upper: 1 },
    values: [0, 0.01, 0.1, 0.25, 0.4, 0.5, 0.6, 0.75, 0.9, 0.99, 1],
    factors: REAL_FACTORS,
    scale: 1,
    boundDistance: unitDistance,
  },
  {
    name: 'logit(-1,1) — protraction',
    space: { kind: 'logit', lower: -1, upper: 1 },
    values: [-1, -0.9, -0.5, -0.1, 0, 0.1, 0.5, 0.9, 1],
    factors: REAL_FACTORS,
    scale: 2,
    boundDistance: (x) => Math.min(x + 1, 1 - x),
  },
  {
    name: 'boundary-power(low) — curvature',
    space: { kind: 'boundary-power-low' },
    values: [0, 0.01, 0.1, 0.4, 0.5, 0.9, 0.99, 1],
    factors: POSITIVE_FACTORS,
    scale: 1,
    boundDistance: unitDistance,
  },
  {
    name: 'boundary-power(high)',
    space: { kind: 'boundary-power-high' },
    values: [0, 0.01, 0.1, 0.4, 0.5, 0.9, 0.99, 1],
    factors: POSITIVE_FACTORS,
    scale: 1,
    boundDistance: unitDistance,
  },
  {
    name: 'gain',
    space: { kind: 'gain' },
    values: [-1000, -12.5, -1, -0.25, 0, 0.25, 1, 12.5, 1000],
    factors: REAL_FACTORS,
    scale: 0,
    boundDistance: UNCONDITIONED,
  },
  {
    name: 'gain-ordered',
    space: { kind: 'gain-ordered' },
    values: [-1000, -12.5, -1, -0.25, 0, 0.25, 1, 12.5, 1000],
    factors: POSITIVE_FACTORS,
    scale: 0,
    boundDistance: UNCONDITIONED,
  },
];

/** Windows whose total trim stays clear of the clamp under every factor product below. */
const TRIM_WINDOWS: readonly RubatoWindow[] = [
  { lateStart: 0, earlyEnd: 0.8 },
  { lateStart: 0.1, earlyEnd: 0.95 },
  { lateStart: 0.2, earlyEnd: 0.9 },
  { lateStart: 0.3, earlyEnd: 0.7 },
  { lateStart: 0.25, earlyEnd: 1 },
  { lateStart: 0.45, earlyEnd: 0.55 },
];
const TRIM_FACTORS = [0.5, 2] as const;

/** the default. An IEEE saturation guard, not a musical bound. */
const MIN_RUBATO_WINDOW = 1e-6;

describe('s-domains are data', () => {
  it('covers every scale space including the joint trim', () => {
    const tags: readonly ScaleSpaceTag[] = [
      'log-around-center',
      'log-around-1',
      'logit',
      'boundary-power-low',
      'boundary-power-high',
      'gain',
      'gain-ordered',
      'joint-trim',
    ];
    expect(Object.keys(SCALE_SPACE_FACTOR_DOMAINS).sort()).toEqual([...tags].sort());
  });

  it('restricts boundary-power, ordered gain and the joint trim to s >= 0, others to R', () => {
    for (const tag of [
      'boundary-power-low',
      'boundary-power-high',
      'gain-ordered',
      'joint-trim',
    ] as const) {
      expect(SCALE_SPACE_FACTOR_DOMAINS[tag]).toBe('non-negative');
      expect(isAdmissibleFactor(tag, -0.5)).toBe(false);
      expect(isAdmissibleFactor(tag, 0)).toBe(true);
      expect(isAdmissibleFactor(tag, 3)).toBe(true);
    }
    for (const tag of ['log-around-center', 'log-around-1', 'logit', 'gain'] as const) {
      expect(SCALE_SPACE_FACTOR_DOMAINS[tag]).toBe('real');
      expect(isAdmissibleFactor(tag, -3)).toBe(true);
    }
  });

  it('admits no non-finite factor anywhere', () => {
    for (const tag of Object.keys(SCALE_SPACE_FACTOR_DOMAINS) as ScaleSpaceTag[]) {
      for (const s of [NaN, Infinity, -Infinity]) {
        expect(isAdmissibleFactor(tag, s)).toBe(false);
      }
    }
  });

  it('refuses a factor outside the space s-domain rather than clamping it', () => {
    for (const { name, space } of SPACES) {
      if (SCALE_SPACE_FACTOR_DOMAINS[space.kind] !== 'non-negative') continue;
      const result = transformInSpace(space, 0.5, -1);
      expect(result.ok, name).toBe(false);
      if (!result.ok) expect(result.error).toBe('out-of-domain-input');
    }
    const trim = jointTrimWindow({ lateStart: 0.2, earlyEnd: 0.9 }, -1, MIN_RUBATO_WINDOW);
    expect(trim.ok).toBe(false);
    if (!trim.ok) expect(trim.error).toBe('out-of-domain-input');
  });
});

describe('P1 — s = 1 is the identity bit for bit', () => {
  it.each(SPACES)('$name returns its input exactly', ({ space, values }) => {
    for (const x of values) {
      expect(Object.is(expectOk(transformInSpace(space, x, 1)), x)).toBe(true);
    }
  });

  it('holds where the arithmetic does not: mu*(48/mu)^1 !== 48', () => {
    const center = Math.sqrt(20 * 100);
    // the counter-example. The branch is what makes P1 true, not the formula.
    expect(center * Math.pow(48 / center, 1)).not.toBe(48);
    expect(expectOk(logAroundCenter(48, 1, center))).toBe(48);
    expect(expectOk(logit(0.3, 1, 0, 1))).toBe(0.3);
  });

  it('the joint trim returns both endpoints exactly', () => {
    for (const window of TRIM_WINDOWS) {
      const result = jointTrimWindow(window, 1, MIN_RUBATO_WINDOW);
      expect(result.ok).toBe(true);
      if (!result.ok) continue;
      expect(Object.is(result.value.lateStart, window.lateStart)).toBe(true);
      expect(Object.is(result.value.earlyEnd, window.earlyEnd)).toBe(true);
    }
  });

  it('never returns an out-of-domain input as an identity', () => {
    expect(logAroundOne(-1, 1).ok).toBe(false);
    expect(logit(1.5, 1, 0, 1).ok).toBe(false);
    expect(boundaryPowerLow(1.5, 1).ok).toBe(false);
    expect(gain(NaN, 1).ok).toBe(false);
  });
});

describe('P2 — composition', () => {
  it.each(SPACES)(
    '$name: s1 after s2 equals s1*s2',
    ({ space, values, factors, scale, boundDistance }) => {
      let compared = 0;
      let worst = 0;
      for (const x of values) {
        for (const s1 of factors) {
          for (const s2 of factors) {
            const first = transformInSpace(space, x, s2);
            if (!first.ok) continue;
            const composed = transformInSpace(space, first.value, s1);
            const direct = transformInSpace(space, x, s1 * s2);
            // A refusal on either path is a saturation, i.e. outside the clamp-free
            // subdomain on which P2 is contracted at all.
            if (!composed.ok || !direct.ok) continue;
            // The intermediate is what the second transform has to read back, so it is its
            // proximity to a bound — not the input's or the result's — that sets the budget.
            const budget =
              COMPOSITION_ULPS *
              Number.EPSILON *
              amplificationAt(first.value, boundDistance, scale);
            worst = Math.max(worst, deviation(composed.value, direct.value, scale) / budget);
            compared += 1;
          }
        }
      }
      expect(compared).toBeGreaterThan(20);
      expect(worst).toBeLessThanOrEqual(1);
    },
  );

  it('inverse factors round-trip to the input (s1*s2 = 1)', () => {
    for (const { space, values, factors, scale, boundDistance } of SPACES) {
      for (const x of values) {
        for (const s of factors) {
          const inverse = 1 / s;
          if (!isAdmissibleFactor(space.kind, inverse)) continue;
          const there = transformInSpace(space, x, s);
          if (!there.ok) continue;
          const back = transformInSpace(space, there.value, inverse);
          if (!back.ok) continue;
          const budget =
            COMPOSITION_ULPS * Number.EPSILON * amplificationAt(there.value, boundDistance, scale);
          expect(deviation(back.value, x, scale)).toBeLessThanOrEqual(budget);
        }
      }
    }
  });

  it('log-around-center holds the center invariant, which is what makes P2 exact', () => {
    const population = [40, 55, 60, 72, 90, 120];
    const center = expectOk(geometricMean(population));
    for (const s of REAL_FACTORS) {
      const moved = population.map((x) => expectOk(logAroundCenter(x, s, center)));
      expect(deviation(expectOk(geometricMean(moved)), center, 0)).toBeLessThanOrEqual(
        COMPOSITION_ULPS * Number.EPSILON,
      );
    }
  });

  it('the joint trim composes and preserves the head:tail ratio', () => {
    let compared = 0;
    for (const window of TRIM_WINDOWS) {
      const ratio = window.lateStart / (1 - window.earlyEnd);
      for (const s1 of TRIM_FACTORS) {
        for (const s2 of TRIM_FACTORS) {
          const first = jointTrimWindow(window, s2, MIN_RUBATO_WINDOW);
          expect(first.ok).toBe(true);
          if (!first.ok) continue;
          const composed = jointTrimWindow(first.value, s1, MIN_RUBATO_WINDOW);
          const direct = jointTrimWindow(window, s1 * s2, MIN_RUBATO_WINDOW);
          expect(composed.ok && direct.ok).toBe(true);
          if (!composed.ok || !direct.ok) continue;
          // The trim's conditioning is the intermediate window's remaining slack: what the
          // second pass must recover is `1 − t`, and a nearly closed window has little of it.
          const slack = first.value.earlyEnd - first.value.lateStart;
          const budget = JOINT_TRIM_ULPS * Number.EPSILON * Math.max(1, 1 / slack);
          expect(
            deviation(composed.value.lateStart, direct.value.lateStart, 1),
          ).toBeLessThanOrEqual(budget);
          expect(deviation(composed.value.earlyEnd, direct.value.earlyEnd, 1)).toBeLessThanOrEqual(
            budget,
          );
          if (Number.isFinite(ratio)) {
            const movedRatio = direct.value.lateStart / (1 - direct.value.earlyEnd);
            expect(deviation(movedRatio, ratio, 1)).toBeLessThanOrEqual(budget);
          }
          compared += 1;
        }
      }
    }
    expect(compared).toBe(TRIM_WINDOWS.length * TRIM_FACTORS.length * TRIM_FACTORS.length);
  });
});

describe('P3 — domain closure comes from the transform, not a clamp', () => {
  it.each(SPACES)(
    '$name maps its domain into itself for every admissible s',
    ({ space, values, factors }) => {
      for (const x of values) {
        expect(isInValueDomain(space, x)).toBe(true);
        for (const s of [...factors, 0, 1]) {
          const result = transformInSpace(space, x, s);
          if (!result.ok) continue;
          expect(isInValueDomain(space, result.value)).toBe(true);
        }
      }
    },
  );

  it('boundary-power leaves [0,1] for s < 0, which is why its s-domain is s >= 0', () => {
    expect(1 - Math.pow(1 - 0.5, -1)).toBeLessThan(0);
    expect(boundaryPowerLow(0.5, -1).ok).toBe(false);
  });

  it('the joint trim keeps 0 <= lateStart < earlyEnd <= 1', () => {
    for (const window of TRIM_WINDOWS) {
      for (const s of [0, 0.25, 0.5, 1, 2, 4, 8, 16, 17, 64, 1e6]) {
        const result = jointTrimWindow(window, s, MIN_RUBATO_WINDOW);
        if (!result.ok) continue;
        const { lateStart, earlyEnd } = result.value;
        expect(lateStart).toBeGreaterThanOrEqual(0);
        expect(earlyEnd).toBeLessThanOrEqual(1);
        expect(lateStart).toBeLessThan(earlyEnd);
      }
    }
  });
});

describe('P4 — the neutral is a fixed point for every admissible s', () => {
  it.each(SPACES)('$name fixes its neutral exactly', ({ space, factors }) => {
    const neutral = neutralOf(space);
    for (const s of [...factors, 0, 1]) {
      expect(Object.is(expectOk(transformInSpace(space, neutral, s)), neutral)).toBe(true);
    }
  });

  it('states each space neutral', () => {
    expect(neutralOf({ kind: 'log-around-center', center: 72 })).toBe(72);
    expect(neutralOf({ kind: 'log-around-1' })).toBe(1);
    expect(neutralOf({ kind: 'logit', lower: 0, upper: 1 })).toBe(0.5);
    expect(neutralOf({ kind: 'logit', lower: -1, upper: 1 })).toBe(0);
    expect(neutralOf({ kind: 'boundary-power-low' })).toBe(0);
    expect(neutralOf({ kind: 'boundary-power-high' })).toBe(1);
    expect(neutralOf({ kind: 'gain' })).toBe(0);
    expect(neutralOf({ kind: 'gain-ordered' })).toBe(0);
  });

  it('fixes the boundary values declared admissible, for s > 0', () => {
    // `curvature = 1` and `protraction = ±1` are authored values, not saturation cliffs.
    for (const s of [0.25, 0.5, 2, 4, 1e6]) {
      expect(Object.is(expectOk(boundaryPowerLow(1, s)), 1)).toBe(true);
      expect(Object.is(expectOk(boundaryPowerLow(0, s)), 0)).toBe(true);
      expect(Object.is(expectOk(boundaryPowerHigh(0, s)), 0)).toBe(true);
      expect(Object.is(expectOk(boundaryPowerHigh(1, s)), 1)).toBe(true);
      expect(Object.is(expectOk(logit(1, s, -1, 1)), 1)).toBe(true);
      expect(Object.is(expectOk(logit(-1, s, -1, 1)), -1)).toBe(true);
      expect(Object.is(expectOk(logit(0, s, 0, 1)), 0)).toBe(true);
      expect(Object.is(expectOk(logit(1, s, 0, 1)), 1)).toBe(true);
    }
  });

  it('refuses a bound-to-bound flip, which s < 0 makes of a boundary value', () => {
    // `protraction = 1` at s = −1 maps to exactly −1: the opposite extreme, not an
    // attenuation. The result is on a bound the input did not start on, so it is refused.
    const flipped = logit(1, -1, -1, 1);
    expect(flipped.ok).toBe(false);
    if (!flipped.ok) expect(flipped.error).toBe('saturation-to-boundary');
  });

  it('the untrimmed rubato window is the joint trim fixed point', () => {
    const neutral: RubatoWindow = { lateStart: 0, earlyEnd: 1 };
    for (const s of [0, 0.5, 1, 2, 16, 1e6]) {
      const result = jointTrimWindow(neutral, s, MIN_RUBATO_WINDOW);
      expect(result.ok).toBe(true);
      if (!result.ok) continue;
      expect(Object.is(result.value.lateStart, 0)).toBe(true);
      expect(Object.is(result.value.earlyEnd, 1)).toBe(true);
    }
  });
});

describe('s = 0 writes the neutral through a closed form', () => {
  it.each(SPACES)('$name maps every value to its neutral', ({ space, values }) => {
    const neutral = neutralOf(space);
    for (const x of values) {
      expect(Object.is(expectOk(transformInSpace(space, x, 0)), neutral)).toBe(true);
    }
  });

  it('does not compute 0 * T(x) at the values where T is infinite', () => {
    expect(0 * Math.log(1 - 1)).toBeNaN();
    expect(expectOk(boundaryPowerLow(1, 0))).toBe(0);
    expect(expectOk(logit(1, 0, -1, 1))).toBe(0);
    expect(expectOk(logit(-1, 0, -1, 1))).toBe(0);
  });

  it('gives gain the neutral 0, never the -0 that 0 * x produces', () => {
    expect(0 * -5).toBe(-0);
    expect(Object.is(expectOk(gain(-5, 0)), 0)).toBe(true);
  });

  it('removes the rubato window trim entirely', () => {
    const result = jointTrimWindow({ lateStart: 0.45, earlyEnd: 0.55 }, 0, MIN_RUBATO_WINDOW);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual({ lateStart: 0, earlyEnd: 1 });
  });
});

describe('saturation is refused, not written', () => {
  it('refuses the measured logit cliffs', () => {
    // "the logit saturates to exactly 1.0 at s ~ 8 for 0.99".
    expect(1 / (1 + Math.pow((1 - 0.99) / 0.99, 8))).toBe(1);
    const at99 = logit(0.99, 8, 0, 1);
    expect(at99.ok).toBe(false);
    if (!at99.ok) expect(at99.error).toBe('saturation-to-boundary');
    // The step below the cliff is still a value, and still interior.
    expect(expectOk(logit(0.99, 7, 0, 1))).toBeLessThan(1);

    // "s ~ 16.75 for 0.9".
    expect(logit(0.9, 16, 0, 1).ok).toBe(true);
    const at9 = logit(0.9, 17, 0, 1);
    expect(at9.ok).toBe(false);
    if (!at9.ok) expect(at9.error).toBe('saturation-to-boundary');

    // At the lower bound the cliff arrives far later, and only where the bound is not 0.
    // `a + (b−a)/(1+w^s)` reaches `a` once the quotient falls below half an ULP of `a` —
    // immediate for protraction's −1, but meanTempoAt's `a = 0` contributes no cancellation and
    // the quotient has to underflow the whole double range (s ≈ 155 for 0.01). Only
    // the upper cliff because that is the one an authored value reaches.
    const towardZero = logit(0.01, 8, 0, 1);
    expect(expectOk(towardZero)).toBeGreaterThan(0);
    const underflowed = logit(0.01, 160, 0, 1);
    expect(underflowed.ok).toBe(false);
    if (!underflowed.ok) expect(underflowed.error).toBe('saturation-to-boundary');

    const towardMinusOne = logit(-0.99, 8, -1, 1);
    expect(towardMinusOne.ok).toBe(false);
    if (!towardMinusOne.ok) expect(towardMinusOne.error).toBe('saturation-to-boundary');
  });

  it('refuses boundary-power reaching an exact bound', () => {
    // once `(1−x)^s < 2^−54`, `1 − (1−x)^s` rounds to exactly 1.0.
    expect(Math.pow(1 - 0.9, 17)).toBeLessThan(Math.pow(2, -54));
    expect(1 - Math.pow(1 - 0.9, 17)).toBe(1);
    const saturated = boundaryPowerLow(0.9, 17);
    expect(saturated.ok).toBe(false);
    if (!saturated.ok) expect(saturated.error).toBe('saturation-to-boundary');
    expect(expectOk(boundaryPowerLow(0.9, 16))).toBeLessThan(1);

    const collapsed = boundaryPowerHigh(0.9, 1e5);
    expect(collapsed.ok).toBe(false);
    if (!collapsed.ok) expect(collapsed.error).toBe('saturation-to-boundary');
  });

  it('refuses a log-space result that underflows out of R>0', () => {
    const underflowed = logAroundOne(0.5, 5000);
    expect(Math.pow(0.5, 5000)).toBe(0);
    expect(underflowed.ok).toBe(false);
    if (!underflowed.ok) expect(underflowed.error).toBe('saturation-to-boundary');

    const centered = logAroundCenter(1e-3, 200, 72);
    expect(centered.ok).toBe(false);
    if (!centered.ok) expect(centered.error).toBe('saturation-to-boundary');
  });

  it('refuses a result that overflows rather than returning it', () => {
    const overflowed = logAroundOne(10, 400);
    expect(Math.pow(10, 400)).toBe(Infinity);
    expect(overflowed.ok).toBe(false);
    if (!overflowed.ok) expect(overflowed.error).toBe('non-finite-result');

    const huge = gain(1e300, 1e300);
    expect(huge.ok).toBe(false);
    if (!huge.ok) expect(huge.error).toBe('non-finite-result');
  });

  it('does not refuse a gain result of 0, whose 0 is an interior neutral', () => {
    expect(expectOk(gain(0, 4))).toBe(0);
    expect(expectOk(gain(1e-300, 1e-300))).toBe(0);
  });
});

describe('the validation gate refuses non-finite inputs', () => {
  const NON_FINITE = [NaN, Infinity, -Infinity] as const;

  it.each(SPACES)(
    '$name refuses a non-finite value and a non-finite factor',
    ({ space, values }) => {
      for (const bad of NON_FINITE) {
        const byValue = transformInSpace(space, bad, 2);
        expect(byValue.ok).toBe(false);
        if (!byValue.ok) expect(byValue.error).toBe('out-of-domain-input');

        const byFactor = transformInSpace(
          space,
          numberAt(values, 0, `the ${space.kind} probe values`),
          bad,
        );
        expect(byFactor.ok).toBe(false);
        if (!byFactor.ok) expect(byFactor.error).toBe('out-of-domain-input');
      }
    },
  );

  it('refuses values outside each space domain', () => {
    for (const x of [0, -1, -1e-300]) {
      expect(logAroundOne(x, 2).ok).toBe(false);
      expect(logAroundCenter(x, 2, 72).ok).toBe(false);
    }
    for (const x of [-1e-16, 1.0000000000000002, 2]) {
      expect(boundaryPowerLow(x, 2).ok).toBe(false);
      expect(boundaryPowerHigh(x, 2).ok).toBe(false);
      expect(logit(x, 2, 0, 1).ok).toBe(false);
    }
    // the "curvature=1.5 at s=2.5 renders NaN" hazard: refused at the gate instead.
    expect(boundaryPowerLow(1.5, 2.5).ok).toBe(false);
    expect(Number.isNaN(1 - Math.pow(1 - 1.5, 2.5))).toBe(true);
  });

  it('refuses a malformed space parameter', () => {
    for (const center of [0, -72, NaN, Infinity]) {
      expect(logAroundCenter(60, 2, center).ok).toBe(false);
    }
    for (const [lower, upper] of [
      [1, 0],
      [0, 0],
      [NaN, 1],
      [0, Infinity],
    ] as const) {
      expect(logit(0.5, 2, lower, upper).ok).toBe(false);
    }
  });

  it('refuses a rubato window that is out of domain or crossed', () => {
    const bad: readonly RubatoWindow[] = [
      { lateStart: 0.6, earlyEnd: 0.4 },
      { lateStart: 0.5, earlyEnd: 0.5 },
      { lateStart: -0.1, earlyEnd: 0.9 },
      { lateStart: 0.1, earlyEnd: 1.1 },
      { lateStart: NaN, earlyEnd: 0.9 },
      { lateStart: 0.1, earlyEnd: Infinity },
    ];
    for (const window of bad) {
      const result = jointTrimWindow(window, 2, MIN_RUBATO_WINDOW);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toBe('out-of-domain-input');
    }
    for (const minWindow of [0, 1, -1e-6, NaN, Infinity]) {
      expect(jointTrimWindow({ lateStart: 0.2, earlyEnd: 0.9 }, 2, minWindow).ok).toBe(false);
    }
  });
});

describe('the joint trim guard', () => {
  it('reparameterizes through the total trim rather than mapping the bounds separately', () => {
    // the counter-example: independent boundary-power maps cross at the s solving
    // `ee^s + (1−ls)^s = 1` — about 1.36 for a (0.4, 0.6) window.
    const s = 1.4;
    const independentLateStart = 1 - Math.pow(1 - 0.4, s);
    const independentEarlyEnd = Math.pow(0.6, s);
    expect(independentLateStart).toBeGreaterThan(independentEarlyEnd);

    const joint = expectOk2(
      jointTrimWindow({ lateStart: 0.4, earlyEnd: 0.6 }, s, MIN_RUBATO_WINDOW),
    );
    expect(joint.lateStart).toBeLessThan(joint.earlyEnd);
  });

  it('holds the window open at the (0.45, 0.55, s) triples DESIGN cites', () => {
    const window: RubatoWindow = { lateStart: 0.45, earlyEnd: 0.55 };
    // Unguarded, the total trim t = 0.9 rounds to 1.0 at s = 17 and the split returns
    // a' + b' = 1 — the pair the renderer resets to (0, 1).
    expect(1 - Math.pow(1 - 0.9, 17)).toBe(1);

    for (const s of [16, 17, 64, 1e6]) {
      const result = expectOk2(jointTrimWindow(window, s, MIN_RUBATO_WINDOW));
      expect(result.lateStart).toBeLessThan(result.earlyEnd);
      // The two endpoints are rounded independently off the clamped total, so the width lands
      // within an ULP of the option rather than exactly on it.
      expect(result.earlyEnd - result.lateStart).toBeCloseTo(MIN_RUBATO_WINDOW, 15);
    }
  });

  it('absorbs a saturating total trim into the clamp instead of refusing it', () => {
    // The one place a boundary saturation is not a refusal: called on the scalar space
    // directly, the same total trim is refused.
    expect(boundaryPowerLow(0.9, 17).ok).toBe(false);
    const window = expectOk2(
      jointTrimWindow({ lateStart: 0.45, earlyEnd: 0.55 }, 17, MIN_RUBATO_WINDOW),
    );
    expect(window.lateStart).toBeLessThan(window.earlyEnd);
  });

  it('makes the clamp the caller option it is documented to be', () => {
    const window: RubatoWindow = { lateStart: 0.45, earlyEnd: 0.55 };
    const tight = expectOk2(jointTrimWindow(window, 1e6, MIN_RUBATO_WINDOW));
    const loose = expectOk2(jointTrimWindow(window, 1e6, 0.25));
    expect(tight.earlyEnd - tight.lateStart).toBeCloseTo(MIN_RUBATO_WINDOW, 12);
    expect(loose.earlyEnd - loose.lateStart).toBeCloseTo(0.25, 12);
  });

  it('scales the trim, and only the trim, on a one-sided window', () => {
    const headOnly = expectOk2(
      jointTrimWindow({ lateStart: 0.25, earlyEnd: 1 }, 2, MIN_RUBATO_WINDOW),
    );
    expect(Object.is(headOnly.earlyEnd, 1)).toBe(true);
    expect(headOnly.lateStart).toBeCloseTo(1 - Math.pow(1 - 0.25, 2), 15);

    const tailOnly = expectOk2(
      jointTrimWindow({ lateStart: 0, earlyEnd: 0.75 }, 2, MIN_RUBATO_WINDOW),
    );
    expect(Object.is(tailOnly.lateStart, 0)).toBe(true);
    expect(tailOnly.earlyEnd).toBeCloseTo(Math.pow(1 - 0.25, 2), 15);
  });

  it('widens the window for s < 1 and narrows it for s > 1 (P5a)', () => {
    const window: RubatoWindow = { lateStart: 0.2, earlyEnd: 0.9 };
    const widened = expectOk2(jointTrimWindow(window, 0.5, MIN_RUBATO_WINDOW));
    const narrowed = expectOk2(jointTrimWindow(window, 2, MIN_RUBATO_WINDOW));
    const trimOf = (w: RubatoWindow) => w.lateStart + (1 - w.earlyEnd);
    expect(trimOf(widened)).toBeLessThan(trimOf(window));
    expect(trimOf(narrowed)).toBeGreaterThan(trimOf(window));
  });
});

describe('geometricMean — the center population', () => {
  it('is the unweighted geometric mean', () => {
    expect(expectOk(geometricMean([20, 100]))).toBeCloseTo(Math.sqrt(2000), 12);
    expect(expectOk(geometricMean([1, 2, 4]))).toBeCloseTo(2, 12);
  });

  it('returns a single-value population exactly, where exp(log(x)) does not', () => {
    expect(Math.exp(Math.log(48))).not.toBe(48);
    expect(Object.is(expectOk(geometricMean([48])), 48)).toBe(true);
  });

  it('returns an all-equal population exactly', () => {
    // A piecewise-constant map is the dominant corpus shape; a center off by an ULP
    // there moves every value the run writes.
    expect(Math.exp((Math.log(48) * 3) / 3)).not.toBe(48);
    expect(Object.is(expectOk(geometricMean([48, 48, 48])), 48)).toBe(true);
  });

  it('is invariant to ordering and to the population size for repeated values', () => {
    const a = expectOk(geometricMean([40, 60, 90]));
    const b = expectOk(geometricMean([90, 40, 60]));
    expect(deviation(a, b, 0)).toBeLessThanOrEqual(COMPOSITION_ULPS * Number.EPSILON);
  });

  it('refuses an empty population and any non-positive or non-finite member', () => {
    for (const population of [[], [0], [-1], [60, 0], [60, -20], [NaN], [60, Infinity]]) {
      const result = geometricMean(population);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toBe('out-of-domain-input');
    }
  });

  it('cannot underflow out of R>0 — the two refusal branches are unreachable', () => {
    // For any population of positive finite doubles, `logSum / n` lies between
    // `Math.log(5e-324) = -744.44` and `Math.log(1.79e308) = 709.78`, and `Math.exp` neither
    // underflows nor overflows in that range. Both refusal branches below the loop in
    // `geometricMean` are therefore unreachable by construction.
    const result = geometricMean([1e-320, 1e-320, 5e-324]);
    expect(result.ok).toBe(true);
    expect(Math.exp(Math.log(5e-324))).toBeGreaterThan(0);
  });
});

describe('metric anchors — the numbers DESIGN chose, not merely a valid T', () => {
  // Each is a value DESIGN states, and each separates the chosen metric from the alternative
  // it was chosen over — which nothing above can do.

  it('logit over the position, not log-1 over the renderer exponent', () => {
    // the discriminator: "x=0.25 at s=2 gives 0.1 vs 0.0625". The rejected reading
    // scales `exponent = ln0.5/ln x` in log-1; the chosen one scales where in the span the mean
    // tempo falls, which is what the format exposes.
    expect(expectOk(logit(0.25, 2, 0, 1))).toBeCloseTo(0.1, 15);
    const rejectedExponentMetric = Math.exp(
      Math.log(0.5) / Math.pow(Math.log(0.5) / Math.log(0.25), 2),
    );
    expect(rejectedExponentMetric).toBeCloseTo(0.0625, 15);
  });

  it('protraction on logit(-1,1)', () => {
    // w = 0.5/1.5 = 1/3; at s = 2, −1 + 2/(1 + 1/9) = 0.8.
    expect(expectOk(logit(0.5, 2, -1, 1))).toBeCloseTo(0.8, 15);
    expect(expectOk(logit(-0.5, 2, -1, 1))).toBeCloseTo(-0.8, 15);
  });

  it('curvature on boundary-power(low), neutral at the lower bound', () => {
    expect(expectOk(boundaryPowerLow(0.5, 2))).toBeCloseTo(0.75, 15);
    expect(expectOk(boundaryPowerLow(0.5, 0.5))).toBeCloseTo(1 - Math.SQRT1_2, 15);
  });

  it('levels scale their log-ratio to the center by exactly s', () => {
    // What makes `global` scope work on piecewise-constant maps: the ratio of any value to the
    // center is raised to s, so section contrast grows without the center moving.
    const center = 72;
    expect(expectOk(logAroundCenter(144, 2, center))).toBeCloseTo(center * 4, 12);
    expect(expectOk(logAroundCenter(36, 2, center))).toBeCloseTo(center / 4, 12);
    // And the log-difference of a transition pair scales by s regardless of the center.
    const pair = [60, 120].map((x) => expectOk(logAroundCenter(x, 2, center)));
    const what = 'the transformed transition pair';
    expect(Math.log(numberAt(pair, 1, what) / numberAt(pair, 0, what))).toBeCloseTo(
      2 * Math.log(120 / 60),
      12,
    );
  });

  it('ratio gains and signed offsets', () => {
    expect(expectOk(logAroundOne(2, 3))).toBeCloseTo(8, 12);
    expect(expectOk(logAroundOne(0.5, 2))).toBeCloseTo(0.25, 15);
    expect(expectOk(gain(-12.5, 2))).toBe(-25);
    expect(expectOk(orderedGain(20, 0.5))).toBe(10);
  });

  it('the joint trim splits the transformed total on the original ratio', () => {
    // (0.2, 0.9): t = 0.3, t' = 1 − 0.7² = 0.51, split 2:1 into 0.34 and 0.17.
    const result = expectOk2(
      jointTrimWindow({ lateStart: 0.2, earlyEnd: 0.9 }, 2, MIN_RUBATO_WINDOW),
    );
    expect(result.lateStart).toBeCloseTo(0.34, 15);
    expect(result.earlyEnd).toBeCloseTo(0.83, 15);
  });
});

describe('dispatch', () => {
  it('routes each space to the same transform as its named function', () => {
    const s = 2.5;
    expect(transformInSpace({ kind: 'log-around-center', center: 72 }, 60, s)).toEqual(
      logAroundCenter(60, s, 72),
    );
    expect(transformInSpace({ kind: 'log-around-1' }, 1.5, s)).toEqual(logAroundOne(1.5, s));
    expect(transformInSpace({ kind: 'logit', lower: -1, upper: 1 }, 0.4, s)).toEqual(
      logit(0.4, s, -1, 1),
    );
    expect(transformInSpace({ kind: 'boundary-power-low' }, 0.4, s)).toEqual(
      boundaryPowerLow(0.4, s),
    );
    expect(transformInSpace({ kind: 'boundary-power-high' }, 0.4, s)).toEqual(
      boundaryPowerHigh(0.4, s),
    );
    expect(transformInSpace({ kind: 'gain' }, -12, s)).toEqual(gain(-12, s));
    expect(transformInSpace({ kind: 'gain-ordered' }, -12, s)).toEqual(orderedGain(-12, s));
  });

  it('separates gain from ordered gain by s-domain alone', () => {
    expect(gain(10, -2)).toEqual({ ok: true, value: -20 });
    const ordered = orderedGain(10, -2);
    expect(ordered.ok).toBe(false);
    if (!ordered.ok) expect(ordered.error).toBe('out-of-domain-input');
    expect(orderedGain(10, 2)).toEqual(gain(10, 2));
  });

  it('throws on an unknown space tag — a programmer error, not data', () => {
    const bogus = { kind: 'no-such-space' } as unknown as ScaleSpace;
    expect(() => transformInSpace(bogus, 1, 2)).toThrow(/unknown scale space/);
    expect(() => neutralOf(bogus)).toThrow(/unknown scale space/);
  });
});

/**
 * {@link deviation}'s scale for `T` values: one neper is the unit these quantities are read in.
 */
const NEPER_SCALE = 1;

/**
 * `T(C(x,s))` is `T` reading back a value the closed form just wrote, so it inherits the
 * conditioning P2 measures — see {@link amplificationAt}, which supplies the rest of the budget.
 */
const FORWARD_ULPS = 8;

describe('forward maps — `T` itself', () => {
  it.each(SPACES)(
    '$name: T(C(x,s)) = s*T(x) over the sampled grid',
    ({ space, values, factors, scale, boundDistance }) => {
      let compared = 0;
      let worst = 0;
      for (const x of values) {
        const forward = forwardInSpace(space, x);
        // The infinite boundary values have their own case below: `s · ±∞` is the one
        // product this identity cannot be stated over, which is why `s = 0` is a branch.
        if (!Number.isFinite(forward)) continue;
        for (const s of factors) {
          const moved = transformInSpace(space, x, s);
          // A refusal is a saturation, i.e. outside the subdomain the closed form claims.
          if (!moved.ok) continue;
          const budget =
            FORWARD_ULPS * Number.EPSILON * amplificationAt(moved.value, boundDistance, scale);
          worst = Math.max(
            worst,
            deviation(forwardInSpace(space, moved.value), s * forward, NEPER_SCALE) / budget,
          );
          compared += 1;
        }
      }
      expect(compared).toBeGreaterThan(20);
      expect(worst).toBeLessThanOrEqual(1);
    },
  );

  it('sends every space neutral to 0, which is the whole content of "T(neutral) = 0"', () => {
    for (const { space } of SPACES) {
      expect(forwardInSpace(space, neutralOf(space))).toBe(0);
    }
  });

  it('is strictly monotone on each domain, which is what makes |T(x) - T(y)| a metric', () => {
    for (const { name, space, values } of SPACES) {
      const forwards = values.map((x) => forwardInSpace(space, x));
      const image = `the forward image of ${name}`;
      // Direction is per space and carries no meaning for a distance: boundary-power(low)'s
      // `ln(1 - x)` decreases, every other space here increases.
      const ascending = numberAt(forwards, 1, image) > numberAt(forwards, 0, image);
      for (const [i, [previous, current]] of pairwise(forwards).entries()) {
        const ordered = ascending ? current > previous : current < previous;
        const at = numberAt(values, i + 1, `the ${name} probe values`);
        expect(`${name} @ ${at}: ${ordered}`).toBe(`${name} @ ${at}: true`);
      }
    }
  });

  it('returns the signed infinities comparison enumerates, leaving the cap to the caller', () => {
    // All of these are legal authored values. The capped metric is what makes them finite,
    // so this module must not clamp them or the cap would apply twice.
    expect(forwardInSpace({ kind: 'boundary-power-low' }, 1)).toBe(-Infinity);
    expect(forwardInSpace({ kind: 'boundary-power-high' }, 0)).toBe(-Infinity);
    expect(forwardInSpace({ kind: 'logit', lower: -1, upper: 1 }, -1)).toBe(-Infinity);
    expect(forwardInSpace({ kind: 'logit', lower: -1, upper: 1 }, 1)).toBe(Infinity);
    expect(forwardInSpace({ kind: 'logit', lower: 0, upper: 1 }, 0)).toBe(-Infinity);
    expect(forwardInSpace({ kind: 'logit', lower: 0, upper: 1 }, 1)).toBe(Infinity);
    expect(forwardInSpace({ kind: 'log-around-1' }, 0)).toBe(-Infinity);
    expect(forwardInSpace({ kind: 'log-around-center', center: 72 }, 0)).toBe(-Infinity);
  });

  it('holds T(C(x,s)) = s*T(x) at those boundary values too, for every admissible s > 0', () => {
    const boundaries: readonly (readonly [ScaleSpace, number])[] = [
      [{ kind: 'boundary-power-low' }, 1],
      [{ kind: 'boundary-power-high' }, 0],
      [{ kind: 'logit', lower: 0, upper: 1 }, 0],
      [{ kind: 'logit', lower: 0, upper: 1 }, 1],
      [{ kind: 'logit', lower: -1, upper: 1 }, -1],
      [{ kind: 'logit', lower: -1, upper: 1 }, 1],
    ];
    for (const [space, x] of boundaries) {
      const forward = forwardInSpace(space, x);
      for (const s of POSITIVE_FACTORS) {
        // the fixed points: the closed form returns the bound itself, so `T` returns the
        // same infinity — which is `s · (±∞)` for every s > 0, the sign being what the
        // identity actually asserts here.
        expect(forwardInSpace(space, expectOk(transformInSpace(space, x, s)))).toBe(forward);
      }
    }
  });

  it('makes s = 0 the branch the design says it is: T(neutral) = 0, never 0 * infinity', () => {
    const space: ScaleSpace = { kind: 'boundary-power-low' };
    expect(forwardInSpace(space, expectOk(transformInSpace(space, 1, 0)))).toBe(0);
    expect(0 * forwardInSpace(space, 1)).toBeNaN();
  });

  it('cancels the center in every difference, which is why comparison drops it', () => {
    const pairs = [
      [48, 60],
      [60, 120],
      [1e-3, 1e3],
    ] as const;
    for (const center of [1, 7.5, 72, 1e4]) {
      for (const [x, y] of pairs) {
        const centered = forwardLogAroundCenter(x, center) - forwardLogAroundCenter(y, center);
        const bare = forwardLogAroundOne(x) - forwardLogAroundOne(y);
        expect(deviation(centered, bare, NEPER_SCALE)).toBeLessThanOrEqual(
          FORWARD_ULPS * Number.EPSILON,
        );
      }
    }
  });

  it('gives NaN outside a log space domain — a typed document error, not a distance', () => {
    expect(forwardLogAroundOne(-1)).toBeNaN();
    expect(forwardLogAroundCenter(-1, 72)).toBeNaN();
    expect(forwardBoundaryPowerLow(1.5)).toBeNaN();
    expect(forwardLogit(1.5, 0, 1)).toBeNaN();
    expect(forwardLogit(-0.5, 0, 1)).toBeNaN();
  });

  it('does not gate its input, so the registry predicate has to run first', () => {
    // `boundary-power-low` below its lower bound is the trap: finite, plausible, and wrong.
    // Comparison checks the row's valueDomain before ever calling T.
    expect(forwardBoundaryPowerLow(-1)).toBeCloseTo(Math.LN2, 15);
    expect(isInValueDomain({ kind: 'boundary-power-low' }, -1)).toBe(false);
  });

  it('routes each space to its named forward map and throws on an unknown tag', () => {
    expect(forwardInSpace({ kind: 'log-around-center', center: 72 }, 60)).toBe(
      forwardLogAroundCenter(60, 72),
    );
    expect(forwardInSpace({ kind: 'log-around-1' }, 1.5)).toBe(forwardLogAroundOne(1.5));
    expect(forwardInSpace({ kind: 'logit', lower: -1, upper: 1 }, 0.4)).toBe(
      forwardLogit(0.4, -1, 1),
    );
    expect(forwardInSpace({ kind: 'boundary-power-low' }, 0.4)).toBe(forwardBoundaryPowerLow(0.4));
    expect(forwardInSpace({ kind: 'boundary-power-high' }, 0.4)).toBe(
      forwardBoundaryPowerHigh(0.4),
    );
    expect(forwardInSpace({ kind: 'gain' }, -12)).toBe(forwardGain(-12));
    expect(forwardInSpace({ kind: 'gain-ordered' }, -12)).toBe(forwardGain(-12));

    const bogus = { kind: 'no-such-space' } as unknown as ScaleSpace;
    expect(() => forwardInSpace(bogus, 1)).toThrow(/unknown scale space/);
  });
});

function expectOk2(result: TransformResult<RubatoWindow>): RubatoWindow {
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error('unreachable');
  return result.value;
}
