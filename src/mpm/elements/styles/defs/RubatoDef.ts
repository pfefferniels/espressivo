import { Attribute, Element } from '../../../../xml/XomTypes.js';
import { attribute } from '../../../../xml/tree.js';
import { MPM_NAMESPACE } from '../../../names.js';
import { KeyValue } from '../../../../supplementary/KeyValue.js';
import { parseJavaDouble } from '../../../../supplementary/parseJavaDouble.js';
import { AbstractXmlSubtree } from '../../../../xml/AbstractXmlSubtree.js';
import { MissingNodeError } from '../../../../xml/errors.js';
import { requireDefName, skipMalformedDef } from './defName.js';
import { ok, type Result } from '../../../../prelude/index.js';
import { type MpmParseError } from '../../parseError.js';

/**
 * A `rubatoDef`: a reusable rubato shape that stretches and compresses time inside a
 * frame of `frameLength` ticks.
 * Port of meico.mpm.elements.styles.defs.RubatoDef
 *
 * Parsing is not read-only: missing `intensity`, `lateStart` and `earlyEnd` attributes are
 * ADDED to the element with their defaults, and out-of-range values are clamped in place,
 * so a def that round-trips through this class serializes more attributes than it came
 * with. See {@link ensureIntensityBoundaries} and
 * {@link ensureLateStartEarlyEndBoundaries} for the clamping rules.
 *
 * PARITY NOTE: Java renames a foreign element to `rubatoDef` via `Element.setLocalName()`
 * when parsing. XomTypes has no `setLocalName`, so a def parsed from a differently named
 * element keeps that name here. `RubatoStyle` only ever feeds this factory real
 * `rubatoDef` children, so the pipeline never reaches that difference.
 */
export class RubatoDef extends AbstractXmlSubtree {
  /** This def's arm of {@link Def}. See {@link requireDefName} on why there is no base class. */
  readonly kind = 'rubato';
  private frameLength = 0.0;
  private intensity = 1.0;
  private lateStart = 0.0;
  private earlyEnd = 1.0;

  /**
   * The three attributes MPM lets a `rubatoDef` omit, held so the setters write where
   * {@link parseData} read.
   *
   * Initialised to the very nodes the defaulting path installs, which is why they need no
   * `!`: this class ADDS a missing `intensity`, `lateStart` or `earlyEnd` to the caller's
   * element (see the header comment), so "the default node" and "the node in the document"
   * are the same object as soon as parsing has run. Where the document declares one,
   * `parseData` replaces the placeholder with the declared node instead.
   */
  private intensityAttr: Attribute;
  private lateStartAttr: Attribute;
  private earlyEndAttr: Attribute;

  private constructor(
    private readonly nameAttr: Attribute,
    private readonly frameLengthAttr: Attribute,
  ) {
    super();
    this.intensityAttr = new Attribute('intensity', String(this.intensity));
    this.lateStartAttr = new Attribute('lateStart', String(this.lateStart));
    this.earlyEndAttr = new Attribute('earlyEnd', String(this.earlyEnd));
  }

  getName(): string {
    return this.nameAttr.getValue();
  }

  /** Rename the def, in the object and in the element. Was `AbstractDef.setName`. */
  setName(name: string): void {
    this.nameAttr.setValue(name);
  }

  /**
   * NOT read-only, and that is the point of the class's header comment: three attributes are
   * ADDED to the caller's element where they are absent, and out-of-range values are clamped
   * in place.
   *
   * The name check that used to open this (via `AbstractDef.parseData`) now happens in
   * {@link createRubatoDef} before the object exists, which keeps the rejection order
   * unchanged — a `rubatoDef` with no `@name` is refused before anything is written to it.
   */
  protected parseData(xml: Element): void {
    this.setXml(xml);
    this.id = attribute('id', xml);

    const declaredIntensity = attribute('intensity', xml);
    if (declaredIntensity === null) {
      xml.addAttribute(this.intensityAttr);
    } else {
      this.intensityAttr = declaredIntensity;
      // Each of these four reads throws on a malformed value, which createRubatoDef turns
      // into null so the style skips the def — Java's behaviour at RubatoDef.java:135,148,
      // 153-154. PARITY.md, "Fixed bugs", P1.
      declaredIntensity.setValue(
        String(
          RubatoDef.ensureIntensityBoundaries(
            parseJavaDouble(declaredIntensity.getValue(), 'rubatoDef/@intensity'),
          ),
        ),
      );
    }

    const declaredLateStart = attribute('lateStart', xml);
    if (declaredLateStart === null) xml.addAttribute(this.lateStartAttr);
    else this.lateStartAttr = declaredLateStart;

    const declaredEarlyEnd = attribute('earlyEnd', xml);
    if (declaredEarlyEnd === null) xml.addAttribute(this.earlyEndAttr);
    else this.earlyEndAttr = declaredEarlyEnd;

    const le = RubatoDef.ensureLateStartEarlyEndBoundaries(
      parseJavaDouble(this.lateStartAttr.getValue(), 'rubatoDef/@lateStart'),
      parseJavaDouble(this.earlyEndAttr.getValue(), 'rubatoDef/@earlyEnd'),
    );
    this.lateStartAttr.setValue(String(le.getKey()));
    this.earlyEndAttr.setValue(String(le.getValue()));

    this.frameLength = parseJavaDouble(this.frameLengthAttr.getValue(), 'rubatoDef/@frameLength');
    this.intensity = parseJavaDouble(this.intensityAttr.getValue(), 'rubatoDef/@intensity');
    this.lateStart = le.getKey();
    this.earlyEnd = le.getValue();
  }

