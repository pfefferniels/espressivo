import { describe, it, expect } from 'vitest';
import { DynamicsMap } from '../../../src/mpm/elements/maps/DynamicsMap.js';
import { DynamicsData } from '../../../src/mpm/elements/maps/data/DynamicsData.js';
import {
  dynamicsAt,
  isConstantDynamics,
  resolveDynamics,
  subNoteDynamicsSegment,
  type Dynamics,
} from '../../../src/mpm/elements/maps/data/dynamics.js';
import { GenericMap } from '../../../src/mpm/elements/maps/GenericMap.js';
import { Element, Attribute, Builder } from '../../../src/xml/XomTypes.js';
import { Mpm } from '../../../src/mpm/Mpm.js';

/**
 * A resolved {@link Dynamics} built by hand, for the Bézier tests that take one directly.
 *
 * Stands in for the `const dd = new DynamicsData(); dd.startDate = …` blocks these tests
 * used to open with. It goes through the real {@link resolveDynamics}, so the substitutions
 * the reader makes — an omitted `transitionTo` becoming `volume`, omitted curve parameters
 * becoming 0.0, the control points being derived — are the ones under test rather than a
 * second implementation of them. `endDate` defaults to `Number.MAX_VALUE`, which is what
 * `GenericMap.nextDateOfType` answers for a last instruction.
 */
function dyn(o: {
  startDate?: number;
  endDate?: number;
  volume: number;
  volumeString?: string;
  transitionTo?: number | null;
  transitionToString?: string | null;
  curvature?: number | null;
  protraction?: number | null;
  subNoteDynamics?: boolean;
}): Dynamics {
  return resolveDynamics({
    startDate: o.startDate ?? 0,
    endDate: o.endDate ?? Number.MAX_VALUE,
    volumeString: o.volumeString ?? String(o.volume),
    volume: o.volume,
    transitionToString: o.transitionToString ?? null,
    transitionTo: o.transitionTo ?? null,
    curvature: o.curvature ?? null,
    protraction: o.protraction ?? null,
    subNoteDynamics: o.subNoteDynamics ?? false,
  });
}

