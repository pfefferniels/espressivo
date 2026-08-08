import { describe, it, expect } from 'vitest';
import { ArticulationMap } from '../../../src/mpm/elements/maps/ArticulationMap.js';
import { ArticulationData } from '../../../src/mpm/elements/maps/data/ArticulationData.js';
import { GenericMap } from '../../../src/mpm/elements/maps/GenericMap.js';
import { Element, Attribute } from '../../../src/xml/XomTypes.js';
import { Mpm } from '../../../src/mpm/Mpm.js';

describe('ArticulationMap', () => {
    // ---------------------------------------------------------------
    // Create an articulation map
    // ---------------------------------------------------------------
    describe('createArticulationMap', () => {
        it('should create an empty articulation map', () => {
            const map = ArticulationMap.createArticulationMap();
            expect(map).not.toBeNull();
            expect(map!.getType()).toBe('articulationMap');
        });

        it('should start with size 0', () => {
            const map = ArticulationMap.createArticulationMap()!;
            expect(map.size()).toBe(0);
            expect(map.isEmpty()).toBe(true);
        });

        it('should have an XML element', () => {
            const map = ArticulationMap.createArticulationMap()!;
            expect(map.getXml()).not.toBeNull();
            expect(map.getXml()!.getLocalName()).toBe('articulationMap');
        });
    });

    // ---------------------------------------------------------------
    // Add articulation
    // ---------------------------------------------------------------
    describe('addArticulation', () => {
        it('should add an articulation instruction', () => {
            const map = ArticulationMap.createArticulationMap()!;
            const index = map.addArticulation(0, 'staccato', 'note1', 'art-1');
            expect(index).toBeGreaterThanOrEqual(0);
            expect(map.size()).toBe(1);
        });

        it('should store attributes correctly', () => {
            const map = ArticulationMap.createArticulationMap()!;
            const index = map.addArticulation(0, 'legato', 'note2', 'art-2');
            const elem = map.getElement(index)!;

            expect(elem.getLocalName()).toBe('articulation');
            expect(elem.getAttributeValue('date')).toBe('0');
            expect(elem.getAttributeValue('name.ref')).toBe('legato');
            expect(elem.getAttributeValue('noteid')).toBe('note2');
        });

        it('should store xmlId', () => {
            const map = ArticulationMap.createArticulationMap()!;
            const index = map.addArticulation(0, 'staccato', null, 'art-3');
            const elem = map.getElement(index)!;

            const idAttr = elem.getAttribute('id', 'http://www.w3.org/XML/1998/namespace');
            expect(idAttr).not.toBeNull();
            expect(idAttr!.getValue()).toBe('art-3');
        });

        it('should return -1 for null articulationDefName', () => {
            const map = ArticulationMap.createArticulationMap()!;
            const index = map.addArticulation(0, null, 'note1', 'art-1');
            expect(index).toBe(-1);
            expect(map.size()).toBe(0);
        });

        it('should handle null noteid and id gracefully', () => {
            const map = ArticulationMap.createArticulationMap()!;
            const index = map.addArticulation(0, 'staccato', null, null);
            expect(index).toBeGreaterThanOrEqual(0);
            expect(map.size()).toBe(1);

            const elem = map.getElement(index)!;
            expect(elem.getAttribute('noteid')).toBeNull();
        });

        it('should maintain sorted order when adding out of order', () => {
            const map = ArticulationMap.createArticulationMap()!;
            map.addArticulation(960, 'staccato', null, null);
            map.addArticulation(0, 'legato', null, null);
            map.addArticulation(480, 'accent', null, null);

            expect(map.size()).toBe(3);
            expect(map.getElement(0)!.getAttributeValue('date')).toBe('0');
            expect(map.getElement(1)!.getAttributeValue('date')).toBe('480');
            expect(map.getElement(2)!.getAttributeValue('date')).toBe('960');
        });
    });

    // ---------------------------------------------------------------
    // addArticulationFromData
    // ---------------------------------------------------------------
    describe('addArticulationFromData', () => {
        it('should add an articulation from ArticulationData', () => {
            const map = ArticulationMap.createArticulationMap()!;
            const ad = new ArticulationData();
            ad.date = 0;
            ad.articulationDefName = 'staccato';

            const index = map.addArticulationFromData(ad);
            expect(index).toBeGreaterThanOrEqual(0);
            expect(map.size()).toBe(1);
        });

        it('should store absoluteDurationChange when non-zero', () => {
            const map = ArticulationMap.createArticulationMap()!;
            const ad = new ArticulationData();
            ad.date = 0;
            ad.articulationDefName = 'staccato';
            ad.absoluteDurationChange = -100;

            const index = map.addArticulationFromData(ad);
            const elem = map.getElement(index)!;
            expect(elem.getAttributeValue('absoluteDurationChange')).toBe('-100');
        });

        it('should store relativeDuration when not 1.0', () => {
            const map = ArticulationMap.createArticulationMap()!;
            const ad = new ArticulationData();
            ad.date = 0;
            ad.articulationDefName = 'staccato';
            ad.relativeDuration = 0.5;

            const index = map.addArticulationFromData(ad);
            const elem = map.getElement(index)!;
            expect(elem.getAttributeValue('relativeDuration')).toBe('0.5');
        });

        it('should not store relativeDuration when 1.0 (default)', () => {
            const map = ArticulationMap.createArticulationMap()!;
            const ad = new ArticulationData();
            ad.date = 0;
            ad.articulationDefName = 'staccato';
            ad.relativeDuration = 1.0;

            const index = map.addArticulationFromData(ad);
            const elem = map.getElement(index)!;
            expect(elem.getAttribute('relativeDuration')).toBeNull();
        });

        it('should not store absoluteDurationChange when 0.0 (default)', () => {
            const map = ArticulationMap.createArticulationMap()!;
            const ad = new ArticulationData();
            ad.date = 0;
            ad.articulationDefName = 'staccato';
            ad.absoluteDurationChange = 0.0;

            const index = map.addArticulationFromData(ad);
            const elem = map.getElement(index)!;
            expect(elem.getAttribute('absoluteDurationChange')).toBeNull();
        });

        it('should store absoluteDuration when not null', () => {
            const map = ArticulationMap.createArticulationMap()!;
            const ad = new ArticulationData();
            ad.date = 0;
            ad.articulationDefName = 'staccato';
            ad.absoluteDuration = 240;

            const index = map.addArticulationFromData(ad);
            const elem = map.getElement(index)!;
            expect(elem.getAttributeValue('absoluteDuration')).toBe('240');
        });
    });

    // ---------------------------------------------------------------
    // addArticulationStyleSwitch
    // ---------------------------------------------------------------
    describe('addArticulationStyleSwitch', () => {
        it('should add an articulation style switch', () => {
            const map = ArticulationMap.createArticulationMap()!;
            const index = map.addArticulationStyleSwitch(0, 'myArticStyle');
            expect(index).toBeGreaterThanOrEqual(0);
            expect(map.size()).toBe(1);
        });

        it('should store the style name', () => {
            const map = ArticulationMap.createArticulationMap()!;
            const index = map.addArticulationStyleSwitch(0, 'myArticStyle');
            const elem = map.getElement(index)!;

            expect(elem.getLocalName()).toBe('style');
            expect(elem.getAttributeValue('name.ref')).toBe('myArticStyle');
        });

        it('should store defaultArticulation when provided', () => {
            const map = ArticulationMap.createArticulationMap()!;
            const index = map.addArticulationStyleSwitch(0, 'myStyle', 'legato');
            const elem = map.getElement(index)!;

            expect(elem.getAttributeValue('defaultArticulation')).toBe('legato');
        });

        it('should store id when provided', () => {
            const map = ArticulationMap.createArticulationMap()!;
            const index = map.addArticulationStyleSwitch(0, 'myStyle', null, 'switch-1');
            const elem = map.getElement(index)!;

            const idAttr = elem.getAttribute('id', 'http://www.w3.org/XML/1998/namespace');
            expect(idAttr).not.toBeNull();
            expect(idAttr!.getValue()).toBe('switch-1');
        });
    });

    // ---------------------------------------------------------------
    // getArticulationDataOf
    // ---------------------------------------------------------------
    describe('getArticulationDataOf', () => {
        it('should return null for an empty map', () => {
            const map = ArticulationMap.createArticulationMap()!;
            expect(map.getArticulationDataOf(0)).toBeNull();
        });

        it('should return null for negative index', () => {
            const map = ArticulationMap.createArticulationMap()!;
            map.addArticulation(0, 'staccato', null, null);
            expect(map.getArticulationDataOf(-1)).toBeNull();
        });

        it('should return ArticulationData for a valid articulation', () => {
            const map = ArticulationMap.createArticulationMap()!;
            map.addArticulation(0, 'staccato', 'note1', null);

            const ad = map.getArticulationDataOf(0);
            expect(ad).not.toBeNull();
            expect(ad!.date).toBe(0);
            expect(ad!.articulationDefName).toBe('staccato');
        });

        it('should return null for style elements (not articulation)', () => {
            const map = ArticulationMap.createArticulationMap()!;
            map.addArticulationStyleSwitch(0, 'myStyle');

            const ad = map.getArticulationDataOf(0);
            // Style elements have localName "style", not "articulation"
            expect(ad).toBeNull();
        });

        it('should handle out-of-bounds index by clamping', () => {
            const map = ArticulationMap.createArticulationMap()!;
            map.addArticulation(0, 'staccato', null, null);

            const ad = map.getArticulationDataOf(100);
            expect(ad).not.toBeNull();
            expect(ad!.articulationDefName).toBe('staccato');
        });

        it('round-trip: addArticulation -> getArticulationDataOf preserves values', () => {
            const map = ArticulationMap.createArticulationMap()!;
            map.addArticulation(240, 'legato', 'note5', 'art-5');

            const ad = map.getArticulationDataOf(0)!;
            expect(ad.date).toBe(240);
            expect(ad.articulationDefName).toBe('legato');
        });
    });

    // ---------------------------------------------------------------
    // ArticulationData
    // ---------------------------------------------------------------
    describe('ArticulationData', () => {
        it('should have correct default values', () => {
            const ad = new ArticulationData();
            expect(ad.date).toBe(0.0);
            expect(ad.noteid).toBeNull();
            expect(ad.absoluteDuration).toBeNull();
            expect(ad.absoluteDurationChange).toBe(0.0);
            expect(ad.absoluteDurationMs).toBeNull();
            expect(ad.absoluteDurationChangeMs).toBe(0.0);
            expect(ad.relativeDuration).toBe(1.0);
            expect(ad.absoluteDelay).toBe(0.0);
            expect(ad.absoluteDelayMs).toBe(0.0);
            expect(ad.absoluteVelocity).toBeNull();
            expect(ad.absoluteVelocityChange).toBe(0.0);
            expect(ad.relativeVelocity).toBe(1.0);
            expect(ad.detuneCents).toBe(0.0);
            expect(ad.detuneHz).toBe(0.0);
            expect(ad.xml).toBeNull();
            expect(ad.xmlId).toBeNull();
            expect(ad.styleName).toBe('');
            expect(ad.style).toBeNull();
            expect(ad.defaultArticulation).toBeNull();
            expect(ad.defaultArticulationDef).toBeNull();
            expect(ad.articulationDefName).toBeNull();
            expect(ad.articulationDef).toBeNull();
        });

        it('should clone correctly with all fields', () => {
            const ad = new ArticulationData();
            ad.date = 100;
            ad.noteid = 'note1';
            ad.absoluteDuration = 240;
            ad.absoluteDurationChange = -50;
            ad.absoluteDurationMs = 500;
            ad.absoluteDurationChangeMs = 10;
            ad.relativeDuration = 0.8;
            ad.absoluteDelay = 20;
            ad.absoluteDelayMs = 15;
            ad.absoluteVelocity = 100;
            ad.absoluteVelocityChange = -10;
            ad.relativeVelocity = 0.9;
            ad.detuneCents = 5.0;
            ad.detuneHz = 2.5;
            ad.xmlId = 'art-clone';
            ad.styleName = 'testStyle';
            ad.articulationDefName = 'staccato';

            const clone = ad.clone();
            expect(clone.date).toBe(100);
            expect(clone.noteid).toBe('note1');
            expect(clone.absoluteDuration).toBe(240);
            expect(clone.absoluteDurationChange).toBe(-50);
            expect(clone.absoluteDurationMs).toBe(500);
            expect(clone.absoluteDurationChangeMs).toBe(10);
            expect(clone.relativeDuration).toBe(0.8);
            expect(clone.absoluteDelay).toBe(20);
            expect(clone.absoluteDelayMs).toBe(15);
            expect(clone.absoluteVelocity).toBe(100);
            expect(clone.absoluteVelocityChange).toBe(-10);
            expect(clone.relativeVelocity).toBe(0.9);
            expect(clone.detuneCents).toBe(5.0);
            expect(clone.detuneHz).toBe(2.5);
            expect(clone.xmlId).toBe('art-clone');
            expect(clone.styleName).toBe('testStyle');
            expect(clone.articulationDefName).toBe('staccato');
        });

        it('clone should be independent of original', () => {
            const ad = new ArticulationData();
            ad.absoluteDelay = 10;
            ad.relativeDuration = 0.5;
            ad.detuneCents = 3.0;

            const clone = ad.clone();
            clone.absoluteDelay = 20;
            clone.relativeDuration = 0.8;
            clone.detuneCents = 0.0;

            expect(ad.absoluteDelay).toBe(10);
            expect(ad.relativeDuration).toBe(0.5);
            expect(ad.detuneCents).toBe(3.0);
        });
    });

    // ---------------------------------------------------------------
    // ArticulationData.articulateNote - modification mathematics
    // ---------------------------------------------------------------
    describe('ArticulationData.articulateNote', () => {
        function createNote(datePerf: number, durationPerf: number, velocity: number): Element {
            const note = new Element('note', Mpm.MPM_NAMESPACE);
            note.addAttribute(new Attribute('date', '0'));
            note.addAttribute(new Attribute('date.perf', String(datePerf)));
            note.addAttribute(new Attribute('duration.perf', String(durationPerf)));
            note.addAttribute(new Attribute('velocity', String(velocity)));
            return note;
        }

        it('should return false for null note', () => {
            const ad = new ArticulationData();
            expect(ad.articulateNote(null)).toBe(false);
        });

        it('absoluteDelay shifts date.perf', () => {
            const ad = new ArticulationData();
            ad.absoluteDelay = 50;

            const note = createNote(100, 200, 80);
            ad.articulateNote(note);

            expect(parseFloat(note.getAttributeValue('date.perf')!)).toBeCloseTo(150, 5);
        });

        it('absoluteDelay=0 does not shift date.perf', () => {
            const ad = new ArticulationData();
            ad.absoluteDelay = 0;

            const note = createNote(100, 200, 80);
            ad.articulateNote(note);

            expect(parseFloat(note.getAttributeValue('date.perf')!)).toBeCloseTo(100, 5);
        });

        it('negative absoluteDelay shifts date.perf backward', () => {
            const ad = new ArticulationData();
            ad.absoluteDelay = -30;

            const note = createNote(100, 200, 80);
            ad.articulateNote(note);

            expect(parseFloat(note.getAttributeValue('date.perf')!)).toBeCloseTo(70, 5);
        });

        it('absoluteDelayMs sets articulation.absoluteDelayMs attribute', () => {
            const ad = new ArticulationData();
            ad.absoluteDelayMs = 25;

            const note = createNote(100, 200, 80);
            ad.articulateNote(note);

            const attr = note.getAttribute('articulation.absoluteDelayMs');
            expect(attr).not.toBeNull();
            expect(parseFloat(attr!.getValue())).toBeCloseTo(25, 5);
        });

        it('absoluteDuration sets duration.perf to fixed value', () => {
            const ad = new ArticulationData();
            ad.absoluteDuration = 100;

            const note = createNote(100, 200, 80);
            ad.articulateNote(note);

            expect(parseFloat(note.getAttributeValue('duration.perf')!)).toBeCloseTo(100, 5);
        });

        it('relativeDuration multiplies duration.perf', () => {
            const ad = new ArticulationData();
            ad.relativeDuration = 0.5;

            const note = createNote(100, 200, 80);
            ad.articulateNote(note);

            // duration * 0.5 = 200 * 0.5 = 100
            expect(parseFloat(note.getAttributeValue('duration.perf')!)).toBeCloseTo(100, 5);
        });

        it('relativeDuration=1.0 does not change duration.perf', () => {
            const ad = new ArticulationData();
            ad.relativeDuration = 1.0;

            const note = createNote(100, 200, 80);
            ad.articulateNote(note);

            expect(parseFloat(note.getAttributeValue('duration.perf')!)).toBeCloseTo(200, 5);
        });

        it('absoluteVelocity sets velocity to fixed value', () => {
            const ad = new ArticulationData();
            ad.absoluteVelocity = 127;

            const note = createNote(100, 200, 80);
            ad.articulateNote(note);

            expect(parseFloat(note.getAttributeValue('velocity')!)).toBeCloseTo(127, 5);
        });

        it('relativeVelocity multiplies velocity', () => {
            const ad = new ArticulationData();
            ad.relativeVelocity = 0.5;

            const note = createNote(100, 200, 80);
            ad.articulateNote(note);

            // 80 * 0.5 = 40
            expect(parseFloat(note.getAttributeValue('velocity')!)).toBeCloseTo(40, 5);
        });

        it('absoluteVelocityChange adds to velocity', () => {
            const ad = new ArticulationData();
            ad.absoluteVelocityChange = 20;

            const note = createNote(100, 200, 80);
            ad.articulateNote(note);

            // 80 + 20 = 100
            expect(parseFloat(note.getAttributeValue('velocity')!)).toBeCloseTo(100, 5);
        });

        it('negative absoluteVelocityChange reduces velocity', () => {
            const ad = new ArticulationData();
            ad.absoluteVelocityChange = -30;

            const note = createNote(100, 200, 80);
            ad.articulateNote(note);

            // 80 - 30 = 50
            expect(parseFloat(note.getAttributeValue('velocity')!)).toBeCloseTo(50, 5);
        });

        it('detuneCents sets detuneCents attribute', () => {
            const ad = new ArticulationData();
            ad.detuneCents = 15.0;

            const note = createNote(100, 200, 80);
            ad.articulateNote(note);

            const attr = note.getAttribute('detuneCents');
            expect(attr).not.toBeNull();
            expect(parseFloat(attr!.getValue())).toBeCloseTo(15.0, 5);
        });

        it('detuneHz sets detuneHz attribute', () => {
            const ad = new ArticulationData();
            ad.detuneHz = 3.5;

            const note = createNote(100, 200, 80);
            ad.articulateNote(note);

            const attr = note.getAttribute('detuneHz');
            expect(attr).not.toBeNull();
            expect(parseFloat(attr!.getValue())).toBeCloseTo(3.5, 5);
        });

        it('detuneCents=0 does not add attribute', () => {
            const ad = new ArticulationData();
            ad.detuneCents = 0.0;

            const note = createNote(100, 200, 80);
            ad.articulateNote(note);

            expect(note.getAttribute('detuneCents')).toBeNull();
        });

        it('combined: absoluteDelay + relativeDuration + absoluteVelocityChange', () => {
            const ad = new ArticulationData();
            ad.absoluteDelay = 20;
            ad.relativeDuration = 0.75;
            ad.absoluteVelocityChange = -10;

            const note = createNote(100, 200, 80);
            ad.articulateNote(note);

            expect(parseFloat(note.getAttributeValue('date.perf')!)).toBeCloseTo(120, 5);
            expect(parseFloat(note.getAttributeValue('duration.perf')!)).toBeCloseTo(150, 5);
            expect(parseFloat(note.getAttributeValue('velocity')!)).toBeCloseTo(70, 5);
        });

        it('absoluteDurationMs sets articulation.absoluteDurationMs attribute', () => {
            const ad = new ArticulationData();
            ad.absoluteDurationMs = 500;

            const note = createNote(100, 200, 80);
            ad.articulateNote(note);

            const attr = note.getAttribute('articulation.absoluteDurationMs');
            expect(attr).not.toBeNull();
            expect(parseFloat(attr!.getValue())).toBeCloseTo(500, 5);
        });

        it('absoluteDurationChangeMs sets articulation.absoluteDurationChangeMs attribute', () => {
            const ad = new ArticulationData();
            ad.absoluteDurationChangeMs = 50;

            const note = createNote(100, 200, 80);
            ad.articulateNote(note);

            const attr = note.getAttribute('articulation.absoluteDurationChangeMs');
            expect(attr).not.toBeNull();
            expect(parseFloat(attr!.getValue())).toBeCloseTo(50, 5);
        });
    });

    // ---------------------------------------------------------------
    // renderArticulationToMap_millisecondModifiers
    // ---------------------------------------------------------------
    describe('renderArticulationToMap_millisecondModifiers', () => {
        function createMsMapEntry(date: number, msDate: number, msEnd: number): Element {
            const e = new Element('note', Mpm.MPM_NAMESPACE);
            e.addAttribute(new Attribute('date', String(date)));
            e.addAttribute(new Attribute('milliseconds.date', String(msDate)));
            e.addAttribute(new Attribute('milliseconds.date.end', String(msEnd)));
            return e;
        }

        it('should apply absoluteDelayMs to milliseconds.date', () => {
            const map = ArticulationMap.createArticulationMap()!;
            const target = GenericMap.createGenericMap('positionMap')!;
            const entry = createMsMapEntry(0, 100, 200);
            entry.addAttribute(new Attribute('articulation.absoluteDelayMs', '25'));
            target.addElement(entry);

            map.renderArticulationToMap_millisecondModifiers(target);

            expect(parseFloat(entry.getAttributeValue('milliseconds.date')!)).toBeCloseTo(125, 5);
            // The attribute should be removed after processing
            expect(entry.getAttribute('articulation.absoluteDelayMs')).toBeNull();
        });

        it('should apply absoluteDurationMs to milliseconds.date.end', () => {
            const map = ArticulationMap.createArticulationMap()!;
            const target = GenericMap.createGenericMap('positionMap')!;
            const entry = createMsMapEntry(0, 100, 200);
            entry.addAttribute(new Attribute('articulation.absoluteDurationMs', '50'));
            target.addElement(entry);

            map.renderArticulationToMap_millisecondModifiers(target);

            // absoluteDurationMs: endNew = dateNew + absoluteDurationMs
            // dateNew = 100 (no delay), so endNew = 100 + 50 = 150
            expect(parseFloat(entry.getAttributeValue('milliseconds.date.end')!)).toBeCloseTo(150, 5);
        });

        it('should apply absoluteDurationChangeMs to milliseconds.date.end', () => {
            const map = ArticulationMap.createArticulationMap()!;
            const target = GenericMap.createGenericMap('positionMap')!;
            const entry = createMsMapEntry(0, 100, 200);
            entry.addAttribute(new Attribute('articulation.absoluteDurationChangeMs', '30'));
            target.addElement(entry);

            map.renderArticulationToMap_millisecondModifiers(target);

            // endNew = 200 + 30 = 230
            expect(parseFloat(entry.getAttributeValue('milliseconds.date.end')!)).toBeCloseTo(230, 5);
        });

        it('should combine delay and duration change', () => {
            const map = ArticulationMap.createArticulationMap()!;
            const target = GenericMap.createGenericMap('positionMap')!;
            const entry = createMsMapEntry(0, 100, 200);
            entry.addAttribute(new Attribute('articulation.absoluteDelayMs', '10'));
            entry.addAttribute(new Attribute('articulation.absoluteDurationChangeMs', '20'));
            target.addElement(entry);

            map.renderArticulationToMap_millisecondModifiers(target);

            // dateNew = 100 + 10 = 110
            // endNew = 200 + 20 = 220
            expect(parseFloat(entry.getAttributeValue('milliseconds.date')!)).toBeCloseTo(110, 5);
            expect(parseFloat(entry.getAttributeValue('milliseconds.date.end')!)).toBeCloseTo(220, 5);
        });

        it('should not modify if dateNew >= endNew', () => {
            const map = ArticulationMap.createArticulationMap()!;
            const target = GenericMap.createGenericMap('positionMap')!;
            const entry = createMsMapEntry(0, 100, 110);
            entry.addAttribute(new Attribute('articulation.absoluteDelayMs', '50'));
            target.addElement(entry);

            map.renderArticulationToMap_millisecondModifiers(target);

            // dateNew = 100 + 50 = 150, endNew = 110 => dateNew >= endNew
            // So values should NOT be written
            expect(parseFloat(entry.getAttributeValue('milliseconds.date')!)).toBeCloseTo(100, 5);
            expect(parseFloat(entry.getAttributeValue('milliseconds.date.end')!)).toBeCloseTo(110, 5);
        });

        it('null map is handled gracefully', () => {
            const map = ArticulationMap.createArticulationMap()!;
            // Should not throw
            map.renderArticulationToMap_millisecondModifiers(null);
        });

        it('static renderArticulationToMap_millisecondModifiers delegates correctly', () => {
            const map = ArticulationMap.createArticulationMap()!;
            const target = GenericMap.createGenericMap('positionMap')!;
            const entry = createMsMapEntry(0, 100, 200);
            entry.addAttribute(new Attribute('articulation.absoluteDelayMs', '25'));
            target.addElement(entry);

            ArticulationMap.renderArticulationToMap_millisecondModifiers(target, map);

            expect(parseFloat(entry.getAttributeValue('milliseconds.date')!)).toBeCloseTo(125, 5);
        });

        it('static with null articulation map does nothing', () => {
            const target = GenericMap.createGenericMap('positionMap')!;
            ArticulationMap.renderArticulationToMap_millisecondModifiers(target, null);
            // Should not throw
        });
    });

    // ---------------------------------------------------------------
    // GenericMap operations on ArticulationMap
    // ---------------------------------------------------------------
    describe('GenericMap operations', () => {
        it('should support removeElement by index', () => {
            const map = ArticulationMap.createArticulationMap()!;
            map.addArticulation(0, 'staccato', null, null);
            map.addArticulation(960, 'legato', null, null);

            map.removeElement(0);
            expect(map.size()).toBe(1);
            expect(map.getElement(0)!.getAttributeValue('name.ref')).toBe('legato');
        });

        it('should support setId and getId', () => {
            const map = ArticulationMap.createArticulationMap()!;
            expect(map.getId()).toBeNull();

            map.setId('articMap-1');
            expect(map.getId()).toBe('articMap-1');
        });

        it('should support getElementBeforeAt', () => {
            const map = ArticulationMap.createArticulationMap()!;
            map.addArticulation(0, 'staccato', null, null);
            map.addArticulation(480, 'legato', null, null);
            map.addArticulation(960, 'accent', null, null);

            const elem = map.getElementBeforeAt(500);
            expect(elem).not.toBeNull();
            expect(elem!.getAttributeValue('name.ref')).toBe('legato');
        });
    });
});
