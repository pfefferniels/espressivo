/**
 * MEI ornament signs, end to end: a hand-authored MEI through conversion, into an MPM v3
 * ornament, through the renderer, out as performed notes with real pitches and onsets.
 *
 * Most MEIs here are written by hand rather than taken from `fixtures/mei/`, and deliberately so:
 * those fixtures are Java-verified ground truth and upstream meico expands no ornament sign, so
 * there is no Java reference for anything this suite asserts. The expected numbers are computed
 * by hand from DESIGN.md's rules in the comments above each assertion (CAMPAIGN.md invariant 8),
 * never copied out of a run. The one exception is the last describe, which pins the seam decision
 * on the real `composite_advanced.mei` because that decision is *about* that fixture.
 *
 * Per-test timeouts are explicit throughout (DESIGN.md D16): expansion walks repeat groups, and a
 * defect there is far more likely to hang than to return a wrong answer.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { Mei } from '../../src/mei/Mei.js';
import { Mei2MsmMpmConverter } from '../../src/mei/Mei2MsmMpmConverter.js';
import { convertMeiToMsmMpm, performMsmToData } from '../../src/api/index.js';

const TIMEOUT = 15_000;

/**
 * A one-measure MEI in G major (`key.sig="1s"`) carrying whatever control events are passed in.
 * The staff holds a d'' quarter note and a g' quarter note, both with stable ids.
 */
