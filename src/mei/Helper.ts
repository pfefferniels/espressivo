import { Attribute, Document, Element } from '../xml/XomTypes.js';
import { v4 as uuidv4 } from 'uuid';

/**
 * The MEI conversion toolbox: everything {@link Mei} and {@link Mei2MsmMpmConverter} need
 * that is not conversion logic itself.
 *
 * Java's `Helper` is two things at once — a bag of static utilities *and* an instantiable
 * carrier for the converter's per-run state. This port kept only the first half; the
 * mutable state lives on {@link Mei2MsmMpmConverter} as fields. What remains is grouped by
 * the `// ---- … ----` banners below:
 *
 * - **child/sibling/parent navigation** (`getFirstChildElement`, `getAllChildElements`,
 *   `getNextSiblingElement`, `getClosest`, …) — namespace-agnostic replacements for the
 *   XOM methods, which the original author found unreliable in the face of MEI's
 *   inconsistent namespace usage. Everything here matches on `localName` and ignores the
 *   namespace, which is the single most load-bearing property of this file;
 * - **map insertion** ({@link Helper.addToMap}) — the one place that knows MSM maps are
 *   sorted by `date`;
 * - **unit conversions** — MEI's `dur`/`accid`/`pname` vocabularies to the numbers MSM and
 *   MIDI use. Pure lookup tables; the values are part of the pipeline's arithmetic and are
 *   frozen;
 * - **id handling** ({@link Helper.addUUID}, {@link Helper.copyId}) — see the warning on
 *   `addUUID` about generation order;
 * - **environment stubs** — schema validation, XSLT and file writing have no counterpart
 *   in the target environment and warn instead of working.
 *
 * It is a class with only static members purely because Java's was; plain module functions
 * are the idiomatic form and the reason the `no-extraneous-class` lint entry is still open.
 * That conversion touches roughly 300 call sites across `mei/`, so it is T14's, not a
 * local idiom.
 *
 * Port of `meico.mei.Helper`.
 * @author Axel Berndt
 */
export class Helper {
  // ---- Schema Validation (stubs) ----

  /**
   * This method validates a file against a schema. If the validation fails it throws an exception.
   * STUB: Schema validation is not available in the browser environment.
   * @param file path to the file
   * @param schema URL of the schema
   */
  static validateAgainstSchema(file: string, schema: string): void {
    console.warn(
      'validateAgainstSchema: Schema validation is not available in the browser/Node.js environment. Skipping validation.',
    );
  }

  /**
   * This method validates an xml string against a schema. If the validation fails it throws an exception.
   * STUB: Schema validation is not available in the browser environment.
   * @param xml the xml string
   * @param schema URL of the schema
   */
  static validateAgainstSchemaString(xml: string, schema: string): void {
    console.warn(
      'validateAgainstSchema: Schema validation is not available in the browser/Node.js environment. Skipping validation.',
    );
  }

  // ---- Child Element Access ----

  /*
   * A note on the overload sets in this section, which read oddly: Java has
   * `getFirstChildElement(Element)` and `getFirstChildElement(String, Element)`, and the
   * port added `(Element, String)` on top. TypeScript dispatches them at runtime by
   * inspecting `typeof arg1`, which is why the implementation signature is widened to
   * `Element | string | null`. The `unified-signatures` lint entries this produces are
   * knowingly left standing — collapsing name-first and name-last into one signature is an
   * API change and belongs to T16.
   */

  /**
   * Get the first child element of an xml element (no name filter).
   * @param ofThis
   * @return the first child element or null
   */
  static getFirstChildElement(ofThis: Element): Element | null;
  /**
   * XOM's method getFirstChild(String) sometimes doesn't seem to work even though an XPath query finds something.
   * For these situations this method can be used as workaround.
   * @param ofThis
   * @param localname
   * @return the first child element with the given localname or null
   */
  static getFirstChildElement(ofThis: Element, localname: string): Element | null;
  /**
   * this function became necessary because the XOM methods sometimes do not seem to work for whatever reason
   * @param name
   * @param ofThis
   * @return the first child element with the given name or null
   */
  static getFirstChildElement(name: string, ofThis: Element): Element | null;
  /**
   * Note that the two named forms do not share an implementation: `(name, ofThis)` walks
   * `getChildElements()` directly, while `(ofThis, localname)` goes through an XPath
   * query — which in this port means serialising the subtree and re-parsing it (see
   * {@link Element.query}). They agree on the result but not on the cost, and the query
   * form additionally returns null for an empty `localname` where the walking form would
   * search for a child literally named `''`.
   */
  static getFirstChildElement(
    arg1: Element | string | null,
    arg2?: Element | string | null,
  ): Element | null {
    // Determine which overload was called
    if (arg1 === null || arg1 === undefined) return null;

    if (typeof arg1 === 'string') {
      // getFirstChildElement(name: string, ofThis: Element)
      const name = arg1;
      const ofThis = arg2 as Element | null;
      if (ofThis == null) return null;

      const children = ofThis.getChildElements();
      for (let i = 0; i < children.size(); ++i) {
        if (children.get(i).getLocalName() === name) {
          return children.get(i);
        }
      }
      return null;
    } else {
      // arg1 is Element
      const ofThis = arg1 as Element;
      if (arg2 === undefined || arg2 === null) {
        // getFirstChildElement(ofThis: Element) - no name filter
        const es = ofThis.getChildElements();
        if (es.size() === 0) return null;
        return es.get(0);
      } else {
        // getFirstChildElement(ofThis: Element, localname: string)
        const localname = arg2 as string;
        if (localname === '') return null;
        const e = ofThis.query(`child::*[local-name()='${localname}']`);
        if (e.size() === 0) return null;
        return e.get(0) as Element;
      }
    }
  }

