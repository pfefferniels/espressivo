/**
 * The comparison facade: two MPMs in, one plain-data report out (DESIGN.md §9).
 *
 * A third entry point beside {@link module:api/pipeline} and {@link module:api/expression},
 * under the same rules. What it adds to `src/comparison/` is what a facade adds anywhere here:
 *
 * - **the typed-error boundary** (RULE E2). The interior owns the domain validators — one
 *   definition of what a legal selector or a legal tempo is — and throws its own classes; this
 *   is where those become {@link InvalidOptionError}, {@link PerformanceNotFoundError} and
 *   {@link ComparisonEngineError}, each message naming the document it is about (§9.4, A6);
 * - **the document boundary** (RULE F2). XML crosses as text and the XOM tree stays interior;
 * - **the option surface**. Everything the caller can get wrong is validated HERE and validated
 *   **before any document is parsed**, because a caller who both misspells a dimension and
 *   hands over a malformed document should be told about the misspelling — that is the error
 *   they can act on, and the other one may not even be theirs.
 *
 * The report shapes are the interior's and are re-exported rather than redeclared, exactly as
 * `ExaggerationReport` is: the engine builds them, this layer hands them over unchanged, and a
 * second declaration would be a second thing to keep in step.
 *
 * ## `noteDensityWeight` is not here (AD-52.3a)
 *
 * §9.2 declared it and AD-3 keeps the MSM note-count weight as design intent, but the weight
 * function `w(t)` has to reach all eleven dimensions' integrands and this wave does not ship
 * that. An option whose only behaviour is to throw is worse than an absent one — it advertises
 * a capability that is not there — so the key is gone from the surface rather than present and
 * refusing. Adding it back is non-breaking.
 *
 * ## One named-parameter object, and one obligation that follows
 *
 * Every entry point takes ONE options object (F5): two interchangeable MPM texts make positional
 * arguments a hazard in a way `performMsm`'s single document does not. The obligation is that
 * **the options echo enumerates its scalar fields exactly and never the document texts** (A12) —
 * echoing "options" would copy both documents into the result and then deep-copy them again to
 * satisfy RULE I3(b).
 */
import { compareInterior, type InteriorCompareOptions } from '../comparison/compare.js';
import { diffInterior, type InteriorDiffOptions } from '../comparison/diff.js';
import { compareCorpusInterior, type InteriorCorpusOptions } from '../comparison/corpus.js';
import type { Linkage } from '../comparison/clustering.js';
export { SCAPE_MAX_BINS, scapeIndex } from '../comparison/scape.js';
import { SCAPE_MAX_BINS } from '../comparison/scape.js';
import { defaultWeights } from '../comparison/aggregate.js';
import { DEFAULT_LAMBDA_DATE } from '../comparison/eventAlignment.js';
import {
  CorpusLabelCollisionError,
  CorpusOptionRangeError,
  CorpusSizeError,
  NonPositiveTempoError,
  PerformanceSelectionAmbiguousError,
  PerformanceSelectionNotFoundError,
  PerformanceSelectorInvalidError,
} from '../comparison/errors.js';
import { parseMpmRoot } from '../expression/mpmDocument.js';
import { parseMsmRoot } from '../comparison/msm.js';
import {
  COMPARISON_DIMENSIONS,
  COMPARISON_JND_KEYS,
  type ComparisonDimension,
  type ComparisonJndKey,
} from '../comparison/registry.js';
import type { InvarianceMode } from '../comparison/decomposition.js';
import type {
  ComparisonReport,
  ComparisonResult,
  CorpusReport,
  CorpusResult,
  DiffReport,
  DiffResult,
} from '../comparison/report.js';
import { andThen, fromEntriesExact, mapOk, traverse } from '../prelude/index.js';
import type { Element } from '../xml/XomTypes.js';
import {
  ComparisonEngineError,
  InvalidOptionError,
  ParseError,
  PerformanceNotFoundError,
} from './errors.js';
import { parseOrThrow, requireXmlText } from './parse.js';
import type { XmlText } from './types.js';
import {
  accepted,
  allOf,
  checkKeyedRecord,
  orInvalidOption,
  rejected,
  requireOptionBag,
  type Checked,
} from './validate.js';

// ---------------------------------------------------------------------------
// Vocabulary (§9.1)
// ---------------------------------------------------------------------------

