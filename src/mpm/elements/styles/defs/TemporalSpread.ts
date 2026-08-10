import { Attribute, Element } from '../../../../xml/XomTypes.js';
import { attribute } from '../../../../xml/tree.js';
import { MPM_NAMESPACE } from '../../../names.js';
import { formatTemporalValue, parseTemporalValueLenient } from './TemporalValue.js';
import type { TemporalDomain, TemporalValue } from './TemporalValue.js';

/**
 * Unit the frame of a {@link TemporalSpread} is measured in (MPM's `time.unit`).
 *
 * PARITY NOTE — v2 only, and deliberately left a TS `enum`. MPM v3 removed `time.unit` and
 * moved the unit onto each value (see {@link TemporalDomain}, which has a third member
 * `relative` this type cannot express). Converting it to an `as const` union would change
 * the emitted JS and break the tests that import it, so it stays (architecture brief §1.7,
 * `docs/history/refactor/log.md:1728-1730`) and is simply not used by the v3 reading of the element.
 */
export enum FrameDomain {
  Ticks = 'ticks',
  Milliseconds = 'milliseconds',
}
/**
 * Whether a spread also moves note-offs (MPM's `noteoff.shift`). `Monophonic` additionally
 * shortens each note to end where the next one begins, so the ornament never overlaps.
 *
 * Unchanged in v3 — `temporalSpread.xml:39-41` only restates the `false` default.
 */
export enum NoteOffShift {
  False = 'false',
  True = 'true',
  Monophonic = 'monophonic',
}

/**
 * MPM v3's `alignment`: whether the ornament sits at the beginning or at the end of its
 * principal note (`ornamentDef.xml:25-33`, closed value list, default `at start`).
 *
 * **Declared here rather than in `OrnamentDef`, where the attribute belongs, purely for
 * module layering**: this module must not import `OrnamentDef` (that separation is the
 * whole point of the split — see this file's class doc), yet its parser has to read the
 * attribute too. DESIGN.md D2 rules that the value is accepted on *both* elements, with
 * `ornamentDef` winning, so both readers share this vocabulary and
 * {@link parseOrnamentAlignment} is the single place that decides what a legal value is.
 */
export type OrnamentAlignment = 'at start' | 'at end';

/** The `alignment` default (`ornamentDef.xml:28`). */
export const DEFAULT_ORNAMENT_ALIGNMENT: OrnamentAlignment = 'at start';

/**
 * Read an `alignment` attribute value. The value list is closed, so anything else is a
 * document error; the caller logs it and falls back (RULE E1 — the interior logs and
 * carries on, it does not throw).
 */
export function parseOrnamentAlignment(raw: string): OrnamentAlignment | null {
  if (raw === 'at start' || raw === 'at end') return raw;
  return null;
}

/**
 * Which generation of MPM an object was read from — or, for objects built in code, which
 * API built it.
 *
 * This is DESIGN.md D12's "serialization is generation-preserving" made explicit. MPM
 * documents carry **no version marker at all** (same namespace, no `@version`, see
 * `docs/history/ornamentation/research/github-v3-design.md` §1), so the generation can only be inferred
 * from which attributes are present. Objects remember what they were, and write back what
 * they were: a v2-sourced spread must re-serialize byte-identically to today, or the
 * `all-maps` fixture comparison goes red.
 */
export type MpmSourceFormat = 'v2' | 'v3';

/**
 * The `frame.offset` default, `0.0ticks` (`att.time.frame.xml:16`). Applied only on the v3
 * reading — the v2 reading's equivalent is the `frameStart = 0.0` field initialiser.
 */
const DEFAULT_V3_FRAME_OFFSET: TemporalValue = { value: 0.0, domain: 'ticks' };

/**
 * The `frameLength` default, `100%` (`temporalSpread.xml:38`, the element's own override of
 * `att.time.frameLength`). DESIGN.md D3: a bare `<temporalSpread>` in a v3 context spans the
 * whole principal note, where the v2 default of `0.0` spans nothing.
 */
