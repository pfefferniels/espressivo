/**
 * The MPM vocabulary: the namespace URI, the six `styleDef` collection names that live in
 * a `<header>`, and the thirteen map names that live in a `<dated>`.
 *
 * This module imports nothing, and that is its entire reason to exist. The names are what
 * every element module under `elements/` needs from `Mpm`; while they lived on the `Mpm`
 * class, reading one meant importing `Mpm`, and `Mpm` imports the element modules back —
 * the `Mpm` ⇄ `GenericStyle`/maps cycle that made deep-importing an element module throw
 * (ARCHITECTURE.md RULE M3, item T18). Keep this file a leaf: adding any import here
 * re-opens the cycle for all 31 element modules at once.
 *
 * `Mpm` re-exports every name below as a static member of the same name and value, so
 * `Mpm.TEMPO_MAP` and friends stay valid for callers outside `src/mpm/`.
 *
 * Values are Java's, from `meico.mpm.Mpm`'s static fields.
 */

export const MPM_NAMESPACE = 'http://www.cemfi.de/mpm/ns/1.0';

// type constants of style definitions in the header environment
export const ARTICULATION_STYLE = 'articulationStyles';
export const ORNAMENTATION_STYLE = 'ornamentationStyles';
export const DYNAMICS_STYLE = 'dynamicsStyles';
export const METRICAL_ACCENTUATION_STYLE = 'metricalAccentuationStyles';
export const TEMPO_STYLE = 'tempoStyles';
export const RUBATO_STYLE = 'rubatoStyles';

// map type constants that occur in the dated environment
export const ARTICULATION_MAP = 'articulationMap';
export const ORNAMENTATION_MAP = 'ornamentationMap';
export const DYNAMICS_MAP = 'dynamicsMap';
export const MOVEMENT_MAP = 'movementMap';
export const METRICAL_ACCENTUATION_MAP = 'metricalAccentuationMap';
export const TEMPO_MAP = 'tempoMap';
export const RUBATO_MAP = 'rubatoMap';
export const ASYNCHRONY_MAP = 'asynchronyMap';
export const IMPRECISION_MAP = 'imprecisionMap';
export const IMPRECISION_MAP_TIMING = 'imprecisionMap.timing';
export const IMPRECISION_MAP_DYNAMICS = 'imprecisionMap.dynamics';
export const IMPRECISION_MAP_TONEDURATION = 'imprecisionMap.toneduration';
export const IMPRECISION_MAP_TUNING = 'imprecisionMap.tuning';
