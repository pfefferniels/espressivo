import { describe, it, expect } from 'vitest';
import { okValue } from '../../support/result.js';
import { AsynchronyMap } from '../../../src/mpm/elements/maps/AsynchronyMap.js';
import { GenericMap } from '../../../src/mpm/elements/maps/GenericMap.js';
import { Element, Attribute } from '../../../src/xml/XomTypes.js';
import { Mpm } from '../../../src/mpm/Mpm.js';

describe('AsynchronyMap', () => {
  // ---------------------------------------------------------------
  // Create an asynchrony map
  // ---------------------------------------------------------------
  describe('createAsynchronyMap', () => {
    it('should create an empty asynchrony map', () => {
      const map = AsynchronyMap.createAsynchronyMap();
      expect(map).not.toBeNull();
      expect(map!.getType()).toBe('asynchronyMap');
    });

    it('should start with size 0', () => {
      const map = AsynchronyMap.createAsynchronyMap();
      expect(map.size()).toBe(0);
      expect(map.isEmpty()).toBe(true);
    });

    it('should have an XML element', () => {
      const map = AsynchronyMap.createAsynchronyMap();
      expect(map.getXml()).not.toBeNull();
      expect(map.getXml()!.getLocalName()).toBe('asynchronyMap');
    });
  });

  // ---------------------------------------------------------------
  // Add asynchrony instruction
  // ---------------------------------------------------------------
  describe('addAsynchrony', () => {
    it('should add an asynchrony instruction', () => {
      const map = AsynchronyMap.createAsynchronyMap();
      const index = map.addAsynchrony(0, 50);
      expect(index).toBeGreaterThanOrEqual(0);
      expect(map.size()).toBe(1);
    });

    it('should store attributes correctly', () => {
      const map = AsynchronyMap.createAsynchronyMap();
      const index = map.addAsynchrony(100, -25.5);
      const elem = map.getElement(index)!;

      expect(elem.getAttributeValue('date')).toBe('100');
      expect(elem.getAttributeValue('milliseconds.offset')).toBe('-25.5');
    });

    it('should maintain sorted order when adding out of order', () => {
      const map = AsynchronyMap.createAsynchronyMap();
      map.addAsynchrony(960, 30);
      map.addAsynchrony(0, 50);
      map.addAsynchrony(480, -20);

      expect(map.size()).toBe(3);
      expect(map.getElement(0)!.getAttributeValue('date')).toBe('0');
      expect(map.getElement(1)!.getAttributeValue('date')).toBe('480');
      expect(map.getElement(2)!.getAttributeValue('date')).toBe('960');
    });

    it('should support positive and negative offsets', () => {
      const map = AsynchronyMap.createAsynchronyMap();
      map.addAsynchrony(0, 100);
      map.addAsynchrony(480, -50);
      map.addAsynchrony(960, 0);

      expect(map.getElement(0)!.getAttributeValue('milliseconds.offset')).toBe('100');
      expect(map.getElement(1)!.getAttributeValue('milliseconds.offset')).toBe('-50');
      expect(map.getElement(2)!.getAttributeValue('milliseconds.offset')).toBe('0');
    });
  });

  // ---------------------------------------------------------------
  // getAsynchronyAt
  // ---------------------------------------------------------------
  describe('getAsynchronyAt', () => {
    it('should return 0.0 for an empty map', () => {
      const map = AsynchronyMap.createAsynchronyMap();
      expect(map.getAsynchronyAt(0)).toBe(0.0);
      expect(map.getAsynchronyAt(500)).toBe(0.0);
    });

    it('should return 0.0 for a date before any asynchrony', () => {
      const map = AsynchronyMap.createAsynchronyMap();
      map.addAsynchrony(100, 50);
      expect(map.getAsynchronyAt(50)).toBe(0.0);
    });

    it('should return the offset at the exact date', () => {
      const map = AsynchronyMap.createAsynchronyMap();
      map.addAsynchrony(0, 50);
      expect(map.getAsynchronyAt(0)).toBe(50);
    });

    it('single asynchrony at date 0: returns offset for any date >= 0', () => {
      const map = AsynchronyMap.createAsynchronyMap();
      map.addAsynchrony(0, 50);

      expect(map.getAsynchronyAt(0)).toBe(50);
      expect(map.getAsynchronyAt(100)).toBe(50);
      expect(map.getAsynchronyAt(99999)).toBe(50);
    });

    it('multiple asynchronies: returns the most recent one before/at date', () => {
      const map = AsynchronyMap.createAsynchronyMap();
      map.addAsynchrony(0, 10);
      map.addAsynchrony(480, 20);
      map.addAsynchrony(960, 30);

      expect(map.getAsynchronyAt(0)).toBe(10);
      expect(map.getAsynchronyAt(240)).toBe(10);
      expect(map.getAsynchronyAt(479)).toBe(10);
      expect(map.getAsynchronyAt(480)).toBe(20);
      expect(map.getAsynchronyAt(700)).toBe(20);
      expect(map.getAsynchronyAt(960)).toBe(30);
      expect(map.getAsynchronyAt(2000)).toBe(30);
    });

    /**
     * The backwards scan steps over entries that are not asynchronies, and answers 0.0 when
     * it runs off the front without finding one.
     *
     * An asynchronyMap holds ordinary dated entries, `<style>` switches included, and
     * `getElementIndexBeforeAt` finds the nearest of ANY kind. So the entry it lands on may
     * not be an asynchrony at all, and reading `@milliseconds.offset` off a `<style>` yields
     * `parseFloat('')`, i.e. NaN — a number that propagates into every millisecond date the
     * asynchrony pass touches.
     *
     * Nothing pinned that skip: deleting the local-name test passed every test in the tree,
     * because no fixture and no unit test puts a non-asynchrony entry into an asynchronyMap
     * before the date being asked about.
     */
    it('steps back over entries that are not asynchronies, and 0.0 when there are only those', () => {
      const map = AsynchronyMap.createAsynchronyMap();
      map.addAsynchrony(0, 50);
      map.addStyleSwitch(480, 'some style');

      // The style switch is the nearest entry at or before 500; the asynchrony behind it is
      // the answer.
      expect(map.getAsynchronyAt(500)).toBe(50);

      const styleOnly = AsynchronyMap.createAsynchronyMap();
      styleOnly.addStyleSwitch(0, 'some style');
      expect(styleOnly.getAsynchronyAt(500)).toBe(0.0);
    });

    it('negative offset is returned correctly', () => {
      const map = AsynchronyMap.createAsynchronyMap();
      map.addAsynchrony(0, -75);
      expect(map.getAsynchronyAt(100)).toBe(-75);
    });

    it('zero offset is returned correctly', () => {
      const map = AsynchronyMap.createAsynchronyMap();
      map.addAsynchrony(0, 0);
      expect(map.getAsynchronyAt(100)).toBe(0);
    });

    it('fractional offset values', () => {
      const map = AsynchronyMap.createAsynchronyMap();
      map.addAsynchrony(0, 12.75);
      expect(map.getAsynchronyAt(0)).toBeCloseTo(12.75, 5);
    });
  });

  // ---------------------------------------------------------------
  // renderAsynchronyToMap
  // ---------------------------------------------------------------
  describe('renderAsynchronyToMap', () => {
    /**
     * Helper: create a GenericMap with note entries that have
     * milliseconds.date and milliseconds.date.end attributes.
     */
    function createTestMap(
      entries: { date: number; msDate: number; duration: number; msEnd: number; id?: string }[],
    ): GenericMap {
      const map = okValue(GenericMap.createGenericMap('positionMap'));
      for (const entry of entries) {
        const e = new Element('note', Mpm.MPM_NAMESPACE);
        e.addAttribute(new Attribute('date', String(entry.date)));
        e.addAttribute(new Attribute('milliseconds.date', String(entry.msDate)));
        e.addAttribute(new Attribute('duration', String(entry.duration)));
        e.addAttribute(new Attribute('milliseconds.date.end', String(entry.msEnd)));
        if (entry.id) {
          e.addAttribute(new Attribute('xml:id', 'http://www.w3.org/XML/1998/namespace', entry.id));
        }
        map.addElement(e);
      }
      return map;
    }

    function getMsDate(map: GenericMap, index: number): number {
      return parseFloat(map.getElement(index)!.getAttributeValue('milliseconds.date')!);
    }

    function getMsEnd(map: GenericMap, index: number): number {
      return parseFloat(map.getElement(index)!.getAttributeValue('milliseconds.date.end')!);
    }

    it('positive offset shifts milliseconds.date and milliseconds.date.end forward', () => {
      // Note at ms=100, end=200, apply offset=50 -> ms=150, end=250
      const asyncMap = AsynchronyMap.createAsynchronyMap();
      asyncMap.addAsynchrony(0, 50);

      const map = createTestMap([{ date: 0, msDate: 100, duration: 480, msEnd: 200 }]);
      asyncMap.renderAsynchronyToMap(map);

      expect(getMsDate(map, 0)).toBeCloseTo(150, 5);
      expect(getMsEnd(map, 0)).toBeCloseTo(250, 5);
    });

    it('negative offset: milliseconds.date clamped to 0', () => {
      // Note at ms=10, apply offset=-20 -> ms=max(0, 10-20)=0
      // end: ms=50 + (-20) = 30, but must be >= startDateMs + 1 = 1
      const asyncMap = AsynchronyMap.createAsynchronyMap();
      asyncMap.addAsynchrony(0, -20);

      const map = createTestMap([{ date: 0, msDate: 10, duration: 480, msEnd: 50 }]);
      asyncMap.renderAsynchronyToMap(map);

      expect(getMsDate(map, 0)).toBeCloseTo(0, 5); // clamped to 0
      expect(getMsEnd(map, 0)).toBeCloseTo(30, 5); // 50 - 20 = 30, which is >= 0+1
    });

    it('negative offset clamps end to startDateMs + 1', () => {
      // Note at ms=10, end=15, apply offset=-20
      // startDateMs = max(0, 10 - 20) = 0
      // end = 15 - 20 = -5, but clamped to max(-5, 0+1) = 1
      const asyncMap = AsynchronyMap.createAsynchronyMap();
      asyncMap.addAsynchrony(0, -20);

      const map = createTestMap([{ date: 0, msDate: 10, duration: 480, msEnd: 15 }]);
      asyncMap.renderAsynchronyToMap(map);

      expect(getMsDate(map, 0)).toBeCloseTo(0, 5);
      expect(getMsEnd(map, 0)).toBeCloseTo(1, 5); // clamped to startDateMs + 1
    });

    it('zero offset does not change values', () => {
      const asyncMap = AsynchronyMap.createAsynchronyMap();
      asyncMap.addAsynchrony(0, 0);

      const map = createTestMap([{ date: 0, msDate: 100, duration: 480, msEnd: 200 }]);
      asyncMap.renderAsynchronyToMap(map);

      expect(getMsDate(map, 0)).toBeCloseTo(100, 5);
      expect(getMsEnd(map, 0)).toBeCloseTo(200, 5);
    });

    it('null map is handled gracefully', () => {
      const asyncMap = AsynchronyMap.createAsynchronyMap();
      asyncMap.addAsynchrony(0, 50);
      // Should not throw
      asyncMap.renderAsynchronyToMap(null);
    });

    it('empty asynchrony map does nothing', () => {
      const asyncMap = AsynchronyMap.createAsynchronyMap();
      const map = createTestMap([{ date: 0, msDate: 100, duration: 480, msEnd: 200 }]);
      asyncMap.renderAsynchronyToMap(map);

      expect(getMsDate(map, 0)).toBeCloseTo(100, 5);
      expect(getMsEnd(map, 0)).toBeCloseTo(200, 5);
    });

    it('multiple asynchrony values apply to respective date ranges', () => {
      const asyncMap = AsynchronyMap.createAsynchronyMap();
      asyncMap.addAsynchrony(0, 10);
      asyncMap.addAsynchrony(480, 20);

      // Note at date=0 gets offset 10, note at date=480 gets offset 20
      const map = createTestMap([
        { date: 0, msDate: 100, duration: 240, msEnd: 200 },
        { date: 480, msDate: 300, duration: 240, msEnd: 400 },
      ]);
      asyncMap.renderAsynchronyToMap(map);

      expect(getMsDate(map, 0)).toBeCloseTo(110, 5); // 100 + 10
      expect(getMsEnd(map, 0)).toBeCloseTo(210, 5); // 200 + 10
      expect(getMsDate(map, 1)).toBeCloseTo(320, 5); // 300 + 20
      expect(getMsEnd(map, 1)).toBeCloseTo(420, 5); // 400 + 20
    });

    it('static renderAsynchronyToMap delegates correctly', () => {
      const asyncMap = AsynchronyMap.createAsynchronyMap();
      asyncMap.addAsynchrony(0, 50);

      const map = createTestMap([{ date: 0, msDate: 100, duration: 480, msEnd: 200 }]);
      AsynchronyMap.renderAsynchronyToMap(map, asyncMap);

      expect(getMsDate(map, 0)).toBeCloseTo(150, 5);
    });

    it('static renderAsynchronyToMap with null asynchrony map does nothing', () => {
      const map = createTestMap([{ date: 0, msDate: 100, duration: 480, msEnd: 200 }]);
      AsynchronyMap.renderAsynchronyToMap(map, null);
      expect(getMsDate(map, 0)).toBeCloseTo(100, 5);
    });

    it('large positive offset', () => {
      const asyncMap = AsynchronyMap.createAsynchronyMap();
      asyncMap.addAsynchrony(0, 5000);

      const map = createTestMap([{ date: 0, msDate: 100, duration: 480, msEnd: 200 }]);
      asyncMap.renderAsynchronyToMap(map);

      expect(getMsDate(map, 0)).toBeCloseTo(5100, 5);
      expect(getMsEnd(map, 0)).toBeCloseTo(5200, 5);
    });

    it('notes without duration attribute are still processed for date', () => {
      // Create a map entry without a duration attribute
      const map = okValue(GenericMap.createGenericMap('positionMap'));
      const e = new Element('note', Mpm.MPM_NAMESPACE);
      e.addAttribute(new Attribute('date', '0'));
      e.addAttribute(new Attribute('milliseconds.date', '100'));
      // No duration attribute
      map.addElement(e);

      const asyncMap = AsynchronyMap.createAsynchronyMap();
      asyncMap.addAsynchrony(0, 25);
      asyncMap.renderAsynchronyToMap(map);

      expect(parseFloat(map.getElement(0)!.getAttributeValue('milliseconds.date')!)).toBeCloseTo(
        125,
        5,
      );
    });
  });

  // ---------------------------------------------------------------
  // GenericMap operations on AsynchronyMap
  // ---------------------------------------------------------------
  describe('GenericMap operations', () => {
    it('should support removeElement by index', () => {
      const map = AsynchronyMap.createAsynchronyMap();
      map.addAsynchrony(0, 50);
      map.addAsynchrony(960, 30);

      map.removeElementAt(0);
      expect(map.size()).toBe(1);
      expect(map.getElement(0)!.getAttributeValue('milliseconds.offset')).toBe('30');
    });

    it('should support setId and getId', () => {
      const map = AsynchronyMap.createAsynchronyMap();
      expect(map.getId()).toBeNull();

      map.setId('asyncMap-1');
      expect(map.getId()).toBe('asyncMap-1');
    });

    it('should support addStyleSwitch', () => {
      const map = AsynchronyMap.createAsynchronyMap();
      const index = map.addStyleSwitch(0, 'myStyle');
      expect(index).toBeGreaterThanOrEqual(0);
      expect(map.size()).toBe(1);

      const elem = map.getElement(index)!;
      expect(elem.getLocalName()).toBe('style');
      expect(elem.getAttributeValue('name.ref')).toBe('myStyle');
    });

    it('should support getElementBeforeAt', () => {
      const map = AsynchronyMap.createAsynchronyMap();
      map.addAsynchrony(0, 10);
      map.addAsynchrony(480, 20);
      map.addAsynchrony(960, 30);

      const elem = map.getElementBeforeAt(500);
      expect(elem).not.toBeNull();
      expect(elem!.getAttributeValue('milliseconds.offset')).toBe('20');
    });
  });
});
