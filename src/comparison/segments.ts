/**
 * "Which segment covers this tick?" — the question three curves ask inside the quadrature.
 *
 * `accentuationContributionAt`, `rubatoDisplacementAt` and `positionAt` each evaluate their
 * dimension at a Gauss-Legendre node, and each begins by finding the segment that governs the
 * node. Written out, that was a linear scan per node — ten nodes per cell, a cell per grid
 * interval, and a grid interval per breakpoint of either document — so the cost of one
 * dimension's integral was quadratic in the size of the map it integrates. This is that scan,
 * named once and answered with a binary search.
 *
 * ## The precondition, which the scans it replaces already relied on
 *
 * Every one of them ended with a `break`:
 *
 * ```ts
 * for (const segment of segments) {
 *   if (ticks < segment.startTicks) break;    // <- only correct if starts ascend
 *   if (ticks < segment.endTicks) return segment;
 * }
 * ```
 *
 * That `break` is already an assertion that `startTicks` is non-decreasing across the array, so
 * `upperBoundBy` adds no assumption; it uses the same one to skip the elements the scan was
 * walking. What it DOES add is a second requirement, and it is worth stating because it is the
 * one a future segment kind could break:
 *
 * **At most one segment may cover any tick.** The scan returns the FIRST covering segment
 * (accentuation, rubato) or the LAST (pedal); the bound returns the last segment whose start is
 * `<= ticks` and then tests containment. Those three agree exactly when covers are unique, and
 * they agree because of this: if segment `i` covers `t` and some `j > i` also starts at or
 * before `t`, then `start_i <= start_j <= t < end_i`, so `j` starts strictly inside `i` — an
 * overlap. With disjoint segments, the covering one IS the last one that starts in time.
 *
 * Each of the three curves earns that, by construction rather than by convention:
 *
 * - **accentuation, rubato** — every segment is `[raw.dateTicks, next?.dateTicks ?? Infinity)`
 *   over `withNext(raws)`, and a skipped raw pushes nothing. So the segments are a subsequence
 *   of the contiguous partition induced by consecutive raw dates: skips make gaps, never
 *   overlaps. Co-dated raws give a zero-width `[d, d)`, which covers nothing and cannot be the
 *   last candidate for a tick an earlier segment covers, since every later segment starts at or
 *   after this one's end.
 * - **pedal** — the timeline is lead-in, then span-and-hold per movement, and its own assembly
 *   comment states the abutment: *"`raws` is in entry order and entries are date-ordered, so
 *   `next.dateTicks >= raw.endTicks` always"*. The one unbounded span (`UNBOUNDED_END_TICKS`,
 *   AD-35's resurrected movement) cannot overlap anything, because `endTicksOf` returns that
 *   sentinel only when no later entry is named `movement` — which makes its movement the last
 *   raw in the list.
 *
 * All three also drop non-finite dates before building raws, so no segment carries a `NaN`
 * start. That matters: `datedView` sorts a `NaN`-dated entry to the FRONT (`datedView.ts:19-27`),
 * which would make `startTicks <= ticks` non-monotone, and `partitionPoint` assumes monotone.
 *
 * ## Two members of the family are deliberately NOT here
 *
 * `tempoCurve.segmentAt` and `dynamicsCurve.dynamicsSegmentAt` look identical and are not. Both
 * carry two extra clauses a bare bound drops — an `|| !Number.isFinite(segment.endTicks)` arm
 * that makes an Infinity-ended segment count as covering even a tick it does not contain, and a
 * `?? last(segments)` fallback that returns the last segment where this returns `null`. Both
 * also genuinely overlap: a skipped instruction opens a gap running to the next VALID one, so
 * two consecutive skips give `[d1, dv)` and `[d2, dv)`, nested with a common right end. They are
 * left as scans, with the reason recorded at each.
 *
 * `articulationDefault`'s two scans are left for a different reason, recorded there: it is the
 * one reader in this family with no `Number.isFinite(entry.date)` guard.
 */
import { elementAtOrNull, upperBoundBy } from '../prelude/index.js';

/** The half-open span every curve segment in this module carries, in common ticks. */
export interface TickSpan {
  readonly startTicks: number;
  readonly endTicks: number;
}

/**
 * The segment covering `ticks`, right-continuous (`[start, end)`, A-B1), or `null`.
 *
 * `segments` must ascend by `startTicks` and must not overlap; see this module's header for
 * why each caller has that and why it is not a new assumption.
 *
 * **The two non-finite ticks answer exactly as the scans did.** A `NaN` tick: `upperBoundBy`'s
 * predicate `start <= NaN` is false at every index, so the bound is 0, the index is −1 and the
 * answer is `null` — which is what a scan returns too, since `NaN < start` never breaks it and
 * `NaN < end` never returns. An `Infinity` tick: the bound is `segments.length`, the last
 * segment is tested, `Infinity < end` is false for a finite end and false for `Infinity` as
 * well, so the answer is `null` — again the scan's own answer.
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
