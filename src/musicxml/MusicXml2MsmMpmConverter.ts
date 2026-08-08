import { Element, Attribute } from '../xml/XomTypes.js';
import { KeyValue } from '../supplementary/KeyValue.js';
import { Msm } from '../msm/Msm.js';
import { Mpm } from '../mpm/Mpm.js';
import { MusicXml, MusicXmlType } from './MusicXml.js';
import { Helper } from '../mei/Helper.js';
import { Meico } from '../Meico.js';
import { v4 as uuidv4 } from 'uuid';

// Forward declarations for types that may not yet be fully ported.
// These are used as type references; the actual implementations will be
// imported once the corresponding modules are available.

/**
 * Minimal interface for Performance, mirroring the API used by this converter.
 * Replace with the actual import once Performance.ts is fully ported.
 */
interface IPerformance {
  addPart(part: any): boolean;
  getXml(): Element;
}

/**
 * Minimal interface for Part, mirroring the API used by this converter.
 * Replace with the actual import once Part.ts is fully ported.
 */
interface IPart {
  getXml(): Element;
}

/**
 * Minimal interface for RelatedResource.
 */
interface IRelatedResource {
  getXml(): Element;
}

/**
 * Minimal interface for Author.
 */
interface IAuthor {
  getXml(): Element;
}

/**
 * Minimal interface for Comment.
 */
interface IComment {
  getXml(): Element;
}

/**
 * Stub for Performance.createPerformance until the full Performance class is ported.
 */
function createPerformance(name: string, pulsesPerQuarter?: number): IPerformance | null {
  // Create a performance element in MPM namespace
  const perfElem = new Element('performance', Mpm.MPM_NAMESPACE);
  perfElem.addAttribute(new Attribute('name', name));
  if (pulsesPerQuarter !== undefined) {
    perfElem.addAttribute(new Attribute('pulsesPerQuarter', String(pulsesPerQuarter)));
  }
  const idAttr = new Attribute(
    'xml:id',
    'http://www.w3.org/XML/1998/namespace',
    `meico_${uuidv4()}`,
  );
  perfElem.addAttribute(idAttr);

  // Add global environment
  const globalElem = new Element('global', Mpm.MPM_NAMESPACE);
  const header = new Element('header', Mpm.MPM_NAMESPACE);
  const dated = new Element('dated', Mpm.MPM_NAMESPACE);
  globalElem.appendChild(header);
  globalElem.appendChild(dated);
  perfElem.appendChild(globalElem);

  const parts: IPart[] = [];

  return {
    addPart(part: IPart): boolean {
      if (part === null) return false;
      perfElem.appendChild(part.getXml());
      parts.push(part);
      return true;
    },
    getXml(): Element {
      return perfElem;
    },
  };
}

/**
 * Stub for Part.createPart until the full Part class is ported.
 */
function createPart(
  name: string,
  number: number,
  midiChannel: number,
  midiPort: number,
  id?: string,
): IPart | null {
  const partElem = new Element('part', Mpm.MPM_NAMESPACE);
  partElem.addAttribute(new Attribute('name', name));
  partElem.addAttribute(new Attribute('number', String(number)));
  partElem.addAttribute(new Attribute('midi.channel', String(midiChannel)));
  partElem.addAttribute(new Attribute('midi.port', String(midiPort)));

  if (id !== undefined) {
    const idAttr = new Attribute('xml:id', 'http://www.w3.org/XML/1998/namespace', id);
    partElem.addAttribute(idAttr);
  }

  // Add header and dated environments
  const header = new Element('header', Mpm.MPM_NAMESPACE);
  const dated = new Element('dated', Mpm.MPM_NAMESPACE);
  partElem.appendChild(header);
  partElem.appendChild(dated);

  return {
    getXml(): Element {
      return partElem;
    },
  };
}

/**
 * Stub for RelatedResource.createRelatedResource.
 */
