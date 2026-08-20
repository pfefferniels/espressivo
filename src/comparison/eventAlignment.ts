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
 * ## The optimum comes apart again (AD-51.2)
 *
 * A scalar optimum cannot say WHERE in the piece a difference sits, and AD-19's table needs
 * exactly that: an event's mass belongs in the column of the segment it falls in.
 * {@link EventAlignment.charges} is the optimum decomposed per event, and
 * {@link chargeAtoms} places each charge on the timeline under AD-7's spreading rule. Both
 * are dimension-neutral for the same reason the DP is — placement is a fact about dates, not
 * about articulations.
 *
 * ## Determinism, and SYMMETRY (W3 MAJOR-17)
 *
 * Ties are broken on a key of the two EVENTS — match first, then the drop whose event has the
 * smaller `dateTicks`, then the smaller `id` in code-unit order — so the argmin is a function of
 * the inputs and not of the iteration order, AND the swapped call reaches the same alignment
 * from the other side. Revision 1 broke ties in the fixed order `match → dropA → dropB`, which
 * is deterministic but not symmetric: at an equal-cost tie it picked the mirror image of what
 * `solve(b, a)` picked, a different alignment of identical cost. The distances were invariant —
 * the mass integral is preserved — but `events.{matched, unmatchedA, unmatchedB}` and
 * `segments[].peak` are shipped fields, and on `aller-augen | bach` they read `[0, 35, 396]` one
 * way and `[18, 378, 17]` the other. §9.5's P-C2 promise is about the whole report.
 */

import { elementAt } from './indexing.js';

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

/**
 * One event's — or one matched pair's — share of the minimized objective.
 *
 * The alignment's optimum is a SUM over the events it aligns, and AD-19's table needs that sum
 * taken apart again: an event dimension's mass has to land in the column of the segment it
 * falls in, which a scalar total cannot say. The three kinds are the DP's three moves, and
 * `cost` is the term that move contributed — `matched + λ_date·|Δdate|` for a match, the
 * neutral cost for a drop.
 */
export interface EventCharge {
  readonly kind: 'matched' | 'unmatched-a' | 'unmatched-b';
  /** Index into the `a` list, or null for a drop from `b`. */
  readonly a: number | null;
  readonly b: number | null;
  /** In JND. Sums to {@link EventAlignment.cost} up to summation order. */
  readonly cost: number;
}

export interface EventAlignment {
  readonly pairs: readonly AlignedPair[];
  readonly unmatchedA: readonly number[];
  readonly unmatchedB: readonly number[];
  /** The minimized objective, including the date term. */
  readonly cost: number;
  /**
   * The optimum, taken apart per event in date order — {@link EventCharge}.
   *
   * Recomputed from the chosen alignment rather than accumulated inside the DP, so the two
   * cannot drift apart in a future edit to the recurrence: what is reported here is literally
   * the same expression the DP minimized, evaluated at its own argmin.
   */
  readonly charges: readonly EventCharge[];
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
  if (Number.isFinite(withPins.cost))
    return {
      ...withPins,
      charges: chargesOf(a, b, withPins, cost, ticksPerQuarter),
      pinsHonoured: true,
    };

  // Not jointly monotone: no alignment honours every pin, so the pins are dropped wholesale
  // rather than partially, which would make the result depend on which subset was tried.
  const empty = { aToB: new Map<number, number>(), bToA: new Map<number, number>() };
  const unpinned = solve(a, b, cost, ticksPerQuarter, empty);
  return {
    ...unpinned,
    charges: chargesOf(a, b, unpinned, cost, ticksPerQuarter),
    pinsHonoured: false,
  };
}

/**
 * The optimum's per-event decomposition, in date order.
 *
 * Ordering is by the earlier of a pair's two dates, then by the `a` index, so the list is a
 * function of the inputs alone and reads left to right along the timeline — which is the order
 * the table's columns are in and the order a compensated sum should take.
 */
function chargesOf<T extends AlignableEvent>(
  a: readonly T[],
  b: readonly T[],
  alignment: Omit<EventAlignment, 'pinsHonoured' | 'charges'>,
  cost: AlignmentCost<T>,
  ticksPerQuarter: number,
): readonly EventCharge[] {
  const matched = alignment.pairs.map((pair): EventCharge => {
    const eventA = elementAt(a, pair.a, A_SIDE);
    const eventB = elementAt(b, pair.b, B_SIDE);
    const displacement = Math.abs(eventA.dateTicks - eventB.dateTicks) / ticksPerQuarter;
    return {
      kind: 'matched',
      a: pair.a,
      b: pair.b,
      cost: cost.matched(eventA, eventB) + cost.lambdaDate * displacement,
    };
  });
  const droppedA = alignment.unmatchedA.map((index): EventCharge => ({
    kind: 'unmatched-a',
    a: index,
    b: null,
    cost: cost.unmatched(elementAt(a, index, A_SIDE)),
  }));
  const droppedB = alignment.unmatchedB.map((index): EventCharge => ({
    kind: 'unmatched-b',
    a: null,
    b: index,
    cost: cost.unmatched(elementAt(b, index, B_SIDE)),
  }));

  // The three groups are concatenated in the order the three loops used to push them, and
  // `sort` is stable, so the comparator sees the same sequence it always did.
  return [...matched, ...droppedA, ...droppedB].sort(
    (x, y) => dateOf(x, a, b) - dateOf(y, a, b) || indexOf(x) - indexOf(y),
  );
}

