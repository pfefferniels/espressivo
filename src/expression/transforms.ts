/**
 * The scale spaces of the expression-transform engine.
 *
 * Every exaggerable MPM attribute has a monotone bijection `T : D → ℝ` from its musical
 * domain with `T(neutral) = 0`, and the whole engine is one formula in different `T`s:
 *
 *     x' = T⁻¹( s · T(x) )
 *
 * Pure functions of numbers — no XML, no DOM, no knowledge of which attribute a value came
 * from. Which space an attribute lives in is registry data; what a space does is
 * here. Every transform returns a {@link TransformResult}, and the gate turns a
 * refusal into a reported skip; the invariant behind that is that the engine never writes a
 * non-finite value. `throw` is reserved for programmer errors (an unknown space tag).
 *
 * Closed forms, not `exp`/`log` round trips: `μ·(x/μ)^s` rather than
 * `μ·exp(s·(ln x − ln μ))`, since the round trip is not the identity in doubles even at the
 * fixed points (`μ·(48/μ)¹ = 47.99999999999999`) and `0 · T(x)` is `0·∞ = NaN` at the boundary
 * values the design declares admissible. `Math.pow` rather than `**` throughout, following the
 * rendering math this is compared against (`RubatoMap.computeRubatoTransformation`).
 *
 * Refusal is a boundary phenomenon, not a rounding complaint: a result landing on an exact
 * bound has left the open domain the renderer needs, as `meanTempoAt` at exactly 1.0 turns a
 * transition into a constant tempo at the other endpoint.
 */

import { err, ok, type Err, type Ok, type Result } from '../prelude/result.js';
import { head, isNonEmpty } from '../prelude/seq.js';

/**
 * Why a transform declined to produce a value. Three reasons, closed:
 *
 * - `out-of-domain-input` — the value, the factor, or a space parameter (a center, an
 *   interval bound, the minimum rubato window) is outside its admissible domain, or is
 *   non-finite. Such a value is skipped and reported, never repaired.
 * - `saturation-to-boundary` — the result is mathematically interior but rounds to an
 *   exact bound of the space in doubles (the "cliff").
 * - `non-finite-result` — the closed form overflowed; the last line of the never-write-a-NaN
 *   invariant, not an expected outcome.
 */
export type TransformRefusalReason =
  'out-of-domain-input' | 'saturation-to-boundary' | 'non-finite-result';

/**
 * A transformed value, or a refusal carrying its reason. Never a thrown exception. Aliases over
 * the prelude's `Result`, so a refusal threads through `mapOk`, `andThen`, `traverse` and
 * `collect`; the failure field is spelled `error`.
 */
export type Transformed<T> = Ok<T>;
export type Refused = Err<TransformRefusalReason>;
export type TransformResult<T = number> = Result<T, TransformRefusalReason>;

/** Local names for the prelude's constructors — "refused" is the word used throughout here. */
const transformed = ok;
const refused = err;

/**
 * `s = 1` is the identity by contract, not by arithmetic. The
 * dimension-level short-circuit is the primary guarantee; this is the defensive one.
 */
const IDENTITY_FACTOR = 1;

/**
 * `s = 0` is admissible in every space and means "write the neutral",
 * implemented as a branch precisely because `0 · T(x)` is `NaN` where `T(x)` is infinite.
 */
const NEUTRALIZING_FACTOR = 0;

/** `T = ln x` puts the neutral of a pure ratio gain at 1. */
const LOG_AROUND_ONE_NEUTRAL = 1;

/** `T = identity` puts the neutral of a signed offset at 0. */
const GAIN_NEUTRAL = 0;

/**
 * The infimum of `ℝ>0`, the domain of both log spaces. Not an admissible input (the
 * reject tempo 0 and intensity 0), and the one finite value an output can underflow to —
 * hence also their saturation bound.
 */
const POSITIVE_DOMAIN_INFIMUM = 0;

/**
 * Boundary-power lives on the closed unit interval. The table gives `T`'s natural domain
 * as `[0,1)` / `(0,1]`, but the far bound is an admissible fixed point
 * reached "by the closed form, not `0·∞`" — `curvature = 1` is a real authored value, and the
 * closed form is total on `[0,1]`.
 */
const BOUNDARY_POWER_LOWER = 0;
const BOUNDARY_POWER_UPPER = 1;

