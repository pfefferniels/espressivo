/**
 * The ornament dictionary: which auxiliary notes each notated ornament sign plays.
 *
 * SOURCE. A verbatim port of `src/resources/ornaments.dict` from LarsEngeln/meico branch
 * `develop` @ `3deb141c` (open PR cemfi/meico#31), described in
 * `ornamentation/research/lars-v3-implementation.md` §7.3. The seven entries and their step
 * sequences below are exactly that file's seven entries, in its order; the header comments of
 * the dict are reproduced as documentation where they carry a rule.
 *
 * WHY A TABLE AND NOT A FILE. The reference ships a text resource parsed at runtime. Here it
 * is an `as const` table (DESIGN.md §4, "`src/mei/resources/ornaments.dict.ts` — as const
 * table, no runtime file IO"): the library is consumed as an ES module by bundlers and by the
 * browser, where `resources/` next to the sources does not exist. Making the data code also
 * makes the shapes type-checked and lets the compiler prove the lookup total.
 *
 * WHAT A SEQUENCE MEANS. Each entry's sequence is a list of **diatonic step offsets relative
 * to the principal note** — `0` is the principal's own pitch, `1` the next scale degree up,
 * `-1` the next down — interleaved with the literal repeat tokens `|:`, `:|` and `:|:` that
 * delimit the part of the sequence a trill repeats. Steps stay *diatonic* all the way into the
 * MPM; see {@link ../mei/MeiOrnamentExpander} for why that diverges from the reference, which
 * resolves them to halftones already in the MEI.
 *
 * The dict's own grammar (its lines 1-13) is not reimplemented — comments (`%`), name lines
 * (`#`) and alteration lines have already been applied in transcribing the file into the table.
 * The one rule that survives into code is the alias rule: the first `#` line is the display
 * name and every following `#` line is an alternative spelling matching the same entry.
 */

/**
 * One token of an ornament's alteration sequence: a diatonic step offset, or a repeat barline.
 *
 * `:|:` is the dict's "repeat end immediately followed by repeat start" token. It appears in no
 * shipped entry but is part of the format (dict line 6, and the reference writes `rptboth` for
 * it), so the type admits it and DESIGN.md D9 normalises it to `:| |:` downstream.
 */
export type OrnamentToken = number | '|:' | ':|' | ':|:';

/** One dictionary entry: an ornament shape, its spellings, and the notes it plays. */
export interface OrnamentShape {
  /** The dict's first `#` line — the display name, and the MPM `ornamentDef` name we author. */
  readonly name: string;
  /**
   * Further `#` lines: alternative spellings that match the same entry. Empty for most
   * entries, because a SMuFL glyph name usually normalises onto {@link name} by itself
   * ({@link normalizeOrnamentName}) and needs no explicit alias.
   */
  readonly aliases: readonly string[];
  /** The alteration line, tokenised. */
  readonly sequence: readonly OrnamentToken[];
}

/**
 * The seven shipped entries of `ornaments.dict`, in file order.
 *
 * Read the sequences against the dict's own example (its line 13, `1 0 |: -1 0 :| 1 0`): a
 * trill is "principal, upper neighbour, over and over"; a turn is a four-note figure played
 * once; a mordent is a three-note bite; "trill with mordent" is a trill that lands in a lower
 * mordent; the double cadence is a lower-neighbour prefix in front of a trill.
 */
export const ORNAMENT_SHAPES = [
  { name: 'trill', aliases: [], sequence: ['|:', 0, 1, ':|'] },
  { name: 'upper turn', aliases: [], sequence: [1, 0, -1, 0] },
  { name: 'lower turn', aliases: [], sequence: [-1, 0, 1, 0] },
  { name: 'upper mordent', aliases: [], sequence: [0, 1, 0] },
  { name: 'lower mordent', aliases: [], sequence: [0, -1, 0] },
  { name: 'trill with mordent', aliases: [], sequence: ['|:', 0, 1, ':|', 0, -1, 0] },
  {
    name: 'double cadence lower prefix',
    // The dict spells this alias out even though the normaliser below would derive it anyway;
    // its own comment (line 39) says as much. Keeping it is free and documents the intent.
    aliases: ['ornamentPrecompDoubleCadenceLowerPrefix'],
    sequence: [-1, 0, '|:', 1, 0, ':|'],
  },
] as const satisfies readonly OrnamentShape[];

