import { Document, Element, Attribute, Builder, ParsingException } from './XomTypes.js';
import { v4 as uuidv4 } from 'uuid';

/**
 * This class is a primitive for all XML-based classes in meico.
 * Port of meico.xml.XmlBase
 *
 * Holds a parsed {@link Document} from the XOM emulation layer (`XomTypes.ts`) plus a
 * filename, and adds the handful of tree-wide operations the converters need. `Mei`,
 * `Msm` and `Mpm` all descend from it, so anything added here is inherited by every
 * document type in the port.
 */
export class XmlBase {
  protected file: string | null = null; // the filename (replaces Java File object)
  protected data: Document | null = null;
  /**
   * Never set to true: this port has no schema validation (see {@link validate}), so
   * {@link isValid} always reports false. Kept for API parity with the Java original.
   */
  protected isValidFlag = false;

  constructor();
  constructor(document: Document);
  constructor(xml: string, isXmlString: true);
  constructor(arg?: Document | string, isXmlString?: true) {
    if (arg === undefined) {
      this.file = null;
      this.data = null;
      this.isValidFlag = false;
    } else if (arg instanceof Document) {
      this.file = null;
      this.data = arg;
      this.isValidFlag = false;
    } else if (typeof arg === 'string' && isXmlString) {
      this.parseXmlString(arg);
    }
  }

  protected parseXmlString(xml: string): void {
    const builder = new Builder();
    this.isValidFlag = false;
    try {
      this.data = builder.build(xml);
    } catch (e) {
      if (e instanceof ParsingException) {
        console.error('Parsing error:', e.message);
        this.data = null;
      } else {
        throw e;
      }
    }
  }

  isValid(): boolean {
    return this.isValidFlag;
  }

  validate(_schema?: string): string {
    if (this.isEmpty()) return 'No data present to be validated';
    // Validation not implemented in browser context
    return 'Validation not supported in browser context';
  }

  getFile(): string | null {
    return this.file;
  }

  setFile(file: string): void {
    this.file = file;
  }

  isEmpty(): boolean {
    return this.data === null;
  }

  toXML(): string {
    if (this.isEmpty()) return '';
    return this.data!.toXML();
  }

  getDocument(): Document | null {
    if (this.isEmpty()) return null;
    return this.data;
  }

  setDocument(document: Document): void {
    this.data = document;
  }

  getRootElement(): Element | null {
    if (this.isEmpty()) return null;
    return this.data!.getRootElement();
  }

  /**
   * Remove every element with the given local name, in any namespace.
   *
   * Returns the number actually removed, which can be lower than the number matched:
   * a match whose parent cannot be resolved is left in place and not counted.
   */
  removeAllElements(localName: string): number {
    let deletions = 0;
    const matches = this.getRootElement()!.query(`descendant::*[local-name()='${localName}']`);

    for (const node of matches.toArray()) {
      const parent = node.getParent();
      if (parent !== null) {
        parent.removeChild(node);
        // removeChild has already cleared the parent pointer, so this detach() falls
        // through to the wrapped DOM node and unlinks it there too.
        node.detach();
        deletions++;
      }
    }
    return deletions;
  }

  /**
   * Strip the given attribute from every element carrying it. Unlike
   * {@link removeAllElements}, the return value is the number of elements *matched*.
   */
  removeAllAttributes(attributeName: string): number {
    const matches = this.getRootElement()!.query(`descendant::*[@${attributeName}]`);

    for (const node of matches.toArray()) {
      const element = node as unknown as Element;
      const attribute = element.getAttribute(attributeName);
      if (attribute) element.removeAttribute(attribute);
    }

    return matches.size();
  }

  /**
   * Give every `xml:id` that repeats a fresh `meico_<uuid>` value, keeping the first
   * occurrence, and return how many had to be renamed.
   *
   * The `while` is not a typo: a freshly generated id is re-checked against the set,
   * so a (vanishingly unlikely) collision is retried rather than accepted.
   */
  fixDuplicateIds(): number {
    let duplicates = 0;
    const uniqueIds = new Set<string>();

    const attributes = this.getRootElement()!.query('descendant-or-self::node()/attribute::xml:id');
    for (const node of attributes.toArray()) {
      const attribute = node as unknown as Attribute;
      let duplicate = false;
      while (uniqueIds.has(attribute.getValue())) {
        duplicate = true;
        attribute.setValue(`meico_${uuidv4()}`);
      }
      uniqueIds.add(attribute.getValue());
      duplicates += duplicate ? 1 : 0;
    }

    return duplicates;
  }

  /**
   * Export the XML as a string (browser-compatible replacement for writeFile)
   */
  exportXml(): string | null {
    if (this.isEmpty()) {
      console.error('Empty document, cannot export.');
      return null;
    }
    return this.toXML();
  }
}
