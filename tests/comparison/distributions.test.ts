/**
 * `src/comparison/distributions.ts` — the law mathematics.
 *
 * Every accuracy claim is measured against machinery that shares no arithmetic with the thing
 * measured. `Φ` is checked against a high-order quadrature of its own density (the definition,
 * not a second table); `W₁` and `W₂` against closed forms derived by hand in the comments; the
 * two ρ constants the design names are re-derived from their integrals rather than quoted. A test
 * against numbers the implementation produced would pin the bug along with the behaviour.
 */
import { describe, expect, it } from 'vitest';
import {
  DELTA_ZERO,
  RHO_UNIFORM_GAUSSIAN,
  RHO_UNIFORM_TRIANGULAR,
  cdf,
  cdfBreakpoints,
  clippedLaw,
  deltaLaw,
  gaussianEscapeWeight,
  gaussianLaw,
  lawsEqual,
  listLaw,
  quantile,
  standardNormalCdf,
  standardNormalQuantile,
  supportOf,
  triangularLaw,
  uniformLaw,
  wasserstein1,
  wasserstein2Decomposition,
  type ImprecisionLaw,
} from '../../src/comparison/distributions.js';
import { gaussLegendre10 } from '../../src/comparison/quadrature.js';
import { epsilonRecord } from '../../src/comparison/compare.js';
import { numberAt } from '../../src/prelude/index.js';

/**
 * An independent `Φ`: composite GL-10 over the standard normal density, 64 panels per unit. It
 * shares no coefficient with the implementation — only `gaussLegendre10`, whose own table is
 * re-derived by Newton's method in `quadrature.test.ts`.
 *
 * The left tail is integrated directly from `x − 12` rather than computed as `1 − Φ(−x)`,
 * because the reference has to be better than the thing it judges: the subtraction form loses
 * every significant digit of `Φ(−6.9) = 2.6·10⁻¹²`. Mass below `x − 12` is under
 * `e^{−(|x|+12)²/2}`, far below the claim being checked.
 */
function referenceNormalCdf(x: number): number {
  const density = (t: number): number => Math.exp((-t * t) / 2) / Math.sqrt(2 * Math.PI);
  const integrate = (lo: number, hi: number): number => {
    const panels = Math.max(1, Math.ceil((hi - lo) * 64));
    let total = 0;
    for (let i = 0; i < panels; ++i)
      total += gaussLegendre10(
        density,
        lo + ((hi - lo) * i) / panels,
        lo + ((hi - lo) * (i + 1)) / panels,
      );
    return total;
  };
  if (x < 0) return integrate(x - 12, x);
  return 0.5 + integrate(0, x);
}

/** A brute-force `W₁ = ∫|F_A − F_B|` by fine composite trapezoid — no shared machinery. */
function referenceW1(a: ImprecisionLaw, b: ImprecisionLaw, lo: number, hi: number): number {
  const steps = 400000;
  const width = (hi - lo) / steps;
  let total = 0;
  for (let i = 0; i <= steps; ++i) {
    const x = lo + width * i;
    const weight = i === 0 || i === steps ? 0.5 : 1;
    total += weight * Math.abs(cdf(a, x) - cdf(b, x));
  }
  return total * width;
}

