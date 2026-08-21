/**
 * The default-articulation step function — DESIGN.md §5.5, as amended by AD-37.
 *
 * A `<style>` switch in an `articulationMap` can carry `@defaultArticulation`, which the
 * renderer applies to every note that has no explicit articulation of its own (atoms shadow the
 * default rather than adding to it — AD-11ii/R5). That makes the default a step function of
 * score time, and this module builds it.
 *
 * ## The step function is retroactive (AD-37.1)
 *
 * ```ts
 * // ArticulationMap.renderArticulationToMap_noMillisecondModifiers:255-283
 * let defaultArticulationIndex = 0;
 * for (...) {
 *   ...
 *   while (defaultArticulationIndex + 1 < defaultArticulations.length &&
 *          defaultArticulations[defaultArticulationIndex + 1].key <= mapEntry.key)
 *     defaultArticulationIndex++;
 * ```
 *
 * The index starts at 0 and is never tested against its own date: the `while` only advances
 * when the next switch's date has been passed, so `defaultArticulations[0]` governs every note
 * before the first switch as well. Executed on notes at 0/360/720/1080, each 100 ticks, with a
 * single switch at 720 carrying `defaultArticulation="stacc"` (×0.5): durations
 * `[50, 50, 50, 50]`. Moving the switch to 1440 and the notes to 0/720/1440 gives
 * `[50, 50, 50]` — the reach is the whole map, not a window.
 *
 * The natural reading of §5.5's "built from the resolved style-switch list" — a step function
 * with no value before its first step — is wrong by `|ln 0.5| = 0.693` nepers held across the
 * entire pre-switch region, most of the piece where the only switch is late.
 *
 * A third instance of AD-35.4's hazard class, in a new shape: "index 0 is used before its date
 * has arrived", after `renderMovementToMap`'s `size() - 1` guard and `getPreviousPosition`'s
 * `j > 0`.
 *
 * ## Three dispositions, two of which cancel (AD-37.2)
 *
 * | the switch                                | the renderer                         | default   |
 * | ----------------------------------------- | ------------------------------------ | --------- |
 * | `@name.ref` names no articulationStyle    | `continue`s before touching the list | continues |
 * | style resolves, no `@defaultArticulation` | pushes `null`                        | cancelled |
 * | style resolves, unknown def name          | pushes `null`, logs a warning        | cancelled |
 *
 * All three executed, on notes at 0/360/720/1080 with `stacc` in force from 0 and a second
 * switch at 720: `[50,50,50,50]` for the unresolvable style, `[50,50,100,100]` for both
 * cancelling cases. §5.5 named one canceller and one continuer; the third row is the one a
 * reader guesses wrong, because an unknown *def* name looks like an unknown *style* name.
 */
import { head, isNonEmpty, withNext } from '../prelude/index.js';
import type { Element } from '../xml/XomTypes.js';
import { attribute } from '../xml/tree.js';
import { ARTICULATION_STYLE } from '../mpm/names.js';
import { readAttributeValue } from '../expression/attributes.js';
import { findStyleDef } from '../expression/styleScope.js';
import type { MpmEnvironment } from '../expression/mpmTree.js';
import { resolutionAt, type OrderedMapView } from './document.js';

/** Why a switch left no default in force — the two cancelling dispositions of AD-37.2. */
export type DefaultCancelCause = 'no-attribute' | 'unknown-def';

export interface DefaultArticulationStep {
  /** The switch's own date, in common ticks. */
  readonly startTicks: number;
  /** Until the next switch that survived the style test; `+∞` for the last one. */
  readonly endTicks: number;
  /** The `<articulationDef>` in force, or null where this switch cancelled the default. */
  readonly def: Element | null;
  /** `@defaultArticulation` as written, whether or not it resolved. */
  readonly name: string | null;
  readonly cancelCause: DefaultCancelCause | null;
}

export interface DefaultArticulationNote {
  readonly kind: 'retroactive' | 'unresolved-style' | 'cancelled';
  readonly dateTicks: number;
  readonly detail: string;
}

export interface DefaultArticulationCurve {
  /**
   * The steps, in switch order. The first step's `startTicks` is 0, not its switch's date,
   * because the renderer's index starts at 0 unchecked (AD-37.1); its switch date is kept in
   * {@link firstSwitchTicks} so the retroactive window stays legible.
   */
  readonly steps: readonly DefaultArticulationStep[];
  /** The date of the first surviving switch, or null where there is none. */
  readonly firstSwitchTicks: number | null;
  readonly breakpointsTicks: readonly number[];
  readonly notes: readonly DefaultArticulationNote[];
}

/** The empty default: no switch survives, so no note is defaulted at all. */
export function neutralDefaultArticulation(): DefaultArticulationCurve {
  return { steps: [], firstSwitchTicks: null, breakpointsTicks: [0], notes: [] };
}

/**
 * Build the default-articulation step function of one scope.
 *
 * Only `<style>` entries participate — the renderer builds this list from
 * `getAllElementsOfType('style')` and nothing else — so the atoms in between are invisible
 * here, exactly as the defaults are invisible to a note that carries an atom.
 */