/** The rubato window that applies no trim at all: `lateStart = 0`, `earlyEnd = 1`. */
const RUBATO_NEUTRAL_LATE_START = 0;
const RUBATO_NEUTRAL_EARLY_END = 1;

/**
 * The admissible-`s` domain of a scale space. A dimension's domain is the
 * intersection over its registry rows, and a factor outside it is an `InvalidOptionError` raised
 * by the facade before anything is parsed — not a clamp. `non-negative` is a mathematical
 * constraint: boundary-power's `T` ranges over a half-line, so `s < 0` leaves it and P3 (domain
 * closure) fails outright; for ordered gains `s < 0` would invert the pair.
 */
export type FactorDomain = 'real' | 'non-negative';

/** A scale space with its parameters bound — registry data the transforms consume. */
export type ScaleSpace =
  | { readonly kind: 'log-around-center'; readonly center: number }
  | { readonly kind: 'log-around-1' }
  | { readonly kind: 'logit'; readonly lower: number; readonly upper: number }
  | { readonly kind: 'boundary-power-low' }
  | { readonly kind: 'boundary-power-high' }
  | { readonly kind: 'gain' }
  | { readonly kind: 'gain-ordered' };

/** Every scale space by tag, plus `joint-trim` — a pair transform, not a scalar space. */
export type ScaleSpaceTag = ScaleSpace['kind'] | 'joint-trim';

/**
 * The s-domain of every scale space. `joint-trim` inherits
 * boundary-power's `s ≥ 0` because it is a boundary-power(low) transform of the total trim.
 */
export const SCALE_SPACE_FACTOR_DOMAINS: Readonly<Record<ScaleSpaceTag, FactorDomain>> = {
  'log-around-center': 'real',
  'log-around-1': 'real',
  logit: 'real',
  'boundary-power-low': 'non-negative',
  'boundary-power-high': 'non-negative',
  gain: 'real',
  'gain-ordered': 'non-negative',
  'joint-trim': 'non-negative',
};

function satisfiesFactorDomain(domain: FactorDomain, s: number): boolean {
  if (!Number.isFinite(s)) return false;
  return domain === 'real' || s >= NEUTRALIZING_FACTOR;
}

/** Whether `s` is admissible in the named space; a non-finite `s` never is. */
export function isAdmissibleFactor(tag: ScaleSpaceTag, s: number): boolean {
  return satisfiesFactorDomain(SCALE_SPACE_FACTOR_DOMAINS[tag], s);
}

/**
 * One scalar scale space, reduced to what the shared engine needs. Built per call because
 * `log-around-center` and `logit` carry parameters.
 */
interface ScalarSpace {
  readonly factorDomain: FactorDomain;
  /** The value at which the *renderer* becomes the identity (the `neutral`). */
  readonly neutral: number;
  readonly contains: (x: number) => boolean;
  /**
   * Result values meaning "the transform has left the domain the renderer needs". Empty for
   * gain, whose range is all of ℝ and whose 0 is an interior neutral.
   */
  readonly saturationBounds: readonly number[];
  readonly closedForm: (x: number, s: number) => number;
}

/**
 * The read→validate→transform→validate pipeline, at value level. Order is
 * load-bearing: domain checks first, so a refused input can never be returned as a success by
 * the `s = 1` branch; then the `s = 1` and `s = 0` branches, so neither depends on arithmetic
 * that is inexact or undefined; finiteness and saturation last, on the result.
 */
function applyScalar(space: ScalarSpace, x: number, s: number): TransformResult {
  if (!satisfiesFactorDomain(space.factorDomain, s)) return refused('out-of-domain-input');
  if (!Number.isFinite(x) || !space.contains(x)) return refused('out-of-domain-input');
  if (s === IDENTITY_FACTOR) return transformed(x);
  if (s === NEUTRALIZING_FACTOR) return transformed(space.neutral);

  const computed = space.closedForm(x, s);
  if (!Number.isFinite(computed)) return refused('non-finite-result');
  // IEEE signed zero: `s · 0` is `-0` for every negative s, and `Object.is(-0, 0)` is false,
  // so an unnormalized gain would miss its own neutral at P4. Every neutral and every bound
  // in these spaces is `+0`, so the sign carries nothing.
  const result = computed === 0 ? 0 : computed;
  for (const bound of space.saturationBounds) {
    // An input already on the bound is a fixed point, not a cliff (the design admits `curvature = 1`
    // and `protraction = ±1`); saturation is an interior value rounded onto a bound.
    if (result === bound && x !== bound) return refused('saturation-to-boundary');
  }
  return transformed(result);
}

