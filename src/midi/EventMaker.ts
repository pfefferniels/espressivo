/**
 * This module provides some useful midi-related functions.
 * Port of meico.midi.EventMaker
 *
 * Every `create*` function is a factory for one `MidiEvent`, and every one of them
 * follows the same two conventions, inherited from Java:
 *
 * - **A failure returns `null`, it does not throw.** Java's constructors declare
 *   `InvalidMidiDataException`; this port's cannot fail the same way, so the
 *   `try`/`catch` wrappers are vestigial — but the `| null` return type is not.
 *   Every call site in `Msm.ts` is written as `if (event !== null) track.add(event)`,
 *   and dropping the nullability would silently change 30 call sites from
 *   "skip on failure" to "always add".
 * - **Clamping happens here, not at the call site.** Velocities and controller
 *   values are clamped into 0..127 before the message is built, so out-of-range
 *   values from the MPM rendering stage become the boundary value rather than
 *   wrapping when `ShortMessage` masks them to 7 bits. Note the asymmetry:
 *   pitch and program numbers are *not* clamped here — `ShortMessage` masks them —
 *   so a program number of 200 becomes 72, not 127.
 *
 * The constant tables below are the MIDI specification's numbers under meico's
 * names. `MidiTypes.ShortMessage` declares the same status bytes independently, in
 * hexadecimal; the two must agree (e.g. `NOTE_ON` 144 = `ShortMessage.NOTE_ON`
 * 0x90). They are deliberately not cross-referenced: this module mirrors Java's
 * `EventMaker`, which has no dependency on `javax.sound.midi`'s constants either.
 *
 * ## Why there is both a module surface and an `EventMaker` object
 *
 * T20 dissolved the static-only `EventMaker` class into the exported constants and
 * functions below (RULE C2). The `EventMaker` object at the bottom of this file is a
 * **pure re-export table** — every property holds the very binding declared above it,
 * so `EventMaker.createNoteOn === createNoteOn`. It exists because the published API
 * (`src/index.ts`) and the frozen facade (`src/api/pipeline.ts`) name `EventMaker`,
 * and because `EventMaker.NOTE_OFF` reads better than a bare `NOTE_OFF` at call sites
 * that also use `ShortMessage.NOTE_OFF` — `Midi.noteOns2NoteOffs` uses both in one
 * statement. Interior callers therefore import the module namespace
 * (`import * as EventMaker from './EventMaker.js'`) and reach the functions directly;
 * the object is for consumers who cannot.
 *
 * @author Axel Berndt
 */

import { MidiEvent, ShortMessage, MetaMessage } from './MidiTypes.js';
import { InstrumentsDictionary } from './InstrumentsDictionary.js';

// use these constants for the event type
export const NOTE_OFF = 128;
export const NOTE_ON = 144;
export const POLY_AFTERTOUCH = 160;
export const CONTROL_CHANGE = 176;
export const PROGRAM_CHANGE = 192;
export const CHANNEL_AFTERTOUCH = 208;
export const PITCH_BEND = 224;
export const SYSEX_START = 240;
export const MIDI_TIME_CODE = 241;
export const SONG_POSITION_POINTER = 242;
export const SONG_SELECT = 243;
export const UNDEF1 = 244;
export const UNDEF2 = 245;
export const TUNE_REQUEST = 246;
export const SYSEX_END = 247;
export const TIMING_CLOCK = 248;
export const UNDEF3 = 249;
export const START = 250;
export const CONTINUE = 251;
export const STOP = 252;
export const UNDEF4 = 253;
export const ACTIVE_SENSING = 254;
export const SYSTEM_RESET = 255;
export const META_EVENT = 255;

