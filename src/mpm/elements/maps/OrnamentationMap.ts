import { Attribute, Element } from '../../../xml/XomTypes.js';
import { Helper } from '../../../mei/Helper.js';
import { Mpm } from '../../../mpm/Mpm.js';
import { KeyValue } from '../../../supplementary/KeyValue.js';
import { GenericMap } from './GenericMap.js';
import { OrnamentData } from './data/OrnamentData.js';
import { OrnamentationStyle } from '../styles/OrnamentationStyle.js';

export class OrnamentationMap extends GenericMap {
    private constructor(typeOrXml: string | Element) { super(typeOrXml); }

    static createOrnamentationMap(): OrnamentationMap | null;
    static createOrnamentationMap(xml: Element): OrnamentationMap | null;
    static createOrnamentationMap(xml?: Element): OrnamentationMap | null {
        try { return xml !== undefined ? new OrnamentationMap(xml) : new OrnamentationMap("ornamentationMap"); } catch (e) { console.error(e); return null; }
    }

    protected parseData(xml: Element): void { super.parseData(xml); }

    addOrnament(date: number, nameRef: string, scale: number = 1.0, noteOrder: string[] | null = null, id: string | null = null): number {
        const ornament = new Element("ornament", Mpm.MPM_NAMESPACE);
        ornament.addAttribute(new Attribute("date", String(date)));
        ornament.addAttribute(new Attribute("name.ref", nameRef));
        if (scale !== 1.0) ornament.addAttribute(new Attribute("scale", String(scale)));
        if (noteOrder !== null && noteOrder.length > 0) {
            let noteIdsString = "";
            for (const nid of noteOrder) {
                if (nid === "ascending pitch" || nid === "descending pitch") { noteIdsString = nid; break; }
                else noteIdsString += " #" + nid.trim().replace("#", "");
            }
            ornament.addAttribute(new Attribute("note.order", noteIdsString.trim()));
        }
        if (id !== null && id !== '') ornament.addAttribute(new Attribute("xml:id", "http://www.w3.org/XML/1998/namespace", id));
        return this.insertElement(new KeyValue(date, ornament), false);
    }

    addOrnamentFromData(data: OrnamentData): number {
        if (data.ornamentDef !== null) data.ornamentDefName = data.ornamentDef.getName();
        else if (data.ornamentDefName === null) { console.error("Cannot add ornament."); return -1; }
        return this.addOrnament(data.date, data.ornamentDefName!, data.scale, data.noteOrder, data.xmlId);
    }

