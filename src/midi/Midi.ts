/**
 * This class holds Midi data and provides some functionality for it.
 * Port of meico.midi.Midi
 *
 * In the browser environment, the javax.sound.midi API is replaced by
 * our custom MidiTypes classes. The class provides export to Standard MIDI File
 * (SMF) binary format.
 *
 * @author Axel Berndt
 */

import {
  Sequence,
  Track,
  MidiEvent,
  MidiMessage,
  ShortMessage,
  MetaMessage,
  SysexMessage,
} from './MidiTypes.js';
import { EventMaker } from './EventMaker.js';

export class Midi {
  private file: string | null = null; // the midi filename
  private sequence: Sequence | null = null; // the midi sequence

  /**
   * the most primitive constructor creates an empty MIDI sequence with default PPQ of 720
   */
  constructor();
  /**
   * constructor, creates an empty MIDI sequence with the given PPQ timing resolution
   */
  constructor(ppq: number);
  /**
   * constructor, instantiates a Midi object from a sequence
   */
  constructor(sequence: Sequence);
  /**
   * constructor, instantiates a Midi object from a sequence and sets the midi file
   */
  constructor(sequence: Sequence, midifile: string);
  /**
   * constructor, instantiates a Midi object from MIDI binary data
   */
  constructor(midiData: Uint8Array);
  constructor(a?: number | Sequence | Uint8Array, b?: string) {
    if (a === undefined) {
      // Default constructor: empty MIDI with PPQ 720
      this.sequence = new Sequence(Sequence.PPQ, 720);
    } else if (typeof a === 'number') {
      // PPQ constructor
      this.sequence = new Sequence(Sequence.PPQ, a);
    } else if (a instanceof Sequence) {
      this.sequence = a;
      if (b !== undefined) {
        this.file = b;
      }
    } else if (a instanceof Uint8Array) {
      this.readMidiData(a);
    }
  }

