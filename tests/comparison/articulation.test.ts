/**
 * Articulation atoms and their liveness — DESIGN.md §5.5, first half.
 *
 * Every liveness claim here is checked against the REAL renderer as well as against the
 * reader: `ArticulationMap.renderArticulationToMap_noMillisecondModifiers` is run over a note
 * map, and the resulting `duration.perf` / `velocity` is what decides whether an attribute was
 * live. A liveness table tested only against itself would pin my reading of the precedence,
 * which is the failure mode behind two of W2's three CAPITALs.
 */
import { describe, it, expect } from 'vitest';
import { Attribute, Element } from '../../src/xml/XomTypes.js';
import { Mpm } from '../../src/mpm/Mpm.js';
import { GenericMap } from '../../src/mpm/elements/maps/GenericMap.js';
import type { ArticulationMap } from '../../src/mpm/elements/maps/ArticulationMap.js';
import { readComparisonPair, readScopeMapViews } from '../../src/comparison/document.js';
import type { ComparisonDocument, ComparisonPair } from '../../src/comparison/document.js';
import {
  ARTICULATION_NEUTRALS,
  DURATION_PRECEDENCE,
  effectiveAttributes,
  readArticulationAtoms,
  resolveDurationLever,
  type ArticulationAtoms,
} from '../../src/comparison/articulationAtoms.js';
import {
  defaultArticulationAt,
  defaultArticulationStepAt,
  readDefaultArticulation,
  type DefaultArticulationCurve,
} from '../../src/comparison/articulationDefault.js';
import { anchorsOf, articulationDistance } from '../../src/comparison/articulationDistance.js';
import { compareInterior } from '../../src/comparison/compare.js';
import { defaultWeights } from '../../src/comparison/aggregate.js';
import { DEFAULT_LAMBDA_DATE } from '../../src/comparison/eventAlignment.js';
import {
  COMPARISON_DIMENSIONS,
  comparisonRowFor,
  type ComparisonDimension,
} from '../../src/comparison/registry.js';
import type { InvarianceMode } from '../../src/comparison/decomposition.js';

const NS = 'http://www.cemfi.de/mpm/ns/1.0';

const STYLES =
  '<articulationStyles><styleDef name="A">' +
  '<articulationDef name="stacc" relativeDuration="0.5"/>' +
  '<articulationDef name="ten" relativeDuration="1.2"/>' +
  '<articulationDef name="both" relativeDuration="0.5" absoluteDurationChange="10"/>' +
  '</styleDef></articulationStyles>';

const doc = (map: string) =>
  `<mpm xmlns="${NS}"><performance name="p" pulsesPerQuarter="720">` +
  `<global><header>${STYLES}</header><dated><articulationMap>${map}` +
  '</articulationMap></dated></global></performance></mpm>';

const atomsOf = (map: string): ArticulationAtoms => {
  const pair: ComparisonPair = readComparisonPair({ a: doc(map) });
  const document: ComparisonDocument = pair.a;
  const scope = document.scopes.find((candidate) => candidate.scope === 'global');
  if (scope === undefined) throw new Error('no global scope');
  return readArticulationAtoms(
    readScopeMapViews(scope).get('articulationMap') ?? null,
    document.scaleFactor,
    scope.environment,
    document.performance.global,
  );
};

/** Render the same map body against one 100-tick note and report what the renderer performed. */
function performed(map: string): { duration: number; velocity: number } {
  const mpm = new Mpm(doc(map));
  const articulationMap = mpm
    .getPerformance(0)!
    .getGlobal()!
    .getDated()!
    .getMap('articulationMap') as unknown as ArticulationMap;

  const notes = GenericMap.createGenericMap('someMap')!;
  const note = new Element('note', NS);
  note.addAttribute(new Attribute('date', '0'));
  note.addAttribute(new Attribute('date.perf', '0'));
  note.addAttribute(new Attribute('duration.perf', '100'));
  note.addAttribute(new Attribute('velocity', '64'));
  notes.addElement(note);

  articulationMap.renderArticulationToMap_noMillisecondModifiers(notes);
  const rendered = notes.getXml().getChildElements().get(0);
  return {
    duration: parseFloat(rendered.getAttributeValue('duration.perf')!),
    velocity: parseFloat(rendered.getAttributeValue('velocity')!),
  };
}

const STYLE0 = '<style date="0.0" name.ref="A"/>';

