/**
 * The public facade (ARCHITECTURE.md §2), in one import.
 *
 * ```ts
 * import { convertMeiToMsm, exaggerateMpm, performMsmToData, renderExpressiveMidi } from 'espressivo';
 *
 * // Two inputs, both from outside: the score, and the performance to apply to it.
 * const [movement] = convertMeiToMsm(meiText, { sourceName: 'sonata.mei' });
 * const input = { msm: movement.msm, mpm: readFileSync('sonata.mpm', 'utf-8') };
 *
 * const data = performMsmToData(input);                 // plain per-note data
 * const bytes = renderExpressiveMidi(input);            // Uint8Array, ready to write
 *
 * const wilder = exaggerateMpm(input.mpm, { factors: { tempo: 1.6, dynamics: 1.4 } });
 * const louder = performMsmToData({ msm: input.msm, mpm: wilder.mpm });
 * ```
 *
 * Everything here is plain data in and plain data out — see `types.ts` for what that means
 * and why. The class surface (`Mei`, `Msm`, `Mpm`, `Midi`, `Performance`) is exported from
 * `src/index.ts` instead.
 */
export * from './comparison.js';
export * from './errors.js';
export * from './expression.js';
export * from './pipeline.js';
export type * from './types.js';
