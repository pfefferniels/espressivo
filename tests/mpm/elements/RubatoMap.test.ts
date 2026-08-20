import { describe, it, expect } from 'vitest';
import { okValue } from '../../support/result.js';
import { RubatoMap } from '../../../src/mpm/elements/maps/RubatoMap.js';
import { RubatoData } from '../../../src/mpm/elements/maps/data/RubatoData.js';
import { resolveRubato } from '../../../src/mpm/elements/maps/data/rubato.js';
import { RubatoDef } from '../../../src/mpm/elements/styles/defs/RubatoDef.js';
import { GenericMap } from '../../../src/mpm/elements/maps/GenericMap.js';
import { Element, Attribute } from '../../../src/xml/XomTypes.js';
import { Mpm } from '../../../src/mpm/Mpm.js';

describe('RubatoMap', () => {
  // ---------------------------------------------------------------
  // Create a rubato map
  // ---------------------------------------------------------------
  describe('createRubatoMap', () => {
    it('should create an empty rubato map', () => {
      const map = RubatoMap.createRubatoMap();
      expect(map).not.toBeNull();
      expect(map!.getType()).toBe('rubatoMap');
    });

    it('should start with size 0', () => {
      const map = RubatoMap.createRubatoMap();
      expect(map.size()).toBe(0);
      expect(map.isEmpty()).toBe(true);
    });

    it('should have an XML element', () => {
      const map = RubatoMap.createRubatoMap();
      expect(map.getXml()).not.toBeNull();
      expect(map.getXml()!.getLocalName()).toBe('rubatoMap');
    });
  });

  // ---------------------------------------------------------------
  // Add rubato instruction
  // ---------------------------------------------------------------
  describe('addRubato', () => {
    it('should add a rubato with full numeric parameters', () => {
      const map = RubatoMap.createRubatoMap();
      const index = map.addRubato(0, 720, 2.0, 0.0, 1.0, true);
      expect(index).toBeGreaterThanOrEqual(0);
      expect(map.size()).toBe(1);
    });

    it('should add a rubato with name.ref (def name) and loop', () => {
      const map = RubatoMap.createRubatoMap();
      const index = map.addRubato(0, 'myRubatoDef', true);
      expect(index).toBeGreaterThanOrEqual(0);
      expect(map.size()).toBe(1);

      const elem = map.getElement(index)!;
      expect(elem.getAttributeValue('name.ref')).toBe('myRubatoDef');
      expect(elem.getAttributeValue('loop')).toBe('true');
    });

    it('should add a rubato from RubatoData', () => {
      const map = RubatoMap.createRubatoMap();
      const rd = new RubatoData();
      rd.startDate = 0;
      rd.frameLength = 720;
      rd.intensity = 2.0;
      rd.lateStart = 0.0;
      rd.earlyEnd = 1.0;
      rd.loop = true;

      const index = map.addRubato(rd);
      expect(index).toBeGreaterThanOrEqual(0);
      expect(map.size()).toBe(1);
    });

    it('should store attributes correctly for numeric rubato', () => {
      const map = RubatoMap.createRubatoMap();
      const index = map.addRubato(0, 720, 2.0, 0.1, 0.9, false);
      const elem = map.getElement(index)!;

      expect(elem.getAttributeValue('date')).toBe('0');
      expect(elem.getAttributeValue('frameLength')).toBe('720');
      expect(elem.getAttributeValue('intensity')).toBe('2');
      expect(elem.getAttributeValue('lateStart')).toBe('0.1');
      expect(elem.getAttributeValue('earlyEnd')).toBe('0.9');
      expect(elem.getAttributeValue('loop')).toBe('false');
    });

    it('should maintain sorted order when adding out of order', () => {
      const map = RubatoMap.createRubatoMap();
      map.addRubato(960, 720, 1.0, 0.0, 1.0, true);
      map.addRubato(0, 720, 2.0, 0.0, 1.0, true);
      map.addRubato(480, 720, 0.5, 0.0, 1.0, true);

      expect(map.size()).toBe(3);
      expect(map.getElement(0)!.getAttributeValue('date')).toBe('0');
      expect(map.getElement(1)!.getAttributeValue('date')).toBe('480');
      expect(map.getElement(2)!.getAttributeValue('date')).toBe('960');
    });

    it('should store xmlId from RubatoData', () => {
      const map = RubatoMap.createRubatoMap();
      const rd = new RubatoData();
      rd.startDate = 0;
      rd.frameLength = 720;
      rd.intensity = 1.0;
      rd.lateStart = 0.0;
      rd.earlyEnd = 1.0;
      rd.loop = false;
      rd.xmlId = 'rubato-1';

      const index = map.addRubato(rd);
      const elem = map.getElement(index)!;
      const idAttr = elem.getAttribute('id', 'http://www.w3.org/XML/1998/namespace');
      expect(idAttr).not.toBeNull();
      expect(idAttr!.getValue()).toBe('rubato-1');
    });
  });

  // ---------------------------------------------------------------
  // getRubatoDataOf
  // ---------------------------------------------------------------
  describe('getRubatoDataOf', () => {
    it('should return null for an empty map', () => {
      const map = RubatoMap.createRubatoMap();
      const rd = map.getRubatoDataOf(0);
      expect(rd).toBeNull();
    });

    it('should return null for negative index', () => {
      const map = RubatoMap.createRubatoMap();
      map.addRubato(0, 720, 1.0, 0.0, 1.0, true);
      expect(map.getRubatoDataOf(-1)).toBeNull();
    });

    it('should return RubatoData for a valid rubato instruction', () => {
      const map = RubatoMap.createRubatoMap();
      map.addRubato(0, 720, 2.0, 0.1, 0.9, true);

      const rd = map.getRubatoDataOf(0);
      expect(rd).not.toBeNull();
      expect(rd!.startDate).toBe(0);
      expect(rd!.frameLength).toBe(720);
      expect(rd!.intensity).toBe(2.0);
      expect(rd!.lateStart).toBe(0.1);
      expect(rd!.earlyEnd).toBe(0.9);
      expect(rd!.loop).toBe(true);
    });

    it('should set endDate to MAX_VALUE for the last rubato instruction', () => {
      const map = RubatoMap.createRubatoMap();
      map.addRubato(0, 720, 1.0, 0.0, 1.0, true);

      const rd = map.getRubatoDataOf(0)!;
      expect(rd.endDate).toBe(Number.MAX_VALUE);
    });

    it('should set endDate to the start of the next rubato instruction', () => {
      const map = RubatoMap.createRubatoMap();
      map.addRubato(0, 720, 1.0, 0.0, 1.0, true);
      map.addRubato(1440, 720, 2.0, 0.0, 1.0, true);

      const rd = map.getRubatoDataOf(0)!;
      expect(rd.endDate).toBe(1440);
    });

    it('should handle out-of-bounds index by clamping', () => {
      const map = RubatoMap.createRubatoMap();
      map.addRubato(0, 720, 2.0, 0.0, 1.0, true);

      const rd = map.getRubatoDataOf(100);
      expect(rd).not.toBeNull();
      expect(rd!.intensity).toBe(2.0);
    });

    it('round-trip: addRubato -> getRubatoDataOf preserves values', () => {
      const map = RubatoMap.createRubatoMap();
      map.addRubato(100, 360, 0.5, 0.2, 0.8, false);

      const rd = map.getRubatoDataOf(0)!;
      expect(rd.startDate).toBe(100);
      expect(rd.frameLength).toBe(360);
      expect(rd.intensity).toBe(0.5);
      expect(rd.lateStart).toBe(0.2);
      expect(rd.earlyEnd).toBe(0.8);
      expect(rd.loop).toBe(false);
    });
  });

  // ---------------------------------------------------------------
  // RubatoData
  // ---------------------------------------------------------------
  describe('RubatoData', () => {
    it('should have correct default values', () => {
      const rd = new RubatoData();
      expect(rd.startDate).toBe(0.0);
      expect(rd.frameLength).toBeNull();
      expect(rd.intensity).toBe(1.0);
      expect(rd.lateStart).toBe(0.0);
      expect(rd.earlyEnd).toBe(1.0);
      expect(rd.loop).toBe(false);
      expect(rd.xmlId).toBeNull();
      expect(rd.rubatoDefString).toBeNull();
    });

    /**
     * The write payload's nulls are the point of it: a `<rubato>` that names a def spells
     * out none of the four numbers, and `addRubato` must emit no attribute for each one it
     * has nothing for. Replaces the two `clone()` tests, which exercised a method with no
     * caller anywhere in `src/`; what is worth pinning is the serialization.
     */
    it('omits every attribute the payload leaves null', () => {
      const map = RubatoMap.createRubatoMap();
      const rd = new RubatoData();
      rd.startDate = 100;
      rd.rubatoDefString = 'myRubatoDef';
      rd.frameLength = null;
      rd.intensity = null;
      rd.lateStart = null;
      rd.earlyEnd = null;

      const elem = map.getElement(map.addRubato(rd))!;
      expect(elem.getAttributeValue('date')).toBe('100');
      expect(elem.getAttributeValue('name.ref')).toBe('myRubatoDef');
      expect(elem.getAttribute('frameLength')).toBeNull();
      expect(elem.getAttribute('intensity')).toBeNull();
      expect(elem.getAttribute('lateStart')).toBeNull();
      expect(elem.getAttribute('earlyEnd')).toBeNull();
      // `loop` and `date` are unconditional
      expect(elem.getAttributeValue('loop')).toBe('false');
    });

    it('writes every attribute the payload does supply', () => {
      const map = RubatoMap.createRubatoMap();
      const rd = new RubatoData();
      rd.startDate = 100;
      rd.frameLength = 720;
      rd.intensity = 2.0;
      rd.lateStart = 0.1;
      rd.earlyEnd = 0.9;
      rd.loop = true;
      rd.xmlId = 'rubato-clone';

      const elem = map.getElement(map.addRubato(rd))!;
      expect(elem.getAttributeValue('frameLength')).toBe('720');
      expect(elem.getAttributeValue('intensity')).toBe('2');
      expect(elem.getAttributeValue('lateStart')).toBe('0.1');
      expect(elem.getAttributeValue('earlyEnd')).toBe('0.9');
      expect(elem.getAttributeValue('loop')).toBe('true');
      expect(elem.getAttribute('id', 'http://www.w3.org/XML/1998/namespace')!.getValue()).toBe(
        'rubato-clone',
      );
    });
  });

  // ---------------------------------------------------------------
  // resolveRubato — inheritance from the def, and the boundary clamps
  // ---------------------------------------------------------------
  /**
   * The read half, unit-tested directly. `getRubatoDataOf` above covers the path where the
   * element declares everything; these cover the three that used to be spelled as nullable
   * fields on the datum — inherit, fall back to the identity warp, and reject.
   */
  describe('resolveRubato', () => {
    const span = { startDate: 0, endDate: 1440 };
    const absent = {
      frameLength: null,
      intensity: null,
      lateStart: null,
      earlyEnd: null,
      loop: null,
    };

    const def = (frameLength: number, intensity: number, lateStart: number, earlyEnd: number) =>
      okValue(RubatoDef.createRubatoDef('d', frameLength, intensity, lateStart, earlyEnd));

    it('rejects an instruction with no frame from either source', () => {
      expect(resolveRubato(span, absent, null)).toBeNull();
    });

    it('inherits all four parameters from the def', () => {
      const r = resolveRubato(span, absent, def(360, 2.0, 0.2, 0.8));
      expect(r).toEqual({
        ...span,
        frameLength: 360,
        intensity: 2.0,
        lateStart: 0.2,
        earlyEnd: 0.8,
        loop: false,
      });
    });

    it('lets a declared value beat the def', () => {
      const r = resolveRubato(
        span,
        { ...absent, frameLength: 720, intensity: 3.0 },
        def(360, 2.0, 0.2, 0.8),
      )!;
      expect(r.frameLength).toBe(720);
      expect(r.intensity).toBe(3.0);
      // the two it does NOT declare still come from the def
      expect(r.lateStart).toBe(0.2);
      expect(r.earlyEnd).toBe(0.8);
    });

    /**
     * Presence, not usability: a malformed attribute is `NaN`, which is not nullish, so it
     * beats the def exactly as a usable value would — and then survives the clamps, since
     * every comparison against `NaN` is false. Pinned here because a `?? ` written against
     * `Number.isNaN` instead of nullishness would silently re-warp such documents.
     */
    it('a malformed declared value still beats the def, and is not clamped away', () => {
      const r = resolveRubato(
        span,
        { ...absent, frameLength: NaN, lateStart: NaN, earlyEnd: NaN },
        def(360, 2.0, 0.2, 0.8),
      )!;
      expect(r.frameLength).toBeNaN();
      expect(r.lateStart).toBeNaN();
      expect(r.earlyEnd).toBeNaN();
    });

    it('falls back to the identity warp where neither source says anything', () => {
      const r = resolveRubato(span, { ...absent, frameLength: 720 }, null)!;
      expect(r.intensity).toBe(1.0);
      expect(r.lateStart).toBe(0.0);
      expect(r.earlyEnd).toBe(1.0);
      expect(r.loop).toBe(false);
    });

    it('floors lateStart at 0 and caps earlyEnd at 1', () => {
      const r = resolveRubato(
        span,
        { ...absent, frameLength: 720, lateStart: -0.5, earlyEnd: 1.5 },
        null,
      )!;
      expect(r.lateStart).toBe(0.0);
      expect(r.earlyEnd).toBe(1.0);
    });

    it('widens an inverted window to the whole frame', () => {
      const r = resolveRubato(
        span,
        { ...absent, frameLength: 720, lateStart: 0.8, earlyEnd: 0.2 },
        null,
      )!;
      expect(r.lateStart).toBe(0.0);
      expect(r.earlyEnd).toBe(1.0);
    });

    it('widens an empty window to the whole frame', () => {
      const r = resolveRubato(
        span,
        { ...absent, frameLength: 720, lateStart: 0.5, earlyEnd: 0.5 },
        null,
      )!;
      expect(r.lateStart).toBe(0.0);
      expect(r.earlyEnd).toBe(1.0);
    });
  });

  // ---------------------------------------------------------------
  // Rubato power curve mathematics
  // ---------------------------------------------------------------
  describe('renderRubatoToMap - power curve math', () => {
    /**
     * Helper: create a GenericMap (positionMap) with entries that have "date.perf" attributes.
     * The rubato rendering modifies "date.perf" attribute values.
     */
    function createTestMap(dates: number[]): GenericMap {
      const map = okValue(GenericMap.createGenericMap('positionMap'));
      for (const date of dates) {
        const e = new Element('note', Mpm.MPM_NAMESPACE);
        e.addAttribute(new Attribute('date', String(date)));
        e.addAttribute(new Attribute('date.perf', String(date)));
        map.addElement(e);
      }
      return map;
    }

    function getDatePerf(map: GenericMap, index: number): number {
      const elem = map.getElement(index)!;
      return parseFloat(elem.getAttributeValue('date.perf')!);
    }

    it('identity rubato: intensity=1.0, lateStart=0, earlyEnd=1 produces no offset', () => {
      // With intensity=1.0, lateStart=0, earlyEnd=1:
      // d = pow(localDate/frameLength, 1.0) * (1.0 - 0.0) + 0.0 * frameLength
      // d = (localDate/frameLength) * frameLength = localDate
      // offset = d - localDate = 0
      const rubatoMap = RubatoMap.createRubatoMap();
      rubatoMap.addRubato(0, 720, 1.0, 0.0, 1.0, true);

      const map = createTestMap([0, 180, 360, 540, 720]);
      rubatoMap.renderRubatoToMap(map);

      // All dates should remain the same (offsets are 0)
      expect(getDatePerf(map, 0)).toBeCloseTo(0, 5);
      expect(getDatePerf(map, 1)).toBeCloseTo(180, 5);
      expect(getDatePerf(map, 2)).toBeCloseTo(360, 5);
      expect(getDatePerf(map, 3)).toBeCloseTo(540, 5);
    });

    it('quadratic acceleration: intensity=2.0 compresses first half, expands second', () => {
      // frameLength=720, intensity=2.0, lateStart=0, earlyEnd=1, startDate=0
      // Formula: d = pow(localDate/720, 2.0) * (1.0 - 0.0) * 720 + 0.0 * 720
      //        = pow(localDate/720, 2.0) * 720
      //
      // At localDate=0:   d = pow(0, 2) * 720 = 0,     offset = 0 - 0 = 0
      // At localDate=180: d = pow(0.25, 2) * 720 = 0.0625 * 720 = 45,  offset = 45 - 180 = -135
      // At localDate=360: d = pow(0.5, 2) * 720 = 0.25 * 720 = 180,   offset = 180 - 360 = -180
      // At localDate=540: d = pow(0.75, 2) * 720 = 0.5625 * 720 = 405, offset = 405 - 540 = -135
      const rubatoMap = RubatoMap.createRubatoMap();
      rubatoMap.addRubato(0, 720, 2.0, 0.0, 1.0, true);

      const map = createTestMap([0, 180, 360, 540]);
      rubatoMap.renderRubatoToMap(map);

      expect(getDatePerf(map, 0)).toBeCloseTo(0, 5); // 0 + 0 = 0
      expect(getDatePerf(map, 1)).toBeCloseTo(45, 5); // 180 + (-135) = 45
      expect(getDatePerf(map, 2)).toBeCloseTo(180, 5); // 360 + (-180) = 180
      expect(getDatePerf(map, 3)).toBeCloseTo(405, 5); // 540 + (-135) = 405
    });

    it('square root deceleration: intensity=0.5 expands first half, compresses second', () => {
      // frameLength=720, intensity=0.5, lateStart=0, earlyEnd=1, startDate=0
      // d = pow(localDate/720, 0.5) * 720
      //
      // At localDate=180: d = pow(0.25, 0.5) * 720 = 0.5 * 720 = 360, offset = 360 - 180 = +180
      // At localDate=360: d = pow(0.5, 0.5) * 720 = ~0.7071 * 720 = ~509.12, offset = ~+149.12
      const rubatoMap = RubatoMap.createRubatoMap();
      rubatoMap.addRubato(0, 720, 0.5, 0.0, 1.0, true);

      const map = createTestMap([0, 180, 360]);
      rubatoMap.renderRubatoToMap(map);

      expect(getDatePerf(map, 0)).toBeCloseTo(0, 5);
      expect(getDatePerf(map, 1)).toBeCloseTo(360, 3); // 180 + 180 = 360
      expect(getDatePerf(map, 2)).toBeCloseTo(509.117, 1); // 360 + 149.117 = 509.117
    });

    it('at frame boundary (localDate=frameLength), d=frameLength, offset=0', () => {
      // At localDate=720: pow(1.0, 2.0) = 1.0, d = 720, offset = 0
      // But date=720 at startDate=0 is EXACTLY at the frame boundary.
      // In loop mode, this wraps: localDate = 720 % 720 = 0 => d = 0, offset = 0
      // Actually: the rubato loop condition is mapEntry.getKey() >= (rd.startDate + rd.frameLength!) => break when loop=false
      // For loop=true: mapEntry.getKey() >= rd.endDate => break
      // Since endDate=MAX_VALUE for a single entry, date=720 continues.
      // localDate = (720 - 0) % 720 = 0 => pow(0, 2) = 0, d = 0, offset = 0 - 0 = 0
      const rubatoMap = RubatoMap.createRubatoMap();
      rubatoMap.addRubato(0, 720, 2.0, 0.0, 1.0, true);

      const map = createTestMap([720]);
      rubatoMap.renderRubatoToMap(map);

      // localDate = 720 % 720 = 0, pow(0,2) = 0, d = 0, offset = 0
      expect(getDatePerf(map, 0)).toBeCloseTo(720, 5);
    });

    it('at start (localDate=0), offset is always 0 regardless of intensity', () => {
      // pow(0, anything) = 0, so d = lateStart * frameLength, offset = d - 0 = d
      // but localDate = (0 - 0) % 720 = 0
      // d = (pow(0, intensity) * (earlyEnd - lateStart) + lateStart) * frameLength
      // with lateStart=0: d = 0, offset = 0
      for (const intensity of [0.1, 0.5, 1.0, 2.0, 5.0]) {
        const rubatoMap = RubatoMap.createRubatoMap();
        rubatoMap.addRubato(0, 720, intensity, 0.0, 1.0, true);

        const map = createTestMap([0]);
        rubatoMap.renderRubatoToMap(map);

        expect(getDatePerf(map, 0)).toBeCloseTo(0, 5);
      }
    });

    it('with lateStart and earlyEnd: linear rubato shifts start and end proportionally', () => {
      // frameLength=720, intensity=1.0 (linear), lateStart=0.1, earlyEnd=0.9
      // d = (pow(localDate/720, 1.0) * (0.9 - 0.1) + 0.1) * 720
      // d = ((localDate/720) * 0.8 + 0.1) * 720
      //
      // At localDate=0:   d = (0 * 0.8 + 0.1) * 720 = 0.1 * 720 = 72,    offset = 72 - 0 = +72
      // At localDate=360: d = (0.5 * 0.8 + 0.1) * 720 = 0.5 * 720 = 360,  offset = 360 - 360 = 0
      // At localDate=720: d = (1.0 * 0.8 + 0.1) * 720 = 0.9 * 720 = 648,  offset = 648 - 720 = -72
      //
      // But: localDate = (date - startDate) % frameLength
      //   at date=0:   localDate = 0 % 720 = 0
      //   at date=360: localDate = 360 % 720 = 360
      //   (date=720 wraps to localDate=0 again in loop)
      const rubatoMap = RubatoMap.createRubatoMap();
      rubatoMap.addRubato(0, 720, 1.0, 0.1, 0.9, true);

      const map = createTestMap([0, 360]);
      rubatoMap.renderRubatoToMap(map);

      expect(getDatePerf(map, 0)).toBeCloseTo(72, 3); // 0 + 72
      expect(getDatePerf(map, 1)).toBeCloseTo(360, 3); // 360 + 0
    });

    it('concrete calculation: halfway with intensity=2.0', () => {
      // frameLength=720, intensity=2.0, lateStart=0, earlyEnd=1, startDate=0
      // At localDate=360 (halfway):
      //   pow(360/720, 2.0) = pow(0.5, 2.0) = 0.25
      //   d = (0.25 * (1 - 0) + 0) * 720 = 0.25 * 720 = 180
      //   new date.perf = 360 + (180 - 360) = 180
      const rubatoMap = RubatoMap.createRubatoMap();
      rubatoMap.addRubato(0, 720, 2.0, 0.0, 1.0, true);

      const map = createTestMap([360]);
      rubatoMap.renderRubatoToMap(map);

      expect(getDatePerf(map, 0)).toBeCloseTo(180, 5);
    });

    it('concrete calculation: three-quarters with intensity=2.0', () => {
      // At localDate=540 (3/4):
      //   pow(540/720, 2.0) = pow(0.75, 2.0) = 0.5625
      //   d = 0.5625 * 720 = 405
      //   new date.perf = 540 + (405 - 540) = 405
      const rubatoMap = RubatoMap.createRubatoMap();
      rubatoMap.addRubato(0, 720, 2.0, 0.0, 1.0, true);

      const map = createTestMap([540]);
      rubatoMap.renderRubatoToMap(map);

      expect(getDatePerf(map, 0)).toBeCloseTo(405, 5);
    });

    it('loop=false: rubato only applies within one frame from startDate', () => {
      // With loop=false and frameLength=720, rubato applies from startDate to startDate+frameLength
      // Any note at date >= startDate + frameLength should NOT be modified
      const rubatoMap = RubatoMap.createRubatoMap();
      rubatoMap.addRubato(0, 720, 2.0, 0.0, 1.0, false);

      const map = createTestMap([0, 360, 720, 1080]);
      rubatoMap.renderRubatoToMap(map);

      // date=0 is within frame: localDate=0, offset=0
      expect(getDatePerf(map, 0)).toBeCloseTo(0, 5);
      // date=360 is within frame: as calculated above, becomes 180
      expect(getDatePerf(map, 1)).toBeCloseTo(180, 5);
      // date=720: NOT in frame (>= startDate+frameLength), stays 720
      expect(getDatePerf(map, 2)).toBeCloseTo(720, 5);
      // date=1080: NOT in frame, stays 1080
      expect(getDatePerf(map, 3)).toBeCloseTo(1080, 5);
    });

    it('loop=true: rubato repeats across multiple frames', () => {
      // With loop=true and frameLength=720, rubato wraps around
      // date=900: localDate = (900 - 0) % 720 = 180
      // pow(180/720, 2.0) = pow(0.25, 2.0) = 0.0625
      // d = 0.0625 * 720 = 45
      // new date.perf = 900 + (45 - 180) = 765
      const rubatoMap = RubatoMap.createRubatoMap();
      rubatoMap.addRubato(0, 720, 2.0, 0.0, 1.0, true);

      const map = createTestMap([900]);
      rubatoMap.renderRubatoToMap(map);

      expect(getDatePerf(map, 0)).toBeCloseTo(765, 5);
    });

    it('non-zero startDate shifts the frame origin', () => {
      // startDate=480, frameLength=720, intensity=2.0
      // date=840: localDate = (840 - 480) % 720 = 360
      // pow(360/720, 2.0) = 0.25, d = 180, offset = 180 - 360 = -180
      // new date.perf = 840 + (-180) = 660
      const rubatoMap = RubatoMap.createRubatoMap();
      rubatoMap.addRubato(480, 720, 2.0, 0.0, 1.0, true);

      const map = createTestMap([840]);
      rubatoMap.renderRubatoToMap(map);

      expect(getDatePerf(map, 0)).toBeCloseTo(660, 5);
    });

    it('dates before rubato startDate are not affected', () => {
      const rubatoMap = RubatoMap.createRubatoMap();
      rubatoMap.addRubato(480, 720, 2.0, 0.0, 1.0, true);

      const map = createTestMap([0, 240]);
      rubatoMap.renderRubatoToMap(map);

      // Both dates are before startDate=480, should be unmodified
      expect(getDatePerf(map, 0)).toBeCloseTo(0, 5);
      expect(getDatePerf(map, 1)).toBeCloseTo(240, 5);
    });

    it('empty rubato map does nothing to the target map', () => {
      const rubatoMap = RubatoMap.createRubatoMap();
      const map = createTestMap([0, 360, 720]);
      rubatoMap.renderRubatoToMap(map);

      expect(getDatePerf(map, 0)).toBeCloseTo(0, 5);
      expect(getDatePerf(map, 1)).toBeCloseTo(360, 5);
      expect(getDatePerf(map, 2)).toBeCloseTo(720, 5);
    });

    it('null map is handled gracefully', () => {
      const rubatoMap = RubatoMap.createRubatoMap();
      rubatoMap.addRubato(0, 720, 2.0, 0.0, 1.0, true);
      // Should not throw
      rubatoMap.renderRubatoToMap(null);
    });

    it('static renderRubatoToMap delegates correctly', () => {
      const rubatoMap = RubatoMap.createRubatoMap();
      rubatoMap.addRubato(0, 720, 2.0, 0.0, 1.0, true);

      const map = createTestMap([360]);
      RubatoMap.renderRubatoToMap(map, rubatoMap);

      expect(getDatePerf(map, 0)).toBeCloseTo(180, 5);
    });

    it('static renderRubatoToMap with null rubatoMap does nothing', () => {
      const map = createTestMap([360]);
      RubatoMap.renderRubatoToMap(map, null);
      expect(getDatePerf(map, 0)).toBeCloseTo(360, 5);
    });

    it('intensity=3.0: cubic acceleration', () => {
      // pow(0.5, 3.0) = 0.125
      // d = 0.125 * 720 = 90
      // new date.perf at localDate=360: 360 + (90 - 360) = 90
      const rubatoMap = RubatoMap.createRubatoMap();
      rubatoMap.addRubato(0, 720, 3.0, 0.0, 1.0, true);

      const map = createTestMap([360]);
      rubatoMap.renderRubatoToMap(map);

      expect(getDatePerf(map, 0)).toBeCloseTo(90, 5);
    });

    it('combined lateStart=0.1, earlyEnd=0.9, intensity=2.0', () => {
      // At localDate=360 (half of frame=720):
      // pow(360/720, 2.0) = 0.25
      // d = (0.25 * (0.9 - 0.1) + 0.1) * 720 = (0.25 * 0.8 + 0.1) * 720 = 0.3 * 720 = 216
      // offset = 216 - 360 = -144
      // new date.perf = 360 + (-144) = 216
      const rubatoMap = RubatoMap.createRubatoMap();
      rubatoMap.addRubato(0, 720, 2.0, 0.1, 0.9, true);

      const map = createTestMap([360]);
      rubatoMap.renderRubatoToMap(map);

      expect(getDatePerf(map, 0)).toBeCloseTo(216, 3);
    });

    /**
     * The deferred end-date pass is a prefix drain, and stops at the first end that reaches
     * past the frame instead of skipping it to reach the ones behind it.
     *
     * A note whose end falls outside the current rubato's frame keeps its place at the head
     * of the pending list and blocks everything queued behind it; both go to the next
     * instruction. Draining past it instead would splice a *different* entry off the front —
     * one that was never warped — so the blocked note would keep an unwarped `date.end.perf`
     * while a note behind it got warped by the wrong rubato.
     *
     * The corpus reaches the drain (deleting it fails the rubato byte fixtures) but never
     * reaches the stop: turning the `break` into a `continue` passed every test in the tree.
     * The shape it needs is two overlapping notes inside one frame with the longer one first,
     * and no fixture has that.
     *
     * Here: note A starts at 0 and ends at 600, past the first rubato's 480-tick frame; note B
     * starts at 100 and ends at 200, inside it. Under the prefix rule A blocks the drain, both
     * survive to the second rubato, and only A's end (600, inside that one's span) is warped.
     * Under the other, A's end is spliced away unwarped and B's is warped by the FIRST rubato.
     */
    it('the deferred end-date drain stops at the first end past the frame (prefix, not filter)', () => {
      const rubatoMap = RubatoMap.createRubatoMap();
      rubatoMap.addRubato(0, 480, 2.0, 0.0, 1.0, false);
      rubatoMap.addRubato(500, 2000, 2.0, 0.0, 1.0, false);

      const map = okValue(GenericMap.createGenericMap('positionMap'));
      const note = (date: number, duration: number): Element => {
        const e = new Element('note', Mpm.MPM_NAMESPACE);
        e.addAttribute(new Attribute('date', String(date)));
        e.addAttribute(new Attribute('date.perf', String(date)));
        e.addAttribute(new Attribute('duration.perf', String(duration)));
        map.addElement(e);
        return e;
      };
      const long = note(0, 600);
      const short = note(100, 100);

      rubatoMap.renderRubatoToMap(map);

      // The second rubato warps 600: localDate = 100, d = (100/2000)^2 * 2000 = 5,
      // so 600 + 5 - 100 = 505.
      expect(parseFloat(long.getAttributeValue('date.end.perf')!)).toBeCloseTo(505, 5);
      // …and nothing warps 200: it is before the second rubato's start date, and the first
      // rubato never got to it.
      expect(parseFloat(short.getAttributeValue('date.end.perf')!)).toBeCloseTo(200, 5);
    });
  });

  // ---------------------------------------------------------------
  // GenericMap operations on RubatoMap
  // ---------------------------------------------------------------
  describe('GenericMap operations', () => {
    it('should support removeElement by index', () => {
      const map = RubatoMap.createRubatoMap();
      map.addRubato(0, 720, 1.0, 0.0, 1.0, true);
      map.addRubato(960, 720, 2.0, 0.0, 1.0, true);

      map.removeElement(0);
      expect(map.size()).toBe(1);
      expect(map.getElement(0)!.getAttributeValue('intensity')).toBe('2');
    });

    it('should support setId and getId', () => {
      const map = RubatoMap.createRubatoMap();
      expect(map.getId()).toBeNull();

      map.setId('rubatoMap-1');
      expect(map.getId()).toBe('rubatoMap-1');
    });

    it('should support addStyleSwitch', () => {
      const map = RubatoMap.createRubatoMap();
      const index = map.addStyleSwitch(0, 'myRubatoStyle');
      expect(index).toBeGreaterThanOrEqual(0);
      expect(map.size()).toBe(1);

      const elem = map.getElement(index)!;
      expect(elem.getLocalName()).toBe('style');
      expect(elem.getAttributeValue('name.ref')).toBe('myRubatoStyle');
    });
  });
});
