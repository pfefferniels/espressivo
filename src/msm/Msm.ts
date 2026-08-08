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
 * Helper functions that replicate meico.mei.Helper static methods used in Msm.
 * These are inlined here to avoid circular dependency issues. When Helper.ts is ported, these can be replaced.
 */
class Helper {
  static getAttribute(name: string, ofThis: Element): Attribute | null {
    if (ofThis === null) return null;

    let a = ofThis.getAttribute(name);
    if (a !== null) return a;

    a = ofThis.getAttribute(name, ofThis.getNamespaceURI());
    if (a !== null) return a;

    a = ofThis.getAttribute(name, 'http://www.w3.org/XML/1998/namespace');
    if (a !== null) return a;

    return null;
  }

  static getAttributeValue(name: string, ofThis: Element): string {
    const a = Helper.getAttribute(name, ofThis);
    if (a === null) return '';
    return a.getValue();
  }

  static getFirstChildElement(nameOrElement: string | Element, ofThis?: Element): Element | null {
    if (typeof nameOrElement === 'string') {
      const name = nameOrElement;
      if (ofThis === undefined || ofThis === null) return null;
      if (name.length === 0) return null;

      // iterate child elements
      const es = ofThis.getChildElements();
      for (let i = 0; i < es.size(); ++i) {
        if (es.get(i).getLocalName() === name) {
          return es.get(i);
        }
      }
      return null;
    } else {
      // getFirstChildElement(ofThis: Element) - returns first child element
      const elem = nameOrElement;
      if (elem === null) return null;
      const es = elem.getChildElements();
      if (es.size() === 0) return null;
      return es.get(0);
    }
  }

  static getAllChildElements(name: string, ofThis: Element): Element[] {
    if (ofThis === null || name.length === 0) return [];
    const es = ofThis.getChildElements(name);
    const result: Element[] = [];
    for (let i = 0; i < es.size(); ++i) {
      result.push(es.get(i));
    }
    return result;
  }

  static getNextSiblingElement(nameOrElement: string | Element, ofThis?: Element): Element | null {
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

  static cloneElement(e: Element): Element {
    if (e === null) return null!;

    const clone = new Element(e.getLocalName());
    clone.setNamespaceURI(e.getNamespaceURI());
    for (let i = e.getAttributeCount() - 1; i >= 0; --i) {
      // We need to access attributes by index. Use the XomTypes API.
      // The Java code iterates e.getAttribute(i) - we'll query all children attribute-related
      // Since XomTypes doesn't have getAttribute(index), we'll use a workaround
    }
    // Workaround: copy attributes using query
    // Actually, let's iterate child elements' attributes properly
    // We need to reconstruct this. The Element class stores _attributes internally.
    // For now, copy all attributes by known names from the original element
    return Helper.cloneElementImpl(e);
  }

  private static cloneElementImpl(e: Element): Element {
    const clone = new Element(e.getLocalName());
    clone.setNamespaceURI(e.getNamespaceURI());

    // Copy all attributes from the original element
    // Since we don't have getAttribute(index), we use the attributeCount and try to copy them
    // The best approach: serialize and parse just the opening tag, or use the copy() method and remove children
    const fullCopy = e.copy();
    // Remove all children from fullCopy
    while (fullCopy.getChildCount() > 0) {
      fullCopy.removeChildAt(0);
    }
    return fullCopy;
  }

  static getFilenameWithoutExtension(filename: string): string {
    const i = filename.lastIndexOf('.');
    if (i === 0) return filename;
    if (i === -1) return filename;
    return filename.substring(0, i);
  }

  static addUUID(toThis: Element): string {
    const uuid = `meico_${uuidv4()}`;
    const a = new Attribute('xml:id', 'http://www.w3.org/XML/1998/namespace', uuid);
    toThis.addAttribute(a);
    return uuid;
  }
}

/**
 * This class holds data in msm format (Musical Sequence Markup).
 * Port of meico.msm.Msm
 * @author Axel Berndt.
 */
export class Msm extends AbstractMsm {
  private static readonly CONTROL_CHANGE_DENSITY: number = 10; // in MPM-to-MIDI export a series of control change events may be generated; this constant limits their density

