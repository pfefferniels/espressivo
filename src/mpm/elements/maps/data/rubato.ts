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

/**
 * Warp one date through the rubato curve — the date the performance puts it at.
 *
 * `localDate` is the position within the current frame (the `%` is what makes the frame
 * repeat); the power curve of exponent `intensity` remaps it into the window between
 * `lateStart` and `earlyEnd`; and `date + d - localDate` puts the warped offset back onto the
 * frame's absolute start. An `intensity` of 1 is the identity over the full window, above 1
 * delays, below 1 rushes.
 *
 * The sibling of {@link tempoAt}, {@link dynamicsAt} and {@link positionAt}, and the last of the
 * four to be exported. It differs from them in what it returns — a date rather than a value, so
 * a rubato is a warp of the tick grid rather than a curve read off it — but not in what it is
 * for: a caller that must know what the renderer will do, without rendering.
 *
 * RENDERING MATH — evaluation order is load-bearing. In particular
 * `Math.pow(localDate / r.frameLength, r.intensity)` must not become `**`, and the final
 * `date + d - localDate` must not be regrouped: every performed onset in the output depends on
 * the exact bits this returns. `RubatoMap.renderRubatoToMap` calls it note by note.
 */
export function rubatoAt(r: Rubato, date: number): number {
  const localDate = (date - r.startDate) % r.frameLength;
  const d =
    (Math.pow(localDate / r.frameLength, r.intensity) * (r.earlyEnd - r.lateStart) + r.lateStart) *
    r.frameLength;
  return date + d - localDate;
}

/**
 * The exact inverse of {@link rubatoAt}: which date the rubato warped to `warpedDate`.
 *
 * The direction a renderer never asks for, and the reason it exists is the one
 * {@link dateAtMilliseconds} states for tempo — an analysis or an editing tool asks constantly.
 * Where a recorded onset falls once the warp is taken back off it is the whole of what makes
 * the deviation a `<rubato>` accounts for stop being anyone else's to explain.
 *
 * ## Closed form, not a search
 *
 * Unlike the tempo inverse, which has to invert Simpson's rule numerically, this one is
 * algebra. The forward direction maps the frame-local position τ to
 * `(τ/F)^i · (earlyEnd − lateStart) + lateStart`, in units of the frame; solving for τ is one
 * root. So there is no tolerance, no iteration count, and no starting guess — the round trip is
 * exact to floating point, where a bisection over the forward curve is exact only to whatever
 * bracket it was stopped at.
 *
 * The shape mirrors {@link rubatoAt} line for line, and for the same reason: `warpedLocal` is
 * the *warped* offset within the frame, which is what the forward direction's `d` was, so
 * `warpedDate + localDate - warpedLocal` undoes `date + d - localDate` term by term.
 *
 * ## What comes back as NaN, and why that is the answer
 *
 * The warped image of one frame is exactly `[lateStart, earlyEnd)` of it — that is what the
 * window means, and `rubatoAt` is asserted to stay inside it. Asked about a position in the
 * frame that is *not* in that image, this answers `NaN`: no date under this instruction warps
 * there. Deliberately not a clamp — a caller handed a plausible-looking tick for a position the
 * rubato cannot produce has no way to know the difference.
 *
 * The guard is written out rather than left to the arithmetic because the two ends do not fail
 * alike. Below `lateStart` the root is of a negative number and `NaN` falls out on its own;
 * above `earlyEnd` the base is merely greater than 1, so the root is a perfectly ordinary number
 * and the answer spills into the *next* frame — a date that looks entirely reasonable and is
 * wrong by a frame. One rule, stated once, covers both.
 *
 * `NaN` in is `NaN` out, at both ends: neither comparison in the guard is true of it, so it
 * reaches the root and travels, as the header says it must.
 *
 * A date before `startDate` is `NaN` for the same reason and not a special case — the renderer
 * warps nothing there (`renderRubatoToMap` skips every entry below the instruction's date), so
 * there is no warp to take back off.
 */
export function dateBeforeRubato(r: Rubato, warpedDate: number): number {
  const warpedLocal = (warpedDate - r.startDate) % r.frameLength;
  const position = (warpedLocal / r.frameLength - r.lateStart) / (r.earlyEnd - r.lateStart);
  if (position < 0 || position >= 1) return NaN;
  const localDate = Math.pow(position, 1 / r.intensity) * r.frameLength;
  return warpedDate + localDate - warpedLocal;
}
