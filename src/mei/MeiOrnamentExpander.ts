/**
 * MEI ornament signs → MPM v3 ornaments.
 *
 * WHAT THIS DOES. `<trill>`, `<mordent>` and `<turn>` are *signs*: they say "an ornament is
 * played here" and leave the notes implicit. This module makes them explicit, turning each sign
 * into an MPM `<ornament>` with a note pool and a `note.order`, plus the `<ornamentDef>` that
 * gives it a shape in time. Which notes a sign plays comes from {@link ./ornamentsDict}; this
 * module owns the translation into MPM.
 *
 * WHAT THIS DELIBERATELY DOES NOT DO. `<arpeg>` is untouched. It already has a conversion —
 * `Mei2MsmMpmConverter.processArpeg`, which authors a v2 ornament — and DESIGN.md D6 freezes
 * the v2 path byte-for-byte. Nothing here runs for an arpeggio, and the def table below has no
 * arpeggio row precisely so that a name collision cannot reroute it. Grace notes, `<bTrem>` and
 * `<fTrem>` are likewise out of scope (the reference expands the first and routes the others
 * through `processChord`; blueprint §7.2).
 *
 * LAYER. `src/mei` is L5 and may import `src/mpm` (L4) — RULE M1 forbids only the other
 * direction (architecture brief §1). Every MPM type used here is imported, never re-declared.
 *
 * DIVERGENCES FROM THE REFERENCE IMPLEMENTATION (LarsEngeln/meico @ 3deb141c, blueprint §7).
 * Three are structural and each is argued at the code below:
 *
 *  1. **Diatonic steps stay diatonic.** The reference resolves each step to a halftone distance
 *     while still in the MEI (`Helper.shiftNoteDiatonicly`, then `@intm="…hs"`, landing in MSM
 *     as `interval.chromatic`). We write `interval.diatonic` and let the renderer resolve it
 *     against the part's key signature at the ornament's date (DESIGN.md D8). The reason is that
 *     the MPM must stand on its own: an MPM authored here is a performance description that
 *     other tools read, and a document that says "the note above, in this key" survives a
 *     transposition or a key change that a frozen halftone distance does not. It also means the
 *     expansion and the MSM-side resolution share one code path instead of two.
 *  2. **No `repetitions="-1"`.** The reference emits the fill-the-frame sentinel whenever a
 *     repeat barline is present. Here it would be a silent no-op: `-1` is computable only from a
 *     frame whose length is stated in milliseconds (`ornamentInstantiation.frameNoteBudget`,
 *     DESIGN.md D9), and every def this module authors states its frame in ticks or percent, so
 *     the renderer would reject each trill instead of playing it. `repetitions` is therefore left
 *     at the schema default 0 — the repeat group plays once — which always renders. A document
 *     that wants fill-the-frame can say so by hand, with an `ms` frameLength.
 *  3. **`@noteid` is written with its `#`.** The spec's schematron asserts
 *     `@noteid[starts-with(., '#')]`; the reference writes the bare id. Our reader accepts both
 *     (DESIGN.md D7), so this costs nothing and makes the output schema-valid.
 *
 * The defects catalogued in blueprint §7.5 are excluded by construction, not ported and fixed:
 * the signed-interval bug cannot occur without halftone arithmetic (divergence 1), the missing
 * null checks are the `null` returns below, the prefix-stripping bug is fixed in the dict
 * module, and the no-namespace `<note>` children cannot happen because pool notes are built
 * through {@link OrnamentNote}, which owns its serialization.
 */

import { OrnamentData } from '../mpm/elements/maps/data/OrnamentData.js';
import { OrnamentNote } from '../mpm/elements/maps/data/OrnamentNote.js';
import { OrnamentDef } from '../mpm/elements/styles/defs/OrnamentDef.js';
import { NoteOffShift, TemporalSpread } from '../mpm/elements/styles/defs/TemporalSpread.js';
import { Element } from '../xml/XomTypes.js';
import { attribute, getAttributeValue } from '../xml/tree.js';
import { distinctSteps, lookupOrnamentShape } from './ornamentsDict.js';
import type { OrnamentShape } from './ornamentsDict.js';

/** The MEI element names this module expands. `arpeg` is deliberately absent; see the header. */
export const ORNAMENT_SIGN_NAMES: readonly string[] = ['trill', 'mordent', 'turn'];

/**
 * The name of the ornament a sign denotes: `@form` plus the element name, as the dictionary
 * spells it — `<mordent form="upper">` is an `"upper mordent"` (blueprint §7.2).
 *
 * `@form="unknown"` is treated as no form at all, which is the reference's rule and the sensible
 * one: MEI uses it to say the source is ambiguous.
 *
 * The result is a *dictionary* name. It is not the def name — a delayed ornament plays the same
 * notes at a different place in the beat, so {@link ornamentDefName} appends `" delayed"` for
 * the def while the lookup keeps using this.
 */