function logAroundCenterSpace(center: number): ScalarSpace {
  return {
    factorDomain: SCALE_SPACE_FACTOR_DOMAINS['log-around-center'],
    neutral: center,
    contains: (x) => x > POSITIVE_DOMAIN_INFIMUM,
    saturationBounds: [POSITIVE_DOMAIN_INFIMUM],
    // `μ·(x/μ)^s`, not `x^s·μ^(1−s)`: the base stays near 1 for values near the center,
    // and `x === μ` gives `μ·1^s = μ` exactly, so P4 is bit-exact rather than approximate.
    closedForm: (x, s) => center * Math.pow(x / center, s),
  };
}

/**
 * Level values around a performance-wide center: `x' = μ·(x/μ)^s`. `center`
 * is {@link geometricMean} of the population the run will transform, or the caller's
 * `options.center`, in quarter-note-normalized space for tempo (`bpm·beatLength·4`) —
 * which this function neither knows nor checks.
 *
 * Domain: `x > 0`, `center > 0`, `s ∈ ℝ`. Refuses a result that underflows to 0.
 */
export function logAroundCenter(x: number, s: number, center: number): TransformResult {
  if (!Number.isFinite(center) || center <= POSITIVE_DOMAIN_INFIMUM) {
    return refused('out-of-domain-input');
  }
  return applyScalar(logAroundCenterSpace(center), x, s);
}

const LOG_AROUND_ONE_SPACE: ScalarSpace = {
  factorDomain: SCALE_SPACE_FACTOR_DOMAINS['log-around-1'],
  neutral: LOG_AROUND_ONE_NEUTRAL,
  contains: (x) => x > POSITIVE_DOMAIN_INFIMUM,
  saturationBounds: [POSITIVE_DOMAIN_INFIMUM],
  closedForm: (x, s) => Math.pow(x, s),
};

/**
 * Pure ratio gains: `x' = x^s`, neutral 1. Rubato intensity, ornament spacing
 * intensity, relative articulation factors. Domain `x > 0`, `s ∈ ℝ`; the gate rejects `x ≤ 0`
 * rather than repairing it, which is why the ornament-intensity epsilon floor was dropped — this
 * space cannot produce a non-positive result from a positive input.
 */
export function logAroundOne(x: number, s: number): TransformResult {
  return applyScalar(LOG_AROUND_ONE_SPACE, x, s);
}

/** The interior neutral of `logit(a,b)`, written the one way the transform and its callers
 *  must agree on: `a + (b−a)/2` reproduces `(a+b)/2` exactly for the registry's two intervals,
 *  (0,1) and (−1,1), and stays inside `[a,b]` for any other. */
function logitNeutral(lower: number, upper: number): number {
  return lower + (upper - lower) / 2;
}

function logitSpace(lower: number, upper: number): ScalarSpace {
  return {
    factorDomain: SCALE_SPACE_FACTOR_DOMAINS.logit,
    neutral: logitNeutral(lower, upper),
    contains: (x) => x >= lower && x <= upper,
    saturationBounds: [lower, upper],
    // `a + (b−a)/(1 + ((b−x)/(x−a))^s)`, the reciprocal arrangement of `T⁻¹`. Written the
    // other way round — `a + (b−a)·u^s/(1+u^s)` with `u = (x−a)/(b−x)` — it is `∞/∞ = NaN`
    // at `x = b`, which the admissible `protraction = 1` reaches by construction.
    closedForm: (x, s) => lower + (upper - lower) / (1 + Math.pow((upper - x) / (x - lower), s)),
  };
}

/**
 * Bounded proportions with an interior neutral: `meanTempoAt` on (0,1), `protraction` on (−1,1).
 *
 * Domain: the closed `[lower, upper]`, because `protraction = ±1` is admissible
 * boundary fixed points reached through the closed form; a narrower predicate — `meanTempoAt`
 * is open (0,1) per is enforced in the registry's gate, not here. `s ∈ ℝ`, and the range
 * is `[lower, upper]` for every real `s`, so P3 holds unconditionally. A result that rounds onto
 * an exact bound is refused: the measured cliff, reproduced exactly — `x = 0.99`
 * saturates at `s = 8`, `x = 0.9` at `s = 17`.
 */
