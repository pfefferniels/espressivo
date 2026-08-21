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
 * The table lives in its own module because the nine classes extend `GenericMap`: putting it
 * in `GenericMap.ts` would be a nine-way import cycle. The edges run `map.ts` → the nine →
 * `GenericMap` and are acyclic, which `import/no-cycle` checks on every lint run.
 * `ARCHITECTURE.md` RULE M4 required a mutable registry to avoid that cycle and is superseded
 * accordingly, the same move `styles/style.ts` made for the six style subclasses.
 *
 * A kind is an element's local name: it is the key `Dated` files its maps under, and
 * `mpm/names.ts` publishes all thirteen as constants. The five `imprecisionMap.*` domains are
 * five kinds sharing one class rather than one kind with a sub-discriminant, because `Dated`
 * holds four imprecision maps at once and must tell them apart.
 */

/**
 * Every `<dated>` child this port has a class for, and the class it parses into.
 *
 * The source of truth for the whole module: {@link MapKind} is its key set, {@link MAP_SHAPE}
 * is declared total over that key set, and {@link MAP_KINDS} is read back off the table.
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
   * Whether an already-parsed map is one of these — the checked half of {@link mapOfKind}.
   *
   * A per-row predicate rather than a constructor reference the row could test against,
   * because all nine classes have private constructors, which is what a `new (…) => T`-typed
   * field may not hold.
   */
  readonly is: (map: GenericMap) => map is MapOfKind[K];
}

/**
 * The dispatch table, typed as a total mapped type over {@link MapKind}: a fourteenth kind
 * added to {@link MapOfKind} fails to compile here — the same guarantee `styles/style.ts`
 * gives the style kinds and `maps/data/distribution.ts` the distribution families.
 *
 * The keys are the `names.ts` constants rather than string literals, so the table and the
 * vocabulary cannot drift; they are literal-typed `const`s, which is what lets them stand as
 * computed keys of a mapped type. The five `imprecisionMap.*` rows are five identical rows
 * and not a loop: a loop would have to widen the key type back to `string`, which is the
 * totality this table exists to state.
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
 * The cast is the theorem `prelude/record.ts` states in the same words: `Object.keys` is typed
 * `string[]` whatever it is given, and the object it is applied to is declared total over
 * {@link MapKind} exactly, so every key it yields is one.
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
 */
export function parseTypedMap(xml: Element): Result<GenericMap, MpmParseError> {
  const localName = xml.getLocalName();
  return isMapKind(localName) ? MAP_SHAPE[localName].parse(xml) : GenericMap.createGenericMap(xml);
}

/**
 * Narrow a kind-erased map to one kind, or null if it is not that kind.
 *
 * The checked alternative to an `as TempoMap | null` cast on `Dated.getMap`'s
 * `GenericMap | null` return. Such a cast is unverified in a way that matters: `Dated.addMap`
 * accepts any `GenericMap` and files it under `map.getType()`, so a plain `GenericMap` built
 * from a `<tempoMap>` element sits under the key `tempoMap` and answers `getTempoDataOf` with
 * `undefined is not a function`. This returns null for it instead.
 *
 * For the five `imprecisionMap.*` kinds the class test cannot tell the domains apart, and
 * does not have to: the caller reached this through the `Dated` key, which is the domain.
 */
export function mapOfKind<K extends MapKind>(map: GenericMap | null, kind: K): MapOfKind[K] | null {
  return map !== null && MAP_SHAPE[kind].is(map) ? map : null;
}
