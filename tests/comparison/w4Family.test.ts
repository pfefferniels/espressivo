/**
 * The edit path and the corpus matrices against the standing adversarial family (AD-33.5,
 * AD-57.2) — two failure surfaces the metric suite cannot see, because neither is a property
 * of `d_k`:
 *
 * - Edit-path orientation. §6.4's traceback precedence is deterministic but not
 *   transposition-covariant, so `diffMpm(a, b)` and `diffMpm(b, a)` are mirrors only because the
 *   script is computed once in a canonical order and inverted. A family member carrying `⊥`, a
 *   cap, a skip or an unbounded span is where a tie is likely, and so where the inversion earns
 *   its keep.
 * - Matrix determinism. §8's products are permutation-equivariant only because every tie is
 *   broken on a label, and the family is TIE-RICH by construction: R6's never-drop rule makes
 *   `both-neutral` dimensions produce blocks of exactly-equal distances, which AD-25.2 calls
 *   structural here rather than measure-zero.
 */
import { describe, it, expect } from 'vitest';
import { compareMpmCorpus, diffMpm } from '../../src/api/comparison.js';
import {
  ADVERSARIAL_FAMILY,
  ADVERSARIAL_WINDOW,
  adversarialMembers,
  type AdversarialMember,
} from './adversarialFamily.js';
import { pam, type DistanceMatrix } from '../../src/comparison/clustering.js';
import type { XmlText } from '../../src/api/types.js';
import type { DiffReport, EditOp } from '../../src/comparison/report.js';

import { elementAt, numberAt } from '../../src/prelude/index.js';

/** `matrix[i * n + j]`, checked — §8's matrices are flat `n × n` arrays. */
const cellOf = (matrix: readonly number[], n: number, i: number, j: number, what: string) =>
  numberAt(matrix, i * n + j, what);

/** `xs` reordered by `order` — a permuted corpus, or a label list read back through one. */
const pick = <T extends NonNullable<unknown>>(
  xs: readonly T[],
  order: readonly number[],
): readonly T[] => order.map((index) => elementAt(xs, index, 'the corpus item list'));

const WINDOW = { start: ADVERSARIAL_WINDOW.start, end: ADVERSARIAL_WINDOW.end };

const diff = (a: string, b: string): DiffReport =>
  diffMpm({ a: a as XmlText, b: b as XmlText, window: WINDOW }).report;

/** A-Q5's pair inverts with the plain one: one-became-several read backwards is the reverse. */
const INVERSE: Readonly<Record<EditOp['op'], EditOp['op']>> = {
  insert: 'delete',
  delete: 'insert',
  substitute: 'substitute',
  fragment: 'consolidate',
  consolidate: 'fragment',
};

/** The mirror §6.4 promises, written out field by field — `diff.test.ts`'s own map. */
function mirrored(report: DiffReport): unknown {
  const rank: Readonly<Record<EditOp['op'], number>> = {
    substitute: 0,
    delete: 1,
    insert: 2,
    fragment: 3,
    consolidate: 4,
  };
  const swap = (op: EditOp) => ({
    ...op,
    op: INVERSE[op.op],
    site: { ...op.site, document: op.site.document === 'a' ? 'b' : 'a' },
    dateA: op.dateB,
    dateB: op.dateA,
    measureA: op.measureB,
    measureB: op.measureA,
    attributes: op.attributes.map((entry) => ({
      ...entry,
      valueA: entry.valueB,
      valueB: entry.valueA,
    })),
    count: { a: op.count.b, b: op.count.a },
  });

  return {
    ...report,
    ppq: {
      ...report.ppq,
      a: report.ppq.b,
      b: report.ppq.a,
      unusableDeclaration: {
        a: report.ppq.unusableDeclaration.b,
        b: report.ppq.unusableDeclaration.a,
      },
    },
    parts: report.parts.map((pairing) => ({
      numberA: pairing.numberB,
      numberB: pairing.numberA,
      nameA: pairing.nameB,
      nameB: pairing.nameA,
      matched: pairing.matched,
    })),
    scripts: report.scripts.map((script) => {
      const ordered = script.ops
        .map(swap)
        .sort(
          (x, y) =>
            (x.dateA ?? x.dateB ?? 0) - (y.dateA ?? y.dateB ?? 0) ||
            rank[x.op] - rank[y.op] ||
            x.applicationIndex - y.applicationIndex,
        );
      const costOfOrdered = (index: number) =>
        elementAt(ordered, index, 'the date-ordered ops').cost;
      const ranking = ordered.map((_op, index) => index);
      ranking.sort((x, y) => costOfOrdered(y) - costOfOrdered(x) || x - y);
      const costRankOf = new Array<number>(ordered.length);
      for (const [position, index] of ranking.entries()) costRankOf[index] = position;
      return {
        ...script,
        ops: ordered.map((op, index) => ({
          ...op,
          applicationIndex: index,
          costRank: costRankOf[index],
        })),
        topByCost: ranking,
        opCounts: {
          ...script.opCounts,
          insert: script.opCounts.delete,
          delete: script.opCounts.insert,
          fragment: script.opCounts.consolidate,
          consolidate: script.opCounts.fragment,
        },
      };
    }),
    // Swap sides, then re-sort into §9.5's order — both halves matter, and an empty note array
    // would agree with anything. Re-derived from §9.5 rather than by calling the engine's
    // `sortNotes`, which is what keeps the mirror independent of what it checks.
    notes: [
      ...report.notes.map((entry) => ({
        ...entry,
        document: entry.document === 'a' ? 'b' : entry.document === 'b' ? 'a' : null,
        site:
          entry.site === null
            ? null
            : { ...entry.site, document: entry.site.document === 'a' ? 'b' : 'a' },
      })),
    ].sort((x, y) => {
      const text = (left: string, right: string) => (left < right ? -1 : left > right ? 1 : 0);
      return (
        text(x.kind, y.kind) ||
        text(x.dimension ?? '', y.dimension ?? '') ||
        (x.startQuarters ?? 0) - (y.startQuarters ?? 0) ||
        text(x.document ?? '', y.document ?? '') ||
        text(x.message, y.message) ||
        text(JSON.stringify(x), JSON.stringify(y))
      );
    }),
  };
}

