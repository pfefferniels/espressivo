import { Element, Document, Attribute, Nodes, XomNode } from '../xml/XomTypes.js';
import { Helper } from './Helper.js';
import { Mei } from './Mei.js';
import { MusicXml } from '../musicxml/MusicXml.js';
import { v4 as uuidv4 } from 'uuid';

/**
 * Helper to create a MusicXml instance from internal score data.
 * In the Java version, MusicXml wraps ProxyMusic objects (ScorePartwise, ScoreTimewise).
 * In this TypeScript port, we create an empty MusicXml and attach the score data.
 */
function createMusicXmlFromData(data: any): MusicXml {
  const mxml = new MusicXml();
  (mxml as any).scoreData = data;
  return mxml;
}

// =====================================================================
// ProxyMusic-equivalent type system for MusicXML domain objects
// These replace org.audiveris.proxymusic classes used in the Java code.
// =====================================================================

// Enums
enum StartStop {
  START = 'start',
  STOP = 'stop',
}
enum StartStopContinue {
  START = 'start',
  STOP = 'stop',
  CONTINUE = 'continue',
}
enum YesNo {
  YES = 'yes',
  NO = 'no',
}
enum AboveBelow {
  ABOVE = 'above',
  BELOW = 'below',
}
enum OverUnder {
  OVER = 'over',
  UNDER = 'under',
}
enum BackwardForward {
  BACKWARD = 'backward',
  FORWARD = 'forward',
}
enum RightLeftMiddle {
  RIGHT = 'right',
  LEFT = 'left',
  MIDDLE = 'middle',
}
enum StemValue {
  UP = 'up',
  DOWN = 'down',
  NONE = 'none',
  DOUBLE = 'double',
}
enum ClefSign {
  G = 'G',
  F = 'F',
  C = 'C',
  PERCUSSION = 'percussion',
  TAB = 'TAB',
  JIANPU = 'jianpu',
  NONE = 'none',
}
enum TimeSymbol {
  COMMON = 'common',
  CUT = 'cut',
  SINGLE_NUMBER = 'single-number',
  NOTE = 'note',
  DOTTED_NOTE = 'dotted-note',
  NORMAL = 'normal',
}
enum AccidentalValue {
  SHARP = 'sharp',
  NATURAL = 'natural',
  FLAT = 'flat',
  DOUBLE_SHARP = 'double-sharp',
  SHARP_SHARP = 'sharp-sharp',
  FLAT_FLAT = 'flat-flat',
  NATURAL_SHARP = 'natural-sharp',
  NATURAL_FLAT = 'natural-flat',
  QUARTER_FLAT = 'quarter-flat',
  QUARTER_SHARP = 'quarter-sharp',
  THREE_QUARTERS_FLAT = 'three-quarters-flat',
  THREE_QUARTERS_SHARP = 'three-quarters-sharp',
}
enum Step {
  A = 'A',
  B = 'B',
  C = 'C',
  D = 'D',
  E = 'E',
  F = 'F',
  G = 'G',
}

// Helper to create enum from string value
function enumFromValue<T extends Record<string, string>>(
  enumObj: T,
  value: string,
): T[keyof T] | undefined {
  for (const key of Object.keys(enumObj)) {
    if ((enumObj as any)[key] === value) return (enumObj as any)[key];
  }
  return undefined;
}

// --- JAXBElement replacement ---
class JAXBElement<T> {
  name: string;
  type: string;
  value: T;
  constructor(name: string, type: string, value: T) {
    this.name = name;
    this.type = type;
    this.value = value;
  }
}

// --- MusicXML domain classes ---

class Work {
  workTitle: string | null = null;
  workNumber: string | null = null;

  getWorkTitle(): string | null {
    return this.workTitle;
  }
  setWorkTitle(v: string) {
    this.workTitle = v;
  }
  getWorkNumber(): string | null {
    return this.workNumber;
  }
  setWorkNumber(v: string) {
    this.workNumber = v;
  }
}

class TypedText {
  value = '';
  type: string | null = null;

  getValue(): string {
    return this.value;
  }
  setValue(v: string) {
    this.value = v;
  }
  getType(): string | null {
    return this.type;
  }
  setType(v: string) {
    this.type = v;
  }

  equals(other: TypedText): boolean {
    return this.value === other.value && this.type === other.type;
  }
}

class FormattedText {
  value = '';
  getValue(): string {
    return this.value;
  }
  setValue(v: string) {
    this.value = v;
  }
}

class Encoding {
  encodingDateOrEncoderOrSoftware: JAXBElement<TypedText>[] = [];
  getEncodingDateOrEncoderOrSoftware(): JAXBElement<TypedText>[] {
    return this.encodingDateOrEncoderOrSoftware;
  }
}

class Identification {
  encoding: Encoding | null = null;
  creator: TypedText[] = [];
  source: string | null = null;
  miscellaneous: Miscellaneous | null = null;

  getEncoding(): Encoding | null {
    return this.encoding;
  }
  setEncoding(v: Encoding) {
    this.encoding = v;
  }
  getCreator(): TypedText[] {
    return this.creator;
  }
  getSource(): string | null {
    return this.source;
  }
  setSource(v: string) {
    this.source = v;
  }
  getMiscellaneous(): Miscellaneous | null {
    return this.miscellaneous;
  }
  setMiscellaneous(v: Miscellaneous) {
    this.miscellaneous = v;
  }
}

class Miscellaneous {
  miscellaneousField: MiscellaneousField[] = [];
  getMiscellaneousField(): MiscellaneousField[] {
    return this.miscellaneousField;
  }
}

class MiscellaneousField {
  name = '';
  value = '';
  getName(): string {
    return this.name;
  }
  setName(v: string) {
    this.name = v;
  }
  getValue(): string {
    return this.value;
  }
  setValue(v: string) {
    this.value = v;
  }
}

class EmptyFont {
  fontFamily: string | null = null;
  setFontFamily(v: string) {
    this.fontFamily = v;
  }
}

class LyricFont {
  fontFamily: string | null = null;
  setFontFamily(v: string) {
    this.fontFamily = v;
  }
}

class PageLayout {
  pageHeight: number | null = null;
  pageWidth: number | null = null;
  pageMargins: PageMargins[] = [];

  getPageHeight(): number | null {
    return this.pageHeight;
  }
  setPageHeight(v: number) {
    this.pageHeight = v;
  }
  getPageWidth(): number | null {
    return this.pageWidth;
  }
  setPageWidth(v: number) {
    this.pageWidth = v;
  }
  getPageMargins(): PageMargins[] {
    return this.pageMargins;
  }
}

class PageMargins {
  leftMargin: number | null = null;
  rightMargin: number | null = null;
  topMargin: number | null = null;
  bottomMargin: number | null = null;

  setLeftMargin(v: number) {
    this.leftMargin = v;
  }
  setRightMargin(v: number) {
    this.rightMargin = v;
  }
  setTopMargin(v: number) {
    this.topMargin = v;
  }
  setBottomMargin(v: number) {
    this.bottomMargin = v;
  }
}

class SystemLayout {
  systemDistance: number | null = null;
  topSystemDistance: number | null = null;
  systemMargins: SystemMargins | null = null;

  getSystemDistance(): number | null {
    return this.systemDistance;
  }
  setSystemDistance(v: number) {
    this.systemDistance = v;
  }
  getTopSystemDistance(): number | null {
    return this.topSystemDistance;
  }
  setTopSystemDistance(v: number) {
    this.topSystemDistance = v;
  }
}

class SystemMargins {
  leftMargin: number | null = null;
  rightMargin: number | null = null;
  setLeftMargin(v: number) {
    this.leftMargin = v;
  }
  setRightMargin(v: number) {
    this.rightMargin = v;
  }
}

class StaffLayout {
  staffDistance: number | null = null;
  setStaffDistance(v: number) {
    this.staffDistance = v;
  }
}

class Defaults {
  pageLayout: PageLayout | null = null;
  systemLayout: SystemLayout | null = null;
  staffLayout: StaffLayout[] = [];
  musicFont: EmptyFont | null = null;
  wordFont: EmptyFont | null = null;
  lyricFont: LyricFont[] = [];

  getPageLayout(): PageLayout | null {
    return this.pageLayout;
  }
  setPageLayout(v: PageLayout) {
    this.pageLayout = v;
  }
  getSystemLayout(): SystemLayout | null {
    return this.systemLayout;
  }
  setSystemLayout(v: SystemLayout) {
    this.systemLayout = v;
  }
  getStaffLayout(): StaffLayout[] {
    return this.staffLayout;
  }
  getMusicFont(): EmptyFont | null {
    return this.musicFont;
  }
  setMusicFont(v: EmptyFont) {
    this.musicFont = v;
  }
  getWordFont(): EmptyFont | null {
    return this.wordFont;
  }
  setWordFont(v: EmptyFont) {
    this.wordFont = v;
  }
  getLyricFont(): LyricFont[] {
    return this.lyricFont;
  }
}

class Credit {
  creditTypeOrLinkOrBookmark: any[] = [];
  page: number | null = null;

  getCreditTypeOrLinkOrBookmark(): any[] {
    return this.creditTypeOrLinkOrBookmark;
  }
  getPage(): number | null {
    return this.page;
  }
  setPage(v: number) {
    this.page = v;
  }
}

class PartName {
  value = '';
  getValue(): string {
    return this.value;
  }
  setValue(v: string) {
    this.value = v;
  }
}

class ScorePart {
  id = '';
  partName: PartName | null = null;
  partAbbreviation: PartName | null = null;

  getId(): string {
    return this.id;
  }
  setId(v: string) {
    this.id = v;
  }
  getPartName(): PartName | null {
    return this.partName;
  }
  setPartName(v: PartName) {
    this.partName = v;
  }
  setPartAbbreviation(v: PartName) {
    this.partAbbreviation = v;
  }
}

class PartGroup {
  type: StartStop | null = null;
  setType(v: StartStop) {
    this.type = v;
  }
  getType(): StartStop | null {
    return this.type;
  }
}

class PartList {
  partGroupOrScorePart: any[] = [];
  getPartGroupOrScorePart(): any[] {
    return this.partGroupOrScorePart;
  }
}

class Pitch {
  step: Step | null = null;
  alter: number | null = null;
  octave: number | null = null;

  getStep(): Step | null {
    return this.step;
  }
  setStep(v: Step) {
    this.step = v;
  }
  getAlter(): number | null {
    return this.alter;
  }
  setAlter(v: number) {
    this.alter = v;
  }
  getOctave(): number | null {
    return this.octave;
  }
  setOctave(v: number) {
    this.octave = v;
  }
}

class Rest {
  measure: YesNo | null = null;
  getMeasure(): YesNo | null {
    return this.measure;
  }
  setMeasure(v: YesNo) {
    this.measure = v;
  }
}

class NoteType {
  value = '';
  getValue(): string {
    return this.value;
  }
  setValue(v: string) {
    this.value = v;
  }
}

class Accidental {
  value: AccidentalValue | null = null;
  getValue(): AccidentalValue | null {
    return this.value;
  }
  setValue(v: AccidentalValue) {
    this.value = v;
  }
}

class EmptyPlacement {
  placement: AboveBelow | null = null;
  setPlacement(v: AboveBelow) {
    this.placement = v;
  }
}

class Stem {
  value: StemValue | null = null;
  getValue(): StemValue | null {
    return this.value;
  }
  setValue(v: StemValue) {
    this.value = v;
  }
}

class Empty {}

class TimeModification {
  actualNotes: number | null = null;
  normalNotes: number | null = null;
  setActualNotes(v: number) {
    this.actualNotes = v;
  }
  setNormalNotes(v: number) {
    this.normalNotes = v;
  }
}

class Tie {
  type: StartStop | null = null;
  getType(): StartStop | null {
    return this.type;
  }
  setType(v: StartStop) {
    this.type = v;
  }
}

class Tied {
  type: StartStopContinue | null = null;
  orientation: OverUnder | null = null;
  placement: AboveBelow | null = null;

  getType(): StartStopContinue | null {
    return this.type;
  }
  setType(v: StartStopContinue) {
    this.type = v;
  }
  setOrientation(v: OverUnder) {
    this.orientation = v;
  }
  setPlacement(v: AboveBelow) {
    this.placement = v;
  }
}

class Tuplet {
  bracket: YesNo | null = null;
  type: StartStop | null = null;

  setBracket(v: YesNo) {
    this.bracket = v;
  }
  setType(v: StartStop) {
    this.type = v;
  }
}

class Notations {
  tiedOrSlurOrTuplet: any[] = [];
  getTiedOrSlurOrTuplet(): any[] {
    return this.tiedOrSlurOrTuplet;
  }
}

class MusicXmlNote {
  voice: string | null = null;
  rest: Rest | null = null;
  pitch: Pitch | null = null;
  duration: number | null = null;
  type: NoteType | null = null;
  accidental: Accidental | null = null;
  printObject: YesNo | null = null;
  printDot: YesNo | null = null;
  dot: EmptyPlacement[] = [];
  stem: Stem | null = null;
  chord: Empty | null = null;
  timeModification: TimeModification | null = null;
  tie: Tie[] = [];
  notations: Notations[] = [];

  getVoice(): string | null {
    return this.voice;
  }
  setVoice(v: string) {
    this.voice = v;
  }
  getRest(): Rest | null {
    return this.rest;
  }
  setRest(v: Rest) {
    this.rest = v;
  }
  getPitch(): Pitch | null {
    return this.pitch;
  }
  setPitch(v: Pitch) {
    this.pitch = v;
  }
  getDuration(): number | null {
    return this.duration;
  }
  setDuration(v: number) {
    this.duration = v;
  }
  getType(): NoteType | null {
    return this.type;
  }
  setType(v: NoteType) {
    this.type = v;
  }
  getAccidental(): Accidental | null {
    return this.accidental;
  }
  setAccidental(v: Accidental) {
    this.accidental = v;
  }
  setPrintObject(v: YesNo) {
    this.printObject = v;
  }
  setPrintDot(v: YesNo) {
    this.printDot = v;
  }
  getDot(): EmptyPlacement[] {
    return this.dot;
  }
  getStem(): Stem | null {
    return this.stem;
  }
  setStem(v: Stem) {
    this.stem = v;
  }
  setChord(v: Empty) {
    this.chord = v;
  }
  getTimeModification(): TimeModification | null {
    return this.timeModification;
  }
  setTimeModification(v: TimeModification) {
    this.timeModification = v;
  }
  getTie(): Tie[] {
    return this.tie;
  }
  getNotations(): Notations[] {
    return this.notations;
  }
}

class Clef {
  sign: ClefSign | null = null;
  line: number | null = null;
  clefOctaveChange: number | null = null;

  setSign(v: ClefSign) {
    this.sign = v;
  }
  setLine(v: number) {
    this.line = v;
  }
  setClefOctaveChange(v: number) {
    this.clefOctaveChange = v;
  }
}

class Key {
  fifths: number | null = null;
  setFifths(v: number) {
    this.fifths = v;
  }
}

class Time {
  symbol: TimeSymbol | null = null;
  timeSignature: JAXBElement<string>[] = [];

  setSymbol(v: TimeSymbol) {
    this.symbol = v;
  }
  getTimeSignature(): JAXBElement<string>[] {
    return this.timeSignature;
  }
}

class Attributes {
  divisions: number | null = null;
  key: Key[] = [];
  time: Time[] = [];
  clef: Clef[] = [];

  getDivisions(): number | null {
    return this.divisions;
  }
  setDivisions(v: number) {
    this.divisions = v;
  }
  getKey(): Key[] {
    return this.key;
  }
  getTime(): Time[] {
    return this.time;
  }
  getClef(): Clef[] {
    return this.clef;
  }
}

class Backup {
  duration: number | null = null;
  setDuration(v: number) {
    this.duration = v;
  }
}

class Forward {
  duration: number | null = null;
  setDuration(v: number) {
    this.duration = v;
  }
}

class Direction {}
class Harmony {}
class FiguredBass {}
class Print {}
class Sound {}

class Barline {
  location: RightLeftMiddle | null = null;
  repeat: Repeat | null = null;

  setLocation(v: RightLeftMiddle) {
    this.location = v;
  }
  setRepeat(v: Repeat) {
    this.repeat = v;
  }
}

class Repeat {
  direction: BackwardForward | null = null;
  setDirection(v: BackwardForward) {
    this.direction = v;
  }
}

class Grouping {}
class Link {}
class Bookmark {}

// --- Score structures ---

class ScorePartwisePartMeasure {
  number = '';
  noteOrBackupOrForward: any[] = [];

