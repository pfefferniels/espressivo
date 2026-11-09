import { describe, it, expect } from 'vitest';
import { convertMeiToMsm, performMsmToData, type GraceGroup } from '../../src/index.js';
import { Mei } from '../../src/mei/Mei.js';
import { Mei2MsmConverter } from '../../src/mei/Mei2MsmConverter.js';

/**
 * The grace notes a conversion leaves out, and the record of them it now keeps.
 *
 * Two things are pinned. What is read — pitch, principal, tie, date — by vectors worked out by
 * hand from the MEI. And what is *not* changed: for every score here, the MSM with the grace
 * notes in it is the MSM with them deleted, byte for byte, generated ids aside. The second is
 * the equivalence claim's: the reference skips a `graceGrp` whole, so reading one must leave no
 * trace in the document the byte gate compares.
 */

const MEI_NS = 'http://www.music-encoding.org/ns/mei';

function score(measures: string, keySig = '', staffs = 1): string {
  const staffDefs = Array.from(
    { length: staffs },
    (_, i) => `<staffDef n="${String(i + 1)}" lines="5"${keySig}/>`,
  ).join('');
  return `<?xml version="1.0" encoding="UTF-8"?>
<mei xmlns="${MEI_NS}">
  <meiHead><fileDesc><titleStmt><title>Graces</title></titleStmt><pubStmt/></fileDesc></meiHead>
  <music><body><mdiv><score>
    <scoreDef meter.count="4" meter.unit="4"><staffGrp>${staffDefs}</staffGrp></scoreDef>
    <section>${measures}</section>
  </score></mdiv></body></music>
</mei>`;
}

const graces = (mei: string): readonly GraceGroup[] => convertMeiToMsm(mei)[0]?.graces ?? [];

/** The MSM with generated ids masked: they are fresh per run whatever the input. */
const msmOf = (mei: string): string =>
  (convertMeiToMsm(mei)[0]?.msm ?? '').replace(/meico_[0-9a-f-]{36}/g, 'meico_X');

/** The same score with every grace group and grace chord taken out. */
const withoutGraces = (mei: string): string =>
  mei
    .replace(/<graceGrp[\s\S]*?<\/graceGrp>/g, '')
    .replace(/<chord[^>]*grace="[^"]*"[^>]*>[\s\S]*?<\/chord>/g, '');

const pitches = (group: GraceGroup | undefined): number[] =>
  (group?.notes ?? []).map((note) => note.pitch);

describe('a graceGrp before a note', () => {
  const mei = score(`
    <measure n="1"><staff n="1"><layer n="1">
      <note xml:id="a" dur="4" pname="c" oct="4"/>
      <graceGrp xml:id="gg" grace="unacc">
        <beam><note xml:id="g1" dur="16" pname="b" oct="3"/><note xml:id="g2" dur="16" pname="d" oct="4"/></beam>
      </graceGrp>
      <note xml:id="b" dur="2" dots="1" pname="e" oct="4"/>
    </layer></staff></measure>`);

  it('is read as one group leading to the next note, at that note’s date', () => {
    expect(graces(mei)).toEqual([
      {
        id: 'gg',
        part: 1,
        date: 720,
        principal: 'b',
        tiedToPrincipal: false,
        kind: 'unacc',
        attach: null,
        notes: [
          { id: 'g1', pitch: 59, pitchname: 'b', accidentals: 0, octave: 2, slot: 0 },
          { id: 'g2', pitch: 62, pitchname: 'd', accidentals: 0, octave: 3, slot: 1 },
        ],
      },
    ]);
  });

  it('changes no byte of the MSM', () => {
    expect(msmOf(mei)).toBe(msmOf(withoutGraces(mei)));
    expect(msmOf(mei)).not.toContain('g1');
  });

  it('is reported through the class API as well, one list per movement', () => {
    const converter = new Mei2MsmConverter(720);
    converter.convert(Mei.fromXml(mei));
    expect(converter.getGraceGroups().map((movement) => movement.map((g) => g.id))).toEqual([
      ['gg'],
    ]);
  });
});

