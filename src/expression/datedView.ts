/**
 * The date-stable ordering of a map's instructions, as a **view** — computed in memory,
 * never written back.
 *
 * The renderer does not read a map in document order. `GenericMap.parseData`
 * (GenericMap.ts:131-159) builds an index by inserting each dated child at the position
 * after the last entry whose date is `<=` its own, and then — this is the part DESIGN.md
 * never recorded until the panel found it — calls `sortXml()` (GenericMap.ts:167-174),
 * which removes and re-inserts every indexed child so that the DOCUMENT is rewritten into
 * that order. Because `insertChild` splices into `_children`, which also holds `Text`
 * nodes (XomTypes.ts:547-556), that pass additionally hoists every instruction in front of
 * all whitespace and leaves the skipped children stranded at the end.
 *
 * The engine must see the order the renderer sees, and must not perform that rewrite. So
 * the ordering is reproduced here and the tree is left exactly as parsed.
 *
 * ## Why the insertion loop is transliterated rather than replaced by a sort
 *
 * On well-formed input a stable `sort` by `parseFloat(@date)` agrees with
 * `GenericMap.parseData`. On an unparseable date it does not: `parseFloat('later')` is
 * `NaN`, every `date >= entries[j].date` comparison against or from a NaN is false, and
 * the insertion loop therefore falls through to its initial `index = 0` and puts the
 * element at the FRONT — where a comparator-based sort would leave it wherever the
 * engine's sort happened to put it. Documents carry such dates (nothing validates
 * `@date`), and the difference decides which `<style>` is in scope for everything after
 * it. The loop below is the same loop, so it makes the same decision.
 */
import type { Element } from '../xml/XomTypes.js';
import { attribute } from '../xml/tree.js';
import { elementAt, optionAt, scanl } from '../prelude/index.js';

/** One entry of the ordered view: an instruction (or a `<style>` switch) and where it sits. */
export interface DatedEntry {
  readonly element: Element;
  /**
   * `parseFloat(@date)`, which is what `GenericMap` keys on — and which may legitimately be
   * `NaN`, since nothing in the parse path rejects a malformed date.
   */
  readonly date: number;
  /**
   * Position among the map's element children in DOCUMENT order — not the position in this
   * view. It is `SiteRef.index`, and it is the locator that survives the reordering the
   * view describes.
   */
  readonly documentIndex: number;
}

/**
 * The map's instructions in date-stable order.
 *
 * Two kinds of child are excluded, exactly as `GenericMap.parseData` excludes them
 * (GenericMap.ts:145-146): a child with no `@date`, because there is nowhere to put it on
 * the timeline, and a `<style>` with no `@name.ref`, because it references nothing. Both
 * stay untouched in the tree; they are simply invisible to every lookup, which is also why
 * an in-view `<style>` is guaranteed to carry a `@name.ref`.
 *
 * Ties keep document order: the backwards scan finds the LAST position whose date is `<=`
 * the new one, so equal-dated children are inserted after their predecessors. That
 * stability is load-bearing — it is what makes the equal-date style-scope case in
 * {@link styleSwitchAt} decidable at all.
 */
export function orderedEntries(map: Element): readonly DatedEntry[] {
  const entries: DatedEntry[] = [];
  for (const [documentIndex, element] of map.getChildElements().toArray().entries()) {
    const dateAttribute = attribute('date', element);
    if (dateAttribute === null) continue;
    if (element.getLocalName() === 'style' && attribute('name.ref', element) === null) continue;

    const date = parseFloat(dateAttribute.getValue());
    // Linear from the end and not a binary search, for the reason `GenericMap.insertionIndexFor`
    // states at length: `parseFloat` answers NaN for a malformed `@date`, NaN compares false
    // against everything, and this scan therefore puts such an entry at 0 and steps over it —
    // where a bisection would split on a partition point that is false on both sides. The two
    // agree on every ordered input; this module exists to agree with `GenericMap` on all of them.
    // As `GenericMap.insertionIndexFor`, and for the same NaN reason: `findLastIndex` is the
    // backwards linear scan, and its `-1` miss maps to index 0 under the same `+ 1`.
    const index = entries.findLastIndex((entry) => date >= entry.date) + 1;
    entries.splice(index, 0, { element, date, documentIndex });
  }
  return entries;
}