/**
 * This file binds `adversarialMembers()`, never the raw `ADVERSARIAL_FAMILY`.
 *
 * AD-57.2's drop-each-member hook answers "which member CATCHES a given defect", and it can only
 * answer it for tests that honour the drop: bind the constant instead and a sweep over
 * `COMPARISON_DROP_MEMBER` runs IDENTICAL assertions for every value, so a test whose whole
 * subject was dropped still passes. A test that needs a member BY NAME guards itself with
 * `it.skipIf(dropped(...))`; any absence other than the sweep's own still fails.
 */
const FAMILY = adversarialMembers();

/** The member the sweep removed, if any — the ONLY licensed reason for one to be missing. */
const DROPPED = process.env.COMPARISON_DROP_MEMBER ?? '';

/** True when the sweep removed one of the members a test cannot run without. */
const dropped = (...names: readonly string[]): boolean => names.includes(DROPPED);

/**
 * A member a test names outright. Missing is a FAILURE here, never a shrug: the caller's
 * `skipIf` has already handled the one licensed absence.
 */
function requireMember(name: string): AdversarialMember {
  const found = FAMILY.find((member) => member.name === name);
  if (found === undefined) throw new Error(`no family member "${name}" (dropped: "${DROPPED}")`);
  return found;
}

describe('§6.4’s orientation, over the family’s hazards', () => {
  // Every member against the ORDINARY case and against the styled-level pair: the first puts
  // each hazard opposite a document with nothing wrong with it, the second opposite a difference
  // that lives entirely in a header.
  const anchors = FAMILY.filter((member) => ['plain', 'styled-level-slow'].includes(member.name));

  it('mirrors every member against both anchors, field by field', () => {
    let scripted = 0;
    let pairs = 0;
    for (const anchor of anchors)
      for (const member of FAMILY) {
        if (member === anchor) continue;
        const forward = diff(anchor.mpm, member.mpm);
        const reverse = diff(member.mpm, anchor.mpm);
        expect(JSON.stringify(reverse), `${anchor.name} | ${member.name}`).toBe(
          JSON.stringify(mirrored(forward)),
        );
        scripted += forward.scripts.length;
        pairs += 1;
      }
    // Non-vacuity: the pairs really do produce scripts. Stated PER PAIR rather than as a total,
    // so a dropped member shrinks the sweep's coverage without lowering its threshold.
    expect(pairs).toBe(anchors.length * (FAMILY.length - 1));
    expect(scripted).toBeGreaterThan(pairs);
  });

  it.skipIf(dropped('plain'))('reaches B exactly on every one of them (§6.3)', () => {
    const anchor = requireMember('plain');
    for (const member of FAMILY) {
      if (member.name === 'plain') continue;
      const report = diff(anchor.mpm, member.mpm);
      for (const row of Object.values(report.dimensions))
        expect(row.replayResidual, member.name).toBe(0);
    }
  });

  it.skipIf(dropped('styled-level-slow', 'styled-level-fast'))(
    'prices the styled-level pair, whose difference is invisible in the maps',
    () => {
      const slow = requireMember('styled-level-slow');
      const fast = requireMember('styled-level-fast');

      // The two `<tempoMap>` bodies are byte-identical; only the header differs.
      expect(slow.mpm.split('<dated>')[1]).toBe(fast.mpm.split('<dated>')[1]);

      const report = diff(slow.mpm, fast.mpm);
      // 4 quarters at |ln 2| over the tempo JND — the whole window, both instructions at date 0.
      expect(report.dimensions.tempo.dCurve).toBeCloseTo((4 * Math.LN2) / Math.log(1.025), 6);
      expect(report.dimensions.tempo.replayResidual).toBe(0);
    },
  );
});

