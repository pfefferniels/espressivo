/**
 * This class holds Midi data and provides some functionality for it.
 * Port of meico.midi.Midi
 *
 * In the browser environment, the javax.sound.midi API is replaced by
 * our custom MidiTypes classes. The class provides export to Standard MIDI File
 * (SMF) binary format.
 *
 * ## The SMF reader and writer have no Java counterpart
 *
 * `Midi.java` does not serialise anything itself: `writeMidi` delegates to
 * `MidiSystem.write(sequence, 1, file)` and the constructor reads through
 * `MidiSystem.getSequence(file)` (`Midi.java:77,538`). `parseSequence`, `exportMidi` and
 * `buildTrackChunk` below are a reimplementation of the JDK's
 * `StandardMidiFileWriter`/`Reader`, so there is no `.java` file to compare them against.
 * `tests/integration/midi-byte-equivalence.test.ts` pins the reader — it reaches this file
 * only through `Msm.exportMidi`, which never calls the writer — and
 * `midi-writer-equivalence.test.ts` pins the writer, by reading each Java reference and
 * writing it back.
 *
 * Three measured consequences of the reimplementation, all pre-existing, none of them bugs:
 *
 * 1. This writer never uses running status; every channel message gets its full status
 *    byte. The JDK's writer compresses consecutive same-status messages, so of the 48 Java
 *    reference `.mid` files, 33 come back byte-identical through `parseSequence` →
 *    `exportMidi`, 14 come out 1 to 13 bytes longer — all of it running status re-expanded —
 *    and one comes out 2 bytes shorter, for the reason in (3). The per-file deltas are a
 *    table in the writer suite. The reader handles running status on input, which is why the
 *    event streams match.
 * 2. This writer picks format 0 for a single-track sequence, while Java always passes 1 to
 *    `MidiSystem.write`. Only the header byte differs; the suite does not read it.
 * 3. Negative ticks survive a read but not a write. `all-maps-reference/
 *    ornamentation_expressive.mid` begins at tick −18 — the ornamentation renderer can move
 *    an event before the start — and the JDK wrote that as a 10-byte VLQ
 *    (`ff ff ff ff ff ff ff ff ff 6e`, Java's `long` −18). This reader's 32-bit shifts wrap
 *    around and recover −18 exactly; `buildTrackChunk` then clamps the negative delta to 0
 *    on export. That one file is the only reference whose event stream is not a fixed point
 *    of read-then-write.
 *
 *    The clamp is not local in its effect. Deltas are computed from absolute ticks, so
 *    zeroing the first one leaves every later delta alone and moves the whole track 18 ticks
 *    further from the start: all 43 events of track 1 shift by +18, track 0 is untouched,
 *    and no message byte changes. The track is re-anchored, not re-encoded.
 *
 * @author Axel Berndt
 */

import {
  Sequence,
  Track,
  MidiEvent,
  ShortMessage,
  MetaMessage,
  channelMessage,
  metaMessage,
  messageStatus,
  metaPayload,
  sysexMessage,
  shortChannel,
  shortCommand,
  shortData1,
  shortData2,
  writeVariableLength,
  type MidiMessage,
  type MidiMessageKind,
} from './MidiTypes.js';
import * as EventMaker from './EventMaker.js';
import { matchKind, zipWith } from '../prelude/index.js';

/**
 * The name {@link Midi.print} gives each message family. Java prints
 * `getMessage().getClass()`, i.e. the JDK's implementation class
 * (`class com.sun.media.sound.FastShortMessage`); the port prints the plain name.
 */
const MESSAGE_FAMILY_NAME: Readonly<Record<MidiMessageKind, string>> = {
  short: 'ShortMessage',
  meta: 'MetaMessage',
  sysex: 'SysexMessage',
};

export class Midi {
  private file: string | null = null; // the midi filename
  /**
   * The sequence. Never null: every constructor path produces one. Java's field starts at
   * null because `new Sequence(divisionType, resolution)` throws `InvalidMidiDataException`
   * there and `Midi(File)` can fail to read; this port's `Sequence` constructor is two
   * assignments, and {@link Midi.fromBytes} throws rather than half-building.
   */
  private sequence: Sequence;

