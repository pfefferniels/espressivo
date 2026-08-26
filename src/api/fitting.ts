/**
 * The fitting facade: an aligned score in, the MPM that explains it out.
 *
 * The fourth verb beside {@link module:api/pipeline}, {@link module:api/expression} and
 * {@link module:api/comparison}, under the same rules and running the other way round from all
 * three. Where they convert, edit and measure a performance description, this one **derives**
 * it: the input is a recording laid on its score, and what comes back is the MPM a renderer
 * would need in order to sound that recording again.
 *
 * What it adds to `src/fitting/` is what a facade adds anywhere in this package:
 *
 * - **the document boundary** (RULE F2). The alignment crosses as MSM text and the MPM comes
 *   back as text; `Alignment`, `Mpm` and `Transformer` stay interior, and no signature here
 *   mentions one. Serialization is `getRootElement().toXML()` (RULE F2a);
 * - **the typed-error boundary** (RULE E2). The interior throws plain `Error`s — an
 *   unsatisfied `requires`, an instruction it could not name, an attribute that computed to
 *   `NaN` — and this is where those become {@link InvalidOptionError} and
 *   {@link FittingEngineError};
 * - **the plain-data chain.** A chain is a list of {@link FitCall}s, which is exactly what a
 *   saved reconstruction records. `Work`, `WorkFile` and `Segment` do not cross: a caller
 *   holding one passes its `provenance` as `chain` and keeps its own file reading.
 *
 * ## The chain is required, and there is no default
 *
 * `src/fitting/transformers/Order.ts` encodes a total order over transformer *names*; nothing
 * in the tree generates calls. "Fit this recording, no instructions given" is a research
 * problem rather than a facade one, and the signature says so rather than pretending otherwise.
 * {@link listFitters} is how a caller discovers what it may name.
 *
 * ## Why `pedals` and `sources` are separate inputs
 *
 * MSM cannot state either. Its `<pedal>` is `date`/`state`/`date.end` in ticks and a recorded
 * pedal has no symbolic date at all; `source` — which reading of a passage a note came from,
 * what `MakeChoice` selects on — is not an MSM attribute. Everything else about the alignment
 * is in the document, in the same three attributes a render writes. The committed example of
 * the triple is `tests/fitting/fixtures/roundtrip/`.
 */
import { Alignment, type AlignedNote, type AlignedPedal } from '../fitting/alignment.js';
import { deriveResidual, type Residual } from '../fitting/residual.js';
import { runChain } from '../fitting/runChain.js';
import { compareTransformers, validate } from '../fitting/transformers/Order.js';
import { InsertMetadata } from '../fitting/transformers/metadata/InsertMetadata.js';
import { getRange, type Transformer } from '../fitting/transformers/Transformer.js';
import {
  createTransformer,
  getTransformerOrder,
} from '../fitting/transformers/TransformerRegistry.js';
import { Msm } from '../msm/Msm.js';
import { andThen, elementAt, traverse, mapOk } from '../prelude/index.js';
import { attribute, descendantElements } from '../xml/tree.js';
import { Builder, type Element } from '../xml/XomTypes.js';
import {
  EmptyDocumentError,
  FittingEngineError,
  InvalidOptionError,
  ParseError,
} from './errors.js';
import { parseOrThrow, requireXmlText } from './parse.js';
import type { XmlText } from './types.js';
import {
  accepted,
  allOf,
  describeValue,
  orInvalidOption,
  rejected,
  requireOptionBag,
  type Checked,
} from './validate.js';

// ---------------------------------------------------------------------------
// The surface
// ---------------------------------------------------------------------------

/** Anything `JSON.parse` produces. A fitter's options are data, so this is their whole type. */
export type JsonValue =
  string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

/**
 * One fitter call: which fitter, the options it runs with, and a caller-chosen id.
 *
 * The shape a saved reconstruction records call for call, so `work.provenance` is a `FitCall[]`
 * as it stands. `id` is what {@link FitResult.calls} and {@link FitResult.skipped} report back
 * under; it is the caller's to choose and this module never mints one.
 *
 * A `Set`-valued option — `InsertArticulation`'s `aspects` is the only one today — crosses as
 * the envelope a work file spells it in, `{ dataType: 'Set', value: [...] }`, and a `Map` as
 * `{ dataType: 'Map', value: [[key, value], ...] }`. That is what keeps the chain plain data
 * (RULE F1) without losing options a fitter reads as a set.
 */