const DEFAULT_V3_FRAME_LENGTH: TemporalValue = { value: 100.0, domain: 'relative' };

/**
 * A trailing v3 unit suffix, as a **format probe** — not as a validity check.
 *
 * DESIGN.md D3 detects the generation of a `temporalSpread` structurally, and a unit suffix
 * is one of the two markers (the other is the `frame.offset` attribute name itself). The
 * probe deliberately ignores whether the rest of the value parses: `frameLength="abc%"` is a
 * malformed *v3* value, which D3 answers with log-and-default, not a silent slide back onto
 * the v2 `parseFloat` path.
 */
const V3_UNIT_SUFFIX = /(?:ms|%|ticks)$/;

/**
 * Decide whether an element is v2 or v3 syntax (DESIGN.md D3/D12).
 *
 * Markers, both v3-only by construction: the attribute `frame.offset` (v3 renamed
 * `frame.start` to it and deleted the old name outright — spec commit `71c1980`), or a unit
 * suffix on any frame value (v2 values are bare doubles).
 *
 * RULING pinned by test: **any** v3 marker makes the whole instance v3, including the mixed
 * spelling `frame.start="-22.0" frameLength="44%"`. The `frame.start` value is then read
 * through D3's alias and re-emitted as canonical `frame.offset`. The alternative — a
 * per-attribute generation — would have to serialize half a v2 and half a v3 element.
 *
 * `alignment` is deliberately NOT a marker here even though it is v3-only: it is not a frame
 * value, it is not serialized by this class at all (D2 puts it on `ornamentDef`), and a
 * `temporalSpread` carrying nothing but a Lars-style `alignment` is otherwise pure v2 and
 * must keep re-serializing as v2. {@link OrnamentDef} does treat it as a marker, for itself.
 */
function detectSourceFormat(xml: Element): MpmSourceFormat {
  if (attribute('frame.offset', xml) !== null) return 'v3';
  for (const name of ['frame.start', 'frameLength']) {
    const att = attribute(name, xml);
    if (att !== null && V3_UNIT_SUFFIX.test(att.getValue())) return 'v3';
  }
  return 'v2';
}

/**
 * The legacy `@time.unit` fallback of DESIGN.md D3, for a v3 value written without a suffix.
 *
 * v3 removed `time.unit` from every element (`grep memberOf key="att.time.unit"` over the
 * spec returns nothing), but both frame attributes' own descriptions still point at it and
 * the format's own sample corpus still writes it — `Reger - Moment Musical op 13 no 4.mpm`
 * and the guidelines' first example both do (research/github-v3-design.md §5). So it is
 * honoured when present, and ticks is the fallback of the fallback (`att.time.unit.xml:19`).
 *
 * Wider than the v2 reader below, which maps everything that is not `"milliseconds"` onto
 * ticks and has no `relative` at all. That divergence is reachable only from the v3 path, so
 * it cannot move a v2 byte.
 */
function legacyFallbackDomain(xml: Element): TemporalDomain {
  const unit = attribute('time.unit', xml);
  if (unit === null) return 'ticks';
  switch (unit.getValue()) {
    case 'milliseconds':
      return 'milliseconds';
    case 'relative':
      return 'relative';
    default:
      return 'ticks';
  }
}

/**
 * Read one v3 frame attribute: strict-then-lenient (that chain is exactly what
 * {@link parseTemporalValueLenient} runs), then D3's domain fallback for a suffix-less value.
 *
 * @returns null when the value cannot be used, having logged why. D3: the attribute is then
 *   treated as absent and its default applies — a malformed frame value must never destroy
 *   the whole `ornamentDef` the way the reference implementation's `NumberFormatException`
 *   does (research/lars-v3-implementation.md §3.2 item 2).
 */
