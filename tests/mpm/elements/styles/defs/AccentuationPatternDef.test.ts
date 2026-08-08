import { describe, it, expect, vi } from 'vitest';
import { AccentuationPatternDef } from '../../../../../src/mpm/elements/styles/defs/AccentuationPatternDef.js';
import { Element, Attribute } from '../../../../../src/xml/XomTypes.js';
import { Mpm } from '../../../../../src/mpm/Mpm.js';

/**
 * Reference: meico/src/meico/mpm/elements/styles/defs/AccentuationPatternDef.java
 */
function accentuation(attributes: Record<string, string>): Element {
    const e = new Element('accentuation', Mpm.MPM_NAMESPACE);
    for (const [name, value] of Object.entries(attributes))
        e.addAttribute(new Attribute(name, value));
    return e;
}

function patternElement(attributes: Record<string, string>, children: Element[] = []): Element {
    const e = new Element('accentuationPatternDef', Mpm.MPM_NAMESPACE);
    for (const [name, value] of Object.entries(attributes))
        e.addAttribute(new Attribute(name, value));
    for (const c of children) e.appendChild(c);
    return e;
}

/** beat positions of the accentuation child elements, in document order */
function xmlBeats(def: AccentuationPatternDef): string[] {
    const children = def.getXml()!.getChildElements();
    const beats: string[] = [];
    for (let i = 0; i < children.size(); ++i)
        beats.push(children.get(i).getAttributeValue('beat')!);
    return beats;
}

