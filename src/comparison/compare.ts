/**
 * The interior driver: two documents in, one report out.
 *
 * Everything below this file computes one dimension over one scope; everything above it
 * validates options and types errors. This is where the eleven dimensions become a comparison —
 * one window, one settings record, one aggregate density, one closing table.
 *
 * ## Scopes, and how the parts are summed
 *
 * Evaluation is per part, and the document-level rule is a sum over the union of both
 * documents' parts. Two things follow, and they aggregate differently on purpose:
 *
 * - Mass is additive. Two parts deviating at bar 5 put twice the mass at bar 5, so cells and
 *   atoms are concatenated and the aggregate density is their sum. Overlapping cells are what
 *   `p_k(t) = Σ_parts p_{k,part}(t)` means.
 * - A mean is not. The decomposition takes moments, and P parts are P curves, not one. So the
 *   merged decomposition is taken over the disjoint union of the parts' curves — part `p`
 *   occupies `[p·L, (p+1)·L)` of a virtual abscissa — which is exact, degenerates correctly when
 *   every part inherits one global map (P identical copies have the copy's moments), and needs
 *   no arbitrary choice of a representative part.
 *
 * A document with no `<part>` at all evaluates once in the global scope, which is the own
 * rule and matches the renderer: an MSM part with no MPM counterpart inherits the global maps
 * wholesale (see `dimensions.ts`'s header for the measurement and for where that departs from
 * the wording).
 *
 * ## What is a distance and what is a descriptor
 *
 * `distance`, `mean`, the table and the matrices are distances. `meanSigned`, `levelSigned`,
 * `direction`, `cumulativeDrift` and the profile's `signed` series are descriptors:
 * they enter no `d_k`, no `D` and no table cell, and they do not satisfy the triangle
 * inequality. The report keeps them in separate fields for that reason.
 */
import { fromEntriesExact, head, isNonEmpty, last, mapValues, pairwise } from '../prelude/index.js';

import { elementAt, elementAtOrNull } from '../prelude/seq.js';
import {
  EVENT_KAPPA_QUARTERS,
  aggregateDistance,
  attributionTable,
  defaultThresholds,
  equivalenceBlock,
  segmentPass,
  type DensityAtom,
  type DensityCell,
  type DimensionDensity,
  type DimensionWeights,
} from './aggregate.js';
import { cumulativeDrift, type CumulativeDrift } from './drift.js';
import {
  containerOf,
  evaluateDimension,
  hasEntries,
  type DimensionEvaluation,
  type DimensionSettings,
  type RawNote,
  type ScopeSide,
} from './dimensions.js';
import {
  readComparisonPair,
  readScopeMapViews,
  type ComparisonPair,
  type MpmSource,
  type PerformanceSelector,
} from './document.js';
import type { InvarianceMode } from './decomposition.js';
import {
  beatGridOf,
  measurePositionAt,
  readComparisonMsm,
  type ComparisonMsm,
  type MsmPartScope,
} from './msm.js';
import type { ComparisonScope } from './parts.js';
import { plausibilityFindings, type PlausibleRanges } from './plausibility.js';
import { scapeOf } from './scape.js';
import { CompensatedSum, gaussLegendre10 } from './quadrature.js';
import {
  COMPARISON_DIMENSIONS,
  COMPARISON_JND_KEYS,
  comparisonRowFor,
  comparisonRowsOf,
  comparisonRowWith,
  type ComparisonDimension,
  type ComparisonJndKey,
  type JndOverrides,
} from './registry.js';
import { readTempoSegments } from './tempoCurve.js';
import { refinementGridTicks } from './tempoDistance.js';
import type { Element } from '../xml/XomTypes.js';
import type {
  ComparisonNote,
  ComparisonNoteKind,
  ComparisonProfile,
  ComparisonReport,
  ComparisonSegment,
  Decomposition,
  DimensionComparison,
  EpsilonFamily,
  ResolvedComparisonSettings,
} from './report.js';

// ---------------------------------------------------------------------------
// Constants the report states rather than implies
// ---------------------------------------------------------------------------

/**
 * the per-family accuracy record, in both units.
 *
 * Every figure is measured and its measurement is on the campaign record; none is a target.
 * `relative` is the classical quadrature figure and `jnd` is the same error on the dimension's
 * own perceptual scale — the one that says whether the number is fit for purpose, since the
 * metric requirement is JND-scale exactness.
 *
 * These are quadrature figures: the error an integrator makes against the integral it
 * approximates, in ℝ. They do not bound floating-point rounding, and cannot — every quantity
 * here is a sum of doubles and carries ulp-scale noise no quadrature analysis speaks to. That is
 * invisible while a figure is large (tempo's 3.3e-6 dwarfs any rounding) and becomes the whole
 * story at `step`, whose figure is an exact `0`: a consumer checking `scriptCost ≥ d − ε`
 * against `0` is checking `scriptCost ≥ d` in exact arithmetic, which a float computation can
 * miss by an ulp and does — measured, articulation at 9.296e-16. So compare against the stamped
 * ε plus an ulp allowance on the magnitudes involved; a nonzero floor for `step` would state a
 * quadrature error that does not exist.
 *
 * ## What the `imprecision` relative figure is relative to
 *
 * The support scale, not the answer. `W₁` is computed as `∫|F_A − F_B| dx` over the union
 * support, so a small answer is a small difference of large integrals: the absolute error is
 * bounded by the quadrature and the naive relative error is not bounded at all as the two laws
 * approach each other. Measured over 14 pairs with closed forms derived from
 * `∫₀¹|Q_A − Q_B| du`:
 *
 * | pair                            | exact `W₁` | abs err  | naive relative | relative to support |
 * | ------------------------------- | ---------- | -------- | -------------- | ------------------- |
 * | `U(−30,30)` vs the same shifted 6 | 6.0e+0   | 1.78e-15 | 2.96e-16       | 2.69e-17            |
 * | shifted `6e-6`                    | 6.0e-6   | 7.08e-16 | **1.18e-10**   | 1.18e-17            |
 * | shifted `6e-12`                   | 6.0e-12  | 3.24e-16 | **5.39e-05**   | 5.39e-18            |
 *
 * The published 3.6e-16 was the naive figure on well-separated pairs, where it happens to
 * coincide; two near-identical laws falsify it by eleven orders. So the field carries the
 * quantity that really is at machine precision (worst 3.0e-16, at the point-mass pairs where the
 * support scale degenerates to the separation itself and the two readings coincide), the `jnd`
 * figure is the operative one, and a caller reading `relative` as `|Δ|/W₁` should read it as
 * applying to well-separated pairs only.
 */
const EPSILON_FIGURES: Readonly<
  Record<EpsilonFamily, { readonly relative: number; readonly jnd: number }>
