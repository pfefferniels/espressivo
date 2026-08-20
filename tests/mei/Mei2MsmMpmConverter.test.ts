import { describe, it, expect } from 'vitest';
import { Mei } from '../../src/mei/Mei.js';
import { Mei2MsmMpmConverter } from '../../src/mei/Mei2MsmMpmConverter.js';
import type { Element } from '../../src/xml/XomTypes.js';

/**
 * Converter behaviour the byte-equivalence corpus cannot see.
 *
 * Every test here was written because a **negative control came back green**: the code under
 * test was broken deliberately and all 6062 tests still passed. Each `describe` below names
 * the mutation it was written to catch, so a later reader can re-run the same control and
 * watch it go red.
 *
 * The corpus is blind to these three for structural reasons, not by oversight:
 * - `tests/integration/fixtures/mei/**` contains no `section` or `phrase` carrying `@label`
 *   or `@n`, so the label the MSM section/phrase maps get is never compared;
 * - `layer` is a *working* attribute — `msmCleanup` strips it, along with `currentDate`,
 *   `tie`, `endid` and `tstamp2`, before the MSM is written — so the Java reference MSMs
 *   contain no `layer` at all and a fixture can only catch it through a downstream effect.
 *   The converter's `cleanup` flag is the seam: with it off, the working attributes survive
 *   and the voice tracking becomes directly observable;
 * - exactly one fixture carries a standalone `<accid>` element, on the only note of its
 *   pitch in its measure, so the deferred-accidental list it feeds is never read back.
 */

