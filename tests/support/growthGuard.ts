/**
 * Retry wrapper for the suite's complexity guards.
 *
 * Several tests assert that a function's cost grows *linearly* by measuring how much dearer
 * one call gets when the input grows by a fixed factor, and requiring the ratio to stay under
 * a threshold placed between the linear and quadratic bands. Measuring a ratio rather than a
 * duration is what makes those guards portable — machine speed cancels — and taking the
 * fastest of several batches is what makes them resist noise, because noise only ever adds
 * time.
 *
 * Neither trick survives a sustained load spike that lands on the large measurement and not
 * the small one, which under the concurrent load this repo is developed with reds the gate at
 * random. The answer is to re-measure rather than to widen the threshold: widening trades away
 * the guard's ability to catch a reintroduced quadratic, whereas a retry costs nothing in
 * precision. A genuine quadratic exceeds the threshold on every attempt; a descheduled process
 * does not.
 */

/**
 * The lowest growth ratio `measure` reports across up to `attempts` runs, stopping as soon as
 * one comes in under `threshold`.
 *
 * The happy path measures exactly once: only a ratio that looks bad pays for a second look.
 */
export function bestGrowthRatio(measure: () => number, threshold: number, attempts = 3): number {
  let best = Infinity;
  for (let attempt = 0; attempt < attempts; ++attempt) {
    best = Math.min(best, measure());
    if (best < threshold) break;
  }
  return best;
}