describe('Φ and Φ⁻¹ (the imprecision family’s epsilon record)', () => {
  it('agrees with an independent quadrature of its own density — the MEASURED ε', () => {
    let worstAbsolute = 0;
    let worstAt = 0;
    let worstRelative = 0;
    let worstRelativeAt = 0;
    // The step is 0.002 because the relative peak sits just under the `erfc` handover at
    // `x = −2√2`, where `1 − erfSeries` still cancels about two digits, and a 0.01 grid can
    // miss it. The worst on `[−8, 0]` is 8.3e-14 at x ≈ −2.772; out to −37σ it is 2.3e-13.
    // Both against `mpmath` at 60 dps, both reproduced by the composite reference below.
    for (let x = -8; x <= 8; x += 0.002) {
      const reference = referenceNormalCdf(x);
      const error = Math.abs(standardNormalCdf(x) - reference);
      if (error > worstAbsolute) {
        worstAbsolute = error;
        worstAt = x;
      }
      // Relative error in the left tail, which is what the truncated Gaussian's normalizer and
      // Φ⁻¹'s Halley step consume. Only x ≤ 0 — for x > 0 the reference itself would have to
      // compute `1 − Φ(x)` and would lose the very digits being judged.
      if (x <= 0 && reference > 1e-300) {
        const relative = error / reference;
        if (relative > worstRelative) {
          worstRelative = relative;
          worstRelativeAt = x;
        }
      }
    }
    // These are the numbers the `imprecision` family carries; an A–S 7.1.26 rational measures
    // 7.5e-8 absolute here. The relative tolerance of 3e-13 sits just above the measured 2.3e-13
    // at −37σ. The absolute bound of 2e-15 is the reference's limit rather than the
    // implementation's: above x ≈ 6 the composite quadrature sums to within 1e-12 of 1 and
    // carries about 5 ulp of its own, while against `mpmath` at 60 dps the implementation's
    // worst over the same range is 1.3e-16, which the next test pins.
    expect(worstAbsolute, `worst absolute at x=${String(worstAt)}`).toBeLessThan(2e-15);
    expect(worstRelative, `worst relative at x=${String(worstRelativeAt)}`).toBeLessThan(3e-13);
    expect(
      worstRelative,
      'the peak under the erfc handover is real, not a grid artifact',
    ).toBeGreaterThan(5e-14);
    // The right tail is covered by symmetry, which is exact in IEEE754 for this pair.
    for (let x = 0.5; x <= 8; x += 0.25)
      expect(standardNormalCdf(x) + standardNormalCdf(-x)).toBeCloseTo(1, 15);
  });

  /**
   * The published absolute figure, against an arbitrary-precision reference. The composite
   * reference above catches a wrong algorithm but cannot bound the implementation below its own
   * quadrature error, which above `x ≈ 6` is 5 ulp. These points are `½·erfc(−x/√2)` at
   * `mp.dps = 60`, chosen where a table would be wrong: both sides of the `erfc` handover, the
   * peak of the relative error just under it, the far tail, and the subnormal floor.
   */
  it('matches an arbitrary-precision reference to 3e-16 absolute', () => {
    const REFERENCE: readonly (readonly [number, number])[] = [
      [-37, 5.725571222524577e-300],
      [-20, 2.7536241186062337e-89],
      [-12, 1.776482112077679e-33],
      [-8.5, 9.479534822203318e-18],
      [-6.9, 2.600126965638166e-12],
      [-4.88, 5.304292029750943e-7],
      [-2.8284271247461903, 0.0023388674905236314],
      [-2.772, 0.0027856518278135916],
      [-2.0, 0.02275013194817921],
      [-1.0, 0.15865525393145705],
      [-0.5, 0.3085375387259869],
      [0.0, 0.5],
      [0.5, 0.6914624612740131],
      [1.0, 0.8413447460685429],
      [2.0, 0.9772498680518208],
      [2.8284271247461903, 0.9976611325094764],
      [4.88, 0.999999469570797],
      [6.914, 0.9999999999976441],
    ];
    let worstAbsolute = 0;
    let worstNear = 0;
    let worstFar = 0;
    for (const [x, reference] of REFERENCE) {
      const error = Math.abs(standardNormalCdf(x) - reference);
      worstAbsolute = Math.max(worstAbsolute, error);
      if (x > 0) continue;
      worstFar = Math.max(worstFar, error / reference);
      if (x >= -8) worstNear = Math.max(worstNear, error / reference);
    }
    expect(worstAbsolute).toBeLessThan(3e-16);
    // Two relative figures, because one number cannot describe both regimes. Within `[−8, 0]`
    // the worst is 8.3e-14, just under `ERFC_CONTINUED_FRACTION_LIMIT`; below −8 the continued
    // fraction loses a little more per decade, reaching 2.3e-13 at −37σ. A fixed point list
    // understates the peak (1.9e-14 at exactly −2.772), so the scan above pins its existence
    // and this list pins the two ceilings.
    expect(worstNear).toBeLessThan(1e-13);
    expect(worstFar).toBeLessThan(3e-13);
  });

  it('is exact at the values a table typo would move', () => {
    expect(standardNormalCdf(0)).toBe(0.5);
    expect(standardNormalCdf(1)).toBeCloseTo(0.8413447460685429, 15);
    expect(standardNormalCdf(-1)).toBeCloseTo(0.15865525393145705, 15);
    expect(standardNormalCdf(1.959963984540054)).toBeCloseTo(0.975, 14);
    expect(standardNormalCdf(-2.5758293035489004)).toBeCloseTo(0.005, 14);
  });

  it('keeps RELATIVE accuracy in the far tail, where 1 − Φ(x) cannot', () => {
    // The whole reason Φ goes through erfc: Φ(-10) is 7.6e-24, and computing it as a
    // difference of numbers near 1 returns exactly 0.
    expect(standardNormalCdf(-10)).toBeGreaterThan(0);
    expect(standardNormalCdf(-10) / 7.61985302416e-24).toBeCloseTo(1, 6);
    expect(standardNormalCdf(-20) / 2.75362411861e-89).toBeCloseTo(1, 5);
    // The naive form really does fail here — the control that makes the claim non-vacuous.
    expect(1 - standardNormalCdf(10)).toBe(0);
  });

  it('the series and the continued fraction agree across their handover', () => {
    // The handover is at erf-argument 2, i.e. x = -2√2 for Φ. A step here would be invisible in
    // every other test and would put a discontinuity into every truncated normalizer.
    //
    // The slope has to be subtracted off: Φ genuinely changes by φ(2.83)·2·10⁻⁹ across the
    // probe gap, and reading that as a jump reports a 6·10⁻¹⁰ discontinuity that is not there.
    const at = -2 * Math.SQRT2;
    const gap = 1e-9;
    const continuedFractionSide = standardNormalCdf(at - gap);
    const seriesSide = standardNormalCdf(at + gap);
    const trueChange = (Math.exp((-at * at) / 2) / Math.sqrt(2 * Math.PI)) * 2 * gap;
    const jump = seriesSide - continuedFractionSide - trueChange;
    expect(Math.abs(jump) / seriesSide).toBeLessThan(1e-14);
  });

  it('Φ⁻¹ inverts Φ to the CDF’s own accuracy (the property the integrals use)', () => {
    let worst = 0;
    for (const p of [1e-12, 1e-6, 0.001, 0.02425, 0.1, 0.25, 0.5, 0.75, 0.9, 0.97575, 0.999999]) {
      const roundTrip = standardNormalCdf(standardNormalQuantile(p));
      worst = Math.max(worst, Math.abs(roundTrip - p) / p);
    }
    expect(worst).toBeLessThan(1e-13);
  });

  /**
   * The right tail, and a pin that can see it. The round trip above measures `|Φ(Q(p)) − p| / p`,
   * which in the right tail is exactly 0 at every probe by construction — `Φ` there is 1 to
   * sixteen digits whatever `Q` returned — so it is blind exactly where the Halley step is.
   * `Φ(x) − p` cancels completely as `p → 1`, which makes the correction noise and leaves
   * Acklam's raw accuracy standing: 1.124e-9 relative at `p = 1 − 1e-13` against 1.41e-17 at
   * `p = 1e-13`, an asymmetry of 4.5·10⁵ in an algorithm that is symmetric on paper.
   *
   * The check is against `mpmath` at 60 dps, on `1 − p` rather than on `p`, and the references
   * are computed for the double the caller actually passes: `fl(1 − 10^-k)` is not the exact
   * complement of `fl(10^-k)`, so one list of magnitudes for both tails would charge the right
   * one up to 1 % of a reference it never claimed.
   */
  it('Φ⁻¹ keeps its relative accuracy in the RIGHT tail, where the round trip is blind', () => {
    // Φ⁻¹ at p = fl(1 − 10^-k) and at p = fl(10^-k), k = 1..15, mpmath dps=60.
    const RIGHT = [
      1.2815515655446006, 2.3263478740408408, 3.090232306167813, 3.7190164854557084,
      4.264890793923841, 4.753424308817087, 5.199337582290661, 5.612001243305505,
      5.9978070196016375, 6.361340889697422, 6.706023143414748, 7.0344869100478356,
      7.3487545403000425, 7.650730905155643, 7.941444487415978,
    ];
    const LEFT = [
      -1.2815515655446004, -2.326347874040841, -3.0902323061678136, -3.7190164854556804,
      -4.264890793922825, -4.753424308822899, -5.1993375821928165, -5.612001244174789,
      -5.9978070150076865, -6.361340902404057, -6.706023155495136, -7.034483825301132,
      -7.348796102800677, -7.650628092935269, -7.941345326170997,
    ];
    let worstRight = 0;
    let worstLeft = 0;
    for (let k = 1; k <= 15; ++k) {
      const right = standardNormalQuantile(1 - 10 ** -k);
      const left = standardNormalQuantile(10 ** -k);
      const expectedRight = numberAt(RIGHT, k - 1, 'the right-tail reference quantiles');
      const expectedLeft = numberAt(LEFT, k - 1, 'the left-tail reference quantiles');
      worstRight = Math.max(worstRight, Math.abs(right - expectedRight) / Math.abs(expectedRight));
      worstLeft = Math.max(worstLeft, Math.abs(left - expectedLeft) / Math.abs(expectedLeft));
    }
    // Both tails at the CDF's own accuracy, which is what the doc claims for the Halley step.
    expect(worstRight).toBeLessThan(1e-14);
    expect(worstLeft).toBeLessThan(1e-14);
    // No asymmetry left worth naming: the unrepaired Halley step scores 4.5e5 here.
    expect(worstRight / Math.max(worstLeft, Number.MIN_VALUE)).toBeLessThan(100);
  });

  it('the round trip, stated on 1 − p, is exact in the right tail too', () => {
    // The complementary form of the pin above: `Φ(−Q(p))` against `1 − p`, the quantity that
    // carries information there. `|Φ(Q(p)) − p| / p` stays the operative form for the left tail.
    let worst = 0;
    for (let k = 1; k <= 13; ++k) {
      const p = 1 - 10 ** -k;
      const complement = standardNormalCdf(-standardNormalQuantile(p));
      worst = Math.max(worst, Math.abs(complement - (1 - p)) / (1 - p));
    }
    expect(worst).toBeLessThan(1e-13);
  });

  it('Φ⁻¹ is signed-symmetric and answers the boundary', () => {
    expect(standardNormalQuantile(0.5)).toBeCloseTo(0, 15);
    expect(standardNormalQuantile(0.975)).toBeCloseTo(1.959963984540054, 12);
    expect(standardNormalQuantile(0)).toBe(Number.NEGATIVE_INFINITY);
    expect(standardNormalQuantile(1)).toBe(Number.POSITIVE_INFINITY);
  });
});