export {
  COMPARISON_DIMENSIONS,
  COMPARISON_JND_KEYS,
  EXPRESSION_DIMENSION_CORRESPONDENCE,
} from '../comparison/registry.js';
export type {
  ComparisonDimension,
  ComparisonJndKey,
  ComparisonUnit,
} from '../comparison/registry.js';
export type { InvarianceMode } from '../comparison/decomposition.js';
export type { MetricGuarantee, WindowRule } from '../comparison/window.js';
/** Dimension → epsilon family, so `inputs.epsilon[EPSILON_FAMILY_OF[k]]` is a lookup. */
export { EPSILON_FAMILY_OF } from '../comparison/report.js';
export type {
  AttributionTable,
  ComparisonInputs,
  ComparisonNote,
  ComparisonNoteKind,
  ComparisonProfile,
  ComparisonReport,
  ComparisonResult,
  ComparisonSegment,
  ComparisonSiteRef,
  Decomposition,
  DimensionComparison,
  DimensionState,
  EpsilonFamily,
  MeasureEntry,
  MeasurePosition,
  CorpusReport,
  CorpusResult,
  DiffReport,
  DiffResult,
  EditOp,
  EditOpAttribute,
  EditScript,
  ResolvedComparisonSettings,
  TimeSignatureSource,
} from '../comparison/report.js';

// ---------------------------------------------------------------------------
// Options (§9.2)
// ---------------------------------------------------------------------------

/**
 * The knobs that define the metric.
 *
 * Shared so that a corpus and a pair can be configured identically, and so that §8's "one option
 * set for the matrix" has a name to be stamped under (A5).
 */
export interface ComparisonSettings {
  /** Quarters. `start < end`, both finite, `start >= 0` (A16). Omit for §5.0's precedence. */
  readonly window?: { readonly start: number; readonly end: number };
  readonly weights?: Partial<Record<ComparisonDimension, number>>;
  readonly jnd?: Partial<Record<ComparisonJndKey, number>>;
  readonly plausibleRange?: Partial<Record<ComparisonJndKey, readonly [number, number]>>;
  readonly invariance?: Partial<Record<ComparisonDimension, InvarianceMode>>;
}

export interface CompareMpmOptions extends ComparisonSettings {
  readonly a: XmlText;
  /** Omit to compare two performances **inside `a`** (C16). */
  readonly b?: XmlText;
  readonly performanceA?: string | number;
  readonly performanceB?: string | number;
  /**
   * Part of the metric, not a report-only side input: it moves the window, the measure mapping
   * and the beat grid the accentuation phase is anchored to (A11).
   */
  readonly msm?: XmlText;
  /** Opt-in retention of the evaluated curves and densities (C1). */
  readonly profile?: {
    readonly dimensions?: readonly ComparisonDimension[];
    /** Quarters; step-capped, and the cap is reported when it bites. */
    readonly grid?: 'refinement' | { readonly step: number };
  };
  /**
   * AD-27.8's scape of the aggregate density — the difference at every position AND scale.
   *
   * §9.2 declares `scape` on the CORPUS options only, and §8's own text names two variants:
   * "either a pair's distance or the corpus argmin/argmax performer". This is the first, and it
   * lives here because a pair's scape needs a pair. `1 ≤ bins ≤ 256`.
   */
  readonly scape?: { readonly bins: number };
}

/**
 * §6's edit path. `CompareMpmOptions` minus every knob the path does not CONSUME.
 *
 * The rule is AD-67.2's, ruled in AD-70.3: a field the diff product cannot act on is absent from
 * the surface, never accepted-and-ignored. AD-25.1's knowability split makes silence the one
 * unacceptable answer — an option unusable given the options alone must ERROR — and AD-52.3a's
 * form makes absence better than a throw, since "an option whose only behaviour is to throw is
 * worse than an absent one". A TypeScript caller who writes one fails to compile; a JavaScript
 * caller is ignored, which is what every unrecognized top-level key gets here (AD-54.3).
 *
 * Four are out, each structural rather than incidental:
 *
 * - `invariance` — §6.2's pricing is RAW and must be. §7.4's modes rescale a curve by that
 *   DOCUMENT's own moments, and an intermediate edit state is not a document: its moments move
 *   as the script is applied, so a canonicalized `norm` would not be a fixed metric and
 *   `scriptCost ≥ d_curve` would stop being AD-5's theorem.
 * - `profile` — a `DiffReport` has no profile to retain.
 * - `weights` — weights exist to combine the eleven dimensions into ONE aggregate, and a
 *   `DiffReport` has no aggregate: every figure in `dimensions` is per-dimension and raw.
 *   Measured while it was still inherited: `weights: { tempo: 0 }` left every `scriptCost`
 *   bit-identical while the echo dutifully reported `0`.
 * - `scape` — AD-27.8's scape is of the AGGREGATE density, which the diff path also has none
 *   of. Measured: `JSON.stringify(diffMpm({…, scape: { bins: 8 }}))` was byte-identical to the
 *   same call without it, and `checkCompareOptions` validated the `bins` on the way past.
 *
 * `plausibleRange` stays because it is CONSUMED, not because it is harmless (AD-70.3).
 * `plausibilityFindings` reads the two documents and nothing else — not the aggregate, not the
 * weights, not the comparison — so the diff produces those notes from the same parse, and an
 * implausible `@bpm` is exactly the site the script prices a large op at.
 */
