import { Attribute, Element } from '../../../xml/XomTypes.js';
import { Helper } from '../../../mei/Helper.js';
import { Mpm } from '../../../mpm/Mpm.js';
import { GenericStyle } from './GenericStyle.js';
import { ArticulationDef } from './defs/ArticulationDef.js';

export class ArticulationStyle extends GenericStyle<ArticulationDef> {
    private constructor() { super(); }

    static createArticulationStyle(name: string): ArticulationStyle | null;
    static createArticulationStyle(name: string, id: string): ArticulationStyle | null;
    static createArticulationStyle(xml: Element): ArticulationStyle | null;
    static createArticulationStyle(nameOrXml: string | Element, id?: string): ArticulationStyle | null {
        try {
            const as_ = new ArticulationStyle();
            if (typeof nameOrXml === 'string') {
                const e = new Element("styleDef", Mpm.MPM_NAMESPACE);
                e.addAttribute(new Attribute("name", nameOrXml));
                as_.parseData(e);
                if (id !== undefined) as_.setId(id);
            } else { as_.parseData(nameOrXml); }
            return as_;
        } catch (e) { console.error(e); return null; }
    }

    protected parseData(xml: Element): void {
        super.parseData(xml);
        const articDefs = Helper.getAllChildElements("articulationDef", this.getXml()!);
        if (articDefs) {
            for (const articDef of articDefs) {
                const ad = ArticulationDef.createArticulationDef(articDef);
                if (ad === null) continue;
                this.defs.set(ad.getName(), ad);
            }
        }
    }
}
