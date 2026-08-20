/**
 * §6's edit path: the sequential-pricing DP, written once over a declared interface.
 *
 * Nothing in this file knows what a tempo instruction is. A caller supplies two date-ordered
 * instruction sequences and two functions — `represent`, which maps a STATE (a whole instruction
 * list) to the dimension's density representation `Φ`, and `norm`, which is the weighted `L¹`
 * integral `‖·‖₁` the semantic level already uses — and gets back the argmin over monotone
 * alignments together with the script's two totals. That is `aggregate.ts`'s shape and
 * `eventAlignment.ts`'s: an algorithm over an interface can be gated on its own, and it cannot
 * leave a cross-module change half-written.
 *
 * ## Pricing is SEQUENTIAL, and the DP cell is what makes that affordable (AD-5, §6.2)
 *
 *     scriptCost = Σ_i ‖Φ(M_i) − Φ(M_{i−1})‖₁     M_0 = A, M_n = B
 *
 * The state at DP cell `(i, j)` is determined by the cell:
 *
 *     S(i, j) = b[0..j) ++ a[i..n)
 *
 * — the prefix already converted to B's, the suffix still A's — so `S(0,0) = A`, `S(n,m) = B`,
 * and each of the three moves steps from one such state to another. Every transition price is
 * therefore a function of the cell and the move alone, which is what keeps a state-dependent
 * cost inside an ordinary `O(nm)` recurrence. `Φ` is memoized per cell, so the whole fill costs
 * `(n+1)(m+1)` representations and `~3nm` norms rather than `6nm` representations.
 *
 * Two theorems follow from the telescoping form and the `L¹` triangle inequality, and both are
 * pinned rather than asserted: `scriptCost ≥ ‖Φ(B) − Φ(A)‖₁ = d_curve`, and therefore
 * `reworking = scriptCost − d_curve ≥ 0`. Revision 1 priced each op against the ORIGINAL A and
 * had neither: §6.2's own counterexample (a legal no-op restatement whose deletion is free
 * against A and real once the substitution has landed) makes `reworking` NEGATIVE under that
 * reading, by a factor of two. It is pinned here as a test rather than quoted as prose.
 *
 * ## Two orders, two totals, and why they are genuinely different numbers (§6.1, §6.3)
 *
 * The DP walks its path in ALIGNMENT order; §6.1 delivers the script in APPLICATION (date)
 * order, because a reader following along in the score walks it that way. Those are not the
 * same order — a delete at bar 40 can precede an insert at bar 3 along the DP path — and a
 * sequential price depends on the order, so the two totals are two numbers:
 *
 * - `scriptCost` is the DP's own path total, the quantity the recurrence minimized;
 * - `replayedDelta` is what the SAME op set costs applied in the delivered date order (§6.3).
 *
 * Both telescope from A to B, so both are `≥ d_curve`; neither dominates the other in general,
 * and each op's reported `cost` is its REPLAY cost, so `Σ ops.cost = replayedDelta` exactly.
 * The replay is also the verification §6.3 asks for: the state after the last op must BE `B`,
 * which is checked as `norm(Φ(final), Φ(B)) === 0` — an exact zero, since the final state is
 * `b`'s own records in `b`'s own order.
 *
 * ## Determinism (§6.4)
 *
 * Ties at a DP cell resolve `substitute > delete > insert`, applied while the table is filled,
 * so the traceback merely follows a backpointer. That precedence is deterministic but NOT
 * transposition-covariant — transposing the inputs maps "delete `a_i`" to "insert `a_i`", so at
 * a tied cell each direction takes its own delete branch and the two are not mirrors. The
 * remedy is not a cleverer precedence but computing the script ONCE in a canonical orientation
 * and inverting it ({@link invertSteps}); the precedence keeps its determinism role and
 * mirroring becomes true by construction (AD-21, AD-25.4).
 *
 * `fragment` and `consolidate` (A-Q5) are NOT in this move set. They land after the plain
 * script is green, which is the order the campaign ruled: a presentation move priced under the
 * same semantics is worth having only once the semantics are pinned.
 */

import { filterMap, zipWith } from '../prelude/index.js';

import { elementAt, numberAt } from './indexing.js';

/** What the DP needs of an instruction: where it sits. Everything else belongs to the caller. */
export interface EditableInstruction {
  /** The instruction's date in COMMON ticks — both sides already on one grid. */
  readonly dateTicks: number;
}

