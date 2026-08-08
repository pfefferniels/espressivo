import { Attribute, Element } from '../../../../xml/XomTypes.js';
import { Helper } from '../../../../mei/Helper.js';
import { Mpm } from '../../../../mpm/Mpm.js';
import { AbstractDef } from './AbstractDef.js';

/**
 * Port of meico.mpm.elements.styles.defs.DynamicsDef
 */
export class DynamicsDef extends AbstractDef {
  private value = 0.0;

  private constructor() {
    super();
  }

  private static fromNameValue(name: string, value: number): DynamicsDef {
    const dd = new DynamicsDef();
    const e = new Element('dynamicsDef', Mpm.MPM_NAMESPACE);
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
    const valueAttr = Helper.getAttribute('value', xml);
    if (valueAttr === null)
      throw new Error('Cannot generate DynamicsDef object. Missing value attribute.');
    this.value = parseFloat(valueAttr.getValue());
  }

  protected parseData(xml: Element): void {
    this.parseDataInternal(xml);
  }

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
    this.getXml()!.getAttribute('value')!.setValue(String(value));
  }

  static createDefaultDynamicsDef(name: string): DynamicsDef | null {
    return DynamicsDef.createDynamicsDef(name, DynamicsDef.getDefaultVolumeLevel(name));
  }

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
