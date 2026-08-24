/**
 * The event alignment DP, as a dimension-neutral module.
 *
 * The oracle is the objective, not a particular alignment: the load-bearing test enumerates
 * every monotone alignment of a small pair by brute force and checks that the DP found the
 * minimum. A test asserting "these two match" would pin one optimum out of several equal ones
 * and would pass on an implementation that minimizes the wrong functional.
 */
import { describe, it, expect } from 'vitest';
import {
  DEFAULT_LAMBDA_DATE,
  alignEvents,
  chargeAtoms,
  type AlignableEvent,
  type AlignmentCost,
} from '../../src/comparison/eventAlignment.js';
import { elementAt, pairwise } from '../../src/prelude/index.js';

interface Event extends AlignableEvent {
  readonly value: number;
}

const event = (dateTicks: number, value: number, id: string | null = null): Event => ({
  dateTicks,
  value,
  id,
});

const PPQ = 720;

const cost: AlignmentCost<Event> = {
  matched: (a, b) => Math.abs(a.value - b.value),
  unmatched: (x) => Math.abs(x.value),
  lambdaDate: DEFAULT_LAMBDA_DATE,
};

/** The reference optimizer: the minimum cost over every monotone alignment of two lists. */
function bruteForce(a: readonly Event[], b: readonly Event[], c: AlignmentCost<Event>): number {
  const best = (i: number, j: number): number => {
    if (i === a.length && j === b.length) return 0;
    const options: number[] = [];
    const left = a[i];
    const right = b[j];
    if (left !== undefined && right !== undefined) {
      const displacement = Math.abs(left.dateTicks - right.dateTicks) / PPQ;
      options.push(c.matched(left, right) + c.lambdaDate * displacement + best(i + 1, j + 1));
    }
    if (left !== undefined) options.push(c.unmatched(left) + best(i + 1, j));
    if (right !== undefined) options.push(c.unmatched(right) + best(i, j + 1));
    return Math.min(...options);
  };
  return best(0, 0);
}

describe('the alignment minimizes the functional', () => {
  const CASES: readonly (readonly [string, Event[], Event[]])[] = [
    ['equal lengths, equal dates', [event(0, 10), event(720, 20)], [event(0, 12), event(720, 18)]],
    [
      'one side longer — a drop is forced',
      [event(0, 10), event(360, 5), event(720, 20)],
      [event(0, 10), event(720, 20)],
    ],
    [
      'displaced pairs, where the date term decides',
      [event(0, 10), event(1440, 10)],
      [event(60, 10), event(1500, 10)],
    ],
    [
      'a cheap drop beats an expensive match',
      [event(0, 1), event(720, 100)],
      [event(0, 1), event(720, 1)],
    ],
    ['empty against non-empty', [], [event(0, 7), event(720, 3)]],
    ['both empty', [], []],
  ];

  it.each(CASES)('finds the brute-force optimum: %s', (_label, a, b) => {
    const alignment = alignEvents(a, b, cost, PPQ);
    expect(alignment.cost).toBeCloseTo(bruteForce(a, b, cost), 12);
  });

  it('accounts for every event exactly once', () => {
    const a = [event(0, 10), event(360, 5), event(720, 20)];
    const b = [event(0, 10), event(720, 20)];
    const alignment = alignEvents(a, b, cost, PPQ);
    expect(alignment.pairs.length + alignment.unmatchedA.length).toBe(a.length);
    expect(alignment.pairs.length + alignment.unmatchedB.length).toBe(b.length);
  });

  it('is monotone: matched indices increase on both sides', () => {
    const a = [event(0, 1), event(360, 2), event(720, 3), event(1080, 4)];
    const b = [event(0, 1), event(720, 3), event(1080, 9)];
    const { pairs } = alignEvents(a, b, cost, PPQ);
    for (const [previous, current] of pairwise(pairs)) {
      expect(current.a).toBeGreaterThan(previous.a);
      expect(current.b).toBeGreaterThan(previous.b);
    }
  });

  it('is 0 against itself, and the alignment is the identity', () => {
    const a = [event(0, 10), event(360, -5), event(720, 20)];
    const alignment = alignEvents(a, a, cost, PPQ);
    expect(alignment.cost).toBe(0);
    expect(alignment.pairs).toEqual([
      { a: 0, b: 0 },
      { a: 1, b: 1 },
      { a: 2, b: 2 },
    ]);
  });

  it('is symmetric in cost under swapping the two sides', () => {
    const a = [event(0, 10), event(360, 5), event(720, 20)];
    const b = [event(60, 12), event(720, 18)];
    expect(alignEvents(a, b, cost, PPQ).cost).toBe(alignEvents(b, a, cost, PPQ).cost);
  });
});

