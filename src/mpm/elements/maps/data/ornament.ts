import type { Element } from '../../../../xml/XomTypes.js';
import { OrnamentNote, readJavaDouble } from './OrnamentNote.js';
import type { OrnamentDef } from '../../styles/defs/OrnamentDef.js';

/**
 * Read an `<ornament>`'s note pool: its `<note>` children, in document order (DESIGN.md D1).
 *
 * Shared by the two live readers of an ornament — `OrnamentationMap.getOrnamentDataOf` and the
 * inline reader in `OrnamentationMap.apply` — so that a change to the pool grammar cannot land
 * in one of them and miss the other. Children that are not `<note>` are ignored, as elsewhere
 * in this port; a `<note>` that cannot be used is dropped with a log by
 * {@link OrnamentNote.fromXml}.
 *
 * PARITY NOTE: v2 `<ornament>` elements are always empty, so this returns `[]` for every v2
 * document and cannot move a v2 byte.
 *
 * PERFORMANCE NOTE — `Element.getChildElements`, deliberately not `allChildElements` from
 * `xml/tree.ts`, which is the house helper everywhere else. That one runs an XPath, and
 * `Element.query` serializes the whole subtree to text, re-parses it, and maps every hit back
 * onto the live tree by position (`XomTypes.ts`, `query`'s own doc). Measured on a built pool:
 * 250 notes 74 ms, 500 190 ms, 1000 795 ms, 2000 3158 ms — quadratic. This function runs once
 * per `<ornament>` on the render path, including for v2 ornaments with no children at all.
 * `getChildElements(name)` is a plain scan of the child array with the same local-name,
 * namespace-agnostic matching.
 */
