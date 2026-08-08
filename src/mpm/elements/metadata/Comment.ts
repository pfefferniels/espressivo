import { Attribute, Element, Text } from '../../../xml/XomTypes.js';
import { AbstractXmlSubtree } from '../../../xml/AbstractXmlSubtree.js';
import { Helper } from '../../../mei/Helper.js';
import { Mpm } from '../../../mpm/Mpm.js';

export class Comment extends AbstractXmlSubtree {
  private text: Text | null = null;
  private id: Attribute | null = null;

  private constructor() {
    super();
  }

  static createComment(xml: Element): Comment | null;
  static createComment(text: string, id: string | null): Comment | null;
  static createComment(xmlOrText: Element | string, id?: string | null): Comment | null {
    try {
      if (typeof xmlOrText === 'string') {
        const commentElt = new Element('comment', Mpm.MPM_NAMESPACE);
        const c = new Comment();
        c.parseData(commentElt);
        c.setText(xmlOrText);
        c.setId(id ?? null);
        return c;
      } else {
        const c = new Comment();
        c.parseData(xmlOrText);
        return c;
      }
    } catch (e) {
      console.error(e);
      return null;
    }
  }

  protected parseData(xml: Element): void {
    if (xml === null) throw new Error('Cannot generate Comment object. XML Element is null.');
    this.setXml(xml);
    if (xml.getChildCount() === 0 || !(xml.getChild(0) instanceof Text)) {
      this.text = new Text('');
      xml.appendChild(this.text);
    } else {
      this.text = xml.getChild(0) as Text;
    }
    this.id = Helper.getAttribute('id', xml);
  }

  setText(text: string): void {
    this.text!.setValue(text);
  }
  getText(): string {
    return this.text!.getValue();
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
