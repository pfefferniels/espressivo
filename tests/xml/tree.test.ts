import { describe, it, expect } from 'vitest';
import {
  allChildElements,
  attribute,
  cloneElement,
  firstChildElement,
  getAllDescendantsByName,
  getAllDescendantsWithAttribute,
  getAllPreviousSiblingElements,
  getAttributeValue,
  getClosest,
  getClosestByAttr,
  getNextSiblingElement,
  getPreviousSiblingElement,
  parentElement,
  requireAttribute,
  requireFirstChildElement,
  requireParentElement,
} from '../../src/xml/tree.js';
import { MeicoError, MissingNodeError } from '../../src/xml/errors.js';
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

// Moved verbatim from tests/mei/Helper.test.ts by T14: XML navigation primitives.

// ---------------------------------------------------------------------------
// getAttribute – various namespace scenarios
// ---------------------------------------------------------------------------
describe('attribute', () => {
  it('should return null for null element', () => {
    expect(attribute('dur', null)).toBeNull();
  });

  it('should find a plain attribute by name', () => {
    const el = new Element('note');
    el.addAttribute(new Attribute('dur', '4'));
    const attr = attribute('dur', el);
    expect(attr).not.toBeNull();
    expect(attr!.getValue()).toBe('4');
  });

  it('should find an xml-namespaced attribute (e.g., xml:id)', () => {
    const el = new Element('note');
    el.addAttribute(new Attribute('xml:id', 'http://www.w3.org/XML/1998/namespace', 'n1'));
    const attr = attribute('id', el);
    expect(attr).not.toBeNull();
    expect(attr!.getValue()).toBe('n1');
  });

  it('should find attribute with element namespace', () => {
    const el = new Element('note', 'http://www.music-encoding.org/ns/mei');
    el.addAttribute(new Attribute('dur', '4'));
    // getAttribute tries no-ns first, which should succeed
    const attr = attribute('dur', el);
    expect(attr).not.toBeNull();
    expect(attr!.getValue()).toBe('4');
  });

  // The three-lookup order (no namespace, then the element's own, then the XML namespace) is
  // documented as load-bearing but was not pinned by any test or fixture: T14's negative
  // control reversed it and neither the pipeline byte-probe nor the suite noticed. This test
  // closes that gap. See the [T14] log entry, NC-B.
  it('should prefer the unnamespaced attribute when the element carries both', () => {
    const note = new Element('note');
    note.addAttribute(new Attribute('id', 'bare'));
    note.addAttribute(
      new Attribute('xml:id', 'http://www.w3.org/XML/1998/namespace', 'namespaced'),
    );
    expect(attribute('id', note)!.getValue()).toBe('bare');
  });

  it('should return null when attribute does not exist', () => {
    const el = new Element('note');
    expect(attribute('nonexistent', el)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// getAttributeValue
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// getAttributeValue
// ---------------------------------------------------------------------------
describe('getAttributeValue', () => {
  it('should return the value for existing attributes', () => {
    const el = new Element('note');
    el.addAttribute(new Attribute('dur', '8'));
    expect(getAttributeValue('dur', el)).toBe('8');
  });

  it('should return empty string for missing attributes', () => {
    const el = new Element('note');
    expect(getAttributeValue('nonexistent', el)).toBe('');
  });

  it('should return empty string for null element', () => {
    expect(getAttributeValue('dur', null)).toBe('');
  });
});

// ---------------------------------------------------------------------------
// getFirstChildElement – various overloads
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// getFirstChildElement – various overloads
// ---------------------------------------------------------------------------
describe('firstChildElement', () => {
  it('should return the first child element (no filter)', () => {
    const parent = new Element('staff');
    const child1 = new Element('layer');
    const child2 = new Element('note');
    parent.appendChild(child1);
    parent.appendChild(child2);
    const result = firstChildElement(parent);
    expect(result).not.toBeNull();
    expect(result!.getLocalName()).toBe('layer');
  });

  it('should return null when no children exist (no filter)', () => {
    const parent = new Element('staff');
    expect(firstChildElement(parent)).toBeNull();
  });

  it('answers null for a null element — the guard no typed caller can reach', () => {
    // The cast this used to carry (`null as unknown as Element`) tested what happens when the
    // type system is defeated. The directive tests something stronger and self-maintaining:
    // that the parameter is **not** nullable. Widen it to `Element | null` and this becomes an
    // unused-directive error, so the claim cannot rot into a lie the way a cast can. What the
    // guard is for is the untyped JavaScript caller, which a published library still has.
    // @ts-expect-error the parameter is non-nullable; this is the untyped-caller path
    expect(firstChildElement(null)).toBeNull();
    // …and the reachable spelling of "nothing to return", which is what callers actually hit
    expect(firstChildElement(new Element('staff'))).toBeNull();
  });

  it('should find first child by name using (Element, string) overload', () => {
    const parent = new Element('layer');
    parent.appendChild(new Element('rest'));
    parent.appendChild(new Element('note'));
    parent.appendChild(new Element('note'));
    const result = firstChildElement(parent, 'note');
    expect(result).not.toBeNull();
    expect(result!.getLocalName()).toBe('note');
  });

  it('should return null when no child matches (Element, string)', () => {
    const parent = new Element('layer');
    parent.appendChild(new Element('rest'));
    expect(firstChildElement(parent, 'note')).toBeNull();
  });

  it('should find first child by name using (string, Element) overload', () => {
    const parent = new Element('layer');
    parent.appendChild(new Element('rest'));
    parent.appendChild(new Element('note'));
    const result = firstChildElement('note', parent);
    expect(result).not.toBeNull();
    expect(result!.getLocalName()).toBe('note');
  });

  it('answers null for (string, null) — same guard, name-first form', () => {
    // @ts-expect-error the parameter is non-nullable; this is the untyped-caller path
    expect(firstChildElement('note', null)).toBeNull();
    expect(firstChildElement('note', new Element('layer'))).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// getFilenameWithoutExtension
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// cloneElement
// ---------------------------------------------------------------------------
describe('cloneElement', () => {
  it('should return null for null input', () => {
    expect(cloneElement(null)).toBeNull();
  });

  it('should clone element with attributes but no children', () => {
    const el = new Element('note');
    el.addAttribute(new Attribute('dur', '4'));
    el.addAttribute(new Attribute('oct', '5'));
    const child = new Element('artic');
    el.appendChild(child);

    const clone = cloneElement(el);
    expect(clone).not.toBeNull();
    expect(clone!.getLocalName()).toBe('note');
    expect(clone!.getAttributeValue('dur')).toBe('4');
    expect(clone!.getAttributeValue('oct')).toBe('5');
    expect(clone!.getChildCount()).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// addUUID
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// getAllChildElements
// ---------------------------------------------------------------------------
describe('allChildElements', () => {
  it('should return all children when no name is given', () => {
    const layer = tree('layer', [el('note'), el('rest'), el('note')]);
    const children = allChildElements(layer)!;
    expect(children.map((c) => c.getLocalName())).toEqual(['note', 'rest', 'note']);
  });

  it('should return an empty list for a childless element', () => {
    expect(allChildElements(new Element('layer'))).toEqual([]);
  });

  it('should filter by name when one is given', () => {
    const layer = tree('layer', [el('note'), el('rest'), el('note')]);
    const notes = allChildElements(layer, 'note');
    expect(notes.length).toBe(2);
    expect(notes.every((n) => n.getLocalName() === 'note')).toBe(true);
  });

  it('should not descend into grandchildren', () => {
    const chord = tree('chord', [el('note'), el('note')]);
    const layer = tree('layer', [chord, el('note')]);
    expect(allChildElements(layer, 'note').length).toBe(1);
  });

  // T14 applied ARCHITECTURE.md RULE N2b here: `allChildElements` used to return null from
  // two guards (`ofThis == null`, `name === ''`) and now returns `Element[]` unconditionally.
  // This test is the rule's required negative control — it pins the failure mode the deleted
  // guards used to hide. All 16 call sites in `src/` pass a live element and either a string
  // literal name or none, so neither case is reachable from the pipeline.
  it('throws on a null element now that the null guards are gone (RULE N2b)', () => {
    // @ts-expect-error the parameter is non-nullable — which is exactly what is being pinned
    expect(() => allChildElements(null)).toThrow();
    // @ts-expect-error the parameter is non-nullable — which is exactly what is being pinned
    expect(() => allChildElements(null, 'note')).toThrow();
  });

  it('searches for a literally empty name rather than returning null (RULE N2b)', () => {
    expect(allChildElements(new Element('layer'), '')).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// getAllDescendantsByName / getAllDescendantsWithAttribute
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// getAllDescendantsByName / getAllDescendantsWithAttribute
// ---------------------------------------------------------------------------
describe('getAllDescendantsByName', () => {
  it('should collect matching elements at every depth', () => {
    const chord = tree('chord', [el('note', { pname: 'c' }), el('note', { pname: 'e' })]);
    const layer = tree('layer', [el('note', { pname: 'g' }), chord]);
    const staff = tree('staff', [layer]);

    const notes = getAllDescendantsByName('note', staff)!;
    expect(notes.map((n) => n.getAttributeValue('pname'))).toEqual(['g', 'c', 'e']);
  });

  it('should not include the start element itself', () => {
    const note = tree('note', [el('note')]);
    expect(getAllDescendantsByName('note', note)!.length).toBe(1);
  });

  it('should return an empty list when nothing matches', () => {
    const layer = tree('layer', [el('rest')]);
    expect(getAllDescendantsByName('note', layer)).toEqual([]);
  });

  it('should return null for a null element or an empty name', () => {
    expect(getAllDescendantsByName('note', null)).toBeNull();
    expect(getAllDescendantsByName('', new Element('layer'))).toBeNull();
  });
});

describe('getAllDescendantsWithAttribute', () => {
  it('should collect every descendant carrying the attribute', () => {
    const chord = tree('chord', [el('note', { dur: '8' }), el('note')]);
    const layer = tree('layer', [el('rest', { dur: '4' }), chord]);

    const withDur = getAllDescendantsWithAttribute('dur', layer)!;
    expect(withDur.map((e) => e.getLocalName())).toEqual(['rest', 'note']);
  });

  it('should return an empty list when no descendant has the attribute', () => {
    expect(getAllDescendantsWithAttribute('dur', tree('layer', [el('note')]))).toEqual([]);
  });

  it('should return null for a null element or an empty attribute name', () => {
    expect(getAllDescendantsWithAttribute('dur', null)).toBeNull();
    expect(getAllDescendantsWithAttribute('', new Element('layer'))).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// sibling navigation
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// sibling navigation
// ---------------------------------------------------------------------------
describe('getNextSiblingElement', () => {
  it('should return the immediately following sibling', () => {
    const a = el('note', { n: '1' });
    const b = el('rest');
    const c = el('note', { n: '2' });
    tree('layer', [a, b, c]);

    expect(getNextSiblingElement(a)!.getLocalName()).toBe('rest');
    expect(getNextSiblingElement(c)).toBeNull();
  });

  it('should return null for an element without a parent', () => {
    expect(getNextSiblingElement(new Element('note'))).toBeNull();
    // @ts-expect-error the parameter is non-nullable; this is the untyped-caller path
    expect(getNextSiblingElement(null)).toBeNull();
  });

  it('should skip to the next sibling of a given name', () => {
    const a = el('note', { n: '1' });
    const b = el('rest');
    const c = el('note', { n: '2' });
    const d = el('note', { n: '3' });
    tree('layer', [a, b, c, d]);

    expect(getNextSiblingElement('note', a)!.getAttributeValue('n')).toBe('2');
    expect(getNextSiblingElement('note', c)!.getAttributeValue('n')).toBe('3');
    expect(getNextSiblingElement('note', d)).toBeNull();
    expect(getNextSiblingElement('rest', b)).toBeNull();
  });

  it('should return null for the named overload without a parent', () => {
    expect(getNextSiblingElement('note', new Element('note'))).toBeNull();
    // @ts-expect-error the parameter is non-nullable; this is the untyped-caller path
    expect(getNextSiblingElement('note', null)).toBeNull();
  });
});

describe('getPreviousSiblingElement', () => {
  it('should return the immediately preceding sibling', () => {
    const a = el('note', { n: '1' });
    const b = el('rest');
    const c = el('note', { n: '2' });
    tree('layer', [a, b, c]);

    expect(getPreviousSiblingElement(c)!.getLocalName()).toBe('rest');
    expect(getPreviousSiblingElement(a)).toBeNull();
  });

  it('should return null for an element without a parent', () => {
    expect(getPreviousSiblingElement(new Element('note'))).toBeNull();
    // @ts-expect-error the parameter is non-nullable; this is the untyped-caller path
    expect(getPreviousSiblingElement(null)).toBeNull();
  });

  it('should skip back to the previous sibling of a given name', () => {
    const a = el('note', { n: '1' });
    const b = el('rest');
    const c = el('note', { n: '2' });
    const d = el('note', { n: '3' });
    tree('layer', [a, b, c, d]);

    expect(getPreviousSiblingElement('note', d)!.getAttributeValue('n')).toBe('2');
    expect(getPreviousSiblingElement('note', c)!.getAttributeValue('n')).toBe('1');
    expect(getPreviousSiblingElement('note', a)).toBeNull();
    expect(getPreviousSiblingElement('rest', b)).toBeNull();
  });

  it('should return null for the named overload without a parent', () => {
    expect(getPreviousSiblingElement('note', new Element('note'))).toBeNull();
    // @ts-expect-error the parameter is non-nullable; this is the untyped-caller path
    expect(getPreviousSiblingElement('note', null)).toBeNull();
  });
});

describe('getAllPreviousSiblingElements', () => {
  it('should list the preceding named siblings ordered by distance', () => {
    const a = el('note', { n: '1' });
    const b = el('note', { n: '2' });
    const c = el('rest');
    const d = el('note', { n: '3' });
    tree('layer', [a, b, c, d]);

    const previous = getAllPreviousSiblingElements('note', d);
    expect(previous.map((e) => e.getAttributeValue('n'))).toEqual(['2', '1']);
  });

  it('should return an empty list for the first sibling', () => {
    const a = el('note');
    tree('layer', [a, el('note')]);
    expect(getAllPreviousSiblingElements('note', a)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// addToMap
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// parent / ancestor access
// ---------------------------------------------------------------------------
describe('parentElement', () => {
  it('should return the parent element', () => {
    const note = el('note');
    const layer = tree('layer', [note]);
    expect(parentElement(note)).toBe(layer);
  });

  it('should return null for a detached element', () => {
    expect(parentElement(new Element('note'))).toBeNull();
  });
});

describe('getClosest', () => {
  it('should walk up to the nearest ancestor with the given name', () => {
    const note = el('note');
    const layer = tree('layer', [note]);
    const staff = tree('staff', [layer]);
    tree('measure', [staff]);

    expect(getClosest('staff', note)).toBe(staff);
    expect(getClosest('measure', note)!.getLocalName()).toBe('measure');
  });

  it('should not match the element itself', () => {
    const note = el('note');
    tree('layer', [note]);
    expect(getClosest('note', note)).toBeNull();
  });

  it('should return null when no ancestor matches', () => {
    const note = el('note');
    tree('layer', [note]);
    expect(getClosest('measure', note)).toBeNull();
  });
});

describe('getClosestByAttr', () => {
  it('should walk up to the nearest ancestor carrying the attribute', () => {
    const note = el('note');
    const layer = tree('layer', [note]);
    const staff = tree('staff', [layer]);
    staff.addAttribute(new Attribute('n', '1'));

    expect(getClosestByAttr('n', note)).toBe(staff);
  });

  it('should skip ancestors whose attribute value is empty', () => {
    const note = el('note');
    const layer = tree('layer', [note]);
    layer.addAttribute(new Attribute('n', ''));
    const staff = tree('staff', [layer]);
    staff.addAttribute(new Attribute('n', '1'));

    expect(getClosestByAttr('n', note)).toBe(staff);
  });

  it('should return null when no ancestor carries it', () => {
    const note = el('note');
    tree('layer', [note]);
    expect(getClosestByAttr('n', note)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// the require* siblings (ARCHITECTURE.md RULE N2a)
// ---------------------------------------------------------------------------
describe('require* accessors', () => {
  it('requireFirstChildElement returns what firstChildElement returns, in all three overloads', () => {
    const note = el('note');
    const layer = tree('layer', [note]);
    expect(requireFirstChildElement(layer)).toBe(note);
    expect(requireFirstChildElement(layer, 'note')).toBe(note);
    expect(requireFirstChildElement('note', layer)).toBe(note);
  });

  it('requireFirstChildElement throws MissingNodeError where firstChildElement returns null', () => {
    const layer = tree('layer', [el('rest')]);
    expect(firstChildElement(layer, 'note')).toBeNull();
    expect(() => requireFirstChildElement(layer, 'note')).toThrow(MissingNodeError);
    expect(() => requireFirstChildElement('note', layer)).toThrow(MissingNodeError);
    expect(() => requireFirstChildElement(new Element('layer'))).toThrow(MissingNodeError);
  });

  it('requireAttribute returns the attribute and throws when it is absent', () => {
    const note = el('note', { pname: 'c' });
    expect(requireAttribute('pname', note).getValue()).toBe('c');
    expect(attribute('dur', note)).toBeNull();
    expect(() => requireAttribute('dur', note)).toThrow(MissingNodeError);
    expect(() => requireAttribute('pname', null)).toThrow(MissingNodeError);
  });

  it('requireParentElement returns the parent and throws for a detached element', () => {
    const note = el('note');
    const layer = tree('layer', [note]);
    expect(requireParentElement(note)).toBe(layer);
    expect(parentElement(layer)).toBeNull();
    expect(() => requireParentElement(layer)).toThrow(MissingNodeError);
  });

  it('names the missing node in the message and sits under MeicoError', () => {
    const note = el('note');
    expect(() => requireAttribute('dur', note)).toThrow(/dur/);
    expect(() => requireFirstChildElement(note, 'chord')).toThrow(/chord/);
    expect(() => requireAttribute('dur', note)).toThrow(MeicoError);
  });
});