export interface DiffMpmOptions extends Omit<
  CompareMpmOptions,
  'invariance' | 'profile' | 'weights' | 'scape'
> {
  /**
   * The four are re-declared `?: never` rather than merely omitted.
   *
   * Omitting them would rely on excess-property checking, which reaches OBJECT LITERALS only,
   * so `diffMpm({ a, ...sharedSettings })` and `diffMpm(wideOptionsVariable)` would compile
   * clean and drop the four in silence — the accepted-and-ignored behaviour AD-25.1 forbids,
   * through the one door the type cannot see. And §9.2's rationale for `ComparisonSettings`,
   * "so a corpus and a pair can be configured identically", makes the shared bag intended
   * usage rather than an edge case. `?: never` is checked on every assignment, spread or not.
   */
  readonly weights?: never;
  readonly scape?: never;
  readonly invariance?: never;
  readonly profile?: never;
  /**
   * A-Q5's `fragment` and `consolidate` ops: one instruction became several, or the reverse.
   *
   * Off by default, and the default is the conservative reading rather than the cheap one — a
   * move is emitted where treating a group as ONE edit is strictly cheaper than any sequence of
   * plain ops, so the op kind is a statement about the PRICE and not a claim about what the
   * author did. Enabling them can only LOWER `scriptCost`: by the `L¹` triangle inequality a
   * move never costs more than the plain decomposition it replaces.
   */
  readonly moves?: boolean;
}

/** §8's corpus surface. One option set for the whole matrix, which is what makes it one (R3). */
export interface CompareCorpusOptions extends ComparisonSettings {
  readonly items: readonly {
    readonly mpm: XmlText;
    /** Omit in a multi-performance document to EXPAND to one item per performance (§8). */
    readonly performance?: string | number;
    readonly label?: string;
  }[];
  /** One MSM for the whole matrix — it moves the window, the measures and the beat grid. */
  readonly msm?: XmlText;
  readonly maxItems?: number;
  readonly normalization?: 'fixed' | 'corpus';
  readonly linkage?: Linkage;
  /** PAM clusters; omit for none. */
  readonly k?: number;
  readonly embeddingAxes?: number;
  /** AD-26.3's per-piece percentile context. Context, never a rescaling. */
  readonly noiseFloor?: boolean;
  /** AD-27.8's Sapp variant: per cell, which item is closest to the corpus medoid. */
  readonly scape?: { readonly bins: number };
}

// ---------------------------------------------------------------------------
// The facade
// ---------------------------------------------------------------------------

/**
 * Compare two performances — the eleven dimensions of DESIGN.md §3, over one window.
 *
 * The result is plain data (RULE F1): every number is finite or `null` (§9.6), every record is
 * keyed in `COMPARISON_DIMENSIONS` order, and `-0` is normalized to `+0` at this boundary so
 * that `Object.is` assertions and the JSON round trip agree (§9.5, A20).
 *
 * ```ts
 * const { report } = compareMpm({ a: roll1905, b: roll1927, msm: score });
 * report.aggregate.mean;                       // JND — the human headline (C10)
 * report.segments[0];                          // where the difference is (§7.3)
 * report.equivalence.subThresholdMassFraction; // "93 % of it is below threshold" (C11)
 * ```
 *
 * **What is a distance and what is not.** `distance`, `mean`, the table and `dimensions[k]` are
 * distances and satisfy the metric axioms under a piece-derived window (`window.metricGuarantee`
 * says which you have). `meanSigned`, `levelSigned`, `direction`, `cumulativeDrift` and the
 * profile's `signed` series are DESCRIPTORS: they say which side is faster or louder, they enter
 * no distance, and they do not satisfy the triangle inequality.
 *
 * @param options one bag; `b` defaults to `a`, which compares two performances of one document
 *   (C16) — the shape the only real multi-performance corpus in existence has
 * @throws {InvalidOptionError} an unknown dimension or JND key, a non-finite or negative weight,
 *   a JND that is not positive, an inverted or non-finite window, an invariance mode on an event
 *   dimension, a selector that is not a non-negative integer, a multi-performance document with
 *   no selector, or a document resolving a tempo ≤ 0
 * @throws {ParseError} `a`, `b` or `msm` is not XML text, is not well-formed, or has the wrong
 *   root element — the message names which of the three
 * @throws {PerformanceNotFoundError} a selector names or indexes nothing, or a document carries
 *   no `<performance>` at all (C8)
 * @throws {ComparisonEngineError} the engine broke one of its own invariants
 */
