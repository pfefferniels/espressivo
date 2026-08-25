import { describe, it, expect } from 'vitest';
import { okValue } from '../../support/result.js';
import { expectOptionsRoundTrip } from '../../support/optionsRoundTrip.js';
import { DynamicsMap, type AddDynamicsOptions } from '../../../src/mpm/elements/maps/DynamicsMap.js';
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
 * It goes through the real {@link resolveDynamics}, so the substitutions — an omitted
 * `transitionTo` becoming `volume`, omitted curve parameters becoming 0.0, the control points
 * being derived — are the ones under test rather than a second implementation of them.
 * `endDate` defaults to `Number.MAX_VALUE`, which is what `GenericMap.nextDateOfType` answers
 * for a last instruction.
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

describe('DynamicsMap', () => {
  // Shared by every describe below that needs a real map rather than a bare element: a
  // `<dynamics>` only means something inside a `dynamicsMap`, because that is what supplies
  // the entry's date key, its `endDate` and the style in scope.
  const parse = (xml: string): Element => new Builder().build(xml).getRootElement();

  const mapOf = (dynamics: string): DynamicsMap =>
    okValue(
      DynamicsMap.createDynamicsMap(
        parse(`<dynamicsMap xmlns="http://www.cemfi.de/mpm/ns/1.0">${dynamics}</dynamicsMap>`),
      ),
    );

  describe('createDynamicsMap', () => {
    it('should create an empty dynamics map', () => {
      const map = DynamicsMap.createDynamicsMap();
      expect(map).not.toBeNull();
      expect(map!.getType()).toBe('dynamicsMap');
    });

    it('should start with size 0', () => {
      const map = DynamicsMap.createDynamicsMap();
      expect(map.size()).toBe(0);
      expect(map.isEmpty()).toBe(true);
    });

    it('should have an XML element', () => {
      const map = DynamicsMap.createDynamicsMap();
      expect(map.getXml()).not.toBeNull();
      expect(map.getXml()!.getLocalName()).toBe('dynamicsMap');
    });
  });

  describe('addDynamics', () => {
    it('should add a constant dynamics instruction', () => {
      const map = DynamicsMap.createDynamicsMap();
      const index = map.addDynamics({ date: 0, volume: '80' });
      expect(index).toBeGreaterThanOrEqual(0);
      expect(map.size()).toBe(1);
    });

    it('should add dynamics at the correct date', () => {
      const map = DynamicsMap.createDynamicsMap();
      map.addDynamics({ date: 0, volume: '60' });
      map.addDynamics({ date: 960, volume: '100' });

      expect(map.size()).toBe(2);
      expect(map.getFirstElement()!.getAttributeValue('date')).toBe('0');
      expect(map.getFirstElement()!.getAttributeValue('volume')).toBe('60');
      expect(map.getLastElement()!.getAttributeValue('date')).toBe('960');
      expect(map.getLastElement()!.getAttributeValue('volume')).toBe('100');
    });

    it('should add dynamics with transition', () => {
      const map = DynamicsMap.createDynamicsMap();
      const index = map.addDynamics({ date: 0, volume: '60', transitionTo: '100' });

      const elem = map.getElement(index)!;
      expect(elem.getAttributeValue('volume')).toBe('60');
      expect(elem.getAttributeValue('transition.to')).toBe('100');
    });

    it('should add dynamics with curvature and protraction', () => {
      const map = DynamicsMap.createDynamicsMap();
      const index = map.addDynamics({
        date: 0,
        volume: '60',
        transitionTo: '100',
        curvature: 0.5,
        protraction: 0.3,
      });

      const elem = map.getElement(index)!;
      expect(elem.getAttributeValue('curvature')).toBe('0.5');
      expect(elem.getAttributeValue('protraction')).toBe('0.3');
    });

    it('should add dynamics with subNoteDynamics flag', () => {
      const map = DynamicsMap.createDynamicsMap();
      const index = map.addDynamics({
        date: 0,
        volume: '60',
        transitionTo: '100',
        curvature: 0.5,
        protraction: 0.3,
        subNoteDynamics: true,
      });

      const elem = map.getElement(index)!;
      expect(elem.getAttributeValue('subNoteDynamics')).toBe('true');
    });

    it('should add dynamics with id', () => {
      const map = DynamicsMap.createDynamicsMap();
      const index = map.addDynamics({ date: 0, volume: '80', id: 'dyn-1' });

      const elem = map.getElement(index)!;
      const idAttr = elem.getAttribute('id', 'http://www.w3.org/XML/1998/namespace');
      expect(idAttr).not.toBeNull();
      expect(idAttr!.getValue()).toBe('dyn-1');
    });

    it('should take a numeric volume as readily as a spelled one', () => {
      const map = DynamicsMap.createDynamicsMap();
      const index = map.addDynamics({ date: 0, volume: 80 });
      expect(map.size()).toBe(1);
      expect(map.getElement(index)!.getAttributeValue('volume')).toBe('80');
    });

    it('should write every attribute it is given', () => {
      const map = DynamicsMap.createDynamicsMap();
      const index = map.addDynamics({
        date: 0,
        volume: '50',
        transitionTo: '100',
        curvature: 0.3,
        protraction: 0.2,
        subNoteDynamics: true,
        id: 'dyn-data-1',
      });
      const elem = map.getElement(index)!;
      expect(elem.getAttributeValue('volume')).toBe('50');
      expect(elem.getAttributeValue('transition.to')).toBe('100');
      expect(elem.getAttributeValue('curvature')).toBe('0.3');
      expect(elem.getAttributeValue('protraction')).toBe('0.2');
      expect(elem.getAttributeValue('subNoteDynamics')).toBe('true');
    });

    it('should maintain sorted order when adding out of order', () => {
      const map = DynamicsMap.createDynamicsMap();
      map.addDynamics({ date: 960, volume: '100' });
      map.addDynamics({ date: 0, volume: '60' });
      map.addDynamics({ date: 480, volume: '80' });

      expect(map.size()).toBe(3);
      expect(map.getElement(0)!.getAttributeValue('date')).toBe('0');
      expect(map.getElement(1)!.getAttributeValue('date')).toBe('480');
      expect(map.getElement(2)!.getAttributeValue('date')).toBe('960');
    });
  });

  describe('getDynamicsDataOf', () => {
    it('should return null for an empty map', () => {
      const map = DynamicsMap.createDynamicsMap();
      expect(map.getDynamicsDataOf(0)).toBeNull();
    });

    it('should return null for negative index', () => {
      const map = DynamicsMap.createDynamicsMap();
      map.addDynamics({ date: 0, volume: '80' });
      expect(map.getDynamicsDataOf(-1)).toBeNull();
    });

    it('should return DynamicsData for a valid constant dynamics', () => {
      const map = DynamicsMap.createDynamicsMap();
      map.addDynamics({ date: 0, volume: '80' });

      const dd = map.getDynamicsDataOf(0)!;
      expect(dd).not.toBeNull();
      expect(dd.startDate).toBe(0);
      expect(dd.volume).toBe(80);
      expect(dd.volumeString).toBe('80');
    });

    it('should detect constant dynamics correctly (no transition.to attribute)', () => {
      const map = DynamicsMap.createDynamicsMap();
      map.addDynamics({ date: 0, volume: '80' });

      const dd = map.getDynamicsDataOf(0)!;
      expect(dd.transitionTo).toBe(80);
      expect(dd.transitionToString).toBe('80');
      expect(isConstantDynamics(dd)).toBe(true);
    });

    it('should handle out-of-bounds index by clamping', () => {
      const map = DynamicsMap.createDynamicsMap();
      map.addDynamics({ date: 0, volume: '80' });

      const dd = map.getDynamicsDataOf(100);
      expect(dd).not.toBeNull();
      expect(dd!.volume).toBe(80);
    });

    it('should set endDate to MAX_VALUE for the last dynamics instruction', () => {
      const map = DynamicsMap.createDynamicsMap();
      map.addDynamics({ date: 0, volume: '80' });

      const dd = map.getDynamicsDataOf(0)!;
      expect(dd.endDate).toBe(Number.MAX_VALUE);
    });

    it('should set endDate to the start of the next dynamics instruction', () => {
      const map = DynamicsMap.createDynamicsMap();
      map.addDynamics({ date: 0, volume: '60' });
      map.addDynamics({ date: 960, volume: '100' });

      const dd = map.getDynamicsDataOf(0)!;
      expect(dd.endDate).toBe(960);
    });

    it('should retrieve dynamics with a transition', () => {
      const map = DynamicsMap.createDynamicsMap();
      map.addDynamics({ date: 0, volume: '60', transitionTo: '100' });

      const dd = map.getDynamicsDataOf(0)!;
      expect(dd.volume).toBe(60);
      expect(dd.transitionTo).toBe(100);
      expect(dd.transitionToString).toBe('100');
      expect(isConstantDynamics(dd)).toBe(false);
    });

    it('should retrieve multiple dynamics instructions', () => {
      const map = DynamicsMap.createDynamicsMap();
      map.addDynamics({ date: 0, volume: '60' });
      map.addDynamics({ date: 480, volume: '80' });
      map.addDynamics({ date: 960, volume: '100' });

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

  // Every transition in tests/integration/fixtures carries curvature="0.0"
  // protraction="0.0", which is what the fields default to anyway, so the certification suite
  // cannot see whether these two are read at all. These tests therefore use literal non-zero
  // values, which no fixture has.
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
      const straight = mapOf(
        '<dynamics date="0.0" volume="0" transition.to="100" curvature="0.0"' +
          ' protraction="0.0" /><dynamics date="1000.0" volume="100" />',
      ).getDynamicsDataOf(0)!;
      const curved = mapOf(
        '<dynamics date="0.0" volume="0" transition.to="100" curvature="0.9"' +
          ' protraction="0.0" /><dynamics date="1000.0" volume="100" />',
      ).getDynamicsDataOf(0)!;

      // Both curves are symmetric, so they agree at the midpoint and nowhere else - which is
      // where a suite that only sampled the centre would miss a dropped curvature.
      expect(dynamicsAt(curved, 500)).toBeCloseTo(50, 6);
      expect(dynamicsAt(straight, 500)).toBeCloseTo(50, 6);

      // High curvature holds the starting level longer and then climbs steeply, so the
      // curved crescendo is quieter than the straight one in its first half and louder in
      // its second.
      expect(dynamicsAt(curved, 250)).toBeLessThan(dynamicsAt(straight, 250));
      expect(dynamicsAt(curved, 750)).toBeGreaterThan(dynamicsAt(straight, 750));
    });
  });

  describe('addDynamics clamps the curve parameters', () => {
    it('clamps what addDynamics writes into the element', () => {
      const map = DynamicsMap.createDynamicsMap();
      const index = map.addDynamics({
        date: 0,
        volume: '60',
        transitionTo: '100',
        curvature: 1.5,
        protraction: -2.0,
      });
      const elem = map.getElement(index)!;

      expect(elem.getAttributeValue('curvature')).toBe('1');
      expect(elem.getAttributeValue('protraction')).toBe('-1');
    });

    /**
     * The clamp corrects the element and leaves the caller's object alone. Java writes the
     * corrected value back into the payload it was handed; that is an argument mutation
     * RULE I1 does not sanction, and no caller in `src/` reads the payload again.
     */
    it('clamps the element without touching the options object it was given', () => {
      const map = DynamicsMap.createDynamicsMap();
      const options = {
        date: 0,
        volume: '60',
        transitionTo: '100',
        curvature: -0.5,
        protraction: 4.0,
      };

      const elem = map.getElement(map.addDynamics(options))!;

      expect(elem.getAttributeValue('curvature')).toBe('0');
      expect(elem.getAttributeValue('protraction')).toBe('1');
      expect(options.curvature).toBe(-0.5);
      expect(options.protraction).toBe(4.0);
    });

    it('leaves an in-range value untouched', () => {
      const map = DynamicsMap.createDynamicsMap();
      const elem = map.getElement(
        map.addDynamics({
          date: 0,
          volume: '60',
          transitionTo: '100',
          curvature: 0.4,
          protraction: -0.44,
        }),
      )!;

      expect(elem.getAttributeValue('curvature')).toBe('0.4');
      expect(elem.getAttributeValue('protraction')).toBe('-0.44');
    });
  });

  describe('getDynamicsDataAt', () => {
    it('should return null for an empty map', () => {
      const map = DynamicsMap.createDynamicsMap();
      expect(map.getDynamicsDataAt(0)).toBeNull();
    });

    it('should return the dynamics data active at a given date', () => {
      const map = DynamicsMap.createDynamicsMap();
      map.addDynamics({ date: 0, volume: '60' });
      map.addDynamics({ date: 480, volume: '100' });

      const dd = map.getDynamicsDataAt(240);
      expect(dd).not.toBeNull();
      expect(dd!.volume).toBe(60);
    });

    it('should return the most recent dynamics at the exact date', () => {
      const map = DynamicsMap.createDynamicsMap();
      map.addDynamics({ date: 0, volume: '60' });
      map.addDynamics({ date: 480, volume: '100' });

      const dd = map.getDynamicsDataAt(480);
      expect(dd).not.toBeNull();
      expect(dd!.volume).toBe(100);
    });
  });

  describe('GenericMap operations', () => {
    it('should support removeElement by index', () => {
      const map = DynamicsMap.createDynamicsMap();
      map.addDynamics({ date: 0, volume: '60' });
      map.addDynamics({ date: 960, volume: '100' });

      map.removeElementAt(0);
      expect(map.size()).toBe(1);
      expect(map.getElement(0)!.getAttributeValue('volume')).toBe('100');
    });

    it('should support getElementBeforeAt', () => {
      const map = DynamicsMap.createDynamicsMap();
      map.addDynamics({ date: 0, volume: '60' });
      map.addDynamics({ date: 480, volume: '80' });
      map.addDynamics({ date: 960, volume: '100' });

      const elem = map.getElementBeforeAt(500);
      expect(elem).not.toBeNull();
      expect(elem!.getAttributeValue('volume')).toBe('80');
    });

    it('should support setId and getId', () => {
      const map = DynamicsMap.createDynamicsMap();
      expect(map.getId()).toBeNull();
      map.setId('dynamicsMap-1');
      expect(map.getId()).toBe('dynamicsMap-1');
    });

    it('should support addStyleSwitch', () => {
      const map = DynamicsMap.createDynamicsMap();
      const index = map.addStyleSwitch(0, 'myDynamicsStyle');
      expect(index).toBeGreaterThanOrEqual(0);
      expect(map.size()).toBe(1);

      const elem = map.getElement(index)!;
      expect(elem.getLocalName()).toBe('style');
      expect(elem.getAttributeValue('name.ref')).toBe('myDynamicsStyle');
    });
  });

  describe('DynamicsData', () => {
    /**
     * The predicate is `transitionTo === volume`, and these are the three states it can be
     * asked about: `numericDynamicsValue` never returns null and `resolveDynamics` fills an
     * absent `@transition.to` from `volume`, so neither field is ever null here.
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

    describe('resolving the same element twice', () => {
      /** The resolved half is `readonly` and derives its control points at read time. */
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

    describe('computeInnerControlPointsXPositions', () => {
      // The method is private; these reach it through `dynamicsAt` and
      // `subNoteDynamicsSegment`.

      it('curvature=0, protraction=0 => linear Bezier control points (x1=0, x2=1)', () => {
        // x1=0, x2=1 collapses the Bezier x(t) to t^2(3-2t), the same cubic as the dynamics
        // S-curve, so date 500 is t=0.5 and y = 0.5 * (100 - 50) + 50 = 75.
        const dd = dyn({
          startDate: 0,
          endDate: 1000,
          volume: 50,
          transitionTo: 100,
          curvature: 0,
          protraction: 0,
        });

        const dynAtMid = dynamicsAt(dd, 500);
        expect(dynAtMid).toBeCloseTo(75.0, 0);
      });

      it('curvature=0.5, protraction=0 => x1=0.5, x2=0.5', () => {
        // protraction=0 makes x1=curvature and x2=1-curvature, so both are 0.5 and x(0.5) is
        // still 0.5: the date midpoint keeps mapping to t=0.5, hence the same 75.
        const dd = dyn({
          startDate: 0,
          endDate: 1000,
          volume: 50,
          transitionTo: 100,
          curvature: 0.5,
          protraction: 0,
        });

        const dynAtMid = dynamicsAt(dd, 500);
        expect(dynAtMid).toBeCloseTo(75.0, 0);
      });

      it('curvature=0.3, protraction=0.4: verify x1 and x2 via formula', () => {
        // The formula gives x1=0.58, x2=0.82, both shifted right of the symmetric 0.3/0.7.
        // Checked through the curve: a right-shifted x means the transition happens later,
        // so the midpoint sits below the protraction=0 case.
        const dd = dyn({
          startDate: 0,
          endDate: 1000,
          volume: 0,
          transitionTo: 100,
          curvature: 0.3,
          protraction: 0.4,
        });

        expect(dynamicsAt(dd, 0)).toBeCloseTo(0.0, 5);
        expect(dynamicsAt(dd, 1000)).toBeCloseTo(100.0, 5);

        const dynAtMid = dynamicsAt(dd, 500);
        const ddSym = dyn({
          startDate: 0,
          endDate: 1000,
          volume: 0,
          transitionTo: 100,
          curvature: 0.3,
          protraction: 0,
        });

        const dynAtMidSym = dynamicsAt(ddSym, 500);
        expect(dynAtMid).toBeLessThan(dynAtMidSym);
      });

      it('curvature=0.3, protraction=-0.4: negative protraction shifts transition earlier', () => {
        // The formula gives x1=0.18, x2=0.42, both left of the symmetric 0.3/0.7, so the
        // transition happens earlier and the midpoint sits above the protraction=0 case.
        const dd = dyn({
          startDate: 0,
          endDate: 1000,
          volume: 0,
          transitionTo: 100,
          curvature: 0.3,
          protraction: -0.4,
        });

        expect(dynamicsAt(dd, 0)).toBeCloseTo(0.0, 5);
        expect(dynamicsAt(dd, 1000)).toBeCloseTo(100.0, 5);

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
        expect(dynAtMid).toBeGreaterThan(dynAtMidSym);
      });
    });

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

        // x(t) = t^2(3-2t) is exactly 0.5 at t=0.5, so date 500 is the midpoint in t as well
        // as in date space, and y(0.5) = 0.5 * (100 - 50) + 50 = 75.
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

        let prev = dynamicsAt(dd, 0);
        for (let d = 10; d <= 1000; d += 10) {
          const curr = dynamicsAt(dd, d);
          expect(curr).toBeGreaterThanOrEqual(prev - 0.01); // small tolerance for numerical precision
          prev = curr;
        }
      });
    });

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

        expect(dynamicsAt(dd, 0)).toBe(50);
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

        // y(0.5) = ((3 - 2*0.5) * 0.25) * (100 - 50) + 50 = 75.
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

        // With curvature=0, protraction=0 both x(t) and y(t) are t^2(3-2t), so t=0.25 falls
        // at date 156.25 with dynamics 15.625, and t=0.75 at date 843.75 with 84.375.
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
        // y(0.5) = 0.5 * (50 - 100) + 100 = 75, the same midpoint as the ascending case.
        expect(dynamicsAt(dd, 500)).toBeCloseTo(75.0, 0);
      });

      it('high curvature produces a sharper S-curve', () => {
        // High curvature pulls the inner control points together, making the transition more
        // abrupt: a slower start and a faster end than the linear curve.
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

        expect(dynamicsAt(ddSharp, 300)).toBeLessThan(dynamicsAt(ddLinear, 300));
        expect(dynamicsAt(ddSharp, 700)).toBeGreaterThan(dynamicsAt(ddLinear, 700));
      });
    });

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
        expect(segments[0][0]).toBeCloseTo(0, 5);
        expect(segments[0][1]).toBeCloseTo(50, 1);
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

    // `getDynamicsDataOf` always sets `volumeString` and also resolves `volume` to a number
    // through the style in scope, so a style-relative `@volume` needs a real document to
    // exercise: without a style there is no def to resolve the name against.
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
        // The string half of the pair, which `addDynamicsFromData` prefers on the way out.
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
        // No style means no def to consult and no number to parse, so
        // `DynamicsStyle.getNumericValueStatic` logs and answers 100 rather than null.
        const dd = mapOf('<dynamics date="0.0" volume="forte" />').getDynamicsDataOf(0)!;
        expect(dd.volumeString).toBe('forte');
        expect(dd.volume).toBe(100.0);
      });
    });

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

        // x(t) and y(t)/100 are the same function here, so dynamics = date/10 throughout.
        expect(dynamicsAt(dd, 156.25)).toBeCloseTo(15.625, 0);
        expect(dynamicsAt(dd, 500)).toBeCloseTo(50.0, 0);
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

        const crescMid = dynamicsAt(ddCresc, 500);
        const dimMid = dynamicsAt(ddDim, 500);
        expect(crescMid + dimMid).toBeCloseTo(100.0, 0);
      });

      it('protraction shifts the x-curve control points, changing dynamics distribution', () => {
        // Positive protraction raises x1 and x2, so the x-curve accumulates faster at small
        // t, a given date maps to a lower t, and the transition is delayed.
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

        expect(dynamicsAt(ddPos, 0)).toBeCloseTo(0, 5);
        expect(dynamicsAt(ddNeg, 0)).toBeCloseTo(0, 5);
        expect(dynamicsAt(ddPos, 1000)).toBeCloseTo(100, 5);
        expect(dynamicsAt(ddNeg, 1000)).toBeCloseTo(100, 5);

        const dynPosMid = dynamicsAt(ddPos, 500);
        const dynNegMid = dynamicsAt(ddNeg, 500);
        const dynZeroMid = dynamicsAt(ddZero, 500);
        expect(dynPosMid).not.toBeCloseTo(dynNegMid, 0);

        expect(dynZeroMid).not.toBeCloseTo(dynPosMid, 0);
      });

      it('curvature=0 special case: x(t) = t^2(3-2t) which gives date=dynamics/100 * endDate', () => {
        // With x1=0, x2=1 both x(t) and y(t) use the cubic (3-2t)*t^2, so the date fraction
        // equals the dynamics fraction.
        const dd = dyn({
          startDate: 0,
          endDate: 1000,
          volume: 0,
          transitionTo: 100,
          curvature: 0,
          protraction: 0,
        });

        for (const date of [0, 100, 200, 300, 400, 500, 600, 700, 800, 900, 1000]) {
          expect(dynamicsAt(dd, date)).toBeCloseTo(date / 10, 0);
        }
      });
    });
  });

  /**
   * The `dynamicsMap === null` branch of the static entry point: with no dynamics
   * instructions anywhere, every note gets the default velocity and nothing else is touched.
   *
   * A negative control found the branch unpinned — skipping its first map entry entirely left
   * the whole suite and `npm run gate` green. It is reachable in production, because
   * `Performance` passes `mpm.dynamics`, which is null for a performance that declares no
   * `dynamicsMap`.
   */
  describe('renderDynamicsToMap with no dynamicsMap at all', () => {
    it('gives every note the default velocity, first one included, and returns no channelVolumeMap', () => {
      const map = okValue(GenericMap.createGenericMap('score'));
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
          .map((e) => [e.value.getLocalName(), e.value.getAttributeValue('velocity')]),
      ).toEqual([
        ['note', '100.0'],
        ['rest', null],
        ['note', '100.0'],
      ]);
    });
  });
});

