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
import type { Element } from '../xml/XomTypes.js';
import {
  ComparisonEngineError,
  InvalidOptionError,
  ParseError,
  PerformanceNotFoundError,
} from './errors.js';
import { parseOrThrow, requireXmlText } from './parse.js';
import type { XmlText } from './types.js';

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
 * §6's edit path. `CompareMpmOptions` minus the two knobs the path cannot honour.
 *
 * `invariance` is out because §6.2's pricing is RAW and must be: §7.4's modes rescale a curve by
 * that DOCUMENT's own moments, and an intermediate edit state is not a document — its moments
 * move as the script is applied, so a canonicalized `norm` would not be a fixed metric and
 * `scriptCost ≥ d_curve` would stop being AD-5's theorem. `profile` is out because a `DiffReport`
 * has no profile to retain.
 *
 * Removed from the SURFACE rather than shipped as a throw, which is AD-52.3a's own rule — "an
 * option whose only behaviour is to throw is worse than an absent one" — applied to §9.2's
 * declared `extends CompareMpmOptions`. A TypeScript caller who writes either fails to compile;
 * a JavaScript caller is ignored, which is what every other unrecognized top-level key gets in
 * this package (AD-54.3).
 */
export interface DiffMpmOptions extends Omit<CompareMpmOptions, 'invariance' | 'profile'> {
  /** `fragment`/`consolidate` ops (A-Q5). Not shipped yet; requesting them earns a note. */
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
  checkCompareOptions(options);

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
  checkCompareOptions(options);

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
    weights: resolveWeights(options.weights),
    jnd: { ...options.jnd },
    plausibleRange: { ...options.plausibleRange },
    // §6.2's pricing is raw; the surface does not offer the modes, and the interior is told so
    // explicitly rather than left to a default that a later edit could change.
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
  checkCorpusOptions(options);

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

function checkCompareOptions(options: CompareMpmOptions): void {
  // Read as `unknown` deliberately: this guard exists for callers arriving from JavaScript,
  // where the parameter type guarantees nothing, and comparing against the declared type would
  // let the compiler prove it dead and the linter delete it.
  const bag: unknown = options;
  if (typeof bag !== 'object' || bag === null)
    throw new InvalidOptionError('options must be an object carrying at least `a`');

  checkWindow(options.window);
  checkWeights(options.weights);
  checkJnd(options.jnd);
  checkPlausibleRange(options.plausibleRange);
  checkInvariance(options.invariance);
  checkSelector('performanceA', options.performanceA);
  checkSelector('performanceB', options.performanceB);
  checkProfile(options.profile);
  checkScape(options.scape);
}

/**
 * §9.4's corpus rows, checked BEFORE any document is parsed (A23).
 *
 * `k` and `embeddingAxes` are §9.4's live cases of the knowability split's first branch
 * (AD-25.1): a `k` outside `[1, N]` is unusable given the OTHER OPTIONS alone — `items.length`
 * is in the same bag — so the caller could have known, and a full plausible-looking report with
 * a silently clamped `k` would hide the typo the option exists to express.
 */
function checkCorpusOptions(options: CompareCorpusOptions): void {
  const bag: unknown = options;
  if (typeof bag !== 'object' || bag === null)
    throw new InvalidOptionError('options must be an object carrying at least `items`');
  const list: unknown = options.items;
  if (!Array.isArray(list))
    throw new InvalidOptionError('items must be an array of { mpm, performance?, label? }');

  checkWindow(options.window);
  checkWeights(options.weights);
  checkJnd(options.jnd);
  checkPlausibleRange(options.plausibleRange);
  checkInvariance(options.invariance);
  for (const [index, item] of options.items.entries())
    checkSelector(`items[${String(index)}].performance`, item.performance);
  checkScape(options.scape);

  if (
    options.maxItems !== undefined &&
    (!Number.isInteger(options.maxItems) || options.maxItems < 0)
  )
    throw new InvalidOptionError(
      `maxItems must be a non-negative integer, got ${String(options.maxItems)}`,
    );
  // Checked against the UNEXPANDED count, which is a lower bound on the expanded one: the exact
  // bound needs the documents, and this branch is the one a caller can act on without them.
  if (options.k !== undefined && (!Number.isInteger(options.k) || options.k < 1))
    throw new InvalidOptionError(`k must be an integer >= 1, got ${String(options.k)}`);
  if (
    options.embeddingAxes !== undefined &&
    (!Number.isInteger(options.embeddingAxes) || options.embeddingAxes < 1)
  )
    throw new InvalidOptionError(
      `embeddingAxes must be an integer >= 1, got ${String(options.embeddingAxes)}`,
    );
  if (
    options.linkage !== undefined &&
    !['average', 'single', 'complete', 'weighted', 'ward.D2'].includes(options.linkage)
  )
    throw new InvalidOptionError(
      `unknown linkage "${String(options.linkage)}"; expected average, single, complete, ` +
        'weighted or ward.D2',
    );
  if (options.normalization !== undefined && !['fixed', 'corpus'].includes(options.normalization))
    throw new InvalidOptionError(
      `unknown normalization "${String(options.normalization)}"; expected fixed or corpus`,
    );
}

/** §9.4's row: `scape.bins` is an integer in `[1, 256]`, and out of range is a caller error. */
function checkScape(scape: { readonly bins: number } | undefined): void {
  if (scape === undefined) return;
  const bins: unknown = scape.bins;
  if (typeof bins !== 'number' || !Number.isInteger(bins) || bins < 1 || bins > SCAPE_MAX_BINS)
    throw new InvalidOptionError(
      `scape.bins must be an integer in [1, ${String(SCAPE_MAX_BINS)}], got ${String(bins)}`,
    );
}

function checkWindow(window: ComparisonSettings['window']): void {
  if (window === undefined) return;
  const { start, end } = window;
  if (!Number.isFinite(start) || !Number.isFinite(end))
    throw new InvalidOptionError(
      `window.start and window.end must be finite, got ${String(start)} and ${String(end)}`,
    );
  if (start < 0) throw new InvalidOptionError(`window.start must be >= 0, got ${String(start)}`);
  if (!(start < end))
    throw new InvalidOptionError(
      `window.start must be < window.end, got ${String(start)} and ${String(end)}`,
    );
}

function checkWeights(weights: ComparisonSettings['weights']): void {
  if (weights === undefined) return;
  const unknown = Object.keys(weights).filter((key) => !DIMENSION_SET.has(key));
  if (unknown.length > 0)
    throw new InvalidOptionError(
      `unknown weight dimension(s): ${unknown.join(', ')}; expected one of ${COMPARISON_DIMENSIONS.join(', ')}`,
    );
  // Values read as `unknown`, the way `expression.ts` widens its own guards: a JS caller can
  // pass anything, and comparing against the declared type would let the compiler prove the
  // check dead and the linter delete it.
  for (const [key, value] of Object.entries(weights) as readonly [string, unknown][]) {
    if (value === undefined) continue;
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0)
      throw new InvalidOptionError(
        `weight for '${key}' must be a finite number >= 0, got ${String(value)}`,
      );
  }
}

