/**
 * The eleven-dimension driver — DESIGN.md §7 and §9.3 assembled over real documents.
 *
 * Two kinds of test again. Inline documents pin the structural rules that no fixture happens to
 * exercise — the part-scope resolution, `both-neutral`, the window precedence, the closing
 * table over an arbitrary partition. The vendored Telemann and Vulpius documents then pin
 * ACTUAL NUMBERS, because eleven dimensions that are each right can still be summed wrongly,
 * and P-C9's shape (Baroque and Romantic close, Fast far from both) is a claim about the world
 * that no synthetic fixture can make.
 *
 * The renderer claim in `evaluates an unmatched part against the other document's GLOBAL maps`
 * is measured through `performMsm`, per AD-43.1: it contradicts AD-3's wording, so a map-level
 * reading of it would not be evidence.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { performMsm } from '../../src/api/pipeline.js';
import { compareInterior, type InteriorCompareOptions } from '../../src/comparison/compare.js';
import { defaultWeights } from '../../src/comparison/aggregate.js';
import { COMPARISON_DIMENSIONS, type ComparisonDimension } from '../../src/comparison/registry.js';
import { DEFAULT_LAMBDA_DATE } from '../../src/comparison/eventAlignment.js';
import { parseMsmRoot } from '../../src/comparison/msm.js';
import type { InvarianceMode } from '../../src/comparison/decomposition.js';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');
const TELEMANN = readFileSync(join(FIXTURES, 'telemann-grave.mpm'), 'utf-8');
const TELEMANN_MSM = readFileSync(join(FIXTURES, 'telemann-grave.msm'), 'utf-8');
const VULPIUS = readFileSync(join(FIXTURES, 'vulpius-die-helle-sonn.mpm'), 'utf-8');
const VULPIUS_MSM = readFileSync(join(FIXTURES, 'vulpius-die-helle-sonn.msm'), 'utf-8');

const NS = 'http://www.cemfi.de/mpm/ns/1.0';

const NO_INVARIANCE = Object.fromEntries(
  COMPARISON_DIMENSIONS.map((dimension) => [dimension, 'none']),
) as Record<ComparisonDimension, InvarianceMode>;

const baseOptions = (a: string): InteriorCompareOptions => ({
  a,
  weights: defaultWeights(),
  jnd: {},
  plausibleRange: {},
  invariance: NO_INVARIANCE,
  lambdaDate: DEFAULT_LAMBDA_DATE,
});

const compare = (overrides: Partial<InteriorCompareOptions> & { a: string }) =>
  compareInterior({ ...baseOptions(overrides.a), ...overrides });

// ---------------------------------------------------------------------------
// Real documents
// ---------------------------------------------------------------------------

describe('P-C9: the Telemann Grave, all eleven dimensions', () => {
  const anchor = (a: string, b: string) =>
    compare({
      a: TELEMANN,
      performanceA: a,
      performanceB: b,
      msm: parseMsmRoot(TELEMANN_MSM),
    });

  const baroqueFast = anchor('Baroque', 'Fast');
  const baroqueRomantic = anchor('Baroque', 'Romantic');
  const fastRomantic = anchor('Fast', 'Romantic');

  it('takes its window from the MSM, and says so', () => {
    expect(baroqueFast.window.rule).toBe('msm');
    expect(baroqueFast.window.metricGuarantee).toBe('unconditional');
    expect(baroqueFast.window.endQuarters).toBeCloseTo(204, 9);
    expect(baroqueFast.inputs.msmUsed).toBe(true);
    expect(baroqueFast.measures).not.toBeNull();
    expect(baroqueFast.measures?.[0].timeSignature).toEqual({ numerator: 3, denominator: 2 });
  });

  it('has the shape the corpus advertises: Baroque and Romantic are the near pair', () => {
    expect(baroqueRomantic.aggregate.distance).toBeLessThan(baroqueFast.aggregate.distance);
    expect(baroqueRomantic.aggregate.distance).toBeLessThan(fastRomantic.aggregate.distance);
  });

  /**
   * The campaign's first end-to-end numbers, pinned as regression anchors and not as truths.
   *
   * The tempo figure is NOT the 556.5371 the tempo suite pins for the same pair, and the two
   * differences are both accounted for: this window is the MSM's 204 quarters rather than the
   * pair-derived 198, and this document has THREE parts, each of which inherits the global
   * `tempoMap` and each of which the renderer performs — so AD-3's sum over the union of both
   * documents' parts counts the same deviation once per part, which is what the renderer does.
   */
  it('pins the aggregate and the tempo row', () => {
    expect(baroqueRomantic.aggregate.distance).toBeCloseTo(6493.60102, 4);
    expect(baroqueRomantic.aggregate.mean).toBeCloseTo(31.83137755, 6);
    expect(baroqueRomantic.dimensions.tempo.distance).toBeCloseTo(1755.4706259, 4);
    expect(baroqueFast.aggregate.distance).toBeCloseTo(22357.0626073, 4);
    expect(fastRomantic.aggregate.distance).toBeCloseTo(21686.7195808, 4);
  });

  it('satisfies the triangle inequality on real data, to quadrature precision (P-C3)', () => {
    expect(baroqueFast.aggregate.distance).toBeLessThanOrEqual(
      (baroqueRomantic.aggregate.distance + fastRomantic.aggregate.distance) * (1 + 1e-9),
    );
    for (const dimension of COMPARISON_DIMENSIONS)
      expect(baroqueFast.dimensions[dimension].distance).toBeLessThanOrEqual(
        (baroqueRomantic.dimensions[dimension].distance +
          fastRomantic.dimensions[dimension].distance) *
          (1 + 1e-9) +
          1e-12,
      );
  });

  it('is exactly 0 against itself, in every dimension (P-C1)', () => {
    const identity = anchor('Baroque', 'Baroque');
    expect(identity.aggregate.distance).toBe(0);
    for (const dimension of COMPARISON_DIMENSIONS)
      expect(Object.is(identity.dimensions[dimension].distance, 0)).toBe(true);
    expect(identity.table.total).toBe(0);
    expect(identity.segments).toHaveLength(0);
  });

  it('is symmetric bit for bit on real data (P-C2)', () => {
    const reverse = anchor('Romantic', 'Baroque');
    expect(Object.is(reverse.aggregate.distance, baroqueRomantic.aggregate.distance)).toBe(true);
    for (const dimension of COMPARISON_DIMENSIONS)
      expect(
        Object.is(
          reverse.dimensions[dimension].distance,
          baroqueRomantic.dimensions[dimension].distance,
        ),
      ).toBe(true);
    // The signed descriptors NEGATE rather than agree — §9.5's swap map, and the reason they
    // are a separate field from the distance.
    expect(reverse.cumulativeDrift?.difference).toBeCloseTo(
      -(baroqueRomantic.cumulativeDrift?.difference ?? 0),
      12,
    );
  });

  it('closes the table on every pair (P-C7)', () => {
    for (const report of [baroqueFast, baroqueRomantic, fastRomantic]) {
      expect(report.table.residual).toBeLessThanOrEqual(1e-12 * report.aggregate.distance);
      const columns = report.table.columnSums.reduce((sum, value) => sum + value, 0);
      expect(columns).toBeCloseTo(report.aggregate.distance, 6);
    }
  });

  it('reports the cumulative drift as a descriptor beside the distance (C13)', () => {
    const drift = baroqueRomantic.cumulativeDrift;
    expect(drift).not.toBeNull();
    // Baroque is the slower reading of the two, so it takes longer.
    expect(drift?.secondsA).toBeGreaterThan(drift?.secondsB ?? 0);
    expect(drift?.ratio).toBeCloseTo((drift?.secondsA ?? 0) / (drift?.secondsB ?? 1), 12);
    expect(drift?.maxAbsMs).toBeGreaterThan(0);
    expect(drift?.secondsA).toBeCloseTo(110.1167557, 5);
  });

  it('is plain data: every number finite or null (§9.6)', () => {
    for (const [path, value] of walk(baroqueRomantic))
      if (typeof value === 'number') expect(Number.isFinite(value), `${path} is finite`).toBe(true);
  });
});

