import { describe, it, expect, vi } from 'vitest';
import { TempoStyle } from '../../../../src/mpm/elements/styles/TempoStyle.js';
import { DynamicsStyle } from '../../../../src/mpm/elements/styles/DynamicsStyle.js';
import { ArticulationStyle } from '../../../../src/mpm/elements/styles/ArticulationStyle.js';
import { RubatoStyle } from '../../../../src/mpm/elements/styles/RubatoStyle.js';
import { MetricalAccentuationStyle } from '../../../../src/mpm/elements/styles/MetricalAccentuationStyle.js';
import { TempoDef } from '../../../../src/mpm/elements/styles/defs/TempoDef.js';
import { DynamicsDef } from '../../../../src/mpm/elements/styles/defs/DynamicsDef.js';
import { Element, Attribute } from '../../../../src/xml/XomTypes.js';
import { Mpm } from '../../../../src/mpm/Mpm.js';

/**
 * Reference: meico/src/meico/mpm/elements/styles/{TempoStyle,DynamicsStyle,
 * ArticulationStyle,RubatoStyle,MetricalAccentuationStyle}.java
 */
function element(name: string, attributes: Record<string, string>, children: Element[] = []): Element {
    const e = new Element(name, Mpm.MPM_NAMESPACE);
    for (const [attName, value] of Object.entries(attributes))
        e.addAttribute(new Attribute(attName, value));
    for (const c of children) e.appendChild(c);
    return e;
}

function styleDefElement(name: string, children: Element[] = []): Element {
    return element('styleDef', { name }, children);
}

/** Runs body with console.error silenced. */
function quiet<T>(body: () => T): T {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
        return body();
    } finally {
        err.mockRestore();
    }
}

describe('TempoStyle', () => {
    it('creates an empty style from a name', () => {
        const ts = TempoStyle.createTempoStyle('default')!;
        expect(ts.getName()).toBe('default');
        expect(ts.size()).toBe(0);
        expect(ts.getXml()!.getLocalName()).toBe('styleDef');
    });

    it('accepts an id as second argument', () => {
        expect(TempoStyle.createTempoStyle('default', 'ts-1')!.getId()).toBe('ts-1');
    });

    it('parses tempoDef children into the lookup table', () => {
        const ts = TempoStyle.createTempoStyle(styleDefElement('default', [
            element('tempoDef', { name: 'Allegro', value: '147.0' }),
            element('tempoDef', { name: 'Largo', value: '50.0' }),
        ]))!;
        expect(ts.size()).toBe(2);
        expect(ts.getDef('Allegro')!.getValue()).toBe(147.0);
        expect(ts.getDef('Largo')!.getValue()).toBe(50.0);
    });

    it('skips malformed tempoDef children', () => {
        const ts = quiet(() => TempoStyle.createTempoStyle(styleDefElement('default', [
            element('tempoDef', { name: 'Broken' }),
            element('tempoDef', { name: 'Allegro', value: '147.0' }),
        ])))!;
        expect(ts.size()).toBe(1);
        expect(ts.getDef('Allegro')).toBeDefined();
    });

    it('ignores children that are not tempoDefs', () => {
        const ts = TempoStyle.createTempoStyle(styleDefElement('default', [
            element('dynamicsDef', { name: 'f', value: '97.0' }),
        ]))!;
        expect(ts.size()).toBe(0);
    });

    it('returns null when the name attribute is missing', () => {
        expect(quiet(() => TempoStyle.createTempoStyle(element('styleDef', {})))).toBeNull();
    });

    describe('getNumericBpmValue', () => {
        function style(): TempoStyle {
            const ts = TempoStyle.createTempoStyle('default')!;
            ts.addDef(TempoDef.createTempoDef('Allegro', 147.0)!);
            return ts;
        }

        it('resolves a known tempoDef name', () => {
            expect(style().getNumericBpmValue('Allegro')).toBe(147.0);
        });

        it('parses a plain numeric string when no def matches', () => {
            expect(style().getNumericBpmValue('132.5')).toBe(132.5);
        });

        it('falls back to 100 bpm for an unresolvable string', () => {
            expect(quiet(() => style().getNumericBpmValue('schnell'))).toBe(100.0);
        });

        it('prefers the def over a numeric reading of the same string', () => {
            const ts = TempoStyle.createTempoStyle('default')!;
            ts.addDef(TempoDef.createTempoDef('60', 90.0)!);
            expect(ts.getNumericBpmValue('60')).toBe(90.0);
        });
    });

    describe('getNumericBpmValueStatic', () => {
        it('resolves through the given style', () => {
            const ts = TempoStyle.createTempoStyle('default')!;
            ts.addDef(TempoDef.createTempoDef('Allegro', 147.0)!);
            expect(TempoStyle.getNumericBpmValueStatic('Allegro', ts)).toBe(147.0);
        });

        it('still parses numbers when the style is null', () => {
            expect(TempoStyle.getNumericBpmValueStatic('132.5', null)).toBe(132.5);
        });

        it('falls back to 100 bpm when the style is null and the string is not numeric', () => {
            expect(quiet(() => TempoStyle.getNumericBpmValueStatic('Allegro', null))).toBe(100.0);
        });

        it('falls back to 100 bpm when the style has no matching def', () => {
            const ts = TempoStyle.createTempoStyle('default')!;
            expect(quiet(() => TempoStyle.getNumericBpmValueStatic('Allegro', ts))).toBe(100.0);
        });
    });
});