> = Object.freeze({
  // Piecewise-constant readings: the cell integral is `density × length`, with no quadrature in
  // the time domain at all. The exact `0` covers this family's genuinely exact
  // members — asynchrony, articulation and ornamentation — but not rubato, which has a
  // family of its own.
  //
  // `0` is the quadrature figure, exact in ℝ, and not a claim that the arithmetic is exact in
  // doubles: measured across every scope of the vendored corpus, articulation's
  // worst shortfall is 9.296e-16 — about four ulps of a `d` of 1223, float rounding rather than
  // quadrature error, eleven orders below CAPITAL-1's 7.51e-5.
  step: { relative: 0, jnd: 0 },
  // the graded mesh, worst case over the legal `meanTempoAt` range; the JND figure is
  // corrected for the halved constant.
  tempo: { relative: 3.3e-6, jnd: 5.4e-4 },
  // The ideal-curve inversion's conditioning limit at `curvature = 1`, where `x'(0.5) = 0` and
  // a cube-root loss leaves ~6e-4 volume units; every interior curvature is exact to 1e-9.
  bezier: { relative: 6e-6, jnd: 2e-5 },
  // the sixth family. Rubato's displacement integrates through the rule 2c — the
  // structural `u*` split plus a K = 16 mesh — and that integrator's residual was measured
  // at 2.718e-4 relative over 3906 pairs, which is the figure published here. The JND figure is
  // the same error on the dimension's own scale: cut the worst real-data case is 0.036
  // JND·quarters over ~50 quarters, i.e. 7e-4 JND, an order below the metric's own resolution —
  // the point exactly. The worst real-data RELATIVE shortfall (7.51e-5, Telemann part 2)
  // sits well inside the published figure and is pinned separately in `editDimensions.test.ts`,
  // so this band cannot quietly absorb a regression.
  rubato: { relative: 2.718e-4, jnd: 7e-4 },
  // `W₁` against 14 closed forms derived from `∫₀¹|Q_A − Q_B| du`, measured relative to the
  // laws' support scale — see the note above. The JND figure is the same absolute
  // error on the row's own 30 ms / 3 velocity scale.
  imprecision: { relative: 3e-16, jnd: 1.2e-16 },
  // The drift is a seconds quantity and has no JND scale; the 0 is not a claim of exactness but
  // the statement that this family contributes no JND-scale error to any distance, since the
  // drift enters no `d_k`.
  drift: { relative: 1e-9, jnd: 0 },
});

/**
 * A fresh copy per report, never the frozen table itself.
 *
 * Rule I3(b): every level of a facade result is freshly allocated, so a consumer's `===`
 * memoization sees a change when one occurred. Handing out the module-level constant would make
 * two comparisons share an object.
 */
export function epsilonRecord(): Record<
  EpsilonFamily,
  { readonly relative: number; readonly jnd: number }
> {
  return mapValues(EPSILON_FIGURES, (figures) => ({ ...figures }));
}

/** the threshold for calling a segment's direction `'mixed'` [convention]. */
const MIXED_DIRECTION_FRACTION = 0.5;

/**
 * the same-piece heuristic: below this length ratio the pair is flagged [convention].
 *
 * `0.8` is the documented band read as a ratio — `[0.8, 1.25]` on `long/short` is
 * `short/long < 0.8`.
 */
export const SUSPECT_LENGTH_RATIO = 0.8;

/**
 * the step cap: a profile is a report field, not a sample buffer.
 *
 * 4096 points [convention] — a few hundred kilobytes of JSON per dimension at the outside, and
 * about two points per quarter over a 30-minute movement. An explicit `grid.step` finer than the
 * cap allows is honoured as far as the cap and then coarsened, with a `grid-truncated` note
 * saying so and naming both steps.
 */
export const PROFILE_MAX_POINTS = 4096;

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

/** What the facade hands the interior, with every default already resolved. */
export interface InteriorCompareOptions {
  readonly a: MpmSource;
  readonly b?: MpmSource;
  readonly performanceA?: PerformanceSelector;
  readonly performanceB?: PerformanceSelector;
  /** Already parsed by the facade, so a parse failure is typed before this runs. */
  readonly msm?: Element | null;
  readonly window?: { readonly start: number; readonly end: number } | null;
  readonly corpusEndQuarters?: number | null;
  readonly weights: DimensionWeights;
  readonly jnd: JndOverrides;
  readonly plausibleRange: PlausibleRanges;
  readonly invariance: Readonly<Record<ComparisonDimension, InvarianceMode>>;
  readonly profile?: {
    readonly dimensions?: readonly ComparisonDimension[];
    readonly grid?: 'refinement' | { readonly step: number };
  } | null;
  readonly lambdaDate: number;
  /** the scape; omit or null for none. Bins are clamped to `SCAPE_MAX_BINS`. */
  readonly scape?: { readonly bins: number } | null;
}

// ---------------------------------------------------------------------------
// The driver
// ---------------------------------------------------------------------------

