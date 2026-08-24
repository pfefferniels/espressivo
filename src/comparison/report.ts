/**
 * the report, declared in the interior and re-exported by the facade.
 *
 * The shapes live here rather than in `src/api/comparison.ts`, as the expression campaign's
 * `report.ts` does: the engine builds them and the facade hands them over unchanged (RULE F1).
 * The facade owns the OPTION types, the typed errors and the validation — the surface a caller
 * can get wrong — not the shape of a result the engine already produced.
 *
 * Everything here is plain data: no `undefined`, no `Map`, no class, every number finite or
 * `null`. The one deviation from the model as written is on {@link ComparisonInputs.settings}.
 */
import type { ComparisonDimension, ComparisonJndKey } from './registry.js';
import type { InvarianceMode } from './decomposition.js';
import type { MetricGuarantee, WindowRule } from './window.js';
import type { MeasureEntry, MeasurePosition } from './msm.js';

export type { MeasureEntry, MeasurePosition } from './msm.js';

/** the note vocabulary. */
export type ComparisonNoteKind =
  | 'structural'
  | 'renderer-default-level'
  | 'renderer-error'
  | 'renderer-skip'
  | 'inert-difference'
  | 'capped'
  | 'grid-truncated'
  | 'estimate-degradation'
  | 'option-unusable'
  | 'invariance-space'
  | 'plausibility'
  | 'length-mismatch';

export type DimensionState = 'compared' | 'both-neutral';
export type TimeSignatureSource = 'msm' | 'renderer-default';

/** Where in a document something was found. */
export interface ComparisonSiteRef {
  readonly document: 'a' | 'b';
  readonly scope: 'global' | 'part';
  readonly partIndex: number | null;
  readonly container: string;
  /** Quarters on the common grid; null when the `@date` is absent or unparseable. */
  readonly date: number | null;
  readonly index: number;
  readonly attribute: string;
  readonly xmlId: string | null;
}

export interface ComparisonNote {
  readonly kind: ComparisonNoteKind;
  readonly dimension: ComparisonDimension | null;
  readonly document: 'a' | 'b' | null;
  readonly itemIndex: number | null;
  readonly site: ComparisonSiteRef | null;
  readonly startQuarters: number | null;
  readonly endQuarters: number | null;
  readonly message: string;
}

/** interpretive, non-summing, and labelled as such. */
export interface Decomposition {
  /**
   * The T-space unit of `level`/`levelSigned`/`gain`: `'nepers'` for the log dimensions,
   * `'quarters'`/`'ms'`/`'velocity'`/`'ratio'` elsewhere. Natural log; ×1/ln 2 for log₂.
   */
  readonly unit: string;
  readonly level: number;
  /** `ℓ_A − ℓ_B`; > 0 means A faster/louder/later. A descriptor, never a distance. */
  readonly levelSigned: number;
  readonly gain: number;
  /** `√(2(1−r))`, dimensionless; null exactly when `shapeless`. */
  readonly shape: number | null;
  readonly r: number | null;
  readonly shapeless: boolean;
  readonly l2Squared: number;
}

export interface DimensionComparison {
  readonly state: DimensionState;
  /** JND·quarters. */
  readonly distance: number;
  /** JND; null exactly when the window has zero length. */
  readonly mean: number | null;
  /**
   * The T-space unit of `meanSigned`. MPM stores BPM, a RATE, so on tempo a positive
   * `meanSigned` means A is FASTER — the opposite of the seconds-per-beat convention much of the
   * literature uses.
   */
  readonly unit: string;
  /**
   * the signed descriptor, in {@link unit} — never a distance.
   *
   * Averaged over the evaluated scopes, where `distance` is SUMMED.
   * Mass is additive across parts and a level is not: summing three parts' "A is 4 BPM faster"
   * would report 12 BPM, a figure no part carries. `distance` and `meanSigned` therefore do not
   * stand in a ratio to each other on a multi-part pair.
   */
  readonly meanSigned: number | null;
  readonly weight: number;
  /** The mode actually applied — `'none'` where the requested one could not be honoured. */
  readonly invariance: InvarianceMode;
  readonly rows: readonly {
    readonly key: ComparisonJndKey;
    /**
     * JND·quarters. A dimension whose rows are priced JOINTLY through one curve integral
     * attributes the whole of `d_k` to the row carrying the curve and 0 to the rest: the
     * breakdown shows what `ω = 1` weights, and for a curve dimension that is one curve.
     */
    readonly distance: number;
    readonly unit: string;
    readonly jnd: number;
    readonly delta: number;
  }[];
  readonly events: {
    readonly matched: number;
    readonly unmatchedA: number;
    readonly unmatchedB: number;
    readonly mass: number;
  };
  readonly bottomLengthQuarters: number;
  readonly cappedCells: number;
  readonly decomposition: Decomposition | null;
  /** Accentuation only; null elsewhere. */
  readonly timeSignatureSource: TimeSignatureSource | null;
  /** False when id-anchored atoms lack an MSM. */
  readonly datePositionKnown: boolean;
}

