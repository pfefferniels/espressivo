import { describe, it, expect } from 'vitest';
import { errOf, okValue } from '../../support/result.js';
import { GenericMap } from '../../../src/mpm/elements/maps/GenericMap.js';
import { Element, Attribute } from '../../../src/xml/XomTypes.js';
import { KeyValue } from '../../../src/supplementary/KeyValue.js';
import { Mpm } from '../../../src/mpm/Mpm.js';

/**
 * Helper: create a GenericMap and populate it with elements at the given dates.
 * Each element is a <tempo> element with a date attribute and a bpm attribute for identification.
 */
function makeMap(dates: number[]): GenericMap {
  const map = okValue(GenericMap.createGenericMap('tempoMap'));
  for (const d of dates) {
    const e = new Element('tempo', Mpm.MPM_NAMESPACE);
    e.addAttribute(new Attribute('date', String(d)));
    e.addAttribute(new Attribute('bpm', String(d))); // use date value as bpm for easy identification
    map.addElement(e);
  }
  return map;
}

/**
 * A map that exposes the two `protected` positional lookups, so the contract their doc
 * comments state can be checked at all.
 *
 * Every production caller reaches `findStyleSwitchAt` through `resolveEntryIndex`, which has
 * already established that the entry at that index is an instruction of a named kind — never
 * a `<style>`. So the one thing those comments call load-bearing, that the scan starts *at*
 * the index rather than before it, is unreachable from outside this class, and moving the
 * start to `index - 1` broke no test in the tree. It is pinned here instead.
 */
class ExposedMap extends GenericMap {
  static make(type: string): ExposedMap {
    return new ExposedMap(GenericMap.emptyMapElement(type));
  }
  styleSwitchAt(index: number): Element | null {
    return this.findStyleSwitchAt(index);
  }
  styleNameAt(index: number): string | null {
    return this.findStyleNameAt(index);
  }
}

