import { Attribute, Element } from '../../../../xml/XomTypes.js';
import type { MetricalAccentuationStyle } from '../../styles/MetricalAccentuationStyle.js';
import type { AccentuationPatternDef } from '../../styles/defs/AccentuationPatternDef.js';

/**
 * Port of meico.mpm.elements.maps.data.MetricalAccentuationData
 */
export class MetricalAccentuationData {
    xml: Element | null = null;
    xmlId: string | null = null;

    styleName: string = "";
    style: MetricalAccentuationStyle | null = null;

    accentuationPatternDefName: string | null = null;
    accentuationPatternDef: AccentuationPatternDef | null = null;

    startDate: number = 0.0;
    endDate: number | null = null;
    scale: number = 1.0;
    loop: boolean = false;
    stickToMeasures: boolean = true;

    constructor();
    constructor(xml: Element);
    constructor(xml?: Element) {
        if (xml === undefined) return;

        this.xml = xml;
        this.startDate = parseFloat(xml.getAttributeValue("date")!);
        this.accentuationPatternDefName = xml.getAttributeValue("name.ref");
        this.scale = parseFloat(xml.getAttributeValue("scale")!);

        const loopAtt = xml.getAttribute("loop");
        if (loopAtt !== null)
            this.loop = loopAtt.getValue() === "true";

        const stickToMeasuresAtt = xml.getAttribute("stickToMeasures");
        if (stickToMeasuresAtt !== null)
            this.stickToMeasures = stickToMeasuresAtt.getValue() === "true";

        const id = xml.getAttribute("id", "http://www.w3.org/XML/1998/namespace");
        if (id !== null)
            this.xmlId = id.getValue();
    }

    clone(): MetricalAccentuationData {
        const c = new MetricalAccentuationData();
        c.xml = (this.xml === null) ? null : this.xml.copy() as Element;
        c.xmlId = this.xmlId;
        c.styleName = this.styleName;
        c.style = this.style;
        c.startDate = this.startDate;
        c.endDate = this.endDate;
        c.accentuationPatternDefName = this.accentuationPatternDefName;
        c.accentuationPatternDef = this.accentuationPatternDef;
        c.scale = this.scale;
        c.loop = this.loop;
        c.stickToMeasures = this.stickToMeasures;
        return c;
    }
}
