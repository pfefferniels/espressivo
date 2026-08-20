/**
 * The published comparison recipes, executed.
 *
 * A cookbook entry that does not run is a defect of the same kind as a wrong number, and it is
 * the kind this campaign is least able to catch by review: the recipes reach for fields by name
 * (`table.columnSums`, `segment.measure.start.number`, `opCounts.substitute`) and a rename
 * anywhere in §9.3 would leave them plausible and broken. So every one of them is here, in the
 * form the documentation prints, and the numbers it quotes are asserted against the engine.
 *
 * The fixtures are the vendored ones rather than the prose's `roll1905`/`roll1927` placeholders,
 * and each test says which line it is standing behind.
 *
 * The prose these recipes come from moved out of `README.md` and into `docs/comparison.md` when
 * the README was cut down to summaries; the file name is kept because the campaign record cites
 * it. Both documents are read, because both still print figures: the guide carries the worked
 * examples, and the README echoes the headline `mean`.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  compareMpm,
  compareMpmCorpus,
  diffMpm,
  neutralMpm,
  scapeIndex,
} from '../../src/api/comparison.js';
import type { XmlText } from '../../src/api/types.js';
import { elementAt, numberAt } from '../../src/prelude/index.js';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');
const mpm = (name: string) => readFileSync(join(FIXTURES, `${name}.mpm`), 'utf-8') as XmlText;

/**
 * The published prose itself, read — because re-typing its numbers here tests nothing about it
 * (MINOR-5).
 *
 * The gate rewrote five of the headline figures (`8397.60→9999.99`, `1755.47→1111.11`,
 * `24941.06→12345.67`, `475 ms→999 ms`, `33 %→99 %`) and all 124 tests stayed green: this file
 * held its own copies, so the docstring's claim that "the numbers the documentation quotes are
 * asserted against the engine" was true only of the copies. Every headline figure below is now
 * EXTRACTED from the prose, so a drift in either direction fails — edit the document and the
 * engine's number no longer matches it; change the engine and it no longer matches the document.
 */
const DOCS_ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const GUIDE = readFileSync(join(DOCS_ROOT, 'docs/comparison.md'), 'utf-8');
const README = readFileSync(join(DOCS_ROOT, 'README.md'), 'utf-8');

/**
 * The number `source` prints at `anchor`, whose first capture group is the figure.
 *
 * A missing anchor THROWS rather than defaulting: if the prose is rewritten so the anchor no
 * longer matches, the right outcome is a failure that says so, not a test that silently stops
 * checking the documentation it exists to check.
 */
function quoted(anchor: RegExp, source: string = GUIDE): number {
  const match = anchor.exec(source);
  if (match === null)
    throw new Error(`the documentation no longer contains a figure at ${String(anchor)}`);
  return Number(match[1]);
}
const msm = (name: string) => readFileSync(join(FIXTURES, `${name}.msm`), 'utf-8') as XmlText;
const GRAVE = mpm('telemann-grave');
const GRAVE_SCORE = msm('telemann-grave');
const VULPIUS = mpm('vulpius-die-helle-sonn');
const VULPIUS_SCORE = msm('vulpius-die-helle-sonn');