export interface ComparisonSegment {
  readonly startQuarters: number;
  readonly endQuarters: number;
  readonly lengthQuarters: number;
  readonly measure: { readonly start: MeasurePosition; readonly end: MeasurePosition } | null;
  /** JND·quarters. */
  readonly mass: number;
  /** JND per quarter. */
  readonly peak: number;
  readonly mean: number;
  readonly peakAtQuarters: number;
  /** Aggregate-derived, so JND per quarter and NOT a T-space unit. */
  readonly meanSigned: number;
  readonly direction: 'a-greater' | 'b-greater' | 'mixed';
  readonly rank: number;
}

/** the rows × (segments + remainder) table, row-major. */
export interface AttributionTable {
  readonly dimensions: readonly ComparisonDimension[];
  readonly columnCount: number;
  /** Unweighted `c_{k,s}`; length = `dimensions.length × columnCount`. */
  readonly cells: readonly number[];
  readonly rowSums: readonly number[];
  readonly columnSums: readonly number[];
  readonly total: number;
  /** Pinned ≤ 1e−12·D. */
  readonly residual: number;
}

/** The six epsilon families, each in BOTH units. */
export type EpsilonFamily = 'step' | 'tempo' | 'bezier' | 'rubato' | 'imprecision' | 'drift';

/**
 * Which epsilon family each dimension's quadrature belongs to.
 *
 * The families are about the INTEGRATOR, not the dimension: a piecewise-constant curve
 * integrates exactly (`step`), a `meanTempoAt` power curve carries the graded-mesh error
 * (`tempo`), a Bézier transition the inversion's conditioning limit (`bezier`), a warp
 * displacement through the rule 2c that integrator's residual (`rubato`), and
 * the three distribution dimensions the Wasserstein machinery's (`imprecision`). A dimension
 * that can take more than one shape is filed under the WORST it can reach, which is what keeps
 * the record an upper bound.
 */
export const EPSILON_FAMILY_OF: Readonly<Record<ComparisonDimension, EpsilonFamily>> =
  Object.freeze({
    tempo: 'tempo',
    // A `<dynamics>` transition is a Bézier, so this dimension can reach the bezier family.
    dynamics: 'bezier',
    // its OWN family. `rubatoDistance` integrates a warp displacement through rule 2c
    // (structural `u*` split + K=16 mesh), so the `step` family's "no quadrature in the time
    // domain at all" is false of it — measured at 7.51e-5 relative on the vendored corpus.
    rubato: 'rubato',
    asynchrony: 'step',
    // the pattern interpolates linearly between beats, but a transition inside a pattern is
    // the same Bézier machinery the dynamics curve uses.
    accentuation: 'bezier',
    pedal: 'bezier',
    // Both event dimensions price per anchor with no time-domain quadrature at all, and
    // articulation's default step function is a step reading.
    articulation: 'step',
    ornamentation: 'step',
    imprecisionTiming: 'imprecision',
    imprecisionDynamics: 'imprecision',
    imprecisionDuration: 'imprecision',
  });

export interface ComparisonInputs {
  /**
   * The fully resolved settings — never the documents.
   *
   * The model writes this as `Required<ComparisonSettings>`; the resolved form is STRONGER, filling
   * every dimension of `weights` and `invariance` and every key of `jnd`, which `Required<>`
   * cannot express since it removes top-level optionality only.
   */
  readonly settings: ResolvedComparisonSettings;
  readonly jnd: Record<ComparisonJndKey, number>;
  readonly msmUsed: boolean;
  readonly epsilon: Record<EpsilonFamily, { readonly relative: number; readonly jnd: number }>;
}

/** The knobs that define the metric, with every default filled in. */
export interface ResolvedComparisonSettings {
  readonly window: { readonly start: number; readonly end: number };
  readonly weights: Record<ComparisonDimension, number>;
  readonly jnd: Record<ComparisonJndKey, number>;
  readonly plausibleRange: Partial<Record<ComparisonJndKey, readonly [number, number]>>;
  readonly invariance: Record<ComparisonDimension, InvarianceMode>;
}

