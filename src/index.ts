// meico - MEI Converter (TypeScript port)
//
// Scope: MEI / MSM+MPM => expressive MIDI. Format conversions (MusicXML,
// MIDI->MSM, MEI->MusicXML), audio, playback, chroma/pitches and SVG are out
// of scope.

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
  convertMeiToMsm,
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
// The comparison facade. Member by member for the reason the two above are.
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
export { Mei2MsmConverter } from './mei/Mei2MsmConverter.js';

// MSM
export { AbstractMsm } from './msm/AbstractMsm.js';
export { Msm } from './msm/Msm.js';
export { Goto } from './msm/Goto.js';
// The vocabulary the writing surface's signatures are typed in. The functions themselves stay
// where `Msm` publishes them, so there is one name per element factory and not two.
export type {
  AddNoteOptions,
  AddPartOptions,
  AddPedalOptions,
  AddProgramChangeOptions,
  AddRestOptions,
  AddSectionOptions,
  AddTimeSignatureOptions,
  MsmMapName,
  PedalState,
} from './msm/write.js';

// MPM
export { Mpm } from './mpm/Mpm.js';

// ---------------------------------------------------------------------------
// The MPM object model — reading a performance as a document (docs/reading.md)
// ---------------------------------------------------------------------------
//
// `Mpm` alone was not a usable reading API. Every navigation step off it —
// `getPerformance(0)`, `getGlobal()`, `getDated()`, `getMapOfKind(TEMPO_MAP)` — answered a
// type no consumer could name, so reading an MPM for display meant either deep-importing
// past `dist/` or re-parsing the document with a second library. The methods were always
// public; what follows makes their types nameable, which is the whole of the change.
//
// This is deliberately the object model and NOT a second plain-data facade. `src/api/**`
// (RULE F1/F2) is where XML crosses as text and results are `structuredClone`-safe, and it
// stays the entry point for converting, performing and rendering. A viewer that wants to
// *draw the document it was given* needs the tree, the ids in it, and the numbers the
// renderer resolves from it — three things a plain-data boundary would have to re-invent
// one accessor at a time. So: the facade for pipelines, the object model for readers.
//
// Two cautions a reader should have before walking it. `new Mpm(text)` REPAIRS as it parses
// — `GenericMap.parseData` ends in a `sortXml()`, `rubatoDef` gains attributes,
// `accentuationPatternDef` gains `length="4"` — so the tree is not byte-faithful to the
// input; `src/expression/mpmDocument.ts` documents the full list. And the resolved data
// below is the RENDERER's arithmetic, which is not the same object as the ideal curves
// `compareMpm` integrates (see `docs/comparison.md`).

// The environments a performance is read through: `<performance>` → `<global>` / `<part>`,
// each with its `<header>` of definitions and `<dated>` of instruction maps.
export { Performance } from './mpm/elements/Performance.js';
export { Global } from './mpm/elements/Global.js';
export { Part } from './mpm/elements/Part.js';
export { Header } from './mpm/elements/Header.js';
export { Dated } from './mpm/elements/Dated.js';
// `<metadata>` and the three children the ODD gives it: `author*`, `comment*`,
// `relatedResources?`. All four together — every method `Metadata` exposes takes or answers
// one of the three, and `Mpm.addMetadata` takes all three, so exporting the container alone
// left it uncallable from outside the package.
export { Metadata } from './mpm/elements/metadata/Metadata.js';
export { Author } from './mpm/elements/metadata/Author.js';
export { Comment } from './mpm/elements/metadata/Comment.js';
export { RelatedResource } from './mpm/elements/metadata/RelatedResource.js';

