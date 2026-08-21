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
 * of these functions used to exist — `src/msm/Msm.ts` had eight module-local ones and
 * `src/mpm/Mpm.ts` has two — believed to have behaviourally drifted from these (T9). RULE M2a
 * forbids merging them without a per-method behavioural probe. `Msm.ts`'s eight now have one:
 * `tests/msm/navigationEquivalence.test.ts` restates each and feeds both sides the MSM/MPM
 * fixture corpus plus namespaced attributes, same-local-name children in three namespaces,
 * text-separated siblings and the empty name. Seven agreed everywhere and their `Msm.ts`
 * copies are gone; the eighth, `getFilenameWithoutExtension`, does NOT agree with
 * `music/text.ts`'s on a dotless filename, and stays duplicated with the difference pinned.
 * `src/mpm/Mpm.ts`'s two are still unprobed.
 *
 * Port of the navigation half of `meico.mei.Helper`.
 * @author Axel Berndt
 */

/*
 * A note on the overload sets in this module, which read oddly: Java has
 * `getFirstChildElement(Element)` and `getFirstChildElement(String, Element)`, and the
 * port added `(Element, String)` on top. TypeScript dispatches them at runtime by
 * inspecting `typeof arg1`, which is why the implementation signature is widened to
 * `Element | string | null`.
 *
 * Two of the four overloads were `(Element)` and `(Element, String)`, which differ only by
 * a trailing argument and are therefore one signature with an optional parameter —
 * `unified-signatures` said so, and it was right: the collapsed form accepts exactly the
 * call shapes the pair accepted. What stays split is name-first against name-last, because
 * those select **different implementations** (see below), and collapsing them would be an
 * API change rather than a spelling one.
 */

/**
 * The first child element of `ofThis` with local name `name`, or null.
 *
 * This function became necessary because the XOM methods sometimes do not seem to work for
 * whatever reason.
 *
 * This and {@link firstChildElementOf} were one overloaded name until the lean pass, told
 * apart at runtime by `typeof arg1` — `(name, ofThis)` here, `(ofThis, localname?)` there.
 * They are still TWO IMPLEMENTATIONS and are still not merged: this one walks
 * `getChildElements()`, the other asks `getFirstChildElement()`, and they disagree on an
 * empty name (see the note on {@link firstChildElementOf}). RULE M2a forbids merging two
 * navigation implementations without a behavioural probe; splitting the overload into two
 * names changes no behaviour at all, and `tests/xml/overloadArmDifferences.test.ts` is the
 * probe that pins where the two answers part company.
 *
 * What the split buys, beyond one fewer overload: the two forms took their arguments in
 * opposite orders under one name, so a transposed call type-checked and silently selected the
 * other implementation. It is now a compile error.
 *
 * `ofThis` is nullable and the body guards it, which is the overload set's permissive
 * IMPLEMENTATION signature promoted to the published one. The old narrow arms only ever hid
 * a null the body already handled and three tests already pinned; saying so in the type is
 * what {@link attribute} in this same file has always done, and it keeps the guard honest
 * rather than making it a condition the linter can prove is dead.
 *
 * @param name the local name to match
 * @param ofThis the parent to search, or null
 * @return the first child element with the given name or null
 */
export function firstChildElement(name: string, ofThis: Element | null): Element | null {
  if (ofThis == null) return null;

  // A walk, and now spelled as one. Still `getChildElements()` and not
  // `getFirstChildElement(name)`, which would be the same answer by the same comparison —
  // RULE M2a forbids merging the two navigation implementations without a behavioural
  // probe, and the block comment above says so at length. Only the index is gone.
  for (const child of ofThis.getChildElements()) {
    if (child.getLocalName() === name) return child;
  }
  return null;
}

