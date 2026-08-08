import { Element } from '../../xml/XomTypes.js';
import { AbstractXmlSubtree } from '../../xml/AbstractXmlSubtree.js';
import { Helper } from '../../mei/Helper.js';
import { Mpm } from '../../mpm/Mpm.js';
import { Header } from './Header.js';
import { Dated } from './Dated.js';

export class Global extends AbstractXmlSubtree {
    private header: Header | null = null;
    private dated: Dated | null = null;

    private constructor() { super(); }

    static createGlobal(): Global | null;
    static createGlobal(xml: Element): Global | null;
    static createGlobal(xml?: Element): Global | null {
        try {
            const g = new Global();
            if (xml !== undefined) g.parseData(xml);
            else g.parseData(new Element("global", Mpm.MPM_NAMESPACE));
            return g;
        } catch (e) { console.error(e); return null; }
    }

    protected parseData(xml: Element): void {
        if (xml === null) throw new Error("Cannot generate Global object. XML Element is null.");
        this.setXml(xml);

        let headerElt = Helper.getFirstChildElement("header", this.getXml()!);
        if (headerElt === null) { this.header = Header.createHeader()!; this.getXml()!.appendChild(this.header.getXml()!); }
        else { this.header = Header.createHeader(headerElt); }

        let datedElt = Helper.getFirstChildElement("dated", this.getXml()!);
        if (datedElt === null) { this.dated = Dated.createDated()!; this.getXml()!.appendChild(this.dated.getXml()!); }
        else { this.dated = Dated.createDated(datedElt); }

        if (this.dated === null) throw new Error("Cannot generate Global object. Failed to generate Dated object.");
        this.dated.setEnvironment(this, null);
    }

    getHeader(): Header | null { return this.header; }
    getDated(): Dated | null { return this.dated; }
}