export interface FitCall {
  readonly id: string;
  readonly name: string;
  readonly options: Readonly<Record<string, JsonValue>>;
}

/**
 * A recorded pedal: down and up in milliseconds, and no symbolic date.
 *
 * `source` says which reading it was recorded in, and pairs with {@link FitNoteSource.source}.
 */
export interface FitPedal {
  readonly id: string;
  readonly type: 'sustain' | 'soft';
  /** Milliseconds from the start of the recording. */
  readonly date: number;
  /** Milliseconds from the start of the recording, at release. */
  readonly end: number;
  readonly source?: string;
}

/**
 * Which reading one `<note>` of the MSM came from, **positionally**: the nth entry belongs to
 * the nth `<note>` in document order.
 *
 * Positional and not keyed, because a passage aligned twice is two `<note>` elements under one
 * `xml:id` — which is the whole shape `MakeChoice` exists to reduce. `id` is therefore a
 * checksum on the pairing rather than a key, and a mismatch is refused.
 */
export interface FitNoteSource {
  readonly id: string;
  readonly source?: string;
}

/** The aligned score, and the chain to fit it with. */
export interface FitInput {
  /**
   * The alignment as MSM: the score in `date`/`duration`/`midi.pitch`, the recording in
   * `velocity`/`milliseconds.date`/`milliseconds.date.end`. Every `<note>` must carry both
   * halves — a document with only the score half is not an alignment and is refused.
   */
  readonly msm: XmlText;
  readonly chain: readonly FitCall[];
  readonly pedals?: readonly FitPedal[];
  readonly sources?: readonly FitNoteSource[];
}

export interface FitOptions {
  /**
   * Refuse a chain naming a fitter this build does not have, instead of skipping the call.
   * Default false; see {@link fitMpm} for which of the two to want.
   */
  readonly strict?: boolean;
}

/**
 * The stretch of score a call acted on, in ticks.
 *
 * `to` is `null` where the call names a single date rather than a span — a `<tempo>` is placed
 * at a date and reaches to the next one, which is a fact about the map and not about the call.
 */
export interface FitRange {
  readonly from: number;
  readonly to: number | null;
}

/** What one call of the chain did. */
export interface FitCallReport {
  /** The {@link FitCall.id} it was made under. */
  readonly id: string;
  /**
   * The fitter's **current** name, which is not always the one the call was written under: a
   * chain saved before a rename names the retired spelling, and the registry resolves it. It
   * is therefore always one of {@link listFitters}'s.
   */
  readonly name: string;
  /** Its position in the order the chain ran, which is reduction order and not chain order. */
  readonly ordinal: number;
  /**
   * The `xml:id`s of the MPM elements this call is answerable for — written or changed.
   *
   * Derived from the document before and after the call rather than declared by it, so a
   * fitter that reshapes an instruction another one wrote is credited with it too.
   */
  readonly elements: readonly string[];
  readonly range: FitRange | null;
}

export interface FitResult {
  readonly mpm: XmlText;
  /**
   * One entry per call of yours that ran, in the order they ran.
   *
   * The chain runs one thing you did not ask for: an MPM needs a `<metadata>` and the runner
   * writes one whether or not the chain says so. A chain that declared an `InsertMetadata` sees
   * it here under its own id; a chain that declared none gets the element and no entry, because
   * it is not a call anybody made.
   */
  readonly calls: readonly FitCallReport[];
  /** The {@link FitCall.id} of every call whose fitter is not registered in this build. */
  readonly skipped: readonly string[];
}

/** A registered fitter, as {@link listFitters} reports it. */
export interface FitterInfo {
  readonly name: string;
  /** Its place in reduction order — the order a chain runs in, whatever order it was written. */
  readonly ordinal: number;
  /** The fitters that must run before this one, by name. */
  readonly requires: readonly string[];
}

export interface ChainProblem {
  /** The index in the chain **as passed**, not in reduction order. */
  readonly index: number;
  readonly id: string;
  /**
   * The name **as the call spells it**, unlike {@link FitCallReport.name}: this is a problem
   * with something the caller wrote, so it names what they have to go and find.
   */
  readonly name: string;
  readonly kind: 'unknown-fitter' | 'unsatisfied-requirement';
  readonly message: string;
}

// ---------------------------------------------------------------------------
// The facade
// ---------------------------------------------------------------------------

