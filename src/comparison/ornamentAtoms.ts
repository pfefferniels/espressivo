/**
 * Ornament atoms and their RESOLVED PERFORMED EFFECT — DESIGN.md §5.6, as ruled by AD-40,
 * AD-42 and AD-43.
 *
 * The named principle for this wave (AD-40.2, generalizing AD-37.3): **price the resolved
 * performed effect, never the attribute tuple.** `<ornament>@scale` multiplies both endpoints
 * of the `<dynamicsGradient>` before anything is performed, so the compared object is the pair
 * `(from·scale, to·scale)` and `@scale` is not independently priced — two encodings of one
 * performed ramp (`from="-20" scale="1"` against `from="-10" scale="2"`) are the same
 * performance and must compare equal.
 *
 * Everything below was measured through `Performance.perform`, not read off the map classes.
 * AD-43.1 tightened the standard after a map-level probe produced a false no-op claim: "the
 * renderer determines it" means the PIPELINE, and every fact in this file is pinned by a
 * differential test that performs two documents and compares the notes.
 *
 * ## `@scale` defaults to 0 and gates HALF the ornament (AD-40.1)
 *
 * `OrnamentData.ts:121` initialises `scale = 0.0`, and `DynamicsGradient.apply` multiplies both
 * endpoints by it — so an `<ornament>` with no `@scale` performs **no dynamics at all** while
 * its `<temporalSpread>` applies in full. **Contrast §5.4**, where `accentuationPattern@scale`
 * is MANDATORY: absent, the whole instruction is skipped. Same attribute name, two sections,
 * two dispositions.
 *
 * ## `@transition.to` defaults to `@transition.from`, NOT to 0
 *
 * `DynamicsGradient.ts:25`: `if (att2 === null) this.transitionTo = this.transitionFrom`. A def
 * carrying only `transition.from="-20"` performs a FLAT ramp — measured 80/80/80 on three notes
 * at velocity 100, where a `-20 → 0` reading predicts 80/90/100. This is the common encoding
 * rather than a corner: `generateXML:86` omits `transition.to` whenever it equals
 * `transition.from`, so every round-tripped flat gradient is spelled this way.
 *
 * ## The ramp distributes over the POOL, not over score time (AD-40.3)
 *
 * The pool is the notes at the ornament's own date, or the notes an explicit `@note.order` id
 * list names — measured, an id list reaches notes at OTHER dates and orders the ramp by the
 * list, while the note sharing the ornament's date is left alone unless the list names it. A
 * **single-note pool performs `transition.to`** (`DynamicsGradient.ts:47-49`'s `else if`),
 * measured at 120 from a −20 → +20 gradient on velocity 100.
 *
 * {@link OrnamentAtom.poolBound} is therefore an UPPER BOUND and not a size: an id naming no
 * note contributes nothing (measured — a list of one ghost id performs nothing at all), so a
 * list of length L gives a performed pool of size ≤ L. At L = 1 the conclusion survives both
 * worlds — pool 1 performs `transition.to` alone, pool 0 performs nothing — so
 * `@transition.from` is not performed either way and is not priced. At L > 1 and for every
 * date-pooled ornament the size needs an MSM, and both endpoints are priced, which is the
 * conservative direction.
 *
 * ## An `<ornament>` is v2- or v3-SHAPED, and the shape decides which engine runs
 *
 * `isV3Ornament` fires on a `<note>` pool, on `@noteid`, on the mere PRESENCE of
 * `@repetitions` (any value, the schema default `0` included), or on the v3 `note.order`
 * grammar `[ … ]` / `|: … :|`. A v3-shaped ornament leaves the v2 transformer path entirely for
 * `ornamentInstantiation`, and one with no `@note.order` at all is SKIPPED — measured, adding
 * `repetitions="0"` to an ornament takes it from 80/100/120 to 100/100/100. An attribute that
 * reads as a no-op deletes the whole effect, so the shape is carried on the atom and a skipped
 * ornament yields no atom at all.
 *
 * ## The frame: four cells, one of them dead
 *
 * `TemporalSpread` has two incompatible readings and `apply` reads only the v2 fields, so a
 * v3-sourced spread on a v2-shaped ornament leaves them at their `0.0` initialisers and
 * **spreads nothing** — the renderer says so itself ("a v3 temporalSpread carries no v2 frame,
 * so it will spread nothing"). Measured through the pipeline:
 *
 * | ornament shape | spread source | performed frame                                     |
 * | -------------- | ------------- | --------------------------------------------------- |
 * | v2             | v2            | the v2 numbers — date.perf −22/0/22 for −22.0/44.0   |
 * | v2             | v3            | **NONE** — date.perf 0/0/0 for the same numbers      |
 * | v3             | v2            | the v2 numbers, honoured (slots at 0/90/180/270/360) |
 * | v3             | v3            | the v3 values, `%` resolved against the principal    |
 *
 * The dead cell is modelled as the NEUTRAL frame rather than as a special value, because that
 * is what it performs: a spread of `frame.start=0 frameLength=0` and an absent
 * `<temporalSpread>` were measured to perform identically (AD-43.2ii's own test), and so does
 * this. §5.6's three-unit-case paragraph therefore describes v3-SHAPED ornaments, where `%` is
 * genuinely resolved and genuinely comparable; on a v2-shaped ornament a `%` frame is not a
 * unit question because nothing is performed.
 *
 * ## An unresolvable value is `⊥`, not a skip, where the renderer POISONS
 *
 * AD-42.4 requires a finite guard on every numeric read and routes unusable values to
 * skip-and-report. Measured, the renderer does not skip for two of them: `scale="abc"` makes
 * `ornament.dynamics` NaN and the fold writes **velocity NaN** onto every note in the pool, and
 * a v2 `frameLength="abc"` writes **date.perf NaN** — R24's exact condition, the one AD-1 and
 * AD-33.1 price at `⊥` because the note vanishes from the MIDI export. Those two take `⊥`
 * (`renderer-error`) and the rest take the renderer's own fallback: `parseOrnamentRepetitions`
 * logs and returns 0, and `readV3FrameValue` logs and applies the v3 default. Reported either
 * way; flagged for ratification because it departs from AD-42.4's wording on the two cases
 * where the ruling's route would price a note-destroying document at zero.
 *
 * ## The style is carried, and a failed switch behaves differently per SCOPE
 *
 * `OrnamentationMap.apply` assigns `style = localHeader.getStyleDef(…)` UNCONDITIONALLY when a
 * local header exists, so a failed lookup overwrites the carried style with null; with no local
 * header that assignment never runs and the guarded global lookup fires only while `style` is
 * still null. `Part.parseData:113-118` creates a header for every part and `Dated.addMap:94-97`
 * binds the local slot to it, so part-local maps always take the first branch and maps in
 * `<global>` always take the second. Two measured consequences, both through the pipeline:
 *
 * - a `<style>` naming a style that does not exist SKIPS every later ornament in a part-local
 *   map and changes nothing in a global one;
 * - in a global map every `<style>` after the first successful one is IGNORED OUTRIGHT, valid
 *   or not — switching S → T leaves T's ornaments performing S.
 *
 * AD-35.4's hazard class in a fifth shape: a failed lookup assigns over the carried value, but
 * only when the local header exists. Both branches are reproduced here.
 *
 * ## An ornament before the map's first `<style>` is skipped entirely
 *
 * The style is tracked *while walking*, so an ornament with no style in scope cannot resolve
 * its def and performs nothing — §5.4's disposition, and the **opposite of §5.5's**, where an
 * atom's inline modifiers survive an unresolvable name. An ornament naming an unknown def
 * likewise performs nothing.
 *
 * ## Attribution
 *
 * The module's shape, the aligner reuse and the `@scale` resolution are adopted from the
 * predecessor's draft (AD-42.2) and kept. The gradient default, the frame's four cells, the
 * shape gate, the pool bound, the finite guards and the two style-carrying branches replace
 * what that draft and 404fd57 had.
 */
