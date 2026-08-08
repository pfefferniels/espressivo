import { Element, Attribute, Nodes, Elements, Document } from '../xml/XomTypes.js';
import { AbstractMsm } from './AbstractMsm.js';
import { Goto } from './Goto.js';
import { KeyValue } from '../supplementary/KeyValue.js';
import { v4 as uuidv4 } from 'uuid';

import { Midi } from '../midi/Midi.js';
import { Sequence, Track, MidiEvent } from '../midi/MidiTypes.js';
import { EventMaker } from '../midi/EventMaker.js';
import type { Performance } from '../mpm/elements/Performance.js';

/**
 * `mei/Helper` in miniature, private to this module.
 *
 * `Msm.java` calls exactly eight `Helper` methods and no others; these are those eight,
 * reimplemented here rather than imported. The same arrangement is used in `Mpm.ts`, and
 * `getFirstChildElement`/`getAllChildElements` below are deliberately byte-identical to
 * their counterparts there.
 *
 * Do **not** "deduplicate" these against `src/mei/Helper.ts` on sight: that module is the
 * MEI half of the port and its copies are not everywhere equivalent to these (see the
 * note on {@link cloneElement}). Merging the two sets is T14/T18 business, and it needs a
 * behavioural comparison per method, not a textual one.
 */
function getAttribute(name: string, ofThis: Element): Attribute | null {
  if (ofThis === null) return null;

  let a = ofThis.getAttribute(name);
  if (a !== null) return a;

  a = ofThis.getAttribute(name, ofThis.getNamespaceURI());
  if (a !== null) return a;

  a = ofThis.getAttribute(name, 'http://www.w3.org/XML/1998/namespace');
  if (a !== null) return a;

  return null;
}

/**
 * The value of {@link getAttribute}, or `''` when the attribute is absent — note that an
 * absent attribute and one with an empty value are indistinguishable through this
 * function. Callers that must tell them apart use {@link getAttribute} directly.
 */
function getAttributeValue(name: string, ofThis: Element): string {
  const a = getAttribute(name, ofThis);
  if (a === null) return '';
  return a.getValue();
}

function getFirstChildElement(name: string, ofThis: Element): Element | null {
  if (ofThis === null || name.length === 0) return null;

  const es = ofThis.getChildElements();
  for (let i = 0; i < es.size(); ++i) {
    if (es.get(i).getLocalName() === name) {
      return es.get(i);
    }
  }
  return null;
}

function getAllChildElements(name: string, ofThis: Element): Element[] {
  if (ofThis === null || name.length === 0) return [];
  const es = ofThis.getChildElements(name);
  const result: Element[] = [];
  for (let i = 0; i < es.size(); ++i) {
    result.push(es.get(i));
  }
  return result;
}

/**
 * The next sibling element of `ofThis`, either the next one of any name (one argument) or
 * the next one whose local name is `name` (two arguments).
 *
 * The named form scans **backwards** and returns the last candidate seen before reaching
 * `ofThis`, which is Java's formulation (`Helper.java:182`) and is why it returns the
 * *nearest* following match rather than the last one in the list.
 */
function getNextSiblingElement(nameOrElement: string | Element, ofThis?: Element): Element | null {
  if (typeof nameOrElement === 'string') {
    // getNextSiblingElement(name, ofThis)
    const name = nameOrElement;
    if (ofThis === undefined || ofThis === null) return null;

    const parent = ofThis.getParent();
    if (parent === null) return null;

    const es = parent.getChildElements();
    let candidate: Element | null = null;

    for (let i = es.size() - 1; i >= 0; --i) {
      if (es.get(i) === ofThis) {
        return candidate;
      }
      if (es.get(i).getLocalName() === name) {
        candidate = es.get(i);
      }
    }
    return null;
  } else {
    // getNextSiblingElement(ofThis)
    const elem = nameOrElement;
    if (elem === null) return null;

    const parent = elem.getParent();
    if (parent === null) return null;

    const index = parent.indexOf(elem);
    if (index >= parent.getChildCount() - 1) return null;

    const child = parent.getChild(index + 1);
    if (child instanceof Element) return child;
    return null;
  }
}

