/**
 * comparison/DESIGN.md §4's registry, as data — the L0 layer of the comparison module.
 *
 * It reuses the `ScaleSpace` vocabulary of `src/expression/transforms.ts` and the *shape* of
 * that module's `RegistryRow`, and deliberately does not extend `REGISTRY_ROWS` (§4/A-Q9: a
 * read requirement must not widen the write licence). Expression's table asks "may this
 * attribute be rewritten, and through which closed form"; this one asks "what quantity does this
 * attribute contribute to a performance, in what unit, and how large is a difference in it".
 * Three of expression's columns — `inCenterPopulation`, `p5r`, the `s`-domain — are exaggeration
 * concepts with no comparison meaning (survey-code §2.2), and four here have no expression
 * counterpart: `unit`, `jnd`, `delta` and `plausibleRange`.
 *
 * A row is not a distance. The curve dimensions (§5.1–§5.3, §5.7) price the *resolved curve* —
 * `|ln qbpm_A − ln qbpm_B|`, `|δ_A − δ_B|` — and most rows here are inputs to that curve. A
 * row's own {@link localDistance} is what the §6 edit path prices an attribute-level
 * substitution with, and what the step dimensions integrate; which rows carry the curve is
 * stated per row.
 */
import {
  ARTICULATION_MAP,
  ARTICULATION_STYLE,
  ASYNCHRONY_MAP,
  ORNAMENTATION_MAP,
  ORNAMENTATION_STYLE,
  DYNAMICS_MAP,
  DYNAMICS_STYLE,
  IMPRECISION_MAP_DYNAMICS,
  IMPRECISION_MAP_TIMING,
  IMPRECISION_MAP_TONEDURATION,
  METRICAL_ACCENTUATION_MAP,
  METRICAL_ACCENTUATION_STYLE,
  MOVEMENT_MAP,
  RUBATO_MAP,
  RUBATO_STYLE,
  TEMPO_MAP,
  TEMPO_STYLE,
} from '../mpm/names.js';
import { forwardInSpace, type ScaleSpace } from '../expression/transforms.js';
import type { ExpressionDimension } from '../expression/registry.js';
import { isBottom, type Valued } from './values.js';
import {
  IDENTITY_CANONICAL_PAIR,
  canonicalValue,
  sameCanonicalization,
  type CanonicalPair,
} from './decomposition.js';

/**
 * DESIGN §3/§9.1: the eleven contributing comparison dimensions.
 *
 * The semantic unit is the map domain, not the exaggeration knob — a curve already integrates
 * what expression splits into level and shape (§3), which is why this list is eleven where
 * `EXPRESSION_DIMENSIONS` is fifteen.
 *
 * Frozen for the reason `EXPRESSION_DIMENSIONS` is (§9.1, A25): the ESM re-export hands a
 * consumer the same object the option validator reads, so unfrozen, a `push` from outside would
 * widen this package's notion of a legal dimension process-wide; `as const` stops that at
 * compile time only. Widening the list is breaking for consumers (§3, AD-22) — `D = Σ ω_k d_k`
 * gains a term, so every previously reported distance changes — but mechanically enumerable, so
 * no consumer hard-codes eleven.
 */
export const COMPARISON_DIMENSIONS = Object.freeze([
  'tempo',
  'rubato',
  'dynamics',
  'accentuation',
  'articulation',
  'ornamentation',
  'asynchrony',
  'pedal',
  'imprecisionTiming',
  'imprecisionDynamics',
  'imprecisionDuration',
] as const);

export type ComparisonDimension = (typeof COMPARISON_DIMENSIONS)[number];

/**
 * DESIGN §3's correspondence to the fifteen expression dimensions, as a frozen data table so the
 * §1.3 cross-module test enumerates it rather than hard-coding it (A25). Every expression
 * dimension appears exactly once, and the containments are the design's: `tempo ⊇ {tempo,
 * tempoShape}` because one curve carries level and transition shape; `ornamentation ⊇
 * {ornamentSpread, ornamentSpacing, ornamentDynamics}` because the alignment DP prices all three
 * at once (§5.6); `pedal ⊇ pedalShape`.
 */
export const EXPRESSION_DIMENSION_CORRESPONDENCE: Readonly<
  Record<ComparisonDimension, readonly ExpressionDimension[]>
> = Object.freeze({
  tempo: Object.freeze(['tempo', 'tempoShape'] as const),
  rubato: Object.freeze(['rubato'] as const),
  dynamics: Object.freeze(['dynamics', 'dynamicsShape'] as const),
  accentuation: Object.freeze(['accentuation'] as const),
  articulation: Object.freeze(['articulation'] as const),
  ornamentation: Object.freeze(['ornamentSpread', 'ornamentSpacing', 'ornamentDynamics'] as const),
  asynchrony: Object.freeze(['asynchrony'] as const),
  pedal: Object.freeze(['pedalShape'] as const),
  imprecisionTiming: Object.freeze(['imprecisionTiming'] as const),
  imprecisionDynamics: Object.freeze(['imprecisionDynamics'] as const),
  imprecisionDuration: Object.freeze(['imprecisionDuration'] as const),
});

/**
 * The unit of `|T(x) − T(y)|` — of the row's {@link ComparisonRegistryRow.jnd}, not of its raw
 * attribute value. That is the one trap in this table: a tempo row's `jnd` is in nepers while
 * its `plausibleRange` is in quarter-bpm, because the JND lives in `T`-space and plausibility is
 * a statement about the value the document wrote.
 *
 * Every log-family space (`log-around-1`, `logit`, both boundary powers) reports `'nepers'`: `T`
 * is a natural logarithm in all of them — of a value, of an odds ratio, of a distance to a
 * bound — and AD-26.1 fixes natural log as the internal convention. A gain space's `T` is the
 * identity, so its unit is the attribute's own.
 */
export type ComparisonUnit =
  | 'nepers'
  | 'quarters'
  | 'ms'
  | 'velocity'
  | 'cents'
  | 'hz'
  | 'ratio'
  | 'percent'
  | 'dimensionless';

/**
 * How the row participates in the comparison (§4).
 *
 * `curve-level` and `curve-shape` are inputs to a continuous curve — the level in the curve's
 * own unit, the shape dimensionless — priced by integrating the curve, not by summing the rows.
 * `step` is a piecewise-constant curve integrated exactly. `inert` is an attribute the renderer
 * provably ignores (R9b: zero density, reported when the documents differ). `structural` is
 * read, consequential, and never folded into a distance (§3) — a mechanism switch or an encoding
 * mismatch, reported as a finding.
 */
export type ComparisonRole =
  | 'curve-level'
  | 'curve-shape'
  | 'step'
  | 'event'
  | 'distribution'
  | 'process'
  | 'inert'
  | 'structural';

/**
 * Whether the row is always read, or only under a condition on its own element (§4, AD-11, R9).
 * The conditional form names the element and states the rule in prose, because a predicate here
 * could not see the map position an AD-8 rule needs.
 */
export type ComparisonLiveness = 'always' | { readonly element: string; readonly rule: string };

/** Where a comparison row's attribute physically lives — the shape of expression's site. */
export interface ComparisonSite {
  /** `instruction` = a child of a map; `def` = a child of (or under) a `<styleDef>`. */
  readonly kind: 'instruction' | 'def';
  /** The map's local name, or the style collection's — whichever contains the element. */
  readonly container: string;
  /** The local name of the element carrying the attribute. */
  readonly element: string;
}

/**
 * DESIGN §4's row.
 *
 * `element` is the instruction element the row is named for and what enters
 * {@link ComparisonRegistryRow.key}; `sites` is every physical place the value may be written,
 * which for a family carrying one attribute on both a def and an instruction is two entries with
 * one key. Where a def carries a *differently named* attribute for the same quantity —
 * `<tempoDef value>` against `<tempo bpm>` — that is its own row, as in expression.
 */
export interface ComparisonRegistryRow {
  /**
   * `${dimension}/${element}@${attribute}` — the public row key (§4, A1).
   *
   * Written out per row rather than derived, and first, because writing it is what type-checks
   * it: the field is the closed {@link ComparisonJndKey} union, so a row naming a key outside
   * the vocabulary fails to compile. That the key agrees with the three fields below is the one
   * part a type cannot state, and the registry test pins it for every row.
   */
  readonly key: ComparisonJndKey;
  readonly dimension: ComparisonDimension;
  readonly element: string;
  readonly attribute: string;
  /** Never empty. */
  readonly sites: readonly ComparisonSite[];
  readonly space: ScaleSpace;
  /**
   * Whether a *resolved* value is comparable at all (§4, survey-code §2.2).
   *
   * Resolved is the load-bearing word: def inheritance (§5.0's `styleScope` route) and any
   * renderer clamp the dimension section names — §5.2's `lateStart`/`earlyEnd` floor and cap,
   * for one — are applied before this predicate runs, so a document the renderer repairs
   * compares as what the renderer performs. A value that still fails has no comparable
   * quantity: the row reads `⊥` and is priced by {@link localDistance}, never repaired.
   */
  readonly valueDomain: (value: number) => boolean;
  readonly unit: ComparisonUnit;
  /** §7.1's just-noticeable difference, in {@link ComparisonUnit}. Overridable per §9.2. */
  readonly jnd: number;
  /** `δ_row`, the metric cap, in JND units (§4, AD-2). Not caller-overridable (AD-25.7). */
  readonly delta: number;
  /** §5.0's plausibility band on the **resolved raw value**, or null where §5.0 names none. */
  readonly plausibleRange: readonly [number, number] | null;
  readonly role: ComparisonRole;
  readonly liveness: ComparisonLiveness;
  /** Tick-valued: rescaled by the §5.0 lcm factor. `*Ms` and whole-note fractions never are. */
  readonly ppqSensitive: boolean;
  /** The §5 subsection the row is compiled from, its JND tag, and the obligation it carries. */
  readonly notes: string;
}

// --- §7.1 constants ----------------------------------------------------------------------
//
// Defaults the caller may override through `options.jnd` (§9.2), each carrying its tag. Two are
// [literature] after AD-27.6 (tempo, asynchrony); the rest ship [convention].

/**
 * Tempo, in nepers: `ln(1.025)` ≈ 0.0247 — a 2.5 % tempo change, [literature] (AD-27.6).
 *
 * Friberg, A. & Sundberg, J. (1995), "Time discrimination in a monotonic, isochronous
 * sequence", *JASA* 98(5), 2524–2531, DOI 10.1121/1.413218: "The absolute jnd was found to be
 * approximately constant at 6 ms for tone interonset intervals shorter than about 240 ms and
 * the relative jnd constant at 2.5 % of the tone interonsets above 240 ms. Subjects' musical
 * training did not affect these values."
 *
 * The regime fits this row: a *relative* threshold above 240 ms is the tempo region of musical
 * IOIs, and a relative threshold is a statement about a ratio, which is what makes the logarithm
 * the space rather than merely a convenient one. The finding's other regime — the 6 ms absolute
 * floor below ~240 ms IOI — is a note obligation on the ms-domain rows rather than machinery:
 * see the asynchrony row, and §7.1.
 */
export const TEMPO_JND_NEPERS = Math.log(1.025);

/**
 * Dynamics, in nepers: `ln(1.10)` — a 10 % velocity change [convention], and staying that way
 * (AD-27.6).
 *
 * No musically-validated dynamics JND was found, and none is invented here. The classic
 * psychoacoustic reference is Jesteadt, Wier & Green (1977), *JASA* 61(1), 169–177 — verified
 * as a citation, but its numeric threshold could not be read at source, so no dB figure is
 * asserted. Repp (1995) reports *positional variation* in the detectability of intensity
 * increments rather than a single threshold, and survey-lit L6 records four loudness conventions
 * coexisting with no shared scale.
 *
 * The alternative, shared by every [convention] JND here, is to derive the unit from the
 * corpus's own per-attribute spread and stamp the derived constant into the report — §8's opt-in
 * normalization path. Until a caller asks for it, 10 % is a declared choice. The log space has
 * independent support: partitura's performance codec defines its loudness field as
 * `log(velocity / mean velocity)` (Cancino-Chacón et al. 2022).
 */
export const DYNAMICS_JND_NEPERS = Math.log(1.1);

/**
 * Asynchrony, in milliseconds: 30 ms, [literature] (AD-26.2, confirmed by AD-27.6).
 *
 * Three verified anchors bracket the band, and the row takes the middle one:
 *
 * - 15–20 ms — Hirsh (1959): the separation required to report correctly *which* of two sounds
 *   preceded the other, "independent of the kinds of sounds used". A temporal-order threshold,
 *   i.e. the floor of what is discriminable at all.
 * - 30 ms — Goebl, Flossmann & Widmer (2010), used as "the typical perceptual threshold" in the
 *   one corpus study that recovers a *musicological* category (earlier rubato) from asynchrony.
 *   Adopting their value makes this module's output directly comparable to theirs.
 * - 35 ms — Nakamura, Yoshii & Katayose (2017): the window within which onsets are clustered as
 *   one chord, i.e. the field's operational "simultaneous".
 *
 * For scale: typical melody lead is ~30 ms and bass anticipation ≥ 70 ms, so this unit puts
 * melody lead at ~1 JND and dislocation at 2–3 JND.
 */
export const ASYNCHRONY_JND_MS = 30;

/**
 * Rubato displacement, in quarters: a sixty-fourth note [convention], §7.1's `~1/16 quarter`.
 *
 * The JND of the rubato curve, `|δ_A − δ_B|` in quarters. `@frameLength` reuses it because it is
 * the one other row whose value is a duration in that unit, and for no stronger reason.
 */
export const RUBATO_DISPLACEMENT_JND_QUARTERS = 1 / 16;

/**
 * The JND of a row for which no literature and no convention exists yet: 1, i.e. the row is
 * reported unnormalized, in its own `T`-space unit [convention].
 *
 * No study in survey-lit measures the discriminability of a Bézier `@curvature` or a
 * `@meanTempoAt`, so there is no perceptual constant for transition shape to use. A JND of 1
 * makes `d_row = |T(x) − T(y)|` exactly, a magnitude a reader can interpret (one neper of
 * log-odds) rather than a false precision. Every row using it says so in its notes, and §7.1's
 * [PENDING-LIT] slot covers all of them.
 *
 * These rows are shape knobs and gates: none carries its dimension's curve, so this constant
 * never enters a §5 density. It is read by the §6 edit path's per-attribute `deltaJnd`.
 */
export const UNNORMALIZED_JND = 1;

