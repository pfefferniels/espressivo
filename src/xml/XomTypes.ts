/**
 * XOM emulation layer — the substrate every MEI / MSM / MPM document in this port
 * is built on.
 *
 * meico's Java original is written against `nu.xom`, so the port needs an XML tree
 * with XOM's shape (`Element`, `Attribute`, `Nodes`, `Elements`, `Builder`, ...).
 * `@xmldom/xmldom` supplies parsing and the raw DOM nodes; the tree itself, the
 * parent wiring and — critically — the serializer live here.
 *
 * ## Byte-compatibility contract
 *
 * `toXML()` is not a pretty-printer and must not become one: the integration suite
 * compares its output against Java-generated ground truth, so the following are
 * load-bearing and may not be "improved".
 *
 * - **Attribute order is insertion order.** `Element._attributes` is an array, never
 *   a map; `addAttribute` appends and the serializer walks it front to back.
 * - **Namespace declarations are emitted positionally**: the element's own
 *   declaration first (`xmlns:p=` when prefixed, `xmlns=` otherwise), then each
 *   prefixed attribute's declaration immediately *after* that attribute, and only
 *   when its prefix differs from the element's own and is not `xml`.
 * - **The escaping tables differ per node type and are deliberately incomplete.**
 *   Attribute values escape `&`, `<`, `"` — not `>` and not `'`; text nodes escape
 *   `&`, `<`, `>` — not the quotes. Widening either set changes the bytes.
 * - **Empty elements serialize as `<tag />`**, with the space, and non-empty ones
 *   emit their children back to back with no added whitespace or indentation.
 * - `Document.toXML()` prefixes exactly `<?xml version="1.0" encoding="UTF-8"?>\n`.
 *
 * The tree is deliberately mutable — see docs/history/refactor/CHARTER.md, "Explicit mutation boundaries":
 * the immutable-friendly direction applies to the layers above this one, not to the
 * document tree itself.
 *
 * The public API mirrors XOM's Java names on purpose, because the call sites across
 * `mei/`, `msm/` and `mpm/` are transliterated Java. ARCHITECTURE.md §8.7 rules against
 * wrapping that surface behind a slim interface or renaming the module: the attribute
 * ordering and namespace handling above are load-bearing, and the XOM names are what makes a
 * side-by-side comparison with the Java original readable. This file stays internals-only.
 */

import { DOMParser, XMLSerializer, type Document as DomDocument } from '@xmldom/xmldom';
import xpath from 'xpath';
import { elementAt } from '../prelude/seq.js';

export { DOMParser, XMLSerializer };

/**
 * The document that every constructed node's placeholder DOM node is created from.
 *
 * A placeholder is never read by serialization, but creating one still needs an owner
 * document. A per-node document costs one full XML parse per node; sharing one removes all
 * but the first, worth ~30 % of the end-to-end conversion pipeline and 9–33× cheaper node
 * construction (measured; docs/history/refactor/log.md).
 *
 * Sharing is unobservable. `createElement`, `createElementNS`, `createAttribute` and
 * `createTextNode` return unattached nodes and leave the document itself at `<dummy/>`,
 * so no node can see another's existence through it; each still gets its own distinct
 * placeholder, with the same `nodeName`/`localName`/`prefix`/`namespaceURI` and
 * `parentNode === null`. Malformed names still throw the same `DOMException` from the same
 * call, which is why the placeholder is created eagerly rather than on demand: the throw is
 * part of the constructors' observable behavior.
 *
 * The module-level mutable binding, which docs/history/refactor/CHARTER.md's
 * immutable-friendly direction otherwise rules out, is a memo of a constant: assigned once
 * and never reassigned. It is built on first use rather than at module load so that importing
 * this module stays side-effect-free.
 */
let placeholderDocument: DomDocument | null = null;

function placeholderDom(): DomDocument {
  return (placeholderDocument ??= new DOMParser().parseFromString('<dummy/>', 'text/xml'));
}

/**
 * The one DOM node every {@link Attribute} carries, for the same reason and under the same
 * rules as {@link placeholderDom} above.
 *
 * `XomNode` requires a node, but an attribute's is inert: nothing calls `getDomNode()` on one,
 * {@link XomNode.adoptDomNode} is only ever used on `Element` and `Text`, and the two places
 * that do read `_domNode` — {@link XomNode.getParent} and {@link XomNode.detach} — reach it
 * through `parentNode`, which a DOM `Attr` never has. One shared node is therefore
 * indistinguishable from one per instance, and one per instance is not cheap:
 * `createAttribute` runs xmldom's XML-name validation RegExp, which at one call per
 * constructed attribute was ~5% of a render's self time and a matching share of its garbage.
 *
 * Two invariants hold this up, and both are checkable by grep: nothing mutates the node, and
 * nothing compares two attributes by DOM-node identity. An `adoptDomNode` call on an
 * `Attribute` is what would break them.
 */
let sharedAttributeNode: Node | null = null;

function attributePlaceholder(): Node {
  return (sharedAttributeNode ??= placeholderDom().createAttribute(
    'placeholder',
  ) as unknown as Node);
}