  /**
   * A Midi is its sequence, so that is what the constructor takes. {@link Midi.empty} and
   * {@link Midi.fromBytes} are the other two ways to build one.
   *
   * @param midifile optional filename; an existing file is not read, and `exportMidi`
   *                 would overwrite it
   */
  constructor(sequence: Sequence, midifile?: string) {
    this.sequence = sequence;
    if (midifile !== undefined) this.file = midifile;
  }

  /**
   * An empty MIDI at the given PPQ timing resolution — Java's `Midi()` and `Midi(int ppq)`,
   * which differed only in whether they defaulted the resolution to 720.
   */
  static empty(ppq = 720): Midi {
    return new Midi(new Sequence(Sequence.PPQ, ppq));
  }

  /**
   * A Midi parsed from Standard MIDI File bytes — Java's `Midi(File)`, minus the file
   * handling. Throws on a missing `MThd` or `MTrk` tag; see {@link parseSequence} for what
   * it tolerates otherwise.
   */
  static fromBytes(midiData: Uint8Array): Midi {
    return new Midi(Midi.parseSequence(midiData));
  }

  /**
   * Parse MIDI binary data into a sequence — the Standard MIDI File (SMF) parser.
   *
   * Deliberately permissive, in the JDK's spirit: it trusts the MThd/MTrk tags and
   * the chunk lengths, and resynchronises to `trackEnd` after each track, so a
   * malformed event body costs one track rather than the file. It throws only on a
   * missing tag. A track chunk whose declared length runs past the end of the file ends
   * where the data ends.
   *
   * Two decoding details the exported bytes depend on:
   *
   * - Running status: a byte below 0x80 where a status byte is expected reuses the
   *   previous *channel* status; system messages (≥ 0xF0) do not become the running
   *   status. Since `buildTrackChunk` never re-emits running status, reading and writing
   *   are inverse at the event level, not at the byte level.
   * - Delta times use 32-bit `<<`, so a VLQ longer than five bytes wraps around — which is
   *   what recovers Java's negative ticks exactly (see the class comment).
   *
   * @param data raw MIDI file bytes
   */
  static parseSequence(data: Uint8Array): Sequence {
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    let offset = 0;

    // Read the MThd header chunk. A four-byte view rather than four subscripts, so a file
    // shorter than the tag produces a short tag, which is not 'MThd', which is the error
    // below.
    const headerTag = String.fromCharCode(...data.subarray(0, 4));
    if (headerTag !== 'MThd') {
      throw new Error('Invalid MIDI file: missing MThd header');
    }
    offset += 4;

    const headerLength = view.getUint32(offset);
    offset += 4;

    offset += 2; // skip the format word (0, 1 or 2), which this parser does not need

    const numTracks = view.getUint16(offset);
    offset += 2;

    const division = view.getUint16(offset);
    offset += 2;

    // Skip any extra header bytes
    offset += headerLength - 6;

    // Division is PPQ when bit 15 is 0, SMPTE otherwise. An unrecognised SMPTE frame rate
    // silently stays PPQ with the low byte as its resolution, which is wrong but harmless:
    // nothing in the port writes SMPTE.
    let divisionType = Sequence.PPQ;
    let resolution = division;
    if (division & 0x8000) {
      // the upper byte holds the frame rate as a negative signed byte, so it has to be
      // sign extended
      const smpteFormat = (((division >> 8) & 0xff) << 24) >> 24;
      resolution = division & 0xff;
      if (smpteFormat === -24) divisionType = Sequence.SMPTE_24;
      else if (smpteFormat === -25) divisionType = Sequence.SMPTE_25;
      else if (smpteFormat === -29) divisionType = Sequence.SMPTE_30DROP;
      else if (smpteFormat === -30) divisionType = Sequence.SMPTE_30;
    }

    const sequence = new Sequence(divisionType, resolution);

    for (let t = 0; t < numTracks && offset < data.length; t++) {
      // A four-byte view for the same reason as the MThd read above.
      const trackTag = String.fromCharCode(...data.subarray(offset, offset + 4));
      if (trackTag !== 'MTrk') {
        throw new Error(`Invalid MIDI file: missing MTrk header at offset ${offset}`);
      }
      offset += 4;

      const trackLength = view.getUint32(offset);
      offset += 4;

      const trackEnd = offset + trackLength;
      const track = sequence.createTrack();

      let runningStatus = 0;
      let absoluteTick = 0;

      while (offset < trackEnd && offset < data.length) {
        // Read the delta time (variable-length quantity). A group past the end of the data
        // reads as 0, and its value cannot matter: `offset` only grows, so the status read
        // below is then past the end too and breaks out of the track, discarding both
        // `deltaTime` and the `absoluteTick` it was added to.
        let deltaTime = 0;
        let b: number;
        do {
          b = data[offset++] ?? 0;
          deltaTime = (deltaTime << 7) | (b & 0x7f);
        } while (b & 0x80);

        absoluteTick += deltaTime;

        // Read the status byte. The loop bound above only tests where an *event* starts, so
        // a delta time that runs to the last byte leaves nothing for the status: a track
        // chunk whose declared length outruns the file is over, whatever the length claimed.
        const firstByte = data.at(offset);
        if (firstByte === undefined) break;

        let statusByte = firstByte;
        if (statusByte < 0x80) {
          statusByte = runningStatus;
        } else {
          offset++;
          if (statusByte < 0xf0) {
            runningStatus = statusByte;
          }
        }

        if (statusByte === 0xff) {
          // Meta event
          const metaType = data[offset++] ?? 0;
          let metaLength = 0;
          do {
            b = data[offset++] ?? 0;
            metaLength = (metaLength << 7) | (b & 0x7f);
          } while (b & 0x80);

          // `data.subarray`, and not `new Uint8Array(data.buffer, data.byteOffset + offset,
          // metaLength)`: the three-argument constructor is bounded by the underlying
          // ArrayBuffer, where `subarray` is bounded by this view and clamps. `metaLength`
          // comes straight off the file and is never checked against what remains, so a
          // truncated or hostile `.mid` can declare more than it supplies — and since Node
          // pools reads under 4 KB into one 8 KB ArrayBuffer, the unclamped read was one
          // addition away from unrelated heap (measured: a file declaring a 200-byte text
          // event and supplying none yielded 200 bytes of another allocation, silently).
          // Clamping is the permissiveness this parser claims: the file ran out, so the event
          // body is what there was of it.
          const metaData = data.subarray(offset, offset + metaLength);
          offset += metaLength;

          const msg = metaMessage(metaType, metaData);
          track.add(new MidiEvent(msg, absoluteTick));
        } else if (statusByte === 0xf0 || statusByte === 0xf7) {
          // SysEx event
          let sysexLength = 0;
          do {
            b = data[offset++] ?? 0;
            sysexLength = (sysexLength << 7) | (b & 0x7f);
          } while (b & 0x80);

          const sysexData = new Uint8Array(sysexLength + 1);
          sysexData[0] = statusByte;
          // Clamped by `subarray` for the reason given at the meta read above. `set` copies
          // whatever the clamped view holds, so a sysex that outruns the file arrives
          // zero-padded to its declared length, which `sysexData` keeps.
          sysexData.set(data.subarray(offset, offset + sysexLength), 1);
          offset += sysexLength;

          const msg = sysexMessage(sysexData);
          track.add(new MidiEvent(msg, absoluteTick));
        } else {
          // Channel message (ShortMessage)
          const command = statusByte & 0xf0;
          const channel = statusByte & 0x0f;
          // A data byte the file does not have reads as 0.
          const data1 = data[offset++] ?? 0;

          if (command === 0xc0 || command === 0xd0) {
            // Program Change or Channel Aftertouch: 1 data byte
            const msg = channelMessage(command, channel, data1, 0);
            track.add(new MidiEvent(msg, absoluteTick));
          } else {
            // All other channel messages: 2 data bytes
            const data2 = data[offset++] ?? 0;
            const msg = channelMessage(command, channel, data1, data2);
            track.add(new MidiEvent(msg, absoluteTick));
          }
        }
      }

      // Make sure we advance to the actual end of the track
      offset = trackEnd;
    }

    return sequence;
  }

