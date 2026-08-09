import { Attribute, Element } from '../../../../xml/XomTypes.js';
import { OrnamentNote } from './OrnamentNote.js';
import type { OrnamentationStyle } from '../../styles/OrnamentationStyle.js';
import type { OrnamentDef } from '../../styles/defs/OrnamentDef.js';

/**
 * Read an `<ornament>`'s note pool: its `<note>` children, in document order (DESIGN.md D1).
 *
 * Shared by the three places that read an ornament — this class, and
 * `OrnamentationMap.getOrnamentDataOf` plus the inline reader in `OrnamentationMap.apply` —
 * so that a change to the pool grammar cannot land in one of them and miss the others.
 * Children that are not `<note>` are ignored, as elsewhere in this port; a `<note>` that
 * cannot be used is dropped with a log by {@link OrnamentNote.fromXml}.
 *
 * PARITY NOTE: v2 `<ornament>` elements are always empty, so this returns `[]` for every v2
 * document and cannot move a v2 byte.
 *
 * PERFORMANCE NOTE — `Element.getChildElements`, deliberately **not** `allChildElements` from
 * `xml/tree.ts`, which is the house helper everywhere else. That one runs an XPath, and
 * `Element.query` serializes the whole subtree to text, re-parses it, and maps every hit back
 * onto the live tree by position (`XomTypes.ts`, `query`'s own doc). Measured on a built pool:
 * 250 notes 74 ms, 500 190 ms, 1000 795 ms, 2000 3158 ms — quadratic. This function runs once
 * per `<ornament>` on the render path, including for v2 ornaments that have no children at
 * all, so the XPath route would have put a serialize-and-reparse of every ornament into a path
 * that had none. `getChildElements(name)` is a plain scan of the child array with the same
 * local-name, namespace-agnostic matching.
 */
export function parseOrnamentNotePool(xml: Element): OrnamentNote[] {
  const pool: OrnamentNote[] = [];
  for (const child of xml.getChildElements('note').toArray()) {
    const note = OrnamentNote.fromXml(child);
    if (note !== null) pool.push(note);
  }
  return pool;
}

/**
 * Read an `<ornament>`'s `repetitions` (`ornament.xml:39-50`): how many times the `|: … :|`
 * group of `note.order` is repeated *in addition* to being played once, so the number of
 * plays is `repetitions + 1` (DESIGN.md D9; the spec's own exemplum spells "repeating … three
 * times … So, it is played four times").
 *
 * Lenient in one direction only: `-1` is accepted, an undocumented meico extension meaning
 * "fill the frame" (D9), while any other unusable value is logged and falls back to the
 * schema default `0` rather than propagating a `NaN` into a loop bound. Non-integers are
 * passed through untouched — rounding them would invent a rule no source states, and the
 * expansion engine owns what a fractional repeat count means.
 *
 * TODO(W10) — `Number` stands in for `parseJavaDouble` here for the reason given at
 * `OrnamentNote.readPitchValue`; DESIGN.md D16.
 */
export function parseOrnamentRepetitions(raw: string): number {
  const repetitions = Number(raw);
  if (!Number.isFinite(repetitions) || repetitions < -1) {
    console.error(
      `Warning: repetitions="${raw}" of an ornament element is no usable repeat count; 0 is used instead.`,
    );
    return 0;
  }
  return repetitions;
}

/**
 * All data needed to apply one ornament — a single MPM `<ornament>` element plus the
 * style context only {@link OrnamentationMap} knows.
 *
 * `noteOrder` decides which notes the ornament runs over and in what sequence. It holds
 * either exactly one of the two magic strings `"ascending pitch"` / `"descending pitch"`
 * — meaning "every note at this date, sorted by pitch" — or a list of note IDs naming
 * the notes explicitly. The two cases are distinguished by content, not by type, and
 * the parsing below preserves that: the magic strings are stored as a single-element
 * array, ID lists are stripped of their `#` prefixes and split on whitespace.
 *
 * MPM v3 adds three things an ornament can carry, all optional and all additive here:
 * {@link notes} (the pool of auxiliary notes the ornament may play), {@link repetitions}
 * (how often `note.order`'s repeat group runs) and {@link noteid} (the principal note the
 * ornament decorates). An ornament showing none of them is a v2 ornament and takes the
 * untouched v2 code path (DESIGN.md D6).
 *
 * NOTE that `noteOrder` here stays v2's flat `string[]`. The v3 grammar — chords `[ … ]`,
 * repeat groups `|: … :|` — is parsed by `noteOrder.ts` next door into an AST, and wiring
 * that in belongs to the renderer waves; keeping this field flat is what lets the v2 path
 * stay byte-frozen while both readings coexist.
 *
 * Port of meico.mpm.elements.maps.data.OrnamentData
 */
export class OrnamentData {
  xml: Element | null = null;
  xmlId: string | null = null;

  styleName = '';
  style: OrnamentationStyle | null = null;
  ornamentDefName: string | null = null;
  ornamentDef: OrnamentDef | null = null;

  date = 0.0;
  scale = 0.0;
  noteOrder: string[] | null = null;

  /**
   * The `note.order` attribute **exactly as written**, or null when the ornament has none.
   *
   * {@link noteOrder} above is a lossy view of it: v2's reader strips every `#` and splits on
   * whitespace, which flattens the v3 grammar into indistinguishable tokens — `#n1` and the
   * repeat mark `:|` come out as `n1` and `:|`, and re-prefixing everything with `#` on the
   * way out would write the nonsense `#:|`. So the raw text is kept alongside it. It is what
   * a writer re-emits (see `OrnamentationMap.addOrnamentFromData`) and what the expansion
   * engine parses with `parseNoteOrder` from `noteOrder.ts`; the flat array stays exactly as
   * it was so the v2 render path is untouched.
   */
  noteOrderText: string | null = null;

