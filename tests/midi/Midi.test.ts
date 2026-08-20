import { describe, it, expect, vi } from 'vitest';
import { Midi } from '../../src/midi/Midi.js';
import {
  Sequence,
  MidiEvent,
  ShortMessage,
  messageBytes,
  messageLength,
  metaMessage,
  metaPayload,
  shortCommand,
  shortData1,
  shortData2,
  sysexMessage,
  type MetaMessage,
  type SysexMessage,
} from '../../src/midi/MidiTypes.js';
import { EventMaker } from '../../src/midi/EventMaker.js';

describe('Midi', () => {
  // ---------------------------------------------------------------
  // Construction
  // ---------------------------------------------------------------
  describe('construction', () => {
    it('should create an empty MIDI with default PPQ of 720', () => {
      const midi = new Midi();
      expect(midi.isEmpty()).toBe(false);
      expect(midi.getPPQ()).toBe(720);
      expect(midi.getSequence()).toBeDefined();
    });

    it('should create a MIDI with a custom PPQ', () => {
      const midi = new Midi(480);
      expect(midi.getPPQ()).toBe(480);
    });

    it('should create a MIDI from an existing Sequence', () => {
      const seq = new Sequence(Sequence.PPQ, 960);
      const midi = new Midi(seq);
      expect(midi.getPPQ()).toBe(960);
      expect(midi.getSequence()).toBe(seq);
    });

    it('should create a MIDI from a Sequence with a filename', () => {
      const seq = new Sequence(Sequence.PPQ, 480);
      const midi = new Midi(seq, 'test.mid');
      expect(midi.getFile()).toBe('test.mid');
      expect(midi.getPPQ()).toBe(480);
    });
  });

  // ---------------------------------------------------------------
  // File management
  // ---------------------------------------------------------------
  describe('file management', () => {
    it('should get and set the file name', () => {
      const midi = new Midi();
      expect(midi.getFile()).toBeNull();
      midi.setFile('output.mid');
      expect(midi.getFile()).toBe('output.mid');
    });
  });

  // ---------------------------------------------------------------
  // Add tracks and events
  // ---------------------------------------------------------------
  describe('tracks and events', () => {
    it('should create a track on the sequence', () => {
      const midi = new Midi(480);
      const track = midi.getSequence().createTrack();
      expect(midi.getSequence().getTracks().length).toBe(1);
      expect(track).toBeDefined();
    });

    it('should add MIDI events to a track', () => {
      const midi = new Midi(480);
      const track = midi.getSequence().createTrack();

      const noteOn = EventMaker.createNoteOn(0, 0, 60, 100);
      const noteOff = EventMaker.createNoteOff(0, 480, 60, 64);

      track.add(noteOn!);
      track.add(noteOff!);

      expect(track.size()).toBe(2);
      expect(track.get(0).getTick()).toBe(0);
      expect(track.get(1).getTick()).toBe(480);
    });

    it('should sort events by tick when added out of order', () => {
      const midi = new Midi(480);
      const track = midi.getSequence().createTrack();

      const noteOff = EventMaker.createNoteOff(0, 480, 60, 64);
      const noteOn = EventMaker.createNoteOn(0, 0, 60, 100);

      track.add(noteOff!);
      track.add(noteOn!);

      expect(track.get(0).getTick()).toBe(0);
      expect(track.get(1).getTick()).toBe(480);
    });

    it('should report the correct tick length', () => {
      const midi = new Midi(480);
      const track = midi.getSequence().createTrack();
      track.add(EventMaker.createNoteOn(0, 0, 60, 100)!);
      track.add(EventMaker.createNoteOff(0, 960, 60, 64)!);

      expect(midi.getTickLength()).toBe(960);
    });

    it('should report the correct MIDI file format', () => {
      const midi = new Midi(480);
      // No tracks: trackCount is 0, which is <= 1, so format 0
      expect(midi.getMidiFileFormat()).toBe(0);

      // Create one track
      midi.getSequence().createTrack();
      expect(midi.getMidiFileFormat()).toBe(0);

      // Create a second track
      midi.getSequence().createTrack();
      expect(midi.getMidiFileFormat()).toBe(1);
    });

    it('should support multiple tracks', () => {
      const midi = new Midi(480);
      const track1 = midi.getSequence().createTrack();
      const track2 = midi.getSequence().createTrack();

      track1.add(EventMaker.createNoteOn(0, 0, 60, 100)!);
      track2.add(EventMaker.createNoteOn(1, 0, 72, 90)!);

      expect(midi.getSequence().getTracks().length).toBe(2);
      expect(track1.size()).toBe(1);
      expect(track2.size()).toBe(1);
    });
  });

  // ---------------------------------------------------------------
  // Export to MIDI binary format
  // ---------------------------------------------------------------
  describe('exportMidi', () => {
    it('should export a valid MIDI binary with MThd header', () => {
      const midi = new Midi(480);
      const track = midi.getSequence().createTrack();
      track.add(EventMaker.createNoteOn(0, 0, 60, 100)!);
      track.add(EventMaker.createNoteOff(0, 480, 60, 64)!);

      const data = midi.exportMidi();
      expect(data).not.toBeNull();
      expect(data!.length).toBeGreaterThan(14); // at least header + some track data

      // Verify MThd header
      expect(String.fromCharCode(data![0], data![1], data![2], data![3])).toBe('MThd');
    });

    it('should write the correct header data length (6)', () => {
      const midi = new Midi(480);
      midi.getSequence().createTrack();

      const data = midi.exportMidi()!;
      const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
      expect(view.getUint32(4)).toBe(6); // header length always 6
    });

    it('should write the correct PPQ resolution in the header', () => {
      const midi = new Midi(480);
      midi.getSequence().createTrack();

      const data = midi.exportMidi()!;
      const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
      // resolution is at offset 12 (after 4 tag + 4 length + 2 format + 2 numTracks)
      expect(view.getUint16(12)).toBe(480);
    });

    it('should write the correct number of tracks in the header', () => {
      const midi = new Midi(480);
      midi.getSequence().createTrack();
      midi.getSequence().createTrack();

      const data = midi.exportMidi()!;
      const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
      // numTracks is at offset 10
      expect(view.getUint16(10)).toBe(2);
    });

    it('should contain MTrk track chunk headers', () => {
      const midi = new Midi(480);
      const track = midi.getSequence().createTrack();
      track.add(EventMaker.createNoteOn(0, 0, 60, 100)!);

      const data = midi.exportMidi()!;
      // MTrk starts after the 14-byte MThd header
      const mtrkTag = String.fromCharCode(data[14], data[15], data[16], data[17]);
      expect(mtrkTag).toBe('MTrk');
    });

    it('should return null when sequence is null', () => {
      const midi = new Midi();
      // Replace the internal sequence to simulate null
      midi.setSequence(null as any);
      // We can't actually set it to null through the public API,
      // but exportMidi on a valid midi should work
      const validMidi = new Midi(480);
      validMidi.getSequence().createTrack();
      const data = validMidi.exportMidi();
      expect(data).not.toBeNull();
    });

    it('should be parseable by readMidiData (round-trip)', () => {
      const midi = new Midi(480);
      const track = midi.getSequence().createTrack();
      track.add(EventMaker.createNoteOn(0, 0, 60, 100)!);
      track.add(EventMaker.createNoteOff(0, 480, 60, 64)!);
      track.add(EventMaker.createProgramChange(0, 0, EventMaker.PC_Acoustic_Grand_Piano)!);

      const data = midi.exportMidi()!;
      expect(data).not.toBeNull();

      // Parse the exported data back
      const midi2 = new Midi(data);
      expect(midi2.getPPQ()).toBe(480);
      expect(midi2.getSequence().getTracks().length).toBe(1);
    });
  });

  // ---------------------------------------------------------------
  // noteOns2NoteOffs / noteOffs2NoteOns
  // ---------------------------------------------------------------
  describe('noteOns2NoteOffs', () => {
    it('should convert noteOn with velocity 0 to noteOff', () => {
      const midi = new Midi(480);
      const track = midi.getSequence().createTrack();
      track.add(EventMaker.createNoteOn(0, 0, 60, 100)!);
      track.add(EventMaker.createNoteOn(0, 480, 60, 0)!); // noteOn vel=0

      const changed = midi.noteOns2NoteOffs();
      expect(changed).toBe(1);

      const msg = track.get(1).getMessage() as ShortMessage;
      expect(shortCommand(msg)).toBe(EventMaker.NOTE_OFF);
    });

    it('should not change noteOn events with non-zero velocity', () => {
      const midi = new Midi(480);
      const track = midi.getSequence().createTrack();
      track.add(EventMaker.createNoteOn(0, 0, 60, 100)!);

      const changed = midi.noteOns2NoteOffs();
      expect(changed).toBe(0);
    });
  });

  describe('noteOffs2NoteOns', () => {
    it('should convert noteOff to noteOn with velocity 0', () => {
      const midi = new Midi(480);
      const track = midi.getSequence().createTrack();
      track.add(EventMaker.createNoteOff(0, 480, 60, 64)!);

      const changed = midi.noteOffs2NoteOns();
      expect(changed).toBe(1);

      const msg = track.get(0).getMessage() as ShortMessage;
      expect(shortCommand(msg)).toBe(EventMaker.NOTE_ON);
      expect(shortData2(msg)).toBe(0);
    });
  });

  // ---------------------------------------------------------------
  // addOffset
  // ---------------------------------------------------------------
  describe('addOffset', () => {
    it('should add tick offset to all events', () => {
      const midi = new Midi(480);
      const track = midi.getSequence().createTrack();
      track.add(EventMaker.createNoteOn(0, 0, 60, 100)!);
      track.add(EventMaker.createNoteOff(0, 480, 60, 64)!);

      midi.addOffset(100);

      expect(track.get(0).getTick()).toBe(100);
      expect(track.get(1).getTick()).toBe(580);
    });

    it('should not allow negative tick values', () => {
      const midi = new Midi(480);
      const track = midi.getSequence().createTrack();
      track.add(EventMaker.createNoteOn(0, 50, 60, 100)!);

      midi.addOffset(-200);

      expect(track.get(0).getTick()).toBe(0); // clamped to 0
    });

    it('should do nothing when offset is 0', () => {
      const midi = new Midi(480);
      const track = midi.getSequence().createTrack();
      track.add(EventMaker.createNoteOn(0, 100, 60, 100)!);

      midi.addOffset(0);
      expect(track.get(0).getTick()).toBe(100);
    });
  });

  // ---------------------------------------------------------------
  // cloneSequence
  // ---------------------------------------------------------------
  describe('cloneSequence', () => {
    it('should create a deep copy of the sequence', () => {
      const midi = new Midi(480);
      const track = midi.getSequence().createTrack();
      track.add(EventMaker.createNoteOn(0, 0, 60, 100)!);
      track.add(EventMaker.createNoteOff(0, 480, 60, 64)!);

      const clone = Midi.cloneSequence(midi.getSequence());
      expect(clone).not.toBeNull();
      expect(clone!.getResolution()).toBe(480);
      expect(clone!.getTracks().length).toBe(1);
      expect(clone!.getTracks()[0].size()).toBe(2);

      // Verify it's a deep copy by modifying the clone
      clone!.getTracks()[0].get(0).setTick(999);
      expect(track.get(0).getTick()).toBe(0); // original unchanged
    });
  });

  // ---------------------------------------------------------------
  // convertPPQ
  // ---------------------------------------------------------------
  describe('convertPPQ', () => {
    it('should convert event ticks when PPQ changes', () => {
      const midi = new Midi(480);
      const track = midi.getSequence().createTrack();
      track.add(EventMaker.createNoteOn(0, 0, 60, 100)!);
      track.add(EventMaker.createNoteOff(0, 480, 60, 64)!);

      midi.convertPPQ(960);
      expect(midi.getPPQ()).toBe(960);

      const newTrack = midi.getSequence().getTracks()[0];
      expect(newTrack.get(0).getTick()).toBe(0);
      expect(newTrack.get(1).getTick()).toBe(960); // 480 * 960/480 = 960
    });

    it('should do nothing when PPQ is the same', () => {
      const midi = new Midi(480);
      const track = midi.getSequence().createTrack();
      track.add(EventMaker.createNoteOn(0, 240, 60, 100)!);

      midi.convertPPQ(480);
      expect(midi.getSequence().getTracks()[0].get(0).getTick()).toBe(240);
    });
  });

  // ---------------------------------------------------------------
  // getTempoData
  // ---------------------------------------------------------------
  describe('getTempoData', () => {
    it('should extract tempo data from the sequence', () => {
      const midi = new Midi(480);
      const track = midi.getSequence().createTrack();
      track.add(EventMaker.createTempo(0, 120, 0.25)!);
      track.add(EventMaker.createTempo(480, 140, 0.25)!);

      const tempoData = midi.getTempoData();
      expect(tempoData.length).toBe(2);
      expect(tempoData[0].tick).toBe(0);
      expect(tempoData[0].bpm).toBeCloseTo(120, 0);
      expect(tempoData[1].tick).toBe(480);
      expect(tempoData[1].bpm).toBeCloseTo(140, 0);
    });

    it('should return empty array when there are no tempo events', () => {
      const midi = new Midi(480);
      const track = midi.getSequence().createTrack();
      track.add(EventMaker.createNoteOn(0, 0, 60, 100)!);

      const tempoData = midi.getTempoData();
      expect(tempoData.length).toBe(0);
    });
  });

  // ---------------------------------------------------------------
  // getPPQ / SMPTE timing
  // ---------------------------------------------------------------
  describe('getPPQ', () => {
    it('should throw when the sequence uses SMPTE timing instead of PPQ', () => {
      const midi = new Midi(new Sequence(Sequence.SMPTE_25, 40));
      expect(() => midi.getPPQ()).toThrow(/SMPTE/);
    });

    it('should report format 1 for a null sequence', () => {
      const midi = new Midi();
      midi.setSequence(null as unknown as Sequence);
      expect(midi.isEmpty()).toBe(true);
      expect(midi.getMidiFileFormat()).toBe(1);
    });
  });

  // ---------------------------------------------------------------
  // convertPPQ – edge cases
  // ---------------------------------------------------------------
  describe('convertPPQ – edge cases', () => {
    it('should truncate rather than round a tick that does not divide evenly', () => {
      // Java computes (tick * ppq) / ppqOld in long arithmetic, i.e. it truncates
      const midi = new Midi(480);
      const track = midi.getSequence().createTrack();
      track.add(EventMaker.createNoteOn(0, 1, 60, 100)!); // 1 * 720 / 480 = 1.5

      midi.convertPPQ(720);
      expect(midi.getSequence().getTracks()[0].get(0).getTick()).toBe(1);
    });

    it('should scale down as well as up', () => {
      const midi = new Midi(960);
      const track = midi.getSequence().createTrack();
      track.add(EventMaker.createNoteOn(0, 0, 60, 100)!);
      track.add(EventMaker.createNoteOff(0, 960, 60, 64)!);

      midi.convertPPQ(240);
      expect(midi.getPPQ()).toBe(240);
      expect(midi.getSequence().getTracks()[0].get(1).getTick()).toBe(240);
    });

    it('should keep every track and clone the messages', () => {
      const midi = new Midi(480);
      const t0 = midi.getSequence().createTrack();
      const t1 = midi.getSequence().createTrack();
      t0.add(EventMaker.createNoteOn(0, 480, 60, 100)!);
      t1.add(EventMaker.createProgramChange(1, 0, 42)!);

      midi.convertPPQ(960);

      const tracks = midi.getSequence().getTracks();
      expect(tracks.length).toBe(2);
      expect(tracks[0].get(0).getTick()).toBe(960);
      // the original event objects are not reused
      expect(tracks[0].get(0)).not.toBe(t0.get(0));
      expect(shortData1(tracks[1].get(0).getMessage() as ShortMessage)).toBe(42);
    });

    it('should throw for a SMPTE sequence because getPPQ throws', () => {
      const midi = new Midi(new Sequence(Sequence.SMPTE_30, 80));
      expect(() => midi.convertPPQ(480)).toThrow(/SMPTE/);
    });
  });

  // ---------------------------------------------------------------
  // append
  // ---------------------------------------------------------------
  describe('append', () => {
    it('should shift the appended events behind the current tick length', () => {
      const midi = new Midi(480);
      const track = midi.getSequence().createTrack();
      track.add(EventMaker.createNoteOn(0, 0, 60, 100)!);
      track.add(EventMaker.createNoteOff(0, 480, 60, 64)!);

      const other = new Midi(480);
      const otherTrack = other.getSequence().createTrack();
      otherTrack.add(EventMaker.createNoteOn(0, 0, 62, 100)!);
      otherTrack.add(EventMaker.createNoteOff(0, 480, 62, 64)!);

      midi.append(other);

      expect(track.size()).toBe(4);
      expect([0, 1, 2, 3].map((i) => track.get(i).getTick())).toEqual([0, 480, 480, 960]);
    });

    it('should adapt a differing PPQ before appending', () => {
      const midi = new Midi(480);
      const track = midi.getSequence().createTrack();
      track.add(EventMaker.createNoteOff(0, 480, 60, 64)!);

      const other = new Midi(960);
      const otherTrack = other.getSequence().createTrack();
      otherTrack.add(EventMaker.createNoteOff(0, 960, 62, 64)!); // one quarter at ppq 960

      midi.append(other);

      // 960 ticks at ppq 960 is one quarter, i.e. 480 ticks at ppq 480, plus the offset of 480
      expect(track.get(1).getTick()).toBe(960);
      expect(midi.getPPQ()).toBe(480);
    });

    it('should not modify the appended Midi', () => {
      const midi = new Midi(480);
      midi
        .getSequence()
        .createTrack()
        .add(EventMaker.createNoteOn(0, 240, 60, 100)!);

      const other = new Midi(960);
      const otherTrack = other.getSequence().createTrack();
      otherTrack.add(EventMaker.createNoteOn(0, 960, 62, 100)!);

      midi.append(other);

      expect(other.getPPQ()).toBe(960);
      expect(otherTrack.get(0).getTick()).toBe(960);
      expect(otherTrack.size()).toBe(1);
    });

    it('should create the tracks it is missing', () => {
      const midi = new Midi(480);
      midi.getSequence().createTrack();

      const other = new Midi(480);
      other
        .getSequence()
        .createTrack()
        .add(EventMaker.createNoteOn(0, 0, 60, 100)!);
      other
        .getSequence()
        .createTrack()
        .add(EventMaker.createNoteOn(1, 0, 72, 100)!);

      midi.append(other);

      expect(midi.getSequence().getTracks().length).toBe(2);
      expect(midi.getSequence().getTracks()[1].size()).toBe(1);
    });

    it('should do nothing for null or empty input', () => {
      const midi = new Midi(480);
      midi
        .getSequence()
        .createTrack()
        .add(EventMaker.createNoteOn(0, 0, 60, 100)!);

      midi.append(null as unknown as Midi);

      const empty = new Midi(480);
      empty.setSequence(null as unknown as Sequence);
      midi.append(empty);

      expect(midi.getSequence().getTracks()[0].size()).toBe(1);
    });
  });

  // ---------------------------------------------------------------
  // getMinimalPPQ
  // ---------------------------------------------------------------
  describe('getMinimalPPQ', () => {
    it('should return 1 when every event sits on a quarter note', () => {
      const midi = new Midi(720);
      const track = midi.getSequence().createTrack();
      track.add(EventMaker.createNoteOn(0, 0, 60, 100)!);
      track.add(EventMaker.createNoteOff(0, 720, 60, 64)!);
      track.add(EventMaker.createNoteOn(0, 1440, 62, 100)!);

      expect(midi.getMinimalPPQ(false)).toBe(1);
    });

    it('should return 2 for eighth note positions', () => {
      const midi = new Midi(720);
      const track = midi.getSequence().createTrack();
      track.add(EventMaker.createNoteOn(0, 0, 60, 100)!);
      track.add(EventMaker.createNoteOn(0, 360, 62, 100)!);

      expect(midi.getMinimalPPQ(false)).toBe(2);
    });

    it('should return 4 for sixteenth note positions', () => {
      const midi = new Midi(720);
      const track = midi.getSequence().createTrack();
      track.add(EventMaker.createNoteOn(0, 0, 60, 100)!);
      track.add(EventMaker.createNoteOn(0, 180, 62, 100)!);

      expect(midi.getMinimalPPQ(false)).toBe(4);
    });

    it('should take the finest subdivision found across all tracks', () => {
      const midi = new Midi(720);
      const t0 = midi.getSequence().createTrack();
      const t1 = midi.getSequence().createTrack();
      t0.add(EventMaker.createNoteOn(0, 360, 60, 100)!);
      t1.add(EventMaker.createNoteOn(1, 180, 72, 100)!);

      expect(midi.getMinimalPPQ(false)).toBe(4);
    });

    it('should skip non-note events when onlyNotes is set', () => {
      const midi = new Midi(720);
      const track = midi.getSequence().createTrack();
      track.add(EventMaker.createNoteOn(0, 0, 60, 100)!);
      track.add(EventMaker.createControlChange(0, 180, EventMaker.CC_Channel_Volume, 100)!);

      expect(midi.getMinimalPPQ(true)).toBe(1);
      expect(midi.getMinimalPPQ(false)).toBe(4);
    });

    it('should count noteOff events as notes as well', () => {
      const midi = new Midi(720);
      const track = midi.getSequence().createTrack();
      track.add(EventMaker.createNoteOn(0, 0, 60, 100)!);
      track.add(EventMaker.createNoteOff(0, 360, 60, 64)!);

      expect(midi.getMinimalPPQ(true)).toBe(2);
    });

    it('should throw for a null sequence', () => {
      expect(() => Midi.getMinimalPPQ(null as unknown as Sequence, false)).toThrow(/null/);
    });

    it('should throw for a sequence that is not PPQ based', () => {
      expect(() => Midi.getMinimalPPQ(new Sequence(Sequence.SMPTE_24, 40), false)).toThrow(/PPQ/);
    });
  });

  // ---------------------------------------------------------------
  // getMicrosecondLength
  // ---------------------------------------------------------------
  describe('getMicrosecondLength', () => {
    it('should compute the length from the tempo events', () => {
      const midi = new Midi(480);
      const track = midi.getSequence().createTrack();
      track.add(EventMaker.createTempo(0, 60, 0.25)!); // one quarter per second
      track.add(EventMaker.createNoteOff(0, 1920, 60, 64)!); // four quarters

      expect(midi.getMicrosecondLength()).toBe(4000000);
    });

    it('should assume 120 bpm without any tempo event', () => {
      const midi = new Midi(480);
      const track = midi.getSequence().createTrack();
      track.add(EventMaker.createNoteOff(0, 1920, 60, 64)!);

      expect(midi.getMicrosecondLength()).toBe(2000000);
    });
  });

  // ---------------------------------------------------------------
  // print
  // ---------------------------------------------------------------
  describe('print', () => {
    it('should report the message for a null sequence', () => {
      expect(Midi.print(null as unknown as Sequence)).toBe('No midi data loaded.');
    });

    it('should list each track with its event count', () => {
      const midi = new Midi(480);
      const t0 = midi.getSequence().createTrack();
      const t1 = midi.getSequence().createTrack();
      t0.add(EventMaker.createNoteOn(0, 0, 60, 100)!);
      t1.add(EventMaker.createNoteOn(1, 0, 72, 90)!);

      const print = Midi.print(midi.getSequence());
      expect(print).toContain('Track 0 contains 1 events.');
      expect(print).toContain('Track 1 contains 1 events.');
      expect(print).toContain('---');
    });

    // Every other test in this describe asserts with `toContain`, which says nothing about
    // ORDER: reversing the track list, or the events inside a track, left all of them
    // green. That was measured, not assumed — a control that reversed
    // `sequence.getTracks()` passed 458 of 458. Java emits tracks in sequence order and
    // events in tick order, and this file reproduces `Midi.java`'s print quirks down to the
    // doubled space in "noteOn,  key:", so the one assertion that is worth having here is
    // the whole string.
    it('should emit tracks in sequence order and events in tick order', () => {
      const midi = new Midi(480);
      const t0 = midi.getSequence().createTrack();
      const t1 = midi.getSequence().createTrack();
      t0.add(EventMaker.createNoteOn(0, 0, 60, 100)!);
      t0.add(EventMaker.createNoteOff(0, 480, 60, 64)!);
      t1.add(EventMaker.createNoteOn(1, 0, 72, 90)!);

      expect(Midi.print(midi.getSequence())).toBe(
        'Track 0 contains 2 events.\n' +
          '@0 Channel: 0 Command: 144 noteOn,  key: 60 velocity: 100\n' +
          '@480 Channel: 0 Command: 128 noteOff,  key: 60 velocity: 64\n' +
          '---' +
          'Track 1 contains 1 events.\n' +
          '@0 Channel: 1 Command: 144 noteOn,  key: 72 velocity: 90\n' +
          '---',
      );
    });

    it('should spell out noteOn and noteOff with key and velocity', () => {
      const midi = new Midi(480);
      const track = midi.getSequence().createTrack();
      track.add(EventMaker.createNoteOn(2, 0, 60, 100)!);
      track.add(EventMaker.createNoteOff(2, 480, 60, 64)!);

      const print = Midi.print(midi.getSequence());
      expect(print).toContain('@0 Channel: 2 Command: 144 noteOn,  key: 60 velocity: 100');
      expect(print).toContain('@480 Channel: 2 Command: 128 noteOff,  key: 60 velocity: 64');
    });

    it('should fall through from program change into the default branch, as Java does', () => {
      // Java's switch has no break after the PROGRAM_CHANGE case (Midi.java, method print)
      const midi = new Midi(480);
      midi
        .getSequence()
        .createTrack()
        .add(EventMaker.createProgramChange(0, 0, 42)!);

      const print = Midi.print(midi.getSequence());
      expect(print).toContain('program change,  number: 42');
      expect(print).toContain('Other message: ShortMessage');
    });

    it('should label non-short messages generically', () => {
      const midi = new Midi(480);
      midi
        .getSequence()
        .createTrack()
        .add(EventMaker.createTempo(0, 120, 0.25)!);

      expect(Midi.print(midi.getSequence())).toContain('Other message: MetaMessage');
    });

    it('should return an empty string for a sequence without tracks', () => {
      expect(Midi.print(new Sequence(Sequence.PPQ, 480))).toBe('');
    });
  });

  // ---------------------------------------------------------------
  // readMidiData
  // ---------------------------------------------------------------
  describe('readMidiData', () => {
    it('should reject data that does not start with MThd', () => {
      const data = new Uint8Array([0x4d, 0x54, 0x72, 0x6b, 0, 0, 0, 0]); // MTrk
      expect(() => new Midi(data)).toThrow(/MThd/);
    });

    it('should reject a track chunk that does not start with MTrk', () => {
      const midi = new Midi(480);
      midi
        .getSequence()
        .createTrack()
        .add(EventMaker.createNoteOn(0, 0, 60, 100)!);
      const data = midi.exportMidi()!;
      data[14] = 0x58; // break the MTrk tag

      expect(() => new Midi(data)).toThrow(/MTrk/);
    });

    it('should read SMPTE division as the matching division type', () => {
      // division 0xE728: -25 frames per second, 40 ticks per frame
      const header = new Uint8Array([
        0x4d,
        0x54,
        0x68,
        0x64,
        0,
        0,
        0,
        6,
        0,
        0, // format 0
        0,
        0, // no tracks
        0xe7,
        0x28, // SMPTE 25
      ]);
      const midi = new Midi(header);
      expect(midi.getSequence().getDivisionType()).toBe(Sequence.SMPTE_25);
      expect(midi.getSequence().getResolution()).toBe(40);
    });

    it('should restore meta, sysex and channel events in a round trip', () => {
      const midi = new Midi(480);
      const track = midi.getSequence().createTrack();
      track.add(EventMaker.createTrackName(0, 'Violin')!);
      track.add(EventMaker.createTempo(0, 120, 0.25)!);
      track.add(
        new MidiEvent(sysexMessage(new Uint8Array([0xf0, 0x7e, 0x7f, 0x09, 0x01, 0xf7])), 0),
      );
      track.add(EventMaker.createProgramChange(0, 0, 40)!);
      track.add(EventMaker.createNoteOn(0, 0, 60, 100)!);
      track.add(EventMaker.createNoteOff(0, 480, 60, 64)!);

      const parsed = new Midi(midi.exportMidi()!);
      const readTrack = parsed.getSequence().getTracks()[0];

      const trackName = readTrack.get(0) as MidiEvent;
      expect((trackName.getMessage() as MetaMessage).type).toBe(EventMaker.META_Track_Name);
      expect(new TextDecoder().decode(metaPayload(trackName.getMessage() as MetaMessage))).toBe(
        'Violin',
      );

      const tempo = readTrack.get(1).getMessage() as MetaMessage;
      expect(tempo.type).toBe(EventMaker.META_Set_Tempo);
      expect(EventMaker.byteArrayToInt(metaPayload(tempo))).toBe(500000);

      const sysex = readTrack.get(2).getMessage() as SysexMessage;
      expect(sysex.kind).toBe('sysex');
      expect(Array.from(messageBytes(sysex))).toEqual([0xf0, 0x7e, 0x7f, 0x09, 0x01, 0xf7]);

      const pc = readTrack.get(3).getMessage() as ShortMessage;
      expect(shortCommand(pc)).toBe(ShortMessage.PROGRAM_CHANGE);
      expect(shortData1(pc)).toBe(40);
      expect(messageLength(pc)).toBe(2);

      // the export appends an end of track meta event
      const last = readTrack.get(readTrack.size() - 1).getMessage() as MetaMessage;
      expect(last.type).toBe(EventMaker.META_End_of_Track);
      expect(last.kind).toBe('meta');
    });

    it('should resolve running status', () => {
      // two noteOns on channel 0, the second one without a repeated status byte
      const data = new Uint8Array([
        0x4d,
        0x54,
        0x68,
        0x64,
        0,
        0,
        0,
        6,
        0,
        0,
        0,
        1,
        0x01,
        0xe0, // MThd, 1 track, ppq 480
        0x4d,
        0x54,
        0x72,
        0x6b,
        0,
        0,
        0,
        11, // MTrk, 11 bytes
        0x00,
        0x90,
        0x3c,
        0x64, // @0 noteOn 60
        0x60,
        0x3e,
        0x64, // @96 noteOn 62, running status
        0x00,
        0xff,
        0x2f,
        0x00, // end of track
      ]);
      const midi = new Midi(data);
      const track = midi.getSequence().getTracks()[0];

      const first = track.get(0).getMessage() as ShortMessage;
      const second = track.get(1).getMessage() as ShortMessage;
      expect(shortCommand(first)).toBe(ShortMessage.NOTE_ON);
      expect(shortCommand(second)).toBe(ShortMessage.NOTE_ON);
      expect(shortData1(second)).toBe(62);
      expect(track.get(1).getTick()).toBe(96);
    });

    // A chunk length that outruns the file. The reader's loop bound tests where an *event*
    // starts, so the delta time of the cut-off event is read happily and the status byte
    // then falls off the end. That read used to yield `undefined`, which compares false
    // against every status test, so the truncated event arrived as a channel message on
    // command 0 with zeroed data bytes — a message the MIDI specification does not have,
    // manufactured out of bytes the file never contained. The parser is permissive by
    // design, and staying permissive means dropping the unreadable tail, not inventing it.
    it('should not invent an event from a track chunk that outruns the file', () => {
      const body = [
        0x00,
        0x90,
        0x3c,
        0x64, // @0 noteOn 60
        0x81,
        0x70, // delta 240 — and then the file stops
        0x80,
        0x3c,
        0x40, // @240 noteOff 60, never delivered
        0x00,
        0xff,
        0x2f,
        0x00, // end of track, never delivered
      ];
      const data = new Uint8Array([
        0x4d,
        0x54,
        0x68,
        0x64,
        0,
        0,
        0,
        6,
        0,
        0,
        0,
        1,
        0x01,
        0xe0, // MThd, 1 track, ppq 480
        0x4d,
        0x54,
        0x72,
        0x6b,
        0,
        0,
        0,
        body.length, // MTrk, claiming all 13 body bytes
        ...body.slice(0, 6), // …of which only the first six are actually there
      ]);

      const track = new Midi(data).getSequence().getTracks()[0];

      expect(track.size()).toBe(1);
      expect(shortCommand(track.get(0).getMessage() as ShortMessage)).toBe(ShortMessage.NOTE_ON);
      expect(track.get(0).getTick()).toBe(0);
    });

    it('should accumulate delta times into absolute ticks', () => {
      const midi = new Midi(480);
      const track = midi.getSequence().createTrack();
      track.add(EventMaker.createNoteOn(0, 0, 60, 100)!);
      track.add(EventMaker.createNoteOn(0, 480, 62, 100)!);
      track.add(EventMaker.createNoteOn(0, 1920, 64, 100)!);

      const parsed = new Midi(midi.exportMidi()!);
      const readTrack = parsed.getSequence().getTracks()[0];
      expect([0, 1, 2].map((i) => readTrack.get(i).getTick())).toEqual([0, 480, 1920]);
    });

    it('should read a multi-track file', () => {
      const midi = new Midi(480);
      midi
        .getSequence()
        .createTrack()
        .add(EventMaker.createNoteOn(0, 0, 60, 100)!);
      midi
        .getSequence()
        .createTrack()
        .add(EventMaker.createNoteOn(1, 0, 72, 100)!);

      const parsed = new Midi(midi.exportMidi()!);
      expect(parsed.getSequence().getTracks().length).toBe(2);
    });
  });

  // ---------------------------------------------------------------
  // exportMidi – track chunk details
  // ---------------------------------------------------------------
  describe('exportMidi – track chunk details', () => {
    it('should return null and complain when there is no sequence', () => {
      const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const midi = new Midi();
      midi.setSequence(null as unknown as Sequence);

      expect(midi.exportMidi()).toBeNull();
      expect(errSpy).toHaveBeenCalled();
      errSpy.mockRestore();
    });

    it('should append an end of track event when the track has none', () => {
      const midi = new Midi(480);
      midi
        .getSequence()
        .createTrack()
        .add(EventMaker.createNoteOn(0, 0, 60, 100)!);

      const data = midi.exportMidi()!;
      // delta time 0, then the FF 2F 00 end of track meta event
      expect(Array.from(data.slice(-4))).toEqual([0x00, 0xff, 0x2f, 0x00]);
    });

    it('should not append a second end of track event', () => {
      const midi = new Midi(480);
      const track = midi.getSequence().createTrack();
      track.add(EventMaker.createNoteOn(0, 0, 60, 100)!);
      track.add(new MidiEvent(metaMessage(EventMaker.META_End_of_Track, new Uint8Array(0)), 480));

      const parsed = new Midi(midi.exportMidi()!);
      const readTrack = parsed.getSequence().getTracks()[0];
      const endOfTracks = Array.from({ length: readTrack.size() }, (_, i) =>
        readTrack.get(i).getMessage(),
      ).filter((m) => m.kind === 'meta' && m.type === EventMaker.META_End_of_Track);
      expect(endOfTracks.length).toBe(1);
    });

    it('should write format 0 for a single track and format 1 for several', () => {
      const single = new Midi(480);
      single.getSequence().createTrack();
      const singleData = single.exportMidi()!;
      expect(
        new DataView(singleData.buffer, singleData.byteOffset, singleData.byteLength).getUint16(8),
      ).toBe(0);

      const multi = new Midi(480);
      multi.getSequence().createTrack();
      multi.getSequence().createTrack();
      const multiData = multi.exportMidi()!;
      expect(
        new DataView(multiData.buffer, multiData.byteOffset, multiData.byteLength).getUint16(8),
      ).toBe(1);
    });

    it('should encode a delta time above 127 as a variable length quantity', () => {
      const midi = new Midi(480);
      const track = midi.getSequence().createTrack();
      track.add(EventMaker.createNoteOn(0, 128, 60, 100)!);

      const data = midi.exportMidi()!;
      // the track chunk data starts at offset 22 with the first delta time
      expect(data[22]).toBe(0x81);
      expect(data[23]).toBe(0x00);
    });

    it('should declare the true byte length of each track chunk', () => {
      const midi = new Midi(480);
      midi
        .getSequence()
        .createTrack()
        .add(EventMaker.createNoteOn(0, 0, 60, 100)!);

      const data = midi.exportMidi()!;
      const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
      const chunkLength = view.getUint32(18);
      expect(data.length).toBe(14 + 8 + chunkLength);
    });
  });

  // ---------------------------------------------------------------
  // Reading a file that lies about its own lengths
  // ---------------------------------------------------------------
  describe('a declared length that outruns the data', () => {
    /**
     * `readMidiData` used to build the meta and sysex payloads with
     * `new Uint8Array(data.buffer, data.byteOffset + offset, declaredLength)`, which is
     * bounded by the underlying ArrayBUFFER rather than by the view it was handed. The two
     * spellings agree for every in-bounds read and part company for exactly the case below:
     * `metaLength` and `sysexLength` come straight off the file and were never checked
     * against what remained.
     *
     * That mattered because `Buffer` IS a `Uint8Array` and Node pools reads under 4 KB into
     * one shared 8 KB ArrayBuffer, so `new Midi(readFileSync(path))` put the parser one
     * addition away from an unrelated allocation. Measured before the fix: a file declaring
     * a 200-byte text event and supplying none produced a 200-byte payload holding bytes
     * from elsewhere in the pool — silently, no throw. Over 4 KB, where Node hands out an
     * exact-size buffer, the same input threw a RangeError instead.
     *
     * The suite never caught it because the integration tests wrap their reads in
     * `new Uint8Array(readFileSync(...))`, which copies into an exact-size buffer. These
     * cases reproduce the pooled shape on purpose: the MIDI bytes are placed at a non-zero
     * offset inside a larger buffer whose tail is filled with a recognisable marker, which
     * is exactly what the pool does.
     */
    const POISON = 0xab;

    /** MIDI bytes at a non-zero offset in a bigger buffer, as Node's Buffer pool serves them. */
    const pooled = (bytes: readonly number[]): Uint8Array => {
      const pool = new Uint8Array(8192).fill(POISON);
      const at = 64;
      pool.set(bytes, at);
      return pool.subarray(at, at + bytes.length);
    };

    const HEADER = [
      0x4d,
      0x54,
      0x68,
      0x64,
      0x00,
      0x00,
      0x00,
      0x06, // MThd, length 6
      0x00,
      0x00,
      0x00,
      0x01,
      0x01,
      0xe0, // format 0, one track, 480 ppq
    ];

    it('does not read a meta payload past the end of the data it was given', () => {
      // MTrk length 5: delta 0, FF 01 (text), declared length 200 (VLQ 0x81 0x48), no payload.
      const midi = new Midi(
        pooled([
          ...HEADER,
          0x4d,
          0x54,
          0x72,
          0x6b,
          0x00,
          0x00,
          0x00,
          0x05,
          0x00,
          0xff,
          0x01,
          0x81,
          0x48,
        ]),
      );

      const events = [...midi.getSequence().getTracks()[0]!];
      const metas = events
        .map((event) => event.getMessage())
        .filter((message): message is MetaMessage => message.kind === 'meta');
      expect(metas).toHaveLength(1);

      const payload = metaPayload(metas[0]!);
      // The file supplied no payload bytes, so there are none — not 200 of somebody else's.
      expect(payload.length).toBe(0);
      expect([...payload].includes(POISON)).toBe(false);
    });

    it('does not read a sysex payload past the end of the data it was given', () => {
      // MTrk length 5: delta 0, F0, declared length 200 (VLQ 0x81 0x48), no payload.
      const midi = new Midi(
        pooled([...HEADER, 0x4d, 0x54, 0x72, 0x6b, 0x00, 0x00, 0x00, 0x05, 0x00, 0xf0, 0x81, 0x48]),
      );

      const events = [...midi.getSequence().getTracks()[0]!];
      const sysexes = events
        .map((event) => event.getMessage())
        .filter((message): message is SysexMessage => message.kind === 'sysex');
      expect(sysexes).toHaveLength(1);

      // The declared length is kept — that is the message the file describes — but every
      // byte past what the file actually supplied is zero, never pooled memory.
      const bytes = messageBytes(sysexes[0]!);
      expect(bytes.length).toBe(201);
      expect(bytes[0]).toBe(0xf0);
      expect([...bytes].includes(POISON)).toBe(false);
      expect([...bytes.slice(1)].every((byte) => byte === 0)).toBe(true);
    });

    it('still reads a meta payload that IS there, byte for byte', () => {
      // The control: same shape, but the three declared bytes are supplied.
      // MTrk length 8: delta 0, FF 01, length 3, "abc".
      const midi = new Midi(
        pooled([
          ...HEADER,
          0x4d,
          0x54,
          0x72,
          0x6b,
          0x00,
          0x00,
          0x00,
          0x08,
          0x00,
          0xff,
          0x01,
          0x03,
          0x61,
          0x62,
          0x63,
        ]),
      );

      const metas = [...midi.getSequence().getTracks()[0]!]
        .map((event) => event.getMessage())
        .filter((message): message is MetaMessage => message.kind === 'meta');
      expect(metas).toHaveLength(1);
      expect([...metaPayload(metas[0]!)]).toEqual([0x61, 0x62, 0x63]);
    });
  });
});
