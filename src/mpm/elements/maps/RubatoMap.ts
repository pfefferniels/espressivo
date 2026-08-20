import { Attribute, Element } from '../../../xml/XomTypes.js';
import { attribute } from '../../../xml/tree.js';
import { MPM_NAMESPACE } from '../../names.js';
import { KeyValue } from '../../../supplementary/KeyValue.js';
import { GenericMap } from './GenericMap.js';
import { RubatoData } from './data/RubatoData.js';

/**
 * An MPM `rubatoMap`: expressive push and pull of the timing, applied as a repeating
 * warp of the symbolic dates.
 *
 * Rubato works in the **tick** domain, before the tempo map converts to milliseconds —
 * it moves `date.perf` and `date.end.perf`, and the resulting timestamps fall out of the
 * tempo conversion later. A rubato is defined over a frame of `frameLength` ticks; with
 * `loop` the frame repeats until the next instruction, without it the rubato applies to
 * one frame only and the rest of the span is left unwarped.
 *
 * Port of meico.mpm.elements.maps.RubatoMap
 */
export class RubatoMap extends GenericMap {
  private constructor(typeOrXml: string | Element) {
    super(typeOrXml);
  }

  static createRubatoMap(xml?: Element): RubatoMap | null {
    try {
      return xml !== undefined ? new RubatoMap(xml) : new RubatoMap('rubatoMap');
    } catch (e) {
      console.error(e);
      return null;
    }
  }

  addRubato(
    date: number,
    frameLength: number,
    intensity: number,
    lateStart: number,
    earlyEnd: number,
    loop: boolean,
  ): number;
  addRubato(date: number, rubatoDefName: string, loop: boolean): number;
  addRubato(data: RubatoData): number;
  addRubato(
    dateOrData: number | RubatoData,
    arg2?: number | string,
    arg3?: number | boolean,
    arg4?: number,
    arg5?: number,
    arg6?: boolean,
  ): number {
    if (typeof dateOrData !== 'number') {
      const data = dateOrData;
      const e = new Element('rubato', MPM_NAMESPACE);
      e.addAttribute(new Attribute('date', String(data.startDate)));
      if (data.rubatoDefString !== null)
        e.addAttribute(new Attribute('name.ref', data.rubatoDefString));
      if (data.frameLength !== null)
        e.addAttribute(new Attribute('frameLength', String(data.frameLength)));
      if (data.intensity !== null)
        e.addAttribute(new Attribute('intensity', String(data.intensity)));
      if (data.lateStart !== null)
        e.addAttribute(new Attribute('lateStart', String(data.lateStart)));
      if (data.earlyEnd !== null) e.addAttribute(new Attribute('earlyEnd', String(data.earlyEnd)));
      e.addAttribute(new Attribute('loop', String(data.loop)));
      if (data.xmlId !== null)
        e.addAttribute(new Attribute('xml:id', 'http://www.w3.org/XML/1998/namespace', data.xmlId));
      return this.insertElement(new KeyValue(data.startDate, e), false);
    }
    const date = dateOrData;
    const e = new Element('rubato', MPM_NAMESPACE);
    e.addAttribute(new Attribute('date', String(date)));
    if (typeof arg2 === 'string') {
      e.addAttribute(new Attribute('name.ref', arg2));
      e.addAttribute(new Attribute('loop', String(arg3)));
    } else {
      e.addAttribute(new Attribute('frameLength', String(arg2)));
      e.addAttribute(new Attribute('intensity', String(arg3)));
      e.addAttribute(new Attribute('lateStart', String(arg4)));
      e.addAttribute(new Attribute('earlyEnd', String(arg5)));
      e.addAttribute(new Attribute('loop', String(arg6)));
    }
    return this.insertElement(new KeyValue(date, e), false);
  }

  /**
   * Read the rubato instruction at `index` into a {@link RubatoData}. Returns null if
   * the entry is not a `<rubato>`, or if no `frameLength` can be determined — without a
   * frame there is nothing to warp, so that case is a hard reject rather than a default.
   *
   * Each of `frameLength`, `intensity`, `lateStart` and `earlyEnd` is taken from the
   * element if present and otherwise inherited from the referenced `rubatoDef`. Where
   * neither supplies a value the field keeps {@link RubatoData}'s own initializer, and
   * for the last three that initializer (1.0/0.0/1.0) *is* the identity warp — so the
   * absence of both sources is a no-op rather than an error. `frameLength` is the
   * exception, and the null return above is why.
   *
   * The final clamps keep the warp window valid: `lateStart` is floored at 0,
   * `earlyEnd` capped at 1, and a window that is inverted or empty
   * (`lateStart >= earlyEnd`) is reset to the full frame rather than producing a
   * degenerate transformation.
   */
  getRubatoDataOf(index: number): RubatoData | null {
    const i = this.resolveEntryIndex(index, 'rubato');
    if (i < 0) return null;
    const e = this.elements[i].getValue();
    const rd = new RubatoData();
    rd.startDate = this.elements[i].getKey();
    rd.endDate = this.nextDateOfType(i, 'rubato');
    rd.xml = e;
    const att = attribute('id', e);
    if (att !== null) rd.xmlId = att.getValue();
    rd.styleName = this.findStyleNameAt(i) ?? rd.styleName;
    rd.style = this.getStyle('rubato', rd.styleName);
    if (rd.style !== null) {
      const nrAtt = attribute('name.ref', e);
      if (nrAtt !== null) {
        rd.rubatoDefString = nrAtt.getValue();
        rd.rubatoDef = rd.style.getDef(rd.rubatoDefString) ?? null;
      }
    }
    const flAtt = attribute('frameLength', e);
    if (flAtt !== null) rd.frameLength = parseFloat(flAtt.getValue());
    else if (rd.rubatoDef !== null) rd.frameLength = rd.rubatoDef.getFrameLength();
    else return null;
    const loopAtt = attribute('loop', e);
    if (loopAtt !== null) rd.loop = loopAtt.getValue() === 'true';
    const intAtt = attribute('intensity', e);
    if (intAtt !== null) rd.intensity = parseFloat(intAtt.getValue());
    else if (rd.rubatoDef !== null) rd.intensity = rd.rubatoDef.getIntensity();
    const lsAtt = attribute('lateStart', e);
    if (lsAtt !== null) rd.lateStart = parseFloat(lsAtt.getValue());
    else if (rd.rubatoDef !== null) rd.lateStart = rd.rubatoDef.getLateStart();
    const eeAtt = attribute('earlyEnd', e);
    if (eeAtt !== null) rd.earlyEnd = parseFloat(eeAtt.getValue());
    else if (rd.rubatoDef !== null) rd.earlyEnd = rd.rubatoDef.getEarlyEnd();
    // ensure boundaries
    if (rd.lateStart !== null && rd.lateStart < 0.0) rd.lateStart = 0.0;
    if (rd.earlyEnd !== null && rd.earlyEnd > 1.0) rd.earlyEnd = 1.0;
    if (rd.lateStart !== null && rd.earlyEnd !== null && rd.lateStart >= rd.earlyEnd) {
      rd.lateStart = 0.0;
      rd.earlyEnd = 1.0;
    }
    return rd;
  }