export function readDefaultArticulation(
  view: OrderedMapView | null,
  scaleFactor: number,
  environment: MpmEnvironment,
  globalEnvironment: MpmEnvironment,
): DefaultArticulationCurve {
  if (view === null) return neutralDefaultArticulation();

  const notes: DefaultArticulationNote[] = [];
  const raw: {
    dateTicks: number;
    def: Element | null;
    name: string | null;
    cause: DefaultCancelCause | null;
  }[] = [];

  for (const [index, entry] of view.entries.entries()) {
    const element = entry.element;
    if (element.getLocalName() !== 'style') continue;

    const resolution = resolutionAt(view, index, scaleFactor, environment, globalEnvironment);
    const dateTicks = entry.date * resolution.scaleFactor;
    const styleName = readAttributeValue(element, 'name.ref');
    const style = findStyleDef(
      ARTICULATION_STYLE,
      styleName,
      resolution.environment,
      resolution.globalEnvironment,
    );

    // Disposition 1: the switch never reaches the list, so the previous default continues.
    if (style === null) {
      notes.push({
        kind: 'unresolved-style',
        dateTicks,
        detail:
          `no <articulationStyle> named "${String(styleName)}" in scope: the renderer ` +
          'continues before touching the default list, so the previous default stays in ' +
          'force — the one disposition of the three that does NOT cancel (AD-37.2)',
      });
      continue;
    }

    const name = readAttributeValue(element, 'defaultArticulation');

    // Disposition 2: no attribute at all — a null is pushed, and the default is cancelled.
    if (name === null) {
      raw.push({ dateTicks, def: null, name: null, cause: 'no-attribute' });
      notes.push({
        kind: 'cancelled',
        dateTicks,
        detail:
          'a resolvable <style> with no @defaultArticulation pushes a null: the default is ' +
          'CANCELLED from this date, not merely unchanged (AD-37.2)',
      });
      continue;
    }

    let def: Element | null = null;
    for (const candidate of style.styleDef.getChildElements('articulationDef'))
      if (attribute('name', candidate)?.getValue() === name) def = candidate;

    // Disposition 3: the def name does not resolve — also a null, with a warning.
    if (def === null) {
      raw.push({ dateTicks, def: null, name, cause: 'unknown-def' });
      notes.push({
        kind: 'cancelled',
        dateTicks,
        detail:
          `@defaultArticulation="${name}" names no <articulationDef> in the style in scope: ` +
          'the renderer warns and pushes a null, so this CANCELS the default rather than ' +
          'leaving the previous one in force. An unknown DEF name and an unknown STYLE name ' +
          'look alike and do opposite things (AD-37.2).',
      });
      continue;
    }

    raw.push({ dateTicks, def, name, cause: null });
  }

  if (!isNonEmpty(raw)) return { ...neutralDefaultArticulation(), notes };

  const firstSwitchTicks = head(raw).dateTicks;
  // Each step runs to the next switch, and the last to the end of time.
  const steps: readonly DefaultArticulationStep[] = withNext(raw).map(([step, next], index) => ({
    // AD-37.1: the first step reaches back to 0.
    startTicks: index === 0 ? 0 : step.dateTicks,
    endTicks: next?.dateTicks ?? Number.POSITIVE_INFINITY,
    def: step.def,
    name: step.name,
    cancelCause: step.cause,
  }));

  if (firstSwitchTicks > 0)
    notes.push({
      kind: 'retroactive',
      dateTicks: firstSwitchTicks,
      detail:
        `the first surviving <style> sits at ${String(firstSwitchTicks)} ticks, and its ` +
        'default governs [0, ' +
        `${String(firstSwitchTicks)}) as well: renderArticulationToMap_noMillisecondModifiers ` +
        'starts its index at 0 and never tests it against its own date (AD-37.1, executed)',
    });

  return {
    steps,
    firstSwitchTicks,
    breakpointsTicks: [...new Set(steps.map((step) => step.startTicks))].sort((a, b) => a - b),
    notes,
  };
}

/*
 * The two scans below stay scans, where the sibling curve readers use `segments.ts`'s
 * `coveringSegmentAt`.
 *
 * That is a binary search, so it needs `startTicks` non-decreasing. Every sibling earns it by
 * dropping non-finite dates before building its raws; this reader has no such guard — the loop
 * above takes every `<style>` entry whose style resolves, `dateTicks = entry.date * scaleFactor`
 * and all, so a `<style>` with an unparseable `@date` reaches `raw` with a `NaN` date.
 *
 * One such entry is harmless: `datedView` sorts it to the front (`datedView.ts:19-27`) and
 * AD-37.1 forces the first step's start to 0 regardless. Two are not — both sort to the front,
 * so `steps[1].startTicks` is `NaN` and the non-monotonicity sits in the middle of the array,
 * out of reach of the leading-`NaN` argument that the bound can only examine index 0 when no
 * later index satisfies the predicate.
 *
 * `editState.ts:82-84` states the opposite as settled — "`datedView` sorts such entries to the
 * front and every reader skips them". Every reader but this one. Adding the guard changes what
 * a malformed document reads as, so it needs a ruling.
 */

/** The default in force at `ticks` — the `<articulationDef>`, or null where none is. */
export function defaultArticulationAt(
  curve: DefaultArticulationCurve,
  ticks: number,
): Element | null {
  for (const step of curve.steps) {
    if (ticks < step.startTicks) break;
    if (ticks < step.endTicks) return step.def;
  }
  return null;
}

/** The step governing `ticks`, for a caller that needs the cancel cause as well as the def. */
export function defaultArticulationStepAt(
  curve: DefaultArticulationCurve,
  ticks: number,
): DefaultArticulationStep | null {
  for (const step of curve.steps) {
    if (ticks < step.startTicks) break;
    if (ticks < step.endTicks) return step;
  }
  return null;
}
