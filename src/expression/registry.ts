/**
 * DESIGN.md §7's fifteen prose tables in a shape the applier can walk: one {@link RegistryRow}
 * per live attribute, carrying the scale space it lives in, the input predicate DESIGN §1.2's
 * validation gate applies, whether it feeds §7.1's center population, and its P5r verdict.
 *
 * What is not here. §7.16's excluded attributes have no row, because a row is a licence to
 * write; the handful the applier must nonetheless READ are named as constants at the bottom of
 * this file. What a space does is `transforms.ts` — a row names a space and the parameters
 * known statically, and the two level rows' center is a run-time quantity (§7.1) the applier
 * binds. Finding elements, resolving styles and deciding atomic groups is the applier's walk;
 * where §7 mandates a handler that is more than "one attribute, one space" — the level pairs,
 * the rubato joint trim, the ornament frame pair, the imprecision groups — the rows still
 * carry the gate and the handler reads them.
 *
 * Rows are addressed by (element, attribute), never by dimension: `@transition.to` appears on
 * `<tempo>`, `<dynamics>`, `<movement>`, `<dynamicsGradient>` and `<accentuation>`, in four
 * scale spaces and with two different fates, and `@intensity` appears on `<rubato>` and on
 * `<temporalSpread>` in two different dimensions. Nothing but the pair identifies a row.
 */
import {
  ARTICULATION_MAP,
  ARTICULATION_STYLE,
  ASYNCHRONY_MAP,
  DYNAMICS_MAP,
  DYNAMICS_STYLE,
  IMPRECISION_MAP_DYNAMICS,
  IMPRECISION_MAP_TIMING,
  IMPRECISION_MAP_TONEDURATION,
  IMPRECISION_MAP_TUNING,
  METRICAL_ACCENTUATION_MAP,
  METRICAL_ACCENTUATION_STYLE,
  MOVEMENT_MAP,
  ORNAMENTATION_MAP,
  ORNAMENTATION_STYLE,
  RUBATO_MAP,
  RUBATO_STYLE,
  TEMPO_MAP,
  TEMPO_STYLE,
} from '../mpm/names.js';
import {
  SCALE_SPACE_FACTOR_DOMAINS,
  type FactorDomain,
  type ScaleSpace,
  type ScaleSpaceTag,
} from './transforms.js';
import type { LevelDomain } from './styleScope.js';

/**
 * DESIGN.md §4/§3: the fifteen user-facing dimensions (A9's v2 set), and the vocabulary A11
 * measures an unknown key in the factors record against.
 *
 * Frozen because the ESM re-export hands a consumer the same object the option validator
 * reads: unfrozen, a `push` from outside would widen this package's notion of a legal
 * dimension process-wide. `as const` stops that at compile time only.
 */
export const EXPRESSION_DIMENSIONS = Object.freeze([
  'tempo',
  'tempoShape',
  'dynamics',
  'dynamicsShape',
  'rubato',
  'articulation',
  'accentuation',
  'ornamentSpread',
  'ornamentSpacing',
  'ornamentDynamics',
  'asynchrony',
  'imprecisionTiming',
  'imprecisionDynamics',
  'imprecisionDuration',
  'pedalShape',
] as const);

export type ExpressionDimension = (typeof EXPRESSION_DIMENSIONS)[number];

/** DESIGN.md §4/R3: a missing key means 1, which means identity. */
export type ExaggerationFactors = Partial<Readonly<Record<ExpressionDimension, number>>>;

/**
 * DESIGN.md §1.1's P5r column: whether the *rendered* effect is monotone in `s`.
 *
 * P5a — `|T(x')| = s·|T(x)|` — is definitional and holds for every row by construction (A12);
 * this is the substantive verdict. Carried per row rather than per dimension because it differs
 * within one: `articulation@absoluteDelay` holds while its sibling `@absoluteDelayMs` is a
 * cliff. The applier never branches on it; it is reported so that a caller sampling `s` knows
 * which rows are a reliable dial.
 */
export type P5rVerdict = 'holds' | 'saturates' | 'non-monotone' | 'cliff';

/** Where a row's attribute physically lives. */
export interface RegistrySite {
  /** `instruction` = a child of a map; `def` = a child of (or under) a `<styleDef>`. */
  readonly kind: 'instruction' | 'def';
  /** The map's local name, or the style collection's — whichever contains the element. */
  readonly container: string;
  readonly element: string;
}

/** `instruction`, `def`, or `both` — §7's "site discipline" column, derived from the sites. */
export type SiteKinds = 'instruction' | 'def' | 'both';

/**
 * A row's scale space with everything that is known statically bound.
 *
 * `level` is the one space whose parameter is not: §7.1's center is a property of the
 * performance, computed after the skip set. The tag stands for `log-around-center` in every
 * respect that matters before the walk — its s-domain, its P3 guarantee — and the applier turns
 * it into a real {@link ScaleSpace} with {@link bindRowSpace}.
 *
 * `joint-trim` is not a scalar space at all (§7.6): it transforms the `(lateStart, earlyEnd)`
 * pair through their total trim, and appears here so the rubato window rows carry the same
 * gate and s-domain as every other row.
 */
export type RowSpace =
  | { readonly kind: 'level'; readonly levelDomain: LevelDomain }
  | { readonly kind: 'log-around-1' }
  | { readonly kind: 'logit'; readonly lower: number; readonly upper: number }
  | { readonly kind: 'boundary-power-low' }
  | { readonly kind: 'gain' }
  | { readonly kind: 'gain-ordered' }
  | { readonly kind: 'joint-trim' };

