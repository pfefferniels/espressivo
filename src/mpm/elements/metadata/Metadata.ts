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
   * Build a metadata element from an existing `<metadata>`, from any one of the three
   * content kinds, or from all three at once.
   *
   * The four single-argument forms were four overloads, and the body picked between them by
   * **duck typing**: `getName`+`getNumber` identified an {@link Author}, `getText` a
   * {@link Comment}. The comment above them explained that this was why they could not be
   * collapsed onto a union — the argument's *shape* selected the behaviour — and then named
   * the hazard that follows from it: adding a `getText` to `Author`, or a `getName` to
   * `Comment`, would silently re-route callers.
   *
   * Both of those are gone together. `Author`, `Comment` and `Element` are classes, so
   * `instanceof` decides this, and one union signature says exactly what the four said. It
   * is also closer to the reference than the overload set was: Java's five `createMetadata`
   * factories are five one-line delegations to ONE private constructor
   * `Metadata(Author, Comment, Collection<RelatedResource>)` (Metadata.java:37-131), which
   * is {@link build} below. The duck typing was a port artefact, not a ported behaviour.
   *
   * Returns the reason instead of printing it, as every factory in this cluster now does;
   * note that "no usable content" is one of the failures, and it is the `empty` arm.
   */
  static fromXml(xml: Element): Result<Metadata, MpmParseError> {
    return new Metadata().readFrom(xml);
  }

  /**
   * Build a `<metadata>` from its three possible contents, any of which may be absent.
   *
   * This is Java's private `Metadata(Author, Comment, Collection<RelatedResource>)`, promoted
   * to the public API because it is what all five of Java's factories delegate to anyway —
   * see {@link build}. The overload set that used to stand here was the worst shape in the
   * cluster, and worth recording as the argument for splitting the rest:
   *
   * its first arm took `Element | Author | Comment | RelatedResource[]`, so the ARGUMENT'S
   * TYPE selected the behaviour, and `undefined` in both trailing positions was the only
   * thing separating that arm from this one — which meant an `Author` in position 1 meant
   * two different things depending on how many arguments followed it. The single-value forms
   * were one-line delegations here (`build(author, null, null)` and friends), so they are
   * gone rather than renamed: `fromParts(author, null, null)` is the same call, spelled so
   * that reading it does not require knowing the dispatch rule.
   *
   * The resources may individually be null, because callers build the array out of
   * `RelatedResource` results. A null in the array is a caller error, and it stays one —
   * see {@link build}.
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
   * of its five factories delegates to.
   *
   * A null in `relatedResources` used to be an `r!` that threw, which the enclosing `try`
   * logged before returning null. The failure is the same failure — a caller who passed a
   * `createRelatedResource` result without checking it — and it is still not repaired,
   * because a guard that skipped the null would silently accept the bad array. What changes
   * is that it now has a name. The check sits inside the loop rather than ahead of it so
   * that the resources before the null are re-parented exactly as the throwing version left
   * them.
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

  /** Null is accepted and ignored (Metadata.java:187) — the guard says so; now the type does. */
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

  /** As {@link addAuthor}: null is accepted and ignored, and the type now says so. */
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
