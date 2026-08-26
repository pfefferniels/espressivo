/**
 * Fitting a `<dynamics>` or `<movement>` transition to a series of observed values — the
 * statistical counterpart of {@link dynamicsAt} and {@link positionAt}.
 *
 * Those answer *what value does this instruction call for at this date*. This answers the other
 * question: *which instruction in my vocabulary best explains these values*. A renderer never
 * asks it, which is why nothing here has a meico counterpart; anything that produces MPM from
 * measurements asks it constantly, and until now had to write its own.
 *
 * ## What this owns, and what it deliberately does not
 *
 * It owns the shape and the search. `curvature` and `protraction` are this package's attribute
 * domains — [0, 1] and [-1, 1] — and {@link innerControlPointsXPositions} is the map from them
 * to the Bézier the renderer actually draws. A caller doing the search itself has to hardcode
 * both, and the copy that prompted this module did exactly that.
 *
 * It does not own what the answer is *for*. There is no element here, no `xml:id`, no reading
 * of when a sparse series is too sparse to be worth fitting, and no opinion on when a fit is
 * good enough — {@link FitTransitionOptions.tolerance} defaults to 0, meaning "use every
 * iteration", because what counts as explained is a claim about the caller's data and not about
 * this curve. Randomness is the caller's too: pass a seeded generator and the same points fit
 * the same way every time, which is a property a reproducible pipeline needs and a library
 * cannot decide on its behalf.
 *
 * ## Why simulated annealing
 *
 * The error surface over (curvature, protraction) is not convex — protraction reflects the
 * curve about its midpoint, so two distant parameter pairs can explain the same series almost
 * equally well, and a descent from a bad start settles in the nearer of them. Annealing accepts
 * an uphill step with probability `exp(-Δ/temperature)` and so leaves such a basin early, while
 * the cooling schedule makes late steps behave like descent. The best candidate ever seen is
 * kept separately from the current one, so a late uphill step cannot lose it.
 */
import {
  bezierPoint,
  innerControlPointsXPositions,
  tForDate,
} from './elements/maps/data/bezier.js';

/** A transition's endpoints, in the domain the curve is drawn over. */
export interface TransitionSpan {
  /** `@date`, in ticks. */
  readonly startDate: number;
  /** Where the transition arrives, in ticks. */
  readonly endDate: number;
  /** The value at {@link startDate} — `@volume` for dynamics, `@position` for a movement. */
  readonly from: number;
  /** The value at {@link endDate} — `@transition.to`. */
  readonly to: number;
}

/** The two attributes that decide a transition's bend. */
export interface TransitionShape {
  /** `@curvature`, in [0, 1]. */
  readonly curvature: number;
  /** `@protraction`, in [-1, 1]. */
  readonly protraction: number;
}

/** One observation the curve is being fitted to. */
export interface CurveSample {
  /** Where it was observed, in ticks. */
  readonly date: number;
  /** What was observed there, in the same units as {@link TransitionSpan.from}. */
  readonly value: number;
}

/**
 * The knobs of the search. Every one of them is a claim about the caller's data rather than
 * about the curve, which is why none of them is a constant in this module.
 */
export interface FitTransitionOptions {
  /**
   * Where the search starts. Defaults to the straight ramp — `curvature` 0.5 with no
   * protraction — which is the shape that assumes nothing.
   */
  readonly initial?: TransitionShape;
  /**
   * The source of the search's randomness, defaulting to `Math.random`. Pass a seeded
   * generator to make a fit reproducible; the sequence of draws is part of the result, so two
   * runs agree only if this does.
   */
  readonly random?: () => number;
  /** How many candidates to try at most. Default 5000. */
  readonly maxIterations?: number;
  /**
   * Stop as soon as the total error is at or below this. Defaults to **0**, which no real
   * series reaches, so the default is "spend every iteration". What counts as close enough is
   * measured in the caller's own units — MIDI velocities, a normalized pedal position — and
   * this module has no way to judge it.
   */
  readonly tolerance?: number;
  /** The largest change either parameter may take in one step. Default 0.05. */
  readonly step?: number;
  /** The starting temperature of the annealing schedule. Default 1. */
  readonly temperature?: number;
  /** What the temperature is multiplied by after each candidate. Default 0.99. */
  readonly coolingRate?: number;
}

