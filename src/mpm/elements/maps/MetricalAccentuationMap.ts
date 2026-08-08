import { Attribute, Element } from '../../../xml/XomTypes.js';
import { Helper } from '../../../mei/Helper.js';
import { Mpm } from '../../../mpm/Mpm.js';
import { KeyValue } from '../../../supplementary/KeyValue.js';
import { GenericMap } from './GenericMap.js';
import { MetricalAccentuationData } from './data/MetricalAccentuationData.js';
import { MetricalAccentuationStyle } from '../styles/MetricalAccentuationStyle.js';

export class MetricalAccentuationMap extends GenericMap {
    private constructor(typeOrXml: string | Element) { super(typeOrXml); }

    static createMetricalAccentuationMap(): MetricalAccentuationMap | null;
    static createMetricalAccentuationMap(xml: Element): MetricalAccentuationMap | null;
    static createMetricalAccentuationMap(xml?: Element): MetricalAccentuationMap | null {
        try { return xml !== undefined ? new MetricalAccentuationMap(xml) : new MetricalAccentuationMap("metricalAccentuationMap"); } catch (e) { console.error(e); return null; }
    }

    protected parseData(xml: Element): void { super.parseData(xml); }

    addAccentuationPattern(date: number, accentuationPatternDefName: string, scale: number, loop?: boolean, stickToMeasures?: boolean): number {
        const e = new Element("accentuationPattern", Mpm.MPM_NAMESPACE);
        e.addAttribute(new Attribute("date", String(date)));
        e.addAttribute(new Attribute("name.ref", accentuationPatternDefName));
        e.addAttribute(new Attribute("scale", String(scale)));
        if (loop !== undefined) e.addAttribute(new Attribute("loop", String(loop)));
        if (stickToMeasures !== undefined) e.addAttribute(new Attribute("stickToMeasures", String(stickToMeasures)));
        return this.insertElement(new KeyValue(date, e), false);
    }

    getMetricalAccentuationDataOf(index: number): MetricalAccentuationData | null {
        if (this.elements.length === 0 || index < 0) return null;
        if (index >= this.elements.length) index = this.elements.length - 1;
        const e = this.elements[index].getValue();
        if (e.getLocalName() !== "accentuationPattern") return null;
        const md = new MetricalAccentuationData();
        const nameRefAtt = Helper.getAttribute("name.ref", e); if (nameRefAtt === null) return null;
        md.accentuationPatternDefName = nameRefAtt.getValue();
        const scaleAtt = Helper.getAttribute("scale", e); if (scaleAtt === null) return null;
        md.scale = parseFloat(scaleAtt.getValue());
        md.startDate = this.elements[index].getKey();
        md.endDate = this.getEndDate(index);
        md.xml = e;
        const att = Helper.getAttribute("id", e); if (att !== null) md.xmlId = att.getValue();
        const loopAtt = Helper.getAttribute("loop", e); if (loopAtt !== null) md.loop = loopAtt.getValue() === "true";
        const stmAtt = Helper.getAttribute("stickToMeasures", e); if (stmAtt !== null) md.stickToMeasures = stmAtt.getValue() === "true";
        md.styleName = "";
        for (let j = index; j >= 0; --j) { const s = this.elements[j].getValue(); if (s.getLocalName() === "style") { md.styleName = Helper.getAttributeValue("name.ref", s); break; } }
        const gStyle = this.getStyle(Mpm.METRICAL_ACCENTUATION_STYLE, md.styleName) as MetricalAccentuationStyle | null;
        if (gStyle !== null) { md.style = gStyle; md.accentuationPatternDef = md.style.getDef(md.accentuationPatternDefName) ?? null; return md; }
        return null;
    }

    private getEndDate(index: number): number {
        for (let j = index + 1; j < this.elements.length; ++j) { if (this.elements[j].getValue().getLocalName() === "accentuationPattern") return this.elements[j].getKey(); }
        return Number.MAX_VALUE;
    }

    renderMetricalAccentuationToMap(map: GenericMap | null, timeSignatureMap: GenericMap | null, ppq: number): void {
        if (map === null || this.elements.length === 0) return;
        const ppq4 = 4.0 * ppq;
        let timeSignIndex = -1, tsDate = 0.0, tsNumerator = 4.0, tsDenominator = 4;
        let ticksPerBeat = ppq, tickLengthOfOneMeasure = ticksPerBeat * tsNumerator;
        let mapIndex = 0;
        for (let accIndex = 0; accIndex < this.size(); ++accIndex) {
            const md = this.getMetricalAccentuationDataOf(accIndex);
            if (md === null) continue;
            let patternLengthTicks = (md.accentuationPatternDef!.getLength() * ppq4) / tsDenominator;
            for (; mapIndex < map.size(); ++mapIndex) {
                const mapEntry = map.elements[mapIndex];
                if (mapEntry.getKey() < md.startDate) continue;
                const velocityAtt = Helper.getAttribute("velocity", mapEntry.getValue());
                if (velocityAtt === null) continue;
                if (timeSignatureMap !== null) {
                    let update = false;
                    for (let tsIndex = timeSignIndex + 1; tsIndex < timeSignatureMap.size(); ++tsIndex) {
                        if (timeSignatureMap.getAllElements()[tsIndex].getKey() > mapEntry.getKey()) break;
                        timeSignIndex = tsIndex; update = true;
                    }
                    if (update) {
                        const timeSign = timeSignatureMap.getAllElements()[timeSignIndex];
                        tsDate = timeSign.getKey();
                        tsNumerator = parseFloat(Helper.getAttributeValue("numerator", timeSign.getValue()));
                        tsDenominator = parseInt(Helper.getAttributeValue("denominator", timeSign.getValue()));
                        ticksPerBeat = ppq4 / tsDenominator;
                        tickLengthOfOneMeasure = ticksPerBeat * tsNumerator;
                        patternLengthTicks = (md.accentuationPatternDef!.getLength() * ppq4) / tsDenominator;
                    }
                }
                if (mapEntry.getKey() >= md.endDate! || (!md.loop && mapEntry.getKey() >= (md.startDate + patternLengthTicks))) break;
                let beat: number;
                if (md.stickToMeasures) beat = 1.0 + ((mapEntry.getKey() - tsDate) % tickLengthOfOneMeasure) / ticksPerBeat;
                else beat = 1.0 + ((mapEntry.getKey() - tsDate) % patternLengthTicks) / ticksPerBeat;
                const velocity = parseFloat(velocityAtt.getValue());
                const accentuation = md.accentuationPatternDef!.getAccentuationAt(beat);
                velocityAtt.setValue(String(velocity + (accentuation * md.scale)));
            }
        }
    }

    static renderMetricalAccentuationToMap(map: GenericMap | null, metricalAccentuationMap: MetricalAccentuationMap | null, timeSignatureMap: GenericMap | null, ppq: number): void {
        if (metricalAccentuationMap !== null) metricalAccentuationMap.renderMetricalAccentuationToMap(map, timeSignatureMap, ppq);
    }
}


GenericMap.registerMapFactory('metricalAccentuationMap', (xml) => MetricalAccentuationMap.createMetricalAccentuationMap(xml));
