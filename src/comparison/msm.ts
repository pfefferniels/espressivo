/**
 * What the comparison reads from an optional MSM — the score behind the two performances.
 *
 * §9.2 makes `msm` **part of the metric, not a report-only side input** (A11): it moves the
 * window (§5.0's `'msm'` rule), the measure mapping (C3) and the beat grid the accentuation
 * phase is anchored to (AD-12). So this module is small and its boundaries are stated rather
 * than assumed.
 *
 * ## What it reads, and what it deliberately does not
 *
 * The score end, the global `<timeSignatureMap>`, and the measure grid that follows from the
 * two. The note-level facts stay in `expression/msmFacts.ts`, which already reads them and is
 * reused here rather than reimplemented — that module exists for the same layering reason this
 * one does, and two readers of one format is how they drift.
 *
 * **AD-12's forward-only `timeSignatureMap` walk is NOT implemented in full**, and the shortfall
 * is reported rather than hidden. `accentuationDistance` takes ONE {@link BeatGrid}, so a meter
 * that changes mid-piece would need the evaluator to take a grid FUNCTION and to add a
 * breakpoint at every change — a cut-1 module extension, outside this wave. A map with exactly
 * one time signature is therefore exact (the renderer's forward walk never advances either),
 * and a map with several uses the first and earns an `estimate-degradation` note naming the
 * limitation. Using the first is strictly better than the 4/4-at-0 default it replaces, and
 * saying so is what keeps it from being mistaken for the ruled behaviour.
 *
 * ## Ticks are converted once, here
 *
 * An MSM declares its own `@pulsesPerQuarter` and it need not match either MPM's. Everything
 * this module returns is therefore in QUARTERS, or in common ticks derived from a caller-
 * supplied grid — never in the MSM's own ticks, which nothing downstream knows how to read.
 */
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

/** §9.3's `measures` row (C3). */
export interface MeasureEntry {
  readonly number: number;
  readonly startQuarters: number;
  readonly timeSignature: { readonly numerator: number; readonly denominator: number };
}

/** C3's three-state measure position: a measure number and a beat inside it. */
export interface MeasurePosition {
  readonly number: number;
  readonly beat: number;
}

export interface ComparisonMsm {
  /** `max(date + duration)` over every note, in quarters; 0 for a score with no notes. */
  readonly endQuarters: number;
  readonly timeSignatures: readonly TimeSignatureEntry[];
  readonly measures: readonly MeasureEntry[];
  /** How many notes the score carries, per part number where it has one. */
  readonly noteCount: number;
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

  return {
    endQuarters,
    timeSignatures,
    measures: measureGrid(timeSignatures, endQuarters),
    noteCount,
    facts,
  };
}

function readTimeSignatures(root: Element, ppq: number): readonly TimeSignatureEntry[] {
  const global = root.getFirstChildElement('global');
  const dated = global?.getFirstChildElement('dated') ?? null;
  const map = dated?.getFirstChildElement('timeSignatureMap') ?? null;
  if (map === null) return [];

  const entries: TimeSignatureEntry[] = [];
  for (const element of map.getChildElements('timeSignature').toArray()) {
    const date = readNumericAttributeValue(element, 'date');
    const numerator = readNumericAttributeValue(element, 'numerator');
    const denominator = readNumericAttributeValue(element, 'denominator');
    if (!Number.isFinite(date) || !(numerator > 0) || !(denominator > 0)) continue;
    entries.push({ startQuarters: date / ppq, numerator, denominator });
  }
  return entries.sort((x, y) => x.startQuarters - y.startQuarters);
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
 * anchor does (AD-12: the phase anchors at the TIME SIGNATURE, never at the instruction).
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

  for (const [index, entry] of entries.entries()) {
    const next = entries[index + 1] as TimeSignatureEntry | undefined;
    const until = Math.min(next?.startQuarters ?? endQuarters, endQuarters);
    const length = measureLengthQuarters(entry);
    if (!(length > 0)) continue;
    for (let start = entry.startQuarters; start < until; start += length) {
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
 * The beat grid the accentuation phase anchors to (AD-12), in the caller's common ticks.
 *
 * Null where the MSM carries no usable time signature, which leaves the renderer's own 4/4
 * default in force — the same answer, differently stamped.
 */
export function beatGridOf(msm: ComparisonMsm, ticksPerQuarter: number): BeatGrid | null {
  const first = msm.timeSignatures[0] as TimeSignatureEntry | undefined;
  if (first === undefined) return null;
  return {
    tsDate: first.startQuarters * ticksPerQuarter,
    numerator: first.numerator,
    denominator: first.denominator,
    source: 'msm',
  };
}
