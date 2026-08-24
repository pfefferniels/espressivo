/**
 * The imprecision mathematics: the LAWS an imprecision span declares, their
 * CDFs and quantiles, and the two distances — `W₁` (the headline density's pointwise value) and
 * `W₂` with the location / spread / shape decomposition (the interpretive table).
 *
 * Everything here is deterministic and analytic; nothing samples. The rule is that no PRNG
 * touches any comparison path — the render draws numbers, this module compares the law they are
 * drawn from.
 *
 * ## The vocabulary is the renderer's own construction, not a textbook's
 *
 * Each law below is what `RandomNumberProvider` builds, read off its source rather than matched
 * to a named family. Two consequences shape the vocabulary:
 *
 * - Clipping is its own operation: `nextDouble` composes it
 *   (`this.clip(this.triangularDistribution(…))`), so {@link ClippedLaw} wraps a base law rather
 *   than folding into the triangular's parameters. The same wrapper serves the compensating
 *   triangle and the correlated families' start value.
 * - The triangular is a two-branch inverse-CDF construction, not the textbook triangular.
 *   `triangularDistribution` computes `lo + √(u·s·a)` below the mode fraction and
 *   `hi − √((1−u)·s·b)` above it, with `s = hi − lo`, `a = mode − lo`, `b = hi − mode`. For
 *   `lo ≤ mode ≤ hi` that is the textbook law; for a mode OUTSIDE the limits the branch fraction
 *   `a/s` leaves `[0, 1]`, one branch never runs, and the support reaches past the limit that no
 *   longer bounds it. Measured, `limit.lower="-30" limit.upper="30" mode="99"` draws values up to
 *   30 (clipped from ~58), which a textbook triangular cannot produce.
 *
 * ## Accuracy, per family
 *
 * `W₁ = ∫|F_A − F_B| dx` is EXACT for the polynomial-CDF families (delta / uniform / triangular
 * / clipped / list): between two structural breakpoints the difference of two CDFs is a
 * quadratic, GL-10 is exact to degree 19, and the absolute value is resolved at the crossings
 * rather than integrated through. Completeness of the crossing search is bought the way the
 * rules 2b/2c buy it — by emitting BOTH a structural split (the quadratic's vertex,
 * {@link quadraticVertex}) and a fixed subdivision, since a quadratic can cross
 * twice inside one piece with equal endpoint signs.
 *
 * Any pair involving a Gaussian integrates at the special-function ε instead: `Φ` is not a
 * polynomial. {@link standardNormalCdf} is a convergent all-positive series below `z = 2` and a
 * continued fraction above it — deliberately not the Abramowitz–Stegun 7.1.26 rational, whose
 * `7.5·10⁻⁸` misses the claim for this family by five orders, and not a Chebyshev table,
 * whose correctness would rest on forty transcribed digits rather than on an argument.
 *
 * The measured figures, which are what the `imprecision` family carries (against an
 * independent composite GL-10 quadrature of the density, sharing no coefficient with the
 * implementation):
 *
 * | quantity | worst measured error |
 * |---|---|
 * | `Φ`, absolute over `x ∈ [−37, 8]` | 3·10⁻¹⁶ (against `mpmath` at 60 dps) |
 * | `Φ`, relative in the left tail, `x ≥ −8` | 8.3·10⁻¹⁴ |
 * | `Φ`, relative in the left tail, to −37σ | 2.3·10⁻¹³ |
 * | `Φ⁻¹`, relative, BOTH tails to `1 − 10⁻¹⁵` | 1.2·10⁻¹⁵ |
 * | `W₁` against 14 closed forms, per SUPPORT SCALE | 3.0·10⁻¹⁶ |
 * | `W₂` moments against closed forms | 1.5·10⁻¹⁵ relative |
 * | `ρ` against `7√2/10` / `√(3/π)` | bit-exact / 1.1·10⁻¹⁵ |
 * | the closing identity | 4.1·10⁻¹⁴ relative |
 *
 * Three of those rows replace superseded figures a blind pin had let stand: `Φ`'s left tail was
 * published as 4.9·10⁻¹⁴ (MINOR-2, {@link ERFC_CONTINUED_FRACTION_LIMIT}) and `Φ⁻¹`'s right tail
 * as 1.12·10⁻⁹ (MAJOR-3, {@link standardNormalQuantile}). `W₁`'s 3.6·10⁻¹⁶ was a RELATIVE figure
 * that two near-identical laws falsify by eleven orders; the machine-precise quantity is the
 * error against the laws' support scale, which `compare.ts`'s
 * `EPSILON_FIGURES` carries. The record quotes "Acklam at `|err| < 1.15·10⁻⁹`" here; the
 * numbers above supersede it by six orders.
 *
 * `W₂` and its decomposition integrate in the QUANTILE domain, where the triangular's `√` and
 * the Gaussian's `Φ⁻¹` are not polynomials, so those are quadrature in every case; the panels
 * are breakpoint-aware and the Gaussian's tails are refined geometrically. The two ρ constants
 * the design names — `7√2/10` for uniform-vs-symmetric-triangular and `√(3/π)` for uniform-vs-Gaussian
 * — are re-derived in the tests and pinned as the references this quadrature must reproduce.
 * They are deliberately NOT implemented as fast paths: one code path cannot disagree with itself.
 */
import { head, isNonEmpty, last, pairwise, type NonEmptyArray } from '../prelude/index.js';

import {
  CompensatedSum,
  gaussLegendre10,
  integrateAbsolute,
  bisectSignChange,
} from './quadrature.js';

// --- the law vocabulary -------------------------------------------------------------------

/** A point mass. `δ₀` is this at 0 — the degenerate table's answer for five of its rows. */
export interface DeltaLaw {
  readonly kind: 'delta';
  readonly at: number;
}

/** `lower < upper` strictly; the equal case canonicalizes to {@link DeltaLaw}. */
export interface UniformLaw {
  readonly kind: 'uniform';
  readonly lower: number;
  readonly upper: number;
}

/**
 * The renderer's triangular. `lower < upper` strictly; `mode` is unconstrained — see the
 * module doc on why a mode outside the limits is a different law rather than an error.
 */
