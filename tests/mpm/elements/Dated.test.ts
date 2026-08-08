import { describe, it, expect } from 'vitest';
import { Dated } from '../../../src/mpm/elements/Dated.js';
import { Mpm } from '../../../src/mpm/Mpm.js';
import { Element } from '../../../src/xml/XomTypes.js';

describe('Dated', () => {
    // ---------------------------------------------------------------
    // creation
    // ---------------------------------------------------------------
    describe('createDated', () => {
        it('should create an empty dated environment', () => {
            const dated = Dated.createDated()!;

            expect(dated).not.toBeNull();
            expect(dated.getXml()!.getLocalName()).toBe('dated');
            expect(dated.getAllMaps().size).toBe(0);
        });

        it('should pick up the maps of an existing dated element', () => {
            const xml = new Element('dated', Mpm.MPM_NAMESPACE);
            xml.appendChild(new Element('tempoMap', Mpm.MPM_NAMESPACE));
            xml.appendChild(new Element('dynamicsMap', Mpm.MPM_NAMESPACE));

            const dated = Dated.createDated(xml)!;

            expect(dated.getAllMaps().size).toBe(2);
            expect(dated.getMap(Mpm.TEMPO_MAP)).not.toBeNull();
            expect(dated.getMap(Mpm.DYNAMICS_MAP)).not.toBeNull();
        });

        it('should return null for a null xml element', () => {
            expect(Dated.createDated(null as unknown as Element)).toBeNull();
        });
    });

    // ---------------------------------------------------------------
    // addMapByType
    // ---------------------------------------------------------------
    describe('addMapByType', () => {
        it('should create and attach a map of the requested type', () => {
            const dated = Dated.createDated()!;
            const map = dated.addMapByType(Mpm.TEMPO_MAP);

            expect(map).not.toBeNull();
            expect(map!.getType()).toBe(Mpm.TEMPO_MAP);
            expect(dated.getMap(Mpm.TEMPO_MAP)).toBe(map);
            expect(dated.getXml()!.getFirstChildElement('tempoMap')).not.toBeNull();
        });

        it('should return null for an empty type string', () => {
            const dated = Dated.createDated()!;

            expect(dated.addMapByType('')).toBeNull();
            expect(dated.getAllMaps().size).toBe(0);
        });

        it('should replace an existing map of the same type', () => {
            const dated = Dated.createDated()!;
            const first = dated.addMapByType(Mpm.TEMPO_MAP)!;
            const second = dated.addMapByType(Mpm.TEMPO_MAP)!;

            expect(second).not.toBe(first);
            expect(dated.getMap(Mpm.TEMPO_MAP)).toBe(second);
            expect(dated.getAllMaps().size).toBe(1);
            expect(dated.getXml()!.getChildElements('tempoMap').size()).toBe(1);
        });

        it('should keep maps of different types side by side', () => {
            const dated = Dated.createDated()!;
            dated.addMapByType(Mpm.TEMPO_MAP);
            dated.addMapByType(Mpm.DYNAMICS_MAP);

            expect(dated.getAllMaps().size).toBe(2);
            expect(dated.getXml()!.getChildCount()).toBe(2);
        });
    });

    // ---------------------------------------------------------------
    // removeMap
    // ---------------------------------------------------------------
    describe('removeMap', () => {
        it('should remove the map from the lookup and from the xml', () => {
            const dated = Dated.createDated()!;
            dated.addMapByType(Mpm.TEMPO_MAP);

            dated.removeMap(Mpm.TEMPO_MAP);

            expect(dated.getMap(Mpm.TEMPO_MAP)).toBeNull();
            expect(dated.getAllMaps().size).toBe(0);
            expect(dated.getXml()!.getFirstChildElement('tempoMap')).toBeNull();
        });

        it('should leave other maps in place', () => {
            const dated = Dated.createDated()!;
            dated.addMapByType(Mpm.TEMPO_MAP);
            dated.addMapByType(Mpm.DYNAMICS_MAP);

            dated.removeMap(Mpm.TEMPO_MAP);

            expect(dated.getMap(Mpm.DYNAMICS_MAP)).not.toBeNull();
            expect(dated.getAllMaps().size).toBe(1);
        });

        it('should ignore a type that is not present', () => {
            const dated = Dated.createDated()!;
            dated.addMapByType(Mpm.TEMPO_MAP);

            expect(() => dated.removeMap(Mpm.RUBATO_MAP)).not.toThrow();
            expect(dated.getAllMaps().size).toBe(1);
        });
    });

    // ---------------------------------------------------------------
    // addMapFromXml / clear
    // ---------------------------------------------------------------
    describe('addMapFromXml', () => {
        it('should add a typed map built from an xml element', () => {
            const dated = Dated.createDated()!;
            const xml = new Element('rubatoMap', Mpm.MPM_NAMESPACE);

            const map = dated.addMapFromXml(xml);

            expect(map).not.toBeNull();
            expect(map!.getType()).toBe(Mpm.RUBATO_MAP);
            expect(dated.getMap(Mpm.RUBATO_MAP)).toBe(map);
        });

        it('should return null for a null element', () => {
            expect(Dated.createDated()!.addMapFromXml(null as unknown as Element)).toBeNull();
        });
    });

    describe('clear', () => {
        it('should drop all maps and empty the xml element', () => {
            const dated = Dated.createDated()!;
            dated.addMapByType(Mpm.TEMPO_MAP);
            dated.addMapByType(Mpm.DYNAMICS_MAP);

            dated.clear();

            expect(dated.getAllMaps().size).toBe(0);
            expect(dated.getXml()!.getChildCount()).toBe(0);
        });
    });

    // ---------------------------------------------------------------
    // environment
    // ---------------------------------------------------------------
    describe('setEnvironment', () => {
        it('should start without a global or part environment', () => {
            const dated = Dated.createDated()!;

            expect(dated.getGlobal()).toBeNull();
            expect(dated.getPart()).toBeNull();
        });

        it('should accept null for both and keep working', () => {
            const dated = Dated.createDated()!;
            dated.addMapByType(Mpm.TEMPO_MAP);

            expect(() => dated.setEnvironment(null, null)).not.toThrow();
            expect(dated.getGlobal()).toBeNull();
            expect(dated.getPart()).toBeNull();
        });
    });

    // ---------------------------------------------------------------
    // getMap
    // ---------------------------------------------------------------
    describe('getMap', () => {
        it('should return null for a type that was never added', () => {
            expect(Dated.createDated()!.getMap(Mpm.ASYNCHRONY_MAP)).toBeNull();
        });

        it('should distinguish the imprecision map sub-types by their local name', () => {
            const xml = new Element('dated', Mpm.MPM_NAMESPACE);
            xml.appendChild(new Element(Mpm.IMPRECISION_MAP_TIMING, Mpm.MPM_NAMESPACE));

            const dated = Dated.createDated(xml)!;

            expect(dated.getMap(Mpm.IMPRECISION_MAP_TIMING)).not.toBeNull();
            expect(dated.getMap(Mpm.IMPRECISION_MAP_DYNAMICS)).toBeNull();
        });
    });
});
