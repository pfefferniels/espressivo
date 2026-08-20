import { v4 as uuidv4 } from 'uuid';
import { Attribute, Element } from './XomTypes.js';
import { attribute } from './tree.js';

/**
 * `xml:id` handling and the space-separated list-attribute helper.
 *
 * Moved verbatim out of `mei/Helper` by T14 (ARCHITECTURE.md §8.2). See the warning on
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
 * **Order-sensitive.** The `meico_<uuid>` ids this mints end up in the MSM and MPM
 * output, where the equivalence tests canonicalise them by first occurrence. Anything
 * that changes *how many* of these are drawn, or *in what order*, changes the
 * canonicalised output even though every individual id is random. So: do not reorder,
 * hoist, memoise or short-circuit calls to this along the conversion path.
 *
 * `src/msm/Msm.ts` used to carry its own local copy of this function, kept separate by RULE
 * M2a; `tests/msm/navigationEquivalence.test.ts` is the probe that rule asked for, the two
 * agreed, and `Msm.addIds` now calls this one. The `meico_` ids in the reference MSM files
 * always came from here.
 *
 * @param toThis
 * @return the generated uuid string
 */
export function addUUID(toThis: Element): string {
  const uuid = `meico_${uuidv4()}`; // generate new id
  const a = new Attribute('xml:id', 'http://www.w3.org/XML/1998/namespace', uuid); // create an attribute with xml namespace
  toThis.addAttribute(a); // add attribute to the element
  return uuid;
}

/**
 * copies the id attribute ofThis into toThis
 * @param ofThis
 * @param toThis
 * @return the newly created attribute
 */
export function copyId(ofThis: Element, toThis: Element): Attribute | null {
  return copyIdNs(ofThis, toThis);
}

/**
 * copies the id attribute from ofThis (if present) into toThis, without namespace binding
 * @param ofThis
 * @param toThis
 * @return the newly created attribute
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
 * @param ofThis
 * @param toThis
 * @return the newly created attribute
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
 * Adds a value to a space-separated string list in an attribute, but only if that value does not yet exist in that list.
 * @param element the element containing the attribute
 * @param attrName the name of the attribute
 * @param value the value to add
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

  // Split the current value into a list of values
  const values = currentValue
    .trim()
    .split(/\s+/)
    .filter((s) => s !== '');

  // Add the new value only if it doesn't exist
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