/**
 * The namespace an `xml:`-prefixed attribute is in, by XML's own rule — the third and last
 * step of `tree.ts`'s {@link attribute} lookup, and the one that makes `attribute('id', e)`
 * find an `xml:id`. Spelled out inline elsewhere in the port; named here because
 * {@link Element.findAttributeByNamespacePriority} compares against it per attribute.
 */
const XML_NAMESPACE_URI = 'http://www.w3.org/XML/1998/namespace';

/**
 * A fixed collection of nodes, as returned by {@link Element.query} — XOM's `Nodes`.
 *
 * The backing array is taken by reference and never mutated here; `toArray()` hands
 * out a copy so callers cannot reach it.
 */
export class Nodes {
  constructor(private readonly nodes: XomNode[] = []) {}

  size(): number {
    return this.nodes.length;
  }

  get(index: number): XomNode {
    return elementAt(this.nodes, index, 'Nodes.get');
  }

  toArray(): XomNode[] {
    return [...this.nodes];
  }

  /**
   * Iterate the snapshot — see {@link Elements}`[Symbol.iterator]` for why this exists
   * and what it costs.
   */
  [Symbol.iterator](): IterableIterator<XomNode> {
    return this.nodes[Symbol.iterator]();
  }
}

/**
 * Base class for all node types in this layer.
 *
 * Every node carries a `@xmldom/xmldom` node, but that node is *not* the source of
 * truth: it is a placeholder from {@link placeholderDom} and only the parsing paths
 * ({@link Element.wrap}, {@link Element.query}) ever look at a real one. Structure and
 * serialization are driven entirely by this layer's own `_attributes` / `_children`
 * arrays, which is what makes the emitted bytes independent of xmldom's serializer.
 */
export abstract class XomNode {
  protected _domNode: Node;
  /** @internal parent wiring, maintained by Element's child/attribute operations */
  _xomParent: Element | null = null;

  constructor(domNode: Node) {
    this._domNode = domNode;
  }

  getDomNode(): Node {
    return this._domNode;
  }

  /**
   * @internal Swap the constructed placeholder for the real node this layer is wrapping.
   *
   * Only {@link Element.wrap} calls it, and only on nodes it has just built: a node that
   * came out of the parser keeps a live DOM node, which is what lets {@link getParent}
   * and {@link detach} fall back to the DOM for tree positions this layer never wired.
   * It exists because `_domNode` is protected, so `Element` cannot otherwise assign it on an
   * instance of its sibling subclass `Text`.
   */
  adoptDomNode(domNode: Node): void {
    this._domNode = domNode;
  }

  /**
   * The parent recorded by this layer, falling back to the wrapped DOM node's parent
   * for nodes that came straight out of the parser and were never re-wired here.
   */
  getParent(): Element | null {
    if (this._xomParent) return this._xomParent;
    const parent = this._domNode.parentNode;
    if (parent && parent.nodeType === 1) {
      // ELEMENT_NODE
      return Element.wrap(parent as globalThis.Element);
    }
    return null;
  }

  detach(): void {
    if (this._xomParent) {
      this._xomParent.removeChild(this);
      this._xomParent = null;
    } else if (this._domNode.parentNode) {
      this._domNode.parentNode.removeChild(this._domNode);
    }
  }

  abstract getValue(): string;
  abstract toXML(): string;
  abstract copy(): XomNode;
}

/**
 * An XML attribute — XOM's `Attribute`.
 *
 * An attribute knows its own namespace URI and prefix; it does not consult the
 * element it hangs on. {@link Element.toXML} relies on that when it decides whether a
 * prefixed attribute needs its own `xmlns:` declaration emitted alongside it.
 */
export class Attribute extends XomNode {
  private readonly _localName: string;
  private _value: string;
  private readonly _namespaceURI: string;
  private readonly _namespacePrefix: string;
  /**
   * `prefix:local`, or just `local` when there is no prefix. Stored rather than built per
   * call because {@link Element.getAttribute} compares against it on every miss, where the
   * template literal was a measurable share of the render's garbage.
   */
  private readonly _qualifiedName: string;

  /**
   * Two call forms, both XOM's: `(name, value)` and `(name, namespaceURI, value)`, selected
   * at runtime by whether the third argument is present.
   */
  constructor(name: string, valueOrNs: string, value?: string) {
    // The placeholder is shared and inert; see {@link attributePlaceholder}. Attributes are
    // attached to elements later, through this layer's own `_attributes` array.
    super(attributePlaceholder());

    const split = splitQualifiedName(name);
    this._namespacePrefix = split.prefix;
    this._localName = split.localName;

    if (value !== undefined) {
      this._namespaceURI = valueOrNs;
      this._value = value;
    } else {
      this._namespaceURI = '';
      this._value = valueOrNs;
    }

    this._qualifiedName = this._namespacePrefix
      ? `${this._namespacePrefix}:${this._localName}`
      : this._localName;
  }

  getLocalName(): string {
    return this._localName;
  }

  getQualifiedName(): string {
    return this._qualifiedName;
  }

  getValue(): string {
    return this._value;
  }

  setValue(value: string): void {
    this._value = value;
  }

  getNamespaceURI(): string {
    return this._namespaceURI;
  }

  getNamespacePrefix(): string {
    return this._namespacePrefix;
  }