/**
 * The first child element of `ofThis`, optionally filtered by local name.
 *
 * XOM's `getFirstChild(String)` sometimes doesn't seem to work even though an XPath query
 * finds something. For those situations this method can be used as a workaround.
 *
 * The sibling of {@link firstChildElement}, and the only one of the two that can ask for the
 * first child of ANY name — which is why it keeps the optional parameter and why its own
 * name carries the `Of`. See there for why the two implementations stay apart.
 *
 * @param ofThis the parent to search
 * @param localname restrict to the first child with this local name; omit for the first
 *   child element of any name
 * @return the first matching child element or null
 */
export function firstChildElementOf(ofThis: Element | null, localname?: string): Element | null {
  if (ofThis == null) return null;

  // `== null` and not `=== undefined`: the overload this replaces tested
  // `arg2 === undefined || arg2 === null`, so an untyped caller passing an explicit null
  // asked for the first child of any name. That caller still does.
  if (localname == null) {
    const es = ofThis.getChildElements();
    if (es.size() === 0) return null;
    return es.get(0);
  }

  // Kept: the query form returned null for an empty localname, where the walking form
  // would look for a child literally named `''`. The XPath round trip itself is gone
  // for the reason given at {@link allChildElements}.
  if (localname === '') return null;
  return ofThis.getFirstChildElement(localname);
}

/**
 * The throwing sibling of {@link firstChildElement} (ARCHITECTURE.md RULE N2a): same lookup,
 * but a missing child is a {@link MissingNodeError} instead of a `null` the caller has to
 * assert away with `!`.
 *
 * Use it only where the child's presence is guaranteed by the local code — an assignment
 * earlier in the same function, or the shape of a document this port itself built. On a
 * path where absence is possible, keep {@link firstChildElementOf} and handle the null.
 *
 * Unlike its non-throwing siblings this had only ever been ONE implementation wearing two
 * argument orders — the second arm did nothing but hand the same two values to the same
 * delegate — so it collapses to a single signature rather than splitting in two. The two
 * `(name, ofThis)` call sites both passed a string literal, so the empty-name difference
 * between the delegates could not reach them.
 *
 * @param ofThis
 * @param localname restrict to the first child with this local name; omit for the first
 *   child element of any name
 * @return the first child element
 */
export function requireFirstChildElement(ofThis: Element, localname?: string): Element {
  const found = firstChildElementOf(ofThis, localname);
  if (found === null) throw new MissingNodeError(`no child element '${localname ?? '*'}' found`);
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
  // Both forms used to go through `parent.query("child::*[…]")`, which in this port means
  // serialising the whole subtree, re-parsing it, running XPath over the copy and mapping
  // every hit back by position (see {@link Element.query}). For the *child* axis that is
  // pure overhead: `getChildElements` already selects element children by local name, in
  // document order, and returns the live nodes rather than mapped-back ones. This was the
  // single most-called function on the render path, and the subtree it copied was often
  // the whole score.
  // `toArray()` is the copy this loop was making by hand — same elements, same order, one
  // allocation instead of two (the `Elements` snapshot, then the array). The copy itself is
  // not optional: the return type is a mutable `Element[]` and callers splice it.
  return parent.getChildElements(name).toArray();
}

/**
 * Every element descendant of `ofThis` for which `matches` holds, in document order.
 *
 * This is the `descendant::*[…]` axis, written out. The port used to reach it through
 * {@link Element.query}, which serialises the subtree, re-parses it, runs the expression
 * over the throwaway copy and maps each hit back by position — and then pays XPath's
 * node-set ordering pass, whose `compareDocumentPosition` is quadratic in the number of
 * hits. On a `<dated>` holding a full `<score>` that one call dominated the whole render.
 *
 * Semantics that must be preserved by anything replacing this, because callers depend on
 * all three:
 *
 * - **`ofThis` itself is never returned** — `descendant::`, not `descendant-or-self::`;
 * - **pre-order** — an element is emitted before its own descendants, which is document
 *   order and is what XPath returns;
 * - **the whole subtree is searched**, including below a matching element. A `…Map`
 *   nested inside another one is reported, as it was before.
 *
 * The walk is iterative rather than recursive so that a pathologically deep document
 * cannot overflow the stack; the explicit stack is pushed in reverse so children come off
 * it left to right.
 */