// use these constants to set the controller number of a CONTROL_CHANGE event
export const CC_Bank_Select = 0;
export const CC_Modulation_Wheel = 1;
export const CC_Breath_Ctrl = 2;
export const CC_Undefined_Ctrl_1 = 3;
export const CC_Foot_Ctrl = 4;
export const CC_Portamento_Time = 5;
export const CC_Data_Entry = 6;
export const CC_Channel_Volume = 7;
export const CC_Balance = 8;
export const CC_Undefined_Ctrl_2 = 9;
export const CC_Pan = 10;
export const CC_Expression_Ctrl = 11;
export const CC_Effect_Ctrl_1 = 12;
export const CC_Effect_Ctrl_2 = 13;
export const CC_Undefined_Ctrl_3 = 14;
export const CC_Undefined_Ctrl_4 = 15;
export const CC_General_Purpose_Ctrl_1 = 16;
export const CC_General_Purpose_Ctrl_2 = 17;
export const CC_General_Purpose_Ctrl_3 = 18;
export const CC_General_Purpose_Ctrl_4 = 19;
export const CC_Undefined_Ctrl_5 = 20;
export const CC_Undefined_Ctrl_6 = 21;
export const CC_Undefined_Ctrl_7 = 22;
export const CC_Undefined_Ctrl_8 = 23;
export const CC_Undefined_Ctrl_9 = 24;
export const CC_Undefined_Ctrl_10 = 25;
export const CC_Undefined_Ctrl_11 = 26;
export const CC_Undefined_Ctrl_12 = 27;
export const CC_Undefined_Ctrl_13 = 28;
export const CC_Undefined_Ctrl_14 = 29;
export const CC_Undefined_Ctrl_15 = 30;
export const CC_Undefined_Ctrl_16 = 31;
export const CC_Bank_Select_14b = 32;
export const CC_Modulation_Wheel_14b = 33;
export const CC_Breath_Ctrl_14b = 34;
export const CC_Undefined_Ctrl_1_14b = 35;
export const CC_Foot_Ctrl_14b = 36;
export const CC_Portamento_Time_14b = 37;
export const CC_Data_Entry_14b = 38;
export const CC_Channel_Volume_14b = 39;
export const CC_Balance_14b = 40;
export const CC_Undefined_Ctrl_2_14b = 41;
export const CC_Pan_14b = 42;
export const CC_Expression_Ctrl_14b = 43;
export const CC_Effect_Ctrl_1_14b = 44;
export const CC_Effect_Ctrl_2_14b = 45;
export const CC_Undefined_Ctrl_3_14b = 46;
export const CC_Undefined_Ctrl_4_14b = 47;
export const CC_General_Purpose_Ctrl_1_14b = 48;
export const CC_General_Purpose_Ctrl_2_14b = 49;
export const CC_General_Purpose_Ctrl_3_14b = 50;
export const CC_General_Purpose_Ctrl_4_14b = 51;
export const CC_Undefined_Ctrl_5_14b = 52;
export const CC_Undefined_Ctrl_6_14b = 53;
export const CC_Undefined_Ctrl_7_14b = 54;
export const CC_Undefined_Ctrl_8_14b = 55;
export const CC_Undefined_Ctrl_9_14b = 56;
export const CC_Undefined_Ctrl_10_14b = 57;
export const CC_Undefined_Ctrl_11_14b = 58;
export const CC_Undefined_Ctrl_12_14b = 59;
export const CC_Undefined_Ctrl_13_14b = 60;
export const CC_Undefined_Ctrl_14_14b = 61;
export const CC_Undefined_Ctrl_15_14b = 62;
export const CC_Undefined_Ctrl_16_14b = 63;
export const CC_Damper_Pedal = 64;
export const CC_Portamento_OnOff = 65;
export const CC_Sustenuto = 66;
export const CC_Soft_Pedal = 67;
export const CC_Legato_Footswitch = 68;
export const CC_Hold_2 = 69;
export const CC_Sound_Ctrl_1 = 70;
export const CC_Sound_Ctrl_2 = 71;
export const CC_Sound_Ctrl_3 = 72;
export const CC_Sound_Ctrl_4 = 73;
export const CC_Sound_Ctrl_5 = 74;
export const CC_Sound_Ctrl_6 = 75;
export const CC_Sound_Ctrl_7 = 76;
export const CC_Sound_Ctrl_8 = 77;
export const CC_Sound_Ctrl_9 = 78;
export const CC_Sound_Ctrl_10 = 79;
export const CC_General_Purpose_Ctrl_5 = 80;
export const CC_General_Purpose_Ctrl_6 = 81;
export const CC_General_Purpose_Ctrl_7 = 82;
export const CC_General_Purpose_Ctrl_8 = 83;
export const CC_Portamento_Ctrl = 84;
export const CC_Undefined_Ctrl_17 = 85;
export const CC_Undefined_Ctrl_18 = 86;
export const CC_Undefined_Ctrl_19 = 87;
export const CC_Undefined_Ctrl_20 = 88;
export const CC_Undefined_Ctrl_21 = 89;
export const CC_Undefined_Ctrl_22 = 90;
export const CC_Reverb_Send_Level = 91;
export const CC_Effects_2_Depth = 92;
export const CC_Chorus_Send_Level = 93;
export const CC_Effects_4_Depth = 94;
export const CC_Effects_5_Depth = 95;
export const CC_Data_Entry_plus_1 = 96;
export const CC_Data_Entry_minus_1 = 97;
export const CC_Nonregistered_Param_Num_LSB = 98;
export const CC_Nonregistered_Param_Num_MSB = 99;
export const CC_Registered_Param_Num_LSB = 100;
export const CC_Registered_Param_Num_MSB = 101;
export const CC_Undefined_Ctrl_23 = 102;
export const CC_Undefined_Ctrl_24 = 103;
export const CC_Undefined_Ctrl_25 = 104;
export const CC_Undefined_Ctrl_26 = 105;
export const CC_Undefined_Ctrl_27 = 106;
export const CC_Undefined_Ctrl_28 = 107;
export const CC_Undefined_Ctrl_29 = 108;
export const CC_Undefined_Ctrl_30 = 109;
export const CC_Undefined_Ctrl_31 = 110;
export const CC_Undefined_Ctrl_32 = 111;
export const CC_Undefined_Ctrl_33 = 112;
export const CC_Undefined_Ctrl_34 = 113;
export const CC_Undefined_Ctrl_35 = 114;
export const CC_Undefined_Ctrl_36 = 115;
export const CC_Undefined_Ctrl_37 = 116;
export const CC_Undefined_Ctrl_38 = 117;
export const CC_Undefined_Ctrl_39 = 118;
export const CC_Undefined_Ctrl_40 = 119;
export const CC_All_Sound_Off = 120;
export const CC_Reset_All_Controllers = 121;
export const CC_Local_Control_OnOff = 122;
export const CC_All_Notes_Off = 123;
export const CC_Omni_Mode_Off = 124;
export const CC_Omni_Mode_On = 125;
export const CC_Poly_Mode_OnOff = 126;
export const CC_Poly_Mode_On = 127;

