import { Attribute, Element, Text } from '../../../xml/XomTypes.js';
import { AbstractXmlSubtree } from '../../../xml/AbstractXmlSubtree.js';
import { attribute } from '../../../xml/tree.js';
import { Mpm } from '../../../mpm/Mpm.js';

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
  private nameText: Text | null = null;
  private number: Attribute | null = null;
  private id: Attribute | null = null;

  private constructor() {
    super();
  }

  static createAuthor(xml: Element): Author | null;
  static createAuthor(name: string, number: number | null, id: string | null): Author | null;
  static createAuthor(
    xmlOrName: Element | string,
    number?: number | null,
    id?: string | null,
  ): Author | null {
    try {
      if (typeof xmlOrName === 'string') {
        const authorElt = new Element('author', Mpm.MPM_NAMESPACE);
        const a = new Author();
        a.parseData(authorElt);
        a.setName(xmlOrName);
        a.setNumber(number ?? null);
        a.setId(id ?? null);
        return a;
      } else {
        const a = new Author();
        a.parseData(xmlOrName);
        return a;
      }
    } catch (e) {
      console.error(e);
      return null;
    }
  }

  /**
   * After this has run, {@link getXml} returns the very element passed in — `setXml` stores
   * it verbatim rather than copying.
   *
   * An `<author/>` whose first child is not a text node gets an empty one appended, so
   * {@link getName} always has something to read. Note that only child 0 is considered: an
   * author element that leads with a comment or an element is treated as having no name and
   * gains a second, empty text node.
   */
  protected parseData(xml: Element): void {
    if (xml === null) throw new Error('Cannot generate Author object. XML Element is null.');
    this.setXml(xml);
    if (xml.getChildCount() === 0 || !(xml.getChild(0) instanceof Text)) {
      this.nameText = new Text('');
      xml.appendChild(this.nameText);
    } else {
      this.nameText = xml.getChild(0) as Text;
    }
    this.number = attribute('number', xml);
    this.id = attribute('id', xml);
  }

  setName(name: string): void {
    this.nameText!.setValue(name);
  }
  getName(): string {
    return this.nameText!.getValue();
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
      this.getXml()!.addAttribute(this.number);
      return;
    }
    this.number.setValue(String(number));
  }

  getNumber(): number | null {
    if (this.number === null) return null;
    return parseInt(this.number.getValue());
  }

  setId(id: string | null): void {
    if (id === null) {
      if (this.id !== null) {
        this.id.detach();
        this.id = null;
      }
      return;
    }
    if (this.id === null) {
      this.id = new Attribute('xml:id', 'http://www.w3.org/XML/1998/namespace', id);
      this.getXml()!.addAttribute(this.id);
      return;
    }
    this.id.setValue(id);
  }

  getId(): string | null {
    return this.id === null ? null : this.id.getValue();
  }
}
