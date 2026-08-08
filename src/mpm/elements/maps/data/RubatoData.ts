import { Attribute, Element } from '../../../../xml/XomTypes.js';
import type { RubatoStyle } from '../../styles/RubatoStyle.js';
import type { RubatoDef } from '../../styles/defs/RubatoDef.js';

/**
 * Port of meico.mpm.elements.maps.data.RubatoData
 */
export class RubatoData {
  xml: Element | null = null;
  xmlId: string | null = null;

  styleName = '';
  style: RubatoStyle | null = null;
  rubatoDefString: string | null = null;
  rubatoDef: RubatoDef | null = null;

  startDate = 0.0;
  endDate: number | null = null;

  frameLength: number | null = null;
  intensity: number | null = 1.0;
  lateStart: number | null = 0.0;
  earlyEnd: number | null = 1.0;

  loop = false;

  constructor();
  constructor(xml: Element);
  constructor(xml?: Element) {
    if (xml === undefined) return;

    this.xml = xml;
    this.startDate = parseFloat(xml.getAttributeValue('date')!);

    const nameRef = xml.getAttribute('name.ref');
    if (nameRef !== null) this.rubatoDefString = nameRef.getValue();

    const frameLengthAtt = xml.getAttribute('frameLength');
    this.frameLength = frameLengthAtt !== null ? parseFloat(frameLengthAtt.getValue()) : null;

    const intensityAtt = xml.getAttribute('intensity');
    this.intensity = intensityAtt !== null ? parseFloat(intensityAtt.getValue()) : null;

    const lateStartAtt = xml.getAttribute('lateStart');
    this.lateStart = lateStartAtt !== null ? parseFloat(lateStartAtt.getValue()) : null;

    const earlyEndAtt = xml.getAttribute('earlyEnd');
    this.earlyEnd = earlyEndAtt !== null ? parseFloat(earlyEndAtt.getValue()) : null;

    const loopAtt = xml.getAttribute('loop');
    if (loopAtt !== null) this.loop = loopAtt.getValue() === 'true';

    const id = xml.getAttribute('id', 'http://www.w3.org/XML/1998/namespace');
    if (id !== null) this.xmlId = id.getValue();
  }

  clone(): RubatoData {
    const c = new RubatoData();
    c.xml = this.xml === null ? null : (this.xml.copy() as Element);
    c.xmlId = this.xmlId;
    c.styleName = this.styleName;
    c.style = this.style;
    c.startDate = this.startDate;
    c.endDate = this.endDate;
    c.rubatoDefString = this.rubatoDefString;
    c.rubatoDef = this.rubatoDef;
    c.frameLength = this.frameLength;
    c.intensity = this.intensity;
    c.lateStart = this.lateStart;
    c.earlyEnd = this.earlyEnd;
    c.loop = this.loop;
    return c;
  }
}
