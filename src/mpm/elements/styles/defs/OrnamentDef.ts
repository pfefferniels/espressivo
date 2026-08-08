import { Attribute, Element } from '../../../../xml/XomTypes.js';
import { Helper } from '../../../../mei/Helper.js';
import { Mpm } from '../../../../mpm/Mpm.js';
import { AbstractDef } from './AbstractDef.js';

export enum FrameDomain {
  Ticks = 'ticks',
  Milliseconds = 'milliseconds',
}
export enum NoteOffShift {
  False = 'false',
  True = 'true',
  Monophonic = 'monophonic',
}

export class TemporalSpread {
  frameStart = 0.0;
  private frameLength = 0.0;
  frameDomain: FrameDomain = FrameDomain.Ticks;
  intensity = 1.0;
  noteOffShift: NoteOffShift = NoteOffShift.False;
  private id: string | null = null;
  private xml: Element | null = null;

  constructor();
  constructor(xml: Element);
  constructor(xml?: Element) {
    if (xml === undefined) return;
    this.xml = xml;
    const domain = Helper.getAttribute('time.unit', xml);
    if (domain !== null && domain.getValue() === 'milliseconds')
      this.frameDomain = FrameDomain.Milliseconds;
    const start = Helper.getAttribute('frame.start', xml);
    if (start !== null) this.frameStart = parseFloat(start.getValue());
    const length = Helper.getAttribute('frameLength', xml);
    if (length !== null) this.setFrameLength(parseFloat(length.getValue()));
    const intensityAtt = Helper.getAttribute('intensity', xml);
    if (intensityAtt !== null) this.intensity = parseFloat(intensityAtt.getValue());
    const noteoffAtt = Helper.getAttribute('noteoff.shift', xml);
    if (noteoffAtt !== null) {
      switch (noteoffAtt.getValue()) {
        case 'true':
          this.noteOffShift = NoteOffShift.True;
          break;
        case 'monophonic':
          this.noteOffShift = NoteOffShift.Monophonic;
          break;
      }
    }
    const idAtt = Helper.getAttribute('id', xml);
    if (idAtt !== null) this.id = idAtt.getValue();
  }

  setFrameLength(length: number): void {
    this.frameLength = Math.max(0.0, length);
  }
  getFrameLength(): number {
    return this.frameLength;
  }

  apply(chordSequence: Element[][]): void {
    if (chordSequence.length < 1) return;
    let previous: Element[] | null = null;
    if (chordSequence.length > 1) {
      for (let i = 0; i < chordSequence.length - 1; ++i) {
        const dateOffset =
          Math.pow(i / (chordSequence.length - 1), this.intensity) * this.frameLength +
          this.frameStart;
        previous = this.setOrnamentDateAtts(dateOffset, chordSequence[i], previous);
      }
    }
    this.setOrnamentDateAtts(
      this.frameStart + this.frameLength,
      chordSequence[chordSequence.length - 1],
      previous,
    );
  }

  private setOrnamentDateAtts(
    dateOffset: number,
    chord: Element[],
    previous: Element[] | null,
  ): Element[] | null {
    let dateAttName: string, durAttName: string;
    switch (this.frameDomain) {
      case FrameDomain.Ticks:
        dateAttName = 'ornament.date.offset';
        durAttName = 'ornament.duration';
        break;
      case FrameDomain.Milliseconds:
        dateAttName = 'ornament.milliseconds.date.offset';
        durAttName = 'ornament.milliseconds.duration';
        break;
      default:
        return null;
    }
    for (const note of chord) {
      const ornamentDateAtt = Helper.getAttribute(dateAttName, note);
      if (ornamentDateAtt !== null)
        ornamentDateAtt.setValue(String(dateOffset + parseFloat(ornamentDateAtt.getValue())));
      else note.addAttribute(new Attribute(dateAttName, String(dateOffset)));
    }
    switch (this.noteOffShift) {
      case NoteOffShift.False:
        return null;
      case NoteOffShift.True:
        for (const note of chord)
          note.addAttribute(new Attribute('ornament.noteoff.shift', 'true'));
        return null;
      case NoteOffShift.Monophonic:
        if (previous !== null) {
          for (const prev of previous) {
            const prevDateOffsetAtt = Helper.getAttribute(dateAttName, prev);
            if (prevDateOffsetAtt === null) continue;
            const ornamentDurationAtt = Helper.getAttribute(durAttName, prev);
            if (ornamentDurationAtt !== null)
              ornamentDurationAtt.setValue(
                String(dateOffset - parseFloat(prevDateOffsetAtt.getValue())),
              );
            else
              prev.addAttribute(
                new Attribute(
                  durAttName,
                  String(dateOffset - parseFloat(prevDateOffsetAtt.getValue())),
                ),
              );
          }
        }
        return chord;
      default:
        return null;
    }
  }

