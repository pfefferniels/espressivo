import { Attribute, Element } from '../../../xml/XomTypes.js';
import { attribute, getAttributeValue } from '../../../xml/tree.js';
import { MPM_NAMESPACE } from '../../names.js';
import { KeyValue } from '../../../supplementary/KeyValue.js';
import { GenericMap } from './GenericMap.js';
import { ArticulationData } from './data/ArticulationData.js';
import { ArticulationDef } from '../styles/defs/ArticulationDef.js';

/**
 * An MPM `articulationMap`: staccato, accent, tenuto and the rest — per-note changes to
 * duration, velocity, onset and tuning.
 *
 * This map renders in **two passes**, and the split is not optional. Tick-domain
 * modifiers are applied by
 * {@link ArticulationMap.renderArticulationToMap_noMillisecondModifiers} before the
 * tempo map runs; millisecond-domain modifiers cannot be, because milliseconds do not
 * exist yet, so they are parked on the notes as `articulation.*Ms` attributes and
 * consumed afterwards by
 * {@link ArticulationMap.renderArticulationToMap_millisecondModifiers}. See
 * {@link ArticulationData} for the field-by-field division.
 *
 * An `<articulation>` either names a single note through `noteid` or, with no `noteid`,
 * applies to every note at its date. Notes matched by neither fall back to the
 * `defaultArticulation` of the style in force, if it declares one.
 *
 * Port of meico.mpm.elements.maps.ArticulationMap
 */
export class ArticulationMap extends GenericMap {
  private constructor(typeOrXml: string | Element) {
    super(typeOrXml);
  }

  static createArticulationMap(xml?: Element): ArticulationMap | null {
    try {
      return xml !== undefined ? new ArticulationMap(xml) : new ArticulationMap('articulationMap');
    } catch (e) {
      console.error(e);
      return null;
    }
  }

  addArticulation(
    date: number,
    articulationDefName: string | null,
    noteid: string | null,
    id: string | null,
  ): number {
    const e = new Element('articulation', MPM_NAMESPACE);
    e.addAttribute(new Attribute('date', String(date)));
    if (articulationDefName === null) return -1;
    e.addAttribute(new Attribute('name.ref', articulationDefName));
    if (noteid !== null) e.addAttribute(new Attribute('noteid', noteid));
    if (id !== null)
      e.addAttribute(new Attribute('xml:id', 'http://www.w3.org/XML/1998/namespace', id));
    return this.insertElement(new KeyValue(date, e), false);
  }

  addArticulationFromData(data: ArticulationData): number {
    const e = new Element('articulation', MPM_NAMESPACE);
    e.addAttribute(new Attribute('date', String(data.date)));
    if (data.xmlId !== null)
      e.addAttribute(new Attribute('xml:id', 'http://www.w3.org/XML/1998/namespace', data.xmlId));
    if (data.articulationDefName !== null)
      e.addAttribute(new Attribute('name.ref', data.articulationDefName));
    if (data.noteid !== null) e.addAttribute(new Attribute('noteid', data.noteid));
    if (data.absoluteDuration !== null)
      e.addAttribute(new Attribute('absoluteDuration', String(data.absoluteDuration)));
    if (data.absoluteDurationChange !== 0.0)
      e.addAttribute(new Attribute('absoluteDurationChange', String(data.absoluteDurationChange)));
    if (data.relativeDuration !== 1.0)
      e.addAttribute(new Attribute('relativeDuration', String(data.relativeDuration)));
    return this.insertElement(new KeyValue(data.date, e), false);
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
    return this.insertElement(new KeyValue(date, e), true);
  }

