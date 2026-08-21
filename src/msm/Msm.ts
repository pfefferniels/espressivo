import { Element, Attribute, Nodes, Elements, Document } from '../xml/XomTypes.js';
import { AbstractMsm } from './AbstractMsm.js';
import { Goto } from './Goto.js';
import { KeyValue } from '../supplementary/KeyValue.js';
import { v4 as uuidv4 } from 'uuid';
import { filterMap } from '../prelude/index.js';
import {
  allChildElements,
  attribute,
  cloneElement,
  firstChildElement,
  getAttributeValue,
  getNextSiblingElement,
  requireAttribute,
  requireFirstChildElement,
  requireParentElement,
} from '../xml/tree.js';
import { MeicoError, MissingNodeError } from '../xml/errors.js';
import { addUUID } from '../xml/ids.js';

import { Midi } from '../midi/Midi.js';
import { Sequence, Track } from '../midi/MidiTypes.js';
import * as EventMaker from '../midi/EventMaker.js';
import type { Performance } from '../mpm/elements/Performance.js';
import type { RenderOptions } from '../mpm/RenderOptions.js';

/**
 * Strip the extension from a filename. Module-local rather than the shared
 * {@link module:music/text.getFilenameWithoutExtension} because the two differ on one input: a
 * filename with no dot at all. `lastIndexOf` is then -1, and the shared copy evaluates
 * `substring(0, -1)`, which JavaScript reads as `substring(0, 0)` — the empty string — where
 * this one returns the name. Neither is Java's, whose `String.substring(0, -1)` throws.
 *
 * This copy is what the reference behaviour of {@link Msm.getTitle} and {@link Msm.renderMidi}
 * was measured against; under the shared one an extensionless file would title the movement `''`
 * and name its MIDI `.mid`. The divergence is pinned by
 * `tests/msm/navigationEquivalence.test.ts`.
 */
function getFilenameWithoutExtension(filename: string): string {
  const i = filename.lastIndexOf('.');
  if (i === 0) return filename;
  if (i === -1) return filename;
  return filename.substring(0, i);
}

/**
 * Rename `copy`'s `xml:id` to `meico_repetition_<reps>_<baseId>` and record the step in the
 * old-id → new-id chain. No-op for a copy with no `xml:id`.
 *
 * `repetitionIDs` is a chain, not a base-id index: `base → rep1 → rep2 → …`. The backwards walk
 * follows it from the base id to the id of the previous iteration, which is the key the new
 * entry belongs under, so a caller can follow any old id forward to its current one.
 *
 * The chain cannot be broken from inside this module: an element reaching `reps` has passed
 * through here `reps - 1` times already, each of those wrote the entry this step reads, and
 * `resolveSequencingMaps` threads one table through every call. An outside caller of the public
 * `applySequencingMapToMap` can break it by supplying a fresh table for a second pass, which
 * throws rather than writing an entry under an `undefined` key.
 */
function recordRepetitionId(repetitionIDs: Map<string, string>, copy: Element, reps: number): void {
  const id = copy.getAttribute('id', 'http://www.w3.org/XML/1998/namespace');
  if (id === null) return;

  let prevId = id.getValue();
  const newId = `meico_repetition_${String(reps)}_${prevId}`;
  id.setValue(newId);

  // the key of the map entry is the ID of the previous iteration, not the base ID
  for (let r = reps - 1; r > 0; --r) {
    const linked = repetitionIDs.get(prevId);
    if (linked === undefined)
      throw new MeicoError(
        `the repetition id chain for "${prevId}" is missing its step ${String(r)}; ` +
          'applySequencingMapToMap was given an id table that an earlier pass did not fill',
      );
    prevId = linked;
  }
  repetitionIDs.set(prevId, newId);
}

/**
 * A document in MSM format (Musical Sequence Markup), the middle of the pipeline:
 * `Mei2MsmMpmConverter` turns an MEI score into an MSM (what is played, in symbolic time) plus
 * an MPM (how it is played), and this class turns an MSM back into MIDI. Its two exports are the
 * two halves of that:
 *
 * - {@link exportMidi} — the score as written. Dates are MSM ticks, one tempo event, one
 *   velocity for every note.
 * - {@link exportExpressiveMidi} — the score as performed. Expects the `milliseconds.date` /
 *   `milliseconds.date.end` / `velocity` attributes that {@link Performance.perform} writes, and
 *   reads those instead of `date`/`duration`.
 *
 * The document is `<msm>` → one `<global>` plus one `<part>` per instrument; each of those is
 * `<header>` + `<dated>`, and `<dated>` holds the maps — `timeSignatureMap`, `keySignatureMap`,
 * `markerMap`, `sequencingMap`, `pedalMap`, `miscMap`, and in a part also `<score>`, the note
 * list itself. A part's own map wins over the global one of the same name wherever both exist.
 *
 * The XML tree is the single source of truth: this class holds no parsed model beside it, every
 * getter reads the tree, and every mutator writes it.
 *
 * Two of the maps are not read during MIDI export but consumed earlier: `sequencingMap` by
 * {@link resolveSequencingMaps} (repeats and jumps, applied before anything is rendered) and
 * `miscMap`, which is scratch space the MEI converter deletes on its way out.
 *
 * Port of meico.msm.Msm
 * @author Axel Berndt.
 */
export class Msm extends AbstractMsm {
  /**
   * In expressive export, sub-note dynamics turn the channelVolumeMap into a series of
   * control change events. This is the minimum distance in milliseconds between two of
   * them: a non-`mandatory` entry closer than this to the one already emitted is dropped.
   *
   * {@link parseChannelVolumeMap} is the only reader — the position map is not thinned.
   * Java: `Msm.java:25,1073`.
   */
  private static readonly CONTROL_CHANGE_DENSITY: number = 10;

  /**
   * A fresh Msm with empty global maps.
   *
   * The eight global maps are created empty and in this order, and the order is part of the
   * serialised output: nothing sorts `<dated>` afterwards, so a fresh MSM's global `<dated>` has
   * exactly this child sequence.
   *
   * @param id an id for the root element, or null for a random UUID. Unlike {@link addUUID} that
   *   UUID is bare, with no `meico_` prefix (as Java does, `Msm.java:121`), so the equivalence
   *   tests' `meico_` canonicalisation does not cover it and a null `id` yields output that
   *   differs run to run. The pipeline never takes that branch — `Mei2MsmMpmConverter` always
   *   passes an explicit movement id.
   */
  static createMsm(title: string, id: string | null, ppq: number): Msm {
    const root = new Element('msm');
    root.addAttribute(new Attribute('title', title));

    const idAttribute = new Attribute(
      'xml:id',
      'http://www.w3.org/XML/1998/namespace',
      id === null ? uuidv4() : id,
    );
    root.addAttribute(idAttribute);

    const global = new Element('global');
    const dated = new Element('dated');
    const header = new Element('header');

    root.addAttribute(new Attribute('pulsesPerQuarter', String(ppq)));

    dated.appendChild(new Element('timeSignatureMap'));
    dated.appendChild(new Element('keySignatureMap'));
    dated.appendChild(new Element('markerMap')); // rehearsal marks
    dated.appendChild(new Element('sectionMap'));
    dated.appendChild(new Element('phraseMap'));
    dated.appendChild(new Element('sequencingMap'));
    dated.appendChild(new Element('pedalMap'));
    dated.appendChild(new Element('miscMap'));

    global.appendChild(header);
    global.appendChild(dated);
    root.appendChild(global);

    return new Msm(new Document(root));
  }

