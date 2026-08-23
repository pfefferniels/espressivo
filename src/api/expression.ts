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
import { applyResolvedExaggeration } from '../expression/applier.js';
import { estimatesFromMsm } from '../expression/estimates.js';
import { parseMpmRoot, serializeMpmRoot } from '../expression/mpmDocument.js';
import { readPerformances } from '../expression/mpmTree.js';
import { parseMsmRoot, readMsmFacts, type MsmFacts } from '../expression/msmFacts.js';
import {
  IDENTITY_FACTOR,
  resolveRun,
  type ExaggerateOptions as EngineOptions,
  type ResolvedRun,
} from '../expression/options.js';
import {
  EXPRESSION_DIMENSIONS,
  type ExaggerationFactors,
  type ExpressionDimension,
} from '../expression/registry.js';
import type { ExaggerationReport } from '../expression/report.js';
import { resolveSelection, type Selection } from '../expression/selection.js';
import { weightedFactors as computeWeightedFactors } from '../expression/weights.js';
import type { ExaggerationWeights } from '../expression/weights.js';
import { andThen, collect, err, mapOk, type Result } from '../prelude/index.js';
import type { Element } from '../xml/XomTypes.js';
import {
  EngineInvariantError,
  InvalidOptionError,
  ParseError,
  PerformanceNotFoundError,
  SelectionNotFoundError,
} from './errors.js';
import { parseOrThrow, requireXmlText, type DocumentKind } from './parse.js';
import {
  accepted,
  allOf,
  orInvalidOption,
  rejected,
  requireOptionBag,
  type Checked,
} from './validate.js';
import type {
  ExaggerateOptions,
  ExaggerationResult,
  SpotlightOptions,
  SpotlightResult,
  XmlText,
} from './types.js';

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
 * D-A/A1 forbids `new Mpm(text)` here: the `Mpm` constructor runs the def parsers eagerly, so
 * merely *parsing* a document rewrites it — `rubatoDef` gains three attributes and has present
 * values respelled, `GenericMap.parseData` re-sorts every map's children and hoists them in
 * front of the whitespace, duplicate maps are deleted. A transform that inherited those edits
 * could not tell a caller which bytes it changed. So this path never touches the `Mpm` class,
 * and `checkParsed`'s `isEmpty()` test next door has no equivalent here: `Builder` either
 * yields a tree or throws.
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
 * It exists because it is the only thing an identity claim can be *tested* against:
 * `exaggerateMpm(mpm, {factors: {}}).mpm === mpm` is false for every MPM whatever the engine
 * does, since parsing and re-serializing normalizes the `xmlns` declarations. §1.1's P1 is
 * contracted against this instead (A2).
 *
 * It is a function here rather than a re-export of the interior `canonicalBaseline` because a
 * caller compares it against `exaggerateMpm`'s output on the SAME text, so the two must agree
 * on the failure path as exactly as on the success path. The interior parses with a bare
 * `Builder`, which throws `@xmldom/xmldom`'s own `ParseError` — a foreign class that is not a
 * `MeicoError`, and precisely the trap `parse.ts` exists to close.
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
 * Validate every option **before the document is parsed**, per §4 — and keep what that
 * validation produced.
 *
 * The ordering is a contract, not an accident: a caller who both misspells a dimension and
 * hands over a malformed document is told about the misspelling, because that is the error
 * they can act on and the other one may not even be theirs.
 *
 * The engine's own resolvers are the checkers — there is exactly one definition of "a legal
 * factor record", and it is `options.ts`'s. This returns what they resolved rather than
 * discarding it: {@link resolveRun}'s value goes straight to
 * {@link applyResolvedExaggeration}, so the engine resolves nothing a second time.
 */
function resolveExaggerateOptions(options: ExaggerateOptions): Result<ResolvedRun, string> {
  // Two bags, so two readability rows before any domain row (RULE E4): `resolveRun` walks
  // `factors` key by key, and `Object.keys` faults rather than reporting.
  return andThen(
    andThen(
      requireOptionBag(options, 'options must be an object carrying at least `factors`'),
      () =>
        allOf(
          mapOk(
            requireOptionBag(
              options.factors,
              'options.factors must be a record of dimension names to numbers; pass {} for the identity',
            ),
            () => undefined,
          ),
          // Spelled exactly as `selectPerformance` spells it, because the two must agree: a
          // caller who narrows one facade by index and the other by the same index gets one
          // answer.
          checkPerformanceIndex(options.performance),
        ),
    ),
    () => resolveRun(options.factors, toEngineOptions(options)),
  );
}