export interface TriangularLaw {
  readonly kind: 'triangular';
  readonly lower: number;
  readonly upper: number;
  readonly mode: number;
}

/**
 * the exact mixture, which is what the rejection sampler with an escape hatch draws:
 *
 *     L = (1 − q^N)·TruncNormal(0, σ; lo, hi) + q^N·N(0, σ),  N = 10000, q = P(outside)
 *
 * `nextDouble` redraws until `withinLimits`, breaking after attempt 10001 and accepting that
 * draw unconditionally; the probability of reaching the break is `q^10000`, and the escaped draw
 * is an unconditioned normal. Measured directly rather than inferred from the loop: with
 * `σ = 10` and limits `±0.001` the escape fires on 46.4 % of draws against a predicted
 * `q^10000 = 45.0 %`, and at `±0.005` on 2.05 % against 1.85 %.
 *
 * `lower === upper` is not a corner to guard but the mixture's own answer: `q = 1`, the weight
 * is 1, and the law is the plain `N(0, σ)` the renderer really performs — which is also what
 * ABSENT limits give, since an absent limit reads as 0 (see `imprecisionLaws`).
 */
export interface GaussianLaw {
  readonly kind: 'gaussian';
  /** `> 0`; `σ = 0` canonicalizes to `δ₀`, and the renderer's sign is immaterial. */
  readonly sigma: number;
  readonly lower: number;
  readonly upper: number;
  /**
   * The normal's mean. Always 0 as a document declares it — the renderer multiplies a STANDARD
   * deviate by σ and never adds an offset — and non-zero only after the `'level'` invariance
   * has shifted the law. A field rather than a wrapper so that every law folds under an affine
   * map ({@link affineLaw}). The limits stay ABSOLUTE, so a shifted law's truncation window
   * moves with it.
   */
  readonly center: number;
}

/**
 * `distribution.list` — the empirical law of the `<measurement>` values, as a multiset.
 *
 * The renderer's own use of the list is a deterministic cycle with interpolation (`getValue(i)`
 * is `series[i % n]`, a fractional index interpolating between neighbours), so the values a given
 * render performs are not in general list members. Which index a note lands on is a function of
 * its millisecond date and the timing basis — a render-path artifact this module refuses to
 * model, for the same reason the chord shake is not modelled. The DECLARED law is the empirical one.
 */
export interface ListLaw {
  readonly kind: 'list';
  /** Non-empty (established once, in {@link listLaw}) and ascending; duplicates are meaningful. */
  readonly values: NonEmptyArray<number>;
}

export type BaseLaw = DeltaLaw | UniformLaw | TriangularLaw | GaussianLaw | ListLaw;

/**
 * `clamp(X, lower, upper)` — the renderer's `clip`, as a law.
 *
 * Clamping is not truncation: it moves the out-of-range mass ONTO the bounds instead of
 * conditioning it away, so the result carries an atom at each bound whose weight is the tail it
 * swallowed.
 */
export interface ClippedLaw {
  readonly kind: 'clipped';
  readonly base: BaseLaw;
  readonly lower: number;
  readonly upper: number;
}

export type ImprecisionLaw = BaseLaw | ClippedLaw;

/** `δ₀`: the degenerate table's answer, and the law of an absent imprecision map. */
export const DELTA_ZERO: DeltaLaw = Object.freeze({ kind: 'delta', at: 0 });

/** The mixture's `N` — `RandomNumberProvider.nextDouble`'s `attempts > 10000` escape. */
export const GAUSSIAN_ESCAPE_ATTEMPTS = 10000;

/** Tail cut for a Gaussian's finite support hull: mass beyond 12σ is under 2·10⁻³³. */
const GAUSSIAN_TAIL_SIGMAS = 12;

/** How far the σ-spaced quadrature mesh reaches — see {@link cdfBreakpoints}. */
const GAUSSIAN_MESH_SIGMAS = 6;

// --- constructors, which canonicalize --------------------------------------------------

/** A point mass at `at`. */
export function deltaLaw(at: number): DeltaLaw {
  return at === 0 ? DELTA_ZERO : { kind: 'delta', at };
}

/**
 * `U(lower, upper)`, collapsing to a point mass when the two coincide.
 *
 * Inverted limits are the SAME law, not an error: the renderer computes
 * `r·(upper − lower) + lower`, which for `upper < lower` sweeps the same interval backwards
 * and is uniform on it either way (measured — `limit.lower="30" limit.upper="-30"` draws
 * inside `[-30, 30]`). Sorting here is therefore renderer-faithful rather than a repair.
 */
export function uniformLaw(lower: number, upper: number): DeltaLaw | UniformLaw {
  const lo = Math.min(lower, upper);
  const hi = Math.max(lower, upper);
  return lo === hi ? deltaLaw(lo) : { kind: 'uniform', lower: lo, upper: hi };
}

/**
 * The renderer's triangular, or null where its construction has no CDF at all.
 *
 * Null for `lower > upper`, the pedal precedent rather than a fussy domain check:
 * with the limits inverted the two branches of the inverse-CDF formula run in opposite
 * directions, so `u ↦ x(u)` is not monotone and there is no distribution function to integrate.
 * Measured at `limit.lower="30" limit.upper="-30" mode="0"`: the branches produce `[30, 72)` and
 * `(−60, −30]`, and the "quantile" jumps DOWN by 132 at `u = 0.5`. The caller reads `⊥`.
 *
 * `lower === upper` is the renderer's own short-circuit (`if (upperLimit === lowerLimit) return
 * upperLimit`), i.e. a point mass.
 */
export function triangularLaw(
  lower: number,
  upper: number,
  mode: number,
): DeltaLaw | TriangularLaw | null {
  if (lower > upper) return null;
  if (lower === upper) return deltaLaw(lower);
  return { kind: 'triangular', lower, upper, mode };
}

/**
 * The mixture. `σ = 0` is `δ₀`; the sign of `σ` is immaterial because the normal is
 * symmetric and the renderer multiplies a standard deviate by it (measured: `σ = −10` draws
 * the same law as `σ = 10`).
 */
