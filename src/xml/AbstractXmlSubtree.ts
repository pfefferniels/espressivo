import { Element } from './XomTypes.js';

/**
 * This is the prototype for classes that occur within the Mpm data structure.
 * Port of meico.xml.AbstractXmlSubtree
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
