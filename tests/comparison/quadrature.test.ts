/**
 * The numerical core, tested against closed forms and against the two measured failures
 * DESIGN.md §5.0 exists to prevent.
 *
 * The hard-coded Gauss–Legendre table is re-derived here from scratch — Newton's method on
 * the Legendre polynomial `P₁₀`, using nothing from the module under test — because a table
 * that derived itself at run time would be self-consistent with its own typo. This is the
 * auditability test that licenses hard-coding the constants at all.
 */
import { describe, it, expect } from 'vitest';
import {
  CompensatedSum,
  GAUSS_LEGENDRE_10_NODES,
  GAUSS_LEGENDRE_10_WEIGHTS,
  bisectSignChange,
  gaussLegendre10,
  gradedPanelCount,
  integrateAbsolute,
  integrateGradedPower,
  integrateSubstitutedPower,
  neumaierSum,
  powerCriticalPoint,
} from '../../src/comparison/quadrature.js';

// ---------------------------------------------------------------------------
// Independent re-derivation of the rule (the auditability test)
// ---------------------------------------------------------------------------

/** `P_n(x)` and `P'_n(x)` by the standard three-term recurrence. */
function legendre(n: number, x: number): { value: number; derivative: number } {
  let previous = 1; // P₀
  let current = x; // P₁
  for (let k = 2; k <= n; ++k) {
    const next = ((2 * k - 1) * x * current - (k - 1) * previous) / k;
    previous = current;
    current = next;
  }
  return { value: current, derivative: (n * (x * current - previous)) / (x * x - 1) };
}

/** The `n`-point Gauss–Legendre rule, derived by Newton from the Chebyshev initial guess. */
function deriveGaussLegendre(n: number): { nodes: number[]; weights: number[] } {
  const nodes: number[] = [];
  const weights: number[] = [];
  for (let i = 1; i <= n; ++i) {
    let x = Math.cos((Math.PI * (i - 0.25)) / (n + 0.5));
    for (let iteration = 0; iteration < 100; ++iteration) {
      const { value, derivative } = legendre(n, x);
      const step = value / derivative;
      x -= step;
      if (Math.abs(step) < 1e-16) break;
    }
    const { derivative } = legendre(n, x);
    nodes.push(x);
    weights.push(2 / ((1 - x * x) * derivative * derivative));
  }
  // Newton walks the roots from +1 downwards; the module stores them ascending.
  return { nodes: nodes.reverse(), weights: weights.reverse() };
}

describe('Gauss-Legendre order 10: the hard-coded table', () => {
  const derived = deriveGaussLegendre(10);

  it('matches an independent Newton re-derivation to 1e-15', () => {
    expect(GAUSS_LEGENDRE_10_NODES).toHaveLength(10);
    for (let i = 0; i < 10; ++i)
      expect(GAUSS_LEGENDRE_10_NODES[i]).toBeCloseTo(derived.nodes[i], 15);
  });

  it('matches the re-derived weights to 1e-15', () => {
    for (let i = 0; i < 10; ++i)
      expect(GAUSS_LEGENDRE_10_WEIGHTS[i]).toBeCloseTo(derived.weights[i], 15);
  });

  it('has weights summing to the interval width', () => {
    expect(neumaierSum(GAUSS_LEGENDRE_10_WEIGHTS)).toBeCloseTo(2, 15);
  });

  it('is symmetric about the origin', () => {
    for (let i = 0; i < 10; ++i) {
      expect(GAUSS_LEGENDRE_10_NODES[i]).toBeCloseTo(-GAUSS_LEGENDRE_10_NODES[9 - i], 15);
      expect(GAUSS_LEGENDRE_10_WEIGHTS[i]).toBeCloseTo(GAUSS_LEGENDRE_10_WEIGHTS[9 - i], 15);
    }
  });

  it('places no node on an endpoint, which is what makes an endpoint singularity safe', () => {
    for (const node of GAUSS_LEGENDRE_10_NODES) expect(Math.abs(node)).toBeLessThan(1);
  });
});

describe('gaussLegendre10', () => {
  it('is exact on polynomials up to degree 19', () => {
    // Degree 2n-1 = 19 is the rule's exactness guarantee; ∫₀¹ x^k = 1/(k+1).
    for (let degree = 0; degree <= 19; ++degree) {
      const exact = 1 / (degree + 1);
      expect(gaussLegendre10((x) => Math.pow(x, degree), 0, 1)).toBeCloseTo(exact, 12);
    }
  });

  it('integrates a transcendental smoothly', () => {
    // ∫₀^π sin = 2
    expect(gaussLegendre10(Math.sin, 0, Math.PI)).toBeCloseTo(2, 12);
    // ∫₁^e ln x dx = 1
    expect(gaussLegendre10(Math.log, 1, Math.E)).toBeCloseTo(1, 10);
  });

  it('returns 0 for a degenerate or inverted interval rather than a signed area', () => {
    expect(gaussLegendre10((x) => x, 5, 5)).toBe(0);
    expect(gaussLegendre10((x) => x, 5, 1)).toBe(0);
  });

  it('gives bit-identical results for repeated calls (R2)', () => {
    const f = (x: number) => Math.log(60 + 60 * x * x);
    expect(gaussLegendre10(f, 0, 1)).toBe(gaussLegendre10(f, 0, 1));
  });
});

