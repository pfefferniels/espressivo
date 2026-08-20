import { describe, it, expect } from 'vitest';
import { Mei } from '../../src/mei/Mei.js';
import { Mei2MsmMpmConverter } from '../../src/mei/Mei2MsmMpmConverter.js';
import { elementAt } from '../../src/prelude/index.js';
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
 *
 * The fourth blind spot has its own section at the bottom of this file, and is the largest of
 * them: **every one of the sixteen MEI fixtures holds exactly one `mdiv`**, so nothing in the
 * corpus ever crosses a movement boundary and `reset()` — which decides the *lifetime* of
 * eleven fields — is executed once per run with nothing before it to clear. That is the
 * hazard ARCHITECTURE.md §8.5 named when it ruled the converter's cursor out of scope: a
 * change to a field's lifetime is invisible to a byte-equivalence suite. See
 * "per-movement lifetimes" below.
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

// ---------------------------------------------------------------------------
// per-movement lifetimes — controls: delete a line from `reset()`, or a cursor
// restore from `processLayer`
// ---------------------------------------------------------------------------
/**
 * What `reset()` clears, what survives it, and what a cursor is worth once the walk leaves
 * the element that set it.
 *
 * **Nothing in `tests/integration/fixtures/**` reaches this.** All sixteen MEI fixtures hold
 * exactly one `mdiv`, so `reset()` runs once per conversion with an empty converter in front
 * of it and every "is this cleared between movements?" question answers itself trivially.
 * A field's *lifetime* is therefore invisible to the byte suites — which is the reason
 * ARCHITECTURE.md §8.5 ruled the cursor out of scope, and the reason these tests exist before
 * it is moved.
 *
 * Every test below is a control that came back green against the whole 6071-test suite:
 * removing the corresponding line from `reset()` (or `processLayer`'s
 * `this.currentLayer = parentLayer`) changed nothing anywhere else.
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
function convertMovements(
  xml: string,
  cleanup = false,
  ppq = 720,
): { msm: Element[]; mpm: Element[] } {
  const result = new Mei2MsmMpmConverter(ppq, true, false, cleanup).convert(Mei.fromXml(xml));
  return {
    msm: result.getKey().map(rootOf),
    mpm: result.getValue().map(rootOf),
  };
}

/** one measure holding one quarter note, in one layer of staff 1 */
function measure(n: number, noteId: string, pname: string, extra = ''): string {
  return `<measure n="${n}"><staff n="1"><layer n="1">
    <note xml:id="${noteId}" pname="${pname}" oct="4" dur="4"/>
  </layer></staff>${extra}</measure>`;
}