// if the event type is meta event, use these constants to indicate the metaevent type
export const META_Sequence_Number = 0; //0x00
export const META_Text_Event = 1; //0x01
export const META_Copyright_Notice = 2; //0x02
export const META_Track_Name = 3; //0x03
export const META_Sequence_Name = 3; //0x03
export const META_Instrument_Name = 4; //0x04
export const META_Lyric = 5; //0x05
export const META_Marker = 6; //0x06
export const META_Cue_Point = 7; //0x07
export const META_Program_Name = 8; //0x08
export const META_Device_Name = 9; //0x09
export const META_Midi_Channel_Prefix = 32; //0x20
export const META_Midi_Port = 33; //0x21
export const META_End_of_Track = 47; //0x2F
export const META_Set_Tempo = 81; //0x51
export const META_SMTPE_Offset = 84; //0x54
export const META_Time_Signature = 88; //0x58
export const META_Key_Signature = 89; //0x59
export const META_Sequence_specific_Meta_event = 127; //0x7F

// use these constants for program change codes
export const PC_Acoustic_Grand_Piano = 0;
export const PC_Bright_Acoustic_Piano = 1;
export const PC_Electric_Grand_Piano = 2;
export const PC_Honkytonk_Piano = 3;
export const PC_Electric_Piano_1 = 4;
export const PC_Electric_Piano_2 = 5;
export const PC_Harpsichord = 6;
export const PC_Clavinet = 7;
export const PC_Celesta = 8;
export const PC_Glockenspiel = 9;
export const PC_Music_Box = 10;
export const PC_Vibraphone = 11;
export const PC_Marimba = 12;
export const PC_Xylophone = 13;
export const PC_Tubular_Bells = 14;
export const PC_Dulcimer = 15;
export const PC_Drawbar_Organ = 16;
export const PC_Percussive_Organ = 17;
export const PC_Rock_Organ = 18;
export const PC_Church_Organ = 19;
export const PC_Reed_Organ = 20;
export const PC_Accordion = 21;
export const PC_Harmonica = 22;
export const PC_Tango_Accordion = 23;
export const PC_Acoustic_Guitar_nylon = 24;
export const PC_Acoustic_Guitar_steel = 25;
export const PC_Electric_Guitar_jazz = 26;
export const PC_Electric_Guitar_clean = 27;
export const PC_Electric_Guitar_muted = 28;
export const PC_Overdriven_Guitar = 29;
export const PC_Distortion_Guitar = 30;
export const PC_Guitar_Harmonics = 31;
export const PC_Acoustic_Bass = 32;
export const PC_Electric_Bass_finger = 33;
export const PC_Electric_Bass_pick = 34;
export const PC_Fretless_Bass = 35;
export const PC_Slap_Bass_1 = 36;
export const PC_Slap_Bass_2 = 37;
export const PC_Synth_Bass_1 = 38;
export const PC_Synth_Bass_2 = 39;
export const PC_Violin = 40;
export const PC_Viola = 41;
export const PC_Cello = 42;
export const PC_Contrabass = 43;
export const PC_Tremolo_Strings = 44;
export const PC_Pizzicato_Strings = 45;
export const PC_Orchestral_Harp = 46;
export const PC_Timpani = 47;
export const PC_String_Ensemble_1 = 48;
export const PC_String_Ensemble_2 = 49;
export const PC_Synth_Strings_1 = 50;
export const PC_Synth_Strings_2 = 51;
export const PC_Choir_Aahs = 52;
export const PC_Voice_Oohs = 53;
export const PC_Synth_Choir = 54;
export const PC_Orchestra_Hit = 55;
export const PC_Trumpet = 56;
export const PC_Trombone = 57;
export const PC_Tuba = 58;
export const PC_Muted_Trumpet = 59;
export const PC_French_Horn = 60;
export const PC_Brass_Section = 61;
export const PC_Synth_Brass_1 = 62;
export const PC_Synth_Brass_2 = 63;
export const PC_Soprano_Sax = 64;
export const PC_Alto_Sax = 65;
export const PC_Tenor_Sax = 66;
export const PC_Baritone_Sax = 67;
export const PC_Oboe = 68;
export const PC_English_Horn = 69;
export const PC_Bassoon = 70;
export const PC_Clarinet = 71;
export const PC_Piccolo = 72;
export const PC_Flute = 73;
export const PC_Recorder = 74;
export const PC_Pan_Flute = 75;
export const PC_Blown_bottle = 76;
export const PC_Shakuhachi = 77;
export const PC_Whistle = 78;
export const PC_Ocarina = 79;
export const PC_Lead_1_square = 80;
export const PC_Lead_2_sawtooth = 81;
export const PC_Lead_3_calliope = 82;
export const PC_Lead_4_chiff = 83;
export const PC_Lead_5_charang = 84;
export const PC_Lead_6_voice = 85;
export const PC_Lead_7_fifths = 86;
export const PC_Lead_8_bass_plus_lead = 87;
export const PC_Pad_1_new_age = 88;
export const PC_Pad_2_warm = 89;
export const PC_Pad_3_polysynth = 90;
export const PC_Pad_4_choir = 91;
export const PC_Pad_5_bowed = 92;
export const PC_Pad_6_metallic = 93;
export const PC_Pad_7_halo = 94;
export const PC_Pad_8_sweep = 95;
export const PC_FX_1_rain = 96;
export const PC_FX_2_soundtrack = 97;
export const PC_FX_3_crystal = 98;
export const PC_FX_4_atmosphere = 99;
export const PC_FX_5_brightness = 100;
export const PC_FX_6_goblins = 101;
export const PC_FX_7_echoes = 102;
export const PC_FX_8_scifi = 103;
export const PC_Sitar = 104;
export const PC_Banjo = 105;
export const PC_Shamisen = 106;
export const PC_Koto = 107;
export const PC_Kalimba = 108;
export const PC_Bagpipe = 109;
export const PC_Fiddle = 110;
export const PC_Shanai = 111;
export const PC_Tinkle_Bell = 112;
export const PC_Agogo = 113;
export const PC_Steel_Drums = 114;
export const PC_Woodblock = 115;
export const PC_Taiko_Drum = 116;
export const PC_Melodic_Tom = 117;
export const PC_Synth_Drum = 118;
export const PC_Reverse_Cymbal = 119;
export const PC_Guitar_Fret_Noise = 120;
export const PC_Breath_Noise = 121;
export const PC_Seashore = 122;
export const PC_Bird_Tweet = 123;
export const PC_Telephone_Ring = 124;
export const PC_Helicopter = 125;
export const PC_Applause = 126;
export const PC_Gunshot = 127;