  /**
   * Parse MIDI binary data into the sequence.
   * This implements the Standard MIDI File (SMF) parser.
   * @param data raw MIDI file bytes
   */
  readMidiData(data: Uint8Array): void {
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    let offset = 0;

    // Read MThd header chunk
    const headerTag = String.fromCharCode(data[0], data[1], data[2], data[3]);
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

    // Check if division is PPQ (bit 15 = 0) or SMPTE
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

    this.sequence = new Sequence(divisionType, resolution);

    // Read each track
    for (let t = 0; t < numTracks && offset < data.length; t++) {
      // Read MTrk header
      const trackTag = String.fromCharCode(
        data[offset],
        data[offset + 1],
        data[offset + 2],
        data[offset + 3],
      );
      if (trackTag !== 'MTrk') {
        throw new Error(`Invalid MIDI file: missing MTrk header at offset ${offset}`);
      }
      offset += 4;

      const trackLength = view.getUint32(offset);
      offset += 4;

      const trackEnd = offset + trackLength;
      const track = this.sequence.createTrack();

      let runningStatus = 0;
      let absoluteTick = 0;

      while (offset < trackEnd && offset < data.length) {
        // Read delta time (variable-length quantity)
        let deltaTime = 0;
        let b: number;
        do {
          b = data[offset++];
          deltaTime = (deltaTime << 7) | (b & 0x7f);
        } while (b & 0x80);

        absoluteTick += deltaTime;

        // Read the status byte
        let statusByte = data[offset];

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
          const metaType = data[offset++];
          let metaLength = 0;
          do {
            b = data[offset++];
            metaLength = (metaLength << 7) | (b & 0x7f);
          } while (b & 0x80);

          const metaData = new Uint8Array(data.buffer, data.byteOffset + offset, metaLength);
          offset += metaLength;

          const msg = new MetaMessage(metaType, metaData, metaLength);
          track.add(new MidiEvent(msg, absoluteTick));
        } else if (statusByte === 0xf0 || statusByte === 0xf7) {
          // SysEx event
          let sysexLength = 0;
          do {
            b = data[offset++];
            sysexLength = (sysexLength << 7) | (b & 0x7f);
          } while (b & 0x80);

          const sysexData = new Uint8Array(sysexLength + 1);
          sysexData[0] = statusByte;
          sysexData.set(new Uint8Array(data.buffer, data.byteOffset + offset, sysexLength), 1);
          offset += sysexLength;

          const msg = new SysexMessage(sysexData);
          track.add(new MidiEvent(msg, absoluteTick));
        } else {
          // Channel message (ShortMessage)
          const command = statusByte & 0xf0;
          const channel = statusByte & 0x0f;
          const data1 = data[offset++];

          if (command === 0xc0 || command === 0xd0) {
            // Program Change or Channel Aftertouch: 1 data byte
            const msg = new ShortMessage(command, channel, data1, 0);
            track.add(new MidiEvent(msg, absoluteTick));
          } else {
            // All other channel messages: 2 data bytes
            const data2 = data[offset++];
            const msg = new ShortMessage(command, channel, data1, data2);
            track.add(new MidiEvent(msg, absoluteTick));
          }
        }
      }

      // Make sure we advance to the actual end of the track
      offset = trackEnd;
    }
  }

  /**
   * check if there is any midi data in the sequence
   * @return
   */
  isEmpty(): boolean {
    return this.sequence === null;
  }

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
   * @return
   */
  getMidiFileFormat(): number {
    if (this.sequence === null) return 1;

    const trackCount = this.sequence.getTracks().length;
    if (trackCount <= 1) {
      return 0;
    }
    return 1;
  }

  /**
   * this getter returns the midi sequence
   * @return the midi sequence
   */
  getSequence(): Sequence {
    return this.sequence!;
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
   * @param midi the Midi whose sequence should be appended
   */
  append(midi: Midi): void {
    if (midi === null || midi.isEmpty()) return;

    const clone = new Midi(Midi.cloneSequence(midi.getSequence())!); // in case we have to apply changes we do so with a clone and not the original
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

    for (let t = 0; t < clone.getSequence().getTracks().length; ++t) {
      // go through all tracks of the sequence to be added
      const sourceTrack = clone.getSequence().getTracks()[t];
      const targetTrack = this.getSequence().getTracks()[t];

      for (let e = 0; e < sourceTrack.size(); ++e) {
        const event = sourceTrack.get(e);
        const message = event.getMessage();
        const newTick = event.getTick() + tickLength;
        targetTrack.add(new MidiEvent(message.clone(), newTick));
      }
    }
  }

  /**
   * this getter returns the timing resolution of the Midi sequence (in PPQ) or throws an error if the timing concept is not PPQ
   * @return
   */
  getPPQ(): number {
    if (this.sequence!.getDivisionType() === Sequence.PPQ) {
      return this.sequence!.getResolution();
    }
    throw new Error('Error: MIDI timing is in SMPTE, not PPQ!');
  }

  /**
   * This method converts the timing basis, i.e., it sets the new ppq value and converts all events' date accordingly.
   * A new MIDI sequence is created which replaces the old one.
   * @param ppq
   */
  convertPPQ(ppq: number): void {
    const ppqOld = this.getPPQ();
    if (ppqOld === ppq) return;

    console.log(
      `Converting timing basis of "${this.getFile() || 'unnamed'}" from ${ppqOld} to ${ppq} pulses per quarter note.`,
    );

    const newSequence = new Sequence(Sequence.PPQ, ppq); // create a new MIDI sequence
    for (const track of this.sequence!.getTracks()) {
      // for each track in the old sequence
      const newTrack = newSequence.createTrack(); // create a new track in the new sequence
      for (let e = 0; e < track.size(); ++e) {
        // for each MIDI event in the old track
        const event = track.get(e);
        const newMessage = event.getMessage().clone(); // clone its message
        const newDate = Math.trunc((event.getTick() * ppq) / ppqOld); // scale its date to the new ppq timing basis
        const newEvent = new MidiEvent(newMessage, newDate); // create a new event
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
   * @param sequence
   * @param onlyNotes set false to consider all events; set true to consider only noteOn and noteOff events
   * @return
   */
  static getMinimalPPQ(sequence: Sequence, onlyNotes: boolean): number {
    if (sequence === null) throw new Error('Error: MIDI sequence is null.');

    if (sequence.getDivisionType() !== Sequence.PPQ)
      throw new Error('Error: MIDI sequence is not of division type PPQ.');

    const ppq = sequence.getResolution();
    let maxSubdivisions = 1;

    for (const track of sequence.getTracks()) {
      for (let e = 0; e < track.size(); ++e) {
        const event = track.get(e);
        const command = event.getMessage().getStatus() & 0xf0;

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
   * @return array of {tick, bpm, beatlength} entries
   */
  getTempoData(): { tick: number; bpm: number; beatlength: number }[] {
    const tempoData: { tick: number; bpm: number; beatlength: number }[] = [];

    const tracks = this.sequence!.getTracks();
    for (const track of tracks) {
      for (let e = 0; e < track.size(); ++e) {
        const event = track.get(e);
        const msg = event.getMessage();
        if (msg instanceof MetaMessage) {
          if (msg.getType() === EventMaker.META_Set_Tempo) {
            const mpq = EventMaker.byteArrayToInt(msg.getData());
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
    return this.sequence!.getTickLength();
  }

  /**
   * returns the length of the midi sequence in microseconds
   * @return
   */
  getMicrosecondLength(): number {
    return this.sequence!.getMicrosecondLength();
  }

  /**
   * print some basic MIDI data to a string
   * @param sequence
   */
  static print(sequence: Sequence): string {
    if (sequence === null) {
      return 'No midi data loaded.';
    }

    let print = '';

    for (let t = 0; t < sequence.getTracks().length; ++t) {
      print += `Track ${t} contains ${sequence.getTracks()[t].size()} events.\n`;
      for (let e = 0; e < sequence.getTracks()[t].size(); ++e) {
        print += `@${sequence.getTracks()[t].get(e).getTick()} `;
        const msg = sequence.getTracks()[t].get(e).getMessage();
        if (msg instanceof ShortMessage) {
          const sm = msg;
          print += `Channel: ${sm.getChannel()} Command: ${sm.getCommand()} `;
          switch (sm.getCommand()) {
            case ShortMessage.NOTE_ON: {
              const key = sm.getData1();
              const velocity = sm.getData2();
              print += `noteOn,  key: ${key} velocity: ${velocity}`;
              break;
            }
            case ShortMessage.NOTE_OFF: {
              const key = sm.getData1();
              const velocity = sm.getData2();
              print += `noteOff,  key: ${key} velocity: ${velocity}`;
              break;
            }
            case ShortMessage.PROGRAM_CHANGE: {
              const prg = sm.getData1();
              print += `program change,  number: ${prg}`;
              // fall through intentionally (matching Java behavior)
            }
            default: {
              print += `Other message: ${msg.constructor.name}`;
            }
          }
        } else {
          print += `Other message: ${msg.constructor.name}`;
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
    return Midi.noteOns2NoteOffs(this.sequence!);
  }

  /**
   * In MIDI noteOff events are often encoded as noteOn events with velocity 0.
   * With this method these events are converted to real noteOffs.
   * @param sequence the sequence to be altered
   * @return the number of events changed
   */
  static noteOns2NoteOffs(sequence: Sequence): number {
    let eventsChanged = 0;
    for (let t = 0; t < sequence.getTracks().length; ++t) {
      // for all tracks
      for (let e = 0; e < sequence.getTracks()[t].size(); ++e) {
        // for all events in the track
        const msg = sequence.getTracks()[t].get(e).getMessage();
        if (msg instanceof ShortMessage) {
          // if it is a ShortMessage
          const sm = msg;
          if (sm.getCommand() === ShortMessage.NOTE_ON && sm.getData2() === 0) {
            // if this is a noteOn with velocity 0
            sm.setMessage(EventMaker.NOTE_OFF, sm.getChannel(), sm.getData1(), 0); // convert it to noteOff
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
    return Midi.noteOffs2NoteOns(this.sequence!);
  }

  /**
   * In MIDI noteOff events are often encoded as noteOn events with velocity 0.
   * With this method noteOffs are replaced by noteOns.
   * @param sequence the sequence to be altered
   * @return the number of events changed
   */
  static noteOffs2NoteOns(sequence: Sequence): number {
    let eventsChanged = 0;
    for (let t = 0; t < sequence.getTracks().length; ++t) {
      // for all tracks
      for (let e = 0; e < sequence.getTracks()[t].size(); ++e) {
        // for all events in the track
        const msg = sequence.getTracks()[t].get(e).getMessage();
        if (msg instanceof ShortMessage) {
          // if it is a ShortMessage
          const sm = msg;
          if (sm.getCommand() === ShortMessage.NOTE_OFF) {
            // if this is a noteOff
            sm.setMessage(EventMaker.NOTE_ON, sm.getChannel(), sm.getData1(), 0); // convert it to a noteOn with 0 velocity
            eventsChanged++;
          }
        }
      }
    }
    return eventsChanged;
  }

  /**
   * adds an offset (in ticks) to all events in this MIDI's sequence
   * @param offsetInTicks
   */
  addOffset(offsetInTicks: number): void {
    if (offsetInTicks === 0) return;

    for (const track of this.getSequence().getTracks()) {
      for (let i = 0; i < track.size(); ++i) {
        const e = track.get(i);
        e.setTick(Math.max(0, e.getTick() + offsetInTicks)); // we do not allow negative tick values
      }
    }
  }

  /**
   * this creates a copy of the input sequence
   * @param sequence the sequence to be cloned
   * @return the clone of the input sequence or null
   */
  static cloneSequence(sequence: Sequence): Sequence | null {
    let cloneSeq: Sequence;
    try {
      cloneSeq = new Sequence(sequence.getDivisionType(), sequence.getResolution());
    } catch (e) {
      console.error(e);
      return null;
    }

    const tracks = sequence.getTracks();
    for (const track of tracks) {
      const newTrack = cloneSeq.createTrack();
      for (let e = 0; e < track.size(); ++e) {
        const event = track.get(e);
        const newEvent = new MidiEvent(event.getMessage().clone(), event.getTick());
        newTrack.add(newEvent);
      }
    }

    return cloneSeq;
  }

  /**
   * Export the MIDI sequence as a Standard MIDI File (SMF) binary Uint8Array.
   * This implements the SMF spec: MThd header chunk, then MTrk track chunks.
   * @return MIDI file binary data, or null on error
   */
  exportMidi(): Uint8Array | null {
    if (this.sequence === null) {
      console.error('Cannot export: no MIDI data.');
      return null;
    }

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
   * @param track
   * @return the raw track data (without the MTrk tag and length)
   */
  private static buildTrackChunk(track: Track): Uint8Array {
    const bytes: number[] = [];
    let lastTick = 0;
    let hasEndOfTrack = false;

    for (let i = 0; i < track.size(); i++) {
      const event = track.get(i);
      const msg = event.getMessage();
      const tick = event.getTick();

      // Write delta time
      const delta = Math.max(0, tick - lastTick);
      Midi.writeVariableLength(bytes, delta);
      lastTick = tick;

      // Write message bytes
      if (msg instanceof MetaMessage) {
        if (msg.getType() === 0x2f) {
          // End of Track
          hasEndOfTrack = true;
        }
        // Meta event: FF type length data
        bytes.push(0xff);
        bytes.push(msg.getType() & 0xff);
        const data = msg.getData();
        Midi.writeVariableLength(bytes, data.length);
        for (let j = 0; j < data.length; j++) {
          bytes.push(data[j]);
        }
      } else if (msg instanceof SysexMessage) {
        // SysEx: status byte, then the length of the remaining bytes, then those bytes
        const rawData = msg.getMessage();
        bytes.push(rawData[0]);
        Midi.writeVariableLength(bytes, rawData.length - 1);
        for (let j = 1; j < rawData.length; j++) {
          bytes.push(rawData[j]);
        }
      } else if (msg instanceof ShortMessage) {
        // Channel message
        const rawData = msg.getMessage();
        for (let j = 0; j < rawData.length; j++) {
          bytes.push(rawData[j]);
        }
      } else {
        // Unknown message type - write raw bytes
        const rawData = msg.getMessage();
        for (let j = 0; j < rawData.length; j++) {
          bytes.push(rawData[j]);
        }
      }
    }

    // Ensure there is an End of Track meta event at the end
    if (!hasEndOfTrack) {
      Midi.writeVariableLength(bytes, 0); // delta time 0
      bytes.push(0xff); // meta event
      bytes.push(0x2f); // End of Track
      bytes.push(0x00); // length 0
    }

    return new Uint8Array(bytes);
  }

  /**
   * Write a variable-length quantity to the byte array.
   * @param bytes the output byte array
   * @param value the value to encode
   */
  private static writeVariableLength(bytes: number[], value: number): void {
    if (value < 0) value = 0;

    // Build the variable-length bytes in reverse
    const vlqBytes: number[] = [];
    vlqBytes.push(value & 0x7f);
    value >>= 7;
    while (value > 0) {
      vlqBytes.push((value & 0x7f) | 0x80);
      value >>= 7;
    }
    // Push in reverse order (MSB first)
    for (let i = vlqBytes.length - 1; i >= 0; i--) {
      bytes.push(vlqBytes[i]);
    }
  }

}
