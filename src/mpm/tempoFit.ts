/**
 * Recovering a `<tempo>` transition's `@meanTempoAt` — from tempi that were measured, or from
 * the time the span has to take.
 *
 * The renderer walks a transition forwards: `@bpm`, `@transition.to` and `@meanTempoAt` in,
 * a tempo at a date and a millisecond out. Both functions here run that backwards, and both
 * answer with the attribute a document can carry rather than with a curve of their own —
 * everything is evaluated through {@link resolveSpan}, so what is being fitted is the shape the
 * renderer draws and not a closed form of the curve someone believed was there.
 *
 * ## Ticks, not seconds
 *
 * A sample's `date` is a tick, and that is load-bearing rather than a convenience. `tempoAt`
 * reads a fraction of the *tick* span; a series placed on a fraction of elapsed *seconds*
 * describes a different curve, and the two coincide only at constant tempo — the one case
 * nobody fits. A caller holding times rather than dates converts them first, which is what
 * {@link dateAtMilliseconds} is for.
 *
 * ## What this does not decide
 *
 * Whether an answer is good enough, and what to do when there is none. Both functions return
 * `null` rather than a neutral 0.5 when the question is not identifiable — no interior samples,
 * a span whose endpoints are equal, an elapsed time no shape can reach — because the fallback
 * (widen the span, scale the tempi, leave the instruction alone) is a decision about the
 * document being written and not about this curve.
 */
import { tempoAt, type Tempo as ResolvedTempo } from './elements/maps/data/tempo.js';
import { millisecondsAt, resolveSpan } from './timing.js';

/**
 * A transition whose endpoints are known and whose bend is not.
 *
 * `@beatLength` is absent because it does not enter the tempo curve: `tempoAt` reads progress
 * through the span and the two endpoints, whatever beat the bpm is counted in.
 */
export interface TempoTransitionSpan {
  /** `@date`, in ticks. */
  readonly startDate: number;
  /** Where the transition arrives — the next instruction's date, in ticks. */
  readonly endDate: number;
  /** `@bpm`, resolved. */
  readonly bpm: number;
  /** `@transition.to`, resolved. */
  readonly transitionTo: number;
}

/** The same span, measurable in milliseconds — which is where `@beatLength` starts to matter. */
export interface TimedTempoTransitionSpan extends TempoTransitionSpan {
  /** `@beatLength` as a fraction of a whole note; 0.25 is a quarter. */
  readonly beatLength: number;
}

/** One observed tempo. */
export interface TempoSample {
  /** Where it was observed, in ticks. */
  readonly date: number;
  /** What was observed there, in the beat the span's `@bpm` is counted in. */
  readonly bpm: number;
}

/** The knobs of the shape search. */
export interface FitMeanTempoOptions {
  /**
   * How many candidates the initial sweep of the domain tries. Default 128. The sweep is what
   * makes the answer independent of a starting guess; the refinement below is what makes it
   * precise, so raising this buys robustness against a second minimum and not accuracy.
   */
  readonly resolution?: number;
  /**
   * How narrow the refinement's bracket has to get before it stops, in `@meanTempoAt`. Default
   * 1e-9, which a golden-section search reaches in about forty evaluations.
   */
  readonly tolerance?: number;
}

/** The best `@meanTempoAt` found, and what it still fails to explain. */
export interface FittedMeanTempo {
  /** `@meanTempoAt`, strictly between 0 and 1. */
  readonly meanTempoAt: number;
  /** The summed squared difference between the curve and the samples, in bpm². */
  readonly error: number;
}

/** The knobs of the elapsed-time search. */
export interface MeanTempoForElapsedOptions {
  /**
   * Stop as soon as the span's elapsed time is within this many milliseconds of the target.
   * Defaults to **0** — spend every step — because what counts as close enough is measured
   * against the caller's own timing and not against this curve.
   */
  readonly tolerance?: number;
  /**
   * A backstop, not a working limit: bisection halves the bracket every step, so the domain is
   * exhausted to the last double within about sixty. Default 100.
   */
  readonly maxSteps?: number;
}

/**
 * `@meanTempoAt` of 0 and 1 are not in the domain: the reader collapses both to a constant —
 * at `@transition.to` and at `@bpm` respectively — so a search that reached either would be
 * scoring a shape that is no longer a transition. Everything here stays strictly inside.
 */
const DOMAIN_MARGIN = 1e-9;
const LOWEST = DOMAIN_MARGIN;
const HIGHEST = 1 - DOMAIN_MARGIN;

/** `1/φ`, the golden-section ratio the refinement keeps its bracket at. */
const INVERSE_GOLDEN_RATIO = (Math.sqrt(5) - 1) / 2;

const clampToDomain = (meanTempoAt: number): number =>
  Math.min(Math.max(meanTempoAt, LOWEST), HIGHEST);

/** One candidate shape, resolved the way the renderer resolves it. */
const spanWith = (span: TimedTempoTransitionSpan, meanTempoAt: number): ResolvedTempo =>
  resolveSpan({
    date: span.startDate,
    endDate: span.endDate,
    beatLength: span.beatLength,
    bpm: span.bpm,
    transitionTo: span.transitionTo,
    meanTempoAt,
  });

/** The summed squared distance between one candidate shape and the samples. */
const errorOf = (
  span: TempoTransitionSpan,
  meanTempoAt: number,
  samples: readonly TempoSample[],
): number => {
  // `beatLength` cancels out of `tempoAt`, so the curve is the document's whatever is passed.
  const curve = spanWith({ ...span, beatLength: 0.25 }, meanTempoAt);

  let sum = 0;
  for (const sample of samples) {
    const difference = tempoAt(curve, sample.date) - sample.bpm;
    sum += difference * difference;
  }
  return sum;
};

