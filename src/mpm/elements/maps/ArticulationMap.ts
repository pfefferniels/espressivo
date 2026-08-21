import { Attribute, Element } from '../../../xml/XomTypes.js';
import { attribute, getAttributeValue } from '../../../xml/tree.js';
import { MPM_NAMESPACE } from '../../names.js';
import type { KeyValue } from '../../../supplementary/KeyValue.js';
import { elementAt } from '../../../prelude/index.js';
import { GenericMap } from './GenericMap.js';
import { type Result } from '../../../prelude/index.js';
import { type MpmParseError } from '../parseError.js';
import {
  articulateNote,
  NEUTRAL_ARTICULATION_MODIFIERS,
  type Articulation,
} from './data/articulation.js';
import { ArticulationDef } from '../styles/defs/ArticulationDef.js';
import type { ArticulationStyle } from '../styles/style.js';

/**
 * Everything {@link ArticulationMap.addArticulation} can write into an `<articulation>`
 * element (RULE F5's named-parameter shape, applied inside the library).
 *
 * Optional properties are `?:` and never `null` (RULE N1): an attribute nobody supplied is an
 * attribute that is not written.
 *
 * Three of the twelve modifiers {@link Articulation} reads are writable here, which is the
 * three the map has ever written. The other nine are read-only for now; the type says so
 * rather than accepting them and dropping them.
 */
export interface AddArticulationOptions {
  /** `@date`, in ticks. Always written. */
  readonly date: number;
  /** `@name.ref` — the `articulationDef` in the style currently in scope. Always written. */
  readonly nameRef: string;
  /**
   * `@noteid`, written verbatim. The reader strips the leading `#`, so supply it with one:
   * the attribute holds an XML reference where the score is keyed by bare ids.
   */
  readonly noteid?: string;
  /** `@absoluteDuration`, in ticks. */
  readonly absoluteDuration?: number;
  /** `@absoluteDurationChange`, in ticks. */
  readonly absoluteDurationChange?: number;
  /** `@relativeDuration`, a factor. */
  readonly relativeDuration?: number;
  /** `xml:id` of the articulation element. */
  readonly id?: string;
}

/**
 * An MPM `articulationMap`: staccato, accent, tenuto and the rest — per-note changes to
 * duration, velocity, onset and tuning.
 *
 * This map renders in two passes, and the split is not optional. Tick-domain
 * modifiers are applied by
 * {@link ArticulationMap.renderArticulationToMap_noMillisecondModifiers} before the
 * tempo map runs; millisecond-domain modifiers cannot be, because milliseconds do not
 * exist yet, so they are parked on the notes as `articulation.*Ms` attributes and
 * consumed afterwards by
 * {@link ArticulationMap.renderArticulationToMap_millisecondModifiers}. See
 * {@link Articulation} for the field-by-field division.
 *
 * An `<articulation>` either names a single note through `noteid` or, with no `noteid`,
 * applies to every note at its date. Notes matched by neither fall back to the
 * `defaultArticulation` of the style in force, if it declares one.
 *
 * Port of meico.mpm.elements.maps.ArticulationMap
 */
export class ArticulationMap extends GenericMap {
  private constructor(xml: Element) {
    super(xml);
  }

  /**
   * A fresh, empty `<articulationMap>`, or one read from an existing element. The empty form
   * is total, the parsing one is not; see {@link GenericMap.emptyMapElement}.
   */
  static createArticulationMap(): ArticulationMap;
  static createArticulationMap(xml: Element): Result<ArticulationMap, MpmParseError>;
  static createArticulationMap(
    xml?: Element | null,
  ): ArticulationMap | Result<ArticulationMap, MpmParseError> {
    return xml === undefined
      ? new ArticulationMap(GenericMap.emptyMapElement('articulationMap'))
      : GenericMap.makeMap(xml, 'ArticulationMap', (elt) => new ArticulationMap(elt));
  }