export function compareInterior(options: InteriorCompareOptions): ComparisonReport {
  const msm = options.msm == null ? null : readComparisonMsm(options.msm);
  const pair = readComparisonPair({
    a: options.a,
    b: options.b,
    performanceA: options.performanceA,
    performanceB: options.performanceB,
    msmEndQuarters: msm === null ? null : msm.endQuarters,
    window: options.window ?? null,
    corpusEndQuarters: options.corpusEndQuarters ?? null,
  });

  const ticksPerQuarter = pair.ppq.lcm;
  const notes: ComparisonNote[] = [];
  const scopes = scopeSides(pair, msm);
  const sides = scopes.sides;

  const settings: DimensionSettings = {
    window: pair.window,
    ticksPerQuarter,
    jnd: options.jnd,
    invariance: options.invariance,
    beatGrid: msm === null ? null : beatGridOf(msm, ticksPerQuarter),
    lambdaDate: options.lambdaDate,
  };

  if (msm !== null && msm.timeSignatures.length > 1)
    notes.push(
      note(
        'estimate-degradation',
        'accentuation',
        null,
        pair.window.startQuarters,
        pair.window.endQuarters,
        `the MSM carries ${String(msm.timeSignatures.length)} time signatures and the ` +
          'accentuation phase is anchored to the first: the forward-only walk needs the ' +
          'evaluator to take a grid function, which this wave does not ship',
      ),
    );
  if (scopes.rule === 'mpm')
    notes.push(
      note(
        'estimate-degradation',
        null,
        null,
        pair.window.startQuarters,
        pair.window.endQuarters,
        `the per-part sum runs over ${String(sides.length)} scopes taken from the MPM's own ` +
          '<part> elements, because no MSM was supplied. What the renderer performs is one scope ' +
          'per rendered MSM part, which the documents alone cannot answer: an MPM part ' +
          'the score never names performs nothing, and a score part with no MPM counterpart ' +
          'performs the global maps anyway. Supply an `msm` for the counted quantity',
      ),
    );
  if (msm !== null && options.window != null && msm.endQuarters !== pair.window.endQuarters)
    notes.push(
      note(
        'structural',
        null,
        null,
        pair.window.startQuarters,
        pair.window.endQuarters,
        `an explicit window was given and outranks the MSM; the MSM’s score end is ` +
          `${String(msm.endQuarters)} quarters`,
      ),
    );

  // Every dimension, over every scope, merged.
  const evaluations = new Map<ComparisonDimension, readonly DimensionEvaluation[]>();
  for (const dimension of COMPARISON_DIMENSIONS)
    evaluations.set(
      dimension,
      sides.map(([a, b]) => evaluateDimension(dimension, a, b, settings)),
    );

  const densities = COMPARISON_DIMENSIONS.map((dimension) =>
    densityOf(dimension, evaluations.get(dimension) ?? [], ticksPerQuarter),
  );

  const thresholds = defaultThresholds();
  const pass = segmentPass(
    densities,
    options.weights,
    thresholds,
    pair.window.startQuarters,
    pair.window.endQuarters,
  );
  const table = attributionTable(
    densities,
    options.weights,
    pass.segments,
    pair.window.startQuarters,
    pair.window.endQuarters,
  );
  const total = aggregateDistance(densities, options.weights);
  const equivalence = equivalenceBlock(
    densities,
    thresholds,
    pass.segments,
    pass.remainderMass,
    total,
    pair.window.startQuarters,
    pair.window.endQuarters,
  );

  const windowLength = pair.window.endQuarters - pair.window.startQuarters;
  if (!(windowLength > 0))
    notes.push(
      note(
        'structural',
        null,
        null,
        pair.window.startQuarters,
        pair.window.endQuarters,
        'the window has zero length — both documents place every instruction at one date — so ' +
          'every length-normalized mean is null rather than a division by zero',
      ),
    );
  const signedDensity = aggregateSignedDensity(evaluations, options.weights);

  // Every dimension's report row, plus the notes its evaluation produced: the callback appends
  // to `notes` as well as returning the row. `fromEntriesExact` walks the vocabulary in its
  // declared order, which is the order the note log comes out in.
  const dimensions = fromEntriesExact(COMPARISON_DIMENSIONS, (dimension) => {
    const rows = evaluations.get(dimension) ?? [];
    const bothNeutral = sides.every(
      ([a, b]) => !hasEntries(a, dimension) && !hasEntries(b, dimension),
    );
    const comparison = dimensionComparison(
      dimension,
      rows,
      options.weights[dimension],
      options.jnd,
      windowLength,
      bothNeutral,
    );
    for (const raw of rows.flatMap((row) => row.notes)) notes.push(fromRawNote(raw));
    notes.push(
      ...invarianceNotes(dimension, rows, options.invariance[dimension], bothNeutral, pair),
    );
    if (rows.some((row) => row.cappedCells > 0))
      notes.push(
        note(
          'capped',
          dimension,
          null,
          pair.window.startQuarters,
          pair.window.endQuarters,
          `the cap bound in ${String(rows.reduce((sum, row) => sum + row.cappedCells, 0))} ` +
            'cells: an incomparable or runaway difference is priced at 2·δ_row, which is what ' +
            'keeps the triangle inequality intact when a ⊥ document is the middle term',
        ),
      );
    notes.push(...encodingNotes(dimension, sides, comparison.distance, pair));
    return comparison;
  });

  for (const side of ['a', 'b'] as const)
    for (const finding of plausibilityFindings(
      pair[side],
      side,
      ticksPerQuarter,
      options.plausibleRange,
    ))
      notes.push({
        kind: 'plausibility',
        dimension: comparisonRowFor(finding.key).dimension,
        document: side,
        itemIndex: null,
        site: finding.site,
        startQuarters: finding.site.date,
        endQuarters: finding.site.date,
        message:
          `@${finding.site.attribute} = ${String(finding.value)} is outside its plausible band ` +
          `[${String(finding.range[0])}, ${String(finding.range[1])}]; the distance is unchanged`,
      });

  // The check has two arms: the design asks for the length check between the two MPMs "and
  // the same check against the score end when an MSM is supplied". The second is where the
  // window comes from — a Telemann MPM reaching 198 quarters against a Vulpius MSM ending at 54
  // compares over 54 quarters, discarding 73 % of the piece. The score is checked against both
  // documents, since either can be the mismatched one.
  const msmRatios =
    msm === null
      ? []
      : [pair.comparability.lastDateA, pair.comparability.lastDateB].map((lastDate) =>
          lengthRatioOf(lastDate, msm.endQuarters),
        );
  const suspectLength = pair.comparability.lengthRatio < SUSPECT_LENGTH_RATIO;
  const suspectScore = msmRatios.some((ratio) => ratio < SUSPECT_LENGTH_RATIO);
  const suspectPair =
    suspectLength ||
    suspectScore ||
    (pair.comparability.partCountA > 0 &&
      pair.comparability.partCountB > 0 &&
      !pair.comparability.partNumbersMatched);
  if (suspectPair)
    notes.push(
      note(
        'length-mismatch',
        null,
        null,
        pair.window.startQuarters,
        pair.window.endQuarters,
        `the two documents may not encode the same piece: ${
          suspectScore
            ? `the MSM's score end is ${String(msm?.endQuarters ?? 0)} quarters against last ` +
              `dates of ${String(pair.comparability.lastDateA)} and ` +
              `${String(pair.comparability.lastDateB)}, outside the [${String(
                SUSPECT_LENGTH_RATIO,
              )}, ${String(1 / SUSPECT_LENGTH_RATIO)}] band — and the window is the SCORE's, so ` +
              'whatever lies beyond it is not compared at all; '
            : ''
        }their lengths differ by more than the band, or they share no part number`,
      ),
    );

  const drift = driftOf(pair, sides, ticksPerQuarter);
  if (sides.length > 1)
    notes.push(
      note(
        'structural',
        'tempo',
        null,
        pair.window.startQuarters,
        pair.window.endQuarters,
        `cumulativeDrift is reported for the first of ${String(sides.length)} evaluated part ` +
          'scopes: the clock is a property of one part’s tempo map, and parts that inherit the ' +
          'same global map all have this one',
      ),
    );

  const profiles = profilesOf(options, evaluations, pair, notes);

  return {
    inputs: {
      settings: resolvedSettings(options, pair),
      jnd: effectiveJnd(options.jnd),
      msmUsed: msm !== null,
      epsilon: epsilonRecord(),
    },
    window: {
      startQuarters: pair.window.startQuarters,
      endQuarters: pair.window.endQuarters,
      rule: pair.window.rule,
      metricGuarantee: pair.window.metricGuarantee,
    },
    ppq: {
      a: pair.ppq.a,
      b: pair.ppq.b,
      lcm: pair.ppq.lcm,
      fallbackUsed: pair.ppq.fallbackUsed,
      assumed: pair.ppq.assumed,
      unusableDeclaration: {
        a: pair.a.ppq.unusableDeclaration,
        b: pair.b.ppq.unusableDeclaration,
      },
    },
    parts: pair.scopes.map((pairing) => ({
      numberA: pairing.numberA,
      numberB: pairing.numberB,
      nameA: pairing.nameA,
      nameB: pairing.nameB,
      matched: pairing.matched,
    })),
    scopes: { rule: scopes.rule, count: sides.length },
    comparability: { ...pair.comparability, suspectPair },
    measures: msm === null ? null : [...msm.measures],
    dimensions,
    aggregate: {
      distance: total,
      mean: windowLength > 0 ? total / windowLength : null,
      weights: { ...options.weights },
      normalization: 'fixed',
    },
    segments: pass.segments.map((segment) =>
      reportSegment(segment, pass.cells, signedDensity, msm),
    ),
    remainder: { mass: pass.remainderMass, quadratureUnderflow: pass.remainderUnderflow },
    cellQuantizedDimensions: [...pass.cellQuantizedDimensions],
    table: {
      dimensions: [...table.dimensions],
      columnCount: table.columnCount,
      cells: [...table.cells],
      rowSums: [...table.rowSums],
      columnSums: [...table.columnSums],
      total: table.total,
      residual: table.residual,
    },
    equivalence: {
      subThresholdMassFraction: equivalence.subThresholdMassFraction,
      aboveThresholdLengthFraction: equivalence.aboveThresholdLengthFraction,
      byDimension: { ...equivalence.byDimension },
    },
    cumulativeDrift: drift,
    profiles,
    scape:
      options.scape == null
        ? null
        : scapeOf(
            densities,
            options.weights,
            pair.window.startQuarters,
            pair.window.endQuarters,
            options.scape.bins,
          ),
    notes: sortNotes(notes),
  };
}

// ---------------------------------------------------------------------------
// Scopes
// ---------------------------------------------------------------------------

/** `short/long`, with `document.ts`'s own convention: two zero lengths are the same length. */
function lengthRatioOf(x: number, y: number): number {
  const longest = Math.max(x, y);
  return longest === 0 ? 1 : Math.min(x, y) / longest;
}

/** Which document decided how many scopes the per-part sum runs over. */
export type ScopeRule = 'msm' | 'mpm' | 'global';

/**
 * The scope pairs to evaluate, and what drove the count.
 *
 * The count is a multiplier on `D`, so taking it from the wrong document is not a detail.
 * `Performance.renderParts` iterates the MSM's parts and calls
 * `resolvePartMaps(getCorrespondingPart(msmPart), globalMaps)`, so what performs is one scope
 * per rendered MSM part, and an MPM `<part>` the score never names performs nothing.
 * the Telemann 3× pin measured the other reading: adding three empty `<part>` elements to
 * both documents tripled `D` while the performed MSMs stayed byte-identical.
 *
 * So with an MSM the scopes are the score's, matched into each document the way
 * `getCorrespondingPart` matches — `@number` first, then `@name` — and a side with no
 * counterpart takes its own global scope, which is `resolvePartMaps(null, globalMaps)`
 * (measured: velocity 40 from the global map, not the neutral 100).
 *
 * Without an MSM there is no score to count and the MPM-driven reading is the only one
 * available. It stands, with the `estimate-degradation` note the caller stamps: an estimate of a
 * quantity the documents alone cannot answer.
 */
export function scopeSides(
  pair: ComparisonPair,
  msm: ComparisonMsm | null,
): {
  readonly rule: ScopeRule;
  readonly sides: readonly (readonly [ScopeSide, ScopeSide])[];
} {
  const globalA = pair.a.scopes.find((scope) => scope.scope === 'global');
  const globalB = pair.b.scopes.find((scope) => scope.scope === 'global');
  if (globalA === undefined || globalB === undefined)
    throw new Error('comparison: a performance with no global scope');

  const globalOnly = [
    [
      { role: 'a', document: pair.a, scope: globalA },
      { role: 'b', document: pair.b, scope: globalB },
    ],
  ] as const as readonly (readonly [ScopeSide, ScopeSide])[];

  if (msm !== null) {
    const scored = msm.parts.filter((part) => part.rendered);
    // A score with no rendered part performs nothing; there is no part count to take from it,
    // so the pair falls back to the reading the documents can answer.
    if (scored.length > 0)
      return {
        rule: 'msm',
        sides: scored.map(
          (part) =>
            [
              { role: 'a', document: pair.a, scope: correspondingScope(pair.a, part) ?? globalA },
              { role: 'b', document: pair.b, scope: correspondingScope(pair.b, part) ?? globalB },
            ] as const,
        ),
      };
  }

  const partRows = pair.scopes.filter((pairing) => pairing.scope === 'part');
  if (partRows.length === 0) return { rule: 'global', sides: globalOnly };

  return {
    rule: 'mpm',
    sides: partRows.map(
      (pairing) =>
        [
          { role: 'a', document: pair.a, scope: pairing.a ?? globalA },
          { role: 'b', document: pair.b, scope: pairing.b ?? globalB },
        ] as const,
    ),
  };
}

/**
 * `Performance.getCorrespondingPart`, on the comparison's scopes: `@number`, then `@name`.
 *
 * The name fallback is the renderer's second lookup and it is why a score whose parts carry no
 * `@number` still performs against an MPM that names its parts. Non-renderable `<part>`s are
 * already absent from the scope list (`parts.ts`), which is `Part.fromXml` failing.
 */
function correspondingScope(
  document: ComparisonPair['a'],
  part: MsmPartScope,
): ComparisonScope | null {
  const parts = document.scopes.filter((scope) => scope.scope === 'part' && scope.renderable);
  if (part.number !== null) {
    const byNumber = parts.find((scope) => scope.number === part.number);
    if (byNumber !== undefined) return byNumber;
  }
  if (part.name !== null) {
    const byName = parts.find((scope) => scope.name === part.name);
    if (byName !== undefined) return byName;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Merging
// ---------------------------------------------------------------------------

/** One dimension's density over every scope — mass is additive, so the parts concatenate. */
function densityOf(
  dimension: ComparisonDimension,
  rows: readonly DimensionEvaluation[],
  ticksPerQuarter: number,
): DimensionDensity {
  const cells: DensityCell[] = [];
  const atoms: DensityAtom[] = [];
  const total = new CompensatedSum();

  for (const row of rows) {
    total.add(row.distance);
    for (const cell of row.cells)
      cells.push({
        startQuarters: cell.startQuarters,
        endQuarters: cell.endQuarters,
        mass: cell.mass,
        densityAt: cell.densityAt,
      });
    for (const atom of row.atoms)
      atoms.push({
        startQuarters: atom.startTicks / ticksPerQuarter,
        endQuarters: atom.endTicks / ticksPerQuarter,
        // the `κ`, applied where an event's JND becomes commensurable with a quarter of
        // sustained deviation.
        mass: atom.mass * EVENT_KAPPA_QUARTERS,
      });
  }

  return { dimension, cells, atoms, distance: total.total };
}

/** `Σ_k ω_k p̃_k(t)` — the signed aggregate density, in JND per quarter. */
function aggregateSignedDensity(
  evaluations: ReadonlyMap<ComparisonDimension, readonly DimensionEvaluation[]>,
  weights: DimensionWeights,
): (quarters: number) => number {
  return (quarters: number) => {
    const total = new CompensatedSum();
    for (const dimension of COMPARISON_DIMENSIONS) {
      const weight = weights[dimension];
      if (weight === 0) continue;
      for (const row of evaluations.get(dimension) ?? []) {
        if (row.signedAt === null) continue;
        total.add(weight * row.signedAt(quarters));
      }
    }
    return total.total;
  };
}

function dimensionComparison(
  dimension: ComparisonDimension,
  rows: readonly DimensionEvaluation[],
  weight: number,
  jnd: JndOverrides,
  windowLength: number,
  bothNeutral: boolean,
): DimensionComparison {
  const distance = new CompensatedSum();
  for (const row of rows) distance.add(row.distance);

  // `distance` sums over the scopes and `meanSigned` averages over them. Mass is
  // additive — two parts deviating at bar 5 put twice the mass at bar 5, which is what
  // `p_k(t) = Σ_parts p_{k,part}(t)` means — while `meanSigned` is a descriptor in the row's
  // T-space unit: summing three parts' "A is 4 BPM faster" would report 12 BPM, a number no part
  // carries and no listener could hear. The same argument the decomposition makes for taking
  // moments over the disjoint union, and the reason `bottomLengthQuarters` takes a maximum. On
  // telemann Baroque|Romantic the two read `mean = 8.605` against `meanSigned = −0.0708`: one a
  // distance per quarter summed over three parts, the other a signed level in BPM-nepers held by
  // each of them.
  const withCurves = rows.filter((row) => row.meanSigned !== null);
  const meanSigned =
    withCurves.length === 0
      ? null
      : withCurves.reduce((sum, row) => sum + (row.meanSigned ?? 0), 0) / withCurves.length;

  const rowDistances = new Map<ComparisonJndKey, number>();
  for (const row of rows)
    for (const entry of row.rowDistances)
      rowDistances.set(entry.key, (rowDistances.get(entry.key) ?? 0) + entry.distance);

  // A dimension evaluated over no scope has no unit and no space to report — the `?? …`
  // defaults below.
  const first = elementAtOrNull(rows, 0);

  return {
    state: bothNeutral ? 'both-neutral' : 'compared',
    distance: distance.total,
    mean: windowLength > 0 ? distance.total / windowLength : null,
    unit: first?.unit ?? 'dimensionless',
    meanSigned,
    weight,
    invariance: rows.some((row) => row.invariance === 'none')
      ? 'none'
      : (first?.invariance ?? 'none'),
    rows: comparisonRowsOf(dimension).map((row) => {
      const resolved = comparisonRowWith(row.key, jnd);
      return {
        key: row.key,
        distance: rowDistances.get(row.key) ?? 0,
        unit: resolved.unit,
        jnd: resolved.jnd,
        delta: resolved.delta,
      };
    }),
    events: {
      matched: rows.reduce((sum, row) => sum + row.events.matched, 0),
      unmatchedA: rows.reduce((sum, row) => sum + row.events.unmatchedA, 0),
      unmatchedB: rows.reduce((sum, row) => sum + row.events.unmatchedB, 0),
      mass: rows.reduce((sum, row) => sum + row.events.mass, 0),
    },
    // The `⊥` length is a fraction of the window, so parts take the maximum rather than the sum:
    // two parts both blind for the first bar leave one bar of the window unreadable, not two.
    bottomLengthQuarters: Math.max(0, ...rows.map((row) => row.bottomLengthQuarters)),
    cappedCells: rows.reduce((sum, row) => sum + row.cappedCells, 0),
    decomposition: mergedDecomposition(rows),
    timeSignatureSource:
      rows.find((row) => row.timeSignatureSource !== null)?.timeSignatureSource ?? null,
    datePositionKnown: rows.every((row) => row.datePositionKnown),
  };
}

/**
 * the decomposition over the disjoint union of the scope rows' curves.
 *
 * With one scope this is the row's own decomposition. With several it is the decomposition of
 * the concatenation — part `p` on `[p·L, (p+1)·L)` — which is the only reading that needs no
 * arbitrary representative part and that degenerates correctly when every part inherits one
 * global map: P identical copies have the copy's moments.
 */
function mergedDecomposition(rows: readonly DimensionEvaluation[]): Decomposition | null {
  const withCurves = rows.filter((row) => row.decomposition !== null);
  if (!isNonEmpty(withCurves)) return null;
  const first = head(withCurves);
  const unit = first.unit;
  if (withCurves.length === 1) {
    const only = first.decomposition as Omit<Decomposition, 'unit'>;
    return { ...only, unit };
  }

  // Distribution dimensions carry a decomposition without a sampler, so there is nothing to
  // concatenate; their terms are already μ-weighted means over the window and averaging them
  // over parts is the same operation the union would perform.
  const samplers = withCurves.filter((row) => row.valueA !== null && row.valueB !== null);
  if (samplers.length !== withCurves.length) return averagedDecomposition(unit, withCurves);
  return unionDecomposition(unit, samplers);
}

function averagedDecomposition(unit: string, rows: readonly DimensionEvaluation[]): Decomposition {
  const mean = (pick: (row: DimensionEvaluation) => number): number =>
    rows.reduce((sum, row) => sum + pick(row), 0) / rows.length;
  const withRho = rows.filter((row) => row.decomposition?.r != null);
  return {
    unit,
    level: mean((row) => row.decomposition?.level ?? 0),
    levelSigned: mean((row) => row.decomposition?.levelSigned ?? 0),
    gain: mean((row) => row.decomposition?.gain ?? 0),
    shape:
      withRho.length === 0
        ? null
        : withRho.reduce((sum, row) => sum + (row.decomposition?.shape ?? 0), 0) / withRho.length,
    r:
      withRho.length === 0
        ? null
        : withRho.reduce((sum, row) => sum + (row.decomposition?.r ?? 0), 0) / withRho.length,
    shapeless: rows.every((row) => row.decomposition?.shapeless === true),
    l2Squared: mean((row) => row.decomposition?.l2Squared ?? 0),
  };
}

function unionDecomposition(unit: string, rows: readonly DimensionEvaluation[]): Decomposition {
  const spans = rows.map((row) => {
    const grid = row.pairGridQuarters;
    // An empty pair grid has no span, and `0` is the reading the `1e-12` note below describes:
    // the union degenerates to the first row's curve rather than propagating a `NaN` index.
    return isNonEmpty(grid)
      ? { row, start: head(grid), end: last(grid) }
      : { row, start: 0, end: 0 };
  });
  const firstSpan = elementAt(spans, 0, SPANS);
  const length = firstSpan.end - firstSpan.start;

  // The virtual abscissa: row `p` occupies `[p·length, (p+1)·length)`.
  //
  // The `1e-12` floor is a division guard and nothing else: on a zero-length window every row
  // occupies the same degenerate span, `x / 0` is `NaN` or `±Infinity`, and the clamp below
  // would carry that into the index. With the floor the index is 0 and the union degenerates to
  // the first row's curve, the right answer for a window with no interior — the report already says
  // every length-normalized mean as null there. `length` itself is never replaced, only the
  // divisor.
  const locate = (x: number): { row: DimensionEvaluation; quarters: number } => {
    const index = Math.min(rows.length - 1, Math.max(0, Math.floor(x / Math.max(length, 1e-12))));
    const span = elementAt(spans, index, SPANS);
    return { row: span.row, quarters: span.start + (x - index * length) };
  };
  const sampleA = (x: number): number => {
    const at = locate(x);
    return at.row.valueA?.(at.quarters) ?? 0;
  };
  const sampleB = (x: number): number => {
    const at = locate(x);
    return at.row.valueB?.(at.quarters) ?? 0;
  };

  const grid: number[] = [];
  for (const [index, span] of spans.entries())
    for (const quarters of span.row.pairGridQuarters) {
      const x = index * length + (quarters - span.start);
      if (!isNonEmpty(grid) || x > last(grid)) grid.push(x);
    }

  const momentsA = momentsOverGrid(sampleA, grid);
  const momentsB = momentsOverGrid(sampleB, grid);
  const l2Squared = integrateOverGrid((x) => {
    const value = sampleA(x) - sampleB(x);
    return value * value;
  }, grid);
  const covariance = integrateOverGrid(
    (x) => (sampleA(x) - momentsA.mean) * (sampleB(x) - momentsB.mean),
    grid,
  );
  const shapeless = momentsA.sigma === 0 || momentsB.sigma === 0;
  const r = shapeless ? null : covariance / (momentsA.sigma * momentsB.sigma);

  return {
    unit,
    level: Math.abs(momentsA.mean - momentsB.mean),
    levelSigned: momentsA.mean - momentsB.mean,
    gain: Math.abs(momentsA.sigma - momentsB.sigma),
    shape: r === null ? null : Math.sqrt(Math.max(0, 2 * (1 - r))),
    r,
    shapeless,
    l2Squared,
  };
}

/** What an out-of-range read into one of this module's sequences is called (`indexing.ts`). */
const SPANS = "the union decomposition's per-scope spans";
const SCOPE_SIDES = "the pair's scope sides";

/** `∫ g dx / L` over a grid that partitions it. */
function integrateOverGrid(g: (x: number) => number, grid: readonly number[]): number {
  // The grid's own span, or 0 where it is too short to have one — `decomposition.ts`'s
  // `gridSpan`, with the same `!(length > 0)` guard.
  const length = isNonEmpty(grid) ? last(grid) - head(grid) : 0;
  if (!(length > 0)) return 0;
  const total = new CompensatedSum();
  for (const [low, high] of pairwise(grid)) total.add(gaussLegendre10(g, low, high));
  return total.total / length;
}

function momentsOverGrid(
  g: (x: number) => number,
  grid: readonly number[],
): { mean: number; sigma: number } {
  const mean = integrateOverGrid(g, grid);
  const variance = integrateOverGrid((x) => (g(x) - mean) * (g(x) - mean), grid);
  const scale = Math.max(Math.abs(mean), 1);
  // the floor: a constant curve integrated by quadrature has a variance of order 1e-31,
  // so `σ = 0` has to be recognized structurally rather than by an equality test.
  const sigma = variance < (1e-12 * scale) ** 2 ? 0 : Math.sqrt(Math.max(0, variance));
  return { mean, sigma };
}

// ---------------------------------------------------------------------------
// Report pieces
// ---------------------------------------------------------------------------

function reportSegment(
  segment: {
    readonly startQuarters: number;
    readonly endQuarters: number;
    readonly lengthQuarters: number;
    readonly mass: number;
    readonly mean: number;
    readonly peak: number;
    readonly peakAtQuarters: number;
    readonly rank: number;
  },
  cells: readonly { readonly startQuarters: number; readonly endQuarters: number }[],
  signedDensity: (quarters: number) => number,
  msm: ComparisonMsm | null,
): ComparisonSegment {
  const inside = cells.filter(
    (cell) =>
      cell.startQuarters >= segment.startQuarters && cell.endQuarters <= segment.endQuarters,
  );
  const signed = new CompensatedSum();
  for (const cell of inside) {
    if (!(cell.endQuarters > cell.startQuarters)) continue;
    signed.add(gaussLegendre10(signedDensity, cell.startQuarters, cell.endQuarters));
  }
  const signedTotal = signed.total;
  const meanSigned = segment.lengthQuarters > 0 ? signedTotal / segment.lengthQuarters : 0;

  return {
    startQuarters: segment.startQuarters,
    endQuarters: segment.endQuarters,
    lengthQuarters: segment.lengthQuarters,
    measure: msm === null ? null : measureRange(msm, segment.startQuarters, segment.endQuarters),
    mass: segment.mass,
    peak: segment.peak,
    mean: segment.mean,
    peakAtQuarters: segment.peakAtQuarters,
    meanSigned,
    // 'mixed' where the signed integral's magnitude is below a documented fraction of the
    // absolute one — i.e. the segment changes sign inside itself, which is exactly the case a
    // signed mean alone would report as "no difference in direction".
    direction:
      Math.abs(signedTotal) < MIXED_DIRECTION_FRACTION * Math.abs(segment.mass)
        ? 'mixed'
        : signedTotal > 0
          ? 'a-greater'
          : 'b-greater',
    rank: segment.rank,
  };
}

function measureRange(
  msm: ComparisonMsm,
  startQuarters: number,
  endQuarters: number,
): ComparisonSegment['measure'] {
  const start = measurePositionAt(msm.measures, startQuarters);
  const end = measurePositionAt(msm.measures, endQuarters);
  return start === null || end === null ? null : { start, end };
}

function driftOf(
  pair: ComparisonPair,
  sides: readonly (readonly [ScopeSide, ScopeSide])[],
  ticksPerQuarter: number,
): CumulativeDrift {
  const [a, b] = elementAt(sides, 0, SCOPE_SIDES);
  const read = (side: ScopeSide) =>
    readTempoSegments(
      readScopeTempoView(side),
      side.document.scaleFactor,
      side.scope.environment,
      side.document.performance.global,
    );
  const curveA = read(a);
  const curveB = read(b);
  return cumulativeDrift(
    curveA,
    curveB,
    refinementGridTicks(curveA, curveB, pair.window, ticksPerQuarter),
    ticksPerQuarter,
  );
}

/**
 * The tempo map view of one side, re-read rather than plumbed through.
 *
 * `readScopeMapViews` is a pure function of the scope, and threading one map view for one
 * secondary product through eleven evaluations would be more coupling than the read costs.
 * `containerOf` rather than a literal, so the drift and the tempo dimension cannot address two
 * different maps if the correspondence ever moves.
 */
function readScopeTempoView(side: ScopeSide) {
  return readScopeMapViews(side.scope).get(containerOf('tempo')) ?? null;
}

// ---------------------------------------------------------------------------
// Notes and settings
// ---------------------------------------------------------------------------

export function note(
  kind: ComparisonNoteKind,
  dimension: ComparisonDimension | null,
  document: 'a' | 'b' | null,
  startQuarters: number | null,
  endQuarters: number | null,
  message: string,
): ComparisonNote {
  return {
    kind,
    dimension,
    document,
    itemIndex: null,
    site: null,
    startQuarters,
    endQuarters,
    message,
  };
}

/** The interior's own note kinds, mapped onto the closed vocabulary. */
function fromRawNote(raw: RawNote): ComparisonNote {
  return {
    kind: noteKindOf(raw.kind),
    dimension: raw.dimension,
    document: raw.document,
    itemIndex: null,
    site: null,
    startQuarters: raw.startQuarters,
    endQuarters: raw.endQuarters,
    message: raw.message,
  };
}

function noteKindOf(kind: string): ComparisonNoteKind {
  switch (kind) {
    case 'renderer-error':
    case 'renderer-default-level':
    case 'renderer-skip':
    case 'grid-truncated':
    case 'inert-difference':
    case 'option-unusable':
    case 'estimate-degradation':
    case 'capped':
    case 'structural':
      return kind;
    // the kind. The trailing `@transition.to`, the trailing `<movement>`
    // and the shadowed duration lever are all "an attribute the renderer reads and never
    // applies" — the same finding in three maps. `structural` is the channel for a difference
    // that IS performed but is not a magnitude, so it is the wrong one for these.
    case 'inert-transition':
    case 'trailing-movement':
    case 'shadowed-lever':
      return 'inert-difference';
    // The readers name their findings after the mechanism that produced them — 'unresolved-def',
    // 'v3-shape', 'scale-zero', 'declared-law'. Every one of them is the structural channel:
    // read, consequential, and never folded into a distance.
    default:
      return 'structural';
  }
}

/**
 * the and the structural note: the encoding differs and the performance does not.
 *
 * DESIGN states the rule twice: "a global-vs-part-local encoding
 * difference with identical resolved curves is distance 0 plus a structural note — which is
 * correct: it is not performed", and the "an explicit neutral instruction ≡ absent
 * map: dimension distance exactly 0 — plus the structural note". One note answers both. It is
 * what makes `d_k = 0` legible: without it a caller cannot tell "these encode the same
 * performance the same way" from "these encode the same performance differently" — and the
 * second is what a diff product is for.
 *
 * The signature is per scope: whether the resolved map exists at all, and whether it came from
 * the part's own environment or was inherited from the global one — `resolvePartMaps`' own
 * distinction, and the only thing that can differ while the resolved curve does not.
 */
function encodingNotes(
  dimension: ComparisonDimension,
  sides: readonly (readonly [ScopeSide, ScopeSide])[],
  distance: number,
  pair: ComparisonPair,
): readonly ComparisonNote[] {
  // Only where the performance really is identical. A nonzero distance already reports the
  // difference as a magnitude, and saying "and they are encoded differently" on top of it would
  // be noise on every ordinary pair.
  if (distance !== 0) return [];

  const signature = (side: ScopeSide): string => {
    if (!hasEntries(side, dimension)) return 'absent';
    return side.scope.scope === 'part' && side.scope.environment.maps.has(containerOf(dimension))
      ? 'part-local'
      : 'global';
  };
  const signatureA = sides.map(([a]) => signature(a)).join(',');
  const signatureB = sides.map(([, b]) => signature(b)).join(',');
  if (signatureA === signatureB) return [];

  return [
    note(
      'structural',
      dimension,
      null,
      pair.window.startQuarters,
      pair.window.endQuarters,
      `the two documents encode this dimension differently and perform it identically: ` +
        `a's ${containerOf(dimension)} is [${signatureA}] per evaluated scope against b's ` +
        `[${signatureB}], and the resolved curves agree, so the distance is exactly 0. ` +
        'An absent map is the neutral curve and a part-local map that resolves to ' +
        'the global one performs the global one, so neither difference is performed',
    ),
  ];
}

function invarianceNotes(
  dimension: ComparisonDimension,
  rows: readonly DimensionEvaluation[],
  requested: InvarianceMode,
  bothNeutral: boolean,
  pair: ComparisonPair,
): readonly ComparisonNote[] {
  if (requested === 'none') return [];
  const notes: ComparisonNote[] = [];

  // the document-content case, and the example the ruling names: a mode requested for a
  // dimension neither document carries. The caller could not have known, so it degrades with a
  // typed note rather than throwing.
  if (bothNeutral)
    notes.push(
      note(
        'option-unusable',
        dimension,
        null,
        pair.window.startQuarters,
        pair.window.endQuarters,
        `invariance '${requested}' was requested for a dimension neither document carries; it ` +
          'was applied to two neutral curves and removed nothing',
      ),
    );

  // the trap. In a linear space 'level' removes an additive offset only — the multiplicative
  // factor survives, because `c·x − mean(c·x) = c(x − mean x)` — while the same mode removes a
  // factor from a log space. The design requires the sentence so that a report stamping
  // `invariance: 'level'` on tempo and on asynchrony is not read as saying the same thing twice.
  const space = rows[0]?.space ?? '';
  if (space === 'gain' || space === 'gain-ordered')
    notes.push(
      note(
        'invariance-space',
        dimension,
        null,
        pair.window.startQuarters,
        pair.window.endQuarters,
        `this dimension's scale space is linear, so invariance '${requested}' removed an ` +
          'OFFSET, not a scale factor: a source read 10 % slow keeps that 10 % here, while the ' +
          'same mode removes it from tempo and dynamics',
      ),
    );
  return notes;
}

