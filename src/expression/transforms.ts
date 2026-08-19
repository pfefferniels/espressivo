/**
 * The scale spaces of the expression-transform engine (docs/history/expression/DESIGN.md §1).
 *
 * Every exaggerable MPM attribute has a monotone bijection `T : D → ℝ` from its musical
 * domain with `T(neutral) = 0`, and the whole engine is one formula in different `T`s:
 *
 *     x' = T⁻¹( s · T(x) )
 *
 * This module is that formula and nothing else — pure functions of numbers, no XML, no
 * DOM, no I/O, no knowledge of which attribute a value came from. Which space an attribute
 * lives in is registry data (DESIGN §7); *what a space does* is here.
 *
 * **Total, never throwing for value-level problems.** Every transform returns a
 * {@link TransformResult}: a value, or a principled refusal. A refusal is not an error
 * path to be swallowed — DESIGN §1.2's validation gate turns it into a reported skip, and
 * the global invariant it protects is that **the engine never writes a non-finite value**.
 * `throw` is reserved for programmer errors (an unknown space tag), never for data.
 *
 * **Closed forms, not `exp`/`log` round trips** (DESIGN §1). `μ·(x/μ)^s` rather than
 * `μ·exp(s·(ln x − ln μ))`: the round trip is not the identity in doubles even at the
 * fixed points, and `0 · T(x)` is `0·∞ = NaN` at the boundary values §7.5 declares
 * admissible (`curvature = 1`, `protraction = ±1`). So `s = 0` is a **branch** that writes
 * the neutral, and `s = 1` is a **branch** that returns the input bit for bit (A2) — the
 * arithmetic gets neither right on its own (`μ·(48/μ)¹ = 47.99999999999999`).
 *
 * **Refusal is a boundary phenomenon, not a rounding complaint** (A3). A logit or
 * boundary-power result that lands on an *exact* bound has left the open domain the
 * renderer needs: `meanTempoAt` reaching exactly 1.0 turns a transition into a constant
 * tempo at the other endpoint, and a rubato window reaching exactly 1 trips the renderer's
 * inclusive `lateStart >= earlyEnd` reset. Those results are refused, not written, not
 * repaired.
 *
 * `Math.pow` rather than `**` throughout, following the house convention of the rendering
 * math it will be compared against (`RubatoMap.computeRubatoTransformation`).
 */

import { err, ok, type Err, type Ok, type Result } from '../prelude/result.js';

/**
 * Why a transform declined to produce a value. Three reasons, closed:
 *
 * - `out-of-domain-input` — the value, the factor, or a space parameter (a center, an
 *   interval bound, the minimum rubato window) is outside its admissible domain, or is
 *   non-finite. DESIGN §1.2: such a value is skipped and reported, never repaired.
 * - `saturation-to-boundary` — the result is mathematically interior but rounds to an
 *   exact bound of the space in doubles (A3's "cliff").
 * - `non-finite-result` — the closed form overflowed. Reaching this is the last line of
 *   the never-write-a-NaN invariant, not an expected outcome.
 */
export type TransformRefusalReason =
  'out-of-domain-input' | 'saturation-to-boundary' | 'non-finite-result';

/**
 * A transformed value, or a refusal carrying its reason. Never a thrown exception.
 *
 * This module arrived at `{ ok: true, value } | { ok: false, … }` independently, before
 * `src/prelude/result.ts` existed, and the prelude then adopted that shape wholesale. These
 * three names are now aliases over it rather than a parallel type — so `mapOk`, `andThen`,
 * `traverse` and `collect` work on a `TransformResult`, and a refusal can be threaded through
 * a pipeline instead of being unpacked by hand at every step.
 *
 * The one spelling that changed is the failure field: `reason` became `error`, because the
 * prelude has to name it something that reads correctly for a parse failure and a validation
 * failure too. `TransformRefusalReason` still says what it is.
 */
