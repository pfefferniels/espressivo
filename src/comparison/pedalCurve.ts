/**
 * The pedal (movement) curve.
 *
 * The compared object is the controller position on [0,1] as a function of score time:
 * `position(t)`, in `ratio` units, evaluated on the ideal Bézier (the rule 3) exactly as
 * the dynamics curve is. `<movement>` and `<dynamics>` share `bezier.ts` and share nothing
 * else — different defaults, different span rules, different neutral, different failure modes.
 *
 * ## The timeline is emitted events, and an emitted event HOLDS
 *
 * `renderMovementToMap` does not annotate notes; it builds a `positionMap` of `<position>`
 * elements and `Msm.parsePositionMap:1422-1454` turns every one into a MIDI control change — no
 * thinning, no reset. A control change persists until the next one on the same controller, so
 * the performed position at `t` is the value of the last event at or before `t`. Three
 * consequences:
 *
 * - Before the first event the pedal is up (`0`), because no controller value has been sent and
 *   the MIDI default for CC 64/67 is 0. That is also why the neutral for an absent
 *   `movementMap` is 0 rather than a left extension of the first movement.
 * - After the last rendered span the last emitted value HOLDS to the end of the window — its
 *   `@transition.to`, or its `@position` on a constant movement. Modelling the tail as 0 would
 *   claim a pedal lift the performance never makes.
 * - A skipped movement leaves a hold, not a gap. `getEndDate:153-159` scans for the next element
 *   named `movement` whether or not that movement parses, so the previous span still ends there
 *   while nothing new is emitted. Executed: a constant `position="1.0"` at 0, an unreadable
 *   movement at 360 and a transition at 720 emit events at 0 and then not again until 720.
 *
 * the design states none of the above; it is this module's reading. What it does state — the flat
 * span structure, the last movement's exclusion, curvature's 0.4 default, the inheritance of a
 * missing `@position` — is implemented verbatim below with its citations.
 *
 * ## The exclusion is by ENTRY INDEX, and a trailing `<style>` resurrects a movement
 *
 * ```ts
 * // MovementMap.renderMovementToMap:173-183
 * for (let movementIndex = 0; movementIndex < this.size(); ++movementIndex) {
 *   const md = this.getMovementDataOf(movementIndex);
 *   if (md === null) continue;
 *   if (movementMap !== null && movementIndex < this.size() - 1 && md.startDate >= 0) { ... }
 * ```
 *
 * `size()` counts every entry, `<style>` switches included, so the guard excludes the last ENTRY
 * and not the last movement. Put any entry after the last `<movement>` — a trailing `<style>` —
 * and the last movement is inside the guard and renders, with `getEndDate` returning
 * `Number.MAX_VALUE` because there is no next movement to find. Measured on two movements
 * `1.0 → 0.0` at 0 and `0.5 → 0.0` at 720: 17 events over [0, 720] without the trailing style,
 * 26 events over [0, 1.798·10³⁰⁸] with it. A LEADING `<style>`, or one between the two
 * movements, changes nothing.
 *
 * the design rules all three readings: (a) the exclusion is by entry index, renderer-exact; (b) the
 * resurrected span is a real performed transition, bounded by the comparison window since every
 * integral runs over `[start, end]`; (c) the contrast paragraph gains a third state — the
 * span exists AND is unbounded. Over any real window the resurrected transition sits at
 * `u ≈ 10⁻³⁰⁵`, i.e. flat at `@position`, which is the trailing-tempo behaviour by a
 * different route.
 *
 * ## `⊥` here is the non-monotone date component
 *
 * `<movement>` has no clamps — `resolveMovement` takes `@curvature`/`@protraction` and uses
 * them, where `DynamicsMap.ts:170-181` clamps to `[0,1]` and `[−1,1]`. Out of those ranges the
 * inner control points leave the unit square, `x(t)` stops being monotone, and the sampler emits
 * events whose dates go backwards: there is no `date ↦ position` function to compare, so the
 * rule takes the span with it. A floor on the damage rather than an exact account — a
 * non-monotone `x` can also place events outside the span entirely, which the ⊥ span does not
 * model.
 *
 * Position values are a different case: `EventMaker.createControlChange:530-544` clamps the
 * controller value into 0..127, so a `@position` outside [0,1] is performed at the bound and
 * compares as what is performed (the "resolved" — the renderer's repair happens before the
 * domain test). The smoothstep's value fraction stays in [0,1], so clamping the two endpoints
 * clamps the whole curve.
 */
