import { describe, it, expect } from 'vitest';
import { okValue } from '../support/result.js';
import { Msm } from '../../src/msm/Msm.js';
import { Performance } from '../../src/mpm/elements/Performance.js';
import { Part } from '../../src/mpm/elements/Part.js';
import { ImprecisionMap } from '../../src/mpm/elements/maps/ImprecisionMap.js';
import { MovementMap } from '../../src/mpm/elements/maps/MovementMap.js';
import { TempoMap } from '../../src/mpm/elements/maps/TempoMap.js';
import { GenericMap } from '../../src/mpm/elements/maps/GenericMap.js';
import { Element, Attribute } from '../../src/xml/XomTypes.js';
import {
  DEFAULT_MOVEMENT_SAMPLE_MAX_STEP,
  deriveSeed,
  type RenderContext,
  type RenderOptions,
} from '../../src/mpm/RenderOptions.js';
import type { Normalized } from '../../src/units.js';

const XML_NS = 'http://www.w3.org/XML/1998/namespace';

/**
 * An MSM with one part and eight notes for imprecision to move around.
 *
 * The half-length durations are load-bearing. A seeded render is only reproducible while no
 * two offsets share a `milliseconds.date`: where two do, `ImprecisionMap.shakeTimingOffsets`
 * picks the one that keeps its value with a bare `Math.random()` and re-rolls the rest
 * through an unseeded `RandomNumberProvider` — inherited from the reference
 * (`ImprecisionMap.java:845,894`) and unaffected by any seed. With `duration = ppq` every
 * note's end lands exactly on the next note's start and the seed stops determining the
 * output; at half that, every date is distinct.
 */
function makeMsm(ppq = 720): Msm {
  const msm = Msm.createMsm('Options Test', 'msm-id', ppq);
  const part = Msm.makePart('Piano', 1, 0, 0);
  const score = part.getFirstChildElement('dated')!.getFirstChildElement('score')!;
  for (let i = 0; i < 8; ++i) {
    const n = new Element('note');
    n.addAttribute(new Attribute('xml:id', XML_NS, `n${i + 1}`));
    n.addAttribute(new Attribute('date', String(i * ppq)));
    n.addAttribute(new Attribute('duration', String(ppq / 2)));
    n.addAttribute(new Attribute('midi.pitch', String(60 + i)));
    score.appendChild(n);
  }
  msm.addPart(part);
  return msm;
}

/**
 * A performance whose global timing imprecision perturbs every note. `mpmSeed` writes a
 * `seed` attribute into the MPM itself, which RULE F7 says must beat `options.seed`.
 */
function makePerformance(mpmSeed?: number): Performance {
  const perf = okValue(Performance.fromName('perf', 720));
  const tempoMap = TempoMap.createTempoMap();
  tempoMap.addConstantTempo(0, '120', 0.25);
  perf.getGlobal()!.getDated()!.addMap(tempoMap);

  const imp = ImprecisionMap.createImprecisionMap('timing');
  imp.addDistributionUniform(0, -30, 30, mpmSeed);
  perf.getGlobal()!.getDated()!.addMap(imp);

  perf.addPart(okValue(Part.fromValues('Piano', 1, 0, 0)));
  return perf;
}

/** A performance that renders a `positionMap`, for the sampling-step half of the item. */
function makeMovementPerformance(): Performance {
  const perf = okValue(Performance.fromName('perf', 720));
  const tempoMap = TempoMap.createTempoMap();
  tempoMap.addConstantTempo(0, '120', 0.25);
  perf.getGlobal()!.getDated()!.addMap(tempoMap);

  const movMap = MovementMap.createMovementMap();
  movMap.addMovement({ date: 0, position: 0.0 as Normalized, transitionTo: 1.0 as Normalized });
  // The last entry of a movementMap is never rendered; it marks where the transition aims.
  movMap.addMovement({
    date: 5760,
    position: 1.0 as Normalized,
    transitionTo: 1.0 as Normalized,
  });
  perf.getGlobal()!.getDated()!.addMap(movMap);

  perf.addPart(okValue(Part.fromValues('Piano', 1, 0, 0)));
  return perf;
}

/** Rendered MIDI as bytes, through the full four-hop chain of ARCHITECTURE.md §2.4. */
function midiBytes(options?: RenderOptions): string {
  const midi = makeMsm().exportExpressiveMidi(makePerformance(), true, options)!;
  return Buffer.from(midi.exportMidi()).toString('hex');
}

/** How many `<position>` events the performance sampled into the augmented MSM. */
function positionEventCount(options?: RenderOptions): number {
  const augmented = makeMovementPerformance().perform(makeMsm(), options);
  const parts = augmented.getRootElement()!.getChildElements('part');
  let n = 0;
  for (let p = 0; p < parts.size(); ++p) {
    const posMap = parts.get(p).getFirstChildElement('dated')!.getFirstChildElement('positionMap');
    if (posMap !== null) n += posMap.getChildElements('position').size();
  }
  return n;
}