export function parseOrnamentNotePool(xml: Element): OrnamentNote[] {
  const pool: OrnamentNote[] = [];
  for (const child of xml.getChildElements('note')) {
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
 * (DESIGN.md D16; PARITY.md §6.8): this attribute has no grammar either, so the choice of
 * parser is observable — `repetitions=""` is unusable here and says so, where `Number` read it
 * as `0` and took the default silently.
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
 * What an MPM v3 note-generating ornament hands to {@link applyGeneratedOrnament}: the notes
 * it created, grouped one array per onset, and how their spacing is written.
 *
 * `chords` is the same `Element[][]` shape the v2 path passes around — one inner array per
 * *slot*, with more than one element in it when the slot is a chord — because that is what
 * both transformers iterate. Unlike the v2 path's, these elements are not yet in the score:
 * {@link applyGeneratedOrnament} returns them, and the caller inserts them.
 *
 * `spacing` is null whenever the notes already carry their final tick dates, which is every
 * tick-domain and `%` frame (DESIGN.md D4 resolves those in the symbolic phase). It is a
 * function rather than a `TemporalSpread` because a millisecond frame aligned `at end` writes
 * a marker the v2 class has no name for (the D5 amendment). It must run *after* the dynamics
 * gradient, which is the v2 transformer order and is observable in the attribute order of the
 * augmented MSM.
 */
export interface OrnamentGeneration {
  readonly chords: Element[][];
  readonly spacing: ((chords: Element[][]) => void) | null;
}

/**
 * One `<ornament>` as the renderer applies it: the def it names, resolved against the style in
 * scope, plus everything the element itself carries.
 *
 * `noteOrder` decides which notes the ornament runs over and in what sequence. It holds either
 * exactly one of the two magic strings `"ascending pitch"` / `"descending pitch"` — meaning
 * "every note at this date, sorted by pitch" — or a list of note IDs naming the notes
 * explicitly. The two cases are distinguished by content, not by type, and the readers
 * preserve that: the magic strings are stored as a single-element array, ID lists are stripped
 * of their `#` prefixes and split on whitespace.
 *
 * MPM v3 adds three things an ornament can carry, all optional and all additive here:
 * {@link notes} (the pool of auxiliary notes the ornament may play), {@link repetitions} (how
 * often `note.order`'s repeat group runs) and {@link noteid} (the principal note the ornament
 * decorates). An ornament showing none of them is a v2 ornament and takes the untouched v2 code
 * path (DESIGN.md D6).
 *
 * The two readers are `OrnamentationMap.getOrnamentDataOf`, which returns null unless it can
 * resolve BOTH the style and the `ornamentDef`, and the inline reader in
 * `OrnamentationMap.apply`, which `continue`s past an entry it cannot resolve. The v3 field
 * readers they share ({@link parseOrnamentNotePool}, {@link parseOrnamentRepetitions} and the
 * `note.order` split) are module-level functions so that agreement is structural.
 *
 * `xml`, `styleName` and `style` are not here: the readers set all three and nothing read them
 * afterwards. The style is an input to resolution — the def is taken out of it and it is never
 * consulted again.
 *
 * Port of the read half of meico.mpm.elements.maps.data.OrnamentData.
 */
export interface Ornament {
  /** `xml:id` of the ornament element. */
  readonly xmlId: string | null;
  /** `@date`, in ticks. */
  readonly date: number;
  /** `@scale` — the weight of the def's dynamics gradient. 0.0 is the schema default. */
  readonly scale: number;
  /** `@name.ref` — the `ornamentDef` this instruction asks for. */
  readonly ornamentDefName: string | null;
  /** The def {@link ornamentDefName} resolved to. Both readers reject an ornament without one. */
  readonly ornamentDef: OrnamentDef | null;
  /** `@note.order` as v2 reads it: `#` stripped, whitespace split, magic strings kept whole. */
  readonly noteOrder: readonly string[] | null;
  /**
   * `@note.order` exactly as written, or null when the ornament has none.
   *
   * {@link noteOrder} stays v2's flat list, a lossy view of this: v2's reader strips every `#`
   * and splits on whitespace, which flattens the v3 grammar into indistinguishable tokens —
   * `#n1` and the repeat mark `:|` come out as `n1` and `:|`, and re-prefixing everything with
   * `#` on the way out would write the nonsense `#:|`. Keeping that field flat is what lets the
   * v2 render path stay byte-frozen. The raw text here is what a writer re-emits (see
   * `OrnamentationMap.addOrnament`) and what the expansion engine parses with `parseNoteOrder`
   * from `noteOrder.ts`.
   */
  readonly noteOrderText: string | null;
  /** The v3 note pool, in document order — empty for every v2 ornament. */
  readonly notes: readonly OrnamentNote[];
  /** The v3 `repetitions`; `0` (the schema default) means the repeat group plays once. */
  readonly repetitions: number;
  /**
   * The v3 `noteid`: an ID reference to the principal note this ornament decorates
   * (`ornament.xml:80`).
   *
   * Stored exactly as written, `#` included, because the schematron distinguishes the two
   * spellings — `ornament-principal-note-ref` asserts `@noteid[starts-with(., '#')]` — so
   * normalising on read would silently repair a document that a validator rejects, and
   * re-serializing it would change bytes the author wrote. Use {@link principalNoteId} to
   * resolve it against MSM ids (DESIGN.md D7 accepts both spellings for resolution).
   */
  readonly noteid: string | null;
}

/** Every field of {@link Ornament} that a v2 ornament leaves at its default. */
export const NO_V3_ORNAMENT_FIELDS = {
  noteOrderText: null,
  notes: [],
  repetitions: 0,
  noteid: null,
} as const satisfies Pick<Ornament, 'noteOrderText' | 'notes' | 'repetitions' | 'noteid'>;

/**
 * {@link Ornament.noteid} with a leading `#` removed — the form that matches an MSM `xml:id`.
 * Null when the ornament names no principal note, which sends the renderer down the rest of
 * DESIGN.md D7's fallback chain (a non-pool reference in `note.order`, then absolute
 * `midi.pitch` on every pool note).
 */
export function principalNoteId(ornament: Ornament): string | null {
  const { noteid } = ornament;
  if (noteid === null) return null;
  return noteid.startsWith('#') ? noteid.slice(1) : noteid;
}

/**
 * Apply a v2 ornament's transformers to `chordSequence`, and return the chords the caller must
 * add to the map — always none, on this path.
 *
 * The dynamics gradient runs before the temporal spread, and both mutate the note elements in
 * place: they write `ornament.*` attributes that later passes fold into the real performance
 * attributes (see `OrnamentationMap.renderAllNonmillisecondsModifiersToMap` and
 * `OrnamentationMap.renderMillisecondsModifiersToMap`).
 *
 * The empty return is the Java reference's too (OrnamentData.java, where a TODO marks the
 * spot): a v2 ornament only ever *modifies* the notes it was given, so there is nothing for the
 * caller to add and the `for (const chord of …)` loop in `OrnamentationMap.apply` is dead.
 * {@link applyGeneratedOrnament} fills it.
 *
 * `tempChordSequence` is inherited from the reference and protects nothing: the spread is
 * shallow, so the inner arrays and the Element objects are shared with the caller, and the
 * transformers mutate exactly those.
 */
export function applyOrnament(ornament: Ornament, chordSequence: Element[][]): Element[][] {
  const chordsToAdd: Element[][] = [];
  if (ornament.ornamentDef === null) return chordsToAdd;

  const tempChordSequence: Element[][] = [...chordSequence];

  // Java calls each getter twice — `if (getX() != null) getX().apply(...)`. Both are plain
  // field reads (`OrnamentDef.ts:116-118` and `:156-158`), so binding the result once is the
  // same two values in the same order.
  const gradient = ornament.ornamentDef.getDynamicsGradient();
  if (gradient !== null) gradient.apply(tempChordSequence, ornament.scale);

  const spread = ornament.ornamentDef.getTemporalSpread();
  if (spread !== null) spread.apply(tempChordSequence);

  return chordsToAdd;
}

/**
 * The v3 counterpart of {@link applyOrnament}: the same two transformers in the same order over
 * the notes the renderer generated, and then those notes, for the caller to insert.
 *
 * The gradient is applied with this ornament's `scale`, exactly as in v2, so a v3 ornament's
 * `ornament.dynamics` markers are folded into `velocity` by the same tick pass that folds a v2
 * arpeggio's. The gradient runs before the spacing, which fixes the attribute insertion order
 * the reference augmented MSM shows verbatim. The copy is shallow, so the transformers mutate
 * the caller's elements.
 *
 * This does not fall through to {@link applyOrnament}: the chord sequence here *is* the
 * generation, so running the v2 path too would write every marker twice. The generation is a
 * parameter rather than a field on {@link Ornament} because it is render state for exactly one
 * call — it points at Element objects being inserted into one particular score.
 */
export function applyGeneratedOrnament(
  ornament: Ornament,
  generation: OrnamentGeneration,
): Element[][] {
  if (ornament.ornamentDef === null) return [];

  const tempChordSequence: Element[][] = [...generation.chords];

  const gradient = ornament.ornamentDef.getDynamicsGradient();
  if (gradient !== null) gradient.apply(tempChordSequence, ornament.scale);

  if (generation.spacing !== null) generation.spacing(tempChordSequence);

  return generation.chords;
}