function createRelatedResource(uri: string, type: string): IRelatedResource | null {
  const elem = new Element('resource', Mpm.MPM_NAMESPACE);
  elem.addAttribute(new Attribute('uri', uri));
  elem.addAttribute(new Attribute('type', type));
  return {
    getXml(): Element {
      return elem;
    },
  };
}

/**
 * Stub for Author.createAuthor.
 */
function createAuthor(name: string, _id: string | null, _contact: string | null): IAuthor | null {
  const elem = new Element('author', Mpm.MPM_NAMESPACE);
  elem.addAttribute(new Attribute('name', name));
  return {
    getXml(): Element {
      return elem;
    },
  };
}

/**
 * Stub for Comment.createComment.
 */
function createComment(text: string, _id: string | null): IComment | null {
  const elem = new Element('comment', Mpm.MPM_NAMESPACE);
  elem.appendChild(text);
  return {
    getXml(): Element {
      return elem;
    },
  };
}

/**
 * Stub for Mpm.addMetadata until the full Mpm class is extended.
 * Adds metadata to the mpm document.
 */
function addMetadataToMpm(
  mpm: Mpm,
  author: IAuthor | null,
  comment: IComment | null,
  relatedResources: IRelatedResource[] | null,
): boolean {
  const root = mpm.getDocument()?.getRootElement();
  if (root === null || root === undefined) return false;

  let metadata = root.getFirstChildElement('metadata');
  if (metadata === null) {
    metadata = new Element('metadata', Mpm.MPM_NAMESPACE);
    // Insert metadata as first child
    root.insertChild(metadata, 0);
  }

  if (author !== null) {
    metadata.appendChild(author!.getXml());
  }

  if (comment !== null) {
    metadata.appendChild(comment!.getXml());
  }

  if (relatedResources !== null) {
    let relRes = metadata.getFirstChildElement('relatedResources');
    if (relRes === null) {
      relRes = new Element('relatedResources', Mpm.MPM_NAMESPACE);
      metadata.appendChild(relRes);
    }
    for (const resource of relatedResources) {
      relRes.appendChild(resource.getXml());
    }
  }

  return true;
}

/**
 * Stub for Mpm.addPerformance until the full Mpm class is extended.
 * Adds a performance to the mpm document.
 */
function addPerformanceToMpm(mpm: Mpm, performance: IPerformance | null): boolean {
  if (performance === null) return false;
  const root = mpm.getDocument()?.getRootElement();
  if (root === null || root === undefined) return false;
  root.appendChild(performance.getXml());
  return true;
}

/**
 * Stub for InstrumentsDictionary.getProgramChange.
 * Tries to map an instrument name to a General MIDI program change number.
 */