import {
  elementAtOrNull,
  filterMap,
  findLast,
  head,
  isNonEmpty,
  upperBoundBy,
  withNext,
  type NonEmptyArray,
} from '../prelude/index.js';
import { coveringSegmentAt } from './segments.js';
import type { Element } from '../xml/XomTypes.js';
import { innerControlPointsXPositions } from '../mpm/elements/maps/data/bezier.js';
import { readAttributeValue } from '../expression/attributes.js';
import { MOVEMENT_MAP } from '../mpm/names.js';
import { assertSpanEndRule } from './spanEnds.js';
import { idealCurveParameter } from './dynamicsCurve.js';
import { bottom, valued, type Valued } from './values.js';
import { entryTicksAt, type OrderedMapView } from './document.js';

/** No controller event has been sent yet: the pedal is up (MIDI's CC default). */
export const PEDAL_NEUTRAL_POSITION = 0;

/** `data/movement.ts` — 0.4, and deliberately not `<dynamics>`'s 0.0. */
export const DEFAULT_MOVEMENT_CURVATURE = 0.4;
/** `data/movement.ts`. */
export const DEFAULT_MOVEMENT_PROTRACTION = 0;

/** The renderer's own `getEndDate` sentinel for "no next movement" (`MovementMap.ts:158`). */
export const UNBOUNDED_END_TICKS = Number.MAX_VALUE;

/** `'sustain'` — `data/movement.ts`, and the only value the MIDI export maps to CC 64. */
export const DEFAULT_CONTROLLER = 'sustain';

/** The two controller names `Msm.parsePositionMap:1445-1449` knows; everything else is CC 0. */
export const MAPPED_CONTROLLERS: readonly string[] = ['sustain', 'soft'];

/** What a span performs, once the reader has resolved it. */
export type PedalShape =
  | { readonly kind: 'constant'; readonly position: number }
  | {
      readonly kind: 'bezier';
      readonly from: number;
      readonly to: number;
      /** x-positions of the two inner control points, already derived. */
      readonly x1: number;
      readonly x2: number;
    };

/** Where a segment came from — which is what makes the hold rule auditable. */
export type PedalSegmentSource =
  /** A rendered `<movement>`: its own span. */
  | 'movement'
  /** No event was emitted here; the last one holds. */
  | 'hold'
  /** Before the first event of the map: the pedal has never been pressed. */
  | 'lead-in';

export interface PedalSegment {
  readonly startTicks: number;
  readonly endTicks: number;
  readonly controller: string;
  readonly source: PedalSegmentSource;
  /** `⊥` where the renderer performs no `date ↦ position` function at all. */
  readonly shape: Valued<PedalShape>;
}

export interface PedalCurveNote {
  readonly kind:
    | 'renderer-error'
    | 'renderer-skip'
    | 'trailing-movement'
    | 'resurrected-movement'
    | 'inherited-position'
    | 'clamped-position'
    | 'foreign-controller';
  readonly dateTicks: number;
  readonly detail: string;
}

export interface PedalCurve {
  readonly segments: readonly PedalSegment[];
  readonly breakpointsTicks: readonly number[];
  readonly notes: readonly PedalCurveNote[];
  /** Every controller name the map drives, in first-appearance order (the structural channel). */
  readonly controllers: readonly string[];
}

/** The neutral pedal curve: up everywhere, which an absent `movementMap` performs. */
export function neutralPedalCurve(): PedalCurve {
  return {
    segments: [
      {
        startTicks: 0,
        endTicks: Number.POSITIVE_INFINITY,
        controller: DEFAULT_CONTROLLER,
        source: 'lead-in',
        shape: { kind: 'value', value: { kind: 'constant', position: PEDAL_NEUTRAL_POSITION } },
      },
    ],
    breakpointsTicks: [0],
    notes: [],
    controllers: [],
  };
}