/** What an out-of-range read into one of the two event lists is called, for {@link elementAt}. */
const A_SIDE = 'the a-side event list';
const B_SIDE = 'the b-side event list';

function dateOf<T extends AlignableEvent>(
  charge: EventCharge,
  a: readonly T[],
  b: readonly T[],
): number {
  const dateA = charge.a === null ? null : elementAt(a, charge.a, A_SIDE).dateTicks;
  const dateB = charge.b === null ? null : elementAt(b, charge.b, B_SIDE).dateTicks;
  if (dateA === null) return dateB ?? 0;
  if (dateB === null) return dateA;
  return Math.min(dateA, dateB);
}

/** A total order within one date: `a`-side events first, then `b`-side, then by index. */
function indexOf(charge: EventCharge): number {
  return charge.a ?? charge.b ?? 0;
}

/**
 * One event's contribution to §5.0's atomic measure, placed where AD-7 puts it.
 *
 * `mass` is in JND; `κ` (§7.1) is the caller's to apply, because it is the constant that makes
 * an event commensurable with a QUARTER of sustained deviation and therefore belongs where the
 * two are added, not here.
 */
export interface EventAtomMass {
  readonly startTicks: number;
  readonly endTicks: number;
  readonly mass: number;
  readonly kind: EventCharge['kind'];
  /**
   * False where the placement is an admission rather than a date — an id-anchored anchor whose
   * note the module cannot locate without an MSM (AD-7, AD-39.1).
   */
  readonly datePositionKnown: boolean;
}

/**
 * AD-7's placement rule: a matched pair at differing dates spreads its mass UNIFORMLY over
 * `[min(dA, dB), max(dA, dB)]`, and an unmatched event is a point mass at its own date.
 *
 * Spreading rather than charging one end is what makes `λ_date` visible in the timeline
 * instead of teleporting the difference to whichever document is `a` — M17's option (ii),
 * symmetric by construction, and the reason {@link EventAtomMass} carries an interval at all.
 *
 * **An anchor whose date position is unknown spreads over the whole window.** That case is
 * §5.5's id-anchored articulation without an MSM: the atom is never dropped (AD-39.1) and its
 * mass is real, but the module knows only THAT the renderer performs it, not WHERE. A uniform
 * spread is the only placement that adds no information — pinning it to the written `@date`
 * would assert a position §5.5 says is not known, and dropping it would forgive a performed
 * difference. `datePositionKnown: false` travels with it so the report can say so.
 */
export function chargeAtoms<T extends AlignableEvent>(
  a: readonly T[],
  b: readonly T[],
  alignment: EventAlignment,
  positionKnown: (event: T) => boolean,
  window: { readonly startTicks: number; readonly endTicks: number },
): readonly EventAtomMass[] {
  return alignment.charges.map((charge): EventAtomMass => {
    const eventA = charge.a === null ? null : elementAt(a, charge.a, A_SIDE);
    const eventB = charge.b === null ? null : elementAt(b, charge.b, B_SIDE);
    const known =
      (eventA === null || positionKnown(eventA)) && (eventB === null || positionKnown(eventB));
    if (!known)
      return {
        startTicks: window.startTicks,
        endTicks: window.endTicks,
        mass: charge.cost,
        kind: charge.kind,
        datePositionKnown: false,
      };

    const dates = [eventA?.dateTicks, eventB?.dateTicks].filter(
      (date): date is number => date !== undefined,
    );
    return {
      startTicks: Math.min(...dates),
      endTicks: Math.max(...dates),
      mass: charge.cost,
      kind: charge.kind,
      datePositionKnown: true,
    };
  });
}

type Move = 'match' | 'dropA' | 'dropB' | 'none';

/**
 * Which of two equal-cost drops to take — a key of the two EVENTS, never of their sides.
 *
 * A fixed cascade is not a symmetric one. `match → dropA → dropB` made the argmin a function of
 * the inputs, which is all the determinism note used to claim, but at an equal-cost tie it
 * selected the mirror image of what the swapped call selected: on `aller-augen | bach` the
 * shipped `events` block read `[0, 35, 396]` one way and `[18, 378, 17]` the other, with
 * `segments[].peak` differing at identical mass. Those are caller-visible fields and §9.5's P-C2
 * promise is about the whole report, not only its distances.
 *
 * So the tie is broken on the smaller `dateTicks`, then the smaller `id` in code-unit order —
 * both properties of the events themselves, so the swapped call reaches the same decision from
 * the other side. Two events agreeing on BOTH keys are indistinguishable to this rule and fall
 * to `'dropA'`; that residue needs equal dates, equal (or absent) ids and equal cost, and equal
 * NON-null ids would have been pinned to each other rather than dropped.
 */
