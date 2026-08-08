/**
 * This helper class provides some useful midi-related functions.
 * Port of meico.midi.EventMaker
 *
 * Every `create*` method is a factory for one `MidiEvent`, and every one of them
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
 * hexadecimal; the two must agree (e.g. `EventMaker.NOTE_ON` 144 = `ShortMessage.NOTE_ON`
 * 0x90). They are deliberately not cross-referenced: this class mirrors Java's
 * `EventMaker`, which has no dependency on `javax.sound.midi`'s constants either.
 *
 * @author Axel Berndt
 */

import { MidiEvent, ShortMessage, MetaMessage } from './MidiTypes.js';
import { InstrumentsDictionary } from './InstrumentsDictionary.js';

export class EventMaker {
  // use these constants for the event type
  static readonly NOTE_OFF = 128;
  static readonly NOTE_ON = 144;
  static readonly POLY_AFTERTOUCH = 160;
  static readonly CONTROL_CHANGE = 176;
  static readonly PROGRAM_CHANGE = 192;
  static readonly CHANNEL_AFTERTOUCH = 208;
  static readonly PITCH_BEND = 224;
  static readonly SYSEX_START = 240;
  static readonly MIDI_TIME_CODE = 241;
  static readonly SONG_POSITION_POINTER = 242;
  static readonly SONG_SELECT = 243;
  static readonly UNDEF1 = 244;
  static readonly UNDEF2 = 245;
  static readonly TUNE_REQUEST = 246;
  static readonly SYSEX_END = 247;
  static readonly TIMING_CLOCK = 248;
  static readonly UNDEF3 = 249;
  static readonly START = 250;
  static readonly CONTINUE = 251;
  static readonly STOP = 252;
  static readonly UNDEF4 = 253;
  static readonly ACTIVE_SENSING = 254;
  static readonly SYSTEM_RESET = 255;
  static readonly META_EVENT = 255;