describe('AccentuationPatternDef', () => {
    describe('createAccentuationPatternDef', () => {
        it('creates an empty pattern from name and length', () => {
            const apd = AccentuationPatternDef.createAccentuationPatternDef('4/4', 4.0)!;
            expect(apd.getName()).toBe('4/4');
            expect(apd.getLength()).toBe(4.0);
            expect(apd.size()).toBe(0);
            expect(apd.getXml()!.getLocalName()).toBe('accentuationPatternDef');
            expect(apd.getXml()!.getNamespaceURI()).toBe(Mpm.MPM_NAMESPACE);
            expect(apd.getXml()!.getAttributeValue('length')).toBe('4');
        });

        it('accepts an id as third argument', () => {
            const apd = AccentuationPatternDef.createAccentuationPatternDef('3/4', 3.0, 'ap-1')!;
            expect(apd.getId()).toBe('ap-1');
        });

        it('defaults the length to 4.0 and writes it back when the attribute is absent', () => {
            const xml = patternElement({ name: '4/4' });
            const apd = AccentuationPatternDef.createAccentuationPatternDef(xml)!;
            expect(apd.getLength()).toBe(4.0);
            expect(xml.getAttributeValue('length')).toBe('4');
        });

        it('returns null when the name attribute is missing', () => {
            const err = vi.spyOn(console, 'error').mockImplementation(() => {});
            expect(AccentuationPatternDef.createAccentuationPatternDef(patternElement({ length: '4.0' }))).toBeNull();
            expect(err).toHaveBeenCalled();
            err.mockRestore();
        });

        it('returns null for a null element', () => {
            const err = vi.spyOn(console, 'error').mockImplementation(() => {});
            expect(AccentuationPatternDef.createAccentuationPatternDef(null as unknown as Element)).toBeNull();
            expect(err).toHaveBeenCalled();
            err.mockRestore();
        });
    });

    describe('parseData', () => {
        it('re-reads name, length and accentuations when applied to another element', () => {
            const apd = AccentuationPatternDef.createAccentuationPatternDef('4/4', 4.0)!;
            const other = patternElement({ name: '3/4', length: '3.0' }, [
                accentuation({ beat: '1.0', value: '1.0' }),
            ]);
            (apd as unknown as { parseData(xml: Element): void }).parseData(other);

            expect(apd.getName()).toBe('3/4');
            expect(apd.getLength()).toBe(3.0);
            expect(apd.getXml()).toBe(other);
            expect(apd.getAccentuationAttributes(apd.size() - 1)).toEqual([1.0, 1.0, 1.0, 1.0]);
        });
    });

    describe('parsing accentuation children', () => {
        it('reads beat, value and both transition attributes', () => {
            const xml = patternElement({ name: '4/4', length: '4.0' }, [
                accentuation({ beat: '1.0', value: '1.0', 'transition.from': '0.5', 'transition.to': '0.2' }),
            ]);
            const apd = AccentuationPatternDef.createAccentuationPatternDef(xml)!;
            expect(apd.size()).toBe(1);
            expect(apd.getAccentuationAttributes(0)).toEqual([1.0, 1.0, 0.5, 0.2]);
        });

        it('defaults transition.from to value and transition.to to transition.from', () => {
            const xml = patternElement({ name: '4/4', length: '4.0' }, [
                accentuation({ beat: '1.0', value: '0.8' }),
            ]);
            const apd = AccentuationPatternDef.createAccentuationPatternDef(xml)!;
            expect(apd.getAccentuationAttributes(0)).toEqual([1.0, 0.8, 0.8, 0.8]);
        });

        it('defaults transition.to to an explicit transition.from', () => {
            const xml = patternElement({ name: '4/4', length: '4.0' }, [
                accentuation({ beat: '1.0', value: '0.8', 'transition.from': '0.3' }),
            ]);
            const apd = AccentuationPatternDef.createAccentuationPatternDef(xml)!;
            expect(apd.getAccentuationAttributes(0)).toEqual([1.0, 0.8, 0.3, 0.3]);
        });

        it('leaves value at 0 when the value attribute is absent', () => {
            const xml = patternElement({ name: '4/4', length: '4.0' }, [accentuation({ beat: '2.0' })]);
            const apd = AccentuationPatternDef.createAccentuationPatternDef(xml)!;
            expect(apd.getAccentuationAttributes(0)).toEqual([2.0, 0.0, 0.0, 0.0]);
        });

        it('skips accentuation children without a beat attribute', () => {
            const xml = patternElement({ name: '4/4', length: '4.0' }, [
                accentuation({ value: '1.0' }),
                accentuation({ beat: '1.0', value: '1.0' }),
            ]);
            const apd = AccentuationPatternDef.createAccentuationPatternDef(xml)!;
            expect(apd.size()).toBe(1);
            expect(apd.getAccentuationAttributes(0)![0]).toBe(1.0);
        });

        it('sorts unsorted accentuations both internally and in the xml', () => {
            const xml = patternElement({ name: '4/4', length: '4.0' }, [
                accentuation({ beat: '3.0', value: '0.5' }),
                accentuation({ beat: '1.0', value: '1.0' }),
                accentuation({ beat: '2.0', value: '0.2' }),
            ]);
            const apd = AccentuationPatternDef.createAccentuationPatternDef(xml)!;
            expect(apd.getAllAccentuations().map(kv => kv.getKey()[0])).toEqual([1.0, 2.0, 3.0]);
            expect(xmlBeats(apd)).toEqual(['1.0', '2.0', '3.0']);
        });
    });

    describe('addAccentuation', () => {
        it('appends and reports the insertion index', () => {
            const apd = AccentuationPatternDef.createAccentuationPatternDef('4/4', 4.0)!;
            expect(apd.addAccentuation(1.0, 1.0, 1.0, 1.0)).toBe(0);
            expect(apd.addAccentuation(2.0, 0.3, 0.3, 0.3)).toBe(1);
            expect(apd.size()).toBe(2);
        });

        it('inserts out-of-order beats at their sorted position', () => {
            const apd = AccentuationPatternDef.createAccentuationPatternDef('4/4', 4.0)!;
            apd.addAccentuation(3.0, 0.5, 0.5, 0.5);
            apd.addAccentuation(1.0, 1.0, 1.0, 1.0);
            const index = apd.addAccentuation(2.0, 0.2, 0.2, 0.2);
            expect(index).toBe(1);
            expect(apd.getAllAccentuations().map(kv => kv.getKey()[0])).toEqual([1.0, 2.0, 3.0]);
            expect(xmlBeats(apd)).toEqual(['1', '2', '3']);
        });

        it('places a beat before all existing ones at index 0', () => {
            const apd = AccentuationPatternDef.createAccentuationPatternDef('4/4', 4.0)!;
            apd.addAccentuation(2.0, 0.2, 0.2, 0.2);
            expect(apd.addAccentuation(1.0, 1.0, 1.0, 1.0)).toBe(0);
            expect(xmlBeats(apd)).toEqual(['1', '2']);
        });

        it('writes all four attributes onto the new element', () => {
            const apd = AccentuationPatternDef.createAccentuationPatternDef('4/4', 4.0)!;
            const index = apd.addAccentuation(1.0, 0.9, 0.4, 0.1);
            const elt = apd.getAccentuationXml(index)!;
            expect(elt.getLocalName()).toBe('accentuation');
            expect(elt.getNamespaceURI()).toBe(Mpm.MPM_NAMESPACE);
            expect(elt.getAttributeValue('beat')).toBe('1');
            expect(elt.getAttributeValue('value')).toBe('0.9');
            expect(elt.getAttributeValue('transition.from')).toBe('0.4');
            expect(elt.getAttributeValue('transition.to')).toBe('0.1');
        });

        it('adds an xml:id when one is given', () => {
            const apd = AccentuationPatternDef.createAccentuationPatternDef('4/4', 4.0)!;
            const index = apd.addAccentuation(1.0, 1.0, 1.0, 1.0, 'acc-1');
            const idAtt = apd.getAccentuationXml(index)!.getAttribute('id', 'http://www.w3.org/XML/1998/namespace');
            expect(idAtt).not.toBeNull();
            expect(idAtt!.getValue()).toBe('acc-1');
        });

        it('adds no xml:id when none is given', () => {
            const apd = AccentuationPatternDef.createAccentuationPatternDef('4/4', 4.0)!;
            const index = apd.addAccentuation(1.0, 1.0, 1.0, 1.0);
            expect(apd.getAccentuationXml(index)!.getAttribute('id', 'http://www.w3.org/XML/1998/namespace')).toBeNull();
        });
    });

    describe('addAccentuationFromXml', () => {
        it('parses and inserts a prebuilt accentuation element', () => {
            const apd = AccentuationPatternDef.createAccentuationPatternDef('4/4', 4.0)!;
            const index = apd.addAccentuationFromXml(
                accentuation({ beat: '1.0', value: '1.0', 'transition.from': '0.5', 'transition.to': '0.0' }));
            expect(index).toBe(0);
            expect(apd.getAccentuationAttributes(0)).toEqual([1.0, 1.0, 0.5, 0.0]);
            expect(xmlBeats(apd)).toEqual(['1.0']);
        });

        it('applies the same transition defaulting as the parser', () => {
            const apd = AccentuationPatternDef.createAccentuationPatternDef('4/4', 4.0)!;
            apd.addAccentuationFromXml(accentuation({ beat: '1.0', value: '0.6' }));
            expect(apd.getAccentuationAttributes(0)).toEqual([1.0, 0.6, 0.6, 0.6]);
        });

        it('returns -1 and adds nothing when the beat attribute is missing', () => {
            const apd = AccentuationPatternDef.createAccentuationPatternDef('4/4', 4.0)!;
            expect(apd.addAccentuationFromXml(accentuation({ value: '1.0' }))).toBe(-1);
            expect(apd.size()).toBe(0);
        });

        it('inserts at the sorted position', () => {
            const apd = AccentuationPatternDef.createAccentuationPatternDef('4/4', 4.0)!;
            apd.addAccentuation(3.0, 0.3, 0.3, 0.3);
            expect(apd.addAccentuationFromXml(accentuation({ beat: '1.0', value: '1.0' }))).toBe(0);
            expect(xmlBeats(apd)).toEqual(['1.0', '3']);
        });
    });

    describe('accessors', () => {
        it('returns null for an out-of-range index', () => {
            const apd = AccentuationPatternDef.createAccentuationPatternDef('4/4', 4.0)!;
            apd.addAccentuation(1.0, 1.0, 1.0, 1.0);
            expect(apd.getAccentuationAttributes(1)).toBeNull();
            expect(apd.getAccentuationXml(1)).toBeNull();
        });

        it('exposes the accentuation list with its xml elements', () => {
            const apd = AccentuationPatternDef.createAccentuationPatternDef('4/4', 4.0)!;
            const index = apd.addAccentuation(1.0, 1.0, 1.0, 1.0);
            const all = apd.getAllAccentuations();
            expect(all.length).toBe(1);
            expect(all[0].getValue()).toBe(apd.getAccentuationXml(index));
        });

        it('setLength updates the field and the xml attribute', () => {
            const apd = AccentuationPatternDef.createAccentuationPatternDef('4/4', 4.0)!;
            apd.setLength(3.0);
            expect(apd.getLength()).toBe(3.0);
            expect(apd.getXml()!.getAttributeValue('length')).toBe('3');
        });
    });

    describe('removeAccentuation', () => {
        it('drops the entry from the list and the xml', () => {
            const apd = AccentuationPatternDef.createAccentuationPatternDef('4/4', 4.0)!;
            apd.addAccentuation(1.0, 1.0, 1.0, 1.0);
            apd.addAccentuation(2.0, 0.2, 0.2, 0.2);
            apd.removeAccentuation(0);
            expect(apd.size()).toBe(1);
            expect(apd.getAccentuationAttributes(0)![0]).toBe(2.0);
            expect(xmlBeats(apd)).toEqual(['2']);
        });

        it('ignores an out-of-range index', () => {
            const apd = AccentuationPatternDef.createAccentuationPatternDef('4/4', 4.0)!;
            apd.addAccentuation(1.0, 1.0, 1.0, 1.0);
            apd.removeAccentuation(5);
            expect(apd.size()).toBe(1);
        });
    });

    describe('getAccentuationAt', () => {
        function fourFour(): AccentuationPatternDef {
            // A 4/4 pattern with a strong first beat that fades out towards the next one.
            const apd = AccentuationPatternDef.createAccentuationPatternDef('4/4', 4.0)!;
            apd.addAccentuation(1.0, 1.0, 0.0, 1.0);
            apd.addAccentuation(3.0, 0.5, 0.5, 0.5);
            return apd;
        }

        it('returns 0 before the first accentuation', () => {
            expect(fourFour().getAccentuationAt(0.5)).toBe(0.0);
        });

        it('returns an accentuation value exactly at its beat', () => {
            const apd = fourFour();
            expect(apd.getAccentuationAt(1.0)).toBe(1.0);
            expect(apd.getAccentuationAt(3.0)).toBe(0.5);
        });

        it('returns the last transition.to at or beyond length + 1', () => {
            const apd = AccentuationPatternDef.createAccentuationPatternDef('4/4', 4.0)!;
            apd.addAccentuation(1.0, 1.0, 1.0, 1.0);
            apd.addAccentuation(3.0, 0.5, 0.5, 0.25);
            expect(apd.getAccentuationAt(5.0)).toBe(0.25);
            expect(apd.getAccentuationAt(9.0)).toBe(0.25);
        });

        it('interpolates between transition.from and transition.to over the rest of the pattern', () => {
            // Java keeps segmentEnd at length + 1.0 (AccentuationPatternDef.java:317 tests
            // i > size-1, which can never hold), so the ramp always runs to the pattern end.
            // beat 1, transition.from 0.0, transition.to 1.0, length 4 => segmentEnd 5.
            // at 2.0: ((2-1) * (1-0)) / (5-1) + 0 = 0.25
            const apd = AccentuationPatternDef.createAccentuationPatternDef('4/4', 4.0)!;
            apd.addAccentuation(1.0, 1.0, 0.0, 1.0);
            expect(apd.getAccentuationAt(2.0)).toBeCloseTo(0.25, 10);
            expect(apd.getAccentuationAt(3.0)).toBeCloseTo(0.5, 10);
            expect(apd.getAccentuationAt(4.0)).toBeCloseTo(0.75, 10);
        });

        it('interpolates from the nearest preceding accentuation', () => {
            // Between beat 3 and the pattern end the ramp of the beat-3 accentuation applies:
            // transition.from 0.5, transition.to 0.1, segmentEnd 5 => at 4.0:
            // ((4-3) * (0.1-0.5)) / (5-3) + 0.5 = -0.2 + 0.5 = 0.3
            const apd = AccentuationPatternDef.createAccentuationPatternDef('4/4', 4.0)!;
            apd.addAccentuation(1.0, 1.0, 1.0, 1.0);
            apd.addAccentuation(3.0, 0.5, 0.5, 0.1);
            expect(apd.getAccentuationAt(4.0)).toBeCloseTo(0.3, 10);
        });

        it('yields a flat value when transition.from equals transition.to', () => {
            const apd = AccentuationPatternDef.createAccentuationPatternDef('4/4', 4.0)!;
            apd.addAccentuation(1.0, 1.0, 0.7, 0.7);
            expect(apd.getAccentuationAt(2.5)).toBeCloseTo(0.7, 10);
        });
    });
});
