import { Attribute, Element } from '../../../../xml/XomTypes.js';
import type { TempoStyle } from '../../styles/TempoStyle.js';

/**
 * All data needed to compute the tempo in force over one span of the timeline —
 * the flattened form of a single MPM `<tempo>` element plus the context that only
 * the surrounding {@link TempoMap} knows (its `endDate`, the style in scope).
 *
 * `bpm` and `transitionTo` each exist twice, as a string and as a number. The
 * string is what the XML said; it may be a literal number *or* a style-relative
 * name such as `"Allegro"`, which only a {@link TempoStyle} can resolve. The
 * numeric field holds the resolved value, or `null` while it is still unknown.
 * Serialization prefers the string, so round-tripping keeps the original wording.
 *
 * Port of meico.mpm.elements.maps.data.TempoData
 */
export class TempoData {
  xml: Element | null = null;
  xmlId: string | null = null;

  styleName = '';
  style: TempoStyle | null = null;

  startDate = 0.0;
  startDateMilliseconds: number | null = null;
  endDate: number | null = null;

  bpmString: string | null = null;
  bpm: number | null = null;

  transitionToString: string | null = null;
  transitionTo: number | null = null;

  beatLength = 0.25;

  meanTempoAt: number | null = null;
  exponent: number | null = null;

  constructor(xml?: Element) {
    if (xml === undefined) return;

    this.xml = xml;
    this.startDate = parseFloat(xml.getAttributeValue('date')!);
    this.beatLength = parseFloat(xml.getAttributeValue('beatLength')!);

    const bpmAtt = xml.getAttribute('bpm');
    if (bpmAtt !== null) {
      const val = parseFloat(bpmAtt.getValue());
      if (!isNaN(val)) {
        this.bpm = val;
      } else {
        this.bpmString = bpmAtt.getValue();
      }
    }

    const transitionToAtt = xml.getAttribute('transition.to');
    if (transitionToAtt !== null) {
      const val = parseFloat(transitionToAtt.getValue());
      if (!isNaN(val)) {
        this.transitionTo = val;
      } else {
        this.transitionToString = transitionToAtt.getValue();
      }
    }

    const meanTempoAtAtt = xml.getAttribute('meanTempoAt');
    if (meanTempoAtAtt !== null) this.meanTempoAt = parseFloat(meanTempoAtAtt.getValue());

    const id = xml.getAttribute('id', 'http://www.w3.org/XML/1998/namespace');
    if (id !== null) this.xmlId = id.getValue();
  }

  /**
   * PARITY NOTE: `startDateMilliseconds` is deliberately **not** copied — the Java
   * reference omits it too (TempoData.java `clone()`). It is scratch space that
   * {@link TempoMap.renderTempoToMap} fills in per rendering pass, so a clone is
   * expected to start out without it. Adding it here would diverge from the reference.
   */
  clone(): TempoData {
    const c = new TempoData();
    c.xml = this.xml === null ? null : this.xml.copy();
    c.xmlId = this.xmlId;
    c.styleName = this.styleName;
    c.style = this.style;
    c.startDate = this.startDate;
    c.endDate = this.endDate;
    c.bpmString = this.bpmString;
    c.bpm = this.bpm;
    c.transitionToString = this.transitionToString;
    c.transitionTo = this.transitionTo;
    c.beatLength = this.beatLength;
    c.meanTempoAt = this.meanTempoAt;
    c.exponent = this.exponent;
    return c;
  }

  isConstantTempo(): boolean {
    return this.transitionTo === null || this.bpm === null || this.transitionTo === this.bpm;
  }
}
