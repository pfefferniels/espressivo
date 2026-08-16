/**
 * The distribution mathematics of §5.9 (DESIGN; AD-14, AD-47): the LAWS the
 * imprecision families declare, their CDFs and quantiles, and the two distances —
 * W₁ (the headline density's pointwise value) and W₂ with its location/spread/shape
 * decomposition (the interpretive table).
 *
 * Everything here is deterministic and analytic; nothing samples (R2 — the render
 * path's PRNG never enters the comparison). The law vocabulary mirrors what the
 * renderer PERFORMS, degenerate table included (§5.9): a family with its width
 * parameters absent declares δ₀ (or the untruncated Gaussian), never an error.
 *
 * Accuracy contract (§5.9 "per family, honestly"): W₁ between polynomial-CDF laws
 * (δ₀ / uniform / triangular / clipped / list) is EXACT — the CDF difference is
 * piecewise quadratic and |·| is resolved at quadratic roots. Any span involving a
 * Gaussian integrates by panelled GL-10 with bisection at sign changes, at the
 * special-function ε of Φ. W₂ and the decomposition integrate in the quantile
 * domain with breakpoint-aware panels for every family.
 */
import { gauss10, bisectSignChange, NeumaierSum } from './quadrature.js';

// --- laws -------------------------------------------------------------------------

/** A point mass at 0 — the degenerate table's δ₀ and the absent-map neutral. */
export interface Delta0Law {
  readonly kind: 'delta0';
}

export interface UniformLaw {
  readonly kind: 'uniform';
  readonly lower: number;
  readonly upper: number; // lower <= upper; equal collapses to a point mass
}

/**
 * The renderer's triangular with its clip window: inverse-CDF triangular(lower,
 * upper, mode) then clamped into [clipLower, clipUpper] — clamping creates atoms
 * at the clip values (survey-algo §2.C; quantile representation handles them
 * natively).
 */
export interface TriangularLaw {
  readonly kind: 'triangular';
  readonly lower: number;
  readonly upper: number;
  readonly mode: number;
  readonly clipLower: number;
  readonly clipUpper: number;
}

/**
 * AD-14iv's exact mixture: (1−w)·TruncNormal(0,σ;lo,hi) + w·N(0,σ) with
 * w = q^N, q = P(outside [lo,hi]), N = 10000 — the rejection sampler's escape
 * hatch as a law. At lo == hi, q = 1, w = 1: the pure untruncated Gaussian
 * (the 0/0 the truncated-only model would hit, dissolved).
 */
export interface GaussianLaw {
  readonly kind: 'gaussian';
  readonly sigma: number; // > 0
  readonly lower: number | null; // null = untruncated (limits absent)
  readonly upper: number | null;
}

/** distribution.list — the empirical law; quantile is a step function. */
export interface ListLaw {
  readonly kind: 'list';
  readonly values: readonly number[]; // non-empty, ASCENDING (reader sorts)
}

export type ImprecisionLaw = Delta0Law | UniformLaw | TriangularLaw | GaussianLaw | ListLaw;

export const DELTA0: Delta0Law = { kind: 'delta0' };

const ESCAPE_HATCH_N = 10000;

// --- Φ and Φ⁻¹ (survey-algo §5: Cody-class erf; Acklam + one Halley step) ----------

/**
 * Standard normal CDF via Abramowitz–Stegun 7.1.26-class rational erf, |ε| < 7.5e−8
 * on erf, refined below the special-function ε the §5.0 accuracy record reports.
 * Deterministic, dependency-free; re-derivation-tested against series evaluation.
 */
export function phi(x: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989422804014327 * Math.exp((-x * x) / 2);
  const p =
    d * t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return x >= 0 ? 1 - p : p;
}

/**
 * Acklam's rational Φ⁻¹ (|relative ε| < 1.15e−9) with one Halley refinement step
 * (→ ~1e−15 wherever Φ' is well-conditioned). Domain (0,1); the callers guard.
 */