export function gaussianLaw(
  sigma: number,
  lower: number,
  upper: number,
  center = 0,
): DeltaLaw | GaussianLaw {
  const s = Math.abs(sigma);
  return s === 0 ? deltaLaw(center) : { kind: 'gaussian', sigma: s, lower, upper, center };
}

/** The empirical law of `values`; null for an empty list, which the renderer cannot draw. */
export function listLaw(values: readonly number[]): DeltaLaw | ListLaw | null {
  const sorted = values.toSorted((a, b) => a - b);
  if (!isNonEmpty(sorted)) return null;
  const lo = head(sorted);
  const hi = last(sorted);
  if (lo === hi) return deltaLaw(lo);
  return { kind: 'list', values: Object.freeze(sorted) };
}

/**
 * `clamp(base, lower, upper)`, collapsing where the clip is vacuous or total.
 *
 * A clip that does not reach the base's support is dropped, so two encodings of one
 * performed law compare equal — the principle ("price the resolved performed
 * effect") applied to a distribution.
 */
export function clippedLaw(base: BaseLaw, lower: number, upper: number): ImprecisionLaw {
  const lo = Math.min(lower, upper);
  const hi = Math.max(lower, upper);
  if (lo === hi) return deltaLaw(lo);
  const [supportLo, supportHi] = supportOf(base);
  if (lo <= supportLo && hi >= supportHi) return base;
  if (hi <= supportLo) return deltaLaw(hi);
  if (lo >= supportHi) return deltaLaw(lo);
  return { kind: 'clipped', base, lower: lo, upper: hi };
}

/**
 * `scale·X + shift` as another law of the same vocabulary — the invariance modes, applied
 * to a distribution.
 *
 * Every kind FOLDS; nothing is wrapped — the reason {@link GaussianLaw} carries a `center`. A
 * wrapper would make a transformed law a different SHAPE from the one the reader produced, and
 * every consumer would need a case for it; folding keeps one vocabulary, so `d(A, A) = 0` stays
 * exact after canonicalization, which is what the triangle inequality needs.
 *
 * `scale` must be positive: a negative one reflects the law, which is not what either mode asks
 * for, and `0` collapses it to a point mass the caller means as a degenerate case rather than a
 * canonicalization. the `σ = 0` rule handles that one a level up.
 */
export function affineLaw(law: ImprecisionLaw, scale: number, shift: number): ImprecisionLaw {
  if (!(scale > 0) || !Number.isFinite(scale) || !Number.isFinite(shift))
    throw new RangeError(
      `affineLaw needs a positive finite scale and a finite shift, got ${String(scale)} and ${String(shift)}`,
    );
  if (scale === 1 && shift === 0) return law;
  const map = (x: number): number => scale * x + shift;
  switch (law.kind) {
    case 'delta':
      return deltaLaw(map(law.at));
    case 'uniform':
      return uniformLaw(map(law.lower), map(law.upper));
    case 'triangular': {
      const moved = triangularLaw(map(law.lower), map(law.upper), map(law.mode));
      // `map` is increasing, so an inverted pair cannot appear from a valid one and `null`
      // is unreachable — but returning the law unchanged would be a silent wrong answer.
      if (moved === null) throw new RangeError('affineLaw: increasing map inverted a triangular');
      return moved;
    }
    case 'gaussian':
      return gaussianLaw(scale * law.sigma, map(law.lower), map(law.upper), map(law.center));
    case 'list':
      return listLaw(law.values.map(map)) ?? DELTA_ZERO;
    case 'clipped':
      // Every BASE kind above maps to a base kind, so the recursive call on `law.base` cannot
      // return a `ClippedLaw` — which TypeScript cannot see through the recursion.
      return clippedLaw(
        affineLaw(law.base, scale, shift) as BaseLaw,
        map(law.lower),
        map(law.upper),
      );
  }
}

// --- support ------------------------------------------------------------------------------

/** The interval outside which a law has no mass — `±12σ` standing in for a Gaussian's tails. */
export function supportOf(law: ImprecisionLaw): readonly [number, number] {
  switch (law.kind) {
    case 'delta':
      return [law.at, law.at];
    case 'uniform':
      return [law.lower, law.upper];
    case 'triangular': {
      const [lo, hi] = triangularSupport(law);
      return [lo, hi];
    }
    case 'gaussian': {
      // The truncated component lives inside the limits and the escaped one does not, so the
      // hull is their union — but only where the escape carries weight. A pure truncated normal
      // has support exactly `[lower, upper]`, which keeps the quadrature off twelve sigmas of
      // provably empty axis.
      if (gaussianEscapeWeight(law) <= 0) return [law.lower, law.upper];
      const tail = GAUSSIAN_TAIL_SIGMAS * law.sigma;
      return [Math.min(law.center - tail, law.lower), Math.max(law.center + tail, law.upper)];
    }
    case 'list':
      return [head(law.values), last(law.values)];
    case 'clipped': {
      const [lo, hi] = supportOf(law.base);
      return [Math.max(lo, law.lower), Math.min(hi, law.upper)];
    }
  }
}

/**
 * Where the two branches of the renderer's triangular actually reach.
 *
 * For a mode inside the limits this is `[lower, upper]`. For a mode outside them one branch is
 * unreachable and the other overshoots — `lower + √(s·b)` above, `upper − √(s·a)` below — which
 * is why the support is computed rather than assumed.
 *
 * The branch fraction is CLAMPED into `[0, 1]`. `fraction = (mode − lower)/scale`
 * is the `u` at which the sampler switches branches, so for `mode > upper` it exceeds 1 and the
 * rising branch runs all the way to `u = 1`: the supremum is `lower + √(scale·belowMode)`, not
 * the mode. Unclamped, `T(0, 1, 1000)` claimed a hull reaching 1000 where the renderer's own
 * sampler reaches 31.62, and the true endpoint — where the integrand kinks — never entered
 * {@link cdfBreakpoints}, so GL-10 straddled it and `W₁` came out 1.07 % wrong. The CDF was right
 * all along (`Math.min`/`Math.max` clamp it), which is why only the quadrature saw it.
 */
