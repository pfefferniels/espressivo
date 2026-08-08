import { Element } from '../../xml/XomTypes.js';
import { AbstractXmlSubtree } from '../../xml/AbstractXmlSubtree.js';
import { Mpm } from '../../mpm/Mpm.js';
import { GenericMap } from './maps/GenericMap.js';
import { Header } from './Header.js';
import type { Global } from './Global.js';
import type { Part } from './Part.js';

export class Dated extends AbstractXmlSubtree {
    private maps: Map<string, GenericMap> = new Map();
    private global: Global | null = null;
    private part: Part | null = null;

    private constructor() { super(); }

    static createDated(): Dated | null;
    static createDated(xml: Element): Dated | null;
    static createDated(xml?: Element): Dated | null {
        try {
            const d = new Dated();
            if (xml !== undefined) d.parseData(xml);
            else d.parseData(new Element("dated", Mpm.MPM_NAMESPACE));
            return d;
        } catch (e) { console.error(e); return null; }
    }

    protected parseData(xml: Element): void {
        if (xml === null) throw new Error("Cannot generate Dated object. XML Element is null.");
        this.setXml(xml);

        const maps = this.getXml()!.query("descendant::*[contains(local-name(), 'Map') or local-name()='score']");
        for (let s = 0; s < maps.size(); ++s) {
            this.addMapFromXml(maps.get(s) as Element);
        }
    }

    addMapFromXml(xml: Element): GenericMap | null {
        if (xml === null) return null;
        const type = xml.getLocalName();
        let m: GenericMap | null = null;
        m = GenericMap.createTypedMap(type, xml);
        return this.addMap(m);
    }

    addMapByType(type: string): GenericMap | null {
        if (!type) return null;
        const generic = GenericMap.createGenericMap(type);       // build the correctly named and namespaced map element
        if (generic === null) return null;
        const m = GenericMap.createTypedMap(type, generic.getXml()!);   // if the map is of a known type, generate the corresponding object type
        return this.addMap(m);
    }

    addMap(map: GenericMap | null): GenericMap | null {
        if (map === null) return null;
        if (this.maps.has(map.getType())) this.removeMap(map.getType());

        const globalHeader = (this.global === null) ? null : (this.global as any).getHeader();
        const localHeader = (this.part === null) ? null : (this.part as any).getHeader();
        map.setHeaders(globalHeader, localHeader);

        this.maps.set(map.getType(), map);

        const parent = map.getXml()!.getParent();
        if (parent === null) this.getXml()!.appendChild(map.getXml()!);
        else if (parent !== this.getXml()) { map.getXml()!.detach(); this.getXml()!.appendChild(map.getXml()!); }

        return map;
    }

    removeMap(type: string): void {
        const m = this.maps.get(type);
        if (m !== undefined) { this.maps.delete(type); this.getXml()!.removeChild(m.getXml()!); }
    }

    clear(): void { this.getXml()!.removeChildren(); this.maps.clear(); }
    getMap(type: string): GenericMap | null { return this.maps.get(type) ?? null; }
    getAllMaps(): Map<string, GenericMap> { return this.maps; }

    setEnvironment(global: Global | null, part: Part | null): void {
        this.global = global;
        this.part = part;
        const globalHeader = (this.global === null) ? null : (this.global as any).getHeader();
        const localHeader = (this.part === null) ? null : (this.part as any).getHeader();
        for (const map of this.maps.values()) map.setHeaders(globalHeader, localHeader);
    }

    getGlobal(): Global | null { return this.global; }
    getPart(): Part | null { return this.part; }
}
