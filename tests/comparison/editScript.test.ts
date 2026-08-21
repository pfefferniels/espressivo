/**
 * §6's sequential-pricing DP, tested on its OBJECTIVE rather than on an alignment.
 *
 * The discipline is `eventAlignment.test.ts`'s and `aggregate.test.ts`'s: the load-bearing test
 * enumerates every monotone alignment by brute force and checks the DP found the cheapest one.
 * Asserting "these two instructions match" would pin one optimum out of several equal ones and
 * would pass on an implementation minimizing the wrong functional — which is exactly the defect
 * §6.2 exists to correct, since revision 1 minimized a price against A and reported a sequential
 * one.
 *
 * The toy `Φ` is a STEP function in a log space: an instruction sets a level from its date until
 * the next one, `norm` is `∫|x − y| dt` over a fixed window, and the integral is exact because
 * both readings are piecewise constant. That is the shape of `tempoDistance` with every
 * transition removed, so it exercises the DP's own arithmetic without importing a dimension's.
 */
import { describe, it, expect } from 'vitest';
import {
  editScript,
  editStateAt,
  invertSteps,
  MAX_MOVE_SPAN,
  type EditPricing,
  type EditStep,
} from '../../src/comparison/editScript.js';
import { elementAt, pairwise } from '../../src/prelude/index.js';

/** Level `index` of a hand-built sequence, checked. */
const levelAt = (levels: readonly Level[], index: number) =>
  elementAt(levels, index, 'the hand-built level sequence');

// ---------------------------------------------------------------------------
// The toy Φ
// ---------------------------------------------------------------------------

interface Level {
  readonly dateTicks: number;
  readonly value: number;
  readonly id: string;
}

const WINDOW_END = 10;

/** The step function's value at `t`: the last instruction at or before it, else the neutral. */
function valueAt(state: readonly Level[], t: number, neutral: number): number {
  let value = neutral;
  for (const instruction of state) {
    if (instruction.dateTicks > t) break;
    value = instruction.value;
  }
  return value;
}

/** `∫|x − y| dt` over `[0, WINDOW_END]`, exact: both readings are piecewise constant. */
function stepNorm(x: readonly Level[], y: readonly Level[], neutral: number): number {
  const edges = new Set<number>([0, WINDOW_END]);
  for (const instruction of [...x, ...y])
    if (instruction.dateTicks > 0 && instruction.dateTicks < WINDOW_END)
      edges.add(instruction.dateTicks);
  const grid = [...edges].sort((a, b) => a - b);

  let total = 0;
  for (const [at, next] of pairwise(grid))
    total += Math.abs(valueAt(x, at, neutral) - valueAt(y, at, neutral)) * (next - at);
  return total;
}

const pricing = (neutral = Math.log(100)): EditPricing<Level, readonly Level[]> => ({
  represent: (state) => state,
  norm: (x, y) => stepNorm(x, y, neutral),
});

const level = (
  dateTicks: number,
  bpm: number,
  id = `${String(dateTicks)}@${String(bpm)}`,
): Level => ({
  dateTicks,
  value: Math.log(bpm),
  id,
});

// ---------------------------------------------------------------------------
// The objective
// ---------------------------------------------------------------------------

/** Every monotone alignment of `n` against `m`, as a move sequence. */
function monotoneAlignments(n: number, m: number): (readonly ('s' | 'd' | 'i')[])[] {
  if (n === 0 && m === 0) return [[]];
  const out: (readonly ('s' | 'd' | 'i')[])[] = [];
  if (n > 0 && m > 0) for (const tail of monotoneAlignments(n - 1, m - 1)) out.push(['s', ...tail]);
  if (n > 0) for (const tail of monotoneAlignments(n - 1, m)) out.push(['d', ...tail]);
  if (m > 0) for (const tail of monotoneAlignments(n, m - 1)) out.push(['i', ...tail]);
  return out;
}

/**
 * The DP-path cost of one alignment, computed the way §6.2 defines it and NOT by the DP.
 *
 * The moves are read from the END of the sequence, which is the direction the traceback runs,
 * so a move sequence describes the path from `(n, m)` back to `(0, 0)`; walking it forwards
 * from `(0, 0)` reproduces the states the recurrence visits.
 */