/**
 * The `<style>` switch in scope at view position `index` — `GenericMap.findStyleSwitchAt`
 * (GenericMap.ts:480-486), which is what the renderer actually calls
 * (`TempoMap.getTempoDataOf` at TempoMap.ts:128, `DynamicsMap.getDynamicsDataOf` at
 * DynamicsMap.ts:160).
 *
 * **This is positional, and it is not the same lookup as the public
 * `getStyleAt(date, type)`.** The scan runs backwards by array position from `index`, so an
 * instruction that PRECEDES a style switch at the very same date has no style in scope,
 * while the date-based lookup would hand it that switch. The divergence is real and
 * ordinary: for
 *
 * ```xml
 * <dynamicsMap><dynamics date="0.0" volume="f"/><style date="0.0" name.ref="MEI export"/></dynamicsMap>
 * ```
 *
 * the renderer resolves `volume="f"` with no style at all, falls through to
 * `parseFloat("f")` and renders 100.0, where `getStyleAt(0, dynamicsStyles)` would find the
 * style and yield 97.0. An engine using the public lookup would put 97 into the
 * performance-wide geometric mean the renderer computes from 100, and would rewrite a def
 * as if it governed a level it does not.
 *
 * The scan starts AT `index`, so a `<style>` sharing a position with the instruction being
 * resolved is in scope for it.
 */
export function styleSwitchAt(entries: readonly DatedEntry[], index: number): Element | null {
  for (let j = index; j >= 0; --j) {
    const element = elementAt(entries, j, 'dated entry').element;
    if (element.getLocalName() === 'style') return element;
  }
  return null;
}

/**
 * The style name in scope at view position `index`, or null when no switch precedes it —
 * `GenericMap.findStyleNameAt` (GenericMap.ts:493-496).
 *
 * An in-view `<style>` always has a `@name.ref` (see {@link orderedEntries}), but that
 * value may be the empty string, which `GenericMap.getStyle` treats exactly like no style
 * (GenericMap.ts:507). It is returned as-is here and rejected by the resolver, so the two
 * distinguishable cases — "no switch yet" and "a switch to nothing" — stay
 * distinguishable for reporting.
 */
export function styleNameAt(entries: readonly DatedEntry[], index: number): string | null {
  return nameOfStyle(styleSwitchAt(entries, index));
}

/** {@link styleNameAt}'s reading of a switch element, shared with {@link styleNamesOf}. */
function nameOfStyle(style: Element | null): string | null {
  return style === null ? null : (attribute('name.ref', style)?.getValue() ?? '');
}

/**
 * {@link styleNameAt} for EVERY view position at once, in one forward pass.
 *
 * "The style in scope here" is a running quantity whose intermediate states are all wanted,
 * which is {@link scanl} exactly — and the caller that wants them all is
 * `readScopeMapViews`, which built the same array by calling the backwards scan once per
 * index. That is quadratic in the map's length, with an XML `getLocalName()` read as the
 * constant, and a `<dynamicsMap>` over a full movement is not short.
 *
 * The `+ 1` is load-bearing rather than an off-by-one to be tidied away. `scanl` is
 * seed-first: `states[0]` is the seed and `states[i + 1]` is the state AFTER consuming
 * `entries[i]`. "After consuming `entries[i]`" is precisely {@link styleSwitchAt}'s
 * inclusive-at-`index` rule — a `<style>` sharing a position with the instruction being
 * resolved is in scope for it — so `states[i + 1]` is the answer for view position `i`, and
 * `states[0]`'s `null` is the "no switch yet" that never gets read here.
 *
 * `optionAt` and not an indexed read: the sequence legitimately HOLDS nulls, and the two
 * absences are different questions. It cannot miss — `index + 1` runs to `entries.length`
 * and `states` has `entries.length + 1` slots — but the read says which one it is asking.
 *
 * {@link styleNameAt} and {@link styleSwitchAt} stay: they are the per-position API, they
 * are tested directly, and a caller resolving ONE instruction should not build an array.
 */
export function styleNamesOf(entries: readonly DatedEntry[]): readonly (string | null)[] {
  const states = scanl<DatedEntry, Element | null>(entries, null, (style, entry) =>
    entry.element.getLocalName() === 'style' ? entry.element : style,
  );
  return entries.map((_entry, index) => nameOfStyle(optionAt(states, index + 1, STYLE_SCOPE)));
}

/** What an out-of-range read into the style-scope scan is called. */
const STYLE_SCOPE = 'the style-scope scan';