export interface ComparisonProfile {
  /** Quarters, left edges. */
  readonly dates: readonly number[];
  /** `p_k`, JND per quarter. */
  readonly density: readonly number[];
  /** the signed series, JND per quarter. */
  readonly signed: readonly number[];
  /** The T-space curve; null for the event and distribution dimensions. */
  readonly valueA: readonly number[] | null;
  readonly valueB: readonly number[] | null;
  readonly space: string;
  readonly unit: string;
}

export interface ComparisonReport {
  readonly inputs: ComparisonInputs;
  readonly window: {
    readonly startQuarters: number;
    readonly endQuarters: number;
    readonly rule: WindowRule;
    readonly metricGuarantee: MetricGuarantee;
  };
  readonly ppq: {
    readonly a: number;
    readonly b: number;
    readonly lcm: number;
    /** Exactly one thing: a document declared no `@pulsesPerQuarter`. */
    readonly fallbackUsed: boolean;
    readonly assumed: number | null;
    /** the third state: the raw text of a declared-but-unusable value, per document. */
    readonly unusableDeclaration: { readonly a: string | null; readonly b: string | null };
  };
  /** The two documents' own `<part>` sets, matched by `@number` — a fact about the MPMs. */
  readonly parts: readonly {
    readonly numberA: number | null;
    readonly numberB: number | null;
    readonly nameA: string | null;
    readonly nameB: string | null;
    readonly matched: boolean;
  }[];
  /**
   * What the per-part SUM actually counted, and which document decided it.
   *
   * `count` is a multiplier on every `d_k` and on `D`, so it is reported rather than inferred
   * from `parts`: the two differ whenever an MPM declares a `<part>` the score does not name, or
   * the other way round. `'msm'` is the counted quantity — one scope per rendered MSM part, what
   * `renderParts` iterates; `'mpm'` is the estimate available without a score and carries an
   * `estimate-degradation` note; `'global'` is the single evaluation a pair with no parts on
   * either side gets.
   */
  readonly scopes: { readonly rule: 'msm' | 'mpm' | 'global'; readonly count: number };
  readonly comparability: {
    readonly lastDateA: number;
    readonly lastDateB: number;
    readonly lengthRatio: number;
    readonly ppqA: number;
    readonly ppqB: number;
    readonly partCountA: number;
    readonly partCountB: number;
    readonly partNumbersMatched: boolean;
    readonly instructionCountA: number;
    readonly instructionCountB: number;
    /** the heuristic: the pair may not encode the same piece. */
    readonly suspectPair: boolean;
  };
  /** Null exactly when no MSM was supplied. */
  readonly measures: readonly MeasureEntry[] | null;
  readonly dimensions: Record<ComparisonDimension, DimensionComparison>;
  readonly aggregate: {
    /** `D`, JND·quarters — additive and length-dependent. */
    readonly distance: number;
    /** `D / L`, JND — the human headline; null exactly when `L = 0`. */
    readonly mean: number | null;
    readonly weights: Record<ComparisonDimension, number>;
    readonly normalization: 'fixed' | 'corpus';
  };
  readonly segments: readonly ComparisonSegment[];
  /**
   * the below-threshold column. `mass` is a MASS and is therefore `≥ 0`.
   *
   * Computed by subtraction from the row total, which is what makes the table close exactly, so
   * it inherits the root refinement's quadrature error with the opposite sign and can go
   * slightly negative — measured on four of the seven vendored pairs, and invisible to the finiteness check
   * because a negative mass is still finite. `quadratureUnderflow` is how far below
   * zero the subtraction went before the clamp, `≥ 0` and usually exactly 0.
   */
  readonly remainder: { readonly mass: number; readonly quadratureUnderflow: number };
  /**
   * the dimensions whose threshold crossings were located at CELL resolution rather
   * than exactly.
   *
   * the design refines a segment boundary to the root of `p_D − τ_D`, which needs `p_k` at a
   * point. A dimension supplying no pointwise density falls back to its cell's mean, so its
   * boundaries can sit a cell away from the true crossing. Empty is the good case, and common.
   */
  readonly cellQuantizedDimensions: readonly ComparisonDimension[];
  readonly table: AttributionTable;
  readonly equivalence: {
    readonly subThresholdMassFraction: number;
    readonly aboveThresholdLengthFraction: number;
    readonly byDimension: Record<
      ComparisonDimension,
      {
        readonly subThresholdMassFraction: number;
        readonly aboveThresholdLengthFraction: number;
      }
    >;
  };
  /** Null exactly when the tempo dimension reads `⊥` on both sides. */
  readonly cumulativeDrift: {
    readonly secondsA: number;
    readonly secondsB: number;
    readonly difference: number;
    readonly ratio: number;
    readonly maxAbsMs: number;
  } | null;
  /** Null exactly when `options.profile` was omitted. */
  readonly profiles: Record<ComparisonDimension, ComparisonProfile> | null;
  /**
   * the scape of the aggregate density; null exactly when `options.scape` was omitted.
   *
   * `cells[scapeIndex(bins, size, start)]` is the aggregate mass over that sub-window, in
   * JND·quarters — the measure the segments are cut out of, so a scape cell and a segment mass
   * are the same units. The last entry is the whole window and equals `aggregate.distance`.
   */
  readonly scape: { readonly bins: number; readonly cells: readonly number[] } | null;
  readonly notes: readonly ComparisonNote[];
}

