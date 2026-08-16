/**
 * `src/comparison/distributions.ts` — DESIGN.md §5.9's law mathematics.
 *
 * The discipline here is the campaign's: every accuracy claim is MEASURED against machinery
 * that shares no arithmetic with the thing measured. `Φ` is checked against a high-order
 * quadrature of its own density (the definition, not a second table); `W₁` and `W₂` against
 * closed forms derived by hand in the comments; the two ρ constants §5.9 names are re-derived
 * from their integrals rather than quoted. A test that compared the implementation against
 * numbers the implementation produced would pin the bug along with the behaviour.
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

/**
 * An INDEPENDENT `Φ`: composite GL-10 over the standard normal density, 64 panels per unit.
 *
 * It shares no coefficient with the implementation — only `gaussLegendre10`, whose own table
 * is re-derived by Newton's method in `quadrature.test.ts`. This is the reference that
 * licenses the series.
 *
 * The LEFT tail is integrated directly from `x − 12` rather than computed as `1 − Φ(−x)`,
 * because the reference has to be better than the thing it judges: the subtraction form loses
 * every significant digit of `Φ(−6.9) = 2.6·10⁻¹²`, and the first version of this test
 * blamed the implementation for its own reference's cancellation. Mass below `x − 12` is
 * under `e^{−(|x|+12)²/2}`, far below the claim being checked.
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

describe('Φ and Φ⁻¹ (§5.0 epsilon record: the imprecision family)', () => {
  it('agrees with an independent quadrature of its own density — the MEASURED ε', () => {
    let worstAbsolute = 0;
    let worstAt = 0;
    let worstRelative = 0;
    let worstRelativeAt = 0;
    for (let x = -8; x <= 8; x += 0.01) {
      const reference = referenceNormalCdf(x);
      const error = Math.abs(standardNormalCdf(x) - reference);
      if (error > worstAbsolute) {
        worstAbsolute = error;
        worstAt = x;
      }
      // Relative error in the LEFT tail, which is what the truncated Gaussian's normalizer
      // and Φ⁻¹'s Halley step consume. Only x ≤ 0 — for x > 0 the reference itself would
      // have to compute `1 − Φ(x)` and would lose the very digits being judged.
      if (x <= 0 && reference > 1e-300) {
        const relative = error / reference;
        if (relative > worstRelative) {
          worstRelative = relative;
          worstRelativeAt = x;
        }
      }
    }
    // Reported rather than merely asserted: these are the numbers §9.3's `imprecision` family
    // carries. The A–S 7.1.26 rational the draft proposed measures 7.5e-8 absolute here.
    expect(worstAbsolute, `worst absolute at x=${String(worstAt)}`).toBeLessThan(1e-15);
    expect(worstRelative, `worst relative at x=${String(worstRelativeAt)}`).toBeLessThan(1e-10);
    // The right tail is covered by symmetry, which is exact in IEEE754 for this pair.
    for (let x = 0.5; x <= 8; x += 0.25)
      expect(standardNormalCdf(x) + standardNormalCdf(-x)).toBeCloseTo(1, 15);
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
    // The handover is at erf-argument 2, i.e. x = -2√2 for Φ. A step here would be invisible
    // in every other test and would put a discontinuity into every truncated normalizer.
    //
    // The slope has to be subtracted off, which the first version of this test forgot: Φ
    // genuinely changes by φ(2.83)·2·10⁻⁹ across the probe gap, and reading that as a jump
    // accused the implementation of a 6·10⁻¹⁰ discontinuity it does not have.
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
    // Measured: the two branches run in opposite directions and the "quantile" jumps DOWN
    // by 132 at u = 0.5. Same disposition as §5.8's non-monotone pedal date component.
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
    // Including a mode OUTSIDE the limits, where the textbook triangular has no answer and
    // the renderer plainly does (measured: values up to ~58 before clipping).
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
   * W3 CAPITAL-3. The support is where the SAMPLER reaches, and for a mode outside the limits
   * the rising branch runs to `u = 1`: the supremum is `lower + √(scale·belowMode)` and not the
   * mode. Unclamped, the hull was the mode itself — so the true endpoint, where the integrand
   * kinks, never entered `cdfBreakpoints` and GL-10 straddled it.
   *
   * The reference is the renderer's own two-branch formula (`RandomNumberProvider:335-353`)
   * evaluated at the extreme `u`, not a textbook triangular's support: a textbook triangular
   * has no answer here, which is the whole reason §5.9 rewrote the CDF.
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
    // The two the report measured against the sampler, to the digit.
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
    // The overstated hull put GL-10 across the kink and cost 1.07e-2 relative on this one.
    expect(w1AgainstDelta(0, 1, 1000)).toBeCloseTo(21.081851067789195, 9);
    expect(w1AgainstDelta(-30, 30, 99)).toBeCloseTo(30.977094589809564, 9);
  });

  it('collapses a clip that is vacuous in TRUTH, which the overstated hull kept', () => {
    // T(0, 1, 1000) really reaches 31.62, so a clip at ±40 swallows nothing and the law is its
    // own base — the AD-40.2 principle. With the hull claiming 1000 the wrapper survived and
    // `lawsEqual(base, clipped)` was false for two laws that are equal.
    const base = triangularLaw(0, 1, 1000) as never;
    expect(clippedLaw(base, -40, 40)).toBe(base);
    // A clip that really does bite is still a clip.
    expect(clippedLaw(base, -40, 10).kind).toBe('clipped');
  });
});

describe('the Gaussian is the AD-14iv mixture, not a truncated normal', () => {
  it('limit.lower === limit.upper gives weight 1 — the untruncated law', () => {
    expect(gaussianEscapeWeight(gaussianLaw(10, 0, 0) as never)).toBe(1);
    expect(gaussianEscapeWeight(gaussianLaw(10, 5, 5) as never)).toBe(1);
    // Revision 1's defect: full Gaussian noise against none, reported as distance 0.
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
    // Measured against the renderer in the probe: with σ = 10 and limits ±0.001 the escape
    // fires on 46.4 % of draws. q = 1 − (Φ(h/σ) − Φ(−h/σ)).
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
  it('is exactly 0 on identical laws (P-C1 needs exact, not small)', () => {
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
    // uniform against a narrow triangular sharing a mean. Without the quadratic vertex the
    // lobes cancel and the cell integrates low.
    const a = uniformLaw(-30, 30);
    const b = triangularLaw(-30, 30, 0) as ImprecisionLaw;
    const measured = wasserstein1(a, b);
    const reference = referenceW1(a, b, -35, 35);
    expect(measured).toBeGreaterThan(0);
    expect(Math.abs(measured - reference) / reference).toBeLessThan(1e-6);
  });

  it('is symmetric to the last bit (P-C2)', () => {
    const pairs: readonly [ImprecisionLaw, ImprecisionLaw][] = [
      [uniformLaw(-30, 30), triangularLaw(-20, 40, 35) as ImprecisionLaw],
      [gaussianLaw(8, -10, 10), listLaw([-3, 0, 14]) as ImprecisionLaw],
      [clippedLaw(triangularLaw(-30, 30, 0) as never, -8, 8), DELTA_ZERO],
    ];
    for (const [a, b] of pairs) expect(wasserstein1(a, b)).toBe(wasserstein1(b, a));
  });

  it('satisfies the triangle inequality (P-C3) across the family', () => {
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
    for (let i = 0; i < laws.length; ++i)
      for (let j = i + 1; j < laws.length; ++j)
        expect(wasserstein1(laws[i], laws[j])).toBeGreaterThan(1e-6);
  });
});

describe('W₂ and §1.2’s decomposition', () => {
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

  it('ρ(uniform, symmetric triangular) = 7√2/10 — §5.9’s constant, re-derived', () => {
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

  it('ρ(uniform, Gaussian) = √(3/π) — §5.9’s other constant, re-derived', () => {
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

  it('a spreadless law is recognized structurally, never by float equality (AD-32)', () => {
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
