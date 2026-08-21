/**
 * The render knobs, exercised through the facade: the imprecision seed (RULE F7, the downstream
 * consumer's request (b) in docs/history/refactor/state.json) and the movement sampling step
 * (RULE I5).
 *
 * The class-level tests prove the plumbing through the four hops of §2.4. What is proved here
 * is that `PerformOptions` reaches it: the facade is the layer the consumer calls, and a knob
 * that is validated and then dropped passes every one of those tests.
 */
import { describe, it, expect } from 'vitest';
import { okValue } from '../support/result.js';
import { Element, Attribute } from '../../src/xml/XomTypes.js';
import { Msm } from '../../src/msm/Msm.js';
import { Mpm } from '../../src/mpm/Mpm.js';
import { Part } from '../../src/mpm/elements/Part.js';
import { Performance } from '../../src/mpm/elements/Performance.js';
import { GenericMap } from '../../src/mpm/elements/maps/GenericMap.js';
import { ImprecisionMap } from '../../src/mpm/elements/maps/ImprecisionMap.js';
import { MovementMap } from '../../src/mpm/elements/maps/MovementMap.js';
import { TempoMap } from '../../src/mpm/elements/maps/TempoMap.js';
import type { Normalized } from '../../src/units.js';
import { performMsm, renderExpressiveMidi } from '../../src/api/index.js';

const XML_NS = 'http://www.w3.org/XML/1998/namespace';
const PPQ = 720;

/**
 * Eight notes, as MSM text.
 *
 * The half-length durations are load-bearing; do not tidy them to `ppq`. A seeded render is
 * reproducible only while no two imprecision offsets share a `milliseconds.date`:
 * where two do, the interior picks the survivor with a bare `Math.random()` and re-rolls the
 * rest unseeded, faithfully from `ImprecisionMap.java:845,894`. At `duration = ppq` every
 * note's end lands on the next note's start and the seed stops deciding the output.
 * `tests/mpm/RenderOptions.test.ts` carries the same fixture and the same warning.
 */
function msmText(): string {
  const msm = Msm.createMsm('Facade Options Test', 'msm-id', PPQ);
  const part = Msm.makePart('Piano', 1, 0, 0);
  const score = part.getFirstChildElement('dated')!.getFirstChildElement('score')!;
  for (let i = 0; i < 8; ++i) {
    const note = new Element('note');
    note.addAttribute(new Attribute('xml:id', XML_NS, `n${i + 1}`));
    note.addAttribute(new Attribute('date', String(i * PPQ)));
    note.addAttribute(new Attribute('duration', String(PPQ / 2)));
    note.addAttribute(new Attribute('midi.pitch', String(60 + i)));
    score.appendChild(note);
  }
  msm.addPart(part);
  return msm.getRootElement()!.toXML();
}

function mpmTextOf(...maps: GenericMap[]): string {
  const performance = okValue(Performance.fromName('facade test', PPQ));
  const tempoMap = TempoMap.createTempoMap()!;
  tempoMap.addConstantTempo(0, '120', 0.25);
  performance.getGlobal()!.getDated()!.addMap(tempoMap);
  for (const map of maps) performance.getGlobal()!.getDated()!.addMap(map);
  performance.addPart(okValue(Part.fromValues('Piano', 1, 0, 0)));

  const mpm = Mpm.createMpm();
  mpm.addPerformance(performance);
  return mpm.getRootElement()!.toXML();
}

/** A global timing imprecision that perturbs every note. `mpmSeed` writes MPM's own `seed`. */
function imprecisionMpm(mpmSeed?: number): string {
  const map = ImprecisionMap.createImprecisionMap('timing')!;
  map.addDistributionUniform(0, -30, 30, mpmSeed);
  return mpmTextOf(map);
}

/** A movement ramp, whose sampling density `movementSampleMaxStep` controls. */
function movementMpm(): string {
  const map = MovementMap.createMovementMap()!;
  map.addMovement({ date: 0, position: 0.0 as Normalized, transitionTo: 1.0 as Normalized });
  // The last entry of a movementMap is never rendered; it marks where the transition aims.
  map.addMovement({
    date: 5760,
    position: 1.0 as Normalized,
    transitionTo: 1.0 as Normalized,
  });
  return mpmTextOf(map);
}

const hex = (bytes: Uint8Array) => Buffer.from(bytes).toString('hex');

describe('facade: imprecision seed (RULE F7)', () => {
  const input = { msm: msmText(), mpm: imprecisionMpm() };
  const render = (seed?: number) =>
    hex(renderExpressiveMidi(input, seed === undefined ? undefined : { seed }));

  it('renders byte-identical MIDI for the same seed', () => {
    expect(render(1234)).toBe(render(1234));
  });

  it('renders different MIDI for a different seed', () => {
    expect(render(1234)).not.toBe(render(5678));
  });

  it('stays nondeterministic without a seed — the default path is untouched', () => {
    // The third leg of §2.4's gate (c), and the one a sabotaged derivation turns red: if the
    // seed derivation applied when no seed was given, these two would become identical.
    expect(render()).not.toBe(render());
  });

  it('lets a seed in the MPM win over options.seed', () => {
    const seeded = { msm: input.msm, mpm: imprecisionMpm(4242) };
    const withOption = (seed: number) => hex(renderExpressiveMidi(seeded, { seed }));

    expect(withOption(1)).toBe(withOption(2));
    expect(withOption(1)).toBe(hex(renderExpressiveMidi(seeded)));
  });

  it('reaches the augmented MSM as well as the MIDI', () => {
    expect(performMsm(input, { seed: 99 })).toBe(performMsm(input, { seed: 99 }));
    expect(performMsm(input, { seed: 99 })).not.toBe(performMsm(input, { seed: 100 }));
  });
});

describe('facade: movementSampleMaxStep (RULE I5)', () => {
  const input = { msm: msmText(), mpm: movementMpm() };
  const positionCount = (movementSampleMaxStep?: number) =>
    [
      ...performMsm(
        input,
        movementSampleMaxStep === undefined ? undefined : { movementSampleMaxStep },
      ).matchAll(/<position\s/g),
    ].length;

  it('defaults to the historic 0.1 that every reference fixture is generated with', () => {
    expect(positionCount()).toBe(positionCount(0.1));
    expect(positionCount()).toBeGreaterThan(0);
  });

  it('changes the sampling density of the rendered positionMap', () => {
    const atDefault = positionCount();
    expect(positionCount(0.5)).toBeLessThan(atDefault);
    expect(positionCount(0.02)).toBeGreaterThan(atDefault);
  });

  it('reaches the MIDI bytes too', () => {
    expect(hex(renderExpressiveMidi(input, { movementSampleMaxStep: 0.5 }))).not.toBe(
      hex(renderExpressiveMidi(input)),
    );
  });
});