describe('RenderOptions', () => {
  // The normative sub-seed derivation of ARCHITECTURE.md §2.4.
  describe('deriveSeed', () => {
    it('is deterministic', () => {
      expect(deriveSeed(12345, 0, 0)).toBe(deriveSeed(12345, 0, 0));
      expect(deriveSeed(12345, 3, 7)).toBe(deriveSeed(12345, 3, 7));
    });

    it('folds the parts in argument order, so the order is part of the contract', () => {
      expect(deriveSeed(12345, 1, 2)).not.toBe(deriveSeed(12345, 2, 1));
    });

    it('separates both the stream ordinal and the distribution index', () => {
      const seeds = new Set<number>();
      for (let ordinal = 0; ordinal < 4; ++ordinal)
        for (let impIndex = 0; impIndex < 4; ++impIndex)
          seeds.add(deriveSeed(99, ordinal, impIndex));
      expect(seeds.size).toBe(16);
    });

    it('returns the base itself, unsigned, when there are no parts', () => {
      expect(deriveSeed(5)).toBe(5);
      expect(deriveSeed(-1)).toBe(4294967295);
    });

    it('never returns 0, because Mulberry32 must not be seeded 0', () => {
      expect(deriveSeed(0)).toBe(1);
      for (let ordinal = 0; ordinal < 200; ++ordinal)
        expect(deriveSeed(0, ordinal, ordinal)).not.toBe(0);
    });

    it('always yields a non-negative 32-bit integer', () => {
      for (let i = 0; i < 100; ++i) {
        const s = deriveSeed(-2147483648 + i * 40000000, i, i * 3);
        expect(Number.isInteger(s)).toBe(true);
        expect(s).toBeGreaterThanOrEqual(0);
        expect(s).toBeLessThanOrEqual(0xffffffff);
      }
    });

    it('matches the derivation §2.4 specifies, recomputed independently', () => {
      // The re-implementation pins the multiplier, the unsigned coercions and the
      // left-to-right fold, any of which could be "simplified" without a test failing.
      const expected = (base: number, parts: number[]) => {
        let h = base >>> 0;
        for (const p of parts) h = Math.imul(h ^ (p >>> 0), 0x27d4eb2d) >>> 0;
        return h || 1;
      };
      for (const [base, parts] of [
        [0, [0, 0]],
        [1, [0, 0]],
        [42, [1, 2]],
        [2 ** 31, [5]],
        [123456789, [3, 1, 4, 1, 5]],
      ] as [number, number[]][]) {
        expect(deriveSeed(base, ...parts)).toBe(expected(base, parts));
      }
    });
  });

  // Seed plumbing: RULE F7, all four hops of §2.4.
  describe('seed', () => {
    it('renders byte-identical MIDI for the same seed', () => {
      expect(midiBytes({ seed: 1234 })).toBe(midiBytes({ seed: 1234 }));
    });

    it('renders different MIDI for a different seed', () => {
      expect(midiBytes({ seed: 1234 })).not.toBe(midiBytes({ seed: 5678 }));
    });

    it('stays nondeterministic without a seed — the default path is untouched', () => {
      expect(midiBytes()).not.toBe(midiBytes());
      expect(midiBytes({})).not.toBe(midiBytes({}));
    });

    it('lets a seed in the MPM win over options.seed (RULE F7)', () => {
      const withMpmSeed = (options: RenderOptions) =>
        Buffer.from(
          makeMsm().exportExpressiveMidi(makePerformance(4242), true, options)!.exportMidi(),
        ).toString('hex');

      // Two different option seeds, one MPM seed: the MPM wins, so all three renders agree.
      expect(withMpmSeed({ seed: 1 })).toBe(withMpmSeed({ seed: 2 }));
      expect(withMpmSeed({ seed: 1 })).toBe(withMpmSeed({}));
    });

    it('advances the stream ordinal per call, so two maps in one render differ', () => {
      const ctx: RenderContext = { options: { seed: 7 }, streamOrdinal: 0 };
      const render = (c: RenderContext) => {
        const map = okValue(GenericMap.createGenericMap('score'));
        for (let i = 0; i < 6; ++i) {
          const n = new Element('note');
          n.addAttribute(new Attribute('date', String(i * 720)));
          n.addAttribute(new Attribute('milliseconds.date', String(i * 500)));
          map.addElement(n);
        }
        const imp = ImprecisionMap.createImprecisionMap('timing');
        imp.addDistributionUniform(0, -30, 30);
        imp.renderImprecisionToMap(map, true, c);
        return map.getXml()!.toXML();
      };

      const first = render(ctx);
      const second = render(ctx);
      expect(ctx.streamOrdinal).toBe(2);
      expect(second).not.toBe(first);

      expect(render({ options: { seed: 7 }, streamOrdinal: 0 })).toBe(first);
    });
  });

  // RULE I5, through all four hops.
  describe('movementSampleMaxStep', () => {
    it('defaults to the historic 0.1 every fixture is generated with', () => {
      expect(DEFAULT_MOVEMENT_SAMPLE_MAX_STEP).toBe(0.1);
      expect(positionEventCount()).toBe(positionEventCount({}));
      expect(positionEventCount()).toBe(positionEventCount({ movementSampleMaxStep: 0.1 }));
    });

    it('changes the sampling density of the rendered positionMap', () => {
      const atDefault = positionEventCount();
      expect(atDefault).toBeGreaterThan(0);
      expect(positionEventCount({ movementSampleMaxStep: 0.5 })).toBeLessThan(atDefault);
      expect(positionEventCount({ movementSampleMaxStep: 0.02 })).toBeGreaterThan(atDefault);
    });

    it('survives the whole chain from Msm.exportExpressiveMidi (hop 1)', () => {
      const msm = makeMsm();
      const bytes = (options?: RenderOptions) =>
        Buffer.from(
          msm.exportExpressiveMidi(makeMovementPerformance(), true, options)!.exportMidi(),
        ).toString('hex');

      expect(bytes()).toBe(bytes({}));
      expect(bytes({ movementSampleMaxStep: 0.5 })).not.toBe(bytes());
    });
  });
});
