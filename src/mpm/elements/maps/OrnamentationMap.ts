import { Attribute, Element } from '../../../xml/XomTypes.js';
import { attribute, firstChildElement, getAttributeValue } from '../../../xml/tree.js';
import { MPM_NAMESPACE, ORNAMENTATION_STYLE } from '../../names.js';
import { KeyValue } from '../../../supplementary/KeyValue.js';
import { GenericMap } from './GenericMap.js';
import { OrnamentData } from './data/OrnamentData.js';
import { OrnamentationStyle } from '../styles/OrnamentationStyle.js';

/**
 * An MPM `ornamentationMap`: trills, arpeggios, mordents — ornaments that reshape the
 * dynamics and timing of the notes they touch.
 *
 * Rendering happens in **three** passes spread across the pipeline, and the split is
 * forced by when the information exists:
 *
 * 1. {@link apply} runs the ornament definitions over the notes. It does not write
 *    performance attributes directly; it writes `ornament.*` markers onto the notes.
 * 2. {@link renderAllNonmillisecondsModifiersToMap} folds the tick-domain markers
 *    (`ornament.dynamics`, `ornament.date.offset`, `ornament.duration`) into `velocity`,
 *    `date.perf`, `duration.perf` and `date.end.perf` — before the tempo map runs.
 * 3. {@link renderMillisecondsModifiersToMap} folds the millisecond-domain markers into
 *    `milliseconds.date` and `milliseconds.date.end` — after it has.
 *
 * `ornament.noteoff.shift` decides, in passes 2 and 3 alike, whether a shifted onset
 * drags the note's end with it (duration preserved) or not (duration absorbs the shift).
 * The attribute is written only when true, so its mere presence is the flag.
 *
 * PARITY WARNING — passes 2 and 3 were reconstructed against the Java reference
 * (OrnamentationMap.java:477-509 for the millisecond one) and every line of their
 * arithmetic is load-bearing. Treat them as frozen.
 *
 * Port of meico.mpm.elements.maps.OrnamentationMap
 */
export class OrnamentationMap extends GenericMap {
  private constructor(typeOrXml: string | Element) {
    super(typeOrXml);
  }

  static createOrnamentationMap(xml?: Element): OrnamentationMap | null {
    try {
      return xml !== undefined
        ? new OrnamentationMap(xml)
        : new OrnamentationMap('ornamentationMap');
    } catch (e) {
      console.error(e);
      return null;
    }
  }

  addOrnament(
    date: number,
    nameRef: string,
    scale = 1.0,
    noteOrder: string[] | null = null,
    id: string | null = null,
  ): number {
    const ornament = new Element('ornament', MPM_NAMESPACE);
    ornament.addAttribute(new Attribute('date', String(date)));
    ornament.addAttribute(new Attribute('name.ref', nameRef));
    if (scale !== 1.0) ornament.addAttribute(new Attribute('scale', String(scale)));
    if (noteOrder !== null && noteOrder.length > 0) {
      let noteIdsString = '';
      for (const nid of noteOrder) {
        if (nid === 'ascending pitch' || nid === 'descending pitch') {
          noteIdsString = nid;
          break;
        } else noteIdsString += ` #${nid.trim().replace('#', '')}`;
      }
      ornament.addAttribute(new Attribute('note.order', noteIdsString.trim()));
    }
    if (id !== null && id !== '')
      ornament.addAttribute(new Attribute('xml:id', 'http://www.w3.org/XML/1998/namespace', id));
    return this.insertElement(new KeyValue(date, ornament), false);
  }

  addOrnamentFromData(data: OrnamentData): number {
    if (data.ornamentDef !== null) data.ornamentDefName = data.ornamentDef.getName();
    else if (data.ornamentDefName === null) {
      console.error('Cannot add ornament.');
      return -1;
    }
    return this.addOrnament(
      data.date,
      data.ornamentDefName!,
      data.scale,
      data.noteOrder,
      data.xmlId,
    );
  }