/**
 * A dimension's `Φ` and `‖·‖₁`, supplied by the caller.
 *
 * `represent` must be a pure function of the state's CONTENT: the DP memoizes it per cell and
 * the replay calls it again on states the fill already saw, so a representation that depended
 * on call order would make `scriptCost` and `replayedDelta` incomparable.
 *
 * `norm` must be a metric on representations — non-negative, symmetric, and satisfying the
 * triangle inequality — because that is exactly what makes `scriptCost ≥ d` a theorem rather
 * than a hope. Every shipped instance is one of §5's own `d_k` integrals, which the W2/W3
 * metric suites already pin.
 */
export interface EditPricing<I extends EditableInstruction, S> {
  readonly represent: (state: readonly I[]) => S;
  /**
   * `‖x − y‖₁`, with the two STATES beside their representations.
   *
   * The states are passed because a caller may localize an EXACT computation with them and for
   * no other reason: two states of one transition differ by a single instruction, so the two
   * curves are identical outside a bounded interval, and a caller that can establish that
   * interval structurally may integrate over it instead of over the window. `norm` remains one
   * metric on representations either way — the states are evidence, never a second argument the
   * answer depends on.
   */
  readonly norm: (x: S, y: S, previous: readonly I[], next: readonly I[]) => number;
}

export type EditMove = 'substitute' | 'delete' | 'insert' | 'fragment' | 'consolidate';

/**
 * How many instructions a `fragment` or `consolidate` may span [convention].
 *
 * The DP gains `O(nm·k)` transitions for a span bound of `k`, so this is a cost knob as well as
 * a semantic one. Four covers the case §6.2 names — "consolidating five steps into one
 * transition" is four steps plus the survivor — and a longer run is expressible as a move
 * followed by plain ops at a price the DP compares against.
 */
export const MAX_MOVE_SPAN = 4;

/** One step of the script, before a dimension dresses it as a §9.3 `EditOp`. */
export interface EditStep<I extends EditableInstruction> {
  readonly move: EditMove;
  /** The FIRST A-side instruction the move consumes; null where it consumes none. */
  readonly a: I | null;
  /** The FIRST B-side instruction the move produces; null where it produces none. */
  readonly b: I | null;
  /**
   * Every instruction the move consumes on each side, in sequence order.
   *
   * A plain op has at most one of each; a `consolidate` has several `aItems` and one `bItems`,
   * a `fragment` the reverse. An op that said "consolidate" without saying HOW MANY would not
   * be actionable, which is why the counts travel rather than being derivable from the dates.
   */
  readonly aItems: readonly I[];
  readonly bItems: readonly I[];
  /** Position of {@link a} in the A sequence, or null where the move consumes none. */
  readonly indexA: number | null;
  readonly indexB: number | null;
  /** The SEQUENTIAL price in the delivered (date) order — §6.2, in JND·quarters. */
  readonly cost: number;
  /** `cost === 0` by pricing: the state performs the same function before and after (§6.2). */
  readonly free: boolean;
  /** Position in the delivered order (C5). */
  readonly applicationIndex: number;
  /** Position in cost-descending order (C5). */
  readonly costRank: number;
}

export interface EditScriptResult<I extends EditableInstruction> {
  /** Delivered in application (date) order, each carrying both orders (§6.1, C5). */
  readonly steps: readonly EditStep<I>[];
  /** The DP's own path total — the quantity the recurrence minimized (§6.3). */
  readonly scriptCost: number;
  /** The same op set applied in the delivered order; `Σ steps.cost` exactly (§6.3). */
  readonly replayedDelta: number;
  /** `‖Φ(B) − Φ(A)‖₁`: the lower bound both totals are theorems about. */
  readonly directDistance: number;
  /** Indices into {@link steps}, cost-descending — U3's "what matters most" (C5). */
  readonly topByCost: readonly number[];
  readonly opCounts: EditOpCounts;
  /**
   * `norm(Φ(state after the last op), Φ(B))`, which §6.3's verification requires to be 0.
   *
   * Exposed rather than merely asserted: a caller can see that the replay really reached B,
   * and a future move kind that failed to is visible instead of silently absorbed.
   */
  readonly replayResidual: number;
}

