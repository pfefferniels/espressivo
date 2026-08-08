/**
 * Browser-compatible MIDI types to replace javax.sound.midi.
 * These classes provide the core MIDI data structures needed for
 * reading, writing, and manipulating Standard MIDI File (SMF) data.
 */

// ============================================================
// MidiMessage base class
// ============================================================

/**
 * Abstract base for all MIDI messages.
 */
export abstract class MidiMessage {
    protected data: Uint8Array;

    constructor(data: Uint8Array) {
        this.data = new Uint8Array(data);
    }

    getMessage(): Uint8Array {
        return new Uint8Array(this.data);
    }

    getStatus(): number {
        return this.data.length > 0 ? this.data[0] & 0xFF : 0;
    }

    getLength(): number {
        return this.data.length;
    }

    abstract clone(): MidiMessage;
}

// ============================================================
// ShortMessage
// ============================================================

/**
 * Represents a short (channel or system) MIDI message.
 * Mirrors javax.sound.midi.ShortMessage.
 */
export class ShortMessage extends MidiMessage {
    // Status byte constants (same as javax.sound.midi.ShortMessage)
    static readonly NOTE_OFF = 0x80;          // 128
    static readonly NOTE_ON = 0x90;           // 144
    static readonly POLY_PRESSURE = 0xA0;     // 160
    static readonly CONTROL_CHANGE = 0xB0;    // 176
    static readonly PROGRAM_CHANGE = 0xC0;    // 192
    static readonly CHANNEL_PRESSURE = 0xD0;  // 208
    static readonly PITCH_BEND = 0xE0;        // 224
    static readonly SYSTEM_EXCLUSIVE = 0xF0;  // 240
    static readonly MIDI_TIME_CODE = 0xF1;    // 241
    static readonly SONG_POSITION_POINTER = 0xF2; // 242
    static readonly SONG_SELECT = 0xF3;       // 243
    static readonly TUNE_REQUEST = 0xF6;      // 246
    static readonly END_OF_EXCLUSIVE = 0xF7;  // 247
    static readonly TIMING_CLOCK = 0xF8;      // 248
    static readonly START = 0xFA;             // 250
    static readonly CONTINUE = 0xFB;          // 251
    static readonly STOP = 0xFC;              // 252
    static readonly ACTIVE_SENSING = 0xFE;    // 254
    static readonly SYSTEM_RESET = 0xFF;      // 255

    constructor();
    constructor(status: number);
    constructor(status: number, data1: number, data2: number);
    constructor(command: number, channel: number, data1: number, data2: number);
    constructor(a?: number, b?: number, c?: number, d?: number) {
        if (a === undefined) {
            // Default constructor
            super(new Uint8Array([0x90, 0, 0])); // default noteOn
        } else if (d !== undefined) {
            // 4 args: command, channel, data1, data2
            const command = a;
            const channel = b!;
            const data1 = c!;
            const data2 = d;
            const statusByte = (command & 0xF0) | (channel & 0x0F);
            if (command === ShortMessage.PROGRAM_CHANGE || command === ShortMessage.CHANNEL_PRESSURE) {
                super(new Uint8Array([statusByte, data1 & 0x7F]));
            } else {
                super(new Uint8Array([statusByte, data1 & 0x7F, data2 & 0x7F]));
            }
        } else if (c !== undefined) {
            // 3 args: status, data1, data2
            const status = a;
            const data1 = b!;
            const data2 = c;
            super(new Uint8Array([status & 0xFF, data1 & 0x7F, data2 & 0x7F]));
        } else {
            // Single status byte
            super(new Uint8Array([a & 0xFF]));
        }
    }

    setMessage(command: number, channel: number, data1: number, data2: number): void {
        const statusByte = (command & 0xF0) | (channel & 0x0F);
        if (command === ShortMessage.PROGRAM_CHANGE || command === ShortMessage.CHANNEL_PRESSURE) {
            this.data = new Uint8Array([statusByte, data1 & 0x7F]);
        } else {
            this.data = new Uint8Array([statusByte, data1 & 0x7F, data2 & 0x7F]);
        }
    }

    getCommand(): number {
        return this.data[0] & 0xF0;
    }

    getChannel(): number {
        return this.data[0] & 0x0F;
    }

    getData1(): number {
        return this.data.length > 1 ? this.data[1] & 0x7F : 0;
    }

    getData2(): number {
        return this.data.length > 2 ? this.data[2] & 0x7F : 0;
    }

    clone(): ShortMessage {
        const sm = new ShortMessage();
        sm.data = new Uint8Array(this.data);
        return sm;
    }
}

// ============================================================
// MetaMessage
// ============================================================

/**
 * Represents a MIDI meta message (used only in MIDI files, not in real-time).
 * Mirrors javax.sound.midi.MetaMessage.
 */
export class MetaMessage extends MidiMessage {
    static readonly META = 0xFF;

    private _type: number;
    private _data: Uint8Array;

    constructor();
    constructor(type: number, data: Uint8Array, length: number);
    constructor(type?: number, data?: Uint8Array, length?: number) {
        if (type === undefined) {
            super(new Uint8Array([0xFF, 0x00, 0x00]));
            this._type = 0;
            this._data = new Uint8Array(0);
        } else {
            const metaData = data ? new Uint8Array(data.buffer, data.byteOffset, length!) : new Uint8Array(0);
            // Build the full message: 0xFF, type, variable-length, data
            const vlq = MetaMessage.encodeVariableLength(metaData.length);
            const fullLength = 2 + vlq.length + metaData.length;
            const fullData = new Uint8Array(fullLength);
            fullData[0] = 0xFF;
            fullData[1] = type & 0xFF;
            fullData.set(vlq, 2);
            fullData.set(metaData, 2 + vlq.length);
            super(fullData);
            this._type = type & 0xFF;
            this._data = new Uint8Array(metaData);
        }
    }