/** One live attribute of DESIGN.md §7. */
export interface RegistryRow {
  readonly dimension: ExpressionDimension;
  readonly attribute: string;
  /** Every (container, element) pair that carries this attribute. Never empty. */
  readonly sites: readonly RegistrySite[];
  readonly space: RowSpace;
  /**
   * §7.1: whether a value read at this row's site joins its dimension's center population.
   * True for exactly the two prevailing-level attributes and the two def `@value`s.
   * `@transition.to` is false — it is a target, not a prevailing level, and letting a later
   * ritardando target pull the center down would speed the opening tempo up. Every non-level
   * row is false because its dimension has no center at all.
   */
  readonly inCenterPopulation: boolean;
  /**
   * DESIGN §1.2's input predicate: the attribute's mathematical domain, as §7's "domain +
   * citation" column gives it, intersected with what the space can accept. A value failing it
   * is skipped and reported — never transformed, never repaired.
   */
  readonly valueDomain: (value: number) => boolean;
  readonly p5r: P5rVerdict;
  /** The §7 subsection this row is compiled from, plus the obligation it carries. */
  readonly notes: string;
}

// --- Input predicates (DESIGN §7's "domain" column) -------------------------------------
//
// Named rather than inlined so that a row reads as its §7 line does, and so that two rows
// claiming the same domain provably use the same predicate.

/** `ℝ` — a signed offset with no enforced bound. The gate still rejects non-finite. */
const anyFinite = (x: number): boolean => Number.isFinite(x);
/** `ℝ>0` — the domain of both log spaces. Tempo, dynamics levels, ratios, intensities. */
const positive = (x: number): boolean => Number.isFinite(x) && x > 0;
/** `[0,∞)` — `frameLength`, whose setter is a one-sided `Math.max(0,·)` (§7.9). */
const nonNegative = (x: number): boolean => Number.isFinite(x) && x >= 0;
/** `[0,1]` — curvature (§7.5, §7.14); the far bound is an admissible fixed point. */
const unitClosed = (x: number): boolean => Number.isFinite(x) && x >= 0 && x <= 1;
/** `[-1,1]` — protraction (§7.5, §7.14); `±1` are admissible boundary fixed points. */
const signedUnitClosed = (x: number): boolean => Number.isFinite(x) && x >= -1 && x <= 1;
/** `(0,1)` — `meanTempoAt` (§7.3), narrower than the logit space's own closed interval. */
const unitOpen = (x: number): boolean => Number.isFinite(x) && x > 0 && x < 1;
/** `[0,1)` — `lateStart`; the pair constraint `ls < ee` is checked by the joint trim. */
const trimHead = (x: number): boolean => Number.isFinite(x) && x >= 0 && x < 1;
/** `(0,1]` — `earlyEnd`; likewise. */
const trimTail = (x: number): boolean => Number.isFinite(x) && x > 0 && x <= 1;

// --- Site shorthands ---------------------------------------------------------------------

function instructionSite(container: string, element: string): RegistrySite {
  return { kind: 'instruction', container, element };
}

function defSite(container: string, element: string): RegistrySite {
  return { kind: 'def', container, element };
}

// --- §7.2 / §7.3 tempo -------------------------------------------------------------------

const TEMPO_SPACE: RowSpace = { kind: 'level', levelDomain: 'tempo' };
const DYNAMICS_SPACE: RowSpace = { kind: 'level', levelDomain: 'dynamics' };

const TEMPO_ROWS: readonly RegistryRow[] = [
  {
    dimension: 'tempo',
    attribute: 'bpm',
    sites: [instructionSite(TEMPO_MAP, 'tempo')],
    space: TEMPO_SPACE,
    inCenterPopulation: true,
    valueDomain: positive,
    p5r: 'holds',
    notes:
      '§7.2 — classified def-lookup-first then parseFloat (D-A); transformed in ' +
      'quarter-note-normalized space (bpm·beatLength·4). Under gesture scope this endpoint ' +
      'moves only as half of a transition pair, around the pair’s own geomean; on a constant ' +
      'instruction it is untouched (§1.3/A7).',
  },
  {
    dimension: 'tempo',
    attribute: 'transition.to',
    sites: [instructionSite(TEMPO_MAP, 'tempo')],
    space: TEMPO_SPACE,
    inCenterPopulation: false,
    valueDomain: positive,
    p5r: 'cliff',
    notes:
      '§7.2 — excluded from the center population, still transformed; under gesture scope ' +
      'the pair scales around its own geomean; pair-collapse guard refuses a write that ' +
      "would make String(to') === String(bpm') (D-I).",
  },
  {
    dimension: 'tempo',
    attribute: 'value',
    sites: [defSite(TEMPO_STYLE, 'tempoDef')],
    space: TEMPO_SPACE,
    inCenterPopulation: true,
    valueDomain: positive,
    p5r: 'holds',
    notes:
      '§7.2 — deduped by def identity; a part header shadows the global one WHOLESALE; a ' +
      'def reached from instructions with different @beatLength has no single normalization ' +
      'factor and is skipped and reported.',
  },
  {
    dimension: 'tempoShape',
    attribute: 'meanTempoAt',
    sites: [instructionSite(TEMPO_MAP, 'tempo')],
    space: { kind: 'logit', lower: 0, upper: 1 },
    inCenterPopulation: false,
    valueDomain: unitOpen,
    p5r: 'cliff',
    notes:
      '§7.3 — transformed only where @transition.to is present, else inert; a result that ' +
      'saturates onto an exact bound is refused and reported (A3), because 0 and 1 turn the ' +
      'transition into a constant tempo at the other endpoint.',
  },
];

// --- §7.4 / §7.5 dynamics ----------------------------------------------------------------

