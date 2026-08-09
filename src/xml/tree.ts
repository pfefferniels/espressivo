import { Attribute, Element } from './XomTypes.js';
import { MissingNodeError } from './errors.js';

/**
 * Namespace-agnostic XML navigation: the child/sibling/parent/attribute primitives the whole
 * port is built on.
 *
 * These are replacements for the XOM methods, which the original author found unreliable in
 * the face of MEI's inconsistent namespace usage. **Everything here matches on `localName`
 * and ignores the namespace, which is the single most load-bearing property of this module.**
 *
 * Moved verbatim out of `mei/Helper` by T14 (ARCHITECTURE.md §8.2). Two other copies of some
 * of these functions exist — `src/msm/Msm.ts` has eight module-local ones and `src/mpm/Mpm.ts`
 * two — and they have behaviourally drifted from these (T9). RULE M2a forbids merging them
 * without a per-method behavioural probe; that is item T16b's, not this module's.
 *
 * Port of the navigation half of `meico.mei.Helper`.
 * @author Axel Berndt
 */

/*
 * A note on the overload sets in this module, which read oddly: Java has
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
export function firstChildElement(ofThis: Element): Element | null;
/**
 * XOM's method getFirstChild(String) sometimes doesn't seem to work even though an XPath query finds something.
 * For these situations this method can be used as workaround.
 * @param ofThis
 * @param localname
 * @return the first child element with the given localname or null
 */
export function firstChildElement(ofThis: Element, localname: string): Element | null;
/**
 * this function became necessary because the XOM methods sometimes do not seem to work for whatever reason
 * @param name
 * @param ofThis
 * @return the first child element with the given name or null
 */
export function firstChildElement(name: string, ofThis: Element): Element | null;
/**
 * Note that the two named forms do not share an implementation: `(name, ofThis)` walks
 * `getChildElements()` directly, while `(ofThis, localname)` goes through an XPath
 * query — which in this port means serialising the subtree and re-parsing it (see
 * {@link Element.query}). They agree on the result but not on the cost, and the query
 * form additionally returns null for an empty `localname` where the walking form would
 * search for a child literally named `''`. Do not collapse the two: they are two
 * implementations, and merging navigation implementations is forbidden without a
 * behavioural probe (ARCHITECTURE.md RULE M2a, §9).
 */
export function firstChildElement(
  arg1: Element | string | null,
  arg2?: Element | string | null,
): Element | null {
  // Determine which overload was called
  if (arg1 === null || arg1 === undefined) return null;

  if (typeof arg1 === 'string') {
    // firstChildElement(name: string, ofThis: Element)
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
    const ofThis = arg1;
    if (arg2 === undefined || arg2 === null) {
      // firstChildElement(ofThis: Element) - no name filter
      const es = ofThis.getChildElements();
      if (es.size() === 0) return null;
      return es.get(0);
    } else {
      // firstChildElement(ofThis: Element, localname: string)
      const localname = arg2 as string;
      if (localname === '') return null;
      const e = ofThis.query(`child::*[local-name()='${localname}']`);
      if (e.size() === 0) return null;
      return e.get(0) as Element;
    }
  }
}

/**
 * The throwing sibling of {@link firstChildElement} (ARCHITECTURE.md RULE N2a): same lookup,
 * but a missing child is a {@link MissingNodeError} instead of a `null` the caller has to
 * assert away with `!`.
 *
 * Use it only where the child's presence is guaranteed by the local code — an assignment
 * earlier in the same function, or the shape of a document this port itself built. On a
 * path where absence is possible, keep {@link firstChildElement} and handle the null.
 * @param ofThis
 * @return the first child element
 */
export function requireFirstChildElement(ofThis: Element): Element;
/**
 * @param ofThis
 * @param localname
 * @return the first child element with the given localname
 */
export function requireFirstChildElement(ofThis: Element, localname: string): Element;
/**
 * @param name
 * @param ofThis
 * @return the first child element with the given name
 */
export function requireFirstChildElement(name: string, ofThis: Element): Element;
export function requireFirstChildElement(arg1: Element | string, arg2?: Element | string): Element {
  const found = firstChildElement(arg1 as Element, arg2 as string);
  if (found === null) {
    const name = typeof arg1 === 'string' ? arg1 : typeof arg2 === 'string' ? arg2 : '*';
    throw new MissingNodeError(`no child element '${name}' found`);
  }
  return found;
}

/**
 * this method is an alternative to XOM's getChildElements(String name) which sometimes doesn't seem to work
 *
 * Always returns an array — empty when nothing matches. The two null guards Java's version
 * needs (`ofThis == null`, `name === ''`) were deleted by T14 under ARCHITECTURE.md RULE N2b:
 * `parent` is non-nullable now, and all 16 call sites in the tree pass either a string
 * literal or no name at all, so the empty-name case is unreachable. See the T14 log entry
 * for the per-site enumeration.
 *
 * @param parent
 * @param name restrict to children with this localname; omit for all children
 * @return the matching child elements, in document order
 */
export function allChildElements(parent: Element, name?: string): Element[] {
  if (name !== undefined) {
    // allChildElements(parent, name)
    const e = parent.query(`child::*[local-name()='${name}']`);
    const es: Element[] = [];
    for (let i = 0; i < e.size(); ++i) {
      es.push(e.get(i) as Element);
    }
    return es;
  } else {
    // allChildElements(parent)
    const e = parent.query('child::*');
    const es: Element[] = [];
    for (let i = 0; i < e.size(); ++i) {
      es.push(e.get(i) as Element);
    }
    return es;
  }
}