export interface EditOpCounts {
  readonly insert: number;
  readonly delete: number;
  readonly substitute: number;
  readonly fragment: number;
  readonly consolidate: number;
  readonly free: number;
}

/** Knobs the search takes. */
export interface EditScriptSearch {
  /**
   * Whether `fragment` and `consolidate` are in the move set (A-Q5, §6.1's `moves`).
   *
   * They land AFTER the plain script because that is the order A-Q5 rules and because they are
   * only meaningful under it: a move is emitted where treating a group as ONE edit is strictly
   * cheaper than any sequence of plain ops, and "strictly cheaper" is a claim the plain pricing
   * has to be in place to make. The op kind is therefore a statement about the PRICE — these
   * instructions are best read as one gesture — and not a claim about what the author did.
   *
   * By the `L¹` triangle inequality a move is never dearer than the plain decomposition it
   * replaces, so enabling them can only lower `scriptCost`, never raise it: the script moves
   * TOWARD the lower bound as its vocabulary grows, and `reworking` shrinks with it.
   */
  readonly moves?: boolean;
}

// ---------------------------------------------------------------------------
// The delivered order
// ---------------------------------------------------------------------------

/**
 * The date key an op is delivered and replayed at: `dateA ?? dateB` (§6.4).
 *
 * A substitution between instructions at different dates is keyed on the A side, which is the
 * side the edit starts from — the script transforms A, so where the reader stands in the score
 * is A's date until the op has been applied.
 */
function dateKeyOf<I extends EditableInstruction>(step: {
  readonly a: I | null;
  readonly b: I | null;
}): number {
  return step.a?.dateTicks ?? step.b?.dateTicks ?? 0;
}

/** Move order for the delivery tie-break: the traceback precedence, spelled as a rank. */
const MOVE_RANK: Readonly<Record<EditMove, number>> = {
  substitute: 0,
  delete: 1,
  insert: 2,
  fragment: 3,
  consolidate: 4,
};

/** Everything the delivery order reads; both the traced steps and the inverted ones have it. */
interface DeliverableStep<I extends EditableInstruction> {
  readonly move: EditMove;
  readonly a: I | null;
  readonly b: I | null;
  readonly aItems: readonly I[];
  readonly bItems: readonly I[];
  readonly indexA: number | null;
  readonly indexB: number | null;
}

/**
 * A TOTAL order on the ops of one script, so the delivery order is a function of the inputs.
 *
 * Date first (§6.1's application order), then §6.4's tie-breaks reduced to what is available
 * inside one (part, map) script: the move rank, then the source indices. Two ops of one script
 * cannot tie on all of these — a move consumes at least one indexed instruction and no two
 * moves consume the same one — so the order is total by construction rather than by an argument
 * that the earlier keys separate everything (the W3 MAJOR-6 lesson).
 */
function compareDelivery<I extends EditableInstruction>(
  x: DeliverableStep<I>,
  y: DeliverableStep<I>,
): number {
  const dateDelta = dateKeyOf(x) - dateKeyOf(y);
  if (dateDelta !== 0) return dateDelta;
  const rankDelta = MOVE_RANK[x.move] - MOVE_RANK[y.move];
  if (rankDelta !== 0) return rankDelta;
  const aDelta = (x.indexA ?? -1) - (y.indexA ?? -1);
  if (aDelta !== 0) return aDelta;
  return (x.indexB ?? -1) - (y.indexB ?? -1);
}

// ---------------------------------------------------------------------------
// States
// ---------------------------------------------------------------------------

