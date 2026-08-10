/**
 * Ornamentation — DESIGN.md §5.6 as ruled by AD-40, and the event aligner's second consumer.
 *
 * The `@scale` behaviour is checked against the RENDERER: the ornament is rendered over a real
 * note map and the `ornament.dynamics` markers it writes are what decide whether the gradient
 * performed. That is the measurement AD-40.1 rests on, and re-running it here is what stops a
 * future renderer change from quietly invalidating the ruling.
 */
import { describe, it, expect } from 'vitest';
import { Attribute, Element } from '../../src/xml/XomTypes.js';
import { Mpm } from '../../src/mpm/Mpm.js';
import { GenericMap } from '../../src/mpm/elements/maps/GenericMap.js';
import type { OrnamentationMap } from '../../src/mpm/elements/maps/OrnamentationMap.js';
import { readComparisonPair, readScopeMapViews } from '../../src/comparison/document.js';
import type { ComparisonDocument } from '../../src/comparison/document.js';
import { readOrnamentAtoms, type OrnamentAtoms } from '../../src/comparison/ornamentAtoms.js';
import { ornamentationDistance } from '../../src/comparison/ornamentationDistance.js';
import { comparisonRowFor } from '../../src/comparison/registry.js';

const NS = 'http://www.cemfi.de/mpm/ns/1.0';

const STYLES =
  '<ornamentationStyles><styleDef name="O">' +
  '<ornamentDef name="arp"><temporalSpread frame.start="-120.0" frameLength="240.0"/></ornamentDef>' +
  '<ornamentDef name="grad"><dynamicsGradient transition.from="-20.0" transition.to="20.0"/></ornamentDef>' +
  '<ornamentDef name="half"><dynamicsGradient transition.from="-10.0" transition.to="10.0"/></ornamentDef>' +
  '<ornamentDef name="wide"><temporalSpread frame.start="-240.0" frameLength="480.0"/></ornamentDef>' +
  '</styleDef></ornamentationStyles>';

/**
 * The map lives in a PART, because a global `ornamentationMap` performs nothing at all — see
 * the gate suite at the bottom. The styles stay in the global header, which a part-local map
 * resolves against perfectly well.
 */
const doc = (map: string) =>
  `<mpm xmlns="${NS}"><performance name="p" pulsesPerQuarter="720">` +
  `<global><header>${STYLES}</header><dated/></global>` +
  '<part name="p" number="1" midi.channel="0" midi.port="0">' +
  `<dated><ornamentationMap>${map}</ornamentationMap></dated></part>` +
  '</performance></mpm>';

/** A document whose ornamentationMap sits in `<global>` instead. */
const globalDoc = (map: string) =>
  `<mpm xmlns="${NS}"><performance name="p" pulsesPerQuarter="720">` +
  `<global><header>${STYLES}</header><dated><ornamentationMap>${map}` +
  '</ornamentationMap></dated></global></performance></mpm>';

const atomsOf = (map: string): OrnamentAtoms => {
  const document: ComparisonDocument = readComparisonPair({ a: doc(map) }).a;
  const scope = document.scopes.find((candidate) => candidate.scope === 'part');
  if (scope === undefined) throw new Error('no part scope');
  return readOrnamentAtoms(
    readScopeMapViews(scope).get('ornamentationMap') ?? null,
    document.scaleFactor,
    scope.environment,
    document.performance.global,
    'part',
  );
};

/** The `ornament.dynamics` markers the renderer writes for three notes at one date. */
function markers(map: string, where: 'part' | 'global' = 'part'): (string | null)[] {
  const mpm = new Mpm(where === 'part' ? doc(map) : globalDoc(map));
  const performance = mpm.getPerformance(0)!;
  const dated =
    where === 'part' ? performance.getPart('p')!.getDated()! : performance.getGlobal()!.getDated()!;
  const ornamentationMap = dated.getMap('ornamentationMap') as unknown as OrnamentationMap;

  const notes = GenericMap.createGenericMap('someMap')!;
  for (let i = 0; i < 3; ++i) {
    const note = new Element('note', NS);
    note.addAttribute(new Attribute('date', '0'));
    note.addAttribute(new Attribute('date.perf', '0'));
    note.addAttribute(new Attribute('duration.perf', '360'));
    note.addAttribute(new Attribute('velocity', '64'));
    note.addAttribute(new Attribute('pitch', String(60 + i * 4)));
    notes.addElement(note);
  }
  ornamentationMap.renderOrnamentationToMap(notes);
  return notes
    .getXml()
    .getChildElements()
    .toArray()
    .map((note) => note.getAttributeValue('ornament.dynamics'));
}

const STYLE0 = '<style date="0.0" name.ref="O"/>';