const DYNAMICS_ROWS: readonly RegistryRow[] = [
  {
    dimension: 'dynamics',
    attribute: 'volume',
    sites: [instructionSite(DYNAMICS_MAP, 'dynamics')],
    space: DYNAMICS_SPACE,
    inCenterPopulation: true,
    valueDomain: positive,
    p5r: 'saturates',
    notes:
      '§7.4 — clamped into options.velocityRange and counted (R6a). Under gesture scope this ' +
      'endpoint moves only as half of a transition pair, around the pair’s own geomean; on a ' +
      'constant instruction it is untouched (§1.3/A7). @subNoteDynamics is read, never ' +
      'written: it selects a harsher CC-based range regime for the same s (§7.16).',
  },
  {
    dimension: 'dynamics',
    attribute: 'transition.to',
    sites: [instructionSite(DYNAMICS_MAP, 'dynamics')],
    space: DYNAMICS_SPACE,
    inCenterPopulation: false,
    valueDomain: positive,
    p5r: 'saturates',
    notes:
      '§7.4 — excluded from the center population, still transformed; never materialized and ' +
      'never dropped, since its mere presence is the switch into the renderer’s transition ' +
      'branch; the MEI end-marker duplicate moves with it under gesture scope (D-I).',
  },
  {
    dimension: 'dynamics',
    attribute: 'value',
    sites: [defSite(DYNAMICS_STYLE, 'dynamicsDef')],
    space: DYNAMICS_SPACE,
    inCenterPopulation: true,
    valueDomain: positive,
    p5r: 'saturates',
    notes:
      '§7.4 — the correct lever for name-valued volumes, which are the MEI norm; deduped by ' +
      'def identity; the clamp can collapse two named levels onto one value, which is ' +
      'reported as mergedLevels.',
  },
  {
    dimension: 'dynamicsShape',
    attribute: 'curvature',
    sites: [instructionSite(DYNAMICS_MAP, 'dynamics')],
    space: { kind: 'boundary-power-low' },
    inCenterPopulation: false,
    valueDomain: unitClosed,
    p5r: 'holds',
    notes:
      '§7.5 — inert on a constant instruction (the renderer force-zeroes it there): reported ' +
      'inert and not written. x = 1 is an admissible fixed point via the closed form.',
  },
  {
    dimension: 'dynamicsShape',
    attribute: 'protraction',
    sites: [instructionSite(DYNAMICS_MAP, 'dynamics')],
    space: { kind: 'logit', lower: -1, upper: 1 },
    inCenterPopulation: false,
    valueDomain: signedUnitClosed,
    p5r: 'holds',
    notes: '§7.5 — same inertness rule; ±1 are admissible boundary fixed points.',
  },
];

// --- §7.6 rubato -------------------------------------------------------------------------
//
// One row per attribute, two sites each. DESIGN §7.6 gives element and def rows separately
// because their parse leniency differs (the def path throws and drops the whole def, the
// element path uses a bare parseFloat), but the transform, the domain and the s-domain are the
// same at both, and the gate catches both parse behaviours identically.

const RUBATO_ROWS: readonly RegistryRow[] = [
  {
    dimension: 'rubato',
    attribute: 'intensity',
    sites: [instructionSite(RUBATO_MAP, 'rubato'), defSite(RUBATO_STYLE, 'rubatoDef')],
    space: { kind: 'log-around-1' },
    inCenterPopulation: false,
    valueDomain: positive,
    p5r: 'holds',
    notes:
      '§7.6 — the gate rejects ≤ 0 rather than repairing it: 0 collapses the frame to an ' +
      'instant and a negative intensity gives Infinity dates. A document of bare ' +
      '<rubato name.ref=…/> has no element attributes at all, so the def site must be covered.',
  },
  {
    dimension: 'rubato',
    attribute: 'lateStart',
    sites: [instructionSite(RUBATO_MAP, 'rubato'), defSite(RUBATO_STYLE, 'rubatoDef')],
    space: { kind: 'joint-trim' },
    inCenterPopulation: false,
    valueDomain: trimHead,
    p5r: 'holds',
    notes:
      '§7.6 / RESOLVED-2 — half of the joint trim t = lateStart + (1 − earlyEnd); the ' +
      'effective window is resolved across def and element FIRST, and a def any of whose ' +
      'referencing elements overrides exactly one bound is excluded from the trim (A6).',
  },
  {
    dimension: 'rubato',
    attribute: 'earlyEnd',
    sites: [instructionSite(RUBATO_MAP, 'rubato'), defSite(RUBATO_STYLE, 'rubatoDef')],
    space: { kind: 'joint-trim' },
    inCenterPopulation: false,
    valueDomain: trimTail,
    p5r: 'holds',
    notes:
      '§7.6 — the other half; written atomically with @lateStart, because 0 ≤ ls < ee ≤ 1 is ' +
      "the renderer's monotonicity guarantee and a crossed pair is silently reset to (0,1).",
  },
];

// --- §7.7 articulation -------------------------------------------------------------------
//
// Seven live attributes, each on both sites. The other five of the twelve an articulation
// element can carry are excluded by D-B (three replacements whose neutral lives in the MSM) and
// by R5 (two pitch attributes) — see EXCLUDED_ARTICULATION_LEVERS below, which the applier
// reads to classify a site `partial`.

function articulationRow(
  attribute: string,
  space: RowSpace,
  valueDomain: (value: number) => boolean,
  p5r: P5rVerdict,
  notes: string,
): RegistryRow {
  return {
    dimension: 'articulation',
    attribute,
    sites: [
      instructionSite(ARTICULATION_MAP, 'articulation'),
      defSite(ARTICULATION_STYLE, 'articulationDef'),
    ],
    space,
    inCenterPopulation: false,
    valueDomain,
    p5r,
    notes,
  };
}

const RATIO_SPACE: RowSpace = { kind: 'log-around-1' };
const GAIN_SPACE: RowSpace = { kind: 'gain' };