/**
 * `S(i, j) = b[0..j) ++ a[i..n)`, in the order a curve reader would see it.
 *
 * Sorted by date, with a surviving A instruction placed BEFORE a co-dated B one and ties inside
 * one side keeping that side's own order. The side preference is renderer-derived rather than
 * arbitrary: `datedView.orderedEntries` reproduces `GenericMap.parseData`'s backwards insertion
 * scan, which finds the last position whose date is `<=` the new one, so an element added to a
 * map lands AFTER the children already sitting at its date. A state is A's map with some of B's
 * instructions added to it, so B's sit after A's survivors — and since a co-dated predecessor
 * governs a zero-width span, that decides which of the two performs.
 *
 * It matters where both sides coexist at one date. The DP fill reaches that, and **so does the
 * replay** — this paragraph used to claim otherwise (W4 MAJOR-8), on the argument that the
 * delivered order is date-then-move-rank with `delete` outranking `insert`, so at a shared date
 * A's instruction is gone before B's arrives. That holds for one instruction per side and fails
 * as soon as a date carries two: the DP substitutes one and DELETES the other, and the survivor
 * is still there when the insertion lands. Measured over 4000 random pairs, **668** come out
 * with a different `replayedDelta` under the reversed rule — one in six, not a corner.
 * `stateFromFlags` below carries the same comparator for the same reason, and
 * `editScript.test.ts` pins the smallest of those 668.
 *
 * At `(n, m)` no A instruction survives at all, so the final state is `b`'s own records in `b`'s
 * own order and `Φ(S(n,m))` is `Φ(B)` bit for bit — which is what makes §6.3's replay residual
 * an exact 0. That part was true and remains true.
 *
 * Exported so the ordering rule can be pinned where it is directly visible. Through the DP it is
 * observable only statistically — reversing the side preference moves some scripts on a random
 * family and none on any single hand-built pair, which is the situation RG-2 and the `K = 4` pin
 * met: when a property stops being observable at one layer, the evidence goes down a layer.
 */
export function editStateAt<I extends EditableInstruction>(
  a: readonly I[],
  b: readonly I[],
  i: number,
  j: number,
): readonly I[] {
  const tagged: TaggedInstruction<I>[] = [
    ...b.slice(0, j).map((instruction, index) => ({ instruction, side: B_SIDE, index })),
    // `a`'s survivors keep their ORIGINAL indices, so the slice's own offsets are shifted back.
    ...a.slice(i).map((instruction, offset) => ({ instruction, side: A_SIDE, index: i + offset })),
  ];
  return tagged.sort(inStateOrder).map((entry) => entry.instruction);
}

/** An instruction with the two keys the state order needs beyond its date. */
interface TaggedInstruction<I> {
  readonly instruction: I;
  readonly side: typeof A_SIDE | typeof B_SIDE;
  readonly index: number;
}

/** The side keys, named: B before A at an equal date, which is the ordering rule above. */
const B_SIDE = 1 as const;
const A_SIDE = 0 as const;

/** What an out-of-range read into one of the two instruction lists is called (`indexing.ts`). */
const A_SEQUENCE = 'the A instruction sequence';
const B_SEQUENCE = 'the B instruction sequence';

/**
 * The state order, shared by {@link editStateAt} and {@link stateFromFlags}.
 *
 * The two functions have to agree — `editStateAt`'s doc explains why the B side wins an equal
 * date, and `stateFromFlags` "carries the same comparator for the same reason". One comparator
 * is how that stops being a claim a future edit can falsify in one place and not the other.
 */
function inStateOrder<I extends EditableInstruction>(
  x: TaggedInstruction<I>,
  y: TaggedInstruction<I>,
): number {
  const dateDelta = x.instruction.dateTicks - y.instruction.dateTicks;
  if (dateDelta !== 0) return dateDelta;
  if (x.side !== y.side) return x.side - y.side;
  return x.index - y.index;
}

/**
 * The state after applying a SUBSET of the script — the replay's own state model.
 *
 * A step is identified by the instructions it consumes, so the state after a subset is
 * A minus every deleted-or-substituted-away instruction, plus every inserted-or-substituted-in
 * one. That is well defined for ANY subset, which is what lets the replay walk the ops in a
 * different order from the one the DP found them in.
 */
function stateFromFlags<I extends EditableInstruction>(
  a: readonly I[],
  b: readonly I[],
  removedA: readonly boolean[],
  addedB: readonly boolean[],
): readonly I[] {
  const tagged: TaggedInstruction<I>[] = [
    ...filterMap(a, (instruction, index) =>
      removedA[index] ? null : { instruction, side: A_SIDE, index },
    ),
    ...filterMap(b, (instruction, index) =>
      addedB[index] ? { instruction, side: B_SIDE, index } : null,
    ),
  ];
  // The same comparator {@link editStateAt} sorts with, for the reason its doc gives.
  return tagged.sort(inStateOrder).map((entry) => entry.instruction);
}

// ---------------------------------------------------------------------------
// The DP
// ---------------------------------------------------------------------------