/**
 * MIDI velocity: 3 units [convention] — §7.1's `velocity` row, and there is only one.
 *
 * Named for the quantity rather than a dimension because §7.1 states one velocity JND and three
 * dimensions draw on it: §5.4's per-beat accentuation contribution
 * `scale · getAccentuationAt(beat)` (added straight onto a note's velocity), and §5.5's
 * `@absoluteVelocityChange` and `@absoluteVelocity`. Accentuation's curve is already in the unit
 * its JND is stated in — `T` is the identity. Three velocity units out of 127 is ~2.4 % of the
 * full range. [convention] for {@link DYNAMICS_JND_NEPERS}'s reason; no study measures the
 * discriminability of a metrical accent as such.
 */
export const VELOCITY_JND = 3;

/**
 * Note duration as a RATIO: `ln(1.10)` — a 10 % change in a note's sounding length
 * [convention].
 *
 * Not the tempo constant. Friberg & Sundberg 1995's 2.5 % is a threshold on *inter-onset
 * intervals*, whose deviations accumulate across a sequence and are judged against the beat the
 * listener is tracking. A single note's sounding length carries no such reference — legato and
 * staccato are heard as categories, not as a scale — so borrowing the IOI threshold would report
 * a duration difference as three times more salient than the evidence supports. A declared
 * choice, as {@link DYNAMICS_JND_NEPERS} is.
 */
export const ARTICULATION_DURATION_JND_NEPERS = Math.log(1.1);

/**
 * Pedal position, in fractions of full travel: 0.1 [convention].
 *
 * The space is a gain on [0,1] (§5.8), so the JND is a plain fraction of pedal travel and the
 * choice is a calibration rather than a measurement. A tenth makes the extreme authored
 * difference price at exactly `δ_row`: canonical pedal maps are exact `0.0`/`1.0` (expression's
 * §7.14 records the same from the write side), so full-down against full-up is `1.0 / 0.1 = 10`
 * JND — the price §4 puts on an incomparable value. Pedal can therefore never dominate
 * `D = Σ ω_k d_k` on the strength of its own scale.
 *
 * Performability floor, stated because this is the row it bears on: the rendered value is
 * `Math.round(position · 127)` (`Msm.ts:1441`), so a position difference below `1/127` of
 * travel — 0.079 JND here — is not performed at all. No clamp or snap is applied, because the
 * *defined* object is the ideal curve (§5.0 rule 3) and quantization belongs to the §6.3 replay;
 * it is an obligation on the docs, as the ms-domain floor is on the asynchrony row.
 *
 * No literature was found for pedal-depth discrimination; see {@link DYNAMICS_JND_NEPERS}.
 */
export const PEDAL_POSITION_JND_RATIO = 0.1;

/**
 * `δ_row`, the metric cap, in JND units: 10 [convention] (§4, §7.1, AD-2).
 *
 * "An incomparable value counts as ten JNDs, and no single instant counts as more than twenty."
 * Not caller-overridable in v1 (AD-25.7). No row departs from the default; the column exists
 * because §4 gives it per row.
 */
export const DEFAULT_DELTA_JND = 10;

/** §5.0's [convention] plausibility band on quarter-normalized tempo: `qbpm ∈ [10, 400]`. */
const PLAUSIBLE_QBPM: readonly [number, number] = [10, 400];
/** §5.0's [convention] band on a MIDI velocity, which is what `@volume` resolves to. */
const PLAUSIBLE_VELOCITY: readonly [number, number] = [0, 127];
/** §5.0's [convention] band on an asynchrony offset: `|offset| ≤ 1000 ms`. */
const PLAUSIBLE_OFFSET_MS: readonly [number, number] = [-1000, 1000];
/**
 * §5.0's [convention] band on a SIGNED velocity delta — an accentuation adds to a velocity
 * rather than being one, so its plausible band is the symmetric one and not `[0,127]`.
 */
const PLAUSIBLE_VELOCITY_DELTA: readonly [number, number] = [-127, 127];
/** §5.8's band on a controller position: the full travel it is a fraction of. */
const PLAUSIBLE_POSITION: readonly [number, number] = [0, 1];

// --- Value domains (§4's `valueDomain` column) -------------------------------------------
//
// Named rather than inlined, so two rows claiming the same domain use the same predicate.

/** `ℝ` — a signed offset with no enforced bound. Non-finite is still out. */
const anyFinite = (x: number): boolean => Number.isFinite(x);
/** `ℝ>0` — the domain of the logarithm: every level, and every ratio-valued exponent. */
const positive = (x: number): boolean => Number.isFinite(x) && x > 0;
/** `[0,1]` — `@curvature`, clamped there by the renderer on the way in (§5.3). */
const unitClosed = (x: number): boolean => Number.isFinite(x) && x >= 0 && x <= 1;
/** `[-1,1]` — `@protraction`, likewise clamped (§5.3). */
const signedUnitClosed = (x: number): boolean => Number.isFinite(x) && x >= -1 && x <= 1;
/** `(0,1)` — `@meanTempoAt`; the closed bounds are §5.1's degenerate cases, not curves. */
const unitOpen = (x: number): boolean => Number.isFinite(x) && x > 0 && x < 1;
/** `[0,1)` — `@lateStart` after §5.2's clamp. */
const trimHead = (x: number): boolean => Number.isFinite(x) && x >= 0 && x < 1;
/** `(0,1]` — `@earlyEnd` after §5.2's clamp. */
const trimTail = (x: number): boolean => Number.isFinite(x) && x > 0 && x <= 1;
/**
 * `{0,1}` — a boolean read by an evaluator, carried as its numeric encoding.
 *
 * `@loop` and `@subNoteDynamics` are booleans, and §4's row shape has no column for that: a
 * boolean has no scale space, no unit and no JND. They have rows anyway because AD-10 and §5.3
 * require it — see their notes — and this is the encoding a gain space can carry.
 */
const boolean01 = (x: number): boolean => x === 0 || x === 1;

// --- Row construction --------------------------------------------------------------------

const instructionSite = (container: string, element: string): ComparisonSite => ({
  kind: 'instruction',
  container,
  element,
});

const defSite = (container: string, element: string): ComparisonSite => ({
  kind: 'def',
  container,
  element,
});

/**
 * §9.1's closed row-key vocabulary: `` `${dimension}/${element}@${attribute}` ``.
 *
 * The dimension is in the key (§4, AD-22, A1) because `element@attribute` alone is *not* unique:
 * `<distribution.uniform>` appears identically in three maps, and across the live registry
 * `transition.to` occurs three times, `curvature`, `protraction`, `intensity` and `value` twice
 * each. Qualifying by dimension is what makes `options.jnd` and `options.plausibleRange`
 * (AD-25.8) addressable, and typing them against this union makes a misspelling a compile error
 * rather than a silent no-op. The registry test pins the tuple in exact correspondence with
 * {@link COMPARISON_REGISTRY_ROWS} in both directions.
 */
export const COMPARISON_JND_KEYS = Object.freeze([
  'tempo/tempo@bpm',
  'tempo/tempo@beatLength',
  'tempo/tempo@transition.to',
  'tempo/tempo@meanTempoAt',
  'tempo/tempoDef@value',
  'rubato/rubato@frameLength',
  'rubato/rubato@intensity',
  'rubato/rubato@lateStart',
  'rubato/rubato@earlyEnd',
  'rubato/rubato@loop',
  'dynamics/dynamics@volume',
  'dynamics/dynamics@transition.to',
  'dynamics/dynamics@curvature',
  'dynamics/dynamics@protraction',
  'dynamics/dynamics@subNoteDynamics',
  'dynamics/dynamicsDef@value',
  'accentuation/accentuationPattern@scale',
  'accentuation/accentuationPattern@loop',
  'accentuation/accentuationPattern@stickToMeasures',
  'accentuation/accentuationPatternDef@length',
  'accentuation/accentuation@beat',
  'accentuation/accentuation@value',
  'accentuation/accentuation@transition.from',
  'accentuation/accentuation@transition.to',
  'articulation/articulation@relativeDuration',
  'articulation/articulation@relativeVelocity',
  'articulation/articulation@absoluteDurationChange',
  'articulation/articulation@absoluteDurationChangeMs',
  'articulation/articulation@absoluteDelay',
  'articulation/articulation@absoluteDelayMs',
  'articulation/articulation@absoluteVelocityChange',
  'articulation/articulation@absoluteDuration',
  'articulation/articulation@absoluteDurationMs',
  'articulation/articulation@absoluteVelocity',
  'articulation/articulation@detuneCents',
  'articulation/articulation@detuneHz',
  'ornamentation/ornament@scale',
  'ornamentation/ornament@note.order',
  'ornamentation/ornament@repetitions',
  'ornamentation/dynamicsGradient@transition.from',
  'ornamentation/dynamicsGradient@transition.to',
  'ornamentation/temporalSpread@frame.start',
  'ornamentation/temporalSpread@frame.offset',
  'ornamentation/temporalSpread@frameLength',
  'ornamentation/temporalSpread@intensity',
  'asynchrony/asynchrony@milliseconds.offset',
  'pedal/movement@position',
  'pedal/movement@transition.to',
  'pedal/movement@curvature',
  'pedal/movement@protraction',
  'imprecisionTiming/distribution.uniform@limit.lower',
  'imprecisionTiming/distribution.uniform@limit.upper',
  'imprecisionTiming/distribution.gaussian@deviation.standard',
  'imprecisionTiming/distribution.gaussian@limit.lower',
  'imprecisionTiming/distribution.gaussian@limit.upper',
  'imprecisionTiming/distribution.triangular@limit.lower',
  'imprecisionTiming/distribution.triangular@limit.upper',
  'imprecisionTiming/distribution.triangular@mode',
  'imprecisionTiming/distribution.triangular@clip.lower',
  'imprecisionTiming/distribution.triangular@clip.upper',
  'imprecisionTiming/distribution.correlated.brownianNoise@stepWidth.max',
  'imprecisionTiming/distribution.correlated.brownianNoise@limit.lower',
  'imprecisionTiming/distribution.correlated.brownianNoise@limit.upper',
  'imprecisionTiming/distribution.correlated.brownianNoise@milliseconds.timingBasis',
  'imprecisionTiming/distribution.correlated.compensatingTriangle@degreeOfCorrelation',
  'imprecisionTiming/distribution.correlated.compensatingTriangle@limit.lower',
  'imprecisionTiming/distribution.correlated.compensatingTriangle@limit.upper',
  'imprecisionTiming/distribution.correlated.compensatingTriangle@clip.lower',
  'imprecisionTiming/distribution.correlated.compensatingTriangle@clip.upper',
  'imprecisionTiming/distribution.correlated.compensatingTriangle@milliseconds.timingBasis',
  'imprecisionTiming/measurement@value',
  'imprecisionDynamics/distribution.uniform@limit.lower',
  'imprecisionDynamics/distribution.uniform@limit.upper',
  'imprecisionDynamics/distribution.gaussian@deviation.standard',
  'imprecisionDynamics/distribution.gaussian@limit.lower',
  'imprecisionDynamics/distribution.gaussian@limit.upper',
  'imprecisionDynamics/distribution.triangular@limit.lower',
  'imprecisionDynamics/distribution.triangular@limit.upper',
  'imprecisionDynamics/distribution.triangular@mode',
  'imprecisionDynamics/distribution.triangular@clip.lower',
  'imprecisionDynamics/distribution.triangular@clip.upper',
  'imprecisionDynamics/distribution.correlated.brownianNoise@stepWidth.max',
  'imprecisionDynamics/distribution.correlated.brownianNoise@limit.lower',
  'imprecisionDynamics/distribution.correlated.brownianNoise@limit.upper',
  'imprecisionDynamics/distribution.correlated.brownianNoise@milliseconds.timingBasis',
  'imprecisionDynamics/distribution.correlated.compensatingTriangle@degreeOfCorrelation',
  'imprecisionDynamics/distribution.correlated.compensatingTriangle@limit.lower',
  'imprecisionDynamics/distribution.correlated.compensatingTriangle@limit.upper',
  'imprecisionDynamics/distribution.correlated.compensatingTriangle@clip.lower',
  'imprecisionDynamics/distribution.correlated.compensatingTriangle@clip.upper',
  'imprecisionDynamics/distribution.correlated.compensatingTriangle@milliseconds.timingBasis',
  'imprecisionDynamics/measurement@value',
  'imprecisionDuration/distribution.uniform@limit.lower',
  'imprecisionDuration/distribution.uniform@limit.upper',
  'imprecisionDuration/distribution.gaussian@deviation.standard',
  'imprecisionDuration/distribution.gaussian@limit.lower',
  'imprecisionDuration/distribution.gaussian@limit.upper',
  'imprecisionDuration/distribution.triangular@limit.lower',
  'imprecisionDuration/distribution.triangular@limit.upper',
  'imprecisionDuration/distribution.triangular@mode',
  'imprecisionDuration/distribution.triangular@clip.lower',
  'imprecisionDuration/distribution.triangular@clip.upper',
  'imprecisionDuration/distribution.correlated.brownianNoise@stepWidth.max',
  'imprecisionDuration/distribution.correlated.brownianNoise@limit.lower',
  'imprecisionDuration/distribution.correlated.brownianNoise@limit.upper',
  'imprecisionDuration/distribution.correlated.brownianNoise@milliseconds.timingBasis',
  'imprecisionDuration/distribution.correlated.compensatingTriangle@degreeOfCorrelation',
  'imprecisionDuration/distribution.correlated.compensatingTriangle@limit.lower',
  'imprecisionDuration/distribution.correlated.compensatingTriangle@limit.upper',
  'imprecisionDuration/distribution.correlated.compensatingTriangle@clip.lower',
  'imprecisionDuration/distribution.correlated.compensatingTriangle@clip.upper',
  'imprecisionDuration/distribution.correlated.compensatingTriangle@milliseconds.timingBasis',
  'imprecisionDuration/measurement@value',
  'imprecisionTiming/distribution.uniform@milliseconds.timingBasis',
  'imprecisionTiming/distribution.gaussian@milliseconds.timingBasis',
  'imprecisionTiming/distribution.triangular@milliseconds.timingBasis',
  'imprecisionTiming/distribution.list@milliseconds.timingBasis',
  'imprecisionDynamics/distribution.uniform@milliseconds.timingBasis',
  'imprecisionDynamics/distribution.gaussian@milliseconds.timingBasis',
  'imprecisionDynamics/distribution.triangular@milliseconds.timingBasis',
  'imprecisionDynamics/distribution.list@milliseconds.timingBasis',
  'imprecisionDuration/distribution.uniform@milliseconds.timingBasis',
  'imprecisionDuration/distribution.gaussian@milliseconds.timingBasis',
  'imprecisionDuration/distribution.triangular@milliseconds.timingBasis',
  'imprecisionDuration/distribution.list@milliseconds.timingBasis',
] as const);