// further constants — module-private, as their `private static` originals were
const TICKS_PER_METER_CLICK = 24; // number of ticks that need to pass on the MIDI clock for the metronome to click
const THIRTY_SECOND_NOTES_PER_QUARTER = 8; // 1/4 consists of 8 1/32

/**
 * a little helper to convert int numbers into 4-byte arrays
 *
 * **The two flag names are swapped relative to what they do**, faithfully to Java.
 * `isBigEndian === true` puts the *least* significant byte first (little endian),
 * and `false` puts the most significant byte first (big endian, i.e. network
 * order). `createTempo` — the only caller in the port — passes `false` and then
 * takes bytes 1..3, which is the correct big-endian 24-bit tempo value, so the
 * misnaming is invisible in the output. Renaming the parameter would be a public
 * signature change; the tests pin both directions.
 *
 * @param value truncated to a 32-bit integer first
 * @param isBigEndian false = most significant byte first, true = least significant first
 */
export function intToByteArray(value: number, isBigEndian: boolean): Uint8Array {
  // Ensure value is treated as a 32-bit integer
  const int32 = value | 0;
  const byteArray = new Uint8Array(4);

  if (isBigEndian) {
    // big endian byte array
    byteArray[0] = int32 & 0xff;
    byteArray[1] = (int32 >>> 8) & 0xff;
    byteArray[2] = (int32 >>> 16) & 0xff;
    byteArray[3] = (int32 >>> 24) & 0xff;
  } else {
    // little endian byte array (network / big-endian order)
    byteArray[0] = (int32 >>> 24) & 0xff;
    byteArray[1] = (int32 >>> 16) & 0xff;
    byteArray[2] = (int32 >>> 8) & 0xff;
    byteArray[3] = int32 & 0xff;
  }

  return byteArray;
}

/**
 * a little helper to convert a byte array into an integer number
 *
 * Most significant byte first, and via 32-bit `<<`, so more than four bytes
 * overflow silently. Its one caller is `Midi.getTempoData`, on a 3-byte
 * set-tempo payload.
 *
 * **Parity note, latent, do not "fix".** Java is `new BigInteger(bytes).intValue()`
 * (`EventMaker.java:354`), which reads the array as a **signed** two's-complement
 * big-endian integer; this reads it as unsigned. The two disagree exactly when the
 * leading byte has its top bit set — for a tempo payload that means
 * mpq ≥ 0x800000, i.e. slower than about 7.15 BPM, where Java yields a negative
 * microsecond count and a negative BPM. They also disagree on an empty array,
 * where Java throws `NumberFormatException` and this returns 0. No fixture reaches
 * either case.
 */
export function byteArrayToInt(bytes: Uint8Array): number {
  let val = 0;
  for (const byte of bytes) {
    val = (val << 8) | (byte & 0xff);
  }
  return val;
}

/**
 * convert a short to a byte array
 *
 * One byte, not two, despite the name — it is Java's `short` narrowed to the
 * single-byte payload a channel-prefix or port meta event carries.
 */
export function shortToByteArray(value: number): Uint8Array {
  return new Uint8Array([value & 0xff]);
}

/**
 * create a note off event
 *
 * @param chan MIDI channel; masked to 0..15 by `ShortMessage`
 * @param date absolute tick
 * @param pitch MIDI key number; masked to 0..127, **not** clamped
 * @param vel release velocity, clamped into 0..127
 */
export function createNoteOff(
  chan: number,
  date: number,
  pitch: number,
  vel: number,
): MidiEvent | null {
  const velocity = vel > 127 ? 127 : vel < 0 ? 0 : vel;

  try {
    return new MidiEvent(new ShortMessage(NOTE_OFF, chan, pitch, velocity), date);
  } catch (e) {
    console.error(e);
    return null;
  }
}