  getNumber(): string {
    return this.number;
  }
  setNumber(v: string) {
    this.number = v;
  }
  getNoteOrBackupOrForward(): any[] {
    return this.noteOrBackupOrForward;
  }
}

class ScorePartwisePart {
  id: any = null;
  measure: ScorePartwisePartMeasure[] = [];

  getId(): any {
    return this.id;
  }
  setId(v: any) {
    this.id = v;
  }
  getMeasure(): ScorePartwisePartMeasure[] {
    return this.measure;
  }
}

class ScorePartwise {
  work: Work | null = null;
  movementNumber: string | null = null;
  movementTitle: string | null = null;
  identification: Identification | null = null;
  defaults: Defaults | null = null;
  credit: Credit[] = [];
  partList: PartList | null = null;
  version: string | null = null;
  part: ScorePartwisePart[] = [];

  getWork(): Work | null {
    return this.work;
  }
  setWork(v: Work) {
    this.work = v;
  }
  getMovementNumber(): string | null {
    return this.movementNumber;
  }
  setMovementNumber(v: string) {
    this.movementNumber = v;
  }
  getMovementTitle(): string | null {
    return this.movementTitle;
  }
  setMovementTitle(v: string) {
    this.movementTitle = v;
  }
  getIdentification(): Identification | null {
    return this.identification;
  }
  setIdentification(v: Identification) {
    this.identification = v;
  }
  getDefaults(): Defaults | null {
    return this.defaults;
  }
  setDefaults(v: Defaults) {
    this.defaults = v;
  }
  getCredit(): Credit[] {
    return this.credit;
  }
  getPartList(): PartList | null {
    return this.partList;
  }
  setPartList(v: PartList) {
    this.partList = v;
  }
  getVersion(): string | null {
    return this.version;
  }
  setVersion(v: string) {
    this.version = v;
  }
  getPart(): ScorePartwisePart[] {
    return this.part;
  }
}

class ScoreTimewiseMeasurePart {
  id: any = null;
  noteOrBackupOrForward: any[] = [];

  getId(): any {
    return this.id;
  }
  setId(v: any) {
    this.id = v;
  }
  getNoteOrBackupOrForward(): any[] {
    return this.noteOrBackupOrForward;
  }
}

class ScoreTimewiseMeasure {
  number = '';
  part: ScoreTimewiseMeasurePart[] = [];

  getNumber(): string {
    return this.number;
  }
  setNumber(v: string) {
    this.number = v;
  }
  getPart(): ScoreTimewiseMeasurePart[] {
    return this.part;
  }
}

class ScoreTimewise {
  work: Work | null = null;
  movementNumber: string | null = null;
  movementTitle: string | null = null;
  identification: Identification | null = null;
  defaults: Defaults | null = null;
  credit: Credit[] = [];
  partList: PartList | null = null;
  version: string | null = null;
  measure: ScoreTimewiseMeasure[] = [];

  getWork(): Work | null {
    return this.work;
  }
  setWork(v: Work) {
    this.work = v;
  }
  getMovementNumber(): string | null {
    return this.movementNumber;
  }
  setMovementNumber(v: string) {
    this.movementNumber = v;
  }
  getMovementTitle(): string | null {
    return this.movementTitle;
  }
  setMovementTitle(v: string) {
    this.movementTitle = v;
  }
  getIdentification(): Identification | null {
    return this.identification;
  }
  setIdentification(v: Identification) {
    this.identification = v;
  }
  getDefaults(): Defaults | null {
    return this.defaults;
  }
  setDefaults(v: Defaults) {
    this.defaults = v;
  }
  getCredit(): Credit[] {
    return this.credit;
  }
  getPartList(): PartList | null {
    return this.partList;
  }
  setPartList(v: PartList) {
    this.partList = v;
  }
  getVersion(): string | null {
    return this.version;
  }
  setVersion(v: string) {
    this.version = v;
  }
  getMeasure(): ScoreTimewiseMeasure[] {
    return this.measure;
  }
}

// =====================================================================
// DefinitionType inner class
// =====================================================================

class DefinitionType {
  private clefDis: string | null = null;
  private clefDisPlace: string | null = null;
  private clefLine: string | null = null;
  private clefShape: string | null = null;
  private keySigVal: string | null = null;
  private octDefault: string | null = null;
  private ppq: string | null = null;
  private durDefault: string | null = null;
  private label: string | null = null;
  private meterSym: string | null = null;
  private meterCount: string | null = null;
  private meterUnit: string | null = null;
  private n: string | null = null;
  private numDefault: string | null = null;
  private numBaseDefault: string | null = null;

  private overwrite = false;

  private diff: DefinitionType | null = null;

  /**
   * Compute ratio duration from numbase.default and num.default
   */
  getNumRatio(): string | null {
    if (
      this.numDefault !== null &&
      this.numDefault !== '' &&
      this.numBaseDefault !== null &&
      this.numBaseDefault !== ''
    ) {
      const num = parseFloat(this.numDefault);
      const numBase = parseFloat(this.numBaseDefault);
      const result = num / numBase;
      let resultInt: number;
      try {
        resultInt = parseInt(this.numBaseDefault);
      } catch (e) {
        console.error(`Float could not be converted to int: ${result}`);
        return null;
      }
      return resultInt.toString();
    }
    return null;
  }

  isNullEmpty(s: string | null): boolean {
    if (this.overwrite) return true;
    return s === null || s === '';
  }

  getClefDis(): string | null {
    return this.clefDis;
  }
  setClefDis(clefDis: string | null): void {
    if (this.isNullEmpty(clefDis)) return;
    if (!this.isNullEmpty(this.clefDis)) return;
    this.clefDis = clefDis;
  }

  getClefDisPlace(): string | null {
    return this.clefDisPlace;
  }
  setClefDisPlace(clefDisPlace: string | null): void {
    if (this.isNullEmpty(clefDisPlace)) return;
    if (!this.isNullEmpty(this.clefDisPlace)) return;
    this.clefDisPlace = clefDisPlace;
  }

  getClefLine(): string | null {
    return this.clefLine;
  }
  setClefLine(clefLine: string | null): void {
    if (this.isNullEmpty(clefLine)) return;
    if (!this.isNullEmpty(this.clefLine)) return;
    this.clefLine = clefLine;
  }

  getClefShape(): string | null {
    return this.clefShape;
  }
  setClefShape(clefShape: string | null): void {
    if (this.isNullEmpty(clefShape)) return;
    if (!this.isNullEmpty(this.clefShape)) return;
    this.clefShape = clefShape;
  }

  getKeySig(): string | null {
    return this.keySigVal;
  }
  setKeySig(keySig: string | null): void {
    if (this.isNullEmpty(keySig)) return;
    if (!this.isNullEmpty(this.keySigVal)) return;
    this.keySigVal = keySig;
  }

  getOctDefault(): string | null {
    return this.octDefault;
  }
  setOctDefault(octDefault: string | null): void {
    if (this.isNullEmpty(octDefault)) return;
    if (!this.isNullEmpty(this.octDefault)) return;
    this.octDefault = octDefault;
  }

  getPpq(): string | null {
    return this.ppq;
  }
  setPpq(ppq: string | null): void {
    if (this.isNullEmpty(ppq)) return;
    if (!this.isNullEmpty(this.ppq)) return;
    this.ppq = ppq;
  }

  getDurDefault(): string | null {
    return this.durDefault;
  }
  setDurDefault(durDefault: string | null): void {
    if (this.isNullEmpty(durDefault)) return;
    if (!this.isNullEmpty(this.durDefault)) return;
    this.durDefault = durDefault;
  }

  getLabel(): string | null {
    return this.label;
  }
  setLabel(label: string | null): void {
    if (this.isNullEmpty(label)) return;
    if (!this.isNullEmpty(this.label)) return;
    this.label = label;
  }

  getMeterSym(): string | null {
    return this.meterSym;
  }
  setMeterSym(meterSym: string | null): void {
    if (this.isNullEmpty(meterSym)) return;
    if (!this.isNullEmpty(this.meterSym)) return;
    this.meterSym = meterSym;
  }

  getMeterCount(): string | null {
    return this.meterCount;
  }
  setMeterCount(meterCount: string | null): void {
    if (this.isNullEmpty(meterCount)) return;
    if (!this.isNullEmpty(this.meterCount)) return;
    this.meterCount = meterCount;
  }

  getMeterUnit(): string | null {
    return this.meterUnit;
  }
  setMeterUnit(meterUnit: string | null): void {
    if (this.isNullEmpty(meterUnit)) return;
    if (!this.isNullEmpty(this.meterUnit)) return;
    this.meterUnit = meterUnit;
  }

  getN(): string | null {
    return this.n;
  }
  setN(n: string | null): void {
    if (this.isNullEmpty(n)) return;
    if (!this.isNullEmpty(this.n)) return;
    this.n = n;
  }

  getNumDefault(): string | null {
    return this.numDefault;
  }
  setNumDefault(numDefault: string | null): void {
    if (this.isNullEmpty(numDefault)) return;
    if (!this.isNullEmpty(this.numDefault)) return;
    this.numDefault = numDefault;
  }

  getNumBaseDefault(): string | null {
    return this.numBaseDefault;
  }
  setNumBaseDefault(numBaseDefault: string | null): void {
    if (this.isNullEmpty(numBaseDefault)) return;
    if (!this.isNullEmpty(this.numBaseDefault)) return;
    this.numBaseDefault = numBaseDefault;
  }

  getDiff(): DefinitionType | null {
    return this.diff;
  }

  /**
   * Set all attributes from a given element.
   */
  setAttributes(e: Element, overwriteFlag?: boolean): void {
    if (overwriteFlag !== undefined) {
      this.overwrite = overwriteFlag;
    }
    this.setClefLine(e.getAttributeValue('line'));
    this.setClefShape(e.getAttributeValue('shape'));
    this.setClefDis(e.getAttributeValue('dis'));
    this.setClefDisPlace(e.getAttributeValue('dis.place'));
    this.setClefLine(e.getAttributeValue('clef.line'));
    this.setClefShape(e.getAttributeValue('clef.shape'));
    this.setClefDis(e.getAttributeValue('clef.dis'));
    this.setClefDisPlace(e.getAttributeValue('clef.dis.place'));
    this.setKeySig(e.getAttributeValue('keysig'));
    this.setKeySig(e.getAttributeValue('key.sig'));
    this.setKeySig(e.getAttributeValue('sig'));
    this.setOctDefault(e.getAttributeValue('oct.default'));
    this.setPpq(e.getAttributeValue('ppq'));
    this.setDurDefault(e.getAttributeValue('dur.default'));
    this.setLabel(e.getAttributeValue('label'));
    this.setMeterSym(e.getAttributeValue('sym'));
    this.setMeterCount(e.getAttributeValue('count'));
    this.setMeterUnit(e.getAttributeValue('unit'));
    this.setMeterSym(e.getAttributeValue('meter.sym'));
    this.setMeterCount(e.getAttributeValue('meter.count'));
    this.setMeterUnit(e.getAttributeValue('meter.unit'));
    this.setN(e.getAttributeValue('n'));
    this.setNumDefault(e.getAttributeValue('num.default'));
    this.setNumBaseDefault(e.getAttributeValue('numbase.default'));
    if (overwriteFlag !== undefined) {
      this.overwrite = false; // reset
    }
  }

  /**
   * Check if all fields have some kind of value in them (not null)
   */
  isFull(): boolean {
    const fields: (string | null)[] = [
      this.clefDis,
      this.clefDisPlace,
      this.clefLine,
      this.clefShape,
      this.keySigVal,
      this.octDefault,
      this.ppq,
      this.durDefault,
      this.label,
      this.meterSym,
      this.meterCount,
      this.meterUnit,
      this.n,
      this.numDefault,
      this.numBaseDefault,
    ];
    for (const field of fields) {
      if (field === null || field === '') return false;
    }
    return true;
  }

  hashCode(): number {
    // Simple hash for TS
    let hash = 0;
    const fields = [
      this.clefDis,
      this.clefDisPlace,
      this.clefLine,
      this.clefShape,
      this.keySigVal,
      this.octDefault,
      this.ppq,
      this.durDefault,
      this.label,
      this.meterCount,
      this.meterUnit,
      this.n,
      this.numDefault,
      this.numBaseDefault,
    ];
    for (const f of fields) {
      if (f !== null) {
        for (let i = 0; i < f.length; i++) {
          hash = (hash << 5) - hash + f.charCodeAt(i);
          hash |= 0;
        }
      }
    }
    return hash;
  }

  /**
   * Compare if each String field has the same content.
   */
  equals(o: any): boolean {
    if (this === o) return true;
    if (o === null || !(o instanceof DefinitionType)) return false;
    const that = o as DefinitionType;

    const compareField = (a: string | null, b: string | null): boolean | null => {
      if (a !== null && b !== null) return a === b;
      if (a !== null || b !== null) return false;
      return null; // both null - equal
    };

    const fields: [string | null, string | null][] = [
      [this.clefDis, that.clefDis],
      [this.clefDisPlace, that.clefDisPlace],
      [this.clefLine, that.clefLine],
      [this.clefShape, that.clefShape],
      [this.keySigVal, that.keySigVal],
      [this.octDefault, that.octDefault],
      [this.ppq, that.ppq],
      [this.durDefault, that.durDefault],
      [this.label, that.label],
      [this.meterSym, that.meterSym],
      [this.meterCount, that.meterCount],
      [this.meterUnit, that.meterUnit],
      [this.n, that.n],
      [this.numDefault, that.numDefault],
      [this.numBaseDefault, that.numBaseDefault],
    ];

    for (const [a, b] of fields) {
      const result = compareField(a, b);
      if (result === false) return false;
      // if result is null (both null) or true, continue
    }
    return true;
  }

  /**
   * Check if B is fully contained in A.
   * True if elements of B are equal to Elements of A, or null.
   */
  hasSubset(ofThis: DefinitionType): boolean {
    if (ofThis === null) return false;
    if (this === ofThis) return true;

    this.diff = new DefinitionType();
    let b = true;

    b = this.checkAndSetDifference(this.clefDis, ofThis.clefDis, b, (v) =>
      this.diff!.setClefDis(v),
    );
    b = this.checkAndSetDifference(this.clefDisPlace, ofThis.clefDisPlace, b, (v) =>
      this.diff!.setClefDisPlace(v),
    );
    b = this.checkAndSetDifference(this.clefLine, ofThis.clefLine, b, (v) =>
      this.diff!.setClefLine(v),
    );
    b = this.checkAndSetDifference(this.clefShape, ofThis.clefShape, b, (v) =>
      this.diff!.setClefShape(v),
    );
    b = this.checkAndSetDifference(this.keySigVal, ofThis.keySigVal, b, (v) =>
      this.diff!.setKeySig(v),
    );
    b = this.checkAndSetDifference(this.octDefault, ofThis.octDefault, b, (v) =>
      this.diff!.setOctDefault(v),
    );
    b = this.checkAndSetDifference(this.ppq, ofThis.ppq, b, (v) => this.diff!.setPpq(v));
    b = this.checkAndSetDifference(this.durDefault, ofThis.durDefault, b, (v) =>
      this.diff!.setDurDefault(v),
    );
    b = this.checkAndSetDifference(this.label, ofThis.label, b, (v) => this.diff!.setLabel(v));
    b = this.checkAndSetDifference(this.meterSym, ofThis.meterSym, b, (v) =>
      this.diff!.setMeterSym(v),
    );
    b = this.checkAndSetDifference(this.meterCount, ofThis.meterCount, b, (v) =>
      this.diff!.setMeterCount(v),
    );
    b = this.checkAndSetDifference(this.meterUnit, ofThis.meterUnit, b, (v) =>
      this.diff!.setMeterUnit(v),
    );
    b = this.checkAndSetDifference(this.n, ofThis.n, b, (v) => this.diff!.setN(v));
    b = this.checkAndSetDifference(this.numDefault, ofThis.numDefault, b, (v) =>
      this.diff!.setNumDefault(v),
    );
    b = this.checkAndSetDifference(this.numBaseDefault, ofThis.numBaseDefault, b, (v) =>
      this.diff!.setNumBaseDefault(v),
    );

    return b;
  }

  /**
   * Helper to apply functions and variables to reflections.
   */
  private checkAndSetDifference(
    thisField: string | null,
    otherField: string | null,
    currentStatus: boolean,
    setter: (v: string | null) => void,
  ): boolean {
    let localStatus = currentStatus;
    if (thisField !== null && otherField !== null) {
      localStatus = thisField === otherField;
      if (!localStatus) {
        setter(otherField);
      }
    } else if (thisField === null && otherField !== null) {
      localStatus = false;
      setter(otherField);
    }
    if (currentStatus) {
      currentStatus = localStatus;
    }
    return currentStatus;
  }

