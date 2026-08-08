import { describe, it, expect } from 'vitest';
import { addToMap } from '../../src/msm/dateMap.js';
import { Element, Attribute } from '../../src/xml/XomTypes.js';

/** build an element with the given local name and attributes */
function el(name: string, attrs: Record<string, string> = {}): Element {
  const e = new Element(name);
  for (const [k, v] of Object.entries(attrs)) e.addAttribute(new Attribute(k, v));
  return e;
}

/** build a parent element with the given children */
function tree(name: string, children: Element[]): Element {
  const parent = new Element(name);
  for (const child of children) parent.appendChild(child);
  return parent;
}

// Moved verbatim from tests/mei/Helper.test.ts by T14: date-sorted MSM map insertion.

// ---------------------------------------------------------------------------
// addToMap
// ---------------------------------------------------------------------------
describe('addToMap', () => {
  const dates = (map: Element) => {
    const out: string[] = [];
    for (let i = 0; i < map.getChildCount(); ++i) {
      out.push((map.getChild(i) as Element).getAttributeValue('date') ?? '');
    }
    return out;
  };

  it('should return -1 when the map or the element is missing', () => {
    expect(addToMap(null, new Element('map'))).toBe(-1);
    expect(addToMap(new Element('note'), null)).toBe(-1);
  });

  it('should append an element without a date and return its index', () => {
    const map = tree('map', [el('note', { date: '0.0' })]);
    const index = addToMap(el('note'), map);
    expect(index).toBe(1);
    expect(map.getChildCount()).toBe(2);
  });

  it('should append to a map that holds no dated elements at all', () => {
    const map = tree('map', [el('note')]);
    const index = addToMap(el('note', { date: '5.0' }), map);
    expect(index).toBe(1);
  });

  it('should insert directly behind the last element with an earlier or equal date', () => {
    const map = tree('map', [
      el('note', { date: '0.0' }),
      el('note', { date: '720.0' }),
      el('note', { date: '1440.0' }),
    ]);

    expect(addToMap(el('note', { date: '720.0' }), map)).toBe(2);
    expect(dates(map)).toEqual(['0.0', '720.0', '720.0', '1440.0']);
  });

  it('should insert at the front when every element is later', () => {
    const map = tree('map', [el('note', { date: '720.0' }), el('note', { date: '1440.0' })]);

    expect(addToMap(el('note', { date: '0.0' }), map)).toBe(0);
    expect(dates(map)).toEqual(['0.0', '720.0', '1440.0']);
  });

  it('should append at the end when the new date is the latest', () => {
    const map = tree('map', [el('note', { date: '0.0' })]);

    expect(addToMap(el('note', { date: '1440.0' }), map)).toBe(1);
    expect(dates(map)).toEqual(['0.0', '1440.0']);
  });
});

// ---------------------------------------------------------------------------
// id copying
// ---------------------------------------------------------------------------
