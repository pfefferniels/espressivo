import { Attribute, Element } from '../../../xml/XomTypes.js';
import { AbstractXmlSubtree } from '../../../xml/AbstractXmlSubtree.js';
import { Helper } from '../../../mei/Helper.js';
import { Header } from '../Header.js';
import { KeyValue } from '../../../supplementary/KeyValue.js';
import { GenericStyle } from '../styles/GenericStyle.js';

const MPM_NAMESPACE = "http://www.cemfi.de/mpm/ns/1.0";

/** Map/element names that belong to the MPM namespace */
const MPM_NAMES = new Set([
    "articulationMap", "articulation", "asynchronyMap", "asynchrony",
    "dynamicsMap", "dynamics", "imprecisionMap", "imprecisionMap.timing",
    "imprecisionMap.dynamics", "imprecisionMap.toneduration", "imprecisionMap.tuning",
    "distribution.uniform", "distribution.gaussian", "distribution.triangular",
    "distribution.correlated.brownianNoise", "distribution.correlated.compensatingTriangle",
    "distribution.list", "measurement", "metricalAccentuationMap", "accentuationPattern",
    "ornamentationMap", "ornament", "rubatoMap", "rubato", "tempoMap", "tempo",
    "movementMap", "movement", "style",
]);

/**
 * Port of meico.mpm.elements.maps.GenericMap
 */
export class GenericMap extends AbstractXmlSubtree {
    private static readonly _factories = new Map<string, (xml: Element) => GenericMap | null>();

    static registerMapFactory(type: string, factory: (xml: Element) => GenericMap | null): void {
        GenericMap._factories.set(type, factory);
    }

    static createTypedMap(type: string, xml: Element): GenericMap | null {
        const factory = GenericMap._factories.get(type);
        if (factory) return factory(xml);
        return GenericMap.createGenericMap(xml);
    }

    elements: KeyValue<number, Element>[] = [];
    private globalHeader: Header | null = null;
    private localHeader: Header | null = null;
    protected id: Attribute | null = null;

    protected constructor(type: string);
    protected constructor(xml: Element);
    protected constructor(typeOrXml: string | Element);
    protected constructor(typeOrXml: string | Element) {
        super();
        if (typeof typeOrXml === 'string') {
            const type = typeOrXml;
            if (!type.includes("Map") && type !== "score")
                throw new Error(`Cannot generate GenericMap object. Local name "${type}" must contain "Map" or equal "score".`);
            if (MPM_NAMES.has(type))
                this.parseData(new Element(type, MPM_NAMESPACE));
            else
                this.parseData(new Element(type));
        } else {
            this.parseData(typeOrXml);
        }
    }

    static createGenericMap(name: string): GenericMap | null;
    static createGenericMap(xml: Element): GenericMap | null;
    static createGenericMap(nameOrXml: string | Element): GenericMap | null {
        try {
            if (typeof nameOrXml === 'string') return new GenericMap(nameOrXml);
            else return new GenericMap(nameOrXml);
        } catch (e) { console.error(e); return null; }
    }

    protected parseData(xml: Element): void {
        if (xml === null) throw new Error("Cannot generate GenericMap object. XML Element is null.");
        if (!xml.getLocalName().includes("Map") && xml.getLocalName() !== "score")
            throw new Error(`Cannot generate GenericMap object. Local name "${xml.getLocalName()}" must contain "Map" or equal "score".`);

        this.elements = [];
        this.setXml(xml);

        const es = this.getXml()!.getChildElements();
        for (let i = 0; i < es.size(); ++i) {
            const e = es.get(i);
            const d = Helper.getAttribute("date", e);
            if (d === null) continue;
            if (e.getLocalName() === "style" && Helper.getAttribute("name.ref", e) === null) continue;
            const date = parseFloat(d.getValue());
            let index = 0;
            for (let j = this.elements.length - 1; j >= 0; --j) {
                if (date >= this.elements[j].getKey()) { index = j + 1; break; }
            }
            this.elements.splice(index, 0, new KeyValue(date, e));
        }
        this.sortXml();
        this.id = Helper.getAttribute("id", this.getXml()!);
    }

    private sortXml(): void {
        const xml = this.getXml()!;
        for (let i = 0; i < this.elements.length; ++i) {
            const e = this.elements[i].getValue();
            xml.removeChild(e);
            xml.insertChild(e, i);
        }
    }

    sort(): void {
        for (const e of this.elements) {
            const date = parseFloat(Helper.getAttributeValue("date", e.getValue()));
            if (e.getKey() !== date) e.setKey(date);
        }
        for (let i = 1; i < this.size(); ++i) {
            const e = this.elements[i];
            let moveToIndex = i;
            for (let j = i - 1; (j >= 0) && (e.getKey() < this.elements[j].getKey()); --j)
                moveToIndex = j;
            if (moveToIndex !== i) {
                const tmp = this.elements[i];
                this.elements[i] = this.elements[moveToIndex];
                this.elements[moveToIndex] = tmp;
            }
        }
        this.sortXml();
    }