  /**
   * Check if dType is contained by this. If yes, then return diff, else return null.
   */
  getDiffRight(dType: DefinitionType): DefinitionType | null {
    const b = this.hasSubset(dType);
    if (!b) return this.diff;
    return null;
  }
}

// =====================================================================
// XPathContext replacement (simplified)
// =====================================================================

class XPathContext {
  private namespaces = new Map<string, string>();

  addNamespace(prefix: string, uri: string): void {
    this.namespaces.set(prefix, uri);
  }

  getNamespaceURI(prefix: string): string | null {
    return this.namespaces.get(prefix) ?? null;
  }
}

// =====================================================================
// Main converter class
// =====================================================================

/**
 * This class does the conversion from MEI to MusicXML.
 * To use it, instantiate it with the constructor, then invoke convert().
 *
 * @author Matthias Nowakowski (Java), ported to TypeScript
 */
export class Mei2MusicXmlConverter {
  private mei: Mei | null = null;
  private ignoreExpansions = false;
  private readonly xPathContext: XPathContext = new XPathContext();

  private readonly mxmls: MusicXml[] = [];
  private header: ScorePartwise = new ScorePartwise();
  private originalHeader: ScorePartwise | null = null;
  private workList: ScorePartwise[] = [];
  private currentScorePartwise: ScorePartwise | null = null;
  private currentScoreTimewise: ScoreTimewise | null = null;
  private pwIsCurrent = false;
  private twIsCurrent = false;

  private currentPartPW: ScorePartwisePart | null = null;
  private currentPartTW: ScoreTimewiseMeasurePart | null = null;
  private currentMeasurePW: ScorePartwisePartMeasure | null = null;
  private currentMeasureTW: ScoreTimewiseMeasure | null = null;

  private currentVoice: string | null = null;
  private currentDefinition: DefinitionType | null = null;
  private defDiff: DefinitionType | null = new DefinitionType();
  private currentNote: MusicXmlNote | null = null;

  private partListIds: string[] = [];
  private partList: PartList | null = null;
  private barlines: Barline[] = [];
  private measureListMEI: Element[] = [];
  private tieListMEI: Element[] = [];
  private prevMeasureTieListMEI: Element[] = [];
  private tieBlacklist: string[] = [];

  private readonly sourceBuilder: string[] = [];
  private readonly endLine: string = ', ';
  private divisions = 0;

  /**
   * constructor
   * @param ignoreExpansions set this true to have a 1:1 conversion of MEI to MusicXML without the rearrangement that MEI's expansion elements produce
   */
  constructor(ignoreExpansions: boolean) {
    this.ignoreExpansions = ignoreExpansions;
    this.xPathContext.addNamespace('mei', 'http://www.music-encoding.org/ns/mei');
  }

  /**
   * start the conversion process
   * @param mei the Mei object to be converted
   * @returns list of MusicXml objects
   */
  convert(mei: Mei): MusicXml[] {
    try {
      if (mei === null) {
        console.log('\nThe provided MEI object is null and cannot be converted.');
        return [];
      }

      const startTime = Date.now();
      console.log(
        `\nConverting ${mei.getFile() !== null ? mei.getFile() : 'MEI data'} to MusicXML.`,
      );

      this.mei = mei;

      // if meiHead and music are not present at all.
      if (mei.getMeiHead() === null && mei.getMusic() === null) {
        const nodes = mei.getRootElement()!.query('*');
        const warning = '\nThe converter expects <meiHead> or <music> as children of <mei>.';
        if (nodes.size() === 0) {
          console.log(`${warning} No Children can be found.`);
          return [];
        }
        const s: string[] = [];
        for (let i = 0; i < nodes.size(); i++) {
          s.push((nodes.get(i) as unknown as Element).getLocalName());
        }
        console.log(`${warning} Elements ${s.join(', ')} are not allowed.`);
        return [];
      }

      const orig = this.mei.getDocument()!.copy();
      this.initHeader();
      this.convertHead(mei.getMeiHead());
      this.concatSourceBuilder();

      // convert Mei music
      if (
        this.mei.isEmpty() ||
        this.mei.getMusic() === null ||
        this.mei
          .getMusic()!
          .getFirstChildElement('body', this.mei.getMusic()!.getNamespaceURI()) === null
      ) {
        this.mxmls.push(createMusicXmlFromData(this.originalHeader));
        for (const w of this.workList) {
          this.mxmls.push(createMusicXmlFromData(w));
        }
      } else {
        this.mei.resolveCopyofsAndSameas();
        if (!this.ignoreExpansions) this.mei.resolveExpansions();

        this.convertMusic(mei.getMusic()!);
      }

      // Set Filenames for XMLs
      if (this.mxmls.length === 1)
        this.mxmls[0].setFile(
          `${Helper.getFilenameWithoutExtension(this.mei.getFile()!)}.musicxml`,
        );
      else if (this.mxmls.length > 1) {
        for (let i = 0; i < this.mxmls.length; ++i) {
          this.mxmls[i].setFile(
            `${Helper.getFilenameWithoutExtension(this.mei.getFile()!)}-${i}.musicxml`,
          );
        }
      }

      // cleanup
      this.mei.setDocument(orig);
      console.log(
        `MEI to MusicXML conversion finished. Time consumed: ${Date.now() - startTime} milliseconds`,
      );
      return this.mxmls;
    } catch (e) {
      console.error(e);
      return this.mxmls;
    }
  }

  /**
   * Apply convert method by flag (convert in Header or in Music).
   */
  private convertByFlag(e: Element, convertInHeader: boolean): void {
    if (convertInHeader) {
      this.convertHead(e);
    } else {
      this.convertMusic(e);
    }
  }

  /**
   * MeiHeader is analyzed separately, since this information can be attached to several MusicXML created in convertMusic()
   */
  private convertHead(element: Element | null): void {
    if (element === null) return;
    const es = element.getChildElements();
    for (let i = 0; i < es.size(); i++) {
      const e = es.get(i);
      let doRecurse = false; // false means continue to next sibling, true means recurse into children
      switch (e.getLocalName()) {
        case 'altId':
        case 'abbr':
        case 'accMat':
        case 'accessRestrict':
        case 'accid':
        case 'acquisition':
          continue;

        case 'actor':
          if (e.query('*').size() === 0) {
            this.addToCredit(e);
            continue;
          } else {
            doRecurse = true;
            break;
          }

        case 'add':
        case 'addDesc':
        case 'addName':
          continue;

        case 'address':
        case 'pubPlace':
        case 'distributor':
          doRecurse = true;
          break;

        case 'addrLine':
          this.processAddrLine(e);
          break;

        case 'ambNote':
        case 'ambitus':
        case 'analytic':
        case 'anchoredText':
        case 'annot':
        case 'arpeg':
        case 'artic':
          continue;

        case 'app':
          this.processApp(e, true);
          continue;

        case 'appInfo':
          doRecurse = true;
          break;

        case 'application':
          this.processApplication(e);
          continue;

        case 'argument':
          continue;

        case 'arranger':
        case 'author':
        case 'editor':
        case 'funder':
        case 'librettist':
        case 'lyricist':
        case 'sponsor':
          this.addToCreator(e, e.getLocalName());
          this.addToCreditWithStrings(e.getValue().trim(), e.getLocalName()); // addToCredit(Element) won't work here
          continue;

        case 'attacca':
        case 'audience':
        case 'avFile':
        case 'attUsage':
          continue;

        case 'availability':
          this.processMisc(e, false);
          continue;

        case 'back':
        case 'barLine':
        case 'barre':
        case 'beam':
        case 'beamSpan':
        case 'beatRpt':
        case 'bend':
        case 'bibl':
        case 'biblList':
        case 'biblScope':
        case 'biblStruct':
        case 'bifolium':
        case 'binding':
        case 'bindingDesc':
          continue;

        case 'body':
          doRecurse = true;
          break;

        case 'bracketSpan':
        case 'breath':
        case 'bTrem':
        case 'byline':
        case 'caption':
        case 'caesura':
        case 'captureMode':
        case 'captureForm':
        case 'castGrp':
        case 'castItem':
        case 'castList':
        case 'catchWords':
        case 'category':
        case 'catRel':
        case 'cb':
        case 'cc':
        case 'chan':
        case 'chanPr':
          continue;

        case 'change':
          this.updateHeaderMiscElement(e, false);
          continue;

        case 'changeDesc':
          continue;

        case 'choice':
          this.processChoice(e, true);
          continue;

        case 'chord':
        case 'chordDef':
        case 'chordMember':
        case 'chordTable':
        case 'classDecls':
        case 'classification':
        case 'clef':
        case 'clefGrp':
        case 'clip':
        case 'colLayout':
        case 'collation':
        case 'colophon':
          continue;

        case 'componentList':
          doRecurse = true;
          break;

        case 'composer':
          doRecurse = true;
          break;

        case 'contentItem':
        case 'contents':
        case 'context':
        case 'contributor':
          continue;

        case 'corpName':
          this.addToSource(e);
          continue;

        case 'corr':
          doRecurse = true;
          break;

        case 'correction':
        case 'cpMark':
        case 'curve':
        case 'custos':
        case 'cue':
        case 'cutout':
        case 'creation':
        case 'damage':
          continue;

        case 'date':
          this.processDate(e);
          continue;

        case 'decoDesc':
        case 'decoNote':
        case 'dedicatee':
        case 'dedication':
          continue;

        case 'del':
          doRecurse = true;
          break;

        case 'depth':
        case 'desc':
        case 'dim':
        case 'dimensions':
        case 'dir':
        case 'div':
        case 'divLine':
        case 'domainsDecl':
        case 'dot':
        case 'dynam':
        case 'edition':
        case 'editorialDecl':
          continue;

        case 'encodingDesc':
          doRecurse = true;
          break;

        case 'ending':
        case 'epigraph':
        case 'episema':
        case 'eventList':
        case 'exhibHist':
        case 'expan':
        case 'expansion':
        case 'explicit':
        case 'extData':
        case 'extMeta':
        case 'extent':
        case 'expression':
        case 'expressionList':
        case 'f':
        case 'facsimile':
        case 'famName':
        case 'fb':
        case 'fermata':
        case 'fig':
        case 'figDesc':
        case 'fileChar':
          continue;

        case 'fileDesc':
          doRecurse = true;
          break;

        case 'fing':
        case 'fingGrp':
        case 'foliaDesc':
        case 'foliation':
        case 'folium':
        case 'foreName':
        case 'fTrem':
        case 'front':
        case 'gap':
        case 'genDesc':
        case 'genName':
        case 'genState':
        case 'genre':
        case 'gliss':
        case 'graceGrp':
        case 'graphic':
        case 'group':
        case 'grpSym':
        case 'hairpin':
        case 'half':
        case 'halfRpt':
        case 'hand':
        case 'handList':
        case 'handShift':
        case 'harm':
        case 'harpPedal':
        case 'head':
        case 'height':
        case 'heraldry':
        case 'hex':
        case 'hispanTick':
        case 'history':
          continue;

        case 'identifier':
          if (Helper.getClosest('title', e) !== null) {
            this.processTitle(e);
          }
          continue;

        case 'incip':
        case 'incipCode':
        case 'inciptext':
        case 'inscription':
        case 'instrDef':
        case 'instrGrp':
        case 'interpretation':
        case 'imprimatur':
        case 'imprint':
        case 'item':
        case 'itemList':
        case 'key':
        case 'keyAccid':
        case 'keySig':
        case 'l':
        case 'label':
        case 'labelAbbr':
        case 'language':
        case 'langUsage':
        case 'layer':
        case 'layerDef':
        case 'layout':
        case 'layoutDesc':
        case 'lb':
          continue;

        case 'lem':
          doRecurse = true;
          break;

        case 'lg':
        case 'li':
        case 'ligature':
        case 'line':
        case 'liquescent':
        case 'list':
        case 'locus':
        case 'locusGrp':
        case 'lv':
          continue;

        case 'manifestation':
          this.processManifestation(e);
          continue;

        case 'manifestationList':
          doRecurse = true;
          break;

        case 'mapping':
        case 'marker':
        case 'mdiv':
          doRecurse = true;
          break;

        case 'meter':
        case 'measure':
        case 'mensur':
        case 'mensuration':
        case 'metaMark':
        case 'metaText':
        case 'meterSig':
        case 'meterSigGrp':
        case 'midi':
        case 'mNum':
        case 'monogr':
        case 'mordent':
        case 'multiRest':
        case 'multiRpt':
        case 'mRest':
        case 'mRpt':
        case 'mRpt2':
        case 'mSpace':
        case 'name':
        case 'nameLink':
        case 'namespace':
        case 'nc':
        case 'ncGrp':
        case 'neume':
        case 'normalization':
        case 'note':
        case 'noteOff':
        case 'noteOn':
          continue;

        case 'notesStmt':
          doRecurse = true;
          break;

        case 'num':
        case 'octave':
        case 'oLayer':
        case 'orig':
        case 'oricus':
        case 'ornam':
        case 'ossia':
        case 'oStaff':
        case 'otherChar':
          continue;

        case 'p':
          this.updateHeaderMiscElement(e, true);
          continue;

        case 'pad':
        case 'part':
        case 'parts':
        case 'patch':
        case 'pb':
        case 'pedal':
        case 'performance':
        case 'perfDuration':
        case 'perfMedium':
        case 'perfRes':
        case 'perfResList':
        case 'periodName':
          continue;

        case 'persName':
          this.processPersName(e);
          continue;

        case 'pgDesc':
        case 'pgFoot':
          continue;

        case 'pgHead':
          this.processPgHead(e);
          continue;

        case 'phrase':
        case 'physDesc':
        case 'physloc':
        case 'physMedium':
        case 'plateNum':
        case 'playingSpeed':
        case 'plica':
        case 'port':
          continue;

        case 'postCode':
        case 'postBox':
        case 'street':
        case 'bloc':
        case 'country':
        case 'district':
        case 'geogFeat':
        case 'geogName':
        case 'region':
        case 'settlement':
          this.addToSource(e);
          continue;

        case 'price':
        case 'prog':
          continue;

        case 'projectDesc':
          doRecurse = true;
          break;

        case 'propName':
        case 'propValue':
        case 'proport':
        case 'provenance':
        case 'ptr':
          continue;

        case 'publisher':
          this.processPublisher(e);
          continue;

        case 'pubStmt':
          doRecurse = true;
          break;

        case 'q':
        case 'quilisma':
        case 'quote':
        case 'recipient':
        case 'recording':
        case 'ref':
        case 'referain':
          continue;

        case 'reg':
        case 'rdg':
          doRecurse = true;
          break;

        case 'reh':
        case 'relation':
        case 'relationList':
        case 'relatedItem':
        case 'rend':
        case 'resp':
          continue;

        case 'respStmt':
          doRecurse = true;
          break;

        case 'repeatMark':
        case 'repository':
        case 'rest':
        case 'restore':
          continue;

        case 'revisionDesc':
          doRecurse = true;
          break;

        case 'role':
        case 'roleDesc':
        case 'roleName':
          continue;

        case 'samplingDecl':
          doRecurse = true;
          break;

        case 'rubric':
        case 'sb':
        case 'score':
        case 'scoreDef':
        case 'scoreFormat':
        case 'scriptDesc':
        case 'secFolio':
        case 'section':
        case 'seal':
        case 'sealDesc':
        case 'seg':
        case 'segmentation':
        case 'seqNum':
        case 'series':
          continue;

        case 'seriesStmt':
          doRecurse = true;
          break;

        case 'sic':
        case 'signatures':
        case 'signiLet':
        case 'slur':
        case 'soundChan':
        case 'source':
        case 'sp':
        case 'space':
        case 'speaker':
        case 'specRepro':
          continue;

        case 'sourceDesc':
          doRecurse = true;
          break;

        case 'stack':
        case 'staff':
        case 'staffDef':
        case 'staffGrp':
        case 'stageDir':
        case 'stamp':
        case 'stdVals':
        case 'stem':
        case 'strophicus':
        case 'styleName':
        case 'subst':
        case 'supplied':
        case 'support':
        case 'supportDesc':
        case 'surface':
        case 'syl':
        case 'syllable':
        case 'symbol':
        case 'symbolDef':
        case 'symbolTable':
        case 'sysReq':
        case 'table':
        case 'tagsDecl':
        case 'tagUsage':
        case 'taxonomy':
        case 'td':
        case 'tempo':
        case 'term':
        case 'termList':
        case 'textLang':
        case 'th':
        case 'tie':
        case 'titlePage':
          continue;

        case 'title':
          this.processTitle(e);
          doRecurse = true;
          break;

        case 'titlePart':
          this.processTitle(e);
          continue;

        case 'titleStmt':
          doRecurse = true;
          break;

        case 'tr':
        case 'trackConfig':
        case 'treatHist':
        case 'treadShed':
        case 'trill':
        case 'trkName':
        case 'tup':
        case 'tuplet':
        case 'tupletSpan':
        case 'turn':
        case 'typeDesc':
        case 'typeNote':
        case 'unclear':
          continue;

        case 'unpub':
          this.updateHeaderMiscStrings('unpub', 'Unpublished');
          continue;

        case 'useRestrict':
        case 'vel':
        case 'verse':
        case 'volta':
        case 'watermark':
        case 'when':
        case 'width':
          continue;

        case 'work':
          this.processWork(e);
          doRecurse = true;
          break;

        case 'workList':
          this.workList = [];
          doRecurse = true;
          break;

        case 'zone':
          continue;

        default:
          doRecurse = true;
          break;
      }
      this.convertHead(e);
    }
  }

