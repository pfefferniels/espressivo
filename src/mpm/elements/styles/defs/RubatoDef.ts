import { Attribute, Element } from '../../../../xml/XomTypes.js';
import { attribute } from '../../../../xml/tree.js';
import { MPM_NAMESPACE } from '../../../names.js';
import { KeyValue } from '../../../../supplementary/KeyValue.js';
import { parseJavaDouble } from '../../../../supplementary/parseJavaDouble.js';
import { AbstractDef } from './AbstractDef.js';

/**
 * A `rubatoDef`: a reusable rubato shape that stretches and compresses time inside a
 * frame of `frameLength` ticks.
 * Port of meico.mpm.elements.styles.defs.RubatoDef
 *
 * Parsing is not read-only: missing `intensity`, `lateStart` and `earlyEnd` attributes are
 * ADDED to the element with their defaults, and out-of-range values are clamped in place,
 * so a def that round-trips through this class serializes more attributes than it came
 * with. See {@link ensureIntensityBoundaries} and
 * {@link ensureLateStartEarlyEndBoundaries} for the clamping rules.
 *
 * PARITY NOTE: Java renames a foreign element to `rubatoDef` via `Element.setLocalName()`
 * when parsing. XomTypes has no `setLocalName`, so a def parsed from a differently named
 * element keeps that name here. `RubatoStyle` only ever feeds this factory real
 * `rubatoDef` children, so the pipeline never reaches that difference.
 */
export class RubatoDef extends AbstractDef {
  private frameLength = 0.0;
  private intensity = 1.0;
  private lateStart = 0.0;
  private earlyEnd = 1.0;

  private constructor() {
    super();
  }

  private parseDataInternal(xml: Element): void {
    super.parseData(xml);

    const frameLengthAttr = attribute('frameLength', xml);
    if (frameLengthAttr === null)
      throw new Error('Cannot generate RubatoDef object. Missing attribute frameLength.');

    let intensityAttr = attribute('intensity', xml);
    if (intensityAttr === null) {
      intensityAttr = new Attribute('intensity', String(this.intensity));
      xml.addAttribute(intensityAttr);
    } else {
      // Each of these four reads throws on a malformed value, which createRubatoDef turns
      // into null so the style skips the def — Java's behaviour at RubatoDef.java:135,148,
      // 153-154. PARITY.md, "Fixed bugs", P1.
      intensityAttr.setValue(
        String(
          RubatoDef.ensureIntensityBoundaries(
            parseJavaDouble(intensityAttr.getValue(), 'rubatoDef/@intensity'),
          ),
        ),
      );
    }

    let lateStartAttr = attribute('lateStart', xml);
    if (lateStartAttr === null) {
      lateStartAttr = new Attribute('lateStart', String(this.lateStart));
      xml.addAttribute(lateStartAttr);
    }
    let earlyEndAttr = attribute('earlyEnd', xml);
    if (earlyEndAttr === null) {
      earlyEndAttr = new Attribute('earlyEnd', String(this.earlyEnd));
      xml.addAttribute(earlyEndAttr);
    }
    const le = RubatoDef.ensureLateStartEarlyEndBoundaries(
      parseJavaDouble(lateStartAttr.getValue(), 'rubatoDef/@lateStart'),
      parseJavaDouble(earlyEndAttr.getValue(), 'rubatoDef/@earlyEnd'),
    );
    lateStartAttr.setValue(String(le.getKey()));
    earlyEndAttr.setValue(String(le.getValue()));

    this.frameLength = parseJavaDouble(frameLengthAttr.getValue(), 'rubatoDef/@frameLength');
    this.intensity = parseJavaDouble(intensityAttr.getValue(), 'rubatoDef/@intensity');
    this.lateStart = le.getKey();
    this.earlyEnd = le.getValue();
  }

  protected parseData(xml: Element): void {
    this.parseDataInternal(xml);
  }

  /**
   * Create a def from a name plus frame length (optionally with the full shape), or by
   * parsing an existing element. Returns null — after logging — instead of throwing, e.g.
   * when `frameLength` is missing. Passing `intensity` also requires `lateStart` and
   * `earlyEnd`; that is why they travel as one 5-argument overload.
   */
  static createRubatoDef(name: string, frameLength: number): RubatoDef | null;
  static createRubatoDef(
    name: string,
    frameLength: number,
    intensity: number,
    lateStart: number,
    earlyEnd: number,
  ): RubatoDef | null;
  static createRubatoDef(xml: Element): RubatoDef | null;
  static createRubatoDef(
    nameOrXml: string | Element,
    frameLength?: number,
    intensity?: number,
    lateStart?: number,
    earlyEnd?: number,
  ): RubatoDef | null {
    try {
      const rd = new RubatoDef();
      if (typeof nameOrXml === 'string') {
        const e = new Element('rubatoDef', MPM_NAMESPACE);
        e.addAttribute(new Attribute('name', nameOrXml));
        e.addAttribute(new Attribute('frameLength', String(frameLength)));
        if (intensity !== undefined) {
          e.addAttribute(new Attribute('intensity', String(intensity)));
          e.addAttribute(new Attribute('lateStart', String(lateStart)));
          e.addAttribute(new Attribute('earlyEnd', String(earlyEnd)));
        }
        rd.parseDataInternal(e);
      } else {
        rd.parseDataInternal(nameOrXml);
      }
      return rd;
    } catch (e) {
      console.error(e);
      return null;
    }
  }

