import { Element } from '../xml/XomTypes.js';
import { requireAttributeValue, reverseDescendantElements } from '../xml/tree.js';

/**
 * Insertion into a date-sorted MSM map. Lives in `src/msm/` rather than `src/xml/` because it
 * knows the `date` attribute, which is MSM vocabulary rather than XML generics.
 *
 * Port of `meico.mei.Helper.addToMap`.
 * @author Axel Berndt
 */

/**
 * Insert `addThis` into `map` at the position its `date` attribute calls for, preserving the
 * invariant every MSM map depends on: children in non-decreasing `date` order. An element
 * without a `date` is appended at the end. Three properties of the insertion are load-bearing:
 *
 * - the scan runs backwards from the end and stops at the first element whose `date` is `<=`
 *   the new one, inserting after it. That makes the insertion stable — a new element lands
 *   behind everything already at the same date, so elements added at one date keep the order
 *   the converter emitted them in, which is what makes the serialized MSM byte-comparable
 *   against the Java reference;
 * - the search covers descendants ({@link reverseDescendantElements}), but the insertion index
 *   comes from `map.indexOf(...)`, which only knows direct children. For a map whose entries
 *   have dated grandchildren the two disagree, `indexOf` returns -1 and the insert position
 *   becomes 0. No MSM map produced by this converter nests dated elements, so the case does not
 *   arise; Java has the identical shape;
 * - dates are compared as `parseFloat`ed doubles, matching Java's `Double.parseDouble`.
 *
 * The walk is lazy because materialising the dated elements first made every insertion a full
 * pass over the map, so filling a `<score>` with n notes cost Θ(n²) — measured at 56% of a
 * conversion. The reverse walk reaches the last dated element after O(depth) work and the
 * common case, a note dated at or after everything already in the map, accepts it immediately.
 * A note dated before the whole map still walks the whole map.
 *
 * "No dated elements at all" appends at the end while "every dated element is later" inserts at
 * the front, so the two must stay distinguishable — hence {@link sawDated} rather than a
 * length test.
 *
 * @return the index `addThis` landed at, or -1 if either argument was null
 */
export function addToMap(addThis: Element | null, map: Element | null): number {
  if (map == null || addThis == null) return -1;

  const dateAttribute = addThis.getAttribute('date');
  if (dateAttribute === null) {
    map.appendChild(addThis);
    return map.getChildCount() - 1;
  }

  const date = parseFloat(dateAttribute.getValue());
  let sawDated = false; // whether the map holds any dated element at all
  for (const dated of reverseDescendantElements(
    map,
    (element) => element.getAttribute('date') !== null,
  )) {
    sawDated = true;
    // The walk's predicate is what puts the attribute there; reading it through
    // `requireAttributeValue` makes an impossible miss name `date` rather than arrive as
    // `parseFloat(null)`'s NaN two comparisons later.
    if (parseFloat(requireAttributeValue('date', dated)) <= date) {
      let index = map.indexOf(dated);
      map.insertChild(addThis, ++index);
      return index;
    }
  }

  if (!sawDated) {
    map.appendChild(addThis);
    return map.getChildCount() - 1;
  }

  // every dated element is later than addThis
  map.insertChild(addThis, 0);
  return 0;
}
