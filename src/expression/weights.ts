/**
 * DESIGN.md D-H: one knob, fifteen dimensions — and the prototype's tuned vector, kept as data.
 *
 * `exaggerateMpm` takes a factor per dimension because that is what the engine needs and what a
 * sampler wants. A user interface usually has one slider. {@link weightedFactors} is the map
 * between them, and it is the prototype's own: `ModifyService.Exaggerate.applyWeights` computes
 * `(s − 1)·w + 1` per field, which is a **linear interpolation between the identity and `s`**.
 * `w = 0` pins a dimension to 1 whatever the slider does, `w = 1` passes the slider through
 * unchanged, and `w > 1` overdrives it.
 *
 * ## Why the tuned numbers ship as a preset rather than as defaults
 *
 * The prototype applied `getDefaultWeights()` to every render that asked for exaggeration —
 * unconditionally within that branch, with no parameter to see the taste or turn it off
 * (`PerformService.java:92-95`; a sketchiness-only render took a different path and was never
 * weighted). So an exaggerated render there was always one person's taste, silently. SURVEY's
 * verdict is that the vector is worth keeping and worth *naming*: the numbers encode real
 * perceptual observations (rubato at 0.2 because rubato is violent; ornament spread at 1.5
 * because the frames are small), and none of them is derivable from anything. So they are an
 * exported constant with a documented correspondence, C2's third category — "a named preset
 * documented as heuristic" — and the default remains no weighting at all.
 *
 * This module is pure arithmetic over a record: it reads no document and throws plain `Error`s
 * for the facade to type, exactly like `options.ts` next door.
 */
import {
  EXPRESSION_DIMENSIONS,
  type ExaggerationFactors,
  type ExpressionDimension,
} from './registry.js';

/**
 * D-H's per-dimension weight vector: how much of the single scalar each dimension takes.
 *
 * Structurally an {@link ExaggerationFactors}, semantically its opposite — a factor says
 * "scale this dimension by s", a weight says "how much of s does this dimension get". The
 * neutral value differs accordingly: a missing **factor** is 1 and means "leave it alone", a
 * missing **weight** is also 1 but means "pass the slider straight through".
 */
export type ExaggerationWeights = Partial<Readonly<Record<ExpressionDimension, number>>>;

/** D-H's neutral weight: the dimension receives the scalar unchanged. */
export const IDENTITY_WEIGHT = 1;