import type { Element } from '../xml/XomTypes.js';
import { attribute } from '../xml/tree.js';
import { ORNAMENTATION_MAP, ORNAMENTATION_STYLE } from '../mpm/names.js';
import { readAttributeValue } from '../expression/attributes.js';
import { findStyleDef } from '../expression/styleScope.js';
import type { MpmEnvironment } from '../expression/mpmTree.js';
import { assertSpanEndRule } from './spanEnds.js';
import { bottom, valued, type Valued } from './values.js';
import { resolutionAt, type OrderedMapView } from './document.js';

/** `OrnamentData.ts:121` — and the reason half an unscaled ornament is inert. */
export const DEFAULT_ORNAMENT_SCALE = 0;

/** Which engine the renderer runs this ornament through (`isV3Ornament`). */
export type OrnamentShape = 'v2' | 'v3';

/** The three v3 time domains, and the two a v2 frame can be in. */
export type FrameDomain = 'ticks' | 'milliseconds' | 'relative';

/** The performed dynamics ramp: both endpoints already multiplied by `@scale` (AD-40.2). */
export interface PerformedGradient {
  readonly from: number;
  readonly to: number;
}

/** The performed temporal frame, in whichever domain the reading selects. */
export interface PerformedSpread {
  /** `@frame.start`, or the v3 `@frame.offset` that supersedes it. */
  readonly frameStart: number;
  readonly frameLength: number;
  readonly intensity: number;
  readonly domain: FrameDomain;
  /** Which reading produced these numbers — a structural difference as well as a numeric one. */
  readonly source: OrnamentShape;
}

