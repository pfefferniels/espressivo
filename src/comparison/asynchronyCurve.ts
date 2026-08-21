/**
 * The asynchrony curve — DESIGN.md §5.7. A per-part step function of `@milliseconds.offset`,
 * in milliseconds. Neutral is 0 ms.
 *
 * The curve is piecewise constant and GL-10 is exact on a constant, so this dimension carries
 * no quadrature error at all.
 *
 * ## Two renderer behaviours
 *
 * 1. Spans end on any entry, and a foreign entry opens a `⊥` span (AD-29 as corrected by
 *    AD-33.1). `renderAsynchronyToMap` takes `this.elements[asynIndex + 1].key` with no
 *    local-name test, and `GenericMap` indexes every dated child including `<style>`. Contrast
 *    `TempoMap.getEndDate`, which does test the local name.
 *
 *    The missing test does more than end the span. `asynIndex` iterates over every entry,
 *    including the `<style>`, and reads
 *    `parseFloat(getAttributeValue('milliseconds.offset', asynElement))` off it — for a
 *    `<style>` that is `parseFloat('')` = `NaN`, so `Math.max(0, ms + NaN)` is `NaN`. Every
 *    note in that span gets `milliseconds.date="NaN"` and vanishes from the MIDI export: the
 *    R24 condition below, reached through a different element, so the span is `⊥` and not the
 *    neutral 0 ms. AD-29's amendment text said "neutral gap"; priced as neutral it was out by
 *    a factor of 30 on the disputed span and emitted no note at all.
 * 2. A missing `@milliseconds.offset` poisons the span (AD-1, R24). The renderer reads it with
 *    `parseFloat(getAttributeValue(…))`, and `getAttributeValue` returns `''` for a missing
 *    attribute, so the offset is `NaN`; executed, every note in the span gets
 *    `milliseconds.date="NaN"` and vanishes from the MIDI export. R6's absence-is-neutral
 *    covers an absent *map*, not a present instruction with an absent offset, and reading it
 *    as 0 would compute a performance the renderer does not produce. The span reads `⊥` and is
 *    reported `renderer-error`, priced by §4's capped metric at `δ_row` from everything.
 *
 * Two further mechanics are out of scope for the curve and belong to a rendered comparison
 * (R24): the shifted start is floored at 0 and the shifted end at `startDateMs + 1`, so the
 * offset is not a pure translation near the start of the piece or on very short notes. Both
 * need note data, which this dimension does not have — §5.7's enumerated non-goals.
 */
import { withNext } from '../prelude/index.js';
import type { Element } from '../xml/XomTypes.js';
import { readAttributeValue } from '../expression/attributes.js';
import { bottom, valued, type Valued } from './values.js';
import { ASYNCHRONY_MAP } from '../mpm/names.js';
import { assertSpanEndRule } from './spanEnds.js';
import type { OrderedMapView } from './document.js';

/** One constant-offset span. `offset` is `⊥` where the renderer would emit NaN. */
export interface AsynchronySegment {
  readonly startTicks: number;
  readonly endTicks: number;
  /** Milliseconds. `⊥` for a `<asynchrony>` with no usable `@milliseconds.offset`. */
  readonly offset: Valued<number>;
}

export interface AsynchronyCurveNote {
  readonly kind: 'renderer-error';
  readonly dateTicks: number;
  readonly detail: string;
}

export interface AsynchronyCurve {
  readonly segments: readonly AsynchronySegment[];
  readonly breakpointsTicks: readonly number[];
  readonly notes: readonly AsynchronyCurveNote[];
}

/** The neutral asynchrony curve: 0 ms everywhere, which an absent map performs (R6). */
export function neutralAsynchronyCurve(): AsynchronyCurve {
  return { segments: [], breakpointsTicks: [0], notes: [] };
}

/**
 * Build the performed asynchrony curve of one scope.
 *
 * Every dated entry participates in the span walk, not only `<asynchrony>` elements —
 * behaviour 1. A non-`<asynchrony>` entry contributes no offset of its own but does end the
 * previous span, which leaves a gap performing the neutral 0 ms.
 */
export function readAsynchronySegments(
  view: OrderedMapView | null,
  scaleFactor: number,
): AsynchronyCurve {
  assertSpanEndRule(ASYNCHRONY_MAP, 'any-entry');

  if (view === null) return neutralAsynchronyCurve();

  // Common-tick dates first, so a mixed view's two tick grids are reconciled once rather than
  // at each of the three places the span walk reads a date.
  const entries = view.entries
    .map((entry, index) => ({
      element: entry.element,
      ticks: entry.date * (view.entryResolutions?.[index]?.scaleFactor ?? scaleFactor),
      date: entry.date,
    }))
    .filter((entry) => Number.isFinite(entry.date));
  if (entries.length === 0) return neutralAsynchronyCurve();

  const segments: AsynchronySegment[] = [];
  const notes: AsynchronyCurveNote[] = [];
  const breakpoints = new Set<number>([0]);

  // Any next entry ends the span — the whole point of behaviour 1 — and the last entry's span
  // runs to the end of time.
  for (const [entry, next] of withNext(entries)) {
    const endTicks = next?.ticks ?? Number.POSITIVE_INFINITY;
    const element: Element = entry.element;
    const startTicks = entry.ticks;

    breakpoints.add(startTicks);

    // A non-<asynchrony> entry (a <style>, say) is read for an offset it does not have, so the
    // renderer NaN-poisons its whole span — the missing-@milliseconds.offset condition reached
    // through a different element (AD-33.1).
    const isAsynchrony = element.getLocalName() === 'asynchrony';
    const raw = isAsynchrony ? readAttributeValue(element, 'milliseconds.offset') : null;
    const parsed = raw === null ? NaN : parseFloat(raw);

    if (!Number.isFinite(parsed)) {
      segments.push({ startTicks, endTicks, offset: bottom('renderer-error') });
      notes.push({
        kind: 'renderer-error',
        dateTicks: startTicks,
        detail: isAsynchrony
          ? 'no usable @milliseconds.offset: the renderer computes NaN and every note in the ' +
            'span vanishes from the MIDI export, so the span is ⊥ rather than 0 (R24/AD-1)'
          : `<${element.getLocalName()}> in an asynchronyMap: the map reads an offset off it ` +
            'with no local-name test, gets NaN, and every note in the span vanishes from the ' +
            'MIDI export — the R24 condition through a foreign element (AD-33.1)',
      });
      continue;
    }

    segments.push({ startTicks, endTicks, offset: valued(parsed) });
  }

  return {
    segments,
    breakpointsTicks: [...breakpoints].sort((a, b) => a - b),
    notes,
  };
}

/**
 * The offset in force at `ticks`, right-continuous (A-B1).
 *
 * Outside every segment the answer is a *value* of 0, not `⊥`: no asynchrony in force is a
 * perfectly well-defined performance (R6), while a broken instruction is not.
 */
export function offsetAt(curve: AsynchronyCurve, ticks: number): Valued<number> {
  for (const segment of curve.segments) {
    if (ticks < segment.startTicks) break;
    if (ticks < segment.endTicks) return segment.offset;
  }
  return valued(0);
}
