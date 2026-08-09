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
import type { Element } from '../xml/XomTypes.js';
import { numberToString, readAttributeValue, writeAttributeValue } from './attributes.js';
import type { RegistryRow } from './registry.js';
import type { ReportNoteKind } from './report.js';
import { transformInSpace, type ScaleSpace, type TransformRefusalReason } from './transforms.js';

/** A gate refusal, already shaped as the note it becomes. */
export interface GateRefusal {
  readonly ok: false;
  readonly kind: ReportNoteKind;
  readonly detail: string;
}

export type GateResult = { readonly ok: true; readonly value: number } | GateRefusal;

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
 * The whole gate for one scalar site: the row's input predicate, the transform, and the
 * output finiteness check.
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
  if (!row.valueDomain(value)) {
    return {
      ok: false,
      kind: 'out-of-domain-input',
      detail: `@${row.attribute} = ${value} is outside the domain §7 gives it`,
    };
  }
  const result = transformInSpace(space, value, factor);
  if (!result.ok) {
    return {
      ok: false,
      kind: refusalNoteKind(result.reason),
      detail: `@${row.attribute}: ${result.reason} transforming ${value} by s = ${factor}`,
    };
  }
  if (!Number.isFinite(result.value)) {
    return {
      ok: false,
      kind: 'non-finite-result',
      detail: `@${row.attribute}: transforming ${value} by s = ${factor} left the finite range`,
    };
  }
  return { ok: true, value: result.value };
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
  if (!Number.isFinite(value)) return 'non-finite';
  const existing = readAttributeValue(element, attribute);
  if (existing === null) return 'absent';
  const text = numberToString(value);
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
