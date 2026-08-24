import { Element, Document } from '../xml/XomTypes.js';
import { allChildElements, firstChildElement } from '../xml/tree.js';
import { elementAt, isErr, unwrapOr } from '../prelude/index.js';
import { AbstractMsm } from '../msm/AbstractMsm.js';
import * as names from './names.js';
import { Performance } from './elements/Performance.js';
import { Metadata } from './elements/metadata/Metadata.js';
import type { Author } from './elements/metadata/Author.js';
import type { Comment } from './elements/metadata/Comment.js';
import type { RelatedResource } from './elements/metadata/RelatedResource.js';

/**
 * This class holds data in mpm format (Music Performance Markup).
 * Port of meico.mpm.Mpm
 * @author Axel Berndt.
 *
 * An MPM document is `<mpm>` → optional `<metadata>` plus one or more `<performance>`
 * elements. A performance is the unit that gets *rendered*: {@link Performance.perform}
 * turns a symbolic MSM into a millisecond-timed, expressive one. This class is only the
 * document shell around them — parsing, lookup and add/remove.
 *
 * As everywhere in this port, the XML tree is the single source of truth (see
 * {@link AbstractXmlSubtree}); {@link metadata} and {@link performances} are lookup
 * indices kept in step by the add/remove methods, never written to directly.
 */
export class Mpm extends AbstractMsm {
  // The MPM vocabulary lives in `./names.ts`, which imports nothing — see RULE M3 and that
  // file's comment. These statics re-export it under the names Java's `Mpm` published, so
  // `Mpm.TEMPO_MAP` and friends keep working; inside `src/mpm/` import `names.js` directly.
  static readonly MPM_NAMESPACE: string = names.MPM_NAMESPACE;

  // type constants of style definitions in the header environment
  static readonly ARTICULATION_STYLE: string = names.ARTICULATION_STYLE;
  static readonly ORNAMENTATION_STYLE: string = names.ORNAMENTATION_STYLE;
  static readonly DYNAMICS_STYLE: string = names.DYNAMICS_STYLE;
  static readonly METRICAL_ACCENTUATION_STYLE: string = names.METRICAL_ACCENTUATION_STYLE;
  static readonly TEMPO_STYLE: string = names.TEMPO_STYLE;
  static readonly RUBATO_STYLE: string = names.RUBATO_STYLE;

  // map type constants that occur in the dated environment
  static readonly ARTICULATION_MAP: string = names.ARTICULATION_MAP;
  static readonly ORNAMENTATION_MAP: string = names.ORNAMENTATION_MAP;
  static readonly DYNAMICS_MAP: string = names.DYNAMICS_MAP;
  static readonly MOVEMENT_MAP: string = names.MOVEMENT_MAP;
  static readonly METRICAL_ACCENTUATION_MAP: string = names.METRICAL_ACCENTUATION_MAP;
  static readonly TEMPO_MAP: string = names.TEMPO_MAP;
  static readonly RUBATO_MAP: string = names.RUBATO_MAP;
  static readonly ASYNCHRONY_MAP: string = names.ASYNCHRONY_MAP;
  static readonly IMPRECISION_MAP: string = names.IMPRECISION_MAP;
  static readonly IMPRECISION_MAP_TIMING: string = names.IMPRECISION_MAP_TIMING;
  static readonly IMPRECISION_MAP_DYNAMICS: string = names.IMPRECISION_MAP_DYNAMICS;
  static readonly IMPRECISION_MAP_TONEDURATION: string = names.IMPRECISION_MAP_TONEDURATION;
  static readonly IMPRECISION_MAP_TUNING: string = names.IMPRECISION_MAP_TUNING;

  private metadata: Metadata | null = null;
  private readonly performances: Performance[] = [];

  /**
   * Nothing, an already-parsed {@link Document}, or MPM source text. Be aware that an empty
   * Mpm is not a valid MPM document until a first Performance has been added.
   *
   * The `instanceof`/`typeof` pair rather than `source === undefined`: an untyped (plain-JS)
   * caller passing anything else lands in the else arm and gets an empty document, where the
   * `undefined` test would send it down the parse path and leave it with no document at all.
   *
   * @param source the data as a XOM {@link Document}, or xml code as a UTF8 string, or
   *   nothing for an empty instance
   */
  constructor(source?: Document | string) {
    if (source instanceof Document || typeof source === 'string') {
      super(source);
      this.parseData();
    } else {
      super();
      this.init(); // create a plain empty xml structure
    }
  }

