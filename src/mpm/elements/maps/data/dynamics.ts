import {
  bezierPoint,
  innerControlPointsXPositions,
  sampleSegment,
  tForDate,
  type CurvePoint,
} from './bezier.js';

/**
 * One `<dynamics>` instruction as the renderer evaluates it: a loudness at the start, a
 * loudness at the end, and the cubic Bézier that gets from one to the other. Every field is
 * total — {@link resolveDynamics} fills in what the element left out, at read time, where it
 * can be seen.
 *
 * ## Why this is not a sum type, where its twin {@link ./movement.ts Movement} is
 *
 * "Constant" for dynamics is a predicate over *values* — `transitionTo === volume` — not a
 * structural fact: an instruction that spells out `transition.to="p"` while `volume="p"` is
 * constant, and one that spells out no target at all is constant with `transitionTo` filled
 * in to match, because `DynamicsMap.getDynamicsDataOf` sets it equal to `volume`. Both still
 * carry a live Bézier, because `DynamicsMap.generateSubNoteDynamics` samples the curve of
 * *any* sub-note span, constant ones included — it just comes out flat. So there is no arm on
 * which `transitionTo`, `x1` or `x2` would be absent, and {@link isConstantDynamics} is a
 * predicate rather than a discriminant.
 *
 * ## RENDERING MATH
 *
 * Everything below reproduces the Java reference bit for bit and the order is load-bearing;
 * see the header of `bezier.ts`, which owns the arithmetic these three functions arrange.
 * The two `t` endpoints in {@link tForDynamicsDate} are answers the binary search would only
 * approximate, so they are not shortcuts.
 *
 * Port of the read half of meico.mpm.elements.maps.data.DynamicsData.
 */
export interface Dynamics {
  /** `@date`, in ticks. */
  readonly startDate: number;
  /**
   * Where the instruction stops being in force: the next `<dynamics>`'s date, or
   * `Number.MAX_VALUE` when there is none (`GenericMap.nextDateOfType`).
   */
  readonly endDate: number;
  /** `@volume` as written — a number, or a style-relative name such as `"forte"`. */
  readonly volumeString: string;
  /**
   * {@link volumeString} resolved through the style in scope. Total: `numericDynamicsValue`
   * falls back to a hardcoded 100.0, so an unresolvable name is a number, not an absence.
   */
  readonly volume: number;
  /** `@transition.to` as written, or {@link volumeString} where the element declares none. */
  readonly transitionToString: string;
  /** {@link transitionToString} resolved, or {@link volume} where the element declares none. */
  readonly transitionTo: number;
  /** `@curvature`, clamped to `[0, 1]` by the reader; 0.0 where the element omits it. */
  readonly curvature: number;
  /** `@protraction`, clamped to `[-1, 1]` by the reader; 0.0 where the element omits it. */
  readonly protraction: number;
  /** `@subNoteDynamics` — this span is rendered as a channel-volume curve, not a velocity. */
  readonly subNoteDynamics: boolean;
  /**
   * The x-positions of the Bézier's two inner control points, derived from
   * {@link curvature} and {@link protraction} once, at read time.
   *
   * Part of the record rather than recomputed per sample because the sub-note sampler asks
   * for a curve point once per subdivision step, and per-note velocity asks for one per note.
   */
  readonly x1: number;
  readonly x2: number;
}

/**
 * A `<dynamics>` element's parameters **as the element declares them** — null where the
 * attribute is absent.
 *
 * The two nullable pairs are not symmetrical. `transitionToString`/`transitionTo` null
 * means "no `@transition.to`", and {@link resolveDynamics} fills both from `volume`;
 * `curvature`/`protraction` null means "no attribute", and it fills both with 0.0.
 */
export interface DeclaredDynamics {
  readonly startDate: number;
  readonly endDate: number;
  readonly volumeString: string;
  readonly volume: number;
  readonly transitionToString: string | null;
  readonly transitionTo: number | null;
  readonly curvature: number | null;
  readonly protraction: number | null;
  readonly subNoteDynamics: boolean;
}

/** Fill in what the element left out, and derive the control points. */
export function resolveDynamics(declared: DeclaredDynamics): Dynamics {
  const curvature = declared.curvature ?? 0.0;
  const protraction = declared.protraction ?? 0.0;
  const [x1, x2] = innerControlPointsXPositions(curvature, protraction);

  return {
    startDate: declared.startDate,
    endDate: declared.endDate,
    volumeString: declared.volumeString,
    volume: declared.volume,
    transitionToString: declared.transitionToString ?? declared.volumeString,
    transitionTo: declared.transitionTo ?? declared.volume,
    curvature,
    protraction,
    subNoteDynamics: declared.subNoteDynamics,
    x1,
    x2,
  };
}

/** Whether this instruction holds one level rather than moving between two. */
export function isConstantDynamics(d: Dynamics): boolean {
  return d.transitionTo === d.volume;
}

/**
 * Invert the Bézier's x-component: find the curve parameter `t` whose x lands on `date`.
 *
 * The two endpoints are answered here rather than in {@link tForDate} because the binary
 * search only converges to within one tick of its target and would return neither exactly
 * 0 nor exactly 1 for them.
 */
function tForDynamicsDate(d: Dynamics, date: number): number {
  if (date === d.startDate) return 0.0;
  if (date === d.endDate) return 1.0;

  return tForDate(d.x1, d.x2, d.startDate, d.endDate, date);
}

/** The loudness this instruction calls for at `date`. RENDERING MATH — do not reorder. */
export function dynamicsAt(d: Dynamics, date: number): number {
  if (date < d.startDate || isConstantDynamics(d)) return d.volume;
  if (date >= d.endDate) return d.transitionTo;

  const t = tForDynamicsDate(d, date);
  return (3.0 - 2.0 * t) * t * t * (d.transitionTo - d.volume) + d.volume;
}

/**
 * Sample the transition densely enough that no two consecutive samples differ in volume by
 * more than `maxStepSize`, and return the samples as `[date, volume]` pairs.
 *
 * Unlike `movement.ts`'s `movementSegment` this adds no exact endpoints and applies no
 * scaling — the raw {@link sampleSegment} series is the answer.
 */
export function subNoteDynamicsSegment(d: Dynamics, maxStepSize: number): CurvePoint[] {
  return sampleSegment(maxStepSize, (t) =>
    bezierPoint(d.x1, d.x2, d.startDate, d.endDate, d.volume, d.transitionTo, t),
  );
}