/** The neutral frame: measured to perform identically to an absent `<temporalSpread>`. */
export const NEUTRAL_SPREAD: PerformedSpread = {
  frameStart: 0,
  frameLength: 0,
  intensity: 1,
  domain: 'ticks',
  source: 'v2',
};

/** What `@note.order` says, once classified. */
export type NoteOrderKind = 'ascending' | 'descending' | 'id-list' | 'v3-grammar';

export interface OrnamentAtom {
  readonly dateTicks: number;
  /** `xml:id`, the aligner's identity pin. */
  readonly id: string | null;
  readonly nameRef: string | null;
  readonly shape: OrnamentShape;
  /** `@scale`, defaulting to 0 — carried for the report, never priced on its own (AD-40.2). */
  readonly scale: number;
  /** `@note.order` exactly as written, or null. */
  readonly noteOrder: string | null;
  readonly noteOrderKind: NoteOrderKind | null;
  /** An UPPER BOUND on the performed pool, from an explicit id list; null where it needs an MSM. */
  readonly poolBound: number | null;
  /** `@repetitions`; the group plays `repetitions + 1` times (D9). `-1` fills the frame. */
  readonly repetitions: number;
  /** Whether the attribute is PRESENT, which is what gates the v3 engine — not its value. */
  readonly repetitionsPresent: boolean;
  /** Null where the def carries no `<dynamicsGradient>` — a genuine neutral (AD-43.2ii). */
  readonly gradient: Valued<PerformedGradient> | null;
  /** Null where the def carries no `<temporalSpread>` — likewise a genuine neutral. */
  readonly spread: Valued<PerformedSpread> | null;
}

export interface OrnamentAtomNote {
  readonly kind:
    | 'no-style-in-scope'
    | 'unresolved-def'
    | 'style-switch-ignored'
    | 'style-switch-cancels'
    | 'scale-zero'
    | 'scale-unusable'
    | 'frame-unusable'
    | 'frame-inert-v3'
    | 'repetitions-unusable'
    | 'v3-shape-skipped'
    | 'v3-shape'
    | 'pool-size-unknown';
  readonly dateTicks: number;
  readonly detail: string;
}

export interface OrnamentAtoms {
  readonly atoms: readonly OrnamentAtom[];
  readonly notes: readonly OrnamentAtomNote[];
}

/**
 * The v3 value grammar, transliterated from `TemporalValue.ts` because the comparison zone
 * may not import it (§9.7). `tests/comparison/ornamentation.test.ts` differential-tests this
 * against the real `parseTemporalValueLenient` over a shared corpus, which is what licenses
 * the copy — the same discipline §5.4's `accentuationAt` transliteration is held to.
 */
const SUFFIXED = /^(-?[0-9]+(?:\.[0-9]+)?)(ms|%|ticks)$/;
const UNSUFFIXED = /^-?[0-9]+(?:\.[0-9]+)?$/;
const DOMAIN_BY_SUFFIX: Readonly<Record<string, FrameDomain>> = {
  ticks: 'ticks',
  ms: 'milliseconds',
  '%': 'relative',
};