  /**
   * Read the ornament at `index` into an {@link OrnamentData}, or null if the entry is
   * not a resolvable `<ornament>` — it needs a `name.ref`, a style in scope, and a def
   * that the style knows.
   *
   * Note that this is *not* what {@link apply} uses; apply reads the same data inline so
   * that it can carry the style forward across entries. This accessor exists for callers
   * outside the rendering path.
   */
  getOrnamentDataOf(index: number): OrnamentData | null {
    if (this.elements.length === 0 || index < 0) return null;
    if (index >= this.elements.length) index = this.elements.length - 1;
    const xml = this.elements[index].getValue();
    if (xml.getLocalName() !== 'ornament') return null;
    const od = new OrnamentData();
    const nameRefAtt = attribute('name.ref', xml);
    if (nameRefAtt === null) return null;
    od.ornamentDefName = nameRefAtt.getValue();
    od.styleName = '';
    for (let j = index; j >= 0; --j) {
      const s = this.elements[j].getValue();
      if (s.getLocalName() === 'style') {
        od.styleName = getAttributeValue('name.ref', s);
        break;
      }
    }
    od.style = this.getStyle(ORNAMENTATION_STYLE, od.styleName) as OrnamentationStyle | null;
    if (od.style === null) return null;
    od.ornamentDef = od.style.getDef(od.ornamentDefName) ?? null;
    if (od.ornamentDef === null) return null;
    od.date = this.elements[index].getKey();
    od.xml = xml;
    const noteOrderAtt = xml.getAttribute('note.order');
    if (noteOrderAtt !== null) {
      const no = noteOrderAtt.getValue().trim();
      if (no === 'ascending pitch' || no === 'descending pitch') od.noteOrder = [no];
      else od.noteOrder = no.replace(/#/g, '').split(/\s+/);
    }
    const scaleAtt = attribute('scale', xml);
    if (scaleAtt !== null) od.scale = parseFloat(scaleAtt.getValue());
    const idAtt = attribute('id', xml);
    if (idAtt !== null) od.xmlId = idAtt.getValue();
    return od;
  }

  /**
   * Apply a *global* ornamentation map to every part's score.
   *
   * A global ornament may reach across parts — that is the point of it — so all the
   * parts' score maps are collected first and handed to {@link apply} together, letting
   * one ornament's `note.order` name notes in several parts at once.
   */
  static renderGlobalOrnamentationToParts(
    parts: Element[],
    ornamentationMap: OrnamentationMap | null,
  ): void {
    if (ornamentationMap === null || ornamentationMap.isEmpty()) return;
    const mapsToOrnament: GenericMap[] = [];
    for (const part of parts) {
      const s = firstChildElement('dated', part);
      if (s !== null) {
        const score = firstChildElement('score', s);
        if (score !== null) {
          const m = GenericMap.createGenericMap(score);
          if (m !== null) mapsToOrnament.push(m);
        }
      }
    }
    ornamentationMap.renderGlobalOrnamentationMap(mapsToOrnament);
  }

  renderGlobalOrnamentationMap(maps: GenericMap[]): void {
    if (maps.length === 0) return;
    this.apply(maps);
  }
  static renderOrnamentationToMap(
    map: GenericMap | null,
    ornamentationMap: OrnamentationMap | null,
  ): void {
    if (ornamentationMap !== null) ornamentationMap.renderOrnamentationToMap(map);
  }

  renderOrnamentationToMap(map: GenericMap | null): void {
    if (map === null) return;
    if (this.getLocalHeader() !== null) {
      this.apply([map]);
    }
    this.renderAllNonmillisecondsModifiersToMap(map);
  }

  /**
   * Pass one: run each ornament over the notes it targets, writing `ornament.*` markers.
   *
   * All notes across all `maps` are indexed by ID up front, because an ornament may name
   * notes in a different part than the one it lives in (that is what the global
   * ornamentation map is for).
   *
   * The style is tracked *while walking* rather than looked up per entry: a `<style>`
   * entry rebinds `style` for everything after it, and ornaments before the first style
   * switch are skipped entirely, since an ornament with no style cannot resolve its def.
   *
   * How the target notes are chosen has two branches. An explicit ID list in
   * `note.order` names the notes and fixes their order. Otherwise every note at the
   * ornament's date is collected and sorted by pitch, ascending or descending per
   * `note.order`; `Math.sign(pitch1 - pitch2) * finalNoteOrderAscending` is the
   * comparator, with the direction captured in a const because the sort callback closes
   * over it.
   *
   * The `for (const chord of od.apply(...))` loop is currently dead — `apply` always
   * returns an empty list. See {@link OrnamentData.apply}; it is a contract for
   * note-generating ornaments, not an oversight.
   */
  private apply(maps: GenericMap[]): void {
    if (maps.length === 0) return;

    if (this.getLocalHeader() === null && this.getGlobalHeader() === null) {
      console.error(
        'Error processing MPM ornamentationMap: no header defined to look up ornamentationStyle.',
      );
      return;
    }

    // create a hashmap of all note elements, hashed by their ID, so we have quick access to them later on
    const notes = new Map<string, Element>();
    for (const map of maps) {
      for (const note of map.getAllElementsOfType('note')) {
        const id = attribute('id', note.getValue());
        if (id !== null) notes.set(id.getValue(), note.getValue());
      }
    }

    let style: OrnamentationStyle | null = null;

    // process each ornament entry in this ornamentationMap
    for (let i = 0; i < this.size(); ++i) {
      const ornamentXml = this.getElement(i);
      if (ornamentXml === null) continue;

      // get the lookup style for subsequent ornaments
      if (ornamentXml.getLocalName() === 'style') {
        if (this.getLocalHeader() !== null)
          style = this.getLocalHeader()!.getStyleDef(
            ORNAMENTATION_STYLE,
            getAttributeValue('name.ref', ornamentXml),
          ) as OrnamentationStyle | null;
        if (style === null && this.getGlobalHeader() !== null)
          style = this.getGlobalHeader()!.getStyleDef(
            ORNAMENTATION_STYLE,
            getAttributeValue('name.ref', ornamentXml),
          ) as OrnamentationStyle | null;
        continue;
      }

      if (style === null || ornamentXml.getLocalName() !== 'ornament') continue;

      // read all data into an OrnamentData instance
      const od = new OrnamentData();
      od.style = style;

      const ornamentDefAtt = attribute('name.ref', ornamentXml);
      if (ornamentDefAtt === null) continue;
      od.ornamentDefName = ornamentDefAtt.getValue();
      od.ornamentDef = od.style.getDef(od.ornamentDefName) ?? null;
      if (od.ornamentDef === null) continue;

      od.date = this.elements[i].getKey();

      const scaleAtt = attribute('scale', ornamentXml);
      if (scaleAtt !== null) od.scale = parseFloat(scaleAtt.getValue());

      // determine the note order and collect the notes which the ornament will be applied to
      let noteOrderAscending = 1; // 1 = ascending pitch, -1 = descending pitch, 0 = ID sequence
      let chordSequence: Element[][] | null = null;
      const noteOrderAtt = ornamentXml.getAttribute('note.order');
      if (noteOrderAtt !== null) {
        const no = noteOrderAtt.getValue().trim();
        switch (no) {
          case 'ascending pitch':
            break;
          case 'descending pitch':
            noteOrderAscending = -1;
            break;
          default: {
            od.noteOrder = no.replace(/#/g, '').split(/\s+/);
            if (od.noteOrder.length === 0) continue;
            chordSequence = [];
            noteOrderAscending = 0;
            for (const ref of od.noteOrder) {
              const note = notes.get(ref);
              if (note !== undefined) {
                chordSequence.push([note]);
              }
            }
            break;
          }
        }
      }
      if (chordSequence === null) {
        chordSequence = [];
        for (const map of maps) {
          const notesAtDate = map.getAllElementsAt(od.date);
          for (const note of notesAtDate) {
            if (note.getValue().getLocalName() === 'note') {
              chordSequence.push([note.getValue()]);
            }
          }
        }
        if (chordSequence.length === 0) continue;

        // sort the chords in the indicated order on the basis of the chord's first note's pitch
        const finalNoteOrderAscending = noteOrderAscending;
        chordSequence.sort((n1, n2) => {
          const pitch1 = parseFloat(getAttributeValue('midi.pitch', n1[0]));
          const pitch2 = parseFloat(getAttributeValue('midi.pitch', n2[0]));
          return Math.sign(pitch1 - pitch2) * finalNoteOrderAscending;
        });
      }

      // apply the ornament to the notes
      for (const chord of od.apply(chordSequence)) {
        for (const note of chord) {
          maps[0].addElement(note);
        }
      }
    }
  }

  /**
   * Pass two: fold the tick-domain `ornament.*` markers into the real performance
   * attributes. Runs before the tempo map.
   *
   * `ornament.dynamics` is *added* to the existing velocity, not substituted for it, so
   * an ornament layers on top of whatever the dynamics map decided.
   *
   * The date branch is the delicate one. `datePerf` and `ornamentDateOffset` are both
   * read before anything is written, and every subsequent expression uses those saved
   * values rather than re-reading the attribute that has meanwhile been updated. An
   * absolute `ornament.duration` wins outright and sets both duration and end date; with
   * no absolute duration, `ornament.noteoff.shift` decides which of the end date and the
   * duration absorbs the onset shift.
   *
   * FROZEN — mirrors the Java reference line for line. Do not reorder the reads, do not
   * regroup `datePerf + ornamentDateOffset + parseFloat(...)`, do not hoist the repeated
   * `parseFloat` calls: each one re-reads an attribute that may have been rewritten, and
   * that is deliberate.
   */
  private renderAllNonmillisecondsModifiersToMap(map: GenericMap): void {
    for (const e of map.getAllElementsOfType('note')) {
      const note = e.getValue();
      const ornamentDynamics = attribute('ornament.dynamics', note);
      if (ornamentDynamics !== null) {
        const velocity = attribute('velocity', note);
        if (velocity !== null)
          velocity.setValue(
            String(parseFloat(velocity.getValue()) + parseFloat(ornamentDynamics.getValue())),
          );
      }
      const ornamentDateOffsetAtt = attribute('ornament.date.offset', note);
      if (ornamentDateOffsetAtt !== null) {
        const datePerfAtt = attribute('date.perf', note);
        if (datePerfAtt !== null) {
          const datePerf = parseFloat(datePerfAtt.getValue());
          const ornamentDateOffset = parseFloat(ornamentDateOffsetAtt.getValue());
          datePerfAtt.setValue(String(datePerf + ornamentDateOffset));

          const dateEndPerfAtt = attribute('date.end.perf', note);
          const durationPerfAtt = attribute('duration.perf', note);

          const ornamentDurationAtt = attribute('ornament.duration', note); // does the ornament set an absolute note duration?
          if (ornamentDurationAtt !== null) {
            // apply it to duration.perf and date.end.perf
            if (durationPerfAtt !== null) durationPerfAtt.setValue(ornamentDurationAtt.getValue());
            else note.addAttribute(new Attribute('duration.perf', ornamentDurationAtt.getValue()));

            const dateEndPerf = String(
              datePerf + ornamentDateOffset + parseFloat(ornamentDurationAtt.getValue()),
            );
            if (dateEndPerfAtt !== null) dateEndPerfAtt.setValue(dateEndPerf);
            else note.addAttribute(new Attribute('date.end.perf', dateEndPerf));
          } else {
            // act according to noteoff.shift
            const ornamentNoteoffShiftAtt = attribute('ornament.noteoff.shift', note);
            if (ornamentNoteoffShiftAtt !== null) {
              // this attribute is only created when its value is "true", so we need to update date.end.perf; thus, duration stays the same
              if (dateEndPerfAtt !== null)
                dateEndPerfAtt.setValue(
                  String(parseFloat(dateEndPerfAtt.getValue()) + ornamentDateOffset),
                );
            } else {
              // ornament.noteoff.shift="false", so we need to update duration.perf; thus, date.end.perf stays the same
              if (durationPerfAtt !== null)
                durationPerfAtt.setValue(
                  String(parseFloat(durationPerfAtt.getValue()) - ornamentDateOffset),
                );
            }
          }
        }
      }
    }
  }

  /**
   * Pass three: fold the millisecond-domain `ornament.*` markers into
   * `milliseconds.date` and `milliseconds.date.end`. Runs after the tempo map, which is
   * what makes those attributes exist.
   *
   * A note without `milliseconds.date` is skipped outright — it is the reference point
   * every transformation here is relative to, so there is nothing to compute without it.
   *
   * `millisecondsDate` is captured **before** the attribute is overwritten, and the
   * absolute-duration branch then computes the end as
   * `millisecondsDate + ornamentMillisecondsDateOffset + duration` from those saved
   * values — not from the attribute it has just rewritten. `ornamentMillisecondsDateOffset`
   * stays 0.0 when no offset marker is present, so the same expression serves both cases.
   * With no absolute duration, `ornament.noteoff.shift` again decides: present (meaning
   * true) shifts the end by the same offset and preserves the duration; absent leaves the
   * end alone so the duration absorbs the shift.
   *
   * FROZEN — this mirrors OrnamentationMap.java:477-509 statement for statement and was
   * a hard-won parity fix. Every addition's operand order is load-bearing. Do not
   * refactor, do not extract the repeated sub-expression, do not reorder the attribute
   * lookups.
   */
  static renderMillisecondsModifiersToMap(
    map: GenericMap | null,
    ornamentationMap: OrnamentationMap | null,
  ): void {
    if (ornamentationMap === null || map === null) return;
    for (const e of map.getAllElementsOfType('note')) {
      const note = e.getValue();
      const millisecondsDateAtt = attribute('milliseconds.date', note);
      if (millisecondsDateAtt === null) continue;
      const millisecondsDate = parseFloat(millisecondsDateAtt.getValue());
      const ornamentMillisecondsDateAtt = attribute('ornament.milliseconds.date.offset', note);
      let ornamentMillisecondsDateOffset = 0.0;
      if (ornamentMillisecondsDateAtt !== null) {
        ornamentMillisecondsDateOffset = parseFloat(ornamentMillisecondsDateAtt.getValue());
        millisecondsDateAtt.setValue(String(millisecondsDate + ornamentMillisecondsDateOffset));
      }

      const millisecondsDateEndAtt = attribute('milliseconds.date.end', note);
      const ornamentMillisecondsDurationAtt = attribute('ornament.milliseconds.duration', note); // does the ornament set an absolute duration?
      if (ornamentMillisecondsDurationAtt !== null) {
        // apply it to milliseconds.date.end
        const millisecondsDateEnd = String(
          millisecondsDate +
            ornamentMillisecondsDateOffset +
            parseFloat(ornamentMillisecondsDurationAtt.getValue()),
        );
        if (millisecondsDateEndAtt !== null) millisecondsDateEndAtt.setValue(millisecondsDateEnd);
        else note.addAttribute(new Attribute('milliseconds.date.end', millisecondsDateEnd));
      } else {
        // act according to noteoff.shift
        const ornamentNoteoffShiftAtt = attribute('ornament.noteoff.shift', note);
        if (ornamentNoteoffShiftAtt !== null) {
          // this attribute is only created when its value is "true", so we need to update milliseconds.date.end; thus, the duration stays the same
          if (millisecondsDateEndAtt !== null)
            millisecondsDateEndAtt.setValue(
              String(
                parseFloat(millisecondsDateEndAtt.getValue()) + ornamentMillisecondsDateOffset,
              ),
            );
        } // else, ornament.noteoff.shift="false", so milliseconds.date.end remains unaltered
      }
    }
  }
}

GenericMap.registerMapFactory('ornamentationMap', (xml) =>
  OrnamentationMap.createOrnamentationMap(xml),
);
