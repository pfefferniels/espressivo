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
import { elementAt, pairwise } from '../../src/prelude/index.js';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');
const fixture = (name: string) => readFileSync(join(FIXTURES, `${name}.mpm`), 'utf-8') as XmlText;
const TELEMANN = fixture('telemann-grave');
const VULPIUS = fixture('vulpius-die-helle-sonn');
const ALBERT = fixture('albert-du-mein-einzig-licht');
const GRAVE_SCORE = readFileSync(join(FIXTURES, 'telemann-grave.msm'), 'utf-8') as XmlText;

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
      const costOfOrdered = (index: number) =>
        elementAt(ordered, index, 'the date-ordered ops').cost;
      const ranking = ordered.map((_op, index) => index);
      ranking.sort((x, y) => costOfOrdered(y) - costOfOrdered(x) || x - y);
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
          fragment: script.opCounts.consolidate,
          consolidate: script.opCounts.fragment,
        },
      };
    }),
    // The notes swap sides and are then RE-SORTED into §9.5's order, both of which this mirror
    // used to get wrong in ways nothing could see: `DiffReport.notes` was structurally always
    // empty (W4 MAJOR-5), so this branch mirrored an empty array and agreed with anything. It
    // left `site.document` unswapped, and it did not re-sort — and §9.5's key runs through
    // `document` and through the serialized note, both of which the swap changes.
    //
    // Re-derived from §9.5's stated order rather than by calling the engine's `sortNotes`, which
    // is what keeps this mirror independent: kind, dimension, start, document, message, then the
    // whole note as the final tiebreak.
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

/** A-Q5's pair inverts with the plain one: one-became-several read backwards is the reverse. */
const INVERSE: Readonly<Record<EditOp['op'], EditOp['op']>> = {
  insert: 'delete',
  delete: 'insert',
  substitute: 'substitute',
  fragment: 'consolidate',
  consolidate: 'fragment',
};

