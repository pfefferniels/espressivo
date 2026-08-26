/**
 * The tick ⇄ millisecond algebra under a `<tempo>` instruction, in both directions.
 *
 * One direction is the renderer's own arithmetic, made reachable without a map to ask:
 * {@link resolveSpan} is `resolveTempo`, {@link getTempoAt} is `tempoAt`, and
 * {@link millisecondsAt} is `TempoMap.computeDiffTiming` — Simpson's rule and all, held
 * byte-equivalent to meico. Nothing here reimplements any of them.
 *
 * The other direction is the one a renderer never needs and therefore does not have.
 * {@link ticksForConstantTempo} and {@link dateAtMilliseconds} answer *which tick is this
 * millisecond*: where a recorded onset falls on the symbolic grid, which tick an ornament's
 * frame reaches back to, what date a target elapsed time names. `renderTempoToMap` walks
 * forwards through a map and never has occasion to ask; an analysis or an editing tool asks
 * constantly.
 *
 * ## Why the forward direction delegates rather than duplicating
 *
 * A hand-copy of `resolveTempo` + `tempoAt` + `computeDiffTiming` did exist above this layer,
 * and it had drifted. The four ways are on the record here because each is a plausible reading
 * of the spec and each is wrong:
 *
 * - `meanTempoAt` of exactly 1 gave `pow(x, -Infinity)`, so the tempo read as ±Infinity where
 *   meico reads a constant at `@bpm`;
 * - a `meanTempoAt` above 1 overshot both endpoints (256 bpm on a 60→120 ramp) instead of the
 *   same constant;
 * - a negative one gave `NaN` where meico gives a constant at `@transition.to`;
 * - `|| 0.5` turned an *explicit* `meanTempoAt="0"` into a linear ramp, where meico makes it a
 *   constant at the target, and swallowed a malformed one into a linear ramp as well.
 *
 * The last is worth stating plainly, because it is the one that surfaces as a change of
 * behaviour: a document with `meanTempoAt="x"` used to be measured quietly against a ramp the
 * renderer would never draw, and now reads `NaN` throughout its span. That is the intended
 * outcome — `NaN` is what meico produces there too. The renderer's answer is the one that
 * decides what a document sounds like, so matching it is correctness and not precision.
 *
 * ## `ppq`
 *
 * Every function that crosses between ticks and milliseconds takes the document's
 * `@pulsesPerQuarter` as an argument, exactly as `TempoMap.computeDiffTiming` does. See
 * `./ppq.js` for why this layer has a default but no constant.
 */
import { TempoMap, type AddTempoOptions } from './elements/maps/TempoMap.js';
import { resolveTempo, tempoAt, type Tempo as ResolvedTempo } from './elements/maps/data/tempo.js';

export interface WithEndDate {
  endDate: number;
}

/**
 * A `<tempo>` as the document states it, plus the date the next one takes over.
 *
 * `@endDate` is not an MPM attribute and never was: it is the window a span is evaluated over,
 * which every one of these functions needs and which the instruction itself does not carry. A
 * reader gets it from `GenericMap.nextDateOfType`, which answers `Number.MAX_VALUE` for the last
 * instruction of a map — "runs to the end of time", spelled as a number.
 */
export type TempoWithEndDate = AddTempoOptions & WithEndDate;

// ── resolving one instruction ─────────────────────────────────────

/**
 * One `<tempo>`'s attributes, resolved the way the renderer resolves them.
 *
 * Everything downstream of this call is the renderer's: the choice between the constant and the
 * transitioning arm, the power-curve exponent, and the defaults for the attributes that are
 * absent. Three of those normalisations are the ones the hand-written version got wrong (see the
 * module header), and they are made here, once, rather than at each evaluation.
 *
 * Exported because it is worth calling once per span and then evaluating many times: it parses
 * `@bpm` and `@transition.to` out of text, and a walk over a score asks about the same span once
 * per note. `tempoAt`, {@link millisecondsAt} and {@link dateAtMilliseconds} all take the result
 * rather than the options record.
 *
 * `@bpm` and `@transition.to` go across as text because that is what `resolveTempo` resolves
 * from: a style-relative name (`"Allegro"`) is as legal an `@bpm` as a number. `String(x)`
 * round-trips a double exactly, so a numeric one is unchanged.
 *
 * No style is in scope here, because an options record is a bare set of attributes with no
 * `<tempoDef>` collection behind it: an unresolvable name therefore lands on meico's default of
 * 100.0 rather than on the `NaN` arithmetic a string would otherwise give. A caller holding a
 * real document should use `TempoMap.getTempoDataOf`, which scans backwards for the `<style>` in
 * scope and passes it.
 */