/**
 * the order on the notes: `(kind, dimension, startQuarters, document, message, site)`.
 *
 * the design names `site`, and a comparator that omits it leaves four Albert notes — one plausibility
 * finding raised in the global scope and in each of three part scopes — tied on every key with
 * four distinct serializations, their order decided by sort stability, i.e. by which document
 * was read first.
 *
 * The final tiebreak is the note's own serialization, which makes the order total by
 * construction: two notes that compare equal here are equal as data, so no orientation can
 * survive in the array, and a future field is covered the day it is added.
 */
export function compareNotes(x: ComparisonNote, y: ComparisonNote): number {
  return (
    compareText(x.kind, y.kind) ||
    compareText(x.dimension ?? '', y.dimension ?? '') ||
    (x.startQuarters ?? 0) - (y.startQuarters ?? 0) ||
    compareText(x.document ?? '', y.document ?? '') ||
    compareText(x.message, y.message) ||
    compareText(JSON.stringify(x), JSON.stringify(y))
  );
}

export function sortNotes(notes: readonly ComparisonNote[]): readonly ComparisonNote[] {
  // Decorated, because the final tiebreak serializes and a comparison sort would do it
  // O(n log n) times per note otherwise. The key is built once and the order is the same.
  return [...notes]
    .map((note) => ({ note, key: JSON.stringify(note) }))
    .sort(
      (x, y) =>
        compareText(x.note.kind, y.note.kind) ||
        compareText(x.note.dimension ?? '', y.note.dimension ?? '') ||
        (x.note.startQuarters ?? 0) - (y.note.startQuarters ?? 0) ||
        compareText(x.note.document ?? '', y.note.document ?? '') ||
        compareText(x.note.message, y.note.message) ||
        compareText(x.key, y.key),
    )
    .map((entry) => entry.note);
}

