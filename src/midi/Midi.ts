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
 * `MidiSystem.getSequence(file)` (`Midi.java:77,538`). `readMidiData`,
 * `exportMidi` and `buildTrackChunk` below — together with `MidiTypes`'
 * `writeVariableLength`, which they share — are therefore a
 * reimplementation of the JDK's `StandardMidiFileWriter`/`Reader`, not a port of
 * meico code — there is no `.java` file to compare them against.
 *
 * They are pinned by two suites, and it took a deliberate control to notice that one of them
 * was not pinning the writer at all. `midi-byte-equivalence.test.ts` parses the Java-generated
 * `.mid` references and compares **event by event** — but it reaches this file only through
 * `Msm.exportMidi`, which returns a `Midi` *object*, so `exportMidi` and `buildTrackChunk`
 * below are never called on that path. Making every meta payload declare a length of zero
 * left all 43 of its tests passing. `midi-writer-equivalence.test.ts` closes that: it reads
 * each reference and writes it back, and the same defect fails 129 of its 180 tests.
 *
 * Three measured consequences of the reimplementation, all pre-existing, none of them bugs:
 *
 * 1. **This writer never uses running status.** Every channel message gets its full
 *    status byte. The JDK's writer does compress consecutive same-status messages,
 *    so of the 48 Java reference `.mid` files, **33 come back byte-identical** through
 *    `readMidiData` → `exportMidi`, **14 come out longer** by 1 to 13 bytes — all of it
 *    running status the JDK used and this writer re-expands — and **one comes out 2
 *    bytes shorter**, for the unrelated reason in (3). (This note used to say "15 come
 *    out 2-3 bytes longer", wrong in count, range and direction; the exact per-file
 *    deltas are now a table in the writer suite, so it cannot drift again.) The
 *    reader handles running status on input, which is why the event streams match.
 * 2. **This writer picks format 0 for a single-track sequence**, while Java always
 *    passes 1 to `MidiSystem.write`. Only the header byte differs; the suite does
 *    not read it.
 * 3. **Negative ticks survive a read but not a write.** `all-maps-reference/
 *    ornamentation_expressive.mid` really does begin at tick −18 — the ornamentation
 *    renderer can move an event before the start — and the JDK wrote that as a
 *    10-byte VLQ (`ff ff ff ff ff ff ff ff ff 6e`, Java's `long` −18). This reader's
 *    32-bit shifts wrap around and recover −18 exactly; `buildTrackChunk` then
 *    clamps the negative delta to 0 on export. That one file is the only reference
 *    whose event stream is not a fixed point of read-then-write.
 *
 *    **The effect is not local, which "clamps the delta to 0" makes it sound.** Deltas
 *    are computed from absolute ticks, so zeroing the first one leaves every later
 *    delta alone and moves the whole track 18 ticks further from the start: measured,
 *    all 43 events of track 1 shift by +18 while track 0 is untouched, and not one
 *    message byte changes. The track is re-anchored, not re-encoded.
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
 * The name {@link Midi.print} gives each message family.
 *
 * Java prints `getMessage().getClass()`, which yields the JDK's *implementation* class
 * (`class com.sun.media.sound.FastShortMessage`); the port has always printed the
 * plain name instead, and these are the three names it printed back when the messages
 * were classes and this was `msg.constructor.name`. A `Record` over the union rather
 * than a `switch`, so a fourth family could not be printed as `undefined`.
 */
const MESSAGE_FAMILY_NAME: Readonly<Record<MidiMessageKind, string>> = {
  short: 'ShortMessage',
  meta: 'MetaMessage',
  sysex: 'SysexMessage',
};

export class Midi {
  private file: string | null = null; // the midi filename
  /**
   * The sequence. **Never null**, and that is the point: every constructor path
   * produces one, so `getSequence` has nothing to assert about and the nine `!`s that
   * used to read this field are gone. Java's field starts at null because
   * `new Sequence(divisionType, resolution)` throws `InvalidMidiDataException` there and
   * `Midi(File)` can fail to read; neither is true of this port — our `Sequence`
   * constructor is two assignments, and the byte constructor throws rather than
   * half-building.
   */
  private sequence: Sequence;

  /**
   * A Midi is its sequence, so that is what the constructor takes — and it is now the
   * only one.
   *
   * There used to be four overloads over `number | Sequence | Uint8Array`, resolved by a
   * `typeof`/`instanceof` chain in the body: Java's way of spelling named construction in
   * a language that has no named constructors. TypeScript does have them. `Midi.empty(480)`
   * and `new Midi(bytes)` were not building a Midi *out of* a number or a byte array in
   * any sense the word "constructor" covers — one picks a timing resolution for an empty
   * one, the other parses a file. Those are {@link Midi.empty} and {@link Midi.fromBytes},
   * and naming them also removes the reason a reader had to check which branch a literal
   * argument would take.
   *
   * @param sequence the sequence this Midi is
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
   * Parse MIDI binary data into the sequence.
   * This implements the Standard MIDI File (SMF) parser.
   *
   * Deliberately permissive, in the JDK's spirit: it trusts the MThd/MTrk tags and
   * the chunk lengths, and resynchronises to `trackEnd` after each track, so a
   * malformed event body costs one track rather than the file. It throws only on a
   * missing tag.
   *
   * Permissive is not the same as credulous, and one case used to blur the two: a track
   * chunk whose declared length runs past the end of the file. The event loop's bound
   * tests where an event *starts*, so the last event could still read its status byte off
   * the end — and `data[offset]` there was `undefined`, which compares false against
   * everything, so the track gained a phantom channel message on command 0 with undefined
   * data bytes. That message is now not read: the status read is the one place the end of
   * the data ends the track, and the resynchronisation to `trackEnd` does the rest.
   * Every well-formed file is unaffected, and no reference `.mid` changes by a byte.
   *
   * Two decoding details the exported bytes depend on:
   *
   * - **Running status.** A byte below 0x80 where a status byte is expected reuses
   *   the previous *channel* status; system messages (≥ 0xF0) do not become the
   *   running status. Since `buildTrackChunk` never re-emits running status, reading
   *   and writing are not inverse at the byte level, only at the event level.
   * - **Delta times use 32-bit `<<`.** A VLQ longer than five bytes wraps around,
   *   which is what recovers Java's negative ticks exactly (see the class comment).
   *
   * @param data raw MIDI file bytes
   */
  static parseSequence(data: Uint8Array): Sequence {
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    let offset = 0;

    // Read MThd header chunk. Spreading a four-byte view rather than subscripting four
    // times keeps the short-file case an *answer* instead of four absent bytes: a file with
    // two bytes in it produces a two-character tag, which is not 'MThd', which is the error
    // below. (`String.fromCharCode(undefined, …)` used to produce NUL characters and reach
    // the same throw, so the behaviour is unchanged — it just no longer depends on that.)
    const headerTag = String.fromCharCode(...data.subarray(0, 4));
    if (headerTag !== 'MThd') {
      throw new Error('Invalid MIDI file: missing MThd header');
    }
    offset += 4;

    const headerLength = view.getUint32(offset);
    offset += 4;

    // const format = view.getUint16(offset);      // 0, 1, or 2
    offset += 2;

    const numTracks = view.getUint16(offset);
    offset += 2;

    const division = view.getUint16(offset);
    offset += 2;

    // Skip any extra header bytes
    offset += headerLength - 6;

    // Check if division is PPQ (bit 15 = 0) or SMPTE.
    // An unrecognised SMPTE frame rate silently stays PPQ with the low byte as its
    // resolution, which is wrong but harmless: nothing in the port writes SMPTE.
    let divisionType = Sequence.PPQ;
    let resolution = division;
    if (division & 0x8000) {
      // SMPTE timing - not commonly used but handle it
      // the upper byte holds the frame rate as a negative signed byte, so it has to be sign extended
      const smpteFormat = (((division >> 8) & 0xff) << 24) >> 24;
      resolution = division & 0xff;
      if (smpteFormat === -24) divisionType = Sequence.SMPTE_24;
      else if (smpteFormat === -25) divisionType = Sequence.SMPTE_25;
      else if (smpteFormat === -29) divisionType = Sequence.SMPTE_30DROP;
      else if (smpteFormat === -30) divisionType = Sequence.SMPTE_30;
    }

    const sequence = new Sequence(divisionType, resolution);

    // Read each track
    for (let t = 0; t < numTracks && offset < data.length; t++) {
      // Read MTrk header — as the MThd read above, a four-byte view rather than four
      // subscripts, so a chunk header cut short by the end of the file is a short tag.
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
        // Read delta time (variable-length quantity).
        //
        // `?? 0` for a group past the end of the data is not a new decision: `undefined`
        // coerces to `NaN` and `NaN & 0x7f` is 0, so the group already contributed nothing
        // and `NaN & 0x80` already stopped the loop. Naming the 0 makes that visible
        // instead of leaving it to a coercion three operators away.
        //
        // **A control on that 0 comes back green** — `?? 1` passes all 458 tests — and the
        // reason is a proof rather than a gap in the suite. `offset` only ever grows, so a
        // group read past the end guarantees the status read below is past the end too,
        // which breaks out of the track; `deltaTime` and the `absoluteTick` it was just
        // added to are discarded unread. The fallback here is unreachable *in its effect*,
        // whatever value it takes, and no test could distinguish 0 from 1.
        let deltaTime = 0;
        let b: number;
        do {
          b = data[offset++] ?? 0;
          deltaTime = (deltaTime << 7) | (b & 0x7f);
        } while (b & 0x80);

        absoluteTick += deltaTime;

        // Read the status byte.
        //
        // This is the one read where the end of the data is a real possibility and the old
        // spelling got it wrong. The `while` above only tests where an *event* starts, so a
        // delta time that runs to the last byte leaves nothing for the status; `data[offset]`
        // was then `undefined`, every comparison against it was false, and the track ended
        // with a phantom channel message on command 0 carrying undefined data bytes. There is
        // no such message. A track chunk whose declared length outruns the file is over,
        // whatever the length claimed, so stop reading it — the resynchronisation to
        // `trackEnd` below then does what it always did.
        const firstByte = data.at(offset);
        if (firstByte === undefined) break;

        let statusByte = firstByte;
        if (statusByte < 0x80) {
          // Running status: use previous status byte
          statusByte = runningStatus;
        } else {
          offset++;
          if (statusByte < 0xf0) {
            runningStatus = statusByte;
          }
        }

        // Parse the message based on type
        if (statusByte === 0xff) {
          // Meta event
          const metaType = data[offset++] ?? 0;
          let metaLength = 0;
          do {
            b = data[offset++] ?? 0;
            metaLength = (metaLength << 7) | (b & 0x7f);
          } while (b & 0x80);

          // `data.subarray`, and NOT `new Uint8Array(data.buffer, data.byteOffset + offset,
          // metaLength)`. The two agree for every in-bounds read and differ for the one that
          // matters: the three-argument constructor is bounded by the underlying ArrayBUFFER,
          // where `subarray` is bounded by this VIEW and clamps.
          //
          // `metaLength` is read straight off the file by the VLQ loop above and is never
          // checked against what remains, so a truncated or hostile `.mid` can declare more
          // than it supplies. Node's `Buffer` IS a `Uint8Array` and Node POOLS reads under
          // 4 KB into one 8 KB ArrayBuffer, so `Midi.fromBytes(readFileSync(path))` — the obvious
          // spelling — put the parser one addition away from unrelated heap. Measured: a file
          // declaring a 200-byte text event and supplying none produced a 200-byte meta event
          // holding bytes from another allocation in the same pool. Silently; no throw. Over
          // 4 KB Node hands out an exact-size buffer and the same input threw a RangeError
          // instead — two different wrong answers depending on file size.
          //
          // The suite never saw it because `tests/integration/midi-writer-equivalence.test.ts`
          // wraps its reads in `new Uint8Array(readFileSync(...))`, which copies into an
          // exact-size buffer. That was accidentally the mitigation, and it is why this was a
          // latent defect rather than a failing one.
          //
          // Clamping is also the RIGHT answer, not merely the safe one: it is the
          // permissiveness this docstring already claims — the file ran out, so the event body
          // is what there was of it, and the resynchronisation to `trackEnd` carries on
          // exactly as before. No well-formed file moves by a byte.
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
          // The same buffer-versus-view bug as the meta read above, and the same fix; see the
          // comment there for the measurement. `set` copies whatever the clamped view holds,
          // so a sysex that outruns the file arrives zero-padded to its declared length rather
          // than padded with someone else's memory — and `sysexData` keeps that length, so
          // nothing downstream sees a different shape.
          sysexData.set(data.subarray(offset, offset + sysexLength), 1);
          offset += sysexLength;

          const msg = sysexMessage(sysexData);
          track.add(new MidiEvent(msg, absoluteTick));
        } else {
          // Channel message (ShortMessage)
          const command = statusByte & 0xf0;
          const channel = statusByte & 0x0f;
          // A data byte the file does not have reads as 0. `channelMessage` masks its
          // arguments to seven bits, so the old `undefined` reached the wire as 0 anyway.
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

  /**
   * check if there is any midi data in the sequence
   *
   * Only true before a sequence exists at all — a sequence with zero tracks, or
   * with tracks holding no events, is not "empty" by this test.
   */
  // `isEmpty()` stood here and was deleted. It was `return this.sequence === null`, a
  // faithful port of `Midi.java:85` — but Java's field can be null (its `Sequence`
  // constructor throws, and `Midi(File)` can fail to read) and this port's cannot, so the
  // predicate could only ever answer false. Its two call sites in tests asserted exactly
  // that constant. `append`'s `midi.isEmpty()` guard went with it; appending a track-less
  // Midi is a no-op through the loops anyway, which is now pinned by a test that passes a
  // real 0-track Midi instead of one built by casting null past the compiler.

  /**
   * this getter returns the file path/name
   * @return the midi filename
   */
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
    // Java's `(this.sequence == null) -> 1` guard is dropped: the field is total here.
    const trackCount = this.sequence.getTracks().length;
    if (trackCount <= 1) {
      return 0;
    }
    return 1;
  }

  /**
   * Replace this object's sequence with one parsed from SMF bytes.
   *
   * Thin wrapper over {@link parseSequence}, which is where the parser lives now: a
   * function that *returns* a sequence can be called from the constructor without the
   * field being null in between, which is what made the field total.
   *
   * @param data raw MIDI file bytes
   */
  readMidiData(data: Uint8Array): void {
    this.sequence = Midi.parseSequence(data);
  }

  /**
   * this getter returns the midi sequence
   * @return the midi sequence
   */
  getSequence(): Sequence {
    return this.sequence;
  }

  /**
   * this setter sets the sequence
   * @param sequence
   */
  setSequence(sequence: Sequence): void {
    this.sequence = sequence;
  }

  /**
   * Append the provided Midi to this. Differing PPQ will be adapted.
   *
   * Tracks are matched **by index**, not by name or channel: track 0 of the appended
   * sequence extends track 0 of this one, and missing tracks are created empty. The
   * offset is this sequence's current tick length, so the two pieces butt up against
   * each other with no gap and no overlap. The argument is not modified — a clone is
   * converted and read, and the new events share their messages with it, which is
   * safe because a message is a value.
   *
   * @param midi the Midi whose sequence should be appended
   */
  append(midi: Midi): void {
    // Java guards `(midi == null) || midi.isEmpty()` here. Neither is reachable in this
    // port — the parameter is `Midi` and every `Midi` has a sequence — and both loops
    // below are already no-ops for a track-less argument, so dropping the guard leaves
    // behaviour identical. See the note where `isEmpty` used to be.
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

    // "Matched by index" is a zip, and the loop above has just made it a total one: this
    // sequence now has at least as many tracks as the clone, so `zipWith`'s stop-at-the-
    // shorter rule stops at the clone's last track, which is exactly the old loop bound.
    // Pairing them up front is what removes the two `getTracks()[t]` reads that no length
    // check could justify to the compiler; the pair array it builds is one entry per track.
    const trackPairs = zipWith(
      clone.getSequence().getTracks(),
      this.getSequence().getTracks(),
      (source, target) => [source, target] as const,
    );

    for (const [sourceTrack, targetTrack] of trackPairs) {
      // go through all tracks of the sequence to be added
      for (const event of sourceTrack) {
        const message = event.getMessage();
        const newTick = event.getTick() + tickLength;
        targetTrack.add(new MidiEvent(message, newTick));
      }
    }
  }

  /**
   * this getter returns the timing resolution of the Midi sequence (in PPQ) or throws an error if the timing concept is not PPQ
   * @return
   */
  getPPQ(): number {
    if (this.sequence.getDivisionType() === Sequence.PPQ) {
      return this.sequence.getResolution();
    }
    throw new Error('Error: MIDI timing is in SMPTE, not PPQ!');
  }

  /**
   * This method converts the timing basis, i.e., it sets the new ppq value and converts all events' date accordingly.
   * A new MIDI sequence is created which replaces the old one.
   *
   * Dates are scaled by `ppq / ppqOld` and **truncated toward zero**, so converting
   * down and back up does not return the original ticks — the conversion is lossy by
   * design, which is why `getMinimalPPQ` exists to pick a resolution that is not.
   *
   * @param ppq the new pulses-per-quarter-note resolution
   */
  convertPPQ(ppq: number): void {
    const ppqOld = this.getPPQ();
    if (ppqOld === ppq) return;

    console.log(
      `Converting timing basis of "${this.getFile() || 'unnamed'}" from ${ppqOld} to ${ppq} pulses per quarter note.`,
    );

    const newSequence = new Sequence(Sequence.PPQ, ppq); // create a new MIDI sequence
    for (const track of this.sequence.getTracks()) {
      // for each track in the old sequence
      const newTrack = newSequence.createTrack(); // create a new track in the new sequence
      for (const event of track) {
        // for each MIDI event in the old track
        const newDate = Math.trunc((event.getTick() * ppq) / ppqOld); // scale its date to the new ppq timing basis
        const newEvent = new MidiEvent(event.getMessage(), newDate); // create a new event carrying the same (immutable) message
        newTrack.add(newEvent); // add it to the new track
      }
    }

    this.sequence = newSequence; // replace the old sequence by the new one
  }

  /**
   * computes the minimal integer timing resolution (in pulses per quarter note) necessary for an accurate representation of the MIDI sequence
   * @param onlyNotes set false to consider all events; set true to consider only noteOn and noteOff events
   * @return
   */
  getMinimalPPQ(onlyNotes: boolean): number {
    return Midi.getMinimalPPQ(this.getSequence(), onlyNotes);
  }

  /**
   * computes the minimal integer timing resolution (in pulses per quarter note) necessary for an accurate representation of the specified sequence
   *
   * For each event it finds the coarsest power-of-two subdivision of a quarter note
   * that lands exactly on the event's tick, and keeps the finest such subdivision
   * over the whole sequence. The scan starts at the running maximum rather than at 1,
   * so an event already covered by the current answer costs one test — that is an
   * optimisation, not a semantic: a tick divisible by `ppq / maxSubdivisions` is
   * divisible by every coarser step too.
   *
   * @param onlyNotes set false to consider all events; set true to consider only noteOn and noteOff events
   * @return a power of two in 1..ppq
   */
  static getMinimalPPQ(sequence: Sequence, onlyNotes: boolean): number {
    // The `sequence == null` throw is gone. It was unreachable from typed code, and an
    // untyped caller that passes null still fails loudly on the very next line — with a
    // TypeError that names null, which is what the test for it actually asserts.
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
   * Entries come out in track order, then event order within a track — **not sorted
   * by tick across tracks**. `beatlength` is always 0.25 because the MIDI set-tempo
   * event is defined per quarter note; the beat unit is not recoverable from the file.
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
   * @return
   */
  getTickLength(): number {
    return this.sequence.getTickLength();
  }

  /**
   * returns the length of the midi sequence in microseconds
   * @return
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
    // Unlike the two guards above, this one is kept — because it is not a guard, it is an
    // answer. A debug printer handed nothing has something sensible to print, so `null`
    // belongs in the parameter type rather than being smuggled past it by a cast at the
    // one call site that exercises this line.
    if (sequence === null) {
      return 'No midi data loaded.';
    }

    let print = '';

    // `entries()` because the track *number* is part of the output; the events are not
    // numbered, so they are simply iterated. Between them the two loops retire four
    // repetitions of `sequence.getTracks()[t]`, which re-read the track list once per
    // printed field.
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
              // Java falls through to `default` from here, so the "Other message" line
              // is appended too. Written out rather than left as a real fallthrough, so
              // that `noFallthroughCasesInSwitch` is free to catch the accidental ones.
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
   * Swaps the messages **in place** through `MidiEvent.setMessage`, so no event is
   * removed and re-added and no track is re-sorted — the sequence's event order is
   * untouched. (It used to write through `ShortMessage.setMessage`, back when a
   * message's bytes were mutable; the guarantee is the same one, one level up.)
   * The two directions are not inverses: converting back with
   * `noteOffs2NoteOns` gives a noteOn with velocity 0, which this method would convert
   * again, so the pair is idempotent in each direction but lossy across the round trip.
   *
   * @param sequence the sequence to be altered
   * @return the number of events changed
   */
  static noteOns2NoteOffs(sequence: Sequence): number {
    let eventsChanged = 0;
    for (const track of sequence.getTracks()) {
      // for all tracks
      for (const event of track) {
        // for all events in the track
        const msg = event.getMessage();
        if (msg.kind === 'short') {
          // if it is a ShortMessage
          if (shortCommand(msg) === ShortMessage.NOTE_ON && shortData2(msg) === 0) {
            // if this is a noteOn with velocity 0
            event.setMessage(
              channelMessage(EventMaker.NOTE_OFF, shortChannel(msg), shortData1(msg), 0),
            ); // convert it to noteOff
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
   * The release velocity is **discarded**, not carried over: the replacement noteOn
   * always gets velocity 0, because that is what marks it as a noteOff in this
   * encoding. Java does the same (`Midi.java:451`).
   *
   * @param sequence the sequence to be altered
   * @return the number of events changed
   */
  static noteOffs2NoteOns(sequence: Sequence): number {
    let eventsChanged = 0;
    for (const track of sequence.getTracks()) {
      // for all tracks
      for (const event of track) {
        // for all events in the track
        const msg = event.getMessage();
        if (msg.kind === 'short') {
          // if it is a ShortMessage
          if (shortCommand(msg) === ShortMessage.NOTE_OFF) {
            // if this is a noteOff
            event.setMessage(
              channelMessage(EventMaker.NOTE_ON, shortChannel(msg), shortData1(msg), 0),
            ); // convert it to a noteOn with 0 velocity
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
   * and the tracks are **not** re-sorted, which is safe only because one constant
   * offset preserves order; the clamp keeps that true at the boundary.
   */
  addOffset(offsetInTicks: number): void {
    if (offsetInTicks === 0) return;

    for (const track of this.getSequence().getTracks()) {
      for (const e of track) {
        e.setTick(Math.max(0, e.getTick() + offsetInTicks)); // we do not allow negative tick values
      }
    }
  }

  /**
   * this creates a copy of the input sequence
   *
   * Every track and every event is new; the **messages are shared**, and that is what
   * makes this a deep enough copy. `noteOns2NoteOffs` on the clone swaps the message
   * an event holds rather than writing into the message, so the original's events
   * still hold theirs. (This used to call `MidiMessage.clone()` per event, which was
   * the sole reason the message hierarchy had a virtual method at all.)
   *
   * Track and event order are preserved — events are re-added in their existing sorted
   * order, and `Track.add`'s stable sort keeps ties where they were.
   *
   * **The `| null` this used to return was unreachable, and the proof is two lines long.**
   * Java wraps the `new Sequence(...)` below in `catch (InvalidMidiDataException |
   * NullPointerException)` (`Midi.java:487`) because `javax.sound.midi.Sequence`
   * validates its division type and throws. Our `Sequence` constructor
   * (`MidiTypes.ts`) is `this.divisionType = divisionType; this.resolution = resolution;`
   * — it cannot throw, so the catch could not fire, so the null could not be returned.
   * The port had copied a handler for an exception type that does not exist here, and the
   * one call site paid for it with a `!`.
   *
   * @param sequence the sequence to be cloned
   * @return the clone of the input sequence
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
   *
   * **Total.** This returned `Uint8Array | null` and had exactly one `return null` — the
   * `this.sequence === null` guard, which the field's type now rules out. Forty call sites
   * across `src/` and `tests/` were writing `exportMidi()` to get past a null that no
   * typed program could produce.
   *
   * @return MIDI file binary data
   */
  exportMidi(): Uint8Array {
    const tracks = this.sequence.getTracks();
    const numTracks = tracks.length;
    const format = numTracks <= 1 ? 0 : 1;
    const resolution = this.sequence.getResolution();

    // Build each track's binary data
    const trackChunks: Uint8Array[] = [];
    for (const track of tracks) {
      const trackData = Midi.buildTrackChunk(track);
      trackChunks.push(trackData);
    }

    // Calculate total size
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
   * - **Delta = this tick minus the previous tick, floored at 0.** The floor only
   *   fires on a negative absolute tick, which the reader can produce from a Java
   *   file (see the class comment) but nothing in the port generates.
   * - **Meta events are framed here.** `FF`, the type byte, then a length VLQ over the
   *   payload. The message carries only the payload, so there is no second framing it
   *   could disagree with; when there was one, this writer ignored it.
   * - **SysEx keeps its leading `F0`/`F7` and counts the remainder**, terminator
   *   included, which is what the format asks for.
   * - **Channel messages are written verbatim, status byte and all.** No running
   *   status: this is where the 15 byte-level differences against the Java references
   *   come from, and they are semantically empty.
   *
   * The `instanceof` chain this used to be had a fourth branch, for a `MidiMessage`
   * that was none of the three — an unreachable state the class hierarchy allowed and
   * the sum type does not. `matchKind` is exhaustive at compile time, so the branch is
   * gone rather than merely unexercised. Each arm is also read directly instead of
   * through `getMessage()`, which used to allocate a `Uint8Array` per event only to
   * copy it into `bytes` one element at a time.
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

      // Write delta time
      const delta = Math.max(0, tick - lastTick);
      writeVariableLength(bytes, delta);
      lastTick = tick;

      // Write the message bytes, and report back whether this was the end-of-track
      // marker. Reporting it rather than setting the flag from inside an arm keeps
      // `hasEndOfTrack` written in one place: a `let` assigned from a callback is a
      // variable whose value no reader — and no narrowing — can follow.
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
          // A message with no bytes at all — which `readMidiData` cannot produce but a
          // caller can — used to push `undefined` here and encode a length of −1; the
          // buffer is copied into a `Uint8Array` at the end, where both become 0, so
          // writing 0 and slicing an empty tail emits the same two bytes it always did.
          bytes.push(m.bytes.at(0) ?? 0);
          writeVariableLength(bytes, m.bytes.length - 1);
          for (const byte of m.bytes.subarray(1)) {
            bytes.push(byte);
          }
          return false;
        },
        short: (m) => {
          // Channel message
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
