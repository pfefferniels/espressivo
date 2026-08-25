import { withNext } from '../../../prelude/index.js';
import { Attribute, Element } from '../../../xml/XomTypes.js';
import { addToListAttribute } from '../../../xml/ids.js';
import { attribute, getAttributeValue } from '../../../xml/tree.js';
import { MPM_NAMESPACE } from '../../names.js';
import type { KeyValue } from '../../../supplementary/KeyValue.js';
import { GenericMap } from './GenericMap.js';
import { type Result } from '../../../prelude/index.js';
import { type MpmParseError } from '../parseError.js';
import { patchAttribute, readId, readNumber } from '../../../xml/attributes.js';

/**
 * Everything an `<asynchrony>` element can say, for {@link AsynchronyMap.addAsynchrony}
 * (RULE F5's named-parameter shape, applied inside the library).
 *
 * Optional properties are `?:` and never `null` (RULE N1): an attribute nobody supplied is an
 * attribute that is not written.
 */
export interface AddAsynchronyOptions {
  /** `@date`, in ticks. Always written. */
  readonly date: number;
  /**
   * `@milliseconds.offset`: negative plays ahead of the beat, positive behind it. Always
   * written, and required — an `<asynchrony>` without it reads as NaN wherever it applies.
   */
  readonly millisecondsOffset: number;
  /** `xml:id` of the asynchrony element. It is what the render appends to a note's `@modified`. */
  readonly id?: string;
}

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
  static createAsynchronyMap(xml?: Element): AsynchronyMap | Result<AsynchronyMap, MpmParseError> {
    return xml === undefined
      ? new AsynchronyMap(GenericMap.emptyMapElement('asynchronyMap'))
      : GenericMap.makeMap(xml, 'AsynchronyMap', (elt) => new AsynchronyMap(elt));
  }

  /**
   * Add an `<asynchrony>`.
   *
   * Attribute order is `date`, `milliseconds.offset`, `xml:id`, the last omitted where the
   * caller supplied nothing.
   *
   * The positional form is the older one and writes exactly what the options form writes; only
   * the options form can carry an `xml:id`.
   */
  addAsynchrony(options: AddAsynchronyOptions): number;
  addAsynchrony(date: number, millisecondsOffset: number): number;
  addAsynchrony(
    ...args: [options: AddAsynchronyOptions] | [date: number, millisecondsOffset: number]
  ): number {
    const options: AddAsynchronyOptions =
      args.length === 1 ? args[0] : { date: args[0], millisecondsOffset: args[1] };

    const e = new Element('asynchrony', MPM_NAMESPACE);
    e.addAttribute(new Attribute('date', String(options.date)));
    e.addAttribute(new Attribute('milliseconds.offset', String(options.millisecondsOffset)));
    if (options.id !== undefined)
      e.addAttribute(new Attribute('xml:id', 'http://www.w3.org/XML/1998/namespace', options.id));
    return this.insertElement({ key: options.date, value: e }, false);
  }

  /**
   * The asynchrony instruction at `index` as the options that would write it — the document as
   * it stands. Null if the entry is not an `<asynchrony>`, or carries no
   * `@milliseconds.offset`.
   *
   * Keyed by entry index, where {@link getAsynchronyAt} is keyed by date and answers the
   * rendered offset in force there, 0 included. This one answers what one element says, and
   * says nothing where there is no element.
   */
  getAsynchronyOptionsOf(index: number): AddAsynchronyOptions | null {
    const i = this.resolveEntryIndex(index, 'asynchrony');
    if (i < 0) return null;

    const entry = this.entryAt(i);
    const e = entry.value;
    const millisecondsOffset = readNumber(e, 'milliseconds.offset');
    if (millisecondsOffset === undefined) return null;

    return {
      date: readNumber(e, 'date') ?? entry.key,
      millisecondsOffset,
      id: readId(e),
    };
  }

  /**
   * Patch the `<asynchrony>` at `index` in place: a field the patch omits is left alone, one it
   * carries as `undefined` has its attribute removed, anything else is written.
   *
   * Patching `@date` re-keys and re-sorts the map, which is the one thing writing the attribute
   * alone would not do — {@link GenericMap.elements} keys on the date read when the element was
   * added, and a stale key makes every later lookup answer from the wrong position.
   *
   * @returns false if the entry is not an `<asynchrony>`, in which case nothing was written.
   */
  updateAsynchronyAt(index: number, patch: Partial<AddAsynchronyOptions>): boolean {
    const i = this.resolveEntryIndex(index, 'asynchrony');
    if (i < 0) return false;

    const e = this.entryAt(i).value;
    patchAttribute(e, patch, 'date');
    patchAttribute(e, patch, 'millisecondsOffset', 'milliseconds.offset');
    patchAttribute(e, patch, 'id', 'xml:id');

    if ('date' in patch) this.sort();
    return true;
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
    if (map === null || this.size() === 0) return;
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
