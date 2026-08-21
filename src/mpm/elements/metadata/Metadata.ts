import { Element } from '../../../xml/XomTypes.js';
import { AbstractXmlSubtree } from '../../../xml/AbstractXmlSubtree.js';
import { allChildElements, firstChildElement } from '../../../xml/tree.js';
import { MPM_NAMESPACE } from '../../names.js';
import { elementAt, err, isOk, ok, type Result } from '../../../prelude/index.js';
import { type MpmParseError } from '../parseError.js';
import { Author } from './Author.js';
import { Comment } from './Comment.js';
import { RelatedResource } from './RelatedResource.js';

/**
 * An MPM `<metadata>` element: who made this performance description, why, and what it
 * relates to.
 * Port of meico.mpm.elements.metadata.Metadata
 *
 * Three independent child collections — {@link Author}s and {@link Comment}s as direct
 * children, {@link RelatedResource}s wrapped in a single `<relatedResources>` container
 * that is created and removed on demand. There is at most one metadata element per
 * {@link Mpm}, and an empty one is not representable: {@link readFrom} reports failure rather
 * than produce a `<metadata/>` with nothing in it.
 *
 * The XML element is the single source of truth (see {@link AbstractXmlSubtree}); the three
 * arrays are lookup indices kept in step by the add/remove methods.
 */
export class Metadata extends AbstractXmlSubtree {
  private readonly authors: Author[] = [];
  private readonly comments: Comment[] = [];
  private readonly relatedResources: RelatedResource[] = [];

  private constructor() {
    super();
  }

  /**
   * Build a metadata element from an existing `<metadata>`.
   *
   * Returns the reason instead of printing it; note that "no usable content" is one of the
   * failures, and it is the `empty` arm.
   */
  static fromXml(xml: Element): Result<Metadata, MpmParseError> {
    return new Metadata().readFrom(xml);
  }

  /**
   * Build a `<metadata>` from its three possible contents, any of which may be absent.
   *
   * The resources may individually be null, because callers build the array out of
   * `RelatedResource` factory results. A null in the array is a caller error and is refused
   * — see {@link build}, which is also where the Java correspondence is recorded.
   */
  static fromParts(
    author: Author | null,
    comment: Comment | null,
    relatedResources: readonly (RelatedResource | null)[] | null,
  ): Result<Metadata, MpmParseError> {
    return Metadata.build(author, comment, relatedResources);
  }

  /**
   * Java's private `Metadata(Author, Comment, Collection<RelatedResource>)`, which every one
   * of its five `createMetadata` factories delegates to (Metadata.java:37-131).
   *
   * A null in `relatedResources` means a caller passed a {@link RelatedResource} factory
   * result without checking it. It is refused rather than skipped, since skipping would
   * silently accept the bad array. The check sits inside the loop rather than ahead of it, so
   * the resources before the null are re-parented and the ones after it are not.
   */
  private static build(
    author: Author | null,
    comment: Comment | null,
    relatedResources: readonly (RelatedResource | null)[] | null,
  ): Result<Metadata, MpmParseError> {
    const metadata = new Element('metadata', MPM_NAMESPACE);
    if (author !== null) metadata.appendChild(author.getXml());
    if (comment !== null) metadata.appendChild(comment.getXml());
    if (relatedResources !== null && relatedResources.length > 0) {
      const rrElt = new Element('relatedResources', MPM_NAMESPACE);
      metadata.appendChild(rrElt);
      for (const r of relatedResources) {
        if (r === null)
          return err({
            kind: 'missingArgument',
            what: 'Metadata',
            argument: 'relatedResource',
          });
        rrElt.appendChild(r.getXml());
      }
    }
    return new Metadata().readFrom(metadata);
  }

  /**
   * {@link parseData}, plus the one rule that makes a `Metadata` worth having: an element that
   * yielded no author, no comment and no related resource is refused as `empty`. The class has
   * no empty state, which is why the check cannot live in a validator the caller might skip.
   */
  private readFrom(xml: Element): Result<Metadata, MpmParseError> {
    this.parseData(xml);
    return this.authors.length + this.comments.length === 0 && this.relatedResources.length === 0
      ? err({ kind: 'empty', what: 'Metadata' })
      : ok(this);
  }