  /**
   * A deep copy of this Msm, carrying over the validity flag and the file path.
   * @throws {MissingNodeError} when this Msm is empty and there is nothing to copy;
   *   `Performance.cloneForRender` is the caller that can reach it
   */
  clone(): Msm {
    const document = this.getDocument();
    if (document === null) throw new MissingNodeError('an empty Msm has no document to clone');

    const clone = new Msm(document.copy());
    clone.isValidFlag = this.isValid();
    const file = this.getFile();
    if (file !== null) clone.setFile(file);
    return clone;
  }

  /**
   * The root element's `title`, else the filename without extension, else `""`.
   */
  getTitle(): string {
    const title = attribute('title', this.getRootElement());
    if (title !== null) return title.getValue();

    const file = this.getFile();
    return file === null ? '' : getFilenameWithoutExtension(file);
  }

  /**
   * The timing resolution in pulses per quarter note.
   * @returns 0 where there is no document or no `pulsesPerQuarter` on its root, `NaN` where the
   *   attribute is not numeric
   */
  getPPQ(): number {
    const ppq = attribute('pulsesPerQuarter', this.getRootElement());
    return ppq === null ? 0 : parseInt(ppq.getValue());
  }

  /**
   * {@link getPPQ} under its long name.
   */
  getPulsesPerQuarter(): number {
    return this.getPPQ();
  }

  /**
   * Overwrite the `pulsesPerQuarter` attribute, leaving every date value as it is —
   * {@link convertPPQ} is the safe way to change the timing basis.
   *
   * The attribute must already exist: this setter does not create it, and an empty Msm or a root
   * without `pulsesPerQuarter` throws.
   */
  setPulsesPerQuarter(ppq: number): void {
    requireAttribute('pulsesPerQuarter', this.requireRootElement()).setValue(String(ppq));
  }

  /**
   * {@link setPulsesPerQuarter} under its short name.
   */
  setPPQ(ppq: number): void {
    this.setPulsesPerQuarter(ppq);
  }

  /**
   * Change the timing basis: set the new ppq and rescale every `date`, `date.end` and `duration`
   * in the document by `ppq / ppqOld`.
   *
   * Order-dependent: the log line reads the old resolution, so it must run before `setPPQ`, and
   * the factor is captured before the attribute is overwritten. `milliseconds.date` and friends
   * are deliberately not in the XPath — they are absolute times and do not scale with ppq.
   */
  convertPPQ(ppq: number): void {
    const ppqOld = this.getPPQ();
    if (ppqOld === ppq) return;

    console.log(
      `Converting timing basis of "${this.getTitle()}" from ${this.getPulsesPerQuarter()} to ${ppq} pulses per quarter note.`,
    );

    this.setPPQ(ppq);

    const atts: Nodes = this.requireRootElement().query(
      'descendant::*[attribute::date]/attribute::date | descendant::*[attribute::date.end]/attribute::date.end | descendant::*[attribute::duration]/attribute::duration',
    );
    for (const node of atts) {
      if (!(node instanceof Attribute)) continue;
      node.setValue(String((parseFloat(node.getValue()) * ppq) / ppqOld));
    }
  }

  /**
   * {@link convertPPQ} under its long name.
   */
  convertPulsesPerQuarter(ppq: number): void {
    this.convertPPQ(ppq);
  }

  /**
   * The minimal integer timing resolution that still represents this score's rhythms accurately.
   * For each note it walks powers of two upwards until one divides the note's duration — then
   * its date — exactly, and keeps the finest value found over all notes.
   *
   * @returns the number of subdivisions per quarter note the score needs, a power of two
   *
   * Three details are Java's (`Msm.java:254-279`) and all three are load-bearing:
   * 1. `ppq / subdivs` is integer division there (`Msm.java:262` and `:270`, both operands
   *    `int`), hence `Math.trunc` here. Float division would agree only while `subdivs` divides
   *    `ppq`.
   * 2. Both inner loops start at the running `maxSubdivisions`, not at 1, so `Math.max` can
   *    never raise anything — the value only ever grows.
   * 3. The result is therefore order-dependent and can exceed what any single note needs: at ppq
   *    720 a duration of 22 matches at `subdivs` 32 (720/32 truncates to 22), and a whole-quarter
   *    note coming after it then matches only at 128 (720/128 truncates to 5) — so dates and
   *    durations `[22, 720]` yield 128 where `[720, 22]` yield 32. Confirmed by running the Java
   *    arithmetic.
   *
   * Nothing in `src/` calls this — Java's only caller is `exportPitches`, which this port does
   * not have — so the unit tests are the only exercise it gets.
   */
  getMinimalPPQ(): number {
    const ppq = this.getPPQ();
    let maxSubdivisions = 1;

    const parts = this.getPartsArray();
    for (const part of parts) {
      const dated = part.getFirstChildElement('dated');
      if (dated === null) continue;
      const score = dated.getFirstChildElement('score');
      if (score === null) continue;
      for (const note of score.getChildElements('note')) {
        // A note with no `duration` or `date` yields `NaN` here, and `NaN % k` is `NaN`, so no
        // `subdivs` matches and the note contributes nothing. Java diverges on that input —
        // `Double.parseDouble(null)` throws an NPE nothing catches — but no fixture carries
        // such a note, and this method has no caller in `src/`.
        const dur = Math.round(parseFloat(getAttributeValue('duration', note)));
        for (let subdivs = maxSubdivisions; subdivs <= ppq; subdivs *= 2) {
          if (dur % Math.trunc(ppq / subdivs) === 0) {
            maxSubdivisions = Math.max(maxSubdivisions, subdivs);
            break;
          }
        }

        const date = Math.round(parseFloat(getAttributeValue('date', note)));
        for (let subdivs = maxSubdivisions; subdivs <= ppq; subdivs *= 2) {
          if (date % Math.trunc(ppq / subdivs) === 0) {
            maxSubdivisions = Math.max(maxSubdivisions, subdivs);
            break;
          }
        }
      }
    }

    return maxSubdivisions;
  }

  /**
   * {@link AbstractMsm.makePartFromString} plus the MSM-specific maps. The element is not added
   * to the document; that is the caller's job.
   *
   * The child order below is the order they appear in the serialised part, and it is not the
   * global `<dated>` order in {@link createMsm} — the global has a `sectionMap` and no
   * `<score>`, the part has a `<score>` and a `miscMap` containing a `tupletSpanMap`. Both
   * orders are Java's.
   */
  static override makePartFromString(
    name: string,
    number: string,
    midiChannel: number,
    midiPort: number,
  ): Element {
    const part = AbstractMsm.makePartFromString(name, number, midiChannel, midiPort);

    // the `<dated>` the super call appended a line ago
    const dated = requireFirstChildElement(part, 'dated');
    dated.appendChild(new Element('timeSignatureMap'));
    dated.appendChild(new Element('keySignatureMap'));
    dated.appendChild(new Element('markerMap'));
    dated.appendChild(new Element('sequencingMap'));
    dated.appendChild(new Element('pedalMap'));
    dated.appendChild(new Element('phraseMap'));
    const miscMap = new Element('miscMap');
    dated.appendChild(miscMap);
    miscMap.appendChild(new Element('tupletSpanMap'));
    dated.appendChild(new Element('score'));

    return part;
  }

  /**
   * {@link Msm.makePartFromString} with a numeric part number.
   */
  static override makePart(
    name: string,
    number: number,
    midiChannel: number,
    midiPort: number,
  ): Element {
    return Msm.makePartFromString(name, String(number), midiChannel, midiPort);
  }

  /** Append a part to the root element. */
  addPart(part: Element): void {
    this.requireRootElement().appendChild(part);
  }