/**
 * create a note on event
 *
 * A noteOn with velocity 0 is the conventional alternative encoding of a noteOff;
 * `Midi.noteOns2NoteOffs` converts between the two forms.
 *
 * @param chan MIDI channel; masked to 0..15 by `ShortMessage`
 * @param date absolute tick
 * @param pitch MIDI key number; masked to 0..127, **not** clamped
 * @param vel attack velocity, clamped into 0..127
 */
export function createNoteOn(
  chan: number,
  date: number,
  pitch: number,
  vel: number,
): MidiEvent | null {
  const velocity = vel > 127 ? 127 : vel < 0 ? 0 : vel;

  try {
    return new MidiEvent(new ShortMessage(NOTE_ON, chan, pitch, velocity), date);
  } catch (e) {
    console.error(e);
    return null;
  }
}

/**
 * create a program change event by parsing the name string and finding a known substring
 *
 * The name is resolved by fuzzy match against the embedded instruments dictionary —
 * see `InstrumentsDictionary.getProgramChange`, which never fails and falls back to
 * Acoustic Grand Piano. A **fresh dictionary is built on every call** (Java does the
 * same), which is why this is the expensive factory; `Msm.makeInstrumentName` calls
 * it once per part.
 *
 * @param chan MIDI channel
 * @param date absolute tick
 * @param name an instrument name in any language the dictionary covers
 */
export function createProgramChangeByName(
  chan: number,
  date: number,
  name: string,
): MidiEvent | null {
  let dict: InstrumentsDictionary;
  try {
    dict = new InstrumentsDictionary(); // initialize instruments dictionary
  } catch {
    // if there were problems initializing the instruments dictionary
    return createProgramChange(chan, date, PC_Acoustic_Grand_Piano); // use Acoustic Grand Piano as default instrument
  }

  return createProgramChange(chan, date, dict.getProgramChange(name)); // search the instrument's name in the dictionary and use the program change number it returns
}

/**
 * create a program change event with the program change number
 *
 * @param programNumber masked to 0..127 by `ShortMessage`, not clamped, so 200 → 72
 */
export function createProgramChange(
  chan: number,
  date: number,
  programNumber: number,
): MidiEvent | null {
  try {
    return new MidiEvent(new ShortMessage(PROGRAM_CHANGE, chan, programNumber, 0), date);
  } catch (e) {
    console.error(e);
    return null;
  }
}

/**
 * create a control change event
 * @param controllerNumber see the `CC_*` constants; masked to 0..127, not clamped
 * @param controllerValue clamped into 0..127
 */
export function createControlChange(
  chan: number,
  date: number,
  controllerNumber: number,
  controllerValue: number,
): MidiEvent | null {
  const value = controllerValue > 127 ? 127 : controllerValue < 0 ? 0 : controllerValue;

  try {
    return new MidiEvent(new ShortMessage(CONTROL_CHANGE, chan, controllerNumber, value), date);
  } catch (e) {
    console.error(e);
    return null;
  }
}

/**
 * create a key signature event
 *
 * The payload is `<accids> <mode>`, and **mode is hard-coded to 0 (major)** —
 * Java does the same, so a minor key is written as its relative major's
 * signature. The second payload byte is therefore always 0.
 *
 * @param accids number of accidentals, negative for flats; the sign survives the
 *   `& 0xff` as a two's-complement byte, which is what the format wants
 */
export function createKeySignature(date: number, accids: number): MidiEvent | null {
  try {
    return new MidiEvent(
      new MetaMessage(META_Key_Signature, new Uint8Array([accids & 0xff, 0]), 2),
      date,
    );
  } catch (e) {
    console.error(e);
    return null;
  }
}

/**
 * create a time signature event
 *
 * The format stores the denominator as a power of two, so `denom` is the exponent:
 * 4 → 2, 8 → 3. A denominator that is not a power of two rounds **up** to the next
 * one (3 → 2, i.e. 4), because the loop stops at the first exponent whose power
 * reaches it. The trailing two payload bytes are constants, not parameters.
 *
 * @param numerator beats per bar, masked to a byte
 * @param denominator beat unit as an ordinary number (4 for a quarter, 8 for an eighth)
 */
export function createTimeSignature(
  date: number,
  numerator: number,
  denominator: number,
): MidiEvent | null {
  let denom = 1;
  while (Math.pow(2, denom) < denominator) ++denom;

  try {
    return new MidiEvent(
      new MetaMessage(
        META_Time_Signature,
        new Uint8Array([
          numerator & 0xff,
          denom & 0xff,
          TICKS_PER_METER_CLICK,
          THIRTY_SECOND_NOTES_PER_QUARTER,
        ]),
        4,
      ),
      date,
    );
  } catch (e) {
    console.error(e);
    return null;
  }
}

/**
 * create tempo event
 *
 * MIDI stores tempo as microseconds per quarter note, so the beat unit has to be
 * folded in: `mpq = 60000000 / (bpm * beatlength * 4)`, where `beatlength * 4`
 * converts the beat into quarters. The result is rounded to an integer and only
 * its low three bytes are written, which is the format's 24-bit field —
 * `intToByteArray` produces four and bytes 1..3 are the ones taken.
 *
 * @param bpm beats per minute, where a "beat" is `beatlength` long
 * @param beatlength length of one beat in floating point format (e.g. quarter=0.25, whole=1; eight=0.125)
 */
