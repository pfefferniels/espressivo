import type { Attribute, Element } from '../../../../xml/XomTypes.js';
import { attribute } from '../../../../xml/tree.js';
import { MeicoError, MissingNodeError } from '../../../../xml/errors.js';
import { err, type Err } from '../../../../prelude/index.js';
import type { MpmParseError } from '../../parseError.js';

/**
 * What every MPM `*Def` factory needs before it can build anything: the `@name` its style
 * will index it under, and one honest answer to "what do I do when this goes wrong".
 *
 * ## {@link requireDefName} is what is left of `AbstractDef`
 *
 * That base class's entire contribution to its six subclasses was one field:
 *
 * ```ts
 * export abstract class AbstractDef extends AbstractXmlSubtree {
 *   protected name!: Attribute;
 * ```
 *
 * The `!` was the reason to be rid of it. A definite-assignment marker is the type system
 * being instructed to ignore a state it can see is reachable — here, "a def exists but has
 * not been parsed yet, and `getName()` would throw" — and the only thing keeping that state
 * from a caller was the convention that every factory called `parseData` immediately. Six
 * subclasses inherited the promise; none of them could check it.
 *
 * Reading the name *before* construction dissolves the problem rather than moving it: each
 * def's factory calls this, hands the attribute to a private constructor, and the field is
 * `readonly`. There is then no moment at which a def exists without its name, which is what
 * the base class was trying to say.
 */

/**
 * @param what the def's element name, for the message — `'tempoDef'`, `'rubatoDef'`, …
 * @throws {MissingNodeError} if the element is null or carries no `@name`. Every def factory
 *   funnels that through {@link skipMalformedDef}, which logs it and returns null, so the
 *   style skips a def it cannot read — Java's behaviour, where `AbstractDef`'s constructor
 *   threw the same two exceptions.
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
 * Absorb a malformed *document*, and only that — as a value.
 *
 * The six def factories were `try { … } catch (e) { console.error(e); return null }`, which is
 * Java's shape and is the right *behaviour*: a def whose `@value` is not a number, or which
 * has no `@name`, is skipped and the rest of the style survives (PARITY.md, "Fixed bugs", P1).
 * Two things were wrong with it, and they were fixed in two passes.
 *
 * The first was the *scope*. A bare `catch` absorbs every failure, including the ones that
 * mean this port is broken rather than the input, and turns them all into the same silent
 * `null`. That is not hypothetical. It was measured: a deliberate control that broke
 * {@link requireDefName} — introduced to prove the six "returns null when the name attribute
 * is missing" tests could see a break — came back GREEN, because the injected fault was a
 * `ReferenceError` and the catch-all made a crash indistinguishable from the rejection it had
 * replaced. Six tests were asserting a behaviour they could not tell apart from its own
 * absence.
 *
 * So: only {@link MeicoError}, the root of what this library raises *deliberately*, is
 * absorbed. Its two relevant subclasses are exactly the two things a bad document produces —
 * `MissingNodeError` for an absent required attribute, `NumberFormatError` for a value that
 * is not a Java double. A `TypeError`, a `ReferenceError` or anything else escapes to the
 * caller, where it belongs, because no MPM document can cause one.
 *
 * The second was the `console.error`, and this is that pass: the error it narrowed to is now
 * *returned*, under {@link MpmParseError}'s `malformedDef` arm, and the caller — `Style`,
 * indexing a collection's children — decides what a skipped def is worth saying.
 *
 * @returns the failure arm, so a factory can write `catch (e) { return skipMalformedDef(e, 'TempoDef'); }`
 * @throws whatever it was handed, when that is not a {@link MeicoError}
 */
export function skipMalformedDef(e: unknown, what: string): Err<MpmParseError> {
  if (!(e instanceof MeicoError)) throw e;
  return err({ kind: 'malformedDef', what, cause: e });
}
