/**
 * This helper class provides some useful midi-related functions.
 * Port of meico.midi.EventMaker
 *
 * @author Axel Berndt
 */

import { MidiEvent, ShortMessage, MetaMessage } from './MidiTypes.js';
import { InstrumentsDictionary } from './InstrumentsDictionary.js';

export class EventMaker {
    // use these constants for the event type
    static readonly NOTE_OFF: number                  = 128;
    static readonly NOTE_ON: number                   = 144;
    static readonly POLY_AFTERTOUCH: number           = 160;
    static readonly CONTROL_CHANGE: number            = 176;
    static readonly PROGRAM_CHANGE: number            = 192;
    static readonly CHANNEL_AFTERTOUCH: number        = 208;
    static readonly PITCH_BEND: number                = 224;
    static readonly SYSEX_START: number               = 240;
    static readonly MIDI_TIME_CODE: number            = 241;
    static readonly SONG_POSITION_POINTER: number     = 242;
    static readonly SONG_SELECT: number               = 243;
    static readonly UNDEF1: number                    = 244;
    static readonly UNDEF2: number                    = 245;
    static readonly TUNE_REQUEST: number              = 246;
    static readonly SYSEX_END: number                 = 247;
    static readonly TIMING_CLOCK: number              = 248;
    static readonly UNDEF3: number                    = 249;
    static readonly START: number                     = 250;
    static readonly CONTINUE: number                  = 251;
    static readonly STOP: number                      = 252;
    static readonly UNDEF4: number                    = 253;
    static readonly ACTIVE_SENSING: number            = 254;
    static readonly SYSTEM_RESET: number              = 255;
    static readonly META_EVENT: number                = 255;

