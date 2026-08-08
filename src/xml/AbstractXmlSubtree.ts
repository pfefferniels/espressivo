import { Element } from './XomTypes.js';

/**
 * This is the prototype for classes that occur within the Mpm data structure.
 * Port of meico.xml.AbstractXmlSubtree
 *
 * Each subclass wraps one {@link Element} of the live document tree and exposes it as
 * typed accessors. The element is the single source of truth — subclasses parse it in
 * {@link parseData} and write straight back to it, so a subtree object and the XML it
 * came from can never drift apart.
 */
export abstract class AbstractXmlSubtree {
  private xml: Element | null = null;

  getXml(): Element | null {
    return this.xml;
  }

  protected setXml(xml: Element | null): void {
    this.xml = xml;
  }

  protected abstract parseData(xml: Element): void;

  toXml(): string {
    if (this.xml === null) return '';
    return this.xml.toXML();
  }
}