  /**
   * The part matching the given specification, tried in three rounds over all parts: by
   * `number`, then by `name`, then by MIDI port and channel together. The first round to hit
   * wins, so a number match is never checked against the name.
   */
  getPart(number: number, name: string, midiChannel: number, midiPort: number): Element | null {
    const parts = this.getPartsArray();

    // try to find the part by its number
    for (const part of parts) {
      const numberAtt = attribute('number', part);
      if (numberAtt !== null && parseInt(numberAtt.getValue()) === number) return part;
    }

    // try to find the part by its name
    for (const part of parts) {
      const nameAtt = attribute('name', part);
      if (nameAtt !== null && nameAtt.getValue() === name) return part;
    }

    // try to find the part by its MIDI port and channel
    for (const part of parts) {
      const portAtt = attribute('midi.port', part);
      if (portAtt !== null && parseInt(portAtt.getValue()) === midiPort) {
        const channelAtt = attribute('midi.channel', part);
        if (channelAtt !== null && parseInt(channelAtt.getValue()) === midiChannel) return part;
      }
    }

    return null;
  }

  /** all `<part>` elements, in document order */
  getParts(): Elements {
    return this.requireRootElement().getChildElements('part');
  }

  /** {@link getParts} as an array, for iteration */
  getPartsArray(): Element[] {
    return this.getParts().toArray();
  }

  /** the `<global>` environment, or null if this document has none */
  getGlobal(): Element | null {
    return this.requireRootElement().getFirstChildElement('global');
  }

  /**
   * A `<timeSignature>` entry. `date` is in MSM ticks; a null `id` leaves the element without an
   * `xml:id`.
   */
  static makeTimeSignature(
    date: number,
    numerator: number,
    denominator: number,
    id: string | null,
  ): Element {
    const e = new Element('timeSignature');

    e.addAttribute(new Attribute('date', String(date)));
    e.addAttribute(new Attribute('numerator', String(numerator)));
    e.addAttribute(new Attribute('denominator', String(denominator)));

    if (id !== null)
      e.addAttribute(new Attribute('xml:id', 'http://www.w3.org/XML/1998/namespace', id));

    return e;
  }

  /**
   * Remove every rest. Not part of the `mei.exportMsm()` cleanup, since some applications still
   * need the rests; this is for the ones that want a purged MSM.
   *
   * The XPath is `descendant::*[local-name()='rest']`, so it takes every `<rest>` in the
   * document, not only those under `<score>`. The query result is a fixed snapshot, so unlinking
   * mid-walk cannot disturb it. `removeChild` followed by `detach` is Java's pairing
   * (`Msm.java:415`); the second call has nothing left to do once the first has unlinked the
   * node.
   */
  removeRests(): void {
    const root = this.getRootElement();
    if (root === null) return;

    const r: Nodes = root.query("descendant::*[local-name()='rest']");
    for (const rest of r) {
      // a node on the `descendant::` axis has a parent, so this never continues
      const parent = rest.getParent();
      if (parent === null) continue;
      parent.removeChild(rest);
      rest.detach();
    }
  }

  /**
   * Expand every global and local map according to the sequencingMaps, turning music encoded by
   * reference into literal, linear time.
   *
   * MSM stores repeats, endings and jumps by reference rather than writing the music out twice:
   * a `<sequencingMap>` holds `<goto>` elements ({@link Goto}) saying "on reaching this date,
   * continue at that one". After this runs, every remaining map plays front to back and the
   * sequencingMaps themselves are gone. Everything downstream — performance rendering, MIDI
   * export — assumes it has already happened.
   *
   * A part with its own `<sequencingMap>` uses it and ignores the global one even if its own is
   * empty, which is how a part opts out of a global repeat. Only a part with no local map at all
   * falls back to the global one. That is why the fallback path also checks for an empty global
   * map and skips the part, while the local path does not: an empty local map still means
   * "expand nothing here".
   *
   * Global maps are expanded first, then each part's. Both loops skip `sequencingMap` itself (it
   * is not music), `miscMap` (scratch space, deleted later) and any empty map. The
   * sequencingMaps are removed last, after every map that referred to them has been expanded —
   * the global one especially, since parts without a local map are still reading it during the
   * part loop.
   *
   * One `repetitionIDs` map is threaded through every call so the caller gets a single old-id →
   * new-id table for the whole document; see {@link applySequencingMapToMap} for what goes into
   * it.
   *
   * Nothing in `src/` calls this, in this port or in Java — it is opt-in API. The MEI converter
   * writes sequencingMaps (`Mei2MsmMpmConverter.processEnding` builds the `<goto>`s) but leaves
   * them unexpanded, so an MSM straight out of the pipeline still has its repeats encoded by
   * reference and the reference fixtures contain `<goto>` elements. The fixture pipeline
   * therefore does not exercise the expansion below; `tests/msm/MsmSequencing.test.ts` covers it.
   *
   * @returns xml:id mappings for the elements that were copied and needed an updated id
   */
  resolveSequencingMaps(): Map<string, string> {
    const repetitionIDs = new Map<string, string>();
    const root = this.getRootElement();
    if (root === null) return repetitionIDs;

    // a missing `<global>` or `<dated>` throws here
    const globalDated = requireFirstChildElement(requireFirstChildElement(root, 'global'), 'dated');
    const globalSequencingMap = globalDated.getFirstChildElement('sequencingMap');
    const parts = root.getChildElements('part');

    // expand global maps
    if (globalSequencingMap !== null) {
      const maps = globalDated.getChildElements();
      for (const map of maps) {
        if (
          map.getChildCount() === 0 ||
          map.getLocalName() === 'miscMap' ||
          map.getLocalName() === 'sequencingMap'
        )
          continue;

        const newMap = Msm.applySequencingMapToMap(globalSequencingMap, map, repetitionIDs);
        if (newMap !== null) globalDated.replaceChild(map, newMap);
      }
    }

    for (const part of parts) {
      const partDated = requireFirstChildElement(part, 'dated'); // a part without one throws
      let sequencingMap = partDated.getFirstChildElement('sequencingMap');
      let localMap = true;
      if (sequencingMap === null) {
        localMap = false;
        sequencingMap = globalSequencingMap;
        // an absent or empty global map leaves this part unexpanded
        if (sequencingMap === null || sequencingMap.getChildCount() === 0) continue;
      }

      const maps = partDated.getChildElements();
      for (const map of maps) {
        if (
          map.getChildCount() === 0 ||
          map.getLocalName() === 'miscMap' ||
          map.getLocalName() === 'sequencingMap'
        )
          continue;

        const newMap = Msm.applySequencingMapToMap(sequencingMap, map, repetitionIDs);
        if (newMap !== null) requireParentElement(map).replaceChild(map, newMap);
      }

      // the local sequencingMap does not apply any more
      if (localMap) {
        partDated.removeChild(sequencingMap);
        sequencingMap.detach();
      }
    }

    // nor does the global one
    if (globalSequencingMap !== null) {
      globalDated.removeChild(globalSequencingMap);
      globalSequencingMap.detach();
    }

    return repetitionIDs;
  }