export type Transformed<T> = Ok<T>;
export type Refused = Err<TransformRefusalReason>;
export type TransformResult<T = number> = Result<T, TransformRefusalReason>;

/**
 * Local names for the prelude's constructors, kept because this file says `refused(...)`
 * sixteen times and `refused` is the word its documentation uses throughout.
 */
const transformed = ok;
const refused = err;

/**
 * `s = 1` is the identity **by contract**, not by arithmetic (DESIGN §1.1, A2). The
 * dimension-level short-circuit is the primary guarantee; this is the defensive one.
 */
const IDENTITY_FACTOR = 1;

/**
 * `s = 0` is admissible in every space and means "write the neutral" (DESIGN §1, A3),
 * implemented as a branch precisely because `0 · T(x)` is `NaN` where `T(x)` is infinite.
 */
const NEUTRALIZING_FACTOR = 0;

/** `T = ln x` puts the neutral of a pure ratio gain at 1 (DESIGN §1). */
const LOG_AROUND_ONE_NEUTRAL = 1;

/** `T = identity` puts the neutral of a signed offset at 0 (DESIGN §1). */
const GAIN_NEUTRAL = 0;

/**
 * The infimum of `ℝ>0`, the domain of both log spaces. It is not an admissible *input*
 * (tempo 0 and intensity 0 are the degeneracies §7.2/§7.6 reject), and it is the one
 * finite value an output can underflow to, which is why it doubles as their saturation
 * bound.
 */
const POSITIVE_DOMAIN_INFIMUM = 0;

/**
 * Boundary-power lives on the closed unit interval. DESIGN §1's table gives `T`'s natural
 * domain as `[0,1)` / `(0,1]`, but §7.5 and §7.14 declare the far bound an **admissible
 * fixed point** reached "by the closed form, not `0·∞`" — `curvature = 1` is a real
 * authored value. The closed form is total on `[0,1]`, so the domain is closed at both
 * ends and the far bound is a fixed point rather than a refusal.
 */
const BOUNDARY_POWER_LOWER = 0;
const BOUNDARY_POWER_UPPER = 1;

/** The rubato window that applies no trim at all: `lateStart = 0`, `earlyEnd = 1` (§7.6). */
const RUBATO_NEUTRAL_LATE_START = 0;
const RUBATO_NEUTRAL_EARLY_END = 1;

/**
 * The admissible-`s` domain of a scale space (DESIGN §1, A3). This is **data, not prose**:
 * a dimension's domain is the intersection over its registry rows, and a factor outside it
 * is an `InvalidOptionError` raised by the facade before anything is parsed — not a clamp.
 *
 * `non-negative` is mathematics, not taste. Boundary-power's `T` ranges over a half-line,
 * so `s < 0` leaves it and P3 (domain closure) fails outright; ordered gains (imprecision
 * limit pairs, frame lengths, accentuation) would have `s < 0` invert the pair.
 */
export type FactorDomain = 'real' | 'non-negative';

/**
 * A scale space with its parameters bound. The registry supplies these; the transforms
 * consume them.
 */
export type ScaleSpace =
  | { readonly kind: 'log-around-center'; readonly center: number }
  | { readonly kind: 'log-around-1' }
  | { readonly kind: 'logit'; readonly lower: number; readonly upper: number }
  | { readonly kind: 'boundary-power-low' }
  | { readonly kind: 'boundary-power-high' }
  | { readonly kind: 'gain' }
  | { readonly kind: 'gain-ordered' };

/**
 * Every scale space by tag, including the rubato window's joint-trim pair transform
 * (§7.6), which is not a scalar space and therefore not a {@link ScaleSpace}.
 */
export type ScaleSpaceTag = ScaleSpace['kind'] | 'joint-trim';

/**
 * The s-domain of every scale space (DESIGN §1's table, A3).
 *
 * `joint-trim` inherits boundary-power's `s ≥ 0` because it *is* a boundary-power(low)
 * transform of the total trim `t`.
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

/**
 * Whether `s` is admissible in the named space. A non-finite `s` never is, in any space
 * (R3/A11: non-finite factors are an `InvalidOptionError`).
 */