describe('a grace note tied into the note it leads to', () => {
  // WM 225, bar 3, the left hand: B♭ and F as sixteenth grace notes, the F tied into the dotted
  // half that follows. The principal is struck as the grace F and held.
  const mei = score(
    `
    <measure n="1">
      <staff n="1"><layer n="1">
        <note xml:id="f2" dur="4" pname="f" oct="2"/>
        <graceGrp xml:id="gg">
          <beam><note xml:id="g1" dur="16" pname="b" oct="2"/><note xml:id="g2" dur="16" pname="f" oct="3"/></beam>
        </graceGrp>
        <note xml:id="p" dots="1" dur="2" pname="f" oct="3"/>
      </layer></staff>
      <tie startid="#g2" endid="#p"/>
    </measure>`,
    ' key.sig="1f"',
  );

  it('names the tied note and says so, the key flattening the B', () => {
    const [group] = graces(mei);
    expect(group?.principal).toBe('p');
    expect(group?.tiedToPrincipal).toBe(true);
    expect(pitches(group)).toEqual([46, 53]);
  });

  it('still converts the principal on its own date, once', () => {
    expect(msmOf(mei)).toBe(msmOf(withoutGraces(mei)));
    expect(msmOf(mei)).toMatch(/xml:id="p" date="720" midi\.pitch="53"/);
  });
});

describe('the pitch is the converter’s', () => {
  it('takes an accidental earlier in the bar, as any note does', () => {
    const mei = score(`
      <measure n="1"><staff n="1"><layer n="1">
        <note xml:id="a" dur="4" pname="c" oct="5" accid="s"/>
        <graceGrp xml:id="gg"><note xml:id="g" dur="8" pname="c" oct="5"/></graceGrp>
        <note xml:id="b" dur="2" dots="1" pname="d" oct="5"/>
      </layer></staff></measure>`);
    expect(pitches(graces(mei)[0])).toEqual([73]);
  });

  it('takes its own accid child, and does not carry it on to the bar', () => {
    const mei = score(`
      <measure n="1"><staff n="1"><layer n="1">
        <graceGrp xml:id="gg"><note xml:id="g" dur="8" pname="f" oct="4"><accid accid="s"/></note></graceGrp>
        <note xml:id="a" dur="4" pname="g" oct="4"/>
        <note xml:id="b" dur="2" dots="1" pname="f" oct="4"/>
      </layer></staff></measure>`);
    expect(pitches(graces(mei)[0])).toEqual([66]);
    // The reference never sees the grace note's sharp, so the F later in the bar stays natural.
    expect(msmOf(mei)).toMatch(/xml:id="b" date="720" midi\.pitch="65"/);
    expect(msmOf(mei)).toBe(msmOf(withoutGraces(mei)));
  });
});

describe('reading a grace note writes nothing into the MSM', () => {
  // The one MSM write in pitch computation: a note that consults the key, in a part whose own
  // key signature is older than a global one, copies the global one into the part's map. Here
  // the grace note is the only note after the change that consults the key — the one after it
  // states its accidental — so a grace read with that side effect leaves an extra
  // `keySignature` in part 1, and the reference, which never reads it, does not.
  const mei = score(
    `
    <measure n="1"><staff n="1"><layer n="1"><note xml:id="a" dur="1" pname="c" oct="4"/></layer></staff></measure>
    <scoreDef key.sig="2s"/>
    <measure n="2"><staff n="1"><layer n="1">
      <graceGrp xml:id="gg"><note xml:id="g" dur="8" pname="c" oct="5"/></graceGrp>
      <note xml:id="b" dur="1" pname="d" oct="5" accid.ges="n"/>
    </layer></staff></measure>`,
    ' key.sig="1s"',
  );

  it('not even the key signature it consults', () => {
    expect(pitches(graces(mei)[0])).toEqual([73]);
    expect(msmOf(mei)).toBe(msmOf(withoutGraces(mei)));
  });
});

