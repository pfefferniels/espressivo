/**
 * The MPM object model as a *writing* API — the sibling of `readingSurface.test.ts`, and for
 * the same reason.
 *
 * Every import is from `src/index.js` deliberately. A deep import would pass while the public
 * surface was broken, which is precisely what had happened to `<metadata>`: the container class
 * was exported and all three of the children its every method takes and answers were not, so
 * `Mpm.addMetadata` could be named from outside the package and not called.
 */
import { describe, it, expect } from 'vitest';
import {
  ArticulationMap,
  AsynchronyMap,
  Author,
  Comment,
  DynamicsMap,
  MetricalAccentuationMap,
  MovementMap,
  Mpm,
  OrnamentationMap,
  RelatedResource,
  RubatoMap,
  TempoMap,
  type Normalized,
} from '../../src/index.js';

/** `okValue` in miniature — the metadata factories answer `Result`, and a failure should say so. */
function value<T>(r: { ok: boolean; value?: T; error?: unknown }): T {
  if (!r.ok || r.value === undefined)
    throw new Error(`expected a value, got ${JSON.stringify(r.error)}`);
  return r.value;
}

describe('the writing surface', () => {
  it('builds a <metadata> from the root import alone', () => {
    const mpm = new Mpm();
    const written = mpm.addMetadata(
      value(Author.fromName('Jane Doe', 1, null)),
      value(Comment.fromText('based on a violin treatise from 1678', null)),
      [value(RelatedResource.fromUri('score.mei', 'mei'))],
    );

    expect(written).toBe(true);

    const metadata = mpm.getMetadata();
    expect(metadata?.getAuthors().map((a) => a.getName())).toEqual(['Jane Doe']);
    expect(metadata?.getComments()).toHaveLength(1);
    expect(metadata?.getRelatedResources().map((r) => r.getUri())).toEqual(['score.mei']);
  });

  it('reads an instruction back as the options that wrote it', () => {
    const map = TempoMap.createTempoMap();
    const index = map.addTempo({ date: 0, bpm: 120, beatLength: 0.25, id: 't1' });

    expect(map.getTempoOptionsOf(index)).toEqual({
      date: 0,
      bpm: 120,
      transitionTo: undefined,
      meanTempoAt: undefined,
      beatLength: 0.25,
      id: 't1',
    });

    map.updateTempoAt(index, { bpm: 90 });
    expect(map.getTempoOptionsOf(index)?.bpm).toBe(90);
  });

  /**
   * All eight maps answer the same three questions, from the root import: what does this
   * element say, change one thing about it, and say it again.
   *
   * A table rather than eight blocks, because the point is that the surface is uniform. Each
   * row writes one instruction, patches one field, and reads it back — so a map whose
   * `get<X>OptionsOf` and `update<X>At` disagree about an attribute name fails here even
   * though both compile.
   */
  it.each([
    {
      map: 'tempo',
      write: () => {
        const m = TempoMap.createTempoMap();
        const i = m.addTempo({ date: 0, bpm: 120, beatLength: 0.25 });
        m.updateTempoAt(i, { bpm: 90 });
        return m.getTempoOptionsOf(i)?.bpm;
      },
      expected: 90,
    },
    {
      map: 'dynamics',
      write: () => {
        const m = DynamicsMap.createDynamicsMap();
        const i = m.addDynamics({ date: 0, volume: 64 });
        m.updateDynamicsAt(i, { volume: 80 });
        return m.getDynamicsOptionsOf(i)?.volume;
      },
      expected: 80,
    },
    {
      map: 'movement',
      write: () => {
        const m = MovementMap.createMovementMap();
        // `Normalized` is a compile-time brand with no runtime converter (RULE U2), so a
        // literal reaches it by assertion or not at all.
        const i = m.addMovement({ date: 0, position: 0 as Normalized });
        m.updateMovementAt(i, { curvature: 0.25 });
        return m.getMovementOptionsOf(i)?.curvature;
      },
      expected: 0.25,
    },
    {
      map: 'rubato',
      write: () => {
        const m = RubatoMap.createRubatoMap();
        const i = m.addRubato({ date: 0, frameLength: 720 });
        m.updateRubatoAt(i, { intensity: 0.7 });
        return m.getRubatoOptionsOf(i)?.intensity;
      },
      expected: 0.7,
    },
    {
      map: 'articulation',
      write: () => {
        const m = ArticulationMap.createArticulationMap();
        const i = m.addArticulation({ date: 0, nameRef: 'legato' });
        // One of the nine modifiers the write half did not carry until now.
        m.updateArticulationAt(i, { relativeVelocity: 1.4 });
        return m.getArticulationOptionsOf(i)?.relativeVelocity;
      },
      expected: 1.4,
    },
    {
      map: 'ornament',
      write: () => {
        const m = OrnamentationMap.createOrnamentationMap();
        const i = m.addOrnamentV3({ date: 0, nameRef: 'roll' });
        m.updateOrnamentAt(i, { scale: 0.5 });
        return m.getOrnamentOptionsOf(i)?.scale;
      },
      expected: 0.5,
    },
    {
      map: 'accentuationPattern',
      write: () => {
        const m = MetricalAccentuationMap.createMetricalAccentuationMap();
        const i = m.addAccentuationPattern({ date: 0, accentuationPatternDefName: 'metre', scale: 1 });
        m.updateAccentuationPatternAt(i, { scale: 2 });
        return m.getAccentuationPatternOptionsOf(i)?.scale;
      },
      expected: 2,
    },
    {
      map: 'asynchrony',
      write: () => {
        const m = AsynchronyMap.createAsynchronyMap();
        const i = m.addAsynchrony({ date: 0, millisecondsOffset: -12 });
        m.updateAsynchronyAt(i, { millisecondsOffset: -20 });
        return m.getAsynchronyOptionsOf(i)?.millisecondsOffset;
      },
      expected: -20,
    },
  ])('$map: writes, patches and reads back through the root import', ({ write, expected }) => {
    expect(write()).toBe(expected);
  });
});