/** `{ value, domain }` with a null domain where the document stated no unit; null if unusable. */
export function parseFrameValue(
  text: string,
): { value: number; domain: FrameDomain | null } | null {
  const suffixed = SUFFIXED.exec(text);
  if (suffixed !== null)
    return { value: Number(suffixed[1]), domain: DOMAIN_BY_SUFFIX[suffixed[2]] };
  if (!UNSUFFIXED.test(text)) return null;
  return { value: Number(text), domain: null };
}

/**
 * v3 iff `@frame.offset` is present, or either frame attribute carries a unit suffix —
 * `TemporalSpread.detectSourceFormat`. The suffix half is easy to miss and decisive:
 * `frame.start="-22ticks" frameLength="44"` is a v3 element and spreads nothing on a v2-shaped
 * ornament, while `frame.start="-22"` with the same length spreads in full.
 */
export function spreadSourceFormat(spread: Element): OrnamentShape {
  if (readAttributeValue(spread, 'frame.offset') !== null) return 'v3';
  for (const name of ['frame.start', 'frameLength']) {
    const text = readAttributeValue(spread, name);
    if (text !== null && /(?:ms|%|ticks)$/.test(text)) return 'v3';
  }
  return 'v2';
}

/** The legacy `@time.unit` fallback for a suffix-less v3 value (D3), ticks otherwise. */
function legacyFallbackDomain(spread: Element): FrameDomain {
  switch (readAttributeValue(spread, 'time.unit')) {
    case 'milliseconds':
      return 'milliseconds';
    case 'relative':
      return 'relative';
    // Absent, and anything unrecognised, mean ticks. `null` is spelled out so that "the
    // attribute is missing" reads as a decision rather than as the bottom of a fallthrough.
    case null:
    default:
      return 'ticks';
  }
}

/** A finite number, or null — AD-42.4's guard, at every numeric read. */
function finiteOr(element: Element, name: string, fallback: number): number | null {
  const text = readAttributeValue(element, name);
  if (text === null) return fallback;
  const value = parseFloat(text);
  return Number.isFinite(value) ? value : null;
}

/** The pool bound and the kind, from `@note.order` as written. */
function classifyNoteOrder(
  noteOrder: string | null,
): { kind: NoteOrderKind; poolBound: number | null } | null {
  if (noteOrder === null) return null;
  const trimmed = noteOrder.trim();
  if (trimmed === 'ascending pitch') return { kind: 'ascending', poolBound: null };
  if (trimmed === 'descending pitch') return { kind: 'descending', poolBound: null };
  // The v3 grammar's brackets are not ids, and their presence is itself the shape gate.
  if (/[[\]|]/.test(trimmed)) return { kind: 'v3-grammar', poolBound: null };
  const ids = trimmed.split(/\s+/).filter((token) => token.length > 0);
  return ids.length === 0 ? null : { kind: 'id-list', poolBound: ids.length };
}

/**
 * `isV3Ornament`'s gate, minus the one clause this layer cannot reach.
 *
 * The renderer tests `od.notes.length > 0` on the PARSED pool, and `OrnamentNote.fromXml`
 * drops a `<note>` it cannot use — a pool of only-unusable notes therefore does not fire the
 * gate there while it does here. The comparison zone may not import `OrnamentNote`, so the
 * divergence is stated rather than hidden; it needs a pool whose every note is malformed,
 * which no corpus document has.
 */
function shapeOf(element: Element, noteOrderKind: NoteOrderKind | null): OrnamentShape {
  if (element.getChildElements('note').toArray().length > 0) return 'v3';
  if (readAttributeValue(element, 'noteid') !== null) return 'v3';
  if (readAttributeValue(element, 'repetitions') !== null) return 'v3';
  return noteOrderKind === 'v3-grammar' ? 'v3' : 'v2';
}

