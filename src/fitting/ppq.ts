/**
 * The tick resolution every document mpmify writes is expressed in.
 *
 * The algebra itself is espressivo's — `src/mpm/ppq.ts` takes the resolution as an argument,
 * because it is a property of the *document* and not of the library: `<msm pulsesPerQuarter="720">`
 * and `<performance pulsesPerQuarter="720">` both state it, and espressivo's renderer takes it as
 * an argument (`TempoMap.computeDiffTiming(date, ppq, tempo)`) rather than assuming one.
 *
 * What is mpmify's, and what stays here, is the **choice**: mpmify writes 720 and only 720 — it
 * is what `Alignment.serializeScore` stamps and what `Performance.fromName` is constructed with
 * — so every conversion between ticks and beats or milliseconds is entitled to use it. What none
 * of them is entitled to do is spell it out again: before this module the literal appeared eleven
 * times across six files, in four spellings (`720`, `2880`, `4 * 720`, `720 / 4`), which is four
 * different things to have to notice if the resolution ever changes.
 *
 * The derived spellings are here too, named for what they mean rather than for their arithmetic.
 */
import {
  DEFAULT_PULSES_PER_QUARTER,
  beatLengthInTicks as beatLengthInTicksAt,
  pulsesPerWhole,
} from '../mpm/ppq.js';

/** Ticks per quarter note. */
export const PULSES_PER_QUARTER = DEFAULT_PULSES_PER_QUARTER;

/** Ticks per whole note — the unit `@beatLength` is a fraction of. */
export const PULSES_PER_WHOLE = pulsesPerWhole(PULSES_PER_QUARTER);

/**
 * The tick length of one beat of the given `@beatLength`.
 *
 * `beatLength` is a fraction of a whole note, so 0.25 is a quarter and answers
 * {@link PULSES_PER_QUARTER}.
 */
export const beatLengthInTicks = (beatLength: number): number =>
  beatLengthInTicksAt(beatLength, PULSES_PER_QUARTER);
