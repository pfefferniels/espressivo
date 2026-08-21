/**
 * Parts, map resolution and part matching — where DESIGN.md §5.0's *two* shadowing rules
 * live.
 *
 * ## Maps shadow wholesale; style defs do not
 *
 * §5.0 (AD-16 / R22) keeps these apart; conflating them is a bug with audible consequences:
 *
 * - Maps. `Performance.resolvePartMaps:603-632` is `dated.getMap(TYPE) ?? global`, per type. A
 *   part-local `tempoMap` replaces the global one entirely, including for dates it does not
 *   cover, and an empty `<dynamicsMap/>` is non-null and therefore shadows too. A part with no
 *   MPM counterpart inherits the global set wholesale.
 * - Style defs. `GenericMap.getStyle:506-514` falls back local → global per style name, so a
 *   part header declaring `styleDef name="A"` hides the global `"A"` entirely, defs and all,
 *   with no per-def merge, while leaving the global `"B"` visible.
 *
 * Only the first rule is implemented here. The second is `styleScope`'s and must stay so —
 * §5.0 says resolution "must go through `styleScope`, never through a direct header scan" — so
 * this module carries the environments a level resolution needs and never resolves one itself.
 *
 * ## Which parts exist at all
 *
 * `Part.parseData:90-105` throws when `@number`, `@midi.channel` or `@midi.port` is missing or
 * empty, `Part.fromXml` turns that into a failure, and `Performance.parseData:213-219` `continue`s
 * past it. Such a `<part>` is never performed, and charging a document for material the renderer
 * discards is what §5.0 rules out in the neighbouring case: a global-vs-part-local encoding
 * difference with identical resolved curves "is distance 0 plus a structural note — which is
 * correct: it is not performed". A non-renderable part is therefore excluded from matching and
 * flagged, not compared against neutral.
 */
import { filterMap, partitionWith } from '../prelude/index.js';
import type { Element } from '../xml/XomTypes.js';
import { attribute } from '../xml/tree.js';
import type { MpmEnvironment, PerformanceView } from '../expression/mpmTree.js';

/**
 * One evaluation scope: the global environment, or one `<part>` with the global one behind
 * it.
 *
 * `maps` is already resolved — part-local first, global second, wholesale. Every downstream
 * reader takes the map from here and never repeats the fallback, which keeps the
 * empty-map-shadows rule in one place instead of at each call site.
 */
export interface ComparisonScope {
  readonly scope: 'global' | 'part';
  /** Position among the performance's `<part>` children; null for the global scope. */
  readonly partIndex: number | null;
  /** `@number` as an integer, or null when absent, empty or unparseable. */
  readonly number: number | null;
  /** `@name`, or null when absent. Note the raw read: the renderer would write `""`. */
  readonly name: string | null;
  /**
   * Whether `Part.fromXml` would have produced a part at all.
   *
   * Always true for the global scope. False means the renderer drops this `<part>` whole,
   * and it is reported as a structural note rather than compared.
   */
  readonly renderable: boolean;
  /** The environment this scope reads its own maps and style collections from. */
  readonly environment: MpmEnvironment;
  /** Map local name → element, after wholesale part-over-global resolution. */
  readonly maps: ReadonlyMap<string, Element>;
}

/** `@number` the way `Part.parseData:108` reads it, with its rejection rule applied first. */
function readPartNumber(element: Element): number | null {
  const raw = attribute('number', element);
  if (raw === null || raw.getValue() === '') return null;
  const parsed = parseInt(raw.getValue());
  return Number.isFinite(parsed) ? parsed : null;
}

/** True when `Part.parseData:90-105` would not have thrown on this element. */
function isRenderablePart(element: Element): boolean {
  for (const name of ['number', 'midi.channel', 'midi.port']) {
    const raw = attribute(name, element);
    if (raw === null || raw.getValue() === '') return false;
  }
  return true;
}

/**
 * Part-over-global map resolution, wholesale.
 *
 * The union of both environments' map names rather than the renderer's fixed twelve fields: on
 * those twelve this is exactly `resolvePartMaps`, and on a map name the model does not define —
 * the surveyed corpus has a `gestureMap` — it keeps the element visible for reporting.
 * `spanEndRuleOf` later decides that such a map has no law to apply.
 *
 * `part.maps.has(name)` rather than a truthiness test on the element: that *is* the
 * empty-map-shadows rule, since an empty `<dynamicsMap/>` is a good element and must win over
 * the global one.
 */
export function resolveScopeMaps(
  part: MpmEnvironment,
  global: MpmEnvironment,
): ReadonlyMap<string, Element> {
  const resolved = new Map<string, Element>();
  for (const [name, element] of global.maps) resolved.set(name, element);
  for (const [name, element] of part.maps) resolved.set(name, element);
  return resolved;
}

/**
 * The scopes one performance is evaluated over.
 *
 * §5.0: *"Documents that are global-only on both sides evaluate once, not per part."* That
 * decision needs both documents, so it is not taken here — this returns the global scope and
 * every part scope, and {@link matchScopes} is where a pair with no parts on either side
 * collapses to the single global evaluation.
 */
