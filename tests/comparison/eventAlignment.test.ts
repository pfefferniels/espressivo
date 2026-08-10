/**
 * The event alignment DP — §5.6 as a dimension-neutral module (AD-37.6).
 *
 * The tests are on the OBJECTIVE, not on a particular alignment: an optimizer is right when no
 * other alignment scores lower, so the load-bearing test enumerates every monotone alignment of
 * a small pair by brute force and checks that the DP found the minimum. A test that asserted
 * "these two match" would pin one optimum out of several equal ones and would pass on an
 * implementation that minimizes the wrong functional.
 */
import { describe, it, expect } from 'vitest';
import {
  DEFAULT_LAMBDA_DATE,
  alignEvents,
  type AlignableEvent,
  type AlignmentCost,
} from '../../src/comparison/eventAlignment.js';

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

/** Every monotone alignment of two lists, as (pairs, cost) — the reference optimizer. */
function bruteForce(a: readonly Event[], b: readonly Event[], c: AlignmentCost<Event>): number {
  const best = (i: number, j: number): number => {
    if (i === a.length && j === b.length) return 0;
    const options: number[] = [];
    if (i < a.length && j < b.length) {
      const displacement = Math.abs(a[i].dateTicks - b[j].dateTicks) / PPQ;
      options.push(c.matched(a[i], b[j]) + c.lambdaDate * displacement + best(i + 1, j + 1));
    }
    if (i < a.length) options.push(c.unmatched(a[i]) + best(i + 1, j));
    if (j < b.length) options.push(c.unmatched(b[j]) + best(i, j + 1));
    return Math.min(...options);
  };
  return best(0, 0);
}

describe('the alignment minimizes §5.6’s functional', () => {
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
    for (let k = 1; k < pairs.length; ++k) {
      expect(pairs[k].a).toBeGreaterThan(pairs[k - 1].a);
      expect(pairs[k].b).toBeGreaterThan(pairs[k - 1].b);
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

describe('the date term is INSIDE the minimand (M5’s correction)', () => {
  it('charges a displaced match, so a half-bar displacement is not free', () => {
    // Identical values, displaced by two quarters: the match is not free, and with λ = 16 it
    // costs 32 — which is more than dropping both (0 + 0 would be free only if the values were
    // neutral, and here they are 10 apart from neutral).
    const displaced = alignEvents([event(0, 10)], [event(1440, 10)], cost, PPQ);
    expect(displaced.cost).toBeGreaterThan(0);
    // Dropping both costs |10| + |10| = 20, which beats matching at 32.
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

describe('opportunistic id-pinning (AD-7)', () => {
  it('forces a match between equal ids, even when the dates argue against it', () => {
    // Without the pin these would not match: two quarters apart at λ = 16 costs 32 against 20
    // for dropping both. The identity match overrides that.
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
  it('is one JND per 1/16 quarter, the displacement unit §7.1 already states', () => {
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
