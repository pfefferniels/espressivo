/**
 * Ornament atoms and their RESOLVED PERFORMED EFFECT — DESIGN.md §5.6, as ruled by AD-40.
 *
 * The named principle for this wave (AD-40.2, generalizing AD-37.3): **price the resolved
 * performed effect, never the attribute tuple.** `<ornament>@scale` multiplies both endpoints
 * of the `<dynamicsGradient>` before anything is performed, so the compared object is the pair
 * `(from·scale, to·scale)` and `@scale` is not independently priced — two encodings of one
 * performed ramp (`from="-20" scale="1"` against `from="-10" scale="2"`) are the same
 * performance and must compare equal.
 *
 * ## `@scale` defaults to 0 and gates HALF the ornament (AD-40.1)
 *
 * `OrnamentData.ts:121` initialises `scale = 0.0`, and `DynamicsGradient.apply` multiplies both
 * endpoints by it — so an `<ornament>` with no `@scale` performs **no dynamics at all** while
 * its `<temporalSpread>` applies in full. Measured on three notes at one date with a def
 * carrying `transition.from="-20" transition.to="20"`: `ornament.dynamics` is `0, 0, 0` without
 * `@scale` and `−20, 0, +20` with `scale="1.0"`, while the same ornament's spread moves the
 * notes to `−120, 0, +120` either way.
 *
 * **Contrast §5.4**, where `accentuationPattern@scale` is MANDATORY: absent, the whole
 * instruction is skipped. Same attribute name, two sections, two dispositions — which is why
 * both sections now cross-reference each other, as §5.4 and §5.5 do for unresolvable names.
 *
 * ## The ramp distributes over the POOL, not over score time (AD-40.3)
 *
 * The pool is the notes at the ornament's own date, or the ids `@note.order` names. The
 * gradient takes one step per chord across that pool: with the pool's notes at 0, 360 and 720
 * only the note sharing the ornament's date is touched at all. And a **single-note pool
 * performs `transition.to`** — `DynamicsGradient.ts:47-49`'s `else if` branch hands the lone
 * chord `transitionTo · scale`, measured at 20 from a `−20 → +20` gradient. A reader
 * implementing "interpolate across the pool" writes the start value or an average there and is
 * wrong in both cases.
 *
 * Without an MSM the pool size is knowable only from an explicit `@note.order` id list, so
 * {@link OrnamentAtom.poolSize} is null otherwise and both endpoints are priced. That is the
 * conservative direction: assuming a single-note pool would silently drop `@transition.from`
 * from the comparison for every ornament in the corpus.
 *
 * ## A GLOBAL `ornamentationMap` performs NOTHING AT ALL
 *
 * `renderOrnamentationToMap` gates the whole application on `getLocalHeader() !== null`, and
 * `Dated.addMap:94-97` binds `localHeader = this.part === null ? null : this.part.getHeader()`
 * — so a map living in `<global>` has a null local header by construction and its ornaments are
 * never applied. Measured, with the styles in the global header either way: the same ornament
 * writes `ornament.dynamics` `−20 / 0 / +20` from a part and `null / null / null` from
 * `<global>`. A part-local map works whether its styles sit in the part header or the global
 * one; only the map's own scope decides.
 *
 * This reader therefore returns **no atoms** for a global scope, because no atom is performed
 * there. It is reported (`global-scope-inert`) rather than silently empty, and it is flagged
 * upstream as a possible PORT BUG rather than a design intent: the inner `apply` tests
 * `localHeader === null && globalHeader === null`, which is the check the outer gate looks like
 * it meant to make. If the Java reference applies global ornamentation maps, this belongs in
 * PARITY.md and the comparison should follow the reference instead.
 *
 * ## An ornament before the map's first `<style>` is skipped entirely
 *
 * The style is tracked *while walking* (`OrnamentationMap.apply`), so an ornament with no style
 * in scope cannot resolve its def and performs nothing — §5.4's disposition, and the **opposite
 * of §5.5's**, where an atom's inline modifiers survive an unresolvable name. An ornament naming
 * an unknown def likewise performs nothing; both were executed.
 */
