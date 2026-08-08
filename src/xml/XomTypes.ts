/**
 * XOM compatibility layer for browser/Node.js environments.
 * Wraps @xmldom/xmldom to provide an API matching the nu.xom Java library
 * that meico uses extensively throughout its codebase.
 */

import { DOMParser, XMLSerializer } from '@xmldom/xmldom';
import xpath from 'xpath';

// Re-export for convenience
export { DOMParser, XMLSerializer };

/**
 * Represents a collection of XML nodes, similar to XOM's Nodes class
 */
export class Nodes {
  private nodes: XomNode[];

  constructor(nodes: XomNode[] = []) {
    this.nodes = nodes;
  }

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
 * Base class for all XOM node types
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
 * Represents an XML attribute, similar to XOM's Attribute class
 */
export class Attribute extends XomNode {
  private _localName: string;
  private _value: string;
  private _namespaceURI: string;
  private _namespacePrefix: string;

  constructor(name: string, value: string);
  constructor(name: string, namespaceURI: string, value: string);
  constructor(name: string, valueOrNs: string, value?: string) {
    // Create a placeholder node - attributes are attached to elements later
    const doc = new DOMParser().parseFromString('<dummy/>', 'text/xml');
    const attr = doc.createAttribute(name);
    super(attr as unknown as Node);

    if (value !== undefined) {
      // 3-arg constructor: name, namespace, value
      this._namespaceURI = valueOrNs;
      this._value = value;
      const parts = name.split(':');
      this._namespacePrefix = parts.length > 1 ? parts[0] : '';
      this._localName = parts.length > 1 ? parts[1] : name;
    } else {
      // 2-arg constructor: name, value
      this._namespaceURI = '';
      this._value = valueOrNs;
      const parts = name.split(':');
      this._namespacePrefix = parts.length > 1 ? parts[0] : '';
      this._localName = parts.length > 1 ? parts[1] : name;
    }
  }

  getLocalName(): string {
    return this._localName;
  }

  getQualifiedName(): string {
    return this._namespacePrefix ? `${this._namespacePrefix}:${this._localName}` : this._localName;
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
   */
  detach(): void {
    if (this._xomParent) {
      this._xomParent.removeAttribute(this);
    }
  }
}

/**
 * Represents an XML text node, similar to XOM's Text class
 */
export class Text extends XomNode {
  private _value: string;