  /** this getter returns the file path/name */
  getFile(): string | null {
    return this.file;
  }

  /**
   * with this setter a new filename can be set
   * @param filename the filename including the full path and .mid extension
   */
  setFile(filename: string): void {
    this.file = filename;
  }

  /**
   * determine the standard midi file format (0, 1 or 2) of the current midi file/sequence
   *
   * A structural guess, matching Java's *fallback* path (`Midi.java:132`): 0 for at
   * most one track, 1 otherwise. Java's primary path asks `MidiSystem` which types
   * the sequence supports and takes the highest, and its `writeMidi` then ignores
   * the answer and always writes type 1. `exportMidi` applies the same rule as this
   * method but derives it independently, so the two must be kept in step.
   */
  getMidiFileFormat(): number {
    const trackCount = this.sequence.getTracks().length;
    if (trackCount <= 1) {
      return 0;
    }
    return 1;
  }

  /**
   * Replace this object's sequence with one parsed from SMF bytes.
   *
   * @param data raw MIDI file bytes
   */
  readMidiData(data: Uint8Array): void {
    this.sequence = Midi.parseSequence(data);
  }

  /** this getter returns the midi sequence */
  getSequence(): Sequence {
    return this.sequence;
  }

  /** this setter sets the sequence */
  setSequence(sequence: Sequence): void {
    this.sequence = sequence;
  }