    // use these constants to set the controller number of a CONTROL_CHANGE event
    static readonly CC_Bank_Select: number                = 0;
    static readonly CC_Modulation_Wheel: number           = 1;
    static readonly CC_Breath_Ctrl: number                = 2;
    static readonly CC_Undefined_Ctrl_1: number           = 3;
    static readonly CC_Foot_Ctrl: number                  = 4;
    static readonly CC_Portamento_Time: number            = 5;
    static readonly CC_Data_Entry: number                 = 6;
    static readonly CC_Channel_Volume: number             = 7;
    static readonly CC_Balance: number                    = 8;
    static readonly CC_Undefined_Ctrl_2: number           = 9;
    static readonly CC_Pan: number                        = 10;
    static readonly CC_Expression_Ctrl: number            = 11;
    static readonly CC_Effect_Ctrl_1: number              = 12;
    static readonly CC_Effect_Ctrl_2: number              = 13;
    static readonly CC_Undefined_Ctrl_3: number           = 14;
    static readonly CC_Undefined_Ctrl_4: number           = 15;
    static readonly CC_General_Purpose_Ctrl_1: number     = 16;
    static readonly CC_General_Purpose_Ctrl_2: number     = 17;
    static readonly CC_General_Purpose_Ctrl_3: number     = 18;
    static readonly CC_General_Purpose_Ctrl_4: number     = 19;
    static readonly CC_Undefined_Ctrl_5: number           = 20;
    static readonly CC_Undefined_Ctrl_6: number           = 21;
    static readonly CC_Undefined_Ctrl_7: number           = 22;
    static readonly CC_Undefined_Ctrl_8: number           = 23;
    static readonly CC_Undefined_Ctrl_9: number           = 24;
    static readonly CC_Undefined_Ctrl_10: number          = 25;
    static readonly CC_Undefined_Ctrl_11: number          = 26;
    static readonly CC_Undefined_Ctrl_12: number          = 27;
    static readonly CC_Undefined_Ctrl_13: number          = 28;
    static readonly CC_Undefined_Ctrl_14: number          = 29;
    static readonly CC_Undefined_Ctrl_15: number          = 30;
    static readonly CC_Undefined_Ctrl_16: number          = 31;
    static readonly CC_Bank_Select_14b: number            = 32;
    static readonly CC_Modulation_Wheel_14b: number       = 33;
    static readonly CC_Breath_Ctrl_14b: number            = 34;
    static readonly CC_Undefined_Ctrl_1_14b: number       = 35;
    static readonly CC_Foot_Ctrl_14b: number              = 36;
    static readonly CC_Portamento_Time_14b: number        = 37;
    static readonly CC_Data_Entry_14b: number             = 38;
    static readonly CC_Channel_Volume_14b: number         = 39;
    static readonly CC_Balance_14b: number                = 40;
    static readonly CC_Undefined_Ctrl_2_14b: number       = 41;
    static readonly CC_Pan_14b: number                    = 42;
    static readonly CC_Expression_Ctrl_14b: number        = 43;
    static readonly CC_Effect_Ctrl_1_14b: number          = 44;
    static readonly CC_Effect_Ctrl_2_14b: number          = 45;
    static readonly CC_Undefined_Ctrl_3_14b: number       = 46;
    static readonly CC_Undefined_Ctrl_4_14b: number       = 47;
    static readonly CC_General_Purpose_Ctrl_1_14b: number = 48;
    static readonly CC_General_Purpose_Ctrl_2_14b: number = 49;
    static readonly CC_General_Purpose_Ctrl_3_14b: number = 50;
    static readonly CC_General_Purpose_Ctrl_4_14b: number = 51;
    static readonly CC_Undefined_Ctrl_5_14b: number       = 52;
    static readonly CC_Undefined_Ctrl_6_14b: number       = 53;
    static readonly CC_Undefined_Ctrl_7_14b: number       = 54;
    static readonly CC_Undefined_Ctrl_8_14b: number       = 55;
    static readonly CC_Undefined_Ctrl_9_14b: number       = 56;
    static readonly CC_Undefined_Ctrl_10_14b: number      = 57;
    static readonly CC_Undefined_Ctrl_11_14b: number      = 58;
    static readonly CC_Undefined_Ctrl_12_14b: number      = 59;
    static readonly CC_Undefined_Ctrl_13_14b: number      = 60;
    static readonly CC_Undefined_Ctrl_14_14b: number      = 61;
    static readonly CC_Undefined_Ctrl_15_14b: number      = 62;
    static readonly CC_Undefined_Ctrl_16_14b: number      = 63;
    static readonly CC_Damper_Pedal: number               = 64;
    static readonly CC_Portamento_OnOff: number           = 65;
    static readonly CC_Sustenuto: number                  = 66;
    static readonly CC_Soft_Pedal: number                 = 67;
    static readonly CC_Legato_Footswitch: number          = 68;
    static readonly CC_Hold_2: number                     = 69;
    static readonly CC_Sound_Ctrl_1: number               = 70;
    static readonly CC_Sound_Ctrl_2: number               = 71;
    static readonly CC_Sound_Ctrl_3: number               = 72;
    static readonly CC_Sound_Ctrl_4: number               = 73;
    static readonly CC_Sound_Ctrl_5: number               = 74;
    static readonly CC_Sound_Ctrl_6: number               = 75;
    static readonly CC_Sound_Ctrl_7: number               = 76;
    static readonly CC_Sound_Ctrl_8: number               = 77;
    static readonly CC_Sound_Ctrl_9: number               = 78;
    static readonly CC_Sound_Ctrl_10: number              = 79;
    static readonly CC_General_Purpose_Ctrl_5: number     = 80;
    static readonly CC_General_Purpose_Ctrl_6: number     = 81;
    static readonly CC_General_Purpose_Ctrl_7: number     = 82;
    static readonly CC_General_Purpose_Ctrl_8: number     = 83;
    static readonly CC_Portamento_Ctrl: number            = 84;
    static readonly CC_Undefined_Ctrl_17: number          = 85;
    static readonly CC_Undefined_Ctrl_18: number          = 86;
    static readonly CC_Undefined_Ctrl_19: number          = 87;
    static readonly CC_Undefined_Ctrl_20: number          = 88;
    static readonly CC_Undefined_Ctrl_21: number          = 89;
    static readonly CC_Undefined_Ctrl_22: number          = 90;
    static readonly CC_Reverb_Send_Level: number          = 91;
    static readonly CC_Effects_2_Depth: number            = 92;
    static readonly CC_Chorus_Send_Level: number          = 93;
    static readonly CC_Effects_4_Depth: number            = 94;
    static readonly CC_Effects_5_Depth: number            = 95;
    static readonly CC_Data_Entry_plus_1: number          = 96;
    static readonly CC_Data_Entry_minus_1: number         = 97;
    static readonly CC_Nonregistered_Param_Num_LSB: number= 98;
    static readonly CC_Nonregistered_Param_Num_MSB: number= 99;
    static readonly CC_Registered_Param_Num_LSB: number   = 100;
    static readonly CC_Registered_Param_Num_MSB: number   = 101;
    static readonly CC_Undefined_Ctrl_23: number          = 102;
    static readonly CC_Undefined_Ctrl_24: number          = 103;
    static readonly CC_Undefined_Ctrl_25: number          = 104;
    static readonly CC_Undefined_Ctrl_26: number          = 105;
    static readonly CC_Undefined_Ctrl_27: number          = 106;
    static readonly CC_Undefined_Ctrl_28: number          = 107;
    static readonly CC_Undefined_Ctrl_29: number          = 108;
    static readonly CC_Undefined_Ctrl_30: number          = 109;
    static readonly CC_Undefined_Ctrl_31: number          = 110;
    static readonly CC_Undefined_Ctrl_32: number          = 111;
    static readonly CC_Undefined_Ctrl_33: number          = 112;
    static readonly CC_Undefined_Ctrl_34: number          = 113;
    static readonly CC_Undefined_Ctrl_35: number          = 114;
    static readonly CC_Undefined_Ctrl_36: number          = 115;
    static readonly CC_Undefined_Ctrl_37: number          = 116;
    static readonly CC_Undefined_Ctrl_38: number          = 117;
    static readonly CC_Undefined_Ctrl_39: number          = 118;
    static readonly CC_Undefined_Ctrl_40: number          = 119;
    static readonly CC_All_Sound_Off: number              = 120;
    static readonly CC_Reset_All_Controllers: number      = 121;
    static readonly CC_Local_Control_OnOff: number        = 122;
    static readonly CC_All_Notes_Off: number              = 123;
    static readonly CC_Omni_Mode_Off: number              = 124;
    static readonly CC_Omni_Mode_On: number               = 125;
    static readonly CC_Poly_Mode_OnOff: number            = 126;
    static readonly CC_Poly_Mode_On: number               = 127;

