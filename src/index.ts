// meico - MEI Converter (TypeScript port)
//
// Scope: MEI / MSM+MPM => expressive MIDI. Format conversions (MusicXML,
// MIDI->MSM, MEI->MusicXML), audio, playback, chroma/pitches and SVG were
// removed in T3 as out of scope; see refactor/log.md.

import type { Element } from './xml/XomTypes.js';
import {
  allChildElements,
  attribute,
  cloneElement,
  firstChildElement,
  getAllDescendantsByName,
  getAllDescendantsWithAttribute,
  getAllPreviousSiblingElements,
  getAttributeValue,
  getClosest,
  getClosestByAttr,
  getNextSiblingElement,
  getPreviousSiblingElement,
  parentElement,
} from './xml/tree.js';
import { addToListAttribute, addUUID, copyId, copyIdNoNs } from './xml/ids.js';
import { prettyXml } from './xml/prettyPrint.js';
import {
  accidDecimal2String,
  accidDecimal2unicodeString,
  accidString2decimal,
  accidString2word,
  midi2PnameAccidOct,
  midi2PnameAndAccid,
  midi2pname,
  pname2midi,
} from './music/pitch.js';
import {
  decimalDuration2HtmlUnicode,
  duration2decimal,
  duration2word,
  pulseDuration2decimal,
} from './music/duration.js';
import { extractAllIntegersFromString, getFilenameWithoutExtension } from './music/text.js';
import { addToMap } from './msm/dateMap.js';
import { updateMpmNoteidsAfterResolvingRepetitions } from './mei/mpmNoteIds.js';
import { VERSION } from './version.js';

// The public facade (T13, ARCHITECTURE.md §2): plain data in, plain data out.
//
// Additive — everything below this block is exactly what it was. The facade is listed
// member by member rather than star-exported because `./api/index.js` re-exports
// `MeicoError`/`MissingNodeError`, which this file already exports from `./xml/errors.js`,
// and two star exports of one name are ambiguous. `src/api/index.ts` is the one-import
// entry point for consumers who only want the facade.
export {
  convertMeiToMsmMpm,
  listPerformances,
  performMsm,
  extractPerformanceData,
  performMsmToData,
  renderMidi,
  renderExpressiveMidi,
} from './api/pipeline.js';
export { exaggerateMpm, canonicalMpm, EXPRESSION_DIMENSIONS } from './api/expression.js';
export {
  ParseError,
  EmptyDocumentError,
  PerformanceNotFoundError,
  InvalidOptionError,
  EngineInvariantError,
} from './api/errors.js';
export type {
  XmlText,
  ConvertOptions,
  MovementDocuments,
  PerformanceInfo,
  PerformOptions,
  MidiOptions,
  PerformedNote,
  ControlChangeKind,
  ControlChangePoint,
  ControlChangeStream,
  PerformedPart,
  PerformanceData,
  ExaggerateOptions,
  ExaggerationResult,
  ExaggerationFactors,
  ExpressionDimension,
  ExaggerationScope,
  CenterOverrides,
  VelocityRange,
  ExaggerationReport,
  PerformanceReport,
  PerformanceBounds,
  DimensionReport,
  MsmDependentEstimates,
  VelocityCoefficients,
  ReportNote,
  ReportNoteKind,
  SiteRef,
  SiteState,
} from './api/types.js';

// The compile-time units the facade's output types are branded with (RULE U1/U3(a)).
// Type-only: `src/units.ts` compiles to `export {};` and these erase completely.
export type { Ticks, Milliseconds, Normalized, Midi7Bit, Bpm } from './units.js';

// Core XML types
export {
  Element,
  Document,
  Attribute,
  Nodes,
  Elements,
  Text,
  Builder,
  ParsingException,
  ValidityException,
} from './xml/XomTypes.js';
export { XmlBase } from './xml/XmlBase.js';
export type { ValidationResult } from './xml/XmlBase.js';
export { AbstractXmlSubtree } from './xml/AbstractXmlSubtree.js';
export { MeicoError, MissingNodeError } from './xml/errors.js';

// The modules T14 split `mei/Helper` into (ARCHITECTURE.md §8.2). These are the API;
// the `Helper` object at the bottom of this file is the compatibility shim.
export * from './xml/tree.js';
export * from './xml/ids.js';
export * from './xml/prettyPrint.js';
export * from './music/pitch.js';
export * from './music/duration.js';
export * from './music/text.js';
export * from './msm/dateMap.js';
export * from './mei/mpmNoteIds.js';

