import { describe, it, expect } from 'vitest';
import { AbstractMsm } from '../../src/msm/AbstractMsm.js';
import { Msm } from '../../src/msm/Msm.js';
import { Element, Attribute } from '../../src/xml/XomTypes.js';

/**
 * Build a map element from a list of [localName, date] pairs. Dates are
 * attached as attributes; entries with a null date get no date attribute at
 * all, which the lookup helpers must skip (AbstractMsm.java:150, 182).
 */
function buildMap(name: string, entries: [string, number | null][]): Element {
  const map = new Element(name);
  for (const [localName, date] of entries) {
    const e = new Element(localName);
    if (date !== null) e.addAttribute(new Attribute('date', String(date)));
    map.appendChild(e);
  }
  return map;
}

describe('AbstractMsm', () => {
  // AbstractMsm.java:108-132
  describe('makePart', () => {
    it('should build a bare part with header and dated but no MSM maps', () => {
      const part = AbstractMsm.makePart('Piano', 1, 0, 0);

      expect(part.getLocalName()).toBe('part');
      expect(part.getFirstChildElement('header')).not.toBeNull();
      expect(part.getFirstChildElement('dated')).not.toBeNull();
      // unlike Msm.makePart, the abstract base adds no maps to dated
      expect(part.getFirstChildElement('dated')!.getChildCount()).toBe(0);
    });

    it('should stringify number, midi.channel and midi.port', () => {
      const part = AbstractMsm.makePart('Violin', 7, 3, 2);

      expect(part.getAttributeValue('name')).toBe('Violin');
      expect(part.getAttributeValue('number')).toBe('7');
      expect(part.getAttributeValue('midi.channel')).toBe('3');
      expect(part.getAttributeValue('midi.port')).toBe('2');
    });

    it('should not attach the part to any document', () => {
      expect(AbstractMsm.makePart('Piano', 1, 0, 0).getParent()).toBeNull();
    });
  });

  // AbstractMsm.java:141-164
  describe('getElementAtAfter', () => {
    it('should return the first element at the exact date', () => {
      const map = buildMap('score', [
        ['note', 0],
        ['note', 720],
        ['note', 1440],
      ]);
      const e = AbstractMsm.getElementAtAfter(720, map);

      expect(e).not.toBeNull();
      expect(e!.getAttributeValue('date')).toBe('720');
    });

    it('should return the first element after the date when nothing sits on it', () => {
      const map = buildMap('score', [
        ['note', 0],
        ['note', 720],
        ['note', 1440],
      ]);
      const e = AbstractMsm.getElementAtAfter(500, map);

      expect(e!.getAttributeValue('date')).toBe('720');
    });

    it('should return the first element for date 0', () => {
      const map = buildMap('score', [
        ['note', 0],
        ['note', 720],
      ]);
      expect(AbstractMsm.getElementAtAfter(0, map)!.getAttributeValue('date')).toBe('0');
    });

    it('should return null when no element is at or after the date', () => {
      const map = buildMap('score', [
        ['note', 0],
        ['note', 720],
      ]);
      expect(AbstractMsm.getElementAtAfter(2000, map)).toBeNull();
    });

    it('should return null for an empty map', () => {
      expect(AbstractMsm.getElementAtAfter(0, new Element('score'))).toBeNull();
    });

    it('should skip elements without a date attribute', () => {
      const map = buildMap('score', [
        ['note', null],
        ['note', 720],
      ]);
      expect(AbstractMsm.getElementAtAfter(0, map)!.getAttributeValue('date')).toBe('720');
    });

    it('should search across all element names when no name is given', () => {
      const map = buildMap('score', [
        ['rest', 0],
        ['note', 720],
      ]);
      expect(AbstractMsm.getElementAtAfter(0, map)!.getLocalName()).toBe('rest');
    });
  });

  describe('getElementAtAfterByName', () => {
    it('should only consider elements of the given name', () => {
      const map = buildMap('score', [
        ['rest', 0],
        ['note', 720],
        ['rest', 1440],
      ]);
      const e = AbstractMsm.getElementAtAfterByName('note', 0, map);

      expect(e!.getLocalName()).toBe('note');
      expect(e!.getAttributeValue('date')).toBe('720');
    });

    it('should return null when no element of that name qualifies', () => {
      const map = buildMap('score', [
        ['rest', 0],
        ['rest', 720],
      ]);
      expect(AbstractMsm.getElementAtAfterByName('note', 0, map)).toBeNull();
    });

    it('should treat an empty name as "any element"', () => {
      const map = buildMap('score', [
        ['rest', 0],
        ['note', 720],
      ]);
      expect(AbstractMsm.getElementAtAfterByName('', 0, map)!.getLocalName()).toBe('rest');
    });
  });

  // AbstractMsm.java:173-197
  describe('getElementBeforeAt', () => {
    it('should return the last element at the exact date', () => {
      const map = buildMap('score', [
        ['note', 0],
        ['note', 720],
        ['note', 1440],
      ]);
      expect(AbstractMsm.getElementBeforeAt(720, map)!.getAttributeValue('date')).toBe('720');
    });

    it('should return the last element before the date when nothing sits on it', () => {
      const map = buildMap('score', [
        ['note', 0],
        ['note', 720],
        ['note', 1440],
      ]);
      expect(AbstractMsm.getElementBeforeAt(1000, map)!.getAttributeValue('date')).toBe('720');
    });

    it('should pick the later of two elements sharing a date (searches backwards)', () => {
      const map = new Element('score');
      const first = new Element('note');
      first.addAttribute(new Attribute('date', '720'));
      first.addAttribute(new Attribute('midi.pitch', '60'));
      const second = new Element('note');
      second.addAttribute(new Attribute('date', '720'));
      second.addAttribute(new Attribute('midi.pitch', '64'));
      map.appendChild(first);
      map.appendChild(second);

      expect(AbstractMsm.getElementBeforeAt(720, map)!.getAttributeValue('midi.pitch')).toBe('64');
    });

    it('should return null when every element is after the date', () => {
      const map = buildMap('score', [
        ['note', 720],
        ['note', 1440],
      ]);
      expect(AbstractMsm.getElementBeforeAt(0, map)).toBeNull();
    });

    it('should return null for an empty map', () => {
      expect(AbstractMsm.getElementBeforeAt(1000, new Element('score'))).toBeNull();
    });

    it('should skip elements without a date attribute', () => {
      const map = buildMap('score', [
        ['note', 0],
        ['note', null],
      ]);
      expect(AbstractMsm.getElementBeforeAt(1000, map)!.getAttributeValue('date')).toBe('0');
    });
  });

  describe('getElementBeforeAtByName', () => {
    it('should only consider elements of the given name', () => {
      const map = buildMap('score', [
        ['note', 0],
        ['rest', 720],
        ['rest', 1440],
      ]);
      const e = AbstractMsm.getElementBeforeAtByName('note', 2000, map);

      expect(e!.getLocalName()).toBe('note');
      expect(e!.getAttributeValue('date')).toBe('0');
    });

    it('should return null when no element of that name qualifies', () => {
      const map = buildMap('score', [['rest', 0]]);
      expect(AbstractMsm.getElementBeforeAtByName('note', 2000, map)).toBeNull();
    });

    it('should treat an empty name as "any element"', () => {
      const map = buildMap('score', [
        ['note', 0],
        ['rest', 720],
      ]);
      expect(AbstractMsm.getElementBeforeAtByName('', 2000, map)!.getLocalName()).toBe('rest');
    });
  });

  // AbstractMsm.java:203-212
  describe('deleteEmptyMaps', () => {
    it('should do nothing on an empty document', () => {
      const msm = new Msm();
      expect(msm.isEmpty()).toBe(true);
      expect(() => msm.deleteEmptyMaps()).not.toThrow();
    });

    it('should remove maps that have no children', () => {
      const msm = new Msm(
        '<msm title="T" pulsesPerQuarter="720"><global><header/><dated>' +
          '<markerMap/><keySignatureMap/></dated></global></msm>',
      );
      msm.deleteEmptyMaps();

      const dated = msm.getGlobal()!.getFirstChildElement('dated')!;
      expect(dated.getFirstChildElement('markerMap')).toBeNull();
      expect(dated.getFirstChildElement('keySignatureMap')).toBeNull();
      expect(dated.getChildCount()).toBe(0);
    });

    it('should keep maps that have children', () => {
      const msm = new Msm(
        '<msm title="T" pulsesPerQuarter="720"><global><header/><dated>' +
          '<timeSignatureMap><timeSignature date="0" numerator="4" denominator="4"/></timeSignatureMap>' +
          '<markerMap/></dated></global></msm>',
      );
      msm.deleteEmptyMaps();

      const dated = msm.getGlobal()!.getFirstChildElement('dated')!;
      expect(dated.getFirstChildElement('timeSignatureMap')).not.toBeNull();
      expect(dated.getFirstChildElement('markerMap')).toBeNull();
    });

    it('should not touch non-map elements such as score', () => {
      const msm = new Msm(
        '<msm title="T" pulsesPerQuarter="720"><global><header/><dated/></global>' +
          '<part name="P" number="1" midi.channel="0" midi.port="0"><header/><dated>' +
          '<score/><markerMap/></dated></part></msm>',
      );
      msm.deleteEmptyMaps();

      const dated = msm.getParts().get(0).getFirstChildElement('dated')!;
      expect(dated.getFirstChildElement('score')).not.toBeNull();
      expect(dated.getFirstChildElement('markerMap')).toBeNull();
    });

    it('should remove empty maps in parts as well as in global', () => {
      const msm = new Msm(
        '<msm title="T" pulsesPerQuarter="720"><global><header/><dated><markerMap/></dated></global>' +
          '<part name="P" number="1" midi.channel="0" midi.port="0"><header/><dated>' +
          '<keySignatureMap/><sequencingMap/></dated></part></msm>',
      );
      msm.deleteEmptyMaps();

      expect(msm.getGlobal()!.getFirstChildElement('dated')!.getChildCount()).toBe(0);
      expect(msm.getParts().get(0).getFirstChildElement('dated')!.getChildCount()).toBe(0);
    });

    it('should only delete the nested map, not the parent that held it (Java takes one XPath snapshot)', () => {
      // Java queries all "*Map*" elements up front and checks getChildCount() on
      // that snapshot. miscMap still has a child at that moment, so it survives
      // even though its only child (tupletSpanMap) is removed in the same pass.
      const msm = new Msm(
        '<msm title="T" pulsesPerQuarter="720"><global><header/><dated/></global>' +
          '<part name="P" number="1" midi.channel="0" midi.port="0"><header/><dated>' +
          '<miscMap><tupletSpanMap/></miscMap></dated></part></msm>',
      );
      msm.deleteEmptyMaps();

      const dated = msm.getParts().get(0).getFirstChildElement('dated')!;
      const miscMap = dated.getFirstChildElement('miscMap');
      expect(miscMap).not.toBeNull();
      expect(miscMap!.getFirstChildElement('tupletSpanMap')).toBeNull();
      expect(miscMap!.getChildCount()).toBe(0);
    });

    it('should treat a map holding only whitespace text as non-empty', () => {
      // getChildCount() counts text nodes, so a pretty-printed map is not empty.
      const msm = new Msm(
        '<msm title="T" pulsesPerQuarter="720"><global><header/><dated><markerMap>\n  </markerMap></dated></global></msm>',
      );
      msm.deleteEmptyMaps();

      expect(
        msm.getGlobal()!.getFirstChildElement('dated')!.getFirstChildElement('markerMap'),
      ).not.toBeNull();
    });
  });
});