describe('DynamicsStyle', () => {
    it('creates an empty style from a name', () => {
        const ds = DynamicsStyle.createDynamicsStyle('default')!;
        expect(ds.getName()).toBe('default');
        expect(ds.size()).toBe(0);
    });

    it('accepts an id as second argument', () => {
        expect(DynamicsStyle.createDynamicsStyle('default', 'ds-1')!.getId()).toBe('ds-1');
    });

    it('parses dynamicsDef children into the lookup table', () => {
        const ds = DynamicsStyle.createDynamicsStyle(styleDefElement('default', [
            element('dynamicsDef', { name: 'ff', value: '111.0' }),
            element('dynamicsDef', { name: 'pp', value: '36.0' }),
        ]))!;
        expect(ds.size()).toBe(2);
        expect(ds.getDef('ff')!.getValue()).toBe(111.0);
    });

    it('skips malformed dynamicsDef children', () => {
        const ds = quiet(() => DynamicsStyle.createDynamicsStyle(styleDefElement('default', [
            element('dynamicsDef', { name: 'broken' }),
            element('dynamicsDef', { name: 'pp', value: '36.0' }),
        ])))!;
        expect(ds.size()).toBe(1);
    });

    it('returns null when the name attribute is missing', () => {
        expect(quiet(() => DynamicsStyle.createDynamicsStyle(element('styleDef', {})))).toBeNull();
    });

    describe('getNumericValue', () => {
        function style(): DynamicsStyle {
            const ds = DynamicsStyle.createDynamicsStyle('default')!;
            ds.addDef(DynamicsDef.createDynamicsDef('ff', 111.0)!);
            return ds;
        }

        it('resolves a known dynamicsDef name', () => {
            expect(style().getNumericValue('ff')).toBe(111.0);
        });

        it('parses a plain numeric string when no def matches', () => {
            expect(style().getNumericValue('64')).toBe(64.0);
        });

        it('falls back to 100 for an unresolvable string', () => {
            expect(quiet(() => style().getNumericValue('laut'))).toBe(100.0);
        });
    });

    describe('getNumericValueStatic', () => {
        it('resolves through the given style', () => {
            const ds = DynamicsStyle.createDynamicsStyle('default')!;
            ds.addDef(DynamicsDef.createDynamicsDef('ff', 111.0)!);
            expect(DynamicsStyle.getNumericValueStatic('ff', ds)).toBe(111.0);
        });

        it('still parses numbers when the style is null', () => {
            expect(DynamicsStyle.getNumericValueStatic('64', null)).toBe(64.0);
        });

        it('falls back to 100 when the style is null and the string is not numeric', () => {
            expect(quiet(() => DynamicsStyle.getNumericValueStatic('ff', null))).toBe(100.0);
        });

        it('falls back to 100 when the style has no matching def', () => {
            const ds = DynamicsStyle.createDynamicsStyle('default')!;
            expect(quiet(() => DynamicsStyle.getNumericValueStatic('ff', ds))).toBe(100.0);
        });
    });
});

describe('ArticulationStyle', () => {
    it('creates an empty style from a name', () => {
        const as = ArticulationStyle.createArticulationStyle('default')!;
        expect(as.getName()).toBe('default');
        expect(as.size()).toBe(0);
    });

    it('accepts an id as second argument', () => {
        expect(ArticulationStyle.createArticulationStyle('default', 'as-1')!.getId()).toBe('as-1');
    });

    it('parses articulationDef children into the lookup table', () => {
        const as = ArticulationStyle.createArticulationStyle(styleDefElement('default', [
            element('articulationDef', { name: 'staccato', absoluteDurationMs: '160.0' }),
            element('articulationDef', { name: 'tenuto', relativeDuration: '0.9' }),
        ]))!;
        expect(as.size()).toBe(2);
        expect(as.getDef('staccato')!.getAbsoluteDurationMs()).toBe(160.0);
        expect(as.getDef('tenuto')!.getRelativeDuration()).toBe(0.9);
    });

    it('skips articulationDef children without a name', () => {
        const as = quiet(() => ArticulationStyle.createArticulationStyle(styleDefElement('default', [
            element('articulationDef', { relativeDuration: '0.9' }),
            element('articulationDef', { name: 'tenuto', relativeDuration: '0.9' }),
        ])))!;
        expect(as.size()).toBe(1);
    });

    it('returns null when the name attribute is missing', () => {
        expect(quiet(() => ArticulationStyle.createArticulationStyle(element('styleDef', {})))).toBeNull();
    });
});

