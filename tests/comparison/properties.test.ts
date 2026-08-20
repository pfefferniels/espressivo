/**
 * P-C2 and P-C11 at the facade — the two properties that are about the REPORT rather than about
 * a number in it.
 *
 * **P-C2 (symmetry)** is asserted on `JSON.stringify` with no replacer and no indentation,
 * because that is what §9.5 pins: "bit-identical output modulo the explicit swap/negation map".
 * Comparing distances alone would miss an asymmetric segment ranking, an asymmetric note order
 * or a field that carries a document's identity without swapping — and the swap map is written
 * out here as CODE, so a future field that needs mirroring fails this test instead of quietly
 * breaking the promise.
 *
 * **P-C11 (finiteness)** walks every number of every result over the whole vendored corpus and
 * the degenerate shapes §9.6 names, through the same discipline `tests/api/plain-data.test.ts`
 * applies to the other two facades: finite or `null`, never `NaN`, never `Infinity`, never
 * `undefined`.
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
  COMPARISON_DIMENSIONS,
} from '../../src/api/index.js';
import type { ComparisonNote, ComparisonReport } from '../../src/api/index.js';
import { compareNotes } from '../../src/comparison/compare.js';
import { elementAt, pairwise } from '../../src/prelude/index.js';

/**
 * `record[key]`, checked — a `Record<string, T>` lookup is `T | undefined` under the flag.
 *
 * The keys here are all `COMPARISON_DIMENSIONS` members, so a miss means the report is missing
 * a dimension the registry declares, which is the failure worth naming.
 */
const recordAt = <T>(record: Record<string, T>, key: string, what: string): T => {
  const value = record[key];
  if (value === undefined) throw new Error(`${what} has no entry for ${key}`);
  return value;
};

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');
const fixture = (name: string) => readFileSync(join(FIXTURES, `${name}.mpm`), 'utf-8');
const score = (name: string) => readFileSync(join(FIXTURES, `${name}.msm`), 'utf-8');

const TELEMANN = fixture('telemann-grave');
const VULPIUS = fixture('vulpius-die-helle-sonn');
const ALBERT = fixture('albert-du-mein-einzig-licht');
const BACH = fixture('bach-bwv1007-minuet2');
const ALLER_AUGEN = fixture('aller-augen');
const MINIMAL = fixture('minimal');

const NS = 'http://www.cemfi.de/mpm/ns/1.0';

// ---------------------------------------------------------------------------
// §9.5's swap / negation map, written out
// ---------------------------------------------------------------------------

type Mutable = Record<string, unknown>;

/**
 * The mirror of a report: what `compare(b, a)` must serialize to, given `compare(a, b)`.
 *
 * Three kinds of field and they are NOT the same operation (§9.5): a pair of fields SWAPS, a
 * signed descriptor NEGATES, and a ratio INVERTS. Writing them out is the point — the map is
 * the contract, and a field added without a rule here fails the test rather than the promise.
 */
