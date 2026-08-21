import { Attribute, Element } from '../../../../xml/XomTypes.js';
import { attribute } from '../../../../xml/tree.js';
import { MPM_NAMESPACE } from '../../../names.js';
import { parseJavaDouble } from '../../../../supplementary/parseJavaDouble.js';
import { AbstractXmlSubtree } from '../../../../xml/AbstractXmlSubtree.js';
import { requireDefName, skipMalformedDef } from './defName.js';
import { isErr, ok, type Result } from '../../../../prelude/index.js';
import { type MpmParseError } from '../../parseError.js';

/**
 * An `articulationDef`: the bundle of duration, timing, velocity and detuning changes that
 * one articulation name ("staccato", "accent", …) stands for.
 * Port of meico.mpm.elements.styles.defs.ArticulationDef
 *
 * The `absolute*` fields that default to null mean "leave the note's own value alone",
 * which is why they are `number | null` rather than 0: an absolute duration of 0 is a
 * meaningful (if extreme) instruction. The `*Ms` variants are not applied here at all —
 * {@link articulateNote} writes them onto the note as `articulation.*` attributes for the
 * millisecond-domain pass to pick up later.
 */
export class ArticulationDef extends AbstractXmlSubtree {
  /** This def's arm of {@link Def}. */
  readonly kind = 'articulation';
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

  private constructor(private readonly nameAttr: Attribute) {
    super();
  }

  getName(): string {
    return this.nameAttr.getValue();
  }

  /** Rename the def, in the object and in the element. */
  setName(name: string): void {
    this.nameAttr.setValue(name);
  }

  /**
   * PARITY NOTE on how the attributes are read: Java walks the element's attribute list by
   * index (backwards) and switches on each local name; XomTypes has no `getAttribute(int)`,
   * so this looks the twelve known names up instead. The results agree. Each name feeds an
   * independent field, so visiting order cannot matter; and even for an element that
   * carries one local name twice, Java's backwards walk gives the last write to the
   * earliest attribute — the very one this lookup returns.
   *
   * Java also renames a foreign element to `articulationDef` via `setLocalName()`, which
   * XomTypes cannot do; see the same note on `TempoDef`.
   */
  protected parseData(xml: Element): void {
    this.setXml(xml);
    this.id = attribute('id', xml);

    // null = attribute absent, so the field keeps its default. Present but unparsable is not a
    // third outcome: it throws, and the style skips the whole def, which is what Java does for
    // all twelve (ArticulationDef.java:100-133 — every one a bare Double.parseDouble inside the
    // throwing constructor). See PARITY.md, "Fixed bugs", P1.
    const numeric = (name: string): number | null => {
      const a = attribute(name, xml);
      return a === null ? null : parseJavaDouble(a.getValue(), `articulationDef/@${name}`);
    };

    this.absoluteDuration = numeric('absoluteDuration') ?? this.absoluteDuration;
    this.absoluteDurationChange = numeric('absoluteDurationChange') ?? this.absoluteDurationChange;
    this.absoluteDurationMs = numeric('absoluteDurationMs') ?? this.absoluteDurationMs;
    this.absoluteDurationChangeMs =
      numeric('absoluteDurationChangeMs') ?? this.absoluteDurationChangeMs;
    this.relativeDuration = numeric('relativeDuration') ?? this.relativeDuration;
    this.absoluteDelay = numeric('absoluteDelay') ?? this.absoluteDelay;
    this.absoluteDelayMs = numeric('absoluteDelayMs') ?? this.absoluteDelayMs;
    this.absoluteVelocity = numeric('absoluteVelocity') ?? this.absoluteVelocity;
    this.relativeVelocity = numeric('relativeVelocity') ?? this.relativeVelocity;
    this.absoluteVelocityChange = numeric('absoluteVelocityChange') ?? this.absoluteVelocityChange;
    this.detuneCents = numeric('detuneCents') ?? this.detuneCents;
    this.detuneHz = numeric('detuneHz') ?? this.detuneHz;
  }

  /**
   * Create a def either from a name — with every effect at its neutral default — or by parsing
   * an existing element. Returns the reason instead of throwing.
   */
  static createArticulationDef(
    nameOrXml: string | Element,
  ): Result<ArticulationDef, MpmParseError> {
    try {
      let xml: Element;
      if (typeof nameOrXml === 'string') {
        xml = new Element('articulationDef', MPM_NAMESPACE);
        xml.addAttribute(new Attribute('name', nameOrXml));
      } else {
        xml = nameOrXml;
      }
      const ad = new ArticulationDef(requireDefName(xml, 'ArticulationDef'));
      ad.parseData(xml);
      return ok(ad);
    } catch (e) {
      return skipMalformedDef(e, 'ArticulationDef');
    }
  }

