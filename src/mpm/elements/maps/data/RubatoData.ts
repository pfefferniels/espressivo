import { Attribute, Element } from '../../../../xml/XomTypes.js';
import type { RubatoStyle } from '../../styles/RubatoStyle.js';
import type { RubatoDef } from '../../styles/defs/RubatoDef.js';

/**
 * All data needed to compute rubato over one span of the timeline — a single MPM
 * `<rubato>` element plus the `endDate` only {@link RubatoMap} knows.
 *
 * Rubato is defined over a repeating *frame* of `frameLength` ticks. Within each frame
 * the timing is warped by a power curve of exponent `intensity`, and the warp is
 * confined to the window between `lateStart` and `earlyEnd` (both fractions of the
 * frame). `loop` decides whether the frame repeats until `endDate` or applies once.
 *
 * Every numeric field is nullable because a `<rubato>` may name a `rubatoDef` instead
 * of spelling the values out; {@link RubatoMap.getRubatoDataOf} fills the gaps from
 * the def and then clamps the window into a valid range.
 *
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

  constructor(xml?: Element) {
    if (xml === undefined) return;

    this.xml = xml;
    this.startDate = parseFloat(xml.getAttributeValue('date')!);

    const nameRef = xml.getAttribute('name.ref');
    if (nameRef !== null) this.rubatoDefString = nameRef.getValue();

    // Note the asymmetry with the field initializers above: those give intensity/
    // lateStart/earlyEnd the MPM defaults (1.0/0.0/1.0), but parsing an element
    // *overwrites them with null* when the attribute is absent rather than leaving the
    // default in place. That is intentional — a missing attribute here means "inherit
    // from the rubatoDef", and RubatoMap.getRubatoDataOf distinguishes the two cases by
    // the null. Changing these to `?? default` would silently defeat def inheritance.
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