function mirror(report: ComparisonReport): ComparisonReport {
  const copy = structuredClone(report) as unknown as Mutable;

  swap(copy.ppq as Mutable, 'a', 'b');
  swap((copy.ppq as Mutable).unusableDeclaration as Mutable, 'a', 'b');

  for (const part of copy.parts as Mutable[]) {
    swap(part, 'numberA', 'numberB');
    swap(part, 'nameA', 'nameB');
  }

  const comparability = copy.comparability as Mutable;
  swap(comparability, 'lastDateA', 'lastDateB');
  swap(comparability, 'ppqA', 'ppqB');
  swap(comparability, 'partCountA', 'partCountB');
  swap(comparability, 'instructionCountA', 'instructionCountB');

  for (const dimension of COMPARISON_DIMENSIONS) {
    const entry = recordAt(
      copy.dimensions as Record<string, Mutable>,
      dimension,
      'the report’s dimensions',
    );
    swap(entry.events as Mutable, 'unmatchedA', 'unmatchedB');
    entry.meanSigned = negate(entry.meanSigned);
    const decomposition = entry.decomposition as Mutable | null;
    if (decomposition !== null) decomposition.levelSigned = negate(decomposition.levelSigned);
  }

  for (const segment of copy.segments as Mutable[]) {
    segment.meanSigned = negate(segment.meanSigned);
    segment.direction =
      segment.direction === 'a-greater'
        ? 'b-greater'
        : segment.direction === 'b-greater'
          ? 'a-greater'
          : 'mixed';
  }

  const drift = copy.cumulativeDrift as Mutable | null;
  if (drift !== null) {
    swap(drift, 'secondsA', 'secondsB');
    drift.difference = negate(drift.difference);
    // §9.5 says the ratio INVERTS, which is true of the real number and NOT of the double:
    // `1/(a/b)` and `b/a` differ by ulps, measured at 2 on the Albert pair
    // (1.0439297220611783 against 1.0439297220611785). So the mirror takes the quotient of the
    // SWAPPED seconds, which is the same permutation of the same fields and is what the engine
    // computes — the inversion is the statement, the quotient is the arithmetic.
    drift.ratio = (drift.secondsA as number) / (drift.secondsB as number);
  }

  const profiles = copy.profiles as Record<string, Mutable> | null;
  if (profiles !== null)
    for (const dimension of COMPARISON_DIMENSIONS) {
      const profile = recordAt(profiles, dimension, 'the report’s per-dimension profiles');
      swap(profile, 'valueA', 'valueB');
      profile.signed = (profile.signed as number[]).map((value) => negate(value));
    }

  // The document ROLE swaps, on notes and on the sites they carry — and the note order is a
  // function of that role (§9.5), so the array is re-sorted rather than left where the swap put
  // it. Sorting is what a stable order MEANS here; leaving it would leak the orientation.
  const notes = (copy.notes as Mutable[]).map((note): Mutable => {
    const site = note.site as Mutable | null;
    if (site !== null) site.document = swapRole(site.document);
    return { ...note, document: swapRole(note.document) };
  });
  // The ENGINE's comparator, not a copy of it. A copy was what let W3 MAJOR-6 hide: the two
  // drifted, the engine's was not total, and this re-sort tidied the difference away. Using the
  // real one makes the re-sort what it claims to be — the swap map applied — and leaves the
  // comparator's totality to the dedicated test that can actually see it.
  copy.notes = notes.sort((x, y) =>
    compareNotes(x as unknown as ComparisonNote, y as unknown as ComparisonNote),
  );

  return copy as unknown as ComparisonReport;
}

function swap(target: Mutable, first: string, second: string): void {
  const held = target[first];
  target[first] = target[second];
  target[second] = held;
}

/** `-0` is normalized on the way out, exactly as the facade does at its own boundary. */
function negate(value: unknown): unknown {
  if (typeof value !== 'number') return value;
  const negated = -value;
  return negated === 0 ? 0 : negated;
}

function swapRole(role: unknown): unknown {
  return role === 'a' ? 'b' : role === 'b' ? 'a' : role;
}

// ---------------------------------------------------------------------------
// P-C2
// ---------------------------------------------------------------------------

interface Pair {
  readonly name: string;
  readonly a: string;
  readonly b?: string;
  readonly performanceA?: string;
  readonly performanceB?: string;
  readonly msm?: string;
}

const PAIRS: readonly Pair[] = [
  {
    name: 'Telemann Baroque vs Fast, with its score',
    a: TELEMANN,
    performanceA: 'Baroque',
    performanceB: 'Fast',
    msm: score('telemann-grave'),
  },
  {
    name: 'Telemann Baroque vs Romantic, without a score',
    a: TELEMANN,
    performanceA: 'Baroque',
    performanceB: 'Romantic',
  },
  {
    name: 'Vulpius Romantic vs Amateur — three dimensions at exactly 0',
    a: VULPIUS,
    performanceA: 'Romantic',
    performanceB: 'Amateur',
    msm: score('vulpius-die-helle-sonn'),
  },
  {
    name: 'Albert — an expressive reading against a deadpan one, two documents',
    a: ALBERT,
    performanceA: 'Axel Berndt',
    performanceB: 'Like a robot',
  },
  {
    name: 'a real document against the documented neutral baseline (C8)',
    a: VULPIUS,
    b: neutralMpm({ ppq: 480 }),
    performanceA: 'Baroque',
  },
  {
    name: 'two documents at different tick grids — 720 against 480',
    a: TELEMANN,
    b: VULPIUS,
    performanceA: 'Baroque',
    performanceB: 'Baroque',
  },
  // W3 MAJOR-17. Every pair above is either a same-document pair or one whose event dimensions
  // never reach an equal-cost tie, and the alignment DP's tie-break asymmetry appeared only on
  // CROSS-document pairs with real articulation on both sides: `events` read `[0, 35, 396]` one
  // way and `[18, 378, 17]` the other, with `segments[].peak` differing at identical mass. A
  // corpus can contain a hazard without reaching it (AD-50.3's lesson), so the two the verifier
  // found are here by name.
  {
    name: 'Aller Augen against Bach — cross-document, articulation on both sides',
    a: ALLER_AUGEN,
    b: BACH,
    performanceA: 'My Performance',
    performanceB: 'like Heinrich Schiff',
  },
  {
    name: 'Albert against Bach — cross-document, an id-anchored articulation map on one side',
    a: ALBERT,
    b: BACH,
    performanceA: 'Axel Berndt',
    performanceB: 'like Heinrich Schiff',
  },
];

