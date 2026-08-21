import type { Element } from '../../../xml/XomTypes.js';
import type { Result } from '../../../prelude/index.js';
import type { MpmParseError } from '../parseError.js';
import {
  ARTICULATION_MAP,
  ASYNCHRONY_MAP,
  DYNAMICS_MAP,
  IMPRECISION_MAP,
  IMPRECISION_MAP_DYNAMICS,
  IMPRECISION_MAP_TIMING,
  IMPRECISION_MAP_TONEDURATION,
  IMPRECISION_MAP_TUNING,
  METRICAL_ACCENTUATION_MAP,
  MOVEMENT_MAP,
  ORNAMENTATION_MAP,
  RUBATO_MAP,
  TEMPO_MAP,
} from '../../names.js';
import { GenericMap } from './GenericMap.js';
import { ArticulationMap } from './ArticulationMap.js';
import { AsynchronyMap } from './AsynchronyMap.js';
import { DynamicsMap } from './DynamicsMap.js';
import { ImprecisionMap } from './ImprecisionMap.js';
import { MetricalAccentuationMap } from './MetricalAccentuationMap.js';
import { MovementMap } from './MovementMap.js';
import { OrnamentationMap } from './OrnamentationMap.js';
import { RubatoMap } from './RubatoMap.js';
import { TempoMap } from './TempoMap.js';

/**
 * Which class reads which `<dated>` child, as one exhaustive table — and the two functions
 * that are the only way to consult it.
 *
 * ## What this replaced
 *
 * `GenericMap` used to own a `static readonly _factories = new Map<string, …>()`, filled by
 * a `GenericMap.registerMapFactory(localName, factory)` statement at the bottom of each of
 * the nine map modules and read by `GenericMap.createTypedMap(type, xml)`. That is Java's
 * service-loader pattern, and it cost three things:
 *
 * 1. **A global mutable singleton.** Thirteen writes into one shared map, at module
 *    evaluation time, in an order nothing pins; a second registration of a name would
 *    silently replace the first, and nothing anywhere would notice.
 * 2. **Registration by import side effect.** Importing a map module is what registered it,
 *    so `package.json` had to carry `"sideEffects": ["./dist/mpm/Mpm.js",
 *    "./dist/mpm/elements/maps/*.js"]` to stop bundlers eliding the bare barrel import that
 *    ran them. **This was not theoretical**: bundling the facade with rollup's
 *    `treeshake.moduleSideEffects: false` — exactly the licence the absent `sideEffects`
 *    field grants — produced a build in which all thirteen map names parsed into a plain
 *    `GenericMap`. The whole vitest suite stays green under that failure, because vitest
 *    does not tree-shake, so no test could ever have caught it. A partial-registration
 *    hazard of the same shape was already live in-tree: `Mei2MsmMpmConverter` value-imports
 *    four of the nine map modules, so a consumer reaching it without going through
 *    `Mpm.ts` got four typed maps and five fallbacks.
 * 3. **An untyped result.** `createTypedMap` returned `GenericMap | null` whatever it was
 *    asked for, so every caller cast: twelve `as …Map | null` in
 *    `Performance.resolveGlobalMaps` alone, twelve more in `resolvePartMaps`.
 *
 * All three are properties of *mutability plus late binding*, and the fix for all three is
 * the same: write the thirteen pairs down once, as data, in a table the compiler can see is
 * total. {@link MAP_SHAPE} is that table. A fourteenth `<dated>` child added to
 * {@link MapOfKind} is a compile error here rather than a silent fallback to a plain
 * `GenericMap` at runtime; the nine imports above are ordinary value imports that the table
 * uses, so no bundler may drop them; and {@link mapOfKind} narrows instead of asserting.
 *
 * ## Why this is not in `GenericMap.ts`
 *
 * Because the nine classes extend `GenericMap`, and a table of them inside `GenericMap.ts`
 * would be a nine-way import cycle — the shape `ARCHITECTURE.md` RULE M4 was written to
 * forbid, and the reason it insisted the registry stay a registry. A separate module has the
 * edges the other way round (`map.ts` → the nine → `GenericMap`) and is acyclic, which
 * `import/no-cycle` checks on every lint run. This is the same move `styles/style.ts` made
 * for the six style subclasses; RULE M4 is superseded accordingly.
 *
 * ## Kind = element local name
 *
 * Unlike `StyleKind`, the vocabulary here needs no invention: the thing being dispatched on
 * *is* the element's local name, it is already the key `Dated` files its maps under, and
 * `mpm/names.ts` already publishes all thirteen as constants. So {@link MapKind} is that set
 * of thirteen strings, and the five `imprecisionMap.*` domains are five kinds sharing one
 * class rather than one kind with a sub-discriminant — which is what `Dated` needs, since it
 * holds four imprecision maps at once and must tell them apart.
 */

