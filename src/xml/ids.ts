import { v4 as uuidv4 } from 'uuid';
import { Attribute, Element } from './XomTypes.js';
import { attribute } from './tree.js';

/**
 * `xml:id` handling and the space-separated list-attribute helper.
 *
 * Moved verbatim out of `mei/Helper` (ARCHITECTURE.md §8.2). See the warning on
 * {@link addUUID} about generation order — it is the one thing in this module that can
 * change serialized output without changing any logic.
 *
 * Port of the id half of `meico.mei.Helper`.
 * @author Axel Berndt
 */

/**
 * Add a UUID-based xml:id to the specified element.
 * Caution: If the element has already an xml:id, it will be overwritten!
 *
 * Order-sensitive. The `meico_<uuid>` ids this mints end up in the MSM and MPM output, where
 * the equivalence tests canonicalise them by first occurrence. Anything that changes *how
 * many* of these are drawn, or *in what order*, changes the canonicalised output even though
 * every individual id is random. So: do not reorder, hoist, memoise or short-circuit calls to
 * this along the conversion path.
 *
 * @return the generated uuid string
 */
export function addUUID(toThis: Element): string {
  const uuid = `meico_${uuidv4()}`;
  const a = new Attribute('xml:id', 'http://www.w3.org/XML/1998/namespace', uuid);
  toThis.addAttribute(a);
  return uuid;
}

/**
 * copies the id attribute of ofThis into toThis, retaining its namespace
 * @return the newly created attribute, or null if ofThis carries no id
 */
export function copyId(ofThis: Element, toThis: Element): Attribute | null {
  return copyIdNs(ofThis, toThis);
}

/**
 * copies the id attribute from ofThis (if present) into toThis, without namespace binding
 * @return the newly created attribute, or null if ofThis carries no id
 */
export function copyIdNoNs(ofThis: Element, toThis: Element): Attribute | null {
  const id = attribute('id', ofThis);
  if (id != null) {
    const newId = new Attribute('id', id.getValue());
    toThis.addAttribute(newId);
    return newId;
  }
  return null;
}

/**
 * copies the id attribute from ofThis (if present) into toThis, retaining its namespace
 * @return the newly created attribute, or null if ofThis carries no id
 */
function copyIdNs(ofThis: Element, toThis: Element): Attribute | null {
  const id = attribute('id', ofThis);
  if (id != null) {
    const newId = id.copy();
    toThis.addAttribute(newId);
    return newId;
  }
  return null;
}

/**
 * Adds a value to a space-separated string list in an attribute, but only if that value does
 * not yet exist in that list. A null or empty element, name or value is a no-op.
 */
export function addToListAttribute(
  element: Element | null,
  attrName: string | null,
  value: string | null,
): void {
  if (element == null || attrName == null || attrName === '' || value == null || value === '') {
    return;
  }

  const attr = attribute(attrName, element);
  const currentValue = attr != null ? attr.getValue() : '';

  const values = currentValue
    .trim()
    .split(/\s+/)
    .filter((s) => s !== '');

  if (!values.includes(value)) {
    values.push(value);
    const newValue = values.join(' ');

    if (attr != null) {
      attr.setValue(newValue);
    } else {
      element.addAttribute(new Attribute(attrName, newValue));
    }
  }
}