import type { Element } from '../xml/XomTypes.js';
import { attribute } from '../xml/tree.js';
import { ORNAMENTATION_MAP, ORNAMENTATION_STYLE } from '../mpm/names.js';
import { readAttributeValue } from '../expression/attributes.js';
import { findStyleDef } from '../expression/styleScope.js';
import type { MpmEnvironment } from '../expression/mpmTree.js';
import { assertSpanEndRule } from './spanEnds.js';
import type { OrderedMapView } from './document.js';

/** `OrnamentData.ts:121` — and the reason half an unscaled ornament is inert. */
export const DEFAULT_ORNAMENT_SCALE = 0;

/** The performed dynamics ramp: both endpoints already multiplied by `@scale` (AD-40.2). */
export interface PerformedGradient {
  readonly from: number;
  readonly to: number;
}

/** The performed temporal frame, in whichever domain `@time.unit` selects. */
export interface PerformedSpread {
  /** `@frame.start`, or the v3 `@frame.offset` that supersedes it. */
  readonly frameStart: number;
  readonly frameLength: number;
  readonly intensity: number;
  /** True where `@time.unit="milliseconds"` moves the frame out of the tick domain. */
  readonly milliseconds: boolean;
  /** True where the def used the v3 `@frame.offset` spelling, which is a structural marker. */
  readonly v3Offset: boolean;
}

export interface OrnamentAtom {
  readonly dateTicks: number;
  /** `xml:id`, the aligner's identity pin. */
  readonly id: string | null;
  readonly nameRef: string | null;
  /** `@scale`, defaulting to 0 — carried for the report, never priced on its own (AD-40.2). */
  readonly scale: number;
  /** `@note.order` exactly as written, or null. */
  readonly noteOrder: string | null;
  /** The number of ids `@note.order` names, or null where the pool needs an MSM to size. */
  readonly poolSize: number | null;
  /** `@repetitions`; the group plays `repetitions + 1` times (D9). */
  readonly repetitions: number;
  /** Null where the def carries no `<dynamicsGradient>`, or where nothing is performed. */
  readonly gradient: PerformedGradient | null;
  readonly spread: PerformedSpread | null;
}

export interface OrnamentAtomNote {
  readonly kind:
    | 'global-scope-inert'
    | 'no-style-in-scope'
    | 'unresolved-def'
    | 'scale-zero'
    | 'pool-size-unknown';
  readonly dateTicks: number;
  readonly detail: string;
}

export interface OrnamentAtoms {
  readonly atoms: readonly OrnamentAtom[];
  readonly notes: readonly OrnamentAtomNote[];
}

/** An `@note.order` that is an explicit id list, as its ids — else null. */
function idListOf(noteOrder: string | null): readonly string[] | null {
  if (noteOrder === null) return null;
  const trimmed = noteOrder.trim();
  // The two enumerated orderings are not a pool; anything else is a list of ids, possibly
  // carrying the v3 `|: … :|` repeat grouping, whose brackets are not ids.
  if (trimmed === 'ascending pitch' || trimmed === 'descending pitch') return null;
  const ids = trimmed
    .split(/[\s,]+/)
    .filter((token) => token.length > 0 && token !== '|:' && token !== ':|');
  return ids.length === 0 ? null : ids;
}

function numberOr(element: Element, name: string, fallback: number): number {
  const text = readAttributeValue(element, name);
  return text === null ? fallback : parseFloat(text);
}

