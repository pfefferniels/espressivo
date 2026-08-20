/**
 * MEI ornament signs → MPM v3 ornaments, at the unit level: name derivation, the def table, and
 * the ornament data each dictionary shape produces.
 *
 * The expected `<ornament>` markup is written out by hand in a comment above each case and the
 * assertions restate it field by field, so a change in what we author has to be re-argued rather
 * than re-recorded. End-to-end behaviour — a real MEI through the converter and into a
 * performance — is `tests/integration/mei-ornament-expansion.test.ts`.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { okValue } from '../support/result.js';
import { Builder } from '../../src/xml/XomTypes.js';
import type { Element } from '../../src/xml/XomTypes.js';
import {
  buildOrnamentData,
  createMeiOrnamentDef,
  ornamentDefName,
  ornamentShapeName,
  principalIdOf,
  resolveOrnamentSign,
} from '../../src/mei/MeiOrnamentExpander.js';
import { lookupOrnamentShape } from '../../src/mei/ornamentsDict.js';
import { OrnamentDef } from '../../src/mpm/elements/styles/defs/OrnamentDef.js';
import { FrameDomain, NoteOffShift } from '../../src/mpm/elements/styles/defs/TemporalSpread.js';

const MEI_NS = 'http://www.music-encoding.org/ns/mei';

/** One control-event element, e.g. `sign('trill', 'startid="#n1"')`. */
function sign(markup: string): Element {
  return new Builder().build(`<${markup} xmlns="${MEI_NS}"/>`).getRootElement()!;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ornamentShapeName / ornamentDefName', () => {
  it('joins @form and the element name, as the dictionary spells it', () => {
    expect(ornamentShapeName(sign('mordent form="upper"'))).toBe('upper mordent');
    expect(ornamentShapeName(sign('turn form="lower"'))).toBe('lower turn');
    expect(ornamentShapeName(sign('trill'))).toBe('trill');
  });

  it('treats @form="unknown" and an empty @form as no form at all', () => {
    // MEI uses "unknown" to say the source is ambiguous, not to name a shape.
    expect(ornamentShapeName(sign('mordent form="unknown"'))).toBe('mordent');
    expect(ornamentShapeName(sign('mordent form=""'))).toBe('mordent');
  });

  it('appends " delayed" to the def name only, and only for @delayed="true"', () => {
    const delayed = sign('turn form="upper" delayed="true"');
    expect(ornamentDefName(delayed)).toBe('upper turn delayed');
    // The dictionary lookup must still use the undelayed name — a delayed turn plays the same
    // four notes, just later in the beat.
    expect(ornamentShapeName(delayed)).toBe('upper turn');

    expect(ornamentDefName(sign('turn form="upper" delayed="false"'))).toBe('upper turn');
    expect(ornamentDefName(sign('turn form="upper"'))).toBe('upper turn');
    // Narrower than the reference, which treats every value other than null/"false" as delayed
    // and so would read "0" as delayed.
    expect(ornamentDefName(sign('turn form="upper" delayed="0"'))).toBe('upper turn');
  });
});

describe('principalIdOf', () => {
  it('reads @startid with or without its #', () => {
    expect(principalIdOf(sign('trill startid="#n20"'))).toBe('n20');
    expect(principalIdOf(sign('trill startid="n20"'))).toBe('n20');
    expect(principalIdOf(sign('trill startid="  #n20  "'))).toBe('n20');
  });

  it('is null when there is no usable startid', () => {
    expect(principalIdOf(sign('trill'))).toBeNull();
    expect(principalIdOf(sign('trill startid=""'))).toBeNull();
    expect(principalIdOf(sign('trill startid="#"'))).toBeNull();
  });
});

describe('resolveOrnamentSign', () => {
  it('resolves a sign to its shape, def name and principal', () => {
    const resolved = resolveOrnamentSign(sign('mordent form="lower" startid="#n7"'))!;
    expect(resolved.defName).toBe('lower mordent');
    expect(resolved.principalId).toBe('n7');
    expect(resolved.shape.sequence).toEqual([0, -1, 0]);
  });

  it('logs and skips a sign with no startid', () => {
    // RULE E1 / DESIGN.md D16: never throw, never guess. A @tstamp dates an event but names no
    // note, and every dictionary step is relative to a principal.
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(resolveOrnamentSign(sign('trill tstamp="1"'))).toBeNull();
    expect(log).toHaveBeenCalledOnce();
    expect(log.mock.calls[0][0]).toContain('startid');
  });

  it('logs and skips a sign the dictionary does not know', () => {
    // A bare <mordent/> is the common case, and the one the reference dereferences null on
    // (blueprint §7.5, second defect).
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(resolveOrnamentSign(sign('mordent startid="#n1"'))).toBeNull();
    expect(log).toHaveBeenCalledOnce();
    expect(log.mock.calls[0][0]).toContain('mordent');
  });
});

