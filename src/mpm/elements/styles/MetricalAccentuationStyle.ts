import { Attribute, Element } from '../../../xml/XomTypes.js';
import { allChildElements } from '../../../xml/tree.js';
import { MPM_NAMESPACE } from '../../names.js';
import { GenericStyle } from './GenericStyle.js';
import { AccentuationPatternDef } from './defs/AccentuationPatternDef.js';

/**
 * A `styleDef` holding `accentuationPatternDef` children, indexed by name.
 * Port of meico.mpm.elements.styles.MetricalAccentuationStyle
 */
export class MetricalAccentuationStyle extends GenericStyle<AccentuationPatternDef> {
  private constructor() {
    super();
  }

  static createMetricalAccentuationStyle(
    name: string,
    id?: string,
  ): MetricalAccentuationStyle | null;
  static createMetricalAccentuationStyle(xml: Element): MetricalAccentuationStyle | null;
  static createMetricalAccentuationStyle(
    nameOrXml: string | Element,
    id?: string,
  ): MetricalAccentuationStyle | null {
    try {
      const mas = new MetricalAccentuationStyle();
      if (typeof nameOrXml === 'string') {
        const e = new Element('styleDef', MPM_NAMESPACE);
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

  /** Defs that fail to parse are skipped, so one malformed child cannot lose the style. */
  protected parseData(xml: Element): void {
    super.parseData(xml);
    for (const maDef of allChildElements(xml, 'accentuationPatternDef')) {
      const apd = AccentuationPatternDef.createAccentuationPatternDef(maDef);
      if (apd === null) continue;
      this.defs.set(apd.getName(), apd);
    }
  }
}
