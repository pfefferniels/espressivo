/**
 * This class does the MIDI to MSM conversion.
 * To use it, instantiate it with the constructor, then invoke convert().
 * See method Midi.exportMsm() for some sample code.
 * Port of meico.midi.Midi2MsmConverter
 *
 * @author Axel Berndt
 */

import { Sequence, Track, MidiEvent, MidiMessage, ShortMessage, MetaMessage, SysexMessage } from './MidiTypes.js';
import { EventMaker } from './EventMaker.js';
import { InstrumentsDictionary } from './InstrumentsDictionary.js';
import { Midi } from './Midi.js';
import { Element, Attribute } from '../xml/XomTypes.js';

// Forward declarations for types that will be created by other agents.
// These interfaces define the minimal API shape needed by this converter.

/** Minimal interface for Msm class used in this converter. */
export interface MsmLike {
    getRootElement(): Element | null;
    addPart(part: Element): void;
}

/** Minimal interface for Helper class used in this converter. */
export interface HelperLike {
    addToMap(addThis: Element, map: Element): number;
    midi2PnameAndAccid(useSharpInsteadOfFlat: boolean, midipitch: number, pnameAccid: string[]): void;
}

export class Midi2MsmConverter {
    private midiFileFormat: number;
    private channel: number = 0;                                             // this indicates the current midi channel that subsequent (meta) events are sent to
    private port: number = 0;                                                // this represents the current midi port that subsequent events are sent to
    private sequence: Sequence;
    private tracks: Track[];
    private msm: MsmLike;
    private global: Element;
    private currentPart: Element;
    private trackname: string = "";
    private parts: Map<string, Element> = new Map<string, Element>();        // the string key should indicate "port,channel"
    private useSharpsInsteadOfFlats: boolean = true;                         // this is needed for encoding accidentals
    private pendingNotes: Element[] = [];                                    // this collects noteOn events until the corresponding noteOff is found
    private useDefaultInstrumentNames: boolean;                              // set this false if a non GM compliant instruments dictionary is used
    private helper: HelperLike;                                              // helper utility reference

    /**
     * constructor
     * @param midiFileFormat
     * @param useDefaultInstrumentNames
     * @param sequence
     * @param msm a minimal Msm instance to be filled with data, this will be the result
     * @param helper the Helper utility instance providing addToMap and midi2PnameAndAccid
     */
    constructor(midiFileFormat: number, useDefaultInstrumentNames: boolean, sequence: Sequence, msm: MsmLike, helper: HelperLike) {
        this.midiFileFormat = midiFileFormat;
        this.useDefaultInstrumentNames = useDefaultInstrumentNames;
        this.helper = helper;

        const cloned = Midi.cloneSequence(sequence);           // make a working copy of the midi sequence
        if (cloned !== null) {
            this.sequence = cloned;
        } else {
            this.sequence = sequence;                           // if cloning failed, use original
        }

        console.log("Converting noteOn (with velocity 0) to noteOff events: " + Midi.noteOns2NoteOffs(this.sequence) + " events converted.");

        this.tracks = this.sequence.getTracks();                // get the individual tracks from the sequence

        this.msm = msm;
        this.global = msm.getRootElement()!.getFirstChildElement("global")!;
        this.currentPart = this.global;                         // as far as no channel prefix or ShortEvent (with channel parameter) occurs, all generated msm elements go into global maps
    }

    /**
     * call this method to do the midi to msm conversion, the global msm will hold the result
     */
    convert(): void {
        // parse the tracks, make MSM parts of it
        for (const track of this.tracks) {                                                              // go through all tracks
            this.currentPart = this.global;

            // parse the track and make MSM markup from each midi event
            for (let e = 0; e < track.size(); ++e) {                                                    // for all the events in the track
                const event = track.get(e);                                                             // get the current event
                if (this.processShortEvent(event))                                                      // try processing it as short event
                    continue;
                if (this.processMetaEvent(event))                                                       // try processing it as meta event
                    continue;
                if (this.processSysexEvent(event))                                                      // try processing it as sysex event
                    continue;
                console.error("Unknown MIDI message: " + event.getMessage().constructor.name + " at timecode " + event.getTick() + "."); // I have no idea what kind of event/message this could be
            }

            // close pending noteOns
            const endDate = track.get(track.size() - 1).getTick();                                      // get the date of the last event in this track (usually the EndOfTrack meta event)
            for (const note of this.pendingNotes) {                                                     // for all pending notes
                const dur = endDate - parseFloat(note.getAttributeValue("date")!);                      // compute its duration so that it ends at the end of the track
                note.getAttribute("duration")!.setValue(dur.toString());                                 // set its duration
            }
            this.pendingNotes = [];
            this.trackname = "";
        }

        // add all parts to the msm object
        for (const [_key, value] of this.parts.entries()) {
            this.msm.addPart(value);
        }
    }

