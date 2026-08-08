import { Attribute, Element } from '../../../xml/XomTypes.js';
import { AbstractXmlSubtree } from '../../../xml/AbstractXmlSubtree.js';
import { Helper } from '../../../mei/Helper.js';
import { Mpm } from '../../../mpm/Mpm.js';

export class RelatedResource extends AbstractXmlSubtree {
    private uri: Attribute | null = null;
    private type: Attribute | null = null;

    private constructor() { super(); }

    static createRelatedResource(xml: Element): RelatedResource | null;
    static createRelatedResource(uri: string, type: string): RelatedResource | null;
    static createRelatedResource(xmlOrUri: Element | string, type?: string): RelatedResource | null {
        try {
            if (typeof xmlOrUri === 'string') {
                if (type === undefined) return null;
                const resourceElt = new Element("resource", Mpm.MPM_NAMESPACE);
                const r = new RelatedResource();
                r.parseData(resourceElt);
                r.setUri(xmlOrUri);
                r.setType(type);
                return r;
            } else {
                const r = new RelatedResource();
                r.parseData(xmlOrUri);
                return r;
            }
        } catch (e) { console.error(e); return null; }
    }

    protected parseData(xml: Element): void {
        if (xml === null) throw new Error("Cannot generate RelatedResource object. XML Element is null.");
        this.setXml(xml);
        this.uri = Helper.getAttribute("uri", xml);
        if (this.uri === null) { this.uri = new Attribute("uri", ""); this.getXml()!.addAttribute(this.uri); }
        this.type = Helper.getAttribute("type", xml);
        if (this.type === null) { this.type = new Attribute("type", ""); this.getXml()!.addAttribute(this.type); }
    }

    setUri(uri: string): void { this.uri!.setValue(uri); }
    getUri(): string { return this.uri!.getValue(); }
    setType(type: string): void { this.type!.setValue(type.replace(/\s+/g, "")); }
    getType(): string { return this.type!.getValue(); }
}
