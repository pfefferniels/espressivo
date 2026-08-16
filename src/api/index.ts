/**
 * The public facade (ARCHITECTURE.md §2), in one import.
 *
 * ```ts
 * import { convertMeiToMsmMpm, exaggerateMpm, performMsmToData, renderExpressiveMidi } from 'espressivo';
 *
 * const [movement] = convertMeiToMsmMpm(meiText, { sourceName: 'sonata.mei' });
 * const data = performMsmToData(movement);              // plain per-note data
 * const bytes = renderExpressiveMidi(movement);         // Uint8Array, ready to write
 *
 * const wilder = exaggerateMpm(movement.mpm, { factors: { tempo: 1.6, dynamics: 1.4 } });
 * const louder = performMsmToData({ msm: movement.msm, mpm: wilder.mpm });
 * ```
 *
 * Everything here is plain data in and plain data out — see `types.ts` for what that means
 * and why. The class surface (`Mei`, `Msm`, `Mpm`, `Midi`, `Performance`) is unchanged and
 * still exported from `src/index.ts`; this layer is additive.
 */
export * from './comparison.js';
export * from './errors.js';
export * from './expression.js';
export * from './pipeline.js';
export type * from './types.js';
