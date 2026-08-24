/**
 * The MPM v3 ornament **expansion engine**: it turns a parsed `note.order` (the AST of
 * `noteOrder.ts`), the ornament's note pool and its principal note into the flat sequence of
 * *slots* the renderer instantiates as MSM notes — repetition groups multiplied out, chords
 * kept as single slots, pitches resolved to numbers, duplicates collapsed.
 *
 * A pure module (RULE C3): no XML, no classes, no state, no logging. Every diagnostic is
 * *returned* — warnings on the value, and a fatal reason instead of it — so the caller decides
 * what reaches the console, per RULE E1's log-and-skip.
 *
 * WHAT A SLOT IS. One slot is one *onset* — one position in the temporal spread the
 * `temporalSpread` transformer lays out over the ornament's frame. A slot holds one note
 * normally and more than one for a chord (`[ #a #b ]`), which is exactly the spec's
 * "chords occupy one spacing slot". The output is therefore "n onsets, each
 * with its pitches"; timing is not this module's business — the frame, the power-function
 * spacing, `noteoff.shift` and the multi-ornament layout all happen in the renderer, against
 * the slot count this returns.
 *
 * WHAT IT DOES NOT DO. The keyword variants of `note.order` (`ascending pitch` /
 * `descending pitch`) never arrive here: they are the v2 arpeggio behaviour, which keeps its
 * untouched v2 code path, and {@link ExpansionInput.order}
 * is typed as the `list` variant alone so that they cannot be passed without a cast. Ids
 * arrive normalised: every reference has lost its leading `#` in the parser and `@noteid`'s
 * optional one before it fills in {@link Principal.id} (the reference implementation fails to
 * strip it). Here, ids are compared with plain `===`.
 *
 * RELATION TO THE REFERENCE IMPLEMENTATION. Where a rule below is marked "(= reference)" this
 * engine reproduces the *intent* of `OrnamentationMap.applyNotesToMaps`
 * (LarsEngeln/meico@3deb141c) — never its code, which cannot terminate on a bare id token,
 * supports only one repeat group, and counts the non-repeated part of the sequence against the
 * repeat budget. Each divergence is named at the rule it belongs to.
 *
 * TERMINATION AND DETERMINISM. Every loop here runs over a precomputed length: the number
 * of repeat passes is *computed arithmetically*, never discovered by a `while` that appends
 * until a budget is met (the reference's shape, which hangs on an empty group). Same input,
 * same output, always: no randomness, no
 * `Date`, no iteration over a `Set`/`Map` whose order could vary. The one unbounded quantity
 * — how many slots the caller can ask for — is bounded by {@link MAX_EXPANDED_SLOTS}.
 */

import type { NoteOrder, RepeatGroup } from './noteOrder.js';
import { elementAt } from '../../../../prelude/index.js';

/** The `list` variant of the AST — the only `note.order` shape this module expands. */
export type NoteOrderList = Extract<NoteOrder, { kind: 'list' }>;

/**
 * How a pool `<note>` states its pitch: `midi.pitch` (absolute), `interval.chromatic`
 * (halftones relative to the principal, double — microtones are legal) or
 * `interval.diatonic` (scale steps relative to the principal, integer). The spec's
 * schematron allows at most one of the three, and zero means "the principal's pitch";
 * resolving that priority and that default happens at the XML boundary
 * (`OrnamentNote.parsePitchSpec`), so a spec reaching this module is exactly one of the three.
 *
 * Deliberately the *widened* shape (`kind` a union of literals, one `value`) rather than a
 * three-member discriminated union, so that `OrnamentNote.pitchSpec` — which may spell it
 * either way, a union of three singleton members being assignable to this and not the
 * reverse — can be handed straight over without a converter.
 */
export interface PitchSpec {
  readonly kind: 'midi' | 'chromatic' | 'diatonic';
  readonly value: number;
}

/**
 * The principal note the ornament decorates, already resolved by the caller along the
 * spec's chain (`@noteid` → first non-pool `note.order` reference → none).
 * `null` is the third case: an ornament with no principal at all, which is renderable only
 * if every referenced pool note carries an absolute `midi.pitch`.
 */
