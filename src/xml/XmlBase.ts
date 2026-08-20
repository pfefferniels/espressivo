import { Document, Element, Attribute, Builder, ParsingException } from './XomTypes.js';
import { v4 as uuidv4 } from 'uuid';

/**
 * What {@link XmlBase.validate} reports.
 *
 * `no-data` means there was nothing to validate; `not-implemented` means this port
 * carries no schema validator. The successful arm exists so that adding one later is not
 * another breaking change — nothing returns it today.
 */
export type ValidationResult =
  | { readonly validated: true }
  | { readonly validated: false; readonly reason: 'no-data' | 'not-implemented' };

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

  /**
   * Empty, around an already-parsed {@link Document}, or around XML source.
   *
   * The first two were separate overloads until T17; `document?: Document` accepts the
   * same two call forms, and the string form stays separate because its second argument
   * is what distinguishes it.
   */
  constructor(document?: Document);
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

  /**
   * Report whether this document has been validated against a schema — which, in this
   * port, it never has.
   *
   * Until T17 this returned one of two English sentences and took a `schema` parameter
   * it ignored, which read like a validator and was not one. The result type now says so
   * in a form a caller can branch on, and the parameter is gone rather than accepted and
   * dropped. Wiring up a real validator (`validateAgainstSchema` in `src/compat/` is the
   * matching stub) is what would set `validated: true`.
   */
  validate(): ValidationResult {
    if (this.isEmpty()) return { validated: false, reason: 'no-data' };
    return { validated: false, reason: 'not-implemented' };
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
   * Give every `xml:id` that repeats a fresh `meico_<uuid>` value, so the document holds
   * no id twice.
   *
   * The first occurrence of an id keeps it; every later one is reassigned. That
   * asymmetry is deliberate and load-bearing for {@link Mei.layersToStaffs}, whose only
   * caller is a pass that deep-copies `staffDef` elements: the original's references stay
   * valid and the copies are the ones that move.
   *
   * The reassignment loop re-draws while the new value collides too, which cannot
   * realistically happen with UUIDs but costs nothing to state.
   *
   * @return how many attributes had to be reassigned
   */
  fixDuplicateIds(): number {
    let duplicates = 0;
    const uniqueIds = new Set<string>();

    const attributes = this.getRootElement()!.query('descendant-or-self::node()/attribute::xml:id');
    // A walk in document order, which is the whole of the "first occurrence keeps it" rule
    // above; the index was never read for anything else. Not a fold, because the pass is
    // effects — it rewrites the attributes it visits and feeds the set it tests against.
    for (const node of attributes) {
      const attribute = node as unknown as Attribute;
      let duplicate = false;
      while (uniqueIds.has(attribute.getValue())) {
        duplicate = true;
        attribute.setValue(`meico_${uuidv4()}`);
      }
      uniqueIds.add(attribute.getValue());
      duplicates += duplicate ? 1 : 0;
    }

    // The count this used to print is the value it returns; the line said nothing the caller
    // did not already have, on a channel the caller did not choose.

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