export function descendantElements(
  ofThis: Element,
  matches: (element: Element) => boolean,
): Element[] {
  const found: Element[] = [];
  const stack: Element[] = [];

  for (let i = ofThis.getChildCount() - 1; i >= 0; --i) {
    const child = ofThis.getChild(i);
    if (child instanceof Element) stack.push(child);
  }

  for (let element = stack.pop(); element !== undefined; element = stack.pop()) {
    if (matches(element)) found.push(element);
    for (let i = element.getChildCount() - 1; i >= 0; --i) {
      const child = element.getChild(i);
      if (child instanceof Element) stack.push(child);
    }
  }

  return found;
}

/**
 * Exactly the elements {@link descendantElements} would return, in the opposite order,
 * produced one at a time.
 *
 * This exists for the callers that scan **backwards and stop at the first hit** —
 * `dateMap.addToMap`, which looks for the last entry not later than the one being
 * inserted, and the converter's tie handling, which looks for the note a tie continues.
 * Both used to build the whole array and then read one element off the end of it. That is
 * a linear pass per insertion, so filling a score of n notes was Θ(n²) even after the
 * XPath round trip was gone — with a much smaller constant, but the same shape. Here the
 * walk is lazy: it descends the rightmost spine, yields, and only goes further if the
 * caller keeps asking. For a map whose entries are childless and whose dates arrive in
 * order — which is the case on essentially every insertion the converter makes — the
 * caller stops after one element and the whole call is O(depth).
 *
 * Reverse document order is right-to-left post-order: for a node with children c1…ck it is
 * the reverse of ck's subtree, then of c(k-1)'s, …, then the node itself. `ofThis` is the
 * bottom frame and is popped without being yielded, which is what makes this `descendant::`
 * rather than `descendant-or-self::`.
 *
 * The traversal keeps a cursor per open frame rather than pushing whole child lists, so a
 * flat map of n children costs nothing until the caller walks past them, and — as in
 * {@link descendantElements} — the stack is explicit, so depth cannot overflow.
 *
 * The tree must not be mutated while a caller is iterating: the frames hold live indices
 * into the child lists. Both call sites mutate only after they have stopped.
 */