describe('the law vocabulary canonicalizes what the renderer performs identically', () => {
  it('an inverted uniform is the same law (measured at the provider)', () => {
    expect(uniformLaw(30, -30)).toEqual(uniformLaw(-30, 30));
  });

  it('a degenerate uniform, a zero σ and an absent everything are all δ₀', () => {
    expect(uniformLaw(0, 0)).toEqual(DELTA_ZERO);
    expect(gaussianLaw(0, -30, 30)).toEqual(DELTA_ZERO);
    expect(listLaw([0, 0, 0])).toEqual(DELTA_ZERO);
  });

  it('σ’s sign is immaterial — the renderer multiplies a symmetric deviate by it', () => {
    expect(gaussianLaw(-10, -5, 5)).toEqual(gaussianLaw(10, -5, 5));
  });

  it('an inverted-limit triangular has no CDF at all, so the caller reads ⊥', () => {
    // The two branches run in opposite directions and the "quantile" jumps down by 132 at
    // u = 0.5. Same disposition as the non-monotone pedal date component.
    expect(triangularLaw(30, -30, 0)).toBeNull();
    expect(triangularLaw(-30, 30, 0)).not.toBeNull();
  });

  it('a vacuous clip is dropped, so two encodings of one performed law compare equal', () => {
    const base = uniformLaw(-10, 10);
    expect(clippedLaw(base, -100, 100)).toEqual(base);
    expect(clippedLaw(base, -10, 10)).toEqual(base);
    expect(clippedLaw(base, -5, 5).kind).toBe('clipped');
  });

  it('a clip entirely outside the support collapses to the bound it pins everything to', () => {
    expect(clippedLaw(uniformLaw(-10, 10), 20, 30)).toEqual(deltaLaw(20));
    expect(clippedLaw(uniformLaw(-10, 10), -30, -20)).toEqual(deltaLaw(-20));
  });
});