export function readScopes(performance: PerformanceView): readonly ComparisonScope[] {
  const global: ComparisonScope = {
    scope: 'global',
    partIndex: null,
    number: null,
    name: attribute('name', performance.element)?.getValue() ?? null,
    renderable: true,
    environment: performance.global,
    maps: new Map(performance.global.maps),
  };

  const parts = performance.parts.map((environment, partIndex): ComparisonScope => {
    const element = environment.element;
    return {
      scope: 'part',
      partIndex,
      number: readPartNumber(element),
      name: attribute('name', element)?.getValue() ?? null,
      renderable: isRenderablePart(element),
      environment,
      maps: resolveScopeMaps(environment, performance.global),
    };
  });

  return [global, ...parts];
}

/**
 * One row of §9.3's `parts` array: a matched pair, or one side against neutral.
 *
 * `matched` false with a non-null `numberA` and null `numberB` is "A has this part and B does
 * not", which R6 compares against the neutral curve and reports as a structural note — not an
 * error and not an exclusion, since a pair-dependent part set would break R3 the same way a
 * pair-dependent dimension set would.
 */
export interface ScopePairing {
  readonly scope: 'global' | 'part';
  readonly numberA: number | null;
  readonly numberB: number | null;
  readonly nameA: string | null;
  readonly nameB: string | null;
  readonly matched: boolean;
  /** True when both sides are present and their `@name` disagrees (§5.0 reports it). */
  readonly nameDisagreement: boolean;
  /** Null on the side that has no scope here. */
  readonly a: ComparisonScope | null;
  readonly b: ComparisonScope | null;
}

/**
 * Match two performances' scopes: global to global, parts by `@number`.
 *
 * The union, in a deterministic order — R2 requires that `compare(a,b)` and `compare(b,a)`
 * agree bit for bit, so the row order may not depend on which document is `a`. Numbered
 * parts sort by number; parts with no usable `@number` cannot be matched at all and follow
 * in document order, each against neutral.
 *
 * Non-renderable parts are dropped before matching, for the reason in the module header.
 */
export function matchScopes(
  a: readonly ComparisonScope[],
  b: readonly ComparisonScope[],
): readonly ScopePairing[] {
  const globalA = a.find((scope) => scope.scope === 'global') ?? null;
  const globalB = b.find((scope) => scope.scope === 'global') ?? null;

  const pairings: ScopePairing[] = [
    {
      scope: 'global',
      numberA: null,
      numberB: null,
      nameA: globalA?.name ?? null,
      nameB: globalB?.name ?? null,
      matched: globalA !== null && globalB !== null,
      nameDisagreement: false,
      a: globalA,
      b: globalB,
    },
  ];

  // The renderable parts of one side, split into the ones a `@number` can match and the ones it
  // cannot. `partitionWith` makes the two halves complementary by construction and preserves
  // document order in each, which is what the tail block depends on.
  const renderableParts = (scopes: readonly ComparisonScope[]) =>
    partitionWith(
      scopes.filter((scope) => scope.scope === 'part' && scope.renderable),
      (part) => part.number !== null,
    );
  const partsA = renderableParts(a);
  const partsB = renderableParts(b);

  // `partitionWith`'s predicate is not a type guard, so `yes` still declares `number | null`;
  // the `=== null` test narrows it where the entry is built. It cannot fire — the alternative is
  // an `as number` asserting what the split already established.
  const numbered = (scopes: readonly ComparisonScope[]) =>
    new Map(
      filterMap(scopes, (scope) =>
        scope.number === null ? null : ([scope.number, scope] as const),
      ),
    );
  const byNumberA = numbered(partsA.yes);
  const byNumberB = numbered(partsB.yes);

  const numbers = [...new Set([...byNumberA.keys(), ...byNumberB.keys()])].sort((x, y) => x - y);
  for (const number of numbers) {
    const scopeA = byNumberA.get(number) ?? null;
    const scopeB = byNumberB.get(number) ?? null;
    pairings.push({
      scope: 'part',
      numberA: scopeA === null ? null : number,
      numberB: scopeB === null ? null : number,
      nameA: scopeA?.name ?? null,
      nameB: scopeB?.name ?? null,
      matched: scopeA !== null && scopeB !== null,
      nameDisagreement:
        scopeA !== null && scopeB !== null && (scopeA.name ?? '') !== (scopeB.name ?? ''),
      a: scopeA,
      b: scopeB,
    });
  }

  // Parts with no usable @number, each against neutral. They keep document order, which is
  // symmetric because the A-side block always precedes the B-side block regardless of which
  // document was passed first.
  for (const scope of partsA.no)
    pairings.push({
      scope: 'part',
      numberA: null,
      numberB: null,
      nameA: scope.name,
      nameB: null,
      matched: false,
      nameDisagreement: false,
      a: scope,
      b: null,
    });
  for (const scope of partsB.no)
    pairings.push({
      scope: 'part',
      numberA: null,
      numberB: null,
      nameA: null,
      nameB: scope.name,
      matched: false,
      nameDisagreement: false,
      a: null,
      b: scope,
    });

  return pairings;
}