/**
 * Fit an MPM to an aligned recording: run the chain, and hand back the document it wrote.
 *
 * The chain runs in **reduction order** — the registry's, not the order the calls are listed
 * in — because the fitters compose in one direction only: a rubato is fitted against a tempo
 * curve that is already there, an articulation against the velocity the dynamics leave over.
 * Two calls of the same fitter keep the order they were given in.
 *
 * ```ts
 * const { mpm, calls, skipped } = fitMpm({
 *   msm: alignedMsm,
 *   chain: work.provenance,
 *   pedals,
 *   sources,
 * });
 * calls[0].elements;            // the xml:ids that first call is answerable for
 * ```
 *
 * **An unknown fitter is skipped, not fatal.** A chain saved by a newer build can name a fitter
 * this one does not have, and the useful answer for a corpus of saved reconstructions is the
 * partial fit plus a list of what was dropped — which is what `skipped` is. A caller who needs
 * the chain to be complete passes `strict: true` and gets an {@link InvalidOptionError} naming
 * every unknown name instead. Either way nothing is dropped silently.
 *
 * **An unsatisfied `requires` is always fatal**, in both modes: it is a statement about the
 * chain the caller wrote, and running the part of it that happens to be well-ordered would
 * produce a document that looks fitted and is not. {@link validateChain} answers the same
 * question without running anything.
 *
 * The MSM is **not** modified — a fresh alignment is built from the text on every call — but
 * the chain does write through that alignment as it runs, which is why the ranges and the
 * residual below are read at the end of the run rather than at the start.
 *
 * @param options omit for the skipping behaviour above
 * @throws {ParseError} `input.msm` is not XML text, is not well-formed, has a root element
 *   other than `<msm>`, or carries a `<note>` whose score attributes are missing or not numeric
 * @throws {EmptyDocumentError} the MSM holds no `<note>`, or holds one carrying no
 *   `velocity`/`milliseconds.date`/`milliseconds.date.end` — it is a score, not an alignment
 * @throws {InvalidOptionError} `chain` is absent or not a list of `{ id, name, options }`, a
 *   `dataType` envelope is malformed, `pedals` or `sources` is not the shape above, `sources`
 *   is not one entry per `<note>` of the document, a call requires a fitter the chain does not
 *   run before it, or `strict` was asked for and a fitter is not registered
 * @throws {FittingEngineError} a fitter failed — an instruction it could not give an `xml:id`,
 *   an MPM attribute that computed to `NaN`, or a render the residual could not take
 */
export function fitMpm(input: FitInput, options?: FitOptions): FitResult {
  orInvalidOption(checkFitInput(input));
  orInvalidOption(checkFitOptions(options));

  const resolved = resolveChain(input.chain);
  const skipped = resolved.filter((entry) => entry.transformer === null);
  if (skipped.length > 0 && options?.strict === true)
    throw new InvalidOptionError(
      `chain: ${String(skipped.length)} call(s) name a fitter this build does not have — ` +
        `${unique(skipped.map((entry) => entry.call.name)).join(', ')}. ` +
        'Drop `strict` to skip them instead.',
    );

  const ordered = inReductionOrder(resolved);
  requireWellOrdered(ordered);

  const alignment = toAlignment(input);
  const run = runOrThrow(alignment, ordered);

  // RULE F2a: the declaration-free form, which is what every other facade hands back.
  const root = run.mpm.getRootElement();
  if (root === null) throw new FittingEngineError('the chain produced no MPM document');

  return {
    mpm: root.toXML(),
    calls: report(ordered, run, alignment),
    skipped: skipped.map((entry) => entry.call.id),
  };
}

/**
 * The fitters this build has, in reduction order.
 *
 * The vocabulary {@link FitCall.name} draws on, and the order {@link fitMpm} runs a chain in:
 * `listFitters()[i]` runs before `listFitters()[j]` for every `i < j`, whatever order the two
 * calls were written in.
 */
export function listFitters(): readonly FitterInfo[] {
  return getTransformerOrder().map((name, ordinal) => ({
    name,
    ordinal,
    requires: requirementsOf(name),
  }));
}