describe('the inline duration precedence (§5.5/AD-11i/R4)', () => {
  it('is the expression registry’s own ordering, not a second copy of it', () => {
    expect([...DURATION_PRECEDENCE]).toEqual([
      'absoluteDurationChange',
      'relativeDuration',
      'absoluteDuration',
    ]);
  });

  it('lets exactly one lever fire inline, and the renderer agrees', () => {
    const present = (set: readonly string[]) => (name: string) => set.includes(name);

    expect(
      resolveDurationLever(present(['relativeDuration', 'absoluteDurationChange']), 'instruction'),
    ).toEqual(['absoluteDurationChange']);
    // 100 + 10 = 110: the ×0.5 never happens.
    expect(
      performed('<articulation date="0.0" relativeDuration="0.5" absoluteDurationChange="10"/>')
        .duration,
    ).toBe(110);

    expect(
      resolveDurationLever(present(['relativeDuration', 'absoluteDuration']), 'instruction'),
    ).toEqual(['relativeDuration']);
    // 100 × 0.5 = 50, and the absolute 600 is overwritten.
    expect(
      performed('<articulation date="0.0" absoluteDuration="600" relativeDuration="0.5"/>')
        .duration,
    ).toBe(50);
  });

  it('lets NONE of them fire when @absoluteDurationMs is present', () => {
    const present = (name: string) =>
      ['absoluteDurationMs', 'relativeDuration', 'absoluteDurationChange'].includes(name);
    expect(resolveDurationLever(present, 'instruction')).toEqual([]);
    // The tick branch is short-circuited, so the note keeps its 100 in pass one.
    expect(
      performed(
        '<articulation date="0.0" absoluteDurationMs="160" relativeDuration="0.5" absoluteDurationChange="10"/>',
      ).duration,
    ).toBe(100);
  });

  it('lets them ALL fire on a def, which is why the rule is keyed on the element', () => {
    const present = (name: string) => ['relativeDuration', 'absoluteDurationChange'].includes(name);
    expect(resolveDurationLever(present, 'def')).toEqual([
      'absoluteDurationChange',
      'relativeDuration',
    ]);
    // 100 × 0.5 = 50, then +10 = 60 — against 110 for the same pair written inline.
    expect(performed(`${STYLE0}<articulation date="0.0" name.ref="both"/>`).duration).toBe(60);
  });

  it('marks the shadowed lever inert in the reader, with a note', () => {
    const read = atomsOf(
      '<articulation date="0.0" relativeDuration="0.5" absoluteDurationChange="10"/>',
    );
    const live = effectiveAttributes(read.atoms[0]).map((a) => a.attribute);
    expect(live).toEqual(['absoluteDurationChange']);
    expect(read.notes.some((note) => note.kind === 'shadowed-lever')).toBe(true);
  });
});

describe('the velocity levers compose, unlike the duration levers', () => {
  it('chains absolute → relative → change, and the reader keeps all three live', () => {
    const map =
      '<articulation date="0.0" absoluteVelocity="80" relativeVelocity="0.5" absoluteVelocityChange="7"/>';
    // 64 → 80 → 40 → 47.
    expect(performed(map).velocity).toBe(47);
    expect(effectiveAttributes(atomsOf(map).atoms[0]).map((a) => a.attribute)).toEqual([
      'absoluteVelocity',
      'relativeVelocity',
      'absoluteVelocityChange',
    ]);
  });
});

describe('atoms compose across atoms, in map order', () => {
  it('applies two atoms at one date in sequence', () => {
    // 100 × 0.5 × 0.25 = 12.5 — not 25, and not 50.
    expect(
      performed(
        '<articulation date="0.0" relativeDuration="0.5"/>' +
          '<articulation date="0.0" relativeDuration="0.25"/>',
      ).duration,
    ).toBe(12.5);
    expect(atomsOf('<articulation date="0.0"/><articulation date="0.0"/>').atoms).toHaveLength(2);
  });
});

describe('def resolution', () => {
  it('applies the def first and the inline modifiers on its result', () => {
    // 100 × 0.5 = 50, then × 1.2 = 60.
    expect(
      performed(`${STYLE0}<articulation date="0.0" name.ref="stacc" relativeDuration="1.2"/>`)
        .duration,
    ).toBe(60);
    const atom = atomsOf(
      `${STYLE0}<articulation date="0.0" name.ref="stacc" relativeDuration="1.2"/>`,
    ).atoms[0];
    expect(atom.def).not.toBeNull();
    // Def attributes come first, because that is the order they are applied in.
    expect(atom.attributes.map((a) => `${a.site}:${a.attribute}`)).toEqual([
      'def:relativeDuration',
      'instruction:relativeDuration',
    ]);
  });

  it('does NOT drop an atom whose @name.ref cannot resolve — the inline modifiers still apply', () => {
    // The disposition opposite to §5.4's: 100 × 1.2 = 120, the missing ×0.5 simply absent.
    expect(
      performed('<articulation date="0.0" name.ref="stacc" relativeDuration="1.2"/>').duration,
    ).toBe(120);
    expect(
      performed(`${STYLE0}<articulation date="0.0" name.ref="nosuch" relativeDuration="1.2"/>`)
        .duration,
    ).toBe(120);

    const read = atomsOf('<articulation date="0.0" name.ref="stacc" relativeDuration="1.2"/>');
    expect(read.atoms[0].def).toBeNull();
    expect(read.atoms[0].nameRef).toBe('stacc');
    expect(read.notes.some((note) => note.kind === 'unresolved-def')).toBe(true);
    expect(effectiveAttributes(read.atoms[0])).toHaveLength(1);
  });
});