  /**
   * Serialize as `name="value"`, without a leading space — {@link Element.toXML}
   * supplies the separator.
   *
   * Byte-critical: the escape set is `&`, `<`, `"` in exactly that order (`&` first,
   * so the ampersands introduced by the later replacements are not re-escaped). `>`
   * and `'` are intentionally left raw. Do not extend or reorder this chain.
   */
  toXML(): string {
    const name = this.getQualifiedName();
    const escapedValue = this._value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/"/g, '&quot;');
    return `${name}="${escapedValue}"`;
  }

  copy(): Attribute {
    if (this._namespaceURI) {
      return new Attribute(this.getQualifiedName(), this._namespaceURI, this._value);
    }
    return new Attribute(this.getQualifiedName(), this._value);
  }

  /**
   * XOM parity: detaching an attribute removes it from its parent element's attribute list,
   * where the base implementation searches child nodes only and would leave it in the
   * serialized XML.
   *
   * There is deliberately no DOM fallback for the parentless case: an attribute that sits on
   * an element always has `_xomParent` ({@link Element.addAttribute} sets it for constructed
   * attributes, {@link Element.wrap} for parsed ones), so one without it is held by no
   * element and detaching it is a no-op by definition.
   */
  override detach(): void {
    if (this._xomParent) {
      this._xomParent.removeAttribute(this);
    }
  }
}

/**
 * A text node — XOM's `Text`. The value is held here and mirrored onto the wrapped
 * DOM node so that code reading the DOM directly sees the same string.
 */
export class Text extends XomNode {
  private _value: string;

  constructor(value: string) {
    const textNode = placeholderDom().createTextNode(value);
    super(textNode as unknown as Node);
    this._value = value;
  }

  getValue(): string {
    return this._value;
  }

  setValue(value: string): void {
    this._value = value;
    (this._domNode as globalThis.Text).data = value;
  }

  /**
   * Byte-critical: text content escapes `&`, `<`, `>` (again `&` first), and leaves
   * both quote characters raw — a different set from {@link Attribute.toXML}. The
   * asymmetry is deliberate; do not unify the two.
   */
  toXML(): string {
    return this._value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  copy(): Text {
    return new Text(this._value);
  }
}

/**
 * A fixed collection of child elements — XOM's `Elements`. Same contract as
 * {@link Nodes}, narrowed to elements.
 */
export class Elements {
  constructor(private readonly elements: Element[] = []) {}

  size(): number {
    return this.elements.length;
  }

  get(index: number): Element {
    return elementAt(this.elements, index, 'Elements.get');
  }

  toArray(): Element[] {
    return [...this.elements];
  }

  /**
   * Iterate the snapshot directly — no copy, unlike `toArray()`, which copies per call on
   * paths that run per element of a score.
   *
   * The collection is already a *fixed* snapshot (the constructor takes the array by
   * reference and nothing mutates it), so handing out its iterator exposes no more than `get`
   * does, and removing a child from the parent element mid-walk does not disturb the walk.
   */
  [Symbol.iterator](): IterableIterator<Element> {
    return this.elements[Symbol.iterator]();
  }
}

/**
 * Walk a path of child-element indices down from `root`. Indices count element children only,
 * exactly as `getChildElements()` reports them; a path that leaves the tree yields null.
 */
function descendChildElementPath(root: Element, path: readonly number[]): Element | null {
  let result = root;
  for (const index of path) {
    const childElements = result.getChildElements();
    if (index >= childElements.size()) return null;
    result = childElements.get(index);
  }
  return result;
}

/**
 * An XML element — XOM's `Element`, and the most heavily used type in the port.
 *
 * Children and attributes live in plain arrays whose order *is* the document order
 * and the serialization order; see the byte-compatibility contract at the top of this
 * file before touching either one.
 */
export class Element extends XomNode {
  private _localName: string;
  private _namespaceURI: string;
  private _namespacePrefix: string;
  private _attributes: Attribute[] = [];
  private _children: XomNode[] = [];

  /**
   * Memoised node → position map for {@link indexOf}, built lazily and dropped on any
   * structural change (see {@link invalidateChildIndex}). It exists because the sibling
   * walkers in `xml/tree.ts` and `msm/Msm.ts` ask for the current node's position on every
   * step, so a linear `Array.indexOf` made every full-score walk O(n²).
   *
   * Equivalence with `Array.prototype.indexOf`, which this must not drift from: the map is
   * filled front-to-back and an already-present key is never overwritten, so a node that
   * (illegally) appears twice in `_children` still reports its *first* position, exactly as
   * `indexOf` does. `appendChild` extends the map in place for the same reason — appending
   * can only ever create a later duplicate, which `indexOf` would ignore too.
   */
  private _childIndex: Map<XomNode, number> | null = null;

  constructor(name: string, namespaceURI?: string) {
    const doc = placeholderDom();
    let elem: globalThis.Element;

    const { prefix, localName } = splitQualifiedName(name);

    if (namespaceURI) {
      elem = doc.createElementNS(namespaceURI, name) as unknown as globalThis.Element;
    } else {
      elem = doc.createElement(localName) as unknown as globalThis.Element;
    }

    super(elem);
    this._localName = localName;
    this._namespaceURI = namespaceURI || '';
    this._namespacePrefix = prefix;
  }