export function isAdmissibleFactor(tag: ScaleSpaceTag, s: number): boolean {
  return satisfiesFactorDomain(SCALE_SPACE_FACTOR_DOMAINS[tag], s);
}

/**
 * One scalar scale space, reduced to the four things the shared engine needs. Built per
 * call because `log-around-center` and `logit` carry parameters.
 */
interface ScalarSpace {
  readonly factorDomain: FactorDomain;
  /** The value at which the *renderer* becomes the identity (DESIGN §7's `neutral`). */
  readonly neutral: number;
  readonly contains: (x: number) => boolean;
  /**
   * Result values that mean "the transform has left the domain the renderer needs".
   * Empty for gain, whose range is all of ℝ and whose 0 is an interior neutral.
   */
  readonly saturationBounds: readonly number[];
  readonly closedForm: (x: number, s: number) => number;
}

/**
 * The read→validate→transform→validate pipeline of DESIGN §1.2, at value level.
 *
 * Order is load-bearing. The domain checks come **first**, so a refused input can never be
 * returned as a success by the `s = 1` branch; the `s = 1` and `s = 0` branches come next,
 * so neither depends on arithmetic that is inexact (`s = 1`) or undefined (`s = 0` at an
 * infinite `T`); the finiteness and saturation checks come last, on the result.
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
    // An input that already sits on the bound is a fixed point, not a cliff: §7.5 admits
    // `curvature = 1` and `protraction = ±1` as exactly that. Saturation is an *interior*
    // value being rounded onto a bound it did not start on.
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
 * Level values around a performance-wide center: `x' = μ·(x/μ)^s` (DESIGN §1, §7.1).
 *
 * `center` is the geometric mean of the population the run will transform — see
 * {@link geometricMean} — or the caller's `options.center`. Tempo centers are in
 * quarter-note-normalized space (`bpm·beatLength·4`, §7.2); this function neither knows
 * nor checks that.
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
 * Pure ratio gains: `x' = x^s`, neutral 1 (DESIGN §1). Rubato intensity, ornament spacing
 * intensity, relative articulation factors.
 *
 * Domain: `x > 0`, `s ∈ ℝ`. The gate rejects `x ≤ 0` rather than repairing it, which is
 * what let A4 drop the ornament-intensity epsilon floor: this space cannot produce a
 * non-positive result from a positive input, so the floor could only ever have edited a
 * value the caller never asked to change.
 */
export function logAroundOne(x: number, s: number): TransformResult {
  return applyScalar(LOG_AROUND_ONE_SPACE, x, s);
}

/** The interior neutral of `logit(a,b)`, written the one way both the transform and its
 *  callers must agree on: `a + (b−a)/2` reproduces `(a+b)/2` exactly for the registry's
 *  two intervals, (0,1) and (−1,1), and stays inside `[a,b]` for any other. */
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
    // at `x = b`, which §7.5's admissible `protraction = 1` reaches by construction.
    closedForm: (x, s) => lower + (upper - lower) / (1 + Math.pow((upper - x) / (x - lower), s)),
  };
}