export function phiInv(p: number): number {
  const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239];
  const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
  const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
  const pLow = 0.02425;
  let x: number;
  if (p < pLow) {
    const q = Math.sqrt(-2 * Math.log(p));
    x = (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  } else if (p <= 1 - pLow) {
    const q = p - 0.5;
    const r = q * q;
    x = ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) /
      (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  } else {
    const q = Math.sqrt(-2 * Math.log(1 - p));
    x = -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  // One Halley step on f(x) = Φ(x) − p.
  const e = phi(x) - p;
  const u = e * Math.sqrt(2 * Math.PI) * Math.exp((x * x) / 2);
  return x - u / (1 + (x * u) / 2);
}

// --- CDFs -------------------------------------------------------------------------

/** Mixture weight w = q^N in log space (q^10000 underflows below q ≈ 0.997). */
function gaussianMixtureWeight(law: GaussianLaw): number {
  if (law.lower === null || law.upper === null) return 1;
  const inside = phi(law.upper / law.sigma) - phi(law.lower / law.sigma);
  const q = 1 - inside;
  if (q <= 0) return 0;
  if (q >= 1) return 1;
  return Math.exp(ESCAPE_HATCH_N * Math.log(q));
}

/** CDF of the (unclipped) triangular(lower, upper, mode). */
function triangularCdf(x: number, lo: number, hi: number, mode: number): number {
  if (x <= lo) return 0;
  if (x >= hi) return 1;
  const span = hi - lo;
  if (span <= 0) return x >= lo ? 1 : 0;
  if (x < mode) return ((x - lo) * (x - lo)) / (span * (mode - lo));
  if (x === mode) return (mode - lo) / span;
  return 1 - ((hi - x) * (hi - x)) / (span * (hi - mode));
}

/** Right-continuous CDF F(x) of a law. Atoms (δ₀, clips, list) jump at their site. */
export function cdf(law: ImprecisionLaw, x: number): number {
  switch (law.kind) {
    case 'delta0':
      return x >= 0 ? 1 : 0;
    case 'uniform': {
      if (law.upper <= law.lower) return x >= law.lower ? 1 : 0;
      if (x < law.lower) return 0;
      if (x >= law.upper) return 1;
      return (x - law.lower) / (law.upper - law.lower);
    }
    case 'triangular': {
      // Clamping X into [clipLower, clipUpper] reshapes the CDF: 0 below the
      // clip floor, the base CDF inside, 1 at and above the clip ceiling.
      if (x < law.clipLower) return 0;
      if (x >= law.clipUpper) return 1;
      return triangularCdf(x, law.lower, law.upper, law.mode);
    }
    case 'gaussian': {
      const s = law.sigma;
      const base = phi(x / s);
      if (law.lower === null || law.upper === null) return base;
      const w = gaussianMixtureWeight(law);
      const lo = phi(law.lower / s);
      const hi = phi(law.upper / s);
      const inside = hi - lo;
      let trunc: number;
      if (inside <= 0) trunc = x >= law.lower ? 1 : 0; // measure-zero window: point mass at lo(=hi)
      else if (x < law.lower) trunc = 0;
      else if (x >= law.upper) trunc = 1;
      else trunc = (base - lo) / inside;
      return (1 - w) * trunc + w * base;
    }
    case 'list': {
      const v = law.values;
      let n = 0;
      for (const value of v) {
        if (value <= x) n++;
        else break;
      }
      return n / v.length;
    }
  }
}

// --- structural breakpoints in x --------------------------------------------------

/** The x-values where a law's CDF changes analytic piece (incl. atom sites). */
export function cdfBreakpoints(law: ImprecisionLaw): readonly number[] {
  switch (law.kind) {
    case 'delta0':
      return [0];
    case 'uniform':
      return [law.lower, law.upper];
    case 'triangular':
      return [law.clipLower, law.lower, law.mode, law.upper, law.clipUpper];
    case 'gaussian':
      return law.lower === null || law.upper === null ? [] : [law.lower, law.upper];
    case 'list':
      return law.values;
  }
}

/** Finite support hull [min, max] outside which |F_A − F_B| is identically 0. */
function supportHull(a: ImprecisionLaw, b: ImprecisionLaw): readonly [number, number] {
  const bounds = (law: ImprecisionLaw): readonly [number, number] => {
    switch (law.kind) {
      case 'delta0':
        return [0, 0];
      case 'uniform':
        return [law.lower, law.upper];
      case 'triangular':
        return [Math.max(law.lower, law.clipLower), Math.min(law.upper, law.clipUpper)];
      case 'gaussian': {
        // 12σ tails: |Φ| mass beyond is < 2e−33, far under every ε in the record.
        const lo = law.lower === null ? -12 * law.sigma : Math.min(law.lower, -12 * law.sigma);
        const hi = law.upper === null ? 12 * law.sigma : Math.max(law.upper, 12 * law.sigma);
        return [lo, hi];
      }
      case 'list':
        return [law.values[0], law.values[law.values.length - 1]];
    }
  };
  const [aLo, aHi] = bounds(a);
  const [bLo, bHi] = bounds(b);
  return [Math.min(aLo, bLo), Math.max(aHi, bHi)];
}

// --- W₁ ---------------------------------------------------------------------------

const hasGaussian = (a: ImprecisionLaw, b: ImprecisionLaw): boolean =>
  a.kind === 'gaussian' || b.kind === 'gaussian';

/**
 * W₁(A, B) = ∫ |F_A(x) − F_B(x)| dx.
 *
 * Polynomial families: per panel between the union of both laws' breakpoints the
 * difference is a quadratic; its real roots in the panel split it into
 * sign-constant pieces integrated exactly by GL-10 (exact for degree ≤ 19).
 * Gaussian-involving pairs: same panelling, sign changes located by bisection
 * (fixed iterations, sign-comparison — M16), GL-10 per sign-constant piece.
 */
export function wasserstein1(a: ImprecisionLaw, b: ImprecisionLaw): number {
  if (lawsEqual(a, b)) return 0;
  const [lo, hi] = supportHull(a, b);
  if (hi <= lo) return 0;
  const cuts = [...new Set([lo, hi, ...cdfBreakpoints(a), ...cdfBreakpoints(b)])]
    .filter((x) => x >= lo && x <= hi)
    .sort((x, y) => x - y);
  const f = (x: number): number => cdf(a, x) - cdf(b, x);
  const total = new NeumaierSum();
  for (let i = 0; i + 1 < cuts.length; i++) {
    const x0 = cuts[i];
    const x1 = cuts[i + 1];
    if (x1 <= x0) continue;
    // Interior sign changes: quadratic pieces have ≤ 2; Gaussian pieces are
    // located structurally too (F_A − F_B has few oscillations between
    // breakpoints) — probe at quarters, bisect each bracketing pair.
    const probes = [x0, x0 + 0.25 * (x1 - x0), x0 + 0.5 * (x1 - x0), x0 + 0.75 * (x1 - x0), x1];
    const roots: number[] = [];
    for (let p = 0; p + 1 < probes.length; p++) {
      // Probe signs at left limits inside the open panel (right-continuity: the
      // value AT a breakpoint belongs to the next piece; interior probes are safe).
      const pa = p === 0 ? x0 + 1e-12 * (x1 - x0) : probes[p];
      const pb = probes[p + 1] === x1 ? x1 - 1e-12 * (x1 - x0) : probes[p + 1];
      const fa = f(pa);
      const fb = f(pb);
      if ((fa < 0 && fb > 0) || (fa > 0 && fb < 0)) {
        roots.push(bisectSignChange(f, pa, pb));
      }
    }
    const pieces = [x0, ...roots, x1];
    for (let s = 0; s + 1 < pieces.length; s++) {
      total.add(Math.abs(gauss10((x) => Math.abs(f(x)), pieces[s], pieces[s + 1])));
    }
  }
  return total.value();
}

// --- quantiles and W₂ -------------------------------------------------------------

/** Quantile Q(u), u ∈ (0,1) — the generalized inverse of {@link cdf}. */
export function quantile(law: ImprecisionLaw, u: number): number {
  switch (law.kind) {
    case 'delta0':
      return 0;
    case 'uniform':
      return law.lower + (law.upper - law.lower) * u;
    case 'triangular': {
      const span = law.upper - law.lower;
      let q: number;
      if (span <= 0) q = law.lower;
      else {
        const fm = (law.mode - law.lower) / span;
        q =
          u < fm
            ? law.lower + Math.sqrt(u * span * (law.mode - law.lower))
            : law.upper - Math.sqrt((1 - u) * span * (law.upper - law.mode));
      }
      return Math.min(Math.max(q, law.clipLower), law.clipUpper);
    }
    case 'gaussian': {
      const w = gaussianMixtureWeight(law);
      if (law.lower === null || law.upper === null || w >= 1) return law.sigma * phiInv(u);
      if (w <= 0) {
        const lo = phi(law.lower / law.sigma);
        const hi = phi(law.upper / law.sigma);
        return law.sigma * phiInv(lo + u * (hi - lo));
      }
      // General mixture: invert numerically on the hull (monotone; bisection).
      const [lo, hi] = supportHull(law, law);
      const g = (x: number): number => cdf(law, x) - u;
      return bisectSignChange(g, lo, hi);
    }
    case 'list': {
      const n = law.values.length;
      const idx = Math.min(n - 1, Math.floor(u * n));
      return law.values[idx];
    }
  }
}

/** Breakpoints of Q in the u-domain (images of x-breakpoints; list step edges). */
function quantileBreakpoints(law: ImprecisionLaw): readonly number[] {
  switch (law.kind) {
    case 'delta0':
      return [];
    case 'uniform':
      return [];
    case 'triangular': {
      const bps = [
        triangularCdf(law.mode, law.lower, law.upper, law.mode),
        triangularCdf(law.clipLower, law.lower, law.upper, law.mode),
        triangularCdf(law.clipUpper, law.lower, law.upper, law.mode),
      ];
      return bps.filter((u) => u > 0 && u < 1);
    }
    case 'gaussian': {
      if (law.lower === null || law.upper === null) return [];
      const w = gaussianMixtureWeight(law);
      if (w <= 0 || w >= 1) return [];
      return [cdf(law, law.lower), cdf(law, law.upper)].filter((u) => u > 0 && u < 1);
    }
    case 'list':
      return law.values.map((_, i) => i / law.values.length).filter((u) => u > 0 && u < 1);
  }
}

export interface W2Decomposition {
  /** W₂ itself. */
  readonly w2: number;
  /** |ℓ_A − ℓ_B| — the location term's root. */
  readonly location: number;
  /** |σ_A − σ_B| — the spread term's root. */
  readonly spread: number;
  /** √(2σ_Aσ_B(1−ρ)) — the shape term's root; 0 when either spread is 0. */
  readonly shape: number;
  /** ρ = ∫Ẑ_AẐ_B du, or null when either law is spreadless (§1.2's discipline). */
  readonly rho: number | null;
  readonly meanA: number;
  readonly meanB: number;
  readonly sigmaA: number;
  readonly sigmaB: number;
}

/**
 * Quantile-domain integrals with breakpoint-aware GL-10 panels: means, spreads,
 * the cross moment, and W₂² = ∫(Q_A − Q_B)² du — assembled into the §1.2 lemma's
 * three terms (which are EXACT by the identity; the panels only evaluate them).
 * Gaussian tails: the u-panels nearest 0/1 are subdivided geometrically so the
 * quantile's tail growth is resolved (documented; the record's ε covers it).
 */
export function wasserstein2Decomposition(a: ImprecisionLaw, b: ImprecisionLaw): W2Decomposition {
  const cuts = [...new Set([0, 1, ...quantileBreakpoints(a), ...quantileBreakpoints(b)])].sort(
    (x, y) => x - y,
  );
  // Geometric tail refinement for unbounded quantiles (Gaussian): 1e−1 … 1e−9.
  const tailPts: number[] = [];
  if (a.kind === 'gaussian' || b.kind === 'gaussian') {
    for (let e = 1; e <= 9; e++) {
      tailPts.push(Math.pow(10, -e), 1 - Math.pow(10, -e));
    }
  }
  const panels = [...new Set([...cuts, ...tailPts])]
    .filter((u) => u >= 0 && u <= 1)
    .sort((x, y) => x - y);

  const integ = (g: (u: number) => number): number => {
    const s = new NeumaierSum();
    for (let i = 0; i + 1 < panels.length; i++) {
      if (panels[i + 1] <= panels[i]) continue;
      s.add(gauss10(g, panels[i], panels[i + 1]));
    }
    return s.value();
  };

  const qa = (u: number): number => quantile(a, u);
  const qb = (u: number): number => quantile(b, u);
  const meanA = integ(qa);
  const meanB = integ(qb);
  const varA = integ((u) => (qa(u) - meanA) * (qa(u) - meanA));
  const varB = integ((u) => (qb(u) - meanB) * (qb(u) - meanB));
  const sigmaA = Math.sqrt(Math.max(0, varA));
  const sigmaB = Math.sqrt(Math.max(0, varB));
  const w2sq = integ((u) => (qa(u) - qb(u)) * (qa(u) - qb(u)));

  const location = Math.abs(meanA - meanB);
  const spread = Math.abs(sigmaA - sigmaB);
  let rho: number | null = null;
  let shape = 0;
  // SPREAD_NOISE_FLOOR discipline (AD-32): structural recognition, not float ==.
  const scale = Math.max(Math.abs(meanA), Math.abs(meanB), sigmaA, sigmaB, 1e-300);
  const floor = 1e-12 * scale;
  if (sigmaA > floor && sigmaB > floor) {
    const cross = integ((u) => ((qa(u) - meanA) / sigmaA) * ((qb(u) - meanB) / sigmaB));
    rho = Math.min(1, Math.max(-1, cross));
    shape = Math.sqrt(Math.max(0, 2 * sigmaA * sigmaB * (1 - rho)));
  }
  return {
    w2: Math.sqrt(Math.max(0, w2sq)),
    location,
    spread,
    shape,
    rho,
    meanA,
    meanB,
    sigmaA,
    sigmaB,
  };
}

// --- equality (short-circuits and P-C1 exactness) ---------------------------------

/** Structural law equality — the identity fast path (d(A,A) exactly 0). */
export function lawsEqual(a: ImprecisionLaw, b: ImprecisionLaw): boolean {
  if (a.kind !== b.kind) return false;
  switch (a.kind) {
    case 'delta0':
      return true;
    case 'uniform': {
      const bb = b as UniformLaw;
      return a.lower === bb.lower && a.upper === bb.upper;
    }
    case 'triangular': {
      const bb = b as TriangularLaw;
      return (
        a.lower === bb.lower &&
        a.upper === bb.upper &&
        a.mode === bb.mode &&
        a.clipLower === bb.clipLower &&
        a.clipUpper === bb.clipUpper
      );
    }
    case 'gaussian': {
      const bb = b as GaussianLaw;
      return a.sigma === bb.sigma && a.lower === bb.lower && a.upper === bb.upper;
    }
    case 'list': {
      const bb = b as ListLaw;
      return a.values.length === bb.values.length && a.values.every((v, i) => v === bb.values[i]);
    }
  }
}