/**
 * Search for the `@meanTempoAt` whose tempo curve comes closest to `samples`.
 *
 * The endpoints are the caller's and are not fitted: `@bpm` and `@transition.to` are what a
 * document already states, and only the bend is in question. Samples are read in the span's own
 * tick domain — see the module header on why that is not interchangeable with elapsed time.
 *
 * Only samples strictly inside the span are read. The endpoints carry no information about the
 * bend — every shape passes through both — and a sample outside the span carries less than
 * none, since the curve it would be scored against is one the renderer never draws there.
 *
 * Returns `null` when the question has no answer to give: no interior sample, or a span whose
 * two tempi are equal, where every `@meanTempoAt` describes the same constant.
 *
 * The sweep-then-refine is what makes this deterministic and start-independent. Squared error
 * in `@meanTempoAt` is not convex over the whole domain — the exponent is `log(0.5)/log(m)`,
 * so the shape moves fast near the ends and slowly in the middle — and a descent from a fixed
 * guess can settle on the wrong side of the mean. The sweep finds the basin, golden section
 * finds the bottom of it, and neither draws a random number.
 */
export function fitMeanTempoAt(
  span: TempoTransitionSpan,
  samples: readonly TempoSample[],
  options: FitMeanTempoOptions = {},
): FittedMeanTempo | null {
  const { resolution = 128, tolerance = 1e-9 } = options;

  if (span.endDate <= span.startDate) return null;
  if (span.bpm === span.transitionTo) return null;

  const interior = samples.filter(
    (sample) => sample.date > span.startDate && sample.date < span.endDate,
  );
  if (interior.length === 0) return null;

  const step = (HIGHEST - LOWEST) / (resolution + 1);
  let best = 0.5;
  let bestError = Infinity;

  for (let i = 1; i <= resolution; i++) {
    const candidate = LOWEST + i * step;
    const error = errorOf(span, candidate, interior);
    if (error < bestError) {
      best = candidate;
      bestError = error;
    }
  }

  // Golden section over the sweep's neighbouring cells, which bracket the minimum by
  // construction: the sweep's best beat both of them.
  let low = clampToDomain(best - step);
  let high = clampToDomain(best + step);
  let c = high - INVERSE_GOLDEN_RATIO * (high - low);
  let d = low + INVERSE_GOLDEN_RATIO * (high - low);
  let errorAtC = errorOf(span, c, interior);
  let errorAtD = errorOf(span, d, interior);

  while (high - low > tolerance) {
    if (errorAtC < errorAtD) {
      high = d;
      d = c;
      errorAtD = errorAtC;
      c = high - INVERSE_GOLDEN_RATIO * (high - low);
      errorAtC = errorOf(span, c, interior);
    } else {
      low = c;
      c = d;
      errorAtC = errorAtD;
      d = low + INVERSE_GOLDEN_RATIO * (high - low);
      errorAtD = errorOf(span, d, interior);
    }
  }

  const meanTempoAt = clampToDomain((low + high) / 2);
  const error = errorOf(span, meanTempoAt, interior);

  return error <= bestError ? { meanTempoAt, error } : { meanTempoAt: best, error: bestError };
}

/**
 * The `@meanTempoAt` at which the span takes `targetMilliseconds`, or `null` when no shape does.
 *
 * The reachable times are bounded by the two constants the reader collapses this instruction to
 * at the ends of the domain: as `@meanTempoAt` approaches 0 the whole span is played at
 * `@transition.to`, and as it approaches 1 the whole span is played at `@bpm`. A target outside
 * that interval cannot be reached by bending the curve at all, and it is the caller's business
 * what to do then — widening the span and scaling the two tempi are both answers, and both are
 * decisions about the document rather than about this curve.
 *
 * Inside the interval elapsed time is monotone in `@meanTempoAt`, in whichever direction the
 * span's tempi put it, so bisection cannot run away: every step either meets `tolerance` or
 * halves the bracket. The time it converges on is the renderer's own quadrature — Simpson's
 * rule as `computeDiffTiming` runs it — so a shape found here plays for the time it was asked
 * for, rather than for a time a rule of the caller's own agreed with.
 */
export function meanTempoAtForElapsedTime(
  span: TimedTempoTransitionSpan,
  targetMilliseconds: number,
  ppq: number,
  options: MeanTempoForElapsedOptions = {},
): number | null {
  const { tolerance = 0, maxSteps = 100 } = options;

  if (span.endDate <= span.startDate) return null;
  if (!Number.isFinite(targetMilliseconds) || targetMilliseconds <= 0) return null;

  const elapsedAt = (meanTempoAt: number): number =>
    millisecondsAt(span.endDate, spanWith(span, meanTempoAt), ppq);

  let low = LOWEST;
  let high = HIGHEST;
  const elapsedAtLow = elapsedAt(low);
  const elapsedAtHigh = elapsedAt(high);

  if (targetMilliseconds < Math.min(elapsedAtLow, elapsedAtHigh)) return null;
  if (targetMilliseconds > Math.max(elapsedAtLow, elapsedAtHigh)) return null;

  const rising = elapsedAtHigh > elapsedAtLow;

  for (let step = 0; step < maxSteps; step++) {
    const middle = (low + high) / 2;
    const elapsed = elapsedAt(middle);

    if (Math.abs(elapsed - targetMilliseconds) <= tolerance) return middle;
    // The bracket has closed on adjacent doubles; no further step can move it.
    if (middle === low || middle === high) return middle;

    if (elapsed < targetMilliseconds === rising) low = middle;
    else high = middle;
  }

  return (low + high) / 2;
}