export function logit(x: number, s: number, lower: number, upper: number): TransformResult {
  if (!Number.isFinite(lower) || !Number.isFinite(upper) || !(lower < upper)) {
    return refused('out-of-domain-input');
  }
  return applyScalar(logitSpace(lower, upper), x, s);
}

const BOUNDARY_POWER_LOW_SPACE: ScalarSpace = {
  factorDomain: SCALE_SPACE_FACTOR_DOMAINS['boundary-power-low'],
  neutral: BOUNDARY_POWER_LOWER,
  contains: (x) => x >= BOUNDARY_POWER_LOWER && x <= BOUNDARY_POWER_UPPER,
  saturationBounds: [BOUNDARY_POWER_LOWER, BOUNDARY_POWER_UPPER],
  closedForm: (x, s) => 1 - Math.pow(1 - x, s),
};

/**
 * Proportions whose neutral is the lower bound: `x' = 1 − (1−x)^s`. Dynamics and
 * pedal curvature, and the rubato window's total trim.
 *
 * Domain `[0,1]`, `s ≥ 0`: `T`'s range is the half-line `(−∞,0]`, so `s < 0` leaves it and the
 * result leaves `[0,1]`. The saturation refusal: once `(1−x)^s < 2⁻⁵⁴`, `1 − (1−x)^s` rounds
 * to exactly 1.0 — measured at `x = 0.9, s = 17` — and a curvature or trim of exactly 1 is a
 * renderer cliff, not an extreme setting.
 */
export function boundaryPowerLow(x: number, s: number): TransformResult {
  return applyScalar(BOUNDARY_POWER_LOW_SPACE, x, s);
}

const BOUNDARY_POWER_HIGH_SPACE: ScalarSpace = {
  factorDomain: SCALE_SPACE_FACTOR_DOMAINS['boundary-power-high'],
  neutral: BOUNDARY_POWER_UPPER,
  contains: (x) => x >= BOUNDARY_POWER_LOWER && x <= BOUNDARY_POWER_UPPER,
  saturationBounds: [BOUNDARY_POWER_LOWER, BOUNDARY_POWER_UPPER],
  closedForm: (x, s) => Math.pow(x, s),
};

/**
 * Proportions whose neutral is the upper bound: `x' = x^s`, neutral 1. No registry
 * row uses it standalone, since `earlyEnd`, its only candidate, is half of the joint trim.
 * Domain `[0,1]`, `s ≥ 0`, symmetric with {@link boundaryPowerLow} including the
 * far-bound fixed point at `x = 0`.
 */
export function boundaryPowerHigh(x: number, s: number): TransformResult {
  return applyScalar(BOUNDARY_POWER_HIGH_SPACE, x, s);
}

const GAIN_SPACE: ScalarSpace = {
  factorDomain: SCALE_SPACE_FACTOR_DOMAINS.gain,
  neutral: GAIN_NEUTRAL,
  contains: Number.isFinite,
  saturationBounds: [],
  closedForm: (x, s) => s * x,
};

const ORDERED_GAIN_SPACE: ScalarSpace = {
  ...GAIN_SPACE,
  factorDomain: SCALE_SPACE_FACTOR_DOMAINS['gain-ordered'],
};

/**
 * Signed offsets: `x' = s·x`, neutral 0. Asynchrony milliseconds, ornament
 * gradient endpoints, absolute articulation deltas. Domain ℝ, `s ∈ ℝ`; no saturation bound,
 * since 0 is this space's interior neutral rather than an escape from the domain, so a result
 * of 0 is written, not refused.
 */
export function gain(x: number, s: number): TransformResult {
  return applyScalar(GAIN_SPACE, x, s);
}

/**
 * {@link gain} restricted to `s ≥ 0` — the stricter s-domain that attaches to gains which
 * carry an ordering or sign constraint: imprecision limit pairs (where `s < 0` inverts
 * every lower/upper pair), `frameLength` (where a negative value collapses the spread to
 * a point instead of reversing it), and `accentuationPattern@scale` (where `s < 0`
 * inverts the accent contour).
 */