describe('buildOrnamentData', () => {
  const build = (shapeName: string, defName = shapeName) =>
    buildOrnamentData(lookupOrnamentShape(shapeName)!, defName, 'n20', 8640, 'tr1');

  it('builds a trill', () => {
    // dict: trill = |: 0 1 :|   →
    // <ornament date="8640" name.ref="trill" noteid="#n20" scale="0"
    //           note.order="|: #tr1_n0 #tr1_n1 :|" xml:id="tr1">
    //   <note xml:id="tr1_n0" interval.diatonic="0"/>
    //   <note xml:id="tr1_n1" interval.diatonic="1"/>
    // </ornament>
    const od = build('trill');

    expect(od.date).toBe(8640);
    expect(od.ornamentDefName).toBe('trill');
    expect(od.xmlId).toBe('tr1');
    // With the '#', which the spec's schematron asserts and the reference omits.
    expect(od.noteid).toBe('#n20');
    expect(od.scale).toBe(0.0);
    // Left at the schema default: the reference's "-1" fill sentinel is unrenderable against the
    // percent frame this def carries, so emitting it would silence every trill.
    expect(od.repetitions).toBe(0);
    expect(od.noteOrderText).toBe('|: #tr1_n0 #tr1_n1 :|');
    expect(od.notes.map((n) => [n.id, n.pitchSpec])).toEqual([
      ['tr1_n0', { kind: 'diatonic', value: 0 }],
      ['tr1_n1', { kind: 'diatonic', value: 1 }],
    ]);
  });

  it('builds an upper turn, pooling the repeated step once', () => {
    // dict: upper turn = 1 0 -1 0 — four played notes over three distinct pitches, so the pool
    // holds three notes and note.order names tr1_n1 twice.
    // <ornament … note.order="#tr1_n0 #tr1_n1 #tr1_n2 #tr1_n1">
    //   <note xml:id="tr1_n0" interval.diatonic="1"/>
    //   <note xml:id="tr1_n1" interval.diatonic="0"/>
    //   <note xml:id="tr1_n2" interval.diatonic="-1"/>
    const od = build('upper turn');

    expect(od.noteOrderText).toBe('#tr1_n0 #tr1_n1 #tr1_n2 #tr1_n1');
    expect(od.notes.map((n) => [n.id, n.pitchSpec.value])).toEqual([
      ['tr1_n0', 1],
      ['tr1_n1', 0],
      ['tr1_n2', -1],
    ]);
  });

  it('builds a lower turn', () => {
    // dict: lower turn = -1 0 1 0
    const od = build('lower turn');
    expect(od.noteOrderText).toBe('#tr1_n0 #tr1_n1 #tr1_n2 #tr1_n1');
    expect(od.notes.map((n) => n.pitchSpec.value)).toEqual([-1, 0, 1]);
  });

  it('builds an upper mordent', () => {
    // dict: upper mordent = 0 1 0
    const od = build('upper mordent');
    expect(od.noteOrderText).toBe('#tr1_n0 #tr1_n1 #tr1_n0');
    expect(od.notes.map((n) => n.pitchSpec.value)).toEqual([0, 1]);
  });

  it('builds a lower mordent', () => {
    // dict: lower mordent = 0 -1 0
    const od = build('lower mordent');
    expect(od.noteOrderText).toBe('#tr1_n0 #tr1_n1 #tr1_n0');
    expect(od.notes.map((n) => n.pitchSpec.value)).toEqual([0, -1]);
  });

  it('builds a trill with mordent, keeping the repeat group around the trill only', () => {
    // dict: trill with mordent = |: 0 1 :| 0 -1 0
    const od = build('trill with mordent');
    expect(od.noteOrderText).toBe('|: #tr1_n0 #tr1_n1 :| #tr1_n0 #tr1_n2 #tr1_n0');
    expect(od.notes.map((n) => n.pitchSpec.value)).toEqual([0, 1, -1]);
  });

  it('builds a double cadence with its prefix outside the repeat group', () => {
    // dict: double cadence lower prefix = -1 0 |: 1 0 :|
    const od = build('double cadence lower prefix');
    expect(od.noteOrderText).toBe('#tr1_n0 #tr1_n1 |: #tr1_n2 #tr1_n1 :|');
    expect(od.notes.map((n) => n.pitchSpec.value)).toEqual([-1, 0, 1]);
  });

  it('names every pool note after the id stem it is given', () => {
    // Derived, not random: note.order has to reference these, and a stable name keeps the link
    // readable and the conversion reproducible.
    const od = buildOrnamentData(lookupOrnamentShape('trill')!, 'trill', 'n1', 0, 'meico_abc');
    expect(od.notes.map((n) => n.id)).toEqual(['meico_abc_n0', 'meico_abc_n1']);
    expect(od.noteOrderText).toBe('|: #meico_abc_n0 #meico_abc_n1 :|');
    expect(od.xmlId).toBe('meico_abc');
  });

  it('keeps every pitch spec diatonic', () => {
    // The core divergence from the reference, which resolves steps to halftones in the MEI and
    // writes interval.chromatic. Ours stay context-sensitive so the MPM survives transposition,
    // and DESIGN.md D8 resolves them against the key signature at render time.
    for (const shape of ['trill', 'upper turn', 'lower mordent', 'double cadence lower prefix'])
      for (const note of build(shape).notes) expect(note.pitchSpec.kind).toBe('diatonic');
  });
});