    getType(): string { return this.getXml()!.getLocalName(); }
    protected setType(type: string): void {
        if (!type.includes("Map")) { console.error(`Cannot set the specified map type. "${type}" must contain "Map".`); return; }
        // XOM Element doesn't have setLocalName in our port, but since we always create fresh elements,
        // we need a workaround. We'll just note this - in practice, types are set at construction time.
    }

    getId(): string | null { return this.id === null ? null : this.id.getValue(); }
    setId(id: string | null): void {
        if (id === null) { if (this.id !== null) { this.id.detach(); this.id = null; } return; }
        if (this.id === null) { this.id = new Attribute("xml:id", "http://www.w3.org/XML/1998/namespace", id); this.getXml()!.addAttribute(this.id); return; }
        this.id.setValue(id);
    }

    setHeaders(globalHeader: Header | null, localHeader: Header | null): void { this.globalHeader = globalHeader; this.localHeader = localHeader; }
    getGlobalHeader(): Header | null { return this.globalHeader; }
    getLocalHeader(): Header | null { return this.localHeader; }

    getAllElements(): KeyValue<number, Element>[] { return this.elements; }
    getAllElementsOfType(type: string): KeyValue<number, Element>[] { return this.elements.filter(e => e.getValue().getLocalName() === type); }
    getAllElementsAt(date: number): KeyValue<number, Element>[] {
        const results: KeyValue<number, Element>[] = [];
        let index = this.getElementIndexAtAfter(date);
        if (index >= 0) {
            results.push(this.elements[index]);
            for (++index; (index < this.size()) && (this.elements[index].getKey() === date); ++index)
                results.push(this.elements[index]);
        }
        return results;
    }

    getFirstElement(): Element | null { return this.elements.length === 0 ? null : this.elements[0].getValue(); }
    getLastElement(): Element | null { return this.elements.length === 0 ? null : this.elements[this.size() - 1].getValue(); }
    getElement(index: number): Element | null { return (index >= this.elements.length || index < 0) ? null : this.elements[index].getValue(); }

    getElementByID(id: string): Element | null { const i = this.getElementIndexByID(id); return i < 0 ? null : this.elements[i].getValue(); }
    getElementIndexByID(id: string): number {
        for (let i = 0; i < this.size(); ++i) {
            const a = Helper.getAttribute("id", this.elements[i].getValue());
            if (a !== null && a.getValue() === id) return i;
        }
        return -1;
    }

    getElementBeforeAt(date: number): Element | null { const i = this.getElementIndexBeforeAt(date); return i < 0 ? null : this.elements[i].getValue(); }
    getElementAfter(date: number): Element | null { const i = this.getElementIndexAfter(date); return i < 0 ? null : this.elements[i].getValue(); }

    getElementIndexBeforeAt(date: number): number {
        if (this.elements.length === 0 || this.elements[0].getKey() > date) return -1;
        if (this.elements[this.elements.length - 1].getKey() <= date) return this.elements.length - 1;
        let first = 0, last = this.elements.length - 1, mid = Math.floor(last / 2);
        while (first <= last) {
            if (this.elements[mid + 1].getKey() <= date) first = mid + 1;
            else if (this.elements[mid].getKey() <= date) return mid;
            else last = mid - 1;
            mid = Math.floor((first + last) / 2);
        }
        return -1;
    }

    getElementIndexBefore(date: number): number {
        if (this.elements.length === 0 || this.elements[0].getKey() >= date) return -1;
        if (this.elements[this.elements.length - 1].getKey() < date) return this.elements.length - 1;
        let first = 0, last = this.elements.length - 1, mid = Math.floor(last / 2);
        while (first <= last) {
            if (this.elements[mid].getKey() >= date) last = mid;
            else if (this.elements[mid + 1].getKey() >= date) return mid;
            else first = mid + 1;
            mid = Math.floor((first + last) / 2);
        }
        return -1;
    }

    getElementIndexAfter(date: number): number {
        if (this.elements.length === 0 || this.elements[this.elements.length - 1].getKey() <= date) return -1;
        if (this.elements[0].getKey() > date) return 0;
        let first = 0, last = this.elements.length - 1, mid = Math.floor(last / 2);
        while (first <= last) {
            if (this.elements[mid].getKey() > date) last = mid - 1;
            else if (this.elements[mid + 1].getKey() > date) return mid + 1;
            else first = mid + 1;
            mid = Math.floor((first + last) / 2);
        }
        return -1;
    }

