import { Element } from '../xml/XomTypes.js';
import { attribute } from '../xml/tree.js';

/**
 * Repairing MPM `noteid` references after MSM repetitions have been resolved. Lives under
 * `src/mei/` because only the MEI→MSM/MPM path produces the note-id chain it consumes.
 *
 * Port of `meico.mei.Helper.updateMpmNoteidsAfterResolvingRepetitions`.
 * @author Axel Berndt
 */

/**
 * `GenericMap.applySequencingMap()` copies articulation elements without renumbering their
 * `noteid`, so the copies all point at the original note. This walks the mapping returned by
 * `Msm.resolveRepetitions()` and repoints them. The map mutates in place.
 *
 * `noteIdMappings` is a chain, not a lookup table: it maps each note id to the id its next
 * copy received. Hence the walk from index 1, stepping `current` once per element — the
 * first occurrence keeps the original id, and the n-th gets the id found after n-1 steps.
 *
 * @param noteIdMappings note id → id of the next copy of that note
 */
export function updateMpmNoteidsAfterResolvingRepetitions(
  map: { getXml(): Element },
  noteIdMappings: Map<string, string>,
): void {
  for (const key of noteIdMappings.keys()) {
    const ns = map.getXml().query(`descendant::*[attribute::noteid = '#${key}']`);
    if (ns.size() < 2)
      // one occurrence keeps the original id
      continue;

    let current: string | undefined = key;
    for (let i = 1; i < ns.size(); ++i) {
      // the chain ends where a note has no further copy
      if (current === undefined) break;
      current = noteIdMappings.get(current);
      const a = attribute('noteid', ns.get(i) as Element);
      if (a != null && current != null) {
        a.setValue(`#${current}`);
      }
    }
  }
}