  /**
   * this method is an alternative to XOM's getChildElements(String name) which sometimes doesn't seem to work
   * @param name
   * @param ofThis
   * @return a list of child elements with the given name, or all children if name is omitted
   */
  static getAllChildElements(name: string, ofThis: Element): Element[] | null;
  /**
   * this method is an alternative to XOM's getChildElements() which sometimes doesn't seem to work
   * @param ofThis
   * @return all child elements
   */
  static getAllChildElements(ofThis: Element): Element[] | null;
  static getAllChildElements(
    arg1: string | Element | null,
    arg2?: Element | null,
  ): Element[] | null {
    if (arg1 === null || arg1 === undefined) return null;

    if (typeof arg1 === 'string') {
      // getAllChildElements(name: string, ofThis: Element)
      const name = arg1;
      const ofThis = arg2 as Element | null;
      if (ofThis == null || name === '') return null;
      const e = ofThis.query(`child::*[local-name()='${name}']`);
      const es: Element[] = [];
      for (let i = 0; i < e.size(); ++i) {
        es.push(e.get(i) as Element);
      }
      return es;
    } else {
      // getAllChildElements(ofThis: Element)
      const ofThis = arg1 as Element;
      const e = ofThis.query('child::*');
      const es: Element[] = [];
      for (let i = 0; i < e.size(); ++i) {
        es.push(e.get(i) as Element);
      }
      return es;
    }
  }

  /**
   * Create a flat list of all descendants of a certain name (beginning with ofThis)
   * @param name
   * @param ofThis
   * @return
   */
  /**
   * Pre-order: an element is pushed before its own descendants are searched, so the result
   * reads in document order. Note the two different empty results — null when there is
   * nothing to search (`ofThis` null or `name` empty), an empty array when the search ran
   * and found nothing. Callers in the converter rely on the second and null-check anyway.
   */
  static getAllDescendantsByName(name: string, ofThis: Element | null): Element[] | null {
    if (ofThis == null || name === '') return null;
    const children: Element[] = [];
    const allChildren = Helper.getAllChildElements(ofThis);
    if (allChildren == null) return children;
    for (const ch of allChildren) {
      if (ch.getLocalName() === name) {
        children.push(ch);
      }
      const descendants = Helper.getAllDescendantsByName(name, ch);
      if (descendants != null) {
        children.push(...descendants);
      }
    }
    return children;
  }

  /**
   * Create a flat list of all descendants with a certain attribute (beginning with ofThis)
   * @param attrName
   * @param ofThis
   * @return
   */
  static getAllDescendantsWithAttribute(
    attrName: string,
    ofThis: Element | null,
  ): Element[] | null {
    if (ofThis == null || attrName === '') return null;
    const children: Element[] = [];
    const allChildren = Helper.getAllChildElements(ofThis);
    if (allChildren == null) return children;
    for (const ch of allChildren) {
      if (ch.getAttribute(attrName) != null) {
        children.push(ch);
      }
      const descendants = Helper.getAllDescendantsWithAttribute(attrName, ch);
      if (descendants != null) {
        children.push(...descendants);
      }
    }
    return children;
  }

  // ---- Sibling Element Access ----

  /**
   * get the next sibling element of ofThis irrespective of its name
   * @param ofThis
   * @return
   */
  static getNextSiblingElement(ofThis: Element): Element | null;
  /**
   * get the next sibling element of ofThis with the given name
   * @param name
   * @param ofThis
   * @return
   */
  static getNextSiblingElement(name: string, ofThis: Element): Element | null;
  /**
   * The named form walks the siblings **backwards** and remembers the most recent match in
   * `candidate`; when the walk reaches `ofThis`, `candidate` is by construction the
   * *nearest following* sibling with that name. Reaching the start of the list without
   * having passed `ofThis` means `ofThis` is not a child of its own parent's element list
   * — which happens for text-node-adjacent cases — and yields null.
   *
   * The unnamed form is a plain index step and therefore returns null when the immediate
   * next node is a text node, rather than skipping over it. The two forms are thus not
   * "the same thing with a filter": only the named one skips non-elements.
   */
  static getNextSiblingElement(
    arg1: Element | string | null,
    arg2?: Element | null,
  ): Element | null {
    if (arg1 == null) return null;

    if (typeof arg1 === 'string') {
      // getNextSiblingElement(name: string, ofThis: Element)
      const name = arg1;
      const ofThis = arg2 as Element | null;
      if (ofThis == null) return null;

      const parent = ofThis.getParent();
      if (parent == null) return null;

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
      // getNextSiblingElement(ofThis: Element)
      const ofThis = arg1 as Element;
      const parent = ofThis.getParent();
      if (parent == null) return null;

      const index = parent.indexOf(ofThis);
      if (index >= parent.getChildCount() - 1) return null;

      const nextChild = parent.getChild(index + 1);
      if (nextChild instanceof Element) {
        return nextChild;
      }
      return null;
    }
  }

  /**
   * get the previous sibling element of ofThis irrespective of its name
   * @param ofThis
   * @return
   */
  static getPreviousSiblingElement(ofThis: Element): Element | null;
  /**
   * get the previous sibling element of ofThis with a specific name
   * @param name
   * @param ofThis
   * @return
   */
  static getPreviousSiblingElement(name: string, ofThis: Element): Element | null;
  /** the mirror image of {@link Helper.getNextSiblingElement}: forward walk, last match wins */
  static getPreviousSiblingElement(
    arg1: Element | string | null,
    arg2?: Element | null,
  ): Element | null {
    if (arg1 == null) return null;

    if (typeof arg1 === 'string') {
      // getPreviousSiblingElement(name: string, ofThis: Element)
      const name = arg1;
      const ofThis = arg2 as Element | null;
      if (ofThis == null) return null;

      const parent = ofThis.getParent();
      if (parent == null) return null;

      const es = parent.getChildElements();
      let candidate: Element | null = null;

      for (let i = 0; i < es.size(); ++i) {
        if (ofThis === es.get(i)) {
          return candidate;
        }
        if (es.get(i).getLocalName() === name) {
          candidate = es.get(i);
        }
      }

      return null;
    } else {
      // getPreviousSiblingElement(ofThis: Element)
      const ofThis = arg1 as Element;
      const parent = ofThis.getParent();
      if (parent == null) return null;

      const index = parent.indexOf(ofThis);
      if (index === 0) return null;

      const prevChild = parent.getChild(index - 1);
      if (prevChild instanceof Element) {
        return prevChild;
      }
      return null;
    }
  }

  /**
   * Get all previous element Siblings up to ofThis parent of a specific name.
   * List is in order of distance to ofThis.
   * @param name
   * @param ofThis
   * @return
   */
  static getAllPreviousSiblingElements(name: string, ofThis: Element): Element[] {
    let sibling = Helper.getPreviousSiblingElement(name, ofThis);
    const siblings: Element[] = [];
    while (sibling != null) {
      siblings.push(sibling);
      sibling = Helper.getPreviousSiblingElement(name, sibling);
    }
    return siblings;
  }