export function orderedGain(x: number, s: number): TransformResult {
  return applyScalar(ORDERED_GAIN_SPACE, x, s);
}

function scalarSpaceOf(space: ScaleSpace): ScalarSpace {
  switch (space.kind) {
    case 'log-around-center':
      return logAroundCenterSpace(space.center);
    case 'log-around-1':
      return LOG_AROUND_ONE_SPACE;
    case 'logit':
      return logitSpace(space.lower, space.upper);
    case 'boundary-power-low':
      return BOUNDARY_POWER_LOW_SPACE;
    case 'boundary-power-high':
      return BOUNDARY_POWER_HIGH_SPACE;
    case 'gain':
      return GAIN_SPACE;
    case 'gain-ordered':
      return ORDERED_GAIN_SPACE;
    default: {
      // A registry row naming a space this module does not implement: a programmer error,
      // which cannot be reported to a caller as data the way a value-level refusal is.
      const unhandled: never = space;
      throw new Error(`unknown scale space: ${JSON.stringify(unhandled)}`);
    }
  }
}

/**
 * Apply a registry-supplied scale space — the dispatch the applier walks. Throws on an unknown
 * space tag (a programmer error); every value-level problem is a refusal.
 */
export function transformInSpace(space: ScaleSpace, x: number, s: number): TransformResult {
  return applyScalar(scalarSpaceOf(space), x, s);
}

/** The value at which the renderer becomes the identity — what `s = 0` writes. */
export function neutralOf(space: ScaleSpace): number {
  return scalarSpaceOf(space).neutral;
}

/**
 * The space's own value domain: the widest set on which its closed form is total and
 * domain-closed. A registry row may narrow it (the open (0,1) for `meanTempoAt`); it may
 * not widen it.
 */
export function isInValueDomain(space: ScaleSpace, x: number): boolean {
  const scalar = scalarSpaceOf(space);
  return Number.isFinite(x) && scalar.contains(x);
}

// --- The forward maps themselves -------------------------------
//
// Everything above composes `T` with `T⁻¹` and never exposes the bijection in between. A
// *distance* needs the bijection alone: the local metric is
// `d_row(x,y) = min(|T(x) − T(y)| / jnd_row, 2·δ_row)`. Sole consumer: `src/comparison/**`.
// They live beside the closed forms they are property-tested against.
//
// This block is the one place in this module that returns a non-finite number on legal input:
// the invariant above is about what the engine *writes*, and nothing here writes. `T` is
// genuinely infinite at the boundary fixed points the design declares admissible, and comparison
// prices that with the cap above. So the boundaries return ±Infinity and the caller caps:
// `boundary-power-low` at `x = 1`, `boundary-power-high` and the logarithms at `x = 0`,
// `logit` at both bounds.
//
// These maps do not gate their input; the gate is the registry row's own predicate
// (comparison the `valueDomain`), of which `isInValueDomain` is the space-level form. Out of
// domain a log-space map returns `NaN` (`ln` of a negative), which comparison the design makes a typed
// document error rather than a distance, while a boundary-power map returns a finite number
// with no signal at all — which is why the gate runs first.

/**
 * `T = ln x` — the forward map of {@link logAroundOne}, and the one comparison uses for the
 * level spaces too, because the center cancels in every difference
 * (`ln(x/μ) − ln(y/μ) = ln(x/y)`) and dropping it is a correctness requirement: a center is a
 * property of one performance, so two documents bring two centers and `|T_A(x) − T_B(y)|`
 * would not be symmetric under swapping them.
 *
 * `ln 0 = −∞`; `ln x` for `x < 0` is `NaN`.
 */
export function forwardLogAroundOne(x: number): number {
  return Math.log(x);
}

/**
 * `T = ln(x/μ)` — the forward map of {@link logAroundCenter}, center and all. It is what makes
 * `T(C(x,s)) = s·T(x)` true of this space: with the bare logarithm that identity picks up a
 * `(1 − s)·ln μ` term and fails. Comparison uses {@link forwardLogAroundOne} instead, for the
 * reason given there.
 */
export function forwardLogAroundCenter(x: number, center: number): number {
  return Math.log(x / center);
}

/**
 * `T = ln((x − a)/(b − x))` — the forward map of {@link logit}, zero at the interval's
 * midpoint and infinite at both bounds (`meanTempoAt = 0`, `protraction = ±1`).
 */
