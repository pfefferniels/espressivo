import { describe, it, expect } from 'vitest';
import { Midi } from '../../src/midi/Midi.js';
import { Sequence } from '../../src/midi/MidiTypes.js';
import { EventMaker } from '../../src/midi/EventMaker.js';

/**
 * `Midi`'s sequence field is total, and `append` carries no `(midi == null) ||
 * midi.isEmpty()` guard. Doing without one is only safe if `append`'s loops are inert for
 * the argument such a guard would reject — a claim about behaviour that the compiler cannot
 * make, so it is pinned here.
 */
describe('control: append of a track-less Midi is the no-op the deleted guard assumed', () => {
  const withOneNote = () => {
    const m = Midi.empty(480);
    m.getSequence()
      .createTrack()
      .add(EventMaker.createNoteOn(0, 0, 60, 100));
    return m;
  };
  it('bytes are identical whether or not an empty Midi is appended', () => {
    const a = withOneNote();
    const b = withOneNote();
    b.append(Midi.empty(480)); // 0 tracks
    b.append(new Midi(new Sequence(Sequence.PPQ, 480)));
    expect(Array.from(b.exportMidi())).toEqual(Array.from(a.exportMidi()));
  });
  it('but append is not inert in general, so the test above can fail', () => {
    // A Midi with one empty track does not move any bytes: `this` already has one track so
    // none is created, and an empty source track copies no events. Two tracks is the
    // smallest input that does — the while loop has to create a second track to match.
    const a = withOneNote();
    const b = withOneNote();
    const twoTracks = Midi.empty(480);
    twoTracks.getSequence().createTrack();
    twoTracks.getSequence().createTrack();
    b.append(twoTracks);
    expect(Array.from(b.exportMidi())).not.toEqual(Array.from(a.exportMidi()));
  });
});

describe('cloneSequence is total', () => {
  // Java catches `InvalidMidiDataException` from `new Sequence(divisionType, resolution)`;
  // this port's Sequence constructor is two field assignments, so there is nothing to
  // catch. What that rests on is testable: every division type this class can hold
  // round-trips through a clone rather than some of them being rejected.
  it.each([
    ['PPQ', Sequence.PPQ, 480],
    ['SMPTE_24', Sequence.SMPTE_24, 40],
    ['SMPTE_25', Sequence.SMPTE_25, 40],
    ['SMPTE_30DROP', Sequence.SMPTE_30DROP, 80],
    ['SMPTE_30', Sequence.SMPTE_30, 80],
  ])('clones a %s sequence, preserving timing', (_name, divisionType, resolution) => {
    const clone = Midi.cloneSequence(new Sequence(divisionType, resolution));
    expect(clone.getDivisionType()).toBe(divisionType);
    expect(clone.getResolution()).toBe(resolution);
  });
});
