import { Attribute, Element } from '../../../xml/XomTypes.js';
import { addToListAttribute } from '../../../xml/ids.js';
import { attribute, getAttributeValue } from '../../../xml/tree.js';
import { MPM_NAMESPACE } from '../../names.js';
import { KeyValue } from '../../../supplementary/KeyValue.js';
import { GenericMap } from './GenericMap.js';

/**
 * An MPM `asynchronyMap`: how far ahead of or behind the beat a part plays, in
 * milliseconds.
 *
 * Unlike every other map here this one works purely in the millisecond domain, so it
 * has to run *after* the tempo map has assigned `milliseconds.date` — it shifts those
 * attributes rather than the symbolic dates. An `<asynchrony>` stays in force until the
 * next one, and a part with no asynchrony at all is simply left alone.
 *
 * Port of meico.mpm.elements.maps.AsynchronyMap
 */
export class AsynchronyMap extends GenericMap {
  private constructor(typeOrXml: string | Element) {
    super(typeOrXml);
  }

  static createAsynchronyMap(xml?: Element): AsynchronyMap | null {
    try {
      return xml !== undefined ? new AsynchronyMap(xml) : new AsynchronyMap('asynchronyMap');
    } catch (e) {
      console.error(e);
      return null;
    }
  }

  addAsynchrony(date: number, millisecondsOffset: number): number {
    const e = new Element('asynchrony', MPM_NAMESPACE);
    e.addAttribute(new Attribute('date', String(date)));
    e.addAttribute(new Attribute('milliseconds.offset', String(millisecondsOffset)));
    return this.insertElement(new KeyValue(date, e), false);
  }

  getAsynchronyAt(date: number): number {
    let i = this.getElementIndexBeforeAt(date);
    if (i < 0) return 0.0;
    while (!this.elements[i].getValue().getLocalName().includes('asynchrony'))
      if (--i < 0) return 0.0;
    return parseFloat(getAttributeValue('milliseconds.offset', this.elements[i].getValue()));
  }

  /**
   * Shift every `milliseconds.date` (and, where the note ends inside the same
   * asynchrony, `milliseconds.date.end`) of `map` by the offset in force at that date.
   *
   * `mapEntries` is a working copy that shrinks as entries are finished: each pass
   * collects the entries it has dealt with in `done` and removes them afterwards, so a
   * later asynchrony never revisits a note an earlier one already moved. The removal
   * happens after the inner loop rather than during it, because splicing mid-iteration
   * would skip entries.
   *
   * That removal is a **pure optimisation** — it cannot change the output, and it is worth
   * knowing why, because it means no fixture can ever guard it. An entry only reaches
   * `done` when its note ends before the next asynchrony starts, and the inner loop only
   * reaches an entry at all while its onset is before that same date. So on the next pass
   * both guards fail for it — its onset is below `elements[asynIndex].getKey()` and its end
   * is below it too — and neither shift, nor the `modified` bookkeeping that hangs off
   * them, runs. Re-visiting a finished entry is a no-op; removing it just stops the walk
   * getting longer. (Checked, not only argued: disabling the removal entirely leaves 300
   * randomly generated multi-asynchrony renders byte-identical.)
   *
   * Two clamps are deliberate. A shifted start is floored at 0 — a negative asynchrony
   * on the very first note must not produce a negative timestamp. A shifted end is
   * floored at `startDateMs + 1`, guaranteeing every note keeps a duration of at least
   * one millisecond, since zero-length notes vanish from the MIDI output.
   */
  renderAsynchronyToMap(map: GenericMap | null): void {
    if (map === null || this.elements.length === 0) return;
    let mapEntries = [...map.getAllElements()];
    const done: KeyValue<number, Element>[] = [];
    for (let asynIndex = 0; asynIndex < this.size(); ++asynIndex) {
      const asynElement = this.getElement(asynIndex)!;
      const xmlId = getAttributeValue('xml:id', asynElement);
      const asynEndDate =
        asynIndex < this.elements.length - 1
          ? this.elements[asynIndex + 1].getKey()
          : Number.MAX_VALUE;
      const offset = parseFloat(getAttributeValue('milliseconds.offset', asynElement));
      for (const mapEntry of mapEntries) {
        if (mapEntry.getKey() >= asynEndDate) break;
        let startDateMs = 0.0;
        if (mapEntry.getKey() >= this.elements[asynIndex].getKey()) {
          const att = attribute('milliseconds.date', mapEntry.getValue());
          if (att !== null) {
            startDateMs = Math.max(0.0, parseFloat(att.getValue()) + offset);
            att.setValue(String(startDateMs));
            addToListAttribute(mapEntry.getValue(), 'modified', xmlId);
          }
        }
        const dur = attribute('duration', mapEntry.getValue());
        if (dur === null) {
          done.push(mapEntry);
          continue;
        }
        const end = parseFloat(dur.getValue()) + mapEntry.getKey();
        if (end >= asynEndDate) continue;
        if (end >= this.elements[asynIndex].getKey()) {
          const att = attribute('milliseconds.date.end', mapEntry.getValue());
          if (att !== null) {
            const ms = parseFloat(att.getValue()) + offset;
            att.setValue(String(Math.max(ms, startDateMs + 1)));
            addToListAttribute(mapEntry.getValue(), 'modified', xmlId);
          }
        }
        done.push(mapEntry);
      }
      // One filtering pass instead of an indexOf-plus-splice per entry. `done` holds each
      // entry at most once per iteration and the entries are distinct objects, so removing
      // by set membership drops exactly the elements the repeated `indexOf`/`splice` did —
      // in the same surviving order, and without being quadratic in the part's length.
      if (done.length > 0) {
        const removals = new Set(done);
        mapEntries = mapEntries.filter((entry) => !removals.has(entry));
        done.length = 0;
      }
    }
  }

  static renderAsynchronyToMap(map: GenericMap | null, asynchronyMap: AsynchronyMap | null): void {
    if (asynchronyMap !== null) asynchronyMap.renderAsynchronyToMap(map);
  }
}