  // ---- Map Operations ----

  /**
   * this method adds element addThis to a timely sequenced list, the map, and ensures the timely order of the elements in the map;
   * therefore, addThis must contain the attribute "date"; if not, addThis is appended at the end
   *
   * This is the invariant every MSM map depends on: children are in non-decreasing `date`
   * order. Three properties of the insertion are load-bearing and must not be "tidied":
   *
   * - the scan runs **backwards** from the end and stops at the first element whose `date`
   *   is `<=` the new one, inserting *after* it. Together those make the insertion stable
   *   — a new element lands behind everything already at the same date, so elements added
   *   at one date keep the order the converter emitted them in, which is what makes the
   *   serialized MSM byte-comparable against the Java reference;
   * - the search uses `descendant::*[attribute::date]` — *descendants*, not children — but
   *   the insertion index comes from `map.indexOf(...)`, which only knows direct children.
   *   For a map whose entries have dated grandchildren, the two disagree and `indexOf`
   *   returns -1, making the insert position 0. No MSM map produced by this converter
   *   nests dated elements, so the case does not arise; Java has the identical shape;
   * - dates are compared as `parseFloat`ed doubles, matching Java's `Double.parseDouble`.
   *
   * @param addThis an xml element (should have an attribute date)
   * @param map a timely sequenced list of elements with attribute date
   * @return the index of the element in the map or -1 if insertion failed
   */
  static addToMap(addThis: Element | null, map: Element | null): number {
    if (map == null || addThis == null)
      // no map or no element to insert
      return -1; // no insertion

    if (addThis.getAttribute('date') == null) {
      // no attribute date
      map.appendChild(addThis); // simply append addThis to the end of the map
      return map.getChildCount() - 1; // and return the index
    }

    const es = map.query('descendant::*[attribute::date]'); // get all elements in the map that have an attribute date
    if (es.size() === 0) {
      // if there are no elements in the map with a date attribute
      map.appendChild(addThis); // simply append addThis to the end of the map
      return map.getChildCount() - 1; // and return the index
    }

    const date = parseFloat(addThis.getAttributeValue('date')!); // get the date of addThis
    for (let i = es.size() - 1; i >= 0; --i) {
      // go through the elements
      if (parseFloat((es.get(i) as Element).getAttributeValue('date')!) <= date) {
        // if the element directly before date is found
        let index = map.indexOf(es.get(i)); // get the index of the element just found
        map.insertChild(addThis, ++index); // insert addThis right after the element
        return index; // return the index
      }
    }

    // if all elements in the map had a date later than addThis's date
    map.insertChild(addThis, 0); // insert addThis at the front of the map (as first child)
    return 0; // return the index
  }

  // ---- String / Number Utilities ----

  /**
   * this method parses an input string, extracts all integer substrings and returns them as a list of integers
   * @param string
   * @return
   */
  static extractAllIntegersFromString(input: string): number[] {
    const str = input.replace(/ bis /g, ' -').replace(/ to /g, ' -');
    const p = /-?\d+/g;
    const results: number[] = [];
    let m: RegExpExecArray | null;
    while ((m = p.exec(str)) !== null) {
      results.push(parseInt(m[0], 10));
    }
    return results;
  }

  // ---- Element Cloning ----

  /**
   * create a flat copy of element e including its attributes but not its child elements
   *
   * Deep-copy-then-strip, because {@link Element} exposes no attribute-by-index accessor
   * to rebuild one attribute at a time the way Java does. The observable difference is
   * namespaces: Java reconstructs each attribute as `new Attribute(localName, value)` and
   * so **drops** its namespace, whereas copying preserves it. Only visible on an element
   * carrying a namespaced attribute other than the element's own; nothing the converter
   * clones does. (The same divergence and the same reasoning appear at `Msm.cloneElement`,
   * documented there under T9.)
   *
   * @param e
   * @return
   */
  static cloneElement(e: Element | null): Element | null {
    if (e == null) return null;

    const copy = e.copy();
    copy.removeChildren();
    return copy;
  }

  // ---- Attribute Access ----

  /**
   * returns the attribute with the specified name contained in ofThis, or null if that attribute does not exist, namespace is ignored
   *
   * Three lookups in a fixed order: no namespace, the element's own namespace, then the
   * XML namespace. The last is what makes `getAttribute('id', e)` find `xml:id`, which is
   * how nearly every id read in this port is spelled — MEI puts ids in the XML namespace,
   * but plenty of encodings (and the elements this converter builds itself) use a bare
   * `id`. The order matters: an element carrying both gets the unnamespaced one.
   *
   * @param name
   * @param ofThis
   * @return
   */
  static getAttribute(name: string, ofThis: Element | null): Attribute | null {
    if (ofThis == null) return null;

    let a = ofThis.getAttribute(name);
    if (a != null) return a;

    a = ofThis.getAttribute(name, ofThis.getNamespaceURI());
    if (a != null) return a;

    a = ofThis.getAttribute(name, 'http://www.w3.org/XML/1998/namespace');
    if (a != null) return a;

    return null;
  }

  /**
   * returns the value of attribute name in Element ofThis as String, or empty string if attribute does not exist, namespace is ignored
   * @param name
   * @param ofThis
   * @return
   */
  static getAttributeValue(name: string, ofThis: Element | null): string {
    const a = Helper.getAttribute(name, ofThis);
    if (a == null) return '';
    return a.getValue();
  }

  // ---- UUID / ID Operations ----

  /**
   * Add a UUID-based xml:id to the specified element.
   * Caution: If the element has already an xml:id, it will be overwritten!
   *
   * **Order-sensitive.** The `meico_<uuid>` ids this mints end up in the MSM and MPM
   * output, where the equivalence tests canonicalise them by first occurrence. Anything
   * that changes *how many* of these are drawn, or *in what order*, changes the
   * canonicalised output even though every individual id is random. So: do not reorder,
   * hoist, memoise or short-circuit calls to this along the conversion path.
   *
   * @param toThis
   * @return the generated uuid string
   */
  static addUUID(toThis: Element): string {
    const uuid = `meico_${uuidv4()}`; // generate new id
    const a = new Attribute('xml:id', 'http://www.w3.org/XML/1998/namespace', uuid); // create an attribute with xml namespace
    toThis.addAttribute(a); // add attribute to the element
    return uuid;
  }