  /**
   * Add an `<articulation>`.
   *
   * Attribute order is `date`, `name.ref`, `noteid`, `absoluteDuration`,
   * `absoluteDurationChange`, `relativeDuration`, `xml:id`, each omitted where the caller
   * supplied nothing. The `addArticulationFromData` arm this replaces wrote `xml:id` second
   * instead of last; nothing in `src/` called it, so no fixture carries that order.
   */
  addArticulation(articulation: AddArticulationOptions): number {
    const e = new Element('articulation', MPM_NAMESPACE);
    e.addAttribute(new Attribute('date', String(articulation.date)));
    e.addAttribute(new Attribute('name.ref', articulation.nameRef));
    if (articulation.noteid !== undefined)
      e.addAttribute(new Attribute('noteid', articulation.noteid));
    if (articulation.absoluteDuration !== undefined)
      e.addAttribute(new Attribute('absoluteDuration', String(articulation.absoluteDuration)));
    if (articulation.absoluteDurationChange !== undefined)
      e.addAttribute(
        new Attribute('absoluteDurationChange', String(articulation.absoluteDurationChange)),
      );
    if (articulation.relativeDuration !== undefined)
      e.addAttribute(new Attribute('relativeDuration', String(articulation.relativeDuration)));
    if (articulation.id !== undefined)
      e.addAttribute(
        new Attribute('xml:id', 'http://www.w3.org/XML/1998/namespace', articulation.id),
      );
    return this.insertElement({ key: articulation.date, value: e }, false);
  }

  addArticulationStyleSwitch(
    date: number,
    styleName: string,
    defaultArticulation?: string | null,
    id?: string | null,
  ): number {
    const e = new Element('style', MPM_NAMESPACE);
    e.addAttribute(new Attribute('date', String(date)));
    e.addAttribute(new Attribute('name.ref', styleName));
    if (defaultArticulation !== null && defaultArticulation !== undefined)
      e.addAttribute(new Attribute('defaultArticulation', defaultArticulation));
    if (id !== null && id !== undefined)
      e.addAttribute(new Attribute('xml:id', 'http://www.w3.org/XML/1998/namespace', id));
    return this.insertElement({ key: date, value: e }, true);
  }

  /**
   * Read the articulation at `index` into an {@link Articulation}, or null if that
   * entry is not an `<articulation>`.
   *
   * Both halves of an articulation are read: the identifying fields, which resolve the
   * `articulationDef` the style in scope supplies, and the twelve numeric modifiers the
   * element may carry itself. The two meet in {@link articulateNote},
   * which runs the def first and these on top of its result — so an inline *absolute*
   * modifier replaces what the def wrote, while an inline *relative* one compounds with
   * it. An absent modifier keeps its neutral default (`relativeDuration` 1.0,
   * `absoluteVelocityChange` 0.0, …), which is what makes an articulation naming nothing
   * but a def render as that def alone.
   *
   * `noteid` has its first character stripped — the attribute holds an XML reference
   * (`#note123`) while the map is keyed by bare IDs.
   */
  getArticulationDataOf(index: number): Articulation | null {
    const i = this.resolveEntryIndex(index, 'articulation');
    if (i < 0) return null;
    const entry = this.entryAt(i);
    const e = entry.value;

    const style = this.findStyle(i);
    const nameRef = attribute('name.ref', e);
    const articulationDefName = nameRef === null ? null : nameRef.getValue();
    const articulationDef =
      style === null || articulationDefName === null
        ? null
        : (style.getDef(articulationDefName) ?? null);

    // `'id'`, not `'xml:id'`: the attribute's LOCAL name is `id`, and `attribute()` — like
    // Java's `Helper.getAttribute` it mirrors — matches on local names only. Java asked for
    // `'xml:id'` here and so never populated this field at all; fixed in the fork at
    // `meico@c1f3fffd`, the last of the three sites `68ccd3b8` opened. PARITY.md §1.
    const xmlId = attribute('id', e);
    const noteid = attribute('noteid', e);

    // null = attribute absent, so the field keeps its neutral. Reads through `parseFloat`
    // rather than `ArticulationDef.parseData`'s `parseJavaDouble`: a def can be skipped by the
    // factory above it, an articulation entry cannot, so there is nowhere for a
    // NumberFormatError to go. One of the map-level reads PARITY.md's P1 entry leaves open.
    const numeric = (name: string): number | null => {
      const a = attribute(name, e);
      return a === null ? null : parseFloat(a.getValue());
    };
    const neutral = NEUTRAL_ARTICULATION_MODIFIERS;

    return {
      xmlId: xmlId === null ? null : xmlId.getValue(),
      date: entry.key,
      noteid: noteid === null ? null : noteid.getValue().substring(1),
      articulationDefName,
      articulationDef,
      absoluteDuration: numeric('absoluteDuration') ?? neutral.absoluteDuration,
      absoluteDurationChange: numeric('absoluteDurationChange') ?? neutral.absoluteDurationChange,
      relativeDuration: numeric('relativeDuration') ?? neutral.relativeDuration,
      absoluteDurationMs: numeric('absoluteDurationMs') ?? neutral.absoluteDurationMs,
      absoluteDurationChangeMs:
        numeric('absoluteDurationChangeMs') ?? neutral.absoluteDurationChangeMs,
      absoluteVelocityChange: numeric('absoluteVelocityChange') ?? neutral.absoluteVelocityChange,
      absoluteVelocity: numeric('absoluteVelocity') ?? neutral.absoluteVelocity,
      relativeVelocity: numeric('relativeVelocity') ?? neutral.relativeVelocity,
      absoluteDelayMs: numeric('absoluteDelayMs') ?? neutral.absoluteDelayMs,
      absoluteDelay: numeric('absoluteDelay') ?? neutral.absoluteDelay,
      detuneCents: numeric('detuneCents') ?? neutral.detuneCents,
      detuneHz: numeric('detuneHz') ?? neutral.detuneHz,
    };
  }

