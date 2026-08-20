import { describe, it, expect, vi } from 'vitest';
import { EventMaker } from '../../src/midi/EventMaker.js';
import * as EventMakerModule from '../../src/midi/EventMaker.js';
import {
  messageBytes,
  metaPayload,
  shortChannel,
  shortCommand,
  shortData1,
  shortData2,
  MidiEvent,
  type MetaMessage,
  type ShortMessage,
} from '../../src/midi/MidiTypes.js';

describe('EventMaker', () => {
  // ---------------------------------------------------------------
  // MIDI constants
  // ---------------------------------------------------------------
  describe('MIDI constants', () => {
    it('should define NOTE_ON as 144 (0x90)', () => {
      expect(EventMaker.NOTE_ON).toBe(144);
    });

    it('should define NOTE_OFF as 128 (0x80)', () => {
      expect(EventMaker.NOTE_OFF).toBe(128);
    });

    it('should define POLY_AFTERTOUCH as 160', () => {
      expect(EventMaker.POLY_AFTERTOUCH).toBe(160);
    });

    it('should define CONTROL_CHANGE as 176', () => {
      expect(EventMaker.CONTROL_CHANGE).toBe(176);
    });

    it('should define PROGRAM_CHANGE as 192', () => {
      expect(EventMaker.PROGRAM_CHANGE).toBe(192);
    });

    it('should define CHANNEL_AFTERTOUCH as 208', () => {
      expect(EventMaker.CHANNEL_AFTERTOUCH).toBe(208);
    });

    it('should define PITCH_BEND as 224', () => {
      expect(EventMaker.PITCH_BEND).toBe(224);
    });

    it('should define META_EVENT as 255', () => {
      expect(EventMaker.META_EVENT).toBe(255);
    });

    it('should define META_Set_Tempo as 81 (0x51)', () => {
      expect(EventMaker.META_Set_Tempo).toBe(81);
    });

    it('should define META_Time_Signature as 88 (0x58)', () => {
      expect(EventMaker.META_Time_Signature).toBe(88);
    });

    it('should define META_Key_Signature as 89 (0x59)', () => {
      expect(EventMaker.META_Key_Signature).toBe(89);
    });

    it('should define META_Track_Name as 3 (0x03)', () => {
      expect(EventMaker.META_Track_Name).toBe(3);
    });

    it('should define META_End_of_Track as 47 (0x2F)', () => {
      expect(EventMaker.META_End_of_Track).toBe(47);
    });

    it('should define PC_Acoustic_Grand_Piano as 0', () => {
      expect(EventMaker.PC_Acoustic_Grand_Piano).toBe(0);
    });

    it('should define PC_Violin as 40', () => {
      expect(EventMaker.PC_Violin).toBe(40);
    });

    it('should define CC_Channel_Volume as 7', () => {
      expect(EventMaker.CC_Channel_Volume).toBe(7);
    });

    it('should define CC_Pan as 10', () => {
      expect(EventMaker.CC_Pan).toBe(10);
    });

    it('should define CC_All_Notes_Off as 123', () => {
      expect(EventMaker.CC_All_Notes_Off).toBe(123);
    });
  });

  // ---------------------------------------------------------------
  // createNoteOn / createNoteOff
  // ---------------------------------------------------------------
  describe('createNoteOn', () => {
    it('should create a valid note on event', () => {
      const event = EventMaker.createNoteOn(0, 480, 60, 100);
      expect(event).not.toBeNull();
      expect(event!.getTick()).toBe(480);

      const msg = event!.getMessage() as ShortMessage;
      expect(shortCommand(msg)).toBe(EventMaker.NOTE_ON);
      expect(shortChannel(msg)).toBe(0);
      expect(shortData1(msg)).toBe(60);
      expect(shortData2(msg)).toBe(100);
    });

    it('should clamp velocity above 127 to 127', () => {
      const event = EventMaker.createNoteOn(0, 0, 60, 200);
      expect(event).not.toBeNull();
      const msg = event!.getMessage() as ShortMessage;
      expect(shortData2(msg)).toBe(127);
    });

    it('should clamp velocity below 0 to 0', () => {
      const event = EventMaker.createNoteOn(0, 0, 60, -10);
      expect(event).not.toBeNull();
      const msg = event!.getMessage() as ShortMessage;
      expect(shortData2(msg)).toBe(0);
    });

    it('should set the correct MIDI channel', () => {
      const event = EventMaker.createNoteOn(5, 0, 72, 80);
      expect(event).not.toBeNull();
      const msg = event!.getMessage() as ShortMessage;
      expect(shortChannel(msg)).toBe(5);
    });
  });

  describe('createNoteOff', () => {
    it('should create a valid note off event', () => {
      const event = EventMaker.createNoteOff(0, 960, 60, 64);
      expect(event).not.toBeNull();
      expect(event!.getTick()).toBe(960);

      const msg = event!.getMessage() as ShortMessage;
      expect(shortCommand(msg)).toBe(EventMaker.NOTE_OFF);
      expect(shortChannel(msg)).toBe(0);
      expect(shortData1(msg)).toBe(60);
      expect(shortData2(msg)).toBe(64);
    });

    it('should clamp velocity above 127', () => {
      const event = EventMaker.createNoteOff(0, 0, 60, 300);
      expect(event).not.toBeNull();
      const msg = event!.getMessage() as ShortMessage;
      expect(shortData2(msg)).toBe(127);
    });

    it('should clamp velocity below 0', () => {
      const event = EventMaker.createNoteOff(0, 0, 60, -5);
      expect(event).not.toBeNull();
      const msg = event!.getMessage() as ShortMessage;
      expect(shortData2(msg)).toBe(0);
    });
  });

  // ---------------------------------------------------------------
  // createProgramChange
  // ---------------------------------------------------------------
  describe('createProgramChange', () => {
    it('should create a program change event', () => {
      const event = EventMaker.createProgramChange(0, 0, EventMaker.PC_Violin);
      expect(event).not.toBeNull();
      expect(event!.getTick()).toBe(0);

      const msg = event!.getMessage() as ShortMessage;
      expect(shortCommand(msg)).toBe(EventMaker.PROGRAM_CHANGE);
      expect(shortData1(msg)).toBe(EventMaker.PC_Violin);
    });

    it('should set the correct channel', () => {
      const event = EventMaker.createProgramChange(3, 100, EventMaker.PC_Flute);
      expect(event).not.toBeNull();
      const msg = event!.getMessage() as ShortMessage;
      expect(shortChannel(msg)).toBe(3);
      expect(shortData1(msg)).toBe(EventMaker.PC_Flute);
    });
  });

  // ---------------------------------------------------------------
  // createTempo
  // ---------------------------------------------------------------
  describe('createTempo', () => {
    it('should create a tempo event for 120 BPM quarter note beats', () => {
      const event = EventMaker.createTempo(0, 120, 0.25);
      expect(event).not.toBeNull();
      expect(event!.getTick()).toBe(0);

      const msg = event!.getMessage() as MetaMessage;
      expect(msg.type).toBe(EventMaker.META_Set_Tempo);

      // 120 BPM with beat length 0.25 => mpq = 60000000 / (120 * 0.25 * 4) = 500000
      const data = metaPayload(msg);
      expect(data.length).toBe(3);
      const mpq = (data[0] << 16) | (data[1] << 8) | data[2];
      expect(mpq).toBe(500000);
    });

    it('should create a tempo event for 60 BPM', () => {
      const event = EventMaker.createTempo(0, 60, 0.25);
      expect(event).not.toBeNull();
      const msg = event!.getMessage() as MetaMessage;
      const data = metaPayload(msg);
      const mpq = (data[0] << 16) | (data[1] << 8) | data[2];
      // 60 BPM => mpq = 60000000 / (60 * 0.25 * 4) = 1000000
      expect(mpq).toBe(1000000);
    });

    it('should handle non-quarter beat lengths', () => {
      // 120 BPM with half-note beats (beatlength=0.5)
      const event = EventMaker.createTempo(0, 120, 0.5);
      expect(event).not.toBeNull();
      const msg = event!.getMessage() as MetaMessage;
      const data = metaPayload(msg);
      const mpq = (data[0] << 16) | (data[1] << 8) | data[2];
      // mpq = 60000000 / (120 * 0.5 * 4) = 250000
      expect(mpq).toBe(250000);
    });
  });

  // ---------------------------------------------------------------
  // createTimeSignature
  // ---------------------------------------------------------------
  describe('createTimeSignature', () => {
    it('should create a 4/4 time signature event', () => {
      const event = EventMaker.createTimeSignature(0, 4, 4);
      expect(event).not.toBeNull();
      expect(event!.getTick()).toBe(0);

      const msg = event!.getMessage() as MetaMessage;
      expect(msg.type).toBe(EventMaker.META_Time_Signature);

      const data = metaPayload(msg);
      expect(data.length).toBe(4);
      expect(data[0]).toBe(4); // numerator
      expect(data[1]).toBe(2); // denominator as power of 2 (2^2 = 4)
    });

    it('should create a 3/8 time signature event', () => {
      const event = EventMaker.createTimeSignature(0, 3, 8);
      expect(event).not.toBeNull();
      const msg = event!.getMessage() as MetaMessage;
      const data = metaPayload(msg);
      expect(data[0]).toBe(3); // numerator
      expect(data[1]).toBe(3); // 2^3 = 8
    });

    it('should create a 6/8 time signature event', () => {
      const event = EventMaker.createTimeSignature(0, 6, 8);
      expect(event).not.toBeNull();
      const msg = event!.getMessage() as MetaMessage;
      const data = metaPayload(msg);
      expect(data[0]).toBe(6);
      expect(data[1]).toBe(3); // 2^3 = 8
    });
  });

  // ---------------------------------------------------------------
  // createKeySignature
  // ---------------------------------------------------------------
  describe('createKeySignature', () => {
    it('should create a key signature with 0 accidentals (C major)', () => {
      const event = EventMaker.createKeySignature(0, 0);
      expect(event).not.toBeNull();
      const msg = event!.getMessage() as MetaMessage;
      expect(msg.type).toBe(EventMaker.META_Key_Signature);
      const data = metaPayload(msg);
      expect(data.length).toBe(2);
      expect(data[0]).toBe(0); // 0 accidentals
      expect(data[1]).toBe(0); // major mode
    });

    it('should create a key signature with positive accidentals (sharps)', () => {
      const event = EventMaker.createKeySignature(0, 2);
      expect(event).not.toBeNull();
      const msg = event!.getMessage() as MetaMessage;
      const data = metaPayload(msg);
      expect(data[0]).toBe(2); // 2 sharps (D major)
    });

    it('should handle negative accidentals (flats) via byte representation', () => {
      // -3 flats => as byte: 0xFD
      const event = EventMaker.createKeySignature(0, -3);
      expect(event).not.toBeNull();
      const msg = event!.getMessage() as MetaMessage;
      const data = metaPayload(msg);
      expect(data[0]).toBe(-3 & 0xff); // 253
    });
  });

  // ---------------------------------------------------------------
  // intToByteArray / byteArrayToInt round-trips
  // ---------------------------------------------------------------
  describe('intToByteArray and byteArrayToInt', () => {
    it('should round-trip value 500000 in little-endian (network order)', () => {
      const bytes = EventMaker.intToByteArray(500000, false);
      expect(bytes.length).toBe(4);
      const result = EventMaker.byteArrayToInt(bytes);
      expect(result).toBe(500000);
    });

    it('should round-trip value 0', () => {
      const bytes = EventMaker.intToByteArray(0, false);
      const result = EventMaker.byteArrayToInt(bytes);
      expect(result).toBe(0);
    });

    it('should round-trip value 1', () => {
      const bytes = EventMaker.intToByteArray(1, false);
      const result = EventMaker.byteArrayToInt(bytes);
      expect(result).toBe(1);
    });

    it('should round-trip value 256', () => {
      const bytes = EventMaker.intToByteArray(256, false);
      const result = EventMaker.byteArrayToInt(bytes);
      expect(result).toBe(256);
    });

    it('should round-trip value 65535', () => {
      const bytes = EventMaker.intToByteArray(65535, false);
      const result = EventMaker.byteArrayToInt(bytes);
      expect(result).toBe(65535);
    });

    it('should produce different byte orders for big-endian vs little-endian', () => {
      const le = EventMaker.intToByteArray(256, false);
      const be = EventMaker.intToByteArray(256, true);
      // In little-endian (false = network order), MSB is first
      // In big-endian (true), LSB is first
      expect(le[3]).toBe(be[0]);
      expect(le[2]).toBe(be[1]);
      expect(le[1]).toBe(be[2]);
      expect(le[0]).toBe(be[3]);
    });

    it('should round-trip a 3-byte subarray (for tempo data)', () => {
      const mpq = 500000;
      const full = EventMaker.intToByteArray(mpq, false);
      // tempo uses bytes [1], [2], [3] from the little-endian array
      const tempoBytes = new Uint8Array([full[1], full[2], full[3]]);
      const restored = EventMaker.byteArrayToInt(tempoBytes);
      expect(restored).toBe(mpq);
    });
  });

  // ---------------------------------------------------------------
  // shortToByteArray
  //
  // `byteToShort` used to be tested here too. T21 deleted it (ARCHITECTURE.md §8.10: no
  // caller outside this file), and its two `it`s went with it per charter invariant 7c.
  // ---------------------------------------------------------------
  describe('shortToByteArray', () => {
    it('should reduce a value to its lowest byte', () => {
      expect(Array.from(EventMaker.shortToByteArray(0))).toEqual([0]);
      expect(Array.from(EventMaker.shortToByteArray(9))).toEqual([9]);
      expect(Array.from(EventMaker.shortToByteArray(255))).toEqual([255]);
      expect(Array.from(EventMaker.shortToByteArray(256))).toEqual([0]);
      expect(Array.from(EventMaker.shortToByteArray(300))).toEqual([300 & 0xff]);
    });
  });

  // ---------------------------------------------------------------
  // createControlChange
  // ---------------------------------------------------------------
  describe('createControlChange', () => {
    it('should create a control change event', () => {
      const event = EventMaker.createControlChange(3, 480, EventMaker.CC_Channel_Volume, 100);
      const msg = event.getMessage() as ShortMessage;

      expect(event.getTick()).toBe(480);
      expect(shortCommand(msg)).toBe(EventMaker.CONTROL_CHANGE);
      expect(shortChannel(msg)).toBe(3);
      expect(shortData1(msg)).toBe(EventMaker.CC_Channel_Volume);
      expect(shortData2(msg)).toBe(100);
    });

    it('should clamp the controller value into 0..127', () => {
      const high = EventMaker.createControlChange(0, 0, EventMaker.CC_Pan, 200);
      const low = EventMaker.createControlChange(0, 0, EventMaker.CC_Pan, -20);

      expect(shortData2(high.getMessage() as ShortMessage)).toBe(127);
      expect(shortData2(low.getMessage() as ShortMessage)).toBe(0);
    });
  });

  // ---------------------------------------------------------------
  // createProgramChangeByName
  // ---------------------------------------------------------------
  describe('createProgramChangeByName', () => {
    it('should look the instrument name up in the dictionary', () => {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const event = EventMaker.createProgramChangeByName(0, 0, 'Violin');
      const msg = event.getMessage() as ShortMessage;
      expect(shortCommand(msg)).toBe(EventMaker.PROGRAM_CHANGE);
      expect(shortData1(msg)).toBe(EventMaker.PC_Violin);

      logSpy.mockRestore();
    });

    it('should resolve a German instrument name too', () => {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const event = EventMaker.createProgramChangeByName(5, 240, 'Cembalo');
      expect(event.getTick()).toBe(240);
      expect(shortChannel(event.getMessage() as ShortMessage)).toBe(5);
      expect(shortData1(event.getMessage() as ShortMessage)).toBe(EventMaker.PC_Harpsichord);

      logSpy.mockRestore();
    });

    it('should fall back to Acoustic Grand Piano for an empty name', () => {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const event = EventMaker.createProgramChangeByName(0, 0, '');
      expect(shortData1(event.getMessage() as ShortMessage)).toBe(
        EventMaker.PC_Acoustic_Grand_Piano,
      );

      logSpy.mockRestore();
    });
  });

  // ---------------------------------------------------------------
  // text-carrying meta events
  // ---------------------------------------------------------------
  describe('text meta events', () => {
    const decode = (event: MidiEvent) =>
      new TextDecoder().decode(metaPayload(event.getMessage() as MetaMessage));

    it('createTrackName should carry the name as META_Track_Name', () => {
      const event = EventMaker.createTrackName(0, 'Violino I');
      expect((event.getMessage() as MetaMessage).type).toBe(EventMaker.META_Track_Name);
      expect(decode(event)).toBe('Violino I');
      expect(event.getTick()).toBe(0);
    });

    it('createInstrumentName should carry the name as META_Instrument_Name', () => {
      const event = EventMaker.createInstrumentName(480, 'Harpsichord');
      expect((event.getMessage() as MetaMessage).type).toBe(EventMaker.META_Instrument_Name);
      expect(decode(event)).toBe('Harpsichord');
      expect(event.getTick()).toBe(480);
    });

    it('createTextEvent should carry the text as META_Text_Event', () => {
      const event = EventMaker.createTextEvent(96, 'dolce');
      expect((event.getMessage() as MetaMessage).type).toBe(EventMaker.META_Text_Event);
      expect(decode(event)).toBe('dolce');
    });

    it('createMarker should carry the text as META_Marker', () => {
      const event = EventMaker.createMarker(1920, 'repetition start');
      expect((event.getMessage() as MetaMessage).type).toBe(EventMaker.META_Marker);
      expect(decode(event)).toBe('repetition start');
      expect(event.getTick()).toBe(1920);
    });

    it('should encode text as UTF-8', () => {
      const event = EventMaker.createTrackName(0, 'Flöte');
      const data = metaPayload(event.getMessage() as MetaMessage);
      expect(data.length).toBe(6); // ö takes two bytes
      expect(decode(event)).toBe('Flöte');
    });

    it('should accept an empty text', () => {
      const event = EventMaker.createTextEvent(0, '');
      expect(metaPayload(event.getMessage() as MetaMessage).length).toBe(0);
      expect(Array.from(messageBytes(event.getMessage() as MetaMessage))).toEqual([
        0xff, 0x01, 0x00,
      ]);
    });
  });

  // ---------------------------------------------------------------
  // channel prefix and midi port
  // ---------------------------------------------------------------
  describe('createChannelPrefix and createMidiPortEvent', () => {
    it('createChannelPrefix should hold the channel in a single data byte', () => {
      const event = EventMaker.createChannelPrefix(0, 9);
      const msg = event.getMessage() as MetaMessage;

      expect(msg.type).toBe(EventMaker.META_Midi_Channel_Prefix);
      expect(Array.from(metaPayload(msg))).toEqual([9]);
      expect(Array.from(messageBytes(msg))).toEqual([0xff, 0x20, 0x01, 9]);
    });

    it('createMidiPortEvent should hold the port in a single data byte', () => {
      const event = EventMaker.createMidiPortEvent(240, 1);
      const msg = event.getMessage() as MetaMessage;

      expect(msg.type).toBe(EventMaker.META_Midi_Port);
      expect(Array.from(metaPayload(msg))).toEqual([1]);
      expect(Array.from(messageBytes(msg))).toEqual([0xff, 0x21, 0x01, 1]);
      expect(event.getTick()).toBe(240);
    });
  });

  // ---------------------------------------------------------------
  // the re-export table
  //
  // T20 dissolved the static-only `EventMaker` class into module functions and
  // constants; `EventMaker` is now a re-export table over them. Most of the 299
  // constants are not reachable from any fixture, so the byte-equivalence suite
  // cannot see a member that is dropped from the table or wired to the wrong
  // binding — these two tests are what does.
  // ---------------------------------------------------------------
  describe('the EventMaker re-export table', () => {
    const moduleExports = Object.keys(EventMakerModule).filter((name) => name !== 'EventMaker');

    it('should expose exactly the module’s exports', () => {
      expect([...Object.keys(EventMaker)].sort()).toEqual([...moduleExports].sort());
      // 299 constants + 17 functions, the public surface of the former class.
      // 318 → 317 in T20 (the class had no re-export table); 317 → 316 in T21, which
      // deleted `byteToShort` per ARCHITECTURE.md §8.10 — no caller but its own test.
      expect(Object.keys(EventMaker)).toHaveLength(316);
    });

    it('should hold the module’s own bindings, not copies of them', () => {
      const table = EventMaker as unknown as Record<string, unknown>;
      const module_ = EventMakerModule as unknown as Record<string, unknown>;

      for (const name of moduleExports) {
        expect(table[name]).toBe(module_[name]);
      }
    });

    // The two blocks below are the MIDI specification's own numbering: controller
    // numbers and program change numbers each run 0..127 with no gaps, in the order
    // the spec lists them. Asserting the whole run (rather than the handful of
    // constants named above) is what pins the 250-odd values that no fixture reaches.
    const valuesOfPrefix = (prefix: string) =>
      Object.entries(EventMaker)
        .filter(([name]) => name.startsWith(prefix))
        .map(([, value]) => value);

    it('should number the CC_* controller constants 0..127 in declaration order', () => {
      expect(valuesOfPrefix('CC_')).toEqual([...Array(128).keys()]);
    });

    it('should number the PC_* program change constants 0..127 in declaration order', () => {
      expect(valuesOfPrefix('PC_')).toEqual([...Array(128).keys()]);
    });
  });
});