/**
 * Bounded proportions with an interior neutral: `meanTempoAt` on (0,1), `protraction` on
 * (−1,1) (DESIGN §1, D-D).
 *
 * Domain: the **closed** `[lower, upper]`, because §7.5/§7.14 declare `protraction = ±1`
 * admissible boundary fixed points reached through the closed form. A row whose input
 * predicate is narrower — `meanTempoAt` is open (0,1) per §7.3 — enforces that in the
 * registry's gate, not here.
 *
 * `s ∈ ℝ`; the range is `[lower, upper]` for every real `s`, so P3 holds unconditionally.
 * A result that rounds onto an exact bound is refused (A3): this is the cliff §7.3
 * measured, and it is reproduced exactly — `x = 0.99` saturates at `s = 8`, `x = 0.9` at
 * `s = 17`.
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
 * Proportions whose neutral is the lower bound: `x' = 1 − (1−x)^s` (DESIGN §1).
 * Dynamics and pedal curvature (§7.5, §7.14), and the rubato window's total trim (§7.6).
 *
 * Domain `[0,1]`, `s ≥ 0` — not a preference: `T`'s range is the half-line `(−∞,0]`, so
 * `s < 0` leaves it and the result leaves `[0,1]`.
 *
 * The saturation refusal is the one A6 restored. Once `(1−x)^s < 2⁻⁵⁴`, `1 − (1−x)^s`
 * rounds to exactly 1.0 — measurably, at `x = 0.9, s = 17` — and a curvature or trim of
 * exactly 1 is a renderer cliff, not an extreme setting.
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
 * Proportions whose neutral is the upper bound: `x' = x^s`, neutral 1 (DESIGN §1).
 *
 * Retained for completeness — no registry row uses it standalone, since `earlyEnd`, its
 * only candidate, is half of the joint trim (§7.6). Domain `[0,1]`, `s ≥ 0`, symmetric
 * with {@link boundaryPowerLow} including the far-bound fixed point at `x = 0`.
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
 * Signed offsets: `x' = s·x`, neutral 0 (DESIGN §1, D-E). Asynchrony milliseconds,
 * ornament gradient endpoints, absolute articulation deltas.
 *
 * Domain ℝ, `s ∈ ℝ`. No saturation bound: 0 is this space's interior neutral, not an
 * escape from the domain, so a result of 0 is written, not refused.
 */
export function gain(x: number, s: number): TransformResult {
  return applyScalar(GAIN_SPACE, x, s);
}

/**
 * {@link gain} restricted to `s ≥ 0` — the same arithmetic under the stricter s-domain
 * DESIGN §1 attaches to gains that carry an ordering or sign constraint: imprecision limit
 * pairs (§7.13, where `s < 0` inverts every lower/upper pair), `frameLength` (§7.9, where a
 * negative value collapses the spread to a point instead of reversing it), and
 * `accentuationPattern@scale` (§7.8, where `s < 0` inverts the accent contour — a musical
 * inversion, not an exaggeration).
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
      // A programmer error — a registry row naming a space this module does not implement.
      // Value-level problems refuse; this one cannot be reported to a caller as data.
      const unhandled: never = space;
      throw new Error(`unknown scale space: ${JSON.stringify(unhandled)}`);
    }
  }
}

/**
 * Apply a registry-supplied scale space. The per-space functions above are the same
 * transforms with their parameters spelled out; this is the dispatch the applier walks.
 *
 * Throws on an unknown space tag (a programmer error). Every value-level problem is a
 * refusal.
 */
export function transformInSpace(space: ScaleSpace, x: number, s: number): TransformResult {
  return applyScalar(scalarSpaceOf(space), x, s);
}

/** The value at which the renderer becomes the identity — what `s = 0` writes (A3). */
export function neutralOf(space: ScaleSpace): number {
  return scalarSpaceOf(space).neutral;
}

/**
 * The space's own value domain: the widest set on which its closed form is total and
 * domain-closed. A registry row may narrow it (§7.3's open (0,1) for `meanTempoAt`); it may
 * not widen it.
 */
export function isInValueDomain(space: ScaleSpace, x: number): boolean {
  const scalar = scalarSpaceOf(space);
  return Number.isFinite(x) && scalar.contains(x);
}