function pathCost(a: readonly Level[], b: readonly Level[], moves: readonly ('s' | 'd' | 'i')[]) {
  // `S(i, j)`, restated here rather than imported: the co-dated rule (a surviving A instruction
  // before an added B one) is part of what the DP is being checked against, and a reference that
  // called the implementation's own helper could not disagree with it.
  const state = (i: number, j: number): readonly Level[] =>
    [
      ...a.slice(i).map((instruction, index) => ({ instruction, side: 0, index: i + index })),
      ...b.slice(0, j).map((instruction, index) => ({ instruction, side: 1, index })),
    ]
      .sort(
        (x, y) =>
          x.instruction.dateTicks - y.instruction.dateTicks || x.side - y.side || x.index - y.index,
      )
      .map((entry) => entry.instruction);
  const norm = (x: readonly Level[], y: readonly Level[]) => stepNorm(x, y, Math.log(100));

  let i = a.length;
  let j = b.length;
  let total = 0;
  for (const move of moves) {
    const [fromI, fromJ] =
      move === 's'
        ? ([i - 1, j - 1] as const)
        : move === 'd'
          ? ([i - 1, j] as const)
          : ([i, j - 1] as const);
    total += norm(state(fromI, fromJ), state(i, j));
    i = fromI;
    j = fromJ;
  }
  return total;
}

// ---------------------------------------------------------------------------
// A deterministic generator — never `Math.random`, which would put a PRNG on the output path
// ---------------------------------------------------------------------------

