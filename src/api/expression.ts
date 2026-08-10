/**
 * The expression facade: MPM ⇒ MPM, exaggerated (DESIGN.md §4).
 *
 * A second entry point beside {@link module:api/pipeline}, under the same rules and for a
 * different operation. Where that module converts and renders, this one **edits a document**:
 * text in, text out, nothing performed and nothing extracted (R1). What it adds to the engine
 * in `src/expression/` is exactly what a facade adds anywhere in this package:
 *
 * - **the typed-error boundary** (RULE E2). The engine has no error vocabulary of its own —
 *   `src/expression/**` may import `src/xml/**` and the MPM name constants and nothing else,
 *   so the hierarchy cannot live down there — and it throws plain `Error`s for the two
 *   things a caller can get wrong and the one thing the engine can. All three become typed
 *   here, and no function in this module returns `null`;
 * - **the document boundary** (RULE F2). XML crosses as text and the XOM tree stays interior;
 *   serialization is `getRootElement().toXML()` (RULE F2a), which is the byte sequence
 *   `canonicalBaseline` compares against and therefore the one P1's identity predicate is
 *   asserted on;
 * - **R1's carve-out, made mechanical.** `options.msm` is read for the report's estimates and
 *   for nothing else. The guarantee is not a promise in a comment: {@link toEngineOptions}
 *   builds the interior's option object field by field, so there is no path by which an MSM
 *   could reach a written byte.
 *
 * Everything returned is plain data (RULE F1) — the report is already plain in the engine,
 * and `tests/api/expression-facade.test.ts` pins the JSON round trip at this level too.
 */
import { applyExaggeration } from '../expression/applier.js';
import { estimatesFromMsm } from '../expression/estimates.js';
import { parseMpmRoot, serializeMpmRoot } from '../expression/mpmDocument.js';
import { readPerformances } from '../expression/mpmTree.js';
import { parseMsmRoot, readMsmFacts, type MsmFacts } from '../expression/msmFacts.js';
import {
  resolveFactors,
  resolveOptions,
  type ExaggerateOptions as EngineOptions,
} from '../expression/options.js';
import type { ExaggerationReport } from '../expression/report.js';
import type { Element } from '../xml/XomTypes.js';
import {
  EngineInvariantError,
  InvalidOptionError,
  ParseError,
  PerformanceNotFoundError,
} from './errors.js';
import { parseOrThrow, requireXmlText, type DocumentKind } from './parse.js';
import type { ExaggerateOptions, ExaggerationResult, XmlText } from './types.js';

/**
 * DESIGN.md §3's fifteen dimensions, in registry order — the complete set of keys
 * {@link ExaggerateOptions.factors} accepts (A11).
 */
export { EXPRESSION_DIMENSIONS } from '../expression/registry.js';

// ---------------------------------------------------------------------------
// Input parsing.
// ---------------------------------------------------------------------------

/**
 * Parse to a raw XOM tree and check the root, the expression engine's way.
 *
 * D-A/A1 forbids `new Mpm(text)` here and it is not a preference: the `Mpm` constructor runs
 * the def parsers eagerly, so merely *parsing* a document rewrites it — `rubatoDef` gains
 * three attributes and has present values respelled, `GenericMap.parseData` re-sorts every
 * map's children and hoists them in front of the whitespace, duplicate maps are deleted. A
 * transform that inherited those edits could not tell a caller which bytes it changed. So
 * this path never touches the `Mpm` class, and `checkParsed`'s `isEmpty()` test next door has
 * no equivalent: `Builder` either yields a tree or throws.
 */
function parseRoot(kind: DocumentKind, text: XmlText, parse: (text: string) => Element): Element {
  requireXmlText(kind, text);
  const root = parseOrThrow(kind, () => parse(text));
  const rootName = kind.toLowerCase();
  if (root.getLocalName() !== rootName)
    throw new ParseError(
      `${kind}: expected a <${rootName}> root element, found <${root.getLocalName()}>`,
    );
  return root;
}

/**
 * The canonical form of an MPM: what an untouched document serializes to once it has been
 * through this package's parser.
 *
 * It exists because it is the only thing an identity claim can be *tested* against.
 * `exaggerateMpm(mpm, {factors: {}}).mpm === mpm` is false for every MPM whatever the engine
 * does — `Element.wrap` drops `xmlns` at parse and `Element.toXML` re-emits it on every
 * namespaced element, which inflates a real fixture from 2444 to 4011 bytes — so §1.1's P1
 * is contracted against this instead (A2).
 *
 * It is a function here rather than a re-export of the interior `canonicalBaseline`, and that
 * is the whole point of it: a caller compares this against `exaggerateMpm`'s output on the
 * SAME text, so the two have to agree on the failure path as exactly as they agree on the
 * success path. The interior parses with a bare `Builder`, which throws `@xmldom/xmldom`'s own
 * `ParseError` — a foreign class that is not a `MeicoError`, which a consumer catching this
 * package's `ParseError` by identity would miss entirely, and which is precisely the trap
 * `parse.ts` exists to close.
 *
 * @throws {ParseError} the input is not XML text, is not well-formed, or has a root element
 *   other than `<mpm>` — the same three rejections, with the same messages, as
 *   {@link exaggerateMpm}
 */
