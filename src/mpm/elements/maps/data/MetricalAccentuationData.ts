import type { Element } from '../../../../xml/XomTypes.js';
import type { MetricalAccentuationStyle } from '../../styles/style.js';
import type { AccentuationPatternDef } from '../../styles/defs/AccentuationPatternDef.js';

/**
 * All data needed to apply a metrical accentuation pattern over one span of the
 * timeline — a single MPM `<accentuationPattern>` element plus the `endDate` only
 * {@link MetricalAccentuationMap} knows.
 *
 * The pattern itself lives in an `accentuationPatternDef`, referenced by name; this
 * class carries only the placement of that pattern: from when, scaled by how much,
 * whether it `loop`s past its own length, and whether its beats are counted from each
 * measure start (`stickToMeasures`, the default) or from the instruction's own date.
 *
 * This is a **plain record with exactly one producer**. It does not parse XML — the port
 * used to carry a `constructor(xml)` transcribing `<accentuationPattern>`, but nothing
 * called it, and it was more permissive than the renderer: it happily produced a datum
 * with `scale` NaN and no `style`, where
 * {@link MetricalAccentuationMap.getMetricalAccentuationDataOf} rejects an instruction
 * that is missing `@name.ref`, missing `@scale`, or out of any style's scope. Build these
 * with that reader; it is the only one that resolves the def this class exists to place.
 *
 * Port of meico.mpm.elements.maps.data.MetricalAccentuationData
 */
export class MetricalAccentuationData {
  xml: Element | null = null;
  xmlId: string | null = null;

  styleName = '';
  style: MetricalAccentuationStyle | null = null;

  accentuationPatternDefName: string | null = null;
  accentuationPatternDef: AccentuationPatternDef | null = null;

  startDate = 0.0;
  endDate: number | null = null;
  scale = 1.0;
  loop = false;
  stickToMeasures = true;

  clone(): MetricalAccentuationData {
    const c = new MetricalAccentuationData();
    c.xml = this.xml === null ? null : this.xml.copy();
    c.xmlId = this.xmlId;
    c.styleName = this.styleName;
    c.style = this.style;
    c.startDate = this.startDate;
    c.endDate = this.endDate;
    c.accentuationPatternDefName = this.accentuationPatternDefName;
    c.accentuationPatternDef = this.accentuationPatternDef;
    c.scale = this.scale;
    c.loop = this.loop;
    c.stickToMeasures = this.stickToMeasures;
    return c;
  }
}
