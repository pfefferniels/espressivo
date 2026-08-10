/**
 * Ornamentation — DESIGN.md §5.6 as ruled by AD-40, AD-41, AD-42 and AD-43.
 *
 * **Every renderer claim here is measured through `Performance.perform`.** AD-43.1 tightened
 * the standard after a map-level probe produced a false "global maps perform nothing" claim:
 * "the renderer determines it" means the PIPELINE, not the nearest method. So the harness below
 * performs a real MSM against a real MPM and reads the notes back, and the reader is asserted
 * against those notes rather than against numbers worked out by hand.
 */
import { describe, it, expect } from 'vitest';
import { performMsm } from '../../src/api/pipeline.js';
import { parseTemporalValueLenient } from '../../src/mpm/elements/styles/defs/TemporalValue.js';
import { readComparisonPair, readScopeMapViews } from '../../src/comparison/document.js';
import type { ComparisonDocument } from '../../src/comparison/document.js';
import {
  parseFrameValue,
  readOrnamentAtoms,
  type OrnamentAtom,
  type OrnamentAtoms,
} from '../../src/comparison/ornamentAtoms.js';
import {
  ornamentationDistance,
  deviationFromNeutral,
  composeAnchors,
} from '../../src/comparison/ornamentationDistance.js';
import { comparisonRowFor, COMPARISON_JND_KEYS } from '../../src/comparison/registry.js';
import { isBottom } from '../../src/comparison/values.js';

const NS = 'http://www.cemfi.de/mpm/ns/1.0';
const PPQ = 720;

/** Three notes of one chord at date 0, plus one at 360 for the style-switch cases. */
const MSM = `<?xml version="1.0" encoding="UTF-8"?>
<msm xmlns="http://www.cemfi.de/msm/ns/1.0" title="t" pulsesPerQuarter="${PPQ}">
  <global><dated/></global>
  <part name="p" number="1" midi.channel="0" midi.port="0"><dated><score>
    <note xml:id="n1" date="0.0" midi.pitch="60.0" duration="720.0"/>
    <note xml:id="n2" date="0.0" midi.pitch="64.0" duration="720.0"/>
    <note xml:id="n3" date="0.0" midi.pitch="67.0" duration="720.0"/>
    <note xml:id="m1" date="1440.0" midi.pitch="60.0" duration="720.0"/>
    <note xml:id="m2" date="1440.0" midi.pitch="64.0" duration="720.0"/>
  </score></dated></part>
</msm>`;

