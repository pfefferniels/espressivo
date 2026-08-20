import { Element, Attribute, Elements, Document } from '../xml/XomTypes.js';
import { XmlBase } from '../xml/XmlBase.js';
import { descendantElements, requireParentElement } from '../xml/tree.js';

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
   * Nothing, an already-parsed {@link Document}, or XML source text.
   *
   * This used to be three overloads, on the argument that "they are distinct construction
   * modes, not one optional parameter". The three signatures had the same arity and the
   * same single parameter, so the only thing they said that `Document | string | undefined`
   * does not is that the modes are named — and they were not named, they were numbered by
   * position. What the union loses is nothing; what the overload set cost is a `typeof`
   * dispatch in the body whose arms the compiler could not tie back to the signatures.
   * `XmlBase` had already collapsed the same pair for the same reason (T17), keeping its
   * string form apart only because a *second* argument distinguishes it. There is no second
   * argument here.
   *
   * Named factories (`fromXml`, `fromDocument`, `empty`) would say more still, but the
   * constructor has 36 call sites, 32 of them in test files outside this charter's scope,
   * so that is a change to schedule rather than to smuggle in.
   *
   * @param source the data as a XOM {@link Document}, or xml code as a UTF8 string, or
   *   nothing for an empty instance
   */
  constructor(source?: Document | string) {
    if (source === undefined) {
      super();
    } else if (source instanceof Document) {
      super(source);
    } else {
      super(source, true);
    }
  }

  /*
   * `requireRootElement` was declared here and is now inherited from {@link XmlBase},
   * verbatim — docstring, message and all. `XmlBase` grew it for its own three tree-wide
   * operations, which had the same three `getRootElement()!` assertions this was written to
   * remove, and a third copy existed in `Mei`. Nothing below changes: the inherited method
   * is the same method.
   */

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

    for (const e of es) {
      // One read, tested and then used, where this was two reads with the second asserted
      // against the first. Same comparison: an entry with no `date` is skipped rather than
      // being read as `parseFloat(null)`'s NaN, which fails every comparison anyway.
      const dateAttribute = e.getAttribute('date');
      if (dateAttribute !== null && parseFloat(dateAttribute.getValue()) >= date) return e;
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
   *
   * Its sibling above walks with `for..of` now that {@link Elements} is iterable; this one
   * keeps the index, because there is no backwards iterator and the only way to get one is
   * `toArray().reverse()` — two array allocations on a lookup the expressive export runs
   * once per note per map. The index is the cheaper honesty here, and it is bounded by
   * `es.size()`, so `get` never reads past the end.
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
      const dateAttribute = e.getAttribute('date');
      if (dateAttribute !== null && parseFloat(dateAttribute.getValue()) <= date) {
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
    // `getRootElement() === null` is exactly `isEmpty()` — a parsed Document always has a
    // root — so this is the same early return, taken on the value the loop needs rather
    // than on a flag the compiler cannot connect to it.
    const root = this.getRootElement();
    if (root === null) return;

    const maps = descendantElements(root, (element) => element.getLocalName().includes('Map')); // get all elements in the document that have a substring "Map" in their local-name
    for (const map of maps) {
      // go through all these elements
      if (map.getChildCount() === 0)
        // if the map has no children, it is empty
        // `descendantElements` returns strict descendants of `root`, so each of them has a
        // parent; `requireParentElement` is that fact checked rather than asserted.
        requireParentElement(map).removeChild(map); // delete it
    }
  }
}
