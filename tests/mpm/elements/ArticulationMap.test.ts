import { describe, it, expect } from 'vitest';
import { okValue } from '../../support/result.js';
import { ArticulationMap } from '../../../src/mpm/elements/maps/ArticulationMap.js';
import { ArticulationData } from '../../../src/mpm/elements/maps/data/ArticulationData.js';
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
      const index = map.addArticulation(0, 'staccato', 'note1', 'art-1');
      expect(index).toBeGreaterThanOrEqual(0);
      expect(map.size()).toBe(1);
    });

    it('should store attributes correctly', () => {
      const map = ArticulationMap.createArticulationMap();
      const index = map.addArticulation(0, 'legato', 'note2', 'art-2');
      const elem = map.getElement(index)!;

      expect(elem.getLocalName()).toBe('articulation');
      expect(elem.getAttributeValue('date')).toBe('0');
      expect(elem.getAttributeValue('name.ref')).toBe('legato');
      expect(elem.getAttributeValue('noteid')).toBe('note2');
    });

    it('should store xmlId', () => {
      const map = ArticulationMap.createArticulationMap();
      const index = map.addArticulation(0, 'staccato', null, 'art-3');
      const elem = map.getElement(index)!;

      const idAttr = elem.getAttribute('id', 'http://www.w3.org/XML/1998/namespace');
      expect(idAttr).not.toBeNull();
      expect(idAttr!.getValue()).toBe('art-3');
    });

    it('should return -1 for null articulationDefName', () => {
      const map = ArticulationMap.createArticulationMap();
      const index = map.addArticulation(0, null, 'note1', 'art-1');
      expect(index).toBe(-1);
      expect(map.size()).toBe(0);
    });

    it('should handle null noteid and id gracefully', () => {
      const map = ArticulationMap.createArticulationMap();
      const index = map.addArticulation(0, 'staccato', null, null);
      expect(index).toBeGreaterThanOrEqual(0);
      expect(map.size()).toBe(1);

      const elem = map.getElement(index)!;
      expect(elem.getAttribute('noteid')).toBeNull();
    });

    it('should maintain sorted order when adding out of order', () => {
      const map = ArticulationMap.createArticulationMap();
      map.addArticulation(960, 'staccato', null, null);
      map.addArticulation(0, 'legato', null, null);
      map.addArticulation(480, 'accent', null, null);

      expect(map.size()).toBe(3);
      expect(map.getElement(0)!.getAttributeValue('date')).toBe('0');
      expect(map.getElement(1)!.getAttributeValue('date')).toBe('480');
      expect(map.getElement(2)!.getAttributeValue('date')).toBe('960');
    });
  });

  describe('addArticulationFromData', () => {
    it('should add an articulation from ArticulationData', () => {
      const map = ArticulationMap.createArticulationMap();
      const ad = new ArticulationData();
      ad.date = 0;
      ad.articulationDefName = 'staccato';

      const index = map.addArticulationFromData(ad);
      expect(index).toBeGreaterThanOrEqual(0);
      expect(map.size()).toBe(1);
    });

    it('should store absoluteDurationChange when non-zero', () => {
      const map = ArticulationMap.createArticulationMap();
      const ad = new ArticulationData();
      ad.date = 0;
      ad.articulationDefName = 'staccato';
      ad.absoluteDurationChange = -100;

      const index = map.addArticulationFromData(ad);
      const elem = map.getElement(index)!;
      expect(elem.getAttributeValue('absoluteDurationChange')).toBe('-100');
    });

    it('should store relativeDuration when not 1.0', () => {
      const map = ArticulationMap.createArticulationMap();
      const ad = new ArticulationData();
      ad.date = 0;
      ad.articulationDefName = 'staccato';
      ad.relativeDuration = 0.5;

      const index = map.addArticulationFromData(ad);
      const elem = map.getElement(index)!;
      expect(elem.getAttributeValue('relativeDuration')).toBe('0.5');
    });

    it('should not store relativeDuration when 1.0 (default)', () => {
      const map = ArticulationMap.createArticulationMap();
      const ad = new ArticulationData();
      ad.date = 0;
      ad.articulationDefName = 'staccato';
      ad.relativeDuration = 1.0;

      const index = map.addArticulationFromData(ad);
      const elem = map.getElement(index)!;
      expect(elem.getAttribute('relativeDuration')).toBeNull();
    });

    it('should not store absoluteDurationChange when 0.0 (default)', () => {
      const map = ArticulationMap.createArticulationMap();
      const ad = new ArticulationData();
      ad.date = 0;
      ad.articulationDefName = 'staccato';
      ad.absoluteDurationChange = 0.0;

      const index = map.addArticulationFromData(ad);
      const elem = map.getElement(index)!;
      expect(elem.getAttribute('absoluteDurationChange')).toBeNull();
    });

    it('should store absoluteDuration when not null', () => {
      const map = ArticulationMap.createArticulationMap();
      const ad = new ArticulationData();
      ad.date = 0;
      ad.articulationDefName = 'staccato';
      ad.absoluteDuration = 240;

      const index = map.addArticulationFromData(ad);
      const elem = map.getElement(index)!;
      expect(elem.getAttributeValue('absoluteDuration')).toBe('240');
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
      map.addArticulation(0, 'staccato', null, null);
      expect(map.getArticulationDataOf(-1)).toBeNull();
    });

    it('should return ArticulationData for a valid articulation', () => {
      const map = ArticulationMap.createArticulationMap();
      map.addArticulation(0, 'staccato', 'note1', null);

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
      map.addArticulation(0, 'staccato', null, null);

      const ad = map.getArticulationDataOf(100);
      expect(ad).not.toBeNull();
      expect(ad!.articulationDefName).toBe('staccato');
    });

    it('round-trip: addArticulation -> getArticulationDataOf preserves values', () => {
      const map = ArticulationMap.createArticulationMap();
      map.addArticulation(240, 'legato', 'note5', 'art-5');

      const ad = map.getArticulationDataOf(0)!;
      expect(ad.date).toBe(240);
      expect(ad.articulationDefName).toBe('legato');
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

      map.getArticulationDataOf(0)!.articulateNote(note);

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
      ad.articulateNote(note);

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

      expect(parseFloat(note.getAttributeValue('velocity')!)).toBeCloseTo(40, 5);
    });

    it('absoluteVelocityChange adds to velocity', () => {
      const ad = new ArticulationData();
      ad.absoluteVelocityChange = 20;

      const note = createNote(100, 200, 80);
      ad.articulateNote(note);

      expect(parseFloat(note.getAttributeValue('velocity')!)).toBeCloseTo(100, 5);
    });

    it('negative absoluteVelocityChange reduces velocity', () => {
      const ad = new ArticulationData();
      ad.absoluteVelocityChange = -30;

      const note = createNote(100, 200, 80);
      ad.articulateNote(note);

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
    function articulateUnderWatchdog(
      ad: ArticulationData,
      note: Element,
      maxReads = 100_000,
    ): boolean {
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
        return ad.articulateNote(note);
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
      const ad = new ArticulationData();
      ad.xmlId = 'art1';
      ad.absoluteDurationChange = -70;

      const note = createNote(100, 200, 80);
      articulateUnderWatchdog(ad, note);

      // 200 - 70 = 130, positive on the first try, so the loop body never runs.
      expect(parseFloat(note.getAttributeValue('duration.perf')!)).toBeCloseTo(130, 5);
      expect(note.getAttributeValue('modified')).toBe('art1');
    }, 5000);

    it('absoluteDurationChange is halved until the duration stays positive', () => {
      const ad = new ArticulationData();
      ad.xmlId = 'art1';
      ad.absoluteDurationChange = -400;

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
      const ad = new ArticulationData();
      ad.xmlId = 'art1';
      ad.absoluteDurationChange = -70;

      const note = createNote(100, 0, 80);
      articulateUnderWatchdog(ad, note);

      expect(parseFloat(note.getAttributeValue('duration.perf')!)).toBe(0);
      expect(note.getAttribute('modified')).toBeNull();
    }, 5000);

    it('absoluteDurationChange is skipped for a negative duration, which stays unmodified', () => {
      const ad = new ArticulationData();
      ad.xmlId = 'art1';
      ad.absoluteDurationChange = -70;

      const note = createNote(100, -10, 80);
      articulateUnderWatchdog(ad, note);

      expect(parseFloat(note.getAttributeValue('duration.perf')!)).toBeCloseTo(-10, 5);
      expect(note.getAttribute('modified')).toBeNull();
    }, 5000);

    it('a positive absoluteDurationChange lengthens the note without halving', () => {
      const ad = new ArticulationData();
      ad.xmlId = 'art1';
      ad.absoluteDurationChange = 50;

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
      const ad = new ArticulationData();
      ad.xmlId = 'art1';
      ad.relativeDuration = 0.5;
      ad.absoluteDurationChange = -70;

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
      map.addArticulation(0, 'staccato', null, null);
      map.addArticulation(960, 'legato', null, null);

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
      map.addArticulation(0, 'staccato', null, null);
      map.addArticulation(480, 'legato', null, null);
      map.addArticulation(960, 'accent', null, null);

      const elem = map.getElementBeforeAt(500);
      expect(elem).not.toBeNull();
      expect(elem!.getAttributeValue('name.ref')).toBe('legato');
    });
  });
});