export type ComparisonJndKey = (typeof COMPARISON_JND_KEYS)[number];

// --- §5.1 tempo --------------------------------------------------------------------------
//
// The curve is `g(t) = ln(qbpm(t))`, `qbpm = bpm · beatLength · 4`, and the dimension's density
// is `|g_A − g_B| / jnd_tempo` — ONE integral over four rows' worth of inputs. The level space is
// `log-around-1`, the bare logarithm, and not expression's `log-around-center`: the center is a
// property of one performance (§7.1's geometric mean over that document's population), so two
// documents bring two centers and a centered `T` would not be symmetric under swapping them. It
// cancels in every difference anyway (§4).

const TEMPO_LOG: ScaleSpace = { kind: 'log-around-1' };

/** AD-8/R1's rule, worded once and shared by the two dimensions that have it. */
const trailingTransitionRule = (element: string, map: string): ComparisonLiveness => ({
  element,
  rule:
    `inert on the last <${element}> of a ${map} (AD-8/R1): getEndDate returns ` +
    'Number.MAX_VALUE with no successor, so u ≈ 0 for every date in any real window and the ' +
    'span performs as a constant at the instruction’s own level. A difference here is an ' +
    'inert-difference note, never curve shape.',
});

const TEMPO_ROWS: readonly ComparisonRegistryRow[] = [
  {
    key: 'tempo/tempo@bpm',
    dimension: 'tempo',
    element: 'tempo',
    attribute: 'bpm',
    sites: [instructionSite(TEMPO_MAP, 'tempo')],
    space: TEMPO_LOG,
    valueDomain: positive,
    unit: 'nepers',
    jnd: TEMPO_JND_NEPERS,
    delta: DEFAULT_DELTA_JND,
    plausibleRange: PLAUSIBLE_QBPM,
    role: 'curve-level',
    liveness: 'always',
    ppqSensitive: false,
    notes:
      '§5.1 — THE tempo curve: this row’s jnd is jnd_tempo, and the dimension’s density ' +
      'integrates |ln qbpm_A − ln qbpm_B| against it. The compared quantity is the resolved, ' +
      'quarter-normalized qbpm = bpm·beatLength·4, which is also what plausibleRange bands ' +
      '(the jnd is in nepers, the band in quarter-bpm). A <tempo> missing @bpm or ' +
      '@beatLength is a renderer SKIP, not a default: [skipDate, nextValidDate) performs at ' +
      '100 qbpm, as does [0, firstValidTempoDate) (AD-9). ln(1.025) [literature] — Friberg & ' +
      'Sundberg 1995’s 2.5 % relative jnd above 240 ms IOI, training-independent (AD-27.6).',
  },
  {
    key: 'tempo/tempo@beatLength',
    dimension: 'tempo',
    element: 'tempo',
    attribute: 'beatLength',
    sites: [instructionSite(TEMPO_MAP, 'tempo')],
    space: TEMPO_LOG,
    valueDomain: positive,
    unit: 'nepers',
    jnd: TEMPO_JND_NEPERS,
    delta: DEFAULT_DELTA_JND,
    plausibleRange: null,
    role: 'curve-level',
    liveness: 'always',
    ppqSensitive: false,
    notes:
      '§5.1 — normalization data, not an independent quantity: ln qbpm = ln bpm + ln ' +
      'beatLength + ln 4, so this row shares the level’s space and jnd exactly and its ' +
      'difference is priced through @bpm’s resolved qbpm. Two documents whose bpm and ' +
      'beatLength differ compensatingly are distance 0, which is correct — they perform ' +
      'identically. A whole-note fraction, so NOT ppqSensitive even when written in ticks: ' +
      'that case (three of the 121 Daten .mpm files; Hofmann (1927) writes bpm=21 ' +
      'beatLength=2160 at ppq=720) is a unit mismatch caught by @bpm’s plausibility band, ' +
      'which is the channel §5.0 built for it. ln(1.025) [literature] (AD-27.6).',
  },
  {
    key: 'tempo/tempo@transition.to',
    dimension: 'tempo',
    element: 'tempo',
    attribute: 'transition.to',
    sites: [instructionSite(TEMPO_MAP, 'tempo')],
    space: TEMPO_LOG,
    valueDomain: positive,
    unit: 'nepers',
    jnd: TEMPO_JND_NEPERS,
    delta: DEFAULT_DELTA_JND,
    plausibleRange: PLAUSIBLE_QBPM,
    role: 'curve-level',
    liveness: trailingTransitionRule('tempo', 'tempoMap'),
    ppqSensitive: false,
    notes:
      '§5.1 — the transition target, in the level’s own space and unit; the curve reaches it ' +
      'through the renderer’s power law bpm₀ + (bpm₁ − bpm₀)·u^e. Also inert when it equals ' +
      '@bpm, and the degenerate table of §5.1 decides the rest: meanTempoAt ≤ 0 performs a ' +
      'CONSTANT AT transition.to (TempoMap reassigns bpm := transitionTo), meanTempoAt ≥ 1 a ' +
      'constant at @bpm. all_maps.mpm’s trailing <tempo bpm=120 transition.to=90> is the ' +
      'repo’s own witness for the liveness rule. ln(1.025) [literature] (AD-27.6).',
  },
  {
    key: 'tempo/tempo@meanTempoAt',
    dimension: 'tempo',
    element: 'tempo',
    attribute: 'meanTempoAt',
    sites: [instructionSite(TEMPO_MAP, 'tempo')],
    space: { kind: 'logit', lower: 0, upper: 1 },
    valueDomain: unitOpen,
    unit: 'nepers',
    jnd: UNNORMALIZED_JND,
    delta: DEFAULT_DELTA_JND,
    plausibleRange: null,
    role: 'curve-shape',
    liveness: {
      element: 'tempo',
      rule:
        'live only where @transition.to is present, differs from @bpm, and the instruction ' +
        'has a successor (AD-8); absent with a differing @transition.to it is not a default ' +
        'but a LINEAR RAMP, meanTempoAt = 0.5, e = 1.0 (§5.1’s degenerate table); at ≤ 0 or ' +
        '≥ 1 the span is constant and the value shapes nothing.',
    },
    ppqSensitive: false,
    notes:
      '§5.1 — the transition exponent’s position parameter, e = ln 0.5 / ln(meanTempoAt), on ' +
      'the logit of (0,1) as expression §7.3 places it. Carries no independent density: its ' +
      'effect is inside the tempo curve, and §5.0’s quadrature substitutes u = z^(1/e) ' +
      'precisely because this parameter makes the integrand singular at both ends. jnd 1 ' +
      '[convention] — unnormalized, no literature on transition-shape discrimination.',
  },
  {
    key: 'tempo/tempoDef@value',
    dimension: 'tempo',
    element: 'tempoDef',
    attribute: 'value',
    sites: [defSite(TEMPO_STYLE, 'tempoDef')],
    space: TEMPO_LOG,
    valueDomain: positive,
    unit: 'nepers',
    jnd: TEMPO_JND_NEPERS,
    delta: DEFAULT_DELTA_JND,
    plausibleRange: PLAUSIBLE_QBPM,
    role: 'curve-level',
    liveness: 'always',
    ppqSensitive: false,
    notes:
      '§5.1/§5.0 — the def spelling of a level, which is the MEI norm for named tempi. It is ' +
      'the same quantity as @bpm once resolved, and resolution MUST route through ' +
      'styleScope.findStyleDef: a part header declaring styleDef name="A" hides the global ' +
      '"A" entirely, defs and all, while leaving "B" visible (§5.0, AD-16). An unresolvable ' +
      'name has no tempo default — unlike dynamics’ velocity 100 — so the instruction is a ' +
      'skip. ln(1.025) [literature] (AD-27.6).',
  },
];

// --- §5.2 rubato -------------------------------------------------------------------------
//
// The curve is the displacement `δ(t) = warp(t) − t` in quarters, from the transliterated
// cyclic warp; the density is `|δ_A − δ_B| / jnd_rubato`. All five rows are evaluator inputs
// to that one curve, and `@loop` decides whether the `mod` in it repeats at all.

const RUBATO_SITES: readonly ComparisonSite[] = [
  instructionSite(RUBATO_MAP, 'rubato'),
  defSite(RUBATO_STYLE, 'rubatoDef'),
];

const RUBATO_ROWS: readonly ComparisonRegistryRow[] = [
  {
    key: 'rubato/rubato@frameLength',
    dimension: 'rubato',
    element: 'rubato',
    attribute: 'frameLength',
    sites: RUBATO_SITES,
    space: { kind: 'gain-ordered' },
    valueDomain: positive,
    unit: 'quarters',
    jnd: RUBATO_DISPLACEMENT_JND_QUARTERS,
    delta: DEFAULT_DELTA_JND,
    plausibleRange: null,
    role: 'curve-shape',
    liveness: 'always',
    ppqSensitive: true,
    notes:
      '§5.2 — the frame period, and the one attribute without which there is nothing to ' +
      'warp: absent on both element and def, getRubatoDataOf returns null and the ' +
      'instruction is skipped, though getEndDate still ends the PRECEDING span, so the gap ' +
      'is unwarped and carries a grid breakpoint (AD-16/R23). ppqSensitive: rescaled by the ' +
      'lcm factor and reported in quarters (§5.0). The domain is positive, narrower than ' +
      'expression’s [0,∞): a write-side setter clamps at 0, but a resolved 0 divides in ' +
      'τ/frameLength and has no comparable warp. jnd = §7.1’s displacement candidate, the ' +
      'only quarters-valued rubato constant there is [convention].',
  },
  {
    key: 'rubato/rubato@intensity',
    dimension: 'rubato',
    element: 'rubato',
    attribute: 'intensity',
    sites: RUBATO_SITES,
    space: { kind: 'log-around-1' },
    valueDomain: positive,
    unit: 'nepers',
    jnd: UNNORMALIZED_JND,
    delta: DEFAULT_DELTA_JND,
    plausibleRange: null,
    role: 'curve-shape',
    liveness: 'always',
    ppqSensitive: false,
    notes:
      '§5.2 — the exponent of (τ/frameLength)^intensity; 1.0 is resolveRubato’s fallback and ' +
      'the identity warp. A ratio gain, hence the logarithm. jnd 1 [convention], ' +
      'unnormalized; the dimension’s density is the displacement curve, not this row.',
  },
  {
    key: 'rubato/rubato@lateStart',
    dimension: 'rubato',
    element: 'rubato',
    attribute: 'lateStart',
    sites: RUBATO_SITES,
    space: { kind: 'gain' },
    valueDomain: trimHead,
    unit: 'ratio',
    jnd: UNNORMALIZED_JND,
    delta: DEFAULT_DELTA_JND,
    plausibleRange: null,
    role: 'curve-shape',
    liveness: 'always',
    ppqSensitive: false,
    notes:
      '§5.2/A-Q10 — priced as an ENDPOINT, not through expression’s joint-trim ' +
      'parametrization: two windows with equal total trim but different placement are ' +
      'different performances, so the comparison space is the identity and the edit path ' +
      'prices the pair as L1 on the endpoints. Defaults to 0.0; RubatoMap floors it at 0 and ' +
      'resets an inverted or empty window to the full frame BEFORE evaluation, and the ' +
      'density uses the clamped pair. jnd 1 [convention], unnormalized.',
  },
  {
    key: 'rubato/rubato@earlyEnd',
    dimension: 'rubato',
    element: 'rubato',
    attribute: 'earlyEnd',
    sites: RUBATO_SITES,
    space: { kind: 'gain' },
    valueDomain: trimTail,
    unit: 'ratio',
    jnd: UNNORMALIZED_JND,
    delta: DEFAULT_DELTA_JND,
    plausibleRange: null,
    role: 'curve-shape',
    liveness: 'always',
    ppqSensitive: false,
    notes:
      '§5.2/A-Q10 — the other endpoint, same reasoning; defaults to 1.0 and is capped at 1 ' +
      'on the way in. With @lateStart at 0 and @intensity at 1 this is the neutral warp, ' +
      'which §5.2 special-cases to δ ≡ 0 without arithmetic (AD-21/M18) so P-C8’s "exactly ' +
      '0" survives frame/τ pairs that do not round-trip. jnd 1 [convention], unnormalized.',
  },
  {
    key: 'rubato/rubato@loop',
    dimension: 'rubato',
    element: 'rubato',
    attribute: 'loop',
    sites: [instructionSite(RUBATO_MAP, 'rubato')],
    space: { kind: 'gain' },
    valueDomain: boolean01,
    unit: 'dimensionless',
    jnd: UNNORMALIZED_JND,
    delta: DEFAULT_DELTA_JND,
    plausibleRange: null,
    role: 'curve-shape',
    liveness: 'always',
    ppqSensitive: false,
    notes:
      '§5.2/AD-10/R3 — a BOOLEAN with a row, which is the correction revision 1 needed: ' +
      'filing @loop as a structural finding made two documents differing only in it score ' +
      'd_rubato = 0. It defaults to FALSE (resolveRubato, data/rubato.ts) and renderRubatoToMap breaks ' +
      'out of the span at the first frame boundary when it is off, so the warp applies on ' +
      '[t₀, t₀ + frameLength) and δ ≡ 0 on the rest of the span; the mod in §5.2’s formula ' +
      'IS this flag. It is never inherited from the def, hence the single site. Its ' +
      'difference is priced through the displacement curve it opens, so the space, unit and ' +
      'jnd here are carriers for the {0,1} encoding and the edit path, not an independent ' +
      'metric — see this module’s note on booleans in §4’s row shape. jnd 1 [convention].',
  },
];

// --- §5.3 dynamics -----------------------------------------------------------------------
//
// The curve is `g(t) = ln(volume(t))` per part, from constant instructions and cubic-Bézier
// transitions, with the IDEAL Bézier as the defined object (§5.0/AD-17) — `tForDate`'s
// 1-tick bisection is the renderer's approximation of it and belongs to the §6.3 replay only.

const DYNAMICS_LOG: ScaleSpace = { kind: 'log-around-1' };

