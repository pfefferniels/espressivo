import { Attribute, Element } from '../../../../xml/XomTypes.js';
import { Helper } from '../../../../mei/Helper.js';
import { Mpm } from '../../../../mpm/Mpm.js';
import { KeyValue } from '../../../../supplementary/KeyValue.js';
import { AbstractDef } from './AbstractDef.js';

/**
 * Port of meico.mpm.elements.styles.defs.AccentuationPatternDef
 */
export class AccentuationPatternDef extends AbstractDef {
  private length = 4.0;
  private accentuations: KeyValue<number[], Element>[] = [];

  private constructor() {
    super();
  }

  private parseDataInternal(xml: Element): void {
    super.parseData(xml);

    let lengthAttr = Helper.getAttribute('length', this.getXml()!);
    if (lengthAttr === null) {
      lengthAttr = new Attribute('length', String(this.length));
      this.getXml()!.addAttribute(lengthAttr);
    }
    this.length = parseFloat(lengthAttr.getValue());

    const acs = Helper.getAllChildElements('accentuation', this.getXml()!);
    if (acs) {
      for (const ac of acs) {
        const att = Helper.getAttribute('beat', ac);
        if (att === null) continue;
        const accentuation = [parseFloat(att.getValue()), 0.0, 0.0, 0.0];

        const valAtt = Helper.getAttribute('value', ac);
        if (valAtt !== null) accentuation[1] = parseFloat(valAtt.getValue());

        const tfAtt = Helper.getAttribute('transition.from', ac);
        if (tfAtt !== null) accentuation[2] = parseFloat(tfAtt.getValue());
        else accentuation[2] = accentuation[1];

        const ttAtt = Helper.getAttribute('transition.to', ac);
        if (ttAtt !== null) accentuation[3] = parseFloat(ttAtt.getValue());
        else accentuation[3] = accentuation[2];

        this.addAccentuationToArrayList(accentuation, ac);
        this.sortXml();
      }
    }
  }

  protected parseData(xml: Element): void {
    this.parseDataInternal(xml);
  }

  static createAccentuationPatternDef(name: string, length: number): AccentuationPatternDef | null;
  static createAccentuationPatternDef(
    name: string,
    length: number,
    id: string,
  ): AccentuationPatternDef | null;
  static createAccentuationPatternDef(xml: Element): AccentuationPatternDef | null;
  static createAccentuationPatternDef(
    nameOrXml: string | Element,
    length?: number,
    id?: string,
  ): AccentuationPatternDef | null {
    try {
      const apd = new AccentuationPatternDef();
      if (typeof nameOrXml === 'string') {
        const e = new Element('accentuationPatternDef', Mpm.MPM_NAMESPACE);
        e.addAttribute(new Attribute('name', nameOrXml));
        e.addAttribute(new Attribute('length', String(length)));
        apd.parseDataInternal(e);
        if (id !== undefined) apd.setId(id);
      } else {
        apd.parseDataInternal(nameOrXml);
      }
      return apd;
    } catch (e) {
      console.error(e);
      return null;
    }
  }

  addAccentuation(
    beat: number,
    value: number,
    transitionFrom: number,
    transitionTo: number,
    id?: string | null,
  ): number {
    const accElt = new Element('accentuation', Mpm.MPM_NAMESPACE);
    accElt.addAttribute(new Attribute('beat', String(beat)));
    accElt.addAttribute(new Attribute('value', String(value)));
    accElt.addAttribute(new Attribute('transition.from', String(transitionFrom)));
    accElt.addAttribute(new Attribute('transition.to', String(transitionTo)));

    if (id !== undefined && id !== null) {
      accElt.addAttribute(new Attribute('xml:id', 'http://www.w3.org/XML/1998/namespace', id));
    }

    const index = this.addAccentuationToArrayList(
      [beat, value, transitionFrom, transitionTo],
      accElt,
    );
    this.getXml()!.insertChild(accElt, index);
    return index;
  }

  addAccentuationFromXml(xml: Element): number {
    const att = xml.getAttribute('beat');
    if (att === null) return -1;
    const accentuation = [parseFloat(att.getValue()), 0.0, 0.0, 0.0];

    const valAtt = xml.getAttribute('value');
    if (valAtt !== null) accentuation[1] = parseFloat(valAtt.getValue());

    const tfAtt = xml.getAttribute('transition.from');
    if (tfAtt !== null) accentuation[2] = parseFloat(tfAtt.getValue());
    else accentuation[2] = accentuation[1];

    const ttAtt = xml.getAttribute('transition.to');
    if (ttAtt !== null) accentuation[3] = parseFloat(ttAtt.getValue());
    else accentuation[3] = accentuation[2];

    const index = this.addAccentuationToArrayList(accentuation, xml);
    this.getXml()!.insertChild(xml, index);
    return index;
  }

  private addAccentuationToArrayList(accentuation: number[], xml: Element): number {
    for (let j = this.accentuations.length - 1; j >= 0; --j) {
      if (accentuation[0] >= this.accentuations[j].getKey()[0]) {
        this.accentuations.splice(j + 1, 0, new KeyValue(accentuation, xml));
        return j + 1;
      }
    }
    this.accentuations.splice(0, 0, new KeyValue(accentuation, xml));
    return 0;
  }

  private sortXml(): void {
    const xml = this.getXml()!;
    for (let i = 0; i < this.accentuations.length; ++i) {
      const accentuation = this.accentuations[i].getValue();
      xml.removeChild(accentuation);
      xml.insertChild(accentuation, i);
    }
  }

  removeAccentuation(index: number): void {
    if (index >= this.accentuations.length) return;
    this.getXml()!.removeChild(this.accentuations[index].getValue());
    this.accentuations.splice(index, 1);
  }

  getAllAccentuations(): KeyValue<number[], Element>[] {
    return this.accentuations;
  }

  getAccentuationAttributes(index: number): number[] | null {
    if (index >= this.accentuations.length) return null;
    return this.accentuations[index].getKey();
  }

  getAccentuationXml(index: number): Element | null {
    if (index >= this.accentuations.length) return null;
    return this.accentuations[index].getValue();
  }

  getAccentuationAt(beatPosition: number): number {
    if (beatPosition < this.accentuations[0].getKey()[0]) return 0.0;
    if (beatPosition >= this.length + 1.0)
      return this.accentuations[this.accentuations.length - 1].getKey()[3];

    let accentuation: number[] | null = null;
    let segmentEnd = this.length + 1.0;
    for (let i = this.accentuations.length - 1; i >= 0; --i) {
      accentuation = this.accentuations[i].getKey();
      if (beatPosition === accentuation[0]) return accentuation[1];
      if (beatPosition > accentuation[0]) {
        if (i > this.accentuations.length - 1) segmentEnd = this.accentuations[i + 1].getKey()[0];
        break;
      }
    }

    return (
      ((beatPosition - accentuation![0]) * (accentuation![3] - accentuation![2])) /
        (segmentEnd - accentuation![0]) +
      accentuation![2]
    );
  }

  size(): number {
    return this.accentuations.length;
  }
  getLength(): number {
    return this.length;
  }

  setLength(length: number): void {
    this.length = length;
    this.getXml()!.getAttribute('length')!.setValue(String(length));
  }
}