export function createTempo(date: number, bpm: number, beatlength: number): MidiEvent | null {
  const mpq = Math.round(60000000 / (bpm * beatlength * 4)); // compute microseconds per quarter note from bpm
  const tempo = intToByteArray(mpq, false); // generate byte array (little endian) from mpq

  try {
    return new MidiEvent(
      new MetaMessage(META_Set_Tempo, new Uint8Array([tempo[1], tempo[2], tempo[3]]), 3),
      date,
    ); // create the event; only the 2nd, 3rd and 4th byte of the tempo byte array are needed
  } catch (e) {
    console.error(e);
    return null;
  }
}

/**
 * create a track name event
 *
 * The four text-carrying factories below (`createTrackName`, `createInstrumentName`,
 * `createTextEvent`, `createMarker`) all encode as **UTF-8** and pass the encoded
 * byte length, not the string length — so a name with non-ASCII characters produces
 * a longer payload than it has characters. Java uses `String.getBytes()`, i.e. the
 * platform default charset, which is UTF-8 on the reference machine; on a machine
 * with a different default the two would disagree on non-ASCII names.
 */
export function createTrackName(date: number, name: string): MidiEvent | null {
  const text = new TextEncoder().encode(name);
  try {
    return new MidiEvent(new MetaMessage(META_Track_Name, text, text.length), date);
  } catch (e) {
    console.error(e);
    return null;
  }
}

/**
 * create a instrument name event
 * @param name the instrument's display name; encoded UTF-8, see `createTrackName`
 */
export function createInstrumentName(date: number, name: string): MidiEvent | null {
  const text = new TextEncoder().encode(name);
  try {
    return new MidiEvent(new MetaMessage(META_Instrument_Name, text, text.length), date);
  } catch (e) {
    console.error(e);
    return null;
  }
}

/**
 * create a plain text event
 *
 * `Msm.exportMidi` writes one of these before every noteOn, carrying the note's
 * `xml:id`. That is what makes a rendered MIDI file traceable back to the MEI, and
 * it is why text events appear in the reference files at the same ticks as notes —
 * their relative order comes from `Track.add`'s stable sort.
 */
export function createTextEvent(date: number, plainText: string): MidiEvent | null {
  const text = new TextEncoder().encode(plainText);
  try {
    return new MidiEvent(new MetaMessage(META_Text_Event, text, text.length), date);
  } catch (e) {
    console.error(e);
    return null;
  }
}

/**
 * create a marker event
 * @param markerText a rehearsal mark or section label; encoded UTF-8
 */
export function createMarker(date: number, markerText: string): MidiEvent | null {
  const text = new TextEncoder().encode(markerText);
  try {
    return new MidiEvent(new MetaMessage(META_Marker, text, text.length), date);
  } catch (e) {
    console.error(e);
    return null;
  }
}

/**
 * this creates a channel prefix event, it indicates that all subsequent meta messages go to this channel
 * @param channel truncated to one byte by `shortToByteArray`, not masked to 0..15
 */
export function createChannelPrefix(date: number, channel: number): MidiEvent | null {
  try {
    return new MidiEvent(
      new MetaMessage(META_Midi_Channel_Prefix, shortToByteArray(channel), 1),
      date,
    );
  } catch (e) {
    console.error(e);
    return null;
  }
}

/**
 * this creates a midi port event
 *
 * A track's port plus its channel prefix is how `Msm.exportMidi` addresses more
 * than 16 parts: parts beyond channel 15 continue on the next port.
 */
export function createMidiPortEvent(date: number, port: number): MidiEvent | null {
  try {
    return new MidiEvent(new MetaMessage(META_Midi_Port, shortToByteArray(port), 1), date);
  } catch (e) {
    console.error(e);
    return null;
  }
}

/**
 * The former `EventMaker` class's public surface, as a re-export table.
 *
 * Every property is the binding declared above — `EventMaker.createNoteOn === createNoteOn`
 * — so this adds no behaviour and cannot drift from the module. It is deliberately a plain
 * object literal, not a frozen or null-prototype one: the class it replaces inherited
 * `Object.prototype` (through `Function.prototype`) and allowed writes to its statics, and a
 * plain object is the form that keeps both of those true. Nothing in `src/` or `tests/`
 * indexes it with a computed key, so there is no unknown-key lookup path to harden.
 *
 * The two `private static` constants of the old class (`TICKS_PER_METER_CLICK`,
 * `THIRTY_SECOND_NOTES_PER_QUARTER`) are module-private and deliberately absent here.
 */