    getType(): number {
        return this._type;
    }

    getData(): Uint8Array {
        return new Uint8Array(this._data);
    }

    clone(): MetaMessage {
        const mm = new MetaMessage();
        mm.data = new Uint8Array(this.data);
        mm._type = this._type;
        mm._data = new Uint8Array(this._data);
        return mm;
    }

    /**
     * Encode a value as a MIDI variable-length quantity.
     */
    static encodeVariableLength(value: number): Uint8Array {
        if (value < 0) value = 0;
        const bytes: number[] = [];
        bytes.push(value & 0x7F);
        value >>= 7;
        while (value > 0) {
            bytes.push((value & 0x7F) | 0x80);
            value >>= 7;
        }
        bytes.reverse();
        return new Uint8Array(bytes);
    }
}

// ============================================================
// SysexMessage
// ============================================================

/**
 * Represents a MIDI System Exclusive message.
 * Mirrors javax.sound.midi.SysexMessage.
 */
export class SysexMessage extends MidiMessage {
    constructor(data?: Uint8Array) {
        super(data || new Uint8Array([0xF0, 0xF7]));
    }

    clone(): SysexMessage {
        return new SysexMessage(new Uint8Array(this.data));
    }
}

// ============================================================
// MidiEvent
// ============================================================

/**
 * A MIDI event: a MidiMessage with a tick timestamp.
 * Mirrors javax.sound.midi.MidiEvent.
 */
export class MidiEvent {
    private message: MidiMessage;
    private tick: number;

    constructor(message: MidiMessage, tick: number) {
        this.message = message;
        this.tick = tick;
    }

    getMessage(): MidiMessage {
        return this.message;
    }

    getTick(): number {
        return this.tick;
    }

    setTick(tick: number): void {
        this.tick = tick;
    }
}

// ============================================================
// Track
// ============================================================

/**
 * A MIDI track containing a list of MIDI events.
 * Mirrors javax.sound.midi.Track.
 */
export class Track {
    private events: MidiEvent[] = [];

    add(event: MidiEvent): boolean {
        this.events.push(event);
        // Sort events by tick (stable sort preserving insertion order for same tick)
        this.events.sort((a, b) => a.getTick() - b.getTick());
        return true;
    }

    remove(event: MidiEvent): boolean {
        const idx = this.events.indexOf(event);
        if (idx !== -1) {
            this.events.splice(idx, 1);
            return true;
        }
        return false;
    }

    get(index: number): MidiEvent {
        return this.events[index];
    }

    size(): number {
        return this.events.length;
    }

    ticks(): number {
        if (this.events.length === 0) return 0;
        return this.events[this.events.length - 1].getTick();
    }
}

// ============================================================
// Sequence
// ============================================================

/**
 * A MIDI sequence containing tracks with a specific timing resolution.
 * Mirrors javax.sound.midi.Sequence.
 */
export class Sequence {
    static readonly PPQ = 0.0;
    static readonly SMPTE_24 = 24.0;
    static readonly SMPTE_25 = 25.0;
    static readonly SMPTE_30DROP = 29.97;
    static readonly SMPTE_30 = 30.0;

    private divisionType: number;
    private resolution: number;
    private tracks: Track[] = [];

    constructor(divisionType: number, resolution: number) {
        this.divisionType = divisionType;
        this.resolution = resolution;
    }

    getDivisionType(): number {
        return this.divisionType;
    }

    getResolution(): number {
        return this.resolution;
    }

    createTrack(): Track {
        const track = new Track();
        this.tracks.push(track);
        return track;
    }

    deleteTrack(track: Track): boolean {
        const idx = this.tracks.indexOf(track);
        if (idx !== -1) {
            this.tracks.splice(idx, 1);
            return true;
        }
        return false;
    }

    getTracks(): Track[] {
        return this.tracks;
    }

    getTickLength(): number {
        let maxTick = 0;
        for (const track of this.tracks) {
            const t = track.ticks();
            if (t > maxTick) maxTick = t;
        }
        return maxTick;
    }

    getMicrosecondLength(): number {
        // This is an approximation: scan for tempo meta events and compute total duration.
        // Default tempo is 120 BPM (500000 microseconds per quarter note).
        let microsecondsPerQuarter = 500000;
        let totalMicroseconds = 0;
        let lastTick = 0;

        // Collect all tempo events across all tracks
        const tempoEvents: { tick: number; mpq: number }[] = [];
        for (const track of this.tracks) {
            for (let i = 0; i < track.size(); i++) {
                const event = track.get(i);
                const msg = event.getMessage();
                if (msg instanceof MetaMessage && msg.getType() === 0x51) {
                    const data = msg.getData();
                    if (data.length >= 3) {
                        const mpq = (data[0] << 16) | (data[1] << 8) | data[2];
                        tempoEvents.push({ tick: event.getTick(), mpq });
                    }
                }
            }
        }

        tempoEvents.sort((a, b) => a.tick - b.tick);

        const tickLength = this.getTickLength();

        if (tempoEvents.length === 0) {
            return (tickLength / this.resolution) * microsecondsPerQuarter;
        }

        for (const te of tempoEvents) {
            const deltaTicks = te.tick - lastTick;
            totalMicroseconds += (deltaTicks / this.resolution) * microsecondsPerQuarter;
            microsecondsPerQuarter = te.mpq;
            lastTick = te.tick;
        }

        // Remaining ticks after last tempo change
        const remaining = tickLength - lastTick;
        totalMicroseconds += (remaining / this.resolution) * microsecondsPerQuarter;

        return Math.round(totalMicroseconds);
    }
}
