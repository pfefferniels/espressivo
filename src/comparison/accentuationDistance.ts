/**
 * The accentuation deviation density and its integral — DESIGN.md §5.4.
 *
 * `p_accentuation(t) = min( |c_A(t) − c_B(t)| / jnd_velocity , 2·δ_row )` where
 * `c(t) = scale · getAccentuationAt(beat(t))` is the per-beat velocity contribution, integrated
 * over the window in quarters. The unit is JND·quarters, and the JND is §7.1's velocity
 * constant — this is the one dimension whose curve is already in MIDI velocity units, so `T` is
 * the identity and no logarithm is involved.
 *
 * ## The integral is EXACT, and the grid is what makes it so
 *
 * `c` is **piecewise affine in score time**: `beat(t)` is affine in `t` inside one cycle, and
 * `getAccentuationAt` is affine in `beat` between two consecutive accentuations. So on a cell
 * carrying no breakpoint of either curve, the difference is affine, GL-10 integrates it
 * exactly, and the only error left is the one `integrateCappedAbsolute` removes by splitting at
 * the root and at the cap crossing. This dimension's entry in §9.3's per-family epsilon record
 * is therefore 0 in both units, as asynchrony's is.
 *
 * That rests entirely on {@link accentuationBreakpointsTicks} being complete. The curve breaks
 * at four kinds of place, and all four are enumerated there: the instruction dates, the cycle
 * wraps (`beat` jumps from its maximum back to 1), the beats of the pattern's own
 * accentuations, and — where `@loop` is off — the single tick at which the renderer breaks out
 * of the span and the contribution drops to 0.
 *
 * One discontinuity is deliberately **not** a breakpoint: `getAccentuationAt` returns
 * `@value` exactly on an accentuation's beat while approaching `@transition.from` from the
 * right, so the curve has a removable jump at a single point. A single point has measure zero
 * and cannot change an integral; GL-10's nodes are strictly interior and never land on it.
 *
 * ## Capped, for the same reason §5.8's is
 *
 * An unresolvable `accentuationPatternDef` makes the whole performance render throw (R21), so
 * this dimension reaches `⊥` — and once `⊥` is reachable at `δ_row`, the value-value case must
 * be capped at `2·δ_row` or a `⊥` document as middle term breaks the triangle inequality. See
 * `integrateCappedAbsolute`'s note.
 */
import { comparisonRowFor, localDistance } from './registry.js';
import { CompensatedSum, integrateCappedAbsolute } from './quadrature.js';
import {
  accentuationContributionAt,
  accentuationSegmentAt,
  rendererDefaultBeatGrid,
  type AccentuationCurve,
  type BeatGrid,
} from './accentuationCurve.js';
import { isBottom } from './values.js';
import type { ComparisonWindow } from './window.js';
import { IDENTITY_CANONICAL_PAIR, canonicalValue, type CanonicalPair } from './decomposition.js';

/**
 * The accentuation curve as a `SampledCurve` for §1.2's decomposition, or **null** where the
 * window carries a `⊥` span — see `pedalSampler`, whose note applies verbatim.
 *
 * `T` is the identity here too (the space is a gain-ordered one), so the decomposition's
 * `level` and `gain` come out in MIDI velocity units.
 */
export function accentuationSampler(
  curve: AccentuationCurve,
  window: ComparisonWindow,
  ticksPerQuarter: number,
  grid: BeatGrid = rendererDefaultBeatGrid(),
): ((ticks: number) => number) | null {
  const startTicks = window.startQuarters * ticksPerQuarter;
  const endTicks = window.endQuarters * ticksPerQuarter;
  const bottomInWindow = curve.segments.some(
    (segment) =>
      segment.pattern.kind === 'bottom' &&
      segment.startTicks < endTicks &&
      segment.endTicks > startTicks,
  );
  if (bottomInWindow) return null;
  return (ticks: number) => {
    const value = accentuationContributionAt(curve, ticks, ticksPerQuarter, grid);
    if (isBottom(value)) throw new Error(`⊥ accentuation contribution at ${String(ticks)}`);
    return value.value;
  };
}

