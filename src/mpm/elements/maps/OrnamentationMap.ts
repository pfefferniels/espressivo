import { Attribute, Element } from '../../../xml/XomTypes.js';
import { attribute, firstChildElement, getAttributeValue } from '../../../xml/tree.js';
import { MPM_NAMESPACE, ORNAMENTATION_STYLE } from '../../names.js';
import { DEFAULT_EXPAND_ORNAMENTS } from '../../RenderOptions.js';
import type { RenderContext } from '../../RenderOptions.js';
import { elementAt, isOk } from '../../../prelude/index.js';
import { GenericMap } from './GenericMap.js';
import { type Result } from '../../../prelude/index.js';
import { type MpmParseError } from '../parseError.js';
import { styleOfKind, type OrnamentationStyle } from '../styles/style.js';
import {
  applyOrnament,
  parseOrnamentNotePool,
  parseOrnamentRepetitions,
  NO_V3_ORNAMENT_FIELDS,
  type Ornament,
} from './data/ornament.js';
import {
  instantiateOrnaments,
  isV3Ornament,
  noteOwners,
  prepareOrnament,
} from './ornamentInstantiation.js';
import type { OrnamentNote } from './data/OrnamentNote.js';
import type { PreparedOrnament } from './ornamentInstantiation.js';

/**
 * Everything an MPM v3 `<ornament>` can say, for {@link OrnamentationMap.addOrnamentV3}
 * (RULE F5's named-parameter shape, applied inside the library).
 *
 * Optional properties are `?:` and never `null` (RULE N1): absence is "the caller did not
 * supply this", and each has a documented default.
 */
export interface AddOrnamentOptions {
  /** Symbolic date of the ornament, in ticks. */
  readonly date: number;
  /** `name.ref` — the `ornamentDef` in the style currently in scope. */
  readonly nameRef: string;
  /**
   * Scaling factor of the def's dynamics gradient. Defaults to `0.0`, the spec's default
   * (`ornament.xml:36-44`), which means "no dynamics effect" — and is always written, see
   * {@link OrnamentationMap.addOrnamentV3}.
   */
  readonly scale?: number;
  /**
   * `note.order`. A string is written verbatim, which is how the v3 grammar (chords
   * `[ … ]`, repeat groups `|: … :|`) gets in — build it with `formatNoteOrder` from
   * `noteOrder.ts`. An array is the v2 shape and is written exactly as
   * {@link OrnamentationMap.addOrnamentV2} writes it: `#`-prefixed ids, or a bare pitch
   * keyword.
   */
  readonly noteOrder?: string | readonly string[];
  /** `noteid` — the principal note, written exactly as given (DESIGN.md D7). */
  readonly noteid?: string;
  /** `repetitions`; written only when it differs from the default `0` (DESIGN.md D12). */
  readonly repetitions?: number;
  /** The note pool, written as `<note>` children in the given order. */
  readonly notes?: readonly OrnamentNote[];
  /** `xml:id` of the ornament element. */
  readonly id?: string;
}

/**
 * The `scale` default (`ornament.xml:36-44`). It is `0.0`, not `1.0`: an `<ornament>` without
 * a `scale` is specified to produce no dynamics effect at all, which reads as a bug and is
 * not one (research/java-ts-v2-ornamentation.md §2.4 — the MEI importer writes `scale="0.0"`
 * explicitly for exactly this reason).
 */
const DEFAULT_ORNAMENT_SCALE = 0.0;

/**
 * Build a `note.order` attribute value from a list of ids — the v2 spelling, `#`-prefixed and
 * space-separated, or one of the two pitch keywords, which win outright and end the list.
 *
 * FROZEN, and shared by the v2 and v3 writers so they cannot drift apart. The
 * `.replace('#', '')` strips only the FIRST `#`, a deviation from Java's
 * `String.replace(char,char)`; the `.trim()` on each id and on the result are both
 * load-bearing for the leading space the loop produces.
 */
function noteOrderAttributeValue(noteOrder: readonly string[]): string {
  let noteIdsString = '';
  for (const nid of noteOrder) {
    if (nid === 'ascending pitch' || nid === 'descending pitch') {
      noteIdsString = nid;
      break;
    } else noteIdsString += ` #${nid.trim().replace('#', '')}`;
  }
  return noteIdsString.trim();
}

