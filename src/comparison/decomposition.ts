/**
 * The level / gain / shape decomposition — DESIGN.md §1.2, and the invariance modes of §7.4
 * that share its machinery.
 *
 * One lemma, for curves in T-space over `(time, dμ)`:
 *
 *     ‖h_A − h_B‖₂² = (ℓ_A − ℓ_B)² + (σ_A − σ_B)² + 2σ_Aσ_B(1 − r)
 *                       level           gain            shape
 *
 * `d_level` answers "is one globally faster or louder?", `d_gain` "is one's shaping more
 * exaggerated?", and `d_shape = √(2(1−r))` "do they shape the same way?" — the last being
 * scale- and level-invariant, which is Sapp's correlation consumed as a *component* rather
 * than offered as a rival metric.
 *
 * ## An interpretive product; it does not sum to the headline
 *
 * The table is L²-family; the headline `d_k` is L¹-family (A-Q4 as amended). They are never
 * mixed and the report labels them separately. `level + gain + shape` is not `d_k`, which is
 * why the closing identity reported here is in squares while the three fields are square roots.
 *
 * ## The measure is the normalized one (AD-18, M8)
 *
 * The lemma needs a probability measure, and §5.0's default weight `w ≡ 1` is not one. So
 * everything here integrates against `dμ = w dt / ∫_W w dt`, recomputed per window and per
 * invariance mode, while the headline density integrates against the *unnormalized* `w dt` —
 * which is what makes `d_k` a mass in JND·quarters and what makes the attribution table close.
 * Reading `ℓ_X = ∫ h_X dμ` against the unnormalized measure would silently change `d_level`'s
 * unit from nepers to neper·√quarters.
 */
import { head, isNonEmpty, last, pairwise } from '../prelude/index.js';

import { CompensatedSum, gaussLegendre10 } from './quadrature.js';

/**
 * The grid's own span, or 0 for a grid too short to have one — the length-1 and empty cases
 * both give 0, because there is no interval. Callers guard on `!(length > 0)`.
 */
function gridSpan(grid: readonly number[]): number {
  return isNonEmpty(grid) ? last(grid) - head(grid) : 0;
}

/** §7.4's per-dimension canonicalization. Event dimensions reject the last two (AD-20). */
export type InvarianceMode = 'none' | 'level' | 'level-gain';

/** A curve in T-space, sampled at a position in common ticks. */
export type SampledCurve = (ticks: number) => number;

/**
 * The relative noise floor below which a curve's spread is treated as exactly zero.
 *
 * §1.2 writes the degenerate case as `σ_A σ_B = 0`, which is not implementable as written: a
 * genuinely constant curve integrated by quadrature gives a variance of order `1e-31`, not `0`,
 * because `(h − ℓ)²` cancels two nearly equal numbers. `σ` is then `~9e-16` and the shapeless
 * branch never fires, so `shape` and `r` are reported for a curve that has no shape and
 * `'level-gain'` divides by a noise term. M18's lesson in a second place: an
 * algebraically-neutral quantity has to be recognized structurally, not by floating-point
 * equality.
 *
 * `1e-12`, relative to the curve's own scale, is [convention] with 17 orders of margin on both
 * sides: the measured floor for a `ln 60 ≈ 4.09` constant is `σ ≈ 9e-16`, i.e. `2e-16` relative,
 * while the smallest musically meaningful spread — a 0.1 % tempo variation — is `σ ≈ 1e-3`.
 */
const SPREAD_NOISE_FLOOR = 1e-12;

/** First and second moments of one curve against the normalized measure. */
export interface CurveMoments {
  /** `ℓ = ∫ h dμ` — the window mean. */
  readonly mean: number;
  /** `σ² = ∫ (h − ℓ)² dμ`. Never negative; clamped at 0 against round-off. */
  readonly variance: number;
  readonly sigma: number;
}

/**
 * `∫_W g dt` over a grid that partitions the window, cell by cell with compensation.
 *
 * The grid must be the refinement grid of whichever dimension is being decomposed: every
 * breakpoint of both curves has to be a cell boundary, or a cell straddles a discontinuity
 * and GL-10 integrates across a jump.
 */
function integrateOverGrid(g: SampledCurve, grid: readonly number[]): number {
  const total = new CompensatedSum();
  for (const [low, high] of pairwise(grid)) total.add(gaussLegendre10(g, low, high));
  return total.total;
}