export const resolveSpan = (tempo: TempoWithEndDate): ResolvedTempo =>
  resolveTempo(
    {
      startDate: tempo.date,
      endDate: tempo.endDate,
      beatLength: tempo.beatLength,
    },
    String(tempo.bpm),
    tempo.transitionTo === undefined ? null : String(tempo.transitionTo),
    tempo.meanTempoAt === undefined ? null : String(tempo.meanTempoAt),
    null,
  );

/**
 * The instantaneous tempo of an already-resolved span at `date`, clamped to the span's own ends.
 *
 * Both ends need clamping and for different reasons. Below `startDate` the progress term goes
 * negative and `Math.pow(negative, non-integer)` is `NaN`, which then propagates silently through
 * every comparison that reads it — `Math.abs(NaN - x) > 1` is `false`, so a loop testing for
 * convergence exits as though it had converged (issue #26). meico's `TempoMap.renderTempoToMap`
 * has the same hole and the same fix (`bugs.md` #7), so clamping here keeps the two in step.
 * Above `endDate` there is no `NaN` — the curve simply runs away from *both* of its endpoints,
 * which is worse than wrong because it looks like an answer.
 *
 * The clamped value is the honest reading either way: the next instruction takes over at
 * `endDate`, and the previous one was in force before `startDate`.
 */
const tempoAtClamped = (tempo: ResolvedTempo, date: number): number =>
  tempoAt(tempo, Math.min(Math.max(date, tempo.startDate), tempo.endDate));

/**
 * Milliseconds elapsed across `ticks` at a constant `bpm` — meico's own constant-tempo formula,
 * and the exact inverse of {@link ticksForConstantTempo}. The two are written next to each
 * other's constants deliberately: an extrapolation and its inversion that disagree would show up
 * as a measurement that will not round-trip, which is expensive to trace back to a divisor.
 */
const msForConstantTempo = (
  ticks: number,
  bpm: number,
  tempo: Pick<ResolvedTempo, 'beatLength'>,
  ppq: number,
): number => (15000.0 * ticks) / (bpm * tempo.beatLength * ppq);

/**
 * Elapsed milliseconds from the start of an already-resolved span to `date`, for **any** `date`.
 *
 * ## Outside the span
 *
 * The renderer never evaluates a `<tempo>` outside its own span — the neighbouring instructions
 * take over there — so neither end of `tempoAt` is defined beyond it: past `endDate` the progress
 * term rises above 1 and the curve runs away from both of its endpoints, and before `startDate`
 * it goes negative and the power is `NaN`. A tool that measures or edits *does* ask, at both
 * ends. {@link dateAtMilliseconds} inverts this function and has to be able to walk a guess
 * outside the span to get back into it; an ornament's frame reaches backwards from its anchor,
 * so a roll on the first beat asks about a negative time; and a note released after the last
 * modelled moment of the piece asks about one past the end.
 *
 * So outside the span the answer is a continuation at the boundary tempo — the one the transition
 * arrives at, or the one it departs from. That is the honest reading (the neighbouring
 * instruction starts there, or the piece goes on at that tempo), it is exact wherever the
 * boundary segment is constant, and it is the right limit approaching the boundary where it is
 * not. This is a semantics layered on the renderer's arithmetic, not a second copy of it:
 * everything inside the span is `computeDiffTiming`, and the continuations are the
 * constant-tempo formula that {@link ticksForConstantTempo} inverts.
 *
 * The result is total, continuous and strictly increasing in `date` — which is what makes
 * inverting it a well-posed problem rather than a search that can silently fail.
 *
 * A constant tempo is unaffected — its formula is already linear in `date` over the whole real
 * line, so the split changes nothing. Only transitions reach the outer branches.
 */
export const millisecondsAt = (date: number, tempo: ResolvedTempo, ppq: number): number => {
  // Already linear in `date` over the whole real line, and the renderer's own formula for it.
  if (tempo.kind === 'constant') {
    return TempoMap.computeDiffTiming(date, ppq, tempo);
  }

  if (date < tempo.startDate) {
    return msForConstantTempo(
      date - tempo.startDate,
      tempoAtClamped(tempo, tempo.startDate),
      tempo,
      ppq,
    );
  }

  if (date > tempo.endDate) {
    const toEnd = TempoMap.computeDiffTiming(tempo.endDate, ppq, tempo);
    return (
      toEnd +
      msForConstantTempo(date - tempo.endDate, tempoAtClamped(tempo, tempo.endDate), tempo, ppq)
    );
  }

  return TempoMap.computeDiffTiming(date, ppq, tempo);
};