/** Code-unit order, never `localeCompare` — the report must not depend on a locale. */
function compareText(x: string, y: string): number {
  return x < y ? -1 : x > y ? 1 : 0;
}

export function effectiveJnd(overrides: JndOverrides): Record<ComparisonJndKey, number> {
  return fromEntriesExact(COMPARISON_JND_KEYS, (key) => comparisonRowWith(key, overrides).jnd);
}

export function resolvedSettings(
  options: InteriorCompareOptions,
  pair: ComparisonPair,
): ResolvedComparisonSettings {
  const plausibleRange: Partial<Record<ComparisonJndKey, readonly [number, number]>> = {};
  for (const key of COMPARISON_JND_KEYS) {
    const band = options.plausibleRange[key] ?? comparisonRowFor(key).plausibleRange;
    if (band !== null) plausibleRange[key] = band;
  }
  return {
    window: { start: pair.window.startQuarters, end: pair.window.endQuarters },
    weights: { ...options.weights },
    jnd: effectiveJnd(options.jnd),
    plausibleRange,
    invariance: { ...options.invariance },
  };
}

// ---------------------------------------------------------------------------
// Profiles
// ---------------------------------------------------------------------------

function profilesOf(
  options: InteriorCompareOptions,
  evaluations: ReadonlyMap<ComparisonDimension, readonly DimensionEvaluation[]>,
  pair: ComparisonPair,
  notes: ComparisonNote[],
): Record<ComparisonDimension, ComparisonProfile> | null {
  const profile = options.profile;
  if (profile == null) return null;

  const requested = new Set<ComparisonDimension>(profile.dimensions ?? COMPARISON_DIMENSIONS);
  const grid = profile.grid ?? 'refinement';

  return fromEntriesExact(COMPARISON_DIMENSIONS, (dimension) => {
    const rows = evaluations.get(dimension) ?? [];
    return requested.has(dimension)
      ? profileOf(dimension, rows, grid, pair, notes)
      : emptyProfile(rows);
  });
}

