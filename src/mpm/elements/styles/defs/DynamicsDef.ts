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
 * A `dynamicsDef`: it gives a dynamics name ("forte", "pp", …) a numeric MIDI-velocity
 * value.
 * Port of meico.mpm.elements.styles.defs.DynamicsDef
 */
export class DynamicsDef extends AbstractXmlSubtree {
  /** This def's arm of {@link Def}. See {@link requireDefName} on why there is no base class. */
  readonly kind = 'dynamics';
  private value: number;

  /** Both required attributes are held, not looked up; see {@link TempoDef}'s constructor. */
  private constructor(
    private readonly nameAttr: Attribute,
    private readonly valueAttr: Attribute,
  ) {
    super();
    // Malformed value => throw => createDynamicsDef returns null => the style skips the def,
    // as in Java (DynamicsDef.java:88). PARITY.md, "Fixed bugs", P1.
    this.value = parseJavaDouble(valueAttr.getValue(), 'dynamicsDef/@value');
  }

  getName(): string {
    return this.nameAttr.getValue();
  }

  /** Rename the def, in the object and in the element. Was `AbstractDef.setName`. */
  setName(name: string): void {
    this.nameAttr.setValue(name);
  }

  private static fromNameValue(name: string, value: number): DynamicsDef {
    const e = new Element('dynamicsDef', MPM_NAMESPACE);
    e.addAttribute(new Attribute('name', name));
    e.addAttribute(new Attribute('value', String(value)));
    return DynamicsDef.fromXml(e);
  }

  private static fromXml(xml: Element): DynamicsDef {
    const nameAttr = requireDefName(xml, 'DynamicsDef');
    const valueAttr = attribute('value', xml);
    if (valueAttr === null)
      throw new MissingNodeError('Cannot generate DynamicsDef object. Missing value attribute.');

    const dd = new DynamicsDef(nameAttr, valueAttr);
    dd.parseData(xml);
    return dd;
  }

  /** What is left once the constructor has the two required attributes. See {@link TempoDef}. */
  protected parseData(xml: Element): void {
    this.setXml(xml);
    this.id = attribute('id', xml);
  }

  /**
   * Create a def either from a name and a velocity value, or by parsing an existing
   * element. Returns null — after logging — instead of throwing, e.g. when `value` is
   * missing.
   */
  static createDynamicsDef(name: string, value: number): Result<DynamicsDef, MpmParseError>;
  static createDynamicsDef(xml: Element): Result<DynamicsDef, MpmParseError>;
  static createDynamicsDef(
    nameOrXml: string | Element,
    value?: number,
  ): Result<DynamicsDef, MpmParseError> {
    try {
      if (typeof nameOrXml === 'string') {
        // Required by the (name, value) overload; optional only in the implementation
        // signature. See the same note on `TempoDef.createTempoDef`.
        return ok(DynamicsDef.fromNameValue(nameOrXml, value as number));
      } else {
        return ok(DynamicsDef.fromXml(nameOrXml));
      }
    } catch (e) {
      return skipMalformedDef(e, 'DynamicsDef');
    }
  }

  getValue(): number {
    return this.value;
  }

  setValue(value: number): void {
    this.value = value;
    this.valueAttr.setValue(String(value));
  }

  static createDefaultDynamicsDef(name: string): Result<DynamicsDef, MpmParseError> {
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