describe('noteid targeting (§5.5/AD-7)', () => {
  it('strips the first character unconditionally and reports the date as unknown', () => {
    const read = atomsOf(`${STYLE0}<articulation date="0.0" noteid="#n7" relativeDuration="0.5"/>`);
    expect(read.atoms[0].noteid).toBe('n7');
    expect(read.atoms[0].datePositionKnown).toBe(false);
    expect(read.notes.some((note) => note.kind === 'noteid-targeted')).toBe(true);
  });

  it('strips it even when there is no # to strip, which is how "n0" addresses "0"', () => {
    expect(atomsOf('<articulation date="0.0" noteid="n0"/>').atoms[0].noteid).toBe('0');
  });

  it('leaves a date-targeted atom’s position known', () => {
    const atom = atomsOf('<articulation date="720.0" relativeDuration="0.5"/>').atoms[0];
    expect(atom.datePositionKnown).toBe(true);
    expect(atom.dateTicks).toBe(720);
  });
});

describe('the neutrals are per attribute, not one constant', () => {
  it('guards ratios at 1 and changes at 0, and replacements have none', () => {
    expect(ARTICULATION_NEUTRALS.relativeDuration).toBe(1);
    expect(ARTICULATION_NEUTRALS.relativeVelocity).toBe(1);
    expect(ARTICULATION_NEUTRALS.absoluteVelocityChange).toBe(0);
    expect(ARTICULATION_NEUTRALS.absoluteDuration).toBeNull();
    expect(ARTICULATION_NEUTRALS.absoluteVelocity).toBeNull();
  });

  it('treats an authored 1.0 ratio as neutral, and the renderer agrees', () => {
    expect(performed('<articulation date="0.0" relativeDuration="1.0"/>').duration).toBe(100);
    expect(
      effectiveAttributes(atomsOf('<articulation date="0.0" relativeDuration="1.0"/>').atoms[0]),
    ).toHaveLength(0);
  });

  it('treats relativeVelocity="0" as a SILENCED note, not as an absent attribute', () => {
    expect(performed('<articulation date="0.0" relativeVelocity="0.0"/>').velocity).toBe(0);
    const live = effectiveAttributes(
      atomsOf('<articulation date="0.0" relativeVelocity="0.0"/>').atoms[0],
    );
    expect(live.map((a) => a.attribute)).toEqual(['relativeVelocity']);
  });
});

describe('the registry rows this reader resolves liveness for', () => {
  it('carries a row for every attribute the reader reads', () => {
    for (const attribute of [
      'relativeDuration',
      'relativeVelocity',
      'absoluteDurationChange',
      'absoluteDurationChangeMs',
      'absoluteDelay',
      'absoluteDelayMs',
      'absoluteVelocityChange',
      'absoluteDuration',
      'absoluteDurationMs',
      'absoluteVelocity',
      'detuneCents',
      'detuneHz',
    ]) {
      expect(
        comparisonRowFor(
          `articulation/articulation@${attribute}` as 'articulation/articulation@relativeDuration',
        ).attribute,
      ).toBe(attribute);
    }
  });

  it('files the two detune attributes as inert (R14), so they carry no distance', () => {
    expect(comparisonRowFor('articulation/articulation@detuneCents').role).toBe('inert');
    expect(comparisonRowFor('articulation/articulation@detuneHz').role).toBe('inert');
  });

  it('marks the tick-valued rows ppqSensitive and the millisecond ones not', () => {
    expect(comparisonRowFor('articulation/articulation@absoluteDelay').ppqSensitive).toBe(true);
    expect(comparisonRowFor('articulation/articulation@absoluteDelayMs').ppqSensitive).toBe(false);
  });
});

/**
 * The default-articulation step function — §5.5 as amended by AD-37.1/AD-37.2.
 *
 * Every claim is checked twice: once against the reader, once against what the renderer
 * actually performs on a row of notes. The retroactive window is the whole point of the
 * suite, and it is the one behaviour a careful implementer would have got wrong.
 */