function preferredDrop(eventA: AlignableEvent, eventB: AlignableEvent): 'dropA' | 'dropB' {
  if (eventA.dateTicks !== eventB.dateTicks)
    return eventA.dateTicks < eventB.dateTicks ? 'dropA' : 'dropB';
  const idA = eventA.id ?? '';
  const idB = eventB.id ?? '';
  if (idA !== idB) return idA < idB ? 'dropA' : 'dropB';
  return 'dropA';
}

function solve<T extends AlignableEvent>(
  a: readonly T[],
  b: readonly T[],
  cost: AlignmentCost<T>,
  ticksPerQuarter: number,
  pins: { readonly aToB: ReadonlyMap<number, number>; readonly bToA: ReadonlyMap<number, number> },
): Omit<EventAlignment, 'pinsHonoured' | 'charges'> {
  const n = a.length;
  const m = b.length;

  // The two tables are FLAT, `(n+1) × (m+1)` in row-major order, which is `embedding.ts`'s
  // layout and for the same reason: a jagged `number[][]` costs two indexed reads per cell and
  // gives the reader two chances to be out of range instead of one. `costAt` and `moveAt` are
  // the only readers, so the stride arithmetic is written once.
  const stride = m + 1;
  const dp = new Array<number>((n + 1) * stride).fill(Number.POSITIVE_INFINITY);
  const from = new Array<Move>((n + 1) * stride).fill('none');
  const costAt = (row: number, column: number): number =>
    elementAt(dp, row * stride + column, "the alignment's cost table");
  const moveAt = (row: number, column: number): Move =>
    elementAt(from, row * stride + column, "the alignment's traceback table");

  dp[0] = 0;
  for (let i = 1; i <= n; ++i) {
    // A pinned event may not be dropped: its partner exists, so an alignment that drops it is
    // not the identity match the pin asserts.
    if (pins.aToB.has(i - 1)) break;
    dp[i * stride] = costAt(i - 1, 0) + cost.unmatched(elementAt(a, i - 1, A_SIDE));
    from[i * stride] = 'dropA';
  }
  for (let j = 1; j <= m; ++j) {
    if (pins.bToA.has(j - 1)) break;
    dp[j] = costAt(0, j - 1) + cost.unmatched(elementAt(b, j - 1, B_SIDE));
    from[j] = 'dropB';
  }

  for (let i = 1; i <= n; ++i) {
    const eventA = elementAt(a, i - 1, A_SIDE);
    for (let j = 1; j <= m; ++j) {
      const eventB = elementAt(b, j - 1, B_SIDE);
      const pinA = pins.aToB.get(i - 1);
      const pinB = pins.bToA.get(j - 1);
      const matchAllowed =
        (pinA === undefined || pinA === j - 1) && (pinB === undefined || pinB === i - 1);

      let matchCost = Number.POSITIVE_INFINITY;
      if (matchAllowed && Number.isFinite(costAt(i - 1, j - 1))) {
        const displacement = Math.abs(eventA.dateTicks - eventB.dateTicks) / ticksPerQuarter;
        matchCost =
          costAt(i - 1, j - 1) + cost.matched(eventA, eventB) + cost.lambdaDate * displacement;
      }
      const dropACost =
        pinA === undefined && Number.isFinite(costAt(i - 1, j))
          ? costAt(i - 1, j) + cost.unmatched(eventA)
          : Number.POSITIVE_INFINITY;
      const dropBCost =
        pinB === undefined && Number.isFinite(costAt(i, j - 1))
          ? costAt(i, j - 1) + cost.unmatched(eventB)
          : Number.POSITIVE_INFINITY;

      const best = Math.min(matchCost, dropACost, dropBCost);
      let move: Move = 'none';
      if (Number.isFinite(best)) {
        if (best === matchCost) move = 'match';
        else if (best === dropACost && best === dropBCost) move = preferredDrop(eventA, eventB);
        else move = best === dropACost ? 'dropA' : 'dropB';
      }

      dp[i * stride + j] = best;
      from[i * stride + j] = move;
    }
  }

  const pairs: AlignedPair[] = [];
  const unmatchedA: number[] = [];
  const unmatchedB: number[] = [];
  let i = n;
  let j = m;
  while (i > 0 || j > 0) {
    const move = moveAt(i, j);
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
    cost: costAt(n, m),
  };
}