/**
 * SMuFL glyph name → the dict's lowercase, space-separated spelling.
 *
 * The dict header (lines 4-5) defines the correspondence: `ornamentPrecompDoubleCadenceLowerPrefix`
 * and `double cadence lower prefix` name the same ornament. The transformation is: drop the
 * leading `ornamentPrecomp` or `ornament`, split before each capital, join with spaces,
 * lowercase.
 *
 * DIVERGENCE FROM THE REFERENCE (blueprint §7.5, third defect): it strips only the longer
 * prefix `ornamentPrecomp`, so a plain `ornamentTrill` keeps its `Trill` capital, normalises to
 * `ornament trill`, misses the dict and dereferences null. Stripping both prefixes — longest
 * first, which is why the order of the two `startsWith` tests matters — is the fix.
 *
 * The split is on a **lowercase-to-uppercase boundary**, not simply before every capital as the
 * reference does it (`glyphName.split("(?=[A-Z])")`). Splitting before every capital shatters a
 * name that is not camelCase — `"UPPER MORDENT"` becomes `"u p p e r m o r d e n t"` — so a
 * caller that upper-cased a dict spelling would silently miss the entry. Restricting the split
 * to a genuine camel hump leaves every non-camelCase spelling intact while still cutting
 * `DoubleCadenceLowerPrefix` into its four words.
 *
 * Names that are already dict spellings therefore pass through with only their whitespace
 * collapsed and their case folded, both of which are idempotent.
 */
export function normalizeOrnamentName(raw: string): string {
  let name = raw.trim();
  if (name.startsWith('ornamentPrecomp')) name = name.slice('ornamentPrecomp'.length);
  else if (name.startsWith('ornament')) name = name.slice('ornament'.length);
  return name
    .split(/(?<=[a-z])(?=[A-Z])/)
    .join(' ')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

/**
 * Find the shape a notated ornament plays, or null if the dictionary does not know the name.
 *
 * Both the query and every candidate spelling go through {@link normalizeOrnamentName}, so a
 * SMuFL glyph name, its spaced-out form and any casing all reach the same entry.
 *
 * Returning null rather than throwing is the contract the caller needs: an unknown or absent
 * ornament name is an encoding the dictionary has no opinion about (a bare `<mordent/>` with no
 * `@form` is the common case), and RULE E1 / DESIGN.md D16 make that a log-and-skip, not a
 * failure. The reference has no null check here and throws instead (blueprint §7.5, second
 * defect).
 */
export function lookupOrnamentShape(name: string): OrnamentShape | null {
  const wanted = normalizeOrnamentName(name);
  if (wanted === '') return null;
  for (const shape of ORNAMENT_SHAPES) {
    if (normalizeOrnamentName(shape.name) === wanted) return shape;
    for (const alias of shape.aliases) if (normalizeOrnamentName(alias) === wanted) return shape;
  }
  return null;
}

/**
 * The distinct diatonic steps of a sequence, in order of first appearance.
 *
 * This is what the MPM note *pool* holds: the pool is an ornament's vocabulary, and
 * `ornament.xml:78-79` is explicit that "the order of these note elements have no semantic
 * meaning" — the playing order lives in `note.order`. So a turn's `1 0 -1 0` contributes three
 * pool notes, not four, and `note.order` names the `0` note twice.
 */
export function distinctSteps(sequence: readonly OrnamentToken[]): number[] {
  const steps: number[] = [];
  for (const token of sequence)
    if (typeof token === 'number' && !steps.includes(token)) steps.push(token);
  return steps;
}
