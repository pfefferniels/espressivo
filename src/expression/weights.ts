/**
 * DESIGN.md D-H: one knob, fifteen dimensions — and the prototype's tuned vector, kept as data.
 *
 * `exaggerateMpm` takes a factor per dimension; a user interface usually has one slider.
 * {@link weightedFactors} is the map between them, and it is the prototype's own:
 * `ModifyService.Exaggerate.applyWeights` computes `(s − 1)·w + 1` per field, a linear
 * interpolation between the identity and `s`. `w = 0` pins a dimension to 1 whatever the
 * slider does, `w = 1` passes the slider through unchanged, and `w > 1` overdrives it.
 *
 * The prototype applied `getDefaultWeights()` to every render that asked for exaggeration,
 * with no parameter to see the taste or turn it off (`PerformService.java:92-95`; a
 * sketchiness-only render took a different path and was never weighted). Here the vector is an
 * exported preset — C2's "named preset documented as heuristic" — and the default is no
 * weighting at all.
 */
import {
  EXPRESSION_DIMENSIONS,
  type ExaggerationFactors,
  type ExpressionDimension,
} from './registry.js';

/**
 * D-H's per-dimension weight vector: how much of the single scalar each dimension takes.
 *
 * Structurally an {@link ExaggerationFactors}, semantically its opposite — a factor says "scale
 * this dimension by s", a weight says "how much of s does this dimension get". Both default to
 * 1, but a missing factor means "leave it alone" and a missing weight "pass `s` through".
 */
export type ExaggerationWeights = Partial<Readonly<Record<ExpressionDimension, number>>>;

/** D-H's neutral weight: the dimension receives the scalar unchanged. */
export const IDENTITY_WEIGHT = 1;

/**
 * The prototype's tuned eight-value profile, mapped onto DESIGN §3's fifteen dimensions.
 *
 * Transcribed from `PerformService.getDefaultWeights()`
 * (`mpm-renderer/core/src/main/java/meicotools/core/PerformService.java:47-58`), listed with
 * what each field actually moved in `ModifyService.java`: the name and the lever diverge in
 * three places, and reading the name would credit the prototype with levers it never had.
 *
 * - `tempo` 1.0 → `tempo`, `tempoShape`. Scaled `@bpm`/`@transition.to` and `@meanTempoAt` in
 *   logit space around 0.5 (:248-276); both dimensions genuinely inherited.
 * - `dynamics` 1.1 → `dynamics`, `dynamicsShape`. Scaled `@volume`/`@transition.to` only
 *   (:227-245); `@curvature`/`@protraction` appear nowhere in its source.
 * - `rubato` 0.2 → `rubato`. Scaled `rubato@intensity` (:277-290).
 * - `accentuation` 1.3 → `accentuation`. Scaled `accentuationPattern@scale` (:331-340).
 * - `temporalSpread` 1.5 → `ornamentSpread`, `ornamentSpacing`. Scaled `@frameLength` only
 *   (:291-317); `temporalSpread@intensity` (§7.10) was never touched.
 * - `dynamicsGradient` 0.3 → `ornamentDynamics`. Scaled `ornament@scale` (:320-327), not the
 *   gradient — §7.16/RESOLVED-6 excludes that attribute here, so the weight carries onto
 *   `dynamicsGradient@transition.from`/`.to` by intent, not by lever.
 * - `relativeDuration` 0.2, `relativeVelocity` 0.3 → `articulation`. Both declared, defaulted,
 *   weighted and read by nothing that touches a document.
 *
 * `dynamicsShape` and `ornamentSpacing` therefore take their sibling's weight by decision, not
 * by inheritance: a preset with a hole in it is invisible at the call site, while an
 * over-applied weight shows up in the factors record.
 *
 * The articulation collapse: this port's `articulation` is one dimension covering both ratios
 * plus six absolute offsets, so one number stands for two and §3 takes the lower. Articulation
 * is the most violent dimension in the set — at s = 2 a `relativeDuration` of 0.7 becomes 0.49
 * — so the smaller weight is the error in the safe direction. The dimension does not split
 * without an MSM (D-B).
 *
 * The five dimensions the prototype had no field for — `asynchrony`, the three imprecision
 * domains, `pedalShape` — are 1.0, which records an absence of evidence rather than a tuning
 * judgement. A dimension split off a lever the prototype did weight has evidence about its
 * sibling, which is why those two inherit instead.
 *
 * A heuristic, not a recommendation: nothing in DESIGN derives these numbers and no listening
 * test in this repository validates them. §8's per-dimension ranges are the derived guidance.
 *
 * ```ts
 * spotlightMpm(mpm, { ids, attenuation: 0.1 });                    // the prototype's shader
 * exaggerateMpm(mpm, { factors: weightedFactors(1.6, PROTOTYPE_WEIGHTS) });
 * exaggerateMpm(mpm, { factors: weightedFactors(1.6, { ...PROTOTYPE_WEIGHTS, rubato: 1 }) });
 * ```
 *
 * Frozen, like {@link EXPRESSION_DIMENSIONS}: it crosses the package boundary as one shared
 * object, so an outside mutation would re-tune every later run in the process. Spread it to
 * vary it, as the third line above does.
 */
