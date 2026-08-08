import { Attribute, Element } from '../../../../xml/XomTypes.js';
import { AbstractXmlSubtree } from '../../../../xml/AbstractXmlSubtree.js';
import { Helper } from '../../../../mei/Helper.js';

/**
 * Port of meico.mpm.elements.styles.defs.AbstractDef
 */
export abstract class AbstractDef extends AbstractXmlSubtree {
    protected name!: Attribute;
    private id: Attribute | null = null;

    protected parseData(xml: Element): void {
        if (xml === null)
            throw new Error("Cannot generate AbstractDef object. XML Element is null.");

        this.name = Helper.getAttribute("name", xml)!;
        if (this.name === null)
            throw new Error("Cannot generate AbstractDef object. Missing name attribute.");

        this.setXml(xml);
        this.id = Helper.getAttribute("id", this.getXml()!);
    }

    getName(): string {
        return this.name.getValue();
    }

    protected setName(name: string): void {
        this.name.setValue(name);
    }

    setId(id: string | null): void {
        if (id === null) {
            if (this.id !== null) {
                this.id.detach();
                this.id = null;
            }
            return;
        }

        if (this.id === null) {
            this.id = new Attribute("xml:id", "http://www.w3.org/XML/1998/namespace", id);
            this.getXml()!.addAttribute(this.id);
            return;
        }

        this.id.setValue(id);
    }

    getId(): string | null {
        if (this.id === null)
            return null;
        return this.id.getValue();
    }
}
