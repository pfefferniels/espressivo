import { describe, it, expect } from 'vitest';
import { silenceConsoleError } from '../../support/console.js';
import { okValue } from '../../support/result.js';
import { Mpm } from '../../../src/mpm/Mpm.js';
import { Msm } from '../../../src/msm/Msm.js';
import { Performance } from '../../../src/mpm/elements/Performance.js';
import { Part } from '../../../src/mpm/elements/Part.js';
import { TempoMap } from '../../../src/mpm/elements/maps/TempoMap.js';
import { MovementMap } from '../../../src/mpm/elements/maps/MovementMap.js';
import {
  movementSegment,
  positionAt,
  resolveMovement,
  type Movement,
} from '../../../src/mpm/elements/maps/data/movement.js';
import { Element, Attribute } from '../../../src/xml/XomTypes.js';
import {
  DEFAULT_MOVEMENT_SAMPLE_MAX_STEP,
  type RenderContext,
  type RenderOptions,
} from '../../../src/mpm/RenderOptions.js';
import type { Normalized } from '../../../src/units.js';

/**
 * Brand a plain literal as {@link Normalized} (ARCHITECTURE.md §7). RULE U2 forbids converter
 * functions in `src/`, where one would emit JavaScript and cost the brands their zero-line
 * emitted-JS proof; a test-local one emits nothing into `dist/`.
 */
const norm = (x: number): Normalized => x as Normalized;

/** A throwaway render context, as `Performance.perform` would build it. */
const ctx = (options: RenderOptions): RenderContext => ({ options, streamOrdinal: 0 });

/**
 * A resolved {@link Movement} built by hand, for the Bézier tests that take one directly.
 *
 * It goes through the real {@link resolveMovement}, so the arm choice and the defaults under
 * test are the reader's rather than a second implementation of them. `endDate` defaults to
 * `Number.MAX_VALUE`, which is what `GenericMap.nextDateOfType` answers for a last
 * instruction.
 */
function mov(o: {
  startDate?: number;
  endDate?: number;
  position?: number;
  transitionTo?: number | null;
  curvature?: number | null;
  protraction?: number | null;
  controller?: string | null;
}): Movement {
  return resolveMovement({
    startDate: o.startDate ?? 0,
    endDate: o.endDate ?? Number.MAX_VALUE,
    position: norm(o.position ?? 0.0),
    transitionTo:
      o.transitionTo === undefined || o.transitionTo === null ? null : norm(o.transitionTo),
    curvature: o.curvature ?? null,
    protraction: o.protraction ?? null,
    controller: o.controller ?? null,
  });
}

