import { Attribute, Element } from '../../../xml/XomTypes.js';
import { AbstractXmlSubtree } from '../../../xml/AbstractXmlSubtree.js';
import { attribute, getAttributeValue } from '../../../xml/tree.js';
import { Header } from '../Header.js';
import { KeyValue } from '../../../supplementary/KeyValue.js';
import {
  collectionNameOfKind,
  styleOfKind,
  type StyleKind,
  type StyleOfKind,
} from '../styles/style.js';
import { lowerBoundBy, upperBoundBy } from '../../../prelude/seq.js';
import { mapPresent, orCompute } from '../../../prelude/index.js';

const MPM_NAMESPACE = 'http://www.cemfi.de/mpm/ns/1.0';

/** The date an entry of {@link GenericMap.elements} is sorted by. */
function entryDate(entry: KeyValue<number, Element>): number {
  return entry.getKey();
}

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
 * Which class a given `<dated>` child is read into is decided by the one exhaustive table
 * in `maps/map.ts`, which this class does not — and must not — know about: the nine
 * subclasses import *it*, so a table here would be a nine-way cycle. See that module for
 * what the table replaced (a static mutable factory registry filled by import side
 * effects) and why the direction of the edge is the whole point.
 *
 * Port of meico.mpm.elements.maps.GenericMap
 */
export class GenericMap extends AbstractXmlSubtree {
  elements: KeyValue<number, Element>[] = [];
  private globalHeader: Header | null = null;
  private localHeader: Header | null = null;

  /**
   * Build a map from a local name (a fresh, empty one) or from an existing element.
   *
   * **No virtual call here.** This used to end in `this.parseData(…)`, and `ImprecisionMap`
   * overrode `parseData` to append its own name check — a base constructor dispatching into
   * a subclass method whose own field initialisers have not run yet, which is the one real
   * dispatch edge the map cluster had and the kind of edge that is worth removing rather
   * than preserving. {@link indexElements} below is `private`, so this call is static; the
   * subclass check now runs in `ImprecisionMap`'s own constructor, *after* `super(…)`
   * returns, which keeps the order of the two validations (generic name shape first,
   * `imprecisionMap` prefix second) exactly as it was.
   */
  protected constructor(typeOrXml: string | Element) {
    super();
    this.indexElements(
      typeof typeOrXml === 'string' ? GenericMap.elementForType(typeOrXml) : typeOrXml,
    );
  }

  /**
   * The empty element a map of local name `type` starts life as.
   *
   * Static, because it runs to produce the argument the constructor needs and so cannot
   * touch the instance. Only names MPM itself defines get the MPM namespace: an
   * unrecognised `<xyzMap>` is namespace-less, which is what makes a foreign map round-trip
   * as it arrived.
   */
  private static elementForType(type: string): Element {
    if (!type.includes('Map') && type !== 'score')
      throw new Error(
        `Cannot generate GenericMap object. Local name "${type}" must contain "Map" or equal "score".`,
      );
    return MPM_NAMES.has(type) ? new Element(type, MPM_NAMESPACE) : new Element(type);
  }

