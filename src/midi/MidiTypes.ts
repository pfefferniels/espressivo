/**
 * Browser-compatible MIDI types to replace javax.sound.midi.
 * These classes provide the core MIDI data structures needed for
 * reading, writing, and manipulating Standard MIDI File (SMF) data.
 *
 * There is no meico counterpart to this file: Java uses `javax.sound.midi`
 * directly, so the reference for every class here is the JDK's behaviour, not a
 * `.java` file in `/Users/nielspfeffer/Projects/meico`. Two consequences that the
 * rest of the port depends on and that are easy to break by accident:
 *
 * - **`Track.add` keeps a track sorted by tick at all times** (JDK contract), and
 *   the sort is stable, so events added at the same tick stay in insertion order.
 *   That insertion order *is* the event order of the exported MIDI file, which
 *   `tests/integration/midi-byte-equivalence.test.ts` compares event by event
 *   against Java-generated `.mid` references. Changing when or how `add` sorts
 *   reorders the file.
 * - **`getMessage()` hands out a copy, `getMessage()` on a `MidiEvent` does not.**
 *   `MidiMessage.getMessage()` returns a fresh `Uint8Array` (so callers cannot
 *   write into a message's bytes), while `MidiEvent.getMessage()` returns the live
 *   `MidiMessage`. `Midi.noteOns2NoteOffs` relies on the second: it rewrites
 *   messages in place through `ShortMessage.setMessage`.
 *
 * The numeric constants below are frozen: they are the wire values of the MIDI
 * specification, and `EventMaker` re-declares the same numbers under its own names.
 */

// ============================================================
// MidiMessage base class
// ============================================================

/**
 * Abstract base for all MIDI messages. Mirrors javax.sound.midi.MidiMessage.
 *
 * `data` holds the complete message as it appears on the wire — status byte
 * first — which is what `Midi.buildTrackChunk` writes verbatim for channel
 * messages. It is `protected` rather than `readonly` because two subclass
 * operations replace it wholesale: `ShortMessage.setMessage` and the `clone()`
 * implementations, which construct an empty instance and then overwrite its
 * buffer.
 */
export abstract class MidiMessage {
  protected data: Uint8Array;

  /** Copies the input, so later writes to `data` by the caller are not observed. */
  constructor(data: Uint8Array) {
    this.data = new Uint8Array(data);
  }

  /** The complete message bytes, as a copy. */
  getMessage(): Uint8Array {
    return new Uint8Array(this.data);
  }