/**
 * Vulpius, and a measurement that CORRECTS the design's expectation of it.
 *
 * §10's P-C9 says "Vulpius similar", i.e. that its two historical readings should be the near
 * pair as Telemann's are. They are not, and the reason is in the document rather than in the
 * metric: the Amateur reading is the ROMANTIC one with imprecision and asynchrony added. Its
 * tempo, rubato and articulation rows against Romantic are EXACTLY zero — three whole
 * dimensions of two different performances that compare at 0 because they really do share their
 * maps — and everything that separates them lives in `imprecisionTiming`,
 * `imprecisionDynamics` and `asynchrony`.
 *
 * That is a far better test than the one the design asked for: the expected ordering would have
 * passed on an implementation that computed almost anything, while an exact zero across three
 * dimensions on real data, with a large nonzero on three others, can only come out of readers
 * that agree with the document.
 */
describe('P-C9: Vulpius — the amateur reading is the romantic one, made imprecise', () => {
  const anchor = (a: string, b: string) =>
    compare({
      a: VULPIUS,
      performanceA: a,
      performanceB: b,
      msm: parseMsmRoot(VULPIUS_MSM),
    });

  const baroqueRomantic = anchor('Baroque', 'Romantic');
  const baroqueAmateur = anchor('Baroque', 'Amateur');
  const romanticAmateur = anchor('Romantic', 'Amateur');

  it('finds Romantic and Amateur to be the near pair, against §10’s expectation', () => {
    expect(romanticAmateur.aggregate.distance).toBeLessThan(baroqueRomantic.aggregate.distance);
    expect(romanticAmateur.aggregate.distance).toBeLessThan(baroqueAmateur.aggregate.distance);
  });

  it('scores three whole dimensions at EXACTLY zero between Romantic and Amateur', () => {
    for (const dimension of ['tempo', 'rubato', 'articulation'] as const)
      expect(Object.is(romanticAmateur.dimensions[dimension].distance, 0)).toBe(true);
  });

  it('puts what separates them in imprecision and asynchrony, where the document puts it', () => {
    expect(romanticAmateur.dimensions.imprecisionTiming.distance).toBeGreaterThan(1000);
    expect(romanticAmateur.dimensions.imprecisionDynamics.distance).toBeGreaterThan(1000);
    expect(romanticAmateur.dimensions.asynchrony.distance).toBeCloseTo(180, 9);
    // Baroque against Romantic is the opposite shape: the tempo reading is what differs.
    expect(baroqueRomantic.dimensions.tempo.distance).toBeGreaterThan(2000);
  });

  it('pins the measured values', () => {
    expect(baroqueRomantic.aggregate.distance).toBeCloseTo(8849.390525, 4);
    expect(baroqueAmateur.aggregate.distance).toBeCloseTo(10294.4973822, 4);
    expect(romanticAmateur.aggregate.distance).toBeCloseTo(2939.6596362, 4);
  });

  it('stamps a pair-derived window as window-restricted when no MSM decides it (AD-4)', () => {
    const withoutMsm = compare({
      a: VULPIUS,
      performanceA: 'Baroque',
      performanceB: 'Romantic',
    });
    expect(withoutMsm.window.rule).toBe('pair-derived');
    expect(withoutMsm.window.metricGuarantee).toBe('window-restricted');
    expect(baroqueRomantic.window.rule).toBe('msm');
    expect(baroqueRomantic.window.metricGuarantee).toBe('unconditional');
  });
});

