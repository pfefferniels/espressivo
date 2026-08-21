import { Element, Attribute, Elements } from '../xml/XomTypes.js';
import { XmlBase } from '../xml/XmlBase.js';
import { descendantElements, requireParentElement } from '../xml/tree.js';

/**
 * The shared base of `Msm` and `Mpm` — the two XML formats with the `<header>`/`<dated>` part
 * layout and the date-keyed map convention. It holds part construction, the "find the entry
 * at/before/after this date" lookups, and the empty-map cleanup; everything format-specific
 * lives in the subclasses.
 *
 * A "map" here always means an element whose children carry a `date` attribute and are kept in
 * ascending date order. The lookups below rely on that order and do not verify it; nothing in
 * this port sorts a map on read.
 *
 * Port of meico.msm.AbstractMsm
 * @author Axel Berndt.
 */
export abstract class AbstractMsm extends XmlBase {
  /**
   * Build a raw `<part>` with its attributes and empty `<header>` and `<dated>` children. The
   * caller is responsible for putting it into a document; this does not.
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

  /** {@link makePartFromString} with a numeric part number. */
  static makePart(name: string, number: number, midiChannel: number, midiPort: number): Element {
    return AbstractMsm.makePartFromString(name, String(number), midiChannel, midiPort);
  }

  /**
   * A forward linear scan stopping at the first hit, so under the ascending-date convention it
   * yields the earliest entry at or after `date`. Children with no `date` attribute are skipped
   * rather than treated as date 0.
   *
   * @param name local name to match; an empty string means "any name" — the sentinel Java uses
   * @returns the first matching element, or null if the map ends before `date`
   */
  static getElementAtAfterByName(name: string, date: number, map: Element): Element | null {
    let es: Elements;
    if (name.length === 0) es = map.getChildElements();
    else es = map.getChildElements(name);

    for (const e of es) {
      const dateAttribute = e.getAttribute('date');
      if (dateAttribute !== null && parseFloat(dateAttribute.getValue()) >= date) return e;
    }
    return null;
  }

  /**
   * {@link getElementAtAfterByName} over entries of any name.
   */
  static getElementAtAfter(date: number, map: Element): Element | null {
    return AbstractMsm.getElementAtAfterByName('', date, map);
  }

  /**
   * The mirror image of {@link getElementAtAfterByName}: a backward scan stopping at the first
   * hit, so it yields the latest entry at or before `date` — the entry in force at that moment.
   * This is the "what is the current tempo / dynamics / key here" lookup.
   *
   * Indexed rather than iterated because {@link Elements} has no backwards iterator, and
   * `toArray().reverse()` would allocate twice on a lookup the expressive export runs once per
   * note per map.
   *
   * @param name local name to match; an empty string means "any name"
   * @returns the last matching element, or null if the map starts after `date`
   */
  static getElementBeforeAtByName(name: string, date: number, map: Element): Element | null {
    let es: Elements;
    if (name.length === 0) es = map.getChildElements();
    else es = map.getChildElements(name);

    for (let i = es.size() - 1; i >= 0; --i) {
      const e = es.get(i);
      const dateAttribute = e.getAttribute('date');
      if (dateAttribute !== null && parseFloat(dateAttribute.getValue()) <= date) {
        return e;
      }
    }
    return null;
  }

  /**
   * {@link getElementBeforeAtByName} over entries of any name.
   */
  static getElementBeforeAt(date: number, map: Element): Element | null {
    return AbstractMsm.getElementBeforeAtByName('', date, map);
  }

  /**
   * Remove every empty map, to keep the data smaller and less cluttered.
   *
   * "Map" is matched as a substring of the local name, not as a suffix, so every `…Map` element
   * qualifies and so would anything else containing it. Only childless ones are removed, and
   * only in this one pass: a map left empty because its own child map was just deleted is not
   * revisited. The node list is a snapshot taken before the first removal, which is what makes
   * deleting during the walk safe.
   */
  deleteEmptyMaps(): void {
    const root = this.getRootElement();
    if (root === null) return;

    const maps = descendantElements(root, (element) => element.getLocalName().includes('Map'));
    for (const map of maps) {
      // strict descendants of `root`, so each has a parent
      if (map.getChildCount() === 0) requireParentElement(map).removeChild(map);
    }
  }
}
