import { numericBpmValue, type TempoStyle } from '../../styles/style.js';

/**
 * One `<tempo>` instruction as the renderer sees it: the two-armed sum an MPM tempo
 * actually is, with every style-relative name already resolved to a number.
 *
 * ## Why this is two types and not one
 *
 * `TempoData` — still in this directory, and still the type MEI export builds (see
 * {@link ../TempoData.ts}) — carries eleven `| null` fields for what is really a choice
 * between two shapes. A **constant** tempo has no `transition.to`, no `meanTempoAt` and no
 * `exponent`; a **transitioning** one always has all three. The nulls encode that sum, and
 * they encode it badly: reading them back cost `TempoMap` twelve non-null assertions, one
 * per place where the renderer knew something the type did not.
 *
 * Worse, the nulls admitted states the reader cannot produce and the renderer cannot
 * survive. `isConstantTempo()` was `transitionTo == null || bpm == null || transitionTo ==
 * bpm`, so a datum with a null `bpm` and a real `transitionTo` counted as *constant* — and
 * the constant path is `return tempoData.bpm!`, which hands a literal `null` back as a
 * `number`, and `15000 * … / (null * beatLength * ppq)`, which is a division by zero. That
 * state was unreachable in practice for exactly one reason ({@link numericBpmValue} falls
 * back to 100.0 and never returns null), and nothing in the type said so. Here `bpm` is a
 * `number` on both arms, which is the same fact, checked.
 *
 * ## Absence, and why there is none of it left
 *
 * The rule that governed the {@link ./distribution.ts} rewrite — *an absent attribute that
 * reaches the renderer as `null` and defines the rendered result must stay `null`* — does
 * not bite here, and it is worth saying why rather than leaving it to be rediscovered.
 * Every optional attribute of a `<tempo>` is resolved to a total value **before** any
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
 * tempo on the span reads `NaN`). That is the incumbent's behaviour and it is preserved
 * exactly: `NaN` is a number, and the arms hold numbers.
 *
 * ## What was dropped
 *
 * `xml`, `xmlId`, `styleName` and `style` were set by the reader on every instruction and
 * read by nothing: the renderer identifies a tempo by its position in the map, and the
 * style is an *input* to resolution, not a property of the resolved result. `meanTempoAt`
 * survives only on the transitioning arm — the two collapse cases (`<= 0`, `>= 1`) used to
 * leave it behind on a datum that had become constant, where again nothing read it.
 * `startDateMilliseconds` was scratch space `TempoMap.renderTempoToMap` wrote into the datum
 * and read back one iteration later; it now lives in that loop's own local, which is what it
 * always was. `exponent` was additionally filled in lazily at render time when null — dead
 * code, because the reader sets it on every transition it produces.
 *
 * Port of meico.mpm.elements.maps.data.TempoData, restructured. The Java class is the
 * union of this type and the {@link TempoData} payload; TypeScript can afford to say which
 * half it is holding.
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
 * Not exported: a `TransitioningTempo` cannot be built without going through
 * {@link resolveTempo}, so there is nowhere else that needs it. `meanTempoAt` of 0.5 gives
 * exactly 1.0 (`x / x`), which is why the no-attribute default below can hardcode the 1.0
 * rather than round-tripping through a logarithm.
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
 * The three normalisations that collapse a declared transition back to a constant are the
 * reason this is a function and not a constructor call: they matter because the two arms
 * select completely different (and very differently priced) millisecond computations —
 * one division against Simpson's rule over the whole span — and getting them wrong is not
 * visible until a timestamp moves.
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
