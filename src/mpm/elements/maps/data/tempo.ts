import { numericBpmValue, type TempoStyle } from '../../styles/style.js';

/**
 * One `<tempo>` instruction as the renderer sees it: the two-armed sum an MPM tempo
 * actually is, with every style-relative name already resolved to a number.
 *
 * ## Why this is two types and not one
 *
 * `TempoData` — still in this directory, and still the type MEI export builds (see
 * {@link ../TempoData.ts}) — carries eleven `| null` fields for what is really a choice
 * between two shapes. A constant tempo has no `transition.to`, no `meanTempoAt` and no
 * `exponent`; a transitioning one always has all three.
 *
 * ## Absence, and why there is none of it left
 *
 * The rule that governs {@link ./distribution.ts} — *an absent attribute that reaches the
 * renderer as `null` and defines the rendered result must stay `null`* — does not bite here.
 * Every optional attribute of a `<tempo>` is resolved to a total value before any
 * arithmetic sees it, by the reader, not by this type:
 *
 * - `@bpm` and `@transition.to` are run through {@link numericBpmValue}, whose third step
 *   is a hardcoded 100.0. An unresolvable name is therefore a *number*, not an absence.
 * - `@meanTempoAt` absent on a declared transition means a linear ramp — the reader
 *   substitutes 0.5 / exponent 1.0, and has always done so.
 * - `@beatLength` and `@bpm` absent make the whole instruction unreadable:
 *   `getTempoDataOf` returns null and the renderer skips to the previous instruction.
 * - The span's end is `GenericMap.nextDateOfType`, which answers `Number.MAX_VALUE` for the
 *   last instruction rather than null — "runs to the end of time", spelled as a number.
 *
 * A malformed value still travels as `NaN` (`parseFloat('x')` for `@meanTempoAt` fails both
 * `<= 0` and `>= 1`, so it becomes an exponent of `log(0.5)/log(NaN)` = `NaN`, and every
 * tempo on the span reads `NaN`). That is Java's behaviour and it is preserved exactly:
 * `NaN` is a number, and the arms hold numbers.
 *
 * Port of meico.mpm.elements.maps.data.TempoData, restructured. The Java class is the union
 * of this type and the {@link TempoData} payload.
 */

/** The span a tempo instruction governs, and the beat its bpm is counted in. */
export interface TempoSpan {
  /** `@date`, in ticks. */
  readonly startDate: number;
  /**
   * Where the instruction stops being in force: the next `<tempo>`'s date, or
   * `Number.MAX_VALUE` when there is none (`GenericMap.nextDateOfType`).
   */
  readonly endDate: number;
  /** `@beatLength` as a fraction of a whole note — 0.25 is a quarter. */
  readonly beatLength: number;
}

/** What both arms carry. */
interface TempoCommon extends TempoSpan {
  /**
   * `@bpm` as written — a number, or a style-relative name such as `"Allegro"`. Kept
   * beside the resolved {@link bpm} because serialization prefers it, so a round trip
   * keeps the original wording.
   */
  readonly bpmString: string;
  /** {@link bpmString} resolved through the style in scope; never null, see the header. */
  readonly bpm: number;
}

/**
 * A tempo that does not change over its span.
 *
 * Reached four ways: no `@transition.to` at all; a `@transition.to` resolving to the same
 * number as `@bpm`; a `@meanTempoAt` of 0 or less, which additionally *promotes*
 * `@transition.to` to be this arm's `bpm` (the tempo jumps at once and stays); and a
 * `@meanTempoAt` of 1 or more, which never leaves `@bpm`.
 */
export interface ConstantTempo extends TempoCommon {
  readonly kind: 'constant';
}

/**
 * A tempo that moves from {@link bpm} to {@link transitionTo} across its span, along a
 * power curve.
 *
 * `meanTempoAt` is the fraction of the span at which the mean of the two tempi is reached;
 * `exponent` is `log(0.5) / log(meanTempoAt)`, the power that puts it there. Both are
 * present on every value of this type, which is the whole point: the renderer's
 * `pow(progress, exponent)` has nothing to assert.
 */