  /**
   * The v3 note pool, in document order — empty for every v2 ornament. `readonly` on the
   * array because this class only ever hands it on; the field itself is replaced, not
   * mutated in place (RULE I4: readonly goes on the boundary, not on working state).
   */
  notes: readonly OrnamentNote[] = [];

  /** The v3 `repetitions`; `0` (the schema default) means the repeat group plays once. */
  repetitions = 0;

  /**
   * The v3 `noteid`: an ID reference to the principal note this ornament decorates
   * (`ornament.xml:80`).
   *
   * Stored **exactly as written**, `#` included, because the schematron distinguishes the
   * two spellings — `ornament-principal-note-ref` asserts `@noteid[starts-with(., '#')]` —
   * so normalising on read would silently repair a document that a validator rejects, and
   * re-serializing it would change bytes the author wrote. Use
   * {@link getPrincipalNoteId} to resolve it against MSM ids (DESIGN.md D7 accepts both
   * spellings for resolution).
   */
  noteid: string | null = null;

  constructor(xml?: Element) {
    if (xml === undefined) return;

    this.xml = xml;
    this.date = parseFloat(xml.getAttribute('date')!.getValue());
    this.ornamentDefName = xml.getAttribute('name.ref')!.getValue();

    const scaleAttr = xml.getAttribute('scale');
    if (scaleAttr !== null) this.scale = parseFloat(scaleAttr.getValue());

    const noteOrderAttr = xml.getAttribute('note.order');
    if (noteOrderAttr !== null) {
      this.noteOrderText = noteOrderAttr.getValue();
      const no = noteOrderAttr.getValue().trim();
      this.noteOrder = [];
      if (no === 'ascending pitch' || no === 'descending pitch') this.noteOrder.push(no);
      else this.noteOrder.push(...no.replace(/#/g, '').split(/\s+/));
    }

    const id = xml.getAttribute('id', 'http://www.w3.org/XML/1998/namespace');
    if (id !== null) this.xmlId = id.getValue();

    // --- v3 additions (DESIGN.md D7, D9, D1); all absent from any v2 document ---
    const noteidAttr = xml.getAttribute('noteid');
    if (noteidAttr !== null) this.noteid = noteidAttr.getValue();

    const repetitionsAttr = xml.getAttribute('repetitions');
    if (repetitionsAttr !== null)
      this.repetitions = parseOrnamentRepetitions(repetitionsAttr.getValue());

    this.notes = parseOrnamentNotePool(xml);
  }

  /**
   * The {@link noteid} with a leading `#` removed — the form that matches an MSM `xml:id`.
   * Null when the ornament names no principal note, which sends the renderer down the rest
   * of DESIGN.md D7's fallback chain (a non-pool reference in `note.order`, then absolute
   * `midi.pitch` on every pool note).
   */
  getPrincipalNoteId(): string | null {
    if (this.noteid === null) return null;
    return this.noteid.startsWith('#') ? this.noteid.slice(1) : this.noteid;
  }

  clone(): OrnamentData {
    const c = new OrnamentData();
    c.xml = this.xml === null ? null : this.xml.copy();
    c.xmlId = this.xmlId;
    c.styleName = this.styleName;
    c.style = this.style;
    c.ornamentDefName = this.ornamentDefName;
    c.ornamentDef = this.ornamentDef;
    c.date = this.date;
    c.scale = this.scale;
    if (this.noteOrder !== null) {
      c.noteOrder = [...this.noteOrder];
    }
    c.noteOrderText = this.noteOrderText;
    // The pool array is copied, its notes are not — same depth as `style` and `ornamentDef`
    // above, and an OrnamentNote's own state is readonly anyway.
    c.notes = [...this.notes];
    c.repetitions = this.repetitions;
    c.noteid = this.noteid;
    return c;
  }

  /**
   * Apply this ornament's transformers to `chordSequence`. The dynamics gradient runs
   * before the temporal spread, and both mutate the note elements in place — they write
   * `ornament.*` attributes that later passes fold into the real performance attributes
   * (see {@link OrnamentationMap.renderAllNonmillisecondsModifiersToMap} and
   * {@link OrnamentationMap.renderMillisecondsModifiersToMap}).
   *
   * The return value is **always an empty array**, and the Java reference is the same
   * (OrnamentData.java, where a TODO marks the spot). It is the seam for a feature that
   * does not exist yet: ornaments that *generate* notes rather than only modifying
   * existing ones would return them here for the caller to insert into the map. Until
   * that lands, the `for (const chord of od.apply(...))` loop in OrnamentationMap.apply
   * is dead by construction. Do not "simplify" it away — it is the contract, not an
   * oversight. (DESIGN.md D5 fills exactly this seam in wave W5; the v3 fields above are
   * the input it will read.)
   *
   * `tempChordSequence` is likewise inherited from the reference and protects nothing:
   * the spread is shallow, so the inner arrays and the Element objects are shared with
   * the caller, and the transformers mutate exactly those.
   */
  apply(chordSequence: Element[][]): Element[][] {
    const chordsToAdd: Element[][] = [];

    if (this.ornamentDef === null) return chordsToAdd;

    const tempChordSequence: Element[][] = [...chordSequence];

    if (this.ornamentDef.getDynamicsGradient() !== null)
      this.ornamentDef.getDynamicsGradient()!.apply(tempChordSequence, this.scale);

    if (this.ornamentDef.getTemporalSpread() !== null)
      this.ornamentDef.getTemporalSpread()!.apply(tempChordSequence);

    return chordsToAdd;
  }
}
