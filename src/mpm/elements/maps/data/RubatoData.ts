import type { Element } from '../../../../xml/XomTypes.js';
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
 * This is a **plain record with exactly one producer**. It does not parse XML — the port
 * used to carry a `constructor(xml)` transcribing `<rubato>`, but nothing ever called it
 * and its transcription disagreed with the live one (it nulled `intensity`/`lateStart`/
 * `earlyEnd` for a missing attribute, where `getRubatoDataOf` leaves the initializers
 * below standing as the identity warp). If you need a `RubatoData` from an element, call
 * `getRubatoDataOf` — it is the only reader, and the only one that resolves the style,
 * the def and the `endDate`.
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

  clone(): RubatoData {
    const c = new RubatoData();
    c.xml = this.xml === null ? null : this.xml.copy();
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
