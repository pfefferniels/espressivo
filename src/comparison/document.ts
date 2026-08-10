/**
 * The pair reader: two MPM texts in, one normalized plain-data view of both out.
 *
 * This is W2b, and it is deliberately the *whole* boundary between "a document" and "a
 * comparison". Nothing above it re-reads XML; nothing in it evaluates a curve. What it
 * produces is the substrate DESIGN.md §5.0 assumes exists — a common tick grid, matched
 * scopes, resolved maps, ordered instruction views, a window with its two stamps, and the
 * §5.0 comparability evidence — and the evaluators of W2c walk that.
 *
 * ## Reading discipline (R1)
 *
 * The parse is `expression/mpmDocument`'s raw `Builder` (`parseMpmRoot`), reused rather
 * than reimplemented, because `new Mpm(text)` **rewrites the document in its own
 * constructor**: `rubatoDef` gains `intensity`/`lateStart`/`earlyEnd` and has present
 * values respelled, `accentuationPatternDef` gains `length="4"` and has its children
 * reordered, `GenericMap.parseData` ends in an unconditional `sortXml()`, and
 * `Dated.addMap`/`Header.addStyleType` delete duplicates. R1 forbids mutating an input, and
 * a reader that provoked those edits could not honestly report what the document says.
 *
 * Navigation is `expression/mpmTree` (which reproduces `Header`/`Dated`'s descendant-axis,
 * last-one-wins discovery without repairing anything) and ordering is
 * `expression/datedView` (which reproduces `GenericMap.parseData`'s insertion loop
 * *including* its NaN-to-front behaviour, and the positional `<style>` scope the renderer
 * actually uses rather than the public date-based lookup).
 *
 * ## What this layer does not do
 *
 * No curve evaluation, no densities, no registry. Span-end rules are exported as **data**
 * (`spanEnds.ts`) for the evaluators to apply; `⊥` markers are produced and carried but
 * never priced; levels are resolved to the renderer's number and tagged, but no `T` is
 * applied to them. The module also touches no `src/api` file and defines no dimension
 * vocabulary, both of which belong to sibling wave items.
 */
import type { Element } from '../xml/XomTypes.js';
import { parseMpmRoot } from '../expression/mpmDocument.js';
import { readPerformances, type PerformanceView } from '../expression/mpmTree.js';
import { orderedEntries, styleNameAt, type DatedEntry } from '../expression/datedView.js';
import {
  PerformanceSelectionAmbiguousError,
  PerformanceSelectionNotFoundError,
  PerformanceSelectorInvalidError,
  type ComparisonDocumentRole,
} from './errors.js';
import {
  normalizePpq,
  readPpq,
  toCommonTicks,
  toQuarters,
  type PpqNormalization,
  type PpqReading,
} from './ppq.js';
import { matchScopes, readScopes, type ComparisonScope, type ScopePairing } from './parts.js';
import { spanEndRuleOf, type SpanEndRule } from './spanEnds.js';
import { computeWindow, type ComparisonWindow } from './window.js';

/** A performance selector: an index, a `@name`, or nothing. */
export type PerformanceSelector = string | number;

/**
 * One map, ordered the way the renderer reads it, with its span law attached.
 *
 * `entries` is `datedView`'s date-stable view, **not** document order: `GenericMap.parseData`
 * indexes by a backwards insertion scan and then rewrites the document to match, so the
 * renderer sees this order and a comparison that used document order would integrate the
 * wrong curve over the wrong interval. The view is computed in memory and the tree is left
 * exactly as parsed.
 *
 * `styleNames[i]` is the style in scope at view position `i` by the **positional** rule
 * (`GenericMap.findStyleSwitchAt`), which is what `TempoMap`/`DynamicsMap` call — not the
 * public `getStyleAt(date)`. The two disagree whenever an instruction precedes a `<style>`
 * at the same date, and the disagreement changes a rendered value rather than a lookup path.
 */
export interface OrderedMapView {
  readonly mapName: string;
  readonly element: Element;
  readonly entries: readonly DatedEntry[];
  /** Index-aligned with `entries`; null before the map's first `<style>` switch. */
  readonly styleNames: readonly (string | null)[];
  /** Null for a map name the MPM model does not define (e.g. a corpus `gestureMap`). */
  readonly spanEndRule: SpanEndRule | null;
}