// ---------------------------------------------------------------------------
// Structural rules
// ---------------------------------------------------------------------------

const doc = (global: string, parts = ''): string =>
  `<mpm xmlns="${NS}"><performance name="p" pulsesPerQuarter="720">` +
  `<global><header/><dated>${global}</dated></global>${parts}</performance></mpm>`;

const part = (number: number, dated: string): string =>
  `<part name="p${String(number)}" number="${String(number)}" midi.channel="${String(number - 1)}" ` +
  `midi.port="0"><header/><dated>${dated}</dated></part>`;

const tempoMap = (bpm: number): string =>
  `<tempoMap><tempo date="0.0" bpm="${String(bpm)}" beatLength="0.25"/></tempoMap>`;

describe('scopes: what a part with no counterpart is compared against', () => {
  /**
   * AD-43.1's standard: the renderer claim is measured through the PIPELINE, because it is the
   * pipeline that decides. `resolvePartMaps(null, globalMaps)` returns the global maps, and
   * `renderParts` iterates over the MSM's parts — so an MSM part with no MPM counterpart is
   * performed with the global maps and NOT with the neutral curve AD-3's wording names.
   */
  it('the RENDERER performs an unmatched part with the global maps, not the neutral (AD-3)', () => {
    const msm =
      '<?xml version="1.0" encoding="UTF-8"?>' +
      '<msm xmlns="http://www.cemfi.de/msm/ns/1.0" title="t" pulsesPerQuarter="720">' +
      '<global><dated/></global>' +
      '<part name="one" number="1" midi.channel="0" midi.port="0"><dated><score>' +
      '<note xml:id="a1" date="0.0" midi.pitch="60.0" duration="720.0"/>' +
      '</score></dated></part>' +
      '<part name="two" number="2" midi.channel="1" midi.port="0"><dated><score>' +
      '<note xml:id="b1" date="0.0" midi.pitch="48.0" duration="720.0"/>' +
      '</score></dated></part></msm>';
    const mpm = doc(
      '<dynamicsMap><dynamics date="0.0" volume="40.0"/></dynamicsMap>',
      part(1, '<dynamicsMap><dynamics date="0.0" volume="110.0"/></dynamicsMap>'),
    );
    const performed = [...performMsm({ msm, mpm }).matchAll(/<note\b[^>]*>/g)].map((match) =>
      /\svelocity="([^"]*)"/.exec(match[0])?.[1],
    );
    // Part 1 takes its own map; part 2, which the MPM does not have, takes the GLOBAL one —
    // not the neutral 100 the design's wording would predict.
    expect(performed).toEqual(['110', '40']);
  });

  it('compares an unmatched part against the other document’s global maps, not neutral', () => {
    // A has parts 1 and 2, both at 60 bpm. B has part 1 at 60 and a global map at 60 — so the
    // renderer performs B's part 2 at 60 as well, and the comparison is 0.
    const window = { start: 0, end: 4 };
    const a = doc('', part(1, tempoMap(60)) + part(2, tempoMap(60)));
    const b = doc(tempoMap(60), part(1, tempoMap(60)));
    expect(compare({ a, b, window }).dimensions.tempo.distance).toBe(0);

    // The neutral reading would have compared B's missing part 2 against 100 qbpm and charged
    // |ln(100/60)| over the window — the error this rule exists to avoid, and the size of it.
    const neutralPriced = doc('', part(1, tempoMap(60)) + part(2, tempoMap(100)));
    expect(compare({ a, b: neutralPriced, window }).dimensions.tempo.distance).toBeCloseTo(
      (4 * Math.abs(Math.log(100 / 60))) / Math.log(1.025),
      6,
    );
  });

  it('evaluates a global-only pair ONCE, and a three-part pair three times (AD-3)', () => {
    const globalOnly = (bpm: number) => doc(tempoMap(bpm));
    const threeParts = (bpm: number) =>
      doc(tempoMap(bpm), part(1, '') + part(2, '') + part(3, ''));
    const window = { start: 0, end: 4 };
    const one = compare({ a: globalOnly(60), b: globalOnly(90), window }).dimensions.tempo.distance;
    const three = compare({ a: threeParts(60), b: threeParts(90), window }).dimensions.tempo
      .distance;
    // Every part inherits the one global map, so the renderer performs the same difference in
    // each of them and AD-3's sum counts it three times.
    expect(three).toBeCloseTo(3 * one, 9);
  });
});

