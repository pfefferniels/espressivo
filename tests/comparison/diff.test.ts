/**
 * `diffMpm` — §6's edit path at the facade, and §6.4's orientation rule.
 *
 * The load-bearing test is P-C2's, and it is asserted on `JSON.stringify` rather than on the
 * numbers: comparing totals would miss an asymmetric op order, an unswapped site, or a value
 * pair that stayed put. The swap map is written out as CODE, so a future field that needs
 * mirroring fails the test rather than quietly breaking the promise — the discipline
 * `properties.test.ts` established for `compareMpm`.
 *
 * The orientation rule is what makes that mirror possible at all: the traceback precedence is
 * deterministic but not transposition-covariant (§6.4), so the script is computed ONCE in a
 * content-derived canonical order and inverted. A test that only checked "both directions have
 * the same total" would pass on an implementation that ran the DP twice and got two different
 * scripts, which is the thing §6.4 exists to prevent.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { compareMpm, diffMpm, neutralMpm } from '../../src/api/comparison.js';
import { InvalidOptionError, ParseError, PerformanceNotFoundError } from '../../src/api/errors.js';
import { COMPARISON_DIMENSIONS } from '../../src/comparison/registry.js';
import type { XmlText } from '../../src/api/types.js';
import type { DiffReport, EditOp } from '../../src/comparison/report.js';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');
const fixture = (name: string) => readFileSync(join(FIXTURES, `${name}.mpm`), 'utf-8') as XmlText;
const TELEMANN = fixture('telemann-grave');
const VULPIUS = fixture('vulpius-die-helle-sonn');
const ALBERT = fixture('albert-du-mein-einzig-licht');

// ---------------------------------------------------------------------------
// The mirror
// ---------------------------------------------------------------------------

/**
 * `report`, transformed as §6.4 says the other direction must look — swap, invert, negate.
 *
 * Written out field by field ON PURPOSE. A generic "swap everything named a with everything
 * named b" would mirror a field this design never intended to mirror and would keep passing
 * when one was added.
 */
function mirrorOf(report: DiffReport): unknown {
  const swapOp = (op: EditOp) => ({
    ...op,
    op: op.op === 'insert' ? 'delete' : op.op === 'delete' ? 'insert' : op.op,
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
      // The delivered order is `dateA ?? dateB`, and the mirror reads that key off the OTHER
      // side, so the array is re-sorted rather than reversed — which is the whole reason the
      // engine recomputes it instead of flipping the array.
      const swapped = script.ops.map(swapOp);
      const ordered = [...swapped].sort(
        (x, y) =>
          (x.dateA ?? x.dateB ?? 0) - (y.dateA ?? y.dateB ?? 0) ||
          MOVE_RANK[x.op] - MOVE_RANK[y.op] ||
          x.applicationIndex - y.applicationIndex,
      );
      const ranking = ordered.map((_op, index) => index);
      ranking.sort((x, y) => ordered[y].cost - ordered[x].cost || x - y);
      const costRankOf = new Array<number>(ordered.length);
      for (const [rank, index] of ranking.entries()) costRankOf[index] = rank;
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
        },
      };
    }),
    notes: report.notes.map((entry) => ({
      ...entry,
      document: entry.document === 'a' ? 'b' : entry.document === 'b' ? 'a' : null,
      site: entry.site === null ? null : { ...entry.site, document: entry.site.document },
    })),
  };
}

const MOVE_RANK: Readonly<Record<string, number>> = {
  substitute: 0,
  delete: 1,
  insert: 2,
  fragment: 3,
  consolidate: 4,
};

// ---------------------------------------------------------------------------

/**
 * A short window on the vendored documents.
 *
 * P-C2 is a claim about SYMMETRY, not about magnitudes: the mirror has to hold field by field,
 * and every field it touches is present within the first few bars. Sixteen quarters keeps the
 * per-transition integrals small enough that the test walks four pairs in both directions
 * instead of one, which is the coverage that matters here. One pair runs over its FULL window
 * as well, so a narrow window cannot be hiding a field that only appears later.
 */
const SHORT = { start: 0, end: 16 } as const;

describe('P-C2: diffMpm(a, b) and diffMpm(b, a) are exact mirrors (§6.4)', () => {
  const pairs: readonly (readonly [XmlText, string | number, string | number])[] = [
    [TELEMANN, 0, 1],
    [TELEMANN, 1, 2],
    [VULPIUS, 0, 1],
    [ALBERT, 0, 1],
  ];

  it('mirrors the whole serialized report', () => {
    for (const [document, a, b] of pairs) {
      const forward = diffMpm({ a: document, performanceA: a, performanceB: b, window: SHORT });
      const reverse = diffMpm({ a: document, performanceA: b, performanceB: a, window: SHORT });
      expect(JSON.stringify(reverse.report)).toBe(JSON.stringify(mirrorOf(forward.report)));
    }
  });

  it('mirrors over a full window too, so the short one is not hiding a field', () => {
    const forward = diffMpm({ a: ALBERT, performanceA: 0, performanceB: 1 });
    const reverse = diffMpm({ a: ALBERT, performanceA: 1, performanceB: 0 });
    expect(JSON.stringify(reverse.report)).toBe(JSON.stringify(mirrorOf(forward.report)));
  });

  it('is non-vacuous: the UN-mirrored reverse really does differ', () => {
    const forward = diffMpm({ a: TELEMANN, performanceA: 0, performanceB: 1, window: SHORT });
    const reverse = diffMpm({ a: TELEMANN, performanceA: 1, performanceB: 0, window: SHORT });
    expect(JSON.stringify(reverse.report)).not.toBe(JSON.stringify(forward.report));
  });
});