/** Backpointer codes; `NONE` is the origin. */
const FROM_NONE = 0;
const FROM_SUBSTITUTE = 1;
const FROM_DELETE = 2;
const FROM_INSERT = 3;
/** One A instruction became several B ones; the span travels in a parallel array. */
const FROM_FRAGMENT = 4;
/** Several A instructions became one B; likewise. */
const FROM_CONSOLIDATE = 5;

/**
 * The minimal-cost monotone edit script from `a` to `b` under sequential pricing.
 *
 * `a` and `b` must already be date-ordered on a COMMON tick grid, which is what
 * `document.ts`'s ordered view plus the pair's ppq normalization produce.
 */
export function editScript<I extends EditableInstruction, S>(
  a: readonly I[],
  b: readonly I[],
  pricing: EditPricing<I, S>,
  search: EditScriptSearch = {},
): EditScriptResult<I> {
  const n = a.length;
  const m = b.length;
  const width = m + 1;

  // Φ per cell, computed once. The fill reads each of them from three transitions and the
  // replay reads two of them again, so memoizing here is the difference between (n+1)(m+1)
  // representations and six per cell.
  const representations: (S | undefined)[] = new Array<S | undefined>((n + 1) * width);
  const phi = (i: number, j: number): S => {
    const slot = i * width + j;
    const cached = representations[slot];
    if (cached !== undefined) return cached;
    const built = pricing.represent(editStateAt(a, b, i, j));
    representations[slot] = built;
    return built;
  };

  const cost = new Float64Array((n + 1) * width);
  const from = new Int8Array((n + 1) * width);
  // How many instructions the move consumed on its MANY side; 1 for every plain op.
  const span = new Int8Array((n + 1) * width).fill(1);
  const moves = search.moves === true;

  // The three tables are read at computed strides all through the recurrence and the traceback,
  // which is the one shape `indexing.ts` exists for: the arithmetic IS the algorithm, and a
  // stride bug should be a `RangeError` naming the table rather than an `undefined` that
  // arrives in a published cost.
  const costAt = (row: number, column: number): number =>
    numberAt(cost, row * width + column, "the edit DP's cost table");

  for (let i = 0; i <= n; ++i)
    for (let j = 0; j <= m; ++j) {
      if (i === 0 && j === 0) {
        from[0] = FROM_NONE;
        continue;
      }

      let best = Number.POSITIVE_INFINITY;
      let bestFrom = FROM_NONE;

      // §6.4's precedence, applied at the cell: strict `<` after the substitute branch means
      // a tie keeps the earlier candidate, so the order of these three blocks IS the rule.
      if (i > 0 && j > 0) {
        best =
          costAt(i - 1, j - 1) +
          pricing.norm(
            phi(i - 1, j - 1),
            phi(i, j),
            editStateAt(a, b, i - 1, j - 1),
            editStateAt(a, b, i, j),
          );
        bestFrom = FROM_SUBSTITUTE;
      }
      if (i > 0) {
        const candidate =
          costAt(i - 1, j) +
          pricing.norm(
            phi(i - 1, j),
            phi(i, j),
            editStateAt(a, b, i - 1, j),
            editStateAt(a, b, i, j),
          );
        if (candidate < best) {
          best = candidate;
          bestFrom = FROM_DELETE;
        }
      }
      if (j > 0) {
        const candidate =
          costAt(i, j - 1) +
          pricing.norm(
            phi(i, j - 1),
            phi(i, j),
            editStateAt(a, b, i, j - 1),
            editStateAt(a, b, i, j),
          );
        if (candidate < best) {
          best = candidate;
          bestFrom = FROM_INSERT;
        }
      }

      // A-Q5's two, and they rank BELOW the plain ops so a tie keeps the primitive. They can
      // only win strictly, which is what makes the op kind a statement about the price.
      let bestSpan = 1;
      if (moves) {
        // `fragment`: one `a[i-1]` became `b[j-k .. j)`, `k ≥ 2`.
        for (let k = 2; k <= MAX_MOVE_SPAN && i > 0 && j >= k; ++k) {
          const candidate =
            costAt(i - 1, j - k) +
            pricing.norm(
              phi(i - 1, j - k),
              phi(i, j),
              editStateAt(a, b, i - 1, j - k),
              editStateAt(a, b, i, j),
            );
          if (candidate < best) {
            best = candidate;
            bestFrom = FROM_FRAGMENT;
            bestSpan = k;
          }
        }
        // `consolidate`: `a[i-k .. i)` became one `b[j-1]`.
        for (let k = 2; k <= MAX_MOVE_SPAN && j > 0 && i >= k; ++k) {
          const candidate =
            costAt(i - k, j - 1) +
            pricing.norm(
              phi(i - k, j - 1),
              phi(i, j),
              editStateAt(a, b, i - k, j - 1),
              editStateAt(a, b, i, j),
            );
          if (candidate < best) {
            best = candidate;
            bestFrom = FROM_CONSOLIDATE;
            bestSpan = k;
          }
        }
      }

      cost[i * width + j] = best;
      from[i * width + j] = bestFrom;
      span[i * width + j] = bestSpan;
    }

  // Traceback, then delivery order, then the replay that prices what is delivered.
  const traced: DeliverableStep<I>[] = [];
  for (let i = n, j = m; i > 0 || j > 0;) {
    const code = numberAt(from, i * width + j, "the edit DP's backpointer table");
    const k = numberAt(span, i * width + j, "the edit DP's span table");
    if (code === FROM_SUBSTITUTE) {
      const consumed = elementAt(a, i - 1, A_SEQUENCE);
      const produced = elementAt(b, j - 1, B_SEQUENCE);
      traced.push({
        move: 'substitute',
        a: consumed,
        b: produced,
        aItems: [consumed],
        bItems: [produced],
        indexA: i - 1,
        indexB: j - 1,
      });
      i -= 1;
      j -= 1;
    } else if (code === FROM_DELETE) {
      const consumed = elementAt(a, i - 1, A_SEQUENCE);
      traced.push({
        move: 'delete',
        a: consumed,
        b: null,
        aItems: [consumed],
        bItems: [],
        indexA: i - 1,
        indexB: null,
      });
      i -= 1;
    } else if (code === FROM_FRAGMENT) {
      const consumed = elementAt(a, i - 1, A_SEQUENCE);
      traced.push({
        move: 'fragment',
        a: consumed,
        b: elementAt(b, j - k, B_SEQUENCE),
        aItems: [consumed],
        bItems: b.slice(j - k, j),
        indexA: i - 1,
        indexB: j - k,
      });
      i -= 1;
      j -= k;
    } else if (code === FROM_CONSOLIDATE) {
      const produced = elementAt(b, j - 1, B_SEQUENCE);
      traced.push({
        move: 'consolidate',
        a: elementAt(a, i - k, A_SEQUENCE),
        b: produced,
        aItems: a.slice(i - k, i),
        bItems: [produced],
        indexA: i - k,
        indexB: j - 1,
      });
      i -= k;
      j -= 1;
    } else {
      const produced = elementAt(b, j - 1, B_SEQUENCE);
      traced.push({
        move: 'insert',
        a: null,
        b: produced,
        aItems: [],
        bItems: [produced],
        indexA: null,
        indexB: j - 1,
      });
      j -= 1;
    }
  }
  traced.reverse();

  const ordered = [...traced].sort(compareDelivery);

  const removedA = new Array<boolean>(n).fill(false);
  const addedB = new Array<boolean>(m).fill(false);
  let instructions = stateFromFlags(a, b, removedA, addedB);
  let state = pricing.represent(instructions);
  const replayCosts: number[] = [];
  let replayed = 0;
  for (const step of ordered) {
    for (let offset = 0; offset < step.aItems.length; ++offset)
      removedA[(step.indexA ?? 0) + offset] = true;
    for (let offset = 0; offset < step.bItems.length; ++offset)
      addedB[(step.indexB ?? 0) + offset] = true;
    const nextInstructions = stateFromFlags(a, b, removedA, addedB);
    const next = pricing.represent(nextInstructions);
    const price = pricing.norm(state, next, instructions, nextInstructions);
    replayCosts.push(price);
    replayed += price;
    state = next;
    instructions = nextInstructions;
  }

  const replayResidual = pricing.norm(state, phi(n, m), instructions, editStateAt(a, b, n, m));

  // Cost rank: descending, ties by the delivered order, so the ranking is a permutation of the
  // delivery indices and never depends on the sort's own stability. Decorated with the delivery
  // index before sorting rather than sorting indices and looking their costs back up — the two
  // keys then travel together and the comparator reads as the rule it states.
  const ranking = rankByCostDescending(replayCosts);
  const ranks = invertPermutation(ranking);

  // `replayCosts` is pushed once per delivered step and `ranks` is its inverse permutation, so
  // all three sequences are indexed by the same delivery position and can be zipped.
  const steps = zipWith(ordered, replayCosts, (step, price, index): EditStep<I> => ({
    move: step.move,
    aItems: step.aItems,
    bItems: step.bItems,
    a: step.a,
    b: step.b,
    indexA: step.indexA,
    indexB: step.indexB,
    cost: price,
    free: price === 0,
    applicationIndex: index,
    costRank: numberAt(ranks, index, 'the cost ranking'),
  }));

  return {
    steps,
    scriptCost: costAt(n, m),
    replayedDelta: replayed,
    directDistance: pricing.norm(
      phi(0, 0),
      phi(n, m),
      editStateAt(a, b, 0, 0),
      editStateAt(a, b, n, m),
    ),
    topByCost: ranking,
    opCounts: countOps(steps),
    replayResidual,
  };
}