  /**
   * Recursively wrap a parsed DOM element as a tree of this layer's nodes.
   *
   * Only elements and text nodes are carried over — comments, processing
   * instructions and CDATA sections are dropped, so a parse/serialize round trip is
   * lossy for them by design.
   *
   * `xmlns` / `xmlns:*` attributes are skipped rather than stored: namespace
   * declarations are re-derived at serialization time from each node's own prefix and
   * URI, so keeping them would emit every declaration twice.
   */
  static wrap(domElement: globalThis.Element): Element {
    const localName = domElement.localName || domElement.nodeName;
    const ns = domElement.namespaceURI || '';
    const prefix = domElement.prefix || '';
    const qualifiedName = prefix ? `${prefix}:${localName}` : localName;
    const elem = new Element(qualifiedName, ns || undefined);
    elem.adoptDomNode(domElement);
    // Overwrite what the constructor derived from `qualifiedName`: its own parse splits on
    // the first colon and drops any further segment, whereas the DOM has already told us the
    // authoritative prefix/local-name split.
    elem._localName = localName;
    elem._namespaceURI = ns;
    elem._namespacePrefix = prefix;

    // Array.from snapshots the live NamedNodeMap in index order; nothing below mutates
    // domElement, so the snapshot and the map agree.
    elem._attributes = [];
    for (const attr of Array.from(domElement.attributes)) {
      const attrNs = attr.namespaceURI || '';
      const attrName = attr.name;
      if (attrName.startsWith('xmlns')) continue;
      const wrapped = attrNs
        ? new Attribute(attrName, attrNs, attr.value)
        : new Attribute(attrName, attr.value);
      // Parented like the child nodes below, and for the same reason: `_xomParent` is the
      // only route {@link Attribute.detach} has back to the list it must remove itself from.
      // Assigned directly rather than via `addAttribute`, which would additionally dedupe by
      // local name and could drop a parsed attribute.
      wrapped._xomParent = elem;
      elem._attributes.push(wrapped);
    }

    elem._children = [];
    for (const child of Array.from(domElement.childNodes)) {
      if (child.nodeType === 1) {
        // ELEMENT_NODE
        const wrappedChild = Element.wrap(child as globalThis.Element);
        wrappedChild._xomParent = elem;
        elem._children.push(wrappedChild);
      } else if (child.nodeType === 3) {
        // TEXT_NODE
        const text = new Text((child as globalThis.Text).data);
        text.adoptDomNode(child);
        text._xomParent = elem;
        elem._children.push(text);
      }
    }
    elem.invalidateChildIndex();

    return elem;
  }

  getLocalName(): string {
    return this._localName;
  }

  getQualifiedName(): string {
    return this._namespacePrefix ? `${this._namespacePrefix}:${this._localName}` : this._localName;
  }

  getNamespaceURI(): string {
    return this._namespaceURI;
  }

  getNamespacePrefix(): string {
    return this._namespacePrefix;
  }

  setNamespacePrefix(prefix: string): void {
    this._namespacePrefix = prefix;
  }

  // --- Attribute operations ---

  getAttribute(name: string, namespaceURI?: string): Attribute | null {
    // Split on the namespace rather than testing it per attribute, so that the unnamespaced
    // arm can compare against the stored {@link Attribute.getQualifiedName}. This is the
    // most-called method in the port.
    const attributes = this._attributes;
    if (namespaceURI !== undefined) {
      for (const attr of attributes)
        if (attr.getLocalName() === name && attr.getNamespaceURI() === namespaceURI) return attr;
      return null;
    }
    for (const attr of attributes)
      if (attr.getLocalName() === name || attr.getQualifiedName() === name) return attr;
    return null;
  }

  /**
   * @internal The single-scan form of `tree.ts`'s {@link attribute}, which is its only caller.
   *
   * That function's three `getAttribute(name, ns)` calls are three full passes over this same
   * array, alike in matching `getLocalName() === name` and differing only in the namespace
   * they accept. One pass that keeps the best-priority hit answers identically: priority runs
   * no-namespace → this element's own → XML, and within one priority the first in insertion
   * order wins, which is exactly what three ordered scans produce. A miss, the case that paid
   * for all three passes, now costs one.
   *
   * The priority order is `attribute`'s to define and is documented there; this method must be
   * read together with it, and reordering the returns below is the same byte-visible change as
   * reordering the lookups there.
   */
  findAttributeByNamespacePriority(name: string): Attribute | null {
    let unnamespaced: Attribute | null = null;
    let ownNamespace: Attribute | null = null;
    let xmlNamespace: Attribute | null = null;
    // Read lazily: an element with no namespaced attribute of this name never needs it.
    let ownNamespaceURI: string | null = null;

    for (const attr of this._attributes) {
      if (attr.getLocalName() !== name) continue;
      const ns = attr.getNamespaceURI();
      if (ns === '') {
        unnamespaced ??= attr;
        continue;
      }
      ownNamespaceURI ??= this.getNamespaceURI();
      if (ns === ownNamespaceURI) ownNamespace ??= attr;
      else if (ns === XML_NAMESPACE_URI) xmlNamespace ??= attr;
    }

    return unnamespaced ?? ownNamespace ?? xmlNamespace;
  }

  getAttributeValue(name: string, namespaceURI?: string): string | null {
    const attr = this.getAttribute(name, namespaceURI);
    return attr ? attr.getValue() : null;
  }

