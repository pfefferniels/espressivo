import { Attribute, Element } from '../../../xml/XomTypes.js';
import { Helper } from '../../../mei/Helper.js';
import { Mpm } from '../../../mpm/Mpm.js';
import { GenericStyle } from './GenericStyle.js';
import { AccentuationPatternDef } from './defs/AccentuationPatternDef.js';

export class MetricalAccentuationStyle extends GenericStyle<AccentuationPatternDef> {
  private constructor() {
    super();
  }

  static createMetricalAccentuationStyle(name: string): MetricalAccentuationStyle | null;
  static createMetricalAccentuationStyle(
    name: string,
    id: string,
  ): MetricalAccentuationStyle | null;
  static createMetricalAccentuationStyle(xml: Element): MetricalAccentuationStyle | null;
  static createMetricalAccentuationStyle(
    nameOrXml: string | Element,
    id?: string,
  ): MetricalAccentuationStyle | null {
    try {
      const mas = new MetricalAccentuationStyle();
      if (typeof nameOrXml === 'string') {
        const e = new Element('styleDef', Mpm.MPM_NAMESPACE);
        e.addAttribute(new Attribute('name', nameOrXml));
        mas.parseData(e);
        if (id !== undefined) mas.setId(id);
      } else {
        mas.parseData(nameOrXml);
      }
      return mas;
    } catch (e) {
      console.error(e);
      return null;
    }
  }

  protected parseData(xml: Element): void {
    super.parseData(xml);
    const maDefs = Helper.getAllChildElements('accentuationPatternDef', this.getXml()!);
    if (maDefs) {
      for (const maDef of maDefs) {
        const apd = AccentuationPatternDef.createAccentuationPatternDef(maDef);
        if (apd === null) continue;
        this.defs.set(apd.getName(), apd);
      }
    }
  }
}