  // use these constants to set the controller number of a CONTROL_CHANGE event
  static readonly CC_Bank_Select = 0;
  static readonly CC_Modulation_Wheel = 1;
  static readonly CC_Breath_Ctrl = 2;
  static readonly CC_Undefined_Ctrl_1 = 3;
  static readonly CC_Foot_Ctrl = 4;
  static readonly CC_Portamento_Time = 5;
  static readonly CC_Data_Entry = 6;
  static readonly CC_Channel_Volume = 7;
  static readonly CC_Balance = 8;
  static readonly CC_Undefined_Ctrl_2 = 9;
  static readonly CC_Pan = 10;
  static readonly CC_Expression_Ctrl = 11;
  static readonly CC_Effect_Ctrl_1 = 12;
  static readonly CC_Effect_Ctrl_2 = 13;
  static readonly CC_Undefined_Ctrl_3 = 14;
  static readonly CC_Undefined_Ctrl_4 = 15;
  static readonly CC_General_Purpose_Ctrl_1 = 16;
  static readonly CC_General_Purpose_Ctrl_2 = 17;
  static readonly CC_General_Purpose_Ctrl_3 = 18;
  static readonly CC_General_Purpose_Ctrl_4 = 19;
  static readonly CC_Undefined_Ctrl_5 = 20;
  static readonly CC_Undefined_Ctrl_6 = 21;
  static readonly CC_Undefined_Ctrl_7 = 22;
  static readonly CC_Undefined_Ctrl_8 = 23;
  static readonly CC_Undefined_Ctrl_9 = 24;
  static readonly CC_Undefined_Ctrl_10 = 25;
  static readonly CC_Undefined_Ctrl_11 = 26;
  static readonly CC_Undefined_Ctrl_12 = 27;
  static readonly CC_Undefined_Ctrl_13 = 28;
  static readonly CC_Undefined_Ctrl_14 = 29;
  static readonly CC_Undefined_Ctrl_15 = 30;
  static readonly CC_Undefined_Ctrl_16 = 31;
  static readonly CC_Bank_Select_14b = 32;
  static readonly CC_Modulation_Wheel_14b = 33;
  static readonly CC_Breath_Ctrl_14b = 34;
  static readonly CC_Undefined_Ctrl_1_14b = 35;
  static readonly CC_Foot_Ctrl_14b = 36;
  static readonly CC_Portamento_Time_14b = 37;
  static readonly CC_Data_Entry_14b = 38;
  static readonly CC_Channel_Volume_14b = 39;
  static readonly CC_Balance_14b = 40;
  static readonly CC_Undefined_Ctrl_2_14b = 41;
  static readonly CC_Pan_14b = 42;
  static readonly CC_Expression_Ctrl_14b = 43;
  static readonly CC_Effect_Ctrl_1_14b = 44;
  static readonly CC_Effect_Ctrl_2_14b = 45;
  static readonly CC_Undefined_Ctrl_3_14b = 46;
  static readonly CC_Undefined_Ctrl_4_14b = 47;
  static readonly CC_General_Purpose_Ctrl_1_14b = 48;
  static readonly CC_General_Purpose_Ctrl_2_14b = 49;
  static readonly CC_General_Purpose_Ctrl_3_14b = 50;
  static readonly CC_General_Purpose_Ctrl_4_14b = 51;
  static readonly CC_Undefined_Ctrl_5_14b = 52;
  static readonly CC_Undefined_Ctrl_6_14b = 53;
  static readonly CC_Undefined_Ctrl_7_14b = 54;
  static readonly CC_Undefined_Ctrl_8_14b = 55;
  static readonly CC_Undefined_Ctrl_9_14b = 56;
  static readonly CC_Undefined_Ctrl_10_14b = 57;
  static readonly CC_Undefined_Ctrl_11_14b = 58;
  static readonly CC_Undefined_Ctrl_12_14b = 59;
  static readonly CC_Undefined_Ctrl_13_14b = 60;
  static readonly CC_Undefined_Ctrl_14_14b = 61;
  static readonly CC_Undefined_Ctrl_15_14b = 62;
  static readonly CC_Undefined_Ctrl_16_14b = 63;
  static readonly CC_Damper_Pedal = 64;
  static readonly CC_Portamento_OnOff = 65;
  static readonly CC_Sustenuto = 66;
  static readonly CC_Soft_Pedal = 67;
  static readonly CC_Legato_Footswitch = 68;
  static readonly CC_Hold_2 = 69;
  static readonly CC_Sound_Ctrl_1 = 70;
  static readonly CC_Sound_Ctrl_2 = 71;
  static readonly CC_Sound_Ctrl_3 = 72;
  static readonly CC_Sound_Ctrl_4 = 73;
  static readonly CC_Sound_Ctrl_5 = 74;
  static readonly CC_Sound_Ctrl_6 = 75;
  static readonly CC_Sound_Ctrl_7 = 76;
  static readonly CC_Sound_Ctrl_8 = 77;
  static readonly CC_Sound_Ctrl_9 = 78;
  static readonly CC_Sound_Ctrl_10 = 79;
  static readonly CC_General_Purpose_Ctrl_5 = 80;
  static readonly CC_General_Purpose_Ctrl_6 = 81;
  static readonly CC_General_Purpose_Ctrl_7 = 82;
  static readonly CC_General_Purpose_Ctrl_8 = 83;
  static readonly CC_Portamento_Ctrl = 84;
  static readonly CC_Undefined_Ctrl_17 = 85;
  static readonly CC_Undefined_Ctrl_18 = 86;
  static readonly CC_Undefined_Ctrl_19 = 87;
  static readonly CC_Undefined_Ctrl_20 = 88;
  static readonly CC_Undefined_Ctrl_21 = 89;
  static readonly CC_Undefined_Ctrl_22 = 90;
  static readonly CC_Reverb_Send_Level = 91;
  static readonly CC_Effects_2_Depth = 92;
  static readonly CC_Chorus_Send_Level = 93;
  static readonly CC_Effects_4_Depth = 94;
  static readonly CC_Effects_5_Depth = 95;
  static readonly CC_Data_Entry_plus_1 = 96;
  static readonly CC_Data_Entry_minus_1 = 97;
  static readonly CC_Nonregistered_Param_Num_LSB = 98;
  static readonly CC_Nonregistered_Param_Num_MSB = 99;
  static readonly CC_Registered_Param_Num_LSB = 100;
  static readonly CC_Registered_Param_Num_MSB = 101;
  static readonly CC_Undefined_Ctrl_23 = 102;
  static readonly CC_Undefined_Ctrl_24 = 103;
  static readonly CC_Undefined_Ctrl_25 = 104;
  static readonly CC_Undefined_Ctrl_26 = 105;
  static readonly CC_Undefined_Ctrl_27 = 106;
  static readonly CC_Undefined_Ctrl_28 = 107;
  static readonly CC_Undefined_Ctrl_29 = 108;
  static readonly CC_Undefined_Ctrl_30 = 109;
  static readonly CC_Undefined_Ctrl_31 = 110;
  static readonly CC_Undefined_Ctrl_32 = 111;
  static readonly CC_Undefined_Ctrl_33 = 112;
  static readonly CC_Undefined_Ctrl_34 = 113;
  static readonly CC_Undefined_Ctrl_35 = 114;
  static readonly CC_Undefined_Ctrl_36 = 115;
  static readonly CC_Undefined_Ctrl_37 = 116;
  static readonly CC_Undefined_Ctrl_38 = 117;
  static readonly CC_Undefined_Ctrl_39 = 118;
  static readonly CC_Undefined_Ctrl_40 = 119;
  static readonly CC_All_Sound_Off = 120;
  static readonly CC_Reset_All_Controllers = 121;
  static readonly CC_Local_Control_OnOff = 122;
  static readonly CC_All_Notes_Off = 123;
  static readonly CC_Omni_Mode_Off = 124;
  static readonly CC_Omni_Mode_On = 125;
  static readonly CC_Poly_Mode_OnOff = 126;
  static readonly CC_Poly_Mode_On = 127;