  setXml(xml: Element): void {
    this.xml = xml;
  }
  getXml(): Element {
    if (this.xml === null) return this.generateXML();
    return this.xml;
  }

  generateXML(): Element {
    const ts = new Element('temporalSpread', Mpm.MPM_NAMESPACE);
    if (this.frameStart !== 0.0)
      ts.addAttribute(new Attribute('frame.start', String(this.frameStart)));
    if (this.frameLength !== 0.0)
      ts.addAttribute(new Attribute('frameLength', String(this.frameLength)));
    if (this.frameDomain === FrameDomain.Milliseconds)
      ts.addAttribute(new Attribute('time.unit', 'milliseconds'));
    if (this.intensity !== 1.0) ts.addAttribute(new Attribute('intensity', String(this.intensity)));
    if (this.noteOffShift === NoteOffShift.True)
      ts.addAttribute(new Attribute('noteoff.shift', 'true'));
    else if (this.noteOffShift === NoteOffShift.Monophonic)
      ts.addAttribute(new Attribute('noteoff.shift', 'monophonic'));
    if (this.id !== null && this.id !== '')
      ts.addAttribute(new Attribute('xml:id', 'http://www.w3.org/XML/1998/namespace', this.id));
    this.setXml(ts);
    return this.xml!;
  }

  toXml(): string {
    if (this.xml === null) return '';
    return this.xml.toXML();
  }

  setId(id: string | null): void {
    let idAtt = Helper.getAttribute('id', this.getXml());
    if (id === null) {
      if (idAtt !== null) {
        idAtt.detach();
        this.id = null;
      }
      return;
    }
    if (idAtt === null) {
      this.id = id;
      idAtt = new Attribute('xml:id', 'http://www.w3.org/XML/1998/namespace', id);
      this.getXml().addAttribute(idAtt);
      return;
    }
    this.id = id;
    idAtt.setValue(id);
  }

  getId(): string | null {
    return this.id;
  }
}

export class DynamicsGradient {
  transitionFrom = 0.0;
  transitionTo = 0.0;
  private id: string | null = null;
  private xml: Element | null = null;

  constructor();
  constructor(xml: Element);
  constructor(xml?: Element) {
    if (xml === undefined) return;
    this.xml = xml;
    const att = Helper.getAttribute('transition.from', xml);
    if (att !== null) this.transitionFrom = parseFloat(att.getValue());
    const att2 = Helper.getAttribute('transition.to', xml);
    if (att2 === null) this.transitionTo = this.transitionFrom;
    else this.transitionTo = parseFloat(att2.getValue());
    const idAtt = Helper.getAttribute('id', xml);
    if (idAtt !== null) this.id = idAtt.getValue();
  }

  apply(chordSequence: Element[][], scale: number): void {
    if (chordSequence.length > 1) {
      const constFac =
        (scale * (this.transitionTo - this.transitionFrom)) / (chordSequence.length - 1);
      const fromVelocity = this.transitionFrom * scale;
      for (let n = 0; n < chordSequence.length; ++n) {
        const ornamentDynamics = constFac * n + fromVelocity;
        this.setOrnamentDynamicsAtt(ornamentDynamics, chordSequence[n]);
      }
    } else if (chordSequence.length > 0) {
      this.setOrnamentDynamicsAtt(this.transitionTo * scale, chordSequence[0]);
    }
  }

  private setOrnamentDynamicsAtt(ornamentDynamics: number, chord: Element[]): void {
    for (const note of chord) {
      const ornamentDynamicsAtt = Helper.getAttribute('ornament.dynamics', note);
      if (ornamentDynamicsAtt !== null) {
        const val = ornamentDynamics + parseFloat(ornamentDynamicsAtt.getValue());
        ornamentDynamicsAtt.setValue(String(val));
      } else {
        note.addAttribute(new Attribute('ornament.dynamics', String(ornamentDynamics)));
      }
    }
  }

  setXml(xml: Element): void {
    this.xml = xml;
  }
  getXml(): Element {
    if (this.xml === null) return this.generateXML();
    return this.xml;
  }

  generateXML(): Element {
    const dg = new Element('dynamicsGradient', Mpm.MPM_NAMESPACE);
    if (this.transitionFrom !== 0.0)
      dg.addAttribute(new Attribute('transition.from', String(this.transitionFrom)));
    if (this.transitionTo !== this.transitionFrom)
      dg.addAttribute(new Attribute('transition.to', String(this.transitionTo)));
    if (this.id !== null && this.id !== '')
      dg.addAttribute(new Attribute('xml:id', 'http://www.w3.org/XML/1998/namespace', this.id));
    this.setXml(dg);
    return this.xml!;
  }

