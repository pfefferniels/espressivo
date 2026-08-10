/**
 * DESIGN.md §4's options, their defaults, and the validation that runs before anything is
 * parsed.
 *
 * ## Why these throw plain `Error`s
 *
 * Everything rejected here is a **programmer error**, not a document condition: an unknown
 * dimension name, a `NaN` factor, a factor outside its dimension's admissible s-domain, an
 * inverted `velocityRange`. A11 makes them errors rather than silent identities precisely
 * because the silent version is undetectable — a caller who samples `{tempoShape: 1.4}` into
 * a record and misspells the key gets an identity document and no way to notice.
 *
 * They are plain `Error`s here and become `InvalidOptionError` at the facade (W3). This
 * layer has no typed-error vocabulary of its own by design: `src/expression/**` imports only
 * `src/xml/**` and the MPM name constants, and the error hierarchy lives above it. Every
 * message names the offender, which is the part the facade cannot reconstruct.
 *
 * ## Why there are exactly two numeric defaults
 *
 * C2 forbids magic numbers, and the audit that produced this module found only two places
 * where the engine needs a number no document supplies. Both are options, both have a
 * documented rationale, and both are echoed in the report when they bite:
 *
 * - `velocityRange` `{min: 1, max: 127}` — a **musical** bound (R6a). The floor is 1, not
 *   mlign's stated 0, because MIDI velocity 0 is a note-off: clamping a level to 0 would
 *   silence notes rather than quieten them. mlign was notified of the narrowing.
 * - `minRubatoWindow` `1e-6` — an **IEEE saturation guard** (A6), not a musical bound. Once
 *   `(1−t)^s < 2⁻⁵⁴` the joint trim's `1 − (1−t)^s` rounds to exactly 1.0 and the renderer's
 *   inclusive `lateStart >= earlyEnd` test resets the window to (0,1): no rubato at all,
 *   reached discontinuously. The clamp is what makes §8's "saturates smoothly" true.
 */
import {
  EXPRESSION_DIMENSIONS,
  factorDomainOf,
  type ExaggerationFactors,
  type ExpressionDimension,
} from './registry.js';

/**
 * DESIGN.md §1.3's two scopes (A7; "local" is retired).
 *
 * `global` exaggerates level values around a performance-wide center, so a piecewise-constant
 * map — the dominant shape of mpmify-generated and inferred performances — grows section
 * contrast instead of being a total no-op. `gesture` scales each transition pair around its
 * own geometric mean and leaves constants and def values alone; it is what `spotlight` needs,
 * because under `global` an attenuation pulls quiet background material *up* toward the
 * center, the inverse of damping it.
 */
export type ExaggerationScope = 'global' | 'gesture';

/** DESIGN.md §4's `velocityRange`: the musical ceiling and floor of a dynamics level. */
export interface VelocityRange {
  readonly min: number;
  readonly max: number;
}

/** §1.3/§7.1 — a caller-supplied center per level dimension. Tempo is quarter-note bpm. */
export interface CenterOverrides {
  readonly tempo?: number;
  readonly dynamics?: number;
}

/** DESIGN.md §4, minus `factors` (which {@link applyExaggeration} takes separately). */
export interface ExaggerateOptions {
  /** Omitted ⇒ ALL performances (A11). A string selects by `@name`, a number by index. */
  readonly performance?: string | number;
  readonly scope?: ExaggerationScope;
  readonly center?: CenterOverrides;
  readonly velocityRange?: VelocityRange;
  readonly minRubatoWindow?: number;
}

/**
 * R6(a). MIDI velocity 0 is a note-off, so the floor is 1: a clamp must be able to make a
 * level quiet without making it silent.
 */
export const DEFAULT_VELOCITY_RANGE: VelocityRange = { min: 1, max: 127 };

/**
 * A6. Not a musical bound — the smallest total rubato window the guard will leave standing,
 * chosen far below any audible window and far above the ~2⁻⁵³ at which the split's own
 * rounding would decide the answer.
 */
export const DEFAULT_MIN_RUBATO_WINDOW = 1e-6;

/** §1.3 — `global`, because the alternative is a no-op on the corpus this engine exists for. */
export const DEFAULT_SCOPE: ExaggerationScope = 'global';

/** R3 — a missing key means 1 means identity. */
export const IDENTITY_FACTOR = 1;

/** Every option filled in: what the applier reads. */
export interface ResolvedOptions {
  readonly performance: string | number | null;
  readonly scope: ExaggerationScope;
  readonly center: CenterOverrides;
  readonly velocityRange: VelocityRange;
  readonly minRubatoWindow: number;
}

function fail(message: string): never {
  throw new Error(message);
}

/**
 * Validate and default the options. Throws on a programmer error; never on a document.
 */