    // if the event type is meta event, use these constants to indicate the metaevent type
    static readonly META_Sequence_Number: number          = 0;        //0x00
    static readonly META_Text_Event: number               = 1;        //0x01
    static readonly META_Copyright_Notice: number         = 2;        //0x02
    static readonly META_Track_Name: number               = 3;        //0x03
    static readonly META_Sequence_Name: number            = 3;        //0x03
    static readonly META_Instrument_Name: number          = 4;        //0x04
    static readonly META_Lyric: number                    = 5;        //0x05
    static readonly META_Marker: number                   = 6;        //0x06
    static readonly META_Cue_Point: number                = 7;        //0x07
    static readonly META_Program_Name: number             = 8;        //0x08
    static readonly META_Device_Name: number              = 9;        //0x09
    static readonly META_Midi_Channel_Prefix: number      = 32;       //0x20
    static readonly META_Midi_Port: number                = 33;       //0x21
    static readonly META_End_of_Track: number             = 47;       //0x2F
    static readonly META_Set_Tempo: number                = 81;       //0x51
    static readonly META_SMTPE_Offset: number             = 84;       //0x54
    static readonly META_Time_Signature: number           = 88;       //0x58
    static readonly META_Key_Signature: number            = 89;       //0x59
    static readonly META_Sequence_specific_Meta_event: number = 127;  //0x7F