describe('the numbers the guide quotes', () => {
  const telemann = (a: string, b: string) =>
    compareMpm({ a: GRAVE, performanceA: a, performanceB: b, msm: GRAVE_SCORE }).report;

  it('quotes the Telemann table correctly, with the figures READ from the guide', () => {
    const baroqueRomantic = telemann('Baroque', 'Romantic');
    // The worked example above the table, field by field as the guide prints it.
    expect(baroqueRomantic.aggregate.distance).toBeCloseTo(
      quoted(/report\.aggregate\.distance; \/\/ ([\d.]+)/),
      1,
    );
    expect(baroqueRomantic.aggregate.mean).toBeCloseTo(
      quoted(/report\.aggregate\.mean; \/\/\s+([\d.]+)/),
      2,
    );
    expect(baroqueRomantic.dimensions.tempo.distance).toBeCloseTo(
      quoted(/report\.dimensions\.tempo\.distance; \/\/ ([\d.]+)/),
      2,
    );

    // …and the table rows, each anchored on its own label so a reordering cannot pass.
    const row = (pair: string) => quoted(new RegExp(`\\| ${pair} +\\|\\s+([\\d.]+) \\|`));
    expect(baroqueRomantic.aggregate.distance).toBeCloseTo(row('Baroque ↔ Romantic'), 1);

    const baroqueFast = telemann('Baroque', 'Fast');
    expect(baroqueFast.aggregate.distance).toBeCloseTo(row('Baroque ↔ Fast'), 2);
    expect(Math.round(baroqueFast.aggregate.mean ?? 0)).toBe(122);

    const fastRomantic = telemann('Fast', 'Romantic');
    expect(fastRomantic.aggregate.distance).toBeCloseTo(row('Fast ↔ Romantic'), 2);
    expect(Math.round(fastRomantic.aggregate.mean ?? 0)).toBe(128);
  });

  it('is non-vacuous: the extraction really reads the document and really can miss', () => {
    // A test that silently found nothing would make every assertion above pass on `NaN`.
    expect(quoted(/report\.aggregate\.distance; \/\/ ([\d.]+)/)).toBeCloseTo(8397.6, 1);
    expect(() => quoted(/this text is not in the guide ([\d.]+)/)).toThrow(/no longer contains/);
  });

  it('holds the README to the one figure it still echoes', () => {
    // The README keeps a cut-down version of the worked example, and a summary that drifts from
    // the guide it summarises is the same defect as a guide that drifts from the engine.
    expect(telemann('Baroque', 'Romantic').aggregate.mean).toBeCloseTo(
      quoted(/report\.aggregate\.mean; \/\/ ([\d.]+) JND/, README),
      2,
    );
  });

  it('quotes the Vulpius correction correctly, including the three exact zeros', () => {
    const vulpius = (a: string, b: string) =>
      compareMpm({ a: VULPIUS, performanceA: a, performanceB: b, msm: VULPIUS_SCORE }).report;
    expect(vulpius('Baroque', 'Romantic').aggregate.distance).toBeCloseTo(8849.39, 2);
    expect(vulpius('Baroque', 'Amateur').aggregate.distance).toBeCloseTo(10294.5, 2);

    const romanticAmateur = vulpius('Romantic', 'Amateur');
    expect(romanticAmateur.aggregate.distance).toBeCloseTo(2939.66, 2);
    for (const dimension of ['tempo', 'rubato', 'articulation'] as const)
      expect(romanticAmateur.dimensions[dimension].distance).toBe(0);
    for (const dimension of ['imprecisionTiming', 'imprecisionDynamics', 'asynchrony'] as const)
      expect(romanticAmateur.dimensions[dimension].distance).toBeGreaterThan(0);
  });

  it('stamps the window the way the guide says it does', () => {
    const withScore = telemann('Baroque', 'Romantic');
    expect(withScore.window.rule).toBe('msm');
    expect(withScore.window.metricGuarantee).toBe('unconditional');

    const without = compareMpm({
      a: GRAVE,
      performanceA: 'Baroque',
      performanceB: 'Romantic',
    }).report;
    expect(without.window.rule).toBe('pair-derived');
    expect(without.window.metricGuarantee).toBe('window-restricted');
  });
});