  /**
   * recursively traverse the mei tree (depth first) starting at the root element
   */
  private convertMusic(root: Element): void {
    const es = root.getChildElements();
    for (let i = 0; i < es.size(); ++i) {
      const e = es.get(i);

      switch (e.getLocalName()) {
        case 'abbr':
          continue;

        case 'accid':
          this.processAccid(e);
          continue;

        case 'add':
          break;

        case 'anchorText':
          continue;

        case 'annot':
          continue;

        case 'app':
          continue;

        case 'arpeg':
          break;

        case 'artic':
          continue;

        case 'barline':
          continue;

        case 'beam':
          break;

        case 'beamSpan':
          continue;

        case 'beatRpt':
          continue;

        case 'bend':
          continue;

        case 'body':
          break;

        case 'breath':
          continue;

        case 'bTrem':
          break;

        case 'caesura':
          continue;

        case 'choice':
          continue;

        case 'chord':
          if (e.getAttribute('grace') !== null) continue;
          break;

        case 'chordTable':
          continue;

        case 'clef':
          this.processClef(e);
          continue;

        case 'clefGrp':
          break;

        case 'corr':
          break;

        case 'curve':
          continue;

        case 'custos':
          continue;

        case 'damage':
          continue;

        case 'del':
          continue;

        case 'dir':
          continue;

        case 'div':
          continue;

        case 'dot':
          this.processDot(e);
          continue;

        case 'dynam':
          continue;

        case 'ending':
          break;

        case 'expan':
          break;

        case 'expansion':
          continue;

        case 'fermata':
          continue;

        case 'fTrem':
          break;

        case 'gap':
          continue;

        case 'gliss':
          continue;

        case 'grpSym':
          continue;

        case 'hairpin':
          continue;

        case 'halfmRpt':
          break;

        case 'handShift':
          continue;

        case 'harm':
          continue;

        case 'harpPedal':
          continue;

        case 'incip':
          continue;

        case 'ineume':
          continue;

        case 'instrDef':
          continue;

        case 'instrGrp':
          continue;

        case 'keyAccid':
          continue;

        case 'keySig':
          this.processKeySig(e);
          break;

        case 'label':
          continue;

        case 'layer':
          this.processLayer(e);
          continue;

        case 'layerDef':
          break;

        case 'lb':
          continue;

        case 'lem':
          continue;

        case 'line':
          continue;

        case 'lyrics':
          break;

        case 'mdiv':
          if (Helper.getFirstChildElement('mdiv', e) === null) {
            this.processMdiv(e);
          }
          break;

        case 'measure':
          if (this.twIsCurrent) {
            this.processMeasureTW(e);
            break;
          } else if (this.pwIsCurrent) {
            this.processMeasurePW(e);
            break;
          }
          // fall through if neither is current
          break;

        case 'mensur':
          continue;

        case 'meterSig':
          this.processMeterSig(e);
          break;

        case 'meterSigGrp':
          break;

        case 'midi':
          continue;

        case 'mordent':
          continue;

        case 'mRest':
          this.processNote(e);
          continue;

        case 'mRpt':
          break;

        case 'mRpt2':
          break;

        case 'mSpace':
          this.processNote(e);
          continue;

        case 'multiRest':
          continue;

        case 'multiRpt':
          break;

        case 'note':
          this.processNote(e);
          break;

        case 'octave':
          break;

        case 'oLayer':
          continue;

        case 'orig':
          break;

        case 'ornam':
          continue;

        case 'part':
          break;

        case 'parts':
          this.processParts(e);
          break;

        case 'pb':
          break;

        case 'pgHead':
          this.processPgHead(e);
          continue;

        case 'phrase':
          continue;

        case 'physDesc':
          continue;

        case 'port':
          continue;

        case 'pp':
          continue;

        case 'rdg':
          continue;

        case 'ref':
          continue;

        case 'reg':
          continue;

        case 'reh':
          continue;

        case 'rend':
          continue;

        case 'repeat':
          continue;

        case 'rest':
          if (e.getAttribute('grace') !== null) continue;
          this.processNote(e);
          break;

        case 'score':
          this.processScore(e);
          break;

        case 'scoreDef':
          this.processScoreDef(e);
          break;

        case 'section':
          if (this.pwIsCurrent) {
            this.processSectionPW(e);
          } else if (this.twIsCurrent) {
            // this.processSectionTW(e);
          }
          break;

        case 'seg':
          continue;

        case 'sic':
          continue;

        case 'slash':
          continue;

        case 'slur':
          continue;

        case 'smufl':
          continue;

        case 'sound':
          continue;

        case 'space':
          this.processNote(e);
          continue;

        case 'staff':
          if (this.twIsCurrent) {
            this.processStaffTW(e);
            break;
          }
          break;

        case 'staffDef':
          if (this.twIsCurrent) {
            if (Helper.getParentElement(e)!.getLocalName() !== 'staffGrp') {
              break;
            }
          } else if (this.pwIsCurrent) {
            const scoreDef = Helper.getClosest('scoreDef', e);
            if (scoreDef !== null) {
              if (Helper.getParentElement(scoreDef)!.getLocalName() !== 'part') {
                break;
              }
            } else {
              if (
                Helper.getPreviousSiblingElement('scoreDef', e) !== null ||
                Helper.getPreviousSiblingElement('staffDef', e) !== null ||
                Helper.getParentElement(e)!.getLocalName() === 'section'
              ) {
                break;
              }
            }
          }
          this.processStaffDef(e);
          break;

        case 'staffGrp':
          if (Helper.getClosest('section', e) !== null) continue;
          this.processStaffGrp(e);
          continue;

        case 'stem':
          this.processStem(e);
          continue;

        case 'syl':
          continue;

        case 'tempo':
          continue;

        case 'tenuto':
          continue;

        case 'tier':
          continue;

        case 'tie':
          continue;

        case 'trem':
          break;

        case 'trill':
          continue;

        case 'tuplet':
          break;

        case 'verse':
          continue;

        case 'view':
          continue;

        case 'vocal':
          continue;

        case 'zone':
          continue;

        default:
        // we do not care about any other element
      }

      this.convertMusic(e);
    }
  }

  /**
   * Initialize header + map info from to MusicXML.
   */
  private initHeader(): void {
    this.header.setWork(new Work());
    this.header.setMovementNumber('');
    this.header.setMovementTitle('');
    this.header.setIdentification(new Identification());
    this.header.getIdentification()!.setEncoding(new Encoding());
    this.header.setDefaults(new Defaults());
    this.header.getCredit(); // ensure it exists
    this.header.setPartList(new PartList());

    // Some defaults
    const meicoString = 'meico';
    this.addTypedTextToEncoding(meicoString, '', 'software');
    const now = new Date();
    const yyyy = now.getFullYear().toString();
    const mm = (now.getMonth() + 1).toString().padStart(2, '0');
    const dd = now.getDate().toString().padStart(2, '0');
    const date = `${yyyy}-${mm}-${dd}`;
    this.addTypedTextToEncoding(date, '', 'encoding-date');
  }

  /**
   * Process Pers Name Element.
   */
  private processPersName(persName: Element): void {
    const role = persName.getAttribute('role');
    if (role === null) {
      return;
    }
    const roleVal = role.getValue().trim();
    switch (roleVal) {
      case 'author':
      case 'composer':
      case 'lyricist':
        this.addToCreator(persName, roleVal);
        this.addToCreditWithStrings(persName.getValue().trim(), roleVal);
        break;
      case 'encoder':
        this.addTypedTextToEncoding(persName.getValue().trim(), 'encoder', 'encoder');
        break;
    }
  }

  /**
   * Helper Function to add new Entry to Identification/Encoding
   */
  private addTypedTextToEncoding(value: string, typeVal: string | null, qnameString: string): void {
    const tt = new TypedText();
    tt.setValue(value);
    if (typeVal !== null && typeVal !== '') {
      tt.setType(typeVal);
    }
    this.header
      .getIdentification()!
      .getEncoding()!
      .getEncodingDateOrEncoderOrSoftware()
      .push(new JAXBElement<TypedText>(qnameString, 'TypedText', tt));
  }

  /**
   * Process title Element and add info to header element
   */
  private processTitle(title: Element): void {
    if (title.getChildCount() === 0) return;
    let attr = title.getAttributeValue('type');
    const titleChild = title.getChild(0);
    if (titleChild === undefined || titleChild === null) return;
    const value_raw = titleChild.getValue();
    if (value_raw === null || value_raw === '') return;
    if (
      (title.getLocalName() === 'title' && (attr === null || attr === '')) ||
      title.getLocalName() === 'identifier'
    ) {
      attr = 'main';
    }
    if (Helper.getClosest('titleStmt', title) === null) return;
    const value = value_raw.trim();
    let workTitle = this.header.getWork()!.getWorkTitle();
    switch (attr) {
      case 'uniform':
        this.header.getWork()!.setWorkTitle(value);
        break;
      case 'main':
        workTitle = this.header.getWork()!.getWorkTitle();
        if (workTitle === null || workTitle === '') {
          this.header.getWork()!.setWorkTitle(value);
        } else {
          workTitle += `. ${value}`;
          this.header.getWork()!.setWorkTitle(workTitle);
        }
        const creditsToRemove: Credit[] = [];
        for (const c of this.header.getCredit()) {
          for (const o of c.getCreditTypeOrLinkOrBookmark()) {
            if (typeof o === 'string') {
              if (o === 'title') creditsToRemove.push(c);
            }
          }
        }
        for (const c of creditsToRemove) {
          const idx = this.header.getCredit().indexOf(c);
          if (idx !== -1) this.header.getCredit().splice(idx, 1);
        }
        this.addToCreditWithStrings(this.header.getWork()!.getWorkTitle()!, 'title');
        break;
      case 'subordinate': {
        const pattern = /(n.{0,2}\d+|op.{0,2}\d+)/i;
        const matches = value.match(new RegExp(pattern, 'gi'));
        let hasFound = false;
        if (matches) {
          for (const match of matches) {
            hasFound = true;
            let wn = this.header.getWork()!.getWorkNumber();
            if (wn !== null && wn.trim() === '') {
              wn += `, ${match}`;
            } else {
              wn = match;
            }
            this.header.getWork()!.setWorkNumber(wn);
          }
        }

        if (!hasFound) {
          if (
            this.header.getWork()!.getWorkTitle() !== null &&
            this.header.getWork()!.getWorkTitle() === value
          )
            break;
          this.addToCreditWithStrings(value, 'subtitle');
        }
        break;
      }
      case 'alternative':
        this.header.setMovementTitle(value);
        break;
      case 'number':
        this.header.getWork()!.setWorkNumber(value);
        break;
    }
  }

  /**
   * Take the element and write it to SourceBuilder.
   */
  private addToSource(e: Element): void {
    const val = e.getValue();
    if (val === null || val === '') return;
    const sanitizedVal = this.sanitize(val.trim());
    let addressBuilder = `${e.getLocalName().charAt(0).toUpperCase() + e.getLocalName().substring(1)}:`;
    addressBuilder += this.endLine;
    addressBuilder += sanitizedVal + this.endLine;
    this.sourceBuilder.push(addressBuilder);
  }

  /**
   * Add a new Creator.
   */
  private addToCreator(e: Element, typeName: string): void {
    if (typeName === null || typeName === '') {
      return;
    }
    const creator = new TypedText();
    creator.setType(typeName);
    creator.setValue(this.sanitize(e.getValue()));
    const cList = this.header.getIdentification()!.getCreator();
    let creatorFound = false;
    for (const c of cList) {
      if (c.equals(creator)) {
        creatorFound = true;
        break;
      }
    }
    if (!creatorFound) {
      this.header.getIdentification()!.getCreator().push(creator);
    }
  }

  /**
   * Add a new Credit from Element. Each Credit has one credit-type and one credit-words
   */
  private addToCredit(e: Element): void {
    const c = new Credit();
    c.getCreditTypeOrLinkOrBookmark().push(e.getLocalName());
    const cwords = new FormattedText();
    cwords.setValue(this.sanitize(e.getValue()));
    c.getCreditTypeOrLinkOrBookmark().push(cwords);
    this.header.getCredit().push(c);
  }

  /**
   * Add a new Credit with string arguments.
   */
  private addToCreditWithStrings(cwordsVal: string, ctypeVal: string): void {
    const c = new Credit();
    c.getCreditTypeOrLinkOrBookmark().push(ctypeVal);
    const cwords = new FormattedText();
    cwords.setValue(this.sanitize(cwordsVal));
    c.getCreditTypeOrLinkOrBookmark().push(cwords);
    c.setPage(1);
    this.header.getCredit().push(c);
  }

  /**
   * Add the sourceBuilder contents to //Identification/Source
   */
  private concatSourceBuilder(): void {
    if (this.sourceBuilder.length > 0) {
      const src = this.sanitize(this.sourceBuilder.join(''));
      if (this.originalHeader === null) return;
      this.originalHeader.getIdentification()!.setSource(src);
      for (const sp of this.workList) {
        sp.getIdentification()!.setSource(src);
      }
    }
  }

  /**
   * Process a mei app element (critical apparatus)
   */
  private processApp(app: Element, processInHeader: boolean): void {
    let takeThisReading = Helper.getFirstChildElement('lem', app);

    if (takeThisReading === null) {
      takeThisReading = Helper.getFirstChildElement('rdg', app);
      if (takeThisReading === null) {
        return;
      }
    }

    this.convertByFlag(app, processInHeader);
  }

  /**
   * Process application name.
   */
  private processApplication(application: Element): void {
    const name = Helper.getFirstChildElement('name', application);
    if (name !== null) {
      this.addTypedTextToEncoding(this.sanitize(name.getValue()), null, 'software');
    }
  }

  /**
   * Process address line and add to source builder.
   */
  private processAddrLine(addrLine: Element): void {
    const val = addrLine.getValue();
    if (val === null || val === '') return;
    this.sourceBuilder.push(this.sanitize(val) + this.endLine);
  }

  /**
   * Process an mei choice element
   */
  private processChoice(choice: Element, processInHeader: boolean): void {
    const prefOrder = ['corr', 'reg', 'expan', 'subst', 'choice', 'orig', 'unclear', 'sic', 'abbr'];

    let c: Element | null = null;
    for (let i = 0; c === null && i < prefOrder.length; ++i) {
      c = Helper.getFirstChildElement(prefOrder[i], choice);
    }

    if (c !== null) {
      if (c.getLocalName() === 'choice') this.processChoice(c, processInHeader);
      else this.convertByFlag(c, processInHeader);
      return;
    }

    // nothing found
    const children = choice.getChildElements();
    if (children.size() > 0) {
      const first = children.get(0);
      if (first !== null) this.convertByFlag(first, processInHeader);
    }
  }

  /**
   * Add publisher to sourceBuilder.
   */
  processPublisher(publisher: Element): void {
    const val = publisher.getValue();
    if (val === null || val === '') return;
    this.sourceBuilder.push(`Publisher: ${this.sanitize(val)}${this.endLine}`);
  }

  /**
   * Add given Date to source string.
   */
  private processDate(date: Element): void {
    const dateVal = date.getValue().trim();
    const dateAttr = date.getAttributeValue('isodate');
    let dateString = '';
    if (dateAttr !== null && dateAttr !== '') {
      dateString = dateAttr;
    }
    if (dateVal !== null && dateVal !== '') {
      dateString = dateVal;
    }
    if (dateString === '') return;
    this.sourceBuilder.push(`Date: ${dateString}${this.endLine}`);
  }