// MEI
export { Mei } from './mei/Mei.js';
export { Mei2MsmMpmConverter } from './mei/Mei2MsmMpmConverter.js';

// MSM
export { AbstractMsm } from './msm/AbstractMsm.js';
export { Msm } from './msm/Msm.js';
export { Goto } from './msm/Goto.js';

// MPM
export { Mpm } from './mpm/Mpm.js';

// MIDI
export { Midi } from './midi/Midi.js';
export { EventMaker } from './midi/EventMaker.js';
export { InstrumentsDictionary } from './midi/InstrumentsDictionary.js';

// Supplementary
export { KeyValue } from './supplementary/KeyValue.js';
export { RandomNumberProvider } from './supplementary/RandomNumberProvider.js';

// Version. `Meico` was a class carrying a single static; RULE M6 turned it into the constant
// `VERSION` and keeps this object so `Meico.version` still resolves for existing callers.
export { VERSION } from './version.js';
export const Meico = { version: VERSION } as const;

/**
 * `Helper.getAllChildElements` as it was before RULE N2b narrowed the module function:
 * name-first overload, `Element[] | null` return, both guards. The narrowing is real and
 * deliberate — this wrapper exists so it is not also an API break for callers of the
 * {@link Helper} shim.
 */
function helperGetAllChildElements(name: string, ofThis: Element): Element[] | null;
function helperGetAllChildElements(ofThis: Element): Element[] | null;
function helperGetAllChildElements(
  arg1: string | Element | null,
  arg2?: Element | null,
): Element[] | null {
  if (arg1 === null || arg1 === undefined) return null;

  if (typeof arg1 === 'string') {
    const ofThis = arg2 as Element | null;
    if (ofThis == null || arg1 === '') return null;
    return allChildElements(ofThis, arg1);
  }
  return allChildElements(arg1);
}

/**
 * Compatibility shim for the dissolved `mei/Helper` class (ARCHITECTURE.md RULE M2, §8.2).
 *
 * 34 of `Helper`'s 41 public statics are here under their original name, delegating to
 * the module function they moved to, so code written against the published API keeps working.
 * New code should import from `xml/tree.js`, `xml/ids.js`, `music/*.js` and friends directly
 * — T22 marks this object deprecated.
 *
 * The missing 7 are the XSLT / schema-validation / file-write members that lived in
 * `compat/unsupported.js`. T21 deleted them per ARCHITECTURE.md §8.10: every one was a stub
 * that logged and returned `null`/`false`/nothing, and the file-write path additionally used
 * `require()`, which is not defined in this ESM build. They could not do their job in any
 * environment this package ships to, so keeping their names was a promise the port could not
 * keep.
 *
 * Four members changed shape in the move and the shim absorbs the difference:
 * `getFirstChildElement`, `getAttribute` and `getParentElement` were renamed
 * (`firstChildElement`, `attribute`, `parentElement`), and `getAllChildElements` was narrowed
 * by RULE N2b — see {@link helperGetAllChildElements}.
 */
export const Helper = {
  // xml/tree.js
  getFirstChildElement: firstChildElement,
  getAllChildElements: helperGetAllChildElements,
  getAllDescendantsByName,
  getAllDescendantsWithAttribute,
  getNextSiblingElement,
  getPreviousSiblingElement,
  getAllPreviousSiblingElements,
  cloneElement,
  getAttribute: attribute,
  getAttributeValue,
  getParentElement: parentElement,
  getClosest,
  getClosestByAttr,
  // xml/ids.js
  addUUID,
  copyId,
  copyIdNoNs,
  addToListAttribute,
  // xml/prettyPrint.js
  prettyXml,
  // msm/dateMap.js
  addToMap,
  // music/text.js
  extractAllIntegersFromString,
  getFilenameWithoutExtension,
  // music/duration.js
  duration2decimal,
  duration2word,
  pulseDuration2decimal,
  decimalDuration2HtmlUnicode,
  // music/pitch.js
  accidString2decimal,
  accidDecimal2String,
  accidString2word,
  accidDecimal2unicodeString,
  pname2midi,
  midi2pname,
  midi2PnameAndAccid,
  midi2PnameAccidOct,
  // mei/mpmNoteIds.js
  updateMpmNoteidsAfterResolvingRepetitions,
} as const;
