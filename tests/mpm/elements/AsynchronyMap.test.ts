import { describe, it, expect } from 'vitest';
import { okValue } from '../../support/result.js';
import { expectOptionsRoundTrip } from '../../support/optionsRoundTrip.js';
import { AsynchronyMap, type AddAsynchronyOptions } from '../../../src/mpm/elements/maps/AsynchronyMap.js';
import { GenericMap } from '../../../src/mpm/elements/maps/GenericMap.js';
import { Element, Attribute } from '../../../src/xml/XomTypes.js';
import { Mpm } from '../../../src/mpm/Mpm.js';

describe('AsynchronyMap', () => {
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
     * An asynchronyMap holds ordinary dated entries, `<style>` switches included, and
     * `getElementIndexBeforeAt` finds the nearest of any kind. The entry it lands on may
     * therefore not be an asynchrony, and reading `@milliseconds.offset` off a `<style>`
     * gives `parseFloat('')`, i.e. NaN, which propagates into every millisecond date the
     * asynchrony pass touches.
     *
     * Nothing else pins the skip: deleting the local-name test leaves every test in the tree
     * green, because no fixture and no other unit test puts a non-asynchrony entry into an
     * asynchronyMap before the date being asked about.
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

  describe('renderAsynchronyToMap', () => {
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

    /**
     * `@modified` records which instruction moved a note.
     *
     * `renderAsynchronyToMap` appends the asynchrony instruction's id to `@modified` on every
     * entry it shifts. Java's `Helper.getAttribute` matches a local name, and the attribute's
     * local name is `id`, so the `getAttributeValue('xml:id', …)` lookup missed and returned
     * `""` for every element — inert in the Java fork and in this port, until the fork's fix
     * at `meico@68ccd3b8`, taken here at the same time.
     *
     * No fixture can show this: `GenerateAllMapsReference` builds its asynchrony instructions
     * with `addAsynchrony(date, offset)` and no id, so every `modified` attribute in the
     * corpus reads empty even with the lookup fixed.
     */
    it('records the instruction id in @modified, not an empty string', () => {
      const map = createTestMap([
        { date: 0, msDate: 0, duration: 720, msEnd: 500 },
        { date: 720, msDate: 500, duration: 720, msEnd: 1000 },
      ]);
      const asyn = AsynchronyMap.createAsynchronyMap();
      const index = asyn.addAsynchrony(0, 50);
      asyn
        .getElement(index)!
        .addAttribute(new Attribute('xml:id', 'http://www.w3.org/XML/1998/namespace', 'asyn1'));

      asyn.renderAsynchronyToMap(map);

      for (const i of [0, 1]) {
        expect(map.getElement(i)!.getAttributeValue('modified')).toBe('asyn1');
      }
    });

    it('appends nothing when the instruction genuinely has no id', () => {
      // `toBeNull` and not `toBe('')`: the `modified=""` on every element of every reference
      // document is seeded by `Performance.addModifiedAttributes` before the render passes
      // run. Driving the pass against a hand-built map skips that seeding, so there is no
      // attribute at all — the pass appends to `@modified`, it does not create it.
      const map = createTestMap([{ date: 0, msDate: 0, duration: 720, msEnd: 500 }]);
      const asyn = AsynchronyMap.createAsynchronyMap();
      asyn.addAsynchrony(0, 50);

      asyn.renderAsynchronyToMap(map);

      expect(map.getElement(0)!.getAttributeValue('modified')).toBeNull();
    });

    function getMsDate(map: GenericMap, index: number): number {
      return parseFloat(map.getElement(index)!.getAttributeValue('milliseconds.date')!);
    }

    function getMsEnd(map: GenericMap, index: number): number {
      return parseFloat(map.getElement(index)!.getAttributeValue('milliseconds.date.end')!);
    }

    it('positive offset shifts milliseconds.date and milliseconds.date.end forward', () => {
      const asyncMap = AsynchronyMap.createAsynchronyMap();
      asyncMap.addAsynchrony(0, 50);

      const map = createTestMap([{ date: 0, msDate: 100, duration: 480, msEnd: 200 }]);
      asyncMap.renderAsynchronyToMap(map);

      expect(getMsDate(map, 0)).toBeCloseTo(150, 5);
      expect(getMsEnd(map, 0)).toBeCloseTo(250, 5);
    });

    it('negative offset: milliseconds.date clamped to 0', () => {
      const asyncMap = AsynchronyMap.createAsynchronyMap();
      asyncMap.addAsynchrony(0, -20);

      const map = createTestMap([{ date: 0, msDate: 10, duration: 480, msEnd: 50 }]);
      asyncMap.renderAsynchronyToMap(map);

      expect(getMsDate(map, 0)).toBeCloseTo(0, 5); // clamped to 0
      expect(getMsEnd(map, 0)).toBeCloseTo(30, 5); // 50 - 20 = 30, which is >= 0+1
    });

    it('negative offset clamps end to startDateMs + 1', () => {
      // end = 15 - 20 = -5, clamped up to max(-5, startDateMs + 1) = 1.
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

describe('getAsynchronyOptionsOf / updateAsynchronyAt', () => {
  const makeMap = () => AsynchronyMap.createAsynchronyMap();

  it('round-trips every shape addAsynchrony can write', () => {
    expectOptionsRoundTrip<AsynchronyMap, AddAsynchronyOptions>({
      makeMap,
      add: (map, o) => map.addAsynchrony(o),
      read: (map, i) => map.getAsynchronyOptionsOf(i),
      samples: [
        { date: 0, millisecondsOffset: 50 },
        { date: 720, millisecondsOffset: -25.5, id: 'asyn1' },
        { date: 1440, millisecondsOffset: 0, id: 'has-a-dash' },
      ],
    });
  });

  it('writes what the positional form writes', () => {
    const positional = makeMap();
    positional.addAsynchrony(100, -25.5);

    const options = makeMap();
    options.addAsynchrony({ date: 100, millisecondsOffset: -25.5 });

    expect(options.getElement(0)?.toXML()).toBe(positional.getElement(0)?.toXML());
  });

  it('reads one element, where getAsynchronyAt reads the offset in force', () => {
    const map = makeMap();
    map.addAsynchrony(480, 20);

    // Before the only instruction there is no element to read, and an offset of 0 all the same.
    expect(map.getAsynchronyAt(0)).toBe(0);
    expect(map.getAsynchronyOptionsOf(0)).toMatchObject({ date: 480, millisecondsOffset: 20 });
  });

  it('leaves an omitted field alone, removes one patched to undefined', () => {
    const map = makeMap();
    map.addAsynchrony({ date: 0, millisecondsOffset: 50, id: 'asyn1' });

    expect(map.updateAsynchronyAt(0, { millisecondsOffset: -10 })).toBe(true);
    expect(map.getAsynchronyOptionsOf(0)).toMatchObject({
      date: 0,
      millisecondsOffset: -10,
      id: 'asyn1',
    });

    // `id` is this map's only optional field, so it is the only one that can pin the removal —
    // and `xml:id` is the one attribute name the lookup has to adjust to find at all.
    map.updateAsynchronyAt(0, { id: undefined });
    expect(map.getAsynchronyOptionsOf(0)?.id).toBeUndefined();
    expect(map.getElement(0)?.getAttributeValue('xml:id')).toBeNull();
    expect(map.getAsynchronyOptionsOf(0)?.millisecondsOffset).toBe(-10);
  });

  it('writes through an existing attribute rather than moving it to the end', () => {
    const map = makeMap();
    map.addAsynchrony({ date: 0, millisecondsOffset: 50, id: 'asyn1' });
    // Behind `xml:id`, which is otherwise last: without something after it, an `xml:id` that
    // got appended rather than written through would land back where it started.
    map.getElement(0)?.addAttribute(new Attribute('corresp', 'arg1'));
    const before = map.getElement(0)?.toXML();

    map.updateAsynchronyAt(0, { date: 0, millisecondsOffset: 50, id: 'asyn1' });
    expect(map.getElement(0)?.toXML()).toBe(before);
  });

  it('never touches an attribute no option names', () => {
    const map = makeMap();
    map.addAsynchrony(0, 50);
    map.getElement(0)?.addAttribute(new Attribute('corresp', 'arg1'));

    map.updateAsynchronyAt(0, { millisecondsOffset: 10, id: 'asyn1' });
    expect(map.getElement(0)?.getAttributeValue('corresp')).toBe('arg1');
  });

  it('re-keys and re-sorts the map when @date is patched', () => {
    const map = makeMap();
    map.addAsynchrony({ date: 0, millisecondsOffset: 10, id: 'first' });
    map.addAsynchrony({ date: 1000, millisecondsOffset: 20, id: 'second' });

    map.updateAsynchronyAt(0, { date: 2000 });

    expect(map.getAllElements().map((e) => e.key)).toEqual([1000, 2000]);
    expect(map.getElement(0)?.getAttributeValue('xml:id')).toBe('second');
    // The lookup index moved with it, which is the half that writing the attribute alone misses.
    expect(map.getAsynchronyAt(2500)).toBe(10);
  });

  it('refuses an entry that is not an <asynchrony>', () => {
    const map = makeMap();
    map.addStyleSwitch(0, 'someStyle');
    expect(map.getAsynchronyOptionsOf(0)).toBeNull();
    expect(map.updateAsynchronyAt(0, { millisecondsOffset: 10 })).toBe(false);
  });
});