  /**
   * copies the id attribute ofThis into toThis
   * @param ofThis
   * @param toThis
   * @return the newly created attribute
   */
  static copyId(ofThis: Element, toThis: Element): Attribute | null {
    return Helper.copyIdNs(ofThis, toThis);
  }

  /**
   * copies the id attribute from ofThis (if present) into toThis, without namespace binding
   * @param ofThis
   * @param toThis
   * @return the newly created attribute
   */
  static copyIdNoNs(ofThis: Element, toThis: Element): Attribute | null {
    const id = Helper.getAttribute('id', ofThis);
    if (id != null) {
      const newId = new Attribute('id', id.getValue());
      toThis.addAttribute(newId);
      return newId;
    }
    return null;
  }

  /**
   * copies the id attribute from ofThis (if present) into toThis, retaining its namespace
   * @param ofThis
   * @param toThis
   * @return the newly created attribute
   */
  private static copyIdNs(ofThis: Element, toThis: Element): Attribute | null {
    const id = Helper.getAttribute('id', ofThis);
    if (id != null) {
      const newId = id.copy();
      toThis.addAttribute(newId);
      return newId;
    }
    return null;
  }

  // ---- Parent / Ancestor Access ----

  /**
   * returns the parent element of ofThis as element or null
   * @param ofThis
   * @return
   */
  static getParentElement(ofThis: Element): Element | null {
    const parent = ofThis.getParent();
    if (parent != null && parent instanceof Element) {
      return parent;
    }
    return null;
  }

  /**
   * Returns the closest element of a certain name along the parent tree.
   * ofThis is not checked for name, since it cannot be a predecessor of itself.
   * @param name
   * @param ofThis
   * @return
   */
  static getClosest(name: string, ofThis: Element): Element | null {
    let parent = Helper.getParentElement(ofThis);
    while (parent != null) {
      if (parent.getLocalName() === name) return parent;
      parent = Helper.getParentElement(parent);
    }
    return null;
  }

  /**
   * Returns the closest element that contains a certain attribute name along the parent tree.
   * ofThis is not checked for the attribute, since it cannot be a predecessor of itself.
   * @param attrName
   * @param ofThis
   * @return
   */
  static getClosestByAttr(attrName: string, ofThis: Element): Element | null {
    let parent = Helper.getParentElement(ofThis);
    while (parent != null) {
      const attr = Helper.getAttributeValue(attrName, parent);
      if (attr != null && attr !== '') return parent;
      parent = Helper.getParentElement(parent);
    }
    return null;
  }

  // ---- MPM Note ID Update ----

  /**
   * When articulationMaps are expanded via GenericMap.applySequencingMap() the noteid attribute is not updated.
   * Therefor, we get a Map from Msm.resolveRepetitions() and apply it to the already expanded articulationMap via this method.
   * `noteIdMappings` is a *chain*, not a lookup table: it maps each note id to the id its
   * next copy received, so following it repeatedly walks copy 1, copy 2, and so on. That
   * is why this iterates the map's elements from index 1 and steps `current` once per
   * element — the first occurrence keeps the original id, and the n-th gets the id found
   * after n-1 steps along the chain. Only the keys are iterated here; the values are
   * reached through those steps.
   *
   * @param map a GenericMap-like object that has a getXml() method returning an Element
   * @param noteIdMappings note id → id of the next copy of that note
   */
  static updateMpmNoteidsAfterResolvingRepetitions(
    map: { getXml(): Element },
    noteIdMappings: Map<string, string>,
  ): void {
    for (const key of noteIdMappings.keys()) {
      // for all mappings
      const ns = map.getXml().query(`descendant::*[attribute::noteid = '#${key}']`); // get all elements with the noteid attribute and the specific value
      if (ns.size() < 2)
        // if there is none or only one
        continue; // no need to change that value, the first one keeps the original

      let current: string | undefined = key; // this string will be set to the subsequent values
      for (let i = 1; i < ns.size(); ++i) {
        // iterate through the elements starting with the second
        current = noteIdMappings.get(current!); // get the next value
        const a = Helper.getAttribute('noteid', ns.get(i) as Element); // get the attribute
        if (a != null && current != null) {
          a.setValue(`#${current}`); // set the attribute value
        }
      }
    }
  }

  // ---- Duration Conversion ----

  /*
   * The conversion tables below are pipeline arithmetic, not style. Every literal in this
   * section feeds tick computations whose results are byte-compared against the Java
   * reference, so the values, the case labels and the fall-through defaults are frozen.
   */

  /**
   * convert the duration string into decimal (e.g., 4 -> 1/4) and returns the result
   *
   * The unit is the whole note: `1` → 1.0, `4` → 0.25, down to `2048`. The three mensural
   * names sit above the whole note (`breve` 2, `long` 4, `maxima` 8). An unrecognised
   * string — including `'0'`, which MEI allows for a breve — returns **0.0**, and callers
   * that divide by the result get infinity rather than an error. Java behaves identically.
   *
   * @param durString
   * @return
   */
  static duration2decimal(durString: string): number {
    switch (durString) {
      case 'maxima':
        return 8.0;
      case 'long':
        return 4.0;
      case 'breve':
        return 2.0;
      case '1':
        return 1.0;
      case '2':
        return 0.5;
      case '4':
        return 0.25;
      case '8':
        return 0.125;
      case '16':
        return 0.0625;
      case '32':
        return 0.03125;
      case '64':
        return 0.015625;
      case '128':
        return 0.0078125;
      case '256':
        return 0.00390625;
      case '512':
        return 0.001953125;
      case '1024':
        return 0.0009765625;
      case '2048':
        return 0.00048828125;
    }
    return 0.0;
  }

  /**
   * convert a duration string to a word representation
   * @param durString
   * @return
   */
  static duration2word(durString: string): string {
    switch (durString) {
      case 'maxima':
      case 'long':
      case 'breve':
        return durString;
      case '1':
        return 'whole';
      case '2':
        return 'half';
      case '4':
        return 'quarter';
      case '8':
        return 'eighth';
      case '16':
        return `${durString}th`;
      case '32':
        return `${durString}nd`;
      case '64':
      case '128':
      case '256':
        return `${durString}th`;
      case '512':
        return `${durString}nd`;
      case '1024':
      case '2048':
        return `${durString}th`;
    }
    return durString;
  }