/**
 * Every `<dated>` child this port has a class for, and the class it parses into.
 *
 * This interface is the single source of truth for the whole module: {@link MapKind} is its
 * key set, {@link MAP_SHAPE} is declared total over that key set, and {@link MAP_KINDS} is
 * read back off the table. Adding a row therefore forces a parser and a class test to be
 * written, and gets the new kind into the round-trip test for free.
 */
export interface MapOfKind {
  readonly articulationMap: ArticulationMap;
  readonly asynchronyMap: AsynchronyMap;
  readonly dynamicsMap: DynamicsMap;
  readonly imprecisionMap: ImprecisionMap;
  readonly 'imprecisionMap.timing': ImprecisionMap;
  readonly 'imprecisionMap.dynamics': ImprecisionMap;
  readonly 'imprecisionMap.toneduration': ImprecisionMap;
  readonly 'imprecisionMap.tuning': ImprecisionMap;
  readonly metricalAccentuationMap: MetricalAccentuationMap;
  readonly movementMap: MovementMap;
  readonly ornamentationMap: OrnamentationMap;
  readonly rubatoMap: RubatoMap;
  readonly tempoMap: TempoMap;
}

/** The thirteen typed map names — the local name of a `<dated>` child this port knows. */
export type MapKind = keyof MapOfKind;

/** How one kind of `<dated>` child is read, and how one is recognised once read. */
interface MapShape<K extends MapKind> {
  /** Read the element as this kind of map, or say why it could not be read. */
  readonly parse: (xml: Element) => Result<MapOfKind[K], MpmParseError>;
  /**
   * Whether an already-parsed map is one of these.
   *
   * The checked half of {@link mapOfKind}, and the reason it can replace a cast. Spelled as
   * a per-row predicate rather than derived from a constructor reference in the row because
   * all nine classes have private constructors, which is exactly what a `new (…) => T`-typed
   * field may not hold.
   */
  readonly is: (map: GenericMap) => map is MapOfKind[K];
}

/**
 * The dispatch table that replaced the thirteen `registerMapFactory` statements.
 *
 * Typed as a total mapped type over {@link MapKind}, so a fourteenth kind added to
 * {@link MapOfKind} fails to compile here — the same guarantee `styles/style.ts` gives the
 * style kinds and `maps/data/distribution.ts` gives the distribution families.
 *
 * The keys are the `names.ts` constants rather than string literals, so the table and the
 * vocabulary cannot drift; they are literal-typed `const`s, which is what lets them stand as
 * computed keys of a mapped type. The five `imprecisionMap.*` rows are deliberately five
 * identical rows and not a loop: a loop would have to widen the key type back to `string`,
 * which is the totality this table exists to state.
 */