describe('the report agrees with the comparison it is a path through', () => {
  it('reports dCurve equal to compareMpm’s own d_k, dimension by dimension', () => {
    for (const [document, a, b] of [
      [TELEMANN, 0, 1],
      [VULPIUS, 0, 1],
      [ALBERT, 0, 1],
    ] as const) {
      const diff = diffMpm({ a: document, performanceA: a, performanceB: b, window: SHORT }).report;
      const comparison = compareMpm({
        a: document,
        performanceA: a,
        performanceB: b,
        window: SHORT,
      }).report;
      for (const dimension of COMPARISON_DIMENSIONS) {
        const dCurve = diff.dimensions[dimension].dCurve;
        if (dCurve === null) continue;
        expect({ dimension, d: dCurve }).toEqual({
          dimension,
          d: comparison.dimensions[dimension].distance,
        });
      }
      // The two entry points see the same documents, so their provenance blocks agree.
      expect(diff.window).toEqual(comparison.window);
      expect(diff.ppq).toEqual(comparison.ppq);
      expect(diff.parts).toEqual(comparison.parts);
      expect(diff.scopes).toEqual(comparison.scopes);
    }
  });

  it('holds §6.2’s theorems and §6.3’s verification at the document level', () => {
    const report = diffMpm({
      a: TELEMANN,
      performanceA: 0,
      performanceB: 1,
      msm: undefined,
    }).report;
    for (const dimension of COMPARISON_DIMENSIONS) {
      const row = report.dimensions[dimension];
      expect(row.replayResidual).toBe(0);
      if (row.dCurve === null) continue;
      expect(row.scriptCost).toBeGreaterThanOrEqual(row.dCurve / (1 + 1e-4));
      expect(row.reworking).toBeGreaterThanOrEqual(-row.dCurve * 1e-4);
    }
  });

  it('closes: each script’s ops sum to its share of the dimension’s replayedDelta', () => {
    const report = diffMpm({ a: VULPIUS, performanceA: 0, performanceB: 1, window: SHORT }).report;
    const summed = new Map<string, number>();
    for (const script of report.scripts)
      summed.set(
        script.dimension,
        (summed.get(script.dimension) ?? 0) + script.ops.reduce((total, op) => total + op.cost, 0),
      );
    for (const [dimension, total] of summed)
      expect(total).toBeCloseTo(
        report.dimensions[dimension as keyof DiffReport['dimensions']].replayedDelta,
        6,
      );
  });
});

describe('the ops carry what §9.3 says they carry', () => {
  const report = diffMpm({ a: VULPIUS, performanceA: 0, performanceB: 1, window: SHORT }).report;

  it('delivers in date order with both orders and a site on every op', () => {
    expect(report.scripts.length).toBeGreaterThan(0);
    for (const script of report.scripts) {
      const dates = script.ops.map((op) => op.dateA ?? op.dateB ?? 0);
      expect([...dates].sort((x, y) => x - y)).toEqual(dates);
      expect(script.ops.map((op) => op.applicationIndex)).toEqual(
        script.ops.map((_op, index) => index),
      );
      const ranked = script.topByCost.map((index) => script.ops[index].cost);
      expect([...ranked].sort((x, y) => y - x)).toEqual(ranked);
      for (const op of script.ops) {
        expect(op.site.container).toBe(script.map);
        expect(op.map).toBe(script.map);
        expect(op.part).toBe(script.part);
        expect(op.free).toBe(op.cost === 0);
      }
      const counted = {
        insert: script.ops.filter((op) => op.op === 'insert').length,
        delete: script.ops.filter((op) => op.op === 'delete').length,
        substitute: script.ops.filter((op) => op.op === 'substitute').length,
      };
      expect(script.opCounts).toMatchObject(counted);
      expect(script.opCounts.free).toBe(script.ops.filter((op) => op.free).length);
    }
  });

  it('prices the attributes it names, largest first', () => {
    const withAttributes = report.scripts
      .flatMap((script) => script.ops)
      .filter((op) => op.attributes.length > 1);
    expect(withAttributes.length).toBeGreaterThan(0);
    for (const op of withAttributes) {
      const deltas = op.attributes.map((entry) => entry.deltaJnd);
      expect([...deltas].sort((x, y) => y - x)).toEqual(deltas);
      // The site names the attribute the op is most about, which is what makes it worth a look.
      expect(op.site.attribute).toBe(op.attributes[0].name);
      for (const entry of op.attributes) {
        expect(entry.deltaJnd).toBeGreaterThanOrEqual(0);
        expect(Number.isFinite(entry.deltaJnd)).toBe(true);
        // A listed attribute really differs — an op does not pad its own evidence.
        expect(entry.valueA).not.toEqual(entry.valueB);
      }
    }
  });

  it('carries measure positions exactly when an MSM is supplied (C3)', () => {
    const msm = readFileSync(join(FIXTURES, 'vulpius-die-helle-sonn.msm'), 'utf-8') as XmlText;
    const withMsm = diffMpm({
      a: VULPIUS,
      performanceA: 0,
      performanceB: 1,
      msm,
      window: SHORT,
    }).report;
    const dated = withMsm.scripts.flatMap((script) => script.ops).filter((op) => op.dateA !== null);
    expect(dated.length).toBeGreaterThan(0);
    expect(dated.some((op) => op.measureA !== null)).toBe(true);
    // Without one, every measure position is null — §9.3's "null everywhere without an MSM".
    expect(report.scripts.flatMap((s) => s.ops).every((op) => op.measureA === null)).toBe(true);
  });
});

