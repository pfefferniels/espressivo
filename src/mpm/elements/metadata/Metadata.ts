import { Attribute, Element } from '../../../xml/XomTypes.js';
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
   * Build a metadata element from an existing `<metadata>`, from any one of the three
   * content kinds, or from all three at once.
   *
   * ⚠ The single-argument forms are dispatched by **duck typing**, not by `instanceof`:
   * `getName`+`getNumber` identifies an {@link Author} and `getText` a {@link Comment}.
   * That is why the overloads cannot be collapsed onto a union — the argument's *shape* is
   * what selects the behaviour — and it is also the fragile part of this factory: adding a
   * `getText` to `Author`, or a `getName` to `Comment`, would silently re-route callers.
   * The `arg2`/`arg3` reads distinguish the single-argument forms from the three-argument
   * one, since `undefined` is the only signal available.
   *
   * Returns the reason instead of printing it, as every factory in this cluster now does;
   * note that "no usable content" is one of the failures, and it is the `empty` arm.
   */
  static createMetadata(xml: Element): Result<Metadata, MpmParseError>;
  static createMetadata(author: Author): Result<Metadata, MpmParseError>;
  static createMetadata(comment: Comment): Result<Metadata, MpmParseError>;
  static createMetadata(relatedResources: RelatedResource[]): Result<Metadata, MpmParseError>;
  /**
   * The resources may individually be null, because the callers build the array out of
   * `RelatedResource.createRelatedResource` results and that factory used to report failure
   * with null. A null in the array is a caller error, and it stays one — see the loop below.
   */
  static createMetadata(
    author: Author | null,
    comment: Comment | null,
    relatedResources: readonly (RelatedResource | null)[] | null,
  ): Result<Metadata, MpmParseError>;
  static createMetadata(
    arg1: Element | Author | Comment | RelatedResource[] | null,
    arg2?: Comment | null,
    arg3?: readonly (RelatedResource | null)[] | null,
  ): Result<Metadata, MpmParseError> {
    const m = new Metadata();
    if (arg1 instanceof Element) {
      return m.readFrom(arg1);
    } else if (Array.isArray(arg1)) {
      const metadata = new Element('metadata', MPM_NAMESPACE);
      if (arg1.length > 0) {
        const rrElt = new Element('relatedResources', MPM_NAMESPACE);
        metadata.appendChild(rrElt);
        for (const r of arg1) rrElt.appendChild(r.getXml());
      }
      return m.readFrom(metadata);
    } else {
      const metadata = new Element('metadata', MPM_NAMESPACE);
      // All three arms of the ternary this replaces evaluated to `arg1`; only the
      // asserted type differed, and assertions erase. In the multi-argument form
      // reached below, `arg1` *is* the author position.
      const author = arg1 as Author | null;
      const comment =
        arg2 !== undefined
          ? arg2
          : arg1 !== null && arg1 !== undefined && 'getText' in arg1
            ? arg1
            : null;
      const relatedResources = arg3 ?? null;

      if (arg2 === undefined && arg3 === undefined) {
        // Single argument factory
        if (arg1 !== null && arg1 !== undefined) {
          if ('getName' in arg1 && 'getNumber' in arg1) {
            // It's an Author
            metadata.appendChild(arg1.getXml());
          } else if ('getText' in arg1) {
            // It's a Comment
            metadata.appendChild(arg1.getXml());
          }
        }
      } else {
        if (author !== null && author !== undefined) metadata.appendChild(author.getXml());
        if (comment !== null && comment !== undefined) metadata.appendChild(comment.getXml());
        if (relatedResources !== null && relatedResources.length > 0) {
          const rrElt = new Element('relatedResources', MPM_NAMESPACE);
          metadata.appendChild(rrElt);
          // A null here used to be an `r!` that threw, which the enclosing `try` logged
          // before returning null. The failure is the same failure — a caller who passed
          // a `createRelatedResource` result without checking it — and it is still not
          // repaired, because a guard that skipped the null would silently accept the bad
          // array. What changes is that it now has a name. The check sits inside the loop
          // rather than ahead of it so that the resources before the null are re-parented
          // exactly as the throwing version left them.
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
      }
      return m.readFrom(metadata);
    }
  }

  /**
   * {@link parseData}, plus the one rule that makes a `Metadata` worth having.
   *
   * A metadata element that yielded no author, no comment and no related resource is not a
   * `Metadata` — the class has no empty state, which is why the check cannot live in a
   * validator the caller might skip. It used to be a `throw` at the foot of `parseData`
   * that the factory's `catch` turned into a logged null; it is now the `empty` arm, and
   * the difference is that a caller can tell it apart from a malformed one.
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
   * aborting — the same three skips as before, now reading the reason off a `Result` instead
   * of inferring it from a null. Nothing here reports those reasons on: a `<metadata>` with
   * one unreadable `<author>` is still a perfectly good `Metadata`, and collecting the
   * skipped children's reasons would be a second, larger change.
   */
  protected parseData(xml: Element): void {
    this.setXml(xml);
    for (const child of this.getXml().getChildElements()) {
      switch (child.getLocalName()) {
        case 'author': {
          const a = Author.createAuthor(child);
          if (isOk(a)) this.authors.push(a.value);
          break;
        }
        case 'comment': {
          const c = Comment.createComment(child);
          if (isOk(c)) this.comments.push(c.value);
          break;
        }
        case 'relatedResources': {
          const resources = allChildElements(child, 'resource');
          for (const resource of resources) {
            const r = RelatedResource.createRelatedResource(resource);
            if (isOk(r)) this.relatedResources.push(r.value);
          }
          break;
        }
      }
    }
  }

  addAuthor(author: Author): number {
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
   * bound is tested). The read used to hand back `undefined` typed as an `Author`.
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

  addComment(comment: Comment): number {
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
   * Related resources live inside a single `<relatedResources>` container element, which
   * this creates on demand — and {@link removeRelatedResource} deletes again once it is
   * empty, so the container never lingers without children.
   */
  /** Null is accepted and ignored — the guard below has always said so; now the type does. */
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
    // Through the bound-checked accessor, so an index past the end is the no-op that
    // `removeRelatedResource(null)` already spells out. The raw read handed it `undefined`,
    // which is not `null` and so walked straight past that guard into a property access on
    // nothing.
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