/** A `performance` selector given as an index must be one an array could have. */
function checkPerformanceIndex(selector: string | number | undefined): Checked {
  if (typeof selector !== 'number') return accepted;
  return Number.isInteger(selector) && selector >= 0
    ? accepted
    : rejected(`performance index must be a non-negative integer, got ${String(selector)}`);
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
 * is added or removed. Only attribute *values* change. The report says which dimensions were
 * written and how many writes each made, and names every individual site it refused, clamped,
 * skipped or found inert — it does not enumerate the written sites, so this half is a claim
 * about the document's shape, not a site-level diff manifest. It is universal: it holds for
 * every document, every dimension and every factor, including the ones R5b below carves out.
 *
 * **Symbolic invariance (R5b), and its one exception.** Performing the result against the same
 * MSM normally yields the same notes at the same symbolic dates, durations and pitches — and,
 * for the notes the score already had, under the same ids; only milliseconds, velocities and
 * control changes move. Notes that a v3 ornament *generates* match by position and date, never
 * by id: the renderer draws a fresh random `meico_<uuid>` for each of them on every render, so
 * two renders of the *same untransformed* document already disagree on those ids. That holds
 * for every MPM v2 document and for every v3 document whose ornament frames are measured in
 * milliseconds. It does not hold for `ornamentSpread` or `ornamentSpacing` on an MPM v3
 * ornament that generates notes into a tick-resolved frame (a `ticks` suffix, a `%` of the
 * principal, or no suffix at all): the v3 renderer derives those notes' symbolic dates and
 * durations from the frame,
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
  const run = orInvalidOption(resolveExaggerateOptions(options));

  const root = parseRoot('MPM', mpm, parseMpmRoot);
  // `== null`, not `=== undefined`: the interior's `resolveOptions` normalises every one of
  // its five options with `??`, so `null` means "absent" for the rest of this option bag, and
  // the facade's own two guards have to spell absence the same way or one bag would carry two
  // meanings for one value (ARCHITECTURE RULE N5; `eqeqeq` blesses the idiom for null).
  const facts = options.msm == null ? null : readMsm(options.msm);

  const report = transform(root, run, options.performance);

  return {
    mpm: serializeMpmRoot(root),
    report: facts === null ? report : withEstimates(root, report, facts),
  };
}

/**
 * Run the engine over an already-parsed tree and settle the performance selector.
 *
 * Shared by {@link exaggerateMpm} and {@link spotlightMpm} because spotlight resolves its
 * selection against the same tree the engine then writes into: routing it back through
 * `exaggerateMpm` would parse the document a second time to reach a tree it already holds, and
 * the two parses could only ever agree.
 */
