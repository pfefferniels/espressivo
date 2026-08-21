/**
 * Attribute primitives for the expression engine — the only place it reads or writes an
 * XML attribute value.
 *
 * Three rules from DESIGN.md D-A, all byte-visible:
 *
 * - Writes go through the live {@link Attribute}'s `setValue`, which mutates only
 *   `Attribute._value` (XomTypes.ts:218-220) while the serializer walks `_attributes` front
 *   to back (XomTypes.ts:775) — that is what makes a write order-preserving.
 *   `Element.addAttribute` removes and re-pushes (XomTypes.ts:492-500), MOVING the attribute
 *   to the end of the list (`date bpm beatLength` becomes `date beatLength bpm`).
 * - The engine never creates an attribute: {@link writeAttributeValue} refuses a site that
 *   does not already exist and says so in its return value (`gate.ts` carries the §7 reasons).
 * - Every number reaches the document through {@link numberToString}, so the formatting of
 *   every written value can be changed, or audited, in one place.
 *
 * Reads use {@link attribute} from `xml/tree.js` rather than `Element.getAttribute`,
 * because its three-namespace lookup is what resolves `xml:id` under the bare name `id` —
 * the spelling every id in this port is read with. `xml/tree.js`'s `allChildElements` /
 * `firstChildElement(parent, name)` are NOT safe here: both are implemented with
 * `Element.query` (tree.ts:94, tree.ts:150), the XPath path D-A bans. Navigate with
 * `Element.getChildElements` / `Element.getFirstChildElement` instead.
 */
import type { Element } from '../xml/XomTypes.js';
import { attribute } from '../xml/tree.js';

/**
 * The single formatting rule for every number the engine writes: `String(x)`.
 *
 * `String` is what the surrounding port already uses on this path (`TempoDef.setValue`,
 * `DynamicsDef.setValue`), so a value written here is spelled the way the same value
 * written through the MPM classes would be. Deliberately not `toFixed` or any rounding:
 * rounding is a lossy edit the caller never asked for. The §1.2 validation gate — not this
 * function — is what keeps non-finite values out of the document.
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
 * NaN for both "absent" and "not a number"; callers that care distinguish them with
 * {@link readAttributeValue}. `parseFloat` is lenient in the same way the renderer is:
 * `"120bpm"` reads as 120.
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