/** Read a def's `<dynamicsGradient>` into the pair the renderer performs. */
function gradientOf(def: Element, scale: number | null): Valued<PerformedGradient> | null {
  const element = def.getChildElements('dynamicsGradient').toArray()[0] as Element | undefined;
  if (element === undefined) return null;
  // `scale` is unusable: every endpoint becomes NaN and the fold writes velocity NaN.
  if (scale === null) return bottom('renderer-error');

  const from = finiteOr(element, 'transition.from', 0);
  // The renderer's own default for a missing `transition.to` is `transition.from`.
  const toText = readAttributeValue(element, 'transition.to');
  const to =
    toText === null ? from : Number.isFinite(parseFloat(toText)) ? parseFloat(toText) : null;
  if (from === null || to === null) return bottom('renderer-error');
  return valued({ from: from * scale, to: to * scale });
}

/** Read a def's `<temporalSpread>` into the frame the renderer performs for THIS shape. */
function spreadOf(def: Element, shape: OrnamentShape): Valued<PerformedSpread> | null {
  const element = def.getChildElements('temporalSpread').toArray()[0] as Element | undefined;
  if (element === undefined) return null;

  const source = spreadSourceFormat(element);
  // The dead cell: a v3 frame on a v2-shaped ornament performs exactly the neutral frame.
  if (source === 'v3' && shape === 'v2') return valued({ ...NEUTRAL_SPREAD, source: 'v3' });

  const intensity = finiteOr(element, 'intensity', 1);
  if (intensity === null) return bottom('renderer-error');

  if (source === 'v2') {
    const frameStart = finiteOr(element, 'frame.start', 0);
    const rawLength = finiteOr(element, 'frameLength', 0);
    // Non-finite either way is a NaN date offset, which erases the note (R24's condition).
    if (frameStart === null || rawLength === null) return bottom('renderer-error');
    return valued({
      frameStart,
      // `setFrameLength` clamps at 0, so a negative length is a rigid shift and not a spread.
      frameLength: Math.max(0, rawLength),
      intensity,
      domain:
        readAttributeValue(element, 'time.unit') === 'milliseconds' ? 'milliseconds' : 'ticks',
      source: 'v2',
    });
  }

  const fallback = legacyFallbackDomain(element);
  const offsetText =
    readAttributeValue(element, 'frame.offset') ?? readAttributeValue(element, 'frame.start');
  const offset = offsetText === null ? null : parseFrameValue(offsetText);
  const lengthText = readAttributeValue(element, 'frameLength');
  const length = lengthText === null ? null : parseFrameValue(lengthText);

  // A malformed v3 value is logged and DEFAULTED by the renderer, never propagated as NaN —
  // `frame.offset` to 0 ticks, `frameLength` to 100% (`temporalSpread.xml:38`, D3).
  const start =
    offset === null || !Number.isFinite(offset.value)
      ? { value: 0, domain: 'ticks' as FrameDomain }
      : { value: offset.value, domain: offset.domain ?? fallback };
  const width =
    length === null || !Number.isFinite(length.value)
      ? { value: 100, domain: 'relative' as FrameDomain }
      : { value: Math.max(0, length.value), domain: length.domain ?? fallback };

  return valued({
    frameStart: start.value,
    frameLength: width.value,
    intensity,
    // The two halves may state different domains; the frame's own domain is its LENGTH's,
    // which is what the layout spreads over. A differing offset domain is reported.
    domain: width.domain,
    source: 'v3',
  });
}

/** A one-note pool performs `transition.to` alone, so the performed ramp is flat at `to`. */
function collapseGradient(
  gradient: Valued<PerformedGradient> | null,
  single: boolean,
): Valued<PerformedGradient> | null {
  if (!single || gradient === null || gradient.kind === 'bottom') return gradient;
  return valued({ from: gradient.value.to, to: gradient.value.to });
}

/** A one-note pool sits at `frameStart + frameLength`, so the performed frame is that shift. */
function collapseSpread(
  spread: Valued<PerformedSpread> | null,
  single: boolean,
): Valued<PerformedSpread> | null {
  if (!single || spread === null || spread.kind === 'bottom') return spread;
  const { frameStart, frameLength, domain, source } = spread.value;
  return valued({
    frameStart: frameStart + frameLength,
    frameLength: 0,
    intensity: 1,
    domain,
    source,
  });
}

/**
 * Read one scope's ornaments, resolved to what they perform.
 *
 * @param scope which slot the map lives in. It is not decoration: the style-carrying rule
 *   differs between the two, and a global map ignores every `<style>` after its first
 *   successful one.
 */
