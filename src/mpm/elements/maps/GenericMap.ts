import { Attribute, Element } from '../../../xml/XomTypes.js';
import { AbstractXmlSubtree } from '../../../xml/AbstractXmlSubtree.js';
import { attribute, getAttributeValue } from '../../../xml/tree.js';
import { Header } from '../Header.js';
import { KeyValue } from '../../../supplementary/KeyValue.js';
import { GenericStyle } from '../styles/GenericStyle.js';

const MPM_NAMESPACE = 'http://www.cemfi.de/mpm/ns/1.0';

/** Map/element names that belong to the MPM namespace */
const MPM_NAMES = new Set([
  'articulationMap',
  'articulation',
  'asynchronyMap',
  'asynchrony',
  'dynamicsMap',
  'dynamics',
  'imprecisionMap',
  'imprecisionMap.timing',
  'imprecisionMap.dynamics',
  'imprecisionMap.toneduration',
  'imprecisionMap.tuning',
  'distribution.uniform',
  'distribution.gaussian',
  'distribution.triangular',
  'distribution.correlated.brownianNoise',
  'distribution.correlated.compensatingTriangle',
  'distribution.list',
  'measurement',
  'metricalAccentuationMap',
  'accentuationPattern',
  'ornamentationMap',
  'ornament',
  'rubatoMap',
  'rubato',
  'tempoMap',
  'tempo',
  'movementMap',
  'movement',
  'style',
]);

/**
 * Base class for every MPM map: a date-ordered sequence of instruction elements living
 * under a `<dated>`, plus the lookup and rendering machinery its subclasses share.
 *
 * A map keeps the same data twice, and keeping the two in step is this class's whole
 * job. {@link elements} is a sorted array of `(date, element)` pairs used for all
 * lookups; the XML element returned by `getXml()` is the serialized form. Every mutator
 * here — {@link addElement}, {@link insertElement}, {@link removeElement},
 * {@link sort} — updates both, in that order. Writing to one alone corrupts the map:
 * lookups would disagree with the document that gets serialized.
 *
 * Subclasses are registered rather than switched on. Each map module ends with a
 * `GenericMap.registerMapFactory(localName, factory)` call, and
 * {@link createTypedMap} dispatches on the element's local name, falling back to a
 * plain GenericMap for unknown ones. That is what lets `Dated` parse a map it has
 * never heard of without a central dependency on all the subclasses — but it also means
 * **importing a map module is what registers it**, so the import side effects in the
 * MPM barrel are load-bearing.
 *
 * Port of meico.mpm.elements.maps.GenericMap
 */
export class GenericMap extends AbstractXmlSubtree {
  private static readonly _factories = new Map<string, (xml: Element) => GenericMap | null>();

  static registerMapFactory(type: string, factory: (xml: Element) => GenericMap | null): void {
    GenericMap._factories.set(type, factory);
  }

  static createTypedMap(type: string, xml: Element): GenericMap | null {
    const factory = GenericMap._factories.get(type);
    if (factory) return factory(xml);
    return GenericMap.createGenericMap(xml);
  }

  elements: KeyValue<number, Element>[] = [];
  private globalHeader: Header | null = null;
  private localHeader: Header | null = null;

  protected constructor(typeOrXml: string | Element) {
    super();
    if (typeof typeOrXml === 'string') {
      const type = typeOrXml;
      if (!type.includes('Map') && type !== 'score')
        throw new Error(
          `Cannot generate GenericMap object. Local name "${type}" must contain "Map" or equal "score".`,
        );
      if (MPM_NAMES.has(type)) this.parseData(new Element(type, MPM_NAMESPACE));
      else this.parseData(new Element(type));
    } else {
      this.parseData(typeOrXml);
    }
  }

  /**
   * Create a map either from a local name (a fresh, empty map) or from an existing
   * element (parsed). The two overloads are kept separate rather than merged into
   * `string | Element` because they are genuinely different construction modes, and the
   * signature is the only place that says so.
   *
   * Returns null instead of throwing when the input is not a valid map — the whole MPM
   * parse is best-effort, and a malformed map must not abort the surrounding document.
   */
  static createGenericMap(name: string): GenericMap | null;
  static createGenericMap(xml: Element): GenericMap | null;
  static createGenericMap(nameOrXml: string | Element): GenericMap | null {
    try {
      return new GenericMap(nameOrXml);
    } catch (e) {
      console.error(e);
      return null;
    }
  }

