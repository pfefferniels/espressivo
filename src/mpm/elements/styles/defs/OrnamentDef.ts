import { Attribute, Element } from '../../../../xml/XomTypes.js';
import { Helper } from '../../../../mei/Helper.js';
import { Mpm } from '../../../../mpm/Mpm.js';
import { AbstractDef } from './AbstractDef.js';

/** Unit the frame of a {@link TemporalSpread} is measured in (MPM's `time.unit`). */
export enum FrameDomain {
  Ticks = 'ticks',
  Milliseconds = 'milliseconds',
}
/**
 * Whether a spread also moves note-offs (MPM's `noteoff.shift`). `Monophonic` additionally
 * shortens each note to end where the next one begins, so the ornament never overlaps.
 */
export enum NoteOffShift {
  False = 'false',
  True = 'true',
  Monophonic = 'monophonic',
}

/**
 * The `temporalSpread` transformer of an {@link OrnamentDef}: it distributes the notes of a
 * chord over a time frame, which is what turns a chord into an arpeggio.
 *
 * The class does not touch dates itself; {@link apply} writes `ornament.*` offset attributes
 * onto the notes, and the rendering pass in `OrnamentationMap` consumes them.
 */
export class TemporalSpread {
  frameStart = 0.0;
  private frameLength = 0.0;
  frameDomain: FrameDomain = FrameDomain.Ticks;
  intensity = 1.0;
  noteOffShift: NoteOffShift = NoteOffShift.False;
  private id: string | null = null;
  private xml: Element | null = null;

  /** Without an element the spread starts neutral; with one it parses MPM attributes. */
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

  /** Negative frame lengths are clamped to 0, which is why this is not a plain field. */
  setFrameLength(length: number): void {
    this.frameLength = Math.max(0.0, length);
  }
  getFrameLength(): number {
    return this.frameLength;
  }

  /**
   * Spread a sequence of chords (each an array of simultaneous notes) over the frame.
   *
   * The first chord lands at `frameStart` and the last at `frameStart + frameLength`; the
   * ones between are placed at `(i / (n - 1)) ** intensity` of the frame, so `intensity`
   * bends the spacing — 1 is even, >1 crowds the start, <1 crowds the end. Offsets are
   * ADDED to any offset a note already carries, so several transformers can stack.
   *
   * The last chord is deliberately placed outside the loop rather than at index `n - 1`
   * inside it, which is also what carries `previous` into the final monophonic note-off
   * adjustment. Floating-point operation order here feeds rendered timing — item T19 owns
   * this math; do not reassociate it.
   */
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

  /**
   * Write one chord's date offset, in the attribute names of the current frame domain.
   * @returns the chord itself when it has to be remembered as `previous` for the next
   *   call (monophonic note-off shifting), otherwise null
   */
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
  /**
   * NOT a pure read: for a transformer built programmatically this GENERATES the element and
   * caches it, so the first call has a side effect. {@link toXml} deliberately does not —
   * it returns '' while there is no element.
   */
  getXml(): Element {
    if (this.xml === null) return this.generateXML();
    return this.xml;
  }

  /**
   * Build (and cache) the element for this spread. Only non-default values are written, so
   * a neutral spread serializes as a bare `<temporalSpread/>`.
   */
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

  /**
   * Set, replace or (with null) remove the `xml:id`. Note it reaches the element through
   * {@link getXml}, so calling it on a programmatically built transformer materialises that
   * element as a side effect.
   */
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
 * The `dynamicsGradient` transformer of an {@link OrnamentDef}: it ramps velocity linearly
 * across the notes of the ornament, writing `ornament.dynamics` onto each.
 */
export class DynamicsGradient {
  transitionFrom = 0.0;
  transitionTo = 0.0;
  private id: string | null = null;
  private xml: Element | null = null;

  /** Without an element the gradient starts flat at 0; with one it parses MPM attributes. */
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