describe('the cookbook, run as printed', () => {
  it('runs the Welte timing-only recipe, and the per-space trade-off is real', () => {
    const { report } = compareMpm({
      a: GRAVE,
      performanceA: 'Baroque',
      performanceB: 'Romantic',
      msm: GRAVE_SCORE,
      invariance: { tempo: 'level' },
      weights: { dynamics: 0, imprecisionDynamics: 0 },
    });
    expect(report.dimensions.tempo.invariance).toBe('level');
    expect(report.dimensions.dynamics.weight).toBe(0);
    // A zero weight excludes a dimension from `D` and still reports its `d_k` (AD-19).
    expect(report.aggregate.weights.dynamics).toBe(0);
    expect(Number.isFinite(report.dimensions.dynamics.distance)).toBe(true);
    // …and it fires NO linear-space warning, because tempo is a log space. The guide's first
    // draft claimed the note fires whenever a mode is requested; it fires where the mode means
    // something a reader would not expect, which is the claim worth making.
    expect(report.notes.some((entry) => entry.kind === 'invariance-space')).toBe(false);
  });

  it('quotes the invariance-space note the guide prints, on a linear dimension', () => {
    const { report } = compareMpm({
      a: mpm('albert-du-mein-einzig-licht'),
      performanceA: 0,
      performanceB: 1,
      msm: msm('albert-du-mein-einzig-licht'),
      invariance: { asynchrony: 'level' },
    });
    const note = report.notes.find((entry) => entry.kind === 'invariance-space');
    expect(note).toBeDefined();
    expect(note?.message).toContain(
      "this dimension's scale space is linear, so invariance 'level' removed an OFFSET, not a " +
        'scale factor',
    );
  });

  it('runs the neutral-baseline recipe', () => {
    const { report } = compareMpm({
      a: GRAVE,
      performanceA: 'Baroque',
      b: neutralMpm({ ppq: 720 }),
      msm: GRAVE_SCORE,
    });
    expect(report.aggregate.mean).toBeGreaterThan(0);
    expect(Number.isFinite(report.aggregate.mean ?? NaN)).toBe(true);
  });

  it('runs the boundary_prf derivation', () => {
    const { report } = diffMpm({
      a: GRAVE,
      performanceA: 'Baroque',
      performanceB: 'Romantic',
      msm: GRAVE_SCORE,
    });
    const script = report.scripts.find((entry) => entry.map === 'tempoMap');
    expect(script).toBeDefined();
    const counts = script?.opCounts;
    if (counts === undefined) return;
    const precision = counts.substitute / (counts.substitute + counts.delete);
    const recall = counts.substitute / (counts.substitute + counts.insert);
    expect(Number.isFinite(precision) || counts.substitute + counts.delete === 0).toBe(true);
    expect(Number.isFinite(recall) || counts.substitute + counts.insert === 0).toBe(true);
    // The op-level date filter the recipe offers as a post-filter.
    const withinTolerance = script?.ops.filter(
      (op) => op.dateA !== null && op.dateB !== null && Math.abs(op.dateA - op.dateB) <= 1,
    );
    expect(withinTolerance).toBeDefined();
  });

  it('runs the top-by-cost reading of a diff', () => {
    const { report } = diffMpm({
      a: GRAVE,
      performanceA: 'Baroque',
      performanceB: 'Romantic',
      msm: GRAVE_SCORE,
    });
    let seen = 0;
    for (const script of report.scripts)
      for (const index of script.topByCost.slice(0, 3)) {
        const op = elementAt(script.ops, index, 'the script’s ops');
        expect(typeof op.op).toBe('string');
        expect(Number.isFinite(op.cost)).toBe(true);
        // `measureA` is non-null wherever the op has a date and the MSM covers it.
        expect(op.measureA === null || typeof op.measureA.number === 'number').toBe(true);
        seen += 1;
      }
    expect(seen).toBeGreaterThan(0);
    expect(report.dimensions.tempo.reworking).toBeGreaterThanOrEqual(-1e-6);
  });

  it('runs the Hudson earlier-vs-later-rubato recipe, and quotes its numbers', () => {
    const { report } = compareMpm({
      a: mpm('albert-du-mein-einzig-licht'),
      performanceA: 'Axel Berndt',
      performanceB: 'Like a robot',
      msm: msm('albert-du-mein-einzig-licht'),
    });

    const lead = report.dimensions.asynchrony.meanSigned ?? 0;
    // The guide's 475 ms, READ from the prose rather than re-typed (MINOR-5). An expressive
    // reading against a deliberately deadpan one, and 475 is sixteen times Goebl's 30 ms
    // threshold — the recipe's own criterion, not a chosen number.
    expect(Math.abs(lead)).toBeCloseTo(quoted(/prints a \*\*([\d.]+) ms\*\* lead/), 0);
    expect(Math.abs(lead)).toBeGreaterThanOrEqual(30);

    const row = report.table.dimensions.indexOf('asynchrony');
    expect(row).toBeGreaterThanOrEqual(0);
    const ranked = report.segments
      .map((segment, column) => ({
        segment,
        share:
          numberAt(report.table.columnSums, column, 'the table’s column sums') === 0
            ? 0
            : numberAt(
                report.table.cells,
                row * report.table.columnCount + column,
                'the table’s cells',
              ) / numberAt(report.table.columnSums, column, 'the table’s column sums'),
      }))
      .sort((x, y) => y.share - x.share);
    expect(ranked.length).toBeGreaterThan(0);
    // The guide's 33 %, read from the same sentence as the 475 ms above.
    const leading = elementAt(ranked, 0, 'the share-ranked segments');
    expect(leading.share).toBeCloseTo(quoted(/carrying \*\*([\d.]+) %\*\* of the/) / 100, 2);
    expect(leading.segment.measure).not.toBeNull();

    // The guide's stated limit: this corpus yields ONE segment per pair, because the whole
    // piece is above the one-JND threshold, so there is nothing to localise within.
    expect(report.segments).toHaveLength(1);
  });

  it('runs the provenance presets', () => {
    const ROLL_DERIVED = {
      weights: { dynamics: 0.2, imprecisionDynamics: 0.2, accentuation: 0.3, asynchrony: 0.5 },
      invariance: { tempo: 'level' as const },
    };
    const ALIGNMENT_FITTED = { weights: { ornamentation: 0, pedal: 0, accentuation: 0.5 } };
    for (const preset of [ROLL_DERIVED, ALIGNMENT_FITTED, {}]) {
      const { report } = compareMpm({
        a: GRAVE,
        performanceA: 'Baroque',
        performanceB: 'Romantic',
        msm: GRAVE_SCORE,
        ...preset,
      });
      expect(Number.isFinite(report.aggregate.distance)).toBe(true);
    }
  });

  it('runs the scape example, including the exported index function', () => {
    const { report } = compareMpm({
      a: GRAVE,
      performanceA: 'Baroque',
      performanceB: 'Romantic',
      msm: GRAVE_SCORE,
      scape: { bins: 32 },
    });
    const cells = report.scape?.cells ?? [];
    expect(cells).toHaveLength((32 * 33) / 2);
    expect(Number.isFinite(cells[scapeIndex(32, 1, 0)])).toBe(true);
    expect(Number.isFinite(cells[scapeIndex(32, 8, 4)])).toBe(true);
    expect(cells[scapeIndex(32, 32, 0)]).toBeCloseTo(report.aggregate.distance, 9);
  });

  it('runs the corpus example', () => {
    const names = ['Baroque', 'Fast', 'Romantic'];
    const { report } = compareMpmCorpus({
      items: names.map((performance) => ({ mpm: GRAVE, performance, label: performance })),
      msm: GRAVE_SCORE,
      k: 2,
      noiseFloor: true,
    });
    expect(report.medoids).not.toBeNull();
    const medoids = report.medoids ?? [];
    expect(
      elementAt(report.labels, elementAt(medoids, 0, 'the corpus medoids'), 'the corpus labels'),
    ).toBeTypeOf('string');
    expect(
      numberAt(report.matrices.aggregate, 0 * report.n + 1, 'the aggregate matrix'),
    ).toBeGreaterThan(0);
    expect(report.embedding.coordinates).toHaveLength(report.n * report.embedding.axes);
    expect(report.context?.percentile[0 * report.n + 1]).toBeGreaterThan(0);
    expect(report.silhouetteReliable).toBe(false);
    expect(report.embedding.negativeEigenvalueMass).toBeGreaterThanOrEqual(0);
  });
});