describe('the neutral baseline and the degenerate shapes (C8, §9.6)', () => {
  it('diffs a real performance against neutralMpm', () => {
    const report = diffMpm({
      a: TELEMANN,
      performanceA: 0,
      b: neutralMpm({ ppq: 720 }),
      window: SHORT,
    }).report;
    expect(report.scripts.length).toBeGreaterThan(0);
    // Every op is a deletion or an insertion in ONE direction: the neutral document has no
    // instruction to substitute for. Which direction depends on the canonical orientation,
    // which is content-derived and therefore not a fact about which argument was `a`.
    for (const script of report.scripts) expect(script.opCounts.substitute).toBe(0);
    for (const dimension of COMPARISON_DIMENSIONS)
      expect(report.dimensions[dimension].replayResidual).toBe(0);
  });

  it('diffs a document against itself as an empty-cost script', () => {
    const report = diffMpm({ a: TELEMANN, performanceA: 1, performanceB: 1, window: SHORT }).report;
    for (const dimension of COMPARISON_DIMENSIONS) {
      expect(report.dimensions[dimension].scriptCost).toBe(0);
      expect(report.dimensions[dimension].replayedDelta).toBe(0);
    }
    for (const script of report.scripts) expect(script.ops.every((op) => op.free)).toBe(true);
  });

  it('is plain data: finite or null everywhere, and no -0', () => {
    const report = diffMpm({ a: VULPIUS, performanceA: 0, performanceB: 2, window: SHORT }).report;
    const walk = (value: unknown, path: string): void => {
      if (typeof value === 'number') {
        expect({ path, finite: Number.isFinite(value) }).toEqual({ path, finite: true });
        expect({ path, negativeZero: Object.is(value, -0) }).toEqual({
          path,
          negativeZero: false,
        });
        return;
      }
      if (value === null || typeof value !== 'object') {
        expect({ path, undef: value === undefined }).toEqual({ path, undef: false });
        return;
      }
      if (Array.isArray(value)) {
        for (const [index, item] of value.entries()) walk(item, `${path}[${String(index)}]`);
        return;
      }
      for (const [key, item] of Object.entries(value)) walk(item, `${path}.${key}`);
    };
    walk(report, 'report');
  });
});

describe('the surface (§9.4)', () => {
  it('rejects the same option mistakes compareMpm rejects', () => {
    expect(() =>
      diffMpm({ a: TELEMANN, performanceA: 0, performanceB: 1, window: { start: 4, end: 4 } }),
    ).toThrow(InvalidOptionError);
    expect(() => diffMpm({ a: TELEMANN })).toThrow(InvalidOptionError);
    expect(() => diffMpm({ a: '<not-mpm/>' as XmlText })).toThrow(ParseError);
    expect(() => diffMpm({ a: neutralMpm(), performanceA: 'nope' })).toThrow(
      PerformanceNotFoundError,
    );
  });

  it('notes a `moves` request rather than silently ignoring it', () => {
    const report = diffMpm({
      a: TELEMANN,
      performanceA: 0,
      performanceB: 1,
      moves: true,
      window: SHORT,
    }).report;
    expect(report.notes.some((entry) => entry.kind === 'option-unusable')).toBe(true);
    const quiet = diffMpm({ a: TELEMANN, performanceA: 0, performanceB: 1, window: SHORT }).report;
    expect(quiet.notes.some((entry) => entry.kind === 'option-unusable')).toBe(false);
  });

  it('is deterministic across calls', () => {
    const once = diffMpm({ a: VULPIUS, performanceA: 0, performanceB: 1, window: SHORT }).report;
    const twice = diffMpm({ a: VULPIUS, performanceA: 0, performanceB: 1, window: SHORT }).report;
    expect(JSON.stringify(twice)).toBe(JSON.stringify(once));
  });
});
