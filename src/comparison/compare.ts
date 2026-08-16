/**
 * The interior driver: two documents in, one §9.3 report out.
 *
 * Everything below this file computes one dimension over one scope; everything above it
 * validates options and types errors. This is where the eleven dimensions become a comparison —
 * one window, one settings record, one aggregate density, one closing table.
 *
 * ## Scopes, and how the parts are summed
 *
 * §5.0 evaluates per part, and AD-3's document-level rule is a SUM over the union of both
 * documents' parts. Two things follow, and they aggregate differently on purpose:
 *
 * - **Mass is additive.** Two parts deviating at bar 5 put twice the mass at bar 5, so cells and
 *   atoms are concatenated and the aggregate density is their sum. Overlapping cells are not a
 *   defect here; they are what `p_k(t) = Σ_parts p_{k,part}(t)` means.
 * - **A mean is not.** §1.2's decomposition takes moments, and P parts are P curves, not one. So
 *   the merged decomposition is taken over the DISJOINT UNION of the parts' curves — part `p`
 *   occupies `[p·L, (p+1)·L)` of a virtual abscissa — which is exact, degenerates correctly when
 *   every part inherits one global map (P identical copies have the copy's moments), and needs
 *   no arbitrary choice of a representative part.
 *
 * A document with no `<part>` at all evaluates once in the global scope, which is §5.0's own
 * rule and matches the renderer: an MSM part with no MPM counterpart inherits the global maps
 * wholesale (see `dimensions.ts`'s header for the measurement and for where that departs from
 * AD-3's wording).
 *
 * ## What is a distance and what is a descriptor
 *
 * `distance`, `mean`, the table and the matrices are distances. `meanSigned`, `levelSigned`,
 * `direction`, `cumulativeDrift` and the profile's `signed` series are DESCRIPTORS (§7.5, C2):
 * they enter no `d_k`, no `D` and no table cell, and they do not satisfy the triangle
 * inequality. The report keeps them in separate fields for that reason and the docs say it once,
 * prominently.
 */
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
import { beatGridOf, measurePositionAt, readComparisonMsm, type ComparisonMsm } from './msm.js';
import { plausibilityFindings, type PlausibleRanges } from './plausibility.js';
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
 * §5.0's per-family accuracy record, in BOTH units (AD-28.2).
 *
 * Every figure is measured and its measurement is on the campaign record; none is a target.
 * `relative` is the classical quadrature figure and `jnd` is the same error on the dimension's
 * own perceptual scale — which is the one that says whether the number is fit for purpose,
 * because the metric requirement is JND-scale exactness and the relative figures are numerical
 * hygiene above it.
 */
const EPSILON_FIGURES: Readonly<
  Record<EpsilonFamily, { readonly relative: number; readonly jnd: number }>
> = Object.freeze({
  // Piecewise-constant readings: the cell integral is `density × length`, with no quadrature
  // in the time domain at all (§5.7, §5.9).
  step: { relative: 0, jnd: 0 },
  // AD-28.1's graded mesh, worst case over the legal `meanTempoAt` range; the JND figure is
  // AD-28.2's, corrected for AD-27.6's halved constant.
  tempo: { relative: 3.3e-6, jnd: 5.4e-4 },
  // The ideal-curve inversion's conditioning limit at `curvature = 1`, where `x'(0.5) = 0` and
  // a cube-root loss leaves ~6e-4 volume units; every interior curvature is exact to 1e-9.
  bezier: { relative: 6e-6, jnd: 2e-5 },
  // `W₁` against six closed forms, and `Φ` at 1.7e-15 absolute in the left tail.
  imprecision: { relative: 3.6e-16, jnd: 3.6e-16 },
  // The drift is a SECONDS quantity and has no JND scale; the 0 is not a claim of exactness
  // but the true statement that this family contributes no JND-scale error to any distance,
  // because the drift enters no `d_k`.
  drift: { relative: 1e-9, jnd: 0 },
});

/**
 * A FRESH copy per report, never the frozen table itself.
 *
 * RULE I3(b): every level of a facade result is freshly allocated, so that a consumer's `===`
 * memoization sees a change when one occurred. Handing out the module-level constant would make
 * two comparisons share an object, which `tests/api/plain-data.test.ts` checks for and which is
 * a real hazard for a React-shaped consumer rather than a formality.
 */
export function epsilonRecord(): Record<
  EpsilonFamily,
  { readonly relative: number; readonly jnd: number }
> {
  return Object.fromEntries(
    Object.entries(EPSILON_FIGURES).map(([family, figures]) => [family, { ...figures }]),
  ) as Record<EpsilonFamily, { relative: number; jnd: number }>;
}

