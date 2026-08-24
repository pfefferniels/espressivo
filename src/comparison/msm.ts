/**
 * What the comparison reads from an optional MSM — the score behind the two performances.
 *
 * the design makes `msm` part of the metric, not a report-only side input: it moves the window
 * (the `'msm'` rule), the measure mapping and the beat grid the accentuation phase is
 * anchored to.
 *
 * ## What it reads, and what it deliberately does not
 *
 * The score end, the global `<timeSignatureMap>`, and the measure grid that follows from the
 * two. The note-level facts stay in `expression/msmFacts.ts` and are reused rather than
 * reimplemented; two readers of one format is how they drift.
 *
 * the forward-only `timeSignatureMap` walk is NOT implemented in full.
 * `accentuationDistance` takes ONE {@link BeatGrid}, so a meter that changes mid-piece would
 * need the evaluator to take a grid FUNCTION and to add a breakpoint at every change. A map
 * with exactly one time signature is therefore exact (the renderer's forward walk never
 * advances either); a map with several uses the first and earns an `estimate-degradation` note
 * naming the limitation.
 *
 * ## Ticks are converted once, here
 *
 * An MSM declares its own `@pulsesPerQuarter` and it need not match either MPM's. Everything
 * this module returns is therefore in QUARTERS, or in common ticks derived from a caller-
 * supplied grid — never in the MSM's own ticks, which nothing downstream knows how to read.
 */
import { filterMap, head, isNonEmpty, withNext } from '../prelude/index.js';
import { readMsmFacts, type MsmFacts } from '../expression/msmFacts.js';
import { readNumericAttributeValue } from '../expression/attributes.js';
import type { Element } from '../xml/XomTypes.js';
import type { BeatGrid } from './accentuationCurve.js';

export { parseMsmRoot } from '../expression/msmFacts.js';

/** One `<timeSignature>` of the global map, in quarters. */
export interface TimeSignatureEntry {
  readonly startQuarters: number;
  readonly numerator: number;
  readonly denominator: number;
}

/** the `measures` row. */
export interface MeasureEntry {
  readonly number: number;
  readonly startQuarters: number;
  readonly timeSignature: { readonly numerator: number; readonly denominator: number };
}

/** the three-state measure position: a measure number and a beat inside it. */
export interface MeasurePosition {
  readonly number: number;
  readonly beat: number;
}

/**
 * One `<part>` of the score, as `Performance.renderParts` sees it.
 *
 * This is the list the per-part sum counts, because it is the list the renderer iterates:
 * `renderParts` walks the MSM's parts and calls `resolvePartMaps(getCorrespondingPart(part), …)`,
 * so an MPM `<part>` with no MSM counterpart is never a scope and an MSM part with no MPM
 * counterpart is one anyway — inheriting the global maps wholesale.
 */
export interface MsmPartScope {
  /** Position among the MSM's `<part>` children. */
  readonly index: number;
  readonly number: number | null;
  readonly name: string | null;
  /**
   * False where the part has no `<dated>`: `renderParts` `continue`s past it, so it performs
   * nothing at all and is not a scope.
   */
  readonly rendered: boolean;
}

export interface ComparisonMsm {
  /** `max(date + duration)` over every note, in quarters; 0 for a score with no notes. */
  readonly endQuarters: number;
  readonly timeSignatures: readonly TimeSignatureEntry[];
  readonly measures: readonly MeasureEntry[];
  /** How many notes the score carries, per part number where it has one. */
  readonly noteCount: number;
  /** In document order — `renderParts`' own iteration. */
  readonly parts: readonly MsmPartScope[];
  readonly facts: MsmFacts;
}

/** A safety bound on the generated measure grid — a document, not a metronome. */
const MAX_MEASURES = 100000;

/**
 * Read an MSM tree into what the comparison needs.
 *
 * A `<timeSignature>` with an unusable `@numerator`/`@denominator` is DROPPED rather than
 * repaired: the measure grid is a reporting product, and a measure length derived from `NaN`
 * would put `NaN` into every position it labels. The renderer's own default (4/4 at 0) stands
 * in when no usable entry survives, which is also what an MSM with no map gets.
 */
export function readComparisonMsm(root: Element): ComparisonMsm {
  const facts = readMsmFacts(root);
  const ppq = facts.ppq;

  let endTicks = 0;
  let noteCount = 0;
  for (const part of facts.parts)
    for (const note of part.notes) {
      noteCount += 1;
      if (!Number.isFinite(note.date)) continue;
      const end = note.date + (Number.isFinite(note.duration) ? note.duration : 0);
      if (end > endTicks) endTicks = end;
    }

  const timeSignatures = readTimeSignatures(root, ppq);
  const endQuarters = endTicks / ppq;

  // The `<dated>` test is read from the tree rather than from `MsmFacts`, which carries notes
  // and not the element: `renderParts` skips a part with no `<dated>` before it renders
  // anything, so a part that carries one is a scope even when its score is empty.
  const elements = root.getChildElements('part').toArray();
  const parts = facts.parts.map((part): MsmPartScope => ({
    index: part.index,
    number: part.number,
    name: part.name,
    rendered: elements[part.index]?.getFirstChildElement('dated') != null,
  }));

  return {
    endQuarters,
    timeSignatures,
    measures: measureGrid(timeSignatures, endQuarters),
    noteCount,
    parts,
    facts,
  };
}