/**
 * A flat copy of `e`: same name, same namespace, copies of all its attributes, no
 * children and no parent.
 *
 * It is implemented as a deep copy with the children stripped afterwards, because
 * {@link Element} exposes no attribute-by-index accessor and therefore no way to walk the
 * attributes directly — Java's version (`Helper.java:328`) builds the clone attribute by
 * attribute instead. That costs a full subtree copy per call; `applySequencingMapToMap`
 * is the only caller and calls it once per map, so it is not in a loop.
 *
 * **Not identical to Java**, and deliberately not "fixed": Java rebuilds each attribute as
 * `new Attribute(localName, value)`, which drops the attribute's namespace, whereas
 * `copy()` preserves it. The difference is only observable on a map element that itself
 * carries a namespaced attribute (e.g. `xml:id`); no fixture produces one.
 */
function cloneElement(e: Element): Element {
  if (e === null) return null!;

  const clone = e.copy();
  while (clone.getChildCount() > 0) {
    clone.removeChildAt(0);
  }
  return clone;
}

function getFilenameWithoutExtension(filename: string): string {
  const i = filename.lastIndexOf('.');
  if (i === 0) return filename;
  if (i === -1) return filename;
  return filename.substring(0, i);
}

/**
 * Give `toThis` a fresh `xml:id` of the form `meico_<uuid>` and return it.
 *
 * Its only caller is {@link Msm.addIds}, which nothing in the conversion pipeline invokes
 * — the `meico_` ids in the reference MSM files come from `mei/Helper.addUUID`, not from
 * here. So this copy is not itself pinned by the equivalence fixtures; the same discipline
 * still applies to it, because the moment a caller does put it on that path, the number
 * and order of these calls become part of the compared output (the tests canonicalise
 * generated ids by first-occurrence order in the serialised document).
 *
 * Caution, as in Java: an existing `xml:id` is overwritten.
 */