  /**
   * Remove one attribute from the element and put the corresponding field back to its
   * default.
   *
   * Two quirks, both faithful to Java: an unknown name is a silent no-op only because the
   * lookup fails first — a name that IS present but is not one of the twelve (`name`, say,
   * or `xml:id`) gets REMOVED from the element with no field to reset, which is why the
   * parameter deliberately stays `string` rather than a union of the twelve. And a
   * `resetAttribute` on an absent attribute leaves the field alone even if it was set
   * programmatically without touching the XML.
   */
  resetAttribute(name: string): void {
    const a = attribute(name, this.getXml());
    if (a === null) return;
    this.getXml().removeAttribute(a);
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
    this.getXml().addAttribute(new Attribute('absoluteDuration', String(v)));
  }
  getAbsoluteDurationChange(): number {
    return this.absoluteDurationChange;
  }
  setAbsoluteDurationChange(v: number): void {
    this.absoluteDurationChange = v;
    this.getXml().addAttribute(new Attribute('absoluteDurationChange', String(v)));
  }
  getAbsoluteDurationMs(): number | null {
    return this.absoluteDurationMs;
  }
  setAbsoluteDurationMs(v: number): void {
    this.absoluteDurationMs = v;
    this.getXml().addAttribute(new Attribute('absoluteDurationMs', String(v)));
  }
  getAbsoluteDurationChangeMs(): number {
    return this.absoluteDurationChangeMs;
  }
  setAbsoluteDurationChangeMs(v: number): void {
    this.absoluteDurationChangeMs = v;
    this.getXml().addAttribute(new Attribute('absoluteDurationChangeMs', String(v)));
  }
  getRelativeDuration(): number {
    return this.relativeDuration;
  }
  setRelativeDuration(v: number): void {
    this.relativeDuration = v;
    this.getXml().addAttribute(new Attribute('relativeDuration', String(v)));
  }
  getAbsoluteDelay(): number {
    return this.absoluteDelay;
  }
  setAbsoluteDelay(v: number): void {
    this.absoluteDelay = v;
    this.getXml().addAttribute(new Attribute('absoluteDelay', String(v)));
  }
  getAbsoluteDelayMs(): number {
    return this.absoluteDelayMs;
  }
  setAbsoluteDelayMs(v: number): void {
    this.absoluteDelayMs = v;
    this.getXml().addAttribute(new Attribute('absoluteDelayMs', String(v)));
  }
  getAbsoluteVelocity(): number | null {
    return this.absoluteVelocity;
  }
  setAbsoluteVelocity(v: number): void {
    this.absoluteVelocity = v;
    this.getXml().addAttribute(new Attribute('absoluteVelocity', String(v)));
  }
  getRelativeVelocity(): number {
    return this.relativeVelocity;
  }
  setRelativeVelocity(v: number): void {
    this.relativeVelocity = v;
    this.getXml().addAttribute(new Attribute('relativeVelocity', String(v)));
  }
  getAbsoluteVelocityChange(): number {
    return this.absoluteVelocityChange;
  }
  setAbsoluteVelocityChange(v: number): void {
    this.absoluteVelocityChange = v;
    this.getXml().addAttribute(new Attribute('absoluteVelocityChange', String(v)));
  }
  getDetuneCents(): number {
    return this.detuneCents;
  }
  setDetuneCents(v: number): void {
    this.detuneCents = v;
    this.getXml().addAttribute(new Attribute('detuneCents', String(v)));
  }
  getDetuneHz(): number {
    return this.detuneHz;
  }
  setDetuneHz(v: number): void {
    this.detuneHz = v;
    this.getXml().addAttribute(new Attribute('detuneHz', String(v)));
  }

  /**
   * Build a def pre-filled with meico's default meaning for a known articulation name.
   * An unknown name yields an empty (no-op) def rather than null.
   */
  static createDefaultArticulationDef(name: string): Result<ArticulationDef, MpmParseError> {
    const created = ArticulationDef.createArticulationDef(name);
    if (isErr(created)) return created;
    const d = created.value;
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
    return created;
  }

  /**
   * Apply this articulation to a note element, in place.
   * @returns whether `date.perf` changed — the caller has to re-sort the map if it did
   *
   * The order of the writes is load-bearing and must not be rearranged: duration is set
   * absolutely, then scaled relatively, then shifted, and each step re-reads `duration.perf`
   * from the attribute the previous step wrote. Velocity works the same way. So the effects
   * compose multiplicatively-then-additively, not independently.
   *
   * `absoluteDurationMs` short-circuits the whole tick-domain duration branch: when it is
   * set, the note only gets the `articulation.absoluteDurationMs` attribute and its
   * `duration.perf` is left untouched.
   *
   * The `for (let reduce = 2.0; durNew <= 0.0; reduce *= 2.0)` loop halves a negative
   * `absoluteDurationChange` until the resulting duration is positive, so an articulation
   * that would annihilate a short note shortens it instead. It terminates because `dur` is
   * known positive.
   */
  articulateNote(note: Element | null): boolean {
    if (note === null) return false;
    let dateChanged = false;

    const durationAtt = attribute('duration.perf', note);
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

    const dateAtt = attribute('date.perf', note);
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

    const velocityAtt = attribute('velocity', note);
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
