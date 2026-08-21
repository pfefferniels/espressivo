import { Attribute, Element } from '../../../xml/XomTypes.js';
import { AbstractXmlSubtree } from '../../../xml/AbstractXmlSubtree.js';
import { attribute } from '../../../xml/tree.js';
import { err, type Result } from '../../../prelude/index.js';
import { MPM_NAMESPACE } from '../../names.js';
import { attemptParse, type MpmParseError } from '../parseError.js';

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
  /**
   * Both attributes, held so the setters write where {@link parseData} read, and both
   * initialised to the empty node the defaulting path installs: a `<resource>` missing one gets
   * THIS object added to it, and one that declares it hands `parseData` the declared node to
   * hold instead. See {@link Author.nameText}.
   */
  private uri: Attribute;
  private type: Attribute;

  private constructor() {
    super();
    this.uri = new Attribute('uri', '');
    this.type = new Attribute('type', '');
  }

  /** As {@link Author.fromXml}: the reason is returned rather than printed. */
  static fromXml(xml: Element | null): Result<RelatedResource, MpmParseError> {
    if (xml === null) return err({ kind: 'noElement', what: 'RelatedResource' });
    return attemptParse('RelatedResource', () => {
      const r = new RelatedResource();
      r.parseData(xml);
      return r;
    });
  }

  /**
   * Build a `<resource>` from a uri and a type. A null `type` is refused rather than
   * defaulted to empty, as in Java, which refuses both a null uri and a null type in this
   * form (`RelatedResource.java:47-49`).
   */
  static fromUri(uri: string, type: string | null): Result<RelatedResource, MpmParseError> {
    if (type === null)
      return err({ kind: 'missingArgument', what: 'RelatedResource', argument: 'type' });
    return attemptParse('RelatedResource', () => {
      const r = new RelatedResource();
      r.parseData(new Element('resource', MPM_NAMESPACE));
      r.setUri(uri);
      r.setType(type);
      return r;
    });
  }

  protected parseData(xml: Element): void {
    this.setXml(xml);
    const declaredUri = attribute('uri', xml);
    if (declaredUri === null) this.getXml().addAttribute(this.uri);
    else this.uri = declaredUri;
    const declaredType = attribute('type', xml);
    if (declaredType === null) this.getXml().addAttribute(this.type);
    else this.type = declaredType;
  }

  setUri(uri: string): void {
    this.uri.setValue(uri);
  }
  getUri(): string {
    return this.uri.getValue();
  }
  /**
   * All whitespace is stripped, not just trimmed: `type` names a resource kind (`mei`,
   * `msm`, …) and must stay a single token. Mirrors `RelatedResource.java:110`'s
   * `replaceAll("\\s+", "")`.
   *
   * PARITY NOTE: JavaScript's `\s` also matches non-ASCII whitespace (NBSP, U+2028, …)
   * where Java's default `\s` is the six ASCII characters only, so a type containing exotic
   * whitespace would be stripped here and kept there. No fixture reaches it; frozen as a
   * divergence in PARITY.md §2, "`RelatedResource.setType` whitespace class".
   */
  setType(type: string): void {
    this.type.setValue(type.replace(/\s+/g, ''));
  }
  getType(): string {
    return this.type.getValue();
  }
}