// The instruction maps. `GenericMap` carries the whole read surface a viewer needs —
// `getAllElements()`, `getElementByID(id)`, `getElementBeforeAt(date)`, `getStyleAt(date,
// kind)`, `size()` — and the nine subclasses add the `get*DataOf(index)` accessor that
// resolves one instruction into the records below.
export { GenericMap } from './mpm/elements/maps/GenericMap.js';
export { TempoMap, type AddTempoOptions } from './mpm/elements/maps/TempoMap.js';
export { DynamicsMap, type AddDynamicsOptions } from './mpm/elements/maps/DynamicsMap.js';
export {
  ArticulationMap,
  type AddArticulationOptions,
} from './mpm/elements/maps/ArticulationMap.js';
export { MovementMap, type AddMovementOptions } from './mpm/elements/maps/MovementMap.js';
export { RubatoMap, type AddRubatoOptions } from './mpm/elements/maps/RubatoMap.js';
export { OrnamentationMap, type AddOrnamentOptions } from './mpm/elements/maps/OrnamentationMap.js';
export {
  MetricalAccentuationMap,
  type AddAccentuationPatternOptions,
} from './mpm/elements/maps/MetricalAccentuationMap.js';
export { AsynchronyMap, type AddAsynchronyOptions } from './mpm/elements/maps/AsynchronyMap.js';
export { ImprecisionMap, type DistributionSpan } from './mpm/elements/maps/ImprecisionMap.js';

// `Dated.getMapOfKind(kind)` is typed through `MapOfKind`, so a caller needs the key type to
// hold a kind in a variable. `mapOfKind` is the same narrowing applied to a map you already
// hold — a checked test, not a cast; see its doc for why the two differ.
export { MAP_KINDS, isMapKind, mapOfKind } from './mpm/elements/maps/map.js';
export type { MapKind, MapOfKind } from './mpm/elements/maps/map.js';

// The style collections a map resolves symbolic levels against: `volume="forte"` and
// `bpm="Allegro"` are names looked up in a `<styleDef>`, local header first, global second.
export {
  Style,
  styleOfKind,
  styleKindOfCollection,
  collectionNameOfKind,
  numericBpmValue,
  numericDynamicsValue,
} from './mpm/elements/styles/style.js';
export type {
  StyleKind,
  DefOfStyleKind,
  AnyStyle,
  StyleOfKind,
  TempoStyle,
  DynamicsStyle,
  ArticulationStyle,
  MetricalAccentuationStyle,
  RubatoStyle,
  OrnamentationStyle,
} from './mpm/elements/styles/style.js';

// The defs themselves. `AccentuationPatternDef.getLength()` is the one a metrical-accentuation
// reader cannot do without: an `<accentuationPattern>`'s span is `length` bars, and the length
// lives on the def its `@name.ref` points at, not on the instruction.
export { TempoDef } from './mpm/elements/styles/defs/TempoDef.js';
export { DynamicsDef } from './mpm/elements/styles/defs/DynamicsDef.js';
export { ArticulationDef } from './mpm/elements/styles/defs/ArticulationDef.js';
export { RubatoDef } from './mpm/elements/styles/defs/RubatoDef.js';
export {
  AccentuationPatternDef,
  type AccentuationTuple,
} from './mpm/elements/styles/defs/AccentuationPatternDef.js';
export { OrnamentDef } from './mpm/elements/styles/defs/OrnamentDef.js';
// `TemporalSpread` and the four vocabularies its own public signatures are typed in —
// `setTemporalSpreadValues(frameStart, frameLength, frameDomain, intensity, noteOffShift)` is
// on the exported `OrnamentDef` and takes two of them, so leaving them unexported made that
// method as uncallable from outside as `addMetadata` was.
export {
  TemporalSpread,
  FrameDomain,
  NoteOffShift,
  type OrnamentAlignment,
  type MpmSourceFormat,
} from './mpm/elements/styles/defs/TemporalSpread.js';
export type { TemporalValue, TemporalDomain } from './mpm/elements/styles/defs/TemporalValue.js';
export { DynamicsGradient } from './mpm/elements/styles/defs/DynamicsGradient.js';
export { matchDef } from './mpm/elements/styles/defs/def.js';
export type { Def, DefKind } from './mpm/elements/styles/defs/def.js';