function triangularSupport(law: TriangularLaw): readonly [number, number] {
  const scale = law.upper - law.lower;
  const belowMode = law.mode - law.lower;
  const aboveMode = law.upper - law.mode;
  const fraction = belowMode / scale;
  const rise = Math.min(1, Math.max(0, fraction));
  const lo = fraction >= 1 ? law.lower : law.upper - Math.sqrt(scale * aboveMode * (1 - rise));
  const hi = fraction <= 0 ? law.upper : law.lower + Math.sqrt(scale * belowMode * rise);
  return [Math.min(lo, law.lower), Math.max(hi, law.upper)];
}

// --- Φ and Φ⁻¹ ----------------------------------------------------------------------------

/** `1/√π`, the asymptotic tail's leading coefficient. */
const INVERSE_SQRT_PI = 0.5641895835477563;

/**
 * Where `erfc` stops being computed as `1 − erf` and switches to a continued fraction.
 *
 * MEASURED, not chosen: `1 − erf(z)` loses one significant digit for every decade `erfc(z)`
 * falls below 1, so at `z = 4.88` — `Φ(−6.9)`, an ordinary place for a truncated Gaussian's
 * normalizer to be evaluated — the subtraction leaves 4 digits of a number worth 2.6·10⁻¹² and
 * the relative error is 5·10⁻⁴. Above this threshold the continued fraction computes `erfc`
 * DIRECTLY and never forms the difference.
 */
const ERFC_CONTINUED_FRACTION_LIMIT = 2;

/**
 * `erf(z)` for `z ≥ 0` by the confluent series (DLMF 7.6.2 / A&S 7.1.6)
 *
 *     erf(z) = (2/√π)·z·e^{−z²}·Σ_{n≥0} (2z²)ⁿ / (1·3·5···(2n+1))
 *
 * Every term is positive, which is the reason for this form rather than the Maclaurin series:
 * the alternating one loses all its significant digits to cancellation by `z ≈ 3`, while this
 * one only ever adds. The accuracy claim is then a statement about a convergent sum, which a
 * test can check against an independent quadrature of the density rather than against another
 * copy of the same constants.
 */
function erfSeries(z: number): number {
  const twoSquare = 2 * z * z;
  let term = 1;
  const sum = new CompensatedSum();
  sum.add(term);
  for (let n = 0; n < 200; ++n) {
    term *= twoSquare / (2 * n + 3);
    sum.add(term);
    if (term < 1e-20 * sum.total) break;
  }
  return 2 * INVERSE_SQRT_PI * z * Math.exp(-z * z) * sum.total;
}

/**
 * `erfc(z)` for `z ≥ ` {@link ERFC_CONTINUED_FRACTION_LIMIT} by the continued fraction
 *
 *     erfc(z) = (e^{−z²}/√π) · 1/(z + ½/(z + 1/(z + 3/2/(z + 2/(z + …)))))
 *
 * evaluated by modified Lentz, whose whole point is that it never forms `1 − erf`: the
 * result is built multiplicatively from the tail itself and keeps its relative accuracy
 * however small it gets.
 */
function erfcContinuedFraction(z: number): number {
  const tiny = 1e-300;
  // b₀ = 0, so Lentz starts the running value at `tiny` rather than at 0; every bⱼ is z and
  // a₁ = 1 with aⱼ = (j−1)/2 thereafter.
  let f = tiny;
  let c = f;
  let d = 0;
  for (let j = 1; j < 400; ++j) {
    const a = j === 1 ? 1 : (j - 1) / 2;
    d = z + a * d;
    if (d === 0) d = tiny;
    c = z + a / c;
    if (c === 0) c = tiny;
    d = 1 / d;
    const delta = c * d;
    f *= delta;
    if (Math.abs(delta - 1) < 1e-17) break;
  }
  return Math.exp(-z * z) * INVERSE_SQRT_PI * f;
}

/**
 * `erfc(z)` for `z ≥ 0`: the series below the threshold, the continued fraction above it.
 *
 * Two regimes, not three. A truncated asymptotic expansion was tried for the far tail and
 * removed: at `z = 6` it disagreed with the continued fraction by 1.7·10⁻⁸ relative, because
 * an asymptotic series has to be cut at its smallest term and that term is only small once
 * `n ≈ z²`. The continued fraction converges FASTER as `z` grows, so the regime that would
 * have justified the expansion is the one it is least needed in.
 */
function erfcNonNegative(z: number): number {
  return z >= ERFC_CONTINUED_FRACTION_LIMIT ? erfcContinuedFraction(z) : 1 - erfSeries(z);
}

/**
 * The standard normal CDF, `Φ(x) = ½·erfc(−x/√2)`.
 *
 * Evaluated through `erfc` rather than `½(1 + erf(x/√2))` so the left tail keeps its relative
 * accuracy: the second form computes `Φ(−8)` as the difference of two numbers near 1 and
 * loses every significant digit, which matters because the truncated Gaussian's normalizer is
 * exactly such a difference.
 */
export function standardNormalCdf(x: number): number {
  const z = -x / Math.SQRT2;
  return 0.5 * (z >= 0 ? erfcNonNegative(z) : 2 - erfcNonNegative(-z));
}

/**
 * `Φ⁻¹(p)` — Acklam's rational approximation (|relative ε| < 1.15·10⁻⁹) refined by one
 * Halley step against {@link standardNormalCdf}, which takes it to the CDF's own accuracy.
 *
 * The refinement is what makes the pair self-consistent: `Φ(Φ⁻¹(p)) = p` to ~1e−16 is the
 * property the quantile integrals depend on, and it is pinned as a round trip rather than as a
 * coefficient comparison.
 *
 * In the right tail that round trip is blind — `|Φ(Q(p)) − p| / p` is exactly 0 for every
 * `p > 1 − 1e-13` whatever `Q` returned — so the residual is formed complementarily instead (W3
 * MAJOR-3, at the step itself). Both tails now measure ≤ 1.2·10⁻¹⁵ relative against `mpmath` at
 * 60 dps out to `1 − 10⁻¹⁵`, and the round trip is additionally stated on `1 − p`, the quantity
 * that carries information there.
 */
