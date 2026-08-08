import { Attribute, Element } from '../../../xml/XomTypes.js';
import { AbstractXmlSubtree } from '../../../xml/AbstractXmlSubtree.js';
import { Helper } from '../../../mei/Helper.js';
import { Mpm } from '../../../mpm/Mpm.js';
import { AbstractDef } from './defs/AbstractDef.js';

/**
 * Port of meico.mpm.elements.styles.GenericStyle
 */
export class GenericStyle<E extends AbstractDef = AbstractDef> extends AbstractXmlSubtree {
    private nameAttr!: Attribute;
    protected id: Attribute | null = null;
    protected defs: Map<string, E> = new Map();

    protected constructor() { super(); }

    protected parseData(xml: Element): void {
        if (xml === null) throw new Error("Cannot generate GenericStyleDef object. XML Element is null.");
        this.nameAttr = Helper.getAttribute("name", xml)!;
        if (this.nameAttr === null) throw new Error("Cannot generate GenericStyleDef object. Missing name attribute.");
        this.setXml(xml);
        this.id = Helper.getAttribute("id", this.getXml()!);
        this.defs = new Map();
    }

    static createGenericStyle(name: string): GenericStyle | null;
    static createGenericStyle(name: string, id: string): GenericStyle | null;
    static createGenericStyle(xml: Element): GenericStyle | null;
    static createGenericStyle(nameOrXml: string | Element, id?: string): GenericStyle | null {
        try {
            const gs = new GenericStyle();
            if (typeof nameOrXml === 'string') {
                const styleDef = new Element("styleDef", Mpm.MPM_NAMESPACE);
                styleDef.addAttribute(new Attribute("name", nameOrXml));
                gs.parseData(styleDef);
                if (id !== undefined) gs.setId(id);
            } else {
                gs.parseData(nameOrXml);
            }
            return gs;
        } catch (e) { console.error(e); return null; }
    }

    getName(): string { return this.nameAttr.getValue(); }
    protected setName(name: string): void { this.nameAttr.setValue(name); }

    setId(id: string | null): void {
        if (id === null) {
            if (this.id !== null) { this.id.detach(); this.id = null; }
            return;
        }
        if (this.id === null) {
            this.id = new Attribute("xml:id", "http://www.w3.org/XML/1998/namespace", id);
            this.getXml()!.addAttribute(this.id);
            return;
        }
        this.id.setValue(id);
    }

    getId(): string | null { return this.id === null ? null : this.id.getValue(); }
    getAllDefs(): Map<string, E> { return this.defs; }
    getDef(name: string): E | undefined { return this.defs.get(name) ?? undefined; }

    addDef(def: E): void {
        if (def === null) { console.error("Cannot add a null object to the styleDef."); return; }
        this.removeDef(def.getName());
        this.defs.set(def.getName(), def);
        this.getXml()!.appendChild(def.getXml()!);
    }

    removeDef(name: string): void {
        const ad = this.defs.get(name);
        if (ad === undefined) return;
        this.defs.delete(name);
        this.getXml()!.removeChild(ad.getXml()!);
    }

    size(): number { return this.defs.size; }
    isEmpty(): boolean { return this.defs.size === 0; }
}