describe('the tempo substitution (rule 1, M6)', () => {
  /**
   * `∫₀¹ ln(b + d·u^e) du` has no elementary closed form, so the reference is a very fine
   * composite Simpson — 200 001 points, which is far past what GL-10 is being asked for.
   */
  const reference = (b: number, d: number, e: number): number => {
    const n = 200000;
    const h = 1 / n;
    let sum = Math.log(b) + Math.log(b + d);
    for (let i = 1; i < n; ++i) sum += (i % 2 === 0 ? 2 : 4) * Math.log(b + d * Math.pow(i * h, e));
    return (h / 3) * sum;
  };

  const substituted = (b: number, d: number, e: number) =>
    integrateSubstitutedPower((z) => Math.log(b + d * z), e);

  const naiveIntegral = (b: number, d: number, e: number) =>
    gaussLegendre10((u) => Math.log(b + d * Math.pow(u, e)), 0, 1);

  const relativeError = (value: number, exact: number) => Math.abs(value - exact) / exact;

  it('is exact at e = 1, where the Jacobian is identically 1', () => {
    expect(substituted(60, 60, 1)).toBeCloseTo(reference(60, 60, 1), 10);
  });

  it('beats the naive rule for e < 1, which is what rule 1 was written for (M6)', () => {
    // e = 0.5 → Jacobian exponent 1/e−1 = 1, i.e. a smooth linear weight.
    // The threshold is set by the REFERENCE, not by the substitution: composite Simpson at
    // 2·10⁵ points is itself only good to ~2·10⁻¹⁰ relative here, while a 2·10⁶-point run
    // measures the substitution at 6.3·10⁻¹². Three orders between the two rules is the
    // claim, and it survives any reference this test can afford.
    const exact = reference(60, 60, 0.5);
    expect(relativeError(substituted(60, 60, 0.5), exact)).toBeLessThan(1e-8);
    expect(relativeError(naiveIntegral(60, 60, 0.5), exact)).toBeGreaterThan(1e-6);
  });

  /**
   * MEASURED DEFECT in §5.0 rule 1, pinned so it cannot be forgotten while the conductor
   * rules on the scheme. The substitution is claimed to work "for every e"; for e > 1 the
   * Jacobian exponent goes negative, the weight becomes singular at z = 0, and GL-10 loses
   * most of the mass. These assertions record the failure, not an endorsement of it.
   */
  it('IS BROKEN for e > 1 — the substitution creates the singularity it claims to kill', () => {
    const e = Math.log(0.5) / Math.log(0.9); // ≈ 6.58, an ordinary ritardando
    const exact = reference(60, 60, e);
    expect(relativeError(substituted(60, 60, e), exact)).toBeGreaterThan(0.3);
    // and the naive rule it was supposed to replace is near-exact in exactly this regime
    expect(relativeError(naiveIntegral(60, 60, e), exact)).toBeLessThan(1e-9);
  });

  it('loses almost all the mass at a large exponent', () => {
    const exact = reference(60, 60, 150);
    // The true value is bounded by ln(60) and ln(120); the substituted result is far below.
    expect(exact).toBeGreaterThan(Math.log(60));
    expect(substituted(60, 60, 150)).toBeLessThan(Math.log(60) / 2);
  });

  it('is only near-exact where the Jacobian exponent is a non-negative integer', () => {
    // 1/e − 1 ∈ {0, 1} at e ∈ {1, 1/2}; fractional in between, and accuracy drops.
    const e = 0.7565; // 1/e − 1 ≈ 0.32
    expect(relativeError(substituted(60, 60, e), reference(60, 60, e))).toBeGreaterThan(1e-6);
  });

  describe('the graded mesh (AD-28.1, the ruled scheme)', () => {
    const graded = (b: number, d: number, e: number) =>
      integrateGradedPower((u) => Math.log(b + d * Math.pow(u, e)), e);

    const exponentOf = (meanTempoAt: number) => Math.log(0.5) / Math.log(meanTempoAt);

    it('uses at least two panels, including where the formula goes non-positive', () => {
      // ceil(log2 0.23) + 2 = 0 and ceil(log2 0.06) + 2 = -2 without the floor.
      expect(gradedPanelCount(0.23)).toBe(2);
      expect(gradedPanelCount(0.06)).toBe(2);
      expect(gradedPanelCount(1)).toBe(2);
      expect(gradedPanelCount(6.579)).toBe(5);
      expect(gradedPanelCount(692.8)).toBe(12);
    });

    it('holds its accuracy across the whole legal meanTempoAt range, one scheme', () => {
      for (const meanTempoAt of [0.02, 0.05, 0.1, 0.25, 0.4, 0.5, 0.6, 0.8, 0.9, 0.95, 0.99]) {
        const e = exponentOf(meanTempoAt);
        expect(relativeError(graded(60, 60, e), reference(60, 60, e))).toBeLessThan(3.4e-6);
      }
    });

    it('is never worse than the naive rule it replaces', () => {
      for (const meanTempoAt of [0.05, 0.25, 0.6, 0.9, 0.99]) {
        const e = exponentOf(meanTempoAt);
        const exact = reference(60, 60, e);
        expect(relativeError(graded(60, 60, e), exact)).toBeLessThanOrEqual(
          relativeError(naiveIntegral(60, 60, e), exact),
        );
      }
    });

    it('rescues exactly the regime the substitution destroys', () => {
      const e = exponentOf(0.9);
      const exact = reference(60, 60, e);
      expect(relativeError(substituted(60, 60, e), exact)).toBeGreaterThan(0.3);
      expect(relativeError(graded(60, 60, e), exact)).toBeLessThan(1e-9);
    });

    it('meets the JND-scale requirement AD-28.2 makes the real target', () => {
      // Tempo JND is ln(1.025) per AD-27.6 — HALF the value DESIGN rev 2 carried, so every
      // JND-unit figure is twice what the original stop-and-report quoted. The conclusion is
      // unchanged; the arithmetic is corrected here rather than left to be rediscovered.
      const tempoJnd = Math.log(1.025);
      for (const meanTempoAt of [0.05, 0.5, 0.9, 0.99]) {
        const e = exponentOf(meanTempoAt);
        const error = Math.abs(graded(60, 60, e) - reference(60, 60, e));
        expect(error / tempoJnd).toBeLessThan(1e-3);
      }
    });

    it('refuses an exponent the tempo reader never produces', () => {
      expect(() => integrateGradedPower((u) => u, 0)).toThrow(RangeError);
      expect(() => integrateGradedPower((u) => u, NaN)).toThrow(RangeError);
    });

    it('is bit-stable across repeated calls (R2)', () => {
      const f = (u: number) => Math.log(60 + 60 * Math.pow(u, 3));
      expect(integrateGradedPower(f, 3)).toBe(integrateGradedPower(f, 3));
    });
  });

  it('refuses an exponent the tempo reader never produces', () => {
    expect(() => integrateSubstitutedPower((z) => z, 0)).toThrow(RangeError);
    expect(() => integrateSubstitutedPower((z) => z, -1)).toThrow(RangeError);
    expect(() => integrateSubstitutedPower((z) => z, NaN)).toThrow(RangeError);
  });
});