/**
 * Everything wrong with a chain that can be known without a document.
 *
 * The two things {@link fitMpm} refuses, reported all at once rather than one exception at a
 * time: a fitter this build does not have, and a call whose `requires` nothing before it
 * satisfies. An empty list means the chain runs — not that it fits anything, which only the
 * alignment can say.
 *
 * ```ts
 * const problems = validateChain(work.provenance);
 * if (problems.length === 0) fitMpm({ msm, chain: work.provenance });
 * ```
 *
 * @throws {InvalidOptionError} `chain` is not a list of `{ id, name, options }`, or a
 *   `dataType` envelope in one of their options is malformed
 */
export function validateChain(chain: readonly FitCall[]): readonly ChainProblem[] {
  orInvalidOption(checkChain(chain));

  const resolved = resolveChain(chain);
  const problems: ChainProblem[] = resolved
    .filter((entry) => entry.transformer === null)
    .map((entry) => ({
      index: entry.index,
      id: entry.call.id,
      name: entry.call.name,
      kind: 'unknown-fitter',
      message: `${entry.call.name} is not a registered fitter, so it cannot be ordered or run`,
    }));

  const ordered = inReductionOrder(resolved);
  for (const message of validate(ordered.map((entry) => entry.transformer))) {
    const entry = elementAt(ordered, message.index, 'the chain entry a problem is about');
    problems.push({
      index: entry.index,
      id: entry.call.id,
      name: entry.call.name,
      kind: 'unsatisfied-requirement',
      message: message.message,
    });
  }
  return problems;
}

// ---------------------------------------------------------------------------
// Chain resolution
// ---------------------------------------------------------------------------

/** One call, and the fitter it named — `null` where this build has no such fitter. */
interface ResolvedCall {
  readonly index: number;
  readonly call: FitCall;
  readonly transformer: Transformer | null;
}

/** {@link ResolvedCall} with the null case already taken out. */
interface RunnableCall extends ResolvedCall {
  readonly transformer: Transformer;
}

/**
 * Build a fitter per call, through the registry, so a retired name still resolves.
 *
 * `createTransformer` is the one name → constructor table in the package and it follows the
 * alias map, which is what lets a work file that still says `TranslatePhyiscalTimeToTicks` run.
 */
function resolveChain(chain: readonly FitCall[]): ResolvedCall[] {
  return chain.map((call, index) => {
    const transformer = createTransformer(call.name);
    if (transformer !== null) {
      transformer.id = call.id;
      transformer.options = reviveOptions(call.options);
    }
    return { index, call, transformer };
  });
}

/**
 * The runnable calls, sorted the way the chain will run.
 *
 * Sorted here rather than left to `runChain`, because the `requires` check reads the chain in
 * the order it is handed, so a chain validated in list order would report a violation for every
 * pair the sort is about to put right.
 */
function inReductionOrder(resolved: readonly ResolvedCall[]): RunnableCall[] {
  return resolved
    .filter((entry): entry is RunnableCall => entry.transformer !== null)
    .sort((a, b) => compareTransformers(a.transformer, b.transformer));
}

/** The `requires` of a registered fitter, by name. */
function requirementsOf(name: string): string[] {
  const transformer = createTransformer(name);
  if (transformer === null) return [];
  return transformer.requires.map((required) => new required().name);
}

/** A chain that cannot run does not run — every unsatisfied requirement in one message. */
function requireWellOrdered(ordered: readonly RunnableCall[]): void {
  const messages = validate(ordered.map((entry) => entry.transformer));
  if (messages.length === 0) return;
  throw new InvalidOptionError(
    `chain: ${String(messages.length)} call(s) cannot run in the order the chain implies:\n${messages
      .map((message) => `  - ${message.message}`)
      .join('\n')}`,
  );
}

/**
 * The `Set` and `Map` envelopes decoded, everything else copied.
 *
 * Total: {@link checkJson} has already established that every envelope carries the array it
 * claims to, which is the one thing about this shape that is not a fact about JSON.
 */
function reviveOptions(options: Readonly<Record<string, JsonValue>>): Record<string, unknown> {
  const revived: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(options)) revived[key] = revive(value);
  return revived;
}

function revive(value: JsonValue): unknown {
  if (Array.isArray(value)) return value.map(revive);
  if (value === null || typeof value !== 'object') return value;

  const entries = value['value'];
  if (isEnvelope(value, 'Set') && Array.isArray(entries)) return new Set(entries.map(revive));
  if (isEnvelope(value, 'Map') && Array.isArray(entries)) return new Map(entries.map(revivePair));

  return reviveOptions(value);
}

