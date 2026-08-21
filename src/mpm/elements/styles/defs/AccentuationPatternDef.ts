import { Attribute, Element } from '../../../../xml/XomTypes.js';
import { allChildElements, attribute } from '../../../../xml/tree.js';
import { MPM_NAMESPACE } from '../../../names.js';
import { KeyValue } from '../../../../supplementary/KeyValue.js';
import { parseJavaDouble } from '../../../../supplementary/parseJavaDouble.js';
import { AbstractXmlSubtree } from '../../../../xml/AbstractXmlSubtree.js';
import { requireDefName, skipMalformedDef } from './defName.js';
import { isOk, ok, type Result } from '../../../../prelude/index.js';
import { type MpmParseError } from '../../parseError.js';
import { elementAt, head, isNonEmpty, last } from '../../../../prelude/index.js';

/**
 * One accentuation's four numbers, in Java's order: `[beat, value, transition.from,
 * transition.to]`.
 *
 * A tuple and not a `number[]`, because the length is the whole contract — every read in this
 * file is one of exactly four slots, and `double[4]` is what Java stores. Written as
 * `number[]` the compiler cannot tell `[1]` from `[97]`, which under
 * `noUncheckedIndexedAccess` made every one of those reads `number | undefined` and every
 * write to `[2]` a type error. Naming the shape answers all of them at once, and it is the
 * reason `getAccentuationAt` no longer needs the four non-null assertions it carried.
 */
export type AccentuationTuple = [beat: number, value: number, from: number, to: number];

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
export class AccentuationPatternDef extends AbstractXmlSubtree {
  /** This def's arm of {@link Def}. See {@link requireDefName} on why there is no base class. */
  readonly kind = 'accentuationPattern';
  private length = 4.0;
  private readonly accentuations: KeyValue<AccentuationTuple, Element>[] = [];
  /**
   * The `@length` node, held so {@link setLength} writes where {@link parseData} read.
   *
   * Assigned in `parseData` rather than the constructor because — unlike a `tempoDef`'s
   * `@value` — this attribute may be *created* there: a pattern that declares no length gets
   * the default 4.0 written onto its element. The `!` that this would otherwise need is
   * avoided by initialising it to the same attribute node the default path builds.
   */
  private lengthAttr: Attribute;

  private constructor(private readonly nameAttr: Attribute) {
    super();
    this.lengthAttr = new Attribute('length', String(this.length));
  }

  getName(): string {
    return this.nameAttr.getValue();
  }

  /** Rename the def, in the object and in the element. Was `AbstractDef.setName`. */
  setName(name: string): void {
    this.nameAttr.setValue(name);
  }

  protected parseData(xml: Element): void {
    this.setXml(xml);
    this.id = attribute('id', xml);

    const declaredLength = attribute('length', xml);
    if (declaredLength === null) {
      // The constructor's placeholder becomes the element's real attribute: same node, so a
      // later `setLength` writes through to the document exactly as it did before.
      xml.addAttribute(this.lengthAttr);
    } else {
      this.lengthAttr = declaredLength;
    }
    const lengthAttr = this.lengthAttr;
    // Every read below throws on a malformed value, so createAccentuationPatternDef returns
    // null and the style skips the pattern — Java's behaviour at AccentuationPatternDef.java:
    // 113,122-136, where each is a bare Double.parseDouble in the throwing constructor.
    // See PARITY.md, "Fixed bugs", P1.
    this.length = parseJavaDouble(lengthAttr.getValue(), 'accentuationPatternDef/@length');

    for (const ac of allChildElements(xml, 'accentuation')) {
      const att = attribute('beat', ac);
      if (att === null) continue;
      const accentuation: AccentuationTuple = [
        parseJavaDouble(att.getValue(), 'accentuation/@beat'),
        0.0,
        0.0,
        0.0,
      ];

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
    }
    // ONCE, after the loop — it used to run after every parsed accentuation.
    //
    // `sortXml` is a full re-layout: it walks the whole list and puts element j at child
    // index j, so its result depends only on the list and not on the arrangement it starts
    // from. Running it n times therefore ends where running it once ends, and the first n-1
    // runs were pure work. That is a whole factor of n: with `removeChild` and `insertChild`
    // each linear in the child count, the incumbent was CUBIC in the number of accentuations
    // — measured at ×7-8 per doubling (n=100 1.1 ms, 200 6.9 ms, 400 56 ms, 800 380 ms).
    //
    // The non-accentuation children a hand-written pattern may carry are unaffected by the
    // change: nothing here moves them relative to each other, and each removal-and-reinsert
    // shifts them the same way whenever it runs. `tests/…/AccentuationPatternDef.test.ts`
    // pins document order for interleaved foreign children, duplicate beats and a
    // `beat`-less child, which are the three shapes where "sorted repeatedly" and "sorted
    // once" could conceivably have parted company.
    this.sortXml();
  }