/** §7.5's threshold for calling a segment's direction `'mixed'` [convention]. */
const MIXED_DIRECTION_FRACTION = 0.5;

/** C7's same-piece heuristic: below this length ratio the pair is flagged [convention]. */
const SUSPECT_LENGTH_RATIO = 0.5;

/** C1's step cap: a profile is a report field, not a sample buffer. */
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
  const sides = scopeSides(pair);

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
          'accentuation phase is anchored to the first: AD-12’s forward-only walk needs the ' +
          'evaluator to take a grid function, which this wave does not ship',
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
        `an explicit window was given and outranks the MSM (AD-27.1); the MSM’s score end is ` +
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

  const densities: DimensionDensity[] = [];
  for (const dimension of COMPARISON_DIMENSIONS)
    densities.push(densityOf(dimension, evaluations.get(dimension) ?? [], ticksPerQuarter));

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
          'every length-normalized mean is null rather than a division by zero (§9.6)',
      ),
    );
  const signedDensity = aggregateSignedDensity(evaluations, options.weights);

  // Every dimension's report row, plus the notes its evaluation produced.
  const dimensions = {} as Record<ComparisonDimension, DimensionComparison>;
  for (const dimension of COMPARISON_DIMENSIONS) {
    const rows = evaluations.get(dimension) ?? [];
    const bothNeutral = sides.every(
      ([a, b]) => !hasEntries(a, dimension) && !hasEntries(b, dimension),
    );
    dimensions[dimension] = dimensionComparison(
      dimension,
      rows,
      options.weights[dimension],
      options.jnd,
      windowLength,
      bothNeutral,
    );
    for (const raw of rows.flatMap((row) => row.notes)) notes.push(fromRawNote(raw));
    notes.push(...invarianceNotes(dimension, rows, options.invariance[dimension], bothNeutral, pair));
    if (rows.some((row) => row.cappedCells > 0))
      notes.push(
        note(
          'capped',
          dimension,
          null,
          pair.window.startQuarters,
          pair.window.endQuarters,
          `§4’s cap bound in ${String(rows.reduce((sum, row) => sum + row.cappedCells, 0))} ` +
            'cells: an incomparable or runaway difference is priced at 2·δ_row, which is what ' +
            'keeps the triangle inequality intact when a ⊥ document is the middle term',
        ),
      );
  }

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

  const suspectPair =
    pair.comparability.lengthRatio < SUSPECT_LENGTH_RATIO ||
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
        'the two documents may not encode the same piece: their lengths differ by more than a ' +
          'factor of two, or they share no part number (C7)',
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
    remainder: { mass: pass.remainderMass },
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
    notes: sortNotes(notes),
  };
}

// ---------------------------------------------------------------------------
// Scopes
// ---------------------------------------------------------------------------

/**
 * The scope pairs to evaluate: every part, or the global scope alone.
 *
 * A side with no scope for a part row takes its own GLOBAL scope, which is exactly
 * `resolvePartMaps(null, globalMaps)` — see `dimensions.ts`'s header for the pipeline
 * measurement and for where that departs from AD-3's wording.
 */
function scopeSides(pair: ComparisonPair): readonly (readonly [ScopeSide, ScopeSide])[] {
  const globalA = pair.a.scopes.find((scope) => scope.scope === 'global');
  const globalB = pair.b.scopes.find((scope) => scope.scope === 'global');
  if (globalA === undefined || globalB === undefined)
    throw new Error('comparison: a performance with no global scope');

  const partRows = pair.scopes.filter((pairing) => pairing.scope === 'part');
  if (partRows.length === 0)
    return [
      [
        { role: 'a', document: pair.a, scope: globalA },
        { role: 'b', document: pair.b, scope: globalB },
      ],
    ];

  return partRows.map(
    (pairing) =>
      [
        { role: 'a', document: pair.a, scope: pairing.a ?? globalA },
        { role: 'b', document: pair.b, scope: pairing.b ?? globalB },
      ] as const,
  );
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
        // §7.1's `κ`, applied exactly where an event's JND becomes commensurable with a
        // QUARTER of sustained deviation — which is the whole content of the constant.
        mass: atom.mass * EVENT_KAPPA_QUARTERS,
      });
  }

  return { dimension, cells, atoms, distance: total.total };
}