  /**
   * Build the {@link elements} index from the XML children, then bring the XML back
   * into that order.
   *
   * Two kinds of child are skipped: anything without a `date` (there is nowhere to put
   * it on the timeline) and `<style>` elements without a `name.ref` (they reference
   * nothing). Skipped children stay in the document but are invisible to every lookup —
   * and, because {@link sortXml} only reorders the elements it knows about, they drift
   * to the end of the serialized map.
   *
   * The insertion is a backwards linear scan rather than an append, so children that
   * were already out of order in the source document are indexed in date order. It
   * finds the *last* position whose date is `<=` the new one, which makes the pass
   * stable: same-dated children keep their document order.
   */
  protected parseData(xml: Element): void {
    if (xml === null) throw new Error('Cannot generate GenericMap object. XML Element is null.');
    if (!xml.getLocalName().includes('Map') && xml.getLocalName() !== 'score')
      throw new Error(
        `Cannot generate GenericMap object. Local name "${xml.getLocalName()}" must contain "Map" or equal "score".`,
      );

    this.elements = [];
    this.setXml(xml);

    const es = this.getXml().getChildElements();
    for (let i = 0; i < es.size(); ++i) {
      const e = es.get(i);
      const d = attribute('date', e);
      if (d === null) continue;
      if (e.getLocalName() === 'style' && attribute('name.ref', e) === null) continue;
      const date = parseFloat(d.getValue());
      let index = 0;
      for (let j = this.elements.length - 1; j >= 0; --j) {
        if (date >= this.elements[j].getKey()) {
          index = j + 1;
          break;
        }
      }
      this.elements.splice(index, 0, new KeyValue(date, e));
    }
    this.sortXml();
    this.id = attribute('id', this.getXml());
  }

  /**
   * Rewrite the XML children into the order {@link elements} is already in, by removing
   * and re-inserting each one at its index. Detach-then-insert is required: the element
   * is already a child, and inserting it a second time without removing it first would
   * be rejected by the XOM emulation.
   */
  private sortXml(): void {
    const xml = this.getXml();
    for (let i = 0; i < this.elements.length; ++i) {
      const e = this.elements[i].getValue();
      xml.removeChild(e);
      xml.insertChild(e, i);
    }
  }

  /**
   * Re-sort the map after its elements' `date` attributes have been edited underneath
   * it — which is exactly what happens when articulation or rubato shifts a note's
   * timing. The cached keys are refreshed from the XML first, then an insertion sort
   * runs over the array, and finally the XML children are brought back in line.
   *
   * The insertion sort is deliberate and must not become `Array.prototype.sort`: it is
   * stable, and it is near-linear on the almost-sorted input this always receives,
   * whereas swapping in a different algorithm would reorder equal-date elements and
   * change which of several simultaneous instructions wins.
   */
  sort(): void {
    for (const e of this.elements) {
      const date = parseFloat(getAttributeValue('date', e.getValue()));
      if (e.getKey() !== date) e.setKey(date);
    }
    for (let i = 1; i < this.size(); ++i) {
      const e = this.elements[i];
      let moveToIndex = i;
      for (let j = i - 1; j >= 0 && e.getKey() < this.elements[j].getKey(); --j) moveToIndex = j;
      if (moveToIndex !== i) {
        const tmp = this.elements[i];
        this.elements[i] = this.elements[moveToIndex];
        this.elements[moveToIndex] = tmp;
      }
    }
    this.sortXml();
  }