export interface TransitioningTempo extends TempoCommon {
  readonly kind: 'transitioning';
  /** `@transition.to` as written; see {@link TempoCommon.bpmString}. */
  readonly transitionToString: string;
  /** {@link transitionToString} resolved through the style in scope. */
  readonly transitionTo: number;
  /** `@meanTempoAt`, strictly between 0 and 1 — or 0.5 when the attribute is absent. */
  readonly meanTempoAt: number;
  /** The power-curve exponent derived from {@link meanTempoAt}. */
  readonly exponent: number;
}

/** One resolved tempo instruction. */
export type Tempo = ConstantTempo | TransitioningTempo;

/**
 * `log(0.5) / log(meanTempoAt)` — the exponent of the power curve that reaches the mean
 * tempo at `meanTempoAt` of the way through the span.
 *
 * A `meanTempoAt` of 0.5 gives exactly 1.0 (`x / x`), which is why the no-attribute default
 * below can hardcode the 1.0 rather than round-tripping through a logarithm.
 */
function computeExponent(meanTempoAt: number): number {
  return Math.log(0.5) / Math.log(meanTempoAt);
}

/** The constant arm, spelled once so the four ways of reaching it read as four returns. */
function constantTempo(span: TempoSpan, bpmString: string, bpm: number): ConstantTempo {
  return { kind: 'constant', ...span, bpmString, bpm };
}

/**
 * Resolve the attributes of one `<tempo>` into the arm it names.
 *
 * Three normalisations collapse a declared transition back to a constant, and they matter
 * because the two arms select completely different (and very differently priced) millisecond
 * computations — one division against Simpson's rule over the whole span — and getting them
 * wrong is not visible until a timestamp moves.
 *
 * PARITY — the order of the tests is TempoMap.java's and must not be rearranged. In
 * particular `@meanTempoAt` is read only *after* `transition.to === bpm` has been ruled
 * out, and the `<= 0` / `>= 1` comparisons are made against the parsed double, so a
 * malformed `@meanTempoAt` (`NaN`, which compares false against both) falls through to the
 * transition arm and poisons the exponent rather than collapsing the instruction.
 *
 * @param transitionToString `@transition.to` as written, or null where the element has no
 *   such attribute — the one genuine absence in a `<tempo>`, and the one this function
 *   exists to turn into a choice of arm.
 * @param meanTempoAtString `@meanTempoAt` as written, or null. Parsed here rather than by
 *   the caller so that the "absent means linear" default cannot drift away from the
 *   comparisons that consume it.
 */
export function resolveTempo(
  span: TempoSpan,
  bpmString: string,
  transitionToString: string | null,
  meanTempoAtString: string | null,
  style: TempoStyle | null,
): Tempo {
  const bpm = numericBpmValue(bpmString, style);
  if (transitionToString === null) return constantTempo(span, bpmString, bpm);

  const transitionTo = numericBpmValue(transitionToString, style);
  if (transitionTo === bpm) return constantTempo(span, bpmString, bpm);

  const transition = { transitionToString, transitionTo };
  if (meanTempoAtString === null)
    return {
      kind: 'transitioning',
      ...span,
      bpmString,
      bpm,
      ...transition,
      meanTempoAt: 0.5,
      exponent: 1.0,
    };

  const meanTempoAt = parseFloat(meanTempoAtString);
  // <= 0: the mean tempo is reached before the span begins, so the instruction is the
  // target tempo, in force from the start. Note that this is the one branch that changes
  // which string survives — `addTempo` would write the target back out as `@bpm`.
  if (meanTempoAt <= 0.0) return constantTempo(span, transitionToString, transitionTo);
  // >= 1: the mean tempo is never reached, so the instruction never leaves `@bpm`.
  if (meanTempoAt >= 1.0) return constantTempo(span, bpmString, bpm);

  return {
    kind: 'transitioning',
    ...span,
    bpmString,
    bpm,
    ...transition,
    meanTempoAt,
    exponent: computeExponent(meanTempoAt),
  };
}