  getAttributeCount(): number {
    return this._attributes.length;
  }

  /**
   * Append an attribute, replacing any same-named one first.
   *
   * Byte-critical: the replacement is a remove-then-append, so re-setting an existing
   * attribute moves it to the END of the serialized attribute list. Several call sites
   * depend on the resulting order matching the Java reference output.
   */
  addAttribute(attr: Attribute): void {
    const existing = this.getAttribute(attr.getLocalName(), attr.getNamespaceURI() || undefined);
    if (existing) {
      this.removeAttribute(existing);
    }
    attr._xomParent = this;
    this._attributes.push(attr);
  }

  /**
   * Remove an attribute by identity, falling back to a name+namespace match for
   * callers holding an equivalent but distinct instance.
   *
   * Note the asymmetry, which is preserved on purpose: only the identity path clears
   * the removed attribute's parent pointer.
   */
  removeAttribute(attr: Attribute): void {
    const idx = this._attributes.indexOf(attr);
    if (idx !== -1) {
      attr._xomParent = null;
      this._attributes.splice(idx, 1);
      return;
    }

    const byName = this._attributes.findIndex(
      (candidate) =>
        candidate.getLocalName() === attr.getLocalName() &&
        candidate.getNamespaceURI() === attr.getNamespaceURI(),
    );
    if (byName !== -1) {
      this._attributes.splice(byName, 1);
    }
  }

  // --- Child operations ---

  appendChild(child: XomNode | string): void {
    if (typeof child === 'string') {
      const text = new Text(child);
      text._xomParent = this;
      this._children.push(text);
      this.noteAppended(text);
    } else {
      if (child instanceof Element || child instanceof Text) {
        const parent = child._xomParent;
        if (parent) {
          parent.removeChild(child);
        }
      }
      child._xomParent = this;
      this._children.push(child);
      this.noteAppended(child);
    }
  }

  /** Extend {@link _childIndex} by one appended node instead of dropping the whole memo. */
  private noteAppended(child: XomNode): void {
    const index = this._childIndex;
    if (index !== null && !index.has(child)) index.set(child, this._children.length - 1);
  }

  insertChild(child: XomNode | string, position: number): void {
    // An insert at (or past) the end is an append, and appends leave every existing position
    // untouched — so the memo survives, extended by one. That is the case `dateMap.addToMap`
    // hits on almost every call, where dropping it would make the next `indexOf` rebuild it.
    const isAppend = position >= this._children.length;
    if (typeof child === 'string') {
      const text = new Text(child);
      text._xomParent = this;
      this._children.splice(position, 0, text);
      if (isAppend) this.noteAppended(text);
      else this.invalidateChildIndex();
    } else {
      child._xomParent = this;
      this._children.splice(position, 0, child);
      if (isAppend) this.noteAppended(child);
      else this.invalidateChildIndex();
    }
  }

  removeChild(child: XomNode): boolean {
    // Deliberately `Array.prototype.indexOf` and not the memoised {@link indexOf}: the
    // splice below invalidates the memo anyway, so building one here would cost a full
    // pass over the child list on every removal — measurably worse than the linear scan.
    const idx = this._children.indexOf(child);
    if (idx !== -1) {
      this._children.splice(idx, 1);
      this.invalidateChildIndex();
      child._xomParent = null;
      return true;
    }
    return false;
  }

  removeChildAt(index: number): XomNode {
    // Read before splicing, so the bounds check is the reader's rather than a test on the
    // splice result, which is typed `XomNode` while `noUncheckedIndexedAccess` is off.
    const removed = elementAt(this._children, index, 'Element.removeChildAt');
    this._children.splice(index, 1);
    this.invalidateChildIndex();
    removed._xomParent = null;
    return removed;
  }

  /**
   * Move `order`'s nodes to the front of the child list, in that order, leaving every
   * other child after them in its existing relative order.
   *
   * This is exactly what a remove-then-insert-at-`i` loop over `order` produces, without that
   * loop's quadratic cost — `GenericMap` re-orders a whole `<score>` on every parse and after
   * every re-sort.
   *
   * The two boundary cases the loop had are kept:
   *
   * - a node in `order` that is not currently a child is adopted, exactly as the loop's
   *   no-op `removeChild` followed by a real `insertChild` adopted it;
   * - if `order` names the same node twice the loop's result is not a permutation of the
   *   child list at all, so that case is handed back to the loop rather than guessed at.
   */
  reorderChildren(order: readonly XomNode[]): void {
    const ordered = new Set(order);
    if (ordered.size !== order.length) {
      // Duplicate entries: fall back to the literal loop this replaces.
      for (const [i, node] of order.entries()) {
        this.removeChild(node);
        this.insertChild(node, i);
      }
      return;
    }

    const rest: XomNode[] = [];
    for (const child of this._children) if (!ordered.has(child)) rest.push(child);

    this._children = order.concat(rest);
    for (const child of order) child._xomParent = this;
    this.invalidateChildIndex();
  }

  removeChildren(): void {
    for (const child of this._children) {
      child._xomParent = null;
    }
    this._children = [];
    this.invalidateChildIndex();
  }

  replaceChild(oldChild: XomNode, newChild: XomNode): void {
    const idx = this._children.indexOf(oldChild);
    if (idx !== -1) {
      oldChild._xomParent = null;
      newChild._xomParent = this;
      this._children[idx] = newChild;
      this.invalidateChildIndex();
    }
  }