export function forwardLogit(x: number, lower: number, upper: number): number {
  return Math.log((x - lower) / (upper - x));
}

/**
 * `T = ln(1 − x)` — the forward map of {@link boundaryPowerLow}, zero at the lower bound and
 * `−∞` at `x = 1` (`curvature = 1`, a value the design admits and comparison caps).
 */
export function forwardBoundaryPowerLow(x: number): number {
  return Math.log(1 - x);
}

/**
 * `T = ln x` — the forward map of {@link boundaryPowerHigh}, zero at the upper bound and `−∞`
 * at `x = 0`. Numerically the same expression as {@link forwardLogAroundOne}; a distinct name
 * because it is a different space with a different neutral.
 */
export function forwardBoundaryPowerHigh(x: number): number {
  return Math.log(x);
}

/**
 * `T = x` — the forward map of {@link gain} and {@link orderedGain}, finite everywhere on the
 * space's domain. Asynchrony milliseconds, signed articulation deltas. The identity is what
 * makes a gain row's JND a quantity in the attribute's own unit (ms, velocity) rather than in
 * nepers.
 */
export function forwardGain(x: number): number {
  return x;
}

/**
 * The forward map of a registry-supplied scale space — the `T` of `|T(x) − T(y)|`. Throws on
 * an unknown space tag, as {@link transformInSpace} does and for the same reason.
 */
export function forwardInSpace(space: ScaleSpace, x: number): number {
  switch (space.kind) {
    case 'log-around-center':
      return forwardLogAroundCenter(x, space.center);
    case 'log-around-1':
      return forwardLogAroundOne(x);
    case 'logit':
      return forwardLogit(x, space.lower, space.upper);
    case 'boundary-power-low':
      return forwardBoundaryPowerLow(x);
    case 'boundary-power-high':
      return forwardBoundaryPowerHigh(x);
    case 'gain':
    case 'gain-ordered':
      return forwardGain(x);
    default: {
      const unhandled: never = space;
      throw new Error(`unknown scale space: ${JSON.stringify(unhandled)}`);
    }
  }
}

/** A rubato window: the fraction of the frame that is late-started and early-ended. */
export interface RubatoWindow {
  readonly lateStart: number;
  readonly earlyEnd: number;
}

/**
 * The rubato window's joint trim.
 *
 * `lateStart` and `earlyEnd` are not two independent boundary-power values: given independent
 * maps they cross at the `s` solving `ee^s + (1−ls)^s = 1` — s ≈ 1.36 for a trimmed window —
 * and both renderer paths respond to a crossed pair by silently resetting it to (0,1). So the
 * pair is reparameterized through the total trim
 *
 *     t = lateStart + (1 − earlyEnd)
 *
 * a single boundary-power(low) quantity with neutral 0, transformed and then split back on the
 * preserved ratio `lateStart : (1 − earlyEnd)`. The neutral (0,1) is fixed, `t` composes
 * exactly, and P5 is restored.
 *
 * The guard clamps `t'` to `1 − minWindow` before the split and asserts `ls' < ee'` on the
 * computed pair. Without it the ℝ proof fails in doubles: once `(1−t)^s < 2⁻⁵⁴`, `1 − (1−t)^s`
 * rounds to exactly 1.0, the split returns `a' + b' = 1`, and the renderer's inclusive
 * `lateStart >= earlyEnd` test trips the very cliff the joint trim exists to remove. That makes
 * this the one place saturation is absorbed rather than refused (the rubato row); the only
 * refusal left is the failed assertion, for which the applier raises the typed engine error,
 * because only it knows the site.
 *
 * @param window `0 ≤ lateStart < earlyEnd ≤ 1`, the *effective* window of the site (the
 *   requires def/element inheritance to be resolved before this is called).
 * @param minWindow the caller's `options.minRubatoWindow`, in (0,1). An IEEE saturation guard,
 *   not a musical bound — it defaults to 1e-6.
 */
