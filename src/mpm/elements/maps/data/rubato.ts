import type { RubatoDef } from '../../styles/defs/RubatoDef.js';

/**
 * One `<rubato>` instruction as the renderer applies it — a frame, a curve, and the
 * window inside the frame that the curve is confined to, all four of them numbers.
 *
 * ## Why every field is total
 *
 * `frameLength` has no default at all: where neither the element nor the referenced
 * `rubatoDef` supplies one there is no frame to warp, so {@link resolveRubato} answers null
 * for the whole instruction rather than carrying a null field forward. That is the only null
 * left in the type. `intensity`, `lateStart` and `earlyEnd` fall back to 1.0 / 0.0 / 1.0,
 * which is the identity warp — `(τ/frameLength)^1 * (1 - 0) + 0`, i.e. τ — which is why "the
 * element says nothing and there is no def" is a no-op here and not an error.
 * `src/comparison/rubatoCurve.ts` documents the same three defaults from the other side.
 *
 * ## Presence, not usability — and NaN travels
 *
 * An attribute the element *carries* wins over the def even when its value is unusable.
 * `<rubato frameLength="banana" name.ref="d">` does not fall back to `d`'s frame: it warps by
 * `NaN`, and every date under it comes out `NaN`.
 * `tests/comparison/malformedValues.test.ts` pins that. So the `?? ` chains below are fed
 * *absence*, never `NaN` — a present-but-malformed value arrives as `NaN`, which is not
 * nullish, and therefore short-circuits the chain the way a usable value would.
 *
 * The same holds for the boundary clamps: `NaN < 0`, `NaN > 1` and `NaN >= x` are all false,
 * so a `NaN` window is left exactly as it arrived rather than being reset to `[0, 1]`.
 *
 * Port of the read half of meico.mpm.elements.maps.data.RubatoData.
 */
export interface Rubato {
  /** `@date`, in ticks — where the first frame begins. */
  readonly startDate: number;
  /**
   * Where the instruction stops being in force: the next `<rubato>`'s date, or
   * `Number.MAX_VALUE` when there is none (`GenericMap.nextDateOfType`).
   */
  readonly endDate: number;
  /** The length of one frame, in ticks. The `%` that makes the warp repeat is modulo this. */
  readonly frameLength: number;
  /** The exponent of the power curve. 1 is the identity, above 1 delays, below 1 rushes. */
  readonly intensity: number;
  /** Where inside the frame the warped window starts, as a fraction of the frame. */
  readonly lateStart: number;
  /** Where inside the frame the warped window ends, as a fraction of the frame. */
  readonly earlyEnd: number;
  /**
   * Whether the frame repeats until {@link endDate}, or applies once and leaves the rest
   * of the span unwarped. Defaults to false, and `renderRubatoToMap` breaks out of the
   * span at the first frame boundary when it is.
   */
  readonly loop: boolean;
}

/**
 * The four rubato parameters and the loop flag as one `<rubato>` element spells them out:
 * present where the element carries the attribute, absent where it does not.
 *
 * Read in both directions. `RubatoMap.getRubatoDataOf` produces one of these from an element
 * and {@link RubatoMap.addRubato} consumes one to write an element, so a `<rubato>` written
 * from a declaration reads back as the declaration it was written from.
 *
 * Absence is `?:`, not `| null` (RULE N1): the element did not supply the attribute. A present
 * but unparseable value is `NaN` here, never absent; see the header on why that distinction is
 * the whole of the def-inheritance rule.
 */
export interface RubatoDeclaration {
  readonly frameLength?: number;
  readonly intensity?: number;
  readonly lateStart?: number;
  readonly earlyEnd?: number;
  readonly loop?: boolean;
}

/** The span a rubato instruction governs. */
export interface RubatoSpan {
  readonly startDate: number;
  readonly endDate: number;
}

/**
 * Resolve one `<rubato>` against the `rubatoDef` it references, or null where the result
 * would have no frame to warp.
 *
 * PARITY — the order is RubatoMap.java's. Each parameter is taken from the element if
 * declared, otherwise from the def, otherwise from the identity warp; `frameLength` alone
 * has no third step and rejects instead. Then the window is clamped: `lateStart` floored at
 * 0, `earlyEnd` capped at 1, and an inverted or empty window (`lateStart >= earlyEnd`)
 * widened to the whole frame rather than left to produce a degenerate transformation. The
 * clamps run in that sequence and each sees the previous one's result.
 */
export function resolveRubato(
  span: RubatoSpan,
  declared: RubatoDeclaration,
  def: RubatoDef | null,
): Rubato | null {
  const frameLength = declared.frameLength ?? def?.getFrameLength() ?? null;
  if (frameLength === null) return null;

  const intensity = declared.intensity ?? def?.getIntensity() ?? 1.0;
  let lateStart = declared.lateStart ?? def?.getLateStart() ?? 0.0;
  let earlyEnd = declared.earlyEnd ?? def?.getEarlyEnd() ?? 1.0;

  if (lateStart < 0.0) lateStart = 0.0;
  if (earlyEnd > 1.0) earlyEnd = 1.0;
  if (lateStart >= earlyEnd) {
    lateStart = 0.0;
    earlyEnd = 1.0;
  }

  return {
    ...span,
    frameLength,
    intensity,
    lateStart,
    earlyEnd,
    loop: declared.loop ?? false,
  };
}