    /**
     * this converts midi meta events (midi event with a MetaMessage) to msm
     * @param event the event to be converted
     * @return true if the event is a meta event, otherwise false as it cannot be converted by this method
     */
    private processMetaEvent(event: MidiEvent): boolean {
        const msg = event.getMessage();
        if (!(msg instanceof MetaMessage))
            return false;

        const m = msg;

        switch (m.getType()) {
            case EventMaker.META_Sequence_Number:
                break;

            case EventMaker.META_Text_Event:
                break;

            case EventMaker.META_Copyright_Notice:
                break;

            case EventMaker.META_Track_Name: {                                                                  // these events can occur before we are in a specific channel/part
                const textDecoder = new TextDecoder();
                this.trackname += ((this.trackname.length === 0) ? "" : " - ") + textDecoder.decode(m.getData()).trim(); // store the track name
                if (this.currentPart !== this.global) {                                                          // if we are already local
                    const nameAtt = this.currentPart.getAttribute("name")!;
                    const name = nameAtt.getValue();
                    nameAtt.setValue(this.trackname + ((name.length === 0) ? "" : (": " + name)));               // append the track name at the beginning
                }
                break;
            }

            case EventMaker.META_Instrument_Name: {
                if (this.currentPart !== this.global) {                                                          // it makes no sense to give the global environment a track or instrument name
                    let name: string;
                    const textDecoder = new TextDecoder();
                    const instName = textDecoder.decode(m.getData()).trim();
                    const nameAtt = this.currentPart.getAttribute("name")!;
                    const namePart = nameAtt.getValue();
                    if (namePart.length === 0)
                        name = instName;
                    else if (namePart === this.trackname)
                        name = this.trackname + instName;
                    else
                        name = namePart + " - " + instName;

                    nameAtt.setValue(name);  // set the part's name to the channel name
                }
                break;
            }

            case EventMaker.META_Lyric:
                break;

            case EventMaker.META_Marker: {
                const marker = new Element("marker");
                marker.addAttribute(new Attribute("date", event.getTick().toString()));                          // get the date of the event
                const textDecoder = new TextDecoder();
                marker.addAttribute(new Attribute("message", textDecoder.decode(m.getData())));                  // get its text
                const markerMap = this.currentPart.getFirstChildElement("dated")!.getFirstChildElement("markerMap")!;
                this.helper.addToMap(marker, markerMap);                                                         // add marker to markerMap
                break;
            }

            case EventMaker.META_Cue_Point:
                break;

            case EventMaker.META_Program_Name:
                break;

            case EventMaker.META_Device_Name:
                break;

            case EventMaker.META_Midi_Channel_Prefix: {                                                          // all meta messages that follow go to this channel
                this.channel = m.getData()[0] & 0xFF;
                const index = this.port + "," + this.channel;
                if (!this.parts.has(index))
                    this.parts.set(index, this.makePart(this.trackname, this.port, this.channel));
                this.currentPart = this.parts.get(index)!;
                break;
            }

            case EventMaker.META_Midi_Port: {                                                                    // all messages that follow go to this port
                this.port = m.getData()[0] & 0xFF;
                const index = this.port + "," + this.channel;
                if (!this.parts.has(index))
                    this.parts.set(index, this.makePart(this.trackname, this.port, this.channel));
                this.currentPart = this.parts.get(index)!;
                break;
            }

            case EventMaker.META_End_of_Track:
                break;

            case EventMaker.META_Set_Tempo:                                                                      // tempo is not part of the MSM specification, hence, it is ignored
                break;

            case EventMaker.META_SMTPE_Offset:
                break;

            case EventMaker.META_Time_Signature: {                                                               // decoding time signature messages
                const ts = new Element("timeSignature");                                                         // create an element
                ts.addAttribute(new Attribute("date", event.getTick().toString()));                               // get the date
                ts.addAttribute(new Attribute("numerator", (m.getData()[0]).toString()));                         // store numerator
                ts.addAttribute(new Attribute("denominator", Math.pow(2, m.getData()[1]).toString()));            // store denominator
                const tsMap = this.currentPart.getFirstChildElement("dated")!.getFirstChildElement("timeSignatureMap")!;
                this.helper.addToMap(ts, tsMap);                                                                  // add timeSignature to timeSignatureMap
                break;
            }

            case EventMaker.META_Key_Signature: {                                                                // decode key signature and make an msm representation of it
                const ks = new Element("keySignature");                                                          // create an element
                ks.addAttribute(new Attribute("date", event.getTick().toString()));                               // compute date
                const accidentals: Element[] = [];                                                               // create an empty list
                const accidData = m.getData();
                let accidCount = accidData[0];
                // Handle signed byte: if value > 127, it's negative (flats)
                if (accidCount > 127) accidCount = accidCount - 256;

                this.useSharpsInsteadOfFlats = accidCount > 0;

                // generate msm accidentals
                const acs = (accidCount > 0) ? ["5.0", "0.0", "7.0", "2.0", "9.0", "4.0", "11.0"] : ["11.0", "4.0", "9.0", "2.0", "7.0", "0.0", "5.0"];
                const acsn = (accidCount > 0) ? ["F", "C", "G", "D", "A", "E", "B"] : ["B", "E", "A", "D", "G", "C", "F"];
                for (let i = 0; i < Math.abs(accidCount); ++i) {
                    const accidental = new Element("accidental");
                    accidental.addAttribute(new Attribute("midi.pitch", acs[i]));
                    accidental.addAttribute(new Attribute("pitchname", acsn[i]));
                    accidental.addAttribute(new Attribute("value", (accidCount > 0) ? "1.0" : "-1.0"));
                    accidentals.push(accidental);
                }

                // add all generated accidentals as children to the msm keySignature element
                for (const accidental of accidentals)
                    ks.appendChild(accidental);

                // add the key signature to the key signature map
                const ksMap = this.currentPart.getFirstChildElement("dated")!.getFirstChildElement("keySignatureMap")!;
                this.helper.addToMap(ks, ksMap);
                break;
            }

            case EventMaker.META_Sequence_specific_Meta_event:
                break;

            default:
                break;
        }
        return true;
    }