  /** An Mpm factory. Not a valid MPM document until a first Performance has been added. */
  static createMpm(): Mpm {
    return new Mpm();
  }

  /**
   * Parse the xml data into the {@link Performance} objects that go into the performances array.
   *
   * The root read is checked rather than asserted, and the claim it checks holds three modules
   * away: a `Document` always has a root, and unparsable source never gets this far because
   * `@xmldom/xmldom` THROWS its own `ParseError` out of `Builder.build` — measured over seven
   * malformed inputs (empty, whitespace, prose, a bare declaration, JSON, an unclosed tag, a
   * comment with no element), every one of which raises `ParseError: missing root element` from
   * inside `new Mpm(text)`. Java behaves the same way; `Mpm(String)` declares
   * `throws ParsingException`.
   *
   * An unreadable `<metadata>`, and any `<performance>` that fails to parse, are skipped. The
   * reasons are dropped here because this class has nowhere to put them yet.
   */
  private parseData(): void {
    const root = this.requireRootElement();

    const metadataElement = firstChildElement('metadata', root);
    if (metadataElement !== null) this.metadata = unwrapOr(Metadata.fromXml(metadataElement), null);

    const perfs: Element[] = allChildElements(root, 'performance');

    for (const perf of perfs) {
      const p = Performance.fromXml(perf);
      if (isErr(p)) continue;
      this.performances.push(p.value);
    }
  }

  /** Build the initial mpm document with a root element, for the no-argument constructor. */
  private init(): Element {
    const root = new Element('mpm', Mpm.MPM_NAMESPACE);
    this.data = new Document(root);
    return root;
  }

  /**
   * Whether the given name is in the Mpm namespace. Every case is empty and falls through to
   * the single `return true`: the switch is a membership table, not a dispatch.
   *
   * Mirrors `Mpm.java:193-255` case for case and in the same order, with three additions, so
   * the table is a superset of the reference's and rejects nothing the reference accepts:
   *
   * - `'accentuation'` and `'dynamicsGradient'`, the correct spellings of two names the
   *   reference misspells (Mpm.java:214, :218). The misspellings stay alongside them, since a
   *   document written by Java meico may legitimately carry them. See PARITY.md, "Fixed bugs".
   * - `note`, the pool child an MPM v3 `<ornament>` may carry, which the spec
   *   puts in the MPM namespace. No v2 document has an `<ornament>` with children at all, so
   *   no previous answer changes.
   */
  isInNamespace(elementName: string): boolean {
    switch (elementName) {
      case 'mpm':

      // falls through — metadata environment
      case 'metadata':
      case 'author':
      case 'comment':
      case 'relatedResources':
      case 'resource':

      // falls through — performance, global/part and header environment
      case 'performance':
      case 'global':
      case 'part':
      case 'header':
      case 'styleDef':
      case Mpm.ARTICULATION_STYLE:
      case 'articulationDef':
      case Mpm.DYNAMICS_STYLE:
      case 'dynamicsDef':
      case Mpm.METRICAL_ACCENTUATION_STYLE:
      case 'accentuationPatternDef':
      case 'accentuation ': // Mpm.java:214's trailing space, kept for Java-written files
      case 'accentuation':
      case Mpm.ORNAMENTATION_STYLE:
      case 'ornamentDef':
      case 'temporalSpread':
      case 'dynamcisGradient': // Mpm.java:218's misspelling, kept for Java-written files
      case 'dynamicsGradient':
      case Mpm.RUBATO_STYLE:
      case 'rubatoDef':
      case Mpm.TEMPO_STYLE:
      case 'tempoDef':

      // falls through — dated environment
      case 'dated':
      case 'style':
      case Mpm.ARTICULATION_MAP:
      case 'articulation':
      case Mpm.ASYNCHRONY_MAP:
      case 'asynchrony':
      case Mpm.DYNAMICS_MAP:
      case 'dynamics':
      case Mpm.IMPRECISION_MAP:
      case Mpm.IMPRECISION_MAP_DYNAMICS:
      case Mpm.IMPRECISION_MAP_TIMING:
      case Mpm.IMPRECISION_MAP_TONEDURATION:
      case Mpm.IMPRECISION_MAP_TUNING:
      case 'distribution.uniform':
      case 'distribution.gaussian':
      case 'distribution.triangular':
      case 'distribution.correlated.brownianNoise':
      case 'distribution.correlated.compensatingTriangle':
      case 'distribution.list':
      case 'measurement':
      case Mpm.METRICAL_ACCENTUATION_MAP:
      case 'accentuationPattern':
      case Mpm.ORNAMENTATION_MAP:
      case 'ornament':
      case 'note':
      case Mpm.RUBATO_MAP:
      case 'rubato':
      case Mpm.TEMPO_MAP:
      case 'tempo':
        return true;
    }
    return false;
  }