export function compareMpm(options: CompareMpmOptions): ComparisonResult {
  orInvalidOption(checkCompareOptions(options));

  // §9.4's parse order: `a`, then `b`, then `msm`, so the first failure reported is the
  // earliest one — and each carries its own role, which a single interior parse could not say.
  const rootA = parseDocument('MPM a', options.a, parseMpmRoot, 'mpm');
  const rootB =
    options.b === undefined ? undefined : parseDocument('MPM b', options.b, parseMpmRoot, 'mpm');
  const msm =
    options.msm === undefined ? null : parseDocument('MSM', options.msm, parseMsmRoot, 'msm');

  const report = run({
    a: rootA,
    b: rootB,
    performanceA: options.performanceA,
    performanceB: options.performanceB,
    msm,
    window: options.window ?? null,
    weights: resolveWeights(options.weights),
    jnd: { ...options.jnd },
    plausibleRange: { ...options.plausibleRange },
    invariance: resolveInvariance(options.invariance),
    profile: options.profile ?? null,
    lambdaDate: DEFAULT_LAMBDA_DATE,
    scape: options.scape ?? null,
  });

  return { report: normalizeZeros(report) };
}

/**
 * Diff two performances — §6's typed edit script per (part, map), priced sequentially.
 *
 * Where {@link compareMpm} answers "how far apart are these two performances?", this answers
 * "what would you have to change to turn one into the other, and what does each change cost?".
 * The two are one mathematics: an op's `cost` is an integral of the same density `compareMpm`
 * reports, so `topByCost` ranks the edits in the units the distance is quoted in.
 *
 * ```ts
 * const { report } = diffMpm({ a: baroque, b: romantic, msm: score });
 * report.scripts[0].ops[0];                  // the first edit, in score order
 * report.scripts[0].topByCost;               // the same ops, largest first (C5)
 * report.dimensions.tempo.reworking;         // how much more the script costs than d_tempo
 * ```
 *
 * **The three numbers per dimension are three numbers** (§6.3): `dCurve` is the lower bound,
 * `scriptCost` is the DP's own path total, and `replayedDelta` is what the same op set costs
 * applied in the delivered date order. Both totals are `≥ dCurve` by AD-5's theorem, up to the
 * per-family quadrature ε the report stamps in `inputs.epsilon`.
 *
 * The script is computed once in a CONTENT-derived canonical orientation and inverted for the
 * other direction (§6.4), so `diffMpm(a, b)` and `diffMpm(b, a)` are exact mirrors rather than
 * two tracebacks that happened to agree.
 *
 * @throws the same errors {@link compareMpm} throws, on the same inputs
 */
export function diffMpm(options: DiffMpmOptions): DiffResult {
  orInvalidOption(checkDiffOptions(options));

  const rootA = parseDocument('MPM a', options.a, parseMpmRoot, 'mpm');
  const rootB =
    options.b === undefined ? undefined : parseDocument('MPM b', options.b, parseMpmRoot, 'mpm');
  const msm =
    options.msm === undefined ? null : parseDocument('MSM', options.msm, parseMsmRoot, 'msm');

  const report = runDiff({
    a: rootA,
    b: rootB,
    performanceA: options.performanceA,
    performanceB: options.performanceB,
    msm,
    window: options.window ?? null,
    jnd: { ...options.jnd },
    plausibleRange: { ...options.plausibleRange },
    // The four the surface does not offer are pinned to their inert values HERE rather than
    // left to a default a later edit could move (AD-70.3). `resolveWeights(undefined)` is the
    // fixed default vector, which the diff never reads — it has no aggregate to weight — and
    // stating it beats leaving the interior's shape to chance.
    weights: resolveWeights(undefined),
    invariance: resolveInvariance(undefined),
    profile: null,
    lambdaDate: DEFAULT_LAMBDA_DATE,
    moves: options.moves,
  });

  return { report: normalizeZeros(report) };
}