describe('@scale gates half the ornament (AD-40.1)', () => {
  it('performs NO dynamics without @scale, and the renderer says so', () => {
    expect(markers(`${STYLE0}<ornament date="0.0" name.ref="grad"/>`)).toEqual(['0', '0', '0']);
    const atom = atomsOf(`${STYLE0}<ornament date="0.0" name.ref="grad"/>`).atoms[0];
    expect(atom.scale).toBe(0);
    expect(atom.gradient).toEqual({ from: -0, to: 0 });
  });

  it('performs the ramp with scale="1.0"', () => {
    expect(markers(`${STYLE0}<ornament date="0.0" name.ref="grad" scale="1.0"/>`)).toEqual([
      '-20',
      '0',
      '20',
    ]);
    const atom = atomsOf(`${STYLE0}<ornament date="0.0" name.ref="grad" scale="1.0"/>`).atoms[0];
    expect(atom.gradient).toEqual({ from: -20, to: 20 });
  });

  it('does NOT gate the temporal spread — the other half applies either way', () => {
    const unscaled = atomsOf(`${STYLE0}<ornament date="0.0" name.ref="arp"/>`).atoms[0];
    expect(unscaled.spread).toEqual({
      frameStart: -120,
      frameLength: 240,
      intensity: 1,
      milliseconds: false,
      v3Offset: false,
    });
  });

  it('reports the zeroed gradient rather than leaving it to be noticed', () => {
    const read = atomsOf(`${STYLE0}<ornament date="0.0" name.ref="grad"/>`);
    expect(read.notes.some((note) => note.kind === 'scale-zero')).toBe(true);
  });
});

describe('the resolved performed effect is what is compared (AD-40.2)', () => {
  const distanceOf = (a: string, b: string) => {
    const pair = readComparisonPair({ a: doc(a), b: doc(b), window: { start: 0, end: 8 } });
    const read = (side: 'a' | 'b') => {
      const document = pair[side];
      const scope = document.scopes.find((candidate) => candidate.scope === 'part');
      if (scope === undefined) throw new Error('no part scope');
      return readOrnamentAtoms(
        readScopeMapViews(scope).get('ornamentationMap') ?? null,
        document.scaleFactor,
        scope.environment,
        document.performance.global,
        'part',
      );
    };
    return ornamentationDistance(read('a'), read('b'), pair.window, pair.ppq.lcm);
  };

  it('is 0 between two ENCODINGS of one performed ramp', () => {
    // (-20, 20) x 1 and (-10, 10) x 2 are the same performance.
    const one = `${STYLE0}<ornament date="0.0" name.ref="grad" scale="1.0"/>`;
    const two = `${STYLE0}<ornament date="0.0" name.ref="half" scale="2.0"/>`;
    expect(markers(one)).toEqual(markers(two));
    expect(distanceOf(one, two).distance).toBe(0);
  });

  it('is 0 against itself (P-C1) and symmetric (P-C2)', () => {
    const a = `${STYLE0}<ornament date="0.0" name.ref="grad" scale="1.0"/>`;
    const b = `${STYLE0}<ornament date="720.0" name.ref="arp"/>`;
    expect(distanceOf(a, a).distance).toBe(0);
    expect(Object.is(distanceOf(a, b).distance, distanceOf(b, a).distance)).toBe(true);
  });

  it('prices a real gradient difference in velocity units', () => {
    const strong = `${STYLE0}<ornament date="0.0" name.ref="grad" scale="1.0"/>`;
    const weak = `${STYLE0}<ornament date="0.0" name.ref="half" scale="1.0"/>`;
    // from: |−20 − (−10)| = 10, to: |20 − 10| = 10, each over the 3-velocity JND.
    expect(distanceOf(strong, weak).distance).toBeCloseTo((10 + 10) / 3, 9);
  });

  it('prices a frame difference in quarters', () => {
    const narrow = `${STYLE0}<ornament date="0.0" name.ref="arp"/>`;
    const wide = `${STYLE0}<ornament date="0.0" name.ref="wide"/>`;
    const jnd = comparisonRowFor('ornamentation/temporalSpread@frameLength').jnd;
    // start: |−120 − (−240)| = 120 ticks = 1/6 quarter; length: 240 ticks = 1/3 quarter.
    expect(distanceOf(narrow, wide).distance).toBeCloseTo((1 / 6 + 1 / 3) / jnd, 9);
  });

  it('reads a spread present on one side only as ⊥, not as a difference from zero', () => {
    const spread = `${STYLE0}<ornament date="0.0" name.ref="arp"/>`;
    const gradient = `${STYLE0}<ornament date="0.0" name.ref="grad" scale="1.0"/>`;
    const row = comparisonRowFor('ornamentation/temporalSpread@frameLength');
    // Three frame rows at δ_row each, plus the gradient's two, also ⊥ on one side.
    expect(distanceOf(spread, gradient).distance).toBeCloseTo(row.delta * 5, 9);
  });
});