export interface Principal {
  readonly id: string;
  readonly midiPitch: number;
}

/**
 * The tonal context `interval.diatonic` is resolved against: the key signature as a
 * position on the circle of fifths, negative for flats (−7 = C♭ major … 0 = C major … +7 =
 * C♯ major). The renderer reads it from the MSM key signature in force at the ornament's date.
 */
export interface DiatonicContext {
  readonly keyFifths: number;
}

/**
 * One resolved note of the output. `ref` is the id it came from (`#`-free), `source` says
 * which of the three reference spaces answered, and `midiPitch` is the final pitch —
 * fractional when the ornament asked for a microtonal `interval.chromatic`, because MSM
 * carries fractional `midi.pitch` and only MIDI export rounds.
 *
 * `landing` marks the one note the landing rule appends (rule 4 of {@link expandOrnament}).
 * It is `?: true` and never `false`: its absence is "this note is not a landing note", so a
 * caller can test it with a plain truthiness check.
 */
export interface ResolvedNote {
  readonly ref: string;
  readonly midiPitch: number;
  readonly source: 'pool' | 'msm' | 'principal';
  readonly landing?: true;
}

/**
 * One onset of the expanded sequence. More than one note means a chord.
 *
 * `repetitionPass` is the 0-based number of the pass over a repeat group that emitted this
 * slot — 0 for the group's first (authored) playing, 1 for the first repetition, and so on.
 * Like {@link ResolvedNote.landing} it is optional and never spelled for the absent case:
 * a slot outside every repeat group simply does not carry it, and neither does the landing
 * copy, which the landing rule appends *after* the last pass rather than as part of one.
 *
 * It exists for provenance, not for the engine: the renderer stamps it onto the generated note
 * as `ornament.pass` so that a consumer can tell the third turn of a trill from the first
 * as part of the provenance family.
 */
export interface Slot {
  readonly notes: readonly ResolvedNote[];
  readonly repetitionPass?: number;
}

/** Everything {@link expandOrnament} needs. See each field's type for its contract. */
export interface ExpansionInput {
  /** The parsed `note.order`, `list` variant (keywords are the caller's v2 path). */
  readonly order: NoteOrderList;
  /** The ornament's note pool, keyed by `xml:id` without `#`. */
  readonly pool: ReadonlyMap<string, PitchSpec>;
  /** The principal note, or `null` when the ornament resolves to none. */
  readonly principal: Principal | null;
  /** Pitches of referenced MSM score notes that are not pool notes, keyed by id. */
  readonly msmNotes: ReadonlyMap<string, number>;
  /** `@repetitions`: extra passes of each repeat group, or the `-1` fill sentinel. */
  readonly repetitions: number;
  readonly diatonicContext: DiatonicContext;
  /**
   * For `repetitions === -1` only: the total slot budget the frame affords, computed by the
   * caller as `ceil(frameLengthMs / 150)` (the reference's hard-coded 150 ms per repeat note,
   * `null` whenever `repetitions >= 0`, where it is unused.
   */
  readonly frameNoteBudget: number | null;
}

/**
 * The result. The `ok: false` variant is RULE E1's log-and-skip: the ornament cannot be
 * rendered, the caller logs `reason` and moves on (still writing `note.order.perf` for
 * downstream visibility).
 *
 * `warnings` rides on both variants, for the reason `noteOrder.ts` puts them on every
 * `NoteOrder` variant: diagnostics collected before the fatal are still true and still worth
 * logging (an unresolvable reference is often *why* the sequence ended up empty), and a caller
 * collecting them should not have to narrow the union first. It is always an array, empty when
 * nothing was noted.
 */
export type ExpansionResult =
  | {
      readonly ok: true;
      readonly slots: readonly Slot[];
      readonly warnings: readonly string[];
    }
  | {
      readonly ok: false;
      readonly reason: string;
      readonly warnings: readonly string[];
    };

/**
 * The hard ceiling on the expanded slot count — a guard, not a semantic rule (≠ the reference,
 * whose
 * expansion loop has neither a ceiling nor a termination proof and dies by `OutOfMemory`).
 *
 * One slot becomes one MSM note, and at the reference's own 150 ms-per-note yardstick a
 * million slots is on the order of forty hours of music: no real ornament is anywhere near
 * it, while `repetitions="2147483647"` or an absurd frame budget is one array allocation
 * away from taking the process down. Exceeding it is a fatal (`ok: false`) — the module
 * stays total and never throws.
 */