  /**
   * Process work instances.
   */
  private processWork(work: Element): void {
    this.checkAndSetOriginalHeader();
    const clonedHeader = this.cloneScore(this.originalHeader!);
    if (Helper.getFirstChildElement('componentList', work) !== null) {
      return;
    }
    this.workList.push(clonedHeader!);
    this.header = clonedHeader!;
  }

  /**
   * Clone any ScorePartwise Object via deep copy.
   */
  private cloneScore(score: ScorePartwise): ScorePartwise | null {
    try {
      // Deep clone by serializing to JSON and back
      return JSON.parse(
        JSON.stringify(score, (key, value) => {
          if (typeof value === 'function') return undefined;
          return value;
        }),
      ) as ScorePartwise;
    } catch (e) {
      console.error(e);
      return null;
    }
  }

  /**
   * Deep clone a ScorePartwise with proper class instances
   */
  private cloneScorePartwise(score: ScorePartwise): ScorePartwise {
    const copy = new ScorePartwise();
    if (score.work) {
      copy.work = new Work();
      copy.work.workTitle = score.work.workTitle;
      copy.work.workNumber = score.work.workNumber;
    }
    copy.movementNumber = score.movementNumber;
    copy.movementTitle = score.movementTitle;
    if (score.identification) {
      copy.identification = new Identification();
      copy.identification.source = score.identification.source;
      if (score.identification.encoding) {
        copy.identification.encoding = new Encoding();
        copy.identification.encoding.encodingDateOrEncoderOrSoftware = [
          ...score.identification.encoding.encodingDateOrEncoderOrSoftware,
        ];
      }
      copy.identification.creator = [...score.identification.creator];
      if (score.identification.miscellaneous) {
        copy.identification.miscellaneous = new Miscellaneous();
        copy.identification.miscellaneous.miscellaneousField = [
          ...score.identification.miscellaneous.miscellaneousField,
        ];
      }
    }
    if (score.defaults) {
      copy.defaults = new Defaults();
      copy.defaults.pageLayout = score.defaults.pageLayout;
      copy.defaults.systemLayout = score.defaults.systemLayout;
      copy.defaults.staffLayout = [...score.defaults.staffLayout];
      copy.defaults.musicFont = score.defaults.musicFont;
      copy.defaults.wordFont = score.defaults.wordFont;
      copy.defaults.lyricFont = [...score.defaults.lyricFont];
    }
    copy.credit = [...score.credit];
    if (score.partList) {
      copy.partList = new PartList();
      copy.partList.partGroupOrScorePart = [...score.partList.partGroupOrScorePart];
    }
    copy.version = score.version;
    copy.part = [...score.part];
    return copy;
  }

  /**
   * Map element to miscellaneous field
   */
  private processMisc(e: Element, readValue: boolean): void {
    if (e.getValue() === null) return;
    const path = this.getXMLPath(e, '/');
    const misc = this.header.getIdentification()!.getMiscellaneous();
    if (misc === null) {
      this.header.getIdentification()!.setMiscellaneous(new Miscellaneous());
    }
    const miscField = new MiscellaneousField();
    miscField.setName(path);
    if (readValue) {
      miscField.setValue(this.sanitize(e.getValue()));
    } else {
      miscField.setValue(this.sanitize(e.toXML()));
    }
    this.header.getIdentification()!.getMiscellaneous()!.getMiscellaneousField().push(miscField);
  }

  /**
   * Map element to miscellaneous field with arbitrary fieldName and values.
   */
  private processMiscStrings(fieldName: string | null, val: string | null): void {
    if (fieldName === null || val === null) return;
    val = this.sanitize(val);
    const misc = this.header.getIdentification()!.getMiscellaneous();
    if (misc === null) {
      this.header.getIdentification()!.setMiscellaneous(new Miscellaneous());
    }
    const miscField = new MiscellaneousField();
    miscField.setName(fieldName);
    miscField.setValue(val);
    this.header.getIdentification()!.getMiscellaneous()!.getMiscellaneousField().push(miscField);
  }

  /**
   * Update the miscellaneous field for all headers.
   */
  updateHeaderMiscElement(e: Element, readValue: boolean): void {
    this.checkAndSetOriginalHeader();
    this.header = this.originalHeader!;
    this.processMisc(e, readValue);
    for (const h of this.workList) {
      this.header = h;
      this.processMisc(e, readValue);
    }
  }

  /**
   * Update the miscellaneous field for all headers with arbitrary fieldName and values.
   */
  updateHeaderMiscStrings(fieldName: string, val: string): void {
    this.checkAndSetOriginalHeader();
    this.header = this.originalHeader!;
    this.processMiscStrings(fieldName, val);
    for (const h of this.workList) {
      this.header = h;
      this.processMiscStrings(fieldName, val);
    }
  }

  /**
   * Find path to Element and concatenate string with separator
   */
  private getXMLPath(e: Element, sep: string): string {
    let temp: Element | null = e;
    let path = e.getLocalName();
    do {
      temp = Helper.getParentElement(temp!);
      if (temp === null) break;
      path = temp.getLocalName() + sep + path;
    } while (temp !== this.mei!.getMeiHead() || temp !== this.mei!.getMusic());
    return path;
  }

  /**
   * Process Manifestation Element.
   */
  private processManifestation(manifestation: Element): void {
    const height = manifestation.query('.//mei:layout//mei:height');
    const width = manifestation.query('.//mei:layout//mei:width');
    const defaults = this.header.getDefaults()!;
    if (height.size() > 0 && width.size() > 0) {
      if (defaults.getPageLayout() === null) {
        defaults.setPageLayout(new PageLayout());
      }
      try {
        defaults.getPageLayout()!.setPageHeight(parseFloat(height.get(0).getValue().trim()));
        defaults.getPageLayout()!.setPageWidth(parseFloat(width.get(0).getValue().trim()));
      } catch (e) {
        console.error(e);
      }
    }

    this.updateHeaderMiscElement(manifestation, false);
  }

  /**
   * Process mdiv element
   */
  private processMdiv(mdiv: Element): void {
    const movementN = mdiv.getAttributeValue('n');
    if (movementN !== null && movementN !== '') {
      this.header.setMovementNumber(movementN);
    }
  }

  /**
   * For now find potential worktitle or composer
   */
  private processPgHead(pgHead: Element): void {
    const title = pgHead.query("//mei:rend[@type='title']");
    const composer = pgHead.query("//mei:rend[@type='composer']");

    const titString = this.header.getWork()!.getWorkTitle();
    if (title.size() > 0) {
      const titVal = (title.get(0) as unknown as Element).getValue().trim();
      const hasTit = titString === titVal;
      if (!hasTit)
        this.header.getWork()!.setWorkTitle((title.get(0) as unknown as Element).getValue().trim());
    }

    let composerName = '';
    if (composer.size() > 0) {
      let hasComposer = false;
      for (const c of this.header.getCredit()) {
        for (const o of c.getCreditTypeOrLinkOrBookmark()) {
          composerName = composer.get(0).getValue().trim();
          if (o.toString() === composerName) {
            hasComposer = true;
          }
        }
      }
      if (!hasComposer) {
        this.addToCreator(composer.get(0) as unknown as Element, 'composer');
        this.addToCreditWithStrings(composerName, 'composer');
      }
    }
  }

  /**
   * Copies the header information to the currently processed score.
   */
  copyHeaderToScore(): void {
    const copy = this.cloneScorePartwise(this.header);
    if (copy === null) return;
    if (this.twIsCurrent) {
      this.currentScoreTimewise!.setDefaults(copy.getDefaults()!);
      this.currentScoreTimewise!.setIdentification(copy.getIdentification()!);
      this.currentScoreTimewise!.setVersion(copy.getVersion()!);
      this.currentScoreTimewise!.setWork(copy.getWork()!);
      this.currentScoreTimewise!.setMovementTitle(copy.getMovementTitle()!);
      this.currentScoreTimewise!.setMovementNumber(copy.getMovementNumber()!);
      this.currentScoreTimewise!.setPartList(copy.getPartList()!);
      for (const c of copy.getCredit()) {
        this.currentScoreTimewise!.getCredit().push(c);
      }
    } else if (this.pwIsCurrent) {
      this.currentScorePartwise!.setDefaults(copy.getDefaults()!);
      this.currentScorePartwise!.setIdentification(copy.getIdentification()!);
      this.currentScorePartwise!.setVersion(copy.getVersion()!);
      this.currentScorePartwise!.setWork(copy.getWork()!);
      this.currentScorePartwise!.setMovementTitle(copy.getMovementTitle()!);
      this.currentScorePartwise!.setMovementNumber(copy.getMovementNumber()!);
      this.currentScorePartwise!.setPartList(copy.getPartList()!);
      for (const c of copy.getCredit()) {
        this.currentScorePartwise!.getCredit().push(c);
      }
    }
  }

  private processStaffGrp(staffGrp: Element): void {
    const pgStart = new PartGroup();
    pgStart.setType(StartStop.START);
    this.partList!.getPartGroupOrScorePart().push(pgStart);

    this.convertMusic(staffGrp);

    const pgStop = new PartGroup();
    pgStop.setType(StartStop.STOP);
    this.partList!.getPartGroupOrScorePart().push(pgStop);

    this.addPartlistToScore();
    this.partList = new PartList();
  }

  /**
   * Read Information from staffDef.
   */
  private processStaffDef(staffDef: Element): void {
    const scorePart = new ScorePart();
    let num = 1;
    if (this.partListIds.length > 0) {
      const lastId = this.partListIds[this.partListIds.length - 1];
      const match = lastId.match(/\d+/);
      if (match) {
        const numberStr = match[0];
        num += parseInt(numberStr);
      }
    }
    scorePart.setId(`s${num}`);
    const partName = new PartName();
    const label = Helper.getFirstChildElement('label', staffDef);
    if (label !== null) {
      partName.setValue(label.getValue());
    }
    scorePart.setPartName(partName);

    this.partListIds.push(scorePart.getId());
    this.partList!.getPartGroupOrScorePart().push(scorePart);
    if (Helper.getParentElement(staffDef)!.getLocalName() !== 'staffGrp') this.addPartlistToScore();
  }

  /**
   * Declare currentPartTW and add it to the currentMeasure
   */
  processStaffTW(staff: Element): void {
    const staffN = staff.getAttributeValue('n');
    let sp: ScorePart | null = null;
    if (staffN !== null) {
      sp = this.findScorePartByN(staffN);
    } else {
      const staffIdx = Helper.getAllChildElements(
        'staff',
        Helper.getParentElement(staff)!,
      )!.indexOf(staff);
      if (staffIdx >= 0) {
        sp = this.findScorePartByN(`${staffIdx + 1}`);
      }
    }
    if (sp === null) {
      let idx = -1;
      if (this.currentPartTW !== null) {
        idx = this.currentScoreTimewise!.getPartList()!
          .getPartGroupOrScorePart()
          .indexOf(this.currentPartTW);
      }
      let id = '';
      if (idx === -1) {
        id = '1_1';
      } else if (this.currentPartTW !== null) {
        const cpID = (this.currentPartTW.getId() as ScorePart).getId();
        if (cpID !== null && cpID !== '') {
          const lastDigitC = cpID.charAt(cpID.length - 1);
          let lastDigitInt = parseInt(lastDigitC);
          lastDigitInt += 1;
          id += `_${lastDigitInt}`;
        } else {
          id = uuidv4();
        }
      }
      id = `s${id}`;
      const scorePart = new ScorePart();
      scorePart.setId(id);
      const pn = new PartName();
      pn.setValue('Unknown Part');
      scorePart.setPartName(pn);
      this.currentScoreTimewise!.getPartList()!
        .getPartGroupOrScorePart()
        .splice(idx + 1, 0, scorePart);
      sp = scorePart;
    }
    const p = new ScoreTimewiseMeasurePart();
    p.setId(sp);
    this.currentPartTW = p;
    for (const bl of this.barlines) {
      this.addObjectToMeasureOrPart(bl);
    }
    this.currentMeasureTW!.getPart().push(p);
  }

  /**
   * Update this.partList for current score after processing
   */
  private addPartlistToScore(): void {
    const sp = new ScorePartwise();
    sp.setPartList(this.partList!);

    const cloned = this.cloneScorePartwise(sp);
    if (cloned === null || cloned.getPartList() === null) return;

    for (const p of cloned.getPartList()!.getPartGroupOrScorePart()) {
      if (this.twIsCurrent) {
        this.currentScoreTimewise!.getPartList()!.getPartGroupOrScorePart().push(p);
      } else if (this.pwIsCurrent) {
        this.currentScorePartwise!.getPartList()!.getPartGroupOrScorePart().push(p);
      }
    }
  }

  /**
   * Write a new measure to the current score-timewise.
   */
  private createMeasureListTW(measure: Element): void {
    const m = new ScoreTimewiseMeasure();
    const mList = this.currentScoreTimewise!.getMeasure();

    let n = '';
    if (mList.length > 0) {
      n += mList.length + 1;
    } else {
      n = '1';
    }

    m.setNumber(n);
    mList.push(m);
  }

  /**
   * Write a new measure to the current score-partwise.
   */
  private processMeasurePW(measure: Element): void {
    const m = new ScorePartwisePartMeasure();
    const mList = this.currentPartPW!.getMeasure();

    if (this.measureListMEI.length === 0) {
      const closestPart = Helper.getClosest('part', measure);
      if (closestPart !== null) {
        const ml = closestPart.query('.//mei:measure');
        for (let i = 0; i < ml.size(); i++) {
          this.measureListMEI.push(ml.get(i) as unknown as Element);
        }
      }
    }
    if (this.tieListMEI.length > 0) {
      this.prevMeasureTieListMEI = [...this.tieListMEI];
    }
    this.tieListMEI = Helper.getAllChildElements('tie', measure) ?? [];

    let n = '';
    if (mList.length > 0) {
      n += mList.length + 1;
    } else {
      n = '1';
    }

    m.setNumber(n);
    this.currentMeasurePW = m;
    this.barlines = [];
    this.createRepeatFromMeasure(measure);
    for (const bl of this.barlines) {
      this.addObjectToMeasureOrPart(bl);
    }
    mList.push(this.currentMeasurePW);
  }

  /**
   * Process layer element.
   */
  private processLayer(layer: Element): void {
    let voice = layer.getAttributeValue('n');
    voice = voice !== null ? voice : this.findElementInParent(layer).get('num')!.toString();
    this.currentVoice = voice;

    if (this.isPrevAttributeDifferent(layer)) {
      const localAttr = this.createAttributesFromDiffDefinition();
      this.defDiff = null;
      if (this.twIsCurrent) this.currentPartTW!.getNoteOrBackupOrForward().push(localAttr);
      if (this.pwIsCurrent) this.currentMeasurePW!.getNoteOrBackupOrForward().push(localAttr);
    }

    this.convertMusic(layer);

    const layerSibling = Helper.getNextSiblingElement('layer', layer);
    if (layerSibling !== null) {
      let accumulatedDurs = 0;
      if (this.twIsCurrent)
        accumulatedDurs = this.accumulate(this.currentPartTW!.getNoteOrBackupOrForward());
      if (this.pwIsCurrent)
        accumulatedDurs = this.accumulate(this.currentMeasurePW!.getNoteOrBackupOrForward());
      if (accumulatedDurs !== 0 || (Helper.getAllChildElements(layer) ?? []).length === 0) {
        const backup = new Backup();
        backup.setDuration(accumulatedDurs);
        this.addObjectToMeasureOrPart(backup);
      }
    }
  }

  /**
   * Process keySig element
   */
  private processKeySig(keySig: Element): void {
    const keySigVal = keySig.getAttributeValue('sig');
    if (keySigVal === null || keySigVal === '') return;
    const key = new Key();
    let fifths = parseInt(keySigVal.substring(0, 1));
    if (keySigVal.includes('f')) {
      fifths = fifths * -1;
    }
    key.setFifths(fifths);
    if (Helper.getParentElement(keySig)!.getLocalName() === 'layer') {
      const attr = new Attributes();
      attr.getKey().push(key);
      this.addObjectToMeasureOrPart(attr);
    }
  }

