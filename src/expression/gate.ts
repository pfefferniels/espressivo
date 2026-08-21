/**
 * DESIGN.md §1.2's validation gate and the write discipline, as the two primitives every
 * dimension handler shares.
 *
 *     read → validate(input domain) → transform → validate(output domain) → write
 *
 * The gate lives here rather than inside `transforms.ts` because half of it is registry
 * knowledge: a row may narrow its space's own domain (`meanTempoAt` is open `(0,1)` inside a
 * logit that accepts the closed interval), and only the registry knows that. `transforms.ts`
 * refuses what the arithmetic cannot do; this module refuses what the *renderer* cannot
 * survive.
 *
 * Three rules the write primitive enforces:
 *
 * - Never write a non-finite value — A4's global invariant, pinned by an adversarial-XML
 *   property test. `transforms.ts` already refuses to produce one; this is the second lock,
 *   because the applier also computes values the transforms never see (a denormalized tempo,
 *   a clamped velocity, a moved end-marker duplicate).
 * - Never create an attribute. {@link writeAttributeValue} refuses an absent site and says so.
 *   Materializing an absent `@transition.to` would invent a gesture the author never wrote
 *   (§7.4); an absent `@scale` would seed a dead lever (§7.11).
 * - Do not write a value whose spelling is unchanged, which would break R4's contract that a
 *   no-op sample has `totalWrites === 0`. A *spelling* test, not a numeric one: an attribute
 *   reading `"1.0"` whose transformed value is 1 has a changed spelling and IS written, which
 *   is why P1's identity guarantee rests on the dimension-level `s === 1` short-circuit and
 *   not on this rule (A2).
 */
import { andThen, err, mapErr, ok, type Result } from '../prelude/index.js';
import type { Element } from '../xml/XomTypes.js';
import { numberToString, readAttributeValue, writeAttributeValue } from './attributes.js';
import type { RegistryRow } from './registry.js';
import type { ReportNoteKind } from './report.js';
import { transformInSpace, type ScaleSpace, type TransformRefusalReason } from './transforms.js';

/**
 * A gate refusal, already shaped as the note it becomes — `kind` and `detail` are `note`'s
 * first and last arguments. As the error payload of a {@link Result} it is a value: passed
 * whole, decorated with `mapErr`, threaded through a pipeline like any other.
 */
export interface GateRefusal {
  readonly kind: ReportNoteKind;
  readonly detail: string;
}

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
 * output finiteness check, chained as this module's `validate → transform → validate`. The
 * middle step is a plain `mapErr` — `transformInSpace` already answers with a `Result`, and
 * all this layer adds is registry context (§7's per-row narrowing) on the way past.
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
 * The suffix is passed through verbatim rather than derived: a v3 document that spells its
 * frame suffix-less (which the format's own sample encodings do) must come back suffix-less,
 * and one that spells it `%` must come back `%`. Deriving it from a resolved domain would
 * canonicalize the attribute, an edit no caller asked for.
 *
 * All three rules of this module hold unchanged, and the "spelling unchanged" test applies to
 * the WHOLE text: `frameLength="80%"` at `s = 1` compares `"80%"` against `"80%"`, not `80`
 * against `80`.
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