/**
 * Elapsed milliseconds from the start of `tempo`'s span to `date`.
 *
 * Which arm is taken — one division, or Simpson's rule over the span — is decided by
 * {@link resolveSpan} rather than by a `transition.to` truthiness test here, and that is the
 * point of the delegation: `resolveTempo` collapses three shapes of declared transition back to
 * a constant, and taking the wrong arm is invisible until a timestamp moves.
 */
export const computeMillisecondsAt = (date: number, tempo: TempoWithEndDate, ppq: number): number =>
  millisecondsAt(date, resolveSpan(tempo), ppq);

/**
 * Elapsed milliseconds over a span of `segLengthBeats` beats, transitioning from `startBpm` to
 * `endBpm` with the given `meanTempoAt` curve shape.
 *
 * Measured with the renderer's quadrature. The caller this was written for used a 200-step
 * trapezoid rule of its own, which disagreed with what the piece would actually sound like by
 * **up to 31 ms (4.25%)** on short, steeply curved segments — while the elapsed-time optimiser
 * above it bisected against that figure to a tolerance of 0.1 ms. Converging precisely on the
 * wrong number is not an improvement over converging loosely on the right one.
 *
 * `beatLength` cancels: elapsed time per beat is `60000 / T` whatever the beat is, so the span is
 * expressed in quarters here regardless of what the real instruction counts in.
 */
export const computeElapsedMs = (
  startBpm: number,
  endBpm: number,
  meanTempoAt: number,
  segLengthBeats: number,
  ppq: number,
): number => {
  if (segLengthBeats <= 0) return 0;

  const endDate = segLengthBeats * ppq;
  return millisecondsAt(
    endDate,
    resolveSpan({
      date: 0,
      endDate,
      beatLength: 0.25,
      bpm: startBpm,
      transitionTo: endBpm,
      meanTempoAt,
    }),
    ppq,
  );
};

// ── the inverse direction ─────────────────────────────────────────

/**
 * The tick span a millisecond span covers at a constant tempo — the exact inverse of
 * `msForConstantTempo`, sharing its constants so the two cannot drift apart.
 *
 * This is arithmetic the renderer does not have: it converts ticks to milliseconds and never the
 * other way, because rendering never needs to.
 *
 * Defined for negative spans too, which is the point: it is what lets a time *before* the first
 * `<tempo>` be placed on the tick grid at all. A roll that begins before its beat is the ordinary
 * arpeggio, and it has no segment of its own to be measured in.
 */
export const ticksForConstantTempo = (
  milliseconds: number,
  tempo: Pick<AddTempoOptions, 'bpm' | 'beatLength'>,
  ppq: number,
): number => (milliseconds * Number(tempo.bpm) * tempo.beatLength * ppq) / 15000.0;

/** How close {@link dateAtMilliseconds} gets, where the iteration it replaces stopped at 1 ms. */
const INVERSE_TOLERANCE_MS = 1e-6;

/**
 * ... and how narrow it lets the bracket get before it stops, which is the exit that actually
 * fires. Simpson's sub-interval count steps with the date (`2 * floor(span / (ppq / 4))`), so
 * what is being inverted has hairline discontinuities at every sixteenth note and the
 * millisecond test alone is not guaranteed to be reachable. A millionth of a tick is a
 * nanosecond at any tempo anyone plays.
 */
const INVERSE_TOLERANCE_TICKS = 1e-6;

/**
 * A backstop, not a working limit: bisection alone halves the bracket every step, so
 * {@link INVERSE_TOLERANCE_TICKS} is reached from any real span within about fifty. Newton
 * normally arrives in four or five.
 */
const MAX_INVERSE_STEPS = 100;