/** the MEI everything below is a variation of: one staff, `sectionInner` inside `section` */
function score(sections: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<mei xmlns="http://www.music-encoding.org/ns/mei">
  <meiHead><fileDesc><titleStmt><title>Oracle</title></titleStmt><pubStmt/></fileDesc></meiHead>
  <music><body><mdiv><score>
    <scoreDef><staffGrp><staffDef n="1" lines="5"/></staffGrp></scoreDef>
    ${sections}
  </score></mdiv></body></music>
</mei>`;
}

/** convert `xml`, returning the single MSM's root element */
function convertToMsm(xml: string, cleanup = true): Element {
  const result = new Mei2MsmMpmConverter(720, true, false, cleanup).convert(Mei.fromXml(xml));
  const msms = result.getKey();
  expect(msms.length).toBe(1);
  const root = msms[0]?.getRootElement();
  expect(root).not.toBeNull();
  return root as Element;
}

/** every descendant element of `root` with the given local name, in document order */
function descendants(root: Element, localName: string): Element[] {
  return root
    .query(`descendant::*[local-name()='${localName}']`)
    .toArray()
    .map((n) => n as unknown as Element);
}

// ---------------------------------------------------------------------------
// section / phrase labels — control: make `labelOrN` return null unconditionally
// ---------------------------------------------------------------------------
describe('Mei2MsmMpmConverter – the label an MSM sectionMap entry carries', () => {
  it('prefers @label over @n, and falls back to @n', () => {
    const msm = convertToMsm(
      score(`
    <section n="1" label="Exposition">
      <measure n="1"><staff n="1"><layer n="1"><note pname="c" oct="4" dur="4"/></layer></staff></measure>
    </section>
    <section n="2">
      <measure n="2"><staff n="1"><layer n="1"><note pname="d" oct="4" dur="4"/></layer></staff></measure>
    </section>
    <section>
      <measure n="3"><staff n="1"><layer n="1"><note pname="e" oct="4" dur="4"/></layer></staff></measure>
    </section>`),
    );

    const sections = descendants(msm, 'section');
    expect(sections.length).toBe(3);
    // @label wins where both are present — `n="1"` must not reach the output
    expect(sections[0]?.getAttributeValue('label')).toBe('Exposition');
    // @n is the fallback, and it is written into `label`, not into `n`
    expect(sections[1]?.getAttributeValue('label')).toBe('2');
    expect(sections[1]?.getAttributeValue('n')).toBeNull();
    // neither present: no `label` attribute at all, rather than an empty one
    expect(sections[2]?.getAttributeValue('label')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// voice tracking — control: make `addLayerAttribute` write nothing
// ---------------------------------------------------------------------------
describe('Mei2MsmMpmConverter – the layer an MSM note remembers it came from', () => {
  /**
   * `cleanup: false` is what makes this observable at all; with the default `true`,
   * `msmCleanup` deletes every `layer` attribute on the way out, which is why the Java
   * reference MSMs carry none and why the byte suites cannot see this.
   */
  it('stamps each note with its layer, preferring @def over @n', () => {
    const msm = convertToMsm(
      score(`
    <section>
      <measure n="1"><staff n="1">
        <layer n="1"><note xml:id="a" pname="c" oct="4" dur="4"/></layer>
        <layer n="2"><note xml:id="b" pname="e" oct="4" dur="4"/></layer>
        <layer def="upper" n="9"><note xml:id="c" pname="g" oct="4" dur="4"/></layer>
      </staff></measure>
    </section>`),
      false,
    );

    const byId = new Map(descendants(msm, 'note').map((n) => [n.getAttributeValue('xml:id'), n]));
    expect(byId.size).toBe(3);
    expect(byId.get('a')?.getAttributeValue('layer')).toBe('1');
    expect(byId.get('b')?.getAttributeValue('layer')).toBe('2');
    // `def` names a layerDef and is therefore stable across measures, so it wins over `n`
    expect(byId.get('c')?.getAttributeValue('layer')).toBe('upper');
  });

  it('leaves the attribute off music that is in no layer', () => {
    const msm = convertToMsm(
      score(`
    <section>
      <measure n="1"><staff n="1"><note xml:id="bare" pname="c" oct="4" dur="4"/></staff></measure>
    </section>`),
      false,
    );

    const notes = descendants(msm, 'note');
    expect(notes.length).toBe(1);
    expect(notes[0]?.getAttributeValue('layer')).toBeNull();
  });

  it('still deletes the attribute when cleanup is on, which is what the fixtures compare', () => {
    const inner = `
    <section>
      <measure n="1"><staff n="1"><layer n="1"><note pname="c" oct="4" dur="4"/></layer></staff></measure>
    </section>`;
    const cleaned = convertToMsm(score(inner));
    expect(descendants(cleaned, 'note')[0]?.getAttributeValue('layer')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// deferred accidentals — control: drop `this.accid.push(accid)` from processAccid
// ---------------------------------------------------------------------------
describe('Mei2MsmMpmConverter – an <accid> element carries to later notes in the measure', () => {
  /**
   * `keys_accidentals.mei` is the one fixture with a standalone `<accid>`, and it puts it on
   * the only note of that pitch in its measure — so the whole deferred-accidental mechanism
   * (`this.accid`, drained per measure, consulted by `computePitch`) never fires, and the
   * suite passed with `processAccid` neither recording the accidental nor writing a correct
   * `pname` on it. The MEI rule has three parts and this pins all three.
   */
  /** the pitch and accidental count of each note in the single MSM `<score>`, by `xml:id` */
  function pitches(msm: Element): Map<string | null, string> {
    return new Map(
      descendants(msm, 'note').map((n) => [
        n.getAttributeValue('xml:id'),
        `${n.getAttributeValue('midi.pitch') ?? '?'}/${n.getAttributeValue('accidentals') ?? '?'}`,
      ]),
    );
  }

  it('applies to the same pitch and octave, not to another octave, and not past the barline', () => {
    const byId = pitches(
      convertToMsm(
        score(`
    <section>
      <measure n="1"><staff n="1"><layer n="1">
        <note xml:id="n1" pname="f" oct="4" dur="4"><accid xml:id="a1" accid="s"/></note>
        <note xml:id="n2" pname="f" oct="4" dur="4"/>
        <note xml:id="n3" pname="f" oct="5" dur="4"/>
      </layer></staff></measure>
      <measure n="2"><staff n="1"><layer n="1">
        <note xml:id="n4" pname="f" oct="4" dur="4"/>
      </layer></staff></measure>
    </section>`),
      ),
    );

    expect(byId.size).toBe(4);
    // the note the `accid` sits in is sharpened by it
    expect(byId.get('n1')).toBe('66/1');
    // …and so is the next note of the same pitch class *and octave* in the same measure,
    // which is the whole point of the deferred list
    expect(byId.get('n2')).toBe('66/1');
    // a different octave is a different note: f5 stays natural
    expect(byId.get('n3')).toBe('77/0');
    // and the list is cleared at the barline, so f4 in the next measure is natural again
    expect(byId.get('n4')).toBe('65/0');
  });

  /**
   * The shape that reaches `processAccid`'s *own* registration. When the `accid` sits inside
   * a note, `processAccid` copies its `@accid` onto that note and `processNote` is what
   * records it — so the standalone form, which names its pitch with `@ploc`/`@oloc` and has
   * no note to copy onto, is the only one that depends on the `pname` and `oct` attributes
   * `processAccid` writes and on it pushing the element itself.
   */
  it('does the same for a standalone accid that names its pitch with @ploc and @oloc', () => {
    const byId = pitches(
      convertToMsm(
        score(`
    <section>
      <measure n="1"><staff n="1"><layer n="1">
        <accid xml:id="a1" accid="s" ploc="f" oloc="4"/>
        <note xml:id="n1" pname="f" oct="4" dur="4"/>
        <note xml:id="n2" pname="f" oct="5" dur="4"/>
      </layer></staff></measure>
      <measure n="2"><staff n="1"><layer n="1">
        <note xml:id="n3" pname="f" oct="4" dur="4"/>
      </layer></staff></measure>
    </section>`),
      ),
    );

    expect(byId.size).toBe(3);
    expect(byId.get('n1')).toBe('66/1');
    expect(byId.get('n2')).toBe('77/0');
    expect(byId.get('n3')).toBe('65/0');
  });
});