const MOVE_RANK: Readonly<Record<EditOp['op'], number>> = {
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

/** Long enough to contain groups worth reading as one edit, short enough to run in under a second. */
const MOVES = { start: 0, end: 32 } as const;

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

  it('mirrors a MOVED script byte for byte, not only in its counts', () => {
    // The `moves: true` mirror, asserted the way the plain one is: on the whole serialization.
    // The counts-only version of this test passed while `opCounts.fragment` was un-swapped, so
    // the byte comparison is what makes the claim complete.
    const forward = diffMpm({
      a: TELEMANN,
      performanceA: 0,
      performanceB: 2,
      window: MOVES,
      moves: true,
    });
    const reverse = diffMpm({
      a: TELEMANN,
      performanceA: 2,
      performanceB: 0,
      window: MOVES,
      moves: true,
    });
    expect(JSON.stringify(reverse.report)).toBe(JSON.stringify(mirrorOf(forward.report)));
    const moved = forward.report.scripts.reduce(
      (total, script) => total + script.opCounts.fragment + script.opCounts.consolidate,
      0,
    );
    expect(moved).toBeGreaterThan(0);
  });

  /**
   * The mirror WITH an MSM, so `measureA`/`measureB` are populated (MINOR-6).
   *
   * `mirrorOf` swaps those two fields and no shipped mirror test passed an `msm`, so both were
   * always null and the swap was asserted against nothing. The verifier confirmed the code is
   * correct by writing its own mirror; this closes the gap in the suite so the next change to
   * the measure mapping cannot pass unnoticed.
   */
  it('mirrors a pair WITH an msm, where measureA and measureB are not null', () => {
    const base = { a: TELEMANN, msm: GRAVE_SCORE, window: SHORT } as const;
    const forward = diffMpm({ ...base, performanceA: 0, performanceB: 1 }).report;
    const reverse = diffMpm({ ...base, performanceA: 1, performanceB: 0 }).report;
    expect(JSON.stringify(reverse)).toBe(JSON.stringify(mirrorOf(forward)));

    // Non-vacuity: the fields this adds over the tests above are actually populated, so the
    // swap has something to swap. Without an msm every one of them is null.
    const measured = forward.scripts.flatMap((script) =>
      script.ops.filter((op) => op.measureA !== null || op.measureB !== null),
    );
    expect(measured.length).toBeGreaterThan(0);
    const withoutMsm = diffMpm({
      a: TELEMANN,
      performanceA: 0,
      performanceB: 1,
      window: SHORT,
    }).report;
    expect(
      withoutMsm.scripts.every((script) =>
        script.ops.every((op) => op.measureA === null && op.measureB === null),
      ),
    ).toBe(true);
  });

  it('mirrors over a full window too, so the short one is not hiding a field', () => {
    const forward = diffMpm({ a: ALBERT, performanceA: 0, performanceB: 1 });
    const reverse = diffMpm({ a: ALBERT, performanceA: 1, performanceB: 0 });
    expect(JSON.stringify(reverse.report)).toBe(JSON.stringify(mirrorOf(forward.report)));
  });

  /**
   * `callerIsCanonical`'s `<=`, which nothing pinned (MINOR-10).
   *
   * With `<`, a document compared against ITSELF has equal orientation keys, so the caller's
   * order is judged non-canonical, the report is built and then INVERTED — and every op's
   * `site.document` comes back as `'b'`. The result is still a valid empty script, which is why
   * no existing test noticed: a self-diff has nothing to price, so only the site labels move.
   * Equal keys mean identical inputs and the orientation is irrelevant, so `<=` is the rule and
   * the a-side labelling is what a caller reading `site.document` expects.
   */
  it('treats an identical pair as already canonical, so sites stay on the a side', () => {
    const self = diffMpm({ a: TELEMANN, performanceA: 0, performanceB: 0, window: SHORT }).report;
    const sites = self.scripts.flatMap((script) => script.ops.map((op) => op.site.document));
    // A self-diff is an empty-cost script; what this pins is the LABEL, not the cost.
    expect(self.scripts.every((script) => script.ops.every((op) => op.cost === 0))).toBe(true);
    for (const document of sites) expect(document).toBe('a');

    // Non-vacuity: on a self-diff of a document that HAS instructions there are sites to label,
    // so the assertion above is about real ops rather than an empty array.
    const anySites = diffMpm({
      a: TELEMANN,
      performanceA: 0,
      performanceB: 0,
      window: { start: 0, end: 64 },
    }).report;
    expect(anySites.scripts.flatMap((script) => script.ops).length).toBeGreaterThan(0);
    for (const script of anySites.scripts)
      for (const op of script.ops) expect(op.site.document).toBe('a');
  });

  /**
   * §9.5's `scripts` order, which no test asserted (MINOR-9) — and the two texts turn out to
   * agree, for a reason worth pinning rather than a discrepancy worth fixing.
   *
   * The gate read DESIGN's `(part, map)` against `compareScripts`' `(part, map, dimension)` as a
   * divergence. Measured, they describe the same order: every `(part, map)` in a real report
   * carries EXACTLY ONE dimension's script, because the three imprecision dimensions live in
   * separately-named maps (`imprecisionMap.dynamics`, `.timing`, `.toneduration`) rather than
   * sharing one. So `(part, map)` is already total and `dimension` is a defensive third key that
   * no input reaches. Both facts are asserted below, because the second is what makes the first
   * true and it is exactly the kind of thing a future map rename would break silently.
   */
  it('delivers the scripts in (part, map, dimension) order', () => {
    const report = diffMpm({
      a: TELEMANN,
      performanceA: 0,
      performanceB: 1,
      window: { start: 0, end: 64 },
    }).report;
    expect(report.scripts.length).toBeGreaterThan(1);

    const key = (script: (typeof report.scripts)[number]) =>
      [script.part ?? -1, script.map, script.dimension] as const;
    for (const [position, [before, after]] of pairwise(report.scripts).entries()) {
      // `pairwise` is 0-based over the PAIRS; the reported index names the later script, as the
      // hand-written `for (let index = 1; …)` this replaced did.
      const index = position + 1;
      const previous = key(before);
      const current = key(after);
      const ordered =
        previous[0] < current[0] ||
        (previous[0] === current[0] &&
          (previous[1] < current[1] || (previous[1] === current[1] && previous[2] < current[2])));
      expect({ index, previous, current, ordered }).toEqual({
        index,
        previous,
        current,
        ordered: true,
      });
    }

    // The global scope sorts FIRST, which is what `part ?? -1` encodes and what `parts` reports.
    if (report.scripts.some((script) => script.part === null))
      expect(elementAt(report.scripts, 0, 'the diff’s edit scripts').part).toBeNull();

    // `(part, map)` is ALREADY total: no bucket holds two scripts, so the `dimension` key is
    // never consulted. If a future map name were shared between two dimensions this would fail
    // here rather than silently making the delivered order depend on the unpinned third key.
    const perPartMap = new Map<string, string[]>();
    for (const script of report.scripts) {
      const bucket = `${String(script.part)}|${script.map}`;
      perPartMap.set(bucket, [...(perPartMap.get(bucket) ?? []), script.dimension]);
    }
    for (const [bucket, dimensions] of perPartMap)
      expect({ bucket, dimensions }).toEqual({ bucket, dimensions: [dimensions[0]] });

    // Non-vacuity: there really are several parts and several maps to order.
    expect(new Set(report.scripts.map((script) => script.part)).size).toBeGreaterThan(1);
    expect(new Set(report.scripts.map((script) => script.map)).size).toBeGreaterThan(1);
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
      const ranked = script.topByCost.map(
        (index) => elementAt(script.ops, index, 'the script’s ops').cost,
      );
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
      expect(op.site.attribute).toBe(elementAt(op.attributes, 0, 'the op’s attributes').name);
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

  /**
   * W4 MAJOR-1 / AD-70.3: a field the diff does not CONSUME is absent, not accepted-and-dropped.
   *
   * `DiffMpmOptions` omitted only `invariance` and `profile`, so `weights` and `scape` were
   * inherited, validated, echoed — and never read. Measured before the repair:
   * `JSON.stringify(diffMpm({…, scape: { bins: 8 }}))` was byte-identical to the call without
   * it, and `weights: { tempo: 0 }` left every `scriptCost` bit-identical while the echo
   * reported `0`. That is AD-25.1's knowability split violated on the surface AD-59.3 and
   * AD-61.1 were about: unusable-given-the-options-alone must never be silent.
   *
   * TypeScript is the primary guard and it is not testable at runtime — the four keys do not
   * type-check, which is the whole point of absence-over-throw. What IS testable is the
   * JavaScript caller's path, and this pins the two halves of AD-54.3's rule for it: the keys
   * are ignored exactly as `{ nonsense: 1 }` is, and — the half that is easy to get wrong —
   * they do not THROW either, which they would have if the diff kept using the pairwise
   * validator after losing the fields from its surface.
   */
  it('omits the four options it cannot consume, and neither reads nor rejects them', () => {
    const base = { a: TELEMANN, performanceA: 0, performanceB: 1, window: SHORT } as const;
    const plain = JSON.stringify(diffMpm(base).report);

    // A JavaScript caller can hand over anything; each of these is an unrecognized key now.
    const smuggle = (extra: Record<string, unknown>) =>
      JSON.stringify(diffMpm({ ...base, ...extra } as never).report);

    expect(smuggle({ weights: { tempo: 0 } })).toBe(plain);
    expect(smuggle({ scape: { bins: 8 } })).toBe(plain);
    expect(smuggle({ invariance: { tempo: 'level' } })).toBe(plain);
    expect(smuggle({ profile: { dimensions: ['tempo'] } })).toBe(plain);
    expect(smuggle({ nonsense: 1 })).toBe(plain);

    // …and an ILLEGAL value for an omitted key is ignored too, rather than throwing about a
    // field this surface does not declare. `scape.bins = 0` is an `InvalidOptionError` on
    // `compareMpm`, which is what makes this a real distinction and not a tautology.
    expect(smuggle({ scape: { bins: 0 } })).toBe(plain);
    expect(() => compareMpm({ ...base, scape: { bins: 0 } } as never)).toThrow(InvalidOptionError);

    // The options the diff DOES declare are still validated, so the narrower validator did not
    // simply stop checking.
    expect(() => diffMpm({ ...base, jnd: { 'tempo/tempo@bpm': -1 } })).toThrow(InvalidOptionError);
    expect(() => diffMpm({ ...base, moves: 'yes' as never })).toThrow(InvalidOptionError);
  });

  /**
   * W4 MAJOR-5: `DiffReport.notes` was allocated, sorted, and never written to.
   *
   * Structurally always empty means no note kind of §9.1 could fire on the diff path at all, and
   * two of them should: the MPM-derived scope rule, which `DiffReport.scopes` reports as
   * `rule: 'mpm'` and which DESIGN §9.3 says carries an `estimate-degradation` note, and
   * `plausibility`, which AD-70.3 ruled is the reason `plausibleRange` stays on this surface.
   * It also made `invertReport`'s note-inversion branch dead code — and that branch had two
   * defects waiting in it, which the mirror test found the moment the first note existed.
   */
  it('reports the notes the edit path can produce (MAJOR-5)', () => {
    const base = { a: TELEMANN, performanceA: 0, performanceB: 1, window: SHORT } as const;

    // Unasked, exactly one note: the scope rule. No MSM was supplied, so the per-part sum runs
    // over the MPM's own <part> elements rather than over rendered MSM parts (AD-55.2), and the
    // report says so instead of leaving the reader to infer it from `scopes.rule`.
    const plain = diffMpm(base).report;
    expect(plain.scopes.rule).toBe('mpm');
    expect(plain.notes.map((entry) => entry.kind)).toEqual(['estimate-degradation']);
    expect(elementAt(plain.notes, 0, 'the diff’s notes').message).toContain(
      'Supply an `msm` for the counted quantity',
    );

    // With a band the documents violate, `plausibility` fires — 56 of them, one per site, which
    // is the same count `compareMpm` produces from the same two documents, because
    // `plausibilityFindings` reads the documents and nothing else. That equality is the
    // argument for `plausibleRange` being CONSUMED here rather than omitted.
    const band = { plausibleRange: { 'tempo/tempo@bpm': [200, 400] } } as never;
    const banded = diffMpm({ ...base, ...(band as object) }).report;
    const plausibility = banded.notes.filter((entry) => entry.kind === 'plausibility');
    expect(plausibility).toHaveLength(56);
    expect(elementAt(plausibility, 0, 'the plausibility notes').message).toBe(
      '@bpm = 58 is outside its plausible band [200, 400]; the distance is unchanged',
    );
    expect(plausibility.every((entry) => entry.dimension === 'tempo')).toBe(true);
    expect(new Set(plausibility.map((entry) => entry.document))).toEqual(new Set(['a', 'b']));
    expect(
      compareMpm({ ...base, ...(band as object) }).report.notes.filter(
        (entry) => entry.kind === 'plausibility',
      ),
    ).toHaveLength(56);

    // Non-vacuity: the band is what produces them. The default bands are wide enough that this
    // corpus violates none, which is why the unasked report has only the scope note.
    expect(diffMpm(base).report.notes.some((entry) => entry.kind === 'plausibility')).toBe(false);
  });

  /**
   * The mirror's note handling, on the one shape that can tell it apart from doing nothing.
   *
   * `invertReport` re-sorts the notes after swapping their sides, and on the vendored corpus
   * that re-sort changes NOTHING: every plausibility message carries the attribute's value, the
   * two performances never share one at the same site, so no two notes tie on §9.5's key ahead
   * of `document`. Removing the re-sort left all 26 mirror assertions passing — which makes it
   * exactly the kind of unexercised guard this campaign treats as absent.
   *
   * So the case is constructed rather than hunted for: two documents whose date-0 `<tempo>` is
   * byte-identical and out of the DEFAULT band, differing only later. Both sides then emit the
   * same note text at the same date, the pair ties on (kind, dimension, startQuarters, message),
   * and `document` is what orders them — so mapping the swap in place leaves the mirrored report
   * holding `b, a` where §9.5 says `a, b`. §6.4 claims byte-identity, and that is a byte.
   */
  it('re-sorts the mirrored notes, where two of them differ only in which document they name', () => {
    const withTempo = (later: number): XmlText =>
      ('<mpm xmlns="http://www.cemfi.de/mpm/ns/1.0">' +
        '<performance name="p" pulsesPerQuarter="720"><global><header/><dated><tempoMap>' +
        // Shared, byte for byte, and 900 bpm is outside the default [10, 400] band.
        '<tempo date="0.0" bpm="900" beatLength="0.25"/>' +
        `<tempo date="720.0" bpm="${String(later)}" beatLength="0.25"/>` +
        '</tempoMap></dated></global></performance></mpm>') as XmlText;

    const a = withTempo(60);
    const b = withTempo(80);

    // Both orders, so whichever one is non-canonical goes through `invertReport`.
    for (const [left, right] of [
      [a, b],
      [b, a],
    ] as const) {
      const forward = diffMpm({ a: left, b: right, window: SHORT }).report;
      const reverse = diffMpm({ a: right, b: left, window: SHORT }).report;
      expect(JSON.stringify(reverse)).toBe(JSON.stringify(mirrorOf(forward)));
    }

    // Non-vacuity: the tie really is there, and it is a tie on everything §9.5 ranks above
    // `document`. Without this the test above would be asserting the mirror on a note set that
    // cannot distinguish a re-sort from a no-op — which is what the vendored corpus does.
    const report = diffMpm({ a, b, window: SHORT }).report;
    const shared = report.notes.filter(
      (entry) => entry.kind === 'plausibility' && entry.startQuarters === 0,
    );
    expect(shared).toHaveLength(2);
    const sharedAt = (index: number) => elementAt(shared, index, 'the shared plausibility notes');
    expect(sharedAt(0).message).toBe(sharedAt(1).message);
    expect(shared.map((entry) => entry.document)).toEqual(['a', 'b']);
  });

  it('honours `moves`, and the plain script is what a caller gets unasked (A-Q5)', () => {
    // A THIRTY-TWO quarter window, and the size is measured rather than chosen: the 16-quarter
    // window this file uses elsewhere contains no group worth reading as one edit (a test that
    // asserted otherwise there would have been asserting something false about the data), while
    // the full score window costs 22 s a call — enough to time out under a loaded runner, which
    // it did. Thirty-two quarters carries both move kinds at under a second.
    const base = { a: TELEMANN, performanceA: 0, performanceB: 2, window: MOVES } as const;
    const plain = diffMpm(base).report;
    const withMoves = diffMpm({ ...base, moves: true }).report;

    // Off by default: the two move kinds are absent, and every op consumes at most one a side.
    for (const script of plain.scripts) {
      expect(script.opCounts.fragment).toBe(0);
      expect(script.opCounts.consolidate).toBe(0);
      for (const op of script.ops) {
        expect(op.count.a).toBeLessThanOrEqual(1);
        expect(op.count.b).toBeLessThanOrEqual(1);
      }
    }

    // On, a move can only LOWER the total: it replaces a sequence of plain ops with ONE state
    // transition, which the L¹ triangle inequality bounds by their sum.
    let moved = 0;
    for (const dimension of COMPARISON_DIMENSIONS) {
      expect(withMoves.dimensions[dimension].scriptCost).toBeLessThanOrEqual(
        plain.dimensions[dimension].scriptCost * (1 + 1e-9) + 1e-12,
      );
      expect(withMoves.dimensions[dimension].replayResidual).toBe(0);
    }
    for (const script of withMoves.scripts) {
      moved += script.opCounts.fragment + script.opCounts.consolidate;
      for (const op of script.ops)
        if (op.op === 'fragment' || op.op === 'consolidate')
          expect(Math.max(op.count.a, op.count.b)).toBeGreaterThan(1);
    }
    // [MEASURED] Non-vacuity on REAL data, and the size of what the vocabulary buys: this pair
    // yields **5 fragments and 1 consolidate** over this window, and the script gets **88.22
    // JND·quarters** cheaper — which is the point of the move kinds rather than a curiosity.
    // Over the FULL score window the same pairing yields 9 and 2 and saves 4675.56, so the
    // effect grows with the piece rather than being an artefact of a short window.
    expect(moved).toBe(6);
    let saved = 0;
    for (const dimension of COMPARISON_DIMENSIONS)
      saved += plain.dimensions[dimension].scriptCost - withMoves.dimensions[dimension].scriptCost;
    expect(saved).toBeCloseTo(88.2172, 3);
  });

  it('mirrors a moved script too, fragment against consolidate', () => {
    const forward = diffMpm({
      a: TELEMANN,
      performanceA: 0,
      performanceB: 2,
      window: MOVES,
      moves: true,
    }).report;
    const reverse = diffMpm({
      a: TELEMANN,
      performanceA: 2,
      performanceB: 0,
      window: MOVES,
      moves: true,
    }).report;
    const count = (report: DiffReport, kind: 'fragment' | 'consolidate') =>
      report.scripts.reduce((total, script) => total + script.opCounts[kind], 0);
    expect(count(reverse, 'consolidate')).toBe(count(forward, 'fragment'));
    expect(count(reverse, 'fragment')).toBe(count(forward, 'consolidate'));
  });

  it('is deterministic across calls', () => {
    const once = diffMpm({ a: VULPIUS, performanceA: 0, performanceB: 1, window: SHORT }).report;
    const twice = diffMpm({ a: VULPIUS, performanceA: 0, performanceB: 1, window: SHORT }).report;
    expect(JSON.stringify(twice)).toBe(JSON.stringify(once));
  });
});
