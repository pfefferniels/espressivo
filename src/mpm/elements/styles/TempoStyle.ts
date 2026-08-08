import { Attribute, Element } from '../../../xml/XomTypes.js';
import { Helper } from '../../../mei/Helper.js';
import { Mpm } from '../../../mpm/Mpm.js';
import { GenericStyle } from './GenericStyle.js';
import { TempoDef } from './defs/TempoDef.js';

export class TempoStyle extends GenericStyle<TempoDef> {
    private constructor() { super(); }

    static createTempoStyle(name: string): TempoStyle | null;
    static createTempoStyle(name: string, id: string): TempoStyle | null;
    static createTempoStyle(xml: Element): TempoStyle | null;
    static createTempoStyle(nameOrXml: string | Element, id?: string): TempoStyle | null {
        try {
            const ts = new TempoStyle();
            if (typeof nameOrXml === 'string') {
                const e = new Element("styleDef", Mpm.MPM_NAMESPACE);
                e.addAttribute(new Attribute("name", nameOrXml));
                ts.parseData(e);
                if (id !== undefined) ts.setId(id);
            } else {
                ts.parseData(nameOrXml);
            }
            return ts;
        } catch (e) { console.error(e); return null; }
    }

    protected parseData(xml: Element): void {
        super.parseData(xml);
        const tempoDefs = Helper.getAllChildElements("tempoDef", this.getXml()!);
        if (tempoDefs) {
            for (const def of tempoDefs) {
                const td = TempoDef.createTempoDef(def);
                if (td === null) continue;
                this.defs.set(td.getName(), td);
            }
        }
    }

    getNumericBpmValue(tempoString: string): number {
        const tempoDef = this.getDef(tempoString);
        if (tempoDef !== undefined) return tempoDef.getValue();
        const val = parseFloat(tempoString);
        if (!isNaN(val)) return val;
        console.error(`Failed to convert tempo string "${tempoString}" to double. No tempoDef, no number format.`);
        return 100.0;
    }

    static getNumericBpmValueStatic(tempoString: string, style: TempoStyle | null): number {
        const tempoDef = (style !== null) ? style.getDef(tempoString) : undefined;
        if (tempoDef !== undefined) return tempoDef.getValue();
        const val = parseFloat(tempoString);
        if (!isNaN(val)) return val;
        console.error(`Failed to convert tempo string "${tempoString}" to double. No tempoDef, no number format.`);
        return 100.0;
    }
}
