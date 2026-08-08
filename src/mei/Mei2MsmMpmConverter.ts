import { Element, Attribute, Nodes, Elements, Document } from '../xml/XomTypes.js';
import { Helper } from './Helper.js';
import { Mei } from './Mei.js';
import { Meico } from '../Meico.js';
import { KeyValue } from '../supplementary/KeyValue.js';
import { Goto } from '../msm/Goto.js';
import { Msm } from '../msm/Msm.js';
import { Mpm } from '../mpm/Mpm.js';
import { v4 as uuidv4 } from 'uuid';
import { Performance } from '../mpm/elements/Performance.js';
import { Part as MpmPart } from '../mpm/elements/Part.js';
import { GenericMap } from '../mpm/elements/maps/GenericMap.js';
import { TempoMap } from '../mpm/elements/maps/TempoMap.js';
import { DynamicsMap } from '../mpm/elements/maps/DynamicsMap.js';
import { ArticulationMap } from '../mpm/elements/maps/ArticulationMap.js';
import { OrnamentationMap } from '../mpm/elements/maps/OrnamentationMap.js';
import { TempoStyle } from '../mpm/elements/styles/TempoStyle.js';
import { DynamicsStyle } from '../mpm/elements/styles/DynamicsStyle.js';
import { ArticulationStyle } from '../mpm/elements/styles/ArticulationStyle.js';
import { OrnamentationStyle } from '../mpm/elements/styles/OrnamentationStyle.js';
import { TempoDef } from '../mpm/elements/styles/defs/TempoDef.js';
import { DynamicsDef } from '../mpm/elements/styles/defs/DynamicsDef.js';
import { ArticulationDef } from '../mpm/elements/styles/defs/ArticulationDef.js';
import { OrnamentDef } from '../mpm/elements/styles/defs/OrnamentDef.js';
import { TempoData } from '../mpm/elements/maps/data/TempoData.js';
import { DynamicsData } from '../mpm/elements/maps/data/DynamicsData.js';
import { OrnamentData } from '../mpm/elements/maps/data/OrnamentData.js';
import { Author } from '../mpm/elements/metadata/Author.js';
import { Comment } from '../mpm/elements/metadata/Comment.js';
import { RelatedResource } from '../mpm/elements/metadata/RelatedResource.js';

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * This class does the MEI to MSM/MPM conversion.
 * To use it, instantiate it with the constructor, then invoke convert().
 * Port of meico.mei.Mei2MsmMpmConverter
 * @author Axel Berndt
 */
export class Mei2MsmMpmConverter {
    private mei: Mei | null = null;
    private ignoreExpansions: boolean = false;
    private cleanup: boolean = true;

    protected ppq: number = 720;
    protected endingCounter: number = 0;
    protected dontUseChannel10: boolean = true;
    protected currentMsmMovement: Element | null = null;
    protected currentMdiv: Element | null = null;
    protected currentWork: Element | null = null;
    protected currentPart: Element | null = null;
    protected currentLayer: Element | null = null;
    protected currentMeasure: Element | null = null;
    protected currentChord: Element | null = null;
    protected accid: Element[] = [];
    protected endids: Element[] = [];
    protected tstamp2s: Element[] = [];
    protected lyrics: Element[] = [];
    protected allNotesAndChords: Map<string, Element> = new Map();
    protected arpeggiosToSort: Array<KeyValue<Attribute, boolean>> = [];
    protected currentPerformance: Performance | null = null;
    protected movements: any[] = [];              // Msm[]
    protected performances: any[] = [];           // Mpm[]

    /**
     * constructor with default settings
     */
    constructor(ppq: number);
    /**
     * constructor with fully specified settings
     */
    constructor(ppq: number, dontUseChannel10: boolean, ignoreExpansions: boolean, cleanup: boolean);
    constructor(ppq: number, dontUseChannel10?: boolean, ignoreExpansions?: boolean, cleanup?: boolean) {
        this.ppq = ppq;
        this.dontUseChannel10 = dontUseChannel10 ?? true;
        this.ignoreExpansions = ignoreExpansions ?? false;
        this.cleanup = cleanup ?? true;
    }

    /**
     * converts the provided MEI data into MSM and MPM format and return a tuplet of lists,
     * or recursively traverse the mei tree (depth first) when called with an Element
     */
    convert(meiOrRoot: Mei | Element): any {
        if (meiOrRoot instanceof Mei) {
            return this.convertMei(meiOrRoot);
        } else {
            return this.convertElement(meiOrRoot);
        }
    }

    private convertMei(mei: Mei): KeyValue<any[], any[]> {
        if (mei === null) {
            console.log("\nThe provided MEI object is null and cannot be converted.");
            return new KeyValue<any[], any[]>([], []);
        }

        const startTime = Date.now();
        console.log("\nConverting " + ((mei.getFile() !== null) ? mei.getFile() : "MEI data") + " to MSM and MPM.");

        this.mei = mei;

        if (this.mei.isEmpty() || (this.mei.getMusic() === null) || (this.mei.getMusic()!.getFirstChildElement("body", this.mei.getMusic()!.getNamespaceURI()) === null))
            return new KeyValue<any[], any[]>([], []);

        const minPPQ = this.mei.computeMinimalPPQ();
        const originalPPQ = this.ppq;
        if (minPPQ > this.ppq) {
            this.ppq = minPPQ;
            console.log("The specified pulses per quarter note resolution (ppq) is too coarse to capture the shortest duration values in the mei source with integer values. Using the minimal required resolution of " + this.ppq + " instead");
        }

        let orig: Document | null = null;
        if (this.cleanup)
            orig = this.mei.getDocument()!.copy();

        this.mei.resolveCopyofsAndSameas();
        this.mei.removeRendElements();
        if (!this.ignoreExpansions) this.mei.resolveExpansions();

        const bodies = this.mei.getMusic()!.getChildElements("body", this.mei.getMusic()!.getNamespaceURI());
        for (let b = 0; b < bodies.size(); ++b)
            this.convertElement(bodies.get(b));

        const msms: any[] = [...this.movements];
        const mpms: any[] = [...this.performances];

        Mei2MsmMpmConverter.mpmPostprocessing(mpms);

        this.ppq = originalPPQ;

        if (this.cleanup) {
            this.mei.setDocument(orig!);
            Mei2MsmMpmConverter.msmCleanup(msms);
        }

        if (this.mei.getFile() !== null) {
            if (msms.length === 1)
                msms[0].setFile(Helper.getFilenameWithoutExtension(this.mei.getFile()!) + ".msm");
            else {
                for (let i = 0; i < msms.length; ++i) {
                    msms[i].setFile(Helper.getFilenameWithoutExtension(this.mei.getFile()!) + "-" + i + ".msm");
                }
            }
            if (mpms.length === 1) {
                mpms[0].setFile(Helper.getFilenameWithoutExtension(this.mei.getFile()!) + ".mpm");
                const msmRelatedResource = RelatedResource.createRelatedResource(msms[0].getFile()!, "msm");
                if (msmRelatedResource !== null)
                    mpms[0].getMetadata()?.addRelatedResource(msmRelatedResource);
            }
            else {
                for (let i = 0; i < mpms.length; ++i) {
                    mpms[i].setFile(Helper.getFilenameWithoutExtension(this.mei.getFile()!) + "-" + i + ".mpm");
                }
            }
        }

        console.log("MEI to MSM/MPM conversion finished. Time consumed: " + (Date.now() - startTime) + " milliseconds");

        return new KeyValue<any[], any[]>(msms, mpms);
    }

    private convertElement(root: Element): void {
        const es = root.getChildElements();

        for (let i = 0; i < es.size(); ++i) {
            const e = es.get(i);

            this.checkEndid(e);

            switch (e.getLocalName()) {
                case "abbr":
                    continue;
                case "accid":
                    this.processAccid(e);
                    continue;
                case "add":
                    break;
                case "anchorText":
                    continue;
                case "annot":
                    continue;
                case "app":
                    this.processApp(e);
                    continue;
                case "arpeg":
                    this.processArpeg(e);
                    continue;
                case "artic":
                    this.processArtic(e);
                    continue;
                case "barline":
                    continue;
                case "beam":
                    break;
                case "beamSpan":
                    continue;
                case "beatRpt":
                    this.processBeatRpt(e);
                    continue;
                case "bend":
                    continue;
                case "breath":
                    this.processBreath(e);
                    continue;
                case "bTrem":
                    this.processChord(e);
                    continue;
                case "caesura":
                    continue;
                case "choice":
                    this.processChoice(e);
                    continue;
                case "chord":
                    if (e.getAttribute("grace") !== null)
                        continue;
                    this.processChord(e);
                    continue;
                case "chordTable":
                    continue;
                case "clef":
                    continue;
                case "clefGrp":
                    continue;
                case "corr":
                    break;
                case "curve":
                    continue;
                case "custos":
                    continue;
                case "damage":
                    continue;
                case "del":
                    this.processDel(e);
                    continue;
                case "dir":
                    continue;
                case "div":
                    continue;
                case "dot":
                    this.processDot(e);
                    continue;
                case "dynam":
                    this.processDynam(e);
                    continue;
                case "ending":
                    this.processEnding(e);
                    continue;
                case "expan":
                    break;
                case "expansion":
                    continue;
                case "fermata":
                    continue;
                case "fTrem":
                    this.processChord(e);
                    continue;
                case "gap":
                    continue;
                case "gliss":
                    continue;
                case "grpSym":
                    continue;
                case "hairpin":
                    this.processDynam(e);
                    continue;
                case "halfmRpt":
                    this.processHalfmRpt(e);
                    break;
                case "handShift":
                    continue;
                case "harm":
                    continue;
                case "harpPedal":
                    continue;
                case "incip":
                    continue;
                case "ineume":
                    continue;
                case "instrDef":
                    continue;
                case "instrGrp":
                    continue;
                case "keyAccid":
                    continue;
                case "keySig":
                    this.processKeySig(e);
                    break;
                case "label":
                    continue;
                case "layer":
                    this.processLayer(e);
                    continue;
                case "layerDef":
                    this.processLayerDef(e);
                    break;
                case "lb":
                    continue;
                case "lem":
                    continue;
                case "line":
                    continue;
                case "lyrics":
                    break;
                case "mdiv":
                    this.makeMovement(e);
                    continue;
                case "measure":
                    this.processMeasure(e);
                    continue;
                case "mensur":
                    continue;
                case "meterSig":
                    this.processMeterSig(e);
                    break;
                case "meterSigGrp":
                    break;
                case "midi":
                    continue;
                case "mordent":
                    continue;
                case "mRest":
                    this.processMeasureRest(e);
                    continue;
                case "mRpt":
                    this.processMRpt(e);
                    break;
                case "mRpt2":
                    this.processMRpt2(e);
                    break;
                case "mSpace":
                    this.processMeasureRest(e);
                    continue;
                case "multiRest":
                    this.processMultiRest(e);
                    continue;
                case "multiRpt":
                    this.processMultiRpt(e);
                    break;
                case "note":
                    this.processNote(e);
                    continue;
                case "octave":
                    this.processOctave(e);
                    break;
                case "oLayer":
                    this.processLayer(e);
                    continue;
                case "orig":
                    break;
                case "ossia":
                    continue;
                case "oStaff":
                    this.processStaff(e);
                    continue;
                case "parts":
                    break;
                case "part":
                    break;
                case "pb":
                    continue;
                case "pedal":
                    this.processPedal(e);
                    continue;
                case "pgFoot":
                    continue;
                case "pgFoot2":
                    continue;
                case "pgHead":
                    continue;
                case "pgHead2":
                    continue;
                case "phrase":
                    this.processPhrase(e);
                    continue;
                case "proport":
                    continue;
                case "rdg":
                    continue;
                case "reg":
                    break;
                case "reh":
                    this.processReh(e);
                    continue;
                case "rend":
                    continue;
                case "rest":
                    this.processRest(e);
                    continue;
                case "restore":
                    this.processRestore(e);
                    break;
                case "sb":
                    continue;
                case "scoreDef":
                    this.processScoreDef(e);
                    break;
                case "score":
                    break;
                case "section":
                    this.processSection(e);
                    continue;
                case "sic":
                    break;
                case "space":
                    this.processSpace(e);
                    continue;
                case "slur":
                    this.processSlur(e);
                    continue;
                case "stack":
                    continue;
                case "staff":
                    this.processStaff(e);
                    continue;
                case "staffDef":
                    this.processStaffDef(e);
                    continue;
                case "staffGrp":
                    break;
                case "subst":
                    break;
                case "supplied":
                    break;
                case "syl":
                    this.processSyl(e);
                    continue;
                case "syllable":
                    continue;
                case "symbol":
                    continue;
                case "symbolTable":
                    continue;
                case "tempo":
                    this.processTempo(e);
                    continue;
                case "tie":
                    this.processTie(e);
                    continue;
                case "timeline":
                    continue;
                case "trill":
                    continue;
                case "tuplet":
                    if (this.processTuplet(e))
                        continue;
                    break;
                case "tupletSpan":
                    this.processTupletSpan(e);
                    continue;
                case "turn":
                    continue;
                case "unclear":
                    break;
                case "uneume":
                    continue;
                case "verse":
                    break;
                default:
                    continue;
            }
            this.convertElement(e);
        }

        return;
    }