    // use these constants for program change codes
    static readonly PC_Acoustic_Grand_Piano: number       = 0;
    static readonly PC_Bright_Acoustic_Piano: number      = 1;
    static readonly PC_Electric_Grand_Piano: number       = 2;
    static readonly PC_Honkytonk_Piano: number            = 3;
    static readonly PC_Electric_Piano_1: number           = 4;
    static readonly PC_Electric_Piano_2: number           = 5;
    static readonly PC_Harpsichord: number                = 6;
    static readonly PC_Clavinet: number                   = 7;
    static readonly PC_Celesta: number                    = 8;
    static readonly PC_Glockenspiel: number               = 9;
    static readonly PC_Music_Box: number                  = 10;
    static readonly PC_Vibraphone: number                 = 11;
    static readonly PC_Marimba: number                    = 12;
    static readonly PC_Xylophone: number                  = 13;
    static readonly PC_Tubular_Bells: number              = 14;
    static readonly PC_Dulcimer: number                   = 15;
    static readonly PC_Drawbar_Organ: number              = 16;
    static readonly PC_Percussive_Organ: number           = 17;
    static readonly PC_Rock_Organ: number                 = 18;
    static readonly PC_Church_Organ: number               = 19;
    static readonly PC_Reed_Organ: number                 = 20;
    static readonly PC_Accordion: number                  = 21;
    static readonly PC_Harmonica: number                  = 22;
    static readonly PC_Tango_Accordion: number            = 23;
    static readonly PC_Acoustic_Guitar_nylon: number      = 24;
    static readonly PC_Acoustic_Guitar_steel: number      = 25;
    static readonly PC_Electric_Guitar_jazz: number       = 26;
    static readonly PC_Electric_Guitar_clean: number      = 27;
    static readonly PC_Electric_Guitar_muted: number      = 28;
    static readonly PC_Overdriven_Guitar: number          = 29;
    static readonly PC_Distortion_Guitar: number          = 30;
    static readonly PC_Guitar_Harmonics: number           = 31;
    static readonly PC_Acoustic_Bass: number              = 32;
    static readonly PC_Electric_Bass_finger: number       = 33;
    static readonly PC_Electric_Bass_pick: number         = 34;
    static readonly PC_Fretless_Bass: number              = 35;
    static readonly PC_Slap_Bass_1: number                = 36;
    static readonly PC_Slap_Bass_2: number                = 37;
    static readonly PC_Synth_Bass_1: number               = 38;
    static readonly PC_Synth_Bass_2: number               = 39;
    static readonly PC_Violin: number                     = 40;
    static readonly PC_Viola: number                      = 41;
    static readonly PC_Cello: number                      = 42;
    static readonly PC_Contrabass: number                 = 43;
    static readonly PC_Tremolo_Strings: number            = 44;
    static readonly PC_Pizzicato_Strings: number          = 45;
    static readonly PC_Orchestral_Harp: number            = 46;
    static readonly PC_Timpani: number                    = 47;
    static readonly PC_String_Ensemble_1: number          = 48;
    static readonly PC_String_Ensemble_2: number          = 49;
    static readonly PC_Synth_Strings_1: number            = 50;
    static readonly PC_Synth_Strings_2: number            = 51;
    static readonly PC_Choir_Aahs: number                 = 52;
    static readonly PC_Voice_Oohs: number                 = 53;
    static readonly PC_Synth_Choir: number                = 54;
    static readonly PC_Orchestra_Hit: number              = 55;
    static readonly PC_Trumpet: number                    = 56;
    static readonly PC_Trombone: number                   = 57;
    static readonly PC_Tuba: number                       = 58;
    static readonly PC_Muted_Trumpet: number              = 59;
    static readonly PC_French_Horn: number                = 60;
    static readonly PC_Brass_Section: number              = 61;
    static readonly PC_Synth_Brass_1: number              = 62;
    static readonly PC_Synth_Brass_2: number              = 63;
    static readonly PC_Soprano_Sax: number                = 64;
    static readonly PC_Alto_Sax: number                   = 65;
    static readonly PC_Tenor_Sax: number                  = 66;
    static readonly PC_Baritone_Sax: number               = 67;
    static readonly PC_Oboe: number                       = 68;
    static readonly PC_English_Horn: number               = 69;
    static readonly PC_Bassoon: number                    = 70;
    static readonly PC_Clarinet: number                   = 71;
    static readonly PC_Piccolo: number                    = 72;
    static readonly PC_Flute: number                      = 73;
    static readonly PC_Recorder: number                   = 74;
    static readonly PC_Pan_Flute: number                  = 75;
    static readonly PC_Blown_bottle: number               = 76;
    static readonly PC_Shakuhachi: number                 = 77;
    static readonly PC_Whistle: number                    = 78;
    static readonly PC_Ocarina: number                    = 79;
    static readonly PC_Lead_1_square: number              = 80;
    static readonly PC_Lead_2_sawtooth: number            = 81;
    static readonly PC_Lead_3_calliope: number            = 82;
    static readonly PC_Lead_4_chiff: number               = 83;
    static readonly PC_Lead_5_charang: number             = 84;
    static readonly PC_Lead_6_voice: number               = 85;
    static readonly PC_Lead_7_fifths: number              = 86;
    static readonly PC_Lead_8_bass_plus_lead: number      = 87;
    static readonly PC_Pad_1_new_age: number              = 88;
    static readonly PC_Pad_2_warm: number                 = 89;
    static readonly PC_Pad_3_polysynth: number            = 90;
    static readonly PC_Pad_4_choir: number                = 91;
    static readonly PC_Pad_5_bowed: number                = 92;
    static readonly PC_Pad_6_metallic: number             = 93;
    static readonly PC_Pad_7_halo: number                 = 94;
    static readonly PC_Pad_8_sweep: number                = 95;
    static readonly PC_FX_1_rain: number                  = 96;
    static readonly PC_FX_2_soundtrack: number            = 97;
    static readonly PC_FX_3_crystal: number               = 98;
    static readonly PC_FX_4_atmosphere: number            = 99;
    static readonly PC_FX_5_brightness: number            = 100;
    static readonly PC_FX_6_goblins: number               = 101;
    static readonly PC_FX_7_echoes: number                = 102;
    static readonly PC_FX_8_scifi: number                 = 103;
    static readonly PC_Sitar: number                      = 104;
    static readonly PC_Banjo: number                      = 105;
    static readonly PC_Shamisen: number                   = 106;
    static readonly PC_Koto: number                       = 107;
    static readonly PC_Kalimba: number                    = 108;
    static readonly PC_Bagpipe: number                    = 109;
    static readonly PC_Fiddle: number                     = 110;
    static readonly PC_Shanai: number                     = 111;
    static readonly PC_Tinkle_Bell: number                = 112;
    static readonly PC_Agogo: number                      = 113;
    static readonly PC_Steel_Drums: number                = 114;
    static readonly PC_Woodblock: number                  = 115;
    static readonly PC_Taiko_Drum: number                 = 116;
    static readonly PC_Melodic_Tom: number                = 117;
    static readonly PC_Synth_Drum: number                 = 118;
    static readonly PC_Reverse_Cymbal: number             = 119;
    static readonly PC_Guitar_Fret_Noise: number          = 120;
    static readonly PC_Breath_Noise: number               = 121;
    static readonly PC_Seashore: number                   = 122;
    static readonly PC_Bird_Tweet: number                 = 123;
    static readonly PC_Telephone_Ring: number             = 124;
    static readonly PC_Helicopter: number                 = 125;
    static readonly PC_Applause: number                   = 126;
    static readonly PC_Gunshot: number                    = 127;