const ARTICULATION_ROWS: readonly RegistryRow[] = [
  articulationRow(
    'relativeDuration',
    RATIO_SPACE,
    positive,
    'holds',
    '§7.7 — neutral ≡ absent (the serializer omits it at 1.0). On an INLINE <articulation> a ' +
      'non-zero sibling @absoluteDurationChange wins outright, so this attribute is inert ' +
      'there and is reported rather than written; on <articulationDef> the two compose.',
  ),
  articulationRow(
    'relativeVelocity',
    RATIO_SPACE,
    positive,
    'non-monotone',
    "§7.7 — affine with @absoluteVelocityChange: rendered v' = v·rˢ + s·c is not monotone in " +
      's, and a pair that cancels at s = 1 is not a fixed point. The net-deviation remedy was ' +
      'rejected (needs MSM velocities, R1); the disposition is disclosure — a report note ' +
      'wherever one site carries both.',
  ),
  articulationRow(
    'absoluteDurationChange',
    GAIN_SPACE,
    anyFinite,
    'saturates',
    "§7.7 — signed ticks at the performance PPQ. The renderer's halving loop plateaus for " +
      'negative values and the plateau is note-dependent, so the saturation cannot be ' +
      'predicted from the document.',
  ),
  articulationRow(
    'absoluteDurationChangeMs',
    GAIN_SPACE,
    anyFinite,
    'cliff',
    '§7.7 — the best-behaved lever at attribute level; the cliff is the shared pass-two ' +
      'commit guard, which discards ALL THREE ms modifiers when an exaggerated value inverts ' +
      'the note. Bounding it needs the rendered note length (MSM), so it is report-only (A11).',
  ),
  articulationRow(
    'absoluteDelay',
    GAIN_SPACE,
    anyFinite,
    'holds',
    '§7.7 — the cleanest lever: it moves both note edges. Large values trigger the map sort ' +
      'and can reorder simultaneous instructions.',
  ),
  articulationRow(
    'absoluteDelayMs',
    GAIN_SPACE,
    anyFinite,
    'cliff',
    '§7.7 — moves the onset but not the end, so it SHORTENS the note; past the remaining ' +
      'length the shared commit guard discards it entirely.',
  ),
  articulationRow(
    'absoluteVelocityChange',
    GAIN_SPACE,
    anyFinite,
    'non-monotone',
    '§7.7 / RESOLVED-4 — the idiomatic accent lever. Never clamped: velocity is a shared bus ' +
      'and the final value depends on MSM note data (R1). Reported as R6(b) coefficients.',
  ),
];

// --- §7.8 accentuation -------------------------------------------------------------------

const ACCENTUATION_ROWS: readonly RegistryRow[] = [
  {
    dimension: 'accentuation',
    attribute: 'scale',
    sites: [instructionSite(METRICAL_ACCENTUATION_MAP, 'accentuationPattern')],
    space: { kind: 'gain-ordered' },
    inCenterPopulation: false,
    valueDomain: anyFinite,
    p5r: 'saturates',
    notes:
      '§7.8 / D-C — the SINGLE site: the def triple (@value, @transition.from, ' +
      '@transition.to) is homogeneous of degree 1 with it, so touching both would apply s². ' +
      'The attribute is MANDATORY — absent, the whole instruction is dropped — so neutrality ' +
      'is written as "0" and never expressed by deleting it.',
  },
];

// --- §7.9 / §7.10 / §7.11 ornamentation --------------------------------------------------

const ORNAMENT_ROWS: readonly RegistryRow[] = [
  {
    dimension: 'ornamentSpread',
    attribute: 'frame.start',
    sites: [defSite(ORNAMENTATION_STYLE, 'temporalSpread')],
    space: GAIN_SPACE,
    inCenterPopulation: false,
    valueDomain: anyFinite,
    p5r: 'cliff',
    notes:
      '§7.9 — scaled by the SAME factor as @frameLength: the frame [start, start+length] is a ' +
      'geometric pair and scaling the length alone drags the centroid late. Negative values ' +
      'are idiomatic. @time.unit and @noteoff.shift are read, never written (§7.16). §7.15: ' +
      'v3 did NOT retire this name — it is still accepted as the legacy alias of ' +
      '@frame.offset, so this row also governs the offset of a v3 spread that spells it the ' +
      'old way, where the value is a TemporalValue rather than a bare double.',
  },
  {
    dimension: 'ornamentSpread',
    attribute: 'frame.offset',
    sites: [defSite(ORNAMENTATION_STYLE, 'temporalSpread')],
    space: GAIN_SPACE,
    inCenterPopulation: false,
    valueDomain: anyFinite,
    p5r: 'cliff',
    notes:
      '§7.15 — the v3 spelling of @frame.start, and a v3 structural marker: its mere presence ' +
      'makes the whole <temporalSpread> v3. Same signed gain under the same factor as ' +
      '@frameLength; what differs is the ENCODING — the value carries its own unit suffix, ' +
      'which is preserved byte for byte across the scaling (temporalValue.ts).',
  },
  {
    dimension: 'ornamentSpread',
    attribute: 'frameLength',
    sites: [defSite(ORNAMENTATION_STYLE, 'temporalSpread')],
    space: { kind: 'gain-ordered' },
    inCenterPopulation: false,
    valueDomain: nonNegative,
    p5r: 'cliff',
    notes:
      "§7.9 / D-E — s ≥ 0 because the setter's one-sided Math.max(0,·) turns a negative value " +
      "into a collapsed spread rather than a reversed one. The prototype's collection-geomean " +
      'is dropped: it is an exact no-op for single-def styles and couples unrelated defs. ' +
      '§7.15: ONE row for both generations — v3 changed the encoding (a unit suffix) and the ' +
      'ABSENT-value default (100% of the principal note, not 0.0), never the space or the ' +
      'domain. The v3 clamp is the same one-sided Math.max(0,·), so a negative value is ' +
      'refused rather than repaired in both.',
  },
  {
    dimension: 'ornamentSpacing',
    attribute: 'intensity',
    sites: [defSite(ORNAMENTATION_STYLE, 'temporalSpread')],
    space: RATIO_SPACE,
    inCenterPopulation: false,
    valueDomain: positive,
    p5r: 'holds',
    notes:
      '§7.10 — the spacing curve of the roll, an exponent rather than a width, which is why it ' +
      'is its own dimension. The epsilon floor is DROPPED (A4): this space cannot produce a ' +
      'non-positive result from a positive input, so a floor could only edit an authored value. ' +
      'UNCHANGED in v3, verified in the code: TemporalSpread parses @intensity with the same ' +
      'parseFloat outside its v2/v3 branch, so it never carries a unit suffix.',
  },
  {
    dimension: 'ornamentDynamics',
    attribute: 'transition.from',
    sites: [defSite(ORNAMENTATION_STYLE, 'dynamicsGradient')],
    space: GAIN_SPACE,
    inCenterPopulation: false,
    valueDomain: anyFinite,
    p5r: 'holds',
    notes:
      '§7.11 / RESOLVED-5 — a GAIN, not a logit on [−1,1]: nothing enforces that range ' +
      'anywhere, the values are velocity units ADDED to velocity, and the built-in arpeggio ' +
      'ships (−1,+1), which a logit would make fixed points. A result outside [−1,1] is ' +
      'reported informationally, never corrected. §7.15 says v3 "replaces" this row; the code ' +
      'says nothing to replace — DynamicsGradient has no v3 branch at all, so both generations ' +
      'share this row unchanged, endpoints, absent-@transition.to default and all.',
  },
  {
    dimension: 'ornamentDynamics',
    attribute: 'transition.to',
    sites: [defSite(ORNAMENTATION_STYLE, 'dynamicsGradient')],
    space: GAIN_SPACE,
    inCenterPopulation: false,
    valueDomain: anyFinite,
    p5r: 'holds',
    notes:
      '§7.11 — scaled ONLY where physically present: absent it defaults to @transition.from, ' +
      'so materializing it would silently turn a flat offset into a ramp. Single-chord ' +
      'ornaments are governed entirely by this endpoint.',
  },
];