/** `Σ_k ω_k p̃_k(t)` — the SIGNED aggregate density, in JND per quarter (C2, §7.5). */
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

  const withCurves = rows.filter((row) => row.meanSigned !== null);
  const meanSigned =
    withCurves.length === 0
      ? null
      : withCurves.reduce((sum, row) => sum + (row.meanSigned ?? 0), 0) / withCurves.length;

  const rowDistances = new Map<ComparisonJndKey, number>();
  for (const row of rows)
    for (const entry of row.rowDistances)
      rowDistances.set(entry.key, (rowDistances.get(entry.key) ?? 0) + entry.distance);

  const first = rows[0] as DimensionEvaluation | undefined;

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
    // The `⊥` length is a fraction of the WINDOW, so parts take the maximum rather than the
    // sum: two parts both blind for the first bar leave one bar of the window unreadable, not
    // two.
    bottomLengthQuarters: Math.max(0, ...rows.map((row) => row.bottomLengthQuarters)),
    cappedCells: rows.reduce((sum, row) => sum + row.cappedCells, 0),
    decomposition: mergedDecomposition(rows),
    timeSignatureSource: rows.find((row) => row.timeSignatureSource !== null)?.timeSignatureSource ?? null,
    datePositionKnown: rows.every((row) => row.datePositionKnown),
  };
}

/**
 * §1.2's decomposition over the DISJOINT UNION of the scope rows' curves.
 *
 * With one scope this is the row's own decomposition. With several it is the decomposition of
 * the concatenation — part `p` on `[p·L, (p+1)·L)` — which is the only reading that needs no
 * arbitrary representative part and that degenerates correctly when every part inherits one
 * global map: P identical copies have the copy's moments.
 */
function mergedDecomposition(rows: readonly DimensionEvaluation[]): Decomposition | null {
  const withCurves = rows.filter((row) => row.decomposition !== null);
  if (withCurves.length === 0) return null;
  const unit = withCurves[0].unit;
  if (withCurves.length === 1) {
    const only = withCurves[0].decomposition as Omit<Decomposition, 'unit'>;
    return { ...only, unit };
  }

  // Distribution dimensions carry a decomposition without a sampler, so there is nothing to
  // concatenate; their terms are already μ-weighted means over the window and averaging them
  // over parts is the same operation the union would perform.
  const samplers = withCurves.filter((row) => row.valueA !== null && row.valueB !== null);
  if (samplers.length !== withCurves.length) return averagedDecomposition(unit, withCurves);
  return unionDecomposition(unit, samplers);
}

function averagedDecomposition(
  unit: string,
  rows: readonly DimensionEvaluation[],
): Decomposition {
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
    return { row, start: grid[0], end: grid[grid.length - 1] };
  });
  const length = spans[0].end - spans[0].start;

  // The virtual abscissa: row `p` occupies `[p·length, (p+1)·length)`.
  const locate = (x: number): { row: DimensionEvaluation; quarters: number } => {
    const index = Math.min(rows.length - 1, Math.max(0, Math.floor(x / Math.max(length, 1e-12))));
    const span = spans[index];
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
      if (grid.length === 0 || x > grid[grid.length - 1]) grid.push(x);
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

/** `∫ g dx / L` over a grid that partitions it. */
function integrateOverGrid(g: (x: number) => number, grid: readonly number[]): number {
  if (grid.length < 2) return 0;
  const length = grid[grid.length - 1] - grid[0];
  if (!(length > 0)) return 0;
  const total = new CompensatedSum();
  for (let i = 0; i < grid.length - 1; ++i) total.add(gaussLegendre10(g, grid[i], grid[i + 1]));
  return total.total / length;
}

function momentsOverGrid(
  g: (x: number) => number,
  grid: readonly number[],
): { mean: number; sigma: number } {
  const mean = integrateOverGrid(g, grid);
  const variance = integrateOverGrid((x) => (g(x) - mean) * (g(x) - mean), grid);
  const scale = Math.max(Math.abs(mean), 1);
  // AD-32's floor: a constant curve integrated by quadrature has a variance of order 1e-31,
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
    measure:
      msm === null
        ? null
        : measureRange(msm, segment.startQuarters, segment.endQuarters),
    mass: segment.mass,
    peak: segment.peak,
    mean: segment.mean,
    peakAtQuarters: segment.peakAtQuarters,
    meanSigned,
    // 'mixed' where the signed integral's magnitude is below a documented fraction of the
    // absolute one — i.e. the segment changes sign inside itself, which is exactly the case a
    // signed mean alone would report as "no difference in direction" (§7.5).
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
  const [a, b] = sides[0];
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
 * different maps if §3's correspondence ever moves.
 */
function readScopeTempoView(side: ScopeSide) {
  return readScopeMapViews(side.scope).get(containerOf('tempo')) ?? null;
}

// ---------------------------------------------------------------------------
// Notes and settings
// ---------------------------------------------------------------------------

function note(
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

/** The interior's own note kinds, mapped onto §9.1's closed vocabulary. */
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
    // The readers name their findings after the mechanism that produced them — 'unresolved-def',
    // 'v3-shape', 'scale-zero', 'declared-law'. Every one of them is §3's structural channel:
    // read, consequential, and never folded into a distance.
    default:
      return 'structural';
  }
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

  // AD-25.1's document-content case, and the example the ruling names: a mode requested for a
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

  // C9's trap, in plain words. In a LINEAR space 'level' removes an additive offset only — the
  // multiplicative factor survives, because `c·x − mean(c·x) = c(x − mean x)` — while the same
  // mode removes a factor from a log space. A roll read 10 % slow has its inter-onset offsets
  // stretched 10 %, and this is the sentence §7.4 requires so that a report stamping
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
          'same mode removes it from tempo and dynamics (§7.4, C9)',
      ),
    );
  return notes;
}