// --- The forward maps themselves (comparison/DESIGN.md §4) -------------------------------
//
// Everything above composes `T` with `T⁻¹` and never exposes the bijection in between. A
// *distance* needs the bijection alone: comparison/DESIGN.md §4's local metric is
// `d_row(x,y) = min(|T(x) − T(y)| / jnd_row, 2·δ_row)`, and `T` is the only part of it this
// module owns. These exports live here — their sole consumer is `src/comparison/**` —
// because they must sit beside the closed forms they are property-tested against
// (comparison §4/§9.7, A24): `T(C(x,s)) = s·T(x)` is the statement that a forward map and a
// closed form are the same space, and it is checked over both in one file.
//
// **This block is the one place in this module that returns a non-finite number on legal
// input, and deliberately so.** The invariant above is that the engine never *writes* a
// non-finite value; nothing here writes anything. `T` is genuinely infinite at the boundary
// fixed points §7.5 declares admissible — `curvature = 1`, `protraction = ±1`, a volume of
// 0 — and comparison §4 prices that with the cap above, which is registry data the caller
// holds and this module does not. So the boundaries return ±Infinity and **the caller
// caps**. Enumerated there and reproduced here so no reader has to derive them:
// `boundary-power-low` at `x = 1`, `boundary-power-high` and the logarithms at `x = 0`,
// `logit` at both bounds.
//
// **These maps do not gate their input.** A refusal is a decision about a value, and the
// decision belongs to the registry row's own predicate (comparison §4's `valueDomain`), not
// to the map; {@link isInValueDomain} is the space-level form of the same gate. Out of
// domain, a log-space map returns `NaN` (`ln` of a negative) — comparison §4's one case the
// cap cannot rescue, a typed document error there rather than a distance — while a
// boundary-power map returns a finite number with no signal at all, which is precisely why
// the gate runs first.

/**
 * `T = ln x` — the forward map of {@link logAroundOne}, and the one comparison uses for the
 * level spaces too (comparison §4).
 *
 * `log-around-center`'s own map is {@link forwardLogAroundCenter}, but the center cancels in
 * every *difference* — `ln(x/μ) − ln(y/μ) = ln(x/y)` — so the two induce the same metric and
 * comparison drops the center rather than carrying it. That is not a simplification but a
 * correctness requirement: the center is a property of one performance (§7.1's geometric
 * mean over that document's population), so two documents bring two centers and
 * `|T_A(x) − T_B(y)|` would not be symmetric under swapping them.
 *
 * `ln 0 = −∞`; `ln x` for `x < 0` is `NaN`.
 */
export function forwardLogAroundOne(x: number): number {
  return Math.log(x);
}

/**
 * `T = ln(x/μ)` — the forward map of {@link logAroundCenter}, center and all.
 *
 * Exported for completeness of the space table and because it is what makes
 * `T(C(x,s)) = s·T(x)` true of this space: with the bare logarithm that identity picks up a
 * `(1 − s)·ln μ` term and fails. Comparison uses {@link forwardLogAroundOne} instead, for
 * the reason given there.
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
 * `−∞` at `x = 1` (`curvature = 1`, a value §7.5 admits and comparison §4 caps).
 */
export function forwardBoundaryPowerLow(x: number): number {
  return Math.log(1 - x);
}

/**
 * `T = ln x` — the forward map of {@link boundaryPowerHigh}, zero at the upper bound and
 * `−∞` at `x = 0`. Numerically the same expression as {@link forwardLogAroundOne}; a
 * distinct name because it is a different space with a different neutral, and a reader
 * checking one against its closed form should not have to notice the coincidence.
 */
export function forwardBoundaryPowerHigh(x: number): number {
  return Math.log(x);
}

/**
 * `T = x` — the forward map of {@link gain} and {@link orderedGain}, finite everywhere on
 * the space's domain. Asynchrony milliseconds, signed articulation deltas.
 *
 * The identity is a real entry in this table, not a placeholder: it is what makes a gain
 * row's JND a quantity in the attribute's own unit (ms, velocity) rather than in nepers.
 */
export function forwardGain(x: number): number {
  return x;
}

