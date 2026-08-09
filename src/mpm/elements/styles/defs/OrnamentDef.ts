import { Attribute, Element } from '../../../../xml/XomTypes.js';
import { allChildElements, firstChildElement } from '../../../../xml/tree.js';
import { MPM_NAMESPACE } from '../../../names.js';
import { AbstractDef } from './AbstractDef.js';
import { DynamicsGradient } from './DynamicsGradient.js';
import { TemporalSpread, FrameDomain, NoteOffShift } from './TemporalSpread.js';

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
    for (const transformer of allChildElements(xml)) {
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
        const e = new Element('ornamentDef', MPM_NAMESPACE);
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
    let old = firstChildElement('temporalSpread', this.getXml());
    while (old !== null) {
      this.getXml().removeChild(old);
      old = firstChildElement('temporalSpread', this.getXml());
    }
    if (ts !== null) this.getXml().appendChild(ts.generateXML());
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
    let old = firstChildElement('dynamicsGradient', this.getXml());
    while (old !== null) {
      this.getXml().removeChild(old);
      old = firstChildElement('dynamicsGradient', this.getXml());
    }
    if (dg !== null) this.getXml().appendChild(dg.generateXML());
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
