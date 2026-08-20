/**
 * DESIGN.md D-I's selection layer: MPM `xml:id`s in, the dimensions those elements govern out.
 *
 * This is the half of `spotlight` that reads the document. The other half is not a transform
 * at all — once the spared set is known, spotlight is `exaggerate` with a factor vector and
 * `gesture` scope, and nothing in `applier.ts` needs to know a selection happened. Keeping the
 * two apart is what makes that true: this module never writes, and the applier never resolves.
 *
 * ## Why the table is transcribed rather than derived
 *
 * D-I's type → dimension table is a **selection** vocabulary, and the registry is a **write**
 * vocabulary. They agree on eight of the nine entries and cannot agree on the ninth:
 * `<ornament>` carries no exaggerable attribute of its own — the three ornament dimensions
 * write into the `<temporalSpread>` and `<dynamicsGradient>` children of the `<ornamentDef>`
 * it references by name. A caller selects the ornament they can see in their score, not the
 * def behind it, so the table maps the instruction and the registry keeps the sites.
 * `tests/expression/selection.test.ts` cross-checks the other eight against `REGISTRY_ROWS`,
 * so the two can only diverge deliberately.
 *
 * ## The three ways a distribution differs from every other row
 *
 * A `<distribution.*>` element's dimension is not decided by its own name — all five
 * distribution shapes appear under all four imprecision maps — but by **which map encloses
 * it** (§7.13's three per-domain dimensions). Hence the walk carries the nearest enclosing
 * `imprecisionMap.*` down with it. Two consequences worth stating rather than discovering:
 *
 * - a distribution under `imprecisionMap.tuning` maps to **no** dimension, because A9 excludes
 *   the tuning domain as inert (nothing in this codebase reads `tuning.offset`), so selecting
 *   one is an `unmappable` offender and not a silent identity;
 * - `<measurement>`, the child of a `<distribution.list>` that the registry actually writes,
 *   is not itself a `distribution.*` type and is `unmappable`. Selecting the enclosing
 *   `<distribution.list>` is what spares the domain — the whole list is one atomic group.
 */
import { IMPRECISION_MAP } from '../mpm/names.js';
import type { Element } from '../xml/XomTypes.js';
import { attribute } from '../xml/tree.js';
import {
  DISTRIBUTION_ELEMENTS,
  EXPRESSION_DIMENSIONS,
  IMPRECISION_DIMENSION_MAPS,
  type ExpressionDimension,
} from './registry.js';

/**
 * DESIGN.md D-I's mapping table, minus the distribution family.
 *
 * Element **local** names, because that is what the document carries once `Element.wrap` has
 * dropped the namespace prefix — the same reading `mpmTree.ts` indexes maps by.
 */
const TYPE_DIMENSIONS: ReadonlyMap<string, readonly ExpressionDimension[]> = new Map<
  string,
  readonly ExpressionDimension[]
>([
  ['tempo', ['tempo', 'tempoShape']],
  ['dynamics', ['dynamics', 'dynamicsShape']],
  ['rubato', ['rubato']],
  ['articulation', ['articulation']],
  ['accentuationPattern', ['accentuation']],
  ['ornament', ['ornamentSpread', 'ornamentSpacing', 'ornamentDynamics']],
  ['asynchrony', ['asynchrony']],
  ['movement', ['pedalShape']],
]);

/** Which imprecision dimension each `imprecisionMap.*` local name governs (`tuning`: none). */
const IMPRECISION_MAP_DIMENSIONS: ReadonlyMap<string, ExpressionDimension> = new Map(
  EXPRESSION_DIMENSIONS.flatMap((dimension) => {
    const map = IMPRECISION_DIMENSION_MAPS[dimension];
    return map === undefined ? [] : [[map, dimension] as const];
  }),
);

const DISTRIBUTION_TYPES = new Set<string>(DISTRIBUTION_ELEMENTS);

/**
 * The element local names D-I's table names, apart from the distribution family.
 *
 * Exported so the suite can guard the table in **both** directions. A test can already check
 * that a given row spares exactly what the registry writes at that element; without the
 * vocabulary itself being enumerable, nothing could check that no *extra* row exists — and the
 * extra row is the dangerous direction, because it makes an unselectable element spotlight-able
 * and spares dimensions it does not govern. A mutation adding `'styleDef'` to the table passed
 * the entire suite before this export existed.
 */
export const SELECTABLE_TYPES: readonly string[] = [...TYPE_DIMENSIONS.keys()];

/** The other half of the vocabulary: the imprecision maps a `distribution.*` may be spared in. */
export const SELECTABLE_IMPRECISION_MAPS: readonly string[] = [
  ...IMPRECISION_MAP_DIMENSIONS.keys(),
];

/** One id that named an element D-I's table maps to at least one dimension. */
export interface ResolvedSelection {
  readonly id: string;
  /** The local name of the element the id was found on. */
  readonly element: string;
  /** The dimensions this element type spares, in {@link EXPRESSION_DIMENSIONS} order. */
  readonly dimensions: readonly ExpressionDimension[];
}

/**
 * Why one id could not be turned into a spared set (A8).
 *
 * `unresolved` — nothing in the document carries it. That covers a stale id, and also a score
 * id copied out of the MSM: an MPM has no `<note>` elements, so such an id resolves to nothing
 * rather than to something unmappable.
 *
 * `unmappable` — something does carry it, but its element type governs no dimension: a
 * `<style>` switch, a `<styleDef>`'s def, a `<measurement>`, a distribution in the inert tuning
 * domain.
 */
