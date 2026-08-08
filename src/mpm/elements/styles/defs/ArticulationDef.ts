import { Attribute, Element } from '../../../../xml/XomTypes.js';
import { Helper } from '../../../../mei/Helper.js';
import { Mpm } from '../../../../mpm/Mpm.js';
import { AbstractDef } from './AbstractDef.js';

/**
 * Port of meico.mpm.elements.styles.defs.ArticulationDef
 */
export class ArticulationDef extends AbstractDef {
  private absoluteDuration: number | null = null;
  private absoluteDurationChange = 0.0;
  private absoluteDurationMs: number | null = null;
  private absoluteDurationChangeMs = 0.0;
  private relativeDuration = 1.0;
  private absoluteDelay = 0.0;
  private absoluteDelayMs = 0.0;
  private absoluteVelocity: number | null = null;
  private absoluteVelocityChange = 0.0;
  private relativeVelocity = 1.0;
  private detuneCents = 0.0;
  private detuneHz = 0.0;

  private constructor() {
    super();
  }

  private parseDataInternal(xml: Element): void {
    super.parseData(xml);

    for (let c = this.getXml()!.getAttributeCount() - 1; c >= 0; --c) {
      // We need to iterate attributes. Since our XOM layer doesn't have getAttribute(int),
      // we parse from the XML element's attributes by name.
    }

    // Parse known attributes
    const attrs: Record<string, string> = {};
    const knownNames = [
      'absoluteDuration',
      'absoluteDurationChange',
      'absoluteDurationMs',
      'absoluteDurationChangeMs',
      'relativeDuration',
      'absoluteDelay',
      'absoluteDelayMs',
      'absoluteVelocity',
      'relativeVelocity',
      'absoluteVelocityChange',
      'detuneCents',
      'detuneHz',
    ];
    for (const name of knownNames) {
      const a = Helper.getAttribute(name, this.getXml()!);
      if (a !== null) attrs[name] = a.getValue();
    }

    if (attrs['absoluteDuration'] !== undefined)
      this.absoluteDuration = parseFloat(attrs['absoluteDuration']);
    if (attrs['absoluteDurationChange'] !== undefined)
      this.absoluteDurationChange = parseFloat(attrs['absoluteDurationChange']);
    if (attrs['absoluteDurationMs'] !== undefined)
      this.absoluteDurationMs = parseFloat(attrs['absoluteDurationMs']);
    if (attrs['absoluteDurationChangeMs'] !== undefined)
      this.absoluteDurationChangeMs = parseFloat(attrs['absoluteDurationChangeMs']);
    if (attrs['relativeDuration'] !== undefined)
      this.relativeDuration = parseFloat(attrs['relativeDuration']);
    if (attrs['absoluteDelay'] !== undefined)
      this.absoluteDelay = parseFloat(attrs['absoluteDelay']);
    if (attrs['absoluteDelayMs'] !== undefined)
      this.absoluteDelayMs = parseFloat(attrs['absoluteDelayMs']);
    if (attrs['absoluteVelocity'] !== undefined)
      this.absoluteVelocity = parseFloat(attrs['absoluteVelocity']);
    if (attrs['relativeVelocity'] !== undefined)
      this.relativeVelocity = parseFloat(attrs['relativeVelocity']);
    if (attrs['absoluteVelocityChange'] !== undefined)
      this.absoluteVelocityChange = parseFloat(attrs['absoluteVelocityChange']);
    if (attrs['detuneCents'] !== undefined) this.detuneCents = parseFloat(attrs['detuneCents']);
    if (attrs['detuneHz'] !== undefined) this.detuneHz = parseFloat(attrs['detuneHz']);
  }

  protected parseData(xml: Element): void {
    this.parseDataInternal(xml);
  }

  static createArticulationDef(name: string): ArticulationDef | null;
  static createArticulationDef(xml: Element): ArticulationDef | null;
  static createArticulationDef(nameOrXml: string | Element): ArticulationDef | null {
    try {
      const ad = new ArticulationDef();
      if (typeof nameOrXml === 'string') {
        const e = new Element('articulationDef', Mpm.MPM_NAMESPACE);
        e.addAttribute(new Attribute('name', nameOrXml));
        ad.parseDataInternal(e);
      } else {
        ad.parseDataInternal(nameOrXml);
      }
      return ad;
    } catch (e) {
      console.error(e);
      return null;
    }
  }