export function ornamentShapeName(sign: Element): string {
  const name = sign.getLocalName();
  const form = getAttributeValue('form', sign).trim();
  if (form === '' || form === 'unknown') return name;
  return `${form} ${name}`;
}

/**
 * The MPM `ornamentDef` name for a sign: its shape name, plus `" delayed"` when `@delayed` says
 * the ornament starts after the beat rather than on it.
 *
 * MEI types `@delayed` as a boolean, so anything other than a present `"true"` means not
 * delayed; the reference tests `null` and `"false"` and treats every other value as delayed,
 * which would make `@delayed="0"` delayed. Testing for `"true"` instead is the narrower reading
 * and matches the MEI datatype.
 */
export function ornamentDefName(sign: Element): string {
  const base = ornamentShapeName(sign);
  return getAttributeValue('delayed', sign).trim() === 'true' ? `${base} delayed` : base;
}

/**
 * Build the `<ornamentDef>` for one ornament name.
 *
 * WHY NOT `OrnamentDef.createDefaultOrnamentDef`. That is where the reference keeps this table
 * and where DESIGN.md D17 expected it, but it is v2 code on the frozen arpeggio path, and
 * `tests/mpm/elements/styles/defs/OrnamentDef.test.ts:820` pins its current behaviour: an
 * unknown name — the test uses `'trill'` — must come back with no transformers at all. Adding
 * rows there would either break that test or require weakening it, and both are ruled out
 * (CAMPAIGN.md invariant 3). Keeping the MEI table here also keeps the freeze legible: the v2
 * function is untouched, so the arpeggio def it builds provably cannot move.
 *
 * THE VALUES are the reference's `createDefaultOrnamentDef` table as the blueprint records it
 * (§3.7), which is what "the intended parameters" means for a wave whose job is to match intent
 * rather than bytes. Note the blueprint's own observation that `trill`, `upper turn`,
 * `lower turn` and `double cadence lower prefix` have no row of their own and fall through to
 * the default — that is reproduced here rather than corrected, because inventing frame lengths
 * for them would be inventing performance practice.
 *
 * Serialization is canonical v3 (DESIGN.md D12): these defs are built through the v3 setters, so
 * they write `frame.offset`/`frameLength` with unit suffixes and carry `alignment` when delayed.
 * No v2 document produces a def this way, so no v2 byte moves.
 */
export function createMeiOrnamentDef(name: string): OrnamentDef | null {
  const def = OrnamentDef.createOrnamentDef(name);
  if (def === null) return null;

  // Gradient before spread: `OrnamentDef` appends each transformer as it is set, so this call
  // order is what fixes the serialized child order to `dynamicsGradient` then `temporalSpread`.
  // The same warning stands in createDefaultOrnamentDef. Do not swap the two.
  const spread = new TemporalSpread();
  spread.setFrameOffset({ value: 0.0, domain: 'ticks' });
  spread.noteOffShift = NoteOffShift.Monophonic;

  switch (normalizeDefName(name)) {
    case 'mordent':
    case 'upper mordent':
    case 'lower mordent':
      def.setDynamicsGradientValues(1.0, -1.0);
      spread.setFrameLengthValue({ value: 180.0, domain: 'ticks' });
      spread.intensity = 0.9;
      break;

    case 'turn delayed':
    case 'upper turn delayed':
    case 'lower turn delayed':
      def.setDynamicsGradientValues(1.0, -1.0);
      spread.setFrameLengthValue({ value: 50.0, domain: 'relative' });
      spread.intensity = 1.0;
      break;

    default:
      // trill, upper/lower turn, double cadence lower prefix, and any name the table does not
      // know — the reference's `default:` row.
      def.setDynamicsGradientValues(-1.0, 1.0);
      spread.setFrameLengthValue({ value: 80.0, domain: 'relative' });
      spread.intensity = 0.9;
      break;
  }

  def.setTemporalSpread(spread);
  // After the spread, not before: `setTemporalSpread` regenerates the element and re-asserts a
  // non-default alignment, so setting it first would work by that fallback rather than directly.
  if (isDelayed(name)) def.setAlignment('at end');
  return def;
}

/** The def-table lookup key: trimmed and lowercased, as the reference's `switch` does it. */
function normalizeDefName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

/** Whether a def name carries the `" delayed"` suffix {@link ornamentDefName} appends. */
function isDelayed(name: string): boolean {
  return normalizeDefName(name).endsWith(' delayed');
}

