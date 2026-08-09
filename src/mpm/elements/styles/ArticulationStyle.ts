import { Attribute, Element } from '../../../xml/XomTypes.js';
import { MPM_NAMESPACE } from '../../names.js';
import { GenericStyle } from './GenericStyle.js';
import { ArticulationDef } from './defs/ArticulationDef.js';

/**
 * A `styleDef` holding `articulationDef` children, indexed by name.
 * Port of meico.mpm.elements.styles.ArticulationStyle
 */
export class ArticulationStyle extends GenericStyle<ArticulationDef> {
  private constructor() {
    super();
  }

  static createArticulationStyle(name: string, id?: string): ArticulationStyle | null;
  static createArticulationStyle(xml: Element): ArticulationStyle | null;
  static createArticulationStyle(
    nameOrXml: string | Element,
    id?: string,
  ): ArticulationStyle | null {
    try {
      const style = new ArticulationStyle();
      if (typeof nameOrXml === 'string') {
        const e = new Element('styleDef', MPM_NAMESPACE);
        e.addAttribute(new Attribute('name', nameOrXml));
        style.parseData(e);
        if (id !== undefined) style.setId(id);
      } else {
        style.parseData(nameOrXml);
      }
      return style;
    } catch (e) {
      console.error(e);
      return null;
    }
  }

  protected parseData(xml: Element): void {
    super.parseData(xml);
    this.parseDefs(xml, 'articulationDef', (def) => ArticulationDef.createArticulationDef(def));
  }
}
