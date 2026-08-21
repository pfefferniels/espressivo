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
import { elementAt, lowerBoundBy, upperBoundBy } from '../../../prelude/seq.js';
import { err, isErr, mapPresent, ok, orCompute, type Result } from '../../../prelude/index.js';
import { attemptParse, type MpmParseError } from '../parseError.js';

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
   * Build a map from an element that {@link sourceElement} has already accepted.
   *
   * **No virtual call here.** This used to end in `this.parseData(…)`, and `ImprecisionMap`
   * overrode `parseData` to append its own name check — a base constructor dispatching into
   * a subclass method whose own field initialisers have not run yet, which is the one real
   * dispatch edge the map cluster had and the kind of edge that is worth removing rather
   * than preserving. {@link indexElements} below is `private`, so this call is static; the
   * subclass check now runs in `ImprecisionMap`'s own factory, *after* construction, which
   * keeps the order of the two validations (generic name shape first, `imprecisionMap`
   * prefix second) and of their side effects exactly as it was.
   *
   * **And no throw here either.** The `string | Element` union and the two name checks moved
   * out to {@link sourceElement}, which answers with a `Result` instead. A constructor that
   * can fail is a constructor whose failure has to be caught somewhere, and "somewhere" was
   * the eleven `catch (e) { console.error(e); return null }` factories this replaced.
   */
  protected constructor(xml: Element) {
    super();
    this.indexElements(xml);
  }

  /**
   * The element a map will be built from, or why the name it was given is not a map's.
   *
   * Two jobs the incumbent did in two places and in two ways: `elementForType` threw for a
   * bad *name* before creating the element, and `indexElements` threw for a null or badly
   * named *element* after. Both are one question — "is this a map?" — asked before anything
   * is built, so they are one function, answering with a value.
   *
   * Only names MPM itself defines get the MPM namespace: an unrecognised `<xyzMap>` is
   * namespace-less, which is what makes a foreign map round-trip as it arrived.
   */
  protected static sourceElement(
    typeOrXml: string | Element | null,
    what: string,
  ): Result<Element, MpmParseError> {
    if (typeOrXml === null) return err({ kind: 'noElement', what });
    const localName = typeof typeOrXml === 'string' ? typeOrXml : typeOrXml.getLocalName();
    if (!localName.includes('Map') && localName !== 'score')
      return err({
        kind: 'wrongLocalName',
        what,
        localName,
        requirement: 'must contain "Map" or equal "score"',
      });
    if (typeof typeOrXml !== 'string') return ok(typeOrXml);
    return ok(
      MPM_NAMES.has(typeOrXml) ? new Element(typeOrXml, MPM_NAMESPACE) : new Element(typeOrXml),
    );
  }

  /**
   * The eleven map factories, as one function.
   *
   * Every one of them was `try { return new XMap(…) } catch (e) { console.error(e); return
   * null }` over the same two checks, so the checks live in {@link sourceElement} and the
   * only thing a subclass supplies is which constructor to call. `build` is a closure rather
   * than a `new (…) => M` field because every one of those constructors is `private`, which
   * is exactly what such a field may not hold — the same reason `maps/map.ts` spells its
   * `is` predicates out per row.
   *
   * `what` is the subclass's name and reaches only the {@link attemptParse} residue; the two
   * name checks report as `GenericMap`, because it is `GenericMap`'s rule they enforce and
   * that is the object the incumbent's message named.
   */
  protected static makeMap<M extends GenericMap>(
    typeOrXml: string | Element | null,
    what: string,
    build: (xml: Element) => M,
  ): Result<M, MpmParseError> {
    const source = GenericMap.sourceElement(typeOrXml, 'GenericMap');
    if (isErr(source)) return source;
    return attemptParse(what, () => build(source.value));
  }

  /**
   * The empty element a map of this class starts life as — **and the reason the no-argument
   * factories are total** where the parsing ones are not.
   *
   * {@link sourceElement} can refuse exactly two things: a null element, and a name that is
   * not a map name. The no-argument form supplies neither — the class passes its own
   * `names.ts` constant, which the thirteen-row table in `maps/map.ts` already establishes is
   * a map name — so there is nothing left for it to refuse and nothing for the caller to
   * check. `indexElements` on a childless element cannot fail either: it reads no children
   * and reorders none.
   *
   * This is the move `styles/style.ts` made for `createStyle`, and it is worth its own
   * function rather than a `!` on `makeMap`'s result: the totality is a property of *not
   * consulting the caller*, which the signature can then state, and an assertion would only
   * have hidden the same fact behind a claim.
   */
  protected static emptyMapElement(type: string): Element {
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
   * element (parsed).
   *
   * The two used to be two overloads, kept apart on the argument that they are "genuinely
   * different construction modes, and the signature is the only place that says so". The
   * signature was not saying it: both arms go to {@link makeMap}, whose own parameter is
   * this union, and `string` and `Element` are disjoint — so unlike `Header.addStyleType`,
   * where the two modes really do have different bodies and different return types, there is
   * nothing here for two signatures to state that one does not. What the pair DID do was
   * hide the third case the implementation has always accepted and reported on, `null`,
   * which a test was reaching by casting past the compiler.
   *
   * 90 call sites, split roughly evenly between the two forms and almost all in tests; none
   * of them moves.
   *
   * Reports the reason instead of printing it — the whole MPM parse stays best-effort, and
   * a malformed map still must not abort the surrounding document, but "which map, and why"
   * is now something the surrounding document's reader can find out.
   */
  static createGenericMap(nameOrXml: string | Element | null): Result<GenericMap, MpmParseError> {
    return GenericMap.makeMap(nameOrXml, 'GenericMap', (xml) => new GenericMap(xml));
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
   * stable: same-dated children keep their document order. That scan is
   * {@link insertionIndexFor}, shared with {@link insertElement}.
   *
   * Private, and that is load-bearing: it is called from the constructor, where a virtual
   * call would reach a subclass before that subclass's own initialisation had run.
   */
  private indexElements(xml: Element): void {
    this.elements = [];
    this.setXml(xml);

    // The child list is a fixed snapshot, so the splice below — which rewrites `elements`,
    // not the XML — cannot disturb the walk.
    for (const e of this.getXml().getChildElements()) {
      const d = attribute('date', e);
      if (d === null) continue;
      if (e.getLocalName() === 'style' && attribute('name.ref', e) === null) continue;
      const date = parseFloat(d.getValue());
      this.elements.splice(this.insertionIndexFor(date), 0, new KeyValue(date, e));
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
   * Refresh the cached keys from the XML, re-order the array, and bring the XML children
   * back in line.
   *
   * **This is now a sort. It did not used to be one, and the comment that once stood here
   * was wrong about it in every particular** — it claimed a deliberate stable insertion
   * sort that must not become `Array.prototype.sort`. What the loop actually did was find
   * the leftmost index the element belonged at and then **swap** the two positions, where
   * an insertion sort shifts the intervening elements right. A swap strands everything
   * between the two ends, so the pass left the array unsorted and was not stable either:
   *
   *     [2, 3, 1]       ->  [1, 3, 2]
   *     [1, 3, 2, 0]    ->  [0, 2, 3, 1]
   *     [5, 4, 3, 2, 1] ->  [1, 5, 4, 3, 2]
   *
   * Java was identical — `GenericMap.java`'s `Collections.swap(this.elements, i, moveToIndex)`
   * — so it was an inherited defect rather than a port defect, and it was left alone for a
   * long time under the parity rule. It has now been repaired in the fork first
   * (`meico@a1bdf254`) and here to match: the swap became a splice-out/splice-in, which is
   * the stable insertion sort the code always meant to be.
   *
   * (It did get simple cases right, which is why it never looked broken: an arrangement
   * with a single displaced element that belongs at the end comes out sorted.)
   *
   * **No output moved, and that was expected.** {@link elements} is keyed on `@date`, the
   * SYMBOLIC date — `parseData` builds every key from `attribute('date', …)`, and every
   * lookup on it is symbolic ({@link getElementIndexBeforeAt}, {@link getAllElementsAt}).
   * Re-reading `@date` is the only thing this method could correctly do; keying the index
   * on `date.perf` would break every symbolic lookup in the renderer.
   *
   * The one caller cannot perturb what it re-checks. `ArticulationMap` runs
   * `if (mapTimingChanged) map.sort()` after articulating notes, and articulation writes
   * `@date.perf`, `@duration.perf` and `@velocity` — never `@date`. So the keys really are
   * unchanged, the array really is already ordered, and the pass finds nothing to move.
   * The call is a no-op by construction, here and in Java, where `ArticulationMap.java:479`
   * is likewise the only `sort()` call in the whole `mpm` package.
   *
   * The defect was reachable only by a future caller that edits `@date` on elements already
   * in the map and then sorts. Nothing does that today; the point of the repair is that
   * whoever does it first no longer silently gets a scrambled map. Recorded in PARITY.md §3.
   */
  sort(): void {
    for (const e of this.elements) {
      const date = parseFloat(getAttributeValue('date', e.getValue()));
      if (e.getKey() !== date) e.setKey(date);
    }
    for (let i = 1; i < this.size(); ++i) {
      const e = elementAt(this.elements, i, 'GenericMap.sort');
      let moveToIndex = i;
      for (let j = i - 1; j >= 0 && e.getKey() < elementAt(this.elements, j, 'sort').getKey(); --j)
        moveToIndex = j;
      // Shift, do not swap. `moveToIndex < i`, so removing at `i` leaves every earlier
      // index alone and the re-insert lands where the scan said it belongs.
      if (moveToIndex !== i) {
        this.elements.splice(i, 1);
        this.elements.splice(moveToIndex, 0, e);
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
  /**
   * The entries dated exactly `date` — plus, when there is none, the first entry after it.
   *
   * That asymmetry is the loop this replaces: it pushed the at-or-after entry *before*
   * testing anything and only then walked on while the date still matched. So a lookup at a
   * date the map does not carry answers with the next entry rather than with nothing, and
   * that is Java's answer too (`GenericMap.getAllElementsAt`).
   *
   * As a range: the run of matching entries on a date-sorted index ends at the upper bound
   * for `date`, which is where the walk stopped. When the first entry is dated after `date`
   * that bound sits at or before `start`, and the `max` is what keeps the unconditional
   * first push — one entry, and no more.
   */
  getAllElementsAt(date: number): readonly KeyValue<number, Element>[] {
    const start = this.getElementIndexAtAfter(date);
    if (start < 0) return [];
    const end = upperBoundBy(this.elements, entryDate, date);
    return this.elements.slice(start, Math.max(end, start + 1));
  }

  getFirstElement(): Element | null {
    return this.elements.at(0)?.getValue() ?? null;
  }
  getLastElement(): Element | null {
    return this.elements.at(-1)?.getValue() ?? null;
  }
  /**
   * The entry at `index`, or null when there is none — including for a negative index, which
   * is why the explicit test stays: `Array.prototype.at` reads a negative index from the END,
   * so `getElement(-1)` would start answering with the last entry rather than with null.
   */
  getElement(index: number): Element | null {
    return index < 0 ? null : (this.elements.at(index)?.getValue() ?? null);
  }

  getElementByID(id: string): Element | null {
    return this.getElement(this.getElementIndexByID(id));
  }
  getElementIndexByID(id: string): number {
    return this.elements.findIndex((e) => attribute('id', e.getValue())?.getValue() === id);
  }

  getElementBeforeAt(date: number): Element | null {
    return this.getElement(this.getElementIndexBeforeAt(date));
  }
  getElementAfter(date: number): Element | null {
    return this.getElement(this.getElementIndexAfter(date));
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
    return this.elements.findIndex((e) => e.getValue() === element);
  }

  /** Null is accepted and refused with a reason on stderr, as `GenericMap.java` does. */
  addElement(xml: Element | null): number {
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
    const index = firstAtDate
      ? this.elements.findIndex((e) => e.getKey() >= element.getKey())
      : this.insertionIndexFor(element.getKey());
    // `findIndex` says -1 for "every existing entry is earlier", and the loop this replaces
    // said the same thing by falling out of the bottom into the insert-at-0 below. That is
    // a quirk rather than a rounding of it: a `firstAtDate` insert whose date is past every
    // entry lands at the FRONT of the map, not at the back. Java does the same, and the one
    // caller — `addStyleSwitch` — is why a style switch after the last instruction takes
    // effect from the top of the map. Kept exactly.
    const at = index < 0 ? 0 : index;
    this.elements.splice(at, 0, element);
    this.getXml().insertChild(element.getValue(), at);
    return at;
  }

  /**
   * The position a new entry dated `date` takes: one past the last entry at or before it, or
   * 0 when there is none. The backwards scan {@link indexElements} and {@link insertElement}
   * both used, written once.
   *
   * Linear from the end and not {@link upperBoundBy}, although this class binary-searches the
   * same array in four other places. Those four only READ an index that is already ordered;
   * this one decides what the order will be, and it is reached with a date straight out of
   * `parseFloat`, which answers NaN for a malformed `@date`. Every comparison against NaN is
   * false, so the scan puts such an entry at 0 and walks past it when placing later ones —
   * where a binary search would probe it as a partition point and split the array on an
   * answer that is false on both sides. The two agree on every ordered input; they do not
   * agree on that one, and the ordering is serialized (`sortXml`), so it is byte-visible.
   */
  private insertionIndexFor(date: number): number {
    // `findLastIndex` (ES2023) IS the backwards linear scan this comment defends, so the
    // spelling now says what the reasoning says. Its `-1` for "no entry qualifies" is the
    // same answer the loop's fall-through gave: `-1 + 1` is 0, insert at the front. The NaN
    // behaviour is untouched, because the predicate and the direction are untouched — and
    // the checked read is gone with the index it was checking.
    return this.elements.findLastIndex((entry) => entry.getKey() <= date) + 1;
  }

  /**
   * Remove the entry at `index`.
   *
   * An index past the end is a no-op; a NEGATIVE one throws, as it always has — the read
   * used to produce undefined and fail on `.getValue()`, and now says which index and
   * which bound. Only the message changed. There is no `< 0` guard because adding one
   * would turn that throw into a silent no-op, which is a different contract.
   *
   * This and {@link removeElement} were one overload set (`removeElement(index)` /
   * `removeElement(xml)`) picked apart by a `typeof` in the body. They remove different
   * things — a position in the sequence, and a particular element — so they are two methods
   * with two names, which is the same information the overload pair carried and the only
   * form of it the compiler agrees is not one signature written twice.
   */
  removeElementAt(index: number): void {
    if (index >= this.elements.length) return;
    this.getXml().removeChild(elementAt(this.elements, index, 'removeElement').getValue());
    this.elements.splice(index, 1);
  }

  /** Remove this very element, if it is in the map; an element it does not hold is a no-op. */
  removeElement(xml: Element): void {
    const at = this.getElementIndexOf(xml);
    if (at < 0) return;
    this.getXml().removeChild(xml);
    this.elements.splice(at, 1);
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
    return this.getElement(i)?.getLocalName() === localName ? i : -1;
  }

  /**
   * The entry an already-resolved index names — both halves of it, the element to read
   * attributes off and the key that is the instruction's start date.
   *
   * The eight `get*DataOf` accessors reach for both after {@link resolveEntryIndex} or
   * {@link clampEntryIndex} has put the index in range, and each used to re-read
   * `this.elements[i]` twice to get them. This is that read, written once so the bound is
   * proved in one place rather than in sixteen. An index rather than the entry comes back out
   * of the resolvers because the accessors need it for {@link nextDateOfType} and
   * {@link findStyleNameAt} as well, and returning a pair would allocate per instruction.
   */
  protected entryAt(index: number): KeyValue<number, Element> {
    return elementAt(this.elements, index, 'map entry');
  }

  /**
   * Where the instruction at `index` stops being in force: the date of the next entry named
   * `localName`, or `Number.MAX_VALUE` when there is none.
   *
   * This was five private `getEndDate(index)` methods — in `TempoMap`, `DynamicsMap`,
   * `RubatoMap`, `MetricalAccentuationMap` and `MovementMap` (a reader arriving from a
   * `…Map.getEndDate:NNN` citation elsewhere in the tree wants this method). Five copies,
   * not five overrides: none was ever reached through a base-class reference, and they
   * differed in exactly one token, the local name they scan for — `tempo`, `dynamics`,
   * `rubato`, `accentuationPattern`, `movement`. Naming that token is the whole of the
   * unification.
   *
   * `MAX_VALUE` and not null because it is what the callers do with it: `endDate` is the
   * open end of a span they compare dates against, and "there is no next one" means the span
   * runs to the end of time. Four of the five spelled that as an early `return`, `TempoMap`
   * as a `break` out of an initialised local; the two are the same function.
   *
   * `ImprecisionMap` deliberately does not use this. Its spans end at the next entry of
   * *any* name, style switches included, which is a different rule and stays written out
   * where it is (see `DistributionSpan.endDate`).
   */
  protected nextDateOfType(index: number, localName: string): number {
    for (let j = index + 1; j < this.elements.length; ++j) {
      const entry = elementAt(this.elements, j, 'nextDateOfType');
      if (entry.getValue().getLocalName() === localName) return entry.getKey();
    }
    return Number.MAX_VALUE;
  }

  /**
   * The `<style>` switch in scope at entry `index`: the nearest one at or before it, or
   * null when no style has been switched on yet. Note the scan starts *at* `index`, so a
   * style switch is in scope for an instruction sharing its position.
   */
  protected findStyleSwitchAt(index: number): Element | null {
    for (let j = index; j >= 0; --j) {
      const s = elementAt(this.elements, j, 'findStyleSwitchAt').getValue();
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

  /**
   * The style name in force at `date` by DATE — the date-based sibling of the positional
   * {@link findStyleNameAt}, and not the same lookup (see `expression/datedView.ts`'s
   * `styleSwitchAt`, which documents where the two diverge and why the renderer wants the
   * positional one).
   *
   * A forward pass keeping the last qualifying switch, where this was a backwards scan with
   * a break: both answer with the highest-positioned switch dated at or before `date`, and
   * the forward one needs no index to say so. The early exit it gives up is worth nothing
   * here — `list` is already a filtered copy holding only the `<style>` children, of which a
   * map carries a handful.
   */
  getStyleNameAt(date: number): string | null {
    let inForce: KeyValue<number, Element> | null = null;
    for (const entry of this.getAllElementsOfType('style')) {
      if (entry.getKey() <= date) inForce = entry;
    }
    return inForce === null ? null : getAttributeValue('name.ref', inForce.getValue());
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
