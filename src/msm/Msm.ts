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
 * The one module-local navigation helper left, and the reason it is still here.
 *
 * This file used to open with eight of them — "Java's `Helper` in miniature, private to
 * this module" — carrying a warning not to deduplicate them against `src/xml/` without a
 * per-method behavioural comparison (ARCHITECTURE.md RULE M2a). That comparison is
 * `tests/msm/navigationEquivalence.test.ts`: it restates all eight and feeds both sides the
 * MSM/MPM fixture corpus plus the adversarial trees the rule names — a namespaced `xml:id`,
 * children sharing a local name across three namespaces, text nodes between siblings, a
 * detached element, the empty name. **Seven of the eight agreed everywhere**, so seven are
 * gone and their callers now use `xml/tree.ts` and `xml/ids.ts`. This is the eighth.
 *
 * It differs from {@link module:music/text.getFilenameWithoutExtension} on one input:
 * a filename with **no dot at all**. `lastIndexOf` is then -1, and the shared copy
 * evaluates `substring(0, -1)` — which JavaScript reads as `substring(0, 0)`, the empty
 * string — where this one guards for -1 and returns the name. Neither is Java's, whose
 * `String.substring(0, -1)` throws; this copy is what the reference behaviour of
 * {@link Msm.getTitle} and {@link Msm.renderMidi} was measured against, and under the
 * shared copy an extensionless file would title the movement `''` and name its MIDI
 * `.mid`. The divergence is pinned by the probe rather than left to be rediscovered.
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
 * The two loops in {@link Msm.applySequencingMapToMap} carried this block character for
 * character, four lines and a backwards `for` each. It is lifted out because it is the same
 * block, not because the loops around it may be restructured — they may not, and the note on
 * that method says so at length. Nothing here is reordered: both call sites invoke it exactly
 * where the block stood.
 *
 * **`repetitionIDs` is a chain, not a base-id index**: `base → rep1 → rep2 → …`. The
 * backwards walk follows it from the base id to the id of the *previous* iteration, which is
 * the key the new entry belongs under, so a caller can follow any old id forward to its
 * current one.
 *
 * A missing link used to be `repetitionIDs.get(prevId)!`, which on a broken chain assigns
 * `undefined` to a `string` and then writes an entry under an `undefined` key — a
 * `Map<string, string>` handed back to the caller with a key that is not a string, and no
 * error anywhere. The chain cannot be broken from inside this module: an element reaching
 * `reps` has passed through here `reps - 1` times already, each of those wrote the entry this
 * step reads, and `resolveSequencingMaps` threads one table through every call. It CAN be
 * broken by an outside caller of the public `applySequencingMapToMap` who supplies a fresh
 * table for a second pass, and that is now a thrown error rather than a corrupt result.
 */