describe('CDFs and quantiles are mutually inverse', () => {
  const laws: readonly [string, ImprecisionLaw][] = [
    ['δ₀', DELTA_ZERO],
    ['uniform', uniformLaw(-30, 30)],
    ['triangular', triangularLaw(-30, 30, 0) as ImprecisionLaw],
    ['triangular skew', triangularLaw(-30, 30, 20) as ImprecisionLaw],
    ['gaussian truncated', gaussianLaw(10, -15, 15)],
    ['gaussian untruncated', gaussianLaw(10, 0, 0)],
    ['list', listLaw([-5, -1, 0, 2, 9]) as ImprecisionLaw],
    ['clipped triangular', clippedLaw(triangularLaw(-30, 30, 0) as never, -10, 10)],
  ];

  for (const [name, law] of laws)
    it(`${name}: F(Q(u)) ≥ u and Q is non-decreasing`, () => {
      let previous = Number.NEGATIVE_INFINITY;
      for (let u = 0.001; u < 1; u += 0.001) {
        const q = quantile(law, u);
        expect(q).toBeGreaterThanOrEqual(previous - 1e-9);
        previous = q;
        expect(cdf(law, q)).toBeGreaterThanOrEqual(u - 1e-9);
      }
    });

  it('the triangular’s CDF is the inverse of the renderer’s own two-branch formula', () => {
    // Including a mode outside the limits, where the textbook triangular has no answer and the
    // renderer plainly does — values up to ~58 before clipping.
    for (const mode of [-40, -30, -10, 0, 15, 30, 99]) {
      const law = triangularLaw(-30, 30, mode);
      expect(law).not.toBeNull();
      for (let u = 0.01; u < 1; u += 0.01)
        expect(cdf(law as ImprecisionLaw, quantile(law as ImprecisionLaw, u))).toBeCloseTo(u, 9);
    }
  });

  it('clipping creates atoms at the bounds, of exactly the tail weight it swallowed', () => {
    const base = uniformLaw(-30, 30);
    const clipped = clippedLaw(base, -10, 10);
    // P(X ≤ -10) under U(-30,30) is 1/3, and clipping moves all of it onto -10.
    expect(cdf(clipped, -10)).toBeCloseTo(1 / 3, 12);
    expect(cdf(clipped, -10 - 1e-9)).toBe(0);
    expect(cdf(clipped, 10 - 1e-9)).toBeCloseTo(2 / 3, 8);
    expect(cdf(clipped, 10)).toBe(1);
  });

  /**
   * The support is where the sampler reaches, and for a mode outside the limits the rising
   * branch runs to `u = 1`: the supremum is `lower + √(scale·belowMode)` and not the mode. A
   * hull taken as the mode itself keeps the true endpoint, where the integrand kinks, out of
   * `cdfBreakpoints`, and GL-10 straddles it. The reference is the renderer's own two-branch
   * formula (`RandomNumberProvider:335-353`) evaluated at the extreme `u`; a textbook triangular
   * has no answer here, which is why the CDF is rewritten.
   */
  it('the support is where the renderer’s sampler reaches, mode outside the limits included', () => {
    // `lo + √(u·s·a)` below the branch fraction, `hi − √((1−u)·s·b)` above it.
    const sampled = (lower: number, upper: number, mode: number, u: number): number => {
      const scale = upper - lower;
      const below = mode - lower;
      const above = upper - mode;
      return u < below / scale
        ? lower + Math.sqrt(u * scale * below)
        : upper - Math.sqrt((1 - u) * scale * above);
    };
    for (const [lower, upper, mode] of [
      [-30, 30, 99],
      [0, 1, 1000],
      [-30, 30, -99],
      [-30, 30, 0],
      [-30, 30, 15],
    ] as const) {
      const law = triangularLaw(lower, upper, mode) as ImprecisionLaw;
      const [lo, hi] = supportOf(law);
      const reach = [sampled(lower, upper, mode, 0), sampled(lower, upper, mode, 1 - 1e-15)];
      expect(hi).toBeCloseTo(Math.max(upper, ...reach), 6);
      expect(lo).toBeCloseTo(Math.min(lower, ...reach), 6);
    }
    // The two measured against the sampler, to the digit.
    expect(supportOf(triangularLaw(-30, 30, 99) as ImprecisionLaw)[1]).toBeCloseTo(57.97727, 5);
    expect(supportOf(triangularLaw(0, 1, 1000) as ImprecisionLaw)[1]).toBeCloseTo(31.622777, 6);
  });

  it('restores W₁ to machine precision where the overstated hull cost five orders', () => {
    // Closed forms derived from `W₁ = ∫|F| dx` over the true support, not from this module.
    const w1AgainstDelta = (lower: number, upper: number, mode: number): number => {
      const law = triangularLaw(lower, upper, mode) as ImprecisionLaw;
      return wasserstein1(law, DELTA_ZERO);
    };
    // Against an independent 4096-panel composite Simpson of |Q(u)| over u — the quantile
    // form, which needs no support hull at all and therefore cannot inherit the same bug.
    const byQuantile = (lower: number, upper: number, mode: number): number => {
      const law = triangularLaw(lower, upper, mode) as ImprecisionLaw;
      const n = 4096;
      let total = 0;
      for (let i = 0; i < n; ++i) {
        const u0 = i / n;
        const u1 = (i + 1) / n;
        const mid = (u0 + u1) / 2;
        total +=
          ((u1 - u0) / 6) *
          (Math.abs(quantile(law, u0 + 1e-12)) +
            4 * Math.abs(quantile(law, mid)) +
            Math.abs(quantile(law, u1 - 1e-12)));
      }
      return total;
    };
    for (const [lower, upper, mode] of [
      [-30, 30, 99],
      [0, 1, 1000],
      [-30, 30, 0],
    ] as const) {
      const measured = w1AgainstDelta(lower, upper, mode);
      expect(Math.abs(measured - byQuantile(lower, upper, mode))).toBeLessThan(1e-5 * measured);
    }
    // An overstated hull puts GL-10 across the kink and costs 1.07e-2 relative on this one.
    expect(w1AgainstDelta(0, 1, 1000)).toBeCloseTo(21.081851067789195, 9);
    expect(w1AgainstDelta(-30, 30, 99)).toBeCloseTo(30.977094589809564, 9);
  });

  /**
   * what the `imprecision` epsilon figure is relative to.
   *
   * `W₁ = ∫|F_A − F_B| dx` over the union support, so a small answer is a small difference of
   * large integrals: the absolute error is what the quadrature bounds, and the naive relative
   * error is unbounded as the two laws approach each other. Read as a relative figure, two
   * uniforms 6e-12 apart falsify it by eleven orders while the absolute error stays at one ulp
   * of the support.
   */
  it('is machine-precise against the SUPPORT SCALE, and not against the answer', () => {
    // Closed forms derived from `W₁ = ∫₀¹|Q_A − Q_B| du`, not copied from this module.
    const CASES: readonly (readonly [ImprecisionLaw, ImprecisionLaw, number])[] = [
      ...[6, 6e-3, 6e-6, 6e-9, 6e-12].map(
        (shift) => [uniformLaw(-30, 30), uniformLaw(-30 + shift, 30 + shift), shift] as const,
      ),
      ...[30, 4, 1e-3].map((h) => [uniformLaw(-h, h), DELTA_ZERO, h / 2] as const),
      ...[30, 6].map(
        (h) => [triangularLaw(-h, h, 0) as ImprecisionLaw, DELTA_ZERO, h / 3] as const,
      ),
      [deltaLaw(5), deltaLaw(11), 6],
      [deltaLaw(0), deltaLaw(1e-6), 1e-6],
      ...[10, 0.5].map(
        (sigma) =>
          [
            gaussianLaw(sigma, 0, 0) as ImprecisionLaw,
            DELTA_ZERO,
            sigma * Math.sqrt(2 / Math.PI),
          ] as const,
      ),
    ];

    let worstNaive = 0;
    let worstAgainstSupport = 0;
    for (const [a, b, exact] of CASES) {
      const error = Math.abs(wasserstein1(a, b) - exact);
      const [loA, hiA] = supportOf(a);
      const [loB, hiB] = supportOf(b);
      const scale = Math.max(hiA, hiB) - Math.min(loA, loB);
      worstNaive = Math.max(worstNaive, error / exact);
      if (scale > 0) worstAgainstSupport = Math.max(worstAgainstSupport, error / scale);
    }

    // The published figure, and the quantity it is a figure for.
    expect(worstAgainstSupport).toBeLessThan(3e-16);
    expect(epsilonRecord().imprecision.relative).toBe(3e-16);
    // The falsification, asserted so the caveat cannot quietly stop being true: the naive
    // reading is five orders worse on this same family.
    expect(worstNaive).toBeGreaterThan(1e-6);
  });

  it('collapses a clip that is vacuous in TRUTH, which the overstated hull kept', () => {
    // T(0, 1, 1000) really reaches 31.62, so a clip at ±40 swallows nothing and the law is its
    // own base — price the resolved performed effect. A hull claiming 1000 keeps the wrapper, and
    // `lawsEqual(base, clipped)` then says false for two laws that are equal.
    const base = triangularLaw(0, 1, 1000) as never;
    expect(clippedLaw(base, -40, 40)).toBe(base);
    // A clip that really does bite is still a clip.
    expect(clippedLaw(base, -40, 10).kind).toBe('clipped');
  });
});