function emptyProfile(rows: readonly DimensionEvaluation[]): ComparisonProfile {
  // A dimension evaluated over no scope has no unit and no space to report — the `?? …`
  // defaults below.
  const first = elementAtOrNull(rows, 0);
  return {
    dates: [],
    density: [],
    signed: [],
    valueA: null,
    valueB: null,
    space: first?.space ?? 'event',
    unit: first?.unit ?? 'dimensionless',
  };
}

function profileOf(
  dimension: ComparisonDimension,
  rows: readonly DimensionEvaluation[],
  grid: 'refinement' | { readonly step: number },
  pair: ComparisonPair,
  notes: ComparisonNote[],
): ComparisonProfile {
  const dates = profileDates(rows, grid, pair, dimension, notes);
  const density = dates.map((quarters) => densityAtOf(rows, quarters));
  const signed = dates.map((quarters) => signedAtOf(rows, quarters));
  const shared = sharedCurves(rows, dates);
  // A dimension evaluated over no scope has no unit and no space to report — the `?? …`
  // defaults below.
  const first = elementAtOrNull(rows, 0);

  return {
    dates,
    density,
    signed,
    valueA: shared === null ? null : shared.a,
    valueB: shared === null ? null : shared.b,
    space: first?.space ?? 'event',
    unit: first?.unit ?? 'dimensionless',
  };
}

