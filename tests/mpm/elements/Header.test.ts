import { describe, it, expect, vi } from 'vitest';
import { Mpm } from '../../../src/mpm/Mpm.js';
import { Header } from '../../../src/mpm/elements/Header.js';
import { TempoStyle } from '../../../src/mpm/elements/styles/TempoStyle.js';
import { DynamicsStyle } from '../../../src/mpm/elements/styles/DynamicsStyle.js';
import { ArticulationStyle } from '../../../src/mpm/elements/styles/ArticulationStyle.js';
import { RubatoStyle } from '../../../src/mpm/elements/styles/RubatoStyle.js';
import { MetricalAccentuationStyle } from '../../../src/mpm/elements/styles/MetricalAccentuationStyle.js';
import { OrnamentationStyle } from '../../../src/mpm/elements/styles/OrnamentationStyle.js';
import { GenericStyle } from '../../../src/mpm/elements/styles/GenericStyle.js';
import { TempoDef } from '../../../src/mpm/elements/styles/defs/TempoDef.js';
import { Element, Attribute } from '../../../src/xml/XomTypes.js';

/**
 * Reference: meico/src/meico/mpm/elements/Header.java
 */
function element(name: string, attributes: Record<string, string> = {}, children: Element[] = []): Element {
    const e = new Element(name, Mpm.MPM_NAMESPACE);
    for (const [attName, value] of Object.entries(attributes))
        e.addAttribute(new Attribute(attName, value));
    for (const c of children) e.appendChild(c);
    return e;
}

function styleDefElement(name: string, children: Element[] = []): Element {
    return element('styleDef', { name }, children);
}

/** local names of the header's child elements, in document order */
function childNames(header: Header): string[] {
    const children = header.getXml()!.getChildElements();
    const names: string[] = [];
    for (let i = 0; i < children.size(); ++i) names.push(children.get(i).getLocalName());
    return names;
}