describe('the Gaussian is a mixture, not a truncated normal', () => {
  it('limit.lower === limit.upper gives weight 1 — the untruncated law', () => {
    expect(gaussianEscapeWeight(gaussianLaw(10, 0, 0) as never)).toBe(1);
    expect(gaussianEscapeWeight(gaussianLaw(10, 5, 5) as never)).toBe(1);
    expect(wasserstein1(gaussianLaw(10, 0, 0), DELTA_ZERO)).toBeGreaterThan(1);
  });

  it('inverted limits also give the untruncated law (measured at the provider)', () => {
    expect(gaussianEscapeWeight(gaussianLaw(10, 30, -30) as never)).toBe(1);
  });

  it('ordinary limits give weight 0, i.e. the pure truncated normal', () => {
    expect(gaussianEscapeWeight(gaussianLaw(10, -30, 30) as never)).toBe(0);
    expect(gaussianEscapeWeight(gaussianLaw(10, -1, 1) as never)).toBe(0);
  });

  it('the escape weight is q^10000, and the window where it is neither 0 nor 1 is real', () => {
    // Measured against the renderer: with σ = 10 and limits ±0.001 the escape fires on 46.4 %
    // of draws. q = 1 − (Φ(h/σ) − Φ(−h/σ)).
    const law = gaussianLaw(10, -0.001, 0.001) as never;
    const inside = standardNormalCdf(0.0001) - standardNormalCdf(-0.0001);
    expect(gaussianEscapeWeight(law)).toBeCloseTo(Math.pow(1 - inside, 10000), 12);
    expect(gaussianEscapeWeight(law)).toBeGreaterThan(0.4);
    expect(gaussianEscapeWeight(law)).toBeLessThan(0.5);
  });

  it('a live mixture’s quantile is still monotone and inverts its CDF', () => {
    const law = gaussianLaw(10, -0.001, 0.001);
    let previous = Number.NEGATIVE_INFINITY;
    for (let u = 0.01; u < 1; u += 0.01) {
      const q = quantile(law, u);
      expect(q).toBeGreaterThanOrEqual(previous - 1e-6);
      previous = q;
      expect(cdf(law, q)).toBeCloseTo(u, 6);
    }
  });
});

