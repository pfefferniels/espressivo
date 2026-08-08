import { Element, Attribute, Nodes, Elements, Document } from '../xml/XomTypes.js';
import { XmlBase } from '../xml/XmlBase.js';

/**
 * This class is a primitive for Msm and Mpm.
 * Port of meico.msm.AbstractMsm
 * @author Axel Berndt.
 */
export abstract class AbstractMsm extends XmlBase {
  /**
   * constructor
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
   * @param name
   * @param date
   * @param map
   * @returns
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
   * @param name
   * @param date
   * @param map
   * @returns
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