// --- §7.12 asynchrony --------------------------------------------------------------------

const ASYNCHRONY_ROWS: readonly RegistryRow[] = [
  {
    dimension: 'asynchrony',
    attribute: 'milliseconds.offset',
    sites: [instructionSite(ASYNCHRONY_MAP, 'asynchrony')],
    space: GAIN_SPACE,
    inCenterPopulation: false,
    valueDomain: anyFinite,
    p5r: 'saturates',
    notes:
      '§7.12 — exactly linear in the document; the saturation is render-side and one-sided ' +
      '(negative offsets floor at t = 0 near the start, short notes at start + 1 ms).',
  },
];

// --- §7.13 imprecision -------------------------------------------------------------------
//
// Three dimensions, one table: the rows differ only in which imprecisionMap they live in and
// therefore in their units (ms / velocity units / ms of note length). Per D-F the width-like
// attributes of ONE distribution scale as a single atomic group, which
// `imprecisionGroupAttributes` derives from these rows for the applier to enforce.

/**
 * The one distribution whose group does not live on the distribution element:
 * `<distribution.list>` holds a `<measurement>` per drawn value and the whole list is the
 * atomic group, so the registry's site for it is the child. The applier's walk has to know that
 * before it can ask {@link imprecisionGroupAttributes} anything useful.
 */
export const DISTRIBUTION_LIST_ELEMENT = 'distribution.list';
export const MEASUREMENT_ELEMENT = 'measurement';

/** DESIGN §7.13's per-distribution groups: element local name → its width-like attributes. */
const IMPRECISION_GROUPS: readonly (readonly [string, readonly string[], string])[] = [
  [
    'distribution.uniform',
    ['limit.lower', 'limit.upper'],
    'atomic pair; joint scaling scales every drawn value by exactly s',
  ],
  [
    'distribution.gaussian',
    ['deviation.standard', 'limit.lower', 'limit.upper'],
    'atomic triple — the limits are REJECTION bounds, so scaling the deviation alone changes ' +
      'the truncation ratio and desynchronizes the whole sequence',
  ],
  [
    'distribution.triangular',
    ['limit.lower', 'limit.upper', 'mode', 'clip.lower', 'clip.upper'],
    'atomic five; a clip that scaled to 0 is still written, because an ABSENT clip renders ' +
      'the whole distribution a silent no-op',
  ],
  [
    'distribution.correlated.brownianNoise',
    ['stepWidth.max', 'limit.lower', 'limit.upper'],
    'atomic triple; scaling the step alone raises the wall-rejection rate and desynchronizes',
  ],
  [
    'distribution.correlated.compensatingTriangle',
    ['limit.lower', 'limit.upper', 'clip.lower', 'clip.upper'],
    'atomic four (@degreeOfCorrelation is a shape parameter with neutral 1.0 and is excluded); ' +
      'the clips also seed the first value',
  ],
  [
    DISTRIBUTION_LIST_ELEMENT,
    // The group is the @value of every <measurement> CHILD, not an attribute of the
    // distribution element itself. The applier knows; the row carries the attribute name.
    ['value'],
    'the whole list is one atomic group, on the <measurement> children; PRNG-free, and ' +
      'therefore the ideal deterministic fixture family',
  ],
];

const IMPRECISION_DOMAINS: readonly (readonly [ExpressionDimension, string, string])[] = [
  ['imprecisionTiming', IMPRECISION_MAP_TIMING, 'milliseconds; the render floors the result at 0'],
  [
    'imprecisionDynamics',
    IMPRECISION_MAP_DYNAMICS,
    'velocity units, unclamped in the map and biting after the dynamics pass — an R6(b) ' +
      'reporting dimension',
  ],
  [
    'imprecisionDuration',
    IMPRECISION_MAP_TONEDURATION,
    'milliseconds of note length, with NO floor at all: a scaled negative offset can push a ' +
      "note's end before its start and the MIDI writer emits it anyway",
  ],
];

