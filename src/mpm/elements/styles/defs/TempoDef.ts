import { Attribute, Element } from '../../../../xml/XomTypes.js';
import { attribute } from '../../../../xml/tree.js';
import { MPM_NAMESPACE } from '../../../names.js';
import { parseJavaDouble } from '../../../../supplementary/parseJavaDouble.js';
import { AbstractXmlSubtree } from '../../../../xml/AbstractXmlSubtree.js';
import { MissingNodeError } from '../../../../xml/errors.js';
import { requireDefName, skipMalformedDef } from './defName.js';
import { ok, type Result } from '../../../../prelude/index.js';
import { type MpmParseError } from '../../parseError.js';

/**
 * A `tempoDef`: it gives a tempo name ("Allegro", "fast", …) a numeric value in bpm.
 * Port of meico.mpm.elements.styles.defs.TempoDef
 *
 * PARITY NOTE: Java renames a foreign element to `tempoDef` via `Element.setLocalName()`
 * when parsing. XomTypes has no `setLocalName`, so a def parsed from a differently named
 * element keeps that name here and serializes under it. Nothing in the pipeline reaches
 * that path — a tempo style only ever feeds this factory real `tempoDef` children.
 */
export class TempoDef extends AbstractXmlSubtree {
  /** This def's arm of {@link Def}. */
  readonly kind = 'tempo';
  private value: number;

  /**
   * Both attributes are handed in rather than looked up, because both are *required* and both
   * are written through later. Holding the nodes makes "a `TempoDef` has a name and a value"
   * structural, and makes `setValue` write exactly where {@link parseData} read — through the
   * namespace-tolerant `attribute()`, where an unprefixed `getAttribute` could miss a prefixed
   * spelling.
   */
  private constructor(
    private readonly nameAttr: Attribute,
    private readonly valueAttr: Attribute,
  ) {
    super();
    // Java throws here on a malformed value (TempoDef.java:88, Double.parseDouble) and its
    // `createTempoDef` turns that into null, so the style skips the def. `parseJavaDouble`
    // reproduces that; `parseFloat` would keep a NaN-valued def. PARITY.md, "Fixed bugs", P1.
    this.value = parseJavaDouble(valueAttr.getValue(), 'tempoDef/@value');
  }

  getName(): string {
    return this.nameAttr.getValue();
  }

  /** Rename the def, in the object and in the element. */
  setName(name: string): void {
    this.nameAttr.setValue(name);
  }

  private static buildFromNameValue(name: string, value: number): TempoDef {
    const e = new Element('tempoDef', MPM_NAMESPACE);
    e.addAttribute(new Attribute('name', name));
    e.addAttribute(new Attribute('value', String(value)));
    return TempoDef.buildFromXml(e);
  }

  private static buildFromXml(xml: Element): TempoDef {
    const nameAttr = requireDefName(xml, 'TempoDef');
    const valueAttr = attribute('value', xml);
    if (valueAttr === null)
      throw new MissingNodeError('Cannot generate TempoDef object. Missing value attribute.');

    const td = new TempoDef(nameAttr, valueAttr);
    td.parseData(xml);
    return td;
  }

  /**
   * What is left to read once the constructor has the two required attributes: the element
   * itself and the optional `xml:id`. Nothing here can fail — the name and value checks happen
   * ahead of construction, in that order (see the constructor).
   */
  protected parseData(xml: Element): void {
    this.setXml(xml);
    this.id = attribute('id', xml);
  }

  /**
   * Create a def from a name and a bpm value. Reports the reason rather than printing it: the
   * failure is always a `MeicoError` the library raised deliberately — an absent `@name` or
   * `@value`, or a `@value` that is not a Java double — and `defs/defName.ts` explains why the
   * catch keeps its narrowing to those.
   */
  static fromNameValue(name: string, value: number): Result<TempoDef, MpmParseError> {
    try {
      return ok(TempoDef.buildFromNameValue(name, value));
    } catch (e) {
      return skipMalformedDef(e, 'TempoDef');
    }
  }

  /** Create a def by parsing an existing `tempoDef` element. See {@link fromNameValue}. */
  static fromXml(xml: Element): Result<TempoDef, MpmParseError> {
    try {
      return ok(TempoDef.buildFromXml(xml));
    } catch (e) {
      return skipMalformedDef(e, 'TempoDef');
    }
  }

  getValue(): number {
    return this.value;
  }

  setValue(value: number): void {
    this.value = value;
    this.valueAttr.setValue(String(value));
  }

  static createDefaultTempoDef(name: string): Result<TempoDef, MpmParseError> {
    return TempoDef.fromNameValue(name, TempoDef.getDefaultTempo(name));
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
