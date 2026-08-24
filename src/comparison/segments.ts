/**
 * "Which segment covers this tick?" — the question three curves ask inside the quadrature.
 *
 * `accentuationContributionAt`, `rubatoDisplacementAt` and `positionAt` each evaluate their
 * dimension at a Gauss-Legendre node, and each begins by finding the segment that governs the
 * node. As a linear scan per node — ten nodes per cell, a cell per grid interval, a grid
 * interval per breakpoint of either document — one dimension's integral cost was quadratic in
 * the size of the map it integrates. Here it is a binary search.
 *
 * ## Precondition
 *
 * `startTicks` must be non-decreasing across the array, and at most one segment may cover any
 * tick. The bound returns the last segment whose start is `<= ticks` and then tests
 * containment; a first-covering scan (accentuation, rubato) and a last-covering scan (pedal)
 * agree with it exactly when covers are unique: if segment `i` covers `t` and some `j > i`
 * also starts at or before `t`, then `start_i <= start_j <= t < end_i`, so `j` starts strictly
 * inside `i` — an overlap.
 *
 * Each of the three curves earns that by construction:
 *
 * - accentuation, rubato — every segment is `[raw.dateTicks, next?.dateTicks ?? Infinity)`
 *   over `withNext(raws)`, and a skipped raw pushes nothing, so the segments are a subsequence
 *   of the contiguous partition induced by consecutive raw dates: skips make gaps, never
 *   overlaps. Co-dated raws give a zero-width `[d, d)`, which covers nothing.
 * - pedal — lead-in, then span-and-hold per movement; `raws` is in entry order and entries
 *   are date-ordered, so `next.dateTicks >= raw.endTicks` always. The one unbounded span
 *   (`UNBOUNDED_END_TICKS`, the resurrected movement) cannot overlap anything, because
 *   `endTicksOf` returns that sentinel only when no later entry is named `movement` — which
 *   makes its movement the last raw in the list.
 *
 * All three drop non-finite dates before building raws, so no segment carries a `NaN` start:
 * `datedView` sorts a `NaN`-dated entry to the FRONT (`datedView.ts:19-27`), which would make
 * `startTicks <= ticks` non-monotone, and `partitionPoint` assumes monotone.
 *
 * ## Two members of the family are deliberately not here
 *
 * `tempoCurve.segmentAt` and `dynamicsCurve.dynamicsSegmentAt` look identical and are not. Both
 * carry two clauses a bare bound drops — an `|| !Number.isFinite(segment.endTicks)` arm that
 * makes an Infinity-ended segment cover a tick it does not contain, and a `?? last(segments)`
 * fallback where this returns `null` — and both genuinely overlap: a skipped instruction opens
 * a gap running to the next VALID one, so two consecutive skips give `[d1, dv)` and `[d2, dv)`,
 * nested with a common right end. `articulationDefault`'s two scans are left for a different
 * reason, recorded there: it is the one reader in this family with no
 * `Number.isFinite(entry.date)` guard.
 */
import { elementAtOrNull, upperBoundBy } from '../prelude/index.js';

/** The half-open span every curve segment in this module carries, in common ticks. */
export interface TickSpan {
  readonly startTicks: number;
  readonly endTicks: number;
}

/**
 * The segment covering `ticks`, right-continuous (`[start, end)`), or `null`.
 *
 * `segments` must ascend by `startTicks` and must not overlap; see this module's header.
 *
 * Both non-finite ticks answer `null`. `NaN`: `upperBoundBy`'s predicate `start <= NaN` is
 * false at every index, so the bound is 0 and the index −1. `Infinity`: the bound is
 * `segments.length`, the last segment is tested, and `Infinity < end` is false for a finite
 * end and for `Infinity` alike.
 */
export function coveringSegmentAt<S extends TickSpan>(
  segments: readonly S[],
  ticks: number,
): S | null {
  const candidate = elementAtOrNull(
    segments,
    upperBoundBy(segments, (segment) => segment.startTicks, ticks) - 1,
  );
  if (candidate === null) return null;
  return ticks < candidate.endTicks ? candidate : null;
}
