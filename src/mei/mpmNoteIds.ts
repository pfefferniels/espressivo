import { Element } from '../xml/XomTypes.js';
import { attribute } from '../xml/tree.js';

/**
 * Repairing MPM `noteid` references after MSM repetitions have been resolved.
 *
 * Moved verbatim out of `mei/Helper` by T14 (ARCHITECTURE.md §8.2). It stays in `src/mei/`
 * because it is MEI-conversion-specific: only the MEI→MSM/MPM path produces the note-id
 * chain it consumes.
 *
 * Port of `meico.mei.Helper.updateMpmNoteidsAfterResolvingRepetitions`.
 * @author Axel Berndt
 */

/**
 * When articulationMaps are expanded via GenericMap.applySequencingMap() the noteid attribute is not updated.
 * Therefor, we get a Map from Msm.resolveRepetitions() and apply it to the already expanded articulationMap via this method.
 * `noteIdMappings` is a *chain*, not a lookup table: it maps each note id to the id its
 * next copy received, so following it repeatedly walks copy 1, copy 2, and so on. That
 * is why this iterates the map's elements from index 1 and steps `current` once per
 * element — the first occurrence keeps the original id, and the n-th gets the id found
 * after n-1 steps along the chain. Only the keys are iterated here; the values are
 * reached through those steps.
 *
 * @param map a GenericMap-like object that has a getXml() method returning an Element
 * @param noteIdMappings note id → id of the next copy of that note
 */
export function updateMpmNoteidsAfterResolvingRepetitions(
  map: { getXml(): Element },
  noteIdMappings: Map<string, string>,
): void {
  for (const key of noteIdMappings.keys()) {
    // for all mappings
    const ns = map.getXml().query(`descendant::*[attribute::noteid = '#${key}']`); // get all elements with the noteid attribute and the specific value
    if (ns.size() < 2)
      // if there is none or only one
      continue; // no need to change that value, the first one keeps the original

    let current: string | undefined = key; // this string will be set to the subsequent values
    for (let i = 1; i < ns.size(); ++i) {
      // iterate through the elements starting with the second
      // `current` runs out as soon as a note has no further copy: `Map.get` answers
      // undefined, which the `!` here used to feed straight back in on the next turn.
      // Stopping is the same outcome — the write below is guarded on `current != null`, so
      // every later iteration was already doing nothing — and it says so.
      if (current === undefined) break;
      current = noteIdMappings.get(current); // get the next value
      const a = attribute('noteid', ns.get(i) as Element); // get the attribute
      if (a != null && current != null) {
        a.setValue(`#${current}`); // set the attribute value
      }
    }
  }
}
