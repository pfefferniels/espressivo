/**
 * The public facade: MEI ⇒ MSM+MPM ⇒ performed data / MIDI (ARCHITECTURE.md §2).
 *
 * Nothing in `src/` calls anything here; what this layer adds is a boundary:
 *
 * - **documents cross it as XML text** (RULE F2), which is what makes every other guarantee
 *   free: text is plain data, so inputs cannot be mutated (RULE I3a) and outputs are
 *   `structuredClone`-safe (RULE F1). No XomTypes type appears in any exported signature
 *   here, only in the module-private readers below;
 * - **document text is produced by `getRootElement().toXML()`** (RULE F2a), never
 *   `Document.toXML()`: the declaration-free form is the exact byte sequence the equivalence
 *   suite compares against the Java fixtures;
 * - **failures throw** (RULE E2). The interior logs and returns null, bug-for-bug with Java
 *   (RULE E1); every one of those nulls becomes a typed error here, and no function in this
 *   module returns `null`;
 * - **there is no file I/O and no process access** (RULE F4). Nothing here imports `fs`,
 *   `path` or `process`, and no function takes or returns a path.
 */
import { EventMaker } from '../midi/EventMaker.js';
import { Mei } from '../mei/Mei.js';
import { Mei2MsmMpmConverter } from '../mei/Mei2MsmMpmConverter.js';
import { Msm } from '../msm/Msm.js';
import { Mpm } from '../mpm/Mpm.js';
import type { Performance } from '../mpm/elements/Performance.js';
import type { RenderOptions } from '../mpm/RenderOptions.js';
import type { Midi7Bit, Milliseconds, Ticks } from '../units.js';
import type { Element } from '../xml/XomTypes.js';
import type { XmlBase } from '../xml/XmlBase.js';
import { allChildElements, attribute, firstChildElement, requireAttribute } from '../xml/tree.js';
import {
  EmptyDocumentError,
  InvalidOptionError,
  ParseError,
  PerformanceNotFoundError,
} from './errors.js';
import { parseOrThrow, requireXmlText, type DocumentKind } from './parse.js';
import {
  accepted,
  allOf,
  describeValue,
  orInvalidOption,
  rejected,
  type Checked,
} from './validate.js';
import type {
  ControlChangePoint,
  ControlChangeStream,
  ConvertOptions,
  MidiOptions,
  MovementDocuments,
  PerformanceData,
  PerformanceInfo,
  PerformOptions,
  PerformedNote,
  PerformedPart,
  XmlText,
} from './types.js';
import { groupBy } from '../prelude/seq.js';

/** The library version. It is serialization-visible — the converter writes it into MPM metadata. */
export { VERSION } from '../version.js';

// ---------------------------------------------------------------------------
// Input parsing. Everything below this line is module-private.
// ---------------------------------------------------------------------------

/**
 * Parse-and-check, shared by the three entry types. A document that did not parse is
 * indistinguishable from an empty one at the class API — `XmlBase` reports both as
 * `isEmpty()` — so both land on the same error here.
 */
function checkParsed(doc: XmlBase, kind: DocumentKind, rootName: string): void {
  if (doc.isEmpty()) throw new ParseError(`${kind}: the input is not well-formed XML`);

  const root = doc.getRootElement();
  if (root === null || root.getLocalName() !== rootName)
    throw new ParseError(
      `${kind}: expected a <${rootName}> root element, found <${root === null ? 'nothing' : root.getLocalName()}>`,
    );
}

function parseMei(mei: XmlText): Mei {
  requireXmlText('MEI', mei);
  const doc = parseOrThrow('MEI', () => Mei.fromXml(mei));
  checkParsed(doc, 'MEI', 'mei');
  return doc;
}

function parseMsm(msm: XmlText): Msm {
  requireXmlText('MSM', msm);
  const doc = parseOrThrow('MSM', () => new Msm(msm));
  checkParsed(doc, 'MSM', 'msm');
  return doc;
}

function parseMpm(mpm: XmlText): Mpm {
  requireXmlText('MPM', mpm);
  const doc = parseOrThrow('MPM', () => new Mpm(mpm));
  checkParsed(doc, 'MPM', 'mpm');
  return doc;
}

