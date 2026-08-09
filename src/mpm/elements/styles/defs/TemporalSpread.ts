import { Attribute, Element } from '../../../../xml/XomTypes.js';
import { attribute } from '../../../../xml/tree.js';
import { MPM_NAMESPACE } from '../../../names.js';

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
 * The `temporalSpread` transformer of an `OrnamentDef`: it distributes the notes of a
 * chord over a time frame, which is what turns a chord into an arpeggio.
 *
 * The class does not touch dates itself; {@link apply} writes `ornament.*` offset attributes
 * onto the notes, and the rendering pass in `OrnamentationMap` consumes them.
 *
 * **Deliberately not an `AbstractXmlSubtree`** (RULE C1a). {@link getXml} here lazily
 * generates and caches its element instead of reading a field, so a programmatically built
 * spread serializes on first access. Moving this class under that hierarchy would replace
 * generate-on-demand with a plain field read and such a spread would silently serialize as
 * nothing. It lives in its own module for the same reason it is separate at all: importing
 * a transformer should not drag `OrnamentDef` in with it.
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
    const domain = attribute('time.unit', xml);
    if (domain !== null && domain.getValue() === 'milliseconds')
      this.frameDomain = FrameDomain.Milliseconds;
    const start = attribute('frame.start', xml);
    if (start !== null) this.frameStart = parseFloat(start.getValue());
    const length = attribute('frameLength', xml);
    if (length !== null) this.setFrameLength(parseFloat(length.getValue()));
    const intensityAtt = attribute('intensity', xml);
    if (intensityAtt !== null) this.intensity = parseFloat(intensityAtt.getValue());
    const noteoffAtt = attribute('noteoff.shift', xml);
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
    const idAtt = attribute('id', xml);
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
      const ornamentDateAtt = attribute(dateAttName, note);
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
            const prevDateOffsetAtt = attribute(dateAttName, prev);
            if (prevDateOffsetAtt === null) continue;
            const ornamentDurationAtt = attribute(durAttName, prev);
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
    const ts = new Element('temporalSpread', MPM_NAMESPACE);
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
    let idAtt = attribute('id', this.getXml());
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
