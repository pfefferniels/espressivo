import type { Element } from '../../../../xml/XomTypes.js';
import { OrnamentNote, readJavaDouble } from './OrnamentNote.js';
import type { OrnamentationStyle } from '../../styles/style.js';
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
 * The parse is `parseJavaDouble`, for the reason spelled out at `OrnamentNote.readPitchValue`
 * (DESIGN.md D16, the W9 ruling; PARITY.md §6.8): this attribute has no grammar either, so
 * `Number` differed from Java on real spellings — `repetitions=""` read as `0` and took the
 * default **silently**, where every other unusable value said so.
 */
export function parseOrnamentRepetitions(raw: string): number {
  const repetitions = readJavaDouble(raw);
  if (repetitions === null || !Number.isFinite(repetitions) || repetitions < -1) {
    console.error(
      `Warning: repetitions="${raw}" of an ornament element is no usable repeat count; 0 is used instead.`,
    );
    return 0;
  }
  return repetitions;
}

/**
 * What an MPM v3 note-generating ornament hands to {@link OrnamentData.apply}: the notes it
 * created, grouped one array per onset, and how their spacing is written.
 *
 * `chords` is the same `Element[][]` shape the v2 path passes around — one inner array per
 * *slot*, with more than one element in it when the slot is a chord — because that is what
 * both transformers iterate. Unlike the v2 path's, these elements are not yet in the score:
 * `apply` returns them, and the caller inserts them.
 *
 * `spacing` is null whenever the notes already carry their final tick dates, which is every
 * tick-domain and `%` frame (DESIGN.md D4 resolves those in the symbolic phase). It is a
 * function rather than a `TemporalSpread` because a millisecond frame aligned `at end` writes
 * a marker the v2 class has no name for (the D5 amendment); the renderer decides which writer
 * applies and this class only has to run it in the right place — *after* the dynamics
 * gradient, which is the v2 transformer order and is observable in the attribute order of the
 * augmented MSM.
 */
export interface OrnamentGeneration {
  readonly chords: Element[][];
  readonly spacing: ((chords: Element[][]) => void) | null;
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
 * This is a **record plus its v2 `apply`**, and it does not parse XML. The port used to
 * carry a `constructor(xml)` transcribing `<ornament>`, but nothing called it and it
 * produced objects both live readers treat as unusable: it resolved neither `style` nor
 * `ornamentDef`, where {@link OrnamentationMap.getOrnamentDataOf} returns null unless it
 * can resolve BOTH and the inline reader in `OrnamentationMap.apply` `continue`s past the
 * entry. It was also the only reader here that could throw — `xml.getAttribute('date')!`
 * and `xml.getAttribute('name.ref')!` dereference unguarded, where both live readers
 * decline the entry instead. The three v3 field readers it shared with them
 * ({@link parseOrnamentNotePool}, {@link parseOrnamentRepetitions}, and the `note.order`
 * split) are module-level functions precisely so that agreement is structural; only the
 * duplicated, divergent entry point is gone.
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

  /**
   * The MPM v3 note generation, installed by the renderer (`ornamentInstantiation.ts`) just
   * before {@link apply} runs, and null on the v2 path — which is every ornament in every
   * existing document, so the v2 branch of `apply` stays exactly what it was.
   *
   * It is state on the data object rather than an argument because `apply`'s signature is the
   * v2 seam's, shared with the Java reference, and the loop that consumes its return value
   * (`OrnamentationMap.apply`) is the code the contract is written for.
   */
  generation: OrnamentGeneration | null = null;

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
    // `generation` is deliberately NOT copied: it is render state that lives for the length of
    // one `apply` call and points at Element objects being inserted into one particular score.
    // A clone is a fresh ornament, not a render in progress.
    return c;
  }

  /**
   * Apply this ornament's transformers to `chordSequence`. The dynamics gradient runs
   * before the temporal spread, and both mutate the note elements in place — they write
   * `ornament.*` attributes that later passes fold into the real performance attributes
   * (see {@link OrnamentationMap.renderAllNonmillisecondsModifiersToMap} and
   * {@link OrnamentationMap.renderMillisecondsModifiersToMap}).
   *
   * On the v2 path the return value is **always an empty array**, and the Java reference is
   * the same (OrnamentData.java, where a TODO marks the spot): a v2 ornament only ever
   * *modifies* the notes it was given, so there is nothing for the caller to add, and the
   * `for (const chord of od.apply(...))` loop in OrnamentationMap.apply is dead. That loop was
   * documented as a contract rather than an oversight, and MPM v3 is what fills it: an
   * ornament that *generates* notes returns them here, and the caller inserts them into the
   * map (DESIGN.md D5, wave W5).
   *
   * The v3 branch is {@link generation}. It runs the same two transformers in the same order —
   * the gradient before the spacing, which fixes the attribute insertion order the reference
   * augmented MSM shows verbatim — over the notes the renderer generated, and hands those
   * notes back. It does **not** fall through to the v2 branch: `chordSequence` on that call is
   * the generation itself, so running the v2 branch too would write every marker twice.
   *
   * `tempChordSequence` is inherited from the reference and protects nothing: the spread is
   * shallow, so the inner arrays and the Element objects are shared with the caller, and the
   * transformers mutate exactly those.
   */
  apply(chordSequence: Element[][]): Element[][] {
    if (this.generation !== null) return this.applyGeneration(this.generation);

    const chordsToAdd: Element[][] = [];

    if (this.ornamentDef === null) return chordsToAdd;

    const tempChordSequence: Element[][] = [...chordSequence];

    if (this.ornamentDef.getDynamicsGradient() !== null)
      this.ornamentDef.getDynamicsGradient()!.apply(tempChordSequence, this.scale);

    if (this.ornamentDef.getTemporalSpread() !== null)
      this.ornamentDef.getTemporalSpread()!.apply(tempChordSequence);

    return chordsToAdd;
  }

  /**
   * The v3 half of {@link apply}: the transformers over the generated notes, then the notes.
   *
   * The shallow copy is kept for the same reason the v2 branch keeps it — the transformers
   * mutate the elements, and the copy makes that explicit rather than hiding it — and the
   * gradient is applied with this ornament's `scale`, exactly as in v2, so a v3 ornament's
   * `ornament.dynamics` markers are folded into `velocity` by the same tick pass that folds a
   * v2 arpeggio's.
   */
  private applyGeneration(generation: OrnamentGeneration): Element[][] {
    if (this.ornamentDef === null) return [];

    const tempChordSequence: Element[][] = [...generation.chords];

    // The v2 branch above spells this `getDynamicsGradient()!` twice, which is the shape the
    // Java reference has and is frozen there; new code does not add to that debt.
    const gradient = this.ornamentDef.getDynamicsGradient();
    if (gradient !== null) gradient.apply(tempChordSequence, this.scale);

    if (generation.spacing !== null) generation.spacing(tempChordSequence);

    return generation.chords;
  }
}