  /**
   * Read the articulation at `index` into an {@link ArticulationData}, or null if that
   * entry is not an `<articulation>`.
   *
   * Both halves of an articulation are read: the identifying fields, which resolve the
   * `articulationDef` the style in scope supplies, and the twelve numeric modifiers the
   * element may carry itself. The two meet in {@link ArticulationData.articulateNote},
   * which runs the def first and these on top of its result — so an inline *absolute*
   * modifier replaces what the def wrote, while an inline *relative* one compounds with
   * it. An absent modifier keeps its neutral default (`relativeDuration` 1.0,
   * `absoluteVelocityChange` 0.0, …), which is what makes an articulation naming nothing
   * but a def render as that def alone.
   *
   * `noteid` has its first character stripped — the attribute holds an XML reference
   * (`#note123`) while the map is keyed by bare IDs.
   */
  getArticulationDataOf(index: number): ArticulationData | null {
    const i = this.resolveEntryIndex(index, 'articulation');
    if (i < 0) return null;
    const e = this.elements[i].getValue();
    const ad = new ArticulationData();
    ad.xml = e;
    ad.date = this.elements[i].getKey();
    const att = attribute('xml:id', e);
    if (att !== null) ad.xmlId = att.getValue();
    const nidAtt = attribute('noteid', e);
    if (nidAtt !== null) ad.noteid = nidAtt.getValue().substring(1);
    this.findStyle(i, ad);
    const nrAtt = attribute('name.ref', e);
    if (nrAtt !== null) {
      ad.articulationDefName = nrAtt.getValue();
      if (ad.style !== null) ad.articulationDef = ad.style.getDef(ad.articulationDefName) ?? null;
    }

    // null = attribute absent, so the field keeps its default. Same twelve names and the
    // same shape as ArticulationDef.parseData, but reading through `parseFloat`
    // rather than `parseJavaDouble`: a def can be skipped by the factory above it, an
    // articulation entry cannot, so there is nowhere for a NumberFormatError to go. That
    // makes this one of the map-level reads PARITY.md's P1 entry names as still open.
    const numeric = (name: string): number | null => {
      const a = attribute(name, e);
      return a === null ? null : parseFloat(a.getValue());
    };

    ad.absoluteDuration = numeric('absoluteDuration') ?? ad.absoluteDuration;
    ad.absoluteDurationChange = numeric('absoluteDurationChange') ?? ad.absoluteDurationChange;
    ad.relativeDuration = numeric('relativeDuration') ?? ad.relativeDuration;
    ad.absoluteDurationMs = numeric('absoluteDurationMs') ?? ad.absoluteDurationMs;
    ad.absoluteDurationChangeMs =
      numeric('absoluteDurationChangeMs') ?? ad.absoluteDurationChangeMs;
    ad.absoluteVelocityChange = numeric('absoluteVelocityChange') ?? ad.absoluteVelocityChange;
    ad.absoluteVelocity = numeric('absoluteVelocity') ?? ad.absoluteVelocity;
    ad.relativeVelocity = numeric('relativeVelocity') ?? ad.relativeVelocity;
    ad.absoluteDelayMs = numeric('absoluteDelayMs') ?? ad.absoluteDelayMs;
    ad.absoluteDelay = numeric('absoluteDelay') ?? ad.absoluteDelay;
    ad.detuneCents = numeric('detuneCents') ?? ad.detuneCents;
    ad.detuneHz = numeric('detuneHz') ?? ad.detuneHz;

    return ad;
  }

  /**
   * Unlike the other maps' style lookup this also reads `defaultArticulation` off the
   * switch element, which is why it takes the element rather than just the name.
   */
  private findStyle(index: number, ad: ArticulationData): void {
    const s = this.findStyleSwitchAt(index);
    if (s === null) return;
    ad.styleName = getAttributeValue('name.ref', s);
    ad.style = this.getStyle('articulation', ad.styleName);
    const att = attribute('defaultArticulation', s);
    if (att !== null) {
      ad.defaultArticulation = att.getValue();
      if (ad.style !== null)
        ad.defaultArticulationDef = ad.style.getDef(ad.defaultArticulation) ?? null;
    }
  }