describe('powerCriticalPoint (rule 2, M7)', () => {
  it('splits the measured double-crossing case between its two roots', () => {
    // §5.0's own counterexample: 72.6→132.6 at e=2 versus 60→120 at e=1 cross at u=0.3
    // and u=0.7 with EQUAL endpoint signs, so an endpoint test finds no bracket.
    expect(powerCriticalPoint(60, 2, 60, 1)).toBeCloseTo(0.5, 12);
  });

  it('returns null when the exponents agree, where the family is monotone', () => {
    expect(powerCriticalPoint(60, 2, 30, 2)).toBeNull();
  });

  it('returns null when the split would land outside the open cell', () => {
    // (q·Δb)/(p·Δa) = 1e9/2 > 1 with p−q = 1, so u* > 1: no interior split.
    expect(powerCriticalPoint(1, 2, 1e9, 1)).toBeNull();
  });

  it('still splits when the ratio is tiny but strictly interior', () => {
    // The mirror of the case above lands at 5e-10, which IS inside (0,1) and is a legal
    // split — the guard is a domain test, not a magnitude test.
    expect(powerCriticalPoint(1e9, 2, 1, 1)).toBeCloseTo(5e-10, 20);
  });

  it('returns null rather than NaN on a degenerate ratio', () => {
    expect(powerCriticalPoint(0, 2, 60, 1)).toBeNull();
    expect(powerCriticalPoint(60, 2, 0, 1)).toBeNull();
  });
});

