import { describe, it, expect } from 'vitest';
import { updateMpmNoteidsAfterResolvingRepetitions } from '../../src/mei/mpmNoteIds.js';
import { allChildElements } from '../../src/xml/tree.js';
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

// Moved verbatim from tests/mei/Helper.test.ts by T14: MPM noteid repair.

// ---------------------------------------------------------------------------
// updateMpmNoteidsAfterResolvingRepetitions
// ---------------------------------------------------------------------------
describe('updateMpmNoteidsAfterResolvingRepetitions', () => {
  it('should renumber the repeats of a noteid, leaving the first one alone', () => {
    const map = tree('articulationMap', [
      el('articulation', { noteid: '#n1' }),
      el('articulation', { noteid: '#n1' }),
      el('articulation', { noteid: '#n1' }),
    ]);
    const mappings = new Map<string, string>([
      ['n1', 'n1_rep1'],
      ['n1_rep1', 'n1_rep2'],
    ]);

    updateMpmNoteidsAfterResolvingRepetitions({ getXml: () => map }, mappings);

    const ids = allChildElements(map)!.map((e) => e.getAttributeValue('noteid'));
    expect(ids).toEqual(['#n1', '#n1_rep1', '#n1_rep2']);
  });

  it('should leave a noteid that occurs only once untouched', () => {
    const map = tree('articulationMap', [el('articulation', { noteid: '#n1' })]);
    const mappings = new Map<string, string>([['n1', 'n1_rep1']]);

    updateMpmNoteidsAfterResolvingRepetitions({ getXml: () => map }, mappings);

    expect(allChildElements(map)![0].getAttributeValue('noteid')).toBe('#n1');
  });

  it('should do nothing when there are no mappings', () => {
    const map = tree('articulationMap', [el('articulation', { noteid: '#n1' })]);
    updateMpmNoteidsAfterResolvingRepetitions({ getXml: () => map }, new Map());
    expect(allChildElements(map)![0].getAttributeValue('noteid')).toBe('#n1');
  });
});

// ---------------------------------------------------------------------------
// decimalDuration2HtmlUnicode
// ---------------------------------------------------------------------------
