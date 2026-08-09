import { Attribute, Element } from '../../../xml/XomTypes.js';
import { AbstractXmlSubtree } from '../../../xml/AbstractXmlSubtree.js';
import { allChildElements, attribute } from '../../../xml/tree.js';
import { MPM_NAMESPACE } from '../../names.js';
import { AbstractDef } from './defs/AbstractDef.js';

/**
 * An MPM `styleDef` element: a named bag of definitions ("defs") that performance
 * instructions elsewhere in the document refer to by name.
 * Port of meico.mpm.elements.styles.GenericStyle
 *
 * The XML element is the single source of truth (see {@link AbstractXmlSubtree}). The
 * {@link defs} map is only a lookup index over the element's def children; {@link addDef}
 * and {@link removeDef} keep the two in step, so never insert into the map directly.
 *
 * This module used to carry an IMPORT-ORDER HAZARD: it imported `Mpm` for the namespace
 * constant while `Mpm` imported it back, so importing this file *deeply* — before `Mpm`
 * had been evaluated — threw. T18 removed the cycle by moving the constants to the leaf
 * module `mpm/names.ts` (RULE M3), and every module here is now importable in isolation.
 * Keep it that way: import names from `names.js`, never from `Mpm.js`, or the cycle and
 * its order-dependent failure come back. `import/no-cycle` in `eslint.config.js` guards
 * this now, so a regression is a lint error rather than a runtime surprise.
 */
export class GenericStyle<E extends AbstractDef = AbstractDef> extends AbstractXmlSubtree {
  private nameAttr!: Attribute;
  protected defs = new Map<string, E>();

  protected constructor() {
    super();
  }

  /**
   * Subclasses override this to also parse their def children, calling `super.parseData`
   * first — after it has run, {@link getXml} returns the very element passed in here.
   */
  protected parseData(xml: Element): void {
    if (xml === null)
      throw new Error('Cannot generate GenericStyleDef object. XML Element is null.');
    const nameAttr = attribute('name', xml);
    if (nameAttr === null)
      throw new Error('Cannot generate GenericStyleDef object. Missing name attribute.');
    this.nameAttr = nameAttr;
    this.setXml(xml);
    this.id = attribute('id', xml);
    this.defs = new Map();
  }

  /**
   * Index the def children of one kind, which is all any subclass's `parseData` adds on
   * top of this class's. Called after `super.parseData`, so {@link defs} is the fresh map
   * that call installed.
   *
   * A def that fails to parse is skipped rather than fatal, so one malformed child cannot
   * lose the whole style; and with two defs of the same name the LAST one wins, because
   * they are inserted in document order.
   */
  protected parseDefs(xml: Element, childName: string, create: (def: Element) => E | null): void {
    for (const def of allChildElements(xml, childName)) {
      const d = create(def);
      if (d === null) continue;
      this.defs.set(d.getName(), d);
    }
  }

  /**
   * Create a style either from scratch (`name`, optionally `id`) or by parsing an existing
   * `styleDef` element. Returns null — after logging — instead of throwing, which is how
   * every factory in this cluster reports a malformed input.
   */
  static createGenericStyle(name: string, id?: string): GenericStyle | null;
  static createGenericStyle(xml: Element): GenericStyle | null;
  static createGenericStyle(nameOrXml: string | Element, id?: string): GenericStyle | null {
    try {
      const gs = new GenericStyle();
      if (typeof nameOrXml === 'string') {
        const styleDef = new Element('styleDef', MPM_NAMESPACE);
        styleDef.addAttribute(new Attribute('name', nameOrXml));
        gs.parseData(styleDef);
        if (id !== undefined) gs.setId(id);
      } else {
        gs.parseData(nameOrXml);
      }
      return gs;
    } catch (e) {
      console.error(e);
      return null;
    }
  }

  getName(): string {
    return this.nameAttr.getValue();
  }
  protected setName(name: string): void {
    this.nameAttr.setValue(name);
  }

  /** The live lookup index, not a copy — hence read-only; use {@link addDef}/{@link removeDef}. */
  getAllDefs(): ReadonlyMap<string, E> {
    return this.defs;
  }
  getDef(name: string): E | undefined {
    return this.defs.get(name);
  }

  /** Add a def, replacing any def of the same name in both the map and the element. */
  addDef(def: E): void {
    if (def === null) {
      console.error('Cannot add a null object to the styleDef.');
      return;
    }
    this.removeDef(def.getName());
    this.defs.set(def.getName(), def);
    this.getXml().appendChild(def.getXml());
  }

  removeDef(name: string): void {
    const ad = this.defs.get(name);
    if (ad === undefined) return;
    this.defs.delete(name);
    this.getXml().removeChild(ad.getXml());
  }

  size(): number {
    return this.defs.size;
  }
  isEmpty(): boolean {
    return this.defs.size === 0;
  }
}