  getType(): string {
    return this.getXml().getLocalName();
  }
  /**
   * PARITY NOTE — a stub. Java's `GenericMap.setType` calls `Element.setLocalName()`,
   * which the XomTypes layer does not implement (xmldom nodes cannot be renamed in
   * place). So the validation still runs and still logs, but the rename that is the
   * point of the method does not happen.
   *
   * Harmless as things stand: a map's type is fixed at construction and nothing in the
   * MEI/MSM ⇒ MIDI pipeline calls this. Kept so the surface matches the reference, and
   * so that a future caller finds this note rather than silent nothing.
   */
  protected setType(type: string): void {
    if (!type.includes('Map')) {
      console.error(`Cannot set the specified map type. "${type}" must contain "Map".`);
      return;
    }
  }

  setHeaders(globalHeader: Header | null, localHeader: Header | null): void {
    this.globalHeader = globalHeader;
    this.localHeader = localHeader;
  }
  getGlobalHeader(): Header | null {
    return this.globalHeader;
  }
  getLocalHeader(): Header | null {
    return this.localHeader;
  }

  /** The live index, exposed read-only — the map keeps it in step with the XML itself. */
  getAllElements(): readonly KeyValue<number, Element>[] {
    return this.elements;
  }
  getAllElementsOfType(type: string): readonly KeyValue<number, Element>[] {
    return this.elements.filter((e) => e.getValue().getLocalName() === type);
  }
  getAllElementsAt(date: number): readonly KeyValue<number, Element>[] {
    const results: KeyValue<number, Element>[] = [];
    let index = this.getElementIndexAtAfter(date);
    if (index >= 0) {
      results.push(this.elements[index]);
      for (++index; index < this.size() && this.elements[index].getKey() === date; ++index)
        results.push(this.elements[index]);
    }
    return results;
  }

  getFirstElement(): Element | null {
    return this.elements.length === 0 ? null : this.elements[0].getValue();
  }
  getLastElement(): Element | null {
    return this.elements.length === 0 ? null : this.elements[this.size() - 1].getValue();
  }
  getElement(index: number): Element | null {
    return index >= this.elements.length || index < 0 ? null : this.elements[index].getValue();
  }

  getElementByID(id: string): Element | null {
    const i = this.getElementIndexByID(id);
    return i < 0 ? null : this.elements[i].getValue();
  }
  getElementIndexByID(id: string): number {
    for (let i = 0; i < this.size(); ++i) {
      const a = attribute('id', this.elements[i].getValue());
      if (a !== null && a.getValue() === id) return i;
    }
    return -1;
  }

  getElementBeforeAt(date: number): Element | null {
    const i = this.getElementIndexBeforeAt(date);
    return i < 0 ? null : this.elements[i].getValue();
  }
  getElementAfter(date: number): Element | null {
    const i = this.getElementIndexAfter(date);
    return i < 0 ? null : this.elements[i].getValue();
  }

  /**
   * The four `getElementIndex{BeforeAt,Before,After,AtAfter}` searches below are
   * near-identical binary searches that differ only in which comparisons are strict.
   * They are **not** interchangeable and they are not duplication to be factored out:
   * picking "the last element at or before this date" versus "strictly before it"
   * decides whether an instruction dated exactly on a note applies to that note, and
   * different callers need different answers. Each returns -1 for "no such element".
   *
   * Reading them: the two guards at the top handle the out-of-range cases so the loop
   * can assume a hit exists, and the loop then probes `mid` and `mid + 1` together,
   * which is what lets it return a boundary rather than an exact match. `mid + 1` is
   * safe precisely because the guards excluded the case where the answer is the last
   * element. Every comparison here is load-bearing; verify against the unit tests
   * before touching any of them.
   */
  getElementIndexBeforeAt(date: number): number {
    if (this.elements.length === 0 || this.elements[0].getKey() > date) return -1;
    if (this.elements[this.elements.length - 1].getKey() <= date) return this.elements.length - 1;
    let first = 0,
      last = this.elements.length - 1,
      mid = Math.floor(last / 2);
    while (first <= last) {
      if (this.elements[mid + 1].getKey() <= date) first = mid + 1;
      else if (this.elements[mid].getKey() <= date) return mid;
      else last = mid - 1;
      mid = Math.floor((first + last) / 2);
    }
    return -1;
  }