describe('skips and findings', () => {
  const read = (map: string) => atomsOf(map);

  it('skips an ornament before the first <style> — §5.4’s disposition, not §5.5’s', () => {
    const result = read('<ornament date="0.0" name.ref="grad" scale="1.0"/>');
    expect(result.atoms).toHaveLength(0);
    expect(result.notes.some((note) => note.kind === 'no-style-in-scope')).toBe(true);
  });

  it('skips an ornament naming an unknown def', () => {
    const result = read(`${STYLE0}<ornament date="0.0" name.ref="nosuch" scale="1.0"/>`);
    expect(result.atoms).toHaveLength(0);
    expect(result.notes.some((note) => note.kind === 'unresolved-def')).toBe(true);
  });

  it('sizes the pool only from an explicit @note.order id list', () => {
    const listed = read(
      `${STYLE0}<ornament date="0.0" name.ref="grad" scale="1.0" note.order="#a #b #c"/>`,
    ).atoms[0];
    expect(listed.poolSize).toBe(3);

    const enumerated = read(
      `${STYLE0}<ornament date="0.0" name.ref="grad" scale="1.0" note.order="ascending pitch"/>`,
    ).atoms[0];
    expect(enumerated.poolSize).toBeNull();
    expect(
      read(`${STYLE0}<ornament date="0.0" name.ref="grad" scale="1.0"/>`).notes.some(
        (note) => note.kind === 'pool-size-unknown',
      ),
    ).toBe(true);
  });
});

describe('the aligner’s SECOND consumer', () => {
  const distanceOf = (a: string, b: string) => {
    const pair = readComparisonPair({ a: doc(a), b: doc(b), window: { start: 0, end: 8 } });
    const readSide = (side: 'a' | 'b') => {
      const document = pair[side];
      const scope = document.scopes.find((candidate) => candidate.scope === 'part');
      if (scope === undefined) throw new Error('no part scope');
      return readOrnamentAtoms(
        readScopeMapViews(scope).get('ornamentationMap') ?? null,
        document.scaleFactor,
        scope.environment,
        document.performance.global,
        'part',
      );
    };
    return ornamentationDistance(readSide('a'), readSide('b'), pair.window, pair.ppq.lcm);
  };

  it('aligns and drops without the aligner knowing what an ornament is', () => {
    const two =
      `${STYLE0}<ornament date="0.0" name.ref="grad" scale="1.0"/>` +
      '<ornament date="1440.0" name.ref="arp"/>';
    const one = `${STYLE0}<ornament date="0.0" name.ref="grad" scale="1.0"/>`;
    const result = distanceOf(two, one);
    expect(result.matched).toBe(1);
    expect(result.unmatchedA).toBe(1);
    expect(result.distance).toBeGreaterThan(0);
  });

  it('honours an xml:id pin across a date displacement', () => {
    const a = `${STYLE0}<ornament xml:id="o1" date="0.0" name.ref="grad" scale="1.0"/>`;
    const b = `${STYLE0}<ornament xml:id="o1" date="2880.0" name.ref="grad" scale="1.0"/>`;
    const result = distanceOf(a, b);
    expect(result.matched).toBe(1);
    expect(result.pinsHonoured).toBe(true);
    // Same performed effect, so only the aligner's date term remains.
    expect(result.distance).toBeGreaterThan(0);
  });

  it('reports @note.order structurally, without pricing it', () => {
    const ascending = `${STYLE0}<ornament date="0.0" name.ref="grad" scale="1.0" note.order="ascending pitch"/>`;
    const descending = `${STYLE0}<ornament date="0.0" name.ref="grad" scale="1.0" note.order="descending pitch"/>`;
    const result = distanceOf(ascending, descending);
    expect(result.distance).toBe(0);
    expect(result.findings).toEqual([
      { kind: 'note-order', dateTicks: 0, a: 'ascending pitch', b: 'descending pitch' },
    ]);
  });
});

/**
 * The scope gate — a renderer fact with no counterpart anywhere in §5.6, and the fifth place
 * in this campaign where a §5 section and the renderer disagree.
 */
describe('a GLOBAL ornamentationMap performs nothing at all', () => {
  const ORNAMENT = `${STYLE0}<ornament date="0.0" name.ref="grad" scale="1.0"/>`;

  it('is the renderer’s own answer: the same ornament works from a part and not from global', () => {
    expect(markers(ORNAMENT, 'part')).toEqual(['-20', '0', '20']);
    expect(markers(ORNAMENT, 'global')).toEqual([null, null, null]);
  });

  it('reads as no atoms, with the cause reported rather than silently empty', () => {
    const document: ComparisonDocument = readComparisonPair({ a: globalDoc(ORNAMENT) }).a;
    const scope = document.scopes.find((candidate) => candidate.scope === 'global');
    if (scope === undefined) throw new Error('no global scope');
    const read = readOrnamentAtoms(
      readScopeMapViews(scope).get('ornamentationMap') ?? null,
      document.scaleFactor,
      scope.environment,
      document.performance.global,
      'global',
    );
    expect(read.atoms).toHaveLength(0);
    expect(read.notes.map((note) => note.kind)).toEqual(['global-scope-inert']);
  });
});
