/**
 * The pedal deviation density and its integral.
 *
 * `p_pedal(t) = min( |position_A(t) − position_B(t)| / jnd_pedal , 2·δ_row )`, integrated over
 * the window in quarters, so the unit is JND·quarters as everywhere else. The space is a gain
 * on [0,1], not a logit: 0 and 1 are the most common authored values and a logit sends
 * them to ±∞ for a quantity whose musical meaning — pedal depth as a fraction of full travel —
 * is already linear.
 *
 * The density is capped where tempo's and dynamics' are not, because this dimension can produce
 * `⊥`: a non-monotone date component has no `date ↦ position` function at all. See
 * {@link integrateCappedAbsolute} for why a reachable `⊥` forces the value-value case through
 * the cap as well.
 *
 * ## What is integrated is the ideal Bézier (the rule 3)
 *
 * `positionAt` inverts the x-component to machine precision rather than to `tForDate`'s
 * one-tick tolerance, for the reason the module note gives. Cells where BOTH sides are live
 * transitions are subdivided into {@link BEZIER_PAIR_SUBDIVISIONS} pieces, the constant
 * fixed after measuring the 4 insufficient. That measurement was made on the dynamics
 * family and transfers because the two families are the same machinery —
 * `innerControlPointsXPositions` and the same smoothstep value fraction, differing only in
 * their defaults and their output range.
 */
import { pairwise } from '../prelude/index.js';
import { comparisonRowFor, localDistance } from './registry.js';
import { CompensatedSum, integrateCappedAbsolute } from './quadrature.js';
import { BEZIER_PAIR_SUBDIVISIONS } from './dynamicsDistance.js';
import { hasBottomIn, pedalSegmentAt, positionAt, type PedalCurve } from './pedalCurve.js';
import { isBottom } from './values.js';
import type { ComparisonWindow } from './window.js';
import { IDENTITY_CANONICAL_PAIR, canonicalValue, type CanonicalPair } from './decomposition.js';

export interface PedalCell {
  readonly startTicks: number;
  readonly endTicks: number;
  readonly startQuarters: number;
  readonly endQuarters: number;
  readonly mass: number;
  /** True where the cap bound this cell — a `⊥` span, or a difference past `2·δ_row`. */
  readonly capped: boolean;
  /**
   * `p_pedal(t)` in JND per quarter, at a position in QUARTERS. Exposed rather than
   * recomputed because the design refines segment boundaries to the ROOTS of `p_D − τ_D` and a
   * cell-quantized edge can sit many bars from the crossing. `mass` stays the authority: the
   * aggregation rescales the sampler's shape onto it.
   */
  readonly densityAt: (quarters: number) => number;
}

/** A controller one document drives and the other does not — the structural channel. */
export interface ControllerFinding {
  readonly onlyIn: 'a' | 'b';
  readonly controller: string;
}

export interface PedalDistance {
  readonly distance: number;
  readonly mean: number | null;
  readonly cells: readonly PedalCell[];
  readonly jnd: number;
  readonly capped: boolean;
  /**
   * Controller mismatches, reported and never folded into the distance.
   *
   * Two documents that pedal identically but address `sustain` against `soft` have distance 0
   * on the position curve and drive two different physical mechanisms — the same shape of
   * finding as the `@subNoteDynamics`.
   */
  readonly controllerFindings: readonly ControllerFinding[];
}

/** The sorted, deduplicated union of both curves' breakpoints, clipped to the window. */
export function pedalGridTicks(
  a: PedalCurve,
  b: PedalCurve,
  window: ComparisonWindow,
  ticksPerQuarter: number,
): readonly number[] {
  const startTicks = window.startQuarters * ticksPerQuarter;
  const endTicks = window.endQuarters * ticksPerQuarter;
  if (!(endTicks > startTicks)) return [];

  const points = new Set<number>([startTicks, endTicks]);
  for (const breakpoint of [...a.breakpointsTicks, ...b.breakpointsTicks])
    if (breakpoint > startTicks && breakpoint < endTicks) points.add(breakpoint);

  return [...points].sort((x, y) => x - y);
}

/** Controllers named by one side and not the other, in first-appearance order. */
export function controllerFindings(a: PedalCurve, b: PedalCurve): readonly ControllerFinding[] {
  const findings: ControllerFinding[] = [];
  for (const controller of a.controllers)
    if (!b.controllers.includes(controller)) findings.push({ onlyIn: 'a', controller });
  for (const controller of b.controllers)
    if (!a.controllers.includes(controller)) findings.push({ onlyIn: 'b', controller });
  return findings;
}