/** Read a def's `<temporalSpread>` into the frame the renderer performs. */
function spreadOf(def: Element): PerformedSpread | null {
  const spread = def.getChildElements('temporalSpread').toArray()[0] as Element | undefined;
  if (spread === undefined) return null;

  // v3's @frame.offset supersedes @frame.start and is itself the marker that makes the whole
  // element v3 (TemporalSpread.ts:113) — a structural difference as well as a numeric one.
  const offsetText = readAttributeValue(spread, 'frame.offset');
  return {
    frameStart: offsetText === null ? numberOr(spread, 'frame.start', 0) : parseFloat(offsetText),
    frameLength: numberOr(spread, 'frameLength', 0),
    intensity: numberOr(spread, 'intensity', 1),
    milliseconds: readAttributeValue(spread, 'time.unit') === 'milliseconds',
    v3Offset: offsetText !== null,
  };
}

/**
 * Read one scope's ornaments, resolved to what they perform.
 *
 * The style is tracked while walking, exactly as `OrnamentationMap.apply` tracks it, because
 * that is what makes an ornament before the first `<style>` unresolvable rather than merely
 * unstyled.
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

  // The scope gate, before anything is read: a global map's ornaments are never applied.
  if (scope === 'global')
    return {
      atoms: [],
      notes: [
        {
          kind: 'global-scope-inert',
          dateTicks: 0,
          detail:
            'an ornamentationMap in <global> has a null LOCAL header by construction ' +
            '(Dated.addMap:94-97), and renderOrnamentationToMap gates the whole application on ' +
            'that header being non-null — so not one of its ornaments is performed. Measured ' +
            'against a part-local map with identical content and styles. Reported as a ' +
            'possible port bug rather than modelled as intent.',
        },
      ],
    };

  const atoms: OrnamentAtom[] = [];
  const notes: OrnamentAtomNote[] = [];

  for (const [index, entry] of view.entries.entries()) {
    const element = entry.element;
    if (element.getLocalName() !== 'ornament') continue;

    const dateTicks = entry.date * scaleFactor;
    const nameRef = readAttributeValue(element, 'name.ref');
    const style = findStyleDef(
      ORNAMENTATION_STYLE,
      view.styleNames[index],
      environment,
      globalEnvironment,
    );

    // No style in scope: the walk never binds one, so the def cannot resolve and the ornament
    // performs nothing at all — §5.4's disposition, not §5.5's.
    if (style === null) {
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

    let def: Element | null = null;
    if (nameRef !== null)
      for (const candidate of style.styleDef.getChildElements('ornamentDef').toArray())
        if (attribute('name', candidate)?.getValue() === nameRef) def = candidate;

    if (def === null) {
      notes.push({
        kind: 'unresolved-def',
        dateTicks,
        detail: `no <ornamentDef name="${String(nameRef)}"> in the style in scope: nothing is performed`,
      });
      continue;
    }

    const scale = numberOr(element, 'scale', DEFAULT_ORNAMENT_SCALE);
    const noteOrder = readAttributeValue(element, 'note.order');
    const ids = idListOf(noteOrder);

    const gradientElement = def.getChildElements('dynamicsGradient').toArray()[0] as
      Element | undefined;
    // AD-40.2: resolve the performed pair here, so that nothing downstream can price @scale
    // as a quantity of its own.
    const gradient =
      gradientElement === undefined
        ? null
        : {
            from: numberOr(gradientElement, 'transition.from', 0) * scale,
            to: numberOr(gradientElement, 'transition.to', 0) * scale,
          };

    if (gradientElement !== undefined && scale === 0)
      notes.push({
        kind: 'scale-zero',
        dateTicks,
        detail:
          'the def carries a <dynamicsGradient> and the ornament has no usable @scale (it ' +
          'defaults to 0.0), so the gradient performs NOTHING while the temporal spread ' +
          'applies in full — AD-40.1, executed',
      });

    if (ids === null)
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
      scale,
      noteOrder,
      poolSize: ids === null ? null : ids.length,
      repetitions: numberOr(element, 'repetitions', 0),
      gradient,
      spread: spreadOf(def),
    });
  }

  return { atoms, notes };
}
