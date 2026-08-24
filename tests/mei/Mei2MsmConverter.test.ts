import { describe, it, expect } from 'vitest';
import { Mei } from '../../src/mei/Mei.js';
import { Mei2MsmConverter } from '../../src/mei/Mei2MsmConverter.js';
import { elementAt } from '../../src/prelude/index.js';
import type { Element } from '../../src/xml/XomTypes.js';

/**
 * Converter behaviour the byte-equivalence corpus cannot see.
 *
 * Every test here was written because a negative control came back green: the code under
 * test was broken deliberately and the suite still passed. Each `describe` below names the
 * mutation it was written to catch, so a later reader can re-run the same control and watch
 * it go red.
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
 *
 * The fourth blind spot has its own section further down, and is the largest of them: every
 * one of the sixteen MEI fixtures holds exactly one `mdiv`, so nothing in the corpus ever
 * crosses a movement boundary and `reset()` — which decides the lifetime of eleven fields —
 * runs once per conversion with nothing before it to clear. That is the hazard
 * ARCHITECTURE.md §8.5 named when it ruled the converter's cursor out of scope: a change to a
 * field's lifetime is invisible to a byte-equivalence suite. See "per-movement lifetimes"
 * below.
 *
 * The fifth is the plainest: no MEI fixture contains a `<choice>` element, so the whole
 * editorial-variant selector `processChoice` is never executed by the byte gate. See
 * "processChoice picks one editorial reading".
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
  const msms = new Mei2MsmConverter(720, true, false, cleanup).convert(Mei.fromXml(xml));
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

// control: make `labelOrN` return null unconditionally
describe('Mei2MsmConverter – the label an MSM sectionMap entry carries', () => {
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

// control: make `addLayerAttribute` write nothing
describe('Mei2MsmConverter – the layer an MSM note remembers it came from', () => {
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

// control: drop `this.accid.push(accid)` from processAccid
describe('Mei2MsmConverter – an <accid> element carries to later notes in the measure', () => {
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

/**
 * What `reset()` clears, what survives it, and what a cursor is worth once the walk leaves
 * the element that set it.
 *
 * Nothing in `tests/integration/fixtures/**` reaches this. All sixteen MEI fixtures hold
 * exactly one `mdiv`, so `reset()` runs once per conversion with an empty converter in front
 * of it and every "is this cleared between movements?" question answers itself trivially.
 * A field's lifetime is therefore invisible to the byte suites — which is the reason
 * ARCHITECTURE.md §8.5 ruled the cursor out of scope.
 *
 * Every test below is a control that came back green: removing the corresponding line from
 * `reset()` (or `processLayer`'s `this.currentLayer = parentLayer`) changed nothing anywhere
 * else.
 */