/**
 * The tick date at which `targetMilliseconds` have elapsed since the start of `tempo`'s span —
 * the exact inverse of {@link millisecondsAt}, over the same unbounded domain.
 *
 * This was `approximateDate`, and issue #26 is the record of what it was approximating:
 *
 * - **It could not leave the span.** The guess started at `startDate`, and a target before it —
 *   which is what a note sounding ahead of its predecessor produces, so every arpeggio and every
 *   asynchrony — walked the guess backwards into the region where `millisecondsAt` was undefined.
 *   With a non-integer exponent that is `NaN`, and `Math.abs(NaN - target) > 1` is `false`, so
 *   the loop exited *reporting convergence* on its first step. With an integer one it was worse:
 *   the sign of Simpson's `resultConst` flips below `startDate`, so the elapsed time came back
 *   positive, the step kept pushing the same way, and a target of −200 ms landed 24 000 ticks
 *   from the answer. Both are fixed at the source — {@link millisecondsAt} is total now — and
 *   both ends of it invert in closed form, so the walk never has to leave the span at all.
 *
 * - **The step had the wrong units.** `guess += 0.1 * (targetMs - guessedMs)` adds milliseconds
 *   to a tick count. The constant 0.1 converges for ordinary tempi and diverges below about
 *   4 bpm per beat unit — at 2 bpm a 1 s target returned a tick 57 000 out. The step is now the
 *   Newton one, which is {@link ticksForConstantTempo} of the millisecond shortfall at the tempo
 *   holding where the guess stands: dimensionally right by construction, exact wherever the span
 *   is constant, and quadratic where it is not.
 *
 * - **It could not fail.** There was no convergence check and no bracket, so a thousand steps of
 *   a diverging iteration returned a plausible-looking tick number. `millisecondsAt` is strictly
 *   increasing, so the span's own ends bracket any target inside it; the bracket is kept and a
 *   Newton step that would leave it is replaced by bisection. That is `rtsafe`, and it cannot run
 *   away: every step either converges or at least halves the bracket. The only way out with a
 *   non-answer is a non-finite target, and that comes back as `NaN` rather than as a number.
 *
 * Which arm is taken is decided by {@link resolveSpan} rather than by a truthiness test on
 * `@transition.to` and `@meanTempoAt` here, and that is not a tidying-up: `meanTempoAt="0"`
 * resolves to a constant at `@transition.to`, and reading `0` as falsy inverted it at `@bpm`
 * instead — 1 000 ms came back as the tick where 667 ms had elapsed. A `@transition.to` with no
 * `@meanTempoAt` resolves to a *linear ramp*, and the closed form inverted that at `@bpm` too.
 * Both were wrong against the renderer, which is the only thing that decides what a document
 * sounds like.
 */
export const dateAtMilliseconds = (
  targetMilliseconds: number,
  tempo: ResolvedTempo,
  ppq: number,
): number => {
  // A caller that does not know the time it is asking about is not owed a tick that looks like
  // an answer. `NaN` is what the arithmetic downstream already refuses to write.
  if (!Number.isFinite(targetMilliseconds)) return NaN;

  const { startDate, endDate } = tempo;

  if (tempo.kind === 'constant') {
    return startDate + ticksForConstantTempo(targetMilliseconds, tempo, ppq);
  }

  // Outside the span `millisecondsAt` continues at the boundary tempo, so the inverse is
  // closed-form there too — and it is exactly the extrapolation the ornament frames rely on.
  if (targetMilliseconds <= 0) {
    return (
      startDate +
      ticksForConstantTempo(
        targetMilliseconds,
        {
          bpm: tempoAtClamped(tempo, startDate),
          beatLength: tempo.beatLength,
        },
        ppq,
      )
    );
  }

  const spanMilliseconds = millisecondsAt(endDate, tempo, ppq);
  if (targetMilliseconds >= spanMilliseconds) {
    return (
      endDate +
      ticksForConstantTempo(
        targetMilliseconds - spanMilliseconds,
        {
          bpm: tempoAtClamped(tempo, endDate),
          beatLength: tempo.beatLength,
        },
        ppq,
      )
    );
  }

  // Inside the curve, where there is no closed form. The target lies strictly between 0 and
  // the span's own elapsed time, so `[startDate, endDate]` brackets it.
  let low = startDate;
  let high = endDate;
  let guess =
    startDate +
    ticksForConstantTempo(
      targetMilliseconds,
      {
        bpm: tempoAtClamped(tempo, startDate),
        beatLength: tempo.beatLength,
      },
      ppq,
    );
  if (!(guess > low && guess < high)) guess = (low + high) / 2;

  for (let step = 0; step < MAX_INVERSE_STEPS; step++) {
    const elapsed = millisecondsAt(guess, tempo, ppq);
    if (Math.abs(elapsed - targetMilliseconds) <= INVERSE_TOLERANCE_MS) return guess;

    if (elapsed < targetMilliseconds) low = guess;
    else high = guess;
    if (high - low <= INVERSE_TOLERANCE_TICKS) return guess;

    const newton =
      guess +
      ticksForConstantTempo(
        targetMilliseconds - elapsed,
        {
          bpm: tempoAtClamped(tempo, guess),
          beatLength: tempo.beatLength,
        },
        ppq,
      );
    guess = newton > low && newton < high ? newton : (low + high) / 2;
  }

  return guess;
};

/**
 * The instantaneous tempo, in bpm, that `tempo` calls for at `date`.
 *
 * Outside the span the answer is the tempo at the nearer boundary — see `tempoAtClamped` for why
 * the curve is not continued past either end, and {@link millisecondsAt} for why anything asks
 * outside the span at all.
 */
export const getTempoAt = (date: number, tempo: TempoWithEndDate): number =>
  tempoAtClamped(resolveSpan(tempo), date);