describe('Header', () => {
    describe('createHeader', () => {
        it('creates an empty header element', () => {
            const h = Header.createHeader()!;
            expect(h.getXml()!.getLocalName()).toBe('header');
            expect(h.getXml()!.getNamespaceURI()).toBe(Mpm.MPM_NAMESPACE);
            expect(h.getAllStyleTypes().size).toBe(0);
        });

        it('parses every ...Styles collection found below the header element', () => {
            const xml = element('header', {}, [
                element(Mpm.TEMPO_STYLE, {}, [styleDefElement('default', [
                    element('tempoDef', { name: 'Allegro', value: '147.0' }),
                ])]),
                element(Mpm.DYNAMICS_STYLE, {}, [styleDefElement('default', [
                    element('dynamicsDef', { name: 'ff', value: '111.0' }),
                ])]),
            ]);
            const h = Header.createHeader(xml)!;

            expect(h.getAllStyleTypes().size).toBe(2);
            const tempoStyle = h.getStyleDef(Mpm.TEMPO_STYLE, 'default') as TempoStyle;
            expect(tempoStyle).toBeInstanceOf(TempoStyle);
            expect(tempoStyle.getDef('Allegro')!.getValue()).toBe(147.0);
            expect(h.getStyleDef(Mpm.DYNAMICS_STYLE, 'default')).toBeInstanceOf(DynamicsStyle);
        });

        it('ignores header children whose name does not contain "Styles"', () => {
            const h = Header.createHeader(element('header', {}, [element('metadata')]))!;
            expect(h.getAllStyleTypes().size).toBe(0);
        });

        it('returns null for a null element', () => {
            const err = vi.spyOn(console, 'error').mockImplementation(() => {});
            expect(Header.createHeader(null as unknown as Element)).toBeNull();
            expect(err).toHaveBeenCalled();
            err.mockRestore();
        });
    });

    describe('addStyleType', () => {
        it('creates an empty collection for a type name', () => {
            const h = Header.createHeader()!;
            const map = h.addStyleType(Mpm.TEMPO_STYLE)!;
            expect(map.size).toBe(0);
            expect(h.getAllStyleDefs(Mpm.TEMPO_STYLE)).toBe(map);
            expect(childNames(h)).toEqual([Mpm.TEMPO_STYLE]);
        });

        it('rejects an empty type name', () => {
            expect(Header.createHeader()!.addStyleType('')).toBeNull();
        });

        it('builds the matching style class for each known type', () => {
            const cases: [string, string, Element[], Function][] = [
                [Mpm.ARTICULATION_STYLE, 'articulationDef', [element('articulationDef', { name: 'staccato' })], ArticulationStyle],
                [Mpm.TEMPO_STYLE, 'tempoDef', [element('tempoDef', { name: 'Allegro', value: '147.0' })], TempoStyle],
                [Mpm.DYNAMICS_STYLE, 'dynamicsDef', [element('dynamicsDef', { name: 'ff', value: '111.0' })], DynamicsStyle],
                [Mpm.METRICAL_ACCENTUATION_STYLE, 'accentuationPatternDef', [element('accentuationPatternDef', { name: '4/4', length: '4.0' })], MetricalAccentuationStyle],
                [Mpm.RUBATO_STYLE, 'rubatoDef', [element('rubatoDef', { name: 'r', frameLength: '720.0' })], RubatoStyle],
                [Mpm.ORNAMENTATION_STYLE, 'ornamentDef', [element('ornamentDef', { name: 'trill' })], OrnamentationStyle],
            ];

            for (const [type, , defs, styleClass] of cases) {
                const h = Header.createHeader()!;
                h.addStyleType(element(type, {}, [styleDefElement('default', defs)]));
                const style = h.getStyleDef(type, 'default')!;
                expect(style).toBeInstanceOf(styleClass);
                expect(style.size()).toBe(1);
            }
        });

        it('falls back to GenericStyle for an unknown type', () => {
            const h = Header.createHeader()!;
            h.addStyleType(element('somethingStyles', {}, [styleDefElement('default')]));
            const style = h.getStyleDef('somethingStyles', 'default')!;
            expect(style).toBeInstanceOf(GenericStyle);
            expect(style.getName()).toBe('default');
        });

        it('skips styleDef children without a name', () => {
            const err = vi.spyOn(console, 'error').mockImplementation(() => {});
            const h = Header.createHeader()!;
            const map = h.addStyleType(element(Mpm.TEMPO_STYLE, {}, [
                element('styleDef'),
                styleDefElement('default'),
            ]))!;
            expect(map.size).toBe(1);
            expect(map.has('default')).toBe(true);
            err.mockRestore();
        });

        it('replaces a style type that is already present', () => {
            const h = Header.createHeader()!;
            h.addStyleType(element(Mpm.TEMPO_STYLE, {}, [styleDefElement('first')]));
            h.addStyleType(element(Mpm.TEMPO_STYLE, {}, [styleDefElement('second')]));

            expect(h.getAllStyleDefs(Mpm.TEMPO_STYLE)!.size).toBe(1);
            expect(h.getStyleDef(Mpm.TEMPO_STYLE, 'first')).toBeNull();
            expect(h.getStyleDef(Mpm.TEMPO_STYLE, 'second')).not.toBeNull();
            expect(childNames(h)).toEqual([Mpm.TEMPO_STYLE]);
        });

        it('does not re-append a collection that is already a child of the header', () => {
            const collection = element(Mpm.TEMPO_STYLE, {}, [styleDefElement('default')]);
            const h = Header.createHeader(element('header', {}, [collection]))!;
            expect(childNames(h)).toEqual([Mpm.TEMPO_STYLE]);
            h.addStyleType(collection);
            expect(childNames(h)).toEqual([Mpm.TEMPO_STYLE]);
        });
    });

    describe('removeStyleType', () => {
        it('removes the collection from the map and the xml', () => {
            const h = Header.createHeader()!;
            h.addStyleType(Mpm.TEMPO_STYLE);
            h.addStyleType(Mpm.DYNAMICS_STYLE);
            h.removeStyleType(Mpm.TEMPO_STYLE);

            expect(h.getAllStyleDefs(Mpm.TEMPO_STYLE)).toBeUndefined();
            expect(childNames(h)).toEqual([Mpm.DYNAMICS_STYLE]);
        });

        it('ignores an unknown type', () => {
            const h = Header.createHeader()!;
            h.addStyleType(Mpm.TEMPO_STYLE);
            h.removeStyleType(Mpm.RUBATO_STYLE);
            expect(childNames(h)).toEqual([Mpm.TEMPO_STYLE]);
        });
    });

    describe('getStyleDef', () => {
        it('returns null for an unknown type', () => {
            expect(Header.createHeader()!.getStyleDef(Mpm.TEMPO_STYLE, 'default')).toBeNull();
        });

        it('returns null for an unknown name within a known type', () => {
            const h = Header.createHeader()!;
            h.addStyleType(Mpm.TEMPO_STYLE);
            expect(h.getStyleDef(Mpm.TEMPO_STYLE, 'default')).toBeNull();
        });
    });

    describe('addStyleDef by name', () => {
        it('creates the style type on the fly and returns the new styleDef', () => {
            const h = Header.createHeader()!;
            const style = h.addStyleDef(Mpm.TEMPO_STYLE, 'default') as TempoStyle;

            expect(style).toBeInstanceOf(TempoStyle);
            expect(style.getName()).toBe('default');
            expect(h.getStyleDef(Mpm.TEMPO_STYLE, 'default')).toBe(style);
            expect(childNames(h)).toEqual([Mpm.TEMPO_STYLE]);

            const collection = h.getXml()!.getFirstChildElement(Mpm.TEMPO_STYLE, Mpm.MPM_NAMESPACE)!;
            expect(collection.getChildElements().size()).toBe(1);
            expect(collection.getChildElements().get(0)).toBe(style.getXml());
        });

        it('creates the matching style class for each known type', () => {
            const cases: [string, Function][] = [
                [Mpm.DYNAMICS_STYLE, DynamicsStyle],
                [Mpm.ARTICULATION_STYLE, ArticulationStyle],
                [Mpm.METRICAL_ACCENTUATION_STYLE, MetricalAccentuationStyle],
                [Mpm.TEMPO_STYLE, TempoStyle],
                [Mpm.RUBATO_STYLE, RubatoStyle],
                [Mpm.ORNAMENTATION_STYLE, OrnamentationStyle],
                ['somethingStyles', GenericStyle],
            ];
            const h = Header.createHeader()!;
            for (const [type, styleClass] of cases)
                expect(h.addStyleDef(type, 'default')).toBeInstanceOf(styleClass);
        });

        it('replaces a styleDef of the same name', () => {
            const h = Header.createHeader()!;
            const first = h.addStyleDef(Mpm.TEMPO_STYLE, 'default') as TempoStyle;
            first.addDef(TempoDef.createTempoDef('Allegro', 147.0)!);
            const second = h.addStyleDef(Mpm.TEMPO_STYLE, 'default') as TempoStyle;

            expect(second).not.toBe(first);
            expect(h.getAllStyleDefs(Mpm.TEMPO_STYLE)!.size).toBe(1);
            expect(h.getStyleDef(Mpm.TEMPO_STYLE, 'default')).toBe(second);

            const collection = h.getXml()!.getFirstChildElement(Mpm.TEMPO_STYLE, Mpm.MPM_NAMESPACE)!;
            expect(collection.getChildElements().size()).toBe(1);
            expect(collection.getChildElements().get(0)).toBe(second.getXml());
        });
    });

    describe('addStyleDef by instance', () => {
        it('adds an existing style object', () => {
            const h = Header.createHeader()!;
            const style = TempoStyle.createTempoStyle('default')!;
            h.addStyleDef(Mpm.TEMPO_STYLE, style);
            expect(h.getStyleDef(Mpm.TEMPO_STYLE, 'default')).toBe(style);
        });

        it('ignores an empty type', () => {
            const h = Header.createHeader()!;
            h.addStyleDef('', TempoStyle.createTempoStyle('default')!);
            expect(h.getAllStyleTypes().size).toBe(0);
        });

        it('reuses an existing style type element', () => {
            const h = Header.createHeader()!;
            h.addStyleDef(Mpm.TEMPO_STYLE, TempoStyle.createTempoStyle('a')!);
            h.addStyleDef(Mpm.TEMPO_STYLE, TempoStyle.createTempoStyle('b')!);

            expect(childNames(h)).toEqual([Mpm.TEMPO_STYLE]);
            expect(h.getAllStyleDefs(Mpm.TEMPO_STYLE)!.size).toBe(2);
        });
    });

    describe('removeStyleDef', () => {
        it('removes the styleDef from the map and the xml', () => {
            const h = Header.createHeader()!;
            const a = h.addStyleDef(Mpm.TEMPO_STYLE, 'a')!;
            h.addStyleDef(Mpm.TEMPO_STYLE, 'b');
            h.removeStyleDef(Mpm.TEMPO_STYLE, 'a');

            expect(h.getStyleDef(Mpm.TEMPO_STYLE, 'a')).toBeNull();
            const collection = h.getXml()!.getFirstChildElement(Mpm.TEMPO_STYLE, Mpm.MPM_NAMESPACE)!;
            expect(collection.getChildElements().size()).toBe(1);
            expect(collection.getChildElements().get(0)).not.toBe(a.getXml());
        });

        it('ignores an empty type, an unknown type and an unknown name', () => {
            const h = Header.createHeader()!;
            h.addStyleDef(Mpm.TEMPO_STYLE, 'a');
            h.removeStyleDef('', 'a');
            h.removeStyleDef(Mpm.RUBATO_STYLE, 'a');
            h.removeStyleDef(Mpm.TEMPO_STYLE, 'nope');
            expect(h.getAllStyleDefs(Mpm.TEMPO_STYLE)!.size).toBe(1);
        });
    });

    describe('renameStyleDef', () => {
        it('renames the styleDef in the map and in the xml', () => {
            const h = Header.createHeader()!;
            const style = h.addStyleDef(Mpm.TEMPO_STYLE, 'old')!;
            const renamed = h.renameStyleDef(Mpm.TEMPO_STYLE, 'old', 'new');

            expect(renamed).toBe(style);
            expect(style.getName()).toBe('new');
            expect(style.getXml()!.getAttributeValue('name')).toBe('new');
            expect(h.getStyleDef(Mpm.TEMPO_STYLE, 'old')).toBeNull();
            expect(h.getStyleDef(Mpm.TEMPO_STYLE, 'new')).toBe(style);
        });

        it('returns the unchanged styleDef when old and new name are equal', () => {
            const h = Header.createHeader()!;
            const style = h.addStyleDef(Mpm.TEMPO_STYLE, 'same')!;
            expect(h.renameStyleDef(Mpm.TEMPO_STYLE, 'same', 'same')).toBe(style);
            expect(h.getAllStyleDefs(Mpm.TEMPO_STYLE)!.size).toBe(1);
        });

        it('overwrites a styleDef that already carries the new name', () => {
            const h = Header.createHeader()!;
            h.addStyleDef(Mpm.TEMPO_STYLE, 'victim');
            const survivor = h.addStyleDef(Mpm.TEMPO_STYLE, 'old')!;
            h.renameStyleDef(Mpm.TEMPO_STYLE, 'old', 'victim');

            expect(h.getAllStyleDefs(Mpm.TEMPO_STYLE)!.size).toBe(1);
            expect(h.getStyleDef(Mpm.TEMPO_STYLE, 'victim')).toBe(survivor);
        });

        it('returns null for an unknown style type', () => {
            const log = vi.spyOn(console, 'log').mockImplementation(() => {});
            expect(Header.createHeader()!.renameStyleDef(Mpm.TEMPO_STYLE, 'old', 'new')).toBeNull();
            log.mockRestore();
        });

        it('returns null for an unknown current name', () => {
            const log = vi.spyOn(console, 'log').mockImplementation(() => {});
            const h = Header.createHeader()!;
            h.addStyleDef(Mpm.TEMPO_STYLE, 'other');
            expect(h.renameStyleDef(Mpm.TEMPO_STYLE, 'old', 'new')).toBeNull();
            log.mockRestore();
        });
    });

    describe('clear', () => {
        it('drops every style type and every header child', () => {
            const h = Header.createHeader()!;
            h.addStyleDef(Mpm.TEMPO_STYLE, 'a');
            h.addStyleDef(Mpm.DYNAMICS_STYLE, 'b');
            h.clear();

            expect(h.getAllStyleTypes().size).toBe(0);
            expect(h.getXml()!.getChildCount()).toBe(0);
        });
    });
});