export interface ComparisonResult {
  readonly report: ComparisonReport;
}

// ---------------------------------------------------------------------------
// the edit path
// ---------------------------------------------------------------------------

/**
 * One op of an edit script, delivered in application (date) order and carrying both orders.
 *
 * `cost` is the SEQUENTIAL price in the delivered order, so the ops of one script sum to
 * that script's `replayedDelta` exactly. `free` is cost 0 by pricing — the state performs the
 * same function before and after the op — never cost 0 by coincidence of rounding.
 */
export interface EditOp {
  readonly op: 'insert' | 'delete' | 'substitute' | 'fragment' | 'consolidate';
  readonly map: string;
  readonly part: number | null;
  readonly site: ComparisonSiteRef;
  readonly dateA: number | null;
  readonly dateB: number | null;
  readonly measureA: MeasurePosition | null;
  readonly measureB: MeasurePosition | null;
  readonly attributes: readonly EditOpAttribute[];
  /**
   * How many instructions the op consumes on each side.
   *
   * `1` and `1` for a substitution, `1` and `0` for a deletion; on a `fragment` or
   * `consolidate` one of the two is greater, and an op saying "consolidate" without saying how
   * many were consolidated would not be actionable. The model does not declare the field, but the two
   * move kinds it does declare make it necessary.
   */
  readonly count: { readonly a: number; readonly b: number };
  /** JND·quarters, sequential. */
  readonly cost: number;
  readonly free: boolean;
  readonly applicationIndex: number;
  readonly costRank: number;
}

/**
 * One attribute the op changes, priced by the capped local metric.
 *
 * `deltaJnd` is `localDistance` — `min(|T(x) − T(y)|/jnd, 2·δ_row)`, with an ABSENT attribute
 * read as `⊥` and therefore priced at `δ_row`, the rule for a value with no comparable
 * counterpart. A REPORTING figure beside the op, never the op's price, which is `EditOp.cost`.
 */
export interface EditOpAttribute {
  readonly key: ComparisonJndKey;
  readonly name: string;
  readonly valueA: number | string | null;
  readonly valueB: number | string | null;
  readonly deltaJnd: number;
}

export interface EditScript {
  readonly part: number | null;
  readonly map: string;
  readonly dimension: ComparisonDimension;
  /** Date order. */
  readonly ops: readonly EditOp[];
  /** Indices into {@link ops}, cost-descending — U3's "what matters most". */
  readonly topByCost: readonly number[];
  /** The `boundary_prf` derivation is a division rather than a scan. */
  readonly opCounts: {
    readonly insert: number;
    readonly delete: number;
    readonly substitute: number;
    readonly fragment: number;
    readonly consolidate: number;
    readonly free: number;
  };
}

export interface DiffReport {
  /** The same provenance block the comparison reports. */
  readonly inputs: ComparisonReport['inputs'];
  readonly window: ComparisonReport['window'];
  readonly ppq: ComparisonReport['ppq'];
  readonly parts: ComparisonReport['parts'];
  readonly scopes: ComparisonReport['scopes'];
  /** One per (part, map) that carries at least one op, in a pinned order. */
  readonly scripts: readonly EditScript[];
  readonly dimensions: Record<
    ComparisonDimension,
    {
      /**
       * `d_k` summed over the evaluated scopes — the lower bound both totals are theorems
       * about, and the RAW one: the invariance modes rescale by a document's own moments,
       * an intermediate edit state is not a document, so the edit path prices without them and
       * this figure is stated on the same footing.
       */
      readonly dCurve: number | null;
      readonly scriptCost: number;
      readonly replayedDelta: number;
      /** `scriptCost − dCurve`, `≥ 0` by the theorem up to the per-family quadrature ε. */
      readonly reworking: number;
      /**
       * `norm(Φ(state after the last op), Φ(B))`, summed over scopes — the verification.
       * Exactly 0 for every document this engine can produce, and shipped rather than asserted
       * internally so a reader can see the replay reached B.
       */
      readonly replayResidual: number;
    }
  >;
  readonly notes: readonly ComparisonNote[];
}