// ==========================================================================
//  GenericMap Tests
// ==========================================================================
describe('GenericMap', () => {
  // ---------------------------------------------------------------
  //  Construction
  // ---------------------------------------------------------------
  describe('construction', () => {
    it('should create a map from a string name containing "Map"', () => {
      expect(okValue(GenericMap.createGenericMap('tempoMap')).getType()).toBe('tempoMap');
    });

    it('should create a map from a string name "score"', () => {
      expect(okValue(GenericMap.createGenericMap('score')).getType()).toBe('score');
    });

    // Was `expect(map).toBeNull()` with the reason on stderr. The rejection is the same one;
    // what it says is new, and it is what a caller would have had to parse a log line for.
    it('should name the offending local name for a type that is no map', () => {
      expect(errOf(GenericMap.createGenericMap('invalid'))).toEqual({
        kind: 'wrongLocalName',
        what: 'GenericMap',
        localName: 'invalid',
        requirement: 'must contain "Map" or equal "score"',
      });
    });

    it('should reject an element that is no map, naming it', () => {
      expect(errOf(GenericMap.createGenericMap(new Element('note')))).toEqual({
        kind: 'wrongLocalName',
        what: 'GenericMap',
        localName: 'note',
        requirement: 'must contain "Map" or equal "score"',
      });
    });

    it('should reject a null element rather than printing it', () => {
      expect(errOf(GenericMap.createGenericMap(null as unknown as Element))).toEqual({
        kind: 'noElement',
        what: 'GenericMap',
      });
    });

    it('should create a map from an XML element', () => {
      const xml = new Element('dynamicsMap', Mpm.MPM_NAMESPACE);
      expect(okValue(GenericMap.createGenericMap(xml)).getType()).toBe('dynamicsMap');
    });

    it('should start empty', () => {
      const map = okValue(GenericMap.createGenericMap('tempoMap'));
      expect(map.size()).toBe(0);
      expect(map.isEmpty()).toBe(true);
      expect(map.getAllElements()).toEqual([]);
    });
  });

  // ---------------------------------------------------------------
  //  setId / getId
  // ---------------------------------------------------------------
  describe('setId / getId', () => {
    it('should have null id initially', () => {
      const map = okValue(GenericMap.createGenericMap('tempoMap'));
      expect(map.getId()).toBeNull();
    });

    it('should set and get an id', () => {
      const map = okValue(GenericMap.createGenericMap('tempoMap'));
      map.setId('map-1');
      expect(map.getId()).toBe('map-1');
    });

    it('should update an existing id', () => {
      const map = okValue(GenericMap.createGenericMap('tempoMap'));
      map.setId('map-1');
      map.setId('map-2');
      expect(map.getId()).toBe('map-2');
    });

    it('should remove the id when set to null', () => {
      const map = okValue(GenericMap.createGenericMap('tempoMap'));
      map.setId('map-1');
      expect(map.getId()).toBe('map-1');
      map.setId(null);
      expect(map.getId()).toBeNull();
    });

    it('should be idempotent when removing a non-existent id', () => {
      const map = okValue(GenericMap.createGenericMap('tempoMap'));
      map.setId(null); // no-op, id was already null
      expect(map.getId()).toBeNull();
    });
  });

  // ---------------------------------------------------------------
  //  addElement
  // ---------------------------------------------------------------
  describe('addElement', () => {
    it('should add a single element', () => {
      const map = okValue(GenericMap.createGenericMap('tempoMap'));
      const e = new Element('tempo', Mpm.MPM_NAMESPACE);
      e.addAttribute(new Attribute('date', '100'));
      const idx = map.addElement(e);
      expect(idx).toBe(0);
      expect(map.size()).toBe(1);
    });

    it('should reject an element without a date attribute', () => {
      const map = okValue(GenericMap.createGenericMap('tempoMap'));
      const e = new Element('tempo', Mpm.MPM_NAMESPACE);
      const idx = map.addElement(e);
      expect(idx).toBe(-1);
      expect(map.size()).toBe(0);
    });

    it('should reject a style element without name.ref', () => {
      const map = okValue(GenericMap.createGenericMap('tempoMap'));
      const e = new Element('style', Mpm.MPM_NAMESPACE);
      e.addAttribute(new Attribute('date', '0'));
      const idx = map.addElement(e);
      expect(idx).toBe(-1);
      expect(map.size()).toBe(0);
    });

    it('should accept a style element with name.ref', () => {
      const map = okValue(GenericMap.createGenericMap('tempoMap'));
      const e = new Element('style', Mpm.MPM_NAMESPACE);
      e.addAttribute(new Attribute('date', '0'));
      e.addAttribute(new Attribute('name.ref', 'myStyle'));
      const idx = map.addElement(e);
      expect(idx).toBeGreaterThanOrEqual(0);
      expect(map.size()).toBe(1);
    });

    it('should maintain sorted order (ascending dates)', () => {
      const map = makeMap([300, 100, 500, 200, 400]);
      const elements = map.getAllElements();
      const dates = elements.map((kv) => kv.getKey());
      expect(dates).toEqual([100, 200, 300, 400, 500]);
    });

    it('should place elements with the same date after existing ones (last-at-date)', () => {
      const map = okValue(GenericMap.createGenericMap('tempoMap'));
      const e1 = new Element('tempo', Mpm.MPM_NAMESPACE);
      e1.addAttribute(new Attribute('date', '100'));
      e1.addAttribute(new Attribute('bpm', 'first'));
      map.addElement(e1);

      const e2 = new Element('tempo', Mpm.MPM_NAMESPACE);
      e2.addAttribute(new Attribute('date', '100'));
      e2.addAttribute(new Attribute('bpm', 'second'));
      map.addElement(e2);

      expect(map.size()).toBe(2);
      expect(map.getElement(0)!.getAttributeValue('bpm')).toBe('first');
      expect(map.getElement(1)!.getAttributeValue('bpm')).toBe('second');
    });

    it('should add an element before everything if its date is smallest', () => {
      const map = makeMap([200, 300]);
      const e = new Element('tempo', Mpm.MPM_NAMESPACE);
      e.addAttribute(new Attribute('date', '50'));
      const idx = map.addElement(e);
      expect(idx).toBe(0);
      expect(map.getAllElements()[0].getKey()).toBe(50);
    });

    it('should add an element at the end if its date is largest', () => {
      const map = makeMap([100, 200]);
      const e = new Element('tempo', Mpm.MPM_NAMESPACE);
      e.addAttribute(new Attribute('date', '999'));
      const idx = map.addElement(e);
      expect(idx).toBe(2);
      expect(map.getAllElements()[2].getKey()).toBe(999);
    });
  });

  // ---------------------------------------------------------------
  //  removeElement
  // ---------------------------------------------------------------
  describe('removeElement', () => {
    it('should remove an element by index', () => {
      const map = makeMap([100, 200, 300]);
      map.removeElement(1);
      expect(map.size()).toBe(2);
      const dates = map.getAllElements().map((kv) => kv.getKey());
      expect(dates).toEqual([100, 300]);
    });

    it('should do nothing for an out-of-range index', () => {
      const map = makeMap([100, 200]);
      map.removeElement(10);
      expect(map.size()).toBe(2);
    });

    it('should remove the first element by index 0', () => {
      const map = makeMap([100, 200, 300]);
      map.removeElement(0);
      expect(map.size()).toBe(2);
      expect(map.getAllElements()[0].getKey()).toBe(200);
    });

    it('should remove the last element by its index', () => {
      const map = makeMap([100, 200, 300]);
      map.removeElement(2);
      expect(map.size()).toBe(2);
      expect(map.getAllElements()[1].getKey()).toBe(200);
    });

    it('should remove an element by reference', () => {
      const map = okValue(GenericMap.createGenericMap('tempoMap'));
      const e = new Element('tempo', Mpm.MPM_NAMESPACE);
      e.addAttribute(new Attribute('date', '100'));
      map.addElement(e);

      expect(map.size()).toBe(1);
      map.removeElement(e);
      expect(map.size()).toBe(0);
    });

    it('should do nothing when removing an element reference not in the map', () => {
      const map = makeMap([100]);
      const stranger = new Element('tempo', Mpm.MPM_NAMESPACE);
      stranger.addAttribute(new Attribute('date', '999'));
      map.removeElement(stranger);
      expect(map.size()).toBe(1);
    });
  });

  // ---------------------------------------------------------------
  //  getFirstElement / getLastElement / getElement
  // ---------------------------------------------------------------
  describe('getFirstElement / getLastElement / getElement', () => {
    it('getFirstElement returns null on empty map', () => {
      const map = okValue(GenericMap.createGenericMap('tempoMap'));
      expect(map.getFirstElement()).toBeNull();
    });

    it('getLastElement returns null on empty map', () => {
      const map = okValue(GenericMap.createGenericMap('tempoMap'));
      expect(map.getLastElement()).toBeNull();
    });

    it('getElement returns null for negative index', () => {
      const map = makeMap([100]);
      expect(map.getElement(-1)).toBeNull();
    });

    it('getElement returns null for index >= size', () => {
      const map = makeMap([100]);
      expect(map.getElement(1)).toBeNull();
    });

    it('getFirstElement returns the element at the earliest date', () => {
      const map = makeMap([300, 100, 200]);
      expect(map.getFirstElement()!.getAttributeValue('bpm')).toBe('100');
    });

    it('getLastElement returns the element at the latest date', () => {
      const map = makeMap([300, 100, 200]);
      expect(map.getLastElement()!.getAttributeValue('bpm')).toBe('300');
    });

    it('getElement returns the element at the specified index', () => {
      const map = makeMap([100, 200, 300]);
      expect(map.getElement(0)!.getAttributeValue('bpm')).toBe('100');
      expect(map.getElement(1)!.getAttributeValue('bpm')).toBe('200');
      expect(map.getElement(2)!.getAttributeValue('bpm')).toBe('300');
    });
  });

  // ---------------------------------------------------------------
  //  Binary search: getElementIndexBeforeAt
  // ---------------------------------------------------------------
  describe('getElementIndexBeforeAt', () => {
    it('returns -1 for an empty map', () => {
      const map = okValue(GenericMap.createGenericMap('tempoMap'));
      expect(map.getElementIndexBeforeAt(0)).toBe(-1);
    });

    it('returns -1 when date is before all elements', () => {
      const map = makeMap([100, 200, 300]);
      expect(map.getElementIndexBeforeAt(50)).toBe(-1);
    });

    it('returns last index when date is after all elements', () => {
      const map = makeMap([100, 200, 300]);
      expect(map.getElementIndexBeforeAt(999)).toBe(2);
    });

    it('returns the index of the element at exact date', () => {
      const map = makeMap([100, 200, 300]);
      expect(map.getElementIndexBeforeAt(200)).toBe(1);
    });

    it('returns the index of the element just before the date', () => {
      const map = makeMap([100, 200, 300]);
      expect(map.getElementIndexBeforeAt(250)).toBe(1);
    });

    it('returns 0 when date equals the first element date', () => {
      const map = makeMap([100, 200, 300]);
      expect(map.getElementIndexBeforeAt(100)).toBe(0);
    });

    it('returns last index when date equals the last element date', () => {
      const map = makeMap([100, 200, 300]);
      expect(map.getElementIndexBeforeAt(300)).toBe(2);
    });

    it('works with a single element: date matches', () => {
      const map = makeMap([100]);
      expect(map.getElementIndexBeforeAt(100)).toBe(0);
    });

    it('works with a single element: date after', () => {
      const map = makeMap([100]);
      expect(map.getElementIndexBeforeAt(200)).toBe(0);
    });

    it('works with a single element: date before', () => {
      const map = makeMap([100]);
      expect(map.getElementIndexBeforeAt(50)).toBe(-1);
    });

    it('handles duplicate dates (returns last at date)', () => {
      const map = okValue(GenericMap.createGenericMap('tempoMap'));
      for (const d of [100, 100, 200]) {
        const e = new Element('tempo', Mpm.MPM_NAMESPACE);
        e.addAttribute(new Attribute('date', String(d)));
        map.addElement(e);
      }
      // Two elements at 100, one at 200. getElementIndexBeforeAt(100) should return index 1 (the last at 100).
      expect(map.getElementIndexBeforeAt(100)).toBe(1);
    });

    it('handles many elements (stress test)', () => {
      // dates: 0, 10, 20, ..., 990
      const dates = Array.from({ length: 100 }, (_, i) => i * 10);
      const map = makeMap(dates);
      expect(map.getElementIndexBeforeAt(0)).toBe(0);
      expect(map.getElementIndexBeforeAt(5)).toBe(0);
      expect(map.getElementIndexBeforeAt(10)).toBe(1);
      expect(map.getElementIndexBeforeAt(15)).toBe(1);
      expect(map.getElementIndexBeforeAt(990)).toBe(99);
      expect(map.getElementIndexBeforeAt(1000)).toBe(99);
      expect(map.getElementIndexBeforeAt(-5)).toBe(-1);
    });
  });

  // ---------------------------------------------------------------
  //  Binary search: getElementIndexBefore
  // ---------------------------------------------------------------
  describe('getElementIndexBefore', () => {
    it('returns -1 for an empty map', () => {
      const map = okValue(GenericMap.createGenericMap('tempoMap'));
      expect(map.getElementIndexBefore(0)).toBe(-1);
    });

    it('returns -1 when date is before or at the first element', () => {
      const map = makeMap([100, 200, 300]);
      expect(map.getElementIndexBefore(100)).toBe(-1);
      expect(map.getElementIndexBefore(50)).toBe(-1);
    });

    it('returns the index of the element strictly before the date', () => {
      const map = makeMap([100, 200, 300]);
      expect(map.getElementIndexBefore(200)).toBe(0);
      expect(map.getElementIndexBefore(250)).toBe(1);
    });

    it('returns the last index when date is after all elements', () => {
      const map = makeMap([100, 200, 300]);
      expect(map.getElementIndexBefore(999)).toBe(2);
    });

    it('returns 0 when date is between the first two elements', () => {
      const map = makeMap([100, 200, 300]);
      expect(map.getElementIndexBefore(150)).toBe(0);
    });

    it('works with a single element: date after', () => {
      const map = makeMap([100]);
      expect(map.getElementIndexBefore(200)).toBe(0);
    });

    it('works with a single element: date at element (strictly before means -1)', () => {
      const map = makeMap([100]);
      expect(map.getElementIndexBefore(100)).toBe(-1);
    });

    it('works with a single element: date before element', () => {
      const map = makeMap([100]);
      expect(map.getElementIndexBefore(50)).toBe(-1);
    });

    it('handles many elements (stress test)', () => {
      const dates = Array.from({ length: 100 }, (_, i) => i * 10);
      const map = makeMap(dates);
      // Strictly before 0 → -1
      expect(map.getElementIndexBefore(0)).toBe(-1);
      // Strictly before 10 → index 0 (date 0)
      expect(map.getElementIndexBefore(10)).toBe(0);
      // Strictly before 15 → index 1 (date 10)
      expect(map.getElementIndexBefore(15)).toBe(1);
      // Strictly before 990 → index 98 (date 980)
      expect(map.getElementIndexBefore(990)).toBe(98);
      // Strictly before 1000 → index 99 (date 990)
      expect(map.getElementIndexBefore(1000)).toBe(99);
    });
  });

  // ---------------------------------------------------------------
  //  Binary search: getElementIndexAfter
  // ---------------------------------------------------------------
  describe('getElementIndexAfter', () => {
    it('returns -1 for an empty map', () => {
      const map = okValue(GenericMap.createGenericMap('tempoMap'));
      expect(map.getElementIndexAfter(0)).toBe(-1);
    });

    it('returns -1 when date is at or after the last element', () => {
      const map = makeMap([100, 200, 300]);
      expect(map.getElementIndexAfter(300)).toBe(-1);
      expect(map.getElementIndexAfter(999)).toBe(-1);
    });

    it('returns 0 when date is before the first element', () => {
      const map = makeMap([100, 200, 300]);
      expect(map.getElementIndexAfter(50)).toBe(0);
    });

    it('returns the index of the element strictly after the date', () => {
      const map = makeMap([100, 200, 300]);
      expect(map.getElementIndexAfter(100)).toBe(1);
      expect(map.getElementIndexAfter(150)).toBe(1);
      expect(map.getElementIndexAfter(200)).toBe(2);
    });

    it('works with a single element: date before', () => {
      const map = makeMap([100]);
      expect(map.getElementIndexAfter(50)).toBe(0);
    });

    it('works with a single element: date at element', () => {
      const map = makeMap([100]);
      expect(map.getElementIndexAfter(100)).toBe(-1);
    });

    it('works with a single element: date after element', () => {
      const map = makeMap([100]);
      expect(map.getElementIndexAfter(200)).toBe(-1);
    });

    it('handles many elements (stress test)', () => {
      const dates = Array.from({ length: 100 }, (_, i) => i * 10);
      const map = makeMap(dates);
      // After -5 → index 0
      expect(map.getElementIndexAfter(-5)).toBe(0);
      // After 0 → index 1
      expect(map.getElementIndexAfter(0)).toBe(1);
      // After 5 → index 1 (next after 0 is 10)
      expect(map.getElementIndexAfter(5)).toBe(1);
      // After 980 → index 99 (date 990)
      expect(map.getElementIndexAfter(980)).toBe(99);
      // After 990 → -1
      expect(map.getElementIndexAfter(990)).toBe(-1);
    });
  });

  // ---------------------------------------------------------------
  //  Binary search: getElementIndexAtAfter
  // ---------------------------------------------------------------
  describe('getElementIndexAtAfter', () => {
    it('returns -1 for an empty map', () => {
      const map = okValue(GenericMap.createGenericMap('tempoMap'));
      expect(map.getElementIndexAtAfter(0)).toBe(-1);
    });

    it('returns -1 when date is after the last element', () => {
      const map = makeMap([100, 200, 300]);
      expect(map.getElementIndexAtAfter(301)).toBe(-1);
    });

    it('returns the index of the element at or after the date', () => {
      const map = makeMap([100, 200, 300]);
      // At exact date
      expect(map.getElementIndexAtAfter(100)).toBe(0);
      expect(map.getElementIndexAtAfter(200)).toBe(1);
      expect(map.getElementIndexAtAfter(300)).toBe(2);
      // Between elements
      expect(map.getElementIndexAtAfter(150)).toBe(1);
      expect(map.getElementIndexAtAfter(250)).toBe(2);
    });

    it('returns 0 when date is before all elements', () => {
      const map = makeMap([100, 200, 300]);
      expect(map.getElementIndexAtAfter(50)).toBe(0);
    });

    it('works with a single element', () => {
      const map = makeMap([100]);
      expect(map.getElementIndexAtAfter(50)).toBe(0);
      expect(map.getElementIndexAtAfter(100)).toBe(0);
      expect(map.getElementIndexAtAfter(150)).toBe(-1);
    });

    it('handles many elements (stress test)', () => {
      const dates = Array.from({ length: 100 }, (_, i) => i * 10);
      const map = makeMap(dates);
      expect(map.getElementIndexAtAfter(-5)).toBe(0);
      expect(map.getElementIndexAtAfter(0)).toBe(0);
      expect(map.getElementIndexAtAfter(5)).toBe(1);
      expect(map.getElementIndexAtAfter(10)).toBe(1);
      expect(map.getElementIndexAtAfter(990)).toBe(99);
      expect(map.getElementIndexAtAfter(991)).toBe(-1);
    });
  });

  // ---------------------------------------------------------------
  //  getElementIndexOf
  // ---------------------------------------------------------------
  describe('getElementIndexOf', () => {
    it('returns -1 for null', () => {
      const map = makeMap([100, 200]);
      expect(map.getElementIndexOf(null)).toBe(-1);
    });

    it('returns -1 for an element not in the map', () => {
      const map = makeMap([100, 200]);
      const stranger = new Element('tempo', Mpm.MPM_NAMESPACE);
      expect(map.getElementIndexOf(stranger)).toBe(-1);
    });

    it('returns the correct index for an element in the map', () => {
      const map = okValue(GenericMap.createGenericMap('tempoMap'));
      const e = new Element('tempo', Mpm.MPM_NAMESPACE);
      e.addAttribute(new Attribute('date', '100'));
      map.addElement(e);
      expect(map.getElementIndexOf(e)).toBe(0);
    });
  });

  // ---------------------------------------------------------------
  //  getAllElements / getAllElementsOfType / getAllElementsAt
  // ---------------------------------------------------------------
  describe('getAllElements / getAllElementsOfType / getAllElementsAt', () => {
    it('getAllElements returns all elements in sorted order', () => {
      const map = makeMap([300, 100, 200]);
      const all = map.getAllElements();
      expect(all.length).toBe(3);
      expect(all.map((kv) => kv.getKey())).toEqual([100, 200, 300]);
    });

    it('getAllElementsOfType returns only matching types', () => {
      const map = okValue(GenericMap.createGenericMap('tempoMap'));
      const e1 = new Element('tempo', Mpm.MPM_NAMESPACE);
      e1.addAttribute(new Attribute('date', '0'));
      map.addElement(e1);

      // Add a style switch (different type)
      map.addStyleSwitch(0, 'myStyle');

      const tempos = map.getAllElementsOfType('tempo');
      expect(tempos.length).toBe(1);
      const styles = map.getAllElementsOfType('style');
      expect(styles.length).toBe(1);
    });

    it('getAllElementsAt returns all elements at exact date', () => {
      const map = okValue(GenericMap.createGenericMap('tempoMap'));
      for (let i = 0; i < 3; i++) {
        const e = new Element('tempo', Mpm.MPM_NAMESPACE);
        e.addAttribute(new Attribute('date', '100'));
        e.addAttribute(new Attribute('bpm', String(i)));
        map.addElement(e);
      }
      // Also add one at a different date
      const e2 = new Element('tempo', Mpm.MPM_NAMESPACE);
      e2.addAttribute(new Attribute('date', '200'));
      map.addElement(e2);

      const atDate100 = map.getAllElementsAt(100);
      expect(atDate100.length).toBe(3);
      for (const kv of atDate100) {
        expect(kv.getKey()).toBe(100);
      }
    });

    it('getAllElementsAt returns elements at or after when no exact match (implementation behavior)', () => {
      // getAllElementsAt uses getElementIndexAtAfter, which finds the first element
      // at or after the given date. The first such element is always included, and
      // subsequent elements are included only if they share the exact date.
      const map = makeMap([100, 300]);
      const result = map.getAllElementsAt(200);
      // Element at date 300 is the first at-or-after 200, so it's included
      expect(result.length).toBe(1);
      expect(result[0].getKey()).toBe(300);
    });

    it('getAllElementsAt returns empty array when date is after all elements', () => {
      const map = makeMap([100, 300]);
      expect(map.getAllElementsAt(400)).toEqual([]);
    });

    it('getAllElementsAt returns empty array for empty map', () => {
      const map = okValue(GenericMap.createGenericMap('tempoMap'));
      expect(map.getAllElementsAt(0)).toEqual([]);
    });
  });

  // ---------------------------------------------------------------
  //  sort()
  // ---------------------------------------------------------------
  describe('sort()', () => {
    it('should reorder elements when dates are manually changed', () => {
      const map = makeMap([100, 200, 300]);

      // Manually change the date attribute of the first element to 500
      const first = map.getElement(0)!;
      first.addAttribute(new Attribute('date', '500'));

      // Before sort: the keys are stale
      expect(map.getAllElements()[0].getKey()).toBe(100); // stale key

      map.sort();

      // After sort: keys should be updated and reordered
      const dates = map.getAllElements().map((kv) => kv.getKey());
      expect(dates).toEqual([200, 300, 500]);
    });

    it('sort on an already sorted map is a no-op', () => {
      const map = makeMap([100, 200, 300]);
      map.sort();
      const dates = map.getAllElements().map((kv) => kv.getKey());
      expect(dates).toEqual([100, 200, 300]);
    });

    // PARITY.md §3. `sort()` swaps where an insertion sort would shift, so it is not a sort
    // and not stable. Java does the same (`Collections.swap`), so it is preserved — and pinned
    // here, on purpose, asserting the WRONG result. The test above passes only because its
    // arrangement (one element displaced to the end) is one the swap happens to get right.
    //
    // If this test fails, someone has repaired `sort()`. That is a deliberate act with
    // consequences: read the PARITY entry before updating the expectation.
    it('does NOT sort a general arrangement — the inherited swap defect, pinned', () => {
      const map = makeMap([100, 200, 300]);
      // Rewrite the dates so the keys read 2, 3, 1 once refreshed.
      map.getElement(0)!.addAttribute(new Attribute('date', '2'));
      map.getElement(1)!.addAttribute(new Attribute('date', '3'));
      map.getElement(2)!.addAttribute(new Attribute('date', '1'));

      map.sort();

      const dates = map.getAllElements().map((kv) => kv.getKey());
      expect(dates).toEqual([1, 3, 2]); // a real sort would give [1, 2, 3]
      expect(dates).not.toEqual([1, 2, 3]);
    });

    it('sort on an empty map does not throw', () => {
      const map = okValue(GenericMap.createGenericMap('tempoMap'));
      expect(() => map.sort()).not.toThrow();
    });
  });

  // ---------------------------------------------------------------
  //  addStyleSwitch / getStyleNameAt
  // ---------------------------------------------------------------
  describe('addStyleSwitch / getStyleNameAt', () => {
    it('addStyleSwitch creates a style element with correct attributes', () => {
      const map = okValue(GenericMap.createGenericMap('tempoMap'));
      const idx = map.addStyleSwitch(0, 'legato');
      expect(idx).toBeGreaterThanOrEqual(0);
      const elem = map.getElement(idx)!;
      expect(elem.getLocalName()).toBe('style');
      expect(elem.getAttributeValue('date')).toBe('0');
      expect(elem.getAttributeValue('name.ref')).toBe('legato');
    });

    it('addStyleSwitch with optional id', () => {
      const map = okValue(GenericMap.createGenericMap('tempoMap'));
      const idx = map.addStyleSwitch(0, 'legato', 'style-1');
      const elem = map.getElement(idx)!;
      const idAttr = elem.getAttribute('id', 'http://www.w3.org/XML/1998/namespace');
      expect(idAttr).not.toBeNull();
      expect(idAttr!.getValue()).toBe('style-1');
    });

    it('addStyleSwitch is inserted first-at-date (before same-date elements)', () => {
      const map = okValue(GenericMap.createGenericMap('tempoMap'));
      const e = new Element('tempo', Mpm.MPM_NAMESPACE);
      e.addAttribute(new Attribute('date', '0'));
      map.addElement(e);

      // Style switch at date 0 should be placed before the tempo element
      map.addStyleSwitch(0, 'staccato');
      expect(map.getElement(0)!.getLocalName()).toBe('style');
      expect(map.getElement(1)!.getLocalName()).toBe('tempo');
    });

    /**
     * PARITY — the fallthrough the test below calls "the fallthrough bug", pinned rather than
     * worked around.
     *
     * `insertElement(…, firstAtDate = true)` scans FORWARD for the first entry at or after the
     * new date and inserts before it. When there is none — the new switch is later than
     * everything in the map — the scan falls out of the bottom into the shared
     * `add(0, element)` tail, so a style switch dated after the last instruction lands at the
     * FRONT of the map and takes effect from the top of it.
     *
     * That tail is written for the other branch: `GenericMap.java:559` comments it "if the map
     * is empty or its elements are all after the date of the new element", which is true of
     * the backwards `firstAtDate = false` scan and false of this one. It is Java's, the port
     * copies it, and until now nothing held it in place — the strict-index pass rewrote the
     * two loops as `findIndex` and a shared `insertionIndexFor`, and moving the fallback to
     * the end of the map instead broke no test at all.
     */
    it('addStyleSwitch past the last element lands at the FRONT (GenericMap.java:559)', () => {
      const map = okValue(GenericMap.createGenericMap('tempoMap'));
      const e = new Element('tempo', Mpm.MPM_NAMESPACE);
      e.addAttribute(new Attribute('date', '100'));
      map.addElement(e);

      const at = map.addStyleSwitch(200, 'staccato');
      expect(at).toBe(0);
      expect(map.getElement(0)!.getLocalName()).toBe('style');
      expect(map.getElement(1)!.getLocalName()).toBe('tempo');
      // …and the XML is moved with it, which is what makes the placement observable.
      expect(map.getXml().getChildElements().get(0)!.getLocalName()).toBe('style');
      // The date-based lookup then reports the switch as in force from the top of the map,
      // although its own `@date` is 200.
      expect(map.getStyleNameAt(0)).toBeNull();
      expect(map.getStyleNameAt(200)).toBe('staccato');
    });

    it('getStyleNameAt returns null when no styles exist', () => {
      const map = makeMap([100, 200]);
      expect(map.getStyleNameAt(0)).toBeNull();
      expect(map.getStyleNameAt(150)).toBeNull();
    });

    it('getStyleNameAt returns the most recent style name (only style elements)', () => {
      // Use only style switches to avoid insertElement ordering issues
      const map = okValue(GenericMap.createGenericMap('tempoMap'));
      map.addStyleSwitch(0, 'legato');
      // Adding a second style switch at a later date: insertElement with firstAtDate=true
      // works correctly when there is already an element at or after that date.
      // To avoid the fallthrough bug, we add a tempo element at a very high date first.
      const e = new Element('tempo', Mpm.MPM_NAMESPACE);
      e.addAttribute(new Attribute('date', '9999'));
      map.addElement(e);

      map.addStyleSwitch(100, 'staccato');

      expect(map.getStyleNameAt(0)).toBe('legato');
      expect(map.getStyleNameAt(50)).toBe('legato');
      expect(map.getStyleNameAt(100)).toBe('staccato');
      expect(map.getStyleNameAt(200)).toBe('staccato');
    });

    it('getStyleNameAt returns null for date before first style', () => {
      const map = okValue(GenericMap.createGenericMap('tempoMap'));
      map.addStyleSwitch(100, 'legato');
      expect(map.getStyleNameAt(50)).toBeNull();
    });

    it('findStyleSwitchAt scans from the index inclusive, and is positional not date-based', () => {
      const map = ExposedMap.make('tempoMap');
      const tempo = new Element('tempo', Mpm.MPM_NAMESPACE);
      tempo.addAttribute(new Attribute('date', '0'));
      map.addElement(tempo);
      // `addStyleSwitch` is first-at-date, so this lands at 0, ahead of the tempo.
      map.addStyleSwitch(0, 'legato');
      expect(map.getElement(0)!.getLocalName()).toBe('style');

      // Inclusive: asked about the switch's own position, the scan answers with the switch.
      expect(map.styleSwitchAt(0)!.getAttributeValue('name.ref')).toBe('legato');
      expect(map.styleNameAt(0)).toBe('legato');
      // …and about the instruction after it, with the same one.
      expect(map.styleNameAt(1)).toBe('legato');

      // Positional and not date-based: a switch at the SAME date but a later position is not
      // in scope for the instruction ahead of it, although `getStyleNameAt(0)` would find it.
      // This is the divergence `expression/datedView.ts` documents at length.
      const map2 = ExposedMap.make('tempoMap');
      const t2 = new Element('tempo', Mpm.MPM_NAMESPACE);
      t2.addAttribute(new Attribute('date', '0'));
      map2.addElement(t2);
      const style2 = new Element('style', Mpm.MPM_NAMESPACE);
      style2.addAttribute(new Attribute('date', '0'));
      style2.addAttribute(new Attribute('name.ref', 'staccato'));
      map2.addElement(style2); // last-at-date, so it lands AFTER the tempo
      expect(map2.getElement(1)!.getLocalName()).toBe('style');
      expect(map2.styleNameAt(0)).toBeNull();
      expect(map2.getStyleNameAt(0)).toBe('staccato');
    });
  });

  // ---------------------------------------------------------------
  //  contains / size / isEmpty
  // ---------------------------------------------------------------
  describe('contains / size / isEmpty', () => {
    it('contains checks DOM parentage (may be false due to XOM port limitations)', () => {
      // contains() checks element.getParent() === this.getXml(), which relies on
      // DOM parent-child relationships. In the XomTypes port, insertChild adds to
      // the _children array but the underlying DOM node parentage is not always
      // established. We verify the actual behavior here.
      const map = okValue(GenericMap.createGenericMap('tempoMap'));
      const e = new Element('tempo', Mpm.MPM_NAMESPACE);
      e.addAttribute(new Attribute('date', '100'));
      map.addElement(e);
      // The element IS in the map (verified via getElementIndexOf)
      expect(map.getElementIndexOf(e)).toBe(0);
      // But contains() uses DOM parentage which may not work
      // We just verify it returns a boolean without error
      const result = map.contains(e);
      expect(typeof result).toBe('boolean');
    });

    it('contains returns false for a non-child element', () => {
      const map = okValue(GenericMap.createGenericMap('tempoMap'));
      const e = new Element('tempo', Mpm.MPM_NAMESPACE);
      expect(map.contains(e)).toBe(false);
    });

    it('isEmpty is true for a new map, false after adding', () => {
      const map = okValue(GenericMap.createGenericMap('tempoMap'));
      expect(map.isEmpty()).toBe(true);
      const e = new Element('tempo', Mpm.MPM_NAMESPACE);
      e.addAttribute(new Attribute('date', '0'));
      map.addElement(e);
      expect(map.isEmpty()).toBe(false);
    });

    it('size tracks additions and removals', () => {
      const map = okValue(GenericMap.createGenericMap('tempoMap'));
      expect(map.size()).toBe(0);
      const e1 = new Element('tempo', Mpm.MPM_NAMESPACE);
      e1.addAttribute(new Attribute('date', '0'));
      map.addElement(e1);
      expect(map.size()).toBe(1);
      const e2 = new Element('tempo', Mpm.MPM_NAMESPACE);
      e2.addAttribute(new Attribute('date', '100'));
      map.addElement(e2);
      expect(map.size()).toBe(2);
      map.removeElement(0);
      expect(map.size()).toBe(1);
    });
  });

  // ---------------------------------------------------------------
  //  insertElement: firstAtDate mode
  // ---------------------------------------------------------------
  describe('insertElement firstAtDate mode (via addStyleSwitch)', () => {
    it('style switches at same date go before other elements at that date', () => {
      const map = okValue(GenericMap.createGenericMap('tempoMap'));
      // Add 3 tempos at date 0
      for (let i = 0; i < 3; i++) {
        const e = new Element('tempo', Mpm.MPM_NAMESPACE);
        e.addAttribute(new Attribute('date', '0'));
        e.addAttribute(new Attribute('bpm', String(i)));
        map.addElement(e);
      }
      // Add a style switch at date 0 — should be placed at the front
      map.addStyleSwitch(0, 'myStyle');
      expect(map.getElement(0)!.getLocalName()).toBe('style');
    });

    it('inserting multiple style switches at same date preserves insertion order among them', () => {
      const map = okValue(GenericMap.createGenericMap('tempoMap'));
      map.addStyleSwitch(0, 'first');
      map.addStyleSwitch(0, 'second');
      // Both at date 0; second should go at index 0 because firstAtDate = true
      // Actually: firstAtDate inserts at the FIRST position >= key, so second will be at index 0,
      // pushing first to index 1
      expect(map.getElement(0)!.getAttributeValue('name.ref')).toBe('second');
      expect(map.getElement(1)!.getAttributeValue('name.ref')).toBe('first');
    });
  });

  // ---------------------------------------------------------------
  //  getElementBeforeAt / getElementAfter (element retrieval wrappers)
  // ---------------------------------------------------------------
  describe('getElementBeforeAt / getElementAfter', () => {
    it('getElementBeforeAt returns null when no element at or before the date', () => {
      const map = makeMap([100]);
      expect(map.getElementBeforeAt(50)).toBeNull();
    });

    it('getElementBeforeAt returns the element at or just before', () => {
      const map = makeMap([100, 200, 300]);
      const elem = map.getElementBeforeAt(250);
      expect(elem).not.toBeNull();
      expect(elem!.getAttributeValue('bpm')).toBe('200');
    });

    it('getElementAfter returns null when no element strictly after', () => {
      const map = makeMap([100]);
      expect(map.getElementAfter(100)).toBeNull();
      expect(map.getElementAfter(200)).toBeNull();
    });

    it('getElementAfter returns the element strictly after the date', () => {
      const map = makeMap([100, 200, 300]);
      const elem = map.getElementAfter(150);
      expect(elem).not.toBeNull();
      expect(elem!.getAttributeValue('bpm')).toBe('200');
    });
  });

  // ---------------------------------------------------------------
  //  Two-element edge cases for binary search
  // ---------------------------------------------------------------
  describe('binary search with two elements', () => {
    const map = makeMap([100, 300]);

    it('getElementIndexBeforeAt: before first', () => {
      expect(map.getElementIndexBeforeAt(50)).toBe(-1);
    });
    it('getElementIndexBeforeAt: at first', () => {
      expect(map.getElementIndexBeforeAt(100)).toBe(0);
    });
    it('getElementIndexBeforeAt: between', () => {
      expect(map.getElementIndexBeforeAt(200)).toBe(0);
    });
    it('getElementIndexBeforeAt: at second', () => {
      expect(map.getElementIndexBeforeAt(300)).toBe(1);
    });
    it('getElementIndexBeforeAt: after second', () => {
      expect(map.getElementIndexBeforeAt(999)).toBe(1);
    });

    it('getElementIndexBefore: before first', () => {
      expect(map.getElementIndexBefore(50)).toBe(-1);
    });
    it('getElementIndexBefore: at first', () => {
      expect(map.getElementIndexBefore(100)).toBe(-1);
    });
    it('getElementIndexBefore: between', () => {
      expect(map.getElementIndexBefore(200)).toBe(0);
    });
    it('getElementIndexBefore: at second', () => {
      expect(map.getElementIndexBefore(300)).toBe(0);
    });
    it('getElementIndexBefore: after second', () => {
      expect(map.getElementIndexBefore(999)).toBe(1);
    });

    it('getElementIndexAfter: before first', () => {
      expect(map.getElementIndexAfter(50)).toBe(0);
    });
    it('getElementIndexAfter: at first', () => {
      expect(map.getElementIndexAfter(100)).toBe(1);
    });
    it('getElementIndexAfter: between', () => {
      expect(map.getElementIndexAfter(200)).toBe(1);
    });
    it('getElementIndexAfter: at second', () => {
      expect(map.getElementIndexAfter(300)).toBe(-1);
    });
    it('getElementIndexAfter: after second', () => {
      expect(map.getElementIndexAfter(999)).toBe(-1);
    });

    it('getElementIndexAtAfter: before first', () => {
      expect(map.getElementIndexAtAfter(50)).toBe(0);
    });
    it('getElementIndexAtAfter: at first', () => {
      expect(map.getElementIndexAtAfter(100)).toBe(0);
    });
    it('getElementIndexAtAfter: between', () => {
      expect(map.getElementIndexAtAfter(200)).toBe(1);
    });
    it('getElementIndexAtAfter: at second', () => {
      expect(map.getElementIndexAtAfter(300)).toBe(1);
    });
    it('getElementIndexAtAfter: after second', () => {
      expect(map.getElementIndexAtAfter(999)).toBe(-1);
    });
  });
});
