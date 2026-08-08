import { describe, it, expect } from 'vitest';
import { MovementMap } from '../../../src/mpm/elements/maps/MovementMap.js';
import { MovementData } from '../../../src/mpm/elements/maps/data/MovementData.js';
import { Element, Attribute } from '../../../src/xml/XomTypes.js';

describe('MovementMap', () => {
  // ---------------------------------------------------------------
  // Create a movement map
  // ---------------------------------------------------------------
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

  // ---------------------------------------------------------------
  // Add movement instruction
  // ---------------------------------------------------------------
  describe('addMovement', () => {
    it('should add a movement instruction with all parameters', () => {
      const map = MovementMap.createMovementMap()!;
      const index = map.addMovement(0, 'sustain', 0, 1, 'mov-1');
      expect(index).toBeGreaterThanOrEqual(0);
      expect(map.size()).toBe(1);
    });

    it('should store attributes correctly', () => {
      const map = MovementMap.createMovementMap()!;
      const index = map.addMovement(0, 'sustain', 0.5, 1.0, 'mov-1');
      const elem = map.getElement(index)!;

      expect(elem.getAttributeValue('date')).toBe('0');
      expect(elem.getAttributeValue('position')).toBe('0.5');
      expect(elem.getAttributeValue('transition.to')).toBe('1');
      expect(elem.getAttributeValue('controller')).toBe('sustain');
    });

    it('should add a movement from MovementData', () => {
      const map = MovementMap.createMovementMap()!;
      const md = new MovementData();
      md.startDate = 0;
      md.position = 0.0;
      md.transitionTo = 1.0;

      const index = map.addMovement(md);
      expect(index).toBeGreaterThanOrEqual(0);
      expect(map.size()).toBe(1);
    });

    it('should maintain sorted order when adding out of order', () => {
      const map = MovementMap.createMovementMap()!;
      map.addMovement(960, 'sustain', 0.5, 1.0, 'mov-3');
      map.addMovement(0, 'sustain', 0.0, 0.5, 'mov-1');
      map.addMovement(480, 'sustain', 0.3, 0.7, 'mov-2');

      expect(map.size()).toBe(3);
      expect(map.getElement(0)!.getAttributeValue('date')).toBe('0');
      expect(map.getElement(1)!.getAttributeValue('date')).toBe('480');
      expect(map.getElement(2)!.getAttributeValue('date')).toBe('960');
    });
  });

  // ---------------------------------------------------------------
  // getMovementDataOf
  // ---------------------------------------------------------------
  describe('getMovementDataOf', () => {
    it('should return null for an empty map', () => {
      const map = MovementMap.createMovementMap()!;
      expect(map.getMovementDataOf(0)).toBeNull();
    });

    it('should return null for negative index', () => {
      const map = MovementMap.createMovementMap()!;
      map.addMovement(0, 'sustain', 0, 1, 'mov-1');
      expect(map.getMovementDataOf(-1)).toBeNull();
    });

    it('should return MovementData for a valid movement', () => {
      const map = MovementMap.createMovementMap()!;
      map.addMovement(0, 'sustain', 0.0, 1.0, 'mov-1');

      const md = map.getMovementDataOf(0);
      expect(md).not.toBeNull();
      expect(md!.startDate).toBe(0);
      expect(md!.position).toBe(0.0);
      expect(md!.transitionTo).toBe(1.0);
    });

    it('should set endDate to MAX_VALUE for the last movement', () => {
      const map = MovementMap.createMovementMap()!;
      map.addMovement(0, 'sustain', 0, 1, 'mov-1');

      const md = map.getMovementDataOf(0)!;
      expect(md.endDate).toBe(Number.MAX_VALUE);
    });

    it('should set endDate to the start of the next movement', () => {
      const map = MovementMap.createMovementMap()!;
      map.addMovement(0, 'sustain', 0, 1, 'mov-1');
      map.addMovement(960, 'sustain', 1, 0, 'mov-2');

      const md = map.getMovementDataOf(0)!;
      expect(md.endDate).toBe(960);
    });

    it('should handle out-of-bounds index by clamping', () => {
      const map = MovementMap.createMovementMap()!;
      map.addMovement(0, 'sustain', 0, 1, 'mov-1');

      const md = map.getMovementDataOf(100);
      expect(md).not.toBeNull();
      expect(md!.position).toBe(0.0);
    });
  });

  // ---------------------------------------------------------------
  // MovementData
  // ---------------------------------------------------------------
  describe('MovementData', () => {
    it('should have correct default values', () => {
      const md = new MovementData();
      expect(md.startDate).toBe(0.0);
      expect(md.position).toBe(0.0);
      expect(md.transitionTo).toBeNull();
      expect(md.endDate).toBeNull();
      expect(md.controller).toBe('sustain');
      expect(md.curvature).toBe(0.4);
      expect(md.protraction).toBe(0.0);
      expect(md.xml).toBeNull();
      expect(md.xmlId).toBeNull();
    });

    it('should clone correctly', () => {
      const md = new MovementData();
      md.startDate = 100;
      md.position = 0.3;
      md.transitionTo = 0.8;
      md.controller = 'expression';
      md.curvature = 0.6;
      md.protraction = 0.2;
      md.xmlId = 'mov-clone';

      const clone = md.clone();
      expect(clone.startDate).toBe(100);
      expect(clone.position).toBe(0.3);
      expect(clone.transitionTo).toBe(0.8);
      expect(clone.controller).toBe('expression');
      expect(clone.curvature).toBe(0.6);
      expect(clone.protraction).toBe(0.2);
      expect(clone.xmlId).toBe('mov-clone');
    });

    it('clone does not copy endDate (endDate is set externally by the map)', () => {
      const md = new MovementData();
      md.endDate = 500;

      const clone = md.clone();
      // endDate is not cloned in MovementData.clone()
      expect(clone.endDate).toBeNull();
    });

    it('clone should be independent of original', () => {
      const md = new MovementData();
      md.position = 0.5;
      md.transitionTo = 1.0;

      const clone = md.clone();
      clone.position = 0.0;
      clone.transitionTo = 0.0;

      expect(md.position).toBe(0.5);
      expect(md.transitionTo).toBe(1.0);
    });

    it('isConstantMovement: null transitionTo returns true', () => {
      const md = new MovementData();
      md.transitionTo = null;
      expect(md.isConstantMovement()).toBe(true);
    });

    it('isConstantMovement: non-null transitionTo returns false', () => {
      const md = new MovementData();
      md.transitionTo = 1.0;
      expect(md.isConstantMovement()).toBe(false);
    });

    it('isConstantMovement: transitionTo = 0.0 returns false', () => {
      const md = new MovementData();
      md.transitionTo = 0.0;
      expect(md.isConstantMovement()).toBe(false);
    });
  });

  // ---------------------------------------------------------------
  // MovementData.getPositionAt - Bezier curve mathematics
  // ---------------------------------------------------------------
  describe('MovementData.getPositionAt', () => {
    it('constant movement returns position at any date', () => {
      const md = new MovementData();
      md.startDate = 0;
      md.endDate = 960;
      md.position = 0.5;
      md.transitionTo = null;

      // For constant movement, getPositionAt returns position!
      // But the code path: date <= startDate => position, date >= endDate => transitionTo
      // For constant: position is returned since transitionTo is null
      // Actually with null transitionTo, date <= startDate is checked first
      expect(md.getPositionAt(0)).toBe(0.5);
    });

    it('transition from 0 to 1: at start returns 0', () => {
      const md = new MovementData();
      md.startDate = 0;
      md.endDate = 960;
      md.position = 0.0;
      md.transitionTo = 1.0;
      md.curvature = 0.0;
      md.protraction = 0.0;

      expect(md.getPositionAt(0)).toBe(0.0);
    });

    it('transition from 0 to 1: at end returns 1', () => {
      const md = new MovementData();
      md.startDate = 0;
      md.endDate = 960;
      md.position = 0.0;
      md.transitionTo = 1.0;
      md.curvature = 0.0;
      md.protraction = 0.0;

      expect(md.getPositionAt(960)).toBe(1.0);
    });

    it('transition from 0 to 1: before start returns start position', () => {
      const md = new MovementData();
      md.startDate = 100;
      md.endDate = 960;
      md.position = 0.3;
      md.transitionTo = 0.8;

      expect(md.getPositionAt(50)).toBe(0.3);
    });

    it('transition from 0 to 1: after end returns end position', () => {
      const md = new MovementData();
      md.startDate = 0;
      md.endDate = 960;
      md.position = 0.0;
      md.transitionTo = 1.0;

      expect(md.getPositionAt(2000)).toBe(1.0);
    });

    it('S-curve at t=0.5 gives 0.5 for symmetric case', () => {
      // The Bezier S-curve formula: ((3 - 2t) * t^2) * (transitionTo - position) + position
      // At t=0.5: ((3 - 1) * 0.25) * (1 - 0) + 0 = (2 * 0.25) = 0.5
      // With curvature=0 and protraction=0, the x-mapping is linear:
      //   x1=0, x2=1 => the cubic x-parametrization becomes t^3 + 0t^2 + 0t = t^3???
      //   Actually: u = 3*0 - 3*1 + 1 = -2, v = 0 + 3, w = 0
      //   x(t) = (-2t + 3)t * t * s => at t=0.5, x = (-1+3)*0.25*s = 0.5s
      //   So date at t=0.5 corresponds to midpoint
      const md = new MovementData();
      md.startDate = 0;
      md.endDate = 960;
      md.position = 0.0;
      md.transitionTo = 1.0;
      md.curvature = 0.0;
      md.protraction = 0.0;

      const midDate = 480;
      const pos = md.getPositionAt(midDate);
      expect(pos).toBeCloseTo(0.5, 1);
    });

    it('transition from 0.2 to 0.8: midpoint should be ~0.5', () => {
      const md = new MovementData();
      md.startDate = 0;
      md.endDate = 1000;
      md.position = 0.2;
      md.transitionTo = 0.8;
      md.curvature = 0.0;
      md.protraction = 0.0;

      const pos = md.getPositionAt(500);
      // ((3-2*0.5)*0.5^2)*(0.8-0.2) + 0.2 = 0.5 * 0.6 + 0.2 = 0.5
      expect(pos).toBeCloseTo(0.5, 1);
    });

    it('position decreases for downward transition', () => {
      const md = new MovementData();
      md.startDate = 0;
      md.endDate = 960;
      md.position = 1.0;
      md.transitionTo = 0.0;
      md.curvature = 0.0;
      md.protraction = 0.0;

      expect(md.getPositionAt(0)).toBe(1.0);
      expect(md.getPositionAt(960)).toBe(0.0);
      const midPos = md.getPositionAt(480);
      expect(midPos).toBeCloseTo(0.5, 1);
    });
  });

  // ---------------------------------------------------------------
  // MovementData.computeInnerControlPointsXPositions
  // (tested indirectly through getPositionAt and getMovementSegment)
  // ---------------------------------------------------------------
  describe('Inner control point X positions (via getMovementSegment)', () => {
    it('curvature=0, protraction=0 produces S-curve through midpoint', () => {
      // x1=0, x2=1 (or more precisely, x1=curvature=0, x2=1-curvature=1)
      const md = new MovementData();
      md.startDate = 0;
      md.endDate = 1000;
      md.position = 0.0;
      md.transitionTo = 1.0;
      md.curvature = 0.0;
      md.protraction = 0.0;

      // At midpoint, S-curve gives 0.5
      expect(md.getPositionAt(500)).toBeCloseTo(0.5, 1);
    });

    it('curvature=0.4, protraction=0: x1=0.4, x2=0.6', () => {
      // With protraction=0: x1=curvature=0.4, x2=1-curvature=0.6
      // This affects the timing of the transition but not the start/end positions
      const md = new MovementData();
      md.startDate = 0;
      md.endDate = 1000;
      md.position = 0.0;
      md.transitionTo = 1.0;
      md.curvature = 0.4;
      md.protraction = 0.0;

      // Start and end should be exact
      expect(md.getPositionAt(0)).toBe(0.0);
      expect(md.getPositionAt(1000)).toBe(1.0);

      // Midpoint: curvature changes the shape but the transition still works
      const midPos = md.getPositionAt(500);
      expect(midPos).toBeGreaterThan(0.0);
      expect(midPos).toBeLessThan(1.0);
    });

    it('high curvature changes the transition shape', () => {
      const md1 = new MovementData();
      md1.startDate = 0;
      md1.endDate = 1000;
      md1.position = 0.0;
      md1.transitionTo = 1.0;
      md1.curvature = 0.0;
      md1.protraction = 0.0;

      const md2 = new MovementData();
      md2.startDate = 0;
      md2.endDate = 1000;
      md2.position = 0.0;
      md2.transitionTo = 1.0;
      md2.curvature = 0.5;
      md2.protraction = 0.0;

      // Different curvatures yield different positions at the same date
      const pos1 = md1.getPositionAt(300);
      const pos2 = md2.getPositionAt(300);
      // They should both be between 0 and 1 but differ
      expect(pos1).toBeGreaterThanOrEqual(0);
      expect(pos1).toBeLessThanOrEqual(1);
      expect(pos2).toBeGreaterThanOrEqual(0);
      expect(pos2).toBeLessThanOrEqual(1);
      expect(Math.abs(pos1 - pos2)).toBeGreaterThan(0.01);
    });
  });

  // ---------------------------------------------------------------
  // MovementData.getMovementSegment
  // ---------------------------------------------------------------
  describe('MovementData.getMovementSegment', () => {
    it('segment should have at least 4 entries (beginning, t=0, t=1, end)', () => {
      const md = new MovementData();
      md.startDate = 0;
      md.endDate = 1000;
      md.position = 0.0;
      md.transitionTo = 1.0;
      md.curvature = 0.0;
      md.protraction = 0.0;

      const segment = md.getMovementSegment(0.1);
      expect(segment.length).toBeGreaterThanOrEqual(4);
    });

    it('all position values are scaled by 127', () => {
      const md = new MovementData();
      md.startDate = 0;
      md.endDate = 1000;
      md.position = 0.0;
      md.transitionTo = 1.0;
      md.curvature = 0.0;
      md.protraction = 0.0;

      const segment = md.getMovementSegment(0.1);
      for (const point of segment) {
        expect(point[1]).toBeGreaterThanOrEqual(0);
        expect(point[1]).toBeLessThanOrEqual(127);
      }
    });

    it('first point position is position * 127', () => {
      const md = new MovementData();
      md.startDate = 0;
      md.endDate = 1000;
      md.position = 0.5;
      md.transitionTo = 1.0;
      md.curvature = 0.0;
      md.protraction = 0.0;

      const segment = md.getMovementSegment(0.1);
      // First entry is the beginning: [startDate, position * 127]
      expect(segment[0][0]).toBe(0);
      expect(segment[0][1]).toBeCloseTo(0.5 * 127, 5);
    });

    it('last point position is transitionTo * 127', () => {
      const md = new MovementData();
      md.startDate = 0;
      md.endDate = 1000;
      md.position = 0.0;
      md.transitionTo = 0.8;
      md.curvature = 0.0;
      md.protraction = 0.0;

      const segment = md.getMovementSegment(0.1);
      const last = segment[segment.length - 1];
      expect(last[0]).toBe(1000);
      expect(last[1]).toBeCloseTo(0.8 * 127, 5);
    });

    it('segment dates are within [startDate, endDate]', () => {
      const md = new MovementData();
      md.startDate = 100;
      md.endDate = 500;
      md.position = 0.0;
      md.transitionTo = 1.0;
      md.curvature = 0.0;
      md.protraction = 0.0;

      const segment = md.getMovementSegment(0.1);
      for (const point of segment) {
        expect(point[0]).toBeGreaterThanOrEqual(100);
        expect(point[0]).toBeLessThanOrEqual(500);
      }
    });

    it('curve subdivision creates more points for larger transitions', () => {
      const mdSmall = new MovementData();
      mdSmall.startDate = 0;
      mdSmall.endDate = 1000;
      mdSmall.position = 0.0;
      mdSmall.transitionTo = 0.1;
      mdSmall.curvature = 0.0;
      mdSmall.protraction = 0.0;

      const mdLarge = new MovementData();
      mdLarge.startDate = 0;
      mdLarge.endDate = 1000;
      mdLarge.position = 0.0;
      mdLarge.transitionTo = 1.0;
      mdLarge.curvature = 0.0;
      mdLarge.protraction = 0.0;

      const segSmall = mdSmall.getMovementSegment(0.1);
      const segLarge = mdLarge.getMovementSegment(0.1);

      // Larger transition needs more subdivision points
      expect(segLarge.length).toBeGreaterThanOrEqual(segSmall.length);
    });

    it('dates are monotonically non-decreasing', () => {
      const md = new MovementData();
      md.startDate = 0;
      md.endDate = 1000;
      md.position = 0.0;
      md.transitionTo = 1.0;
      md.curvature = 0.3;
      md.protraction = 0.0;

      const segment = md.getMovementSegment(0.1);
      for (let i = 1; i < segment.length; i++) {
        expect(segment[i][0]).toBeGreaterThanOrEqual(segment[i - 1][0]);
      }
    });

    it('position values transition smoothly from start to end', () => {
      const md = new MovementData();
      md.startDate = 0;
      md.endDate = 1000;
      md.position = 0.0;
      md.transitionTo = 1.0;
      md.curvature = 0.0;
      md.protraction = 0.0;

      const segment = md.getMovementSegment(0.1);
      // For upward transition, position values should be monotonically non-decreasing
      for (let i = 1; i < segment.length; i++) {
        expect(segment[i][1]).toBeGreaterThanOrEqual(segment[i - 1][1] - 0.001);
      }
    });

    it('full range: position 0 to 1 gives 0 to 127', () => {
      const md = new MovementData();
      md.startDate = 0;
      md.endDate = 1000;
      md.position = 0.0;
      md.transitionTo = 1.0;
      md.curvature = 0.0;
      md.protraction = 0.0;

      const segment = md.getMovementSegment(0.1);
      expect(segment[0][1]).toBeCloseTo(0, 5);
      expect(segment[segment.length - 1][1]).toBeCloseTo(127, 5);
    });
  });

  // ---------------------------------------------------------------
  // renderMovementToMap
  // ---------------------------------------------------------------
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
      map.addMovement(0, 'sustain', 0, 1, 'mov-1');
      map.addMovement(1000, 'sustain', 1, 0, 'mov-2');

      const result = map.renderMovementToMap();
      expect(result).not.toBeNull();
      // Should have generated position entries for the first movement
      expect(result!.size()).toBeGreaterThan(0);
    });

    it('static renderMovementToMap with null returns null', () => {
      const result = MovementMap.renderMovementToMap(null);
      expect(result).toBeNull();
    });

    it('static renderMovementToMap delegates correctly', () => {
      const map = MovementMap.createMovementMap()!;
      map.addMovement(0, 'sustain', 0, 1, 'mov-1');
      map.addMovement(1000, 'sustain', 1, 0, 'mov-2');

      const result = MovementMap.renderMovementToMap(map);
      expect(result).not.toBeNull();
      expect(result!.size()).toBeGreaterThan(0);
    });
  });

  // ---------------------------------------------------------------
  // GenericMap operations on MovementMap
  // ---------------------------------------------------------------
  describe('GenericMap operations', () => {
    it('should support removeElement by index', () => {
      const map = MovementMap.createMovementMap()!;
      map.addMovement(0, 'sustain', 0, 1, 'mov-1');
      map.addMovement(960, 'sustain', 1, 0, 'mov-2');

      map.removeElement(0);
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
});
