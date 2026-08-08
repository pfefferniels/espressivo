import { Attribute, Element } from '../../../../xml/XomTypes.js';
import { Helper } from '../../../../mei/Helper.js';
import { Mpm } from '../../../../mpm/Mpm.js';
import { KeyValue } from '../../../../supplementary/KeyValue.js';
import { AbstractDef } from './AbstractDef.js';

/**
 * Port of meico.mpm.elements.styles.defs.RubatoDef
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

    if (this.getXml()!.getLocalName() !== 'rubatoDef') {
      // setLocalName not directly supported
    }

    const frameLengthAttr = Helper.getAttribute('frameLength', this.getXml()!);
    if (frameLengthAttr === null)
      throw new Error('Cannot generate RubatoDef object. Missing attribute frameLength.');

    let intensityAttr = Helper.getAttribute('intensity', this.getXml()!);
    if (intensityAttr === null) {
      intensityAttr = new Attribute('intensity', String(this.intensity));
      this.getXml()!.addAttribute(intensityAttr);
    } else {
      intensityAttr.setValue(
        String(RubatoDef.ensureIntensityBoundaries(parseFloat(intensityAttr.getValue()))),
      );
    }

    let lateStartAttr = Helper.getAttribute('lateStart', this.getXml()!);
    if (lateStartAttr === null) {
      lateStartAttr = new Attribute('lateStart', String(this.lateStart));
      this.getXml()!.addAttribute(lateStartAttr);
    }
    let earlyEndAttr = Helper.getAttribute('earlyEnd', this.getXml()!);
    if (earlyEndAttr === null) {
      earlyEndAttr = new Attribute('earlyEnd', String(this.earlyEnd));
      this.getXml()!.addAttribute(earlyEndAttr);
    }
    const le = RubatoDef.ensureLateStartEarlyEndBoundaries(
      parseFloat(lateStartAttr.getValue()),
      parseFloat(earlyEndAttr.getValue()),
    );
    lateStartAttr.setValue(String(le.getKey()));
    earlyEndAttr.setValue(String(le.getValue()));

    this.frameLength = parseFloat(frameLengthAttr.getValue());
    this.intensity = parseFloat(intensityAttr.getValue());
    this.lateStart = le.getKey();
    this.earlyEnd = le.getValue();
  }

  protected parseData(xml: Element): void {
    this.parseDataInternal(xml);
  }

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
        const e = new Element('rubatoDef', Mpm.MPM_NAMESPACE);
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
    this.getXml()!.getAttribute('frameLength')!.setValue(String(this.frameLength));
  }

  getIntensity(): number {
    return this.intensity;
  }
  setIntensity(intensity: number): void {
    this.intensity = RubatoDef.ensureIntensityBoundaries(intensity);
    this.getXml()!.getAttribute('intensity')!.setValue(String(this.intensity));
  }

  getLateStart(): number {
    return this.lateStart;
  }
  setLateStart(lateStart: number): void {
    if (lateStart >= this.earlyEnd) {
      console.error('Setting lateStart >= earlyEnd is not allowed.');
      return;
    }
    if (lateStart < 0.0) {
      console.error('Invalid rubato lateStart < 0.0 is set to 0.0.');
      lateStart = 0.0;
    }
    this.lateStart = lateStart;
    this.getXml()!.getAttribute('lateStart')!.setValue(String(this.lateStart));
  }

  getEarlyEnd(): number {
    return this.earlyEnd;
  }
  setEarlyEnd(earlyEnd: number): void {
    if (this.lateStart >= earlyEnd) {
      console.error('Setting earlyEnd <= lateStart is not allowed.');
      return;
    }
    if (earlyEnd > 1.0) {
      console.error('Invalid rubato earlyEnd > 1.0 is set to 1.0.');
      earlyEnd = 1.0;
    }
    this.earlyEnd = earlyEnd;
    this.getXml()!.getAttribute('earlyEnd')!.setValue(String(this.earlyEnd));
  }

  setLateStartAndEarlyEnd(lateStart: number, earlyEnd: number): void {
    const le = RubatoDef.ensureLateStartEarlyEndBoundaries(lateStart, earlyEnd);
    this.earlyEnd = le.getValue();
    this.getXml()!.getAttribute('earlyEnd')!.setValue(String(this.earlyEnd));
    this.lateStart = le.getKey();
    this.getXml()!.getAttribute('lateStart')!.setValue(String(this.lateStart));
  }

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