function getProgramChangeFromInstrumentName(name: string): number {
  // A simplified instruments dictionary mapping common instrument names to GM program change numbers
  const dict = new Map<string, number>([
    ['piano', 0],
    ['acoustic grand piano', 0],
    ['bright acoustic piano', 1],
    ['electric grand piano', 2],
    ['honky-tonk piano', 3],
    ['electric piano 1', 4],
    ['electric piano 2', 5],
    ['harpsichord', 6],
    ['clavinet', 7],
    ['clavi', 7],
    ['celesta', 8],
    ['glockenspiel', 9],
    ['music box', 10],
    ['vibraphone', 11],
    ['marimba', 12],
    ['xylophone', 13],
    ['tubular bells', 14],
    ['dulcimer', 15],
    ['drawbar organ', 16],
    ['organ', 19],
    ['church organ', 19],
    ['reed organ', 20],
    ['accordion', 21],
    ['harmonica', 22],
    ['tango accordion', 23],
    ['bandoneon', 23],
    ['acoustic guitar (nylon)', 24],
    ['guitar', 24],
    ['nylon guitar', 24],
    ['acoustic guitar (steel)', 25],
    ['steel guitar', 25],
    ['electric guitar (jazz)', 26],
    ['electric guitar (clean)', 27],
    ['electric guitar (muted)', 28],
    ['overdriven guitar', 29],
    ['distortion guitar', 30],
    ['guitar harmonics', 31],
    ['acoustic bass', 32],
    ['bass', 32],
    ['electric bass (finger)', 33],
    ['electric bass (pick)', 34],
    ['fretless bass', 35],
    ['slap bass 1', 36],
    ['slap bass 2', 37],
    ['synth bass 1', 38],
    ['synth bass 2', 39],
    ['violin', 40],
    ['viola', 41],
    ['cello', 42],
    ['violoncello', 42],
    ['contrabass', 43],
    ['double bass', 43],
    ['tremolo strings', 44],
    ['pizzicato strings', 45],
    ['orchestral harp', 46],
    ['harp', 46],
    ['timpani', 47],
    ['string ensemble 1', 48],
    ['strings', 48],
    ['string ensemble 2', 49],
    ['synth strings 1', 50],
    ['synth strings 2', 51],
    ['choir aahs', 52],
    ['voice aahs', 53],
    ['synth voice', 54],
    ['orchestra hit', 55],
    ['trumpet', 56],
    ['trombone', 57],
    ['tuba', 58],
    ['muted trumpet', 59],
    ['french horn', 60],
    ['horn', 60],
    ['brass section', 61],
    ['synth brass 1', 62],
    ['synth brass 2', 63],
    ['soprano sax', 64],
    ['alto sax', 65],
    ['tenor sax', 66],
    ['baritone sax', 67],
    ['saxophone', 65],
    ['oboe', 68],
    ['english horn', 69],
    ['cor anglais', 69],
    ['bassoon', 70],
    ['clarinet', 71],
    ['piccolo', 72],
    ['flute', 73],
    ['recorder', 74],
    ['pan flute', 75],
    ['blown bottle', 76],
    ['shakuhachi', 77],
    ['whistle', 78],
    ['ocarina', 79],
    ['lead 1 (square)', 80],
    ['lead 2 (sawtooth)', 81],
    ['lead 3 (calliope)', 82],
    ['lead 4 (chiff)', 83],
    ['lead 5 (charang)', 84],
    ['lead 6 (voice)', 85],
    ['lead 7 (fifths)', 86],
    ['lead 8 (bass + lead)', 87],
    ['pad 1 (new age)', 88],
    ['pad 2 (warm)', 89],
    ['pad 3 (polysynth)', 90],
    ['pad 4 (choir)', 91],
    ['pad 5 (bowed)', 92],
    ['pad 6 (metallic)', 93],
    ['pad 7 (halo)', 94],
    ['pad 8 (sweep)', 95],
    ['sitar', 104],
    ['banjo', 105],
    ['shamisen', 106],
    ['koto', 107],
    ['kalimba', 108],
    ['bag pipe', 109],
    ['bagpipe', 109],
    ['fiddle', 110],
    ['shanai', 111],
    ['tinkle bell', 112],
    ['agogo', 113],
    ['steel drums', 114],
    ['woodblock', 115],
    ['taiko drum', 116],
    ['melodic tom', 117],
    ['synth drum', 118],
    ['reverse cymbal', 119],
  ]);

  const lower = name.toLowerCase().trim();
  if (dict.has(lower)) {
    return dict.get(lower)!;
  }

  // Try partial matching
  for (const [key, value] of dict) {
    if (lower.includes(key) || key.includes(lower)) {
      return value;
    }
  }

  return -1; // not found
}

/**
 * Stub for Mei2MsmMpmConverter.msmCleanup.
 * Removes all miscMaps, currentDate, tie, layer, endid, tstamp2 attributes, and other non-MSM-conform attributes.
 */
