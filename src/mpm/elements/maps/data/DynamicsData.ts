import { Attribute, Element } from '../../../../xml/XomTypes.js';
import type { DynamicsStyle } from '../../styles/DynamicsStyle.js';
import type { DynamicsDef } from '../../styles/defs/DynamicsDef.js';

/**
 * This class is used to collect all relevant data to compute dynamics.
 * Port of meico.mpm.elements.maps.data.DynamicsData
 */
export class DynamicsData {
    xml: Element | null = null;
    xmlId: string | null = null;

    styleName: string = "";
    style: DynamicsStyle | null = null;
    dynamicsDefString: string | null = null;
    dynamicsDef: DynamicsDef | null = null;

    startDate: number = 0.0;
    endDate: number | null = null;

    volumeString: string | null = null;
    volume: number | null = null;

    transitionToString: string | null = null;
    transitionTo: number | null = null;

    curvature: number | null = null;
    protraction: number | null = null;
    subNoteDynamics: boolean = false;

    private x1: number | null = null;
    private x2: number | null = null;

    constructor();
    constructor(xml: Element);
    constructor(xml?: Element) {
        if (xml === undefined) return;

        this.xml = xml;
        this.startDate = parseFloat(xml.getAttributeValue("date")!);

        const volumeAtt = xml.getAttribute("volume");
        if (volumeAtt !== null) {
            const val = parseFloat(volumeAtt.getValue());
            if (!isNaN(val)) {
                this.volume = val;
            } else {
                this.volumeString = volumeAtt.getValue();
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

        const curvatureAtt = xml.getAttribute("curvature");
        if (curvatureAtt !== null)
            this.curvature = parseFloat(curvatureAtt.getValue());

        const protractionAtt = xml.getAttribute("protraction");
        if (protractionAtt !== null)
            this.protraction = parseFloat(protractionAtt.getValue());

        const subNoteDynamicsAtt = xml.getAttribute("subNoteDynamics");
        if (subNoteDynamicsAtt !== null)
            this.subNoteDynamics = subNoteDynamicsAtt.getValue() === "true";

        const id = xml.getAttribute("id", "http://www.w3.org/XML/1998/namespace");
        if (id !== null)
            this.xmlId = id.getValue();
    }

    clone(): DynamicsData {
        const c = new DynamicsData();
        c.xml = (this.xml === null) ? null : this.xml.copy() as Element;
        c.xmlId = this.xmlId;
        c.styleName = this.styleName;
        c.style = this.style;
        c.dynamicsDefString = this.dynamicsDefString;
        c.dynamicsDef = this.dynamicsDef;
        c.startDate = this.startDate;
        c.endDate = this.endDate;
        c.transitionToString = this.transitionToString;
        c.transitionTo = this.transitionTo;
        c.volumeString = this.volumeString;
        c.volume = this.volume;
        c.curvature = this.curvature;
        c.protraction = this.protraction;
        c.subNoteDynamics = this.subNoteDynamics;
        c.x1 = this.x1;
        c.x2 = this.x2;
        return c;
    }

    isConstantDynamics(): boolean {
        return (this.transitionTo === null) || (this.volume === null) || (this.transitionTo === this.volume);
    }

    private computeInnerControlPointsXPositions(): void {
        if (this.curvature === null)
            this.curvature = 0.0;
        if (this.protraction === null)
            this.protraction = 0.0;

        if (this.protraction === 0.0) {
            this.x1 = this.curvature;
            this.x2 = 1.0 - this.curvature;
            return;
        }

        this.x1 = this.curvature + ((Math.abs(this.protraction) + this.protraction) / (2.0 * this.protraction) - (Math.abs(this.protraction) / this.protraction) * this.curvature) * this.protraction;
        this.x2 = 1.0 - this.curvature + ((this.protraction - Math.abs(this.protraction)) / (2.0 * this.protraction) + (Math.abs(this.protraction) / this.protraction) * this.curvature) * this.protraction;
    }

    private getTForDate(date: number): number {
        if (date === this.startDate)
            return 0.0;
        if (date === this.endDate)
            return 1.0;
        if (this.x1 === null)
            this.computeInnerControlPointsXPositions();

        const s = this.endDate! - this.startDate;
        date = date - this.startDate;
        const u = (3.0 * this.x1!) - (3.0 * this.x2!) + 1.0;
        const v = (-6.0 * this.x1!) + (3.0 * this.x2!);
        const w = 3.0 * this.x1!;

        let t = 0.5;
        let diffX = ((((u * t) + v) * t + w) * t * s) - date;
        for (let tt = 0.25; Math.abs(diffX) >= 1.0; tt *= 0.5) {
            if (diffX > 0.0)
                t -= tt;
            else
                t += tt;
            diffX = ((((u * t) + v) * t + w) * t * s) - date;
        }
        return t;
    }

    getDynamicsAt(date: number): number {
        if ((date < this.startDate) || this.isConstantDynamics())
            return this.volume!;
        if (date >= this.endDate!)
            return this.transitionTo!;

        const t = this.getTForDate(date);
        return ((((3.0 - (2.0 * t)) * t * t) * (this.transitionTo! - this.volume!)) + this.volume!);
    }

    private getDateDynamics(t: number): number[] {
        const result = [0.0, 0.0];
        const x1_3 = 3.0 * this.x1!;
        const x2_3 = 3.0 * this.x2!;
        const u = x1_3 - x2_3 + 1.0;
        const v = (-6.0 * this.x1!) + x2_3;
        result[0] = ((((u * t) + v) * t + x1_3) * t * (this.endDate! - this.startDate)) + this.startDate;
        result[1] = ((((3.0 - (2.0 * t)) * t * t) * (this.transitionTo! - this.volume!)) + this.volume!);
        return result;
    }

    getSubNoteDynamicsSegment(maxStepSize: number): number[][] {
        if (this.x1 === null)
            this.computeInnerControlPointsXPositions();

        const ts: number[] = [0.0, 1.0];
        const series: number[][] = [];
        series.push(this.getDateDynamics(0.0));
        series.push(this.getDateDynamics(1.0));

        for (let i = 0; i < ts.length - 1; ++i) {
            while (Math.abs(series[i + 1][1] - series[i][1]) > maxStepSize) {
                const t = (ts[i] + ts[i + 1]) * 0.5;
                ts.splice(i + 1, 0, t);
                series.splice(i + 1, 0, this.getDateDynamics(t));
            }
        }

        return series;
    }
}