describe('getDynamicsOptionsOf / updateDynamicsAt', () => {
  const makeMap = () => DynamicsMap.createDynamicsMap();

  it('round-trips every shape addDynamics can write', () => {
    expectOptionsRoundTrip<DynamicsMap, AddDynamicsOptions>({
      makeMap,
      add: (map, o) => map.addDynamics(o),
      read: (map, i) => map.getDynamicsOptionsOf(i),
      samples: [
        { date: 0, volume: 60 },
        {
          date: 720,
          volume: 60,
          transitionTo: 100,
          curvature: 0.4,
          protraction: -0.25,
          subNoteDynamics: true,
          id: 'd1',
        },
        { date: 1440, volume: 'forte', transitionTo: 'pianissimo' },
        // Curve parameters with no `@transition.to` for them to shape: `addDynamics` writes
        // them anyway, so the law has to carry them anyway.
        { date: 2160, volume: 92.5, curvature: 0.125, protraction: 0.75, id: 'has-a-dash' },
      ],
    });
  });

  it('reads what the document says, where getDynamicsDataOf reads what it renders as', () => {
    const map = makeMap();
    map.addDynamics({ date: 0, volume: 60, transitionTo: 100 });

    // No `@curvature`. The renderer substitutes 0.0; the document says nothing.
    expect(map.getDynamicsOptionsOf(0)?.curvature).toBeUndefined();
    expect(map.getDynamicsDataOf(0)?.curvature).toBe(0.0);
    expect(map.getDynamicsOptionsOf(0)?.subNoteDynamics).toBeUndefined();
    expect(map.getDynamicsDataOf(0)?.subNoteDynamics).toBe(false);

    // An unresolvable name is a name here and the hardcoded 100.0 there.
    const named = makeMap();
    named.addDynamics({ date: 0, volume: 'forte' });
    expect(named.getDynamicsOptionsOf(0)?.volume).toBe('forte');
    expect(named.getDynamicsDataOf(0)?.volume).toBe(100.0);
  });

  it('leaves an omitted field alone, removes one patched to undefined', () => {
    const map = makeMap();
    map.addDynamics({ date: 0, volume: 60, transitionTo: 100, curvature: 0.4 });

    expect(map.updateDynamicsAt(0, { volume: 90 })).toBe(true);
    expect(map.getDynamicsOptionsOf(0)).toMatchObject({
      volume: 90,
      transitionTo: 100,
      curvature: 0.4,
    });

    map.updateDynamicsAt(0, { curvature: undefined });
    expect(map.getDynamicsOptionsOf(0)?.curvature).toBeUndefined();
    expect(map.getElement(0)?.getAttribute('curvature')).toBeNull();
  });

  it('writes through an existing attribute rather than moving it to the end', () => {
    const map = makeMap();
    map.addDynamics({ date: 0, volume: 60, transitionTo: 100, curvature: 0.4, id: 'd1' });
    const before = map.getElement(0)?.toXML();

    map.updateDynamicsAt(0, { volume: 60 });
    expect(map.getElement(0)?.toXML()).toBe(before);
  });

  it('never touches an attribute no option names', () => {
    const map = makeMap();
    map.addDynamics({ date: 0, volume: 60 });
    map.getElement(0)?.addAttribute(new Attribute('corresp', 'arg1'));

    map.updateDynamicsAt(0, { volume: 90, id: 'd1' });
    expect(map.getElement(0)?.getAttributeValue('corresp')).toBe('arg1');
  });

  it('re-keys and re-sorts the map when @date is patched', () => {
    const map = makeMap();
    map.addDynamics({ date: 0, volume: 60, id: 'first' });
    map.addDynamics({ date: 1000, volume: 90, id: 'second' });

    map.updateDynamicsAt(0, { date: 2000 });

    expect(map.getAllElements().map((e) => e.key)).toEqual([1000, 2000]);
    expect(map.getElement(0)?.getAttributeValue('xml:id')).toBe('second');
    // The lookup index moved with it, which is the half that writing the attribute alone misses.
    expect(map.getElementBeforeAt(2500)?.getAttributeValue('xml:id')).toBe('first');
  });

  /**
   * `clampCurvature` claims an out-of-range value "can neither be written to a document nor
   * read back out of one". A patcher that skipped the clamps would be the hole in that.
   */
  it('clamps the curve parameters a patch tries to write', () => {
    const map = makeMap();
    map.addDynamics({ date: 0, volume: 60, transitionTo: 100, curvature: 0.4, protraction: 0.2 });

    map.updateDynamicsAt(0, { curvature: 5, protraction: -3 });
    expect(map.getElement(0)?.getAttributeValue('curvature')).toBe('1');
    expect(map.getElement(0)?.getAttributeValue('protraction')).toBe('-1');

    map.updateDynamicsAt(0, { curvature: -0.5, protraction: 4 });
    expect(map.getElement(0)?.getAttributeValue('curvature')).toBe('0');
    expect(map.getElement(0)?.getAttributeValue('protraction')).toBe('1');
  });

  it('spells subNoteDynamics="false" where addDynamics would omit the attribute', () => {
    const map = makeMap();
    map.addDynamics({ date: 0, volume: 60, subNoteDynamics: true });

    map.updateDynamicsAt(0, { subNoteDynamics: false });
    expect(map.getElement(0)?.getAttributeValue('subNoteDynamics')).toBe('false');
    // Same meaning to the renderer, so re-adding what is read drops it again.
    expect(map.getDynamicsDataOf(0)?.subNoteDynamics).toBe(false);

    map.updateDynamicsAt(0, { subNoteDynamics: undefined });
    expect(map.getElement(0)?.getAttribute('subNoteDynamics')).toBeNull();
  });

  it('refuses an entry that is not a <dynamics>', () => {
    const map = makeMap();
    map.addStyleSwitch(0, 'someStyle');
    expect(map.getDynamicsOptionsOf(0)).toBeNull();
    expect(map.updateDynamicsAt(0, { volume: 90 })).toBe(false);
  });
});