  getChild(index: number): XomNode {
    return elementAt(this._children, index, 'Element.getChild');
  }

  getChildCount(): number {
    return this._children.length;
  }

  /**
   * Child elements in document order; text children are skipped.
   *
   * Quirk, preserved deliberately: `namespaceURI` only ever narrows a *named* lookup.
   * Called without `name` this returns every child element, whatever namespace it is
   * in, even if a `namespaceURI` was passed.
   */
  getChildElements(name?: string, namespaceURI?: string): Elements {
    const elements: Element[] = [];
    for (const child of this._children) {
      if (!(child instanceof Element)) continue;
      const matches =
        name === undefined ||
        (child.getLocalName() === name &&
          (namespaceURI === undefined || child.getNamespaceURI() === namespaceURI));
      if (matches) elements.push(child);
    }
    return new Elements(elements);
  }

  getFirstChildElement(name: string, namespaceURI?: string): Element | null {
    for (const child of this._children) {
      if (child instanceof Element && child.getLocalName() === name) {
        if (namespaceURI === undefined || child.getNamespaceURI() === namespaceURI) {
          return child;
        }
      }
    }
    return null;
  }

  /** Drop the {@link _childIndex} memo. Call after every write to `_children`. */
  private invalidateChildIndex(): void {
    this._childIndex = null;
  }

  indexOf(child: XomNode): number {
    let index = this._childIndex;
    if (index === null) {
      index = new Map();
      for (const [i, child] of this._children.entries()) {
        if (!index.has(child)) index.set(child, i);
      }
      this._childIndex = index;
    }
    const found = index.get(child);
    return found === undefined ? -1 : found;
  }

  getValue(): string {
    let result = '';
    for (const child of this._children) {
      result += child.getValue();
    }
    return result;
  }

  /**
   * Execute an XPath query against this element — meico's main tool for navigating
   * the tree, so most call sites in `mei/`, `msm/` and `mpm/` land here.
   *
   * The xpath library needs a real DOM, and this layer's nodes are only loosely
   * attached to the placeholder DOM nodes they wrap. So the subtree is serialized and
   * re-parsed, the query runs against that throwaway copy, and every hit is mapped
   * back onto this tree by position. Consequences worth knowing: results are only as
   * faithful as `toXML()`, matched text nodes come back as fresh {@link Text}
   * instances rather than the originals, and a malformed expression yields an empty
   * result instead of throwing.
   */
  query(xpathExpr: string): Nodes {
    const xmlStr = this.toXML();
    const doc = new DOMParser().parseFromString(xmlStr, 'text/xml');
    const contextNode = doc.documentElement;
    // `toXML()` always writes at least this element, so the re-parse always has a root and
    // this branch is unreachable from any document this port can build. It answers what the
    // rest of the method answers for input it cannot handle — an empty node set, rather than
    // a `TypeError` from inside the xpath library.
    if (contextNode === null) return new Nodes([]);

    const select = xpath.useNamespaces(this.collectNamespaces());

    try {
      const result = select(xpathExpr, contextNode as unknown as Node);

      const xomNodes: XomNode[] = [];
      if (Array.isArray(result)) {
        for (const node of result) {
          if (xpath.isElement(node)) {
            const mapped = this.findCorrespondingElement(node);
            if (mapped) xomNodes.push(mapped);
          } else if (xpath.isAttribute(node)) {
            const ownerElem = node.ownerElement;
            if (ownerElem) {
              const mappedElem = this.findCorrespondingElement(ownerElem);
              if (mappedElem) {
                const attr = mappedElem.getAttribute(
                  node.localName || node.nodeName,
                  node.namespaceURI || undefined,
                );
                if (attr) xomNodes.push(attr);
              }
            }
          } else if (xpath.isTextNode(node)) {
            xomNodes.push(new Text(node.data || node.nodeValue || ''));
          }
        }
      }

      return new Nodes(xomNodes);
    } catch {
      return new Nodes([]);
    }
  }

  /**
   * Prefix-to-URI bindings for the XPath resolver, gathered from this whole subtree.
   *
   * Flat and last-one-wins: a prefix rebound to a different URI deeper in the tree
   * overwrites the outer binding for the entire query. Fine for the documents meico
   * handles, which bind each prefix once at the root.
   */
  private collectNamespaces(): Record<string, string> {
    const nsMap: Record<string, string> = {};
    nsMap['xml'] = 'http://www.w3.org/XML/1998/namespace';
    this.collectNamespacesInto(this, nsMap);
    return nsMap;
  }

  private collectNamespacesInto(elem: Element, nsMap: Record<string, string>): void {
    if (elem._namespacePrefix && elem._namespaceURI) {
      nsMap[elem._namespacePrefix] = elem._namespaceURI;
    }
    for (const attr of elem._attributes) {
      if (attr.getNamespacePrefix() && attr.getNamespaceURI()) {
        nsMap[attr.getNamespacePrefix()] = attr.getNamespaceURI();
      }
    }
    for (const child of elem._children) {
      if (child instanceof Element) {
        this.collectNamespacesInto(child, nsMap);
      }
    }
  }

