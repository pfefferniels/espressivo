/**
 * W4's products against the standing adversarial family (AD-33.5, AD-57.2).
 *
 * The policy is that every cut runs its products against the family rather than against
 * constants, and W4 opened two failure surfaces the metric suite cannot see because they are not
 * properties of `d_k`:
 *
 * - **Edit-path orientation.** §6.4's traceback precedence is deterministic but not
 *   transposition-covariant, so `diffMpm(a, b)` and `diffMpm(b, a)` are mirrors only because the
 *   script is computed once in a canonical order and inverted. A family member carrying `⊥`, a
 *   cap, a skip or an unbounded span is exactly where a tie is likely, which is where the
 *   inversion earns its keep.
 * - **Matrix determinism.** §8's products are permutation-equivariant only because every tie is
 *   broken on a label, and the family is TIE-RICH by construction: R6's never-drop rule makes
 *   `both-neutral` dimensions produce blocks of exactly-equal distances, which is the situation
 *   AD-25.2 says is structural here rather than measure-zero.
 */
import { describe, it, expect } from 'vitest';
import { compareMpmCorpus, diffMpm } from '../../src/api/comparison.js';
import { ADVERSARIAL_FAMILY, ADVERSARIAL_WINDOW, adversarialMembers } from './adversarialFamily.js';
import type { XmlText } from '../../src/api/types.js';
import type { DiffReport, EditOp } from '../../src/comparison/report.js';

const WINDOW = { start: ADVERSARIAL_WINDOW.start, end: ADVERSARIAL_WINDOW.end };

const diff = (a: string, b: string): DiffReport =>
  diffMpm({ a: a as XmlText, b: b as XmlText, window: WINDOW }).report;

/** A-Q5's pair inverts with the plain one: one-became-several read backwards is the reverse. */
const INVERSE: Readonly<Record<string, EditOp['op']>> = {
  insert: 'delete',
  delete: 'insert',
  substitute: 'substitute',
  fragment: 'consolidate',
  consolidate: 'fragment',
};

/** The mirror §6.4 promises, written out field by field — `diff.test.ts`'s own map. */
function mirrored(report: DiffReport): unknown {
  const rank: Readonly<Record<string, number>> = {
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
      const ranking = ordered.map((_op, index) => index);
      ranking.sort((x, y) => ordered[y].cost - ordered[x].cost || x - y);
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
    // Swap sides, then re-sort into §9.5's order. Both halves were latent until W4 MAJOR-5 gave
    // `DiffReport` its notes: this mirror left `site.document` unswapped and never re-sorted,
    // and an empty array agrees with anything. Re-derived from §9.5 rather than by calling the
    // engine's `sortNotes`, which is what keeps the mirror independent of what it checks.
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

describe('§6.4’s orientation, over the family’s hazards', () => {
  // Every member against the ORDINARY case and against the styled-level pair W4 added — the
  // first puts each hazard opposite a document with nothing wrong with it, the second puts it
  // opposite a difference that lives entirely in a header.
  const anchors = ADVERSARIAL_FAMILY.filter((member) =>
    ['plain', 'styled-level-slow'].includes(member.name),
  );

  it('mirrors every member against both anchors, field by field', () => {
    let scripted = 0;
    for (const anchor of anchors)
      for (const member of ADVERSARIAL_FAMILY) {
        if (member === anchor) continue;
        const forward = diff(anchor.mpm, member.mpm);
        const reverse = diff(member.mpm, anchor.mpm);
        expect(JSON.stringify(reverse), `${anchor.name} | ${member.name}`).toBe(
          JSON.stringify(mirrored(forward)),
        );
        scripted += forward.scripts.length;
      }
    // Non-vacuity: the pairs really do produce scripts, so the mirror has something to mirror.
    expect(scripted).toBeGreaterThan(40);
  });

  it('reaches B exactly on every one of them (§6.3)', () => {
    for (const member of ADVERSARIAL_FAMILY) {
      if (member.name === 'plain') continue;
      const report = diff(ADVERSARIAL_FAMILY[0].mpm, member.mpm);
      for (const row of Object.values(report.dimensions))
        expect(row.replayResidual, member.name).toBe(0);
    }
  });

  it('prices the styled-level pair, whose difference is invisible in the maps', () => {
    const slow = ADVERSARIAL_FAMILY.find((m) => m.name === 'styled-level-slow');
    const fast = ADVERSARIAL_FAMILY.find((m) => m.name === 'styled-level-fast');
    expect(slow).toBeDefined();
    expect(fast).toBeDefined();
    if (slow === undefined || fast === undefined) return;

    // The two `<tempoMap>` bodies are byte-identical; only the header differs.
    expect(slow.mpm.split('<dated>')[1]).toBe(fast.mpm.split('<dated>')[1]);

    const report = diff(slow.mpm, fast.mpm);
    // 4 quarters at |ln 2| over the tempo JND — the whole window, both instructions at date 0.
    expect(report.dimensions.tempo.dCurve).toBeCloseTo((4 * Math.LN2) / Math.log(1.025), 6);
    expect(report.dimensions.tempo.replayResidual).toBe(0);
  });
});

describe('§8’s determinism, over a tie-RICH corpus', () => {
  // Ten members, which is 45 pairs and a matrix with many exactly-equal cells: most of these
  // documents carry no map at all for most dimensions, so R6's never-drop rule makes whole
  // blocks identical. That is the situation index-keyed tie rules get wrong and label-keyed ones
  // do not, and it is why AD-25.2 calls the ties structural rather than measure-zero.
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
  const items = chosen.map((name) => {
    const member = ADVERSARIAL_FAMILY.find((entry) => entry.name === name);
    if (member === undefined) throw new Error(`no family member "${name}"`);
    return { mpm: member.mpm as XmlText, label: name };
  });

  const corpusOf = (list: typeof items) =>
    compareMpmCorpus({ items: list, window: WINDOW, k: 3, noiseFloor: true }).report;

  it('permutes the matrices and relabels the dendrogram, and changes nothing else', () => {
    const order = [7, 2, 9, 0, 4, 8, 1, 6, 3, 5];
    const straight = corpusOf(items);
    const shuffled = corpusOf(order.map((index) => items[index]));
    const n = straight.n;
    expect(n).toBe(10);

    for (let i = 0; i < n; ++i)
      for (let j = 0; j < n; ++j)
        expect({ i, j, d: shuffled.matrices.aggregate[i * n + j] }).toEqual({
          i,
          j,
          d: straight.matrices.aggregate[order[i] * n + order[j]],
        });

    const back = (id: number) => (id < n ? order[id] : id);
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
      for (let j = i + 1; j < n; ++j) offDiagonal.push(report.matrices.aggregate[i * n + j]);
    const distinct = new Set(offDiagonal).size;
    // 45 pairs and materially fewer distinct values: exact ties, not near-ties.
    expect(offDiagonal).toHaveLength(45);
    expect(distinct).toBeLessThan(45);
  });

  it('is byte-identical across runs', () => {
    expect(JSON.stringify(corpusOf(items))).toBe(JSON.stringify(corpusOf(items)));
  });
});

describe('AD-57.2’s drop-each-member hook', () => {
  it('removes exactly the member it names, and nothing otherwise', () => {
    // Asserted in BOTH modes rather than "the env is unset", because the sweep that uses the
    // hook runs this very suite with the env SET — a guard that demanded an empty env would
    // fail once per member and drown the signal the sweep exists to produce. (It did: the first
    // run of the sweep reported "1 failed" for all twenty-eight members, and the one failure was
    // this test.)
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