  /** The status byte, or 0 for an empty message (the JDK would throw instead). */
  getStatus(): number {
    return this.data.length > 0 ? this.data[0] & 0xff : 0;
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
 *
 * The four constructor overloads are the JDK's four construction modes and are
 * **not** collapsible onto optional parameters, which is why this class carries two
 * `unified-signatures` entries in `docs/history/refactor/lint-debt.md`. `(status, data1, data2)`
 * and `(command, channel, data1, data2)` differ in what the *first* argument means —
 * a complete status byte versus a command nibble that is then OR-ed with the
 * channel — and merging them would additionally make a 2-argument call typecheck,
 * which the implementation would silently mis-handle: it would fall into the
 * single-status-byte branch and drop the second argument.
 */
export class ShortMessage extends MidiMessage {
  // Status byte constants (same as javax.sound.midi.ShortMessage)
  static readonly NOTE_OFF = 0x80; // 128
  static readonly NOTE_ON = 0x90; // 144
  static readonly POLY_PRESSURE = 0xa0; // 160
  static readonly CONTROL_CHANGE = 0xb0; // 176
  static readonly PROGRAM_CHANGE = 0xc0; // 192
  static readonly CHANNEL_PRESSURE = 0xd0; // 208
  static readonly PITCH_BEND = 0xe0; // 224
  static readonly SYSTEM_EXCLUSIVE = 0xf0; // 240
  static readonly MIDI_TIME_CODE = 0xf1; // 241
  static readonly SONG_POSITION_POINTER = 0xf2; // 242
  static readonly SONG_SELECT = 0xf3; // 243
  static readonly TUNE_REQUEST = 0xf6; // 246
  static readonly END_OF_EXCLUSIVE = 0xf7; // 247
  static readonly TIMING_CLOCK = 0xf8; // 248
  static readonly START = 0xfa; // 250
  static readonly CONTINUE = 0xfb; // 251
  static readonly STOP = 0xfc; // 252
  static readonly ACTIVE_SENSING = 0xfe; // 254
  static readonly SYSTEM_RESET = 0xff; // 255

  /** Default noteOn on channel 0: `90 00 00`. */
  constructor();
  /** A bare status byte, e.g. a system real-time message. */
  constructor(status: number);
  /** A complete message; `status` is used as given, the data bytes are masked to 7 bits. */
  constructor(status: number, data1: number, data2: number);
  /** `command`'s high nibble is OR-ed with `channel`'s low nibble to form the status byte. */
  constructor(command: number, channel: number, data1: number, data2: number);
  constructor(a?: number, b?: number, c?: number, d?: number) {
    if (a === undefined) {
      // Default constructor
      super(new Uint8Array([0x90, 0, 0])); // default noteOn
    } else if (d !== undefined) {
      // 4 args: command, channel, data1, data2.
      // Program change and channel pressure carry ONE data byte; `data2` is
      // dropped rather than written as a zero — writing it would add a stray byte
      // to every program change in the exported file.
      const command = a;
      const channel = b!;
      const data1 = c!;
      const data2 = d;
      const statusByte = (command & 0xf0) | (channel & 0x0f);
      if (command === ShortMessage.PROGRAM_CHANGE || command === ShortMessage.CHANNEL_PRESSURE) {
        super(new Uint8Array([statusByte, data1 & 0x7f]));
      } else {
        super(new Uint8Array([statusByte, data1 & 0x7f, data2 & 0x7f]));
      }
    } else if (c !== undefined) {
      // 3 args: status, data1, data2. `status` is taken whole (masked to 8 bits),
      // so the caller is responsible for the channel nibble.
      const status = a;
      const data1 = b!;
      const data2 = c;
      super(new Uint8Array([status & 0xff, data1 & 0x7f, data2 & 0x7f]));
    } else {
      // Single status byte
      super(new Uint8Array([a & 0xff]));
    }
  }

  /**
   * Rewrites this message in place, following the same one-versus-two data byte
   * rule as the 4-argument constructor. In-place is the point: `Midi.noteOns2NoteOffs`
   * and `noteOffs2NoteOns` convert a whole sequence by calling this on the messages
   * the tracks already hold, so no event is re-added and no track is re-sorted.
   */
  setMessage(command: number, channel: number, data1: number, data2: number): void {
    const statusByte = (command & 0xf0) | (channel & 0x0f);
    if (command === ShortMessage.PROGRAM_CHANGE || command === ShortMessage.CHANNEL_PRESSURE) {
      this.data = new Uint8Array([statusByte, data1 & 0x7f]);
    } else {
      this.data = new Uint8Array([statusByte, data1 & 0x7f, data2 & 0x7f]);
    }
  }

  /** The status byte's high nibble, i.e. the message type without the channel. */
  getCommand(): number {
    return this.data[0] & 0xf0;
  }

  /** The status byte's low nibble. Meaningless for system messages (status ≥ 0xF0). */
  getChannel(): number {
    return this.data[0] & 0x0f;
  }

  /** 0 when the message has no data bytes, where the JDK would throw. */
  getData1(): number {
    return this.data.length > 1 ? this.data[1] & 0x7f : 0;
  }

  /** 0 for one-data-byte messages (program change, channel pressure). */
  getData2(): number {
    return this.data.length > 2 ? this.data[2] & 0x7f : 0;
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
 *
 * The payload is stored twice on purpose. `data` (inherited) is the complete
 * on-the-wire form `FF <type> <vlq length> <payload>`; `_data` is the payload
 * alone. `Midi.buildTrackChunk` writes the payload form — it re-emits `FF`, the
 * type and its own length VLQ — so a change to how the two are kept in step
 * changes the exported file.
 */
export class MetaMessage extends MidiMessage {
  static readonly META = 0xff;

  private _type: number;
  private _data: Uint8Array;

  /** An empty text-less meta message, used as the target of `clone()`. */
  constructor();
  /**
   * @param type meta event type, e.g. 0x51 for set-tempo (see `EventMaker.META_*`)
   * @param data payload bytes; only the first `length` of them are used
   * @param length payload length, which may be shorter than `data`
   */
  constructor(type: number, data: Uint8Array, length: number);
  constructor(type?: number, data?: Uint8Array, length?: number) {
    if (type === undefined) {
      super(new Uint8Array([0xff, 0x00, 0x00]));
      this._type = 0;
      this._data = new Uint8Array(0);
    } else {
      // A view over the caller's buffer, not a copy — `Midi.readMidiData` relies on
      // that to avoid copying every meta payload out of the file image. Nothing
      // escapes: it is only read from below, and `_data` is a copy.
      const metaData = data
        ? new Uint8Array(data.buffer, data.byteOffset, length)
        : new Uint8Array(0);
      // Build the full message: 0xFF, type, variable-length, data
      const vlq = MetaMessage.encodeVariableLength(metaData.length);
      const fullLength = 2 + vlq.length + metaData.length;
      const fullData = new Uint8Array(fullLength);
      fullData[0] = 0xff;
      fullData[1] = type & 0xff;
      fullData.set(vlq, 2);
      fullData.set(metaData, 2 + vlq.length);
      super(fullData);
      this._type = type & 0xff;
      this._data = new Uint8Array(metaData);
    }
  }

  getType(): number {
    return this._type;
  }

  /** The payload only, as a copy — without the `FF <type> <length>` prefix. */
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
   * Encode a value as a MIDI variable-length quantity: seven bits per byte, high
   * bit set on every byte but the last. Negative values encode as a single `00`.
   *
   * Note this is not the encoder used when writing a file — `Midi.writeVariableLength`
   * is, and it appends to a running byte array instead of allocating. The two must
   * agree; a divergence would show up as a corrupt length field rather than as a
   * failure here.
   */
  static encodeVariableLength(value: number): Uint8Array {
    let rest = value < 0 ? 0 : value;
    const bytes: number[] = [];
    bytes.push(rest & 0x7f);
    rest >>= 7;
    while (rest > 0) {
      bytes.push((rest & 0x7f) | 0x80);
      rest >>= 7;
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
 *
 * `data` includes both framing bytes: the leading `F0` (or `F7` for a continuation)
 * and the trailing `F7`. `Midi.buildTrackChunk` writes the first byte, then a length
 * VLQ counting the *rest*, then the rest — so the terminator is part of the payload
 * it counts.
 */
export class SysexMessage extends MidiMessage {
  constructor(data?: Uint8Array) {
    super(data || new Uint8Array([0xf0, 0xf7]));
  }

  clone(): SysexMessage {
    return new SysexMessage(new Uint8Array(this.data));
  }
}

// ============================================================
// MidiEvent
// ============================================================

/**
 * A MIDI event: a MidiMessage with an **absolute** tick timestamp.
 * Mirrors javax.sound.midi.MidiEvent.
 *
 * Delta times exist only in the file format; everything in memory is absolute, and
 * `Midi.buildTrackChunk` differences consecutive ticks when it writes.
 *
 * `tick` stays mutable — `Midi.addOffset` shifts a whole sequence by writing it —
 * but note that doing so does **not** re-sort the containing track. Only `Track.add`
 * sorts, so an offset that changes the relative order of two events would leave the
 * track in an order the file format cannot express. `addOffset` applies one constant
 * to every event, which preserves order by construction.
 */
export class MidiEvent {
  private readonly message: MidiMessage;
  private tick: number;

  constructor(message: MidiMessage, tick: number) {
    this.message = message;
    this.tick = tick;
  }

  /** The live message, not a copy — callers may rewrite it via `setMessage`. */
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
 * A MIDI track containing a list of MIDI events, kept sorted by tick.
 * Mirrors javax.sound.midi.Track.
 */
export class Track {
  private readonly events: MidiEvent[] = [];

  /**
   * Latched once a non-finite tick is added; see {@link add} for why it disables the
   * binary insertion permanently rather than per event.
   */
  private hasNonFiniteTick = false;

  /**
   * Appends an event, keeping the track sorted. **This ordering is the exported file's
   * event order** and is compared event by event against the Java references, so both
   * halves of the rule matter:
   *
   * - sorted by tick, ascending;
   * - events sharing a tick keep the order they were added in. `Msm.exportMidi` depends
   *   on that — it emits a text event, then the noteOn, then later the noteOff, all
   *   possibly at the same date, and the file must come out in that order.
   *
   * This used to be `push` followed by a full `Array.prototype.sort`, which is
   * O(n² log n) over a track built one event at a time — the dominant cost of exporting
   * a score of any length. It is now an insertion at the position that stable sort would
   * have put the event in, which is the *upper bound* of its tick: a stable sort of
   * `[…sorted, newEvent]` leaves everything with a smaller tick before it, everything
   * with a larger tick after it, and every equal tick before it, because the new event
   * starts out last. Binary-searching for that index is exact, not approximate — the
   * emitted byte sequence is unchanged.
   *
   * The equivalence rests on the array already being sorted, which holds because `add`
   * and `remove` are its only mutators and `Midi.addOffset` shifts every tick by the same
   * constant. One case escapes it: a non-finite tick makes the comparison meaningless, so
   * a track that has ever seen one falls back to the old push-and-sort for the rest of its
   * life and reproduces whatever `sort` did with it, bug for bug.
   *
   * @return always true (the JDK returns false if the event was already present)
   */
  add(event: MidiEvent): boolean {
    const tick = event.getTick();

    if (this.hasNonFiniteTick || !Number.isFinite(tick)) {
      this.hasNonFiniteTick = true;
      this.events.push(event);
      this.events.sort((a, b) => a.getTick() - b.getTick());
      return true;
    }

    const events = this.events;
    // Fast path for the overwhelmingly common append-in-order case.
    if (events.length === 0 || events[events.length - 1].getTick() <= tick) {
      events.push(event);
      return true;
    }

    // Upper bound: the first index whose tick is strictly greater than `tick`.
    let lo = 0;
    let hi = events.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (events[mid].getTick() <= tick) lo = mid + 1;
      else hi = mid;
    }
    events.splice(lo, 0, event);
    return true;
  }

  /** Removes by identity, not by value. @return whether the event was present */
  remove(event: MidiEvent): boolean {
    const idx = this.events.indexOf(event);
    if (idx !== -1) {
      this.events.splice(idx, 1);
      return true;
    }
    return false;
  }

  /** Unchecked: an out-of-range index yields `undefined`, where the JDK throws. */
  get(index: number): MidiEvent {
    return this.events[index];
  }

  size(): number {
    return this.events.length;
  }

  /** The last event's tick, which is the largest one because `add` keeps this sorted. */
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
 *
 * The port only ever constructs PPQ sequences; the SMPTE division types exist
 * because `Midi.readMidiData` has to recognise them in a file it is handed, and
 * `Midi.getPPQ` throws rather than pretend an SMPTE sequence has a PPQ.
 */
export class Sequence {
  static readonly PPQ = 0.0;
  static readonly SMPTE_24 = 24.0;
  static readonly SMPTE_25 = 25.0;
  static readonly SMPTE_30DROP = 29.97;
  static readonly SMPTE_30 = 30.0;

  private readonly divisionType: number;
  private readonly resolution: number;
  private readonly tracks: Track[] = [];

  constructor(divisionType: number, resolution: number) {
    this.divisionType = divisionType;
    this.resolution = resolution;
  }

  /** One of the `PPQ` / `SMPTE_*` constants. */
  getDivisionType(): number {
    return this.divisionType;
  }

  /** Pulses per quarter note for PPQ timing, ticks per frame for SMPTE. */
  getResolution(): number {
    return this.resolution;
  }

  /** Appends a new empty track. Track order is MIDI file track order. */
  createTrack(): Track {
    const track = new Track();
    this.tracks.push(track);
    return track;
  }

  /** Removes by identity. @return whether the track belonged to this sequence */
  deleteTrack(track: Track): boolean {
    const idx = this.tracks.indexOf(track);
    if (idx !== -1) {
      this.tracks.splice(idx, 1);
      return true;
    }
    return false;
  }

  /**
   * The live track list, in file order. It is the sequence's own array, not a
   * copy — `readonly` states that callers must not write to it, and none does;
   * tracks are added through `createTrack` so the sequence stays the single owner.
   */
  getTracks(): readonly Track[] {
    return this.tracks;
  }

  /** The largest tick in any track, i.e. the sequence's length in ticks. */
  getTickLength(): number {
    let maxTick = 0;
    for (const track of this.tracks) {
      const t = track.ticks();
      if (t > maxTick) maxTick = t;
    }
    return maxTick;
  }

  /**
   * Sequence duration in microseconds, integrating the tempo map.
   *
   * Approximate on purpose, and in two ways worth knowing before trusting the
   * number: tempo events from *all* tracks are merged and sorted by tick with no
   * tie-break, and only the last tempo at a given tick is not specially handled —
   * whichever sorts last wins. Nothing in the export path reads this; it is
   * informational output.
   */
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