    getOrnamentDataOf(index: number): OrnamentData | null {
        if (this.elements.length === 0 || index < 0) return null;
        if (index >= this.elements.length) index = this.elements.length - 1;
        const xml = this.elements[index].getValue();
        if (xml.getLocalName() !== "ornament") return null;
        const od = new OrnamentData();
        const nameRefAtt = Helper.getAttribute("name.ref", xml); if (nameRefAtt === null) return null;
        od.ornamentDefName = nameRefAtt.getValue();
        od.styleName = "";
        for (let j = index; j >= 0; --j) { const s = this.elements[j].getValue(); if (s.getLocalName() === "style") { od.styleName = Helper.getAttributeValue("name.ref", s); break; } }
        od.style = this.getStyle(Mpm.ORNAMENTATION_STYLE, od.styleName) as OrnamentationStyle | null;
        if (od.style === null) return null;
        od.ornamentDef = od.style.getDef(od.ornamentDefName) ?? null;
        if (od.ornamentDef === null) return null;
        od.date = this.elements[index].getKey();
        od.xml = xml;
        const noteOrderAtt = xml.getAttribute("note.order");
        if (noteOrderAtt !== null) {
            const no = noteOrderAtt.getValue().trim();
            if (no === "ascending pitch" || no === "descending pitch") od.noteOrder = [no];
            else od.noteOrder = no.replace(/#/g, "").split(/\s+/);
        }
        const scaleAtt = Helper.getAttribute("scale", xml); if (scaleAtt !== null) od.scale = parseFloat(scaleAtt.getValue());
        const idAtt = Helper.getAttribute("id", xml); if (idAtt !== null) od.xmlId = idAtt.getValue();
        return od;
    }

    static renderGlobalOrnamentationToParts(parts: Element[], ornamentationMap: OrnamentationMap | null): void {
        if (ornamentationMap === null || ornamentationMap.isEmpty()) return;
        const mapsToOrnament: GenericMap[] = [];
        for (const part of parts) {
            const s = Helper.getFirstChildElement("dated", part);
            if (s !== null) { const score = Helper.getFirstChildElement("score", s); if (score !== null) { const m = GenericMap.createGenericMap(score); if (m !== null) mapsToOrnament.push(m); } }
        }
        ornamentationMap.renderGlobalOrnamentationMap(mapsToOrnament);
    }

    renderGlobalOrnamentationMap(maps: GenericMap[]): void { if (maps.length === 0) return; this.apply(maps); }
    static renderOrnamentationToMap(map: GenericMap | null, ornamentationMap: OrnamentationMap | null): void { if (ornamentationMap !== null) ornamentationMap.renderOrnamentationToMap(map); }

    renderOrnamentationToMap(map: GenericMap | null): void {
        if (map === null) return;
        if (this.getLocalHeader() !== null) { this.apply([map]); }
        this.renderAllNonmillisecondsModifiersToMap(map);
    }

    private apply(maps: GenericMap[]): void {
        if (maps.length === 0)
            return;

        if (this.getLocalHeader() === null && this.getGlobalHeader() === null) {
            console.error("Error processing MPM ornamentationMap: no header defined to look up ornamentationStyle.");
            return;
        }

        // create a hashmap of all note elements, hashed by their ID, so we have quick access to them later on
        const notes = new Map<string, Element>();
        for (const map of maps) {
            for (const note of map.getAllElementsOfType("note")) {
                const id = Helper.getAttribute("id", note.getValue());
                if (id !== null)
                    notes.set(id.getValue(), note.getValue());
            }
        }

        let style: OrnamentationStyle | null = null;

        // process each ornament entry in this ornamentationMap
        for (let i = 0; i < this.size(); ++i) {
            const ornamentXml = this.getElement(i);
            if (ornamentXml === null)
                continue;

            // get the lookup style for subsequent ornaments
            if (ornamentXml.getLocalName() === "style") {
                if (this.getLocalHeader() !== null)
                    style = this.getLocalHeader()!.getStyleDef(Mpm.ORNAMENTATION_STYLE, Helper.getAttributeValue("name.ref", ornamentXml)) as OrnamentationStyle | null;
                if (style === null && this.getGlobalHeader() !== null)
                    style = this.getGlobalHeader()!.getStyleDef(Mpm.ORNAMENTATION_STYLE, Helper.getAttributeValue("name.ref", ornamentXml)) as OrnamentationStyle | null;
                continue;
            }

            if (style === null || ornamentXml.getLocalName() !== "ornament")
                continue;

            // read all data into an OrnamentData instance
            const od = new OrnamentData();
            od.style = style;

            const ornamentDefAtt = Helper.getAttribute("name.ref", ornamentXml);
            if (ornamentDefAtt === null)
                continue;
            od.ornamentDefName = ornamentDefAtt.getValue();
            od.ornamentDef = od.style.getDef(od.ornamentDefName) ?? null;
            if (od.ornamentDef === null)
                continue;

            od.date = this.elements[i].getKey();

            const scaleAtt = Helper.getAttribute("scale", ornamentXml);
            if (scaleAtt !== null)
                od.scale = parseFloat(scaleAtt.getValue());

            // determine the note order and collect the notes which the ornament will be applied to
            let noteOrderAscending = 1;                         // 1 = ascending pitch, -1 = descending pitch, 0 = ID sequence
            let chordSequence: Element[][] | null = null;
            const noteOrderAtt = ornamentXml.getAttribute("note.order");
            if (noteOrderAtt !== null) {
                const no = noteOrderAtt.getValue().trim();
                switch (no) {
                    case "ascending pitch":
                        break;
                    case "descending pitch":
                        noteOrderAscending = -1;
                        break;
                    default: {
                        od.noteOrder = no.replace(/#/g, "").split(/\s+/);
                        if (od.noteOrder.length === 0)
                            continue;
                        chordSequence = [];
                        noteOrderAscending = 0;
                        for (const ref of od.noteOrder) {
                            const note = notes.get(ref);
                            if (note !== undefined) {
                                chordSequence.push([note]);
                            }
                        }
                        break;
                    }
                }
            }
            if (chordSequence === null) {
                chordSequence = [];
                for (const map of maps) {
                    const notesAtDate = map.getAllElementsAt(od.date);
                    for (const note of notesAtDate) {
                        if (note.getValue().getLocalName() === "note") {
                            chordSequence.push([note.getValue()]);
                        }
                    }
                }
                if (chordSequence.length === 0)
                    continue;

                // sort the chords in the indicated order on the basis of the chord's first note's pitch
                const finalNoteOrderAscending = noteOrderAscending;
                chordSequence.sort((n1, n2) => {
                    const pitch1 = parseFloat(Helper.getAttributeValue("midi.pitch", n1[0]));
                    const pitch2 = parseFloat(Helper.getAttributeValue("midi.pitch", n2[0]));
                    return Math.sign(pitch1 - pitch2) * finalNoteOrderAscending;
                });
            }

            // apply the ornament to the notes
            for (const chord of od.apply(chordSequence)) {
                for (const note of chord) {
                    maps[0].addElement(note);
                }
            }
        }
    }

    private renderAllNonmillisecondsModifiersToMap(map: GenericMap): void {
        for (const e of map.getAllElementsOfType("note")) {
            const note = e.getValue();
            const ornamentDynamics = Helper.getAttribute("ornament.dynamics", note);
            if (ornamentDynamics !== null) {
                const velocity = Helper.getAttribute("velocity", note);
                if (velocity !== null) velocity.setValue(String(parseFloat(velocity.getValue()) + parseFloat(ornamentDynamics.getValue())));
            }
            const ornamentDateOffsetAtt = Helper.getAttribute("ornament.date.offset", note);
            if (ornamentDateOffsetAtt !== null) {
                const datePerfAtt = Helper.getAttribute("date.perf", note);
                if (datePerfAtt !== null) {
                    const datePerf = parseFloat(datePerfAtt.getValue());
                    const ornamentDateOffset = parseFloat(ornamentDateOffsetAtt.getValue());
                    datePerfAtt.setValue(String(datePerf + ornamentDateOffset));

                    const dateEndPerfAtt = Helper.getAttribute("date.end.perf", note);
                    const durationPerfAtt = Helper.getAttribute("duration.perf", note);

                    const ornamentDurationAtt = Helper.getAttribute("ornament.duration", note);   // does the ornament set an absolute note duration?
                    if (ornamentDurationAtt !== null) {                                           // apply it to duration.perf and date.end.perf
                        if (durationPerfAtt !== null) durationPerfAtt.setValue(ornamentDurationAtt.getValue());
                        else note.addAttribute(new Attribute("duration.perf", ornamentDurationAtt.getValue()));

                        const dateEndPerf = String(datePerf + ornamentDateOffset + parseFloat(ornamentDurationAtt.getValue()));
                        if (dateEndPerfAtt !== null) dateEndPerfAtt.setValue(dateEndPerf);
                        else note.addAttribute(new Attribute("date.end.perf", dateEndPerf));
                    } else {                                                                      // act according to noteoff.shift
                        const ornamentNoteoffShiftAtt = Helper.getAttribute("ornament.noteoff.shift", note);
                        if (ornamentNoteoffShiftAtt !== null) {                                   // this attribute is only created when its value is "true", so we need to update date.end.perf; thus, duration stays the same
                            if (dateEndPerfAtt !== null) dateEndPerfAtt.setValue(String(parseFloat(dateEndPerfAtt.getValue()) + ornamentDateOffset));
                        } else {                                                                  // ornament.noteoff.shift="false", so we need to update duration.perf; thus, date.end.perf stays the same
                            if (durationPerfAtt !== null) durationPerfAtt.setValue(String(parseFloat(durationPerfAtt.getValue()) - ornamentDateOffset));
                        }
                    }
                }
            }
        }
    }

    static renderMillisecondsModifiersToMap(map: GenericMap | null, ornamentationMap: OrnamentationMap | null): void {
        if (ornamentationMap === null || map === null) return;
        for (const e of map.getAllElementsOfType("note")) {
            const note = e.getValue();
            const millisecondsDateAtt = Helper.getAttribute("milliseconds.date", note);
            if (millisecondsDateAtt === null) continue;
            const millisecondsDate = parseFloat(millisecondsDateAtt.getValue());
            const ornamentMillisecondsDateAtt = Helper.getAttribute("ornament.milliseconds.date.offset", note);
            let ornamentMillisecondsDateOffset = 0.0;
            if (ornamentMillisecondsDateAtt !== null) {
                ornamentMillisecondsDateOffset = parseFloat(ornamentMillisecondsDateAtt.getValue());
                millisecondsDateAtt.setValue(String(millisecondsDate + ornamentMillisecondsDateOffset));
            }

            const millisecondsDateEndAtt = Helper.getAttribute("milliseconds.date.end", note);
            const ornamentMillisecondsDurationAtt = Helper.getAttribute("ornament.milliseconds.duration", note);   // does the ornament set an absolute duration?
            if (ornamentMillisecondsDurationAtt !== null) {                                                        // apply it to milliseconds.date.end
                const millisecondsDateEnd = String(millisecondsDate + ornamentMillisecondsDateOffset + parseFloat(ornamentMillisecondsDurationAtt.getValue()));
                if (millisecondsDateEndAtt !== null) millisecondsDateEndAtt.setValue(millisecondsDateEnd);
                else note.addAttribute(new Attribute("milliseconds.date.end", millisecondsDateEnd));
            } else {                                                                                               // act according to noteoff.shift
                const ornamentNoteoffShiftAtt = Helper.getAttribute("ornament.noteoff.shift", note);
                if (ornamentNoteoffShiftAtt !== null) {                                                            // this attribute is only created when its value is "true", so we need to update milliseconds.date.end; thus, the duration stays the same
                    if (millisecondsDateEndAtt !== null) millisecondsDateEndAtt.setValue(String(parseFloat(millisecondsDateEndAtt.getValue()) + ornamentMillisecondsDateOffset));
                } // else, ornament.noteoff.shift="false", so milliseconds.date.end remains unaltered
            }
        }
    }
}


GenericMap.registerMapFactory('ornamentationMap', (xml) => OrnamentationMap.createOrnamentationMap(xml));
