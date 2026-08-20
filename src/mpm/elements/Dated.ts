import { Element } from '../../xml/XomTypes.js';
import { AbstractXmlSubtree } from '../../xml/AbstractXmlSubtree.js';
import { descendantElements } from '../../xml/tree.js';
import { err, isErr, unwrapOr, type Result } from '../../prelude/index.js';
import { attemptParse, type MpmParseError } from './parseError.js';
import { MPM_NAMESPACE } from '../names.js';
import { GenericMap } from './maps/GenericMap.js';
import { mapOfKind, parseTypedMap, type MapKind, type MapOfKind } from './maps/map.js';
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
   * Create an empty `dated`, or one parsed from an existing `<dated>` element.
   *
   * Reports the reason rather than printing it — see `elements/parseError.ts`. The null
   * element is the one failure a caller can cause, and it is now checked here instead of
   * thrown from {@link parseData} and swallowed.
   */
  static createDated(xml?: Element | null): Result<Dated, MpmParseError> {
    const source = xml === undefined ? new Element('dated', MPM_NAMESPACE) : xml;
    if (source === null) return err({ kind: 'noElement', what: 'Dated' });
    return attemptParse('Dated', () => {
      const d = new Dated();
      d.parseData(source);
      return d;
    });
  }

  /**
   * After this has run, {@link getXml} returns the very element passed in — `setXml` stores
   * it verbatim rather than copying.
   *
   * Like {@link Header.parseData}, maps are discovered by name shape: any descendant whose
   * local name contains `Map`, plus `score`. {@link parseTypedMap} then picks the class for
   * known types and falls back to a plain {@link GenericMap} otherwise, so an unrecognised
   * `…Map` is preserved rather than dropped.
   */
  protected parseData(xml: Element): void {
    this.setXml(xml);

    const maps = descendantElements(this.getXml(), (element) => {
      const localName = element.getLocalName();
      return localName.includes('Map') || localName === 'score';
    });
    for (const map of maps) {
      this.addMapFromXml(map);
    }
  }

  /**
   * The two adders are mutators, and they answer a mutator's question — "is it in?" — so
   * they keep `GenericMap | null` while `parseTypedMap` below them gained a `Result`.
   *
   * That is the boundary, not an oversight. A caller of `addMapByType` is asking this
   * `dated` to hold a map; whether the element it was handed was readable is `parseTypedMap`'s
   * business, and it is the one that now says why. Where the reason would go from here is an
   * open question with no caller behind it: `parseData` below ignores these return values
   * entirely, and inventing a diagnostics channel on `Dated` for nobody would be the wrong
   * shape to guess at.
   */
  addMapFromXml(xml: Element): GenericMap | null {
    if (xml === null) return null;
    return this.addMap(unwrapOr(parseTypedMap(xml), null));
  }

  addMapByType(type: string): GenericMap | null {
    if (!type) return null;
    const generic = GenericMap.createGenericMap(type); // build the correctly named and namespaced map element
    if (isErr(generic)) return null;
    // and re-read it as its own class, where it has one
    return this.addMap(unwrapOr(parseTypedMap(generic.value.getXml()), null));
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

  /**
   * The map of one known kind, typed as that kind — {@link getMap} for the thirteen names
   * `maps/map.ts` has a class for.
   *
   * This is what removed the twenty-four `dated.getMap(TEMPO_MAP) as TempoMap | null` casts
   * in `Performance`. The two are not the same operation: the cast asserts that whatever is
   * filed under the key is of that class, and {@link addMap} cannot promise it — it accepts
   * any `GenericMap` and files it under `map.getType()`, so a plain `GenericMap` built from
   * a `<tempoMap>` element lands under `tempoMap` and satisfies the cast while answering
   * none of `TempoMap`'s methods. {@link mapOfKind} checks instead, and returns null for it.
   *
   * `getMap` stays for the callers that legitimately take any map — the MSM maps
   * `Performance` collects have no `MapKind` at all.
   */
  getMapOfKind<K extends MapKind>(kind: K): MapOfKind[K] | null {
    return mapOfKind(this.maps.get(kind) ?? null, kind);
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
