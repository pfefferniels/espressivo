/**
 * comparison/DESIGN.md §4's registry, as data — the L0 layer of the comparison module.
 *
 * It reuses the `ScaleSpace` vocabulary of `src/expression/transforms.ts` and the *shape* of
 * that module's `RegistryRow`, and it deliberately does **not** extend `REGISTRY_ROWS`
 * (§4/A-Q9: a read requirement must not widen the write licence). The two tables answer
 * different questions. Expression's asks "may this attribute be rewritten, and through which
 * closed form"; this one asks "what quantity does this attribute contribute to a performance,
 * in what unit, and how large is a difference in it". Three of expression's columns —
 * `inCenterPopulation`, `p5r`, the `s`-domain — are exaggeration concepts with no comparison
 * meaning (survey-code §2.2), and four columns here have no expression counterpart: `unit`,
 * `jnd`, `delta` and `plausibleRange`.
 *
 * **What a row is not.** It is not a distance. The curve dimensions (§5.1–§5.3, §5.7) price
 * the *resolved curve* — `|ln qbpm_A − ln qbpm_B|`, `|δ_A − δ_B|` — and most rows here are
 * inputs to that curve rather than independently metered quantities. A row's own
 * {@link localDistance} is what the §6 edit path prices an attribute-level substitution with,
 * and what the step dimensions integrate. Which rows carry the curve is stated per row.
 *
 * **Coverage is by wave.** `COMPARISON_DIMENSIONS` is the complete eleven of §3 from the
 * first commit, because §3's stability contract turns on the exported list being the whole
 * vocabulary; rows exist for the four dimensions W2 evaluated (tempo, rubato, dynamics,
 * asynchrony) plus the two W3a cut 1 brings (accentuation, pedal). {@link comparisonRowsOf}
 * therefore still returns an empty list for the remaining five, and the registry test names
 * them explicitly so each cut shrinks that list rather than discovering it.
 */