describe('which note a group leads to', () => {
  it('in a chord, the member nearest the last grace note, the higher of two as near', () => {
    const mei = score(`
      <measure n="1"><staff n="1"><layer n="1">
        <graceGrp xml:id="gg"><note xml:id="g" dur="8" pname="d" oct="5"/></graceGrp>
        <chord xml:id="c" dur="1">
          <note xml:id="lo" pname="c" oct="4"/><note xml:id="mid" pname="g" oct="4"/>
          <note xml:id="hi" pname="c" oct="5"/><note xml:id="top" pname="e" oct="5"/>
        </chord>
      </layer></staff></measure>`);
    // D5 = 74 is two from C5 (72) and two from E5 (76): the higher wins.
    expect(graces(mei)[0]?.principal).toBe('top');
  });

  it('in a chord, the member the group is tied into, however far', () => {
    const mei = score(`
      <measure n="1">
        <staff n="1"><layer n="1">
          <graceGrp xml:id="gg"><note xml:id="g" dur="8" pname="c" oct="4"/></graceGrp>
          <chord xml:id="c" dur="1"><note xml:id="lo" pname="c" oct="4"/><note xml:id="hi" pname="b" oct="4"/></chord>
        </layer></staff>
        <tie startid="#g" endid="#lo"/>
      </measure>`);
    const [group] = graces(mei);
    expect(group?.principal).toBe('lo');
    expect(group?.tiedToPrincipal).toBe(true);
  });

  it('across the barline, when the group ends its bar', () => {
    const mei = score(`
      <measure n="1"><staff n="1"><layer n="1">
        <note xml:id="a" dur="1" pname="c" oct="4"/>
        <graceGrp xml:id="gg"><note xml:id="g" dur="8" pname="f" oct="4"/></graceGrp>
      </layer></staff></measure>
      <measure n="2"><staff n="1"><layer n="1">
        <beam><note xml:id="b" dur="8" pname="e" oct="4"/><note xml:id="c" dur="8" pname="d" oct="4"/></beam>
        <note xml:id="d" dur="2" dots="1" pname="c" oct="4"/>
      </layer></staff></measure>`);
    const [group] = graces(mei);
    expect(group?.principal).toBe('b');
    expect(group?.date).toBe(2880);
  });

  it('the previous note under attach="pre", at that note’s date', () => {
    const mei = score(`
      <measure n="1"><staff n="1"><layer n="1">
        <note xml:id="a" dur="2" pname="c" oct="4"/>
        <graceGrp xml:id="gg" attach="pre"><note xml:id="g" dur="16" pname="d" oct="4"/></graceGrp>
        <note xml:id="b" dur="2" pname="e" oct="4"/>
      </layer></staff></measure>`);
    expect(graces(mei)[0]).toMatchObject({ principal: 'a', date: 0, attach: 'pre' });
  });

  it('none when a rest comes first; the date is where the rest begins', () => {
    const mei = score(`
      <measure n="1"><staff n="1"><layer n="1">
        <note xml:id="a" dur="2" pname="c" oct="4"/>
        <graceGrp xml:id="gg"><note xml:id="g" dur="16" pname="d" oct="4"/></graceGrp>
        <rest dur="2"/>
      </layer></staff></measure>`);
    expect(graces(mei)[0]).toMatchObject({ principal: null, tiedToPrincipal: false, date: 1440 });
  });

  it('only from its own layer and staff', () => {
    const mei = score(
      `
      <measure n="1">
        <staff n="1"><layer n="1">
          <note xml:id="a" dur="2" pname="c" oct="5"/>
          <graceGrp xml:id="gg"><note xml:id="g" dur="16" pname="d" oct="5"/></graceGrp>
        </layer><layer n="2"><note xml:id="x" dur="1" pname="c" oct="4"/></layer></staff>
        <staff n="2"><layer n="1"><note xml:id="y" dur="1" pname="c" oct="3"/></layer></staff>
      </measure>
      <measure n="2">
        <staff n="1"><layer n="1"><note xml:id="b" dur="1" pname="e" oct="5"/></layer>
        <layer n="2"><note xml:id="z" dur="1" pname="c" oct="4"/></layer></staff>
        <staff n="2"><layer n="1"><note xml:id="w" dur="1" pname="c" oct="3"/></layer></staff>
      </measure>`,
      '',
      2,
    );
    expect(graces(mei)[0]).toMatchObject({ principal: 'b', part: 1 });
  });
});

