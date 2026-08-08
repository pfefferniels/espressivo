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

/**
 * Helper functions that replicate meico.mei.Helper static methods used in Mpm.
 */
class Helper {
  static getAttribute(name: string, ofThis: Element): Attribute | null {
    if (ofThis === null) return null;

    let a = ofThis.getAttribute(name);
    if (a !== null) return a;

    a = ofThis.getAttribute(name, ofThis.getNamespaceURI());
    if (a !== null) return a;

    a = ofThis.getAttribute(name, 'http://www.w3.org/XML/1998/namespace');
    if (a !== null) return a;

    return null;
  }

  static getAttributeValue(name: string, ofThis: Element): string {
    const a = Helper.getAttribute(name, ofThis);
    if (a === null) return '';
    return a.getValue();
  }

  static getFirstChildElement(name: string, ofThis: Element): Element | null {
    if (ofThis === null || name.length === 0) return null;

    const es = ofThis.getChildElements();
    for (let i = 0; i < es.size(); ++i) {
      if (es.get(i).getLocalName() === name) {
        return es.get(i);
      }
    }
    return null;
  }

  static getAllChildElements(name: string, ofThis: Element): Element[] {
    if (ofThis === null || name.length === 0) return [];
    const es = ofThis.getChildElements(name);
    const result: Element[] = [];
    for (let i = 0; i < es.size(); ++i) {
      result.push(es.get(i));
    }
    return result;
  }

  static getFilenameWithoutExtension(filename: string): string {
    const i = filename.lastIndexOf('.');
    if (i === 0) return filename;
    if (i === -1) return filename;
    return filename.substring(0, i);
  }
}

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * This class holds data in mpm format (Music Performance Markup).
 * Port of meico.mpm.Mpm
 * @author Axel Berndt.
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
    const metadataElement = Helper.getFirstChildElement('metadata', this.getRootElement()!);
    if (metadataElement !== null) this.metadata = Metadata.createMetadata(metadataElement);

    // parse the performances
    const perfs: Element[] = Helper.getAllChildElements('performance', this.getRootElement()!);

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
   */
  isInNamespace(elementName: string): boolean {
    switch (elementName) {
      case 'mpm':

      case 'metadata':
      case 'author':
      case 'comment':
      case 'relatedResources':
      case 'resource':

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
   */
  addMetadata(author: any, comment: any, relatedResources: any[] | null): boolean {
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
