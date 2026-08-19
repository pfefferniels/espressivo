import { describe, it, expect } from 'vitest';
import {
  ShortMessage,
  MetaMessage,
  SysexMessage,
  MidiEvent,
  Track,
  Sequence,
} from '../../src/midi/MidiTypes.js';
import { EventMaker } from '../../src/midi/EventMaker.js';

// ---------------------------------------------------------------------------
// ShortMessage
// ---------------------------------------------------------------------------
describe('ShortMessage – construction', () => {
  it('should default to a noteOn on channel 0 with pitch and velocity 0', () => {
    const sm = new ShortMessage();
    expect(Array.from(sm.getMessage())).toEqual([0x90, 0, 0]);
    expect(sm.getCommand()).toBe(ShortMessage.NOTE_ON);
    expect(sm.getChannel()).toBe(0);
  });

  it('should build the status byte from command and channel (4-arg form)', () => {
    const sm = new ShortMessage(ShortMessage.NOTE_ON, 9, 60, 100);
    expect(sm.getStatus()).toBe(0x99);
    expect(sm.getCommand()).toBe(ShortMessage.NOTE_ON);
    expect(sm.getChannel()).toBe(9);
    expect(sm.getData1()).toBe(60);
    expect(sm.getData2()).toBe(100);
    expect(sm.getLength()).toBe(3);
  });

  it('should mask the command to its high nibble and the channel to its low nibble', () => {
    // channel 20 does not exist; only the lower 4 bits survive
    const sm = new ShortMessage(ShortMessage.CONTROL_CHANGE, 20, 7, 64);
    expect(sm.getChannel()).toBe(20 & 0x0f);
    expect(sm.getCommand()).toBe(ShortMessage.CONTROL_CHANGE);
  });

  it('should emit only one data byte for program change and channel pressure', () => {
    const pc = new ShortMessage(ShortMessage.PROGRAM_CHANGE, 3, 42, 0);
    expect(pc.getLength()).toBe(2);
    expect(Array.from(pc.getMessage())).toEqual([0xc3, 42]);
    expect(pc.getData2()).toBe(0); // no second byte -> 0

    const cp = new ShortMessage(ShortMessage.CHANNEL_PRESSURE, 1, 90, 0);
    expect(cp.getLength()).toBe(2);
    expect(Array.from(cp.getMessage())).toEqual([0xd1, 90]);
  });

  it('should accept a ready-made status byte (3-arg form)', () => {
    const sm = new ShortMessage(0x9f, 60, 100);
    expect(sm.getStatus()).toBe(0x9f);
    expect(sm.getCommand()).toBe(ShortMessage.NOTE_ON);
    expect(sm.getChannel()).toBe(15);
  });

  it('should build a single status byte message (1-arg form)', () => {
    const sm = new ShortMessage(ShortMessage.TIMING_CLOCK);
    expect(sm.getLength()).toBe(1);
    expect(sm.getStatus()).toBe(0xf8);
    expect(sm.getData1()).toBe(0); // no data bytes present
    expect(sm.getData2()).toBe(0);
  });

  it('should clamp data bytes to 7 bits', () => {
    const sm = new ShortMessage(ShortMessage.NOTE_ON, 0, 200, 255);
    expect(sm.getData1()).toBe(200 & 0x7f);
    expect(sm.getData2()).toBe(127);
  });

  it('should define the javax.sound.midi status constants', () => {
    expect(ShortMessage.NOTE_OFF).toBe(0x80);
    expect(ShortMessage.NOTE_ON).toBe(0x90);
    expect(ShortMessage.POLY_PRESSURE).toBe(0xa0);
    expect(ShortMessage.CONTROL_CHANGE).toBe(0xb0);
    expect(ShortMessage.PROGRAM_CHANGE).toBe(0xc0);
    expect(ShortMessage.CHANNEL_PRESSURE).toBe(0xd0);
    expect(ShortMessage.PITCH_BEND).toBe(0xe0);
    expect(ShortMessage.SYSTEM_EXCLUSIVE).toBe(0xf0);
    expect(ShortMessage.END_OF_EXCLUSIVE).toBe(0xf7);
    expect(ShortMessage.SYSTEM_RESET).toBe(0xff);
  });
});