  /**
   * Expand `map` according to `sequencingMap` — the heart of repeat and ending resolution, and
   * the most order-sensitive code in this file. Nothing below may be reordered, rewritten as
   * array methods or otherwise simplified: the arithmetic has to stay bit-identical to Java
   * (`Msm.java:500`) and the traversal has to visit elements in exactly the same sequence.
   *
   * `newMap` starts as a flat copy of `map` and is refilled by walking the original in playback
   * order. `currentDate` is where playback has got to in the original, `dateOffset` is how far
   * ahead the new map has run because of material already repeated. Each iteration of the outer
   * loop finds the next goto at or after `currentDate` that is still active, copies everything
   * from `currentDate` up to (not including) the goto's date, then jumps: `dateOffset` grows by
   * the distance skipped and `currentDate` moves to the goto's target.
   *
   * The `continue gotoSearch` at the end of a taken jump restarts the goto search from the
   * beginning, because a jump can land before gotos that were already passed and those must be
   * reconsidered. It still terminates: a goto is only ever taken by consuming a `1` from its
   * {@link Goto.activity} string, and every test of a goto advances that string's cursor, so the
   * number of jumps is bounded by the number of `1`s in the sequencingMap. Falling out of the
   * inner `for` — a full pass over `gotos` with none applying — is what ends the search.
   *
   * The second, near-identical loop copies the tail, everything from the last jump to the end of
   * the map, with no goto to stop at. It differs in one deliberate way: no `else` branch adding
   * a fresh `repetitionCounter`, because nothing will visit those elements again.
   *
   * A repeated element would otherwise appear twice with the same `xml:id`. To renumber the
   * duplicates, the original element — not the copy — is tagged with a temporary
   * `repetitionCounter`: absent means "first time seen", otherwise it holds how often it has
   * been copied, and copy n gets `meico_repetition_<n>_<baseId>` (see {@link recordRepetitionId}
   * for the id chain that records). Because the counter is written on the original, the copy
   * made on the first encounter carries none while every later copy carries a stale one — which
   * is why the cleanup at the end sweeps `newMap` as well as `map`.
   *
   * @param repetitionIDs filled with the xml:id mappings of the copies that were renumbered
   * @returns the expanded map, to replace the old one, or null to keep the old one
   */
  static applySequencingMapToMap(
    sequencingMap: Element,
    map: Element,
    repetitionIDs: Map<string, string>,
  ): Element | null {
    const gs = sequencingMap.getChildElements('goto');
    if (gs.size() === 0) return null; // nothing to expand

    // a `<goto>` that does not parse is reported and dropped; see Goto.initFromElement
    const gotos = filterMap(gs, (g) => {
      try {
        return new Goto(g);
      } catch (e) {
        console.error(e);
        return null;
      }
    });

    const newMap = cloneElement(map); // flat copy, refilled below in playback order

    let currentDate = 0.0;
    let dateOffset = 0.0; // sums up the offsets that come from inserting repetitions
    gotoSearch: for (;;) {
      for (const gt of gotos) {
        if (gt.date < currentDate || !gt.isActive()) continue;

        // copy everything between currentDate and gt.date from the original map into newMap
        for (
          let e = Msm.getElementAtAfter(currentDate, map);
          e !== null;
          e = getNextSiblingElement(e)
        ) {
          // `getElementAtAfter` yields only dated elements, but `getNextSiblingElement` steps
          // to the next sibling of any name, so an undated one can arrive here. It throws,
          // naming `date` at the point the map's ordering invariant is broken.
          const dateAttribute = requireAttribute('date', e);
          currentDate = parseFloat(dateAttribute.getValue());
          if (currentDate >= gt.date) break; // at or after the goto: do not copy further
          const eCopy = e.copy();
          requireAttribute('date', eCopy).setValue(String(currentDate + dateOffset));

          const endDate = e.getAttribute('date.end');
          if (endDate !== null) {
            const dur = parseFloat(endDate.getValue()) - parseFloat(dateAttribute.getValue());
            requireAttribute('date.end', eCopy).setValue(String(currentDate + dur + dateOffset));
          }

          const repetitionCounter = e.getAttribute('repetitionCounter');
          if (repetitionCounter !== null) {
            const reps = 1 + parseInt(repetitionCounter.getValue());
            repetitionCounter.setValue(String(reps));
            recordRepetitionId(repetitionIDs, eCopy, reps);
          } else {
            // first time this element is processed
            e.addAttribute(new Attribute('repetitionCounter', '0'));
          }
          newMap.appendChild(eCopy);
        }

        dateOffset += gt.date - gt.targetDate;
        currentDate = gt.targetDate;
        continue gotoSearch;
      }
      break; // no goto applied on a full pass, so playback is past the last one
    }

    // last goto has been processed, now do the rest until the end marker
    for (
      let e = Msm.getElementAtAfter(currentDate, map);
      e !== null;
      e = getNextSiblingElement(e)
    ) {
      const dateAttribute = requireAttribute('date', e); // see the note in the loop above
      currentDate = parseFloat(dateAttribute.getValue());
      const eCopy = e.copy();
      requireAttribute('date', eCopy).setValue(String(currentDate + dateOffset));

      const endDate = e.getAttribute('date.end');
      if (endDate !== null) {
        const dur = parseFloat(endDate.getValue()) - parseFloat(dateAttribute.getValue());
        requireAttribute('date.end', eCopy).setValue(String(currentDate + dur + dateOffset));
      }

      const repetitionCounter = e.getAttribute('repetitionCounter');
      if (repetitionCounter !== null) {
        const reps = 1 + parseInt(repetitionCounter.getValue());
        repetitionCounter.setValue(String(reps));
        recordRepetitionId(repetitionIDs, eCopy, reps);
      }

      newMap.appendChild(eCopy);
    }

    // Cleanup: strip every repetitionCounter from both maps. Forward rather than backwards —
    // a query result is a fixed snapshot of distinct elements and each visit only strips an
    // attribute from the element it landed on, so no step depends on an earlier one.
    const dropRepetitionCounters = (from: Element): void => {
      for (const node of from.query('descendant::*[@repetitionCounter]')) {
        if (!(node instanceof Element)) continue;
        node.removeAttribute(requireAttribute('repetitionCounter', node));
      }
    };
    dropRepetitionCounters(map);
    dropRepetitionCounters(newMap);

    return newMap;
  }

  /**
   * writes the msm document as XML string
   * @returns the XML string, or null if there is no document
   *
   * Java writes a file here and returns a success flag; this port has no file system and
   * returns the serialisation instead, hence the changed return type.
   */
  writeMsm(): string | null {
    return this.exportXml();
  }

  /**
   * The msm document as an XML string, or null if there is no document.
   *
   * @param _filename inert. It mirrors Java's `writeMsm(String filename)`, which this port
   *   cannot honour without a file system; kept so ported call sites still compile.
   */
  writeMsmString(_filename?: string): string | null {
    return this.exportXml();
  }

  /**
   * Render this MSM as plain, non-expressive MIDI: symbolic dates as MIDI ticks, one
   * initial tempo event, a fixed velocity of 100 for every note.
   *
   * @param generateProgramChanges if true (the default), a program change is generated
   *   per part from its `name` attribute — useful for MIR and as a cheap piano reduction,
   *   but it will not un-set a channel your synth already has on another instrument
   * @returns the Midi object, or null if this MSM is empty
   */
  exportMidi(generateProgramChanges: boolean): Midi | null;
  /**
   * Render this MSM as plain, non-expressive MIDI.
   * @param bpm the tempo of the midi track; 120 by default
   * @param generateProgramChanges see the boolean overload; true by default
   * @returns the Midi object, or null if this MSM is empty
   */
  exportMidi(bpm?: number, generateProgramChanges?: boolean): Midi | null;
  exportMidi(bpmOrGenPC?: number | boolean, generateProgramChanges?: boolean): Midi | null {
    let bpm = 120.0;
    let genPC = true;
    if (typeof bpmOrGenPC === 'number') {
      bpm = bpmOrGenPC;
      if (generateProgramChanges !== undefined) genPC = generateProgramChanges;
    } else if (typeof bpmOrGenPC === 'boolean') {
      genPC = bpmOrGenPC;
    }
    return this.renderMidi(bpm, genPC, false);
  }