function revivePair(entry: JsonValue): [unknown, unknown] {
  const key = Array.isArray(entry) ? entry[0] : undefined;
  const value = Array.isArray(entry) ? entry[1] : undefined;
  return [key === undefined ? null : revive(key), value === undefined ? null : revive(value)];
}

function isEnvelope(value: Record<string, JsonValue>, kind: 'Map' | 'Set'): boolean {
  return value['dataType'] === kind;
}

// ---------------------------------------------------------------------------
// The run, and what it reports
// ---------------------------------------------------------------------------

type ChainRun = ReturnType<typeof runChain>;

/** Run the chain, turning an interior failure into a typed one. */
function runOrThrow(alignment: Alignment, ordered: readonly RunnableCall[]): ChainRun {
  try {
    return runChain(
      alignment,
      ordered.map((entry) => entry.transformer),
    );
  } catch (cause) {
    throw new FittingEngineError(
      `the fitting chain failed — ${cause instanceof Error ? cause.message : String(cause)}`,
      { cause },
    );
  }
}

/**
 * One report entry per call of the caller's that ran, in the order they ran.
 *
 * The chain is walked as it *ran* rather than as it was written, and each fitter is matched
 * back to the call it was built from by identity. `runChain` substitutes the metadata call —
 * it drops the imported one and builds a fresh one from the title and author it carried — so
 * that one instance answers to no call and is attributed back by name. A chain that declared
 * no metadata gets one anyway, and it appears in no report entry, because it is not a call the
 * caller made.
 */
function report(
  ordered: readonly RunnableCall[],
  run: ChainRun,
  alignment: Alignment,
): FitCallReport[] {
  const byTransformer = new Map(ordered.map((entry) => [entry.transformer, entry.call]));
  const metadata = ordered.find((entry) => entry.transformer instanceof InsertMetadata)?.call;
  const residual = residualFor(ordered, run, alignment);

  const calls: FitCallReport[] = [];
  for (const transformer of run.transformers) {
    const call =
      byTransformer.get(transformer) ??
      (transformer instanceof InsertMetadata ? metadata : undefined);
    if (call === undefined) continue;
    calls.push({
      id: call.id,
      name: transformer.name,
      ordinal: calls.length,
      elements: [...transformer.created],
      range: rangeOf(transformer, alignment, residual),
    });
  }
  return calls;
}

/**
 * The residual, and only where a call needs one.
 *
 * Deriving it costs a render, and the one thing it is read for here is placing a pedal on the
 * score grid — every other kind of call answers from its own options. A chain that pedals
 * nothing does not pay for it.
 */
function residualFor(
  ordered: readonly RunnableCall[],
  run: ChainRun,
  alignment: Alignment,
): Residual | undefined {
  if (!ordered.some((entry) => 'pedal' in entry.transformer.options)) return undefined;
  try {
    return deriveResidual(alignment, run.mpm);
  } catch (cause) {
    throw new FittingEngineError(
      `the fitting chain ran, but its ranges could not be measured — ${
        cause instanceof Error ? cause.message : String(cause)
      }`,
      { cause },
    );
  }
}

function rangeOf(
  transformer: Transformer,
  alignment: Alignment,
  residual: Residual | undefined,
): FitRange | null {
  const range = getRange(transformer.options, alignment, residual);
  if (range === undefined) return null;
  return { from: range.from, to: range.to ?? null };
}

function unique(names: readonly string[]): string[] {
  return [...new Set(names)];
}

// ---------------------------------------------------------------------------
// The alignment, read out of the three inputs
// ---------------------------------------------------------------------------

/**
 * Parse the MSM and put the two things it cannot state back beside it.
 *
 * The document is parsed with a bare `Builder` rather than `new Msm(text)`, for the reason
 * `src/expression/mpmDocument.ts` gives at length: the class constructors repair as they parse,
 * and a fitted document should answer to the bytes the caller handed over.
 */