export interface AccentuationCell {
  readonly startTicks: number;
  readonly endTicks: number;
  readonly startQuarters: number;
  readonly endQuarters: number;
  readonly mass: number;
  readonly capped: boolean;
  /**
   * `p_accentuation(t)` in JND per quarter, at a position in QUARTERS (AD-51.1).
   *
   * The integrand this cell's mass was computed from, exposed rather than recomputed: AD-19
   * refines segment boundaries to the ROOTS of `p_D − τ_D`, and a cell-quantized edge can sit
   * many bars from the crossing. `mass` remains the authority — the aggregation rescales the
   * sampler's shape onto it — so a sampler that disagreed with its own integral could move a
   * boundary but never a reported number.
   */
  readonly densityAt: (quarters: number) => number;
}

export interface AccentuationDistance {
  readonly distance: number;
  readonly mean: number | null;
  readonly cells: readonly AccentuationCell[];
  readonly jnd: number;
  readonly capped: boolean;
  /** Where the two documents disagree about the beat grid the phase is anchored to. */
  readonly timeSignatureSourceMismatch: boolean;
}

/**
 * Every tick at which one curve can break, inside `[startTicks, endTicks)`.
 *
 * The cycle walk is bounded by the window rather than by the span, and it is a plain counted
 * loop over cycle indices — `k` from the first cycle overlapping the window to the last — so
 * the cost is proportional to the number of measures in the window and not to the piece.
 *
 * A cycle of zero or negative length (a pattern of length 0, a denominator the document made
 * absurd) yields no breakpoints rather than looping forever; `beatAt` returns a constant 1 for
 * that case, so the curve genuinely has no interior break.
 */
export function accentuationBreakpointsTicks(
  curve: AccentuationCurve,
  startTicks: number,
  endTicks: number,
  ticksPerQuarter: number,
  grid: BeatGrid = rendererDefaultBeatGrid(),
): readonly number[] {
  const points = new Set<number>();
  const ticksPerBeat = (4 * ticksPerQuarter) / grid.denominator;

  for (const segment of curve.segments) {
    if (segment.startTicks >= endTicks || segment.endTicks <= startTicks) continue;
    points.add(segment.startTicks);
    if (Number.isFinite(segment.endTicks)) points.add(segment.endTicks);
    if (segment.pattern.kind === 'bottom') continue;

    const pattern = segment.pattern.value;
    const patternLengthTicks = (pattern.length * 4 * ticksPerQuarter) / grid.denominator;
    const cycle = segment.stickToMeasures ? ticksPerBeat * grid.numerator : patternLengthTicks;

    // @loop off: the renderer breaks out of the span one pattern length in, and the
    // contribution is 0 from there on (MetricalAccentuationMap.ts:157-161).
    const spanEnd = segment.loop
      ? segment.endTicks
      : Math.min(segment.endTicks, segment.startTicks + patternLengthTicks);
    if (!segment.loop && Number.isFinite(spanEnd)) points.add(spanEnd);

    if (!(cycle > 0) || !Number.isFinite(cycle)) continue;

    const from = Math.max(segment.startTicks, startTicks);
    const to = Math.min(spanEnd, endTicks);
    if (!(to > from)) continue;

    // Beats at which the pattern breaks: every accentuation's own beat, plus `length + 1`,
    // where `getAccentuationAt` switches to the last accentuation's @transition.to.
    const beats = [...pattern.points.map((point) => point.beat), pattern.length + 1];

    const firstCycle = Math.floor((from - grid.tsDate) / cycle);
    const lastCycle = Math.floor((to - grid.tsDate) / cycle);
    for (let k = firstCycle; k <= lastCycle; ++k) {
      const cycleStart = grid.tsDate + k * cycle;
      if (cycleStart > from && cycleStart < to) points.add(cycleStart);
      for (const beat of beats) {
        const tick = cycleStart + (beat - 1) * ticksPerBeat;
        if (tick > from && tick < to) points.add(tick);
      }
    }
  }

  return [...points].filter((tick) => tick > startTicks && tick < endTicks).sort((x, y) => x - y);
}

