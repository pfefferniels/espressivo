import { describe, it, expect, vi } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Helper } from '../../src/mei/Helper.js';
import { Element, Attribute, Builder, Document } from '../../src/xml/XomTypes.js';

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

// ---------------------------------------------------------------------------
// duration2decimal
// ---------------------------------------------------------------------------
describe('Helper.duration2decimal', () => {
    it('should convert "maxima" to 8.0', () => {
        expect(Helper.duration2decimal('maxima')).toBe(8.0);
    });

    it('should convert "long" to 4.0', () => {
        expect(Helper.duration2decimal('long')).toBe(4.0);
    });

    it('should convert "breve" to 2.0', () => {
        expect(Helper.duration2decimal('breve')).toBe(2.0);
    });

    it('should convert "1" (whole) to 1.0', () => {
        expect(Helper.duration2decimal('1')).toBe(1.0);
    });

    it('should convert "2" (half) to 0.5', () => {
        expect(Helper.duration2decimal('2')).toBe(0.5);
    });

    it('should convert "4" (quarter) to 0.25', () => {
        expect(Helper.duration2decimal('4')).toBe(0.25);
    });

    it('should convert "8" (eighth) to 0.125', () => {
        expect(Helper.duration2decimal('8')).toBe(0.125);
    });

    it('should convert "16" to 0.0625', () => {
        expect(Helper.duration2decimal('16')).toBe(0.0625);
    });

    it('should convert "32" to 0.03125', () => {
        expect(Helper.duration2decimal('32')).toBe(0.03125);
    });

    it('should convert "64" to 0.015625', () => {
        expect(Helper.duration2decimal('64')).toBe(0.015625);
    });

    it('should convert "128" to 0.0078125', () => {
        expect(Helper.duration2decimal('128')).toBe(0.0078125);
    });

    it('should convert "256" to 0.00390625', () => {
        expect(Helper.duration2decimal('256')).toBe(0.00390625);
    });

    it('should convert "512" to 0.001953125', () => {
        expect(Helper.duration2decimal('512')).toBe(0.001953125);
    });

    it('should convert "1024" to 0.0009765625', () => {
        expect(Helper.duration2decimal('1024')).toBe(0.0009765625);
    });

    it('should convert "2048" to 0.00048828125', () => {
        expect(Helper.duration2decimal('2048')).toBe(0.00048828125);
    });

    it('should return 0.0 for unknown values', () => {
        expect(Helper.duration2decimal('unknown')).toBe(0.0);
        expect(Helper.duration2decimal('')).toBe(0.0);
    });
});

// ---------------------------------------------------------------------------
// getAttribute – various namespace scenarios
// ---------------------------------------------------------------------------
describe('Helper.getAttribute', () => {
    it('should return null for null element', () => {
        expect(Helper.getAttribute('dur', null)).toBeNull();
    });

    it('should find a plain attribute by name', () => {
        const el = new Element('note');
        el.addAttribute(new Attribute('dur', '4'));
        const attr = Helper.getAttribute('dur', el);
        expect(attr).not.toBeNull();
        expect(attr!.getValue()).toBe('4');
    });

    it('should find an xml-namespaced attribute (e.g., xml:id)', () => {
        const el = new Element('note');
        el.addAttribute(new Attribute('xml:id', 'http://www.w3.org/XML/1998/namespace', 'n1'));
        const attr = Helper.getAttribute('id', el);
        expect(attr).not.toBeNull();
        expect(attr!.getValue()).toBe('n1');
    });

    it('should find attribute with element namespace', () => {
        const el = new Element('note', 'http://www.music-encoding.org/ns/mei');
        el.addAttribute(new Attribute('dur', '4'));
        // getAttribute tries no-ns first, which should succeed
        const attr = Helper.getAttribute('dur', el);
        expect(attr).not.toBeNull();
        expect(attr!.getValue()).toBe('4');
    });

    it('should return null when attribute does not exist', () => {
        const el = new Element('note');
        expect(Helper.getAttribute('nonexistent', el)).toBeNull();
    });
});

// ---------------------------------------------------------------------------
// getAttributeValue
// ---------------------------------------------------------------------------
describe('Helper.getAttributeValue', () => {
    it('should return the value for existing attributes', () => {
        const el = new Element('note');
        el.addAttribute(new Attribute('dur', '8'));
        expect(Helper.getAttributeValue('dur', el)).toBe('8');
    });

    it('should return empty string for missing attributes', () => {
        const el = new Element('note');
        expect(Helper.getAttributeValue('nonexistent', el)).toBe('');
    });

    it('should return empty string for null element', () => {
        expect(Helper.getAttributeValue('dur', null)).toBe('');
    });
});

// ---------------------------------------------------------------------------
// getFirstChildElement – various overloads
// ---------------------------------------------------------------------------
describe('Helper.getFirstChildElement', () => {
    it('should return the first child element (no filter)', () => {
        const parent = new Element('staff');
        const child1 = new Element('layer');
        const child2 = new Element('note');
        parent.appendChild(child1);
        parent.appendChild(child2);
        const result = Helper.getFirstChildElement(parent);
        expect(result).not.toBeNull();
        expect(result!.getLocalName()).toBe('layer');
    });

    it('should return null when no children exist (no filter)', () => {
        const parent = new Element('staff');
        expect(Helper.getFirstChildElement(parent)).toBeNull();
    });

    it('should return null for null input', () => {
        expect(Helper.getFirstChildElement(null as unknown as Element)).toBeNull();
    });

    it('should find first child by name using (Element, string) overload', () => {
        const parent = new Element('layer');
        parent.appendChild(new Element('rest'));
        parent.appendChild(new Element('note'));
        parent.appendChild(new Element('note'));
        const result = Helper.getFirstChildElement(parent, 'note');
        expect(result).not.toBeNull();
        expect(result!.getLocalName()).toBe('note');
    });

    it('should return null when no child matches (Element, string)', () => {
        const parent = new Element('layer');
        parent.appendChild(new Element('rest'));
        expect(Helper.getFirstChildElement(parent, 'note')).toBeNull();
    });

    it('should find first child by name using (string, Element) overload', () => {
        const parent = new Element('layer');
        parent.appendChild(new Element('rest'));
        parent.appendChild(new Element('note'));
        const result = Helper.getFirstChildElement('note', parent);
        expect(result).not.toBeNull();
        expect(result!.getLocalName()).toBe('note');
    });

    it('should return null for (string, null) overload', () => {
        expect(Helper.getFirstChildElement('note', null as unknown as Element)).toBeNull();
    });
});

