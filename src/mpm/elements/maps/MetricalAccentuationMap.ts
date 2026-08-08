import { Attribute, Element } from '../../../xml/XomTypes.js';
import { attribute, getAttributeValue } from '../../../xml/tree.js';
import { Mpm } from '../../../mpm/Mpm.js';
import { KeyValue } from '../../../supplementary/KeyValue.js';
import { GenericMap } from './GenericMap.js';
import { MetricalAccentuationData } from './data/MetricalAccentuationData.js';
import { MetricalAccentuationStyle } from '../styles/MetricalAccentuationStyle.js';

/**
 * An MPM `metricalAccentuationMap`: the emphasis pattern of the metre — the reason a
 * downbeat sounds stronger than an offbeat.
 *
 * Each `<accentuationPattern>` points at an `accentuationPatternDef` holding the actual
 * per-beat accentuation values, and this map only places that pattern on the timeline.
 * Rendering adds `accentuation * scale` to each note's existing `velocity`, so it must
 * run *after* the dynamics map has established one.
 *
 * Port of meico.mpm.elements.maps.MetricalAccentuationMap
 */
export class MetricalAccentuationMap extends GenericMap {
  private constructor(typeOrXml: string | Element) {
    super(typeOrXml);
  }

  static createMetricalAccentuationMap(xml?: Element): MetricalAccentuationMap | null {
    try {
      return xml !== undefined
        ? new MetricalAccentuationMap(xml)
        : new MetricalAccentuationMap('metricalAccentuationMap');
    } catch (e) {
      console.error(e);
      return null;
    }
  }

  addAccentuationPattern(
    date: number,
    accentuationPatternDefName: string,
    scale: number,
    loop?: boolean,
    stickToMeasures?: boolean,
  ): number {
    const e = new Element('accentuationPattern', Mpm.MPM_NAMESPACE);
    e.addAttribute(new Attribute('date', String(date)));
    e.addAttribute(new Attribute('name.ref', accentuationPatternDefName));
    e.addAttribute(new Attribute('scale', String(scale)));
    if (loop !== undefined) e.addAttribute(new Attribute('loop', String(loop)));
    if (stickToMeasures !== undefined)
      e.addAttribute(new Attribute('stickToMeasures', String(stickToMeasures)));
    return this.insertElement(new KeyValue(date, e), false);
  }

  /**
   * Read the accentuation instruction at `index` into a
   * {@link MetricalAccentuationData}. Returns null unless everything needed to render is
   * present: a `<accentuationPattern>` entry with both `name.ref` and `scale`, a style
   * in scope, and — implicitly — a def that the style can resolve.
   */
  getMetricalAccentuationDataOf(index: number): MetricalAccentuationData | null {
    if (this.elements.length === 0 || index < 0) return null;
    const i = index >= this.elements.length ? this.elements.length - 1 : index;
    const e = this.elements[i].getValue();
    if (e.getLocalName() !== 'accentuationPattern') return null;
    const md = new MetricalAccentuationData();
    const nameRefAtt = attribute('name.ref', e);
    if (nameRefAtt === null) return null;
    md.accentuationPatternDefName = nameRefAtt.getValue();
    const scaleAtt = attribute('scale', e);
    if (scaleAtt === null) return null;
    md.scale = parseFloat(scaleAtt.getValue());
    md.startDate = this.elements[i].getKey();
    md.endDate = this.getEndDate(i);
    md.xml = e;
    const att = attribute('id', e);
    if (att !== null) md.xmlId = att.getValue();
    const loopAtt = attribute('loop', e);
    if (loopAtt !== null) md.loop = loopAtt.getValue() === 'true';
    const stmAtt = attribute('stickToMeasures', e);
    if (stmAtt !== null) md.stickToMeasures = stmAtt.getValue() === 'true';
    md.styleName = '';
    for (let j = i; j >= 0; --j) {
      const s = this.elements[j].getValue();
      if (s.getLocalName() === 'style') {
        md.styleName = getAttributeValue('name.ref', s);
        break;
      }
    }
    const gStyle = this.getStyle(
      Mpm.METRICAL_ACCENTUATION_STYLE,
      md.styleName,
    ) as MetricalAccentuationStyle | null;
    if (gStyle !== null) {
      md.style = gStyle;
      md.accentuationPatternDef = md.style.getDef(md.accentuationPatternDefName) ?? null;
      return md;
    }
    return null;
  }