export function standardNormalQuantile(p: number): number {
  if (p <= 0) return Number.NEGATIVE_INFINITY;
  if (p >= 1) return Number.POSITIVE_INFINITY;

  // Acklam's coefficients, named rather than indexed so that a transcription which dropped one
  // fails to compile instead of evaluating `undefined * q`. The central numerator is degree 5 in
  // `r` and its denominator degree 4; the tail numerator degree 5 in `q`, its denominator 3.
  const [a0, a1, a2, a3, a4, a5] = [
    -3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2,
    -3.066479806614716e1, 2.506628277459239,
  ] as const;
  const [b0, b1, b2, b3, b4] = [
    -5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1,
    -1.328068155288572e1,
  ] as const;
  const [c0, c1, c2, c3, c4, c5] = [
    -7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734,
    4.374664141464968, 2.938163982698783,
  ] as const;
  const [d0, d1, d2, d3] = [
    7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416,
  ] as const;

  const lowBreak = 0.02425;
  let x: number;
  if (p < lowBreak) {
    const q = Math.sqrt(-2 * Math.log(p));
    x =
      (((((c0 * q + c1) * q + c2) * q + c3) * q + c4) * q + c5) /
      ((((d0 * q + d1) * q + d2) * q + d3) * q + 1);
  } else if (p <= 1 - lowBreak) {
    const q = p - 0.5;
    const r = q * q;
    x =
      ((((((a0 * r + a1) * r + a2) * r + a3) * r + a4) * r + a5) * q) /
      (((((b0 * r + b1) * r + b2) * r + b3) * r + b4) * r + 1);
  } else {
    const q = Math.sqrt(-2 * Math.log(1 - p));
    x =
      -(((((c0 * q + c1) * q + c2) * q + c3) * q + c4) * q + c5) /
      ((((d0 * q + d1) * q + d2) * q + d3) * q + 1);
  }

  // One Halley step on f(x) = Φ(x) − p, skipped where the density underflows, since the
  // correction is then 0/0 rather than small.
  //
  // The residual is formed COMPLEMENTARILY for `x > 0`. `Φ(x) − p` cancels
  // completely as `p → 1` — both terms are 1 to sixteen digits — so the correction was noise
  // there and Acklam's raw 1.15e-9 survived: measured 1.124e-9 relative at `p = 1 − 1e-13`
  // against 1.41e-17 at `p = 1e-13`, an asymmetry of 4.5·10⁵. `(1 − p) − Φ(−x)` is the same
  // quantity with no cancellation in it: `1 − p` is EXACT for `p ∈ [0.5, 1)` by Sterbenz, and
  // `Φ(−x)` is the left tail, which `erfc`'s continued fraction computes to full relative
  // accuracy by construction.
  const density = Math.exp((-x * x) / 2) / Math.sqrt(2 * Math.PI);
  if (!(density > 0)) return x;
  const error = x > 0 ? 1 - p - standardNormalCdf(-x) : standardNormalCdf(x) - p;
  const step = error / density;
  return x - step / (1 + (x * step) / 2);
}

// --- CDFs ---------------------------------------------------------------------------------

/**
 * The mixture weight `q^N` on the untruncated component, computed in log space because
 * `q^10000` underflows for every `q` below about 0.9977 and the naive power is then 0 —
 * which is correct, but only by luck, and the log form says so.
 */
export function gaussianEscapeWeight(law: GaussianLaw): number {
  const inside =
    standardNormalCdf((law.upper - law.center) / law.sigma) -
    standardNormalCdf((law.lower - law.center) / law.sigma);
  const outside = 1 - inside;
  if (!(outside > 0)) return 0;
  if (outside >= 1) return 1;
  return Math.exp(GAUSSIAN_ESCAPE_ATTEMPTS * Math.log(outside));
}

/** The right-continuous CDF `F(x) = P(X ≤ x)`. Atoms jump at their site. */
export function cdf(law: ImprecisionLaw, x: number): number {
  switch (law.kind) {
    case 'delta':
      return x >= law.at ? 1 : 0;
    case 'uniform':
      if (x < law.lower) return 0;
      if (x >= law.upper) return 1;
      return (x - law.lower) / (law.upper - law.lower);
    case 'triangular':
      return triangularCdf(law, x);
    case 'gaussian': {
      const base = standardNormalCdf((x - law.center) / law.sigma);
      const weight = gaussianEscapeWeight(law);
      if (weight >= 1) return base;
      const lo = standardNormalCdf((law.lower - law.center) / law.sigma);
      const hi = standardNormalCdf((law.upper - law.center) / law.sigma);
      const inside = hi - lo;
      let truncated: number;
      if (!(inside > 0)) truncated = x >= law.lower ? 1 : 0;
      else if (x < law.lower) truncated = 0;
      else if (x >= law.upper) truncated = 1;
      else truncated = (base - lo) / inside;
      return (1 - weight) * truncated + weight * base;
    }
    case 'list': {
      let below = 0;
      for (const value of law.values) {
        if (value <= x) ++below;
        else break;
      }
      return below / law.values.length;
    }
    case 'clipped':
      if (x < law.lower) return 0;
      if (x >= law.upper) return 1;
      return cdf(law.base, x);
  }
}

/**
 * The triangular's CDF, inverted from the renderer's two-branch quantile.
 *
 * Written as the inverse of {@link triangularQuantile} rather than from the textbook formula
 * so the two cannot disagree about a mode outside the limits, where the textbook formula has
 * no answer and the renderer plainly does.
 */