function transform(
  root: Element,
  run: ResolvedRun,
  selector: string | number | undefined,
): ExaggerationReport {
  const report = runEngine(root, run);
  requireSelectedPerformance(root, selector, report);
  return report;
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
function runEngine(root: Element, run: ResolvedRun): ExaggerationReport {
  try {
    return applyResolvedExaggeration(root, run);
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

// ---------------------------------------------------------------------------
// Spotlight (DESIGN.md D-I) — the prototype's shader, with its defects designed out.
// ---------------------------------------------------------------------------

/**
 * Bring a selection of instructions forward by damping everything else.
 *
 * This is `Shader.bringOut` generalized (DESIGN.md §5, D-I). It is **not** a second transform:
 * once the selected elements' types are mapped onto dimensions, spotlight is
 * {@link exaggerateMpm} with a derived factor vector — the spared dimensions at 1, every other
 * dimension at `attenuation` — run in `gesture` scope. Everything the engine guarantees
 * therefore holds here unchanged, R5a included.
 *
 * **Why `gesture` and not `global`.** Under `global` scope a factor below 1 pulls every level
 * *toward the performance-wide center*, so quiet background material is re-levelled **louder**
 * — the exact inverse of damping it (a `p` at 48 in a {48, 48, 97} map renders at 59.3 under
 * attenuation 0.1). `gesture` holds each transition pair's geometric mean fixed and shrinks the
 * log-ratio between its endpoints, which is what "damp the gesture, leave the level" means. The
 * price is that on a **piecewise-constant** map — the shape mpmify and inference produce — the
 * two level dimensions have nothing to shrink and are reported `inert` rather than silently
 * claimed as transformed.
 *
 * **The selection is all-or-nothing.** Any id that resolves to nothing, or to an element type
 * governing no dimension, aborts the run with a {@link SelectionNotFoundError} naming every
 * offender. `ids: []` is the way to say "no selection": it returns {@link canonicalMpm} with
 * `report.totalWrites === 0` and an all-ones `report.appliedFactors`, because an empty spare
 * set means the identity and never total suppression.
 *
 * ```ts
 * const { mpm, spared } = spotlightMpm(text, { ids: ['t2', 'dyn4'], attenuation: 0.25 });
 * // spared === ['tempo', 'tempoShape', 'dynamics', 'dynamicsShape']
 * ```
 *
 * @param options `ids` and `attenuation` are both required; see {@link SpotlightOptions}
 * @throws {InvalidOptionError} `ids` is not an array of strings, `attenuation` is missing,
 *   non-finite, `<= 0` or `> 1`, or `performance` is not a name or a non-negative integer
 * @throws {ParseError} the MPM is not XML text, is not well-formed, or has the wrong root
 * @throws {SelectionNotFoundError} an id resolves to nothing, or to an unmappable element type
 * @throws {PerformanceNotFoundError} `options.performance` names or indexes nothing
 * @throws {EngineInvariantError} the engine broke one of its own invariants
 */
export function spotlightMpm(mpm: XmlText, options: SpotlightOptions): SpotlightResult {
  const attenuation = orInvalidOption(checkSpotlightOptions(options));

  const root = parseRoot('MPM', mpm, parseMpmRoot);
  const selection = resolveSelection(root, options.ids);
  requireResolvedSelection(selection);

  // Cannot refuse — `spotlightFactors` builds a full record out of 1 and an attenuation the
  // guard above has already put in (0,1], and `gesture` is one of the two scopes — but the
  // resolution is the engine's and the answer is a `Result`, so it is unwrapped like any other
  // rather than asserted away.
  const run = orInvalidOption(
    resolveRun(spotlightFactors(selection.spared, attenuation), {
      performance: options.performance,
      scope: 'gesture',
    }),
  );
  const report = transform(root, run, options.performance);

  return {
    mpm: serializeMpmRoot(root),
    report,
    spared: selection.spared,
    // Copied out of the interior's own array (CHARTER's public-API rule): the entries are
    // already plain data, but the arrays holding them are the resolver's.
    resolvedIds: selection.resolved.map((entry) => ({
      id: entry.id,
      element: entry.element,
      dimensions: [...entry.dimensions],
    })),
  };
}

/**
 * D-I's factor vector: the spared dimensions at 1, everything else at `attenuation`.
 *
 * The empty-spare-set branch is the one that matters. An empty selection derives an empty
 * spared set, and the arithmetic answer — attenuate all fifteen — is the prototype's worst
 * defect: a `bringOut` of nothing returned a flattened performance and called it a spotlight.
 * D-I makes it the identity instead, so "I have selected nothing" and "I have selected
 * everything" both leave the document alone.
 *
 * The spared dimensions are written out as an explicit 1 rather than omitted. Both are the
 * identity under R3, but the explicit form is what makes `report.dimensions[d].requestedFactor`
 * read `1` instead of `null` — the run did ask for the identity there, and a caller comparing
 * two spotlights should be able to see which dimensions were spared from the report alone.
 */
function spotlightFactors(
  spared: readonly ExpressionDimension[],
  attenuation: number,
): ExaggerationFactors {
  const factors: Partial<Record<ExpressionDimension, number>> = {};
  const isSpared = new Set(spared);
  for (const dimension of EXPRESSION_DIMENSIONS)
    factors[dimension] =
      spared.length === 0 || isSpared.has(dimension) ? IDENTITY_FACTOR : attenuation;
  return factors;
}

/**
 * §4's pre-parse validation for spotlight, returning the attenuation it accepted.
 *
 * `ids` is read as `unknown` because being a list of strings is its readability row: the
 * selection is walked element by element and matched against the document's ids, so a
 * non-string element resolves nothing and would be reported as a missing id rather than as
 * the wrong shape. `attenuation` needs no such row — `Number.isFinite` is total.
 */
function checkSpotlightOptions(options: SpotlightOptions): Result<number, string> {
  return andThen(
    requireOptionBag(options, 'options must be an object carrying `ids` and `attenuation`'),
    () => {
      const ids: unknown = options.ids;
      if (!Array.isArray(ids) || ids.some((id) => typeof id !== 'string'))
        return err('options.ids must be an array of xml:id strings; pass [] for no selection');

      const attenuation = options.attenuation;
      if (!Number.isFinite(attenuation))
        return err(
          `options.attenuation is required and must be a finite number in (0,1], got ${String(attenuation)}`,
        );
      if (attenuation <= 0 || attenuation > 1)
        return err(
          `options.attenuation must lie in (0,1] — 1 is the identity, and 0 would collapse every ` +
            `transition pair onto its own geomean and delete the gesture — got ${attenuation}`,
        );

      return mapOk(checkPerformanceIndex(options.performance), () => attenuation);
    },
  );
}

/**
 * A8 — every offender at once, or no run at all.
 *
 * The message is the whole report, one line per offender with its kind, because the alternative
 * to naming them all is a caller fixing a stale selection one id per exception.
 */
function requireResolvedSelection(selection: Selection): void {
  // `collect` and not `traverse`: A8 is the accumulating applicative, and this is the one place
  // in the facade where every offender at once is the contract rather than a nicety.
  const checked = collect(selection.offenders, (offender) =>
    err(`  - ${offender.kind}: ${offender.detail}`),
  );
  if (checked.ok) return;
  throw new SelectionNotFoundError(
    `MPM: ${checked.error.length} of the ${
      checked.error.length + selection.resolved.length
    } selected ids could not be spotlit, so nothing was transformed:\n${checked.error.join('\n')}`,
  );
}

// ---------------------------------------------------------------------------
// Weights (DESIGN.md D-H) — one scalar, fifteen factors.
// ---------------------------------------------------------------------------

/**
 * DESIGN.md D-H's lerp: expand one scalar into a factor record, `sᵈ = 1 + wᵈ·(s − 1)`.
 *
 * This is the prototype's `Exaggerate.applyWeights`, which is how a single "how exaggerated?"
 * control becomes a per-dimension vector: a weight of 1 passes the scalar through, 0 pins its
 * dimension to the identity, and anything between damps it. `s = 1` is the identity record for
 * **any** weights, so the neutral position of a slider is neutral whatever preset is loaded.
 *
 * Every dimension appears in the result, so what comes back is exactly what the run applied.
 * See {@link PROTOTYPE_WEIGHTS} for the prototype's tuned vector and DESIGN §8 for the ranges
 * to sample `s` from.
 *
 * ```ts
 * exaggerateMpm(mpm, { factors: weightedFactors(1.6, PROTOTYPE_WEIGHTS) });
 * ```
 *
 * A weight above 1 can drive a factor below 0 (`weightedFactors(0.3, {ornamentSpread: 1.5})` is
 * −0.05), which for the dimensions whose scale spaces run over a half-line is outside the
 * admissible domain. That is rejected by {@link exaggerateMpm}, not here, so the error names
 * the dimension in the same words whichever way the record was built.
 *
 * @param s the single scalar; 1 is the identity
 * @param weights how much of `s` each dimension takes; a missing key passes it through
 * @throws {InvalidOptionError} `s` or a weight is not finite, or `weights` holds a key that is
 *   not one of `EXPRESSION_DIMENSIONS`
 */
export function weightedFactors(s: number, weights: ExaggerationWeights): ExaggerationFactors {
  // `computeWeightedFactors` is total arithmetic whose only failures are programmer errors at
  // a leaf with no pipeline around it, so it throws rather than returning a `Result` that a
  // dozen call sites would unwrap without being able to recover. This is its typed-error
  // boundary (RULE E2).
  try {
    return computeWeightedFactors(s, weights);
  } catch (cause) {
    throw new InvalidOptionError(cause instanceof Error ? cause.message : String(cause), { cause });
  }
}

/**
 * The mpm-renderer prototype's tuned weight profile, preserved as data (D-H).
 *
 * A heuristic, not a recommendation: the numbers are one person's taste, nothing in DESIGN
 * derives them, and no test here validates them musically. They ship because the prototype
 * applied them to every render invisibly, and a documented constant is the difference between a
 * reproducible baseline and a lost one. The default is no weighting.
 *
 * See the constant's own documentation for the correspondence onto DESIGN §3's fifteen
 * dimensions, including the two the prototype fused and the five it could not express.
 */
export { PROTOTYPE_WEIGHTS } from '../expression/weights.js';