  /**
   * Process clef element
   */
  private processClef(clefElement: Element): void {
    const clef = new Clef();
    const clefShape = clefElement.getAttributeValue('shape');
    const clefLine = clefElement.getAttributeValue('line');
    const dis = clefElement.getAttributeValue('dis');
    const disPlace = clefElement.getAttributeValue('dis.place');
    let addClef = false;
    if (clefLine !== null && clefLine !== '') {
      clef.setLine(parseInt(clefLine));
      addClef = true;
    }
    if (clefShape !== null && clefShape !== '' && addClef) {
      clef.setSign(clefShape as ClefSign);
    } else {
      addClef = false;
    }

    if (dis !== null && dis !== '' && disPlace !== null && disPlace !== '') {
      let change = 0;
      switch (dis) {
        case '8':
          change = 1;
          break;
        case '15':
          change = 2;
      }
      if (disPlace === 'below') change *= -1;
      clef.setClefOctaveChange(change);
    }

    if (addClef) {
      if (Helper.getParentElement(clefElement)!.getLocalName() === 'layer') {
        const attr = new Attributes();
        attr.getClef().push(clef);
        this.addObjectToMeasureOrPart(attr);
      }
    }
  }

  /**
   * Process meterSig element
   */
  private processMeterSig(meterSig: Element): void {
    const time = new Time();
    const meterSymVal = meterSig.getAttributeValue('sym');
    const meterCount = meterSig.getAttributeValue('count');
    const meterUnit = meterSig.getAttributeValue('unit');
    const timeSig = time.getTimeSignature();
    let addTime = false;
    if (meterSymVal !== null && meterSymVal !== '') {
      time.setSymbol(meterSymVal as TimeSymbol);
      addTime = true;
    }
    if (meterCount !== null && meterCount !== '') {
      timeSig.push(new JAXBElement<string>('beats', 'String', meterCount));
      addTime = true;
    }
    if (meterUnit !== null && meterUnit !== '' && addTime) {
      timeSig.push(new JAXBElement<string>('beat-type', 'String', meterUnit));
    } else {
      addTime = false;
    }
    if (addTime) {
      // currently no-op as in Java (commented out in original)
    }
  }

  /**
   * Add Object to current part or current measure
   */
  private addObjectToMeasureOrPart(o: any): void {
    const allowedTypes = [
      MusicXmlNote,
      Backup,
      Forward,
      Direction,
      Attributes,
      Harmony,
      FiguredBass,
      Print,
      Sound,
      Barline,
      Grouping,
      Link,
      Bookmark,
    ];
    let doAdd = false;
    for (const t of allowedTypes) {
      if (o instanceof t) {
        doAdd = true;
        break;
      }
    }
    if (this.twIsCurrent && doAdd) this.currentPartTW!.getNoteOrBackupOrForward().push(o);
    if (this.pwIsCurrent && doAdd) this.currentMeasurePW!.getNoteOrBackupOrForward().push(o);
  }

  /**
   * Find if previous definition is different from current one
   */
  private isPrevAttributeDifferent(e: Element): boolean {
    const parentStaff = Helper.getParentElement(e)!;
    const parentMeasure = Helper.getParentElement(parentStaff)!;
    let prevMeasure = Helper.getPreviousSiblingElement('measure', parentMeasure);
    const section = Helper.getParentElement(parentMeasure)!;
    if (
      prevMeasure === null &&
      section.getLocalName() === 'section' &&
      Helper.getFirstChildElement('measure', section) === parentMeasure
    ) {
      const prevSection = Helper.getPreviousSiblingElement('section', section);
      if (prevSection !== null) {
        let measureChildren: Element[] | null = Helper.getAllChildElements('measure', prevSection);
        measureChildren =
          measureChildren === null || measureChildren.length === 0
            ? Helper.getAllDescendantsByName('measure', prevSection)
            : measureChildren;
        if (measureChildren !== null && measureChildren.length > 0)
          prevMeasure = measureChildren[measureChildren.length - 1];
      }
    }

    let prevDefinition: DefinitionType | null = null;
    const currentDef = this.findCorrespondingDefinition(parentStaff);

    if (this.twIsCurrent && e.getLocalName() === 'layer' && prevMeasure !== null) {
      const staffN = parentStaff.getAttributeValue('n');
      let staffIdx = 0;
      let targetStaff: Element | null = null;
      if (staffN === null || staffN === '') {
        staffIdx = Helper.getAllChildElements('staff', parentMeasure)!.indexOf(parentStaff);
        targetStaff = Helper.getAllChildElements('staff', prevMeasure)![staffIdx];
      } else {
        const sList = Helper.getAllChildElements('staff', prevMeasure)!;
        for (const el of sList) {
          const elN = el.getAttributeValue('n');
          if (elN !== null && elN !== '') {
            if (elN === staffN) {
              targetStaff = el;
              break;
            }
          }
        }
        if (targetStaff === null) {
          if (parseInt(staffN) - 1 === Helper.getAllChildElements('staff', prevMeasure)!.length) {
            if (this.twIsCurrent) this.addPartToPrevMeasure();
            return true;
          } else {
            targetStaff = Helper.getAllChildElements('staff', prevMeasure)![parseInt(staffN) - 1];
          }
        }
      }

      if (targetStaff === null) {
        prevDefinition = this.findCorrespondingDefinition(e);
      } else {
        prevDefinition = this.findCorrespondingDefinition(targetStaff);
      }
    } else {
      prevDefinition = this.currentDefinition;
    }

    if (prevMeasure === null || this.currentDefinition === null) {
      this.currentDefinition = currentDef;
      this.defDiff = currentDef;
      return true;
    }
    let b = false;
    if (prevDefinition !== null && currentDef !== null) {
      this.currentDefinition = currentDef;
      b = prevDefinition.equals(currentDef);
      if (!b) {
        b = prevDefinition.hasSubset(currentDef);
        this.defDiff = prevDefinition.getDiff();
        if (this.defDiff !== null && this.defDiff.getClefShape() !== null) {
          this.defDiff.setClefLine(currentDef.getClefLine());
          this.defDiff.setClefDisPlace(currentDef.getClefDisPlace());
          this.defDiff.setClefDis(currentDef.getClefDis());
        }
        if (
          this.defDiff !== null &&
          (this.defDiff.getMeterCount() !== null ||
            this.defDiff.getMeterUnit() !== null ||
            this.defDiff.getMeterSym() !== null)
        ) {
          this.defDiff.setMeterCount(currentDef.getMeterCount());
          this.defDiff.setMeterUnit(currentDef.getMeterUnit());
          this.defDiff.setMeterSym(currentDef.getMeterSym());
        }
      }
      if (!b) {
        this.currentDefinition = currentDef;
      }
    }

    return !b;
  }

  /**
   * Add a part to previous measure (in Timewise)
   */
  addPartToPrevMeasure(): void {
    const mList = this.currentScoreTimewise!.getMeasure();
    const measureIdx = mList.indexOf(this.currentMeasureTW!);
    const prevMeasure = mList[measureIdx - 1];
    const newPart = new ScoreTimewiseMeasurePart();
    const partIdx = this.currentMeasureTW!.getPart().indexOf(this.currentPartTW!);
    const sp = this.findScorePartByN(`${partIdx + 1}`);
    if (sp === null) return;
    const prevPart = this.currentMeasureTW!.getPart()[partIdx - 1];
    const dur = this.accumulate(prevPart.getNoteOrBackupOrForward());
    if (dur === 0) return;
    newPart.setId(sp);
    const n = new MusicXmlNote();
    n.setVoice('1');
    const nt = new NoteType();
    nt.setValue(Helper.duration2word(dur.toString()));
    n.setType(nt);
    n.setRest(new Rest());
    n.setDuration(dur);
    newPart.getNoteOrBackupOrForward().push(n);
    prevMeasure.getPart().push(newPart);
  }

  /**
   * Process note Element
   */
  private processNote(note: Element): void {
    this.currentNote = this.createNote(note);
    if (this.currentNote !== null) {
      if (this.twIsCurrent) {
        this.currentPartTW!.getNoteOrBackupOrForward().push(this.currentNote);
      } else if (this.pwIsCurrent) {
        this.currentMeasurePW!.getNoteOrBackupOrForward().push(this.currentNote);
      }
    }
  }

  /**
   * Map the value of accid element
   */
  private processAccid(accid: Element): void {
    let accidVal = accid.getAttributeValue('accid');
    accidVal = accidVal === null ? accid.getAttributeValue('accid.ges') : accidVal;
    if (accidVal !== null && accidVal !== '') {
      const pitch = this.currentNote!.getPitch()!;
      pitch.setAlter(Helper.accidString2decimal(accidVal));
      if (accid.getAttributeValue('accid.ges') === null) {
        const acc = new Accidental();
        acc.setValue(Helper.accidString2word(accidVal) as AccidentalValue);
        this.currentNote!.setAccidental(acc);
      }
    }
  }

  /**
   * Determine the number of dot elements
   */
  private processDot(dot: Element): void {
    const dotVal = dot.getValue();
    try {
      if (dotVal !== null && dotVal !== '') {
        this.currentNote!.setPrintDot(YesNo.YES);
        this.currentNote!.getDot().length = 0;
        for (let i = 0; i < parseInt(dotVal); i++) {
          const ep = new EmptyPlacement();
          ep.setPlacement(AboveBelow.ABOVE);
          this.currentNote!.getDot().push(ep);
        }
      }
    } catch (e) {
      console.error(e);
    }
  }

  /**
   * Process stem element
   */
  private processStem(stem: Element): void {
    const stemVal = stem.getAttributeValue('dir');
    if (stemVal !== null && stemVal !== '') {
      const s = new Stem();
      s.setValue(stemVal as StemValue);
    }
  }

  /**
   * Accumulated durations of given notes.
   */
  private accumulate(oList: any[]): number {
    let accumulatedDurs = 0;
    for (const n of oList) {
      if (n instanceof MusicXmlNote) {
        accumulatedDurs += n.getDuration() ?? 0;
      }
    }
    return accumulatedDurs;
  }

  /**
   * Returns map that has a "num" and a "element" key.
   */
  private findElementInParent(e: Element): Map<string, any> {
    const parent = e.getParent()!;
    const eList = Helper.getAllChildElements(e.getLocalName(), parent) ?? [];
    const map = new Map<string, any>();
    let counter = 1;
    for (const child of eList) {
      if (child === e) {
        map.set('num', counter);
        map.set('element', e);
      }
      counter++;
    }
    return map;
  }

  /**
   * Map scoreDef font attributes to defaults
   */
  private addEmptyFontDefaults(fontname: string | null, targetElement: string): void {
    if (fontname === null || fontname === '') return;
    const emptyFont = new EmptyFont();
    emptyFont.setFontFamily(fontname);
    const acceptedTargets = ['word-font', 'music-font'];
    if (!acceptedTargets.includes(targetElement)) return;
    if (targetElement === 'music-font') {
      this.header.getDefaults()!.setMusicFont(emptyFont);
    }
    if (targetElement === 'word-font') {
      this.header.getDefaults()!.setWordFont(emptyFont);
    }
  }

  /**
   * Maps scoreDef lyric.name to lyric-font defaults
   */
  private addLyricFontDefaults(fontname: string | null): void {
    if (fontname === null || fontname === '') return;
    const lyricFont = new LyricFont();
    lyricFont.setFontFamily(fontname);
    if (fontname !== null && fontname !== '') {
      this.header.getDefaults()!.getLyricFont().push(lyricFont);
    }
  }

  /**
   * Process layout information to set defaults.
   */
  private addLayoutDefault(
    value: string | null,
    targetElement: string,
    layoutPrefix: string,
  ): void {
    if (value === null || value === '') return;
    const acceptedPrefix = ['page', 'system', 'staff'];
    const pageDefaults = this.header.getDefaults()!;

    if (pageDefaults.getPageLayout() === null) {
      pageDefaults.setPageLayout(new PageLayout());
    }
    if (pageDefaults.getSystemLayout() === null) {
      pageDefaults.setSystemLayout(new SystemLayout());
    }

    const pageLayout = pageDefaults.getPageLayout()!;
    const systemLayout = pageDefaults.getSystemLayout()!;
    const staffLayouts = pageDefaults.getStaffLayout();

    if (!acceptedPrefix.includes(layoutPrefix)) return;
    const val = parseFloat(value);

    if (layoutPrefix === 'page') {
      const margins = new PageMargins();
      switch (targetElement) {
        case 'scaling':
          // TODO: Some Processing has to be made here
          break;
        case 'height':
        case 'page-height':
          pageLayout.setPageHeight(val);
          break;
        case 'width':
        case 'page-width':
          pageLayout.setPageWidth(val);
          break;
        case 'left-margin':
          margins.setLeftMargin(val);
          break;
        case 'right-margin':
          margins.setRightMargin(val);
          break;
        case 'top-margin':
          margins.setTopMargin(val);
          break;
        case 'bottom-margin':
          margins.setBottomMargin(val);
          break;
        default:
          console.log(`${targetElement} is not implemented yet, or is not a valid element name`);
      }
      pageLayout.getPageMargins().push(margins);
    } else if (layoutPrefix === 'system') {
      const margins = new SystemMargins();
      switch (targetElement) {
        case 'left-margin':
          margins.setLeftMargin(val);
          break;
        case 'right-margin':
          margins.setRightMargin(val);
          break;
        case 'distance':
        case 'system-distance':
          systemLayout.setSystemDistance(val);
          break;
        case 'top-system-distance':
          systemLayout.setTopSystemDistance(val);
          break;
        default:
          console.log(`${targetElement} is not implemented yet, or is not a valid element name`);
      }
    } else if (layoutPrefix === 'staff') {
      const staffLayout = new StaffLayout();
      switch (targetElement) {
        case 'distance':
        case 'staff-distance':
          staffLayout.setStaffDistance(val);
          staffLayouts.push(staffLayout);
      }
    }
  }

  /**
   * Process scoreDef layout information
   */
  private processScoreDef(scoreDef: Element): void {
    let textName = scoreDef.getAttributeValue('text.name');
    const musicName = scoreDef.getAttributeValue('music.name');
    let lyricName = scoreDef.getAttributeValue('lyric.name');
    const fontname = scoreDef.getAttributeValue('fontname');

    if (fontname !== null && fontname !== '') {
      textName = fontname;
      lyricName = fontname;
    }

    this.addEmptyFontDefaults(textName, 'word-font');
    this.addEmptyFontDefaults(musicName, 'music-font');
    this.addLyricFontDefaults(lyricName);

    const pageHeight = scoreDef.getAttributeValue('page.height');
    const pageWidth = scoreDef.getAttributeValue('page.width');
    const pageLeftMargin = scoreDef.getAttributeValue('page.leftmar');
    const pageRightMargin = scoreDef.getAttributeValue('page.rightmar');
    const pageTopMargin = scoreDef.getAttributeValue('page.topmar');
    const pageBottomMargin = scoreDef.getAttributeValue('page.botmar');
    const pageScale = scoreDef.getAttributeValue('page.scale');
    let prefix = 'page';

    this.addLayoutDefault(pageHeight, 'page-height', prefix);
    this.addLayoutDefault(pageWidth, 'page-width', prefix);
    this.addLayoutDefault(pageLeftMargin, 'left-margin', prefix);
    this.addLayoutDefault(pageRightMargin, 'right-margin', prefix);
    this.addLayoutDefault(pageTopMargin, 'top-margin', prefix);
    this.addLayoutDefault(pageBottomMargin, 'bottom-margin', prefix);
    this.addLayoutDefault(pageScale, 'scaling', prefix);

    const systemRightMargin = scoreDef.getAttributeValue('system.rightmar');
    const systemLeftMargin = scoreDef.getAttributeValue('system.leftmar');
    const systemTopMargin = scoreDef.getAttributeValue('system.topmar');
    const systemSpacing = scoreDef.getAttributeValue('spacing.system');
    prefix = 'system';
    this.addLayoutDefault(systemRightMargin, 'right-margin', prefix);
    this.addLayoutDefault(systemLeftMargin, 'left-margin', prefix);
    this.addLayoutDefault(systemTopMargin, 'top-system-distance', prefix);
    this.addLayoutDefault(systemSpacing, 'system-distance', prefix);

    prefix = 'staff';
    const staffDistance = scoreDef.getAttributeValue('spacing.staff');
    this.addLayoutDefault(staffDistance, 'staff-distance', prefix);
  }

  /**
   * Process score Element to fill MusicXML.
   */
  private processScore(score: Element): void {
    if (this.workList !== null && this.workList.length > 0) {
      try {
        this.header = this.workList[this.getInnerMdivIdx(score.getParent()! as unknown as Element)];
      } catch (e) {
        console.error(e);
      }
    }

    this.checkAndSetPartList();

    this.nullifyPartwise();
    this.divisions = 0;
    this.measureListMEI = [];
    this.currentScoreTimewise = new ScoreTimewise();
    this.partListIds = [];
    this.twIsCurrent = true;
    this.copyHeaderToScore();

    this.mxmls.push(createMusicXmlFromData(this.currentScoreTimewise));
  }

