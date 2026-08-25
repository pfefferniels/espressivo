import { describe, it, expect } from 'vitest';
import { okValue } from '../../support/result.js';
import { expectOptionsRoundTrip } from '../../support/optionsRoundTrip.js';
import { ArticulationMap, type AddArticulationOptions } from '../../../src/mpm/elements/maps/ArticulationMap.js';
import {
  articulateNote,
  NEUTRAL_ARTICULATION_MODIFIERS,
  type Articulation,
} from '../../../src/mpm/elements/maps/data/articulation.js';
import { GenericMap } from '../../../src/mpm/elements/maps/GenericMap.js';
import { Element, Attribute, Builder } from '../../../src/xml/XomTypes.js';
import { Mpm } from '../../../src/mpm/Mpm.js';

describe('ArticulationMap', () => {
  describe('createArticulationMap', () => {
    it('should create an empty articulation map', () => {
      const map = ArticulationMap.createArticulationMap();
      expect(map).not.toBeNull();
      expect(map!.getType()).toBe('articulationMap');
    });

    it('should start with size 0', () => {
      const map = ArticulationMap.createArticulationMap();
      expect(map.size()).toBe(0);
      expect(map.isEmpty()).toBe(true);
    });

    it('should have an XML element', () => {
      const map = ArticulationMap.createArticulationMap();
      expect(map.getXml()).not.toBeNull();
      expect(map.getXml()!.getLocalName()).toBe('articulationMap');
    });
  });

  describe('addArticulation', () => {
    it('should add an articulation instruction', () => {
      const map = ArticulationMap.createArticulationMap();
      const index = map.addArticulation({
        date: 0,
        nameRef: 'staccato',
        noteid: 'note1',
        id: 'art-1',
      });
      expect(index).toBeGreaterThanOrEqual(0);
      expect(map.size()).toBe(1);
    });

    it('should store attributes correctly', () => {
      const map = ArticulationMap.createArticulationMap();
      const index = map.addArticulation({
        date: 0,
        nameRef: 'legato',
        noteid: 'note2',
        id: 'art-2',
      });
      const elem = map.getElement(index)!;

      expect(elem.getLocalName()).toBe('articulation');
      expect(elem.getAttributeValue('date')).toBe('0');
      expect(elem.getAttributeValue('name.ref')).toBe('legato');
      expect(elem.getAttributeValue('noteid')).toBe('note2');
    });

    it('should store xmlId', () => {
      const map = ArticulationMap.createArticulationMap();
      const index = map.addArticulation({ date: 0, nameRef: 'staccato', id: 'art-3' });
      const elem = map.getElement(index)!;

      const idAttr = elem.getAttribute('id', 'http://www.w3.org/XML/1998/namespace');
      expect(idAttr).not.toBeNull();
      expect(idAttr!.getValue()).toBe('art-3');
    });

    it('should handle null noteid and id gracefully', () => {
      const map = ArticulationMap.createArticulationMap();
      const index = map.addArticulation({ date: 0, nameRef: 'staccato' });
      expect(index).toBeGreaterThanOrEqual(0);
      expect(map.size()).toBe(1);

      const elem = map.getElement(index)!;
      expect(elem.getAttribute('noteid')).toBeNull();
    });

    it('should maintain sorted order when adding out of order', () => {
      const map = ArticulationMap.createArticulationMap();
      map.addArticulation({ date: 960, nameRef: 'staccato' });
      map.addArticulation({ date: 0, nameRef: 'legato' });
      map.addArticulation({ date: 480, nameRef: 'accent' });

      expect(map.size()).toBe(3);
      expect(map.getElement(0)!.getAttributeValue('date')).toBe('0');
      expect(map.getElement(1)!.getAttributeValue('date')).toBe('480');
      expect(map.getElement(2)!.getAttributeValue('date')).toBe('960');
    });
  });

  describe('addArticulation: the writable modifiers', () => {
    /** Absence, not neutrality, decides: an unmentioned modifier writes no attribute. */
    it('writes no modifier attribute when none is given', () => {
      const map = ArticulationMap.createArticulationMap();
      const elem = map.getElement(map.addArticulation({ date: 0, nameRef: 'staccato' }))!;

      expect(map.size()).toBe(1);
      expect(elem.getAttribute('absoluteDuration')).toBeNull();
      expect(elem.getAttribute('absoluteDurationChange')).toBeNull();
      expect(elem.getAttribute('relativeDuration')).toBeNull();
    });

    it('writes each modifier it is given, neutral values included', () => {
      const map = ArticulationMap.createArticulationMap();
      const elem = map.getElement(
        map.addArticulation({
          date: 0,
          nameRef: 'staccato',
          absoluteDuration: 240,
          absoluteDurationChange: -100,
          relativeDuration: 1.0,
        }),
      )!;

      expect(elem.getAttributeValue('absoluteDuration')).toBe('240');
      expect(elem.getAttributeValue('absoluteDurationChange')).toBe('-100');
      expect(elem.getAttributeValue('relativeDuration')).toBe('1');
    });

    /** Attribute order is byte-visible; xml:id goes last, as in every other map writer. */
    it('serializes in attribute order', () => {
      const map = ArticulationMap.createArticulationMap();
      const xml = map
        .getElement(
          map.addArticulation({
            date: 0,
            nameRef: 'staccato',
            noteid: '#note1',
            relativeDuration: 0.5,
            id: 'art-1',
          }),
        )!
        .toXML();

      expect(xml.indexOf('name.ref=')).toBeLessThan(xml.indexOf('noteid='));
      expect(xml.indexOf('noteid=')).toBeLessThan(xml.indexOf('relativeDuration='));
      expect(xml.indexOf('relativeDuration=')).toBeLessThan(xml.indexOf('xml:id='));
    });
  });

  describe('addArticulationStyleSwitch', () => {
    it('should add an articulation style switch', () => {
      const map = ArticulationMap.createArticulationMap();
      const index = map.addArticulationStyleSwitch(0, 'myArticStyle');
      expect(index).toBeGreaterThanOrEqual(0);
      expect(map.size()).toBe(1);
    });

    it('should store the style name', () => {
      const map = ArticulationMap.createArticulationMap();
      const index = map.addArticulationStyleSwitch(0, 'myArticStyle');
      const elem = map.getElement(index)!;

      expect(elem.getLocalName()).toBe('style');
      expect(elem.getAttributeValue('name.ref')).toBe('myArticStyle');
    });

    it('should store defaultArticulation when provided', () => {
      const map = ArticulationMap.createArticulationMap();
      const index = map.addArticulationStyleSwitch(0, 'myStyle', 'legato');
      const elem = map.getElement(index)!;

      expect(elem.getAttributeValue('defaultArticulation')).toBe('legato');
    });

    it('should store id when provided', () => {
      const map = ArticulationMap.createArticulationMap();
      const index = map.addArticulationStyleSwitch(0, 'myStyle', null, 'switch-1');
      const elem = map.getElement(index)!;

      const idAttr = elem.getAttribute('id', 'http://www.w3.org/XML/1998/namespace');
      expect(idAttr).not.toBeNull();
      expect(idAttr!.getValue()).toBe('switch-1');
    });
  });

  describe('getArticulationDataOf', () => {
    it('should return null for an empty map', () => {
      const map = ArticulationMap.createArticulationMap();
      expect(map.getArticulationDataOf(0)).toBeNull();
    });

    it('should return null for negative index', () => {
      const map = ArticulationMap.createArticulationMap();
      map.addArticulation({ date: 0, nameRef: 'staccato' });
      expect(map.getArticulationDataOf(-1)).toBeNull();
    });

    it('should return ArticulationData for a valid articulation', () => {
      const map = ArticulationMap.createArticulationMap();
      map.addArticulation({ date: 0, nameRef: 'staccato', noteid: 'note1' });

      const ad = map.getArticulationDataOf(0);
      expect(ad).not.toBeNull();
      expect(ad!.date).toBe(0);
      expect(ad!.articulationDefName).toBe('staccato');
    });

    it('should return null for style elements (not articulation)', () => {
      const map = ArticulationMap.createArticulationMap();
      map.addArticulationStyleSwitch(0, 'myStyle');

      const ad = map.getArticulationDataOf(0);
      expect(ad).toBeNull();
    });

    it('should handle out-of-bounds index by clamping', () => {
      const map = ArticulationMap.createArticulationMap();
      map.addArticulation({ date: 0, nameRef: 'staccato' });

      const ad = map.getArticulationDataOf(100);
      expect(ad).not.toBeNull();
      expect(ad!.articulationDefName).toBe('staccato');
    });

    it('round-trip: addArticulation -> getArticulationDataOf preserves values', () => {
      const map = ArticulationMap.createArticulationMap();
      map.addArticulation({ date: 240, nameRef: 'legato', noteid: 'note5', id: 'art-5' });

      const ad = map.getArticulationDataOf(0)!;
      expect(ad.date).toBe(240);
      expect(ad.articulationDefName).toBe('legato');
      expect(ad.xmlId).toBe('art-5');
    });
  });

  // GH espressivo#14 / PARITY.md §1: Java read this attribute under a name that never
  // matched, so `xmlId` was always null and `@modified` recorded nothing.
  describe('getArticulationDataOf reads the xml:id', () => {
    const parseMap = (articulations: string): ArticulationMap =>
      okValue(
        ArticulationMap.createArticulationMap(
          new Builder()
            .build(
              `<articulationMap xmlns="${Mpm.MPM_NAMESPACE}">${articulations}</articulationMap>`,
            )
            .getRootElement(),
        ),
      );

    it('reads a namespaced xml:id off a parsed articulation', () => {
      const ad = parseMap(
        '<articulation xmlns:xml="http://www.w3.org/XML/1998/namespace" date="0.0"' +
          ' name.ref="stacc" noteid="#n1" xml:id="n1" />',
      ).getArticulationDataOf(0)!;

      expect(ad.xmlId).toBe('n1');
      expect(ad.noteid).toBe('n1');
    });

    it('leaves xmlId null when the articulation carries no id', () => {
      const ad = parseMap('<articulation date="0.0" name.ref="stacc" />').getArticulationDataOf(0)!;

      expect(ad.xmlId).toBeNull();
    });

    it('records the id in @modified, which is what the field is for', () => {
      const ad = parseMap(
        '<articulation xmlns:xml="http://www.w3.org/XML/1998/namespace" date="0.0"' +
          ' relativeDuration="0.9" xml:id="n1" />',
      ).getArticulationDataOf(0)!;

      const note = new Element('note', Mpm.MPM_NAMESPACE);
      note.addAttribute(new Attribute('date.perf', '0'));
      note.addAttribute(new Attribute('duration.perf', '720'));
      note.addAttribute(new Attribute('modified', '')); // Performance.java:659 seeds this

      articulateNote(ad, note);

      expect(parseFloat(note.getAttributeValue('duration.perf')!)).toBeCloseTo(648, 5);
      expect(note.getAttributeValue('modified')).toBe('n1');
    });

    it('an articulation with no id still leaves @modified empty', () => {
      const ad = parseMap(
        '<articulation date="0.0" relativeDuration="0.9" />',
      ).getArticulationDataOf(0)!;

      const note = new Element('note', Mpm.MPM_NAMESPACE);
      note.addAttribute(new Attribute('date.perf', '0'));
      note.addAttribute(new Attribute('duration.perf', '720'));
      note.addAttribute(new Attribute('modified', ''));

      articulateNote(ad, note);

      expect(parseFloat(note.getAttributeValue('duration.perf')!)).toBeCloseTo(648, 5);
      expect(note.getAttributeValue('modified')).toBe('');
    });
  });

  // These read literal attributes off a parsed <articulation>, which no fixture in
  // tests/integration/fixtures does: every fixture articulation carries name.ref and noteid
  // only, so the certification suite stays green with this read missing and every inline
  // modifier rendering as the identity. That blind spot is why these tests build their XML
  // rather than reach for a fixture.
  describe('getArticulationDataOf reads the inline numeric modifiers', () => {
    const parse = (xml: string): Element => new Builder().build(xml).getRootElement();

    const mapOf = (articulations: string): ArticulationMap =>
      okValue(
        ArticulationMap.createArticulationMap(
          parse(`<articulationMap xmlns="${Mpm.MPM_NAMESPACE}">${articulations}</articulationMap>`),
        ),
      );

    it('reads all twelve from a literal articulation element', () => {
      const ad = mapOf(
        '<articulation date="0.0" absoluteVelocity="88.5" relativeVelocity="0.75"' +
          ' absoluteVelocityChange="20.5" absoluteDuration="600.0"' +
          ' absoluteDurationChange="-30.0" relativeDuration="0.66" absoluteDelay="-12.0"' +
          ' absoluteDurationMs="160.0" absoluteDurationChangeMs="-40.0"' +
          ' absoluteDelayMs="25.0" detuneCents="14.0" detuneHz="3.5" />',
      ).getArticulationDataOf(0)!;

      expect(ad.absoluteVelocity).toBe(88.5);
      expect(ad.relativeVelocity).toBe(0.75);
      expect(ad.absoluteVelocityChange).toBe(20.5);
      expect(ad.absoluteDuration).toBe(600.0);
      expect(ad.absoluteDurationChange).toBe(-30.0);
      expect(ad.relativeDuration).toBe(0.66);
      expect(ad.absoluteDelay).toBe(-12.0);
      expect(ad.absoluteDurationMs).toBe(160.0);
      expect(ad.absoluteDurationChangeMs).toBe(-40.0);
      expect(ad.absoluteDelayMs).toBe(25.0);
      expect(ad.detuneCents).toBe(14.0);
      expect(ad.detuneHz).toBe(3.5);
    });

    it('leaves an absent modifier at its neutral default', () => {
      const ad = mapOf('<articulation date="0.0" relativeDuration="0.5" />').getArticulationDataOf(
        0,
      )!;

      expect(ad.relativeDuration).toBe(0.5);
      expect(ad.absoluteDuration).toBeNull();
      expect(ad.absoluteVelocity).toBeNull();
      expect(ad.absoluteDurationMs).toBeNull();
      expect(ad.absoluteDurationChange).toBe(0.0);
      expect(ad.absoluteDurationChangeMs).toBe(0.0);
      expect(ad.absoluteVelocityChange).toBe(0.0);
      expect(ad.relativeVelocity).toBe(1.0);
      expect(ad.absoluteDelay).toBe(0.0);
      expect(ad.absoluteDelayMs).toBe(0.0);
      expect(ad.detuneCents).toBe(0.0);
      expect(ad.detuneHz).toBe(0.0);
    });

    it('a zero-valued modifier is read as 0, not as absent', () => {
      // The one case `?? default` would get wrong if it tested falsiness rather than null:
      // relativeVelocity="0" is a silenced note and must not fall back to 1.0.
      const ad = mapOf(
        '<articulation date="0.0" relativeVelocity="0.0" relativeDuration="0.0" />',
      ).getArticulationDataOf(0)!;

      expect(ad.relativeVelocity).toBe(0.0);
      expect(ad.relativeDuration).toBe(0.0);
    });

    it('applies the inline modifiers to a note, def or no def', () => {
      const map = mapOf(
        '<articulation date="0.0" relativeDuration="0.5" absoluteVelocityChange="20.0"' +
          ' absoluteDelay="30.0" />',
      );
      const note = new Element('note', Mpm.MPM_NAMESPACE);
      note.addAttribute(new Attribute('date', '0'));
      note.addAttribute(new Attribute('date.perf', '0'));
      note.addAttribute(new Attribute('duration.perf', '720'));
      note.addAttribute(new Attribute('velocity', '64'));

      articulateNote(map.getArticulationDataOf(0)!, note);

      expect(parseFloat(note.getAttributeValue('duration.perf')!)).toBeCloseTo(360, 5);
      expect(parseFloat(note.getAttributeValue('velocity')!)).toBeCloseTo(84, 5);
      expect(parseFloat(note.getAttributeValue('date.perf')!)).toBeCloseTo(30, 5);
    });

    it('applies the inline modifiers on top of the referenced def', () => {
      // The def runs first and the inline modifiers run on top of its result: an absolute
      // modifier replaces what the def wrote, a relative one compounds with it.
      const mpm = new Mpm(
        `<mpm xmlns="${Mpm.MPM_NAMESPACE}"><performance name="p" pulsesPerQuarter="720">` +
          '<global><header><articulationStyles><styleDef name="s">' +
          '<articulationDef name="stacc" relativeDuration="0.5" absoluteVelocityChange="-5.0" />' +
          '</styleDef></articulationStyles></header><dated /></global>' +
          '<part name="" number="1" midi.channel="0" midi.port="0"><header /><dated>' +
          '<articulationMap><style date="0.0" name.ref="s" />' +
          '<articulation date="0.0" name.ref="stacc" relativeDuration="0.9"' +
          ' absoluteVelocity="100.0" /></articulationMap>' +
          '</dated></part></performance></mpm>',
      );
      const map = mpm
        .getAllPerformances()[0]
        .getPart(1)!
        .getDated()!
        .getMap('articulationMap') as ArticulationMap;

      // Entry 0 is the <style> switch, so the articulation is entry 1.
      const ad = map.getArticulationDataOf(1)!;
      expect(ad.articulationDef).not.toBeNull();
      expect(ad.relativeDuration).toBe(0.9);
      expect(ad.absoluteVelocity).toBe(100.0);

      const note = new Element('note', Mpm.MPM_NAMESPACE);
      note.addAttribute(new Attribute('date', '0'));
      note.addAttribute(new Attribute('date.perf', '0'));
      note.addAttribute(new Attribute('duration.perf', '720'));
      note.addAttribute(new Attribute('velocity', '64'));
      articulateNote(ad, note);

      // 720 * 0.5 (def) * 0.9 (inline): the inline factor multiplies the def's result, not
      // the original duration. Velocity goes the other way - the def's -5 lands on 59 and
      // the inline absolute replaces it outright.
      expect(parseFloat(note.getAttributeValue('duration.perf')!)).toBeCloseTo(324, 5);
      expect(parseFloat(note.getAttributeValue('velocity')!)).toBeCloseTo(100, 5);
    });

    it('renders the inline millisecond modifiers through both passes', () => {
      // The ms modifiers take two passes: pass one parks them on the note, pass two
      // consumes them.
      const map = mapOf(
        '<articulation date="0.0" absoluteDurationMs="160.0" absoluteDelayMs="25.0" />',
      );
      const noteMap = okValue(GenericMap.createGenericMap('someMap'));
      const note = new Element('note', Mpm.MPM_NAMESPACE);
      note.addAttribute(new Attribute('date', '0'));
      note.addAttribute(new Attribute('date.perf', '0'));
      note.addAttribute(new Attribute('duration.perf', '720'));
      note.addAttribute(new Attribute('velocity', '64'));
      noteMap.addElement(note);

      map.renderArticulationToMap_noMillisecondModifiers(noteMap);
      expect(note.getAttributeValue('articulation.absoluteDurationMs')).toBe('160');
      expect(note.getAttributeValue('articulation.absoluteDelayMs')).toBe('25');

      note.addAttribute(new Attribute('milliseconds.date', '1000'));
      note.addAttribute(new Attribute('milliseconds.date.end', '2000'));
      map.renderArticulationToMap_millisecondModifiers(noteMap);

      expect(parseFloat(note.getAttributeValue('milliseconds.date')!)).toBeCloseTo(1025, 5);
      expect(parseFloat(note.getAttributeValue('milliseconds.date.end')!)).toBeCloseTo(1185, 5);
    });
  });

  describe('articulateNote', () => {
    /** An articulation that names no def and carries no modifier: every field at its neutral. */
    const artic = (fields: Partial<Articulation> = {}): Articulation => ({
      xmlId: null,
      date: 0,
      noteid: null,
      articulationDefName: null,
      articulationDef: null,
      ...NEUTRAL_ARTICULATION_MODIFIERS,
      ...fields,
    });

    function createNote(datePerf: number, durationPerf: number, velocity: number): Element {
      const note = new Element('note', Mpm.MPM_NAMESPACE);
      note.addAttribute(new Attribute('date', '0'));
      note.addAttribute(new Attribute('date.perf', String(datePerf)));
      note.addAttribute(new Attribute('duration.perf', String(durationPerf)));
      note.addAttribute(new Attribute('velocity', String(velocity)));
      return note;
    }

    it('should return false for null note', () => {
      const ad = artic();
      expect(articulateNote(ad, null)).toBe(false);
    });

    it('absoluteDelay shifts date.perf', () => {
      const ad = artic({ absoluteDelay: 50 });

      const note = createNote(100, 200, 80);
      articulateNote(ad, note);

      expect(parseFloat(note.getAttributeValue('date.perf')!)).toBeCloseTo(150, 5);
    });

    it('absoluteDelay=0 does not shift date.perf', () => {
      const ad = artic({ absoluteDelay: 0 });

      const note = createNote(100, 200, 80);
      articulateNote(ad, note);

      expect(parseFloat(note.getAttributeValue('date.perf')!)).toBeCloseTo(100, 5);
    });

    it('negative absoluteDelay shifts date.perf backward', () => {
      const ad = artic({ absoluteDelay: -30 });

      const note = createNote(100, 200, 80);
      articulateNote(ad, note);

      expect(parseFloat(note.getAttributeValue('date.perf')!)).toBeCloseTo(70, 5);
    });

    it('absoluteDelayMs sets articulation.absoluteDelayMs attribute', () => {
      const ad = artic({ absoluteDelayMs: 25 });

      const note = createNote(100, 200, 80);
      articulateNote(ad, note);

      const attr = note.getAttribute('articulation.absoluteDelayMs');
      expect(attr).not.toBeNull();
      expect(parseFloat(attr!.getValue())).toBeCloseTo(25, 5);
    });

    it('absoluteDuration sets duration.perf to fixed value', () => {
      const ad = artic({ absoluteDuration: 100 });

      const note = createNote(100, 200, 80);
      articulateNote(ad, note);

      expect(parseFloat(note.getAttributeValue('duration.perf')!)).toBeCloseTo(100, 5);
    });

    it('relativeDuration multiplies duration.perf', () => {
      const ad = artic({ relativeDuration: 0.5 });

      const note = createNote(100, 200, 80);
      articulateNote(ad, note);

      expect(parseFloat(note.getAttributeValue('duration.perf')!)).toBeCloseTo(100, 5);
    });

    it('relativeDuration=1.0 does not change duration.perf', () => {
      const ad = artic({ relativeDuration: 1.0 });

      const note = createNote(100, 200, 80);
      articulateNote(ad, note);

      expect(parseFloat(note.getAttributeValue('duration.perf')!)).toBeCloseTo(200, 5);
    });

    it('absoluteVelocity sets velocity to fixed value', () => {
      const ad = artic({ absoluteVelocity: 127 });

      const note = createNote(100, 200, 80);
      articulateNote(ad, note);

      expect(parseFloat(note.getAttributeValue('velocity')!)).toBeCloseTo(127, 5);
    });

    it('relativeVelocity multiplies velocity', () => {
      const ad = artic({ relativeVelocity: 0.5 });

      const note = createNote(100, 200, 80);
      articulateNote(ad, note);

      expect(parseFloat(note.getAttributeValue('velocity')!)).toBeCloseTo(40, 5);
    });

    it('absoluteVelocityChange adds to velocity', () => {
      const ad = artic({ absoluteVelocityChange: 20 });

      const note = createNote(100, 200, 80);
      articulateNote(ad, note);

      expect(parseFloat(note.getAttributeValue('velocity')!)).toBeCloseTo(100, 5);
    });

    it('negative absoluteVelocityChange reduces velocity', () => {
      const ad = artic({ absoluteVelocityChange: -30 });

      const note = createNote(100, 200, 80);
      articulateNote(ad, note);

      expect(parseFloat(note.getAttributeValue('velocity')!)).toBeCloseTo(50, 5);
    });

    it('detuneCents sets detuneCents attribute', () => {
      const ad = artic({ detuneCents: 15.0 });

      const note = createNote(100, 200, 80);
      articulateNote(ad, note);

      const attr = note.getAttribute('detuneCents');
      expect(attr).not.toBeNull();
      expect(parseFloat(attr!.getValue())).toBeCloseTo(15.0, 5);
    });

    it('detuneHz sets detuneHz attribute', () => {
      const ad = artic({ detuneHz: 3.5 });

      const note = createNote(100, 200, 80);
      articulateNote(ad, note);

      const attr = note.getAttribute('detuneHz');
      expect(attr).not.toBeNull();
      expect(parseFloat(attr!.getValue())).toBeCloseTo(3.5, 5);
    });

    it('detuneCents=0 does not add attribute', () => {
      const ad = artic({ detuneCents: 0.0 });

      const note = createNote(100, 200, 80);
      articulateNote(ad, note);

      expect(note.getAttribute('detuneCents')).toBeNull();
    });

    it('combined: absoluteDelay + relativeDuration + absoluteVelocityChange', () => {
      const ad = artic({ absoluteDelay: 20, relativeDuration: 0.75, absoluteVelocityChange: -10 });

      const note = createNote(100, 200, 80);
      articulateNote(ad, note);

      expect(parseFloat(note.getAttributeValue('date.perf')!)).toBeCloseTo(120, 5);
      expect(parseFloat(note.getAttributeValue('duration.perf')!)).toBeCloseTo(150, 5);
      expect(parseFloat(note.getAttributeValue('velocity')!)).toBeCloseTo(70, 5);
    });

    it('absoluteDurationMs sets articulation.absoluteDurationMs attribute', () => {
      const ad = artic({ absoluteDurationMs: 500 });

      const note = createNote(100, 200, 80);
      articulateNote(ad, note);

      const attr = note.getAttribute('articulation.absoluteDurationMs');
      expect(attr).not.toBeNull();
      expect(parseFloat(attr!.getValue())).toBeCloseTo(500, 5);
    });

    it('absoluteDurationChangeMs sets articulation.absoluteDurationChangeMs attribute', () => {
      const ad = artic({ absoluteDurationChangeMs: 50 });

      const note = createNote(100, 200, 80);
      articulateNote(ad, note);

      const attr = note.getAttribute('articulation.absoluteDurationChangeMs');
      expect(attr).not.toBeNull();
      expect(parseFloat(attr!.getValue())).toBeCloseTo(50, 5);
    });

    // absoluteDurationChange - DELIBERATE DIVERGENCE #1 (TD1 in PARITY.md).
    //
    // Java's ArticulationData.java:197 spells the halving loop `durNew >= 0.0` and has no
    // `duration > 0.0` guard, so it never terminates; the port follows the spelling of
    // Java's ArticulationDef.java:420-423 instead. These are the pinning tests for that
    // divergence, and they must fail rather than hang if it is ever undone.
    //
    // A vitest per-test timeout cannot do that on its own: a synchronous loop never yields
    // the event loop, so the timeout timer never fires - measured, a 1500 ms per-test
    // timeout let a plain `for (;;)` run until an external kill. The timeouts below are the
    // outer net; the watchdog is what converts non-termination into a failure. It counts
    // reads of `absoluteDurationChange`, which the loop body performs once per iteration, so
    // a loop that spins trips it within `maxReads` iterations.
    function articulateUnderWatchdog(ad: Articulation, note: Element, maxReads = 100_000): boolean {
      const change = ad.absoluteDurationChange;
      let reads = 0;
      Object.defineProperty(ad, 'absoluteDurationChange', {
        configurable: true,
        get() {
          if (++reads > maxReads)
            throw new Error(
              `articulateNote did not terminate: absoluteDurationChange was read ${reads} times`,
            );
          return change;
        },
      });
      try {
        return articulateNote(ad, note);
      } finally {
        Object.defineProperty(ad, 'absoluteDurationChange', {
          configurable: true,
          enumerable: true,
          writable: true,
          value: change,
        });
      }
    }

    it('absoluteDurationChange shortens a positive duration and marks the note modified', () => {
      const ad = artic({ xmlId: 'art1', absoluteDurationChange: -70 });

      const note = createNote(100, 200, 80);
      articulateUnderWatchdog(ad, note);

      // 200 - 70 = 130, positive on the first try, so the loop body never runs.
      expect(parseFloat(note.getAttributeValue('duration.perf')!)).toBeCloseTo(130, 5);
      expect(note.getAttributeValue('modified')).toBe('art1');
    }, 5000);

    it('absoluteDurationChange is halved until the duration stays positive', () => {
      const ad = artic({ xmlId: 'art1', absoluteDurationChange: -400 });

      const note = createNote(100, 100, 80);
      articulateUnderWatchdog(ad, note);

      // -400 -> -200 -> -100 (duration 0, still not positive) -> -50 => 50.
      expect(parseFloat(note.getAttributeValue('duration.perf')!)).toBeCloseTo(50, 5);
      expect(note.getAttributeValue('modified')).toBe('art1');
    }, 5000);

    it('absoluteDurationChange is skipped for a zero duration, which stays unmodified', () => {
      // The case that discriminates the two candidate fixes: with the flipped comparison
      // but no guard this spins forever, because durNew converges to 0.0 and stays <= 0.0.
      // duration.perf="0.0" is real - it occurs in composite_advanced_augmented.msm.
      const ad = artic({ xmlId: 'art1', absoluteDurationChange: -70 });

      const note = createNote(100, 0, 80);
      articulateUnderWatchdog(ad, note);

      expect(parseFloat(note.getAttributeValue('duration.perf')!)).toBe(0);
      expect(note.getAttribute('modified')).toBeNull();
    }, 5000);

    it('absoluteDurationChange is skipped for a negative duration, which stays unmodified', () => {
      const ad = artic({ xmlId: 'art1', absoluteDurationChange: -70 });

      const note = createNote(100, -10, 80);
      articulateUnderWatchdog(ad, note);

      expect(parseFloat(note.getAttributeValue('duration.perf')!)).toBeCloseTo(-10, 5);
      expect(note.getAttribute('modified')).toBeNull();
    }, 5000);

    it('a positive absoluteDurationChange lengthens the note without halving', () => {
      const ad = artic({ xmlId: 'art1', absoluteDurationChange: 50 });

      const note = createNote(100, 200, 80);
      articulateUnderWatchdog(ad, note);

      expect(parseFloat(note.getAttributeValue('duration.perf')!)).toBeCloseTo(250, 5);
      expect(note.getAttributeValue('modified')).toBe('art1');
    }, 5000);

    it('absoluteDurationChange does not compose with the other duration modifiers', () => {
      // ArticulationData reads duration.perf once, up front, so the last duration branch to
      // fire simply overwrites - unlike ArticulationDef, which re-reads and therefore
      // composes. TD1 kept that difference: the guard tests the hoisted local, it does not
      // re-read the attribute.
      const ad = artic({ xmlId: 'art1', relativeDuration: 0.5, absoluteDurationChange: -70 });

      const note = createNote(100, 200, 80);
      articulateUnderWatchdog(ad, note);

      // Computed from the original 200, not from the 100 relativeDuration just wrote.
      expect(parseFloat(note.getAttributeValue('duration.perf')!)).toBeCloseTo(130, 5);
    });
  });

  describe('renderArticulationToMap_millisecondModifiers', () => {
    function createMsMapEntry(date: number, msDate: number, msEnd: number): Element {
      const e = new Element('note', Mpm.MPM_NAMESPACE);
      e.addAttribute(new Attribute('date', String(date)));
      e.addAttribute(new Attribute('milliseconds.date', String(msDate)));
      e.addAttribute(new Attribute('milliseconds.date.end', String(msEnd)));
      return e;
    }

    it('should apply absoluteDelayMs to milliseconds.date', () => {
      const map = ArticulationMap.createArticulationMap();
      const target = okValue(GenericMap.createGenericMap('positionMap'));
      const entry = createMsMapEntry(0, 100, 200);
      entry.addAttribute(new Attribute('articulation.absoluteDelayMs', '25'));
      target.addElement(entry);

      map.renderArticulationToMap_millisecondModifiers(target);

      expect(parseFloat(entry.getAttributeValue('milliseconds.date')!)).toBeCloseTo(125, 5);
      expect(entry.getAttribute('articulation.absoluteDelayMs')).toBeNull();
    });

    it('should apply absoluteDurationMs to milliseconds.date.end', () => {
      const map = ArticulationMap.createArticulationMap();
      const target = okValue(GenericMap.createGenericMap('positionMap'));
      const entry = createMsMapEntry(0, 100, 200);
      entry.addAttribute(new Attribute('articulation.absoluteDurationMs', '50'));
      target.addElement(entry);

      map.renderArticulationToMap_millisecondModifiers(target);

      // absoluteDurationMs is measured from the (undelayed) start, not added to the end.
      expect(parseFloat(entry.getAttributeValue('milliseconds.date.end')!)).toBeCloseTo(150, 5);
    });

    it('should apply absoluteDurationChangeMs to milliseconds.date.end', () => {
      const map = ArticulationMap.createArticulationMap();
      const target = okValue(GenericMap.createGenericMap('positionMap'));
      const entry = createMsMapEntry(0, 100, 200);
      entry.addAttribute(new Attribute('articulation.absoluteDurationChangeMs', '30'));
      target.addElement(entry);

      map.renderArticulationToMap_millisecondModifiers(target);

      expect(parseFloat(entry.getAttributeValue('milliseconds.date.end')!)).toBeCloseTo(230, 5);
    });

    it('should combine delay and duration change', () => {
      const map = ArticulationMap.createArticulationMap();
      const target = okValue(GenericMap.createGenericMap('positionMap'));
      const entry = createMsMapEntry(0, 100, 200);
      entry.addAttribute(new Attribute('articulation.absoluteDelayMs', '10'));
      entry.addAttribute(new Attribute('articulation.absoluteDurationChangeMs', '20'));
      target.addElement(entry);

      map.renderArticulationToMap_millisecondModifiers(target);

      expect(parseFloat(entry.getAttributeValue('milliseconds.date')!)).toBeCloseTo(110, 5);
      expect(parseFloat(entry.getAttributeValue('milliseconds.date.end')!)).toBeCloseTo(220, 5);
    });

    it('should not modify if dateNew >= endNew', () => {
      const map = ArticulationMap.createArticulationMap();
      const target = okValue(GenericMap.createGenericMap('positionMap'));
      const entry = createMsMapEntry(0, 100, 110);
      entry.addAttribute(new Attribute('articulation.absoluteDelayMs', '50'));
      target.addElement(entry);

      map.renderArticulationToMap_millisecondModifiers(target);

      // The delay would put the start at 150, past the end at 110, so nothing is written.
      expect(parseFloat(entry.getAttributeValue('milliseconds.date')!)).toBeCloseTo(100, 5);
      expect(parseFloat(entry.getAttributeValue('milliseconds.date.end')!)).toBeCloseTo(110, 5);
    });

    it('null map is handled gracefully', () => {
      const map = ArticulationMap.createArticulationMap();
      map.renderArticulationToMap_millisecondModifiers(null);
    });

    it('static renderArticulationToMap_millisecondModifiers delegates correctly', () => {
      const map = ArticulationMap.createArticulationMap();
      const target = okValue(GenericMap.createGenericMap('positionMap'));
      const entry = createMsMapEntry(0, 100, 200);
      entry.addAttribute(new Attribute('articulation.absoluteDelayMs', '25'));
      target.addElement(entry);

      ArticulationMap.renderArticulationToMap_millisecondModifiers(target, map);

      expect(parseFloat(entry.getAttributeValue('milliseconds.date')!)).toBeCloseTo(125, 5);
    });

    it('static with null articulation map does nothing', () => {
      const target = okValue(GenericMap.createGenericMap('positionMap'));
      ArticulationMap.renderArticulationToMap_millisecondModifiers(target, null);
    });
  });

  describe('GenericMap operations', () => {
    it('should support removeElement by index', () => {
      const map = ArticulationMap.createArticulationMap();
      map.addArticulation({ date: 0, nameRef: 'staccato' });
      map.addArticulation({ date: 960, nameRef: 'legato' });

      map.removeElementAt(0);
      expect(map.size()).toBe(1);
      expect(map.getElement(0)!.getAttributeValue('name.ref')).toBe('legato');
    });

    it('should support setId and getId', () => {
      const map = ArticulationMap.createArticulationMap();
      expect(map.getId()).toBeNull();

      map.setId('articMap-1');
      expect(map.getId()).toBe('articMap-1');
    });

    it('should support getElementBeforeAt', () => {
      const map = ArticulationMap.createArticulationMap();
      map.addArticulation({ date: 0, nameRef: 'staccato' });
      map.addArticulation({ date: 480, nameRef: 'legato' });
      map.addArticulation({ date: 960, nameRef: 'accent' });

      const elem = map.getElementBeforeAt(500);
      expect(elem).not.toBeNull();
      expect(elem!.getAttributeValue('name.ref')).toBe('legato');
    });
  });
});