export const PROTOTYPE_WEIGHTS: Readonly<Record<ExpressionDimension, number>> = Object.freeze({
  tempo: 1.0,
  tempoShape: 1.0,
  dynamics: 1.1,
  dynamicsShape: 1.1,
  rubato: 0.2,
  articulation: 0.2,
  accentuation: 1.3,
  ornamentSpread: 1.5,
  ornamentSpacing: 1.5,
  ornamentDynamics: 0.3,
  asynchrony: IDENTITY_WEIGHT,
  imprecisionTiming: IDENTITY_WEIGHT,
  imprecisionDynamics: IDENTITY_WEIGHT,
  imprecisionDuration: IDENTITY_WEIGHT,
  pedalShape: IDENTITY_WEIGHT,
});

function fail(message: string): never {
  throw new Error(message);
}

/**
 * D-H's lerp: turn one scalar into a full factor record, `sᵈ = 1 + wᵈ·(s − 1)`.
 *
 * Every dimension appears in the result, including the ones weighted 1, so the record says what
 * the run asked for without the caller reconstructing R3's defaulting rule.
 *
 * Two algebraic facts worth relying on: `s = 1` yields the identity record for any weights, so
 * a preset can never make the neutral slider position do something; and `w = 0` pins its
 * dimension to 1 for any `s`, which is how a preset switches a dimension off.
 *
 * A weight above 1 can drive a factor negative — `weightedFactors(0.3, {ornamentSpread: 1.5})`
 * is −0.05 — which for the dimensions whose scale spaces run over a half-line is outside the
 * admissible domain (§1/A3). Rejecting it is left to `exaggerateMpm`, where every other factor
 * is checked, so one message names the offending dimension in both paths.
 *
 * @param s the single scalar; 1 is the identity
 * @param weights how much of `s` each dimension takes; a missing key is
 *   {@link IDENTITY_WEIGHT}, which passes `s` through
 * @throws {Error} `s` is not finite, `weights` holds a key that is not a dimension, or a weight
 *   is not finite — the facade turns each into an `InvalidOptionError`
 */
export function weightedFactors(s: number, weights: ExaggerationWeights): ExaggerationFactors {
  if (!Number.isFinite(s)) fail(`the exaggeration scalar must be finite, got ${s}`);

  const known = new Set<string>(EXPRESSION_DIMENSIONS);
  for (const key of Object.keys(weights)) {
    if (!known.has(key))
      fail(
        `unknown exaggeration dimension in weights: ${JSON.stringify(key)} ` +
          `(expected one of ${EXPRESSION_DIMENSIONS.join(', ')})`,
      );
  }

  const factors: Partial<Record<ExpressionDimension, number>> = {};
  for (const dimension of EXPRESSION_DIMENSIONS) {
    const weight = weights[dimension] ?? IDENTITY_WEIGHT;
    if (!Number.isFinite(weight)) fail(`weight for ${dimension} must be finite, got ${weight}`);
    // Spelled as the prototype spells it — `(s − 1)·w + 1`, not `1 + w·s − w` — so that s = 1
    // is the identity by subtraction rather than by cancellation: the first form computes
    // 0·w + 1 exactly, while the second rounds through two products for the same answer.
    factors[dimension] = (s - 1) * weight + 1;
  }
  return factors;
}