  /**
   * Create a pattern from a name and length, optionally with an id.
   *
   * Split from {@link fromXml}, which the `createAccentuationPatternDef` overload set used to
   * share a name with although both arms returned the same type. Note what the split makes
   * visible: `id` only ever applied to THIS arm — the implementation had to write
   * `typeof nameOrXml === 'string' && id !== undefined` to say so, because the parameter was
   * reachable from a call shape it had no meaning for. Here it is simply this function's
   * third parameter.
   */
  static fromNameLength(
    name: string,
    length: number,
    id?: string,
  ): Result<AccentuationPatternDef, MpmParseError> {
    const xml = new Element('accentuationPatternDef', MPM_NAMESPACE);
    xml.addAttribute(new Attribute('name', name));
    xml.addAttribute(new Attribute('length', String(length)));
    const built = AccentuationPatternDef.fromXml(xml);
    if (isOk(built) && id !== undefined) built.value.setId(id);
    return built;
  }

  /**
   * Create a pattern by parsing an existing `accentuationPatternDef` element. Reports the
   * reason rather than throwing. See {@link fromNameLength}.
   */
  static fromXml(xml: Element): Result<AccentuationPatternDef, MpmParseError> {
    try {
      const apd = new AccentuationPatternDef(requireDefName(xml, 'AccentuationPatternDef'));
      apd.parseData(xml);
      return ok(apd);
    } catch (e) {
      return skipMalformedDef(e, 'AccentuationPatternDef');
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
    const accentuation: AccentuationTuple = [
      parseJavaDouble(att.getValue(), 'accentuation/@beat'),
      0.0,
      0.0,
      0.0,
    ];

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
   *
   * That sentence is {@link insertionIndexBy}'s contract word for word, and the scan is
   * still written out anyway — for the reason `GenericMap.insertionIndexFor` records at
   * length. `@beat` reaches here through {@link parseJavaDouble}, which accepts the literal
   * `NaN` exactly as `Double.parseDouble` does. One NaN in the array leaves it unordered,
   * and on an unordered array a linear backwards scan and a binary upper bound do not agree:
   * the scan walks past the NaN (`x >= NaN` is false) and keeps going left, where
   * `partitionPoint` reads it as a boundary and splits on an answer that is false on both
   * sides. The two agree on every ordered input. The resulting order is serialized —
   * {@link addAccentuation} uses the returned index as the XML child index — so the
   * disagreement would be byte-visible, and parity beats the shorter spelling.
   * @returns the index it was inserted at, which is also the XML child index to use
   */
  private addAccentuationToArrayList(accentuation: AccentuationTuple, xml: Element): number {
    // `findLastIndex` (ES2023) is the backwards scan, and its `-1` for "nothing qualifies"
    // becomes the front insertion under the same `+ 1`. That collapses what were two splices
    // and two returns — the loop body and the fall-through — into one of each, which is what
    // makes it evident that both always agreed on the index.
    const index = this.accentuations.findLastIndex((kv) => accentuation[0] >= kv.getKey()[0]) + 1;
    this.accentuations.splice(index, 0, new KeyValue(accentuation, xml));
    return index;
  }

  /**
   * Reorder the `accentuation` children to match {@link accentuations} by detaching and
   * re-inserting each one in turn. Called after every parsed accentuation, so parsing is
   * quadratic in the number of accentuations — patterns are a handful of beats long, and
   * the repeated remove/insert is what keeps serialization order identical to Java's.
   */
  private sortXml(): void {
    const xml = this.getXml();
    for (const [i, entry] of this.accentuations.entries()) {
      const accentuation = entry.getValue();
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
    const entry = this.entryAt(index);
    if (entry === null) return;
    this.getXml().removeChild(entry.getValue());
    this.accentuations.splice(index, 1);
  }

  /**
   * The entry at `index` under Java's asymmetric bound rule, stated once for the three
   * accessors that share it: past the end is "no such accentuation", and a NEGATIVE index
   * throws rather than answering — as it did when the read produced `undefined` and failed on
   * the property access, only now naming the index and the bound.
   */
  private entryAt(index: number): KeyValue<AccentuationTuple, Element> | null {
    if (index >= this.accentuations.length) return null;
    return elementAt(this.accentuations, index, 'accentuation');
  }

  /** The live list, not a copy — mutating it desynchronises the def from its XML. */
  getAllAccentuations(): KeyValue<AccentuationTuple, Element>[] {
    return this.accentuations;
  }

  getAccentuationAttributes(index: number): AccentuationTuple | null {
    return this.entryAt(index)?.getKey() ?? null;
  }

  getAccentuationXml(index: number): Element | null {
    return this.entryAt(index)?.getValue() ?? null;
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
   * The segment-end guard mirrors `AccentuationPatternDef.java:316-320` as fixed in
   * `pfefferniels/meico@1d662105`, and the asymmetry in it is deliberate:
   *
   * - for an accentuation that has a successor, `segmentEnd` becomes the *next* one's beat,
   *   so each transition ramps to its own segment's end (`i < this.accentuations.length - 1`);
   * - for the **last** accentuation the guard does not fire, so `segmentEnd` keeps its initial
   *   `length + 1.0` and the final segment ramps to the end of the whole pattern.
   *
   * Upstream cemfi/meico spells that guard `i > this.accentuations.length - 1`, which can never
   * hold — the loop starts at `length - 1` and only counts down — so every segment ran to the
   * pattern end and all but the last accentuation's interpolation was flattened. Fixing it
   * moved Java-generated ground truth, so item TD3 patched the fork, regenerated the affected
   * fixtures and changed this line together; PARITY.md §1 carries the measurement.
   *
   * Consequences worth knowing before touching anything here: the comparison chain and the
   * loop direction are load-bearing, `accentuation` is deliberately read after the loop via
   * non-null assertions (it is always assigned, because the first guard proves at least the
   * first accentuation is at or before `beatPosition`), and unit tests in
   * `tests/mpm/elements/styles/defs/AccentuationPatternDef.test.ts` pin both halves of the
   * asymmetry — reverting the guard fails them.
   *
   * Throws if the pattern has no accentuations at all — callers such as
   * `MetricalAccentuationMap` only reach it through parsed patterns that have some.
   */
  getAccentuationAt(beatPosition: number): number {
    const all = this.accentuations;
    if (!isNonEmpty(all))
      throw new RangeError('accentuationPatternDef has no accentuation to read a beat position at');
    if (beatPosition < head(all).getKey()[0]) return 0.0;
    if (beatPosition >= this.length + 1.0) return last(all).getKey()[3];

    // Seeded with the FIRST accentuation instead of null, which is where the four non-null
    // assertions went. It is not a fallback: the loop's last possible iteration is `i === 0`,
    // and it assigns exactly this. The guard above has already established
    // `beatPosition >= all[0].beat`, so that iteration either returns (equal) or breaks
    // (greater) — it cannot fall out of the bottom leaving the seed in place, and if it
    // somehow did, the seed is still the value the loop would have left.
    let accentuation: AccentuationTuple = head(all).getKey();
    let segmentEnd = this.length + 1.0;
    for (let i = all.length - 1; i >= 0; --i) {
      accentuation = elementAt(all, i, 'accentuation').getKey();
      if (beatPosition === accentuation[0]) return accentuation[1];
      if (beatPosition > accentuation[0]) {
        if (i < all.length - 1) segmentEnd = elementAt(all, i + 1, 'accentuation').getKey()[0];
        break;
      }
    }

    return (
      ((beatPosition - accentuation[0]) * (accentuation[3] - accentuation[2])) /
        (segmentEnd - accentuation[0]) +
      accentuation[2]
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
    this.lengthAttr.setValue(String(length));
  }
}
