/**
 * {@link SiteRef} — DESIGN.md §4's plain-data locator for one (element, attribute) pair, and
 * the derivations for the two kinds of site the engine reaches: a map instruction and a
 * `styleDef`'s def.
 *
 * A `SiteRef` is what the report hands back to callers, so it is plain JSON: no XOM node escapes
 * into it (RULE F1's `structuredClone`-safety), and every numeric field is finite or null
 * (RULE N4).
 *
 * `index` is the load-bearing locator; the others are conveniences, since `xmlId` is absent from
 * 7 of the 16 reference fixtures altogether and `date` is absent on defs and unparseable on some
 * instructions. It is a position among the container's element children in DOCUMENT order, not
 * the position in `datedView.ts`'s date-stable view: the view is an artefact of the reader,
 * while document order is what the caller sees in the file they passed in. The two differ on any
 * map whose children are not already date-sorted, which is precisely when a locator is worth
 * having.
 */
import type { Element } from '../xml/XomTypes.js';
import { attribute } from '../xml/tree.js';
import type { DatedEntry } from './datedView.js';
import type { MpmEnvironment } from './mpmTree.js';

/** DESIGN.md §4. One transform site, as data. */
export interface SiteRef {
  readonly scope: 'global' | 'part';
  /** Position among the performance's `<part>` children; null in the global environment. */
  readonly partIndex: number | null;
  /** `'dynamicsMap'`, `'dynamicsStyles/MEI export'`, … — see {@link defContainerLabel}. */
  readonly container: string;
  /** `parseFloat(@date)` when the element carries a finite one; null otherwise. */
  readonly date: number | null;
  /** Position among the container's element children, in document order. */
  readonly index: number;
  readonly attribute: string;
  /** `@xml:id` or `@id`, whichever the element carries; null when it carries neither. */
  readonly xmlId: string | null;
}

/**
 * The container label for a def site: the style collection's local name and the enclosing
 * `styleDef`'s name, e.g. `dynamicsStyles/MEI export`. The `styleDef` name is part of the label
 * rather than a field of its own because only the pair identifies a def — one collection can
 * hold several `styleDef`s, two of which can hold a def of the same name with different values.
 */
export function defContainerLabel(collectionName: string, styleDefName: string): string {
  return `${collectionName}/${styleDefName}`;
}

/** `@date` as a reportable number: null when absent, and null when present but not finite. */
function reportableDate(element: Element): number | null {
  const raw = attribute('date', element);
  if (raw === null) return null;
  const date = parseFloat(raw.getValue());
  return Number.isFinite(date) ? date : null;
}

/**
 * `@xml:id` / `@id`, read through the three-namespace lookup that resolves both spellings
 * (tree.ts:400-413) — MEI puts ids in the XML namespace, this converter's own output does
 * not, and both appear in real MPM.
 */
function xmlIdOf(element: Element): string | null {
  return attribute('id', element)?.getValue() ?? null;
}

/**
 * A `SiteRef` for an attribute of a map instruction. O(1): the document-order position is
 * already carried by the ordered view's {@link DatedEntry}, computed while walking the map.
 */
export function instructionSiteRef(
  environment: MpmEnvironment,
  mapName: string,
  entry: DatedEntry,
  attributeName: string,
): SiteRef {
  return {
    scope: environment.scope,
    partIndex: environment.partIndex,
    container: mapName,
    date: reportableDate(entry.element),
    index: entry.documentIndex,
    attribute: attributeName,
    xmlId: xmlIdOf(entry.element),
  };
}

/**
 * A `SiteRef` for an attribute of a def inside a `styleDef`.
 *
 * The index is found by scanning the `styleDef`'s element children for identity, O(defs in this
 * styleDef): a def collection is a handful of elements, and unlike a map there is no pre-walked
 * view to carry the position on.
 *
 * `environment` must be the environment the `styleDef` was FOUND in (what
 * `styleScope.findStyleDef` returns), not the one the referencing instruction lives in: a part
 * map resolving a name through the global header writes a global site, and reporting it as a
 * part site would claim a part-local edit when the blast radius is the whole performance.
 */
export function defSiteRef(
  environment: MpmEnvironment,
  collectionName: string,
  styleDef: Element,
  def: Element,
  attributeName: string,
): SiteRef {
  return {
    scope: environment.scope,
    partIndex: environment.partIndex,
    container: defContainerLabel(collectionName, attribute('name', styleDef)?.getValue() ?? ''),
    date: reportableDate(def),
    index: styleDef.getChildElements().toArray().indexOf(def),
    attribute: attributeName,
    xmlId: xmlIdOf(def),
  };
}

/**
 * A `SiteRef` for any (element, attribute) pair whose container the caller already holds — the
 * general case behind the two above, for sites that are neither map instructions nor defs (a
 * `<distribution>` under an `imprecisionMap`, an `<accentuation>` under an
 * `accentuationPatternDef`).
 *
 * `index` is `-1` when `element` is not an element child of `container`: a caller error rather
 * than a document condition, reported rather than thrown so that a bad locator can never abort
 * a transform that is otherwise correct.
 */
export function siteRefOf(
  environment: MpmEnvironment,
  containerLabel: string,
  container: Element,
  element: Element,
  attributeName: string,
): SiteRef {
  return {
    scope: environment.scope,
    partIndex: environment.partIndex,
    container: containerLabel,
    date: reportableDate(element),
    index: container.getChildElements().toArray().indexOf(element),
    attribute: attributeName,
    xmlId: xmlIdOf(element),
  };
}