/** One side of the pair, normalized. */
export interface ComparisonDocument {
  readonly role: ComparisonDocumentRole;
  /** The selected `<performance>`, as `mpmTree` sees it. */
  readonly performance: PerformanceView;
  readonly ppq: PpqReading;
  /** Multiply a date in this document's own ticks by this to reach the common grid. */
  readonly scaleFactor: number;
  /** Global scope first, then every `<part>` in document order. */
  readonly scopes: readonly ComparisonScope[];
  /** Last dated instruction, in quarters. 0 for a document with no dated instruction. */
  readonly lastDateQuarters: number;
  /** Every dated entry across every resolved map of every scope — §5.0's comparability count. */
  readonly instructionCount: number;
}

/** §5.0's C7 evidence that the two documents plausibly encode the same piece. */
export interface Comparability {
  readonly lastDateA: number;
  readonly lastDateB: number;
  /** `min/max` of the two last dates, in `[0, 1]`; 1 when both are 0. */
  readonly lengthRatio: number;
  readonly ppqA: number;
  readonly ppqB: number;
  readonly partCountA: number;
  readonly partCountB: number;
  readonly partNumbersMatched: boolean;
  readonly instructionCountA: number;
  readonly instructionCountB: number;
}

/** Everything W2c needs, and nothing it has to re-derive. */
export interface ComparisonPair {
  readonly a: ComparisonDocument;
  readonly b: ComparisonDocument;
  readonly ppq: PpqNormalization;
  readonly window: ComparisonWindow;
  /** Global row first, then parts by `@number`, then unnumbered — a total order (R2). */
  readonly scopes: readonly ScopePairing[];
  readonly comparability: Comparability;
}

export interface ReadComparisonPairOptions {
  readonly a: string;
  /** Omit to compare two performances inside `a` (§9.2, C16). */
  readonly b?: string;
  readonly performanceA?: PerformanceSelector;
  readonly performanceB?: PerformanceSelector;
  /** The MSM score end in quarters, when an MSM was supplied and could answer (R7). */
  readonly msmEndQuarters?: number | null;
  /** `options.window`, already validated by the facade. */
  readonly window?: { readonly start: number; readonly end: number } | null;
  /** The corpus-shared end, when this pair is one cell of a §8 matrix. */
  readonly corpusEndQuarters?: number | null;
}

/**
 * Pick one `<performance>`, with §9.4's three failure modes kept distinct.
 *
 * A single-performance document needs no selector — that is the overwhelmingly common case
 * and demanding one would make every ordinary call ceremonial. Two or more without a
 * selector is ambiguous and throws, which is the strictness §9.2 keeps when it otherwise
 * relaxes `b`.
 */
function selectPerformance(
  performances: readonly PerformanceView[],
  selector: PerformanceSelector | undefined,
  role: ComparisonDocumentRole,
): PerformanceView {
  const candidates = performances.map((performance) => performance.name);

  if (performances.length === 0)
    throw new PerformanceSelectionNotFoundError(role, selector ?? null, candidates);

  if (selector === undefined) {
    if (performances.length > 1) throw new PerformanceSelectionAmbiguousError(role, candidates);
    return performances[0];
  }

  if (typeof selector === 'number') {
    if (!Number.isInteger(selector) || selector < 0)
      throw new PerformanceSelectorInvalidError(role, selector);
    // A bounds test rather than an `=== undefined` test on the indexed read: this project
    // does not set `noUncheckedIndexedAccess`, so the read is typed non-optional and the
    // guard would be deleted as unreachable by `no-unnecessary-condition`.
    if (selector >= performances.length)
      throw new PerformanceSelectionNotFoundError(role, selector, candidates);
    return performances[selector];
  }

  const found = performances.find((performance) => performance.name === selector);
  if (found === undefined) throw new PerformanceSelectionNotFoundError(role, selector, candidates);
  return found;
}

/** The ordered view of every resolved map of one scope, keyed by map local name. */
export function readScopeMapViews(scope: ComparisonScope): ReadonlyMap<string, OrderedMapView> {
  const views = new Map<string, OrderedMapView>();
  for (const [mapName, element] of scope.maps) {
    const entries = orderedEntries(element);
    views.set(mapName, {
      mapName,
      element,
      entries,
      styleNames: entries.map((_entry, index) => styleNameAt(entries, index)),
      spanEndRule: spanEndRuleOf(mapName),
    });
  }
  return views;
}

/**
 * The last dated instruction of a performance, in its own ticks, and the total entry count.
 *
 * Unparseable dates are `NaN` in the view and are skipped here rather than propagated: they
 * are already positioned at the front of the map by the renderer's own insertion loop, so
 * they cannot be the last date, and letting one `NaN` reach `Math.max` would poison the
 * pair-derived window for both documents.
 *
 * Counted over each scope's **resolved** maps, so a global map inherited by three parts is
 * counted once per part — which is the right unit, because that is how many times it is
 * performed, and §5.0 evaluates every dimension per part.
 */