  /** The articulation style in force at `index`, or null where no switch precedes it. */
  private findStyle(index: number): ArticulationStyle | null {
    const s = this.findStyleSwitchAt(index);
    if (s === null) return null;
    return this.getStyle('articulation', getAttributeValue('name.ref', s));
  }

  /**
   * Pass one of two: apply every tick-domain articulation to `map`, and park the
   * millisecond ones for later (see the class doc).
   *
   * Explicit articulations are indexed by the note element they target (one note can collect
   * several), the style switches are resolved into a date-ordered list of default defs, and
   * the map is then walked once: a note with explicit articulations gets those and *only*
   * those — the default is deliberately not also applied — and every other note gets whichever
   * default is current, tracked by a forward-only `defaultArticulationIndex`.
   *
   * The `mapTimingChanged` accumulator is why `map.sort()` runs at the end. Articulation
   * can move a note's onset, which can reorder the map; leaving it unsorted would break
   * every later pass, all of which assume date order. Note the `||` operands' order:
   * `articulateNote` must be called for its side effects on every note, so it has to come
   * first and cannot be short-circuited away.
   */
  renderArticulationToMap_noMillisecondModifiers(map: GenericMap | null): void {
    if (map === null) return;

    // Notes with an explicit (i.e. non-default) articulation, and the data targeting each.
    const noteArtics = new Map<Element, Articulation[]>();
    /** Append to the note's list, starting one where there is none. */
    const fileUnder = (note: Element, ad: Articulation): void => {
      const adList = noteArtics.get(note);
      if (adList === undefined) noteArtics.set(note, [ad]);
      else adList.push(ad);
    };
    let mapTimingChanged = false;

    for (let articIndex = 0; articIndex < this.size(); ++articIndex) {
      const ad = this.getArticulationDataOf(articIndex);
      if (ad === null) continue;

      if (ad.noteid !== null) {
        const index = map.getElementIndexByID(ad.noteid);
        if (index < 0) continue;
        const referee = elementAt(map.getAllElements(), index, 'articulation referee');
        if (referee.key !== ad.date)
          console.error(
            `Warning: articulation date and referee date do not match!\n    ${this.entryAt(articIndex).value.toXML()}\n    ${referee.value.toXML()}`,
          );
        fileUnder(referee.value, ad);
        continue;
      }

      // With no noteid the articulation applies to every note at its own date.
      const elements = map.getAllElementsAt(ad.date);
      for (const element of elements) {
        if (element.value.getLocalName() !== 'note') continue;
        fileUnder(element.value, ad);
      }
    }

    // The default articulation def in force from each style switch, in date order.
    const defaultArticulations: KeyValue<number, ArticulationDef | null>[] = [];
    const styleSwitchList = this.getAllElementsOfType('style');
    for (const styleEntry of styleSwitchList) {
      const aStyle = this.getStyle('articulation', getAttributeValue('name.ref', styleEntry.value));
      if (aStyle === null) continue;

      const defaultArticulationAtt = attribute('defaultArticulation', styleEntry.value);
      if (defaultArticulationAtt === null) {
        defaultArticulations.push({ key: styleEntry.key, value: null });
        continue;
      }

      const aDef = aStyle.getDef(defaultArticulationAtt.getValue()) ?? null;
      if (aDef === null)
        console.error(
          `Warning: attribute ${defaultArticulationAtt.toXML()} in style element refers to an unknown articulationDef.`,
        );
      defaultArticulations.push({ key: styleEntry.key, value: aDef });
    }

    let defaultArticulationIndex = 0;
    for (const mapEntry of map.getAllElements()) {
      if (mapEntry.value.getLocalName() !== 'note') continue;

      const artics = noteArtics.get(mapEntry.value);
      if (artics !== undefined) {
        for (const artic of artics) {
          mapTimingChanged = articulateNote(artic, mapEntry.value) || mapTimingChanged;
        }
        continue;
      }

      // Otherwise the default articulation, advanced to the latest switch at or before this
      // note. `at(…) ?? Infinity`: no successor means no later switch to advance to.
      if (defaultArticulations.length === 0) continue;
      while (
        (defaultArticulations.at(defaultArticulationIndex + 1)?.key ?? Infinity) <= mapEntry.key
      )
        defaultArticulationIndex++;

      const defaultArticulationDef = elementAt(
        defaultArticulations,
        defaultArticulationIndex,
        'default articulation',
      ).value;
      if (defaultArticulationDef === null) continue;

      mapTimingChanged = defaultArticulationDef.articulateNote(mapEntry.value) || mapTimingChanged;
    }

    if (mapTimingChanged) map.sort();
  }

