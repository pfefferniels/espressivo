import { Element } from '../../xml/XomTypes.js';
import { AbstractXmlSubtree } from '../../xml/AbstractXmlSubtree.js';
import { firstChildElement } from '../../xml/tree.js';
import { MissingNodeError } from '../../xml/errors.js';
import { err, isErr, ok, unwrapOr, type Result } from '../../prelude/index.js';
import { MPM_NAMESPACE } from '../names.js';
import { type MpmParseError } from './parseError.js';
import { Header } from './Header.js';
import { Dated } from './Dated.js';

/**
 * An MPM `<global>` element: the performance information that applies to every part.
 * Port of meico.mpm.elements.Global
 *
 * Structurally it is just a {@link Header} plus a {@link Dated} — the same pair a
 * {@link Part} owns, one level up. During rendering, a part uses its own map of a given
 * type if it has one and falls back to the global map otherwise; see
 * {@link Performance.perform}. Both children are created if the source XML lacks them, so a
 * `Global` always has a header and a dated.
 */
export class Global extends AbstractXmlSubtree {
  private header: Header | null = null;
  private dated: Dated | null = null;

  private constructor() {
    super();
  }

  /**
   * Create an empty global environment, or one parsed from an existing `<global>` element.
   *
   * Reports the reason rather than printing it — see `elements/parseError.ts`.
   */
  static createGlobal(xml?: Element | null): Result<Global, MpmParseError> {
    const source = xml === undefined ? new Element('global', MPM_NAMESPACE) : xml;
    if (source === null) return err({ kind: 'noElement', what: 'Global' });
    return new Global().readFrom(source);
  }

  /**
   * After this has run, {@link getXml} returns the very element passed in — `setXml` stores
   * it verbatim rather than copying.
   *
   * Missing `<header>` or `<dated>` children are created and appended, so parsing a bare
   * `<global/>` still yields a usable environment. The closing `setEnvironment(this, null)`
   * is what gives this global's maps access to its header for style lookup; `null` for the
   * part, because a global environment has no local header.
   *
   * **The two children are not equally required, and that asymmetry is the incumbent's.**
   * A `<header>` that will not parse leaves {@link getHeader} null and the global usable; a
   * `<dated>` that will not parse is fatal. Both used to be spelled with a `!` and a `throw`
   * that the factory's `catch` printed; they are the same two outcomes here, with the
   * failing child's own reason carried under `childFailed` instead of discarded.
   */
  private readFrom(xml: Element): Result<Global, MpmParseError> {
    this.setXml(xml);

    const headerElt = firstChildElement('header', this.getXml());
    if (headerElt === null) {
      const fresh = Header.createHeader();
      if (isErr(fresh)) return err({ kind: 'childFailed', what: 'Global', cause: fresh.error });
      this.header = fresh.value;
      this.getXml().appendChild(this.header.getXml());
    } else {
      this.header = unwrapOr(Header.createHeader(headerElt), null);
    }

    const datedElt = firstChildElement('dated', this.getXml());
    const dated = Dated.createDated(datedElt ?? undefined);
    if (isErr(dated)) return err({ kind: 'childFailed', what: 'Global', cause: dated.error });
    this.dated = dated.value;
    if (datedElt === null) this.getXml().appendChild(this.dated.getXml());

    this.dated.setEnvironment(this, null);
    return ok(this);
  }

  /**
   * Not an entry point: a `Global` is built by {@link createGlobal}, which needs to report
   * a failing child and so cannot be a `void` method. Same shape and same reason as
   * `maps/GenericMap.parseData` and `styles/style.ts`.
   */
  protected parseData(): never {
    throw new Error('Global is constructed by its factory; parseData is not an entry point.');
  }

  getHeader(): Header | null {
    return this.header;
  }
  getDated(): Dated | null {
    return this.dated;
  }
  /** As {@link Part.requireDated}: `readFrom` returns `err` rather than a `Global` without one. */
  requireDated(): Dated {
    const dated = this.dated;
    if (dated === null)
      throw new MissingNodeError('this global has no dated environment: it was never parsed');
    return dated;
  }
}
