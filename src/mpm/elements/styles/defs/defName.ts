import type { Attribute, Element } from '../../../../xml/XomTypes.js';
import { attribute } from '../../../../xml/tree.js';
import { MeicoError, MissingNodeError } from '../../../../xml/errors.js';
import { err, type Err } from '../../../../prelude/index.js';
import type { MpmParseError } from '../../parseError.js';

/**
 * What every MPM `*Def` factory needs before it can build anything: the `@name` its style will
 * index it under, and one answer to what happens when that goes wrong.
 *
 * Each def's factory calls {@link requireDefName} *before* construction and hands the attribute
 * to a private constructor, so the field is `readonly` and there is no moment at which a def
 * exists without its name.
 */

/**
 * @param what the def's element name, for the message — `'tempoDef'`, `'rubatoDef'`, …
 * @throws {MissingNodeError} if the element is null or carries no `@name`. Every def factory
 *   funnels that through {@link skipMalformedDef}, so the style skips a def it cannot read —
 *   Java's behaviour, where `AbstractDef`'s constructor threw the same two exceptions.
 */
export function requireDefName(xml: Element | null, what: string): Attribute {
  if (xml === null)
    throw new MissingNodeError(`Cannot generate ${what} object. XML Element is null.`);

  const name = attribute('name', xml);
  if (name === null)
    throw new MissingNodeError(`Cannot generate ${what} object. Missing name attribute.`);
  return name;
}

/**
 * Absorb a malformed *document*, and only that, as a value: a def whose `@value` is not a
 * number, or which has no `@name`, is skipped and the rest of the style survives (PARITY.md,
 * "Fixed bugs", P1).
 *
 * Only {@link MeicoError}, the root of what this library raises *deliberately*, is absorbed.
 * Its two relevant subclasses are exactly the two things a bad document produces —
 * `MissingNodeError` for an absent required attribute, `NumberFormatError` for a value that is
 * not a Java double. A `TypeError`, a `ReferenceError` or anything else escapes to the caller,
 * because no MPM document can cause one.
 *
 * The narrowing is load-bearing, and measured: while the catch was total, a deliberate control
 * that broke {@link requireDefName} came back GREEN, because the injected fault was a
 * `ReferenceError` and the catch-all made a crash indistinguishable from the rejection it had
 * replaced. Six tests were asserting a behaviour they could not tell apart from its own absence.
 *
 * @returns the failure arm, so a factory can write
 *   `catch (e) { return skipMalformedDef(e, 'TempoDef'); }`
 * @throws whatever it was handed, when that is not a {@link MeicoError}
 */
export function skipMalformedDef(e: unknown, what: string): Err<MpmParseError> {
  if (!(e instanceof MeicoError)) throw e;
  return err({ kind: 'malformedDef', what, cause: e });
}
