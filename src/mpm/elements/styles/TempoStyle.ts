import { Attribute, Element } from '../../../xml/XomTypes.js';
import { Helper } from '../../../mei/Helper.js';
import { Mpm } from '../../../mpm/Mpm.js';
import { GenericStyle } from './GenericStyle.js';
import { TempoDef } from './defs/TempoDef.js';

/**
 * A `styleDef` holding `tempoDef` children, indexed by name.
 * Port of meico.mpm.elements.styles.TempoStyle
 */
export class TempoStyle extends GenericStyle<TempoDef> {
  private constructor() {
    super();
  }

  static createTempoStyle(name: string, id?: string): TempoStyle | null;
  static createTempoStyle(xml: Element): TempoStyle | null;
  static createTempoStyle(nameOrXml: string | Element, id?: string): TempoStyle | null {
    try {
      const ts = new TempoStyle();
      if (typeof nameOrXml === 'string') {
        const e = new Element('styleDef', Mpm.MPM_NAMESPACE);
        e.addAttribute(new Attribute('name', nameOrXml));
        ts.parseData(e);
        if (id !== undefined) ts.setId(id);
      } else {
        ts.parseData(nameOrXml);
      }
      return ts;
    } catch (e) {
      console.error(e);
      return null;
    }
  }

  /** Defs that fail to parse are skipped, so one malformed child cannot lose the style. */
  protected parseData(xml: Element): void {
    super.parseData(xml);
    for (const def of Helper.getAllChildElements('tempoDef', xml) ?? []) {
      const td = TempoDef.createTempoDef(def);
      if (td === null) continue;
      this.defs.set(td.getName(), td);
    }
  }

  /**
   * Resolve a tempo string to beats per minute: a matching `tempoDef` wins, otherwise the
   * string is read as a number, otherwise 100.0.
   */
  getNumericBpmValue(tempoString: string): number {
    return TempoStyle.getNumericBpmValueStatic(tempoString, this);
  }

  /** As {@link getNumericBpmValue}, but tolerating the absence of a style altogether. */
  static getNumericBpmValueStatic(tempoString: string, style: TempoStyle | null): number {
    const tempoDef = style !== null ? style.getDef(tempoString) : undefined;
    if (tempoDef !== undefined) return tempoDef.getValue();
    const val = parseFloat(tempoString);
    if (!isNaN(val)) return val;
    console.error(
      `Failed to convert tempo string "${tempoString}" to double. No tempoDef, no number format.`,
    );
    return 100.0;
  }
}