/** §5.3: both shape knobs are read only in the transition branch, and default to 0.0. */
const dynamicsShapeLiveness: ComparisonLiveness = {
  element: 'dynamics',
  rule:
    'read only in the transition branch (DynamicsMap.ts:170-181), i.e. where ' +
    '@transition.to is present and the instruction has a successor (AD-8); on a constant ' +
    'span it is inert. Defaults to 0.0 for <dynamics> — <movement> defaults to 0.4, so the ' +
    'shared Bézier machinery must not share a default (§5.8, AD-13).',
};

const DYNAMICS_ROWS: readonly ComparisonRegistryRow[] = [
  {
    key: 'dynamics/dynamics@volume',
    dimension: 'dynamics',
    element: 'dynamics',
    attribute: 'volume',
    sites: [instructionSite(DYNAMICS_MAP, 'dynamics')],
    space: DYNAMICS_LOG,
    valueDomain: positive,
    unit: 'nepers',
    jnd: DYNAMICS_JND_NEPERS,
    delta: DEFAULT_DELTA_JND,
    plausibleRange: PLAUSIBLE_VELOCITY,
    role: 'curve-level',
    liveness: 'always',
    ppqSensitive: false,
    notes:
      '§5.3 — THE dynamics curve: this row’s jnd is jnd_dynamics. Neutral is velocity 100 ' +
      'before the first instruction and for a wholly absent map (AD-9ii), and an ' +
      'unresolvable level name is PERFORMED at 100.0 by the renderer, which is a ' +
      'renderer-default-level note rather than a skip (R8). Domain and band disagree on ' +
      'purpose and that is intended: 0 is inside §5.0’s plausible [0,127] and outside the ' +
      'logarithm’s domain, so it is plausible and incomparable at once — the band describes ' +
      'the document, the domain decides ⊥. ln(1.10) [convention] — no musically-validated ' +
      'dynamics JND exists; corpus derivation is the named honest alternative (AD-27.6).',
  },
  {
    key: 'dynamics/dynamics@transition.to',
    dimension: 'dynamics',
    element: 'dynamics',
    attribute: 'transition.to',
    sites: [instructionSite(DYNAMICS_MAP, 'dynamics')],
    space: DYNAMICS_LOG,
    valueDomain: positive,
    unit: 'nepers',
    jnd: DYNAMICS_JND_NEPERS,
    delta: DEFAULT_DELTA_JND,
    plausibleRange: PLAUSIBLE_VELOCITY,
    role: 'curve-level',
    liveness: trailingTransitionRule('dynamics', 'dynamicsMap'),
    ppqSensitive: false,
    notes:
      '§5.3 — the Bézier’s target level. DynamicsMap.getEndDate:187-193 has the same ' +
      'MAX_VALUE shape as tempo’s, and executed, a trailing volume=40 transition.to=100 ' +
      'performs a flat 40; all_maps.mpm ends its dynamics map with volume=80 ' +
      'transition.to=110 against a reference rendering scattered around 80. ln(1.10) ' +
      '[convention], as the level row (AD-27.6).',
  },
  {
    key: 'dynamics/dynamics@curvature',
    dimension: 'dynamics',
    element: 'dynamics',
    attribute: 'curvature',
    sites: [instructionSite(DYNAMICS_MAP, 'dynamics')],
    space: { kind: 'boundary-power-low' },
    valueDomain: unitClosed,
    unit: 'nepers',
    jnd: UNNORMALIZED_JND,
    delta: DEFAULT_DELTA_JND,
    plausibleRange: null,
    role: 'curve-shape',
    liveness: dynamicsShapeLiveness,
    ppqSensitive: false,
    notes:
      '§5.3 — the Bézier control-point curvature on [0,1], clamped there by clampCurvature. ' +
      'T = ln(1 − x) is −∞ at the authored value 1, which §4’s cap prices at δ_row rather ' +
      'than clamping — this is one of the enumerated infinite-boundary cases. jnd 1 ' +
      '[convention], unnormalized.',
  },
  {
    key: 'dynamics/dynamics@protraction',
    dimension: 'dynamics',
    element: 'dynamics',
    attribute: 'protraction',
    sites: [instructionSite(DYNAMICS_MAP, 'dynamics')],
    space: { kind: 'logit', lower: -1, upper: 1 },
    valueDomain: signedUnitClosed,
    unit: 'nepers',
    jnd: UNNORMALIZED_JND,
    delta: DEFAULT_DELTA_JND,
    plausibleRange: null,
    role: 'curve-shape',
    liveness: dynamicsShapeLiveness,
    ppqSensitive: false,
    notes:
      '§5.3 — signed control-point protraction on [−1,1], clamped by clampProtraction; ±1 ' +
      'are authored values where T is ∓∞ and §4’s cap applies. jnd 1 [convention], ' +
      'unnormalized.',
  },
  {
    key: 'dynamics/dynamics@subNoteDynamics',
    dimension: 'dynamics',
    element: 'dynamics',
    attribute: 'subNoteDynamics',
    sites: [instructionSite(DYNAMICS_MAP, 'dynamics')],
    space: { kind: 'gain' },
    valueDomain: boolean01,
    unit: 'dimensionless',
    jnd: UNNORMALIZED_JND,
    delta: DEFAULT_DELTA_JND,
    plausibleRange: null,
    role: 'structural',
    liveness: trailingTransitionRule('dynamics', 'dynamicsMap'),
    ppqSensitive: false,
    notes:
      '§5.3/AD-16/R17 — a MECHANISM SWITCH reported as a structural finding with a stated ' +
      'rationale, never folded into a distance (§3). On a sub-note span every note is pinned ' +
      'to velocity 100.0 and the shape is emitted as a CC 7 curve; on an ordinary span the ' +
      'shape rides per-note velocity and CC 7 is pinned to 100. Two documents identical but ' +
      'for the flag are distance 0 under the date-axis curve while driving two different ' +
      'MIDI mechanisms with different time resolution and timbre. Inert on a map’s last ' +
      'instruction (the same size()-1 guard as R1); a LEADING sub-note span leaves notes ' +
      'before startDate with no @velocity at all, which is noted rather than modelled. ' +
      'jnd 1 [convention] and unused — a structural row carries no distance.',
  },
  {
    key: 'dynamics/dynamicsDef@value',
    dimension: 'dynamics',
    element: 'dynamicsDef',
    attribute: 'value',
    sites: [defSite(DYNAMICS_STYLE, 'dynamicsDef')],
    space: DYNAMICS_LOG,
    valueDomain: positive,
    unit: 'nepers',
    jnd: DYNAMICS_JND_NEPERS,
    delta: DEFAULT_DELTA_JND,
    plausibleRange: PLAUSIBLE_VELOCITY,
    role: 'curve-level',
    liveness: 'always',
    ppqSensitive: false,
    notes:
      '§5.3/§5.0 — the def spelling of a level, and the one that matters: name-valued ' +
      'volumes are the MEI norm. Resolution routes through styleScope (levels.ts:38-46 ' +
      'documents the trap verbatim); unresolvable names are performed at velocity 100.0 and ' +
      'reported (R8), never skipped. ln(1.10) [convention], as the level row (AD-27.6).',
  },
];

// --- §5.4 accentuation -------------------------------------------------------------------
//
// The curve is `c(t) = scale · patternDef.getAccentuationAt(beat(t))` in velocity units, with
// the beat phase anchored at the TIME SIGNATURE and never at the instruction (AD-12/R8). Two
// of the rows below are booleans, for AD-10's reason: each changes the performed curve, and a
// flag filed as a structural finding scores 0 for two documents that differ only in it.

const ACCENTUATION_ROWS: readonly ComparisonRegistryRow[] = [
  {
    key: 'accentuation/accentuationPattern@scale',
    dimension: 'accentuation',
    element: 'accentuationPattern',
    attribute: 'scale',
    sites: [instructionSite(METRICAL_ACCENTUATION_MAP, 'accentuationPattern')],
    space: { kind: 'gain-ordered' },
    valueDomain: anyFinite,
    unit: 'velocity',
    jnd: VELOCITY_JND,
    delta: DEFAULT_DELTA_JND,
    plausibleRange: PLAUSIBLE_VELOCITY_DELTA,
    role: 'curve-level',
    liveness: 'always',
    ppqSensitive: false,
    notes:
      '§5.4 — THE accentuation curve: this row’s jnd is jnd_accentuation, and it is the one ' +
      'dimension whose curve is already in the unit its JND is stated in (T is the identity). ' +
      'What lands on a velocity is the PRODUCT scale · getAccentuationAt(beat), so which of ' +
      'the two factors carries the velocity unit is a convention about the same number; the ' +
      'convention here is that the instruction-level factor does, because it is the one a ' +
      'document varies per section while the def stays fixed. MANDATORY — absent, ' +
      'getMetricalAccentuationDataOf returns null and the whole instruction is skipped, which ' +
      'is why expression writes neutrality as "0" rather than by deleting it. 3 velocity ' +
      'units [convention]; corpus derivation is the named alternative (§7.1).',
  },
  {
    key: 'accentuation/accentuationPattern@loop',
    dimension: 'accentuation',
    element: 'accentuationPattern',
    attribute: 'loop',
    sites: [instructionSite(METRICAL_ACCENTUATION_MAP, 'accentuationPattern')],
    space: { kind: 'gain' },
    valueDomain: boolean01,
    unit: 'dimensionless',
    jnd: UNNORMALIZED_JND,
    delta: DEFAULT_DELTA_JND,
    plausibleRange: null,
    role: 'curve-shape',
    liveness: 'always',
    ppqSensitive: false,
    notes:
      '§5.4/AD-10 — a BOOLEAN with a row, on the same argument as rubato’s. It defaults to ' +
      'FALSE, and with it off the renderer breaks out of the span one pattern length in ' +
      '(MetricalAccentuationMap.ts:157-161), so the contribution is the pattern once and then ' +
      '0 for the rest of the span — the identical one-frame-then-identity shape as §5.2. Its ' +
      'difference is priced through the curve it opens, so the space, unit and jnd here are ' +
      'carriers for the {0,1} encoding and the edit path. jnd 1 [convention].',
  },
  {
    key: 'accentuation/accentuationPattern@stickToMeasures',
    dimension: 'accentuation',
    element: 'accentuationPattern',
    attribute: 'stickToMeasures',
    sites: [instructionSite(METRICAL_ACCENTUATION_MAP, 'accentuationPattern')],
    space: { kind: 'gain' },
    valueDomain: boolean01,
    unit: 'dimensionless',
    jnd: UNNORMALIZED_JND,
    delta: DEFAULT_DELTA_JND,
    plausibleRange: null,
    role: 'curve-shape',
    liveness: 'always',
    ppqSensitive: false,
    notes:
      '§5.4 — the second boolean, and the one whose default is TRUE rather than false: the ' +
      'modulus is taken against the MEASURE unless the attribute reads "false", in which case ' +
      'it is taken against the pattern length (MetricalAccentuationMap.ts:162-165). In a ' +
      'measure whose length differs from the pattern’s the two cycles drift apart, so this ' +
      'flag changes the whole phase structure of the span rather than a value in it. jnd 1 ' +
      '[convention].',
  },
  {
    key: 'accentuation/accentuationPatternDef@length',
    dimension: 'accentuation',
    element: 'accentuationPatternDef',
    attribute: 'length',
    sites: [defSite(METRICAL_ACCENTUATION_STYLE, 'accentuationPatternDef')],
    space: { kind: 'gain-ordered' },
    valueDomain: positive,
    unit: 'dimensionless',
    jnd: UNNORMALIZED_JND,
    delta: DEFAULT_DELTA_JND,
    plausibleRange: null,
    role: 'curve-shape',
    liveness: 'always',
    ppqSensitive: false,
    notes:
      '§5.4 — in beats, defaulting to 4.0, and live twice over: getAccentuationAt runs the ' +
      'LAST accentuation’s segment to length + 1 and returns its @transition.to at and after ' +
      'that point, and with @stickToMeasures="false" the same number sets the whole cycle. ' +
      'AD-15: the parser WRITES the default onto the element, so an absent @length and an ' +
      'authored 4.0 are indistinguishable downstream — which is also why the comparison ' +
      'reader reads the def raw rather than constructing one (R1). Not an expression row: it ' +
      'is not exaggerable, it is read. jnd 1 [convention], in beats.',
  },
  {
    key: 'accentuation/accentuation@beat',
    dimension: 'accentuation',
    element: 'accentuation',
    attribute: 'beat',
    sites: [defSite(METRICAL_ACCENTUATION_STYLE, 'accentuation')],
    space: { kind: 'gain' },
    valueDomain: anyFinite,
    unit: 'dimensionless',
    jnd: UNNORMALIZED_JND,
    delta: DEFAULT_DELTA_JND,
    plausibleRange: null,
    role: 'curve-shape',
    liveness: 'always',
    ppqSensitive: false,
    notes:
      '§5.4 — where in the pattern the accentuation sits, in BEATS and therefore not ' +
      'convertible to quarters without the beat grid (a beat is 4·ppq/denominator ticks), ' +
      'which is why the unit is dimensionless and the jnd is one beat. An <accentuation> with ' +
      'no @beat is skipped by the parser. Its difference moves a breakpoint of the curve and ' +
      'is priced through it. jnd 1 [convention].',
  },
  {
    key: 'accentuation/accentuation@value',
    dimension: 'accentuation',
    element: 'accentuation',
    attribute: 'value',
    sites: [defSite(METRICAL_ACCENTUATION_STYLE, 'accentuation')],
    space: { kind: 'gain' },
    valueDomain: anyFinite,
    unit: 'velocity',
    jnd: VELOCITY_JND,
    delta: DEFAULT_DELTA_JND,
    plausibleRange: PLAUSIBLE_VELOCITY_DELTA,
    role: 'curve-level',
    liveness: 'always',
    ppqSensitive: false,
    notes:
      '§5.4 — the accentuation’s own amplitude, and the value the curve takes EXACTLY on its ' +
      'beat: getAccentuationAt returns @value there rather than @transition.from, so the two ' +
      'differ at a single point whenever both were authored. A single point has measure zero ' +
      'and cannot move the integral; it is the edit path this row serves. Signed — an ' +
      'accentuation subtracts as readily as it adds — hence the symmetric band. 3 velocity ' +
      'units [convention], as the level row.',
  },
  {
    key: 'accentuation/accentuation@transition.from',
    dimension: 'accentuation',
    element: 'accentuation',
    attribute: 'transition.from',
    sites: [defSite(METRICAL_ACCENTUATION_STYLE, 'accentuation')],
    space: { kind: 'gain' },
    valueDomain: anyFinite,
    unit: 'velocity',
    jnd: VELOCITY_JND,
    delta: DEFAULT_DELTA_JND,
    plausibleRange: PLAUSIBLE_VELOCITY_DELTA,
    role: 'curve-level',
    liveness: 'always',
    ppqSensitive: false,
    notes:
      '§5.4 — the left end of the ramp towards the next accentuation. DEFAULTING CHAIN: ' +
      '@transition.from falls back to @value and @transition.to falls back to ' +
      '@transition.from, so a bare <accentuation beat value> is a FLAT segment at @value and ' +
      'not a ramp to zero. 3 velocity units [convention].',
  },
  {
    key: 'accentuation/accentuation@transition.to',
    dimension: 'accentuation',
    element: 'accentuation',
    attribute: 'transition.to',
    sites: [defSite(METRICAL_ACCENTUATION_STYLE, 'accentuation')],
    space: { kind: 'gain' },
    valueDomain: anyFinite,
    unit: 'velocity',
    jnd: VELOCITY_JND,
    delta: DEFAULT_DELTA_JND,
    plausibleRange: PLAUSIBLE_VELOCITY_DELTA,
    role: 'curve-level',
    liveness: 'always',
    ppqSensitive: false,
    notes:
      '§5.4 — the right end of the ramp, and the value that governs at and after beat ' +
      'length + 1 for the LAST accentuation. The segment it ramps over is the ASYMMETRY the ' +
      'curve module transliterates: the next accentuation’s beat for every accentuation that ' +
      'has a successor, length + 1 for the last one. Upstream cemfi/meico spells that guard ' +
      '`i > length - 1`, which can never hold, so every segment ran to the pattern end; the ' +
      'fork fixed it (TD3) and this table follows the fixed form. 3 velocity units ' +
      '[convention].',
  },
];