  /**
   * Append the provided Midi to this. Differing PPQ will be adapted.
   *
   * Tracks are matched by index, not by name or channel: track 0 of the appended
   * sequence extends track 0 of this one, and missing tracks are created empty. The
   * offset is this sequence's current tick length, so the two pieces butt up against
   * each other with no gap and no overlap. The argument is not modified — a clone is
   * converted and read, and the new events share their messages with it, which is
   * safe because a message is a value.
   *
   * @param midi the Midi whose sequence should be appended
   */
  append(midi: Midi): void {
    const clone = new Midi(Midi.cloneSequence(midi.getSequence())); // in case we have to apply changes we do so with a clone and not the original
    try {
      clone.convertPPQ(this.getPPQ()); // adapt the PPQ timing basis if necessary
    } catch (e) {
      console.error(e);
      return;
    }

    while (this.getSequence().getTracks().length < clone.getSequence().getTracks().length) {
      this.getSequence().createTrack();
    }
    const tickLength = this.getSequence().getTickLength(); // get length of the sequence so far

    // The loop above has made this a total zip: this sequence now has at least as many
    // tracks as the clone, so `zipWith`'s stop-at-the-shorter rule stops at the clone's
    // last track.
    const trackPairs = zipWith(
      clone.getSequence().getTracks(),
      this.getSequence().getTracks(),
      (source, target) => [source, target] as const,
    );

    for (const [sourceTrack, targetTrack] of trackPairs) {
      for (const event of sourceTrack) {
        const message = event.getMessage();
        const newTick = event.getTick() + tickLength;
        targetTrack.add(new MidiEvent(message, newTick));
      }
    }
  }

  /**
   * this getter returns the timing resolution of the Midi sequence (in PPQ), or throws if
   * the timing concept is not PPQ
   */
  getPPQ(): number {
    if (this.sequence.getDivisionType() === Sequence.PPQ) {
      return this.sequence.getResolution();
    }
    throw new Error('Error: MIDI timing is in SMPTE, not PPQ!');
  }