  constructor(value: string) {
    const doc = new DOMParser().parseFromString('<dummy/>', 'text/xml');
    const textNode = doc.createTextNode(value);
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

  toXML(): string {
    return this._value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  copy(): Text {
    return new Text(this._value);
  }
}

/**
 * Represents a collection of child elements, similar to XOM's Elements class
 */
export class Elements {
  private elements: Element[];

  constructor(elements: Element[] = []) {
    this.elements = elements;
  }

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
 * Represents an XML element, similar to XOM's Element class.
 * This is the most heavily used XOM class in meico.
 */
export class Element extends XomNode {
  private _localName: string;
  private _namespaceURI: string;
  private _namespacePrefix: string;
  private _attributes: Attribute[] = [];
  private _children: XomNode[] = [];
  private _ownerDocument: Document | null = null;

  constructor(name: string, namespaceURI?: string) {
    const doc = new DOMParser().parseFromString('<dummy/>', 'text/xml');
    let elem: globalThis.Element;

    const parts = name.split(':');
    const localName = parts.length > 1 ? parts[1] : name;
    const prefix = parts.length > 1 ? parts[0] : '';

    if (namespaceURI) {
      elem = doc.createElementNS(namespaceURI, name) as unknown as globalThis.Element;
    } else {
      elem = doc.createElement(localName) as unknown as globalThis.Element;
    }

    super(elem as unknown as Node);
    this._localName = localName;
    this._namespaceURI = namespaceURI || '';
    this._namespacePrefix = prefix;
  }

  /**
   * Wrap an existing DOM Element
   */
  static wrap(domElement: globalThis.Element): Element {
    const localName = domElement.localName || domElement.nodeName;
    const ns = domElement.namespaceURI || '';
    const prefix = domElement.prefix || '';
    const qualifiedName = prefix ? `${prefix}:${localName}` : localName;
    const elem = new Element(qualifiedName, ns || undefined);
    elem._domNode = domElement;
    elem._localName = localName;
    elem._namespaceURI = ns;
    elem._namespacePrefix = prefix;

    // Sync attributes
    elem._attributes = [];
    if (domElement.attributes) {
      for (let i = 0; i < domElement.attributes.length; i++) {
        const attr = domElement.attributes[i];
        const attrNs = attr.namespaceURI || '';
        const attrName = attr.name;
        if (attrName.startsWith('xmlns')) continue; // skip namespace declarations
        if (attrNs) {
          elem._attributes.push(new Attribute(attrName, attrNs, attr.value));
        } else {
          elem._attributes.push(new Attribute(attrName, attr.value));
        }
      }
    }

    // Sync children
    elem._children = [];
    for (let i = 0; i < domElement.childNodes.length; i++) {
      const child = domElement.childNodes[i];
      if (child.nodeType === 1) {
        // ELEMENT_NODE
        const wrappedChild = Element.wrap(child as globalThis.Element);
        wrappedChild._xomParent = elem;
        elem._children.push(wrappedChild);
      } else if (child.nodeType === 3) {
        // TEXT_NODE
        const text = new Text((child as globalThis.Text).data);
        text['_domNode'] = child;
        text._xomParent = elem;
        elem._children.push(text);
      }
    }

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

  setNamespaceURI(uri: string): void {
    this._namespaceURI = uri;
  }

  setNamespacePrefix(prefix: string): void {
    this._namespacePrefix = prefix;
  }

  // --- Attribute operations ---

  getAttribute(name: string, namespaceURI?: string): Attribute | null {
    for (const attr of this._attributes) {
      if (namespaceURI !== undefined) {
        if (attr.getLocalName() === name && attr.getNamespaceURI() === namespaceURI) return attr;
      } else {
        if (attr.getLocalName() === name || attr.getQualifiedName() === name) return attr;
      }
    }
    return null;
  }

  getAttributeValue(name: string, namespaceURI?: string): string | null {
    const attr = this.getAttribute(name, namespaceURI);
    return attr ? attr.getValue() : null;
  }

  getAttributeCount(): number {
    return this._attributes.length;
  }

  addAttribute(attr: Attribute): void {
    // Remove existing attribute with same name
    const existing = this.getAttribute(attr.getLocalName(), attr.getNamespaceURI() || undefined);
    if (existing) {
      this.removeAttribute(existing);
    }
    attr._xomParent = this;
    this._attributes.push(attr);
  }

  removeAttribute(attr: Attribute): void {
    const idx = this._attributes.indexOf(attr);
    if (idx !== -1) {
      attr._xomParent = null;
      this._attributes.splice(idx, 1);
    } else {
      // Try to find by name
      for (let i = 0; i < this._attributes.length; i++) {
        if (
          this._attributes[i].getLocalName() === attr.getLocalName() &&
          this._attributes[i].getNamespaceURI() === attr.getNamespaceURI()
        ) {
          this._attributes.splice(i, 1);
          break;
        }
      }
    }
  }

  // --- Child operations ---

  appendChild(child: XomNode | string): void {
    if (typeof child === 'string') {
      const text = new Text(child);
      text._xomParent = this;
      this._children.push(text);
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
    }
  }

  insertChild(child: XomNode | string, position: number): void {
    if (typeof child === 'string') {
      const text = new Text(child);
      text._xomParent = this;
      this._children.splice(position, 0, text);
    } else {
      child._xomParent = this;
      this._children.splice(position, 0, child);
    }
  }

  removeChild(child: XomNode): boolean {
    const idx = this._children.indexOf(child);
    if (idx !== -1) {
      this._children.splice(idx, 1);
      child._xomParent = null;
      return true;
    }
    return false;
  }

  removeChildAt(index: number): XomNode {
    const removed = this._children.splice(index, 1);
    if (removed[0]) removed[0]._xomParent = null;
    return removed[0];
  }

  removeChildren(): void {
    for (const child of this._children) {
      child._xomParent = null;
    }
    this._children = [];
  }

  replaceChild(oldChild: XomNode, newChild: XomNode): void {
    const idx = this._children.indexOf(oldChild);
    if (idx !== -1) {
      oldChild._xomParent = null;
      newChild._xomParent = this;
      this._children[idx] = newChild;
    }
  }

  getChild(index: number): XomNode {
    return this._children[index];
  }

  getChildCount(): number {
    return this._children.length;
  }

  getChildElements(name?: string, namespaceURI?: string): Elements {
    const elements: Element[] = [];
    for (const child of this._children) {
      if (child instanceof Element) {
        if (name !== undefined) {
          if (child.getLocalName() === name) {
            if (namespaceURI === undefined || child.getNamespaceURI() === namespaceURI) {
              elements.push(child);
            }
          }
        } else {
          elements.push(child);
        }
      }
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

  indexOf(child: XomNode): number {
    return this._children.indexOf(child);
  }

  getValue(): string {
    let result = '';
    for (const child of this._children) {
      result += child.getValue();
    }
    return result;
  }

  /**
   * Execute an XPath query against this element.
   * This is heavily used by meico for navigating the XML tree.
   */
  query(xpathExpr: string): Nodes {
    // We need to serialize and re-parse to use xpath properly
    const xmlStr = this.toXML();
    const doc = new DOMParser().parseFromString(xmlStr, 'text/xml');
    const contextNode = doc.documentElement!;

    // Collect namespace mappings for the XPath resolver
    const nsMap = this.collectNamespaces();

    const select = xpath.useNamespaces(nsMap);

    try {
      const result = select(xpathExpr, contextNode as unknown as Node);

      const xomNodes: XomNode[] = [];
      if (Array.isArray(result)) {
        for (const node of result) {
          const domNode = node as any;
          if (domNode.nodeType === 1) {
            // ELEMENT_NODE
            // Map back to our tree
            const mapped = this.findCorrespondingElement(domNode);
            if (mapped) xomNodes.push(mapped);
          } else if (domNode.nodeType === 2) {
            // ATTRIBUTE_NODE
            const ownerElem = (domNode as globalThis.Attr).ownerElement;
            if (ownerElem) {
              const mappedElem = this.findCorrespondingElement(ownerElem);
              if (mappedElem) {
                const attr = mappedElem.getAttribute(
                  domNode.localName || domNode.nodeName,
                  domNode.namespaceURI || undefined,
                );
                if (attr) xomNodes.push(attr);
              }
            }
          } else if (domNode.nodeType === 3) {
            // TEXT_NODE
            xomNodes.push(new Text(domNode.data || domNode.nodeValue || ''));
          }
        }
      }

      return new Nodes(xomNodes);
    } catch {
      return new Nodes([]);
    }
  }

  private collectNamespaces(): Record<string, string> {
    const nsMap: Record<string, string> = {};
    // xml namespace is always available
    nsMap['xml'] = 'http://www.w3.org/XML/1998/namespace';
    this._collectNsRecursive(this, nsMap);
    return nsMap;
  }

  private _collectNsRecursive(elem: Element, nsMap: Record<string, string>): void {
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
        this._collectNsRecursive(child, nsMap);
      }
    }
  }

  /**
   * Find the corresponding element in our tree given a DOM element from a parsed copy.
   * Uses a path-based matching strategy.
   */
  private findCorrespondingElement(domNode: globalThis.Element): Element | null {
    // Build the path from root to the target node
    const path: number[] = [];
    let current: globalThis.Node | null = domNode;
    while (current && current.parentNode && current.parentNode.nodeType === 1) {
      const parent: globalThis.Node = current.parentNode;
      let index = 0;
      for (let i = 0; i < parent.childNodes.length; i++) {
        if (parent.childNodes[i] === current) break;
        if (parent.childNodes[i].nodeType === 1) index++;
      }
      path.unshift(index);
      current = parent;
    }

    // Navigate our tree using the path
    let result: Element = this;
    for (const idx of path) {
      const childElements = result.getChildElements();
      if (idx >= childElements.size()) return null;
      result = childElements.get(idx);
    }
    return result;
  }

  toXML(): string {
    let xml = `<${this.getQualifiedName()}`;

    // Add namespace declaration if present
    if (this._namespaceURI) {
      if (this._namespacePrefix) {
        xml += ` xmlns:${this._namespacePrefix}="${this._namespaceURI}"`;
      } else {
        xml += ` xmlns="${this._namespaceURI}"`;
      }
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
        xml += child.toXML();
      }
      xml += `</${this.getQualifiedName()}>`;
    }

    return xml;
  }

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
 * Represents an XML document, similar to XOM's Document class
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
 * XML parser, similar to XOM's Builder class.
 * Parses XML strings into Document objects.
 */
export class Builder {
  build(xml: string): Document {
    const parser = new DOMParser();
    const dom = parser.parseFromString(xml, 'text/xml');

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
  private _document: Document | null;

  constructor(message: string, document?: Document) {
    super(message);
    this.name = 'ValidityException';
    this._document = document || null;
  }

  getDocument(): Document | null {
    return this._document;
  }
}