/**
 * An MPM `ornamentationMap`: trills, arpeggios, mordents — ornaments that reshape the
 * dynamics and timing of the notes they touch.
 *
 * Rendering happens in three passes spread across the pipeline, and the split is forced by
 * when the information exists:
 *
 * 1. {@link apply} runs the ornament definitions over the notes. It does not write
 *    performance attributes directly; it writes `ornament.*` markers onto the notes.
 * 2. {@link renderAllNonmillisecondsModifiersToMap} folds the tick-domain markers
 *    (`ornament.dynamics`, `ornament.date.offset`, `ornament.duration`) into `velocity`,
 *    `date.perf`, `duration.perf` and `date.end.perf` — before the tempo map runs.
 * 3. {@link renderMillisecondsModifiersToMap} folds the millisecond-domain markers into
 *    `milliseconds.date` and `milliseconds.date.end` — after it has. Pass 3 is NOT the copy
 *    the pipeline runs; see that method's own note.
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
  private constructor(xml: Element) {
    super(xml);
  }

  /**
   * A fresh, empty `<ornamentationMap>`, or one read from an existing element. The empty form
   * is total, the parsing one is not; see {@link GenericMap.emptyMapElement}.
   */
  static createOrnamentationMap(): OrnamentationMap;
  static createOrnamentationMap(xml: Element): Result<OrnamentationMap, MpmParseError>;
  static createOrnamentationMap(
    xml?: Element | null,
  ): OrnamentationMap | Result<OrnamentationMap, MpmParseError> {
    return xml === undefined
      ? new OrnamentationMap(GenericMap.emptyMapElement('ornamentationMap'))
      : GenericMap.makeMap(xml, 'OrnamentationMap', (elt) => new OrnamentationMap(elt));
  }

  /**
   * Add an ornament entry in v2 form. BYTE-FROZEN against the Java fixtures — `date`,
   * `name.ref`, `scale` (only when it differs from `1.0`), `note.order`, `xml:id` (only when
   * non-empty), in that order.
   *
   * {@link addOrnamentV3} writes the other serialisation version. The two disagree on bytes
   * by design — see there for the two deliberate differences — so which one a call wants is
   * spelled at the call site.
   */
  addOrnamentV2(
    date: number,
    nameRef: string,
    scale = 1.0,
    noteOrder: readonly string[] | null = null,
    id: string | null = null,
  ): number {
    const ornament = new Element('ornament', MPM_NAMESPACE);
    ornament.addAttribute(new Attribute('date', String(date)));
    ornament.addAttribute(new Attribute('name.ref', nameRef));
    if (scale !== 1.0) ornament.addAttribute(new Attribute('scale', String(scale)));
    if (noteOrder !== null && noteOrder.length > 0)
      ornament.addAttribute(new Attribute('note.order', noteOrderAttributeValue(noteOrder)));
    if (id !== null && id !== '')
      ornament.addAttribute(new Attribute('xml:id', 'http://www.w3.org/XML/1998/namespace', id));
    return this.insertElement({ key: date, value: ornament }, false);
  }

  /**
   * The v3 writer (DESIGN.md D12): only a caller who asked for v3 gets it.
   *
   * Two deliberate differences from the v2 writer, both fixing a round-trip asymmetry rather
   * than following it:
   *
   * - `scale` is written **always**, and defaults to the spec's `0.0` instead of `1.0`. The
   *   v2 writer omits `scale` when it is `1.0` while every reader defaults a missing `scale`
   *   to `0.0` (`ornament.xml:36-44`), so writing `1.0` and reading it back yields `0.0` — a
   *   silently muted dynamics gradient. The reference implementation has the same bug
   *   (research/lars-v3-implementation.md §5 note 1); D12 diverges from it here.
   * - `repetitions` is written **only** when it differs from `0`, so a v3 ornament that does
   *   not repeat looks like one (the reference stamps `repetitions="0"` onto everything).
   *
   * Attribute order extends the v2 order rather than the spec exemplum's (`ornament.xml:66-72`
   * leads with `noteid`): `date` and `name.ref` stay in front so a v2 and a v3 ornament read
   * alike in a diff, and each new attribute sits next to the one it qualifies. Order is
   * byte-visible (CHARTER §79-80); no Java reference writes these attributes, so nothing
   * external binds the choice.
   */
  addOrnamentV3(options: AddOrnamentOptions): number {
    const ornament = new Element('ornament', MPM_NAMESPACE);
    ornament.addAttribute(new Attribute('date', String(options.date)));
    ornament.addAttribute(new Attribute('name.ref', options.nameRef));
    if (options.noteid !== undefined && options.noteid !== '')
      ornament.addAttribute(new Attribute('noteid', options.noteid));
    ornament.addAttribute(new Attribute('scale', String(options.scale ?? DEFAULT_ORNAMENT_SCALE)));

    const noteOrder = options.noteOrder;
    if (noteOrder !== undefined) {
      const value = typeof noteOrder === 'string' ? noteOrder : noteOrderAttributeValue(noteOrder);
      if (value !== '') ornament.addAttribute(new Attribute('note.order', value));
    }

    const repetitions = options.repetitions ?? 0;
    if (repetitions !== 0) ornament.addAttribute(new Attribute('repetitions', String(repetitions)));

    if (options.id !== undefined && options.id !== '')
      ornament.addAttribute(
        new Attribute('xml:id', 'http://www.w3.org/XML/1998/namespace', options.id),
      );

    for (const note of options.notes ?? []) ornament.appendChild(note.generateXML());

    return this.insertElement({ key: options.date, value: ornament }, false);
  }

  /**
   * Write an ornament in whichever serialisation version can carry it — {@link addOrnamentV2}
   * and {@link addOrnamentV3} are the two that say which outright.
   *
   * The v3 form is taken as soon as the ornament carries anything v3 can express and v2 cannot;
   * otherwise `getOrnamentDataOf` → this would silently drop the note pool, the repeat count
   * and the principal reference. An ornament with none of them takes the v2 call unchanged, so
   * nothing a v2 document round-trips through here moves.
   *
   * The resolved def wins over the declared name where both are present, which is what makes a
   * def substituted after the read reach the document.
   */
  addOrnament(ornament: Ornament): number {
    const nameRef = ornament.ornamentDef?.getName() ?? ornament.ornamentDefName;
    if (nameRef === null) {
      console.error('Cannot add ornament.');
      return -1;
    }
    if (ornament.notes.length > 0 || ornament.repetitions !== 0 || ornament.noteid !== null)
      return this.addOrnamentV3({
        date: ornament.date,
        nameRef,
        scale: ornament.scale,
        // the raw text when the ornament came from a document (it is the only lossless form of
        // a v3 note.order), the flat list when the record was built in code
        noteOrder: ornament.noteOrderText ?? ornament.noteOrder ?? undefined,
        noteid: ornament.noteid ?? undefined,
        repetitions: ornament.repetitions,
        notes: ornament.notes,
        id: ornament.xmlId ?? undefined,
      });
    return this.addOrnamentV2(
      ornament.date,
      nameRef,
      ornament.scale,
      ornament.noteOrder,
      ornament.xmlId,
    );
  }

  /**
   * Read the ornament at `index` into an {@link Ornament}, or null if the entry is not a
   * resolvable `<ornament>` — it needs a `name.ref`, a style in scope, and a def that the
   * style knows.
   *
   * Not what {@link apply} uses: apply reads the same data inline so that it can carry the
   * style forward across entries. This accessor is for callers outside the rendering path.
   */
  getOrnamentDataOf(index: number): Ornament | null {
    const i = this.resolveEntryIndex(index, 'ornament');
    if (i < 0) return null;
    const entry = this.entryAt(i);
    const xml = entry.value;

    const nameRefAtt = attribute('name.ref', xml);
    if (nameRefAtt === null) return null;
    const ornamentDefName = nameRefAtt.getValue();
    const style = this.getStyle('ornamentation', this.findStyleNameAt(i) ?? '');
    if (style === null) return null;
    const ornamentDef = style.getDef(ornamentDefName) ?? null;
    if (ornamentDef === null) return null;

    const scaleAtt = attribute('scale', xml);
    const idAtt = attribute('id', xml);
    return {
      xmlId: idAtt === null ? null : idAtt.getValue(),
      date: entry.key,
      scale: scaleAtt === null ? 0.0 : parseFloat(scaleAtt.getValue()),
      ornamentDefName,
      ornamentDef,
      noteOrder: OrnamentationMap.readNoteOrder(xml),
      ...OrnamentationMap.readV3OrnamentFields(xml),
    };
  }

  /**
   * `@note.order` as v2 reads it: the two magic strings kept whole in a one-element list,
   * anything else stripped of its `#` prefixes and split on whitespace.
   */
  private static readNoteOrder(xml: Element): readonly string[] | null {
    const noteOrderAtt = xml.getAttribute('note.order');
    if (noteOrderAtt === null) return null;
    const no = noteOrderAtt.getValue().trim();
    if (no === 'ascending pitch' || no === 'descending pitch') return [no];
    return no.replace(/#/g, '').split(/\s+/);
  }

  /**
   * Read the three MPM v3 additions of an `<ornament>`: the principal reference `noteid`, the
   * repeat count, and the note pool (DESIGN.md D7, D9, D1), plus `note.order` as written.
   *
   * Shared by {@link getOrnamentDataOf} and by the inline reader inside {@link apply}, which
   * exists so that pass one can carry the style forward across entries — the two must agree on
   * what an ornament says. For a v2 document every one of these is absent, so the result is
   * {@link NO_V3_ORNAMENT_FIELDS} and no v2 byte can move.
   */
  private static readV3OrnamentFields(
    xml: Element,
  ): Pick<Ornament, 'noteOrderText' | 'notes' | 'repetitions' | 'noteid'> {
    // `note.order` as written. The flat `noteOrder` cannot carry the v3 grammar — stripping
    // every `#` makes an id and a repeat mark indistinguishable — so a writer that has to
    // reproduce this ornament reads the text instead.
    const noteOrderAtt = xml.getAttribute('note.order');
    const noteidAtt = attribute('noteid', xml);
    const repetitionsAtt = attribute('repetitions', xml);
    return {
      noteOrderText: noteOrderAtt === null ? null : noteOrderAtt.getValue(),
      noteid: noteidAtt === null ? null : noteidAtt.getValue(),
      repetitions:
        repetitionsAtt === null
          ? NO_V3_ORNAMENT_FIELDS.repetitions
          : parseOrnamentRepetitions(repetitionsAtt.getValue()),
      notes: parseOrnamentNotePool(xml),
    };
  }

  /**
   * Apply a *global* ornamentation map to every part's score.
   *
   * A global ornament may reach across parts — that is the point of it — so all the
   * parts' score maps are collected first and handed to {@link apply} together, letting
   * one ornament's `note.order` name notes in several parts at once.
   *
   * @param ctx supplies {@link RenderOptions.expandOrnaments}; omitting it expands, which is
   *   what every fixture is generated with (see {@link apply})
   */
  static renderGlobalOrnamentationToParts(
    parts: Element[],
    ornamentationMap: OrnamentationMap | null,
    ctx?: RenderContext,
  ): void {
    if (ornamentationMap === null || ornamentationMap.isEmpty()) return;
    const mapsToOrnament: GenericMap[] = [];
    for (const part of parts) {
      const s = firstChildElement('dated', part);
      if (s !== null) {
        const score = firstChildElement('score', s);
        if (score !== null) {
          const m = GenericMap.createGenericMap(score);
          if (isOk(m)) mapsToOrnament.push(m.value);
        }
      }
    }
    ornamentationMap.renderGlobalOrnamentationMap(mapsToOrnament, ctx);
  }

  renderGlobalOrnamentationMap(maps: GenericMap[], ctx?: RenderContext): void {
    if (maps.length === 0) return;
    this.apply(maps, ctx);
  }
  static renderOrnamentationToMap(
    map: GenericMap | null,
    ornamentationMap: OrnamentationMap | null,
    ctx?: RenderContext,
  ): void {
    if (ornamentationMap !== null) ornamentationMap.renderOrnamentationToMap(map, ctx);
  }

  renderOrnamentationToMap(map: GenericMap | null, ctx?: RenderContext): void {
    if (map === null) return;
    if (this.getLocalHeader() !== null) {
      this.apply([map], ctx);
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
   * The target notes are chosen in one of two ways: an explicit ID list in `note.order` names
   * them and fixes their order, or every note at the ornament's date is collected and sorted
   * by pitch, ascending or descending per `note.order`.
   *
   * The `for (const chord of applyOrnament(...))` loop below is dead on this path — for a v2
   * ornament it always returns an empty list. See {@link applyOrnament}; it is a
   * contract for note-generating ornaments, and MPM v3 is what fills it.
   *
   * The v3 branch: an ornament that uses anything v2 cannot express (`isV3Ornament`, the
   * DESIGN.md D6 gate — a note pool, `noteid`, `repetitions`, or the `note.order` grouping
   * syntax) is *prepared* here and *instantiated* after the walk, so generated notes appear in
   * the map only once the walk is over and a later v2 ornament's "every note at this date"
   * still collects what it always collected. See `ornamentInstantiation.ts` for why the
   * deferral is required rather than tidy.
   *
   * `expandOrnaments` is read here, once per call, and is the only thing the option does: with
   * it off, an ornament that passes the v3 gate is dropped on the spot instead of being
   * prepared. The read sits inside this method because the default belongs to `src/mpm/`
   * (ARCHITECTURE.md §2.4).
   */
  private apply(maps: GenericMap[], ctx?: RenderContext): void {
    if (maps.length === 0) return;

    const expandOrnaments = ctx?.options.expandOrnaments ?? DEFAULT_EXPAND_ORNAMENTS;

    if (this.getLocalHeader() === null && this.getGlobalHeader() === null) {
      console.error(
        'Error processing MPM ornamentationMap: no header defined to look up ornamentationStyle.',
      );
      return;
    }

    // Every note of every map, by id — an ornament may name notes in another part.
    const notes = new Map<string, Element>();
    for (const map of maps) {
      for (const note of map.getAllElementsOfType('note')) {
        const id = attribute('id', note.value);
        if (id !== null) notes.set(id.getValue(), note.value);
      }
    }

    let style: OrnamentationStyle | null = null;
    const prepared: PreparedOrnament[] = [];
    // Built on first use, so that a document with no v3 ornament never walks the notes twice.
    let owners: ReadonlyMap<Element, GenericMap> | null = null;

    // `getAllElements()` hands back the live index by reference; nothing in the body adds to
    // or removes from *this* map — it writes into `maps`, which are the score's — so walking
    // the live array is safe here.
    for (const entry of this.getAllElements()) {
      const ornamentXml = entry.value;

      // The style for subsequent ornaments, and deliberately NOT `GenericMap.getStyle`, which
      // does the same two-header lookup: this one carries `style` over from the previous
      // `<style>` element, so with no local header at all the first branch does not run,
      // `style` keeps its old value, and the `style === null` guard then skips the global
      // lookup too. `getStyle` would reset it. That asymmetry is the reference's and it is
      // observable, so it stays put.
      if (ornamentXml.getLocalName() === 'style') {
        const nameRef = getAttributeValue('name.ref', ornamentXml);
        const localHeader = this.getLocalHeader();
        const globalHeader = this.getGlobalHeader();
        if (localHeader !== null)
          style = styleOfKind(
            localHeader.getStyleDef(ORNAMENTATION_STYLE, nameRef),
            'ornamentation',
          );
        if (style === null && globalHeader !== null)
          style = styleOfKind(
            globalHeader.getStyleDef(ORNAMENTATION_STYLE, nameRef),
            'ornamentation',
          );
        continue;
      }

      if (style === null || ornamentXml.getLocalName() !== 'ornament') continue;

      const ornamentDefAtt = attribute('name.ref', ornamentXml);
      if (ornamentDefAtt === null) continue;
      const ornamentDefName = ornamentDefAtt.getValue();
      const ornamentDef = style.getDef(ornamentDefName) ?? null;
      if (ornamentDef === null) continue;

      const scaleAtt = attribute('scale', ornamentXml);
      const idAtt = attribute('id', ornamentXml);
      const noteOrder = OrnamentationMap.readNoteOrder(ornamentXml);
      const od: Ornament = {
        xmlId: idAtt === null ? null : idAtt.getValue(),
        date: entry.key,
        scale: scaleAtt === null ? 0.0 : parseFloat(scaleAtt.getValue()),
        ornamentDefName,
        ornamentDef,
        noteOrder,
        ...OrnamentationMap.readV3OrnamentFields(ornamentXml),
      };

      // MPM v3 (DESIGN.md D6): an ornament that generates notes leaves the v2 path here. It is
      // only read now — its notes are created after the walk, see this method's comment.
      if (isV3Ornament(ornamentXml, od)) {
        // `expandOrnaments: false` stops here, before `prepareOrnament` — which reads the
        // ornament but also writes `note.order.perf` back onto it (D7). Skipping the whole
        // call is what makes "not expanded" mean the document is left as it was found.
        if (!expandOrnaments) continue;
        owners ??= noteOwners(maps);
        const one = prepareOrnament(od, ornamentXml, notes, owners);
        if (one !== null) prepared.push(one);
        continue;
      }
      if (ornamentDef.getSourceFormat() === 'v3')
        console.error(
          `Warning: the ornament at date ${od.date} names an MPM v3 ornamentDef but uses no v3 feature itself, so it is rendered as a v2 ornament — and a v3 temporalSpread carries no v2 frame, so it will spread nothing. Give the ornament a note pool, a noteid or a v3 note.order.`,
        );

      let noteOrderAscending = 1; // 1 = ascending pitch, -1 = descending pitch, 0 = ID sequence
      let chordSequence: Element[][] | null = null;
      const noteOrderAtt = ornamentXml.getAttribute('note.order');
      if (noteOrderAtt !== null) {
        switch (noteOrderAtt.getValue().trim()) {
          case 'ascending pitch':
            break;
          case 'descending pitch':
            noteOrderAscending = -1;
            break;
          default: {
            if (noteOrder === null || noteOrder.length === 0) continue;
            chordSequence = [];
            noteOrderAscending = 0;
            for (const ref of noteOrder) {
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
            if (note.value.getLocalName() === 'note') {
              chordSequence.push([note.value]);
            }
          }
        }
        if (chordSequence.length === 0) continue;

        const finalNoteOrderAscending = noteOrderAscending;
        chordSequence.sort((n1, n2) => {
          const pitch1 = parseFloat(getAttributeValue('midi.pitch', elementAt(n1, 0, 'chord')));
          const pitch2 = parseFloat(getAttributeValue('midi.pitch', elementAt(n2, 0, 'chord')));
          return Math.sign(pitch1 - pitch2) * finalNoteOrderAscending;
        });
      }

      // Generated notes go into the FIRST map, whatever part the principals came from —
      // the reference's choice, kept. Reaching here at all means `chordSequence` was not
      // empty, and every way of filling it reads from `maps`, so there is one.
      const primary = elementAt(maps, 0, 'ornamentation target');
      for (const chord of applyOrnament(od, chordSequence)) {
        for (const note of chord) {
          primary.addElement(note);
        }
      }
    }

    // MPM v3: every note-generating ornament, laid out and instantiated now that the walk has
    // seen all of them (DESIGN.md D11 needs a principal's ornaments together). Nothing here
    // runs for a document without a v3 ornament.
    if (owners !== null) instantiateOrnaments(prepared, owners, maps);
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
      const note = e.value;
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

          const ornamentDurationAtt = attribute('ornament.duration', note);
          if (ornamentDurationAtt !== null) {
            if (durationPerfAtt !== null) durationPerfAtt.setValue(ornamentDurationAtt.getValue());
            else note.addAttribute(new Attribute('duration.perf', ornamentDurationAtt.getValue()));

            const dateEndPerf = String(
              datePerf + ornamentDateOffset + parseFloat(ornamentDurationAtt.getValue()),
            );
            if (dateEndPerfAtt !== null) dateEndPerfAtt.setValue(dateEndPerf);
            else note.addAttribute(new Attribute('date.end.perf', dateEndPerf));
          } else {
            // The attribute exists only when it is "true": present shifts `date.end.perf` and
            // preserves the duration, absent leaves the end and lets the duration absorb it.
            const ornamentNoteoffShiftAtt = attribute('ornament.noteoff.shift', note);
            if (ornamentNoteoffShiftAtt !== null) {
              if (dateEndPerfAtt !== null)
                dateEndPerfAtt.setValue(
                  String(parseFloat(dateEndPerfAtt.getValue()) + ornamentDateOffset),
                );
            } else {
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
   * MPM v3 adds exactly one branch, `ornament.milliseconds.fromend.offset` (DESIGN.md's D5
   * amendment): a frame aligned `at end` in the millisecond domain is anchored at a note's
   * millisecond END, which the symbolic phase cannot compute, so it is expressed as a static
   * offset from that end and resolved back into an ordinary onset shift here. Everything after
   * it is v2, unchanged, and reads the resolved shift. That branch is character-identical to
   * the copy in `Performance.ts`, which `tests/mpm/elements/OrnamentationMap.test.ts` pins.
   *
   * `millisecondsDate` is captured BEFORE the attribute is overwritten, and the
   * absolute-duration branch computes the end as
   * `millisecondsDate + ornamentMillisecondsDateOffset + duration` from those saved values,
   * not from the attribute it has just rewritten. `ornamentMillisecondsDateOffset` stays 0.0
   * when no offset marker is present, so the same expression serves both cases. With no
   * absolute duration, `ornament.noteoff.shift` again decides: present (meaning true) shifts
   * the end and preserves the duration; absent leaves the end alone so the duration absorbs
   * the shift.
   *
   * FROZEN — mirrors OrnamentationMap.java:477-509 statement for statement. Every addition's
   * operand order is load-bearing. Do not refactor, do not extract the repeated
   * sub-expression, do not reorder the attribute lookups.
   *
   * ⚠ NO FIXTURE REACHES THIS METHOD, and no test does either. `Performance.perform` calls its
   * own private copy (`Performance.ts`, `private static renderMillisecondsModifiersToMap`),
   * which exists because that file type-imports the map classes and so cannot call their
   * statics. The two bodies are character-identical today and nothing enforces that; the suite
   * cannot catch a drift between them, because it never runs this one. Kept deliberately by
   * ARCHITECTURE.md §8.10: it is the Java-parity code path, and deleting it would make a
   * future comparison against OrnamentationMap.java harder than keeping a second copy is.
   * Collapsing the two has been declined — do not reopen it without the evidence named in
   * `Performance.ts`'s class comment.
   */
  static renderMillisecondsModifiersToMap(
    map: GenericMap | null,
    ornamentationMap: OrnamentationMap | null,
  ): void {
    if (ornamentationMap === null || map === null) return;
    for (const e of map.getAllElementsOfType('note')) {
      const note = e.value;
      const millisecondsDateAtt = attribute('milliseconds.date', note);
      if (millisecondsDateAtt === null) continue;
      const millisecondsDate = parseFloat(millisecondsDateAtt.getValue());
      const ornamentMillisecondsDateAtt = attribute('ornament.milliseconds.date.offset', note);
      let ornamentMillisecondsDateOffset = 0.0;
      if (ornamentMillisecondsDateAtt !== null) {
        ornamentMillisecondsDateOffset = parseFloat(ornamentMillisecondsDateAtt.getValue());
        millisecondsDateAtt.setValue(String(millisecondsDate + ornamentMillisecondsDateOffset));
      }

      // MPM v3 (DESIGN.md D5 amendment): a millisecond frame aligned "at end" is anchored at
      // this note's millisecond END, which the symbolic phase cannot know, so it writes an
      // end-anchored marker instead of an onset offset. Resolving it into
      // ornamentMillisecondsDateOffset keeps the rest of this method v2. The end is read
      // BEFORE anything writes to it; a note without one cannot be placed from its end at all.
      const ornamentMillisecondsFromEndAtt = attribute(
        'ornament.milliseconds.fromend.offset',
        note,
      );
      if (ornamentMillisecondsFromEndAtt !== null) {
        const millisecondsDateEndBeforeAtt = attribute('milliseconds.date.end', note);
        if (millisecondsDateEndBeforeAtt !== null) {
          const millisecondsDateFromEnd =
            parseFloat(millisecondsDateEndBeforeAtt.getValue()) +
            parseFloat(ornamentMillisecondsFromEndAtt.getValue());
          ornamentMillisecondsDateOffset = millisecondsDateFromEnd - millisecondsDate;
          millisecondsDateAtt.setValue(String(millisecondsDateFromEnd));
        }
      }

      const millisecondsDateEndAtt = attribute('milliseconds.date.end', note);
      const ornamentMillisecondsDurationAtt = attribute('ornament.milliseconds.duration', note);
      if (ornamentMillisecondsDurationAtt !== null) {
        const millisecondsDateEnd = String(
          millisecondsDate +
            ornamentMillisecondsDateOffset +
            parseFloat(ornamentMillisecondsDurationAtt.getValue()),
        );
        if (millisecondsDateEndAtt !== null) millisecondsDateEndAtt.setValue(millisecondsDateEnd);
        else note.addAttribute(new Attribute('milliseconds.date.end', millisecondsDateEnd));
      } else {
        // The attribute exists only when it is "true": present shifts the end and preserves
        // the duration, absent leaves the end unaltered so the duration absorbs the shift.
        const ornamentNoteoffShiftAtt = attribute('ornament.noteoff.shift', note);
        if (ornamentNoteoffShiftAtt !== null) {
          if (millisecondsDateEndAtt !== null)
            millisecondsDateEndAtt.setValue(
              String(
                parseFloat(millisecondsDateEndAtt.getValue()) + ornamentMillisecondsDateOffset,
              ),
            );
        }
      }
    }
  }
}