  /**
   * Pass one of two: apply every tick-domain articulation to `map`, and park the
   * millisecond ones for later (see the class doc).
   *
   * Built in three stages. First the explicit articulations are indexed by the note
   * element they target, since one note can collect several. Then the style switches are
   * resolved into a date-ordered list of default articulation defs. Finally the map is
   * walked once: a note with explicit articulations gets those and *only* those — the
   * default is deliberately not also applied — and every other note gets whichever
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

    // make a hashmap (note element, articulation data list) for all notes with a specific (i.e. non-default) articulation
    const noteArtics = new Map<Element, ArticulationData[]>();
    let mapTimingChanged = false;

    for (let articIndex = 0; articIndex < this.size(); ++articIndex) {
      const ad = this.getArticulationDataOf(articIndex);
      if (ad === null) continue;

      if (ad.noteid !== null) {
        const index = map.getElementIndexByID(ad.noteid);
        if (index < 0) continue;
        // One lookup where there were three. `getAllElements()` hands back the map's own
        // array, so the three reads always named the same entry.
        const referee = map.getAllElements()[index];
        if (referee.getKey() !== ad.date)
          console.error(
            // `this.elements[articIndex]` and not `ad.xml!`: `getArticulationDataOf` sets
            // `xml` from exactly this entry (`resolveEntryIndex` returns its argument
            // unchanged for an in-range index, and the loop bound guarantees one), so the
            // two are the same Element — but only one of them is typed `Element | null`.
            // The field stays nullable for the write half, where
            // `addArticulationFromData` is handed a datum that has no element yet.
            `Warning: articulation date and referee date do not match!\n    ${this.elements[articIndex].getValue().toXML()}\n    ${referee.getValue().toXML()}`,
          );
        const note = referee.getValue();
        let adList = noteArtics.get(note);
        if (adList === undefined) {
          adList = [];
          noteArtics.set(note, adList);
        }
        adList.push(ad);
        continue;
      }

      // if no noteid is specified, the articulation is potentially relevant to all map elements at the same date
      const elements = map.getAllElementsAt(ad.date);
      for (const element of elements) {
        if (element.getValue().getLocalName() !== 'note') continue;
        let adList = noteArtics.get(element.getValue());
        if (adList === undefined) {
          adList = [];
          noteArtics.set(element.getValue(), adList);
        }
        adList.push(ad);
      }
    }

    // create a list of styles/switches
    const defaultArticulations: KeyValue<number, ArticulationDef | null>[] = [];
    const styleSwitchList = this.getAllElementsOfType('style');
    for (const styleEntry of styleSwitchList) {
      const aStyle = this.getStyle(
        'articulation',
        getAttributeValue('name.ref', styleEntry.getValue()),
      );
      if (aStyle === null) continue;

      const defaultArticulationAtt = attribute('defaultArticulation', styleEntry.getValue());
      if (defaultArticulationAtt === null) {
        defaultArticulations.push(
          new KeyValue<number, ArticulationDef | null>(styleEntry.getKey(), null),
        );
        continue;
      }

      const aDef = aStyle.getDef(defaultArticulationAtt.getValue()) ?? null;
      if (aDef === null)
        console.error(
          // The attribute node is the one already in hand; the incumbent looked it up a
          // second time and asserted the result non-null, which is the same node.
          `Warning: attribute ${defaultArticulationAtt.toXML()} in style element refers to an unknown articulationDef.`,
        );
      defaultArticulations.push(
        new KeyValue<number, ArticulationDef | null>(styleEntry.getKey(), aDef),
      );
    }

    // articulate the map elements
    let defaultArticulationIndex = 0;
    for (let mapIndex = 0; mapIndex < map.size(); ++mapIndex) {
      const mapEntry = map.elements[mapIndex];
      if (mapEntry.getValue().getLocalName() !== 'note') continue;

      const artics = noteArtics.get(mapEntry.getValue());
      if (artics !== undefined) {
        for (const artic of artics) {
          mapTimingChanged = artic.articulateNote(mapEntry.getValue()) || mapTimingChanged;
        }
        continue;
      }

      // otherwise apply the default articulation
      if (defaultArticulations.length === 0) continue;

      // make sure we use the latest default articulation
      while (
        defaultArticulationIndex + 1 < defaultArticulations.length &&
        defaultArticulations[defaultArticulationIndex + 1].getKey() <= mapEntry.getKey()
      )
        defaultArticulationIndex++;

      const defaultArticulationDef = defaultArticulations[defaultArticulationIndex].getValue();
      if (defaultArticulationDef === null) continue;

      mapTimingChanged =
        defaultArticulationDef.articulateNote(mapEntry.getValue()) || mapTimingChanged;
    }

    // correct map order due to timing changes
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
   * serialized output. The guard at the end is what keeps the result playable: the new
   * values are committed **only** if the note still ends after it starts. A millisecond
   * modifier that would invert or zero a note's duration is dropped wholesale — start
   * and end both keep their old values rather than half the change landing.
   */
  renderArticulationToMap_millisecondModifiers(map: GenericMap | null): void {
    if (map === null) return;
    for (const entry of map.elements) {
      const dateAtt = attribute('milliseconds.date', entry.getValue());
      if (dateAtt === null) continue;
      const date = parseFloat(dateAtt.getValue());
      let dateNew = date;
      const endAtt = attribute('milliseconds.date.end', entry.getValue());
      let endNew = endAtt !== null ? parseFloat(endAtt.getValue()) : null;
      const absoluteDelayMs = attribute('articulation.absoluteDelayMs', entry.getValue());
      if (absoluteDelayMs !== null) {
        dateNew += parseFloat(absoluteDelayMs.getValue());
        entry.getValue().removeAttribute(absoluteDelayMs);
      }
      const absoluteDurationMs = attribute('articulation.absoluteDurationMs', entry.getValue());
      if (absoluteDurationMs !== null) {
        if (endNew !== null) endNew = dateNew + parseFloat(absoluteDurationMs.getValue());
        entry.getValue().removeAttribute(absoluteDurationMs);
      }
      const absoluteDurationChangeMs = attribute(
        'articulation.absoluteDurationChangeMs',
        entry.getValue(),
      );
      if (absoluteDurationChangeMs !== null) {
        if (endNew !== null) endNew += parseFloat(absoluteDurationChangeMs.getValue());
        entry.getValue().removeAttribute(absoluteDurationChangeMs);
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
