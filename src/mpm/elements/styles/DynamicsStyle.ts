import { Attribute, Element } from '../../../xml/XomTypes.js';
import { Helper } from '../../../mei/Helper.js';
import { Mpm } from '../../../mpm/Mpm.js';
import { GenericStyle } from './GenericStyle.js';
import { DynamicsDef } from './defs/DynamicsDef.js';

export class DynamicsStyle extends GenericStyle<DynamicsDef> {
    private constructor() { super(); }

    static createDynamicsStyle(name: string): DynamicsStyle | null;
    static createDynamicsStyle(name: string, id: string): DynamicsStyle | null;
    static createDynamicsStyle(xml: Element): DynamicsStyle | null;
    static createDynamicsStyle(nameOrXml: string | Element, id?: string): DynamicsStyle | null {
        try {
            const ds = new DynamicsStyle();
            if (typeof nameOrXml === 'string') {
                const e = new Element("styleDef", Mpm.MPM_NAMESPACE);
                e.addAttribute(new Attribute("name", nameOrXml));
                ds.parseData(e);
                if (id !== undefined) ds.setId(id);
            } else { ds.parseData(nameOrXml); }
            return ds;
        } catch (e) { console.error(e); return null; }
    }

    protected parseData(xml: Element): void {
        super.parseData(xml);
        const dynamicsDefs = Helper.getAllChildElements("dynamicsDef", this.getXml()!);
        if (dynamicsDefs) {
            for (const def of dynamicsDefs) {
                const dd = DynamicsDef.createDynamicsDef(def);
                if (dd === null) continue;
                this.defs.set(dd.getName(), dd);
            }
        }
    }

    getNumericValue(dynamicsString: string): number {
        const dynamicsDef = this.getDef(dynamicsString);
        if (dynamicsDef !== undefined) return dynamicsDef.getValue();
        const val = parseFloat(dynamicsString);
        if (!isNaN(val)) return val;
        console.error(`Failed to convert dynamics string "${dynamicsString}" to double.`);
        return 100.0;
    }

    static getNumericValueStatic(dynamicsString: string, style: DynamicsStyle | null): number {
        const dynamicsDef = (style !== null) ? style.getDef(dynamicsString) : undefined;
        if (dynamicsDef !== undefined) return dynamicsDef.getValue();
        const val = parseFloat(dynamicsString);
        if (!isNaN(val)) return val;
        console.error(`Failed to convert dynamics string "${dynamicsString}" to double.`);
        return 100.0;
    }
}
