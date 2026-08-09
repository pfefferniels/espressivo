import { Attribute, Element } from '../../../../xml/XomTypes.js';
import { allChildElements, attribute } from '../../../../xml/tree.js';
import { MPM_NAMESPACE } from '../../../names.js';
import { KeyValue } from '../../../../supplementary/KeyValue.js';
import { parseJavaDouble } from '../../../../supplementary/parseJavaDouble.js';
import { AbstractDef } from './AbstractDef.js';

/**
 * An `accentuationPatternDef`: a metrical accentuation pattern over one bar of `length`
 * beats, given as `accentuation` children at beat positions.
 * Port of meico.mpm.elements.styles.defs.AccentuationPatternDef
 *
 * Beat positions are ONE-based: 1.0 is the first beat of the pattern, and the pattern ends
 * at `length + 1.0`.
 *
 * Each accentuation is stored as a `[beat, value, transition.from, transition.to]` tuple
 * paired with the element it came from, kept sorted by beat — see
 * {@link addAccentuationToArrayList}. A missing `transition.from` defaults to `value`, and
 * a missing `transition.to` defaults to `transition.from`, so an accentuation without
 * transition attributes is flat.
 *
 * Parsing is not read-only: a missing `length` attribute is ADDED to the element with the
 * default 4.0.
 */
export class AccentuationPatternDef extends AbstractDef {
  private length = 4.0;
  private readonly accentuations: KeyValue<number[], Element>[] = [];

  private constructor() {
    super();
  }

  private parseDataInternal(xml: Element): void {
    super.parseData(xml);

    let lengthAttr = attribute('length', xml);
    if (lengthAttr === null) {
      lengthAttr = new Attribute('length', String(this.length));
      xml.addAttribute(lengthAttr);
    }
    // Every read below throws on a malformed value, so createAccentuationPatternDef returns
    // null and the style skips the pattern — Java's behaviour at AccentuationPatternDef.java:
    // 113,122-136, where each is a bare Double.parseDouble in the throwing constructor.
    // See PARITY.md, "Fixed bugs", P1.
    this.length = parseJavaDouble(lengthAttr.getValue(), 'accentuationPatternDef/@length');

    for (const ac of allChildElements(xml, 'accentuation')) {
      const att = attribute('beat', ac);
      if (att === null) continue;
      const accentuation = [parseJavaDouble(att.getValue(), 'accentuation/@beat'), 0.0, 0.0, 0.0];

      const valAtt = attribute('value', ac);
      if (valAtt !== null)
        accentuation[1] = parseJavaDouble(valAtt.getValue(), 'accentuation/@value');

      const tfAtt = attribute('transition.from', ac);
      if (tfAtt !== null)
        accentuation[2] = parseJavaDouble(tfAtt.getValue(), 'accentuation/@transition.from');
      else accentuation[2] = accentuation[1];

      const ttAtt = attribute('transition.to', ac);
      if (ttAtt !== null)
        accentuation[3] = parseJavaDouble(ttAtt.getValue(), 'accentuation/@transition.to');
      else accentuation[3] = accentuation[2];

      this.addAccentuationToArrayList(accentuation, ac);
      this.sortXml();
    }
  }

  protected parseData(xml: Element): void {
    this.parseDataInternal(xml);
  }

  /**
   * Create a pattern from a name and length (optionally with an id), or by parsing an
   * existing element. Returns null — after logging — instead of throwing.
   */
  static createAccentuationPatternDef(
    name: string,
    length: number,
    id?: string,
  ): AccentuationPatternDef | null;
  static createAccentuationPatternDef(xml: Element): AccentuationPatternDef | null;
  static createAccentuationPatternDef(
    nameOrXml: string | Element,
    length?: number,
    id?: string,
  ): AccentuationPatternDef | null {
    try {
      const apd = new AccentuationPatternDef();
      if (typeof nameOrXml === 'string') {
        const e = new Element('accentuationPatternDef', MPM_NAMESPACE);
        e.addAttribute(new Attribute('name', nameOrXml));
        e.addAttribute(new Attribute('length', String(length)));
        apd.parseDataInternal(e);
        if (id !== undefined) apd.setId(id);
      } else {
        apd.parseDataInternal(nameOrXml);
      }
      return apd;
    } catch (e) {
      console.error(e);
      return null;
    }
  }

