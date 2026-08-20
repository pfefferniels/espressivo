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
  private uri: Attribute | null = null;
  private type: Attribute | null = null;

  private constructor() {
    super();
  }

  /**
   * As {@link Author.createAuthor}: the reason is returned rather than printed.
   *
   * The missing `type` was the one failure this factory already reported *without* logging —
   * a bare `return null` an untyped caller could reach — so it gains a name here rather than
   * staying the odd one out.
   */
  static createRelatedResource(xml: Element): Result<RelatedResource, MpmParseError>;
  static createRelatedResource(uri: string, type: string): Result<RelatedResource, MpmParseError>;
  static createRelatedResource(
    xmlOrUri: Element | string | null,
    type?: string,
  ): Result<RelatedResource, MpmParseError> {
    if (xmlOrUri === null) return err({ kind: 'noElement', what: 'RelatedResource' });
    if (typeof xmlOrUri !== 'string')
      return attemptParse('RelatedResource', () => {
        const r = new RelatedResource();
        r.parseData(xmlOrUri);
        return r;
      });

    // Bound to a `const` so the narrowing survives into the closure — a parameter's is
    // discarded there, and re-asserting it with `!` is the move this campaign is removing.
    const resourceType = type;
    if (resourceType === undefined)
      return err({ kind: 'missingArgument', what: 'RelatedResource', argument: 'type' });
    return attemptParse('RelatedResource', () => {
      const r = new RelatedResource();
      r.parseData(new Element('resource', MPM_NAMESPACE));
      r.setUri(xmlOrUri);
      r.setType(resourceType);
      return r;
    });
  }

  /** The `xml === null` guard now lives in {@link createRelatedResource}, its only caller. */
  protected parseData(xml: Element): void {
    this.setXml(xml);
    this.uri = attribute('uri', xml);
    if (this.uri === null) {
      this.uri = new Attribute('uri', '');
      this.getXml().addAttribute(this.uri);
    }
    this.type = attribute('type', xml);
    if (this.type === null) {
      this.type = new Attribute('type', '');
      this.getXml().addAttribute(this.type);
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