  resetAttribute(name: string): void {
    const a = Helper.getAttribute(name, this.getXml()!);
    if (a === null) return;
    this.getXml()!.removeAttribute(a);
    switch (name) {
      case 'absoluteDuration':
        this.absoluteDuration = null;
        break;
      case 'absoluteDurationChange':
        this.absoluteDurationChange = 0.0;
        break;
      case 'absoluteDurationMs':
        this.absoluteDurationMs = null;
        break;
      case 'absoluteDurationChangeMs':
        this.absoluteDurationChangeMs = 0.0;
        break;
      case 'relativeDuration':
        this.relativeDuration = 1.0;
        break;
      case 'absoluteDelay':
        this.absoluteDelay = 0.0;
        break;
      case 'absoluteDelayMs':
        this.absoluteDelayMs = 0.0;
        break;
      case 'absoluteVelocity':
        this.absoluteVelocity = null;
        break;
      case 'relativeVelocity':
        this.relativeVelocity = 1.0;
        break;
      case 'absoluteVelocityChange':
        this.absoluteVelocityChange = 0.0;
        break;
      case 'detuneCents':
        this.detuneCents = 0.0;
        break;
      case 'detuneHz':
        this.detuneHz = 0.0;
        break;
    }
  }

  getAbsoluteDuration(): number | null {
    return this.absoluteDuration;
  }
  setAbsoluteDuration(v: number): void {
    this.absoluteDuration = v;
    this.getXml()!.addAttribute(new Attribute('absoluteDuration', String(v)));
  }
  getAbsoluteDurationChange(): number {
    return this.absoluteDurationChange;
  }
  setAbsoluteDurationChange(v: number): void {
    this.absoluteDurationChange = v;
    this.getXml()!.addAttribute(new Attribute('absoluteDurationChange', String(v)));
  }
  getAbsoluteDurationMs(): number | null {
    return this.absoluteDurationMs;
  }
  setAbsoluteDurationMs(v: number): void {
    this.absoluteDurationMs = v;
    this.getXml()!.addAttribute(new Attribute('absoluteDurationMs', String(v)));
  }
  getAbsoluteDurationChangeMs(): number {
    return this.absoluteDurationChangeMs;
  }
  setAbsoluteDurationChangeMs(v: number): void {
    this.absoluteDurationChangeMs = v;
    this.getXml()!.addAttribute(new Attribute('absoluteDurationChangeMs', String(v)));
  }
  getRelativeDuration(): number {
    return this.relativeDuration;
  }
  setRelativeDuration(v: number): void {
    this.relativeDuration = v;
    this.getXml()!.addAttribute(new Attribute('relativeDuration', String(v)));
  }
  getAbsoluteDelay(): number {
    return this.absoluteDelay;
  }
  setAbsoluteDelay(v: number): void {
    this.absoluteDelay = v;
    this.getXml()!.addAttribute(new Attribute('absoluteDelay', String(v)));
  }
  getAbsoluteDelayMs(): number {
    return this.absoluteDelayMs;
  }
  setAbsoluteDelayMs(v: number): void {
    this.absoluteDelayMs = v;
    this.getXml()!.addAttribute(new Attribute('absoluteDelayMs', String(v)));
  }
  getAbsoluteVelocity(): number | null {
    return this.absoluteVelocity;
  }
  setAbsoluteVelocity(v: number): void {
    this.absoluteVelocity = v;
    this.getXml()!.addAttribute(new Attribute('absoluteVelocity', String(v)));
  }
  getRelativeVelocity(): number {
    return this.relativeVelocity;
  }
  setRelativeVelocity(v: number): void {
    this.relativeVelocity = v;
    this.getXml()!.addAttribute(new Attribute('relativeVelocity', String(v)));
  }
  getAbsoluteVelocityChange(): number {
    return this.absoluteVelocityChange;
  }
  setAbsoluteVelocityChange(v: number): void {
    this.absoluteVelocityChange = v;
    this.getXml()!.addAttribute(new Attribute('absoluteVelocityChange', String(v)));
  }
  getDetuneCents(): number {
    return this.detuneCents;
  }
  setDetuneCents(v: number): void {
    this.detuneCents = v;
    this.getXml()!.addAttribute(new Attribute('detuneCents', String(v)));
  }
  getDetuneHz(): number {
    return this.detuneHz;
  }
  setDetuneHz(v: number): void {
    this.detuneHz = v;
    this.getXml()!.addAttribute(new Attribute('detuneHz', String(v)));
  }