describe('W₁ against closed forms', () => {
  it('is exactly 0 on identical laws (identity needs exact, not small)', () => {
    for (const law of [
      DELTA_ZERO,
      uniformLaw(-30, 30),
      triangularLaw(-30, 30, 5) as ImprecisionLaw,
      gaussianLaw(10, -15, 15),
      listLaw([1, 2, 3]) as ImprecisionLaw,
    ])
      expect(wasserstein1(law, law)).toBe(0);
  });

  it('δ_a vs δ_b is |a − b|', () => {
    expect(wasserstein1(deltaLaw(-7), deltaLaw(11))).toBeCloseTo(18, 12);
  });

  it('U(a,b) vs δ₀ centred is (b−a)/4', () => {
    // W₁(U(-h,h), δ₀) = ∫|F_U − F_δ| = 2·∫₀^h (x/(2h)) dx = h/2.
    expect(wasserstein1(uniformLaw(-30, 30), DELTA_ZERO)).toBeCloseTo(15, 10);
    expect(wasserstein1(uniformLaw(-4, 4), DELTA_ZERO)).toBeCloseTo(2, 12);
  });

  it('two uniforms of equal width, shifted, cost the shift exactly', () => {
    expect(wasserstein1(uniformLaw(0, 10), uniformLaw(3, 13))).toBeCloseTo(3, 10);
  });

  it('nested uniforms cost the difference of half-widths', () => {
    // W₁(U(-A,A), U(-a,a)) = (A − a)/2 for A > a.
    expect(wasserstein1(uniformLaw(-30, 30), uniformLaw(-10, 10))).toBeCloseTo(10, 10);
  });

  it('symmetric triangular vs δ₀ is its own mean absolute deviation', () => {
    // For T(-h, h, 0): E|X| = h/3.
    expect(wasserstein1(triangularLaw(-30, 30, 0) as ImprecisionLaw, DELTA_ZERO)).toBeCloseTo(
      10,
      8,
    );
  });

  it('Gaussian vs δ₀ is σ·√(2/π), the half-normal mean', () => {
    const sigma = 12;
    expect(wasserstein1(gaussianLaw(sigma, 0, 0), DELTA_ZERO)).toBeCloseTo(
      sigma * Math.sqrt(2 / Math.PI),
      6,
    );
  });

  it('a list vs δ₀ is the mean absolute value of its entries', () => {
    const values = [-5, -1, 0, 2, 9];
    const expected = values.reduce((sum, v) => sum + Math.abs(v), 0) / values.length;
    expect(wasserstein1(listLaw(values) as ImprecisionLaw, DELTA_ZERO)).toBeCloseTo(expected, 10);
  });

  it('agrees with a 400 000-point independent reference across mixed family pairs', () => {
    const pairs: readonly [ImprecisionLaw, ImprecisionLaw, number, number][] = [
      [uniformLaw(-30, 30), triangularLaw(-30, 30, 0) as ImprecisionLaw, -35, 35],
      [uniformLaw(-30, 30), triangularLaw(-20, 40, 35) as ImprecisionLaw, -35, 45],
      [clippedLaw(triangularLaw(-30, 30, 0) as never, -8, 8), uniformLaw(-12, 4), -35, 35],
      [listLaw([-9, -2, 3, 4, 20]) as ImprecisionLaw, uniformLaw(-10, 10), -12, 22],
      [gaussianLaw(8, 0, 0), uniformLaw(-14, 14), -60, 60],
      [gaussianLaw(8, -10, 10), triangularLaw(-30, 30, 0) as ImprecisionLaw, -40, 40],
    ];
    for (const [a, b, lo, hi] of pairs) {
      const measured = wasserstein1(a, b);
      const reference = referenceW1(a, b, lo, hi);
      expect(Math.abs(measured - reference) / Math.max(reference, 1e-12)).toBeLessThan(1e-4);
    }
  });

  it('resolves a DOUBLE crossing inside one piece — the M7 hazard, in this family', () => {
    // Two CDFs whose difference crosses zero twice between structural breakpoints: a wide
    // uniform against a narrow triangular sharing a mean. Without the quadratic vertex the lobes
    // cancel and the cell integrates low.
    const a = uniformLaw(-30, 30);
    const b = triangularLaw(-30, 30, 0) as ImprecisionLaw;
    const measured = wasserstein1(a, b);
    const reference = referenceW1(a, b, -35, 35);
    expect(measured).toBeGreaterThan(0);
    expect(Math.abs(measured - reference) / reference).toBeLessThan(1e-6);
  });

  it('is symmetric to the last bit', () => {
    const pairs: readonly [ImprecisionLaw, ImprecisionLaw][] = [
      [uniformLaw(-30, 30), triangularLaw(-20, 40, 35) as ImprecisionLaw],
      [gaussianLaw(8, -10, 10), listLaw([-3, 0, 14]) as ImprecisionLaw],
      [clippedLaw(triangularLaw(-30, 30, 0) as never, -8, 8), DELTA_ZERO],
    ];
    for (const [a, b] of pairs) expect(wasserstein1(a, b)).toBe(wasserstein1(b, a));
  });

  it('satisfies the triangle inequality across the family', () => {
    const laws: ImprecisionLaw[] = [
      DELTA_ZERO,
      uniformLaw(-30, 30),
      uniformLaw(-5, 25),
      triangularLaw(-30, 30, 0) as ImprecisionLaw,
      triangularLaw(-20, 40, 35) as ImprecisionLaw,
      clippedLaw(triangularLaw(-30, 30, 0) as never, -8, 8),
      gaussianLaw(8, -10, 10),
      gaussianLaw(8, 0, 0),
      listLaw([-9, -2, 3, 4, 20]) as ImprecisionLaw,
    ];
    for (const a of laws)
      for (const b of laws)
        for (const c of laws)
          expect(wasserstein1(a, c)).toBeLessThanOrEqual(
            (wasserstein1(a, b) + wasserstein1(b, c)) * (1 + 1e-9),
          );
  });

  it('separates every member of that family (non-degeneracy — the anti-vacuity control)', () => {
    const laws: ImprecisionLaw[] = [
      DELTA_ZERO,
      uniformLaw(-30, 30),
      triangularLaw(-30, 30, 0) as ImprecisionLaw,
      gaussianLaw(8, 0, 0),
      listLaw([-9, -2, 3, 4, 20]) as ImprecisionLaw,
    ];
    for (const [i, left] of laws.entries())
      for (const right of laws.slice(i + 1))
        expect(wasserstein1(left, right)).toBeGreaterThan(1e-6);
  });
});

