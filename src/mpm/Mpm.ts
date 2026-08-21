import { Element, Document } from '../xml/XomTypes.js';
import { allChildElements, firstChildElement } from '../xml/tree.js';
import { elementAt, isErr, unwrapOr } from '../prelude/index.js';
import { AbstractMsm } from '../msm/AbstractMsm.js';
import * as names from './names.js';
import { Performance } from './elements/Performance.js';
import { Metadata } from './elements/metadata/Metadata.js';
// There was a tenth import here — `import './elements/maps/index.js'`, a bare side-effect
// import of a barrel whose only job was to evaluate the nine map modules so that their
// `GenericMap.registerMapFactory(...)` statements would run. It is gone, along with the
// barrel and the registry: `Dated` now reaches the map classes through the ordinary value
// imports of `elements/maps/map.ts`'s dispatch table, so the module graph carries the
// dependency instead of module evaluation order. That is what let `package.json` drop its
// `sideEffects` list — see `maps/map.ts` for the measurement that made the hazard concrete.
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
   * Three overloads until now, all of the same arity and all with one parameter, so the only
   * thing they said that `Document | string | undefined` does not is that the modes are
   * named — and they were not named, they were numbered by position. `AbstractMsm` collapsed
   * the identical set for the identical reason, and its docstring makes the argument at
   * length. 22 `new Mpm(...)` call sites, none of which moves.
   *
   * The `instanceof`/`typeof` pair is not a leftover of the overload dispatch: it is the ONE
   * discrimination the body still needs, because a `Document` and a string are parsed while
   * `undefined` gets an empty document built for it. It also keeps the fourth arm the
   * overload set carried — an untyped (plain-JS) caller passing anything else lands here,
   * gets `init()`, and sees exactly what it saw before. Testing `source === undefined`
   * instead would send that caller down the parse path and leave it with no document at all.
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

  /**
   * An Mpm factory. Be aware that this is not a valid MPM document until a first Performance has been added!
   * @returns
   */
  static createMpm(): Mpm {
    return new Mpm();
  }

  /**
   * this parses the xml data and generates Performance objects from it that go into the performances array
   *
   * The root is read once and CHECKED, where both reads used to be `this.getRootElement()!`.
   * That claim turns out to be true, and the reason is three modules away rather than here,
   * so it is worth writing down: a `Document` always has a root, and unparsable source never
   * gets this far because `@xmldom/xmldom` THROWS its own `ParseError` out of
   * `Builder.build` — measured over seven malformed inputs (empty, whitespace, prose, a bare
   * declaration, JSON, an unclosed tag, a comment with no element), every one of which
   * raises `ParseError: missing root element` from inside `new Mpm(text)`. That is Java's
   * behaviour too; `Mpm(String)` declares `throws ParsingException`.
   *
   * The two module-local XOM helpers this file carried opened with `if (ofThis === null)`
   * guards which looked like they were holding that case up. They were not — nothing reaches
   * them with a null — and they are gone with the helpers, which
   * `tests/msm/navigationEquivalence.test.ts` established over the whole fixture corpus to be
   * `tree.firstChildElement` and `tree.allChildElements`; this file's copies were
   * byte-identical to the ones it probed.
   */
  private parseData(): void {
    const root = this.requireRootElement();

    // parse the metadata
    const metadataElement = firstChildElement('metadata', root);
    // An unreadable `<metadata>` is skipped exactly as it was — what changes is that the
    // reason arrives here as a value instead of going to the host's stderr from inside the
    // factory. Nothing in this class has anywhere to put it yet, so it is dropped here, and
    // that is the one place a caller could later be given it.
    if (metadataElement !== null)
      this.metadata = unwrapOr(Metadata.createMetadata(metadataElement), null);

    // parse the performances
    const perfs: Element[] = allChildElements(root, 'performance');

    for (const perf of perfs) {
      // go through all performance elements
      const p = Performance.createPerformance(perf); // generate an instance of class Performance from it
      if (isErr(p)) continue;
      this.performances.push(p.value);
    }
  }

  /**
   * a helper method for the constructor Mpm(), it creates an initial mpm document with a root element
   * @returns the root element
   */
  private init(): Element {
    const root = new Element('mpm', Mpm.MPM_NAMESPACE); // the second string defines the namespace
    this.data = new Document(root);
    return root;
  }

  /**
   * check whether the given name is in the Mpm namespace
   * @param elementName
   * @returns
   *
   * Every case is empty and falls through to the single `return true` — the switch is a
   * membership table, not a dispatch, and the blank-line groups below (document /
   * metadata / header / dated environment) are the only structure it has. This mirrors
   * `Mpm.java:193-255` case for case and in the same order, with **three additions**: the
   * reference misspells `'accentuation '` with a trailing space (Mpm.java:214) and
   * `'dynamcisGradient'` for `dynamicsGradient` (Mpm.java:218), and both correct
   * spellings are accepted here alongside the misspelled ones. Neither typo is removed —
   * a document written by Java meico may legitimately carry them — so the table is a
   * superset of the reference's and no name the reference accepts is rejected here.
   * See PARITY.md, "Fixed bugs".
   *
   * The third addition is `note`, the pool child an MPM v3 `<ornament>` may carry
   * (DESIGN.md D1). It belongs to the MPM namespace by the spec and the table would
   * otherwise report a valid v3 document's own elements as foreign. No v2 document
   * contains an `<ornament>` with children at all, so nothing that used to be answered
   * changes its answer.
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
   * add metadata to the MPM
   * @param author an Author object or null
   * @param comment a Comment object or null
   * @param relatedResources a collection of RelatedResource objects or null
   * @returns success
   *
   * Two distinct paths: if a `<metadata>` element already exists the arguments are
   * *appended* to it and the result is always `true`; otherwise a fresh `Metadata` is
   * built and hung off the root, and the result reports whether that succeeded.
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

    this.metadata = unwrapOr(Metadata.createMetadata(author, comment, relatedResources), null);
    if (this.metadata === null) return false;

    this.requireRootElement().appendChild(this.metadata.getXml());
    return true;
  }

  /**
   * remove the complete metadata part from this MPM
   */
  removeMetadata(): void {
    if (this.metadata !== null) {
      this.requireRootElement().removeChild(this.metadata.getXml());
    }
    this.metadata = null;
  }

  /**
   * a getter to access the metadata of this MPM
   * @returns
   */
  getMetadata(): Metadata | null {
    return this.metadata;
  }

  /**
   * get the number of performances in this mpm
   * @returns
   */
  size(): number {
    return this.performances.length;
  }

  /**
   * Get a performance by name.
   * If the mpm holds more than one performance with this name, this method will return only the first.
   * Use getAllPerformances() to access all performances and find the right one.
   * @param name
   * @returns the performance or null if there is no performance with this name
   */
  getPerformanceByName(name: string): Performance | null {
    for (const p of this.performances) {
      if (p.getName() === name) return p;
    }
    return null;
  }

  /**
   * Access a performance by index.
   *
   * The by-name arm of this overload set is gone, and nothing was lost with it: it was one
   * line, `return this.getPerformanceByName(name)`, and {@link getPerformanceByName} is a
   * published method of this class in its own right (as it is in Java). So the overload pair
   * was an alias whose only effect was to make `getPerformance` mean two things. Two src
   * call sites: `src/mei` passes a number and does not move, `src/api/pipeline.ts` used both
   * forms and now names which it wants.
   *
   * Only the upper bound is null, as in Java, where a negative index is an
   * IndexOutOfBoundsException out of `ArrayList.get` rather than an answer. The read used
   * to hand back `undefined` for one, typed as a `Performance`; it now throws, naming the
   * index and the bound.
   * @param i
   * @returns
   */
  getPerformance(i: number): Performance | null {
    if (i >= this.performances.length) return null;
    return elementAt(this.performances, i, 'performance');
  }

  /**
   * this returns all performances in this mpm as an array
   * @returns
   */
  getAllPerformances(): readonly Performance[] {
    return this.performances;
  }

  /**
   * add a performance to this mpm, but caution: if another performance with the same name exists already
   * in this mpm, accessing it via getPerformance(name) will return only the first in the list
   * @param performance
   * @returns success
   *
   * Java also overloads this name with `addPerformance(String)`, which builds a performance
   * from a name and returns it, and the port carried that arm over. It was declared and never
   * called — not once in `src/`, not once in `tests/` — so it is gone, together with the
   * `typeof` dispatch and the `boolean | Performance | null` implementation return type it
   * forced on the arm that IS used. A caller wanting the other behaviour already has it as
   * two readable lines: `Performance.createPerformance(name)`, then this method.
   *
   * Java additionally guards `performance.getXml() != null` before appending. Here it cannot
   * be null: a `Performance` only escapes its factory after `readFrom` has called `setXml`,
   * and `getXml()`'s return type says so. That guard is dropped rather than kept as an
   * unreachable branch; the null check below, which Java also has and which an untyped caller
   * CAN reach, stays and is now in the parameter type.
   */
  addPerformance(performance: Performance | null): boolean {
    if (performance === null) return false;
    this.requireRootElement().appendChild(performance.getXml());
    this.performances.push(performance);
    return true;
  }

  /**
   * remove all performances with the specified name from this mpm
   * @param name
   */
  removePerformanceByName(name: string): void {
    for (let i = this.performances.length - 1; i >= 0; --i) {
      const p = elementAt(this.performances, i, 'performance');
      if (p.getName() === name) {
        this.performances.splice(i, 1);
        // As {@link addPerformance}: Java's `getXml() != null` guard is unreachable
        // here, because a `Performance` a caller can hold has been through `setXml`.
        this.requireRootElement().removeChild(p.getXml());
      }
    }
  }

  /**
   * remove the specified performance from this mpm
   *
   * As {@link getPerformance}: the by-name arm was `return this.removePerformanceByName(name)`
   * and that method is published in its own right, so the overload pair was an alias. No
   * `src/` call site uses either form.
   * @param performance
   */
  removePerformance(performance: Performance): void {
    const idx = this.performances.indexOf(performance);
    if (idx !== -1) {
      this.performances.splice(idx, 1);
      this.requireRootElement().removeChild(performance.getXml());
    }
  }

  /**
   * writes the mpm document as XML string
   * @returns the XML string or null
   */
  writeMpm(): string | null {
    return this.exportXml();
  }

  /**
   * writes the mpm document to a string (filename parameter kept for API compatibility)
   * @param _filename the filename string (not used in TS port; kept for API compatibility)
   * @returns the XML string or null
   */
  writeMpmString(_filename?: string): string | null {
    return this.exportXml();
  }
}
