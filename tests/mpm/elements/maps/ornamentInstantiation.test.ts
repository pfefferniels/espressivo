import { describe, it, expect, vi } from 'vitest';
import { OrnamentationMap } from '../../../../src/mpm/elements/maps/OrnamentationMap.js';
import { GenericMap } from '../../../../src/mpm/elements/maps/GenericMap.js';
import { OrnamentData } from '../../../../src/mpm/elements/maps/data/OrnamentData.js';
import { OrnamentNote } from '../../../../src/mpm/elements/maps/data/OrnamentNote.js';
import {
  isV3Ornament,
  readKeyFifths,
} from '../../../../src/mpm/elements/maps/ornamentInstantiation.js';
import { Element, Attribute } from '../../../../src/xml/XomTypes.js';
import { Mpm } from '../../../../src/mpm/Mpm.js';
import { Header } from '../../../../src/mpm/elements/Header.js';
import { OrnamentationStyle } from '../../../../src/mpm/elements/styles/OrnamentationStyle.js';
import { OrnamentDef } from '../../../../src/mpm/elements/styles/defs/OrnamentDef.js';
import {
  FrameDomain,
  NoteOffShift,
  TemporalSpread,
} from '../../../../src/mpm/elements/styles/defs/TemporalSpread.js';
import type { OrnamentPitchSpec } from '../../../../src/mpm/elements/maps/data/OrnamentNote.js';
import type { TemporalValue } from '../../../../src/mpm/elements/styles/defs/TemporalValue.js';

/**
 * The MPM v3 discrete-note renderer (W5), driven end to end through
 * `OrnamentationMap.renderOrnamentationToMap` — the same entry point `Performance` calls, so
 * these tests exercise the real seam (`OrnamentData.apply`) and the real insertion path
 * rather than a helper.
 *
 * **Every expected number below is computed by hand in the comment above it** (CHARTER §8),
 * from DESIGN.md §5's worked vectors and the v2 spacing formula
 * `dateOffset(i) = pow(i / (n − 1), intensity) * frameLength + frameStart`, last slot pinned
 * at `frameStart + frameLength`. None of them was read off the implementation.
 *
 * Per-test timeouts are explicit on every case that expands a repeat group: DESIGN.md D16 and
 * ARCHITECTURE.md §1216-1221 want a regression in an expansion loop to fail the suite rather
 * than hang it.
 */

const XML_NS = 'http://www.w3.org/XML/1998/namespace';
const TIMEOUT = 5000;

/** An MSM note as it looks when the pipeline reaches the symbolic ornamentation slot. */
function makeNote(id: string, date: number, pitch: number, duration = 1440, velocity = 100) {
  const note = new Element('note');
  note.addAttribute(new Attribute('xml:id', XML_NS, id));
  note.addAttribute(new Attribute('date', String(date)));
  note.addAttribute(new Attribute('midi.pitch', String(pitch)));
  note.addAttribute(new Attribute('duration', String(duration)));
  note.addAttribute(new Attribute('date.perf', String(date)));
  note.addAttribute(new Attribute('duration.perf', String(duration)));
  note.addAttribute(new Attribute('velocity', String(velocity)));
  return note;
}

function makeScore(notes: Element[]): GenericMap {
  const score = GenericMap.createGenericMap('score')!;
  for (const note of notes) score.addElement(note);
  return score;
}

interface DefOptions {
  readonly frameOffset?: TemporalValue;
  readonly frameLength?: TemporalValue;
  readonly v2FrameStart?: number;
  readonly v2FrameLength?: number;
  readonly v2Domain?: FrameDomain;
  readonly intensity?: number;
  readonly noteOffShift?: NoteOffShift;
  readonly alignment?: 'at start' | 'at end';
  readonly gradient?: readonly [number, number];
  readonly noSpread?: boolean;
}

function makeDef(name: string, options: DefOptions = {}): OrnamentDef {
  const def = OrnamentDef.createOrnamentDef(name)!;
  if (options.gradient !== undefined)
    def.setDynamicsGradientValues(options.gradient[0], options.gradient[1]);
  if (options.noSpread !== true) {
    const spread = new TemporalSpread();
    if (options.v2FrameLength !== undefined) {
      spread.frameStart = options.v2FrameStart ?? 0;
      spread.setFrameLength(options.v2FrameLength);
      spread.frameDomain = options.v2Domain ?? FrameDomain.Ticks;
    } else {
      spread.setFrameOffset(options.frameOffset ?? { value: 0, domain: 'ticks' });
      spread.setFrameLengthValue(options.frameLength ?? { value: 100, domain: 'relative' });
    }
    spread.intensity = options.intensity ?? 1.0;
    spread.noteOffShift = options.noteOffShift ?? NoteOffShift.False;
    def.setTemporalSpread(spread);
  }
  if (options.alignment !== undefined) def.setAlignment(options.alignment);
  return def;
}

function makeMap(defs: OrnamentDef[]): OrnamentationMap {
  const header = Header.createHeader()!;
  const style = OrnamentationStyle.createOrnamentationStyle('orn style')!;
  for (const def of defs) style.addDef(def);
  header.addStyleDef(Mpm.ORNAMENTATION_STYLE, style);
  const map = OrnamentationMap.createOrnamentationMap()!;
  map.setHeaders(null, header);
  map.addStyleSwitch(0, 'orn style');
  return map;
}

function chromatic(value: number): OrnamentPitchSpec {
  return { kind: 'chromatic', value };
}

/** The score's notes, in document order, as plain records — the shape assertions read from. */
function notesOf(score: GenericMap) {
  return score.getAllElementsOfType('note').map((entry) => {
    const note = entry.getValue();
    const number = (name: string) => {
      const value = note.getAttributeValue(name);
      return value === null ? null : parseFloat(value);
    };
    return {
      id: note.getAttributeValue('xml:id'),
      date: number('date'),
      pitch: number('midi.pitch'),
      duration: number('duration'),
      datePerf: number('date.perf'),
      durationPerf: number('duration.perf'),
      velocity: number('velocity'),
      generated: note.getAttributeValue('ornament.generated'),
      carved: note.getAttributeValue('ornament.carved'),
      ref: note.getAttributeValue('ornament.ref'),
      source: note.getAttributeValue('ornament.source'),
      slot: note.getAttributeValue('ornament.slot'),
      pass: note.getAttributeValue('ornament.pass'),
      anchor: note.getAttributeValue('ornament.anchor'),
      msOffset: number('ornament.milliseconds.date.offset'),
      msFromEnd: number('ornament.milliseconds.fromend.offset'),
      msDuration: number('ornament.milliseconds.duration'),
      noteoffShift: note.getAttributeValue('ornament.noteoff.shift'),
      dynamics: number('ornament.dynamics'),
    };
  });
}

