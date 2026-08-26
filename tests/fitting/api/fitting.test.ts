/**
 * The fitting facade — the surface, at the boundary a consumer sees.
 *
 * What is tested here and nowhere else: that a chain and an alignment cross as plain data and
 * come back as an MPM (RULE F1/F2), the typed errors, and the two questions a caller can ask
 * without running anything — what fitters exist, and whether a chain is well-ordered.
 *
 * How well the chain *fits* is `tests/fitting/roundtrip/aligned.test.ts`'s, against the
 * interior. Re-measuring it here would pin the same computation twice.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  EmptyDocumentError,
  InvalidOptionError,
  ParseError,
  fitMpm,
  listFitters,
  validateChain,
  type FitCall,
  type FitNoteSource,
  type FitPedal,
  type FitResult,
} from '../../../src/api/index.js';
import * as barrel from '../../../src/index.js';
import { at } from '../../support/at.js';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'roundtrip');
const fixture = (name: string) => readFileSync(join(FIXTURES, name), 'utf-8');

const MSM = fixture('alignment.msm');

/**
 * The committed triple, read the way a consumer would: three files, no interior types.
 *
 * `JSON.parse` answers `any`, which lands in the declared type without an assertion — and the
 * facade validates every field of what arrives anyway, which is the thing being tested.
 */
const chainOf = (text: string): FitCall[] => {
  const file: { provenance?: FitCall[] } = JSON.parse(text);
  return file.provenance ?? [];
};
const CHAIN = chainOf(fixture('chain.json'));
const PEDALS: FitPedal[] = JSON.parse(fixture('alignment.pedals.json'));
const SOURCES: FitNoteSource[] = JSON.parse(fixture('alignment.sources.json'));

const input = () => ({ msm: MSM, chain: CHAIN, pedals: PEDALS, sources: SOURCES });

/** The chain that fits the whole excerpt. Run once — it renders, four times over. */
let fitted: FitResult;

beforeAll(() => {
  fitted = fitMpm(input());
}, 120_000);

describe('fitMpm on the committed alignment', () => {
  it('turns the triple and the chain into an MPM', () => {
    expect(fitted.mpm.startsWith('<mpm')).toBe(true);
    expect(fitted.mpm).toContain('<tempoMap');
    expect(fitted.mpm).toContain('<rubatoMap');
    expect(fitted.mpm).toContain('<articulationMap');
    // RULE F2a: the declaration-free form, as every other facade hands back.
    expect(fitted.mpm).not.toContain('<?xml');
  });

  it('reports every call of the chain, and nothing else', () => {
    expect(fitted.skipped).toEqual([]);
    expect(fitted.calls).toHaveLength(CHAIN.length);
    expect(new Set(fitted.calls.map((call) => call.id))).toEqual(
      new Set(CHAIN.map((call) => call.id)),
    );
    // The report is the chain as it RAN, so the ordinals are dense and in reduction order.
    expect(fitted.calls.map((call) => call.ordinal)).toEqual(fitted.calls.map((_, i) => i));
    // One call names the misspelling the registry keeps an alias for; the report answers
    // under the current name, so every name here is one `listFitters` knows.
    expect(CHAIN.map((call) => call.name)).toContain('TranslatePhyiscalTimeToTicks');
    expect(fitted.calls.map((call) => call.name)).not.toContain('TranslatePhyiscalTimeToTicks');
    const order = listFitters().map((fitter) => fitter.name);
    const ranks = fitted.calls.map((call) => order.indexOf(call.name));
    expect([...ranks].sort((a, b) => a - b)).toEqual(ranks);
  });

  it('names the elements each call is answerable for', () => {
    const wrote = fitted.calls.filter((call) => call.elements.length > 0);
    expect(wrote.length).toBeGreaterThan(50);
    for (const call of wrote) for (const id of call.elements) expect(fitted.mpm).toContain(id);
  });

  it('places every pedal call on the score grid', () => {
    // The one kind of call whose range is not in its own options: it is derived from the MPM
    // the chain wrote, so a null here would mean the residual was never taken.
    const pedals = fitted.calls.filter((call) => call.name === 'InsertPedal');
    expect(pedals).toHaveLength(12);
    // Ten of the twelve. The other two name `soft-0`, a pedal the excerpt does not carry, so
    // there is nothing to place them against and `null` is the honest answer.
    expect(pedals.filter((call) => call.range !== null)).toHaveLength(10);
  });

  it("substitutes the metadata call and still reports it under the caller's id", () => {
    const declared = CHAIN.filter((call) => call.name === 'InsertMetadata');
    expect(declared).toHaveLength(1);
    // `runChain` drops the imported InsertMetadata and builds a fresh one, so this entry is
    // the only one in the report whose transformer is not the instance the facade built.
    const reported = fitted.calls.filter((call) => call.name === 'InsertMetadata');
    expect(reported.map((call) => call.id)).toEqual([at(declared, 0, 'metadata call').id]);
    expect(fitted.mpm).toContain('<metadata');
  });

  it('leaves the input untouched', () => {
    expect(MSM).toBe(fixture('alignment.msm'));
    expect(CHAIN).toEqual(chainOf(fixture('chain.json')));
  });
});