describe('W₂ and the decomposition', () => {
  it('closes the identity ‖Q_A − Q_B‖₂² = level² + gain² + shape² for every pair', () => {
    const laws: ImprecisionLaw[] = [
      DELTA_ZERO,
      uniformLaw(-30, 30),
      uniformLaw(-5, 25),
      triangularLaw(-30, 30, 0) as ImprecisionLaw,
      triangularLaw(-20, 40, 35) as ImprecisionLaw,
      clippedLaw(triangularLaw(-30, 30, 0) as never, -8, 8),
      gaussianLaw(8, -10, 10),
      gaussianLaw(8, 0, 0),
      listLaw([-9, -2, 3, 4, 20]) as ImprecisionLaw,
    ];
    for (const a of laws)
      for (const b of laws) {
        const d = wasserstein2Decomposition(a, b);
        expect(d.closingResidual).toBeLessThan(1e-6 * Math.max(1, d.w2 * d.w2));
      }
  });

  it('moments of a uniform law are its closed forms', () => {
    const d = wasserstein2Decomposition(uniformLaw(-30, 30), uniformLaw(0, 60));
    expect(d.meanA).toBeCloseTo(0, 9);
    expect(d.meanB).toBeCloseTo(30, 9);
    expect(d.sigmaA).toBeCloseTo(60 / Math.sqrt(12), 9);
    expect(d.sigmaB).toBeCloseTo(60 / Math.sqrt(12), 9);
    // Pure translation: all of W₂ is location, and ρ is exactly 1.
    expect(d.location).toBeCloseTo(30, 9);
    expect(d.spread).toBeCloseTo(0, 9);
    expect(d.rho).toBeCloseTo(1, 9);
    expect(d.shape).toBeCloseTo(0, 6);
    expect(d.w2).toBeCloseTo(30, 9);
  });

  it('moments of a symmetric triangular and of a Gaussian are their closed forms', () => {
    const triangular = wasserstein2Decomposition(
      triangularLaw(-30, 30, 0) as ImprecisionLaw,
      DELTA_ZERO,
    );
    expect(triangular.meanA).toBeCloseTo(0, 9);
    expect(triangular.sigmaA).toBeCloseTo(30 / Math.sqrt(6), 8);

    const gaussian = wasserstein2Decomposition(gaussianLaw(11, 0, 0), DELTA_ZERO);
    expect(gaussian.meanA).toBeCloseTo(0, 6);
    expect(gaussian.sigmaA).toBeCloseTo(11, 6);
    // W₂ from a point mass is the law's own second moment about that point.
    expect(gaussian.w2).toBeCloseTo(11, 6);
  });

  it('ρ(uniform, symmetric triangular) = 7√2/10 — the constant, re-derived', () => {
    // Derivation, independent of the implementation: with T on [-1,1] mode 0,
    // ∫₀¹(u−½)Q_T(u)du = 2∫₀^{1/2}(½−t)(1−√(2t))dt = 2(1/8 − 1/15) = 7/60,
    // σ_U = 1/√12, σ_T = 1/√6  ⇒  ρ = (7/60)·√72 = 7√2/10.
    expect(RHO_UNIFORM_TRIANGULAR).toBeCloseTo(0.9899494936611665, 15);
    const derived = (7 / 60) * Math.sqrt(72);
    expect(RHO_UNIFORM_TRIANGULAR).toBeCloseTo(derived, 15);

    for (const [uniform, triangular] of [
      [uniformLaw(-1, 1), triangularLaw(-1, 1, 0)],
      [uniformLaw(-30, 30), triangularLaw(-30, 30, 0)],
      [uniformLaw(0, 7), triangularLaw(-100, 100, 0)],
    ] as const) {
      const d = wasserstein2Decomposition(uniform, triangular as ImprecisionLaw);
      expect(d.rho).toBeCloseTo(RHO_UNIFORM_TRIANGULAR, 7);
    }
  });

  it('ρ(uniform, Gaussian) = √(3/π) — the other constant, re-derived', () => {
    // Cov(Q_U, Q_N) = ∫₀¹(u−½)Φ⁻¹(u)du = E[X·Φ(X)] = 1/(2√π); σ_U = 1/√12, σ_N = 1
    // ⇒ ρ = √12/(2√π) = √(3/π).
    expect(RHO_UNIFORM_GAUSSIAN).toBeCloseTo(0.9772050238058398, 15);
    const derived = Math.sqrt(12) / (2 * Math.sqrt(Math.PI));
    expect(RHO_UNIFORM_GAUSSIAN).toBeCloseTo(derived, 15);

    for (const [uniform, sigma] of [
      [uniformLaw(-1, 1), 1],
      [uniformLaw(-30, 30), 12],
      [uniformLaw(4, 9), 0.5],
    ] as const) {
      const d = wasserstein2Decomposition(uniform, gaussianLaw(sigma, 0, 0));
      expect(d.rho).toBeCloseTo(RHO_UNIFORM_GAUSSIAN, 5);
    }
  });

  it('ρ = 1 exactly between affine images of one law, whatever the family', () => {
    for (const [a, b] of [
      [uniformLaw(-1, 1), uniformLaw(-30, 30)],
      [triangularLaw(-1, 1, 0), triangularLaw(-30, 30, 0)],
      [gaussianLaw(1, 0, 0), gaussianLaw(12, 0, 0)],
      [triangularLaw(0, 3, 1), triangularLaw(0, 30, 10)],
    ] as const) {
      const d = wasserstein2Decomposition(a as ImprecisionLaw, b as ImprecisionLaw);
      expect(d.rho).toBeCloseTo(1, 8);
      expect(d.shape).toBeLessThan(1e-3);
    }
  });

  it('a spreadless law is recognized structurally, never by float equality', () => {
    const d = wasserstein2Decomposition(DELTA_ZERO, uniformLaw(-30, 30));
    expect(d.sigmaA).toBe(0);
    expect(d.rho).toBeNull();
    expect(d.shape).toBe(0);
    expect(d.shapeless).toBe(true);
    // The floor is what makes this fire: the raw quantile variance of a point mass is not 0.
    expect(d.sigmaB).toBeGreaterThan(0);
    expect(d.shapeless).toBe(true);
  });

  it('W₂ between two centred Gaussians is |σ_A − σ_B|', () => {
    const d = wasserstein2Decomposition(gaussianLaw(5, 0, 0), gaussianLaw(9, 0, 0));
    expect(d.w2).toBeCloseTo(4, 5);
    expect(d.spread).toBeCloseTo(4, 5);
    expect(d.location).toBeCloseTo(0, 6);
  });

  it('is symmetric in its two arguments', () => {
    const a = triangularLaw(-20, 40, 35) as ImprecisionLaw;
    const b = gaussianLaw(8, -10, 10);
    const forward = wasserstein2Decomposition(a, b);
    const backward = wasserstein2Decomposition(b, a);
    expect(forward.w2).toBeCloseTo(backward.w2, 12);
    expect(forward.location).toBeCloseTo(backward.location, 12);
    expect(forward.spread).toBeCloseTo(backward.spread, 12);
    expect(forward.rho as number).toBeCloseTo(backward.rho as number, 12);
  });
});

describe('structural equality and breakpoints', () => {
  it('two untruncated Gaussians agree whatever their dead limits say', () => {
    expect(lawsEqual(gaussianLaw(10, 0, 0), gaussianLaw(10, 7, 7))).toBe(true);
    expect(wasserstein1(gaussianLaw(10, 0, 0), gaussianLaw(10, 7, 7))).toBe(0);
    expect(lawsEqual(gaussianLaw(10, 0, 0), gaussianLaw(11, 0, 0))).toBe(false);
  });

  it('every law’s breakpoints bracket its own support', () => {
    for (const law of [
      DELTA_ZERO,
      uniformLaw(-30, 30),
      triangularLaw(-30, 30, 99) as ImprecisionLaw,
      gaussianLaw(10, -5, 5),
      listLaw([1, 4, 9]) as ImprecisionLaw,
      clippedLaw(triangularLaw(-30, 30, 0) as never, -8, 8),
    ]) {
      const breakpoints = cdfBreakpoints(law);
      expect(breakpoints.length).toBeGreaterThan(0);
      for (const x of breakpoints) expect(Number.isFinite(x)).toBe(true);
    }
  });
});
