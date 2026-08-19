import { Attribute, Element } from '../../../xml/XomTypes.js';
import { MPM_NAMESPACE } from '../../names.js';
import { GenericStyle } from './GenericStyle.js';
import { OrnamentDef } from './defs/OrnamentDef.js';

/**
 * A `styleDef` holding `ornamentDef` children, indexed by name.
 * Port of meico.mpm.elements.styles.OrnamentationStyle
 */
export class OrnamentationStyle extends GenericStyle<OrnamentDef> {
  private constructor() {
    super();
  }

  static createOrnamentationStyle(name: string, id?: string): OrnamentationStyle | null;
  static createOrnamentationStyle(xml: Element): OrnamentationStyle | null;
  static createOrnamentationStyle(
    nameOrXml: string | Element,
    id?: string,
  ): OrnamentationStyle | null {
    try {
      const os = new OrnamentationStyle();
      if (typeof nameOrXml === 'string') {
        const e = new Element('styleDef', MPM_NAMESPACE);
        e.addAttribute(new Attribute('name', nameOrXml));
        os.parseData(e);
        if (id !== undefined) os.setId(id);
      } else {
        os.parseData(nameOrXml);
      }
      return os;
    } catch (e) {
      console.error(e);
      return null;
    }
  }

  protected override parseData(xml: Element): void {
    super.parseData(xml);
    this.parseDefs(xml, 'ornamentDef', (def) => OrnamentDef.createOrnamentDef(def));
  }
}