function addUUID(toThis: Element): string {
  const uuid = `meico_${uuidv4()}`;
  const a = new Attribute('xml:id', 'http://www.w3.org/XML/1998/namespace', uuid);
  toThis.addAttribute(a);
  return uuid;
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

  /**
   * constructor — an empty Msm, to be filled by {@link createMsm} or by hand
   *
   * The three overloads are kept apart on purpose, as in `Mpm`: they are three different
   * things to start from (nothing, a parsed document, unparsed XML text), not one
   * parameter that happens to be optional. Collapsing them onto
   * `Document | string | undefined` would say less than the three signatures do.
   */
  constructor();
  /**
   * constructor
   * @param msm the msm document of which to instantiate the Msm object
   */
  constructor(msm: Document);
  /**
   * constructor
   * @param xml xml code as UTF8 String
   */
  constructor(xml: string);
  constructor(arg?: Document | string) {
    if (arg === undefined) {
      super();
    } else if (arg instanceof Document) {
      super(arg);
    } else if (typeof arg === 'string') {
      super(arg);
    } else {
      // unreachable from TypeScript, but reachable from plain JS (`new Msm(42)`); without
      // it `super()` would never run and the instance would be unusable
      super();
    }
  }

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
   */
  clone(): Msm {
    const cloneDoc = this.getDocument()!.copy();
    const clone = new Msm(cloneDoc);
    clone.isValidFlag = this.isValid();
    if (this.getFile() !== null) clone.setFile(this.getFile()!);
    return clone;
  }

  /**
   * This getter method returns the title string from the root element's attribute title.
   * If missing, use the filename without extension or return "".
   * @returns
   */
  getTitle(): string {
    try {
      const title = getAttribute('title', this.getRootElement()!);
      if (title === null) {
        return this.getFile() !== null ? getFilenameWithoutExtension(this.getFile()!) : '';
      }
      return title.getValue();
    } catch {
      return this.getFile() !== null ? getFilenameWithoutExtension(this.getFile()!) : '';
    }
  }

  /**
   * this getter returns the timing resolution (pulses per quarternote) of the MSM
   * @returns
   */
  getPPQ(): number {
    try {
      const ppq = getAttribute('pulsesPerQuarter', this.getRootElement()!);
      if (ppq === null) return 0;
      return parseInt(ppq.getValue());
    } catch {
      return 0;
    }
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
    this.getRootElement()!.getAttribute('pulsesPerQuarter')!.setValue(String(ppq));
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
    const atts: Nodes = this.getRootElement()!.query(
      'descendant::*[attribute::date]/attribute::date | descendant::*[attribute::date.end]/attribute::date.end | descendant::*[attribute::duration]/attribute::duration',
    );
    for (let i = 0; i < atts.size(); ++i) {
      const att = atts.get(i) as unknown as Attribute;
      att.setValue(String((parseFloat(att.getValue()) * ppq) / ppqOld));
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
      const notes = score.getChildElements('note');
      for (let j = 0; j < notes.size(); ++j) {
        // go through all notes
        const note = notes.get(j);
        const dur = Math.round(parseFloat(note.getAttributeValue('duration')!)); // get the note's duration
        for (let subdivs = maxSubdivisions; subdivs <= ppq; subdivs *= 2) {
          if (dur % Math.trunc(ppq / subdivs) === 0) {
            maxSubdivisions = Math.max(maxSubdivisions, subdivs);
            break;
          }
        }

        const date = Math.round(parseFloat(note.getAttributeValue('date')!)); // get the note's date
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
  static makePartFromString(
    name: string,
    number: string,
    midiChannel: number,
    midiPort: number,
  ): Element {
    const part = AbstractMsm.makePartFromString(name, number, midiChannel, midiPort);

    // add some MSM-specific maps to the dated environment
    const dated = part.getFirstChildElement('dated')!;
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
    this.getRootElement()!.appendChild(part);
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
      const numberAtt = getAttribute('number', part);
      if (numberAtt !== null && parseInt(numberAtt.getValue()) === number) return part;
    }

    // try to find the part by its name
    for (const part of parts) {
      const nameAtt = getAttribute('name', part);
      if (nameAtt !== null && nameAtt.getValue() === name) return part;
    }

    // try to find the part by its MIDI port and channel
    for (const part of parts) {
      const portAtt = getAttribute('midi.port', part);
      if (portAtt !== null && parseInt(portAtt.getValue()) === midiPort) {
        const channelAtt = getAttribute('midi.channel', part);
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
    return this.getRootElement()!.getChildElements('part');
  }

  /**
   * a convenience method that returns all part elements as an array for iteration
   * @returns
   */
  getPartsArray(): Element[] {
    const parts = this.getParts();
    const result: Element[] = [];
    for (let i = 0; i < parts.size(); ++i) {
      result.push(parts.get(i));
    }
    return result;
  }

  /**
   * a getter for the global environment
   * @returns
   */
  getGlobal(): Element | null {
    return this.getRootElement()!.getFirstChildElement('global');
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
    if (this.isEmpty()) return;

    const r: Nodes = this.getRootElement()!.query("descendant::*[local-name()='rest']"); // select all rest elements
    for (let i = 0; i < r.size(); ++i) {
      r.get(i).getParent()!.removeChild(r.get(i)); // remove them
      r.get(i).detach();
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
    if (this.isEmpty()) return repetitionIDs;

    const globalSequencingMap = this.getRootElement()!
      .getFirstChildElement('global')!
      .getFirstChildElement('dated')!
      .getFirstChildElement('sequencingMap'); // get the global sequencingMap (or null if there is none)
    const parts = this.getRootElement()!.getChildElements('part'); // get all the parts

    // expand global maps
    if (globalSequencingMap !== null) {
      const maps = this.getRootElement()!
        .getFirstChildElement('global')!
        .getFirstChildElement('dated')!
        .getChildElements();
      for (let j = 0; j < maps.size(); ++j) {
        // go through all maps
        const map = maps.get(j); // one map
        if (
          map.getChildCount() === 0 || // do not expand sequencingMaps
          map.getLocalName() === 'miscMap' || // ignore miscMaps as they will be deleted anyway
          map.getLocalName() === 'sequencingMap'
        )
          // or if the map is empty
          continue; // continue with the next

        const newMap = Msm.applySequencingMapToMap(globalSequencingMap, map, repetitionIDs); // apply the global sequencingMap to it
        if (newMap !== null)
          this.getRootElement()!
            .getFirstChildElement('global')!
            .getFirstChildElement('dated')!
            .replaceChild(map, newMap); // replace the old map by the new one
      }
    }

    // go through all parts and expand their maps according to the underlying sequencingMaps
    for (let i = 0; i < parts.size(); ++i) {
      // for each part
      const part = parts.get(i); // get it as element
      let sequencingMap = part.getFirstChildElement('dated')!.getFirstChildElement('sequencingMap'); // get the part's local sequencingMap if there is one
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
      const maps = part.getFirstChildElement('dated')!.getChildElements();
      for (let j = 0; j < maps.size(); ++j) {
        // go through all maps
        const map = maps.get(j); // one map
        if (
          map.getChildCount() === 0 || // do not expand sequencingMaps
          map.getLocalName() === 'miscMap' || // ignore miscMaps as they will be deleted anyway
          map.getLocalName() === 'sequencingMap'
        )
          // or if the map is empty
          continue; // continue with the next

        const newMap = Msm.applySequencingMapToMap(sequencingMap!, map, repetitionIDs); // apply the sequencingMap to it
        if (newMap !== null) map.getParent()!.replaceChild(map, newMap); // replace the old map by the new one
      }

      // delete the local sequencingMap (because it does not apply anymore)
      if (localMap) {
        part.getFirstChildElement('dated')!.removeChild(sequencingMap!);
        sequencingMap!.detach();
      }
    }

    // delete the global sequencingMap (because it does not apply anymore)
    if (globalSequencingMap !== null) {
      this.getRootElement()!
        .getFirstChildElement('global')!
        .getFirstChildElement('dated')!
        .removeChild(globalSequencingMap);
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
   * `i = -1` at the end of the outer loop is not a bug — it restarts the goto search from
   * the beginning, because a jump can land *before* gotos that were already passed, and
   * those must be reconsidered. The loop still terminates: a goto is only ever taken by
   * consuming a `1` from its {@link Goto.activity} string, and every test of a goto
   * advances that string's cursor, so the total number of jumps is bounded by the total
   * number of `1`s in the sequencingMap.
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

    // make an Array of Goto instances
    const gotos: Goto[] = []; // this is the list
    for (let i = 0; i < gs.size(); ++i) {
      // fill the goto list, go through all gotos
      try {
        gotos.push(new Goto(gs.get(i))); // from the goto element create a Goto instance
      } catch (e) {
        // if this fails
        console.error(e); // print the exception and continue with the next
      }
    }

    // create a new map and fill it by traversing the original map as indicated by the goto elements
    const newMap = cloneElement(map); // make a flat copy of the map (no children so far) to refill it according to the sequencingMap

    let currentDate = 0.0; // start at date 0.0
    let dateOffset = 0.0; // this sums up the offsets that come from inserting repetitions
    for (let i = 0; i < gotos.length; ++i) {
      // find the next goto
      const gt = gotos[i]; // get the next goto
      if (gt.date < currentDate || !gt.isActive()) continue; // if the goto is before currentDate or it is not active continue with the next

      // copy everything between currentDate and gt.date from the original map into newMap
      for (
        let e = Msm.getElementAtAfter(currentDate, map);
        e !== null;
        e = getNextSiblingElement(e)
      ) {
        // go through the map elements
        currentDate = parseFloat(e.getAttributeValue('date')!); // read its date
        if (currentDate >= gt.date) break; // if the element's date is at or after the goto don't copy further
        const eCopy = e.copy(); // make a deep copy of the element
        eCopy.getAttribute('date')!.setValue(String(currentDate + dateOffset)); // draw its date

        const endDate = e.getAttribute('date.end'); // get the date.end attribute
        if (endDate !== null) {
          // if the element has one, update it, too
          const dur = parseFloat(endDate.getValue()) - parseFloat(e.getAttributeValue('date')!);
          eCopy.getAttribute('date.end')!.setValue(String(currentDate + dur + dateOffset));
        }

        const repetitionCounter = e.getAttribute('repetitionCounter'); // get the counter
        if (repetitionCounter !== null) {
          // this is not the first time we process this element
          const reps = 1 + parseInt(e.getAttributeValue('repetitionCounter')!); // increase repetition counter
          e.getAttribute('repetitionCounter')!.setValue(String(reps)); // write it to the attribute
          const id = eCopy.getAttribute('id', 'http://www.w3.org/XML/1998/namespace'); // get the id of eCopy
          if (id !== null) {
            // if it has an xml:id
            let prevId = id.getValue(); // get the base ID
            const newId = `meico_repetition_${reps}_${prevId}`; // generate a new ID
            id.setValue(newId); // set the attribute

            // the key of the map entry should be the ID of the previous iteration, not the base ID
            for (let r = reps - 1; r > 0; --r) prevId = repetitionIDs.get(prevId)!;
            repetitionIDs.set(prevId, newId);
          }
        } else {
          // this is the first time we process this element
          e.addAttribute(new Attribute('repetitionCounter', '0')); // add an attribute to count the repetitions
        }
        newMap.appendChild(eCopy); // append the copy to the new map
      }

      dateOffset += gt.date - gt.targetDate; // draw the dateOffset
      currentDate = gt.targetDate; // draw currentDate
      i = -1; // start searching for the next goto
    }

    // last goto has been processed, now do the rest until the end marker
    for (
      let e = Msm.getElementAtAfter(currentDate, map);
      e !== null;
      e = getNextSiblingElement(e)
    ) {
      currentDate = parseFloat(e.getAttributeValue('date')!); // read its date
      const eCopy = e.copy(); // make a deep copy
      eCopy.getAttribute('date')!.setValue(String(currentDate + dateOffset)); // draw its date

      const endDate = e.getAttribute('date.end'); // get the date.end attribute
      if (endDate !== null) {
        // if the element has one, update it, too
        const dur = parseFloat(endDate.getValue()) - parseFloat(e.getAttributeValue('date')!);
        eCopy.getAttribute('date.end')!.setValue(String(currentDate + dur + dateOffset));
      }

      const repetitionCounter = e.getAttribute('repetitionCounter'); // get the counter
      if (repetitionCounter !== null) {
        // this is not the first time
        const reps = 1 + parseInt(e.getAttributeValue('repetitionCounter')!); // increase repetition counter
        e.getAttribute('repetitionCounter')!.setValue(String(reps)); // write it to the attribute
        const id = eCopy.getAttribute('id', 'http://www.w3.org/XML/1998/namespace'); // get the id
        if (id !== null) {
          let prevId = id.getValue();
          const newId = `meico_repetition_${reps}_${prevId}`;
          id.setValue(newId);

          for (let r = reps - 1; r > 0; --r) prevId = repetitionIDs.get(prevId)!;
          repetitionIDs.set(prevId, newId);
        }
      }

      newMap.appendChild(eCopy); // append the copy to the new map
    }

    // cleanup: delete all repetitionCounter attributes from all map and newMap elements
    let rs: Nodes = map.query('descendant::*[@repetitionCounter]');
    for (let i = rs.size() - 1; i >= 0; --i) {
      const r = rs.get(i) as unknown as Element;
      r.removeAttribute(r.getAttribute('repetitionCounter')!);
    }
    rs = newMap.query('descendant::*[@repetitionCounter]');
    for (let i = rs.size() - 1; i >= 0; --i) {
      const r = rs.get(i) as unknown as Element;
      r.removeAttribute(r.getAttribute('repetitionCounter')!);
    }

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
   * @returns the Midi object, or null if the MSM being rendered is empty
   *
   * Without the performance attributes (`milliseconds.date`, `milliseconds.date.end`,
   * `velocity`) the render silently falls back to the symbolic `date`/`duration` and
   * logs; the output is then MIDI in name only. That fallback is per element, not per
   * document — see {@link readMillisecondsDateFromElement}.
   */
  exportExpressiveMidi(performance?: Performance, generateProgramChanges?: boolean): Midi | null {
    const genPC = generateProgramChanges !== undefined ? generateProgramChanges : true;
    if (performance !== undefined) {
      return performance.perform(this).renderMidi(83.33, genPC, true);
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
    console.log(`\nConverting ${this.getFile() !== null ? this.getFile() : 'MSM data'} to MIDI.`);

    if (this.isEmpty()) return null;

    const ppq = this.getPPQ();
    const seq = new Sequence(Sequence.PPQ, ppq);

    let track = seq.createTrack();

    if (exportExpressive) {
      this.makeMillisecondTickTempo(track);
      this.fitVelocities(0, 127);
    } else {
      this.makeInitialTempo(bpm, track);
    }

    this.parseMarkerMap(
      this.getRootElement()!.getFirstChildElement('global')!,
      track,
      exportExpressive,
    );
    this.parseTimeSignatureMap(
      this.getRootElement()!.getFirstChildElement('global')!,
      track,
      exportExpressive,
    );
    this.parseKeySignatureMap(
      this.getRootElement()!.getFirstChildElement('global')!,
      track,
      exportExpressive,
    );

    for (
      let part = this.getRootElement()!.getFirstChildElement('part');
      part !== null;
      part = getNextSiblingElement('part', part)
    ) {
      if (part.getAttribute('midi.channel') === null) continue;

      track = seq.createTrack();

      let port = 0;
      if (part.getAttribute('midi.port') !== null)
        port = parseInt(part.getAttributeValue('midi.port')!);
      const portEvent = EventMaker.createMidiPortEvent(0, port);
      if (portEvent !== null) track.add(portEvent);

      const chan = parseInt(part.getAttributeValue('midi.channel')!);
      const channelPrefix = EventMaker.createChannelPrefix(0, chan);
      if (channelPrefix !== null) track.add(channelPrefix);

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

    if (this.getFile() !== null) {
      // same rewrite Java does with Helper.getFilenameWithoutExtension (Msm.java:777)
      const midi = new Midi(seq, `${getFilenameWithoutExtension(this.getFile()!)}.mid`);
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
   * denominator — so 120 bpm in 6/8 means 120 eighths, not 120 quarters. The whole
   * navigation is inside the `try` on purpose: any missing link in it (no global, no
   * dated, no timeSignatureMap, no timeSignature, no denominator) throws on a `!` and
   * falls back to a quarter-note beat, which is what Java's catch-all does.
   */
  private makeInitialTempo(bpm: number, track: Track): void {
    let beatlength: number;
    try {
      beatlength =
        1.0 /
        parseInt(
          this.getRootElement()!
            .getFirstChildElement('global')!
            .getFirstChildElement('dated')!
            .getFirstChildElement('timeSignatureMap')!
            .getFirstChildElement('timeSignature')!
            .getAttributeValue('denominator')!,
        );
    } catch {
      beatlength = 0.25;
    }
    const event = EventMaker.createTempo(0, bpm, beatlength);
    if (event !== null) track.add(event);
  }

  /**
   * The tempo trick that makes expressive export work: at `60000 / ppq` quarter-note bpm,
   * one MIDI tick lasts exactly one millisecond. Every date written afterwards is
   * therefore a millisecond value read straight from the performance attributes, with no
   * conversion anywhere, and the MSM's own ppq survives as the sequence resolution.
   */
  private makeMillisecondTickTempo(track: Track): void {
    const event = EventMaker.createTempo(0, 60000.0 / this.getPPQ(), 0.25);
    if (event !== null) track.add(event);
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
    if (part.getAttribute('name') === null || part.getAttributeValue('name') === '') {
      if (generateProgramChanges) {
        const event = EventMaker.createProgramChange(
          channel,
          0,
          EventMaker.PC_Acoustic_Grand_Piano,
        );
        if (event !== null) track.add(event);
      }
      return;
    }

    const name = part.getAttributeValue('name')!;

    if (generateProgramChanges) {
      const event = EventMaker.createProgramChangeByName(channel, 0, name);
      if (event !== null) track.add(event);
    }
    const trackNameEvent = EventMaker.createTrackName(0, name);
    if (trackNameEvent !== null) track.add(trackNameEvent);
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
    if (part.getFirstChildElement('dated') === null) return false;

    const programChangeMap = part
      .getFirstChildElement('dated')!
      .getFirstChildElement('programChangeMap');
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
      const value = parseInt(n.getAttributeValue('value')!);
      const event = EventMaker.createProgramChange(channel, date, value);
      if (event !== null) track.add(event);
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
    if (
      part.getFirstChildElement('dated') === null ||
      part.getFirstChildElement('dated')!.getFirstChildElement('score') === null ||
      part.getAttribute('midi.channel') === null
    )
      return;

    const chan = parseInt(part.getAttributeValue('midi.channel')!);

    for (
      let n = part
        .getFirstChildElement('dated')!
        .getFirstChildElement('score')!
        .getFirstChildElement('note');
      n !== null;
      n = getNextSiblingElement('note', n)
    ) {
      const pitch = Math.round(parseFloat(getAttributeValue('midi.pitch', n)));

      if (exportExpressive) {
        const date = Msm.readMillisecondsDateFromElement(n);

        const velocityAtt = getAttribute('velocity', n);
        const velocity =
          velocityAtt === null ? 100 : Math.round(parseFloat(velocityAtt.getValue()));

        const xmlId = n.getAttribute('id', 'http://www.w3.org/XML/1998/namespace');
        const textEvent = EventMaker.createTextEvent(
          date,
          xmlId === null ? 'unknown' : xmlId.getValue(),
        );
        if (textEvent !== null) track.add(textEvent);
        const noteOn = EventMaker.createNoteOn(chan, date, pitch, velocity);
        if (noteOn !== null) track.add(noteOn);

        let dateEnd: number;
        const endAtt = getAttribute('milliseconds.date.end', n);
        if (endAtt === null) {
          console.error(
            `Missing attribute "milliseconds.date.end" in element ${n.toXML()}. Using attribute "duration" instead.`,
          );
          const dur = Math.round(parseFloat(getAttributeValue('duration', n)));
          dateEnd = date + dur;
        } else {
          dateEnd = Math.round(parseFloat(endAtt.getValue()));
        }
        const noteOff = EventMaker.createNoteOff(chan, dateEnd, pitch, 0);
        if (noteOff !== null) track.add(noteOff);
      } else {
        const date = Math.round(parseFloat(getAttributeValue('date', n)));
        const xmlId = getAttributeValue('xml:id', n);
        const textEvent = EventMaker.createTextEvent(date, xmlId);
        if (textEvent !== null) track.add(textEvent);
        const noteOn = EventMaker.createNoteOn(chan, date, pitch, 100);
        if (noteOn !== null) track.add(noteOn);

        const dur = Math.round(parseFloat(getAttributeValue('duration', n)));
        const noteOff = EventMaker.createNoteOff(chan, date + dur, pitch, 0);
        if (noteOff !== null) track.add(noteOff);
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
    if (
      !exportExpressive ||
      part.getFirstChildElement('dated') === null ||
      part.getAttribute('midi.channel') === null
    )
      return;

    const chan = parseInt(part.getAttributeValue('midi.channel')!);
    const cvMap = getFirstChildElement('channelVolumeMap', part.getFirstChildElement('dated')!);

    if (cvMap === null) {
      const event = EventMaker.createControlChange(chan, 0, EventMaker.CC_Channel_Volume, 100);
      if (event !== null) track.add(event);
      return;
    }

    let prevDate = Number.MAX_SAFE_INTEGER;
    const es = cvMap.getChildElements();
    for (let i = es.size() - 1; i >= 0; --i) {
      const e = es.get(i);

      const date = Msm.readMillisecondsDateFromElement(e);

      const mandatory = getAttribute('mandatory', e) !== null;
      if (!mandatory && date >= prevDate - Msm.CONTROL_CHANGE_DENSITY) continue;
      prevDate = date;
      const value = Math.round(parseFloat(getAttributeValue('value', e)));
      const event = EventMaker.createControlChange(chan, date, EventMaker.CC_Channel_Volume, value);
      if (event !== null) track.add(event);
    }

    if (prevDate > 0) {
      const event = EventMaker.createControlChange(chan, 0, EventMaker.CC_Channel_Volume, 100);
      if (event !== null) track.add(event);
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
    if (
      !exportExpressive ||
      part.getFirstChildElement('dated') === null ||
      part.getAttribute('midi.channel') === null
    )
      return;

    const chan = parseInt(part.getAttributeValue('midi.channel')!);
    const posMap = getFirstChildElement('positionMap', part.getFirstChildElement('dated')!);

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

      const event = EventMaker.createControlChange(chan, date, controllerNumber, value);
      if (event !== null) track.add(event);
    }
  }

  /**
   * Converts a keySignatureMap into MIDI key signature events. Called once for `<global>`
   * and once per part, so `part` here is whichever environment is being scanned.
   *
   * MIDI states a key as a signed count of accidentals, so the MSM's list of
   * `<accidental>` children is reduced to one number: `value > 1` adds, `value < 1`
   * subtracts, exactly `1` does neither. `value` is a semitone offset, so a sharp is
   * `1.0` and a flat is `-1.0` (`Mei2MsmMpmConverter` writes exactly those two, and the
   * reference fixtures contain nothing else).
   *
   * **Ported bug — do not "fix".** Those thresholds should be `> 0` / `< 0`. As written,
   * a sharp (`1.0`) is not counted at all, so a sharp key signature reaches MIDI as zero
   * accidentals while a flat one is counted correctly. It is Java's arithmetic verbatim
   * (`Msm.java:1148-1157`), the reference MIDI files were generated with it, and
   * correcting it here would break byte equivalence rather than restore it. Charter rule:
   * behaviour parity beats correctness.
   */
  private parseKeySignatureMap(part: Element, track: Track, exportExpressive: boolean): void {
    if (
      part.getFirstChildElement('dated') === null ||
      part.getFirstChildElement('dated')!.getFirstChildElement('keySignatureMap') === null
    )
      return;

    for (
      let e = part
        .getFirstChildElement('dated')!
        .getFirstChildElement('keySignatureMap')!
        .getFirstChildElement('keySignature');
      e !== null;
      e = getNextSiblingElement('keySignature', e)
    ) {
      let date: number;
      if (exportExpressive) {
        date = Msm.readMillisecondsDateFromElement(e);
      } else {
        date = Math.round(parseFloat(e.getAttributeValue('date')!));
      }

      let accids = 0;
      for (
        let a = e.getFirstChildElement('accidental');
        a !== null;
        a = getNextSiblingElement('accidental', a)
      ) {
        if (a.getAttribute('value') !== null) {
          const value = parseFloat(a.getAttributeValue('value')!);
          if (value > 1.0) {
            accids++;
            continue;
          }
          if (value < 1.0) {
            accids--;
          }
        }
      }
      const event = EventMaker.createKeySignature(date, accids);
      if (event !== null) track.add(event);
    }
  }

  private parseTimeSignatureMap(part: Element, track: Track, exportExpressive: boolean): void {
    if (
      part.getFirstChildElement('dated') === null ||
      part.getFirstChildElement('dated')!.getFirstChildElement('timeSignatureMap') === null
    )
      return;

    for (
      let e = part
        .getFirstChildElement('dated')!
        .getFirstChildElement('timeSignatureMap')!
        .getFirstChildElement('timeSignature');
      e !== null;
      e = getNextSiblingElement('timeSignature', e)
    ) {
      let date: number;
      if (exportExpressive) date = Msm.readMillisecondsDateFromElement(e);
      else date = Math.round(parseFloat(e.getAttributeValue('date')!));

      const numerator =
        e.getAttribute('numerator') === null
          ? 4
          : Math.round(parseFloat(e.getAttributeValue('numerator')!));
      const denominator =
        e.getAttribute('denominator') === null
          ? 4
          : Math.round(parseFloat(e.getAttributeValue('denominator')!));
      const event = EventMaker.createTimeSignature(date, numerator, denominator);
      if (event !== null) track.add(event);
    }
  }

  /**
   * Converts a markerMap into MIDI marker meta events — the rehearsal marks, and the
   * anchors that sequencingMap gotos aim at (`target.id` names a marker's `xml:id`, see
   * {@link Goto}). Called once for `<global>` and once per part.
   *
   * A marker with no `message` becomes the literal `'marker'`. Both the `null` check and
   * the `try` around it are needed for that: `getAttributeValue` returns `null` when the
   * attribute is missing, and the `!` on it would otherwise let a null through.
   */
  private parseMarkerMap(part: Element, track: Track, exportExpressive: boolean): void {
    if (
      part.getFirstChildElement('dated') === null ||
      part.getFirstChildElement('dated')!.getFirstChildElement('markerMap') === null
    )
      return;

    for (
      let e = part
        .getFirstChildElement('dated')!
        .getFirstChildElement('markerMap')!
        .getFirstChildElement('marker');
      e !== null;
      e = getNextSiblingElement('marker', e)
    ) {
      let message: string;
      try {
        message = e.getAttributeValue('message')!;
        if (message === null) message = 'marker';
      } catch {
        message = 'marker';
      }

      let event: MidiEvent | null;
      if (exportExpressive)
        event = EventMaker.createMarker(Msm.readMillisecondsDateFromElement(e), message);
      else
        event = EventMaker.createMarker(
          Math.round(parseFloat(e.getAttributeValue('date')!)),
          message,
        );
      if (event !== null) track.add(event);
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
      const dated = getFirstChildElement('dated', part);
      if (dated === null) continue;
      const score = getFirstChildElement('score', dated);
      if (score === null) continue;
      const notes = getAllChildElements('note', score);
      for (const note of notes) {
        const velAtt = getAttribute('velocity', note);
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
    const parts = this.getRootElement()!.getChildElements('part'); // get all parts

    for (let i = 0; i < parts.size(); ++i) {
      // in each part
      const dated = parts.get(i).getFirstChildElement('dated');
      if (dated === null) continue;
      const score = dated.getFirstChildElement('score');
      if (score === null) continue;
      const notes = score.getChildElements('note'); // navigate to the note elements

      // compute the offset of each note and keep the last one
      for (let j = notes.size() - 1; j >= 0; --j) {
        // go through all notes
        const note = notes.get(j); // get the note
        const date = parseFloat(note.getAttributeValue('date')!); // get its date
        const dur = parseFloat(note.getAttributeValue('duration')!); // get its duration
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
   * ticks where milliseconds are expected. `dateAtt!` is genuinely unguarded — an element
   * with neither attribute throws, in both this port and Java.
   */
  private static readMillisecondsDateFromElement(e: Element): number {
    let dateAtt = getAttribute('milliseconds.date', e);
    if (dateAtt === null) {
      console.error(
        `Missing attribute "milliseconds.date" in element ${e.toXML()}. Using attribute "date" instead.`,
      );
      dateAtt = getAttribute('date', e);
    }
    return Math.round(parseFloat(dateAtt!.getValue())); // Math.round(double) returns number
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
    for (let i = 0; i < e.size(); ++i)
      // go through all the nodes
      addUUID(e.get(i) as unknown as Element); // add the xml:id attribute with a UUID

    console.log(' done');

    return e.size();
  }
}
