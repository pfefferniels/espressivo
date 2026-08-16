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
 * ## One named-parameter object, and one obligation that follows
 *
 * Every entry point takes ONE options object (F5): two interchangeable MPM texts make positional
 * arguments a hazard in a way `performMsm`'s single document does not. The obligation is that
 * **the options echo enumerates its scalar fields exactly and never the document texts** (A12) —
 * echoing "options" would copy both documents into the result and then deep-copy them again to
 * satisfy RULE I3(b).
 */
import { compareInterior, type InteriorCompareOptions } from '../comparison/compare.js';
import { defaultWeights } from '../comparison/aggregate.js';
import { DEFAULT_LAMBDA_DATE } from '../comparison/eventAlignment.js';
import {
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
import type { ComparisonReport, ComparisonResult } from '../comparison/report.js';
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
  /** Requires `msm`. Not implemented in v1 — see the validation notes below. */
  readonly noteDensityWeight?: boolean;
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
 *   no selector, `noteDensityWeight` without an `msm`, or a document resolving a tempo ≤ 0
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
  });

  return { report: normalizeZeros(report) };
}

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

/** Run the interior, turning its typed throws into the facade's (§9.4). */
function run(options: InteriorCompareOptions): ComparisonReport {
  try {
    return compareInterior(options);
  } catch (cause) {
    if (cause instanceof PerformanceSelectionNotFoundError)
      throw new PerformanceNotFoundError(`MPM ${cause.role}: ${cause.message}`, { cause });
    if (
      cause instanceof PerformanceSelectionAmbiguousError ||
      cause instanceof PerformanceSelectorInvalidError ||
      cause instanceof NonPositiveTempoError
    )
      throw new InvalidOptionError(`MPM ${cause.role}: ${cause.message}`, { cause });
    throw new ComparisonEngineError(
      `the comparison engine failed an internal invariant — ${
        cause instanceof Error ? cause.message : String(cause)
      }`,
      { cause },
    );
  }
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

  // AD-25.1's knowability split, first branch: unusable given the OTHER OPTIONS alone, so the
  // caller could have known without reading a document, so it throws.
  if (options.noteDensityWeight === true)
    throw new InvalidOptionError(
      options.msm === undefined
        ? 'noteDensityWeight requires an msm: the weight function is derived from the score’s ' +
            'note density and there is no score to derive it from'
        : 'noteDensityWeight is not implemented in v1: the weight function w(t) would have to ' +
            'reach all eleven dimensions’ integrands, and returning an UNWEIGHTED report for a ' +
            'caller who asked for a weighted one would hide that behind a valid-looking result',
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