export const MAX_EXPANDED_SLOTS = 1_000_000;

/** Semitone offsets of the major scale from its tonic. */
const MAJOR_SCALE_STEPS = [0, 2, 4, 5, 7, 9, 11] as const;

/**
 * Expand a `note.order` into the sequence of slots the renderer instantiates.
 *
 * The five rules, in the order they are applied:
 *
 * **1 — Reference resolution.** Each id of each item is looked up in this order: the note
 * pool; then the principal's id; then the MSM notes. Pool first, because a pool id is
 * ornament-local and shadows anything outside it; the principal before the MSM map, because
 * the principal is itself an MSM note and the `'principal'` source is the more informative
 * answer. An id that no space answers is dropped with a warning — the v2 precedent, and the
 * reference's behaviour too ("unresolvable references are silently removed from the order"),
 * except that here it is not silent. An item that loses *all* its ids loses its slot, again
 * with a warning.
 *
 * **2 — Pitch resolution.** `midi` is the value as-is. `chromatic` is
 * `principal.midiPitch + value` in plain double arithmetic, so microtonal offsets survive.
 * `diatonic` is {@link resolveDiatonicPitch}, whose algorithm this file *defines*, the spec
 * saying only "context-sensitive". A pool note that is not `midi` needs a principal to be
 * relative to: without one the ornament is unrenderable and the result is `ok: false`
 * ("all `note`s need an explicit `midi.pitch`, or the ornament cannot be rendered
 * correctly"). MSM references need no principal; they carry their own pitch.
 *
 * **3 — Repetition expansion.** A repeat group is played `repetitions + 1` times in total
 * (`repetitions` = 3 ⇒ played four times — spec exemplum), expanded in
 * place: the group's slots are emitted back-to-back where the group stands, and whatever
 * follows the group follows the last pass. When `note.order` holds several groups, each is
 * expanded with the same count — `@repetitions` is one attribute on the ornament and says
 * nothing about a per-group count (≠ the reference, which supports exactly one group). With no
 * group at
 * all a non-zero `repetitions` has nothing to multiply and is noted as a warning.
 *
 * `repetitions === -1` is meico's undocumented fill-the-frame sentinel (schema-invalid —
 * the spec types the attribute `minInclusive 0`): the groups repeat as often as fit into
 * {@link ExpansionInput.frameNoteBudget} *total slots*, counting the non-repeated slots
 * too. With `S` slots authored and `G` slots inside groups, the extra pass count is
 * `max(0, floor((budget − S) / G))`, i.e. the largest `k` with `S + k·G ≤ budget` — which
 * is what the reference's append-while-it-fits loop computes for its single group, minus
 * the loop. It needs a budget of at least one slot and at least one group; without either
 * the result is `ok: false`. Any other negative or non-integer `repetitions` is `ok: false`
 * as well.
 *
 * **4 — Landing** (= reference). After a group has been expanded, if that group's first slot is a
 * single note at the principal's pitch, one more copy of that slot is appended behind the
 * group's last pass, flagged {@link ResolvedNote.landing}, "so the figure resolves onto the
 * principal note". Three notes on the trigger:
 * - The reference tests `intm == "0.0hs"` on the *pool child* whose id opens the group,
 *   i.e. "this note is a unison with the principal" — a pool-only lookup that cannot see a
 *   direct `#principal` reference. Testing the resolved pitch against the principal's, as
 *   here, covers what "the repeat group starts on a principal-pitch note" means, and
 *   covers the reference's case plus the one its lookup misses. A chord never triggers it:
 *   the reference strips the brackets and matches the result against a single id, which no
 *   chord can equal.
 * - Placement is in place, behind the group, not at the end of the sequence — where the
 *   reference puts it (its `notesToAdd` block is spliced in at the group's end). The two
 *   readings coincide for a trailing group and differ only for a group with a tail behind it,
 *   e.g. the dictionary's *trill with mordent* `|: 0 1 :| 0 -1 0`, where the reference's own
 *   comment ("might add doubles -> need to sanitize") shows it expects the landing copy to
 *   land next to the tail's leading `0` and be collapsed by rule 5.
 * - It fires on the *presence* of a group, not on `repetitions > 0`: with `repetitions="0"`
 *   the group is still a repeat group, and the reference appends the landing copy there
 *   too. Without a principal it can never fire, since no pitch can equal the principal's.
 *
 * **5 — Dedup** (= reference). Consecutive slots that are both single-note and of equal pitch
 * collapse to the first — the redundancy the reference sanitizes away, "which can occur due
 * to repetitions". Two exceptions: chords never collapse (neither with each other nor with a
 * single note — a chord is a different musical object even when it contains that pitch), and
 * a sequence in which *every* slot is the same single pitch is left alone, so a genuine
 * tremolo or repeated-note figure survives. The test for that exception is over the expanded
 * sequence ("unless the whole sequence is single-pitch"), and not over the
 * *pool* as in the reference, which misfires whenever the pool holds notes the order never
 * uses. Dedup runs *after* landing, so a landing note equal to its predecessor is exactly
 * what it drops; when a landing note survives, it survives with its flag.
 *
 * A well-formed order can still come back `ok: false`, through rule 1: if nothing resolves
 * there is no ornament to render, and the caller gets a reason rather than an empty success.
 */
