/**
 * DESIGN.md §1.2's validation gate and the write discipline, as the two primitives every
 * dimension handler shares.
 *
 *     read → validate(input domain) → transform → validate(output domain) → write
 *
 * The gate is a §1-level contract, not a per-row note, and it is here rather than inside
 * `transforms.ts` because half of it is registry knowledge: a row may narrow its space's own
 * domain (`meanTempoAt` is open `(0,1)` inside a logit that accepts the closed interval), and
 * only the registry knows that. `transforms.ts` refuses what the arithmetic cannot do; this
 * module refuses what the *renderer* cannot survive.
 *
 * ## Three rules the write primitive enforces
 *
 * - **Never write a non-finite value.** The global invariant of A4, pinned by an
 *   adversarial-XML property test. `transforms.ts` already refuses to produce one; this is
 *   the second lock, because the applier also computes values the transforms never see (a
 *   denormalized tempo, a clamped velocity, a moved end-marker duplicate).
 * - **Never create an attribute.** {@link writeAttributeValue} refuses an absent site and
 *   says so. Materializing an absent `@transition.to` would invent a gesture the author never
 *   wrote (§7.4); materializing an absent `@scale` would seed a dead lever (§7.11).
 * - **Do not write a value whose spelling is unchanged.** `String(48)` for an attribute that
 *   already reads `"48"` is a write that changes nothing, and counting it would break R4's
 *   `totalWrites === 0` contract for "this sample is a no-op". Note that this is a *spelling*
 *   test, not a numeric one: an attribute reading `"1.0"` whose transformed value is 1 has a
 *   changed spelling and IS written. That is why P1's identity guarantee rests on the
 *   dimension-level `s === 1` short-circuit and not on this rule (A2).
 */
import { andThen, err, mapErr, ok, type Result } from '../prelude/index.js';
import type { Element } from '../xml/XomTypes.js';
import { numberToString, readAttributeValue, writeAttributeValue } from './attributes.js';
import type { RegistryRow } from './registry.js';
import type { ReportNoteKind } from './report.js';
import { transformInSpace, type ScaleSpace, type TransformRefusalReason } from './transforms.js';

/**
 * A gate refusal, already shaped as the note it becomes — `kind` and `detail` are `note`'s
 * first and last arguments.
 *
 * These two fields used to be spelled *inside* the failure arm (`{ ok: false, kind, detail }`),
 * which made the refusal unnameable: every one of the seven call sites had to unpack it field
 * by field, and the one site that wants to add a sentence to the explanation had to rebuild the
 * whole note by hand. As the error payload of a {@link Result} it is a value — passed whole,
 * decorated with `mapErr`, and threaded through a pipeline like any other.
 */
export interface GateRefusal {
  readonly kind: ReportNoteKind;
  readonly detail: string;
}

/** A gated value, or the refusal that stopped it. */
export type GateResult = Result<number, GateRefusal>;

/** A3's refusal reasons, mapped onto the report's closed note vocabulary. */
export function refusalNoteKind(reason: TransformRefusalReason): ReportNoteKind {
  switch (reason) {
    case 'out-of-domain-input':
      return 'out-of-domain-input';
    case 'saturation-to-boundary':
      return 'saturation-refused';
    case 'non-finite-result':
      return 'non-finite-result';
  }
}

/**
 * A domain guard as a value: the number where the predicate holds, the refusal where it does
 * not. The refusal is a thunk so that the message — which interpolates the offending value — is
 * built only when there is something to explain.
 */
function admit(value: number, admissible: boolean, refusal: () => GateRefusal): GateResult {
  return admissible ? ok(value) : err(refusal());
}

/**
 * The whole gate for one scalar site: the row's input predicate, the transform, and the
 * output finiteness check.
 *
 * The three steps are this module's own `validate → transform → validate` written as a chain
 * rather than as three early returns, because that is what the sequence *is*: each step either
 * hands the next a number or hands the caller a refusal, and `andThen` is the name of that. The
 * middle step is a plain `mapErr` — `transformInSpace` already answers with a `Result`, and all
 * this layer adds is registry context (§7's per-row narrowing) on the way past.
 *
 * A value failing the input predicate is refused rather than repaired. The renderer does not
 * enforce these domains, so real documents carry values that render benignly today and become
 * `NaN` under exaggeration — `curvature="1.5"` at `s = 2.5` is `1 − (−0.5)^2.5`, and a `NaN`
 * escapes every renderer clamp because every `NaN` comparison is false.
 */
export function gateAndTransform(
  row: RegistryRow,
  space: ScaleSpace,
  value: number,
  factor: number,
): GateResult {
  const input = admit(value, row.valueDomain(value), () => ({
    kind: 'out-of-domain-input',
    detail: `@${row.attribute} = ${value} is outside the domain §7 gives it`,
  }));

  const transformed = andThen(input, (admissible) =>
    mapErr(transformInSpace(space, admissible, factor), (reason) => ({
      kind: refusalNoteKind(reason),
      detail: `@${row.attribute}: ${reason} transforming ${admissible} by s = ${factor}`,
    })),
  );

  return andThen(transformed, (result) =>
    admit(result, Number.isFinite(result), () => ({
      kind: 'non-finite-result',
      detail: `@${row.attribute}: transforming ${value} by s = ${factor} left the finite range`,
    })),
  );
}

/** What {@link writeNumber} did. Only `written` counts toward R4's `totalWrites`. */
export type WriteOutcome =
  /** The attribute existed, its spelling changed, and the document now holds the new value. */
  | 'written'
  /** The attribute existed and already read exactly this. Nothing was touched. */
  | 'unchanged'
  /** The attribute does not exist. Nothing is ever created. */
  | 'absent'
  /** The value was not finite. The last line of A4's global invariant. */
  | 'non-finite';

/** Set an existing attribute to `value`, under all three rules in this module's doc. */
export function writeNumber(element: Element, attribute: string, value: number): WriteOutcome {
  return writeSuffixedNumber(element, attribute, value, '');
}

/**
 * {@link writeNumber} for a value whose text is a number followed by a unit — MPM v3's
 * `frameLength="80%"` (§7.15).
 *
 * The suffix is passed through verbatim rather than derived, because the engine's licence is
 * to change the number and nothing else: a v3 document that spells its frame suffix-less
 * (which the format's own sample encodings do) must come back suffix-less, and one that
 * spells it `%` must come back `%`. Deriving it from a resolved domain would canonicalize the
 * attribute, which is a document edit no caller asked for.
 *
 * All three rules of this module hold unchanged, and the "spelling unchanged" test is applied
 * to the WHOLE text: `frameLength="80%"` at `s = 1` compares `"80%"` against `"80%"`, not `80`
 * against `80`, so a unit-only difference could never be counted as a write either.
 */
export function writeSuffixedNumber(
  element: Element,
  attribute: string,
  value: number,
  suffix: string,
): WriteOutcome {
  if (!Number.isFinite(value)) return 'non-finite';
  const existing = readAttributeValue(element, attribute);
  if (existing === null) return 'absent';
  const text = `${numberToString(value)}${suffix}`;
  if (existing === text) return 'unchanged';
  writeAttributeValue(element, attribute, text);
  return 'written';
}

/** R6(a): a dynamics level clamped into the caller's musical range, and whether it bit. */
export function clampIntoRange(
  value: number,
  range: { readonly min: number; readonly max: number },
): { readonly value: number; readonly clamped: boolean } {
  if (value < range.min) return { value: range.min, clamped: true };
  if (value > range.max) return { value: range.max, clamped: true };
  return { value, clamped: false };
}