function toAlignment(input: FitInput): Alignment {
  requireXmlText('MSM', input.msm);
  const root = parseOrThrow('MSM', () => new Builder().build(input.msm).getRootElement());
  if (root.getLocalName() !== 'msm')
    throw new ParseError(`MSM: expected a <msm> root element, found <${root.getLocalName()}>`);

  const inScore = scoreNotes(root);
  if (inScore.length === 0)
    throw new EmptyDocumentError('MSM: the document holds no <note> to fit anything to');

  const sources = input.sources;
  if (sources !== undefined && sources.length !== inScore.length)
    throw new InvalidOptionError(
      `sources: the MSM holds ${String(inScore.length)} <note> elements and ` +
        `${String(sources.length)} sources were given; the two are paired by position`,
    );

  const alignment = new Alignment(
    inScore.map(({ element, part }, index) => readNote(element, part, sources?.[index])),
    timeSignatureOf(root),
  );
  alignment.pedals = (input.pedals ?? []).map(readPedal);
  return alignment;
}

/** Every `<note>` under a `<part>`, in document order, with the part number it hangs under. */
function scoreNotes(root: Element): { element: Element; part: number }[] {
  const found: { element: Element; part: number }[] = [];
  for (const part of descendants(root, 'part')) {
    const number = numeric(part, 'number', '<part>');
    for (const element of descendants(part, 'note')) found.push({ element, part: number });
  }
  return found;
}

function readNote(element: Element, part: number, source: FitNoteSource | undefined): AlignedNote {
  const options = Msm.noteOptionsOf(element);
  if (options === null)
    throw new ParseError('MSM: a <note> carries no date, duration or midi.pitch');

  const id = options.id;
  if (id === undefined)
    throw new ParseError(
      `MSM: the <note> at date ${String(options.date)} carries no xml:id, so no fitter could name it`,
    );
  if (source !== undefined && source.id !== id)
    throw new InvalidOptionError(
      `sources: the entries are out of step with the document — <note ${id}> is paired with ${source.id}`,
    );

  return {
    part,
    'xml:id': id,
    date: options.date,
    duration: options.duration,
    'midi.pitch': options.midiPitch,
    pitchname: scored(options.pitchname, 'pitchname', id),
    octave: scored(options.octave, 'octave', id),
    accidentals: scored(options.accidentals, 'accidentals', id),
    velocity: performed(options.velocity, 'velocity', id),
    'milliseconds.date': performed(options.millisecondsDate, 'milliseconds.date', id),
    'milliseconds.date.end': performed(options.millisecondsDateEnd, 'milliseconds.date.end', id),
    ...(source?.source !== undefined && { source: source.source }),
  };
}

/** A score attribute a `<note>` of any MSM carries. */
function scored<T>(value: T | undefined, name: string, id: string): T {
  if (value === undefined) throw new ParseError(`MSM: <note ${id}> carries no ${name}`);
  return value;
}

/**
 * A recording attribute. Its absence is what tells a score from an alignment, so it is an
 * empty document rather than a malformed one (RULE E3).
 */
function performed(value: number | undefined, name: string, id: string): number {
  if (value === undefined)
    throw new EmptyDocumentError(
      `MSM: <note ${id}> carries no ${name}, so the document is a score and not an alignment`,
    );
  return value;
}

function readPedal(pedal: FitPedal): AlignedPedal {
  return {
    'xml:id': pedal.id,
    type: pedal.type,
    'milliseconds.date': pedal.date,
    'milliseconds.date.end': pedal.end,
    ...(pedal.source !== undefined && { source: pedal.source }),
  };
}

/** The first `<timeSignature>`, which is what the fitters read the beat grid off. */
function timeSignatureOf(root: Element): { numerator: number; denominator: number } | undefined {
  const element = descendants(root, 'timeSignature').at(0);
  if (element === undefined) return undefined;
  return {
    numerator: numeric(element, 'numerator', '<timeSignature>'),
    denominator: numeric(element, 'denominator', '<timeSignature>'),
  };
}

const descendants = (root: Element, name: string): Element[] =>
  descendantElements(root, (element) => element.getLocalName() === name);

function numeric(element: Element, name: string, where: string): number {
  const found = attribute(name, element);
  const value = found === null ? Number.NaN : Number(found.getValue());
  if (!Number.isFinite(value)) throw new ParseError(`MSM: ${where} carries no numeric @${name}`);
  return value;
}

// ---------------------------------------------------------------------------
// Option validation (RULE E4 — the domain, before the document is parsed)
// ---------------------------------------------------------------------------

function checkFitInput(input: FitInput): Checked {
  return andThen(
    requireOptionBag(input, 'input must be an object carrying at least `msm` and `chain`'),
    () => allOf(checkChain(input.chain), checkPedals(input.pedals), checkSources(input.sources)),
  );
}

