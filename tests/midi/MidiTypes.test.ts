import { describe, it, expect } from 'vitest';
import {
  MetaMessage,
  MidiEvent,
  Sequence,
  ShortMessage,
  Track,
  channelMessage,
  encodeVariableLength,
  messageBytes,
  messageLength,
  messageStatus,
  metaMessage,
  metaPayload,
  oneByteMessage,
  shortChannel,
  shortCommand,
  shortData1,
  shortData2,
  shortMessage,
  sysexMessage,
} from '../../src/midi/MidiTypes.js';
import { EventMaker } from '../../src/midi/EventMaker.js';
import { bestGrowthRatio } from '../support/growthGuard.js';

/**
 * A message for tests that need *a* message and do not care which — the `90 00 00`
 * that the JDK's no-argument `new ShortMessage()` used to produce. That constructor
 * existed only to be the target of `clone()`, and went with it.
 */
const anyMessage = () => channelMessage(ShortMessage.NOTE_ON, 0, 0, 0);

// ---------------------------------------------------------------------------
// ShortMessage
// ---------------------------------------------------------------------------
describe('ShortMessage – construction', () => {
  it('should build a bare noteOn on channel 0 with pitch and velocity 0', () => {
    const sm = channelMessage(ShortMessage.NOTE_ON, 0, 0, 0);
    expect(Array.from(messageBytes(sm))).toEqual([0x90, 0, 0]);
    expect(shortCommand(sm)).toBe(ShortMessage.NOTE_ON);
    expect(shortChannel(sm)).toBe(0);
  });

  it('should build the status byte from command and channel (channelMessage)', () => {
    const sm = channelMessage(ShortMessage.NOTE_ON, 9, 60, 100);
    expect(messageStatus(sm)).toBe(0x99);
    expect(shortCommand(sm)).toBe(ShortMessage.NOTE_ON);
    expect(shortChannel(sm)).toBe(9);
    expect(shortData1(sm)).toBe(60);
    expect(shortData2(sm)).toBe(100);
    expect(messageLength(sm)).toBe(3);
  });

  it('should mask the command to its high nibble and the channel to its low nibble', () => {
    // channel 20 does not exist; only the lower 4 bits survive
    const sm = channelMessage(ShortMessage.CONTROL_CHANGE, 20, 7, 64);
    expect(shortChannel(sm)).toBe(20 & 0x0f);
    expect(shortCommand(sm)).toBe(ShortMessage.CONTROL_CHANGE);
  });

  it('should emit only one data byte for program change and channel pressure', () => {
    const pc = channelMessage(ShortMessage.PROGRAM_CHANGE, 3, 42, 0);
    expect(messageLength(pc)).toBe(2);
    expect(Array.from(messageBytes(pc))).toEqual([0xc3, 42]);
    expect(shortData2(pc)).toBe(0); // no second byte -> 0

    const cp = channelMessage(ShortMessage.CHANNEL_PRESSURE, 1, 90, 0);
    expect(messageLength(cp)).toBe(2);
    expect(Array.from(messageBytes(cp))).toEqual([0xd1, 90]);
  });

  it('should drop a non-zero data2 for a program change rather than emit it', () => {
    const pc = channelMessage(ShortMessage.PROGRAM_CHANGE, 0, 42, 99);
    expect(messageLength(pc)).toBe(2);
    expect(Array.from(messageBytes(pc))).toEqual([0xc0, 42]);
  });

  it('should accept a ready-made status byte (shortMessage)', () => {
    const sm = shortMessage(0x9f, 60, 100);
    expect(messageStatus(sm)).toBe(0x9f);
    expect(shortCommand(sm)).toBe(ShortMessage.NOTE_ON);
    expect(shortChannel(sm)).toBe(15);
  });

  it('should build a single status byte message (oneByteMessage)', () => {
    const sm = oneByteMessage(ShortMessage.TIMING_CLOCK);
    expect(messageLength(sm)).toBe(1);
    expect(messageStatus(sm)).toBe(0xf8);
    expect(shortData1(sm)).toBe(0); // no data bytes present
    expect(shortData2(sm)).toBe(0);
    expect(Array.from(messageBytes(sm))).toEqual([0xf8]);
  });

  it('should clamp data bytes to 7 bits', () => {
    const sm = channelMessage(ShortMessage.NOTE_ON, 0, 200, 255);
    expect(shortData1(sm)).toBe(200 & 0x7f);
    expect(shortData2(sm)).toBe(127);
  });

  it('should clamp the data bytes of a ready-made status byte too', () => {
    const sm = shortMessage(ShortMessage.CONTROL_CHANGE, 300, 300);
    expect(shortData1(sm)).toBe(300 & 0x7f);
    expect(shortData2(sm)).toBe(300 & 0x7f);
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

describe('ShortMessage – messageBytes', () => {
  it('should hand out a copy of the raw bytes, not a shared buffer', () => {
    const sm = channelMessage(ShortMessage.NOTE_ON, 0, 60, 100);
    const bytes = messageBytes(sm);
    bytes[1] = 0;
    expect(shortData1(sm)).toBe(60);
    expect(Array.from(messageBytes(sm))).toEqual([0x90, 60, 100]);
  });
});

// ---------------------------------------------------------------------------
// MetaMessage
// ---------------------------------------------------------------------------
describe('MetaMessage', () => {
  it('should accept type 0 with no payload', () => {
    const mm = metaMessage(0, new Uint8Array(0));
    expect(mm.type).toBe(0);
    expect(metaPayload(mm).length).toBe(0);
    expect(messageStatus(mm)).toBe(0xff);
  });

  it('should assemble the full FF/type/length/data byte sequence', () => {
    const payload = new Uint8Array([0x07, 0xa1, 0x20]); // 500000 microseconds per quarter
    const mm = metaMessage(EventMaker.META_Set_Tempo, payload);

    expect(mm.type).toBe(0x51);
    expect(Array.from(metaPayload(mm))).toEqual([0x07, 0xa1, 0x20]);
    expect(Array.from(messageBytes(mm))).toEqual([0xff, 0x51, 0x03, 0x07, 0xa1, 0x20]);
    expect(messageLength(mm)).toBe(6);
  });

  it('should take exactly the bytes it is given, so a prefix view excludes the rest', () => {
    // What the dropped `length` parameter used to express, said by the caller instead.
    const payload = new Uint8Array([1, 2, 3, 4, 5]);
    const mm = metaMessage(0x01, payload.subarray(0, 2));
    expect(Array.from(metaPayload(mm))).toEqual([1, 2]);
    expect(Array.from(messageBytes(mm))).toEqual([0xff, 0x01, 0x02, 1, 2]);
  });

  it('should mask the type to a single byte', () => {
    const mm = metaMessage(0x151, new Uint8Array([0]));
    expect(mm.type).toBe(0x51);
  });

  it('should encode a payload longer than 127 bytes as a multi-byte length', () => {
    const payload = new Uint8Array(200).fill(0x41);
    const mm = metaMessage(EventMaker.META_Text_Event, payload);
    const raw = messageBytes(mm);

    expect(raw[0]).toBe(0xff);
    expect(raw[1]).toBe(0x01);
    // 200 = 0b1_1001000 -> 0x81 0x48 as a variable-length quantity
    expect(raw[2]).toBe(0x81);
    expect(raw[3]).toBe(0x48);
    expect(raw.length).toBe(4 + 200);
    expect(messageLength(mm)).toBe(4 + 200);
  });

  it('should hand out a copy of the payload, not the backing array', () => {
    const mm = metaMessage(0x01, new Uint8Array([1, 2, 3]));
    const data = metaPayload(mm);
    data[0] = 9;
    expect(metaPayload(mm)[0]).toBe(1);
  });

  it('should copy the payload it is handed, so the caller cannot write into it later', () => {
    // The framing used to be built once and stored beside a second copy of the payload;
    // it is derived now, so this is the only remaining way the two could disagree.
    const source = new Uint8Array([1, 2, 3]);
    const mm = metaMessage(0x01, source);
    source[0] = 9;
    expect(Array.from(metaPayload(mm))).toEqual([1, 2, 3]);
    expect(Array.from(messageBytes(mm))).toEqual([0xff, 0x01, 0x03, 1, 2, 3]);
  });

  it('should define META as 0xFF', () => {
    expect(MetaMessage.META).toBe(0xff);
  });
});

describe('encodeVariableLength', () => {
  it('should encode values below 128 in a single byte', () => {
    expect(Array.from(encodeVariableLength(0))).toEqual([0x00]);
    expect(Array.from(encodeVariableLength(64))).toEqual([0x40]);
    expect(Array.from(encodeVariableLength(127))).toEqual([0x7f]);
  });

  it('should encode larger values MSB first with continuation bits', () => {
    expect(Array.from(encodeVariableLength(128))).toEqual([0x81, 0x00]);
    expect(Array.from(encodeVariableLength(16383))).toEqual([0xff, 0x7f]);
    expect(Array.from(encodeVariableLength(16384))).toEqual([0x81, 0x80, 0x00]);
  });

  it('should clamp negative values to zero', () => {
    expect(Array.from(encodeVariableLength(-5))).toEqual([0x00]);
  });

  it('should agree with the length messageLength predicts for a meta message', () => {
    // `messageLength` counts the VLQ without building it; a disagreement would put the
    // wrong number in a track chunk's length field.
    for (const size of [0, 1, 127, 128, 16383, 16384]) {
      const mm = metaMessage(0x01, new Uint8Array(size));
      expect(messageLength(mm), `payload of ${size} bytes`).toBe(messageBytes(mm).length);
    }
  });
});

// ---------------------------------------------------------------------------
// SysexMessage
// ---------------------------------------------------------------------------
describe('SysexMessage', () => {
  it('should keep an empty F0 ... F7 frame', () => {
    const sx = sysexMessage(new Uint8Array([0xf0, 0xf7]));
    expect(Array.from(messageBytes(sx))).toEqual([0xf0, 0xf7]);
    expect(messageStatus(sx)).toBe(0xf0);
  });

  it('should keep the bytes it was given', () => {
    const sx = sysexMessage(new Uint8Array([0xf0, 0x7e, 0x7f, 0x09, 0x01, 0xf7]));
    expect(Array.from(messageBytes(sx))).toEqual([0xf0, 0x7e, 0x7f, 0x09, 0x01, 0xf7]);
    expect(messageLength(sx)).toBe(6);
  });

  it('should report status 0 for a message without any bytes', () => {
    const sx = sysexMessage(new Uint8Array(0));
    expect(messageLength(sx)).toBe(0);
    expect(messageStatus(sx)).toBe(0);
  });

  it('should copy the bytes it is handed', () => {
    const source = new Uint8Array([0xf0, 0x01, 0xf7]);
    const sx = sysexMessage(source);
    source[1] = 0x02;
    expect(Array.from(messageBytes(sx))).toEqual([0xf0, 0x01, 0xf7]);
  });
});

// ---------------------------------------------------------------------------
// MidiEvent
// ---------------------------------------------------------------------------
describe('MidiEvent', () => {
  it('should carry a message and a tick', () => {
    const msg = channelMessage(ShortMessage.NOTE_ON, 0, 60, 100);
    const event = new MidiEvent(msg, 480);
    expect(event.getMessage()).toBe(msg);
    expect(event.getTick()).toBe(480);
  });

  it('should allow the tick to be moved', () => {
    const event = new MidiEvent(anyMessage(), 0);
    event.setTick(960);
    expect(event.getTick()).toBe(960);
  });

  it('should swap the message in place', () => {
    // What `ShortMessage.setMessage` used to do, one level up: this is the operation
    // `Midi.noteOns2NoteOffs` performs, and it must not disturb the event's position.
    const event = new MidiEvent(channelMessage(ShortMessage.NOTE_ON, 0, 60, 100), 480);
    event.setMessage(channelMessage(ShortMessage.NOTE_OFF, 5, 62, 0));

    const msg = event.getMessage();
    expect(msg.kind).toBe('short');
    expect(shortCommand(msg as ShortMessage)).toBe(ShortMessage.NOTE_OFF);
    expect(shortChannel(msg as ShortMessage)).toBe(5);
    expect(shortData1(msg as ShortMessage)).toBe(62);
    expect(shortData2(msg as ShortMessage)).toBe(0);
    expect(event.getTick()).toBe(480);
  });

  it('should leave the replaced message intact, so a second holder still reads it', () => {
    // Why `Midi.cloneSequence` may share messages between the original and the copy.
    const original = channelMessage(ShortMessage.NOTE_ON, 2, 60, 100);
    const copy = new MidiEvent(original, 0);
    copy.setMessage(channelMessage(ShortMessage.NOTE_OFF, 2, 60, 0));

    expect(shortCommand(original)).toBe(ShortMessage.NOTE_ON);
    expect(shortCommand(copy.getMessage() as ShortMessage)).toBe(ShortMessage.NOTE_OFF);
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
    track.add(new MidiEvent(anyMessage(), 960));
    track.add(new MidiEvent(anyMessage(), 0));
    track.add(new MidiEvent(anyMessage(), 480));

    expect([track.get(0).getTick(), track.get(1).getTick(), track.get(2).getTick()]).toEqual([
      0, 480, 960,
    ]);
    expect(track.ticks()).toBe(960);
  });

  it('should preserve insertion order among events on the same tick', () => {
    // this is what keeps a program change in front of the noteOn it applies to
    const track = new Track();
    const programChange = new MidiEvent(channelMessage(ShortMessage.PROGRAM_CHANGE, 0, 42, 0), 0);
    const noteOn = new MidiEvent(channelMessage(ShortMessage.NOTE_ON, 0, 60, 100), 0);
    track.add(programChange);
    track.add(noteOn);

    expect(track.get(0)).toBe(programChange);
    expect(track.get(1)).toBe(noteOn);
  });

  it('should report success when adding an event', () => {
    const track = new Track();
    expect(track.add(new MidiEvent(anyMessage(), 0))).toBe(true);
  });

  it('should remove an event it contains and report it', () => {
    const track = new Track();
    const a = new MidiEvent(anyMessage(), 0);
    const b = new MidiEvent(anyMessage(), 480);
    track.add(a);
    track.add(b);

    expect(track.remove(a)).toBe(true);
    expect(track.size()).toBe(1);
    expect(track.get(0)).toBe(b);
  });

  it('should report failure when removing an event it does not contain', () => {
    const track = new Track();
    track.add(new MidiEvent(anyMessage(), 0));
    expect(track.remove(new MidiEvent(anyMessage(), 0))).toBe(false);
    expect(track.size()).toBe(1);
  });

  // `Track.get` used to return `undefined` out of range while declaring `MidiEvent`, with
  // a comment admitting it. The JDK's `Track.get` throws `ArrayIndexOutOfBoundsException`,
  // so this is the port catching up with its reference as well as with its own signature;
  // the message has to name the index and the size, because the whole value of the throw
  // over a silent `undefined` is that it says which read went wrong.
  it('should throw a RangeError rather than hand back an undefined event', () => {
    const track = new Track();
    track.add(new MidiEvent(anyMessage(), 0));
    track.add(new MidiEvent(anyMessage(), 480));

    expect(() => track.get(2)).toThrow(RangeError);
    expect(() => track.get(2)).toThrow(/index 2 .* 2 events/);
    expect(() => track.get(-1)).toThrow(RangeError);
  });

  // The iterator is what lets a caller walk a track without inventing an index, which is
  // how every loop in `Midi.ts` now reads it. It must agree with `get`/`size` exactly —
  // same events, same order, same identities.
  it('should iterate its events in tick order, matching get()', () => {
    const track = new Track();
    const events = [
      new MidiEvent(anyMessage(), 960),
      new MidiEvent(anyMessage(), 0),
      new MidiEvent(anyMessage(), 480),
    ];
    for (const event of events) track.add(event);

    expect([...track]).toEqual([events[1], events[2], events[0]]);
    expect([...track].length).toBe(track.size());
    expect([...track].every((event, index) => event === track.get(index))).toBe(true);
  });

  it('should iterate nothing for an empty track', () => {
    expect([...new Track()]).toEqual([]);
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
      const event = new MidiEvent(anyMessage(), tick);
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
    const finite = new MidiEvent(anyMessage(), 480);
    const nonFinite = new MidiEvent(anyMessage(), Number.NaN);
    const later = new MidiEvent(anyMessage(), 0);
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
    for (const tick of [500, 100, 900, 300]) track.add(new MidiEvent(anyMessage(), tick));
    expect(track.ticks()).toBe(900);
  });

  it('stays sorted across a remove, so later adds still land correctly', () => {
    const track = new Track();
    const middle = new MidiEvent(anyMessage(), 480);
    track.add(new MidiEvent(anyMessage(), 0));
    track.add(middle);
    track.add(new MidiEvent(anyMessage(), 960));
    track.remove(middle);
    track.add(new MidiEvent(anyMessage(), 240));
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
        track.add(new MidiEvent(metaMessage(0x01, new Uint8Array([65])), date));
        track.add(new MidiEvent(channelMessage(ShortMessage.NOTE_ON, 0, 60, 100), date));
        track.add(new MidiEvent(channelMessage(ShortMessage.NOTE_OFF, 0, 60, 0), date + 35));
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
    const ratio = bestGrowthRatio(() => perBuild(16000) / perBuild(1000), 64);
    expect(ratio).toBeLessThan(64);
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
    t0.add(new MidiEvent(anyMessage(), 480));
    t1.add(new MidiEvent(anyMessage(), 1920));

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
    track.add(new MidiEvent(anyMessage(), 1920)); // 4 quarter notes

    // 4 quarters at 500000 microseconds each
    expect(seq.getMicrosecondLength()).toBe(2000000);
  });

  it('should be 0 for an empty sequence', () => {
    expect(new Sequence(Sequence.PPQ, 480).getMicrosecondLength()).toBe(0);
  });

  it('should apply a tempo event from tick 0 onwards', () => {
    const seq = new Sequence(Sequence.PPQ, 480);
    const track = seq.createTrack();
    track.add(EventMaker.createTempo(0, 60, 0.25)); // 1000000 microseconds per quarter
    track.add(new MidiEvent(anyMessage(), 1920)); // 4 quarter notes

    expect(seq.getMicrosecondLength()).toBe(4000000);
  });

  it('should switch tempo at the tick of a later tempo event', () => {
    const seq = new Sequence(Sequence.PPQ, 480);
    const track = seq.createTrack();
    track.add(EventMaker.createTempo(0, 120, 0.25)); // 500000 us/quarter
    track.add(EventMaker.createTempo(960, 60, 0.25)); // 1000000 us/quarter from quarter 2 on
    track.add(new MidiEvent(anyMessage(), 1920));

    // 2 quarters at 500000 + 2 quarters at 1000000
    expect(seq.getMicrosecondLength()).toBe(3000000);
  });

  it('should collect tempo events across all tracks in tick order', () => {
    const seq = new Sequence(Sequence.PPQ, 480);
    const conductor = seq.createTrack();
    const music = seq.createTrack();
    conductor.add(EventMaker.createTempo(960, 60, 0.25));
    conductor.add(EventMaker.createTempo(0, 120, 0.25));
    music.add(new MidiEvent(anyMessage(), 1920));

    expect(seq.getMicrosecondLength()).toBe(3000000);
  });
});
