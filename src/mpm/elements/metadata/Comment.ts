import { Element, Text } from '../../../xml/XomTypes.js';
import { AbstractXmlSubtree } from '../../../xml/AbstractXmlSubtree.js';
import { attribute } from '../../../xml/tree.js';
import { err, type Result } from '../../../prelude/index.js';
import { MPM_NAMESPACE } from '../../names.js';
import { attemptParse, type MpmParseError } from '../parseError.js';

/**
 * An MPM `<comment>` element inside {@link Metadata} — free prose about the performance.
 * Port of meico.mpm.elements.metadata.Comment
 *
 * As with {@link Author}, the content is the element's **text node**, cached here and
 * written through by {@link setText}; `xml:id` is an optional attribute that
 * {@link setId}`(null)` detaches rather than blanks.
 */
export class Comment extends AbstractXmlSubtree {
  /** As {@link Author.nameText}: the placeholder IS the node the defaulting path installs. */
  private text: Text;

  private constructor() {
    super();
    this.text = new Text('');
  }

  /** As {@link Author.createAuthor}: the reason is returned rather than printed. */
  static createComment(xml: Element | null): Result<Comment, MpmParseError>;
  static createComment(text: string, id: string | null): Result<Comment, MpmParseError>;
  static createComment(
    xmlOrText: Element | string | null,
    id?: string | null,
  ): Result<Comment, MpmParseError> {
    if (xmlOrText === null) return err({ kind: 'noElement', what: 'Comment' });
    return attemptParse('Comment', () => {
      const c = new Comment();
      if (typeof xmlOrText === 'string') {
        c.parseData(new Element('comment', MPM_NAMESPACE));
        c.setText(xmlOrText);
        c.setId(id ?? null);
      } else {
        c.parseData(xmlOrText);
      }
      return c;
    });
  }

  /**
   * After this has run, {@link getXml} returns the very element passed in — `setXml` stores
   * it verbatim rather than copying. A `<comment/>` whose first child is not a text node
   * gets an empty one appended, so {@link getText} always has something to read; see
   * {@link Author.parseData} for the same rule and its one sharp edge.
   */
  protected parseData(xml: Element): void {
    this.setXml(xml);
    const first = xml.getChildCount() === 0 ? null : xml.getChild(0);
    if (first instanceof Text) this.text = first;
    else xml.appendChild(this.text);
    this.id = attribute('id', xml);
  }

  setText(text: string): void {
    this.text.setValue(text);
  }
  getText(): string {
    return this.text.getValue();
  }
}