  /**
   * Render this MSM as expressive MIDI — the performed, millisecond-timed version.
   *
   * @param performance if given, it is applied to a copy of this MSM first
   *   ({@link Performance.perform}) and the result is rendered; if omitted, this MSM is
   *   rendered as-is and must already carry the performance attributes
   * @param generateProgramChanges true by default; ignored when `performance` is omitted,
   *   as in Java (`Msm.java:667`), because that path delegates with a hard-coded `true`
   * @param options render knobs, passed straight through to {@link Performance.perform};
   *   ignored when `performance` is omitted, since nothing is then rendered. This layer
   *   deliberately knows nothing about their defaults — `src/msm/` may only `import type`
   *   from `src/mpm/` (RULE M1), so every default is resolved there, at the point of use
   * @returns the Midi object, or null if the MSM being rendered is empty
   *
   * Without the performance attributes (`milliseconds.date`, `milliseconds.date.end`,
   * `velocity`) the render silently falls back to the symbolic `date`/`duration` and
   * logs; the output is then MIDI in name only. That fallback is per element, not per
   * document — see {@link readMillisecondsDateFromElement}.
   */
  exportExpressiveMidi(
    performance?: Performance,
    generateProgramChanges?: boolean,
    options?: RenderOptions,
  ): Midi | null {
    const genPC = generateProgramChanges !== undefined ? generateProgramChanges : true;
    if (performance !== undefined) {
      return performance.perform(this, options).renderMidi(83.33, genPC, true);
    }
    return this.renderMidi(83.33, true, true);
  }

  /**
   * The one real MIDI renderer behind both export methods.
   *
   * @param bpm tempo for the single initial tempo event; ignored when `exportExpressive`
   * @param generateProgramChanges whether to synthesise program changes from part names
   * @param exportExpressive read the performance attributes instead of the symbolic ones
   * @returns the Midi object, or null if this MSM is empty
   *
   * Track 0 is the global track and carries the tempo, then the global marker, time
   * signature and key signature maps. Each part with a `midi.channel` then gets its own
   * track, in document order — which is why part order in the MSM is part of the MIDI
   * byte output, not a presentational detail.
   *
   * Within a part the order of the calls below is the order the events are created in,
   * and several of them depend on it:
   *
   * - port and channel-prefix meta events first, at date 0, before anything channel-bound;
   * - `parseProgramChangeMap` runs *before* `processPartName` and its return value
   *   suppresses the name-derived program change: an explicit programChangeMap wins over
   *   the guess made from the part name, and only when the map contains an entry at date
   *   0 (`weHaveAnInitialPrgCh`), since a later-only map would leave the opening bars on
   *   the wrong instrument;
   * - the volume and position maps run before the score so their opening control changes
   *   precede the first note-on at the same date.
   *
   * The two expressive-only preliminaries are also order-bound:
   * {@link makeMillisecondTickTempo} redefines the tick as one millisecond (everything
   * downstream then reads `milliseconds.*`), and {@link fitVelocities} compresses
   * out-of-range velocities *before* any note event is built from them.
   */
  private renderMidi(
    bpm: number,
    generateProgramChanges: boolean,
    exportExpressive: boolean,
  ): Midi | null {
    const file = this.getFile();
    console.log(`\nConverting ${file !== null ? file : 'MSM data'} to MIDI.`);

    const root = this.getRootElement();
    if (root === null) return null;

    const ppq = this.getPPQ();
    const seq = new Sequence(Sequence.PPQ, ppq);

    let track = seq.createTrack();

    if (exportExpressive) {
      this.makeMillisecondTickTempo(track);
      this.fitVelocities(0, 127);
    } else {
      this.makeInitialTempo(bpm, track);
    }

    const global = requireFirstChildElement(root, 'global');
    this.parseMarkerMap(global, track, exportExpressive);
    this.parseTimeSignatureMap(global, track, exportExpressive);
    this.parseKeySignatureMap(global, track, exportExpressive);

    for (
      let part = root.getFirstChildElement('part');
      part !== null;
      part = getNextSiblingElement('part', part)
    ) {
      const channelAttribute = part.getAttribute('midi.channel');
      if (channelAttribute === null) continue;

      track = seq.createTrack();

      const portAttribute = part.getAttribute('midi.port');
      const port = portAttribute === null ? 0 : parseInt(portAttribute.getValue());
      track.add(EventMaker.createMidiPortEvent(0, port));

      const chan = parseInt(channelAttribute.getValue());
      track.add(EventMaker.createChannelPrefix(0, chan));

      let reallyGenerateProgramChanges = generateProgramChanges;
      if (reallyGenerateProgramChanges) {
        reallyGenerateProgramChanges = !this.parseProgramChangeMap(
          part,
          track,
          chan,
          exportExpressive,
        );
      }
      this.processPartName(part, track, chan, reallyGenerateProgramChanges);

      this.parseKeySignatureMap(part, track, exportExpressive);
      this.parseTimeSignatureMap(part, track, exportExpressive);
      this.parseMarkerMap(part, track, exportExpressive);

      this.parseChannelVolumeMap(part, track, exportExpressive);
      this.parsePositionMap(part, track, exportExpressive);

      this.processScore(part, track, exportExpressive);
    }

    if (file !== null) {
      // same rewrite Java does with Helper.getFilenameWithoutExtension (Msm.java:777)
      const midi = new Midi(seq, `${getFilenameWithoutExtension(file)}.mid`);
      console.log('MSM to MIDI conversion finished.');
      return midi;
    }

    console.log('MSM to MIDI conversion finished.');
    return new Midi(seq);
  }

  /**
   * The single tempo event of a non-expressive export, at date 0.
   *
   * `bpm` counts beats, and a beat is one unit of the first global time signature's denominator
   * — so 120 bpm in 6/8 means 120 eighths, not 120 quarters.
   *
   * The two absences here are not the same absence, and Java distinguishes them too. A missing
   * link in the navigation — no global, no dated, no timeSignatureMap, no timeSignature — falls
   * back to a quarter-note beat. A `<timeSignature>` present but carrying no `denominator`
   * yields `1.0 / NaN`, i.e. `NaN`, not the 0.25 fallback.
   */
  private makeInitialTempo(bpm: number, track: Track): void {
    const root = this.getRootElement();
    const global = root === null ? null : root.getFirstChildElement('global');
    const dated = global === null ? null : global.getFirstChildElement('dated');
    const map = dated === null ? null : dated.getFirstChildElement('timeSignatureMap');
    const timeSignature = map === null ? null : map.getFirstChildElement('timeSignature');

    let beatlength: number;
    if (timeSignature === null) {
      beatlength = 0.25; // Java's catch-all arm
    } else {
      const denominator = timeSignature.getAttributeValue('denominator');
      beatlength = 1.0 / (denominator === null ? NaN : parseInt(denominator));
    }
    track.add(EventMaker.createTempo(0, bpm, beatlength));
  }

  /**
   * The tempo trick that makes expressive export work: at `60000 / ppq` quarter-note bpm,
   * one MIDI tick lasts exactly one millisecond. Every date written afterwards is
   * therefore a millisecond value read straight from the performance attributes, with no
   * conversion anywhere, and the MSM's own ppq survives as the sequence resolution.
   */
  private makeMillisecondTickTempo(track: Track): void {
    track.add(EventMaker.createTempo(0, 60000.0 / this.getPPQ(), 0.25));
  }

  /**
   * Turns the part's `name` attribute into a program change (a guess at the instrument,
   * by name lookup) and a track name event.
   *
   * A part with no usable name still gets a program change — to Acoustic Grand Piano — but no
   * track name. `generateProgramChanges` is the resolved flag: the caller clears it when a
   * programChangeMap has supplied an initial program change, so this never overrides an explicit
   * one.
   */
  private processPartName(
    part: Element,
    track: Track,
    channel: number,
    generateProgramChanges: boolean,
  ): void {
    const name = part.getAttributeValue('name');
    if (name === null || name === '') {
      if (generateProgramChanges) {
        track.add(EventMaker.createProgramChange(channel, 0, EventMaker.PC_Acoustic_Grand_Piano));
      }
      return;
    }

    if (generateProgramChanges) {
      track.add(EventMaker.createProgramChangeByName(channel, 0, name));
    }
    track.add(EventMaker.createTrackName(0, name));
  }

