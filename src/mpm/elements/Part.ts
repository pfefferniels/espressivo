import { Attribute, Element } from '../../xml/XomTypes.js';
import { AbstractXmlSubtree } from '../../xml/AbstractXmlSubtree.js';
import { Helper } from '../../mei/Helper.js';
import { Mpm } from '../../mpm/Mpm.js';
import { Header } from './Header.js';
import { Dated } from './Dated.js';
import type { Global } from './Global.js';

/**
 * An MPM `<part>` element: the performance information for one part of the score.
 * Port of meico.mpm.elements.Part
 *
 * Like {@link Global} it owns a {@link Header} and a {@link Dated}, but it also carries the
 * identity used to match it against an MSM part: `number`, `name`, `midi.channel` and
 * `midi.port`. {@link Performance.getCorrespondingPart} matches by number first, then by
 * name, so the two documents need not agree on both.
 *
 * `number`, `midi.channel` and `midi.port` are required — {@link parseData} throws without
 * them — while a missing `name` is filled in as empty rather than rejected.
 */
export class Part extends AbstractXmlSubtree {
  private global: Global | null = null;
  private header: Header | null = null;
  private dated: Dated | null = null;
  private nameAttr: Attribute | null = null;
  private number = 0;
  private midiChannel = 0;
  private midiPort = 0;
  private id: Attribute | null = null;

  private constructor() {
    super();
  }

  /**
   * Create a part from its identifying values (optionally with an `xml:id`), or by parsing
   * an existing `<part>` element. Returns null — after logging — instead of throwing, as
   * every factory in this cluster does; the from-scratch form cannot actually fail, since
   * it writes the three required attributes itself.
   */
  static createPart(
    name: string,
    number: number,
    midiChannel: number,
    midiPort: number,
    id?: string,
  ): Part | null;
  static createPart(xml: Element): Part | null;
  static createPart(
    nameOrXml: string | Element,
    number?: number,
    midiChannel?: number,
    midiPort?: number,
    id?: string,
  ): Part | null {
    try {
      const p = new Part();
      if (typeof nameOrXml === 'string') {
        const part = new Element('part', Mpm.MPM_NAMESPACE);
        part.addAttribute(new Attribute('name', nameOrXml));
        part.addAttribute(new Attribute('number', String(number)));
        part.addAttribute(new Attribute('midi.channel', String(midiChannel)));
        part.addAttribute(new Attribute('midi.port', String(midiPort)));
        p.parseData(part);
        if (id !== undefined) p.setId(id);
      } else {
        p.parseData(nameOrXml);
      }
      return p;
    } catch (e) {
      console.error(e);
      return null;
    }
  }

  /**
   * After this has run, {@link getXml} returns the very element passed in — `setXml` stores
   * it verbatim rather than copying, so {@link nameAttr} and {@link id} stay live views onto
   * that element and the setters write through to the document.
   *
   * Note the ordering: the three required attributes are validated *before* `setXml`, so a
   * `<part>` that fails validation leaves this object without an XML element rather than
   * half-initialised. Missing `<header>`/`<dated>` children are created and appended, as in
   * {@link Global.parseData}.
   *
   * The closing `setEnvironment(this.global, this)` runs while {@link global} is still null
   * — a part parsed on its own has no performance yet — so the maps get a local header but
   * no global one. {@link setGlobal} repeats the call once the part is attached to a
   * {@link Performance}, and that is when the global header arrives.
   */
  protected parseData(xml: Element): void {
    if (xml === null) throw new Error('Cannot generate Part object. XML Element is null.');
    this.nameAttr = Helper.getAttribute('name', xml);
    if (this.nameAttr === null) {
      this.nameAttr = new Attribute('name', '');
      xml.addAttribute(this.nameAttr);
    }
    const numberAttr = Helper.getAttribute('number', xml);
    if (numberAttr === null || numberAttr.getValue() === '')
      throw new Error('Cannot generate Part object. Attribute number is missing or empty.');
    const midiChannelAtt = Helper.getAttribute('midi.channel', xml);
    if (midiChannelAtt === null || midiChannelAtt.getValue() === '')
      throw new Error('Cannot generate Part object. Attribute midi.channel is missing or empty.');
    const midiPortAtt = Helper.getAttribute('midi.port', xml);
    if (midiPortAtt === null || midiPortAtt.getValue() === '')
      throw new Error('Cannot generate Part object. Attribute midi.port is missing or empty.');

    this.setXml(xml);
    this.number = parseInt(numberAttr.getValue());
    this.midiChannel = parseInt(midiChannelAtt.getValue());
    this.midiPort = parseInt(midiPortAtt.getValue());
    this.id = Helper.getAttribute('id', this.getXml()!);

    const headerElt = Helper.getFirstChildElement('header', this.getXml()!);
    if (headerElt === null) {
      this.header = Header.createHeader()!;
      this.getXml()!.appendChild(this.header.getXml()!);
    } else {
      this.header = Header.createHeader(headerElt);
    }

    const datedElt = Helper.getFirstChildElement('dated', this.getXml()!);
    if (datedElt === null) {
      this.dated = Dated.createDated()!;
      this.getXml()!.appendChild(this.dated.getXml()!);
    } else {
      this.dated = Dated.createDated(datedElt);
    }

    if (this.dated === null)
      throw new Error('Cannot generate Part object. Failed to generate Dated object.');
    this.dated.setEnvironment(this.global, this);
  }

  getHeader(): Header | null {
    return this.header;
  }
  getDated(): Dated | null {
    return this.dated;
  }
  getName(): string {
    return this.nameAttr!.getValue();
  }
  setName(name: string): void {
    this.nameAttr!.setValue(name);
  }
  getNumber(): number {
    return this.number;
  }
  setNumber(number: number): void {
    this.number = number;
    Helper.getAttribute('number', this.getXml()!)!.setValue(String(this.number));
  }
  getMidiChannel(): number {
    return this.midiChannel;
  }
  setMidiChannel(midiChannel: number): void {
    this.midiChannel = midiChannel;
    Helper.getAttribute('midi.channel', this.getXml()!)!.setValue(String(this.midiChannel));
  }
  getMidiPort(): number {
    return this.midiPort;
  }
  setMidiPort(midiPort: number): void {
    this.midiPort = midiPort;
    Helper.getAttribute('midi.port', this.getXml()!)!.setValue(String(this.midiPort));
  }
  setGlobal(global: Global | null): void {
    this.global = global;
    this.getDated()!.setEnvironment(this.global, this);
  }
  getGlobal(): Global | null {
    return this.global;
  }

  setId(id: string | null): void {
    if (id === null) {
      if (this.id !== null) {
        this.id.detach();
        this.id = null;
      }
      return;
    }
    if (this.id === null) {
      this.id = new Attribute('xml:id', 'http://www.w3.org/XML/1998/namespace', id);
      this.getXml()!.addAttribute(this.id);
      return;
    }
    this.id.setValue(id);
  }
  getId(): string | null {
    return this.id === null ? null : this.id.getValue();
  }
}