describe('P-C2: compare(a, b) and compare(b, a) serialize identically modulo §9.5’s map', () => {
  for (const pair of PAIRS)
    it(pair.name, () => {
      const forward = compareMpm({
        a: pair.a,
        b: pair.b,
        performanceA: pair.performanceA,
        performanceB: pair.performanceB,
        msm: pair.msm,
        profile: { dimensions: ['tempo', 'dynamics'], grid: { step: 1 } },
      }).report;
      const reverse = compareMpm({
        a: pair.b ?? pair.a,
        b: pair.b === undefined ? undefined : pair.a,
        performanceA: pair.b === undefined ? pair.performanceB : pair.performanceB,
        performanceB: pair.b === undefined ? pair.performanceA : pair.performanceA,
        msm: pair.msm,
        profile: { dimensions: ['tempo', 'dynamics'], grid: { step: 1 } },
      }).report;

      expect(JSON.stringify(mirror(reverse))).toBe(JSON.stringify(forward));
    });

  it('is not vacuous: the un-mirrored reverse really does differ', () => {
    const options = {
      a: TELEMANN,
      performanceA: 'Baroque',
      performanceB: 'Fast',
      msm: score('telemann-grave'),
    };
    const forward = compareMpm(options).report;
    const reverse = compareMpm({
      ...options,
      performanceA: 'Fast',
      performanceB: 'Baroque',
    }).report;
    expect(JSON.stringify(reverse)).not.toBe(JSON.stringify(forward));
    expect(JSON.stringify(mirror(reverse))).toBe(JSON.stringify(forward));
  });

  /**
   * W3 MAJOR-6: the note comparator has to be TOTAL, and P-C2 above cannot tell.
   *
   * §9.5 names `site` among the note keys and the comparator did not use it, so four Albert
   * notes — one plausibility finding raised in the global scope and in each of three part
   * scopes — tied on every key with four distinct serializations, and their relative order was
   * decided by sort stability, i.e. by which document was read first. P-C2 is blind to it
   * because the mirror re-sorts with the same comparator: a partial order tidies its own
   * ambiguity away. So this is the direct statement instead — two notes compare equal only if
   * they ARE equal.
   */
  it('orders the notes TOTALLY: comparing equal implies being equal', () => {
    for (const pair of PAIRS) {
      const report = compareMpm({
        a: pair.a,
        b: pair.b,
        performanceA: pair.performanceA,
        performanceB: pair.performanceB,
        msm: pair.msm,
      }).report;
      for (const [x, y] of pairwise(report.notes)) {
        if (compareNotes(x, y) !== 0) continue;
        expect(JSON.stringify(x), `${pair.name}: two distinct notes compare equal`).toBe(
          JSON.stringify(y),
        );
      }
      // Sorted, and by THIS comparator — an array in some other order would make the check above
      // vacuous, since it only inspects adjacent pairs.
      for (const [x, y] of pairwise(report.notes))
        expect(compareNotes(x, y)).toBeLessThanOrEqual(0);
    }
  });

  it('separates the four Albert notes that differ only in their SITE', () => {
    // The concrete case: one `@transition.to` outside its plausible band, reported once for the
    // global scope and once for each of three parts. Same kind, same dimension, same date, same
    // document, same message — and four different sites.
    const report = compareMpm({
      a: ALBERT,
      performanceA: 'Axel Berndt',
      performanceB: 'Like a robot',
    }).report;
    const sameMessage = report.notes.filter(
      (note) =>
        note.kind === 'plausibility' &&
        note.message ===
          report.notes.find((candidate) => candidate.kind === 'plausibility')?.message,
    );
    expect(sameMessage.length).toBeGreaterThan(1);
    const sites = new Set(sameMessage.map((note) => JSON.stringify(note.site)));
    expect(sites.size).toBe(sameMessage.length);
    for (const [x, y] of pairwise(sameMessage)) expect(compareNotes(x, y)).toBeLessThan(0);
  });

  /**
   * W3 MAJOR-9: §9.5's "key order is pinned (A9)" had no test.
   *
   * The two tests that touched key sets `.sort()`ed them first — which checks membership and
   * says nothing about order — and P-C2 compares the engine against itself, so a record built
   * by document traversal would serialize identically both ways and still break the promise.
   * The top-level order is written out here as data; the per-dimension records are checked
   * against `COMPARISON_DIMENSIONS` UNSORTED, which is the invariant §9.5 actually states
   * (`Object.fromEntries(COMPARISON_DIMENSIONS.map(…))`, never a document walk).
   */
  it('pins the key order of the report and of every per-dimension record (§9.5, A9)', () => {
    const report = compareMpm({
      a: TELEMANN,
      performanceA: 'Baroque',
      performanceB: 'Fast',
      msm: score('telemann-grave'),
      profile: { grid: 'refinement' },
    }).report;

    expect(Object.keys(report)).toEqual([
      'inputs',
      'window',
      'ppq',
      'parts',
      'scopes',
      'comparability',
      'measures',
      'dimensions',
      'aggregate',
      'segments',
      'remainder',
      'cellQuantizedDimensions',
      'table',
      'equivalence',
      'cumulativeDrift',
      'profiles',
      // W4 addition: AD-27.8's scape, beside `profiles` because it is the other opt-in
      // retention of what the density holds. The pin caught it, which is what the pin is for.
      'scape',
      'notes',
    ]);

    const inDimensionOrder = [...COMPARISON_DIMENSIONS];
    expect(Object.keys(report.dimensions)).toEqual(inDimensionOrder);
    expect(Object.keys(report.equivalence.byDimension)).toEqual(inDimensionOrder);
    expect(Object.keys(report.aggregate.weights)).toEqual(inDimensionOrder);
    expect(Object.keys(report.profiles ?? {})).toEqual(inDimensionOrder);
    expect(Object.keys(report.inputs.settings.weights)).toEqual(inDimensionOrder);
    expect(Object.keys(report.inputs.settings.invariance)).toEqual(inDimensionOrder);
    // Non-vacuity: the pinned order is NOT the sorted one, so sorting before comparing — which
    // is what the two existing tests did — would have accepted any order at all.
    expect(inDimensionOrder).not.toEqual([...inDimensionOrder].sort());

    // One nested record too, since §9.5's rule is about every object and not only the top.
    expect(Object.keys(report.dimensions.tempo)).toEqual([
      'state',
      'distance',
      'mean',
      'unit',
      'meanSigned',
      'weight',
      'invariance',
      'rows',
      'events',
      'bottomLengthQuarters',
      'cappedCells',
      'decomposition',
      'timeSignatureSource',
      'datePositionKnown',
    ]);
  });

  /**
   * The same pin for the two shapes W4 added (MINOR-8).
   *
   * `ComparisonReport` was pinned and the two new report shapes were not — and the existing pin's
   * own comment records what a key-order pin is worth: it is what caught W4's `scape` addition.
   * A `DiffReport` and a `CorpusReport` are serialized, diffed and compared by consumers exactly
   * as a `ComparisonReport` is, and §9.5's rule is about every object rather than about one.
   */
  it('pins the key order of DiffReport and CorpusReport too (§9.5, A9)', () => {
    const diff = diffMpm({
      a: TELEMANN,
      performanceA: 'Baroque',
      performanceB: 'Fast',
      msm: score('telemann-grave'),
      window: { start: 0, end: 16 },
    }).report;

    expect(Object.keys(diff)).toEqual([
      'inputs',
      'window',
      'ppq',
      'parts',
      'scopes',
      'scripts',
      'dimensions',
      'notes',
    ]);
    expect(Object.keys(diff.dimensions)).toEqual([...COMPARISON_DIMENSIONS]);
    expect(Object.keys(diff.dimensions.tempo)).toEqual([
      'dCurve',
      'scriptCost',
      'replayedDelta',
      'reworking',
      'replayResidual',
    ]);
    // The script and its ops, which are the shapes a consumer walks most.
    const script = elementAt(diff.scripts, 0, 'the diff’s edit scripts');
    expect(Object.keys(script)).toEqual([
      'part',
      'map',
      'dimension',
      'ops',
      'topByCost',
      'opCounts',
    ]);
    expect(Object.keys(elementAt(script.ops, 0, 'the script’s ops'))).toEqual([
      'op',
      'map',
      'part',
      'site',
      'dateA',
      'dateB',
      'measureA',
      'measureB',
      'attributes',
      'count',
      'cost',
      'free',
      'applicationIndex',
      'costRank',
    ]);

    const corpus = compareMpmCorpus({
      items: [
        { mpm: TELEMANN, performance: 'Baroque', label: 'a' },
        { mpm: TELEMANN, performance: 'Fast', label: 'b' },
        { mpm: TELEMANN, performance: 'Romantic', label: 'c' },
      ],
      window: { start: 0, end: 16 },
      k: 2,
      noiseFloor: true,
      scape: { bins: 4 },
    }).report;

    // Every opt-in product asked for, so the pin covers the widest shape rather than the
    // narrowest — the `scape` lesson from the pin above, applied before it can bite again.
    expect(Object.keys(corpus)).toEqual([
      'n',
      'labels',
      'items',
      'matrices',
      'dendrogram',
      'medoids',
      'clusters',
      'silhouette',
      'silhouetteReliable',
      'embedding',
      'seriationOrder',
      'profiles',
      'normalizationConstants',
      'context',
      'suspectPairs',
      'scape',
      'window',
      'settings',
      'notes',
    ]);
    expect(Object.keys(corpus.embedding)).toEqual([
      'coordinates',
      'eigenvalues',
      'explainedVariance',
      'degenerate',
      'negativeEigenvalueMass',
      'axes',
    ]);
    expect(Object.keys(elementAt(corpus.items, 0, 'the corpus items'))).toEqual([
      'itemIndex',
      'performance',
    ]);
    expect(Object.keys(corpus.matrices.byDimension)).toEqual([...COMPARISON_DIMENSIONS]);
  });

  /**
   * W3 MAJOR-14: §10's P-C6 had no test at the PAIRWISE path.
   *
   * The property holds — the report is byte-identical across separate processes — but nothing
   * pinned it here, so a future `Map`-iteration regression in the report builder would ship
   * green. Two runs over the same input text is the cheap half and the one that catches a
   * builder keying on object identity or on insertion order.
   */
  it('is deterministic at the pairwise path: two runs, byte-identical JSON (P-C6)', () => {
    for (const pair of PAIRS) {
      const run = () =>
        JSON.stringify(
          compareMpm({
            a: pair.a,
            b: pair.b,
            performanceA: pair.performanceA,
            performanceB: pair.performanceB,
            msm: pair.msm,
            profile: { dimensions: ['tempo', 'rubato'], grid: { step: 1 } },
          }).report,
        );
      expect(run(), pair.name).toBe(run());
    }
  });

  it('keeps the segment ranking and the note order out of the orientation', () => {
    const options = {
      a: VULPIUS,
      performanceA: 'Baroque',
      performanceB: 'Amateur',
      msm: score('vulpius-die-helle-sonn'),
    };
    const forward = compareMpm(options).report;
    const reverse = compareMpm({
      ...options,
      performanceA: 'Amateur',
      performanceB: 'Baroque',
    }).report;
    expect(reverse.segments.map((segment) => segment.startQuarters)).toEqual(
      forward.segments.map((segment) => segment.startQuarters),
    );
    expect(reverse.notes.map((note) => note.kind)).toEqual(forward.notes.map((note) => note.kind));
  });
});

