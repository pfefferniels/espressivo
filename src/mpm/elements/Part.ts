import { Attribute, Element } from '../../xml/XomTypes.js';
import { AbstractXmlSubtree } from '../../xml/AbstractXmlSubtree.js';
import { attribute, firstChildElement, requireAttribute } from '../../xml/tree.js';
import { MissingNodeError } from '../../xml/errors.js';
import { err, isErr, ok, unwrapOr, type Result } from '../../prelude/index.js';
import { MPM_NAMESPACE } from '../names.js';
import { type MpmParseError } from './parseError.js';
import { Header } from './Header.js';
import { Dated } from './Dated.js';
import type { Global } from './Global.js';

/**
 * An MPM `<part>` element: the performance information for one part of the score.
 * Port of meico.mpm.elements.Part
 *
 * Like {@link Global} it owns a {@link Header} and a {@link Dated}, but it also carries the
 * identity used to match it against an MSM part: `number`, `name`, `midi.channel` and
 * `midi.port`. {@link Performance.getCorrespondingPart} matches by number first, then by
 * name, so the two documents need not agree on both.
 *
 * `number`, `midi.channel` and `midi.port` are required — {@link parseData} throws without
 * them — while a missing `name` is filled in as empty rather than rejected.
 */
export class Part extends AbstractXmlSubtree {
  private global: Global | null = null;
  private header: Header | null = null;
  private dated: Dated | null = null;
  /**
   * The `name` attribute node, held so {@link setName} writes where {@link readFrom} read.
   *
   * Initialised to the empty node the defaulting path installs: a `<part>` with no `name` gets
   * THIS object added to it, and one that declares a name hands `readFrom` the declared node to
   * hold instead. Same shape as `RubatoDef`'s three attributes and `RelatedResource`'s two.
   */
  private nameAttr: Attribute;
  private number = 0;
  private midiChannel = 0;
  private midiPort = 0;

  private constructor() {
    super();
    this.nameAttr = new Attribute('name', '');
  }

  /**
   * Create a part from its identifying values, optionally with an `xml:id`.
   *
   * Cannot fail on a missing attribute, since it writes all three required ones itself — but
   * it still returns a `Result` (see `elements/parseError.ts`), because {@link readFrom} is
   * the one thing that validates them.
   */
  static fromValues(
    name: string,
    number: number,
    midiChannel: number,
    midiPort: number,
    id?: string,
  ): Result<Part, MpmParseError> {
    const p = new Part();
    const part = new Element('part', MPM_NAMESPACE);
    part.addAttribute(new Attribute('name', name));
    part.addAttribute(new Attribute('number', String(number)));
    part.addAttribute(new Attribute('midi.channel', String(midiChannel)));
    part.addAttribute(new Attribute('midi.port', String(midiPort)));
    const parsed = p.readFrom(part);
    if (isErr(parsed)) return parsed;
    if (id !== undefined) p.setId(id);
    return parsed;
  }

  /**
   * Create a part by parsing an existing `<part>` element.
   *
   * Reports the reason rather than printing it — see `elements/parseError.ts`. Which of the
   * three required attributes was missing is now something the caller can read, where before
   * the three `throw`s were flattened onto one `null` and one line on somebody's stderr.
   */
  static fromXml(xml: Element | null): Result<Part, MpmParseError> {
    if (xml === null) return err({ kind: 'noElement', what: 'Part' });
    return new Part().readFrom(xml);
  }