  /**
   * Find the counterpart in this tree of a DOM element from the re-parsed copy.
   *
   * The copy was produced by `toXML()` moments earlier and is therefore structurally
   * identical, so the path of child-element indices from the root identifies the
   * counterpart uniquely. Text nodes are not counted on either side, which is what
   * keeps the DOM indices and `getChildElements()` indices in step.
   */
  private findCorrespondingElement(domNode: globalThis.Element): Element | null {
    // `current` starts at a node and is only ever reassigned to a parent the loop has already
    // tested, so it is never null — the walk stops at the parent, not at the node.
    const path: number[] = [];
    let current: globalThis.Node = domNode;
    while (current.parentNode && current.parentNode.nodeType === 1) {
      const parent: globalThis.Node = current.parentNode;
      let index = 0;
      // Array.from snapshots the live NodeList in index order; the copy is not being
      // mutated, so counting over the snapshot sees exactly the same siblings.
      for (const sibling of Array.from(parent.childNodes)) {
        if (sibling === current) break;
        if (sibling.nodeType === 1) index++;
      }
      path.unshift(index);
      current = parent;
    }

    return descendChildElementPath(this, path);
  }

  /**
   * Serialize this element and everything under it.
   *
   * This method IS the byte-compatibility contract documented at the top of the file —
   * emission order and the ` />` spelling of empty elements are fixed by the Java reference
   * output the integration suite compares against.
   *
   * The `xmlns` rule is the one XML specifies: a default-namespace declaration is emitted only
   * when this element's namespace differs from the one it inherits, and children are
   * serialized against whatever this element leaves in scope. Three consequences:
   *
   * - the root of a namespaced document declares, since it inherits nothing;
   * - a child in its parent's namespace declares nothing;
   * - a child with *no* namespace inside a namespaced parent emits `xmlns=""`, undeclaring
   *   it. That is required: without it the child would silently inherit the parent's
   *   namespace on reparse.
   *
   * A prefixed element declares its own prefix and leaves the default namespace in scope
   * untouched, so its children inherit what it inherited.
   *
   * @param inheritedDefault the default namespace in scope at this element, `''` at the root
   */
  toXML(inheritedDefault = ''): string {
    let xml = `<${this.getQualifiedName()}`;
    let defaultForChildren = inheritedDefault;

    if (this._namespacePrefix) {
      if (this._namespaceURI) {
        xml += ` xmlns:${this._namespacePrefix}="${this._namespaceURI}"`;
      }
    } else if (this._namespaceURI !== inheritedDefault) {
      xml += ` xmlns="${this._namespaceURI}"`;
      defaultForChildren = this._namespaceURI;
    }

    for (const attr of this._attributes) {
      xml += ` ${attr.toXML()}`;
      // A prefixed attribute carries its own namespace declaration.
      if (
        attr.getNamespacePrefix() &&
        attr.getNamespaceURI() &&
        attr.getNamespacePrefix() !== this._namespacePrefix &&
        attr.getNamespacePrefix() !== 'xml'
      ) {
        xml += ` xmlns:${attr.getNamespacePrefix()}="${attr.getNamespaceURI()}"`;
      }
    }

    if (this._children.length === 0) {
      xml += ' />';
    } else {
      xml += '>';
      for (const child of this._children) {
        xml += child instanceof Element ? child.toXML(defaultForChildren) : child.toXML();
      }
      xml += `</${this.getQualifiedName()}>`;
    }

    return xml;
  }

  /**
   * Deep copy, detached: attributes then children are cloned in order, so the copy
   * serializes identically, but it has no parent and shares no node with the original.
   */
  copy(): Element {
    const clone = new Element(this.getQualifiedName(), this._namespaceURI || undefined);
    for (const attr of this._attributes) {
      clone.addAttribute(attr.copy());
    }
    for (const child of this._children) {
      clone.appendChild(child.copy());
    }
    return clone;
  }
}

/**
 * An XML document — XOM's `Document`. Little more than a root element plus the XML
 * declaration that {@link Document.toXML} puts in front of it.
 */
export class Document {
  private _rootElement: Element;

  constructor(rootElement: Element, declaration = XML_DECLARATION) {
    this._rootElement = rootElement;
    this._declaration = declaration;
  }

  getRootElement(): Element {
    return this._rootElement;
  }

  setRootElement(element: Element): void {
    this._rootElement = element;
  }

  /**
   * The declaration this document was parsed with, or XOM's own default.
   *
   * Java's XOM writes `<?xml version="1.0"?>` with no encoding — every Java-generated
   * reference under `tests/integration/fixtures/` begins with exactly that. A parsed document
   * round-trips the declaration it arrived with; a constructed one gets XOM's default, which
   * is what makes generated MSM and MPM match the reference.
   */
  private readonly _declaration: string;

  toXML(): string {
    // The trailing newline is Java's: XOM's `Serializer` ends the document with one, and all
    // 32 reference fixtures carry exactly one. This is the whole-document spelling, which is
    // what `XmlBase.toXML` and the reference comparison use; the byte-compared public API path
    // serialises through `getRootElement().toXML()` (RULE F2a) and is unaffected.
    return `${this._declaration}\n${this._rootElement.toXML()}\n`;
  }