export interface SelectionOffender {
  readonly id: string;
  readonly kind: 'unresolved' | 'unmappable';
  /** The local name found, or null when nothing carried the id. */
  readonly element: string | null;
  /** A one-line reason, ready to be read by a human. */
  readonly detail: string;
}

/** What {@link resolveSelection} found: never partially applied, always fully reported. */
export interface Selection {
  readonly resolved: readonly ResolvedSelection[];
  readonly offenders: readonly SelectionOffender[];
  /** The union of every resolved element's dimensions, in {@link EXPRESSION_DIMENSIONS} order. */
  readonly spared: readonly ExpressionDimension[];
}

/** An element and the map that decides what it means — the pair the table is keyed on. */
interface Located {
  readonly element: Element;
  /** The nearest enclosing `imprecisionMap.*`, or null outside one. */
  readonly imprecisionMap: string | null;
}

/**
 * Resolve every id against the raw tree and map what it found onto dimensions.
 *
 * The walk is **document-wide**, not per performance, and that is deliberate: the spared set
 * parameterizes a factor *vector*, which is a property of the run rather than of a site, so an
 * id naming a `<tempo>` in one performance spares `tempo` in all of them. Narrowing the run to
 * one performance is `options.performance`'s job and stays orthogonal.
 *
 * Duplicate ids in the input collapse to one entry, in first-mention order. A duplicate id in
 * the *document* — which MPM forbids and no schema here enforces — resolves to the first
 * element in document order, the same choice the prototype's `node.get(0)` made.
 *
 * Failure is never partial: offenders are collected, never thrown, so the caller can report
 * every one of them at once (A8). A run that has any offender must not happen at all.
 */
export function resolveSelection(root: Element, ids: readonly string[]): Selection {
  const wanted = [...new Set(ids)];
  const found = locateIds(root, new Set(wanted));

  const resolved: ResolvedSelection[] = [];
  const offenders: SelectionOffender[] = [];
  for (const id of wanted) {
    const located = found.get(id);
    if (located === undefined) {
      offenders.push({
        id,
        kind: 'unresolved',
        element: null,
        detail: `no element in the document carries xml:id ${JSON.stringify(id)}`,
      });
      continue;
    }
    const element = located.element.getLocalName();
    const dimensions = dimensionsOf(located);
    if (dimensions.length === 0) {
      offenders.push({ id, kind: 'unmappable', element, detail: unmappableDetail(id, located) });
      continue;
    }
    resolved.push({ id, element, dimensions });
  }

  return { resolved, offenders, spared: unionOfDimensions(resolved) };
}

/** D-I's table applied to one located element; empty when the type governs nothing. */
function dimensionsOf(located: Located): readonly ExpressionDimension[] {
  const localName = located.element.getLocalName();
  if (DISTRIBUTION_TYPES.has(localName)) {
    const dimension =
      located.imprecisionMap === null
        ? undefined
        : IMPRECISION_MAP_DIMENSIONS.get(located.imprecisionMap);
    return dimension === undefined ? [] : [dimension];
  }
  return TYPE_DIMENSIONS.get(localName) ?? [];
}

/** The reason an `unmappable` id is unmappable, which for a distribution is its map. */
function unmappableDetail(id: string, located: Located): string {
  const localName = located.element.getLocalName();
  const where = located.imprecisionMap === null ? '' : ` inside <${located.imprecisionMap}>`;
  return (
    `xml:id ${JSON.stringify(id)} is on <${localName}>${where}, which governs no exaggeration ` +
    `dimension; selectable types are ${[...TYPE_DIMENSIONS.keys()].join(', ')} and a ` +
    `distribution under ${[...IMPRECISION_MAP_DIMENSIONS.keys()].join(', ')}`
  );
}

/** Every resolved element's dimensions, deduplicated into registry order. */
function unionOfDimensions(resolved: readonly ResolvedSelection[]): readonly ExpressionDimension[] {
  const spared = new Set(resolved.flatMap((entry) => entry.dimensions));
  return EXPRESSION_DIMENSIONS.filter((dimension) => spared.has(dimension));
}

/**
 * One pre-order walk for all the ids at once, carrying the enclosing imprecision map down.
 *
 * One walk rather than one per id, and `getChildElements` rather than `Element.query`, for the
 * reason D-A bans the latter outright: `query` serializes the subtree with `toXML()`, re-parses
 * it with DOMParser and maps hits back by child-index path, so the prototype's per-id
 * `//*[@xml:id='…']` is O(document) *per selected instruction*.
 *
 * First-in-document-order wins, so the recursion never overwrites an entry.
 */
function locateIds(root: Element, wanted: ReadonlySet<string>): ReadonlyMap<string, Located> {
  const found = new Map<string, Located>();
  const visit = (parent: Element, imprecisionMap: string | null): void => {
    for (const child of parent.getChildElements()) {
      const localName = child.getLocalName();
      const id = attribute('id', child)?.getValue() ?? null;
      if (id !== null && wanted.has(id) && !found.has(id))
        found.set(id, { element: child, imprecisionMap });
      visit(child, localName.startsWith(`${IMPRECISION_MAP}.`) ? localName : imprecisionMap);
    }
  };
  visit(root, null);
  return found;
}
