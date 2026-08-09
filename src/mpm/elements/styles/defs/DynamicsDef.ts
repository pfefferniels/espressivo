import { Attribute, Element } from '../../../../xml/XomTypes.js';
import { attribute } from '../../../../xml/tree.js';
import { MPM_NAMESPACE } from '../../../names.js';
import { AbstractDef } from './AbstractDef.js';

/**
 * A `dynamicsDef`: it gives a dynamics name ("forte", "pp", …) a numeric MIDI-velocity
 * value.
 * Port of meico.mpm.elements.styles.defs.DynamicsDef
 */
export class DynamicsDef extends AbstractDef {
  private value = 0.0;

  private constructor() {
    super();
  }

  private static fromNameValue(name: string, value: number): DynamicsDef {
    const dd = new DynamicsDef();
    const e = new Element('dynamicsDef', MPM_NAMESPACE);
    e.addAttribute(new Attribute('name', name));
    e.addAttribute(new Attribute('value', String(value)));
    dd.parseDataInternal(e);
    return dd;
  }

  private static fromXml(xml: Element): DynamicsDef {
    const dd = new DynamicsDef();
    dd.parseDataInternal(xml);
    return dd;
  }

  private parseDataInternal(xml: Element): void {
    super.parseData(xml);
    const valueAttr = attribute('value', xml);
    if (valueAttr === null)
      throw new Error('Cannot generate DynamicsDef object. Missing value attribute.');
    this.value = parseFloat(valueAttr.getValue());
  }

  protected parseData(xml: Element): void {
    this.parseDataInternal(xml);
  }

  /**
   * Create a def either from a name and a velocity value, or by parsing an existing
   * element. Returns null — after logging — instead of throwing, e.g. when `value` is
   * missing.
   */
  static createDynamicsDef(name: string, value: number): DynamicsDef | null;
  static createDynamicsDef(xml: Element): DynamicsDef | null;
  static createDynamicsDef(nameOrXml: string | Element, value?: number): DynamicsDef | null {
    try {
      if (typeof nameOrXml === 'string') {
        return DynamicsDef.fromNameValue(nameOrXml, value!);
      } else {
        return DynamicsDef.fromXml(nameOrXml);
      }
    } catch (e) {
      console.error(e);
      return null;
    }
  }

  getValue(): number {
    return this.value;
  }

  setValue(value: number): void {
    this.value = value;
    this.getXml().getAttribute('value')!.setValue(String(value));
  }

  static createDefaultDynamicsDef(name: string): DynamicsDef | null {
    return DynamicsDef.createDynamicsDef(name, DynamicsDef.getDefaultVolumeLevel(name));
  }

  /**
   * Map a dynamics name to a default MIDI velocity. Unlike `TempoDef.getDefaultTempo`,
   * which matches substrings, this matches the *whole* trimmed, lower-cased string, so
   * "mezzo forte" (with a space) does not resolve and falls back to 74.0.
   */
  static getDefaultVolumeLevel(dynamics: string): number {
    switch (dynamics.trim().toLowerCase()) {
      case 'pppp':
      case 'pianissimopianissimo':
        return 5.0;
      case 'ppp':
      case 'pianopianissimo':
        return 12.0;
      case 'pp':
      case 'pianissimo':
        return 36.0;
      case 'p':
      case 'piano':
        return 48.0;
      case 'mp':
      case 'mezzopiano':
        return 64.0;
      case 'mf':
      case 'mezzoforte':
        return 83.0;
      case 'f':
      case 'forte':
        return 97.0;
      case 'ff':
      case 'fortissimo':
        return 111.0;
      case 'fff':
      case 'fortefortissimo':
        return 120.0;
      case 'ffff':
      case 'fortissimofortissimo':
        return 125.0;
      case 'sf':
      case 'sfz':
      case 'fz':
      case 'sforzato':
        return 127.0;
      default:
        return 74.0;
    }
  }
}