function checkFitOptions(options: FitOptions | undefined): Checked {
  if (options === undefined) return accepted;
  return andThen(requireOptionBag(options, 'options must be an object'), () =>
    options.strict === undefined || typeof options.strict === 'boolean'
      ? accepted
      : rejected(`options.strict must be a boolean, got ${describeValue(options.strict)}`),
  );
}

function checkChain(chain: readonly FitCall[]): Checked {
  if (!Array.isArray(chain))
    return rejected(
      'chain must be an array of { id, name, options }; there is no default chain — ' +
        'listFitters() is the vocabulary a chain names',
    );
  return each(chain, checkCall);
}

function checkCall(call: FitCall, index: number): Checked {
  const where = `chain[${String(index)}]`;
  return andThen(requireOptionBag(call, `${where} must be an object`), () =>
    allOf(
      checkString(`${where}.id`, call.id),
      checkString(`${where}.name`, call.name),
      andThen(requireOptionBag(call.options, `${where}.options must be an object`), () =>
        Array.isArray(call.options)
          ? rejected(`${where}.options must be an object, got an array`)
          : each(Object.entries(call.options), ([key, value]) =>
              checkJson(`${where}.options.${key}`, value),
            ),
      ),
    ),
  );
}

/**
 * The one thing about a JSON option that is not a fact about JSON: an envelope claiming to be
 * a `Set` or a `Map` has to carry the array {@link revive} is about to read.
 */
function checkJson(where: string, value: JsonValue): Checked {
  if (Array.isArray(value))
    return each(value, (item, index) => checkJson(`${where}[${String(index)}]`, item));
  if (value === null || typeof value !== 'object') return accepted;

  const kind = value['dataType'];
  if ((kind === 'Set' || kind === 'Map') && !Array.isArray(value['value']))
    return rejected(`${where} is a ${kind} envelope whose \`value\` is not an array`);
  if (kind === 'Map' && !mapEntries(value['value']))
    return rejected(`${where} is a Map envelope whose \`value\` is not a list of [key, value]`);

  return each(Object.entries(value), ([key, item]) => checkJson(`${where}.${key}`, item));
}

function mapEntries(value: JsonValue | undefined): boolean {
  return Array.isArray(value) && value.every((entry) => Array.isArray(entry) && entry.length === 2);
}

function checkPedals(pedals: FitInput['pedals']): Checked {
  if (pedals === undefined) return accepted;
  if (!Array.isArray(pedals))
    return rejected('pedals must be an array of { id, type, date, end, source? }');
  return each(pedals, (pedal, index) => {
    const where = `pedals[${String(index)}]`;
    return andThen(requireOptionBag(pedal, `${where} must be an object`), () =>
      allOf(
        checkString(`${where}.id`, pedal.id),
        pedal.type === 'sustain' || pedal.type === 'soft'
          ? accepted
          : rejected(`${where}.type must be 'sustain' or 'soft', got ${describeValue(pedal.type)}`),
        checkFinite(`${where}.date`, pedal.date),
        checkFinite(`${where}.end`, pedal.end),
        checkOptionalString(`${where}.source`, pedal.source),
      ),
    );
  });
}

function checkSources(sources: FitInput['sources']): Checked {
  if (sources === undefined) return accepted;
  if (!Array.isArray(sources)) return rejected('sources must be an array of { id, source? }');
  return each(sources, (source, index) => {
    const where = `sources[${String(index)}]`;
    return andThen(requireOptionBag(source, `${where} must be an object`), () =>
      allOf(
        checkString(`${where}.id`, source.id),
        checkOptionalString(`${where}.source`, source.source),
      ),
    );
  });
}

function checkString(name: string, value: unknown): Checked {
  return typeof value === 'string'
    ? accepted
    : rejected(`${name} must be a string, got ${describeValue(value)}`);
}

function checkOptionalString(name: string, value: unknown): Checked {
  return value === undefined ? accepted : checkString(name, value);
}

function checkFinite(name: string, value: unknown): Checked {
  return Number.isFinite(value)
    ? accepted
    : rejected(`${name} must be a finite number, got ${describeValue(value)}`);
}

/** Every element must pass, and the first that does not is the one reported. */
function each<T>(items: readonly T[], check: (item: T, index: number) => Checked): Checked {
  return mapOk(traverse(items, check), () => undefined);
}