export function canonicalMpm(mpm: XmlText): XmlText {
  return serializeMpmRoot(parseRoot('MPM', mpm, parseMpmRoot));
}

// ---------------------------------------------------------------------------
// Option validation (RULE E2's InvalidOptionError)
// ---------------------------------------------------------------------------

/**
 * The interior's option object, built field by field.
 *
 * The enumeration is the point: `factors` is a separate parameter of `applyExaggeration` and
 * `msm` is not an engine concept at all, so listing the five the engine does take is what
 * makes R1's carve-out structural rather than documentary. A spread of `options` would pass
 * the MSM into the engine and rely on it to ignore it.
 */
function toEngineOptions(options: ExaggerateOptions): EngineOptions {
  return {
    performance: options.performance,
    scope: options.scope,
    center: options.center,
    velocityRange: options.velocityRange,
    minRubatoWindow: options.minRubatoWindow,
  };
}

/**
 * Validate every option **before the document is parsed**, per §4.
 *
 * The ordering is a contract, not an accident: a caller who both misspells a dimension and
 * hands over a malformed document is told about the misspelling, because that is the error
 * they can act on and the other one may not even be theirs.
 *
 * The engine's own validators are the checkers — there is exactly one definition of "a legal
 * factor record", and it is `options.ts`'s. They throw plain `Error`s with the offender in
 * the message (the part this layer could not reconstruct), and this is where those become
 * {@link InvalidOptionError}. The cost is that `applyExaggeration` resolves the same options a
 * second time; both resolutions are pure, and the alternative is a facade that either
 * duplicates the domain rules or cannot tell an option error from an engine failure.
 */
function checkExaggerateOptions(options: ExaggerateOptions): void {
  // Read as `unknown` deliberately, the same way `options.ts` widens its scope check: these
  // two guards exist for callers arriving from JavaScript, where the parameter type guarantees
  // nothing, and comparing against the declared type would let the compiler prove them dead
  // and the linter delete them. Without them a missing `factors` fails with a `TypeError` from
  // inside `Object.keys` instead of with this module's own error type.
  const bag: unknown = options;
  if (typeof bag !== 'object' || bag === null)
    throw new InvalidOptionError('options must be an object carrying at least `factors`');
  const factors: unknown = (bag as ExaggerateOptions).factors;
  if (typeof factors !== 'object' || factors === null)
    throw new InvalidOptionError(
      'options.factors must be a record of dimension names to numbers; pass {} for the identity',
    );

  // Spelled exactly as `selectPerformance` spells it, because the two must agree: a caller
  // who narrows one facade by index and the other by the same index gets one answer.
  if (typeof options.performance === 'number') {
    const index = options.performance;
    if (!Number.isInteger(index) || index < 0)
      throw new InvalidOptionError(
        `performance index must be a non-negative integer, got ${String(index)}`,
      );
  }

  try {
    resolveEngineOptions(options);
  } catch (cause) {
    throw new InvalidOptionError(cause instanceof Error ? cause.message : String(cause), { cause });
  }
}

/** The engine's own validators, called for their throws; both are pure and their results unused. */
function resolveEngineOptions(options: ExaggerateOptions): void {
  resolveFactors(options.factors);
  resolveOptions(toEngineOptions(options));
}

// ---------------------------------------------------------------------------
// The facade
// ---------------------------------------------------------------------------

/**
 * Exaggerate an MPM's expression: every dimension's deviation from its neutral, scaled.
 *
 * The transform is **pure and deterministic** (R1/R2): the same `(mpm, factors)` always
 * yields the same bytes, no RNG is involved, and the input string is untouched.
 *
 * **Structural invariance (R5a).** The returned document has the same skeleton as the input's
 * canonical form: no `@date` is ever written, no element is added or removed, and no attribute
 * is added or removed. Only attribute *values* change, and only at the sites the report names.
 * This half is universal — it holds for every document, every dimension and every factor,
 * including the ones R5b below carves out.
 *
 * **Symbolic invariance (R5b), and its one exception.** Performing the result against the same
 * MSM normally yields the same notes at the same symbolic dates, durations and pitches; only
 * milliseconds, velocities and control changes move. That holds for every MPM v2 document and
 * for every v3 document whose ornament frames are measured in milliseconds. It does **not**
 * hold for `ornamentSpread` or `ornamentSpacing` on an MPM **v3 ornament that generates
 * notes** into a tick-resolved frame (a `ticks` suffix, a `%` of the principal, or no suffix
 * at all): the v3 renderer derives those notes' symbolic dates and durations from the frame,
 * so widening or reshaping it necessarily relocates them, and past §7.9's cliff it can carve
 * a surviving principal down to a zero-length note. There is no way to both widen the window
 * an ornament's notes occupy and leave those notes where they were; a caller that needs the
 * guarantee holds those two dimensions at 1.
 * `tests/integration/expression-transform.test.ts` pins the boundary in both directions.
 *
 * A factor of 1, or a missing key, is the identity for that dimension and short-circuits it
 * (A2): `factors: {}` and an all-ones record both return {@link canonicalMpm} byte for byte,
 * with `report.totalWrites === 0`.
 *
 * ```ts
 * const { mpm, report } = exaggerateMpm(text, { factors: { tempo: 1.6, dynamics: 1.4 } });
 * if (report.totalWrites === 0) skipSample();          // R4's exact no-op contract
 * ```
 *
 * @param options `factors` is required; see {@link ExaggerateOptions} for the rest. Omitting
 *   `performance` transforms **all** of them, which is where this diverges from `performMsm`.
 * @throws {InvalidOptionError} an `options` value that is not an object, a `factors` that is
 *   not a record, an unknown dimension key, a non-finite factor, a factor outside its
 *   dimension's admissible domain, an unknown `scope`, an inverted or non-positive
 *   `velocityRange`, a `minRubatoWindow` outside (0,1), a `center` that is not a positive
 *   finite number, or a `performance` index that is not a non-negative integer
 * @throws {ParseError} the MPM — or the optional MSM — is not XML text, is not well-formed, or
 *   has the wrong root element
 * @throws {PerformanceNotFoundError} `options.performance` names or indexes nothing
 * @throws {EngineInvariantError} the engine broke one of its own invariants; see the class for
 *   the one option value that can provoke it
 */
