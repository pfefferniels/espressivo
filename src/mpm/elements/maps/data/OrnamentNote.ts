import { Attribute, Element } from '../../../../xml/XomTypes.js';
import { attribute } from '../../../../xml/tree.js';
import { MPM_NAMESPACE } from '../../../names.js';

/**
 * One `<note>` of an MPM v3 `<ornament>`'s note pool: an auxiliary note the ornament may
 * play, identified by its `xml:id` and carrying at most one pitch specification
 * (`src/specs/note.xml` of the MPM spec at develop @ 1de00bb).
 *
 * WHERE IT SITS. The pool is the *vocabulary* of an ornament; `note.order` on the same
 * `<ornament>` is the *score*, naming pool ids in playing order (see `noteOrder.ts` next
 * door). Pool order itself carries no meaning — `ornament.xml:78-79`: "the order of these
 * note elements have no semantic meaning". Turning ids plus pitch specs into real MSM notes
 * is the renderer's job (DESIGN.md D8/D10, wave W5); this class only reads and writes the
 * element.
 *
 * A class rather than a plain interface because it wraps a live XML subtree (RULE C1), in the
 * generate-on-demand shape of its sibling transformers (RULE C1a): {@link getXml} lazily
 * builds and caches an element for a note that was constructed in code.
 *
 * PARITY NOTE — **v3-only, with no Java precedent to match.** v2 ornaments never had children
 * at all, so nothing here can move a v2 byte. The reference implementation does read a pool,
 * but under the element name `ornamentNote`, which appears in no spec release and which its
 * own MEI converter never writes, so its pool is always empty
 * (research/lars-v3-implementation.md §5 note 2). DESIGN.md D1 rules that name out: the pool
 * child is `note`.
 */

/**
 * How a pool note states its pitch — the three mutually exclusive attributes of
 * `note.xml`, as a discriminated union.
 *
 * `midi` is absolute (an MSM `midi.pitch`); `chromatic` and `diatonic` are intervals
 * *relative to the principal note*, in halftone steps and in scale steps respectively.
 * Both intervals are read as doubles although the spec types `interval.diatonic` (and
 * `midi.pitch`) as integers: MSM carries fractional `midi.pitch` for microtonality, and
 * `interval.chromatic` is explicitly a double so that quarter tones are expressible
 * (`note.xml:38-45`). Resolving any of them against a principal note — including what
 * "diatonic" means against a key signature, which the spec leaves at "context-sensitive" —
 * is DESIGN.md D8, and belongs to the renderer.
 */
export type OrnamentPitchSpec =
  | { readonly kind: 'midi'; readonly value: number }
  | { readonly kind: 'chromatic'; readonly value: number }
  | { readonly kind: 'diatonic'; readonly value: number };

/** The attribute each {@link OrnamentPitchSpec} kind is written as. */
const PITCH_ATTRIBUTE = {
  midi: 'midi.pitch',
  chromatic: 'interval.chromatic',
  diatonic: 'interval.diatonic',
} as const;

/**
 * What a `<note>` with no pitch attribute at all means. The schematron is
 * `count(@midi.pitch | @interval.chromatic | @interval.diatonic) le 1`, so zero is legal, and
 * the attribute defaults (`interval.chromatic` = `0.0`) then leave the note at the principal
 * note's pitch (DESIGN.md D8, research/github-v3-design.md §3.5).
 */
const DEFAULT_PITCH_SPEC: OrnamentPitchSpec = { kind: 'chromatic', value: 0.0 };

const XML_NAMESPACE = 'http://www.w3.org/XML/1998/namespace';

/**
 * Read one pitch attribute.
 *
 * TODO(W10) — DESIGN.md D16 requires `parseJavaDouble` for numeric attributes in new v3 parse
 * code, and `src/supplementary/parseJavaDouble.ts` does not exist on this branch yet; it
 * arrives with the W10 rebase. `Number` stands in, following W1's precedent (LOG.md "W1
 * implementer", the `Number()` bullet) — but note the difference that makes this a real
 * switch rather than a formality: W1 could argue the deviation away because its grammar
 * (`^-?[0-9]+(\.[0-9]+)?(ms|%|ticks)$`) excludes every string on which `Number`,
 * `parseFloat` and `Double.parseDouble` disagree. There is no such grammar here — `midi.pitch`
 * is an unconstrained attribute value — so `Number` and `parseJavaDouble` genuinely differ on
 * malformed input (`"64abc"`: `NaN` here, a `NumberFormatError` there). The `NaN` is caught
 * below and reported, which is the E1-shaped behaviour either way.
 *
 * @returns null after logging when the value is not a usable number; the note is then skipped
 *   rather than silently sounding at the principal's pitch, which would invent a note the
 *   document did not ask for.
 */
