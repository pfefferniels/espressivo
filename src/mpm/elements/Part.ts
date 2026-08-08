import { Attribute, Element } from '../../xml/XomTypes.js';
import { AbstractXmlSubtree } from '../../xml/AbstractXmlSubtree.js';
import { Helper } from '../../mei/Helper.js';
import { Mpm } from '../../mpm/Mpm.js';
import { Header } from './Header.js';
import { Dated } from './Dated.js';
import type { Global } from './Global.js';

export class Part extends AbstractXmlSubtree {
    private global: Global | null = null;
    private header: Header | null = null;
    private dated: Dated | null = null;
    private nameAttr: Attribute | null = null;
    private number: number = 0;
    private midiChannel: number = 0;
    private midiPort: number = 0;
    private id: Attribute | null = null;

    private constructor() { super(); }

    static createPart(name: string, number: number, midiChannel: number, midiPort: number): Part | null;
    static createPart(name: string, number: number, midiChannel: number, midiPort: number, id: string): Part | null;
    static createPart(xml: Element): Part | null;
    static createPart(nameOrXml: string | Element, number?: number, midiChannel?: number, midiPort?: number, id?: string): Part | null {
        try {
            const p = new Part();
            if (typeof nameOrXml === 'string') {
                const part = new Element("part", Mpm.MPM_NAMESPACE);
                part.addAttribute(new Attribute("name", nameOrXml));
                part.addAttribute(new Attribute("number", String(number)));
                part.addAttribute(new Attribute("midi.channel", String(midiChannel)));
                part.addAttribute(new Attribute("midi.port", String(midiPort)));
                p.parseData(part);
                if (id !== undefined) p.setId(id);
            } else { p.parseData(nameOrXml); }
            return p;
        } catch (e) { console.error(e); return null; }
    }

    protected parseData(xml: Element): void {
        if (xml === null) throw new Error("Cannot generate Part object. XML Element is null.");
        this.nameAttr = Helper.getAttribute("name", xml);
        if (this.nameAttr === null) { this.nameAttr = new Attribute("name", ""); xml.addAttribute(this.nameAttr); }
        const numberAttr = Helper.getAttribute("number", xml);
        if (numberAttr === null || numberAttr.getValue() === '') throw new Error("Cannot generate Part object. Attribute number is missing or empty.");
        const midiChannelAtt = Helper.getAttribute("midi.channel", xml);
        if (midiChannelAtt === null || midiChannelAtt.getValue() === '') throw new Error("Cannot generate Part object. Attribute midi.channel is missing or empty.");
        const midiPortAtt = Helper.getAttribute("midi.port", xml);
        if (midiPortAtt === null || midiPortAtt.getValue() === '') throw new Error("Cannot generate Part object. Attribute midi.port is missing or empty.");

        this.setXml(xml);
        this.number = parseInt(numberAttr.getValue());
        this.midiChannel = parseInt(midiChannelAtt.getValue());
        this.midiPort = parseInt(midiPortAtt.getValue());
        this.id = Helper.getAttribute("id", this.getXml()!);

        let headerElt = Helper.getFirstChildElement("header", this.getXml()!);
        if (headerElt === null) { this.header = Header.createHeader()!; this.getXml()!.appendChild(this.header.getXml()!); }
        else { this.header = Header.createHeader(headerElt); }

        let datedElt = Helper.getFirstChildElement("dated", this.getXml()!);
        if (datedElt === null) { this.dated = Dated.createDated()!; this.getXml()!.appendChild(this.dated.getXml()!); }
        else { this.dated = Dated.createDated(datedElt); }

        if (this.dated === null) throw new Error("Cannot generate Part object. Failed to generate Dated object.");
        this.dated.setEnvironment(this.global, this);
    }

    getHeader(): Header | null { return this.header; }
    getDated(): Dated | null { return this.dated; }
    getName(): string { return this.nameAttr!.getValue(); }
    setName(name: string): void { this.nameAttr!.setValue(name); }
    getNumber(): number { return this.number; }
    setNumber(number: number): void { this.number = number; Helper.getAttribute("number", this.getXml()!)!.setValue(String(this.number)); }
    getMidiChannel(): number { return this.midiChannel; }
    setMidiChannel(midiChannel: number): void { this.midiChannel = midiChannel; Helper.getAttribute("midi.channel", this.getXml()!)!.setValue(String(this.midiChannel)); }
    getMidiPort(): number { return this.midiPort; }
    setMidiPort(midiPort: number): void { this.midiPort = midiPort; Helper.getAttribute("midi.port", this.getXml()!)!.setValue(String(this.midiPort)); }
    setGlobal(global: Global | null): void { this.global = global; this.getDated()!.setEnvironment(this.global, this); }
    getGlobal(): Global | null { return this.global; }

    setId(id: string | null): void {
        if (id === null) { if (this.id !== null) { this.id.detach(); this.id = null; } return; }
        if (this.id === null) { this.id = new Attribute("xml:id", "http://www.w3.org/XML/1998/namespace", id); this.getXml()!.addAttribute(this.id); return; }
        this.id.setValue(id);
    }
    getId(): string | null { return this.id === null ? null : this.id.getValue(); }
}