// ---------------------------------------------------------------------------
// P-C11
// ---------------------------------------------------------------------------

const doc = (body: string): string =>
  `<mpm xmlns="${NS}"><performance name="p" pulsesPerQuarter="720"><global><header/><dated>` +
  `${body}</dated></global></performance></mpm>`;

/** §9.6's degenerate shapes, each named for the field it is about. */
const DEGENERATE: readonly { readonly name: string; readonly run: () => ComparisonReport }[] = [
  {
    name: 'L = 0: both documents place every instruction at date 0',
    run: () =>
      compareMpm({
        a: doc('<tempoMap><tempo date="0.0" bpm="60" beatLength="0.25"/></tempoMap>'),
        b: doc('<tempoMap><tempo date="0.0" bpm="90" beatLength="0.25"/></tempoMap>'),
      }).report,
  },
  {
    name: 'every weight zero: D is 0 and every dimension is still reported',
    run: () =>
      compareMpm({
        a: doc('<tempoMap><tempo date="0.0" bpm="60" beatLength="0.25"/></tempoMap>'),
        b: doc('<tempoMap><tempo date="0.0" bpm="90" beatLength="0.25"/></tempoMap>'),
        window: { start: 0, end: 4 },
        weights: Object.fromEntries(COMPARISON_DIMENSIONS.map((dimension) => [dimension, 0])),
      }).report,
  },
  {
    name: 'both-neutral everywhere: two documents with no maps at all',
    run: () => compareMpm({ a: MINIMAL, b: neutralMpm() }).report,
  },
  {
    name: 'a document against itself, where every difference is exactly 0',
    run: () => compareMpm({ a: TELEMANN, performanceA: 'Fast', performanceB: 'Fast' }).report,
  },
  {
    name: 'a ⊥ span on both sides: an asynchrony map with no usable offset',
    run: () =>
      compareMpm({
        a: doc('<asynchronyMap><asynchrony date="0.0"/></asynchronyMap>'),
        b: doc(
          '<asynchronyMap><asynchrony date="0.0" milliseconds.offset="30.0"/></asynchronyMap>',
        ),
        window: { start: 0, end: 4 },
      }).report,
  },
  {
    name: 'an invariance mode on a dimension neither document carries',
    run: () =>
      compareMpm({
        a: doc('<tempoMap><tempo date="0.0" bpm="60" beatLength="0.25"/></tempoMap>'),
        b: doc('<tempoMap><tempo date="0.0" bpm="90" beatLength="0.25"/></tempoMap>'),
        window: { start: 0, end: 4 },
        invariance: { pedal: 'level-gain', tempo: 'level-gain' },
      }).report,
  },
  {
    name: 'a profile over a window with no cells in it',
    run: () =>
      compareMpm({
        a: MINIMAL,
        b: neutralMpm(),
        window: { start: 0, end: 4 },
        profile: { grid: 'refinement' },
      }).report,
  },
];