describe('bisectSignChange', () => {
  it('finds an interior root', () => {
    const root = bisectSignChange((x) => x * x - 2, 0, 2);
    expect(root).not.toBeNull();
    expect(root!).toBeCloseTo(Math.SQRT2, 12);
  });

  it('returns null when the endpoints do not bracket', () => {
    expect(bisectSignChange((x) => x * x + 1, 0, 2)).toBeNull();
    // The double-crossing case, on the whole cell: equal endpoint signs, no bracket.
    const f = (u: number) => Math.log(72.6 + 60 * u * u) - Math.log(60 + 60 * u);
    expect(bisectSignChange(f, 0, 1)).toBeNull();
  });

  it('finds both roots once the critical point splits the cell (rule 2 end to end)', () => {
    const f = (u: number) => Math.log(72.6 + 60 * u * u) - Math.log(60 + 60 * u);
    const split = powerCriticalPoint(60, 2, 60, 1)!;
    expect(bisectSignChange(f, 0, split)).toBeCloseTo(0.3, 9);
    expect(bisectSignChange(f, split, 1)).toBeCloseTo(0.7, 9);
  });

  it('reports an endpoint that is itself a root', () => {
    expect(bisectSignChange((x) => x, 0, 1)).toBe(0);
  });

  it('is mirror-symmetric: negating f gives the same root bit for bit (M16)', () => {
    const f = (x: number) => Math.log(72.6 + 60 * x * x) - Math.log(60 + 60 * x);
    const negated = (x: number) => -f(x);
    const split = powerCriticalPoint(60, 2, 60, 1)!;
    expect(bisectSignChange(f, 0, split)).toBe(bisectSignChange(negated, 0, split));
    expect(bisectSignChange(f, split, 1)).toBe(bisectSignChange(negated, split, 1));
  });
});

describe('integrateAbsolute', () => {
  it('handles a single sign change exactly where |f| has its corner', () => {
    // ∫₀² |x − 1| dx = 1
    expect(integrateAbsolute((x) => x - 1, 0, 2)).toBeCloseTo(1, 12);
  });

  it('gets the double-crossing cell right, where integrating |f| whole does not (M7)', () => {
    const f = (u: number) => Math.log(72.6 + 60 * u * u) - Math.log(60 + 60 * u);
    const split = powerCriticalPoint(60, 2, 60, 1)!;

    // Reference: fine composite Simpson on |f|, which converges despite the corners
    // because it is not trying to be exact on a polynomial.
    const n = 200000;
    const h = 1 / n;
    let simpson = Math.abs(f(0)) + Math.abs(f(1));
    for (let i = 1; i < n; ++i) simpson += (i % 2 === 0 ? 2 : 4) * Math.abs(f(i * h));
    const exact = (h / 3) * simpson;

    const ours = integrateAbsolute(f, 0, 1, [split]);
    expect(ours).toBeCloseTo(exact, 8);

    // and the naive whole-cell rule really is off by the advertised order
    const naive = Math.abs(gaussLegendre10(f, 0, 1));
    expect(Math.abs(naive - exact) / exact).toBeGreaterThan(1e-3);
    expect(Math.abs(ours - exact) / exact).toBeLessThan(1e-9);
  });

  it('is non-negative and symmetric in its argument order', () => {
    const f = (x: number) => Math.sin(4 * x);
    const g = (x: number) => -Math.sin(4 * x);
    expect(integrateAbsolute(f, 0, 2, [Math.PI / 4, Math.PI / 2])).toBe(
      integrateAbsolute(g, 0, 2, [Math.PI / 4, Math.PI / 2]),
    );
    expect(integrateAbsolute(f, 0, 2, [])).toBeGreaterThanOrEqual(0);
  });

  it('ignores split points outside the interval and duplicates', () => {
    const f = (x: number) => x - 1;
    expect(integrateAbsolute(f, 0, 2, [-5, 0, 1, 1, 2, 9])).toBeCloseTo(1, 12);
  });

  it('returns 0 on a degenerate interval', () => {
    expect(integrateAbsolute((x) => x, 3, 3)).toBe(0);
  });
});

describe('compensated summation', () => {
  it('recovers a total plain addition loses', () => {
    const values = [1e16, 1, -1e16];
    expect(values.reduce((a, b) => a + b, 0)).toBe(0);
    expect(neumaierSum(values)).toBe(1);
  });

  it('handles the case plain Kahan drops — a huge addend after a small total', () => {
    // This is the ⊥-span shape: one cell priced at delta dwarfs the rest.
    expect(neumaierSum([1, 1e100, 1, -1e100])).toBe(2);
  });

  it('agrees between the streaming and array forms', () => {
    const values = [0.1, 0.2, 0.3, 1e17, -1e17, 0.4];
    const streaming = new CompensatedSum();
    for (const value of values) streaming.add(value);
    expect(streaming.total).toBe(neumaierSum(values));
  });

  it('starts at zero', () => {
    expect(new CompensatedSum().total).toBe(0);
    expect(neumaierSum([])).toBe(0);
  });
});