  /**
   * constructor
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
      super();
    }
  }

  /**
   * this factory creates an initial Msm instance with empty global maps
   * @param title
   * @param id an id string for the root element or null, in the latter case a random UUID will be created
   * @param ppq
   * @returns
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
      const title = Helper.getAttribute('title', this.getRootElement()!);
      if (title === null) {
        return this.getFile() !== null ? Helper.getFilenameWithoutExtension(this.getFile()!) : '';
      }
      return title.getValue();
    } catch (ex) {
      return this.getFile() !== null ? Helper.getFilenameWithoutExtension(this.getFile()!) : '';
    }
  }

  /**
   * this getter returns the timing resolution (pulses per quarternote) of the MSM
   * @returns
   */
  getPPQ(): number {
    try {
      const ppq = Helper.getAttribute('pulsesPerQuarter', this.getRootElement()!);
      if (ppq === null) return 0;
      return parseInt(ppq.getValue());
    } catch (ex) {
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
   * @returns
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
          if (dur % (ppq / subdivs) === 0) {
            maxSubdivisions = Math.max(maxSubdivisions, subdivs);
            break;
          }
        }

        const date = Math.round(parseFloat(note.getAttributeValue('date')!)); // get the note's date
        for (let subdivs = maxSubdivisions; subdivs <= ppq; subdivs *= 2) {
          if (date % (ppq / subdivs) === 0) {
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
      const numberAtt = Helper.getAttribute('number', part);
      if (numberAtt !== null && parseInt(numberAtt.getValue()) === number) return part;
    }

    // try to find the part by its name
    for (const part of parts) {
      const nameAtt = Helper.getAttribute('name', part);
      if (nameAtt !== null && nameAtt.getValue() === name) return part;
    }

    // try to find the part by its MIDI port and channel
    for (const part of parts) {
      const portAtt = Helper.getAttribute('midi.port', part);
      if (portAtt !== null && parseInt(portAtt.getValue()) === midiPort) {
        const channelAtt = Helper.getAttribute('midi.channel', part);
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
    const newMap = Helper.cloneElement(map); // make a flat copy of the map (no children so far) to refill it according to the sequencingMap

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
        e = Helper.getNextSiblingElement(e) as Element | null
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
      e = Helper.getNextSiblingElement(e) as Element | null
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
   * @returns true if success, false if an error occurred
   */
  writeMsm(): string | null {
    return this.exportXml();
  }

  /**
   * writes the msm document to a string (filename parameter kept for API compatibility)
   * @param _filename the filename string (not used in TS port; kept for API compatibility)
   * @returns the XML string or null
   */
  writeMsmString(_filename?: string): string | null {
    return this.exportXml();
  }

  exportMidi(): Midi | null;
  exportMidi(bpm: number): Midi | null;
  exportMidi(generateProgramChanges: boolean): Midi | null;
  exportMidi(bpm: number, generateProgramChanges: boolean): Midi | null;
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

  exportExpressiveMidi(): Midi | null;
  exportExpressiveMidi(performance: Performance): Midi | null;
  exportExpressiveMidi(performance: Performance, generateProgramChanges: boolean): Midi | null;
  exportExpressiveMidi(performance?: Performance, generateProgramChanges?: boolean): Midi | null {
    const genPC = generateProgramChanges !== undefined ? generateProgramChanges : true;
    if (performance !== undefined) {
      return performance.perform(this).renderMidi(83.33, genPC, true);
    }
    return this.renderMidi(83.33, true, true);
  }

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
      part = Helper.getNextSiblingElement('part', part)
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
      const origFile = this.getFile()!;
      const dotIdx = origFile.lastIndexOf('.');
      const base = dotIdx > 0 ? origFile.substring(0, dotIdx) : origFile;
      const midi = new Midi(seq, `${base}.mid`);
      console.log('MSM to MIDI conversion finished.');
      return midi;
    }

    console.log('MSM to MIDI conversion finished.');
    return new Midi(seq);
  }

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
    } catch (e) {
      beatlength = 0.25;
    }
    const event = EventMaker.createTempo(0, bpm, beatlength);
    if (event !== null) track.add(event);
  }