  /**
   * Process parts Element to fill MusicXML.
   */
  private processParts(parts: Element): void {
    if (this.workList !== null && this.workList.length > 0) {
      try {
        this.header = this.workList[this.getInnerMdivIdx(parts.getParent()! as unknown as Element)];
      } catch (e) {
        console.error(e);
      }
    }

    this.checkAndSetPartList();

    this.nullifyTimewise();
    this.divisions = 0;
    this.measureListMEI = [];
    this.currentScorePartwise = new ScorePartwise();
    this.partListIds = [];
    this.pwIsCurrent = true;
    this.twIsCurrent = false;
    this.copyHeaderToScore();

    this.mxmls.push(createMusicXmlFromData(this.currentScorePartwise));
  }

  /**
   * Keep track of the current parts.
   */
  private processSectionPW(section: Element): void {
    if (Helper.getFirstChildElement('measure', section) === null) return;

    const part = Helper.getClosest('part', section)!;
    const sectionIdx = Helper.getAllChildElements('section', part)!.indexOf(section);
    if (sectionIdx > 0) return;
    const closestParts = Helper.getClosest('parts', section)!;
    const partsList = Helper.getAllChildElements('part', closestParts)!;
    const partIdx = partsList.indexOf(part);
    const partId = this.partListIds[partIdx];
    const scorePart = this.findScorePartById(partId);
    const p = new ScorePartwisePart();
    p.setId(scorePart);
    this.currentPartPW = p;
    this.currentScorePartwise!.getPart().push(p);
  }

  /**
   * Find ScorePart by ID.
   */
  private findScorePartById(id: string): ScorePart | null {
    let pList: PartList | null = null;
    if (this.twIsCurrent) {
      pList = this.currentScoreTimewise!.getPartList();
    } else if (this.pwIsCurrent) {
      pList = this.currentScorePartwise!.getPartList();
    }
    if (pList === null) return null;

    for (const sp of pList.getPartGroupOrScorePart()) {
      if (sp instanceof ScorePart) {
        if (sp.getId() === id) {
          return sp;
        }
      }
    }
    return null;
  }

  /**
   * Find ScorePart by N-Attribute.
   */
  private findScorePartByN(n: string): ScorePart | null {
    let pList: PartList | null = null;
    if (this.twIsCurrent) {
      pList = this.currentScoreTimewise!.getPartList();
    } else if (this.pwIsCurrent) {
      pList = this.currentScorePartwise!.getPartList();
    }
    if (pList === null) return null;

    for (const sp of pList.getPartGroupOrScorePart()) {
      if (sp instanceof ScorePart) {
        const nFromId = sp.getId().substring(1);
        if (nFromId === n && !sp.getId().includes('_')) {
          return sp;
        }
      }
    }
    return null;
  }

  /**
   * For each measure, go through all parts and process following staffs, layers, etc.
   */
  private processMeasureTW(measure: Element): void {
    this.createMeasureListTW(measure);

    if (this.measureListMEI.length === 0) {
      const closestScore = Helper.getClosest('score', measure);
      if (closestScore !== null) {
        const mList = closestScore.query('.//mei:measure');
        for (let i = 0; i < mList.size(); i++) {
          this.measureListMEI.push(mList.get(i) as unknown as Element);
        }
      }
    }
    if (this.tieListMEI.length > 0) {
      this.prevMeasureTieListMEI = [...this.tieListMEI];
    }
    this.tieListMEI = Helper.getAllChildElements('tie', measure) ?? [];

    const measureIdx = this.measureListMEI.indexOf(measure);
    this.currentMeasureTW = this.currentScoreTimewise!.getMeasure()[measureIdx];
    this.barlines = [];
    this.createRepeatFromMeasure(measure);
  }

  /**
   * Create repetitions from measure attribute right and left
   */
  private createRepeatFromMeasure(measure: Element): void {
    const right = measure.getAttributeValue('right');
    const left = measure.getAttributeValue('left');

    const allowed = ['rptstart', 'rptend', 'rptboth'];

    if (right !== null && right !== '') {
      if (!allowed.includes(right)) return;
      const bl = new Barline();
      bl.setLocation(RightLeftMiddle.RIGHT);
      const rpt = new Repeat();
      if (right === 'rptstart') {
        rpt.setDirection(BackwardForward.FORWARD);
      } else if (right === 'rptend') {
        rpt.setDirection(BackwardForward.BACKWARD);
      } else if (right === 'rptboth') {
        rpt.setDirection(BackwardForward.BACKWARD);
        const bl2 = new Barline();
        bl.setLocation(RightLeftMiddle.RIGHT);
        const rpt2 = new Repeat();
        rpt2.setDirection(BackwardForward.FORWARD);
        this.barlines.push(bl2);
      }
      bl.setRepeat(rpt);
      this.barlines.push(bl);
    }
    if (left !== null && left !== '') {
      if (!allowed.includes(left)) return;
      const bl = new Barline();
      bl.setLocation(RightLeftMiddle.LEFT);
      const rpt = new Repeat();
      if (left === 'rptstart') {
        rpt.setDirection(BackwardForward.FORWARD);
      } else if (left === 'rptend') {
        rpt.setDirection(BackwardForward.BACKWARD);
      } else if (left === 'rptboth') {
        rpt.setDirection(BackwardForward.BACKWARD);
        const bl2 = new Barline();
        bl.setLocation(RightLeftMiddle.RIGHT);
        const rpt2 = new Repeat();
        rpt2.setDirection(BackwardForward.FORWARD);
        this.barlines.push(bl2);
      }
      bl.setRepeat(rpt);
      this.barlines.push(bl);
    }
  }

  /**
   * Find the index number of the current mdiv.
   */
  private getInnerMdivIdx(mdiv: Element): number {
    return this.mei!.getAllMdivs().indexOf(mdiv);
  }

  /**
   * Clone this header to original header, if is null
   */
  private checkAndSetOriginalHeader(): void {
    if (this.originalHeader === null) {
      this.originalHeader = this.cloneScorePartwise(this.header);
    }
  }

  /**
   * Create new part list
   */
  private checkAndSetPartList(): void {
    if (this.partList === null) {
      this.partList = new PartList();
    }
  }

  /**
   * Reset all fields that belong to partwise
   */
  private nullifyPartwise(): void {
    this.currentScorePartwise = null;
    this.currentPartPW = null;
    this.currentMeasurePW = null;
    this.pwIsCurrent = false;
  }

  /**
   * Reset all fields that belong to timewise
   */
  private nullifyTimewise(): void {
    this.currentScoreTimewise = null;
    this.currentPartTW = null;
    this.currentMeasureTW = null;
    this.twIsCurrent = false;
  }

  /**
   * Clean all unnecessary white space.
   */
  private sanitize(s: string): string {
    s = s.trim();
    s = s.replace(/\r\n|\r|\n/g, ' ');
    s = s.replace(/\s{2,}/g, ' ');
    return s;
  }

  /**
   * Create Attributes from this.currentDefinition
   */
  private createAttributesFromCurrentDefinition(): Attributes | null {
    if (this.currentDefinition === null) return null;
    const clefLine = this.currentDefinition.getClefLine();
    const clefShape = this.currentDefinition.getClefShape();
    const dis = this.currentDefinition.getClefDis();
    const disPlace = this.currentDefinition.getClefDisPlace();
    const meterSym = this.currentDefinition.getMeterSym();
    const meterCount = this.currentDefinition.getMeterCount();
    const meterUnit = this.currentDefinition.getMeterUnit();
    const keySig = this.currentDefinition.getKeySig();

    return this.createAttributes(
      clefLine,
      clefShape,
      dis,
      disPlace,
      meterSym,
      meterCount,
      meterUnit,
      keySig,
    );
  }

  /**
   * Create Attributes from this.defDiff
   */
  private createAttributesFromDiffDefinition(): Attributes | null {
    if (this.defDiff === null) return null;
    const clefLine = this.defDiff.getClefLine();
    const clefShape = this.defDiff.getClefShape();
    const dis = this.defDiff.getClefDis();
    const disPlace = this.defDiff.getClefDisPlace();
    const meterSym = this.defDiff.getMeterSym();
    const meterCount = this.defDiff.getMeterCount();
    const meterUnit = this.defDiff.getMeterUnit();
    const keySig = this.defDiff.getKeySig();

    return this.createAttributes(
      clefLine,
      clefShape,
      dis,
      disPlace,
      meterSym,
      meterCount,
      meterUnit,
      keySig,
    );
  }

  /**
   * Map element contents to Attributes Element.
   */
  createAttributesFromElement(e: Element): Attributes | null {
    const clefLine =
      e.getLocalName() === 'clef' ? e.getAttributeValue('line') : e.getAttributeValue('clef.line');
    const clefShape =
      e.getLocalName() === 'clef'
        ? e.getAttributeValue('shape')
        : e.getAttributeValue('clef.shape');
    const dis =
      e.getLocalName() === 'clef' ? e.getAttributeValue('dis') : e.getAttributeValue('clef.dis');
    const disPlace =
      e.getLocalName() === 'clef'
        ? e.getAttributeValue('disPlace')
        : e.getAttributeValue('clef.dis.place');
    const meterSym = e.getAttributeValue('meter.sym');
    const meterCount =
      e.getLocalName() === 'meterSig'
        ? e.getAttributeValue('count')
        : e.getAttributeValue('meter.count');
    const meterUnit =
      e.getLocalName() === 'meterSig'
        ? e.getAttributeValue('unit')
        : e.getAttributeValue('meter.unit');
    const keySig =
      e.getLocalName() === 'keySig'
        ? e.getAttributeValue('sig')
        : e.getAttributeValue('key.signature');

    return this.createAttributes(
      clefLine,
      clefShape,
      dis,
      disPlace,
      meterSym,
      meterCount,
      meterUnit,
      keySig,
    );
  }

  /**
   * Create a new //attributes element to be inserted into the current measure.
   */
  private createAttributes(
    clefLine: string | null,
    clefShape: string | null,
    dis: string | null,
    disPlace: string | null,
    meterSym: string | null,
    meterCount: string | null,
    meterUnit: string | null,
    keySig: string | null,
  ): Attributes | null {
    const attributes = new Attributes();
    let doReturn = false;
    const clef = new Clef();
    let addClef = false;
    if (clefLine !== null && clefLine !== '') {
      clef.setLine(parseInt(clefLine));
      addClef = true;
    }
    if (clefShape !== null && clefShape !== '' && addClef) {
      clef.setSign(clefShape as ClefSign);
    } else {
      addClef = false;
    }

    if (dis !== null && dis !== '' && disPlace !== null && disPlace !== '') {
      let change = 0;
      switch (dis) {
        case '8':
          change = 1;
          break;
        case '15':
          change = 2;
      }
      if (disPlace === 'below') change *= -1;
      clef.setClefOctaveChange(change);
    }
    if (addClef) attributes.getClef().push(clef);
    doReturn = true;

    const time = new Time();
    const timeSig = time.getTimeSignature();
    let addTime = false;
    if (meterSym !== null && meterSym !== '') {
      time.setSymbol(meterSym as TimeSymbol);
      addTime = true;
    }
    if (meterCount !== null && meterCount !== '') {
      timeSig.push(new JAXBElement<string>('beats', 'String', meterCount));
      addTime = true;
    }
    if (meterUnit !== null && meterUnit !== '' && addTime) {
      timeSig.push(new JAXBElement<string>('beat-type', 'String', meterUnit));
    } else {
      addTime = false;
    }
    if (addTime) attributes.getTime().push(time);
    doReturn = true;

    if (keySig !== null && keySig !== '') {
      const key = new Key();
      let fifths = parseInt(keySig.substring(0, 1));
      if (keySig.includes('f')) {
        fifths = fifths * -1;
      }
      key.setFifths(fifths);
      attributes.getKey().push(key);
      doReturn = true;
    }

    const ppq = this.currentDefinition!.getPpq();
    let divisionsVal: number;
    if (this.divisions === 0) {
      if (ppq !== null && ppq !== '') {
        divisionsVal = parseInt(ppq);
      } else {
        divisionsVal = this.findDivisions();
      }
      this.divisions = divisionsVal;
    }

    if (this.divisions > 0) {
      attributes.setDivisions(this.divisions);
      doReturn = true;
    }

    if (doReturn) return attributes;
    return null;
  }

  /**
   * Process Element which has attributes which can be mapped to //note
   */
  private createNote(e: Element): MusicXmlNote | null {
    const n = new MusicXmlNote();
    let rest: Rest;
    n.setVoice(this.currentVoice!);
    switch (e.getLocalName()) {
      case 'mSpace':
        n.setPrintObject(YesNo.NO);
      // fall through
      case 'mRest':
        rest = new Rest();
        rest.setMeasure(YesNo.YES);
        n.setRest(rest);
        break;
      case 'space':
        n.setPrintObject(YesNo.NO);
      // fall through
      case 'rest':
        rest = new Rest();
        rest.setMeasure(YesNo.NO);
        n.setRest(rest);
        break;
      case 'note': {
        const pitch = new Pitch();
        let step = e.getAttributeValue('pname');
        step = step === null ? e.getAttributeValue('pname.ges') : step;

        let accid = e.getAttributeValue('accid');
        accid = accid === null ? e.getAttributeValue('accid.ges') : accid;

        let octave = e.getAttributeValue('oct');
        octave = octave === null ? e.getAttributeValue('oct.ges') : octave;

        if (e.getAttribute('pnum') !== null && step === null && accid === null && octave === null) {
          step = e.getAttributeValue('pnum');
          const arr: string[] = ['', '', ''];
          Helper.midi2PnameAccidOct(false, parseFloat(step!), arr);
          if (arr[0] !== null && arr[0] !== '') {
            step = arr[0];
            accid = Helper.accidDecimal2String(arr[1]);
            octave = arr[2].substring(0, 1);
          }
        }

        if (step !== null && step !== '') {
          pitch.setStep(step.toUpperCase() as Step);
        }
        if (accid !== null && accid !== '') {
          pitch.setAlter(Helper.accidString2decimal(accid));
          if (e.getAttributeValue('accid.ges') === null) {
            const acc = new Accidental();
            acc.setValue(Helper.accidString2word(accid) as AccidentalValue);
            n.setAccidental(acc);
          }
        }
        const defaultOct = this.currentDefinition!.getOctDefault();
        if (octave !== null && octave !== '') {
          pitch.setOctave(parseInt(octave));
        } else if (defaultOct !== null && defaultOct !== '') {
          pitch.setOctave(parseInt(defaultOct));
        }
        n.setPitch(pitch);

        const parentChord = Helper.getClosest('chord', e);
        if (parentChord !== null) {
          const noteIdx = Helper.getAllChildElements('note', parentChord)!.indexOf(e);
          if (noteIdx >= 1) {
            n.setChord(new Empty());
          }
        }

        const stem = new Stem();
        const stemDir =
          parentChord !== null
            ? parentChord.getAttributeValue('stem.dir')
            : e.getAttributeValue('stem.dir');
        if (stemDir !== null && stemDir !== '') {
          stem.setValue(stemDir as StemValue);
          n.setStem(stem);
        }
        break;
      }
      default:
        console.log(`Creating a note Element for ${e.getLocalName()} is not implemented yet.`);
        return null;
    }

    // tuplet
    this.processTuplet(n, e);

    // ties
    this.processTies(n, e);

    // Set Duration and NoteType
    const closestWithDuration = Helper.getClosestByAttr('dur', e);
    let elementWithDuration =
      (e.getAttributeValue('dur') === null || e.getAttributeValue('dur') === '') &&
      closestWithDuration !== null
        ? closestWithDuration
        : e;
    elementWithDuration = elementWithDuration === null ? e : elementWithDuration;

    const durDefault = this.currentDefinition!.getDurDefault();
    let durAttr = elementWithDuration.getAttributeValue('dur');
    const dotAttr = elementWithDuration.getAttributeValue('dots');

    if (durDefault !== null && durDefault !== '' && durAttr === null) {
      durAttr = durDefault;
    }
    if (durAttr !== null) {
      const nt = new NoteType();
      nt.setValue(Helper.duration2word(durAttr));
      n.setType(nt);
    }
    if (dotAttr !== null && dotAttr !== '') {
      n.setPrintDot(YesNo.YES);
      for (let i = 0; i < parseInt(dotAttr); i++) {
        const ep = new EmptyPlacement();
        ep.setPlacement(AboveBelow.ABOVE);
        n.getDot().push(ep);
      }
    }
    const duration = this.getDuration(elementWithDuration);
    if (duration !== null && duration !== 0) {
      n.setDuration(duration);
      return n;
    }
    return null;
  }

