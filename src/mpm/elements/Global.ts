import { Element } from '../../xml/XomTypes.js';
import { AbstractXmlSubtree } from '../../xml/AbstractXmlSubtree.js';
import { Helper } from '../../mei/Helper.js';
import { Mpm } from '../../mpm/Mpm.js';
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
   * Returns null — after logging — instead of throwing, as every factory in this cluster
   * does.
   */
  static createGlobal(xml?: Element): Global | null {
    try {
      const g = new Global();
      if (xml !== undefined) g.parseData(xml);
      else g.parseData(new Element('global', Mpm.MPM_NAMESPACE));
      return g;
    } catch (e) {
      console.error(e);
      return null;
    }
  }

  /**
   * After this has run, {@link getXml} returns the very element passed in — `setXml` stores
   * it verbatim rather than copying.
   *
   * Missing `<header>` or `<dated>` children are created and appended, so parsing a bare
   * `<global/>` still yields a usable environment. The closing `setEnvironment(this, null)`
   * is what gives this global's maps access to its header for style lookup; `null` for the
   * part, because a global environment has no local header.
   */
  protected parseData(xml: Element): void {
    if (xml === null) throw new Error('Cannot generate Global object. XML Element is null.');
    this.setXml(xml);

    const headerElt = Helper.getFirstChildElement('header', this.getXml()!);
    if (headerElt === null) {
      this.header = Header.createHeader()!;
      this.getXml()!.appendChild(this.header.getXml()!);
    } else {
      this.header = Header.createHeader(headerElt);
    }

    const datedElt = Helper.getFirstChildElement('dated', this.getXml()!);
    if (datedElt === null) {
      this.dated = Dated.createDated()!;
      this.getXml()!.appendChild(this.dated.getXml()!);
    } else {
      this.dated = Dated.createDated(datedElt);
    }

    if (this.dated === null)
      throw new Error('Cannot generate Global object. Failed to generate Dated object.');
    this.dated.setEnvironment(this, null);
  }

  getHeader(): Header | null {
    return this.header;
  }
  getDated(): Dated | null {
    return this.dated;
  }
}
