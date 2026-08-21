/**
 * The cubic-Bézier machinery `dynamics.ts` and `movement.ts` share, as pure functions over
 * plain numbers — no XML, no classes, no state (RULE C3). What stays in the callers is
 * everything the two do *differently*: movement prepends an exact start point, appends an
 * exact end point and scales values by 127; dynamics does none of that.
 *
 * RENDERING MATH. Every operation and its order here is load-bearing and reproduces the
 * Java reference bit-for-bit. In particular `((u * t + v) * t + w) * t * s` is Horner's
 * scheme and is not equal in floating point to the expanded polynomial: expanding or
 * reassociating it changes rendered values, and in {@link tForDate} it can also change the
 * binary search's iteration count.
 */
import { elementAt } from '../../../../prelude/index.js';

/**
 * One sampled point of a curve: `[date, value]` — Java's `double[2]`.
 *
 * A MUTABLE pair, deliberately: {@link sampleSegment} splices midpoints into its series and
 * `movementSegment` unshifts, pushes and scales in place, all of which a `readonly` tuple
 * would forbid. The pair form is what makes `point[1]` a number rather than a
 * `number | undefined` at each of the places that read it — including the `tuple[1] *= 127`
 * that turns a normalized position into a MIDI value.
 */
export type CurvePoint = [date: number, value: number];

/**
 * The x-positions of the two inner control points, derived from `curvature` and
 * `protraction`.
 *
 * The `protraction === 0` branch is not an optimisation — the general formula divides by
 * `protraction`. Callers are responsible for defaulting an absent `curvature`/`protraction`
 * before calling; the two callers do not share a default (0.0 for dynamics, 0.4 for a
 * movement's curvature).
 */
export function innerControlPointsXPositions(
  curvature: number,
  protraction: number,
): readonly [number, number] {
  if (protraction === 0.0) {
    return [curvature, 1.0 - curvature];
  }

  const x1 =
    curvature +
    ((Math.abs(protraction) + protraction) / (2.0 * protraction) -
      (Math.abs(protraction) / protraction) * curvature) *
      protraction;
  const x2 =
    1.0 -
    curvature +
    ((protraction - Math.abs(protraction)) / (2.0 * protraction) +
      (Math.abs(protraction) / protraction) * curvature) *
      protraction;
  return [x1, x2];
}

/**
 * Invert the Bézier's x-component: find the curve parameter `t` whose x lands on `date`.
 *
 * There is no closed form, so this is a binary search that halves its step (`tt`) each
 * round and stops once x is within one tick of the target. Callers handle the `date ===
 * startDate` and `date === endDate` endpoints themselves — they must, because they may
 * return before the control points have been computed at all.
 */
export function tForDate(
  x1: number,
  x2: number,
  startDate: number,
  endDate: number,
  date: number,
): number {
  const s = endDate - startDate;
  const offsetDate = date - startDate;
  const u = 3.0 * x1 - 3.0 * x2 + 1.0;
  const v = -6.0 * x1 + 3.0 * x2;
  const w = 3.0 * x1;

  let t = 0.5;
  let diffX = ((u * t + v) * t + w) * t * s - offsetDate;
  for (let tt = 0.25; Math.abs(diffX) >= 1.0; tt *= 0.5) {
    if (diffX > 0.0) t -= tt;
    else t += tt;
    diffX = ((u * t + v) * t + w) * t * s - offsetDate;
  }
  return t;
}

/** The curve point at parameter `t`, as the `[date, value]` pair both samplers collect. */
export function bezierPoint(
  x1: number,
  x2: number,
  startDate: number,
  endDate: number,
  from: number,
  to: number,
  t: number,
): CurvePoint {
  const result: CurvePoint = [0.0, 0.0];
  const x1_3 = 3.0 * x1;
  const x2_3 = 3.0 * x2;
  const u = x1_3 - x2_3 + 1.0;
  const v = -6.0 * x1 + x2_3;
  result[0] = ((u * t + v) * t + x1_3) * t * (endDate - startDate) + startDate;
  result[1] = (3.0 - 2.0 * t) * t * t * (to - from) + from;
  return result;
}

/**
 * Sample a curve from t=0 to t=1, subdividing until no two consecutive samples differ in
 * their *value* (element 1) by more than `maxStepSize`.
 *
 * The subdivision is adaptive: the `while` inserts a midpoint between `i` and `i+1` and
 * re-tests the *same* pair, so one gap is halved repeatedly until it is small enough.
 * `ts` and the series are spliced in lockstep, and the outer loop's `ts.length - 1` bound
 * is re-read every iteration — it must stay a plain indexed `for`, because the collection
 * grows underneath it.
 *
 * `maxStepSize` is in the value domain of whatever `point` returns; for a movement that is
 * the normalized 0..1 position domain, *not* the 0..127 range it later scales into.
 * Confusing the two is the 16129 bug of ARCHITECTURE.md §7.
 *
 * @returns the working series itself, so the caller can keep mutating it.
 */
export function sampleSegment(maxStepSize: number, point: (t: number) => CurvePoint): CurvePoint[] {
  const ts: number[] = [0.0, 1.0];
  const series: CurvePoint[] = [];
  series.push(point(0.0));
  series.push(point(1.0));

  for (let i = 0; i < ts.length - 1; ++i) {
    // `series[i]` and `ts[i]` do not move while the `while` runs: every splice inserts at
    // `i + 1`, which shifts only what is behind them.
    const from = elementAt(series, i, 'curve sample');
    const tFrom = elementAt(ts, i, 'curve parameter');
    while (Math.abs(elementAt(series, i + 1, 'curve sample')[1] - from[1]) > maxStepSize) {
      const t = (tFrom + elementAt(ts, i + 1, 'curve parameter')) * 0.5;
      ts.splice(i + 1, 0, t);
      series.splice(i + 1, 0, point(t));
    }
  }

  return series;
}