function countOps<I extends EditableInstruction>(steps: readonly EditStep<I>[]): EditOpCounts {
  return {
    insert: steps.filter((step) => step.move === 'insert').length,
    delete: steps.filter((step) => step.move === 'delete').length,
    substitute: steps.filter((step) => step.move === 'substitute').length,
    fragment: steps.filter((step) => step.move === 'fragment').length,
    consolidate: steps.filter((step) => step.move === 'consolidate').length,
    free: steps.filter((step) => step.free).length,
  };
}

// ---------------------------------------------------------------------------
// The mirror
// ---------------------------------------------------------------------------

/**
 * The script for the other direction, by inversion rather than by a second DP run (§6.4).
 *
 * `insert ↔ delete`, `a ↔ b`, `indexA ↔ indexB`; `substitute` is its own inverse. The costs
 * are unchanged, which is the point: `‖Φ(M_i) − Φ(M_{i−1})‖₁` is symmetric, so the reversed
 * script's steps cost what the forward ones do, and a caller who inverts gets bit-identical
 * numbers instead of a second traceback's arbitrary choice among ties.
 *
 * The delivered order is recomputed, because the date key is `dateA ?? dateB` and the two
 * sides have swapped: an insert delivered at its B date becomes a delete delivered at that
 * same date, now read off the A slot.
 */