describe('MPM v3 ornament instantiation', () => {
  // -------------------------------------------------------------------------------------
  // DESIGN.md §5.1 — figure-1 turn, "at start"
  // -------------------------------------------------------------------------------------
  describe('worked vector 1: figure-1 turn at start (DESIGN.md §5.1)', () => {
    /**
     * Principal P: midi.pitch 64, date 0, duration 1440 ticks.
     * Pool: n2 = +1 chromatic (65), n3 = −1 chromatic (63). note.order = "#n2 #P #n3 #P".
     * Def: frameLength="50%", alignment="at start", noteoff.shift="monophonic", intensity 1.
     *
     * Frame: 50% of the principal's 1440-tick duration = 720; offset 0, "at start" ⇒
     * start = 0, so the frame is [0, 720] measured from the principal's date 0.
     *
     * Spacing, n = 4 slots, intensity 1:
     *   i=0: pow(0/3, 1) * 720 + 0 =   0
     *   i=1: pow(1/3, 1) * 720 + 0 = 240
     *   i=2: pow(2/3, 1) * 720 + 0 = 480
     *   last (pinned):        0 + 720 = 720
     * Absolute dates = principal date 0 + those ⇒ 0, 240, 480, 720.
     *
     * monophonic ⇒ each note ends where the next begins, the last at the principal's end:
     *   durations 240 − 0 = 240; 480 − 240 = 240; 720 − 480 = 240; 1440 − 720 = 720
     *   i.e. note-offs at 240, 480, 720, 1440 — figure 1's tie into the principal.
     */
    const render = () => {
      const score = makeScore([makeNote('P', 0, 64)]);
      const map = makeMap([
        makeDef('turn', {
          frameLength: { value: 50, domain: 'relative' },
          noteOffShift: NoteOffShift.Monophonic,
        }),
      ]);
      map.addOrnament({
        date: 0,
        nameRef: 'turn',
        noteid: '#P',
        noteOrder: '#n2 #P #n3 #P',
        notes: [new OrnamentNote('n2', chromatic(1)), new OrnamentNote('n3', chromatic(-1))],
        id: 'orn1',
      });
      map.renderOrnamentationToMap(score);
      return notesOf(score);
    };

    it('places four notes at 0, 240, 480, 720', () => {
      expect(render().map((note) => note.date)).toEqual([0, 240, 480, 720]);
    });

    it('gives them monophonic durations 240, 240, 240, 720 (ends 240/480/720/1440)', () => {
      const notes = render();
      expect(notes.map((note) => note.duration)).toEqual([240, 240, 240, 720]);
      expect(notes.map((note) => note.date! + note.duration!)).toEqual([240, 480, 720, 1440]);
    });

    it('resolves the pool pitches against the principal: 65, 64, 63, 64', () => {
      expect(render().map((note) => note.pitch)).toEqual([65, 64, 63, 64]);
    });

    it('replaces the principal — four notes, none of them the original element', () => {
      const notes = render();
      expect(notes).toHaveLength(4);
      expect(notes.every((note) => note.generated === 'true')).toBe(true);
      expect(notes.every((note) => note.ref === 'orn1')).toBe(true);
    });

    it("keeps the principal's xml:id on the first principal-pitch note (D10)", () => {
      const notes = render();
      // slot 1 is "#P", the first reference the expansion resolves from the principal itself
      expect(notes[1].id).toBe('P');
      expect(notes.filter((note) => note.id === 'P')).toHaveLength(1);
      for (const note of [notes[0], notes[2], notes[3]])
        expect(note.id).toMatch(/^meico_[0-9a-f-]{36}$/);
    });

    it("clones the principal's velocity onto every generated note", () => {
      expect(render().map((note) => note.velocity)).toEqual([100, 100, 100, 100]);
    });

    it('writes no ornament.carved anywhere — "at start" leaves no leftover to carve', () => {
      expect(render().map((note) => note.carved)).toEqual([null, null, null, null]);
    });

    it('mirrors the layout into the performance attributes', () => {
      const notes = render();
      expect(notes.map((note) => note.datePerf)).toEqual([0, 240, 480, 720]);
      expect(notes.map((note) => note.durationPerf)).toEqual([240, 240, 240, 720]);
    });

    it('writes note.order.perf onto the ornament element', () => {
      const score = makeScore([makeNote('P', 0, 64)]);
      const map = makeMap([makeDef('turn', { frameLength: { value: 50, domain: 'relative' } })]);
      map.addOrnament({
        date: 0,
        nameRef: 'turn',
        noteid: '#P',
        noteOrder: '#n2 #P #n3 #P',
        notes: [new OrnamentNote('n2', chromatic(1)), new OrnamentNote('n3', chromatic(-1))],
      });
      map.renderOrnamentationToMap(score);
      const ornament = map.getElement(1)!;
      expect(ornament.getAttributeValue('note.order.perf')).toBe('n2 P n3 P');
    });
  });

  // -------------------------------------------------------------------------------------
  // DESIGN.md §5.2 — figure-2 turn, "at end"
  // -------------------------------------------------------------------------------------
  describe('worked vector 2: figure-2 turn at end (DESIGN.md §5.2)', () => {
    /**
     * Same ornament as vector 1 with alignment="at end".
     *
     * Frame: length still 50% of 1440 = 720. "at end" anchors it at the principal's end:
     *   start = principalDuration − frameLength + offset = 1440 − 720 + 0 = 720
     * so the frame is [720, 1440] from the principal's date 0.
     *
     * Spacing, n = 4, intensity 1:
     *   i=0: pow(0/3,1)*720 + 720 =  720
     *   i=1: pow(1/3,1)*720 + 720 =  960
     *   i=2: pow(2/3,1)*720 + 720 = 1200
     *   last (pinned):      720 + 720 = 1440
     * monophonic durations: 960−720=240, 1200−960=240, 1440−1200=240, and the last note runs
     * to the principal's end 1440, i.e. duration 1440 − 1440 = 0.
     *
     * Head leftover: the earliest generated note begins at 720 > the principal's date 0, so
     * the principal survives as [0, 720) — 720 ticks — with its own id.
     */
    const render = () => {
      const score = makeScore([makeNote('P', 0, 64)]);
      const map = makeMap([
        makeDef('turn', {
          frameLength: { value: 50, domain: 'relative' },
          noteOffShift: NoteOffShift.Monophonic,
          alignment: 'at end',
        }),
      ]);
      map.addOrnament({
        date: 0,
        nameRef: 'turn',
        noteid: '#P',
        noteOrder: '#n2 #P #n3 #P',
        notes: [new OrnamentNote('n2', chromatic(1)), new OrnamentNote('n3', chromatic(-1))],
        id: 'orn2',
      });
      map.renderOrnamentationToMap(score);
      return notesOf(score);
    };

    it('leaves a head leftover [0, 720) carrying the principal id', () => {
      const head = render()[0];
      expect(head.id).toBe('P');
      expect(head.date).toBe(0);
      expect(head.duration).toBe(720);
      expect(head.generated).toBeNull();
    });

    /**
     * The leftover is the one note an ornament **alters** without generating, and until the
     * conductor's "carved leftover is ornamented" ruling it carried nothing at all to say so —
     * which made D15's facade contract ("generated by *or altered by* an ornament") false on
     * exactly this path, since a predicate can only see what the document says.
     *
     * It gets two attributes and deliberately not the other four: `ornament.carved` (a separate
     * name from `generated` because the two are opposites — this note was in the score and
     * stayed) and `ornament.ref`. No `source`/`slot`/`pass`, because the leftover occupies no
     * position in the expanded sequence; no `anchor`, because the leftover *is* the anchor — it
     * keeps the principal's own `xml:id`.
     */
    it('marks the leftover as carved, naming the ornament that did it', () => {
      const head = render()[0];
      expect(head.carved).toBe('true');
      expect(head.ref).toBe('orn2');
      // it is altered, not generated, and it is not a member of the figure
      expect(head.generated).toBeNull();
      expect(head.source).toBeNull();
      expect(head.slot).toBeNull();
      expect(head.pass).toBeNull();
      // the anchor stays generated-note-only: this note needs no pointer to itself
      expect(head.anchor).toBeNull();
    });

    it('marks only the leftover — the generated notes are generated, not carved', () => {
      expect(render().map((note) => note.carved)).toEqual(['true', null, null, null, null]);
    });

    /**
     * The **D10 id-uniqueness ruling** (docs/history/ornamentation/LOG.md, 2026-08-09), pinned at the level
     * that decides it. Nothing in this suite used to constrain the heir when a leftover
     * survives, so the renderer's original reading — leftover *and* heir both carrying the id —
     * passed here and was only caught downstream, in W6's augmented document. The rule is an
     * exclusive or: the id goes to the leftover when one survives, else to the heir, never to
     * both, because two elements sharing an `xml:id` is not a valid document. Every generated
     * note carries `ornament.anchor` instead, which is what makes that safe.
     */
    it('gives the id to the leftover alone, never also to the heir', () => {
      const notes = render();
      expect(notes.filter((note) => note.id === 'P')).toHaveLength(1);
      // the heir is the second slot, `#P` — the first reference sourced from the principal —
      // and it keeps the id it drew, reaching its principal through the anchor
      const heir = notes[2];
      expect(heir.source).toBe('P');
      expect(heir.id).toMatch(/^meico_[0-9a-f-]{36}$/);
      expect(notes.slice(1).map((note) => note.anchor)).toEqual(['P', 'P', 'P', 'P']);
    });

    it('places the four ornament notes at 720, 960, 1200, 1440', () => {
      expect(render().map((note) => note.date)).toEqual([0, 720, 960, 1200, 1440]);
    });

    it('ends the sequence at the principal note-off 1440', () => {
      const notes = render().slice(1);
      expect(notes.map((note) => note.date! + note.duration!)).toEqual([960, 1200, 1440, 1440]);
    });

    it('shortens the leftover in the performance domain too', () => {
      const head = render()[0];
      expect(head.datePerf).toBe(0);
      expect(head.durationPerf).toBe(720);
    });
  });

  // -------------------------------------------------------------------------------------
  // DESIGN.md §5.3 — figure-3 trill with an offset frame and repetitions
  // -------------------------------------------------------------------------------------
  describe('worked vector 3: figure-3 trill (DESIGN.md §5.3)', () => {
    /**
     * Principal P: pitch 64, date 0, duration 1440. Pool n1 = +1 chromatic (65).
     * note.order = "|: #n1 #P :|", repetitions = 3, frameLength = "50%",
     * frame.offset = "360ticks", alignment "at start", intensity 1.
     *
     * Expansion: the group holds 2 slots and is played repetitions + 1 = 4 times ⇒ 8 slots.
     * The landing rule does not fire — the group opens on n1 (65), not on the principal's
     * pitch — and dedup collapses nothing, since the sequence alternates 65/64.
     *
     * Frame: 50% of 1440 = 720, offset 360 ⇒ start = 360, frame [360, 1080].
     * Spacing, n = 8, intensity 1: pow(i/7, 1) * 720 + 360 for i = 0..6, last pinned at 1080:
     *   i=0: 360
     *   i=1: 720/7 + 360 = 102.857142857… + 360 = 462.857142857…
     *   i=2: 1440/7 + 360 = 565.714285714…
     *   i=3: 2160/7 + 360 = 668.571428571…
     *   i=4: 2880/7 + 360 = 771.428571428…
     *   i=5: 3600/7 + 360 = 874.285714285…
     *   i=6: 4320/7 + 360 = 977.142857142…
     *   i=7: 360 + 720 = 1080
     */
    const render = () => {
      const score = makeScore([makeNote('P', 0, 64)]);
      const map = makeMap([
        makeDef('trill', {
          frameOffset: { value: 360, domain: 'ticks' },
          frameLength: { value: 50, domain: 'relative' },
        }),
      ]);
      map.addOrnament({
        date: 0,
        nameRef: 'trill',
        noteid: '#P',
        noteOrder: '|: #n1 #P :|',
        repetitions: 3,
        notes: [new OrnamentNote('n1', chromatic(1))],
        id: 'orn3',
      });
      map.renderOrnamentationToMap(score);
      return notesOf(score);
    };

    it(
      'expands the repeat group to 8 slots in the frame [360, 1080]',
      () => {
        const notes = render();
        expect(notes).toHaveLength(8);
        expect(notes[0].date).toBe(360);
        expect(notes[7].date).toBe(1080);
      },
      TIMEOUT,
    );

    it(
      'spaces them evenly by the v2 power formula',
      () => {
        const dates = render().map((note) => note.date!);
        for (let i = 0; i < 7; ++i) expect(dates[i]).toBeCloseTo((i / 7) * 720 + 360, 10);
        expect(dates[7]).toBe(1080);
      },
      TIMEOUT,
    );

    it(
      'alternates 65 and 64',
      () => {
        expect(render().map((note) => note.pitch)).toEqual([65, 64, 65, 64, 65, 64, 65, 64]);
      },
      TIMEOUT,
    );

    /**
     * The provenance family over the same eight notes (conductor's two 2026-08-09 rulings).
     * Every slot of this figure comes from inside the repeat group, so all eight carry a pass:
     * the group holds 2 slots and is played repetitions + 1 = 4 times, giving passes
     * 0 0 1 1 2 2 3 3 against slot indices 0…7 and sources alternating n1 / P.
     */
    it(
      'stamps source, slot and pass across all four passes of the trill',
      () => {
        const notes = render();
        expect(notes.map((note) => note.source)).toEqual([
          'n1',
          'P',
          'n1',
          'P',
          'n1',
          'P',
          'n1',
          'P',
        ]);
        expect(notes.map((note) => note.slot)).toEqual(['0', '1', '2', '3', '4', '5', '6', '7']);
        expect(notes.map((note) => note.pass)).toEqual(['0', '0', '1', '1', '2', '2', '3', '3']);
      },
      TIMEOUT,
    );

    it(
      'anchors all eight to the principal, and marks them generated by this ornament',
      () => {
        const notes = render();
        expect(notes.map((note) => note.anchor)).toEqual(Array(8).fill('P'));
        expect(notes.map((note) => note.ref)).toEqual(Array(8).fill('orn3'));
        expect(notes.map((note) => note.generated)).toEqual(Array(8).fill('true'));
      },
      TIMEOUT,
    );

    it(
      'ends every note at the principal note-off (noteoff.shift false)',
      () => {
        for (const note of render()) expect(note.date! + note.duration!).toBeCloseTo(1440, 10);
      },
      TIMEOUT,
    );

    it(
      'leaves no head leftover — "at start" never carves one (D10)',
      () => {
        expect(render().every((note) => note.generated === 'true')).toBe(true);
      },
      TIMEOUT,
    );
  });

  // -------------------------------------------------------------------------------------
  // DESIGN.md §5.5 — a millisecond frame writes the v2 markers
  // -------------------------------------------------------------------------------------
  describe('worked vector 5: millisecond frame writes v2 markers (DESIGN.md §5.5)', () => {
    /**
     * The Java reference fixture's `spreadMs` def, applied to a generated sequence instead of
     * to an existing chord: frame.start −30 ms, frameLength 60 ms, intensity 2,
     * noteoff.shift="true". Over three slots the v2 engine produces (research §6.3):
     *   i=0: pow(0/2, 2) * 60 − 30 = −30
     *   i=1: pow(1/2, 2) * 60 − 30 = 0.25 * 60 − 30 = −15
     *   last (pinned):        −30 + 60 = +30
     * and `ornament.noteoff.shift="true"` on every note. Those are the exact values the
     * committed `ornamentation_augmented.msm` carries for notes n7/n8/n9.
     */
    const render = () => {
      const score = makeScore([makeNote('P', 0, 64)]);
      const map = makeMap([
        makeDef('spreadMs', {
          frameOffset: { value: -30, domain: 'milliseconds' },
          frameLength: { value: 60, domain: 'milliseconds' },
          intensity: 2,
          noteOffShift: NoteOffShift.True,
        }),
      ]);
      map.addOrnament({
        date: 0,
        nameRef: 'spreadMs',
        noteid: '#P',
        noteOrder: '#n1 #P #n2',
        notes: [new OrnamentNote('n1', chromatic(-2)), new OrnamentNote('n2', chromatic(2))],
        id: 'ornMs',
      });
      map.renderOrnamentationToMap(score);
      return notesOf(score);
    };

    it('writes the v2 offsets −30, −15, +30', () => {
      expect(render().map((note) => note.msOffset)).toEqual([-30, -15, 30]);
    });

    it('writes the presence-only noteoff.shift flag on every note', () => {
      expect(render().map((note) => note.noteoffShift)).toEqual(['true', 'true', 'true']);
    });

    it('leaves every generated note on the principal’s tick date and duration', () => {
      const notes = render();
      expect(notes.map((note) => note.date)).toEqual([0, 0, 0]);
      expect(notes.map((note) => note.duration)).toEqual([1440, 1440, 1440]);
    });

    it('writes no tick-domain marker at all', () => {
      const score = makeScore([makeNote('P', 0, 64)]);
      const map = makeMap([
        makeDef('spreadMs', {
          frameOffset: { value: -30, domain: 'milliseconds' },
          frameLength: { value: 60, domain: 'milliseconds' },
          intensity: 2,
        }),
      ]);
      map.addOrnament({
        date: 0,
        nameRef: 'spreadMs',
        noteid: '#P',
        noteOrder: '#n1 #P',
        notes: [new OrnamentNote('n1', chromatic(-2))],
      });
      map.renderOrnamentationToMap(score);
      for (const entry of score.getAllElementsOfType('note'))
        expect(entry.getValue().getAttributeValue('ornament.date.offset')).toBeNull();
    });
  });

  // -------------------------------------------------------------------------------------
  // The D5 amendment: at-end millisecond frames
  // -------------------------------------------------------------------------------------
  describe('millisecond frame aligned "at end" (D5 amendment)', () => {
    /**
     * Same numbers as vector 5, alignment="at end". The marker is end-anchored:
     *   value = spacing + frame.offset − frameLength
     * with the spacing measured from 0, so with intensity 2 over three slots:
     *   i=0: pow(0/2,2)*60 = 0   ⇒ 0 + (−30) − 60 = −90
     *   i=1: pow(1/2,2)*60 = 15  ⇒ 15 + (−30) − 60 = −75
     *   last:            60      ⇒ 60 + (−30) − 60 = −30
     */
    const render = (shift = NoteOffShift.False) => {
      const score = makeScore([makeNote('P', 0, 64)]);
      const map = makeMap([
        makeDef('spreadMsEnd', {
          frameOffset: { value: -30, domain: 'milliseconds' },
          frameLength: { value: 60, domain: 'milliseconds' },
          intensity: 2,
          noteOffShift: shift,
          alignment: 'at end',
        }),
      ]);
      map.addOrnament({
        date: 0,
        nameRef: 'spreadMsEnd',
        noteid: '#P',
        noteOrder: '#n1 #P #n2',
        notes: [new OrnamentNote('n1', chromatic(-2)), new OrnamentNote('n2', chromatic(2))],
        id: 'ornMsEnd',
      });
      map.renderOrnamentationToMap(score);
      return notesOf(score);
    };

    it('writes ornament.milliseconds.fromend.offset −90, −75, −30', () => {
      expect(render().map((note) => note.msFromEnd)).toEqual([-90, -75, -30]);
    });

    it('writes no ornament.carved — this frame carves nothing, it consumes the note', () => {
      // The other "at end" reading. A millisecond frame cannot shorten its principal (its anchor
      // does not exist until the tempo pass), so the principal is removed whole and there is no
      // leftover to mark — which is exactly what the warning above is about.
      expect(render().map((note) => note.carved)).toEqual([null, null, null]);
    });

    it('says out loud that the principal’s head is dropped', () => {
      // The one case where carving throws away music the author wrote: the frame is anchored
      // at a millisecond end that does not exist yet, so the principal cannot be shortened and
      // is removed whole. Everything before the first onset is silently gone unless this fires.
      //
      // The span named is the FIRST ONSET the spread produces, measured back from the note's
      // end — here the i=0 marker, −90, so 90 ms. For this vector that coincides with
      // frameLength − frame.offset = 60 − (−30) = 90, which is what the line used to compute;
      // the intensity-0 case below is where the two part company (W9, from the W5 verifier's
      // re-check nit).
      const logged: string[] = [];
      const spy = vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
        logged.push(args.map(String).join(' '));
      });
      try {
        render();
      } finally {
        spy.mockRestore();
      }
      const warning = logged.find((line) => line.includes('head is dropped'));
      expect(warning).toBeDefined();
      expect(warning).toContain('ornament "ornMsEnd"');
      expect(warning).toContain('only the last 90ms of it are rendered');
    });

    it('names the span the spread really produces, not the frame’s length (W9)', () => {
      /**
       * `intensity === 0` is one of the v2 engine's two unguarded edges (`pow(i/(n−1), 0)` is
       * 1 for every i, including i = 0), so **every** slot lands at the frame's end rather than
       * spreading across it:
       *   i=0: pow(0/2,0)*60 = 60 ⇒ 60 + (−30) − 60 = −30
       *   i=1: pow(1/2,0)*60 = 60 ⇒ −30
       *   last (pinned):      60 ⇒ −30
       * All three onsets sit 30 ms before the note's end, so 30 ms of the principal is what
       * survives — not the 90 ms that `frameLength − frame.offset` claims. The old arithmetic
       * overstated by exactly one frameLength, and a reader who trusted it would look for 60 ms
       * of music that was never rendered.
       */
      const logged: string[] = [];
      const spy = vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
        logged.push(args.map(String).join(' '));
      });
      let notes: ReturnType<typeof notesOf> = [];
      try {
        const score = makeScore([makeNote('P', 0, 64)]);
        const map = makeMap([
          makeDef('spreadMsEndFlat', {
            frameOffset: { value: -30, domain: 'milliseconds' },
            frameLength: { value: 60, domain: 'milliseconds' },
            intensity: 0,
            alignment: 'at end',
          }),
        ]);
        map.addOrnament({
          date: 0,
          nameRef: 'spreadMsEndFlat',
          noteid: '#P',
          noteOrder: '#n1 #P #n2',
          notes: [new OrnamentNote('n1', chromatic(-2)), new OrnamentNote('n2', chromatic(2))],
          id: 'ornMsFlat',
        });
        map.renderOrnamentationToMap(score);
        notes = notesOf(score);
      } finally {
        spy.mockRestore();
      }

      // the markers are what the message is about, so they are asserted next to it
      expect(notes.map((note) => note.msFromEnd)).toEqual([-30, -30, -30]);
      const warning = logged.find((line) => line.includes('head is dropped'));
      expect(warning).toContain('ornament "ornMsFlat"');
      expect(warning).toContain('only the last 30ms of it are rendered');
    });

    it('stays quiet for the same frame aligned at start', () => {
      const logged: string[] = [];
      const spy = vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
        logged.push(args.map(String).join(' '));
      });
      try {
        const score = makeScore([makeNote('P', 0, 64)]);
        const map = makeMap([
          makeDef('spreadMs', {
            frameOffset: { value: -30, domain: 'milliseconds' },
            frameLength: { value: 60, domain: 'milliseconds' },
          }),
        ]);
        map.addOrnament({
          date: 0,
          nameRef: 'spreadMs',
          noteid: '#P',
          noteOrder: '#n1 #P',
          notes: [new OrnamentNote('n1', chromatic(1))],
        });
        map.renderOrnamentationToMap(score);
      } finally {
        spy.mockRestore();
      }
      expect(logged.filter((line) => line.includes('head is dropped'))).toEqual([]);
    });

    it('writes no onset-anchored marker for the same notes', () => {
      expect(render().map((note) => note.msOffset)).toEqual([null, null, null]);
    });

    it('writes the monophonic absolute durations onto the previous chord', () => {
      // consecutive marker differences: −75 − (−90) = 15, −30 − (−75) = 45; the last chord
      // gets none, exactly as the v2 engine leaves the last chord's duration alone
      const notes = render(NoteOffShift.Monophonic);
      expect(notes.map((note) => note.msDuration)).toEqual([15, 45, null]);
    });

    it('is consumed by the millisecond pass as end + value', () => {
      // A note at ms 1000..2000 carrying fromend −90 lands at 2000 − 90 = 1910; with no
      // absolute duration and no noteoff.shift the end stays put, so the duration absorbs it.
      const score = makeScore([makeNote('x', 0, 64)]);
      const note = score.getElement(0)!;
      note.addAttribute(new Attribute('milliseconds.date', '1000'));
      note.addAttribute(new Attribute('milliseconds.date.end', '2000'));
      note.addAttribute(new Attribute('ornament.milliseconds.fromend.offset', '-90'));
      OrnamentationMap.renderMillisecondsModifiersToMap(
        score,
        OrnamentationMap.createOrnamentationMap(),
      );
      expect(note.getAttributeValue('milliseconds.date')).toBe('1910');
      expect(note.getAttributeValue('milliseconds.date.end')).toBe('2000');
    });

    it('shifts the end with the onset when noteoff.shift is present', () => {
      // effective shift = 1910 − 1000 = 910, so the end moves 2000 ⇒ 2910 and the sounding
      // duration is preserved — the v2 rule, applied to the resolved offset.
      const score = makeScore([makeNote('x', 0, 64)]);
      const note = score.getElement(0)!;
      note.addAttribute(new Attribute('milliseconds.date', '1000'));
      note.addAttribute(new Attribute('milliseconds.date.end', '2000'));
      note.addAttribute(new Attribute('ornament.milliseconds.fromend.offset', '-90'));
      note.addAttribute(new Attribute('ornament.noteoff.shift', 'true'));
      OrnamentationMap.renderMillisecondsModifiersToMap(
        score,
        OrnamentationMap.createOrnamentationMap(),
      );
      expect(note.getAttributeValue('milliseconds.date')).toBe('1910');
      expect(note.getAttributeValue('milliseconds.date.end')).toBe('2910');
    });

    it('sets an absolute end when the ornament states a duration', () => {
      // 1910 + 40 = 1950
      const score = makeScore([makeNote('x', 0, 64)]);
      const note = score.getElement(0)!;
      note.addAttribute(new Attribute('milliseconds.date', '1000'));
      note.addAttribute(new Attribute('milliseconds.date.end', '2000'));
      note.addAttribute(new Attribute('ornament.milliseconds.fromend.offset', '-90'));
      note.addAttribute(new Attribute('ornament.milliseconds.duration', '40'));
      OrnamentationMap.renderMillisecondsModifiersToMap(
        score,
        OrnamentationMap.createOrnamentationMap(),
      );
      expect(note.getAttributeValue('milliseconds.date')).toBe('1910');
      expect(note.getAttributeValue('milliseconds.date.end')).toBe('1950');
    });

    it('leaves a note without a millisecond end untouched', () => {
      const score = makeScore([makeNote('x', 0, 64)]);
      const note = score.getElement(0)!;
      note.addAttribute(new Attribute('milliseconds.date', '1000'));
      note.addAttribute(new Attribute('ornament.milliseconds.fromend.offset', '-90'));
      OrnamentationMap.renderMillisecondsModifiersToMap(
        score,
        OrnamentationMap.createOrnamentationMap(),
      );
      expect(note.getAttributeValue('milliseconds.date')).toBe('1000');
    });
  });

  // -------------------------------------------------------------------------------------
  // noteoff.shift over generated notes
  // -------------------------------------------------------------------------------------
  describe('noteoff.shift over generated notes (D10)', () => {
    const render = (shift: NoteOffShift) => {
      const score = makeScore([makeNote('P', 0, 64)]);
      const map = makeMap([
        makeDef('fig', {
          frameLength: { value: 50, domain: 'relative' },
          noteOffShift: shift,
        }),
      ]);
      map.addOrnament({
        date: 0,
        nameRef: 'fig',
        noteid: '#P',
        noteOrder: '#n1 #P #n2',
        notes: [new OrnamentNote('n1', chromatic(1)), new OrnamentNote('n2', chromatic(-1))],
      });
      map.renderOrnamentationToMap(score);
      return notesOf(score);
    };

    // frame [0, 720], n = 3, intensity 1 ⇒ onsets 0, 360, 720
    it('false: every note ends at the principal note-off 1440', () => {
      const notes = render(NoteOffShift.False);
      expect(notes.map((note) => note.date)).toEqual([0, 360, 720]);
      expect(notes.map((note) => note.duration)).toEqual([1440, 1080, 720]);
    });

    it("true: every note keeps the principal's duration 1440", () => {
      expect(render(NoteOffShift.True).map((note) => note.duration)).toEqual([1440, 1440, 1440]);
    });

    it('monophonic: 360, 360, then the tail to 1440', () => {
      expect(render(NoteOffShift.Monophonic).map((note) => note.duration)).toEqual([360, 360, 720]);
    });
  });

  // -------------------------------------------------------------------------------------
  // dynamics gradient
  // -------------------------------------------------------------------------------------
  describe('dynamics gradient over the generated sequence', () => {
    it('folds ornament.dynamics into velocity in the same slot', () => {
      // gradient −1 → +1 at scale 2: constFac = (2 * (1 − (−1))) / (3 − 1) = 2,
      // fromVelocity = −1 * 2 = −2 ⇒ markers −2, 0, +2 ⇒ velocities 98, 100, 102.
      const score = makeScore([makeNote('P', 0, 64)]);
      const map = makeMap([
        makeDef('fig', {
          frameLength: { value: 50, domain: 'relative' },
          gradient: [-1, 1],
        }),
      ]);
      map.addOrnament({
        date: 0,
        nameRef: 'fig',
        scale: 2,
        noteid: '#P',
        noteOrder: '#n1 #P #n2',
        notes: [new OrnamentNote('n1', chromatic(1)), new OrnamentNote('n2', chromatic(-1))],
      });
      map.renderOrnamentationToMap(score);
      const notes = notesOf(score);
      expect(notes.map((note) => note.dynamics)).toEqual([-2, 0, 2]);
      expect(notes.map((note) => note.velocity)).toEqual([98, 100, 102]);
    });
  });

  // -------------------------------------------------------------------------------------
  // principal resolution (D7)
  // -------------------------------------------------------------------------------------
  describe('principal resolution (D7)', () => {
    const renderWith = (options: {
      noteid?: string;
      noteOrder: string;
      notes?: OrnamentNote[];
    }) => {
      const score = makeScore([makeNote('a', 0, 60), makeNote('b', 0, 67)]);
      const map = makeMap([makeDef('fig', { frameLength: { value: 100, domain: 'relative' } })]);
      map.addOrnament({
        date: 0,
        nameRef: 'fig',
        noteid: options.noteid,
        noteOrder: options.noteOrder,
        notes: options.notes ?? [new OrnamentNote('n1', chromatic(1))],
      });
      map.renderOrnamentationToMap(score);
      return notesOf(score);
    };

    it('prefers @noteid, stripping its "#"', () => {
      // principal b (67) ⇒ n1 = 68
      const notes = renderWith({ noteid: '#b', noteOrder: '[ #n1 ]' });
      expect(notes.map((note) => note.pitch)).toEqual([60, 68]);
    });

    it('accepts a raw @noteid without the "#"', () => {
      expect(renderWith({ noteid: 'b', noteOrder: '[ #n1 ]' }).map((n) => n.pitch)).toEqual([
        60, 68,
      ]);
    });

    it('falls back to the first non-pool reference in note.order', () => {
      // no noteid; "#n1" is a pool id and is skipped, "#a" (60) becomes the principal ⇒ n1 = 61.
      // Document order is b(67) first because GenericMap.addElement appends a new element
      // *after* the last one already at its date — the generated notes join the date-0 group
      // at its end, which is the same rule every other map insertion follows.
      const notes = renderWith({ noteOrder: '#n1 #a' });
      expect(notes.map((note) => note.pitch)).toEqual([67, 61, 60]);
    });

    it('renders without a principal when every pool note is absolute', () => {
      const score = makeScore([makeNote('a', 0, 60)]);
      const map = makeMap([
        makeDef('fig', {
          frameOffset: { value: 0, domain: 'ticks' },
          frameLength: { value: 480, domain: 'ticks' },
        }),
      ]);
      map.addOrnament({
        date: 0,
        nameRef: 'fig',
        noteOrder: '#n1 #n2',
        notes: [
          new OrnamentNote('n1', { kind: 'midi', value: 72 }),
          new OrnamentNote('n2', { kind: 'midi', value: 74 }),
        ],
      });
      map.renderOrnamentationToMap(score);
      const notes = notesOf(score);
      // the principal-less frame anchors at the ornament's own date 0 and lasts as long as it
      // is: offset 0 + length 480 ⇒ onsets 0 and 480, the existing note untouched
      expect(notes.map((note) => note.pitch)).toEqual([60, 72, 74]);
      expect(notes.map((note) => note.date)).toEqual([0, 0, 480]);
      expect(notes[0].generated).toBeNull();
    });

    it('skips an ornament whose relative pool notes have no principal', () => {
      const score = makeScore([makeNote('a', 0, 60)]);
      const map = makeMap([
        makeDef('fig', {
          frameOffset: { value: 0, domain: 'ticks' },
          frameLength: { value: 480, domain: 'ticks' },
        }),
      ]);
      map.addOrnament({
        date: 0,
        nameRef: 'fig',
        noteOrder: '#n1',
        notes: [new OrnamentNote('n1', chromatic(1))],
      });
      map.renderOrnamentationToMap(score);
      expect(notesOf(score)).toHaveLength(1);
    });
  });

  // -------------------------------------------------------------------------------------
  // multi-ornament layout (D11)
  // -------------------------------------------------------------------------------------
  describe('multiple ornaments on one principal (D11)', () => {
    it(
      'runs a front cursor through them in map order',
      () => {
        // Two 25%-frames (360 ticks each) on a 1440-tick principal: total 720 ≤ 1440, so
        // scaleFactor = min(1, 1440/720) = 1. The first occupies [0, 360], the second
        // [360, 720]. Two slots each, intensity 1 ⇒ onsets 0, 360 and 360, 720.
        const score = makeScore([makeNote('P', 0, 64)]);
        const map = makeMap([makeDef('fig', { frameLength: { value: 25, domain: 'relative' } })]);
        for (const id of ['o1', 'o2'])
          map.addOrnament({
            date: 0,
            nameRef: 'fig',
            noteid: '#P',
            noteOrder: '#n1 #P',
            notes: [new OrnamentNote('n1', chromatic(1))],
            id,
          });
        map.renderOrnamentationToMap(score);
        const notes = notesOf(score);
        expect(notes.map((note) => note.date)).toEqual([0, 360, 360, 720]);
        expect(notes.map((note) => note.ref)).toEqual(['o1', 'o1', 'o2', 'o2']);
      },
      TIMEOUT,
    );

    it(
      'shrinks both proportionally when they overflow the principal',
      () => {
        // Two 100%-frames (1440 each) on a 1440-tick principal: totalRaw = 2880 and
        // scaleFactor = min(1, 1440/2880) = 0.5, so each frame becomes 720 ticks. The first
        // runs [0, 720], the second [720, 1440]; two slots each ⇒ onsets 0, 720 and 720, 1440.
        const score = makeScore([makeNote('P', 0, 64)]);
        const map = makeMap([makeDef('fig', { frameLength: { value: 100, domain: 'relative' } })]);
        for (const id of ['o1', 'o2'])
          map.addOrnament({
            date: 0,
            nameRef: 'fig',
            noteid: '#P',
            noteOrder: '#n1 #P',
            notes: [new OrnamentNote('n1', chromatic(1))],
            id,
          });
        map.renderOrnamentationToMap(score);
        expect(notesOf(score).map((note) => note.date)).toEqual([0, 720, 720, 1440]);
      },
      TIMEOUT,
    );

    it(
      'packs the at-end group against the principal end',
      () => {
        // One "at start" 25% frame (360) and one "at end" 25% frame (360). totalRaw = 720,
        // scale 1. Front: [0, 360]. End group total 360, so it starts at 1440 − 360 = 1080 and
        // runs [1080, 1440]. Onsets 0, 360 and 1080, 1440.
        const score = makeScore([makeNote('P', 0, 64)]);
        const map = makeMap([
          makeDef('front', { frameLength: { value: 25, domain: 'relative' } }),
          makeDef('back', { frameLength: { value: 25, domain: 'relative' }, alignment: 'at end' }),
        ]);
        for (const nameRef of ['front', 'back'])
          map.addOrnament({
            date: 0,
            nameRef,
            noteid: '#P',
            noteOrder: '#n1 #P',
            notes: [new OrnamentNote('n1', chromatic(1))],
            id: nameRef,
          });
        map.renderOrnamentationToMap(score);
        // no head leftover: an "at start" ornament already begins at the principal's date
        expect(notesOf(score).map((note) => note.date)).toEqual([0, 360, 1080, 1440]);
      },
      TIMEOUT,
    );

    it(
      'lays tick and millisecond ornaments out independently',
      () => {
        const score = makeScore([makeNote('P', 0, 64)]);
        const map = makeMap([
          makeDef('tickFig', { frameLength: { value: 50, domain: 'relative' } }),
          makeDef('msFig', {
            frameOffset: { value: 0, domain: 'milliseconds' },
            frameLength: { value: 60, domain: 'milliseconds' },
          }),
        ]);
        for (const nameRef of ['tickFig', 'msFig'])
          map.addOrnament({
            date: 0,
            nameRef,
            noteid: '#P',
            noteOrder: '#n1 #P',
            notes: [new OrnamentNote('n1', chromatic(1))],
            id: nameRef,
          });
        map.renderOrnamentationToMap(score);
        const notes = notesOf(score);
        // the tick ornament spans [0, 720] on its own cursor; the millisecond one is not scaled
        // against it and stays on the principal's date with its own markers
        expect(notes.map((note) => note.date)).toEqual([0, 0, 0, 720]);
        expect(notes.map((note) => note.msOffset)).toEqual([null, 0, 60, null]);
      },
      TIMEOUT,
    );
  });

  // -------------------------------------------------------------------------------------
  // negative dates (D14)
  // -------------------------------------------------------------------------------------
  describe('negative dates (D14)', () => {
    it('drops a generated note that ends at or before tick 0', () => {
      // frame offset −960 ticks, length 480, two slots, noteoff.shift true (each note keeps
      // the principal's 480-tick duration): onsets −960 and −480, ends −480 and 0. Both end
      // at or before 0, so both are dropped and nothing is generated.
      const score = makeScore([makeNote('P', 0, 64, 480)]);
      const map = makeMap([
        makeDef('fig', {
          frameOffset: { value: -960, domain: 'ticks' },
          frameLength: { value: 480, domain: 'ticks' },
          noteOffShift: NoteOffShift.True,
        }),
      ]);
      map.addOrnament({
        date: 0,
        nameRef: 'fig',
        noteid: '#P',
        noteOrder: '#n1 #P',
        notes: [new OrnamentNote('n1', chromatic(1))],
      });
      map.renderOrnamentationToMap(score);
      // the principal is left alone: nothing replaced it
      const notes = notesOf(score);
      expect(notes).toHaveLength(1);
      expect(notes[0].id).toBe('P');
    });

    it('clamps a generated note that straddles tick 0', () => {
      // frame offset −240, length 480, two slots, noteoff.shift true: onsets −240 and 240,
      // durations 480 each ⇒ the first spans [−240, 240) and is clamped to [0, 240).
      const score = makeScore([makeNote('P', 0, 64, 480)]);
      const map = makeMap([
        makeDef('fig', {
          frameOffset: { value: -240, domain: 'ticks' },
          frameLength: { value: 480, domain: 'ticks' },
          noteOffShift: NoteOffShift.True,
        }),
      ]);
      map.addOrnament({
        date: 0,
        nameRef: 'fig',
        noteid: '#P',
        noteOrder: '#n1 #P',
        notes: [new OrnamentNote('n1', chromatic(1))],
      });
      map.renderOrnamentationToMap(score);
      const notes = notesOf(score);
      expect(notes.map((note) => note.date)).toEqual([0, 240]);
      expect(notes.map((note) => note.duration)).toEqual([240, 480]);
    });

    /**
     * Ruling 5, pinned: a dropped note leaves a **gap** in `ornament.slot` rather than
     * renumbering the notes after it. The attribute is provenance about the expansion, and the
     * expansion is what it has to stay true to — a consumer joining generated notes back to
     * `note.order` positions would be silently misaligned by renumbering.
     *
     * Principal P: date 0, duration 1440. Pool a/b/c/d at +1/+2/+3/+4 chromatic (65/66/67/68),
     * `note.order = "#a #b #c #d"`, frame.offset −960 ticks, frameLength 1440 ticks,
     * noteoff.shift="monophonic". The frame is exactly as long as the principal, so D11's
     * overflow factor is min(1, 1440/1440) = 1 and no scaling interferes with the arithmetic.
     *
     * Spacing, n = 4, intensity 1, start = −960, length = 1440:
     *   i=0: pow(0/3,1)*1440 − 960 = −960
     *   i=1: pow(1/3,1)*1440 − 960 =  480 − 960 = −480
     *   i=2: pow(2/3,1)*1440 − 960 =  960 − 960 =    0
     *   last (pinned):        −960 + 1440       =  480
     * monophonic durations are the gaps 480, 480, 480 and then the tail 1440 − 480 = 960, so
     * the note-offs are −480, 0, 480, 1440. D14 drops a note whose end is at or before tick 0,
     * so slots 0 and 1 go and slots 2 and 3 stay — and the first surviving note must report
     * `ornament.slot="2"`, not `"0"`.
     *
     * NOTE on the shape of the dropped run: for every NON-NEGATIVE intensity the spacing
     * offsets are non-decreasing in i and every noteoff.shift mode keeps the note-off
     * non-decreasing too (`true` adds a constant, `false` is constant, `monophonic` takes the
     * next onset), so `end <= 0` holds only for an initial run. A NEGATIVE intensity reverses
     * that ordering (pow(i/(n−1), intensity) decreases in i while the last slot stays pinned),
     * so it CAN drop an interior run — verified by construction (W5 verifier re-check,
     * docs/history/ornamentation/LOG.md): intensity −1, offset −1000, length 100, monophonic, 4 slots drops
     * slots 1 and 2. The same rule covers both shapes. This prefix vector is the strongest form
     * against survivor-renumbering: the survivors' first index is non-zero, which is exactly
     * what renumbering would destroy.
     *
     * That construction's slot 0 used to survive as well, at `pow(0/3, −1) = Infinity`; the
     * finiteness guard added in W9 drops it, so it now yields a single survivor at slot 3. The
     * describe below is where that is pinned, and it does not weaken this one: the two vectors
     * agree that a survivor keeps the index the expansion gave it.
     */
    it('keeps the expansion’s slot numbering when D14 drops the notes before it', () => {
      const score = makeScore([makeNote('P', 0, 64)]);
      const map = makeMap([
        makeDef('fig', {
          frameOffset: { value: -960, domain: 'ticks' },
          frameLength: { value: 1440, domain: 'ticks' },
          noteOffShift: NoteOffShift.Monophonic,
        }),
      ]);
      map.addOrnament({
        date: 0,
        nameRef: 'fig',
        noteid: '#P',
        noteOrder: '#a #b #c #d',
        notes: [
          new OrnamentNote('a', chromatic(1)),
          new OrnamentNote('b', chromatic(2)),
          new OrnamentNote('c', chromatic(3)),
          new OrnamentNote('d', chromatic(4)),
        ],
        id: 'ornDrop',
      });
      map.renderOrnamentationToMap(score);

      const notes = notesOf(score);
      expect(notes).toHaveLength(2);
      expect(notes.map((note) => note.date)).toEqual([0, 480]);
      expect(notes.map((note) => note.duration)).toEqual([480, 960]);
      expect(notes.map((note) => note.pitch)).toEqual([67, 68]);
      // the survivors keep the indices the expansion gave them
      expect(notes.map((note) => note.slot)).toEqual(['2', '3']);
      expect(notes.map((note) => note.source)).toEqual(['c', 'd']);
    });
  });

  // -------------------------------------------------------------------------------------
  // non-finite positions (W9 hardening — the W5 verifier's finding O2)
  // -------------------------------------------------------------------------------------
  describe('non-finite positions are dropped, not written into the score (W9)', () => {
    /**
     * The verifier's construction, verbatim: intensity −1, `frame.offset="-1000ticks"`,
     * `frameLength="100ticks"`, `noteoff.shift="monophonic"`, four slots, principal P at date 0
     * with duration 1440.
     *
     * A negative intensity is one of the two unguarded edges this renderer inherits from the v2
     * spacing engine on purpose, and `pow(0, −1)` is `Infinity`:
     *   i=0: pow(0/3,−1)*100 − 1000 = Infinity
     *   i=1: pow(1/3,−1) = 3   ⇒  300 − 1000 = −700
     *   i=2: pow(2/3,−1) = 1.5 ⇒  150 − 1000 = −850
     *   last (pinned):            −1000 + 100 = −900
     * monophonic durations are the gaps to the next onset — −700 − Infinity = −Infinity,
     * −850 − (−700) = −150, −900 − (−850) = −50 — and the tail 1440 − (−900) = 2340. Negative
     * durations clamp to 0, so the ends are Infinity, −700, −850 and −900 + 2340 = 1440.
     *
     * D14 drops slots 1 and 2 (their ends are at or before tick 0). Slot 0 is the one this
     * describe is about: its end is `Infinity`, D14's `end <= 0` does not hold, and the clamp
     * then computes `duration = end − date = Infinity − Infinity = NaN` — so before W9 the
     * renderer emitted a real `<note date="Infinity" duration="NaN">` into the augmented MSM
     * and on into the MIDI export. In MPM v2 the same input could only ever write a marker
     * *attribute* onto an existing note; v3 turns positions into elements, which is what
     * materialised it.
     *
     * Only slot 3 survives: date max(0, −900) = 0, duration 1440 − 0 = 1440, pitch 68.
     */
    const render = () => {
      const score = makeScore([makeNote('P', 0, 64)]);
      const map = makeMap([
        makeDef('degenerate', {
          frameOffset: { value: -1000, domain: 'ticks' },
          frameLength: { value: 100, domain: 'ticks' },
          intensity: -1,
          noteOffShift: NoteOffShift.Monophonic,
        }),
      ]);
      map.addOrnament({
        date: 0,
        nameRef: 'degenerate',
        noteid: '#P',
        noteOrder: '#a #b #c #d',
        notes: [
          new OrnamentNote('a', chromatic(1)),
          new OrnamentNote('b', chromatic(2)),
          new OrnamentNote('c', chromatic(3)),
          new OrnamentNote('d', chromatic(4)),
        ],
        id: 'ornInf',
      });
      map.renderOrnamentationToMap(score);
      return notesOf(score);
    };

    it('emits no note at an infinite date or a NaN duration', () => {
      const notes = render();
      for (const note of notes) {
        expect(Number.isFinite(note.date)).toBe(true);
        expect(Number.isFinite(note.duration)).toBe(true);
      }
    });

    it('keeps the one slot whose arithmetic is finite, with its expansion index', () => {
      const notes = render();
      expect(notes).toHaveLength(1);
      expect(notes[0].date).toBe(0);
      expect(notes[0].duration).toBe(1440);
      expect(notes[0].pitch).toBe(68);
      expect(notes[0].slot).toBe('3');
      expect(notes[0].source).toBe('d');
    });

    it('says how many notes it dropped and why', () => {
      const logged: string[] = [];
      const spy = vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
        logged.push(args.map(String).join(' '));
      });
      try {
        render();
      } finally {
        spy.mockRestore();
      }
      const warning = logged.find((line) => line.includes('not a finite number'));
      expect(warning).toBeDefined();
      expect(warning).toContain('ornament "ornInf"');
      // one of the four, counted over what the expansion planned rather than what survived
      expect(warning).toContain('1 of its 4 ornament notes');
    });

    it('drops only the notes an unreadable intensity spoils, and keeps the pinned one', () => {
      /**
       * `intensity="abc"` reads as `NaN` the way every numeric MSM/MPM attribute in this port
       * does, and `pow(x, NaN)` is `NaN`. But the **last** slot is placed outside the spacing
       * loop at `start + length`, which never touches `intensity` — so a NaN intensity spoils
       * every slot except that one, and the guard is per note rather than per ornament.
       *
       * Principal P at date 0, duration 1440; `frameLength="50%"` ⇒ frame [0, 720]; two slots:
       *   i=0: pow(0/1, NaN) * 720 + 0 = NaN   ⇒ dropped
       *   last (pinned):        0 + 720 = 720  ⇒ kept
       * noteoff.shift is `false` by default, so the survivor ends where the principal would
       * have: 1440 − 720 = 720. It is the only generated note, so it inherits the principal's
       * `xml:id` under D10 — the score is not left empty, and the one dropped note is reported.
       */
      const score = makeScore([makeNote('P', 0, 64)]);
      const map = makeMap([
        makeDef('unreadable', {
          frameLength: { value: 50, domain: 'relative' },
          intensity: Number.NaN,
        }),
      ]);
      map.addOrnament({
        date: 0,
        nameRef: 'unreadable',
        noteid: '#P',
        noteOrder: '#a #b',
        notes: [new OrnamentNote('a', chromatic(1)), new OrnamentNote('b', chromatic(2))],
        id: 'ornNaN',
      });

      const logged: string[] = [];
      const spy = vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
        logged.push(args.map(String).join(' '));
      });
      try {
        map.renderOrnamentationToMap(score);
      } finally {
        spy.mockRestore();
      }

      const notes = notesOf(score);
      expect(notes).toHaveLength(1);
      expect(notes[0].date).toBe(720);
      expect(notes[0].duration).toBe(720);
      expect(notes[0].pitch).toBe(66);
      expect(notes[0].slot).toBe('1');
      expect(logged.find((line) => line.includes('not a finite number'))).toContain(
        '1 of its 2 ornament notes',
      );
    });
  });

  // -------------------------------------------------------------------------------------
  // the -1 fill sentinel needs a millisecond frame (D9 refinement, W5 ruling)
  // -------------------------------------------------------------------------------------
  describe('repetitions="-1" outside the millisecond domain (W9)', () => {
    /**
     * `repetitions="-1"` is meico's undocumented "fill the frame" sentinel, and the count it
     * stands for is `ceil(frameLength_ms / 150)`. A tick or `%` frame has no millisecond length
     * before the tempo pass, so `frameNoteBudget` returns null for it and the expansion refuses
     * the ornament rather than inventing a count — the D9 refinement recorded with the D5
     * amendment. The behaviour shipped in W5 and PARITY §6.2 described it under a "pinned by
     * tests" umbrella, but no test passed `-1` with a non-millisecond frame (W9 verifier's
     * should-fix 5). These pin the behaviour that already exists; none of it changed.
     */
    const renderWithFrame = (frameLength: TemporalValue) => {
      const score = makeScore([makeNote('P', 0, 64)]);
      const map = makeMap([makeDef('fill', { frameLength })]);
      map.addOrnament({
        date: 0,
        nameRef: 'fill',
        noteid: '#P',
        noteOrder: '|: #P #u :|',
        notes: [new OrnamentNote('u', chromatic(2))],
        repetitions: -1,
        id: 'ornFill',
      });

      const logged: string[] = [];
      const spy = vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
        logged.push(args.map(String).join(' '));
      });
      try {
        map.renderOrnamentationToMap(score);
      } finally {
        spy.mockRestore();
      }
      return { notes: notesOf(score), logged };
    };

    it('skips a % frame, says it has no budget, and leaves the score alone', () => {
      const { notes, logged } = renderWithFrame({ value: 50, domain: 'relative' });

      // nothing generated, and the principal is still the score's own note
      expect(notes).toHaveLength(1);
      expect(notes[0].id).toBe('P');
      expect(notes[0].generated).toBeNull();
      expect(logged.join('\n')).toContain('needs a frame note budget of at least 1 slot; got null');
    });

    it('skips a ticks frame the same way', () => {
      const { notes, logged } = renderWithFrame({ value: 720, domain: 'ticks' });

      expect(notes).toHaveLength(1);
      expect(notes[0].id).toBe('P');
      expect(logged.join('\n')).toContain('needs a frame note budget of at least 1 slot; got null');
    });

    it('fills a millisecond frame, which is the case the sentinel exists for', () => {
      // 600 ms / 150 ⇒ a 4-slot budget; the group holds 2 slots, so the extra passes are
      // floor((4 − 2) / 2) = 1 ⇒ 2 + 2 = 4 slots, pitches 64/66/64/66. The landing rule then
      // appends **one more** principal-pitch slot, because the group opens on the principal's
      // own pitch — so the figure is five notes, 64/66/64/66/64, one over the budget. That
      // overshoot is deliberate and matches the reference, which also appends its landing copy
      // after the fill loop (W4 verifier, finding 4); the budget bounds the repetition, not the
      // landing. Pinned here because this is the only test that exercises the sentinel at all.
      const { notes, logged } = renderWithFrame({ value: 600, domain: 'milliseconds' });

      expect(notes.map((note) => note.pitch)).toEqual([64, 66, 64, 66, 64]);
      expect(notes.every((note) => note.generated === 'true')).toBe(true);
      expect(logged.join('\n')).not.toContain('frame note budget');
    });
  });

  // -------------------------------------------------------------------------------------
  // diagnostics volume (W9 hardening — the W2 verifier's unbounded-warnings advisory)
  // -------------------------------------------------------------------------------------
  describe('a malformed note.order does not flood the console (W9)', () => {
    it(
      'reports the first diagnostics and counts the rest',
      () => {
        // The two pure modules return their diagnostics instead of logging them, and both
        // arrays grow with the length of the value: 2000 references to notes that do not
        // exist produce 2000 expansion diagnostics (at 50 000 references, 100 000 — measured).
        // The renderer is where E1 decides what a human sees, so the cap sits there; the
        // parser additionally caps its own array, so the memory is bounded as well.
        const references = 2000;
        const score = makeScore([makeNote('P', 0, 64)]);
        const map = makeMap([makeDef('fig', { frameLength: { value: 50, domain: 'relative' } })]);
        map.addOrnament({
          date: 0,
          nameRef: 'fig',
          noteid: '#P',
          // every reference resolves to nothing, and the brackets keep it on the v3 path
          noteOrder: `[ ${Array.from({ length: references }, (_, i) => `#ghost${String(i)}`).join(' ')} ]`,
          notes: [],
          id: 'ornNoisy',
        });

        const logged: string[] = [];
        const spy = vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
          logged.push(args.map(String).join(' '));
        });
        try {
          map.renderOrnamentationToMap(score);
        } finally {
          spy.mockRestore();
        }

        // 2001 diagnostics in the array: one per unresolvable reference, plus the one saying
        // the chord lost every reference it had. Twenty are printed and 1981 are counted.
        const unresolved = logged.filter((line) => line.includes('neither a pool note'));
        expect(unresolved).toHaveLength(20);
        expect(logged.find((line) => line.includes('further diagnostics'))).toContain(
          `and ${String(references + 1 - 20)} further diagnostics about the same value`,
        );
        // bounded, and still nowhere near the number of things that went wrong
        expect(logged.length).toBeLessThan(30);
      },
      TIMEOUT,
    );
  });

  // -------------------------------------------------------------------------------------
  // the v3 gate (D6)
  // -------------------------------------------------------------------------------------
  describe('the v3 gate (D6)', () => {
    const dataWith = (mutate: (data: OrnamentData) => void, xml = new Element('ornament')) => {
      const data = new OrnamentData();
      mutate(data);
      return { data, xml };
    };

    it('fires on a note pool', () => {
      const { data, xml } = dataWith((d) => {
        d.notes = [new OrnamentNote('n1', chromatic(1))];
      });
      expect(isV3Ornament(xml, data)).toBe(true);
    });

    it('fires on noteid', () => {
      const { data, xml } = dataWith((d) => {
        d.noteid = '#p';
      });
      expect(isV3Ornament(xml, data)).toBe(true);
    });

    it('fires on a repetitions attribute, even when it is the default 0', () => {
      const xml = new Element('ornament');
      xml.addAttribute(new Attribute('repetitions', '0'));
      const { data } = dataWith(() => undefined, xml);
      expect(isV3Ornament(xml, data)).toBe(true);
    });

    it('fires on the grouping and repeat tokens of note.order', () => {
      for (const order of ['|: #a :|', '[ #a #b ]', '#a :|: #b', '#a | #b']) {
        const { data, xml } = dataWith((d) => {
          d.noteOrderText = order;
        });
        expect(isV3Ornament(xml, data)).toBe(true);
      }
    });

    it('does not fire on any v2 note.order', () => {
      for (const order of ['#a #b #c', 'ascending pitch', 'descending pitch', '#a']) {
        const { data, xml } = dataWith((d) => {
          d.noteOrderText = order;
        });
        expect(isV3Ornament(xml, data)).toBe(false);
      }
    });

    it('leaves a v2 ornament on the v2 path — markers, not notes', () => {
      // the reference fixture's arpeggio over a triad: three notes in, three notes out, each
      // carrying ornament.date.offset −22 / 0 / +22 and no generated note anywhere
      const score = makeScore([makeNote('a', 0, 60), makeNote('b', 0, 64), makeNote('c', 0, 67)]);
      const map = makeMap([makeDef('arpeggio', { v2FrameStart: -22, v2FrameLength: 44 })]);
      map.addOrnament(0, 'arpeggio', 1.0, ['a', 'b', 'c'], 'orn1');
      map.renderOrnamentationToMap(score);
      const notes = score.getAllElementsOfType('note').map((entry) => entry.getValue());
      expect(notes).toHaveLength(3);
      expect(notes.map((note) => note.getAttributeValue('ornament.date.offset'))).toEqual([
        '-22',
        '0',
        '22',
      ]);
      expect(notes.every((note) => note.getAttributeValue('ornament.generated') === null)).toBe(
        true,
      );
    });
  });

  // -------------------------------------------------------------------------------------
  // key signatures (D8)
  // -------------------------------------------------------------------------------------
  describe('key signature reading (D8)', () => {
    const scoreInPart = (accidentals: number[], date = 0) => {
      const part = new Element('part');
      const dated = new Element('dated');
      const keySignatureMap = new Element('keySignatureMap');
      const keySignature = new Element('keySignature');
      keySignature.addAttribute(new Attribute('date', String(date)));
      for (const value of accidentals) {
        const accidental = new Element('accidental');
        accidental.addAttribute(new Attribute('value', String(value)));
        keySignature.appendChild(accidental);
      }
      keySignatureMap.appendChild(keySignature);
      dated.appendChild(keySignatureMap);
      const scoreXml = new Element('score');
      dated.appendChild(scoreXml);
      part.appendChild(dated);
      return GenericMap.createGenericMap(scoreXml)!;
    };

    it('counts sharps positive and flats negative', () => {
      expect(readKeyFifths(scoreInPart([1, 1]), 0)).toBe(2);
      expect(readKeyFifths(scoreInPart([-1, -1, -1]), 0)).toBe(-3);
      expect(readKeyFifths(scoreInPart([]), 0)).toBe(0);
    });

    it('ignores a key signature that starts after the date asked for', () => {
      expect(readKeyFifths(scoreInPart([1, 1], 960), 0)).toBe(0);
      expect(readKeyFifths(scoreInPart([1, 1], 960), 960)).toBe(2);
    });

    it('answers 0 for a score with no part around it', () => {
      expect(readKeyFifths(makeScore([]), 0)).toBe(0);
      expect(readKeyFifths(null, 0)).toBe(0);
    });

    it('resolves interval.diatonic against it', () => {
      // D major (two sharps, scale pitch classes 1 2 4 6 7 9 11). Principal F♯ = 66,
      // one diatonic step up ⇒ G = 67 (research: the worked example in resolveDiatonicPitch).
      const score = scoreInPart([1, 1]);
      score.addElement(makeNote('P', 0, 66));
      const map = makeMap([makeDef('fig', { frameLength: { value: 100, domain: 'relative' } })]);
      map.addOrnament({
        date: 0,
        nameRef: 'fig',
        noteid: '#P',
        noteOrder: '#n1 #P',
        notes: [new OrnamentNote('n1', { kind: 'diatonic', value: 1 })],
      });
      map.renderOrnamentationToMap(score);
      expect(notesOf(score).map((note) => note.pitch)).toEqual([67, 66]);
    });
  });

  // -------------------------------------------------------------------------------------
  // the global ornamentation stage
  // -------------------------------------------------------------------------------------
  /**
   * A *global* `ornamentationMap` reaches across parts — that is what it is for — and it runs
   * in `Performance`'s global stage, before any part has been through
   * `collectPartMaps`/`addPerformanceTimingAttributes`. Both facts change what the renderer
   * must do, and neither is exercised by the per-part tests above.
   */
  describe('a global ornamentation map (Performance’s global stage)', () => {
    /** An MSM `<part>` wrapping notes in `dated/score`, as the global stage receives it. */
    function makePart(notes: Element[]): Element {
      const part = new Element('part');
      const dated = new Element('dated');
      const score = new Element('score');
      for (const note of notes) score.appendChild(note);
      dated.appendChild(score);
      part.appendChild(dated);
      return part;
    }

    /** The `<note>` children of a part's score, in document order. */
    function partNotes(part: Element): Element[] {
      const dated = part.getFirstChildElement('dated')!;
      return dated.getFirstChildElement('score')!.getChildElements('note').toArray();
    }

    /** A global map: its style comes from the GLOBAL header, so `apply` takes that branch. */
    function makeGlobalMap(defs: OrnamentDef[]): OrnamentationMap {
      const header = Header.createHeader()!;
      const style = OrnamentationStyle.createOrnamentationStyle('orn style')!;
      for (const def of defs) style.addDef(def);
      header.addStyleDef(Mpm.ORNAMENTATION_STYLE, style);
      const map = OrnamentationMap.createOrnamentationMap()!;
      map.setHeaders(header, null);
      map.addStyleSwitch(0, 'orn style');
      return map;
    }

    it('puts each ornament’s notes into the part its principal lives in', () => {
      // Two parts, one global map, one ornament per part. Frame 100% over each principal
      // (duration 1440), two slots, intensity 1 ⇒ onsets 0 and 1440 in each part.
      const partA = makePart([makeNote('a1', 0, 60)]);
      const partB = makePart([makeNote('b1', 0, 72)]);
      const map = makeGlobalMap([
        makeDef('fig', { frameLength: { value: 100, domain: 'relative' } }),
      ]);
      map.addOrnament({
        date: 0,
        nameRef: 'fig',
        noteid: '#a1',
        noteOrder: '#n1 #a1',
        notes: [new OrnamentNote('n1', chromatic(1))],
        id: 'ornA',
      });
      map.addOrnament({
        date: 0,
        nameRef: 'fig',
        noteid: '#b1',
        noteOrder: '#n1 #b1',
        notes: [new OrnamentNote('n1', chromatic(-1))],
        id: 'ornB',
      });

      OrnamentationMap.renderGlobalOrnamentationToParts([partA, partB], map);

      // Part A keeps only its own ornament's notes, and part B only its own: nothing was
      // funnelled into the first map. 61/60 in A (principal 60, n1 = +1), 71/72 in B.
      const a = partNotes(partA);
      const b = partNotes(partB);
      expect(a.map((note) => note.getAttributeValue('midi.pitch'))).toEqual(['61', '60']);
      expect(b.map((note) => note.getAttributeValue('midi.pitch'))).toEqual(['71', '72']);
      expect(a.map((note) => note.getAttributeValue('ornament.ref'))).toEqual(['ornA', 'ornA']);
      expect(b.map((note) => note.getAttributeValue('ornament.ref'))).toEqual(['ornB', 'ornB']);
      expect(a.map((note) => note.getAttributeValue('ornament.anchor'))).toEqual(['a1', 'a1']);
      expect(b.map((note) => note.getAttributeValue('ornament.anchor'))).toEqual(['b1', 'b1']);
      expect(a.map((note) => note.getAttributeValue('ornament.slot'))).toEqual(['0', '1']);
      expect(b.map((note) => note.getAttributeValue('ornament.slot'))).toEqual(['0', '1']);
      // and each principal's id survived on its own part's heir
      expect(a.map((note) => note.getAttributeValue('xml:id'))[1]).toBe('a1');
      expect(b.map((note) => note.getAttributeValue('xml:id'))[1]).toBe('b1');
    });

    it('writes no performance attributes when the principal has none yet', () => {
      // The global stage runs before addPerformanceTimingAttributes, so a principal has `date`
      // and `duration` but no `.perf` anything. A generated note must not invent them —
      // date.end.perf above all, which nothing downstream would ever correct.
      const bare = new Element('note');
      bare.addAttribute(new Attribute('xml:id', XML_NS, 'p1'));
      bare.addAttribute(new Attribute('date', '0'));
      bare.addAttribute(new Attribute('midi.pitch', '64'));
      bare.addAttribute(new Attribute('duration', '1440'));
      const part = makePart([bare]);

      const map = makeGlobalMap([
        makeDef('fig', { frameLength: { value: 100, domain: 'relative' } }),
      ]);
      map.addOrnament({
        date: 0,
        nameRef: 'fig',
        noteid: '#p1',
        noteOrder: '#n1 #p1',
        notes: [new OrnamentNote('n1', chromatic(1))],
      });

      OrnamentationMap.renderGlobalOrnamentationToParts([part], map);

      const notes = partNotes(part);
      expect(notes).toHaveLength(2);
      for (const note of notes) {
        expect(note.getAttributeValue('date.end.perf')).toBeNull();
        expect(note.getAttributeValue('date.perf')).toBeNull();
        expect(note.getAttributeValue('duration.perf')).toBeNull();
        // the symbolic attributes are all there, which is what D13 requires
        expect(note.getAttributeValue('date')).not.toBeNull();
        expect(note.getAttributeValue('duration')).not.toBeNull();
        expect(note.getAttributeValue('midi.pitch')).not.toBeNull();
      }
      expect(notes.map((note) => note.getAttributeValue('date'))).toEqual(['0', '1440']);
    });
  });

  // -------------------------------------------------------------------------------------
  // provenance (D10 as extended by the two conductor rulings of 2026-08-09)
  // -------------------------------------------------------------------------------------
  describe('provenance attributes on generated notes', () => {
    const renderTrill = () => {
      // "#P |: #n1 #P :|" with repetitions 1 on principal P (64, date 0, duration 1440):
      // slot 0 is the authored leading #P (no pass), then the group twice ⇒ n1 P n1 P with
      // passes 0 0 1 1. The landing rule does not fire (the group opens on n1, not on the
      // principal's pitch), and dedup collapses the boundary P|n1? no — 64 then 65, distinct.
      const score = makeScore([makeNote('P', 0, 64)]);
      const map = makeMap([makeDef('trill', { frameLength: { value: 100, domain: 'relative' } })]);
      map.addOrnament({
        date: 0,
        nameRef: 'trill',
        noteid: '#P',
        noteOrder: '#P |: #n1 #P :|',
        repetitions: 1,
        notes: [new OrnamentNote('n1', chromatic(1))],
        id: 'ornT',
      });
      map.renderOrnamentationToMap(score);
      return notesOf(score);
    };

    it('names the note.order token each note resolved from', () => {
      expect(renderTrill().map((note) => note.source)).toEqual(['P', 'n1', 'P', 'n1', 'P']);
    });

    it('numbers the slots of the final expanded sequence from 0', () => {
      expect(renderTrill().map((note) => note.slot)).toEqual(['0', '1', '2', '3', '4']);
    });

    it('stamps the repetition pass only on notes from the repeat group', () => {
      expect(renderTrill().map((note) => note.pass)).toEqual([null, '0', '0', '1', '1']);
    });

    it("anchors every generated note to the principal's original id", () => {
      expect(renderTrill().map((note) => note.anchor)).toEqual(['P', 'P', 'P', 'P', 'P']);
    });

    it('anchors even when note.order never names the principal and no leftover survives', () => {
      // the join the anchor exists for: the id P appears on no note's xml:id afterwards
      // (the expansion never resolved anything from the principal, so the heir is the first
      // generated note — but every note still points home through ornament.anchor)
      const score = makeScore([makeNote('P', 0, 64)]);
      const map = makeMap([makeDef('fig', { frameLength: { value: 100, domain: 'relative' } })]);
      map.addOrnament({
        date: 0,
        nameRef: 'fig',
        noteid: '#P',
        noteOrder: '#n1 #n2',
        notes: [new OrnamentNote('n1', chromatic(1)), new OrnamentNote('n2', chromatic(2))],
      });
      map.renderOrnamentationToMap(score);
      const notes = notesOf(score);
      expect(notes.map((note) => note.pitch)).toEqual([65, 66]);
      expect(notes.map((note) => note.anchor)).toEqual(['P', 'P']);
    });

    it('carries no anchor when the ornament has no principal (D7 step 3)', () => {
      const score = makeScore([makeNote('a', 0, 60)]);
      const map = makeMap([
        makeDef('fig', {
          frameOffset: { value: 0, domain: 'ticks' },
          frameLength: { value: 480, domain: 'ticks' },
        }),
      ]);
      map.addOrnament({
        date: 0,
        nameRef: 'fig',
        noteOrder: '#n1 #n2',
        notes: [
          new OrnamentNote('n1', { kind: 'midi', value: 72 }),
          new OrnamentNote('n2', { kind: 'midi', value: 74 }),
        ],
      });
      map.renderOrnamentationToMap(score);
      const generated = notesOf(score).filter((note) => note.generated === 'true');
      expect(generated).toHaveLength(2);
      expect(generated.map((note) => note.anchor)).toEqual([null, null]);
      // the rest of the family is still written — only the anchor needs a principal
      expect(generated.map((note) => note.source)).toEqual(['n1', 'n2']);
      expect(generated.map((note) => note.slot)).toEqual(['0', '1']);
    });

    it('does not let a second ornament inherit the first one’s provenance', () => {
      // the principal of the second ornament is a plain score note that the first never
      // touched, so nothing stale can reach it; the guard is that a generated note's copy
      // source never carries ornament.* through (NOT_INHERITED)
      //
      // W9: `ornament.carved` joins the stale set here. Within a single render it cannot be on
      // a principal — createChords copies before carve marks — but this is the case that makes
      // the deny-list entry load-bearing rather than defensive: a principal read back from an
      // *already augmented* MSM (the second performance of one document, the same scenario the
      // `milliseconds.*` entries exist for) really does arrive carrying the mark, and without
      // the entry every note generated from it would claim to be a carved head.
      const first = makeNote('P', 0, 64);
      first.addAttribute(new Attribute('ornament.generated', 'true'));
      first.addAttribute(new Attribute('ornament.carved', 'true'));
      first.addAttribute(new Attribute('ornament.ref', 'stale'));
      first.addAttribute(new Attribute('ornament.anchor', 'staleAnchor'));
      first.addAttribute(new Attribute('ornament.slot', '9'));
      first.addAttribute(new Attribute('ornament.pass', '9'));
      const score = makeScore([first]);
      const map = makeMap([makeDef('fig', { frameLength: { value: 100, domain: 'relative' } })]);
      map.addOrnament({
        date: 0,
        nameRef: 'fig',
        noteid: '#P',
        noteOrder: '#n1 #P',
        notes: [new OrnamentNote('n1', chromatic(1))],
        id: 'fresh',
      });
      map.renderOrnamentationToMap(score);
      const notes = notesOf(score);
      expect(notes.map((note) => note.ref)).toEqual(['fresh', 'fresh']);
      expect(notes.map((note) => note.anchor)).toEqual(['P', 'P']);
      expect(notes.map((note) => note.slot)).toEqual(['0', '1']);
      expect(notes.map((note) => note.pass)).toEqual([null, null]);
      // the stale mark does not survive the copy — this ornament carves nothing, and a
      // generated note is never a carved head
      expect(notes.map((note) => note.carved)).toEqual([null, null]);
    });
  });

  // -------------------------------------------------------------------------------------
  // the seam
  // -------------------------------------------------------------------------------------
  describe('the OrnamentData.apply seam', () => {
    it('returns the generated chords rather than an empty list', () => {
      const data = new OrnamentData();
      data.ornamentDef = makeDef('fig', { noSpread: true });
      const one = new Element('note');
      data.generation = { chords: [[one]], spacing: null };
      expect(data.apply([])).toEqual([[one]]);
    });

    it('still returns nothing on the v2 path, and still writes the v2 marker', () => {
      const data = new OrnamentData();
      data.ornamentDef = makeDef('fig', { v2FrameStart: -22, v2FrameLength: 44 });
      const one = new Element('note');
      expect(data.apply([[one]])).toEqual([]);
      // a single chord goes to the *end* of the frame, −22 + 44 = 22: v2's out-of-loop
      // placement of the last chord, which for n = 1 is the only one
      expect(one.getAttributeValue('ornament.date.offset')).toBe('22');
    });

    it('runs the spacing writer after the gradient', () => {
      const data = new OrnamentData();
      data.ornamentDef = makeDef('fig', { noSpread: true, gradient: [1, 1] });
      data.scale = 1;
      const one = new Element('note');
      const order: string[] = [];
      data.generation = {
        chords: [[one]],
        spacing: () => order.push(one.getAttributeValue('ornament.dynamics') ?? 'none'),
      };
      data.apply([]);
      // the gradient has already written its marker by the time the spacing runs
      expect(order).toEqual(['1']);
    });

    it('does not carry the generation into a clone', () => {
      const data = new OrnamentData();
      data.generation = { chords: [[new Element('note')]], spacing: null };
      expect(data.clone().generation).toBeNull();
    });
  });
});