function meiWith(controlEvents: string, notes?: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<mei xmlns="http://www.music-encoding.org/ns/mei" meiversion="5.0">
  <meiHead><fileDesc><titleStmt><title>ornament signs</title></titleStmt><pubStmt/></fileDesc></meiHead>
  <music><body><mdiv><score>
    <scoreDef>
      <staffGrp>
        <staffDef n="1" lines="5" clef.shape="G" clef.line="2" key.sig="1s" meter.count="4" meter.unit="4"/>
      </staffGrp>
    </scoreDef>
    <section><measure n="1">
      <staff n="1"><layer n="1">
        ${notes ?? '<note xml:id="p1" pname="d" oct="5" dur="4"/><note xml:id="p2" pname="g" oct="4" dur="4"/>'}
      </layer></staff>
      ${controlEvents}
    </measure></section>
  </score></mdiv></body></music>
</mei>`;
}

const TRILL_MEI = meiWith('<trill xml:id="t1" staff="1" startid="#p1"/>');

afterEach(() => {
  vi.restoreAllMocks();
});

describe('MEI ornament signs → MPM', () => {
  it(
    'authors a v3 trill ornament with a diatonic note pool',
    () => {
      // <ornament date="0" name.ref="trill" noteid="#p1" scale="0"
      //           note.order="|: #t1_n0 #t1_n1 :|" xml:id="t1">
      //   <note xml:id="t1_n0" interval.diatonic="0"/>
      //   <note xml:id="t1_n1" interval.diatonic="1"/>
      // </ornament>
      const mpm = convertMeiToMsmMpm(TRILL_MEI)[0].mpm;

      expect(mpm).toContain('note.order="|: #t1_n0 #t1_n1 :|"');
      expect(mpm).toContain('noteid="#p1"');
      expect(mpm).toContain('interval.diatonic="0"');
      expect(mpm).toContain('interval.diatonic="1"');
      // No halftone distance anywhere: the steps stay context-sensitive into the MPM, which is
      // the wave's central divergence from the reference implementation.
      expect(mpm).not.toContain('interval.chromatic');
      expect(mpm).not.toContain('intm');
      // repetitions is left at the schema default, so it is not written at all (DESIGN.md D12).
      expect(mpm).not.toContain('repetitions');
      // The def lands in the same global "MEI export" style the rest of the MEI conversion uses.
      expect(mpm).toContain('<styleDef name="MEI export">');
      expect(mpm).toContain('frame.offset="0ticks" frameLength="80%"');
    },
    TIMEOUT,
  );

  it(
    'renders the trill as real notes at the right pitches for the key',
    () => {
      // THE D8 VECTOR. Key signature 1♯ → G major, whose pitch classes sorted from C are
      // {0,2,4,6,7,9,11} = C D E F♯ G A B. The principal d'' is midi 74, pitch class 2, which is
      // degree index 1 of that scale.
      //   step  0 → the principal itself                    → 74
      //   step +1 → degree index 2 → pitch class 4 (e)      → 76
      //
      // THE SEQUENCE. dict trill = "|: 0 1 :|" and repetitions is 0, so the repeat group plays
      // once → [0, 1]. D9's landing rule then appends one principal-pitch copy, because the group
      // starts on a principal-pitch note → [0, 1, 0], three slots.
      //
      // THE FRAME. The def is the default row: frame.offset 0 ticks, frameLength 80%, intensity
      // 0.9, noteoff.shift monophonic, alignment "at start". The principal is a quarter at
      // ppq 720 → 720 ticks, so 80% is 576 and the frame is [0, 576] (DESIGN.md D4: % resolves
      // against the TICK duration, in the symbolic phase).
      //
      // THE SPACING. D10's power-function engine over n = 3 slots, last slot pinned at the frame
      // end: onset(i) = (i/(n−1))^intensity × length
      //   i=0 → 0^0.9              × 576 = 0
      //   i=1 → 0.5^0.9            × 576 = e^(0.9·ln 0.5) × 576 = 0.53588673… × 576 = 308.67075…
      //   i=2 → 1^0.9              × 576 = 576
      //
      // THE NOTE-OFFS. monophonic: each note ends where the next begins, and the last ends at the
      // principal's note-off, 720 (figure 1's tie) → durations 308.67075…, 267.32924…, 144.
      const notes = performMsmToData(convertMeiToMsmMpm(TRILL_MEI)[0]).parts.flatMap(
        (p) => p.notes,
      );
      const ornamented = notes.filter((n) => n.ornamented);

      expect(ornamented.map((n) => n.pitch)).toEqual([74, 76, 74]);

      expect(ornamented[0].date).toBe(0);
      expect(ornamented[1].date).toBeCloseTo(308.6707572104524, 9);
      expect(ornamented[2].date).toBe(576);

      expect(ornamented[0].duration).toBeCloseTo(308.6707572104524, 9);
      expect(ornamented[1].duration).toBeCloseTo(267.3292427895476, 9);
      expect(ornamented[2].duration).toBe(144);
      // The last ornament note ends exactly at the principal's note-off.
      expect(ornamented[2].date + ornamented[2].duration).toBe(720);

      // Provenance: every generated note points back at the ornament and at the pool note it came
      // from, and the principal keeps its own id on the first slot (DESIGN.md D10).
      expect(ornamented.map((n) => n.ornamentRef)).toEqual(['t1', 't1', 't1']);
      expect(ornamented.map((n) => n.ornamentSource)).toEqual(['t1_n0', 't1_n1', 't1_n0']);
      expect(ornamented.map((n) => n.ornamentSlot)).toEqual([0, 1, 2]);
      expect(ornamented[0].id).toBe('p1');

      // The untouched second note of the bar still sounds where it did.
      const plain = notes.filter((n) => !n.ornamented);
      expect(plain.map((n) => [n.id, n.pitch, n.date])).toEqual([['p2', 67, 720]]);
    },
    TIMEOUT,
  );

  it(
    'expands each dictionary shape into the note.order the dict prescribes',
    () => {
      // Pool ids run in order of a step's first appearance, so the same MEI @xml:id yields
      // predictable names; the sequences are the dict's, with repeated steps pooled once.
      const orderOf = (controlEvent: string) =>
        /note\.order="([^"]*)"/.exec(convertMeiToMsmMpm(meiWith(controlEvent))[0].mpm)![1];

      // upper turn = 1 0 -1 0
      expect(orderOf('<turn xml:id="t1" form="upper" staff="1" startid="#p1"/>')).toBe(
        '#t1_n0 #t1_n1 #t1_n2 #t1_n1',
      );
      // upper mordent = 0 1 0
      expect(orderOf('<mordent xml:id="t1" form="upper" staff="1" startid="#p1"/>')).toBe(
        '#t1_n0 #t1_n1 #t1_n0',
      );
      // lower mordent = 0 -1 0
      expect(orderOf('<mordent xml:id="t1" form="lower" staff="1" startid="#p1"/>')).toBe(
        '#t1_n0 #t1_n1 #t1_n0',
      );
    },
    TIMEOUT,
  );

  it(
    'anchors a delayed turn at the end of its principal',
    () => {
      // @delayed picks the "upper turn delayed" def, whose row is alignment "at end" over a 50%
      // frame — so the ornament sits in [720−360, 720] = [360, 720] rather than at the beat.
      const mpm = convertMeiToMsmMpm(
        meiWith('<turn xml:id="t1" form="upper" delayed="true" staff="1" startid="#p1"/>'),
      )[0].mpm;

      expect(mpm).toContain('name="upper turn delayed"');
      expect(mpm).toContain('alignment="at end"');
      expect(mpm).toContain('frameLength="50%"');
    },
    TIMEOUT,
  );

  it(
    'gives each staff of a multi-staff sign its own ornament with unique pool ids',
    () => {
      // processArpeg clones one OrnamentData per staff and only re-ids the ornament itself. A v3
      // ornament also owns pool <note> children, so cloning would repeat their xml:ids in the same
      // document; this path builds per part from a per-part id stem instead. Staff 1 keeps the
      // readable stem, later staves get processArpeg's `_meico_<uuid>` suffix.
      const mpm = convertMeiToMsmMpm(`<?xml version="1.0" encoding="UTF-8"?>
<mei xmlns="http://www.music-encoding.org/ns/mei" meiversion="5.0">
  <meiHead><fileDesc><titleStmt><title>two staves</title></titleStmt><pubStmt/></fileDesc></meiHead>
  <music><body><mdiv><score>
    <scoreDef><staffGrp>
      <staffDef n="1" lines="5" clef.shape="G" clef.line="2" key.sig="1s" meter.count="4" meter.unit="4"/>
      <staffDef n="2" lines="5" clef.shape="F" clef.line="4" key.sig="1s" meter.count="4" meter.unit="4"/>
    </staffGrp></scoreDef>
    <section><measure n="1">
      <staff n="1"><layer n="1"><note xml:id="p1" pname="d" oct="5" dur="4"/></layer></staff>
      <staff n="2"><layer n="1"><note xml:id="p3" pname="g" oct="3" dur="4"/></layer></staff>
      <trill xml:id="t1" staff="1 2" startid="#p1"/>
    </measure></section>
  </score></mdiv></body></music>
</mei>`)[0].mpm;

      // One ornament per named staff.
      expect(mpm.match(/<ornament /g)).toHaveLength(2);
      // Staff 1 keeps the MEI's own id and the readable pool names.
      expect(mpm).toContain('note.order="|: #t1_n0 #t1_n1 :|"');
      // Every generated xml:id in the document is distinct — the property cloning would break.
      const ids = [...mpm.matchAll(/xml:id="([^"]*)"/g)].map((m) => m[1]);
      expect(new Set(ids).size).toBe(ids.length);
      // and the second staff's pool really was renamed rather than repeated
      expect(mpm.match(/xml:id="t1_n0"/g)).toHaveLength(1);
    },
    TIMEOUT,
  );

  it(
    'skips a sign the dictionary cannot resolve, without failing the conversion',
    () => {
      // A bare <mordent/> has no @form and so no dictionary key. The reference dereferences null
      // here (blueprint §7.5); RULE E1 says log and carry on.
      const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const movements = convertMeiToMsmMpm(
        meiWith('<mordent xml:id="t1" staff="1" startid="#p1"/>'),
      );

      expect(movements).toHaveLength(1);
      expect(movements[0].mpm).not.toContain('ornamentationMap');
      expect(log.mock.calls.some((c) => String(c[0]).includes('dictionary'))).toBe(true);

      // The score itself is unaffected — both notes still sound, unornamented.
      const notes = performMsmToData(movements[0]).parts.flatMap((p) => p.notes);
      expect(notes.map((n) => n.pitch)).toEqual([74, 67]);
      expect(notes.some((n) => n.ornamented)).toBe(false);
    },
    TIMEOUT,
  );
});

describe('ConvertOptions.expandOrnaments', () => {
  it(
    'suppresses the ornament entirely when false',
    () => {
      const off = convertMeiToMsmMpm(TRILL_MEI, { expandOrnaments: false })[0];

      expect(off.mpm).not.toContain('ornamentationMap');
      expect(off.mpm).not.toContain('ornamentationStyles');

      // Nothing is generated, and the principal comes through as the plain quarter it was.
      const notes = performMsmToData(off).parts.flatMap((p) => p.notes);
      expect(notes.map((n) => [n.id, n.pitch, n.date, n.duration])).toEqual([
        ['p1', 74, 0, 720],
        ['p2', 67, 720, 720],
      ]);
      expect(notes.some((n) => n.ornamented)).toBe(false);
    },
    TIMEOUT,
  );

  it(
    'defaults to on at the facade and off in the bare converter',
    () => {
      // The two defaults differ on purpose — see Mei2MsmMpmConverter.expandOrnaments. This pins
      // the facade half; tests/api/facade-equivalence.test.ts pins that the two agree once the
      // setting is stated on both sides.
      expect(convertMeiToMsmMpm(TRILL_MEI)[0].mpm).toContain('ornamentationMap');
      expect(convertMeiToMsmMpm(TRILL_MEI, { expandOrnaments: true })[0].mpm).toContain(
        'ornamentationMap',
      );
    },
    TIMEOUT,
  );

  it(
    'rejects a non-boolean',
    () => {
      expect(() =>
        convertMeiToMsmMpm(TRILL_MEI, { expandOrnaments: 0 as unknown as boolean }),
      ).toThrow(/expandOrnaments must be a boolean/);
    },
    TIMEOUT,
  );
});

describe('<arpeg> is not governed by any of this (DESIGN.md D6)', () => {
  // No fixture MEI contains an <arpeg>, so the arpeggio path has no coverage in the Java
  // equivalence suites and this is where it is gated instead.
  const ARPEG_MEI = meiWith(
    '<arpeg xml:id="ar1" staff="1" startid="#c1" order="up"/>',
    `<chord xml:id="c1" dur="1">
       <note xml:id="a1" pname="c" oct="4"/>
       <note xml:id="a2" pname="e" oct="4"/>
       <note xml:id="a3" pname="g" oct="4"/>
     </chord>`,
  );

  it(
    'converts identically whether ornament expansion is on or off',
    () => {
      // The strongest available form of "untouched": the whole MPM and MSM, byte for byte, across
      // the flag that gates every line this wave added. Generated `meico_<uuid>` ids are renumbered
      // first — two conversions of one source draw different uuids by design, which is the same
      // quotient tests/api/facade-equivalence.test.ts takes — and nothing else is normalised.
      const canonicalise = (xml: string) => {
        const seen = new Map<string, string>();
        return xml.replace(/meico_[0-9a-f-]{36}/g, (id) => {
          if (!seen.has(id)) seen.set(id, `UUID${seen.size}`);
          return seen.get(id)!;
        });
      };
      const on = convertMeiToMsmMpm(ARPEG_MEI)[0];
      const off = convertMeiToMsmMpm(ARPEG_MEI, { expandOrnaments: false })[0];

      expect(canonicalise(on.mpm)).toBe(canonicalise(off.mpm));
      expect(canonicalise(on.msm)).toBe(canonicalise(off.msm));
      // Not vacuous: the arpeggio really is in there, in both.
      expect(on.mpm).toContain('name.ref="arpeggio"');
      expect(off.mpm).toContain('name.ref="arpeggio"');
    },
    TIMEOUT,
  );

  it(
    'still authors the v2 arpeggio, in v2 serialization',
    () => {
      const mpm = convertMeiToMsmMpm(ARPEG_MEI)[0].mpm;

      // v2 through and through: the keyword note.order, no note pool, no noteid, and a
      // temporalSpread that still spells frame.start with no unit suffix — none of the v3
      // canonical form this wave writes for ornament signs (DESIGN.md D12).
      expect(mpm).toContain('name.ref="arpeggio"');
      expect(mpm).toContain('note.order="ascending pitch"');
      expect(mpm).toContain('frame.start="-22" frameLength="44"');
      expect(mpm).not.toContain('frame.offset');
      expect(mpm).not.toContain('interval.diatonic');
      expect(mpm).not.toContain('noteid');
    },
    TIMEOUT,
  );

  it(
    'keeps its v2 rendering when a sign is expanded in the same movement',
    () => {
      // An arpeggio and a trill in one document: the arpeggio's MPM must be exactly what it is
      // without the trill, so the two ornaments cannot interfere through the shared style.
      const both = convertMeiToMsmMpm(
        meiWith(
          '<arpeg xml:id="ar1" staff="1" startid="#c1" order="up"/><trill xml:id="t1" staff="1" startid="#p1"/>',
          `<chord xml:id="c1" dur="4">
             <note xml:id="a1" pname="c" oct="4"/>
             <note xml:id="a2" pname="e" oct="4"/>
           </chord>
           <note xml:id="p1" pname="d" oct="5" dur="4"/>`,
        ),
      )[0].mpm;

      expect(both).toContain('name.ref="arpeggio"');
      expect(both).toContain('frame.start="-22" frameLength="44"');
      expect(both).toContain('name.ref="trill"');
      expect(both).toContain('frame.offset="0ticks" frameLength="80%"');
      // Both defs live side by side in the one "MEI export" style, each in its own generation:
      // exactly one styleDef, holding exactly two ornamentDefs.
      expect(both.match(/<styleDef[^>]*name="MEI export"/g)).toHaveLength(1);
      expect(both.match(/<ornamentDef/g)).toHaveLength(2);
    },
    TIMEOUT,
  );
});

/**
 * The seam decision, pinned.
 *
 * MEI ornament expansion is deliberately NOT symmetric between the two entry points, and this is
 * the test that says so out loud. `Mei2MsmMpmConverter` defaults `expandOrnaments` to false; the
 * facade defaults it to true. That mirrors Java, where expansion is a document pre-pass in
 * `Mei.exportMsmMpm` and the bare converter never expands — and it is what keeps
 * `tests/integration/`'s four auto-discovering equivalence suites, all of which drive the
 * converter directly, byte-comparable against Java references that contain no expansion.
 *
 * `composite_advanced.mei` is the only fixture MEI carrying an ornament sign
 * (`<trill xml:id="tr1" staff="1" startid="#n20"/>`, line 105), and its Java reference
 * `fixtures/reference/composite_advanced.mpm` has no `ornamentationMap` at all. So this fixture is
 * exactly where a well-meaning future change — moving the hook down into the converter, or
 * flipping the converter's default — would break Java parity. This test fails loudly if anyone
 * does, and names the reason in its own text.
 */
describe('expansion is asymmetric between the converter and the facade, on purpose', () => {
  const FIXTURE = 'composite_advanced';
  const MEI_DIR = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'mei');
  const meiText = () => readFileSync(join(MEI_DIR, `${FIXTURE}.mei`), 'utf-8');

  /** Generated ids differ per run by design; the same quotient the sibling suites take. */
  const canonicalise = (xml: string) => {
    const seen = new Map<string, string>();
    return xml.replace(/meico_[0-9a-f-]{36}/g, (id) => {
      if (!seen.has(id)) seen.set(id, `UUID${seen.size}`);
      return seen.get(id)!;
    });
  };

  /** The classic path the equivalence suites use: converter built directly, defaults taken. */
  const viaConverter = () => {
    const mei = Mei.fromXml(meiText());
    mei.setFile(`${FIXTURE}.mei`);
    return new Mei2MsmMpmConverter(720, true, false, true)
      .convert(mei)
      .getValue()[0]
      .getRootElement()!
      .toXML();
  };

  it(
    'the direct converter leaves the trill alone, as the Java reference does',
    () => {
      // This is the assertion the four equivalence suites depend on. The fixture's trill must not
      // reach the MPM by this route, because the Java MPM it is compared against has no ornament.
      const mpm = viaConverter();

      expect(mpm).not.toContain('ornamentationMap');
      expect(mpm).not.toContain('ornamentationStyles');
      // And the Java reference really is empty of it — the premise, restated from the file itself
      // rather than trusted.
      const javaMpm = readFileSync(
        join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'reference', `${FIXTURE}.mpm`),
        'utf-8',
      );
      expect(javaMpm).not.toContain('ornamentationMap');
    },
    TIMEOUT,
  );

  it(
    'the facade expands the same fixture by default',
    () => {
      const mpm = convertMeiToMsmMpm(meiText(), { sourceName: `${FIXTURE}.mei` })[0].mpm;

      // The ornament, on the part that owns staff 1, pointing at the note the MEI named.
      expect(mpm).toContain('ornamentationMap');
      // …and *only* there. `@staff="1"` names one staff, and the expander's per-staff loop is
      // the only thing keeping a single-staff sign off the global map, where it would reach
      // across into the Bassoon. The multi-staff case above is what caught that in W8; the
      // single-staff shape is the commoner one and had nothing pinning it (W8 verifier
      // advisory 3). Slicing at the `<part` boundaries is what makes "in the Oboe" an assertion
      // rather than a substring that happens to appear somewhere in the document.
      const [beforeParts, oboe, bassoon] = mpm.split(/(?=<part )/);
      expect(oboe).toContain('name="Oboe"');
      expect(oboe).toContain('number="1"');
      expect(bassoon).toContain('name="Bassoon"');
      expect(oboe).toContain('ornamentationMap');
      expect(bassoon).not.toContain('ornamentationMap');
      expect(beforeParts).not.toContain('ornamentationMap'); // i.e. not on <global>
      expect(mpm).toContain('name.ref="trill"');
      expect(mpm).toContain('noteid="#n20"');
      // The pool the dict's trill prescribes: |: 0 1 :| over two distinct steps.
      expect(mpm).toContain('note.order="|: #tr1_n0 #tr1_n1 :|"');
      expect(mpm).toContain('<note xml:id="tr1_n0" interval.diatonic="0" />');
      expect(mpm).toContain('<note xml:id="tr1_n1" interval.diatonic="1" />');
      // The def the expander generates for that name — the default row of the table.
      // No `xmlns` here: the declaration is on the <mpm> root, and the serializer now emits
      // one only where the namespace changes rather than on every namespaced element.
      expect(mpm).toContain('<ornamentDef name="trill">');
      expect(mpm).toContain(
        'frame.offset="0ticks" frameLength="80%" intensity="0.9" noteoff.shift="monophonic"',
      );
    },
    TIMEOUT,
  );

  it(
    'the facade with expandOrnaments:false reproduces the direct converter exactly',
    () => {
      // The two defaults differ, but the two paths do not: state the setting and they agree byte
      // for byte. This is what makes the asymmetry a *default* rather than a behavioural fork.
      const facadeOff = convertMeiToMsmMpm(meiText(), {
        sourceName: `${FIXTURE}.mei`,
        expandOrnaments: false,
      })[0].mpm;

      expect(canonicalise(facadeOff)).toBe(canonicalise(viaConverter()));
      // Not vacuous: with the flag left at its facade default the two genuinely diverge.
      expect(
        canonicalise(convertMeiToMsmMpm(meiText(), { sourceName: `${FIXTURE}.mei` })[0].mpm),
      ).not.toBe(canonicalise(viaConverter()));
    },
    TIMEOUT,
  );
});