describe('the default articulation step function (AD-37.1/AD-37.2)', () => {
  const defaultsOf = (map: string): DefaultArticulationCurve => {
    const pair: ComparisonPair = readComparisonPair({ a: doc(map) });
    const document: ComparisonDocument = pair.a;
    const scope = document.scopes.find((candidate) => candidate.scope === 'global');
    if (scope === undefined) throw new Error('no global scope');
    return readDefaultArticulation(
      readScopeMapViews(scope).get('articulationMap') ?? null,
      document.scaleFactor,
      scope.environment,
      document.performance.global,
    );
  };

  /** What the renderer performs for notes at these dates, each 100 ticks long. */
  function performedAt(map: string, dates: readonly number[]): number[] {
    const mpm = new Mpm(doc(map));
    const articulationMap = mpm
      .getPerformance(0)!
      .getGlobal()!
      .getDated()!
      .getMap('articulationMap') as unknown as ArticulationMap;

    const notes = GenericMap.createGenericMap('someMap')!;
    for (const date of dates) {
      const note = new Element('note', NS);
      note.addAttribute(new Attribute('date', String(date)));
      note.addAttribute(new Attribute('date.perf', String(date)));
      note.addAttribute(new Attribute('duration.perf', '100'));
      note.addAttribute(new Attribute('velocity', '64'));
      notes.addElement(note);
    }
    articulationMap.renderArticulationToMap_noMillisecondModifiers(notes);
    return notes
      .getXml()
      .getChildElements()
      .toArray()
      .map((note) => parseFloat(note.getAttributeValue('duration.perf')!));
  }

  const DATES = [0, 360, 720, 1080];

  it('reaches BACKWARDS: the first switch’s default governs before its own date', () => {
    const map = '<style date="720.0" name.ref="A" defaultArticulation="stacc"/>';
    // The renderer first — this is the measurement the ruling rests on.
    expect(performedAt(map, DATES)).toEqual([50, 50, 50, 50]);

    const curve = defaultsOf(map);
    expect(curve.firstSwitchTicks).toBe(720);
    expect(curve.steps[0].startTicks).toBe(0);
    expect(defaultArticulationAt(curve, 0)).not.toBeNull();
    expect(curve.notes.some((note) => note.kind === 'retroactive')).toBe(true);
  });

  it('reaches back over the whole map, not over a window', () => {
    const map = '<style date="1440.0" name.ref="A" defaultArticulation="stacc"/>';
    expect(performedAt(map, [0, 720, 1440])).toEqual([50, 50, 50]);
    expect(defaultArticulationAt(defaultsOf(map), 0)).not.toBeNull();
  });

  it('steps at every later switch, in switch order', () => {
    const map =
      '<style date="0.0" name.ref="A" defaultArticulation="ten"/>' +
      '<style date="720.0" name.ref="A" defaultArticulation="stacc"/>';
    expect(performedAt(map, DATES)).toEqual([120, 120, 50, 50]);
    const curve = defaultsOf(map);
    expect(curve.steps).toHaveLength(2);
    expect(curve.steps[0].name).toBe('ten');
    expect(curve.steps[1].startTicks).toBe(720);
  });

  it('CANCELS on a switch with no @defaultArticulation', () => {
    const map =
      '<style date="0.0" name.ref="A" defaultArticulation="stacc"/>' +
      '<style date="720.0" name.ref="A"/>';
    expect(performedAt(map, DATES)).toEqual([50, 50, 100, 100]);
    const curve = defaultsOf(map);
    expect(defaultArticulationAt(curve, 720)).toBeNull();
    expect(defaultArticulationStepAt(curve, 720)?.cancelCause).toBe('no-attribute');
  });

  it('CANCELS on a switch naming an unknown def — the row §5.5 was missing', () => {
    const map =
      '<style date="0.0" name.ref="A" defaultArticulation="stacc"/>' +
      '<style date="720.0" name.ref="A" defaultArticulation="nosuch"/>';
    expect(performedAt(map, DATES)).toEqual([50, 50, 100, 100]);
    const curve = defaultsOf(map);
    expect(defaultArticulationAt(curve, 720)).toBeNull();
    expect(defaultArticulationStepAt(curve, 720)?.cancelCause).toBe('unknown-def');
  });

  it('CONTINUES the previous default on an unresolvable STYLE name', () => {
    // The disposition that looks identical to the one above and does the opposite.
    const map =
      '<style date="0.0" name.ref="A" defaultArticulation="stacc"/>' +
      '<style date="720.0" name.ref="NOSTYLE" defaultArticulation="ten"/>';
    expect(performedAt(map, DATES)).toEqual([50, 50, 50, 50]);
    const curve = defaultsOf(map);
    expect(curve.steps).toHaveLength(1);
    expect(defaultArticulationAt(curve, 1080)?.getAttributeValue('name')).toBe('stacc');
    expect(curve.notes.some((note) => note.kind === 'unresolved-style')).toBe(true);
  });

  it('is empty when no switch survives, and defaults nothing', () => {
    const map = '<style date="0.0" name.ref="NOSTYLE" defaultArticulation="stacc"/>';
    expect(performedAt(map, DATES)).toEqual([100, 100, 100, 100]);
    const curve = defaultsOf(map);
    expect(curve.steps).toHaveLength(0);
    expect(curve.firstSwitchTicks).toBeNull();
    expect(defaultArticulationAt(curve, 0)).toBeNull();
  });

  it('is shadowed by an atom, never added to it (AD-11ii/R5)', () => {
    const map =
      '<style date="0.0" name.ref="A" defaultArticulation="stacc"/>' +
      '<articulation date="360.0" name.ref="ten"/>';
    // 120, not 60: the note at 360 gets the atom and ONLY the atom.
    expect(performedAt(map, DATES)).toEqual([50, 120, 50, 50]);
  });
});

/**
 * The composed effective modifier and `d_articulation` — §5.5 as amended by AD-37.3/AD-37.4.
 *
 * The load-bearing test is AD-37.4's own encoding-invariance obligation: two stacked
 * `relativeDuration` atoms against one atom carrying their product must be distance 0. It is
 * checked against the RENDERER first — the two documents must actually perform the same note —
 * so that the invariance is a fact about the performance and not about my algebra.
 */
