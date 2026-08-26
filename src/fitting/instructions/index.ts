/**
 * mpmify's MPM layer: espressivo's document, and the routing that puts a {@link Scope} and an
 * instruction type in front of it.
 *
 * There is no document class here and no record model. A transformer is handed espressivo's own
 * `Mpm` and writes through espressivo's own maps; what this module adds is functions — a scope
 * resolved to a map, a map read back as a list, the two sweeps that say what a transformer just
 * did, and the one merge contract two pairs of transformers share.
 */
export * from './types.js';
export * from './scope.js';
export * from './read.js';
export * from './styles.js';
export * from './ornamentDraft.js';
export * from './fillInAt.js';

/**
 * The espressivo classes a transformer builds a definition with, re-exported so that writing an
 * `<articulationDef>` does not mean importing from two packages at once.
 */
export { Mpm } from '../../mpm/Mpm.js';
export { AccentuationPatternDef } from '../../mpm/elements/styles/defs/AccentuationPatternDef.js';
export { ArticulationDef } from '../../mpm/elements/styles/defs/ArticulationDef.js';
export { OrnamentDef } from '../../mpm/elements/styles/defs/OrnamentDef.js';
export { FrameDomain, NoteOffShift } from '../../mpm/elements/styles/defs/TemporalSpread.js';