function msmCleanup(msm: Msm): void {
  const root = msm.getRootElement();
  if (root === null) return;

  // delete all miscMaps and non-msm conform attributes
  const n = root.query(
    "descendant::*[local-name()='miscMap'] | descendant::*[attribute::currentDate]/attribute::currentDate | descendant::*[attribute::tie]/attribute::tie | descendant::*[attribute::layer]/attribute::layer | descendant::*[attribute::endid]/attribute::endid | descendant::*[attribute::tstamp2]/attribute::tstamp2 | descendant::*[local-name()='goto' and attribute::n]/attribute::n",
  );
  for (let i = 0; i < n.size(); ++i) {
    const node = n.get(i);
    if (node instanceof Element) {
      const parent = node.getParent();
      if (parent !== null) {
        parent.removeChild(node);
      }
    }

    if (node instanceof Attribute) {
      const parent = node.getParent();
      if (parent !== null && parent instanceof Element) {
        (parent as Element).removeAttribute(node as Attribute);
      }
    }
  }
  msm.deleteEmptyMaps();
}

/**
 * Extract the filename (basename) from a file path string.
 */
function getFileName(filePath: string): string {
  const lastSlash = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'));
  if (lastSlash >= 0) {
    return filePath.substring(lastSlash + 1);
  }
  return filePath;
}

/**
 * This class does the conversion from MusicXML to MSM and MPM.
 * To use it, instantiate it with the constructor, then invoke convert().
 *
 * In the Java version, this converter relies on ProxyMusic's JAXB-based MusicXML binding
 * (ScorePart, PartGroup, MidiDevice, MidiInstrument, etc.). In this TypeScript port, the
 * converter works directly with the XML DOM via the XOM compatibility layer, traversing
 * the MusicXML elements in the part-list.
 *
 * @author Axel Berndt
 */
export class MusicXml2MsmMpmConverter {
  private readonly ppq: number; // pulses per quarter time resolution
  private readonly cleanup: boolean; // set true to return a clean msm file or false to keep all the crap from the conversion
  private musicXml: MusicXml | null = null;
  private msm: Msm | null = null;
  private mpm: Mpm | null = null;
  private performance: IPerformance | null = null;

  /**
   * constructor
   * @param ppq pulses per quarter time resolution
   * @param cleanup set true to return a clean msm file or false to keep all the crap from the conversion
   */
  constructor(ppq: number, cleanup: boolean) {
    this.ppq = ppq;
    this.cleanup = cleanup;
  }

