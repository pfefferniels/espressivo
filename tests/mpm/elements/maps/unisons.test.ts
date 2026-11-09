/**
 * PARITY.md §1, "A doubled note is struck once", end to end: through the facade, a note written in
 * two parts at one date comes out of a v2 arpeggio at one onset and one velocity, and the
 * arpeggio is spaced over the keys rather than over the notes. The map-level cases are in
 * `tests/mpm/elements/OrnamentationMap.test.ts` ("unisons share a slot").
 */
import { describe, it, expect } from 'vitest';
import { performMsmToData } from '../../../../src/api/index.js';

/** one score note */
const note = (id: string, pitch: number, duration = 1440): string =>
  `<note xml:id="${id}" date="720.0" midi.pitch="${pitch}.0" pitchname="x" accidentals="0.0" octave="3.0" duration="${duration}.0" />`;

/** an MSM part holding `notes` */
const part = (number: number, notes: string): string =>
  `<part name="Piano" number="${number}" midi.channel="0" midi.port="0"><header /><dated><score>${notes}</score></dated></part>`;

// The melody (part 1) and an inner voice (part 2) meet on middle C at 720: the voice holds it on.
const MSM = [
  '<?xml version="1.0"?>',
  '<msm title="Unison" xml:id="u" pulsesPerQuarter="720"><global><header /><dated /></global>',
  part(1, note('melody60', 60, 720) + note('melody64', 64, 720)),
  part(2, note('voice48', 48) + note('voice60', 60, 2880)),
  '</msm>',
].join('');

// A global arpeggio of 60 ms at 720, low to high, with a dynamics ramp.
const MPM = [
  '<?xml version="1.0"?>',
  '<mpm xmlns="http://www.cemfi.de/mpm/ns/1.0"><performance name="p" pulsesPerQuarter="720"><global><header>',
  '<ornamentationStyles><styleDef name="s"><ornamentDef name="arpeggio">',
  '<dynamicsGradient transition.from="-1.0" transition.to="1.0" />',
  '<temporalSpread frame.start="-30.0" frameLength="60.0" time.unit="milliseconds" />',
  '</ornamentDef></styleDef></ornamentationStyles></header><dated>',
  '<tempoMap><tempo date="0.0" bpm="120" beatLength="0.25" /></tempoMap>',
  '<ornamentationMap><style date="0.0" name.ref="s" />',
  '<ornament date="720.0" name.ref="arpeggio" scale="10.0" note.order="ascending pitch" /></ornamentationMap>',
  '</dated></global>',
  '<part name="Piano" number="1" midi.channel="0" midi.port="0"><header /><dated><dynamicsMap><dynamics date="0.0" volume="80" /></dynamicsMap></dated></part>',
  '<part name="Piano" number="2" midi.channel="0" midi.port="0"><header /><dated><dynamicsMap><dynamics date="0.0" volume="80" /></dynamicsMap></dated></part>',
  '</performance></mpm>',
].join('');

describe('a note doubled across parts under a v2 arpeggio', () => {
  const notes = new Map(
    performMsmToData({ msm: MSM, mpm: MPM }).parts.flatMap((p) => p.notes.map((n) => [n.id, n])),
  );
  const at = (id: string) => notes.get(id)!;

  it('is struck once: one onset, one velocity, each voice keeping its own end', () => {
    expect(at('melody60').milliseconds.date).toBe(at('voice60').milliseconds.date);
    expect(at('melody60').velocity).toBe(at('voice60').velocity);
    expect(at('melody60').milliseconds.end).toBeCloseTo(1000);
    expect(at('voice60').milliseconds.end).toBeCloseTo(2500);
  });

  it('spreads the three keys over the frame, as if the C were written once', () => {
    // 720 ticks at 120 bpm is 500 ms; the frame runs from 470 to 530 ms
    expect(at('voice48').milliseconds.date).toBeCloseTo(470);
    expect(at('melody60').milliseconds.date).toBeCloseTo(500);
    expect(at('melody64').milliseconds.date).toBeCloseTo(530);

    expect(at('voice48').velocity).toBeCloseTo(70);
    expect(at('melody60').velocity).toBeCloseTo(80);
    expect(at('melody64').velocity).toBeCloseTo(90);
  });
});