const IMPRECISION_ROWS: readonly RegistryRow[] = IMPRECISION_DOMAINS.flatMap(
  ([dimension, map, domainNote]) =>
    IMPRECISION_GROUPS.flatMap(([element, attributes, groupNote]) =>
      attributes.map((attribute): RegistryRow => ({
        dimension,
        attribute,
        sites: [
          instructionSite(
            map,
            element === DISTRIBUTION_LIST_ELEMENT ? MEASUREMENT_ELEMENT : element,
          ),
        ],
        space: { kind: 'gain-ordered' },
        inCenterPopulation: false,
        valueDomain: anyFinite,
        p5r: 'holds',
        notes: `§7.13 ${element} — ${groupNote}. Domain: ${domainNote}. s ≥ 0 is an API constraint, not a preference: s < 0 inverts every lower/upper pair, while s = 0 is well defined and means "remove all imprecision".`,
      })),
    ),
);

// --- §7.14 pedalShape --------------------------------------------------------------------

const PEDAL_ROWS: readonly RegistryRow[] = [
  {
    dimension: 'pedalShape',
    attribute: 'curvature',
    sites: [instructionSite(MOVEMENT_MAP, 'movement')],
    space: { kind: 'boundary-power-low' },
    inCenterPopulation: false,
    valueDomain: unitClosed,
    p5r: 'holds',
    notes:
      '§7.14 / D-G as amended by A9 — the same Bézier pair as §7.5 and the same cancellation ' +
      'proof of neutrality at 0. This family has NO clamps of its own, which is exactly why ' +
      'the domain-closed transform is required: an out-of-range control point makes the date ' +
      'component non-monotone and the sampler emits events whose dates go backwards.',
  },
  {
    dimension: 'pedalShape',
    attribute: 'protraction',
    sites: [instructionSite(MOVEMENT_MAP, 'movement')],
    space: { kind: 'logit', lower: -1, upper: 1 },
    inCenterPopulation: false,
    valueDomain: signedUnitClosed,
    p5r: 'holds',
    notes:
      '§7.14 — the best-behaved attribute in the family: signed, symmetric, neutral at 0, and ' +
      'notated dates untouched (R5-safe). @position and @transition.to stay excluded under ' +
      'D-G: canonical pedal maps are exact 0.0/1.0, where every candidate transform has a pole.',
  },
];

/** DESIGN.md §7's live attributes, in §7's own order. */
export const REGISTRY_ROWS: readonly RegistryRow[] = [
  ...TEMPO_ROWS,
  ...DYNAMICS_ROWS,
  ...RUBATO_ROWS,
  ...ARTICULATION_ROWS,
  ...ACCENTUATION_ROWS,
  ...ORNAMENT_ROWS,
  ...ASYNCHRONY_ROWS,
  ...IMPRECISION_ROWS,
  ...PEDAL_ROWS,
];

// --- Derived views -----------------------------------------------------------------------

const ROWS_BY_DIMENSION = new Map<ExpressionDimension, readonly RegistryRow[]>(
  EXPRESSION_DIMENSIONS.map((dimension) => [
    dimension,
    REGISTRY_ROWS.filter((row) => row.dimension === dimension),
  ]),
);

/** Every row of one dimension, in registry order. Never empty — all fifteen have rows. */
export function rowsOf(dimension: ExpressionDimension): readonly RegistryRow[] {
  return ROWS_BY_DIMENSION.get(dimension) ?? [];
}

function siteKey(elementLocalName: string, attribute: string): string {
  return `${elementLocalName}@${attribute}`;
}

/**
 * The separator between a dimension and a site key in the dimension-scoped index. A space, and
 * deliberately a printable one: no dimension name and no element or attribute local name
 * contains a space, so it separates unambiguously and the file stays plain text. A raw NUL
 * separates just as well but makes `file` classify this module as binary, after which every
 * `grep` over it silently matches nothing.
 */
const DIMENSION_KEY_SEPARATOR = ' ';

const ROWS_BY_SITE = new Map<string, RegistryRow>();
const ROWS_BY_DIMENSION_AND_SITE = new Map<string, RegistryRow>();
for (const row of REGISTRY_ROWS) {
  for (const site of row.sites) {
    const key = siteKey(site.element, row.attribute);
    // First wins, which matters for exactly one family — see {@link rowFor}.
    if (!ROWS_BY_SITE.has(key)) ROWS_BY_SITE.set(key, row);
    ROWS_BY_DIMENSION_AND_SITE.set(`${row.dimension}${DIMENSION_KEY_SEPARATOR}${key}`, row);
  }
}

/**
 * The row governing one (element local name, attribute name) pair, or null when the attribute
 * is not a live one — which is the answer for every §7.16 exclusion, so the applier asks this
 * question rather than carrying its own list of what it may write.
 *
 * The pair is unique for every row except the imprecision ones: `<distribution.uniform>`
 * appears identically in three maps and therefore in three dimensions, differing only in the
 * `dimension` field and in the units its notes describe. A caller that needs the right
 * `dimension` must use {@link rowForIn}.
 */
export function rowFor(elementLocalName: string, attribute: string): RegistryRow | null {
  return ROWS_BY_SITE.get(siteKey(elementLocalName, attribute)) ?? null;
}

/** {@link rowFor}, disambiguated by dimension — the lookup the imprecision walk needs. */
export function rowForIn(
  dimension: ExpressionDimension,
  elementLocalName: string,
  attribute: string,
): RegistryRow | null {
  return (
    ROWS_BY_DIMENSION_AND_SITE.get(
      `${dimension}${DIMENSION_KEY_SEPARATOR}${siteKey(elementLocalName, attribute)}`,
    ) ?? null
  );
}

