/**
 * The MSM facts the report's MSM-dependent estimates need — and nothing else.
 *
 * the design makes this engine a pure MPM→MPM transform, with exactly one carve-out:
 * an optional MSM may be read to *describe* what the transform did, never to decide it. This
 * module is that carve-out's whole surface. It reads a score, not a performance: note dates,
 * note durations, the part identities the renderer matches on, and — when the MSM has already
 * been through a render — each note's millisecond extent.
 *
 * It re-reads the MSM rather than importing `src/msm/` for the reason `temporalValue.ts` and
 * `datedView.ts` replicate: the layer zone (eslint.config.js, `expression`) admits
 * `src/xml/**` and the MPM name constants and nothing else, because `new Mpm(text)` rewrites
 * the document in its own constructor. `new Msm(text)` is not implicated in that
 * finding, but the zone is drawn around the engine rather than around one class, and what is
 * read here is four attributes and one element path.
 *
 * ## Ticks and milliseconds are different questions, and only one is always answerable
 *
 * A note's SYMBOLIC extent — `@date`, `@duration` — is in every MSM. Its RENDERED extent —
 * `@milliseconds.date`, `@milliseconds.date.end` — exists only after a performance has been
 * applied, and no arithmetic recovers it from the score: converting ticks to milliseconds
 * needs the tempo map, i.e. a render, which the design puts out of reach. So {@link MsmNote} reports
 * the millisecond pair as `null` for a raw score, and every estimate that would compare a
 * millisecond offset against it answers `null` rather than guessing (see `estimates.ts`).
 *
 * For a caller: pass the score for the symbolic estimates, and pass `performMsm({msm, mpm})`'s
 * output — the performance of the document *before* exaggeration, which is the baseline the
 * renderer's cliffs are measured against — for the millisecond ones.
 */
import { Builder, type Element } from '../xml/XomTypes.js';
import { readAttributeValue, readNumericAttributeValue } from './attributes.js';

/** The MSM's own default tick grid, used when the root declares none. */
const DEFAULT_PPQ = 720;

/** One `<note>` of a `<score>`, in the two extents an MSM can carry. */
export interface MsmNote {
  /** `@date` — symbolic ticks at {@link MsmFacts.ppq}. `NaN` for an unparseable date. */
  readonly date: number;
  /** `@duration` — symbolic ticks. `NaN` when absent or unparseable. */
  readonly duration: number;
  /**
   * The rendered extent in milliseconds, or null when this MSM was never performed.
   *
   * Both bounds are required for the pair to be reported: `end` is what every millisecond
   * cliff compares against, and a note with an onset but no end bounds nothing.
   */
  readonly milliseconds: { readonly date: number; readonly end: number } | null;
}

/** One `<part>`, with the two identities `Performance.getCorrespondingPart` matches on. */
export interface MsmPart {
  /** Position among the MSM's `<part>` children. */
  readonly index: number;
  /** `@number` as an integer, or null when absent or unparseable. */
  readonly number: number | null;
  readonly name: string | null;
  readonly notes: readonly MsmNote[];
}

/** Everything `estimates.ts` may know about the score. */
export interface MsmFacts {
  readonly ppq: number;
  readonly parts: readonly MsmPart[];
}

/**
 * Parse MSM text into a raw XOM tree, with no MSM class constructed.
 *
 * Validation is well-formedness only, exactly as `mpmDocument.parseMpmRoot` does it: the root
 * element's name is the facade's check to make and its error is the facade's to type — which
 * is why the parse and the read below are two functions rather than one.
 *
 * @throws {ParsingException} from `Builder`, for malformed XML — the facade wraps it.
 */
export function parseMsmRoot(text: string): Element {
  return new Builder().build(text).getRootElement();
}

/** The facts of an MSM tree held by its `<msm>` root. */
export function readMsmFacts(root: Element): MsmFacts {
  const ppq = readNumericAttributeValue(root, 'pulsesPerQuarter');
  return {
    ppq: Number.isFinite(ppq) && ppq > 0 ? ppq : DEFAULT_PPQ,
    parts: root
      .getChildElements('part')
      .toArray()
      .map((part, index) => readPart(part, index)),
  };
}

function readPart(part: Element, index: number): MsmPart {
  const number = readNumericAttributeValue(part, 'number');
  return {
    index,
    number: Number.isFinite(number) ? number : null,
    name: readAttributeValue(part, 'name'),
    notes: noteElements(part).map(readNote),
  };
}

/** `<part><dated><score><note>`, navigated with the child walkers the design permits. */
function noteElements(part: Element): readonly Element[] {
  const dated = part.getFirstChildElement('dated');
  if (dated === null) return [];
  const score = dated.getFirstChildElement('score');
  if (score === null) return [];
  return score.getChildElements('note').toArray();
}

function readNote(note: Element): MsmNote {
  const millisecondsDate = readNumericAttributeValue(note, 'milliseconds.date');
  const millisecondsEnd = readNumericAttributeValue(note, 'milliseconds.date.end');
  return {
    date: readNumericAttributeValue(note, 'date'),
    duration: readNumericAttributeValue(note, 'duration'),
    milliseconds:
      Number.isFinite(millisecondsDate) && Number.isFinite(millisecondsEnd)
        ? { date: millisecondsDate, end: millisecondsEnd }
        : null,
  };
}

/**
 * The shortest note in the score, in symbolic ticks — the length every tick-domain cliff is
 * measured against.
 *
 * Zero-length and unparseable notes are excluded: a grace note written `duration="0"` is
 * inverted by *every* positive offset, so counting it would make every site "at risk" and the
 * estimate would carry no information. Null when the score has no positive-duration note.
 */
export function shortestNoteInTicks(facts: MsmFacts): number | null {
  return shortest(facts, (note) => (note.duration > 0 ? note.duration : null));
}

/**
 * The shortest note in the score, in milliseconds, or null when this MSM was never performed.
 *
 * Same exclusion as {@link shortestNoteInTicks}, and for the same reason.
 */
export function shortestNoteInMilliseconds(facts: MsmFacts): number | null {
  return shortest(facts, (note) => {
    if (note.milliseconds === null) return null;
    const length = note.milliseconds.end - note.milliseconds.date;
    return length > 0 ? length : null;
  });
}

function shortest(facts: MsmFacts, lengthOf: (note: MsmNote) => number | null): number | null {
  let smallest: number | null = null;
  for (const part of facts.parts) {
    for (const note of part.notes) {
      const length = lengthOf(note);
      if (length === null || !Number.isFinite(length)) continue;
      if (smallest === null || length < smallest) smallest = length;
    }
  }
  return smallest;
}