  /**
   * This method converts the timing basis, i.e., it sets the new ppq value and converts
   * all events' date accordingly. A new MIDI sequence is created which replaces the old one.
   *
   * Dates are scaled by `ppq / ppqOld` and truncated toward zero, so converting
   * down and back up does not return the original ticks — the conversion is lossy by
   * design, which is why `getMinimalPPQ` exists to pick a resolution that is not.
   *
   * @param ppq the new pulses-per-quarter-note resolution
   */
  convertPPQ(ppq: number): void {
    const ppqOld = this.getPPQ();
    if (ppqOld === ppq) return;

    // `Midi.java:231` prints the conversion to stdout; the port does not.

    const newSequence = new Sequence(Sequence.PPQ, ppq);
    for (const track of this.sequence.getTracks()) {
      const newTrack = newSequence.createTrack();
      for (const event of track) {
        const newDate = Math.trunc((event.getTick() * ppq) / ppqOld);
        const newEvent = new MidiEvent(event.getMessage(), newDate); // the message is a value, so the new event shares it
        newTrack.add(newEvent);
      }
    }

    this.sequence = newSequence;
  }

  /**
   * computes the minimal integer timing resolution (in pulses per quarter note) necessary
   * for an accurate representation of the MIDI sequence
   * @param onlyNotes set false to consider all events; set true to consider only noteOn
   *   and noteOff events
   */
  getMinimalPPQ(onlyNotes: boolean): number {
    return Midi.getMinimalPPQ(this.getSequence(), onlyNotes);
  }

  /**
   * computes the minimal integer timing resolution (in pulses per quarter note) necessary
   * for an accurate representation of the specified sequence
   *
   * For each event it finds the coarsest power-of-two subdivision of a quarter note
   * that lands exactly on the event's tick, and keeps the finest such subdivision
   * over the whole sequence. The scan starts at the running maximum rather than at 1,
   * so an event already covered by the current answer costs one test — that is an
   * optimisation, not a semantic: a tick divisible by `ppq / maxSubdivisions` is
   * divisible by every coarser step too.
   *
   * @param onlyNotes set false to consider all events; set true to consider only noteOn
   *   and noteOff events
   * @return a power of two in 1..ppq
   */
  static getMinimalPPQ(sequence: Sequence, onlyNotes: boolean): number {
    if (sequence.getDivisionType() !== Sequence.PPQ)
      throw new Error('Error: MIDI sequence is not of division type PPQ.');

    const ppq = sequence.getResolution();
    let maxSubdivisions = 1;

    for (const track of sequence.getTracks()) {
      for (const event of track) {
        const command = messageStatus(event.getMessage()) & 0xf0;

        if (onlyNotes && command !== EventMaker.NOTE_ON && command !== EventMaker.NOTE_OFF)
          continue;

        for (let subdivs = maxSubdivisions; subdivs <= ppq; subdivs *= 2) {
          if (event.getTick() % (ppq / subdivs) === 0) {
            maxSubdivisions = Math.max(maxSubdivisions, subdivs);
            break;
          }
        }
      }
    }

    return maxSubdivisions;
  }

  /**
   * retrieve the tempo map data from the MIDI data
   * Returns an array of tempo entries with tick, bpm, and beatlength values.
   * NOTE: This returns raw data rather than a TempoMap MPM object, to avoid circular dependencies.
   * The calling code can use this data to construct a TempoMap if needed.
   *
   * Entries come out in track order, then event order within a track — not sorted by tick
   * across tracks. `beatlength` is always 0.25 because the MIDI set-tempo event is defined
   * per quarter note; the beat unit is not recoverable from the file.
   *
   * @return array of {tick, bpm, beatlength} entries
   */
  getTempoData(): { tick: number; bpm: number; beatlength: number }[] {
    const tempoData: { tick: number; bpm: number; beatlength: number }[] = [];

    const tracks = this.sequence.getTracks();
    for (const track of tracks) {
      for (const event of track) {
        const msg = event.getMessage();
        if (msg.kind === 'meta') {
          if (msg.type === EventMaker.META_Set_Tempo) {
            const mpq = EventMaker.byteArrayToInt(metaPayload(msg));
            const bpm = 60000000.0 / mpq;
            tempoData.push({ tick: event.getTick(), bpm: bpm, beatlength: 0.25 });
          }
        }
      }
    }

    return tempoData;
  }

  /**
   * returns the length of the midi sequence in ticks
   */
  getTickLength(): number {
    return this.sequence.getTickLength();
  }