// ---------------------------------------------------------------------------
// getFilenameWithoutExtension
// ---------------------------------------------------------------------------
describe('Helper.getFilenameWithoutExtension', () => {
    it('should strip the extension from a simple filename', () => {
        expect(Helper.getFilenameWithoutExtension('test.mei')).toBe('test');
    });

    it('should strip extension from a path', () => {
        expect(Helper.getFilenameWithoutExtension('/path/to/file.xml')).toBe('/path/to/file');
    });

    it('should handle multiple dots – strip only the last', () => {
        expect(Helper.getFilenameWithoutExtension('my.file.name.txt')).toBe('my.file.name');
    });

    it('should return the filename as-is if it starts with a dot and has no other dot', () => {
        expect(Helper.getFilenameWithoutExtension('.hidden')).toBe('.hidden');
    });
});

// ---------------------------------------------------------------------------
// duration2word
// ---------------------------------------------------------------------------
describe('Helper.duration2word', () => {
    it('should convert numeric durations to words', () => {
        expect(Helper.duration2word('1')).toBe('whole');
        expect(Helper.duration2word('2')).toBe('half');
        expect(Helper.duration2word('4')).toBe('quarter');
        expect(Helper.duration2word('8')).toBe('eighth');
    });

    it('should keep named durations as-is', () => {
        expect(Helper.duration2word('maxima')).toBe('maxima');
        expect(Helper.duration2word('long')).toBe('long');
        expect(Helper.duration2word('breve')).toBe('breve');
    });

    it('should add suffix for larger numeric durations', () => {
        expect(Helper.duration2word('16')).toBe('16th');
        expect(Helper.duration2word('32')).toBe('32nd');
        expect(Helper.duration2word('64')).toBe('64th');
    });

    it('should return input for unknown durations', () => {
        expect(Helper.duration2word('unknown')).toBe('unknown');
    });
});

// ---------------------------------------------------------------------------
// extractAllIntegersFromString
// ---------------------------------------------------------------------------
describe('Helper.extractAllIntegersFromString', () => {
    it('should extract positive integers', () => {
        expect(Helper.extractAllIntegersFromString('measure 1 and 2')).toEqual([1, 2]);
    });

    it('should extract negative integers', () => {
        // "to" is replaced by "-", so "range -5 to 10" becomes "range -5 -10"
        expect(Helper.extractAllIntegersFromString('range -5 to 10')).toEqual([-5, -10]);
    });

    it('should handle "bis" and "to" as minus', () => {
        expect(Helper.extractAllIntegersFromString('1 bis 5')).toEqual([1, -5]);
        expect(Helper.extractAllIntegersFromString('1 to 5')).toEqual([1, -5]);
    });

    it('should return empty for no integers', () => {
        expect(Helper.extractAllIntegersFromString('no numbers here')).toEqual([]);
    });
});

// ---------------------------------------------------------------------------
// accidString2decimal / accidDecimal2String
// ---------------------------------------------------------------------------
describe('Helper – accidental conversions', () => {
    it('accidString2decimal should convert common accidentals', () => {
        expect(Helper.accidString2decimal('s')).toBe(1);
        expect(Helper.accidString2decimal('f')).toBe(-1);
        expect(Helper.accidString2decimal('ss')).toBe(2);
        expect(Helper.accidString2decimal('ff')).toBe(-2);
        expect(Helper.accidString2decimal('n')).toBe(0);
    });

    it('accidDecimal2String should convert back', () => {
        expect(Helper.accidDecimal2String(1)).toBe('s');
        expect(Helper.accidDecimal2String(-1)).toBe('f');
        expect(Helper.accidDecimal2String(0)).toBe('n');
    });

    it('accidDecimal2String should accept string input', () => {
        expect(Helper.accidDecimal2String('1.0')).toBe('s');
        expect(Helper.accidDecimal2String('-1.0')).toBe('f');
    });

    it('accidDecimal2String should return null for null', () => {
        expect(Helper.accidDecimal2String(null)).toBeNull();
    });
});

// ---------------------------------------------------------------------------
// pname2midi
// ---------------------------------------------------------------------------
describe('Helper.pname2midi', () => {
    it('should convert basic pitch names', () => {
        expect(Helper.pname2midi('c')).toBe(0);
        expect(Helper.pname2midi('d')).toBe(2);
        expect(Helper.pname2midi('e')).toBe(4);
        expect(Helper.pname2midi('f')).toBe(5);
        expect(Helper.pname2midi('g')).toBe(7);
        expect(Helper.pname2midi('a')).toBe(9);
        expect(Helper.pname2midi('b')).toBe(11);
    });

    it('should handle uppercase pitch names', () => {
        expect(Helper.pname2midi('C')).toBe(0);
        expect(Helper.pname2midi('D')).toBe(2);
    });

    it('should return -1 for unknown', () => {
        expect(Helper.pname2midi('z')).toBe(-1);
    });
});