  /**
   * Warp one date through the rubato curve.
   *
   * `localDate` is the position within the current frame (the `%` is what makes the
   * frame repeat); the power curve of exponent `intensity` remaps it into the window
   * between `lateStart` and `earlyEnd`; and `date + d - localDate` puts the warped
   * offset back onto the frame's absolute start. An `intensity` of 1 is the identity
   * over the full window, above 1 delays, below 1 rushes.
   *
   * RENDERING MATH — evaluation order is load-bearing. In particular
   * `Math.pow(localDate / rd.frameLength, rd.intensity)` must not become `**`, and the
   * final `date + d - localDate` must not be regrouped: every performed onset in the
   * output depends on the exact bits this returns.
   */
  private static computeRubatoTransformation(date: number, rd: RubatoData): number {
    const localDate = (date - rd.startDate) % rd.frameLength!;
    const d =
      (Math.pow(localDate / rd.frameLength!, rd.intensity!) * (rd.earlyEnd! - rd.lateStart!) +
        rd.lateStart!) *
      rd.frameLength!;
    return date + d - localDate;
  }

  /**
   * Warp `date.perf` (and the corresponding end dates) of every entry of `map` that
   * falls under a rubato instruction. Mutates the map in place; nothing is returned.
   *
   * `pendingDurations` collects end dates whose notes started inside the span, so that a
   * note's end is warped by the same rubato as its start even though it is reached
   * later. It holds the {@link Attribute} objects themselves rather than indices, which
   * is what lets the deferred pass write straight back without a second lookup. Notes
   * that have a `duration.perf` but no `date.end.perf` get one synthesised here.
   *
   * Both loops `break` rather than `continue` when they run past the end of the span or
   * past the single frame of a non-looping rubato — the entries are date-ordered, so the
   * first one out of range means all the rest are too.
   */
  renderRubatoToMap(map: GenericMap | null): void {
    if (map === null || this.elements.length === 0) return;
    const pendingDurations: KeyValue<number, Attribute>[] = [];
    let mapIndex = 0;
    for (let rubIndex = 0; rubIndex < this.size(); ++rubIndex) {
      const rd = this.getRubatoDataOf(rubIndex);
      if (rd === null) continue;
      for (; mapIndex < map.size(); ++mapIndex) {
        const mapEntry = map.elements[mapIndex];
        if (mapEntry.getKey() < rd.startDate) continue;
        if (
          mapEntry.getKey() >= rd.endDate! ||
          (!rd.loop && mapEntry.getKey() >= rd.startDate + rd.frameLength!)
        )
          break;

        const dateAtt = attribute('date.perf', mapEntry.getValue());
        if (dateAtt !== null)
          dateAtt.setValue(
            String(RubatoMap.computeRubatoTransformation(parseFloat(dateAtt.getValue()), rd)),
          );

        let dateEndAtt = attribute('date.end.perf', mapEntry.getValue());
        if (dateEndAtt !== null) {
          const endDate = parseFloat(dateEndAtt.getValue());
          pendingDurations.push(new KeyValue(endDate, dateEndAtt));
          continue;
        }
        const durAtt = attribute('duration.perf', mapEntry.getValue());
        if (durAtt !== null) {
          const endDate = mapEntry.getKey() + parseFloat(durAtt.getValue());
          dateEndAtt = new Attribute('date.end.perf', String(endDate));
          mapEntry.getValue().addAttribute(dateEndAtt);
          pendingDurations.push(new KeyValue(endDate, dateEndAtt));
        }
      }

      for (let i = 0; i < pendingDurations.length; ++i) {
        const pd = pendingDurations[i];
        const dateEnd = pd.getKey();
        if (dateEnd >= rd.endDate! || (!rd.loop && dateEnd >= rd.startDate + rd.frameLength!))
          break;
        if (dateEnd >= rd.startDate)
          pd.getValue().setValue(String(RubatoMap.computeRubatoTransformation(dateEnd, rd)));
        pendingDurations.splice(i, 1);
        --i;
      }
    }
  }

  static renderRubatoToMap(map: GenericMap | null, rubatoMap: RubatoMap | null): void {
    if (rubatoMap !== null) rubatoMap.renderRubatoToMap(map);
  }
}
