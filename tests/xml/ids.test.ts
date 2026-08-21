import { describe, it, expect } from 'vitest';
import { addToListAttribute, addUUID, copyId, copyIdNoNs } from '../../src/xml/ids.js';
import { getAttributeValue } from '../../src/xml/tree.js';
import { Element, Attribute } from '../../src/xml/XomTypes.js';

describe('addUUID', () => {
  it('should add an xml:id attribute', () => {
    const el = new Element('note');
    const uuid = addUUID(el);
    expect(uuid).toMatch(/^meico_/);
    const attr = el.getAttribute('id', 'http://www.w3.org/XML/1998/namespace');
    expect(attr).not.toBeNull();
    expect(attr!.getValue()).toBe(uuid);
  });
});

describe('addToListAttribute', () => {
  it('should add a value to a new attribute', () => {
    const el = new Element('note');
    addToListAttribute(el, 'classes', 'foo');
    expect(getAttributeValue('classes', el)).toBe('foo');
  });

  it('should add to an existing attribute (space-separated)', () => {
    const el = new Element('note');
    el.addAttribute(new Attribute('classes', 'foo'));
    addToListAttribute(el, 'classes', 'bar');
    expect(getAttributeValue('classes', el)).toBe('foo bar');
  });

  it('should not add duplicate values', () => {
    const el = new Element('note');
    el.addAttribute(new Attribute('classes', 'foo bar'));
    addToListAttribute(el, 'classes', 'foo');
    expect(getAttributeValue('classes', el)).toBe('foo bar');
  });

  // `addToListAttribute` declares all three parameters nullable, so every call below is one
  // a typed caller can make, with no cast.
  it('should do nothing with null/empty arguments', () => {
    addToListAttribute(null, 'x', 'y'); // Should not throw
    const el = new Element('note');
    addToListAttribute(el, null, 'y'); // Should not throw
    addToListAttribute(el, 'x', null); // Should not throw
    addToListAttribute(el, '', 'y'); // the empty name, which the same guard screens
    addToListAttribute(el, 'x', ''); // and the empty value
    expect(el.getAttributeCount()).toBe(0);
  });
});

describe('copyId / copyIdNoNs', () => {
  it('copyId should carry the xml:id over, namespace included', () => {
    const source = new Element('note');
    source.addAttribute(new Attribute('xml:id', 'http://www.w3.org/XML/1998/namespace', 'n1'));
    const target = new Element('note');

    const copied = copyId(source, target);
    expect(copied).not.toBeNull();
    expect(getAttributeValue('id', target)).toBe('n1');
    expect(target.getAttribute('id', 'http://www.w3.org/XML/1998/namespace')).not.toBeNull();
  });

  it('copyIdNoNs should carry the value over without a namespace', () => {
    const source = new Element('note');
    source.addAttribute(new Attribute('xml:id', 'http://www.w3.org/XML/1998/namespace', 'n1'));
    const target = new Element('note');

    const copied = copyIdNoNs(source, target);
    expect(copied!.getValue()).toBe('n1');
    expect(target.getAttribute('id')).not.toBeNull();
  });

  it('should return null when the source has no id', () => {
    expect(copyId(new Element('note'), new Element('note'))).toBeNull();
    expect(copyIdNoNs(new Element('note'), new Element('note'))).toBeNull();
  });
});
