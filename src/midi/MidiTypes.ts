/**
 * Browser-compatible MIDI types to replace javax.sound.midi.
 * These types provide the core MIDI data structures needed for
 * reading, writing, and manipulating Standard MIDI File (SMF) data.
 *
 * There is no meico counterpart to this file: Java uses `javax.sound.midi`
 * directly, so the reference for everything here is the JDK's behaviour, not a
 * `.java` file in `/Users/nielspfeffer/Projects/meico`. Three consequences that the
 * rest of the port depends on and that are easy to break by accident:
 *
 * - **`Track.add` keeps a track sorted by tick at all times** (JDK contract), and
 *   the sort is stable, so events added at the same tick stay in insertion order.
 *   That insertion order *is* the event order of the exported MIDI file, which
 *   `tests/integration/midi-byte-equivalence.test.ts` compares event by event
 *   against Java-generated `.mid` references. Changing when or how `add` sorts
 *   reorders the file.
 * - **A `MidiMessage` is an immutable value; a `MidiEvent` is a mutable holder.**
 *   `MidiEvent.getMessage()` hands out the message it holds, and that is safe to
 *   share because nothing can write through it. Rewriting an event's message —
 *   which `Midi.noteOns2NoteOffs` does — replaces the *reference* on the event
 *   through `MidiEvent.setMessage`, so no event is removed, re-added or re-sorted.
 * - **{@link messageBytes} derives the wire form; nothing stores it.** See the
 *   {@link MidiMessage} comment for why that matters.
 *
 * The numeric constants below are frozen: they are the wire values of the MIDI
 * specification, and `EventMaker` re-declares the same numbers under its own names.
 */

import { matchKind } from '../prelude/index.js';

// ============================================================
// Variable-length quantities
// ============================================================

/**
 * Append a value to `bytes` as a MIDI variable-length quantity: seven bits per byte,
 * most significant group first, high bit set on every byte but the last. Negative
 * values encode as a single `00`.
 *
 * This is *the* VLQ encoder. It used to have a twin — `Midi.writeVariableLength`
 * appended, `MetaMessage.encodeVariableLength` allocated, and a comment on each said
 * the two had to agree. They no longer can disagree: {@link encodeVariableLength} is
 * this function plus an allocation, and every variable-length field the port writes
 * (delta times, meta payload lengths, sysex payload lengths, and the meta framing
 * {@link messageBytes} derives) comes out of here.
 *
 * @param bytes the output byte array, appended to in place
 * @param value the value to encode
 */
export function writeVariableLength(bytes: number[], value: number): void {
  let rest = value < 0 ? 0 : value;

  // Build the variable-length bytes in reverse, then emit them MSB first.
  const vlqBytes: number[] = [];
  vlqBytes.push(rest & 0x7f);
  rest >>= 7;
  while (rest > 0) {
    vlqBytes.push((rest & 0x7f) | 0x80);
    rest >>= 7;
  }
  for (let i = vlqBytes.length - 1; i >= 0; i--) {
    bytes.push(vlqBytes[i]);
  }
}

/** {@link writeVariableLength} into a fresh array. */
export function encodeVariableLength(value: number): Uint8Array {
  const bytes: number[] = [];
  writeVariableLength(bytes, value);
  return new Uint8Array(bytes);
}

/**
 * How many bytes {@link encodeVariableLength} would produce, without producing them.
 *
 * Only {@link messageLength} needs this, and only because a meta message's length is
 * a property of bytes it does not keep.
 */
function variableLengthSize(value: number): number {
  let rest = value < 0 ? 0 : value;
  let size = 1;
  rest >>= 7;
  while (rest > 0) {
    size++;
    rest >>= 7;
  }
  return size;
}

// ============================================================
// MidiMessage — the sum of the three message families
// ============================================================