describe('the composed effective modifier (AD-37.3/AD-37.4)', () => {
  const anchorsFor = (map: string) => anchorsOf(atomsOf(map));
  const distanceOf = (a: string, b: string, endQuarters = 8) => {
    const pair = readComparisonPair({
      a: doc(a),
      b: doc(b),
      window: { start: 0, end: endQuarters },
    });
    const read = (side: 'a' | 'b') => {
      const document = pair[side];
      const scope = document.scopes.find((candidate) => candidate.scope === 'global');
      if (scope === undefined) throw new Error('no global scope');
      return readArticulationAtoms(
        readScopeMapViews(scope).get('articulationMap') ?? null,
        document.scaleFactor,
        scope.environment,
        document.performance.global,
      );
    };
    return articulationDistance(read('a'), read('b'), pair.window, pair.ppq.lcm);
  };

  it('composes two atoms at one anchor into one affine map', () => {
    const anchors = anchorsFor(
      '<articulation date="0.0" relativeDuration="0.5"/>' +
        '<articulation date="0.0" relativeDuration="0.25"/>',
    );
    expect(anchors).toHaveLength(1);
    expect(anchors[0].atomCount).toBe(2);
    expect(anchors[0].modifier.duration).toEqual({
      replacement: null,
      factor: 0.125,
      offset: 0,
    });
  });

  it('keeps a note id apart from the tick that spells the same string', () => {
    /**
     * A closed oracle gap, found by a negative control.
     *
     * The anchor key is `date:<ticks>` or `id:<noteid>`, and the two prefixes are the only
     * thing stopping the namespaces from colliding. Measured: dropping them — grouping on
     * the bare `String(dateTicks)` and the bare id — left all 6081 tests green, because no
     * case in the tree ever paired a date-anchored atom with an id-anchored one whose id
     * spells the same number.
     *
     * The module note is explicit that the two kinds must NOT merge: deciding which note a
     * date-anchored atom reaches needs an MSM, which is why an id-anchored anchor carries
     * `datePositionKnown: false`. Merging them would compose two modifiers the renderer
     * applies to different notes into one, and report one anchor where there are two.
     */
    const anchors = anchorsFor(
      '<articulation date="0.0" relativeDuration="0.5"/>' +
        '<articulation date="0.0" noteid="#0" relativeVelocity="2.0"/>',
    );

    // One projection rather than eight indexed reads: it says the whole shape at once, and
    // it keeps this file off `noUncheckedIndexedAccess`'s books in `tests/`, which is a
    // one-way ratchet.
    expect(
      anchors.map((anchor) => ({
        id: anchor.id,
        atomCount: anchor.atomCount,
        // The id-anchored one cannot be placed without an MSM; the date-anchored one can.
        datePositionKnown: anchor.datePositionKnown,
        // …and neither one absorbed the other's family.
        duration: anchor.modifier.duration.factor,
        velocity: anchor.modifier.velocity.factor,
      })),
    ).toEqual([
      { id: null, atomCount: 1, datePositionKnown: true, duration: 0.5, velocity: 1 },
      { id: '0', atomCount: 1, datePositionKnown: false, duration: 1, velocity: 2 },
    ]);
  });

  it('is ENCODING-INVARIANT: stacked atoms against their product are distance 0', () => {
    const stacked =
      '<articulation date="0.0" relativeDuration="0.5"/>' +
      '<articulation date="0.0" relativeDuration="0.25"/>';
    const product = '<articulation date="0.0" relativeDuration="0.125"/>';
    // The renderer first: both really do perform the same note.
    expect(performed(stacked).duration).toBe(performed(product).duration);
    expect(distanceOf(stacked, product).distance).toBe(0);
  });

  it('carries an earlier offset through a later factor, as the renderer does', () => {
    // 100 + 10 = 110, then × 0.5 = 55.
    const map =
      '<articulation date="0.0" absoluteDurationChange="10"/>' +
      '<articulation date="0.0" relativeDuration="0.5"/>';
    expect(performed(map).duration).toBe(55);
    expect(anchorsFor(map)[0].modifier.duration).toEqual({
      replacement: null,
      factor: 0.5,
      offset: 5,
    });
  });

  it('lets a later replacement wipe everything before it', () => {
    const map =
      '<articulation date="0.0" relativeDuration="0.5"/>' +
      '<articulation date="0.0" absoluteDuration="600"/>';
    expect(performed(map).duration).toBe(600);
    expect(anchorsFor(map)[0].modifier.duration.replacement).toBe(600);
    expect(anchorsFor(map)[0].modifier.duration.factor).toBe(1);
  });

  it('composes the velocity chain into one affine map', () => {
    const map =
      '<articulation date="0.0" absoluteVelocity="80" relativeVelocity="0.5" absoluteVelocityChange="7"/>';
    expect(performed(map).velocity).toBe(47);
    expect(anchorsFor(map)[0].modifier.velocity).toEqual({
      replacement: 80,
      factor: 0.5,
      offset: 7,
    });
  });

  it('keeps date anchors and id anchors apart, because merging them needs an MSM', () => {
    const anchors = anchorsFor(
      '<articulation date="0.0" relativeDuration="0.5"/>' +
        '<articulation date="0.0" noteid="#n0" relativeDuration="0.5"/>',
    );
    expect(anchors).toHaveLength(2);
    expect(anchors.filter((anchor) => anchor.datePositionKnown)).toHaveLength(1);
  });
});

