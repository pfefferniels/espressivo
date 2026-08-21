import { Attribute, Element } from '../../../xml/XomTypes.js';
import { attribute } from '../../../xml/tree.js';
import { MPM_NAMESPACE } from '../../names.js';
import { KeyValue } from '../../../supplementary/KeyValue.js';
import { GenericMap } from './GenericMap.js';
import { type Result } from '../../../prelude/index.js';
import { type MpmParseError } from '../parseError.js';
import { RubatoData } from './data/RubatoData.js';
import { resolveRubato, type Rubato } from './data/rubato.js';
import { elementAt, mapPresent } from '../../../prelude/index.js';

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
  private constructor(xml: Element) {
    super(xml);
  }

  /**
   * A fresh, empty `<rubatoMap>`, or one read from an existing element. The empty form is
   * total, the parsing one is not; see {@link GenericMap.emptyMapElement}.
   */
  static createRubatoMap(): RubatoMap;
  static createRubatoMap(xml: Element): Result<RubatoMap, MpmParseError>;
  static createRubatoMap(xml?: Element | null): RubatoMap | Result<RubatoMap, MpmParseError> {
    return xml === undefined
      ? new RubatoMap(GenericMap.emptyMapElement('rubatoMap'))
      : GenericMap.makeMap(xml, 'RubatoMap', (elt) => new RubatoMap(elt));
  }

  /**
   * Add a `<rubato>` that declares its own warp window.
   *
   * One of three ways in, distinguished by what they write: this one a frame,
   * {@link addRubatoRef} a `name.ref`, {@link addRubatoData} a whole payload.
   */
  addRubatoWindow(
    date: number,
    frameLength: number,
    intensity: number,
    lateStart: number,
    earlyEnd: number,
    loop: boolean,
  ): number {
    const e = new Element('rubato', MPM_NAMESPACE);
    e.addAttribute(new Attribute('date', String(date)));
    e.addAttribute(new Attribute('frameLength', String(frameLength)));
    e.addAttribute(new Attribute('intensity', String(intensity)));
    e.addAttribute(new Attribute('lateStart', String(lateStart)));
    e.addAttribute(new Attribute('earlyEnd', String(earlyEnd)));
    e.addAttribute(new Attribute('loop', String(loop)));
    return this.insertElement(new KeyValue(date, e), false);
  }

  /**
   * Add a `<rubato>` that refers to a `rubatoDef` by name. See {@link addRubatoWindow}.
   */
  addRubatoRef(date: number, rubatoDefName: string, loop: boolean): number {
    const e = new Element('rubato', MPM_NAMESPACE);
    e.addAttribute(new Attribute('date', String(date)));
    e.addAttribute(new Attribute('name.ref', rubatoDefName));
    e.addAttribute(new Attribute('loop', String(loop)));
    return this.insertElement(new KeyValue(date, e), false);
  }

  /**
   * Add a `<rubato>` from a {@link RubatoData} — the only form that can write a `name.ref`
   * AND a window on the same instruction, and the only one that may omit either.
   * See {@link addRubatoWindow}.
   */
  addRubatoData(data: RubatoData): number {
    const e = new Element('rubato', MPM_NAMESPACE);
    e.addAttribute(new Attribute('date', String(data.startDate)));
    if (data.rubatoDefString !== null)
      e.addAttribute(new Attribute('name.ref', data.rubatoDefString));
    if (data.frameLength !== null)
      e.addAttribute(new Attribute('frameLength', String(data.frameLength)));
    if (data.intensity !== null) e.addAttribute(new Attribute('intensity', String(data.intensity)));
    if (data.lateStart !== null) e.addAttribute(new Attribute('lateStart', String(data.lateStart)));
    if (data.earlyEnd !== null) e.addAttribute(new Attribute('earlyEnd', String(data.earlyEnd)));
    e.addAttribute(new Attribute('loop', String(data.loop)));
    if (data.xmlId !== null)
      e.addAttribute(new Attribute('xml:id', 'http://www.w3.org/XML/1998/namespace', data.xmlId));
    return this.insertElement(new KeyValue(data.startDate, e), false);
  }

  /**
   * Read the rubato instruction at `index` into a {@link Rubato}. Returns null if the
   * entry is not a `<rubato>`, or if no `frameLength` can be determined — without a frame
   * there is nothing to warp, so that case is a hard reject rather than a default.
   *
   * This method says which of the five parameters the *element* declares;
   * {@link resolveRubato} owns what to do about the rest — inherit from the `rubatoDef`,
   * fall back to the identity warp, clamp the window, or reject. "Declares" means carries the
   * attribute, not carries a usable value: `parseFloat` of a malformed value is `NaN`, which
   * is not nullish and therefore still beats the def.
   * `tests/comparison/malformedValues.test.ts` pins that.
   *
   * The `rubatoDef` is resolved only through a style in scope; a `@name.ref` with no style
   * switched on resolves to nothing, and the instruction then stands on its own attributes.
   */
  getRubatoDataOf(index: number): Rubato | null {
    const i = this.resolveEntryIndex(index, 'rubato');
    if (i < 0) return null;
    const entry = this.entryAt(i);
    const e = entry.getValue();

    const style = this.getStyle('rubato', this.findStyleNameAt(i));
    const nameRef = attribute('name.ref', e);
    const def =
      style === null || nameRef === null ? null : (style.getDef(nameRef.getValue()) ?? null);

    const declaredFloat = (name: string): number | null =>
      mapPresent(attribute(name, e), (a) => parseFloat(a.getValue()));

    return resolveRubato(
      {
        startDate: entry.getKey(),
        endDate: this.nextDateOfType(i, 'rubato'),
      },
      {
        frameLength: declaredFloat('frameLength'),
        intensity: declaredFloat('intensity'),
        lateStart: declaredFloat('lateStart'),
        earlyEnd: declaredFloat('earlyEnd'),
        loop: mapPresent(attribute('loop', e), (a) => a.getValue() === 'true'),
      },
      def,
    );
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
  private static computeRubatoTransformation(date: number, rd: Rubato): number {
    const localDate = (date - rd.startDate) % rd.frameLength;
    const d =
      (Math.pow(localDate / rd.frameLength, rd.intensity) * (rd.earlyEnd - rd.lateStart) +
        rd.lateStart) *
      rd.frameLength;
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
        const mapEntry = elementAt(map.elements, mapIndex, 'target entry');
        if (mapEntry.getKey() < rd.startDate) continue;
        if (
          mapEntry.getKey() >= rd.endDate ||
          (!rd.loop && mapEntry.getKey() >= rd.startDate + rd.frameLength)
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

      // A prefix drain: the entries are date-ordered, so the run that this rubato warps ends
      // at the first one it does not, and the whole run is spliced off in one step.
      let drained = 0;
      for (const pd of pendingDurations) {
        const dateEnd = pd.getKey();
        if (dateEnd >= rd.endDate || (!rd.loop && dateEnd >= rd.startDate + rd.frameLength)) break;
        if (dateEnd >= rd.startDate)
          pd.getValue().setValue(String(RubatoMap.computeRubatoTransformation(dateEnd, rd)));
        ++drained;
      }
      if (drained > 0) pendingDurations.splice(0, drained);
    }
  }

  static renderRubatoToMap(map: GenericMap | null, rubatoMap: RubatoMap | null): void {
    if (rubatoMap !== null) rubatoMap.renderRubatoToMap(map);
  }
}