export function expandOrnament(input: ExpansionInput): ExpansionResult {
  const warnings: string[] = [];
  const fail = (reason: string): ExpansionResult => ({ ok: false, reason, warnings });

  const { order, repetitions, frameNoteBudget } = input;

  if (!Number.isInteger(repetitions) || (repetitions < 0 && repetitions !== -1))
    return fail(
      `repetitions must be a non-negative integer or the -1 fill sentinel; got ${repetitions}.`,
    );

  if (order.items.length === 0) return fail('note.order lists no notes.');

  const resolution = resolveSlots(input, warnings);
  if (resolution.kind === 'fatal') return fail(resolution.reason);
  const { slots } = resolution;
  if (slots.length === 0)
    return fail('every note reference in note.order was dropped; nothing left to render.');

  const groups = mapGroups(order.groups, resolution.itemIndices, warnings);
  const groupLength = groups.reduce((sum, group) => sum + (group.end - group.start + 1), 0);

  let passes: number;
  if (repetitions === -1) {
    if (groups.length === 0)
      return fail('repetitions="-1" fills a repeat group, but note.order has none.');
    if (frameNoteBudget === null || !Number.isInteger(frameNoteBudget) || frameNoteBudget < 1)
      return fail(
        `repetitions="-1" needs a frame note budget of at least 1 slot; got ${String(frameNoteBudget)}.`,
      );
    passes = Math.max(0, Math.floor((frameNoteBudget - slots.length) / groupLength));
  } else {
    if (groups.length === 0 && repetitions > 0)
      warnings.push(
        `ornament expansion: repetitions="${repetitions}" has no effect — note.order has no repeat group.`,
      );
    passes = repetitions;
  }

  // Sized before it is built — allocating first and checking after is how the reference runs
  // out of memory. The ceiling bounds the *expansion*; the landing rule may add up to one more
  // slot per group on top of it, which is a handful of slots and not what a guard is for.
  if (slots.length + passes * groupLength > MAX_EXPANDED_SLOTS)
    return fail(
      `expansion would exceed ${MAX_EXPANDED_SLOTS} slots (${slots.length} authored, ` +
        `${passes} extra pass(es) over ${groupLength} grouped slot(s)).`,
    );

  return { ok: true, slots: dedupe(expand(slots, groups, passes, input.principal)), warnings };
}