  /**
   * Add an accentuation and insert its new element at the matching position in the XML.
   * @returns the index it was sorted to
   */
  addAccentuation(
    beat: number,
    value: number,
    transitionFrom: number,
    transitionTo: number,
    id?: string | null,
  ): number {
    const accElt = new Element('accentuation', MPM_NAMESPACE);
    accElt.addAttribute(new Attribute('beat', String(beat)));
    accElt.addAttribute(new Attribute('value', String(value)));
    accElt.addAttribute(new Attribute('transition.from', String(transitionFrom)));
    accElt.addAttribute(new Attribute('transition.to', String(transitionTo)));

    if (id !== undefined && id !== null) {
      accElt.addAttribute(new Attribute('xml:id', 'http://www.w3.org/XML/1998/namespace', id));
    }

    const index = this.addAccentuationToArrayList(
      [beat, value, transitionFrom, transitionTo],
      accElt,
    );
    this.getXml().insertChild(accElt, index);
    return index;
  }

  /**
   * As {@link addAccentuation}, but taking the values from an existing `accentuation`
   * element, which is then adopted as a child.
   * @returns the index it was sorted to, or -1 if the element has no `beat`
   * @throws {NumberFormatError} if an attribute is present but not numeric. Unlike the parse
   *   path there is no factory to absorb it here, so it reaches the caller — which is what
   *   Java's unchecked `NumberFormatException` does from `addAccentuation(Element)`
   *   (AccentuationPatternDef.java:198-212). PARITY.md, "Fixed bugs", P1.
   */
  addAccentuationFromXml(xml: Element): number {
    const att = xml.getAttribute('beat');
    if (att === null) return -1;
    const accentuation = [parseJavaDouble(att.getValue(), 'accentuation/@beat'), 0.0, 0.0, 0.0];

    const valAtt = xml.getAttribute('value');
    if (valAtt !== null)
      accentuation[1] = parseJavaDouble(valAtt.getValue(), 'accentuation/@value');

    const tfAtt = xml.getAttribute('transition.from');
    if (tfAtt !== null)
      accentuation[2] = parseJavaDouble(tfAtt.getValue(), 'accentuation/@transition.from');
    else accentuation[2] = accentuation[1];

    const ttAtt = xml.getAttribute('transition.to');
    if (ttAtt !== null)
      accentuation[3] = parseJavaDouble(ttAtt.getValue(), 'accentuation/@transition.to');
    else accentuation[3] = accentuation[2];

    const index = this.addAccentuationToArrayList(accentuation, xml);
    this.getXml().insertChild(xml, index);
    return index;
  }

  /**
   * Insertion-sort the tuple into {@link accentuations} by beat, scanning from the back so
   * that equal beats keep insertion order (the new one lands after its equals).
   * @returns the index it was inserted at, which is also the XML child index to use
   */
  private addAccentuationToArrayList(accentuation: number[], xml: Element): number {
    for (let j = this.accentuations.length - 1; j >= 0; --j) {
      if (accentuation[0] >= this.accentuations[j].getKey()[0]) {
        this.accentuations.splice(j + 1, 0, new KeyValue(accentuation, xml));
        return j + 1;
      }
    }
    this.accentuations.splice(0, 0, new KeyValue(accentuation, xml));
    return 0;
  }

  /**
   * Reorder the `accentuation` children to match {@link accentuations} by detaching and
   * re-inserting each one in turn. Called after every parsed accentuation, so parsing is
   * quadratic in the number of accentuations — patterns are a handful of beats long, and
   * the repeated remove/insert is what keeps serialization order identical to Java's.
   */
  private sortXml(): void {
    const xml = this.getXml();
    for (let i = 0; i < this.accentuations.length; ++i) {
      const accentuation = this.accentuations[i].getValue();
      xml.removeChild(accentuation);
      xml.insertChild(accentuation, i);
    }
  }

