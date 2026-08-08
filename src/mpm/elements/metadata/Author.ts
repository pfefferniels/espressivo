import { Attribute, Element, Text } from '../../../xml/XomTypes.js';
import { AbstractXmlSubtree } from '../../../xml/AbstractXmlSubtree.js';
import { Helper } from '../../../mei/Helper.js';
import { Mpm } from '../../../mpm/Mpm.js';

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

  protected parseData(xml: Element): void {
    if (xml === null) throw new Error('Cannot generate Author object. XML Element is null.');
    this.setXml(xml);
    if (xml.getChildCount() === 0 || !(xml.getChild(0) instanceof Text)) {
      this.nameText = new Text('');
      xml.appendChild(this.nameText);
    } else {
      this.nameText = xml.getChild(0) as Text;
    }
    this.number = Helper.getAttribute('number', xml);
    this.id = Helper.getAttribute('id', xml);
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