/**
 * Resolve the diatonic step of an `interval.diatonic` pool note against a key signature — the
 * rule is spelled out here because no source states it: the spec says only that
 * `interval.diatonic` is "context-sensitive", and the reference implementation avoids the
 * question at the MPM layer by resolving diatonic steps upstream in MEI and writing
 * halftones into an MSM `intm` attribute. An MPM-authored document has no
 * upstream, so the resolution has to happen here.
 *
 * The algorithm:
 *
 * 1. *The scale.* `keyFifths` names a major key by its position on the circle of fifths;
 *    its tonic pitch class is `7 · keyFifths (mod 12)` — a fifth is seven semitones, so
 *    walking the circle is multiplying by seven — and the scale is that tonic plus the
 *    major-scale steps `0 2 4 5 7 9 11`, taken as a set of seven pitch classes sorted
 *    ascending within the octave. (Equivalently, and as the circle-of-fifths derivation is
 *    usually written: the seven pitch classes `7k (mod 12)` for `k` from `keyFifths − 1` to
 *    `keyFifths + 5`. Same set.) Sorting ascending inside `0…11` — rather than from the
 *    tonic — is what makes step 3's octave carry land on C, which is where MIDI octaves
 *    begin; carrying at the tonic would transpose results by an octave in every key but C.
 *    Only the *major* scale is used: MSM key signatures are accidental counts, they do not
 *    record mode, and a minor key shares its signature's pitch classes anyway.
 *
 * 2. *The anchor.* The principal's pitch is placed on that scale. If it is a scale note,
 *    it is its own anchor. If it is not — a chromatic principal, or a microtonal one — the
 *    anchor is the nearest scale pitch *below* it and the difference is remembered as
 *    `chromaticDelta`. This is the only defensible reading of "context-sensitive" for a note
 *    outside the key: the step is counted in the key, and the principal's own alteration is
 *    carried along rather than silently corrected into the key.
 *
 * 3. *The step.* The anchor's scale degree is found by index, `steps` is added, and the
 *    result is split into an octave carry (`floor(d / 7)`) and a degree within the octave
 *    (`d mod 7`, non-negative), so descending steps and multi-octave steps work by the same
 *    arithmetic as ascending ones. A non-integer `steps` is meaningless for a scale degree
 *    (the spec types the attribute `integer`); it is rounded, and the caller is expected to
 *    have parsed an integer in the first place.
 *
 * 4. *The delta comes back.* `chromaticDelta` is added to the stepped pitch, so E♭ in C
 *    major moves to F (anchor D → E, plus the semitone), and a quarter-tone-sharp C moves to
 *    a quarter-tone-sharp D. `steps === 0` therefore returns the principal's pitch exactly,
 *    which is the spec's default for a pool note with no pitch attribute at all.
 *
 * Worked, all in C major (`keyFifths = 0`) unless stated: E (64) `+1` → F (65); B (71) `+1`
 * → C (72), one octave up; C (60) `−1` → B (59); F♯ (66) `+1` in D major (`keyFifths = 2`,
 * scale `1 2 4 6 7 9 11`) → G (67); E♭ (63) `+1` → anchor D (62), delta 1, D+1 = E (64),
 * plus delta → F (65).
 *
 * `keyFifths` outside −7…7 is not rejected — the modular arithmetic keeps working and
 * simply names an enharmonic key — but a non-integer signature is meaningless and is
 * rounded.
 */
export function resolveDiatonicPitch(
  principalPitch: number,
  steps: number,
  keyFifths: number,
): number {
  const tonic = mod12(7 * Math.round(keyFifths));
  const scale = MAJOR_SCALE_STEPS.map((step) => mod12(tonic + step)).sort((a, b) => a - b);

  // The greatest scale pitch not above the principal. `degree` stays -1 when every scale
  // pitch class sits above the principal's inside its octave (C in D major, say), in which
  // case the anchor is the scale's top degree an octave down.
  const floorPitch = Math.floor(principalPitch);
  const pitchClass = mod12(floorPitch);
  let degree = -1;
  for (const [index, scalePitchClass] of scale.entries())
    if (scalePitchClass <= pitchClass) degree = index;

  const anchorDegree = degree < 0 ? scale.length - 1 : degree;
  const anchor =
    floorPitch -
    pitchClass +
    elementAt(scale, anchorDegree, 'scale degree') -
    (degree < 0 ? 12 : 0);
  const chromaticDelta = principalPitch - anchor;

  const target = anchorDegree + Math.round(steps);
  const octave = Math.floor(target / scale.length);
  const stepped =
    anchor -
    mod12(anchor) +
    12 * octave +
    elementAt(scale, target - octave * scale.length, 'scale degree') +
    chromaticDelta;
  return stepped;
}

