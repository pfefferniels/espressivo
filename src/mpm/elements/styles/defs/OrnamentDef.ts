import { Attribute, Element } from '../../../../xml/XomTypes.js';
import { allChildElements, attribute, firstChildElement } from '../../../../xml/tree.js';
import { MPM_NAMESPACE } from '../../../names.js';
import { AbstractXmlSubtree } from '../../../../xml/AbstractXmlSubtree.js';
import { requireDefName } from './defName.js';
import { DynamicsGradient } from './DynamicsGradient.js';
import {
  TemporalSpread,
  FrameDomain,
  NoteOffShift,
  DEFAULT_ORNAMENT_ALIGNMENT,
  parseOrnamentAlignment,
} from './TemporalSpread.js';
import type { MpmSourceFormat, OrnamentAlignment } from './TemporalSpread.js';

/**
 * An `ornamentDef`: an ornament name ("arpeggio", "trill", …) plus the transformers that
 * realise it — at most one {@link TemporalSpread} and one {@link DynamicsGradient}.
 * Port of meico.mpm.elements.styles.defs.OrnamentDef
 *
 * MPM v3 adds exactly one attribute here, `alignment` — whether the ornament is rendered at
 * the start of its principal note or at its end (`ornamentDef.xml:25-33`). Everything else
 * v3 changed about ornament definitions lives inside {@link TemporalSpread}.
 */
export class OrnamentDef extends AbstractXmlSubtree {
  /** This def's arm of {@link Def}. See {@link requireDefName} on why there is no base class. */
  readonly kind = 'ornament';
  private temporalSpread: TemporalSpread | null = null;
  private dynamicsGradient: DynamicsGradient | null = null;
  private alignment: OrnamentAlignment = DEFAULT_ORNAMENT_ALIGNMENT;
  private sourceFormat: MpmSourceFormat = 'v2';

  private constructor(private readonly nameAttr: Attribute) {
    super();
  }

  getName(): string {
    return this.nameAttr.getValue();
  }

  /** Rename the def, in the object and in the element. Was `AbstractDef.setName`. */
  setName(name: string): void {
    this.nameAttr.setValue(name);
  }

  /**
   * Unknown children are ignored, and with several children of the same kind the LAST one
   * wins — each is parsed in document order into the same single-valued field.
   *
   * `alignment` is then resolved per DESIGN.md D2: it is read from this element (where the
   * spec declares it) **and** from the `temporalSpread` child (where the changelog, the
   * guidelines prose and the reference implementation put it), with this element winning
   * when both carry one. A value that is neither `"at start"` nor `"at end"` is logged and
   * treated as absent, so a malformed attribute here still lets a well-formed one on the
   * spread through rather than silently forcing the default.
   */
  protected parseData(xml: Element): void {
    this.setXml(xml);
    this.id = attribute('id', xml);

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

    if (this.temporalSpread !== null) {
      const fromSpread = this.temporalSpread.getParsedAlignment();
      if (fromSpread !== null) {
        this.alignment = fromSpread;
        this.sourceFormat = 'v3';
      }
      if (this.temporalSpread.getSourceFormat() === 'v3') this.sourceFormat = 'v3';
    }

    const alignmentAtt = attribute('alignment', xml);
    if (alignmentAtt !== null) {
      this.sourceFormat = 'v3'; // the attribute exists in no MPM version before v3
      const alignment = parseOrnamentAlignment(alignmentAtt.getValue());
      if (alignment === null)
        console.error(
          `Warning: attribute ${alignmentAtt.toXML()} of an ornamentDef element is no legal alignment ("at start" or "at end"); the attribute is ignored.`,
        );
      else this.alignment = alignment;
    }
  }

  /**
   * Create a def either from a name — with no transformers yet — or by parsing an existing
   * element. Returns null after logging instead of throwing.
   */
  static createOrnamentDef(name: string): OrnamentDef | null;
  static createOrnamentDef(xml: Element): OrnamentDef | null;
  static createOrnamentDef(nameOrXml: string | Element): OrnamentDef | null {
    try {
      let xml: Element;
      if (typeof nameOrXml === 'string') {
        xml = new Element('ornamentDef', MPM_NAMESPACE);
        xml.addAttribute(new Attribute('name', nameOrXml));
      } else {
        xml = nameOrXml;
      }
      const od = new OrnamentDef(requireDefName(xml, 'OrnamentDef'));
      od.parseData(xml);
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
    // A regenerated spread never carries `alignment` (D2 writes it on ornamentDef only), so a
    // def that had adopted its alignment from the spread it is now replacing would lose it.
    // Re-assert what the def owns. No-op for every v2 def, whose alignment is the default.
    if (this.alignment !== DEFAULT_ORNAMENT_ALIGNMENT) this.setAlignment(this.alignment);
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
   * Where the ornament sits relative to its principal note — `"at start"` (the default) or
   * `"at end"`, which anchors the frame at the principal's end instead (DESIGN.md D10).
   */
  getAlignment(): OrnamentAlignment {
    return this.alignment;
  }

  /**
   * Which MPM generation this def was read from, or the API it was built with (DESIGN.md
   * D12). v3 iff it carries an `alignment` attribute, its `temporalSpread` carries one, that
   * spread is itself v3-sourced, or {@link setAlignment} was called — all four are markers no
   * v2 document can produce, so a v2 def stays v2 and keeps serializing byte-identically.
   */
  getSourceFormat(): MpmSourceFormat {
    return this.sourceFormat;
  }

  /**
   * Set the alignment, in the object and in the element.
   *
   * Writing happens **only here**, and only onto `ornamentDef` — never onto `temporalSpread`
   * (DESIGN.md D2) — and only for `"at end"`, since `"at start"` is the schema default and
   * writing it would add an attribute no reader needs. Setting it makes the def v3-sourced.
   *
   * DOCUMENTED CONSEQUENCE: parsing never moves an existing attribute. A reference-style
   * document that spells `alignment` on its `temporalSpread` is *read* correctly (D2) but
   * re-serializes with the attribute still on the spread, because this class wraps a live XML
   * subtree and mutating a caller's tree at parse time would be a side effect nothing else in
   * this port has. Calling this method is what canonicalises such a def.
   */
  setAlignment(alignment: OrnamentAlignment): void {
    this.alignment = alignment;
    this.sourceFormat = 'v3';
    const alignmentAtt = attribute('alignment', this.getXml());
    if (alignment === DEFAULT_ORNAMENT_ALIGNMENT) {
      // `Element.removeAttribute`, not `Attribute.detach`: an attribute that came out of the
      // parser has no `_xomParent` (`Element.wrap` fills the attribute array directly), and
      // `detach` is a silent no-op for exactly those — which is every attribute of every
      // element read from a document. `removeAttribute` falls back to a name+namespace match.
      if (alignmentAtt !== null) this.getXml().removeAttribute(alignmentAtt);
      return;
    }
    if (alignmentAtt === null) this.getXml().addAttribute(new Attribute('alignment', alignment));
    else alignmentAtt.setValue(alignment);
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
