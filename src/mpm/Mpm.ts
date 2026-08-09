import { Element, Attribute, Nodes, Elements, Document } from '../xml/XomTypes.js';
import { AbstractMsm } from '../msm/AbstractMsm.js';
import * as names from './names.js';
import { Performance } from './elements/Performance.js';
import { Metadata } from './elements/metadata/Metadata.js';
// Side-effect import: registers the typed-map factories for Dated.addMapFromXml. See the
// barrel's own comment for why an import is the registration mechanism (RULE M4).
import './elements/maps/index.js';
import type { Author } from './elements/metadata/Author.js';
import type { Comment } from './elements/metadata/Comment.js';
import type { RelatedResource } from './elements/metadata/RelatedResource.js';

/**
 * Java's `Helper` in miniature, private to this module.
 *
 * These two are byte-identical to their namesakes in `Msm.ts`, and behave like the shared
 * `src/xml/tree.ts` versions T14 moved `mei/Helper`'s statics into. Do not "deduplicate"
 * them against `tree.ts` on sight: that set has behaviourally drifted from these
 * module-local copies, and reconciling them needs a per-method behavioural comparison
 * (RULE M2a; T16b owns it).
 *
 * Java's `Mpm.java` calls exactly these two Helper methods and no others
 * (Mpm.java:160,165).
 */
function getFirstChildElement(name: string, ofThis: Element): Element | null {
  if (ofThis === null || name.length === 0) return null;

  const es = ofThis.getChildElements();
  for (let i = 0; i < es.size(); ++i) {
    if (es.get(i).getLocalName() === name) {
      return es.get(i);
    }
  }
  return null;
}

function getAllChildElements(name: string, ofThis: Element): Element[] {
  if (ofThis === null || name.length === 0) return [];
  const es = ofThis.getChildElements(name);
  const result: Element[] = [];
  for (let i = 0; i < es.size(); ++i) {
    result.push(es.get(i));
  }
  return result;
}

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
   * Constructor. Be aware that this is not a valid MPM document until a first Performance has been added!
   */
  constructor();
  /**
   * constructor
   * @param mpm the mpm document of which to instantiate the Mpm object
   */
  constructor(mpm: Document);
  /**
   * constructor
   * @param xml xml code as UTF8 String
   */
  constructor(xml: string);
  constructor(arg?: Document | string) {
    if (arg === undefined) {
      super();
      this.init(); // create a plain empty xml structure
    } else if (arg instanceof Document) {
      super(arg);
      this.parseData();
    } else if (typeof arg === 'string') {
      super(arg);
      this.parseData();
    } else {
      // Unreachable from TypeScript — `arg` is exhausted above. Kept as the defensive
      // fallback for untyped (plain-JS) callers, who would otherwise reach `super()`
      // uninitialised. Deleting it would change behaviour for `new Mpm(<anything else>)`.
      super();
      this.init();
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
   */
  private parseData(): void {
    // parse the metadata
    const metadataElement = getFirstChildElement('metadata', this.getRootElement()!);
    if (metadataElement !== null) this.metadata = Metadata.createMetadata(metadataElement);

    // parse the performances
    const perfs: Element[] = getAllChildElements('performance', this.getRootElement()!);

    for (const perf of perfs) {
      // go through all performance elements
      const p = Performance.createPerformance(perf); // generate an instance of class Performance from it
      if (p === null) continue;
      this.performances.push(p);
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
   * `Mpm.java:193-255` case for case, in the same order, **including two typos that are
   * part of the vocabulary as shipped**: `'accentuation '` carries a trailing space
   * (Mpm.java:214) and `'dynamcisGradient'` misspells `dynamicsGradient`
   * (Mpm.java:218). Both are reproduced verbatim: correcting either would accept a name
   * the reference rejects, and reject one it accepts.
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
      case 'accentuation ':
      case Mpm.ORNAMENTATION_STYLE:
      case 'ornamentDef':
      case 'temporalSpread':
      case 'dynamcisGradient':
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

    this.metadata = Metadata.createMetadata(author, comment, relatedResources);
    if (this.metadata === null) return false;

    this.getRootElement()!.appendChild(this.metadata.getXml());
    return true;
  }

  /**
   * remove the complete metadata part from this MPM
   */
  removeMetadata(): void {
    if (this.metadata !== null) {
      this.getRootElement()!.removeChild(this.metadata.getXml());
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
   * access a performance by index
   * @param i
   * @returns
   */
  getPerformance(i: number): Performance | null;
  /**
   * Get a performance by name.
   * @param name
   * @returns
   */
  getPerformance(name: string): Performance | null;
  getPerformance(nameOrIndex: string | number): Performance | null {
    if (typeof nameOrIndex === 'number') {
      if (nameOrIndex >= this.performances.length) return null;
      return this.performances[nameOrIndex];
    } else {
      return this.getPerformanceByName(nameOrIndex);
    }
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
   */
  addPerformance(performance: Performance): boolean;
  /**
   * generate a performance and add it to this mpm
   * @param name
   * @returns the created Performance or null
   */
  addPerformance(name: string): Performance | null;
  addPerformance(performanceOrName: Performance | string): boolean | Performance | null {
    if (typeof performanceOrName === 'string') {
      // addPerformance(name: string)
      const performance = Performance.createPerformance(performanceOrName);
      if (performance === null) return null;
      this.addPerformanceObject(performance);
      return performance;
    } else {
      // addPerformance(performance: Performance)
      return this.addPerformanceObject(performanceOrName);
    }
  }

  /**
   * Internal method to add a Performance object
   * @param performance
   * @returns success
   */
  private addPerformanceObject(performance: Performance): boolean {
    if (performance === null) return false;
    if (performance.getXml() !== null) this.getRootElement()!.appendChild(performance.getXml());
    this.performances.push(performance);
    return true;
  }

  /**
   * remove all performances with the specified name from this mpm
   * @param name
   */
  removePerformanceByName(name: string): void {
    for (let i = this.performances.length - 1; i >= 0; --i) {
      const p = this.performances[i];
      if (p.getName() === name) {
        this.performances.splice(i, 1);
        if (p.getXml() !== null) this.getRootElement()!.removeChild(p.getXml());
      }
    }
  }

  /**
   * remove the specified performance from this mpm
   * @param performance
   */
  removePerformance(performance: Performance): void;
  /**
   * remove all performances with the specified name from this mpm
   * @param name
   */
  removePerformance(name: string): void;
  removePerformance(performanceOrName: Performance | string): void {
    if (typeof performanceOrName === 'string') {
      this.removePerformanceByName(performanceOrName);
    } else {
      const performance = performanceOrName;
      const idx = this.performances.indexOf(performance);
      if (idx !== -1) {
        this.performances.splice(idx, 1);
        this.getRootElement()!.removeChild(performance.getXml());
      }
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
