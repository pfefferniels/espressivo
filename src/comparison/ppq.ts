/**
 * Tick-grid normalization: two documents, two `@pulsesPerQuarter`, one common grid.
 *
 * The timeline: dates from both documents are rescaled to `lcm(ppq_A, ppq_B)`
 * with integer factors, which keeps the rescaling exact in IEEE754, and are then reported in
 * quarters. The campaign's own fixtures disagree — `telemann-grave` is 720 and
 * `vulpius-die-helle-sonn` is 480 — so a cross-document comparison runs on a 1440-tick grid with
 * factors 2 and 3.
 *
 * Nothing here reads a rescaled value back into a document. The factors exist so the
 * refinement grid can deduplicate breakpoints "exactly in integer lcm-ticks"; a float-scaled
 * date would make two breakpoints that are the same beat fail to compare equal.
 *
 * `ppqSensitive` is not decided here. A registry row's *value* is rescaled by the same factor
 * only when the row is tick-valued; `*Ms` attributes never rescale. This module supplies the
 * factor and says nothing about which values earn it — that is the registry's question, and
 * the evaluators ask it.
 */
import type { Element } from '../xml/XomTypes.js';
import { attribute } from '../xml/tree.js';

/**
 * MPM's documented default, and the value `Performance` assumes when a document declares none
 * (`Performance.ts:134`, written back into the document at `:196-200` — one of the parse-time
 * mutations this module exists to avoid provoking).
 */
export const DEFAULT_PPQ = 720;

/** One document's tick grid, and whether the document actually said so. */
export interface PpqReading {
  readonly value: number;
  /**
   * False when `@pulsesPerQuarter` was absent and {@link DEFAULT_PPQ} was assumed — which is
   * the *only* thing the `fallbackUsed` stamp is allowed to mean.
   */
  readonly declared: boolean;
  /**
   * The raw attribute text when it was present but unusable, else null.
   *
   * Separate from `declared`: a document writing `pulsesPerQuarter="lots"` did declare one, so
   * reporting "no declaration" would be false, but the value cannot be used and the default
   * stands in.
   */
  readonly unusableDeclaration: string | null;
}

/**
 * Read one `<performance>`'s tick grid without constructing `Performance`.
 *
 * `parseInt` rather than `parseFloat`, because that is what the renderer uses
 * (`Performance.ts:202`) and it is lenient in a way that shows up in real documents:
 * `parseInt("720.5")` is 720. A non-positive or unparseable value cannot index a grid, so
 * the default stands in and the raw text is carried for the report.
 */
export function readPpq(performance: Element): PpqReading {
  const raw = attribute('pulsesPerQuarter', performance);
  if (raw === null) return { value: DEFAULT_PPQ, declared: false, unusableDeclaration: null };

  const text = raw.getValue();
  const parsed = parseInt(text);
  if (!Number.isFinite(parsed) || parsed <= 0)
    return { value: DEFAULT_PPQ, declared: true, unusableDeclaration: text };

  return { value: parsed, declared: true, unusableDeclaration: null };
}

/** Euclid, on non-negative integers. */
function greatestCommonDivisor(a: number, b: number): number {
  let x = a;
  let y = b;
  while (y !== 0) {
    const t = y;
    y = x % y;
    x = t;
  }
  return x;
}

/** the common grid and the two integer factors that reach it. */
export interface PpqNormalization {
  readonly a: number;
  readonly b: number;
  readonly lcm: number;
  /** `lcm / a` — an integer by construction. */
  readonly factorA: number;
  /** `lcm / b` — likewise. */
  readonly factorB: number;
  /** exactly "a document declared none and the default was assumed". */
  readonly fallbackUsed: boolean;
  /** The assumed value when `fallbackUsed`, else null (RULE N4: absence is null). */
  readonly assumed: number | null;
}

/**
 * The common tick grid for a pair.
 *
 * The two readings are already resolved (a missing declaration has become {@link DEFAULT_PPQ}),
 * so the lcm is always well defined and the factors are always integers. Equal grids give
 * `factorA === factorB === 1`, the overwhelmingly common case in the corpus — 279 of the 283
 * `pulsesPerQuarter` occurrences surveyed are 720 — and are not special-cased.
 */
export function normalizePpq(a: PpqReading, b: PpqReading): PpqNormalization {
  const lcm = (a.value / greatestCommonDivisor(a.value, b.value)) * b.value;
  const fallbackUsed = !a.declared || !b.declared;
  return {
    a: a.value,
    b: b.value,
    lcm,
    factorA: lcm / a.value,
    factorB: lcm / b.value,
    fallbackUsed,
    assumed: fallbackUsed ? DEFAULT_PPQ : null,
  };
}

/**
 * A date in one document's own ticks, on the common grid.
 *
 * `NaN` in, `NaN` out: `datedView` keeps unparseable dates as `NaN` on purpose
 * (`datedView.ts:17-27`), and silently repairing one here would move an instruction the
 * renderer puts at the front of the map.
 */
export function toCommonTicks(date: number, factor: number): number {
  return date * factor;
}

/** A common-grid tick position in quarters, which is what every reported date is in. */
export function toQuarters(commonTicks: number, lcm: number): number {
  return commonTicks / lcm;
}