describe('d_articulation', () => {
  const distanceOf = (a: string, b: string, endQuarters = 8) => {
    const pair = readComparisonPair({
      a: doc(a),
      b: doc(b),
      window: { start: 0, end: endQuarters },
    });
    const read = (side: 'a' | 'b') => {
      const document = pair[side];
      const scope = document.scopes.find((candidate) => candidate.scope === 'global');
      if (scope === undefined) throw new Error('no global scope');
      return readArticulationAtoms(
        readScopeMapViews(scope).get('articulationMap') ?? null,
        document.scaleFactor,
        scope.environment,
        document.performance.global,
      );
    };
    return articulationDistance(read('a'), read('b'), pair.window, pair.ppq.lcm);
  };

  const STACC = '<articulation date="0.0" relativeDuration="0.5"/>';

  it('is exactly 0 against itself (P-C1)', () => {
    expect(distanceOf(STACC, STACC).distance).toBe(0);
  });

  /**
   * W3 CAPITAL-6: the anchor sort is CODE-UNIT order, never `localeCompare`.
   *
   * The sibling module bans it by name for the report (§9.5) and the ban binds harder here,
   * because this order is the aligner's input: with `localeCompare`, two documents with two
   * anchors each at one date and disjoint id sets scored `d_articulation = 0` under `en_US` and
   * `13.469` under `sv_SE`, with different report hashes.
   *
   * Pinned at the ORDER rather than by running the engine twice under two locales, which no
   * in-process test can do — ICU's collator is fixed at startup. The two id pairs below are
   * chosen so that code-unit order and collation disagree in every common locale ('B' before
   * 'a' by code unit, after it by collation) or in the Nordic ones ('z' before 'ä' by code
   * unit); the assertions on `localeCompare` itself are there so that a host whose ICU ever
   * agreed would say so rather than let this test go quietly vacuous.
   */
  it('sorts anchors by CODE UNIT, so no locale can move the distance (§9.5)', () => {
    const anchored = (id: string, factor: string) =>
      `<articulation date="0.0" noteid="#${id}" relativeDuration="${factor}"/>`;
    const idsOf = (map: string) => anchorsOf(atomsOf(map)).map((anchor) => anchor.id);

    expect(idsOf(anchored('a1', '0.5') + anchored('B1', '2.0'))).toEqual(['B1', 'a1']);
    expect(idsOf(anchored('ä1', '0.5') + anchored('z1', '2.0'))).toEqual(['z1', 'ä1']);
    // Both orderings are the OPPOSITE of what this host's collator would produce, which is what
    // makes the two assertions above falsifying rather than incidental.
    expect('a'.localeCompare('B')).toBeLessThan(0);
    expect('B' < 'a').toBe(true);
  });

  it('is symmetric (P-C2)', () => {
    const other = '<articulation date="720.0" relativeVelocity="1.4"/>';
    expect(Object.is(distanceOf(STACC, other).distance, distanceOf(other, STACC).distance)).toBe(
      true,
    );
  });

  it('prices a ratio difference in its own space', () => {
    // |ln 0.5 − ln 0.25| = ln 2, over the ln(1.10) JND.
    const half = '<articulation date="0.0" relativeDuration="0.5"/>';
    const quarter = '<articulation date="0.0" relativeDuration="0.25"/>';
    expect(distanceOf(half, quarter).distance).toBeCloseTo(Math.LN2 / Math.log(1.1), 9);
  });

  it('prices a REPLACEMENT present on one side only at δ_row, never at 0 (AD-2/M1c)', () => {
    const present = '<articulation date="0.0" absoluteVelocity="90"/>';
    const absent = '<articulation date="0.0" relativeVelocity="1.0"/>';
    const row = comparisonRowFor('articulation/articulation@absoluteVelocity');
    expect(distanceOf(present, absent).distance).toBeCloseTo(row.delta, 9);
    // And M1c's zero-set violation is closed: the two present values differ by a real amount.
    const other = '<articulation date="0.0" absoluteVelocity="2"/>';
    expect(distanceOf(present, other).distance).toBeGreaterThan(0);
  });

  it('drops an unmatched anchor at its deviation from neutral', () => {
    const one = STACC;
    const none = '<style date="0.0" name.ref="A"/>';
    expect(distanceOf(one, none).distance).toBeCloseTo(Math.abs(Math.log(0.5)) / Math.log(1.1), 9);
  });

  it('reports an inert difference without pricing it (R14/R9b)', () => {
    const a = '<articulation date="0.0" detuneCents="14"/>';
    const b = '<articulation date="0.0" detuneCents="-9"/>';
    const result = distanceOf(a, b);
    expect(result.distance).toBe(0);
    expect(result.inertFindings).toEqual([
      { attribute: 'detuneCents', dateTicks: 0, a: 14, b: -9 },
    ]);
  });

  it('matches by id across a date displacement, and says the pins held', () => {
    const a = '<articulation date="0.0" noteid="#n1" relativeDuration="0.5"/>';
    const b = '<articulation date="2880.0" noteid="#n1" relativeDuration="0.5"/>';
    const result = distanceOf(a, b);
    expect(result.matched).toBe(1);
    expect(result.pinsHonoured).toBe(true);
    // Same modifier, so all that is left is the date term the aligner charges.
    expect(result.distance).toBeGreaterThan(0);
  });
});