describe('the date term is INSIDE the minimand (the correction)', () => {
  it('charges a displaced match, so a half-bar displacement is not free', () => {
    // Identical values displaced by two quarters: at λ = 16 the match costs 32, and dropping
    // both costs |10| + |10| = 20.
    const displaced = alignEvents([event(0, 10)], [event(1440, 10)], cost, PPQ);
    expect(displaced.cost).toBeGreaterThan(0);
    expect(displaced.pairs).toHaveLength(0);
    expect(displaced.cost).toBe(20);
  });

  it('matches when the displacement is small enough to be worth it', () => {
    // A tenth of a quarter costs 1.6, which beats dropping both at 20.
    const close = alignEvents([event(0, 10)], [event(72, 10)], cost, PPQ);
    expect(close.pairs).toEqual([{ a: 0, b: 0 }]);
    expect(close.cost).toBeCloseTo(1.6, 12);
  });

  it('prices an exact-date match at the row cost alone, which is why no date pin is needed', () => {
    const exact = alignEvents([event(720, 10)], [event(720, 14)], cost, PPQ);
    expect(exact.cost).toBe(4);
  });
});

describe('opportunistic id-pinning', () => {
  it('forces a match between equal ids, even when the dates argue against it', () => {
    // Without the pin these would not match: two quarters apart at λ = 16 costs 32 against 20
    // for dropping both.
    const alignment = alignEvents([event(0, 10, 'x')], [event(1440, 10, 'x')], cost, PPQ);
    expect(alignment.pairs).toEqual([{ a: 0, b: 0 }]);
    expect(alignment.pinsHonoured).toBe(true);
    expect(alignment.cost).toBe(32);
  });

  it('leaves unequal ids free to match, because a rename is not a different event', () => {
    const alignment = alignEvents([event(0, 10, 'x')], [event(0, 10, 'y')], cost, PPQ);
    expect(alignment.pairs).toEqual([{ a: 0, b: 0 }]);
    expect(alignment.cost).toBe(0);
  });

  it('never drops a pinned event', () => {
    const alignment = alignEvents(
      [event(0, 1), event(720, 100, 'p')],
      [event(0, 1), event(720, 1, 'p')],
      cost,
      PPQ,
    );
    expect(alignment.pairs).toContainEqual({ a: 1, b: 1 });
    expect(alignment.unmatchedA).toHaveLength(0);
  });

  it('falls back to the unpinned optimum on a CROSSING pin set, and says so', () => {
    // The same two ids in opposite order: no monotone alignment honours both pins.
    const alignment = alignEvents(
      [event(0, 10, 'x'), event(720, 20, 'y')],
      [event(0, 20, 'y'), event(720, 10, 'x')],
      cost,
      PPQ,
    );
    expect(alignment.pinsHonoured).toBe(false);
    expect(Number.isFinite(alignment.cost)).toBe(true);
    expect(alignment.cost).toBe(
      bruteForce(
        [event(0, 10, 'x'), event(720, 20, 'y')],
        [event(0, 20, 'y'), event(720, 10, 'x')],
        cost,
      ),
    );
  });

  it('pins the first claimant when an id is duplicated, on both sides', () => {
    const alignment = alignEvents(
      [event(0, 10, 'x'), event(720, 10, 'x')],
      [event(0, 10, 'x')],
      cost,
      PPQ,
    );
    expect(alignment.pairs).toEqual([{ a: 0, b: 0 }]);
    expect(alignment.unmatchedA).toEqual([1]);
  });
});

describe('λ_date', () => {
  it('is one JND per 1/16 quarter, the displacement unit the registry states', () => {
    expect(DEFAULT_LAMBDA_DATE).toBe(16);
    const oneJnd = alignEvents(
      [event(0, 0)],
      [event(PPQ / 16, 0)],
      { ...cost, unmatched: () => 1000 },
      PPQ,
    );
    expect(oneJnd.cost).toBeCloseTo(1, 12);
  });

  it('is the caller’s to state, which is what makes the module dimension-neutral', () => {
    const cheap = alignEvents([event(0, 0)], [event(1440, 0)], { ...cost, lambdaDate: 0 }, PPQ);
    expect(cheap.cost).toBe(0);
  });
});

/**
 * the extension: the optimum comes apart per event, and the parts land on the timeline.
 *
 * The oracle is the scalar the DP minimized, not hand-computed charges: the property that
 * matters is that nothing is lost or invented between the optimum and the table.
 */
