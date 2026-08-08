import { describe, it, expect, vi } from 'vitest';
import { DynamicsDef } from '../../../../../src/mpm/elements/styles/defs/DynamicsDef.js';
import { Element, Attribute } from '../../../../../src/xml/XomTypes.js';
import { Mpm } from '../../../../../src/mpm/Mpm.js';

/**
 * Reference: meico/src/meico/mpm/elements/styles/defs/DynamicsDef.java
 */
function dynamicsDefElement(attributes: Record<string, string>): Element {
    const e = new Element('dynamicsDef', Mpm.MPM_NAMESPACE);
    for (const [name, value] of Object.entries(attributes))
        e.addAttribute(new Attribute(name, value));
    return e;
}

describe('DynamicsDef', () => {
    describe('createDynamicsDef from name and value', () => {
        it('stores name and value and builds a dynamicsDef element', () => {
            const dd = DynamicsDef.createDynamicsDef('forte', 97.0)!;
            expect(dd.getName()).toBe('forte');
            expect(dd.getValue()).toBe(97.0);
            expect(dd.getXml()!.getLocalName()).toBe('dynamicsDef');
            expect(dd.getXml()!.getNamespaceURI()).toBe(Mpm.MPM_NAMESPACE);
            expect(dd.getXml()!.getAttributeValue('value')).toBe('97');
        });
    });

    describe('createDynamicsDef from xml', () => {
        it('reads name and value off the element', () => {
            const dd = DynamicsDef.createDynamicsDef(dynamicsDefElement({ name: 'pp', value: '36.0' }))!;
            expect(dd.getName()).toBe('pp');
            expect(dd.getValue()).toBe(36.0);
            expect(dd.getId()).toBeNull();
        });

        it('returns null when the value attribute is missing', () => {
            const err = vi.spyOn(console, 'error').mockImplementation(() => {});
            expect(DynamicsDef.createDynamicsDef(dynamicsDefElement({ name: 'pp' }))).toBeNull();
            expect(err).toHaveBeenCalled();
            err.mockRestore();
        });

        it('returns null when the name attribute is missing', () => {
            const err = vi.spyOn(console, 'error').mockImplementation(() => {});
            expect(DynamicsDef.createDynamicsDef(dynamicsDefElement({ value: '36.0' }))).toBeNull();
            expect(err).toHaveBeenCalled();
            err.mockRestore();
        });

        it('returns null for a null element', () => {
            const err = vi.spyOn(console, 'error').mockImplementation(() => {});
            expect(DynamicsDef.createDynamicsDef(null as unknown as Element)).toBeNull();
            expect(err).toHaveBeenCalled();
            err.mockRestore();
        });
    });

    describe('parseData', () => {
        it('re-reads name, value and xml when applied to another element', () => {
            const dd = DynamicsDef.createDynamicsDef('forte', 97.0)!;
            const other = dynamicsDefElement({ name: 'pp', value: '36.0' });
            (dd as unknown as { parseData(xml: Element): void }).parseData(other);

            expect(dd.getName()).toBe('pp');
            expect(dd.getValue()).toBe(36.0);
            expect(dd.getXml()).toBe(other);
        });
    });

    describe('setValue', () => {
        it('updates the field and the xml attribute', () => {
            const dd = DynamicsDef.createDynamicsDef('forte', 97.0)!;
            dd.setValue(101.5);
            expect(dd.getValue()).toBe(101.5);
            expect(dd.getXml()!.getAttributeValue('value')).toBe('101.5');
        });
    });

    describe('getDefaultVolumeLevel', () => {
        // Values are taken verbatim from DynamicsDef.java:123-160.
        const table: [string, number][] = [
            ['pppp', 5.0],
            ['pianissimopianissimo', 5.0],
            ['ppp', 12.0],
            ['pianopianissimo', 12.0],
            ['pp', 36.0],
            ['pianissimo', 36.0],
            ['p', 48.0],
            ['piano', 48.0],
            ['mp', 64.0],
            ['mezzopiano', 64.0],
            ['mf', 83.0],
            ['mezzoforte', 83.0],
            ['f', 97.0],
            ['forte', 97.0],
            ['ff', 111.0],
            ['fortissimo', 111.0],
            ['fff', 120.0],
            ['fortefortissimo', 120.0],
            ['ffff', 125.0],
            ['fortissimofortissimo', 125.0],
            ['sf', 127.0],
            ['sfz', 127.0],
            ['fz', 127.0],
            ['sforzato', 127.0],
        ];

        for (const [dynamics, level] of table) {
            it(`maps "${dynamics}" to ${level}`, () => {
                expect(DynamicsDef.getDefaultVolumeLevel(dynamics)).toBe(level);
            });
        }

        it('falls back to 74 for an unknown dynamics string', () => {
            expect(DynamicsDef.getDefaultVolumeLevel('lauter')).toBe(74.0);
        });

        it('trims and lowercases before matching', () => {
            expect(DynamicsDef.getDefaultVolumeLevel('  Forte ')).toBe(97.0);
            expect(DynamicsDef.getDefaultVolumeLevel('MF')).toBe(83.0);
        });

        it('matches whole strings only, unlike the tempo lookup', () => {
            // "molto forte" is not the token "forte", so it falls through to the default.
            expect(DynamicsDef.getDefaultVolumeLevel('molto forte')).toBe(74.0);
        });
    });

    describe('createDefaultDynamicsDef', () => {
        it('names the def after the dynamics string and resolves its value', () => {
            const dd = DynamicsDef.createDefaultDynamicsDef('mf')!;
            expect(dd.getName()).toBe('mf');
            expect(dd.getValue()).toBe(83.0);
        });

        it('uses the 74 fallback for unknown dynamics strings', () => {
            const dd = DynamicsDef.createDefaultDynamicsDef('irgendwas')!;
            expect(dd.getValue()).toBe(74.0);
        });
    });
});