function profileDates(
  rows: readonly DimensionEvaluation[],
  grid: 'refinement' | { readonly step: number },
  pair: ComparisonPair,
  dimension: ComparisonDimension,
  notes: ComparisonNote[],
): readonly number[] {
  const start = pair.window.startQuarters;
  const end = pair.window.endQuarters;

  if (grid === 'refinement') {
    const points = new Set<number>([start]);
    for (const row of rows)
      for (const cell of row.cells)
        if (cell.startQuarters >= start && cell.startQuarters < end) points.add(cell.startQuarters);
    const sorted = [...points].sort((x, y) => x - y);
    if (sorted.length <= PROFILE_MAX_POINTS) return sorted;
    notes.push(
      note(
        'grid-truncated',
        dimension,
        null,
        start,
        end,
        `the refinement grid carries ${String(sorted.length)} cells and the profile is capped ` +
          `at ${String(PROFILE_MAX_POINTS)} points; every other edge was kept`,
      ),
    );
    const stride = Math.ceil(sorted.length / PROFILE_MAX_POINTS);
    return sorted.filter((_value, index) => index % stride === 0);
  }

  const step = grid.step;
  const count = Math.floor((end - start) / step);
  if (count + 1 > PROFILE_MAX_POINTS) {
    // Both steps, requested and actual: the factor is not small — an explicit 0.001
    // over a 198-quarter window is coarsened 48×.
    const coarse = (end - start) / (PROFILE_MAX_POINTS - 1);
    notes.push(
      note(
        'grid-truncated',
        dimension,
        null,
        start,
        end,
        `a step of ${String(step)} quarters would produce ${String(count + 1)} points; the ` +
          `profile is capped at ${String(PROFILE_MAX_POINTS)} and the step used was ` +
          `${String(coarse)} quarters, coarser by a factor of ${String(coarse / step)}`,
      ),
    );
    return Array.from({ length: PROFILE_MAX_POINTS }, (_value, index) => start + index * coarse);
  }
  return Array.from({ length: count + 1 }, (_value, index) => start + index * step);
}