// One instruction, resolved the way the renderer resolves it: every style-relative name
// already a number, every absent attribute already defaulted, spans already closed against
// the next instruction of the same name (`Number.MAX_VALUE` where there is none). These are
// `readonly` records of numbers and strings — no Element, no getters — so they cross a
// worker boundary unchanged even though they are not part of the `src/api/**` facade.
//
// `tempoAt` / `dynamicsAt` / `positionAt` evaluate one such record at a date. They are the
// renderer's own arithmetic, shared with it rather than reimplemented beside it, and they
// carry its RENDERING MATH ordering constraints — do not algebraically "simplify" them.
export { resolveTempo, tempoAt } from './mpm/elements/maps/data/tempo.js';
export type {
  Tempo,
  TempoSpan,
  ConstantTempo,
  TransitioningTempo,
} from './mpm/elements/maps/data/tempo.js';
export {
  resolveDynamics,
  dynamicsAt,
  isConstantDynamics,
  subNoteDynamicsSegment,
} from './mpm/elements/maps/data/dynamics.js';
export type { Dynamics, DeclaredDynamics } from './mpm/elements/maps/data/dynamics.js';
export {
  resolveMovement,
  positionAt,
  movementSegment,
  DEFAULT_CONTROLLER,
} from './mpm/elements/maps/data/movement.js';
export type {
  Movement,
  ConstantMovement,
  TransitioningMovement,
  DeclaredMovement,
} from './mpm/elements/maps/data/movement.js';
export { resolveRubato } from './mpm/elements/maps/data/rubato.js';
export type { Rubato, RubatoSpan, RubatoDeclaration } from './mpm/elements/maps/data/rubato.js';
export {
  articulateNote,
  NEUTRAL_ARTICULATION_MODIFIERS,
} from './mpm/elements/maps/data/articulation.js';
export type { Articulation } from './mpm/elements/maps/data/articulation.js';
export type { MetricalAccentuation } from './mpm/elements/maps/data/metricalAccentuation.js';
export { principalNoteId } from './mpm/elements/maps/data/ornament.js';
export type { Ornament, OrnamentGeneration } from './mpm/elements/maps/data/ornament.js';
export {
  parseDistribution,
  minAndMaxOfDistributionList,
} from './mpm/elements/maps/data/distribution.js';
export type {
  Distribution,
  DistributionKind,
  UniformDistribution,
  GaussianDistribution,
  TriangularDistribution,
  BrownianNoiseDistribution,
  CompensatingTriangleDistribution,
  ListDistribution,
  MinAndMax,
} from './mpm/elements/maps/data/distribution.js';

// The cubic-Bézier machinery `<dynamics>` and `<movement>` are shaped by. A viewer drawing a
// transition wants `innerControlPointsXPositions` (what `@curvature`/`@protraction` mean as
// geometry) and `sampleSegment` (adaptive subdivision, the same one the renderer samples
// sub-note dynamics with) rather than a hand-rolled polyline.
export {
  innerControlPointsXPositions,
  bezierPoint,
  sampleSegment,
  tForDate,
} from './mpm/elements/maps/data/bezier.js';
export type { CurvePoint } from './mpm/elements/maps/data/bezier.js';

// The `<dated>` child and `<header>` collection names, as `Dated.getMapOfKind` and
// `Header.getStyleDef` key on them. `Mpm` re-exports these as statics (RULE M3); the
// constants are the same values and are what `MapKind` is defined over.
export * from './mpm/names.js';

// MIDI
export { Midi } from './midi/Midi.js';
export { EventMaker } from './midi/EventMaker.js';
export { InstrumentsDictionary } from './midi/InstrumentsDictionary.js';

// Supplementary
export type { KeyValue } from './supplementary/KeyValue.js';

// The result type every `*Def` factory, `Performance.fromName`, `Part.fromValues` and
// `Style.parse` answers with. Exported because a consumer that calls one of them has to be
// able to name what it got back — and, with `OkOf`, to write the "or give up" reading once
// instead of at every call site.
export type { Result, AnyResult, Ok, Err, OkOf, ErrOf } from './prelude/result.js';
export { ok, err, isOk, isErr, unwrapOr } from './prelude/result.js';
export { RandomNumberProvider } from './supplementary/RandomNumberProvider.js';

// Version. RULE the design makes `VERSION` the API; the `Meico` object keeps `Meico.version`
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
