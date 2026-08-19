import { Element } from '../../xml/XomTypes.js';
import { AbstractXmlSubtree } from '../../xml/AbstractXmlSubtree.js';
import { descendantElements } from '../../xml/tree.js';
import { MPM_NAMESPACE } from '../names.js';
import { GenericMap } from './maps/GenericMap.js';
import { Header } from './Header.js';
import type { Global } from './Global.js';
import type { Part } from './Part.js';

/**
 * An MPM `<dated>` element: the instruction maps of one environment, keyed by map type.
 * Port of meico.mpm.elements.Dated
 *
 * Where a {@link Header} holds the *definitions* (what "forte" means), a `dated` holds the
 * *instructions* on the timeline (be forte from here). Both a `Global` and a `Part` own
 * one. At most one map of each type may exist per environment, which is why {@link maps} is
 * keyed by {@link GenericMap.getType} and {@link addMap} replaces rather than appends.
 *
 * The environment link matters: {@link setEnvironment} pushes the owning global and local
 * headers into every map, and that is what lets a map resolve a `style` reference by name.
 * A map added later picks the same headers up in {@link addMap}, so the two stay consistent.
 *
 * The XML element is the single source of truth (see {@link AbstractXmlSubtree});
 * {@link maps} is a lookup index kept in step by {@link addMap}/{@link removeMap}.
 */
export class Dated extends AbstractXmlSubtree {
  private readonly maps = new Map<string, GenericMap>();
  private global: Global | null = null;
  private part: Part | null = null;

  private constructor() {
    super();
  }

  /**
   * Create an empty `dated`, or one parsed from an existing `<dated>` element. Returns null
   * — after logging — instead of throwing, as every factory in this cluster does.
   */
  static createDated(xml?: Element): Dated | null {
    try {
      const d = new Dated();
      if (xml !== undefined) d.parseData(xml);
      else d.parseData(new Element('dated', MPM_NAMESPACE));
      return d;
    } catch (e) {
      console.error(e);
      return null;
    }
  }

  /**
   * After this has run, {@link getXml} returns the very element passed in — `setXml` stores
   * it verbatim rather than copying.
   *
   * Like {@link Header.parseData}, maps are discovered by name shape: any descendant whose
   * local name contains `Map`, plus `score`. {@link GenericMap.createTypedMap} then picks
   * the subclass for known types and falls back to a plain {@link GenericMap} otherwise,
   * so an unrecognised `…Map` is preserved rather than dropped.
   */
  protected parseData(xml: Element): void {
    if (xml === null) throw new Error('Cannot generate Dated object. XML Element is null.');
    this.setXml(xml);

    const maps = descendantElements(this.getXml(), (element) => {
      const localName = element.getLocalName();
      return localName.includes('Map') || localName === 'score';
    });
    for (const map of maps) {
      this.addMapFromXml(map);
    }
  }

  addMapFromXml(xml: Element): GenericMap | null {
    if (xml === null) return null;
    const type = xml.getLocalName();
    const m = GenericMap.createTypedMap(type, xml);
    return this.addMap(m);
  }

  addMapByType(type: string): GenericMap | null {
    if (!type) return null;
    const generic = GenericMap.createGenericMap(type); // build the correctly named and namespaced map element
    if (generic === null) return null;
    const m = GenericMap.createTypedMap(type, generic.getXml()); // if the map is of a known type, generate the corresponding object type
    return this.addMap(m);
  }

  /**
   * Adopt a map: an existing map of the same type is removed first, the environment's
   * headers are pushed into it so it can resolve style references, and its element is
   * re-parented under this `dated` unless it already sits there.
   */
  addMap(map: GenericMap | null): GenericMap | null {
    if (map === null) return null;
    if (this.maps.has(map.getType())) this.removeMap(map.getType());

    const globalHeader = this.global === null ? null : this.global.getHeader();
    const localHeader = this.part === null ? null : this.part.getHeader();
    map.setHeaders(globalHeader, localHeader);

    this.maps.set(map.getType(), map);

    const parent = map.getXml().getParent();
    if (parent === null) this.getXml().appendChild(map.getXml());
    else if (parent !== this.getXml()) {
      map.getXml().detach();
      this.getXml().appendChild(map.getXml());
    }

    return map;
  }

  removeMap(type: string): void {
    const m = this.maps.get(type);
    if (m !== undefined) {
      this.maps.delete(type);
      this.getXml().removeChild(m.getXml());
    }
  }

  clear(): void {
    this.getXml().removeChildren();
    this.maps.clear();
  }
  getMap(type: string): GenericMap | null {
    return this.maps.get(type) ?? null;
  }
  getAllMaps(): ReadonlyMap<string, GenericMap> {
    return this.maps;
  }

  /**
   * Point this `dated` at its owning global and/or part, and propagate their headers to
   * every map already held. A `Global`'s dated has no part, so its maps see only a global
   * header; a `Part`'s dated sees both, and the local one wins during style lookup.
   */
  setEnvironment(global: Global | null, part: Part | null): void {
    this.global = global;
    this.part = part;
    const globalHeader = this.global === null ? null : this.global.getHeader();
    const localHeader = this.part === null ? null : this.part.getHeader();
    for (const map of this.maps.values()) map.setHeaders(globalHeader, localHeader);
  }

  getGlobal(): Global | null {
    return this.global;
  }
  getPart(): Part | null {
    return this.part;
  }
}