  // if the event type is meta event, use these constants to indicate the metaevent type
  static readonly META_Sequence_Number = 0; //0x00
  static readonly META_Text_Event = 1; //0x01
  static readonly META_Copyright_Notice = 2; //0x02
  static readonly META_Track_Name = 3; //0x03
  static readonly META_Sequence_Name = 3; //0x03
  static readonly META_Instrument_Name = 4; //0x04
  static readonly META_Lyric = 5; //0x05
  static readonly META_Marker = 6; //0x06
  static readonly META_Cue_Point = 7; //0x07
  static readonly META_Program_Name = 8; //0x08
  static readonly META_Device_Name = 9; //0x09
  static readonly META_Midi_Channel_Prefix = 32; //0x20
  static readonly META_Midi_Port = 33; //0x21
  static readonly META_End_of_Track = 47; //0x2F
  static readonly META_Set_Tempo = 81; //0x51
  static readonly META_SMTPE_Offset = 84; //0x54
  static readonly META_Time_Signature = 88; //0x58
  static readonly META_Key_Signature = 89; //0x59
  static readonly META_Sequence_specific_Meta_event = 127; //0x7F

  // use these constants for program change codes
  static readonly PC_Acoustic_Grand_Piano = 0;
  static readonly PC_Bright_Acoustic_Piano = 1;
  static readonly PC_Electric_Grand_Piano = 2;
  static readonly PC_Honkytonk_Piano = 3;
  static readonly PC_Electric_Piano_1 = 4;
  static readonly PC_Electric_Piano_2 = 5;
  static readonly PC_Harpsichord = 6;
  static readonly PC_Clavinet = 7;
  static readonly PC_Celesta = 8;
  static readonly PC_Glockenspiel = 9;
  static readonly PC_Music_Box = 10;
  static readonly PC_Vibraphone = 11;
  static readonly PC_Marimba = 12;
  static readonly PC_Xylophone = 13;
  static readonly PC_Tubular_Bells = 14;
  static readonly PC_Dulcimer = 15;
  static readonly PC_Drawbar_Organ = 16;
  static readonly PC_Percussive_Organ = 17;
  static readonly PC_Rock_Organ = 18;
  static readonly PC_Church_Organ = 19;
  static readonly PC_Reed_Organ = 20;
  static readonly PC_Accordion = 21;
  static readonly PC_Harmonica = 22;
  static readonly PC_Tango_Accordion = 23;
  static readonly PC_Acoustic_Guitar_nylon = 24;
  static readonly PC_Acoustic_Guitar_steel = 25;
  static readonly PC_Electric_Guitar_jazz = 26;
  static readonly PC_Electric_Guitar_clean = 27;
  static readonly PC_Electric_Guitar_muted = 28;
  static readonly PC_Overdriven_Guitar = 29;
  static readonly PC_Distortion_Guitar = 30;
  static readonly PC_Guitar_Harmonics = 31;
  static readonly PC_Acoustic_Bass = 32;
  static readonly PC_Electric_Bass_finger = 33;
  static readonly PC_Electric_Bass_pick = 34;
  static readonly PC_Fretless_Bass = 35;
  static readonly PC_Slap_Bass_1 = 36;
  static readonly PC_Slap_Bass_2 = 37;
  static readonly PC_Synth_Bass_1 = 38;
  static readonly PC_Synth_Bass_2 = 39;
  static readonly PC_Violin = 40;
  static readonly PC_Viola = 41;
  static readonly PC_Cello = 42;
  static readonly PC_Contrabass = 43;
  static readonly PC_Tremolo_Strings = 44;
  static readonly PC_Pizzicato_Strings = 45;
  static readonly PC_Orchestral_Harp = 46;
  static readonly PC_Timpani = 47;
  static readonly PC_String_Ensemble_1 = 48;
  static readonly PC_String_Ensemble_2 = 49;
  static readonly PC_Synth_Strings_1 = 50;
  static readonly PC_Synth_Strings_2 = 51;
  static readonly PC_Choir_Aahs = 52;
  static readonly PC_Voice_Oohs = 53;
  static readonly PC_Synth_Choir = 54;
  static readonly PC_Orchestra_Hit = 55;
  static readonly PC_Trumpet = 56;
  static readonly PC_Trombone = 57;
  static readonly PC_Tuba = 58;
  static readonly PC_Muted_Trumpet = 59;
  static readonly PC_French_Horn = 60;
  static readonly PC_Brass_Section = 61;
  static readonly PC_Synth_Brass_1 = 62;
  static readonly PC_Synth_Brass_2 = 63;
  static readonly PC_Soprano_Sax = 64;
  static readonly PC_Alto_Sax = 65;
  static readonly PC_Tenor_Sax = 66;
  static readonly PC_Baritone_Sax = 67;
  static readonly PC_Oboe = 68;
  static readonly PC_English_Horn = 69;
  static readonly PC_Bassoon = 70;
  static readonly PC_Clarinet = 71;
  static readonly PC_Piccolo = 72;
  static readonly PC_Flute = 73;
  static readonly PC_Recorder = 74;
  static readonly PC_Pan_Flute = 75;
  static readonly PC_Blown_bottle = 76;
  static readonly PC_Shakuhachi = 77;
  static readonly PC_Whistle = 78;
  static readonly PC_Ocarina = 79;
  static readonly PC_Lead_1_square = 80;
  static readonly PC_Lead_2_sawtooth = 81;
  static readonly PC_Lead_3_calliope = 82;
  static readonly PC_Lead_4_chiff = 83;
  static readonly PC_Lead_5_charang = 84;
  static readonly PC_Lead_6_voice = 85;
  static readonly PC_Lead_7_fifths = 86;
  static readonly PC_Lead_8_bass_plus_lead = 87;
  static readonly PC_Pad_1_new_age = 88;
  static readonly PC_Pad_2_warm = 89;
  static readonly PC_Pad_3_polysynth = 90;
  static readonly PC_Pad_4_choir = 91;
  static readonly PC_Pad_5_bowed = 92;
  static readonly PC_Pad_6_metallic = 93;
  static readonly PC_Pad_7_halo = 94;
  static readonly PC_Pad_8_sweep = 95;
  static readonly PC_FX_1_rain = 96;
  static readonly PC_FX_2_soundtrack = 97;
  static readonly PC_FX_3_crystal = 98;
  static readonly PC_FX_4_atmosphere = 99;
  static readonly PC_FX_5_brightness = 100;
  static readonly PC_FX_6_goblins = 101;
  static readonly PC_FX_7_echoes = 102;
  static readonly PC_FX_8_scifi = 103;
  static readonly PC_Sitar = 104;
  static readonly PC_Banjo = 105;
  static readonly PC_Shamisen = 106;
  static readonly PC_Koto = 107;
  static readonly PC_Kalimba = 108;
  static readonly PC_Bagpipe = 109;
  static readonly PC_Fiddle = 110;
  static readonly PC_Shanai = 111;
  static readonly PC_Tinkle_Bell = 112;
  static readonly PC_Agogo = 113;
  static readonly PC_Steel_Drums = 114;
  static readonly PC_Woodblock = 115;
  static readonly PC_Taiko_Drum = 116;
  static readonly PC_Melodic_Tom = 117;
  static readonly PC_Synth_Drum = 118;
  static readonly PC_Reverse_Cymbal = 119;
  static readonly PC_Guitar_Fret_Noise = 120;
  static readonly PC_Breath_Noise = 121;
  static readonly PC_Seashore = 122;
  static readonly PC_Bird_Tweet = 123;
  static readonly PC_Telephone_Ring = 124;
  static readonly PC_Helicopter = 125;
  static readonly PC_Applause = 126;
  static readonly PC_Gunshot = 127;