describe('RULE F1 — what crosses the boundary is plain data', () => {
  it('survives the JSON round trip unchanged', () => {
    const json: FitResult = JSON.parse(JSON.stringify(fitted));
    expect(json).toEqual(fitted);
  });

  it('survives structuredClone unchanged', () => {
    expect(structuredClone(fitted)).toEqual(fitted);
  });

  it('holds no `undefined` anywhere (RULE N4)', () => {
    expect(holes(fitted)).toEqual([]);
  });

  it('holds no class instance, Map or Set anywhere', () => {
    expect(foreign(fitted)).toEqual([]);
  });
});

describe('the alignment the facade will accept', () => {
  it('refuses a score: an MSM with no milliseconds.date is not an alignment', () => {
    const score = MSM.replace(/ milliseconds\.date(\.end)?="[^"]*"/g, '');
    expect(() => fitMpm({ msm: score, chain: CHAIN, sources: SOURCES })).toThrow(
      EmptyDocumentError,
    );
    expect(() => fitMpm({ msm: score, chain: CHAIN, sources: SOURCES })).toThrow(
      /milliseconds\.date/,
    );
  });

  it('refuses text that is not an MSM', () => {
    expect(() => fitMpm({ msm: '<mpm/>', chain: [] })).toThrow(ParseError);
    expect(() => fitMpm({ msm: 'not xml', chain: [] })).toThrow(ParseError);
  });

  it('refuses sources that are not one per <note>', () => {
    expect(() => fitMpm({ msm: MSM, chain: [], sources: SOURCES.slice(1) })).toThrow(
      InvalidOptionError,
    );
    // Same count, wrong pairing: the ids are a checksum on the positional match.
    // Index 1 would not do: a note aligned twice is two entries under one id.
    const shuffled = [at(SOURCES, 2, 'source'), ...SOURCES.slice(1)];
    expect(() => fitMpm({ msm: MSM, chain: [], sources: shuffled })).toThrow(/out of step/);
  });
});

describe('a fitter this build does not have', () => {
  const bogus: FitCall = { id: 'nope', name: 'InventASonata', options: {} };
  const metadata: FitCall = {
    id: 'meta',
    name: 'InsertMetadata',
    options: { comments: [{ text: 'a title' }] },
  };

  it('is skipped by default, and reported by id', () => {
    const result = fitMpm({ msm: MSM, chain: [metadata, bogus], sources: SOURCES });
    expect(result.skipped).toEqual(['nope']);
    expect(result.calls.map((call) => call.id)).toEqual(['meta']);
    expect(result.mpm).toContain('a title');
  });

  it('is refused under `strict`, before anything runs', () => {
    expect(() =>
      fitMpm({ msm: MSM, chain: [metadata, bogus], sources: SOURCES }, { strict: true }),
    ).toThrow(InvalidOptionError);
    expect(() => fitMpm({ msm: MSM, chain: [bogus] }, { strict: true })).toThrow(/InventASonata/);
  });

  it('is reported by validateChain without a document at all', () => {
    const problems = validateChain([bogus]);
    expect(problems).toEqual([
      {
        index: 0,
        id: 'nope',
        name: 'InventASonata',
        kind: 'unknown-fitter',
        message: 'InventASonata is not a registered fitter, so it cannot be ordered or run',
      },
    ]);
  });
});