/** RULE F2a: the declaration-free serialization, which is what the fixtures are compared as. */
function serialize(doc: XmlBase, kind: DocumentKind): XmlText {
  const root = doc.getRootElement();
  if (root === null) throw new EmptyDocumentError(`${kind}: nothing to serialize`);
  return root.toXML();
}

// ---------------------------------------------------------------------------
// Option validation (RULE E2's InvalidOptionError)
// ---------------------------------------------------------------------------

function checkConvertOptions(options: ConvertOptions | undefined): Checked {
  if (options === undefined) return accepted;
  return allOf(
    options.ppq === undefined || (Number.isInteger(options.ppq) && options.ppq > 0)
      ? accepted
      : rejected(`ppq must be a positive integer, got ${String(options.ppq)}`),
    checkSourceName(options.sourceName),
  );
}

/** A non-blank label. Absent and blank are different answers; only the second is a mistake. */
function checkSourceName(sourceName: string | undefined): Checked {
  if (sourceName === undefined) return accepted;
  // `.trim()` is a member read, so being a string is this check's readability row (RULE E4).
  // `setFile` writes the value into the document, so nothing downstream re-establishes it.
  if (typeof sourceName !== 'string')
    return rejected(`sourceName must be a string, got ${describeValue(sourceName)}`);
  return sourceName.trim() !== ''
    ? accepted
    : rejected('sourceName must be a non-empty name; omit it for the file-less variant');
}

function checkPerformOptions(options: PerformOptions | undefined): Checked {
  if (options === undefined) return accepted;
  return allOf(
    options.seed === undefined || Number.isFinite(options.seed)
      ? accepted
      : rejected(`seed must be a finite number, got ${String(options.seed)}`),
    options.movementSampleMaxStep === undefined ||
      (Number.isFinite(options.movementSampleMaxStep) && options.movementSampleMaxStep > 0)
      ? accepted
      : rejected(
          `movementSampleMaxStep must be a positive finite number, got ${String(options.movementSampleMaxStep)}` +
            ' — the movement subdivision compares against it and never terminates at zero',
        ),
    // Checked rather than coerced: the flag reaches `OrnamentationMap` through `??`, so a
    // truthy non-boolean from an untyped caller ('false', 'no') expands what was meant to be
    // suppressed.
    checkOrnamentFlag(options.expandOrnaments),
  );
}

/** Anti-coercion for the render-side ornament flag; see RULE E4's named exceptions. */
function checkOrnamentFlag(expandOrnaments: boolean | undefined): Checked {
  return expandOrnaments === undefined || typeof expandOrnaments === 'boolean'
    ? accepted
    : rejected(`expandOrnaments must be a boolean, got ${String(expandOrnaments)}`);
}

/** The interior's own options object (§2.4). Defaults are resolved inside `src/mpm/`, not here. */
function toRenderOptions(options: PerformOptions | undefined): RenderOptions {
  orInvalidOption(checkPerformOptions(options));
  return {
    seed: options?.seed,
    movementSampleMaxStep: options?.movementSampleMaxStep,
    expandOrnaments: options?.expandOrnaments,
  };
}

function selectPerformance(mpm: Mpm, which: string | number | undefined): Performance {
  const selector = which ?? 0;

  if (typeof selector === 'number') {
    if (!Number.isInteger(selector) || selector < 0)
      throw new InvalidOptionError(
        `performance index must be a non-negative integer, got ${String(selector)}`,
      );
    const byIndex = mpm.getPerformance(selector);
    if (byIndex === null)
      throw new PerformanceNotFoundError(
        `MPM: no performance at index ${selector}; the document has ${mpm.size()}`,
      );
    return byIndex;
  }

  const byName = mpm.getPerformanceByName(selector);
  if (byName === null)
    throw new PerformanceNotFoundError(`MPM: no performance named '${selector}'`);
  return byName;
}

// ---------------------------------------------------------------------------
// Reading an augmented MSM (§2.3). XomTypes types appear here and nowhere else.
// ---------------------------------------------------------------------------

/**
 * A numeric attribute the MSM must carry. Absent → `MissingNodeError` from the `require*`
 * accessor; present but unparseable → `ParseError`. Never `NaN`: `JSON.stringify` turns that
 * into `null` and the value would not survive RULE F1's round trip.
 */