    /**
     * this function gets an mdiv and creates an instance of Msm
     */
    private makeMovement(mdiv: Element): void {
        let titleString = this.mei!.getTitle();
        const mdivN = mdiv.getAttribute("n");
        if (mdivN !== null) titleString += " - " + mdivN.getValue();
        const mdivLabel = mdiv.getAttribute("label");
        if (mdivLabel !== null) titleString += " - " + mdivLabel.getValue();

        let movementId: string;
        const id = Helper.getAttribute("id", mdiv);
        if (id !== null) {
            movementId = id.getValue();
        } else {
            movementId = "meico_" + uuidv4();
            mdiv.addAttribute(new Attribute("id", movementId));
        }

        const msm = Msm.createMsm(titleString, movementId, this.ppq);
        this.movements.push(msm);

        const mpm = Mpm.createMpm();

        // Add metadata
        const relatedResources: any[] = [];
        const meiFile = this.mei!.getFile();
        if (meiFile !== null) {
            relatedResources.push(RelatedResource.createRelatedResource(meiFile, "mei"));
            const comment = Comment.createComment(
                "This MPM has been generated from '" + meiFile
                + "' using the meico MEI converter v" + Meico.version + ".", null);
            mpm.addMetadata(Author.createAuthor("meico", null, null), comment, relatedResources);
        } else {
            const comment = Comment.createComment(
                "This MPM has been generated from MEI code using the meico MEI converter v"
                + Meico.version + ".", null);
            mpm.addMetadata(Author.createAuthor("meico", null, null), comment, null);
        }

        const performance = Performance.createPerformance("MEI export performance");
        if (performance === null) {
            console.error("Failed to generate an instance of Performance. Skipping mdiv " + titleString);
            return;
        }
        performance.setPulsesPerQuarter(this.ppq);
        mpm.addPerformance(performance);
        this.performances.push(mpm);

        this.reset();
        this.currentMdiv = mdiv;
        this.currentMsmMovement = msm.getRootElement();
        this.currentPerformance = performance;
        this.indexNotesAndChords(this.currentMdiv);

        // find the corresponding work element in meiHead
        const n = (mdiv.getAttribute("n") === null) ? null : mdiv.getAttributeValue("n");
        const decls = (mdiv.getAttribute("decls") === null) ? null : mdiv.getAttributeValue("decls")!.split(/\s+/);
        let workList = Helper.getFirstChildElement("workList", this.mei!.getMeiHead()!);
        if (workList === null)
            workList = Helper.getFirstChildElement("workDesc", this.mei!.getMeiHead()!);
        if (workList !== null) {
            const works = Helper.getAllChildElements("work", workList)!;
            switch (works.length) {
                case 0:
                    break;
                case 1:
                    this.currentWork = works[0];
                    break;
                default: {
                    if (decls !== null) {
                        for (const work of works) {
                            const workId = Helper.getAttributeValue("id", work);
                            let found = false;
                            for (const decl of decls) {
                                if (decl.substring(1) === workId) {
                                    this.currentWork = work;
                                    found = true;
                                    break;
                                }
                            }
                            if (found)
                                break;
                        }
                    }
                    if ((this.currentWork === null) && (n !== null)) {
                        for (const work of works) {
                            if (n === Helper.getAttributeValue("n", work)) {
                                this.currentWork = work;
                                break;
                            }
                        }
                    }
                }
            }
        }

        if (msm.isEmpty()) {
            console.error("Skipping mdiv. Failed to initialize required data objects.");
            return;
        }
        this.convertElement(mdiv);

        // postprocess arpeggios
        for (const arpeggioNoteOrder of this.arpeggiosToSort) {
            const notePitchList: Array<KeyValue<string, number>> = [];
            for (const noteId of arpeggioNoteOrder.getKey().getValue().replace(/#/g, "").split(/\s+/)) {
                const note = this.allNotesAndChords.get(noteId);
                if (note === undefined) continue;
                const pitchAtt = Helper.getAttribute("pnum", note);
                if (pitchAtt === null) continue;
                const pitch = parseFloat(pitchAtt.getValue());
                notePitchList.push(new KeyValue<string, number>(noteId, pitch));
            }

            notePitchList.sort((n1, n2) => {
                return arpeggioNoteOrder.getValue()
                    ? Math.sign(n1.getValue() - n2.getValue())
                    : Math.sign(n2.getValue() - n1.getValue());
            });

            let noteIdsString = "";
            for (const noteId of notePitchList)
                noteIdsString += " #" + noteId.getKey().trim().replace(/#/g, "");
            arpeggioNoteOrder.getKey().setValue(noteIdsString.trim());
        }

        // finalize the tempoMap
        let globalTempoMap = this.currentPerformance?.getGlobal()?.getDated()?.getMap(Mpm.TEMPO_MAP) as TempoMap | null | undefined;
        if (((globalTempoMap === null || globalTempoMap === undefined) || (globalTempoMap.getElementBeforeAt(0.0) === null)) && (this.currentWork !== null)) {
            const tempo = Helper.getFirstChildElement("tempo", this.currentWork);
            if (tempo !== null) {
                const tempoData = this.parseTempo(tempo, null);
                if (tempoData !== null) {
                    if (globalTempoMap === null || globalTempoMap === undefined) {
                        globalTempoMap = this.currentPerformance?.getGlobal()?.getDated()?.addMap(TempoMap.createTempoMap()!) as TempoMap | null | undefined;

                        if (this.currentPerformance?.getGlobal()?.getHeader()?.getAllStyleTypes()?.get(Mpm.TEMPO_STYLE) !== null)
                            globalTempoMap?.addStyleSwitch(0.0, "MEI export");
                    }
                    tempoData.startDate = 0.0;
                    globalTempoMap?.addTempo(tempoData);
                }
            }
        }
    }

    /**
     * process an mei scoreDef element
     */
    private processScoreDef(scoreDef: Element): void {
        if (this.currentPart !== null) {
            this.processStaffDef(scoreDef);
            return;
        }

        scoreDef.addAttribute(new Attribute("date", this.getMidiTimeAsString()));

        let s: Element | null;

        // time signature
        s = this.makeTimeSignature(scoreDef);
        if (s !== null) {
            Helper.addToMap(s, this.currentMsmMovement!.getFirstChildElement("global")!.getFirstChildElement("dated")!.getFirstChildElement("timeSignatureMap")!);
        }

        // key signature
        s = this.makeKeySignature(scoreDef);
        if (s !== null) {
            Helper.addToMap(s, this.currentMsmMovement!.getFirstChildElement("global")!.getFirstChildElement("dated")!.getFirstChildElement("keySignatureMap")!);
        }

        // store default values in miscMap
        if (scoreDef.getAttribute("dur.default") !== null) {
            const d = new Element("dur.default");
            d.addAttribute(new Attribute("date", this.getMidiTimeAsString()));
            d.addAttribute(new Attribute("dur", scoreDef.getAttributeValue("dur.default")!));
            Helper.copyId(scoreDef, d);
            Helper.addToMap(d, this.currentMsmMovement!.getFirstChildElement("global")!.getFirstChildElement("dated")!.getFirstChildElement("miscMap")!);
        }

        if (scoreDef.getAttribute("octave.default") !== null) {
            const d = new Element("oct.default");
            d.addAttribute(new Attribute("date", this.getMidiTimeAsString()));
            d.addAttribute(new Attribute("oct", scoreDef.getAttributeValue("octave.default")!));
            Helper.copyId(scoreDef, d);
            Helper.addToMap(d, this.currentMsmMovement!.getFirstChildElement("global")!.getFirstChildElement("dated")!.getFirstChildElement("miscMap")!);
        }

        {
            let trans = 0;
            trans = (scoreDef.getAttribute("trans.semi") === null) ? 0.0 : parseFloat(scoreDef.getAttributeValue("trans.semi")!);
            trans += Mei2MsmMpmConverter.processClefDis(scoreDef);
            const d = new Element("transposition");
            d.addAttribute(new Attribute("date", this.getMidiTimeAsString()));
            d.addAttribute(new Attribute("semi", String(trans)));
            Helper.copyId(scoreDef, d);
            Helper.addToMap(d, this.currentMsmMovement!.getFirstChildElement("global")!.getFirstChildElement("dated")!.getFirstChildElement("miscMap")!);
        }

        Helper.addToMap(Helper.cloneElement(scoreDef), this.currentMsmMovement!.getFirstChildElement("global")!.getFirstChildElement("dated")!.getFirstChildElement("miscMap")!);
    }

    private processStaffDef(staffDef: Element): void {
        const parentPart = this.currentPart;
        this.currentPart = this.makePart(staffDef);

        staffDef.addAttribute(new Attribute("date", this.getMidiTimeAsString()));

        let t = this.makeTimeSignature(staffDef);
        if (t !== null) {
            Helper.addToMap(t, this.currentPart!.getFirstChildElement("dated")!.getFirstChildElement("timeSignatureMap")!);
        }

        t = this.makeKeySignature(staffDef);
        if (t !== null) {
            Helper.addToMap(t, this.currentPart!.getFirstChildElement("dated")!.getFirstChildElement("keySignatureMap")!);
        }

        if (staffDef.getAttribute("dur.default") !== null) {
            const d = new Element("dur.default");
            d.addAttribute(new Attribute("date", this.getMidiTimeAsString()));
            d.addAttribute(new Attribute("dur", staffDef.getAttributeValue("dur.default")!));
            Helper.copyId(staffDef, d);
            Helper.addToMap(d, this.currentPart!.getFirstChildElement("dated")!.getFirstChildElement("miscMap")!);
        }

        if (staffDef.getAttribute("octave.default") !== null) {
            const d = new Element("oct.default");
            d.addAttribute(new Attribute("date", this.getMidiTimeAsString()));
            d.addAttribute(new Attribute("oct", staffDef.getAttributeValue("octave.default")!));
            Helper.copyId(staffDef, d);
            Helper.addToMap(d, this.currentPart!.getFirstChildElement("dated")!.getFirstChildElement("miscMap")!);
        }

        {
            let trans = 0;
            trans = (staffDef.getAttribute("trans.semi") === null) ? 0.0 : parseFloat(staffDef.getAttributeValue("trans.semi")!);
            trans += Mei2MsmMpmConverter.processClefDis(staffDef);
            const d = new Element("transposition");
            d.addAttribute(new Attribute("semi", String(trans)));
            d.addAttribute(new Attribute("date", this.getMidiTimeAsString()));
            Helper.copyId(staffDef, d);
            Helper.addToMap(d, this.currentPart!.getFirstChildElement("dated")!.getFirstChildElement("miscMap")!);
        }

        Helper.addToMap(Helper.cloneElement(staffDef), this.currentPart!.getFirstChildElement("dated")!.getFirstChildElement("miscMap")!);

        this.convertElement(staffDef);
        this.accid = [];
        this.currentPart = parentPart;
    }

    private processStaff(staff: Element): void {
        let ref = staff.getAttribute("def");
        if (ref === null) ref = staff.getAttribute("n");
        const s = this.getPart((ref === null) ? "" : ref.getValue());
        const parentPart = this.currentPart;

        if (s !== null) {
            s.addAttribute(new Attribute("currentDate", this.getMidiTimeAsString()));
            this.currentPart = s;
        } else {
            console.log("There is an undefined staff element in the score with no corresponding staffDef.\n" + staff.toXML() + "\nGenerating a new part for it.");
            this.currentPart = this.makePart(staff);
        }

        this.convertElement(staff);
        this.accid = [];
        this.currentPart = parentPart;
    }

    private processLayerDef(layerDef: Element): void {
        layerDef.addAttribute(new Attribute("date", this.getMidiTimeAsString()));

        if (layerDef.getAttribute("dur.default") !== null) {
            const d = new Element("dur.default");
            this.currentPart!.getFirstChildElement("dated")!.getFirstChildElement("miscMap")!.appendChild(d);
            d.addAttribute(new Attribute("dur", layerDef.getAttributeValue("dur.default")!));
            Helper.copyId(layerDef, d);
            this.addLayerAttribute(d);
        }

        if (layerDef.getAttribute("octave.default") !== null) {
            const d = new Element("oct.default");
            this.currentPart!.getFirstChildElement("dated")!.getFirstChildElement("miscMap")!.appendChild(d);
            d.addAttribute(new Attribute("oct", layerDef.getAttributeValue("octave.default")!));
            Helper.copyId(layerDef, d);
            this.addLayerAttribute(d);
        }

        if (this.currentPart === null) {
            Helper.addToMap(Helper.cloneElement(layerDef), this.currentMsmMovement!.getFirstChildElement("global")!.getFirstChildElement("dated")!.getFirstChildElement("miscMap")!);
            return;
        }

        Helper.addToMap(Helper.cloneElement(layerDef), this.currentPart.getFirstChildElement("dated")!.getFirstChildElement("miscMap")!);
    }

    private processLayer(layer: Element): void {
        const parentLayer = this.currentLayer;
        this.currentLayer = layer;

        const oldDate = this.currentPart!.getAttribute("currentDate")!.getValue();

        this.convertElement(layer);

        layer.addAttribute(new Attribute("currentDate", this.currentPart!.getAttribute("currentDate")!.getValue()));
        this.accid = [];
        this.currentLayer = parentLayer;
        if (Helper.getNextSiblingElement("layer", layer) !== null)
            this.currentPart!.getAttribute("currentDate")!.setValue(oldDate);
        else {
            const layers = layer.getParent()!.query("child::*[local-name()='layer']");
            let latestDate = parseFloat(this.currentPart!.getAttribute("currentDate")!.getValue());
            for (let j = layers.size() - 1; j >= 0; --j) {
                const date = parseFloat((layers.get(j) as unknown as Element).getAttributeValue("currentDate")!);
                if (latestDate < date)
                    latestDate = date;
            }
            this.currentPart!.getAttribute("currentDate")!.setValue(String(latestDate));
        }
    }

    private processApp(app: Element): void {
        let takeThisReading = Helper.getFirstChildElement(app, "lem");
        if (takeThisReading === null) {
            takeThisReading = Helper.getFirstChildElement(app, "rdg");
            if (takeThisReading === null) {
                return;
            }
        }
        this.convertElement(takeThisReading);
    }

    private processChoice(choice: Element): void {
        const prefOrder = ["corr", "reg", "expan", "subst", "choice", "orig", "unclear", "sic", "abbr"];

        let c: Element | null = null;
        for (let i = 0; (c === null) && (i < prefOrder.length); ++i) {
            c = Helper.getFirstChildElement(choice, prefOrder[i]);
        }

        if (c !== null) {
            if (c.getLocalName() === "choice")
                this.processChoice(c);
            else
                this.convertElement(c);
            return;
        }

        const children = choice.getChildElements();
        if (children.size() > 0) {
            c = children.get(0);
            if (c !== null)
                this.convertElement(c);
        }
    }

    private processRestore(restore: Element): void {
        const dels = restore.query("descendant::*[local-name()='del']");
        for (let i = 0; i < dels.size(); ++i) {
            const d = dels.get(i) as unknown as Element;
            d.addAttribute(new Attribute("restored-meico", "true"));
        }
    }

    private processDel(del: Element): void {
        const restored = del.getAttribute("restored-meico");
        if ((restored !== null) && (restored.getValue() === "true"))
            this.convertElement(del);
    }

    private processEnding(ending: Element): void {
        const startDate = this.getMidiTime();
        const endingCount = this.endingCounter++;
        const sequencingMap = this.currentMsmMovement!.getFirstChildElement("global")!.getFirstChildElement("dated")!.getFirstChildElement("sequencingMap")!;

        let endingText = "";
        let endingNumbers: number[];
        let activity = "1";
        let n = Number.MIN_SAFE_INTEGER;
        if (ending.getAttribute("n") !== null) endingText = ending.getAttributeValue("n")!;
        else if (ending.getAttribute("label") !== null) endingText = ending.getAttributeValue("label")!;
        if (endingText.toLowerCase().includes("fine"))
            n = Number.MAX_SAFE_INTEGER;
        else {
            endingNumbers = Helper.extractAllIntegersFromString(endingText);
            if (endingNumbers.length > 0) {
                n = endingNumbers[0];
            }
        }

        const endingLabel = ending.getAttribute("id", "http://www.w3.org/XML/1998/namespace");
        const markerId = "endingMarker_" + ((endingLabel === null) ? uuidv4() : endingLabel.getValue());

        const marker = new Element("marker");
        marker.addAttribute(new Attribute("date", String(startDate)));
        marker.addAttribute(new Attribute("message", "ending" + ((ending.getAttribute("n") === null) ? ((ending.getAttribute("label") === null) ? (": " + ending.getAttributeValue("label")) : String(endingCount)) : (" " + ending.getAttributeValue("n")))));
        const idAttr = new Attribute("xml:id", "http://www.w3.org/XML/1998/namespace", markerId);
        marker.addAttribute(idAttr);
        Helper.addToMap(marker, sequencingMap);

        // find the last repetition start marker before or at the date of this
        const ns = sequencingMap.query("descendant::*[local-name()='marker' and attribute::message='repetition start']");
        let repetitionStartMarker: Element | null = null;
        for (let i = ns.size() - 1; i >= 0; --i) {
            const e = ns.get(i) as unknown as Element;
            if ((e.getAttribute("date") !== null) && (parseFloat(e.getAttributeValue("date")!) <= startDate)) {
                repetitionStartMarker = e;
                break;
            }
        }

        let noPreviousEndings = false;
        const find1stEndingMarkerAfterThisDate = (repetitionStartMarker === null) ? 0.0 : parseFloat(repetitionStartMarker.getAttributeValue("date")!);
        const ends = sequencingMap.query("descendant::*[local-name()='marker' and contains(attribute::message, 'ending')]");
        let dateOfGoto = Number.MAX_VALUE;
        for (let i = 0; i < ends.size(); ++i) {
            const end = ends.get(i) as unknown as Element;
            if (((repetitionStartMarker !== null) && (end.getParent()!.indexOf(end) < end.getParent()!.indexOf(repetitionStartMarker)))
                || (end.getAttribute("date") === null)) {
                continue;
            }
            if (end === marker) {
                noPreviousEndings = true;
                dateOfGoto = startDate;
                break;
            }
            const firstEndingMarkerDate = parseFloat(end.getAttributeValue("date")!);
            if (firstEndingMarkerDate >= find1stEndingMarkerAfterThisDate) {
                dateOfGoto = firstEndingMarkerDate;
                break;
            }
        }

        const gotoObj = new Goto(dateOfGoto, startDate, markerId, "0" + activity, null as any);
        const gt = gotoObj.toElement();
        gt.addAttribute(new Attribute("n", String(n)));

        if (n === Number.MIN_SAFE_INTEGER)
            Helper.addToMap(gt, sequencingMap);
        else {
            const gotosAtSameDate = sequencingMap.query("descendant::*[local-name()='goto' and attribute::date='" + gotoObj.date + "']");
            if (gotosAtSameDate.size() === 0) {
                gt.addAttribute(new Attribute("first", "true"));
                gt.getAttribute("target.id")!.setValue("");
                Helper.addToMap(gt, sequencingMap);
            } else {
                let index: number;
                for (index = 0; index < gotosAtSameDate.size(); ++index) {
                    const gtast = gotosAtSameDate.get(index) as unknown as Element;
                    if (gtast.getAttribute("n") === null) continue;
                    if (parseInt(gtast.getAttributeValue("n")!) > n) break;
                }
                if (index === 0) gt.getAttribute("activity")!.setValue(activity);
                const firstGoto = gotosAtSameDate.get(0) as unknown as Element;
                if (index >= gotosAtSameDate.size()) Helper.addToMap(gt, sequencingMap);
                else sequencingMap.insertChild(gt, sequencingMap.indexOf((gotosAtSameDate.size() === 0) ? marker : gotosAtSameDate.get(index) as unknown as Element));
                if (firstGoto.getAttribute("first") !== null) {
                    sequencingMap.removeChild(firstGoto);
                }
            }
        }

        this.convertElement(ending);

        if (noPreviousEndings)
            gt.getAttribute("target.date")!.setValue(this.getMidiTimeAsString());
    }

    private processPhrase(phrase: Element): void {
        const timingData = this.computeControlEventTiming(phrase, this.currentPart);
        if (timingData === null) return;
        const date = timingData[0] as number;
        const endDate = timingData[1] as number | null;
        const tstamp2 = timingData[2] as Attribute | null;
        const endid = timingData[3] as Attribute | null;

        let att = phrase.getAttribute("part");
        if (att === null) att = phrase.getAttribute("staff");
        if ((att === null) || att.getValue() === "" || att.getValue() === "%all") {
            const phraseMapEntry = new Element("phrase");
            phraseMapEntry.addAttribute(new Attribute("date", String(date)));
            if (phrase.getAttribute("label") !== null) phraseMapEntry.addAttribute(new Attribute("label", phrase.getAttributeValue("label")!));
            else if (phrase.getAttribute("n") !== null) phraseMapEntry.addAttribute(new Attribute("label", phrase.getAttributeValue("n")!));
            Helper.copyId(phrase, phraseMapEntry);

            if (endDate !== null) {
                phraseMapEntry.addAttribute(new Attribute("date.end", String(endDate)));
            } else if (tstamp2 !== null) {
                phraseMapEntry.addAttribute(new Attribute("tstamp2", tstamp2.getValue()));
                this.tstamp2s.push(phraseMapEntry);
            } else if (endid !== null) {
                phraseMapEntry.addAttribute(new Attribute("endid", endid.getValue()));
                this.endids.push(phraseMapEntry);
            }

            const phraseMap = this.currentMsmMovement!.getFirstChildElement("global")!.getFirstChildElement("dated")!.getFirstChildElement("phraseMap")!;
            Helper.addToMap(phraseMapEntry, phraseMap);
        } else {
            const staffString = att.getValue();
            const staffs = staffString.split(/\s+/);
            const parts = this.currentMsmMovement!.getChildElements("part");
            for (const staff of staffs) {
                for (let p = 0; p < parts.size(); ++p) {
                    if (parts.get(p).getAttributeValue("number") !== staff) continue;
                    const phraseMapEntry = new Element("phrase");
                    phraseMapEntry.addAttribute(new Attribute("date", String(date)));
                    if (phrase.getAttribute("label") !== null) phraseMapEntry.addAttribute(new Attribute("label", phrase.getAttributeValue("label")!));
                    else if (phrase.getAttribute("n") !== null) phraseMapEntry.addAttribute(new Attribute("label", phrase.getAttributeValue("n")!));
                    Helper.copyId(phrase, phraseMapEntry);
                    const phId = phraseMapEntry.getAttribute("id", "http://www.w3.org/XML/1998/namespace");
                    if (phId !== null) phId.setValue("meico_copyId_" + staff + "_" + phId.getValue());

                    if (endDate !== null) {
                        phraseMapEntry.addAttribute(new Attribute("date.end", String(endDate)));
                    } else if (tstamp2 !== null) {
                        phraseMapEntry.addAttribute(new Attribute("tstamp2", tstamp2.getValue()));
                        this.tstamp2s.push(phraseMapEntry);
                    } else if (endid !== null) {
                        phraseMapEntry.addAttribute(new Attribute("endid", endid.getValue()));
                        this.endids.push(phraseMapEntry);
                    }

                    const phraseMap = parts.get(p).getFirstChildElement("dated")!.getFirstChildElement("phraseMap")!;
                    Helper.addToMap(phraseMapEntry, phraseMap);
                    this.addLayerAttribute(phraseMapEntry);
                }
            }
        }
    }

    private processSection(section: Element): void {
        const sectionMapEntry = new Element("section");
        sectionMapEntry.addAttribute(new Attribute("date", this.getMidiTimeAsString()));
        if (section.getAttribute("label") !== null) sectionMapEntry.addAttribute(new Attribute("label", section.getAttributeValue("label")!));
        else if (section.getAttribute("n") !== null) sectionMapEntry.addAttribute(new Attribute("label", section.getAttributeValue("n")!));
        Helper.copyId(section, sectionMapEntry);
        const sectionMap = this.currentMsmMovement!.getFirstChildElement("global")!.getFirstChildElement("dated")!.getFirstChildElement("sectionMap")!;
        sectionMap.appendChild(sectionMapEntry);
        this.convertElement(section);
        sectionMapEntry.addAttribute(new Attribute("date.end", this.getMidiTimeAsString()));
    }

    private processMeasure(measure: Element): void {
        const startDate = this.getMidiTime();
        measure.addAttribute(new Attribute("date", String(startDate)));
        this.currentMeasure = measure;

        // process pending tstamp2 elements
        for (let i = 0; i < this.tstamp2s.length; ++i) {
            const e = this.tstamp2s[i];
            const att = e.getAttribute("tstamp2")!;
            const tstamp2Parts = att.getValue().split("m+");
            let measures = parseInt(tstamp2Parts[0]) - 1;
            if (measures <= 0) {
                const endDate = this.tstampToTicks(tstamp2Parts[1], null);
                e.addAttribute(new Attribute("date.end", String(endDate)));
                e.removeAttribute(att);
                this.tstamp2s.splice(i, 1);
                i--;
            } else {
                att.setValue(measures + "m+" + tstamp2Parts[1]);
            }
        }

        Mei2MsmMpmConverter.reorderMeasureContent(measure);

        this.convertElement(measure);
        this.accid = [];
        this.currentMeasure = null;

        const metconAtt = measure.getAttribute("metcon");
        const metcon = (metconAtt === null) || metconAtt.getValue() !== "false";

        let defaultGlobalMeasureDuration = 0.0;
        let globalTimeSignature: Element | null = null;
        const globalTsMap = this.currentMsmMovement!.getFirstChildElement("global")!.getFirstChildElement("dated")!.getFirstChildElement("timeSignatureMap")!;
        if (globalTsMap.getChildCount() > 0) {
            const tss = globalTsMap.getChildElements("timeSignature");
            globalTimeSignature = tss.get(tss.size() - 1);
            defaultGlobalMeasureDuration = this.computeMeasureLength(parseFloat(globalTimeSignature.getAttributeValue("numerator")!), parseFloat(globalTimeSignature.getAttributeValue("denominator")!));
        }

        let longestDuration = 0.0;
        const partsDefaultDurations = new Map<Element, number>();
        const partsTsMapAndTs = new Map<Element, KeyValue<Element, Element>>();
        const parts = this.currentMsmMovement!.getChildElements("part");
        for (let pi = 0; pi < parts.size(); ++pi) {
            const part = parts.get(pi);
            const tsMap = part.getFirstChildElement("dated")!.getFirstChildElement("timeSignatureMap")!;
            let ts: Element | null = null;
            if (tsMap.getChildCount() > 0) {
                const tss = tsMap.getChildElements("timeSignature");
                ts = tss.get(tss.size() - 1);
                partsTsMapAndTs.set(part, new KeyValue(tsMap, ts));
            }

            const defaultLocalMeasureDuration = (ts === null) ? defaultGlobalMeasureDuration : this.computeMeasureLength(parseFloat(ts.getAttributeValue("numerator")!), parseFloat(ts.getAttributeValue("denominator")!));
            partsDefaultDurations.set(part, defaultLocalMeasureDuration);
            const actualPartMeasureDuration = parseFloat(part.getAttributeValue("currentDate")!) - startDate;

            const d = ((actualPartMeasureDuration === defaultLocalMeasureDuration) || ((actualPartMeasureDuration < defaultLocalMeasureDuration) && metcon)) ? defaultLocalMeasureDuration : actualPartMeasureDuration;
            part.getAttribute("currentDate")!.setValue(String(d + startDate));
            if (d > longestDuration)
                longestDuration = d;
        }
        measure.addAttribute(new Attribute("midi.dur", String(longestDuration)));
        const endDate = startDate + longestDuration;

        if ((globalTimeSignature !== null) && (longestDuration !== defaultGlobalMeasureDuration)) {
            while (globalTsMap.getChildElements().size() > 0) {
                const last = globalTsMap.getChildElements().get(globalTsMap.getChildCount() - 1);
                if (parseFloat(last.getAttributeValue("date")!) >= startDate) {
                    globalTsMap.removeChild(last);
                } else break;
            }
            const numDenom = [parseFloat(globalTimeSignature.getAttributeValue("numerator")!), parseFloat(globalTimeSignature.getAttributeValue("denominator")!)];
            const num = (longestDuration * numDenom[1]) / (this.ppq * 4.0);
            const newTs = Msm.makeTimeSignature(startDate, num, numDenom[1], null);
            globalTsMap.appendChild(newTs);
            const switchBackTs = Msm.makeTimeSignature(endDate, numDenom[0], numDenom[1], null);
            globalTsMap.appendChild(switchBackTs);
        }

        for (let pi = 0; pi < parts.size(); ++pi) {
            const part = parts.get(pi);
            const tsData = partsTsMapAndTs.get(part);
            if ((tsData === undefined) || (partsDefaultDurations.get(part) === longestDuration))
                continue;
            const tsMap = tsData.getKey();
            const ts = tsData.getValue();
            if (ts === null) continue;

            while (tsMap.getChildElements().size() > 0) {
                const last = tsMap.getChildElements().get(tsMap.getChildCount() - 1);
                if (parseFloat(last.getAttributeValue("date")!) >= startDate) {
                    tsMap.removeChild(last);
                } else break;
            }
            const numDenom = [parseFloat(ts.getAttributeValue("numerator")!), parseFloat(ts.getAttributeValue("denominator")!)];
            const num2 = (longestDuration * numDenom[1]) / (this.ppq * 4.0);
            const newTs2 = Msm.makeTimeSignature(startDate, num2, numDenom[1], null);
            tsMap.appendChild(newTs2);
            const switchBackTs2 = Msm.makeTimeSignature(endDate, numDenom[0], numDenom[1], null);
            tsMap.appendChild(switchBackTs2);
        }

        // process barlines
        if (measure.getAttribute("left") !== null)
            Mei2MsmMpmConverter.barline2SequencingCommand(measure.getAttributeValue("left")!, startDate, this.currentMsmMovement!.getFirstChildElement("global")!.getFirstChildElement("dated")!.getFirstChildElement("sequencingMap")!);
        if (measure.getAttribute("right") !== null)
            Mei2MsmMpmConverter.barline2SequencingCommand(measure.getAttributeValue("right")!, endDate, this.currentMsmMovement!.getFirstChildElement("global")!.getFirstChildElement("dated")!.getFirstChildElement("sequencingMap")!);
    }

    private processMeterSig(meterSig: Element): void {
        const s = this.makeTimeSignature(meterSig);
        if (s === null) return;
        if (this.currentPart !== null) {
            Helper.addToMap(s, this.currentPart.getFirstChildElement("dated")!.getFirstChildElement("timeSignatureMap")!);
        } else {
            Helper.addToMap(s, this.currentMsmMovement!.getFirstChildElement("global")!.getFirstChildElement("dated")!.getFirstChildElement("timeSignatureMap")!);
        }
    }

    private processKeySig(keySig: Element): void {
        const s = this.makeKeySignature(keySig);
        if (s === null) return;
        if (this.currentPart !== null) {
            Helper.addToMap(s, this.currentPart.getFirstChildElement("dated")!.getFirstChildElement("keySignatureMap")!);
        } else {
            Helper.addToMap(s, this.currentMsmMovement!.getFirstChildElement("global")!.getFirstChildElement("dated")!.getFirstChildElement("keySignatureMap")!);
        }
    }

    private processAccid(accid: Element): void {
        let parentNote: Element | null = accid.getParent();
        for (; parentNote !== null; parentNote = parentNote.getParent()) {
            if (parentNote.getLocalName() === "note") break;
            if (parentNote.getLocalName() === "layer") { parentNote = null; break; }
        }

        const accidGesAtt = accid.getAttribute("accid.ges");
        if ((accidGesAtt !== null) && (parentNote !== null) && (parentNote.getAttribute("accid.ges") === null))
            parentNote.addAttribute(new Attribute("accid.ges", accidGesAtt.getValue()));

        const accidAtt = accid.getAttribute("accid");
        if (accidAtt === null) return;
        if ((parentNote !== null) && (parentNote.getAttribute("accid") === null))
            parentNote.addAttribute(new Attribute("accid", accidAtt.getValue()));

        const ploc = accid.getAttribute("ploc");
        let pname: string | null = null;
        if (ploc !== null) { pname = ploc.getValue(); }
        else {
            if (parentNote !== null) {
                if (parentNote.getAttribute("pname") !== null) { pname = parentNote.getAttributeValue("pname"); }
                else {
                    if ((parentNote.getAttribute("pname.ges") !== null) && parentNote.getAttributeValue("pname.ges") !== "none") { pname = parentNote.getAttributeValue("pname.ges"); }
                    else { return; }
                }
            } else { return; }
        }
        accid.addAttribute(new Attribute("pname", pname!));

        const oloc = accid.getAttribute("oloc");
        let oct: string | null = null;
        if (oloc !== null) { oct = oloc.getValue(); }
        else {
            if (parentNote !== null) {
                if (parentNote.getAttribute("oct") !== null) { oct = parentNote.getAttributeValue("oct"); }
                else {
                    if (parentNote.getAttribute("oct.ges") !== null) { oct = parentNote.getAttributeValue("oct.ges"); }
                    else {
                        if (this.currentPart !== null) {
                            let octs = this.currentPart.getFirstChildElement("dated")!.getFirstChildElement("miscMap")!.getChildElements("oct.default");
                            if (octs.size() === 0) {
                                octs = this.currentMsmMovement!.getFirstChildElement("global")!.getFirstChildElement("dated")!.getFirstChildElement("miscMap")!.getChildElements("oct.default");
                            }
                            for (let i2 = octs.size() - 1; i2 >= 0; --i2) {
                                if ((octs.get(i2).getAttribute("layer") === null) || octs.get(i2).getAttributeValue("layer") === Mei.getLayerId(Mei.getLayer(accid))) {
                                    oct = octs.get(i2).getAttributeValue("oct.default");
                                    break;
                                }
                            }
                            if (oct === null) return;
                        } else { return; }
                    }
                }
            } else { return; }
        }
        accid.addAttribute(new Attribute("oct", oct!));

        this.addLayerAttribute(accid);
        this.accid.push(accid);
    }

    private processDot(dot: Element): void {
        let parentNote: Element | null = null;
        for (let e: Element | null = dot.getParent(); (e !== null) && !(e.getLocalName() === "layer"); e = e.getParent()) {
            if (e.getLocalName() === "note" || e.getLocalName() === "rest") { parentNote = e; break; }
        }
        if (parentNote === null) return;

        const d = parentNote.getAttribute("childDots");
        if (d !== null) { d.setValue(String(1 + parseInt(d.getValue()))); }
        else parentNote.addAttribute(new Attribute("childDots", "1"));
    }

    private processSyl(syl: Element): void {
        const lyricsElem = new Element("lyrics");

        for (let parent: Element | null = syl.getParent(); parent !== null; parent = parent.getParent()) {
            if (parent.getLocalName() === "verse") {
                const n = parent.getAttribute("n");
                if (n !== null) lyricsElem.addAttribute(new Attribute("verse", n.getValue()));
                continue;
            }
            if (parent.getLocalName() === "note") {
                let text = syl.getValue();
                const con = syl.getAttribute("con");
                if (con !== null) {
                    switch (con.getValue()) {
                        case "s": text += " "; break;
                        case "d": text += "-"; break;
                        case "u": text += "_"; break;
                        case "t": text += "~"; break;
                        case "c": text += "\u02C6"; break;
                        case "v": text += "\u02C7"; break;
                        case "i": text += "\u0351"; break;
                        case "b": text += "\u02D8"; break;
                        default: break;
                    }
                }
                lyricsElem.appendChild(text);
                this.lyrics.push(lyricsElem);
                return;
            }
            if (parent.getLocalName() === "measure" || parent.getLocalName() === "section" || parent.getLocalName() === "score" || parent.getLocalName() === "mdiv" || parent.getLocalName() === "body")
                return;
        }
    }

    private makePart(staffDef: Element): Element {
        const existingPart = this.getPart(staffDef.getAttributeValue("n") ?? "");
        if (existingPart !== null) return existingPart;

        let label = "";
        const parentElem = staffDef.getParent();
        if (parentElem !== null && parentElem.getLocalName() === "staffGrp")
            if (parentElem.getAttribute("label") !== null)
                label = parentElem.getAttributeValue("label")!;
        if (staffDef.getAttribute("label") !== null)
            label += (label === "") ? staffDef.getAttributeValue("label")! : " " + staffDef.getAttributeValue("label")!;
        else {
            const labelElement = Helper.getFirstChildElement("label", staffDef);
            if (labelElement !== null) {
                label += (label === "") ? labelElement.getValue() : " " + labelElement.getValue();
            }
        }

        let number: string;
        if (staffDef.getAttribute("n") !== null) {
            number = staffDef.getAttributeValue("n")!;
        } else {
            number = String(-1 * this.currentMsmMovement!.getChildElements("part").size());
            staffDef.addAttribute(new Attribute("n", number));
        }

        let midiChannel = 0;
        let midiPort = 0;
        const ps = this.currentMsmMovement!.getChildElements("part");
        if (ps.size() > 0) {
            const p = ps.get(ps.size() - 1);
            midiChannel = (parseInt(p.getAttributeValue("midi.channel")!) + 1) % 16;
            if ((midiChannel === 9) && this.dontUseChannel10)
                ++midiChannel;
            midiPort = (midiChannel === 0) ? (parseInt(p.getAttributeValue("midi.port")!) + 1) % 256 : parseInt(p.getAttributeValue("midi.port")!);
        }

        const part = Msm.makePartFromString(label, number, midiChannel, midiPort);

        const xmlId = staffDef.getAttribute("id", "http://www.w3.org/XML/1998/namespace");
        if (xmlId !== null) {
            const partId = new Attribute("xml:id", "http://www.w3.org/XML/1998/namespace", xmlId.getValue());
            part.addAttribute(partId);
        }

        part.addAttribute(new Attribute("currentDate", (this.currentMeasure !== null) ? this.currentMeasure.getAttributeValue("date")! : "0.0"));

        this.currentMsmMovement!.appendChild(part);

        // MPM part creation
        if (this.currentPerformance) {
            const performancePart = MpmPart.createPart(label, parseInt(number), midiChannel, midiPort);
            if (performancePart !== null) {
                this.currentPerformance.addPart(performancePart);
                if (xmlId !== null)
                    performancePart.setId(xmlId.getValue());
            }
        }

        return part;
    }

    protected makeTimeSignature(meiSource: Element): Element | null {
        const s = new Element("timeSignature");
        Helper.copyId(meiSource, s);
        s.addAttribute(new Attribute("date", this.getMidiTimeAsString()));

        let count = meiSource.getAttribute("count");
        if (count === null) count = meiSource.getAttribute("meter.count");
        let unit = meiSource.getAttribute("unit");
        if (unit === null) unit = meiSource.getAttribute("meter.unit");
        if ((count !== null) && (unit !== null)) {
            const str = count.getValue();
            let result = 0.0;
            let num = "";
            for (let i = 0; i < str.length; ++i) {
                if (((str.charAt(i) >= '0') && (str.charAt(i) <= '9')) || (str.charAt(i) === '.')) {
                    num += str.charAt(i);
                    continue;
                }
                result += (num === "") ? 0.0 : parseFloat(num);
                num = "";
            }
            result += (num === "") ? 0.0 : parseFloat(num);
            s.addAttribute(new Attribute("numerator", String(result)));
            s.addAttribute(new Attribute("denominator", unit.getValue()));
            this.addLayerAttribute(s);
            return s;
        }

        let sym = meiSource.getAttribute("sym");
        if (sym === null) sym = meiSource.getAttribute("meter.sym");
        if (sym !== null) {
            const str = (meiSource.getLocalName() === "meterSig") ? meiSource.getAttributeValue("sym")! : meiSource.getAttributeValue("meter.sym")!;
            if (str === "common") {
                s.addAttribute(new Attribute("numerator", "4"));
                s.addAttribute(new Attribute("denominator", "4"));
                this.addLayerAttribute(s);
                return s;
            } else if (str === "cut") {
                s.addAttribute(new Attribute("numerator", "2"));
                s.addAttribute(new Attribute("denominator", "2"));
                this.addLayerAttribute(s);
                return s;
            }
        }

        return null;
    }

    private makeKeySignature(meiSource: Element): Element | null {
        const s = new Element("keySignature");
        Helper.copyId(meiSource, s);
        s.addAttribute(new Attribute("date", this.getMidiTimeAsString()));

        const accidentals: Element[] = [];
        let sig = "";
        let mixed = "";

        if (meiSource.getLocalName() === "scoreDef" || meiSource.getLocalName() === "staffDef") {
            if (meiSource.getAttribute("key.sig") !== null)
                sig = meiSource.getAttributeValue("key.sig")!;
            else return null;
            if (meiSource.getAttribute("key.sig.mixed") !== null)
                mixed = meiSource.getAttributeValue("key.sig.mixed")!;
        } else if (meiSource.getLocalName() === "keySig") {
            if (meiSource.getAttribute("sig") !== null)
                sig = meiSource.getAttributeValue("sig")!;
            if (meiSource.getAttribute("sig.mixed") !== null)
                mixed = meiSource.getAttributeValue("sig.mixed")!;

            const accids = meiSource.getChildElements("keyAccid");
            for (let i = 0; i < accids.size(); ++i) {
                if ((accids.get(i).getAttribute("pname") === null) || (accids.get(i).getAttribute("accid") === null)) {
                    console.log("The following keyAccid element requires a pname and accid attribute for processing in meico: " + accids.get(i).toXML());
                    continue;
                }
                const pitch = Helper.pname2midi(accids.get(i).getAttributeValue("pname")!);
                if (pitch < 0.0) { console.error("No valid value in attribute pname: " + accids.get(i).toXML()); continue; }
                const accidental = new Element("accidental");
                accidental.addAttribute(new Attribute("midi.pitch", String(pitch)));
                accidental.addAttribute(new Attribute("pitchname", accids.get(i).getAttributeValue("pname")!));
                accidental.addAttribute(new Attribute("value", String(Helper.accidString2decimal(accids.get(i).getAttributeValue("accid")!))));
                accidentals.push(accidental);
            }
        }

        if (accidentals.length === 0 && sig !== "") {
            if (sig === "mixed") {
                if (mixed !== "") {
                    const acs = mixed.split(" ");
                    for (const ac of acs) {
                        const pitch = Helper.pname2midi(ac.substring(0, 1));
                        if (pitch < 0.0) continue;
                        if (ac.charAt(ac.length - 1) >= '0' && ac.charAt(ac.length - 1) <= '9') continue;
                        const secondLastIsDigit = (ac.charAt(ac.length - 2) >= '0' && ac.charAt(ac.length - 2) <= '9');
                        const accidVal = Helper.accidString2decimal(ac.substring(ac.length - (secondLastIsDigit ? 1 : 2)));
                        const accidental = new Element("accidental");
                        accidental.addAttribute(new Attribute("midi.pitch", String(pitch)));
                        accidental.addAttribute(new Attribute("pitchname", ac.substring(0, 1)));
                        accidental.addAttribute(new Attribute("value", String(accidVal)));
                        accidentals.push(accidental);
                    }
                }
            } else {
                let accidCount: number;
                switch (sig.charAt(sig.length - 1)) {
                    case 'f':
                        accidCount = parseInt(sig.substring(0, sig.length - 1));
                        accidCount *= -1;
                        break;
                    case 's':
                        accidCount = parseInt(sig.substring(0, sig.length - 1));
                        break;
                    case '0':
                        accidCount = 0;
                        break;
                    default:
                        accidCount = 0;
                        console.error("Unknown sig or key.sig attribute value in " + meiSource.toXML() + ". Assume 0 in the further processing.");
                }
                const acsArr = (accidCount > 0) ? ["5.0", "0.0", "7.0", "2.0", "9.0", "4.0", "11.0"] : ["11.0", "4.0", "9.0", "2.0", "7.0", "0.0", "5.0"];
                const acsnArr = (accidCount > 0) ? ["F", "C", "G", "D", "A", "E", "B"] : ["B", "E", "A", "D", "G", "C", "F"];
                for (let i = 0; i < Math.abs(accidCount); ++i) {
                    const accidental = new Element("accidental");
                    accidental.addAttribute(new Attribute("midi.pitch", acsArr[i]));
                    accidental.addAttribute(new Attribute("pitchname", acsnArr[i]));
                    accidental.addAttribute(new Attribute("value", (accidCount > 0) ? "1.0" : "-1.0"));
                    accidentals.push(accidental);
                }
            }
        }

        for (const accidental of accidentals) {
            s.appendChild(accidental);
        }

        this.addLayerAttribute(s);
        return s;
    }

    private processChord(chord: Element): void {
        if (this.currentPart === null) return;

        if (this.currentChord !== null) {
            if ((chord.getAttribute("dur") === null) && (this.currentChord.getAttribute("dur") !== null)) {
                chord.addAttribute(new Attribute("dur", this.currentChord.getAttributeValue("dur")!));
            }
            if ((chord.getAttribute("dots") === null) && (this.currentChord.getAttribute("dots") !== null)) {
                chord.addAttribute(new Attribute("dots", this.currentChord.getAttributeValue("dots")!));
            }
        }

        let dur = 0.0;
        if (chord.getAttribute("dur") !== null) {
            dur = this.computeDuration(chord);
        } else {
            const durs = chord.query("descendant::*[attribute::dur]");
            let idur = 0.0;
            for (let i = 0; i < durs.size(); ++i) {
                idur = this.computeDuration(durs.get(i) as unknown as Element);
                if (idur > dur) dur = idur;
            }
        }

        const f = this.currentChord;
        this.currentChord = chord;

        this.checkSlurs(chord);

        if (chord.query("descendant::*[local-name()='artic']").size() > 0)
            chord.addAttribute(new Attribute("hasArticulations", "true"));
        this.processArtic(chord);

        this.convertElement(chord);
        this.currentChord = f;
        if (this.currentChord === null) {
            this.currentPart!.getAttribute("currentDate")!.setValue(String(parseFloat(this.currentPart!.getAttributeValue("currentDate")!) + dur));
        }
    }

    private processTuplet(tuplet: Element): boolean {
        if (tuplet.getAttribute("dur") !== null) {
            const cd = parseFloat(this.currentPart!.getAttributeValue("currentDate")!);
            this.convertElement(tuplet);
            const dur = this.computeDuration(tuplet);
            this.currentPart!.getAttribute("currentDate")!.setValue(String(cd + dur));
            return true;
        }
        return false;
    }

    private processTupletSpan(tupletSpan: Element): void {
        if ((tupletSpan.getAttribute("num") === null) || (tupletSpan.getAttribute("numbase") === null)) {
            console.error("Cannot process MEI element " + tupletSpan.toXML() + ". Attributes 'num' and 'numbase' both need to be specified.");
            return;
        }

        const timingData = this.computeControlEventTiming(tupletSpan, this.currentPart);
        if (timingData === null) return;
        const date = timingData[0] as number;
        const endDate = timingData[1] as number | null;
        const tstamp2 = timingData[2] as Attribute | null;
        const endid = timingData[3] as Attribute | null;

        let att = tupletSpan.getAttribute("part");
        if (att === null) att = tupletSpan.getAttribute("staff");
        if ((att === null) || att.getValue() === "" || att.getValue() === "%all") {
            const clone = Helper.cloneElement(tupletSpan)!;
            clone.addAttribute(new Attribute("date", String(date)));
            if (endDate !== null) { clone.addAttribute(new Attribute("date.end", String(endDate))); }
            else if (tstamp2 !== null) { clone.addAttribute(new Attribute("tstamp2", tstamp2.getValue())); this.tstamp2s.push(clone); }
            else if (endid !== null) { this.endids.push(clone); }

            const tsMap = this.currentMsmMovement!.getFirstChildElement("global")!.getFirstChildElement("dated")!.getFirstChildElement("miscMap")!.getFirstChildElement("tupletSpanMap")!;
            Helper.addToMap(clone, tsMap);
        } else {
            const staffString = att.getValue();
            const staffs = staffString.split(/\s+/);
            const parts = this.currentMsmMovement!.getChildElements("part");
            for (const staff of staffs) {
                for (let p = 0; p < parts.size(); ++p) {
                    if (parts.get(p).getAttributeValue("number") !== staff) continue;
                    const clone = Helper.cloneElement(tupletSpan)!;
                    clone.addAttribute(new Attribute("date", String(date)));
                    const cloneId = clone.getAttribute("id", "http://www.w3.org/XML/1998/namespace");
                    if (cloneId !== null) cloneId.setValue("meico_copyId_" + staff + "_" + cloneId.getValue());
                    if (endDate !== null) { clone.addAttribute(new Attribute("date.end", String(endDate))); }
                    else if (tstamp2 !== null) { clone.addAttribute(new Attribute("tstamp2", tstamp2.getValue())); this.tstamp2s.push(clone); }
                    else if (endid !== null) { this.endids.push(clone); }

                    const tsMap = parts.get(p).getFirstChildElement("dated")!.getFirstChildElement("miscMap")!.getFirstChildElement("tupletSpanMap")!;
                    Helper.addToMap(clone, tsMap);
                    this.addLayerAttribute(clone);
                }
            }
        }
    }

    private processArpeg(arpeg: Element): void {
        // check if this is really an arpeggio
        const order = Helper.getAttribute("order", arpeg);
        if ((order !== null) && order.getValue().trim() === "nonarp")
            return;

        // compute the timing
        const timingData = this.computeControlEventTiming(arpeg, this.currentPart);
        if (timingData === null)
            return;

        // create ornament data
        const od = new OrnamentData();
        od.date = timingData[0] as number;
        od.ornamentDefName = "arpeggio";
        od.scale = 0.0;

        // read the xml:id
        const id = Helper.getAttribute("id", arpeg);
        od.xmlId = (id === null) ? null : id.getValue();

        // determine the note order
        let needsPostprocessing = 0;
        const plist = Helper.getAttribute("plist", arpeg);
        if (plist === null) {
            if (order !== null) {
                od.noteOrder = [];
                if (order.getValue().trim() === "down")
                    od.noteOrder.push("descending pitch");
                else
                    od.noteOrder.push("ascending pitch");
            }
        } else {
            od.noteOrder = [];
            for (const ref of plist.getValue().trim().split(/\s+/)) {
                const e = this.allNotesAndChords.get(ref.replace(/#/g, ""));
                if (e === undefined)
                    continue;
                if (e.getLocalName() === "note") {
                    od.noteOrder.push(ref);
                    continue;
                }
                if (e.getLocalName() === "chord") {
                    const notes = e.query("descendant::*[local-name()='note']");
                    for (let n = 0; n < notes.size(); ++n) {
                        const note = notes.get(n) as unknown as Element;
                        let noteId = Helper.getAttribute("id", note);
                        if (noteId === null) {
                            noteId = new Attribute("xml:id", "http://www.w3.org/XML/1998/namespace", "meico_" + uuidv4());
                            this.allNotesAndChords.set(noteId.getValue(), note);
                            note.addAttribute(noteId);
                        }
                        od.noteOrder.push("#" + noteId.getValue());
                    }
                }
            }

            if (order !== null) {
                if (order.getValue().trim() === "down")
                    needsPostprocessing = -1;
                else if (order.getValue().trim() === "up")
                    needsPostprocessing = 1;
            }
        }

        // make sure that the arpeggio is defined in a global ornamentation style
        let ornamentationStyle = this.currentPerformance!.getGlobal()!.getHeader()!.getStyleDef(Mpm.ORNAMENTATION_STYLE, "MEI export") as OrnamentationStyle | null;
        if (ornamentationStyle === null)
            ornamentationStyle = this.currentPerformance!.getGlobal()!.getHeader()!.addStyleDef(Mpm.ORNAMENTATION_STYLE, "MEI export") as OrnamentationStyle | null;
        if (ornamentationStyle!.getDef(od.ornamentDefName!) === undefined) {
            const def = OrnamentDef.createDefaultOrnamentDef(od.ornamentDefName!);
            if (def !== null) ornamentationStyle!.addDef(def);
        }

        // parse the staff attribute
        let ornamentationMap: OrnamentationMap | null;
        let att = arpeg.getAttribute("part");
        if (att === null)
            att = arpeg.getAttribute("staff");
        if ((att === null) || att.getValue() === "" || att.getValue() === "%all") {
            ornamentationMap = this.currentPerformance!.getGlobal()!.getDated()!.getMap(Mpm.ORNAMENTATION_MAP) as OrnamentationMap | null;
            if (ornamentationMap === null) {
                ornamentationMap = this.currentPerformance!.getGlobal()!.getDated()!.addMap(OrnamentationMap.createOrnamentationMap()!) as OrnamentationMap;
                ornamentationMap.addStyleSwitch(0.0, "MEI export");
            }
            const index = ornamentationMap.addOrnamentFromData(od);
            if (needsPostprocessing !== 0)
                this.arpeggiosToSort.push(new KeyValue<Attribute, boolean>(Helper.getAttribute("note.order", ornamentationMap.getElement(index)!)!, needsPostprocessing > 0));
        }
        else {
            let multiIDs = false;
            const staffs = att.getValue().split(/\s+/);

            for (const staff of staffs) {
                const part = this.currentPerformance!.getPart(parseInt(staff));
                if (part === null)
                    continue;

                ornamentationMap = part.getDated()!.getMap(Mpm.ORNAMENTATION_MAP) as OrnamentationMap | null;
                if (ornamentationMap === null) {
                    ornamentationMap = part.getDated()!.addMap(OrnamentationMap.createOrnamentationMap()!) as OrnamentationMap;
                    ornamentationMap.addStyleSwitch(0.0, "MEI export");
                }

                const odd = od.clone();
                if ((od.xmlId !== null) && multiIDs)
                    odd.xmlId = od.xmlId + "_meico_" + uuidv4();

                const index = ornamentationMap.addOrnamentFromData(odd);
                if (needsPostprocessing !== 0)
                    this.arpeggiosToSort.push(new KeyValue<Attribute, boolean>(Helper.getAttribute("note.order", ornamentationMap.getElement(index)!)!, needsPostprocessing > 0));

                multiIDs = true;
            }
        }
    }

    private processDynam(dynam: Element): void {
        const dd = new DynamicsData();

        switch (dynam.getLocalName()) {
            case "dynam":
                dd.volumeString = dynam.getValue();
                if (dd.volumeString === "") {
                    const label = dynam.getAttribute("label");
                    if (label !== null) dd.volumeString = label.getValue();
                }
                if (dd.volumeString === "") {
                    console.error("Cannot process MEI element " + dynam.toXML() + ". No value or label specified.");
                    return;
                }
                if (dd.volumeString!.includes("dim") || dd.volumeString!.includes("decresc")) {
                    dd.volumeString = "?";
                    dd.transitionToString = "-";
                } else if (dd.volumeString!.includes("cresc")) {
                    dd.volumeString = "?";
                    dd.transitionToString = "+";
                } else {
                    let dynamicsStyle = this.currentPerformance!.getGlobal()!.getHeader()!.getStyleDef(Mpm.DYNAMICS_STYLE, "MEI export") as DynamicsStyle | null;
                    if (dynamicsStyle === null)
                        dynamicsStyle = this.currentPerformance!.getGlobal()!.getHeader()!.addStyleDef(Mpm.DYNAMICS_STYLE, "MEI export") as DynamicsStyle | null;

                    if ((dynamicsStyle !== null) && (dynamicsStyle.getDef(dd.volumeString!) === undefined)) {
                        const def = DynamicsDef.createDefaultDynamicsDef(dd.volumeString!);
                        if (def !== null) dynamicsStyle.addDef(def);
                    }
                }
                break;
            case "hairpin": {
                dd.volumeString = "?";
                const form = dynam.getAttribute("form");
                if (form === null) {
                    console.error("Cannot process MEI element " + dynam.toXML() + ". Attribute 'form' is missing.");
                    return;
                }
                if (form.getValue() === "cres")
                    dd.transitionToString = "+";
                else if (form.getValue() === "dim")
                    dd.transitionToString = "-";
                else {
                    console.error("Cannot process MEI element " + dynam.toXML() + ". Value of attribute 'form' is neither 'cres' nor 'dim'.");
                    return;
                }
                break;
            }
            default:
                console.error("Unknown MEI dynamics instruction " + dynam.toXML() + ".");
                return;
        }

        if (dd.transitionToString !== null) {
            dd.curvature = 0.0;
            dd.protraction = 0.0;
        }

        // compute the timing
        const timingData = this.computeControlEventTiming(dynam, this.currentPart);
        if (timingData === null)
            return;
        dd.startDate = timingData[0] as number;
        dd.endDate = timingData[1] as number | null;
        const tstamp2 = timingData[2] as Attribute | null;
        const endid = timingData[3] as Attribute | null;

        // read the xml:id
        const id = Helper.getAttribute("id", dynam);
        dd.xmlId = (id === null) ? null : id.getValue();

        // parse the staff attribute
        let dynamicsMap: DynamicsMap | null;
        let att = dynam.getAttribute("part");
        if (att === null)
            att = dynam.getAttribute("staff");
        if ((att === null) || att.getValue() === "" || att.getValue() === "%all") {
            dynamicsMap = this.currentPerformance!.getGlobal()!.getDated()!.getMap(Mpm.DYNAMICS_MAP) as DynamicsMap | null;
            if (dynamicsMap === null) {
                dynamicsMap = this.currentPerformance!.getGlobal()!.getDated()!.addMap(DynamicsMap.createDynamicsMap()!) as DynamicsMap;
                dynamicsMap.addStyleSwitch(0.0, "MEI export");
            }

            this.addDynamicsToMpm(dd, dynamicsMap, endid, tstamp2);
        }
        else {
            let multiIDs = false;
            const staffs = att.getValue().split(/\s+/);

            for (const staff of staffs) {
                const part = this.currentPerformance!.getPart(parseInt(staff));
                if (part === null)
                    continue;

                dynamicsMap = part.getDated()!.getMap(Mpm.DYNAMICS_MAP) as DynamicsMap | null;
                if (dynamicsMap === null) {
                    dynamicsMap = part.getDated()!.addMap(DynamicsMap.createDynamicsMap()!) as DynamicsMap;
                    dynamicsMap.addStyleSwitch(0.0, "MEI export");
                }

                const ddd = dd.clone();
                if ((dd.xmlId !== null) && multiIDs)
                    ddd.xmlId = dd.xmlId + "_meico_" + uuidv4();

                this.addDynamicsToMpm(ddd, dynamicsMap, endid, tstamp2);

                multiIDs = true;
            }
        }
    }

    private addDynamicsToMpm(dynamicsData: DynamicsData, dynamicsMap: DynamicsMap, endid: Attribute | null, tstamp2: Attribute | null): number {
        const previousDynamics = dynamicsMap.getAllElements();

        for (let i = previousDynamics.length - 1; i >= 0; --i) {
            if (previousDynamics[i].getKey() > dynamicsData.startDate)
                continue;

            if (dynamicsData.transitionToString === null) {
                const trans = previousDynamics[i].getValue().getAttribute("transition.to");
                if (trans !== null)
                    trans.setValue(dynamicsData.volumeString!);
            } else {
                const trans = previousDynamics[i].getValue().getAttribute("transition.to");
                if (trans !== null)
                    dynamicsData.volumeString = trans.getValue();
                else
                    dynamicsData.volumeString = previousDynamics[i].getValue().getAttributeValue("volume");
            }
            break;
        }
        if (dynamicsData.volumeString === null)
            dynamicsData.volumeString = "?";

        const index = dynamicsMap.addDynamicsFromData(dynamicsData);
        if (index < 0)
            return index;
        const dynamics = dynamicsMap.getElement(index)!;
        if (dynamicsData.endDate !== null) {
            dynamics.addAttribute(new Attribute("date.end", String(dynamicsData.endDate)));
        } else if (tstamp2 !== null) {
            dynamics.addAttribute(new Attribute("tstamp2", tstamp2.getValue()));
            this.tstamp2s.push(dynamics);
        } else if (endid !== null) {
            dynamics.addAttribute(new Attribute("endid", endid.getValue()));
            this.endids.push(dynamics);
        }

        return index;
    }

    private processTempo(tempo: Element): void {
        const tempoData = this.parseTempo(tempo, this.currentPart);
        if (tempoData === null)
            return;

        // compute the timing or get the necessary data to compute the end date later on
        const timingData = this.computeControlEventTiming(tempo, this.currentPart);
        if (timingData === null)
            return;
        tempoData.startDate = timingData[0] as number;
        tempoData.endDate = timingData[1] as number | null;
        const tstamp2 = timingData[2] as Attribute | null;
        const endid = timingData[3] as Attribute | null;

        // parse the staff attribute (space separated staff numbers)
        let tempoMap: TempoMap | null;
        let att = tempo.getAttribute("part");
        if (att === null)
            att = tempo.getAttribute("staff");
        if ((att === null) || att.getValue() === "" || att.getValue() === "%all") {
            tempoMap = this.currentPerformance!.getGlobal()!.getDated()!.getMap(Mpm.TEMPO_MAP) as TempoMap | null;
            if (tempoMap === null) {
                tempoMap = this.currentPerformance!.getGlobal()!.getDated()!.addMap(TempoMap.createTempoMap()!) as TempoMap;

                if (this.currentPerformance!.getGlobal()!.getHeader()!.getAllStyleTypes().get(Mpm.TEMPO_STYLE) !== undefined)
                    tempoMap.addStyleSwitch(0.0, "MEI export");
            }

            this.addTempoToMpm(tempoData, tempoMap, endid, tstamp2);
        }
        else {
            let multiIDs = false;
            const staffs = att.getValue().split(/\s+/);

            for (const staff of staffs) {
                const part = this.currentPerformance!.getPart(parseInt(staff));
                if (part === null)
                    continue;

                tempoMap = part.getDated()!.getMap(Mpm.TEMPO_MAP) as TempoMap | null;
                if (tempoMap === null) {
                    tempoMap = part.getDated()!.addMap(TempoMap.createTempoMap()!) as TempoMap;
                    tempoMap.addStyleSwitch(0.0, "MEI export");
                }

                const td = tempoData.clone();
                if ((tempoData.xmlId !== null) && multiIDs)
                    td.xmlId = tempoData.xmlId + "_meico_" + uuidv4();

                this.addTempoToMpm(td, tempoMap, endid, tstamp2);
                multiIDs = true;
            }
        }
    }

    private addTempoToMpm(tempoData: TempoData, tempoMap: TempoMap, endid: Attribute | null, tstamp2: Attribute | null): number {
        const previousTempo = tempoMap.getAllElements();

        for (let i = previousTempo.length - 1; i >= 0; --i) {
            if (previousTempo[i].getKey() > tempoData.startDate)
                continue;

            if (tempoData.transitionToString === null) {
                const trans = previousTempo[i].getValue().getAttribute("transition.to");
                if (trans !== null) {
                    trans.setValue(tempoData.bpmString!);
                }
            } else {
                const trans = previousTempo[i].getValue().getAttribute("transition.to");
                if (trans !== null)
                    tempoData.bpmString = trans.getValue();
                else
                    tempoData.bpmString = previousTempo[i].getValue().getAttributeValue("bpm");
            }
            break;
        }

        const index = tempoMap.addTempo(tempoData);
        if (index < 0)
            return index;
        const tempoElement = tempoMap.getElement(index)!;
        if (tempoData.endDate !== null) {
            tempoElement.addAttribute(new Attribute("date.end", String(tempoData.endDate)));
        } else if (tstamp2 !== null) {
            tempoElement.addAttribute(new Attribute("tstamp2", tstamp2.getValue()));
            this.tstamp2s.push(tempoElement);
        } else if (endid !== null) {
            tempoElement.addAttribute(new Attribute("endid", endid.getValue()));
            this.endids.push(tempoElement);
        }

        return index;
    }

    private processArtic(artic: Element): void {
        if (this.currentPart === null)
            return;

        let att = artic.getAttribute("artic.ges");
        const slur = artic.getAttribute("slur");
        if (att === null) {
            att = artic.getAttribute("artic");
            if ((att === null) && (slur === null))
                return;
        }

        // get the xmlid
        let xmlid: string | null = null;
        const articId = Helper.getAttribute("id", artic);
        if (articId !== null)
            xmlid = articId.getValue();

        // make sure there is a styleDef in MPM for articulation definitions
        let articulationStyle = this.currentPerformance!.getGlobal()!.getHeader()!.getStyleDef(Mpm.ARTICULATION_STYLE, "MEI export") as ArticulationStyle | null;
        if (articulationStyle === null) {
            articulationStyle = this.currentPerformance!.getGlobal()!.getHeader()!.addStyleDef(Mpm.ARTICULATION_STYLE, "MEI export") as ArticulationStyle | null;
            const nonlegatoDef = ArticulationDef.createDefaultArticulationDef("nonlegato");
            if (nonlegatoDef !== null) articulationStyle!.addDef(nonlegatoDef);
        }

        // find the local articulationMap
        const date = this.getMidiTime();
        const part = this.currentPerformance!.getPart(parseInt(this.currentPart.getAttributeValue("number")!));
        let map = part!.getDated()!.getMap(Mpm.ARTICULATION_MAP) as ArticulationMap | null;
        if (map === null) {
            map = part!.getDated()!.addMap(ArticulationMap.createArticulationMap()!) as ArticulationMap;
            map.addArticulationStyleSwitch(0.0, "MEI export", "nonlegato");
        }

        for (let parent: Element | null = artic; (parent !== null) && (parent !== this.mei!.getRootElement()); parent = parent.getParent() as Element | null) {
            if (parent.getLocalName() === "note") {
                let noteId = Helper.getAttributeValue("id", parent);
                if (noteId === "") {
                    noteId = "meico_" + uuidv4();
                    parent.addAttribute(new Attribute("xml:id", "http://www.w3.org/XML/1998/namespace", noteId));
                }
                if (att !== null)
                    this.addArticulationToMap(date, att.getValue(), xmlid, noteId, map, articulationStyle!);
                if (slur !== null) {
                    const slurid = (artic.getAttribute("slurid") === null) ? null : artic.getAttributeValue("slurid");
                    if (slur.getValue().includes("t"))
                        this.addArticulationToMap(date, "legatoStop", slurid, noteId, map, articulationStyle!);
                    else if (slur.getValue().includes("i") || slur.getValue().includes("m"))
                        this.addArticulationToMap(date, "legato", slurid, noteId, map, articulationStyle!);
                }
                return;
            }
            if (parent.getLocalName() === "chord") {
                let multiIDs = false;
                let multiSlurIDs = false;
                const notes = parent.query("descendant::*[local-name()='note']");
                for (let i = 0; i < notes.size(); ++i) {
                    const note = notes.get(i) as unknown as Element;
                    const subArtics = note.query("descendant::*[local-name()='artic']");
                    if ((note.getAttribute("artic") !== null) || (note.getAttribute("artic.ges") !== null) || (subArtics.size() > 0))
                        continue;

                    if (note.getAttribute("date") !== null) {
                        const noteId = Helper.getAttributeValue("id", note);
                        if (att !== null) {
                            this.addArticulationToMap(date, att.getValue(), ((xmlid === null) ? null : (xmlid + ((multiIDs) ? ("_meico_" + uuidv4()) : ""))), noteId, map, articulationStyle!);
                            multiIDs = true;
                        }
                        if (slur !== null) {
                            let slurid: string | null = null;
                            if (artic.getAttribute("slurid") !== null) {
                                slurid = artic.getAttributeValue("slurid")!;
                                note.addAttribute(new Attribute("slurid", (multiSlurIDs) ? slurid + "_meico_" + uuidv4() : slurid));
                                multiSlurIDs = true;
                            }
                            if (slur.getValue().includes("t"))
                                this.addArticulationToMap(date, "legatoStop", slurid, noteId, map, articulationStyle!);
                            else if (slur.getValue().includes("i") || slur.getValue().includes("m"))
                                this.addArticulationToMap(date, "legato", slurid, noteId, map, articulationStyle!);
                        }
                    } else {
                        if (att !== null) {
                            const newArtic = new Element("artic");
                            newArtic.addAttribute(new Attribute(att.getLocalName(), att.getValue()));
                            if (xmlid !== null)
                                newArtic.addAttribute(new Attribute("xml:id", "http://www.w3.org/XML/1998/namespace", xmlid + ((multiIDs) ? ("_meico_" + uuidv4()) : "")));
                            note.appendChild(newArtic);
                            multiIDs = true;
                        }
                        if (slur !== null) {
                            note.addAttribute(new Attribute("slur", slur.getValue()));
                            if (artic.getAttribute("slurid") !== null) {
                                const slurid = artic.getAttributeValue("slurid")!;
                                note.addAttribute(new Attribute("slurid", (multiSlurIDs) ? slurid + "_meico_" + uuidv4() : slurid));
                                multiSlurIDs = true;
                            }
                        }
                    }
                }
                return;
            }
            if (((parent === this.currentLayer) || parent.getLocalName() === "staff" || (parent === this.currentMeasure))
                    && (att !== null)) {
                this.addArticulationToMap(date, att.getValue(), xmlid, null, map, articulationStyle!);
                return;
            }
        }
    }

    private addArticulationToMap(date: number, articulation: string, id: string | null, noteid: string | null, articulationMap: ArticulationMap, articulationStyle: ArticulationStyle): void {
        const articulations = articulation.trim().split(/\s+/);

        for (const artic of articulations) {
            if (articulationStyle.getDef(artic) === undefined) {
                const def = ArticulationDef.createDefaultArticulationDef(artic);
                if (def === null) {
                    console.error("Failed to generate articulationDef for \"" + artic + "\".");
                    continue;
                }
                articulationStyle.addDef(def);
            }
            articulationMap.addArticulation(date, artic, ((noteid === null) ? null : ("#" + noteid)), id);
        }
    }

    private processBreath(breath: Element): void {
        if (this.currentMeasure === null)
            return;

        // get the xmlid
        let xmlid: string | null = null;
        const id = Helper.getAttribute("id", breath);
        if (id !== null)
            xmlid = id.getValue();

        // the breath must specify the notes/chords that precede it
        let prevs: string[] | null = null;
        let att = breath.getAttribute("prev");
        if (att === null) {
            att = breath.getAttribute("follows");
            if (att === null) {
                att = breath.getAttribute("startid");
                if (att === null) {
                    att = breath.getAttribute("tstamp.ges");
                    if (att === null) {
                        att = breath.getAttribute("tstamp");
                        if (att === null) {
                            console.error("Cannot process MEI element " + breath.toXML() + ". At least one of the attributes 'prev', 'follows' or 'startid' should be specified to indicate the preceding notes or chords affected by the breath. Alternatively, but not recommended(!), attribute 'tstamp.ges' or 'tstamp' may be defined at the risk that the breath does not coincide with a note's date and will, thus, have no effect on the music.");
                            return;
                        }
                    }

                    // create the articulation from tstamp/tstamp.ges
                    console.log("MEI element " + breath.toXML() + " is not associated with a note or chord. If its 'tstamp.ges' or 'tstamp' does not coincide with a note it will have no effect on the music!");
                    const tstamp = att.getValue();

                    // make sure there is a styleDef in MPM for articulation definitions
                    let articulationStyle = this.currentPerformance!.getGlobal()!.getHeader()!.getStyleDef(Mpm.ARTICULATION_STYLE, "MEI export") as ArticulationStyle | null;
                    if (articulationStyle === null) {
                        articulationStyle = this.currentPerformance!.getGlobal()!.getHeader()!.addStyleDef(Mpm.ARTICULATION_STYLE, "MEI export") as ArticulationStyle | null;
                        articulationStyle!.getDef("defaultArticulation");
                    }

                    // find or generate the required articulationMaps
                    let articulationMap: ArticulationMap | null;
                    att = breath.getAttribute("part");
                    if (att === null)
                        att = breath.getAttribute("staff");
                    if ((att === null) || att.getValue() === "" || att.getValue() === "%all") {
                        articulationMap = this.currentPerformance!.getGlobal()!.getDated()!.getMap(Mpm.ARTICULATION_MAP) as ArticulationMap | null;
                        if (articulationMap === null) {
                            articulationMap = this.currentPerformance!.getGlobal()!.getDated()!.addMap(ArticulationMap.createArticulationMap()!) as ArticulationMap;
                            articulationMap.addArticulationStyleSwitch(0.0, "MEI export", "nonlegato");
                        }
                        const date = this.tstampToTicks(tstamp, this.currentPart);
                        this.addArticulationToMap(date, "breath", xmlid, null, articulationMap, articulationStyle!);
                    }
                    else {
                        const staffs = att.getValue().split(/\s+/);
                        let multiIds = false;

                        for (const staff of staffs) {
                            const mpmPart = this.currentPerformance!.getPart(parseInt(staff));
                            if (mpmPart === null)
                                continue;

                            articulationMap = mpmPart.getDated()!.getMap(Mpm.ARTICULATION_MAP) as ArticulationMap | null;
                            if (articulationMap === null) {
                                articulationMap = mpmPart.getDated()!.addMap(ArticulationMap.createArticulationMap()!) as ArticulationMap;
                                articulationMap.addArticulationStyleSwitch(0.0, "MEI export", "nonlegato");
                            }

                            // find corresponding MSM part
                            let msmPart: Element | null = null;
                            const parts = this.currentMsmMovement!.getChildElements("part");
                            for (let p = 0; p < parts.size(); ++p) {
                                if (parts.get(p).getAttributeValue("number") === staff) {
                                    msmPart = parts.get(p);
                                    break;
                                }
                            }

                            const date = this.tstampToTicks(tstamp, msmPart);
                            this.addArticulationToMap(date, "breath", (xmlid === null) ? null : ((multiIds) ? (xmlid + "_meico_" + uuidv4()) : xmlid), null, articulationMap, articulationStyle!);
                            multiIds = true;
                        }
                    }
                    return;
                }
            }
        }
        prevs = att.getValue().trim().replace(/#/g, "").split(/\s+/);

        // create breath articulations in MEI and add them to the notes/chords indicated by their ids
        let multiIds = false;
        for (const prev of prevs) {
            const note = this.allNotesAndChords.get(prev);
            if (note !== undefined) {
                const articElem = new Element("artic");
                articElem.addAttribute(new Attribute("artic.ges", "breath"));
                if (xmlid !== null) {
                    articElem.addAttribute(new Attribute("xml:id", "http://www.w3.org/XML/1998/namespace", ((multiIds) ? (xmlid + "_meico_" + uuidv4()) : xmlid)));
                    multiIds = true;
                }
                note.appendChild(articElem);
            }
        }
    }

    private processTie(tie: Element): void {
        if ((this.currentMeasure === null) || (tie.getAttribute("startid") === null) || (tie.getAttribute("endid") === null))
            return;

        let note = this.allNotesAndChords.get(tie.getAttributeValue("startid")!.trim().replace(/#/g, ""));
        if (note !== undefined) {
            const a = note.getAttribute("tie");
            if (a !== null) {
                if (a.getValue() === "t") a.setValue("m");
                else if (a.getValue() === "n") a.setValue("i");
            } else {
                note.addAttribute(new Attribute("tie", "i"));
            }
        }

        note = this.allNotesAndChords.get(tie.getAttributeValue("endid")!.trim().replace(/#/g, ""));
        if (note !== undefined) {
            const a = note.getAttribute("tie");
            if (a !== null) {
                if (a.getValue() === "i") a.setValue("m");
                else if (a.getValue() === "n") a.setValue("t");
            } else {
                note.addAttribute(new Attribute("tie", "t"));
            }
        }
    }

    private processSlur(slur: Element): void {
        if (this.currentMeasure === null) return;
        // Simplified -- the full implementation handles plist, tstamp2, endid, staff assignment, etc.
        const timingData = this.computeControlEventTiming(slur, this.currentPart);
        if (timingData === null) return;
        const date = timingData[0] as number;
        const endDate = timingData[1] as number | null;
        const tstamp2 = timingData[2] as Attribute | null;
        const endid = timingData[3] as Attribute | null;

        const slurMisc = new Element("slur");
        slurMisc.addAttribute(new Attribute("date", String(date)));
        Helper.copyId(slur, slurMisc);
        if (endid !== null) { slurMisc.addAttribute(new Attribute("endid", endid.getValue())); this.endids.push(slurMisc); }
        if (endDate !== null) slurMisc.addAttribute(new Attribute("date.end", String(endDate)));
        if (tstamp2 !== null) { slurMisc.addAttribute(new Attribute("tstamp2", tstamp2.getValue())); this.tstamp2s.push(slurMisc); }

        const miscMap = this.currentMsmMovement!.getFirstChildElement("global")!.getFirstChildElement("dated")!.getFirstChildElement("miscMap")!;
        Helper.addToMap(slurMisc, miscMap);
    }

    private processReh(reh: Element): void {
        let markerMap = (this.currentPart === null) ? null : this.currentPart.getFirstChildElement("dated")?.getFirstChildElement("markerMap") ?? null;
        if (markerMap === null)
            markerMap = (this.currentMsmMovement === null) ? null : this.currentMsmMovement.getFirstChildElement("global")?.getFirstChildElement("dated")?.getFirstChildElement("markerMap") ?? null;
        if (markerMap === null) return;

        const marker = new Element("marker");
        Helper.copyId(reh, marker);
        marker.addAttribute(new Attribute("date", this.getMidiTimeAsString()));
        marker.addAttribute(new Attribute("message", reh.getValue()));
        this.addLayerAttribute(marker);
        Helper.addToMap(marker, markerMap);
    }

    private processBeatRpt(_beatRpt: Element): void {
        let es = this.currentPart!.getFirstChildElement("dated")!.getFirstChildElement("timeSignatureMap")!.getChildElements("timeSignature");
        if (es.size() === 0) {
            es = this.currentMsmMovement!.getFirstChildElement("global")!.getFirstChildElement("dated")!.getFirstChildElement("timeSignatureMap")!.getChildElements("timeSignature");
        }
        let beatLength = (es.size() === 0) ? 4 : parseFloat(es.get(es.size() - 1).getAttributeValue("denominator")!);
        beatLength = (4.0 * this.ppq) / beatLength;
        this.processRepeat(beatLength);
    }

    private processMRpt(_mRpt: Element): void {
        this.processRepeat(this.getOneMeasureLength(this.currentPart));
    }

    private processMRpt2(_mRpt2: Element): void {
        const timeframe = this.getOneMeasureLength(this.currentPart);
        // Simplified -- full implementation handles time signature changes across measures
        this.processRepeat(timeframe);
    }

    private processMultiRpt(multiRpt: Element): void {
        // Simplified -- full implementation handles time signature changes
        const numMeasures = (multiRpt.getAttribute("num") === null) ? 1 : parseInt(multiRpt.getAttributeValue("num")!);
        const measureLength = this.getOneMeasureLength(this.currentPart);
        this.processRepeat(measureLength * numMeasures);
    }

    private processHalfmRpt(_halfmRpt: Element): void {
        this.processRepeat(0.5 * this.getOneMeasureLength(this.currentPart));
    }

    private processRepeat(timeframe: number): void {
        if ((this.currentPart === null)
            || (this.currentPart.getFirstChildElement("dated")!.getFirstChildElement("score")!.getChildElements().size() === 0)) {
            return;
        }

        const currentDate = parseFloat(this.currentPart.getAttributeValue("currentDate")!);
        const startDate = currentDate - timeframe;
        const layer = Mei.getLayerId(this.currentLayer);
        const els: Element[] = [];

        const scoreChildren = this.currentPart.getFirstChildElement("dated")!.getFirstChildElement("score")!.getChildElements();
        for (let idx = scoreChildren.size() - 1; idx >= 0; --idx) {
            const e = scoreChildren.get(idx);
            const date = parseFloat(e.getAttributeValue("date")!);
            if (date < startDate) break;
            if (layer === "" || ((e.getAttribute("layer") !== null) && e.getAttributeValue("layer") === layer)) {
                const copy = Helper.cloneElement(e)!;
                copy.getAttribute("date")!.setValue(String(date + timeframe));
                const idCopy = Helper.getAttribute("id", copy);
                if (idCopy !== null) idCopy.setValue("meico_repeats_" + idCopy.getValue() + "_" + uuidv4());
                els.unshift(copy);
            }
        }

        for (const el of els) {
            Helper.addToMap(el, this.currentPart.getFirstChildElement("dated")!.getFirstChildElement("score")!);
        }

        this.currentPart.getAttribute("currentDate")!.setValue(String(currentDate + timeframe));
    }

    private processMeasureRest(mRest: Element): void {
        if (this.currentPart === null) return;
        const rest = this.makeMeasureRest(mRest);
        if (rest === null) return;
        Helper.addToMap(rest, this.currentPart.getFirstChildElement("dated")!.getFirstChildElement("score")!);
        this.currentPart.getAttribute("currentDate")!.setValue(String(parseFloat(this.currentPart.getAttributeValue("currentDate")!) + parseFloat(rest.getAttributeValue("duration")!)));
    }

    private makeMeasureRest(meiMRest: Element): Element | null {
        const rest = new Element("rest");
        Helper.copyId(meiMRest, rest);
        let dur = 0.0;

        if ((this.currentPart !== null) && (this.currentPart.getFirstChildElement("dated")!.getFirstChildElement("timeSignatureMap")!.getFirstChildElement("timeSignature") !== null)) {
            const es = this.currentPart.getFirstChildElement("dated")!.getFirstChildElement("timeSignatureMap")!.getChildElements("timeSignature");
            dur = (4.0 * this.ppq * parseFloat(es.get(es.size() - 1).getAttributeValue("numerator")!)) / parseFloat(es.get(es.size() - 1).getAttributeValue("denominator")!);
        } else if (this.currentMsmMovement!.getFirstChildElement("global")!.getFirstChildElement("dated")!.getFirstChildElement("timeSignatureMap")!.getFirstChildElement("timeSignature") !== null) {
            const es = this.currentMsmMovement!.getFirstChildElement("global")!.getFirstChildElement("dated")!.getFirstChildElement("timeSignatureMap")!.getChildElements("timeSignature");
            dur = (4.0 * this.ppq * parseFloat(es.get(es.size() - 1).getAttributeValue("numerator")!)) / parseFloat(es.get(es.size() - 1).getAttributeValue("denominator")!);
        }
        if (dur === 0.0) return null;

        rest.addAttribute(new Attribute("date", this.getMidiTimeAsString()));
        rest.addAttribute(new Attribute("duration", String(dur)));
        this.addLayerAttribute(rest);
        return rest;
    }

    private processMultiRest(multiRest: Element): void {
        if (this.currentPart === null) return;
        const rest = this.makeMeasureRest(multiRest);
        if (rest === null) return;
        rest.addAttribute(new Attribute("date", this.getMidiTimeAsString()));
        Helper.addToMap(rest, this.currentPart.getFirstChildElement("dated")!.getFirstChildElement("score")!);
        const num = (multiRest.getAttribute("num") === null) ? 1 : parseInt(multiRest.getAttributeValue("num")!);
        if (num > 1)
            rest.getAttribute("duration")!.setValue(String(parseFloat(rest.getAttributeValue("duration")!) * num));
        this.currentPart.getAttribute("currentDate")!.setValue(String(parseFloat(this.currentPart.getAttributeValue("currentDate")!) + parseFloat(rest.getAttributeValue("duration")!)));
    }

    private processRest(rest: Element): void {
        const s = new Element("rest");
        Helper.copyId(rest, s);
        s.addAttribute(new Attribute("date", this.getMidiTimeAsString()));
        const dur = this.computeDuration(rest);
        if (dur === 0.0) return;
        s.addAttribute(new Attribute("duration", String(dur)));
        this.addLayerAttribute(s);
        this.currentPart!.getAttribute("currentDate")!.setValue(String(parseFloat(this.currentPart!.getAttributeValue("currentDate")!) + dur));
        Helper.addToMap(s, this.currentPart!.getFirstChildElement("dated")!.getFirstChildElement("score")!);
        rest.addAttribute(new Attribute("date", s.getAttributeValue("date")!));
        rest.addAttribute(new Attribute("midi.dur", s.getAttributeValue("duration")!));
    }

    private processSpace(space: Element): void {
        for (let parent: Element | null = space.getParent(); parent !== null; parent = parent.getParent()) {
            switch (parent.getLocalName()) {
                case "refrain": case "syllable": case "verse": case "volta": return;
            }
            if (parent.getLocalName() === "layer" || parent.getLocalName() === "measure" || parent.getLocalName() === "section" || parent.getLocalName() === "score" || parent.getLocalName() === "mdiv" || parent.getLocalName() === "body")
                break;
        }
        this.processRest(space);
    }

    private processOctave(octave: Element): void {
        if ((octave.getAttribute("dis") === null) || (octave.getAttribute("dis.place") === null)) {
            console.error("Cannot process MEI element " + octave.toXML() + ". Missing attribute 'dis' or 'dis.place'.");
            return;
        }

        let result: number;
        switch (octave.getAttributeValue("dis")) {
            case "8":  result = 12.0; break;
            case "15": result = 24.0; break;
            case "22": result = 36.0; break;
            default:
                console.error("An invalid octave transposition occured (dis=" + octave.getAttributeValue("dis") + ").");
                return;
        }

        if (octave.getAttributeValue("dis.place") === "below") { result = -result; }
        else if (octave.getAttributeValue("dis.place") !== "above") {
            console.error("An invalid octave transposition occured (dis.place=" + octave.getAttributeValue("dis.place") + ").");
            return;
        }

        const timingData = this.computeControlEventTiming(octave, this.currentPart);
        if (timingData === null) return;
        const date = timingData[0] as number;
        const endDate = timingData[1] as number | null;
        const tstamp2 = timingData[2] as Attribute | null;
        const endid = timingData[3] as Attribute | null;

        let att = octave.getAttribute("part");
        if (att === null) att = octave.getAttribute("staff");
        if ((att === null) || att.getValue() === "" || att.getValue() === "%all") {
            const trans = new Element("addTransposition");
            trans.addAttribute(new Attribute("date", String(date)));
            trans.addAttribute(new Attribute("semi", String(result)));
            Helper.copyId(octave, trans);
            if (endDate !== null) { trans.addAttribute(new Attribute("date.end", String(endDate))); }
            else if (tstamp2 !== null) { trans.addAttribute(new Attribute("tstamp2", tstamp2.getValue())); this.tstamp2s.push(trans); }
            else if (endid !== null) { trans.addAttribute(new Attribute("endid", endid.getValue())); this.endids.push(trans); }
            const miscMap = this.currentMsmMovement!.getFirstChildElement("global")!.getFirstChildElement("dated")!.getFirstChildElement("miscMap")!;
            Helper.addToMap(trans, miscMap);
        } else {
            const staffString = att.getValue();
            const staffs = staffString.split(/\s+/);
            let multiIDs = false;
            const parts = this.currentMsmMovement!.getChildElements("part");
            for (const staff of staffs) {
                for (let p = 0; p < parts.size(); ++p) {
                    if (parts.get(p).getAttributeValue("number") !== staff) continue;
                    const trans = new Element("addTransposition");
                    trans.addAttribute(new Attribute("date", String(date)));
                    trans.addAttribute(new Attribute("semi", String(result)));
                    Helper.copyId(octave, trans);
                    const transId = trans.getAttribute("id", "http://www.w3.org/XML/1998/namespace");
                    if (transId !== null) transId.setValue(transId.getValue() + ((multiIDs) ? "_meico_" + uuidv4() : ""));
                    if (endDate !== null) { trans.addAttribute(new Attribute("date.end", String(endDate))); }
                    else if (tstamp2 !== null) { trans.addAttribute(new Attribute("tstamp2", tstamp2.getValue())); this.tstamp2s.push(trans); }
                    else if (endid !== null) { trans.addAttribute(new Attribute("endid", endid.getValue())); this.endids.push(trans); }
                    const miscMap = parts.get(p).getFirstChildElement("dated")!.getFirstChildElement("miscMap")!;
                    Helper.addToMap(trans, miscMap);
                    this.addLayerAttribute(trans);
                    multiIDs = true;
                }
            }
        }
    }

    private processPedal(pedal: Element): void {
        if (pedal.getAttribute("dir") === null) {
            console.error("Cannot process MEI element " + pedal.toXML() + ". Missing attribute 'dir'.");
            return;
        }
        const timingData = this.computeControlEventTiming(pedal, this.currentPart);
        if (timingData === null) return;
        const date = timingData[0] as number;
        const endDate = timingData[1] as number | null;
        const tstamp2 = timingData[2] as Attribute | null;
        const endid = timingData[3] as Attribute | null;

        let att = pedal.getAttribute("part");
        if (att === null) att = pedal.getAttribute("staff");
        if ((att === null) || att.getValue() === "" || att.getValue() === "%all") {
            const pedalMapEntry = new Element("pedal");
            pedalMapEntry.addAttribute(new Attribute("date", String(date)));
            pedalMapEntry.addAttribute(new Attribute("state", pedal.getAttributeValue("dir")!));
            Helper.copyId(pedal, pedalMapEntry);
            if (endDate !== null) { pedalMapEntry.addAttribute(new Attribute("date.end", String(endDate))); }
            else if (tstamp2 !== null) { pedalMapEntry.addAttribute(new Attribute("tstamp2", tstamp2.getValue())); this.tstamp2s.push(pedalMapEntry); }
            else if (endid !== null) { pedalMapEntry.addAttribute(new Attribute("endid", endid.getValue())); this.endids.push(pedalMapEntry); }
            const pedalMap = this.currentMsmMovement!.getFirstChildElement("global")!.getFirstChildElement("dated")!.getFirstChildElement("pedalMap")!;
            Helper.addToMap(pedalMapEntry, pedalMap);
        } else {
            const staffString = att.getValue();
            const staffs = staffString.split(/\s+/);
            let multiIDs = false;
            const parts = this.currentMsmMovement!.getChildElements("part");
            for (const staff of staffs) {
                for (let p = 0; p < parts.size(); ++p) {
                    if (parts.get(p).getAttributeValue("number") !== staff) continue;
                    const pedalMapEntry = new Element("pedal");
                    pedalMapEntry.addAttribute(new Attribute("date", String(date)));
                    pedalMapEntry.addAttribute(new Attribute("state", pedal.getAttributeValue("dir")!));
                    Helper.copyId(pedal, pedalMapEntry);
                    const pId = pedalMapEntry.getAttribute("id", "http://www.w3.org/XML/1998/namespace");
                    if (pId !== null) pId.setValue(pId.getValue() + ((multiIDs) ? "_meico_" + uuidv4() : ""));
                    if (endDate !== null) { pedalMapEntry.addAttribute(new Attribute("date.end", String(endDate))); }
                    else if (tstamp2 !== null) { pedalMapEntry.addAttribute(new Attribute("tstamp2", tstamp2.getValue())); this.tstamp2s.push(pedalMapEntry); }
                    else if (endid !== null) { pedalMapEntry.addAttribute(new Attribute("endid", endid.getValue())); this.endids.push(pedalMapEntry); }
                    const pedalMap = parts.get(p).getFirstChildElement("dated")!.getFirstChildElement("pedalMap")!;
                    Helper.addToMap(pedalMapEntry, pedalMap);
                    this.addLayerAttribute(pedalMapEntry);
                    multiIDs = true;
                }
            }
        }
    }

    private processNote(note: Element): void {
        if (this.currentPart === null) return;

        if ((this.currentChord !== null) && (this.currentChord.getAttribute("hasArticulations") !== null) && (Helper.getAttribute("id", note) === null)) {
            note.addAttribute(new Attribute("xml:id", "http://www.w3.org/XML/1998/namespace", "meico_" + uuidv4()));
        }

        this.convertElement(note);
        this.checkSlurs(note);
        this.processArtic(note);

        const date = this.getMidiTime();
        const s = new Element("note");
        Helper.copyId(note, s);
        s.addAttribute(new Attribute("date", String(date)));

        const pitchdata: string[] = [];
        const pitch = this.computePitch(note, pitchdata);
        if (pitch === -1) return;
        s.addAttribute(new Attribute("midi.pitch", String(pitch)));
        s.addAttribute(new Attribute("pitchname", pitchdata[0]));
        s.addAttribute(new Attribute("accidentals", pitchdata[1]));
        s.addAttribute(new Attribute("octave", pitchdata[2]));

        if (note.getAttribute("accid") !== null) {
            this.accid.push(note);
        }

        const dur = this.computeDuration(note);
        s.addAttribute(new Attribute("duration", String(dur)));

        if (this.currentChord === null)
            this.currentPart!.getAttribute("currentDate")!.setValue(String(date + dur));

        note.addAttribute(new Attribute("pnum", String(pitch)));
        note.addAttribute(new Attribute("date", String(date)));
        note.addAttribute(new Attribute("midi.dur", String(dur)));

        // handle ties
        let tie = 'n';
        const tieAtt = note.getAttribute("tie");
        if (tieAtt !== null) { tie = tieAtt.getValue().charAt(0); }
        else if ((this.currentChord !== null) && (this.currentChord.getAttribute("tie") !== null)) {
            tie = this.currentChord.getAttributeValue("tie")!.charAt(0);
        }
        switch (tie) {
            case 'n': break;
            case 'i':
                s.addAttribute(new Attribute("tie", "true"));
                break;
            case 'm':
            case 't': {
                const ps = this.currentPart!.getFirstChildElement("dated")!.getFirstChildElement("score")!.query("descendant::*[local-name()='note' and @tie]");
                for (let i = ps.size() - 1; i >= 0; --i) {
                    const p = ps.get(i) as unknown as Element;
                    if (p.getAttributeValue("midi.pitch") === s.getAttributeValue("midi.pitch")
                        && ((parseFloat(p.getAttributeValue("date")!) + parseFloat(p.getAttributeValue("duration")!)) === date)) {
                        p.addAttribute(new Attribute("duration", String(parseFloat(p.getAttributeValue("duration")!) + dur)));
                        if (tie === 't')
                            p.removeAttribute(p.getAttribute("tie")!);
                        return;
                    }
                }
            }
        }

        // handle lyrics
        for (const lyricsElem of this.lyrics) {
            s.appendChild(lyricsElem);
        }
        this.lyrics = [];

        this.addLayerAttribute(s);
        Helper.addToMap(s, this.currentPart!.getFirstChildElement("dated")!.getFirstChildElement("score")!);
    }

    protected reset(): void {
        this.endingCounter = 0;
        this.currentMsmMovement = null;
        this.currentMdiv = null;
        this.currentWork = null;
        this.currentPerformance = null;
        this.currentPart = null;
        this.currentLayer = null;
        this.currentMeasure = null;
        this.currentChord = null;
        this.accid = [];
        this.endids = [];
        this.tstamp2s = [];
        this.lyrics = [];
        this.allNotesAndChords.clear();
    }

    public indexNotesAndChords(mdiv: Element): void {
        this.allNotesAndChords.clear();
        const nodes = mdiv.query("descendant::*[(local-name()='note' or local-name()='chord') and attribute::xml:id]");
        for (let i = 0; i < nodes.size(); ++i) {
            const node = nodes.get(i) as unknown as Element;
            this.allNotesAndChords.set(Helper.getAttributeValue("id", node), node);
        }
    }

    protected getMidiTime(): number {
        if (this.currentPart !== null) return parseFloat(this.currentPart.getAttributeValue("currentDate")!);
        if (this.currentMeasure !== null) return parseFloat(this.currentMeasure.getAttributeValue("date")!);
        if (this.currentMsmMovement === null) return 0.0;

        const parts = this.currentMsmMovement.getChildElements("part");
        let latestDate = 0.0;
        for (let i = parts.size() - 1; i >= 0; --i) {
            const date = parseFloat(parts.get(i).getAttributeValue("currentDate")!);
            if (latestDate < date) latestDate = date;
        }
        return latestDate;
    }

    protected getMidiTimeAsString(): string {
        if (this.currentPart !== null) return this.currentPart.getAttributeValue("currentDate")!;
        if (this.currentMeasure !== null) return this.currentMeasure.getAttributeValue("date")!;
        if (this.currentMsmMovement === null) return "0.0";

        const parts = this.currentMsmMovement.getChildElements("part");
        let latestDate = 0.0;
        for (let i = parts.size() - 1; i >= 0; --i) {
            const date = parseFloat(parts.get(i).getAttributeValue("currentDate")!);
            if (latestDate < date) latestDate = date;
        }
        return String(latestDate);
    }

    protected getOneMeasureLength(msmPartContext: Element | null): number {
        const ts = this.getCurrentTimeSignature(msmPartContext);
        return (4.0 * this.ppq * ts[0]) / ts[1];
    }

    protected getCurrentTimeSignature(msmPartContext: Element | null): number[] {
        let es: Elements | null = null;
        if (msmPartContext !== null)
            es = msmPartContext.getFirstChildElement("dated")!.getFirstChildElement("timeSignatureMap")!.getChildElements();
        if ((es === null) || (es.size() === 0))
            es = this.currentMsmMovement!.getFirstChildElement("global")!.getFirstChildElement("dated")!.getFirstChildElement("timeSignatureMap")!.getChildElements();
        if ((es.size() === 0) && (this.currentWork !== null)) {
            const meter = this.currentWork.getFirstChildElement("meter");
            if (meter !== null) {
                const count = meter.getAttribute("count");
                const unit = meter.getAttribute("unit");
                return [((count === null) ? 4.0 : parseFloat(count.getValue())), ((unit === null) ? 4.0 : parseFloat(unit.getValue()))];
            }
        }

        const denom = (es.size() === 0) ? 4.0 : parseFloat(es.get(es.size() - 1).getAttributeValue("denominator")!);
        const num = (es.size() === 0) ? 4.0 : parseFloat(es.get(es.size() - 1).getAttributeValue("numerator")!);

        return [num, denom];
    }

    protected computeMeasureLength(numerator: number, denominator: number): number {
        return (4.0 * this.ppq * numerator) / denominator;
    }

    protected getPart(id: string): Element | null {
        if (id === null || id === "") return null;
        const parts = this.currentMsmMovement!.getChildElements("part");
        for (let i = parts.size() - 1; i >= 0; --i) {
            if (parts.get(i).getAttributeValue("number") === id || Helper.getAttributeValue("id", parts.get(i)) === id)
                return parts.get(i);
        }
        return null;
    }

    protected addLayerAttribute(toThis: Element): void {
        const layer = this.currentLayer;
        if (layer === null) return;
        if (layer.getAttribute("def") !== null) {
            toThis.addAttribute(new Attribute("layer", layer.getAttributeValue("def")!));
        } else if (layer.getAttribute("n") !== null)
            toThis.addAttribute(new Attribute("layer", layer.getAttributeValue("n")!));
    }

    public parseTempo(tempo: Element, msmPartContext: Element | null): TempoData | null {
        const tempoData = new TempoData();

        // determine numeric tempo if such a value is specified
        const mm = tempo.getAttribute("mm");
        if (mm !== null) tempoData.bpmString = mm.getValue();
        else {
            const midiBpm = tempo.getAttribute("midi.bpm");
            if (midiBpm !== null) tempoData.bpmString = midiBpm.getValue();
            else {
                const midiMspb = tempo.getAttribute("midi.mspb");
                if (midiMspb !== null) tempoData.bpmString = String(60000000.0 / parseFloat(midiMspb.getValue()));
            }
        }

        // compute beatLength
        const mmUnit = tempo.getAttribute("mm.unit");
        tempoData.beatLength = (mmUnit !== null) ? Helper.duration2decimal(mmUnit.getValue()) : (1.0 / this.getCurrentTimeSignature(msmPartContext)[1]);
        const mmDots = tempo.getAttribute("mm.dots");
        if (mmDots !== null) {
            let dots = parseInt(mmDots.getValue());
            for (let d = tempoData.beatLength; dots > 0; --dots) { d /= 2; tempoData.beatLength += d; }
        }

        // process tempo descriptor
        let descriptor = tempo.getValue();
        if (descriptor === "") {
            const label = tempo.getAttribute("label");
            if (label !== null) descriptor = label.getValue();
        }
        if (descriptor !== "") {
            if (descriptor.includes("rit") || descriptor.includes("rall") || descriptor.includes("largando") || descriptor.includes("calando")) {
                if (tempoData.bpmString === null) tempoData.bpmString = "?";
                tempoData.transitionToString = "-";
            } else if (descriptor.includes("accel") || descriptor.includes("string")) {
                if (tempoData.bpmString === null) tempoData.bpmString = "?";
                tempoData.transitionToString = "+";
            } else {
                // this instruction might be added to the global styleDef
                let tempoStyle = this.currentPerformance!.getGlobal()!.getHeader()!.getStyleDef(Mpm.TEMPO_STYLE, "MEI export") as TempoStyle | null;
                if (tempoStyle === null)
                    tempoStyle = this.currentPerformance!.getGlobal()!.getHeader()!.addStyleDef(Mpm.TEMPO_STYLE, "MEI export") as TempoStyle | null;

                if ((tempoStyle !== null) && (tempoStyle.getDef(descriptor) === undefined)) {
                    let tempoDef: TempoDef | null;
                    if (tempoData.bpmString === null)
                        tempoDef = TempoDef.createDefaultTempoDef(descriptor);
                    else
                        tempoDef = TempoDef.createTempoDef(descriptor, parseFloat(tempoData.bpmString));
                    if (tempoDef !== null) tempoStyle.addDef(tempoDef);
                }
                tempoData.bpmString = descriptor;
            }
        }
        if (tempoData.bpmString === null) {
            console.error("Cannot process MEI element " + tempo.toXML() + ". No text or any of the attributes 'mm', 'midi.bpm', 'midi.mspb', or 'label' is specified.");
            return null;
        }

        if (tempoData.transitionToString !== null) tempoData.meanTempoAt = 0.5;

        const id = Helper.getAttribute("id", tempo);
        tempoData.xmlId = (id === null) ? null : id.getValue();

        return tempoData;
    }

    private getEndid(id: string): number {
        for (let i = 0; i < this.endids.length; ++i) {
            if (this.endids[i].getAttributeValue("endid") === id) return i;
        }
        return -1;
    }

    protected checkEndid(e: Element): void {
        const id = "#" + Helper.getAttributeValue("id", e);
        for (let j = this.getEndid(id); j >= 0; j = this.getEndid(id)) {
            this.endids[j].addAttribute(new Attribute("date.end", String(this.getMidiTime() + ((this.endids[j].getLocalName() === "slur") ? 0.0 : this.computeDuration(e)))));
            this.endids.splice(j, 1);
        }
    }

    protected checkSlurs(e: Element): void {
        let slurs = this.currentMsmMovement!.getFirstChildElement("global")!.getFirstChildElement("dated")!.getFirstChildElement("miscMap")!.getChildElements("slur");

        for (let i = slurs.size() - 1; i >= 0; --i) {
            if ((slurs.get(i).getAttributeValue("date") !== null) && (parseFloat(slurs.get(i).getAttributeValue("date")!) > this.getMidiTime())) continue;
            if (slurs.get(i).getAttribute("date.end") !== null) {
                const endDate = parseFloat(slurs.get(i).getAttributeValue("date.end")!);
                if (endDate < this.getMidiTime()) continue;
                if (endDate === this.getMidiTime()) {
                    e.addAttribute(new Attribute("slur", "t"));
                    Mei2MsmMpmConverter.addSlurId(slurs.get(i), e);
                    return;
                }
            }
            e.addAttribute(new Attribute("slur", "im"));
            Mei2MsmMpmConverter.addSlurId(slurs.get(i), e);
        }

        if (this.currentPart !== null) {
            const layerId = Mei.getLayerId(Mei.getLayer(e));
            slurs = this.currentPart.getFirstChildElement("dated")!.getFirstChildElement("miscMap")!.getChildElements("slur");

            for (let i = slurs.size() - 1; i >= 0; --i) {
                if (!Mei2MsmMpmConverter.isSameLayer(slurs.get(i), layerId)) continue;
                if ((slurs.get(i).getAttributeValue("date") !== null) && (parseFloat(slurs.get(i).getAttributeValue("date")!) > this.getMidiTime())) continue;
                if (slurs.get(i).getAttribute("date.end") !== null) {
                    const endDate = parseFloat(slurs.get(i).getAttributeValue("date.end")!);
                    if (endDate < this.getMidiTime()) continue;
                    if (endDate === this.getMidiTime()) {
                        e.addAttribute(new Attribute("slur", "t"));
                        Mei2MsmMpmConverter.addSlurId(slurs.get(i), e);
                        return;
                    }
                }
                e.addAttribute(new Attribute("slur", "im"));
                Mei2MsmMpmConverter.addSlurId(slurs.get(i), e);
            }
        }
    }

    protected tstampToTicks(tstamp: string | null, msmPartContext: Element | null): number {
        if ((tstamp === null) || tstamp === "" || (this.currentMeasure === null))
            return this.getMidiTime();

        let date = parseFloat(tstamp);
        date = (date < 1.0) ? 0.0 : (date - 1.0);

        const denom = this.getCurrentTimeSignature(msmPartContext)[1];
        const tstampToTicksConversionFactor = (4.0 * this.ppq) / denom;

        return (date * tstampToTicksConversionFactor) + parseFloat(this.currentMeasure.getAttributeValue("date")!);
    }

    protected computeControlEventTiming(event: Element, msmPartContext: Element | null): any[] | null {
        let att = event.getAttribute("tstamp.ges");
        if (att === null) {
            att = event.getAttribute("tstamp");
            if ((att === null) && (event.getAttribute("dontRepositionMeAgain") === null)) {
                let startidAtt = event.getAttribute("startid");
                if (startidAtt === null) { startidAtt = event.getAttribute("plist"); }
                if (startidAtt !== null) {
                    const startid = startidAtt.getValue().trim().replace(/#/g, "").split(/\s+/)[0].trim();
                    const node = this.allNotesAndChords.get(startid);
                    if (node !== undefined) {
                        const parent = node.getParent()!;
                        event.detach();
                        parent.insertChild(event, parent.indexOf(node));
                        event.addAttribute(new Attribute("dontRepositionMeAgain", "true"));
                        return null;
                    }
                }
            }
        }
        const tstamp = (att === null) ? null : att.getValue();
        const date: number = this.tstampToTicks(tstamp, msmPartContext);

        let tstamp2: Attribute | null = null;
        let endid: Attribute | null = null;
        let endDate: number | null = null;
        if (event.getAttribute("dur") !== null) {
            endDate = date + this.computeDuration(event);
        } else {
            tstamp2 = event.getAttribute("tstamp2.ges");
            if (tstamp2 === null) tstamp2 = event.getAttribute("tstamp2");
            if (tstamp2 !== null) {
                const ts2 = tstamp2.getValue().split("m+");
                if (ts2.length === 0) tstamp2 = null;
                else if (ts2.length === 1) { endDate = this.tstampToTicks(ts2[0], msmPartContext); tstamp2 = null; }
                else if (ts2[0] === "0") { endDate = this.tstampToTicks(ts2[1], msmPartContext); tstamp2 = null; }
            }
            endid = event.getAttribute("endid");
        }

        return [date, endDate, tstamp2, endid];
    }

    protected computeDuration(ofThis: Element): number {
        if ((!ofThis.getLocalName().match(/^(bTrem|chord|dynam|fTrem|halfmRpt|mRest|mSpace|note|octave|rest|tuplet|space)$/))) {
            return 0.0;
        }

        if (ofThis.getAttribute("grace") !== null) return 0.0;

        let dur: number;
        const chordEnvironment = (this.currentChord !== null);
        let focus = ofThis;

        {
            let sdur = "";
            if (ofThis.getAttribute("dur") !== null) { sdur = focus.getAttributeValue("dur")!; }
            else {
                if (chordEnvironment && (this.currentChord!.getAttribute("dur") !== null)) {
                    focus = this.currentChord!;
                    sdur = focus.getAttributeValue("dur")!;
                } else {
                    if (this.currentPart === null) return 0.0;
                    const layerId = Mei.getLayerId(Mei.getLayer(ofThis));
                    let durdefaults = this.currentPart.getFirstChildElement("dated")!.getFirstChildElement("miscMap")!.getChildElements("dur.default");
                    if (durdefaults.size() === 0) {
                        durdefaults = this.currentMsmMovement!.getFirstChildElement("global")!.getFirstChildElement("dated")!.getFirstChildElement("miscMap")!.getChildElements("dur.default");
                    }
                    for (let i = durdefaults.size() - 1; i >= 0; --i) {
                        if ((durdefaults.get(i).getAttribute("layer") === null) || durdefaults.get(i).getAttributeValue("layer") === layerId) {
                            sdur = durdefaults.get(i).getAttributeValue("dur")!;
                            break;
                        }
                    }
                    if (sdur === "") return 0.0;
                }
            }

            switch (sdur) {
                case "breve":  dur = 8.0 * this.ppq; break;
                case "long":   dur = 16.0 * this.ppq; break;
                default:       dur = (4.0 * this.ppq) / parseInt(sdur);
            }
        }

        {
            let dots = 0;
            if (focus.getAttribute("dots") !== null) { dots = parseInt(focus.getAttributeValue("dots")!); }
            else {
                if (focus.getAttribute("childDots") !== null) dots = parseInt(focus.getAttributeValue("childDots")!);
                if ((dots === 0) && chordEnvironment && (this.currentChord!.getAttribute("dots") !== null)) {
                    dots = parseInt(this.currentChord!.getAttributeValue("dots")!);
                }
            }
            for (let d = dur; dots > 0; --dots) { d /= 2; dur += d; }
        }

        // tuplets
        for (let e = Helper.getParentElement(focus); (e !== null) && (e.getLocalName() !== "mdiv"); e = Helper.getParentElement(e)) {
            if (e.getLocalName() === "tuplet") {
                if ((e.getAttribute("numbase") === null) || (e.getAttribute("num") === null)) return 0.0;
                dur *= parseFloat(e.getAttributeValue("numbase")!) / parseInt(e.getAttributeValue("num")!);
            }
        }

        // tupletSpans
        let tps: Element[];
        if (this.currentPart !== null) {
            tps = Helper.getAllChildElements("tupletSpan", this.currentPart.getFirstChildElement("dated")!.getFirstChildElement("miscMap")!.getFirstChildElement("tupletSpanMap")!) ?? [];
        } else {
            tps = Helper.getAllChildElements("tupletSpan", this.currentMsmMovement!.getFirstChildElement("global")!.getFirstChildElement("dated")!.getFirstChildElement("miscMap")!.getFirstChildElement("tupletSpanMap")!) ?? [];
        }

        for (let i = tps.length - 1; i >= 0; --i) {
            const ts = tps[i];
            if ((ts.getAttribute("date.end") !== null) && (parseFloat(ts.getAttributeValue("date.end")!) <= this.getMidiTime())) {
                this.currentPart!.getFirstChildElement("dated")!.getFirstChildElement("miscMap")!.getFirstChildElement("tupletSpanMap")!.removeChild(ts);
                continue;
            }
            if (!Mei2MsmMpmConverter.isSameLayer(ts, Mei.getLayerId(this.currentLayer))) continue;
            if (parseFloat(ts.getAttributeValue("date")!) <= this.getMidiTime())
                dur *= parseFloat(ts.getAttributeValue("numbase")!) / parseInt(ts.getAttributeValue("num")!);
        }

        return dur;
    }

    public isSameLayerInstance(startid: string, endid: string): string {
        const start = this.allNotesAndChords.get(startid.trim().replace(/#/g, ""));
        if (start === undefined) return "";
        const end = this.allNotesAndChords.get(endid.trim().replace(/#/g, ""));
        if (end === undefined) return "";
        const startLayerId = Mei.getLayerId(Mei.getLayer(start));
        if (startLayerId === "") return "";
        const endLayerId = Mei.getLayerId(Mei.getLayer(end));
        if (startLayerId !== endLayerId) return "";
        return startLayerId;
    }

    public isSameStaff(startid: string, endid: string): string {
        const start = this.allNotesAndChords.get(startid.trim().replace(/#/g, ""));
        if (start === undefined) return "";
        const end = this.allNotesAndChords.get(endid.trim().replace(/#/g, ""));
        if (end === undefined) return "";
        const startStaffId = Mei.getStaffId(Mei.getStaff(start));
        if (startStaffId === "") return "";
        const endStaffId = Mei.getStaffId(Mei.getStaff(end));
        if (startStaffId !== endStaffId) return "";
        return startStaffId;
    }

    protected computePitch(ofThis: Element, pitchdata: string[]): number {
        let pname: string;
        let accid = "";
        const layerId = Mei.getLayerId(Mei.getLayer(ofThis));
        let oct = 0.0;
        let trans = 0;
        let checkKeySign = false;

        if ((ofThis.getAttribute("pname.ges") !== null) && ofThis.getAttributeValue("pname.ges") !== "none") {
            pname = ofThis.getAttributeValue("pname.ges")!;
        } else {
            if (ofThis.getAttribute("pname") !== null) {
                pname = ofThis.getAttributeValue("pname")!;
                checkKeySign = true;
            } else {
                return -1.0;
            }
        }

        if (ofThis.getAttribute("oct.ges") !== null) { oct = parseFloat(ofThis.getAttributeValue("oct.ges")!); }
        else {
            if (ofThis.getAttribute("oct") !== null) { oct = parseFloat(ofThis.getAttributeValue("oct")!); }
            else {
                if (this.currentPart !== null) {
                    let octs = this.currentPart.getFirstChildElement("dated")!.getFirstChildElement("miscMap")!.getChildElements("oct.default");
                    if (octs.size() === 0) {
                        octs = this.currentMsmMovement!.getFirstChildElement("global")!.getFirstChildElement("dated")!.getFirstChildElement("miscMap")!.getChildElements("oct.default");
                    }
                    for (let i = octs.size() - 1; i >= 0; --i) {
                        if ((octs.get(i).getAttribute("layer") === null) || octs.get(i).getAttributeValue("layer") === layerId) {
                            oct = parseFloat(octs.get(i).getAttributeValue("oct.default")!);
                            break;
                        }
                    }
                }
                ofThis.addAttribute(new Attribute("oct", String(oct)));
            }
        }

        if (ofThis.getAttribute("accid.ges") !== null) { accid = ofThis.getAttributeValue("accid.ges")!; checkKeySign = false; }
        else {
            if (ofThis.getAttribute("accid") !== null) {
                accid = ofThis.getAttributeValue("accid")!;
                if (accid !== "") checkKeySign = false;
            } else {
                for (let i = this.accid.length - 1; i >= 0; --i) {
                    const anAccid = this.accid[i];
                    if ((anAccid.getAttribute("pname") !== null) && (anAccid.getAttributeValue("pname") === pname)
                        && (anAccid.getAttribute("oct") !== null) && (parseFloat(anAccid.getAttributeValue("oct")!) === oct)) {
                        if (anAccid.getAttribute("accid.ges") !== null) accid = anAccid.getAttributeValue("accid.ges")!;
                        else if (anAccid.getAttribute("accid") !== null) accid = anAccid.getAttributeValue("accid")!;
                        checkKeySign = accid === "";
                        break;
                    }
                }
                if (checkKeySign) {
                    const keySigMapLocal = (this.currentPart === null) ? null : this.currentPart.getFirstChildElement("dated")!.getFirstChildElement("keySignatureMap");
                    const keySigMapGlobal = this.currentMsmMovement!.getFirstChildElement("global")!.getFirstChildElement("dated")!.getFirstChildElement("keySignatureMap");

                    let keySigLocal: Element | null = null;
                    if (keySigMapLocal !== null) {
                        const keySigsLocal = keySigMapLocal.getChildElements("keySignature");
                        for (let i = keySigsLocal.size() - 1; i >= 0; --i) {
                            if ((keySigsLocal.get(i).getAttribute("layer") === null) || keySigsLocal.get(i).getAttributeValue("layer") === layerId) {
                                keySigLocal = keySigsLocal.get(i); break;
                            }
                        }
                    }

                    let keySigGlobal: Element | null = null;
                    if (keySigMapGlobal !== null) {
                        const keySigsGlobal = keySigMapGlobal.getChildElements("keySignature");
                        for (let i = keySigsGlobal.size() - 1; i >= 0; --i) {
                            if ((keySigsGlobal.get(i).getAttribute("layer") === null) || keySigsGlobal.get(i).getAttributeValue("layer") === layerId) {
                                keySigGlobal = keySigsGlobal.get(i); break;
                            }
                        }
                    }

                    let keySig = keySigLocal;
                    if ((keySig === null) || ((keySigGlobal !== null) && (parseFloat(keySigLocal!.getAttributeValue("date")!) < parseFloat(keySigGlobal.getAttributeValue("date")!)))) {
                        keySig = keySigGlobal;
                        if (keySigMapLocal !== null && (keySigGlobal !== null) && (keySigMapLocal.getChildCount() > 0)) {
                            Helper.addToMap(keySigGlobal.copy() as Element, keySigMapLocal);
                        }
                    }

                    if (keySig !== null) {
                        const keySigAccids = keySig.getChildElements("accidental");
                        for (let i = 0; i < keySigAccids.size(); ++i) {
                            const a = keySigAccids.get(i);
                            let aPitch: number;
                            if (a.getAttribute("midi.pitch") !== null) aPitch = parseFloat(a.getAttributeValue("midi.pitch")!);
                            else if (a.getAttribute("pitchname") !== null) aPitch = Helper.pname2midi(a.getAttributeValue("pitchname")!);
                            else continue;
                            const pitchOfThis = Helper.pname2midi(pname) % 12;
                            if (aPitch === pitchOfThis) { accid = a.getAttributeValue("value")!; break; }
                        }
                    }
                }
            }
        }

        // transpositions
        if ((ofThis.getAttribute("pname.ges") === null) || (ofThis.getAttribute("oct.ges") === null)) {
            {
                const globalTrans = this.currentMsmMovement!.getFirstChildElement("global")!.getFirstChildElement("dated")!.getFirstChildElement("miscMap")!.getChildElements("transposition");
                for (let i = globalTrans.size() - 1; i >= 0; --i) {
                    if ((globalTrans.get(i).getAttributeValue("date") !== null) && (parseFloat(globalTrans.get(i).getAttributeValue("date")!) > this.getMidiTime())) continue;
                    if ((globalTrans.get(i).getAttribute("date.end") !== null) && (parseFloat(globalTrans.get(i).getAttributeValue("date.end")!) <= this.getMidiTime())) break;
                    if (!Mei2MsmMpmConverter.isSameLayer(globalTrans.get(i), layerId)) continue;
                    trans += parseFloat(globalTrans.get(i).getAttributeValue("semi")!);
                    break;
                }
            }
            {
                const globalAddTrans = this.currentMsmMovement!.getFirstChildElement("global")!.getFirstChildElement("dated")!.getFirstChildElement("miscMap")!.getChildElements("addTransposition");
                for (let i = globalAddTrans.size() - 1; i >= 0; --i) {
                    if ((globalAddTrans.get(i).getAttributeValue("date") !== null) && (parseFloat(globalAddTrans.get(i).getAttributeValue("date")!) > this.getMidiTime())) continue;
                    if ((globalAddTrans.get(i).getAttribute("date.end") !== null) && (parseFloat(globalAddTrans.get(i).getAttributeValue("date.end")!) <= this.getMidiTime())) continue;
                    if (!Mei2MsmMpmConverter.isSameLayer(globalAddTrans.get(i), layerId)) continue;
                    trans += parseFloat(globalAddTrans.get(i).getAttributeValue("semi")!);
                }
            }
            if (this.currentPart !== null) {
                {
                    const localTrans = this.currentPart.getFirstChildElement("dated")!.getFirstChildElement("miscMap")!.getChildElements("transposition");
                    for (let i = localTrans.size() - 1; i >= 0; --i) {
                        if ((localTrans.get(i).getAttributeValue("date") !== null) && (parseFloat(localTrans.get(i).getAttributeValue("date")!) > this.getMidiTime())) continue;
                        if ((localTrans.get(i).getAttribute("date.end") !== null) && (parseFloat(localTrans.get(i).getAttributeValue("date.end")!) <= this.getMidiTime())) break;
                        if (!Mei2MsmMpmConverter.isSameLayer(localTrans.get(i), layerId)) continue;
                        trans += parseFloat(localTrans.get(i).getAttributeValue("semi")!);
                        break;
                    }
                }
                {
                    const localAddTrans = this.currentPart.getFirstChildElement("dated")!.getFirstChildElement("miscMap")!.getChildElements("addTransposition");
                    for (let i = localAddTrans.size() - 1; i >= 0; --i) {
                        if ((localAddTrans.get(i).getAttributeValue("date") !== null) && (parseFloat(localAddTrans.get(i).getAttributeValue("date")!) > this.getMidiTime())) continue;
                        if ((localAddTrans.get(i).getAttribute("date.end") !== null) && (parseFloat(localAddTrans.get(i).getAttributeValue("date.end")!) <= this.getMidiTime())) continue;
                        if (!Mei2MsmMpmConverter.isSameLayer(localAddTrans.get(i), layerId)) continue;
                        trans += parseFloat(localAddTrans.get(i).getAttributeValue("semi")!);
                    }
                }
            }
        }

        let pitch = Helper.pname2midi(pname);
        if (pitch === -1.0) return -1.0;

        const initialPitch = pitch;
        pitch += 12 * (oct + 1);

        const accidentals = (checkKeySign) ? ((accid === "") ? 0.0 : parseFloat(accid)) : Helper.accidString2decimal(accid);
        pitch += accidentals;
        pitch += trans;

        const p1 = Math.floor(initialPitch + (12 * oct) + trans);
        const p2 = ((p1 % 12) + 12) % 12;
        const outputOct = ((p1 - p2) / 12) - 1;
        let outputAcc = accidentals;
        let pitchname = pname;
        if (trans !== 0) {
            switch (p2) {
                case 0: pitchname = "c"; break;
                case 1: if (trans > 0) { pitchname = "c"; outputAcc += 1; } else { pitchname = "d"; outputAcc -= 1; } break;
                case 2: pitchname = "d"; break;
                case 3: if (trans > 0) { pitchname = "d"; outputAcc += 1; } else { pitchname = "e"; outputAcc -= 1; } break;
                case 4: pitchname = "e"; break;
                case 5: pitchname = "f"; break;
                case 6: if (trans > 0) { pitchname = "f"; outputAcc += 1; } else { pitchname = "g"; outputAcc -= 1; } break;
                case 7: pitchname = "g"; break;
                case 8: if (trans > 0) { pitchname = "g"; outputAcc += 1; } else { pitchname = "a"; outputAcc -= 1; } break;
                case 9: pitchname = "a"; break;
                case 10: if (trans > 0) { pitchname = "a"; outputAcc += 1; } else { pitchname = "b"; outputAcc -= 1; } break;
                case 11: pitchname = "b"; break;
            }
        }
        pitchdata.push(pitchname);
        pitchdata.push(String(outputAcc));
        pitchdata.push(String(outputOct));

        return pitch;
    }

    public static msmCleanup(msms: any[]): void {
        for (const msm of msms) Mei2MsmMpmConverter.msmCleanupSingle(msm);
    }

    public static msmCleanupSingle(msm: any): void {
        const n = msm.getRootElement().query("descendant::*[local-name()='miscMap'] | descendant::*[attribute::currentDate]/attribute::currentDate | descendant::*[attribute::tie]/attribute::tie | descendant::*[attribute::layer]/attribute::layer | descendant::*[attribute::endid]/attribute::endid | descendant::*[attribute::tstamp2]/attribute::tstamp2 | descendant::*[local-name()='goto' and attribute::n]/attribute::n");
        for (let i = 0; i < n.size(); ++i) {
            const node = n.get(i);
            if (node instanceof Element) {
                const parent = node.getParent();
                if (parent) parent.removeChild(node);
            }
            if (node instanceof Attribute) {
                const parent = node.getParent();
                if (parent) (parent as unknown as Element).removeAttribute(node);
            }
        }
        msm.deleteEmptyMaps();
    }

    public static mpmPostprocessing(mpms: any[]): void {
        for (const mpm of mpms)
            Mei2MsmMpmConverter.mpmPostprocessingSingle(mpm);
    }

    public static mpmPostprocessingSingle(mpm: Mpm): void {
        const maps: GenericMap[] = [];

        for (let p = 0; p < mpm.size(); ++p) {
            const perf = mpm.getPerformance(p);
            if (perf === null) continue;

            // collect all global and local dynamicsMaps and tempoMaps
            let aMap = perf.getGlobal()?.getDated()?.getMap(Mpm.DYNAMICS_MAP) ?? null;
            if (aMap !== null)
                maps.push(aMap);

            aMap = perf.getGlobal()?.getDated()?.getMap(Mpm.TEMPO_MAP) ?? null;
            if (aMap !== null)
                maps.push(aMap);

            const parts = perf.getAllParts();
            for (let pp = 0; pp < perf.size(); ++pp) {
                const part = parts[pp];

                aMap = part.getDated()?.getMap(Mpm.DYNAMICS_MAP) ?? null;
                if (aMap !== null)
                    maps.push(aMap);

                aMap = part.getDated()?.getMap(Mpm.TEMPO_MAP) ?? null;
                if (aMap !== null)
                    maps.push(aMap);
            }
        }

        // go through all the maps' elements and finalize them
        for (const map of maps) {
            for (let e = 0; e < map.size(); ++e) {
                const d = map.getElement(e)!;

                // handle remaining endid attributes
                const endid = d.getAttribute("endid");
                if (endid !== null)
                    d.removeAttribute(endid);

                // handle remaining tstamp2 attributes
                const tstamp2 = d.getAttribute("tstamp2");
                if (tstamp2 !== null)
                    d.removeAttribute(tstamp2);

                const end = d.getAttribute("date.end");
                if (end !== null) {
                    const endDate = parseFloat(end.getValue());
                    d.removeAttribute(end);
                    const next = map.getElement(e + 1);
                    if ((next === null) || (parseFloat(next.getAttributeValue("date")!) > endDate)) {
                        const t = d.getAttribute("transition.to");
                        if (t !== null) {
                            const elementType = d.getLocalName();
                            const endElement = new Element(elementType, Mpm.MPM_NAMESPACE);
                            endElement.addAttribute(new Attribute("date", String(endDate)));

                            switch (elementType) {
                                case "dynamics":
                                    endElement.addAttribute(new Attribute("volume", t.getValue()));
                                    break;
                                case "tempo":
                                    endElement.addAttribute(new Attribute("bpm", t.getValue()));
                                    break;
                                default:
                                    continue;
                            }
                            map.addElement(endElement);
                        }
                    }
                }
            }
        }
    }

    protected static reorderMeasureContent(measure: Element): void {
        const subtrees = measure.getChildElements();
        for (let i = subtrees.size() - 1; i >= 0; --i) {
            const subtree = subtrees.get(i);
            if (subtree.query("descendant-or-self::*[local-name()='staff' or local-name()='oStaff']").size() === 0) {
                subtree.detach();
                measure.insertChild(subtree, 0);
            }
        }
    }

    protected static addSlurId(fromThis: Element, toThis: Element): void {
        const slurid = Helper.getAttribute("id", fromThis);
        if (slurid !== null) {
            toThis.addAttribute(new Attribute("slurid", slurid.getValue() + "_meico_" + uuidv4()));
        }
    }

    protected static barline2SequencingCommand(barline: string, date: number, sequencingMap: Element): void {
        let markerMessage: string | null = null;
        let makeGoto = false;

        switch (barline) {
            case "end":
                markerMessage = "fine";
                break;
            case "rptstart":
                markerMessage = "repetition start";
                break;
            case "rptboth":
                markerMessage = "repetition start";
                makeGoto = true;
                break;
            case "rptend":
                makeGoto = true;
                break;
            default:
                return;
        }

        if (makeGoto) {
            const gt = new Element("goto");
            gt.addAttribute(new Attribute("date", String(date)));
            gt.addAttribute(new Attribute("activity", "1"));
            gt.addAttribute(new Attribute("target.date", "0"));
            gt.addAttribute(new Attribute("target.id", ""));
            const index = Helper.addToMap(gt, sequencingMap);
            const ns = sequencingMap.query("descendant::*[local-name()='marker' and (@message='repetition start' or @message='fine')]");
            for (let i = ns.size() - 1; i >= 0; --i) {
                const n = ns.get(i) as unknown as Element;
                if (parseFloat(n.getAttributeValue("date")!) < date) {
                    gt.getAttribute("target.date")!.setValue(n.getAttributeValue("date")!);
                    gt.getAttribute("target.id")!.setValue("#" + n.getAttributeValue("id")!);
                    break;
                }
            }
        }

        if (markerMessage !== null) {
            const marker = new Element("marker");
            marker.addAttribute(new Attribute("date", String(date)));
            marker.addAttribute(new Attribute("message", markerMessage));
            const id = new Attribute("xml:id", "http://www.w3.org/XML/1998/namespace", "meico_" + uuidv4());
            marker.addAttribute(id);
            Helper.addToMap(marker, sequencingMap);
        }
    }

    protected static processClefDis(_scoreStaffDef: Element): number {
        return 0.0;
    }

    public static isSameLayer(e: Element, layerId: string): boolean {
        if (e.getAttribute("layer") !== null) {
            const layers = e.getAttributeValue("layer")!.trim().split(/\s+/);
            for (const layer of layers) {
                if (layer === layerId) return true;
            }
            return false;
        }
        return true;
    }
}