function readV3FrameValue(att: Attribute, fallbackDomain: TemporalDomain): TemporalValue | null {
  const parsed = parseTemporalValueLenient(att.getValue());
  if (parsed === null) {
    console.error(
      `Warning: attribute ${att.toXML()} of a temporalSpread element is no MPM v3 temporal value; the attribute is ignored.`,
    );
    return null;
  }
  // A schema-valid 309-digit integer overflows to Infinity, and the formatter would write it
  // straight back out as the unreadable "Infinityticks". TemporalValue.ts hands that decision
  // to whoever owns the attribute (its formatTemporalValue doc, W1 verifier finding F2); here
  // it is a value no frame can use, so it takes the same route as a syntax error.
  if (!Number.isFinite(parsed.value)) {
    console.error(
      `Warning: attribute ${att.toXML()} of a temporalSpread element is out of range; the attribute is ignored.`,
    );
    return null;
  }
  return { value: parsed.value, domain: parsed.domain ?? fallbackDomain };
}

/**
 * The v3 counterpart of {@link TemporalSpread.setFrameLength}'s clamp: negative lengths
 * become 0 while keeping their domain.
 *
 * DESIGN.md D3 keeps the v2.1.4 `minInclusive 0.0` intent even though the v3 regex sloppily
 * admits a leading `-` on `frameLength` (`temporalSpread.xml:34`); the reference
 * implementation clamps too (research/lars-v3-implementation.md §3.2 item 6).
 */
function clampV3FrameLength(length: TemporalValue): TemporalValue {
  if (length.value >= 0.0) return length;
  console.error(
    `Warning: negative frameLength "${formatTemporalValue(length)}" in a temporalSpread element; clamped to 0.`,
  );
  return { value: 0.0, domain: length.domain };
}