  /**
   * Renders the part's programChangeMap.
   *
   * @returns whether the map contained an entry at date 0 — not whether it rendered anything.
   *   The caller uses it to decide whether {@link processPartName} still has to invent an
   *   opening program change: a map that only switches instrument later leaves the opening bars
   *   unset, so the name-derived guess is still wanted.
   *
   * Only reached when program change generation is on at all, so an MSM exported with
   * `generateProgramChanges` false keeps its explicit programChangeMap out of the MIDI
   * too. That is Java's behaviour (`Msm.java:754`), not an oversight of this port.
   */
  private parseProgramChangeMap(
    part: Element,
    track: Track,
    channel: number,
    exportExpressive: boolean,
  ): boolean {
    const dated = part.getFirstChildElement('dated');
    if (dated === null) return false;

    const programChangeMap = dated.getFirstChildElement('programChangeMap');
    if (programChangeMap === null || programChangeMap.getChildCount() === 0) return false;

    let weHaveAnInitialPrgCh = false;
    for (
      let n = programChangeMap.getFirstChildElement('programChange');
      n !== null;
      n = getNextSiblingElement('programChange', n)
    ) {
      const date = exportExpressive
        ? Msm.readMillisecondsDateFromElement(n)
        : Math.round(parseFloat(getAttributeValue('date', n)));
      if (date === 0) weHaveAnInitialPrgCh = true;
      // A `<programChange>` with no `value` yields NaN, which `channelMessage` masks to 0,
      // Acoustic Grand Piano. Java lands on the same number by the same route.
      const value = parseInt(getAttributeValue('value', n));
      track.add(EventMaker.createProgramChange(channel, date, value));
    }
    return weHaveAnInitialPrgCh;
  }

  /**
   * The note events themselves — a text event carrying the note's `xml:id`, a note-on and
   * a note-off per `<note>`. `<rest>` elements are not rendered; only `note` children of
   * `<score>` are visited.
   *
   * The two branches are not symmetric, and both asymmetries are Java's (`Msm.java:1000`):
   *
   * - a note with no `xml:id` gets the text `'unknown'` in the expressive branch but the empty
   *   string in the symbolic one, because the latter goes through {@link getAttributeValue},
   *   whose miss value is `''`;
   * - a missing `milliseconds.date.end` logs and falls back to `date + duration`, mixing a
   *   millisecond date with a tick duration. That is a data error rather than a supported mode,
   *   which is why it is loud.
   *
   * Velocity defaults to 100 where the attribute is absent — the same constant the symbolic
   * branch uses unconditionally.
   */
  private processScore(part: Element, track: Track, exportExpressive: boolean): void {
    const dated = part.getFirstChildElement('dated');
    if (dated === null) return;
    const score = dated.getFirstChildElement('score');
    if (score === null) return;
    const channelAttribute = part.getAttribute('midi.channel');
    if (channelAttribute === null) return;

    const chan = parseInt(channelAttribute.getValue());

    for (
      let n = score.getFirstChildElement('note');
      n !== null;
      n = getNextSiblingElement('note', n)
    ) {
      const pitch = Math.round(parseFloat(getAttributeValue('midi.pitch', n)));

      if (exportExpressive) {
        const date = Msm.readMillisecondsDateFromElement(n);

        const velocityAtt = attribute('velocity', n);
        const velocity =
          velocityAtt === null ? 100 : Math.round(parseFloat(velocityAtt.getValue()));

        const xmlId = n.getAttribute('id', 'http://www.w3.org/XML/1998/namespace');
        track.add(EventMaker.createTextEvent(date, xmlId === null ? 'unknown' : xmlId.getValue()));
        track.add(EventMaker.createNoteOn(chan, date, pitch, velocity));

        let dateEnd: number;
        const endAtt = attribute('milliseconds.date.end', n);
        if (endAtt === null) {
          console.error(
            `Missing attribute "milliseconds.date.end" in element ${n.toXML()}. Using attribute "duration" instead.`,
          );
          const dur = Math.round(parseFloat(getAttributeValue('duration', n)));
          dateEnd = date + dur;
        } else {
          dateEnd = Math.round(parseFloat(endAtt.getValue()));
        }
        track.add(EventMaker.createNoteOff(chan, dateEnd, pitch, 0));
      } else {
        const date = Math.round(parseFloat(getAttributeValue('date', n)));
        // `'id'`, not `'xml:id'`: Java's `Helper.getAttribute` matches a local name, so
        // `Helper.getAttributeValue("xml:id", n)` missed all three of its lookups and always
        // returned `""` — every text event in every reference `.mid` was `FF 01 00`, a
        // zero-length payload. That was a defect in the fork rather than a contract to match; it
        // is fixed there (`meico@68ccd3b8`) and the references were regenerated with the fix.
        const xmlId = getAttributeValue('id', n);
        track.add(EventMaker.createTextEvent(date, xmlId));
        track.add(EventMaker.createNoteOn(chan, date, pitch, 100));

        const dur = Math.round(parseFloat(getAttributeValue('duration', n)));
        track.add(EventMaker.createNoteOff(chan, date + dur, pitch, 0));
      }
    }
  }

  /**
   * Converts the part's channelVolumeMap into channel-volume control changes.
   * Expressive export only — in symbolic export the map is ignored entirely.
   *
   * The loop runs backwards through the map, and that is what implements
   * {@link CONTROL_CHANGE_DENSITY}: of a cluster of entries within the density window the last
   * survives, since it is the one seen first. Entries carrying `mandatory` bypass the thinning.
   * Iterating forwards would keep the first of each cluster instead and change the output. The
   * order of the resulting events is unaffected — `Track.add` sorts by tick, stably.
   *
   * Two paths add a default volume of 100 at date 0: no channelVolumeMap at all, and a map whose
   * earliest surviving entry is after date 0 (`prevDate > 0`, which an empty map also satisfies
   * since `prevDate` is still its initial sentinel).
   */
  private parseChannelVolumeMap(part: Element, track: Track, exportExpressive: boolean): void {
    if (!exportExpressive) return;
    const dated = part.getFirstChildElement('dated');
    if (dated === null) return;
    const channelAttribute = part.getAttribute('midi.channel');
    if (channelAttribute === null) return;

    const chan = parseInt(channelAttribute.getValue());
    const cvMap = firstChildElement('channelVolumeMap', dated);

    if (cvMap === null) {
      track.add(EventMaker.createControlChange(chan, 0, EventMaker.CC_Channel_Volume, 100));
      return;
    }

    let prevDate = Number.MAX_SAFE_INTEGER;
    const es = cvMap.getChildElements();
    for (let i = es.size() - 1; i >= 0; --i) {
      const e = es.get(i);

      const date = Msm.readMillisecondsDateFromElement(e);

      const mandatory = attribute('mandatory', e) !== null;
      if (!mandatory && date >= prevDate - Msm.CONTROL_CHANGE_DENSITY) continue;
      prevDate = date;
      const value = Math.round(parseFloat(getAttributeValue('value', e)));
      track.add(EventMaker.createControlChange(chan, date, EventMaker.CC_Channel_Volume, value));
    }

    if (prevDate > 0) {
      track.add(EventMaker.createControlChange(chan, 0, EventMaker.CC_Channel_Volume, 100));
    }
  }