// --- §5.5 articulation -------------------------------------------------------------------
//
// EVENT rows, not curve rows: an articulation is an atom charged to the note or the date it
// names (§5.0's atom rule), so each row's own `localDistance` is what prices a matched pair —
// unlike §5.1–§5.4 and §5.8, where the rows are inputs to one integral.
//
// Every row carries BOTH sites, as expression's do, because the same attribute is legal on the
// instruction and on the def — and the two are not interchangeable. `articulateNote` applies
// the referenced def FIRST and the inline modifiers on top of the def's result, and the
// LIVENESS rule differs between them: on an inline `<articulation>` exactly one duration lever
// fires, while on an `<articulationDef>` they compose. Both halves executed on a 100-tick note:
// `relativeDuration="0.5" absoluteDurationChange="10"` performs 110 inline (the factor inert)
// and 60 on a def (0.5 then +10).

/**
 * §5.5/AD-11i/R4: the inline duration precedence, as a liveness rule keyed on the ELEMENT.
 *
 * `articulateNote` (`maps/data/articulation.ts`) reads `duration` once up front and every branch computes
 * from that original value, overwriting the previous branch's write — so the three tick-domain
 * levers do not compose and the LAST to fire wins. Written in the source's own order, the
 * winner is `absoluteDurationChange`, then `relativeDuration`, then `absoluteDuration`; and
 * `absoluteDurationMs` short-circuits the whole tick branch before any of them.
 */
const inlineDurationRule = (attribute: string): ComparisonLiveness => ({
  element: 'articulation',
  rule:
    `on an inline <articulation> @${attribute} is live only when no lever of higher ` +
    'precedence is present — the order is absoluteDurationChange > relativeDuration > ' +
    'absoluteDuration, and NONE of them fires when @absoluteDurationMs is present ' +
    '(articulateNote reads duration once and each branch overwrites from that ' +
    'original value). On an <articulationDef> the same attributes COMPOSE, so the rule is keyed ' +
    'on the element and never on the attribute name (§5.5, AD-11i, R4).',
});

/** The two sites every articulation attribute is legal at, in expression's own order. */
const articulationSites: readonly ComparisonSite[] = [
  instructionSite(ARTICULATION_MAP, 'articulation'),
  defSite(ARTICULATION_STYLE, 'articulationDef'),
];

const ARTICULATION_ROWS: readonly ComparisonRegistryRow[] = [
  {
    key: 'articulation/articulation@relativeDuration',
    dimension: 'articulation',
    element: 'articulation',
    attribute: 'relativeDuration',
    sites: articulationSites,
    space: { kind: 'log-around-1' },
    valueDomain: positive,
    unit: 'nepers',
    jnd: ARTICULATION_DURATION_JND_NEPERS,
    delta: DEFAULT_DELTA_JND,
    plausibleRange: null,
    role: 'event',
    liveness: inlineDurationRule('relativeDuration'),
    ppqSensitive: false,
    notes:
      '§5.5 — the staccato/tenuto lever, neutral at 1.0 (the renderer’s guard is ' +
      '`!== 1.0`, so an authored 1.0 is a no-op rather than a write). Executed: with a ' +
      'sibling @absoluteDurationChange it is entirely INERT inline, which revision 1 charged ' +
      '0.59 nepers for. ln(1.10) [convention] — NOT the tempo constant, see the JND’s own ' +
      'note: 2.5 % is an inter-onset threshold and a note’s sounding length has no such ' +
      'reference.',
  },
  {
    key: 'articulation/articulation@relativeVelocity',
    dimension: 'articulation',
    element: 'articulation',
    attribute: 'relativeVelocity',
    sites: articulationSites,
    space: { kind: 'log-around-1' },
    valueDomain: positive,
    unit: 'nepers',
    jnd: DYNAMICS_JND_NEPERS,
    delta: DEFAULT_DELTA_JND,
    plausibleRange: null,
    role: 'event',
    liveness: 'always',
    ppqSensitive: false,
    notes:
      '§5.5 — a velocity RATIO, so it takes the velocity-ratio JND (§5.3’s ln(1.10), "a 10 % ' +
      'velocity change") rather than a velocity-unit one. THE VELOCITY LEVERS COMPOSE, unlike ' +
      'the duration levers: articulateNote re-reads @velocity after each write, so ' +
      '@absoluteVelocity then @relativeVelocity then @absoluteVelocityChange chain. Executed: ' +
      '64 with absoluteVelocity=80, relativeVelocity=0.5, absoluteVelocityChange=7 performs ' +
      '47. AD-11i’s one-lever rule is a DURATION rule and does not generalise here. ' +
      '[convention].',
  },
  {
    key: 'articulation/articulation@absoluteDurationChange',
    dimension: 'articulation',
    element: 'articulation',
    attribute: 'absoluteDurationChange',
    sites: articulationSites,
    space: { kind: 'gain' },
    valueDomain: anyFinite,
    unit: 'quarters',
    jnd: RUBATO_DISPLACEMENT_JND_QUARTERS,
    delta: DEFAULT_DELTA_JND,
    plausibleRange: null,
    role: 'event',
    liveness: inlineDurationRule('absoluteDurationChange'),
    ppqSensitive: true,
    notes:
      '§5.5/AD-11iii/R15 — signed TICKS at the performance ppq, hence ppqSensitive, and priced ' +
      'on its RAW value as a document-level quantity: the renderer’s map is nonlinear and ' +
      'note-dependent, applying only when duration > 0 and then halving the change until the ' +
      'result is positive (durNew = duration + change / 2^k). Executed, −200 on a 100-tick ' +
      'note performs 50 — not −100 and not 0. An MSM refinement hook is noted (§9’s ' +
      'three-state estimate); the negative branch cannot be refined without one at all. ' +
      '1/16 quarter [convention], the displacement unit §7.1 gives.',
  },
  {
    key: 'articulation/articulation@absoluteDurationChangeMs',
    dimension: 'articulation',
    element: 'articulation',
    attribute: 'absoluteDurationChangeMs',
    sites: articulationSites,
    space: { kind: 'gain' },
    valueDomain: anyFinite,
    unit: 'ms',
    jnd: ASYNCHRONY_JND_MS,
    delta: DEFAULT_DELTA_JND,
    plausibleRange: null,
    role: 'event',
    liveness: 'always',
    ppqSensitive: false,
    notes:
      '§5.5 — a millisecond duration change, parked on the note by pass one and consumed by ' +
      'pass two, so it survives the tick-domain precedence entirely (it is NOT one of the ' +
      'three levers @absoluteDurationMs short-circuits). 30 ms [convention]: the constant is ' +
      'asynchrony’s [literature] onset threshold, and borrowing it for a DURATION change is the ' +
      'borrowing rather than the measurement — stated so the tag travels with the reuse.',
  },
  {
    key: 'articulation/articulation@absoluteDelay',
    dimension: 'articulation',
    element: 'articulation',
    attribute: 'absoluteDelay',
    sites: articulationSites,
    space: { kind: 'gain' },
    valueDomain: anyFinite,
    unit: 'quarters',
    jnd: RUBATO_DISPLACEMENT_JND_QUARTERS,
    delta: DEFAULT_DELTA_JND,
    plausibleRange: null,
    role: 'event',
    liveness: 'always',
    ppqSensitive: true,
    notes:
      '§5.5 — signed ticks added to @date.perf, neutral at 0.0. It moves BOTH note edges (the ' +
      'ms sibling moves only the onset and therefore shortens the note), and a large value ' +
      'triggers the map sort, which can reorder simultaneous instructions — executed. ' +
      '1/16 quarter [convention]: the same displacement quantity §5.2 prices, in the same unit.',
  },
  {
    key: 'articulation/articulation@absoluteDelayMs',
    dimension: 'articulation',
    element: 'articulation',
    attribute: 'absoluteDelayMs',
    sites: articulationSites,
    space: { kind: 'gain' },
    valueDomain: anyFinite,
    unit: 'ms',
    jnd: ASYNCHRONY_JND_MS,
    delta: DEFAULT_DELTA_JND,
    plausibleRange: null,
    role: 'event',
    liveness: 'always',
    ppqSensitive: false,
    notes:
      '§5.5 — a millisecond onset shift, which IS the asynchrony quantity, so the 30 ms ' +
      '[literature] threshold applies directly rather than by analogy (AD-26.2/AD-27.6). It ' +
      'moves the onset but not the end, so it shortens the note; past the remaining length the ' +
      'shared pass-two commit guard discards it.',
  },
  {
    key: 'articulation/articulation@absoluteVelocityChange',
    dimension: 'articulation',
    element: 'articulation',
    attribute: 'absoluteVelocityChange',
    sites: articulationSites,
    space: { kind: 'gain' },
    valueDomain: anyFinite,
    unit: 'velocity',
    jnd: VELOCITY_JND,
    delta: DEFAULT_DELTA_JND,
    plausibleRange: PLAUSIBLE_VELOCITY_DELTA,
    role: 'event',
    liveness: 'always',
    ppqSensitive: false,
    notes:
      '§5.5 — the idiomatic accent lever: signed, neutral at 0.0, added to whatever the two ' +
      'velocity levers before it left. Never clamped by the renderer, because velocity is a ' +
      'shared bus and the final value depends on MSM note data (R1). 3 velocity units ' +
      '[convention], §7.1’s velocity row.',
  },
  {
    key: 'articulation/articulation@absoluteDuration',
    dimension: 'articulation',
    element: 'articulation',
    attribute: 'absoluteDuration',
    sites: articulationSites,
    space: { kind: 'gain' },
    valueDomain: anyFinite,
    unit: 'quarters',
    jnd: RUBATO_DISPLACEMENT_JND_QUARTERS,
    delta: DEFAULT_DELTA_JND,
    plausibleRange: null,
    role: 'event',
    liveness: inlineDurationRule('absoluteDuration'),
    ppqSensitive: true,
    notes:
      '§5.5/AD-2 — a REPLACEMENT attribute: it has no neutral, so present-vs-present compares ' +
      'in native units and present-vs-absent reads ⊥ rather than being a structural finding. ' +
      'A structural finding contributes 0, which gives A=2, B=absent, C=100 the zero-set ' +
      'violation d(A,B) = d(B,C) = 0 < d(A,C) — M1c, and the reason ⊥ exists. With an MSM the ' +
      'present-vs-absent case refines to a real magnitude against the note’s own duration ' +
      '(R7). Lowest inline precedence of the three tick levers. 1/16 quarter [convention].',
  },
  {
    key: 'articulation/articulation@absoluteDurationMs',
    dimension: 'articulation',
    element: 'articulation',
    attribute: 'absoluteDurationMs',
    sites: articulationSites,
    space: { kind: 'gain' },
    valueDomain: anyFinite,
    unit: 'ms',
    jnd: ASYNCHRONY_JND_MS,
    delta: DEFAULT_DELTA_JND,
    plausibleRange: null,
    role: 'event',
    liveness: 'always',
    ppqSensitive: false,
    notes:
      '§5.5/AD-2 — a REPLACEMENT attribute (⊥ against absent, as @absoluteDuration) and the ' +
      'inline SHORT-CIRCUIT: its mere presence takes the whole tick-domain duration branch out ' +
      'of play, so all three tick levers on the same element are inert beside it. Always live ' +
      'itself, which is why its own liveness is unconditional while theirs is not. 30 ms ' +
      '[convention], borrowed from the asynchrony row rather than measured for it.',
  },
  {
    key: 'articulation/articulation@absoluteVelocity',
    dimension: 'articulation',
    element: 'articulation',
    attribute: 'absoluteVelocity',
    sites: articulationSites,
    space: { kind: 'gain' },
    valueDomain: anyFinite,
    unit: 'velocity',
    jnd: VELOCITY_JND,
    delta: DEFAULT_DELTA_JND,
    plausibleRange: PLAUSIBLE_VELOCITY,
    role: 'event',
    liveness: 'always',
    ppqSensitive: false,
    notes:
      '§5.5/AD-2 — the third REPLACEMENT attribute (⊥ against absent). Unlike the duration ' +
      'replacement it does NOT short-circuit its siblings: it is the first link of the ' +
      'velocity chain, and @relativeVelocity and @absoluteVelocityChange then apply on top of ' +
      'it — executed. 3 velocity units [convention].',
  },
  {
    key: 'articulation/articulation@detuneCents',
    dimension: 'articulation',
    element: 'articulation',
    attribute: 'detuneCents',
    sites: articulationSites,
    space: { kind: 'gain' },
    valueDomain: anyFinite,
    unit: 'cents',
    jnd: UNNORMALIZED_JND,
    delta: DEFAULT_DELTA_JND,
    plausibleRange: null,
    role: 'inert',
    liveness: 'always',
    ppqSensitive: false,
    notes:
      '§5.5/AD-15/R14 — INERT, and a row precisely so that the inertness is stated rather ' +
      'than inferred from an absence. articulateNote writes @detuneCents onto the note, and ' +
      'nothing downstream reads it: the MIDI export has no pitch-bend path for it. R9b’s rule ' +
      'applies — zero density, reported when the two documents differ. The jnd is unused; a ' +
      'row that carries no distance has nothing to normalize. [convention], and moot.',
  },
  {
    key: 'articulation/articulation@detuneHz',
    dimension: 'articulation',
    element: 'articulation',
    attribute: 'detuneHz',
    sites: articulationSites,
    space: { kind: 'gain' },
    valueDomain: anyFinite,
    unit: 'hz',
    jnd: UNNORMALIZED_JND,
    delta: DEFAULT_DELTA_JND,
    plausibleRange: null,
    role: 'inert',
    liveness: 'always',
    ppqSensitive: false,
    notes:
      '§5.5/AD-15/R14 — INERT, as @detuneCents, and written onto the note by the same branch. ' +
      'Its unit is the one place this table needs hertz, and it is a frequency OFFSET rather ' +
      'than a frequency, which is why it is a gain and not a log space. [convention], and moot.',
  },
];

