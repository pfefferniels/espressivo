import type { Normalized } from '../../../../units.js';
import {
  bezierPoint,
  innerControlPointsXPositions,
  sampleSegment,
  tForDate,
  type CurvePoint,
} from './bezier.js';

/**
 * One `<movement>` instruction as the renderer samples it: a continuous-controller
 * position, and — where the element declares one — a target it moves towards along a
 * cubic Bézier.
 *
 * ## Why this one IS a sum, where {@link ./dynamics.ts Dynamics} is not
 *
 * `DynamicsMap` fills in an absent `@transition.to` with the instruction's own `volume`, so a
 * dynamics record always has a target and "constant" is a predicate over values.
 * `MovementMap` does not: `transitionTo` stays null, `isConstantMovement()` tests for that
 * null, and the two readings then take structurally different paths —
 *
 * - `getDatePosition` returns `[startDate, position]` for a constant and never touches the
 *   control points, where a transition evaluates the full Bézier;
 * - `getMovementSegment` appends an exact `[endDate, transitionTo]` end point for a
 *   transition and appends nothing for a constant, so the two produce different-length
 *   series from the same sampler.
 *
 * `src/comparison/registry.ts` describes the same split ("Absent, the movement is CONSTANT —
 * isConstantMovement tests for null, so an unparseable `@transition.to` is NOT constant: it
 * transitions towards NaN"). Note that last clause: `parseFloat('x')` is `NaN`, which is not
 * null, so a malformed target still builds the transitioning arm and poisons the span.
 * {@link resolveMovement} branches on absence, never on usability.
 *
 * ## A deliberate divergence, on a path nothing calls
 *
 * {@link positionAt} on a constant movement past its own `startDate` answers `position`: a
 * constant movement holds its position. Java disagrees — it unboxes a null `Double` and
 * throws a NullPointerException at both places that could be asked (MovementData.java:166 and
 * :170). The method has no caller in either language, being dead in `src/`, dead in meico and
 * reached only from this port's tests, so no rendered byte depends on the answer.
 *
 * ## RENDERING MATH
 *
 * {@link movementSegment} is on the rendering path and every operation in it is
 * load-bearing; the arithmetic itself lives in `bezier.ts`, whose header owns the rules.
 * The start point is unshifted onto the front and the end point pushed onto the back
 * *after* subdivision, so the series deliberately begins and ends with an exact, unsampled
 * endpoint — and the first pair is therefore duplicated whenever the sampled t=0 point
 * coincides with it. Then every value is scaled by 127 in place.
 *
 * Port of the read half of meico.mpm.elements.maps.data.MovementData.
 */

/** What both arms carry. */
interface MovementCommon {
  /** `@date`, in ticks. */
  readonly startDate: number;
  /**
   * Where the instruction stops being in force: the next `<movement>`'s date, or
   * `Number.MAX_VALUE` when there is none (`GenericMap.nextDateOfType`).
   */
  readonly endDate: number;
  /** `@position`, normalized 0..1; {@link movementSegment} scales it to 0..127 on the way out. */
  readonly position: Normalized;
  /** `@curvature`; 0.4 where the element omits it — deliberately not dynamics' 0.0 (§5.8). */
  readonly curvature: number;
  /** `@protraction`; 0.0 where the element omits it. */
  readonly protraction: number;
  /** `@controller`; `'sustain'` by default, and the only value the MIDI export maps to CC 64. */
  readonly controller: string;
  /**
   * The x-positions of the Bézier's two inner control points, derived from
   * {@link curvature} and {@link protraction} once, at read time. Present on the constant arm
   * too, where nothing reads them — see {@link resolveMovement}.
   */
  readonly x1: number;
  readonly x2: number;
}

/** A movement that holds one position: the element declares no `@transition.to`. */
export interface ConstantMovement extends MovementCommon {
  readonly kind: 'constant';
}

/** A movement that travels from {@link position} to {@link transitionTo} across its span. */
export interface TransitioningMovement extends MovementCommon {
  readonly kind: 'transitioning';
  /** `@transition.to`, normalized 0..1. `NaN` for an unparseable value — see the header. */
  readonly transitionTo: Normalized;
}

/** One resolved movement instruction. */
export type Movement = ConstantMovement | TransitioningMovement;