export interface DiffResult {
  readonly report: DiffReport;
}

// ---------------------------------------------------------------------------
// the corpus level
// ---------------------------------------------------------------------------

export interface CorpusReport {
  readonly n: number;
  /** Unique after expansion; the ONLY place a string appears — everything else indexes. */
  readonly labels: readonly string[];
  /** the rows, one per expanded performance. */
  readonly items: readonly {
    readonly itemIndex: number;
    readonly performance: string;
  }[];
  readonly matrices: {
    /** `N²`, row-major, `m[i*n + j]`; `m[i*n+j] === m[j*n+i]` bit for bit and `m[i*n+i] === 0`. */
    readonly aggregate: readonly number[];
    readonly byDimension: Record<ComparisonDimension, readonly number[]>;
  };
  readonly dendrogram: {
    readonly merges: readonly {
      readonly left: number;
      readonly right: number;
      readonly height: number;
      readonly size: number;
    }[];
    readonly order: readonly number[];
  };
  /** Indices into {@link labels}; null unless `k` was requested. */
  readonly medoids: readonly number[] | null;
  readonly clusters: readonly number[] | null;
  readonly silhouette: readonly number[] | null;
  /** False below 20 items, where the figure is noisy — a field, not prose. */
  readonly silhouetteReliable: boolean;
  readonly embedding: {
    readonly coordinates: readonly number[];
    readonly eigenvalues: readonly number[];
    readonly explainedVariance: readonly (number | null)[];
    readonly degenerate: boolean;
    readonly negativeEigenvalueMass: number;
    readonly axes: number;
  };
  readonly seriationOrder: readonly number[];
  readonly profiles: readonly {
    readonly toMedoid: Record<ComparisonDimension, number>;
    /**
     * the signed companion — a DESCRIPTOR, never a distance, and `null` where the dimension
     * has no single T-space quantity to be signed in or the item IS the medoid.
     */
    readonly toMedoidSigned: Record<ComparisonDimension, number | null>;
    readonly toMeanDistance: number;
  }[];
  /** Null unless `normalization: 'corpus'`. A dimension with no nonzero set is null. */
  readonly normalizationConstants: Record<ComparisonDimension, number | null> | null;
  /** Null unless `noiseFloor` was requested. Context, never a rescaling. */
  readonly context: {
    readonly percentile: readonly number[];
    readonly corpusMedian: number;
    readonly corpusIqr: number;
    readonly noiseFloor: number;
  } | null;
  readonly suspectPairs: readonly {
    readonly i: number;
    readonly j: number;
    readonly reason: ComparisonNoteKind;
  }[];
  /**
   * the corpus scape (Sapp's variant); null unless a `scape` was requested.
   *
   * `cells` holds ITEM INDICES, not distances: per (start, size) sub-window, which item is
   * closest to the corpus medoid over it — "who plays most typically here, at this timescale".
   * `kind` says so in the data rather than in prose. The pairwise variant — a
   * pair's distance per cell — is `ComparisonReport.scape`.
   */
  readonly scape: {
    readonly bins: number;
    readonly kind: 'closest-to-medoid';
    /** The index the cells are measured against; `null` only for a corpus too small to have one. */
    readonly medoid: number | null;
    readonly cells: readonly number[];
  } | null;
  /**
   * The window every cell was computed over, with the two stamps.
   *
   * the settings echo carries the window as `{start, end}`. The RULE and the guarantee sit here
   * beside it because the design makes them the difference between numbers that may be assembled into
   * a matrix and numbers that may not, and a corpus result is a matrix. A corpus-shared window is
   * piece-derived in the sense even when derived from the items, because it does not vary
   * with the pair.
   */
  readonly window: {
    readonly startQuarters: number;
    readonly endQuarters: number;
    readonly rule: WindowRule;
    readonly metricGuarantee: MetricGuarantee;
  };
  /** The echo: scalar settings only, never the document texts. */
  readonly settings: ResolvedComparisonSettings;
  readonly notes: readonly ComparisonNote[];
}

export interface CorpusResult {
  readonly report: CorpusReport;
}
