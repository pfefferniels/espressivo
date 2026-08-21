import { Attribute, Element, Text } from '../../../xml/XomTypes.js';
import { AbstractXmlSubtree } from '../../../xml/AbstractXmlSubtree.js';
import { attribute } from '../../../xml/tree.js';
import { err, type Result } from '../../../prelude/index.js';
import { MPM_NAMESPACE } from '../../names.js';
import { attemptParse, type MpmParseError } from '../parseError.js';

/**
 * An MPM `<author>` element inside {@link Metadata}.
 * Port of meico.mpm.elements.metadata.Author
 *
 * The author's name is the element's **text content**, not an attribute, so
 * {@link nameText} caches the `Text` node itself; `number` and `xml:id` are optional
 * attributes. All three are live views onto the XML — the setters write through to the
 * document, and passing `null` to {@link setNumber} or {@link setId} detaches the attribute
 * rather than blanking it.
 */
export class Author extends AbstractXmlSubtree {
  /**
   * The text node the name lives in, held so the setters write where {@link parseData} read.
   *
   * It needs no `!` because it is initialised to the very node the defaulting path installs:
   * an `<author>` whose first child is not a text node has one APPENDED to it (see the
   * header comment), so "the empty placeholder" and "the node in the document" are the same
   * object as soon as parsing has run. Where the element leads with a text node,
   * `parseData` adopts that one instead. Same shape as `RubatoDef`'s three attributes.
   */
  private nameText: Text;
  private number: Attribute | null = null;

  private constructor() {
    super();
    this.nameText = new Text('');
  }

  /**
   * Read an `<author>` element, or build one from a name (with optional number and `xml:id`).
   *
   * Where this returned `Author | null` after printing the exception it had caught, it now
   * returns the reason — see `elements/parseError.ts` for why that is the same control flow
   * with one fewer thing thrown away. The null element is the one failure a document can
   * cause here, and it is checked rather than caught.
   */
  static createAuthor(xml: Element | null): Result<Author, MpmParseError>;
  static createAuthor(
    name: string,
    number: number | null,
    id: string | null,
  ): Result<Author, MpmParseError>;
  static createAuthor(
    xmlOrName: Element | string | null,
    number?: number | null,
    id?: string | null,
  ): Result<Author, MpmParseError> {
    if (xmlOrName === null) return err({ kind: 'noElement', what: 'Author' });
    return attemptParse('Author', () => {
      const a = new Author();
      if (typeof xmlOrName === 'string') {
        a.parseData(new Element('author', MPM_NAMESPACE));
        a.setName(xmlOrName);
        a.setNumber(number ?? null);
        a.setId(id ?? null);
      } else {
        a.parseData(xmlOrName);
      }
      return a;
    });
  }

  /**
   * After this has run, {@link getXml} returns the very element passed in — `setXml` stores
   * it verbatim rather than copying.
   *
   * An `<author/>` whose first child is not a text node gets an empty one appended, so
   * {@link getName} always has something to read. Note that only child 0 is considered: an
   * author element that leads with a comment or an element is treated as having no name and
   * gains a second, empty text node.
   *
   * The `xml === null` guard this used to open with now lives in {@link createAuthor}, which
   * is its only caller and which can say what a null means without throwing.
   */
  protected parseData(xml: Element): void {
    this.setXml(xml);
    const first = xml.getChildCount() === 0 ? null : xml.getChild(0);
    // `instanceof` where the incumbent asserted `as Text` after testing the same thing —
    // one branch, and now the compiler is reading it rather than being told.
    if (first instanceof Text) this.nameText = first;
    else xml.appendChild(this.nameText);
    this.number = attribute('number', xml);
    this.id = attribute('id', xml);
  }

  setName(name: string): void {
    this.nameText.setValue(name);
  }
  getName(): string {
    return this.nameText.getValue();
  }

  setNumber(number: number | null): void {
    if (number === null) {
      if (this.number !== null) {
        this.number.detach();
        this.number = null;
      }
      return;
    }
    if (this.number === null) {
      this.number = new Attribute('number', String(number));
      this.getXml().addAttribute(this.number);
      return;
    }
    this.number.setValue(String(number));
  }

  getNumber(): number | null {
    if (this.number === null) return null;
    return parseInt(this.number.getValue());
  }
}