    getElementIndexAtAfter(date: number): number {
        if (this.elements.length === 0 || this.elements[this.elements.length - 1].getKey() < date) return -1;
        if (this.elements[0].getKey() >= date) return 0;
        let first = 0, last = this.elements.length - 1, mid = Math.floor(last / 2);
        while (first <= last) {
            if (this.elements[mid].getKey() >= date) last = mid - 1;
            else if (this.elements[mid + 1].getKey() >= date) return mid + 1;
            else first = mid + 1;
            mid = Math.floor((first + last) / 2);
        }
        return -1;
    }

    getElementIndexOf(element: Element | null): number {
        if (element === null) return -1;
        for (let i = 0; i < this.elements.length; ++i)
            if (this.elements[i].getValue() === element) return i;
        return -1;
    }

    addElement(xml: Element): number {
        if (xml === null) { console.error("Cannot add the Element to GenericMap. XML Element is null."); return -1; }
        const dateAtt = xml.getAttribute("date");
        if (dateAtt === null) { console.error("Cannot add the Element to GenericMap. Missing attribute 'date'."); return -1; }
        if (xml.getLocalName() === "style" && xml.getAttribute("name.ref") === null) { console.error("Cannot add style Element without name.ref."); return -1; }
        const date = parseFloat(dateAtt.getValue());
        return this.insertElement(new KeyValue(date, xml), false);
    }

    protected insertElement(element: KeyValue<number, Element>, firstAtDate: boolean = false): number {
        if (firstAtDate) {
            for (let i = 0; i < this.elements.length; ++i) {
                if (this.elements[i].getKey() >= element.getKey()) {
                    this.elements.splice(i, 0, element);
                    this.getXml()!.insertChild(element.getValue(), i);
                    return i;
                }
            }
        } else {
            for (let i = this.elements.length - 1; i >= 0; --i) {
                if (this.elements[i].getKey() <= element.getKey()) {
                    const index = i + 1;
                    this.elements.splice(index, 0, element);
                    this.getXml()!.insertChild(element.getValue(), index);
                    return index;
                }
            }
        }
        this.elements.splice(0, 0, element);
        this.getXml()!.insertChild(element.getValue(), 0);
        return 0;
    }

    removeElement(index: number): void;
    removeElement(xml: Element): void;
    removeElement(indexOrXml: number | Element): void {
        if (typeof indexOrXml === 'number') {
            if (indexOrXml >= this.elements.length) return;
            this.getXml()!.removeChild(this.elements[indexOrXml].getValue());
            this.elements.splice(indexOrXml, 1);
        } else {
            for (let i = 0; i < this.elements.length; i++) {
                if (this.elements[i].getValue() === indexOrXml) {
                    this.getXml()!.removeChild(indexOrXml);
                    this.elements.splice(i, 1);
                    return;
                }
            }
        }
    }

    addStyleSwitch(date: number, styleName: string, id?: string | null): number {
        const e = new Element("style", MPM_NAMESPACE);
        e.addAttribute(new Attribute("date", String(date)));
        e.addAttribute(new Attribute("name.ref", styleName));
        if (id !== undefined && id !== null) e.addAttribute(new Attribute("xml:id", "http://www.w3.org/XML/1998/namespace", id));
        return this.insertElement(new KeyValue(date, e), true);
    }

    getStyleNameAt(date: number): string | null {
        const list = this.getAllElementsOfType("style");
        for (let i = list.length - 1; i >= 0; --i) {
            if (list[i].getKey() <= date) return Helper.getAttributeValue("name.ref", list[i].getValue());
        }
        return null;
    }

    getStyle(styleType: string, styleName: string | null): GenericStyle | null {
        if (styleName === null || styleName === '') return null;
        let style: GenericStyle | null = null;
        if (this.getLocalHeader() !== null) style = this.getLocalHeader()!.getStyleDef(styleType, styleName);
        if (style === null && this.getGlobalHeader() !== null) style = this.getGlobalHeader()!.getStyleDef(styleType, styleName);
        return style;
    }

    getStyleAt(date: number, styleType: string): GenericStyle | null {
        return this.getStyle(styleType, this.getStyleNameAt(date));
    }

    size(): number { return this.elements.length; }
    isEmpty(): boolean { return this.elements.length === 0; }
    contains(element: Element): boolean { return element.getParent() === this.getXml(); }

    updateAttributeValues(attributeName: string, valueMappings: Map<string, string>): void {
        for (const e of this.elements) {
            const a = Helper.getAttribute(attributeName, e.getValue());
            if (a === null) continue;
            const newValue = valueMappings.get(a.getValue());
            if (newValue !== undefined) a.setValue(newValue);
        }
    }
}