describe('createMeiOrnamentDef', () => {
  /** The values the blueprint records for the reference's createDefaultOrnamentDef table (§3.7). */
  const spreadOf = (name: string) => {
    const def = okValue(createMeiOrnamentDef(name));
    const ts = def.getTemporalSpread()!;
    return {
      offset: ts.getFrameOffset(),
      length: ts.getFrameLengthValue(),
      intensity: ts.intensity,
      noteOffShift: ts.noteOffShift,
      alignment: def.getAlignment(),
      gradient: [
        def.getDynamicsGradient()!.transitionFrom,
        def.getDynamicsGradient()!.transitionTo,
      ],
    };
  };

  it('gives the mordents a 180-tick frame', () => {
    // table row: mordent / upper mordent / lower mordent → gradient(1, -1), (0, 180, ticks, 0.9, monophonic)
    for (const name of ['mordent', 'upper mordent', 'lower mordent'])
      expect(spreadOf(name)).toEqual({
        offset: { value: 0.0, domain: 'ticks' },
        length: { value: 180.0, domain: 'ticks' },
        intensity: 0.9,
        noteOffShift: NoteOffShift.Monophonic,
        alignment: 'at start',
        gradient: [1.0, -1.0],
      });
  });

  it('anchors a delayed turn at the end of its principal', () => {
    // table row: turn delayed / upper turn delayed / lower turn delayed →
    //   gradient(1, -1), (0, 50, relative, 1.0, monophonic, atEnd)
    for (const name of ['turn delayed', 'upper turn delayed', 'lower turn delayed'])
      expect(spreadOf(name)).toEqual({
        offset: { value: 0.0, domain: 'ticks' },
        length: { value: 50.0, domain: 'relative' },
        intensity: 1.0,
        noteOffShift: NoteOffShift.Monophonic,
        alignment: 'at end',
        gradient: [1.0, -1.0],
      });
  });

  it('falls through to the default row for the names the reference never cased', () => {
    // The blueprint's own observation: trill, upper/lower turn and the double cadence have no
    // row of their own and take the default → gradient(-1, 1), (0, 80, relative, 0.9, monophonic).
    for (const name of ['trill', 'upper turn', 'lower turn', 'double cadence lower prefix'])
      expect(spreadOf(name)).toEqual({
        offset: { value: 0.0, domain: 'ticks' },
        length: { value: 80.0, domain: 'relative' },
        intensity: 0.9,
        noteOffShift: NoteOffShift.Monophonic,
        alignment: 'at start',
        gradient: [-1.0, 1.0],
      });
  });

  it('serializes canonical v3, gradient before spread', () => {
    // Child order is fixed by the order the transformers are set; the unit suffixes are what
    // makes this a v3 def (DESIGN.md D12), and no v2 document can produce one this way.
    expect(okValue(createMeiOrnamentDef('trill')).getXml()!.toXML()).toContain(
      // The child inherits the namespace its parent <ornamentDef> declares.
      '<dynamicsGradient transition.from="-1" transition.to="1" />',
    );
    expect(okValue(createMeiOrnamentDef('trill')).getXml()!.toXML()).toContain(
      'frame.offset="0ticks" frameLength="80%"',
    );
    expect(okValue(createMeiOrnamentDef('upper turn delayed')).getXml()!.toXML()).toContain(
      'alignment="at end"',
    );
  });

  it('leaves the frozen v2 arpeggio def alone', () => {
    // The arpeggio has no row here on purpose: it is converted by processArpeg on the v2 path
    // that DESIGN.md D6 freezes, and a row named "arpeggio" here could only ever shadow it. This
    // table therefore does NOT know the name — it answers with the default row — while the v2
    // function next door still answers with the frame the Java reference fixtures contain.
    expect(
      okValue(createMeiOrnamentDef('arpeggio')).getTemporalSpread()!.getFrameLengthValue(),
    ).toEqual({
      value: 80.0,
      domain: 'relative',
    });

    const v2 = okValue(OrnamentDef.createDefaultOrnamentDef('arpeggio')).getTemporalSpread()!;
    expect(v2.frameStart).toBe(-22.0);
    expect(v2.getFrameLength()).toBe(44.0);
    expect(v2.frameDomain).toBe(FrameDomain.Ticks);
    expect(v2.noteOffShift).toBe(NoteOffShift.False);
  });
});