// --- §5.6 ornamentation ------------------------------------------------------------------
//
// EVENT rows, priced through §5.6's alignment DP. The compared object is the RESOLVED
// PERFORMED EFFECT and never the attribute tuple (AD-40.2, generalizing AD-37.3): `@scale`
// multiplies the gradient's two endpoints, so `(from·scale, to·scale)` is what is compared and
// `@scale` is not independently priced. See `ornamentAtoms.ts` for the resolution.

const ORNAMENT_ROWS: readonly ComparisonRegistryRow[] = [
  {
    key: 'ornamentation/ornament@scale',
    dimension: 'ornamentation',
    element: 'ornament',
    attribute: 'scale',
    sites: [instructionSite(ORNAMENTATION_MAP, 'ornament')],
    space: { kind: 'gain-ordered' },
    valueDomain: anyFinite,
    unit: 'velocity',
    jnd: VELOCITY_JND,
    delta: DEFAULT_DELTA_JND,
    plausibleRange: PLAUSIBLE_VELOCITY_DELTA,
    role: 'event',
    liveness: {
      element: 'ornament',
      rule:
        'gates <dynamicsGradient> ENTIRELY and does NOT gate <temporalSpread>. It defaults to ' +
        '0.0 (R19), so an <ornament> with no @scale performs its temporal spread in full and ' +
        'its dynamics not at all — executed. Not independently priced: the gradient’s compared ' +
        'object is (from·scale, to·scale) (AD-40.2).',
    },
    ppqSensitive: false,
    notes:
      '§5.6/AD-40.1 — the attribute revision 2 lost. Panel R19 flagged the 0.0 default and ' +
      'AD-15 ratified the row, but the compilation absorbed it into §5.6 without the GATING ' +
      'behaviour, so a comparison written from §5.6 alone would price a dynamicsGradient ' +
      'difference between two documents that both perform no dynamics whatsoever — revision ' +
      '1’s §5.4 error in a new place. Measured: a def with transition.from=-20 ' +
      'transition.to=20 writes ornament.dynamics 0/0/0 with no @scale and -20/0/+20 with ' +
      'scale="1.0", while the same ornament’s temporalSpread moves the notes either way. ' +
      'CONTRAST §5.4’s accentuationPattern@scale, which is MANDATORY there: absent, the whole ' +
      'instruction is skipped. Same attribute name, two sections, two dispositions — hence the ' +
      'cross-reference in both. 3 velocity units [convention], §7.1’s velocity row.',
  },
  {
    key: 'ornamentation/ornament@note.order',
    dimension: 'ornamentation',
    element: 'ornament',
    attribute: 'note.order',
    sites: [instructionSite(ORNAMENTATION_MAP, 'ornament')],
    space: { kind: 'gain' },
    valueDomain: boolean01,
    unit: 'dimensionless',
    jnd: UNNORMALIZED_JND,
    delta: DEFAULT_DELTA_JND,
    plausibleRange: null,
    role: 'event',
    liveness: {
      element: 'ornament',
      rule:
        'live as a ROW only for the two enumerated orderings, encoded 0 = "ascending pitch" ' +
        '(also the absent default) and 1 = "descending pitch". An explicit ID LIST is not a ' +
        'value of this row: it names notes, which is an identity claim and not a magnitude, ' +
        'and it goes to the finding channel (AD-41.1, on §5.8’s @controller precedent).',
    },
    ppqSensitive: false,
    notes:
      '§5.6/AD-41.1 — a boolean row on §4’s @loop argument, and justified by measurement rather ' +
      'than only by ruling: the two orderings sort the pool by pitch in opposite directions ' +
      '(`Math.sign(pitch1 - pitch2) * finalNoteOrderAscending`), so they decide WHICH note ' +
      'receives which step of the gradient. Executed on three notes at one date with a ' +
      '−20 → +20 gradient over velocity 100: ascending performs 80/100/120 and descending ' +
      '120/100/80. Filing the pair as a structural finding would score two documents that ' +
      'invert an arpeggio at d_ornamentation = 0. Absent ≡ ascending, since the renderer ' +
      'initialises `noteOrderAscending = 1` and only "descending pitch" moves it. jnd 1 ' +
      '[convention]: like @loop the row carries no independent metric — its difference is ' +
      'priced through the pool ordering it selects — and the unit is the {0,1} encoding.',
  },
  {
    key: 'ornamentation/ornament@repetitions',
    dimension: 'ornamentation',
    element: 'ornament',
    attribute: 'repetitions',
    sites: [instructionSite(ORNAMENTATION_MAP, 'ornament')],
    space: { kind: 'gain' },
    valueDomain: (x: number): boolean => Number.isFinite(x) && (x === -1 || x >= 0),
    unit: 'dimensionless',
    jnd: UNNORMALIZED_JND,
    delta: DEFAULT_DELTA_JND,
    plausibleRange: null,
    role: 'event',
    liveness: {
      element: 'ornament',
      rule:
        'the repeat group plays `repetitions + 1` times (D9), and `-1` is meico’s documented ' +
        '"fill the frame" extension. Its PRESENCE is separately load-bearing and is NOT this ' +
        'row: `isV3Ornament` fires on the attribute existing at all, whatever it says, which ' +
        'moves the whole ornament onto the v3 engine — and that engine SKIPS an ornament with ' +
        'no @note.order. Executed: adding repetitions="0", the schema default, takes an ' +
        'ornament from 80/100/120 to 100/100/100. The reader models the gate as a shape, so ' +
        'this row prices only the count.',
    },
    ppqSensitive: false,
    notes:
      '§5.6/AD-15/AD-41.1 — a count, so the identity space and a jnd of one repetition ' +
      '[convention]: "one more turn of the figure" is the smallest difference there is, and no ' +
      'perceptual constant exists for it. `-1` is admitted by the domain predicate as the ' +
      'documented extension rather than rejected as a negative count; any other unusable value ' +
      'is logged by `parseOrnamentRepetitions` and falls back to 0, which the reader ' +
      'reproduces rather than propagating a NaN.',
  },
  {
    key: 'ornamentation/dynamicsGradient@transition.from',
    dimension: 'ornamentation',
    element: 'dynamicsGradient',
    attribute: 'transition.from',
    sites: [defSite(ORNAMENTATION_STYLE, 'dynamicsGradient')],
    space: { kind: 'gain' },
    valueDomain: anyFinite,
    unit: 'velocity',
    jnd: VELOCITY_JND,
    delta: DEFAULT_DELTA_JND,
    plausibleRange: PLAUSIBLE_VELOCITY_DELTA,
    role: 'event',
    liveness: {
      element: 'dynamicsGradient',
      rule:
        'read as the ramp’s START, and performed only where the ornamented pool holds MORE ' +
        'THAN ONE chord: a single-note pool takes @transition.to instead, not this value and ' +
        'not a midpoint (DynamicsGradient.ts:47-49, executed). Scaled by @scale, which ' +
        'defaults to 0 and zeroes the whole gradient.',
    },
    ppqSensitive: false,
    notes:
      '§5.6 — a signed velocity OFFSET added to the note’s velocity, not a velocity, hence the ' +
      'gain space and the symmetric band. The ramp distributes over the ornamented POOL — the ' +
      'notes at the ornament’s date, or the ids @note.order names — one step per chord, and ' +
      'NOT over score time: with the pool’s notes at 0, 360 and 720 only the note sharing the ' +
      'ornament’s date is touched at all. 3 velocity units [convention].',
  },
  {
    key: 'ornamentation/dynamicsGradient@transition.to',
    dimension: 'ornamentation',
    element: 'dynamicsGradient',
    attribute: 'transition.to',
    sites: [defSite(ORNAMENTATION_STYLE, 'dynamicsGradient')],
    space: { kind: 'gain' },
    valueDomain: anyFinite,
    unit: 'velocity',
    jnd: VELOCITY_JND,
    delta: DEFAULT_DELTA_JND,
    plausibleRange: PLAUSIBLE_VELOCITY_DELTA,
    role: 'event',
    liveness: 'always',
    ppqSensitive: false,
    notes:
      '§5.6/AD-40.3 — the ramp’s END, and the value a SINGLE-NOTE pool performs on its own: ' +
      'the `chordSequence.length > 1` branch ramps, and the `else if` hands the lone chord ' +
      'transitionTo·scale. A reader implementing "interpolate across the pool" writes the ' +
      'start value or an average there and is wrong in both cases; measured 20 from a −20 → ' +
      '+20 gradient. That is why this row is `always` live while its sibling is not. 3 ' +
      'velocity units [convention].',
  },
  {
    key: 'ornamentation/temporalSpread@frame.start',
    dimension: 'ornamentation',
    element: 'temporalSpread',
    attribute: 'frame.start',
    sites: [defSite(ORNAMENTATION_STYLE, 'temporalSpread')],
    space: { kind: 'gain' },
    valueDomain: anyFinite,
    unit: 'quarters',
    jnd: RUBATO_DISPLACEMENT_JND_QUARTERS,
    delta: DEFAULT_DELTA_JND,
    plausibleRange: null,
    role: 'event',
    liveness: 'always',
    ppqSensitive: true,
    notes:
      '§5.6/§7.15 — the frame’s left edge, signed and idiomatically negative (an arpeggio ' +
      'starts before its notated date). Ticks unless @time.unit says milliseconds, which is ' +
      'why that attribute is a row of its own. v3 spells it @frame.offset and this name ' +
      'survives as the accepted legacy alias, so the two are ONE quantity in two spellings. ' +
      '1/16 quarter [convention], §7.1’s displacement unit.',
  },
  {
    key: 'ornamentation/temporalSpread@frame.offset',
    dimension: 'ornamentation',
    element: 'temporalSpread',
    attribute: 'frame.offset',
    sites: [defSite(ORNAMENTATION_STYLE, 'temporalSpread')],
    space: { kind: 'gain' },
    valueDomain: anyFinite,
    unit: 'quarters',
    jnd: RUBATO_DISPLACEMENT_JND_QUARTERS,
    delta: DEFAULT_DELTA_JND,
    plausibleRange: null,
    role: 'event',
    liveness: 'always',
    ppqSensitive: true,
    notes:
      '§5.6/AD-15/R18 — the v3 spelling of @frame.start, and a v3 STRUCTURAL MARKER: its mere ' +
      'presence makes the whole <temporalSpread> v3 (TemporalSpread.ts:113), which changes how ' +
      'the frame is parsed. Its own row because a document may carry either spelling and the ' +
      'report must name which. 1/16 quarter [convention].',
  },
  {
    key: 'ornamentation/temporalSpread@frameLength',
    dimension: 'ornamentation',
    element: 'temporalSpread',
    attribute: 'frameLength',
    sites: [defSite(ORNAMENTATION_STYLE, 'temporalSpread')],
    space: { kind: 'gain-ordered' },
    valueDomain: anyFinite,
    unit: 'quarters',
    jnd: RUBATO_DISPLACEMENT_JND_QUARTERS,
    delta: DEFAULT_DELTA_JND,
    plausibleRange: null,
    role: 'event',
    liveness: 'always',
    ppqSensitive: true,
    notes:
      '§5.6 — the frame’s width, and the GEOMETRIC PAIR of @frame.start: the frame is ' +
      '[start, start + length], so the two move together and scaling the length alone drags ' +
      'the centroid late. Expression scales them by one factor for exactly that reason; here ' +
      'they are two rows because a comparison reports where the difference IS, and "the frame ' +
      'is wider" and "the frame starts earlier" are different findings. 1/16 quarter ' +
      '[convention].',
  },
  {
    key: 'ornamentation/temporalSpread@intensity',
    dimension: 'ornamentation',
    element: 'temporalSpread',
    attribute: 'intensity',
    sites: [defSite(ORNAMENTATION_STYLE, 'temporalSpread')],
    space: { kind: 'log-around-1' },
    valueDomain: positive,
    unit: 'nepers',
    jnd: ARTICULATION_DURATION_JND_NEPERS,
    delta: DEFAULT_DELTA_JND,
    plausibleRange: null,
    role: 'event',
    liveness: 'always',
    ppqSensitive: false,
    notes:
      '§5.6 — how the notes are distributed WITHIN the frame: 1.0 spreads them evenly, and ' +
      'other values bunch them towards one end. A ratio, so a log space and a ratio JND; it ' +
      'takes the duration-ratio constant rather than a fourth invented one, since what it ' +
      'reshapes is the spacing of onsets within a fixed window. ln(1.10) [convention].',
  },
];

// --- §5.7 asynchrony ---------------------------------------------------------------------