  /**
   * convert a duration specified in pulses (based on ppq) to decimal format
   * @param pulses
   * @param ppq
   * @return
   */
  static pulseDuration2decimal(pulses: number, ppq: number): number {
    return pulses / (ppq * 4.0);
  }

  /**
   * generate an HTML Unicode string with the note/rest value and dots according to the specified duration
   * @param duration
   * @param isRest
   * @return
   */
  static decimalDuration2HtmlUnicode(duration: number, isRest: boolean): string {
    if (duration < 0.0078125) return isRest ? 'rest' : 'note';
    if (duration < 0.015625)
      return (
        (isRest ? '&#119106;' : '&#119140;') +
        Helper.durationRemainder2UnicodeDots(0.0078125, duration - 0.0078125)
      );
    if (duration < 0.03125)
      return (
        (isRest ? '&#119105;' : '&#119139;') +
        Helper.durationRemainder2UnicodeDots(0.015625, duration - 0.015625)
      );
    if (duration < 0.0625)
      return (
        (isRest ? '&#119104;' : '&#119138;') +
        Helper.durationRemainder2UnicodeDots(0.03125, duration - 0.03125)
      );
    if (duration < 0.125)
      return (
        (isRest ? '&#119103;' : '&#119137;') +
        Helper.durationRemainder2UnicodeDots(0.0625, duration - 0.0625)
      );
    if (duration < 0.25)
      return (
        (isRest ? '&#119102;' : '&#119136;') +
        Helper.durationRemainder2UnicodeDots(0.125, duration - 0.125)
      );
    if (duration < 0.5)
      return (
        (isRest ? '&#119101;' : '&#119135;') +
        Helper.durationRemainder2UnicodeDots(0.25, duration - 0.25)
      );
    if (duration < 1.0)
      return (
        (isRest ? '&#119100;' : '&#119134;') +
        Helper.durationRemainder2UnicodeDots(0.5, duration - 0.5)
      );
    if (duration < 2.0)
      return (
        (isRest ? '&#119099;' : '&#119133;') +
        Helper.durationRemainder2UnicodeDots(1.0, duration - 1.0)
      );
    if (duration < 4.0)
      return (
        (isRest ? '2 &#119098;' : '&#119132;') +
        Helper.durationRemainder2UnicodeDots(2.0, duration - 2.0)
      );
    if (duration < 8.0)
      return (
        (isRest ? '4 &#119098;' : '&#119223;') +
        Helper.durationRemainder2UnicodeDots(4.0, duration - 4.0)
      );
    if (duration === 8.0) return isRest ? '8 &#119098;' : '&#119222;';
    else return isRest ? 'rest' : 'note';
  }

  /**
   * This is a helper method for decimalDuration2HtmlUnicode().
   * From a decimal duration value, take the undotted note value and the remainder. This method computes the number of dots.
   * @param undottedNoteValue
   * @param remainder
   * @return
   */
  private static durationRemainder2UnicodeDots(
    undottedNoteValue: number,
    remainder: number,
  ): string {
    let dots = '';
    let v = undottedNoteValue / 2.0;
    for (let r = remainder; r >= v && r >= 0.0078125; v /= 2.0) {
      dots = `${dots}.`;
      r -= v;
    }
    return dots;
  }

  // ---- Accidental Conversion ----

  /**
   * compute the decimal value of the accidental (1 = 1 semitone)
   *
   * Covers MEI's quarter-tone vocabulary as well, which is why the return type is
   * fractional: `su`/`3qs` are +1.5, `sd`/`1qs` +0.5, and so on. Anything unrecognised —
   * including `n` (natural), which is listed explicitly and deliberately falls through —
   * yields 0. Note that {@link Helper.accidDecimal2String} is not a strict inverse: it
   * maps 2 back to `ss` and 3 to `xs`, so `x`, `ts` and the `n`-prefixed spellings do not
   * survive a round trip.
   *
   * @param accid the string to be converted
   * @return the decimal value of the accidental
   */
  static accidString2decimal(accid: string): number {
    let accidentals = 0.0;
    switch (accid) {
      case 's':
        accidentals = 1;
        break;
      case 'f':
        accidentals = -1;
        break;
      case 'ss':
        accidentals = 2;
        break;
      case 'x':
        accidentals = 2;
        break;
      case 'ff':
        accidentals = -2;
        break;
      case 'xs':
        accidentals = 3;
        break;
      case 'ts':
        accidentals = 3;
        break;
      case 'tf':
        accidentals = -3;
        break;
      case 'n':
        break;
      case 'nf':
        accidentals = -1;
        break;
      case 'ns':
        accidentals = 1;
        break;
      case 'su':
        accidentals = 1.5;
        break;
      case 'sd':
        accidentals = 0.5;
        break;
      case 'fu':
        accidentals = -0.5;
        break;
      case 'fd':
        accidentals = -1.5;
        break;
      case 'nu':
        accidentals = 0.5;
        break;
      case 'nd':
        accidentals = -0.5;
        break;
      case '1qf':
        accidentals = -0.5;
        break;
      case '3qf':
        accidentals = -1.5;
        break;
      case '1qs':
        accidentals = 0.5;
        break;
      case '3qs':
        accidentals = 1.5;
        break;
    }
    return accidentals;
  }

  /**
   * Compute the string value of a Decimal (given as String or number).
   * Will take the most simple accidental sign (avoids combinations with neutral signs).
   *
   * Both spellings of every value are listed (`'1'` and `'1.0'`) because the input reaches
   * this either from a JavaScript number's `toString` (`1`) or straight out of an MSM
   * attribute written by Java (`1.0`). A value that matches neither is **returned
   * unchanged** rather than rejected, so this can hand back arbitrary strings.
   *
   * @param accidObject
   * @return
   */
  static accidDecimal2String(accidObject: string | number | null): string | null {
    let accid = '';
    if (typeof accidObject === 'string') {
      accid = accidObject;
    } else if (typeof accidObject === 'number') {
      accid = accidObject.toString();
    } else {
      return null;
    }

    switch (accid) {
      case '1':
      case '1.0':
        accid = 's';
        break;
      case '-1':
      case '-1.0':
        accid = 'f';
        break;
      case '2':
      case '2.0':
        accid = 'ss';
        break;
      case '-2':
      case '-2.0':
        accid = 'ff';
        break;
      case '3':
      case '3.0':
        accid = 'xs';
        break;
      case '-3':
      case '-3.0':
        accid = 'tf';
        break;
      case '0':
      case '0.0':
        accid = 'n';
        break;
      case '-0.5':
        accid = '1qf';
        break;
      case '-1.5':
        accid = '3qf';
        break;
      case '0.5':
        accid = '1qs';
        break;
      case '1.5':
        accid = '3qs';
        break;
    }

    return accid;
  }