const MAP_SHAPE: { readonly [K in MapKind]: MapShape<K> } = {
  [ARTICULATION_MAP]: {
    parse: (xml) => ArticulationMap.createArticulationMap(xml),
    is: (map): map is ArticulationMap => map instanceof ArticulationMap,
  },
  [ASYNCHRONY_MAP]: {
    parse: (xml) => AsynchronyMap.createAsynchronyMap(xml),
    is: (map): map is AsynchronyMap => map instanceof AsynchronyMap,
  },
  [DYNAMICS_MAP]: {
    parse: (xml) => DynamicsMap.createDynamicsMap(xml),
    is: (map): map is DynamicsMap => map instanceof DynamicsMap,
  },
  [IMPRECISION_MAP]: {
    parse: (xml) => ImprecisionMap.createImprecisionMap(xml),
    is: (map): map is ImprecisionMap => map instanceof ImprecisionMap,
  },
  [IMPRECISION_MAP_TIMING]: {
    parse: (xml) => ImprecisionMap.createImprecisionMap(xml),
    is: (map): map is ImprecisionMap => map instanceof ImprecisionMap,
  },
  [IMPRECISION_MAP_DYNAMICS]: {
    parse: (xml) => ImprecisionMap.createImprecisionMap(xml),
    is: (map): map is ImprecisionMap => map instanceof ImprecisionMap,
  },
  [IMPRECISION_MAP_TONEDURATION]: {
    parse: (xml) => ImprecisionMap.createImprecisionMap(xml),
    is: (map): map is ImprecisionMap => map instanceof ImprecisionMap,
  },
  [IMPRECISION_MAP_TUNING]: {
    parse: (xml) => ImprecisionMap.createImprecisionMap(xml),
    is: (map): map is ImprecisionMap => map instanceof ImprecisionMap,
  },
  [METRICAL_ACCENTUATION_MAP]: {
    parse: (xml) => MetricalAccentuationMap.createMetricalAccentuationMap(xml),
    is: (map): map is MetricalAccentuationMap => map instanceof MetricalAccentuationMap,
  },
  [MOVEMENT_MAP]: {
    parse: (xml) => MovementMap.createMovementMap(xml),
    is: (map): map is MovementMap => map instanceof MovementMap,
  },
  [ORNAMENTATION_MAP]: {
    parse: (xml) => OrnamentationMap.createOrnamentationMap(xml),
    is: (map): map is OrnamentationMap => map instanceof OrnamentationMap,
  },
  [RUBATO_MAP]: {
    parse: (xml) => RubatoMap.createRubatoMap(xml),
    is: (map): map is RubatoMap => map instanceof RubatoMap,
  },
  [TEMPO_MAP]: {
    parse: (xml) => TempoMap.createTempoMap(xml),
    is: (map): map is TempoMap => map instanceof TempoMap,
  },
};

/**
 * The thirteen kinds as a value, for callers that need to enumerate them — the tests, above
 * all, which walk this list so that a fourteenth row is covered the moment it is added.
 *
 * Read off {@link MAP_SHAPE} rather than written out a second time. The cast is the theorem
 * `prelude/record.ts` states in the same words: `Object.keys` is typed `string[]` whatever
 * it is given, and the object it is applied to is declared total over {@link MapKind}
 * exactly, so every key it yields is one.
 */
export const MAP_KINDS: readonly MapKind[] = Object.keys(MAP_SHAPE) as MapKind[];

/** Whether a `<dated>` child's local name is one this port has a class for. */
export function isMapKind(localName: string): localName is MapKind {
  return Object.hasOwn(MAP_SHAPE, localName);
}

/**
 * Read one `<dated>` child into the map class its local name calls for, falling back to a
 * plain {@link GenericMap} for a name this port does not know.
 *
 * The fallback is not laxity: MPM is extensible, `Dated` discovers maps by name shape
 * (anything containing `Map`, plus `score`), and a vendor-specific `<xyzMap>` has to survive
 * a parse/serialize round trip. What it loses is only the typed accessors, which nothing
 * could have called for a name it does not know.
 *
 * Takes the element alone where `createTypedMap` took `(type, xml)`. The two arguments were
 * always the same fact — both call sites passed either `xml.getLocalName()` or the name the
 * element had just been built from — and a pair that must agree is a pair that can disagree.
 */
export function parseTypedMap(xml: Element): Result<GenericMap, MpmParseError> {
  const localName = xml.getLocalName();
  return isMapKind(localName) ? MAP_SHAPE[localName].parse(xml) : GenericMap.createGenericMap(xml);
}

/**
 * Narrow a kind-erased map to one kind, or null if it is not that kind.
 *
 * The checked replacement for the `as TempoMap | null` casts that `Dated.getMap`'s
 * `GenericMap | null` return forced on every reader — twenty-four of them in
 * `Performance` alone. Those casts were unverified in a way that mattered: `Dated.addMap`
 * accepts any `GenericMap` and files it under `map.getType()`, so a plain `GenericMap`
 * built from a `<tempoMap>` element — which is exactly what the tree-shaken bundle above
 * produced — sits under the key `tempoMap` and answers `getTempoDataOf` with
 * `undefined is not a function`. This returns null for it instead.
 *
 * For the five `imprecisionMap.*` kinds the class test cannot tell the domains apart, and
 * does not have to: the caller reached this through the `Dated` key, which is the domain.
 */
export function mapOfKind<K extends MapKind>(map: GenericMap | null, kind: K): MapOfKind[K] | null {
  return map !== null && MAP_SHAPE[kind].is(map) ? map : null;
}