/**
 * Compare a corpus — §8's matrices and everything read off them.
 *
 * ```ts
 * const { report } = compareMpmCorpus({ items: rolls.map((mpm) => ({ mpm })), k: 3 });
 * report.labels[report.medoids![0]];   // "the most typical performance of cluster 0"
 * report.matrices.aggregate[i * report.n + j];
 * report.embedding.negativeEigenvalueMass;  // how non-Euclidean this corpus is
 * ```
 *
 * **One window, one option set, for every cell** (R3) — that is what makes the matrix a matrix
 * rather than a table of separately-scaled numbers, and it is why the settings are a single bag
 * shared with {@link compareMpm} rather than a per-pair argument. An item naming no performance
 * in a multi-performance document EXPANDS to one item per performance, and labels are required
 * unique after that expansion.
 *
 * @throws {InvalidOptionError} the option mistakes {@link compareMpm} rejects, plus a `k` or
 *   `embeddingAxes` outside its domain, a corpus past `maxItems`, or labels that collide after
 *   expansion
 * @throws {ParseError} an item or the MSM is not well-formed MPM/MSM — the message names which
 * @throws {PerformanceNotFoundError} an item's selector names or indexes nothing
 */
export function compareMpmCorpus(options: CompareCorpusOptions): CorpusResult {
  orInvalidOption(checkCorpusOptions(options));

  const items = options.items.map((item, index) => ({
    root: parseDocument(`MPM items[${String(index)}]`, item.mpm, parseMpmRoot, 'mpm'),
    performance: item.performance,
    label: item.label,
  }));
  const msm =
    options.msm === undefined ? null : parseDocument('MSM', options.msm, parseMsmRoot, 'msm');

  const report = runCorpus({
    items,
    msm,
    window: options.window ?? null,
    weights: resolveWeights(options.weights),
    jnd: { ...options.jnd },
    plausibleRange: { ...options.plausibleRange },
    invariance: resolveInvariance(options.invariance),
    lambdaDate: DEFAULT_LAMBDA_DATE,
    maxItems: options.maxItems ?? DEFAULT_MAX_ITEMS,
    normalization: options.normalization ?? 'fixed',
    linkage: options.linkage ?? 'average',
    k: options.k,
    embeddingAxes: options.embeddingAxes ?? null,
    noiseFloor: options.noiseFloor ?? false,
    scape: options.scape ?? null,
  });

  return { report: normalizeZeros(report) };
}

/** R10's ceiling, raised to 256 by C17 so the 121-file Daten corpus fits in one call. */
const DEFAULT_MAX_ITEMS = 256;

/**
 * The documented empty performance, so that nobody hand-rolls the null baseline (C8).
 *
 * Comparing a document against this answers "how far is this performance from a deadpan
 * rendering of the same score?" — every dimension against its own neutral, which is what R6
 * makes an absent map perform. It is a `<performance>` with an empty `<dated>` rather than a
 * document with no performance at all, because the latter is a
 * {@link PerformanceNotFoundError} by §9.4 and is the mistake this function exists to prevent.
 */
export function neutralMpm(options?: { readonly ppq?: number }): XmlText {
  const ppq = options?.ppq ?? 720;
  if (!Number.isInteger(ppq) || ppq <= 0)
    throw new InvalidOptionError(`ppq must be a positive integer, got ${String(ppq)}`);
  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<mpm xmlns="http://www.cemfi.de/mpm/ns/1.0">' +
    `<performance name="neutral" pulsesPerQuarter="${String(ppq)}">` +
    '<global><header/><dated/></global>' +
    '</performance></mpm>'
  );
}

/** {@link run} for the corpus — the same §9.4 translation over a third interior. */
function runCorpus(options: InteriorCorpusOptions): CorpusReport {
  try {
    return compareCorpusInterior(options);
  } catch (cause) {
    throw translate(cause);
  }
}

/** {@link run} for the edit path — the same §9.4 translation over a different interior. */
function runDiff(options: InteriorDiffOptions): DiffReport {
  try {
    return diffInterior(options);
  } catch (cause) {
    throw translate(cause);
  }
}

/** Run the interior, turning its typed throws into the facade's (§9.4). */
function run(options: InteriorCompareOptions): ComparisonReport {
  try {
    return compareInterior(options);
  } catch (cause) {
    throw translate(cause);
  }
}