describe('the report’s own rules', () => {
  const window = { start: 0, end: 4 };

  it('marks a dimension neither document carries as both-neutral', () => {
    const report = compare({ a: doc(tempoMap(60)), b: doc(tempoMap(90)), window });
    expect(report.dimensions.tempo.state).toBe('compared');
    expect(report.dimensions.pedal.state).toBe('both-neutral');
    expect(report.dimensions.pedal.distance).toBe(0);
  });

  it('degrades an invariance mode on a dimension neither document carries (AD-25.1)', () => {
    const report = compare({
      a: doc(tempoMap(60)),
      b: doc(tempoMap(90)),
      window,
      invariance: { ...NO_INVARIANCE, pedal: 'level' },
    });
    const unusable = report.notes.filter(
      (candidate) => candidate.kind === 'option-unusable' && candidate.dimension === 'pedal',
    );
    expect(unusable).toHaveLength(1);
  });

  it('says in plain words that “level” on a LINEAR space removed an offset (C9)', () => {
    const asynchrony = (offset: number) =>
      doc(
        `<asynchronyMap><asynchrony date="0.0" milliseconds.offset="${String(offset)}"/>` +
          '</asynchronyMap>',
      );
    const report = compare({
      a: asynchrony(-20),
      b: asynchrony(10),
      window,
      invariance: { ...NO_INVARIANCE, asynchrony: 'level' },
    });
    expect(
      report.notes.some(
        (candidate) =>
          candidate.kind === 'invariance-space' && candidate.dimension === 'asynchrony',
      ),
    ).toBe(true);
    // and the mode really did remove the offset
    expect(report.dimensions.asynchrony.distance).toBeLessThan(1e-12);
  });

  it('closes the table over an ARBITRARY partition, not only Ruzzo–Tompa’s (AD-19)', () => {
    const report = compare({
      a: doc(tempoMap(60), part(1, tempoMap(60))),
      b: doc(tempoMap(90), part(1, tempoMap(140))),
      window,
    });
    // The row sums are `d_k` whatever partition is reported, because the table closes by
    // countable additivity and the thresholding only decides WHICH partition is shown.
    for (const [index, dimension] of report.table.dimensions.entries())
      expect(report.table.rowSums[index]).toBeCloseTo(report.dimensions[dimension].distance, 9);
    expect(report.table.residual).toBeLessThanOrEqual(1e-12 * report.table.total);
  });

  it('reports the ⊥ length as a fraction of the WINDOW, not summed over the parts', () => {
    // Both parts read ⊥ over the same interval — an `<asynchrony>` with no usable offset
    // NaN-poisons its span (AD-33.1) — so one bar of the window is unreadable, not two.
    const poisoned = '<asynchronyMap><asynchrony date="0.0"/></asynchronyMap>';
    const usable =
      '<asynchronyMap><asynchrony date="0.0" milliseconds.offset="30.0"/></asynchronyMap>';
    const report = compare({
      a: doc('', part(1, poisoned) + part(2, poisoned)),
      b: doc('', part(1, usable) + part(2, usable)),
      window,
    });
    expect(report.dimensions.asynchrony.bottomLengthQuarters).toBeCloseTo(4, 9);
  });

  it('flags a suspect pair when the two documents differ in length by more than a factor of two (C7)', () => {
    const short = doc('<tempoMap><tempo date="0.0" bpm="60" beatLength="0.25"/></tempoMap>');
    const long = doc(
      '<tempoMap><tempo date="0.0" bpm="60" beatLength="0.25"/>' +
        '<tempo date="14400.0" bpm="90" beatLength="0.25"/></tempoMap>',
    );
    const report = compare({ a: short, b: long });
    expect(report.comparability.suspectPair).toBe(true);
    expect(report.notes.some((candidate) => candidate.kind === 'length-mismatch')).toBe(true);
  });

  it('reports a plausibility band violation without moving the distance (C6)', () => {
    // §5.0's own motivating case: `@beatLength` written in TICKS makes the resolved qbpm absurd.
    const hofmann = doc('<tempoMap><tempo date="0.0" bpm="9000" beatLength="0.25"/></tempoMap>');
    const ordinary = doc(tempoMap(60));
    const report = compare({ a: hofmann, b: ordinary, window });
    const plausibility = report.notes.filter((candidate) => candidate.kind === 'plausibility');
    expect(plausibility).toHaveLength(1);
    expect(plausibility[0].site?.attribute).toBe('bpm');
    expect(plausibility[0].site?.container).toBe('tempoMap');
    expect(plausibility[0].document).toBe('a');
    // The distance is what it was: the band is a finding, never a repair.
    expect(report.dimensions.tempo.distance).toBeGreaterThan(0);
  });

  it('exports a profile only when asked, and caps its step (C1)', () => {
    const options = { a: doc(tempoMap(60)), b: doc(tempoMap(90)), window };
    expect(compare(options).profiles).toBeNull();
    const profiled = compare({
      ...options,
      profile: { dimensions: ['tempo'], grid: { step: 0.5 } },
    });
    expect(profiled.profiles?.tempo.dates).toHaveLength(9);
    expect(profiled.profiles?.tempo.density[0]).toBeCloseTo(
      Math.abs(Math.log(60 / 90)) / Math.log(1.025),
      6,
    );
    expect(profiled.profiles?.tempo.valueA?.[0]).toBeCloseTo(Math.log(60), 12);
    // A dimension not requested still has an entry, so the record is total over the vocabulary.
    expect(profiled.profiles?.pedal.dates).toHaveLength(0);
  });

  it('sums the profile density over the part scopes, as the mass is summed', () => {
    const twoParts = (bpm: number) => doc(tempoMap(bpm), part(1, '') + part(2, ''));
    const profiled = compare({
      a: twoParts(60),
      b: twoParts(90),
      window,
      profile: { dimensions: ['tempo'], grid: { step: 1 } },
    });
    // Two parts inherit one global map, so `p_tempo(t)` is twice one part's — the same
    // additivity `d_k` has, and the reason a covering-cell lookup would be wrong here.
    expect(profiled.profiles?.tempo.density[0]).toBeCloseTo(
      (2 * Math.abs(Math.log(60 / 90))) / Math.log(1.025),
      6,
    );
    // The two parts carry the SAME resolved curve, so the shared T-space curve is exported.
    expect(profiled.profiles?.tempo.valueA?.[0]).toBeCloseTo(Math.log(60), 12);
  });

  it('withholds the T-space curves where the parts genuinely carry different ones', () => {
    const profiled = compare({
      a: doc('', part(1, tempoMap(60)) + part(2, tempoMap(120))),
      b: doc('', part(1, tempoMap(90)) + part(2, tempoMap(90))),
      window,
      profile: { dimensions: ['tempo'], grid: { step: 1 } },
    });
    // There is no single curve to export and picking the first part's would be a claim about
    // the piece the document does not make; the DENSITY is still there, summed over the parts.
    expect(profiled.profiles?.tempo.valueA).toBeNull();
    expect(profiled.profiles?.tempo.density[0]).toBeGreaterThan(0);
  });

  it('carries the epsilon record in both units (AD-28.2)', () => {
    const report = compare({ a: doc(tempoMap(60)), b: doc(tempoMap(90)), window });
    expect(report.inputs.epsilon.tempo.jnd).toBeGreaterThan(report.inputs.epsilon.tempo.relative);
    expect(report.inputs.epsilon.step).toEqual({ relative: 0, jnd: 0 });
  });

  it('echoes the resolved settings and never the documents (A12)', () => {
    const report = compare({ a: doc(tempoMap(60)), b: doc(tempoMap(90)), window });
    expect(Object.keys(report.inputs.settings).sort()).toEqual([
      'invariance',
      'jnd',
      'noteDensityWeight',
      'plausibleRange',
      'weights',
      'window',
    ]);
    expect(JSON.stringify(report.inputs.settings)).not.toContain('tempoMap');
    expect(report.inputs.settings.weights.tempo).toBe(1);
    expect(report.inputs.settings.window).toEqual({ start: 0, end: 4 });
  });

  it('applies a jnd override to the row it names, and to nothing else', () => {
    const options = { a: doc(tempoMap(60)), b: doc(tempoMap(90)), window };
    const base = compare(options).dimensions.tempo.distance;
    const halved = compare({ ...options, jnd: { 'tempo/tempo@bpm': Math.log(1.025) / 2 } })
      .dimensions.tempo.distance;
    expect(halved).toBeCloseTo(2 * base, 6);
    expect(compare({ ...options, jnd: { 'tempo/tempo@bpm': Math.log(1.025) / 2 } }).inputs.jnd[
      'tempo/tempo@bpm'
    ]).toBeCloseTo(Math.log(1.025) / 2, 12);
  });

  it('excludes a zero-weight dimension from D while still reporting it (§7.3)', () => {
    const both =
      '<tempoMap><tempo date="0.0" bpm="60" beatLength="0.25"/></tempoMap>' +
      '<asynchronyMap><asynchrony date="0.0" milliseconds.offset="0.0"/></asynchronyMap>';
    const other =
      '<tempoMap><tempo date="0.0" bpm="60" beatLength="0.25"/></tempoMap>' +
      '<asynchronyMap><asynchrony date="0.0" milliseconds.offset="90.0"/></asynchronyMap>';
    const options = { a: doc(both), b: doc(other), window };
    const full = compare(options);
    const zeroed = compare({
      ...options,
      weights: { ...defaultWeights(), asynchrony: 0 },
    });
    expect(zeroed.dimensions.asynchrony.distance).toBe(full.dimensions.asynchrony.distance);
    expect(zeroed.dimensions.asynchrony.distance).toBeGreaterThan(0);
    expect(zeroed.aggregate.distance).toBe(0);
  });

  it('reproduces d_k by integrating the density over the window (the row sums’ authority)', () => {
    const report = compare({
      a: doc('<tempoMap><tempo date="0.0" bpm="60" beatLength="0.25"/></tempoMap>'),
      b: doc('<tempoMap><tempo date="0.0" bpm="90" beatLength="0.25"/></tempoMap>'),
      window,
    });
    const index = report.table.dimensions.indexOf('tempo');
    expect(report.table.rowSums[index]).toBeCloseTo(report.dimensions.tempo.distance, 12);
    // 4 quarters of |ln(60/90)| over the tempo JND.
    expect(report.dimensions.tempo.distance).toBeCloseTo(
      (4 * Math.abs(Math.log(60 / 90))) / Math.log(1.025),
      9,
    );
  });
});

/** Every node of a plain-data value, with a path — §9.6's walker in miniature. */
function* walk(value: unknown, path = '$'): Generator<[string, unknown]> {
  yield [path, value];
  if (value === null || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    for (const [index, item] of value.entries()) yield* walk(item, `${path}[${String(index)}]`);
    return;
  }
  for (const [key, item] of Object.entries(value)) yield* walk(item, `${path}.${key}`);
}