describe('grace chords', () => {
  const mei = score(`
    <measure n="1"><staff n="1"><layer n="1">
      <chord xml:id="gc1" grace="acc" dur="8"><note xml:id="a1" pname="c" oct="4"/><note xml:id="a2" pname="e" oct="4"/></chord>
      <chord xml:id="gc2" grace="acc" dur="8"><note xml:id="b1" pname="d" oct="4"/><note xml:id="b2" pname="f" oct="4"/></chord>
      <note xml:id="p" dur="1" pname="g" oct="4"/>
    </layer></staff></measure>`);

  it('outside a graceGrp, leading to one note, are one figure of two slots', () => {
    const [group, ...rest] = graces(mei);
    expect(rest).toEqual([]);
    expect(group).toMatchObject({ id: 'gc1', principal: 'p', kind: 'acc' });
    expect(group?.notes.map((note) => [note.id, note.slot])).toEqual([
      ['a1', 0],
      ['a2', 0],
      ['b1', 1],
      ['b2', 1],
    ]);
  });

  it('change no byte of the MSM either', () => {
    expect(msmOf(mei)).toBe(msmOf(withoutGraces(mei)));
  });
});

describe('what is not reported', () => {
  it('a bare note with @grace, which the MSM already has, at duration 0', () => {
    const mei = score(`
      <measure n="1"><staff n="1"><layer n="1">
        <note xml:id="g" grace="acc" dur="8" pname="d" oct="4"/>
        <note xml:id="p" dur="1" pname="c" oct="4"/>
      </layer></staff></measure>`);
    expect(graces(mei)).toEqual([]);
    expect(msmOf(mei)).toMatch(/xml:id="g" date="0" midi\.pitch="62"[^>]*duration="0"/);
  });

  it('nothing, for a score that writes no grace notes', () => {
    const mei = score(`
      <measure n="1"><staff n="1"><layer n="1"><note dur="1" pname="c" oct="4"/></layer></staff></measure>`);
    expect(graces(mei)).toEqual([]);
  });
});

describe('per movement', () => {
  it('keeps each movement’s groups to itself', () => {
    const movement = (n: string, id: string) => `
      <mdiv n="${n}"><score>
        <scoreDef meter.count="4" meter.unit="4"><staffGrp><staffDef n="1" lines="5"/></staffGrp></scoreDef>
        <section><measure n="1"><staff n="1"><layer n="1">
          <graceGrp xml:id="${id}"><note dur="8" pname="d" oct="4"/></graceGrp>
          <note xml:id="p${id}" dur="1" pname="c" oct="4"/>
        </layer></staff></measure></section>
      </score></mdiv>`;
    const mei = `<?xml version="1.0" encoding="UTF-8"?>
<mei xmlns="${MEI_NS}"><meiHead><fileDesc><titleStmt><title>Two</title></titleStmt><pubStmt/></fileDesc></meiHead>
<music><body>${movement('1', 'x')}${movement('2', 'y')}</body></music></mei>`;
    expect(convertMeiToMsm(mei).map((m) => m.graces.map((g) => [g.id, g.principal]))).toEqual([
      [['x', 'px']],
      [['y', 'py']],
    ]);
  });
});