function readTimeSignatures(root: Element, ppq: number): readonly TimeSignatureEntry[] {
  const global = root.getFirstChildElement('global');
  const dated = global?.getFirstChildElement('dated') ?? null;
  const map = dated?.getFirstChildElement('timeSignatureMap') ?? null;
  if (map === null) return [];

  // Sorted on date only: two `<timeSignature>` entries at one date keep document order, which is
  // what the renderer's own forward walk sees. One document, so no orientation leaks. The sort is
  // `toSorted` because `filterMap` returns a `ReadonlyArray`, which carries no in-place `sort`.
  return filterMap(map.getChildElements('timeSignature'), (element) => {
    const date = readNumericAttributeValue(element, 'date');
    const numerator = readNumericAttributeValue(element, 'numerator');
    const denominator = readNumericAttributeValue(element, 'denominator');
    if (!Number.isFinite(date) || !(numerator > 0) || !(denominator > 0)) return null;
    return { startQuarters: date / ppq, numerator, denominator };
  }).toSorted((x, y) => x.startQuarters - y.startQuarters);
}

/** A time signature's measure length, in quarters: `numerator · 4 / denominator`. */
function measureLengthQuarters(entry: {
  readonly numerator: number;
  readonly denominator: number;
}): number {
  return (entry.numerator * 4) / entry.denominator;
}

/** The renderer's own initialisers when a score answers nothing (`MetricalAccentuationMap`). */
const RENDERER_DEFAULT_SIGNATURE = { numerator: 4, denominator: 4 };

/**
 * The measure grid, walked forward from each time signature to the next.
 *
 * Measures are numbered from 1 and the walk restarts its counting nowhere — a new time
 * signature continues the numbering, which is what a bar number means. A signature whose date
 * falls mid-measure starts a new measure at its own date, exactly as the renderer's phase
 * anchor does (the phase anchors at the TIME SIGNATURE, never at the instruction).
 */
function measureGrid(
  timeSignatures: readonly TimeSignatureEntry[],
  endQuarters: number,
): readonly MeasureEntry[] {
  const entries =
    timeSignatures.length > 0
      ? timeSignatures
      : [{ startQuarters: 0, ...RENDERER_DEFAULT_SIGNATURE }];
  const measures: MeasureEntry[] = [];
  let number = 1;

  // `withNext`, not `pairwise`: the last entry is a span too, running to `endQuarters`.
  for (const [entry, next] of withNext(entries)) {
    const until = Math.min(next?.startQuarters ?? endQuarters, endQuarters);
    const length = measureLengthQuarters(entry);
    if (!(length > 0)) continue;
    // `first + k · length`, and NOT a `start += length` accumulator: repeated addition of a
    // non-representable length compounds its rounding error once per bar. Every power-of-two
    // denominator — 4/4, 6/8, 7/8, 3/2 — gives a length that IS representable, so the corpus
    // never showed it; 5/6 gives 3.3333333333333335, and measured, the accumulated and
    // multiplied grids part company by 1.1e-13 by bar 57 and never reconverge.
    // `measurePositionAt` divides the drifted `startQuarters` into the reported `beat`, and
    // measure numbers and beats are published report fields, so the drift is observable output.
    //
    // `!(start < until)` and not `start >= until`, so a NaN `start` ends the walk rather than
    // running forever.
    for (let k = 0; ; k += 1) {
      const start = entry.startQuarters + k * length;
      if (!(start < until)) break;
      measures.push({
        number,
        startQuarters: start,
        timeSignature: { numerator: entry.numerator, denominator: entry.denominator },
      });
      number += 1;
      if (measures.length >= MAX_MEASURES) return measures;
    }
  }
  return measures;
}

/**
 * The measure and beat a position falls in, or null where no measure covers it.
 *
 * `beat` is one-based and in the denominator's own unit, so 3/4's beats are quarters and 6/8's
 * are eighths — the same reading `<accentuation @beat>` has, which is what makes a reported
 * position comparable with an authored one.
 */
export function measurePositionAt(
  measures: readonly MeasureEntry[],
  quarters: number,
): MeasurePosition | null {
  if (measures.length === 0) return null;
  // A linear scan rather than `upperBoundBy`, which would be the natural shape and is cheaper:
  // `measureGrid` builds one entry per bar up to `MAX_MEASURES` (100 000) and this is called
  // twice per reported op and twice per segment, so the product is a real quadratic. What holds
  // it here is the `NaN` answer. A `NaN` `quarters` never fires `startQuarters > quarters`, so
  // the scan runs to the end and reports `{ number: <last bar in the score>, beat: NaN }` — a bar
  // number for a position in no bar. The bound would answer `null`, which is what the docstring
  // above promises and what both call sites (`compare.measureRange`, `diff`'s
  // `measureA`/`measureB`) already handle. Changing it is a ruling about what a report says.
  let found: MeasureEntry | null = null;
  for (const measure of measures) {
    if (measure.startQuarters > quarters) break;
    found = measure;
  }
  if (found === null) return null;
  const beatLengthQuarters = 4 / found.timeSignature.denominator;
  return {
    number: found.number,
    beat: 1 + (quarters - found.startQuarters) / beatLengthQuarters,
  };
}

/**
 * The beat grid the accentuation phase anchors to, in the caller's common ticks.
 *
 * Null where the MSM carries no usable time signature, which leaves the renderer's own 4/4
 * default in force — the same answer, differently stamped.
 */
export function beatGridOf(msm: ComparisonMsm, ticksPerQuarter: number): BeatGrid | null {
  if (!isNonEmpty(msm.timeSignatures)) return null;
  const first = head(msm.timeSignatures);
  return {
    tsDate: first.startQuarters * ticksPerQuarter,
    numerator: first.numerator,
    denominator: first.denominator,
    source: 'msm',
  };
}