describe('the optimum decomposes into charges', () => {
  const a = [event(0, 10), event(360, 5), event(1440, 20)];
  const b = [event(0, 12), event(1080, 18)];

  it('sums to the minimized objective', () => {
    const alignment = alignEvents(a, b, cost, PPQ);
    const total = alignment.charges.reduce((sum, charge) => sum + charge.cost, 0);
    expect(total).toBeCloseTo(alignment.cost, 12);
  });

  it('accounts for every event exactly once', () => {
    const alignment = alignEvents(a, b, cost, PPQ);
    expect(alignment.charges.map((charge) => charge.a).filter((index) => index !== null)).toEqual([
      0, 1, 2,
    ]);
    expect(alignment.charges.map((charge) => charge.b).filter((index) => index !== null)).toEqual([
      0, 1,
    ]);
  });

  it('is in date order, so the table reads left to right along the timeline', () => {
    const alignment = alignEvents(a, b, cost, PPQ);
    const dates = chargeAtoms(a, b, alignment, () => true, {
      startTicks: 0,
      endTicks: 2880,
    }).map((atom) => atom.startTicks);
    expect([...dates]).toEqual([...dates].sort((x, y) => x - y));
  });
});

describe('the placement rule', () => {
  const WINDOW = { startTicks: 0, endTicks: 2880 };

  it('spreads a matched pair uniformly over the interval between its two dates', () => {
    const a = [event(0, 10)];
    const b = [event(720, 10)];
    const atom = elementAt(
      chargeAtoms(a, b, alignEvents(a, b, cost, PPQ), () => true, WINDOW),
      0,
      'the charge atoms',
    );
    expect(atom.startTicks).toBe(0);
    expect(atom.endTicks).toBe(720);
    // The whole charge here is the date term: the values agree, so nothing else is priced.
    expect(atom.mass).toBeCloseTo(DEFAULT_LAMBDA_DATE * 1, 12);
  });

  it('makes a co-dated pair a point mass, which is the coincident case of the same rule', () => {
    const a = [event(720, 10)];
    const b = [event(720, 14)];
    const atom = elementAt(
      chargeAtoms(a, b, alignEvents(a, b, cost, PPQ), () => true, WINDOW),
      0,
      'the charge atoms',
    );
    expect(atom.startTicks).toBe(720);
    expect(atom.endTicks).toBe(720);
    expect(atom.mass).toBeCloseTo(4, 12);
  });

  it('charges an unmatched event at its own date', () => {
    const a = [event(1440, 30)];
    const alignment = alignEvents(a, [], cost, PPQ);
    const atom = elementAt(
      chargeAtoms(a, [] as Event[], alignment, () => true, WINDOW),
      0,
      'the charge atoms',
    );
    expect(atom.kind).toBe('unmatched-a');
    expect([atom.startTicks, atom.endTicks]).toEqual([1440, 1440]);
    expect(atom.mass).toBe(30);
  });

  it('is symmetric: swapping the documents mirrors the placement and keeps the mass', () => {
    const a = [event(0, 10), event(1440, 30)];
    const b = [event(720, 10)];
    const forward = chargeAtoms(a, b, alignEvents(a, b, cost, PPQ), () => true, WINDOW);
    const reverse = chargeAtoms(b, a, alignEvents(b, a, cost, PPQ), () => true, WINDOW);
    expect(reverse.map((atom) => [atom.startTicks, atom.endTicks, atom.mass])).toEqual(
      forward.map((atom) => [atom.startTicks, atom.endTicks, atom.mass]),
    );
  });

  /**
   * The id-anchored case. Pinning the mass to the written `@date` would assert
   * a position the design says is unknown; dropping it would forgive a difference the renderer
   * performs. Spreading it uniformly adds no information either way.
   */
  it('spreads an anchor of unknown position over the whole window, and says so', () => {
    const a = [event(360, 10, 'n1')];
    const b = [event(360, 30, 'n1')];
    const atom = elementAt(
      chargeAtoms(a, b, alignEvents(a, b, cost, PPQ), () => false, WINDOW),
      0,
      'the charge atoms',
    );
    expect(atom.datePositionKnown).toBe(false);
    expect([atom.startTicks, atom.endTicks]).toEqual([WINDOW.startTicks, WINDOW.endTicks]);
    expect(atom.mass).toBe(20);
  });

  it('keeps a known-position anchor placed even when its partner is unknown-position', () => {
    const a = [event(360, 10, 'n1'), event(720, 4)];
    const alignment = alignEvents(a, [] as Event[], cost, PPQ);
    const atoms = chargeAtoms(
      a,
      [] as Event[],
      alignment,
      (candidate) => candidate.id === null,
      WINDOW,
    );
    expect(atoms.map((atom) => atom.datePositionKnown)).toEqual([false, true]);
    expect(elementAt(atoms, 1, 'the charge atoms').startTicks).toBe(720);
  });
});