/** §7's "site discipline" column, derived rather than restated. */
export function siteKindsOf(row: RegistryRow): SiteKinds {
  const hasInstruction = row.sites.some((site) => site.kind === 'instruction');
  const hasDef = row.sites.some((site) => site.kind === 'def');
  if (hasInstruction && hasDef) return 'both';
  return hasInstruction ? 'instruction' : 'def';
}

/** The `transforms.ts` tag of a row's space — `level` is `log-around-center` by another name. */
export function scaleSpaceTagOf(space: RowSpace): ScaleSpaceTag {
  return space.kind === 'level' ? 'log-around-center' : space.kind;
}

/**
 * A row's space with its run-time parameter bound, or null for the joint trim, which is a
 * pair transform and has no scalar form.
 *
 * `center` is required by, and only by, the two level dimensions (§7.1).
 */
export function bindRowSpace(space: RowSpace, center: number | null): ScaleSpace | null {
  switch (space.kind) {
    case 'level':
      return center === null ? null : { kind: 'log-around-center', center };
    case 'joint-trim':
      return null;
    case 'logit':
      return { kind: 'logit', lower: space.lower, upper: space.upper };
    // The four spaces that carry no parameter, so binding one is the identity on its tag.
    // Enumerated rather than defaulted: a new RowSpace arm that DOES carry a parameter would
    // otherwise be silently constructed without it.
    case 'log-around-1':
    case 'boundary-power-low':
    case 'gain':
    case 'gain-ordered':
      return { kind: space.kind };
  }
}

/**
 * DESIGN §1/A3: a dimension's admissible-s domain is the intersection over its rows' scale
 * spaces, so one `s ≥ 0` row constrains the whole dimension. `ornamentSpread` is the case that
 * makes this worth deriving rather than tabulating: `@frame.start` is a signed gain admitting
 * every real s, `@frameLength` is an ordered gain admitting only `s ≥ 0`, and the dimension
 * scales both by ONE factor — so the dimension is `s ≥ 0`, which is what §8's `0 … 4` assumes.
 */
export function factorDomainOf(dimension: ExpressionDimension): FactorDomain {
  const anyNonNegative = rowsOf(dimension).some(
    (row) => SCALE_SPACE_FACTOR_DOMAINS[scaleSpaceTagOf(row.space)] === 'non-negative',
  );
  return anyNonNegative ? 'non-negative' : 'real';
}

/**
 * The attribute names of one imprecision distribution's atomic group (D-F), in registry order,
 * or an empty list for an element that is not a distribution of that dimension. All-or-nothing
 * is the contract: scaling a subset changes a truncation ratio or a sampling grid rather than a
 * magnitude, which is a different distribution, not an exaggerated one.
 */
export function imprecisionGroupAttributes(
  dimension: ExpressionDimension,
  elementLocalName: string,
): readonly string[] {
  return rowsOf(dimension)
    .filter((row) => row.sites.some((site) => site.element === elementLocalName))
    .map((row) => row.attribute);
}

/** The distribution element local names §7.13 groups, in registry order. */
export const DISTRIBUTION_ELEMENTS: readonly string[] = IMPRECISION_GROUPS.map(
  ([element]) => element,
);

export const IMPRECISION_DIMENSION_MAPS: Readonly<Partial<Record<ExpressionDimension, string>>> =
  Object.fromEntries(IMPRECISION_DOMAINS.map(([dimension, map]) => [dimension, map]));

// --- Excluded attributes the applier must READ (§7.16) -----------------------------------
//
// An excluded attribute has no row, because a row is a licence to write. These constants exist
// because §7.16 additionally says "read it" for a handful of them, and an obligation the
// applier discharges deserves a symbol rather than a string literal buried in a walker.

/**
 * §7.16 — a unit declaration, not a quantity, and the reason `tempo` needs two passes: the
 * center is computed on `bpm·beatLength·4`, and an instruction WITHOUT it is skipped by the
 * renderer entirely (§7.2's inert case).
 */
export const TEMPO_BEAT_LENGTH_ATTRIBUTE = 'beatLength';

/**
 * §7.11/§7.16 — the degree-1 partner of the gradient endpoints, excluded so that one factor
 * cannot apply s². Read because every term of the rendered contribution carries it, so `@scale`
 * absent or 0 makes the whole gradient inert — which §7.11 reports rather than answering with a
 * silently generated identity document.
 */
export const ORNAMENT_SCALE_ATTRIBUTE = 'scale';

/**
 * §7.16/RESOLVED-7 — sampling grain, not a magnitude. Read because an ABSENT one is derived
 * from exactly the attributes being scaled, which re-indexes the random sequence: the
 * distribution is still scaled and the report carries the flag.
 */
export const TIMING_BASIS_ATTRIBUTE = 'milliseconds.timingBasis';

/** §7.16/A9 — the imprecision domain nothing in this codebase reads. Reported inert. */
export const INERT_IMPRECISION_MAP = IMPRECISION_MAP_TUNING;

/**
 * §7.9/§7.16 — the enum that decides whether a `<temporalSpread>` frame is measured in
 * PPQ-relative ticks or in absolute milliseconds.
 *
 * Excluded as an enum, but load-bearing for the FACTOR: §8's `ornamentSpread` row makes the
 * caller's admissible `s` depend on it ("in the milliseconds frame domain the same s is
 * absolute rather than tempo-relative — halve it, or sample against the value"), and a caller
 * cannot judge that from a document it has not parsed, so every transformed spread reports
 * which regime it was in.
 *
 * v3's spec deletes the attribute; its reader does not. A suffix-less v3 value still falls back
 * to a sibling `@time.unit` before defaulting to ticks (`temporalValue.ts`'s
 * `resolveTemporalDomain`), and suffix-less is what the format's own sample corpus writes, so
 * the read-it obligation survives into v3 — the report just names the value's own domain there
 * instead of the enum.
 */
export const FRAME_TIME_UNIT_ATTRIBUTE = 'time.unit';