/**
 * The moments of one curve against `dμ = dt / L`.
 *
 * `w ≡ 1` is assumed, which is §5.0's default. The MSM note-density weight is not implemented;
 * it would enter here and only here, as a factor inside both integrals and in the normalizer —
 * the rest of the file is weight-agnostic by construction.
 *
 * The variance is `∫(h − ℓ)² dμ` rather than `∫h² dμ − ℓ²`. The second form is one subtraction
 * shorter and cancels catastrophically on a curve whose mean dwarfs its spread — a tempo curve
 * at `ln 60 ≈ 4.1` with a spread of 0.01 nepers, which is the common case.
 */
export function curveMoments(curve: SampledCurve, grid: readonly number[]): CurveMoments {
  const length = gridSpan(grid);
  if (!(length > 0)) return { mean: 0, variance: 0, sigma: 0 };

  const mean = integrateOverGrid(curve, grid) / length;
  const centred = (ticks: number) => {
    const value = curve(ticks) - mean;
    return value * value;
  };
  const raw = Math.max(0, integrateOverGrid(centred, grid) / length);
  // Snap quadrature noise to exactly zero, so every downstream `sigma === 0` test — the
  // shapeless flag, the 'level-gain' guard — fires on a constant curve. Without it §1.2's
  // degenerate convention is unreachable; see SPREAD_NOISE_FLOOR.
  const scale = Math.max(1, Math.abs(mean));
  const floor = SPREAD_NOISE_FLOOR * scale;
  const variance = raw > floor * floor ? raw : 0;
  return { mean, variance, sigma: Math.sqrt(variance) };
}

/** §1.2's four reported fields plus the closing check. */
export interface CurveDecomposition {
  /** `|ℓ_A − ℓ_B|`. */
  readonly level: number;
  /** `|σ_A − σ_B|`. */
  readonly gain: number;
  /** `√(2(1−r))`, or null on a shapeless window. */
  readonly shape: number | null;
  /** Pearson `r` against the normalized measure, or null on a shapeless window. */
  readonly r: number | null;
  /**
   * True when `σ_A σ_B = 0`, i.e. at least one curve is constant over the window.
   *
   * A boolean companion rather than making consumers branch on a null (C14). A constant curve
   * is ordinary in this data — most documents hold a tempo for bars at a time — so this is a
   * routine state, not an error.
   */
  readonly shapeless: boolean;
  /** `‖h_A − h_B‖₂²` computed directly, for the closing check. */
  readonly l2Squared: number;
  /** `level² + gain² + shapeTerm`, which must equal {@link l2Squared}. */
  readonly identity: number;
}

/**
 * Decompose the difference of two curves over one window.
 *
 * §1.2's degenerate convention: the shape term is 0 when `σ_A σ_B = 0`, so the identity stays
 * exact while `shape` and `r` are null and the window is flagged `shapeless`. `r` on a constant
 * window is undefined, never 0 — reporting 0 would claim the two curves are uncorrelated when
 * one of them has nothing to correlate.
 */
export function decomposeCurves(
  a: SampledCurve,
  b: SampledCurve,
  grid: readonly number[],
): CurveDecomposition {
  const momentsA = curveMoments(a, grid);
  const momentsB = curveMoments(b, grid);

  const length = gridSpan(grid);
  const difference = (ticks: number) => {
    const value = a(ticks) - b(ticks);
    return value * value;
  };
  const l2Squared = length > 0 ? integrateOverGrid(difference, grid) / length : 0;

  const level = Math.abs(momentsA.mean - momentsB.mean);
  const gain = Math.abs(momentsA.sigma - momentsB.sigma);
  const product = momentsA.sigma * momentsB.sigma;

  if (product === 0)
    return {
      level,
      gain,
      shape: null,
      r: null,
      shapeless: true,
      l2Squared,
      identity: level * level + gain * gain,
    };

  const covariance = (ticks: number) => (a(ticks) - momentsA.mean) * (b(ticks) - momentsB.mean);
  const rawR = length > 0 ? integrateOverGrid(covariance, grid) / length / product : 0;
  // Round-off can put a perfectly correlated pair a few ulps outside [-1, 1], which would
  // make `2(1-r)` negative and `shape` a NaN.
  const r = Math.min(1, Math.max(-1, rawR));
  const shapeTerm = 2 * product * (1 - r);

  return {
    level,
    gain,
    shape: Math.sqrt(Math.max(0, 2 * (1 - r))),
    r,
    shapeless: false,
    l2Squared,
    identity: level * level + gain * gain + shapeTerm,
  };
}