function requiredNumber(name: string, e: Element): number {
  const raw = requireAttribute(name, e).getValue();
  const value = parseFloat(raw);
  if (!Number.isFinite(value))
    throw new ParseError(
      `MSM: attribute '${name}' of <${e.getLocalName()}> is not a number: '${raw}'`,
    );
  return value;
}

/** A numeric attribute that may be absent. `null` for absent or unparseable — never `NaN`. */
function optionalNumber(name: string, e: Element): number | null {
  const a = attribute(name, e);
  if (a === null) return null;
  const value = parseFloat(a.getValue());
  return Number.isFinite(value) ? value : null;
}

/** A string attribute that may be absent, as RULE N4 wants it: absence spelled `null`. */
function optionalString(name: string, e: Element): string | null {
  const a = attribute(name, e);
  return a === null ? null : a.getValue();
}

/**
 * Every `ornament.*` attribute the ornamentation renderer can leave on a `<note>` — the
 * complete evidence behind {@link PerformedNote.ornamented}.
 *
 * Enumerated rather than matched by prefix because `Element` offers no way to iterate an
 * element's attributes, and because a closed list is what a reader can check against the
 * five writers.
 *
 * - `ornament.dynamics` — `DynamicsGradient.apply`, the velocity offset.
 * - `ornament.date.offset` / `ornament.duration` — `TemporalSpread.apply` in the tick domain,
 *   folded into `date.perf` / `duration.perf` by `OrnamentationMap`'s second pass.
 * - `ornament.milliseconds.date.offset` / `ornament.milliseconds.duration` — the same pair in
 *   the millisecond domain, folded by the third pass.
 * - `ornament.noteoff.shift` — `TemporalSpread.apply` and the v3 renderer, on the notes whose
 *   note-off travels with their onset.
 * - `ornament.milliseconds.fromend.offset` — the v3 renderer's end-anchored millisecond
 *   marker, the one branch MPM v3 adds to the third pass.
 * - `ornament.carved` — the v3 renderer's `carve`, on the head leftover: the surviving
 *   principal of an end-aligned ornament, shortened so the generated notes fit after it. It is
 *   the one alteration v3 makes to a note the score already had, which is why this list is not
 *   simply "the markers a *generated* note carries" (D10/D15).
 * - the last six — the v3 renderer's provenance stamp on a generated note.
 *
 * Read here rather than into an ornament-shaped mirror of the notes: §2's rule against a
 * second representation applies to ornaments as much as to notes.
 */
const ORNAMENT_MARKER_ATTRIBUTES: readonly string[] = [
  'ornament.dynamics',
  'ornament.date.offset',
  'ornament.duration',
  'ornament.noteoff.shift',
  'ornament.milliseconds.date.offset',
  'ornament.milliseconds.duration',
  'ornament.milliseconds.fromend.offset',
  'ornament.carved',
  'ornament.generated',
  'ornament.ref',
  'ornament.source',
  'ornament.slot',
  'ornament.pass',
  'ornament.anchor',
];

/** The parts of an MSM, in document order — the order that decides MIDI track order. */
function partElements(msm: Msm): Element[] {
  const root = msm.getRootElement();
  return root === null ? [] : allChildElements(root, 'part');
}

/** `<part><dated><score><note>`, guarded exactly as `Msm.processScore` guards it. */
function noteElements(part: Element): Element[] {
  const dated = firstChildElement('dated', part);
  if (dated === null) return [];
  const score = firstChildElement('score', dated);
  if (score === null) return [];
  return allChildElements(score, 'note');
}

function readNote(note: Element): PerformedNote {
  const date = requiredNumber('date', note);
  const duration = requiredNumber('duration', note);

  // The three fallbacks are the interior's own, not repairs of it (RULE E3): an unperformed
  // note reads its milliseconds date from `date` (`Msm.readMillisecondsDateFromElement`), its
  // end from date + duration and its velocity as 100 (`Msm.processScore`). Unlike the MIDI
  // renderer nothing is rounded here — the MSM's own values are what a consumer asked for.
  const msDate = optionalNumber('milliseconds.date', note) ?? date;
  const msEnd = optionalNumber('milliseconds.date.end', note) ?? msDate + duration;

  const id = attribute('id', note);

  return {
    id: id === null ? null : id.getValue(),
    pitch: requiredNumber('midi.pitch', note) as Midi7Bit,
    date: date as Ticks,
    duration: duration as Ticks,
    velocity: (optionalNumber('velocity', note) ?? 100) as Midi7Bit,
    milliseconds: { date: msDate as Milliseconds, end: msEnd as Milliseconds },
    ornamented: ORNAMENT_MARKER_ATTRIBUTES.some((name) => attribute(name, note) !== null),
    ornamentRef: optionalString('ornament.ref', note),
    ornamentSource: optionalString('ornament.source', note),
    // `optionalNumber` rather than a parse of the raw text: the renderer writes plain
    // integers, and a hand-edited MSM that writes something else reports null rather than the
    // `NaN` that would not survive RULE F1's JSON round trip.
    ornamentSlot: optionalNumber('ornament.slot', note),
    ornamentPass: optionalNumber('ornament.pass', note),
    ornamentAnchor: optionalString('ornament.anchor', note),
  };
}