  getElementIndexBefore(date: number): number {
    if (this.elements.length === 0 || this.elements[0].getKey() >= date) return -1;
    if (this.elements[this.elements.length - 1].getKey() < date) return this.elements.length - 1;
    let first = 0,
      last = this.elements.length - 1,
      mid = Math.floor(last / 2);
    while (first <= last) {
      if (this.elements[mid].getKey() >= date) last = mid;
      else if (this.elements[mid + 1].getKey() >= date) return mid;
      else first = mid + 1;
      mid = Math.floor((first + last) / 2);
    }
    return -1;
  }

  getElementIndexAfter(date: number): number {
    if (this.elements.length === 0 || this.elements[this.elements.length - 1].getKey() <= date)
      return -1;
    if (this.elements[0].getKey() > date) return 0;
    let first = 0,
      last = this.elements.length - 1,
      mid = Math.floor(last / 2);
    while (first <= last) {
      if (this.elements[mid].getKey() > date) last = mid - 1;
      else if (this.elements[mid + 1].getKey() > date) return mid + 1;
      else first = mid + 1;
      mid = Math.floor((first + last) / 2);
    }
    return -1;
  }

  getElementIndexAtAfter(date: number): number {
    if (this.elements.length === 0 || this.elements[this.elements.length - 1].getKey() < date)
      return -1;
    if (this.elements[0].getKey() >= date) return 0;
    let first = 0,
      last = this.elements.length - 1,
      mid = Math.floor(last / 2);
    while (first <= last) {
      if (this.elements[mid].getKey() >= date) last = mid - 1;
      else if (this.elements[mid + 1].getKey() >= date) return mid + 1;
      else first = mid + 1;
      mid = Math.floor((first + last) / 2);
    }
    return -1;
  }

  getElementIndexOf(element: Element | null): number {
    if (element === null) return -1;
    for (let i = 0; i < this.elements.length; ++i)
      if (this.elements[i].getValue() === element) return i;
    return -1;
  }

  addElement(xml: Element): number {
    if (xml === null) {
      console.error('Cannot add the Element to GenericMap. XML Element is null.');
      return -1;
    }
    const dateAtt = xml.getAttribute('date');
    if (dateAtt === null) {
      console.error("Cannot add the Element to GenericMap. Missing attribute 'date'.");
      return -1;
    }
    if (xml.getLocalName() === 'style' && xml.getAttribute('name.ref') === null) {
      console.error('Cannot add style Element without name.ref.');
      return -1;
    }
    const date = parseFloat(dateAtt.getValue());
    return this.insertElement(new KeyValue(date, xml), false);
  }

  /**
   * Insert into both the array and the XML at the same index, keeping them in step.
   *
   * `firstAtDate` picks which side of an existing group of same-dated elements the new
   * one lands on: false (the default) scans backwards and appends *after* the last
   * element at that date, true scans forwards and inserts *before* the first. Style
   * switches use true so that a style takes effect for instructions sharing its date;
   * ordinary instructions use false so they queue up in insertion order.
   */
  protected insertElement(element: KeyValue<number, Element>, firstAtDate = false): number {
    if (firstAtDate) {
      for (let i = 0; i < this.elements.length; ++i) {
        if (this.elements[i].getKey() >= element.getKey()) {
          this.elements.splice(i, 0, element);
          this.getXml().insertChild(element.getValue(), i);
          return i;
        }
      }
    } else {
      for (let i = this.elements.length - 1; i >= 0; --i) {
        if (this.elements[i].getKey() <= element.getKey()) {
          const index = i + 1;
          this.elements.splice(index, 0, element);
          this.getXml().insertChild(element.getValue(), index);
          return index;
        }
      }
    }
    this.elements.splice(0, 0, element);
    this.getXml().insertChild(element.getValue(), 0);
    return 0;
  }

  removeElement(index: number): void;
  removeElement(xml: Element): void;
  removeElement(indexOrXml: number | Element): void {
    if (typeof indexOrXml === 'number') {
      if (indexOrXml >= this.elements.length) return;
      this.getXml().removeChild(this.elements[indexOrXml].getValue());
      this.elements.splice(indexOrXml, 1);
    } else {
      for (let i = 0; i < this.elements.length; i++) {
        if (this.elements[i].getValue() === indexOrXml) {
          this.getXml().removeChild(indexOrXml);
          this.elements.splice(i, 1);
          return;
        }
      }
    }
  }

