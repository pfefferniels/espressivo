import type { Normalized } from '../../../../units.js';
import { bezierPoint, innerControlPointsXPositions, sampleSegment, tForDate } from './bezier.js';

/**
 * One `<movement>` instruction as the renderer samples it: a continuous-controller
 * position, and — where the element declares one — a target it moves towards along a
 * cubic Bézier.
 *
 * ## Why this one IS a sum, where {@link ./dynamics.ts Dynamics} is not
 *
 * The two classes were near-identical ports and shared their arithmetic (`bezier.ts`), but
 * they differ on exactly the point this rewrite turns on. `DynamicsMap` fills in an absent
 * `@transition.to` with the instruction's own `volume`, so a dynamics record always has a
 * target and "constant" is a predicate over values. `MovementMap` does not: `transitionTo`
 * stays **null**, `isConstantMovement()` tests for that null, and the two readings then take
 * structurally different paths —
 *
 * - `getDatePosition` returns `[startDate, position]` for a constant and never touches the
 *   control points, where a transition evaluates the full Bézier;
 * - `getMovementSegment` appends an exact `[endDate, transitionTo]` end point for a
 *   transition and appends nothing for a constant, so the two produce different-length
 *   series from the same sampler.
 *
 * That is a sum type with two constructors, and `src/comparison/registry.ts` already
 * describes it as one ("Absent, the movement is CONSTANT — isConstantMovement tests for
 * null, so an unparseable `@transition.to` is NOT constant: it transitions towards NaN").
 * Note that last clause: `parseFloat('x')` is `NaN`, which is not null, so a malformed
 * target still builds the **transitioning** arm and poisons the span. That is preserved —
 * `resolveMovement` branches on absence, never on usability.
 *
 * ## The nulls that were not a choice at all
 *
 * Nine more fields were nullable and none of them could be null after
 * `MovementMap.getMovementDataOf`: `position` is parsed or inherited from the previous
 * movement's `transition.to`, and where neither is available the reader logs and rejects
 * the whole instruction (PARITY.md P2); `endDate` is `GenericMap.nextDateOfType`, which
 * answers `Number.MAX_VALUE`; `curvature` and `protraction` were declared `| null` *and
 * initialised* to 0.4 / 0.0, so their null was unreachable from the first line — note 0.4,
 * deliberately not `<dynamics>`'s 0.0 (§5.8/AD-13), which is why the shared machinery in
 * `bezier.ts` shares no default. And `x1`/`x2` were a lazily-filled cache whose null meant
 * "not computed yet"; {@link innerControlPointsXPositions} is pure, so they are derived
 * once here instead.
 *
 * ## One behaviour did change, on a path nothing calls
 *
 * `getPositionAt` on a **constant** movement past its own `startDate` used to fall through
 * to `return this.transitionTo!` and hand back a literal `null` typed as `number`, or, for
 * a date inside the span, evaluate `(3-2t)t²·(null - position) + position` — which
 * JavaScript coerces to `position·(1 - (3-2t)t²)`. Java does not agree with either: it
 * unboxes a null `Double` and throws a NullPointerException at both places
 * (MovementData.java:166 and :170). Neither language has a single caller of the method —
 * it is dead in `src/`, dead in meico, and reached only from this port's tests — so no
 * rendered byte depends on the answer, and {@link positionAt} now gives the one a reader
 * would expect: **a constant movement holds its position**. That is the same answer the
 * one branch of it that *was* reachable already gave (`date <= startDate`).
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
  /** `@curvature`; **0.4** where the element omits it, and deliberately not dynamics' 0.0. */
  readonly curvature: number;
  /** `@protraction`; 0.0 where the element omits it. */
  readonly protraction: number;
  /** `@controller`; `'sustain'` by default, and the only value the MIDI export maps to CC 64. */
  readonly controller: string;
  /**
   * The x-positions of the Bézier's two inner control points, derived from
   * {@link curvature} and {@link protraction} once, at read time. Present on the constant
   * arm too, where nothing reads them — see {@link resolveMovement} on why that is cheaper
   * to say than to prevent.
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
 * already resolved (parsed, or inherited from the previous movement) by the caller.
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
 * The control points are computed for both arms, although a constant movement never
 * consults them. Two reasons: the incumbent computed them for both too — `getMovementSegment`
 * called `computeInnerControlPointsXPositions()` before looking at `transitionTo` — and
 * `innerControlPointsXPositions` is a dozen flops on values the reader already holds, so
 * moving them onto the transitioning arm alone would buy a branch and cost the reader the
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
 * single date — and dead in meico too. See the header on the one behaviour that changed.
 */
export function positionAt(m: Movement, date: number): number {
  if (date <= m.startDate) return m.position;
  if (m.kind === 'constant') return m.position;
  if (date >= m.endDate) return m.transitionTo;

  const t = tForMovementDate(m, date);
  return (3.0 - 2.0 * t) * t * t * (m.transitionTo - m.position) + m.position;
}

/** A constant movement has no curve to evaluate: every `t` yields the start point. */
function datePosition(m: Movement, t: number): number[] {
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
 * @returns `[date, value]` pairs where `value` is already `Midi7Bit` (0..127) and `date` is
 *   symbolic ticks. Deliberately left `number[][]` rather than branded tuples (RULE U4a):
 *   this is the function's own working array, spliced and mutated in place, and a `readonly`
 *   tuple type would forbid exactly that.
 */
export function movementSegment(m: Movement, maxStepSize: Normalized): number[][] {
  const series = sampleSegment(maxStepSize, (t) => datePosition(m, t));

  const beginning: number[] = [m.startDate, m.position];
  series.unshift(beginning);

  if (m.kind === 'transitioning') {
    const end: number[] = [m.endDate, m.transitionTo];
    series.push(end);
  }

  for (const tuple of series) {
    tuple[1] *= 127;
  }

  return series;
}