export const EventMaker = {
  NOTE_OFF,
  NOTE_ON,
  POLY_AFTERTOUCH,
  CONTROL_CHANGE,
  PROGRAM_CHANGE,
  CHANNEL_AFTERTOUCH,
  PITCH_BEND,
  SYSEX_START,
  MIDI_TIME_CODE,
  SONG_POSITION_POINTER,
  SONG_SELECT,
  UNDEF1,
  UNDEF2,
  TUNE_REQUEST,
  SYSEX_END,
  TIMING_CLOCK,
  UNDEF3,
  START,
  CONTINUE,
  STOP,
  UNDEF4,
  ACTIVE_SENSING,
  SYSTEM_RESET,
  META_EVENT,

  CC_Bank_Select,
  CC_Modulation_Wheel,
  CC_Breath_Ctrl,
  CC_Undefined_Ctrl_1,
  CC_Foot_Ctrl,
  CC_Portamento_Time,
  CC_Data_Entry,
  CC_Channel_Volume,
  CC_Balance,
  CC_Undefined_Ctrl_2,
  CC_Pan,
  CC_Expression_Ctrl,
  CC_Effect_Ctrl_1,
  CC_Effect_Ctrl_2,
  CC_Undefined_Ctrl_3,
  CC_Undefined_Ctrl_4,
  CC_General_Purpose_Ctrl_1,
  CC_General_Purpose_Ctrl_2,
  CC_General_Purpose_Ctrl_3,
  CC_General_Purpose_Ctrl_4,
  CC_Undefined_Ctrl_5,
  CC_Undefined_Ctrl_6,
  CC_Undefined_Ctrl_7,
  CC_Undefined_Ctrl_8,
  CC_Undefined_Ctrl_9,
  CC_Undefined_Ctrl_10,
  CC_Undefined_Ctrl_11,
  CC_Undefined_Ctrl_12,
  CC_Undefined_Ctrl_13,
  CC_Undefined_Ctrl_14,
  CC_Undefined_Ctrl_15,
  CC_Undefined_Ctrl_16,
  CC_Bank_Select_14b,
  CC_Modulation_Wheel_14b,
  CC_Breath_Ctrl_14b,
  CC_Undefined_Ctrl_1_14b,
  CC_Foot_Ctrl_14b,
  CC_Portamento_Time_14b,
  CC_Data_Entry_14b,
  CC_Channel_Volume_14b,
  CC_Balance_14b,
  CC_Undefined_Ctrl_2_14b,
  CC_Pan_14b,
  CC_Expression_Ctrl_14b,
  CC_Effect_Ctrl_1_14b,
  CC_Effect_Ctrl_2_14b,
  CC_Undefined_Ctrl_3_14b,
  CC_Undefined_Ctrl_4_14b,
  CC_General_Purpose_Ctrl_1_14b,
  CC_General_Purpose_Ctrl_2_14b,
  CC_General_Purpose_Ctrl_3_14b,
  CC_General_Purpose_Ctrl_4_14b,
  CC_Undefined_Ctrl_5_14b,
  CC_Undefined_Ctrl_6_14b,
  CC_Undefined_Ctrl_7_14b,
  CC_Undefined_Ctrl_8_14b,
  CC_Undefined_Ctrl_9_14b,
  CC_Undefined_Ctrl_10_14b,
  CC_Undefined_Ctrl_11_14b,
  CC_Undefined_Ctrl_12_14b,
  CC_Undefined_Ctrl_13_14b,
  CC_Undefined_Ctrl_14_14b,
  CC_Undefined_Ctrl_15_14b,
  CC_Undefined_Ctrl_16_14b,
  CC_Damper_Pedal,
  CC_Portamento_OnOff,
  CC_Sustenuto,
  CC_Soft_Pedal,
  CC_Legato_Footswitch,
  CC_Hold_2,
  CC_Sound_Ctrl_1,
  CC_Sound_Ctrl_2,
  CC_Sound_Ctrl_3,
  CC_Sound_Ctrl_4,
  CC_Sound_Ctrl_5,
  CC_Sound_Ctrl_6,
  CC_Sound_Ctrl_7,
  CC_Sound_Ctrl_8,
  CC_Sound_Ctrl_9,
  CC_Sound_Ctrl_10,
  CC_General_Purpose_Ctrl_5,
  CC_General_Purpose_Ctrl_6,
  CC_General_Purpose_Ctrl_7,
  CC_General_Purpose_Ctrl_8,
  CC_Portamento_Ctrl,
  CC_Undefined_Ctrl_17,
  CC_Undefined_Ctrl_18,
  CC_Undefined_Ctrl_19,
  CC_Undefined_Ctrl_20,
  CC_Undefined_Ctrl_21,
  CC_Undefined_Ctrl_22,
  CC_Reverb_Send_Level,
  CC_Effects_2_Depth,
  CC_Chorus_Send_Level,
  CC_Effects_4_Depth,
  CC_Effects_5_Depth,
  CC_Data_Entry_plus_1,
  CC_Data_Entry_minus_1,
  CC_Nonregistered_Param_Num_LSB,
  CC_Nonregistered_Param_Num_MSB,
  CC_Registered_Param_Num_LSB,
  CC_Registered_Param_Num_MSB,
  CC_Undefined_Ctrl_23,
  CC_Undefined_Ctrl_24,
  CC_Undefined_Ctrl_25,
  CC_Undefined_Ctrl_26,
  CC_Undefined_Ctrl_27,
  CC_Undefined_Ctrl_28,
  CC_Undefined_Ctrl_29,
  CC_Undefined_Ctrl_30,
  CC_Undefined_Ctrl_31,
  CC_Undefined_Ctrl_32,
  CC_Undefined_Ctrl_33,
  CC_Undefined_Ctrl_34,
  CC_Undefined_Ctrl_35,
  CC_Undefined_Ctrl_36,
  CC_Undefined_Ctrl_37,
  CC_Undefined_Ctrl_38,
  CC_Undefined_Ctrl_39,
  CC_Undefined_Ctrl_40,
  CC_All_Sound_Off,
  CC_Reset_All_Controllers,
  CC_Local_Control_OnOff,
  CC_All_Notes_Off,
  CC_Omni_Mode_Off,
  CC_Omni_Mode_On,
  CC_Poly_Mode_OnOff,
  CC_Poly_Mode_On,

  META_Sequence_Number,
  META_Text_Event,
  META_Copyright_Notice,
  META_Track_Name,
  META_Sequence_Name,
  META_Instrument_Name,
  META_Lyric,
  META_Marker,
  META_Cue_Point,
  META_Program_Name,
  META_Device_Name,
  META_Midi_Channel_Prefix,
  META_Midi_Port,
  META_End_of_Track,
  META_Set_Tempo,
  META_SMTPE_Offset,
  META_Time_Signature,
  META_Key_Signature,
  META_Sequence_specific_Meta_event,

  PC_Acoustic_Grand_Piano,
  PC_Bright_Acoustic_Piano,
  PC_Electric_Grand_Piano,
  PC_Honkytonk_Piano,
  PC_Electric_Piano_1,
  PC_Electric_Piano_2,
  PC_Harpsichord,
  PC_Clavinet,
  PC_Celesta,
  PC_Glockenspiel,
  PC_Music_Box,
  PC_Vibraphone,
  PC_Marimba,
  PC_Xylophone,
  PC_Tubular_Bells,
  PC_Dulcimer,
  PC_Drawbar_Organ,
  PC_Percussive_Organ,
  PC_Rock_Organ,
  PC_Church_Organ,
  PC_Reed_Organ,
  PC_Accordion,
  PC_Harmonica,
  PC_Tango_Accordion,
  PC_Acoustic_Guitar_nylon,
  PC_Acoustic_Guitar_steel,
  PC_Electric_Guitar_jazz,
  PC_Electric_Guitar_clean,
  PC_Electric_Guitar_muted,
  PC_Overdriven_Guitar,
  PC_Distortion_Guitar,
  PC_Guitar_Harmonics,
  PC_Acoustic_Bass,
  PC_Electric_Bass_finger,
  PC_Electric_Bass_pick,
  PC_Fretless_Bass,
  PC_Slap_Bass_1,
  PC_Slap_Bass_2,
  PC_Synth_Bass_1,
  PC_Synth_Bass_2,
  PC_Violin,
  PC_Viola,
  PC_Cello,
  PC_Contrabass,
  PC_Tremolo_Strings,
  PC_Pizzicato_Strings,
  PC_Orchestral_Harp,
  PC_Timpani,
  PC_String_Ensemble_1,
  PC_String_Ensemble_2,
  PC_Synth_Strings_1,
  PC_Synth_Strings_2,
  PC_Choir_Aahs,
  PC_Voice_Oohs,
  PC_Synth_Choir,
  PC_Orchestra_Hit,
  PC_Trumpet,
  PC_Trombone,
  PC_Tuba,
  PC_Muted_Trumpet,
  PC_French_Horn,
  PC_Brass_Section,
  PC_Synth_Brass_1,
  PC_Synth_Brass_2,
  PC_Soprano_Sax,
  PC_Alto_Sax,
  PC_Tenor_Sax,
  PC_Baritone_Sax,
  PC_Oboe,
  PC_English_Horn,
  PC_Bassoon,
  PC_Clarinet,
  PC_Piccolo,
  PC_Flute,
  PC_Recorder,
  PC_Pan_Flute,
  PC_Blown_bottle,
  PC_Shakuhachi,
  PC_Whistle,
  PC_Ocarina,
  PC_Lead_1_square,
  PC_Lead_2_sawtooth,
  PC_Lead_3_calliope,
  PC_Lead_4_chiff,
  PC_Lead_5_charang,
  PC_Lead_6_voice,
  PC_Lead_7_fifths,
  PC_Lead_8_bass_plus_lead,
  PC_Pad_1_new_age,
  PC_Pad_2_warm,
  PC_Pad_3_polysynth,
  PC_Pad_4_choir,
  PC_Pad_5_bowed,
  PC_Pad_6_metallic,
  PC_Pad_7_halo,
  PC_Pad_8_sweep,
  PC_FX_1_rain,
  PC_FX_2_soundtrack,
  PC_FX_3_crystal,
  PC_FX_4_atmosphere,
  PC_FX_5_brightness,
  PC_FX_6_goblins,
  PC_FX_7_echoes,
  PC_FX_8_scifi,
  PC_Sitar,
  PC_Banjo,
  PC_Shamisen,
  PC_Koto,
  PC_Kalimba,
  PC_Bagpipe,
  PC_Fiddle,
  PC_Shanai,
  PC_Tinkle_Bell,
  PC_Agogo,
  PC_Steel_Drums,
  PC_Woodblock,
  PC_Taiko_Drum,
  PC_Melodic_Tom,
  PC_Synth_Drum,
  PC_Reverse_Cymbal,
  PC_Guitar_Fret_Noise,
  PC_Breath_Noise,
  PC_Seashore,
  PC_Bird_Tweet,
  PC_Telephone_Ring,
  PC_Helicopter,
  PC_Applause,
  PC_Gunshot,

  intToByteArray,
  byteArrayToInt,
  shortToByteArray,
  createNoteOff,
  createNoteOn,
  createProgramChangeByName,
  createProgramChange,
  createControlChange,
  createKeySignature,
  createTimeSignature,
  createTempo,
  createTrackName,
  createInstrumentName,
  createTextEvent,
  createMarker,
  createChannelPrefix,
  createMidiPortEvent,
} as const;