/**
 * Create a flat list of all descendants of a certain name (beginning with ofThis)
 *
 * Pre-order: an element is pushed before its own descendants are searched, so the result
 * reads in document order. Note the two different empty results — null when there is
 * nothing to search (`ofThis` null or `name` empty), an empty array when the search ran
 * and found nothing. Callers in the converter rely on the second and null-check anyway.
 *
 * @param name
 * @param ofThis
 * @return
 */
export function getAllDescendantsByName(name: string, ofThis: Element | null): Element[] | null {
  if (ofThis == null || name === '') return null;
  const children: Element[] = [];
  const allChildren = allChildElements(ofThis);
  for (const ch of allChildren) {
    if (ch.getLocalName() === name) {
      children.push(ch);
    }
    const descendants = getAllDescendantsByName(name, ch);
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
export function getAllDescendantsWithAttribute(
  attrName: string,
  ofThis: Element | null,
): Element[] | null {
  if (ofThis == null || attrName === '') return null;
  const children: Element[] = [];
  const allChildren = allChildElements(ofThis);
  for (const ch of allChildren) {
    if (ch.getAttribute(attrName) != null) {
      children.push(ch);
    }
    const descendants = getAllDescendantsWithAttribute(attrName, ch);
    if (descendants != null) {
      children.push(...descendants);
    }
  }
  return children;
}

/**
 * get the next sibling element of ofThis irrespective of its name
 * @param ofThis
 * @return
 */
export function getNextSiblingElement(ofThis: Element): Element | null;
/**
 * get the next sibling element of ofThis with the given name
 * @param name
 * @param ofThis
 * @return
 */
export function getNextSiblingElement(name: string, ofThis: Element): Element | null;
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
export function getNextSiblingElement(
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
    const ofThis = arg1;
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
export function getPreviousSiblingElement(ofThis: Element): Element | null;
/**
 * get the previous sibling element of ofThis with a specific name
 * @param name
 * @param ofThis
 * @return
 */
export function getPreviousSiblingElement(name: string, ofThis: Element): Element | null;
/** the mirror image of {@link getNextSiblingElement}: forward walk, last match wins */
export function getPreviousSiblingElement(
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
    const ofThis = arg1;
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
export function getAllPreviousSiblingElements(name: string, ofThis: Element): Element[] {
  let sibling = getPreviousSiblingElement(name, ofThis);
  const siblings: Element[] = [];
  while (sibling != null) {
    siblings.push(sibling);
    sibling = getPreviousSiblingElement(name, sibling);
  }
  return siblings;
}

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
export function cloneElement(e: Element | null): Element | null {
  if (e == null) return null;

  const copy = e.copy();
  copy.removeChildren();
  return copy;
}

/**
 * returns the attribute with the specified name contained in ofThis, or null if that attribute does not exist, namespace is ignored
 *
 * Three lookups in a fixed order: no namespace, the element's own namespace, then the
 * XML namespace. The last is what makes `attribute('id', e)` find `xml:id`, which is
 * how nearly every id read in this port is spelled — MEI puts ids in the XML namespace,
 * but plenty of encodings (and the elements this converter builds itself) use a bare
 * `id`. The order matters: an element carrying both gets the unnamespaced one.
 *
 * @param name
 * @param ofThis
 * @return
 */
export function attribute(name: string, ofThis: Element | null): Attribute | null {
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
 * The throwing sibling of {@link attribute} (ARCHITECTURE.md RULE N2a). Same three-namespace
 * lookup; a missing attribute is a {@link MissingNodeError} rather than a `null` the caller
 * has to assert away.
 * @param name
 * @param ofThis
 * @return the attribute
 */
export function requireAttribute(name: string, ofThis: Element | null): Attribute {
  const a = attribute(name, ofThis);
  if (a === null) throw new MissingNodeError(`no attribute '${name}' found`);
  return a;
}

/**
 * returns the value of attribute name in Element ofThis as String, or empty string if attribute does not exist, namespace is ignored
 * @param name
 * @param ofThis
 * @return
 */
export function getAttributeValue(name: string, ofThis: Element | null): string {
  const a = attribute(name, ofThis);
  if (a == null) return '';
  return a.getValue();
}

/**
 * returns the parent element of ofThis as element or null
 * @param ofThis
 * @return
 */
export function parentElement(ofThis: Element): Element | null {
  const parent = ofThis.getParent();
  if (parent != null && parent instanceof Element) {
    return parent;
  }
  return null;
}

/**
 * The throwing sibling of {@link parentElement} (ARCHITECTURE.md RULE N2a): a missing or
 * non-element parent is a {@link MissingNodeError}.
 * @param ofThis
 * @return the parent element
 */
export function requireParentElement(ofThis: Element): Element {
  const parent = parentElement(ofThis);
  if (parent === null)
    throw new MissingNodeError(`element '${ofThis.getLocalName()}' has no parent element`);
  return parent;
}

/**
 * Returns the closest element of a certain name along the parent tree.
 * ofThis is not checked for name, since it cannot be a predecessor of itself.
 * @param name
 * @param ofThis
 * @return
 */
export function getClosest(name: string, ofThis: Element): Element | null {
  let parent = parentElement(ofThis);
  while (parent != null) {
    if (parent.getLocalName() === name) return parent;
    parent = parentElement(parent);
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
export function getClosestByAttr(attrName: string, ofThis: Element): Element | null {
  let parent = parentElement(ofThis);
  while (parent != null) {
    const attr = getAttributeValue(attrName, parent);
    if (attr != null && attr !== '') return parent;
    parent = parentElement(parent);
  }
  return null;
}