  addStyleSwitch(date: number, styleName: string, id?: string | null): number {
    const e = new Element('style', MPM_NAMESPACE);
    e.addAttribute(new Attribute('date', String(date)));
    e.addAttribute(new Attribute('name.ref', styleName));
    if (id !== undefined && id !== null)
      e.addAttribute(new Attribute('xml:id', 'http://www.w3.org/XML/1998/namespace', id));
    return this.insertElement(new KeyValue(date, e), true);
  }

  /**
   * The entry a `get*DataOf` accessor should read for `index`, or -1 when there is none.
   *
   * The shared opening of all eight of those accessors, and deliberately asymmetric: an
   * index past the end reads the LAST entry, while a negative index (or an empty map)
   * means "nothing".
   *
   * An index rather than the entry itself, so the per-instruction render path allocates
   * nothing (RULE I6), and -1 rather than null to match the four `getElementIndex*`
   * searches this class already answers that way.
   */
  protected clampEntryIndex(index: number): number {
    if (this.elements.length === 0 || index < 0) return -1;
    return index >= this.elements.length ? this.elements.length - 1 : index;
  }

  /**
   * {@link clampEntryIndex} plus the kind test the accessor applies to the entry it lands
   * on: -1 when that entry is not the instruction the caller can parse — a `<style>`
   * switch above all. `ImprecisionMap` matches on a name *prefix* instead and so uses the
   * clamp directly.
   */
  protected resolveEntryIndex(index: number, localName: string): number {
    const i = this.clampEntryIndex(index);
    if (i < 0) return -1;
    return this.elements[i].getValue().getLocalName() === localName ? i : -1;
  }

  /**
   * The `<style>` switch in scope at entry `index`: the nearest one at or before it, or
   * null when no style has been switched on yet. Note the scan starts *at* `index`, so a
   * style switch is in scope for an instruction sharing its position.
   */
  protected findStyleSwitchAt(index: number): Element | null {
    for (let j = index; j >= 0; --j) {
      const s = this.elements[j].getValue();
      if (s.getLocalName() === 'style') return s;
    }
    return null;
  }

  /**
   * The name the {@link findStyleSwitchAt} switch refers to, or null when there is no
   * switch in scope. A switch without a `name.ref` yields '' — the same empty string the
   * `*Data` classes default `styleName` to, which {@link getStyle} then resolves to null.
   */
  protected findStyleNameAt(index: number): string | null {
    const s = this.findStyleSwitchAt(index);
    return s === null ? null : getAttributeValue('name.ref', s);
  }

  getStyleNameAt(date: number): string | null {
    const list = this.getAllElementsOfType('style');
    for (let i = list.length - 1; i >= 0; --i) {
      if (list[i].getKey() <= date) return getAttributeValue('name.ref', list[i].getValue());
    }
    return null;
  }

  getStyle(styleType: string, styleName: string | null): GenericStyle | null {
    if (styleName === null || styleName === '') return null;
    let style: GenericStyle | null = null;
    if (this.getLocalHeader() !== null)
      style = this.getLocalHeader()!.getStyleDef(styleType, styleName);
    if (style === null && this.getGlobalHeader() !== null)
      style = this.getGlobalHeader()!.getStyleDef(styleType, styleName);
    return style;
  }

  getStyleAt(date: number, styleType: string): GenericStyle | null {
    return this.getStyle(styleType, this.getStyleNameAt(date));
  }

  size(): number {
    return this.elements.length;
  }
  isEmpty(): boolean {
    return this.elements.length === 0;
  }
  contains(element: Element): boolean {
    return element.getParent() === this.getXml();
  }

  updateAttributeValues(attributeName: string, valueMappings: Map<string, string>): void {
    for (const e of this.elements) {
      const a = attribute(attributeName, e.getValue());
      if (a === null) continue;
      const newValue = valueMappings.get(a.getValue());
      if (newValue !== undefined) a.setValue(newValue);
    }
  }
}
