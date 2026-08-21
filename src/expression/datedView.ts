/**
 * The date-stable ordering of a map's instructions, as a view — computed in memory, never
 * written back.
 *
 * The renderer does not read a map in document order. `GenericMap.parseData`
 * (GenericMap.ts:131-159) inserts each dated child after the last entry whose date is `<=`
 * its own, then calls `sortXml()` (GenericMap.ts:167-174), which rewrites the DOCUMENT into
 * that order — and, because `insertChild` splices into a `_children` that also holds `Text`
 * nodes (XomTypes.ts:547-556), additionally hoists every instruction in front of all
 * whitespace and strands the skipped children at the end. The engine must see the order the
 * renderer sees without performing that rewrite, so the ordering is reproduced here and the
 * tree is left exactly as parsed.
 *
 * The insertion loop is transliterated rather than replaced by a sort because of NaN. On
 * well-formed input a stable `sort` by `parseFloat(@date)` agrees with
 * `GenericMap.parseData`; on an unparseable date it does not. `parseFloat('later')` is
 * `NaN`, every `date >= entries[j].date` comparison against or from a NaN is false, so the
 * loop falls through to its initial `index = 0` and puts the element at the FRONT — where a
 * comparator-based sort would leave it wherever the engine's sort happened to put it.
 * Documents carry such dates (nothing validates `@date`), and the difference decides which
 * `<style>` is in scope for everything after it.
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
 * (GenericMap.ts:145-146): a child with no `@date`, and a `<style>` with no `@name.ref`.
 * Both stay untouched in the tree and are invisible to every lookup, which is why an
 * in-view `<style>` is guaranteed to carry a `@name.ref`.
 *
 * Ties keep document order: the backwards scan finds the LAST position whose date is `<=`
 * the new one, so equal-dated children are inserted after their predecessors. That
 * stability is what makes the equal-date style-scope case in {@link styleSwitchAt}
 * decidable at all.
 */
export function orderedEntries(map: Element): readonly DatedEntry[] {
  const entries: DatedEntry[] = [];
  for (const [documentIndex, element] of map.getChildElements().toArray().entries()) {
    const dateAttribute = attribute('date', element);
    if (dateAttribute === null) continue;
    if (element.getLocalName() === 'style' && attribute('name.ref', element) === null) continue;

    const date = parseFloat(dateAttribute.getValue());
    // Linear from the end rather than a bisection, and it must stay that way to agree with
    // `GenericMap.insertionIndexFor`: `parseFloat` answers NaN for a malformed `@date`, NaN
    // compares false against everything, so such an entry lands at 0 and every later one steps
    // over it — where a bisection would split on a partition point false on both sides.
    // `findLastIndex` is that backwards scan, its `-1` for no match mapping to 0 under the `+ 1`.
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
 * Positional, and not the same lookup as the public `getStyleAt(date, type)`: the scan runs
 * backwards by array position from `index`, so an instruction that PRECEDES a style switch
 * at the very same date has no style in scope, where the date-based lookup would hand it
 * that switch. In a `<dynamics date="0.0" volume="f"/>` followed by a `<style date="0.0"
 * name.ref="MEI export"/>` the renderer resolves `volume="f"` with no style at all, falls
 * through to `parseFloat("f")` and renders 100.0, where `getStyleAt` would find the style
 * and yield 97.0 — feeding 97 into a geometric mean the renderer computes from 100.
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
 * {@link styleNameAt} for EVERY view position at once, in one forward pass — linear, where
 * calling the backwards scan once per index is quadratic in the map's length, and a
 * `<dynamicsMap>` over a full movement is not short.
 *
 * The `+ 1` is load-bearing: {@link scanl} is seed-first, so `states[0]` is the seed and
 * `states[i + 1]` is the state AFTER consuming `entries[i]` — which is precisely
 * {@link styleSwitchAt}'s inclusive-at-`index` rule, making `states[i + 1]` the answer for
 * view position `i`. `states[0]`'s `null` is the "no switch yet" that never gets read here.
 *
 * `optionAt` and not an indexed read: the sequence legitimately HOLDS nulls, so the two
 * absences are different questions. It cannot miss — `index + 1` runs to `entries.length`
 * and `states` has `entries.length + 1` slots — but the read says which one it is asking.
 */
export function styleNamesOf(entries: readonly DatedEntry[]): readonly (string | null)[] {
  const states = scanl<DatedEntry, Element | null>(entries, null, (style, entry) =>
    entry.element.getLocalName() === 'style' ? entry.element : style,
  );
  return entries.map((_entry, index) => nameOfStyle(optionAt(states, index + 1, STYLE_SCOPE)));
}

const STYLE_SCOPE = 'the style-scope scan';