  /**
   * start the conversion process
   * @param musicXml
   * @return a pair of Msm and Mpm instances; these can be null if an error occurs
   */
  convert(musicXml: MusicXml | null): KeyValue<Msm | null, Mpm | null> {
    if (musicXml === null) {
      console.log('\nThe provided MusicXML object is null and cannot be converted to MSM/MPM.');
      return new KeyValue<Msm | null, Mpm | null>(null, null); // return empty pair
    }

    switch (musicXml.getType()) {
      case MusicXmlType.scorePartwise:
        break;
      case MusicXmlType.scoreTimewise:
        break;
      case MusicXmlType.opus:
        console.log('MusicXML Opus type cannot be converted to MSM/MPM.');
        return new KeyValue<Msm | null, Mpm | null>(null, null); // return empty pair
      case MusicXmlType.unknown:
      default:
        console.log('Unknown MusicXML type. Cannot be converted to MSM/MPM.');
        return new KeyValue<Msm | null, Mpm | null>(null, null); // return empty pair
    }

    const startTime = Date.now(); // we measure the time that the conversion consumes
    console.log(
      `\nConverting ${musicXml.getFile() !== null ? getFileName(musicXml.getFile()!) : 'MusicXML data'} to MSM and MPM.`,
    );

    this.musicXml = musicXml;

    // initialize the Msm and Mpm instances
    const title: string = this.musicXml.getTitle();
    const id = `meico_${uuidv4()}`;
    this.msm = Msm.createMsm(title, id, this.ppq);
    if (this.msm.isEmpty()) {
      // if something went wrong stop the process
      console.error('Failed to initialize and instance of Msm.');
      return new KeyValue<Msm | null, Mpm | null>(null, null);
    }
    this.mpm = Mpm.createMpm();
    if (this.musicXml.getFile() !== null) {
      const filename: string = Helper.getFilenameWithoutExtension(this.musicXml.getFile()!);
      this.msm.setFile(`${filename}.msm`);
      this.mpm.setFile(`${filename}.mpm`);
      const relatedResources: IRelatedResource[] = [];
      relatedResources.push(
        createRelatedResource(getFileName(this.musicXml.getFile()!), 'musicxml')!,
      );
      relatedResources.push(createRelatedResource(getFileName(this.msm.getFile()!), 'msm')!);
      const comment = createComment(
        `This MPM has been generated from '${getFileName(this.musicXml.getFile()!)}' using the meico MEI converter v${Meico.version}.`,
        null,
      );
      addMetadataToMpm(this.mpm, createAuthor('meico', null, null), comment, relatedResources);
    } else {
      const comment = createComment(
        `This MPM has been generated from MEI code using the meico MEI converter v${Meico.version}.`,
        null,
      );
      addMetadataToMpm(this.mpm, createAuthor('meico', null, null), comment, null);
    }

    this.performance = createPerformance('MusicXML export performance', this.ppq); // generate a Performance object
    if (this.performance === null)
      // check it is null
      console.error('Failed to generate an instance of Performance.');
    addPerformanceToMpm(this.mpm, this.performance); // add the performance to the mpm

    // convert
    this.processPartList(); // convert the MusicXML part-list to MSM and MPM parts

    // TODO: ...

    // cleanup
    if (this.cleanup) msmCleanup(this.msm); // cleanup of the msm objects to remove all conversion related and no longer needed entries in the msm objects

    console.log(
      `MusicXML to MSM and MPM conversion finished. Time consumed: ${Date.now() - startTime} milliseconds`,
    );

    return new KeyValue<Msm | null, Mpm | null>(this.msm, this.mpm);
  }