function recordRepetitionId(repetitionIDs: Map<string, string>, copy: Element, reps: number): void {
  const id = copy.getAttribute('id', 'http://www.w3.org/XML/1998/namespace'); // get the id of the copy
  if (id === null) return; // it has no xml:id

  let prevId = id.getValue(); // get the base ID
  const newId = `meico_repetition_${String(reps)}_${prevId}`; // generate a new ID
  id.setValue(newId); // set the attribute

  // the key of the map entry should be the ID of the previous iteration, not the base ID
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
 * This class holds data in msm format (Musical Sequence Markup).
 * Port of meico.msm.Msm
 * @author Axel Berndt.
 *
 * MSM is the middle of the pipeline: `Mei2MsmMpmConverter` turns an MEI score into an MSM
 * (what is played, in symbolic time) plus an MPM (how it is played), and this class turns
 * an MSM back into MIDI. Its two exports are the two halves of that:
 *
 * - {@link exportMidi} — the score as written. Dates are MSM ticks, one tempo event, one
 *   velocity for every note.
 * - {@link exportExpressiveMidi} — the score as performed. Expects the
 *   `milliseconds.date` / `milliseconds.date.end` / `velocity` attributes that
 *   {@link Performance.perform} writes, and reads *those* instead of `date`/`duration`.
 *
 * The document is `<msm>` → one `<global>` plus one `<part>` per instrument; each of those
 * is `<header>` + `<dated>`, and `<dated>` holds the maps — `timeSignatureMap`,
 * `keySignatureMap`, `markerMap`, `sequencingMap`, `pedalMap`, `miscMap`, and in a part
 * also `<score>`, the note list itself. A part's own map wins over the global one of the
 * same name wherever both exist.
 *
 * The XML tree is the single source of truth: this class holds no parsed model beside it,
 * every getter reads the tree, and every mutator writes it.
 *
 * Two of the maps are not read during MIDI export at all but consumed earlier:
 * `sequencingMap` by {@link resolveSequencingMaps} (repeats and jumps, applied before
 * anything is rendered) and `miscMap`, which is scratch space the MEI converter deletes on
 * its way out.
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
  private static readonly CONTROL_CHANGE_DENSITY: number = 10; // in MPM-to-MIDI export a series of control change events may be generated; this constant limits their density

  /*
   * THERE IS NO CONSTRUCTOR HERE, AND THAT IS THE CHANGE.
   *
   * `new Msm()`, `new Msm(document)` and `new Msm(xml)` all still work, and none of the 36
   * call sites moved: {@link AbstractMsm}'s `constructor(source?: Document | string)` accepts
   * all three and is inherited. What stood here was three overload signatures over a body
   * that dispatched on `typeof` and then called `super` with the argument it had been handed
   * — the overloads' whole content, restated as runtime tests the compiler could not tie back
   * to them.
   *
   * The comment defending them said the three modes "are three different things to start from
   * ... not one parameter that happens to be optional", and that collapsing them "would say
   * less than the three signatures do". They have the same arity and one parameter each, so
   * the union lists exactly the same three modes; nothing was said that is no longer said.
   *
   * The body's fourth arm, for `new Msm(42)` from untyped JavaScript, is not needed either: a
   * value that is neither `undefined` nor a `Document` reaches `XmlBase`'s
   * `typeof arg === 'string' && isXmlString` test, fails it, and leaves the field
   * initializers standing — `data` and `file` null, `isValidFlag` false — which is exactly
   * what that arm's bare `super()` produced.
   *
   * Named factories (`fromXml`, `fromDocument`, `empty`) would read better still; see
   * {@link AbstractMsm}'s constructor for why that is a scheduled change and not this one.
   */

  /**
   * this factory creates an initial Msm instance with empty global maps
   * @param title
   * @param id an id string for the root element or null, in the latter case a random UUID will be created
   * @param ppq
   * @returns
   *
   * The eight global maps are created empty and in this order, and the order is part of
   * the serialised output: nothing sorts `<dated>` afterwards, so a fresh MSM's global
   * `<dated>` has exactly this child sequence.
   *
   * `id === null` is the second of this file's two `uuid` call sites. Unlike
   * {@link addUUID} it produces a **bare** UUID with no `meico_` prefix (as Java does,
   * `Msm.java:121`), so the equivalence tests' `meico_` canonicalisation does not cover
   * it and a null `id` yields output that differs run to run. The pipeline never takes
   * that branch — `Mei2MsmMpmConverter` always passes an explicit movement id.
   */
  static createMsm(title: string, id: string | null, ppq: number): Msm {
    const root = new Element('msm'); // create the root element of the msm/xml tree
    root.addAttribute(new Attribute('title', title)); // add a title attribute to it

    const idAttribute = new Attribute(
      'xml:id',
      'http://www.w3.org/XML/1998/namespace',
      id === null ? uuidv4() : id,
    ); // make new id attribute
    root.addAttribute(idAttribute); // add it to the MSM movement element

    // create global containers
    const global = new Element('global');
    const dated = new Element('dated');
    const header = new Element('header');

    root.addAttribute(new Attribute('pulsesPerQuarter', String(ppq))); // add the attribute to the root

    dated.appendChild(new Element('timeSignatureMap')); // global time signatures
    dated.appendChild(new Element('keySignatureMap')); // global key signatures
    dated.appendChild(new Element('markerMap')); // global rehearsal marks
    dated.appendChild(new Element('sectionMap')); // global map of section structure
    dated.appendChild(new Element('phraseMap')); // global map of phrase structure
    dated.appendChild(new Element('sequencingMap')); // global sequencingMap
    dated.appendChild(new Element('pedalMap')); // global map for pedal instructions
    dated.appendChild(new Element('miscMap')); // a temporal map

    global.appendChild(header);
    global.appendChild(dated);
    root.appendChild(global);

    return new Msm(new Document(root));
  }

  /**
   * create a copy of this object
   * @returns the copy of this Msm object
   * @throws {MissingNodeError} when this Msm is empty — there is then nothing to copy.
   *   `this.getDocument()!.copy()` is what this was, so an empty Msm threw here before too;
   *   the difference is that the error says which document and not "cannot read property
   *   copy of null". `Performance.cloneForRender` is the caller that can reach it.
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
   * This getter method returns the title string from the root element's attribute title.
   * If missing, use the filename without extension or return "".
   * @returns
   *
   * **The `try`/`catch` this used to carry could not fire.** It was there to absorb a null
   * root — `getAttribute('title', this.getRootElement()!)` — but both the local reader this
   * file used to define and `xml/tree.attribute`, which replaced it, take `Element | null`
   * and answer `null` for a null element. So the catch arm and the fall-through arm were
   * the same arm, reached the same way, and the assertion in between claimed a root the
   * method then did not need. Same three outcomes, no exception path.
   */
  getTitle(): string {
    const title = attribute('title', this.getRootElement());
    if (title !== null) return title.getValue();

    const file = this.getFile();
    return file === null ? '' : getFilenameWithoutExtension(file);
  }

  /**
   * this getter returns the timing resolution (pulses per quarternote) of the MSM
   * @returns 0 where there is no document, or no `pulsesPerQuarter` on its root
   *
   * The `try`/`catch` went for the reason given at {@link getTitle}, and `parseInt` does
   * not throw — a non-numeric attribute yields `NaN` here as it did before.
   */
  getPPQ(): number {
    const ppq = attribute('pulsesPerQuarter', this.getRootElement());
    return ppq === null ? 0 : parseInt(ppq.getValue());
  }

  /**
   * this getter returns the timing resolution (pulses per quarternote) of the MSM
   * @returns
   */
  getPulsesPerQuarter(): number {
    return this.getPPQ();
  }

  /**
   * Set the pulses per quarter timing resolution attribute.
   * Be careful with this, it does not change any midi date values!
   * It is safer to invoke convertPPQ().
   * @param ppq
   */
  setPulsesPerQuarter(ppq: number): void {
    // Two assertions became two named failures. An empty Msm and one whose root carries no
    // `pulsesPerQuarter` both threw here before — this is a *setter* for an attribute it
    // does not create, which is the surprise the message now states outright.
    requireAttribute('pulsesPerQuarter', this.requireRootElement()).setValue(String(ppq));
  }

  /**
   * Set the pulses per quarter timing resolution attribute.
   * Be careful with this, it does not change any midi date values!
   * It is safer to invoke convertPPQ().
   * @param ppq
   */
  setPPQ(ppq: number): void {
    this.setPulsesPerQuarter(ppq);
  }

  /**
   * this method converts the timing basis, i.e., it sets the new ppq value and converts all attributes date, date.end and duration in the whole document
   * @param ppq
   *
   * The three statements are order-dependent: the log line reads the *old* resolution
   * (hence it must run before `setPPQ`), and the rescaling factor is `ppq / ppqOld`
   * captured before the attribute is overwritten. `milliseconds.date` and friends are
   * deliberately not in the XPath — they are absolute times and do not scale with ppq.
   */
  convertPPQ(ppq: number): void {
    const ppqOld = this.getPPQ();
    if (ppqOld === ppq) return;

    console.log(
      `Converting timing basis of "${this.getTitle()}" from ${this.getPulsesPerQuarter()} to ${ppq} pulses per quarter note.`,
    );

    this.setPPQ(ppq);

    // find all attributes date, date.end and duration, and convert their values
    const atts: Nodes = this.requireRootElement().query(
      'descendant::*[attribute::date]/attribute::date | descendant::*[attribute::date.end]/attribute::date.end | descendant::*[attribute::duration]/attribute::duration',
    );
    // `as unknown as Attribute` was here, on the ground that an `attribute::` step yields
    // attributes. It does — {@link Element.query} pushes a real {@link Attribute} for every
    // attribute hit — which is precisely why the claim can be *tested* instead of asserted.
    // A cast that is right is still a cast, and the same three lines appear at
    // `dropRepetitionCounters` and `addIds` over `Element`.
    for (const node of atts) {
      if (!(node instanceof Attribute)) continue;
      node.setValue(String((parseFloat(node.getValue()) * ppq) / ppqOld));
    }
  }

  /**
   * this method converts the timing basis, i.e., it sets the new ppq value and converts all attributes date, date.end and duration in the whole document
   * @param ppq
   */
  convertPulsesPerQuarter(ppq: number): void {
    this.convertPPQ(ppq);
  }

  /**
   * computes the minimal integer timing resolution necessary for a rhythmically reasonably accurate representation of the score data in this MSM
   * @returns the number of subdivisions per quarter note the score needs, a power of two
   *
   * For each note it walks powers of two upwards until one divides the note's duration —
   * then its date — exactly, and keeps the finest value found over all notes.
   *
   * Three details are Java's (`Msm.java:254-279`) and all three are load-bearing:
   * 1. `ppq / subdivs` is **integer** division there (`Msm.java:262` and `:270`, both
   *    operands `int`), hence `Math.trunc` here. Float division would agree only while
   *    `subdivs` divides `ppq`.
   * 2. Both inner loops start at the running `maxSubdivisions`, not at 1 — so
   *    `Math.max` can never actually raise anything, the value only ever grows.
   * 3. Consequently the result is order-dependent and can exceed what any single note
   *    needs: at ppq 720 a duration of 22 matches at `subdivs` 32 (720/32 truncates to
   *    22), and a whole-quarter note coming after it then matches only at 128 (720/128
   *    truncates to 5) — so dates/durations `[22, 720]` yield 128 where `[720, 22]` yield
   *    32. Verified by running the Java arithmetic, not merely reasoned about.
   *
   * Nothing in `src/` calls this method — Java's only caller is `exportPitches`, which
   * this port does not have — so the unit tests are the only exercise it gets.
   */
  getMinimalPPQ(): number {
    const ppq = this.getPPQ();
    let maxSubdivisions = 1;

    const parts = this.getPartsArray();
    for (const part of parts) {
      // go through all parts
      const dated = part.getFirstChildElement('dated');
      if (dated === null) continue;
      const score = dated.getFirstChildElement('score');
      if (score === null) continue;
      // go through all notes
      for (const note of score.getChildElements('note')) {
        // `getAttributeValue(…)!` here handed `parseFloat` a real null on a note with no
        // `duration`, which is `NaN`; `NaN % k` is `NaN`, so no `subdivs` ever matched and
        // the note contributed nothing. `getAttributeValue`'s `''` gives the same `NaN` by
        // the same route. Note that JAVA DIVERGES on this input — `Double.parseDouble(null)`
        // throws an NPE that nothing here catches — but no fixture carries a note without a
        // `duration` or a `date`, and this method has no caller in `src/` at all.
        const dur = Math.round(parseFloat(getAttributeValue('duration', note))); // get the note's duration
        for (let subdivs = maxSubdivisions; subdivs <= ppq; subdivs *= 2) {
          if (dur % Math.trunc(ppq / subdivs) === 0) {
            maxSubdivisions = Math.max(maxSubdivisions, subdivs);
            break;
          }
        }

        const date = Math.round(parseFloat(getAttributeValue('date', note))); // get the note's date
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
   * Generate a "raw" part element with its corresponding attributes and empty "header" and "dated" environments.
   * This element is not added to the document! It is up to the application to do this.
   * @param name
   * @param number (string overload)
   * @param midiChannel
   * @param midiPort
   * @returns the part element just generated
   *
   * Adds the MSM-specific maps on top of what {@link AbstractMsm.makePartFromString}
   * builds. The child order below is the order they appear in the serialised part, and it
   * is not the same as the global `<dated>` order in {@link createMsm} — the global has a
   * `sectionMap` and no `<score>`, the part has a `<score>` and a `miscMap` containing a
   * `tupletSpanMap`. Both orders are Java's.
   */
  static override makePartFromString(
    name: string,
    number: string,
    midiChannel: number,
    midiPort: number,
  ): Element {
    const part = AbstractMsm.makePartFromString(name, number, midiChannel, midiPort);

    // add some MSM-specific maps to the dated environment.
    // The `<dated>` is one this method's own super call appended two lines ago, which is the
    // narrow case `requireFirstChildElement` is documented for — "the shape of a document
    // this port itself built".
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
   * Generate a "raw" part element with its corresponding attributes and empty "header" and "dated" environments.
   * This element is not added to the document! It is up to the application to do this.
   * @param name
   * @param number
   * @param midiChannel
   * @param midiPort
   * @returns the part element just generated
   */
  static override makePart(
    name: string,
    number: number,
    midiChannel: number,
    midiPort: number,
  ): Element {
    return Msm.makePartFromString(name, String(number), midiChannel, midiPort);
  }

  /**
   * add the specified part to the xml structure
   * @param part
   */
  addPart(part: Element): void {
    this.requireRootElement().appendChild(part);
  }

  /**
   * Retrieve the part element that matches the given specifications. If the number matches already,
   * the others will not be checked, otherwise the name is checked and, if nothing was found, the MIDI
   * channel and port are checked.
   * @param number
   * @param name
   * @param midiChannel
   * @param midiPort
   * @returns
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

    return null; // nothing found
  }

  /**
   * a getter that returns all part elements in the XML tree
   * @returns
   */
  getParts(): Elements {
    return this.requireRootElement().getChildElements('part');
  }

  /**
   * a convenience method that returns all part elements as an array for iteration
   * @returns
   */
  getPartsArray(): Element[] {
    return this.getParts().toArray();
  }

  /**
   * a getter for the global environment
   * @returns
   */
  getGlobal(): Element | null {
    return this.requireRootElement().getFirstChildElement('global');
  }

  /**
   * a convenience method to generate timeSignature elements
   * @param date
   * @param numerator
   * @param denominator
   * @param id
   * @returns
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
   * removes all rest elements from the score lists;
   * this method is not part of the mei.exportMsm() cleanup procedure as some applications may still need the rests;
   * others who don't, can call this method to remove all rest elements and get a purged msm
   *
   * The XPath is `descendant::*[local-name()='rest']`, so it takes every `<rest>` in the
   * document, not only those under `<score>`. `removeChild` followed by `detach` is
   * Java's pairing (`Msm.java:415`); the second call has nothing left to do once the
   * first has unlinked the node.
   */
  removeRests(): void {
    // `getRootElement() === null` is exactly `isEmpty()` — a parsed Document always has a
    // root — so the guard now yields the value the query needs.
    const root = this.getRootElement();
    if (root === null) return;

    const r: Nodes = root.query("descendant::*[local-name()='rest']"); // select all rest elements
    // The query result is a fixed snapshot, so unlinking a node from its parent mid-walk
    // cannot disturb the walk — which is what the index loop here was already relying on.
    for (const rest of r) {
      // A node on the `descendant::` axis has a parent by construction, so this `continue`
      // is unreachable — it is the total spelling of the `getParent()!` that was here, and
      // the same shape `XmlBase.removeAllElements` uses over the same kind of query result.
      const parent = rest.getParent();
      if (parent === null) continue;
      parent.removeChild(rest); // remove them
      rest.detach();
    }
  }

  /**
   * this method expands all global and local maps according to the sequencingMaps;
   * if a local sequencingMap (can be empty) is given in a certain part, that part ignores the global sequencingMap
   * @returns a map with xml:id mappings for those elements that have been copied and needed an updated id
   *
   * ## What a sequencingMap is
   *
   * MSM stores repeats, endings and jumps *by reference* rather than by writing the music
   * out twice: a `<sequencingMap>` holds `<goto>` elements ({@link Goto}) saying "on
   * reaching this date, continue at that one". This method is what turns that into
   * literal, linear time — after it runs, every remaining map plays front to back and the
   * sequencingMaps themselves are gone. Everything downstream (performance rendering,
   * MIDI export) assumes it has already happened.
   *
   * ## Scoping rule
   *
   * A part with its own `<sequencingMap>` uses it and ignores the global one — **even if
   * its own is empty**, which is how a part opts out of a global repeat. Only a part with
   * no local map at all falls back to the global one. That is why the fallback path also
   * checks for an empty global map and skips the part, while the local path does not: an
   * empty local map still means "expand nothing here".
   *
   * ## Order of operations, and why it cannot be reordered
   *
   * Global maps are expanded first, then each part's. Both loops skip `sequencingMap`
   * itself (it is not music), `miscMap` (scratch space, deleted later) and any empty map.
   * The sequencingMaps are removed **last**, after every map that referred to them has
   * been expanded — the global one especially, since parts without a local map are still
   * reading it during the part loop.
   *
   * One `repetitionIDs` map is threaded through every call so the caller gets a single
   * old-id → new-id table for the whole document; see {@link applySequencingMapToMap} for
   * what goes into it.
   *
   * ## Who calls this
   *
   * Nothing in `src/` does, in this port or in Java — it is opt-in API. The MEI converter
   * *writes* sequencingMaps (`Mei2MsmMpmConverter.processEnding` builds the `<goto>`s) but
   * leaves them unexpanded, so an MSM straight out of the pipeline still has its repeats
   * encoded by reference, and the reference fixtures contain `<goto>` elements. It
   * follows that the fixture pipeline does **not** exercise the expansion code below;
   * `tests/msm/MsmSequencing.test.ts` is what covers it.
   */
  resolveSequencingMaps(): Map<string, string> {
    const repetitionIDs = new Map<string, string>();
    const root = this.getRootElement(); // null for exactly one reason: `isEmpty()`
    if (root === null) return repetitionIDs;

    // Walked once and held, where this used to re-navigate `root → <global> → <dated>` four
    // separate times and assert both links away on each. The four navigations answered the
    // same element, and asserting them said nothing the second time that it had not already
    // claimed the first. A `<global>` or a `<dated>` missing throws here as it did before —
    // named now, instead of "cannot read property getFirstChildElement of null".
    const globalDated = requireFirstChildElement(requireFirstChildElement(root, 'global'), 'dated');
    const globalSequencingMap = globalDated.getFirstChildElement('sequencingMap'); // get the global sequencingMap (or null if there is none)
    const parts = root.getChildElements('part'); // get all the parts

    // expand global maps
    if (globalSequencingMap !== null) {
      const maps = globalDated.getChildElements();
      // go through all maps
      for (const map of maps) {
        if (
          map.getChildCount() === 0 || // do not expand sequencingMaps
          map.getLocalName() === 'miscMap' || // ignore miscMaps as they will be deleted anyway
          map.getLocalName() === 'sequencingMap'
        )
          // or if the map is empty
          continue; // continue with the next

        const newMap = Msm.applySequencingMapToMap(globalSequencingMap, map, repetitionIDs); // apply the global sequencingMap to it
        if (newMap !== null) globalDated.replaceChild(map, newMap); // replace the old map by the new one
      }
    }

    // go through all parts and expand their maps according to the underlying sequencingMaps
    // for each part
    for (const part of parts) {
      // A part with no `<dated>` threw here before and throws here now; the three reads of
      // it are one.
      const partDated = requireFirstChildElement(part, 'dated');
      let sequencingMap = partDated.getFirstChildElement('sequencingMap'); // get the part's local sequencingMap if there is one
      let localMap = true;
      if (sequencingMap === null) {
        // if there is none
        localMap = false;
        sequencingMap = globalSequencingMap; // get the global sequencingMap
        if (sequencingMap === null || sequencingMap.getChildCount() === 0)
          // if there is none or it is empty
          continue; // continue with the next part
      }

      // go through the score and all maps (except the sequencingMap itself) and apply the sequencingMap to them
      const maps = partDated.getChildElements();
      // go through all maps
      for (const map of maps) {
        if (
          map.getChildCount() === 0 || // do not expand sequencingMaps
          map.getLocalName() === 'miscMap' || // ignore miscMaps as they will be deleted anyway
          map.getLocalName() === 'sequencingMap'
        )
          // or if the map is empty
          continue; // continue with the next

        const newMap = Msm.applySequencingMapToMap(sequencingMap, map, repetitionIDs); // apply the sequencingMap to it
        // `map` came out of `partDated.getChildElements()`, so its parent is `partDated`.
        // Kept as the parent lookup rather than folded into `partDated` because that is
        // what the line did, and the two differ if anything ever reparents a map mid-loop.
        if (newMap !== null) requireParentElement(map).replaceChild(map, newMap); // replace the old map by the new one
      }

      // delete the local sequencingMap (because it does not apply anymore)
      if (localMap) {
        partDated.removeChild(sequencingMap);
        sequencingMap.detach();
      }
    }

    // delete the global sequencingMap (because it does not apply anymore)
    if (globalSequencingMap !== null) {
      globalDated.removeChild(globalSequencingMap);
      globalSequencingMap.detach();
    }

    return repetitionIDs;
  }

  /**
   * apply the sequencingMap to the map; this expands the map
   * @param sequencingMap
   * @param map
   * @param repetitionIDs this map will be filled with mappings of xml:id's that are extended to avoid double occurrences
   * @returns the expanded map (to replace the old map) or null (to keep the old map)
   *
   * The heart of repeat/ending resolution, and the most order-sensitive code in this
   * file. **Nothing below this comment may be reordered, rewritten as array methods, or
   * "simplified"** — the arithmetic is required to stay bit-identical to Java
   * (`Msm.java:500`) and the traversal is required to visit elements in exactly the same
   * sequence.
   *
   * ## The traversal
   *
   * `newMap` starts as a flat copy of `map` and is refilled by walking the original in
   * *playback* order. `currentDate` is where playback has got to in the original,
   * `dateOffset` is how far ahead the new map has run because of material already
   * repeated. Each iteration of the outer loop finds the next goto at or after
   * `currentDate` that is still active, copies everything from `currentDate` up to (not
   * including) the goto's date, then jumps: `dateOffset` grows by the distance skipped
   * and `currentDate` moves to the goto's target.
   *
   * The `continue gotoSearch` at the end of a taken jump restarts the goto search from the
   * beginning, because a jump can land *before* gotos that were already passed, and those
   * must be reconsidered. The loop still terminates: a goto is only ever taken by
   * consuming a `1` from its {@link Goto.activity} string, and every test of a goto
   * advances that string's cursor, so the total number of jumps is bounded by the total
   * number of `1`s in the sequencingMap. Falling out of the inner `for` instead — a full
   * pass over `gotos` with none of them applying — is what ends the search.
   *
   * That restart used to be written `for (let i = 0; i < gotos.length; ++i) { … i = -1; }`,
   * assigning to the loop variable to make `++i` land back on 0. The shape is identical;
   * what the label buys is that the goto in hand comes from iterating `gotos` rather than
   * from `gotos[i]`, which under `--noUncheckedIndexedAccess` is a `Goto | undefined` that
   * no bound check can talk the compiler out of. Nothing is reordered: the inner `for`
   * visits the gotos in list order from index 0, exactly as `i = -1; ++i` did, and the
   * `isActive()` calls — which mutate, one pass consumed per call — fall in the same
   * places in the same order.
   *
   * The second, near-identical loop after it copies the tail — everything from the last
   * jump to the end of the map — with no goto to stop at. It differs from the first in
   * one deliberate way: it has no `else` branch adding a fresh `repetitionCounter`,
   * because nothing will visit those elements again.
   *
   * ## repetitionCounter and the id chain
   *
   * A repeated element would otherwise appear twice with the same `xml:id`. To renumber
   * the duplicates, the *original* element (not the copy) is tagged with a temporary
   * `repetitionCounter` attribute: absent means "first time seen", otherwise it holds how
   * often it has been copied. Copy *n* gets `meico_repetition_<n>_<baseId>`.
   *
   * `repetitionIDs` is a chain, not a base-id index: `base → rep1 → rep2 → …`. That is
   * what the small backwards `for (let r = reps - 1; …)` loop walks — it follows the
   * chain from the base id to the id of the *previous* iteration, which is the key the
   * new entry belongs under. Callers can therefore follow any old id forward to its
   * current one.
   *
   * The counter is written on the original, so the copy made on the *first* encounter
   * carries no `repetitionCounter` while every later copy carries a stale one. That is
   * why the cleanup at the end sweeps `newMap` as well as `map`.
   */
  static applySequencingMapToMap(
    sequencingMap: Element,
    map: Element,
    repetitionIDs: Map<string, string>,
  ): Element | null {
    const gs = sequencingMap.getChildElements('goto'); // get the gotos
    if (gs.size() === 0) return null; // if there are no gotos in the sequencingMap, i.e. nothing to expand, return null

    // Make an Array of Goto instances — parse each `<goto>`, keep the ones that parse, and
    // report the ones that do not. That is `filterMap` exactly: the "skip this one" arm is
    // the `null` return, so the loop no longer has to say `continue` in a `catch`.
    const gotos = filterMap(gs, (g) => {
      try {
        return new Goto(g); // from the goto element create a Goto instance
      } catch (e) {
        console.error(e); // print the exception and continue with the next
        return null;
      }
    });

    // create a new map and fill it by traversing the original map as indicated by the goto elements
    const newMap = cloneElement(map); // make a flat copy of the map (no children so far) to refill it according to the sequencingMap

    let currentDate = 0.0; // start at date 0.0
    let dateOffset = 0.0; // this sums up the offsets that come from inserting repetitions
    gotoSearch: for (;;) {
      // find the next goto
      for (const gt of gotos) {
        // get the next goto
        if (gt.date < currentDate || !gt.isActive()) continue; // if the goto is before currentDate or it is not active continue with the next

        // copy everything between currentDate and gt.date from the original map into newMap
        for (
          let e = Msm.getElementAtAfter(currentDate, map);
          e !== null;
          e = getNextSiblingElement(e)
        ) {
          // go through the map elements
          // `getElementAtAfter` yields only dated elements, but `getNextSiblingElement`
          // steps to the next sibling of ANY name, so an undated one can arrive here. It
          // threw before — three lines on, as `eCopy.getAttribute('date')!.setValue(…)`,
          // once `parseFloat(null)`'s NaN had failed the comparison below — and it throws
          // here, naming `date` at the point the map's ordering invariant is broken.
          const dateAttribute = requireAttribute('date', e);
          currentDate = parseFloat(dateAttribute.getValue()); // read its date
          if (currentDate >= gt.date) break; // if the element's date is at or after the goto don't copy further
          const eCopy = e.copy(); // make a deep copy of the element
          // The copy carries what the original carries, so these two reads cannot miss what
          // the reads on `e` just found; they are checked rather than asserted because that
          // is a fact about `copy()`, not one the type system holds.
          requireAttribute('date', eCopy).setValue(String(currentDate + dateOffset)); // draw its date

          const endDate = e.getAttribute('date.end'); // get the date.end attribute
          if (endDate !== null) {
            // if the element has one, update it, too
            const dur = parseFloat(endDate.getValue()) - parseFloat(dateAttribute.getValue());
            requireAttribute('date.end', eCopy).setValue(String(currentDate + dur + dateOffset));
          }

          const repetitionCounter = e.getAttribute('repetitionCounter'); // get the counter
          if (repetitionCounter !== null) {
            // this is not the first time we process this element
            const reps = 1 + parseInt(repetitionCounter.getValue()); // increase repetition counter
            repetitionCounter.setValue(String(reps)); // write it to the attribute
            recordRepetitionId(repetitionIDs, eCopy, reps);
          } else {
            // this is the first time we process this element
            e.addAttribute(new Attribute('repetitionCounter', '0')); // add an attribute to count the repetitions
          }
          newMap.appendChild(eCopy); // append the copy to the new map
        }

        dateOffset += gt.date - gt.targetDate; // draw the dateOffset
        currentDate = gt.targetDate; // draw currentDate
        continue gotoSearch; // start searching for the next goto
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
      currentDate = parseFloat(dateAttribute.getValue()); // read its date
      const eCopy = e.copy(); // make a deep copy
      requireAttribute('date', eCopy).setValue(String(currentDate + dateOffset)); // draw its date

      const endDate = e.getAttribute('date.end'); // get the date.end attribute
      if (endDate !== null) {
        // if the element has one, update it, too
        const dur = parseFloat(endDate.getValue()) - parseFloat(dateAttribute.getValue());
        requireAttribute('date.end', eCopy).setValue(String(currentDate + dur + dateOffset));
      }

      const repetitionCounter = e.getAttribute('repetitionCounter'); // get the counter
      if (repetitionCounter !== null) {
        // this is not the first time
        const reps = 1 + parseInt(repetitionCounter.getValue()); // increase repetition counter
        repetitionCounter.setValue(String(reps)); // write it to the attribute
        recordRepetitionId(repetitionIDs, eCopy, reps);
      }

      newMap.appendChild(eCopy); // append the copy to the new map
    }

    // cleanup: delete all repetitionCounter attributes from all map and newMap elements
    //
    // One walk written once, run twice — the two blocks here were character-for-character
    // identical but for the element queried. Forward rather than backwards: a query result
    // is a fixed snapshot of *distinct* elements, and each visit only strips an attribute
    // from the element it landed on, so nothing a later step reads depends on an earlier
    // one. The backwards index was Java's habit for list mutation, and there is no list
    // being mutated here.
    const dropRepetitionCounters = (from: Element): void => {
      for (const node of from.query('descendant::*[@repetitionCounter]')) {
        // `descendant::*` yields elements and `[@repetitionCounter]` requires the attribute,
        // so both facts hold — and both are now tested rather than asserted with
        // `as unknown as Element` and a `!`.
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
   * writes the msm document to a string (filename parameter kept for API compatibility)
   * @param _filename the filename string (not used in TS port; kept for API compatibility)
   * @returns the XML string or null
   *
   * The parameter is inert — it mirrors Java's `writeMsm(String filename)`, which this
   * port cannot honour without a file system. Kept so ported call sites still compile.
   * (It costs one `no-unused-vars`, which an `argsIgnorePattern: '^_'` in the ESLint
   * config would retire properly; that config is not this item's to change.)
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
   *
   * `bpm` and `generateProgramChanges` are one signature because they are the same mode
   * with more detail supplied. The boolean-first overload above stays separate because it
   * is a *different* mode — its single argument means something else.
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
   *   ({@link Performance.perform}) and the result is rendered; if omitted, **this** MSM
   *   is rendered as-is and must already carry the performance attributes
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

    // `getRootElement() === null` is exactly `isEmpty()`, so the early return and the
    // navigation below now take the same value.
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

    // Looked up once. The three calls below asserted `<global>` three times over, each
    // re-walking the root's children to make the same claim; an MSM without a `<global>`
    // threw on the first of them then and throws here now.
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
   * `bpm` counts *beats*, and a beat is one unit of the first global time signature's
   * denominator — so 120 bpm in 6/8 means 120 eighths, not 120 quarters.
   *
   * **This method used the `!` as control flow, and the two absences it collapsed are not
   * the same absence.** The whole five-link navigation sat inside a `try` so that any
   * missing link — no global, no dated, no timeSignatureMap, no timeSignature — threw a
   * `TypeError` and fell back to a quarter-note beat, which is Java's catch-all. But the
   * *sixth* `!`, on `getAttributeValue('denominator')`, does not throw: it hands `parseInt`
   * a genuine `null`, which coerces to the string "null" and yields `NaN`, so a
   * `<timeSignature>` with no denominator produced `1.0 / NaN` = `NaN`, NOT the 0.25
   * fallback. Written out, that difference is visible; written as a `!` chain in a `try`,
   * it read as if the two cases agreed. Both behaviours are preserved exactly.
   */
  private makeInitialTempo(bpm: number, track: Track): void {
    const root = this.getRootElement();
    const global = root === null ? null : root.getFirstChildElement('global');
    const dated = global === null ? null : global.getFirstChildElement('dated');
    const map = dated === null ? null : dated.getFirstChildElement('timeSignatureMap');
    const timeSignature = map === null ? null : map.getFirstChildElement('timeSignature');

    let beatlength: number;
    if (timeSignature === null) {
      beatlength = 0.25; // the missing-element arm, formerly the `catch`
    } else {
      const denominator = timeSignature.getAttributeValue('denominator');
      // `parseInt(null!)` is `parseInt("null")` is `NaN`; see the note above.
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
   * A part with no usable name still gets a program change — to Acoustic Grand Piano —
   * but no track name. `generateProgramChanges` is already the *resolved* flag here: the
   * caller clears it when a programChangeMap has supplied an initial program change, so
   * this method never overrides an explicit one.
   */
  private processPartName(
    part: Element,
    track: Track,
    channel: number,
    generateProgramChanges: boolean,
  ): void {
    // Three reads of `name` — a presence test, an emptiness test, and an asserted read —
    // become one. `null` and `''` take the same branch here, which is why the value can be
    // tested for both at once.
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
   * @returns whether the map contained an entry at date 0 — *not* whether it rendered
   *   anything. The caller uses it to decide whether {@link processPartName} still has to
   *   invent an opening program change: a map that only switches instrument later leaves
   *   the opening bars unset, so the name-derived guess is still wanted.
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
      // `parseInt(n.getAttributeValue('value')!)` was this, and on a `<programChange>` with
      // no `value` it handed `parseInt` a real null — the string "null", hence NaN, hence a
      // program change to instrument NaN, which `channelMessage` masks to 0 (Acoustic Grand
      // Piano). `getAttributeValue`'s miss is `''`, and `parseInt('')` is NaN too, so this
      // is the same number by the same route with no lie in the type.
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
   * The two branches are not symmetric, and both asymmetries are Java's
   * (`Msm.java:1000`):
   *
   * - a note with no `xml:id` gets the text `'unknown'` in the expressive branch but the
   *   empty string in the symbolic one, because the latter goes through
   *   {@link getAttributeValue}, whose miss value is `''`;
   * - a missing `milliseconds.date.end` logs and falls back to `date + duration`, mixing a
   *   millisecond date with a tick duration. That is a data error rather than a supported
   *   mode, which is why it is loud.
   *
   * Velocity defaults to 100 where the attribute is absent — the same constant the
   * symbolic branch uses unconditionally.
   */
  private processScore(part: Element, track: Track, exportExpressive: boolean): void {
    // The three-way guard was three tests followed by three assertions re-reading the same
    // three things; it is now three reads, each tested where it is bound. Same short
    // circuit, same order, one walk of `part`'s children instead of three.
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
        // `'id'`, not `'xml:id'`. Both spellings reach the same attribute through
        // `attribute`'s third lookup, but only this one is CORRECT in the reference too:
        // Java's `Helper.getAttribute` matches a local name, so
        // `Helper.getAttributeValue("xml:id", n)` missed all three of its lookups and always
        // returned `""` — every text event in every reference `.mid` was `FF 01 00`, a
        // zero-length payload. That is a defect in the fork rather than a contract to match,
        // and it is fixed there (`meico@68ccd3b8`); the references were regenerated with it.
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
   * The loop runs **backwards through the map**, and that is what implements
   * {@link CONTROL_CHANGE_DENSITY}: of a cluster of entries within the density window the
   * *last* survives, since it is the one seen first. Entries carrying `mandatory` bypass
   * the thinning. Iterating forwards would keep the first of each cluster instead and
   * change the output. Ordering of the resulting events is not affected — `Track.add`
   * sorts by tick, stably.
   *
   * Two paths add a default volume of 100 at date 0: no channelVolumeMap at all, and a
   * map whose earliest surviving entry is after date 0 (`prevDate > 0`, which an empty map
   * also satisfies since `prevDate` is still its initial sentinel).
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
   * Unlike {@link parseChannelVolumeMap} this is **not** thinned by
   * {@link CONTROL_CHANGE_DENSITY}; every entry becomes an event. It also iterates
   * backwards, but here that is only shape shared with its neighbour, not a filter.
   *
   * An unrecognised (or absent) `controller` falls through to controller number 0 — bank
   * select — rather than being skipped. Java does the same (`Msm.java:1092`); only
   * `sustain` and `soft` are mapped.
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
   * **Fixed upstream, then here.** The thresholds used to be `> 1.0` / `< 1.0`, which a
   * sharp — exactly `1.0` — passed neither, so a sharp key signature reached MIDI as zero
   * accidentals while a flat one was counted correctly. That asymmetry is why it never
   * looked like an off-by-one. It was Java's arithmetic verbatim, and it was simply wrong:
   * `keys_accidentals` is D major and Java wrote `sf=0`.
   *
   * Repaired in the fork first (`meico@db83c7c5`, `Msm.java:1151,1155`) and the reference
   * MIDI regenerated from it, so byte equivalence still holds — it is now equivalence with
   * a Java that counts sharps. Four fixtures moved, by six bytes in all: `keys_accidentals`,
   * `comprehensive`, `composite_advanced` and `tuplets`, each an `sf` byte of `0` becoming
   * the sharp count it always should have been. Recorded in PARITY.md §3.
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
      // `parseFloat(e.getAttributeValue('date')!)` was this. `getAttributeValue`'s miss is
      // `''` and `parseFloat('')` is `NaN`, which is exactly what `parseFloat(null)` gave —
      // an undated entry has always produced an event at tick NaN, and still does.
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

      // Absent is 4; present-but-unparsable stays NaN. Reading the attribute once keeps
      // those two apart, which is the whole reason the test was written against
      // `getAttribute` rather than against the value.
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
   * A marker with no `message` becomes the literal `'marker'`; one carrying an EMPTY
   * `message` keeps the empty string, which is a different event. That distinction used to
   * be made by `e.getAttributeValue('message')!` — an assertion that typed the null away
   * and then tested for it anyway, inside a `try` for an accessor that cannot throw. Three
   * spellings of one question; this is the question.
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
   * This method checks whether the velocity values hold the specified limits. If not, they are scaled down.
   * @param min
   * @param max
   *
   * Called once, as `fitVelocities(0, 127)` from the expressive branch of
   * {@link renderMidi}, and it **rewrites the `velocity` attributes in place** — this is
   * one of the sanctioned mutation sites, and it is why it must run before any note event
   * is built.
   *
   * Two details that look like bugs and are not:
   *
   * - `highest` starts at `-Number.MAX_VALUE`, where Java writes `Double.MIN_VALUE`
   *   (`Msm.java:803`) — which in Java is the smallest *positive* double, not the most
   *   negative one. The port writes what Java meant. It cannot diverge at this call site:
   *   both sentinels are far below `max`, and {@link computePartwiseCompression} reads
   *   `highest` only inside `highest > max`.
   * - the scan is `if (value < lowest) … else if (value > highest) …`, so a run of
   *   descending values never sets `highest` at all. Java's, verbatim.
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
   * This method computes a compression of an unlimited input domain to a limited output domain.
   * It uses a semicircle to define a projection into the interval [min, max].
   * @param x
   * @param min
   * @param max
   * @returns
   *
   * **Unused, here and in Java** (`Msm.java:846`) — the rejected alternative to
   * {@link computePartwiseCompression}, kept because Java keeps it. Java's own comment
   * says why it lost: the projection is fixed, so it practically never reaches `min` or
   * `max` and the available range goes to waste. Retained rather than deleted so the two
   * trees stay comparable; a dead-code sweep (T21) can take it, with that note.
   */
  private static computeSemicircleCompression(x: number, min: number, max: number): number {
    const radius = (max - min) / 2.0;
    const xNorm = x - min - radius;
    const xResultNorm = (radius * xNorm) / Math.sqrt(xNorm * xNorm + radius * radius);
    return xResultNorm + min + radius;
  }

  /**
   * This method computes a compression of a limited input domain to a limited output domain.
   * It uses a partwise linear mapping.
   * @param attributes the values to be mapped according to the compression
   * @param lowest
   * @param highest
   * @param min
   * @param max
   *
   * The mapping is piecewise linear in up to five pieces: the far-below tail
   * `[lowest, min)`, the lower roll-off `[min, lowerCompMax)`, the untouched middle, the
   * upper roll-off `(upperCompMin, max]` and the far-above tail `(max, highest]`. Values
   * in the middle are left exactly as they are — that is the `continue`, not a skipped
   * write.
   *
   * `rolloffFactor` is what keeps the compression from flattening everything: only
   * `1 - rolloffFactor` of each in-range half's span is given up to make room for the
   * out-of-range tail. `upperRolloff1` is written as `((max - upperCompMin) *
   * rolloffFactor) / (max - upperCompMin)`, i.e. algebraically just `rolloffFactor`;
   * kept in that form because it is Java's (`Msm.java:886`) and because the expression
   * documents which span is being scaled.
   *
   * Floating-point arithmetic under a bit-identity requirement: **no operand may be
   * reordered and no subexpression factored out**, however redundant it looks.
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
   * returns the date of the last note's offset (not in milliseconds but in MIDI ticks!)
   * @returns
   */
  getEndDate(): number {
    let latestOffset = 0.0;
    const parts = this.requireRootElement().getChildElements('part'); // get all parts

    // in each part
    for (const part of parts) {
      const dated = part.getFirstChildElement('dated');
      if (dated === null) continue;
      const score = dated.getFirstChildElement('score');
      if (score === null) continue;

      // Compute the offset of each note and keep the largest. Forwards, where Java walks
      // backwards (`Msm.java:1382`): the loop is a maximum over a set, `latestOffset` is
      // *assigned* rather than accumulated, and `>` is strict, so a tie keeps a value equal
      // to the one it would have replaced. No sum is reassociated and no order is observable
      // — the two directions answer the same double for every input, NaN included (`NaN >
      // x` is false whichever end you start from).
      for (const note of score.getChildElements('note')) {
        // Both were `getAttributeValue(…)!`, which hands `parseFloat` a real null on a note
        // that lacks the attribute — the string "null", so `NaN`. `getAttributeValue`'s miss
        // is `''`, and `parseFloat('')` is `NaN` too, so an undated or durationless note
        // still contributes a NaN offset that fails `>` and is ignored. Same number, and
        // the type no longer claims a string that is not there.
        const date = parseFloat(getAttributeValue('date', note)); // get its date
        const dur = parseFloat(getAttributeValue('duration', note)); // get its duration
        const offset = date + dur; // compute the offset date
        if (offset > latestOffset)
          // if its after the last offset known so far
          latestOffset = offset; // set this to the last offset
      }
    }

    return latestOffset;
  }

  /**
   * a helper method for parsing the milliseconds date of an element
   * @param e
   * @returns
   *
   * The single place expressive export reads a date. Everything below it — notes, markers,
   * signatures, control changes — goes through here, which is why an MSM that has not been
   * performed produces one error line per element rather than one for the document.
   *
   * The fallback to `date` is a last resort, not a mode: it substitutes a value in MSM
   * ticks where milliseconds are expected. An element with **neither** attribute throws, in
   * this port and in Java (`Msm.java:1424` dereferences the null `Attribute`, giving an NPE;
   * `dateAtt!.getValue()` here gave a `TypeError`). That stays a throw — the only change is
   * that it names both attributes it looked for instead of reporting a missing property.
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
    return Math.round(parseFloat(symbolicDate.getValue())); // Math.round(double) returns number
  }

  /**
   * this method adds xml:ids to all note and rest elements, as far as they do not have an id
   * @returns the generated ids count
   *
   * The XPath returns document order and {@link addUUID} is applied in that order, so the
   * *n*-th generated id belongs to the *n*-th id-less note or rest.
   *
   * Which elements are selected is observable; the order in which they are visited is
   * not, as long as this is the only generator running — reversing the loop just permutes
   * a set of opaque UUIDs among the same elements, and the tests' first-occurrence
   * canonicalisation quotients exactly that away (confirmed: a reversed-loop mutant flips
   * nothing). Changing the *predicate* is what shows: dropping `rest` from it flips the
   * probe immediately. Treat the traversal as fixed anyway — the invariance argument
   * stops holding the moment a second id generator runs against the same document, which
   * is the situation `Mei2MsmMpmConverter` is in.
   *
   * Not on the pipeline path: nothing in `src/` calls this, so unlike its MEI namesake it
   * does not contribute ids to the reference fixtures.
   *
   * The predicate is `not(@xml:id)`, so elements that already have one keep it.
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
    // go through all the nodes. `descendant::*` yields elements, so the `instanceof` cannot
    // fire; it replaces an `as unknown as Element` and is what lets the return below stay
    // `e.size()` — the count of what the query SELECTED, which is what Java returns, rather
    // than a count of what this loop happened to visit.
    for (const node of e) if (node instanceof Element) addUUID(node); // add the xml:id attribute with a UUID

    console.log(' done');

    return e.size();
  }
}