  /**
   * Ramp velocity across the chords of an ornament, from `transitionFrom * scale` to
   * `transitionTo * scale`, adding to whatever `ornament.dynamics` a note already carries.
   * A single chord gets `transitionTo * scale` — the end of the ramp, not the start.
   *
   * Floating-point operation order feeds rendered velocity; item T19 owns this math.
   */
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
  /**
   * NOT a pure read: for a transformer built programmatically this GENERATES the element and
   * caches it, so the first call has a side effect. {@link toXml} deliberately does not —
   * it returns '' while there is no element.
   */
  getXml(): Element {
    if (this.xml === null) return this.generateXML();
    return this.xml;
  }

  /**
   * Build (and cache) the element for this gradient. Only non-default values are written,
   * and `transition.to` is omitted whenever it equals `transition.from`, since parsing
   * restores it from there.
   */
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

  /**
   * Set, replace or (with null) remove the `xml:id`. Note it reaches the element through
   * {@link getXml}, so calling it on a programmatically built transformer materialises that
   * element as a side effect.
   */
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
 * An `ornamentDef`: an ornament name ("arpeggio", "trill", …) plus the transformers that
 * realise it — at most one {@link TemporalSpread} and one {@link DynamicsGradient}.
 * Port of meico.mpm.elements.styles.defs.OrnamentDef
 */
export class OrnamentDef extends AbstractDef {
  private temporalSpread: TemporalSpread | null = null;
  private dynamicsGradient: DynamicsGradient | null = null;

  private constructor() {
    super();
  }

  /**
   * Unknown children are ignored, and with several children of the same kind the LAST one
   * wins — each is parsed in document order into the same single-valued field.
   */
  private parseDataInternal(xml: Element): void {
    super.parseData(xml);
    for (const transformer of Helper.getAllChildElements(xml) ?? []) {
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

  protected parseData(xml: Element): void {
    this.parseDataInternal(xml);
  }

  /**
   * Create a def either from a name — with no transformers yet — or by parsing an existing
   * element. Returns null after logging instead of throwing.
   */
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
  /**
   * Replace the spread, in the object and in the element. Every existing `temporalSpread`
   * child is removed first — the loop is not defensive padding, an ornamentDef parsed from
   * hand-written MPM really can carry several — and the new one is appended last, after any
   * `dynamicsGradient`.
   */
  setTemporalSpread(ts: TemporalSpread | null): void {
    this.temporalSpread = ts;
    let old = Helper.getFirstChildElement('temporalSpread', this.getXml()!);
    while (old !== null) {
      this.getXml()!.removeChild(old);
      old = Helper.getFirstChildElement('temporalSpread', this.getXml()!);
    }
    if (ts !== null) this.getXml()!.appendChild(ts.generateXML());
  }

  /** Convenience form of {@link setTemporalSpread} that builds the spread from its values. */
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
  /** Replace the gradient, in the object and in the element; see {@link setTemporalSpread}. */
  setDynamicsGradient(dg: DynamicsGradient | null): void {
    this.dynamicsGradient = dg;
    let old = Helper.getFirstChildElement('dynamicsGradient', this.getXml()!);
    while (old !== null) {
      this.getXml()!.removeChild(old);
      old = Helper.getFirstChildElement('dynamicsGradient', this.getXml()!);
    }
    if (dg !== null) this.getXml()!.appendChild(dg.generateXML());
  }

  /** Convenience form of {@link setDynamicsGradient} that builds the gradient from its values. */
  setDynamicsGradientValues(transitionFrom: number, transitionTo: number): void {
    const dg = new DynamicsGradient();
    dg.transitionFrom = transitionFrom;
    dg.transitionTo = transitionTo;
    this.setDynamicsGradient(dg);
  }

  /**
   * Build a def pre-filled with meico's default meaning for a known ornament name. Only
   * arpeggio is known; any other name yields a def with no transformers, not null.
   *
   * The gradient is set BEFORE the spread, which fixes the child order of the serialized
   * element (`dynamicsGradient` then `temporalSpread`). Do not swap the two calls.
   */
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