const ASYNCHRONY_ROWS: readonly ComparisonRegistryRow[] = [
  {
    key: 'asynchrony/asynchrony@milliseconds.offset',
    dimension: 'asynchrony',
    element: 'asynchrony',
    attribute: 'milliseconds.offset',
    sites: [instructionSite(ASYNCHRONY_MAP, 'asynchrony')],
    space: { kind: 'gain' },
    valueDomain: anyFinite,
    unit: 'ms',
    jnd: ASYNCHRONY_JND_MS,
    delta: DEFAULT_DELTA_JND,
    plausibleRange: PLAUSIBLE_OFFSET_MS,
    role: 'step',
    liveness: 'always',
    ppqSensitive: false,
    notes:
      '§5.7 — a per-part STEP curve integrated exactly; the identity T makes the jnd a plain ' +
      'millisecond quantity. A MISSING @milliseconds.offset poisons the span rather than ' +
      'defaulting to 0 (AD-1/R24): getAttributeValue returns "" and parseFloat gives NaN, so ' +
      'every note in the span gets milliseconds.date="NaN" and vanishes from the MIDI ' +
      'export — the span reads ⊥ and is reported renderer-error. The map also takes the next ' +
      'dated child with NO local-name test, so any entry ends the span. Two render mechanics ' +
      'the curve does not model: the shifted start floors at 0 and the shifted end at ' +
      'startDateMs + 1, so the offset is not a pure translation near the start of the piece ' +
      'or on very short notes. 30 ms [literature] — the Goebl et al. 2010 working threshold, ' +
      'bracketed by Hirsh 1959’s 15–20 ms temporal-order floor and Nakamura et al. 2017’s ' +
      '35 ms chord window (AD-26.2/AD-27.6). MS-DOMAIN FLOOR, stated because this is the ' +
      'row it bears on: Friberg & Sundberg 1995’s timing jnd is ABSOLUTE at ~6 ms below ' +
      '~240 ms IOI and relative only above it, so a ratio reading of very short intervals ' +
      'over-reports. This row is already absolute (T is the identity, the jnd is in ms), so ' +
      'the floor costs no machinery here; it is an obligation on the docs and on any future ' +
      'row that reads a timing difference as a ratio (AD-27.6).',
  },
];

// --- §5.8 pedal (movement) ---------------------------------------------------------------
//
// The curve is `position(t)` on [0,1] — a GAIN and deliberately not a logit, because 0 and 1
// are the most common authored values and a logit sends them to ±∞ for a quantity whose
// musical meaning is already linear (§5.8). The family shares `bezier.ts` with §5.3 and shares
// nothing else: the defaults differ, the neutral differs, and this family has NO clamps.

/**
 * §5.8/AD-35: the render guard is `movementIndex < size() - 1` over ENTRIES, so what makes an
 * instruction inert is being the map's last ENTRY — not being its last movement.
 *
 * Its own rule rather than a reuse of {@link trailingTransitionRule}: a trailing `<tempo>` or
 * `<dynamics>` still has a span and performs flat at its own value, while a trailing
 * `<movement>` has no span at all. And under AD-35 the guard is conditional in a way neither of
 * those is: put any entry after the last `<movement>` — a trailing `<style>` — and the movement
 * renders after all, with `getEndDate = Number.MAX_VALUE`.
 */
const movementEntryIndexRule: ComparisonLiveness = {
  element: 'movement',
  rule:
    'rendered unless the movement is the map’s LAST ENTRY (renderMovementToMap:173-183 guards ' +
    'on `movementIndex < this.size() - 1`, and size() counts <style> switches too), or its ' +
    'date is negative. AD-35: an entry after the last <movement> resurrects it with an ' +
    'unbounded span, which over any real window performs flat at @position.',
};

/** §5.8: the shape knobs are read only where the movement is a transition, and are NOT clamped. */
const movementShapeLiveness: ComparisonLiveness = {
  element: 'movement',
  rule:
    'read only where @transition.to is present — a constant movement returns [startDate, ' +
    'position] for every t and never touches the control points (data/movement.ts). ' +
    'Defaults to 0.4 / 0.0, NOT dynamics’ 0.0 / 0.0 (AD-13), and unlike §5.3 the values are ' +
    'never clamped: out of range the date component stops being monotone and the span reads ⊥.',
};

const PEDAL_ROWS: readonly ComparisonRegistryRow[] = [
  {
    key: 'pedal/movement@position',
    dimension: 'pedal',
    element: 'movement',
    attribute: 'position',
    sites: [instructionSite(MOVEMENT_MAP, 'movement')],
    space: { kind: 'gain' },
    valueDomain: unitClosed,
    unit: 'ratio',
    jnd: PEDAL_POSITION_JND_RATIO,
    delta: DEFAULT_DELTA_JND,
    plausibleRange: PLAUSIBLE_POSITION,
    role: 'curve-level',
    liveness: movementEntryIndexRule,
    ppqSensitive: false,
    notes:
      '§5.8 — THE pedal curve: this row’s jnd is jnd_pedal. A gain on [0,1] rather than a ' +
      'logit, because 0.0 and 1.0 are the canonical authored values and a logit sends them to ' +
      '±∞ (§5.8). Out-of-range values are CLAMPED by the MIDI export rather than refused ' +
      '(EventMaker.ts:536), so the span performs at the bound and compares as performed. A ' +
      '<movement> with no @position inherits the previous one’s @transition.to, that scan ' +
      'stepping over any entry that is not a <movement> and yielding 0 where none precedes it. ' +
      'A movement whose predecessor carries no @transition.to is skipped entirely and the ' +
      'previous value holds. 0.1 of full travel [convention] — see the constant.',
  },
  {
    key: 'pedal/movement@transition.to',
    dimension: 'pedal',
    element: 'movement',
    attribute: 'transition.to',
    sites: [instructionSite(MOVEMENT_MAP, 'movement')],
    space: { kind: 'gain' },
    valueDomain: unitClosed,
    unit: 'ratio',
    jnd: PEDAL_POSITION_JND_RATIO,
    delta: DEFAULT_DELTA_JND,
    plausibleRange: PLAUSIBLE_POSITION,
    role: 'curve-level',
    liveness: movementEntryIndexRule,
    ppqSensitive: false,
    notes:
      '§5.8 — the Bézier’s target position, and the value that HOLDS after the span: the MIDI ' +
      'export emits one control change per sampled point and a control change persists until ' +
      'the next one (Msm.ts:1422-1454), so the last event of a span governs until the next ' +
      'span emits. Absent, the movement is CONSTANT — isConstantMovement tests for null, so an ' +
      'unparseable value is a transition towards NaN and reads ⊥, not a constant. 0.1 of full ' +
      'travel [convention], as the position row.',
  },
  {
    key: 'pedal/movement@curvature',
    dimension: 'pedal',
    element: 'movement',
    attribute: 'curvature',
    sites: [instructionSite(MOVEMENT_MAP, 'movement')],
    space: { kind: 'boundary-power-low' },
    valueDomain: unitClosed,
    unit: 'nepers',
    jnd: UNNORMALIZED_JND,
    delta: DEFAULT_DELTA_JND,
    plausibleRange: null,
    role: 'curve-shape',
    liveness: movementShapeLiveness,
    ppqSensitive: false,
    notes:
      '§5.8/AD-13 — the same Bézier control-point curvature as §5.3 with a DIFFERENT default: ' +
      '0.4 (data/movement.ts), not 0.0. The shared machinery must not share a default, and ' +
      'reading a <movement> with dynamics’ default silently reshapes every unshaped pedal ' +
      'gesture in the corpus. NOT clamped here: outside [0,1] the inner control points leave ' +
      'the unit square, x(t) stops being monotone and the sampler emits events whose dates go ' +
      'backwards, so §4’s domain gate takes the whole span to ⊥. T = ln(1 − x) is −∞ at the ' +
      'authored value 1, which §4’s cap prices at δ_row. jnd 1 [convention], unnormalized.',
  },
  {
    key: 'pedal/movement@protraction',
    dimension: 'pedal',
    element: 'movement',
    attribute: 'protraction',
    sites: [instructionSite(MOVEMENT_MAP, 'movement')],
    space: { kind: 'logit', lower: -1, upper: 1 },
    valueDomain: signedUnitClosed,
    unit: 'nepers',
    jnd: UNNORMALIZED_JND,
    delta: DEFAULT_DELTA_JND,
    plausibleRange: null,
    role: 'curve-shape',
    liveness: movementShapeLiveness,
    ppqSensitive: false,
    notes:
      '§5.8 — signed control-point protraction on [−1,1], defaulting to 0.0 and, like ' +
      '@curvature, never clamped: out of range it reads ⊥ with the span. ±1 are authored ' +
      'values where T is ∓∞ and §4’s cap applies. jnd 1 [convention], unnormalized.',
  },
];

// --- §5.9 imprecision (timing / dynamics / duration) --------------------------------------
//
// Three dimensions, one table — the rows differ only in which `imprecisionMap` they live in
// and therefore in their unit and their JND. The generated shape mirrors
// `expression/registry.ts`'s own `IMPRECISION_ROWS` one for one, which is what makes §4's
// superset property hold here literally rather than through a documented substitution: the
// scale space is `gain-ordered` on both sides, because every one of these attributes is a
// WIDTH in the domain's own unit and none of them is a ratio or a bounded shape parameter.
//
// These rows do not sum to the distance. Like tempo's four, they are inputs to one object —
// here the LAW a span declares — and the dimension's density is `W₁(law_A, law_B)` divided by
// the row JND (§5.9, AD-14v). What the rows carry is the unit, the JND, the liveness the
// evaluator must honour, and §7.2's per-attribute breakdown for the report.
//
// The two `process` rows are the exception and are priced on their own, per §5.9's
// `processParameters` component and A-B3: `stepWidth.max` and `degreeOfCorrelation` do not
// enter the marginal at all, and the measurement in `imprecisionLaws.ts` is why — the
// correlated marginal is index-dependent, so the process is exactly what the marginal fails
// to characterize. `milliseconds.timingBasis` joins them on the two correlated elements only
// (AD-14iii); on the four i.i.d. ones it changes which draw a note receives and not the law
// it is drawn from, so it is reported inert and carries no row.

/** Per domain: the map it reads, its unit, its JND, and the provenance of that JND. */
const IMPRECISION_DOMAIN_TABLE = [
  {
    dimension: 'imprecisionTiming',
    map: IMPRECISION_MAP_TIMING,
    unit: 'ms',
    jnd: ASYNCHRONY_JND_MS,
    jndNote:
      'ASYNCHRONY_JND_MS = 30 ms [literature] — Vernon 1936 → Goebl 2001. Reused rather ' +
      'than invented because the QUANTITY KIND matches exactly: a timing-imprecision offset ' +
      'IS an onset displacement in milliseconds, which is what the threshold measures. Same ' +
      'reasoning as @absoluteDelayMs (AD-38.2). The 6 ms absolute floor below ~240 ms IOI ' +
      '(AD-27.6) is a docs obligation on this row as on every ms-domain timing row.',
  },
  {
    dimension: 'imprecisionDynamics',
    map: IMPRECISION_MAP_DYNAMICS,
    unit: 'velocity',
    jnd: VELOCITY_JND,
    jndNote:
      'VELOCITY_JND = 3 velocity units [convention]. The one velocity JND §7.1 states, ' +
      'shared with §5.4 and §5.5 (AD-38.2): T is the identity here, so the law lives in ' +
      'velocity units directly. Unclamped in the map — the offset bites after the dynamics ' +
      'pass — so a wide law can push a velocity outside 0..127 and the MIDI export clamps it.',
  },
  {
    dimension: 'imprecisionDuration',
    map: IMPRECISION_MAP_TONEDURATION,
    unit: 'ms',
    jnd: ASYNCHRONY_JND_MS,
    jndNote:
      'ASYNCHRONY_JND_MS borrowed at 30 ms, and [convention] rather than [literature] — the ' +
      'tag travels with the borrowing (AD-38.2). The evidence is an ONSET threshold and this ' +
      'is a change in a note‘s SOUNDING LENGTH, which has no tracked reference to be judged ' +
      'against; the same argument that gave @relativeDuration its own constant rather than ' +
      'tempo‘s. Calibration alternative, named honestly: derive it from a corpus of ' +
      'note-length differences listeners were asked to discriminate. None was available.',
  },
] as const;

/** {@link ComparisonRegistryRow.valueDomain} for a row whose zero is a `⊥` condition. */
const nonZeroFinite = (value: number): boolean => Number.isFinite(value) && value !== 0;

/**
 * One element's rows across all three domains.
 *
 * A factory per element rather than one table-driven `flatMap`, for the KEY's compile-time
 * check: iterating a union-typed table lets TypeScript form
 * `${dimension}/${anyElement}@${anyAttribute}` and demand keys for combinations no element has.
 * The return type is left to inference so the check happens where the results are ASSIGNED to
 * {@link IMPRECISION_ROWS}, which has the literals; a typo in one attribute name is then a
 * compile error.
 *
 * The `note` is where the renderer study lands. Every rule in one was executed (see
 * `imprecisionLaws.ts` and its tests), and the ones a reader is likeliest to get backwards are
 * the ABSENT cases, because an absent attribute here is not a missing parameter but the
 * parameter 0.
 */
const imprecisionRowsFor = <Element extends string, Attribute extends string>(
  element: Element,
  attributes: readonly (readonly [Attribute, ComparisonRole])[],
  note: string,
) =>
  IMPRECISION_DOMAIN_TABLE.flatMap((domain) =>
    attributes.map(([attribute, role]) => ({
      key: `${domain.dimension}/${element}@${attribute}` as const,
      dimension: domain.dimension,
      element,
      attribute,
      sites: [instructionSite(domain.map, element)],
      space: { kind: 'gain-ordered' } as const,
      // Finite, and for `degreeOfCorrelation` also non-zero: a zero divisor makes the
      // compensating step ±∞ and NaNs every draw after the first (measured), §4's "no comparable
      // quantity". `stepWidth.max = 0` is NOT the same case and stays legal — it freezes the
      // walk at its start value, a correlation of 1.
      valueDomain: attribute === 'degreeOfCorrelation' ? nonZeroFinite : Number.isFinite,
      unit: domain.unit,
      jnd: domain.jnd,
      delta: DEFAULT_DELTA_JND,
      // §5.0 names exactly four [convention] plausibility bands and imprecision is not among
      // them. A fifth is not invented here: the band would have to come from a corpus of
      // authored imprecision widths.
      plausibleRange: null,
      role,
      liveness: { element, rule: note },
      // Milliseconds or velocity units throughout. Nothing here is tick-valued, so §5.0's
      // lcm rescale never touches these rows.
      ppqSensitive: false,
      notes: `§5.9 — ${note} ${domain.jndNote}`,
    })),
  );