    // further constants
    private static readonly TICKS_PER_METER_CLICK: number             = 24;   // number of ticks that need to pass on the MIDI clock for the metronome to click
    private static readonly THIRTY_SECOND_NOTES_PER_QUARTER: number   = 8;    // 1/4 consists of 8 1/32

    /**
     * a little helper to convert int numbers into 4-byte arrays
     * @param value
     * @param isBigEndian false=return in little endian format, true= return in big endian format
     * @return
     */
    static intToByteArray(value: number, isBigEndian: boolean): Uint8Array {
        // Ensure value is treated as a 32-bit integer
        value = value | 0;
        const byteArray = new Uint8Array(4);

        if (isBigEndian) {
            // big endian byte array
            byteArray[0] = (value) & 0xFF;
            byteArray[1] = (value >>> 8) & 0xFF;
            byteArray[2] = (value >>> 16) & 0xFF;
            byteArray[3] = (value >>> 24) & 0xFF;
        } else {
            // little endian byte array (network / big-endian order)
            byteArray[0] = (value >>> 24) & 0xFF;
            byteArray[1] = (value >>> 16) & 0xFF;
            byteArray[2] = (value >>> 8) & 0xFF;
            byteArray[3] = (value) & 0xFF;
        }

        return byteArray;
    }