export function exaggerateMpm(mpm: XmlText, options: ExaggerateOptions): ExaggerationResult {
  checkExaggerateOptions(options);

  const root = parseRoot('MPM', mpm, parseMpmRoot);
  // `== null`, not `=== undefined`: the interior's `resolveOptions` normalises every one of
  // its five options with `??`, so `null` means "absent" for the rest of this option bag, and
  // the facade's own two guards have to spell absence the same way or one bag would carry two
  // meanings for one value (ARCHITECTURE RULE N5; `eqeqeq` blesses the idiom for null).
  const facts = options.msm == null ? null : readMsm(options.msm);

  const report = runEngine(root, options);
  requireSelectedPerformance(root, options.performance, report);

  return {
    mpm: serializeMpmRoot(root),
    report: facts === null ? report : withEstimates(root, report, facts),
  };
}

function readMsm(msm: XmlText): MsmFacts {
  return readMsmFacts(parseRoot('MSM', msm, parseMsmRoot));
}

/**
 * Run the engine, turning an interior invariant failure into a typed one.
 *
 * Options have already been validated, so nothing `applyExaggeration` re-validates can throw
 * here; what remains is A6's `lateStart < earlyEnd` assertion, which is the engine reporting
 * on itself rather than on the caller.
 */
function runEngine(root: Element, options: ExaggerateOptions): ExaggerationReport {
  try {
    return applyExaggeration(root, options.factors, toEngineOptions(options));
  } catch (cause) {
    throw new EngineInvariantError(
      `MPM: the exaggeration engine failed an internal invariant — ${
        cause instanceof Error ? cause.message : String(cause)
      }`,
      { cause },
    );
  }
}

/**
 * A `performance` selector that matched nothing is an error here, not an empty run.
 *
 * The engine reports `performances: []` and leaves the document alone, which is already R4's
 * "this sample is a no-op" — but a caller who *named* a performance asked a question, and
 * answering it with an unchanged document would hide a typo behind a valid-looking result.
 * The messages are `selectPerformance`'s, so the two facades read alike.
 *
 * `== null` for the same reason as the MSM guard above: the engine's `selectPerformances` reads
 * a null selector as "no selector, transform all", so reading it here as a *name* would report
 * `no performance named 'null'` — a name the caller never wrote — for a bag the engine had
 * already accepted.
 */
function requireSelectedPerformance(
  root: Element,
  selector: string | number | undefined,
  report: ExaggerationReport,
): void {
  if (selector == null || report.performances.length > 0) return;
  throw new PerformanceNotFoundError(
    typeof selector === 'number'
      ? `MPM: no performance at index ${selector}; the document has ${readPerformances(root).length}`
      : `MPM: no performance named '${selector}'`,
  );
}

/**
 * Fill in each performance's MSM-dependent estimates (A10).
 *
 * The walk reads the **transformed** tree, which is what makes the estimates about the values
 * the caller is going to render rather than about the ones they passed in — and it is why
 * this runs after the engine rather than beside it. `beatsUnverifiable` carries the one fact
 * the estimator cannot see from the document, whether the `accentuation` dimension was walked
 * at all, which the engine has already put in the field it is read back out of.
 */
function withEstimates(
  root: Element,
  report: ExaggerationReport,
  facts: MsmFacts,
): ExaggerationReport {
  // Keyed by the document index the report carries rather than by array position: the two
  // agree today, and a `Map` is what makes the lookup answer "no such performance" instead of
  // handing back a neighbour if a narrowing selector ever changed that.
  const views = new Map(readPerformances(root).map((view) => [view.index, view]));
  return {
    ...report,
    performances: report.performances.map((performance) => {
      const view = views.get(performance.performance.index);
      if (view === undefined) return performance;
      return {
        ...performance,
        estimates: estimatesFromMsm(view, facts, performance.estimates.beatsUnverifiable),
      };
    }),
  };
}