/** Non-negative remainder modulo 12 (`%` keeps the sign of the dividend in JS). */
function mod12(value: number): number {
  return ((value % 12) + 12) % 12;
}

/** What {@link resolveSlots} hands back: the surviving slots, or the reason there are none. */
type Resolution =
  | {
      readonly kind: 'slots';
      readonly slots: readonly Slot[];
      /** For each surviving slot, the index of the `note.order` item it came from. */
      readonly itemIndices: readonly number[];
    }
  | { readonly kind: 'fatal'; readonly reason: string };

/** What one reference resolves to: a note, a warned-about drop, or an unrenderable ornament. */
type Reference =
  | { readonly kind: 'note'; readonly note: ResolvedNote }
  | { readonly kind: 'drop' }
  | { readonly kind: 'fatal'; readonly reason: string };

/** Rules 1 and 2: `note.order` items become slots of resolved notes. */
function resolveSlots(input: ExpansionInput, warnings: string[]): Resolution {
  const slots: Slot[] = [];
  const itemIndices: number[] = [];

  for (const [itemIndex, item] of input.order.items.entries()) {
    const notes: ResolvedNote[] = [];
    for (const id of item.ids) {
      const reference = resolveReference(id, input, warnings);
      if (reference.kind === 'fatal') return reference;
      if (reference.kind === 'note') notes.push(reference.note);
    }
    if (notes.length === 0) {
      warnings.push(
        `ornament expansion: note.order item ${itemIndex} lost all of its references; slot dropped.`,
      );
      continue;
    }
    slots.push({ notes });
    itemIndices.push(itemIndex);
  }

  return { kind: 'slots', slots, itemIndices };
}

/** Rule 1's lookup chain (pool → principal → MSM) and rule 2's pitch arithmetic. */
function resolveReference(id: string, input: ExpansionInput, warnings: string[]): Reference {
  const { pool, principal, msmNotes, diatonicContext } = input;

  const spec = pool.get(id);
  if (spec !== undefined) {
    if (spec.kind === 'midi')
      return { kind: 'note', note: { ref: id, midiPitch: spec.value, source: 'pool' } };

    if (principal === null)
      return {
        kind: 'fatal',
        reason:
          `pool note "${id}" states its pitch as interval.${spec.kind} and so needs a principal ` +
          `note to be relative to; this ornament has none, and only absolute midi.pitch pool ` +
          `notes can be rendered without one.`,
      };

    if (spec.kind === 'diatonic' && !Number.isInteger(spec.value))
      warnings.push(
        `ornament expansion: interval.diatonic="${spec.value}" on pool note "${id}" is not a ` +
          `whole scale step; rounded to ${Math.round(spec.value)}.`,
      );

    const midiPitch =
      spec.kind === 'chromatic'
        ? principal.midiPitch + spec.value
        : resolveDiatonicPitch(principal.midiPitch, spec.value, diatonicContext.keyFifths);
    return { kind: 'note', note: { ref: id, midiPitch, source: 'pool' } };
  }

  if (principal !== null && id === principal.id)
    return { kind: 'note', note: { ref: id, midiPitch: principal.midiPitch, source: 'principal' } };

  const msmPitch = msmNotes.get(id);
  if (msmPitch !== undefined)
    return { kind: 'note', note: { ref: id, midiPitch: msmPitch, source: 'msm' } };

  warnings.push(
    `ornament expansion: note.order references "${id}", which is neither a pool note nor the ` +
      `principal note nor a known MSM note; dropped.`,
  );
  return { kind: 'drop' };
}

/**
 * Re-index the AST's repeat groups from *item* indices onto the *slot* indices that survived
 * resolution — the two differ exactly when rule 1 dropped a slot. A group all of whose slots
 * were dropped is itself dropped; a group that lost only some keeps the rest, which is the
 * only reading that preserves "the notes that are still there are repeated".
 *
 * The AST guarantees groups are ordered, non-nested and non-overlapping, so the mapped
 * groups are too, and at most one group can start at any slot index.
 */