  /**
   * After this has run, {@link getXml} returns the very element passed in — `setXml` stores
   * it verbatim rather than copying.
   *
   * Unknown children are ignored, and children that fail to parse are skipped rather than
   * aborting: a `<metadata>` with one unreadable `<author>` is still a perfectly good
   * `Metadata`. Nothing here reports those reasons on.
   */
  protected parseData(xml: Element): void {
    this.setXml(xml);
    for (const child of this.getXml().getChildElements()) {
      switch (child.getLocalName()) {
        case 'author': {
          const a = Author.fromXml(child);
          if (isOk(a)) this.authors.push(a.value);
          break;
        }
        case 'comment': {
          const c = Comment.fromXml(child);
          if (isOk(c)) this.comments.push(c.value);
          break;
        }
        case 'relatedResources': {
          const resources = allChildElements(child, 'resource');
          for (const resource of resources) {
            const r = RelatedResource.fromXml(resource);
            if (isOk(r)) this.relatedResources.push(r.value);
          }
          break;
        }
      }
    }
  }

  /** Null is accepted and ignored (Metadata.java:187). */
  addAuthor(author: Author | null): number {
    if (author === null) return -1;
    this.getXml().appendChild(author.getXml());
    this.authors.push(author);
    return this.authors.length - 1;
  }
  getAuthors(): Author[] {
    return this.authors;
  }
  /**
   * The author at `index`, or null past the end — and a THROW for a negative index, which is
   * what Java answers there (`ArrayList.get` raises IndexOutOfBoundsException; only the upper
   * bound is tested).
   */
  getAuthorByIndex(index: number): Author | null {
    return index < this.authors.length ? elementAt(this.authors, index, 'author') : null;
  }
  getAuthorByName(name: string): Author[] {
    return this.authors.filter((a) => a.getName() === name);
  }
  removeAuthorByName(name: string): void {
    const auts = this.getAuthorByName(name);
    for (const aut of auts) {
      this.getXml().removeChild(aut.getXml());
      const idx = this.authors.indexOf(aut);
      if (idx !== -1) this.authors.splice(idx, 1);
    }
  }
  removeAuthor(author: Author): void {
    const idx = this.authors.indexOf(author);
    if (idx !== -1) {
      this.getXml().removeChild(author.getXml());
      this.authors.splice(idx, 1);
    }
  }

  /** As {@link addAuthor}: null is accepted and ignored. */
  addComment(comment: Comment | null): number {
    if (comment === null) return -1;
    this.getXml().appendChild(comment.getXml());
    this.comments.push(comment);
    return this.comments.length - 1;
  }
  getComments(): Comment[] {
    return this.comments;
  }
  /** The comment at `index`; out of range throws, as `ArrayList.get` does in Java. */
  getComment(index: number): Comment {
    return elementAt(this.comments, index, 'comment');
  }
  removeCommentByIndex(index: number): void {
    const c = this.getComment(index);
    this.getXml().removeChild(c.getXml());
    this.comments.splice(index, 1);
  }
  removeComment(comment: Comment): void {
    const idx = this.comments.indexOf(comment);
    if (idx !== -1) {
      this.getXml().removeChild(comment.getXml());
      this.comments.splice(idx, 1);
    }
  }

  /**
   * Null is accepted and ignored. Related resources live inside a single `<relatedResources>`
   * container element, which this creates on demand and {@link removeRelatedResource} deletes
   * again once it is empty, so the container never lingers without children.
   */
  addRelatedResource(relatedResource: RelatedResource | null): number {
    if (relatedResource === null) return -1;
    let rrElt = firstChildElement('relatedResources', this.getXml());
    if (rrElt === null) {
      rrElt = new Element('relatedResources', MPM_NAMESPACE);
      this.getXml().appendChild(rrElt);
    }
    rrElt.appendChild(relatedResource.getXml());
    this.relatedResources.push(relatedResource);
    return this.relatedResources.length - 1;
  }
  getRelatedResources(): RelatedResource[] {
    return this.relatedResources;
  }
  /** As {@link getAuthorByIndex}: null past the end, a throw below zero. */
  getRelatedResource(index: number): RelatedResource | null {
    return index < this.relatedResources.length
      ? elementAt(this.relatedResources, index, 'related resource')
      : null;
  }
  removeRelatedResourceByIndex(index: number): void {
    // Through the bound-checked accessor, so an index past the end is the no-op
    // `removeRelatedResource(null)` spells out rather than a property access on `undefined`.
    this.removeRelatedResource(this.getRelatedResource(index));
  }
  removeRelatedResource(relatedResource: RelatedResource | null): void {
    if (relatedResource === null) return;
    const rrElt = firstChildElement('relatedResources', this.getXml());
    if (rrElt === null) return;
    rrElt.removeChild(relatedResource.getXml());
    const idx = this.relatedResources.indexOf(relatedResource);
    if (idx !== -1) this.relatedResources.splice(idx, 1);
    if (rrElt.getChildCount() === 0) this.getXml().removeChild(rrElt);
  }
}
