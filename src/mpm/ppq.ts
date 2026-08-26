/**
 * The tick resolution symbolic time is counted in, and the units derived from it.
 *
 * MPM and MSM both count symbolic time in pulses per quarter note, and the number is a property
 * of the *document*, not of the library: `<msm pulsesPerQuarter="720">` and
 * `<performance pulsesPerQuarter="720">` both state it, and the renderer takes it as an argument
 * (`TempoMap.computeDiffTiming(date, ppq, tempo)`) rather than assuming one. Everything here
 * takes it as an argument for the same reason, so that nothing in this layer can quietly decide
 * what grid a document is on.
 *
 * {@link DEFAULT_PULSES_PER_QUARTER} is what to assume when a document declares nothing — MPM's
 * documented default, and what `Performance` falls back to when `@pulsesPerQuarter` is absent.
 * It is a **default and not a fact about the format**: a document may state any resolution it
 * likes and real ones do (480 is the other common value), so a caller that has read a document's
 * own `@pulsesPerQuarter` passes *that*, and only a caller with no document to ask reaches for
 * this.
 *
 * The derived spellings are here, named for what they mean rather than for their arithmetic, so
 * that a conversion between ticks and beats does not have to respell them. Their absence is
 * measurable: in the code this module was extracted from the resolution appeared eleven times
 * across six files in four spellings (`720`, `2880`, `4 * 720`, `720 / 4`) — four different
 * things to have to notice if the grid ever changes.
 */

/** Ticks per quarter note to assume where a document declares no `@pulsesPerQuarter`. */
export const DEFAULT_PULSES_PER_QUARTER = 720;

/** Ticks per whole note at `ppq` — the unit `@beatLength` is a fraction of. */
export const pulsesPerWhole = (ppq: number): number => 4 * ppq;

/**
 * The tick length of one beat of the given `@beatLength`, on a grid of `ppq` ticks per quarter.
 *
 * `beatLength` is a fraction of a whole note, so 0.25 is a quarter and answers `ppq` itself.
 */
export const beatLengthInTicks = (beatLength: number, ppq: number): number =>
  beatLength * pulsesPerWhole(ppq);