function mapGroups(
  groups: readonly RepeatGroup[],
  itemIndices: readonly number[],
  warnings: string[],
): readonly RepeatGroup[] {
  const mapped: RepeatGroup[] = [];

  for (const group of groups) {
    let start = -1;
    let end = -1;
    for (const [slotIndex, itemIndex] of itemIndices.entries()) {
      if (itemIndex < group.start || itemIndex > group.end) continue;
      if (start < 0) start = slotIndex;
      end = slotIndex;
    }
    if (start < 0) {
      warnings.push(
        `ornament expansion: the repeat group over note.order items ${group.start}…${group.end} ` +
          `lost all of its slots; group dropped.`,
      );
      continue;
    }
    mapped.push({ start, end });
  }

  return mapped;
}

/**
 * Rules 3 and 4: emit the sequence with every group repeated `passes` extra times in place,
 * each followed by its landing slot where the landing rule fires.
 *
 * A slot emitted from inside a repeat group is a fresh object carrying its
 * {@link Slot.repetitionPass}; every other slot is passed through by reference. Sharing is
 * invisible to a well-typed caller — everything in {@link Slot} and {@link ResolvedNote} is
 * `readonly` — and the `notes` arrays are shared in either case, so a million-slot budget
 * stays an array of small headers rather than a million deep copies. A caller that
 * instantiates a fresh MSM note per *occurrence* must therefore key its bookkeeping on the
 * slot's index, never on the slot's identity.
 */
function expand(
  slots: readonly Slot[],
  groups: readonly RepeatGroup[],
  passes: number,
  principal: Principal | null,
): readonly Slot[] {
  const groupsByStart = new Map(groups.map((group) => [group.start, group]));
  const expanded: Slot[] = [];

  for (let index = 0; index < slots.length; index += 1) {
    const group = groupsByStart.get(index);
    if (group === undefined) {
      expanded.push(elementAt(slots, index, 'slot'));
      continue;
    }

    for (let pass = 0; pass <= passes; pass += 1)
      for (let inner = group.start; inner <= group.end; inner += 1)
        expanded.push({ notes: elementAt(slots, inner, 'slot').notes, repetitionPass: pass });

    const landing = landingSlot(elementAt(slots, group.start, 'slot'), principal);
    if (landing !== null) expanded.push(landing);

    // Skip the slots just emitted; `group.end >= index`, so the loop always advances.
    index = group.end;
  }

  return expanded;
}

/** Rule 4's trigger: a group opening on a single note at the principal's pitch. */
function landingSlot(first: Slot, principal: Principal | null): Slot | null {
  const note = soleNote(first);
  if (principal === null || note === null) return null;
  if (note.midiPitch !== principal.midiPitch) return null;
  return { notes: [{ ...note, landing: true }] };
}

/**
 * The one note of a single-note slot, or null for a chord — the test three of rules 4 and 5's
 * steps make, and the read each of them made straight afterwards.
 */
function soleNote(slot: Slot): ResolvedNote | null {
  return slot.notes.length === 1 ? (slot.notes.at(0) ?? null) : null;
}

/** Rule 5: collapse consecutive equal single notes, unless the whole sequence is one pitch. */
function dedupe(expanded: readonly Slot[]): readonly Slot[] {
  const first = elementAt(expanded, 0, 'slot').notes;
  // `first[0]` stays inside the callback rather than being hoisted: on a first slot that holds
  // no notes at all it is the thing that fails, and it only fails once some other slot has
  // exactly one note — which is the order the `&&` already had.
  const isTremolo = expanded.every(
    (slot) =>
      slot.notes.length === 1 &&
      elementAt(slot.notes, 0, 'note').midiPitch === elementAt(first, 0, 'note').midiPitch,
  );
  if (isTremolo) return expanded;

  const kept: Slot[] = [];
  // The previous kept slot's pitch, or `null` when it was a chord — which is what stops a
  // chord from ever collapsing, with a single note or with another chord.
  let previousPitch: number | null = null;

  for (const slot of expanded) {
    const pitch = soleNote(slot)?.midiPitch ?? null;
    if (pitch !== null && pitch === previousPitch) continue;
    kept.push(slot);
    previousPitch = pitch;
  }

  return kept;
}