function readControlChangePoint(e: Element): ControlChangePoint {
  const date = requiredNumber('date', e);
  return {
    date: date as Ticks,
    milliseconds: (optionalNumber('milliseconds.date', e) ?? date) as Milliseconds,
    value: requiredNumber('value', e) as Midi7Bit,
  };
}

/** `sustain` → 64, `soft` → 67, anything else → 0. Mirrors `Msm.parsePositionMap`. */
function ccNumberOf(controller: string | null): number {
  if (controller === 'sustain') return EventMaker.CC_Damper_Pedal;
  if (controller === 'soft') return EventMaker.CC_Soft_Pedal;
  return 0;
}

/**
 * The part's control-change streams: sub-note dynamics from the `channelVolumeMap`, movement
 * (pedalling) from the `positionMap`.
 *
 * Two readings §2 leaves open, decided here. A `positionMap` may mix controllers while a
 * stream carries exactly one, so entries are grouped by their `controller` value in
 * first-appearance order. And a map with no entries yields no stream at all rather than an
 * empty one. The entries are reported as the MSM holds them, in document order: the
 * `CONTROL_CHANGE_DENSITY` thinning that `Msm.parseChannelVolumeMap` applies belongs to MIDI
 * event generation, not to the data.
 */
function readControlChanges(part: Element): ControlChangeStream[] {
  const dated = firstChildElement('dated', part);
  if (dated === null) return [];

  const streams: ControlChangeStream[] = [];

  const volumeMap = firstChildElement('channelVolumeMap', dated);
  if (volumeMap !== null) {
    const points = allChildElements(volumeMap, 'volume').map(readControlChangePoint);
    if (points.length > 0)
      streams.push({
        kind: 'channelVolume',
        controller: null,
        ccNumber: EventMaker.CC_Channel_Volume,
        points,
      });
  }

  const positionMap = firstChildElement('positionMap', dated);
  if (positionMap !== null) {
    // Read every position FIRST, in document order, and only then bucket by controller.
    // `readControlChangePoint` goes through `requiredNumber`, which THROWS a `ParseError`
    // naming the offending attribute; so on a `<positionMap>` with two malformed positions
    // under different controllers, the order the positions are read in decides which error the
    // caller sees, and RULE E2 makes that message part of the contract.
    //
    // Both orders `groupBy` guarantees are load-bearing here: points within a stream stay in
    // document order, and the streams come out in first-appearance order of their controller,
    // which is what the docstring above pins.
    const positions = allChildElements(positionMap, 'position').map((position) => ({
      controller: attribute('controller', position)?.getValue() ?? null,
      point: readControlChangePoint(position),
    }));
    for (const [controller, group] of groupBy(positions, (entry) => entry.controller))
      streams.push({
        kind: 'position',
        controller,
        ccNumber: ccNumberOf(controller),
        points: group.map((entry) => entry.point),
      });
  }

  return streams;
}

function readPart(part: Element, index: number): PerformedPart {
  const name = attribute('name', part);
  return {
    index,
    name: name === null ? null : name.getValue(),
    midiChannel: optionalNumber('midi.channel', part),
    midiPort: optionalNumber('midi.port', part),
    notes: noteElements(part).map(readNote),
    controlChanges: readControlChanges(part),
  };
}

/** RULE E3's test: an MSM nobody performed has `milliseconds.date` on no note at all. */
function isPerformed(msm: Msm): boolean {
  for (const part of partElements(msm))
    for (const note of noteElements(part))
      if (attribute('milliseconds.date', note) !== null) return true;
  return false;
}

