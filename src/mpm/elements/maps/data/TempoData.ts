import { Attribute, Element } from '../../../../xml/XomTypes.js';
import type { TempoStyle } from '../../styles/TempoStyle.js';

/**
 * This class is used to collect all relevant data to compute tempo.
 * Port of meico.mpm.elements.maps.data.TempoData
 */
export class TempoData {
    xml: Element | null = null;
    xmlId: string | null = null;

    styleName: string = "";
    style: TempoStyle | null = null;

    startDate: number = 0.0;
    startDateMilliseconds: number | null = null;
    endDate: number | null = null;

    bpmString: string | null = null;
    bpm: number | null = null;

    transitionToString: string | null = null;
    transitionTo: number | null = null;

    beatLength: number = 0.25;

    meanTempoAt: number | null = null;
    exponent: number | null = null;

    constructor();
    constructor(xml: Element);
    constructor(xml?: Element) {
        if (xml === undefined) return;

        this.xml = xml;
        this.startDate = parseFloat(xml.getAttributeValue("date")!);
        this.beatLength = parseFloat(xml.getAttributeValue("beatLength")!);

        const bpmAtt = xml.getAttribute("bpm");
        if (bpmAtt !== null) {
            const val = parseFloat(bpmAtt.getValue());
            if (!isNaN(val)) {
                this.bpm = val;
            } else {
                this.bpmString = bpmAtt.getValue();
            }
        }

        const transitionToAtt = xml.getAttribute("transition.to");
        if (transitionToAtt !== null) {
            const val = parseFloat(transitionToAtt.getValue());
            if (!isNaN(val)) {
                this.transitionTo = val;
            } else {
                this.transitionToString = transitionToAtt.getValue();
            }
        }

        const meanTempoAtAtt = xml.getAttribute("meanTempoAt");
        if (meanTempoAtAtt !== null)
            this.meanTempoAt = parseFloat(meanTempoAtAtt.getValue());

        const id = xml.getAttribute("id", "http://www.w3.org/XML/1998/namespace");
        if (id !== null)
            this.xmlId = id.getValue();
    }

    clone(): TempoData {
        const c = new TempoData();
        c.xml = (this.xml === null) ? null : this.xml.copy() as Element;
        c.xmlId = this.xmlId;
        c.styleName = this.styleName;
        c.style = this.style;
        c.startDate = this.startDate;
        c.endDate = this.endDate;
        c.bpmString = this.bpmString;
        c.bpm = this.bpm;
        c.transitionToString = this.transitionToString;
        c.transitionTo = this.transitionTo;
        c.beatLength = this.beatLength;
        c.meanTempoAt = this.meanTempoAt;
        c.exponent = this.exponent;
        return c;
    }

    isConstantTempo(): boolean {
        return (this.transitionTo === null) || (this.bpm === null) || (this.transitionTo === this.bpm);
    }
}
