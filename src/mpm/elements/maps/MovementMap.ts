import { Attribute, Element } from '../../../xml/XomTypes.js';
import { Helper } from '../../../mei/Helper.js';
import { Mpm } from '../../../mpm/Mpm.js';
import { KeyValue } from '../../../supplementary/KeyValue.js';
import { GenericMap } from './GenericMap.js';
import { MovementData } from './data/MovementData.js';

export class MovementMap extends GenericMap {
    private constructor(typeOrXml: string | Element) { super(typeOrXml); }

    static createMovementMap(): MovementMap | null;
    static createMovementMap(xml: Element): MovementMap | null;
    static createMovementMap(xml?: Element): MovementMap | null {
        try { return xml !== undefined ? new MovementMap(xml) : new MovementMap("movementMap"); } catch (e) { console.error(e); return null; }
    }

    protected parseData(xml: Element): void { super.parseData(xml); }

    addMovement(date: number, controller: string, position: number, transitionTo: number, id: string): number;
    addMovement(data: MovementData): number;
    addMovement(dateOrData: number | MovementData, controller?: string, position?: number, transitionTo?: number, id?: string): number {
        if (typeof dateOrData !== 'number') {
            const data = dateOrData;
            const e = new Element("movement", Mpm.MPM_NAMESPACE);
            e.addAttribute(new Attribute("date", String(data.startDate)));
            if (data.position !== null) e.addAttribute(new Attribute("position", String(data.position)));
            if (data.transitionTo !== null) e.addAttribute(new Attribute("transition.to", String(data.transitionTo)));
            if (data.curvature !== null) e.addAttribute(new Attribute("curvature", String(data.curvature)));
            if (data.protraction !== null) e.addAttribute(new Attribute("protraction", String(data.protraction)));
            if (data.xmlId !== null) e.addAttribute(new Attribute("xml:id", "http://www.w3.org/XML/1998/namespace", data.xmlId));
            return this.insertElement(new KeyValue(data.startDate, e), false);
        }
        const date = dateOrData;
        const e = new Element("movement", Mpm.MPM_NAMESPACE);
        e.addAttribute(new Attribute("date", String(date)));
        e.addAttribute(new Attribute("position", String(position)));
        e.addAttribute(new Attribute("transition.to", String(transitionTo)));
        e.addAttribute(new Attribute("controller", controller!));
        e.addAttribute(new Attribute("xml:id", "http://www.w3.org/XML/1998/namespace", id!));
        return this.insertElement(new KeyValue(date, e), false);
    }

    getMovementDataOf(index: number): MovementData | null {
        if (this.elements.length === 0 || index < 0) return null;
        if (index >= this.elements.length) index = this.elements.length - 1;
        const e = this.elements[index].getValue();
        if (e.getLocalName() !== "movement") return null;
        const md = new MovementData();
        md.startDate = this.elements[index].getKey();
        md.endDate = this.getEndDate(index);
        md.xml = e;
        const att = Helper.getAttribute("id", e); if (att !== null) md.xmlId = att.getValue();
        const posAtt = Helper.getAttribute("position", e);
        if (posAtt === null) md.position = this.getPreviousPosition(index);
        else md.position = parseFloat(posAtt.getValue());
        const ttAtt = Helper.getAttribute("transition.to", e);
        if (ttAtt !== null) md.transitionTo = parseFloat(ttAtt.getValue());
        return md;
    }

    private getPreviousPosition(index: number): number {
        let finalPosition = 0;
        for (let j = index - 1; j > 0; --j) {
            if (this.elements[j].getValue().getLocalName() === "movement") {
                const ttAtt = this.elements[j].getValue().getAttribute("transition.to");
                if (ttAtt !== null) finalPosition = parseFloat(ttAtt.getValue());
                break;
            }
        }
        return finalPosition;
    }

    private getEndDate(index: number): number {
        for (let j = index + 1; j < this.elements.length; ++j) { if (this.elements[j].getValue().getLocalName() === "movement") return this.elements[j].getKey(); }
        return Number.MAX_VALUE;
    }

    renderMovementToMap(): GenericMap | null {
        const movementMap = GenericMap.createGenericMap("positionMap");
        for (let movementIndex = 0; movementIndex < this.size(); ++movementIndex) {
            const md = this.getMovementDataOf(movementIndex);
            if (md === null) continue;
            if (movementMap !== null && movementIndex < (this.size() - 1) && md.startDate >= 0) {
                MovementMap.generateMovement(md, movementMap);
            }
        }
        return movementMap;
    }

    static renderMovementToMap(movementMap: MovementMap | null): GenericMap | null {
        if (movementMap === null) return null;
        return movementMap.renderMovementToMap();
    }

    private static generateMovement(movementData: MovementData, movementMap: GenericMap): void {
        const movementSegment = movementData.getMovementSegment(0.1);
        for (const event of movementSegment) {
            const e = new Element("position", movementMap.getXml()!.getNamespaceURI());
            e.addAttribute(new Attribute("date", String(event[0])));
            e.addAttribute(new Attribute("value", String(event[1])));
            e.addAttribute(new Attribute("controller", movementData.controller));
            movementMap.addElement(e);
        }
    }
}


GenericMap.registerMapFactory('movementMap', (xml) => MovementMap.createMovementMap(xml));