/** `EventMaker.createControlChange:536`'s clamp, in the normalized 0..1 domain. */
function clampPosition(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/** One `<movement>` as the renderer reads it, before the timeline is assembled. */
interface RawMovement {
  readonly dateTicks: number;
  readonly endTicks: number;
  /** Already clamped into [0,1]; `NaN` where the attribute is present but unparseable. */
  readonly position: number;
  /** `null` where `@transition.to` is ABSENT — a constant movement — and `NaN` where it is
   *  present and unparseable, which is a transition towards nothing. */
  readonly transitionTo: number | null;
  readonly curvature: number;
  readonly protraction: number;
  readonly controller: string;
}

/**
 * `MovementMap.getPreviousPosition:163-172`, transliterated.
 *
 * The scan is over ENTRY indices and takes the nearest entry named `movement`, so a `<style>`
 * sitting between two movements is stepped over rather than inherited from — which is why the
 * reader below walks entry indices and not a filtered movement list.
 *
 * @returns the inherited position, 0 where no `<movement>` precedes this one, or null where the
 *   predecessor carries no `@transition.to`, which makes `getMovementDataOf` log and return null
 *   and drops the movement entirely.
 */
function inheritedPosition(entries: OrderedMapView['entries'], index: number): number | null {
  const previous = findLast(
    entries.slice(0, index),
    (entry) => entry.element.getLocalName() === 'movement',
  );
  if (previous === null) return 0;
  const transitionTo = readAttributeValue(previous.element, 'transition.to');
  return transitionTo === null ? null : parseFloat(transitionTo);
}

/**
 * The positions of the entries named `movement`, ascending — `getEndDate:153-159`'s look-ahead
 * for the whole map, computed once.
 *
 * The scan runs once per movement, unconditionally, so a per-movement `entries.slice(index +
 * 1).find(…)` makes the reader quadratic in time and allocation, and the `findIndex` that
 * removes the copy is slower still — the same trade `tempoCurve`'s `valid` list makes, with the
 * measured figures recorded there.
 */
function movementPositions(entries: OrderedMapView['entries']): readonly number[] {
  return filterMap(entries, (entry, index) =>
    entry.element.getLocalName() === 'movement' ? index : null,
  );
}

/** `MovementMap.getEndDate:153-159` — the next entry named `movement`, else `MAX_VALUE`. */
function endTicksOf(
  view: OrderedMapView,
  movements: readonly number[],
  index: number,
  scaleFactor: number,
): number {
  // `movements` ascends, so "the first movement entry strictly after `index`" is `upperBoundBy`.
  const next = elementAtOrNull(
    movements,
    upperBoundBy(movements, (at) => at, index),
  );
  return next === null ? UNBOUNDED_END_TICKS : entryTicksAt(view, next, scaleFactor);
}

/**
 * Build the performed pedal curve of one scope.
 *
 * Span ends follow the same-local-name rule (`getEndDate:153-159` tests for `movement`), so a
 * `<style>` between two movements is transparent to the span — while a `<style>` after the last
 * movement is not transparent to the render guard, which is the whole subject.
 *
 * Spans are flat, not per-controller: the scan has no `@controller` test, so a `soft`
 * movement ends a `sustain` span. Executed — a sustain transition at 0 and a soft movement at
 * 360 stop the sustain events at 360. Per-controller curves, the natural encoding, would compute
 * a sustain gesture the renderer never performs whenever two pedals interleave.
 */
export function readMovementSegments(view: OrderedMapView | null, scaleFactor: number): PedalCurve {
  assertSpanEndRule(MOVEMENT_MAP, 'same-local-name');
  if (view === null) return neutralPedalCurve();

  const entries = view.entries;
  const movements = movementPositions(entries);
  const notes: PedalCurveNote[] = [];
  const controllers: string[] = [];
  const raws: RawMovement[] = [];

  for (const [index, entry] of entries.entries()) {
    const element: Element = entry.element;
    if (element.getLocalName() !== 'movement') continue;

    const controller = readAttributeValue(element, 'controller') ?? DEFAULT_CONTROLLER;
    const dateTicks = entryTicksAt(view, index, scaleFactor);

    // The guard is `movementIndex < size() - 1` over ENTRIES, so what excludes a
    // movement is being the last entry — not being the last movement.
    if (index === entries.length - 1) {
      notes.push({
        kind: 'trailing-movement',
        dateTicks,
        detail:
          'last ENTRY of the map: renderMovementToMap:173-183 never enters the render for it, ' +
          'so it contributes no span at all and its own position is never performed. ' +
          'A movementMap with a single <movement> renders zero controller events.',
      });
      continue;
    }

    if (!Number.isFinite(entry.date) || dateTicks < 0) {
      notes.push({
        kind: 'renderer-skip',
        dateTicks,
        detail:
          'negative or unparseable @date: the render guard is `md.startDate >= 0`, which a ' +
          'NaN date also fails, so the movement is skipped and the previous value holds',
      });
      continue;
    }

    const positionText = readAttributeValue(element, 'position');
    let position: number;
    if (positionText === null) {
      const fallback = inheritedPosition(entries, index);
      if (fallback === null) {
        notes.push({
          kind: 'renderer-skip',
          dateTicks,
          detail:
            'no @position and the preceding movement has no @transition.to to inherit one ' +
            'from: getMovementDataOf logs and returns null, and the movement is dropped ' +
            '(MovementMap.ts:124-133). Java throws a NullPointerException here instead and ' +
            'aborts the whole render — see PARITY.md P2.',
        });
        continue;
      }
      position = fallback;
      notes.push({
        kind: 'inherited-position',
        dateTicks,
        detail:
          `no @position: inherited ${String(fallback)} from the nearest preceding <movement>, ` +
          'the scan stepping over any entry that is not one (MovementMap.ts:163-172)',
      });
    } else {
      position = parseFloat(positionText);
    }

    const transitionToText = readAttributeValue(element, 'transition.to');
    const transitionTo = transitionToText === null ? null : parseFloat(transitionToText);

    const clampedPosition = clampPosition(position);
    const clampedTransitionTo = transitionTo === null ? null : clampPosition(transitionTo);
    // Only a value the clamp actually MOVED is a note; a NaN is not clamped but ⊥, and
    // `NaN !== NaN` would otherwise report it here as well.
    const wasClamped = (raw: number | null): boolean =>
      raw !== null && Number.isFinite(raw) && clampPosition(raw) !== raw;
    if (wasClamped(position) || wasClamped(transitionTo))
      notes.push({
        kind: 'clamped-position',
        dateTicks,
        detail:
          'a position outside [0,1]: the MIDI export clamps the controller value into 0..127 ' +
          '(EventMaker.ts:536), so the span performs at the bound and compares as performed',
      });

    if (!controllers.includes(controller)) controllers.push(controller);

    if (!MAPPED_CONTROLLERS.includes(controller))
      notes.push({
        kind: 'foreign-controller',
        dateTicks,
        detail:
          `@controller="${controller}": Msm.parsePositionMap:1445-1449 maps only "sustain" and ` +
          '"soft", and every other name falls through to controller number 0 — BANK SELECT, ' +
          'not a pedal. A structural finding, never a curve difference.',
      });

    raws.push({
      dateTicks,
      endTicks: endTicksOf(view, movements, index, scaleFactor),
      position: clampedPosition,
      transitionTo: clampedTransitionTo,
      curvature: readNumericOr(element, 'curvature', DEFAULT_MOVEMENT_CURVATURE),
      protraction: readNumericOr(element, 'protraction', DEFAULT_MOVEMENT_PROTRACTION),
      controller,
    });
  }

  if (!isNonEmpty(raws)) return { ...neutralPedalCurve(), notes, controllers };

  return assembleTimeline(raws, notes, controllers);
}

/** An attribute's number, or the renderer's field default where it is absent. */
function readNumericOr(element: Element, name: string, fallback: number): number {
  const text = readAttributeValue(element, name);
  return text === null ? fallback : parseFloat(text);
}

/**
 * Turn the rendered movements into a total timeline: lead-in, spans, holds.
 *
 * The hold makes the dimension total over the window without a special case at either edge.
 * Its value is the *end* value of the span before it — `@transition.to` on a transition,
 * `@position` on a constant movement, and `⊥` after a `⊥` span, whose emitted events are the
 * ones whose dates cannot be trusted.
 */
function assembleTimeline(
  // NON-EMPTY, the caller's own guard promoted to the signature: the lead-in below reads the
  // first movement three times, and every one of those reads is then total.
  raws: NonEmptyArray<RawMovement>,
  notes: PedalCurveNote[],
  controllers: readonly string[],
): PedalCurve {
  const segments: PedalSegment[] = [];
  const breakpoints = new Set<number>([0]);

  const lead = head(raws);
  if (lead.dateTicks > 0)
    segments.push({
      startTicks: 0,
      endTicks: lead.dateTicks,
      controller: lead.controller,
      source: 'lead-in',
      shape: valued({ kind: 'constant', position: PEDAL_NEUTRAL_POSITION }),
    });

  // Each movement with its successor, `null` for the last — so "there is no next one" is a
  // value rather than an out-of-range read. `pairwise` cannot serve: it drops the last entry,
  // and the last movement is a span too.
  for (const [raw, next] of withNext(raws)) {
    breakpoints.add(raw.dateTicks);
    const shape = shapeOf(raw, notes);
    segments.push({
      startTicks: raw.dateTicks,
      endTicks: raw.endTicks,
      controller: raw.controller,
      source: 'movement',
      shape,
    });

    // Only a resurrected movement can carry the sentinel: a movement with no later movement
    // entry is normally the last ENTRY too, and is excluded before it reaches this list.
    if (raw.endTicks === UNBOUNDED_END_TICKS) {
      notes.push({
        kind: 'resurrected-movement',
        dateTicks: raw.dateTicks,
        detail:
          'an entry after the last <movement> — a trailing <style>, typically — moves the ' +
          '`movementIndex < size() - 1` guard past this movement, so it renders with ' +
          'getEndDate = Number.MAX_VALUE: a real performed transition, bounded by ' +
          'the comparison window; over any real window it sits at u ~ 1e-305, i.e. flat at ' +
          '@position, which is the same outcome by a different route.',
      });
      continue;
    }

    // The hold between this span's end and the next rendered span's start. `raws` is in entry
    // order and entries are date-ordered, so `next.dateTicks >= raw.endTicks` always; the two
    // are equal for consecutive movements, and the hold is then zero-width and not emitted.
    const holdEnd = next?.dateTicks ?? Number.POSITIVE_INFINITY;
    if (holdEnd > raw.endTicks) {
      breakpoints.add(raw.endTicks);
      segments.push({
        startTicks: raw.endTicks,
        endTicks: holdEnd,
        controller: raw.controller,
        source: 'hold',
        shape: endValueOf(shape),
      });
    }
  }

  return {
    segments,
    breakpointsTicks: [...breakpoints].sort((a, b) => a - b),
    notes,
    controllers,
  };
}

/** The performed shape of one movement, or `⊥` where the renderer performs no function. */
function shapeOf(raw: RawMovement, notes: PedalCurveNote[]): Valued<PedalShape> {
  if (!Number.isFinite(raw.position)) {
    notes.push({
      kind: 'renderer-error',
      dateTicks: raw.dateTicks,
      detail:
        'an unparseable @position: parseFloat gives NaN, every sampled value is NaN and the ' +
        'clamp in the MIDI export cannot repair it — the span reads ⊥',
    });
    return bottom('renderer-error');
  }

  if (raw.transitionTo === null) return valued({ kind: 'constant', position: raw.position });

  if (!Number.isFinite(raw.transitionTo)) {
    notes.push({
      kind: 'renderer-error',
      dateTicks: raw.dateTicks,
      detail:
        'an unparseable @transition.to: the movement is NOT constant — isConstantMovement ' +
        'tests for null, not for NaN (data/movement.ts) — so it transitions towards NaN ' +
        'and every sampled value after the first is NaN. The span reads ⊥.',
    });
    return bottom('renderer-error');
  }

  // the domain gate, lifted to the span. <movement> has no clamps of its own, so an
  // out-of-range control point makes x(t) non-monotone and the sampler emits date-decreasing
  // events: there is no date ↦ position function to integrate.
  const shapeInDomain =
    Number.isFinite(raw.curvature) &&
    raw.curvature >= 0 &&
    raw.curvature <= 1 &&
    Number.isFinite(raw.protraction) &&
    raw.protraction >= -1 &&
    raw.protraction <= 1;
  if (!shapeInDomain) {
    notes.push({
      kind: 'renderer-error',
      dateTicks: raw.dateTicks,
      detail:
        `@curvature=${String(raw.curvature)} / @protraction=${String(raw.protraction)} outside ` +
        '[0,1] × [−1,1], which <movement> does not clamp (contrast DynamicsMap.ts:170-181): ' +
        'the inner control points leave the unit square, x(t) is no longer monotone and the ' +
        'sampler emits events whose dates go backwards, so the span reads ⊥',
    });
    return bottom('renderer-error');
  }

  const [x1, x2] = innerControlPointsXPositions(raw.curvature, raw.protraction);
  return valued({ kind: 'bezier', from: raw.position, to: raw.transitionTo, x1, x2 });
}

/** The value a span leaves behind — what the next hold performs. */
function endValueOf(shape: Valued<PedalShape>): Valued<PedalShape> {
  if (shape.kind === 'bottom') return shape;
  const value = shape.value;
  return valued({
    kind: 'constant',
    position: value.kind === 'constant' ? value.position : value.to,
  });
}

/**
 * The segment governing `ticks`, right-continuous, or null where none does.
 *
 * A scan here would take the LAST covering segment where accentuation and rubato take the first;
 * on a timeline whose spans and holds abut those are the same segment, and
 * {@link coveringSegmentAt} carries that argument with the `NaN`/`Infinity` cases.
 */
export function pedalSegmentAt(curve: PedalCurve, ticks: number): PedalSegment | null {
  return coveringSegmentAt(curve.segments, ticks);
}

/**
 * `position(t)` on [0,1] — the ideal curve, or `⊥`.
 *
 * The Bézier is inverted by {@link idealCurveParameter} rather than by `bezier.ts`'s `tForDate`,
 * per the rule 3: `tForDate` stops within one tick of the target, making the renderer's
 * `date ↦ position` a staircase no smooth quadrature converges against. On a resurrected span the
 * width is `Number.MAX_VALUE` and `x` is ~1e-305 for every real date, so the inversion returns
 * ~0 and the value is `@position` to within 1e-30 — the flat reading, arrived at by
 * evaluating the transition rather than special-casing it.
 */
export function positionAt(curve: PedalCurve, ticks: number): Valued<number> {
  const segment = pedalSegmentAt(curve, ticks);
  if (segment === null) return valued(PEDAL_NEUTRAL_POSITION);
  if (segment.shape.kind === 'bottom') return segment.shape;

  const shape = segment.shape.value;
  if (shape.kind === 'constant') return valued(shape.position);

  const span = segment.endTicks - segment.startTicks;
  if (!(span > 0)) return valued(shape.from);
  const x = (ticks - segment.startTicks) / span;
  if (x <= 0) return valued(shape.from);
  if (x >= 1) return valued(shape.to);

  const t = idealCurveParameter(shape.x1, shape.x2, x);
  return valued(shape.from + (shape.to - shape.from) * (3 - 2 * t) * t * t);
}

/** Whether any segment overlapping `[startTicks, endTicks)` reads `⊥`. */
export function hasBottomIn(curve: PedalCurve, startTicks: number, endTicks: number): boolean {
  return curve.segments.some(
    (segment) =>
      segment.shape.kind === 'bottom' &&
      segment.startTicks < endTicks &&
      segment.endTicks > startTicks,
  );
}