/** §9.4's translation table, shared by both entry points so the two cannot drift. */
function translate(cause: unknown): Error {
  if (cause instanceof PerformanceSelectionNotFoundError)
    return new PerformanceNotFoundError(`MPM ${cause.role}: ${cause.message}`, { cause });
  if (
    cause instanceof PerformanceSelectionAmbiguousError ||
    cause instanceof PerformanceSelectorInvalidError ||
    cause instanceof NonPositiveTempoError
  )
    return new InvalidOptionError(`MPM ${cause.role}: ${cause.message}`, { cause });
  if (
    cause instanceof CorpusLabelCollisionError ||
    cause instanceof CorpusSizeError ||
    cause instanceof CorpusOptionRangeError
  )
    return new InvalidOptionError(cause.message, { cause });
  return new ComparisonEngineError(
    `the comparison engine failed an internal invariant — ${
      cause instanceof Error ? cause.message : String(cause)
    }`,
    { cause },
  );
}

/**
 * Parse and check the root, with the document's ROLE in the message.
 *
 * `MPM a: …` rather than `MPM: …`, because two are in play and an error naming neither sends
 * the caller bisecting their own inputs (§9.4, A6).
 */
function parseDocument(
  role: string,
  text: XmlText,
  parse: (text: string) => Element,
  rootName: string,
): Element {
  requireXmlText(role as 'MPM', text);
  const root = parseOrThrow(role as 'MPM', () => parse(text));
  if (root.getLocalName() !== rootName)
    throw new ParseError(
      `${role}: expected a <${rootName}> root element, found <${root.getLocalName()}>`,
    );
  return root;
}

// ---------------------------------------------------------------------------
// Option validation (§9.4's table)
// ---------------------------------------------------------------------------

const DIMENSION_SET = new Set<string>(COMPARISON_DIMENSIONS);
const JND_KEY_SET = new Set<string>(COMPARISON_JND_KEYS);
const INVARIANCE_MODES = new Set<string>(['none', 'level', 'level-gain']);

/** AD-20: an event dimension has no curve to centre, so a mode on one is a caller error. */
const EVENT_DIMENSIONS = new Set<ComparisonDimension>(['articulation', 'ornamentation']);

function checkCompareOptions(options: CompareMpmOptions): Checked {
  return andThen(requireOptionBag(options, 'options must be an object carrying at least `a`'), () =>
    allOf(
      checkWindow(options.window),
      checkWeights(options.weights),
      checkJnd(options.jnd),
      checkPlausibleRange(options.plausibleRange),
      checkInvariance(options.invariance),
      checkSelector('performanceA', options.performanceA),
      checkSelector('performanceB', options.performanceB),
      checkProfile(options.profile),
      checkScape(options.scape),
    ),
  );
}

/**
 * §9.4's rows for the DIFF surface — a strict subset, and it has to be.
 *
 * `checkCompareOptions` would reject `scape: { bins: 0 }` here, throwing `InvalidOptionError`
 * about a key `DiffMpmOptions` does not declare, while AD-54.3 says an unrecognized top-level
 * key is IGNORED: a JavaScript caller passing one of the four omitted fields must get the same
 * silence as for `{ nonsense: 1 }`. So this validates exactly what the diff surface offers,
 * and `moves` with it.
 */
function checkDiffOptions(options: DiffMpmOptions): Checked {
  return andThen(requireOptionBag(options, 'options must be an object carrying at least `a`'), () =>
    allOf(
      checkWindow(options.window),
      checkJnd(options.jnd),
      checkPlausibleRange(options.plausibleRange),
      checkSelector('performanceA', options.performanceA),
      checkSelector('performanceB', options.performanceB),
      checkBoolean('moves', options.moves),
    ),
  );
}

/**
 * §9.4's corpus rows, checked BEFORE any document is parsed (A23).
 */