  /**
   * Process tuplets
   */
  private processTuplet(note: MusicXmlNote, e: Element): void {
    const parentTuplet = Helper.getClosest('tuplet', e);
    const tupletAttr = e.getAttributeValue('tuplet');
    let num = '';
    let numbase = '';
    let isFirst = false;
    let isLast = false;
    if (parentTuplet !== null) {
      num = parentTuplet.getAttributeValue('num') ?? '';
      numbase = parentTuplet.getAttributeValue('numbase') ?? '';
      if (num === null || num === '') return;
      const numInt = parseInt(num);
      numbase =
        (numbase === null || numbase === '') && (numInt & (numInt - 1)) === 0
          ? `${numInt}`
          : `${this.highestOneBit(numInt)}`;
      const descendants = Helper.getAllDescendantsWithAttribute('dur', parentTuplet)!;
      isFirst = descendants.indexOf(e) === 0;
      descendants.reverse();
      isLast = descendants.indexOf(e) === 0;
      this.addTimeModification(note, num, numbase, isFirst, isLast);
    } else if (tupletAttr !== null && tupletAttr !== '') {
      const tupletVals = tupletAttr.split(' ');
      for (const tVal of tupletVals) {
        const parentLayer = Helper.getClosest('layer', e);
        const tupletElements = Helper.getAllDescendantsWithAttribute('tuplet', parentLayer!);
        if (tupletElements === null || tupletElements.length === 0) break;
        num = `${tupletElements.length}`;
        const numInt = parseInt(num);
        if (tVal.includes('i')) {
          isFirst = true;
        } else if (tVal.includes('t')) {
          isLast = true;
        }
        numbase = (numInt & (numInt - 1)) === 0 ? `${numInt}` : `${this.highestOneBit(numInt)}`;
        this.addTimeModification(note, num, numbase, isFirst, isLast);
      }
    }
  }

  /**
   * Equivalent of Integer.highestOneBit in Java
   */
  private highestOneBit(n: number): number {
    if (n <= 0) return 0;
    let bit = 1;
    while (bit <= n) bit <<= 1;
    return bit >>> 1;
  }

  /**
   * Add Timemodification and corresponding Notations to a note.
   */
  private addTimeModification(
    note: MusicXmlNote,
    num: string,
    numbase: string,
    isFirst: boolean,
    isLast: boolean,
  ): void {
    if (numbase !== null && numbase !== '' && num !== null && num !== '') {
      const tm = new TimeModification();
      tm.setActualNotes(parseInt(num));
      tm.setNormalNotes(parseInt(numbase));
      note.setTimeModification(tm);
      if (isFirst || isLast) {
        const notations = new Notations();
        const tuplet = new Tuplet();
        if (isFirst) {
          tuplet.setBracket(YesNo.YES);
          tuplet.setType(StartStop.START);
        } else if (isLast) {
          tuplet.setType(StartStop.STOP);
        }
        notations.getTiedOrSlurOrTuplet().push(tuplet);
        note.getNotations().push(notations);
      }
    }
  }

  /**
   * Process ties for a note element.
   */
  private processTies(note: MusicXmlNote, noteElement: Element): void {
    const combinedList: Element[] = [];
    combinedList.push(...this.prevMeasureTieListMEI);
    combinedList.push(...this.tieListMEI);
    const noteId = Helper.getAttributeValue('id', noteElement);
    for (const tieElement of combinedList) {
      let startId = tieElement.getAttributeValue('startid');
      startId = startId === null ? null : startId.substring(1);
      let endId = tieElement.getAttributeValue('endid');
      endId = endId === null ? null : endId.substring(1);
      const position = noteElement.getAttributeValue('curvedir');

      const startIdIsNull = startId === null || startId === '';
      const endIdIsNull = endId === null || endId === '';
      if (startIdIsNull && endIdIsNull) continue;

      if (noteId === null || noteId === '') return;
      const notations = new Notations();
      const tied = new Tied();
      notations.getTiedOrSlurOrTuplet().push(tied);
      let tie: Tie;
      if (position !== null && position !== '') {
        if (position === 'above') {
          tied.setOrientation(OverUnder.OVER);
          tied.setPlacement(AboveBelow.ABOVE);
        } else if (position === 'below') {
          tied.setOrientation(OverUnder.UNDER);
          tied.setPlacement(AboveBelow.BELOW);
        }
      }

      if (noteId === startId) {
        tie = new Tie();
        // remove existing start ties
        for (let ti = note.getTie().length - 1; ti >= 0; ti--) {
          if (note.getTie()[ti].getType() === StartStop.START) {
            note.getTie().splice(ti, 1);
          }
        }
        note.getTie().push(tie);
        note.getNotations().push(notations);
        tie.setType(StartStop.START);
        tied.setType(StartStopContinue.START);
      } else if (noteId === endId) {
        tie = new Tie();
        for (let ti = note.getTie().length - 1; ti >= 0; ti--) {
          if (note.getTie()[ti].getType() === StartStop.STOP) {
            note.getTie().splice(ti, 1);
          }
        }
        note.getTie().push(tie);
        note.getNotations().push(notations);
        tie.setType(StartStop.STOP);
        tied.setType(StartStopContinue.STOP);
      }

      let hasStart = false;
      let hasStop = false;
      for (const t of note.getTie()) {
        if (t.getType() === StartStop.START) hasStart = true;
        if (t.getType() === StartStop.STOP) hasStop = true;
      }
      if (hasStart && hasStop && !this.tieBlacklist.includes(noteId)) {
        this.tieBlacklist.push(noteId);
      }
    }

    const tieAttr = noteElement.getAttributeValue('tie');
    if (tieAttr !== null && tieAttr !== '') {
      if (this.tieBlacklist.includes(noteId)) return;
      const notations = new Notations();
      const tied = new Tied();
      notations.getTiedOrSlurOrTuplet().push(tied);
      const tie = new Tie();
      note.getTie().push(tie);
      note.getNotations().push(notations);
      if (tieAttr === 'i') {
        tie.setType(StartStop.START);
        tied.setType(StartStopContinue.START);
      } else if (tieAttr === 'm') {
        tie.setType(StartStop.STOP);
        tied.setType(StartStopContinue.STOP);
        if (note.getTie().length < 2) {
          const tie2 = new Tie();
          tie2.setType(StartStop.START);
          note.getTie().push(tie2);
          const tied2 = new Tied();
          tied2.setType(StartStopContinue.START);
          notations.getTiedOrSlurOrTuplet().push(tied2);
        }
      } else if (tieAttr === 't') {
        tie.setType(StartStop.STOP);
        tied.setType(StartStopContinue.STOP);
      }
    }
  }

  /**
   * Find divisions of current MEI
   */
  private findDivisions(): number {
    const durationNodes = this.mei!.getMusic()!.query('//*[@dur]');
    let smallestDur = 0.0;
    for (let i = 0; i < durationNodes.size(); i++) {
      const e = durationNodes.get(i) as unknown as Element;
      const dots = e.getAttributeValue('dots');
      let dotInt = 0;
      if (dots !== null && dots !== '') {
        dotInt = parseInt(dots);
      }

      let dur = 0.0;
      const durString = e.getAttributeValue('dur');
      if (durString !== null && durString !== '') {
        if (/\d/.test(durString)) {
          dur = parseFloat(durString);
        } else {
          dur = Helper.duration2decimal(durString);
          if (dur === 2.0) {
            dur = 0.5;
          } else if (dur === 4.0) {
            dur = 0.25;
          } else if (dur === 8.0) {
            dur = 0.125;
          }
        }
      }
      if (dotInt > 0) {
        // Java code: dur = (dur/2.0)*(2^(dotInt+2)); using XOR (^) which is bitwise XOR in Java
        // This is likely a bug in the original Java (^ is XOR not power), port faithfully
        dur = (dur / 2.0) * (2 ^ (dotInt + 2));
      }

      if (dur > smallestDur) smallestDur = dur;
    }
    return smallestDur / 4;
  }

  /**
   * Find corresponding definition to given Element.
   */
  private findCorrespondingDefinition(e: Element): DefinitionType {
    let targetElement: Element | null = e;
    const dType = new DefinitionType();
    let staffN = '';
    if (targetElement.getLocalName() === 'layer') {
      this.setStaffDefOrLayerDefToDtype(dType, targetElement);
      targetElement = Helper.getParentElement(targetElement)!;
    }
    if (dType.isFull()) return dType;

    if (targetElement.getLocalName() === 'staff') {
      staffN = targetElement.getAttributeValue('n') ?? '';
      staffN =
        staffN === null || staffN === ''
          ? `${Helper.getAllChildElements('staff', Helper.getParentElement(targetElement)!)!.indexOf(targetElement) + 1}`
          : staffN;
      this.setStaffDefOrLayerDefToDtype(dType, targetElement);
      targetElement = Helper.getParentElement(targetElement)!;
    }

    if (dType.isFull()) return dType;

    if (targetElement.getLocalName() === 'measure') {
      const scoreDefs = Helper.getAllPreviousSiblingElements('scoreDef', targetElement);
      const staff = Helper.getPreviousSiblingElement('staff', targetElement);
      const prevMeasure = Helper.getPreviousSiblingElement('measure', targetElement);
      const staffDefCandidates = Helper.getAllPreviousSiblingElements('staffDef', targetElement);
      let staffDefCandidate: Element | null = null;
      for (const sdc of staffDefCandidates) {
        const sdcN = sdc.getAttributeValue('n');
        if (sdcN !== null && staffN === sdcN) {
          staffDefCandidate = sdc;
          break;
        }
      }
      const measureParent = Helper.getParentElement(targetElement);

      if (prevMeasure !== null && staffDefCandidate !== null) {
        this.setStaffDefOrLayerDefToDtype(dType, staffDefCandidate);
      }

      if (staffN !== null && staffN !== '') {
        for (const scoreDef of scoreDefs) {
          const staffDef = this.findStaffDefInScoreDef(staffN, scoreDef);
          if (staffDef !== null) {
            this.setStaffDefOrLayerDefToDtype(dType, staffDef);
          }
          this.setStaffDefOrLayerDefToDtype(dType, scoreDef);
        }
      } else if (staff !== null) {
        const staffDef = Helper.getFirstChildElement('staffDef', staff);
        if (staffDef !== null) {
          this.setStaffDefOrLayerDefToDtype(dType, staffDef);
        } else {
          this.setStaffDefOrLayerDefToDtype(dType, staff);
        }
      }
      targetElement = Helper.getParentElement(targetElement);
    }

    if (dType.isFull()) return dType;

    do {
      if (targetElement!.getLocalName() === 'section') {
        this.setStaffDefOrLayerDefToDtype(dType, targetElement!);
        const scoreDefs = Helper.getAllPreviousSiblingElements('scoreDef', targetElement!);
        const prevSection = Helper.getPreviousSiblingElement('section', targetElement!);
        if (prevSection !== null) {
          const prevMeasures = Helper.getAllChildElements('measure', prevSection) ?? [];
          let prevMeasure: Element | null = null;
          if (prevMeasures.length > 0) {
            prevMeasures.reverse();
            prevMeasure = prevMeasures[0];
          }
          const staffDefCandidates = Helper.getAllChildElements('staffDef', prevSection) ?? [];
          if (staffDefCandidates.length > 0) {
            staffDefCandidates.reverse();
            let staffDefCandidate: Element | null = null;
            for (const sdc of staffDefCandidates) {
              const sdcN = sdc.getAttributeValue('n');
              if (sdcN !== null && staffN === sdcN) {
                staffDefCandidate = sdc;
                break;
              }
            }

            if (prevMeasure !== null && staffDefCandidate !== null) {
              this.setStaffDefOrLayerDefToDtype(dType, staffDefCandidate);
            }
          }
        }

        if (staffN !== null && staffN !== '') {
          for (const scoreDef of scoreDefs) {
            const staffDef = this.findStaffDefInScoreDef(staffN, scoreDef);
            if (staffDef !== null) {
              this.setStaffDefOrLayerDefToDtype(dType, staffDef);
            }
            this.setStaffDefOrLayerDefToDtype(dType, scoreDef);
          }
        }
      }
      targetElement = Helper.getClosest('section', targetElement!);
    } while (targetElement !== null);

    return dType;
  }

  /**
   * Finding a StaffDef in a ScoreDef.
   */
  private findStaffDefInScoreDef(staffN: string, scoreDef: Element): Element | null {
    const staffGrp = Helper.getFirstChildElement('staffGrp', scoreDef);
    let staffDef: Element | null = null;
    if (staffGrp === null) return null;
    const staffDefs = this.getStaffDefsInStaffGrp(staffGrp);
    for (const sd of staffDefs) {
      let nVal = sd.getAttributeValue('n');
      nVal = nVal === null || nVal === '' ? `${staffDefs.indexOf(sd) + 1}` : nVal;
      if (nVal === staffN) {
        staffDef = sd;
        break;
      }
    }
    return staffDef;
  }

  /**
   * Find all staffDefs recursively to make flat List of staffDefs in nested staffGrp.
   */
  private getStaffDefsInStaffGrp(staffGrp: Element | null): Element[] {
    if (staffGrp === null) return [];
    const nestedStaffGrp = Helper.getAllChildElements('staffGrp', staffGrp);
    const staffDefs: Element[] = [];
    if (nestedStaffGrp !== null) {
      for (const nsg of nestedStaffGrp) {
        staffDefs.push(...this.getStaffDefsInStaffGrp(nsg));
      }
    }
    const localStaffDefs = Helper.getAllChildElements('staffDef', staffGrp);
    if (localStaffDefs !== null) staffDefs.push(...localStaffDefs);
    return staffDefs;
  }

  /**
   * Fill DefinitionType with scoreDef, staffDef or layerDef information
   */
  private setStaffDefOrLayerDefToDtype(dType: DefinitionType, targetElement: Element): void {
    let staffDef: Element | null = targetElement;
    if (targetElement.getLocalName() !== 'staffDef') {
      staffDef = Helper.getPreviousSiblingElement('staffDef', targetElement);
    }
    if (staffDef !== null) {
      const allowedChildren = ['clef', 'meterSig', 'keySig', 'layerDef'];
      const staffDefChildren = Helper.getAllChildElements(staffDef) ?? [];
      for (const ch of staffDefChildren!) {
        if (!allowedChildren.includes(ch.getLocalName())) continue;
        try {
          if (
            ch.getLocalName() === 'layerDef' &&
            ch.getAttributeValue('n') === targetElement.getAttributeValue('n')
          ) {
            dType.setAttributes(ch);
          } else {
            dType.setAttributes(ch);
          }
        } catch (ex) {
          console.error(ex);
        }
      }
      dType.setAttributes(staffDef);
    }

    if (targetElement.getLocalName() === 'scoreDef') {
      dType.setAttributes(targetElement);
    }
  }

  /**
   * Find duration
   */
  private getDuration(e: Element): number | null {
    if (e.getLocalName() === 'mRest') {
      const meterUnit = this.currentDefinition!.getMeterUnit();
      const meterCount = this.currentDefinition!.getMeterCount();
      if (meterUnit !== null && meterCount !== null) {
        return this.computeMeasureDuration(meterCount, meterUnit);
      }
      return this.computeMeasureDuration('4', '4');
    }
    const durVal = e.getAttributeValue('dur');
    const dotsVal = e.getAttributeValue('dots');

    let duration = 0.0;
    if (durVal === null || durVal === '') return 0;
    if (/\d/.test(durVal)) {
      duration = parseFloat(durVal);
    } else {
      duration = Helper.duration2decimal(durVal);
      if (duration === 2.0) {
        duration = 0.5;
      } else if (duration === 4.0) {
        duration = 0.25;
      } else if (duration === 8.0) {
        duration = 0.125;
      }
    }

    const dots: number[] = [];
    if (dotsVal !== null && dotsVal !== '') {
      for (let i = 0; i < parseInt(dotsVal); i++) {
        const f = i;
        dots.push((duration / 2.0) * Math.pow(2.0, f + 2.0));
      }
    }

    const baseRatio = (1.0 / 4.0) * (1.0 / this.divisions);
    let durRatio = 1.0 / duration;
    for (const f of dots) {
      durRatio += 1.0 / f;
    }
    const result = durRatio / baseRatio;
    const dur = Math.floor(result);

    return dur;
  }

  /**
   * Compute the duration of a whole measure (in MusicXML) from given meterCount and meterUnit.
   */
  computeMeasureDuration(meterCount: string, meterUnit: string): number {
    if (meterUnit !== null && meterUnit !== '' && meterCount !== null && meterCount !== '') {
      const u = parseFloat(meterUnit);
      const c = parseFloat(meterCount);
      return (c / u) * 4.0 * this.divisions;
    }
    return 0;
  }
}