    /**
     * this converts midi short events (midi event with a ShortMessage) to msm
     * @param event the event to be converted
     * @return true if the event is a short event, otherwise false as it cannot be converted by this method
     */
    private processShortEvent(event: MidiEvent): boolean {
        const msg = event.getMessage();
        if (!(msg instanceof ShortMessage))
            return false;

        const m = msg;

        // These messages have an explicit channel parameter, thus they do not necessarily go to this.currentPart.
        const chan = m.getChannel();
        const index = this.port + "," + chan;
        if (!this.parts.has(index))
            this.parts.set(index, this.makePart(this.trackname, this.port, chan));
        const part = this.parts.get(index)!;

        switch (m.getCommand()) {
            case EventMaker.NOTE_OFF: {
                const pitch = m.getData1();
                for (let i = 0; i < this.pendingNotes.length; ++i) {                                              // search the pendingNotes list for the first note with the same pitch
                    const note = this.pendingNotes[i];
                    const p = parseFloat(note.getAttributeValue("midi.pitch")!);
                    if (pitch === p) {
                        const dur = event.getTick() - parseFloat(note.getAttributeValue("date")!);
                        note.getAttribute("duration")!.setValue(dur.toString());
                        this.pendingNotes.splice(i, 1);
                        break;
                    }
                }
                break;
            }
            case EventMaker.NOTE_ON: {
                const pitch = m.getData1();
                const note = new Element("note");
                const pnameAccid: string[] = ["", ""];                                                              // convert midi pitch value to pitchname and accidental strings
                this.helper.midi2PnameAndAccid(this.useSharpsInsteadOfFlats, pitch, pnameAccid);
                note.addAttribute(new Attribute("date", event.getTick().toString()));
                note.addAttribute(new Attribute("midi.pitch", pitch.toString()));
                note.addAttribute(new Attribute("pitchname", pnameAccid[0]));
                note.addAttribute(new Attribute("accidentals", pnameAccid[1]));
                note.addAttribute(new Attribute("duration", ""));                                                    // to be added once the corresponding noteOff is found
                note.addAttribute(new Attribute("velocity", m.getData2().toString()));                               // read the velocity of the note
                this.helper.addToMap(note, part.getFirstChildElement("dated")!.getFirstChildElement("score")!);
                this.pendingNotes.push(note);
                break;
            }
            case EventMaker.POLY_AFTERTOUCH:
                break;
            case EventMaker.CONTROL_CHANGE:
                // TODO: add channel volume support ... and many others
                break;
            case EventMaker.PROGRAM_CHANGE: {
                // generate and fill a programChangeMap
                let progChangeMap = part.getFirstChildElement("dated")!.getFirstChildElement("programChangeMap");
                if (progChangeMap === null) {
                    progChangeMap = new Element("programChangeMap");
                    part.getFirstChildElement("dated")!.appendChild(progChangeMap);
                }
                const prgCh = new Element("programChange");
                prgCh.addAttribute(new Attribute("date", event.getTick().toString()));
                prgCh.addAttribute(new Attribute("value", m.getData1().toString()));
                progChangeMap.appendChild(prgCh);

                // generate and extend a part name
                const nameAtt = part.getAttribute("name")!;
                if (this.trackname.length === 0) {
                    const instName = InstrumentsDictionary.getInstrumentName(m.getData1(), this.useDefaultInstrumentNames);
                    if (nameAtt.getValue() === this.trackname) {                                                      // if the part has no name or just the track name
                        nameAtt.setValue(((this.trackname.length === 0) ? "" : (this.trackname + ": ")) + instName);  // set the name
                    } else {                                                                                          // if there is already more than the track name
                        nameAtt.setValue(nameAtt.getValue() + " - " + instName);                                      // append the instrument name
                    }
                }
                break;
            }
            case EventMaker.CHANNEL_AFTERTOUCH:
                break;
            case EventMaker.PITCH_BEND:
                break;
            case EventMaker.SYSEX_START:
                break;
            case EventMaker.MIDI_TIME_CODE:
                break;
            case EventMaker.SONG_POSITION_POINTER:
                break;
            case EventMaker.SONG_SELECT:
                break;
            case EventMaker.UNDEF1:
                break;
            case EventMaker.UNDEF2:
                break;
            case EventMaker.TUNE_REQUEST:
                break;
            case EventMaker.SYSEX_END:
                break;
            case EventMaker.TIMING_CLOCK:
                break;
            case EventMaker.UNDEF3:
                break;
            case EventMaker.START:
                break;
            case EventMaker.CONTINUE:
                break;
            case EventMaker.STOP:
                break;
            case EventMaker.UNDEF4:
                break;
            case EventMaker.ACTIVE_SENSING:
                break;
            case EventMaker.SYSTEM_RESET:       // or META_EVENT
                break;
            default:
                break;
        }

        return true;
    }