describe('§8’s determinism, over a tie-RICH corpus', () => {
  // Ten members, 45 pairs, and a matrix with many exactly-equal cells: most of these documents
  // carry no map at all for most dimensions, so R6's never-drop rule makes whole blocks
  // identical. That is the situation index-keyed tie rules get wrong and label-keyed ones do not.
  const chosen = [
    'plain',
    'renderer-default-level',
    'bottom-span',
    'capped',
    'skips',
    'rubato-plain',
    'articulation-anchors',
    'imprecision-plain',
    'styled-level-slow',
    'styled-level-fast',
  ];
  // Built from the HOOK's list, so a dropped member shrinks the corpus instead of throwing; any
  // absence other than the sweep's own is still a failure.
  const items = chosen
    .filter((name) => {
      const present = FAMILY.some((member) => member.name === name);
      if (!present) expect({ name, reason: DROPPED }).toEqual({ name, reason: name });
      return present;
    })
    .map((name) => ({ mpm: requireMember(name).mpm as XmlText, label: name }));

  const corpusOf = (list: readonly (typeof items)[number][]) =>
    compareMpmCorpus({ items: list, window: WINDOW, k: 3, noiseFloor: true }).report;

  /**
   * A permutation DERIVED from the corpus size, so a dropped member shrinks the corpus rather
   * than indexing off the end of a hard-coded order. The stride is coprime with every length
   * this corpus can take, so it is a genuine derangement at 9 items and at 10.
   */
  const order = items.map((_unused, index) => (index * 7 + 3) % items.length);

  it('permutes the matrices and relabels the dendrogram, and changes nothing else', () => {
    // Non-vacuity for the permutation itself: a stride that happened to be the identity would
    // make every assertion below trivially true.
    expect(new Set(order).size).toBe(items.length);
    expect(order).not.toEqual(items.map((_unused, index) => index));

    const straight = corpusOf(items);
    const shuffled = corpusOf(pick(items, order));
    const n = straight.n;
    expect(n).toBe(items.length);

    for (let i = 0; i < n; ++i)
      for (let j = 0; j < n; ++j)
        expect({
          i,
          j,
          d: cellOf(shuffled.matrices.aggregate, n, i, j, 'the permuted aggregate matrix'),
        }).toEqual({
          i,
          j,
          d: cellOf(
            straight.matrices.aggregate,
            n,
            elementAt(order, i, 'the permutation'),
            elementAt(order, j, 'the permutation'),
            'the aggregate matrix',
          ),
        });

    const back = (id: number) => (id < n ? elementAt(order, id, 'the permutation') : id);
    expect(
      shuffled.dendrogram.merges.map((merge) => ({
        ...merge,
        left: back(merge.left),
        right: back(merge.right),
      })),
    ).toEqual([...straight.dendrogram.merges]);
    expect(shuffled.dendrogram.order.map(back)).toEqual([...straight.dendrogram.order]);
    expect(shuffled.seriationOrder.map(back)).toEqual([...straight.seriationOrder]);
    expect(shuffled.medoids?.map(back).sort((x, y) => x - y)).toEqual(
      [...(straight.medoids ?? [])].sort((x, y) => x - y),
    );
  });

  it('really is tie-rich, so the equivariance above is not free', () => {
    const report = corpusOf(items);
    const n = report.n;
    const offDiagonal: number[] = [];
    for (let i = 0; i < n; ++i)
      for (let j = i + 1; j < n; ++j)
        offDiagonal.push(cellOf(report.matrices.aggregate, n, i, j, 'the aggregate matrix'));
    const distinct = new Set(offDiagonal).size;
    // `C(n, 2)` pairs and materially fewer distinct values: exact ties, not near-ties. Stated
    // from `n` rather than as the literal 45, so a dropped member does not fail the claim for a
    // reason that has nothing to do with tie-richness.
    expect(offDiagonal).toHaveLength((n * (n - 1)) / 2);
    expect(distinct).toBeLessThan(offDiagonal.length);
  });

  it('is byte-identical across runs', () => {
    expect(JSON.stringify(corpusOf(items))).toBe(JSON.stringify(corpusOf(items)));
  });

  /**
   * The medoid under permutation, on REAL distances — where `exhaustiveMedoids`' tie key alone
   * is not enough, because the tie has to SURVIVE to be broken. `partitionCost` sums each item's
   * distance in the caller's item order and floating-point addition is not associative, so a
   * permuted corpus can turn an exact tie into a 1-ulp difference that `cost < bestCost` settles
   * before the label rule is ever consulted.
   *
   * [MEASURED] on the nine-item corpus (this list without `plain`) at `k = 3`, where FIVE
   * subsets attain the optimum `177.477686776`: summed in index order the winner
   * `{bottom-span, capped, renderer-default-level}` and the runner-up
   * `{bottom-span, renderer-default-level, skips}` are bit-equal under one item order
   * (`177.47768677583286490` both) and differ by `2.842e-14` under another — so the corpus names
   * a different set of typical performances for no reason a reader could see.
   *
   * The matrix is taken from the pipeline ONCE and permuted directly, so the sweep is over `pam`
   * rather than over the whole corpus build. Integer-valued fixtures cannot catch this — their
   * sums are exact in any order, which is why `corpusMath.test.ts`'s two-block witness passes
   * either way.
   */
  it('names the same medoids under every permutation of REAL, inexact distances', () => {
    const nine = items.filter((item) => item.label !== 'plain');
    const report = compareMpmCorpus({
      items: nine,
      window: WINDOW,
      k: 3,
    }).report;
    const labels = [...report.labels];
    const matrix: DistanceMatrix = { n: report.n, values: [...report.matrices.aggregate] };
    expect(matrix.n).toBe(nine.length);

    const permute = (source: DistanceMatrix, into: readonly number[]): DistanceMatrix => ({
      n: source.n,
      values: Array.from({ length: source.n * source.n }, (_unused, index) =>
        cellOf(
          source.values,
          source.n,
          elementAt(into, Math.floor(index / source.n), 'the permutation'),
          elementAt(into, index % source.n, 'the permutation'),
          'the corpus distance matrix',
        ),
      ),
    });

    const answers = new Set<string>();
    // Every cyclic rotation plus every stride — enough distinct orders to reach the hazard
    // without enumerating 9!.
    for (let shift = 0; shift < matrix.n; ++shift)
      for (const stride of [1, 2, 4, 5, 7]) {
        const into = Array.from(
          { length: matrix.n },
          (_unused, index) => (index * stride + shift) % matrix.n,
        );
        if (new Set(into).size !== matrix.n) continue;
        const permutedLabels = pick(labels, into);
        const result = pam(permute(matrix, into), 3, permutedLabels);
        expect(result?.exhaustive).toBe(true);
        answers.add(
          result!.medoids
            .map((item) => permutedLabels[item])
            .sort()
            .join(','),
        );
      }

    expect([...answers]).toEqual(['bottom-span,capped,renderer-default-level']);
  });

  it('is non-vacuous: that corpus really does have several cost-equal optima', () => {
    // Without competing optima the test above asserts nothing about any tie rule, and the whole
    // mechanism — cost tie, then label key — is never exercised.
    const nine = items.filter((item) => item.label !== 'plain');
    const report = compareMpmCorpus({ items: nine, window: WINDOW, k: 3 }).report;
    const n = report.n;
    const costOf = (subset: readonly number[]) => {
      let total = 0;
      for (let i = 0; i < n; ++i)
        total += Math.min(
          ...subset.map((medoid) =>
            cellOf(report.matrices.aggregate, n, i, medoid, 'the aggregate matrix'),
          ),
        );
      return total;
    };
    let best = Number.POSITIVE_INFINITY;
    let attained = 0;
    for (let a = 0; a < n; ++a)
      for (let b = a + 1; b < n; ++b)
        for (let c = b + 1; c < n; ++c) {
          const total = costOf([a, b, c]);
          if (total < best - 1e-12) {
            best = total;
            attained = 0;
          }
          if (Math.abs(total - best) < 1e-12) attained += 1;
        }
    expect(attained).toBeGreaterThan(1);
  });
});

describe('AD-57.2’s drop-each-member hook', () => {
  it('removes exactly the member it names, and nothing otherwise', () => {
    // Asserted in BOTH modes rather than "the env is unset", because the sweep that uses the
    // hook runs this very suite with the env SET: a guard demanding an empty env would fail once
    // per member and drown the signal the sweep exists to produce.
    const dropped = process.env.COMPARISON_DROP_MEMBER ?? '';
    const members = adversarialMembers();
    if (dropped === '') {
      expect(members).toHaveLength(ADVERSARIAL_FAMILY.length);
      return;
    }
    expect(members).toHaveLength(ADVERSARIAL_FAMILY.length - 1);
    expect(members.some((member) => member.name === dropped)).toBe(false);
  });
});