/**
 * AD-51.2's atom placement, at the dimension level.
 *
 * The aggregation's table cannot close on a scalar: an articulation's mass belongs in the
 * column of the segment its note falls in. These pin that the placement is a decomposition of
 * the SAME optimum — nothing lost, nothing invented — and that the id-anchored case is the
 * admission AD-39.1 requires it to be rather than a silent guess at a date.
 */
describe('articulation atom placement (AD-51.2)', () => {
  const distanceOf = (a: string, b: string, endQuarters = 8) => {
    const pair = readComparisonPair({
      a: doc(a),
      b: doc(b),
      window: { start: 0, end: endQuarters },
    });
    const read = (side: 'a' | 'b') => {
      const document = pair[side];
      const scope = document.scopes.find((candidate) => candidate.scope === 'global');
      if (scope === undefined) throw new Error('no global scope');
      return readArticulationAtoms(
        readScopeMapViews(scope).get('articulationMap') ?? null,
        document.scaleFactor,
        scope.environment,
        document.performance.global,
      );
    };
    return articulationDistance(read('a'), read('b'), pair.window, pair.ppq.lcm);
  };

  it('decomposes the distance without losing or inventing mass', () => {
    const a =
      '<articulation date="0.0" relativeDuration="0.5"/>' +
      '<articulation date="1440.0" relativeVelocity="1.4"/>';
    const b = '<articulation date="720.0" relativeDuration="0.25"/>';
    const result = distanceOf(a, b);
    const mass = result.atoms.reduce((sum, atom) => sum + atom.mass, 0);
    expect(mass).toBeCloseTo(result.distance, 9);
    expect(result.atoms).toHaveLength(result.matched + result.unmatchedA + result.unmatchedB);
  });

  it('places a matched pair over the span between the two dates (AD-7)', () => {
    const half = '<articulation date="0.0" relativeDuration="0.5"/>';
    // 45 ticks is 1/16 quarter, i.e. exactly one λ_date JND — near enough that matching
    // beats dropping both, which at a whole quarter apart it does not.
    const quarter = '<articulation date="45.0" relativeDuration="0.25"/>';
    const result = distanceOf(half, quarter);
    expect(result.matched).toBe(1);
    expect(result.atoms).toHaveLength(1);
    expect(result.atoms[0].startTicks).toBe(0);
    expect(result.atoms[0].endTicks).toBe(45);
  });

  it('places an unmatched atom at its own date as a point mass', () => {
    const result = distanceOf('<articulation date="1440.0" relativeDuration="0.5"/>', '');
    expect(result.atoms).toHaveLength(1);
    expect(result.atoms[0].kind).toBe('unmatched-a');
    expect(result.atoms[0].startTicks).toBe(1440);
    expect(result.atoms[0].endTicks).toBe(1440);
    expect(result.atoms[0].datePositionKnown).toBe(true);
  });

  it('spreads an id-anchored atom over the window and reports the position as unknown', () => {
    const a = '<articulation date="0.0" noteid="#n1" relativeDuration="0.5"/>';
    const b = '<articulation date="0.0" noteid="#n1" relativeDuration="0.25"/>';
    const result = distanceOf(a, b, 8);
    expect(result.datePositionKnown).toBe(false);
    expect(result.atoms).toHaveLength(1);
    expect(result.atoms[0].datePositionKnown).toBe(false);
    // Window in quarters × ppq: the atom covers the whole compared interval.
    expect(result.atoms[0].startTicks).toBe(0);
    expect(result.atoms[0].endTicks).toBe(8 * 720);
    expect(result.atoms[0].mass).toBeCloseTo(result.distance, 12);
  });

  it('reports datePositionKnown true when every anchor carries a date', () => {
    expect(
      distanceOf('<articulation date="0.0" relativeDuration="0.5"/>', '').datePositionKnown,
    ).toBe(true);
  });
});

