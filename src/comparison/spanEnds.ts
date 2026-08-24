/**
 * Where one instruction's span stops — as data, because it is not one rule.
 *
 * "Span ends resolve per map type":
 * five maps scan forward for the next element of their own local name, and a `<style>` switch
 * never terminates their spans. Two end on ANY next entry — `ImprecisionMap`, whose gaps are
 * real and carry no law at all, and `AsynchronyMap`, whose span end is
 * `this.elements[asynIndex + 1].key` with no local-name test. Rev 2 of DESIGN listed
 * `AsynchronyMap` on the same-name side; the renderer settles it the other way and the
 * contradiction is recorded here.
 *
 * The asynchrony case goes further still: the foreign entry does not merely end
 * the span, it opens a `⊥` one, because the map reads an offset off it, gets `NaN`, and every
 * note in that span vanishes from the MIDI export.
 *
 * The distinction is observable: under the same-local-name rule a `<style>` between two
 * `<tempo>` elements is invisible to the span, so the first tempo governs straight through it;
 * under the any-entry rule it ends the span and opens a lawless gap, changing which curve is
 * integrated over which interval.
 *
 * The rules are stated against the renderer's own `getEndDate` helpers — `TempoMap.ts:166-175`,
 * `DynamicsMap.ts:187-193`, `RubatoMap.ts:145-150` all scan for their own local name; the
 * imprecision reader clamps by entry index instead (`ImprecisionMap.ts`, and see
 * `GenericMap.clampEntryIndex:458-461`, whose name-test sibling `resolveEntryIndex:469-473`
 * is what the six use).
 */
import {
  ARTICULATION_MAP,
  ASYNCHRONY_MAP,
  DYNAMICS_MAP,
  IMPRECISION_MAP,
  IMPRECISION_MAP_DYNAMICS,
  IMPRECISION_MAP_TIMING,
  IMPRECISION_MAP_TONEDURATION,
  IMPRECISION_MAP_TUNING,
  METRICAL_ACCENTUATION_MAP,
  MOVEMENT_MAP,
  ORNAMENTATION_MAP,
  RUBATO_MAP,
  TEMPO_MAP,
} from '../mpm/names.js';

/**
 * How a map decides where an instruction stops governing.
 *
 * - `same-local-name` — scan forward for the next element of the instruction's own name;
 *   `<style>` and anything else is transparent.
 * - `any-entry` — the next entry of any kind ends it, gaps included.
 * - `event` — the map carries atoms, not spans: an `<articulation>` or `<ornament>` applies to
 *   the note it names, so there is no forward scan to do. The atom rule ("an atom is charged
 *   to the span it opens", right-continuous) governs these, and it is a density-layer
 *   concern rather than a span-end one.
 */
export type SpanEndRule = 'same-local-name' | 'any-entry' | 'event';

const RULES: ReadonlyMap<string, SpanEndRule> = new Map<string, SpanEndRule>([
  // the section order. FIVE, not the six the table lists — see the asynchrony entry.
  [TEMPO_MAP, 'same-local-name'],
  [RUBATO_MAP, 'same-local-name'],
  [DYNAMICS_MAP, 'same-local-name'],
  [METRICAL_ACCENTUATION_MAP, 'same-local-name'],
  [MOVEMENT_MAP, 'same-local-name'],

  /**
   * `asynchronyMap` is `any-entry`, against the table and with the asynchrony reading. The
   * design contradicts
   * itself: the design lists it among the six maps that scan for their own local name, the design says the
   * map "takes the next dated child with no local-name test". The renderer settles it:
   *
   * ```ts
   * // AsynchronyMap.renderAsynchronyToMap
   * const asynEndDate = asynIndex < this.elements.length - 1
   *   ? this.elements[asynIndex + 1].key   // the next ENTRY, whatever it is:
   * Number.MAX_VALUE;
   * ```
   *
   * No name test — and `GenericMap.parseData:145-146` indexes every dated child including
   * `<style>`, dropping only a `<style>` that carries no `@name.ref`. Contrast
   * `TempoMap.getEndDate:166-175`, which does test `getLocalName() === 'tempo'`.
   */
  [ASYNCHRONY_MAP, 'any-entry'],

  // The exception, in all five spellings the model admits. The bare `imprecisionMap` is
  // included because `Dated` parses and indexes it (`ImprecisionMap.ts:794`) even though it
  // renders nothing — its `getDomain()` is `''` and the domain switch falls through. It still
  // has entries, and anything that walks them needs the rule its four siblings use.
  [IMPRECISION_MAP, 'any-entry'],
  [IMPRECISION_MAP_TIMING, 'any-entry'],
  [IMPRECISION_MAP_DYNAMICS, 'any-entry'],
  [IMPRECISION_MAP_TONEDURATION, 'any-entry'],
  [IMPRECISION_MAP_TUNING, 'any-entry'],

  // Atom maps.
  [ARTICULATION_MAP, 'event'],
  [ORNAMENTATION_MAP, 'event'],
]);

/**
 * The rule for a map, or null for a map name the MPM model does not define.
 *
 * Null rather than a default: real documents carry map names nothing in this port knows — the
 * surveyed `Daten` corpus contains a `gestureMap`, which `Dated.parseData:63` indexes because
 * its predicate is `localName.includes('Map')`. Such a map has no span law because it has no
 * renderer, and guessing one would price a difference in something that is never performed.
 */
export function spanEndRuleOf(mapLocalName: string): SpanEndRule | null {
  return RULES.get(mapLocalName) ?? null;
}

/**
 * Assert that a curve reader's hard-coded span scan matches this table — the "wire it
 * or remove it".
 *
 * Each reader implements its rule inline, because the scan is woven into how it walks its own
 * instruction list and factoring that out would obscure more than it shares. This keeps the
 * table load-bearing: change a rule here and the reader that disagrees fails at its first call.
 *
 * @throws {Error} when the table and the reader disagree — a programmer error, not data.
 */
export function assertSpanEndRule(mapLocalName: string, expected: SpanEndRule): void {
  const actual = spanEndRuleOf(mapLocalName);
  if (actual !== expected)
    throw new Error(
      `span-end rule mismatch for <${mapLocalName}>: spanEnds.ts says ${String(actual)}, ` +
        `the reader implements ${expected}`,
    );
}

/** Every map local name this module has a rule for, in declaration order. */
export const MAPS_WITH_SPAN_RULES: readonly string[] = RULES.keys().toArray();
