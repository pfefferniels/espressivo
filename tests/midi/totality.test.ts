import { describe, it, expect } from 'vitest';
import { Midi } from '../../src/midi/Midi.js';
import { Sequence } from '../../src/midi/MidiTypes.js';
import { EventMaker } from '../../src/midi/EventMaker.js';

/**
 * The claims that fell out of making `Midi`'s sequence field total, pinned.
 *
 * Three `| null`s came off this class — the field, `cloneSequence`'s return and
 * `exportMidi`'s — and each removal deleted a branch. Two of those are enforced by the
 * compiler and need no test. The third is not: dropping `append`'s
 * `(midi == null) || midi.isEmpty()` guard is only safe if the loops below it are already
 * inert for the argument the guard was rejecting, and that is a claim about behaviour.
 */
describe('control: append of a track-less Midi is the no-op the deleted guard assumed', () => {
  const withOneNote = () => {
    const m = new Midi(480);
    m.getSequence()
      .createTrack()
      .add(EventMaker.createNoteOn(0, 0, 60, 100)!);
    return m;
  };
  it('bytes are identical whether or not an empty Midi is appended', () => {
    const a = withOneNote();
    const b = withOneNote();
    b.append(new Midi(480)); // 0 tracks
    b.append(new Midi(new Sequence(Sequence.PPQ, 480)));
    expect(Array.from(b.exportMidi())).toEqual(Array.from(a.exportMidi()));
  });
  it('but append is not inert in general, so the test above can fail', () => {
    // First attempt at this control asserted that a Midi with ONE EMPTY track would differ.
    // It does not: `this` already has one track so none is created, and an empty source
    // track copies no events. Two tracks is the smallest input that actually moves bytes —
    // the while loop has to create a second track to match.
    const a = withOneNote();
    const b = withOneNote();
    const twoTracks = new Midi(480);
    twoTracks.getSequence().createTrack();
    twoTracks.getSequence().createTrack();
    b.append(twoTracks);
    expect(Array.from(b.exportMidi())).not.toEqual(Array.from(a.exportMidi()));
  });
});

describe('cloneSequence is total', () => {
  // Its `| null` was unreachable: Java catches `InvalidMidiDataException` from
  // `new Sequence(divisionType, resolution)`, but this port's Sequence constructor is two
  // field assignments. That is a proof, not a test — so what is worth testing instead is
  // the claim the proof rests on, that every division type this class can hold round-trips
  // through a clone rather than some of them being rejected.
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