describe('getArticulationOptionsOf / updateArticulationAt', () => {
  const makeMap = () => ArticulationMap.createArticulationMap();

  /** Every modifier set, each to a value distinct from its neutral and from the others. */
  const allTwelve: AddArticulationOptions = {
    date: 720,
    nameRef: 'staccato',
    noteid: '#note42',
    absoluteDuration: 240,
    absoluteDurationChange: -30,
    relativeDuration: 0.5,
    absoluteDurationMs: 125,
    absoluteDurationChangeMs: -12.5,
    absoluteDelay: 15,
    absoluteDelayMs: 7.5,
    absoluteVelocity: 96,
    absoluteVelocityChange: -8,
    relativeVelocity: 1.2,
    detuneCents: -25,
    detuneHz: 3.5,
    id: 'art-all',
  };

  it('round-trips every shape addArticulation can write', () => {
    expectOptionsRoundTrip<ArticulationMap, AddArticulationOptions>({
      makeMap,
      add: (map, o) => map.addArticulation(o),
      read: (map, i) => map.getArticulationOptionsOf(i),
      samples: [
        { date: 0, nameRef: 'staccato' },
        { date: 240, nameRef: 'legato', noteid: '#note5' },
        allTwelve,
        { date: 480, nameRef: 'accent', relativeVelocity: 1.5, detuneHz: -2, id: 'art-mix' },
      ],
    });
  });

  it('reads back each of the twelve modifiers addArticulation wrote', () => {
    const map = makeMap();
    map.addArticulation(allTwelve);

    expect(map.getArticulationOptionsOf(0)).toEqual(allTwelve);
  });

  it('returns @noteid verbatim, where getArticulationDataOf strips the leading #', () => {
    const map = makeMap();
    map.addArticulation({ date: 0, nameRef: 'staccato', noteid: '#note1' });

    expect(map.getArticulationOptionsOf(0)?.noteid).toBe('#note1');
    expect(map.getArticulationDataOf(0)?.noteid).toBe('note1');
  });

  it('reads an absent modifier as undefined, where getArticulationDataOf reads its neutral', () => {
    const map = makeMap();
    map.addArticulation({ date: 0, nameRef: 'staccato' });

    const options = map.getArticulationOptionsOf(0)!;
    const data = map.getArticulationDataOf(0)!;
    for (const name of Object.keys(
      NEUTRAL_ARTICULATION_MODIFIERS,
    ) as (keyof typeof NEUTRAL_ARTICULATION_MODIFIERS)[]) {
      expect(options[name], name).toBeUndefined();
      expect(data[name], name).toBe(NEUTRAL_ARTICULATION_MODIFIERS[name]);
    }
  });

  it('leaves an omitted field alone, removes one patched to undefined', () => {
    const map = makeMap();
    map.addArticulation({ date: 0, nameRef: 'staccato', relativeDuration: 0.5, detuneCents: 12 });

    expect(map.updateArticulationAt(0, { relativeDuration: 0.75 })).toBe(true);
    expect(map.getArticulationOptionsOf(0)).toMatchObject({
      relativeDuration: 0.75,
      detuneCents: 12,
      nameRef: 'staccato',
    });

    map.updateArticulationAt(0, { detuneCents: undefined });
    expect(map.getArticulationOptionsOf(0)?.detuneCents).toBeUndefined();
    expect(map.getElement(0)?.getAttribute('detuneCents')).toBeNull();
  });

  it('writes through an existing attribute rather than moving it to the end', () => {
    const map = makeMap();
    map.addArticulation(allTwelve);
    const before = map.getElement(0)?.toXML();

    map.updateArticulationAt(0, { absoluteDuration: 240, detuneHz: 3.5 });
    expect(map.getElement(0)?.toXML()).toBe(before);
  });

  it('never touches an attribute no option names', () => {
    const map = makeMap();
    map.addArticulation({ date: 0, nameRef: 'staccato' });
    map.getElement(0)?.addAttribute(new Attribute('corresp', 'arg1'));

    map.updateArticulationAt(0, { relativeDuration: 0.5, id: 'art-1' });
    expect(map.getElement(0)?.getAttributeValue('corresp')).toBe('arg1');
  });

  it('re-keys and re-sorts the map when @date is patched', () => {
    const map = makeMap();
    map.addArticulation({ date: 0, nameRef: 'staccato', id: 'first' });
    map.addArticulation({ date: 1000, nameRef: 'legato', id: 'second' });

    map.updateArticulationAt(0, { date: 2000 });

    expect(map.getAllElements().map((e) => e.key)).toEqual([1000, 2000]);
    expect(map.getElement(0)?.getAttributeValue('xml:id')).toBe('second');
    // The lookup index moved with it, which is the half that writing the attribute alone misses.
    expect(map.getElementBeforeAt(2500)?.getAttributeValue('xml:id')).toBe('first');
  });

  it('refuses an entry that is not an <articulation>', () => {
    const map = makeMap();
    map.addArticulationStyleSwitch(0, 'someStyle');

    expect(map.getArticulationOptionsOf(0)).toBeNull();
    expect(map.updateArticulationAt(0, { relativeDuration: 0.5 })).toBe(false);
  });

  // The spec marks @name.ref optional and gives an example without one; addArticulation
  // requires it, so such a document has no options that would write it.
  it('refuses an articulation carrying no @name.ref', () => {
    const map = okValue(
      ArticulationMap.createArticulationMap(
        new Builder()
          .build(
            `<articulationMap xmlns="${Mpm.MPM_NAMESPACE}">` +
              '<articulation date="5670.0" noteid="#note05821" relativeDuration="0.4" />' +
              '</articulationMap>',
          )
          .getRootElement(),
      ),
    );

    expect(map.getArticulationOptionsOf(0)).toBeNull();
    expect(map.getArticulationDataOf(0)).not.toBeNull();
  });
});