/**
 * §7.4's canonicalization, applied per document and per curve-valued row.
 *
 * - `'none'` — the raw T-space curve.
 * - `'level'` — centred by its own window mean. In a log space this removes a *multiplicative*
 *   factor (roll speed, volume calibration); in a linear space it removes an additive offset
 *   only, because `c·x − mean(c·x) = c(x − mean x)` leaves the factor standing (§7.4's table).
 * - `'level-gain'` — centred and σ-normalized: pure shape.
 *
 * `σ = 0` under `'level-gain'` yields the identically-zero curve and the dimension is marked
 * `shapeless` (AD-20). A constant curve is the most common input in this corpus, and dividing
 * by σ without the guard would be a division by zero on exactly that input.
 *
 * Metric safety rests on the canonicalization being per-document and the window being
 * piece-derived or corpus-shared; under a pair-derived window these modes inherit M2's defect
 * and are not metric. The facade stamps that, not this function.
 */
export function applyInvariance(
  curve: SampledCurve,
  mode: InvarianceMode,
  moments: CurveMoments,
): SampledCurve {
  const canonical = canonicalizationFor(mode, moments);
  if (mode === 'none') return curve;
  return (ticks) => canonicalValue(canonical, curve(ticks));
}

/**
 * §7.4's canonicalization as data — `v ↦ scale·(v − shift)` in T-space.
 *
 * The same construction {@link applyInvariance} applies to a sampled curve, in the one form that
 * can also reach a distance module's integrand. The curve `*Distance` functions integrate
 * `|T_a − T_b|` without ever holding a `SampledCurve`, so a canonicalization expressed only as a
 * wrapped curve would canonicalize the decomposition while leaving `d_k` on the raw curves,
 * reporting an invariance mode the headline number never saw.
 *
 * Two conditions make it a metric: the transform is per document and never pair-dependent
 * (§7.4, AD-20), and the window it is derived over is piece-derived or corpus-shared (AD-4).
 * Neither is this type's to enforce; the facade stamps them.
 */
export interface CurveCanonicalization {
  /** Subtracted first, in T-space units. */
  readonly shift: number;
  /** Applied after the shift; dimensionless. */
  readonly scale: number;
}

/** `'none'`: the transform that changes nothing. */
export const IDENTITY_CANONICALIZATION: CurveCanonicalization = { shift: 0, scale: 1 };

/** One canonicalization per document — what a distance module needs to see both sides. */
export interface CanonicalPair {
  readonly a: CurveCanonicalization;
  readonly b: CurveCanonicalization;
}

/** Both sides raw: the default every distance module runs under. */
export const IDENTITY_CANONICAL_PAIR: CanonicalPair = {
  a: IDENTITY_CANONICALIZATION,
  b: IDENTITY_CANONICALIZATION,
};

/**
 * §7.4's mode, resolved against one document's own moments.
 *
 * `σ = 0` under `'level-gain'` gives `scale = 0`, the identically zero curve — AD-20's rule as
 * data, and stronger than "do not divide by zero": the canonical curve is zero, not merely
 * un-normalized. The caller marks the dimension `shapeless` ({@link isShapelessUnder}).
 */
export function canonicalizationFor(
  mode: InvarianceMode,
  moments: CurveMoments,
): CurveCanonicalization {
  if (mode === 'none') return IDENTITY_CANONICALIZATION;
  if (mode === 'level') return { shift: moments.mean, scale: 1 };
  return { shift: moments.mean, scale: moments.sigma > 0 ? 1 / moments.sigma : 0 };
}

/**
 * `scale·(v − shift)`, on a value already in T-space.
 *
 * `scale = 0` returns a literal `+0` rather than computing the product, and both halves of that
 * matter: `0 · (v − shift)` is `−0` wherever the centred value is negative, which
 * `Object.is`-based identity assertions and §9.5's `−0` normalization would then have to undo,
 * and it is `NaN` at the infinite T-values §4 admits. The zero curve AD-20 asks for is a
 * constant, not an arithmetic accident.
 */
export function canonicalValue(canonical: CurveCanonicalization, value: number): number {
  if (canonical.scale === 0) return 0;
  return canonical.scale * (value - canonical.shift);
}

/** Whether two canonicalizations are the same transform, so `x = y ⇒ d = 0` still holds. */
export function sameCanonicalization(a: CurveCanonicalization, b: CurveCanonicalization): boolean {
  return a.shift === b.shift && a.scale === b.scale;
}

/** Whether a `'level-gain'` run collapses to the zero curve — AD-20's `shapeless` flag. */
export function isShapelessUnder(mode: InvarianceMode, moments: CurveMoments): boolean {
  return mode === 'level-gain' && moments.sigma === 0;
}