    /**
     * a little helper to convert a byte array into an integer number
     * @param bytes
     * @return
     */
    static byteArrayToInt(bytes: Uint8Array): number {
        let val = 0;
        for (let i = 0; i < bytes.length; i++) {
            val = (val << 8) | (bytes[i] & 0xFF);
        }
        return val;
    }

    /**
     * convert a short to a byte array
     * @param value
     * @return
     */
    static shortToByteArray(value: number): Uint8Array {
        return new Uint8Array([(value) & 0xFF]);
    }

    /**
     * convert byte to short ... trivial but good to keep it present
     * @param b
     * @return
     */
    static byteToShort(b: number): number {
        return b & 0xFF;
    }

    /**
     * create a note off event
     *
     * @param chan
     * @param date
     * @param pitch
     * @param vel
     * @return
     */
    static createNoteOff(chan: number, date: number, pitch: number, vel: number): MidiEvent | null {
        if (vel > 127)
            vel = 127;
        else if (vel < 0)
            vel = 0;

        try {
            return new MidiEvent(new ShortMessage(EventMaker.NOTE_OFF, chan, pitch, vel), date);
        } catch (e) {
            console.error(e);
            return null;
        }
    }

    /**
     * create a note on event
     *
     * @param chan
     * @param date
     * @param pitch
     * @param vel
     * @return
     */
    static createNoteOn(chan: number, date: number, pitch: number, vel: number): MidiEvent | null {
        if (vel > 127)
            vel = 127;
        else if (vel < 0)
            vel = 0;

        try {
            return new MidiEvent(new ShortMessage(EventMaker.NOTE_ON, chan, pitch, vel), date);
        } catch (e) {
            console.error(e);
            return null;
        }
    }

    /**
     * create a program change event by parsing the name string and finding a known substring
     * @param chan
     * @param date
     * @param name
     * @return
     */
    static createProgramChangeByName(chan: number, date: number, name: string): MidiEvent | null {
        let dict: InstrumentsDictionary;
        try {
            dict = new InstrumentsDictionary();                                     // initialize instruments dictionary
        } catch (e) {                                                               // if there were problems initializing the instruments dictionary
            return EventMaker.createProgramChange(chan, date, EventMaker.PC_Acoustic_Grand_Piano);    // use Acoustic Grand Piano as default instrument
        }

        return EventMaker.createProgramChange(chan, date, dict.getProgramChange(name));    // search the instrument's name in the dictionary and use the program change number it returns
    }

    /**
     * create a program change event with the program change number
     * @param chan
     * @param date
     * @param programNumber
     * @return
     */
    static createProgramChange(chan: number, date: number, programNumber: number): MidiEvent | null {
        try {
            return new MidiEvent(new ShortMessage(EventMaker.PROGRAM_CHANGE, chan, programNumber, 0), date);
        } catch (e) {
            console.error(e);
            return null;
        }
    }