  /**
   * convert the MusicXML part-list to MSM and MPM parts
   *
   * In the Java version, this method uses ProxyMusic's PartList, PartGroup, ScorePart,
   * MidiDevice, MidiInstrument, and ScoreInstrument classes. In the TypeScript port,
   * we traverse the XML elements directly from the part-list element.
   */
  private processPartList(): void {
    const partList: Element | null = this.musicXml!.getPartList();
    if (partList === null) return;

    const groups = new Map<number, Element>(); // group number, part-group element
    let number = 0; // default initial value
    let midiChannel = 0; // default initial value
    let midiPort = 0; // default initial value

    const children = partList.getChildElements();
    for (let ci = 0; ci < children.size(); ci++) {
      const entry: Element = children.get(ci);
      const entryName: string = entry.getLocalName();

      // keep the part-group elements, so we can add their names to the part names
      if (entryName === 'part-group') {
        const typeAttr = entry.getAttribute('type');
        if (typeAttr !== null) {
          const typeVal: string = typeAttr.getValue();
          const numberAttr = entry.getAttribute('number');
          const groupNumber: number = numberAttr !== null ? parseInt(numberAttr.getValue()) : -1;

          switch (typeVal) {
            case 'start':
              groups.set(groupNumber, entry);
              break;
            case 'stop':
              groups.delete(groupNumber);
              break;
          }
        }
        continue;
      }

      // ignore all elements except score-parts
      if (entryName !== 'score-part') continue;

      // convert MusicXml score-part to MSM and MPM part
      const scorePart: Element = entry;
      const idAttr = scorePart.getAttribute('id');
      const id: string = idAttr !== null ? idAttr.getValue() : ''; // required attribute

      let name = '';
      for (const pg of groups.values()) {
        const groupNameElem = pg.getFirstChildElement('group-name');
        if (groupNameElem !== null) {
          const groupNameVal: string = groupNameElem.getValue();
          name += name.length === 0 ? groupNameVal : ` ${groupNameVal}`;
        }
      }
      const partNameElem = scorePart.getFirstChildElement('part-name');
      if (partNameElem !== null) {
        const partNameVal: string = partNameElem.getValue(); // required child element
        name += name.length === 0 ? partNameVal : ` ${partNameVal}`;
      }

      let foundPort = false;
      let foundChannel = false;
      let foundProgramChange = false;
      let midiInstrNum = 0;

      // Check for midi-device and midi-instrument elements
      const midiDevices = scorePart.getChildElements('midi-device');
      const midiInstruments = scorePart.getChildElements('midi-instrument');

      const hasMidiInfo: boolean = midiDevices.size() > 0 || midiInstruments.size() > 0;

      if (hasMidiInfo) {
        // Process midi-device elements for port
        for (let mi = 0; mi < midiDevices.size(); mi++) {
          if (foundPort) break;
          const midiDevice: Element = midiDevices.get(mi);
          const portAttr = midiDevice.getAttribute('port');
          if (portAttr !== null) {
            midiPort = parseInt(portAttr.getValue()) - 1;
            foundPort = true;
          }
        }

        // Process midi-instrument elements for channel and program
        for (let mi = 0; mi < midiInstruments.size(); mi++) {
          if (foundChannel && foundProgramChange) break;
          const midiInstrument: Element = midiInstruments.get(mi);

          if (!foundChannel) {
            const channelElem = midiInstrument.getFirstChildElement('midi-channel');
            if (channelElem !== null) {
              midiChannel = parseInt(channelElem.getValue()) - 1;
              foundChannel = true;
            }
          }

          if (!foundProgramChange) {
            const programElem = midiInstrument.getFirstChildElement('midi-program');
            if (programElem !== null) {
              midiInstrNum = parseInt(programElem.getValue()) - 1;
              foundProgramChange = true;
            }
          }
        }
      }

      // create the MSM part and add it to the MSM
      const part: Element = Msm.makePart(name, number, midiChannel, midiPort);
      const partId = new Attribute('xml:id', 'http://www.w3.org/XML/1998/namespace', id);
      part.addAttribute(partId);
      this.msm!.addPart(part);

      // create the MPM part and add it to the performance
      this.performance!.addPart(createPart(name, number, midiChannel, midiPort, id)!);

      // if no program change number could be found so far, and we have a score-instrument element in the MusicXML, try to get a program change number from its name via the InstrumentsDictionary
      if (!foundProgramChange) {
        const scoreInstruments = scorePart.getChildElements('score-instrument');
        if (scoreInstruments.size() > 0) {
          const scoreInstrument: Element = scoreInstruments.get(0);
          const instrNameElem = scoreInstrument.getFirstChildElement('instrument-name');
          if (instrNameElem !== null) {
            const instrName: string = instrNameElem.getValue();
            const pc = getProgramChangeFromInstrumentName(instrName);
            if (pc >= 0) {
              midiInstrNum = pc;
            }
          }
          foundProgramChange = true;
        }
      }

      // if we have a program change number, we can generate a programChangeMap in the MSM part
      if (foundProgramChange) {
        const programChange = new Element('programChange'); // create a programChange element
        programChange.addAttribute(new Attribute('date', '0.0')); // set its date
        programChange.addAttribute(new Attribute('value', String(midiInstrNum))); // set its value
        const programChangeMap = new Element('programChangeMap'); // create a programChangeMap
        part.getFirstChildElement('dated')!.appendChild(programChangeMap); // add it to the part's dated environment
        programChangeMap.appendChild(programChange); // add the programChange element to the programChangeMap
      }

      number++;
      if (++midiChannel >= 16) {
        midiChannel = 0;
        midiPort++;
      }
    }
  }
}