const IMPRECISION_ROWS: readonly ComparisonRegistryRow[] = [
  ...imprecisionRowsFor(
    'distribution.uniform',
    [
      ['limit.lower', 'distribution'],
      ['limit.upper', 'distribution'],
    ],
    'The law is U(limit.lower, limit.upper). ABSENT reads as 0, so ONE absent limit gives a ' +
      'genuine U(limit, 0) — measured bit-identical to writing the 0 — and only BOTH absent ' +
      'give δ₀. Inverted limits are the same law: the renderer computes r·(upper − lower) + ' +
      'lower, which sweeps the same interval backwards.',
  ),
  ...imprecisionRowsFor(
    'distribution.gaussian',
    [
      ['deviation.standard', 'distribution'],
      ['limit.lower', 'distribution'],
      ['limit.upper', 'distribution'],
    ],
    'AD-14iv’s mixture (1 − qᴺ)·TruncNormal + qᴺ·N(0, σ), N = 10000 — the rejection ' +
      'sampler’s escape hatch as a law. σ absent (or 0) is δ₀; the limits absent make q = 1 ' +
      'and the law the UNTRUNCATED normal, which is also what limit.lower === limit.upper ' +
      'gives. σ’s sign is immaterial. One absent limit truncates to [limit, 0].',
  ),
  ...imprecisionRowsFor(
    'distribution.triangular',
    [
      ['limit.lower', 'distribution'],
      ['limit.upper', 'distribution'],
      ['mode', 'distribution'],
      ['clip.lower', 'distribution'],
      ['clip.upper', 'distribution'],
    ],
    'clip(triangular(limits, mode)) — clipping is a separate operation in the renderer and is ' +
      'modelled as one, so its atoms at the two bounds are the tails it swallowed. BOTH clips ' +
      'absent is δ₀ via a literal null draw (AD-47); ONE absent clamps to [clip, 0]. An absent ' +
      'mode is mode 0. A mode OUTSIDE the limits is a different law rather than an error — one ' +
      'branch never runs and the support overshoots. limit.lower > limit.upper has NO law at ' +
      'all: the two branches run in opposite directions, so there is no monotone quantile and ' +
      'the span reads ⊥ (§5.8’s non-monotone-pedal disposition).',
  ),
  ...imprecisionRowsFor(
    'distribution.correlated.brownianNoise',
    [
      ['stepWidth.max', 'process'],
      ['limit.lower', 'distribution'],
      ['limit.upper', 'distribution'],
      ['milliseconds.timingBasis', 'process'],
    ],
    'A rejection random walk. Its marginal is INDEX-DEPENDENT, so the declared law is the ' +
      'index-0 one doHandover constructs — uniform over the MIDDLE HALF of the limits ' +
      '(measured: KS 0.0058 against U(−15, 15) for limits ±30, from 20 000 independent ' +
      'chains). stepWidth.max and milliseconds.timingBasis are the PROCESS and are priced ' +
      'separately (A-B3): absent stepWidth.max freezes the walk at its start value, which is a ' +
      'correlation of 1 rather than a smaller spread. @seed makes the span ⊥ — setSeed clears ' +
      'the series doHandover had just seeded.',
  ),
  ...imprecisionRowsFor(
    'distribution.correlated.compensatingTriangle',
    [
      ['degreeOfCorrelation', 'process'],
      ['limit.lower', 'distribution'],
      ['limit.upper', 'distribution'],
      ['clip.lower', 'distribution'],
      ['clip.upper', 'distribution'],
      ['milliseconds.timingBasis', 'process'],
    ],
    'A mean-reverting walk, and the family with the strongest index dependence: measured σ ' +
      'settles at 8.30 for degreeOfCorrelation 2 and 4.91 for 5, against U(−30, 30)’s 17.32, ' +
      'and EXPANDS to 20.76 with atoms at both limits at 0.5. Declared law is again the ' +
      'index-0 one — the middle half of the limits, CLIPPED, which is why clip-less is δ₀. ' +
      'degreeOfCorrelation absent or 0 divides by zero and NaNs every note after the first, so ' +
      'the span reads ⊥. @seed makes it ⊥ as it does for brownianNoise.',
  ),
  // `@milliseconds.timingBasis` on the four I.I.D. elements — role `inert`, per AD-14iii.
  //
  // Filed as rows rather than left absent for R14's reason: the inertness is a FINDING, to be
  // stated rather than inferred from a gap in the table. And it is inert in a precise sense the
  // detune pair's is not — the renderer really does read this attribute, but it selects an INDEX
  // into the pseudorandom sequence, and for these four families the marginal at every index is
  // the same law. The render genuinely differs while the compared object does not, which is
  // pinned as a test. On the two CORRELATED elements the same attribute is a `process` row
  // instead, because there the marginal does depend on the index (see their notes).
  ...imprecisionRowsFor(
    'distribution.uniform',
    [['milliseconds.timingBasis', 'inert']],
    'AD-14iii: the basis sets the index handed to the provider, and for an i.i.d. family the ' +
      'marginal is the same at every index — so a difference here changes WHICH draw a note ' +
      'receives (a per-render artifact this module refuses to model) and not the law it is ' +
      'drawn from. Reported as an inert difference, priced at nothing, never excluded. An ' +
      'explicit 0 is the exception and is ⊥: it divides the millisecond date by zero and the ' +
      'render aborts, which the renderer’s own ≤ 0 fallback does not catch because that guard ' +
      'only ever repairs an ABSENT basis.',
  ),
  ...imprecisionRowsFor(
    'distribution.gaussian',
    [['milliseconds.timingBasis', 'inert']],
    'AD-14iii, as for <distribution.uniform>: index selection, not law selection.',
  ),
  ...imprecisionRowsFor(
    'distribution.triangular',
    [['milliseconds.timingBasis', 'inert']],
    'AD-14iii, as for <distribution.uniform>: index selection, not law selection.',
  ),
  ...imprecisionRowsFor(
    'distribution.list',
    [['milliseconds.timingBasis', 'inert']],
    'AD-14iii, and for the list it is the starkest case: the sequence is DETERMINISTIC ' +
      '(series[i % n], interpolated at fractional indices), so the basis chooses which list ' +
      'entry a note lands on and the empirical law over the list is unchanged either way.',
  ),
  ...imprecisionRowsFor(
    'measurement',
    [['value', 'distribution']],
    'The whole <measurement> list is one law — the empirical distribution of its values as a ' +
      'MULTISET, which is why duplicates matter. An EMPTY list reads ⊥: getValue computes ' +
      'series[i % 0] = series[NaN] = undefined and every note in the span vanishes from the ' +
      'MIDI export (R24). What the renderer actually draws is not sampling at all — ' +
      'series[i % n] with interpolation at fractional indices — so this row, like §5.9’s ' +
      'chord-shake sentence, declares the law rather than the sequence.',
  ),
];

/**
 * DESIGN §5's live attributes for the dimensions evaluated so far, in §5's own order.
 *
 * There is no `@controller` row: §4's metric is on numbers and the value is a NAME, so a
 * mismatch is reported through the structural channel (`pedalDistance.controllerFindings`) as
 * §5.8 asks. The name matters — `Msm.ts:1445` maps only `sustain` and `soft`, and every other
 * name falls through to controller number 0, which is BANK SELECT rather than a pedal — but
 * none of that is a distance.
 */
export const COMPARISON_REGISTRY_ROWS: readonly ComparisonRegistryRow[] = Object.freeze([
  ...TEMPO_ROWS,
  ...RUBATO_ROWS,
  ...DYNAMICS_ROWS,
  ...ACCENTUATION_ROWS,
  ...ARTICULATION_ROWS,
  ...ORNAMENT_ROWS,
  ...ASYNCHRONY_ROWS,
  ...PEDAL_ROWS,
  ...IMPRECISION_ROWS,
]);

// --- Derived views -----------------------------------------------------------------------

const ROWS_BY_DIMENSION = new Map<ComparisonDimension, readonly ComparisonRegistryRow[]>(
  COMPARISON_DIMENSIONS.map((dimension) => [
    dimension,
    COMPARISON_REGISTRY_ROWS.filter((row) => row.dimension === dimension),
  ]),
);

/**
 * Every row of one dimension, in registry order. An empty list is a coverage statement, never
 * "this dimension has no comparable content".
 */
export function comparisonRowsOf(dimension: ComparisonDimension): readonly ComparisonRegistryRow[] {
  return ROWS_BY_DIMENSION.get(dimension) ?? [];
}

const ROWS_BY_KEY = new Map<string, ComparisonRegistryRow>(
  COMPARISON_REGISTRY_ROWS.map((row) => [row.key, row]),
);

/** The row a key names. Total over {@link COMPARISON_JND_KEYS} by construction (tested). */
export function comparisonRowFor(key: ComparisonJndKey): ComparisonRegistryRow {
  const row = ROWS_BY_KEY.get(key);
  // Unreachable while the key vocabulary and the table agree, which a registry test pins in
  // both directions. A programmer error if it ever is not, never data.
  if (row == null) throw new Error(`no comparison registry row for key: ${key}`);
  return row;
}

/**
 * §9.2's `options.jnd` — a partial override of the registry's defaults, keyed by row.
 *
 * Partial because a caller who has a better constant for one attribute has not thereby stated
 * one for the rest; the defaults stay the documented reference (§7.1).
 */
export type JndOverrides = Partial<Record<ComparisonJndKey, number>>;

/**
 * The row as one run sees it: the registry's, with `options.jnd` applied.
 *
 * Only `jnd` is overridable. `δ_row` and `κ` are non-overridable documented constants in v1
 * (AD-25.7), and `plausibleRange` is overridden where it is consumed rather than here, because
 * a band is a claim about a corpus and belongs beside the finding it produces.
 */
export function comparisonRowWith(
  key: ComparisonJndKey,
  overrides: JndOverrides = {},
): ComparisonRegistryRow {
  const row = comparisonRowFor(key);
  const jnd = overrides[key];
  return jnd === undefined ? row : { ...row, jnd };
}

/**
 * The row for an (element, attribute) pair within one dimension, or null where the attribute
 * is not a live one there.
 *
 * Dimension-qualified because the pair alone is not unique across the full table — the reason
 * §4 puts the dimension in the key at all.
 */
export function comparisonRowAt(
  dimension: ComparisonDimension,
  element: string,
  attribute: string,
): ComparisonRegistryRow | null {
  return ROWS_BY_KEY.get(`${dimension}/${element}@${attribute}`) ?? null;
}

// --- §4's capped local metric ------------------------------------------------------------

/** {@link localDistance}'s result: the distance, and whether the cap bound it (§4). */
export interface LocalDistance {
  /** In JND units of the row. Always finite, always ≤ `2·δ_row`. */
  readonly distance: number;
  /** True where the cap bound the value — reported through the `capped` note kind. */
  readonly capped: boolean;
}

/**
 * §4's capped local metric, on the row's JND-normalized scale:
 *
 *     d_row(x, y) = min( |T(x) − T(y)| / jnd_row , 2·δ_row )
 *     d_row(x, ⊥) = δ_row        d_row(⊥, ⊥) = 0
 *
 * Four things fall out of the one cap: truncation of a metric is a metric; `T`'s infinite
 * boundary values become finite without a separate clamp constant; "no comparable value" gets a
 * metric-safe price instead of a hole in the domain; and the density stays total, so R4's
 * decomposition is untouched.
 *
 * This is the attribute-level metric, the §6 edit path's and the step rows'. The curve
 * dimensions integrate their curve instead and use only the row's `jnd` — pricing a tempo
 * difference by summing this function over `@bpm` and `@transition.to` would double the count
 * and lose the span it holds for.
 *
 * `d(x, x)` is exactly 0 for every in-domain `x`, including the values where `T` is infinite:
 * the identity is checked before the subtraction, so `∞ − ∞ = NaN` never arises. Callers pass
 * values that have already met {@link ComparisonRegistryRow.valueDomain}; one that has not is
 * `⊥`, not an argument — and it arrives as `values.ts`'s `Bottom` rather than `null`, because
 * §5.0's totality rule makes it a *value* that survives to the density layer with its cause.
 */
export function localDistance(
  row: ComparisonRegistryRow,
  a: Valued<number>,
  b: Valued<number>,
): LocalDistance {
  return canonicalLocalDistance(row, a, b, IDENTITY_CANONICAL_PAIR);
}

/**
 * §4's capped local metric with §7.4's per-document canonicalization applied in T-space.
 *
 * `'level'` and `'level-gain'` are transforms of `T(x)`, not of `x` — a log space's level is a
 * multiplicative factor and its canonicalization is a subtraction only after the logarithm — so
 * the shift and the scale land here, between `forwardInSpace` and the cap, and nowhere else. A
 * caller canonicalizing the raw VALUE instead would be right for `gain` (where `T` is the
 * identity, and where every row that reaches this function today lives) and silently wrong for
 * every log row, which is the class of error §7.4's own table warns about.
 *
 * `⊥` is untouched by any mode: it has no value to shift, and §4 prices it at `δ_row` from
 * everything regardless of what the other side became.
 */
export function canonicalLocalDistance(
  row: ComparisonRegistryRow,
  a: Valued<number>,
  b: Valued<number>,
  canonical: CanonicalPair,
): LocalDistance {
  if (isBottom(a) || isBottom(b)) {
    if (isBottom(a) && isBottom(b)) return { distance: 0, capped: false };
    return { distance: row.delta, capped: true };
  }
  return localDistanceOf(row, a.value, b.value, canonical);
}

/** {@link localDistance} on two values both known to be present — the ⊥-free half. */
function localDistanceOf(
  row: ComparisonRegistryRow,
  a: number,
  b: number,
  canonical: CanonicalPair,
): LocalDistance {
  const cap = 2 * row.delta;
  // Identity first: `T` is infinite at the boundary fixed points §4 enumerates, and two
  // documents that agree on `curvature = 1` differ by 0, not by `∞ − ∞`. It needs the two
  // canonicalizations to agree as well — under `'level'` two documents holding one value are
  // genuinely at different distances from their own means, which is the mode's whole content.
  if (a === b && sameCanonicalization(canonical.a, canonical.b))
    return { distance: 0, capped: false };
  const raw =
    Math.abs(
      canonicalValue(canonical.a, forwardInSpace(row.space, a)) -
        canonicalValue(canonical.b, forwardInSpace(row.space, b)),
    ) / row.jnd;
  // NaN reaches here only from a caller that skipped the domain gate; the cap is the safe
  // reading — it is what an incomparable pair costs anyway — and the gate is where the
  // report note comes from.
  if (!(raw < cap)) return { distance: cap, capped: true };
  return { distance: raw, capped: false };
}