  /**
   * returns the length of the midi sequence in microseconds
   */
  getMicrosecondLength(): number {
    return this.sequence.getMicrosecondLength();
  }

  /**
   * print some basic MIDI data to a string
   *
   * Diagnostic output, not a serialisation format. Two Java quirks are reproduced
   * rather than repaired: the `PROGRAM_CHANGE` case has no `break`, so a program
   * change prints its own line *and* the `default` branch's "Other message" text
   * (`Midi.java:370-376`), and the two-space gap in `"noteOn,  key:"` comes from
   * Java's `"noteOn, " + " key: "`. The one intentional divergence is the family
   * name: Java prints `getMessage().getClass()` (e.g.
   * `class com.sun.media.sound.FastShortMessage`), this prints
   * {@link MESSAGE_FAMILY_NAME} (e.g. `ShortMessage`).
   */
  static print(sequence: Sequence | null): string {
    if (sequence === null) {
      return 'No midi data loaded.';
    }

    let print = '';

    for (const [t, track] of sequence.getTracks().entries()) {
      print += `Track ${t} contains ${track.size()} events.\n`;
      for (const event of track) {
        print += `@${event.getTick()} `;
        const msg = event.getMessage();
        const familyName = MESSAGE_FAMILY_NAME[msg.kind];
        if (msg.kind === 'short') {
          print += `Channel: ${shortChannel(msg)} Command: ${shortCommand(msg)} `;
          switch (shortCommand(msg)) {
            case ShortMessage.NOTE_ON: {
              print += `noteOn,  key: ${shortData1(msg)} velocity: ${shortData2(msg)}`;
              break;
            }
            case ShortMessage.NOTE_OFF: {
              print += `noteOff,  key: ${shortData1(msg)} velocity: ${shortData2(msg)}`;
              break;
            }
            case ShortMessage.PROGRAM_CHANGE: {
              print += `program change,  number: ${shortData1(msg)}`;
              // Java falls through to `default` from here, so the "Other message" line is
              // appended too. Written out rather than left as a real fallthrough, so that
              // `noFallthroughCasesInSwitch` is free to catch the accidental ones.
              print += `Other message: ${familyName}`;
              break;
            }
            default: {
              print += `Other message: ${familyName}`;
            }
          }
        } else {
          print += `Other message: ${familyName}`;
        }
        print += '\n';
      }
      print += '---';
    }

    return print;
  }

  /**
   * In MIDI noteOff events are often encoded as noteOn events with velocity 0.
   * With this method these events are converted to real noteOffs.
   * The sequence to be altered is this Midi object's sequence.
   * @return the number of events changed
   */
  noteOns2NoteOffs(): number {
    return Midi.noteOns2NoteOffs(this.sequence);
  }

  /**
   * In MIDI noteOff events are often encoded as noteOn events with velocity 0.
   * With this method these events are converted to real noteOffs.
   *
   * Swaps the messages in place through `MidiEvent.setMessage`, so no event is removed and
   * re-added and no track is re-sorted — the sequence's event order is untouched.
   *
   * The two directions are not inverses: converting back with `noteOffs2NoteOns` gives a
   * noteOn with velocity 0, which this method would convert again, so the pair is
   * idempotent in each direction but lossy across the round trip.
   *
   * @param sequence the sequence to be altered
   * @return the number of events changed
   */
  static noteOns2NoteOffs(sequence: Sequence): number {
    let eventsChanged = 0;
    for (const track of sequence.getTracks()) {
      for (const event of track) {
        const msg = event.getMessage();
        if (msg.kind === 'short') {
          if (shortCommand(msg) === ShortMessage.NOTE_ON && shortData2(msg) === 0) {
            event.setMessage(
              channelMessage(EventMaker.NOTE_OFF, shortChannel(msg), shortData1(msg), 0),
            );
            eventsChanged++;
          }
        }
      }
    }
    return eventsChanged;
  }