  /**
   * Converts the part's positionMap (pedalling) into control changes.
   * Expressive export only.
   *
   * Unlike {@link parseChannelVolumeMap} this is not thinned by {@link CONTROL_CHANGE_DENSITY};
   * every entry becomes an event. It iterates backwards too, but here that is shape shared with
   * its neighbour, not a filter.
   *
   * An unrecognised or absent `controller` falls through to controller number 0 — bank select —
   * rather than being skipped. Java does the same (`Msm.java:1092`); only `sustain` and `soft`
   * are mapped.
   */
  private parsePositionMap(part: Element, track: Track, exportExpressive: boolean): void {
    if (!exportExpressive) return;
    const dated = part.getFirstChildElement('dated');
    if (dated === null) return;
    const channelAttribute = part.getAttribute('midi.channel');
    if (channelAttribute === null) return;

    const chan = parseInt(channelAttribute.getValue());
    const posMap = firstChildElement('positionMap', dated);

    if (posMap === null) return;

    const es = posMap.getChildElements();
    for (let i = es.size() - 1; i >= 0; --i) {
      const e = es.get(i);

      const date = Msm.readMillisecondsDateFromElement(e);

      const value = Math.round(parseFloat(getAttributeValue('value', e)));
      const controller = getAttributeValue('controller', e);
      let controllerNumber = 0;

      if (controller === 'sustain') {
        controllerNumber = EventMaker.CC_Damper_Pedal;
      } else if (controller === 'soft') {
        controllerNumber = EventMaker.CC_Soft_Pedal;
      }

      track.add(EventMaker.createControlChange(chan, date, controllerNumber, value));
    }
  }

  /**
   * Converts a keySignatureMap into MIDI key signature events. Called once for `<global>`
   * and once per part, so `part` here is whichever environment is being scanned.
   *
   * MIDI states a key as a signed count of accidentals, so the MSM's list of
   * `<accidental>` children is reduced to one number: a positive `value` adds, a negative
   * one subtracts. `value` is a semitone offset, so a sharp is `1.0` and a flat is `-1.0`
   * (`Mei2MsmMpmConverter` writes exactly those two, and the reference fixtures contain
   * nothing else).
   *
   * The thresholds are `> 0` / `< 0`, not Java's original `> 1.0` / `< 1.0`, which a sharp —
   * exactly `1.0` — passed neither, so a sharp key signature reached MIDI as zero accidentals
   * while a flat one was counted correctly (`keys_accidentals` is D major and Java wrote
   * `sf=0`).
   *
   * Repaired in the fork first (`meico@db83c7c5`, `Msm.java:1151,1155`) and the reference MIDI
   * regenerated from it, so byte equivalence still holds — against a Java that counts sharps.
   * Four fixtures moved by six bytes in all: `keys_accidentals`, `comprehensive`,
   * `composite_advanced` and `tuplets`, each an `sf` byte of `0` becoming the sharp count.
   * Recorded in PARITY.md §3.
   */
  private parseKeySignatureMap(part: Element, track: Track, exportExpressive: boolean): void {
    const dated = part.getFirstChildElement('dated');
    if (dated === null) return;
    const map = dated.getFirstChildElement('keySignatureMap');
    if (map === null) return;

    for (
      let e = map.getFirstChildElement('keySignature');
      e !== null;
      e = getNextSiblingElement('keySignature', e)
    ) {
      // an undated entry produces an event at tick NaN, as in Java
      const date = exportExpressive
        ? Msm.readMillisecondsDateFromElement(e)
        : Math.round(parseFloat(getAttributeValue('date', e)));

      let accids = 0;
      for (
        let a = e.getFirstChildElement('accidental');
        a !== null;
        a = getNextSiblingElement('accidental', a)
      ) {
        const valueAttribute = a.getAttribute('value');
        if (valueAttribute !== null) {
          const value = parseFloat(valueAttribute.getValue());
          if (value > 0) {
            accids++;
            continue;
          }
          if (value < 0) {
            accids--;
          }
        }
      }
      track.add(EventMaker.createKeySignature(date, accids));
    }
  }

  private parseTimeSignatureMap(part: Element, track: Track, exportExpressive: boolean): void {
    const dated = part.getFirstChildElement('dated');
    if (dated === null) return;
    const map = dated.getFirstChildElement('timeSignatureMap');
    if (map === null) return;

    for (
      let e = map.getFirstChildElement('timeSignature');
      e !== null;
      e = getNextSiblingElement('timeSignature', e)
    ) {
      const date = exportExpressive
        ? Msm.readMillisecondsDateFromElement(e)
        : Math.round(parseFloat(getAttributeValue('date', e)));

      // absent is 4; present but unparsable stays NaN
      const numeratorAttribute = e.getAttribute('numerator');
      const numerator =
        numeratorAttribute === null ? 4 : Math.round(parseFloat(numeratorAttribute.getValue()));
      const denominatorAttribute = e.getAttribute('denominator');
      const denominator =
        denominatorAttribute === null ? 4 : Math.round(parseFloat(denominatorAttribute.getValue()));
      track.add(EventMaker.createTimeSignature(date, numerator, denominator));
    }
  }

  /**
   * Converts a markerMap into MIDI marker meta events — the rehearsal marks, and the
   * anchors that sequencingMap gotos aim at (`target.id` names a marker's `xml:id`, see
   * {@link Goto}). Called once for `<global>` and once per part.
   *
   * A marker with no `message` becomes the literal `'marker'`; one carrying an empty `message`
   * keeps the empty string, which is a different event.
   */
  private parseMarkerMap(part: Element, track: Track, exportExpressive: boolean): void {
    const dated = part.getFirstChildElement('dated');
    if (dated === null) return;
    const map = dated.getFirstChildElement('markerMap');
    if (map === null) return;

    for (
      let e = map.getFirstChildElement('marker');
      e !== null;
      e = getNextSiblingElement('marker', e)
    ) {
      const messageValue = e.getAttributeValue('message');
      const message = messageValue === null ? 'marker' : messageValue;

      const date = exportExpressive
        ? Msm.readMillisecondsDateFromElement(e)
        : Math.round(parseFloat(getAttributeValue('date', e)));
      track.add(EventMaker.createMarker(date, message));
    }
  }

  /**
   * Compress the velocity values into `[min, max]` if any of them fall outside it. Called once,
   * as `fitVelocities(0, 127)` from the expressive branch of {@link renderMidi}, and it rewrites
   * the `velocity` attributes in place — which is why it must run before any note event is
   * built.
   *
   * Two details that look like bugs and are not:
   *
   * - `highest` starts at `-Number.MAX_VALUE`, where Java writes `Double.MIN_VALUE`
   *   (`Msm.java:803`), which in Java is the smallest positive double rather than the most
   *   negative one. The port writes what Java meant, and cannot diverge at this call site: both
   *   sentinels are far below `max`, and {@link computePartwiseCompression} reads `highest` only
   *   inside `highest > max`.
   * - the scan is `if (value < lowest) … else if (value > highest) …`, so a run of descending
   *   values never sets `highest` at all. Java's, verbatim.
   */
  private fitVelocities(min: number, max: number): void {
    // if min is greater than max, switch the values
    const lowerLimit = min > max ? max : min;
    const upperLimit = min > max ? min : max;

    // find all velocity attributes and get their values
    const velocities: KeyValue<number, Attribute>[] = [];
    let lowest = Number.MAX_VALUE;
    let highest = -Number.MAX_VALUE;
    const parts = this.getPartsArray();
    for (const part of parts) {
      const dated = firstChildElement('dated', part);
      if (dated === null) continue;
      const score = firstChildElement('score', dated);
      if (score === null) continue;
      const notes = allChildElements(score, 'note');
      for (const note of notes) {
        const velAtt = attribute('velocity', note);
        if (velAtt === null) continue;
        const value = parseFloat(velAtt.getValue());
        if (value < lowest) lowest = value;
        else if (value > highest) highest = value;
        velocities.push(new KeyValue<number, Attribute>(value, velAtt));
      }
    }

    const scaleLowerHalf = lowest < lowerLimit;
    const scaleUpperHalf = highest > upperLimit;
    if (!(scaleLowerHalf || scaleUpperHalf)) return;

    // otherwise we need to apply compression
    console.log(
      `Warning: velocity values [${lowest}, ${highest}] break the specified limits [${lowerLimit}, ${upperLimit}] and will be compressed.`,
    );
    Msm.computePartwiseCompression(velocities, lowest, highest, lowerLimit, upperLimit);
  }