export function readOrnamentAtoms(
  view: OrderedMapView | null,
  scaleFactor: number,
  environment: MpmEnvironment,
  globalEnvironment: MpmEnvironment,
  scope: 'global' | 'part' = 'part',
): OrnamentAtoms {
  assertSpanEndRule(ORNAMENTATION_MAP, 'event');
  if (view === null) return { atoms: [], notes: [] };

  const atoms: OrnamentAtom[] = [];
  const notes: OrnamentAtomNote[] = [];

  // The style is CARRIED across entries, exactly as `OrnamentationMap.apply` carries it —
  // a per-entry lookup gets both scope branches wrong.
  let carried: Element | null = null;

  for (const [index, entry] of view.entries.entries()) {
    const element = entry.element;
    const resolution = resolutionAt(view, index, scaleFactor, environment, globalEnvironment);
    const dateTicks = entry.date * resolution.scaleFactor;

    if (element.getLocalName() === 'style') {
      const found =
        findStyleDef(
          ORNAMENTATION_STYLE,
          readAttributeValue(element, 'name.ref') ?? '',
          resolution.environment,
          resolution.globalEnvironment,
        )?.styleDef ?? null;

      if (scope === 'part') {
        if (found === null && carried !== null)
          notes.push({
            kind: 'style-switch-cancels',
            dateTicks,
            detail:
              'a <style> naming no ornamentationStyle CLEARS the carried style in a part-local ' +
              'map, because the local-header lookup assigns its null result over it — every ' +
              'later ornament is skipped. Measured; a global map keeps the old style instead.',
          });
        carried = found;
      } else if (carried === null) {
        carried = found;
      } else {
        notes.push({
          kind: 'style-switch-ignored',
          dateTicks,
          detail:
            'in a map under <global> every <style> after the first successful one is IGNORED — ' +
            'the only lookup a global map can reach is guarded by `style === null`. Measured: ' +
            'switching S -> T leaves T’s ornaments performing S’s gradient.',
        });
      }
      continue;
    }

    if (element.getLocalName() !== 'ornament') continue;

    if (carried === null) {
      notes.push({
        kind: 'no-style-in-scope',
        dateTicks,
        detail:
          'no ornamentationStyle in scope — an ornament before the map’s first <style> switch: ' +
          'the style is tracked while walking, so the def cannot resolve and NOTHING is ' +
          'performed. Contrast §5.5, where an atom’s inline modifiers survive.',
      });
      continue;
    }

    const nameRef = readAttributeValue(element, 'name.ref');
    let def: Element | null = null;
    if (nameRef !== null)
      for (const candidate of carried.getChildElements('ornamentDef').toArray())
        if (attribute('name', candidate)?.getValue() === nameRef) def = candidate;

    if (def === null) {
      notes.push({
        kind: 'unresolved-def',
        dateTicks,
        detail:
          nameRef === null
            ? 'an <ornament> with no @name.ref: the renderer skips it, nothing is performed'
            : `no <ornamentDef name="${nameRef}"> in the style in scope: nothing is performed`,
      });
      continue;
    }

    const noteOrder = readAttributeValue(element, 'note.order');
    const order = classifyNoteOrder(noteOrder);
    const shape = shapeOf(element, order?.kind ?? null);

    // A v3-shaped ornament with no @note.order has no sequence to play and is skipped whole
    // (`prepareOrnament:240-245`), so it contributes no atom — it performs nothing at all.
    if (shape === 'v3' && noteOrder === null) {
      notes.push({
        kind: 'v3-shape-skipped',
        dateTicks,
        detail:
          'a <note> pool, @noteid or a PRESENT @repetitions takes the ornament onto the v3 ' +
          'engine, which skips it outright when it has no @note.order. Measured: adding ' +
          'repetitions="0" — the schema default — takes this ornament from 80/100/120 to ' +
          '100/100/100. Nothing is performed, so no atom is emitted.',
      });
      continue;
    }
    if (shape === 'v3')
      notes.push({
        kind: 'v3-shape',
        dateTicks,
        detail:
          'v3-shaped: the ornament GENERATES notes through ornamentInstantiation rather than ' +
          'modifying the pool in place. Its rows are compared (§5.6); the generated notes are ' +
          'not — they carry per-render random ids (R5b). A % frame is resolved against the ' +
          'principal note here, which needs the MSM.',
      });

    const scale = finiteOr(element, 'scale', DEFAULT_ORNAMENT_SCALE);
    if (scale === null)
      notes.push({
        kind: 'scale-unusable',
        dateTicks,
        detail:
          'an unusable @scale makes ornament.dynamics NaN and the fold writes velocity NaN onto ' +
          'every note in the pool — measured. The notes vanish from the MIDI export, which is ' +
          'R24’s condition, so the gradient reads ⊥ (AD-1/AD-33.1) rather than being skipped.',
      });

    // A pool of exactly one collapses BOTH families, and collapsing them here is what makes
    // the comparison an encoding-invariant one (AD-40.2). `DynamicsGradient.apply` hands a lone
    // chord `transitionTo·scale` and never looks at `transitionFrom`, so the performed ramp is
    // flat at `to`; `TemporalSpread.apply` places a lone chord at `frameStart + frameLength`
    // outside its loop, so the performed frame is a rigid shift by the far edge and `@intensity`
    // is inert. Both are pinned against the renderer.
    const single = order?.poolBound === 1;
    const gradient = collapseGradient(gradientOf(def, scale), single);
    const spread = collapseSpread(spreadOf(def, shape), single);

    if (gradient !== null && scale === 0)
      notes.push({
        kind: 'scale-zero',
        dateTicks,
        detail:
          'the def carries a <dynamicsGradient> and the ornament has no @scale (it defaults to ' +
          '0.0), so the gradient performs NOTHING while the temporal spread applies in full — ' +
          'AD-40.1, executed.',
      });
    if (spread !== null && spread.kind === 'bottom')
      notes.push({
        kind: 'frame-unusable',
        dateTicks,
        detail:
          'an unusable v2 frame value makes ornament.date.offset NaN and the fold writes ' +
          'date.perf NaN — measured. R24’s condition again, so the frame reads ⊥. A v3 frame ' +
          'value cannot reach this: its reader logs and applies the v3 default.',
      });
    if (
      spread !== null &&
      spread.kind === 'value' &&
      spread.value.source === 'v3' &&
      shape === 'v2'
    )
      notes.push({
        kind: 'frame-inert-v3',
        dateTicks,
        detail:
          'the def’s <temporalSpread> is v3-sourced (@frame.offset, or a unit suffix on either ' +
          'frame attribute) while the ornament is v2-shaped, so TemporalSpread.apply reads the ' +
          'v2 fields at their 0.0 initialisers and SPREADS NOTHING — the renderer logs this ' +
          'itself. Compared as the neutral frame, which is what it performs.',
      });

    const repetitionsText = readAttributeValue(element, 'repetitions');
    let repetitions = 0;
    if (repetitionsText !== null) {
      const parsed = parseFloat(repetitionsText);
      // `parseOrnamentRepetitions` logs and returns 0 for anything unusable or below -1.
      if (!Number.isFinite(parsed) || parsed < -1) {
        notes.push({
          kind: 'repetitions-unusable',
          dateTicks,
          detail: `repetitions="${repetitionsText}" is no usable repeat count; the renderer logs and uses 0`,
        });
      } else repetitions = parsed;
    }

    if (order === null || order.poolBound === null)
      notes.push({
        kind: 'pool-size-unknown',
        dateTicks,
        detail:
          'the pool is "every note at this date", which needs an MSM to size: @transition.from ' +
          'is live only for a pool of MORE THAN ONE chord, and a single-note pool performs ' +
          '@transition.to alone (AD-40.3). Both endpoints are priced here, which is the ' +
          'conservative direction.',
      });

    atoms.push({
      dateTicks,
      id: attribute('id', element)?.getValue() ?? null,
      nameRef,
      shape,
      scale: scale ?? DEFAULT_ORNAMENT_SCALE,
      noteOrder,
      noteOrderKind: order?.kind ?? null,
      poolBound: order?.poolBound ?? null,
      repetitions,
      repetitionsPresent: repetitionsText !== null,
      gradient,
      spread,
    });
  }

  return { atoms, notes };
}