import {
  ASYNCHRONY_MAP,
  DYNAMICS_MAP,
  DYNAMICS_STYLE,
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

/**
 * DESIGN §3/§9.1: the eleven contributing comparison dimensions.
 *
 * The semantic unit is the **map domain**, not the exaggeration knob — a curve already
 * integrates what expression splits into level and shape (§3), which is why this list is
 * eleven where `EXPRESSION_DIMENSIONS` is fifteen.
 *
 * Frozen for the reason `EXPRESSION_DIMENSIONS` is (§9.1, A25): the ESM re-export hands a
 * consumer the same object the option validator reads, so unfrozen, a `push` from outside
 * would widen this package's notion of a legal dimension process-wide. `as const` stops that
 * at compile time only.
 *
 * Widening this list is **additive in the list and breaking for consumers** (§3, AD-22):
 * `D = Σ ω_k d_k` gains a term, so every previously reported distance changes. What the
 * export buys is that the change is mechanically enumerable — no consumer hard-codes eleven.
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
 * DESIGN §3's correspondence to the fifteen expression dimensions, as a frozen data table so
 * the §1.3 cross-module test enumerates it rather than hard-coding it (A25).
 *
 * Every expression dimension appears exactly once, and the containments are the design's:
 * `tempo ⊇ {tempo, tempoShape}` because one curve carries both the level and the transition
 * shape; `ornamentation ⊇ {ornamentSpread, ornamentSpacing, ornamentDynamics}` because the
 * alignment DP prices all three at once (§5.6); `pedal ⊇ pedalShape`.
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
 * The unit of `|T(x) − T(y)|` — i.e. of the row's {@link ComparisonRegistryRow.jnd}, not of
 * its raw attribute value. The distinction is the one trap in this table: a tempo row's
 * `jnd` is in **nepers** while its `plausibleRange` is in quarter-bpm, because the JND lives
 * in `T`-space and plausibility is a statement about the value the document actually wrote.
 *
 * Every log-family space (`log-around-1`, `logit`, both boundary powers) reports `'nepers'`:
 * `T` is a natural logarithm in all of them — of a value, of an odds ratio, of a distance to
 * a bound — and AD-26.1 fixes natural log as the internal convention with an explicit unit
 * tag on every reported log quantity. A gain space's `T` is the identity, so its unit is the
 * attribute's own.
 */
export type ComparisonUnit =
  'nepers' | 'quarters' | 'ms' | 'velocity' | 'cents' | 'ratio' | 'percent' | 'dimensionless';

/**
 * How the row participates in the comparison (§4).
 *
 * `curve-level` and `curve-shape` are inputs to a continuous curve — the level in the curve's
 * own unit, the shape dimensionless — and their differences are priced by integrating the
 * curve, not by summing the rows. `step` is a piecewise-constant curve integrated exactly.
 * `event`, `distribution` and `process` arrive with W3's remaining dimensions. `inert` is an
 * attribute the renderer provably ignores (R9b: zero density, reported when the documents
 * differ). `structural` is read, consequential, and deliberately **never folded into a
 * distance** (§3) — a mechanism switch or an encoding mismatch, reported as a finding.
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
 * Whether the row is always read, or only under a condition on its own element (§4, AD-11,
 * R9). The conditional form names the element the rule is evaluated on and states the rule in
 * prose, because the evaluators that apply it live per dimension and a predicate here could
 * not see the map position an AD-8 rule needs.
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
 * `element` is the **instruction** element the row is named for, and it is what enters
 * {@link ComparisonRegistryRow.key}; `sites` is every physical place the value may be written,
 * which for the families that carry the same attribute on a def as on an instruction is two
 * entries with one key. Where a def carries a *differently named* attribute for the same
 * quantity — `<tempoDef value>` against `<tempo bpm>` — that is its own row, as in expression.
 */
export interface ComparisonRegistryRow {
  /**
   * `${dimension}/${element}@${attribute}` — the public row key (§4, A1).
   *
   * Written out per row rather than derived, and first, because writing it is what type-checks
   * it: the field is the closed {@link ComparisonJndKey} union, so a row naming a key that is
   * not in the vocabulary fails to compile. That the key agrees with the three fields below is
   * the one part a type cannot state, and the registry test pins it for every row.
   */
  readonly key: ComparisonJndKey;
  readonly dimension: ComparisonDimension;
  readonly element: string;
  readonly attribute: string;
  /** Never empty. */
  readonly sites: readonly ComparisonSite[];
  readonly space: ScaleSpace;
  /**
   * Whether a **resolved** value is comparable at all (§4, survey-code §2.2).
   *
   * Resolved is the load-bearing word: def inheritance (§5.0's `styleScope` route) and any
   * renderer clamp the dimension section names — §5.2's `lateStart`/`earlyEnd` floor and cap,
   * for one — are applied *before* this predicate runs, so a document the renderer repairs
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
// Every value here is a default the caller may override through `options.jnd` (§9.2), and
// every one carries its tag. Two are [literature] after AD-27.6 (tempo, asynchrony); the
// rest ship [convention] with survey-lit §4.0's partial support named in the row that uses
// them, never promoted to a citation it does not have.

/**
 * Tempo, in nepers: `ln(1.025)` ≈ 0.0247 — a 2.5 % tempo change, **[literature]** (AD-27.6).
 *
 * Friberg, A. & Sundberg, J. (1995), "Time discrimination in a monotonic, isochronous
 * sequence", *JASA* 98(5), 2524–2531, DOI 10.1121/1.413218: "The absolute jnd was found to be
 * approximately constant at 6 ms for tone interonset intervals shorter than about 240 ms and
 * the relative jnd constant at **2.5 % of the tone interonsets above 240 ms**. Subjects'
 * musical training did not affect these values."
 *
 * Two things make it the right constant for this row rather than a borrowed one. The
 * regime — a *relative* threshold above 240 ms — is exactly the tempo region of musical
 * IOIs, and a relative threshold is a statement about a ratio, which is what makes the
 * logarithm the space and not merely a convenient one. And the threshold is
 * training-independent, so a looser value cannot be excused by appeal to a lay audience.
 *
 * It supersedes revision 2's `ln(1.05)` [convention]. The other regime of the same finding —
 * the **6 ms absolute floor below ~240 ms IOI** — is carried as a note obligation on the
 * ms-domain rows rather than as machinery: see the asynchrony row, and §7.1.
 */
export const TEMPO_JND_NEPERS = Math.log(1.025);

/**
 * Dynamics, in nepers: `ln(1.10)` — a 10 % velocity change [convention], and staying that way
 * (AD-27.6).
 *
 * **No musically-validated dynamics JND was found, and none is invented here.** The classic
 * psychoacoustic reference is Jesteadt, Wier & Green (1977), *JASA* 61(1), 169–177 — the
 * citation is verified but its numeric threshold could not be read at source, so no dB figure
 * is asserted. Repp (1995) reports *positional variation* in the detectability of intensity
 * increments rather than a single threshold, and survey-lit L6 records four loudness
 * conventions coexisting in the literature with no shared scale.
 *
 * The honest alternative, named so it is a choice and not an oversight: **derive this unit
 * from the corpus** — the observed per-attribute spread — and stamp the derived constant into
 * the report, which is the opt-in corpus-normalization path §8 already provides. Until a
 * caller asks for it, 10 % is a declared choice. The log space itself has independent
 * support: partitura's performance codec defines its loudness field as
 * `log(velocity / mean velocity)` (Cancino-Chacón et al. 2022).
 */
export const DYNAMICS_JND_NEPERS = Math.log(1.1);

/**
 * Asynchrony, in milliseconds: 30 ms, **[literature]** (AD-26.2, confirmed by AD-27.6).
 *
 * Three verified anchors bracket the band, and the row takes the middle one:
 *
 * - **15–20 ms** — Hirsh (1959): the separation required to report correctly *which* of two
 *   sounds preceded the other, "independent of the kinds of sounds used". A temporal-order
 *   threshold, i.e. the floor of what is discriminable at all.
 * - **30 ms** — Goebl, Flossmann & Widmer (2010), used as "the typical perceptual threshold"
 *   in the one corpus study that recovers a *musicological* category (earlier rubato) from
 *   asynchrony. Adopting their value makes this module's output directly comparable to theirs.
 * - **35 ms** — Nakamura, Yoshii & Katayose (2017): the window within which onsets are
 *   clustered as one chord, i.e. the field's operational "simultaneous".
 *
 * For scale: typical melody lead is ~30 ms and bass anticipation ≥ 70 ms, so this unit puts
 * melody lead at ~1 JND and dislocation at 2–3 JND.
 */
export const ASYNCHRONY_JND_MS = 30;

/**
 * Rubato displacement, in quarters: a sixty-fourth note [convention], §7.1's `~1/16 quarter`.
 *
 * It is the JND of the rubato **curve** — `|δ_A − δ_B|` in quarters — and the only row in
 * this wave whose value is a duration in the same unit is `@frameLength`, which reuses it for
 * that reason and for no stronger one.
 */
export const RUBATO_DISPLACEMENT_JND_QUARTERS = 1 / 16;

/**
 * The JND of a row for which no literature and no convention exists yet: 1, i.e. the row is
 * reported **unnormalized, in its own `T`-space unit** [convention].
 *
 * The alternative would be to invent a perceptual constant for transition-shape
 * discrimination, and there is none to invent honestly — no study in survey-lit measures the
 * discriminability of a Bézier `@curvature` or a `@meanTempoAt`. A JND of 1 makes
 * `d_row = |T(x) − T(y)|` exactly, which is a magnitude a reader can interpret (one neper of
 * log-odds) rather than a false precision. Every row using it says so in its notes, and
 * §7.1's [PENDING-LIT] slot covers all of them.
 *
 * These rows are shape knobs and gates: none of them carries its dimension's curve, so this
 * constant never enters a §5 density. It is read by the §6 edit path's per-attribute
 * `deltaJnd` and by nothing else in this wave.
 */
export const UNNORMALIZED_JND = 1;

/**
 * Metrical accentuation, in MIDI velocity units: **3** [convention] — §7.1's `velocity` row.
 *
 * The compared object is the per-beat velocity contribution `scale · getAccentuationAt(beat)`
 * (§5.4), which the renderer adds straight onto a note's velocity, so this dimension is the one
 * whose curve is already in the unit its JND is stated in: `T` is the identity and no logarithm
 * is involved. Three velocity units out of 127 is ~2.4 % of the full range.
 *
 * [convention] and not [literature], for the reason {@link DYNAMICS_JND_NEPERS} spells out at
 * length: survey-lit L6 records four coexisting loudness conventions with no shared scale, and
 * no study measures the discriminability of a metrical accent as such. The honest alternative
 * is the same one — derive it from the corpus's own per-attribute spread, which §8's opt-in
 * normalization path already provides.
 */
export const ACCENTUATION_VELOCITY_JND = 3;

/**
 * Pedal position, in fractions of full travel: **0.1** [convention].
 *
 * The space is a gain on [0,1] (§5.8), so the JND is a plain fraction of pedal travel and the
 * choice is a calibration rather than a measurement. It is fixed at a tenth because that makes
 * the **extreme authored difference price at exactly `δ_row`**: canonical pedal maps are exact
 * `0.0`/`1.0` (expression's §7.14 records the same fact from the write side), so full-down
 * against full-up is `1.0 / 0.1 = 10` JND — the same price §4 puts on an incomparable value.
 * Pedal can therefore never dominate `D = Σ ω_k d_k` on the strength of its own scale, and the
 * one number a reader is most likely to check by hand has an interpretable value.
 *
 * **Performability floor, stated because this is the row it bears on.** The rendered value is
 * `Math.round(position · 127)` (`Msm.ts:1441`), so a position difference below `1/127` of
 * travel — 0.079 JND here — is not performed at all. It is not machinery: no clamp or snap is
 * applied, because the *defined* object is the ideal curve (§5.0 rule 3) and quantization
 * belongs to the §6.3 replay. It is an obligation on the docs, as the ms-domain floor is on the
 * asynchrony row.
 *
 * No literature was found for pedal-depth discrimination and none is invented; corpus
 * derivation is the named honest alternative.
 */
export const PEDAL_POSITION_JND_RATIO = 0.1;

/**
 * `δ_row`, the metric cap, in JND units: 10 [convention] (§4, §7.1, AD-2).
 *
 * "An incomparable value counts as ten JNDs, and no single instant counts as more than
 * twenty." Not caller-overridable in v1 of the module (AD-25.7). No row in this wave departs
 * from the default; the column exists because §4 gives it per row.
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
// Named rather than inlined, as in expression's registry, so that two rows claiming the same
// domain provably use the same predicate.

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
 * `@loop` and `@subNoteDynamics` are booleans, and §4's row shape has no column for that:
 * a boolean has no scale space, no unit and no JND. They have rows anyway because AD-10 and
 * §5.3 require it — see their notes — and the encoding is the one a gain space can carry.
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
 * **Why the dimension is in the key** (§4, AD-22, A1). Expression's own `element@attribute`
 * pair is documented as *not* unique — `<distribution.uniform>` appears identically in three
 * maps and therefore three dimensions, and across the live registry `transition.to` occurs
 * three times, `curvature`, `protraction`, `intensity` and `value` twice each. Qualifying by
 * dimension is what makes `options.jnd` and `options.plausibleRange` (AD-25.8) addressable at
 * all, and typing them against this union is what makes a misspelling a compile error rather
 * than a silent no-op — the failure mode `ExaggerateOptions.factors` exists to prevent.
 *
 * W2's four dimensions plus W3a cut 1's two. Each further cut extends the tuple; the registry
 * test pins that it stays in exact correspondence with {@link COMPARISON_REGISTRY_ROWS} in both
 * directions.
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
  'asynchrony/asynchrony@milliseconds.offset',
  'pedal/movement@position',
  'pedal/movement@transition.to',
  'pedal/movement@curvature',
  'pedal/movement@protraction',
] as const);

export type ComparisonJndKey = (typeof COMPARISON_JND_KEYS)[number];

// --- §5.1 tempo --------------------------------------------------------------------------
//
// The curve is `g(t) = ln(qbpm(t))`, `qbpm = bpm · beatLength · 4`, and the dimension's
// density is `|g_A − g_B| / jnd_tempo` — ONE integral over four rows' worth of inputs. The
// level space is `log-around-1`, i.e. the bare logarithm, and not `log-around-center` as
// expression has it: the center is a property of one performance (§7.1's geometric mean over
// that document's population), so two documents bring two centers and a centered `T` would
// not be symmetric under swapping them. It cancels in every difference anyway (§4).

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
      '§5.2 — the exponent of (τ/frameLength)^intensity; 1.0 is RubatoData’s initializer and ' +
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
      'd_rubato = 0. It defaults to FALSE (RubatoData.ts:37) and renderRubatoToMap breaks ' +
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
// of the rows below are booleans, for AD-10's reason: each of them changes the performed curve,
// and filing such a flag as a structural finding is exactly the error that made two documents
// differing only in `rubato@loop` score `d_rubato = 0`.

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
    jnd: ACCENTUATION_VELOCITY_JND,
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
    jnd: ACCENTUATION_VELOCITY_JND,
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
    jnd: ACCENTUATION_VELOCITY_JND,
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
    jnd: ACCENTUATION_VELOCITY_JND,
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
 * Stated as its own rule rather than reusing {@link trailingTransitionRule}, because the two
 * are different mechanisms with different outcomes and §5.8's contrast paragraph exists to keep
 * a reader from taking one for a typo of the other. A trailing `<tempo>` or `<dynamics>` still
 * has a span and performs flat at its own value; a trailing `<movement>` has no span at all.
 * And under AD-35 the guard is conditional in a way neither of those is: put any entry after
 * the last `<movement>` — a trailing `<style>` — and the movement renders after all, with
 * `getEndDate = Number.MAX_VALUE`.
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
    'position] for every t and never touches the control points (MovementData.ts:122-134). ' +
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
      '<movement> with no @position inherits the previous one’s @transition.to, and that scan ' +
      'is `j > 0` so entry 0 is never examined and the inherited value is 0 — deliberate, ' +
      'PARITY-noted, and observable: a leading <style> changes the inherited position. A ' +
      'movement whose predecessor carries no @transition.to is skipped entirely and the ' +
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
      '0.4 (MovementData.ts:28), not 0.0. The shared machinery must not share a default, and ' +
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

/**
 * DESIGN §5's live attributes for the dimensions evaluated so far, in §5's own order.
 *
 * There is no `@controller` row and there deliberately will not be one: §4's metric is on
 * numbers and the value is a NAME, so a mismatch is reported through the structural channel
 * (`pedalDistance.controllerFindings`) exactly as §5.8 asks. The name matters — `Msm.ts:1445`
 * maps only `sustain` and `soft`, and every other name falls through to controller number 0,
 * which is BANK SELECT rather than a pedal — but none of that is a distance.
 */
export const COMPARISON_REGISTRY_ROWS: readonly ComparisonRegistryRow[] = Object.freeze([
  ...TEMPO_ROWS,
  ...RUBATO_ROWS,
  ...DYNAMICS_ROWS,
  ...ACCENTUATION_ROWS,
  ...ASYNCHRONY_ROWS,
  ...PEDAL_ROWS,
]);

// --- Derived views -----------------------------------------------------------------------

const ROWS_BY_DIMENSION = new Map<ComparisonDimension, readonly ComparisonRegistryRow[]>(
  COMPARISON_DIMENSIONS.map((dimension) => [
    dimension,
    COMPARISON_REGISTRY_ROWS.filter((row) => row.dimension === dimension),
  ]),
);

/**
 * Every row of one dimension, in registry order.
 *
 * **Empty for the five dimensions W3's remaining cuts bring** — articulation, ornamentation
 * and the three imprecision domains — which is a coverage statement and not a defect (see the
 * module note). A caller must not read emptiness as "this dimension has no comparable content".
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
 * Four things fall out of the one cap: truncation of a metric is a metric, so the axioms
 * survive; `T`'s infinite boundary values become finite without a separate clamp constant;
 * "no comparable value" gets a metric-safe price instead of a hole in the domain; and the
 * density stays total, so R4's decomposition is untouched.
 *
 * **This is the attribute-level metric**, which is the §6 edit path's and the step rows'. The
 * curve dimensions integrate their curve instead and use only the row's `jnd` — pricing a
 * tempo difference by summing this function over `@bpm` and `@transition.to` would double the
 * count and lose the span it holds for.
 *
 * `d(x, x)` is exactly 0 for every in-domain `x`, including the values where `T` is infinite:
 * the identity is checked before the subtraction, so `∞ − ∞ = NaN` never arises. Callers pass
 * values that have already met {@link ComparisonRegistryRow.valueDomain}; a value that has
 * not is `⊥`, not an argument.
 *
 * `⊥` arrives as the `Bottom` of `values.ts` rather than as `null`, because §5.0's totality
 * rule makes it a *value* that has to survive to the density layer with its cause attached —
 * `null` would be an absence, which is the one thing it is not.
 */
export function localDistance(
  row: ComparisonRegistryRow,
  a: Valued<number>,
  b: Valued<number>,
): LocalDistance {
  if (isBottom(a) || isBottom(b)) {
    if (isBottom(a) && isBottom(b)) return { distance: 0, capped: false };
    return { distance: row.delta, capped: true };
  }
  return localDistanceOf(row, a.value, b.value);
}

/** {@link localDistance} on two values both known to be present — the ⊥-free half. */
function localDistanceOf(row: ComparisonRegistryRow, a: number, b: number): LocalDistance {
  const cap = 2 * row.delta;
  // Identity first: `T` is infinite at the boundary fixed points §4 enumerates, and two
  // documents that agree on `curvature = 1` differ by 0, not by `∞ − ∞`.
  if (a === b) return { distance: 0, capped: false };
  const raw = Math.abs(forwardInSpace(row.space, a) - forwardInSpace(row.space, b)) / row.jnd;
  // NaN reaches here only from a caller that skipped the domain gate; the cap is the safe
  // reading — it is what an incomparable pair costs anyway — and the gate is where the
  // report note comes from.
  if (!(raw < cap)) return { distance: cap, capped: true };
  return { distance: raw, capped: false };
}