describe('Mei2MsmMpmConverter – what reset() clears between two mdivs', () => {
  it('gives each mdiv its own MSM and MPM, in document order', () => {
    const { msm, mpm } = convertMovements(
      twoMovements(measure(1, 'm1n1', 'c'), measure(1, 'm2n1', 'e')),
    );

    expect(msm.length).toBe(2);
    expect(mpm.length).toBe(2);
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

  // control: drop `this.allNotesAndChords.clear()` from reset()
  it('clears the note index, so a startid cannot reach into the previous movement', () => {
    const { mpm } = convertMovements(
      twoMovements(
        // `m1n2` is the second quarter of movement 1, i.e. at date 720
        `<measure n="1"><staff n="1"><layer n="1">
           <note xml:id="m1n1" pname="c" oct="4" dur="4"/>
           <note xml:id="m1n2" pname="d" oct="4" dur="4"/>
         </layer></staff></measure>`,
        measure(1, 'm2n1', 'e', '<dynam xml:id="m2dyn" startid="#m1n2">f</dynam>'),
      ),
    );

    const dynamics = descendants(elementAt(mpm, 1, 'the converted performances'), 'dynamics');
    expect(dynamics.length).toBe(1);
    // the reference resolves to nothing, so the dynamic falls back to the current date — 0.
    // A leaked index would find `m1n2`, whose `date` attribute movement 1 wrote as 720.
    expect(elementAt(dynamics, 0, 'the second movement dynamics').getAttributeValue('date')).toBe(
      '0',
    );
  });

  // control: drop `this.endids = []` from reset()
  it('drops unresolved endids, so a span cannot be closed by the next movement', () => {
    const { msm } = convertMovements(
      twoMovements(
        measure(1, 'm1n1', 'c', '<slur xml:id="m1slur" startid="#m1n1" endid="#m2n1"/>'),
        measure(1, 'm2n1', 'e'),
      ),
    );

    // the parked MSM entry stays in movement 1's global miscMap, still naming its endid…
    const slurs = descendants(elementAt(msm, 0, 'the converted movements'), 'slur');
    expect(slurs.length).toBe(1);
    const slur = elementAt(slurs, 0, "movement 1's slurs");
    expect(slur.getAttributeValue('endid')).toBe('#m2n1');
    // …and never gains a `date.end`, which is what `checkEndid` would write had the parked
    // entry survived into the walk that meets `m2n1`
    expect(slur.getAttributeValue('date.end')).toBeNull();
    // nor does the span leak the other way, into the movement that holds the target
    expect(descendants(elementAt(msm, 1, 'the converted movements'), 'slur').length).toBe(0);
  });

  // control: drop `this.currentWork = null` from reset()
  it('forgets the work element, so its fallback tempo reaches only its own movement', () => {
    // Two works, so the single-work shortcut in `makeMovement` cannot fire: movement 1 claims
    // `w1` by `@decls`, movement 2 matches neither by `@decls` nor by `@n` and must end up
    // with no work at all. `currentWork` is assigned *conditionally*, so only `reset()`
    // standing between the two movements stops movement 1's work from serving movement 2.
    const { mpm } = convertMovements(`<?xml version="1.0" encoding="UTF-8"?>
<mei xmlns="http://www.music-encoding.org/ns/mei">
  <meiHead><fileDesc><titleStmt><title>Oracle</title></titleStmt><pubStmt/></fileDesc>
    <workList>
      <work xml:id="w1"><title>One</title><tempo>Allegro 120</tempo></work>
      <work xml:id="w2"><title>Two</title></work>
    </workList>
  </meiHead>
  <music><body>
    <mdiv n="1" decls="#w1" xml:id="mdivOne"><score>
      <scoreDef><staffGrp><staffDef n="1" lines="5"/></staffGrp></scoreDef>
      <section>${measure(1, 'm1n1', 'c')}</section>
    </score></mdiv>
    <mdiv n="9" xml:id="mdivTwo"><score>
      <scoreDef><staffGrp><staffDef n="1" lines="5"/></staffGrp></scoreDef>
      <section>${measure(1, 'm2n1', 'e')}</section>
    </score></mdiv>
  </body></music>
</mei>`);

    // the movement that claimed the work gets the fallback tempo at date 0…
    const tempi = descendants(elementAt(mpm, 0, 'the converted performances'), 'tempo');
    expect(tempi.length).toBe(1);
    expect(elementAt(tempi, 0, "movement 1's tempi").getAttributeValue('bpm')).toBe('Allegro 120');
    // …and the movement that claimed none gets no tempoMap at all
    expect(descendants(elementAt(mpm, 1, 'the converted performances'), 'tempo').length).toBe(0);
  });

  /**
   * The one field `reset()` was *missing*, and the only test in this file that failed when
   * it was written. `arpeggiosToSort` parks a live `note.order` attribute of the MPM
   * ornament it belongs to, and `makeMovement` drains the list after the walk without
   * emptying it — so movement 2's drain re-sorted movement 1's ornament against movement 2's
   * (freshly cleared) note index, found none of the ids, and wrote the empty string over it.
   */
  it('clears the parked arpeggios, so the previous movement keeps its note order', () => {
    const { mpm } = convertMovements(
      twoMovements(
        `<measure n="1"><staff n="1"><layer n="1">
           <chord xml:id="m1c1" dur="4">
             <note xml:id="m1n1" pname="c" oct="4"/>
             <note xml:id="m1n2" pname="g" oct="4"/>
             <note xml:id="m1n3" pname="e" oct="4"/>
           </chord>
         </layer></staff>
         <arpeg xml:id="m1arp" plist="#m1n1 #m1n2 #m1n3" order="up"/></measure>`,
        measure(1, 'm2n1', 'f'),
      ),
    );

    const ornaments = descendants(elementAt(mpm, 0, 'the converted performances'), 'ornament');
    expect(ornaments.length).toBe(1);
    // ascending pitch: c4 (60), e4 (64), g4 (67) — the order the chord does *not* spell
    expect(elementAt(ornaments, 0, "movement 1's ornaments").getAttributeValue('note.order')).toBe(
      '#m1n1 #m1n3 #m1n2',
    );
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

// ---------------------------------------------------------------------------
// cursor restores — control: delete `this.currentLayer = parentLayer` from processLayer
// ---------------------------------------------------------------------------
describe('Mei2MsmMpmConverter – a cursor stops applying when the walk leaves its element', () => {
  /**
   * The four other cursor restores are pinned by the byte corpus — deleting any of
   * `processStaffDef`'s or `processStaff`'s `this.currentPart = parentPart`,
   * `processMeasure`'s `this.currentMeasure = null` or `processChord`'s
   * `this.currentChord = f` reds `tests/integration/cross-validation.test.ts`. The layer
   * cursor is the exception: it survives only into `msmCleanup`'s working attributes, so
   * with `cleanup` on nothing downstream can see it, and the whole 6071-test suite passed
   * with the restore deleted.
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
   * `processStaffDef` walk its own children under the *enclosing* context — i.e. never opening
   * the part it just created — changed nothing in 1039 tests.
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