  /**
   * Create a def from a name plus frame length, optionally with the full warp window.
   *
   * Three overload arms became two names. The 2- and 5-argument build arms differed only in
   * whether the window was supplied, and the rule that made them separate arms — passing
   * `intensity` also requires `lateStart` and `earlyEnd` — was enforced by their arity and
   * explained in prose. It is now a type: the three travel as one optional object, so
   * supplying a partial window does not compile rather than being documented as illegal.
   *
   * Reports the reason rather than throwing, e.g. when `frameLength` is missing.
   */
  static fromName(
    name: string,
    frameLength: number,
    window?: { intensity: number; lateStart: number; earlyEnd: number },
  ): Result<RubatoDef, MpmParseError> {
    const xml = new Element('rubatoDef', MPM_NAMESPACE);
    xml.addAttribute(new Attribute('name', name));
    xml.addAttribute(new Attribute('frameLength', String(frameLength)));
    if (window !== undefined) {
      xml.addAttribute(new Attribute('intensity', String(window.intensity)));
      xml.addAttribute(new Attribute('lateStart', String(window.lateStart)));
      xml.addAttribute(new Attribute('earlyEnd', String(window.earlyEnd)));
    }
    return RubatoDef.fromXml(xml);
  }

  /** Create a def by parsing an existing `rubatoDef` element. See {@link fromName}. */
  static fromXml(xml: Element): Result<RubatoDef, MpmParseError> {
    try {
      const nameAttr = requireDefName(xml, 'RubatoDef');
      // Moved ahead of construction because it is required and written through by
      // `setFrameLength`. Nothing is written to the element before this point in either
      // spelling, so the order in which a malformed def is rejected is unchanged.
      const frameLengthAttr = attribute('frameLength', xml);
      if (frameLengthAttr === null)
        throw new MissingNodeError(
          'Cannot generate RubatoDef object. Missing attribute frameLength.',
        );

      const rd = new RubatoDef(nameAttr, frameLengthAttr);
      rd.parseData(xml);
      return ok(rd);
    } catch (e) {
      return skipMalformedDef(e, 'RubatoDef');
    }
  }

  getFrameLength(): number {
    return this.frameLength;
  }
  setFrameLength(frameLength: number): void {
    this.frameLength = Math.max(frameLength, 0.0);
    this.frameLengthAttr.setValue(String(this.frameLength));
  }

  getIntensity(): number {
    return this.intensity;
  }
  setIntensity(intensity: number): void {
    this.intensity = RubatoDef.ensureIntensityBoundaries(intensity);
    this.intensityAttr.setValue(String(this.intensity));
  }

  getLateStart(): number {
    return this.lateStart;
  }
  /** Rejected outright if it would reach `earlyEnd`; a negative value is clamped to 0. */
  setLateStart(lateStart: number): void {
    if (lateStart >= this.earlyEnd) {
      console.error('Setting lateStart >= earlyEnd is not allowed.');
      return;
    }
    let value = lateStart;
    if (value < 0.0) {
      console.error('Invalid rubato lateStart < 0.0 is set to 0.0.');
      value = 0.0;
    }
    this.lateStart = value;
    this.lateStartAttr.setValue(String(this.lateStart));
  }

  getEarlyEnd(): number {
    return this.earlyEnd;
  }
  /** Rejected outright if it would reach `lateStart`; a value above 1 is clamped to 1. */
  setEarlyEnd(earlyEnd: number): void {
    if (this.lateStart >= earlyEnd) {
      console.error('Setting earlyEnd <= lateStart is not allowed.');
      return;
    }
    let value = earlyEnd;
    if (value > 1.0) {
      console.error('Invalid rubato earlyEnd > 1.0 is set to 1.0.');
      value = 1.0;
    }
    this.earlyEnd = value;
    this.earlyEndAttr.setValue(String(this.earlyEnd));
  }

  /**
   * Set both bounds at once — the only way to move them past each other, since
   * {@link setLateStart} and {@link setEarlyEnd} each refuse to cross the other.
   */
  setLateStartAndEarlyEnd(lateStart: number, earlyEnd: number): void {
    const le = RubatoDef.ensureLateStartEarlyEndBoundaries(lateStart, earlyEnd);
    this.earlyEnd = le.getValue();
    this.earlyEndAttr.setValue(String(this.earlyEnd));
    this.lateStart = le.getKey();
    this.lateStartAttr.setValue(String(this.lateStart));
  }

  /** Intensity must be non-zero and positive: 0 becomes 0.01, negatives are inverted. */
  private static ensureIntensityBoundaries(intensity: number): number {
    if (intensity === 0.0) {
      console.error('Invalid rubato intensity = 0.0 is set to 0.01.');
      return 0.01;
    }
    if (intensity < 0.0) {
      console.error('Invalid rubato intensity < 0.0 is inverted.');
      return intensity * -1.0;
    }
    return intensity;
  }

  /**
   * Clamp the pair into `0 <= lateStart < earlyEnd <= 1`. The three tests run in this order
   * and the last one overrides the first two, so a crossed pair collapses to the full
   * frame (0, 1) rather than to the individually clamped values.
   */
  private static ensureLateStartEarlyEndBoundaries(
    lateStart: number,
    earlyEnd: number,
  ): KeyValue<number, number> {
    const le = new KeyValue(lateStart, earlyEnd);
    if (lateStart < 0.0) {
      console.error('Invalid rubato lateStart < 0.0 is set to 0.0.');
      le.setKey(0.0);
    }
    if (earlyEnd > 1.0) {
      console.error('Invalid rubato earlyEnd > 1.0 is set to 1.0.');
      le.setValue(1.0);
    }
    if (lateStart >= earlyEnd) {
      console.error('Invalid rubato lateStart >= earlyEnd, setting them to 0.0 and 1.0.');
      le.setKey(0.0);
      le.setValue(1.0);
    }
    return le;
  }
}