    /**
     * this converts midi sysex events (midi event with a SysexMessage) to msm;
     * actually, this method does nothing as there is no msm representation of sysex messages right now
     * @param event the event to be converted
     * @return true if the event is a sysex event, otherwise false as it cannot be converted by this method
     */
    private processSysexEvent(event: MidiEvent): boolean {
        const msg = event.getMessage();
        if (!(msg instanceof SysexMessage))
            return false;

        return true;
    }

    /**
     * this is a shortcut for creating an msm part.
     * It mirrors Msm.makePart() inline since we cannot import Msm directly
     * (it will be created by another agent). This creates the same structure
     * that Msm.makePart would produce.
     * @param partName
     * @param port
     * @param channel
     * @return
     */
    private makePart(partName: string, port: number, channel: number): Element {
        return Midi2MsmConverter.makeMsmPart(partName, (port * 16) + channel, channel, port);
    }

    /**
     * Generate a "raw" part element with its corresponding attributes and empty "header" and "dated" environments.
     * This mirrors the Msm.makePart() method from the Java version.
     * @param name
     * @param number
     * @param midiChannel
     * @param midiPort
     * @return the part element just generated
     */
    static makeMsmPart(name: string, number: number, midiChannel: number, midiPort: number): Element {
        const part = new Element("part");
        part.addAttribute(new Attribute("name", name));
        part.addAttribute(new Attribute("number", number.toString()));
        part.addAttribute(new Attribute("midi.channel", midiChannel.toString()));
        part.addAttribute(new Attribute("midi.port", midiPort.toString()));

        part.appendChild(new Element("header"));

        const dated = new Element("dated");
        dated.appendChild(new Element("timeSignatureMap"));
        dated.appendChild(new Element("keySignatureMap"));
        dated.appendChild(new Element("markerMap"));
        dated.appendChild(new Element("sequencingMap"));
        dated.appendChild(new Element("pedalMap"));
        dated.appendChild(new Element("phraseMap"));
        const miscMap = new Element("miscMap");
        dated.appendChild(miscMap);
        miscMap.appendChild(new Element("tupletSpanMap"));
        dated.appendChild(new Element("score"));

        part.appendChild(dated);

        return part;
    }
}