  static renderArticulationToMap_noMillisecondModifiers(
    map: GenericMap | null,
    articulationMap: ArticulationMap | null,
  ): void {
    if (articulationMap !== null)
      articulationMap.renderArticulationToMap_noMillisecondModifiers(map);
  }

  /**
   * Pass two of two: consume the `articulation.*Ms` attributes that pass one parked on
   * the notes, now that the tempo map has produced real millisecond dates.
   *
   * Each attribute is removed as it is applied, so the markers do not survive into the
   * serialized output. The new values are committed only if the note still ends after it
   * starts: a millisecond modifier that would invert or zero a note's duration is dropped
   * wholesale, start and end both keeping their old values rather than half the change
   * landing.
   */
  renderArticulationToMap_millisecondModifiers(map: GenericMap | null): void {
    if (map === null) return;
    for (const entry of map.elements) {
      const dateAtt = attribute('milliseconds.date', entry.value);
      if (dateAtt === null) continue;
      const date = parseFloat(dateAtt.getValue());
      let dateNew = date;
      const endAtt = attribute('milliseconds.date.end', entry.value);
      let endNew = endAtt !== null ? parseFloat(endAtt.getValue()) : null;
      const absoluteDelayMs = attribute('articulation.absoluteDelayMs', entry.value);
      if (absoluteDelayMs !== null) {
        dateNew += parseFloat(absoluteDelayMs.getValue());
        entry.value.removeAttribute(absoluteDelayMs);
      }
      const absoluteDurationMs = attribute('articulation.absoluteDurationMs', entry.value);
      if (absoluteDurationMs !== null) {
        if (endNew !== null) endNew = dateNew + parseFloat(absoluteDurationMs.getValue());
        entry.value.removeAttribute(absoluteDurationMs);
      }
      const absoluteDurationChangeMs = attribute(
        'articulation.absoluteDurationChangeMs',
        entry.value,
      );
      if (absoluteDurationChangeMs !== null) {
        if (endNew !== null) endNew += parseFloat(absoluteDurationChangeMs.getValue());
        entry.value.removeAttribute(absoluteDurationChangeMs);
      }
      if (endNew === null || dateNew < endNew) {
        dateAtt.setValue(String(dateNew));
        if (endAtt !== null && endNew !== null) endAtt.setValue(String(endNew));
      }
    }
  }

  static renderArticulationToMap_millisecondModifiers(
    map: GenericMap | null,
    articulationMap: ArticulationMap | null,
  ): void {
    if (articulationMap !== null) articulationMap.renderArticulationToMap_millisecondModifiers(map);
  }
}
