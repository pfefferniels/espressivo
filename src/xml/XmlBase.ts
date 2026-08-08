import { Document, Element, Attribute, Nodes, Builder, ParsingException } from './XomTypes.js';
import { v4 as uuidv4 } from 'uuid';

/**
 * This class is a primitive for all XML-based classes in meico.
 * Port of meico.xml.XmlBase
 */
export class XmlBase {
    protected file: string | null = null;    // the filename (replaces Java File object)
    protected data: Document | null = null;
    protected isValidFlag: boolean = false;

    constructor();
    constructor(document: Document);
    constructor(xml: string, isXmlString: true);
    constructor(arg?: Document | string, isXmlString?: true) {
        if (arg === undefined) {
            this.file = null;
            this.data = null;
            this.isValidFlag = false;
        } else if (arg instanceof Document) {
            this.file = null;
            this.data = arg;
            this.isValidFlag = false;
        } else if (typeof arg === 'string' && isXmlString) {
            this.parseXmlString(arg);
        }
    }

    protected parseXmlString(xml: string): void {
        const builder = new Builder();
        this.isValidFlag = false;
        try {
            this.data = builder.build(xml);
        } catch (e) {
            if (e instanceof ParsingException) {
                console.error('Parsing error:', e.message);
                this.data = null;
            } else {
                throw e;
            }
        }
    }

    isValid(): boolean {
        return this.isValidFlag;
    }

    validate(_schema?: string): string {
        if (this.isEmpty()) return "No data present to be validated";
        // Validation not implemented in browser context
        return "Validation not supported in browser context";
    }

    getFile(): string | null {
        return this.file;
    }

    setFile(file: string): void {
        this.file = file;
    }

    isEmpty(): boolean {
        return this.data === null;
    }

    toXML(): string {
        if (this.isEmpty())
            return "";
        return this.data!.toXML();
    }

    getDocument(): Document | null {
        if (this.isEmpty())
            return null;
        return this.data;
    }

    setDocument(document: Document): void {
        this.data = document;
    }

    getRootElement(): Element | null {
        if (this.isEmpty())
            return null;
        return this.data!.getRootElement();
    }

    removeAllElements(localName: string): number {
        let deletions = 0;
        const ns = this.getRootElement()!.query("descendant::*[local-name()='" + localName + "']");

        for (let i = 0; i < ns.size(); ++i) {
            const parent = ns.get(i).getParent();
            if (parent !== null) {
                parent.removeChild(ns.get(i));
                ns.get(i).detach();
                deletions++;
            }
        }
        return deletions;
    }

    removeAllAttributes(attributeName: string): number {
        const ns = this.getRootElement()!.query("descendant::*[@" + attributeName + "]");

        for (let i = 0; i < ns.size(); ++i) {
            const e = ns.get(i) as unknown as Element;
            const a = e.getAttribute(attributeName);
            if (a) e.removeAttribute(a);
        }

        return ns.size();
    }

    fixDuplicateIds(): number {
        let duplicates = 0;
        const uniqueIds = new Set<string>();

        const attributes = this.getRootElement()!.query("descendant-or-self::node()/attribute::xml:id");
        for (let i = 0; i < attributes.size(); ++i) {
            const attribute = attributes.get(i) as unknown as Attribute;
            let duplicate = false;
            while (uniqueIds.has(attribute.getValue())) {
                duplicate = true;
                attribute.setValue("meico_" + uuidv4());
            }
            uniqueIds.add(attribute.getValue());
            duplicates += (duplicate ? 1 : 0);
        }

        console.log(duplicates);
        return duplicates;
    }

    /**
     * Export the XML as a string (browser-compatible replacement for writeFile)
     */
    exportXml(): string | null {
        if (this.isEmpty()) {
            console.error("Empty document, cannot export.");
            return null;
        }
        return this.toXML();
    }
}