/**
 * The forward map of a registry-supplied scale space — the `T` of `|T(x) − T(y)|`.
 *
 * Throws on an unknown space tag, exactly as {@link transformInSpace} does and for the same
 * reason: a space this module does not implement is a programmer error, not data.
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
 * The rubato window's joint trim (DESIGN §7.6, RESOLVED-2, A6).
 *
 * `lateStart` and `earlyEnd` are **not** two independent boundary-power values. Given
 * independent maps they cross at the `s` solving `ee^s + (1−ls)^s = 1` — s ≈ 1.36 for a
 * trimmed window — and both renderer paths respond to a crossed pair by silently resetting
 * it to (0,1): no window effect at all. So the pair is reparameterized through the total
 * trim
 *
 *     t = lateStart + (1 − earlyEnd)
 *
 * which is a single boundary-power(low) quantity with neutral 0, transformed and then split
 * back on the **preserved ratio** `lateStart : (1 − earlyEnd)`. The neutral (0,1) is fixed,
 * `t` composes exactly, and P5 is restored.
 *
 * **The A6 guard.** `t'` is clamped to `1 − minWindow` before the split, and `ls' < ee'` is
 * asserted on the computed pair. Without the clamp the ℝ proof fails in doubles: once
 * `(1−t)^s < 2⁻⁵⁴`, `1 − (1−t)^s` rounds to exactly 1.0, the split returns `a' + b' = 1`,
 * and the renderer's *inclusive* `lateStart >= earlyEnd` test trips the very cliff the
 * joint trim exists to remove.
 *
 * The clamp is why this is the **one place saturation is absorbed rather than refused**:
 * §8's rubato row promises the trim "saturates smoothly", which is a property of the guard,
 * not of the arithmetic. The only refusal left is the failed `ls' < ee'` assertion; the
 * applier is the layer that raises A6's typed engine error for it, because only it knows
 * the site.
 *
 * @param window `0 ≤ lateStart < earlyEnd ≤ 1`, the *effective* window of the site (§7.6
 *   requires def/element inheritance to be resolved before this is called).
 * @param minWindow the caller's `options.minRubatoWindow`, in (0,1). An **IEEE saturation
 *   guard**, not a musical bound — DESIGN §4 defaults it to 1e-6.
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

  // Deliberately **not** `boundaryPowerLow(totalTrim, s)`. That function refuses a result
  // that rounds onto an exact bound (A3), and here the clamp is the documented remedy for
  // exactly that case: §8's rubato row rests on it — "the joint trim saturates smoothly, but
  // only because of the A6 guard". A saturating `t'` is clamped into the window, not refused.
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
  // A6's pre-write assertion, on the computed pair rather than on `t'`: `ls'` and `ee'` are
  // rounded independently, so `t' < 1` does not by itself prove the pair is ordered.
  if (!(transformedWindow.lateStart < transformedWindow.earlyEnd)) {
    return refused('saturation-to-boundary');
  }
  return transformed(transformedWindow);
}

/**
 * The unweighted geometric mean — the center of the `tempo` and `dynamics` level
 * populations (DESIGN §7.1, A5).
 *
 * **The caller supplies the already-filtered population.** §7.1 is explicit that the skip
 * set is computed *first* and the population is exactly the distinct element sites the run
 * will transform: numeric level attributes counted once each, plus every referenced def
 * `@value` counted once per def element, with `@transition.to` excluded. Getting that set
 * right is what makes the center invariant under the transform and P2 exact; this function
 * only averages what it is given. Unweighted, because duration- and span-weighting both
 * need a rule for the last instruction's span that the MPM alone cannot supply.
 *
 * Refuses an empty population (a map whose levels are all unresolvable names has no center
 * — the caller reports the dimension inert) and any non-positive or non-finite member.
 *
 * Two exactness branches, both there because `Math.exp(Math.log(48))` is 47.999999999999986
 * and a center off by an ULP moves every value the run writes: a single-element population
 * is its own center, and an all-equal population is that value.
 */
export function geometricMean(values: readonly number[]): TransformResult {
  if (values.length === 0) return refused('out-of-domain-input');

  let logSum = 0;
  let allEqual = true;
  const first = values[0];
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