/**
 * A `<movement>` element's parameters **as the element declares them**, with `position`
 * already resolved by the caller — parsed, or inherited from the previous movement's
 * `@transition.to`, and where neither is available the reader rejects the whole instruction
 * (PARITY.md P2).
 *
 * `transitionTo` null means "no `@transition.to`" and selects the constant arm;
 * `curvature`/`protraction` null mean "no attribute" and take the defaults above.
 */
export interface DeclaredMovement {
  readonly startDate: number;
  readonly endDate: number;
  readonly position: Normalized;
  readonly transitionTo: Normalized | null;
  readonly curvature: number | null;
  readonly protraction: number | null;
  readonly controller: string | null;
}

/** `@curvature`'s default. 0.4, and see {@link MovementCommon.curvature}. */
const DEFAULT_CURVATURE = 0.4;
/** `@protraction`'s default. */
const DEFAULT_PROTRACTION = 0.0;
/** `@controller`'s default. */
const DEFAULT_CONTROLLER = 'sustain';

/**
 * Fill in what the element left out, derive the control points, and pick the arm.
 *
 * The control points are computed for both arms, although a constant movement never consults
 * them: `innerControlPointsXPositions` is a dozen flops on values the reader already holds,
 * so moving them onto the transitioning arm alone would buy a branch and cost the reader the
 * ability to say `...common` once.
 */
export function resolveMovement(declared: DeclaredMovement): Movement {
  const curvature = declared.curvature ?? DEFAULT_CURVATURE;
  const protraction = declared.protraction ?? DEFAULT_PROTRACTION;
  const [x1, x2] = innerControlPointsXPositions(curvature, protraction);

  const common: MovementCommon = {
    startDate: declared.startDate,
    endDate: declared.endDate,
    position: declared.position,
    curvature,
    protraction,
    controller: declared.controller ?? DEFAULT_CONTROLLER,
    x1,
    x2,
  };

  return declared.transitionTo === null
    ? { ...common, kind: 'constant' }
    : { ...common, kind: 'transitioning', transitionTo: declared.transitionTo };
}

/**
 * Invert the Bézier's x-component to find the curve parameter `t` for `date`.
 *
 * The two endpoints are answered here rather than in {@link tForDate} because the binary
 * search only converges to within one tick and would return neither exactly 0 nor exactly 1.
 */
function tForMovementDate(m: TransitioningMovement, date: number): number {
  if (date === m.startDate) return 0.0;
  if (date === m.endDate) return 1.0;

  return tForDate(m.x1, m.x2, m.startDate, m.endDate, date);
}

/**
 * The controller position at `date`, in the normalized 0..1 domain.
 *
 * Dead on the rendering path — `MovementMap` samples whole segments and never asks for a
 * single date — and dead in meico too. See the header on the constant arm's divergence.
 */
export function positionAt(m: Movement, date: number): number {
  if (date <= m.startDate) return m.position;
  if (m.kind === 'constant') return m.position;
  if (date >= m.endDate) return m.transitionTo;

  const t = tForMovementDate(m, date);
  return (3.0 - 2.0 * t) * t * t * (m.transitionTo - m.position) + m.position;
}

/** A constant movement has no curve to evaluate: every `t` yields the start point. */
function datePosition(m: Movement, t: number): CurvePoint {
  if (m.kind === 'constant') return [m.startDate, m.position];

  return bezierPoint(m.x1, m.x2, m.startDate, m.endDate, m.position, m.transitionTo, t);
}

/**
 * Sample the movement as `[date, value]` pairs, subdividing adaptively until no two
 * consecutive samples differ by more than `maxStepSize`. RENDERING MATH — see the header.
 *
 * @param maxStepSize in the **normalized 0..1** position domain — the domain the
 *   subdivision compares against, not the 0..127 one the result is scaled into. Feeding it
 *   a 0..127 threshold is the 16129 bug of ARCHITECTURE.md §7.
 * @returns `[date, value]` pairs where `date` is symbolic ticks and `value` is already
 *   0..127. The array is this function's own working state, spliced and mutated in place.
 */
export function movementSegment(m: Movement, maxStepSize: Normalized): CurvePoint[] {
  const series = sampleSegment(maxStepSize, (t) => datePosition(m, t));

  const beginning: CurvePoint = [m.startDate, m.position];
  series.unshift(beginning);

  if (m.kind === 'transitioning') {
    const end: CurvePoint = [m.endDate, m.transitionTo];
    series.push(end);
  }

  for (const tuple of series) {
    tuple[1] *= 127;
  }

  return series;
}
