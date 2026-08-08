import { Attribute, Element } from '../../../../xml/XomTypes.js';
import { Helper } from '../../../../mei/Helper.js';
import { Mpm } from '../../../../mpm/Mpm.js';
import { AbstractDef } from './AbstractDef.js';

/**
 * Port of meico.mpm.elements.styles.defs.TempoDef
 */
export class TempoDef extends AbstractDef {
  private value = 0.0;

  private constructor() {
    super();
  }

  private static fromNameValue(name: string, value: number): TempoDef {
    const td = new TempoDef();
    const e = new Element('tempoDef', Mpm.MPM_NAMESPACE);
    e.addAttribute(new Attribute('name', name));
    e.addAttribute(new Attribute('value', String(value)));
    td.parseDataInternal(e);
    return td;
  }

  private static fromXml(xml: Element): TempoDef {
    const td = new TempoDef();
    td.parseDataInternal(xml);
    return td;
  }

  private parseDataInternal(xml: Element): void {
    super.parseData(xml);

    const valueAttr = Helper.getAttribute('value', xml);
    if (valueAttr === null)
      throw new Error('Cannot generate TempoDef object. Missing value attribute.');

    if (this.getXml()!.getLocalName() !== 'tempoDef') {
      // In the original Java, setLocalName is used. We skip this as our Element doesn't support it directly.
    }

    this.value = parseFloat(valueAttr.getValue());
  }

  protected parseData(xml: Element): void {
    this.parseDataInternal(xml);
  }

  static createTempoDef(name: string, value: number): TempoDef | null;
  static createTempoDef(xml: Element): TempoDef | null;
  static createTempoDef(nameOrXml: string | Element, value?: number): TempoDef | null {
    try {
      if (typeof nameOrXml === 'string') {
        return TempoDef.fromNameValue(nameOrXml, value!);
      } else {
        return TempoDef.fromXml(nameOrXml);
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

  static createDefaultTempoDef(name: string): TempoDef | null {
    return TempoDef.createTempoDef(name, TempoDef.getDefaultTempo(name));
  }

  static getDefaultTempo(descriptor: string): number {
    const des = descriptor.trim().toLowerCase();
    if (des.includes('grave')) return 42.0;
    if (des.includes('largo')) return 50.0;
    if (des.includes('lento')) return 51.0;
    if (des.includes('adagio')) return 79.0;
    if (des.includes('larghetto')) return 69.0;
    if (des.includes('adagietto')) return 66.0;
    if (des.includes('andante')) return 101.0;
    if (des.includes('andantino')) return 80.0;
    if (des.includes('maestoso')) return 88.0;
    if (des.includes('moderato')) return 106.0;
    if (des.includes('allegretto')) return 110.0;
    if (des.includes('animato')) return 121.0;
    if (des.includes('allegro')) return 147.0;
    if (des.includes('assai')) return 145.0;
    if (des.includes('vivace')) return 164.0;
    if (des.includes('presto')) return 189.0;
    if (des.includes('prestissimo')) return 206.0;
    return 100.0;
  }
}
