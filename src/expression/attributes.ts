/**
 * Attribute primitives for the expression engine — the only place it reads or writes an
 * XML attribute value.
 *
 * Three rules live here, all of them from DESIGN.md D-A, and all of them byte-visible:
 *
 * - **Writes go through the live {@link Attribute}'s `setValue`**, which mutates only
 *   `Attribute._value` (XomTypes.ts:218-220) while the serializer walks `_attributes`
 *   front to back (XomTypes.ts:775). That is what makes a write order-preserving.
 *   `Element.addAttribute` must never be used to update a value: it removes the existing
 *   attribute and pushes the replacement (XomTypes.ts:492-500), which MOVES the attribute
 *   to the end of the serialized list — `date bpm beatLength` becomes
 *   `date beatLength bpm`.
 * - **The engine never creates an attribute.** {@link writeAttributeValue} refuses a site
 *   that does not already exist and says so in its return value; materializing an absent
 *   `@transition.to` would invent a gesture the author did not write (§7.4).
 * - **Every number reaches the document through {@link numberToString}.** One choke point,
 *   so the formatting of every value the engine writes can be changed, or audited, in one
 *   place.
 *
 * Reads use {@link attribute} from `xml/tree.js` rather than `Element.getAttribute`,
 * because its three-namespace lookup is what resolves `xml:id` under the bare name `id` —
 * the spelling every id in this port is read with. Note that `xml/tree.js`'s
 * `allChildElements` / `firstChildElement(parent, name)` are NOT safe here: both are
 * implemented with `Element.query` (tree.ts:94, tree.ts:150), the XPath path D-A bans.
 * Navigate with `Element.getChildElements` / `Element.getFirstChildElement` instead.
 */
import type { Element } from '../xml/XomTypes.js';
import { attribute } from '../xml/tree.js';

/**
 * The single formatting rule for every number the engine writes: `String(x)`.
 *
 * `String` is what the surrounding port already uses on this path (`TempoDef.setValue`,
 * `DynamicsDef.setValue`), so a value written here is spelled the way the same value
 * written through the MPM classes would be. It is deliberately not `toFixed` or any
 * rounding: rounding is a lossy edit the caller never asked for, and the §1.2 validation
 * gate — not this function — is what keeps non-finite values out of the document.
 */
export function numberToString(value: number): string {
  return String(value);
}

/** The raw text of `name` on `element`, or null when the attribute is absent. */
export function readAttributeValue(element: Element, name: string): string | null {
  return attribute(name, element)?.getValue() ?? null;
}

/**
 * `name` read as a number with `parseFloat` semantics — the renderer's own reading for
 * every attribute that is not a style-resolvable level (levels go through
 * `styleScope.resolveLevel`, which must try the def lookup first).
 *
 * NaN for both "absent" and "not a number", which the callers distinguish by asking
 * {@link readAttributeValue} when they care. `parseFloat` is deliberately lenient in the
 * same way the renderer is: `"120bpm"` reads as 120.
 */
export function readNumericAttributeValue(element: Element, name: string): number {
  const raw = readAttributeValue(element, name);
  return raw === null ? NaN : parseFloat(raw);
}

/**
 * Set an EXISTING attribute's value in place, preserving its position in the serialized
 * attribute list.
 *
 * @returns true when the attribute existed and was written, false when it was absent — in
 *   which case nothing is created and the document is untouched.
 */
export function writeAttributeValue(element: Element, name: string, value: string): boolean {
  const attr = attribute(name, element);
  if (attr === null) return false;
  attr.setValue(value);
  return true;
}

/** {@link writeAttributeValue} with {@link numberToString} applied. */
export function writeNumericAttributeValue(element: Element, name: string, value: number): boolean {
  return writeAttributeValue(element, name, numberToString(value));
}
