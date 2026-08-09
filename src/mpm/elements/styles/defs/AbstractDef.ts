import { Attribute, Element } from '../../../../xml/XomTypes.js';
import { AbstractXmlSubtree } from '../../../../xml/AbstractXmlSubtree.js';
import { attribute } from '../../../../xml/tree.js';

/**
 * Common base of every MPM `*Def` element (tempoDef, dynamicsDef, articulationDef, …).
 * Port of meico.mpm.elements.styles.defs.AbstractDef
 *
 * All it contributes is the `name` — the key a style indexes the def under; the optional
 * `xml:id` comes from {@link AbstractXmlSubtree}. Subclasses parse their own attributes on
 * top and write every change straight back into the element.
 */
export abstract class AbstractDef extends AbstractXmlSubtree {
  protected name!: Attribute;

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
}
