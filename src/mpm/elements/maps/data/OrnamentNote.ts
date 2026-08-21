import { Attribute, Element } from '../../../../xml/XomTypes.js';
import { attribute } from '../../../../xml/tree.js';
import { parseJavaDouble } from '../../../../supplementary/parseJavaDouble.js';
import { MPM_NAMESPACE } from '../../../names.js';
import { elementAt } from '../../../../prelude/index.js';

/**
 * One `<note>` of an MPM v3 `<ornament>`'s note pool: an auxiliary note the ornament may
 * play, identified by its `xml:id` and carrying at most one pitch specification
 * (`src/specs/note.xml` of the MPM spec at develop @ 1de00bb).
 *
 * WHERE IT SITS. The pool is the *vocabulary* of an ornament; `note.order` on the same
 * `<ornament>` is the *score*, naming pool ids in playing order (see `noteOrder.ts` next
 * door). Pool order itself carries no meaning — `ornament.xml:78-79`: "the order of these
 * note elements have no semantic meaning". Turning ids plus pitch specs into real MSM notes
 * is the renderer's job (DESIGN.md D8/D10); this class only reads and writes the element.
 *
 * A class rather than a plain interface because it wraps a live XML subtree (RULE C1), in the
 * generate-on-demand shape of its sibling transformers (RULE C1a): {@link getXml} lazily
 * builds and caches an element for a note that was constructed in code.
 *
 * PARITY NOTE — v3-only, with no Java precedent to match. v2 ornaments never had children at
 * all, so nothing here can move a v2 byte. The reference implementation does read a pool, but
 * under the element name `ornamentNote`, which appears in no spec release and which its own
 * MEI converter never writes, so its pool is always empty
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
 * The parse is `parseJavaDouble`, DESIGN.md D16's rule for new v3 parse code (PARITY.md §6.8).
 * Unlike `TemporalValue`, which is exempt because the spec's own regex admits only the decimal
 * literals every parser agrees on, there is no grammar here at all — `midi.pitch` is an
 * unconstrained attribute value — so the choice of parser is observable at the edges: `""` and
 * `"0x10"` are rejected, where `Number` reads them as `0` (i.e. "at the principal's pitch")
 * and `16`; `"1d"` / `"1f"` are 1, Java's own type suffixes, where `Number` reads `NaN`; and
 * `"NaN"` / `"Infinity"` spelled out are accepted by the parser exactly as Java accepts them,
 * then rejected by the finiteness check below, a pitch having to be a number a note can sound
 * at.
 *
 * The error is caught rather than propagated because there is no factory above this to catch
 * it and D16 forbids throwing on malformed v3 input.
 *
 * @returns null after logging when the value is not a usable number; the note is then skipped
 *   rather than silently sounding at the principal's pitch, which would invent a note the
 *   document did not ask for.
 */
function readPitchValue(kind: OrnamentPitchSpec['kind'], att: Attribute): OrnamentPitchSpec | null {
  const value = readJavaDouble(att.getValue());
  if (value === null || !Number.isFinite(value)) {
    console.error(
      `Warning: attribute ${att.toXML()} of an ornament pool note is no number; the note is skipped.`,
    );
    return null;
  }
  return { kind, value };
}

/**
 * `parseJavaDouble` as a log-free `number | null`, since RULE E1 leaves the reporting to the
 * caller — each of them says something different about what it could not read.
 *
 * Exported for the one sibling with the same problem, `OrnamentData.parseOrnamentRepetitions`:
 * both read a v3 attribute that has no grammar to lean on, both must not throw, and one
 * adapter keeps the two from drifting into different ideas of what a number is.
 *
 * The bare `catch` is the shape the five def factories use for the same call (`TempoDef.ts:68`
 * and its four siblings, which mirror Java's `catch`), and it is exactly a `NumberFormatError`
 * catch: `parseJavaDouble` is the only thing inside the `try`, and it throws nothing else.
 */
export function readJavaDouble(text: string): number | null {
  try {
    // The label goes into a message this discards; the callers each write their own, naming
    // the attribute and what they did about it, so it is kept neutral.
    return parseJavaDouble(text, 'an MPM v3 numeric attribute');
  } catch {
    return null;
  }
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
      `Warning: ornament pool note ${xml.toXML()} sets more than one of midi.pitch, interval.chromatic and interval.diatonic; only ${elementAt(present, 0, 'pitch attribute').getQualifiedName()} is used.`,
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
   * The pitch attribute is written unconditionally, including the `interval.chromatic="0"`
   * that a note with no pitch attribute at all decays to, so that the round trip is stable
   * (state in, same state out). No parity is at stake: this element is new in v3 and no Java
   * reference writes it — the reference writes `ornamentNote`, which no spec release defines.
   * Attribute order is fixed because it is byte-visible (CHARTER §79-80), and the spec's own
   * exempla (`note.xml:60-70`) write it this way.
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