/**
 * The two spellings of the ornament frame's offset and the one spelling of its length. Named
 * because the applier's generation detection is keyed on them structurally rather than on a row
 * lookup: `@frame.offset`'s mere PRESENCE is what makes a `<temporalSpread>` v3, and
 * `@frame.start` is both the v2 name and the alias v3 still reads it under.
 */
export const FRAME_OFFSET_ATTRIBUTE = 'frame.offset';
export const FRAME_START_ATTRIBUTE = 'frame.start';
export const FRAME_LENGTH_ATTRIBUTE = 'frameLength';

/**
 * §7.9/§7.16 — the enum that decides which attribute absorbs the scaled offset, and which can
 * flip the SIGN of the rendered effect. Absent, `duration.perf` absorbs the offset with no
 * floor; `"true"` moves the note end with the onset (the safe mode); `"monophonic"` makes a
 * WIDER frame LENGTHEN notes. Reported for the same reason as the unit: it changes what a given
 * `s` means.
 */
export const NOTEOFF_SHIFT_ATTRIBUTE = 'noteoff.shift';

/**
 * §7.4/§7.16 — the boolean that switches a `<dynamics>` into sub-note CC 7 curve points. Read
 * because `velocityRange` is the wrong model there: those values are never scanned by
 * `fitVelocities`, are hard-clipped at 0..127 by the MIDI writer, and are unclamped on the data
 * path, so R6(a)'s clamp is no guarantee for such an instruction.
 */
export const SUB_NOTE_DYNAMICS_ATTRIBUTE = 'subNoteDynamics';

/**
 * §7.16 — the booleans that decide the SPAN over which an instruction applies.
 *
 * `rubato@loop` decides whether `@frameLength` is a pure period or also a span cutoff, and it
 * is never inherited from the def. `accentuationPattern@loop` and `@stickToMeasures` decide the
 * span and which beat number the pattern is evaluated at; their absent-defaults differ (false
 * vs true), so an engine that ignores them cannot tell a caller where an exaggerated accent
 * lands (§7.8's "documented no-ops the report must catch").
 */
export const LOOP_ATTRIBUTE = 'loop';
export const STICK_TO_MEASURES_ATTRIBUTE = 'stickToMeasures';

/**
 * §7.7/D-B — the articulation levers whose neutral is the attribute's own ABSENCE and whose
 * effective neutral lives in the MSM, out of reach under R1.
 *
 * Read, never written: a site carrying one has a component the transform cannot reach, and §7.7
 * requires that site to be reported `partial` rather than `transformed`. meico's own `stacc` is
 * the case that makes it matter — scaling its velocity while its duration is frozen renders
 * "more staccato" as "softer", never "shorter".
 */
export const EXCLUDED_ARTICULATION_LEVERS: readonly string[] = [
  'absoluteDuration',
  'absoluteDurationMs',
  'absoluteVelocity',
  // §7.16's two pitch levers are excluded components of the same element, so `partial`'s rule
  // — "an excluded component beside a transformed one" — covers them: `@detuneCents` is written
  // onto the MSM note and read by nothing, and Hz is not a perceptually linear pitch unit.
  'detuneCents',
  'detuneHz',
];

/**
 * §7.7 — on an INLINE `<articulation>` the original duration is read once up front, so the
 * tick-duration attributes do not compose: the last non-neutral one wins, with precedence
 * `absoluteDurationChange > relativeDuration > absoluteDuration`. On `<articulationDef>` they
 * DO compose, so this rule is keyed on the element, never on the attribute name.
 */
export const INLINE_DURATION_PRECEDENCE: readonly string[] = [
  'absoluteDurationChange',
  'relativeDuration',
  'absoluteDuration',
];

/** The style collection each level domain's defs live in — §7.1's def side. */
export const LEVEL_STYLE_COLLECTIONS: Readonly<Record<LevelDomain, string>> = {
  tempo: TEMPO_STYLE,
  dynamics: DYNAMICS_STYLE,
};

export const LEVEL_MAPS: Readonly<Record<LevelDomain, string>> = {
  tempo: TEMPO_MAP,
  dynamics: DYNAMICS_MAP,
};

export const LEVEL_ELEMENTS: Readonly<Record<LevelDomain, string>> = {
  tempo: 'tempo',
  dynamics: 'dynamics',
};

/** The prevailing-level attribute of each level domain — §7.1's population, before defs. */
export const LEVEL_ATTRIBUTES: Readonly<Record<LevelDomain, string>> = {
  tempo: 'bpm',
  dynamics: 'volume',
};

/** The transition target of a level pair. Transformed everywhere, in the population nowhere. */
export const TRANSITION_TO_ATTRIBUTE = 'transition.to';

export const LEVEL_DIMENSIONS: Readonly<Record<LevelDomain, ExpressionDimension>> = {
  tempo: 'tempo',
  dynamics: 'dynamics',
};

/** Where `accentuationPattern@scale`'s velocity estimate reads its anchors (§7.8/A10). */
export const ACCENTUATION_STYLE_COLLECTION = METRICAL_ACCENTUATION_STYLE;
export const ACCENTUATION_DEF_ELEMENT = 'accentuationPatternDef';
export const ACCENTUATION_ANCHOR_ELEMENT = 'accentuation';

/** Where the ornament dimensions' defs live, and which `<ornament>` map references them. */
export const ORNAMENT_STYLE_COLLECTION = ORNAMENTATION_STYLE;
export const ORNAMENT_MAP = ORNAMENTATION_MAP;
export const ORNAMENT_DEF_ELEMENT = 'ornamentDef';
export const TEMPORAL_SPREAD_ELEMENT = 'temporalSpread';
export const DYNAMICS_GRADIENT_ELEMENT = 'dynamicsGradient';

export const RUBATO_STYLE_COLLECTION = RUBATO_STYLE;
export const RUBATO_DEF_ELEMENT = 'rubatoDef';