/** two movements in one document — the shape no fixture has */
function twoMovements(first: string, second: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<mei xmlns="http://www.music-encoding.org/ns/mei">
  <meiHead><fileDesc><titleStmt><title>Oracle</title></titleStmt><pubStmt/></fileDesc></meiHead>
  <music><body>
    <mdiv n="1" xml:id="mdivOne"><score>
      <scoreDef><staffGrp><staffDef n="1" lines="5"/></staffGrp></scoreDef>
      <section>${first}</section>
    </score></mdiv>
    <mdiv n="2" xml:id="mdivTwo"><score>
      <scoreDef><staffGrp><staffDef n="1" lines="5"/></staffGrp></scoreDef>
      <section>${second}</section>
    </score></mdiv>
  </body></music>
</mei>`;
}

/**
 * The root element of a converted document.
 *
 * `Msm` and `Mpm` both answer `getRootElement(): Element | null`, and the null is the
 * "nothing was built" case `Msm.isEmpty` reports — never reached here, but stated rather
 * than asserted away, since `src/mei` carries no non-null assertions and neither should
 * its tests.
 */
function rootOf(document: { getRootElement(): Element | null }): Element {
  const root = document.getRootElement();
  if (root === null) throw new Error('the converted document has no root element');
  return root;
}

/** convert a multi-movement document; `cleanup` defaults to *off* so working state is visible */
function convertMovements(xml: string, cleanup = false, ppq = 720): { msm: Element[] } {
  return {
    msm: new Mei2MsmConverter(ppq, true, false, cleanup).convert(Mei.fromXml(xml)).map(rootOf),
  };
}

/** one measure holding one quarter note, in one layer of staff 1 */
function measure(n: number, noteId: string, pname: string, extra = ''): string {
  return `<measure n="${n}"><staff n="1"><layer n="1">
    <note xml:id="${noteId}" pname="${pname}" oct="4" dur="4"/>
  </layer></staff>${extra}</measure>`;
}

describe('Mei2MsmConverter – what reset() clears between two mdivs', () => {
  it('gives each mdiv its own MSM, in document order', () => {
    const { msm } = convertMovements(
      twoMovements(measure(1, 'm1n1', 'c'), measure(1, 'm2n1', 'e')),
    );

    expect(msm.length).toBe(2);
    // the title is the work title plus the mdiv's `n`, so it names which movement is which
    expect(elementAt(msm, 0, 'the converted movements').getAttributeValue('title')).toBe(
      'Oracle - 1',
    );
    expect(elementAt(msm, 1, 'the converted movements').getAttributeValue('title')).toBe(
      'Oracle - 2',
    );
    // and each MSM holds only its own movement's notes
    expect(
      descendants(elementAt(msm, 0, 'the converted movements'), 'note').map((n) =>
        n.getAttributeValue('xml:id'),
      ),
    ).toEqual(['m1n1']);
    expect(
      descendants(elementAt(msm, 1, 'the converted movements'), 'note').map((n) =>
        n.getAttributeValue('xml:id'),
      ),
    ).toEqual(['m2n1']);
  });

  // control: drop `this.endingCounter = 0` from reset()
  it('restarts the ending counter, so the second movement numbers its endings from zero', () => {
    // an `ending` with `@label` and no `@n` is the one shape whose marker message is the
    // *counter* rather than the label — which is what makes the counter observable at all
    const ending = (label: string, n: number, noteId: string, pname: string) =>
      `<ending label="${label}">${measure(n, noteId, pname)}</ending>`;

    const { msm } = convertMovements(
      twoMovements(
        measure(1, 'm1n1', 'c') +
          ending('first', 2, 'm1n2', 'd') +
          ending('second', 3, 'm1n3', 'e'),
        measure(1, 'm2n1', 'f') + ending('third', 2, 'm2n2', 'g'),
      ),
    );

    const messages = (root: Element) =>
      descendants(root, 'marker').map((m) => m.getAttributeValue('message'));
    expect(messages(elementAt(msm, 0, 'the converted movements'))).toEqual(['ending0', 'ending1']);
    // not `ending2`: the counter belongs to the movement, not to the conversion
    expect(messages(elementAt(msm, 1, 'the converted movements'))).toEqual(['ending0']);
  });

  // control: drop `this.endids = []` from reset()
  it('drops unresolved endids, so a span cannot be closed by the next movement', () => {
    const { msm } = convertMovements(
      twoMovements(
        measure(1, 'm1n1', 'c', '<pedal xml:id="m1ped" dir="down" endid="#m2n1"/>'),
        measure(1, 'm2n1', 'e'),
      ),
    );

    // the parked MSM entry stays in movement 1's global pedalMap, still naming its endid…
    const pedals = descendants(elementAt(msm, 0, 'the converted movements'), 'pedal');
    expect(pedals.length).toBe(1);
    const slur = elementAt(pedals, 0, "movement 1's pedals");
    expect(slur.getAttributeValue('endid')).toBe('#m2n1');
    // …and never gains a `date.end`, which is what `checkEndid` would write had the parked
    // entry survived into the walk that meets `m2n1`
    expect(slur.getAttributeValue('date.end')).toBeNull();
    // nor does the span leak the other way, into the movement that holds the target
    expect(descendants(elementAt(msm, 1, 'the converted movements'), 'slur').length).toBe(0);
  });

  // control: move the `computeMinimalPPQ` raise in `convertMei` inside the per-mdiv loop
  it('keeps the tick grid across movements, raised once for the whole document', () => {
    // a 32nd note needs ppq 8; the converter is asked for 4, and the note is in movement *2*
    const { msm } = convertMovements(
      twoMovements(
        measure(1, 'm1n1', 'c'),
        `<measure n="1"><staff n="1"><layer n="1">
           <note xml:id="m2n1" pname="e" oct="4" dur="32"/>
         </layer></staff></measure>`,
      ),
      false,
      4,
    );

    // both movements are on the raised grid — `ppq` belongs to the conversion, not to a
    // movement, which is why `reset()` deliberately leaves it alone
    for (const root of msm) expect(root.getAttributeValue('pulsesPerQuarter')).toBe('8');
  });
});

// control: give the movement context `work: null` unconditionally
describe('Mei2MsmConverter – the meiHead work a movement claims', () => {
  /**
   * The `work` a movement claims has exactly one ambient read — the `<meter>` fallback in
   * `getCurrentTimeSignature`, taken only when neither the part's nor the global
   * `timeSignatureMap` holds anything — and nothing reached it. Dropping the work from the
   * movement context entirely left `tests/integration` and `tests/mei` passing, including
   * the fallback-tempo test above, which reads the same lookup's result inside
   * `makeMovement` and never goes through the context at all.
   *
   * A `@tstamp` is the shortest path to it: `tstampToTicks` scales the beat by
   * `4 * ppq / denominator`, so the work's `unit` moves a control event's date.
   */
  it('supplies the time signature when neither the part nor the score states one', () => {
    /** the MSM date of the one `<pedal>` entry, for a document whose work carries `meter` */
    const pedalDate = (meter: string): string | null => {
      const msms = new Mei2MsmConverter(720, true, false, false).convert(
        Mei.fromXml(`<?xml version="1.0" encoding="UTF-8"?>
<mei xmlns="http://www.music-encoding.org/ns/mei">
  <meiHead><fileDesc><titleStmt><title>Oracle</title></titleStmt><pubStmt/></fileDesc>
    <workList><work xml:id="w1"><title>One</title>${meter}</work></workList>
  </meiHead>
  <music><body><mdiv n="1"><score>
    <scoreDef><staffGrp><staffDef n="1" lines="5"/></staffGrp></scoreDef>
    <section>
      <measure n="1">
        <staff n="1"><layer n="1"><note xml:id="n1" pname="c" oct="4" dur="1"/></layer></staff>
        <pedal xml:id="p1" tstamp="3" dir="down"/>
      </measure>
    </section>
  </score></mdiv></body></music>
</mei>`),
      );
      const msm = rootOf(elementAt(msms, 0, 'the converted movements'));
      const pedals = descendants(msm, 'pedal');
      expect(pedals.length).toBe(1);
      return elementAt(pedals, 0, 'the pedal entries').getAttributeValue('date');
    };

    // beat 3 of a half-note beat: (3 - 1) * 4 * 720 / 2
    expect(pedalDate('<meter count="3" unit="2"/>')).toBe('2880');
    // …and 4/4 is the default the same document falls back to with no work meter at all
    expect(pedalDate('')).toBe('1440');
  });
});

// control: delete `this.currentLayer = parentLayer` from processLayer
describe('Mei2MsmConverter – a cursor stops applying when the walk leaves its element', () => {
  /**
   * The four other cursor restores are pinned by the byte corpus — deleting any of
   * `processStaffDef`'s or `processStaff`'s `this.currentPart = parentPart`,
   * `processMeasure`'s `this.currentMeasure = null` or `processChord`'s
   * `this.currentChord = f` reds `tests/integration/cross-validation.test.ts`. The layer
   * cursor is the exception: it survives only into `msmCleanup`'s working attributes, so
   * with `cleanup` on nothing downstream can see it, and the whole suite passed with the
   * restore deleted.
   */
  it('stops stamping a layer once the layer is closed', () => {
    const msm = convertToMsm(
      score(`
    <section>
      <measure n="1"><staff n="1"><layer n="1"><note xml:id="inLayer" pname="c" oct="4" dur="4"/></layer></staff></measure>
      <measure n="2"><staff n="1"><note xml:id="afterLayer" pname="d" oct="4" dur="4"/></staff></measure>
    </section>`),
      false,
    );

    const byId = new Map(descendants(msm, 'note').map((n) => [n.getAttributeValue('xml:id'), n]));
    expect(byId.size).toBe(2);
    expect(byId.get('inLayer')?.getAttributeValue('layer')).toBe('1');
    // the previous measure's layer must not still be in force here
    expect(byId.get('afterLayer')?.getAttributeValue('layer')).toBeNull();
  });

  /**
   * The other end of the same cursor, and the second control that came back green: making
   * `processStaffDef` walk its own children under the enclosing context — i.e. never opening
   * the part it just created — changed nothing anywhere else.
   *
   * It is unobserved because a `staffDef` in this corpus never contains anything the walk
   * descends into. `layerDef` is the shape that makes the difference visible: `processLayerDef`
   * writes its defaults into the part's `miscMap` when a part is open and into the *global*
   * one when none is, so the two contexts send the same three elements to two different
   * places.
   */
  it('opens the part for a staffDef’s own children, not just for the staff that uses it', () => {
    // `cleanup: false` again: `msmCleanup` prunes the miscMaps this is about
    const msm = convertToMsm(
      `<?xml version="1.0" encoding="UTF-8"?>
<mei xmlns="http://www.music-encoding.org/ns/mei">
  <meiHead><fileDesc><titleStmt><title>Oracle</title></titleStmt><pubStmt/></fileDesc></meiHead>
  <music><body><mdiv><score>
    <scoreDef><staffGrp>
      <staffDef n="1" lines="5"><layerDef n="1" dur.default="8" octave.default="3"/></staffDef>
    </staffGrp></scoreDef>
    <section>
      <measure n="1"><staff n="1"><layer n="1"><note pname="c" oct="4" dur="4"/></layer></staff></measure>
    </section>
  </score></mdiv></body></music>
</mei>`,
      false,
    );

    /** the local names of everything the given container's `miscMap` holds */
    const miscMapContents = (container: Element): string[] =>
      elementAt(descendants(container, 'miscMap'), 0, 'the miscMaps')
        .query('descendant::*')
        .toArray()
        .map((n) => (n as unknown as Element).getLocalName());

    const parts = descendants(msm, 'part');
    expect(parts.length).toBe(1);
    const inPart = miscMapContents(elementAt(parts, 0, 'the MSM parts'));
    // all three of `processLayerDef`'s outputs belong to the part the staffDef opened
    expect(inPart).toContain('layerDef');
    expect(inPart).toContain('dur.default');
    expect(inPart).toContain('oct.default');

    // …and none of them to the global section, which is where `processLayerDef` sends them
    // when no part is open — the observable difference between the two contexts
    const globals = descendants(msm, 'global');
    expect(miscMapContents(elementAt(globals, 0, 'the MSM global sections'))).not.toContain(
      'layerDef',
    );
  });
});

/**
 * The fifth blind spot, and the plainest: no MEI fixture in the corpus contains a `<choice>`
 * element at all, so `processChoice` — the whole editorial-variant selector — is never
 * executed by the byte gate. The control that found it changed the fallback arm from
 * "convert the first child" to "convert the second" and left the suite green.
 *
 * The method has three behaviours worth pinning and they are independent of each other: the
 * preference order over the nine editorial names, the recursion into a nested `choice`, and
 * the any-name fallback for a `choice` holding none of the nine.
 */
describe('Mei2MsmConverter – processChoice picks one editorial reading', () => {
  /** the `xml:id`s of the MSM notes, which is which MEI branch survived selection */
  const noteIds = (msm: Element): (string | null)[] =>
    descendants(msm, 'note').map((n) => n.getAttributeValue('xml:id'));

  /** a one-measure score whose single layer holds `content` */
  const inLayer = (content: string): string =>
    score(
      `<section><measure n="1"><staff n="1"><layer n="1">${content}</layer></staff></measure></section>`,
    );

  it('takes the first child in preference order, not in document order', () => {
    // `sic` comes first in the document and last but one in `prefOrder`; `corr` is first.
    const msm = convertToMsm(
      inLayer(`<choice>
        <sic><note xml:id="SIC" pname="c" oct="4" dur="4"/></sic>
        <corr><note xml:id="CORR" pname="d" oct="4" dur="4"/></corr>
      </choice>`),
    );
    expect(noteIds(msm)).toEqual(['CORR']);
  });

  it('recurses when the preferred child is itself a choice', () => {
    const msm = convertToMsm(
      inLayer(`<choice>
        <choice><corr><note xml:id="INNER" pname="e" oct="4" dur="4"/></corr></choice>
      </choice>`),
    );
    expect(noteIds(msm)).toEqual(['INNER']);
  });

  it('falls back to the first child of any name, and converts only that one', () => {
    // Neither `add` nor `supplied` is in the preference list, so the fallback decides — and
    // it takes exactly one child. This is the case the green control mutated.
    const msm = convertToMsm(
      inLayer(`<choice>
        <add><note xml:id="FIRST" pname="e" oct="4" dur="4"/></add>
        <supplied><note xml:id="SECOND" pname="f" oct="4" dur="4"/></supplied>
      </choice>`),
    );
    expect(noteIds(msm)).toEqual(['FIRST']);
  });

  it('converts nothing for an empty choice, and does not disturb what follows it', () => {
    const msm = convertToMsm(inLayer(`<choice/><note xml:id="AFTER" pname="g" oct="4" dur="4"/>`));
    expect(noteIds(msm)).toEqual(['AFTER']);
  });
});