    /**
     * create a control change event
     * @param chan
     * @param date
     * @param controllerNumber
     * @param controllerValue
     * @return
     */
    static createControlChange(chan: number, date: number, controllerNumber: number, controllerValue: number): MidiEvent | null {
        if (controllerValue > 127)
            controllerValue = 127;
        else if (controllerValue < 0)
            controllerValue = 0;

        try {
            return new MidiEvent(new ShortMessage(EventMaker.CONTROL_CHANGE, chan, controllerNumber, controllerValue), date);
        } catch (e) {
            console.error(e);
            return null;
        }
    }

    /**
     * create a key signature event
     * @param date
     * @param accids
     * @return
     */
    static createKeySignature(date: number, accids: number): MidiEvent | null {
        try {
            return new MidiEvent(new MetaMessage(EventMaker.META_Key_Signature, new Uint8Array([accids & 0xFF, 0]), 2), date);
        } catch (e) {
            console.error(e);
            return null;
        }
    }

    /**
     * create a time signature event
     * @param date
     * @param numerator
     * @param denominator
     * @return
     */
    static createTimeSignature(date: number, numerator: number, denominator: number): MidiEvent | null {
        let p = 1;
        for (; Math.pow(2, p) < denominator; ++p)
            ;
        const denom = p;

        try {
            return new MidiEvent(new MetaMessage(EventMaker.META_Time_Signature, new Uint8Array([numerator & 0xFF, denom & 0xFF, EventMaker.TICKS_PER_METER_CLICK, EventMaker.THIRTY_SECOND_NOTES_PER_QUARTER]), 4), date);
        } catch (e) {
            console.error(e);
            return null;
        }
    }

    /**
     * create tempo event
     * @param date
     * @param bpm
     * @param beatlength length of one beat in floating point format (e.g. quarter=0.25, whole=1; eight=0.125)
     * @return
     */
    static createTempo(date: number, bpm: number, beatlength: number): MidiEvent | null {
        const mpq = Math.round(60000000 / (bpm * beatlength * 4));         // compute microseconds per quarter note from bpm
        const tempo = EventMaker.intToByteArray(mpq, false);               // generate byte array (little endian) from mpq

        try {
            return new MidiEvent(new MetaMessage(EventMaker.META_Set_Tempo, new Uint8Array([tempo[1], tempo[2], tempo[3]]), 3), date);   // create the event; only the 2nd, 3rd and 4th byte of the tempo byte array are needed
        } catch (e) {
            console.error(e);
            return null;
        }
    }

    /**
     * create a track name event
     * @param date
     * @param name
     * @return
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
     * @param date
     * @param name
     * @return
     */
    static createInstrumentName(date: number, name: string): MidiEvent | null {
        const text = new TextEncoder().encode(name);
        try {
            return new MidiEvent(new MetaMessage(EventMaker.META_Instrument_Name, text, text.length), date);
        } catch (e) {
            console.error(e);
            return null;
        }
    }

    /**
     * create a plain text event
     * @param date
     * @param plainText
     * @return
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
     * @param date
     * @param markerText
     * @return
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
     * @param date
     * @param channel
     * @return
     */
    static createChannelPrefix(date: number, channel: number): MidiEvent | null {
        try {
            return new MidiEvent(new MetaMessage(EventMaker.META_Midi_Channel_Prefix, EventMaker.shortToByteArray(channel), 1), date);
        } catch (e) {
            console.error(e);
            return null;
        }
    }

    /**
     * this creates a midi port event
     * @param date
     * @param port
     * @return
     */
    static createMidiPortEvent(date: number, port: number): MidiEvent | null {
        try {
            return new MidiEvent(new MetaMessage(EventMaker.META_Midi_Port, EventMaker.shortToByteArray(port), 1), date);
        } catch (e) {
            console.error(e);
            return null;
        }
    }
}
