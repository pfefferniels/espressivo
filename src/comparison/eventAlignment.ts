/**
 * The event alignment DP — DESIGN.md §5.6, as a **dimension-neutral module** (AD-37.6).
 *
 * §5.6 makes the alignment *the semantic distance* for event dimensions, with one functional:
 *
 * ```
 * minimize  Σ_matched ( rowCost(a, b) + λ_date·|Δdate| )  +  Σ_unmatched neutralCost(x)
 * over monotone alignments
 * ```
 *
 * Nothing here knows what an articulation or an ornament is. The caller supplies the two costs
 * and `λ_date`; this module supplies the argmin. That split is AD-37.6's point: articulation
 * (§5.5) is the first consumer and ornamentation (§5.6) the second, and an interface with two
 * consumers before it freezes is the cheapest way to find out whether it is really neutral.
 *
 * ## The date term is INSIDE the minimand, and that is a correction
 *
 * Revision 1 defined the matched-event contribution *without* a date term while §6.2 priced
 * event ops *with* one — a non-minimal functional evaluated at the argmin of a different one,
 * which has no metric argument at all and which priced a matched ornament displaced by half a
 * bar at zero. The same `λ_date` therefore appears in {@link alignEvents}'s objective and in
 * whatever the caller reports, or the two disagree again.
 *
 * ## Id-pinning is opportunistic, and date-pinning is deleted
 *
 * `xml:id` / `noteid` equality is an **identity** match: it is transitive whenever all three
 * documents carry ids, so it composes across a triple and is metric-safe (AD-7). Revision 1's
 * exact-date pre-pass is not — it is transitive only when all three documents happen to share
 * the date, and M5's three-document counterexample survives every value of `λ_date`. An
 * exact-date match is already free of date cost, so the DP selects it whenever it is optimal;
 * where it is not optimal, the pin was wrong.
 *
 * Pins are applied as hard constraints: a pinned event may match only its partner and may not
 * be dropped. If a pin set is not jointly monotone — two ids appearing in opposite order in the
 * two documents — no monotone alignment can honour it, and the DP would be infeasible. That
 * case falls back to the unpinned optimum and is REPORTED
 * ({@link EventAlignment.pinsHonoured}), rather than being silently resolved one way or the
 * other.
 *
 * ## Determinism
 *
 * Ties are broken in a fixed order — match, then drop from `a`, then drop from `b` — so the
 * argmin is a function of the inputs and not of the iteration order. R2's bit-exact symmetry is
 * a property of the *cost*, which the caller owns; what this module guarantees is that equal
 * costs never make the answer depend on anything but the stated tie-break.
 */

/** The minimum an event must expose to be alignable. */
export interface AlignableEvent {
  /** In common ticks. */
  readonly dateTicks: number;
  /**
   * An identity, when the document supplies one — `xml:id`, or the note id an atom targets.
   * Two events with equal non-null ids are the same event and are pinned to each other.
   */
  readonly id: string | null;
}

/** What one dimension charges for a match and for a drop (§5.6's two sums). */
export interface AlignmentCost<T> {
  /**
   * `Σ_rows d_row(a, b)` — the row-wise attribute cost of matching, WITHOUT the date term.
   * The date term is this module's to add, so that one functional is minimized and reported.
   */
  readonly matched: (a: T, b: T) => number;
  /** An event's deviation from neutral, i.e. what it costs to leave it unmatched. */
  readonly unmatched: (event: T) => number;
  /**
   * The price of one quarter of date displacement between two matched events, in JND.
   *
   * There is no ruled constant yet; the caller states it, which is also what makes this module
   * dimension-neutral. {@link DEFAULT_LAMBDA_DATE} carries the proposed default and its
   * calibration.
   */
  readonly lambdaDate: number;
}

/**
 * The proposed default for `λ_date`: **16 per quarter** [convention], i.e. one JND per
 * `1/16` quarter of displacement.
 *
 * §5.6 states that `λ_date` belongs to the semantic definition but leaves its value open. This
 * is the calibration the rest of the design already uses for a displacement in score time:
 * `RUBATO_DISPLACEMENT_JND_QUARTERS` is `1/16` quarter (§7.1), and `λ_date = 1 / (1/16)` makes
 * a displacement of exactly one rubato JND cost exactly one JND here. The alternative — picking
 * a number that makes some particular corpus behave — is the thing §7.1 exists to avoid.
 */
export const DEFAULT_LAMBDA_DATE = 16;

/** One matched pair, by index into the two input lists. */
export interface AlignedPair {
  readonly a: number;
  readonly b: number;
}

export interface EventAlignment {
  readonly pairs: readonly AlignedPair[];
  readonly unmatchedA: readonly number[];
  readonly unmatchedB: readonly number[];
  /** The minimized objective, including the date term. */
  readonly cost: number;
  /**
   * False where the id pins could not all be honoured because they are not jointly monotone,
   * in which case the alignment is the unpinned optimum. A crossing pin set is a real
   * document — two ids in opposite order — and silently picking one of them would be a
   * decision made in the dark.
   */
  readonly pinsHonoured: boolean;
}