  /**
   * In MIDI noteOff events are often encoded as noteOn events with velocity 0.
   * With this method noteOffs are replaced by noteOns.
   * The sequence to be altered is this Midi object's sequence.
   * @return the number of events changed
   */
  noteOffs2NoteOns(): number {
    return Midi.noteOffs2NoteOns(this.sequence);
  }

  /**
   * In MIDI noteOff events are often encoded as noteOn events with velocity 0.
   * With this method noteOffs are replaced by noteOns.
   *
   * The release velocity is discarded, not carried over: the replacement noteOn always gets
   * velocity 0, because that is what marks it as a noteOff in this encoding. Java does the
   * same (`Midi.java:451`).
   *
   * @param sequence the sequence to be altered
   * @return the number of events changed
   */
  static noteOffs2NoteOns(sequence: Sequence): number {
    let eventsChanged = 0;
    for (const track of sequence.getTracks()) {
      for (const event of track) {
        const msg = event.getMessage();
        if (msg.kind === 'short') {
          if (shortCommand(msg) === ShortMessage.NOTE_OFF) {
            event.setMessage(
              channelMessage(EventMaker.NOTE_ON, shortChannel(msg), shortData1(msg), 0),
            );
            eventsChanged++;
          }
        }
      }
    }
    return eventsChanged;
  }

  /**
   * adds an offset (in ticks) to all events in this MIDI's sequence
   *
   * Negative results are clamped to 0, so a large negative offset collapses the head
   * of the sequence onto tick 0 rather than reordering it. Ticks are written in place
   * and the tracks are not re-sorted, which is safe only because one constant offset
   * preserves order; the clamp keeps that true at the boundary.
   */
  addOffset(offsetInTicks: number): void {
    if (offsetInTicks === 0) return;

    for (const track of this.getSequence().getTracks()) {
      for (const e of track) {
        e.setTick(Math.max(0, e.getTick() + offsetInTicks));
      }
    }
  }

  /**
   * this creates a copy of the input sequence
   *
   * Every track and every event is new; the messages are shared, which is deep enough
   * because a message is a value — `noteOns2NoteOffs` on the clone swaps the message an
   * event holds rather than writing into the message, so the original's events still hold
   * theirs.
   *
   * Track and event order are preserved — events are re-added in their existing sorted
   * order, and `Track.add`'s stable sort keeps ties where they were.
   *
   * Java wraps the `new Sequence(...)` below in `catch (InvalidMidiDataException |
   * NullPointerException)` (`Midi.java:487`) because `javax.sound.midi.Sequence` validates
   * its division type and throws; this port's `Sequence` constructor is two assignments, so
   * there is no failure path and no null return.
   */
  static cloneSequence(sequence: Sequence): Sequence {
    const cloneSeq = new Sequence(sequence.getDivisionType(), sequence.getResolution());

    const tracks = sequence.getTracks();
    for (const track of tracks) {
      const newTrack = cloneSeq.createTrack();
      for (const event of track) {
        const newEvent = new MidiEvent(event.getMessage(), event.getTick());
        newTrack.add(newEvent);
      }
    }

    return cloneSeq;
  }

  /**
   * Export the MIDI sequence as a Standard MIDI File (SMF) binary Uint8Array.
   * This implements the SMF spec: MThd header chunk, then MTrk track chunks.
   *
   * Header layout is fixed at 14 bytes — `MThd`, length 6, then format, track count
   * and division as three big-endian 16-bit fields. `format` is 0 for at most one
   * track and 1 otherwise (see the class comment for how that differs from Java).
   * The whole file is sized before anything is written, so every byte position here
   * is load-bearing: adding or reordering a write shifts the rest of the file.
   */
  exportMidi(): Uint8Array {
    const tracks = this.sequence.getTracks();
    const numTracks = tracks.length;
    const format = numTracks <= 1 ? 0 : 1;
    const resolution = this.sequence.getResolution();

    const trackChunks = tracks.map((track) => Midi.buildTrackChunk(track));

    let totalSize = 14; // MThd header: 4 (tag) + 4 (length) + 6 (data)
    for (const chunk of trackChunks) {
      totalSize += 8 + chunk.length; // MTrk header (4 tag + 4 length) + data
    }

    const result = new Uint8Array(totalSize);
    const view = new DataView(result.buffer);
    let offset = 0;

    // Write MThd header
    result[offset++] = 0x4d; // M
    result[offset++] = 0x54; // T
    result[offset++] = 0x68; // h
    result[offset++] = 0x64; // d
    view.setUint32(offset, 6); // header data length is always 6
    offset += 4;
    view.setUint16(offset, format);
    offset += 2;
    view.setUint16(offset, numTracks);
    offset += 2;
    view.setUint16(offset, resolution);
    offset += 2;

    // Write each track chunk
    for (const chunk of trackChunks) {
      result[offset++] = 0x4d; // M
      result[offset++] = 0x54; // T
      result[offset++] = 0x72; // r
      result[offset++] = 0x6b; // k
      view.setUint32(offset, chunk.length);
      offset += 4;
      result.set(chunk, offset);
      offset += chunk.length;
    }

    return result;
  }