describe('played back as MPM v3 ornaments', () => {
  // The guide's two shapes on one score, at 120 bpm: 720 ticks are 500 ms, so the principal of
  // each group stands on a beat whose time is known. The B♭–F group is tied into an F that
  // starts at tick 720 (500 ms); the C grace leads to a C at tick 1440 (1000 ms).
  const mei = score(`
    <measure n="1">
      <staff n="1"><layer n="1">
        <note xml:id="f2" dur="4" pname="f" oct="2"/>
        <graceGrp xml:id="gg1">
          <beam><note xml:id="g1" dur="16" pname="b" oct="2" accid.ges="f"/><note xml:id="g2" dur="16" pname="f" oct="3"/></beam>
        </graceGrp>
        <note xml:id="p1" dur="4" pname="f" oct="3"/>
        <graceGrp xml:id="gg2"><note xml:id="g3" dur="8" pname="c" oct="5"/></graceGrp>
        <note xml:id="p2" dur="2" pname="c" oct="5"/>
      </layer></staff>
      <tie startid="#g2" endid="#p1"/>
    </measure>`);
  const [movement] = convertMeiToMsm(mei);
  const msm = movement?.msm ?? '';

  /** One ornament per group: the principal last, a tied group's last grace note dropped. */
  const ornaments = (movement?.graces ?? [])
    .map((group) => {
      const pool = group.tiedToPrincipal
        ? group.notes.filter((note) => note.slot < Math.max(...group.notes.map((n) => n.slot)))
        : group.notes;
      const order = [...pool.map((note) => `#${note.id ?? ''}`), `#${group.principal ?? ''}`];
      const notes = pool
        .map((note) => `<note xml:id="${note.id ?? ''}" midi.pitch="${String(note.pitch)}"/>`)
        .join('');
      return `<ornament xml:id="o_${group.id ?? ''}" date="${String(group.date)}" name.ref="${group.tiedToPrincipal ? 'tied' : 'grace'}" noteid="#${group.principal ?? ''}" note.order="${order.join(' ')}" scale="0">${notes}</ornament>`;
    })
    .join('');

  // tied: B♭ 180 ms before the beat, the held F 80 ms before it; untied: C 150 ms before its C
  const mpm = `<?xml version="1.0"?>
<mpm xmlns="http://www.cemfi.de/mpm/ns/1.0"><performance name="graces" pulsesPerQuarter="720"><global>
  <header><ornamentationStyles><styleDef name="s">
    <ornamentDef name="tied"><temporalSpread frame.offset="-180ms" frameLength="100ms" noteoff.shift="monophonic"/></ornamentDef>
    <ornamentDef name="grace"><temporalSpread frame.offset="-150ms" frameLength="150ms" noteoff.shift="monophonic"/></ornamentDef>
  </styleDef></ornamentationStyles></header>
  <dated><tempoMap><tempo date="0" bpm="120" beatLength="0.25"/></tempoMap>
  <ornamentationMap><style date="0" name.ref="s"/>${ornaments}</ornamentationMap></dated>
</global></performance></mpm>`;

  const played = performMsmToData({ msm, mpm })
    .parts.flatMap((part) => part.notes)
    .map((note) => ({
      id: note.id,
      pitch: note.pitch,
      on: Math.round(note.milliseconds.date),
      off: Math.round(note.milliseconds.end),
      source: note.ornamentSource,
    }))
    .sort((a, b) => a.on - b.on || a.pitch - b.pitch);

  it('strikes a tied group’s principal once, early, as its last grace note, and holds it', () => {
    expect(played.filter((note) => note.pitch === 46 || note.pitch === 53)).toEqual([
      { id: expect.any(String) as string, pitch: 46, on: 320, off: 420, source: 'g1' },
      { id: 'p1', pitch: 53, on: 420, off: 1000, source: 'p1' },
    ]);
  });

  it('plays an untied grace before the beat and its principal on it', () => {
    expect(played.filter((note) => note.pitch === 72)).toEqual([
      { id: expect.any(String) as string, pitch: 72, on: 850, off: 1000, source: 'g3' },
      { id: 'p2', pitch: 72, on: 1000, off: 2000, source: 'p2' },
    ]);
  });
});