  /**
   * After this has run, {@link getXml} returns the very element passed in — `setXml` stores
   * it verbatim rather than copying, so {@link nameAttr} and {@link id} stay live views onto
   * that element and the setters write through to the document.
   *
   * Note the ordering, twice over. The three required attributes are validated *before*
   * `setXml`, so a `<part>` that fails validation leaves this object without an XML element
   * rather than half-initialised — and the `name` attribute is **written to the caller's
   * element first**, so a `<part>` with neither name nor number comes back with an empty
   * `name=""` on it and still fails. That order is observable, so it is kept verbatim rather
   * than hoisted into a tidier validate-then-mutate pass.
   *
   * Missing `<header>`/`<dated>` children are created and appended, and the two are not
   * equally required — see {@link Global.readFrom} for that asymmetry.
   *
   * The closing `setEnvironment(this.global, this)` runs while {@link global} is still null
   * — a part parsed on its own has no performance yet — so the maps get a local header but
   * no global one. {@link setGlobal} repeats the call once the part is attached to a
   * {@link Performance}, and that is when the global header arrives.
   */
  private readFrom(xml: Element): Result<Part, MpmParseError> {
    const declaredName = attribute('name', xml);
    if (declaredName === null) xml.addAttribute(this.nameAttr);
    else this.nameAttr = declaredName;
    const numberAttr = attribute('number', xml);
    if (numberAttr === null || numberAttr.getValue() === '')
      return err({ kind: 'missingAttribute', what: 'Part', attribute: 'number' });
    const midiChannelAtt = attribute('midi.channel', xml);
    if (midiChannelAtt === null || midiChannelAtt.getValue() === '')
      return err({ kind: 'missingAttribute', what: 'Part', attribute: 'midi.channel' });
    const midiPortAtt = attribute('midi.port', xml);
    if (midiPortAtt === null || midiPortAtt.getValue() === '')
      return err({ kind: 'missingAttribute', what: 'Part', attribute: 'midi.port' });

    this.setXml(xml);
    this.number = parseInt(numberAttr.getValue());
    this.midiChannel = parseInt(midiChannelAtt.getValue());
    this.midiPort = parseInt(midiPortAtt.getValue());
    this.id = attribute('id', this.getXml());

    const headerElt = firstChildElement('header', this.getXml());
    if (headerElt === null) {
      const fresh = Header.createHeader();
      if (isErr(fresh)) return err({ kind: 'childFailed', what: 'Part', cause: fresh.error });
      this.header = fresh.value;
      this.getXml().appendChild(this.header.getXml());
    } else {
      this.header = unwrapOr(Header.createHeader(headerElt), null);
    }

    const datedElt = firstChildElement('dated', this.getXml());
    const dated = Dated.createDated(datedElt ?? undefined);
    if (isErr(dated)) return err({ kind: 'childFailed', what: 'Part', cause: dated.error });
    this.dated = dated.value;
    if (datedElt === null) this.getXml().appendChild(this.dated.getXml());

    this.dated.setEnvironment(this.global, this);
    return ok(this);
  }

  /** Not an entry point — see {@link Global.parseData} for the shape and the reason. */
  protected parseData(): never {
    throw new Error('Part is constructed by its factory; parseData is not an entry point.');
  }

  getHeader(): Header | null {
    return this.header;
  }
  getDated(): Dated | null {
    return this.dated;
  }
  /**
   * The dated environment, non-null: {@link readFrom} returns `err` rather than a `Part`
   * without a `dated`, so no part a caller can hold has one. {@link getDated} keeps its
   * `Dated | null` because that is what the rest of the port reads.
   */
  requireDated(): Dated {
    const dated = this.dated;
    if (dated === null)
      throw new MissingNodeError('this part has no dated environment: it was never parsed');
    return dated;
  }
  getName(): string {
    return this.nameAttr.getValue();
  }
  setName(name: string): void {
    this.nameAttr.setValue(name);
  }
  getNumber(): number {
    return this.number;
  }
  // The three setters below re-read their attribute from the element on every call rather than
  // holding it as `nameAttr` is held — Java does too (`Part.java`'s
  // `this.getXml().getAttribute(...)`), and the difference is observable if a caller swaps the
  // node out. `requireAttribute` throws rather than asserting, on an invariant `readFrom`
  // establishes: it refuses a `<part>` missing any of these three.
  setNumber(number: number): void {
    this.number = number;
    requireAttribute('number', this.getXml()).setValue(String(this.number));
  }
  getMidiChannel(): number {
    return this.midiChannel;
  }
  setMidiChannel(midiChannel: number): void {
    this.midiChannel = midiChannel;
    requireAttribute('midi.channel', this.getXml()).setValue(String(this.midiChannel));
  }
  getMidiPort(): number {
    return this.midiPort;
  }
  setMidiPort(midiPort: number): void {
    this.midiPort = midiPort;
    requireAttribute('midi.port', this.getXml()).setValue(String(this.midiPort));
  }
  setGlobal(global: Global | null): void {
    this.global = global;
    this.requireDated().setEnvironment(this.global, this);
  }
  getGlobal(): Global | null {
    return this.global;
  }
}
