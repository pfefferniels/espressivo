/**
 * Where one instruction's span stops — as data, because it is not one rule.
 *
 * DESIGN.md §5.0 ("Span ends resolve per map type", AD-14ii / R12): six maps scan forward
 * for the next element of their **own local name**, and a `<style>` switch never terminates
 * their spans. `ImprecisionMap` is the exception — a distribution is ended by **any** entry
 * in the map, whatever it is — so gaps in an imprecision map are real and carry no law at
 * all (§5.9).
 *
 * The distinction is load-bearing rather than pedantic. Under the same-local-name rule a
 * `<style>` sitting between two `<tempo>` elements is invisible to the span, so the first
 * tempo governs straight through it; under the any-entry rule that same `<style>` would end
 * the span and open a lawless gap. Getting it backwards silently changes which curve is
 * integrated over which interval.
 *
 * This module is data plus a lookup and deliberately nothing else. The evaluators walk the
 * ordered view from `expression/datedView` and ask it where a span ends; encoding the rule
 * as a table keeps the six-versus-one split in one place instead of once per dimension.
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
 * - `any-entry` — the next entry of any kind ends it, gaps included (§5.9).
 * - `event` — the map carries **atoms**, not spans: an `<articulation>` or `<ornament>`
 *   applies to the note it names, so there is no forward scan to do. §5.0's atom rule
 *   ("an atom is charged to the span it opens", right-continuous per A-B1) is what governs
 *   these, and it is a density-layer concern rather than a span-end one.
 */
export type SpanEndRule = 'same-local-name' | 'any-entry' | 'event';

const RULES: ReadonlyMap<string, SpanEndRule> = new Map<string, SpanEndRule>([
  // The six of AD-14ii, in §5's own section order.
  [TEMPO_MAP, 'same-local-name'],
  [RUBATO_MAP, 'same-local-name'],
  [DYNAMICS_MAP, 'same-local-name'],
  [METRICAL_ACCENTUATION_MAP, 'same-local-name'],
  [ASYNCHRONY_MAP, 'same-local-name'],
  [MOVEMENT_MAP, 'same-local-name'],

  // The exception, in all five spellings the model admits. The bare `imprecisionMap` is
  // included because `Dated` parses and indexes it (`GenericMap` registers a factory for it,
  // `ImprecisionMap.ts:659`) even though it renders nothing — its `getDomain()` is `''` and
  // the domain switch falls through. It therefore has entries, and anything that walks its
  // entries needs the same rule its four siblings use.
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
 * Null rather than a default, and this is the point of returning it: real documents carry
 * map names nothing in this port knows — the surveyed `Daten` corpus contains a
 * `gestureMap`, which `Dated.parseData:63` happily indexes because its predicate is
 * `localName.includes('Map')`. Such a map has no span law because it has no renderer, and
 * guessing one would price a difference in something that is never performed.
 */
export function spanEndRuleOf(mapLocalName: string): SpanEndRule | null {
  return RULES.get(mapLocalName) ?? null;
}

/** Every map local name this module has a rule for, in declaration order. */
export const MAPS_WITH_SPAN_RULES: readonly string[] = [...RULES.keys()];