  /**
   * convert an accidental string to a word representation
   * @param accid
   * @return
   */
  static accidString2word(accid: string): string {
    let accidental = '';
    switch (accid) {
      case 's':
        accidental = 'sharp';
        break;
      case 'f':
        accidental = 'flat';
        break;
      case 'ss':
        accidental = 'sharp-sharp';
        break;
      case 'x':
        accidental = 'double-sharp';
        break;
      case 'ff':
        accidental = 'flat-flat';
        break;
      case 'xs':
      case 'ts':
        accidental = 'triple-sharp';
        break;
      case 'tf':
        accidental = 'triple-flat';
        break;
      case 'n':
        accidental = 'natural';
        break;
      case 'nf':
        accidental = 'natural-flat';
        break;
      case 'ns':
        accidental = 'natural-sharp';
        break;
      case 'su':
        accidental = 'sharp-up';
        break;
      case 'sd':
        accidental = 'sharp-down';
        break;
      case 'fu':
        accidental = 'flat-up';
        break;
      case 'fd':
        accidental = 'flat-down';
        break;
      case 'nu':
        accidental = 'natural-up';
        break;
      case 'nd':
        accidental = 'natural-down';
        break;
      case '1qf':
        accidental = 'quarter-flat';
        break;
      case '3qf':
        accidental = 'three-quarters-flat';
        break;
      case '1qs':
        accidental = 'quarter-sharp';
        break;
      case '3qs':
        accidental = 'three-quarters-sharp';
        break;
    }
    return accidental;
  }

  /**
   * compute the string value of accidental decimal value (1 = 1 semitone)
   * @param accid double value of accidental
   * @return the unicode string value of the accidental
   */
  static accidDecimal2unicodeString(accid: number): string {
    if (accid === 0.0) {
      return '';
    } else if (accid === 1.0) {
      return '&#9839;';
    } else if (accid === -1.0) {
      return '&#9837;';
    } else if (accid === 2.0) {
      return '&#119082;';
    } else if (accid === -2.0) {
      return '&#119083;';
    } else if (accid === 3.0) {
      return '&#119082;&#9839;';
    } else if (accid === -3.0) {
      return '&#9837;&#9837;&#9837;';
    } else if (accid === 1.5) {
      return '&#119088;';
    } else if (accid === 0.5) {
      return '&#119090;';
    } else if (accid === -0.5) {
      return '&#119091;';
    } else if (accid === -1.5) {
      return '&#119085;';
    }
    return '?';
  }

  // ---- Pitch Conversion ----

  /**
   * converts an mei pname to a midi pitch number in the first midi octave
   *
   * Accepts bare letters (`c`…`b`, either case) and letters with a baked-in accidental
   * (`c#`, `cs`, `db`, `df`, …); the octave is the caller's business, this only gives the
   * pitch class.
   *
   * **There is no case returning 10.** `a#`, `as`, `bb` and `bf` — and their capitalised
   * forms — are absent from the table and fall through to -1, while every other
   * chromatic degree is spelled out. The gap is in `Helper.java` too and is ported as is.
   * It is latent in practice: MEI normally encodes B flat as `pname="b"` with a separate
   * `accid`, and the converter's other entry point passes only the first character
   * (`pname2midi(ac.substring(0, 1))`), so a bare letter always reaches the table.
   *
   * @param pname the pname string
   * @return the midi pitch number in the first midi octave (one octave below the first MEI CMN octave), or -1 if unrecognised
   */
  static pname2midi(pname: string): number {
    switch (pname) {
      case 'b#':
      case 'B#':
      case 'bs':
      case 'Bs':
      case 'c':
      case 'C':
        return 0.0;
      case 'c#':
      case 'C#':
      case 'cs':
      case 'Cs':
      case 'db':
      case 'Db':
      case 'df':
      case 'Df':
        return 1.0;
      case 'd':
      case 'D':
        return 2.0;
      case 'd#':
      case 'D#':
      case 'ds':
      case 'Ds':
      case 'eb':
      case 'Eb':
      case 'ef':
      case 'Ef':
        return 3.0;
      case 'fb':
      case 'Fb':
      case 'ff':
      case 'Ff':
      case 'e':
      case 'E':
        return 4.0;
      case 'e#':
      case 'E#':
      case 'es':
      case 'Es':
      case 'f':
      case 'F':
        return 5.0;
      case 'f#':
      case 'F#':
      case 'fs':
      case 'Fs':
      case 'gb':
      case 'Gb':
      case 'gf':
      case 'Gf':
        return 6.0;
      case 'g':
      case 'G':
        return 7.0;
      case 'g#':
      case 'G#':
      case 'gs':
      case 'Gs':
      case 'ab':
      case 'Ab':
      case 'af':
      case 'Af':
        return 8.0;
      case 'a':
      case 'A':
        return 9.0;
      case 'cb':
      case 'Cb':
      case 'cf':
      case 'Cf':
      case 'b':
      case 'B':
        return 11.0;
      default:
        return -1.0;
    }
  }

  /**
   * converts a midi pitch value to a pitch name string (which includes enharmonic equivalents)
   * @param midipitch the midi pitch value
   * @return the pitch name string
   */
  static midi2pname(midipitch: number): string {
    const pitchclass = Math.round(midipitch % 12.0);
    switch (pitchclass) {
      case 0:
        return 'C';
      case 1:
        return 'C# Db';
      case 2:
        return 'D';
      case 3:
        return 'D# Eb';
      case 4:
        return 'E';
      case 5:
        return 'F';
      case 6:
        return 'F# Gb';
      case 7:
        return 'G';
      case 8:
        return 'G# Ab';
      case 9:
        return 'A';
      case 10:
        return 'A# Bb';
      case 11:
        return 'B';
      default:
        return '';
    }
  }