  /**
   * Remove the accentuation at `index` from the list and the XML.
   *
   * Like {@link getAccentuationAttributes} and {@link getAccentuationXml}, this guards only
   * the upper bound — as Java does. A negative index falls through the guard and throws.
   */
  removeAccentuation(index: number): void {
    if (index >= this.accentuations.length) return;
    this.getXml().removeChild(this.accentuations[index].getValue());
    this.accentuations.splice(index, 1);
  }

  /** The live list, not a copy — mutating it desynchronises the def from its XML. */
  getAllAccentuations(): KeyValue<number[], Element>[] {
    return this.accentuations;
  }

  getAccentuationAttributes(index: number): number[] | null {
    if (index >= this.accentuations.length) return null;
    return this.accentuations[index].getKey();
  }

  getAccentuationXml(index: number): Element | null {
    if (index >= this.accentuations.length) return null;
    return this.accentuations[index].getValue();
  }

  /**
   * Compute the accentuation value at a beat position (1.0 = first beat of the pattern).
   * The result still has to be scaled to an actual velocity by the caller.
   *
   * Before the first accentuation the value is 0; at or after `length + 1.0` it is the last
   * accentuation's `transition.to`; exactly on an accentuation it is that one's `value`;
   * in between it is linearly interpolated from the preceding accentuation's
   * `transition.from` towards its `transition.to`.
   *
   * DELIBERATE JAVA BUG, STILL PORTED AS IS — do not correct it here on its own; the fix is
   * approved and belongs to item TD3. `segmentEnd` is meant to become the *next*
   * accentuation's beat, so that each transition ramps to its own segment's end. The guard
   * that would do it reads `i > this.accentuations.length - 1` (Java
   * AccentuationPatternDef.java:317, where the comment says "if it is between two
   * accentuations"), but the loop starts at `length - 1` and only ever counts down, so the
   * condition can never hold. `segmentEnd` therefore stays at `length + 1.0` and EVERY ramp
   * runs to the end of the whole pattern, flattening the interpolation of all but the last
   * accentuation. The intended test is `i < this.accentuations.length - 1`.
   *
   * Correcting that one character in isolation moves fixture bytes: the Java-generated
   * `all-maps-reference/metrical_accentuation_augmented.msm` stores the value this spelling
   * produces. TD3 patches the Java fork, regenerates that ground truth and changes this line
   * together. PARITY.md §2 carries the measurement, including why a green test suite does
   * not certify the change.
   *
   * Consequences worth knowing before touching anything here: the comparison chain and the
   * loop direction are load-bearing, `accentuation` is deliberately read after the loop via
   * non-null assertions (it is always assigned, because the first guard proves at least the
   * first accentuation is at or before `beatPosition`), and unit tests in
   * `tests/mpm/elements/styles/defs/AccentuationPatternDef.test.ts` pin the buggy values.
   *
   * Throws if the pattern has no accentuations at all — callers such as
   * `MetricalAccentuationMap` only reach it through parsed patterns that have some.
   */
  getAccentuationAt(beatPosition: number): number {
    if (beatPosition < this.accentuations[0].getKey()[0]) return 0.0;
    if (beatPosition >= this.length + 1.0)
      return this.accentuations[this.accentuations.length - 1].getKey()[3];

    let accentuation: number[] | null = null;
    let segmentEnd = this.length + 1.0;
    for (let i = this.accentuations.length - 1; i >= 0; --i) {
      accentuation = this.accentuations[i].getKey();
      if (beatPosition === accentuation[0]) return accentuation[1];
      if (beatPosition > accentuation[0]) {
        if (i > this.accentuations.length - 1) segmentEnd = this.accentuations[i + 1].getKey()[0];
        break;
      }
    }

    return (
      ((beatPosition - accentuation![0]) * (accentuation![3] - accentuation![2])) /
        (segmentEnd - accentuation![0]) +
      accentuation![2]
    );
  }

  size(): number {
    return this.accentuations.length;
  }
  /** Length of the pattern in beats; the pattern ends at `length + 1.0`. */
  getLength(): number {
    return this.length;
  }

  setLength(length: number): void {
    this.length = length;
    this.getXml().getAttribute('length')!.setValue(String(length));
  }
}