/** The best shape found, and what it still fails to explain. */
export interface FittedTransition extends TransitionShape {
  /** The summed absolute distance between the curve and the samples, in the samples' units. */
  readonly error: number;
}

/**
 * The value a transition holds at `date`, for the one shape `<dynamics>` and `<movement>` share.
 *
 * Takes the Bézier's inner control points rather than `curvature`/`protraction`, so a caller
 * evaluating one curve at many dates — a fit scoring its candidates, a desk drawing a segment —
 * converts once instead of per sample. {@link innerControlPointsXPositions} is that conversion.
 *
 * **The two endpoints are answered before the search, and that is not a shortcut.**
 * {@link tForDate} is a binary search that stops within one tick on the x-axis, so it returns
 * neither exactly 0 nor exactly 1 for them; a caller that skips this reads 99.93 where the
 * instruction plainly says 100. {@link dynamicsAt} and {@link positionAt} answer them for the
 * same reason, each in its own resolved form — this is the third place that rule was written
 * out, and the last one to be written by hand.
 */
export function transitionValueAt(
  x1: number,
  x2: number,
  startDate: number,
  endDate: number,
  from: number,
  to: number,
  date: number,
): number {
  if (date <= startDate) return from;
  if (from === to) return from;
  if (date >= endDate) return to;

  return bezierPoint(
    x1,
    x2,
    startDate,
    endDate,
    from,
    to,
    tForDate(x1, x2, startDate, endDate, date),
  )[1];
}

/** The summed absolute distance between one candidate shape and the samples. */
function errorOf(
  span: TransitionSpan,
  shape: TransitionShape,
  samples: readonly CurveSample[],
): number {
  const [x1, x2] = innerControlPointsXPositions(shape.curvature, shape.protraction);

  let sum = 0;
  for (const sample of samples) {
    sum += Math.abs(
      transitionValueAt(x1, x2, span.startDate, span.endDate, span.from, span.to, sample.date) -
        sample.value,
    );
  }
  return sum;
}

/**
 * One step away from `shape`, clamped back into the attribute domains.
 *
 * The clamp is what makes this the library's business rather than a caller's: `curvature`
 * outside [0, 1] and `protraction` outside [-1, 1] are not values a `<dynamics>` can carry, so
 * a search that wandered out of them would score shapes no document can express.
 */
function neighbourOf(shape: TransitionShape, step: number, random: () => number): TransitionShape {
  const protraction = shape.protraction + (random() * 2 - 1) * step;
  const curvature = shape.curvature + (random() * 2 - 1) * step;

  return {
    protraction: Math.max(Math.min(protraction, 1.0), -1.0),
    curvature: Math.max(Math.min(curvature, 1.0), 0.0),
  };
}

/**
 * Search for the `curvature` and `protraction` whose curve comes closest to `samples`.
 *
 * The span — where the transition starts and ends, and the values it runs between — is the
 * caller's to decide and is not fitted: those four numbers are what the caller already knows,
 * and only the bend is in question.
 *
 * Returns the best candidate seen, never the last one tried, so an accepted uphill step near
 * the end cannot make the answer worse than one already found.
 */
export function fitTransitionCurve(
  span: TransitionSpan,
  samples: readonly CurveSample[],
  options: FitTransitionOptions = {},
): FittedTransition {
  const {
    initial = { curvature: 0.5, protraction: 0 },
    random = Math.random,
    maxIterations = 5000,
    tolerance = 0,
    step = 0.05,
    temperature: initialTemperature = 1.0,
    coolingRate = 0.99,
  } = options;

  let current = initial;
  let error = errorOf(span, current, samples);
  let best = current;
  let bestError = error;
  let temperature = initialTemperature;

  for (let i = 0; i < maxIterations && error > tolerance; i++) {
    const neighbour = neighbourOf(current, step, random);
    const neighbourError = errorOf(span, neighbour, samples);

    if (neighbourError < bestError) {
      best = neighbour;
      bestError = neighbourError;
    }

    // The `||` short-circuits, so a downhill step costs no draw. That is part of the sequence
    // a seeded generator reproduces: moving the draw out of the condition changes every fit.
    const acceptance = Math.exp((error - neighbourError) / temperature);
    if (neighbourError < error || random() < acceptance) {
      current = neighbour;
      error = neighbourError;
    }

    temperature *= coolingRate;
  }

  return { ...best, error: bestError };
}