function checkJnd(jnd: ComparisonSettings['jnd']): void {
  if (jnd === undefined) return;
  const unknown = Object.keys(jnd).filter((key) => !JND_KEY_SET.has(key));
  if (unknown.length > 0)
    throw new InvalidOptionError(
      `unknown jnd key(s): ${unknown.join(', ')}; the vocabulary is COMPARISON_JND_KEYS`,
    );
  for (const [key, value] of Object.entries(jnd) as readonly [string, unknown][]) {
    if (value === undefined) continue;
    // Not merely non-negative: a zero JND is a division, and the row's whole content is the
    // scale it divides by.
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0)
      throw new InvalidOptionError(
        `jnd for '${key}' must be a finite number > 0, got ${String(value)}`,
      );
  }
}

function checkPlausibleRange(ranges: ComparisonSettings['plausibleRange']): void {
  if (ranges === undefined) return;
  const unknown = Object.keys(ranges).filter((key) => !JND_KEY_SET.has(key));
  if (unknown.length > 0)
    throw new InvalidOptionError(
      `unknown plausibleRange key(s): ${unknown.join(', ')}; the vocabulary is COMPARISON_JND_KEYS`,
    );
  for (const [key, band] of Object.entries(ranges) as readonly [string, unknown][]) {
    if (band === undefined) continue;
    // §9.4's table does not state the band's own domain; it is stated here rather than left to
    // produce a note that never fires, since a band with `low > high` excludes every value.
    if (
      !Array.isArray(band) ||
      band.length !== 2 ||
      !band.every((value) => typeof value === 'number' && Number.isFinite(value)) ||
      !((band[0] as number) <= (band[1] as number))
    )
      throw new InvalidOptionError(
        `plausibleRange for '${key}' must be [low, high] with two finite numbers and low <= high`,
      );
  }
}