  /**
   * Add metadata to the MPM. Two paths: if a `<metadata>` element already exists the arguments
   * are *appended* to it and the result is always `true`; otherwise a fresh `Metadata` is built
   * and hung off the root, and the result reports whether that succeeded.
   */
  addMetadata(
    author: Author | null,
    comment: Comment | null,
    relatedResources: readonly (RelatedResource | null)[] | null,
  ): boolean {
    if (this.metadata !== null) {
      if (author !== null) this.metadata.addAuthor(author);
      if (comment !== null) this.metadata.addComment(comment);
      if (relatedResources !== null) {
        for (const resource of relatedResources) this.metadata.addRelatedResource(resource);
      }
      return true;
    }

    this.metadata = unwrapOr(Metadata.fromParts(author, comment, relatedResources), null);
    if (this.metadata === null) return false;

    this.requireRootElement().appendChild(this.metadata.getXml());
    return true;
  }

  /** Remove the complete metadata part from this MPM. */
  removeMetadata(): void {
    if (this.metadata !== null) {
      this.requireRootElement().removeChild(this.metadata.getXml());
    }
    this.metadata = null;
  }

  getMetadata(): Metadata | null {
    return this.metadata;
  }

  size(): number {
    return this.performances.length;
  }

  /**
   * The first performance with this name, or null. Use {@link getAllPerformances} where several
   * may share a name.
   */
  getPerformanceByName(name: string): Performance | null {
    for (const p of this.performances) {
      if (p.getName() === name) return p;
    }
    return null;
  }

  /**
   * Access a performance by index. Only the upper bound answers null; a NEGATIVE index throws,
   * as in Java, where `ArrayList.get` raises IndexOutOfBoundsException rather than answering.
   */
  getPerformance(i: number): Performance | null {
    if (i >= this.performances.length) return null;
    return elementAt(this.performances, i, 'performance');
  }

  getAllPerformances(): readonly Performance[] {
    return this.performances;
  }

  /**
   * Add a performance to this mpm. Duplicate names are allowed; {@link getPerformanceByName}
   * then answers only the first of them.
   *
   * No `getXml()` null check: a `Performance` only escapes its factory after `readFrom` has
   * called `setXml`.
   */
  addPerformance(performance: Performance): void {
    this.requireRootElement().appendChild(performance.getXml());
    this.performances.push(performance);
  }

  /** Remove all performances with the specified name from this mpm. */
  removePerformanceByName(name: string): void {
    for (let i = this.performances.length - 1; i >= 0; --i) {
      const p = elementAt(this.performances, i, 'performance');
      if (p.getName() === name) {
        this.performances.splice(i, 1);
        // No `getXml() != null` guard, for the reason given on {@link addPerformance}.
        this.requireRootElement().removeChild(p.getXml());
      }
    }
  }

  removePerformance(performance: Performance): void {
    const idx = this.performances.indexOf(performance);
    if (idx !== -1) {
      this.performances.splice(idx, 1);
      this.requireRootElement().removeChild(performance.getXml());
    }
  }

  /** The mpm document as an XML string, or null. */
  writeMpm(): string | null {
    return this.exportXml();
  }
}