/** The sorted, deduplicated union of both curves' breakpoints, clipped to the window. */
export function accentuationGridTicks(
  a: AccentuationCurve,
  b: AccentuationCurve,
  window: ComparisonWindow,
  ticksPerQuarter: number,
  grid: BeatGrid = rendererDefaultBeatGrid(),
): readonly number[] {
  const startTicks = window.startQuarters * ticksPerQuarter;
  const endTicks = window.endQuarters * ticksPerQuarter;
  if (!(endTicks > startTicks)) return [];

  const points = new Set<number>([startTicks, endTicks]);
  for (const curve of [a, b])
    for (const tick of accentuationBreakpointsTicks(
      curve,
      startTicks,
      endTicks,
      ticksPerQuarter,
      grid,
    ))
      points.add(tick);

  return [...points].sort((x, y) => x - y);
}

/**
 * `d_accentuation` over the window, cell by cell.
 *
 * A cell where either side's pattern reads `⊥` is priced by {@link localDistance} times the
 * cell length: the `⊥` is a property of the whole segment, and the grid carries every segment
 * boundary, so it cannot begin inside a cell.
 */
export function accentuationDistance(
  a: AccentuationCurve,
  b: AccentuationCurve,
  window: ComparisonWindow,
  ticksPerQuarter: number,
  grid: BeatGrid = rendererDefaultBeatGrid(),
  jndOverride?: number,
  canonical: CanonicalPair = IDENTITY_CANONICAL_PAIR,
): AccentuationDistance {
  const row = comparisonRowFor('accentuation/accentuationPattern@scale');
  const jnd = jndOverride ?? row.jnd;
  const cap = 2 * row.delta;
  const cells: AccentuationCell[] = [];
  const total = new CompensatedSum();
  let anyCapped = false;

  const gridTicks = accentuationGridTicks(a, b, window, ticksPerQuarter, grid);
  const contribution = (curve: AccentuationCurve, ticks: number) =>
    accentuationContributionAt(curve, ticks, ticksPerQuarter, grid);

  for (let i = 0; i < gridTicks.length - 1; ++i) {
    const cellStart = gridTicks[i];
    const cellEnd = gridTicks[i + 1];
    const lengthQuarters = (cellEnd - cellStart) / ticksPerQuarter;

    // The cell's ⊥-ness is decided at its left edge, which is where every other dimension
    // decides a piecewise-constant property, and is sound for the same reason: right
    // continuity (A-B1) plus a grid that carries every segment boundary.
    const bottomA = accentuationSegmentAt(a, cellStart)?.pattern.kind === 'bottom';
    const bottomB = accentuationSegmentAt(b, cellStart)?.pattern.kind === 'bottom';

    let mass: number;
    let capped: boolean;
    let densityAt: (quarters: number) => number;
    if (bottomA || bottomB) {
      const local = localDistance(row, contribution(a, cellStart), contribution(b, cellStart));
      mass = local.distance * lengthQuarters;
      capped = local.capped;
      // A `⊥` cell is priced at `δ_row` for its whole length, so its density is that constant.
      densityAt = () => local.distance;
    } else {
      const difference = (ticks: number) => {
        const x = contribution(a, ticks);
        const y = contribution(b, ticks);
        // Unreachable while the grid carries every segment boundary; priced at the cap if it
        // ever is, which is what an incomparable pair costs anyway.
        if (isBottom(x) || isBottom(y)) return cap * jnd;
        return canonicalValue(canonical.a, x.value) - canonicalValue(canonical.b, y.value);
      };
      const integral = integrateCappedAbsolute(
        (ticks) => difference(ticks) / jnd,
        cap,
        cellStart,
        cellEnd,
      );
      mass = integral.mass / ticksPerQuarter;
      capped = integral.capped;
      // The capped integrand itself (AD-36.2's `min(|·|, 2·δ_row)`), so the sampler and the
      // quadrature see one function rather than two that agree by inspection.
      densityAt = (quarters) =>
        Math.min(Math.abs(difference(quarters * ticksPerQuarter)) / jnd, cap);
    }

    if (capped) anyCapped = true;
    total.add(mass);
    cells.push({
      startTicks: cellStart,
      endTicks: cellEnd,
      startQuarters: cellStart / ticksPerQuarter,
      endQuarters: cellEnd / ticksPerQuarter,
      mass,
      capped,
      densityAt,
    });
  }

  const length = window.endQuarters - window.startQuarters;
  return {
    distance: total.total,
    mean: length > 0 ? total.total / length : null,
    cells,
    jnd,
    capped: anyCapped,
    timeSignatureSourceMismatch: a.timeSignatureSource !== b.timeSignatureSource,
  };
}