  /**
   * convert a midi pitch value to a pitch name string without accidental, the accidental will be encoded in a separate string;
   * this method is used during MIDI to MSM conversion
   * @param useSharpInsteadOfFlat use sharp or flat for accidental?
   * @param midipitch the midi pitch value
   * @param pnameAccid the output array: [pitchName, accidental] - must have length >= 2
   */
  static midi2PnameAndAccid(
    useSharpInsteadOfFlat: boolean,
    midipitch: number,
    pnameAccid: string[],
  ): void {
    if (pnameAccid.length < 2) {
      console.error(
        'Error in method Helper.midi2PnameAndAccid: Array length of pnameAccid should be at least 2.',
      );
      return;
    }

    const pitchclass = Math.round(midipitch % 12.0);
    switch (pitchclass) {
      case 0:
        pnameAccid[0] = 'C';
        pnameAccid[1] = '0.0';
        return;
      case 1:
        if (useSharpInsteadOfFlat) {
          pnameAccid[0] = 'C';
          pnameAccid[1] = '1.0';
        } else {
          pnameAccid[0] = 'D';
          pnameAccid[1] = '-1.0';
        }
        return;
      case 2:
        pnameAccid[0] = 'D';
        pnameAccid[1] = '0.0';
        return;
      case 3:
        if (useSharpInsteadOfFlat) {
          pnameAccid[0] = 'D';
          pnameAccid[1] = '1.0';
        } else {
          pnameAccid[0] = 'E';
          pnameAccid[1] = '-1.0';
        }
        return;
      case 4:
        pnameAccid[0] = 'E';
        pnameAccid[1] = '0.0';
        return;
      case 5:
        pnameAccid[0] = 'F';
        pnameAccid[1] = '0.0';
        return;
      case 6:
        if (useSharpInsteadOfFlat) {
          pnameAccid[0] = 'F';
          pnameAccid[1] = '1.0';
        } else {
          pnameAccid[0] = 'G';
          pnameAccid[1] = '-1.0';
        }
        return;
      case 7:
        pnameAccid[0] = 'G';
        pnameAccid[1] = '0.0';
        return;
      case 8:
        if (useSharpInsteadOfFlat) {
          pnameAccid[0] = 'G';
          pnameAccid[1] = '1.0';
        } else {
          pnameAccid[0] = 'A';
          pnameAccid[1] = '-1.0';
        }
        return;
      case 9:
        pnameAccid[0] = 'A';
        pnameAccid[1] = '0.0';
        return;
      case 10:
        if (useSharpInsteadOfFlat) {
          pnameAccid[0] = 'A';
          pnameAccid[1] = '1.0';
        } else {
          pnameAccid[0] = 'B';
          pnameAccid[1] = '-1.0';
        }
        return;
      case 11:
        pnameAccid[0] = 'B';
        pnameAccid[1] = '0.0';
        return;
      default:
        pnameAccid[0] = '';
        pnameAccid[1] = '';
    }
  }

  /**
   * Extends midi2PnameAndAccid to set octave value from midi pitch.
   * @param useSharpInsteadOfFlat
   * @param midipitch
   * @param pnameAccidOct array of length >= 3: [pitchName, accidental, octave]
   */
  static midi2PnameAccidOct(
    useSharpInsteadOfFlat: boolean,
    midipitch: number,
    pnameAccidOct: string[],
  ): void {
    if (pnameAccidOct.length < 3) {
      console.error(
        'Error in method Helper.midi2PnameAccidOct: Array length of pnameAccidOct should be at least 3.',
      );
      return;
    }
    Helper.midi2PnameAndAccid(useSharpInsteadOfFlat, midipitch, pnameAccidOct);
    if (pnameAccidOct[0] === '') return;
    pnameAccidOct[2] = Helper.getMidiOctave(midipitch).toString();
  }

  /**
   * Map midi pitch to octave.
   * @param midiPitch
   * @return
   */
  private static getMidiOctave(midiPitch: number): number {
    if (midiPitch >= 21 && midiPitch <= 23) return 0;
    if (midiPitch >= 24 && midiPitch <= 35) return 1;
    if (midiPitch >= 36 && midiPitch <= 47) return 2;
    if (midiPitch >= 48 && midiPitch <= 59) return 3;
    if (midiPitch >= 60 && midiPitch <= 71) return 4;
    if (midiPitch >= 72 && midiPitch <= 83) return 5;
    if (midiPitch >= 84 && midiPitch <= 95) return 6;
    if (midiPitch >= 96 && midiPitch <= 107) return 7;
    if (midiPitch >= 108) return 8;

    return -1;
  }

  // ---- File Utilities ----

  /**
   * just a little helper method to separate the filename from the extension
   * @param filename filename string incl. extension (may include the complete path)
   * @return filename/path without extension
   */
  static getFilenameWithoutExtension(filename: string): string {
    const i = filename.lastIndexOf('.');

    if (i === 0) return filename;

    return filename.substring(0, i);
  }

  /**
   * writes a string to a file
   * Note: In browser environments, this is a stub. In Node.js, it uses fs.
   * @param str the string content to write
   * @param filename the filename string; it should include the path and the extension
   * @return true if success, false if an error occurred
   */
  static writeStringToFile(str: string | null, filename: string | null): boolean {
    if (str == null) {
      console.error('String undefined!');
      return false;
    }

    if (filename == null) {
      console.error('Filename undefined!');
      return false;
    }

    try {
      // Node.js environment
      if (
        typeof globalThis !== 'undefined' &&
        typeof (globalThis as { process?: unknown }).process !== 'undefined'
      ) {
        // Dynamic import not possible in sync context, use require
        const fs = require('fs');
        const path = require('path');
        const dir = path.dirname(filename);
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(filename, `${str}\n`, 'utf-8');
        return true;
      } else {
        console.warn('writeStringToFile: File I/O is not available in this environment.');
        return false;
      }
    } catch (e) {
      console.error(e);
      return false;
    }
  }

  // ---- XSLT Transform Stubs ----

  /*
   * Nothing below this line does any work. Java uses Saxon for XSLT and a schema validator
   * for the two `validateAgainstSchema` methods above; neither has a counterpart in the
   * target environment, so each of these warns once and returns null. They are kept
   * because they are part of `Helper`'s published surface and dropping them would be an
   * API change, not because anything on the conversion path calls them — nothing does.
   *
   * The `transformer` parameters were `any` in the original port (a Saxon object has no
   * type here); they are now `unknown`, which accepts the same arguments at every call
   * site while giving callers nothing they could unsafely use. The parameters themselves
   * stay unread, which is what the remaining `no-unused-vars` entries in this file are —
   * clearing those needs `argsIgnorePattern: '^_'` in `eslint.config.js`, a config file
   * outside this item's scope.
   */

