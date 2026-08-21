import { Document, Element, Attribute, Builder, ParsingException } from './XomTypes.js';
import { MissingNodeError } from './errors.js';
import { v4 as uuidv4 } from 'uuid';

/**
 * What {@link XmlBase.validate} reports.
 *
 * `no-data` means there was nothing to validate; `not-implemented` means this port carries no
 * schema validator. The successful arm exists so that adding one later is not a breaking
 * change; nothing returns it today.
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
   * Java marks the string form with a boolean flag (`XmlBase(String, boolean)`). There is none
   * here: `Document` and `string` are disjoint, so `instanceof` tells the arms apart and a lone
   * string parses.
   *
   * @param source the data as a XOM {@link Document}, or xml code as a UTF8 string, or
   *   nothing for an empty instance
   */
  constructor(source?: Document | string) {
    if (source === undefined) {
      this.file = null;
      this.data = null;
      this.isValidFlag = false;
    } else if (source instanceof Document) {
      this.file = null;
      this.data = source;
      this.isValidFlag = false;
    } else {
      this.parseXmlString(source);
    }
  }

  /**
   * Parse XML source into {@link data}, or leave it null and report why on `console.error`.
   *
   * The `ParsingException` arm is not the malformed-XML arm. Measured against the pinned
   * `@xmldom/xmldom`: for every category of malformed input probed — plain text, empty source,
   * a comment or PI with no root, two root elements, an invalid element name, an undeclared
   * prefix, an unterminated CDATA — `DOMParser.parseFromString` throws its own `ParseError`
   * before `Builder.build` can reach either of its `ParsingException` throws, so control takes
   * the `else` and leaves this method by throwing. Java's `XmlBase` catches XOM's
   * `ParsingException` here and leaves `data` null, i.e. malformed MEI yields an *empty
   * document* there and an *exception* here. That divergence is PARITY.md's `XB1`, and
   * `src/api/parse.ts` compensates for it at the facade.
   *
   * What *does* reach the `ParsingException` arm is `Builder.build`'s `parsererror` probe,
   * which is browser-`DOMParser` semantics: browsers report a parse failure by returning a
   * document containing a `<parsererror>` element, and xmldom never does. So the probe fires
   * only as a false positive, on a well-formed document that happens to contain an element
   * named `parsererror` — the one and only way a `Mei`, `Msm` or `Mpm` can come out of a
   * constructor with `isEmpty()` true. `tests/xml/XmlBase.test.ts` pins both halves.
   *
   * The `console.error` stays, and it is the only one left in this class: unlike
   * `exportXml`'s, it carries something no caller can recover — *why* the parse failed.
   */
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
   * Report whether this document has been validated against a schema — which, in this port,
   * it never has. Wiring up a real validator (`validateAgainstSchema` in `src/compat/` is the
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
    if (this.data === null) return '';
    return this.data.toXML();
  }

  getDocument(): Document | null {
    if (this.isEmpty()) return null;
    return this.data;
  }

  setDocument(document: Document): void {
    this.data = document;
  }

  getRootElement(): Element | null {
    if (this.data === null) return null;
    return this.data.getRootElement();
  }

  /**
   * The root element, or a {@link MissingNodeError} naming the document that has none.
   *
   * {@link getRootElement} answers `null` for exactly one reason — there is no parsed
   * document at all — because a {@link Document} always has a root. Most callers have already
   * established that (`isEmpty()` is false, or they built the document themselves two lines
   * earlier); this is that claim, checked, rather than the `!` that arrives when wrong as
   * "cannot read property of null" somewhere inside XOM.
   *
   * Where absence is a real answer rather than a broken invariant, call
   * {@link getRootElement} and branch on the null.
   */
  protected requireRootElement(): Element {
    const root = this.getRootElement();
    if (root === null)
      throw new MissingNodeError('this document is empty and therefore has no root element');
    return root;
  }

  /**
   * Remove every element with the given local name, in any namespace.
   *
   * Returns the number actually removed, which can be lower than the number matched:
   * a match whose parent cannot be resolved is left in place and not counted.
   */
  removeAllElements(localName: string): number {
    let deletions = 0;
    const matches = this.requireRootElement().query(`descendant::*[local-name()='${localName}']`);

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
    const matches = this.requireRootElement().query(`descendant::*[@${attributeName}]`);

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

    const attributes = this.requireRootElement().query(
      'descendant-or-self::node()/attribute::xml:id',
    );
    // Document order is the whole of the "first occurrence keeps it" rule above.
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

    return duplicates;
  }

  /**
   * Export the XML as a string (browser-compatible replacement for writeFile), or null when
   * there is no document to export. The null has exactly one cause, `isEmpty()`, and is
   * reported silently: unlike `parseXmlString`'s failure it carries nothing a caller could
   * not ask for itself.
   */
  exportXml(): string | null {
    if (this.isEmpty()) return null;
    return this.toXML();
  }
}
