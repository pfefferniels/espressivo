/**
 * Side-effect barrel: importing this module registers every typed-map factory.
 *
 * `GenericMap.createTypedMap` dispatches on an element's local name through a registry
 * that each map module populates with a `GenericMap.registerMapFactory(...)` call at the
 * bottom of its own file (ARCHITECTURE.md RULE M4). A map class is therefore only
 * reachable by name once its module has been evaluated, which is what makes these nine
 * imports load-bearing rather than decorative — `Dated.addMapFromXml` silently falls back
 * to a plain `GenericMap` for anything unregistered.
 *
 * There is nothing to export here and nothing to call. The one job is the import list,
 * and it replaces the nine side-effect imports `Mpm.ts` used to carry. The order below is
 * `Mpm.ts`'s original order, kept so module evaluation order is unchanged; it is not
 * otherwise significant, since the thirteen registered names are all distinct and nothing
 * reads the registry at load time.
 *
 * Do not turn the registry into a `switch`: that would give `GenericMap` a static
 * dependency on all nine subclasses, which is the cycle T18 removed, in a new shape.
 */

import './DynamicsMap.js';
import './TempoMap.js';
import './RubatoMap.js';
import './AsynchronyMap.js';
import './ArticulationMap.js';
import './ImprecisionMap.js';
import './MetricalAccentuationMap.js';
import './OrnamentationMap.js';
import './MovementMap.js';