function lcg(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function randomSequence(next: () => number, count: number): readonly Level[] {
  const dates = new Set<number>();
  while (dates.size < count) dates.add(Math.floor(next() * WINDOW_END));
  return [...dates]
    .sort((x, y) => x - y)
    .map((date, index) => level(date, 40 + Math.floor(next() * 120), `r${String(index)}`));
}

// ---------------------------------------------------------------------------

describe('the DP minimizes the sequential objective', () => {
  it('agrees with a brute-force enumeration of every monotone alignment', () => {
    const next = lcg(20260816);
    for (let trial = 0; trial < 40; ++trial) {
      const a = randomSequence(next, 1 + Math.floor(next() * 4));
      const b = randomSequence(next, 1 + Math.floor(next() * 4));
      const result = editScript(a, b, pricing());
      const best = Math.min(
        ...monotoneAlignments(a.length, b.length).map((moves) => pathCost(a, b, moves)),
      );
      expect(result.scriptCost).toBeCloseTo(best, 12);
    }
  });

  it('reaches the brute-force optimum on the empty and one-sided shapes', () => {
    const a = [level(0, 60), level(5, 80)];
    for (const [x, y] of [
      [a, []],
      [[], a],
      [[], []],
    ] as const) {
      const result = editScript(x, y, pricing());
      const best = Math.min(
        ...monotoneAlignments(x.length, y.length).map((moves) => pathCost(x, y, moves)),
      );
      expect(result.scriptCost).toBeCloseTo(best, 12);
      // Every instruction of both sides is consumed exactly once; a substitution consumes two.
      expect(result.steps).toHaveLength(x.length + y.length - result.opCounts.substitute);
    }
  });

  it('places an added B instruction AFTER a co-dated surviving A one, as the map would', () => {
    // `GenericMap.parseData`'s backwards insertion scan puts a new child after the children
    // already sitting at its date, so the added one governs and the survivor keeps a zero-width
    // span. Pinned at the state function, because through the DP the rule is observable only
    // statistically: reversing the side preference moves scripts on the random family (a
    // negative control fails the brute-force test) and moves nothing on any single hand-built
    // pair, which is the RG-2 situation.
    const survivor = level(0, 60, 'A');
    const other = level(4, 90, 'C');
    const added = level(0, 120, 'B');
    const state = editStateAt([survivor, other], [added], 0, 1);
    expect(state.map((instruction) => instruction.id)).toEqual(['A', 'B', 'C']);
    // And it is the added one that performs, since its predecessor's span is zero-width.
    expect(valueAt(state, 0, Math.log(100))).toBe(added.value);
  });

  /**
   * The SAME rule inside the replay's own state function, which had no pin at all (W4 MAJOR-8).
   *
   * `editStateAt` is pinned directly above; `stateFromFlags` carries the identical comparator
   * for the identical reason, and reversing its `x.side - y.side` failed NOTHING in the suite.
   * The module's prose said the replay never reaches the co-dated case. Measured, it does: over
   * 4000 random pairs of the shape this file's generator produces, **668** came out with a
   * different `replayedDelta` under the reversed rule. Not a corner — one pair in six.
   *
   * The witness below is the SMALLEST of those 668, found by running the generator under both
   * rules and sorting the disagreements by size: two A instructions at one date against a single
   * B instruction at the same date. The DP substitutes one and deletes the other, so the replay
   * passes through a state holding a surviving A instruction and an added B instruction at the
   * same date — and which of them governs the interval after it is exactly what the side rule
   * decides.
   *
   * Pinned as a VALUE rather than as an ordering, because the ordering inside `stateFromFlags`
   * is not observable from outside `editScript` and a test that reached in to check it would be
   * pinning the implementation rather than the behaviour.
   */
  /**
   * `replayResidual` is CHECKED against an independent reconstruction, not taken on trust
   * (MINOR-7).
   *
   * Hard-coding `const replayResidual = 0` in `editScript` failed nothing: the field asserts its
   * own correctness. Structurally the claim is sound — the op bookkeeping does reach B — but
   * nothing computed `Φ(final)` independently of `editScript` and compared it to `Φ(B)`, which
   * is exactly what a residual is FOR (§6.3). A genuinely broken replay was caught (skipping the
   * last delivered op fails tests across four files); a replay that lied about its own residual
   * was not.
   *
   * Rebuilt here from the DELIVERED OPS ALONE: start from `a`, remove every instruction any step
   * consumes, add every one any step produces, sort into the state order, and compare `Φ` of
   * that against `Φ(b)` with the same `norm` the engine used. That shares no line with the
   * replay's own accumulation.
   */
  it('reports a replayResidual that an independent rebuild agrees with (MINOR-7)', () => {
    const next = lcg(90210);
    let checked = 0;
    for (let trial = 0; trial < 60; ++trial) {
      const a = randomSequence(next, 1 + Math.floor(next() * 4));
      const b = randomSequence(next, 1 + Math.floor(next() * 4));
      const result = editScript(a, b, pricing());

      // Every A instruction consumed at most once and every B instruction produced at most once
      // — the bookkeeping the residual's exactness actually rests on.
      const consumed = result.steps.flatMap((step) => step.aItems);
      const produced = result.steps.flatMap((step) => step.bItems);
      expect(new Set(consumed).size).toBe(consumed.length);
      expect(new Set(produced).size).toBe(produced.length);
      expect(new Set(consumed)).toEqual(new Set(a));
      expect(new Set(produced)).toEqual(new Set(b));

      // The final state, rebuilt from the ops rather than read out of the engine.
      const survivors = a.filter((instruction) => !consumed.includes(instruction));
      const rebuilt = [...survivors, ...produced].sort(
        (x, y) => x.dateTicks - y.dateTicks || (x.id < y.id ? -1 : 1),
      );
      const residual = stepNorm(rebuilt, b, Math.log(100));

      expect({ trial, residual }).toEqual({ trial, residual: 0 });
      expect({ trial, reported: result.replayResidual }).toEqual({ trial, reported: residual });
      checked += 1;
    }
    expect(checked).toBe(60);
  });

  it('prefers the surviving side at a co-dated date in the REPLAY too (MAJOR-8)', () => {
    const a = [level(1, 210, 'a0'), level(1, 202, 'a1')];
    const b = [level(1, 108, 'b0')];
    const result = editScript(a, b, pricing());

    // [MEASURED] 5.635228232492866 shipped, against 6.3343452321856075 with `x.side - y.side`
    // reversed — a 12 % difference on a three-instruction pair.
    expect(result.replayedDelta).toBe(5.635228232492866);
    expect(result.replayResidual).toBe(0);

    // Non-vacuity: the pair really does put a survivor and an addition at one date. Both A
    // instructions share a date, so whichever the DP keeps is co-dated with B's insertion, and
    // the replay must pass through that state on its way to B.
    expect(levelAt(a, 0).dateTicks).toBe(levelAt(a, 1).dateTicks);
    expect(levelAt(b, 0).dateTicks).toBe(levelAt(a, 0).dateTicks);
    expect(result.steps.length).toBeGreaterThan(1);
  });
});

describe('AD-5: pricing against A is not an upper bound, and the counterexample is §6.2’s own', () => {
  // `A = {I@0 bpm=60, J@5 bpm=60}` — a legal no-op restatement — against `B = {I@0 bpm=120}`.
  const a = [level(0, 60, 'I'), level(5, 60, 'J')];
  const b = [level(0, 120, 'I')];

  it('prices the script at exactly d_curve, so reworking is 0 rather than negative', () => {
    const result = editScript(a, b, pricing());

    // `d_curve` is `10·ln2`: A performs 60 across the whole window and B performs 120.
    expect(result.directDistance).toBeCloseTo(10 * Math.LN2, 12);
    expect(result.scriptCost).toBeCloseTo(10 * Math.LN2, 12);
    expect(result.replayedDelta).toBeCloseTo(10 * Math.LN2, 12);
    expect(result.scriptCost - result.directDistance).toBeCloseTo(0, 12);
    expect(result.steps).toHaveLength(2);
    expect(result.opCounts).toMatchObject({ substitute: 1, delete: 1, insert: 0 });
  });

  it('meets §6.2’s tie: BOTH readings of which instruction is substituted cost 10·ln2', () => {
    // §6.2's narrative substitutes `I` and deletes `J`. The DP delivers the other assignment —
    // delete `I`, substitute `J` — because at the last cell the two are EXACTLY equal and
    // §6.4's precedence keeps the substitute branch, which is reached from the delete-first
    // predecessor. That is a structural tie of the kind survey-algo §2.H names, not a defect,
    // and the ruling's substance is the TOTAL, which both readings agree on:
    //
    //   substitute I, then delete J : 5·ln2                 + 5·ln2                 = 10·ln2
    //   delete I,     then subst. J : 5·ln(100/60)          + 5·ln(120/100) + 5·ln2 = 10·ln2
    //
    // The second telescopes through the renderer's own no-tempo default, which is why the two
    // land on the same number rather than merely near it.
    const norm = (x: readonly Level[], y: readonly Level[]) => stepNorm(x, y, Math.log(100));
    const substituteFirst =
      norm(a, [level(0, 120, 'I'), levelAt(a, 1)]) + norm([level(0, 120, 'I'), levelAt(a, 1)], b);
    const deleteFirst = norm(a, [levelAt(a, 1)]) + norm([levelAt(a, 1)], b);
    expect(substituteFirst).toBeCloseTo(10 * Math.LN2, 12);
    expect(deleteFirst).toBeCloseTo(10 * Math.LN2, 12);

    // What the precedence actually picked, pinned so a change to it is visible.
    const result = editScript(a, b, pricing());
    expect(result.steps.map((step) => [step.move, step.a?.id ?? step.b?.id])).toEqual([
      ['delete', 'I'],
      ['substitute', 'J'],
    ]);
  });

  it('is refuted by the against-A reading, which halves the total and makes the delete free', () => {
    // The reading revision 1 shipped: every op priced against the ORIGINAL A.
    const norm = (x: readonly Level[], y: readonly Level[]) => stepNorm(x, y, Math.log(100));
    const substituteAgainstA = norm(a, [level(0, 120, 'I'), levelAt(a, 1)]);
    const deleteAgainstA = norm(a, [levelAt(a, 0)]);
    expect(substituteAgainstA).toBeCloseTo(5 * Math.LN2, 12);
    // Zero — J restates what precedes it, so removing it changes nothing in A's own context.
    expect(deleteAgainstA).toBe(0);
    expect(substituteAgainstA + deleteAgainstA).toBeCloseTo((10 * Math.LN2) / 2, 12);
  });
});

describe('the theorems, over a family rather than one shape', () => {
  it('scriptCost ≥ d, replayedDelta ≥ d, and reworking ≥ 0', () => {
    const next = lcg(4711);
    for (let trial = 0; trial < 60; ++trial) {
      const a = randomSequence(next, 1 + Math.floor(next() * 6));
      const b = randomSequence(next, 1 + Math.floor(next() * 6));
      const result = editScript(a, b, pricing());
      const slack = 1 + 1e-12;
      expect(result.scriptCost).toBeGreaterThanOrEqual(result.directDistance / slack);
      expect(result.replayedDelta).toBeGreaterThanOrEqual(result.directDistance / slack);
    }
  });

  it('closes: Σ steps.cost is replayedDelta, and the replay reaches B exactly', () => {
    const next = lcg(90210);
    for (let trial = 0; trial < 30; ++trial) {
      const a = randomSequence(next, 1 + Math.floor(next() * 5));
      const b = randomSequence(next, 1 + Math.floor(next() * 5));
      const result = editScript(a, b, pricing());
      const summed = result.steps.reduce((total, step) => total + step.cost, 0);
      expect(summed).toBeCloseTo(result.replayedDelta, 12);
      // §6.3's verification: the state after the last op IS B, so the residual is an exact 0.
      expect(result.replayResidual).toBe(0);
    }
  });

  it('is non-vacuous: the family really does produce nonzero scripts and real reworking', () => {
    const next = lcg(13);
    let nonzero = 0;
    let reworked = 0;
    for (let trial = 0; trial < 40; ++trial) {
      const a = randomSequence(next, 3);
      const b = randomSequence(next, 3);
      const result = editScript(a, b, pricing());
      if (result.scriptCost > 0) nonzero += 1;
      if (result.scriptCost > result.directDistance * (1 + 1e-9)) reworked += 1;
    }
    expect(nonzero).toBeGreaterThan(30);
    expect(reworked).toBeGreaterThan(0);
  });
});

describe('free means zero SEQUENTIAL cost (§6.2, A-B2)', () => {
  it('charges nothing for deleting a restatement when nothing else has changed', () => {
    const a = [level(0, 60, 'I'), level(5, 60, 'J')];
    const b = [level(0, 60, 'I')];
    const result = editScript(a, b, pricing());
    expect(result.scriptCost).toBe(0);
    expect(result.steps.every((step) => step.free)).toBe(true);
    expect(result.opCounts.free).toBe(result.steps.length);
  });

  it('does NOT call an op free merely because it was free against A', () => {
    // The same deletion, in a script whose substitution has already re-timed the span.
    const result = editScript(
      [level(0, 60, 'I'), level(5, 60, 'J')],
      [level(0, 120, 'I')],
      pricing(),
    );
    const deletion = result.steps.find((step) => step.move === 'delete');
    expect(deletion).toBeDefined();
    expect(deletion?.free).toBe(false);
  });
});

describe('determinism and the delivered order (§6.1, §6.4, C5)', () => {
  const a = [level(0, 60, 'I'), level(4, 90, 'J'), level(8, 70, 'K')];
  const b = [level(0, 120, 'X'), level(6, 50, 'Y')];

  it('delivers in date order across the whole family, not only where the DP already was', () => {
    // The DP walks its path in ALIGNMENT order, which is date order only sometimes: measured
    // over 4000 random pairs of this family, the traceback order differs from the delivered
    // order in **1146** of them (29 %). A test pinned to one hand-built pair passes on an
    // implementation that never re-sorts at all, which is what a negative control found.
    const next = lcg(777);
    let divergent = 0;
    for (let trial = 0; trial < 200; ++trial) {
      const x = randomSequence(next, 1 + Math.floor(next() * 5));
      const y = randomSequence(next, 1 + Math.floor(next() * 5));
      const result = editScript(x, y, pricing());
      const dates = result.steps.map((step) => step.a?.dateTicks ?? step.b?.dateTicks ?? 0);
      expect([...dates].sort((p, q) => p - q)).toEqual(dates);
      if (Math.abs(result.replayedDelta - result.scriptCost) > 1e-12) divergent += 1;
    }
    // Non-vacuity for the two totals: they are genuinely two numbers on this family, so
    // reporting one of them twice would be visible.
    expect(divergent).toBeGreaterThan(0);
  });

  it('carries both orders on every op (C5)', () => {
    const result = editScript(a, b, pricing());
    expect(result.steps.map((step) => step.applicationIndex)).toEqual(
      result.steps.map((_step, index) => index),
    );
    // `topByCost` indexes the delivered array in cost-descending order.
    const stepAt = (index: number) => elementAt(result.steps, index, 'the edit script’s steps');
    const ranked = result.topByCost.map((index) => stepAt(index).cost);
    expect([...ranked].sort((x, y) => y - x)).toEqual(ranked);
    expect(new Set(result.topByCost).size).toBe(result.steps.length);
    for (const [rank, index] of result.topByCost.entries())
      expect(stepAt(index).costRank).toBe(rank);
  });

  it('repeats bit for bit', () => {
    const once = editScript(a, b, pricing());
    const twice = editScript(a, b, pricing());
    expect(JSON.stringify(strip(twice.steps))).toBe(JSON.stringify(strip(once.steps)));
    expect(twice.scriptCost).toBe(once.scriptCost);
  });

  it('resolves a tie as substitute > delete > insert', () => {
    // Identical single instructions: substituting costs 0 and so does delete-then-insert.
    const one = [level(0, 60, 'I')];
    const result = editScript(one, [level(0, 60, 'I')], pricing());
    expect(result.steps).toHaveLength(1);
    const only = elementAt(result.steps, 0, 'the edit script’s steps');
    expect(only.move).toBe('substitute');
    expect(only.cost).toBe(0);
  });
});

describe('the mirror is an inversion, not a second traceback (§6.4, AD-21)', () => {
  const a = [level(0, 60, 'I'), level(4, 90, 'J'), level(8, 70, 'K')];
  const b = [level(0, 120, 'X'), level(6, 50, 'Y')];

  it('swaps the moves and the sides and keeps every cost bit-identical', () => {
    const forward = editScript(a, b, pricing());
    const mirrored = invertSteps(forward.steps);

    expect(mirrored).toHaveLength(forward.steps.length);
    expect(sumOf(mirrored)).toBe(sumOf(forward.steps));
    expect(mirrored.filter((step) => step.move === 'insert')).toHaveLength(forward.opCounts.delete);
    expect(mirrored.filter((step) => step.move === 'delete')).toHaveLength(forward.opCounts.insert);
    expect(mirrored.filter((step) => step.move === 'substitute')).toHaveLength(
      forward.opCounts.substitute,
    );
    for (const step of mirrored) {
      const original = forward.steps.find(
        (candidate) => candidate.a === step.b && candidate.b === step.a,
      );
      expect(original).toBeDefined();
      expect(step.cost).toBe(original?.cost);
    }
  });

  it('is an involution, and re-derives the delivered order rather than reversing the array', () => {
    const forward = editScript(a, b, pricing());
    const twice = invertSteps(invertSteps(forward.steps));
    expect(JSON.stringify(strip(twice))).toBe(JSON.stringify(strip(forward.steps)));

    // The date key is `dateA ?? dateB`, so inverting can genuinely REORDER: an insert delivered
    // at its B date becomes a delete read off the A slot at that same date, and it now sorts
    // against the other side's dates. A test asserting `mirrored === [...forward].reverse()`
    // would pass on an implementation that never re-sorted at all.
    const mirroredDates = invertSteps(forward.steps).map(
      (step) => step.a?.dateTicks ?? step.b?.dateTicks ?? 0,
    );
    expect([...mirroredDates].sort((x, y) => x - y)).toEqual(mirroredDates);
  });

  it('differs from the un-mirrored reverse, so the mirror is doing work', () => {
    const forward = editScript(a, b, pricing());
    const mirrored = invertSteps(forward.steps);
    expect(mirrored.map((step) => step.move)).not.toEqual(forward.steps.map((step) => step.move));
  });
});

describe('A-Q5’s moves: fragment and consolidate', () => {
  // One instruction becoming two, where the plain decomposition has to OVERSHOOT. `[60@2]`
  // performs 60 from bar 2 onward; `[140@2, 60@3]` performs 140 for one quarter and then 60.
  // Read as one edit that costs the single quarter that differs. Read as substitute-then-insert
  // it has to pass through `[140@2]`, which performs 140 for the whole rest of the window before
  // the insertion takes it back — and the slack is exactly what a move exists to avoid paying.
  const single = [level(2, 60, 'p')];
  const pair = [level(2, 140, 'x'), level(3, 60, 'y')];
  /** `|ln 140 − ln 60|`, the one difference the whole example is made of. */
  const L = Math.log(140 / 60);

  it('finds a fragment where the plain path has to overshoot', () => {
    const plain = editScript(single, pair, pricing());
    const withMoves = editScript(single, pair, pricing(), { moves: true });

    expect(withMoves.opCounts.fragment).toBe(1);
    expect(withMoves.scriptCost).toBeLessThan(plain.scriptCost);
    // One quarter against fifteen — and the move reaches the lower bound exactly.
    expect(withMoves.scriptCost).toBeCloseTo(L, 12);
    expect(withMoves.directDistance).toBeCloseTo(L, 12);
    expect(plain.scriptCost).toBeCloseTo(15 * L, 12);

    const move = withMoves.steps.find((step) => step.move === 'fragment');
    expect(move?.aItems.map((item) => item.id)).toEqual(['p']);
    expect(move?.bItems.map((item) => item.id)).toEqual(['x', 'y']);
  });

  it('turns every fragment into a consolidate under the mirror', () => {
    const result = editScript(single, pair, pricing(), { moves: true });
    const mirrored = invertSteps(result.steps);
    expect(mirrored.filter((step) => step.move === 'consolidate')).toHaveLength(
      result.opCounts.fragment,
    );
    expect(sumOf(mirrored)).toBe(sumOf(result.steps));
  });

  it('[MEASURED] chooses fragments far more often than consolidates, for a stated reason', () => {
    // Over 200 random pairs of this family: moves win in **114**, producing **120 fragments and
    // 1 consolidate**. The asymmetry is not an implementation accident and it is worth knowing
    // before reading an op count. A fragment replaces "substitute, then INSERT the rest", and
    // the inserts overshoot: the first of a group governs a span the later ones take back. A
    // consolidate replaces "substitute, then DELETE the rest", and the deletes do not overshoot,
    // because after the substitution the value each deletion exposes is already B's. Both
    // branches fire — the consolidate is reachable directly and, through `invertSteps`, from
    // every fragment — but on a step reading the slack lives almost entirely on one side.
    const next = lcg(24680);
    let fragments = 0;
    let consolidates = 0;
    let cheaper = 0;
    for (let trial = 0; trial < 200; ++trial) {
      const a = randomSequence(next, 1 + Math.floor(next() * 6));
      const b = randomSequence(next, 1 + Math.floor(next() * 6));
      const plain = editScript(a, b, pricing());
      const withMoves = editScript(a, b, pricing(), { moves: true });
      fragments += withMoves.opCounts.fragment;
      consolidates += withMoves.opCounts.consolidate;
      if (withMoves.scriptCost < plain.scriptCost * (1 - 1e-12)) cheaper += 1;
    }
    expect(cheaper).toBe(114);
    expect(fragments).toBe(120);
    expect(consolidates).toBe(1);
  });

  it('never costs more than the plain script, and keeps §6.2’s theorems', () => {
    const next = lcg(24680);
    let cheaper = 0;
    for (let trial = 0; trial < 40; ++trial) {
      const a = randomSequence(next, 1 + Math.floor(next() * 6));
      const b = randomSequence(next, 1 + Math.floor(next() * 6));
      const plain = editScript(a, b, pricing());
      const withMoves = editScript(a, b, pricing(), { moves: true });

      // A move replaces a sequence of plain ops with one state transition, so the `L¹` triangle
      // inequality bounds it by their sum: enabling moves moves the script TOWARD the lower
      // bound and can never push it away.
      expect(withMoves.scriptCost).toBeLessThanOrEqual(plain.scriptCost * (1 + 1e-12));
      expect(withMoves.scriptCost).toBeGreaterThanOrEqual(withMoves.directDistance / (1 + 1e-12));
      expect(withMoves.replayResidual).toBe(0);
      expect(withMoves.steps.reduce((total, step) => total + step.cost, 0)).toBeCloseTo(
        withMoves.replayedDelta,
        12,
      );
      if (withMoves.scriptCost < plain.scriptCost * (1 - 1e-12)) cheaper += 1;
    }
    // Non-vacuity: the moves really are chosen somewhere on this family.
    expect(cheaper).toBeGreaterThan(0);
  });

  it('keeps the plain op at a tie, so a move has to win strictly', () => {
    // Two shapes where the plain path is ALREADY geodesic and a move can only tie.
    //
    // Co-dated instructions: only the last performs, so substituting and then deleting the
    // shadowed one costs the substitution and nothing more.
    const codated = editScript(
      [level(0, 60, 'p'), level(0, 80, 'q')],
      [level(0, 100, 'x')],
      pricing(),
      { moves: true },
    );
    expect(codated.opCounts.consolidate).toBe(0);

    // A staircase collapsing onto one level: each plain op changes a DISJOINT interval, so the
    // four of them sum to the direct distance exactly and there is no slack to recover. This is
    // the case a first draft of this file expected a consolidate on, and measured, it ties.
    const staircase = [level(0, 60, 'p'), level(1, 70, 'q'), level(2, 80, 'r'), level(3, 90, 's')];
    const withMoves = editScript(staircase, [level(0, 75, 'x')], pricing(), { moves: true });
    const plain = editScript(staircase, [level(0, 75, 'x')], pricing());
    expect(withMoves.scriptCost).toBeCloseTo(plain.scriptCost, 12);
    expect(withMoves.scriptCost).toBeCloseTo(withMoves.directDistance, 12);
    expect(withMoves.opCounts.consolidate).toBe(0);
  });

  it('bounds a move at MAX_MOVE_SPAN and expresses the rest with plain ops', () => {
    // A long plateau, so the DP wants a consolidate longer than the bound allows.
    const a = [
      ...Array.from({ length: MAX_MOVE_SPAN + 2 }, (_unused, index) =>
        level(2 + index, 120, `a${String(index)}`),
      ),
      level(2 + MAX_MOVE_SPAN + 2, 60, 'tail'),
    ];
    const b = [level(2, 60, 'x')];
    const result = editScript(a, b, pricing(), { moves: true });
    for (const step of result.steps) {
      expect(step.aItems.length).toBeLessThanOrEqual(MAX_MOVE_SPAN);
      expect(step.bItems.length).toBeLessThanOrEqual(MAX_MOVE_SPAN);
    }
    // Every instruction is still consumed exactly once.
    const consumedA = result.steps.flatMap((step) => step.aItems.map((item) => item.id));
    expect([...consumedA].sort()).toEqual([...a.map((item) => item.id)].sort());
    expect(result.replayResidual).toBe(0);
  });

  it('is off by default, so the plain script is what a caller gets unasked', () => {
    const result = editScript(single, pair, pricing());
    expect(result.opCounts.consolidate).toBe(0);
    expect(result.opCounts.fragment).toBe(0);
    expect(result.scriptCost).toBeCloseTo(15 * L, 12);
  });
});

function strip(steps: readonly EditStep<Level>[]) {
  return steps.map((step) => ({
    move: step.move,
    a: step.a?.id ?? null,
    b: step.b?.id ?? null,
    indexA: step.indexA,
    indexB: step.indexB,
    cost: step.cost,
    free: step.free,
    applicationIndex: step.applicationIndex,
    costRank: step.costRank,
  }));
}

function sumOf(steps: readonly EditStep<Level>[]): number {
  return steps.reduce((total, step) => total + step.cost, 0);
}