describe('RubatoStyle', () => {
    it('creates an empty style from a name', () => {
        const rs = RubatoStyle.createRubatoStyle('default')!;
        expect(rs.getName()).toBe('default');
        expect(rs.size()).toBe(0);
        expect(rs.getXml()!.getLocalName()).toBe('styleDef');
    });

    it('accepts an id as second argument', () => {
        expect(RubatoStyle.createRubatoStyle('default', 'rs-1')!.getId()).toBe('rs-1');
    });

    it('parses rubatoDef children into the lookup table', () => {
        const rs = RubatoStyle.createRubatoStyle(styleDefElement('default', [
            element('rubatoDef', { name: 'gentle', frameLength: '720.0', intensity: '1.2', lateStart: '0.1', earlyEnd: '0.9' }),
            element('rubatoDef', { name: 'plain', frameLength: '360.0' }),
        ]))!;
        expect(rs.size()).toBe(2);

        const gentle = rs.getDef('gentle')!;
        expect(gentle.getFrameLength()).toBe(720.0);
        expect(gentle.getIntensity()).toBe(1.2);
        expect(gentle.getLateStart()).toBe(0.1);
        expect(gentle.getEarlyEnd()).toBe(0.9);

        const plain = rs.getDef('plain')!;
        expect(plain.getIntensity()).toBe(1.0);
        expect(plain.getLateStart()).toBe(0.0);
        expect(plain.getEarlyEnd()).toBe(1.0);
    });

    it('skips rubatoDef children without a frameLength', () => {
        const rs = quiet(() => RubatoStyle.createRubatoStyle(styleDefElement('default', [
            element('rubatoDef', { name: 'broken' }),
            element('rubatoDef', { name: 'plain', frameLength: '360.0' }),
        ])))!;
        expect(rs.size()).toBe(1);
        expect(rs.getDef('plain')).toBeDefined();
    });

    it('ignores children that are not rubatoDefs', () => {
        const rs = RubatoStyle.createRubatoStyle(styleDefElement('default', [
            element('tempoDef', { name: 'Allegro', value: '147.0' }),
        ]))!;
        expect(rs.size()).toBe(0);
    });

    it('returns null when the name attribute is missing', () => {
        expect(quiet(() => RubatoStyle.createRubatoStyle(element('styleDef', {})))).toBeNull();
    });
});

describe('MetricalAccentuationStyle', () => {
    it('creates an empty style from a name', () => {
        const mas = MetricalAccentuationStyle.createMetricalAccentuationStyle('default')!;
        expect(mas.getName()).toBe('default');
        expect(mas.size()).toBe(0);
        expect(mas.getXml()!.getLocalName()).toBe('styleDef');
    });

    it('accepts an id as second argument', () => {
        expect(MetricalAccentuationStyle.createMetricalAccentuationStyle('default', 'mas-1')!.getId()).toBe('mas-1');
    });

    it('parses accentuationPatternDef children including their accentuations', () => {
        const mas = MetricalAccentuationStyle.createMetricalAccentuationStyle(styleDefElement('default', [
            element('accentuationPatternDef', { name: '4/4', length: '4.0' }, [
                element('accentuation', { beat: '1.0', value: '1.0' }),
                element('accentuation', { beat: '3.0', value: '0.5' }),
            ]),
            element('accentuationPatternDef', { name: '3/4', length: '3.0' }),
        ]))!;

        expect(mas.size()).toBe(2);
        const fourFour = mas.getDef('4/4')!;
        expect(fourFour.getLength()).toBe(4.0);
        expect(fourFour.size()).toBe(2);
        expect(fourFour.getAccentuationAt(1.0)).toBe(1.0);
        expect(mas.getDef('3/4')!.size()).toBe(0);
    });

    it('skips accentuationPatternDef children without a name', () => {
        const mas = quiet(() => MetricalAccentuationStyle.createMetricalAccentuationStyle(styleDefElement('default', [
            element('accentuationPatternDef', { length: '4.0' }),
            element('accentuationPatternDef', { name: '3/4', length: '3.0' }),
        ])))!;
        expect(mas.size()).toBe(1);
        expect(mas.getDef('3/4')).toBeDefined();
    });

    it('ignores children that are not accentuationPatternDefs', () => {
        const mas = MetricalAccentuationStyle.createMetricalAccentuationStyle(styleDefElement('default', [
            element('rubatoDef', { name: 'plain', frameLength: '360.0' }),
        ]))!;
        expect(mas.size()).toBe(0);
    });

    it('returns null when the name attribute is missing', () => {
        expect(quiet(() => MetricalAccentuationStyle.createMetricalAccentuationStyle(element('styleDef', {})))).toBeNull();
    });
});
