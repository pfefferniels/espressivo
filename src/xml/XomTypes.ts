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
 * `mei/`, `msm/` and `mpm/` are transliterated Java. T17 considered reworking that
 * surface — wrapping it behind a slim interface, or renaming the module to `dom.ts` —
 * and ruled against both (ARCHITECTURE.md §8.7): the attribute ordering and namespace
 * handling above are load-bearing, and the XOM names are what makes a side-by-side
 * comparison with the Java original readable. This file stays internals-only.
 */

import { DOMParser, XMLSerializer, type Document as DomDocument } from '@xmldom/xmldom';
import xpath from 'xpath';

// Re-export for convenience
export { DOMParser, XMLSerializer };

/**
 * The document that every constructed node's placeholder DOM node is created from.
 *
 * A placeholder is never read by serialization, but creating one still needs an owner
 * document. Until T17 each `Element`, `Attribute` and `Text` constructor built its own
 * by parsing `<dummy/>`, so constructing a document cost one full XML parse *per node* —
 * 48 037 parses to convert the 16 MEI fixtures. One shared document removes all but the
 * first, which is worth ~30 % of the end-to-end conversion pipeline and makes node
 * construction 9–33× cheaper (measured; docs/history/refactor/log.md's T17 entry).
 *
 * Sharing is unobservable. `createElement`, `createElementNS`, `createAttribute` and
 * `createTextNode` return unattached nodes and leave the document itself at `<dummy/>`,
 * so no node can see another's existence through it; each still gets its own distinct
 * placeholder, with the same `nodeName`/`localName`/`prefix`/`namespaceURI` and the same
 * `parentNode === null` as before. Malformed names still throw the same `DOMException`
 * from the same call, which is why the placeholder is still created eagerly rather than
 * on demand: the throw is part of the constructors' observable behavior.
 *
 * The one thing this *is* — a module-level mutable binding, which docs/history/refactor/CHARTER.md's
 * immutable-friendly direction otherwise rules out — is a memo of a constant, assigned
 * once and never reassigned. It is built on first use rather than at module load so that
 * importing this module stays side-effect-free (T18's load-order work depends on that).
 */
let placeholderDocument: DomDocument | null = null;

function placeholderDom(): DomDocument {
  return (placeholderDocument ??= new DOMParser().parseFromString('<dummy/>', 'text/xml'));
}

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
    return this.nodes[index];
  }

  toArray(): XomNode[] {
    return [...this.nodes];
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
   * It exists because `_domNode` is protected, so `Element` cannot assign it on an
   * instance of its sibling subclass `Text` — the previous workaround was a bracket
   * access (`text['_domNode'] = child`) that documented the missing seam instead of
   * providing it.
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
   * `prefix:local`, or just `local` when there is no prefix. Computed once because all
   * three inputs are readonly, and because {@link Element.getAttribute} compares against
   * it on every miss — building the string there allocated once per attribute per lookup
   * and was a measurable share of the render's garbage.
   */
  private readonly _qualifiedName: string;

  /**
   * Two call forms, both XOM's: `(name, value)` and `(name, namespaceURI, value)`.
   *
   * They were two overloads until T17. One signature accepts exactly the same calls —
   * every parameter is a `string`, so the overloads differed in arity alone — and the
   * form is selected at runtime by whether the third argument is present.
   */
  constructor(name: string, valueOrNs: string, value?: string) {
    // Create a placeholder node - attributes are attached to elements later
    const attr = placeholderDom().createAttribute(name);
    super(attr as unknown as Node);

    // `prefix:local` splits on the first colon, and a name carrying more than one
    // colon loses everything after the second segment. Well-formed XML has at most
    // one colon, so this only ever bites on malformed input; kept as-is for parity.
    const parts = name.split(':');
    this._namespacePrefix = parts.length > 1 ? parts[0] : '';
    this._localName = parts.length > 1 ? parts[1] : name;

    if (value !== undefined) {
      // 3-arg constructor: name, namespace, value
      this._namespaceURI = valueOrNs;
      this._value = value;
    } else {
      // 2-arg constructor: name, value
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
   * XOM parity: detaching an attribute must remove it from its parent
   * element's attribute list (the base implementation only searches child
   * nodes, which left detached attributes in the serialized XML).
   *
   * There is deliberately no DOM fallback for the parentless case, because an attribute
   * that sits on an element always has `_xomParent`: {@link Element.addAttribute} sets it
   * for constructed attributes and {@link Element.wrap} for parsed ones. An attribute
   * without it is one no element holds, and detaching it is a no-op by definition.
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
    return this.elements[index];
  }

  toArray(): Element[] {
    return [...this.elements];
  }
}