/**
 * The default step function as the SECOND component of `d_articulation` (AD-55.1).
 *
 * `articulationDefault.ts` was read, ruled about and tested for a whole wave without reaching
 * any evaluator: `articulationDistance` consumed the atoms alone, so three documents differing
 * only in their `@defaultArticulation` compared at `D = 0` while the renderer performed one of
 * them at half duration throughout. The suite above pins the STEP FUNCTION; this one pins that
 * the step function reaches the number, which is a different claim and the one that was false.
 *
 * The renderer figures are the same ones the suite above executes — 50/50/100/100 for the
 * canceller, 50/50/50/50 for the continuer, 100 throughout for a document with no default —
 * so what is checked here is that three performances a listener could tell apart do not
 * compare at zero.
 */
describe('the default step function reaches d_articulation (AD-55.1)', () => {
  const window = { start: 0, end: 4 } as const;
  const NEPERS_PER_JND = comparisonRowFor('articulation/articulation@relativeDuration').jnd;

  const styled = (styles: string, map: string) =>
    `<mpm xmlns="${NS}"><performance name="p" pulsesPerQuarter="720">` +
    `<global><header>${styles}</header><dated><articulationMap>${map}` +
    '</articulationMap></dated></global></performance></mpm>';

  const withDefault = (secondStyle: string) =>
    styled(STYLES, `<style date="0.0" name.ref="A" defaultArticulation="stacc"/>${secondStyle}`);

  // AD-37.2's three dispositions, as three documents that differ in nothing else.
  const CANCEL = withDefault('<style date="720.0" name.ref="A"/>');
  const CONTINUE = withDefault('<style date="720.0" name.ref="MISSING"/>');
  const NODEFAULT = styled(
    STYLES,
    '<style date="0.0" name.ref="A"/><style date="720.0" name.ref="A"/>',
  );

  const distance = (a: string, b: string) =>
    compareInterior({
      a,
      b,
      window,
      weights: defaultWeights(),
      jnd: {},
      plausibleRange: {},
      invariance: Object.fromEntries(
        COMPARISON_DIMENSIONS.map((dimension) => [dimension, 'none']),
      ) as Record<ComparisonDimension, InvarianceMode>,
      lambdaDate: DEFAULT_LAMBDA_DATE,
    });

  it('separates the canceller, the continuer and the document with no default', () => {
    const cancelContinue = distance(CANCEL, CONTINUE);
    const cancelNone = distance(CANCEL, NODEFAULT);
    const continueNone = distance(CONTINUE, NODEFAULT);
    for (const report of [cancelContinue, cancelNone, continueNone])
      expect(report.dimensions.articulation.distance).toBeGreaterThan(0);

    // The step function is `×0.5` against `×1.0`, i.e. |ln 2| nepers sustained. CANCEL and
    // NODEFAULT differ over [0, 1) quarter; CANCEL and CONTINUE over [1, 4); CONTINUE and
    // NODEFAULT over the whole window — and the three lengths add up, which is what makes
    // this a step reading rather than three unrelated numbers.
    const perQuarter = Math.abs(Math.log(0.5)) / NEPERS_PER_JND;
    expect(cancelNone.dimensions.articulation.distance).toBeCloseTo(perQuarter * 1, 9);
    expect(cancelContinue.dimensions.articulation.distance).toBeCloseTo(perQuarter * 3, 9);
    expect(continueNone.dimensions.articulation.distance).toBeCloseTo(perQuarter * 4, 9);
  });

  it('places the step mass as CELLS, so AD-19’s table still closes', () => {
    const report = distance(CANCEL, NODEFAULT);
    const row = report.table.dimensions.indexOf('articulation');
    expect(report.table.rowSums[row]).toBeGreaterThan(0);
    expect(report.table.rowSums[row]).toBeCloseTo(report.dimensions.articulation.distance, 9);
    expect(report.table.residual).toBeLessThanOrEqual(1e-12 * report.aggregate.distance);
    // The atoms are the alignment's and stay at 0 here: neither document carries an atom, so
    // the whole of the distance is the step function's.
    expect(report.dimensions.articulation.events.mass).toBe(0);
  });

  it('prices the two units the Albert pair’s defaults are written in, separately (§5.5)', () => {
    // `nonlegato` is `absoluteDurationChangeMs="-96"` in one performance and
    // `absoluteDurationChange="-60"` (ticks) in the other. They are different ROWS with
    // different units, and the sum is what the pair's step component is made of.
    const nonlegato = (attribute: string) =>
      '<articulationStyles><styleDef name="A">' +
      `<articulationDef name="nonlegato" ${attribute}/>` +
      '</styleDef></articulationStyles>';
    const map = '<style date="0.0" name.ref="A" defaultArticulation="nonlegato"/>';
    const report = distance(
      styled(nonlegato('absoluteDurationChangeMs="-96.0"'), map),
      styled(nonlegato('absoluteDurationChange="-60.0"'), map),
    );
    const msJnd = comparisonRowFor('articulation/articulation@absoluteDurationChangeMs').jnd;
    const tickJnd = comparisonRowFor('articulation/articulation@absoluteDurationChange').jnd;
    // 96 ms on one row, 60/720 quarter on the other, sustained over the four-quarter window.
    expect(report.dimensions.articulation.distance).toBeCloseTo(
      4 * (96 / msJnd + 60 / 720 / tickJnd),
      9,
    );
  });
});
