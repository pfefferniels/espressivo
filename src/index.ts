// meico - MEI Converter (TypeScript port)
//
// Scope: MEI / MSM+MPM => expressive MIDI. Format conversions (MusicXML,
// MIDI->MSM, MEI->MusicXML), audio, playback, chroma/pitches and SVG are out
// of scope; see docs/history/refactor/log.md.

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

// The public facade (ARCHITECTURE.md §2): plain data in, plain data out.
//
// Listed member by member rather than star-exported because `./api/index.js` re-exports
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
export {
  exaggerateMpm,
  spotlightMpm,
  canonicalMpm,
  weightedFactors,
  EXPRESSION_DIMENSIONS,
  PROTOTYPE_WEIGHTS,
} from './api/expression.js';
export {
  ParseError,
  EmptyDocumentError,
  PerformanceNotFoundError,
  InvalidOptionError,
  SelectionNotFoundError,
  EngineInvariantError,
  ComparisonEngineError,
} from './api/errors.js';
// The comparison facade (comparison/DESIGN.md §9.7). Member by member for the reason the two
// above are.
export {
  compareMpm,
  compareMpmCorpus,
  diffMpm,
  neutralMpm,
  scapeIndex,
  SCAPE_MAX_BINS,
  COMPARISON_DIMENSIONS,
  COMPARISON_JND_KEYS,
  EXPRESSION_DIMENSION_CORRESPONDENCE,
} from './api/comparison.js';
export type {
  CompareMpmOptions,
  CompareCorpusOptions,
  DiffMpmOptions,
  ComparisonSettings,
  ComparisonDimension,
  ComparisonJndKey,
  ComparisonUnit,
  InvarianceMode,
  MetricGuarantee,
  WindowRule,
  AttributionTable,
  ComparisonInputs,
  ComparisonNote,
  ComparisonNoteKind,
  ComparisonProfile,
  ComparisonReport,
  ComparisonResult,
  ComparisonSegment,
  ComparisonSiteRef,
  CorpusReport,
  CorpusResult,
  Decomposition,
  DiffReport,
  DiffResult,
  DimensionComparison,
  DimensionState,
  EditOp,
  EditOpAttribute,
  EditScript,
  EpsilonFamily,
  MeasureEntry,
  MeasurePosition,
  ResolvedComparisonSettings,
  TimeSignatureSource,
} from './api/comparison.js';
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
  SpotlightOptions,
  SpotlightResult,
  SpotlightSelection,
  ExaggerationFactors,
  ExaggerationWeights,
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

// The modules `mei/Helper` was split into (ARCHITECTURE.md §8.2). These are the API;
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
export type { StaffProvenance } from './mei/Mei.js';
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
export type { KeyValue } from './supplementary/KeyValue.js';
export { RandomNumberProvider } from './supplementary/RandomNumberProvider.js';

// Version. RULE M6 makes `VERSION` the API; the `Meico` object keeps `Meico.version`
// resolving for existing callers.
export { VERSION } from './version.js';
export const Meico = { version: VERSION } as const;

/**
 * `Helper.getAllChildElements` as the shim promises it: name-first overload,
 * `Element[] | null` return, both guards. The module function it delegates to is narrower
 * (RULE N2b); this wrapper keeps that narrowing from being an API break for callers of the
 * {@link Helper} shim.
 *
 * **This is the one overload set the lean pass deliberately left standing, and it is the
 * exception that states the rule.** Every other overload in `src/` whose arms shared a return
 * type was split into separately-named functions, on the grounds that such a set discriminates
 * nothing and only hides which of two behaviours a call selects. That argument does not reach
 * here, because reproducing a signature IS this function's entire job: it exists to keep a
 * deprecated shim's published shape after the module function beneath it changed. Splitting it
 * would break exactly the callers it was written to protect, which is why it is a private
 * wrapper reachable only through {@link Helper} rather than an exported function. It goes when
 * the shim goes (T22).
 */
function helperGetAllChildElements(name: string, ofThis: Element): Element[] | null;
function helperGetAllChildElements(ofThis: Element): Element[] | null;
function helperGetAllChildElements(
  // `undefined` belongs in the IMPLEMENTATION signature and in neither overload: an untyped
  // caller reaching the shim can pass it, and the guard below is what turns that into `null`
  // rather than a `TypeError` from `allChildElements`. Declaring it is what makes the guard
  // legal rather than a condition "the types have no overlap" with.
  arg1: string | Element | null | undefined,
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
 * Deprecated. 34 of `Helper`'s 41 public statics are here under their original name,
 * delegating to the module function they moved to, so code written against the published API
 * keeps working; new code imports from `xml/tree.js`, `xml/ids.js`, `music/*.js` and friends
 * directly. The missing 7 are the XSLT / schema-validation / file-write members, which could
 * not do their job in any environment this package ships to (ARCHITECTURE.md §8.10).
 *
 * Four members changed shape in the move and the shim absorbs the difference:
 * `getFirstChildElement`, `getAttribute` and `getParentElement` were renamed
 * (`firstChildElement`, `attribute`, `parentElement`), and `getAllChildElements` was narrowed
 * by RULE N2b — see {@link helperGetAllChildElements}.
 *
 * Three members lost a second argument order when the lean pass split `firstChildElement`,
 * `getNextSiblingElement` and `getPreviousSiblingElement` into separately-named functions.
 * The shim keeps the `(name, ofThis)` form of each, which is the order Java's own `Helper`
 * declares, so what it publishes is if anything closer to the original than the overload pair
 * was. Callers wanting the port's added subject-first forms want `firstChildElementOf`,
 * `immediateNextSiblingElement` and `immediatePreviousSiblingElement`, all exported directly
 * — and should note that the two sibling forms are NOT the named ones with the filter
 * removed; see `xml/tree.ts` and `tests/xml/overloadArmDifferences.test.ts`.
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