  /**
   * Build the binary data for a single MIDI track (the content inside an MTrk chunk).
   *
   * Each event is one delta-time VLQ followed by the message, in track order — which
   * is tick order, because `Track.add` keeps the track sorted. Four rules decide the
   * bytes, and all four are pinned by the byte-equivalence suite:
   *
   * - Delta = this tick minus the previous tick, floored at 0. The floor only fires on a
   *   negative absolute tick, which the reader can produce from a Java file (see the class
   *   comment) but nothing in the port generates.
   * - Meta events are framed here: `FF`, the type byte, then a length VLQ over the payload.
   *   The message carries only the payload, so there is no second framing to disagree with.
   * - SysEx keeps its leading `F0`/`F7` and counts the remainder, terminator included,
   *   which is what the format asks for.
   * - Channel messages are written verbatim, status byte and all. No running status: this
   *   is where the byte-level differences against the Java references come from, and they
   *   are semantically empty.
   *
   * The final `if (!hasEndOfTrack)` synthesises an end-of-track only if the track
   * carried none. Note it checks for one *anywhere* in the track, not at the end, so
   * a stray end-of-track in the middle suppresses the terminator the format requires.
   * That is how the code has always behaved and the fixtures never hit it.
   *
   * @return the raw track data (without the MTrk tag and length)
   */
  private static buildTrackChunk(track: Track): Uint8Array {
    const bytes: number[] = [];
    let lastTick = 0;
    let hasEndOfTrack = false;

    for (const event of track) {
      const msg = event.getMessage();
      const tick = event.getTick();

      const delta = Math.max(0, tick - lastTick);
      writeVariableLength(bytes, delta);
      lastTick = tick;

      const wroteEndOfTrack = matchKind<MidiMessage, boolean>(msg, {
        meta: (m) => {
          // Meta event: FF type length data
          bytes.push(MetaMessage.META);
          bytes.push(m.type);
          writeVariableLength(bytes, m.payload.length);
          for (const byte of m.payload) {
            bytes.push(byte);
          }
          return m.type === 0x2f; // End of Track
        },
        sysex: (m) => {
          // SysEx: status byte, then the length of the remaining bytes, then those bytes.
          // A message with no bytes at all — which the parser cannot produce but a caller
          // can — writes a status of 0 and a length of 0.
          bytes.push(m.bytes.at(0) ?? 0);
          writeVariableLength(bytes, m.bytes.length - 1);
          for (const byte of m.bytes.subarray(1)) {
            bytes.push(byte);
          }
          return false;
        },
        short: (m) => {
          bytes.push(m.status);
          for (const byte of m.data) {
            bytes.push(byte);
          }
          return false;
        },
      });
      hasEndOfTrack ||= wroteEndOfTrack;
    }

    // Ensure there is an End of Track meta event at the end
    if (!hasEndOfTrack) {
      writeVariableLength(bytes, 0); // delta time 0
      bytes.push(MetaMessage.META); // meta event
      bytes.push(0x2f); // End of Track
      bytes.push(0x00); // length 0
    }

    return new Uint8Array(bytes);
  }
}