  getFrameLength(): number {
    return this.frameLength;
  }
  setFrameLength(frameLength: number): void {
    this.frameLength = Math.max(frameLength, 0.0);
    this.getXml().getAttribute('frameLength')!.setValue(String(this.frameLength));
  }

  getIntensity(): number {
    return this.intensity;
  }
  setIntensity(intensity: number): void {
    this.intensity = RubatoDef.ensureIntensityBoundaries(intensity);
    this.getXml().getAttribute('intensity')!.setValue(String(this.intensity));
  }

  getLateStart(): number {
    return this.lateStart;
  }
  /** Rejected outright if it would reach `earlyEnd`; a negative value is clamped to 0. */
  setLateStart(lateStart: number): void {
    if (lateStart >= this.earlyEnd) {
      console.error('Setting lateStart >= earlyEnd is not allowed.');
      return;
    }
    let value = lateStart;
    if (value < 0.0) {
      console.error('Invalid rubato lateStart < 0.0 is set to 0.0.');
      value = 0.0;
    }
    this.lateStart = value;
    this.getXml().getAttribute('lateStart')!.setValue(String(this.lateStart));
  }

  getEarlyEnd(): number {
    return this.earlyEnd;
  }
  /** Rejected outright if it would reach `lateStart`; a value above 1 is clamped to 1. */
  setEarlyEnd(earlyEnd: number): void {
    if (this.lateStart >= earlyEnd) {
      console.error('Setting earlyEnd <= lateStart is not allowed.');
      return;
    }
    let value = earlyEnd;
    if (value > 1.0) {
      console.error('Invalid rubato earlyEnd > 1.0 is set to 1.0.');
      value = 1.0;
    }
    this.earlyEnd = value;
    this.getXml().getAttribute('earlyEnd')!.setValue(String(this.earlyEnd));
  }

  /**
   * Set both bounds at once — the only way to move them past each other, since
   * {@link setLateStart} and {@link setEarlyEnd} each refuse to cross the other.
   */
  setLateStartAndEarlyEnd(lateStart: number, earlyEnd: number): void {
    const le = RubatoDef.ensureLateStartEarlyEndBoundaries(lateStart, earlyEnd);
    this.earlyEnd = le.getValue();
    this.getXml().getAttribute('earlyEnd')!.setValue(String(this.earlyEnd));
    this.lateStart = le.getKey();
    this.getXml().getAttribute('lateStart')!.setValue(String(this.lateStart));
  }

  /** Intensity must be non-zero and positive: 0 becomes 0.01, negatives are inverted. */
  private static ensureIntensityBoundaries(intensity: number): number {
    if (intensity === 0.0) {
      console.error('Invalid rubato intensity = 0.0 is set to 0.01.');
      return 0.01;
    }
    if (intensity < 0.0) {
      console.error('Invalid rubato intensity < 0.0 is inverted.');
      return intensity * -1.0;
    }
    return intensity;
  }

  /**
   * Clamp the pair into `0 <= lateStart < earlyEnd <= 1`. The three tests run in this order
   * and the last one overrides the first two, so a crossed pair collapses to the full
   * frame (0, 1) rather than to the individually clamped values.
   */
  private static ensureLateStartEarlyEndBoundaries(
    lateStart: number,
    earlyEnd: number,
  ): KeyValue<number, number> {
    const le = new KeyValue(lateStart, earlyEnd);
    if (lateStart < 0.0) {
      console.error('Invalid rubato lateStart < 0.0 is set to 0.0.');
      le.setKey(0.0);
    }
    if (earlyEnd > 1.0) {
      console.error('Invalid rubato earlyEnd > 1.0 is set to 1.0.');
      le.setValue(1.0);
    }
    if (lateStart >= earlyEnd) {
      console.error('Invalid rubato lateStart >= earlyEnd, setting them to 0.0 and 1.0.');
      le.setKey(0.0);
      le.setValue(1.0);
    }
    return le;
  }
}