  /**
   * a helper method to perform XSL transforms
   * STUB: XSLT is not available in the browser environment.
   * @param input the input xml document
   * @param xslt the XSLT stylesheet file path
   * @return the output Document of the transform or null
   */
  static xslTransformToDocument(input: Document, xslt: string): Document | null;
  /**
   * a helper method to perform XSL transforms
   * STUB: XSLT is not available in the browser environment.
   * @param input the input xml document
   * @param transformer the XSLT transformer (untyped, since Saxon is not available)
   * @return the output Document of the transform or null
   */
  static xslTransformToDocument(input: Document, transformer: unknown): Document | null;
  static xslTransformToDocument(input: Document, xsltOrTransformer: unknown): Document | null {
    console.warn(
      'xslTransformToDocument: XSLT transforms are not available in the browser/Node.js environment. Returning null.',
    );
    return null;
  }

  /**
   * a helper method to perform XSL transforms
   * STUB: XSLT is not available in the browser environment.
   * @param input the input xml document or string
   * @param xslt the XSLT stylesheet file path
   * @return the output string (null in case of an error)
   */
  static xslTransformToString(input: Document, xslt: string): string | null;
  /**
   * a helper method to perform XSL transforms
   * STUB: XSLT is not available in the browser environment.
   * @param input the input xml document
   * @param transformer the XSLT transformer
   * @return the output string (null in case of an error)
   */
  static xslTransformToString(input: Document, transformer: unknown): string | null;
  /**
   * a helper method to perform XSL transforms
   * STUB: XSLT is not available in the browser environment.
   * @param input the input xml string
   * @param transformer the XSLT transformer
   * @return the output string (null in case of an error)
   */
  static xslTransformToString(input: string, transformer: unknown): string | null;
  /**
   * a helper method to perform XSL transforms
   * STUB: XSLT is not available in the browser environment.
   * @param input the input xml string
   * @param xslt the XSLT stylesheet file path
   * @return the output string (null in case of an error)
   */
  static xslTransformToString(input: string, xslt: string): string | null;
  static xslTransformToString(input: Document | string, xsltOrTransformer: unknown): string | null {
    console.warn(
      'xslTransformToString: XSLT transforms are not available in the browser/Node.js environment. Returning null.',
    );
    return null;
  }

  /**
   * compile an XSLT 1.0 or 2.0 compatible Transformer
   * STUB: XSLT is not available in the browser environment.
   * @param xslt the XSLT stylesheet file path
   * @param processor
   * @param source
   * @param destination
   * @return null (stub)
   */
  static makeXsltTransformer(
    xslt: string,
    processor: unknown,
    source: unknown,
    destination: unknown,
  ): unknown {
    console.warn(
      'makeXsltTransformer: XSLT is not available in the browser/Node.js environment. Returning null.',
    );
    return null;
  }

  /**
   * compile an XSLT 3.0 Transformer from a given xslt stylesheet using the given Processor instance
   * STUB: XSLT is not available in the browser environment.
   * @param xslt the XSLT stylesheet file path
   * @param processor
   * @return null (stub)
   */
  static makeXslt30Transformer(xslt: string, processor?: unknown): unknown {
    console.warn(
      'makeXslt30Transformer: XSLT is not available in the browser/Node.js environment. Returning null.',
    );
    return null;
  }

  // ---- XML Pretty Print ----

  /**
   * given a string of XML code, this method prettifies it
   *
   * Purely textual and purely cosmetic — it splits on tag boundaries and re-indents by a
   * running depth counter. It is **not** used anywhere on the conversion path: the MSM and
   * MPM that the equivalence tests compare are serialized by {@link Element.toXML}, not by
   * this. Only human-facing output goes through here, which is why its edge cases (CDATA
   * handled by an `endsWith(']]>')` guess, comments not handled at all) never mattered.
   *
   * @param xml
   * @return
   */
  static prettyXml(xml: string | null): string {
    if (xml == null || xml.trim().length === 0) return '';

    let stack = 0;
    let pretty = '';
    const rows = xml.trim().replace(/>/g, '>\n').replace(/</g, '\n<').split('\n');

    for (const rawRow of rows) {
      if (rawRow == null || rawRow.trim().length === 0) continue;

      const row = rawRow.trim();
      if (row.startsWith('<?')) {
        pretty += `${row}\n`;
      } else if (row.startsWith('</')) {
        const indent = Helper.repeatString(--stack);
        pretty += `${indent + row}\n`;
      } else if (row.startsWith('<') && !row.endsWith('/>')) {
        const indent = Helper.repeatString(stack++);
        pretty += `${indent + row}\n`;
        if (row.endsWith(']]>')) stack--;
      } else {
        const indent = Helper.repeatString(stack);
        pretty += `${indent + row}\n`;
      }
    }

    return pretty.trim();
  }

  /**
   * just a helper method for prettyXml()
   * @param stack
   * @return
   */
  private static repeatString(stack: number): string {
    let indent = '';
    for (let i = 0; i < stack; i++) {
      indent += '  ';
    }
    return indent;
  }

  // ---- List Attribute ----

  /**
   * Adds a value to a space-separated string list in an attribute, but only if that value does not yet exist in that list.
   * @param element the element containing the attribute
   * @param attrName the name of the attribute
   * @param value the value to add
   */
  static addToListAttribute(
    element: Element | null,
    attrName: string | null,
    value: string | null,
  ): void {
    if (element == null || attrName == null || attrName === '' || value == null || value === '') {
      return;
    }

    const attr = Helper.getAttribute(attrName, element);
    const currentValue = attr != null ? attr.getValue() : '';

    // Split the current value into a list of values
    const values = currentValue
      .trim()
      .split(/\s+/)
      .filter((s) => s !== '');

    // Add the new value only if it doesn't exist
    if (!values.includes(value)) {
      values.push(value);
      const newValue = values.join(' ');

      if (attr != null) {
        attr.setValue(newValue);
      } else {
        element.addAttribute(new Attribute(attrName, newValue));
      }
    }
  }
}
