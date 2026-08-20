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
import { elementAt } from '../prelude/index.js';

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
    let index = 0;
    for (let j = entries.length - 1; j >= 0; --j) {
      if (date >= elementAt(entries, j, 'dated entry').date) {
        index = j + 1;
        break;
      }
    }
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
  const style = styleSwitchAt(entries, index);
  return style === null ? null : (attribute('name.ref', style)?.getValue() ?? '');
}