// ==========================================================================
//  DynamicsMap Tests
// ==========================================================================
describe('DynamicsMap', () => {
  // Shared by every describe below that needs a real map rather than a bare element: a
  // `<dynamics>` only means something inside a `dynamicsMap`, because that is what supplies
  // the entry's date key, its `endDate` and the style in scope.
  const parse = (xml: string): Element => new Builder().build(xml).getRootElement();

  const mapOf = (dynamics: string): DynamicsMap =>
    DynamicsMap.createDynamicsMap(
      parse(`<dynamicsMap xmlns="http://www.cemfi.de/mpm/ns/1.0">${dynamics}</dynamicsMap>`),
    )!;

  // ---------------------------------------------------------------
  //  Construction
  // ---------------------------------------------------------------
  describe('createDynamicsMap', () => {
    it('should create an empty dynamics map', () => {
      const map = DynamicsMap.createDynamicsMap();
      expect(map).not.toBeNull();
      expect(map!.getType()).toBe('dynamicsMap');
    });

    it('should start with size 0', () => {
      const map = DynamicsMap.createDynamicsMap()!;
      expect(map.size()).toBe(0);
      expect(map.isEmpty()).toBe(true);
    });

    it('should have an XML element', () => {
      const map = DynamicsMap.createDynamicsMap()!;
      expect(map.getXml()).not.toBeNull();
      expect(map.getXml()!.getLocalName()).toBe('dynamicsMap');
    });
  });

  // ---------------------------------------------------------------
  //  addDynamics
  // ---------------------------------------------------------------
  describe('addDynamics', () => {
    it('should add a constant dynamics instruction', () => {
      const map = DynamicsMap.createDynamicsMap()!;
      const index = map.addDynamics(0, '80');
      expect(index).toBeGreaterThanOrEqual(0);
      expect(map.size()).toBe(1);
    });

    it('should add dynamics at the correct date', () => {
      const map = DynamicsMap.createDynamicsMap()!;
      map.addDynamics(0, '60');
      map.addDynamics(960, '100');

      expect(map.size()).toBe(2);
      expect(map.getFirstElement()!.getAttributeValue('date')).toBe('0');
      expect(map.getFirstElement()!.getAttributeValue('volume')).toBe('60');
      expect(map.getLastElement()!.getAttributeValue('date')).toBe('960');
      expect(map.getLastElement()!.getAttributeValue('volume')).toBe('100');
    });

    it('should add dynamics with transition', () => {
      const map = DynamicsMap.createDynamicsMap()!;
      const index = map.addDynamics(0, '60', '100');

      const elem = map.getElement(index)!;
      expect(elem.getAttributeValue('volume')).toBe('60');
      expect(elem.getAttributeValue('transition.to')).toBe('100');
    });

    it('should add dynamics with curvature and protraction', () => {
      const map = DynamicsMap.createDynamicsMap()!;
      const index = map.addDynamics(0, '60', '100', 0.5, 0.3);

      const elem = map.getElement(index)!;
      expect(elem.getAttributeValue('curvature')).toBe('0.5');
      expect(elem.getAttributeValue('protraction')).toBe('0.3');
    });

    it('should add dynamics with subNoteDynamics flag', () => {
      const map = DynamicsMap.createDynamicsMap()!;
      const index = map.addDynamics(0, '60', '100', 0.5, 0.3, true);

      const elem = map.getElement(index)!;
      expect(elem.getAttributeValue('subNoteDynamics')).toBe('true');
    });

    it('should add dynamics with id', () => {
      const map = DynamicsMap.createDynamicsMap()!;
      const index = map.addDynamics(0, '80', undefined, undefined, undefined, undefined, 'dyn-1');

      const elem = map.getElement(index)!;
      const idAttr = elem.getAttribute('id', 'http://www.w3.org/XML/1998/namespace');
      expect(idAttr).not.toBeNull();
      expect(idAttr!.getValue()).toBe('dyn-1');
    });

    it('should add dynamics from DynamicsData', () => {
      const map = DynamicsMap.createDynamicsMap()!;
      const dd = new DynamicsData();
      dd.startDate = 0;
      dd.volume = 80;
      dd.volumeString = '80';

      const index = map.addDynamicsFromData(dd);
      expect(index).toBeGreaterThanOrEqual(0);
      expect(map.size()).toBe(1);
    });

    it('should add DynamicsData with all fields', () => {
      const map = DynamicsMap.createDynamicsMap()!;
      const dd = new DynamicsData();
      dd.startDate = 0;
      dd.volume = 50;
      dd.volumeString = '50';
      dd.transitionTo = 100;
      dd.transitionToString = '100';
      dd.curvature = 0.3;
      dd.protraction = 0.2;
      dd.subNoteDynamics = true;
      dd.xmlId = 'dyn-data-1';

      const index = map.addDynamicsFromData(dd);
      const elem = map.getElement(index)!;
      expect(elem.getAttributeValue('volume')).toBe('50');
      expect(elem.getAttributeValue('transition.to')).toBe('100');
      expect(elem.getAttributeValue('curvature')).toBe('0.3');
      expect(elem.getAttributeValue('protraction')).toBe('0.2');
      expect(elem.getAttributeValue('subNoteDynamics')).toBe('true');
    });

    it('should reject DynamicsData without volume', () => {
      const map = DynamicsMap.createDynamicsMap()!;
      const dd = new DynamicsData();
      dd.startDate = 0;
      dd.volume = null;
      dd.volumeString = null;

      const index = map.addDynamicsFromData(dd);
      expect(index).toBe(-1);
      expect(map.size()).toBe(0);
    });

    it('should maintain sorted order when adding out of order', () => {
      const map = DynamicsMap.createDynamicsMap()!;
      map.addDynamics(960, '100');
      map.addDynamics(0, '60');
      map.addDynamics(480, '80');

      expect(map.size()).toBe(3);
      expect(map.getElement(0)!.getAttributeValue('date')).toBe('0');
      expect(map.getElement(1)!.getAttributeValue('date')).toBe('480');
      expect(map.getElement(2)!.getAttributeValue('date')).toBe('960');
    });
  });

  // ---------------------------------------------------------------
  //  getDynamicsDataOf
  // ---------------------------------------------------------------
  describe('getDynamicsDataOf', () => {
    it('should return null for an empty map', () => {
      const map = DynamicsMap.createDynamicsMap()!;
      expect(map.getDynamicsDataOf(0)).toBeNull();
    });

    it('should return null for negative index', () => {
      const map = DynamicsMap.createDynamicsMap()!;
      map.addDynamics(0, '80');
      expect(map.getDynamicsDataOf(-1)).toBeNull();
    });

    it('should return DynamicsData for a valid constant dynamics', () => {
      const map = DynamicsMap.createDynamicsMap()!;
      map.addDynamics(0, '80');

      const dd = map.getDynamicsDataOf(0)!;
      expect(dd).not.toBeNull();
      expect(dd.startDate).toBe(0);
      expect(dd.volume).toBe(80);
      expect(dd.volumeString).toBe('80');
    });

    it('should detect constant dynamics correctly (no transition.to attribute)', () => {
      const map = DynamicsMap.createDynamicsMap()!;
      map.addDynamics(0, '80');

      const dd = map.getDynamicsDataOf(0)!;
      // Without a transition.to, transitionTo is set equal to volume
      expect(dd.transitionTo).toBe(80);
      expect(dd.transitionToString).toBe('80');
      expect(isConstantDynamics(dd)).toBe(true);
    });

    it('should handle out-of-bounds index by clamping', () => {
      const map = DynamicsMap.createDynamicsMap()!;
      map.addDynamics(0, '80');

      const dd = map.getDynamicsDataOf(100);
      expect(dd).not.toBeNull();
      expect(dd!.volume).toBe(80);
    });

    it('should set endDate to MAX_VALUE for the last dynamics instruction', () => {
      const map = DynamicsMap.createDynamicsMap()!;
      map.addDynamics(0, '80');

      const dd = map.getDynamicsDataOf(0)!;
      expect(dd.endDate).toBe(Number.MAX_VALUE);
    });

    it('should set endDate to the start of the next dynamics instruction', () => {
      const map = DynamicsMap.createDynamicsMap()!;
      map.addDynamics(0, '60');
      map.addDynamics(960, '100');

      const dd = map.getDynamicsDataOf(0)!;
      expect(dd.endDate).toBe(960);
    });

    it('should retrieve dynamics with a transition', () => {
      const map = DynamicsMap.createDynamicsMap()!;
      map.addDynamics(0, '60', '100');

      const dd = map.getDynamicsDataOf(0)!;
      expect(dd.volume).toBe(60);
      expect(dd.transitionTo).toBe(100);
      expect(dd.transitionToString).toBe('100');
      expect(isConstantDynamics(dd)).toBe(false);
    });

    it('should retrieve multiple dynamics instructions', () => {
      const map = DynamicsMap.createDynamicsMap()!;
      map.addDynamics(0, '60');
      map.addDynamics(480, '80');
      map.addDynamics(960, '100');

      const dd0 = map.getDynamicsDataOf(0)!;
      expect(dd0.volume).toBe(60);
      expect(dd0.endDate).toBe(480);

      const dd1 = map.getDynamicsDataOf(1)!;
      expect(dd1.volume).toBe(80);
      expect(dd1.endDate).toBe(960);

      const dd2 = map.getDynamicsDataOf(2)!;
      expect(dd2.volume).toBe(100);
      expect(dd2.endDate).toBe(Number.MAX_VALUE);
    });
  });

  // ---------------------------------------------------------------
  //  getDynamicsDataOf - curvature and protraction
  // ---------------------------------------------------------------
  // Every transition in tests/integration/fixtures carries curvature="0.0"
  // protraction="0.0", which is what the fields default to anyway - so the certification
  // suite could not see that these two were not being read at all, and every transition
  // with a real curve rendered on the straight Bezier. These tests therefore use literal
  // non-zero values, which no fixture has.
  describe('getDynamicsDataOf reads curvature and protraction', () => {
    it('reads both from a literal transition element', () => {
      const dd = mapOf(
        '<dynamics date="0.0" volume="94.2" transition.to="48.3" curvature="0.4"' +
          ' protraction="0.44" />',
      ).getDynamicsDataOf(0)!;

      expect(dd.volume).toBe(94.2);
      expect(dd.transitionTo).toBe(48.3);
      expect(dd.curvature).toBe(0.4);
      expect(dd.protraction).toBe(0.44);
    });

    it('zeroes both when there is no transition.to', () => {
      // A constant instruction has no curve for them to shape, so Java reads neither and
      // sets both to 0.0 - even when the element spells them out.
      const dd = mapOf(
        '<dynamics date="0.0" volume="80" curvature="0.4" protraction="0.44" />',
      ).getDynamicsDataOf(0)!;

      expect(dd.curvature).toBe(0.0);
      expect(dd.protraction).toBe(0.0);
    });

    it('clamps curvature into [0, 1] and protraction into [-1, 1] on the way in', () => {
      const above = mapOf(
        '<dynamics date="0.0" volume="60" transition.to="100" curvature="1.5"' +
          ' protraction="2.0" />',
      ).getDynamicsDataOf(0)!;
      expect(above.curvature).toBe(1.0);
      expect(above.protraction).toBe(1.0);

      const below = mapOf(
        '<dynamics date="0.0" volume="60" transition.to="100" curvature="-0.5"' +
          ' protraction="-3.0" />',
      ).getDynamicsDataOf(0)!;
      expect(below.curvature).toBe(0.0);
      expect(below.protraction).toBe(-1.0);
    });

    it('the curve it reads is the curve that renders', () => {
      // The observable consequence of the omission: with curvature dropped, a curved
      // transition rendered on the straight Bezier and every velocity inside the span was
      // wrong. Same span, same endpoints, different curvature => different midpoint.
      const straight = mapOf(
        '<dynamics date="0.0" volume="0" transition.to="100" curvature="0.0"' +
          ' protraction="0.0" /><dynamics date="1000.0" volume="100" />',
      ).getDynamicsDataOf(0)!;
      const curved = mapOf(
        '<dynamics date="0.0" volume="0" transition.to="100" curvature="0.9"' +
          ' protraction="0.0" /><dynamics date="1000.0" volume="100" />',
      ).getDynamicsDataOf(0)!;

      // Both curves are symmetric, so they agree at the midpoint and nowhere else: the
      // midpoint is exactly where a suite that only sampled the centre would have missed
      // the omission.
      expect(dynamicsAt(curved, 500)).toBeCloseTo(50, 6);
      expect(dynamicsAt(straight, 500)).toBeCloseTo(50, 6);

      // High curvature holds the starting level longer and then climbs steeply, so the
      // curved crescendo is quieter than the straight one in its first half and louder in
      // its second.
      expect(dynamicsAt(curved, 250)).toBeLessThan(dynamicsAt(straight, 250));
      expect(dynamicsAt(curved, 750)).toBeGreaterThan(dynamicsAt(straight, 750));
    });
  });

  // ---------------------------------------------------------------
  //  curvature / protraction boundaries on the way out
  // ---------------------------------------------------------------
  describe('addDynamics clamps the curve parameters', () => {
    it('clamps what addDynamics writes into the element', () => {
      const map = DynamicsMap.createDynamicsMap()!;
      const index = map.addDynamics(0, '60', '100', 1.5, -2.0);
      const elem = map.getElement(index)!;

      expect(elem.getAttributeValue('curvature')).toBe('1');
      expect(elem.getAttributeValue('protraction')).toBe('-1');
    });

    it('clamps what addDynamicsFromData writes, and corrects the data object too', () => {
      // Java writes the corrected value back into the caller's object, so a caller that
      // reuses it does not keep a value the document does not carry.
      const map = DynamicsMap.createDynamicsMap()!;
      const data = new DynamicsData();
      data.startDate = 0;
      data.volumeString = '60';
      data.transitionToString = '100';
      data.curvature = -0.5;
      data.protraction = 4.0;

      const elem = map.getElement(map.addDynamicsFromData(data))!;

      expect(elem.getAttributeValue('curvature')).toBe('0');
      expect(elem.getAttributeValue('protraction')).toBe('1');
      expect(data.curvature).toBe(0.0);
      expect(data.protraction).toBe(1.0);
    });

    it('leaves an in-range value untouched', () => {
      const map = DynamicsMap.createDynamicsMap()!;
      const elem = map.getElement(map.addDynamics(0, '60', '100', 0.4, -0.44))!;

      expect(elem.getAttributeValue('curvature')).toBe('0.4');
      expect(elem.getAttributeValue('protraction')).toBe('-0.44');
    });
  });

  // ---------------------------------------------------------------
  //  getDynamicsDataAt
  // ---------------------------------------------------------------
  describe('getDynamicsDataAt', () => {
    it('should return null for an empty map', () => {
      const map = DynamicsMap.createDynamicsMap()!;
      expect(map.getDynamicsDataAt(0)).toBeNull();
    });

    it('should return the dynamics data active at a given date', () => {
      const map = DynamicsMap.createDynamicsMap()!;
      map.addDynamics(0, '60');
      map.addDynamics(480, '100');

      const dd = map.getDynamicsDataAt(240);
      expect(dd).not.toBeNull();
      expect(dd!.volume).toBe(60);
    });

    it('should return the most recent dynamics at the exact date', () => {
      const map = DynamicsMap.createDynamicsMap()!;
      map.addDynamics(0, '60');
      map.addDynamics(480, '100');

      const dd = map.getDynamicsDataAt(480);
      expect(dd).not.toBeNull();
      expect(dd!.volume).toBe(100);
    });
  });

  // ---------------------------------------------------------------
  //  GenericMap operations on DynamicsMap
  // ---------------------------------------------------------------
  describe('GenericMap operations', () => {
    it('should support removeElement by index', () => {
      const map = DynamicsMap.createDynamicsMap()!;
      map.addDynamics(0, '60');
      map.addDynamics(960, '100');

      map.removeElement(0);
      expect(map.size()).toBe(1);
      expect(map.getElement(0)!.getAttributeValue('volume')).toBe('100');
    });

    it('should support getElementBeforeAt', () => {
      const map = DynamicsMap.createDynamicsMap()!;
      map.addDynamics(0, '60');
      map.addDynamics(480, '80');
      map.addDynamics(960, '100');

      const elem = map.getElementBeforeAt(500);
      expect(elem).not.toBeNull();
      expect(elem!.getAttributeValue('volume')).toBe('80');
    });

    it('should support setId and getId', () => {
      const map = DynamicsMap.createDynamicsMap()!;
      expect(map.getId()).toBeNull();
      map.setId('dynamicsMap-1');
      expect(map.getId()).toBe('dynamicsMap-1');
    });

    it('should support addStyleSwitch', () => {
      const map = DynamicsMap.createDynamicsMap()!;
      const index = map.addStyleSwitch(0, 'myDynamicsStyle');
      expect(index).toBeGreaterThanOrEqual(0);
      expect(map.size()).toBe(1);

      const elem = map.getElement(index)!;
      expect(elem.getLocalName()).toBe('style');
      expect(elem.getAttributeValue('name.ref')).toBe('myDynamicsStyle');
    });
  });

  // ==========================================================================
  //  DynamicsData Tests
  // ==========================================================================
  describe('DynamicsData', () => {
    // ---------------------------------------------------------------
    //  isConstantDynamics
    // ---------------------------------------------------------------
    /**
     * Two of the five cases this block used to cover — "null volume" and "both null" —
     * described states the reader cannot produce and the resolved type can no longer
     * express: `numericDynamicsValue` never returns null, and `resolveDynamics` fills an
     * absent `@transition.to` from `volume`. The predicate is `transitionTo === volume`
     * now, and the three cases below are the three it can actually be asked about. The
     * `dyn` helper reaches them through `resolveDynamics`, so "no `@transition.to`" is
     * still a case rather than a state that has to be written by hand.
     */
    describe('isConstantDynamics', () => {
      it('no transition.to at all => constant', () => {
        expect(isConstantDynamics(dyn({ volume: 80 }))).toBe(true);
      });

      it('equal values => constant', () => {
        expect(isConstantDynamics(dyn({ volume: 80, transitionTo: 80 }))).toBe(true);
      });

      it('different values => not constant', () => {
        expect(isConstantDynamics(dyn({ volume: 60, transitionTo: 100 }))).toBe(false);
      });
    });

    // ---------------------------------------------------------------
    //  clone (the write payload's, the only half that still has one)
    // ---------------------------------------------------------------
    describe('clone', () => {
      it('should produce an identical copy', () => {
        const dd = new DynamicsData();
        dd.startDate = 100;
        dd.endDate = 500;
        dd.volume = 80;
        dd.volumeString = '80';
        dd.transitionTo = 120;
        dd.transitionToString = '120';
        dd.curvature = 0.5;
        dd.protraction = 0.3;
        dd.subNoteDynamics = true;
        dd.xmlId = 'clone-test';

        const clone = dd.clone();
        expect(clone.startDate).toBe(100);
        expect(clone.endDate).toBe(500);
        expect(clone.volume).toBe(80);
        expect(clone.volumeString).toBe('80');
        expect(clone.transitionTo).toBe(120);
        expect(clone.transitionToString).toBe('120');
        expect(clone.curvature).toBe(0.5);
        expect(clone.protraction).toBe(0.3);
        expect(clone.subNoteDynamics).toBe(true);
        expect(clone.xmlId).toBe('clone-test');
      });

      it('clone does not share state with original', () => {
        const dd = new DynamicsData();
        dd.volume = 80;
        dd.transitionTo = 120;
        dd.curvature = 0.5;

        const clone = dd.clone();
        clone.volume = 999;
        clone.transitionTo = 999;
        clone.curvature = 0.9;

        expect(dd.volume).toBe(80);
        expect(dd.transitionTo).toBe(120);
        expect(dd.curvature).toBe(0.5);
      });

      /**
       * Replaces "clone with getDynamicsAt produces identical results", which asked
       * whether a *copy* of an evaluable datum evaluated the same — a question that only
       * arose because the evaluation cached its control points by mutating the object it
       * was called on, so a clone taken before or after the first call was a different
       * object. The resolved half is `readonly` and derives its control points at read
       * time, so what is worth asking now is that two independently resolved data with the
       * same parameters agree everywhere.
       */
      it('two independently resolved data with the same parameters agree everywhere', () => {
        const parameters = {
          startDate: 0,
          endDate: 1000,
          volume: 50,
          transitionTo: 100,
          curvature: 0.3,
          protraction: 0.2,
        };
        const a = dyn(parameters);
        const b = dyn(parameters);

        for (const date of [0, 100, 250, 500, 750, 999, 1000]) {
          expect(dynamicsAt(b, date)).toBe(dynamicsAt(a, date));
        }
      });
    });

    // ---------------------------------------------------------------
    //  computeInnerControlPointsXPositions (tested indirectly)
    // ---------------------------------------------------------------
    describe('computeInnerControlPointsXPositions', () => {
      // We can't call the private method directly, but we can verify its
      // effects through getTForDate / getDynamicsAt / getSubNoteDynamicsSegment.

      it('curvature=0, protraction=0 => linear Bezier control points (x1=0, x2=1)', () => {
        // With x1=0, x2=1 the Bezier x(t) curve simplifies to:
        //   x(t) = (3*0 - 3*1 + 1)*t^3 + (-6*0 + 3*1)*t^2 + 3*0*t
        //        = (-2)*t^3 + 3*t^2 = t^2(3 - 2t)
        // At t=0.5: x = 0.25*(3-1) = 0.5 => midpoint maps to midpoint in date space.
        // S-curve for dynamics: y(t) = (3-2t)*t^2 * (transitionTo - volume) + volume
        // At t=0.5: y = (3-1)*0.25 * delta + vol = 0.5*delta + vol
        const dd = dyn({
          startDate: 0,
          endDate: 1000,
          volume: 50,
          transitionTo: 100,
          curvature: 0,
          protraction: 0,
        });

        // At midpoint date=500, t should be close to 0.5
        const dynAtMid = dynamicsAt(dd, 500);
        // y(0.5) = ((3-1)*0.25)*(100-50) + 50 = 0.5*50 + 50 = 75
        expect(dynAtMid).toBeCloseTo(75.0, 0);
      });

      it('curvature=0.5, protraction=0 => x1=0.5, x2=0.5', () => {
        // With protraction=0: x1=curvature=0.5, x2=1-curvature=0.5.
        // Bezier x(t) = (3*0.5 - 3*0.5 + 1)*t^3 + (-6*0.5 + 3*0.5)*t^2 + 3*0.5*t
        //             = t^3 + (-1.5)*t^2 + 1.5*t = t^3 - 1.5*t^2 + 1.5*t
        // At t=0.5: x = 0.125 - 0.375 + 0.75 = 0.5
        // So with curvature=0.5, protraction=0, the midpoint in date space still maps to t=0.5
        const dd = dyn({
          startDate: 0,
          endDate: 1000,
          volume: 50,
          transitionTo: 100,
          curvature: 0.5,
          protraction: 0,
        });

        const dynAtMid = dynamicsAt(dd, 500);
        // At t=0.5: y = (3-1)*0.25*(100-50)+50 = 75
        expect(dynAtMid).toBeCloseTo(75.0, 0);
      });

      it('curvature=0.3, protraction=0.4: verify x1 and x2 via formula', () => {
        // protraction > 0:
        // x1 = curvature + ((|p|+p)/(2p) - (|p|/p)*curvature) * p
        //    = 0.3 + ((0.4+0.4)/(0.8) - (0.4/0.4)*0.3) * 0.4
        //    = 0.3 + (1.0 - 0.3) * 0.4
        //    = 0.3 + 0.7 * 0.4 = 0.3 + 0.28 = 0.58
        //
        // x2 = 1 - curvature + ((p-|p|)/(2p) + (|p|/p)*curvature) * p
        //    = 0.7 + ((0.4-0.4)/(0.8) + (0.4/0.4)*0.3) * 0.4
        //    = 0.7 + (0 + 0.3) * 0.4
        //    = 0.7 + 0.12 = 0.82
        //
        // We verify indirectly by checking that the dynamics curve produces
        // expected behavior: with protraction > 0, the curve is shifted to the right.
        const dd = dyn({
          startDate: 0,
          endDate: 1000,
          volume: 0,
          transitionTo: 100,
          curvature: 0.3,
          protraction: 0.4,
        });

        // Verify boundary conditions
        expect(dynamicsAt(dd, 0)).toBeCloseTo(0.0, 5);
        expect(dynamicsAt(dd, 1000)).toBeCloseTo(100.0, 5);

        // With positive protraction, the x-curve is shifted right,
        // meaning the dynamics transition happens later.
        // At midpoint, the dynamics should be less than the symmetric case.
        const dynAtMid = dynamicsAt(dd, 500);
        // Compare with curvature=0.3, protraction=0 case
        const ddSym = dyn({
          startDate: 0,
          endDate: 1000,
          volume: 0,
          transitionTo: 100,
          curvature: 0.3,
          protraction: 0,
        });

        const dynAtMidSym = dynamicsAt(ddSym, 500);
        // Positive protraction shifts the transition later, so at the midpoint
        // the dynamics value should be lower
        expect(dynAtMid).toBeLessThan(dynAtMidSym);
      });

      it('curvature=0.3, protraction=-0.4: negative protraction shifts transition earlier', () => {
        // protraction < 0:
        // x1 = curvature + ((|p|+p)/(2p) - (|p|/p)*curvature) * p
        //    = 0.3 + ((0.4-0.4)/(-0.8) - (0.4/(-0.4))*0.3) * (-0.4)
        //    = 0.3 + (0 + 0.3) * (-0.4)
        //    = 0.3 - 0.12 = 0.18
        //
        // x2 = 1 - curvature + ((p-|p|)/(2p) + (|p|/p)*curvature) * p
        //    = 0.7 + ((-0.4-0.4)/(-0.8) + (0.4/(-0.4))*0.3) * (-0.4)
        //    = 0.7 + (1.0 - 0.3) * (-0.4)
        //    = 0.7 - 0.28 = 0.42
        //
        // With negative protraction, the transition happens earlier.
        const dd = dyn({
          startDate: 0,
          endDate: 1000,
          volume: 0,
          transitionTo: 100,
          curvature: 0.3,
          protraction: -0.4,
        });

        // Verify boundary conditions
        expect(dynamicsAt(dd, 0)).toBeCloseTo(0.0, 5);
        expect(dynamicsAt(dd, 1000)).toBeCloseTo(100.0, 5);

        // Compare with symmetric case
        const ddSym = dyn({
          startDate: 0,
          endDate: 1000,
          volume: 0,
          transitionTo: 100,
          curvature: 0.3,
          protraction: 0,
        });

        const dynAtMidSym = dynamicsAt(ddSym, 500);
        const dynAtMid = dynamicsAt(dd, 500);
        // Negative protraction shifts transition earlier, so at midpoint
        // the dynamics value should be higher
        expect(dynAtMid).toBeGreaterThan(dynAtMidSym);
      });
    });

    // ---------------------------------------------------------------
    //  getTForDate (tested indirectly via getDynamicsAt)
    // ---------------------------------------------------------------
    describe('getTForDate (via getDynamicsAt)', () => {
      it('at startDate: returns volume (t=0)', () => {
        const dd = dyn({
          startDate: 0,
          endDate: 1000,
          volume: 50,
          transitionTo: 100,
          curvature: 0,
          protraction: 0,
        });

        expect(dynamicsAt(dd, 0)).toBe(50);
      });

      it('at endDate: returns transitionTo (t=1)', () => {
        const dd = dyn({
          startDate: 0,
          endDate: 1000,
          volume: 50,
          transitionTo: 100,
          curvature: 0,
          protraction: 0,
        });

        expect(dynamicsAt(dd, 1000)).toBe(100);
      });

      it('at midpoint with linear curve (curvature=0, protraction=0): t approx 0.5', () => {
        const dd = dyn({
          startDate: 0,
          endDate: 1000,
          volume: 50,
          transitionTo: 100,
          curvature: 0,
          protraction: 0,
        });

        // At the date midpoint (500), with curvature=0, protraction=0:
        // x(t) = (3*0 - 3*1 + 1)*t^3 + (-6*0 + 3*1)*t^2 + (3*0)*t
        //       = (-2t^3 + 3t^2)
        // We need x(t) * s = 500 where s=1000
        // So (-2t^3 + 3t^2) = 0.5
        // At t=0.5: (-2*0.125 + 3*0.25) = (-0.25 + 0.75) = 0.5. Exact!
        // y(0.5) = ((3-1)*0.25)*(100-50)+50 = 0.5*50+50 = 75
        expect(dynamicsAt(dd, 500)).toBeCloseTo(75.0, 1);
      });

      it('binary search converges: many intermediate points', () => {
        const dd = dyn({
          startDate: 0,
          endDate: 1000,
          volume: 0,
          transitionTo: 100,
          curvature: 0,
          protraction: 0,
        });

        // Verify monotonically increasing
        let prev = dynamicsAt(dd, 0);
        for (let d = 10; d <= 1000; d += 10) {
          const curr = dynamicsAt(dd, d);
          expect(curr).toBeGreaterThanOrEqual(prev);
          prev = curr;
        }
      });

      it('binary search converges with non-zero curvature and protraction', () => {
        const dd = dyn({
          startDate: 0,
          endDate: 1000,
          volume: 0,
          transitionTo: 100,
          curvature: 0.7,
          protraction: 0.5,
        });

        // Should still be monotonically increasing for a crescendo
        let prev = dynamicsAt(dd, 0);
        for (let d = 10; d <= 1000; d += 10) {
          const curr = dynamicsAt(dd, d);
          expect(curr).toBeGreaterThanOrEqual(prev - 0.01); // small tolerance for numerical precision
          prev = curr;
        }
      });
    });

    // ---------------------------------------------------------------
    //  getDynamicsAt
    // ---------------------------------------------------------------
    describe('getDynamicsAt', () => {
      it('constant dynamics returns volume at any date', () => {
        const dd = dyn({ startDate: 0, endDate: 960, volume: 80, transitionTo: null });

        expect(dynamicsAt(dd, 0)).toBe(80);
        expect(dynamicsAt(dd, 480)).toBe(80);
        expect(dynamicsAt(dd, 960)).toBe(80);
      });

      it('constant dynamics: volume == transitionTo returns volume', () => {
        const dd = dyn({ startDate: 0, endDate: 960, volume: 80, transitionTo: 80 });

        expect(dynamicsAt(dd, 480)).toBe(80);
      });

      it('returns volume for dates before startDate', () => {
        const dd = dyn({
          startDate: 100,
          endDate: 500,
          volume: 60,
          transitionTo: 100,
          curvature: 0,
          protraction: 0,
        });

        expect(dynamicsAt(dd, 50)).toBe(60);
      });

      it('returns transitionTo for dates at or after endDate', () => {
        const dd = dyn({
          startDate: 0,
          endDate: 500,
          volume: 60,
          transitionTo: 100,
          curvature: 0,
          protraction: 0,
        });

        expect(dynamicsAt(dd, 500)).toBe(100);
        expect(dynamicsAt(dd, 600)).toBe(100);
      });

      it('S-curve: at t=0 returns volume, at t=1 returns transitionTo', () => {
        const dd = dyn({
          startDate: 0,
          endDate: 1000,
          volume: 50,
          transitionTo: 100,
          curvature: 0,
          protraction: 0,
        });

        // At t=0 (startDate): getDynamicsAt directly returns volume since date == startDate triggers t=0
        // y(0) = ((3-0)*0*0)*(100-50) + 50 = 0 + 50 = 50
        expect(dynamicsAt(dd, 0)).toBe(50);
        // At t=1 (endDate): y(1) = ((3-2)*1)*(100-50)+50 = 1*50+50 = 100
        expect(dynamicsAt(dd, 1000)).toBe(100);
      });

      it('S-curve formula verification at t=0.5', () => {
        const dd = dyn({
          startDate: 0,
          endDate: 1000,
          volume: 50,
          transitionTo: 100,
          curvature: 0,
          protraction: 0,
        });

        // At t=0.5:
        // y = ((3 - 2*0.5) * 0.5^2) * (100-50) + 50
        //   = (2 * 0.25) * 50 + 50
        //   = 0.5 * 50 + 50
        //   = 75
        expect(dynamicsAt(dd, 500)).toBeCloseTo(75.0, 1);
      });

      it('S-curve formula at t=0.25 and t=0.75', () => {
        const dd = dyn({
          startDate: 0,
          endDate: 1000,
          volume: 0,
          transitionTo: 100,
          curvature: 0,
          protraction: 0,
        });

        // For curvature=0, protraction=0:
        // x(t) = t^2(3-2t) and y(t) = t^2(3-2t) * 100
        // We need to find dates where t=0.25 and t=0.75
        // x(0.25) = 0.0625 * 2.5 = 0.15625, date = 0.15625 * 1000 = 156.25
        // x(0.75) = 0.5625 * 1.5 = 0.84375, date = 843.75
        // y(0.25) = 0.15625 * 100 = 15.625
        // y(0.75) = 0.84375 * 100 = 84.375
        expect(dynamicsAt(dd, 156.25)).toBeCloseTo(15.625, 0);
        expect(dynamicsAt(dd, 843.75)).toBeCloseTo(84.375, 0);
      });

      it('descending transition: volume=100, transitionTo=50', () => {
        const dd = dyn({
          startDate: 0,
          endDate: 1000,
          volume: 100,
          transitionTo: 50,
          curvature: 0,
          protraction: 0,
        });

        expect(dynamicsAt(dd, 0)).toBe(100);
        expect(dynamicsAt(dd, 1000)).toBe(50);
        // At midpoint (t≈0.5):
        // y(0.5) = (2*0.25)*(50-100) + 100 = 0.5*(-50)+100 = -25+100 = 75
        expect(dynamicsAt(dd, 500)).toBeCloseTo(75.0, 0);
      });

      it('high curvature produces a sharper S-curve', () => {
        // With high curvature, the inner control points are closer together,
        // producing a more abrupt transition
        const ddSharp = dyn({
          startDate: 0,
          endDate: 1000,
          volume: 0,
          transitionTo: 100,
          curvature: 0.9,
          protraction: 0,
        });

        const ddLinear = dyn({
          startDate: 0,
          endDate: 1000,
          volume: 0,
          transitionTo: 100,
          curvature: 0,
          protraction: 0,
        });

        // At date 300, the sharp curve should be closer to 0 (slower start)
        expect(dynamicsAt(ddSharp, 300)).toBeLessThan(dynamicsAt(ddLinear, 300));
        // At date 700, the sharp curve should be closer to 100 (faster end)
        expect(dynamicsAt(ddSharp, 700)).toBeGreaterThan(dynamicsAt(ddLinear, 700));
      });
    });

    // ---------------------------------------------------------------
    //  getSubNoteDynamicsSegment
    // ---------------------------------------------------------------
    describe('getSubNoteDynamicsSegment', () => {
      it('returns at least start and end points', () => {
        const dd = dyn({
          startDate: 0,
          endDate: 1000,
          volume: 50,
          transitionTo: 100,
          curvature: 0,
          protraction: 0,
        });

        const segments = subNoteDynamicsSegment(dd, 200);
        expect(segments.length).toBeGreaterThanOrEqual(2);
        // First point should be at startDate with volume
        expect(segments[0][0]).toBeCloseTo(0, 5);
        expect(segments[0][1]).toBeCloseTo(50, 1);
        // Last point should be at endDate with transitionTo
        const last = segments[segments.length - 1];
        expect(last[0]).toBeCloseTo(1000, 5);
        expect(last[1]).toBeCloseTo(100, 1);
      });

      it('smaller maxStepSize produces more segments', () => {
        const dd = dyn({
          startDate: 0,
          endDate: 1000,
          volume: 0,
          transitionTo: 100,
          curvature: 0,
          protraction: 0,
        });

        const coarse = subNoteDynamicsSegment(dd, 50);
        const fine = subNoteDynamicsSegment(dd, 10);
        expect(fine.length).toBeGreaterThan(coarse.length);
      });

      it('adjacent segments differ by at most maxStepSize in dynamics', () => {
        const dd = dyn({
          startDate: 0,
          endDate: 1000,
          volume: 0,
          transitionTo: 100,
          curvature: 0.5,
          protraction: 0.3,
        });

        const maxStep = 10;
        const segments = subNoteDynamicsSegment(dd, maxStep);

        for (let i = 0; i < segments.length - 1; i++) {
          const diff = Math.abs(segments[i + 1][1] - segments[i][1]);
          expect(diff).toBeLessThanOrEqual(maxStep + 0.01); // small tolerance
        }
      });

      it('dates in segments are monotonically increasing', () => {
        const dd = dyn({
          startDate: 0,
          endDate: 1000,
          volume: 0,
          transitionTo: 100,
          curvature: 0.3,
          protraction: -0.2,
        });

        const segments = subNoteDynamicsSegment(dd, 15);
        for (let i = 0; i < segments.length - 1; i++) {
          expect(segments[i + 1][0]).toBeGreaterThanOrEqual(segments[i][0]);
        }
      });

      it('constant dynamics produces exactly 2 segments', () => {
        const dd = dyn({
          startDate: 0,
          endDate: 1000,
          volume: 80,
          transitionTo: 80,
          curvature: 0,
          protraction: 0,
        });

        const segments = subNoteDynamicsSegment(dd, 5);
        // Both endpoints have the same dynamics value, so no subdivision needed
        expect(segments.length).toBe(2);
      });

      it('large maxStepSize with small dynamics range produces few segments', () => {
        // only 10 difference between the endpoints
        const dd = dyn({
          startDate: 0,
          endDate: 1000,
          volume: 50,
          transitionTo: 60,
          curvature: 0,
          protraction: 0,
        });

        const segments = subNoteDynamicsSegment(dd, 20);
        // Range is only 10, maxStep is 20, so 2 segments suffice
        expect(segments.length).toBe(2);
      });

      it('getSubNoteDynamicsSegment with non-zero start and curvature', () => {
        const dd = dyn({
          startDate: 500,
          endDate: 1500,
          volume: 20,
          transitionTo: 90,
          curvature: 0.6,
          protraction: 0,
        });

        const segments = subNoteDynamicsSegment(dd, 10);
        expect(segments[0][0]).toBeCloseTo(500, 5);
        expect(segments[0][1]).toBeCloseTo(20, 1);
        const last = segments[segments.length - 1];
        expect(last[0]).toBeCloseTo(1500, 5);
        expect(last[1]).toBeCloseTo(90, 1);
      });
    });

    // ---------------------------------------------------------------
    //  reading an element, through the reader that renders
    // ---------------------------------------------------------------
    // Migrated from a `new DynamicsData(e)` constructor that no production path called.
    // The first case transfers assertion for assertion. The second CANNOT, and that is
    // the point: `expect(dd.volume).toBeNull()` was pinning a state the renderer never
    // produces. The dead constructor put a non-numeric `@volume` in `volumeString` and
    // left `volume` null; `getDynamicsDataOf` always sets the string AND resolves the
    // number through the style in scope. Rather than drop the case, it is re-pointed at
    // the resolution that actually happens — which needs a real document, because a
    // style-relative name means nothing without a style.
    describe('reading an element through getDynamicsDataOf', () => {
      it('reads date, volume, transition.to, curvature, protraction and subNoteDynamics', () => {
        const dd = mapOf(
          '<dynamics date="100.0" volume="80" transition.to="120" curvature="0.5"' +
            ' protraction="0.3" subNoteDynamics="true" />',
        ).getDynamicsDataOf(0)!;

        expect(dd.startDate).toBe(100);
        expect(dd.volume).toBe(80);
        expect(dd.transitionTo).toBe(120);
        expect(dd.curvature).toBe(0.5);
        expect(dd.protraction).toBe(0.3);
        expect(dd.subNoteDynamics).toBe(true);
        // The string half of the pair, which the dead constructor NULLED for a numeric
        // volume even though `addDynamics(DynamicsData)` prefers it on the way back out.
        expect(dd.volumeString).toBe('80');
      });

      it('keeps a style-relative volume as a string AND resolves it through the style', () => {
        const mpm = new Mpm(
          `<mpm xmlns="${Mpm.MPM_NAMESPACE}"><performance name="p" pulsesPerQuarter="720">` +
            '<global><header><dynamicsStyles><styleDef name="s">' +
            '<dynamicsDef name="forte" value="96.0" />' +
            '</styleDef></dynamicsStyles></header><dated>' +
            '<dynamicsMap><style date="0.0" name.ref="s" />' +
            '<dynamics date="0.0" volume="forte" /></dynamicsMap>' +
            '</dated></global></performance></mpm>',
        );
        // `getMap` is declared to return the base `GenericMap`; the downcast names a
        // PUBLIC reader, it is not a way in to a private path.
        const map = mpm
          .getAllPerformances()[0]
          .getGlobal()!
          .getDated()!
          .getMap('dynamicsMap') as DynamicsMap;

        // Entry 0 is the <style> switch, so the instruction is entry 1.
        const dd = map.getDynamicsDataOf(1)!;
        expect(dd.volumeString).toBe('forte');
        expect(dd.volume).toBe(96.0);
      });

      it('falls back to 100 for a name no style resolves, rather than leaving volume null', () => {
        // Without a style there is no def to consult and no number to parse, so
        // `DynamicsStyle.getNumericValueStatic` logs and answers 100. The dead
        // constructor answered null here, and null is what `getDynamicsAt` divides by.
        const dd = mapOf('<dynamics date="0.0" volume="forte" />').getDynamicsDataOf(0)!;
        expect(dd.volumeString).toBe('forte');
        expect(dd.volume).toBe(100.0);
      });
    });

    // ---------------------------------------------------------------
    //  Comprehensive mathematical verification
    // ---------------------------------------------------------------
    describe('comprehensive S-curve mathematics', () => {
      it('the S-curve formula y(t)=(3-2t)*t^2 at several t values', () => {
        // S-curve normalized: f(t) = (3-2t)*t^2
        // f(0) = 0, f(0.25)=0.15625, f(0.5)=0.5, f(0.75)=0.84375, f(1)=1
        const dd = dyn({
          startDate: 0,
          endDate: 1000,
          volume: 0,
          transitionTo: 100,
          curvature: 0,
          protraction: 0,
        });

        // With curvature=0, protraction=0, x(t)=t^2(3-2t) and y(t)=t^2(3-2t)*100
        // And x(t) is the same function as y(t)/100 in this special case.
        // So date = x(t)*1000 = f(t)*1000, dynamics = f(t)*100.
        // This means dynamics = date/10 for curvature=0, protraction=0.

        // At date = f(0.25)*1000 = 156.25
        expect(dynamicsAt(dd, 156.25)).toBeCloseTo(15.625, 0);
        // At date = f(0.5)*1000 = 500
        expect(dynamicsAt(dd, 500)).toBeCloseTo(50.0, 0);
        // At date = f(0.75)*1000 = 843.75
        expect(dynamicsAt(dd, 843.75)).toBeCloseTo(84.375, 0);
      });

      it('symmetry: crescendo and diminuendo midpoint values are symmetric', () => {
        const ddCresc = dyn({
          startDate: 0,
          endDate: 1000,
          volume: 0,
          transitionTo: 100,
          curvature: 0,
          protraction: 0,
        });

        const ddDim = dyn({
          startDate: 0,
          endDate: 1000,
          volume: 100,
          transitionTo: 0,
          curvature: 0,
          protraction: 0,
        });

        // At the midpoint, crescendo + diminuendo should sum to 100
        const crescMid = dynamicsAt(ddCresc, 500);
        const dimMid = dynamicsAt(ddDim, 500);
        expect(crescMid + dimMid).toBeCloseTo(100.0, 0);
      });

      it('protraction shifts the x-curve control points, changing dynamics distribution', () => {
        // Positive protraction increases x1 and x2, causing the Bezier x-curve
        // to accumulate x-position faster at small t. This means that for a given
        // date, the corresponding t is lower, resulting in a lower dynamics value.
        // In effect, positive protraction delays the transition.
        const ddPos = dyn({
          startDate: 0,
          endDate: 1000,
          volume: 0,
          transitionTo: 100,
          curvature: 0.3,
          protraction: 0.5,
        });

        const ddNeg = dyn({
          startDate: 0,
          endDate: 1000,
          volume: 0,
          transitionTo: 100,
          curvature: 0.3,
          protraction: -0.5,
        });

        const ddZero = dyn({
          startDate: 0,
          endDate: 1000,
          volume: 0,
          transitionTo: 100,
          curvature: 0.3,
          protraction: 0,
        });

        // All three should agree at boundaries
        expect(dynamicsAt(ddPos, 0)).toBeCloseTo(0, 5);
        expect(dynamicsAt(ddNeg, 0)).toBeCloseTo(0, 5);
        expect(dynamicsAt(ddPos, 1000)).toBeCloseTo(100, 5);
        expect(dynamicsAt(ddNeg, 1000)).toBeCloseTo(100, 5);

        // At the midpoint, positive and negative protraction should differ
        const dynPosMid = dynamicsAt(ddPos, 500);
        const dynNegMid = dynamicsAt(ddNeg, 500);
        const dynZeroMid = dynamicsAt(ddZero, 500);
        expect(dynPosMid).not.toBeCloseTo(dynNegMid, 0);

        // Verify that the zero-protraction case is between the positive and negative
        // (or at least different from both)
        expect(dynZeroMid).not.toBeCloseTo(dynPosMid, 0);
      });

      it('curvature=0 special case: x(t) = t^2(3-2t) which gives date=dynamics/100 * endDate', () => {
        // When curvature=0, protraction=0: x1=0, x2=1
        // Both x(t) and y(t) use the same cubic: (3-2t)*t^2
        // This means the Bezier x maps directly to the S-curve y, creating a relationship
        // where date fraction equals dynamics fraction.
        const dd = dyn({
          startDate: 0,
          endDate: 1000,
          volume: 0,
          transitionTo: 100,
          curvature: 0,
          protraction: 0,
        });

        // dynamics at any date should equal date/10
        for (const date of [0, 100, 200, 300, 400, 500, 600, 700, 800, 900, 1000]) {
          expect(dynamicsAt(dd, date)).toBeCloseTo(date / 10, 0);
        }
      });
    });
  });

  /**
   * The `dynamicsMap === null` branch of the static entry point: with no dynamics
   * instructions anywhere, every note gets the default velocity and nothing else is
   * touched.
   *
   * Added because a negative control found it unguarded — skipping the branch's first map
   * entry entirely left all 6032 tests and `npm run gate` green. It is reachable in
   * production (`Performance` passes `mpm.dynamics`, which is null for a performance that
   * declares no `dynamicsMap`), so this is a gap in the oracle rather than dead code.
   */
  describe('renderDynamicsToMap with no dynamicsMap at all', () => {
    it('gives every note the default velocity, first one included, and returns no channelVolumeMap', () => {
      const map = GenericMap.createGenericMap('score')!;
      for (const [name, date] of [
        ['note', 0],
        ['rest', 10],
        ['note', 20],
      ] as const) {
        const e = new Element(name);
        e.addAttribute(new Attribute('date', String(date)));
        map.addElement(e);
      }

      expect(DynamicsMap.renderDynamicsToMap(map, null)).toBeNull();
      expect(
        map
          .getAllElements()
          .map((e) => [e.getValue().getLocalName(), e.getValue().getAttributeValue('velocity')]),
      ).toEqual([
        ['note', '100.0'],
        ['rest', null],
        ['note', '100.0'],
      ]);
    });
  });
});