describe('ShortMessage – setMessage', () => {
  it('should overwrite the message in place', () => {
    const sm = new ShortMessage(ShortMessage.NOTE_ON, 0, 60, 100);
    sm.setMessage(ShortMessage.NOTE_OFF, 5, 62, 0);
    expect(sm.getCommand()).toBe(ShortMessage.NOTE_OFF);
    expect(sm.getChannel()).toBe(5);
    expect(sm.getData1()).toBe(62);
    expect(sm.getData2()).toBe(0);
  });

  it('should shrink a three-byte message to two bytes for program change', () => {
    const sm = new ShortMessage(ShortMessage.NOTE_ON, 0, 60, 100);
    sm.setMessage(ShortMessage.PROGRAM_CHANGE, 0, 42, 99);
    expect(sm.getLength()).toBe(2);
    expect(Array.from(sm.getMessage())).toEqual([0xc0, 42]);
  });

  it('should clamp the data bytes like the constructor does', () => {
    const sm = new ShortMessage();
    sm.setMessage(ShortMessage.CONTROL_CHANGE, 0, 300, 300);
    expect(sm.getData1()).toBe(300 & 0x7f);
    expect(sm.getData2()).toBe(300 & 0x7f);
  });
});

describe('ShortMessage – clone and getMessage', () => {
  it('should clone into an independent message', () => {
    const sm = new ShortMessage(ShortMessage.NOTE_ON, 2, 60, 100);
    const copy = sm.clone();

    expect(Array.from(copy.getMessage())).toEqual(Array.from(sm.getMessage()));
    copy.setMessage(ShortMessage.NOTE_OFF, 2, 60, 0);
    expect(sm.getCommand()).toBe(ShortMessage.NOTE_ON);
    expect(copy.getCommand()).toBe(ShortMessage.NOTE_OFF);
  });

  it('should hand out a copy of the raw bytes, not the backing array', () => {
    const sm = new ShortMessage(ShortMessage.NOTE_ON, 0, 60, 100);
    const bytes = sm.getMessage();
    bytes[1] = 0;
    expect(sm.getData1()).toBe(60);
  });
});

// ---------------------------------------------------------------------------
// MetaMessage
// ---------------------------------------------------------------------------
describe('MetaMessage', () => {
  it('should default to type 0 with no payload', () => {
    const mm = new MetaMessage();
    expect(mm.getType()).toBe(0);
    expect(mm.getData().length).toBe(0);
    expect(mm.getStatus()).toBe(0xff);
  });

  it('should assemble the full FF/type/length/data byte sequence', () => {
    const payload = new Uint8Array([0x07, 0xa1, 0x20]); // 500000 microseconds per quarter
    const mm = new MetaMessage(EventMaker.META_Set_Tempo, payload, payload.length);

    expect(mm.getType()).toBe(0x51);
    expect(Array.from(mm.getData())).toEqual([0x07, 0xa1, 0x20]);
    expect(Array.from(mm.getMessage())).toEqual([0xff, 0x51, 0x03, 0x07, 0xa1, 0x20]);
  });

  it('should honour the length argument and ignore trailing bytes', () => {
    const payload = new Uint8Array([1, 2, 3, 4, 5]);
    const mm = new MetaMessage(0x01, payload, 2);
    expect(Array.from(mm.getData())).toEqual([1, 2]);
    expect(Array.from(mm.getMessage())).toEqual([0xff, 0x01, 0x02, 1, 2]);
  });

  it('should mask the type to a single byte', () => {
    const mm = new MetaMessage(0x151, new Uint8Array([0]), 1);
    expect(mm.getType()).toBe(0x51);
  });

  it('should encode a payload longer than 127 bytes as a multi-byte length', () => {
    const payload = new Uint8Array(200).fill(0x41);
    const mm = new MetaMessage(EventMaker.META_Text_Event, payload, payload.length);
    const raw = mm.getMessage();

    expect(raw[0]).toBe(0xff);
    expect(raw[1]).toBe(0x01);
    // 200 = 0b1_1001000 -> 0x81 0x48 as a variable-length quantity
    expect(raw[2]).toBe(0x81);
    expect(raw[3]).toBe(0x48);
    expect(raw.length).toBe(4 + 200);
  });

  it('should hand out a copy of the payload, not the backing array', () => {
    const mm = new MetaMessage(0x01, new Uint8Array([1, 2, 3]), 3);
    const data = mm.getData();
    data[0] = 9;
    expect(mm.getData()[0]).toBe(1);
  });

  it('should clone type, payload and raw bytes into an independent message', () => {
    const mm = new MetaMessage(EventMaker.META_Track_Name, new Uint8Array([65, 66]), 2);
    const copy = mm.clone();

    expect(copy.getType()).toBe(mm.getType());
    expect(Array.from(copy.getData())).toEqual(Array.from(mm.getData()));
    expect(Array.from(copy.getMessage())).toEqual(Array.from(mm.getMessage()));
    expect(copy).not.toBe(mm);
  });

  it('should define META as 0xFF', () => {
    expect(MetaMessage.META).toBe(0xff);
  });
});