  private getEndDate(index: number): number {
    for (let j = index + 1; j < this.elements.length; ++j) {
      if (this.elements[j].getValue().getLocalName() === 'accentuationPattern')
        return this.elements[j].getKey();
    }
    return Number.MAX_VALUE;
  }

  /**
   * Add each note's metrical accentuation to its `velocity`, in place.
   *
   * The work is in locating the note's beat. That needs the time signature in force,
   * which is tracked incrementally: `timeSignIndex` only ever moves forward as the map
   * is walked, and whenever it does, the derived quantities are all recomputed together
   * — `ticksPerBeat`, the measure length, and the pattern length, which depends on the
   * denominator too. The initial values (4/4, one beat per quarter) are what applies
   * when there is no time signature map at all.
   *
   * `stickToMeasures` picks what the beat count is relative to: the current measure (the
   * default, so the pattern re-aligns at every barline) or the pattern's own length,
   * letting it float free of the metre. Beats are 1-based, hence the `1.0 +`.
   *
   * RENDERING MATH — `velocity + accentuation * md.scale` and the two beat formulas must
   * keep their exact form and order.
   */
  renderMetricalAccentuationToMap(
    map: GenericMap | null,
    timeSignatureMap: GenericMap | null,
    ppq: number,
  ): void {
    if (map === null || this.elements.length === 0) return;
    const ppq4 = 4.0 * ppq;
    let timeSignIndex = -1,
      tsDate = 0.0,
      tsNumerator = 4.0,
      tsDenominator = 4;
    let ticksPerBeat = ppq,
      tickLengthOfOneMeasure = ticksPerBeat * tsNumerator;
    let mapIndex = 0;
    for (let accIndex = 0; accIndex < this.size(); ++accIndex) {
      const md = this.getMetricalAccentuationDataOf(accIndex);
      if (md === null) continue;
      let patternLengthTicks = (md.accentuationPatternDef!.getLength() * ppq4) / tsDenominator;
      for (; mapIndex < map.size(); ++mapIndex) {
        const mapEntry = map.elements[mapIndex];
        if (mapEntry.getKey() < md.startDate) continue;
        const velocityAtt = attribute('velocity', mapEntry.getValue());
        if (velocityAtt === null) continue;
        if (timeSignatureMap !== null) {
          let update = false;
          for (let tsIndex = timeSignIndex + 1; tsIndex < timeSignatureMap.size(); ++tsIndex) {
            if (timeSignatureMap.getAllElements()[tsIndex].getKey() > mapEntry.getKey()) break;
            timeSignIndex = tsIndex;
            update = true;
          }
          if (update) {
            const timeSign = timeSignatureMap.getAllElements()[timeSignIndex];
            tsDate = timeSign.getKey();
            tsNumerator = parseFloat(getAttributeValue('numerator', timeSign.getValue()));
            tsDenominator = parseInt(getAttributeValue('denominator', timeSign.getValue()));
            ticksPerBeat = ppq4 / tsDenominator;
            tickLengthOfOneMeasure = ticksPerBeat * tsNumerator;
            patternLengthTicks = (md.accentuationPatternDef!.getLength() * ppq4) / tsDenominator;
          }
        }
        if (
          mapEntry.getKey() >= md.endDate! ||
          (!md.loop && mapEntry.getKey() >= md.startDate + patternLengthTicks)
        )
          break;
        let beat: number;
        if (md.stickToMeasures)
          beat = 1.0 + ((mapEntry.getKey() - tsDate) % tickLengthOfOneMeasure) / ticksPerBeat;
        else beat = 1.0 + ((mapEntry.getKey() - tsDate) % patternLengthTicks) / ticksPerBeat;
        const velocity = parseFloat(velocityAtt.getValue());
        const accentuation = md.accentuationPatternDef!.getAccentuationAt(beat);
        velocityAtt.setValue(String(velocity + accentuation * md.scale));
      }
    }
  }

  static renderMetricalAccentuationToMap(
    map: GenericMap | null,
    metricalAccentuationMap: MetricalAccentuationMap | null,
    timeSignatureMap: GenericMap | null,
    ppq: number,
  ): void {
    if (metricalAccentuationMap !== null)
      metricalAccentuationMap.renderMetricalAccentuationToMap(map, timeSignatureMap, ppq);
  }
}

GenericMap.registerMapFactory('metricalAccentuationMap', (xml) =>
  MetricalAccentuationMap.createMetricalAccentuationMap(xml),
);