/** Index pairs whose ids are equal and non-null — at most one partner each. */
function pinsBetween<T extends AlignableEvent>(
  a: readonly T[],
  b: readonly T[],
): { readonly aToB: ReadonlyMap<number, number>; readonly bToA: ReadonlyMap<number, number> } {
  const byId = new Map<string, number>();
  for (const [index, event] of b.entries())
    if (event.id !== null && !byId.has(event.id)) byId.set(event.id, index);

  const aToB = new Map<number, number>();
  const bToA = new Map<number, number>();
  for (const [index, event] of a.entries()) {
    if (event.id === null) continue;
    const partner = byId.get(event.id);
    // A duplicated id in `a` would otherwise claim the same partner twice; the first wins,
    // which is the same first-wins rule `byId` applies on the other side.
    if (partner === undefined || bToA.has(partner)) continue;
    aToB.set(index, partner);
    bToA.set(partner, index);
  }
  return { aToB, bToA };
}

/**
 * The optimal monotone alignment of two date-ordered event lists.
 *
 * @param ticksPerQuarter the common grid, for converting `|Δdate|` into the quarters `λ_date`
 *   is stated per.
 */
export function alignEvents<T extends AlignableEvent>(
  a: readonly T[],
  b: readonly T[],
  cost: AlignmentCost<T>,
  ticksPerQuarter: number,
): EventAlignment {
  const pinned = pinsBetween(a, b);
  const withPins = solve(a, b, cost, ticksPerQuarter, pinned);
  if (Number.isFinite(withPins.cost)) return { ...withPins, pinsHonoured: true };

  // Not jointly monotone: no alignment honours every pin, so the pins are dropped wholesale
  // rather than partially, which would make the result depend on which subset was tried.
  const empty = { aToB: new Map<number, number>(), bToA: new Map<number, number>() };
  return { ...solve(a, b, cost, ticksPerQuarter, empty), pinsHonoured: false };
}

type Move = 'match' | 'dropA' | 'dropB' | 'none';

function solve<T extends AlignableEvent>(
  a: readonly T[],
  b: readonly T[],
  cost: AlignmentCost<T>,
  ticksPerQuarter: number,
  pins: { readonly aToB: ReadonlyMap<number, number>; readonly bToA: ReadonlyMap<number, number> },
): Omit<EventAlignment, 'pinsHonoured'> {
  const n = a.length;
  const m = b.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () =>
    new Array<number>(m + 1).fill(Number.POSITIVE_INFINITY),
  );
  const from: Move[][] = Array.from({ length: n + 1 }, () => new Array<Move>(m + 1).fill('none'));

  dp[0][0] = 0;
  for (let i = 1; i <= n; ++i) {
    // A pinned event may not be dropped: its partner exists, so an alignment that drops it is
    // not the identity match the pin asserts.
    if (pins.aToB.has(i - 1)) break;
    dp[i][0] = dp[i - 1][0] + cost.unmatched(a[i - 1]);
    from[i][0] = 'dropA';
  }
  for (let j = 1; j <= m; ++j) {
    if (pins.bToA.has(j - 1)) break;
    dp[0][j] = dp[0][j - 1] + cost.unmatched(b[j - 1]);
    from[0][j] = 'dropB';
  }

  for (let i = 1; i <= n; ++i) {
    for (let j = 1; j <= m; ++j) {
      const pinA = pins.aToB.get(i - 1);
      const pinB = pins.bToA.get(j - 1);
      const matchAllowed =
        (pinA === undefined || pinA === j - 1) && (pinB === undefined || pinB === i - 1);

      let best = Number.POSITIVE_INFINITY;
      let move: Move = 'none';

      if (matchAllowed && Number.isFinite(dp[i - 1][j - 1])) {
        const displacement = Math.abs(a[i - 1].dateTicks - b[j - 1].dateTicks) / ticksPerQuarter;
        const candidate =
          dp[i - 1][j - 1] + cost.matched(a[i - 1], b[j - 1]) + cost.lambdaDate * displacement;
        if (candidate < best) {
          best = candidate;
          move = 'match';
        }
      }
      // Tie-break order — match, then drop from a, then drop from b — is fixed and strict, so
      // an equal-cost alternative never displaces the one already chosen.
      if (pinA === undefined && Number.isFinite(dp[i - 1][j])) {
        const candidate = dp[i - 1][j] + cost.unmatched(a[i - 1]);
        if (candidate < best) {
          best = candidate;
          move = 'dropA';
        }
      }
      if (pinB === undefined && Number.isFinite(dp[i][j - 1])) {
        const candidate = dp[i][j - 1] + cost.unmatched(b[j - 1]);
        if (candidate < best) {
          best = candidate;
          move = 'dropB';
        }
      }

      dp[i][j] = best;
      from[i][j] = move;
    }
  }

  const pairs: AlignedPair[] = [];
  const unmatchedA: number[] = [];
  const unmatchedB: number[] = [];
  let i = n;
  let j = m;
  while (i > 0 || j > 0) {
    const move = from[i][j];
    if (move === 'match') {
      pairs.push({ a: i - 1, b: j - 1 });
      i -= 1;
      j -= 1;
    } else if (move === 'dropA') {
      unmatchedA.push(i - 1);
      i -= 1;
    } else if (move === 'dropB') {
      unmatchedB.push(j - 1);
      j -= 1;
    } else {
      // Unreachable on a finite optimum; on an infeasible one the caller retries unpinned.
      break;
    }
  }

  return {
    pairs: pairs.reverse(),
    unmatchedA: unmatchedA.reverse(),
    unmatchedB: unmatchedB.reverse(),
    cost: dp[n][m],
  };
}
