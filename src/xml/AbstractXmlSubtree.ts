import { Attribute, Element } from './XomTypes.js';

/** The namespace `xml:id` lives in — fixed by the XML spec, not by MPM. */
const XML_NAMESPACE = 'http://www.w3.org/XML/1998/namespace';

/**
 * This is the prototype for classes that occur within the Mpm data structure.
 * Port of meico.xml.AbstractXmlSubtree
 *
 * Each subclass wraps one {@link Element} of the live document tree and exposes it as
 * typed accessors. The element is the single source of truth — subclasses parse it in
 * {@link parseData} and write straight back to it, so a subtree object and the XML it
 * came from can never drift apart.
 *
 * The `xml:id` accessors live here rather than being restated per subclass: seven of them
 * carried byte-identical copies (T6's finding, re-measured in T16 and found to be seven
 * rather than the two the scouting report named). Every element in the tree may carry an
 * `xml:id`, so the ones that previously had no such accessor gain a working one rather
 * than a stub.
 */
export abstract class AbstractXmlSubtree {
  private xml: Element | null = null;

  /** The `xml:id` attribute node, or null while the element carries none. */
  protected id: Attribute | null = null;

  /**
   * The element this subtree wraps.
   *
   * Declared non-nullable although the field starts at null, because every subclass's
   * {@link parseData} calls {@link setXml} before it reads anything back, and `parseData`
   * is the only way to reach a constructed instance — the factories run it inside their
   * `try` and return null if it throws. `setXml` cannot be handed a null either (see its
   * signature), so an instance that a caller can observe always has its element.
   *
   * Use {@link getXmlOrNull} in the one situation this does not cover: code holding a
   * subtree whose `parseData` has not run yet.
   */
  getXml(): Element {
    return this.xml!;
  }

  /** As {@link getXml}, but honest about the pre-`parseData` state. */
  getXmlOrNull(): Element | null {
    return this.xml;
  }

  /**
   * Null is not accepted: the non-nullable {@link getXml} rests on that, and nothing in
   * the tree ever wanted to un-set an element.
   */
  protected setXml(xml: Element): void {
    this.xml = xml;
  }

  protected abstract parseData(xml: Element): void;

  /**
   * Set, replace or (with null) remove the `xml:id`, in the object and in the element.
   *
   * Removal detaches the attribute but does not touch its value, so a caller still
   * holding the {@link Attribute} keeps reading the old id from a node that is no longer
   * in the document — the behaviour every copy of this method had, preserved verbatim.
   */
  setId(id: string | null): void {
    if (id === null) {
      if (this.id !== null) {
        this.id.detach();
        this.id = null;
      }
      return;
    }
    if (this.id === null) {
      this.id = new Attribute('xml:id', XML_NAMESPACE, id);
      this.getXml().addAttribute(this.id);
      return;
    }
    this.id.setValue(id);
  }

  getId(): string | null {
    return this.id === null ? null : this.id.getValue();
  }

  toXml(): string {
    if (this.xml === null) return '';
    return this.xml.toXML();
  }
}
