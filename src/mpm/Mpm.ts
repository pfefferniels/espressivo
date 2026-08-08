import { Element, Attribute, Nodes, Elements, Document } from '../xml/XomTypes.js';
import { AbstractMsm } from '../msm/AbstractMsm.js';
import { Performance } from './elements/Performance.js';
import { Metadata } from './elements/metadata/Metadata.js';
// Side-effect imports: ensure map type factories are registered for Dated.addMapFromXml
import './elements/maps/DynamicsMap.js';
import './elements/maps/TempoMap.js';
import './elements/maps/RubatoMap.js';
import './elements/maps/AsynchronyMap.js';
import './elements/maps/ArticulationMap.js';
import './elements/maps/ImprecisionMap.js';
import './elements/maps/MetricalAccentuationMap.js';
import './elements/maps/OrnamentationMap.js';
import './elements/maps/MovementMap.js';
// Type-only imports: erased at compile time, so they add no module edge to the
// import cycle the value imports above are carefully ordered around.
import type { Author } from './elements/metadata/Author.js';
import type { Comment } from './elements/metadata/Comment.js';
import type { RelatedResource } from './elements/metadata/RelatedResource.js';

/**
 * `mei/Helper` in miniature, private to this module.
 *
 * `Mpm` deliberately does **not** import `mei/Helper`: that module pulls in the MEI half
 * of the port, and `Mpm` is the hub every mpm element imports (see the IMPORT-ORDER
 * HAZARD note on `GenericStyle`). These two local copies keep that edge from existing.
 * They behave exactly like their `mei/Helper` namesakes — do not "deduplicate" them
 * until the cycle is broken (item T18).
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
  static readonly MPM_NAMESPACE: string = 'http://www.cemfi.de/mpm/ns/1.0';

  // type constants of style definitions in the header environment
  static readonly ARTICULATION_STYLE: string = 'articulationStyles';
  static readonly ORNAMENTATION_STYLE: string = 'ornamentationStyles';
  static readonly DYNAMICS_STYLE: string = 'dynamicsStyles';
  static readonly METRICAL_ACCENTUATION_STYLE: string = 'metricalAccentuationStyles';
  static readonly TEMPO_STYLE: string = 'tempoStyles';
  static readonly RUBATO_STYLE: string = 'rubatoStyles';

  // map type constants that occur in the dated environment
  static readonly ARTICULATION_MAP: string = 'articulationMap';
  static readonly ORNAMENTATION_MAP: string = 'ornamentationMap';
  static readonly DYNAMICS_MAP: string = 'dynamicsMap';
  static readonly MOVEMENT_MAP: string = 'movementMap';
  static readonly METRICAL_ACCENTUATION_MAP: string = 'metricalAccentuationMap';
  static readonly TEMPO_MAP: string = 'tempoMap';
  static readonly RUBATO_MAP: string = 'rubatoMap';
  static readonly ASYNCHRONY_MAP: string = 'asynchronyMap';
  static readonly IMPRECISION_MAP: string = 'imprecisionMap';
  static readonly IMPRECISION_MAP_TIMING: string = 'imprecisionMap.timing';
  static readonly IMPRECISION_MAP_DYNAMICS: string = 'imprecisionMap.dynamics';
  static readonly IMPRECISION_MAP_TONEDURATION: string = 'imprecisionMap.toneduration';
  static readonly IMPRECISION_MAP_TUNING: string = 'imprecisionMap.tuning';

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
    relatedResources: RelatedResource[] | null,
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

    this.getRootElement()!.appendChild(this.metadata.getXml()!);
    return true;
  }

  /**
   * remove the complete metadata part from this MPM
   */
  removeMetadata(): void {
    if (this.metadata !== null && this.metadata.getXml() !== null) {
      this.getRootElement()!.removeChild(this.metadata.getXml()!);
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
  getAllPerformances(): Performance[] {
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
    if (performance.getXml() !== null) this.getRootElement()!.appendChild(performance.getXml()!);
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
        if (p.getXml() !== null) this.getRootElement()!.removeChild(p.getXml()!);
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
        if (performance.getXml() !== null)
          this.getRootElement()!.removeChild(performance.getXml()!);
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
