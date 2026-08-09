import { Attribute, Element } from '../../../../xml/XomTypes.js';
import { attribute } from '../../../../xml/tree.js';
import { MPM_NAMESPACE } from '../../../names.js';
import { AbstractDef } from './AbstractDef.js';

/**
 * A `tempoDef`: it gives a tempo name ("Allegro", "fast", …) a numeric value in bpm.
 * Port of meico.mpm.elements.styles.defs.TempoDef
 *
 * PARITY NOTE: Java renames a foreign element to `tempoDef` via `Element.setLocalName()`
 * when parsing. XomTypes has no `setLocalName`, so a def parsed from a differently named
 * element keeps that name here and serializes under it. Nothing in the pipeline reaches
 * that path — `TempoStyle` only ever feeds this factory real `tempoDef` children.
 */
export class TempoDef extends AbstractDef {
  private value = 0.0;

  private constructor() {
    super();
  }

  private static fromNameValue(name: string, value: number): TempoDef {
    const td = new TempoDef();
    const e = new Element('tempoDef', MPM_NAMESPACE);
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

    const valueAttr = attribute('value', xml);
    if (valueAttr === null)
      throw new Error('Cannot generate TempoDef object. Missing value attribute.');

    this.value = parseFloat(valueAttr.getValue());
  }

  protected parseData(xml: Element): void {
    this.parseDataInternal(xml);
  }

  /**
   * Create a def either from a name and a bpm value, or by parsing an existing element.
   * Returns null — after logging — instead of throwing, e.g. when `value` is missing.
   */
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
    this.getXml().getAttribute('value')!.setValue(String(value));
  }

  static createDefaultTempoDef(name: string): TempoDef | null {
    return TempoDef.createTempoDef(name, TempoDef.getDefaultTempo(name));
  }

  /**
   * Guess a bpm value from a tempo descriptor by substring match.
   *
   * The ORDER OF THESE TESTS IS LOAD-BEARING and matches the Java original line for line
   * (TempoDef.java:125-141): the first match wins, so a descriptor containing several
   * terms — "allegro assai" — resolves to the one tested first (147.0, not 145.0).
   * Reordering them, however tempting alphabetically, changes rendered tempo.
   */
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