describe('MovementMap', () => {
  describe('createMovementMap', () => {
    it('should create an empty movement map', () => {
      const map = MovementMap.createMovementMap();
      expect(map).not.toBeNull();
      expect(map!.getType()).toBe('movementMap');
    });

    it('should start with size 0', () => {
      const map = MovementMap.createMovementMap()!;
      expect(map.size()).toBe(0);
      expect(map.isEmpty()).toBe(true);
    });

    it('should have an XML element', () => {
      const map = MovementMap.createMovementMap()!;
      expect(map.getXml()).not.toBeNull();
      expect(map.getXml()!.getLocalName()).toBe('movementMap');
    });
  });

  describe('addMovement', () => {
    it('should add a movement instruction with all parameters', () => {
      const map = MovementMap.createMovementMap()!;
      const index = map.addMovement({
        date: 0,
        controller: 'sustain',
        position: norm(0),
        transitionTo: norm(1),
        id: 'mov-1',
      });
      expect(index).toBeGreaterThanOrEqual(0);
      expect(map.size()).toBe(1);
    });

    it('should store attributes correctly', () => {
      const map = MovementMap.createMovementMap()!;
      const index = map.addMovement({
        date: 0,
        controller: 'sustain',
        position: norm(0.5),
        transitionTo: norm(1.0),
        id: 'mov-1',
      });
      const elem = map.getElement(index)!;

      expect(elem.getAttributeValue('date')).toBe('0');
      expect(elem.getAttributeValue('position')).toBe('0.5');
      expect(elem.getAttributeValue('transition.to')).toBe('1');
      expect(elem.getAttributeValue('controller')).toBe('sustain');
    });

    it('should add a movement that names no controller and no id', () => {
      const map = MovementMap.createMovementMap()!;
      const index = map.addMovement({ date: 0, position: norm(0.0), transitionTo: norm(1.0) });
      expect(index).toBeGreaterThanOrEqual(0);
      expect(map.size()).toBe(1);
    });

    it('should maintain sorted order when adding out of order', () => {
      const map = MovementMap.createMovementMap()!;
      map.addMovement({
        date: 960,
        controller: 'sustain',
        position: norm(0.5),
        transitionTo: norm(1.0),
        id: 'mov-3',
      });
      map.addMovement({
        date: 0,
        controller: 'sustain',
        position: norm(0.0),
        transitionTo: norm(0.5),
        id: 'mov-1',
      });
      map.addMovement({
        date: 480,
        controller: 'sustain',
        position: norm(0.3),
        transitionTo: norm(0.7),
        id: 'mov-2',
      });

      expect(map.size()).toBe(3);
      expect(map.getElement(0)!.getAttributeValue('date')).toBe('0');
      expect(map.getElement(1)!.getAttributeValue('date')).toBe('480');
      expect(map.getElement(2)!.getAttributeValue('date')).toBe('960');
    });
  });

  describe('getMovementDataOf', () => {
    it('should return null for an empty map', () => {
      const map = MovementMap.createMovementMap()!;
      expect(map.getMovementDataOf(0)).toBeNull();
    });

    it('should return null for negative index', () => {
      const map = MovementMap.createMovementMap()!;
      map.addMovement({
        date: 0,
        controller: 'sustain',
        position: norm(0),
        transitionTo: norm(1),
        id: 'mov-1',
      });
      expect(map.getMovementDataOf(-1)).toBeNull();
    });

    it('should return a resolved Movement for a valid movement', () => {
      const map = MovementMap.createMovementMap()!;
      map.addMovement({
        date: 0,
        controller: 'sustain',
        position: norm(0.0),
        transitionTo: norm(1.0),
        id: 'mov-1',
      });

      const md = map.getMovementDataOf(0);
      expect(md).not.toBeNull();
      expect(md!.startDate).toBe(0);
      expect(md!.position).toBe(0.0);
      // A declared `@transition.to` selects the transitioning arm, which is where the
      // target lives; on the constant arm there is no `transitionTo` to be null.
      expect(md!.kind).toBe('transitioning');
      expect(md?.kind === 'transitioning' ? md.transitionTo : null).toBe(1.0);
    });

    it('should set endDate to MAX_VALUE for the last movement', () => {
      const map = MovementMap.createMovementMap()!;
      map.addMovement({
        date: 0,
        controller: 'sustain',
        position: norm(0),
        transitionTo: norm(1),
        id: 'mov-1',
      });

      const md = map.getMovementDataOf(0)!;
      expect(md.endDate).toBe(Number.MAX_VALUE);
    });

    it('should set endDate to the start of the next movement', () => {
      const map = MovementMap.createMovementMap()!;
      map.addMovement({
        date: 0,
        controller: 'sustain',
        position: norm(0),
        transitionTo: norm(1),
        id: 'mov-1',
      });
      map.addMovement({
        date: 960,
        controller: 'sustain',
        position: norm(1),
        transitionTo: norm(0),
        id: 'mov-2',
      });

      const md = map.getMovementDataOf(0)!;
      expect(md.endDate).toBe(960);
    });

    it('should handle out-of-bounds index by clamping', () => {
      const map = MovementMap.createMovementMap()!;
      map.addMovement({
        date: 0,
        controller: 'sustain',
        position: norm(0),
        transitionTo: norm(1),
        id: 'mov-1',
      });

      const md = map.getMovementDataOf(100);
      expect(md).not.toBeNull();
      expect(md!.position).toBe(0.0);
    });
  });

  describe('addMovement: what is written and what is left out', () => {
    /**
     * Each null in the write payload means "emit no attribute", which is the difference
     * between a `<movement>` the reader treats as constant and one it rejects for having no
     * position at all.
     */
    it('writes only date and controller when only those are given', () => {
      const map = MovementMap.createMovementMap()!;
      const elem = map.getElement(map.addMovement({ date: 100 }))!;
      expect(elem.getAttributeValue('date')).toBe('100');
      expect(elem.getAttribute('position')).toBeNull();
      expect(elem.getAttribute('transition.to')).toBeNull();
      expect(elem.getAttribute('curvature')).toBeNull();
      expect(elem.getAttribute('protraction')).toBeNull();
      // `controller` and `date` are unconditional
      expect(elem.getAttributeValue('controller')).toBe('sustain');
    });

    it('writes every attribute it is given', () => {
      const map = MovementMap.createMovementMap()!;
      const elem = map.getElement(
        map.addMovement({
          date: 100,
          position: norm(0.3),
          transitionTo: norm(0.8),
          controller: 'expression',
          curvature: 0.6,
          protraction: 0.2,
          id: 'mov-full',
        }),
      )!;
      expect(elem.getAttributeValue('position')).toBe('0.3');
      expect(elem.getAttributeValue('transition.to')).toBe('0.8');
      expect(elem.getAttributeValue('curvature')).toBe('0.6');
      expect(elem.getAttributeValue('protraction')).toBe('0.2');
      expect(elem.getAttributeValue('controller')).toBe('expression');
      expect(elem.getAttribute('id', 'http://www.w3.org/XML/1998/namespace')!.getValue()).toBe(
        'mov-full',
      );
    });

    it('isConstantMovement: null transitionTo returns true', () => {
      const md = mov({ transitionTo: null });
      expect(md.kind === 'constant').toBe(true);
    });

    it('isConstantMovement: non-null transitionTo returns false', () => {
      const md = mov({ transitionTo: norm(1.0) });
      expect(md.kind === 'constant').toBe(false);
    });

    it('isConstantMovement: transitionTo = 0.0 returns false', () => {
      const md = mov({ transitionTo: norm(0.0) });
      expect(md.kind === 'constant').toBe(false);
    });
  });

  describe('MovementData.getPositionAt', () => {
    /**
     * A deliberate divergence, licensed by `positionAt` being dead on the rendering path:
     * `MovementMap` samples whole segments and never asks for a single date, in this port and
     * in meico alike, so no rendered byte depends on it.
     *
     * Java NPEs on a constant movement outside its span (MovementData.java:166 and :170).
     * Here a constant movement holds its position at every date, which is what the reachable
     * branch of the method already returned.
     */
    it('a constant movement holds its position across and past its whole span', () => {
      const md = mov({ startDate: 0, endDate: 960, position: norm(0.5) });

      expect(positionAt(md, 0)).toBe(0.5);
      expect(positionAt(md, 480)).toBe(0.5);
      expect(positionAt(md, 960)).toBe(0.5);
      expect(positionAt(md, 2000)).toBe(0.5);
    });

    it('constant movement returns position at any date', () => {
      const md = mov({ startDate: 0, endDate: 960, position: norm(0.5), transitionTo: null });

      expect(positionAt(md, 0)).toBe(0.5);
    });

    it('transition from 0 to 1: at start returns 0', () => {
      const md = mov({
        startDate: 0,
        endDate: 960,
        position: norm(0.0),
        transitionTo: norm(1.0),
        curvature: 0.0,
        protraction: 0.0,
      });

      expect(positionAt(md, 0)).toBe(0.0);
    });

    it('transition from 0 to 1: at end returns 1', () => {
      const md = mov({
        startDate: 0,
        endDate: 960,
        position: norm(0.0),
        transitionTo: norm(1.0),
        curvature: 0.0,
        protraction: 0.0,
      });

      expect(positionAt(md, 960)).toBe(1.0);
    });

    it('transition from 0 to 1: before start returns start position', () => {
      const md = mov({
        startDate: 100,
        endDate: 960,
        position: norm(0.3),
        transitionTo: norm(0.8),
      });

      expect(positionAt(md, 50)).toBe(0.3);
    });

    it('transition from 0 to 1: after end returns end position', () => {
      const md = mov({ startDate: 0, endDate: 960, position: norm(0.0), transitionTo: norm(1.0) });

      expect(positionAt(md, 2000)).toBe(1.0);
    });

    it('S-curve at t=0.5 gives 0.5 for symmetric case', () => {
      // y(t) = ((3 - 2t) * t^2) * (transitionTo - position) + position. With curvature and
      // protraction both 0 the x-mapping is the same cubic, so date 480 is t=0.5 and y = 0.5.
      const md = mov({
        startDate: 0,
        endDate: 960,
        position: norm(0.0),
        transitionTo: norm(1.0),
        curvature: 0.0,
        protraction: 0.0,
      });

      const midDate = 480;
      const pos = positionAt(md, midDate);
      expect(pos).toBeCloseTo(0.5, 1);
    });

    it('transition from 0.2 to 0.8: midpoint should be ~0.5', () => {
      const md = mov({
        startDate: 0,
        endDate: 1000,
        position: norm(0.2),
        transitionTo: norm(0.8),
        curvature: 0.0,
        protraction: 0.0,
      });

      const pos = positionAt(md, 500);
      // ((3-2*0.5)*0.5^2)*(0.8-0.2) + 0.2 = 0.5 * 0.6 + 0.2 = 0.5
      expect(pos).toBeCloseTo(0.5, 1);
    });

    it('position decreases for downward transition', () => {
      const md = mov({
        startDate: 0,
        endDate: 960,
        position: norm(1.0),
        transitionTo: norm(0.0),
        curvature: 0.0,
        protraction: 0.0,
      });

      expect(positionAt(md, 0)).toBe(1.0);
      expect(positionAt(md, 960)).toBe(0.0);
      const midPos = positionAt(md, 480);
      expect(midPos).toBeCloseTo(0.5, 1);
    });
  });

  describe('Inner control point X positions (via getMovementSegment)', () => {
    it('curvature=0, protraction=0 produces S-curve through midpoint', () => {
      // x1 = curvature = 0, x2 = 1 - curvature = 1.
      const md = mov({
        startDate: 0,
        endDate: 1000,
        position: norm(0.0),
        transitionTo: norm(1.0),
        curvature: 0.0,
        protraction: 0.0,
      });

      expect(positionAt(md, 500)).toBeCloseTo(0.5, 1);
    });

    it('curvature=0.4, protraction=0: x1=0.4, x2=0.6', () => {
      // protraction=0 gives x1=curvature=0.4 and x2=1-curvature=0.6, which shifts the timing
      // of the transition but leaves the start and end positions exact.
      const md = mov({
        startDate: 0,
        endDate: 1000,
        position: norm(0.0),
        transitionTo: norm(1.0),
        curvature: 0.4,
        protraction: 0.0,
      });

      expect(positionAt(md, 0)).toBe(0.0);
      expect(positionAt(md, 1000)).toBe(1.0);

      const midPos = positionAt(md, 500);
      expect(midPos).toBeGreaterThan(0.0);
      expect(midPos).toBeLessThan(1.0);
    });

    it('high curvature changes the transition shape', () => {
      const md1 = mov({
        startDate: 0,
        endDate: 1000,
        position: norm(0.0),
        transitionTo: norm(1.0),
        curvature: 0.0,
        protraction: 0.0,
      });

      const md2 = mov({
        startDate: 0,
        endDate: 1000,
        position: norm(0.0),
        transitionTo: norm(1.0),
        curvature: 0.5,
        protraction: 0.0,
      });

      const pos1 = positionAt(md1, 300);
      const pos2 = positionAt(md2, 300);
      expect(pos1).toBeGreaterThanOrEqual(0);
      expect(pos1).toBeLessThanOrEqual(1);
      expect(pos2).toBeGreaterThanOrEqual(0);
      expect(pos2).toBeLessThanOrEqual(1);
      expect(Math.abs(pos1 - pos2)).toBeGreaterThan(0.01);
    });
  });

  describe('MovementData.getMovementSegment', () => {
    it('segment should have at least 4 entries (beginning, t=0, t=1, end)', () => {
      const md = mov({
        startDate: 0,
        endDate: 1000,
        position: norm(0.0),
        transitionTo: norm(1.0),
        curvature: 0.0,
        protraction: 0.0,
      });

      const segment = movementSegment(md, norm(0.1));
      expect(segment.length).toBeGreaterThanOrEqual(4);
    });

    it('all position values are scaled by 127', () => {
      const md = mov({
        startDate: 0,
        endDate: 1000,
        position: norm(0.0),
        transitionTo: norm(1.0),
        curvature: 0.0,
        protraction: 0.0,
      });

      const segment = movementSegment(md, norm(0.1));
      for (const point of segment) {
        expect(point[1]).toBeGreaterThanOrEqual(0);
        expect(point[1]).toBeLessThanOrEqual(127);
      }
    });

    it('first point position is position * 127', () => {
      const md = mov({
        startDate: 0,
        endDate: 1000,
        position: norm(0.5),
        transitionTo: norm(1.0),
        curvature: 0.0,
        protraction: 0.0,
      });

      const segment = movementSegment(md, norm(0.1));
      // First entry is the beginning: [startDate, position * 127]
      expect(segment[0][0]).toBe(0);
      expect(segment[0][1]).toBeCloseTo(0.5 * 127, 5);
    });

    it('last point position is transitionTo * 127', () => {
      const md = mov({
        startDate: 0,
        endDate: 1000,
        position: norm(0.0),
        transitionTo: norm(0.8),
        curvature: 0.0,
        protraction: 0.0,
      });

      const segment = movementSegment(md, norm(0.1));
      const last = segment[segment.length - 1];
      expect(last[0]).toBe(1000);
      expect(last[1]).toBeCloseTo(0.8 * 127, 5);
    });

    it('segment dates are within [startDate, endDate]', () => {
      const md = mov({
        startDate: 100,
        endDate: 500,
        position: norm(0.0),
        transitionTo: norm(1.0),
        curvature: 0.0,
        protraction: 0.0,
      });

      const segment = movementSegment(md, norm(0.1));
      for (const point of segment) {
        expect(point[0]).toBeGreaterThanOrEqual(100);
        expect(point[0]).toBeLessThanOrEqual(500);
      }
    });

    it('curve subdivision creates more points for larger transitions', () => {
      const mdSmall = mov({
        startDate: 0,
        endDate: 1000,
        position: norm(0.0),
        transitionTo: norm(0.1),
        curvature: 0.0,
        protraction: 0.0,
      });

      const mdLarge = mov({
        startDate: 0,
        endDate: 1000,
        position: norm(0.0),
        transitionTo: norm(1.0),
        curvature: 0.0,
        protraction: 0.0,
      });

      const segSmall = movementSegment(mdSmall, norm(0.1));
      const segLarge = movementSegment(mdLarge, norm(0.1));

      expect(segLarge.length).toBeGreaterThanOrEqual(segSmall.length);
    });

    it('dates are monotonically non-decreasing', () => {
      const md = mov({
        startDate: 0,
        endDate: 1000,
        position: norm(0.0),
        transitionTo: norm(1.0),
        curvature: 0.3,
        protraction: 0.0,
      });

      const segment = movementSegment(md, norm(0.1));
      for (let i = 1; i < segment.length; i++) {
        expect(segment[i][0]).toBeGreaterThanOrEqual(segment[i - 1][0]);
      }
    });

    it('position values transition smoothly from start to end', () => {
      const md = mov({
        startDate: 0,
        endDate: 1000,
        position: norm(0.0),
        transitionTo: norm(1.0),
        curvature: 0.0,
        protraction: 0.0,
      });

      const segment = movementSegment(md, norm(0.1));
      for (let i = 1; i < segment.length; i++) {
        expect(segment[i][1]).toBeGreaterThanOrEqual(segment[i - 1][1] - 0.001);
      }
    });

    it('full range: position 0 to 1 gives 0 to 127', () => {
      const md = mov({
        startDate: 0,
        endDate: 1000,
        position: norm(0.0),
        transitionTo: norm(1.0),
        curvature: 0.0,
        protraction: 0.0,
      });

      const segment = movementSegment(md, norm(0.1));
      expect(segment[0][1]).toBeCloseTo(0, 5);
      expect(segment[segment.length - 1][1]).toBeCloseTo(127, 5);
    });

    /**
     * The structural difference between the two arms, and the reason `Movement` is a sum
     * where `Dynamics` is not: a transition gets an exact `[endDate, transitionTo]` pushed
     * onto the back after subdivision, a constant gets nothing. Both still get the exact
     * start point unshifted onto the front, which is why the flat series is 3 long and not
     * 2 — the sampled t=0 point coincides with it and is deliberately duplicated.
     *
     * A control measured the hole: pushing an end point onto the constant arm as well leaves
     * `npm run gate` and this whole file green, and is caught only by
     * `tests/comparison/pedal.test.ts`, three layers away.
     */
    it('a constant movement gets NO exact end point, where a transition does', () => {
      const flat = mov({ startDate: 0, endDate: 1000, position: norm(0.5) });
      const flatSegment = movementSegment(flat, norm(0.1));
      // [startDate, position], then the sampler's own t=0 and t=1, both the same point
      expect(flatSegment.length).toBe(3);
      expect(flatSegment.map((p) => p[0])).toEqual([0, 0, 0]);
      expect(flatSegment.map((p) => p[1])).toEqual([63.5, 63.5, 63.5]);

      const moving = mov({
        startDate: 0,
        endDate: 1000,
        position: norm(0.5),
        transitionTo: norm(0.5),
        curvature: 0.0,
        protraction: 0.0,
      });
      const movingSegment = movementSegment(moving, norm(0.1));
      // Same endpoints and so the same (nil) subdivision, but one entry longer: the
      // pushed [endDate, transitionTo].
      expect(movingSegment.length).toBe(4);
      expect(movingSegment[movingSegment.length - 1]).toEqual([1000, 63.5]);
    });
  });

  describe('renderMovementToMap', () => {
    it('empty map returns an empty positionMap', () => {
      const map = MovementMap.createMovementMap()!;
      const result = map.renderMovementToMap();
      expect(result).not.toBeNull();
      expect(result!.size()).toBe(0);
    });

    it('single movement with transition generates position entries', () => {
      const map = MovementMap.createMovementMap()!;
      // Need at least two movement instructions for generation to happen
      // (movementIndex < this.size() - 1)
      map.addMovement({
        date: 0,
        controller: 'sustain',
        position: norm(0),
        transitionTo: norm(1),
        id: 'mov-1',
      });
      map.addMovement({
        date: 1000,
        controller: 'sustain',
        position: norm(1),
        transitionTo: norm(0),
        id: 'mov-2',
      });

      const result = map.renderMovementToMap();
      expect(result).not.toBeNull();
      expect(result!.size()).toBeGreaterThan(0);
    });

    it('static renderMovementToMap with null returns null', () => {
      const result = MovementMap.renderMovementToMap(null);
      expect(result).toBeNull();
    });

    it('static renderMovementToMap delegates correctly', () => {
      const map = MovementMap.createMovementMap()!;
      map.addMovement({
        date: 0,
        controller: 'sustain',
        position: norm(0),
        transitionTo: norm(1),
        id: 'mov-1',
      });
      map.addMovement({
        date: 1000,
        controller: 'sustain',
        position: norm(1),
        transitionTo: norm(0),
        id: 'mov-2',
      });

      const result = MovementMap.renderMovementToMap(map);
      expect(result).not.toBeNull();
      expect(result!.size()).toBeGreaterThan(0);
    });
  });

  describe('GenericMap operations', () => {
    it('should support removeElement by index', () => {
      const map = MovementMap.createMovementMap()!;
      map.addMovement({
        date: 0,
        controller: 'sustain',
        position: norm(0),
        transitionTo: norm(1),
        id: 'mov-1',
      });
      map.addMovement({
        date: 960,
        controller: 'sustain',
        position: norm(1),
        transitionTo: norm(0),
        id: 'mov-2',
      });

      map.removeElementAt(0);
      expect(map.size()).toBe(1);
      expect(map.getElement(0)!.getAttributeValue('date')).toBe('960');
    });

    it('should support setId and getId', () => {
      const map = MovementMap.createMovementMap()!;
      expect(map.getId()).toBeNull();

      map.setId('movementMap-1');
      expect(map.getId()).toBe('movementMap-1');
    });

    it('should support addStyleSwitch', () => {
      const map = MovementMap.createMovementMap()!;
      const index = map.addStyleSwitch(0, 'myMovementStyle');
      expect(index).toBeGreaterThanOrEqual(0);
      expect(map.size()).toBe(1);

      const elem = map.getElement(index)!;
      expect(elem.getLocalName()).toBe('style');
      expect(elem.getAttributeValue('name.ref')).toBe('myMovementStyle');
    });
  });

  // Mirrored from the Java reference and from mpmify's MovementFixTest, which is what
  // verified these fixes on the Java side.
  describe('movement round-trip fixes', () => {
    // The regression these two guard: `@controller` is a plain attribute, and looking it up
    // in the xml: namespace — where it never lives — finds nothing and clobbers `xmlId` with
    // the result.
    it('getMovementDataOf reads controller from the plain, no-namespace attribute', () => {
      const map = MovementMap.createMovementMap()!;
      const e = new Element('movement');
      e.addAttribute(new Attribute('date', '0.0'));
      e.addAttribute(new Attribute('controller', 'soft'));
      e.addAttribute(new Attribute('xml:id', 'http://www.w3.org/XML/1998/namespace', 'mov-1'));
      map.addElement(e);

      const md = map.getMovementDataOf(0)!;
      expect(md.controller).toBe('soft');
    });

    // The other half of the same guard. The resolved datum carries no `xmlId` to assert on,
    // so a namespace-blind lookup is told apart from a correct one by offering only an
    // `xml:id` and requiring that no controller is found.
    it('getMovementDataOf keeps the "sustain" default when there is no controller attribute', () => {
      const map = MovementMap.createMovementMap()!;
      const e = new Element('movement');
      e.addAttribute(new Attribute('date', '0.0'));
      e.addAttribute(new Attribute('xml:id', 'http://www.w3.org/XML/1998/namespace', 'mov-1'));
      map.addElement(e);

      expect(map.getMovementDataOf(0)!.controller).toBe('sustain');
    });

    it('addMovement serializes controller after protraction, before xml:id', () => {
      const map = MovementMap.createMovementMap()!;
      const xml = map
        .getElement(
          map.addMovement({
            date: 0,
            position: norm(0.2),
            transitionTo: norm(0.9),
            curvature: 0.8,
            protraction: 0.5,
            controller: 'soft',
            id: 'mov-1',
          }),
        )!
        .toXML();
      expect(xml).toContain('controller="soft"');
      // Attribute order is byte-visible in the serialized MPM.
      expect(xml.indexOf('protraction=')).toBeLessThan(xml.indexOf('controller='));
      expect(xml.indexOf('controller=')).toBeLessThan(xml.indexOf('xml:id='));
    });

    it('getMovementDataOf parses curvature, protraction and controller back out', () => {
      const map = MovementMap.createMovementMap()!;
      map.addMovement({
        date: 0,
        position: norm(0.2),
        transitionTo: norm(0.9),
        curvature: 0.8,
        protraction: 0.5,
        controller: 'soft',
      });

      const parsed = map.getMovementDataOf(0)!;
      expect(parsed.curvature).toBe(0.8);
      expect(parsed.protraction).toBe(0.5);
      expect(parsed.controller).toBe('soft');
    });

    it('getMovementDataOf falls back to the reader defaults when attributes are absent', () => {
      const map = MovementMap.createMovementMap()!;
      const e = new Element('movement');
      e.addAttribute(new Attribute('date', '0.0'));
      e.addAttribute(new Attribute('position', '0.2'));
      e.addAttribute(new Attribute('transition.to', '0.9'));
      map.addElement(e);

      const parsed = map.getMovementDataOf(0)!;
      expect(parsed.curvature).toBe(0.4);
      expect(parsed.protraction).toBe(0.0);
      expect(parsed.controller).toBe('sustain');
    });

    // --- End-to-end equivalent of mpmify's MovementFixTest ---

    function buildMsm(): Msm {
      const msm = Msm.createMsm('movement fix test', null, 720);
      const part = Msm.makePart('Piano', 1, 0, 0);
      const dated = part.getFirstChildElement('dated')!;
      dated
        .getFirstChildElement('timeSignatureMap')!
        .appendChild(Msm.makeTimeSignature(0, 4, 4, null));
      const score = dated.getFirstChildElement('score')!;
      for (let i = 0; i < 8; i++) {
        const note = new Element('note');
        note.addAttribute(new Attribute('xml:id', 'http://www.w3.org/XML/1998/namespace', `n${i}`));
        note.addAttribute(new Attribute('date', String(i * 720.0)));
        note.addAttribute(new Attribute('midi.pitch', '60.0'));
        note.addAttribute(new Attribute('pitchname', 'x'));
        note.addAttribute(new Attribute('accidentals', '0.0'));
        note.addAttribute(new Attribute('octave', '3.0'));
        note.addAttribute(new Attribute('duration', '720.0'));
        score.appendChild(note);
      }
      msm.addPart(part);
      return msm;
    }

    /** An absent `curvature`/`protraction` writes no attribute, so the reader defaults apply. */
    function buildMpm(
      controller: string,
      shape?: { readonly curvature: number; readonly protraction: number },
    ): Mpm {
      const mpm = Mpm.createMpm();
      const perf = okValue(Performance.fromName('perf', 720));
      mpm.addPerformance(perf);

      const tempoMap = TempoMap.createTempoMap()!;
      tempoMap.addTempo({ date: 0, bpm: '120', beatLength: 0.25 });
      perf.getGlobal()!.getDated()!.addMap(tempoMap);

      const movMap = MovementMap.createMovementMap()!;
      movMap.addMovement({
        date: 0,
        position: norm(0.2),
        transitionTo: norm(0.9),
        controller,
        ...shape,
      });
      // Two terminating instructions: the last entry of a movementMap is never rendered,
      // it only marks where the preceding transition aims.
      for (const date of [2880, 5760]) {
        movMap.addMovement({
          date,
          position: norm(0.9),
          transitionTo: norm(0.9),
          controller,
        });
      }
      perf.getGlobal()!.getDated()!.addMap(movMap);
      perf.addPart(okValue(Part.fromValues('Piano', 1, 0, 0)));
      return mpm;
    }

    function render(mpm: Mpm, msm: Msm): Msm {
      return mpm.getAllPerformances()[0].perform(msm);
    }

    function positionsOf(augmented: Msm): number[][] {
      const out: number[][] = [];
      const parts = augmented.getRootElement()!.getChildElements('part');
      for (let p = 0; p < parts.size(); p++) {
        const posMap = parts
          .get(p)
          .getFirstChildElement('dated')!
          .getFirstChildElement('positionMap');
        if (posMap === null) continue;
        const events = posMap.getChildElements('position');
        for (let i = 0; i < events.size(); i++)
          out.push([
            parseFloat(events.get(i).getAttributeValue('date')!),
            parseFloat(events.get(i).getAttributeValue('value')!),
          ]);
      }
      return out;
    }

    function controllerOf(augmented: Msm): string | null {
      const parts = augmented.getRootElement()!.getChildElements('part');
      for (let p = 0; p < parts.size(); p++) {
        const posMap = parts
          .get(p)
          .getFirstChildElement('dated')!
          .getFirstChildElement('positionMap');
        if (posMap === null) continue;
        const events = posMap.getChildElements('position');
        if (events.size() > 0) return events.get(0).getAttributeValue('controller');
      }
      return null;
    }

    it('renders identically in memory and after a serialize/re-parse round-trip', () => {
      const mpm = buildMpm('soft', { curvature: 0.8, protraction: 0.5 });
      const inMemory = render(mpm, buildMsm());
      const reParsed = render(new Mpm(mpm.toXML()), new Msm(buildMsm().toXML()));

      // Bit-identical, not merely close: the round-trip must not lose curve shape.
      expect(positionsOf(reParsed)).toEqual(positionsOf(inMemory));
      expect(positionsOf(inMemory).length).toBeGreaterThan(0);
    });

    it('preserves the controller through the serialize/re-parse round-trip', () => {
      const mpm = buildMpm('soft', { curvature: 0.8, protraction: 0.5 });
      expect(controllerOf(render(mpm, buildMsm()))).toBe('soft');
      expect(controllerOf(render(new Mpm(mpm.toXML()), new Msm(buildMsm().toXML())))).toBe('soft');
    });

    it('curvature and protraction actually take effect (differ from the defaults render)', () => {
      const shaped = render(
        new Mpm(buildMpm('soft', { curvature: 0.8, protraction: 0.5 }).toXML()),
        buildMsm(),
      );
      const defaults = render(new Mpm(buildMpm('soft').toXML()), buildMsm());

      expect(positionsOf(shaped)).not.toEqual(positionsOf(defaults));
    });

    // The knob lives in `RenderOptions` and not in a static (RULE I5), so there is no global
    // to leak: the final assertion is that a render with no options is unaffected by every
    // non-default render before it.
    it('movementSampleMaxStep defaults to 0.1 and controls the sampling density', () => {
      expect(DEFAULT_MOVEMENT_SAMPLE_MAX_STEP).toBe(0.1);

      const map = MovementMap.createMovementMap()!;
      map.addMovement({
        date: 0,
        controller: 'sustain',
        position: norm(0),
        transitionTo: norm(1),
        id: 'mov-1',
      });
      map.addMovement({
        date: 1000,
        controller: 'sustain',
        position: norm(1),
        transitionTo: norm(0),
        id: 'mov-2',
      });
      const atDefault = map.renderMovementToMap()!.size();
      expect(atDefault).toBeGreaterThan(0);

      expect(map.renderMovementToMap(ctx({}))!.size()).toBe(atDefault);
      expect(map.renderMovementToMap(ctx({ movementSampleMaxStep: 0.5 }))!.size()).toBeLessThan(
        atDefault,
      );
      expect(map.renderMovementToMap(ctx({ movementSampleMaxStep: 0.02 }))!.size()).toBeGreaterThan(
        atDefault,
      );

      expect(map.renderMovementToMap()!.size()).toBe(atDefault);
    });

    it('the static renderMovementToMap passes the context through', () => {
      const map = MovementMap.createMovementMap()!;
      map.addMovement({
        date: 0,
        controller: 'sustain',
        position: norm(0),
        transitionTo: norm(1),
        id: 'mov-1',
      });
      map.addMovement({
        date: 1000,
        controller: 'sustain',
        position: norm(1),
        transitionTo: norm(0),
        id: 'mov-2',
      });

      expect(
        MovementMap.renderMovementToMap(map, ctx({ movementSampleMaxStep: 0.5 }))!.size(),
      ).toBe(map.renderMovementToMap(ctx({ movementSampleMaxStep: 0.5 }))!.size());
      expect(
        MovementMap.renderMovementToMap(map, ctx({ movementSampleMaxStep: 0.5 }))!.size(),
      ).toBeLessThan(MovementMap.renderMovementToMap(map)!.size());
    });
  });
  describe('position inheritance (PARITY.md, "Fixed bugs", P2)', () => {
    /** A bare <movement> with exactly the attributes given. */
    function movement(attributes: Record<string, string>): Element {
      const e = new Element('movement');
      for (const [name, value] of Object.entries(attributes))
        e.addAttribute(new Attribute(name, value));
      return e;
    }

    /** Runs body with console.error silenced; the skip path logs. */
    function quiet<T>(body: () => T): T {
      const err = silenceConsoleError();
      try {
        return body();
      } finally {
        err.mockRestore();
      }
    }

    it('inherits the preceding movement transition.to when there is one', () => {
      const map = MovementMap.createMovementMap()!;
      map.addElement(movement({ date: '0.0', position: '0.1', 'transition.to': '0.4' }));
      map.addElement(movement({ date: '480.0', position: '0.4', 'transition.to': '0.7' }));
      map.addElement(movement({ date: '960.0' }));

      expect(map.getMovementDataOf(2)!.position).toBe(0.7);
    });

    // Java NPEs here (MovementMap.java:200). A silent 0 would place the movement at "fully
    // released" as if that were a real reading, so the port skips it and renders the rest.
    it('skips a movement whose inherited position is unavailable', () => {
      const map = MovementMap.createMovementMap()!;
      map.addElement(movement({ date: '0.0', position: '0.1', 'transition.to': '0.4' }));
      map.addElement(movement({ date: '480.0', position: '0.4' }));
      map.addElement(movement({ date: '960.0' }));

      expect(quiet(() => map.getMovementDataOf(2))).toBeNull();
      // The neighbours are untouched: this is a skip, not an aborted parse.
      expect(map.getMovementDataOf(0)!.position).toBe(0.1);
      expect(map.getMovementDataOf(1)!.position).toBe(0.4);
    });

    it('logs which movement it skipped', () => {
      const map = MovementMap.createMovementMap()!;
      map.addElement(movement({ date: '0.0', position: '0.1', 'transition.to': '0.4' }));
      map.addElement(movement({ date: '480.0', position: '0.4' }));
      map.addElement(movement({ date: '960.0' }));

      const err = silenceConsoleError();
      try {
        map.getMovementDataOf(2);
        expect(err).toHaveBeenCalledTimes(1);
        expect(String(err.mock.calls[0][0])).toContain('transition.to');
      } finally {
        err.mockRestore();
      }
    });

    it('renders the rest of the map when one movement is skipped', () => {
      const map = MovementMap.createMovementMap()!;
      map.addElement(movement({ date: '0.0', position: '0.1', 'transition.to': '0.4' }));
      map.addElement(movement({ date: '480.0', position: '0.4' }));
      map.addElement(movement({ date: '960.0' }));
      map.addElement(movement({ date: '1440.0', position: '0.9', 'transition.to': '1.0' }));

      const rendered = quiet(() => map.renderMovementToMap())!;
      expect(rendered).not.toBeNull();
      expect(rendered.size()).toBeGreaterThan(0);
    });

    // Entry 0 is a predecessor like any other. The scan bound used to stop one entry short,
    // which yielded 0 here — GH issue #2, PARITY.md §1.
    it('examines entry 0, so a movement inheriting from it gets its transition.to', () => {
      const map = MovementMap.createMovementMap()!;
      map.addElement(movement({ date: '0.0', position: '0.1', 'transition.to': '0.4' }));
      map.addElement(movement({ date: '480.0' }));

      expect(map.getMovementDataOf(1)!.position).toBe(0.4);
    });

    // Reaching entry 0 also means reaching the P2 skip there: this movement used to get 0.
    it('skips a movement whose entry-0 predecessor has no transition.to', () => {
      const map = MovementMap.createMovementMap()!;
      map.addElement(movement({ date: '0.0', position: '0.1' }));
      map.addElement(movement({ date: '480.0' }));

      expect(quiet(() => map.getMovementDataOf(1))).toBeNull();
    });

    // Nothing to inherit from at all, which is the `return 0` at the end of the scan.
    it('yields 0 where no <movement> precedes the one that needs a position', () => {
      const map = MovementMap.createMovementMap()!;
      const style = new Element('style');
      style.addAttribute(new Attribute('date', '0.0'));
      style.addAttribute(new Attribute('name.ref', 'irrelevant'));
      map.addElement(style);
      map.addElement(movement({ date: '480.0' }));

      expect(map.getMovementDataOf(1)!.position).toBe(0);
    });
  });
});