  copy(): Document {
    return new Document(this._rootElement.copy(), this._declaration);
  }
}

/**
 * Split a qualified name into its prefix and local part, as `name.split(':')` taking elements
 * 0 and 1 does.
 *
 * The truncation is deliberate: `a:b:c` yields prefix `a` and local name `b`, losing `:c`.
 * Well-formed XML has at most one colon so it only bites on malformed input, and it is kept
 * for parity.
 *
 * Written with `indexOf`/`slice` rather than `split` plus indices because `parts[1]` is
 * `string | undefined` under `noUncheckedIndexedAccess` while testing it for `undefined` is an
 * impossible comparison to `no-unnecessary-condition` with that flag off. Not indexing at all
 * is the only formulation clean under both.
 */
function splitQualifiedName(name: string): { readonly prefix: string; readonly localName: string } {
  const firstColon = name.indexOf(':');
  if (firstColon < 0) return { prefix: '', localName: name };
  const secondColon = name.indexOf(':', firstColon + 1);
  return {
    prefix: name.slice(0, firstColon),
    localName: name.slice(firstColon + 1, secondColon < 0 ? undefined : secondColon),
  };
}

/**
 * What XOM writes when a document has no declaration of its own — and what every
 * Java-generated reference fixture begins with. Notably NOT `encoding="UTF-8"`.
 */
const XML_DECLARATION = '<?xml version="1.0"?>';

/** Captures a leading declaration so a parsed document can be written back as it arrived. */
const XML_DECLARATION_PATTERN = /^\s*<\?xml[^?]*\?>/;

/**
 * U+FEFF, the character a UTF-8 byte-order mark (`EF BB BF`) decodes to. Only a LEADING one is
 * a signature: anywhere else U+FEFF is ZERO WIDTH NO-BREAK SPACE and is ordinary content.
 */
const BYTE_ORDER_MARK = '﻿';

/**
 * Drop a leading byte-order mark, so that a BOM'd document parses instead of throwing.
 *
 * This restores Java parity rather than diverging from it. Every Java entry point hands
 * XOM *bytes* — `builder.build(new ByteArrayInputStream(xml.getBytes(UTF_8)))`
 * (`meico/xml/XmlBase.java:99`, `meico/mei/Helper.java:1042,1061`) or `builder.build(file)`
 * (`XmlBase.java:162`) — and XOM parses those through a SAX/Xerces `XMLReader`, for which a
 * leading `EF BB BF` is the UTF-8 encoding signature of XML 1.0 §4.3.3 / Appendix F and is
 * consumed before the document entity begins. Java therefore accepts a BOM'd file silently.
 *
 * This port parses a *decoded string* instead (`DOMParser.parseFromString`), by which point
 * the signature has already become a U+FEFF character sitting in front of the XML
 * declaration, which `@xmldom/xmldom` rejects outright. The divergence is an artefact of
 * parsing characters where Java parses bytes, so stripping the mark here is what makes the
 * two agree. Not a hypothetical: 3 of the 6 encodings in the MPM format's own sample corpus
 * carry a BOM, including both multi-performance documents.
 */
function stripByteOrderMark(xml: string): string {
  return xml.startsWith(BYTE_ORDER_MARK) ? xml.slice(BYTE_ORDER_MARK.length) : xml;
}

/**
 * XML parser — XOM's `Builder`. Parses a string with `@xmldom/xmldom` and hands the
 * result to {@link Element.wrap}, which is where the DOM stops being authoritative.
 *
 * This is the one choke point every document in the port passes through — `XmlBase`'s
 * constructor for the `Mei`/`Msm`/`Mpm` classes (`XmlBase.ts:56-59`), and the expression
 * layer's two raw parses (`expression/mpmDocument.ts:52`, `expression/msmFacts.ts:80`),
 * which deliberately bypass those classes. Input normalization therefore belongs here and
 * nowhere else: anything applied further up would cover one path and miss the others.
 */
export class Builder {
  build(xml: string): Document {
    const parser = new DOMParser();
    const dom = parser.parseFromString(stripByteOrderMark(xml), 'text/xml');

    const errorNode = dom.getElementsByTagName('parsererror');
    // `.item(0)` is typed `Element | null` whichever way the index flags are set; `[0]` is
    // not, so the null test here is honest under both.
    const firstError = errorNode.item(0);
    if (firstError !== null) {
      throw new ParsingException(`XML parsing error: ${firstError.textContent || 'Unknown error'}`);
    }

    const rootElement = dom.documentElement;
    if (!rootElement) {
      throw new ParsingException('No root element found');
    }

    // Carry the source's own declaration so the document writes back as it arrived. A source
    // with no declaration gets XOM's default, which is also what a constructed document gets.
    const declared = XML_DECLARATION_PATTERN.exec(stripByteOrderMark(xml));
    return new Document(
      Element.wrap(rootElement as unknown as globalThis.Element),
      declared === null ? XML_DECLARATION : declared[0].trimStart(),
    );
  }
}

/** Exception thrown during XML parsing */
export class ParsingException extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ParsingException';
  }
}

/** Exception for XML validity errors (non-fatal - document still produced) */
export class ValidityException extends ParsingException {
  private readonly _document: Document | null;

  constructor(message: string, document?: Document) {
    super(message);
    this.name = 'ValidityException';
    this._document = document || null;
  }

  getDocument(): Document | null {
    return this._document;
  }
}