function checkInvariance(invariance: ComparisonSettings['invariance']): void {
  if (invariance === undefined) return;
  const unknown = Object.keys(invariance).filter((key) => !DIMENSION_SET.has(key));
  if (unknown.length > 0)
    throw new InvalidOptionError(`unknown invariance dimension(s): ${unknown.join(', ')}`);
  for (const [key, mode] of Object.entries(invariance) as readonly [string, unknown][]) {
    if (mode === undefined) continue;
    if (typeof mode !== 'string' || !INVARIANCE_MODES.has(mode))
      throw new InvalidOptionError(
        `invariance for '${key}' must be 'none', 'level' or 'level-gain', got '${String(mode)}'`,
      );
    if (mode !== 'none' && EVENT_DIMENSIONS.has(key as ComparisonDimension))
      throw new InvalidOptionError(
        `invariance '${mode}' is not defined for '${key}': an event dimension has no curve to ` +
          'centre (AD-20). Use weights to exclude it instead.',
      );
  }
}

/** Spelled exactly as the interior's `selectPerformance` spells it, so the two agree (A17). */
function checkSelector(name: string, selector: string | number | undefined): void {
  if (typeof selector !== 'number') return;
  if (!Number.isInteger(selector) || selector < 0)
    throw new InvalidOptionError(
      `${name} index must be a non-negative integer, got ${String(selector)}`,
    );
}

function checkProfile(profile: CompareMpmOptions['profile']): void {
  if (profile === undefined) return;
  const unknown = (profile.dimensions ?? []).filter((key) => !DIMENSION_SET.has(key));
  if (unknown.length > 0)
    throw new InvalidOptionError(`unknown profile dimension(s): ${unknown.join(', ')}`);
  const grid = profile.grid;
  if (grid === undefined || grid === 'refinement') return;
  if (!Number.isFinite(grid.step) || grid.step <= 0)
    throw new InvalidOptionError(
      `profile.grid.step must be a finite number > 0, got ${String(grid.step)}`,
    );
}

// ---------------------------------------------------------------------------
// Defaults and the report boundary
// ---------------------------------------------------------------------------

function resolveWeights(
  weights: ComparisonSettings['weights'],
): Record<ComparisonDimension, number> {
  const resolved = defaultWeights() as Record<ComparisonDimension, number>;
  const result = { ...resolved };
  for (const dimension of COMPARISON_DIMENSIONS) {
    const value = weights?.[dimension];
    if (value !== undefined) result[dimension] = value;
  }
  return result;
}

function resolveInvariance(
  invariance: ComparisonSettings['invariance'],
): Record<ComparisonDimension, InvarianceMode> {
  return Object.fromEntries(
    COMPARISON_DIMENSIONS.map((dimension) => [dimension, invariance?.[dimension] ?? 'none']),
  ) as Record<ComparisonDimension, InvarianceMode>;
}

/**
 * `-0 ↦ +0` at the report boundary (MINOR-2, A20, §9.5).
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