/**
 * Walk a path of child-element indices down from `root`.
 *
 * Split out of {@link Element.findCorrespondingElement}, whose own job is building the
 * path. Indices count element children only, exactly as `getChildElements()` reports
 * them; a path that leaves the tree yields null.
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
   * structural change (see {@link invalidateChildIndex}).
   *
   * Why it exists: the sibling walkers in `xml/tree.ts` and `msm/Msm.ts` step through a
   * child list one element at a time and ask for the current node's position on every
   * step, so a linear `Array.indexOf` turned every full-score walk into an O(n²) one.
   *
   * Equivalence with `Array.prototype.indexOf`, which this must not drift from: the map is
   * filled front-to-back and an already-present key is never overwritten, so a node that
   * (illegally) appears twice in `_children` still reports its **first** position, exactly
   * as `indexOf` does. `appendChild` extends the map in place for the same reason —
   * appending can only ever create a *later* duplicate, which `indexOf` would ignore too.
   */
  private _childIndex: Map<XomNode, number> | null = null;

  constructor(name: string, namespaceURI?: string) {
    const doc = placeholderDom();
    let elem: globalThis.Element;

    const parts = name.split(':');
    const localName = parts.length > 1 ? parts[1] : name;
    const prefix = parts.length > 1 ? parts[0] : '';

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
    // Restate what the constructor derived from `qualifiedName`: its own parse splits
    // on the first colon and drops any further segment, whereas the DOM has already
    // told us the authoritative prefix/local-name split.
    elem._localName = localName;
    elem._namespaceURI = ns;
    elem._namespacePrefix = prefix;

    // Sync attributes. Array.from snapshots the live NamedNodeMap in index order;
    // nothing below mutates domElement, so the snapshot and the map agree.
    elem._attributes = [];
    if (domElement.attributes) {
      for (const attr of Array.from(domElement.attributes)) {
        const attrNs = attr.namespaceURI || '';
        const attrName = attr.name;
        if (attrName.startsWith('xmlns')) continue; // skip namespace declarations
        const wrapped = attrNs
          ? new Attribute(attrName, attrNs, attr.value)
          : new Attribute(attrName, attr.value);
        // Parented like the child nodes below, and for the same reason: `_xomParent` is
        // the only route {@link Attribute.detach} has back to the list it must remove
        // itself from. Assigned directly rather than via `addAttribute`, which would
        // additionally dedupe by local name and could drop a parsed attribute.
        wrapped._xomParent = elem;
        elem._attributes.push(wrapped);
      }
    }

    // Sync children
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
    // Split on the namespace rather than testing it per attribute. The win is not the
    // branch — it is that the unnamespaced arm can compare against
    // {@link Attribute.getQualifiedName}, which is now a stored string rather than one
    // built per comparison; this is the most-called method in the port and that template
    // literal was a real share of its garbage. (An indexed loop measures the same as this
    // one, so the readable form stays.)
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
    // Remove existing attribute with same name
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
      // Detach from previous parent if it's an Element
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
    // An insert at (or past) the end is an append, and appends leave every existing
    // position untouched — so the memo survives, extended by one. That is the case
    // `dateMap.addToMap` hits on almost every call, where dropping the memo would have
    // made the very next `indexOf` rebuild it from scratch.
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
    const removed = this._children.splice(index, 1);
    this.invalidateChildIndex();
    if (removed[0]) removed[0]._xomParent = null;
    return removed[0];
  }

  /**
   * Move `order`'s nodes to the front of the child list, in that order, leaving every
   * other child after them in its existing relative order.
   *
   * This is exactly what a remove-then-insert-at-`i` loop over `order` produces, and it
   * exists because that loop is quadratic: each `removeChild` scans the child list and
   * each `insertChild` splices it, so re-ordering a `<score>` of a few thousand notes —
   * which `GenericMap` does on every parse and after every re-sort — cost more than the
   * rest of the render put together.
   *
   * The two boundary cases the loop had are kept:
   *
   * - a node in `order` that is **not** currently a child is adopted, exactly as the
   *   loop's no-op `removeChild` followed by a real `insertChild` adopted it;
   * - if `order` names the same node twice the loop's result is not a permutation of the
   *   child list at all, so that case is handed back to the loop rather than guessed at.
   */
  reorderChildren(order: readonly XomNode[]): void {
    const ordered = new Set(order);
    if (ordered.size !== order.length) {
      // Duplicate entries: fall back to the literal loop this replaces.
      for (let i = 0; i < order.length; ++i) {
        this.removeChild(order[i]);
        this.insertChild(order[i], i);
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
    return this._children[index];
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
      const children = this._children;
      for (let i = 0; i < children.length; ++i) {
        if (!index.has(children[i])) index.set(children[i], i);
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
    // We need to serialize and re-parse to use xpath properly
    const xmlStr = this.toXML();
    const doc = new DOMParser().parseFromString(xmlStr, 'text/xml');
    const contextNode = doc.documentElement!;

    const select = xpath.useNamespaces(this.collectNamespaces());

    try {
      const result = select(xpathExpr, contextNode as unknown as Node);

      const xomNodes: XomNode[] = [];
      if (Array.isArray(result)) {
        for (const node of result) {
          if (xpath.isElement(node)) {
            // Map back to our tree
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
    // xml namespace is always available
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
    // Build the path from root to the target node
    const path: number[] = [];
    let current: globalThis.Node | null = domNode;
    while (current && current.parentNode && current.parentNode.nodeType === 1) {
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
   * **The `xmlns` placement was not.** Until this commit the default-namespace declaration
   * was emitted on *every* namespaced element rather than only where it changes, so a 2185-
   * byte reference MPM came back out at 3527 bytes with `xmlns` repeated 32 times where Java
   * writes it once, on the root. The integration suite did not catch it because
   * `cross-validation.test.ts` normalised the repeats away before comparing — so the gate was
   * comparing a laundered version of our output rather than our output.
   *
   * The rule now is the one XML actually specifies: a default-namespace declaration is
   * emitted only when this element's namespace differs from the one it inherits, and children
   * are serialized against whatever this element leaves in scope. Three consequences worth
   * stating, because each is a case the old code could not express:
   *
   * - the root of a namespaced document still declares, since it inherits nothing;
   * - a child in its parent's namespace declares nothing, which is the fix;
   * - a child with *no* namespace inside a namespaced parent emits `xmlns=""`, undeclaring
   *   it. That is required — without it the child would silently inherit the parent's
   *   namespace on reparse, so the old code was not merely verbose there but wrong.
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

    // Add attributes
    for (const attr of this._attributes) {
      xml += ` ${attr.toXML()}`;
      // Add namespace declaration for prefixed attributes
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

  constructor(rootElement: Element) {
    this._rootElement = rootElement;
  }

  getRootElement(): Element {
    return this._rootElement;
  }

  setRootElement(element: Element): void {
    this._rootElement = element;
  }

  toXML(): string {
    return `<?xml version="1.0" encoding="UTF-8"?>\n${this._rootElement.toXML()}`;
  }

  copy(): Document {
    return new Document(this._rootElement.copy());
  }
}

/**
 * U+FEFF, the character a UTF-8 byte-order mark (`EF BB BF`) decodes to.
 *
 * Only a LEADING one is a signature. Anywhere else U+FEFF is ZERO WIDTH NO-BREAK SPACE and
 * is ordinary content, so exactly one occurrence, at position 0, is removed.
 */
const BYTE_ORDER_MARK = '﻿';

/**
 * Drop a leading byte-order mark, so that a BOM'd document parses instead of throwing.
 *
 * **This restores Java parity rather than diverging from it.** Every Java entry point hands
 * XOM *bytes* — `builder.build(new ByteArrayInputStream(xml.getBytes(UTF_8)))`
 * (`meico/xml/XmlBase.java:99`, `meico/mei/Helper.java:1042,1061`) or `builder.build(file)`
 * (`XmlBase.java:162`) — and XOM parses those through a SAX/Xerces `XMLReader`, for which a
 * leading `EF BB BF` is the UTF-8 encoding signature of XML 1.0 §4.3.3 / Appendix F and is
 * consumed before the document entity begins. Java therefore accepts a BOM'd file silently.
 *
 * This port parses a *decoded string* instead (`DOMParser.parseFromString`), by which point
 * the signature has already become a U+FEFF character sitting in front of the XML
 * declaration — and `@xmldom/xmldom` rejects it outright with "processing instruction at
 * position 1 is an xml declaration which is only at the start of the document". The
 * divergence is an artefact of parsing characters where Java parses bytes, so stripping the
 * mark here is what makes the two agree.
 *
 * It is not a hypothetical: 3 of the 6 encodings in the MPM format's own sample corpus carry
 * a BOM, including both multi-performance documents.
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

    // Check for parse errors
    const errorNode = dom.getElementsByTagName('parsererror');
    if (errorNode.length > 0) {
      throw new ParsingException(
        `XML parsing error: ${errorNode[0].textContent || 'Unknown error'}`,
      );
    }

    const rootElement = dom.documentElement;
    if (!rootElement) {
      throw new ParsingException('No root element found');
    }

    return new Document(Element.wrap(rootElement as unknown as globalThis.Element));
  }
}

/**
 * Exception thrown during XML parsing
 */
export class ParsingException extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ParsingException';
  }
}

/**
 * Exception for XML validity errors (non-fatal - document still produced)
 */
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
