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
   * Subclasses call this first from their own `parseData` override; afterwards
   * {@link getXml} returns the very element passed in here.
   *
   * The six subclasses each used to carry *two* methods here — a `private
   * parseDataInternal` doing the real work and a `protected override parseData` whose
   * whole body was `this.parseDataInternal(xml)`. Every factory called the private one
   * directly, so the override was unreachable, and deleting it alone would have quietly
   * downgraded five unit tests to exercising this base implementation instead of the
   * subclass's parser. Folding the two into one `protected override parseData` deletes
   * the indirection, keeps those tests pointed at the code they name, and leaves the defs
   * spelled exactly like their `GenericStyle` siblings.
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
