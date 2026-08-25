/**
 * Navigation over a raw MPM tree: `<mpm>` → performances → environments → maps and style
 * collections.
 *
 * An *environment* is what the renderer calls a style scope: the `<global>` element, or one
 * `<part>`. Each carries a `<header>` holding style collections and a `<dated>` holding
 * maps, and a level name in a part's map resolves against the part's header first and the
 * global one second (`GenericMap.getStyle`, GenericMap.ts:506-513). Every downstream lookup
 * takes the environment it is reading from plus the performance's global environment, and so
 * never has to ask the tree where it is.
 *
 * ## Faithfulness notes
 *
 * - Discovery is by name shape, over descendants, last-one-wins — not by an allow-list over
 *   children. `Header.parseData` and `Dated.parseData` select with the same
 *   `isStyleCollectionName` and `isMapName` this module uses, both feeding a map keyed by
 *   local name where a later entry replaces an earlier one. The pre-order child walk here
 *   visits the same elements in the same order. `Element.query` is banned because it
 *   serializes the subtree with `toXML()`, re-parses it and maps hits back by child-index
 *   path — O(document) per call; `xml/tree.js`'s `allChildElements` and its two-argument
 *   `firstChildElement` are `query` in a wrapper and banned for the same reason.
 * - The tree is never repaired — `mpmDocument.ts` lists what the MPM classes fix up at parse.
 *   Here a missing `<dated>` yields an environment with no maps, and both duplicates of a map
 *   or a style collection stay in the document, only the last one visible to the index.
 * - `imprecisionMap.timing` and friends are ordinary local names. The imprecision domain is
 *   encoded in the element's own local name (ImprecisionMap.ts:241-243), so keying maps by
 *   local name needs no special case and loses nothing.
 */
import type { Element } from '../xml/XomTypes.js';
import { attribute } from '../xml/tree.js';
import { isMapName, isStyleCollectionName } from '../mpm/names.js';

export type EnvironmentScope = 'global' | 'part';

/** One `<global>` or `<part>` element, with its maps and style collections indexed. */
export interface MpmEnvironment {
  readonly scope: EnvironmentScope;
  /** Position among the performance's `<part>` children; null for the global environment. */
  readonly partIndex: number | null;
  readonly element: Element;
  readonly header: Element | null;
  readonly dated: Element | null;
  /** Maps by element local name: `'tempoMap'`, `'imprecisionMap.timing'`, `'score'`, … */
  readonly maps: ReadonlyMap<string, Element>;
  /** Style collections by kind: `'tempoStyles'`, `'dynamicsStyles'`, … */
  readonly styleCollections: ReadonlyMap<string, Element>;
}

/** One `<performance>`, with its global environment and its parts. */
export interface PerformanceView {
  /** Position among the document's `<performance>` elements. */
  readonly index: number;
  /** `@name`, or `''` when absent — the renderer's own default for an unnamed performance. */
  readonly name: string;
  readonly element: Element;
  readonly global: MpmEnvironment;
  readonly parts: readonly MpmEnvironment[];
}

/**
 * Collect every descendant element whose local name satisfies `matches`, keyed by that
 * local name, in document order with the last occurrence winning.
 *
 * Pre-order — an element is recorded before its own descendants are searched — because that
 * is the order an XPath `descendant::` axis yields, and "last wins" is only well-defined
 * relative to an order.
 */
function indexDescendantsByLocalName(
  root: Element,
  matches: (localName: string) => boolean,
): Map<string, Element> {
  const found = new Map<string, Element>();
  const visit = (parent: Element): void => {
    for (const child of parent.getChildElements()) {
      if (matches(child.getLocalName())) found.set(child.getLocalName(), child);
      visit(child);
    }
  };
  visit(root);
  return found;
}

function readEnvironment(
  element: Element,
  scope: EnvironmentScope,
  partIndex: number | null,
): MpmEnvironment {
  const header = element.getFirstChildElement('header');
  const dated = element.getFirstChildElement('dated');
  return {
    scope,
    partIndex,
    element,
    header,
    dated,
    maps: dated === null ? new Map() : indexDescendantsByLocalName(dated, isMapName),
    styleCollections:
      header === null ? new Map() : indexDescendantsByLocalName(header, isStyleCollectionName),
  };
}

/**
 * The performances of an `<mpm>` root, in document order.
 *
 * A `<performance>` without a `<global>` child yields a global environment over an empty
 * synthetic element rather than a null: every downstream lookup takes a global environment
 * as its fallback, and a null there would put an `if` at each of those call sites to say
 * what the document already says by having no style collections.
 */
export function readPerformances(root: Element): readonly PerformanceView[] {
  return root
    .getChildElements('performance')
    .toArray()
    .map((element, index) => {
      const global = element.getFirstChildElement('global');
      return {
        index,
        name: attribute('name', element)?.getValue() ?? '',
        element,
        global:
          global === null
            ? emptyGlobalEnvironment(element)
            : readEnvironment(global, 'global', null),
        parts: element
          .getChildElements('part')
          .toArray()
          .map((part, partIndex) => readEnvironment(part, 'part', partIndex)),
      };
    });
}

/**
 * The stand-in for a missing `<global>`: the performance element itself, with no header,
 * no dated and no maps.
 *
 * It carries the performance element rather than a fresh one so that a `SiteRef` derived
 * through it still points at a node of the real document. Nothing can be derived here — the
 * environment is empty by construction — but no part of the engine should be able to hand
 * out a reference into a tree the caller cannot see.
 */
function emptyGlobalEnvironment(performance: Element): MpmEnvironment {
  return {
    scope: 'global',
    partIndex: null,
    element: performance,
    header: null,
    dated: null,
    maps: new Map(),
    styleCollections: new Map(),
  };
}

/** Global first, then the parts in document order — the order the engine walks sites in. */
export function environmentsOf(performance: PerformanceView): readonly MpmEnvironment[] {
  return [performance.global, ...performance.parts];
}