// ---------------------------------------------------------------------------
// cloneElement
// ---------------------------------------------------------------------------
describe('Helper.cloneElement', () => {
    it('should return null for null input', () => {
        expect(Helper.cloneElement(null)).toBeNull();
    });

    it('should clone element with attributes but no children', () => {
        const el = new Element('note');
        el.addAttribute(new Attribute('dur', '4'));
        el.addAttribute(new Attribute('oct', '5'));
        const child = new Element('artic');
        el.appendChild(child);

        const clone = Helper.cloneElement(el);
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
describe('Helper.addUUID', () => {
    it('should add an xml:id attribute', () => {
        const el = new Element('note');
        const uuid = Helper.addUUID(el);
        expect(uuid).toMatch(/^meico_/);
        const attr = el.getAttribute('id', 'http://www.w3.org/XML/1998/namespace');
        expect(attr).not.toBeNull();
        expect(attr!.getValue()).toBe(uuid);
    });
});

// ---------------------------------------------------------------------------
// prettyXml
// ---------------------------------------------------------------------------
describe('Helper.prettyXml', () => {
    it('should return empty string for null', () => {
        expect(Helper.prettyXml(null)).toBe('');
    });

    it('should return empty string for empty string', () => {
        expect(Helper.prettyXml('')).toBe('');
    });

    it('should prettify simple XML', () => {
        const xml = '<root><child/></root>';
        const pretty = Helper.prettyXml(xml);
        expect(pretty).toContain('<root>');
        expect(pretty).toContain('  <child');
        expect(pretty).toContain('</root>');
    });
});

// ---------------------------------------------------------------------------
// pulseDuration2decimal
// ---------------------------------------------------------------------------
describe('Helper.pulseDuration2decimal', () => {
    it('should convert pulse duration to decimal based on ppq', () => {
        // 720 pulses at ppq=720 = 720/(720*4) = 0.25 (quarter note)
        expect(Helper.pulseDuration2decimal(720, 720)).toBe(0.25);
    });

    it('should convert whole note at ppq=720', () => {
        // 2880 pulses at ppq=720 = 2880/(720*4) = 1.0 (whole note)
        expect(Helper.pulseDuration2decimal(2880, 720)).toBe(1.0);
    });
});

// ---------------------------------------------------------------------------
// addToListAttribute
// ---------------------------------------------------------------------------
describe('Helper.addToListAttribute', () => {
    it('should add a value to a new attribute', () => {
        const el = new Element('note');
        Helper.addToListAttribute(el, 'classes', 'foo');
        expect(Helper.getAttributeValue('classes', el)).toBe('foo');
    });

    it('should add to an existing attribute (space-separated)', () => {
        const el = new Element('note');
        el.addAttribute(new Attribute('classes', 'foo'));
        Helper.addToListAttribute(el, 'classes', 'bar');
        expect(Helper.getAttributeValue('classes', el)).toBe('foo bar');
    });

    it('should not add duplicate values', () => {
        const el = new Element('note');
        el.addAttribute(new Attribute('classes', 'foo bar'));
        Helper.addToListAttribute(el, 'classes', 'foo');
        expect(Helper.getAttributeValue('classes', el)).toBe('foo bar');
    });

    it('should do nothing with null/empty arguments', () => {
        Helper.addToListAttribute(null, 'x', 'y'); // Should not throw
        const el = new Element('note');
        Helper.addToListAttribute(el, null as unknown as string, 'y'); // Should not throw
        Helper.addToListAttribute(el, 'x', null as unknown as string); // Should not throw
        expect(el.getAttributeCount()).toBe(0);
    });
});

// ---------------------------------------------------------------------------
// getAllChildElements
// ---------------------------------------------------------------------------
describe('Helper.getAllChildElements', () => {
    it('should return all children when no name is given', () => {
        const layer = tree('layer', [el('note'), el('rest'), el('note')]);
        const children = Helper.getAllChildElements(layer)!;
        expect(children.map(c => c.getLocalName())).toEqual(['note', 'rest', 'note']);
    });

    it('should return an empty list for a childless element', () => {
        expect(Helper.getAllChildElements(new Element('layer'))).toEqual([]);
    });

    it('should filter by name when one is given', () => {
        const layer = tree('layer', [el('note'), el('rest'), el('note')]);
        const notes = Helper.getAllChildElements('note', layer)!;
        expect(notes.length).toBe(2);
        expect(notes.every(n => n.getLocalName() === 'note')).toBe(true);
    });

    it('should not descend into grandchildren', () => {
        const chord = tree('chord', [el('note'), el('note')]);
        const layer = tree('layer', [chord, el('note')]);
        expect(Helper.getAllChildElements('note', layer)!.length).toBe(1);
    });

    it('should return null for a null element or an empty name', () => {
        expect(Helper.getAllChildElements(null as unknown as Element)).toBeNull();
        expect(Helper.getAllChildElements('note', null as unknown as Element)).toBeNull();
        expect(Helper.getAllChildElements('', new Element('layer'))).toBeNull();
    });
});

// ---------------------------------------------------------------------------
// getAllDescendantsByName / getAllDescendantsWithAttribute
// ---------------------------------------------------------------------------
describe('Helper.getAllDescendantsByName', () => {
    it('should collect matching elements at every depth', () => {
        const chord = tree('chord', [el('note', { pname: 'c' }), el('note', { pname: 'e' })]);
        const layer = tree('layer', [el('note', { pname: 'g' }), chord]);
        const staff = tree('staff', [layer]);

        const notes = Helper.getAllDescendantsByName('note', staff)!;
        expect(notes.map(n => n.getAttributeValue('pname'))).toEqual(['g', 'c', 'e']);
    });

    it('should not include the start element itself', () => {
        const note = tree('note', [el('note')]);
        expect(Helper.getAllDescendantsByName('note', note)!.length).toBe(1);
    });

    it('should return an empty list when nothing matches', () => {
        const layer = tree('layer', [el('rest')]);
        expect(Helper.getAllDescendantsByName('note', layer)).toEqual([]);
    });

    it('should return null for a null element or an empty name', () => {
        expect(Helper.getAllDescendantsByName('note', null)).toBeNull();
        expect(Helper.getAllDescendantsByName('', new Element('layer'))).toBeNull();
    });
});

describe('Helper.getAllDescendantsWithAttribute', () => {
    it('should collect every descendant carrying the attribute', () => {
        const chord = tree('chord', [el('note', { dur: '8' }), el('note')]);
        const layer = tree('layer', [el('rest', { dur: '4' }), chord]);

        const withDur = Helper.getAllDescendantsWithAttribute('dur', layer)!;
        expect(withDur.map(e => e.getLocalName())).toEqual(['rest', 'note']);
    });

    it('should return an empty list when no descendant has the attribute', () => {
        expect(Helper.getAllDescendantsWithAttribute('dur', tree('layer', [el('note')]))).toEqual([]);
    });

    it('should return null for a null element or an empty attribute name', () => {
        expect(Helper.getAllDescendantsWithAttribute('dur', null)).toBeNull();
        expect(Helper.getAllDescendantsWithAttribute('', new Element('layer'))).toBeNull();
    });
});

// ---------------------------------------------------------------------------
// sibling navigation
// ---------------------------------------------------------------------------
describe('Helper.getNextSiblingElement', () => {
    it('should return the immediately following sibling', () => {
        const a = el('note', { n: '1' });
        const b = el('rest');
        const c = el('note', { n: '2' });
        tree('layer', [a, b, c]);

        expect(Helper.getNextSiblingElement(a)!.getLocalName()).toBe('rest');
        expect(Helper.getNextSiblingElement(c)).toBeNull();
    });

    it('should return null for an element without a parent', () => {
        expect(Helper.getNextSiblingElement(new Element('note'))).toBeNull();
        expect(Helper.getNextSiblingElement(null as unknown as Element)).toBeNull();
    });

    it('should skip to the next sibling of a given name', () => {
        const a = el('note', { n: '1' });
        const b = el('rest');
        const c = el('note', { n: '2' });
        const d = el('note', { n: '3' });
        tree('layer', [a, b, c, d]);

        expect(Helper.getNextSiblingElement('note', a)!.getAttributeValue('n')).toBe('2');
        expect(Helper.getNextSiblingElement('note', c)!.getAttributeValue('n')).toBe('3');
        expect(Helper.getNextSiblingElement('note', d)).toBeNull();
        expect(Helper.getNextSiblingElement('rest', b)).toBeNull();
    });

    it('should return null for the named overload without a parent', () => {
        expect(Helper.getNextSiblingElement('note', new Element('note'))).toBeNull();
        expect(Helper.getNextSiblingElement('note', null as unknown as Element)).toBeNull();
    });
});

describe('Helper.getPreviousSiblingElement', () => {
    it('should return the immediately preceding sibling', () => {
        const a = el('note', { n: '1' });
        const b = el('rest');
        const c = el('note', { n: '2' });
        tree('layer', [a, b, c]);

        expect(Helper.getPreviousSiblingElement(c)!.getLocalName()).toBe('rest');
        expect(Helper.getPreviousSiblingElement(a)).toBeNull();
    });

    it('should return null for an element without a parent', () => {
        expect(Helper.getPreviousSiblingElement(new Element('note'))).toBeNull();
        expect(Helper.getPreviousSiblingElement(null as unknown as Element)).toBeNull();
    });

    it('should skip back to the previous sibling of a given name', () => {
        const a = el('note', { n: '1' });
        const b = el('rest');
        const c = el('note', { n: '2' });
        const d = el('note', { n: '3' });
        tree('layer', [a, b, c, d]);

        expect(Helper.getPreviousSiblingElement('note', d)!.getAttributeValue('n')).toBe('2');
        expect(Helper.getPreviousSiblingElement('note', c)!.getAttributeValue('n')).toBe('1');
        expect(Helper.getPreviousSiblingElement('note', a)).toBeNull();
        expect(Helper.getPreviousSiblingElement('rest', b)).toBeNull();
    });

    it('should return null for the named overload without a parent', () => {
        expect(Helper.getPreviousSiblingElement('note', new Element('note'))).toBeNull();
        expect(Helper.getPreviousSiblingElement('note', null as unknown as Element)).toBeNull();
    });
});

describe('Helper.getAllPreviousSiblingElements', () => {
    it('should list the preceding named siblings ordered by distance', () => {
        const a = el('note', { n: '1' });
        const b = el('note', { n: '2' });
        const c = el('rest');
        const d = el('note', { n: '3' });
        tree('layer', [a, b, c, d]);

        const previous = Helper.getAllPreviousSiblingElements('note', d);
        expect(previous.map(e => e.getAttributeValue('n'))).toEqual(['2', '1']);
    });

    it('should return an empty list for the first sibling', () => {
        const a = el('note');
        tree('layer', [a, el('note')]);
        expect(Helper.getAllPreviousSiblingElements('note', a)).toEqual([]);
    });
});

// ---------------------------------------------------------------------------
// addToMap
// ---------------------------------------------------------------------------
describe('Helper.addToMap', () => {
    const dates = (map: Element) => {
        const out: string[] = [];
        for (let i = 0; i < map.getChildCount(); ++i) {
            out.push((map.getChild(i) as Element).getAttributeValue('date') ?? '');
        }
        return out;
    };

    it('should return -1 when the map or the element is missing', () => {
        expect(Helper.addToMap(null, new Element('map'))).toBe(-1);
        expect(Helper.addToMap(new Element('note'), null)).toBe(-1);
    });

    it('should append an element without a date and return its index', () => {
        const map = tree('map', [el('note', { date: '0.0' })]);
        const index = Helper.addToMap(el('note'), map);
        expect(index).toBe(1);
        expect(map.getChildCount()).toBe(2);
    });

    it('should append to a map that holds no dated elements at all', () => {
        const map = tree('map', [el('note')]);
        const index = Helper.addToMap(el('note', { date: '5.0' }), map);
        expect(index).toBe(1);
    });

    it('should insert directly behind the last element with an earlier or equal date', () => {
        const map = tree('map', [
            el('note', { date: '0.0' }),
            el('note', { date: '720.0' }),
            el('note', { date: '1440.0' }),
        ]);

        expect(Helper.addToMap(el('note', { date: '720.0' }), map)).toBe(2);
        expect(dates(map)).toEqual(['0.0', '720.0', '720.0', '1440.0']);
    });

    it('should insert at the front when every element is later', () => {
        const map = tree('map', [el('note', { date: '720.0' }), el('note', { date: '1440.0' })]);

        expect(Helper.addToMap(el('note', { date: '0.0' }), map)).toBe(0);
        expect(dates(map)).toEqual(['0.0', '720.0', '1440.0']);
    });

    it('should append at the end when the new date is the latest', () => {
        const map = tree('map', [el('note', { date: '0.0' })]);

        expect(Helper.addToMap(el('note', { date: '1440.0' }), map)).toBe(1);
        expect(dates(map)).toEqual(['0.0', '1440.0']);
    });
});

// ---------------------------------------------------------------------------
// id copying
// ---------------------------------------------------------------------------
describe('Helper.copyId / copyIdNoNs', () => {
    it('copyId should carry the xml:id over, namespace included', () => {
        const source = new Element('note');
        source.addAttribute(new Attribute('xml:id', 'http://www.w3.org/XML/1998/namespace', 'n1'));
        const target = new Element('note');

        const copied = Helper.copyId(source, target);
        expect(copied).not.toBeNull();
        expect(Helper.getAttributeValue('id', target)).toBe('n1');
        expect(target.getAttribute('id', 'http://www.w3.org/XML/1998/namespace')).not.toBeNull();
    });

    it('copyIdNoNs should carry the value over without a namespace', () => {
        const source = new Element('note');
        source.addAttribute(new Attribute('xml:id', 'http://www.w3.org/XML/1998/namespace', 'n1'));
        const target = new Element('note');

        const copied = Helper.copyIdNoNs(source, target);
        expect(copied!.getValue()).toBe('n1');
        expect(target.getAttribute('id')).not.toBeNull();
    });

    it('should return null when the source has no id', () => {
        expect(Helper.copyId(new Element('note'), new Element('note'))).toBeNull();
        expect(Helper.copyIdNoNs(new Element('note'), new Element('note'))).toBeNull();
    });
});

// ---------------------------------------------------------------------------
// parent / ancestor access
// ---------------------------------------------------------------------------
describe('Helper.getParentElement', () => {
    it('should return the parent element', () => {
        const note = el('note');
        const layer = tree('layer', [note]);
        expect(Helper.getParentElement(note)).toBe(layer);
    });

    it('should return null for a detached element', () => {
        expect(Helper.getParentElement(new Element('note'))).toBeNull();
    });
});

describe('Helper.getClosest', () => {
    it('should walk up to the nearest ancestor with the given name', () => {
        const note = el('note');
        const layer = tree('layer', [note]);
        const staff = tree('staff', [layer]);
        tree('measure', [staff]);

        expect(Helper.getClosest('staff', note)).toBe(staff);
        expect(Helper.getClosest('measure', note)!.getLocalName()).toBe('measure');
    });

    it('should not match the element itself', () => {
        const note = el('note');
        tree('layer', [note]);
        expect(Helper.getClosest('note', note)).toBeNull();
    });

    it('should return null when no ancestor matches', () => {
        const note = el('note');
        tree('layer', [note]);
        expect(Helper.getClosest('measure', note)).toBeNull();
    });
});

describe('Helper.getClosestByAttr', () => {
    it('should walk up to the nearest ancestor carrying the attribute', () => {
        const note = el('note');
        const layer = tree('layer', [note]);
        const staff = tree('staff', [layer]);
        staff.addAttribute(new Attribute('n', '1'));

        expect(Helper.getClosestByAttr('n', note)).toBe(staff);
    });

    it('should skip ancestors whose attribute value is empty', () => {
        const note = el('note');
        const layer = tree('layer', [note]);
        layer.addAttribute(new Attribute('n', ''));
        const staff = tree('staff', [layer]);
        staff.addAttribute(new Attribute('n', '1'));

        expect(Helper.getClosestByAttr('n', note)).toBe(staff);
    });

    it('should return null when no ancestor carries it', () => {
        const note = el('note');
        tree('layer', [note]);
        expect(Helper.getClosestByAttr('n', note)).toBeNull();
    });
});

// ---------------------------------------------------------------------------
// updateMpmNoteidsAfterResolvingRepetitions
// ---------------------------------------------------------------------------
describe('Helper.updateMpmNoteidsAfterResolvingRepetitions', () => {
    it('should renumber the repeats of a noteid, leaving the first one alone', () => {
        const map = tree('articulationMap', [
            el('articulation', { noteid: '#n1' }),
            el('articulation', { noteid: '#n1' }),
            el('articulation', { noteid: '#n1' }),
        ]);
        const mappings = new Map<string, string>([['n1', 'n1_rep1'], ['n1_rep1', 'n1_rep2']]);

        Helper.updateMpmNoteidsAfterResolvingRepetitions({ getXml: () => map }, mappings);

        const ids = Helper.getAllChildElements(map)!.map(e => e.getAttributeValue('noteid'));
        expect(ids).toEqual(['#n1', '#n1_rep1', '#n1_rep2']);
    });

    it('should leave a noteid that occurs only once untouched', () => {
        const map = tree('articulationMap', [el('articulation', { noteid: '#n1' })]);
        const mappings = new Map<string, string>([['n1', 'n1_rep1']]);

        Helper.updateMpmNoteidsAfterResolvingRepetitions({ getXml: () => map }, mappings);

        expect(Helper.getAllChildElements(map)![0].getAttributeValue('noteid')).toBe('#n1');
    });

    it('should do nothing when there are no mappings', () => {
        const map = tree('articulationMap', [el('articulation', { noteid: '#n1' })]);
        Helper.updateMpmNoteidsAfterResolvingRepetitions({ getXml: () => map }, new Map());
        expect(Helper.getAllChildElements(map)![0].getAttributeValue('noteid')).toBe('#n1');
    });
});

// ---------------------------------------------------------------------------
// decimalDuration2HtmlUnicode
// ---------------------------------------------------------------------------
describe('Helper.decimalDuration2HtmlUnicode', () => {
    it('should map the plain note values onto their musical symbols', () => {
        expect(Helper.decimalDuration2HtmlUnicode(1.0, false)).toBe('&#119133;');   // whole
        expect(Helper.decimalDuration2HtmlUnicode(0.5, false)).toBe('&#119134;');   // half
        expect(Helper.decimalDuration2HtmlUnicode(0.25, false)).toBe('&#119135;');  // quarter
        expect(Helper.decimalDuration2HtmlUnicode(0.125, false)).toBe('&#119136;'); // eighth
        expect(Helper.decimalDuration2HtmlUnicode(0.0625, false)).toBe('&#119137;');
        expect(Helper.decimalDuration2HtmlUnicode(0.03125, false)).toBe('&#119138;');
        expect(Helper.decimalDuration2HtmlUnicode(0.015625, false)).toBe('&#119139;');
        expect(Helper.decimalDuration2HtmlUnicode(0.0078125, false)).toBe('&#119140;');
    });

    it('should map the long note values, breve upwards', () => {
        expect(Helper.decimalDuration2HtmlUnicode(2.0, false)).toBe('&#119132;');
        expect(Helper.decimalDuration2HtmlUnicode(4.0, false)).toBe('&#119223;');
        expect(Helper.decimalDuration2HtmlUnicode(8.0, false)).toBe('&#119222;');
    });

    it('should use the rest symbols when isRest is set', () => {
        expect(Helper.decimalDuration2HtmlUnicode(1.0, true)).toBe('&#119099;');
        expect(Helper.decimalDuration2HtmlUnicode(0.25, true)).toBe('&#119101;');
        expect(Helper.decimalDuration2HtmlUnicode(2.0, true)).toBe('2 &#119098;');
        expect(Helper.decimalDuration2HtmlUnicode(4.0, true)).toBe('4 &#119098;');
        expect(Helper.decimalDuration2HtmlUnicode(8.0, true)).toBe('8 &#119098;');
    });

    it('should append one dot per augmentation', () => {
        expect(Helper.decimalDuration2HtmlUnicode(0.375, false)).toBe('&#119135;.');    // dotted quarter
        expect(Helper.decimalDuration2HtmlUnicode(0.4375, false)).toBe('&#119135;..');  // double dotted quarter
        expect(Helper.decimalDuration2HtmlUnicode(0.75, false)).toBe('&#119134;.');     // dotted half
        expect(Helper.decimalDuration2HtmlUnicode(1.5, false)).toBe('&#119133;.');      // dotted whole
        expect(Helper.decimalDuration2HtmlUnicode(0.375, true)).toBe('&#119101;.');     // dotted quarter rest
    });

    it('should dot the short note values too', () => {
        expect(Helper.decimalDuration2HtmlUnicode(0.0234375, false)).toBe('&#119139;.');  // dotted 1/64
    });

    it('should not add dots below the shortest representable value', () => {
        // the dot loop stops at 1/128, so the augmentation of a 1/128 note is dropped
        expect(Helper.decimalDuration2HtmlUnicode(0.01171875, false)).toBe('&#119140;');
    });

    it('should give up below 1/128 and above a maxima', () => {
        expect(Helper.decimalDuration2HtmlUnicode(0.001, false)).toBe('note');
        expect(Helper.decimalDuration2HtmlUnicode(0.001, true)).toBe('rest');
        expect(Helper.decimalDuration2HtmlUnicode(16.0, false)).toBe('note');
        expect(Helper.decimalDuration2HtmlUnicode(16.0, true)).toBe('rest');
    });
});

// ---------------------------------------------------------------------------
// accidental conversions – the remaining cases
// ---------------------------------------------------------------------------
describe('Helper.accidString2decimal – quarter tones and enharmonics', () => {
    it('should convert the double and triple accidentals', () => {
        expect(Helper.accidString2decimal('x')).toBe(2);
        expect(Helper.accidString2decimal('xs')).toBe(3);
        expect(Helper.accidString2decimal('ts')).toBe(3);
        expect(Helper.accidString2decimal('tf')).toBe(-3);
    });

    it('should convert the neutral combinations', () => {
        expect(Helper.accidString2decimal('nf')).toBe(-1);
        expect(Helper.accidString2decimal('ns')).toBe(1);
    });

    it('should convert the quarter tone accidentals', () => {
        expect(Helper.accidString2decimal('su')).toBe(1.5);
        expect(Helper.accidString2decimal('sd')).toBe(0.5);
        expect(Helper.accidString2decimal('fu')).toBe(-0.5);
        expect(Helper.accidString2decimal('fd')).toBe(-1.5);
        expect(Helper.accidString2decimal('nu')).toBe(0.5);
        expect(Helper.accidString2decimal('nd')).toBe(-0.5);
        expect(Helper.accidString2decimal('1qf')).toBe(-0.5);
        expect(Helper.accidString2decimal('3qf')).toBe(-1.5);
        expect(Helper.accidString2decimal('1qs')).toBe(0.5);
        expect(Helper.accidString2decimal('3qs')).toBe(1.5);
    });

    it('should return 0 for anything it does not know', () => {
        expect(Helper.accidString2decimal('zzz')).toBe(0);
        expect(Helper.accidString2decimal('')).toBe(0);
    });
});

describe('Helper.accidDecimal2String – the remaining cases', () => {
    it('should convert the double and triple accidentals', () => {
        expect(Helper.accidDecimal2String(2)).toBe('ss');
        expect(Helper.accidDecimal2String(-2)).toBe('ff');
        expect(Helper.accidDecimal2String(3)).toBe('xs');
        expect(Helper.accidDecimal2String(-3)).toBe('tf');
    });

    it('should convert the quarter tone accidentals', () => {
        expect(Helper.accidDecimal2String('0.5')).toBe('1qs');
        expect(Helper.accidDecimal2String('1.5')).toBe('3qs');
        expect(Helper.accidDecimal2String('-0.5')).toBe('1qf');
        expect(Helper.accidDecimal2String('-1.5')).toBe('3qf');
    });

    it('should pass an unrecognised value through unchanged', () => {
        expect(Helper.accidDecimal2String('7')).toBe('7');
    });

    it('should round-trip against accidString2decimal', () => {
        for (const accid of ['s', 'f', 'ss', 'ff', 'n', '1qs', '3qs', '1qf', '3qf']) {
            const decimal = Helper.accidString2decimal(accid);
            expect(Helper.accidString2decimal(Helper.accidDecimal2String(decimal)!)).toBe(decimal);
        }
    });
});

describe('Helper.accidString2word', () => {
    it('should name the plain accidentals', () => {
        expect(Helper.accidString2word('s')).toBe('sharp');
        expect(Helper.accidString2word('f')).toBe('flat');
        expect(Helper.accidString2word('n')).toBe('natural');
        expect(Helper.accidString2word('ss')).toBe('sharp-sharp');
        expect(Helper.accidString2word('x')).toBe('double-sharp');
        expect(Helper.accidString2word('ff')).toBe('flat-flat');
    });

    it('should share one word between the two triple sharp spellings', () => {
        expect(Helper.accidString2word('xs')).toBe('triple-sharp');
        expect(Helper.accidString2word('ts')).toBe('triple-sharp');
        expect(Helper.accidString2word('tf')).toBe('triple-flat');
    });

    it('should name the combined and microtonal accidentals', () => {
        expect(Helper.accidString2word('nf')).toBe('natural-flat');
        expect(Helper.accidString2word('ns')).toBe('natural-sharp');
        expect(Helper.accidString2word('su')).toBe('sharp-up');
        expect(Helper.accidString2word('sd')).toBe('sharp-down');
        expect(Helper.accidString2word('fu')).toBe('flat-up');
        expect(Helper.accidString2word('fd')).toBe('flat-down');
        expect(Helper.accidString2word('nu')).toBe('natural-up');
        expect(Helper.accidString2word('nd')).toBe('natural-down');
        expect(Helper.accidString2word('1qf')).toBe('quarter-flat');
        expect(Helper.accidString2word('3qf')).toBe('three-quarters-flat');
        expect(Helper.accidString2word('1qs')).toBe('quarter-sharp');
        expect(Helper.accidString2word('3qs')).toBe('three-quarters-sharp');
    });

    it('should return an empty string for anything unknown', () => {
        expect(Helper.accidString2word('zzz')).toBe('');
    });
});

describe('Helper.accidDecimal2unicodeString', () => {
    it('should return nothing for a natural', () => {
        expect(Helper.accidDecimal2unicodeString(0.0)).toBe('');
    });

    it('should map the semitone accidentals', () => {
        expect(Helper.accidDecimal2unicodeString(1.0)).toBe('&#9839;');
        expect(Helper.accidDecimal2unicodeString(-1.0)).toBe('&#9837;');
        expect(Helper.accidDecimal2unicodeString(2.0)).toBe('&#119082;');
        expect(Helper.accidDecimal2unicodeString(-2.0)).toBe('&#119083;');
        expect(Helper.accidDecimal2unicodeString(3.0)).toBe('&#119082;&#9839;');
        expect(Helper.accidDecimal2unicodeString(-3.0)).toBe('&#9837;&#9837;&#9837;');
    });

    it('should map the quarter tone accidentals', () => {
        expect(Helper.accidDecimal2unicodeString(1.5)).toBe('&#119088;');
        expect(Helper.accidDecimal2unicodeString(0.5)).toBe('&#119090;');
        expect(Helper.accidDecimal2unicodeString(-0.5)).toBe('&#119091;');
        expect(Helper.accidDecimal2unicodeString(-1.5)).toBe('&#119085;');
    });

    it('should return a question mark for a value it cannot render', () => {
        expect(Helper.accidDecimal2unicodeString(0.25)).toBe('?');
        expect(Helper.accidDecimal2unicodeString(4.0)).toBe('?');
    });
});

// ---------------------------------------------------------------------------
// pitch conversions
// ---------------------------------------------------------------------------
describe('Helper.pname2midi – accidental spellings', () => {
    it('should resolve the enharmonic spellings onto one pitch class', () => {
        expect(Helper.pname2midi('b#')).toBe(0);
        expect(Helper.pname2midi('bs')).toBe(0);
        expect(Helper.pname2midi('c#')).toBe(1);
        expect(Helper.pname2midi('cs')).toBe(1);
        expect(Helper.pname2midi('db')).toBe(1);
        expect(Helper.pname2midi('df')).toBe(1);
        expect(Helper.pname2midi('ds')).toBe(3);
        expect(Helper.pname2midi('ef')).toBe(3);
        expect(Helper.pname2midi('fb')).toBe(4);
        expect(Helper.pname2midi('ff')).toBe(4);
        expect(Helper.pname2midi('es')).toBe(5);
        expect(Helper.pname2midi('fs')).toBe(6);
        expect(Helper.pname2midi('gf')).toBe(6);
        expect(Helper.pname2midi('gs')).toBe(8);
        expect(Helper.pname2midi('af')).toBe(8);
        expect(Helper.pname2midi('cf')).toBe(11);
        expect(Helper.pname2midi('cb')).toBe(11);
    });

    it('should accept the upper case spellings as well', () => {
        expect(Helper.pname2midi('B#')).toBe(0);
        expect(Helper.pname2midi('Db')).toBe(1);
        expect(Helper.pname2midi('Ef')).toBe(3);
        expect(Helper.pname2midi('Gs')).toBe(8);
        expect(Helper.pname2midi('Cb')).toBe(11);
    });

    it('should return -1 for an empty name', () => {
        expect(Helper.pname2midi('')).toBe(-1);
    });
});

describe('Helper.midi2pname', () => {
    it('should name every pitch class of the first octave', () => {
        expect([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map(p => Helper.midi2pname(p)))
            .toEqual(['C', 'C# Db', 'D', 'D# Eb', 'E', 'F', 'F# Gb', 'G', 'G# Ab', 'A', 'A# Bb', 'B']);
    });

    it('should fold higher octaves onto the same pitch classes', () => {
        expect(Helper.midi2pname(60)).toBe('C');
        expect(Helper.midi2pname(69)).toBe('A');
        expect(Helper.midi2pname(71)).toBe('B');
    });

    it('should round a fractional pitch to the nearest pitch class', () => {
        expect(Helper.midi2pname(60.4)).toBe('C');
        expect(Helper.midi2pname(60.6)).toBe('C# Db');
    });

    it('should return an empty string when the pitch class falls outside 0..11', () => {
        // rounding 11.5 gives 12, which no case covers
        expect(Helper.midi2pname(11.5)).toBe('');
        expect(Helper.midi2pname(-1)).toBe('');
    });
});

describe('Helper.midi2PnameAndAccid', () => {
    it('should give the naturals no accidental', () => {
        for (const [pitch, name] of [[60, 'C'], [62, 'D'], [64, 'E'], [65, 'F'], [67, 'G'], [69, 'A'], [71, 'B']] as Array<[number, string]>) {
            const out = ['', ''];
            Helper.midi2PnameAndAccid(true, pitch, out);
            expect(out).toEqual([name, '0.0']);
        }
    });

    it('should spell the black keys as sharps when asked to', () => {
        const results = [61, 63, 66, 68, 70].map(pitch => {
            const out = ['', ''];
            Helper.midi2PnameAndAccid(true, pitch, out);
            return out;
        });
        expect(results).toEqual([['C', '1.0'], ['D', '1.0'], ['F', '1.0'], ['G', '1.0'], ['A', '1.0']]);
    });

    it('should spell the black keys as flats otherwise', () => {
        const results = [61, 63, 66, 68, 70].map(pitch => {
            const out = ['', ''];
            Helper.midi2PnameAndAccid(false, pitch, out);
            return out;
        });
        expect(results).toEqual([['D', '-1.0'], ['E', '-1.0'], ['G', '-1.0'], ['A', '-1.0'], ['B', '-1.0']]);
    });

    it('should blank both entries when the pitch class falls outside 0..11', () => {
        const out = ['x', 'y'];
        Helper.midi2PnameAndAccid(true, -1, out);
        expect(out).toEqual(['', '']);
    });

    it('should complain and leave the array alone when it is too short', () => {
        const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        const out = ['x'];
        Helper.midi2PnameAndAccid(true, 60, out);

        expect(out).toEqual(['x']);
        expect(errSpy).toHaveBeenCalled();
        errSpy.mockRestore();
    });
});

describe('Helper.midi2PnameAccidOct', () => {
    it('should add the octave to pitch name and accidental', () => {
        const out = ['', '', ''];
        Helper.midi2PnameAccidOct(false, 60, out);
        expect(out[0]).toBe('C');
        expect(out[1]).toBe('0.0');
        expect(out[2]).toBe('4');
    });

    it('should map the octave boundaries the way the MIDI octave table does', () => {
        const octaveOf = (pitch: number) => {
            const out = ['', '', ''];
            Helper.midi2PnameAccidOct(true, pitch, out);
            return out[2];
        };

        expect(octaveOf(21)).toBe('0');
        expect(octaveOf(23)).toBe('0');
        expect(octaveOf(24)).toBe('1');
        expect(octaveOf(36)).toBe('2');
        expect(octaveOf(48)).toBe('3');
        expect(octaveOf(60)).toBe('4');
        expect(octaveOf(72)).toBe('5');
        expect(octaveOf(84)).toBe('6');
        expect(octaveOf(96)).toBe('7');
        expect(octaveOf(108)).toBe('8');
        expect(octaveOf(127)).toBe('8');
    });

    it('should report octave -1 below the table', () => {
        const out = ['', '', ''];
        Helper.midi2PnameAccidOct(true, 20, out);
        expect(out[2]).toBe('-1');
    });

    it('should leave the octave untouched when the pitch class is out of range', () => {
        const out = ['', '', 'untouched'];
        Helper.midi2PnameAccidOct(true, -1, out);
        expect(out[2]).toBe('untouched');
    });

    it('should complain and leave the array alone when it is too short', () => {
        const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        const out = ['x', 'y'];
        Helper.midi2PnameAccidOct(true, 60, out);

        expect(out).toEqual(['x', 'y']);
        expect(errSpy).toHaveBeenCalled();
        errSpy.mockRestore();
    });
});

// ---------------------------------------------------------------------------
// prettyXml – declaration and nesting
// ---------------------------------------------------------------------------
describe('Helper.prettyXml – declaration and nesting', () => {
    it('should keep an XML declaration unindented on its own line', () => {
        const pretty = Helper.prettyXml('<?xml version="1.0" encoding="UTF-8"?><root><child/></root>');
        const lines = pretty.split('\n');
        expect(lines[0]).toBe('<?xml version="1.0" encoding="UTF-8"?>');
        expect(lines[1]).toBe('<root>');
    });

    it('should indent by two spaces per level', () => {
        const pretty = Helper.prettyXml('<a><b><c/></b></a>');
        expect(pretty.split('\n')).toEqual(['<a>', '  <b>', '    <c/>', '  </b>', '</a>']);
    });

    it('should indent text content with its element', () => {
        const pretty = Helper.prettyXml('<a><b>text</b></a>');
        expect(pretty.split('\n')).toEqual(['<a>', '  <b>', '    text', '  </b>', '</a>']);
    });

    it('should return an empty string for whitespace only input', () => {
        expect(Helper.prettyXml('   ')).toBe('');
    });
});

// ---------------------------------------------------------------------------
// writeStringToFile – guards
// ---------------------------------------------------------------------------
describe('Helper.writeStringToFile', () => {
    it('should refuse a null string', () => {
        const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        expect(Helper.writeStringToFile(null, 'out.txt')).toBe(false);
        expect(errSpy).toHaveBeenCalledWith('String undefined!');
        errSpy.mockRestore();
    });

    it('should refuse a null filename', () => {
        const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        expect(Helper.writeStringToFile('content', null)).toBe(false);
        expect(errSpy).toHaveBeenCalledWith('Filename undefined!');
        errSpy.mockRestore();
    });

    it('should write the string plus a trailing newline, creating the directory', () => {
        const dir = mkdtempSync(join(tmpdir(), 'meico-helper-'));
        const file = join(dir, 'nested', 'out.txt');

        try {
            expect(Helper.writeStringToFile('<mei/>', file)).toBe(true);
            expect(readFileSync(file, 'utf-8')).toBe('<mei/>\n');
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });
});

// ---------------------------------------------------------------------------
// environment stubs – XSLT and schema validation are not available here
// ---------------------------------------------------------------------------
describe('Helper – XSLT and schema validation stubs', () => {
    it('validateAgainstSchema should warn instead of validating', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        expect(() => Helper.validateAgainstSchema('file.mei', 'schema.rng')).not.toThrow();
        expect(warnSpy).toHaveBeenCalled();
        warnSpy.mockRestore();
    });

    it('validateAgainstSchemaString should warn instead of validating', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        expect(() => Helper.validateAgainstSchemaString('<mei/>', 'schema.rng')).not.toThrow();
        expect(warnSpy).toHaveBeenCalled();
        warnSpy.mockRestore();
    });

    it('the XSLT entry points should all return null', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const doc = new Builder().build('<mei/>') as Document;

        expect(Helper.xslTransformToDocument(doc, 'style.xsl')).toBeNull();
        expect(Helper.xslTransformToString(doc, 'style.xsl')).toBeNull();
        expect(Helper.xslTransformToString('<mei/>', 'style.xsl')).toBeNull();
        expect(Helper.makeXsltTransformer('style.xsl', null, null, null)).toBeNull();
        expect(Helper.makeXslt30Transformer('style.xsl')).toBeNull();
        expect(warnSpy).toHaveBeenCalledTimes(5);

        warnSpy.mockRestore();
    });
});
