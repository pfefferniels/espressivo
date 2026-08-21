import { withNext } from '../../../prelude/index.js';
import { Attribute, Element } from '../../../xml/XomTypes.js';
import { addToListAttribute } from '../../../xml/ids.js';
import { attribute, getAttributeValue } from '../../../xml/tree.js';
import { MPM_NAMESPACE } from '../../names.js';
import type { KeyValue } from '../../../supplementary/KeyValue.js';
import { GenericMap } from './GenericMap.js';
import { type Result } from '../../../prelude/index.js';
import { type MpmParseError } from '../parseError.js';

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
  private constructor(xml: Element) {
    super(xml);
  }

  /**
   * A fresh, empty `<asynchronyMap>`, or one read from an existing element. The empty form is
   * total, the parsing one is not; see {@link GenericMap.emptyMapElement}.
   */
  static createAsynchronyMap(): AsynchronyMap;
  static createAsynchronyMap(xml: Element): Result<AsynchronyMap, MpmParseError>;
  static createAsynchronyMap(
    xml?: Element | null,
  ): AsynchronyMap | Result<AsynchronyMap, MpmParseError> {
    return xml === undefined
      ? new AsynchronyMap(GenericMap.emptyMapElement('asynchronyMap'))
      : GenericMap.makeMap(xml, 'AsynchronyMap', (elt) => new AsynchronyMap(elt));
  }

  addAsynchrony(date: number, millisecondsOffset: number): number {
    const e = new Element('asynchrony', MPM_NAMESPACE);
    e.addAttribute(new Attribute('date', String(date)));
    e.addAttribute(new Attribute('milliseconds.offset', String(millisecondsOffset)));
    return this.insertElement({ key: date, value: e }, false);
  }

  getAsynchronyAt(date: number): number {
    // The nearest entry at or before `date` whose name says `asynchrony`, skipping back over
    // the `<style>` switches in between. No asynchrony in scope means an offset of 0.
    for (let i = this.getElementIndexBeforeAt(date); i >= 0; --i) {
      const e = this.entryAt(i).value;
      if (e.getLocalName().includes('asynchrony'))
        return parseFloat(getAttributeValue('milliseconds.offset', e));
    }
    return 0.0;
  }

  /**
   * Shift every `milliseconds.date` (and, where the note ends inside the same
   * asynchrony, `milliseconds.date.end`) of `map` by the offset in force at that date.
   *
   * `mapEntries` is a working copy that shrinks as entries are finished: each pass collects
   * the entries it has dealt with in `done` and removes them afterwards, because splicing
   * mid-iteration would skip entries.
   *
   * That removal is a pure optimisation, which is why no fixture can guard it. An entry only
   * reaches `done` once its note ends before the next asynchrony starts, and both guards then
   * fail for it on every later pass, so neither the shift nor the `modified` bookkeeping runs
   * again. Measured: disabling the removal leaves 300 randomly generated multi-asynchrony
   * renders byte-identical.
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
    // Every asynchrony with the one that ends its span, and `null` for the last, whose span
    // runs to the end of time. `getAllElements()` hands back the live index by reference, and
    // the body writes to `map` rather than to `this`, so walking it is safe here.
    for (const [asynEntry, next] of withNext(this.getAllElements())) {
      const asynElement = asynEntry.value;
      const asynStartDate = asynEntry.key;
      // `'id'`, not `'xml:id'` — see `Msm.exportMidi`'s note. `@modified` records which
      // performance elements modified a note; the misspelled lookup recorded an empty string
      // for every one of them, fixed in the fork at `meico@68ccd3b8`. No reference fixture
      // shows the difference — `GenerateAllMapsReference` builds its asynchrony instructions
      // with no id at all — so a unit test pins it instead.
      const xmlId = getAttributeValue('id', asynElement);
      const asynEndDate = next?.key ?? Number.MAX_VALUE;
      const offset = parseFloat(getAttributeValue('milliseconds.offset', asynElement));
      for (const mapEntry of mapEntries) {
        if (mapEntry.key >= asynEndDate) break;
        let startDateMs = 0.0;
        if (mapEntry.key >= asynStartDate) {
          const att = attribute('milliseconds.date', mapEntry.value);
          if (att !== null) {
            startDateMs = Math.max(0.0, parseFloat(att.getValue()) + offset);
            att.setValue(String(startDateMs));
            addToListAttribute(mapEntry.value, 'modified', xmlId);
          }
        }
        const dur = attribute('duration', mapEntry.value);
        if (dur === null) {
          done.push(mapEntry);
          continue;
        }
        const end = parseFloat(dur.getValue()) + mapEntry.key;
        if (end >= asynEndDate) continue;
        if (end >= asynStartDate) {
          const att = attribute('milliseconds.date.end', mapEntry.value);
          if (att !== null) {
            const ms = parseFloat(att.getValue()) + offset;
            att.setValue(String(Math.max(ms, startDateMs + 1)));
            addToListAttribute(mapEntry.value, 'modified', xmlId);
          }
        }
        done.push(mapEntry);
      }
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