/**
 * A MIDI message: one of exactly three shapes.
 *
 * ## Why this is a union and not a class hierarchy
 *
 * It was `abstract class MidiMessage` with `ShortMessage`, `MetaMessage` and
 * `SysexMessage` extending it, mirroring `javax.sound.midi`. The mirror was
 * misleading in two measurable ways.
 *
 * The hierarchy had **one** virtual method, `clone()`, and every other use of the
 * type discriminated by hand. `Midi.buildTrackChunk` was a four-way `instanceof`
 * chain (meta / sysex / short / "unknown message type — write raw bytes"); five more
 * `instanceof` tests sat in `Midi.getTempoData`, `Midi.print`, the two
 * noteOn/noteOff converters and `Sequence.getMicrosecondLength`, and six more across
 * the tests. So the sum type was already there; inheritance only hid it, and hid it
 * badly enough that the writer carried a fourth branch for a subclass that cannot
 * exist. That branch is gone: `matchKind` over three arms is exhaustive by
 * construction, and a fourth family could not be added without the compiler naming
 * every site that must handle it.
 *
 * `clone()` is gone too, and with it the last reason for the base class. It existed
 * so that `Midi.append`, `Midi.convertPPQ` and `Midi.cloneSequence` could copy a
 * sequence without the copy's messages aliasing the original's — necessary when
 * `ShortMessage.setMessage` could rewrite a message's bytes under everyone holding
 * it. The arms below are `readonly` values, so there is nothing to defend against:
 * the copies share their messages, and `Midi.noteOns2NoteOffs` swaps in a new one
 * through {@link MidiEvent.setMessage} instead of writing through the old.
 *
 * ## Why the wire bytes are derived
 *
 * `MetaMessage` used to store its payload **twice** — the inherited `data` held the
 * complete `FF <type> <vlq length> <payload>`, and a private `_data` held the payload
 * alone — with nothing enforcing that the two agreed. That is a representable invalid
 * state in the most literal sense: a meta message whose framing described a different
 * payload than the one `Midi.buildTrackChunk` wrote. Each arm now carries only what
 * its family cannot be reconstructed without, and {@link messageBytes} builds the wire
 * form on demand. The one place that actually needed the wire form in bulk —
 * `buildTrackChunk` — reads the arms directly and never materialises it at all, which
 * also removes one `Uint8Array` allocation per exported event.
 */
export type MidiMessage = ShortMessage | MetaMessage | SysexMessage;

/** The three families' discriminants, for tables that must be total over them. */
export type MidiMessageKind = MidiMessage['kind'];

/**
 * The 0, 1 or 2 data bytes following a short message's status byte, each already
 * masked to seven bits.
 *
 * A tuple union rather than `readonly number[]` so that the arity the MIDI
 * specification allows is the arity the type allows: `getLength()` used to be a read
 * of a `Uint8Array` that nothing stopped from holding four bytes.
 */
export type ShortMessageData = readonly [] | readonly [number] | readonly [number, number];

/**
 * A short (channel or system) MIDI message — the `javax.sound.midi.ShortMessage`
 * family.
 *
 * `status` is the complete status byte, not a command/channel pair, because the two
 * are not separable: the JDK's three-argument constructor takes a ready-made status
 * byte, and for a system message (status ≥ 0xF0) the low nibble is not a channel at
 * all. {@link shortCommand} and {@link shortChannel} split it where splitting is
 * meaningful.
 */
export interface ShortMessage {
  readonly kind: 'short';
  /** The status byte, masked to 0..255 at construction. */
  readonly status: number;
  readonly data: ShortMessageData;
}

/**
 * The status-byte constants of `javax.sound.midi.ShortMessage`, which were its
 * `static final` fields.
 *
 * This is a value declared beside the `ShortMessage` *type* of the same name, so
 * `ShortMessage.NOTE_ON` still reads as it did and as it does in Java. `EventMaker`
 * declares the same numbers again in decimal under meico's names; the two tables are
 * deliberately independent (see that file's header), so `ShortMessage.NOTE_OFF` and
 * `EventMaker.NOTE_OFF` can both appear in one statement — `Midi.noteOns2NoteOffs`
 * does exactly that.
 */
export const ShortMessage = {
  NOTE_OFF: 0x80, // 128
  NOTE_ON: 0x90, // 144
  POLY_PRESSURE: 0xa0, // 160
  CONTROL_CHANGE: 0xb0, // 176
  PROGRAM_CHANGE: 0xc0, // 192
  CHANNEL_PRESSURE: 0xd0, // 208
  PITCH_BEND: 0xe0, // 224
  SYSTEM_EXCLUSIVE: 0xf0, // 240
  MIDI_TIME_CODE: 0xf1, // 241
  SONG_POSITION_POINTER: 0xf2, // 242
  SONG_SELECT: 0xf3, // 243
  TUNE_REQUEST: 0xf6, // 246
  END_OF_EXCLUSIVE: 0xf7, // 247
  TIMING_CLOCK: 0xf8, // 248
  START: 0xfa, // 250
  CONTINUE: 0xfb, // 251
  STOP: 0xfc, // 252
  ACTIVE_SENSING: 0xfe, // 254
  SYSTEM_RESET: 0xff, // 255
} as const;

/**
 * A MIDI meta message — the `javax.sound.midi.MetaMessage` family. Meta messages
 * exist only in files, never on the wire in real time.
 *
 * `payload` is the payload **alone**, without the `FF <type> <length>` framing;
 * {@link messageBytes} adds the framing back. The message owns the array: it is
 * copied in by {@link metaMessage} and copied out by {@link metaPayload}, so a
 * message never aliases a buffer somebody else can write to (`Midi.readMidiData`
 * builds these over views into the file image).
 */
