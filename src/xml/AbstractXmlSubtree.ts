import { Attribute, Element } from './XomTypes.js';
import { MissingNodeError } from './errors.js';

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
 * The `xml:id` accessors live here rather than being restated per subclass, because every
 * element in the tree may carry an `xml:id`.
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
   * The field still has to start at null, because the base class has no constructor that
   * takes an element, so the invariant is checked rather than asserted: an un-parsed subtree
   * raises a {@link MissingNodeError} naming that state instead of a `TypeError` from
   * whichever `Element` member the caller reached for next. Use {@link getXmlOrNull} in the
   * one situation this does not cover: code holding a subtree whose `parseData` has not run.
   */
  getXml(): Element {
    const xml = this.xml;
    if (xml === null)
      throw new MissingNodeError('this subtree has no element yet — parseData has not run');
    return xml;
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

  /**
   * Read `xml` into this subtree's typed state, and {@link setXml} it.
   *
   * A shape constraint, not a dispatch point: nothing in the tree ever calls this through a
   * base-class reference. Every call is either a subclass's own static factory calling it on
   * the instance it just made, or a subclass's implementation delegating up with
   * `super.parseData(xml)`. What the abstract declaration buys — and all it buys, so a
   * forwarding override here would be unreachable — is the invariant that an
   * `AbstractXmlSubtree` is *constructed by parsing an element*, which is what
   * {@link getXml}'s non-nullable return rests on.
   */
  protected abstract parseData(xml: Element): void;

  /**
   * Set, replace or (with null) remove the `xml:id`, in the object and in the element.
   *
   * Removal detaches the attribute but does not touch its value, so a caller still holding
   * the {@link Attribute} keeps reading the old id from a node that is no longer in the
   * document.
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
