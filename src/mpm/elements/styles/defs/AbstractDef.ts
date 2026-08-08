import { Attribute, Element } from '../../../../xml/XomTypes.js';
import { AbstractXmlSubtree } from '../../../../xml/AbstractXmlSubtree.js';
import { attribute } from '../../../../xml/tree.js';

/**
 * Common base of every MPM `*Def` element (tempoDef, dynamicsDef, articulationDef, …).
 * Port of meico.mpm.elements.styles.defs.AbstractDef
 *
 * All it contributes is the `name` — the key a style indexes the def under — and the
 * optional `xml:id`. Subclasses parse their own attributes on top and, per
 * {@link AbstractXmlSubtree}, write every change straight back into the element.
 */
export abstract class AbstractDef extends AbstractXmlSubtree {
  protected name!: Attribute;
  private id: Attribute | null = null;

  /**
   * Subclasses call this first from their own parse step; afterwards {@link getXml}
   * returns the very element passed in here.
   */
  protected parseData(xml: Element): void {
    if (xml === null) throw new Error('Cannot generate AbstractDef object. XML Element is null.');

    const name = attribute('name', xml);
    if (name === null)
      throw new Error('Cannot generate AbstractDef object. Missing name attribute.');
    this.name = name;

    this.setXml(xml);
    this.id = attribute('id', xml);
  }

  getName(): string {
    return this.name.getValue();
  }

  protected setName(name: string): void {
    this.name.setValue(name);
  }

  /** Set, replace or (with null) remove the `xml:id`, in the object and in the element. */
  setId(id: string | null): void {
    if (id === null) {
      if (this.id !== null) {
        this.id.detach();
        this.id = null;
      }
      return;
    }

    if (this.id === null) {
      this.id = new Attribute('xml:id', 'http://www.w3.org/XML/1998/namespace', id);
      this.getXml()!.addAttribute(this.id);
      return;
    }

    this.id.setValue(id);
  }

  getId(): string | null {
    if (this.id === null) return null;
    return this.id.getValue();
  }
}