  toXml(): string {
    if (this.xml === null) return '';
    return this.xml.toXML();
  }

  setId(id: string | null): void {
    let idAtt = Helper.getAttribute('id', this.getXml());
    if (id === null) {
      if (idAtt !== null) {
        idAtt.detach();
        this.id = null;
      }
      return;
    }
    if (idAtt === null) {
      this.id = id;
      idAtt = new Attribute('xml:id', 'http://www.w3.org/XML/1998/namespace', id);
      this.getXml().addAttribute(idAtt);
      return;
    }
    this.id = id;
    idAtt.setValue(id);
  }

  getId(): string | null {
    return this.id;
  }
}

/**
 * Port of meico.mpm.elements.styles.defs.OrnamentDef
 */
export class OrnamentDef extends AbstractDef {
  private temporalSpread: TemporalSpread | null = null;
  private dynamicsGradient: DynamicsGradient | null = null;

  private constructor() {
    super();
  }

  private parseDataInternal(xml: Element): void {
    super.parseData(xml);
    const children = Helper.getAllChildElements(this.getXml()!);
    if (children) {
      for (const transformer of children) {
        switch (transformer.getLocalName()) {
          case 'dynamicsGradient':
            this.dynamicsGradient = new DynamicsGradient(transformer);
            break;
          case 'temporalSpread':
            this.temporalSpread = new TemporalSpread(transformer);
            break;
        }
      }
    }
  }

  protected parseData(xml: Element): void {
    this.parseDataInternal(xml);
  }

  static createOrnamentDef(name: string): OrnamentDef | null;
  static createOrnamentDef(xml: Element): OrnamentDef | null;
  static createOrnamentDef(nameOrXml: string | Element): OrnamentDef | null {
    try {
      const od = new OrnamentDef();
      if (typeof nameOrXml === 'string') {
        const e = new Element('ornamentDef', Mpm.MPM_NAMESPACE);
        e.addAttribute(new Attribute('name', nameOrXml));
        od.parseDataInternal(e);
      } else {
        od.parseDataInternal(nameOrXml);
      }
      return od;
    } catch (e) {
      console.error(e);
      return null;
    }
  }

  getTemporalSpread(): TemporalSpread | null {
    return this.temporalSpread;
  }
  setTemporalSpread(ts: TemporalSpread | null): void {
    this.temporalSpread = ts;
    let old = Helper.getFirstChildElement('temporalSpread', this.getXml()!);
    while (old !== null) {
      this.getXml()!.removeChild(old);
      old = Helper.getFirstChildElement('temporalSpread', this.getXml()!);
    }
    if (ts !== null) this.getXml()!.appendChild(ts.generateXML());
  }

  setTemporalSpreadValues(
    frameStart: number,
    frameLength: number,
    frameDomain: FrameDomain,
    intensity: number,
    noteOffShift: NoteOffShift,
  ): void {
    const ts = new TemporalSpread();
    ts.frameStart = frameStart;
    ts.setFrameLength(frameLength);
    ts.frameDomain = frameDomain;
    ts.intensity = intensity;
    ts.noteOffShift = noteOffShift;
    this.setTemporalSpread(ts);
  }

  getDynamicsGradient(): DynamicsGradient | null {
    return this.dynamicsGradient;
  }
  setDynamicsGradient(dg: DynamicsGradient | null): void {
    this.dynamicsGradient = dg;
    let old = Helper.getFirstChildElement('dynamicsGradient', this.getXml()!);
    while (old !== null) {
      this.getXml()!.removeChild(old);
      old = Helper.getFirstChildElement('dynamicsGradient', this.getXml()!);
    }
    if (dg !== null) this.getXml()!.appendChild(dg.generateXML());
  }

  setDynamicsGradientValues(transitionFrom: number, transitionTo: number): void {
    const dg = new DynamicsGradient();
    dg.transitionFrom = transitionFrom;
    dg.transitionTo = transitionTo;
    this.setDynamicsGradient(dg);
  }

  static createDefaultOrnamentDef(name: string): OrnamentDef | null {
    const def = OrnamentDef.createOrnamentDef(name);
    if (def === null) return null;
    switch (name.trim().toLowerCase()) {
      case 'arpeg':
      case 'arpeggio':
        def.setDynamicsGradientValues(-1.0, 1.0);
        def.setTemporalSpreadValues(-22.0, 44.0, FrameDomain.Ticks, 1.0, NoteOffShift.False);
    }
    return def;
  }
}
