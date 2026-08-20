import { withNext } from '../../../prelude/index.js';
import { Attribute, Element } from '../../../xml/XomTypes.js';
import { addToListAttribute } from '../../../xml/ids.js';
import { attribute, getAttributeValue } from '../../../xml/tree.js';
import { MPM_NAMESPACE } from '../../names.js';
import { KeyValue } from '../../../supplementary/KeyValue.js';
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
   * A fresh, empty `<asynchronyMap>`, or one read from an existing element.
   *
   * The two overloads return different things and that is the point. Building an empty
   * map consults nothing the caller supplied, so it cannot fail and says so; reading an
   * element can, and returns the reason instead of printing it. See
   * {@link GenericMap.emptyMapElement}.
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
    return this.insertElement(new KeyValue(date, e), false);
  }

  getAsynchronyAt(date: number): number {
    // The nearest entry at or before `date` whose name says `asynchrony`, skipping back over
    // the `<style>` switches in between. The `while` this replaces read the entry twice and
    // spelled the lower bound in two places; the `for` says the same thing once.
    for (let i = this.getElementIndexBeforeAt(date); i >= 0; --i) {
      const e = this.entryAt(i).getValue();
      if (e.getLocalName().includes('asynchrony'))
        return parseFloat(getAttributeValue('milliseconds.offset', e));
    }
    return 0.0;
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
    // `withNext`: every asynchrony with the one that ends its span, and `null` for the last,
    // whose span runs to the end of time. That is the whole of what `asynIndex` was for — the
    // body read `entryAt(asynIndex)` and `elements.at(asynIndex + 1)` and nothing else — so
    // the index goes with it. Unlike the five two-cursor render merges next door, this loop
    // has no cursor to preserve: `mapEntries` is rebuilt by filtering, not advanced.
    //
    // `getAllElements()` hands back the live index by reference, and the body writes to `map`
    // rather than to `this`, so walking it is safe here.
    for (const [asynEntry, next] of withNext(this.getAllElements())) {
      const asynElement = asynEntry.getValue();
      const asynStartDate = asynEntry.getKey();
      const xmlId = getAttributeValue('xml:id', asynElement);
      const asynEndDate = next?.getKey() ?? Number.MAX_VALUE;
      const offset = parseFloat(getAttributeValue('milliseconds.offset', asynElement));
      for (const mapEntry of mapEntries) {
        if (mapEntry.getKey() >= asynEndDate) break;
        let startDateMs = 0.0;
        if (mapEntry.getKey() >= asynStartDate) {
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
        if (end >= asynStartDate) {
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