export interface MetaMessage {
  readonly kind: 'meta';
  /** Meta event type, masked to 0..255. E.g. 0x51 for set-tempo; see `EventMaker.META_*`. */
  readonly type: number;
  readonly payload: Readonly<Uint8Array>;
}

/** The meta-event status byte, which was `javax.sound.midi.MetaMessage.META`. */
export const MetaMessage = {
  META: 0xff,
} as const;

/**
 * A MIDI System Exclusive message — the `javax.sound.midi.SysexMessage` family.
 *
 * Unlike the other two arms this one really is just bytes, and it keeps them whole:
 * `bytes` includes the leading `F0` (or `F7`, for a continuation packet) and the
 * trailing `F7`. `Midi.buildTrackChunk` writes the first byte, then a length VLQ
 * counting the *rest*, then the rest — so the terminator is inside the length it
 * counts, which is what the file format asks for.
 */
export interface SysexMessage {
  readonly kind: 'sysex';
  readonly bytes: Readonly<Uint8Array>;
}

// ------------------------------------------------------------
// Constructors
// ------------------------------------------------------------

/**
 * A channel voice message: `command`'s high nibble OR-ed with `channel`'s low nibble.
 *
 * Program change and channel pressure carry **one** data byte, so `data2` is dropped
 * rather than written as a zero — writing it would add a stray byte to every program
 * change in the exported file.
 *
 * This is one of the JDK's four `ShortMessage` constructors, split out under its own
 * name instead of living in an overload set. The overloads were two
 * `unified-signatures` lint findings and a genuine hazard: `(status, data1, data2)`
 * and `(command, channel, data1, data2)` disagree about what the *first* argument
 * means, and a merged signature would additionally have let a two-argument call
 * typecheck into the single-status-byte branch, silently dropping the second
 * argument. Named constructors cannot be confused for one another.
 */
export function channelMessage(
  command: number,
  channel: number,
  data1: number,
  data2: number,
): ShortMessage {
  const status = (command & 0xf0) | (channel & 0x0f);
  return {
    kind: 'short',
    status,
    data:
      command === ShortMessage.PROGRAM_CHANGE || command === ShortMessage.CHANNEL_PRESSURE
        ? [data1 & 0x7f]
        : [data1 & 0x7f, data2 & 0x7f],
  };
}

/**
 * A short message from a ready-made status byte and two data bytes.
 *
 * `status` is taken whole (masked to eight bits), so the caller owns the channel
 * nibble — unlike {@link channelMessage}, this does no command/channel arithmetic and
 * no one-versus-two-data-byte special casing.
 */
export function shortMessage(status: number, data1: number, data2: number): ShortMessage {
  return { kind: 'short', status: status & 0xff, data: [data1 & 0x7f, data2 & 0x7f] };
}

/**
 * A short message that is nothing but its status byte — a system real-time message
 * such as `TIMING_CLOCK`, or a tune request.
 */
export function oneByteMessage(status: number): ShortMessage {
  return { kind: 'short', status: status & 0xff, data: [] };
}

/**
 * A meta message.
 *
 * The JDK's constructor is `MetaMessage(int type, byte[] data, int length)`, and the
 * `length` parameter is gone: every one of the eleven call sites in this port passed
 * exactly `data.length`, so it was a third thing that had to agree with two others. A
 * caller that wants a prefix of a buffer passes `buffer.subarray(0, n)`, which says
 * the same thing without the chance of saying it wrongly.
 *
 * @param type meta event type, masked to 0..255
 * @param payload the payload bytes, copied — the message owns its copy
 */
export function metaMessage(type: number, payload: Readonly<Uint8Array>): MetaMessage {
  return { kind: 'meta', type: type & 0xff, payload: new Uint8Array(payload) };
}

/**
 * A system exclusive message.
 *
 * @param bytes the complete message including its `F0`/`F7` framing, copied
 */
export function sysexMessage(bytes: Readonly<Uint8Array>): SysexMessage {
  return { kind: 'sysex', bytes: new Uint8Array(bytes) };
}

// ------------------------------------------------------------
// Accessors
// ------------------------------------------------------------

/**
 * The complete message as it appears on the wire, status byte first — freshly built
 * on every call.
 *
 * This is what `MidiMessage.getMessage()` returned, and it returned a copy for the
 * same reason this allocates: a caller must not be able to write into a message. The
 * difference is that there is no longer a stored buffer to copy *from*, so a meta
 * message's framing cannot drift from its payload. `Midi.buildTrackChunk` does not
 * call this — it appends the same bytes straight into the track buffer.
 */