  /**
   * Compress an unlimited input domain into `[min, max]` by projecting it onto a semicircle.
   *
   * Unused, here and in Java (`Msm.java:846`) — the rejected alternative to
   * {@link computePartwiseCompression}, retained so the two trees stay comparable. Java's own
   * comment says why it lost: the projection is fixed, so it practically never reaches `min` or
   * `max` and the available range goes to waste.
   */
  private static computeSemicircleCompression(x: number, min: number, max: number): number {
    const radius = (max - min) / 2.0;
    const xNorm = x - min - radius;
    const xResultNorm = (radius * xNorm) / Math.sqrt(xNorm * xNorm + radius * radius);
    return xResultNorm + min + radius;
  }

  /**
   * Compress a limited input domain into `[min, max]` by a piecewise linear mapping, writing the
   * results through `attributes`.
   *
   * The mapping has up to five pieces: the far-below tail `[lowest, min)`, the lower roll-off
   * `[min, lowerCompMax)`, the untouched middle, the upper roll-off `(upperCompMin, max]` and
   * the far-above tail `(max, highest]`. Values in the middle are left exactly as they are —
   * that is what the `continue` means, not a skipped write.
   *
   * `rolloffFactor` is what keeps the compression from flattening everything: only
   * `1 - rolloffFactor` of each in-range half's span is given up to make room for the
   * out-of-range tail. `upperRolloff1` is written as
   * `((max - upperCompMin) * rolloffFactor) / (max - upperCompMin)`, algebraically just
   * `rolloffFactor`; kept in that form because it is Java's (`Msm.java:886`) and because the
   * expression documents which span is being scaled.
   *
   * Floating-point arithmetic under a bit-identity requirement: no operand may be reordered and
   * no subexpression factored out, however redundant it looks.
   */
  private static computePartwiseCompression(
    attributes: KeyValue<number, Attribute>[],
    lowest: number,
    highest: number,
    min: number,
    max: number,
  ): void {
    // on the basis of the lowest and highest value, compute the range to be compressed
    let lowerCompMax = min;
    let upperCompMin = max;
    if (lowest < min) lowerCompMax = max - ((max - min) * (max - min)) / (max - lowest);
    if (highest > max) upperCompMin = min + ((max - min) * (max - min)) / (highest - min);
    if (lowerCompMax > upperCompMin) {
      lowerCompMax = (lowerCompMax + upperCompMin) / 2.0;
      upperCompMin = lowerCompMax;
    }

    // the rolloffFactor lowers the degree of compression for values within the range [min, max]
    const rolloffFactor = 0.66;
    let upperRolloff1 = 0.0,
      upperRolloff2 = 0.0,
      lowerRolloff1 = 0.0,
      lowerRolloff2 = 0.0;
    let upperRaise = upperCompMin;
    let lowerRaise = min;
    if (highest > max) {
      upperRolloff1 = ((max - upperCompMin) * rolloffFactor) / (max - upperCompMin);
      upperRolloff2 = ((1.0 - rolloffFactor) * (max - upperCompMin)) / (highest - max);
      upperRaise = upperCompMin + rolloffFactor * (max - upperCompMin);
    }
    if (lowest < min) {
      lowerRolloff1 = ((lowerCompMax - min) * (1.0 - rolloffFactor)) / (min - lowest);
      lowerRolloff2 = ((lowerCompMax - min) * rolloffFactor) / (lowerCompMax - lowest);
      lowerRaise = min + (lowerCompMax - min) * (1.0 - rolloffFactor);
    }

    for (const attribute of attributes) {
      const x = attribute.getKey();
      let result = x;

      if (x < lowerCompMax) {
        result =
          x >= min ? lowerRolloff2 * (x - min) + lowerRaise : lowerRolloff1 * (x - lowest) + min;
      } else if (x > upperCompMin) {
        result =
          x <= max
            ? upperRolloff1 * (x - upperCompMin) + upperCompMin
            : upperRolloff2 * (x - max) + upperRaise;
      } else {
        continue;
      }
      attribute.getValue().setValue(String(result));
    }
  }

  /**
   * The offset date of the last note, in MIDI ticks — not milliseconds.
   */
  getEndDate(): number {
    let latestOffset = 0.0;
    const parts = this.requireRootElement().getChildElements('part');

    for (const part of parts) {
      const dated = part.getFirstChildElement('dated');
      if (dated === null) continue;
      const score = dated.getFirstChildElement('score');
      if (score === null) continue;

      // Keep the largest note offset. Forwards, where Java walks backwards (`Msm.java:1382`):
      // this is a maximum over a set, `latestOffset` is assigned rather than accumulated and
      // `>` is strict, so the direction is not observable — NaN included, since `NaN > x` is
      // false from either end. An undated or durationless note contributes such a NaN.
      for (const note of score.getChildElements('note')) {
        const date = parseFloat(getAttributeValue('date', note));
        const dur = parseFloat(getAttributeValue('duration', note));
        const offset = date + dur;
        if (offset > latestOffset) latestOffset = offset;
      }
    }

    return latestOffset;
  }

  /**
   * The `milliseconds.date` of an element, rounded. The single place expressive export reads a
   * date — notes, markers, signatures and control changes all come through here, which is why an
   * MSM that has not been performed produces one error line per element rather than one for the
   * document.
   *
   * The fallback to `date` is a last resort, not a mode: it substitutes a value in MSM ticks
   * where milliseconds are expected. An element with neither attribute throws, here and in Java
   * (`Msm.java:1424` dereferences the null `Attribute` for an NPE).
   */
  private static readMillisecondsDateFromElement(e: Element): number {
    const millisecondsDate = attribute('milliseconds.date', e);
    if (millisecondsDate !== null) return Math.round(parseFloat(millisecondsDate.getValue()));

    console.error(
      `Missing attribute "milliseconds.date" in element ${e.toXML()}. Using attribute "date" instead.`,
    );
    const symbolicDate = attribute('date', e);
    if (symbolicDate === null)
      throw new MissingNodeError(
        `element ${e.toXML()} has neither a "milliseconds.date" nor a "date" attribute`,
      );
    return Math.round(parseFloat(symbolicDate.getValue()));
  }

  /**
   * Give every `note` and `rest` without an `xml:id` a fresh one; elements that already have one
   * keep it.
   *
   * @returns how many ids were generated
   *
   * The XPath returns document order and {@link addUUID} is applied in that order, so the n-th
   * generated id belongs to the n-th id-less note or rest. Which elements are selected is
   * observable in the output — dropping `rest` from the predicate flips the equivalence probe
   * immediately — so treat the traversal as fixed.
   *
   * Nothing in `src/` calls this, so unlike its MEI namesake it does not contribute ids to the
   * reference fixtures.
   */
  addIds(): number {
    console.log('Adding IDs to MSM:');
    const root = this.getRootElement();
    if (root === null) {
      console.error(' Error: no root element found');
      return 0;
    }

    const e: Nodes = root.query(
      "descendant::*[(local-name()='note' or local-name()='rest') and not(@xml:id)]",
    );
    // `descendant::*` yields elements, so the `instanceof` never skips one — which is what
    // lets the return below stay `e.size()`, the count of what was selected, as Java returns.
    for (const node of e) if (node instanceof Element) addUUID(node);

    console.log(' done');

    return e.size();
  }
}
