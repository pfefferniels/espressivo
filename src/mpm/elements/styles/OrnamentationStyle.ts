import { Attribute, Element } from '../../../xml/XomTypes.js';
import { Helper } from '../../../mei/Helper.js';
import { Mpm } from '../../../mpm/Mpm.js';
import { GenericStyle } from './GenericStyle.js';
import { OrnamentDef } from './defs/OrnamentDef.js';

export class OrnamentationStyle extends GenericStyle<OrnamentDef> {
    private constructor() { super(); }

    static createOrnamentationStyle(name: string): OrnamentationStyle | null;
    static createOrnamentationStyle(name: string, id: string): OrnamentationStyle | null;
    static createOrnamentationStyle(xml: Element): OrnamentationStyle | null;
    static createOrnamentationStyle(nameOrXml: string | Element, id?: string): OrnamentationStyle | null {
        try {
            const os = new OrnamentationStyle();
            if (typeof nameOrXml === 'string') {
                const e = new Element("styleDef", Mpm.MPM_NAMESPACE);
                e.addAttribute(new Attribute("name", nameOrXml));
                os.parseData(e);
                if (id !== undefined) os.setId(id);
            } else { os.parseData(nameOrXml); }
            return os;
        } catch (e) { console.error(e); return null; }
    }

    protected parseData(xml: Element): void {
        super.parseData(xml);
        const ornamentDefs = Helper.getAllChildElements("ornamentDef", this.getXml()!);
        if (ornamentDefs) {
            for (const def of ornamentDefs) {
                const od = OrnamentDef.createOrnamentDef(def);
                if (od === null) continue;
                this.defs.set(od.getName(), od);
            }
        }
    }
}