function checkCorpusOptions(options: CompareCorpusOptions): Checked {
  // Two guards in sequence rather than two members of one `allOf`, because everything below
  // reads `items` as an array. `andThen` is how a check whose success is another check's
  // precondition gets sequenced; `allOf`, whose arguments are all evaluated, is not.
  return andThen(
    andThen(requireOptionBag(options, 'options must be an object carrying at least `items`'), () =>
      Array.isArray(options.items)
        ? accepted
        : rejected('items must be an array of { mpm, performance?, label? }'),
    ),
    () =>
      allOf(
        checkWindow(options.window),
        checkWeights(options.weights),
        checkJnd(options.jnd),
        checkPlausibleRange(options.plausibleRange),
        checkInvariance(options.invariance),
        checkEach(options.items, (item, index) =>
          checkSelector(`items[${String(index)}].performance`, item.performance),
        ),
        checkScape(options.scape),
        checkNonNegativeInteger('maxItems', options.maxItems),
        // Checked against the UNEXPANDED count, which is a lower bound on the expanded one: the
        // exact bound needs the documents, and this branch is the one a caller can act on
        // without them.
        checkPositiveInteger('k', options.k),
        checkPositiveInteger('embeddingAxes', options.embeddingAxes),
        checkEnum(
          options.linkage,
          ['average', 'single', 'complete', 'weighted', 'ward.D2'],
          (value) =>
            `unknown linkage "${value}"; expected average, single, complete, ` +
            'weighted or ward.D2',
        ),
        checkEnum(
          options.normalization,
          ['fixed', 'corpus'],
          (value) => `unknown normalization "${value}"; expected fixed or corpus`,
        ),
      ),
  );
}

/** Every element must pass, and the first that does not is the one reported. */
function checkEach<T>(items: readonly T[], check: (item: T, index: number) => Checked): Checked {
  return mapOk(traverse(items, check), () => undefined);
}

/** A boolean-or-absent option. */
function checkBoolean(name: string, value: unknown): Checked {
  return value === undefined || typeof value === 'boolean'
    ? accepted
    : rejected(`${name} must be a boolean`);
}

/** §9.4's `maxItems`: a count, so zero is meaningful and negative is not. */
function checkNonNegativeInteger(name: string, value: number | undefined): Checked {
  return value === undefined || (Number.isInteger(value) && value >= 0)
    ? accepted
    : rejected(`${name} must be a non-negative integer, got ${String(value)}`);
}

/**
 * §9.4's `k` and `embeddingAxes`: the live cases of the knowability split's first branch
 * (AD-25.1). A value outside the range is unusable given the OTHER OPTIONS alone — `items.length`
 * is in the same bag — so the caller could have known, and a full plausible-looking report with a
 * silently clamped `k` would hide the typo the option exists to express.
 */
function checkPositiveInteger(name: string, value: number | undefined): Checked {
  return value === undefined || (Number.isInteger(value) && value >= 1)
    ? accepted
    : rejected(`${name} must be an integer >= 1, got ${String(value)}`);
}

/** A string option drawn from a closed set. */
function checkEnum(
  value: string | undefined,
  vocabulary: readonly string[],
  problem: (value: string) => string,
): Checked {
  return value === undefined || vocabulary.includes(value) ? accepted : rejected(problem(value));
}

/** §9.4's row: `scape.bins` is an integer in `[1, 256]`, and out of range is a caller error. */
function checkScape(scape: { readonly bins: number } | undefined): Checked {
  if (scape === undefined) return accepted;
  const bins: unknown = scape.bins;
  return typeof bins === 'number' && Number.isInteger(bins) && bins >= 1 && bins <= SCAPE_MAX_BINS
    ? accepted
    : rejected(
        `scape.bins must be an integer in [1, ${String(SCAPE_MAX_BINS)}], got ${String(bins)}`,
      );
}

function checkWindow(window: ComparisonSettings['window']): Checked {
  if (window === undefined) return accepted;
  const { start, end } = window;
  if (!Number.isFinite(start) || !Number.isFinite(end))
    return rejected(
      `window.start and window.end must be finite, got ${String(start)} and ${String(end)}`,
    );
  if (start < 0) return rejected(`window.start must be >= 0, got ${String(start)}`);
  return start < end
    ? accepted
    : rejected(`window.start must be < window.end, got ${String(start)} and ${String(end)}`);
}

function checkWeights(weights: ComparisonSettings['weights']): Checked {
  return checkKeyedRecord(
    weights,
    DIMENSION_SET,
    (keys) =>
      `unknown weight dimension(s): ${keys.join(', ')}; expected one of ${COMPARISON_DIMENSIONS.join(', ')}`,
    (key, value) =>
      typeof value === 'number' && Number.isFinite(value) && value >= 0
        ? accepted
        : rejected(`weight for '${key}' must be a finite number >= 0, got ${String(value)}`),
  );
}