/**
 * The shared reader behind {@link extractPerformanceData} and {@link performMsmToData}, so
 * the two cannot drift: one goes through a serialize/re-parse round trip and the other does
 * not, and they must produce the same value.
 */
function readPerformanceData(msm: Msm): PerformanceData {
  if (!isPerformed(msm))
    throw new EmptyDocumentError(
      'MSM: this MSM carries no performance attributes; call performMsm first',
    );

  return {
    title: msm.getTitle(),
    ppq: msm.getPPQ() as Ticks,
    parts: partElements(msm).map(readPart),
  };
}

// ---------------------------------------------------------------------------
// The facade
// ---------------------------------------------------------------------------

/**
 * MEI ⇒ one MSM per `mdiv`, in the converter's movement order.
 *
 * The performance is not derived here: espressivo applies an MPM that comes from outside, and
 * a score's own markings are not one. See PARITY.md §9.
 *
 * @throws {ParseError} the text is not a well-formed `<mei>` document
 * @throws {EmptyDocumentError} the MEI holds no convertible movement
 * @throws {InvalidOptionError} `ppq` is not a positive integer, or `sourceName` is blank
 */
export function convertMeiToMsm(
  mei: XmlText,
  options?: ConvertOptions,
): readonly MovementDocuments[] {
  orInvalidOption(checkConvertOptions(options));

  const document = parseMei(mei);
  // `sourceName` is the file name the class API would have derived from a path. An MEI with no
  // `<title>` titles its movement from it, so it reaches `<msm title>` and is output-visible.
  if (options?.sourceName !== undefined) document.setFile(options.sourceName);

  const msms = new Mei2MsmMpmConverter(
    options?.ppq ?? 720,
    options?.dontUseChannel10 ?? true,
    options?.ignoreExpansions ?? false,
    options?.cleanup ?? true,
  ).convert(document);

  if (msms.length === 0)
    throw new EmptyDocumentError('MEI: no convertible movement (mdiv) in this document');

  return msms.map((msm, index) => ({
    index,
    title: msm.getTitle(),
    msm: serialize(msm, 'MSM'),
  }));
}

/**
 * The performances an MPM offers, so a caller can pick one by name.
 *
 * @throws {ParseError} the text is not a well-formed `<mpm>` document
 */
export function listPerformances(mpm: XmlText): readonly PerformanceInfo[] {
  return parseMpm(mpm)
    .getAllPerformances()
    .map((performance, index) => ({
      index,
      name: performance.getName(),
      ppq: performance.getPulsesPerQuarter(),
    }));
}

/**
 * Apply an MPM performance to an MSM. Returns the augmented (performed) MSM as text.
 *
 * The input MSM is not touched: the interior performs on a clone (`Performance.perform`
 * opens with `msm.clone()`), and the caller's value is a string anyway (RULE I3a).
 *
 * @throws {ParseError} either input is not well-formed, or has the wrong root element
 * @throws {PerformanceNotFoundError} `options.performance` names/indexes nothing
 * @throws {InvalidOptionError} a non-finite `seed`, a non-positive `movementSampleMaxStep`,
 *   or a performance index that is not a non-negative integer
 */
export function performMsm(
  input: { readonly msm: XmlText; readonly mpm: XmlText },
  options?: PerformOptions,
): XmlText {
  const msm = parseMsm(input.msm);
  const mpm = parseMpm(input.mpm);
  const renderOptions = toRenderOptions(options);
  const performance = selectPerformance(mpm, options?.performance);

  return serialize(performance.perform(msm, renderOptions), 'MSM');
}

/**
 * Read the performance data out of an already-augmented MSM.
 *
 * @throws {ParseError} the text is not a well-formed `<msm>` document, or a required numeric
 *   attribute does not parse
 * @throws {EmptyDocumentError} no note in the document carries `milliseconds.date`, i.e. this
 *   MSM was never performed (RULE E3)
 * @throws {MissingNodeError} a `<note>` lacks `date`, `duration` or `midi.pitch`
 */
export function extractPerformanceData(augmentedMsm: XmlText): PerformanceData {
  return readPerformanceData(parseMsm(augmentedMsm));
}

