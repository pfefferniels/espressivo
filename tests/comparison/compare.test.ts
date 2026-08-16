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
import {
  compareInterior,
  SUSPECT_LENGTH_RATIO,
  type InteriorCompareOptions,
} from '../../src/comparison/compare.js';
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
   * pair-derived 198, and this score has THREE parts, each of which inherits the global
   * `tempoMap` and each of which the renderer performs — so §5.0's sum over the score's parts
   * counts the same deviation once per part, which is what `renderParts` does (AD-55.2).
   *
   * The aggregate figures moved at AD-55.1 and the whole of the move is articulation's: the
   * `<style>@defaultArticulation` step function became the second component of `d_articulation`
   * (`1904 = 2004 − 100` on this pair), and the scope count is unchanged because this MSM names
   * exactly the three parts the MPM declares.
   */
  it('pins the aggregate and the tempo row', () => {
    expect(baroqueRomantic.aggregate.distance).toBeCloseTo(8397.60102, 4);
    expect(baroqueRomantic.aggregate.mean).toBeCloseTo(41.164710882, 6);
    expect(baroqueRomantic.dimensions.tempo.distance).toBeCloseTo(1755.4706259, 4);
    expect(baroqueRomantic.dimensions.articulation.distance).toBeCloseTo(2004, 9);
    expect(baroqueFast.aggregate.distance).toBeCloseTo(24941.0626073, 4);
    expect(fastRomantic.aggregate.distance).toBeCloseTo(26174.7195808, 4);
    // The multiplier the numbers above carry, stated rather than left to be inferred (AD-55.2).
    expect(baroqueRomantic.scopes).toEqual({ rule: 'msm', count: 3 });
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
    const performed = [...performMsm({ msm, mpm }).matchAll(/<note\b[^>]*>/g)].map(
      (match) => /\svelocity="([^"]*)"/.exec(match[0])?.[1],
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

  /**
   * AD-55.2: the per-part sum counts what PERFORMS, and only a score can say what that is.
   *
   * AD-53.2 ratified the sum with the justification that "the per-part sum counts what is
   * performed". It counted MPM `<part>` elements instead, and the two are not the same thing:
   * `renderParts` iterates the MSM's parts, so an MPM `<part>` the score never names performs
   * nothing at all. Adding three empty ones to both documents tripled `D` while the performed
   * MSMs stayed byte-identical — two pairs that perform the same, scored 3× apart.
   */
  describe('the per-part sum counts rendered MSM parts (AD-55.2)', () => {
    const window = { start: 0, end: 4 };
    const globalOnly = (bpm: number) => doc(tempoMap(bpm));
    const withEmptyParts = (bpm: number, k: number) =>
      doc(
        tempoMap(bpm),
        Array.from({ length: k }, (_value, index) => part(index + 1, '')).join(''),
      );

    const scoreOf = (partCount: number) =>
      `<?xml version="1.0" encoding="UTF-8"?>` +
      `<msm xmlns="http://www.cemfi.de/msm/ns/1.0" title="t" pulsesPerQuarter="720">` +
      `<global><dated/></global>${Array.from(
        { length: partCount },
        (_value, index) =>
          `<part name="p${String(index + 1)}" number="${String(index + 1)}" ` +
          `midi.channel="${String(index)}" midi.port="0"><dated><score>` +
          `<note xml:id="n${String(index)}" date="0.0" midi.pitch="60.0" duration="2880.0"/>` +
          `</score></dated></part>`,
      ).join('')}</msm>`;

    it('the RENDERER ignores an MPM part the score does not name (measured)', () => {
      const score = scoreOf(1);
      const performed = [0, 1, 2, 3].map((k) =>
        performMsm({ msm: score, mpm: withEmptyParts(60, k) }),
      );
      // Byte-identical: the empty <part> elements reach no note, so any k that moved a
      // distance would be moving a number the performance does not carry.
      for (const rendered of performed) expect(rendered).toBe(performed[0]);
    });

    it('scores k = 0..3 empty MPM parts identically when the MSM names one part', () => {
      const score = scoreOf(1);
      const distances = [0, 1, 2, 3].map(
        (k) =>
          compare({
            a: withEmptyParts(60, k),
            b: withEmptyParts(90, k),
            window,
            msm: parseMsmRoot(score),
          }).dimensions.tempo.distance,
      );
      for (const distance of distances) expect(distance).toBeCloseTo(distances[0], 12);
      expect(distances[0]).toBeCloseTo(
        compare({ a: globalOnly(60), b: globalOnly(90), window, msm: parseMsmRoot(score) })
          .dimensions.tempo.distance,
        12,
      );
      expect(distances[0]).toBeGreaterThan(0);
    });

    it('counts one scope per rendered MSM part, three parts three times', () => {
      const one = compare({
        a: globalOnly(60),
        b: globalOnly(90),
        window,
        msm: parseMsmRoot(scoreOf(1)),
      });
      const three = compare({
        a: globalOnly(60),
        b: globalOnly(90),
        window,
        msm: parseMsmRoot(scoreOf(3)),
      });
      // Three score parts all inheriting the one global map: the renderer performs the same
      // deviation in each of them, so the sum counts it three times — and this time the 3 is
      // the score's, not an artifact of two empty elements in the MPM.
      expect(three.dimensions.tempo.distance).toBeCloseTo(3 * one.dimensions.tempo.distance, 9);
      expect(three.scopes).toEqual({ rule: 'msm', count: 3 });
      expect(one.scopes).toEqual({ rule: 'msm', count: 1 });
    });

    it('falls back to the MPM count with an estimate-degradation note when no MSM is given', () => {
      const report = compare({ a: withEmptyParts(60, 3), b: withEmptyParts(90, 3), window });
      expect(report.scopes).toEqual({ rule: 'mpm', count: 3 });
      const degradations = report.notes.filter(
        (note) => note.kind === 'estimate-degradation' && note.message.includes('per-part sum'),
      );
      expect(degradations).toHaveLength(1);
      // Global-only on both sides is §5.0's single evaluation, and it says so too.
      expect(compare({ a: globalOnly(60), b: globalOnly(90), window }).scopes).toEqual({
        rule: 'global',
        count: 1,
      });
    });

    it('matches a score part to an MPM part by @number, then by @name (getCorrespondingPart)', () => {
      // The MPM's only part is numbered 7 and named `p1`; the score's part 1 is named `p1`, so
      // the renderer's SECOND lookup is the one that has to fire and its tempoMap is what
      // performs. A number-only match would leave the part on the global map and score 0.
      const named = doc(tempoMap(60), part(7, tempoMap(120)).replace('name="p7"', 'name="p1"'));
      const report = compare({
        a: named,
        b: doc(tempoMap(60)),
        window,
        msm: parseMsmRoot(scoreOf(1)),
      });
      expect(report.scopes).toEqual({ rule: 'msm', count: 1 });
      expect(report.dimensions.tempo.distance).toBeCloseTo(
        (4 * Math.abs(Math.log(120 / 60))) / Math.log(1.025),
        6,
      );
    });
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

  it('flags a suspect pair when the two documents differ in length by more than C7’s band', () => {
    const short = doc('<tempoMap><tempo date="0.0" bpm="60" beatLength="0.25"/></tempoMap>');
    const long = doc(
      '<tempoMap><tempo date="0.0" bpm="60" beatLength="0.25"/>' +
        '<tempo date="14400.0" bpm="90" beatLength="0.25"/></tempoMap>',
    );
    const report = compare({ a: short, b: long });
    expect(report.comparability.suspectPair).toBe(true);
    expect(report.notes.some((candidate) => candidate.kind === 'length-mismatch')).toBe(true);
  });

  /**
   * W3 MAJOR-7: the constant is §5.0's documented band and neither number was pinned.
   *
   * `[0.8, 1.25]` on `long/short` is `short/long < 0.8`, and what shipped was `0.5` — so a 1.67×
   * mismatch, which is a different piece by any reading, passed silently. The two probes below
   * straddle the band, and they would BOTH have passed unflagged under the old constant.
   */
  it('puts C7’s band at §5.0’s [0.8, 1.25], not at a factor of two (MAJOR-7)', () => {
    expect(SUSPECT_LENGTH_RATIO).toBe(0.8);
    const until = (ticks: number) =>
      doc(
        '<tempoMap><tempo date="0.0" bpm="60" beatLength="0.25"/>' +
          `<tempo date="${String(ticks)}.0" bpm="90" beatLength="0.25"/></tempoMap>`,
      );
    // 720/1440 = 0.50 and 720/1200 = 0.60: both inside the old 0.5 threshold, both outside
    // the documented band.
    expect(compare({ a: until(720), b: until(1440) }).comparability.suspectPair).toBe(true);
    expect(compare({ a: until(720), b: until(1200) }).comparability.suspectPair).toBe(true);
    // 720/840 = 0.857 is inside the band and stays quiet.
    expect(compare({ a: until(720), b: until(840) }).comparability.suspectPair).toBe(false);
  });

  /**
   * W3 CAPITAL-5: C7's SECOND arm — "the same check against the score end when an MSM is
   * supplied" — had no code at all.
   *
   * It is the arm that matters most, because the MSM is also where the window comes from: the
   * Telemann MPM (last date 198 quarters) against the Vulpius MSM (score end 54) was compared
   * over 54 quarters, discarding 73 % of the piece, and the report said nothing.
   */
  it('flags a score whose end does not match the documents, the hazard C7 was adopted for', () => {
    const mismatched = compare({
      a: TELEMANN,
      performanceA: 'Baroque',
      performanceB: 'Fast',
      msm: parseMsmRoot(VULPIUS_MSM),
    });
    expect(mismatched.window.rule).toBe('msm');
    expect(mismatched.window.endQuarters).toBeCloseTo(54, 6);
    expect(mismatched.comparability.lastDateA).toBeCloseTo(198, 6);
    expect(mismatched.comparability.suspectPair).toBe(true);
    const fired = mismatched.notes.filter((candidate) => candidate.kind === 'length-mismatch');
    expect(fired).toHaveLength(1);
    expect(fired[0].message).toContain('score end');

    // The pair's OWN length ratio is exactly 1 here — the two performances are the same
    // document — so nothing but the score arm can be firing.
    expect(mismatched.comparability.lengthRatio).toBe(1);
    // And the matched score is quiet.
    const matched = compare({
      a: TELEMANN,
      performanceA: 'Baroque',
      performanceB: 'Fast',
      msm: parseMsmRoot(TELEMANN_MSM),
    });
    expect(matched.comparability.suspectPair).toBe(false);
    expect(matched.notes.some((candidate) => candidate.kind === 'length-mismatch')).toBe(false);
  });

  /**
   * W3 CAPITAL-4: AD-51.1's ruled report field existed only on the internal `SegmentPass`.
   *
   * Empty is the right answer for every document this engine can produce — AD-51.1's extension
   * wired a pointwise density into all seven cell-bearing dimensions — and that is exactly why
   * it has to be present: a reader can then tell "no boundary is approximate" from "nobody
   * checked". The mechanism behind it is exercised at `segmentPass` (`aggregate.test.ts`).
   */
  /**
   * W3 MINOR-1: a mass is non-negative, and this one was not.
   *
   * §7.3's remainder is computed by SUBTRACTION from the row total — the right choice, because
   * it is what makes the table close exactly — so it inherits the root refinement's quadrature
   * error with the opposite sign. It measured `−1.825996` on telemann Baroque|Fast against a `D`
   * of 22357, an impossible value in a caller-visible field that P-C11's walker cannot see
   * because a negative mass is finite. Clamped, with the magnitude reported instead of thrown
   * away.
   */
  it('clamps the remainder mass at 0 and reports what it clamped (MINOR-1)', () => {
    const pairs = [
      ['Baroque', 'Fast'],
      ['Fast', 'Romantic'],
      ['Baroque', 'Romantic'],
    ] as const;
    let sawUnderflow = false;
    for (const [a, b] of pairs) {
      const report = compare({
        a: TELEMANN,
        performanceA: a,
        performanceB: b,
        msm: parseMsmRoot(TELEMANN_MSM),
      });
      expect(report.remainder.mass).toBeGreaterThanOrEqual(0);
      expect(report.remainder.quadratureUnderflow).toBeGreaterThanOrEqual(0);
      // Tiny against the number it belongs to — this is the conditioning of the segmentation,
      // not a missing mass.
      expect(report.remainder.quadratureUnderflow).toBeLessThan(1e-3 * report.aggregate.distance);
      if (report.remainder.quadratureUnderflow > 0) sawUnderflow = true;
    }
    // Non-vacuity: the underflow really occurs on this corpus, so the clamp is doing work.
    expect(sawUnderflow).toBe(true);
  });

  /**
   * W3 MAJOR-12: §9.1's `inert-difference` kind was emitted from exactly ONE site.
   *
   * §10 names it as a fixture obligation — "two documents differing only in a trailing
   * `@transition.to` ⇒ `d_tempo = 0` plus an inert-difference note; same for dynamics and for a
   * single-`<movement>` map" — and all three were arriving as `structural`, which is the channel
   * for a difference that IS performed but is not a magnitude. The distinction matters to a
   * reader deciding whether a zero means "nothing to see" or "something written that nothing
   * reads".
   */
  it('files an attribute the renderer never applies as inert-difference (§9.1, AD-8)', () => {
    const trailing = (transition: string) =>
      doc(
        `<tempoMap><tempo date="0.0" bpm="60" beatLength="0.25"/>` +
          `<tempo date="2880.0" bpm="90" beatLength="0.25"${transition}/></tempoMap>`,
      );
    // The trailing instruction's span runs to MAX_VALUE and `getEndDate` collapses it, so the
    // `@transition.to` is read and never applied: distance 0, and a note that says so.
    const report = compare({ a: trailing(''), b: trailing(' transition.to="40"'), window });
    expect(report.dimensions.tempo.distance).toBe(0);
    const inert = report.notes.filter((note) => note.kind === 'inert-difference');
    expect(inert.length).toBeGreaterThan(0);
    expect(inert.every((note) => note.dimension === 'tempo')).toBe(true);
    // Non-vacuity: the same attribute on a NON-trailing instruction is live and priced, so the
    // kind is about the position and not about the attribute name.
    const live = compare({
      a: doc(
        '<tempoMap><tempo date="0.0" bpm="60" beatLength="0.25"/>' +
          '<tempo date="2880.0" bpm="90" beatLength="0.25"/></tempoMap>',
      ),
      b: doc(
        '<tempoMap><tempo date="0.0" bpm="60" beatLength="0.25" transition.to="90"/>' +
          '<tempo date="2880.0" bpm="90" beatLength="0.25"/></tempoMap>',
      ),
      window,
    });
    expect(live.dimensions.tempo.distance).toBeGreaterThan(0);
  });

  /**
   * §10's P-C8 and §5.0's global-vs-part-local rule — one fact, two spellings, and neither had
   * any code (W3 MAJOR-13, MAJOR-15).
   *
   * Both say: the distance is exactly 0 AND a structural note fires, because the two documents
   * encode the same performance differently. The zero was right; the note was missing, and
   * without it a caller cannot tell "encoded the same" from "encoded differently and performed
   * the same" — which is the difference a diff product exists to report.
   */
  describe('the encoding differs and the performance does not (P-C8, §5.0)', () => {
    const encodingNotesOf = (a: string, b: string) =>
      compare({ a, b, window }).notes.filter((note) =>
        note.message.includes('encode this dimension'),
      );

    it('reports an explicit neutral instruction against an absent map (P-C8)', () => {
      const neutralRubato =
        '<rubatoMap><rubato date="0.0" frameLength="720.0" intensity="1.0" lateStart="0.0" ' +
        'earlyEnd="1.0"/><rubato date="2880.0" frameLength="720.0"/></rubatoMap>';
      const neutralAsync =
        '<asynchronyMap><asynchrony date="0.0" milliseconds.offset="0.0"/></asynchronyMap>';
      for (const [dimension, map] of [
        ['rubato', neutralRubato],
        ['asynchrony', neutralAsync],
      ] as const) {
        const report = compare({ a: doc(tempoMap(60) + map), b: doc(tempoMap(60)), window });
        // Exactly 0 — §5.2's special case (M18), not merely close.
        expect(Object.is(report.dimensions[dimension].distance, 0)).toBe(true);
        const fired = report.notes.filter(
          (note) => note.dimension === dimension && note.message.includes('encode this dimension'),
        );
        expect(fired, `${dimension}: P-C8's note half`).toHaveLength(1);
      }
    });

    it('reports a global map against an identical part-local one (§5.0)', () => {
      // The renderer resolves both to the same curve — `resolvePartMaps` returns the part's own
      // map where it has one and the global map where it does not — so nothing is performed
      // differently and the difference is an encoding one.
      const fired = encodingNotesOf(doc(tempoMap(60)), doc('', part(1, tempoMap(60))));
      expect(fired).toHaveLength(1);
      expect(fired[0].dimension).toBe('tempo');
      expect(fired[0].message).toContain('part-local');
    });

    it('says nothing when the encodings agree, or when the distance is not 0', () => {
      // Two controls, because a note that fires on every pair would be worse than no note.
      expect(encodingNotesOf(doc(tempoMap(60)), doc(tempoMap(60)))).toHaveLength(0);
      expect(encodingNotesOf(doc(tempoMap(60)), doc(tempoMap(90)))).toHaveLength(0);
    });
  });

  it('surfaces cellQuantizedDimensions, and it is empty because the samplers are wired', () => {
    const report = compare({
      a: TELEMANN,
      performanceA: 'Baroque',
      performanceB: 'Romantic',
      msm: parseMsmRoot(TELEMANN_MSM),
    });
    expect(report.cellQuantizedDimensions).toEqual([]);
    expect(Object.keys(report)).toContain('cellQuantizedDimensions');
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
    expect(
      compare({ ...options, jnd: { 'tempo/tempo@bpm': Math.log(1.025) / 2 } }).inputs.jnd[
        'tempo/tempo@bpm'
      ],
    ).toBeCloseTo(Math.log(1.025) / 2, 12);
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