describe('validateChain', () => {
  const pedal: FitCall = {
    id: 'p',
    name: 'InsertPedal',
    options: { pedal: 'sustain-1440', start: 0, duration: 90, direction: 'down' },
  };
  const ticks: FitCall = { id: 't', name: 'TranslatePhysicalTimeToTicks', options: {} };

  it('catches a `requires` the chain does not satisfy', () => {
    const problems = validateChain([pedal]);
    expect(problems).toHaveLength(1);
    expect(at(problems, 0, 'problem')).toMatchObject({
      index: 0,
      id: 'p',
      name: 'InsertPedal',
      kind: 'unsatisfied-requirement',
    });
    expect(at(problems, 0, 'problem').message).toContain('TranslatePhysicalTimeToTicks');
  });

  it('is satisfied whatever order the two are written in', () => {
    expect(validateChain([ticks, pedal])).toEqual([]);
    // The chain runs in reduction order, not the order it was written, so this is the same
    // chain and must get the same answer.
    expect(validateChain([pedal, ticks])).toEqual([]);
  });

  it("follows the registry's alias, so a chain saved under the old spelling still runs", () => {
    const misspelled: FitCall = { id: 't', name: 'TranslatePhyiscalTimeToTicks', options: {} };
    expect(validateChain([misspelled, pedal])).toEqual([]);
  });

  it('refuses a chain that is not a list of calls', () => {
    const notAChain: FitCall[] = JSON.parse('"a chain"');
    expect(() => validateChain(notAChain)).toThrow(InvalidOptionError);
    const noName: FitCall[] = JSON.parse('[{"id":"x","options":{}}]');
    expect(() => validateChain(noName)).toThrow(/chain\[0\]\.name/);
  });

  it('refuses a Set envelope that carries no array', () => {
    const bad: FitCall[] = JSON.parse(
      '[{"id":"x","name":"MakeChoice","options":{"a":{"dataType":"Set","value":3}}}]',
    );
    expect(() => validateChain(bad)).toThrow(/Set envelope/);
  });
});

describe('listFitters', () => {
  it('is the reduction order, pinned', () => {
    expect(listFitters().map((fitter) => fitter.name)).toEqual([
      'MakeChoice',
      'Modify',
      'InsertDynamicsGradient',
      'InsertTemporalSpread',
      'ApproximateLogarithmicTempo',
      'InsertTempo',
      'InsertAsynchrony',
      'TranslatePhysicalTimeToTicks',
      'StylizeOrnamentation',
      'CompressOrnamentation',
      'InsertRubato',
      'CombineAdjacentRubatos',
      'InsertDynamicsInstructions',
      'InsertMetricalAccentuation',
      'MergeMetricalAccentuations',
      'InsertArticulation',
      'StylizeArticulation',
      'MakeDefaultArticulation',
      'InsertPedal',
      'InsertMetadata',
    ]);
  });

  it("carries each fitter's requirements, and every one of them is itself a fitter", () => {
    const fitters = listFitters();
    expect(fitters).toHaveLength(20);
    expect(fitters.map((fitter) => fitter.ordinal)).toEqual(fitters.map((_, i) => i));

    const names = new Set(fitters.map((fitter) => fitter.name));
    for (const fitter of fitters)
      for (const required of fitter.requires) expect(names.has(required)).toBe(true);

    expect(fitters.find((fitter) => fitter.name === 'InsertPedal')?.requires).toEqual([
      'TranslatePhysicalTimeToTicks',
    ]);
  });
});

describe('the barrel', () => {
  it('exports the fourth verb beside the other three', () => {
    expect(barrel.fitMpm).toBe(fitMpm);
    expect(barrel.listFitters).toBe(listFitters);
    expect(barrel.validateChain).toBe(validateChain);
    expect(barrel.FittingEngineError.prototype).toBeInstanceOf(barrel.MeicoError);
  });
});

/** Every path at which the value holds `undefined`, which RULE N4 forbids in facade output. */
function holes(value: unknown, path = ''): string[] {
  if (value === undefined) return [path || '<root>'];
  if (value === null || typeof value !== 'object') return [];
  if (Array.isArray(value))
    return value.flatMap((item, index) => holes(item, `${path}[${String(index)}]`));
  return Object.entries(value).flatMap(([key, item]) => holes(item, `${path}.${key}`));
}

/** Every path at which the value holds something `structuredClone` would not keep as it is. */
function foreign(value: unknown, path = ''): string[] {
  if (value === null || typeof value !== 'object') return [];
  if (Array.isArray(value))
    return value.flatMap((item, index) => foreign(item, `${path}[${String(index)}]`));
  if (Object.getPrototypeOf(value) !== Object.prototype) return [path || '<root>'];
  return Object.entries(value).flatMap(([key, item]) => foreign(item, `${path}.${key}`));
}
