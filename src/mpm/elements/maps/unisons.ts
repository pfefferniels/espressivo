import type { Element } from '../../../xml/XomTypes.js';
import { getAttributeValue } from '../../../xml/tree.js';
import type { GenericMap } from './GenericMap.js';

/**
 * Unisons in a v2 ornament: two or more notes of one pitch at one date, which the score writes
 * as separate notes — two voices, two layers or two parts meeting on a note — and an instrument
 * plays as ONE key. An arpeggio orders keys, so a unison takes one slot in it.
 *
 * The reference gives every note its own slot. For a pitch-ordered arpeggio that means two
 * notes the ordering cannot tell apart are put one after the other in whatever order the parts
 * and the score happen to list them, and the key is struck twice: once at each slot's onset,
 * with each slot's share of the dynamics gradient. With an id list the same happens when both
 * notes are named, and when only one is, the one left out stays at the written onset while the
 * named one moves. PARITY.md §1 records the fix and why it moves no reference byte.
 *
 * Both helpers here only regroup: they return new arrays of the elements they were given (or,
 * for an id list, of the elements found in `maps`), write nothing, and leave every note that
 * shares its key with no other exactly where the reference put it — in a slot of its own.
 */

/**
 * The key a note strikes, as its date and pitch, or null for a note without a readable
 * `midi.pitch` or `date`, which is in unison with nothing: such a note keeps a slot of its own,
 * as in the reference.
 *
 * The date is part of the key because "the notes at the ornament's date" are not always at it:
 * `GenericMap.getAllElementsAt` answers a date a map does not carry with that map's next entry,
 * as Java does, so the pool can hold a later note of a part that is silent at the date.
 */
function keyOf(note: Element): string | null {
  const pitch = parseFloat(getAttributeValue('midi.pitch', note));
  const date = parseFloat(getAttributeValue('date', note));
  return Number.isFinite(pitch) && Number.isFinite(date) ? `${date} ${pitch}` : null;
}

/**
 * `notes` as the keys they strike: one chord per key (date and pitch), holding every note of
 * that key, in the order each key is first met. Within a chord the notes keep the order they
 * were given in.
 *
 * Used where an ornament pools every note at its date: the caller sorts the chords by pitch
 * afterwards, and since no two chords at one date share a pitch any more, that sort no longer
 * has a unison to break by part and document order.
 */
export function unisonChords(notes: readonly Element[]): Element[][] {
  const chords: Element[][] = [];
  const byKey = new Map<string, Element[]>();
  for (const note of notes) {
    const key = keyOf(note);
    const chord = key === null ? undefined : byKey.get(key);
    if (chord !== undefined) {
      chord.push(note);
      continue;
    }
    const opened = [note];
    chords.push(opened);
    if (key !== null) byKey.set(key, opened);
  }
  return chords;
}

/**
 * The notes an explicit `note.order` id list names, as the keys they strike, in the order the
 * list names them: each named note brings every note of `maps` it is in unison with (same
 * `date`, same pitch) into its slot, whether the list names that note too or not.
 *
 * A note the list names again, directly or through a unison, stays in the slot of its first
 * mention, so no note is placed twice — which also settles the degenerate case of an id written
 * twice in the list: the reference gave it two slots, and `TemporalSpread` adds the second
 * offset onto the first.
 *
 * The unison partners are looked up in `maps`, the score maps the ornament reaches: a global
 * ornament finds them in every part, a part's own ornament in that part only.
 */
export function listedUnisonChords(
  named: readonly Element[],
  maps: readonly GenericMap[],
): Element[][] {
  const chords: Element[][] = [];
  const placed = new Set<Element>();
  for (const note of named) {
    if (placed.has(note)) continue;
    const chord = [note, ...partnersOf(note, maps).filter((partner) => !placed.has(partner))];
    for (const member of chord) placed.add(member);
    chords.push(chord);
  }
  return chords;
}

/** Every other note of `maps` on `note`'s key, in map and score order. */
function partnersOf(note: Element, maps: readonly GenericMap[]): Element[] {
  const key = keyOf(note);
  if (key === null) return [];
  const date = parseFloat(getAttributeValue('date', note));
  return maps.flatMap((map) =>
    map
      .getAllElementsAt(date)
      .map((entry) => entry.value)
      .filter((other) => other !== note && other.getLocalName() === 'note' && keyOf(other) === key),
  );
}