function summarize(scopes: readonly ComparisonScope[]): {
  lastDateTicks: number;
  instructionCount: number;
} {
  let lastDateTicks = 0;
  let instructionCount = 0;
  for (const scope of scopes) {
    if (scope.scope === 'part' && !scope.renderable) continue;
    for (const element of scope.maps.values()) {
      for (const entry of orderedEntries(element)) {
        instructionCount += 1;
        if (Number.isFinite(entry.date) && entry.date > lastDateTicks) lastDateTicks = entry.date;
      }
    }
  }
  return { lastDateTicks, instructionCount };
}

function readDocument(
  root: Element,
  selector: PerformanceSelector | undefined,
  role: ComparisonDocumentRole,
): { performance: PerformanceView; ppq: PpqReading; scopes: readonly ComparisonScope[] } {
  const performance = selectPerformance(readPerformances(root), selector, role);
  return {
    performance,
    ppq: readPpq(performance.element),
    scopes: readScopes(performance),
  };
}

/**
 * Read and normalize a pair.
 *
 * `b` defaults to `a` (§9.2, C16): the campaign's own fixtures — Telemann, Vulpius, Albert
 * — are the only real multi-performance documents in existence, and the pairwise entry
 * point would otherwise be stricter than its corpus sibling for exactly the case those
 * fixtures are built on. The ambiguity error still fires when a selector is missing, so the
 * strictness that matters survives.
 *
 * The parse order is `a` then `b`, so the first failure reported is the earliest one
 * (§9.4).
 */
export function readComparisonPair(options: ReadComparisonPairOptions): ComparisonPair {
  const rootA = parseMpmRoot(options.a);
  const rootB = options.b === undefined ? rootA : parseMpmRoot(options.b);

  const readA = readDocument(rootA, options.performanceA, 'a');
  const readB = readDocument(rootB, options.performanceB, 'b');

  const ppq = normalizePpq(readA.ppq, readB.ppq);

  const summaryA = summarize(readA.scopes);
  const summaryB = summarize(readB.scopes);

  const lastDateQuartersA = toQuarters(toCommonTicks(summaryA.lastDateTicks, ppq.factorA), ppq.lcm);
  const lastDateQuartersB = toQuarters(toCommonTicks(summaryB.lastDateTicks, ppq.factorB), ppq.lcm);

  const a: ComparisonDocument = {
    role: 'a',
    performance: readA.performance,
    ppq: readA.ppq,
    scaleFactor: ppq.factorA,
    scopes: readA.scopes,
    lastDateQuarters: lastDateQuartersA,
    instructionCount: summaryA.instructionCount,
  };
  const b: ComparisonDocument = {
    role: 'b',
    performance: readB.performance,
    ppq: readB.ppq,
    scaleFactor: ppq.factorB,
    scopes: readB.scopes,
    lastDateQuarters: lastDateQuartersB,
    instructionCount: summaryB.instructionCount,
  };

  const scopes = matchScopes(a.scopes, b.scopes);
  const partRows = scopes.filter((pairing) => pairing.scope === 'part');

  const window = computeWindow({
    msmEndQuarters: options.msmEndQuarters ?? null,
    explicit: options.window ?? null,
    corpusEndQuarters: options.corpusEndQuarters ?? null,
    lastDateQuartersA,
    lastDateQuartersB,
  });

  const longest = Math.max(lastDateQuartersA, lastDateQuartersB);
  const shortest = Math.min(lastDateQuartersA, lastDateQuartersB);

  return {
    a,
    b,
    ppq,
    window,
    scopes,
    comparability: {
      lastDateA: lastDateQuartersA,
      lastDateB: lastDateQuartersB,
      // 1 for two empty documents: they are the same length, and 0/0 is not a ratio.
      lengthRatio: longest === 0 ? 1 : shortest / longest,
      ppqA: ppq.a,
      ppqB: ppq.b,
      partCountA: a.scopes.filter((scope) => scope.scope === 'part').length,
      partCountB: b.scopes.filter((scope) => scope.scope === 'part').length,
      partNumbersMatched: partRows.length > 0 && partRows.every((pairing) => pairing.matched),
      instructionCountA: summaryA.instructionCount,
      instructionCountB: summaryB.instructionCount,
    },
  };
}

/** A date in one document's own ticks, expressed in quarters on the common grid. */
export function documentDateToQuarters(
  date: number,
  document: ComparisonDocument,
  ppq: PpqNormalization,
): number {
  return toQuarters(toCommonTicks(date, document.scaleFactor), ppq.lcm);
}