export function jointTrimWindow(
  window: RubatoWindow,
  s: number,
  minWindow: number,
): TransformResult<RubatoWindow> {
  if (!isAdmissibleFactor('joint-trim', s)) return refused('out-of-domain-input');
  if (!Number.isFinite(minWindow) || minWindow <= 0 || minWindow >= 1) {
    return refused('out-of-domain-input');
  }

  const { lateStart, earlyEnd } = window;
  const inDomain =
    Number.isFinite(lateStart) &&
    Number.isFinite(earlyEnd) &&
    lateStart >= RUBATO_NEUTRAL_LATE_START &&
    earlyEnd <= RUBATO_NEUTRAL_EARLY_END &&
    lateStart < earlyEnd;
  if (!inDomain) return refused('out-of-domain-input');

  if (s === IDENTITY_FACTOR) return transformed(window);
  if (s === NEUTRALIZING_FACTOR) {
    return transformed({
      lateStart: RUBATO_NEUTRAL_LATE_START,
      earlyEnd: RUBATO_NEUTRAL_EARLY_END,
    });
  }

  const headTrim = lateStart - RUBATO_NEUTRAL_LATE_START;
  const tailTrim = RUBATO_NEUTRAL_EARLY_END - earlyEnd;
  const totalTrim = headTrim + tailTrim;
  // The untrimmed window is the neutral configuration and therefore a fixed point. It also
  // has no ratio to preserve — the split would be `0/0` — so it is a branch, not a limit.
  if (totalTrim === NEUTRALIZING_FACTOR) {
    return transformed({
      lateStart: RUBATO_NEUTRAL_LATE_START,
      earlyEnd: RUBATO_NEUTRAL_EARLY_END,
    });
  }

  // Deliberately not `boundaryPowerLow(totalTrim, s)`: that function refuses a result rounding
  // onto an exact bound, and here the clamp is the documented remedy for exactly that
  // case (the rubato row). A saturating `t'` is clamped into the window, not refused.
  // `t ∈ [0,1)` follows from `0 ≤ ls < ee ≤ 1`, so the closed form is finite for every s ≥ 0.
  const rawTrim = 1 - Math.pow(1 - totalTrim, s);
  const guardedTrim = Math.min(rawTrim, RUBATO_NEUTRAL_EARLY_END - minWindow);

  const transformedWindow: RubatoWindow = {
    lateStart: guardedTrim * (headTrim / totalTrim),
    earlyEnd: RUBATO_NEUTRAL_EARLY_END - guardedTrim * (tailTrim / totalTrim),
  };
  if (
    !Number.isFinite(transformedWindow.lateStart) ||
    !Number.isFinite(transformedWindow.earlyEnd)
  ) {
    return refused('non-finite-result');
  }
  // the pre-write assertion, on the computed pair rather than on `t'`: `ls'` and `ee'` are
  // rounded independently, so `t' < 1` does not by itself prove the pair is ordered.
  if (!(transformedWindow.lateStart < transformedWindow.earlyEnd)) {
    return refused('saturation-to-boundary');
  }
  return transformed(transformedWindow);
}

/**
 * The unweighted geometric mean — the center of the `tempo` and `dynamics` level populations.
 *
 * The caller supplies the already-filtered population: the skip set is computed first, and the
 * population is exactly the distinct element sites the run will transform — numeric level
 * attributes counted once each, plus every referenced def `@value` counted once per def element,
 * with `@transition.to` excluded. That set is what makes the center invariant under the
 * transform and P2 exact. Unweighted, because duration- and span-weighting both need a rule for
 * the last instruction's span that the MPM alone cannot supply.
 *
 * Refuses an empty population (a map whose levels are all unresolvable names has no center — the
 * caller reports the dimension inert) and any non-positive or non-finite member. Two exactness
 * branches, because `Math.exp(Math.log(48))` is 47.999999999999986 and a center off by an ULP
 * moves every value the run writes: a single-element population is its own center, and an
 * all-equal population is that value.
 */
export function geometricMean(values: readonly number[]): TransformResult {
  if (!isNonEmpty(values)) return refused('out-of-domain-input');

  let logSum = 0;
  let allEqual = true;
  const first = head(values);
  for (const value of values) {
    if (!Number.isFinite(value) || value <= POSITIVE_DOMAIN_INFIMUM) {
      return refused('out-of-domain-input');
    }
    if (value !== first) allEqual = false;
    logSum += Math.log(value);
  }
  if (allEqual) return transformed(first);

  const mean = Math.exp(logSum / values.length);
  if (!Number.isFinite(mean)) return refused('non-finite-result');
  if (mean === POSITIVE_DOMAIN_INFIMUM) return refused('saturation-to-boundary');
  return transformed(mean);
}
