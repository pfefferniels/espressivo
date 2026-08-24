/**
 * the edit states as MAP VIEWS, so every reader prices them unchanged.
 *
 * `editScript.ts` searches over instruction lists and knows nothing about what an instruction
 * is; the eleven readers turn a map into what it performs and know nothing about edit states.
 * This module is the joint: {@link editView} presents a list of instructions drawn from two
 * documents as the `OrderedMapView` a reader already takes.
 *
 * ## Resolution travels with the instruction
 *
 * Each instruction keeps the `scaleFactor` and the two environments of the DOCUMENT it came
 * from, carried on the view as `entryResolutions`. That is what makes the replay exact: the
 * state after the last op is `b`'s instructions with `b`'s resolutions, i.e. `B` itself, rather
 * than "B's instructions read through A's styleDefs".
 *
 * The consequence: deleting a `<style>` switch does not re-resolve the instructions after it. A
 * mixed map has no well-defined style scope — A's style names need not exist in B's header at
 * all — and the script is scoped to one (part, map) while `styleDef`s live in the header,
 * outside it. Where two documents differ ONLY in a styleDef the difference is still priced: the
 * two `<tempo>` elements may be identical while their resolved levels are not, so the
 * substitution costs real money, attributed to the instruction rather than to the header.
 *
 * ## Every dated entry is an instruction, `<style>` included
 *
 * the design takes both instruction sequences date-ordered by the `datedView` rules, and that view
 * carries `<style>` switches (those with a `@name.ref`; `GenericMap.parseData` drops the rest
 * before indexing). Under the ANY-ENTRY span rule that `asynchronyMap` and the three
 * `imprecisionMap`s follow, a `<style>` ENDS a span, so a state that dropped
 * it would not perform what its document performs and `S(0,0)` would not be `A`.
 */
import { optionAt } from '../prelude/seq.js';
import type { Element } from '../xml/XomTypes.js';
import type { DatedEntry } from '../expression/datedView.js';
import { spanEndRuleOf } from './spanEnds.js';
import type { EditableInstruction } from './editScript.js';
import type { EntryResolution, OrderedMapView } from './document.js';

/** One editable instruction: an entry of one document's map, with what it resolves against. */
export interface EditInstruction extends EditableInstruction {
  readonly side: 'a' | 'b';
  /** The date on the COMMON grid, which is the order `editScript` works in. */
  readonly dateTicks: number;
  /** The entry as its own document's view holds it — own-tick date and document index. */
  readonly entry: DatedEntry;
  /** The `<style>` in scope at this entry's position in its OWN map (`styleNames[i]`). */
  readonly styleName: string | null;
  readonly resolution: EntryResolution;
  /** Position in its own side's sequence, so an op can name which instruction it consumed. */
  readonly index: number;
}

/** The map element an edit view borrows its identity from; null when neither side has the map. */
function templateElementOf(
  instructions: readonly EditInstruction[],
  fallback: Element | null,
): Element | null {
  return instructions[0]?.entry.element.getParent() ?? fallback;
}

/**
 * One document's map as an editable sequence, in common-tick order.
 *
 * The order is the view's own — `datedView`'s date-stable insertion order — scaled onto the
 * common grid. It is already ascending, since scaling is monotone.
 */
export function editInstructionsOf(
  side: 'a' | 'b',
  view: OrderedMapView | null,
  resolution: EntryResolution,
): readonly EditInstruction[] {
  if (view === null) return [];
  const instructions: EditInstruction[] = [];
  for (const [index, entry] of view.entries.entries()) {
    // A `NaN` date has no place on the timeline; `datedView` sorts such entries to the front and
    // every reader skips them, so carrying one would price a difference no renderer performs.
    if (!Number.isFinite(entry.date)) continue;
    instructions.push({
      side,
      dateTicks: entry.date * resolution.scaleFactor,
      entry,
      styleName: optionAt(view.styleNames, index, 'a map view style-name list'),
      resolution,
      index: instructions.length,
    });
  }
  return instructions;
}

/**
 * An edit state as the `OrderedMapView` every reader takes.
 *
 * Null for an empty state, which is the same reading a reader gives an empty map: both produce
 * the dimension's neutral curve, so the two spellings of "this map performs nothing" are
 * one number rather than two.
 */
export function editView(
  mapName: string,
  instructions: readonly EditInstruction[],
  fallbackElement: Element | null = null,
): OrderedMapView | null {
  if (instructions.length === 0) return null;
  const element = templateElementOf(instructions, fallbackElement);
  if (element === null) return null;

  return {
    mapName,
    element,
    entries: instructions.map((instruction) => instruction.entry),
    styleNames: instructions.map((instruction) => instruction.styleName),
    spanEndRule: spanEndRuleOf(mapName),
    entryResolutions: instructions.map((instruction) => instruction.resolution),
  };
}

/**
 * The interval outside which two states of ONE transition perform identically.
 *
 * Two states of a DP transition differ by a single instruction (two for a substitution), so
 * their curves agree except near it, and integrating over the whole window computes zeros. The
 * bound is STRUCTURAL rather than sampled:
 *
 * - Left: everything strictly before the last unchanged instruction preceding the change is
 *   governed by instructions both states share, with unchanged neighbours. The span OPENING at
 *   that instruction is not safe — its end date moves with the change, and its
 *   trailing-ness can flip — so the bound is that instruction's own date, not the change's.
 * - Right: the first unchanged instruction strictly AFTER the change opens a span whose value,
 *   end and trailing-ness are decided by instructions at or after it, none of which moved. That
 *   holds for skip gaps too: a gap runs to the next VALID instruction, which depends only on
 *   what follows.
 *
 * {@link editScriptForDimension} ships an unlocalized mode and the suite pins the two forms
 * EQUAL over the vendored corpus and the adversarial family. The one dimension it
 * is NOT applied to is `pedal`, whose `getPreviousPosition` scans BACKWARDS over entry indices
 * for an inherited `@transition.to` (PARITY P2, the hazard class), so a movement really
 * can depend on an instruction before it.
 */
export function affectedTicks(
  previous: readonly EditInstruction[],
  next: readonly EditInstruction[],
  startTicks: number,
  endTicks: number,
): { readonly startTicks: number; readonly endTicks: number } {
  const before = new Set(previous);
  const after = new Set(next);
  let firstChange = Number.POSITIVE_INFINITY;
  let lastChange = Number.NEGATIVE_INFINITY;
  for (const instruction of [...previous, ...next])
    if (!before.has(instruction) || !after.has(instruction)) {
      firstChange = Math.min(firstChange, instruction.dateTicks);
      lastChange = Math.max(lastChange, instruction.dateTicks);
    }

  // Identical instruction sets perform identically, so the interval is empty and the integral
  // over it is the 0 the full window would also have produced.
  if (!Number.isFinite(firstChange)) return { startTicks, endTicks: startTicks };

  let low = startTicks;
  let high = endTicks;
  for (const instruction of previous) {
    if (!after.has(instruction)) continue;
    if (instruction.dateTicks < firstChange) low = Math.max(low, instruction.dateTicks);
    if (instruction.dateTicks > lastChange) high = Math.min(high, instruction.dateTicks);
  }
  return { startTicks: Math.min(low, endTicks), endTicks: Math.max(high, startTicks) };
}