  private makeMillisecondTickTempo(track: Track): void {
    const event = EventMaker.createTempo(0, 60000.0 / this.getPPQ(), 0.25);
    if (event !== null) track.add(event);
  }

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
      n = Helper.getNextSiblingElement('programChange', n)
    ) {
      const date = exportExpressive
        ? Msm.readMillisecondsDateFromElement(n)
        : Math.round(parseFloat(Helper.getAttributeValue('date', n)));
      if (date === 0) weHaveAnInitialPrgCh = true;
      const value = parseInt(n.getAttributeValue('value')!);
      const event = EventMaker.createProgramChange(channel, date, value);
      if (event !== null) track.add(event);
    }
    return weHaveAnInitialPrgCh;
  }

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
      n = Helper.getNextSiblingElement('note', n)
    ) {
      const pitch = Math.round(parseFloat(Helper.getAttributeValue('midi.pitch', n)));

      if (exportExpressive) {
        const date = Msm.readMillisecondsDateFromElement(n);

        const velocityAtt = Helper.getAttribute('velocity', n);
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
        const endAtt = Helper.getAttribute('milliseconds.date.end', n);
        if (endAtt === null) {
          console.error(
            `Missing attribute "milliseconds.date.end" in element ${n.toXML()}. Using attribute "duration" instead.`,
          );
          const dur = Math.round(parseFloat(Helper.getAttributeValue('duration', n)));
          dateEnd = date + dur;
        } else {
          dateEnd = Math.round(parseFloat(endAtt.getValue()));
        }
        const noteOff = EventMaker.createNoteOff(chan, dateEnd, pitch, 0);
        if (noteOff !== null) track.add(noteOff);
      } else {
        const date = Math.round(parseFloat(Helper.getAttributeValue('date', n)));
        const xmlId = Helper.getAttributeValue('xml:id', n);
        const textEvent = EventMaker.createTextEvent(date, xmlId);
        if (textEvent !== null) track.add(textEvent);
        const noteOn = EventMaker.createNoteOn(chan, date, pitch, 100);
        if (noteOn !== null) track.add(noteOn);

        const dur = Math.round(parseFloat(Helper.getAttributeValue('duration', n)));
        const noteOff = EventMaker.createNoteOff(chan, date + dur, pitch, 0);
        if (noteOff !== null) track.add(noteOff);
      }
    }
  }

  private parseChannelVolumeMap(part: Element, track: Track, exportExpressive: boolean): void {
    if (
      !exportExpressive ||
      part.getFirstChildElement('dated') === null ||
      part.getAttribute('midi.channel') === null
    )
      return;

    const chan = parseInt(part.getAttributeValue('midi.channel')!);
    const cvMap = Helper.getFirstChildElement(
      'channelVolumeMap',
      part.getFirstChildElement('dated')!,
    );

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

      const mandatory = Helper.getAttribute('mandatory', e) !== null;
      if (!mandatory && date >= prevDate - Msm.CONTROL_CHANGE_DENSITY) continue;
      prevDate = date;
      const value = Math.round(parseFloat(Helper.getAttributeValue('value', e)));
      const event = EventMaker.createControlChange(chan, date, EventMaker.CC_Channel_Volume, value);
      if (event !== null) track.add(event);
    }

    if (prevDate > 0) {
      const event = EventMaker.createControlChange(chan, 0, EventMaker.CC_Channel_Volume, 100);
      if (event !== null) track.add(event);
    }
  }

  private parsePositionMap(part: Element, track: Track, exportExpressive: boolean): void {
    if (
      !exportExpressive ||
      part.getFirstChildElement('dated') === null ||
      part.getAttribute('midi.channel') === null
    )
      return;

    const chan = parseInt(part.getAttributeValue('midi.channel')!);
    const posMap = Helper.getFirstChildElement('positionMap', part.getFirstChildElement('dated')!);

    if (posMap === null) return;

    const es = posMap.getChildElements();
    for (let i = es.size() - 1; i >= 0; --i) {
      const e = es.get(i);

      const date = Msm.readMillisecondsDateFromElement(e);

      const value = Math.round(parseFloat(Helper.getAttributeValue('value', e)));
      const controller = Helper.getAttributeValue('controller', e);
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
      e = Helper.getNextSiblingElement('keySignature', e)
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
        a = Helper.getNextSiblingElement('accidental', a)
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
      e = Helper.getNextSiblingElement('timeSignature', e)
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
      e = Helper.getNextSiblingElement('marker', e)
    ) {
      let message: string;
      try {
        message = e.getAttributeValue('message')!;
        if (message === null) message = 'marker';
      } catch (error) {
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
   */
  private fitVelocities(min: number, max: number): void {
    // if min is greater than max, switch the values
    if (min > max) {
      const x = min;
      min = max;
      max = x;
    }

    // find all velocity attributes and get their values
    const velocities: KeyValue<number, Attribute>[] = [];
    let lowest = Number.MAX_VALUE;
    let highest = -Number.MAX_VALUE;
    const parts = this.getPartsArray();
    for (const part of parts) {
      const dated = Helper.getFirstChildElement('dated', part);
      if (dated === null) continue;
      const score = Helper.getFirstChildElement('score', dated);
      if (score === null) continue;
      const notes = Helper.getAllChildElements('note', score);
      for (const note of notes) {
        const velAtt = Helper.getAttribute('velocity', note);
        if (velAtt === null) continue;
        const value = parseFloat(velAtt.getValue());
        if (value < lowest) lowest = value;
        else if (value > highest) highest = value;
        velocities.push(new KeyValue<number, Attribute>(value, velAtt));
      }
    }

    const scaleLowerHalf = lowest < min;
    const scaleUpperHalf = highest > max;
    if (!(scaleLowerHalf || scaleUpperHalf)) return;

    // otherwise we need to apply compression
    console.log(
      `Warning: velocity values [${lowest}, ${highest}] break the specified limits [${min}, ${max}] and will be compressed.`,
    );
    Msm.computePartwiseCompression(velocities, lowest, highest, min, max);
  }

  /**
   * This method computes a compression of an unlimited input domain to a limited output domain.
   * It uses a semicircle to define a projection into the interval [min, max].
   * @param x
   * @param min
   * @param max
   * @returns
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
   * export standard chroma features
   * Stub: Pitches export not yet ported.
   * @returns
   */
  exportChroma(): any {
    // TODO: Port Pitches, Key, FeatureVector classes
    console.error('Chroma/Pitches export is not yet implemented in the TypeScript port.');
    return null;
  }

  /**
   * export absolute pitches from the MSM score data
   * Stub: Pitches export not yet ported.
   * @returns
   */
  exportPitches(_key?: any): any {
    // TODO: Port Pitches, Key, FeatureVector classes
    console.error('Pitches export is not yet implemented in the TypeScript port.');
    return null;
  }

  /**
   * a helper method for parsing the milliseconds date of an element
   * @param e
   * @returns
   */
  private static readMillisecondsDateFromElement(e: Element): number {
    let dateAtt = Helper.getAttribute('milliseconds.date', e);
    if (dateAtt === null) {
      console.error(
        `Missing attribute "milliseconds.date" in element ${e.toXML()}. Using attribute "date" instead.`,
      );
      dateAtt = Helper.getAttribute('date', e);
    }
    return Math.round(parseFloat(dateAtt!.getValue())); // Math.round(double) returns number
  }

  /**
   * this method adds xml:ids to all note and rest elements, as far as they do not have an id
   * @returns the generated ids count
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
      Helper.addUUID(e.get(i) as unknown as Element); // add the xml:id attribute with a UUID

    console.log(' done');

    return e.size();
  }
}