/**
 * The prototype's tuned eight-value profile, mapped onto DESIGN §3's fifteen dimensions.
 *
 * The eight numbers are transcribed from `PerformService.getDefaultWeights()`
 * (`mpm-renderer/core/src/main/java/meicotools/core/PerformService.java:47-58`) and the
 * correspondence is §3's. What the table below records is which of the fifteen weights the
 * prototype's own behaviour *determines* and which are this port's decision — a distinction
 * worth the column, because a field's **name** and the lever it actually moved diverge in three
 * places, and reading the name would credit the prototype with levers it never had.
 *
 * | prototype field    | value | what it actually scaled (`ModifyService.java`)        | dimensions here                     | inherited? |
 * |--------------------|-------|-------------------------------------------------------|-------------------------------------|-----------|
 * | `tempo`            | 1.0   | `@bpm`/`@transition.to` **and** `@meanTempoAt` (:248-276) | `tempo`, `tempoShape`           | both, genuinely |
 * | `dynamics`         | 1.1   | `@volume`/`@transition.to` only (:227-245)            | `dynamics`, `dynamicsShape`         | `dynamics` only |
 * | `rubato`           | 0.2   | `rubato@intensity` (:277-290)                         | `rubato`                            | yes |
 * | `accentuation`     | 1.3   | `accentuationPattern@scale` (:331-340)                | `accentuation`                      | yes |
 * | `temporalSpread`   | 1.5   | `@frameLength` only (:291-317)                        | `ornamentSpread`, `ornamentSpacing` | `ornamentSpread` only |
 * | `dynamicsGradient` | 0.3   | `ornament@scale` (:320-327) — **not** the gradient    | `ornamentDynamics`                  | by name, not by lever |
 * | `relativeDuration` | 0.2   | nothing — declared and weighted, never applied        | `articulation`                      | **collapsed**, see below |
 * | `relativeVelocity` | 0.3   | nothing — likewise                                    | `articulation`                      | **collapsed**, see below |
 *
 * **The three weights that are a decision, not an inheritance.** A9 split two of this port's
 * dimensions out of levers the prototype had, and in each case only one half of the split is
 * something the prototype actually touched:
 *
 * - **`dynamicsShape` (1.1).** The prototype had **no dynamics curve-shape lever at all** —
 *   `exaggerateDynamics` writes two attributes and `@curvature`/`@protraction` appear nowhere
 *   in its source. The split dimension takes `dynamics`' weight **by decision**: a preset with
 *   a hole in it is worse than one that over-applies, because the hole is invisible at the call
 *   site while an over-applied weight shows up in the factors record. (The parallel claim for
 *   `tempoShape` *is* inheritance: `exaggerateTempo` rescales `@meanTempoAt` in logit space
 *   around 0.5, which is this port's `tempoShape` row almost exactly.)
 * - **`ornamentSpacing` (1.5).** The prototype scaled `@frameLength` and nothing else;
 *   `temporalSpread@intensity`, which is this port's entire `ornamentSpacing` dimension
 *   (§7.10), was never touched. Same decision, same reason.
 * - **`ornamentDynamics` (0.3).** The prototype's field of that name did not scale a gradient:
 *   `exaggerateDynamicsGradient` walks the ornamentation **map** and multiplies `ornament@scale`
 *   — the attribute §7.16/RESOLVED-6 excludes here as a dead lever under D-C's one-site rule.
 *   The 0.3 is carried onto `dynamicsGradient@transition.from`/`.to` by name and by intent (both
 *   shade an ornament's velocities), not by lever.
 *
 * **The articulation collapse.** The prototype weighted an articulation's duration ratio and
 * its velocity ratio separately (0.2 and 0.3) and then applied neither — both fields are
 * declared, defaulted, weighted and scaled, and read by nothing that touches a document. This
 * port's `articulation` is one dimension covering both ratios plus six absolute offsets. One
 * number has to stand for two, and §3 takes **the lower**: articulation is perceptually the
 * most violent dimension in the set — at s = 2 a `relativeDuration` of 0.7 becomes 0.49, half
 * the note gone — so the choice that is wrong in the safe direction is the smaller weight. A
 * caller who wants the two separated does not need a preset; they need two runs, and the
 * dimension does not split without an MSM (D-B).
 *
 * **The five dimensions the prototype had no field for** — `asynchrony`, the three imprecision
 * domains, and `pedalShape` — are 1.0, i.e. unweighted. That is not a tuning judgement and must
 * not be read as one: the prototype could not express them at all, so the neutral value is the
 * only honest one, and a caller with an opinion says so by spreading over this constant.
 *
 * The honesty rule stops there rather than extending to the three above, and the line is drawn
 * where it is on purpose. A dimension with **no corresponding field** has no evidence either
 * way, so 1.0 states the absence. A dimension split off a lever the prototype *did* weight has
 * evidence about its sibling, and inheriting it keeps the preset coherent — asking for "the
 * prototype's dynamics" and getting a damped level beside an unweighted swell would be a
 * profile the prototype never had either. Which of the two applies is the table's last column.
 *
 * It is a **heuristic**, not a recommendation. Nothing in DESIGN derives these numbers, no
 * listening test in this repository validates them, and §8's per-dimension ranges are the
 * derived guidance. The preset exists so that the prototype's behaviour is reproducible and
 * inspectable rather than lost or silently rebuilt.
 *
 * ```ts
 * spotlightMpm(mpm, { ids, attenuation: 0.1 });                    // the prototype's shader
 * exaggerateMpm(mpm, { factors: weightedFactors(1.6, PROTOTYPE_WEIGHTS) });
 * exaggerateMpm(mpm, { factors: weightedFactors(1.6, { ...PROTOTYPE_WEIGHTS, rubato: 1 }) });
 * ```
 *
 * Frozen, like {@link EXPRESSION_DIMENSIONS}: it crosses the package boundary as one shared
 * object, so an outside mutation would silently re-tune every later run in the process. Spread
 * it to vary it, as the third line above does.
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
 * Every dimension appears in the result, including the ones weighted 1 — the record is what
 * `exaggerateMpm` validates and reports back, and a full one says what the run asked for
 * without the caller reconstructing R3's defaulting rule.
 *
 * Two algebraic facts worth relying on: `s = 1` yields the identity record for **any** weights,
 * so a preset can never make the neutral slider position do something; and `w = 0` pins its
 * dimension to 1 for **any** `s`, which is how a preset switches a dimension off.
 *
 * A weight above 1 can drive a factor negative — `weightedFactors(0.3, {ornamentSpread: 1.5})`
 * is −0.05 — and for the dimensions whose scale spaces run over a half-line that is outside
 * the admissible domain (§1/A3). It is left to `exaggerateMpm` to reject, deliberately: this
 * function's job is the interpolation, and the domain rule belongs where every other factor is
 * checked against it, so one message names the offending dimension in both paths.
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
