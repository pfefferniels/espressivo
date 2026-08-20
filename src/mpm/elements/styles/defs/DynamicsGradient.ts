import { Attribute, Element } from '../../../../xml/XomTypes.js';
import { attribute } from '../../../../xml/tree.js';
import { MPM_NAMESPACE } from '../../../names.js';
import { head, isNonEmpty } from '../../../../prelude/index.js';

/**
 * The `dynamicsGradient` transformer of an `OrnamentDef`: it ramps velocity linearly
 * across the notes of the ornament, writing `ornament.dynamics` onto each.
 *
 * **Deliberately not an `AbstractXmlSubtree`** (RULE C1a) — see {@link getXml}, and the
 * same note on `TemporalSpread`.
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
    const att = attribute('transition.from', xml);
    if (att !== null) this.transitionFrom = parseFloat(att.getValue());
    const att2 = attribute('transition.to', xml);
    if (att2 === null) this.transitionTo = this.transitionFrom;
    else this.transitionTo = parseFloat(att2.getValue());
    const idAtt = attribute('id', xml);
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
    // The `length > 0` arm of the chain this replaces, hoisted: with nothing to write to,
    // neither branch did anything.
    if (!isNonEmpty(chordSequence)) return;
    if (chordSequence.length > 1) {
      const constFac =
        (scale * (this.transitionTo - this.transitionFrom)) / (chordSequence.length - 1);
      const fromVelocity = this.transitionFrom * scale;
      for (const [n, chord] of chordSequence.entries()) {
        const ornamentDynamics = constFac * n + fromVelocity;
        this.setOrnamentDynamicsAtt(ornamentDynamics, chord);
      }
    } else {
      this.setOrnamentDynamicsAtt(this.transitionTo * scale, head(chordSequence));
    }
  }

  private setOrnamentDynamicsAtt(ornamentDynamics: number, chord: Element[]): void {
    for (const note of chord) {
      const ornamentDynamicsAtt = attribute('ornament.dynamics', note);
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
    const dg = new Element('dynamicsGradient', MPM_NAMESPACE);
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