  static createDefaultArticulationDef(name: string): ArticulationDef | null {
    const d = ArticulationDef.createArticulationDef(name);
    if (d === null) return null;
    switch (name.trim().toLowerCase()) {
      case 'accent':
      case 'acc':
        d.setAbsoluteVelocityChange(25.0);
        break;
      case 'breath':
      case 'cesura':
      case 'caesura':
        d.setAbsoluteDurationChangeMs(-400.0);
        d.setAbsoluteVelocityChange(-5.0);
        break;
      case 'legatissimo':
        d.setAbsoluteDurationChangeMs(250.0);
        break;
      case 'legato':
      case 'leg':
        d.setRelativeDuration(1.0);
        break;
      case 'legatostop':
        d.setRelativeDuration(0.8);
        d.setRelativeVelocity(0.7);
        break;
      case 'marcato':
      case 'marc':
        d.setRelativeDuration(0.8);
        d.setAbsoluteVelocityChange(25.0);
        break;
      case 'nonlegato':
        d.setRelativeDuration(0.95);
        break;
      case 'pizzicato':
      case 'pizz':
      case 'left-hand pizzicato':
      case 'lhpizz':
        d.setAbsoluteDuration(1.0);
        break;
      case 'portato':
      case 'port':
        d.setRelativeDuration(0.8);
        break;
      case 'sf':
      case 'sfz':
      case 'fz':
      case 'sforzato':
        d.setAbsoluteVelocity(127.0);
        d.setRelativeDuration(0.8);
        break;
      case 'snap':
      case 'snap pizzicato':
        d.setAbsoluteDuration(1.0);
        d.setAbsoluteVelocityChange(25.0);
        break;
      case 'spiccato':
      case 'spicc':
        d.setAbsoluteDurationMs(140.0);
        d.setAbsoluteVelocityChange(25);
        break;
      case 'staccato':
      case 'stacc':
        d.setAbsoluteDurationMs(160.0);
        d.setAbsoluteVelocityChange(-5.0);
        break;
      case 'staccatissimo':
      case 'stacciss':
        d.setAbsoluteDurationMs(140.0);
        d.setAbsoluteVelocityChange(5.0);
        break;
      case 'standardarticulation':
        d.setAbsoluteDurationChange(-70.0);
        break;
      case 'tenuto':
      case 'ten':
        d.setRelativeDuration(0.9);
        d.setAbsoluteVelocityChange(12.0);
        break;
    }
    return d;
  }

  articulateNote(note: Element | null): boolean {
    if (note === null) return false;
    let dateChanged = false;

    const durationAtt = Helper.getAttribute('duration.perf', note);
    if (durationAtt !== null) {
      if (this.absoluteDurationMs !== null) {
        note.addAttribute(
          new Attribute('articulation.absoluteDurationMs', String(this.absoluteDurationMs)),
        );
      } else {
        if (this.absoluteDuration !== null) durationAtt.setValue(String(this.absoluteDuration));
        if (this.relativeDuration !== 1.0)
          durationAtt.setValue(String(parseFloat(durationAtt.getValue()) * this.relativeDuration));
        if (this.absoluteDurationChange !== 0.0) {
          const dur = parseFloat(durationAtt.getValue());
          if (dur > 0.0) {
            let durNew = dur + this.absoluteDurationChange;
            for (let reduce = 2.0; durNew <= 0.0; reduce *= 2.0)
              durNew = dur + this.absoluteDurationChange / reduce;
            durationAtt.setValue(String(durNew));
          }
        }
      }
      if (this.absoluteDurationChangeMs !== 0.0)
        note.addAttribute(
          new Attribute(
            'articulation.absoluteDurationChangeMs',
            String(this.absoluteDurationChangeMs),
          ),
        );
    }

    const dateAtt = Helper.getAttribute('date.perf', note);
    if (dateAtt !== null) {
      if (this.absoluteDelay !== 0.0) {
        dateAtt.setValue(String(parseFloat(dateAtt.getValue()) + this.absoluteDelay));
        dateChanged = true;
      }
      if (this.absoluteDelayMs !== 0.0)
        note.addAttribute(
          new Attribute('articulation.absoluteDelayMs', String(this.absoluteDelayMs)),
        );
    }

    const velocityAtt = Helper.getAttribute('velocity', note);
    if (velocityAtt !== null) {
      if (this.absoluteVelocity !== null) velocityAtt.setValue(String(this.absoluteVelocity));
      if (this.relativeVelocity !== 1.0)
        velocityAtt.setValue(String(parseFloat(velocityAtt.getValue()) * this.relativeVelocity));
      if (this.absoluteVelocityChange !== 0.0)
        velocityAtt.setValue(
          String(parseFloat(velocityAtt.getValue()) + this.absoluteVelocityChange),
        );
    }

    if (this.detuneCents !== 0.0)
      note.addAttribute(new Attribute('detuneCents', String(this.detuneCents)));
    if (this.detuneHz !== 0.0) note.addAttribute(new Attribute('detuneHz', String(this.detuneHz)));

    return dateChanged;
  }
}