function triangularCdf(law: TriangularLaw, x: number): number {
  const scale = law.upper - law.lower;
  const belowMode = law.mode - law.lower;
  const aboveMode = law.upper - law.mode;
  const fraction = belowMode / scale;

  const [supportLo, supportHi] = triangularSupport(law);
  if (x < supportLo) return 0;
  if (x >= supportHi) return 1;

  if (fraction >= 1) {
    // Only the rising branch runs: x = lower + √(u·scale·belowMode).
    const u = ((x - law.lower) * (x - law.lower)) / (scale * belowMode);
    return Math.min(1, Math.max(0, u));
  }
  if (fraction <= 0) {
    // Only the falling branch runs: x = upper − √((1−u)·scale·aboveMode).
    const u = 1 - ((law.upper - x) * (law.upper - x)) / (scale * aboveMode);
    return Math.min(1, Math.max(0, u));
  }
  if (x < law.mode) {
    const u = ((x - law.lower) * (x - law.lower)) / (scale * belowMode);
    return Math.min(fraction, Math.max(0, u));
  }
  const u = 1 - ((law.upper - x) * (law.upper - x)) / (scale * aboveMode);
  return Math.min(1, Math.max(fraction, u));
}

// --- quantiles ----------------------------------------------------------------------------

/** The generalized inverse `Q(u) = inf{ x : F(x) ≥ u }`, for `u ∈ [0, 1]`. */
export function quantile(law: ImprecisionLaw, u: number): number {
  switch (law.kind) {
    case 'delta':
      return law.at;
    case 'uniform':
      return law.lower + (law.upper - law.lower) * u;
    case 'triangular':
      return triangularQuantile(law, u);
    case 'gaussian':
      return gaussianQuantile(law, u);
    case 'list': {
      const n = law.values.length;
      const index = Math.min(n - 1, Math.max(0, Math.ceil(u * n) - 1));
      // `index` is clamped into `[0, n − 1]` on a list the type says is non-empty, so the read
      // hits; the fallback names the same element the upper clamp already means.
      return law.values[index] ?? last(law.values);
    }
    case 'clipped':
      return Math.min(Math.max(quantile(law.base, u), law.lower), law.upper);
  }
}

/** `RandomNumberProvider.triangularDistribution`, read as a quantile function. */
function triangularQuantile(law: TriangularLaw, u: number): number {
  const scale = law.upper - law.lower;
  const belowMode = law.mode - law.lower;
  const aboveMode = law.upper - law.mode;
  const fraction = belowMode / scale;
  if (u < fraction) return law.lower + Math.sqrt(u * scale * belowMode);
  return law.upper - Math.sqrt((1 - u) * scale * aboveMode);
}

/**
 * The mixture's quantile.
 *
 * The two pure components invert in closed form; a genuine mixture (both weights positive)
 * has no closed inverse and is bisected on its own monotone CDF over the support hull. That
 * regime needs `q^10000` to be neither 0 nor 1, which pins `q` inside about
 * `[0.9977, 1)` — a window so narrow that the closed forms cover every realistic document,
 * and the bisection exists so that the ones inside it are still right.
 */
function gaussianQuantile(law: GaussianLaw, u: number): number {
  const weight = gaussianEscapeWeight(law);
  if (weight >= 1) return law.center + law.sigma * standardNormalQuantile(u);
  if (weight <= 0) {
    const lo = standardNormalCdf((law.lower - law.center) / law.sigma);
    const hi = standardNormalCdf((law.upper - law.center) / law.sigma);
    if (!(hi > lo)) return law.lower;
    return law.center + law.sigma * standardNormalQuantile(lo + u * (hi - lo));
  }
  const [hullLo, hullHi] = supportOf(law);
  if (u <= 0) return hullLo;
  if (u >= 1) return hullHi;
  const crossing = bisectSignChange((x) => cdf(law, x) - u, hullLo, hullHi);
  return crossing ?? law.center + law.sigma * standardNormalQuantile(u);
}

// --- structural breakpoints ---------------------------------------------------------------

/** The `x`-values where a law's CDF changes analytic piece, atom sites included. */
export function cdfBreakpoints(law: ImprecisionLaw): readonly number[] {
  switch (law.kind) {
    case 'delta':
      return [law.at];
    case 'uniform':
      return [law.lower, law.upper];
    case 'triangular': {
      const [lo, hi] = triangularSupport(law);
      return [lo, law.lower, law.mode, law.upper, hi];
    }
    case 'gaussian': {
      // The mixture is smooth except at the truncation edges, and Φ's own curvature is
      // resolved by σ-spaced nodes — the same reason the rule 1 grades its mesh. Six
      // sigmas rather than the hull's twelve: beyond that `Φ` differs from its own limit by
      // under 1e-9, so further nodes buy nothing and cost a piece each.
      const nodes: number[] = [law.lower, law.upper];
      for (let k = -GAUSSIAN_MESH_SIGMAS; k <= GAUSSIAN_MESH_SIGMAS; ++k)
        nodes.push(law.center + k * law.sigma);
      return nodes;
    }
    case 'list':
      return law.values;
    case 'clipped':
      return [law.lower, law.upper, ...cdfBreakpoints(law.base)];
  }
}

/** The `u`-values where a law's quantile changes analytic piece. */
export function quantileBreakpoints(law: ImprecisionLaw): readonly number[] {
  switch (law.kind) {
    case 'delta':
    case 'uniform':
      return [];
    case 'triangular': {
      const fraction = (law.mode - law.lower) / (law.upper - law.lower);
      return fraction > 0 && fraction < 1 ? [fraction] : [];
    }
    case 'gaussian':
      return [cdf(law, law.lower), cdf(law, law.upper)];
    case 'list':
      return law.values.map((_, index) => index / law.values.length);
    case 'clipped':
      return [cdf(law.base, law.lower), cdf(law.base, law.upper), ...quantileBreakpoints(law.base)];
  }
}

// --- W₁ ------------------------------------------------------------------------------------

/** Split points per piece, in the spirit of the rule 2c: BOTH sets, never one. */
const W1_PIECE_SUBDIVISIONS = 16;

/**
 * The vertex of the quadratic through three equally spaced samples, or null when they are
 * collinear.
 *
 * For the polynomial families `F_A − F_B` really IS a quadratic between structural breakpoints,
 * so this is not a heuristic there: fitting three points determines it exactly, and splitting at
 * the vertex leaves two monotone branches on which `bisectSignChange` is complete. The rule 2
 * buys the same completeness for tempo from a closed-form critical point; here the closed form
 * is a three-point fit, since the coefficients depend on which pieces of which two CDFs meet.
 */