/** An MPM whose ornamentationMap sits in the part or in `<global>`, styles always global. */
const mpmDoc = (defs: string, map: string, where: 'part' | 'global' = 'part'): string => {
  const mapXml = `<ornamentationMap>${map}</ornamentationMap>`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<mpm xmlns="${NS}"><performance name="p" pulsesPerQuarter="${PPQ}">
  <global><header><ornamentationStyles><styleDef name="O">${defs}</styleDef></ornamentationStyles></header>
    <dated>${where === 'global' ? mapXml : ''}</dated></global>
  <part name="p" number="1" midi.channel="0" midi.port="0"><header/>
    <dated>${where === 'part' ? mapXml : ''}</dated></part>
</performance></mpm>`;
};

interface PerformedNote {
  readonly id: string;
  readonly velocity: number;
  readonly datePerf: number;
}

/** Perform the pair and read every note back — the only renderer evidence this file accepts. */
function perform(defs: string, map: string, where: 'part' | 'global' = 'part'): PerformedNote[] {
  const out = performMsm({ msm: MSM, mpm: mpmDoc(defs, map, where) });
  return [...out.matchAll(/<note\b[^>]*>/g)].map((match) => {
    const tag = match[0];
    const read = (name: string): string =>
      new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1] ?? 'NaN';
    return {
      id: /xml:id="([^"]*)"/.exec(tag)?.[1] ?? '?',
      velocity: parseFloat(read('velocity')),
      datePerf: parseFloat(read('date\\.perf')),
    };
  });
}

/** The performed velocities of the chord at date 0, in document order. */
const chordVelocities = (defs: string, map: string, where: 'part' | 'global' = 'part'): number[] =>
  perform(defs, map, where)
    .filter((note) => ['n1', 'n2', 'n3'].includes(note.id))
    .map((note) => note.velocity);

const chordOnsets = (defs: string, map: string): number[] =>
  perform(defs, map)
    .filter((note) => ['n1', 'n2', 'n3'].includes(note.id))
    .map((note) => note.datePerf);

const atomsOf = (defs: string, map: string, where: 'part' | 'global' = 'part'): OrnamentAtoms => {
  const document: ComparisonDocument = readComparisonPair({ a: mpmDoc(defs, map, where) }).a;
  const scope = document.scopes.find((candidate) => candidate.scope === where);
  if (scope === undefined) throw new Error(`no ${where} scope`);
  return readOrnamentAtoms(
    readScopeMapViews(scope).get('ornamentationMap') ?? null,
    document.scaleFactor,
    scope.environment,
    document.performance.global,
    where,
  );
};

const distance = (a: OrnamentAtoms, b: OrnamentAtoms): number =>
  ornamentationDistance(a, b, { startQuarters: 0, endQuarters: 8 } as never, PPQ).distance;

const GRAD =
  '<ornamentDef name="g"><dynamicsGradient transition.from="-20.0" transition.to="20.0"/></ornamentDef>';
const STYLE0 = '<style date="0.0" name.ref="O"/>';
const ORN = (extra = ''): string => `<ornament date="0.0" name.ref="g" scale="1.0"${extra}/>`;

describe('AD-43.1 — a GLOBAL ornamentationMap performs', () => {
  it('performs identically from <global> and from a <part>, through the pipeline', () => {
    expect(chordVelocities(GRAD, `${STYLE0}${ORN()}`, 'part')).toEqual([80, 100, 120]);
    expect(chordVelocities(GRAD, `${STYLE0}${ORN()}`, 'global')).toEqual([80, 100, 120]);
  });

  it('reads atoms from a global scope, where 404fd57 read none', () => {
    const global = atomsOf(GRAD, `${STYLE0}${ORN()}`, 'global');
    expect(global.atoms).toHaveLength(1);
    expect(global.notes.map((note) => note.kind)).not.toContain('global-scope-inert');
    expect(global.atoms[0].gradient).toEqual({ kind: 'value', value: { from: -20, to: 20 } });
  });
});

describe('the gradient the renderer actually performs', () => {
  it('defaults @transition.to to @transition.from, not to 0', () => {
    const flat = '<ornamentDef name="g"><dynamicsGradient transition.from="-20.0"/></ornamentDef>';
    // A −20 → 0 reading predicts 80/90/100; the renderer performs a flat ramp.
    expect(chordVelocities(flat, `${STYLE0}${ORN()}`)).toEqual([80, 80, 80]);
    expect(atomsOf(flat, `${STYLE0}${ORN()}`).atoms[0].gradient).toEqual({
      kind: 'value',
      value: { from: -20, to: -20 },
    });
  });

  it('prices two encodings of one performed ramp at 0 (AD-40.2)', () => {
    const half =
      '<ornamentDef name="g"><dynamicsGradient transition.from="-10.0" transition.to="10.0"/></ornamentDef>';
    const scaled = `<ornament date="0.0" name.ref="g" scale="2.0"/>`;
    expect(chordVelocities(GRAD, `${STYLE0}${ORN()}`)).toEqual(
      chordVelocities(half, `${STYLE0}${scaled}`),
    );
    expect(distance(atomsOf(GRAD, `${STYLE0}${ORN()}`), atomsOf(half, `${STYLE0}${scaled}`))).toBe(
      0,
    );
  });

  it('performs nothing without @scale, and the spread still applies (AD-40.1)', () => {
    const both =
      '<ornamentDef name="g"><dynamicsGradient transition.from="-20.0" transition.to="20.0"/>' +
      '<temporalSpread frame.start="-22.0" frameLength="44.0"/></ornamentDef>';
    const unscaled = '<ornament date="0.0" name.ref="g"/>';
    expect(chordVelocities(both, `${STYLE0}${unscaled}`)).toEqual([100, 100, 100]);
    expect(chordOnsets(both, `${STYLE0}${unscaled}`)).toEqual([-22, 0, 22]);
  });
});

describe('absence has a NEUTRAL, measured (AD-42.3, AD-43.2ii)', () => {
  const none = '<ornamentDef name="g"/>';
  const neutralGradient =
    '<ornamentDef name="g"><dynamicsGradient transition.from="0" transition.to="0"/></ornamentDef>';
  const neutralSpread =
    '<ornamentDef name="g"><temporalSpread frame.start="0" frameLength="0"/></ornamentDef>';

  it('an absent <dynamicsGradient> performs what (0,0) performs', () => {
    expect(chordVelocities(none, `${STYLE0}${ORN()}`)).toEqual(
      chordVelocities(neutralGradient, `${STYLE0}${ORN()}`),
    );
  });

  it('an absent <temporalSpread> performs what a zero frame performs', () => {
    expect(chordOnsets(none, `${STYLE0}${ORN()}`)).toEqual(
      chordOnsets(neutralSpread, `${STYLE0}${ORN()}`),
    );
  });

  it('so both compare at distance 0 rather than at ⊥', () => {
    expect(
      distance(atomsOf(none, `${STYLE0}${ORN()}`), atomsOf(neutralGradient, `${STYLE0}${ORN()}`)),
    ).toBe(0);
    expect(
      distance(atomsOf(none, `${STYLE0}${ORN()}`), atomsOf(neutralSpread, `${STYLE0}${ORN()}`)),
    ).toBe(0);
  });

  it('drops cost by CONTENT, not by a flat constant (AD-42.3’s point)', () => {
    const small = atomsOf(
      '<ornamentDef name="g"><dynamicsGradient transition.from="-1" transition.to="1"/></ornamentDef>',
      `${STYLE0}${ORN()}`,
    );
    const large = atomsOf(
      '<ornamentDef name="g"><dynamicsGradient transition.from="-40" transition.to="40"/></ornamentDef>',
      `${STYLE0}${ORN()}`,
    );
    const dropSmall = deviationFromNeutral(small.atoms[0], PPQ);
    const dropLarge = deviationFromNeutral(large.atoms[0], PPQ);
    expect(dropSmall).toBeGreaterThan(0);
    expect(dropLarge).toBeGreaterThan(dropSmall);
  });
});

describe('the frame: four cells, one of them dead', () => {
  const v2 =
    '<ornamentDef name="g"><temporalSpread frame.start="-22.0" frameLength="44.0"/></ornamentDef>';
  const v3 =
    '<ornamentDef name="g"><temporalSpread frame.offset="-22ticks" frameLength="44ticks"/></ornamentDef>';
  const suffixOnly =
    '<ornamentDef name="g"><temporalSpread frame.start="-22ticks" frameLength="44"/></ornamentDef>';
  const none = '<ornamentDef name="g"/>';

  it('a v2 frame spreads and a v3 frame with the SAME numbers spreads nothing', () => {
    expect(chordOnsets(v2, `${STYLE0}${ORN()}`)).toEqual([-22, 0, 22]);
    expect(chordOnsets(v3, `${STYLE0}${ORN()}`)).toEqual([0, 0, 0]);
  });

  it('a unit suffix on @frame.start alone is enough to make it v3, and inert', () => {
    expect(chordOnsets(suffixOnly, `${STYLE0}${ORN()}`)).toEqual([0, 0, 0]);
  });

  it('so a v3 frame on a v2-shaped ornament compares equal to NO frame', () => {
    expect(distance(atomsOf(v3, `${STYLE0}${ORN()}`), atomsOf(none, `${STYLE0}${ORN()}`))).toBe(0);
    expect(
      distance(atomsOf(suffixOnly, `${STYLE0}${ORN()}`), atomsOf(none, `${STYLE0}${ORN()}`)),
    ).toBe(0);
  });

  it('and a v2 frame does NOT compare equal to no frame', () => {
    expect(
      distance(atomsOf(v2, `${STYLE0}${ORN()}`), atomsOf(none, `${STYLE0}${ORN()}`)),
    ).toBeGreaterThan(0);
  });

  it('clamps a negative v2 @frameLength to 0, which is a rigid shift', () => {
    const negative =
      '<ornamentDef name="g"><temporalSpread frame.start="-22.0" frameLength="-44"/></ornamentDef>';
    expect(chordOnsets(negative, `${STYLE0}${ORN()}`)).toEqual([-22, -22, -22]);
    const spread = atomsOf(negative, `${STYLE0}${ORN()}`).atoms[0].spread;
    expect(spread !== null && !isBottom(spread) && spread.value.frameLength).toBe(0);
  });

  it('reports a @time.unit domain mismatch as incomparable, not as a big difference', () => {
    const ms =
      '<ornamentDef name="g"><temporalSpread frame.start="-22.0" frameLength="44.0" time.unit="milliseconds"/></ornamentDef>';
    const result = ornamentationDistance(
      atomsOf(v2, `${STYLE0}${ORN()}`),
      atomsOf(ms, `${STYLE0}${ORN()}`),
      { startQuarters: 0, endQuarters: 8 } as never,
      PPQ,
    );
    expect(result.findings.map((finding) => finding.kind)).toContain('time-unit');
    // Two frame rows at δ_row each, the identical intensity contributing nothing.
    expect(result.distance).toBeCloseTo(
      2 * comparisonRowFor('ornamentation/temporalSpread@frame.start').delta,
      9,
    );
  });
});

describe('the v3 SHAPE gate (@repetitions / @noteid)', () => {
  it('a present @repetitions deletes the whole ornament', () => {
    expect(chordVelocities(GRAD, `${STYLE0}${ORN()}`)).toEqual([80, 100, 120]);
    expect(chordVelocities(GRAD, `${STYLE0}${ORN(' repetitions="0"')}`)).toEqual([100, 100, 100]);
  });

  it('and @noteid does the same', () => {
    expect(chordVelocities(GRAD, `${STYLE0}${ORN(' noteid="#n1"')}`)).toEqual([100, 100, 100]);
  });

  it('so the reader emits no atom for it, and says why', () => {
    const read = atomsOf(GRAD, `${STYLE0}${ORN(' repetitions="0"')}`);
    expect(read.atoms).toHaveLength(0);
    expect(read.notes.map((note) => note.kind)).toContain('v3-shape-skipped');
  });

  it('which makes a document with the attribute differ from one without it', () => {
    expect(
      distance(
        atomsOf(GRAD, `${STYLE0}${ORN()}`),
        atomsOf(GRAD, `${STYLE0}${ORN(' repetitions="0"')}`),
      ),
    ).toBeGreaterThan(0);
  });
});

describe('@note.order (AD-41.1)', () => {
  it('the two orderings genuinely swap which note gets which step', () => {
    expect(chordVelocities(GRAD, `${STYLE0}${ORN(' note.order="ascending pitch"')}`)).toEqual([
      80, 100, 120,
    ]);
    expect(chordVelocities(GRAD, `${STYLE0}${ORN(' note.order="descending pitch"')}`)).toEqual([
      120, 100, 80,
    ]);
  });

  it('so the enumerated pair is a priced row, not a structural finding', () => {
    const up = atomsOf(GRAD, `${STYLE0}${ORN(' note.order="ascending pitch"')}`);
    const down = atomsOf(GRAD, `${STYLE0}${ORN(' note.order="descending pitch"')}`);
    expect(up.atoms[0].noteOrderKind).toBe('ascending');
    expect(down.atoms[0].noteOrderKind).toBe('descending');
    expect(distance(up, down)).toBeCloseTo(
      1 / comparisonRowFor('ornamentation/ornament@note.order').jnd,
      9,
    );
  });

  it('treats an absent @note.order as ascending, which is the renderer’s own default', () => {
    expect(chordVelocities(GRAD, `${STYLE0}${ORN()}`)).toEqual(
      chordVelocities(GRAD, `${STYLE0}${ORN(' note.order="ascending pitch"')}`),
    );
    expect(
      distance(
        atomsOf(GRAD, `${STYLE0}${ORN()}`),
        atomsOf(GRAD, `${STYLE0}${ORN(' note.order="ascending pitch"')}`),
      ),
    ).toBe(0);
  });

  it('sends an explicit id list to the finding channel', () => {
    const list = atomsOf(GRAD, `${STYLE0}${ORN(' note.order="#n1 #n2"')}`);
    expect(list.atoms[0].noteOrderKind).toBe('id-list');
    expect(list.atoms[0].poolBound).toBe(2);
    const result = ornamentationDistance(
      list,
      atomsOf(GRAD, `${STYLE0}${ORN(' note.order="#n2 #n1"')}`),
      { startQuarters: 0, endQuarters: 8 } as never,
      PPQ,
    );
    expect(result.findings.map((finding) => finding.kind)).toContain('note-order-ids');
  });
});

describe('a one-note pool collapses both families (AD-40.3)', () => {
  it('performs @transition.to alone, so the reader flattens the ramp to it', () => {
    const one = `${STYLE0}${ORN(' note.order="#n2"')}`;
    const performed = perform(GRAD, one).filter((note) => note.id === 'n2');
    expect(performed[0].velocity).toBe(120);
    expect(atomsOf(GRAD, one).atoms[0].gradient).toEqual({
      kind: 'value',
      value: { from: 20, to: 20 },
    });
  });

  it('so a def differing only in @transition.from compares equal on a one-note pool', () => {
    const other =
      '<ornamentDef name="g"><dynamicsGradient transition.from="5.0" transition.to="20.0"/></ornamentDef>';
    const one = `${STYLE0}${ORN(' note.order="#n2"')}`;
    expect(perform(GRAD, one).find((note) => note.id === 'n2')!.velocity).toBe(
      perform(other, one).find((note) => note.id === 'n2')!.velocity,
    );
    expect(distance(atomsOf(GRAD, one), atomsOf(other, one))).toBe(0);
  });

  it('places a lone chord at frameStart + frameLength, so @intensity goes inert', () => {
    const wide =
      '<ornamentDef name="g"><temporalSpread frame.start="-22.0" frameLength="44.0" intensity="3"/></ornamentDef>';
    const one = `${STYLE0}${ORN(' note.order="#n2"')}`;
    expect(perform(wide, one).find((note) => note.id === 'n2')!.datePerf).toBe(22);
    const spread = atomsOf(wide, one).atoms[0].spread;
    expect(spread !== null && !isBottom(spread) && spread.value).toEqual({
      frameStart: 22,
      frameLength: 0,
      intensity: 1,
      domain: 'ticks',
      source: 'v2',
    });
  });
});

describe('unusable values (AD-42.4)', () => {
  it('an unusable @scale poisons every velocity, so the gradient reads ⊥', () => {
    const map = `${STYLE0}<ornament date="0.0" name.ref="g" scale="abc"/>`;
    expect(chordVelocities(GRAD, map).every(Number.isNaN)).toBe(true);
    const atom = atomsOf(GRAD, map).atoms[0];
    expect(atom.gradient).toEqual({ kind: 'bottom', cause: 'renderer-error' });
    expect(atomsOf(GRAD, map).notes.map((note) => note.kind)).toContain('scale-unusable');
  });

  it('an unusable v2 @frameLength poisons every onset, so the frame reads ⊥', () => {
    const bad =
      '<ornamentDef name="g"><temporalSpread frame.start="-22.0" frameLength="abc"/></ornamentDef>';
    expect(chordOnsets(bad, `${STYLE0}${ORN()}`).every(Number.isNaN)).toBe(true);
    expect(atomsOf(bad, `${STYLE0}${ORN()}`).atoms[0].spread).toEqual({
      kind: 'bottom',
      cause: 'renderer-error',
    });
  });

  it('never lets NaN reach the metric', () => {
    const map = `${STYLE0}<ornament date="0.0" name.ref="g" scale="abc"/>`;
    expect(Number.isFinite(distance(atomsOf(GRAD, map), atomsOf(GRAD, `${STYLE0}${ORN()}`)))).toBe(
      true,
    );
  });
});

describe('the style is CARRIED, and a failed switch differs by scope', () => {
  const defs = `${GRAD}<ornamentDef name="h"><dynamicsGradient transition.from="-5.0" transition.to="5.0"/></ornamentDef>`;
  const late = '<ornament date="1440.0" name.ref="g" scale="1.0"/>';
  const broken = `${STYLE0}${ORN()}<style date="1440.0" name.ref="NOPE"/>${late}`;

  const lateVelocities = (map: string, where: 'part' | 'global'): number[] =>
    perform(defs, map, where)
      .filter((note) => ['m1', 'm2'].includes(note.id))
      .map((note) => note.velocity);

  it('a failed switch CANCELS the style in a part-local map', () => {
    expect(lateVelocities(broken, 'part')).toEqual([100, 100]);
    expect(atomsOf(defs, broken, 'part').atoms).toHaveLength(1);
  });

  it('and changes nothing in a global map', () => {
    expect(lateVelocities(broken, 'global')).toEqual([80, 120]);
    expect(atomsOf(defs, broken, 'global').atoms).toHaveLength(2);
  });

  it('a global map ignores EVERY switch after its first successful one', () => {
    const reswitch = `${STYLE0}${ORN()}<style date="1440.0" name.ref="O"/>${late}`;
    // Both styleDefs are named "O" here only in the part case; the point is the second switch
    // is never looked up at all in a global map, which the note channel reports.
    const read = atomsOf(defs, reswitch, 'global');
    expect(read.notes.map((note) => note.kind)).toContain('style-switch-ignored');
  });

  it('skips an ornament before the map’s first <style>', () => {
    const early = `${ORN()}<style date="1440.0" name.ref="O"/>${late}`;
    expect(chordVelocities(defs, early)).toEqual([100, 100, 100]);
    const read = atomsOf(defs, early);
    expect(read.atoms).toHaveLength(1);
    expect(read.notes.map((note) => note.kind)).toContain('no-style-in-scope');
  });

  it('skips an ornament naming a def the style does not have', () => {
    const ghost = `${STYLE0}<ornament date="0.0" name.ref="ghost" scale="1.0"/>`;
    expect(chordVelocities(defs, ghost)).toEqual([100, 100, 100]);
    expect(atomsOf(defs, ghost).atoms).toHaveLength(0);
  });
});

describe('the v3 temporal-value grammar, against the real parser', () => {
  it('agrees with parseTemporalValueLenient over a shared corpus', () => {
    const corpus = [
      '0',
      '-0',
      '22',
      '-22',
      '22.5',
      '-22.5',
      '100%',
      '-100%',
      '22ms',
      '-22.5ms',
      '0ticks',
      '360ticks',
      '.5',
      '1e3',
      '+22',
      ' 22',
      '22 ',
      'abc',
      '',
      '22th',
      '22?',
      'Infinity',
      '-0.0ticks',
    ];
    for (const text of corpus) {
      const mine = parseFrameValue(text);
      const theirs = parseTemporalValueLenient(text);
      expect(mine === null).toBe(theirs === null);
      if (mine !== null && theirs !== null) {
        expect(mine.value).toBe(theirs.value);
        expect(mine.domain).toBe(theirs.domain);
      }
    }
  });
});

describe('the new registry rows', () => {
  it('exports @note.order and @repetitions in the closed vocabulary', () => {
    expect(COMPARISON_JND_KEYS).toContain('ornamentation/ornament@note.order');
    expect(COMPARISON_JND_KEYS).toContain('ornamentation/ornament@repetitions');
  });

  it('admits meico’s -1 fill-frame extension and rejects a real negative count', () => {
    const row = comparisonRowFor('ornamentation/ornament@repetitions');
    expect(row.valueDomain(-1)).toBe(true);
    expect(row.valueDomain(0)).toBe(true);
    expect(row.valueDomain(3)).toBe(true);
    expect(row.valueDomain(-2)).toBe(false);
    expect(row.valueDomain(Number.NaN)).toBe(false);
  });

  it('keeps @note.order a {0,1} row', () => {
    const row = comparisonRowFor('ornamentation/ornament@note.order');
    expect(row.valueDomain(0)).toBe(true);
    expect(row.valueDomain(1)).toBe(true);
    expect(row.valueDomain(0.5)).toBe(false);
  });
});

describe('the aligner’s interface, unchanged by its second consumer', () => {
  it('aligns ornaments by date and prices the optimum', () => {
    const a = atomsOf(GRAD, `${STYLE0}${ORN()}<ornament date="1440.0" name.ref="g" scale="1.0"/>`);
    const b = atomsOf(GRAD, `${STYLE0}${ORN()}`);
    const result = ornamentationDistance(a, b, { startQuarters: 0, endQuarters: 8 } as never, PPQ);
    expect(result.matched).toBe(1);
    expect(result.unmatchedA).toBe(1);
    expect(result.unmatchedB).toBe(0);
    expect(result.distance).toBeCloseTo(deviationFromNeutral(a.atoms[1] as OrnamentAtom, PPQ), 9);
  });
});

describe('stacked ornaments at one date (AD-44.1, AD-44.2)', () => {
  const gradB =
    '<ornamentDef name="h"><dynamicsGradient transition.from="-10.0" transition.to="30.0"/></ornamentDef>';
  const summed =
    '<ornamentDef name="g"><dynamicsGradient transition.from="-30.0" transition.to="50.0"/></ornamentDef>';
  const ORN_H = '<ornament date="0.0" name.ref="h" scale="1.0"/>';

  it('gradients compose by summing endpoints, and the renderer says so', () => {
    expect(chordVelocities(`${GRAD}${gradB}`, `${STYLE0}${ORN()}${ORN_H}`)).toEqual([70, 110, 150]);
    expect(chordVelocities(summed, `${STYLE0}${ORN()}`)).toEqual([70, 110, 150]);
  });

  it('so two stacked ornaments compare equal to the one that sums them (AD-44.1)', () => {
    expect(
      distance(
        atomsOf(`${GRAD}${gradB}`, `${STYLE0}${ORN()}${ORN_H}`),
        atomsOf(summed, `${STYLE0}${ORN()}`),
      ),
    ).toBe(0);
  });

  it('a descending ornament contributes SWAPPED endpoints, measured', () => {
    const mixed = `${STYLE0}${ORN(' note.order="ascending pitch"')}<ornament date="0.0" name.ref="h" scale="1.0" note.order="descending pitch"/>`;
    // asc(-20,20) + desc(-10,30) is a flat +10 — identical to the single gradient (10,10).
    expect(chordVelocities(`${GRAD}${gradB}`, mixed)).toEqual([110, 110, 110]);
    const flat =
      '<ornamentDef name="g"><dynamicsGradient transition.from="10.0" transition.to="10.0"/></ornamentDef>';
    expect(chordVelocities(flat, `${STYLE0}${ORN()}`)).toEqual([110, 110, 110]);
    expect(distance(atomsOf(`${GRAD}${gradB}`, mixed), atomsOf(flat, `${STYLE0}${ORN()}`))).toBe(0);
  });

  it('does NOT compose across different pools', () => {
    const byId = `${STYLE0}${ORN()}<ornament date="0.0" name.ref="h" scale="1.0" note.order="#n1 #n2"/>`;
    const composed = composeAnchors(atomsOf(`${GRAD}${gradB}`, byId).atoms);
    // Two pools, so two gradients survive rather than one sum and one neutral.
    expect(composed.map((atom) => atom.gradient)).toEqual([
      { kind: 'value', value: { from: -20, to: 20 } },
      { kind: 'value', value: { from: -10, to: 30 } },
    ]);
  });

  it('AD-44.2 — stacked SPREADS of equal intensity DO sum, which narrows the residual', () => {
    const s =
      '<ornamentDef name="s"><temporalSpread frame.start="-22.0" frameLength="44.0"/></ornamentDef>';
    const t =
      '<ornamentDef name="t"><temporalSpread frame.start="-100.0" frameLength="200.0"/></ornamentDef>';
    const both =
      '<ornamentDef name="s"><temporalSpread frame.start="-122.0" frameLength="244.0"/></ornamentDef>';
    const stacked = `${STYLE0}<ornament date="0.0" name.ref="s" scale="1.0"/><ornament date="0.0" name.ref="t" scale="1.0"/>`;
    expect(chordOnsets(`${s}${t}`, stacked)).toEqual([-122, 0, 122]);
    expect(chordOnsets(both, `${STYLE0}<ornament date="0.0" name.ref="s" scale="1.0"/>`)).toEqual([
      -122, 0, 122,
    ]);
  });

  it('AD-44.2 — and of DIFFERENT intensity do not sum to any single frame', () => {
    const s =
      '<ornamentDef name="s"><temporalSpread frame.start="-22.0" frameLength="44.0"/></ornamentDef>';
    const u =
      '<ornamentDef name="u"><temporalSpread frame.start="0" frameLength="360" intensity="3"/></ornamentDef>';
    const stacked = `${STYLE0}<ornament date="0.0" name.ref="s" scale="1.0"/><ornament date="0.0" name.ref="u" scale="1.0"/>`;
    // −22/45/382: the second slot is not (i/(n−1))·L of any single frame with these ends.
    expect(chordOnsets(`${s}${u}`, stacked)).toEqual([-22, 45, 382]);
  });

  it('so stacked spreads stay individual events, and the encoding residual is REAL', () => {
    const s =
      '<ornamentDef name="s"><temporalSpread frame.start="-22.0" frameLength="44.0"/></ornamentDef>';
    const t =
      '<ornamentDef name="t"><temporalSpread frame.start="-100.0" frameLength="200.0"/></ornamentDef>';
    const both =
      '<ornamentDef name="s"><temporalSpread frame.start="-122.0" frameLength="244.0"/></ornamentDef>';
    const stacked = `${STYLE0}<ornament date="0.0" name.ref="s" scale="1.0"/><ornament date="0.0" name.ref="t" scale="1.0"/>`;
    // The two documents PERFORM identically (the test above) and compare unequal: AD-44.2's
    // documented limitation, pinned with its measurement rather than left as prose.
    expect(
      distance(
        atomsOf(`${s}${t}`, stacked),
        atomsOf(both, `${STYLE0}<ornament date="0.0" name.ref="s" scale="1.0"/>`),
      ),
    ).toBeGreaterThan(0);
  });
});
