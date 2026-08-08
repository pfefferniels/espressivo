import { Attribute, Element } from '../../../xml/XomTypes.js';
import { AbstractXmlSubtree } from '../../../xml/AbstractXmlSubtree.js';
import { Helper } from '../../../mei/Helper.js';
import { Mpm } from '../../../mpm/Mpm.js';

/**
 * An MPM `<resource>` element: a pointer to a file this performance description relates to
 * — typically the MEI or MSM it was generated from.
 * Port of meico.mpm.elements.metadata.RelatedResource
 *
 * Unlike {@link Author} and {@link Comment} both values are attributes, and both are
 * mandatory: {@link parseData} creates `uri` and `type` as empty attributes when absent
 * rather than rejecting the element, so the setters always have something to write through
 * to. Resources are held inside {@link Metadata}'s `<relatedResources>` container.
 */
export class RelatedResource extends AbstractXmlSubtree {
  private uri: Attribute | null = null;
  private type: Attribute | null = null;

  private constructor() {
    super();
  }

  static createRelatedResource(xml: Element): RelatedResource | null;
  static createRelatedResource(uri: string, type: string): RelatedResource | null;
  static createRelatedResource(xmlOrUri: Element | string, type?: string): RelatedResource | null {
    try {
      if (typeof xmlOrUri === 'string') {
        if (type === undefined) return null;
        const resourceElt = new Element('resource', Mpm.MPM_NAMESPACE);
        const r = new RelatedResource();
        r.parseData(resourceElt);
        r.setUri(xmlOrUri);
        r.setType(type);
        return r;
      } else {
        const r = new RelatedResource();
        r.parseData(xmlOrUri);
        return r;
      }
    } catch (e) {
      console.error(e);
      return null;
    }
  }

  protected parseData(xml: Element): void {
    if (xml === null)
      throw new Error('Cannot generate RelatedResource object. XML Element is null.');
    this.setXml(xml);
    this.uri = Helper.getAttribute('uri', xml);
    if (this.uri === null) {
      this.uri = new Attribute('uri', '');
      this.getXml()!.addAttribute(this.uri);
    }
    this.type = Helper.getAttribute('type', xml);
    if (this.type === null) {
      this.type = new Attribute('type', '');
      this.getXml()!.addAttribute(this.type);
    }
  }

  setUri(uri: string): void {
    this.uri!.setValue(uri);
  }
  getUri(): string {
    return this.uri!.getValue();
  }
  /**
   * All whitespace is stripped, not just trimmed: `type` names a resource kind (`mei`,
   * `msm`, …) and must stay a single token. Mirrors `RelatedResource.java:110`'s
   * `replaceAll("\\s+", "")`.
   *
   * PARITY NOTE: JavaScript's `\s` also matches non-ASCII whitespace (NBSP, U+2028, …)
   * where Java's default `\s` is the six ASCII characters only, so a type containing exotic
   * whitespace would be stripped here and kept there. No fixture reaches it; same family as
   * the `parseFloat` vs `Double.parseDouble` divergences logged under [T6].
   */
  setType(type: string): void {
    this.type!.setValue(type.replace(/\s+/g, ''));
  }
  getType(): string {
    return this.type!.getValue();
  }
}
