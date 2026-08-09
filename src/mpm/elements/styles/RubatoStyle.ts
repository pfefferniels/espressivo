import { Attribute, Element } from '../../../xml/XomTypes.js';
import { allChildElements } from '../../../xml/tree.js';
import { MPM_NAMESPACE } from '../../names.js';
import { GenericStyle } from './GenericStyle.js';
import { RubatoDef } from './defs/RubatoDef.js';

/**
 * A `styleDef` holding `rubatoDef` children, indexed by name.
 * Port of meico.mpm.elements.styles.RubatoStyle
 */
export class RubatoStyle extends GenericStyle<RubatoDef> {
  private constructor() {
    super();
  }

  static createRubatoStyle(name: string, id?: string): RubatoStyle | null;
  static createRubatoStyle(xml: Element): RubatoStyle | null;
  static createRubatoStyle(nameOrXml: string | Element, id?: string): RubatoStyle | null {
    try {
      const rs = new RubatoStyle();
      if (typeof nameOrXml === 'string') {
        const e = new Element('styleDef', MPM_NAMESPACE);
        e.addAttribute(new Attribute('name', nameOrXml));
        rs.parseData(e);
        if (id !== undefined) rs.setId(id);
      } else {
        rs.parseData(nameOrXml);
      }
      return rs;
    } catch (e) {
      console.error(e);
      return null;
    }
  }

  /** Defs that fail to parse are skipped, so one malformed child cannot lose the style. */
  protected parseData(xml: Element): void {
    super.parseData(xml);
    for (const def of allChildElements(xml, 'rubatoDef')) {
      const rd = RubatoDef.createRubatoDef(def);
      if (rd === null) continue;
      this.defs.set(rd.getName(), rd);
    }
  }
}