export function* reverseDescendantElements(
  ofThis: Element,
  matches: (element: Element) => boolean,
): Generator<Element> {
  /** `i` is the next child to descend into, counted downwards from the last. */
  const stack: { readonly element: Element; i: number }[] = [
    { element: ofThis, i: ofThis.getChildCount() - 1 },
  ];

  // The loop peeks at the top frame and only sometimes pops it, so it cannot be written as
  // `while ((frame = stack.pop()) !== undefined)`. Taking the peek in the for-header instead
  // is what lets the compiler see that the body runs only on a frame that exists —
  // `stack[stack.length - 1]` is `T | undefined` under `noUncheckedIndexedAccess`, and the
  // invariant that makes it safe lives in the loop condition, where a type cannot follow it.
  // `continue` runs the update expression, so the re-peek happens on every path.
  for (let frame = stack.at(-1); frame !== undefined; frame = stack.at(-1)) {
    let child: Element | null = null;
    while (frame.i >= 0) {
      const candidate = frame.element.getChild(frame.i--);
      if (candidate instanceof Element) {
        child = candidate;
        break;
      }
    }

    if (child !== null) {
      stack.push({ element: child, i: child.getChildCount() - 1 });
      continue;
    }

    stack.pop();
    if (stack.length > 0 && matches(frame.element)) yield frame.element;
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
 * The *nearest following* sibling element of `ofThis` with that name, and null when there is
 * none — including when `ofThis` is not among its own parent's children at all, which is how
 * the text-node-adjacent cases resolve.
 *
 * This and {@link immediateNextSiblingElement} were one overloaded name until the lean pass.
 * They are NOT the same lookup with a filter applied, which is the whole reason they now have
 * separate names: this one scans forward over every node and so steps over text nodes and
 * differently-named elements, where the immediate form takes a single index step and stops at
 * whatever it finds. `tests/xml/overloadArmDifferences.test.ts` pins both differences.
 *
 * @param name the local name to match
 * @param ofThis the element to start from
 * @return the nearest following sibling element with that name, or null
 */
export function getNextSiblingElement(name: string, ofThis: Element | null): Element | null {
  if (ofThis == null) return null;

  const parent = ofThis.getParent();
  if (parent == null) return null;

  // Forward scan from `ofThis`'s own position. Identical result to the backward
  // "remember the last candidate" walk this replaces — both name the *nearest
  // following* element sibling with that name, and both yield null when `ofThis` is
  // not in the list at all (there, `indexOf` returns -1 and the loop never starts).
  // The difference is cost: the backward form materialised the whole child-element
  // list and walked it end-to-front on every step, so a `for (n = first; n; n =
  // getNextSiblingElement(name, n))` traversal of a score was quadratic in its length.
  const index = parent.indexOf(ofThis);
  if (index < 0) return null;

  const count = parent.getChildCount();
  for (let i = index + 1; i < count; ++i) {
    const sibling = parent.getChild(i);
    if (sibling instanceof Element && sibling.getLocalName() === name) return sibling;
  }

  return null;
}

/**
 * The sibling element immediately after `ofThis`, irrespective of its name, or null.
 *
 * A plain index step: it returns null when the immediately next node is a text node rather
 * than skipping over it, and it answers with whatever element is adjacent rather than looking
 * for a name. See {@link getNextSiblingElement} for the named scan and for why the two are
 * separate functions rather than one overload.
 *
 * @param ofThis the element to step from
 * @return the immediately following sibling if it is an element, else null
 */
export function immediateNextSiblingElement(ofThis: Element | null): Element | null {
  if (ofThis == null) return null;

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

/**
 * The mirror image of {@link getNextSiblingElement}: the nearest *preceding* sibling element
 * of `ofThis` with that name, or null.
 *
 * Split from {@link immediatePreviousSiblingElement} for the reasons given at
 * {@link getNextSiblingElement} — the two arms are different lookups, not one lookup with a
 * filter, and only this one steps over text nodes and differently-named elements.
 *
 * @param name the local name to match
 * @param ofThis the element to start from
 * @return the nearest preceding sibling element with that name, or null
 */
export function getPreviousSiblingElement(name: string, ofThis: Element | null): Element | null {
  if (ofThis == null) return null;

  const parent = ofThis.getParent();
  if (parent == null) return null;

  // The mirror of the forward scan in {@link getNextSiblingElement}, and equivalent to
  // the front-to-back "last match wins" walk it replaces, for the same reasons.
  const index = parent.indexOf(ofThis);
  if (index < 0) return null;

  for (let i = index - 1; i >= 0; --i) {
    const sibling = parent.getChild(i);
    if (sibling instanceof Element && sibling.getLocalName() === name) return sibling;
  }

  return null;
}

/**
 * The sibling element immediately before `ofThis`, irrespective of its name, or null.
 *
 * The mirror of {@link immediateNextSiblingElement}, and a plain index step in the same way:
 * null when the immediately preceding node is a text node, and whatever element is adjacent
 * otherwise.
 *
 * @param ofThis the element to step from
 * @return the immediately preceding sibling if it is an element, else null
 */
export function immediatePreviousSiblingElement(ofThis: Element | null): Element | null {
  if (ofThis == null) return null;

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
 * The `null` in the return type comes **only** from the `null` in the argument type, and the
 * two overloads say so — `cloneElement(someElement)` is an `Element`, which is what lets the
 * three call sites that wrote `cloneElement(x)!` drop the assertion. This is RULE N2b's
 * narrowing expressed as an overload rather than performed as a deletion: the guard stays,
 * because the nullable form is still wanted (`addToMap(cloneElement(scoreDef), …)` lets a
 * null flow straight through), so nothing gains the unguarded `TypeError` that rule's
 * EQ-RISK warns about.
 *
 * @param e
 * @return
 */
export function cloneElement(e: Element): Element;
export function cloneElement(e: Element | null): Element | null;
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

  // `getAttribute(name, '')` rather than `getAttribute(name)`: XOM's one-argument form matches
  // a local name in NO namespace, and this port's also matches the qualified name. That
  // difference is invisible until something asks for `'xml:id'`, whose local name is `id` —
  // Java's three lookups all miss and `Helper.getAttributeValue` answers `""`, where step one
  // here used to hit. Two call sites depend on it and both are byte-visible: `Msm.ts`'s
  // raw-MIDI text event and `AsynchronyMap`'s `@modified` id. Java's own references settle
  // which side is right — all 105 `modified` attributes in `all-maps-reference/` are
  // `modified=""`, and `articulations_raw.mid` carries twelve `FF 01 00`, twelve text events
  // of length zero.
  //
  // The fix is here rather than in `Element.getAttribute` deliberately. Removing the qualified
  // match there also passes the gate, and reds 30 tests elsewhere — `Mei2MsmMpmConverter`'s
  // failures being counts, not ids, because it reads qualified names structurally. This
  // function is the transcription of `Helper.getAttribute`, so this is where the fidelity
  // belongs; the XOM emulation keeps its convenience for everyone else.
  //
  // **Second consequence, narrower than the first and worth stating so nobody rediscovers it
  // as a surprise.** The old step one matched a local name in ANY namespace; this one matches
  // it in none. An attribute in a namespace that is neither empty nor the element's own is
  // therefore no longer found here — steps two and three do not cover that case either. It is
  // unreachable from any document in this repository: `xml:id` is the ONLY namespaced
  // attribute in the whole fixture corpus (1725 of them, all covered by step three), and the
  // only prefix declaration anywhere is `xmlns:xml` itself. Attributes without a prefix are in
  // no namespace by XML's own rule, unlike elements, which is why every `@date`, `@number`
  // and `@name` in MSM and MPM still resolves at step one. Checked end to end after this
  // change: `comparison/parts.ts`'s `readPartNumber`, which would silently unmatch parts if it
  // regressed, still reads `1` off a real reference MSM.
  let a = ofThis.getAttribute(name, '');
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
 * The throwing sibling of {@link getAttributeValue} (ARCHITECTURE.md RULE N2a), completing the
 * pair for the accessor that dominates the converter's call sites.
 *
 * The non-throwing form answers a missing attribute with `''`, which is the *value* an empty
 * attribute would have carried — so a caller that needs to tell "absent" from "present and
 * empty" cannot use it, and 150-odd sites in `mei/` therefore read
 * `element.getAttributeValue(name)!` (XOM's own accessor, which returns `null`) and assert.
 * This is that read, with the assertion replaced by an error that names the attribute.
 *
 * **Exactly equivalent to `ofThis.getAttributeValue(name)!`**, which is what makes converting
 * those sites mechanical rather than a behaviour change. That is not obvious, because
 * {@link attribute} adds two namespaced lookups on top of the plain one — but in this port
 * they are unreachable: `Element.getAttribute(name)` with no namespace already matches on
 * `getLocalName() === name` (or the qualified name), i.e. it is namespace-agnostic, so if it
 * finds nothing then no attribute carries that local name and neither namespaced retry can
 * find one either. The fallbacks earn their keep against Java XOM, whose one-argument
 * `getAttribute` matches unnamespaced attributes only; they are kept for that documentary
 * value rather than deleted under RULE N2b.
 *
 * @param name
 * @param ofThis
 * @return the attribute's value
 */
export function requireAttributeValue(name: string, ofThis: Element | null): string {
  return requireAttribute(name, ofThis).getValue();
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
    // `getAttributeValue` answers `''` for an absent attribute rather than null, so the
    // empty-string test is the whole of "carries this attribute" here.
    const attr = getAttributeValue(attrName, parent);
    if (attr !== '') return parent;
    parent = parentElement(parent);
  }
  return null;
}