export function messageBytes(message: MidiMessage): Uint8Array {
  return matchKind(message, {
    short: (m) => Uint8Array.from([m.status, ...m.data]),
    meta: (m) => {
      const vlq = encodeVariableLength(m.payload.length);
      const bytes = new Uint8Array(2 + vlq.length + m.payload.length);
      bytes[0] = MetaMessage.META;
      bytes[1] = m.type;
      bytes.set(vlq, 2);
      bytes.set(m.payload, 2 + vlq.length);
      return bytes;
    },
    sysex: (m) => new Uint8Array(m.bytes),
  });
}

/**
 * The status byte.
 *
 * 0 for a sysex message with no bytes at all, where the JDK would throw — that is the
 * old `MidiMessage.getStatus()`'s empty-message case, and it is now unreachable for
 * the other two arms because they always have one.
 */
export function messageStatus(message: MidiMessage): number {
  return matchKind(message, {
    short: (m) => m.status,
    meta: () => MetaMessage.META,
    sysex: (m) => (m.bytes.length > 0 ? m.bytes[0] & 0xff : 0),
  });
}

/** The length of {@link messageBytes}, without building them. */
export function messageLength(message: MidiMessage): number {
  return matchKind(message, {
    short: (m) => 1 + m.data.length,
    meta: (m) => 2 + variableLengthSize(m.payload.length) + m.payload.length,
    sysex: (m) => m.bytes.length,
  });
}

/** The status byte's high nibble, i.e. the message type without the channel. */
export function shortCommand(message: ShortMessage): number {
  return message.status & 0xf0;
}

/** The status byte's low nibble. Meaningless for system messages (status ≥ 0xF0). */
export function shortChannel(message: ShortMessage): number {
  return message.status & 0x0f;
}

/**
 * The first data byte, 0 when the message has none — where the JDK would throw.
 *
 * The `length` test is written against a literal so that it narrows
 * {@link ShortMessageData}: with the arity in the type, the fallback is reachable only
 * for the arity that actually lacks the byte, and `data[0]` needs no assertion.
 */
export function shortData1(message: ShortMessage): number {
  const { data } = message;
  return data.length === 0 ? 0 : data[0];
}

/** The second data byte, 0 for one-data-byte messages (program change, channel pressure). */
export function shortData2(message: ShortMessage): number {
  const { data } = message;
  return data.length === 2 ? data[1] : 0;
}

/** The payload only, as a copy — without the `FF <type> <length>` framing. */
export function metaPayload(message: MetaMessage): Uint8Array {
  return new Uint8Array(message.payload);
}

// ============================================================
// MidiEvent
// ============================================================

/**
 * A MIDI event: a {@link MidiMessage} with an **absolute** tick timestamp.
 * Mirrors javax.sound.midi.MidiEvent.
 *
 * Delta times exist only in the file format; everything in memory is absolute, and
 * `Midi.buildTrackChunk` differences consecutive ticks when it writes.
 *
 * This is the mutable half of the pair — the message it holds is a value, the event
 * is the cell that holds it — and both of its fields are mutable for the same reason:
 * they are written **in place**, so no event is removed and re-added and no track is
 * re-sorted. Two callers depend on that, in two different ways:
 *
 * - `Midi.addOffset` shifts a whole sequence by writing every `tick`. Doing so does
 *   not re-sort the containing track; only `Track.add` sorts, so an offset that
 *   changed the relative order of two events would leave the track in an order the
 *   file format cannot express. One constant offset preserves order by construction.
 * - `Midi.noteOns2NoteOffs` and `noteOffs2NoteOns` convert a sequence by writing every
 *   affected `message`. This is where `ShortMessage.setMessage` used to write, back
 *   when a message's bytes were mutable; the swap moved up one level when the messages
 *   became values, and the ordering guarantee is the same one.
 */
export class MidiEvent {
  private message: MidiMessage;
  private tick: number;

  constructor(message: MidiMessage, tick: number) {
    this.message = message;
    this.tick = tick;
  }

  /**
   * The message this event holds. Safe to share — a {@link MidiMessage} is a value,
   * so a second holder cannot change what this event carries; only
   * {@link MidiEvent.setMessage} can.
   */
  getMessage(): MidiMessage {
    return this.message;
  }

  /** Replaces the message in place, leaving this event's position in its track alone. */
  setMessage(message: MidiMessage): void {
    this.message = message;
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
        if (msg.kind === 'meta' && msg.type === 0x51) {
          const data = msg.payload;
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
