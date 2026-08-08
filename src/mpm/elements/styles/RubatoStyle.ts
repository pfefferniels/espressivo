import { Attribute, Element } from '../../../xml/XomTypes.js';
import { Helper } from '../../../mei/Helper.js';
import { Mpm } from '../../../mpm/Mpm.js';
import { GenericStyle } from './GenericStyle.js';
import { RubatoDef } from './defs/RubatoDef.js';

export class RubatoStyle extends GenericStyle<RubatoDef> {
  private constructor() {
    super();
  }

  static createRubatoStyle(name: string): RubatoStyle | null;
  static createRubatoStyle(name: string, id: string): RubatoStyle | null;
  static createRubatoStyle(xml: Element): RubatoStyle | null;
  static createRubatoStyle(nameOrXml: string | Element, id?: string): RubatoStyle | null {
    try {
      const rs = new RubatoStyle();
      if (typeof nameOrXml === 'string') {
        const e = new Element('styleDef', Mpm.MPM_NAMESPACE);
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

  protected parseData(xml: Element): void {
    super.parseData(xml);
    const rubatoDefs = Helper.getAllChildElements('rubatoDef', this.getXml()!);
    if (rubatoDefs) {
      for (const def of rubatoDefs) {
        const rd = RubatoDef.createRubatoDef(def);
        if (rd === null) continue;
        this.defs.set(rd.getName(), rd);
      }
    }
  }
}
