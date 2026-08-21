import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { Msm } from '../../src/msm/Msm.js';
import { Mpm } from '../../src/mpm/Mpm.js';

/**
 * `@subNoteDynamics`, against Java — a branch no other fixture in the corpus reaches.
 *
 * Every other `<volume>` entry in the repository carries `mandatory="true"`, so only the
 * non-sub-note branch of `DynamicsMap` is taken; every other `channelVolumeMap` has exactly
 * one entry, at date 0, leaving the branch that emits a continuous ramp unexercised. The MSM
 * model study listed this among the surfaces the byte gate cannot protect.
 *
 * The fixtures come in a pair that differs in one boolean, because one of them would prove
 * nothing: a suite holding only the `on` case cannot tell a regression from the `off`
 * behaviour. See `fixtures-subnote-dynamics/PROVENANCE.md` for how they were generated and the
 * table of what differs.
 *
 * One normaliser, the one `cross-validation.test.ts` keeps: Java's `Double.toString` writes
 * `40.0` where `String(number)` writes `40` (PARITY.md). Nothing else is forgiven.
 */
const FIX = join(dirname(fileURLToPath(import.meta.url)), 'fixtures-subnote-dynamics');
const read = (name: string): string => readFileSync(join(FIX, name), 'utf-8');
const normalize = (xml: string): string => xml.replace(/="(-?\d+)\.0"/g, '="$1"');

function perform(base: string): string {
  const msm = new Msm(read(`${base}.msm`));
  const mpm = new Mpm(read(`${base}.mpm`));
  return mpm.getAllPerformances()[0]!.perform(msm).toXML();
}

const volumes = (xml: string): string[] => [...xml.matchAll(/<volume [^>]*>/g)].map((m) => m[0]);
const velocities = (xml: string): number[] =>
  [...xml.matchAll(/velocity="([0-9.eE+-]*)"/g)].map((m) => Number(m[1]));

describe('@subNoteDynamics against the Java reference', () => {
  for (const base of ['subnote_dynamics_on', 'subnote_dynamics_off'] as const) {
    it(`${base}: perform() matches Java byte for byte`, () => {
      expect(normalize(perform(base))).toBe(normalize(read(`${base}_augmented.msm`)));
    });
  }

  it('on: emits a continuous channelVolume ramp', () => {
    // Stated as an invariant rather than left to the byte comparison, which would also pass
    // against a reference that had the single entry every other channelVolumeMap has.
    const xml = perform('subnote_dynamics_on');
    expect(volumes(xml).length).toBeGreaterThan(50);

    // Genuinely continuous: the values move, and the dates are not on note boundaries.
    const values = volumes(xml).map((v) => Number(/value="([0-9.]*)"/.exec(v)?.[1]));
    expect(values[0]).toBeLessThan(values[10]!);
    expect(volumes(xml).some((v) => /date="\d+\.\d+"/.test(v))).toBe(true);
  });

  it('the boolean decides whether the transition reaches note velocities', () => {
    // The first instruction ramps 40 -> 120 across the first four notes:
    //
    //   off  [40, 59.98…, 80, 100.02…, 120, 120, 120, 120]   five distinct
    //   on   [100, 100, 100, 100,      120, 120, 120, 120]   two
    //
    // With the flag off the transition is sampled once per note; with it on the velocities
    // take only the instructions' own values and the shape goes to the volume map instead.
    // The second four are 120 in both, so they are not the effect under test: the second
    // instruction's transition does not reach the velocities either way.
    const off = velocities(perform('subnote_dynamics_off'));
    const on = velocities(perform('subnote_dynamics_on'));

    expect(off.slice(0, 4)).toEqual([40, 59.98101353645325, 80, 100.01898646354675]);
    expect(on.slice(0, 4)).toEqual([100, 100, 100, 100]);
    expect(new Set(off).size).toBe(5);
    expect(new Set(on).size).toBe(2);
  });

  it('off: the volume map keeps its single default entry', () => {
    expect(volumes(perform('subnote_dynamics_off'))).toHaveLength(1);
  });
});