  /**
   * Required by {@link AbstractXmlSubtree}, which declares it to state the invariant "an XML
   * subtree is constructed by parsing an element" — and which says in as many words that it
   * is a shape constraint, not a dispatch point.
   *
   * This class meets that invariant in its constructor instead. Re-parsing a *different*
   * element into a live map was never a supported operation — `Dated` indexes maps by the
   * type of the element they were built from — so this throws rather than silently doing
   * nothing. `styles/style.ts` states the same thing the same way.
   */
  protected parseData(): never {
    throw new Error('GenericMap is constructed by its factories; parseData is not an entry point.');
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
   *
   * Private, and that is load-bearing: it is called from the constructor, where a virtual
   * call would reach a subclass before that subclass's own initialisation had run.
   */
  private indexElements(xml: Element): void {
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
   * Rewrite the XML children into the order {@link elements} is already in.
   *
   * This was a remove-then-insert-at-`i` loop, which is quadratic in the map's length and
   * ran twice over every `<score>` on the render path. {@link Element.reorderChildren}
   * produces the identical child list in one pass — including for the elements this map
   * does not know about, which keep their relative order and so still drift to the end
   * exactly as {@link parseData}'s comment describes.
   */
  private sortXml(): void {
    const order: Element[] = [];
    for (const e of this.elements) order.push(e.getValue());
    this.getXml().reorderChildren(order);
  }

  /**
   * Refresh the cached keys from the XML, run a pass that is *meant* to re-order the array,
   * and bring the XML children back in line.
   *
   * **This method does not sort, and the previous version of this comment was wrong about it
   * in every particular.** It claimed a deliberate, stable insertion sort that must not become
   * `Array.prototype.sort`. What the loop below actually does is find the leftmost index the
   * element should move to and then **swap** the two positions, where an insertion sort shifts
   * the intervening elements right. Run against the code as written:
   *
   *     [2, 3, 1]       ->  [1, 3, 2]
   *     [1, 3, 2, 0]    ->  [0, 2, 3, 1]
   *     [5, 4, 3, 2, 1] ->  [1, 5, 4, 3, 2]
   *
   * So it is not a sort, and it is not stable either. Java is identical —
   * `GenericMap.java`'s `Collections.swap(this.elements, i, moveToIndex)` — so this is an
   * inherited defect, not a port defect, and it is left alone under the parity rule.
   *
   * (It does get simple cases right, which is why it has never looked broken: an arrangement
   * with a single displaced element that belongs at the end comes out sorted.)
   *
   * **Why it never fires.** Not because it reads the wrong attribute — it reads the right
   * one. {@link elements} is keyed on `@date`, the SYMBOLIC date: `parseData` builds every
   * key from `attribute('date', …)`, every lookup on it is symbolic
   * ({@link getElementIndexBeforeAt}, {@link getAllElementsAt}), and `ArticulationMap` itself
   * checks `getKey() !== ad.date` against an articulation's symbolic date. Re-reading `@date`
   * is the only thing this method could correctly do; keying the index on `date.perf` would
   * break every symbolic lookup in the renderer.
   *
   * It never fires because its one caller cannot perturb what it re-checks. `ArticulationMap`
   * runs `if (mapTimingChanged) map.sort()` after articulating notes, and articulation writes
   * `@date.perf`, `@duration.perf` and `@velocity` — never `@date`. So the keys really are
   * unchanged, the array really is already ordered, and the pass finds nothing to swap. The
   * call is a no-op by construction, in this port and in Java, where `ArticulationMap.java:479`
   * is likewise the only `sort()` call in the whole `mpm` package.
   *
   * The defect would surface only if `sort()` were called after `@date` itself had been edited
   * on elements already in the map. Nothing does that today. Recorded in PARITY.md §3.
   *
   * Note that the unit test covering this passes: its case moves one element to the end, which
   * is one of the arrangements the swap happens to get right. `GenericMap.test.ts` now also
   * pins an arrangement it gets wrong, so the behaviour is visible rather than latent.
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
   * The four `getElementIndex{BeforeAt,Before,After,AtAfter}` searches.
   *
   * They are **not** interchangeable: picking "the last element at or before this date"
   * versus "strictly before it" decides whether an instruction dated exactly on a note
   * applies to that note, and different callers need different answers. Each returns -1
   * for "no such element".
   *
   * What they no longer are is four separately-debugged binary searches. Each was six
   * lines of `first`/`last`/`mid` that probed `mid` and `mid + 1` together, guarded by two
   * range checks that existed so `mid + 1` could not run off the end — carrying a comment
   * saying every comparison was load-bearing and to verify against the unit tests before
   * touching any of them. That comment was true, and it is the definition of code that
   * should be written once.
   *
   * All four are the same two questions asked of a sorted sequence, which
   * `src/prelude/seq.ts` names after their standard meanings:
   *
   *   lowerBoundBy  first index whose date is >= the target   (std::lower_bound)
   *   upperBoundBy  first index whose date is >  the target   (std::upper_bound)
   *
   * from which: *last at-or-before* is `upperBound - 1`, *last strictly before* is
   * `lowerBound - 1`, *first after* is `upperBound`, and *first at-or-after* is
   * `lowerBound` — with `length` meaning "none", which is what the `-1` conversion below
   * expresses. `tests/prelude/seq.test.ts` checks that derivation against a brute-force
   * linear scan over 2000 pseudo-random cases with a deliberately small date range, so
   * ties and misses dominate.
   */
  getElementIndexBeforeAt(date: number): number {
    return upperBoundBy(this.elements, entryDate, date) - 1;
  }

  getElementIndexBefore(date: number): number {
    return lowerBoundBy(this.elements, entryDate, date) - 1;
  }

  getElementIndexAfter(date: number): number {
    return this.orNone(upperBoundBy(this.elements, entryDate, date));
  }

  getElementIndexAtAfter(date: number): number {
    return this.orNone(lowerBoundBy(this.elements, entryDate, date));
  }

  /** A bound of `length` means the sequence has no such element; these searches spell that -1. */
  private orNone(index: number): number {
    return index === this.elements.length ? -1 : index;
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

  /**
   * The style of a given kind named `styleName` — the part's own header first, then the
   * global one.
   *
   * Takes the {@link StyleKind} rather than the `…Styles` collection name, although the two
   * are the same fact ({@link collectionNameOfKind} is the bijection). That is what lets the
   * return type be one arm of {@link AnyStyle} instead of the whole union, and it is what
   * removed the six `as TempoStyle | null` casts the six typed maps each carried: a cast
   * asserts the kind, this checks it. `generic` resolves nothing, because it names no
   * collection to look in.
   */
  getStyle<K extends StyleKind>(kind: K, styleName: string | null): StyleOfKind<K> | null {
    if (styleName === null || styleName === '') return null;
    const styleType = collectionNameOfKind(kind);
    if (styleType === null) return null;

    // `orCompute` and not `firstPresent`: the global lookup must stay lazy. It is a pure map
    // read, so evaluating it eagerly would be observationally identical — but this runs once
    // per styled instruction, and `980ae7e` bought that path its linearity.
    const found = orCompute(
      mapPresent(this.getLocalHeader(), (h) => h.getStyleDef(styleType, styleName)),
      () => mapPresent(this.getGlobalHeader(), (h) => h.getStyleDef(styleType, styleName)),
    );
    return styleOfKind(found, kind);
  }

  getStyleAt<K extends StyleKind>(date: number, kind: K): StyleOfKind<K> | null {
    return this.getStyle(kind, this.getStyleNameAt(date));
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