describe('MetaMessage.encodeVariableLength', () => {
  it('should encode values below 128 in a single byte', () => {
    expect(Array.from(MetaMessage.encodeVariableLength(0))).toEqual([0x00]);
    expect(Array.from(MetaMessage.encodeVariableLength(64))).toEqual([0x40]);
    expect(Array.from(MetaMessage.encodeVariableLength(127))).toEqual([0x7f]);
  });

  it('should encode larger values MSB first with continuation bits', () => {
    expect(Array.from(MetaMessage.encodeVariableLength(128))).toEqual([0x81, 0x00]);
    expect(Array.from(MetaMessage.encodeVariableLength(16383))).toEqual([0xff, 0x7f]);
    expect(Array.from(MetaMessage.encodeVariableLength(16384))).toEqual([0x81, 0x80, 0x00]);
  });

  it('should clamp negative values to zero', () => {
    expect(Array.from(MetaMessage.encodeVariableLength(-5))).toEqual([0x00]);
  });
});

// ---------------------------------------------------------------------------
// SysexMessage
// ---------------------------------------------------------------------------
describe('SysexMessage', () => {
  it('should default to an empty F0 ... F7 frame', () => {
    const sx = new SysexMessage();
    expect(Array.from(sx.getMessage())).toEqual([0xf0, 0xf7]);
    expect(sx.getStatus()).toBe(0xf0);
  });

  it('should keep the bytes it was given', () => {
    const sx = new SysexMessage(new Uint8Array([0xf0, 0x7e, 0x7f, 0x09, 0x01, 0xf7]));
    expect(Array.from(sx.getMessage())).toEqual([0xf0, 0x7e, 0x7f, 0x09, 0x01, 0xf7]);
    expect(sx.getLength()).toBe(6);
  });

  it('should report status 0 for a message without any bytes', () => {
    const sx = new SysexMessage(new Uint8Array(0));
    expect(sx.getLength()).toBe(0);
    expect(sx.getStatus()).toBe(0);
  });

  it('should clone into an independent message', () => {
    const sx = new SysexMessage(new Uint8Array([0xf0, 0x01, 0xf7]));
    const copy = sx.clone();
    expect(Array.from(copy.getMessage())).toEqual(Array.from(sx.getMessage()));
    expect(copy).not.toBe(sx);
  });
});

// ---------------------------------------------------------------------------
// MidiEvent
// ---------------------------------------------------------------------------
describe('MidiEvent', () => {
  it('should carry a message and a tick', () => {
    const msg = new ShortMessage(ShortMessage.NOTE_ON, 0, 60, 100);
    const event = new MidiEvent(msg, 480);
    expect(event.getMessage()).toBe(msg);
    expect(event.getTick()).toBe(480);
  });

  it('should allow the tick to be moved', () => {
    const event = new MidiEvent(new ShortMessage(), 0);
    event.setTick(960);
    expect(event.getTick()).toBe(960);
  });
});