  // further constants
  private static readonly TICKS_PER_METER_CLICK = 24; // number of ticks that need to pass on the MIDI clock for the metronome to click
  private static readonly THIRTY_SECOND_NOTES_PER_QUARTER = 8; // 1/4 consists of 8 1/32

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
  static intToByteArray(value: number, isBigEndian: boolean): Uint8Array {
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
  static byteArrayToInt(bytes: Uint8Array): number {
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
  static shortToByteArray(value: number): Uint8Array {
    return new Uint8Array([value & 0xff]);
  }

  /**
   * convert byte to short ... trivial but good to keep it present
   *
   * Reinterprets a signed Java byte as unsigned. Unused inside the port; kept for
   * API parity with `EventMaker.java`.
   */
  static byteToShort(b: number): number {
    return b & 0xff;
  }

  /**
   * create a note off event
   *
   * @param chan MIDI channel; masked to 0..15 by `ShortMessage`
   * @param date absolute tick
   * @param pitch MIDI key number; masked to 0..127, **not** clamped
   * @param vel release velocity, clamped into 0..127
   */
  static createNoteOff(chan: number, date: number, pitch: number, vel: number): MidiEvent | null {
    const velocity = vel > 127 ? 127 : vel < 0 ? 0 : vel;

    try {
      return new MidiEvent(new ShortMessage(EventMaker.NOTE_OFF, chan, pitch, velocity), date);
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
  static createNoteOn(chan: number, date: number, pitch: number, vel: number): MidiEvent | null {
    const velocity = vel > 127 ? 127 : vel < 0 ? 0 : vel;

    try {
      return new MidiEvent(new ShortMessage(EventMaker.NOTE_ON, chan, pitch, velocity), date);
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
  static createProgramChangeByName(chan: number, date: number, name: string): MidiEvent | null {
    let dict: InstrumentsDictionary;
    try {
      dict = new InstrumentsDictionary(); // initialize instruments dictionary
    } catch {
      // if there were problems initializing the instruments dictionary
      return EventMaker.createProgramChange(chan, date, EventMaker.PC_Acoustic_Grand_Piano); // use Acoustic Grand Piano as default instrument
    }

    return EventMaker.createProgramChange(chan, date, dict.getProgramChange(name)); // search the instrument's name in the dictionary and use the program change number it returns
  }

  /**
   * create a program change event with the program change number
   *
   * @param programNumber masked to 0..127 by `ShortMessage`, not clamped, so 200 → 72
   */
  static createProgramChange(chan: number, date: number, programNumber: number): MidiEvent | null {
    try {
      return new MidiEvent(
        new ShortMessage(EventMaker.PROGRAM_CHANGE, chan, programNumber, 0),
        date,
      );
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
  static createControlChange(
    chan: number,
    date: number,
    controllerNumber: number,
    controllerValue: number,
  ): MidiEvent | null {
    const value = controllerValue > 127 ? 127 : controllerValue < 0 ? 0 : controllerValue;

    try {
      return new MidiEvent(
        new ShortMessage(EventMaker.CONTROL_CHANGE, chan, controllerNumber, value),
        date,
      );
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
  static createKeySignature(date: number, accids: number): MidiEvent | null {
    try {
      return new MidiEvent(
        new MetaMessage(EventMaker.META_Key_Signature, new Uint8Array([accids & 0xff, 0]), 2),
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
  static createTimeSignature(
    date: number,
    numerator: number,
    denominator: number,
  ): MidiEvent | null {
    let denom = 1;
    while (Math.pow(2, denom) < denominator) ++denom;

    try {
      return new MidiEvent(
        new MetaMessage(
          EventMaker.META_Time_Signature,
          new Uint8Array([
            numerator & 0xff,
            denom & 0xff,
            EventMaker.TICKS_PER_METER_CLICK,
            EventMaker.THIRTY_SECOND_NOTES_PER_QUARTER,
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
  static createTempo(date: number, bpm: number, beatlength: number): MidiEvent | null {
    const mpq = Math.round(60000000 / (bpm * beatlength * 4)); // compute microseconds per quarter note from bpm
    const tempo = EventMaker.intToByteArray(mpq, false); // generate byte array (little endian) from mpq

    try {
      return new MidiEvent(
        new MetaMessage(
          EventMaker.META_Set_Tempo,
          new Uint8Array([tempo[1], tempo[2], tempo[3]]),
          3,
        ),
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
  static createTrackName(date: number, name: string): MidiEvent | null {
    const text = new TextEncoder().encode(name);
    try {
      return new MidiEvent(new MetaMessage(EventMaker.META_Track_Name, text, text.length), date);
    } catch (e) {
      console.error(e);
      return null;
    }
  }

  /**
   * create a instrument name event
   * @param name the instrument's display name; encoded UTF-8, see `createTrackName`
   */
  static createInstrumentName(date: number, name: string): MidiEvent | null {
    const text = new TextEncoder().encode(name);
    try {
      return new MidiEvent(
        new MetaMessage(EventMaker.META_Instrument_Name, text, text.length),
        date,
      );
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
  static createTextEvent(date: number, plainText: string): MidiEvent | null {
    const text = new TextEncoder().encode(plainText);
    try {
      return new MidiEvent(new MetaMessage(EventMaker.META_Text_Event, text, text.length), date);
    } catch (e) {
      console.error(e);
      return null;
    }
  }

  /**
   * create a marker event
   * @param markerText a rehearsal mark or section label; encoded UTF-8
   */
  static createMarker(date: number, markerText: string): MidiEvent | null {
    const text = new TextEncoder().encode(markerText);
    try {
      return new MidiEvent(new MetaMessage(EventMaker.META_Marker, text, text.length), date);
    } catch (e) {
      console.error(e);
      return null;
    }
  }

  /**
   * this creates a channel prefix event, it indicates that all subsequent meta messages go to this channel
   * @param channel truncated to one byte by `shortToByteArray`, not masked to 0..15
   */
  static createChannelPrefix(date: number, channel: number): MidiEvent | null {
    try {
      return new MidiEvent(
        new MetaMessage(
          EventMaker.META_Midi_Channel_Prefix,
          EventMaker.shortToByteArray(channel),
          1,
        ),
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
  static createMidiPortEvent(date: number, port: number): MidiEvent | null {
    try {
      return new MidiEvent(
        new MetaMessage(EventMaker.META_Midi_Port, EventMaker.shortToByteArray(port), 1),
        date,
      );
    } catch (e) {
      console.error(e);
      return null;
    }
  }
}