export function invertSteps<I extends EditableInstruction>(
  steps: readonly EditStep<I>[],
): readonly EditStep<I>[] {
  const inverse: Readonly<Record<EditMove, EditMove>> = {
    insert: 'delete',
    delete: 'insert',
    substitute: 'substitute',
    // One became several, read the other way round, is several became one.
    fragment: 'consolidate',
    consolidate: 'fragment',
  };
  const flipped: (DeliverableStep<I> & { readonly cost: number; readonly free: boolean })[] =
    steps.map((step) => ({
      move: inverse[step.move],
      a: step.b,
      b: step.a,
      aItems: step.bItems,
      bItems: step.aItems,
      indexA: step.indexB,
      indexB: step.indexA,
      cost: step.cost,
      free: step.free,
    }));

  const ordered = [...flipped].sort(compareDelivery);
  const ranks = invertPermutation(rankByCostDescending(ordered.map((step) => step.cost)));

  return ordered.map((step, index) => ({
    ...step,
    applicationIndex: index,
    costRank: numberAt(ranks, index, 'the cost ranking'),
  }));
}

/**
 * The delivery indices in cost-descending order, ties by delivery index.
 *
 * Shared by the forward path and {@link invertSteps} so the two cannot disagree about what
 * `costRank` means, which is the same argument {@link inStateOrder} makes for the state order.
 * Sorting DECORATED pairs rather than bare indices is what keeps the comparator a statement of
 * the rule instead of two look-ups into a sequence it does not own.
 */
function rankByCostDescending(costs: readonly number[]): readonly number[] {
  return costs
    .map((cost, index) => ({ cost, index }))
    .sort((x, y) => y.cost - x.cost || x.index - y.index)
    .map((entry) => entry.index);
}

/** `ranks[i]` is where `i` appears in `ranking` — the inverse of a permutation of `0 … n−1`. */
function invertPermutation(ranking: readonly number[]): readonly number[] {
  const ranks = new Array<number>(ranking.length).fill(0);
  for (const [rank, index] of ranking.entries()) ranks[index] = rank;
  return ranks;
}
