import type { Attribute, Element } from '../../../../xml/XomTypes.js';
import { attribute } from '../../../../xml/tree.js';

/**
 * The `@name` of an MPM `*Def` element — the key its style indexes it under.
 *
 * This function is all that is left of `AbstractDef`, which was a base class over the six
 * def types whose entire contribution was one field:
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
 *
 * @param what the def's element name, for the message — `'tempoDef'`, `'rubatoDef'`, …
 * @throws if the element is null or carries no `@name`; every def factory catches, logs and
 *   returns null, which is how the style skips a def it cannot read (and is Java's
 *   behaviour: `AbstractDef`'s constructor threw the same two exceptions).
 */
export function requireDefName(xml: Element | null, what: string): Attribute {
  if (xml === null) throw new Error(`Cannot generate ${what} object. XML Element is null.`);

  const name = attribute('name', xml);
  if (name === null) throw new Error(`Cannot generate ${what} object. Missing name attribute.`);
  return name;
}
