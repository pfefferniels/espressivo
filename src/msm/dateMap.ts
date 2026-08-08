import { Element } from '../xml/XomTypes.js';

/**
 * Insertion into a date-sorted MSM map.
 *
 * Moved verbatim out of `mei/Helper` by T14 (ARCHITECTURE.md §8.2). It lives in `src/msm/`
 * rather than in `src/xml/` because it knows about the `date` attribute, which is MSM
 * domain vocabulary rather than XML generics.
 *
 * Port of `meico.mei.Helper.addToMap`.
 * @author Axel Berndt
 */

/**
 * this method adds element addThis to a timely sequenced list, the map, and ensures the timely order of the elements in the map;
 * therefore, addThis must contain the attribute "date"; if not, addThis is appended at the end
 *
 * This is the invariant every MSM map depends on: children are in non-decreasing `date`
 * order. Three properties of the insertion are load-bearing and must not be "tidied":
 *
 * - the scan runs **backwards** from the end and stops at the first element whose `date`
 *   is `<=` the new one, inserting *after* it. Together those make the insertion stable
 *   — a new element lands behind everything already at the same date, so elements added
 *   at one date keep the order the converter emitted them in, which is what makes the
 *   serialized MSM byte-comparable against the Java reference;
 * - the search uses `descendant::*[attribute::date]` — *descendants*, not children — but
 *   the insertion index comes from `map.indexOf(...)`, which only knows direct children.
 *   For a map whose entries have dated grandchildren, the two disagree and `indexOf`
 *   returns -1, making the insert position 0. No MSM map produced by this converter
 *   nests dated elements, so the case does not arise; Java has the identical shape;
 * - dates are compared as `parseFloat`ed doubles, matching Java's `Double.parseDouble`.
 *
 * @param addThis an xml element (should have an attribute date)
 * @param map a timely sequenced list of elements with attribute date
 * @return the index of the element in the map or -1 if insertion failed
 */
export function addToMap(addThis: Element | null, map: Element | null): number {
  if (map == null || addThis == null)
    // no map or no element to insert
    return -1; // no insertion

  if (addThis.getAttribute('date') == null) {
    // no attribute date
    map.appendChild(addThis); // simply append addThis to the end of the map
    return map.getChildCount() - 1; // and return the index
  }

  const es = map.query('descendant::*[attribute::date]'); // get all elements in the map that have an attribute date
  if (es.size() === 0) {
    // if there are no elements in the map with a date attribute
    map.appendChild(addThis); // simply append addThis to the end of the map
    return map.getChildCount() - 1; // and return the index
  }

  const date = parseFloat(addThis.getAttributeValue('date')!); // get the date of addThis
  for (let i = es.size() - 1; i >= 0; --i) {
    // go through the elements
    if (parseFloat((es.get(i) as Element).getAttributeValue('date')!) <= date) {
      // if the element directly before date is found
      let index = map.indexOf(es.get(i)); // get the index of the element just found
      map.insertChild(addThis, ++index); // insert addThis right after the element
      return index; // return the index
    }
  }

  // if all elements in the map had a date later than addThis's date
  map.insertChild(addThis, 0); // insert addThis at the front of the map (as first child)
  return 0; // return the index
}