function checkJnd(jnd: ComparisonSettings['jnd']): Checked {
  return checkKeyedRecord(
    jnd,
    JND_KEY_SET,
    (keys) => `unknown jnd key(s): ${keys.join(', ')}; the vocabulary is COMPARISON_JND_KEYS`,
    // Not merely non-negative: a zero JND is a division, and the row's whole content is the
    // scale it divides by.
    (key, value) =>
      typeof value === 'number' && Number.isFinite(value) && value > 0
        ? accepted
        : rejected(`jnd for '${key}' must be a finite number > 0, got ${String(value)}`),
  );
}

function checkPlausibleRange(ranges: ComparisonSettings['plausibleRange']): Checked {
  return checkKeyedRecord(
    ranges,
    JND_KEY_SET,
    (keys) =>
      `unknown plausibleRange key(s): ${keys.join(', ')}; the vocabulary is COMPARISON_JND_KEYS`,
    // §9.4's table does not state the band's own domain; it is stated here rather than left to
    // produce a note that never fires, since a band with `low > high` excludes every value.
    (key, band) =>
      Array.isArray(band) &&
      band.length === 2 &&
      band.every((value) => typeof value === 'number' && Number.isFinite(value)) &&
      (band[0] as number) <= (band[1] as number)
        ? accepted
        : rejected(
            `plausibleRange for '${key}' must be [low, high] with two finite numbers and low <= high`,
          ),
  );
}

function checkInvariance(invariance: ComparisonSettings['invariance']): Checked {
  return checkKeyedRecord(
    invariance,
    DIMENSION_SET,
    (keys) => `unknown invariance dimension(s): ${keys.join(', ')}`,
    (key, mode) => {
      if (typeof mode !== 'string' || !INVARIANCE_MODES.has(mode))
        return rejected(
          `invariance for '${key}' must be 'none', 'level' or 'level-gain', got '${String(mode)}'`,
        );
      return mode === 'none' || !EVENT_DIMENSIONS.has(key as ComparisonDimension)
        ? accepted
        : rejected(
            `invariance '${mode}' is not defined for '${key}': an event dimension has no curve to ` +
              'centre (AD-20). Use weights to exclude it instead.',
          );
    },
  );
}

/** Spelled exactly as the interior's `selectPerformance` spells it, so the two agree (A17). */
function checkSelector(name: string, selector: string | number | undefined): Checked {
  if (typeof selector !== 'number') return accepted;
  return Number.isInteger(selector) && selector >= 0
    ? accepted
    : rejected(`${name} index must be a non-negative integer, got ${String(selector)}`);
}

function checkProfile(profile: CompareMpmOptions['profile']): Checked {
  if (profile === undefined) return accepted;
  const unrecognized = (profile.dimensions ?? []).filter((key) => !DIMENSION_SET.has(key));
  if (unrecognized.length > 0)
    return rejected(`unknown profile dimension(s): ${unrecognized.join(', ')}`);
  const grid = profile.grid;
  if (grid === undefined || grid === 'refinement') return accepted;
  return Number.isFinite(grid.step) && grid.step > 0
    ? accepted
    : rejected(`profile.grid.step must be a finite number > 0, got ${String(grid.step)}`);
}

// ---------------------------------------------------------------------------
// Defaults and the report boundary
// ---------------------------------------------------------------------------

function resolveWeights(
  weights: ComparisonSettings['weights'],
): Record<ComparisonDimension, number> {
  const defaults = defaultWeights();
  return fromEntriesExact(
    COMPARISON_DIMENSIONS,
    (dimension) => weights?.[dimension] ?? defaults[dimension],
  );
}

function resolveInvariance(
  invariance: ComparisonSettings['invariance'],
): Record<ComparisonDimension, InvarianceMode> {
  return fromEntriesExact(COMPARISON_DIMENSIONS, (dimension) => invariance?.[dimension] ?? 'none');
}

/**
 * `-0 ↦ +0` at the report boundary (A20, §9.5).
 *
 * A signed descriptor is a difference, and a difference of equals is `-0` as often as `+0`
 * depending on which side was subtracted — so `Object.is(compare(a,b).x, compare(b,a).x)` and
 * the JSON round trip would disagree with each other on a pair that is identical. The walk also
 * discharges RULE I3(b) on the way past: every level of the returned value is freshly allocated,
 * so a consumer's `===` memoization sees a change when one occurred.
 */
function normalizeZeros<T>(value: T): T {
  if (typeof value === 'number') return (value === 0 ? 0 : value) as T;
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((item) => normalizeZeros(item)) as T;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, item]) => [
      key,
      normalizeZeros(item),
    ]),
  ) as T;
}
