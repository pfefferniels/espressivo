import { Element, Attribute, Nodes, Elements, Document } from '../xml/XomTypes.js';
import { XmlBase } from '../xml/XmlBase.js';

/**
 * This class is a primitive for Msm and Mpm.
 * Port of meico.msm.AbstractMsm
 * @author Axel Berndt.
 *
 * The shared base of `Msm` and `Mpm` — the two XML formats that share the
 * `<header>`/`<dated>` part layout and the date-keyed map convention. It holds only what
 * both need: part construction, "find the entry at/before/after this date" lookups over a
 * map, and the empty-map cleanup. Everything format-specific lives in the subclasses.
 *
 * A "map" here always means an element whose children carry a `date` attribute and are
 * kept in ascending date order. The lookups below rely on that order and do not verify
 * it; nothing in this port sorts a map on read.
 */
export abstract class AbstractMsm extends XmlBase {
  /**
   * constructor
   *
   * Three overloads for three starting points, kept separate for the same reason as
   * `Msm`'s: they are distinct construction modes, not one optional parameter.
   */
  constructor();
  /**
   * constructor
   * @param document the data as XOM Document
   */
  constructor(document: Document);
  /**
   * constructor
   * @param xml xml code as UTF8 string
   */
  constructor(xml: string);
  constructor(arg?: Document | string) {
    if (arg === undefined) {
      super();
    } else if (arg instanceof Document) {
      super(arg);
    } else if (typeof arg === 'string') {
      super(arg, true);
    } else {
      super();
    }
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
  protected static makePartFromString(
    name: string,
    number: string,
    midiChannel: number,
    midiPort: number,
  ): Element {
    const part = new Element('part');
    part.addAttribute(new Attribute('name', name));
    part.addAttribute(new Attribute('number', number));
    part.addAttribute(new Attribute('midi.channel', String(midiChannel)));
    part.addAttribute(new Attribute('midi.port', String(midiPort)));

    part.appendChild(new Element('header'));
    part.appendChild(new Element('dated'));

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
  static makePart(name: string, number: number, midiChannel: number, midiPort: number): Element {
    return AbstractMsm.makePartFromString(name, String(number), midiChannel, midiPort);
  }

  /**
   * search the given map for the first element with local-name name at or after the given date
   * @param name an empty string means "any name" — the sentinel Java uses too
   * @param date
   * @param map
   * @returns the first matching element, or null if the map ends before `date`
   *
   * A forward linear scan that stops at the first hit, so under the ascending-date
   * convention it yields the *earliest* entry at or after `date`. Children with no `date`
   * attribute are skipped rather than treated as date 0.
   */
  static getElementAtAfterByName(name: string, date: number, map: Element): Element | null {
    let es: Elements;
    if (name.length === 0)
      // if no specific name given
      es = map.getChildElements(); // search all elements
    else
      // if specific name given
      es = map.getChildElements(name); // search only the elements with this name

    for (let i = 0; i < es.size(); ++i) {
      const e = es.get(i);
      if (e.getAttribute('date') !== null && parseFloat(e.getAttributeValue('date')!) >= date)
        return e;
    }
    return null;
  }

  /**
   * search the given map and find the first element at or after the given date
   * @param date
   * @param map
   * @returns
   */
  static getElementAtAfter(date: number, map: Element): Element | null {
    return AbstractMsm.getElementAtAfterByName('', date, map);
  }

  /**
   * search the given map and find the last element with the given local-name name before or at the given date
   * @param name an empty string means "any name"
   * @param date
   * @param map
   * @returns the last matching element, or null if the map starts after `date`
   *
   * The mirror image of {@link getElementAtAfterByName}: a backward scan stopping at the
   * first hit, so it yields the *latest* entry at or before `date` — the entry in force at
   * that moment. This is the "what is the current tempo / dynamics / key here" lookup.
   */
  static getElementBeforeAtByName(name: string, date: number, map: Element): Element | null {
    let es: Elements;
    if (name.length === 0)
      // if no specific name given
      es = map.getChildElements(); // search all elements
    else
      // if specific name given
      es = map.getChildElements(name); // search only the elements with this name

    for (let i = es.size() - 1; i >= 0; --i) {
      const e = es.get(i);
      if (e.getAttribute('date') !== null && parseFloat(e.getAttributeValue('date')!) <= date) {
        return e;
      }
    }
    return null;
  }

  /**
   * search the given map and find the last element before or at the given date
   * @param date
   * @param map
   * @returns
   */
  static getElementBeforeAt(date: number, map: Element): Element | null {
    return AbstractMsm.getElementBeforeAtByName('', date, map);
  }

  /**
   * this method removes all empty maps;
   * this is to make the data a bit smaller and less cluttered
   *
   * "Map" is matched as a **substring** of the local name, not as a suffix, so every
   * `…Map` element qualifies and so would anything else containing it. Only childless
   * ones are removed, and only in this one pass: a map left empty because its own child
   * map was just deleted is not revisited. The node list is a snapshot taken before the
   * first removal, which is what makes deleting during the walk safe.
   */
  deleteEmptyMaps(): void {
    if (this.isEmpty()) return;

    const maps: Nodes = this.getRootElement()!.query(
      "descendant::*[contains(local-name(), 'Map')]",
    ); // get all elements in the document that have a substring "Map" in their local-name
    for (let i = 0; i < maps.size(); ++i) {
      // go through all these elements
      const map = maps.get(i) as unknown as Element; // the map
      if (map.getChildCount() === 0)
        // if the map has no children, it is empty
        map.getParent()!.removeChild(map); // delete it
    }
  }
}