/**
 * `p_k(t)`, summed over the scope rows and over the cells covering the point.
 *
 * A cell with no pointwise density contributes its mean — `aggregate.ts`'s own fallback one level
 * up, and the reason `cellQuantizedDimensions` exists: the profile then reports a staircase where
 * the true density has a shape, and the report says which dimension it is.
 */
function densityAtOf(rows: readonly DimensionEvaluation[], quarters: number): number {
  const total = new CompensatedSum();
  for (const row of rows)
    for (const cell of row.cells) {
      if (quarters < cell.startQuarters || quarters >= cell.endQuarters) continue;
      const length = cell.endQuarters - cell.startQuarters;
      if (cell.densityAt !== null) total.add(cell.densityAt(quarters));
      else if (length > 0) total.add(cell.mass / length);
    }
  return total.total;
}

function signedAtOf(rows: readonly DimensionEvaluation[], quarters: number): number {
  const total = new CompensatedSum();
  for (const row of rows) if (row.signedAt !== null) total.add(row.signedAt(quarters));
  return total.total;
}

/**
 * The two T-space curves, but only where every scope row agrees on them.
 *
 * With one scope this is that scope's pair. With several it is the pair they share — the
 * ordinary case, since a part with no map of its own inherits the global one — and null where
 * the parts genuinely carry different curves, because there is no single curve to export and
 * picking the first part's would be a claim the document does not make.
 */
function sharedCurves(
  rows: readonly DimensionEvaluation[],
  dates: readonly number[],
): { readonly a: readonly number[]; readonly b: readonly number[] } | null {
  const withCurves = rows.filter((row) => row.valueA !== null && row.valueB !== null);
  if (!isNonEmpty(withCurves) || withCurves.length !== rows.length) return null;

  const first = head(withCurves);
  const a: number[] = [];
  const b: number[] = [];
  for (const quarters of dates) {
    // "Every scope agrees at this date" is a statement about the first scope's value, so that
    // value is taken once and the rest are compared against it.
    const valueA = first.valueA?.(quarters) ?? 0;
    const valueB = first.valueB?.(quarters) ?? 0;
    if (withCurves.some((row) => (row.valueA?.(quarters) ?? 0) !== valueA)) return null;
    if (withCurves.some((row) => (row.valueB?.(quarters) ?? 0) !== valueB)) return null;
    a.push(valueA);
    b.push(valueB);
  }
  return { a, b };
}
