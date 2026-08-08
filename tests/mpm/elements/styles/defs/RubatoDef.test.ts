import { describe, it, expect, vi } from 'vitest';
import { RubatoDef } from '../../../../../src/mpm/elements/styles/defs/RubatoDef.js';
import { Element, Attribute } from '../../../../../src/xml/XomTypes.js';
import { Mpm } from '../../../../../src/mpm/Mpm.js';

/**
 * Reference: meico/src/meico/mpm/elements/styles/defs/RubatoDef.java
 */
function rubatoDefElement(attributes: Record<string, string>): Element {
    const e = new Element('rubatoDef', Mpm.MPM_NAMESPACE);
    for (const [name, value] of Object.entries(attributes))
        e.addAttribute(new Attribute(name, value));
    return e;
}

/** Runs body with console.error silenced; the boundary checks are chatty by design. */
function quiet<T>(body: () => T): T {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
        return body();
    } finally {
        err.mockRestore();
    }
}

describe('RubatoDef', () => {
    describe('createRubatoDef from name and frameLength', () => {
        it('applies the documented defaults for the optional attributes', () => {
            const rd = RubatoDef.createRubatoDef('rubato1', 720.0)!;
            expect(rd.getName()).toBe('rubato1');
            expect(rd.getFrameLength()).toBe(720.0);
            expect(rd.getIntensity()).toBe(1.0);
            expect(rd.getLateStart()).toBe(0.0);
            expect(rd.getEarlyEnd()).toBe(1.0);
        });

        it('writes the defaulted attributes into the xml', () => {
            const rd = RubatoDef.createRubatoDef('rubato1', 720.0)!;
            const xml = rd.getXml()!;
            expect(xml.getLocalName()).toBe('rubatoDef');
            expect(xml.getNamespaceURI()).toBe(Mpm.MPM_NAMESPACE);
            expect(xml.getAttributeValue('frameLength')).toBe('720');
            expect(xml.getAttributeValue('intensity')).toBe('1');
            expect(xml.getAttributeValue('lateStart')).toBe('0');
            expect(xml.getAttributeValue('earlyEnd')).toBe('1');
        });
    });

    describe('createRubatoDef from all five values', () => {
        it('keeps values that are already within their boundaries', () => {
            const rd = RubatoDef.createRubatoDef('rubato2', 360.0, 2.0, 0.1, 0.9)!;
            expect(rd.getFrameLength()).toBe(360.0);
            expect(rd.getIntensity()).toBe(2.0);
            expect(rd.getLateStart()).toBe(0.1);
            expect(rd.getEarlyEnd()).toBe(0.9);
        });
    });

    describe('createRubatoDef from xml', () => {
        it('requires the frameLength attribute', () => {
            const rd = quiet(() => RubatoDef.createRubatoDef(rubatoDefElement({ name: 'r' })));
            expect(rd).toBeNull();
        });

        it('requires the name attribute', () => {
            const rd = quiet(() => RubatoDef.createRubatoDef(rubatoDefElement({ frameLength: '720' })));
            expect(rd).toBeNull();
        });

        it('adds the missing optional attributes to the element it was given', () => {
            const xml = rubatoDefElement({ name: 'r', frameLength: '720' });
            const rd = RubatoDef.createRubatoDef(xml)!;
            expect(rd.getXml()).toBe(xml);
            expect(xml.getAttributeValue('intensity')).toBe('1');
            expect(xml.getAttributeValue('lateStart')).toBe('0');
            expect(xml.getAttributeValue('earlyEnd')).toBe('1');
        });

        it('reads an existing xml:id', () => {
            const xml = rubatoDefElement({ name: 'r', frameLength: '720' });
            xml.addAttribute(new Attribute('xml:id', 'http://www.w3.org/XML/1998/namespace', 'rub-1'));
            expect(RubatoDef.createRubatoDef(xml)!.getId()).toBe('rub-1');
        });

        it('returns null for a null element', () => {
            expect(quiet(() => RubatoDef.createRubatoDef(null as unknown as Element))).toBeNull();
        });

        it('reads an element that is not named rubatoDef', () => {
            // Java renames such an element (RubatoDef.java:122-124); the port cannot, because
            // its Element class has no setLocalName. The parsed values are the same either way.
            const foreign = new Element('somethingElse', Mpm.MPM_NAMESPACE);
            foreign.addAttribute(new Attribute('name', 'r'));
            foreign.addAttribute(new Attribute('frameLength', '720'));
            const rd = RubatoDef.createRubatoDef(foreign)!;
            expect(rd.getName()).toBe('r');
            expect(rd.getFrameLength()).toBe(720.0);
        });
    });

    describe('parseData', () => {
        it('re-reads all attributes when applied to another element', () => {
            const rd = RubatoDef.createRubatoDef('r', 720.0)!;
            const other = rubatoDefElement({ name: 'other', frameLength: '360', intensity: '2.0', lateStart: '0.2', earlyEnd: '0.7' });
            (rd as unknown as { parseData(xml: Element): void }).parseData(other);

            expect(rd.getName()).toBe('other');
            expect(rd.getFrameLength()).toBe(360.0);
            expect(rd.getIntensity()).toBe(2.0);
            expect(rd.getLateStart()).toBe(0.2);
            expect(rd.getEarlyEnd()).toBe(0.7);
            expect(rd.getXml()).toBe(other);
        });
    });

    describe('intensity boundaries while parsing', () => {
        it('replaces an intensity of 0 by 0.01', () => {
            const xml = rubatoDefElement({ name: 'r', frameLength: '720', intensity: '0.0' });
            const rd = quiet(() => RubatoDef.createRubatoDef(xml))!;
            expect(rd.getIntensity()).toBe(0.01);
            expect(xml.getAttributeValue('intensity')).toBe('0.01');
        });

        it('inverts a negative intensity', () => {
            const xml = rubatoDefElement({ name: 'r', frameLength: '720', intensity: '-2.5' });
            const rd = quiet(() => RubatoDef.createRubatoDef(xml))!;
            expect(rd.getIntensity()).toBe(2.5);
            expect(xml.getAttributeValue('intensity')).toBe('2.5');
        });
    });

    describe('lateStart / earlyEnd boundaries while parsing', () => {
        it('lifts a negative lateStart to 0', () => {
            const xml = rubatoDefElement({ name: 'r', frameLength: '720', lateStart: '-0.3', earlyEnd: '0.8' });
            const rd = quiet(() => RubatoDef.createRubatoDef(xml))!;
            expect(rd.getLateStart()).toBe(0.0);
            expect(rd.getEarlyEnd()).toBe(0.8);
            expect(xml.getAttributeValue('lateStart')).toBe('0');
        });

        it('caps an earlyEnd above 1 at 1', () => {
            const xml = rubatoDefElement({ name: 'r', frameLength: '720', lateStart: '0.2', earlyEnd: '1.5' });
            const rd = quiet(() => RubatoDef.createRubatoDef(xml))!;
            expect(rd.getLateStart()).toBe(0.2);
            expect(rd.getEarlyEnd()).toBe(1.0);
            expect(xml.getAttributeValue('earlyEnd')).toBe('1');
        });

        it('resets both to 0 and 1 when lateStart is not before earlyEnd', () => {
            const xml = rubatoDefElement({ name: 'r', frameLength: '720', lateStart: '0.9', earlyEnd: '0.4' });
            const rd = quiet(() => RubatoDef.createRubatoDef(xml))!;
            expect(rd.getLateStart()).toBe(0.0);
            expect(rd.getEarlyEnd()).toBe(1.0);
        });

        it('resets both when lateStart equals earlyEnd', () => {
            const rd = quiet(() => RubatoDef.createRubatoDef('r', 720.0, 1.0, 0.5, 0.5))!;
            expect(rd.getLateStart()).toBe(0.0);
            expect(rd.getEarlyEnd()).toBe(1.0);
        });
    });

    describe('setFrameLength', () => {
        it('stores the value in the field and the xml', () => {
            const rd = RubatoDef.createRubatoDef('r', 720.0)!;
            rd.setFrameLength(480.0);
            expect(rd.getFrameLength()).toBe(480.0);
            expect(rd.getXml()!.getAttributeValue('frameLength')).toBe('480');
        });

        it('clamps a negative frameLength to 0', () => {
            const rd = RubatoDef.createRubatoDef('r', 720.0)!;
            rd.setFrameLength(-100.0);
            expect(rd.getFrameLength()).toBe(0.0);
            expect(rd.getXml()!.getAttributeValue('frameLength')).toBe('0');
        });
    });

    describe('setIntensity', () => {
        it('stores a valid intensity', () => {
            const rd = RubatoDef.createRubatoDef('r', 720.0)!;
            rd.setIntensity(3.0);
            expect(rd.getIntensity()).toBe(3.0);
            expect(rd.getXml()!.getAttributeValue('intensity')).toBe('3');
        });

        it('applies the same boundary rules as the parser', () => {
            const rd = RubatoDef.createRubatoDef('r', 720.0)!;
            quiet(() => rd.setIntensity(0.0));
            expect(rd.getIntensity()).toBe(0.01);
            quiet(() => rd.setIntensity(-4.0));
            expect(rd.getIntensity()).toBe(4.0);
        });
    });

    describe('setLateStart', () => {
        it('stores a lateStart that is before earlyEnd', () => {
            const rd = RubatoDef.createRubatoDef('r', 720.0)!;
            rd.setLateStart(0.25);
            expect(rd.getLateStart()).toBe(0.25);
            expect(rd.getXml()!.getAttributeValue('lateStart')).toBe('0.25');
        });

        it('refuses a lateStart at or beyond earlyEnd and leaves the value untouched', () => {
            const rd = RubatoDef.createRubatoDef('r', 720.0, 1.0, 0.1, 0.6)!;
            quiet(() => rd.setLateStart(0.6));
            expect(rd.getLateStart()).toBe(0.1);
            expect(rd.getXml()!.getAttributeValue('lateStart')).toBe('0.1');
        });

        it('lifts a negative lateStart to 0', () => {
            const rd = RubatoDef.createRubatoDef('r', 720.0)!;
            quiet(() => rd.setLateStart(-0.5));
            expect(rd.getLateStart()).toBe(0.0);
        });
    });

    describe('setEarlyEnd', () => {
        it('stores an earlyEnd that is after lateStart', () => {
            const rd = RubatoDef.createRubatoDef('r', 720.0)!;
            rd.setEarlyEnd(0.75);
            expect(rd.getEarlyEnd()).toBe(0.75);
            expect(rd.getXml()!.getAttributeValue('earlyEnd')).toBe('0.75');
        });

        it('refuses an earlyEnd at or below lateStart and leaves the value untouched', () => {
            const rd = RubatoDef.createRubatoDef('r', 720.0, 1.0, 0.4, 0.9)!;
            quiet(() => rd.setEarlyEnd(0.4));
            expect(rd.getEarlyEnd()).toBe(0.9);
        });

        it('caps an earlyEnd above 1 at 1', () => {
            const rd = RubatoDef.createRubatoDef('r', 720.0, 1.0, 0.0, 0.5)!;
            quiet(() => rd.setEarlyEnd(2.0));
            expect(rd.getEarlyEnd()).toBe(1.0);
        });
    });

    describe('setLateStartAndEarlyEnd', () => {
        it('sets both values at once', () => {
            const rd = RubatoDef.createRubatoDef('r', 720.0)!;
            rd.setLateStartAndEarlyEnd(0.2, 0.8);
            expect(rd.getLateStart()).toBe(0.2);
            expect(rd.getEarlyEnd()).toBe(0.8);
            expect(rd.getXml()!.getAttributeValue('lateStart')).toBe('0.2');
            expect(rd.getXml()!.getAttributeValue('earlyEnd')).toBe('0.8');
        });

        it('accepts a swap that setLateStart alone would reject', () => {
            // 0.7 is beyond the current earlyEnd of 0.5, which setLateStart would refuse,
            // but the combined setter validates the new pair as a whole.
            const rd = RubatoDef.createRubatoDef('r', 720.0, 1.0, 0.1, 0.5)!;
            rd.setLateStartAndEarlyEnd(0.7, 0.95);
            expect(rd.getLateStart()).toBe(0.7);
            expect(rd.getEarlyEnd()).toBe(0.95);
        });

        it('falls back to 0 and 1 for an inconsistent pair', () => {
            const rd = RubatoDef.createRubatoDef('r', 720.0, 1.0, 0.2, 0.8)!;
            quiet(() => rd.setLateStartAndEarlyEnd(0.9, 0.3));
            expect(rd.getLateStart()).toBe(0.0);
            expect(rd.getEarlyEnd()).toBe(1.0);
        });

        it('clamps each value independently before comparing them', () => {
            const rd = RubatoDef.createRubatoDef('r', 720.0)!;
            quiet(() => rd.setLateStartAndEarlyEnd(-0.5, 3.0));
            expect(rd.getLateStart()).toBe(0.0);
            expect(rd.getEarlyEnd()).toBe(1.0);
        });
    });

    describe('id handling', () => {
        it('round-trips an id', () => {
            const rd = RubatoDef.createRubatoDef('r', 720.0)!;
            expect(rd.getId()).toBeNull();
            rd.setId('rub-7');
            expect(rd.getId()).toBe('rub-7');
            rd.setId(null);
            expect(rd.getId()).toBeNull();
        });
    });
});