function readPitchValue(kind: OrnamentPitchSpec['kind'], att: Attribute): OrnamentPitchSpec | null {
  const value = Number(att.getValue());
  if (!Number.isFinite(value)) {
    console.error(
      `Warning: attribute ${att.toXML()} of an ornament pool note is no number; the note is skipped.`,
    );
    return null;
  }
  return { kind, value };
}

/**
 * Apply the schematron's mutual exclusion leniently (DESIGN.md D8): more than one pitch
 * attribute is a document error, so it is logged, and the most explicit one wins —
 * `midi.pitch` > `interval.chromatic` > `interval.diatonic`, which is the order
 * `note.xml`'s own remarks rank them in ("most explicit", "more general", "context-sensitive").
 */
function parsePitchSpec(xml: Element): OrnamentPitchSpec | null {
  const midi = attribute('midi.pitch', xml);
  const chromatic = attribute('interval.chromatic', xml);
  const diatonic = attribute('interval.diatonic', xml);

  const present = [midi, chromatic, diatonic].filter((att) => att !== null);
  if (present.length > 1)
    console.error(
      `Warning: ornament pool note ${xml.toXML()} sets more than one of midi.pitch, interval.chromatic and interval.diatonic; only ${present[0].getQualifiedName()} is used.`,
    );

  if (midi !== null) return readPitchValue('midi', midi);
  if (chromatic !== null) return readPitchValue('chromatic', chromatic);
  if (diatonic !== null) return readPitchValue('diatonic', diatonic);
  return DEFAULT_PITCH_SPEC;
}

/** One note of an ornament's note pool; see the module documentation above. */
export class OrnamentNote {
  /** The `xml:id`, without a `#`. Required — `note.order` addresses pool notes by it. */
  readonly id: string;
  readonly pitchSpec: OrnamentPitchSpec;
  private xml: Element | null = null;

  constructor(id: string, pitchSpec: OrnamentPitchSpec) {
    this.id = id;
    this.pitchSpec = pitchSpec;
  }

  /**
   * Parse a pool `<note>` element.
   *
   * @returns null after logging when the note cannot be used: with no `xml:id` nothing can
   *   reference it (`note.order` is a list of ID references, so an anonymous pool note is
   *   unreachable by construction and its presence is an encoding error), and with an
   *   unreadable pitch attribute its pitch is unknown. RULE E1: log and skip, never throw.
   */
  static fromXml(xml: Element): OrnamentNote | null {
    const idAtt = attribute('id', xml);
    if (idAtt === null) {
      console.error(
        `Warning: ornament pool note ${xml.toXML()} has no xml:id and cannot be referenced from note.order; the note is skipped.`,
      );
      return null;
    }
    const pitchSpec = parsePitchSpec(xml);
    if (pitchSpec === null) return null;

    const note = new OrnamentNote(idAtt.getValue(), pitchSpec);
    note.xml = xml;
    return note;
  }

  /**
   * NOT a pure read: for a note built in code this GENERATES the element and caches it, so
   * the first call has a side effect — the `TemporalSpread` idiom (RULE C1a).
   * {@link toXml} deliberately does not; it returns '' while there is no element.
   */
  getXml(): Element {
    if (this.xml === null) return this.generateXML();
    return this.xml;
  }

  /**
   * Build (and cache) the element for this note, in canonical spec form: `xml:id` first, then
   * the one pitch attribute.
   *
   * The pitch attribute is written **unconditionally**, including the `interval.chromatic="0"`
   * that a note with no pitch attribute at all decays to. That keeps the round trip stable
   * (state in, same state out) at the price of restating a default, and it costs nothing in
   * parity: this element is new in v3, no Java reference writes it — the reference writes
   * `ornamentNote`, which no spec release defines — so no byte precedent binds the choice.
   * Attribute order is fixed here for the same reason it matters elsewhere: it is
   * byte-visible (CHARTER §79-80), and the spec's own exempla (`note.xml:60-70`) write it
   * this way.
   */
  generateXML(): Element {
    const note = new Element('note', MPM_NAMESPACE);
    note.addAttribute(new Attribute('xml:id', XML_NAMESPACE, this.id));
    note.addAttribute(
      new Attribute(PITCH_ATTRIBUTE[this.pitchSpec.kind], String(this.pitchSpec.value)),
    );
    this.xml = note;
    return note;
  }

  toXml(): string {
    if (this.xml === null) return '';
    return this.xml.toXML();
  }
}