describe('P-C11: every number of every result is finite or null (§9.6)', () => {
  const check = (report: ComparisonReport, label: string): void => {
    for (const [path, value] of walk(report)) {
      if (typeof value === 'number') expect(Number.isFinite(value), `${label} ${path}`).toBe(true);
      if (value !== null && typeof value === 'object' && !Array.isArray(value))
        for (const key of Object.keys(value as object))
          expect(
            Object.getOwnPropertyDescriptor(value, key)?.value,
            `${label} ${path}.${key} is not undefined`,
          ).not.toBeUndefined();
    }
  };

  for (const pair of PAIRS)
    it(`holds over ${pair.name}`, () => {
      const report = compareMpm({
        a: pair.a,
        b: pair.b,
        performanceA: pair.performanceA,
        performanceB: pair.performanceB,
        msm: pair.msm,
        profile: { grid: 'refinement' },
      }).report;
      check(report, pair.name);
    });

  for (const degenerate of DEGENERATE)
    it(`holds on the degenerate case: ${degenerate.name}`, () => {
      check(degenerate.run(), degenerate.name);
    });

  it('answers null rather than dividing by zero when the window has no length (§9.6)', () => {
    const report = elementAt(DEGENERATE, 0, 'the degenerate cases').run();
    expect(report.window.endQuarters).toBe(report.window.startQuarters);
    expect(report.aggregate.mean).toBeNull();
    for (const dimension of COMPARISON_DIMENSIONS)
      expect(report.dimensions[dimension].mean).toBeNull();
    // …and says so, rather than leaving a reader to infer it from the nulls.
    expect(
      report.notes.some(
        (note) => note.kind === 'structural' && note.message.includes('zero length'),
      ),
    ).toBe(true);
  });

  it('reports every dimension under all-zero weights, and excludes them all from D (§7.3)', () => {
    const report = elementAt(DEGENERATE, 1, 'the degenerate cases').run();
    expect(report.aggregate.distance).toBe(0);
    expect(report.dimensions.tempo.distance).toBeGreaterThan(0);
    expect(report.dimensions.tempo.weight).toBe(0);
    expect(report.segments).toHaveLength(0);
  });
});

/** Every node of a plain-data value, with a readable path for the failure message. */
function* walk(value: unknown, path = '$'): Generator<[string, unknown]> {
  yield [path, value];
  if (value === null || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    for (const [index, item] of value.entries()) yield* walk(item, `${path}[${String(index)}]`);
    return;
  }
  for (const [key, item] of Object.entries(value)) yield* walk(item, `${path}.${key}`);
}