export function resolveOptions(options: ExaggerateOptions = {}): ResolvedOptions {
  const scope = options.scope ?? DEFAULT_SCOPE;
  // Typed as `readonly string[]` deliberately: the check exists for callers who reach this
  // from JavaScript, where the union type guarantees nothing, and a narrower type would let
  // the compiler prove the guard dead and the linter delete it.
  const scopes: readonly string[] = ['global', 'gesture'];
  if (!scopes.includes(scope)) {
    fail(`unknown scope: ${JSON.stringify(scope)} (expected one of ${scopes.join(', ')})`);
  }

  const velocityRange = options.velocityRange ?? DEFAULT_VELOCITY_RANGE;
  if (!Number.isFinite(velocityRange.min) || !Number.isFinite(velocityRange.max)) {
    fail(`velocityRange must be finite, got ${JSON.stringify(velocityRange)}`);
  }
  if (!(velocityRange.min < velocityRange.max)) {
    fail(`velocityRange.min must be below velocityRange.max, got ${JSON.stringify(velocityRange)}`);
  }
  // The clamp writes into a log space, whose domain is ℝ>0: a floor of 0 or below could not
  // be written back as a level at all.
  if (velocityRange.min <= 0) {
    fail(`velocityRange.min must be positive (velocity 0 is a note-off), got ${velocityRange.min}`);
  }

  const minRubatoWindow = options.minRubatoWindow ?? DEFAULT_MIN_RUBATO_WINDOW;
  if (!Number.isFinite(minRubatoWindow) || minRubatoWindow <= 0 || minRubatoWindow >= 1) {
    fail(`minRubatoWindow must lie in (0,1), got ${minRubatoWindow}`);
  }

  const resolvedCenter = validateCenter(options.center ?? {});

  if (options.performance !== undefined) {
    const selector = options.performance;
    if (typeof selector === 'number' && !Number.isInteger(selector)) {
      fail(`options.performance must be a name or an integer index, got ${selector}`);
    }
  }

  return {
    performance: options.performance ?? null,
    scope,
    center: resolvedCenter,
    // Copied, not aliased. CHARTER's public-API rule is that inputs are treated as immutable
    // and nothing interior is shared with the caller: handing back the caller's own object
    // (or, when the option is omitted, the exported DEFAULT_VELOCITY_RANGE) would let a
    // mutation mid-run move the clamp under the engine. `validateCenter` already does this;
    // this is the sibling that did not.
    velocityRange: { min: velocityRange.min, max: velocityRange.max },
    minRubatoWindow,
  };
}

/**
 * A center override is a value in the level dimension's own space (§7.1: quarter-note bpm for
 * tempo), so it must satisfy that space's domain — `ℝ>0` — or the transform it parameterizes
 * would refuse every site and the run would silently produce nothing.
 */
function validateCenter(center: CenterOverrides): CenterOverrides {
  const validated: { tempo?: number; dynamics?: number } = {};
  for (const key of ['tempo', 'dynamics'] as const) {
    const value = center[key];
    if (value === undefined) continue;
    if (!Number.isFinite(value) || value <= 0) {
      fail(`center.${key} must be a positive finite number, got ${value}`);
    }
    validated[key] = value;
  }
  return validated;
}

/**
 * Validate the factors record and fill in the missing keys with 1 (R3).
 *
 * Three rejections, all A11: an unknown key, a non-finite value, and a value outside the
 * dimension's admissible s-domain. The third is the one that is mathematics rather than
 * hygiene — for a boundary-power dimension `T`'s range is the half-line `(−∞,0]`, so a
 * negative `s` leaves it and P3 (domain closure) fails outright. It is an error and not a
 * clamp because a caller asking for `pedalShape: -1` has asked for something undefined, and
 * quietly substituting `0` would answer a question they did not pose.
 */
export function resolveFactors(factors: ExaggerationFactors): Record<ExpressionDimension, number> {
  const known = new Set<string>(EXPRESSION_DIMENSIONS);
  for (const key of Object.keys(factors)) {
    if (!known.has(key)) {
      fail(
        `unknown exaggeration dimension: ${JSON.stringify(key)} ` +
          `(expected one of ${EXPRESSION_DIMENSIONS.join(', ')})`,
      );
    }
  }

  const resolved: Partial<Record<ExpressionDimension, number>> = {};
  for (const dimension of EXPRESSION_DIMENSIONS) {
    const value = factors[dimension];
    if (value === undefined) {
      resolved[dimension] = IDENTITY_FACTOR;
      continue;
    }
    if (!Number.isFinite(value)) {
      fail(`factor for ${dimension} must be finite, got ${value}`);
    }
    if (factorDomainOf(dimension) === 'non-negative' && value < 0) {
      fail(
        `factor for ${dimension} must be ≥ 0 (its scale spaces range over a half-line, ` +
          `so a negative factor leaves the domain), got ${value}`,
      );
    }
    resolved[dimension] = value;
  }
  return resolved as Record<ExpressionDimension, number>;
}

/** Which keys the caller actually supplied — §4's `requestedFactor`, which is null otherwise. */
export function requestedFactors(
  factors: ExaggerationFactors,
): Record<ExpressionDimension, number | null> {
  const requested: Partial<Record<ExpressionDimension, number | null>> = {};
  for (const dimension of EXPRESSION_DIMENSIONS) {
    requested[dimension] = factors[dimension] ?? null;
  }
  return requested as Record<ExpressionDimension, number | null>;
}