export function quadraticVertex(f: (x: number) => number, a: number, b: number): number | null {
  const mid = (a + b) / 2;
  const fa = f(a);
  const fm = f(mid);
  const fb = f(b);
  const curvature = fa - 2 * fm + fb;
  if (curvature === 0 || !Number.isFinite(curvature)) return null;
  // With h = (b − a)/2: vertex = mid − h·(fb − fa) / (2·curvature).
  const vertex = mid - (((b - a) / 2) * (fb - fa)) / (2 * curvature);
  if (!Number.isFinite(vertex) || vertex <= a || vertex >= b) return null;
  return vertex;
}

/**
 * `W₁(A, B) = ∫ |F_A(x) − F_B(x)| dx` — the headline pointwise density, before the row's
 * JND divides it.
 *
 * Exact for the polynomial-CDF families and at the special-function ε where a Gaussian is
 * involved (module doc). The identity short-circuit is not an optimization: `d(A, A) = 0`
 * has to be EXACT for identity, and a quadrature that returns 3·10⁻¹⁷ instead would make the
 * zero set wrong in a way no tolerance can repair downstream.
 */
export function wasserstein1(a: ImprecisionLaw, b: ImprecisionLaw): number {
  if (lawsEqual(a, b)) return 0;

  const [aLo, aHi] = supportOf(a);
  const [bLo, bHi] = supportOf(b);
  const lo = Math.min(aLo, bLo);
  const hi = Math.max(aHi, bHi);
  if (!(hi > lo)) return Math.abs(quantile(a, 0.5) - quantile(b, 0.5));

  const difference = (x: number): number => cdf(a, x) - cdf(b, x);

  const cuts = [...new Set([lo, hi, ...cdfBreakpoints(a), ...cdfBreakpoints(b)])]
    .filter((x) => x > lo && x < hi)
    .sort((x, y) => x - y);
  const bounds = [lo, ...cuts, hi];

  const total = new CompensatedSum();
  for (const [pieceLo, pieceHi] of pairwise(bounds)) {
    if (!(pieceHi > pieceLo)) continue;

    const splits: number[] = [];
    const vertex = quadraticVertex(difference, pieceLo, pieceHi);
    if (vertex !== null) splits.push(vertex);
    for (let k = 1; k < W1_PIECE_SUBDIVISIONS; ++k)
      splits.push(pieceLo + ((pieceHi - pieceLo) * k) / W1_PIECE_SUBDIVISIONS);

    total.add(integrateAbsolute(difference, pieceLo, pieceHi, splits));
  }
  return total.total;
}

// --- W₂ and the decomposition -----------------------------------------------------------

/**
 * `ρ` between a uniform law and an untruncated Gaussian, `√(3/π) ≈ 0.977205`.
 *
 * Derivation (re-derived independently in the tests): `ρ = Cov(Q_U, Q_N)/(σ_U σ_N)` with
 * `Q_U(u) = u` centered and `Q_N(u) = Φ⁻¹(u)`, so the covariance is
 * `∫₀¹ (u − ½)Φ⁻¹(u) du = E[X·Φ(X)] = 1/(2√π)` for `X ~ N(0,1)`, and `σ_U = 1/√12`,
 * `σ_N = 1`. Then `ρ = √12/(2√π) = √3/√π`.
 */
export const RHO_UNIFORM_GAUSSIAN = Math.sqrt(3 / Math.PI);

/**
 * `ρ` between a uniform law and a SYMMETRIC triangular one, `7√2/10 = 0.98995`.
 *
 * Derivation: with the triangular on `[−1, 1]` and mode 0, `∫₀¹ (u − ½)Q_T(u) du = 7/60`,
 * `σ_U = 1/√12`, `σ_T = 1/√6`, so `ρ = (7/60)·√72 = 7√2/10`. Both constants are invariant
 * under positive affine maps of either law, which is why they are constants at all — and
 * why the triangular has to be symmetric for this one to apply.
 */
export const RHO_UNIFORM_TRIANGULAR = (7 * Math.SQRT2) / 10;

/** Geometric refinement of the two end panels, for laws whose quantile is unbounded. */
const QUANTILE_TAIL_DECADES = 12;

/** Equal subdivision of every quantile panel — the sibling of {@link W1_PIECE_SUBDIVISIONS}. */
const QUANTILE_PANEL_SUBDIVISIONS = 8;

export interface W2Decomposition {
  /** `W₂(A, B) = ‖Q_A − Q_B‖₂`. */
  readonly w2: number;
  /** `|ℓ_A − ℓ_B|` — the location term, as a root. */
  readonly location: number;
  /** `|σ_A − σ_B|` — the spread term, as a root. */
  readonly spread: number;
  /** `√(2σ_Aσ_B(1 − ρ))` — the shape term, as a root; 0 where either law is spreadless. */
  readonly shape: number;
  /** `ρ`, or null where either law is spreadless (the discipline). */
  readonly rho: number | null;
  /** True where a spread was recognized as structurally 0 — the `shapeless` companion. */
  readonly shapeless: boolean;
  readonly meanA: number;
  readonly meanB: number;
  readonly sigmaA: number;
  readonly sigmaB: number;
  /** `‖Q_A − Q_B‖₂²` against `location² + spread² + 2σ_Aσ_B(1−ρ)` — the closing check. */
  readonly closingResidual: number;
}

/**
 * the lemma in the quantile domain: `W₂²` split into location, spread and shape.
 *
 * The panels carry every quantile breakpoint of both laws, an equal subdivision of each, and
 * a geometric refinement at both ends where a Gaussian's quantile grows without bound. The
 * three terms are EXACT given the moments — the identity is algebra — so the only error is
 * in the moments themselves, and `closingResidual` reports it rather than asserting it away.
 *
 * Variance is `∫(Q − ℓ)²`, never `∫Q² − ℓ²`: the second form cancels
 * catastrophically for a law whose mean dwarfs its spread, which is the ordinary case for a
 * list of measured offsets clustered far from zero.
 */
