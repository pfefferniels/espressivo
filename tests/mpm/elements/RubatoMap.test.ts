import { describe, it, expect } from 'vitest';
import { okValue } from '../../support/result.js';
import { expectOptionsRoundTrip } from '../../support/optionsRoundTrip.js';
import { RubatoMap, type AddRubatoOptions } from '../../../src/mpm/elements/maps/RubatoMap.js';
import {
  resolveRubato,
  type RubatoDeclaration,
} from '../../../src/mpm/elements/maps/data/rubato.js';
import { RubatoDef } from '../../../src/mpm/elements/styles/defs/RubatoDef.js';
import { GenericMap } from '../../../src/mpm/elements/maps/GenericMap.js';
import { Element, Attribute } from '../../../src/xml/XomTypes.js';
import { Mpm } from '../../../src/mpm/Mpm.js';
import { Header } from '../../../src/mpm/elements/Header.js';
import { createStyle } from '../../../src/mpm/elements/styles/style.js';

describe('RubatoMap', () => {
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

  describe('addRubato', () => {
    it('should add a rubato with full numeric parameters', () => {
      const map = RubatoMap.createRubatoMap();
      const index = map.addRubato({
        date: 0,
        frameLength: 720,
        intensity: 2.0,
        lateStart: 0.0,
        earlyEnd: 1.0,
        loop: true,
      });
      expect(index).toBeGreaterThanOrEqual(0);
      expect(map.size()).toBe(1);
    });

    it('should add a rubato with name.ref (def name) and loop', () => {
      const map = RubatoMap.createRubatoMap();
      const index = map.addRubato({ date: 0, nameRef: 'myRubatoDef', loop: true });
      expect(index).toBeGreaterThanOrEqual(0);
      expect(map.size()).toBe(1);

      const elem = map.getElement(index)!;
      expect(elem.getAttributeValue('name.ref')).toBe('myRubatoDef');
      expect(elem.getAttributeValue('loop')).toBe('true');
    });

    it('should add a rubato that names a def and spells out a window', () => {
      const map = RubatoMap.createRubatoMap();
      const index = map.addRubato({
        date: 0,
        nameRef: 'myRubatoDef',
        frameLength: 720,
        intensity: 2.0,
        lateStart: 0.0,
        earlyEnd: 1.0,
        loop: true,
      });
      expect(map.size()).toBe(1);

      const elem = map.getElement(index)!;
      expect(elem.getAttributeValue('name.ref')).toBe('myRubatoDef');
      expect(elem.getAttributeValue('frameLength')).toBe('720');
    });

    it('should store attributes correctly for numeric rubato', () => {
      const map = RubatoMap.createRubatoMap();
      const index = map.addRubato({
        date: 0,
        frameLength: 720,
        intensity: 2.0,
        lateStart: 0.1,
        earlyEnd: 0.9,
        loop: false,
      });
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
      map.addRubato({
        date: 960,
        frameLength: 720,
        intensity: 1.0,
        lateStart: 0.0,
        earlyEnd: 1.0,
        loop: true,
      });
      map.addRubato({
        date: 0,
        frameLength: 720,
        intensity: 2.0,
        lateStart: 0.0,
        earlyEnd: 1.0,
        loop: true,
      });
      map.addRubato({
        date: 480,
        frameLength: 720,
        intensity: 0.5,
        lateStart: 0.0,
        earlyEnd: 1.0,
        loop: true,
      });

      expect(map.size()).toBe(3);
      expect(map.getElement(0)!.getAttributeValue('date')).toBe('0');
      expect(map.getElement(1)!.getAttributeValue('date')).toBe('480');
      expect(map.getElement(2)!.getAttributeValue('date')).toBe('960');
    });

    it('should store the xml:id it is given', () => {
      const map = RubatoMap.createRubatoMap();
      const index = map.addRubato({
        date: 0,
        frameLength: 720,
        intensity: 1.0,
        lateStart: 0.0,
        earlyEnd: 1.0,
        loop: false,
        id: 'rubato-1',
      });
      const elem = map.getElement(index)!;
      const idAttr = elem.getAttribute('id', 'http://www.w3.org/XML/1998/namespace');
      expect(idAttr).not.toBeNull();
      expect(idAttr!.getValue()).toBe('rubato-1');
    });
  });

  describe('getRubatoDataOf', () => {
    it('should return null for an empty map', () => {
      const map = RubatoMap.createRubatoMap();
      const rd = map.getRubatoDataOf(0);
      expect(rd).toBeNull();
    });

    it('should return null for negative index', () => {
      const map = RubatoMap.createRubatoMap();
      map.addRubato({
        date: 0,
        frameLength: 720,
        intensity: 1.0,
        lateStart: 0.0,
        earlyEnd: 1.0,
        loop: true,
      });
      expect(map.getRubatoDataOf(-1)).toBeNull();
    });

    it('should return a resolved Rubato for a valid rubato instruction', () => {
      const map = RubatoMap.createRubatoMap();
      map.addRubato({
        date: 0,
        frameLength: 720,
        intensity: 2.0,
        lateStart: 0.1,
        earlyEnd: 0.9,
        loop: true,
      });

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
      map.addRubato({
        date: 0,
        frameLength: 720,
        intensity: 1.0,
        lateStart: 0.0,
        earlyEnd: 1.0,
        loop: true,
      });

      const rd = map.getRubatoDataOf(0)!;
      expect(rd.endDate).toBe(Number.MAX_VALUE);
    });

    it('should set endDate to the start of the next rubato instruction', () => {
      const map = RubatoMap.createRubatoMap();
      map.addRubato({
        date: 0,
        frameLength: 720,
        intensity: 1.0,
        lateStart: 0.0,
        earlyEnd: 1.0,
        loop: true,
      });
      map.addRubato({
        date: 1440,
        frameLength: 720,
        intensity: 2.0,
        lateStart: 0.0,
        earlyEnd: 1.0,
        loop: true,
      });

      const rd = map.getRubatoDataOf(0)!;
      expect(rd.endDate).toBe(1440);
    });

    it('should handle out-of-bounds index by clamping', () => {
      const map = RubatoMap.createRubatoMap();
      map.addRubato({
        date: 0,
        frameLength: 720,
        intensity: 2.0,
        lateStart: 0.0,
        earlyEnd: 1.0,
        loop: true,
      });

      const rd = map.getRubatoDataOf(100);
      expect(rd).not.toBeNull();
      expect(rd!.intensity).toBe(2.0);
    });

    it('round-trip: addRubato -> getRubatoDataOf preserves values', () => {
      const map = RubatoMap.createRubatoMap();
      map.addRubato({
        date: 100,
        frameLength: 360,
        intensity: 0.5,
        lateStart: 0.2,
        earlyEnd: 0.8,
        loop: false,
      });

      const rd = map.getRubatoDataOf(0)!;
      expect(rd.startDate).toBe(100);
      expect(rd.frameLength).toBe(360);
      expect(rd.intensity).toBe(0.5);
      expect(rd.lateStart).toBe(0.2);
      expect(rd.earlyEnd).toBe(0.8);
      expect(rd.loop).toBe(false);
    });
  });

  describe('addRubato: what is written and what is left out', () => {
    /**
     * A `<rubato>` that names a def must spell out none of the four numbers, or the def is
     * overridden: a declared attribute beats the def even when it carries the identity warp
     * (`data/rubato.ts`). Unmentioned means unwritten, so this shape needs no opting out.
     */
    it('writes only date, name.ref and loop when only those are given', () => {
      const map = RubatoMap.createRubatoMap();
      const elem = map.getElement(map.addRubato({ date: 100, nameRef: 'myRubatoDef' }))!;

      expect(elem.getAttributeValue('date')).toBe('100');
      expect(elem.getAttributeValue('name.ref')).toBe('myRubatoDef');
      expect(elem.getAttribute('frameLength')).toBeNull();
      expect(elem.getAttribute('intensity')).toBeNull();
      expect(elem.getAttribute('lateStart')).toBeNull();
      expect(elem.getAttribute('earlyEnd')).toBeNull();
      // `date` and `loop` are unconditional; `loop` defaults to false
      expect(elem.getAttributeValue('loop')).toBe('false');
    });

    it('writes an identity-warp parameter that is given explicitly', () => {
      const map = RubatoMap.createRubatoMap();
      const elem = map.getElement(
        map.addRubato({ date: 100, nameRef: 'myRubatoDef', intensity: 1.0 }),
      )!;

      expect(elem.getAttributeValue('intensity')).toBe('1');
      expect(elem.getAttribute('lateStart')).toBeNull();
    });

    it('writes every attribute it is given', () => {
      const map = RubatoMap.createRubatoMap();
      const elem = map.getElement(
        map.addRubato({
          date: 100,
          frameLength: 720,
          intensity: 2.0,
          lateStart: 0.1,
          earlyEnd: 0.9,
          loop: true,
          id: 'rubato-full',
        }),
      )!;

      expect(elem.getAttributeValue('frameLength')).toBe('720');
      expect(elem.getAttributeValue('intensity')).toBe('2');
      expect(elem.getAttributeValue('lateStart')).toBe('0.1');
      expect(elem.getAttributeValue('earlyEnd')).toBe('0.9');
      expect(elem.getAttributeValue('loop')).toBe('true');
      expect(elem.getAttribute('id', 'http://www.w3.org/XML/1998/namespace')!.getValue()).toBe(
        'rubato-full',
      );
    });
  });

  /**
   * The read half. `getRubatoDataOf` above covers the path where the element declares
   * everything; these cover the other three — inherit from the def, fall back to the identity
   * warp, and reject.
   */
  describe('resolveRubato', () => {
    const span = { startDate: 0, endDate: 1440 };
    /** An element that carries no warp attribute at all — every parameter comes from the def. */
    const absent: RubatoDeclaration = {};

    const def = (frameLength: number, intensity: number, lateStart: number, earlyEnd: number) =>
      okValue(
        RubatoDef.fromName('d', frameLength, {
          intensity: intensity,
          lateStart: lateStart,
          earlyEnd: earlyEnd,
        }),
      );

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
      const r = resolveRubato(span, { frameLength: 720, intensity: 3.0 }, def(360, 2.0, 0.2, 0.8))!;
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
        { frameLength: NaN, lateStart: NaN, earlyEnd: NaN },
        def(360, 2.0, 0.2, 0.8),
      )!;
      expect(r.frameLength).toBeNaN();
      expect(r.lateStart).toBeNaN();
      expect(r.earlyEnd).toBeNaN();
    });

    it('falls back to the identity warp where neither source says anything', () => {
      const r = resolveRubato(span, { frameLength: 720 }, null)!;
      expect(r.intensity).toBe(1.0);
      expect(r.lateStart).toBe(0.0);
      expect(r.earlyEnd).toBe(1.0);
      expect(r.loop).toBe(false);
    });

    it('floors lateStart at 0 and caps earlyEnd at 1', () => {
      const r = resolveRubato(span, { frameLength: 720, lateStart: -0.5, earlyEnd: 1.5 }, null)!;
      expect(r.lateStart).toBe(0.0);
      expect(r.earlyEnd).toBe(1.0);
    });

    it('widens an inverted window to the whole frame', () => {
      const r = resolveRubato(span, { frameLength: 720, lateStart: 0.8, earlyEnd: 0.2 }, null)!;
      expect(r.lateStart).toBe(0.0);
      expect(r.earlyEnd).toBe(1.0);
    });

    it('widens an empty window to the whole frame', () => {
      const r = resolveRubato(span, { frameLength: 720, lateStart: 0.5, earlyEnd: 0.5 }, null)!;
      expect(r.lateStart).toBe(0.0);
      expect(r.earlyEnd).toBe(1.0);
    });
  });

  describe('renderRubatoToMap - power curve math', () => {
    /** A positionMap of notes whose `date.perf` starts equal to `date`, which rubato warps. */
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
      // The warp, used by every test below: with localDate = (date - startDate) % frameLength,
      //   d = (pow(localDate/frameLength, intensity) * (earlyEnd - lateStart) + lateStart)
      //       * frameLength
      // and the entry moves by d - localDate. Intensity 1 over the full window is the identity.
      const rubatoMap = RubatoMap.createRubatoMap();
      rubatoMap.addRubato({
        date: 0,
        frameLength: 720,
        intensity: 1.0,
        lateStart: 0.0,
        earlyEnd: 1.0,
        loop: true,
      });

      const map = createTestMap([0, 180, 360, 540, 720]);
      rubatoMap.renderRubatoToMap(map);

      expect(getDatePerf(map, 0)).toBeCloseTo(0, 5);
      expect(getDatePerf(map, 1)).toBeCloseTo(180, 5);
      expect(getDatePerf(map, 2)).toBeCloseTo(360, 5);
      expect(getDatePerf(map, 3)).toBeCloseTo(540, 5);
    });

    it('quadratic acceleration: intensity=2.0 compresses first half, expands second', () => {
      // d = pow(localDate/720, 2) * 720, so 0 -> 0, 180 -> 45, 360 -> 180, 540 -> 405.
      const rubatoMap = RubatoMap.createRubatoMap();
      rubatoMap.addRubato({
        date: 0,
        frameLength: 720,
        intensity: 2.0,
        lateStart: 0.0,
        earlyEnd: 1.0,
        loop: true,
      });

      const map = createTestMap([0, 180, 360, 540]);
      rubatoMap.renderRubatoToMap(map);

      expect(getDatePerf(map, 0)).toBeCloseTo(0, 5);
      expect(getDatePerf(map, 1)).toBeCloseTo(45, 5);
      expect(getDatePerf(map, 2)).toBeCloseTo(180, 5);
      expect(getDatePerf(map, 3)).toBeCloseTo(405, 5);
    });

    it('square root deceleration: intensity=0.5 expands first half, compresses second', () => {
      // d = pow(localDate/720, 0.5) * 720, so 180 -> 360 and 360 -> 509.117.
      const rubatoMap = RubatoMap.createRubatoMap();
      rubatoMap.addRubato({
        date: 0,
        frameLength: 720,
        intensity: 0.5,
        lateStart: 0.0,
        earlyEnd: 1.0,
        loop: true,
      });

      const map = createTestMap([0, 180, 360]);
      rubatoMap.renderRubatoToMap(map);

      expect(getDatePerf(map, 0)).toBeCloseTo(0, 5);
      expect(getDatePerf(map, 1)).toBeCloseTo(360, 3);
      expect(getDatePerf(map, 2)).toBeCloseTo(509.117, 1);
    });

    it('at frame boundary (localDate=frameLength), d=frameLength, offset=0', () => {
      // Date 720 sits exactly on the frame boundary. With loop=true the instruction runs to
      // its endDate, here MAX_VALUE, so the date is warped rather than skipped — and the wrap
      // makes localDate 0, hence an offset of 0.
      const rubatoMap = RubatoMap.createRubatoMap();
      rubatoMap.addRubato({
        date: 0,
        frameLength: 720,
        intensity: 2.0,
        lateStart: 0.0,
        earlyEnd: 1.0,
        loop: true,
      });

      const map = createTestMap([720]);
      rubatoMap.renderRubatoToMap(map);

      expect(getDatePerf(map, 0)).toBeCloseTo(720, 5);
    });

    it('at start (localDate=0), offset is always 0 regardless of intensity', () => {
      // pow(0, intensity) is 0 whatever the intensity, and lateStart is 0, so d = 0.
      for (const intensity of [0.1, 0.5, 1.0, 2.0, 5.0]) {
        const rubatoMap = RubatoMap.createRubatoMap();
        rubatoMap.addRubato({
          date: 0,
          frameLength: 720,
          intensity: intensity,
          lateStart: 0.0,
          earlyEnd: 1.0,
          loop: true,
        });

        const map = createTestMap([0]);
        rubatoMap.renderRubatoToMap(map);

        expect(getDatePerf(map, 0)).toBeCloseTo(0, 5);
      }
    });

    it('with lateStart and earlyEnd: linear rubato shifts start and end proportionally', () => {
      // d = ((localDate/720) * 0.8 + 0.1) * 720, so 0 -> 72 and 360 -> 360.
      const rubatoMap = RubatoMap.createRubatoMap();
      rubatoMap.addRubato({
        date: 0,
        frameLength: 720,
        intensity: 1.0,
        lateStart: 0.1,
        earlyEnd: 0.9,
        loop: true,
      });

      const map = createTestMap([0, 360]);
      rubatoMap.renderRubatoToMap(map);

      expect(getDatePerf(map, 0)).toBeCloseTo(72, 3);
      expect(getDatePerf(map, 1)).toBeCloseTo(360, 3);
    });

    it('concrete calculation: halfway with intensity=2.0', () => {
      // pow(0.5, 2) * 720 = 180.
      const rubatoMap = RubatoMap.createRubatoMap();
      rubatoMap.addRubato({
        date: 0,
        frameLength: 720,
        intensity: 2.0,
        lateStart: 0.0,
        earlyEnd: 1.0,
        loop: true,
      });

      const map = createTestMap([360]);
      rubatoMap.renderRubatoToMap(map);

      expect(getDatePerf(map, 0)).toBeCloseTo(180, 5);
    });

    it('concrete calculation: three-quarters with intensity=2.0', () => {
      // pow(0.75, 2) * 720 = 405.
      const rubatoMap = RubatoMap.createRubatoMap();
      rubatoMap.addRubato({
        date: 0,
        frameLength: 720,
        intensity: 2.0,
        lateStart: 0.0,
        earlyEnd: 1.0,
        loop: true,
      });

      const map = createTestMap([540]);
      rubatoMap.renderRubatoToMap(map);

      expect(getDatePerf(map, 0)).toBeCloseTo(405, 5);
    });

    it('loop=false: rubato only applies within one frame from startDate', () => {
      const rubatoMap = RubatoMap.createRubatoMap();
      rubatoMap.addRubato({
        date: 0,
        frameLength: 720,
        intensity: 2.0,
        lateStart: 0.0,
        earlyEnd: 1.0,
        loop: false,
      });

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
      // localDate = 900 % 720 = 180, d = 45, so 900 + 45 - 180 = 765.
      const rubatoMap = RubatoMap.createRubatoMap();
      rubatoMap.addRubato({
        date: 0,
        frameLength: 720,
        intensity: 2.0,
        lateStart: 0.0,
        earlyEnd: 1.0,
        loop: true,
      });

      const map = createTestMap([900]);
      rubatoMap.renderRubatoToMap(map);

      expect(getDatePerf(map, 0)).toBeCloseTo(765, 5);
    });

    it('non-zero startDate shifts the frame origin', () => {
      // localDate = (840 - 480) % 720 = 360, d = 180, so 840 - 180 = 660.
      const rubatoMap = RubatoMap.createRubatoMap();
      rubatoMap.addRubato({
        date: 480,
        frameLength: 720,
        intensity: 2.0,
        lateStart: 0.0,
        earlyEnd: 1.0,
        loop: true,
      });

      const map = createTestMap([840]);
      rubatoMap.renderRubatoToMap(map);

      expect(getDatePerf(map, 0)).toBeCloseTo(660, 5);
    });

    it('dates before rubato startDate are not affected', () => {
      const rubatoMap = RubatoMap.createRubatoMap();
      rubatoMap.addRubato({
        date: 480,
        frameLength: 720,
        intensity: 2.0,
        lateStart: 0.0,
        earlyEnd: 1.0,
        loop: true,
      });

      const map = createTestMap([0, 240]);
      rubatoMap.renderRubatoToMap(map);

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
      rubatoMap.addRubato({
        date: 0,
        frameLength: 720,
        intensity: 2.0,
        lateStart: 0.0,
        earlyEnd: 1.0,
        loop: true,
      });
      rubatoMap.renderRubatoToMap(null);
    });

    it('static renderRubatoToMap delegates correctly', () => {
      const rubatoMap = RubatoMap.createRubatoMap();
      rubatoMap.addRubato({
        date: 0,
        frameLength: 720,
        intensity: 2.0,
        lateStart: 0.0,
        earlyEnd: 1.0,
        loop: true,
      });

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
      // pow(0.5, 3) * 720 = 90.
      const rubatoMap = RubatoMap.createRubatoMap();
      rubatoMap.addRubato({
        date: 0,
        frameLength: 720,
        intensity: 3.0,
        lateStart: 0.0,
        earlyEnd: 1.0,
        loop: true,
      });

      const map = createTestMap([360]);
      rubatoMap.renderRubatoToMap(map);

      expect(getDatePerf(map, 0)).toBeCloseTo(90, 5);
    });

    it('combined lateStart=0.1, earlyEnd=0.9, intensity=2.0', () => {
      // d = (0.25 * 0.8 + 0.1) * 720 = 216.
      const rubatoMap = RubatoMap.createRubatoMap();
      rubatoMap.addRubato({
        date: 0,
        frameLength: 720,
        intensity: 2.0,
        lateStart: 0.1,
        earlyEnd: 0.9,
        loop: true,
      });

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
     * The corpus reaches the drain — deleting it fails the rubato byte fixtures — but never
     * reaches the stop: turning the `break` into a `continue` leaves every test in the tree
     * green. The shape it needs is two overlapping notes inside one frame with the longer one
     * first, and no fixture has that.
     *
     * Here: note A starts at 0 and ends at 600, past the first rubato's 480-tick frame; note B
     * starts at 100 and ends at 200, inside it. Under the prefix rule A blocks the drain, both
     * survive to the second rubato, and only A's end (600, inside that one's span) is warped.
     * Under the other, A's end is spliced away unwarped and B's is warped by the FIRST rubato.
     */
    it('the deferred end-date drain stops at the first end past the frame (prefix, not filter)', () => {
      const rubatoMap = RubatoMap.createRubatoMap();
      rubatoMap.addRubato({
        date: 0,
        frameLength: 480,
        intensity: 2.0,
        lateStart: 0.0,
        earlyEnd: 1.0,
        loop: false,
      });
      rubatoMap.addRubato({
        date: 500,
        frameLength: 2000,
        intensity: 2.0,
        lateStart: 0.0,
        earlyEnd: 1.0,
        loop: false,
      });

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

  describe('GenericMap operations', () => {
    it('should support removeElement by index', () => {
      const map = RubatoMap.createRubatoMap();
      map.addRubato({
        date: 0,
        frameLength: 720,
        intensity: 1.0,
        lateStart: 0.0,
        earlyEnd: 1.0,
        loop: true,
      });
      map.addRubato({
        date: 960,
        frameLength: 720,
        intensity: 2.0,
        lateStart: 0.0,
        earlyEnd: 1.0,
        loop: true,
      });

      map.removeElementAt(0);
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

describe('getRubatoOptionsOf / updateRubatoAt', () => {
  const makeMap = () => RubatoMap.createRubatoMap();

  /** A map with a `rubatoDef` named `d` in scope from date 0. */
  function mapWithDef(): RubatoMap {
    const header = okValue(Header.createHeader());
    const style = createStyle('rubato', 'rub style');
    style.addDef(
      okValue(RubatoDef.fromName('d', 360, { intensity: 2.0, lateStart: 0.2, earlyEnd: 0.8 })),
    );
    header.addStyleDef(Mpm.RUBATO_STYLE, style);

    const map = makeMap();
    map.setHeaders(null, header);
    map.addStyleSwitch(0, 'rub style');
    return map;
  }

  it('round-trips every shape addRubato can write', () => {
    expectOptionsRoundTrip<RubatoMap, AddRubatoOptions>({
      makeMap,
      add: (map, o) => map.addRubato(o),
      read: (map, i) => map.getRubatoOptionsOf(i),
      samples: [
        { date: 0 },
        {
          date: 720,
          nameRef: 'myRubatoDef',
          frameLength: 360,
          intensity: 2.5,
          lateStart: 0.1,
          earlyEnd: 0.9,
          loop: true,
          id: 'r1',
        },
        { date: 1440, nameRef: 'myRubatoDef' },
        { date: 2160, frameLength: 720, loop: true },
      ],
    });
  });

  /**
   * The def-inheritance case, which is the reason this reading exists at all: an `intensity`
   * inherited from the `rubatoDef` and one spelled out on the element render identically, and
   * `getRubatoDataOf` — which has already consulted the def — cannot tell them apart.
   */
  it('reads what the document says, where getRubatoDataOf reads what it renders as', () => {
    const inherited = mapWithDef();
    const i = inherited.addRubato({ date: 0, nameRef: 'd' });

    expect(inherited.getRubatoOptionsOf(i)).toMatchObject({ date: 0, nameRef: 'd', loop: false });
    expect(inherited.getRubatoOptionsOf(i)?.frameLength).toBeUndefined();
    expect(inherited.getRubatoOptionsOf(i)?.intensity).toBeUndefined();
    expect(inherited.getRubatoOptionsOf(i)?.lateStart).toBeUndefined();
    expect(inherited.getRubatoOptionsOf(i)?.earlyEnd).toBeUndefined();

    const rendered = inherited.getRubatoDataOf(i)!;
    expect(rendered.frameLength).toBe(360);
    expect(rendered.intensity).toBe(2.0);
    expect(rendered.lateStart).toBe(0.2);
    expect(rendered.earlyEnd).toBe(0.8);

    // An identity warp stated on the element is a different instruction that renders to a
    // different number — and both halves say so, which is what makes the pair above the point.
    const stated = mapWithDef();
    const j = stated.addRubato({ date: 0, nameRef: 'd', intensity: 1.0 });
    expect(stated.getRubatoOptionsOf(j)?.intensity).toBe(1.0);
    expect(stated.getRubatoDataOf(j)?.intensity).toBe(1.0);
  });

  it('leaves an omitted field alone, removes one patched to undefined', () => {
    const map = makeMap();
    map.addRubato({ date: 0, frameLength: 720, intensity: 2.0, lateStart: 0.1, earlyEnd: 0.9 });

    expect(map.updateRubatoAt(0, { intensity: 3.0 })).toBe(true);
    expect(map.getRubatoOptionsOf(0)).toMatchObject({
      frameLength: 720,
      intensity: 3.0,
      lateStart: 0.1,
      earlyEnd: 0.9,
    });

    map.updateRubatoAt(0, { lateStart: undefined });
    expect(map.getRubatoOptionsOf(0)?.lateStart).toBeUndefined();
    expect(map.getElement(0)?.getAttribute('lateStart')).toBeNull();
  });

  /**
   * `loop` is the one attribute `addRubato` writes unconditionally, so patching it away
   * produces a document `addRubato` cannot. The meaning survives — an absent `loop` resolves
   * to false — and the round-trip law above is about elements `addRubato` produced, so this is
   * outside it rather than a counterexample to it.
   */
  it('removes @loop when it is patched to undefined', () => {
    const map = makeMap();
    map.addRubato({ date: 0, frameLength: 720, loop: true });

    map.updateRubatoAt(0, { loop: undefined });
    expect(map.getElement(0)?.getAttribute('loop')).toBeNull();
    expect(map.getRubatoDataOf(0)?.loop).toBe(false);
  });

  it('writes through an existing attribute rather than moving it to the end', () => {
    const map = makeMap();
    map.addRubato({ date: 0, nameRef: 'd', frameLength: 720, intensity: 2.0, loop: true, id: 'r1' });
    const before = map.getElement(0)?.toXML();

    map.updateRubatoAt(0, { frameLength: 720 });
    expect(map.getElement(0)?.toXML()).toBe(before);
  });

  it('never touches an attribute no option names', () => {
    const map = makeMap();
    map.addRubato({ date: 0, frameLength: 720 });
    map.getElement(0)?.addAttribute(new Attribute('corresp', 'arg1'));

    map.updateRubatoAt(0, { intensity: 2.0, id: 'r1' });
    expect(map.getElement(0)?.getAttributeValue('corresp')).toBe('arg1');
  });

  it('re-keys and re-sorts the map when @date is patched', () => {
    const map = makeMap();
    map.addRubato({ date: 0, frameLength: 720, id: 'first' });
    map.addRubato({ date: 1000, frameLength: 360, id: 'second' });

    map.updateRubatoAt(0, { date: 2000 });

    expect(map.getAllElements().map((e) => e.key)).toEqual([1000, 2000]);
    expect(map.getElement(0)?.getAttributeValue('xml:id')).toBe('second');
    // The lookup index moved with it, which is the half that writing the attribute alone misses.
    expect(map.getElementBeforeAt(2500)?.getAttributeValue('xml:id')).toBe('first');
  });

  it('refuses an entry that is not a <rubato>', () => {
    const map = makeMap();
    map.addStyleSwitch(0, 'someStyle');
    expect(map.getRubatoOptionsOf(0)).toBeNull();
    expect(map.updateRubatoAt(0, { intensity: 2.0 })).toBe(false);
  });
});
