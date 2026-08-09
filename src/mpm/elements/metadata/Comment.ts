import { Element, Text } from '../../../xml/XomTypes.js';
import { AbstractXmlSubtree } from '../../../xml/AbstractXmlSubtree.js';
import { attribute } from '../../../xml/tree.js';
import { MPM_NAMESPACE } from '../../names.js';

/**
 * An MPM `<comment>` element inside {@link Metadata} — free prose about the performance.
 * Port of meico.mpm.elements.metadata.Comment
 *
 * As with {@link Author}, the content is the element's **text node**, cached here and
 * written through by {@link setText}; `xml:id` is an optional attribute that
 * {@link setId}`(null)` detaches rather than blanks.
 */
export class Comment extends AbstractXmlSubtree {
  private text: Text | null = null;

  private constructor() {
    super();
  }

  static createComment(xml: Element): Comment | null;
  static createComment(text: string, id: string | null): Comment | null;
  static createComment(xmlOrText: Element | string, id?: string | null): Comment | null {
    try {
      if (typeof xmlOrText === 'string') {
        const commentElt = new Element('comment', MPM_NAMESPACE);
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

  /**
   * After this has run, {@link getXml} returns the very element passed in — `setXml` stores
   * it verbatim rather than copying. A `<comment/>` whose first child is not a text node
   * gets an empty one appended, so {@link getText} always has something to read; see
   * {@link Author.parseData} for the same rule and its one sharp edge.
   */
  protected parseData(xml: Element): void {
    if (xml === null) throw new Error('Cannot generate Comment object. XML Element is null.');
    this.setXml(xml);
    if (xml.getChildCount() === 0 || !(xml.getChild(0) instanceof Text)) {
      this.text = new Text('');
      xml.appendChild(this.text);
    } else {
      this.text = xml.getChild(0) as Text;
    }
    this.id = attribute('id', xml);
  }

  setText(text: string): void {
    this.text!.setValue(text);
  }
  getText(): string {
    return this.text!.getValue();
  }
}