// ---------------------------------------------------------------------------
// Track
// ---------------------------------------------------------------------------
describe('Track', () => {
  it('should start out empty with tick length 0', () => {
    const track = new Track();
    expect(track.size()).toBe(0);
    expect(track.ticks()).toBe(0);
  });

  it('should keep the events sorted by tick regardless of insertion order', () => {
    const track = new Track();
    track.add(new MidiEvent(new ShortMessage(), 960));
    track.add(new MidiEvent(new ShortMessage(), 0));
    track.add(new MidiEvent(new ShortMessage(), 480));

    expect([track.get(0).getTick(), track.get(1).getTick(), track.get(2).getTick()]).toEqual([
      0, 480, 960,
    ]);
    expect(track.ticks()).toBe(960);
  });

  it('should preserve insertion order among events on the same tick', () => {
    // this is what keeps a program change in front of the noteOn it applies to
    const track = new Track();
    const programChange = new MidiEvent(new ShortMessage(ShortMessage.PROGRAM_CHANGE, 0, 42, 0), 0);
    const noteOn = new MidiEvent(new ShortMessage(ShortMessage.NOTE_ON, 0, 60, 100), 0);
    track.add(programChange);
    track.add(noteOn);

    expect(track.get(0)).toBe(programChange);
    expect(track.get(1)).toBe(noteOn);
  });

  it('should report success when adding an event', () => {
    const track = new Track();
    expect(track.add(new MidiEvent(new ShortMessage(), 0))).toBe(true);
  });

  it('should remove an event it contains and report it', () => {
    const track = new Track();
    const a = new MidiEvent(new ShortMessage(), 0);
    const b = new MidiEvent(new ShortMessage(), 480);
    track.add(a);
    track.add(b);

    expect(track.remove(a)).toBe(true);
    expect(track.size()).toBe(1);
    expect(track.get(0)).toBe(b);
  });

  it('should report failure when removing an event it does not contain', () => {
    const track = new Track();
    track.add(new MidiEvent(new ShortMessage(), 0));
    expect(track.remove(new MidiEvent(new ShortMessage(), 0))).toBe(false);
    expect(track.size()).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Track.add — the binary insertion must be indistinguishable from push-and-sort
// ---------------------------------------------------------------------------
describe('Track.add is exactly push-then-stable-sort, without the sort', () => {
  /** `Track.add` as it was written before T-perf: append, then sort the whole array. */
  function byPushAndSort(events: MidiEvent[], event: MidiEvent): void {
    events.push(event);
    events.sort((a, b) => a.getTick() - b.getTick());
  }

  /**
   * Feed the same tick sequence to both implementations and compare the results by
   * identity, so that a difference in the ordering of equal ticks is caught and not just
   * a difference in the ticks themselves.
   */
  function agree(ticks: readonly number[]): void {
    const track = new Track();
    const reference: MidiEvent[] = [];
    for (const tick of ticks) {
      // One event object per tick, added to both, so identity comparison is meaningful.
      const event = new MidiEvent(new ShortMessage(), tick);
      track.add(event);
      byPushAndSort(reference, event);
    }
    expect(track.size()).toBe(reference.length);
    for (let i = 0; i < reference.length; ++i)
      expect(track.get(i) === reference[i], `position ${i}`).toBe(true);
  }

  it('for strictly ascending ticks', () => {
    agree([0, 1, 2, 10, 100, 1000, 10000]);
  });

  it('for descending ticks', () => {
    agree([1000, 900, 480, 12, 0]);
  });

  it('for runs of equal ticks — the case that makes stability observable', () => {
    agree([0, 0, 0, 480, 480, 480, 480, 0, 960, 480]);
  });

  it('for an interleaving that inserts into the middle of an equal-tick run', () => {
    agree([100, 100, 100, 50, 100, 150, 100, 50, 0, 100]);
  });

  it('for a long pseudo-random sequence', () => {
    // A fixed LCG rather than Math.random, so a failure is reproducible.
    let state = 12345;
    const ticks: number[] = [];
    for (let i = 0; i < 400; ++i) {
      state = (state * 1103515245 + 12345) % 2147483648;
      ticks.push(state % 50); // a small range, so equal ticks are frequent
    }
    agree(ticks);
  });

  it('for negative ticks', () => {
    agree([0, -10, 5, -10, -20, 0]);
  });

  it('falls back to push-and-sort once a non-finite tick appears, and keeps the rest', () => {
    const track = new Track();
    const finite = new MidiEvent(new ShortMessage(), 480);
    const nonFinite = new MidiEvent(new ShortMessage(), Number.NaN);
    const later = new MidiEvent(new ShortMessage(), 0);
    track.add(finite);
    track.add(nonFinite);
    track.add(later);
    // The only guarantee in this degenerate case is that nothing is lost.
    expect(track.size()).toBe(3);
    const kept = [track.get(0), track.get(1), track.get(2)];
    expect(kept).toContain(finite);
    expect(kept).toContain(nonFinite);
    expect(kept).toContain(later);
  });

  it('keeps ticks() a read of the largest tick', () => {
    const track = new Track();
    for (const tick of [500, 100, 900, 300]) track.add(new MidiEvent(new ShortMessage(), tick));
    expect(track.ticks()).toBe(900);
  });

  it('stays sorted across a remove, so later adds still land correctly', () => {
    const track = new Track();
    const middle = new MidiEvent(new ShortMessage(), 480);
    track.add(new MidiEvent(new ShortMessage(), 0));
    track.add(middle);
    track.add(new MidiEvent(new ShortMessage(), 960));
    track.remove(middle);
    track.add(new MidiEvent(new ShortMessage(), 240));
    expect([track.get(0).getTick(), track.get(1).getTick(), track.get(2).getTick()]).toEqual([
      0, 240, 960,
    ]);
  });

  it('builds a score-shaped track in time that does not grow quadratically', () => {
    // The pattern `Msm.processScore` produces: a text event, a noteOn and a noteOff per
    // note, the noteOff landing a few notes ahead. Near-append, which is the case the
    // binary insertion turns into O(1). (Adding in strictly *descending* tick order still
    // costs an O(n) splice each time — far cheaper than the sort it replaced, but not
    // constant; no caller builds a long track that way.)
    const build = (notes: number): void => {
      const track = new Track();
      for (let i = 0; i < notes; ++i) {
        const date = i * 10;
        track.add(new MidiEvent(new MetaMessage(0x01, new Uint8Array([65]), 1), date));
        track.add(new MidiEvent(new ShortMessage(ShortMessage.NOTE_ON, 0, 60, 100), date));
        track.add(new MidiEvent(new ShortMessage(ShortMessage.NOTE_OFF, 0, 60, 0), date + 35));
      }
      expect(track.size()).toBe(notes * 3);
    };

    // Cost of one build, in milliseconds: repeat until a batch is long enough to time,
    // then keep the fastest batch — noise only ever adds time, so the minimum is the
    // closest a wall clock gets to the work itself. Timing single builds instead was flaky
    // on a loaded machine.
    const perBuild = (notes: number, targetMs = 20, samples = 3): number => {
      let batch = 1;
      let best = Infinity;
      for (;;) {
        const before = performance.now();
        for (let i = 0; i < batch; ++i) build(notes);
        const elapsed = performance.now() - before;
        if (elapsed >= targetMs) {
          best = elapsed / batch;
          break;
        }
        batch *= 2;
      }
      for (let sample = 1; sample < samples; ++sample) {
        const before = performance.now();
        for (let i = 0; i < batch; ++i) build(notes);
        best = Math.min(best, (performance.now() - before) / batch);
      }
      return best;
    };

    build(1000); // warm the shapes before either measurement
    build(16000);
    // Sixteenfold input. Calibrated on this machine, idle and under sixfold CPU
    // oversubscription: the binary insertion lands at 28–30 (allocation and cache effects
    // put it above a clean 16), the push-and-sort it replaced at 273. The threshold sits
    // between those bands, so a loaded CI machine does not go red and the quadratic shape
    // cannot come back unnoticed.
    expect(perBuild(16000) / perBuild(1000)).toBeLessThan(64);
  });
});

// ---------------------------------------------------------------------------
// Sequence
// ---------------------------------------------------------------------------
describe('Sequence', () => {
  it('should define the javax.sound.midi division types', () => {
    expect(Sequence.PPQ).toBe(0.0);
    expect(Sequence.SMPTE_24).toBe(24.0);
    expect(Sequence.SMPTE_25).toBe(25.0);
    expect(Sequence.SMPTE_30DROP).toBe(29.97);
    expect(Sequence.SMPTE_30).toBe(30.0);
  });

  it('should keep division type and resolution', () => {
    const seq = new Sequence(Sequence.PPQ, 720);
    expect(seq.getDivisionType()).toBe(Sequence.PPQ);
    expect(seq.getResolution()).toBe(720);
    expect(seq.getTracks().length).toBe(0);
  });

  it('should append created tracks in order', () => {
    const seq = new Sequence(Sequence.PPQ, 480);
    const t0 = seq.createTrack();
    const t1 = seq.createTrack();
    expect(seq.getTracks()).toEqual([t0, t1]);
  });

  it('should delete a track it owns and report it', () => {
    const seq = new Sequence(Sequence.PPQ, 480);
    const t0 = seq.createTrack();
    const t1 = seq.createTrack();

    expect(seq.deleteTrack(t0)).toBe(true);
    expect(seq.getTracks()).toEqual([t1]);
  });

  it('should report failure when deleting a foreign track', () => {
    const seq = new Sequence(Sequence.PPQ, 480);
    seq.createTrack();
    expect(seq.deleteTrack(new Track())).toBe(false);
    expect(seq.getTracks().length).toBe(1);
  });

  it('should report the tick length as the maximum over all tracks', () => {
    const seq = new Sequence(Sequence.PPQ, 480);
    const t0 = seq.createTrack();
    const t1 = seq.createTrack();
    t0.add(new MidiEvent(new ShortMessage(), 480));
    t1.add(new MidiEvent(new ShortMessage(), 1920));

    expect(seq.getTickLength()).toBe(1920);
  });

  it('should report tick length 0 for an empty sequence', () => {
    expect(new Sequence(Sequence.PPQ, 480).getTickLength()).toBe(0);
  });
});

describe('Sequence.getMicrosecondLength', () => {
  it('should assume 120 bpm when the sequence has no tempo event', () => {
    const seq = new Sequence(Sequence.PPQ, 480);
    const track = seq.createTrack();
    track.add(new MidiEvent(new ShortMessage(), 1920)); // 4 quarter notes

    // 4 quarters at 500000 microseconds each
    expect(seq.getMicrosecondLength()).toBe(2000000);
  });

  it('should be 0 for an empty sequence', () => {
    expect(new Sequence(Sequence.PPQ, 480).getMicrosecondLength()).toBe(0);
  });

  it('should apply a tempo event from tick 0 onwards', () => {
    const seq = new Sequence(Sequence.PPQ, 480);
    const track = seq.createTrack();
    track.add(EventMaker.createTempo(0, 60, 0.25)!); // 1000000 microseconds per quarter
    track.add(new MidiEvent(new ShortMessage(), 1920)); // 4 quarter notes

    expect(seq.getMicrosecondLength()).toBe(4000000);
  });

  it('should switch tempo at the tick of a later tempo event', () => {
    const seq = new Sequence(Sequence.PPQ, 480);
    const track = seq.createTrack();
    track.add(EventMaker.createTempo(0, 120, 0.25)!); // 500000 us/quarter
    track.add(EventMaker.createTempo(960, 60, 0.25)!); // 1000000 us/quarter from quarter 2 on
    track.add(new MidiEvent(new ShortMessage(), 1920));

    // 2 quarters at 500000 + 2 quarters at 1000000
    expect(seq.getMicrosecondLength()).toBe(3000000);
  });

  it('should collect tempo events across all tracks in tick order', () => {
    const seq = new Sequence(Sequence.PPQ, 480);
    const conductor = seq.createTrack();
    const music = seq.createTrack();
    conductor.add(EventMaker.createTempo(960, 60, 0.25)!);
    conductor.add(EventMaker.createTempo(0, 120, 0.25)!);
    music.add(new MidiEvent(new ShortMessage(), 1920));

    expect(seq.getMicrosecondLength()).toBe(3000000);
  });
});