/**
 * The batch path: MSM+MPM in, plain per-note data out. One parse, no file I/O.
 *
 * Equivalent to `extractPerformanceData(performMsm(input, options))` and deliberately tested
 * as such — it just skips the serialize/re-parse in between.
 *
 * @throws {ParseError} either input is not well-formed, or has the wrong root element
 * @throws {PerformanceNotFoundError} `options.performance` names/indexes nothing
 * @throws {InvalidOptionError} see {@link performMsm}
 */
export function performMsmToData(
  input: { readonly msm: XmlText; readonly mpm: XmlText },
  options?: PerformOptions,
): PerformanceData {
  const msm = parseMsm(input.msm);
  const mpm = parseMpm(input.mpm);
  const renderOptions = toRenderOptions(options);
  const performance = selectPerformance(mpm, options?.performance);

  return readPerformanceData(performance.perform(msm, renderOptions));
}

/**
 * The score as written: symbolic timing, one tempo event, a fixed velocity of 100.
 *
 * @throws {ParseError} the text is not a well-formed `<msm>` document
 * @throws {EmptyDocumentError} the MSM is empty, so there is no MIDI to write
 * @throws {InvalidOptionError} `bpm` is not a positive finite number
 */
export function renderMidi(
  input: { readonly msm: XmlText },
  options?: MidiOptions & { readonly bpm?: number },
): Uint8Array {
  orInvalidOption(
    options?.bpm === undefined || (Number.isFinite(options.bpm) && options.bpm > 0)
      ? accepted
      : rejected(`bpm must be a positive finite number, got ${String(options.bpm)}`),
  );

  const msm = parseMsm(input.msm);
  const midi = msm.exportMidi(options?.bpm ?? 120, options?.generateProgramChanges ?? true);
  if (midi === null) throw new EmptyDocumentError('MSM: nothing to render');

  // No guard on the bytes: `Midi.exportMidi` is total. The `midi === null` check above is a
  // different matter — `Msm.exportMidi` really can decline.
  return midi.exportMidi();
}

/**
 * The score as performed: millisecond timing, dynamics, articulation, CC streams.
 *
 * With `mpm` omitted the MSM is rendered as it stands and must already carry the performance
 * attributes — mirroring `Msm.exportExpressiveMidi`'s own no-performance path. Nothing is
 * performed on that path, so `PerformOptions` fields have nothing to act on and passing one
 * is an error rather than a silent no-op. `generateProgramChanges` is likewise inert there:
 * the interior hard-codes `true` when no performance is given (Java `Msm.java:667`), and
 * that behaviour is reproduced rather than corrected.
 *
 * @throws {ParseError} either input is not well-formed, or has the wrong root element
 * @throws {EmptyDocumentError} the MSM is empty, or — with `mpm` omitted — carries no
 *   performance attributes (RULE E3)
 * @throws {PerformanceNotFoundError} `options.performance` names/indexes nothing
 * @throws {InvalidOptionError} an out-of-domain option, or a `PerformOptions` field with
 *   `mpm` omitted
 */
export function renderExpressiveMidi(
  input: { readonly msm: XmlText; readonly mpm?: XmlText },
  options?: PerformOptions & MidiOptions,
): Uint8Array {
  const generateProgramChanges = options?.generateProgramChanges ?? true;
  const msm = parseMsm(input.msm);

  let midi;
  if (input.mpm === undefined) {
    orInvalidOption(
      allOf(
        ...(['performance', 'seed', 'movementSampleMaxStep', 'expandOrnaments'] as const).map(
          (field) =>
            options?.[field] === undefined
              ? accepted
              : rejected(
                  `${field} has no effect without an MPM: with no performance to apply, the MSM is rendered as it stands`,
                ),
        ),
      ),
    );

    if (!isPerformed(msm))
      throw new EmptyDocumentError(
        'MSM: this MSM carries no performance attributes; pass an MPM or call performMsm first',
      );

    midi = msm.exportExpressiveMidi();
  } else {
    const mpm = parseMpm(input.mpm);
    const renderOptions = toRenderOptions(options);
    const performance = selectPerformance(mpm, options?.performance);

    midi = msm.exportExpressiveMidi(performance, generateProgramChanges, renderOptions);
  }

  if (midi === null) throw new EmptyDocumentError('MSM: nothing to render');

  // No guard on the bytes: `Midi.exportMidi` is total. The `midi === null` check above is a
  // different matter — `Msm.exportMidi` really can decline.
  return midi.exportMidi();
}