export function wasserstein2Decomposition(a: ImprecisionLaw, b: ImprecisionLaw): W2Decomposition {
  const panels = quantilePanels(a, b);
  const integrate = (g: (u: number) => number): number => {
    const total = new CompensatedSum();
    for (const [panelLo, panelHi] of pairwise(panels))
      total.add(gaussLegendre10(g, panelLo, panelHi));
    return total.total;
  };

  const qa = (u: number): number => quantile(a, u);
  const qb = (u: number): number => quantile(b, u);

  const meanA = integrate(qa);
  const meanB = integrate(qb);
  const varianceA = integrate((u) => (qa(u) - meanA) * (qa(u) - meanA));
  const varianceB = integrate((u) => (qb(u) - meanB) * (qb(u) - meanB));

  const scale = Math.max(Math.abs(meanA), Math.abs(meanB), 1);
  const floor = SPREAD_NOISE_FLOOR * scale;
  const sigmaA = varianceA > floor * floor ? Math.sqrt(varianceA) : 0;
  const sigmaB = varianceB > floor * floor ? Math.sqrt(varianceB) : 0;

  const w2Squared = integrate((u) => (qa(u) - qb(u)) * (qa(u) - qb(u)));
  const location = Math.abs(meanA - meanB);
  const spread = Math.abs(sigmaA - sigmaB);

  let rho: number | null = null;
  let shape = 0;
  if (sigmaA > 0 && sigmaB > 0) {
    const cross = integrate((u) => (qa(u) - meanA) * (qb(u) - meanB));
    rho = Math.min(1, Math.max(-1, cross / (sigmaA * sigmaB)));
    shape = Math.sqrt(Math.max(0, 2 * sigmaA * sigmaB * (1 - rho)));
  }

  const assembled = location * location + spread * spread + shape * shape;
  return {
    w2: Math.sqrt(Math.max(0, w2Squared)),
    location,
    spread,
    shape,
    rho,
    shapeless: rho === null,
    meanA,
    meanB,
    sigmaA,
    sigmaB,
    closingResidual: Math.abs(w2Squared - assembled),
  };
}

/**
 * the floor, restated for the quantile domain.
 *
 * `decomposition.ts` carries the same constant for curves, for the same reason: a law with no
 * spread integrates to a variance of ~1e−31 rather than to 0, so `σ === 0` has to be recognized
 * structurally or the degenerate convention never fires and `ρ` is reported for a point mass.
 */
export const SPREAD_NOISE_FLOOR = 1e-12;

/** The quantile-domain panel boundaries for a pair of laws. */
function quantilePanels(a: ImprecisionLaw, b: ImprecisionLaw): readonly number[] {
  const structural = [...quantileBreakpoints(a), ...quantileBreakpoints(b)].filter(
    (u) => u > 0 && u < 1,
  );
  const points = new Set<number>([0, 1, ...structural]);

  // BOTH end panels are refined geometrically, always. A Gaussian's quantile is unbounded at
  // `u → 0, 1`; the triangular's is not, but its DERIVATIVE is (`Q = lo + √(u·s·a)` has infinite
  // slope at 0), and a uniform mesh reported σ for `T(−30, 30, 0)` as 12.24716 against the closed
  // form 30/√6 = 12.24745 — a relative 2.4·10⁻⁵ that put ρ(uniform, triangular) 6.7·10⁻⁶ off
  // the `7√2/10`. Twelve decades matches the ±12σ support hull the CDF side uses, and costs
  // nothing on the families with no singularity: GL-10 is exact on their quantiles for any
  // panelling at all.
  for (let decade = 1; decade <= QUANTILE_TAIL_DECADES; ++decade) {
    points.add(Math.pow(10, -decade));
    points.add(1 - Math.pow(10, -decade));
  }

  // 0 and 1 bracket the axis by construction: every structural breakpoint was filtered to the
  // open interval, and twelve decades of `10^-k` and `1 − 10^-k` are interior for every `k ≥ 1`.
  // Spelling the two ends out makes the closing endpoint below a `last` on a sequence the type
  // knows is non-empty.
  const sorted: NonEmptyArray<number> = [
    0,
    ...[...points].filter((u) => u > 0 && u < 1).sort((x, y) => x - y),
    1,
  ];
  const refined: number[] = [];
  for (const [panelLo, panelHi] of pairwise(sorted)) {
    refined.push(panelLo);
    for (let k = 1; k < QUANTILE_PANEL_SUBDIVISIONS; ++k)
      refined.push(panelLo + ((panelHi - panelLo) * k) / QUANTILE_PANEL_SUBDIVISIONS);
  }
  refined.push(last(sorted));
  return refined;
}

// --- equality ------------------------------------------------------------------------------

/**
 * Structural equality of two laws — the identity fast path.
 *
 * Structural rather than numeric because it has to be a decision, not a tolerance: identity
 * requires `d(A, A) = 0` exactly, and the constructors have already canonicalized the
 * spellings that differ without differing (an inverted uniform, a vacuous clip, a zero σ).
 */
export function lawsEqual(a: ImprecisionLaw, b: ImprecisionLaw): boolean {
  if (a.kind !== b.kind) return false;
  switch (a.kind) {
    case 'delta':
      return a.at === (b as DeltaLaw).at;
    case 'uniform': {
      const other = b as UniformLaw;
      return a.lower === other.lower && a.upper === other.upper;
    }
    case 'triangular': {
      const other = b as TriangularLaw;
      return a.lower === other.lower && a.upper === other.upper && a.mode === other.mode;
    }
    case 'gaussian': {
      const other = b as GaussianLaw;
      // Two untruncated Gaussians agree whatever their (dead) limits say — the limits are
      // parameters of a component that carries no weight.
      if (a.sigma !== other.sigma || a.center !== other.center) return false;
      if (a.lower === other.lower && a.upper === other.upper) return true;
      return gaussianEscapeWeight(a) >= 1 && gaussianEscapeWeight(other) >= 1;
    }
    case 'list': {
      const other = b as ListLaw;
      return (
        a.values.length === other.values.length &&
        a.values.every((value, index) => value === other.values[index])
      );
    }
    case 'clipped': {
      const other = b as ClippedLaw;
      return a.lower === other.lower && a.upper === other.upper && lawsEqual(a.base, other.base);
    }
  }
}