/**
 * The `temporalSpread` transformer of an `OrnamentDef`: it distributes the notes of a
 * chord over a time frame, which is what turns a chord into an arpeggio.
 *
 * The class does not touch dates itself; {@link apply} writes `ornament.*` offset attributes
 * onto the notes, and the rendering pass in `OrnamentationMap` consumes them.
 *
 * **Two readings of one element, chosen by {@link getSourceFormat}.** MPM v3 renamed
 * `frame.start` to `frame.offset`, moved the time unit from the element (`time.unit`) onto
 * each value as a suffix, and changed the `frameLength` default from `0.0` to `100%`. Those
 * are incompatible readings of the same attribute names, and DESIGN.md D6/D12 resolve it by
 * generation-preservation rather than by conversion:
 *
 * - **v2-sourced** (no v3 marker, or built through the v2 fields) — `frameStart`,
 *   {@link getFrameLength} and `frameDomain` are the state, parsed and written exactly as
 *   before. This path is BYTE-FROZEN: `tests/integration/all-maps-equivalence.test.ts`
 *   compares its output against the Java fixtures.
 * - **v3-sourced** — {@link getFrameOffset} and {@link getFrameLengthValue} are the state,
 *   each a {@link TemporalValue} carrying its own domain, and serialization is canonical v3.
 *
 * INVARIANT, pinned by test: the two readings never both hold state. On a v2-sourced spread
 * the v3 accessors return null; on a v3-sourced spread `frameStart`/`getFrameLength()`/
 * `frameDomain` keep their field initialisers (`0.0`, `0.0`, `Ticks`) and **must not be
 * read** — a `relative` domain has no `FrameDomain` counterpart, and `frame.offset="22ms"
 * frameLength="90%"` has no single one either, so any mirror would have to invent a value.
 * Resolving a v3 frame to numbers (`%` against the principal note, DESIGN.md D4) is the
 * renderer's job, and {@link apply} — the v2 spacing engine — is what it feeds afterwards.
 *
 * `alignment` is read here for compatibility with the reference implementation, which puts
 * it on this element, but is neither owned nor serialized here: the spec's home for it is
 * `ornamentDef` (DESIGN.md D2). See {@link getParsedAlignment}.
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

  private sourceFormat: MpmSourceFormat = 'v2';
  private frameOffset: TemporalValue | null = null;
  private frameLengthValue: TemporalValue | null = null;
  private readonly parsedAlignment: OrnamentAlignment | null = null;

  /**
   * Without an element the spread starts neutral; with one it parses MPM attributes —
   * v2 or v3 syntax, whichever {@link detectSourceFormat} finds.
   */
  constructor(xml?: Element) {
    if (xml === undefined) return;
    this.xml = xml;
    this.sourceFormat = detectSourceFormat(xml);

    if (this.sourceFormat === 'v2') {
      // PARITY NOTE — the v2 frame reading, byte-frozen. These three statements are what the
      // Java reference does (`OrnamentDef.java:235-257`) and what every committed fixture
      // exercises; the enclosing `if` is the only thing that changed when v3 arrived. Note
      // `parseFloat` rather than `parseJavaDouble`: that is the documented `P1` residual
      // (PARITY.md §1), and swapping it here would be a behaviour change on malformed input
      // owing the full TD-discipline evidence set.
      const domain = attribute('time.unit', xml);
      if (domain !== null && domain.getValue() === 'milliseconds')
        this.frameDomain = FrameDomain.Milliseconds;
      const start = attribute('frame.start', xml);
      if (start !== null) this.frameStart = parseFloat(start.getValue());
      const length = attribute('frameLength', xml);
      if (length !== null) this.setFrameLength(parseFloat(length.getValue()));
    } else {
      this.parseV3Frame(xml);
    }

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

    const alignmentAtt = attribute('alignment', xml);
    if (alignmentAtt !== null) {
      const alignment = parseOrnamentAlignment(alignmentAtt.getValue());
      if (alignment === null)
        console.error(
          `Warning: attribute ${alignmentAtt.toXML()} of a temporalSpread element is no legal alignment ("at start" or "at end"); the attribute is ignored.`,
        );
      else this.parsedAlignment = alignment;
    }
  }

  /**
   * The v3 frame reading. Both attributes end up non-null, defaults included, so that
   * `sourceFormat === 'v3'` and "the v3 accessors carry the state" mean the same thing.
   *
   * `frame.start` is accepted as an alias of `frame.offset` (DESIGN.md D3, and the reference
   * implementation keeps the fallback too — research/lars-v3-implementation.md §3.2 item 4),
   * which is what lets the mixed spelling of {@link detectSourceFormat}'s ruling carry its
   * value across into the canonical output.
   */
  private parseV3Frame(xml: Element): void {
    const fallbackDomain = legacyFallbackDomain(xml);

    const offsetAtt = attribute('frame.offset', xml) ?? attribute('frame.start', xml);
    const offset = offsetAtt === null ? null : readV3FrameValue(offsetAtt, fallbackDomain);
    this.frameOffset = offset ?? DEFAULT_V3_FRAME_OFFSET;

    const lengthAtt = attribute('frameLength', xml);
    const length = lengthAtt === null ? null : readV3FrameValue(lengthAtt, fallbackDomain);
    this.frameLengthValue = length === null ? DEFAULT_V3_FRAME_LENGTH : clampV3FrameLength(length);
  }

  /** Negative frame lengths are clamped to 0, which is why this is not a plain field. */
  setFrameLength(length: number): void {
    this.frameLength = Math.max(0.0, length);
  }
  getFrameLength(): number {
    return this.frameLength;
  }

  /** Which MPM generation this spread was read from, or the API it was built with (D12). */
  getSourceFormat(): MpmSourceFormat {
    return this.sourceFormat;
  }

  /**
   * The v3 `frame.offset`, or null on a v2-sourced spread (where `frameStart` holds it).
   * The frame runs from the principal note's date + this offset for `frameLength`
   * (`mpm.odd:684-686`).
   */
  getFrameOffset(): TemporalValue | null {
    return this.frameOffset;
  }

  /**
   * The v3 `frameLength`, or null on a v2-sourced spread (where {@link getFrameLength} holds
   * it). Not named `getFrameLength` because that name is the v2 reading's, and the two are
   * different numbers in different domains.
   */
  getFrameLengthValue(): TemporalValue | null {
    return this.frameLengthValue;
  }

  /** Set the v3 `frame.offset`; this makes the spread v3-sourced and so v3-serializing. */
  setFrameOffset(offset: TemporalValue): void {
    this.frameOffset = offset;
    this.frameLengthValue ??= DEFAULT_V3_FRAME_LENGTH;
    this.sourceFormat = 'v3';
  }

  /**
   * Set the v3 `frameLength` (clamped at 0 like its v2 twin); this makes the spread
   * v3-sourced and so v3-serializing.
   */
  setFrameLengthValue(length: TemporalValue): void {
    this.frameLengthValue = clampV3FrameLength(length);
    this.frameOffset ??= DEFAULT_V3_FRAME_OFFSET;
    this.sourceFormat = 'v3';
  }

  /**
   * The `alignment` this element carried, or null if it carried none.
   *
   * Compatibility only, and deliberately without a setter. The spec declares `alignment` on
   * `ornamentDef` (`ornamentDef.xml:25-33`) while the changelog, the guidelines prose and
   * the reference implementation all put it on `temporalSpread`
   * (research/github-v3-design.md §6 item 1), so DESIGN.md D2 reads both and writes only the
   * first. {@link OrnamentDef} collects this value; {@link generateXML} never emits it.
   */
  getParsedAlignment(): OrnamentAlignment | null {
    return this.parsedAlignment;
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
   *
   * v3 NOTE: this reads the **v2** fields, so it does nothing useful on a v3-sourced spread
   * until a renderer has resolved that spread's frame to plain numbers (DESIGN.md D4/D5 —
   * `%` against the principal note's tick duration, `ms` through the millisecond marker
   * mechanism). That resolution is W5's, not this class's.
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
   * Build (and cache) the element for this spread, in the generation it was sourced from
   * (DESIGN.md D12).
   *
   * **v2** — unchanged: only non-default values are written, so a neutral spread serializes
   * as a bare `<temporalSpread/>`. BYTE-FROZEN against the Java fixtures.
   *
   * **v3** — canonical: `frame.offset` and `frameLength` with their unit suffixes, and no
   * `time.unit` anywhere (v3 deleted the attribute). Both frame attributes are written
   * *unconditionally*, unlike their v2 twins, because in v3 the value carries the domain:
   * omitting `frameLength="0%"` as a default would make it indistinguishable from an absent
   * one, whose default is `100%` — the exact round-trip bug the reference implementation has
   * (research/lars-v3-implementation.md §3.5, "two omission bugs"). `intensity`,
   * `noteoff.shift` and `xml:id` are unchanged in v3 and are written as before. `alignment`
   * is never written here (D2).
   *
   * Attribute order follows the spec's own `temporalSpread` exemplum (`temporalSpread.xml:45-48`:
   * `frame.offset`, `frameLength`, `intensity`, `noteoff.shift`), which is also today's v2
   * order with `frame.offset` in `frame.start`'s slot. Order is byte-visible (CHARTER §79-80).
   */
  generateXML(): Element {
    const ts = new Element('temporalSpread', MPM_NAMESPACE);
    if (this.sourceFormat === 'v3') {
      ts.addAttribute(
        new Attribute(
          'frame.offset',
          formatTemporalValue(this.frameOffset ?? DEFAULT_V3_FRAME_OFFSET),
        ),
      );
      ts.addAttribute(
        new Attribute(
          'frameLength',
          formatTemporalValue(this.frameLengthValue ?? DEFAULT_V3_FRAME_LENGTH),
        ),
      );
    } else {
      if (this.frameStart !== 0.0)
        ts.addAttribute(new Attribute('frame.start', String(this.frameStart)));
      if (this.frameLength !== 0.0)
        ts.addAttribute(new Attribute('frameLength', String(this.frameLength)));
      if (this.frameDomain === FrameDomain.Milliseconds)
        ts.addAttribute(new Attribute('time.unit', 'milliseconds'));
    }
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
