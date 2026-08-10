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
import { comparisonRowFor } from '../../src/comparison/registry.js';

const NS = 'http://www.cemfi.de/mpm/ns/1.0';

const STYLES =
  '<articulationStyles><styleDef name="A">' +
  '<articulationDef name="stacc" relativeDuration="0.5"/>' +
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
