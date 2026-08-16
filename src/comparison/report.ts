/**
 * §9.3's report, declared in the interior and re-exported by the facade.
 *
 * The shapes live here rather than in `src/api/comparison.ts` for the reason the expression
 * campaign's `report.ts` does: the engine builds them, the facade hands them over unchanged
 * (RULE F1), and a second declaration in the facade would be a second thing to keep in step.
 * What the facade owns is the OPTION types, the typed errors and the validation — the surface a
 * caller can get wrong — not the shape of a result the engine already produced.
 *
 * Everything here is plain data: no `undefined`, no `Map`, no class, every number finite or
 * `null` (§9.6). The one deviation from §9.3 as written is stated where it occurs, on
 * {@link ComparisonInputs.settings}.
 */
import type { ComparisonDimension, ComparisonJndKey } from './registry.js';
import type { InvarianceMode } from './decomposition.js';
import type { MetricGuarantee, WindowRule } from './window.js';
import type { MeasureEntry, MeasurePosition } from './msm.js';

export type { MeasureEntry, MeasurePosition } from './msm.js';

/** §9.1's note vocabulary. */
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

/** Where in a document something was found (§9.3, A18). */
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

/** §1.2 / AD-18: interpretive, non-summing, and labelled as such. */
export interface Decomposition {
  /**
   * The T-space unit of `level`/`levelSigned`/`gain`: `'nepers'` for the log dimensions,
   * `'quarters'`/`'ms'`/`'velocity'`/`'ratio'` elsewhere. Natural log throughout; ×1/ln 2 to
   * read as log₂ (AD-26.1).
   */
  readonly unit: string;
  readonly level: number;
  /** `ℓ_A − ℓ_B`; > 0 means A faster/louder/later. A descriptor, never a distance (C2). */
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
  /** JND; null exactly when the window has zero length (A3). */
  readonly mean: number | null;
  /**
   * The T-space unit of `meanSigned`. MPM stores BPM, a RATE: on tempo a positive `meanSigned`
   * means A is FASTER, the opposite of the seconds-per-beat convention much of the literature
   * uses (AD-26.1).
   */
  readonly unit: string;
  readonly meanSigned: number | null;
  readonly weight: number;
  /** The mode actually applied — `'none'` where the requested one could not be honoured. */
  readonly invariance: InvarianceMode;
  readonly rows: readonly {
    readonly key: ComparisonJndKey;
    /**
     * JND·quarters. A dimension whose rows are priced JOINTLY through one curve integral
     * attributes the whole of `d_k` to the row that carries the curve and 0 to the rest —
     * §7.2's breakdown exists to show what `ω = 1` is weighting, and for a curve dimension the
     * answer is "one curve", which is what this says.
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
  /** Accentuation only (AD-12); null elsewhere. */
  readonly timeSignatureSource: TimeSignatureSource | null;
  /** False when id-anchored atoms lack an MSM (AD-7, AD-39.1). */
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
  /** Aggregate-derived (AD-19), so JND per quarter and NOT a T-space unit. */
  readonly meanSigned: number;
  readonly direction: 'a-greater' | 'b-greater' | 'mixed';
  readonly rank: number;
}

/** AD-19's rows × (segments + remainder) table, row-major. */
export interface AttributionTable {
  readonly dimensions: readonly ComparisonDimension[];
  readonly columnCount: number;
  /** Unweighted `c_{k,s}`; length = `dimensions.length × columnCount`. */
  readonly cells: readonly number[];
  readonly rowSums: readonly number[];
  readonly columnSums: readonly number[];
  readonly total: number;
  /** Pinned ≤ 1e−12·D (§7.3). */
  readonly residual: number;
}

/** The five epsilon families, each in BOTH units (AD-28.2). */
export type EpsilonFamily = 'step' | 'tempo' | 'bezier' | 'imprecision' | 'drift';

export interface ComparisonInputs {
  /**
   * The fully resolved settings — never the documents (A12).
   *
   * §9.3 writes this as `Required<ComparisonSettings>`. The resolved form is STRONGER: it fills
   * every dimension of `weights` and `invariance` and every key of `jnd`, which `Required<>`
   * cannot express, since it removes top-level optionality only. A caller reading the echo sees
   * the vector the run actually used rather than the subset they happened to pass.
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
  /** C2's signed series, JND per quarter. */
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
    /** Exactly one thing: a document declared no `@pulsesPerQuarter` (A21). */
    readonly fallbackUsed: boolean;
    readonly assumed: number | null;
    /** AD-27.2's third state: the raw text of a declared-but-unusable value, per document. */
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
   * What the per-part SUM actually counted, and which document decided it (AD-55.2).
   *
   * `count` is a multiplier on every `d_k` and on `D`, so it is reported rather than left to be
   * inferred from `parts`: the two differ whenever an MPM declares a `<part>` the score does
   * not name, or the other way round. `'msm'` is the counted quantity — one scope per rendered
   * MSM part, which is what `renderParts` iterates; `'mpm'` is the estimate available without a
   * score, and carries an `estimate-degradation` note; `'global'` is the single evaluation a
   * pair with no parts on either side gets (§5.0).
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
    /** C7's heuristic: the pair may not encode the same piece. */
    readonly suspectPair: boolean;
  };
  /** C3; null exactly when no MSM was supplied. */
  readonly measures: readonly MeasureEntry[] | null;
  readonly dimensions: Record<ComparisonDimension, DimensionComparison>;
  readonly aggregate: {
    /** `D`, JND·quarters — additive and length-dependent. */
    readonly distance: number;
    /** `D / L`, JND — the human headline (C10); null exactly when `L = 0`. */
    readonly mean: number | null;
    readonly weights: Record<ComparisonDimension, number>;
    readonly normalization: 'fixed' | 'corpus';
  };
  readonly segments: readonly ComparisonSegment[];
  readonly remainder: { readonly mass: number };
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
  /** C13; null exactly when the tempo dimension reads `⊥` on both sides. */
  readonly cumulativeDrift: {
    readonly secondsA: number;
    readonly secondsB: number;
    readonly difference: number;
    readonly ratio: number;
    readonly maxAbsMs: number;
  } | null;
  /** C1; null exactly when `options.profile` was omitted. */
  readonly profiles: Record<ComparisonDimension, ComparisonProfile> | null;
  readonly notes: readonly ComparisonNote[];
}

export interface ComparisonResult {
  readonly report: ComparisonReport;
}