/**
 * Turn a dictionary shape into the data of one MPM `<ornament>`.
 *
 * The three parts of the result mirror the three parts of an MPM ornament:
 *
 *  - the **pool** — one `<note>` per *distinct* diatonic step, each carrying
 *    `interval.diatonic`, addressed by an id derived from `idBase`;
 *  - **`note.order`** — the shape's sequence with each step replaced by a `#`-reference to its
 *    pool note and the repeat tokens kept verbatim, which is exactly the grammar W2's parser
 *    reads back;
 *  - **`@noteid`** — the principal, so the renderer knows what the ornament decorates and what
 *    the steps are relative to.
 *
 * IDS ARE DERIVED, NOT RANDOM. Pool ids are `${idBase}_n${i}`. Where the converter generates a
 * UUID per element, the ids here have to be *referenced* from `note.order` on the same ornament,
 * and deriving them from the ornament's own id keeps that link readable in the output, keeps the
 * conversion deterministic for the same input, and gives the downstream consumers that key on
 * `(part, date, pitch, slot)` a stable name to key on. `idBase` is the ornament's `xml:id` when
 * the MEI supplies one — `<trill xml:id="tr1">` yields `tr1_n0`, `tr1_n1` — and the caller
 * passes a generated id when it does not.
 *
 * @param shape the dictionary entry the sign resolved to
 * @param defName the `ornamentDef` name to reference, which may carry `" delayed"`
 * @param principalId the MSM `xml:id` of the note the sign is attached to, without `#`
 * @param date the ornament's date in ticks
 * @param idBase the stem for generated pool-note ids, and the ornament's own `xml:id`
 */
export function buildOrnamentData(
  shape: OrnamentShape,
  defName: string,
  principalId: string,
  date: number,
  idBase: string,
): OrnamentData {
  const steps = distinctSteps(shape.sequence);
  // A step's pool id is its position in `steps`, which is total over the sequence's numeric
  // tokens by construction — `distinctSteps` collects exactly those — so the lookup below needs
  // no fallback and no assertion.
  const idOfStep = (step: number) => `${idBase}_n${steps.indexOf(step)}`;
  // `interval.diatonic`, not a resolved pitch — divergence 1 in the module header. Step 0 is the
  // principal's own scale degree and is a pool note like any other, so `note.order` never has to
  // mix pool references with score references.
  const notes = steps.map(
    (step) => new OrnamentNote(idOfStep(step), { kind: 'diatonic', value: step }),
  );

  const data = new OrnamentData();
  data.date = date;
  data.ornamentDefName = defName;
  // Mirrors processArpeg. `scale` weights the def's dynamicsGradient, and 0.0 is both the schema
  // default and what the existing MEI path uses; picking anything else would invent a dynamic
  // shaping the encoding never asked for.
  data.scale = 0.0;
  data.xmlId = idBase;
  data.noteid = `#${principalId}`;
  data.notes = notes;
  // Left at the schema default; see divergence 2 in the module header for why the reference's
  // `-1` is not emitted here.
  data.repetitions = 0;
  data.noteOrderText = shape.sequence
    .map((token) => (typeof token === 'number' ? `#${idOfStep(token)}` : token))
    .join(' ');
  return data;
}

/**
 * The MSM/MEI id of the note a sign decorates, or null if it names none.
 *
 * `@startid` is the only attachment this module resolves. MEI can also place a control event by
 * `@tstamp` alone, and the converter's {@link Mei2MsmMpmConverter.computeControlEventTiming}
 * handles that for the ornament's *date* — but an ornament additionally needs a *principal
 * note*, because every step in the dictionary is relative to one and `@noteid` is what DESIGN.md
 * D7 resolves first. A timestamp does not name a note, so a sign without `@startid` is logged
 * and skipped rather than guessed at.
 *
 * MEI note ids survive into the MSM unchanged, so no translation table is needed: the `n20` a
 * `@startid="#n20"` names is the `xml:id` of the MSM `<note>`.
 */
export function principalIdOf(sign: Element): string | null {
  const startid = attribute('startid', sign);
  if (startid === null) return null;
  const id = startid.getValue().trim().replace(/^#/, '');
  return id === '' ? null : id;
}

/**
 * Resolve a sign to everything needed to author its ornament, or null if it cannot be expanded.
 *
 * Pure, and separated from the converter for that reason: the converter half of the expansion
 * needs a live `Performance`, a part cursor and the movement's id index, none of which a test
 * should have to build to check that a turn plays the right four notes.
 *
 * @returns null after logging when the sign names no principal or the dictionary does not know
 *   it — RULE E1 / DESIGN.md D16: log and skip, never throw, never guess.
 */
export function resolveOrnamentSign(
  sign: Element,
): { shape: OrnamentShape; defName: string; principalId: string } | null {
  const principalId = principalIdOf(sign);
  if (principalId === null) {
    console.error(
      `Warning: ${sign.getLocalName()} ${sign.toXML()} has no startid naming the note it ornaments; it is skipped.`,
    );
    return null;
  }

  const shape = lookupOrnamentShape(ornamentShapeName(sign));
  if (shape === null) {
    console.error(
      `Warning: ${sign.toXML()} denotes no ornament the dictionary knows (looked up "${ornamentShapeName(sign)}"); it is skipped.`,
    );
    return null;
  }

  return { shape, defName: ornamentDefName(sign), principalId };
}