/**
 * `d_pedal` over the window, cell by cell.
 *
 * A cell where either side reads `⊥` is priced by {@link localDistance} times the cell length —
 * the `⊥`-ness is a property of the whole segment and the grid carries every segment boundary,
 * so it cannot change inside a cell. Everything else is integrated.
 */
export function pedalDistance(
  a: PedalCurve,
  b: PedalCurve,
  window: ComparisonWindow,
  ticksPerQuarter: number,
  jndOverride?: number,
  canonical: CanonicalPair = IDENTITY_CANONICAL_PAIR,
): PedalDistance {
  const row = comparisonRowFor('pedal/movement@position');
  const jnd = jndOverride ?? row.jnd;
  const cap = 2 * row.delta;
  const grid = pedalGridTicks(a, b, window, ticksPerQuarter);

  const cells: PedalCell[] = [];
  const total = new CompensatedSum();
  let anyCapped = false;

  for (const [cellStart, cellEnd] of pairwise(grid)) {
    const lengthQuarters = (cellEnd - cellStart) / ticksPerQuarter;

    const left = positionAt(a, cellStart);
    const right = positionAt(b, cellStart);

    let mass: number;
    let capped: boolean;
    let densityAt: (quarters: number) => number;
    if (isBottom(left) || isBottom(right)) {
      const local = localDistance(row, left, right);
      mass = local.distance * lengthQuarters;
      capped = local.capped;
      // A `⊥` cell is priced at `δ_row` for its whole length, so its density is that constant.
      densityAt = () => local.distance;
    } else {
      const difference = (ticks: number) => {
        const x = positionAt(a, ticks);
        const y = positionAt(b, ticks);
        // Unreachable while the grid carries every segment boundary — a ⊥ segment cannot
        // begin strictly inside a cell — and priced at the cap if it ever is, which is what
        // an incomparable pair costs anyway.
        if (isBottom(x) || isBottom(y)) return cap * jnd;
        return canonicalValue(canonical.a, x.value) - canonicalValue(canonical.b, y.value);
      };

      const bothBezier =
        shapeKindAt(a, cellStart) === 'bezier' && shapeKindAt(b, cellStart) === 'bezier';
      const splitPoints: number[] = [];
      if (bothBezier)
        for (let k = 1; k < BEZIER_PAIR_SUBDIVISIONS; ++k)
          splitPoints.push(cellStart + ((cellEnd - cellStart) * k) / BEZIER_PAIR_SUBDIVISIONS);

      const integral = integrateCappedAbsolute(
        (ticks) => difference(ticks) / jnd,
        cap,
        cellStart,
        cellEnd,
        splitPoints,
      );
      mass = integral.mass / ticksPerQuarter;
      capped = integral.capped;
      // The capped integrand itself (the `min(|·|, 2·δ_row)`), so the sampler and the
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
    controllerFindings: controllerFindings(a, b),
  };
}

/**
 * The pedal curve as a `SampledCurve` for the decomposition, or null where the window
 * carries a `⊥` span.
 *
 * Null rather than a substituted number, because the decomposition takes MOMENTS: a mean and a
 * variance over the window. `⊥` has no value to contribute to either, and any stand-in — 0, the
 * neighbouring value, `δ_row` — would be a number the reader would interpret as a pedal
 * position. The product is defined on curves, and a window with a hole in it has none.
 *
 * `T` for this dimension is the identity (the space is a gain), so the decomposition's `level`
 * and `gain` come out in fractions of full travel and need no unit conversion. That is not true
 * of tempo or dynamics, whose `T` is a logarithm and whose moments are in nepers.
 */
export function pedalSampler(
  curve: PedalCurve,
  window: ComparisonWindow,
  ticksPerQuarter: number,
): ((ticks: number) => number) | null {
  const startTicks = window.startQuarters * ticksPerQuarter;
  const endTicks = window.endQuarters * ticksPerQuarter;
  if (hasBottomIn(curve, startTicks, endTicks)) return null;
  return (ticks: number) => {
    const value = positionAt(curve, ticks);
    // Unreachable after the guard, and a throw rather than a fallback because a silent number
    // here would enter a mean and never be seen again.
    if (isBottom(value)) throw new Error(`⊥ pedal position at ${String(ticks)}`);
    return value.value;
  };
}

/** The shape kind governing `ticks`, for the subdivision test — null outside every segment. */
function shapeKindAt(curve: PedalCurve, ticks: number): 'constant' | 'bezier' | 'bottom' | null {
  const segment = pedalSegmentAt(curve, ticks);
  if (segment === null) return null;
  return segment.shape.kind === 'bottom' ? 'bottom' : segment.shape.value.kind;
}