/**
 * §9.5's total order on the notes: `(kind, dimension, startQuarters, message)`.
 *
 * The final tiebreak is the MESSAGE, and it is stated rather than left to sort stability: the
 * array's own order depends on which document was read first, so a stable sort would leak the
 * a/b orientation into the report and break P-C2.
 */
function sortNotes(notes: readonly ComparisonNote[]): readonly ComparisonNote[] {
  return [...notes].sort(
    (x, y) =>
      compareText(x.kind, y.kind) ||
      compareText(x.dimension ?? '', y.dimension ?? '') ||
      (x.startQuarters ?? 0) - (y.startQuarters ?? 0) ||
      compareText(x.document ?? '', y.document ?? '') ||
      compareText(x.message, y.message),
  );
}

/** Code-unit order, never `localeCompare` — the report must not depend on a locale (§9.5). */
function compareText(x: string, y: string): number {
  return x < y ? -1 : x > y ? 1 : 0;
}

function effectiveJnd(overrides: JndOverrides): Record<ComparisonJndKey, number> {
  return Object.fromEntries(
    COMPARISON_JND_KEYS.map((key) => [key, comparisonRowWith(key, overrides).jnd]),
  ) as Record<ComparisonJndKey, number>;
}

function resolvedSettings(
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
// Profiles (C1)
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

  const result = {} as Record<ComparisonDimension, ComparisonProfile>;
  for (const dimension of COMPARISON_DIMENSIONS) {
    const rows = evaluations.get(dimension) ?? [];
    if (!requested.has(dimension)) {
      result[dimension] = emptyProfile(rows);
      continue;
    }
    result[dimension] = profileOf(dimension, rows, grid, pair, notes);
  }
  return result;
}

function emptyProfile(rows: readonly DimensionEvaluation[]): ComparisonProfile {
  const first = rows[0] as DimensionEvaluation | undefined;
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
  const first = rows[0] as DimensionEvaluation | undefined;

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
    notes.push(
      note(
        'grid-truncated',
        dimension,
        null,
        start,
        end,
        `a step of ${String(step)} quarters would produce ${String(count + 1)} points; the ` +
          `profile is capped at ${String(PROFILE_MAX_POINTS)} and the step was coarsened`,
      ),
    );
    const coarse = (end - start) / (PROFILE_MAX_POINTS - 1);
    return Array.from({ length: PROFILE_MAX_POINTS }, (_value, index) => start + index * coarse);
  }
  return Array.from({ length: count + 1 }, (_value, index) => start + index * step);
}

/** `p_k(t)`, summed over the scope rows and over the cells covering the point. */
function densityAtOf(rows: readonly DimensionEvaluation[], quarters: number): number {
  const total = new CompensatedSum();
  for (const row of rows)
    for (const cell of row.cells) {
      if (quarters < cell.startQuarters || quarters >= cell.endQuarters) continue;
      total.add(cell.densityAt(quarters));
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
 * With one scope this is that scope's pair. With several it is the pair they SHARE — which is
 * the ordinary case, since a part with no map of its own inherits the global one — and null
 * where the parts genuinely carry different curves, because there is no single curve to export
 * and picking the first part's would be a claim about the piece that the document does not make.
 */
function sharedCurves(
  rows: readonly DimensionEvaluation[],
  dates: readonly number[],
): { readonly a: readonly number[]; readonly b: readonly number[] } | null {
  const withCurves = rows.filter((row) => row.valueA !== null && row.valueB !== null);
  if (withCurves.length === 0 || withCurves.length !== rows.length) return null;

  const a: number[] = [];
  const b: number[] = [];
  for (const quarters of dates) {
    const valuesA = withCurves.map((row) => row.valueA?.(quarters) ?? 0);
    const valuesB = withCurves.map((row) => row.valueB?.(quarters) ?? 0);
    if (valuesA.some((value) => value !== valuesA[0])) return null;
    if (valuesB.some((value) => value !== valuesB[0])) return null;
    a.push(valuesA[0]);
    b.push(valuesB[0]);
  }
  return { a, b };
}
