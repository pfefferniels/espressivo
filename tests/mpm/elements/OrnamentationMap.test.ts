import { describe, it, expect, vi } from 'vitest';
import { okValue } from '../../support/result.js';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { OrnamentationMap } from '../../../src/mpm/elements/maps/OrnamentationMap.js';
import { Performance } from '../../../src/mpm/elements/Performance.js';
import { OrnamentData } from '../../../src/mpm/elements/maps/data/OrnamentData.js';
import { OrnamentNote } from '../../../src/mpm/elements/maps/data/OrnamentNote.js';
import { GenericMap } from '../../../src/mpm/elements/maps/GenericMap.js';
import { Element, Attribute, Builder } from '../../../src/xml/XomTypes.js';
import { Mpm } from '../../../src/mpm/Mpm.js';
import { Header } from '../../../src/mpm/elements/Header.js';
import { createStyle } from '../../../src/mpm/elements/styles/style.js';
import { OrnamentDef } from '../../../src/mpm/elements/styles/defs/OrnamentDef.js';
import { FrameDomain, NoteOffShift } from '../../../src/mpm/elements/styles/defs/TemporalSpread.js';
import type { RenderContext } from '../../../src/mpm/RenderOptions.js';

const XML_NS = 'http://www.w3.org/XML/1998/namespace';

/** numeric attribute read-back */
function num(e: Element, name: string): number {
  return parseFloat(e.getAttributeValue(name)!);
}

/** a bare MSM note */
function makeNote(
  id: string,
  date: number,
  pitch: number,
  extra: Record<string, string> = {},
): Element {
  const n = new Element('note');
  n.addAttribute(new Attribute('xml:id', XML_NS, id));
  n.addAttribute(new Attribute('date', String(date)));
  n.addAttribute(new Attribute('midi.pitch', String(pitch)));
  for (const [k, v] of Object.entries(extra)) n.addAttribute(new Attribute(k, v));
  return n;
}

/**
 * An MSM note as it looks when the rendering pipeline reaches the ornamentation stage:
 * dynamics and performance timing attributes are already in place
 * (see Performance.renderPerformanceToPart, which calls the ornamentation last).
 */
function makePerformedNote(
  id: string,
  date: number,
  pitch: number,
  duration = 1440,
  velocity = 100,
): Element {
  return makeNote(id, date, pitch, {
    duration: String(duration),
    velocity: String(velocity),
    'date.perf': String(date),
    'duration.perf': String(duration),
    'date.end.perf': String(date + duration),
  });
}

/** an MSM score map holding the given notes */
function makeScore(notes: Element[]): GenericMap {
  const score = okValue(GenericMap.createGenericMap('score'));
  for (const n of notes) score.addElement(n);
  return score;
}

/** an MSM part element wrapping the given notes in dated/score */
function makePart(notes: Element[]): Element {
  const part = new Element('part');
  const dated = new Element('dated');
  const score = new Element('score');
  for (const n of notes) score.appendChild(n);
  dated.appendChild(score);
  part.appendChild(dated);
  return part;
}

/** the "arpeggio" ornamentDef of the Java reference fixture (ornamentation.mpm) */
function arpeggioDef(): OrnamentDef {
  const def = okValue(OrnamentDef.createOrnamentDef('arpeggio'));
  def.setDynamicsGradientValues(-1.0, 1.0);
  def.setTemporalSpreadValues(-22.0, 44.0, FrameDomain.Ticks, 1.0, NoteOffShift.False);
  return def;
}

/** the "spreadMs" ornamentDef of the Java reference fixture (ornamentation.mpm) */
function spreadMsDef(): OrnamentDef {
  const def = okValue(OrnamentDef.createOrnamentDef('spreadMs'));
  def.setDynamicsGradientValues(-0.5, 0.5);
  def.setTemporalSpreadValues(-30.0, 60.0, FrameDomain.Milliseconds, 2.0, NoteOffShift.True);
  return def;
}

/** a header carrying an ornamentationStyle named "orn style" with the given defs */
function makeHeader(defs: OrnamentDef[], styleName = 'orn style'): Header {
  const header = okValue(Header.createHeader());
  const style = createStyle('ornamentation', styleName);
  for (const d of defs) style.addDef(d);
  header.addStyleDef(Mpm.ORNAMENTATION_STYLE, style);
  return header;
}

describe('OrnamentationMap', () => {
  describe('createOrnamentationMap', () => {
    it('should create an empty ornamentation map', () => {
      const map = OrnamentationMap.createOrnamentationMap();
      expect(map).not.toBeNull();
      expect(map!.getType()).toBe('ornamentationMap');
    });

    it('should start with size 0', () => {
      const map = OrnamentationMap.createOrnamentationMap();
      expect(map.size()).toBe(0);
      expect(map.isEmpty()).toBe(true);
    });

    it('should have an XML element', () => {
      const map = OrnamentationMap.createOrnamentationMap();
      expect(map.getXml()).not.toBeNull();
      expect(map.getXml()!.getLocalName()).toBe('ornamentationMap');
    });
  });

  describe('addOrnament', () => {
    it('should add an ornament with required parameters only', () => {
      const map = OrnamentationMap.createOrnamentationMap();
      const index = map.addOrnament(0, 'trill');
      expect(index).toBeGreaterThanOrEqual(0);
      expect(map.size()).toBe(1);
    });

    it('should store date and name.ref', () => {
      const map = OrnamentationMap.createOrnamentationMap();
      const index = map.addOrnament(240, 'mordent');
      const elem = map.getElement(index)!;

      expect(elem.getLocalName()).toBe('ornament');
      expect(elem.getAttributeValue('date')).toBe('240');
      expect(elem.getAttributeValue('name.ref')).toBe('mordent');
    });

    it('should not store scale if it is 1.0 (default)', () => {
      const map = OrnamentationMap.createOrnamentationMap();
      const index = map.addOrnament(0, 'trill', 1.0);
      const elem = map.getElement(index)!;

      expect(elem.getAttribute('scale')).toBeNull();
    });

    it('should store scale if not 1.0', () => {
      const map = OrnamentationMap.createOrnamentationMap();
      const index = map.addOrnament(0, 'trill', 2.0);
      const elem = map.getElement(index)!;

      expect(elem.getAttributeValue('scale')).toBe('2');
    });

    it('should store note.order with individual note IDs', () => {
      const map = OrnamentationMap.createOrnamentationMap();
      const index = map.addOrnament(0, 'trill', 1.0, ['note1', 'note2', 'note3']);
      const elem = map.getElement(index)!;

      const noteOrder = elem.getAttributeValue('note.order');
      expect(noteOrder).not.toBeNull();
      expect(noteOrder).toContain('#note1');
      expect(noteOrder).toContain('#note2');
      expect(noteOrder).toContain('#note3');
    });

    it('should store note.order with ascending pitch', () => {
      const map = OrnamentationMap.createOrnamentationMap();
      const index = map.addOrnament(0, 'trill', 1.0, ['ascending pitch']);
      const elem = map.getElement(index)!;

      expect(elem.getAttributeValue('note.order')).toBe('ascending pitch');
    });

    it('should store note.order with descending pitch', () => {
      const map = OrnamentationMap.createOrnamentationMap();
      const index = map.addOrnament(0, 'trill', 1.0, ['descending pitch']);
      const elem = map.getElement(index)!;

      expect(elem.getAttributeValue('note.order')).toBe('descending pitch');
    });

    it('should not store note.order if null', () => {
      const map = OrnamentationMap.createOrnamentationMap();
      const index = map.addOrnament(0, 'trill', 1.0, null);
      const elem = map.getElement(index)!;

      expect(elem.getAttribute('note.order')).toBeNull();
    });

    it('should store xml:id if provided', () => {
      const map = OrnamentationMap.createOrnamentationMap();
      const index = map.addOrnament(0, 'trill', 1.0, null, 'orn-1');
      const elem = map.getElement(index)!;

      const idAttr = elem.getAttribute('id', 'http://www.w3.org/XML/1998/namespace');
      expect(idAttr).not.toBeNull();
      expect(idAttr!.getValue()).toBe('orn-1');
    });

    it('should not store xml:id if null', () => {
      const map = OrnamentationMap.createOrnamentationMap();
      const index = map.addOrnament(0, 'trill', 1.0, null, null);
      const elem = map.getElement(index)!;

      expect(elem.getAttribute('id', 'http://www.w3.org/XML/1998/namespace')).toBeNull();
    });

    it('should not store xml:id if empty string', () => {
      const map = OrnamentationMap.createOrnamentationMap();
      const index = map.addOrnament(0, 'trill', 1.0, null, '');
      const elem = map.getElement(index)!;

      expect(elem.getAttribute('id', 'http://www.w3.org/XML/1998/namespace')).toBeNull();
    });

    it('should maintain sorted order when adding out of order', () => {
      const map = OrnamentationMap.createOrnamentationMap();
      map.addOrnament(960, 'mordent');
      map.addOrnament(0, 'trill');
      map.addOrnament(480, 'turn');

      expect(map.size()).toBe(3);
      expect(map.getElement(0)!.getAttributeValue('date')).toBe('0');
      expect(map.getElement(1)!.getAttributeValue('date')).toBe('480');
      expect(map.getElement(2)!.getAttributeValue('date')).toBe('960');
    });
  });

  describe('addOrnamentFromData', () => {
    it('should return -1 if no ornamentDef and no ornamentDefName', () => {
      const map = OrnamentationMap.createOrnamentationMap();
      const od = new OrnamentData();
      od.date = 0;
      od.ornamentDef = null;
      od.ornamentDefName = null;

      const index = map.addOrnamentFromData(od);
      expect(index).toBe(-1);
      expect(map.size()).toBe(0);
    });

    it('should add ornament with ornamentDefName', () => {
      const map = OrnamentationMap.createOrnamentationMap();
      const od = new OrnamentData();
      od.date = 100;
      od.ornamentDefName = 'trill';
      od.scale = 1.5;

      const index = map.addOrnamentFromData(od);
      expect(index).toBeGreaterThanOrEqual(0);
      expect(map.size()).toBe(1);
    });
  });

  describe('getOrnamentDataOf', () => {
    it('should return null for an empty map', () => {
      const map = OrnamentationMap.createOrnamentationMap();
      expect(map.getOrnamentDataOf(0)).toBeNull();
    });

    it('should return null for negative index', () => {
      const map = OrnamentationMap.createOrnamentationMap();
      map.addOrnament(0, 'trill');
      expect(map.getOrnamentDataOf(-1)).toBeNull();
    });

    it('should return null when no style is configured', () => {
      // Without a proper header/style configured, getOrnamentDataOf returns null
      const map = OrnamentationMap.createOrnamentationMap();
      map.addOrnament(0, 'trill');

      const result = map.getOrnamentDataOf(0);
      expect(result).toBeNull();
    });
  });

  describe('OrnamentData', () => {
    it('should have correct default values', () => {
      const od = new OrnamentData();
      expect(od.date).toBe(0.0);
      expect(od.scale).toBe(0.0);
      expect(od.noteOrder).toBeNull();
      expect(od.xml).toBeNull();
      expect(od.xmlId).toBeNull();
      expect(od.styleName).toBe('');
      expect(od.style).toBeNull();
      expect(od.ornamentDefName).toBeNull();
      expect(od.ornamentDef).toBeNull();
    });

    it('should clone correctly', () => {
      const od = new OrnamentData();
      od.date = 240;
      od.scale = 2.0;
      od.noteOrder = ['note1', 'note2'];
      od.xmlId = 'orn-clone';
      od.styleName = 'testStyle';
      od.ornamentDefName = 'trill';

      const clone = od.clone();
      expect(clone.date).toBe(240);
      expect(clone.scale).toBe(2.0);
      expect(clone.noteOrder).toEqual(['note1', 'note2']);
      expect(clone.xmlId).toBe('orn-clone');
      expect(clone.styleName).toBe('testStyle');
      expect(clone.ornamentDefName).toBe('trill');
    });

    it('clone should have independent noteOrder array', () => {
      const od = new OrnamentData();
      od.noteOrder = ['note1', 'note2'];

      const clone = od.clone();
      clone.noteOrder!.push('note3');

      expect(od.noteOrder).toEqual(['note1', 'note2']);
      expect(clone.noteOrder).toEqual(['note1', 'note2', 'note3']);
    });

    it('clone with null noteOrder remains null', () => {
      const od = new OrnamentData();
      od.noteOrder = null;

      const clone = od.clone();
      expect(clone.noteOrder).toBeNull();
    });

    it('clone should be independent of original for scalars', () => {
      const od = new OrnamentData();
      od.date = 100;
      od.scale = 3.0;

      const clone = od.clone();
      clone.date = 200;
      clone.scale = 1.0;

      expect(od.date).toBe(100);
      expect(od.scale).toBe(3.0);
    });

    it('should read date, name.ref and scale off an element', () => {
      const xml = new Element('ornament', Mpm.MPM_NAMESPACE);
      xml.addAttribute(new Attribute('date', '480'));
      xml.addAttribute(new Attribute('name.ref', 'turn'));
      xml.addAttribute(new Attribute('scale', '2.5'));

      const od = readOrnament(xml);
      expect(od.date).toBe(480);
      expect(od.ornamentDefName).toBe('turn');
      expect(od.scale).toBe(2.5);
    });

    it('should parse the xml:id from XML', () => {
      const xml = new Element('ornament', Mpm.MPM_NAMESPACE);
      xml.addAttribute(new Attribute('date', '0'));
      xml.addAttribute(new Attribute('name.ref', 'trill'));
      xml.addAttribute(
        new Attribute('xml:id', 'http://www.w3.org/XML/1998/namespace', 'orn-xml-1'),
      );

      expect(readOrnament(xml).xmlId).toBe('orn-xml-1');
    });

    it('should leave xmlId null when the XML has no xml:id', () => {
      const xml = new Element('ornament', Mpm.MPM_NAMESPACE);
      xml.addAttribute(new Attribute('date', '0'));
      xml.addAttribute(new Attribute('name.ref', 'trill'));

      expect(readOrnament(xml).xmlId).toBeNull();
    });

    it('should leave scale at 0.0 when the XML has no scale', () => {
      const xml = new Element('ornament', Mpm.MPM_NAMESPACE);
      xml.addAttribute(new Attribute('date', '960'));
      xml.addAttribute(new Attribute('name.ref', 'trill'));

      const od = readOrnament(xml);
      expect(od.scale).toBe(0.0);
      expect(od.date).toBe(960);
    });

    it('should parse note.order from XML - individual IDs', () => {
      const xml = new Element('ornament', Mpm.MPM_NAMESPACE);
      xml.addAttribute(new Attribute('date', '0'));
      xml.addAttribute(new Attribute('name.ref', 'trill'));
      xml.addAttribute(new Attribute('note.order', '#note1 #note2'));

      const od = readOrnament(xml);
      expect(od.noteOrder).not.toBeNull();
      expect(od.noteOrder!.length).toBe(2);
      expect(od.noteOrder![0]).toBe('note1');
      expect(od.noteOrder![1]).toBe('note2');
    });

    it('should parse note.order from XML - ascending pitch', () => {
      const xml = new Element('ornament', Mpm.MPM_NAMESPACE);
      xml.addAttribute(new Attribute('date', '0'));
      xml.addAttribute(new Attribute('name.ref', 'trill'));
      xml.addAttribute(new Attribute('note.order', 'ascending pitch'));

      const od = readOrnament(xml);
      expect(od.noteOrder).not.toBeNull();
      expect(od.noteOrder!.length).toBe(1);
      expect(od.noteOrder![0]).toBe('ascending pitch');
    });

    it('should parse note.order from XML - descending pitch', () => {
      const xml = new Element('ornament', Mpm.MPM_NAMESPACE);
      xml.addAttribute(new Attribute('date', '0'));
      xml.addAttribute(new Attribute('name.ref', 'trill'));
      xml.addAttribute(new Attribute('note.order', 'descending pitch'));

      const od = readOrnament(xml);
      expect(od.noteOrder).not.toBeNull();
      expect(od.noteOrder!.length).toBe(1);
      expect(od.noteOrder![0]).toBe('descending pitch');
    });
  });

  describe('render methods', () => {
    it('renderOrnamentationToMap with null map does not throw', () => {
      const map = OrnamentationMap.createOrnamentationMap();
      map.addOrnament(0, 'trill');
      map.renderOrnamentationToMap(null);
    });

    it('static renderOrnamentationToMap with null ornamentation map does not throw', () => {
      const target = okValue(GenericMap.createGenericMap('positionMap'));
      OrnamentationMap.renderOrnamentationToMap(target, null);
    });

    it('static renderMillisecondsModifiersToMap with null does not throw', () => {
      OrnamentationMap.renderMillisecondsModifiersToMap(null, null);
    });
  });

  describe('GenericMap operations', () => {
    it('should support removeElement by index', () => {
      const map = OrnamentationMap.createOrnamentationMap();
      map.addOrnament(0, 'trill');
      map.addOrnament(960, 'mordent');

      map.removeElementAt(0);
      expect(map.size()).toBe(1);
      expect(map.getElement(0)!.getAttributeValue('name.ref')).toBe('mordent');
    });

    it('should support setId and getId', () => {
      const map = OrnamentationMap.createOrnamentationMap();
      expect(map.getId()).toBeNull();

      map.setId('ornMap-1');
      expect(map.getId()).toBe('ornMap-1');
    });

    it('should support addStyleSwitch', () => {
      const map = OrnamentationMap.createOrnamentationMap();
      const index = map.addStyleSwitch(0, 'myOrnStyle');
      expect(index).toBeGreaterThanOrEqual(0);
      expect(map.size()).toBe(1);

      const elem = map.getElement(index)!;
      expect(elem.getLocalName()).toBe('style');
      expect(elem.getAttributeValue('name.ref')).toBe('myOrnStyle');
    });

    it('should support getElementBeforeAt', () => {
      const map = OrnamentationMap.createOrnamentationMap();
      map.addOrnament(0, 'trill');
      map.addOrnament(480, 'mordent');
      map.addOrnament(960, 'turn');

      const elem = map.getElementBeforeAt(500);
      expect(elem).not.toBeNull();
      expect(elem!.getAttributeValue('name.ref')).toBe('mordent');
    });
  });

  describe('getOrnamentDataOf with a style', () => {
    function mapWithStyle(): OrnamentationMap {
      const map = OrnamentationMap.createOrnamentationMap();
      map.setHeaders(null, makeHeader([arpeggioDef(), spreadMsDef()]));
      map.addStyleSwitch(0, 'orn style');
      return map;
    }

    it('should collect the full ornament data', () => {
      const map = mapWithStyle();
      map.addOrnament(1440, 'arpeggio', 2.0, ['descending pitch'], 'orn2');

      const od = map.getOrnamentDataOf(map.size() - 1)!;
      expect(od).not.toBeNull();
      expect(od.date).toBe(1440);
      expect(od.ornamentDefName).toBe('arpeggio');
      expect(od.scale).toBe(2.0);
      expect(od.styleName).toBe('orn style');
      expect(od.style).not.toBeNull();
      expect(od.ornamentDef).not.toBeNull();
      expect(od.ornamentDef!.getName()).toBe('arpeggio');
      expect(od.xml).not.toBeNull();
    });

    it('should read the note.order pitch keyword', () => {
      const map = mapWithStyle();
      map.addOrnament(0, 'arpeggio', 2.0, ['descending pitch']);

      expect(map.getOrnamentDataOf(map.size() - 1)!.noteOrder).toEqual(['descending pitch']);
    });

    it('should read a note.order ID list and strip the # markers', () => {
      const map = mapWithStyle();
      map.addOrnament(0, 'arpeggio', 2.0, ['n1', 'n2', 'n3']);

      expect(map.getOrnamentDataOf(map.size() - 1)!.noteOrder).toEqual(['n1', 'n2', 'n3']);
    });

    it('should leave noteOrder null when the attribute is absent', () => {
      const map = mapWithStyle();
      map.addOrnament(0, 'arpeggio');

      expect(map.getOrnamentDataOf(map.size() - 1)!.noteOrder).toBeNull();
    });

    it('should read the xml:id', () => {
      const map = mapWithStyle();
      map.addOrnament(0, 'arpeggio', 1.0, null, 'orn1');

      expect(map.getOrnamentDataOf(map.size() - 1)!.xmlId).toBe('orn1');
    });

    it('should leave scale at its 0.0 default when the attribute is absent', () => {
      // addOrnament omits scale="1.0", and OrnamentData.scale defaults to 0.0 -
      // this is why the reference fixture renders orn1 with ornament.dynamics="0.0"
      const map = mapWithStyle();
      map.addOrnament(0, 'arpeggio');

      expect(map.getOrnamentDataOf(map.size() - 1)!.scale).toBe(0.0);
    });

    it('should pick the style that is in effect at the ornament', () => {
      const map = OrnamentationMap.createOrnamentationMap();
      const header = makeHeader([arpeggioDef()]);
      const second = createStyle('ornamentation', 'late style');
      second.addDef(arpeggioDef());
      header.addStyleDef(Mpm.ORNAMENTATION_STYLE, second);
      map.setHeaders(null, header);

      // insertElement puts a style switch in front of everything when no element
      // sits at or after its date (GenericMap.java:559), so the ornament goes in first
      map.addStyleSwitch(0, 'orn style');
      map.addOrnament(1440, 'arpeggio');
      map.addStyleSwitch(960, 'late style');
      expect(map.getElement(1)!.getAttributeValue('name.ref')).toBe('late style');

      expect(map.getOrnamentDataOf(map.size() - 1)!.styleName).toBe('late style');
    });

    it('should return null for an unknown style name', () => {
      const map = OrnamentationMap.createOrnamentationMap();
      map.setHeaders(null, makeHeader([arpeggioDef()]));
      map.addStyleSwitch(0, 'no such style');
      map.addOrnament(0, 'arpeggio');

      expect(map.getOrnamentDataOf(map.size() - 1)).toBeNull();
    });

    it('should return null for an unknown ornamentDef reference', () => {
      const map = mapWithStyle();
      map.addOrnament(0, 'nosuchdef');

      expect(map.getOrnamentDataOf(map.size() - 1)).toBeNull();
    });

    it('should return null when the indexed element is a style switch', () => {
      const map = mapWithStyle();
      expect(map.getOrnamentDataOf(0)).toBeNull(); // index 0 is the style element
    });

    it('should clamp an index beyond the map size to the last element', () => {
      const map = mapWithStyle();
      map.addOrnament(0, 'arpeggio');
      map.addOrnament(1440, 'spreadMs');

      expect(map.getOrnamentDataOf(99)!.ornamentDefName).toBe('spreadMs');
    });
  });

  // Parity with the Java reference fixture,
  // tests/integration/fixtures/all-maps-reference/ornamentation*.
  describe('renderOrnamentationToMap', () => {
    it('should apply a tick arpeggio exactly as the Java reference does', () => {
      // reference fixture, orn1: <ornament date="0.0" name.ref="arpeggio"/>
      // over n1/n2/n3 (pitches 60/64/67, duration 1440, velocity 100)
      const n1 = makePerformedNote('n1', 0, 60);
      const n2 = makePerformedNote('n2', 0, 64);
      const n3 = makePerformedNote('n3', 0, 67);
      const score = makeScore([n1, n2, n3]);

      const map = OrnamentationMap.createOrnamentationMap();
      map.setHeaders(null, makeHeader([arpeggioDef()]));
      map.addStyleSwitch(0, 'orn style');
      map.addOrnament(0, 'arpeggio');

      map.renderOrnamentationToMap(score);

      // temporal spread -22..+22 over the three notes, ascending pitch by default
      expect(num(n1, 'ornament.date.offset')).toBeCloseTo(-22.0);
      expect(num(n2, 'ornament.date.offset')).toBeCloseTo(0.0);
      expect(num(n3, 'ornament.date.offset')).toBeCloseTo(22.0);

      // the offsets are rendered into date.perf
      expect(num(n1, 'date.perf')).toBeCloseTo(-22.0);
      expect(num(n2, 'date.perf')).toBeCloseTo(0.0);
      expect(num(n3, 'date.perf')).toBeCloseTo(22.0);

      // noteoff.shift is false, so the note ends stay put and the durations absorb the shift
      expect(num(n1, 'duration.perf')).toBeCloseTo(1462.0);
      expect(num(n2, 'duration.perf')).toBeCloseTo(1440.0);
      expect(num(n3, 'duration.perf')).toBeCloseTo(1418.0);
      for (const n of [n1, n2, n3]) expect(num(n, 'date.end.perf')).toBeCloseTo(1440.0);

      // no scale attribute means scale 0.0, so the gradient contributes nothing
      for (const n of [n1, n2, n3]) {
        expect(num(n, 'ornament.dynamics')).toBe(0);
        expect(num(n, 'velocity')).toBeCloseTo(100.0);
      }
    });

    it('should apply a scaled descending arpeggio exactly as the Java reference does', () => {
      // reference fixture, orn2:
      // <ornament date="1440.0" name.ref="arpeggio" scale="2.0" note.order="descending pitch"/>
      const n4 = makePerformedNote('n4', 1440, 62);
      const n5 = makePerformedNote('n5', 1440, 65);
      const n6 = makePerformedNote('n6', 1440, 69);
      const score = makeScore([n4, n5, n6]);

      const map = OrnamentationMap.createOrnamentationMap();
      map.setHeaders(null, makeHeader([arpeggioDef()]));
      map.addStyleSwitch(0, 'orn style');
      map.addOrnament(1440, 'arpeggio', 2.0, ['descending pitch']);

      map.renderOrnamentationToMap(score);

      // highest pitch first: n6 opens the arpeggio, n4 closes it
      expect(num(n6, 'ornament.date.offset')).toBeCloseTo(-22.0);
      expect(num(n5, 'ornament.date.offset')).toBeCloseTo(0.0);
      expect(num(n4, 'ornament.date.offset')).toBeCloseTo(22.0);

      expect(num(n6, 'ornament.dynamics')).toBeCloseTo(-2.0);
      expect(num(n5, 'ornament.dynamics')).toBeCloseTo(0.0);
      expect(num(n4, 'ornament.dynamics')).toBeCloseTo(2.0);

      expect(num(n6, 'velocity')).toBeCloseTo(98.0);
      expect(num(n5, 'velocity')).toBeCloseTo(100.0);
      expect(num(n4, 'velocity')).toBeCloseTo(102.0);

      expect(num(n6, 'date.perf')).toBeCloseTo(1418.0);
      expect(num(n5, 'date.perf')).toBeCloseTo(1440.0);
      expect(num(n4, 'date.perf')).toBeCloseTo(1462.0);

      expect(num(n6, 'duration.perf')).toBeCloseTo(1462.0);
      expect(num(n5, 'duration.perf')).toBeCloseTo(1440.0);
      expect(num(n4, 'duration.perf')).toBeCloseTo(1418.0);

      for (const n of [n4, n5, n6]) expect(num(n, 'date.end.perf')).toBeCloseTo(2880.0);
    });

    it('should apply a milliseconds spread without touching the tick timing', () => {
      // reference fixture, orn3: <ornament date="2880.0" name.ref="spreadMs"/>
      const n7 = makePerformedNote('n7', 2880, 64);
      const n8 = makePerformedNote('n8', 2880, 67);
      const n9 = makePerformedNote('n9', 2880, 71);
      const score = makeScore([n7, n8, n9]);

      const map = OrnamentationMap.createOrnamentationMap();
      map.setHeaders(null, makeHeader([spreadMsDef()]));
      map.addStyleSwitch(0, 'orn style');
      map.addOrnament(2880, 'spreadMs');

      map.renderOrnamentationToMap(score);

      // intensity 2 bends the spread: -30, -15, +30
      expect(num(n7, 'ornament.milliseconds.date.offset')).toBeCloseTo(-30.0);
      expect(num(n8, 'ornament.milliseconds.date.offset')).toBeCloseTo(-15.0);
      expect(num(n9, 'ornament.milliseconds.date.offset')).toBeCloseTo(30.0);

      for (const n of [n7, n8, n9]) {
        expect(n.getAttributeValue('ornament.noteoff.shift')).toBe('true');
        // a milliseconds spread leaves the tick domain untouched
        expect(n.getAttribute('ornament.date.offset')).toBeNull();
        expect(num(n, 'date.perf')).toBeCloseTo(2880.0);
        expect(num(n, 'duration.perf')).toBeCloseTo(1440.0);
        expect(num(n, 'date.end.perf')).toBeCloseTo(4320.0);
      }
    });

    it('should render the milliseconds modifiers as the Java reference does', () => {
      // continuation of orn3: the milliseconds stage runs after the tempo rendering,
      // when milliseconds.date/.end are in place (2000/3000 for date 2880/4320)
      const n7 = makePerformedNote('n7', 2880, 64);
      const n8 = makePerformedNote('n8', 2880, 67);
      const n9 = makePerformedNote('n9', 2880, 71);
      const score = makeScore([n7, n8, n9]);

      const map = OrnamentationMap.createOrnamentationMap();
      map.setHeaders(null, makeHeader([spreadMsDef()]));
      map.addStyleSwitch(0, 'orn style');
      map.addOrnament(2880, 'spreadMs');
      map.renderOrnamentationToMap(score);

      for (const n of [n7, n8, n9]) {
        n.addAttribute(new Attribute('milliseconds.date', '2000'));
        n.addAttribute(new Attribute('milliseconds.date.end', '3000'));
      }
      OrnamentationMap.renderMillisecondsModifiersToMap(score, map);

      expect(num(n7, 'milliseconds.date')).toBeCloseTo(1970.0);
      expect(num(n8, 'milliseconds.date')).toBeCloseTo(1985.0);
      expect(num(n9, 'milliseconds.date')).toBeCloseTo(2030.0);

      // noteoff.shift="true" moves the note ends by the same offset
      expect(num(n7, 'milliseconds.date.end')).toBeCloseTo(2970.0);
      expect(num(n8, 'milliseconds.date.end')).toBeCloseTo(2985.0);
      expect(num(n9, 'milliseconds.date.end')).toBeCloseTo(3030.0);
    });

    it('should render all three reference ornaments over one score', () => {
      const notes = [
        makePerformedNote('n1', 0, 60),
        makePerformedNote('n2', 0, 64),
        makePerformedNote('n3', 0, 67),
        makePerformedNote('n4', 1440, 62),
        makePerformedNote('n5', 1440, 65),
        makePerformedNote('n6', 1440, 69),
        makePerformedNote('n7', 2880, 64),
        makePerformedNote('n8', 2880, 67),
        makePerformedNote('n9', 2880, 71),
        makePerformedNote('n10', 4320, 65),
        makePerformedNote('n11', 4320, 69),
        makePerformedNote('n12', 4320, 72),
      ];
      const byId = new Map(notes.map((n) => [n.getAttribute('id', XML_NS)!.getValue(), n]));
      const score = makeScore(notes);

      const map = OrnamentationMap.createOrnamentationMap();
      map.setHeaders(null, makeHeader([arpeggioDef(), spreadMsDef()]));
      map.addStyleSwitch(0, 'orn style');
      map.addOrnament(0, 'arpeggio', 1.0, null, 'orn1');
      map.addOrnament(1440, 'arpeggio', 2.0, ['descending pitch'], 'orn2');
      map.addOrnament(2880, 'spreadMs', 1.0, null, 'orn3');

      map.renderOrnamentationToMap(score);

      expect(num(byId.get('n1')!, 'date.perf')).toBeCloseTo(-22.0);
      expect(num(byId.get('n4')!, 'velocity')).toBeCloseTo(102.0);
      expect(num(byId.get('n6')!, 'velocity')).toBeCloseTo(98.0);
      expect(num(byId.get('n7')!, 'ornament.milliseconds.date.offset')).toBeCloseTo(-30.0);

      // the notes at 4320 carry no ornament, so they stay untouched
      for (const id of ['n10', 'n11', 'n12']) {
        const n = byId.get(id)!;
        expect(n.getAttribute('ornament.dynamics')).toBeNull();
        expect(n.getAttribute('ornament.date.offset')).toBeNull();
        expect(num(n, 'date.perf')).toBeCloseTo(4320.0);
        expect(num(n, 'duration.perf')).toBeCloseTo(1440.0);
      }
    });

    it('should follow an explicit note.order ID list across dates', () => {
      const a = makePerformedNote('a', 0, 72);
      const b = makePerformedNote('b', 960, 60);
      const c = makePerformedNote('c', 1920, 64);
      const score = makeScore([a, b, c]);

      const map = OrnamentationMap.createOrnamentationMap();
      map.setHeaders(null, makeHeader([arpeggioDef()]));
      map.addStyleSwitch(0, 'orn style');
      map.addOrnament(0, 'arpeggio', 2.0, ['c', 'a', 'b']);

      map.renderOrnamentationToMap(score);

      // the listed order wins over both pitch and date
      expect(num(c, 'ornament.date.offset')).toBeCloseTo(-22.0);
      expect(num(a, 'ornament.date.offset')).toBeCloseTo(0.0);
      expect(num(b, 'ornament.date.offset')).toBeCloseTo(22.0);

      expect(num(c, 'ornament.dynamics')).toBeCloseTo(-2.0);
      expect(num(b, 'ornament.dynamics')).toBeCloseTo(2.0);
    });

    it('should skip note.order references that match no note', () => {
      const a = makePerformedNote('a', 0, 60);
      const b = makePerformedNote('b', 0, 64);
      const score = makeScore([a, b]);

      const map = OrnamentationMap.createOrnamentationMap();
      map.setHeaders(null, makeHeader([arpeggioDef()]));
      map.addStyleSwitch(0, 'orn style');
      map.addOrnament(0, 'arpeggio', 2.0, ['a', 'ghost', 'b']);

      map.renderOrnamentationToMap(score);

      // only two notes remain in the sequence, so they take the frame ends
      expect(num(a, 'ornament.date.offset')).toBeCloseTo(-22.0);
      expect(num(b, 'ornament.date.offset')).toBeCloseTo(22.0);
      expect(num(a, 'ornament.dynamics')).toBeCloseTo(-2.0);
      expect(num(b, 'ornament.dynamics')).toBeCloseTo(2.0);
    });

    it('should treat note.order="ascending pitch" like the default order', () => {
      const high = makePerformedNote('high', 0, 72);
      const low = makePerformedNote('low', 0, 60);
      const score = makeScore([high, low]);

      const map = OrnamentationMap.createOrnamentationMap();
      map.setHeaders(null, makeHeader([arpeggioDef()]));
      map.addStyleSwitch(0, 'orn style');
      map.addOrnament(0, 'arpeggio', 2.0, ['ascending pitch']);

      map.renderOrnamentationToMap(score);

      expect(num(low, 'ornament.date.offset')).toBeCloseTo(-22.0);
      expect(num(high, 'ornament.date.offset')).toBeCloseTo(22.0);
    });

    it('should do nothing for a null map', () => {
      const map = OrnamentationMap.createOrnamentationMap();
      map.setHeaders(null, makeHeader([arpeggioDef()]));
      expect(() => map.renderOrnamentationToMap(null)).not.toThrow();
    });

    it('should only render the modifiers when there is no local header', () => {
      // a global ornamentationMap has already been applied via
      // renderGlobalOrnamentationMap, so apply() must not run a second time
      const n = makePerformedNote('n1', 0, 60);
      n.addAttribute(new Attribute('ornament.date.offset', '-22'));
      const score = makeScore([n]);

      const map = OrnamentationMap.createOrnamentationMap();
      map.setHeaders(makeHeader([arpeggioDef()]), null);
      map.addStyleSwitch(0, 'orn style');
      map.addOrnament(0, 'arpeggio', 2.0);

      map.renderOrnamentationToMap(score);

      // the pre-existing offset was rendered, but no new one was added on top
      expect(num(n, 'ornament.date.offset')).toBeCloseTo(-22.0);
      expect(num(n, 'date.perf')).toBeCloseTo(-22.0);
      expect(n.getAttribute('ornament.dynamics')).toBeNull();
    });
  });

  describe('non-milliseconds modifier rendering', () => {
    /** an ornamentationMap without headers only renders modifiers, it does not apply ornaments */
    function modifierOnlyMap(): OrnamentationMap {
      return OrnamentationMap.createOrnamentationMap();
    }

    it('should add ornament.dynamics to the velocity', () => {
      const n = makeNote('n1', 0, 60, { velocity: '80', 'ornament.dynamics': '-12.5' });
      modifierOnlyMap().renderOrnamentationToMap(makeScore([n]));

      expect(num(n, 'velocity')).toBeCloseTo(67.5);
    });

    it('should ignore ornament.dynamics when the note has no velocity', () => {
      const n = makeNote('n1', 0, 60, { 'ornament.dynamics': '5' });
      modifierOnlyMap().renderOrnamentationToMap(makeScore([n]));

      expect(n.getAttribute('velocity')).toBeNull();
    });

    it('should ignore the date offset when the note has no date.perf', () => {
      const n = makeNote('n1', 0, 60, { 'ornament.date.offset': '-22', 'duration.perf': '1440' });
      modifierOnlyMap().renderOrnamentationToMap(makeScore([n]));

      expect(n.getAttribute('date.perf')).toBeNull();
      expect(num(n, 'duration.perf')).toBeCloseTo(1440.0); // untouched
    });

    it('should shorten duration.perf when the note off does not shift', () => {
      const n = makeNote('n1', 0, 60, {
        'ornament.date.offset': '22',
        'date.perf': '0',
        'duration.perf': '1440',
        'date.end.perf': '1440',
      });
      modifierOnlyMap().renderOrnamentationToMap(makeScore([n]));

      expect(num(n, 'date.perf')).toBeCloseTo(22.0);
      expect(num(n, 'duration.perf')).toBeCloseTo(1418.0);
      expect(num(n, 'date.end.perf')).toBeCloseTo(1440.0); // the note end stays put
    });

    it('should move date.end.perf when ornament.noteoff.shift is set', () => {
      const n = makeNote('n1', 0, 60, {
        'ornament.date.offset': '22',
        'ornament.noteoff.shift': 'true',
        'date.perf': '0',
        'duration.perf': '1440',
        'date.end.perf': '1440',
      });
      modifierOnlyMap().renderOrnamentationToMap(makeScore([n]));

      expect(num(n, 'date.perf')).toBeCloseTo(22.0);
      expect(num(n, 'date.end.perf')).toBeCloseTo(1462.0);
      expect(num(n, 'duration.perf')).toBeCloseTo(1440.0); // the duration stays
    });

    it('should survive a note-off shift on a note without date.end.perf', () => {
      const n = makeNote('n1', 0, 60, {
        'ornament.date.offset': '22',
        'ornament.noteoff.shift': 'true',
        'date.perf': '0',
      });
      expect(() => modifierOnlyMap().renderOrnamentationToMap(makeScore([n]))).not.toThrow();
      expect(num(n, 'date.perf')).toBeCloseTo(22.0);
    });

    it('should apply an absolute ornament.duration to duration.perf and date.end.perf', () => {
      const n = makeNote('n1', 0, 60, {
        'ornament.date.offset': '30',
        'ornament.duration': '300',
        'date.perf': '1440',
        'duration.perf': '1440',
        'date.end.perf': '2880',
      });
      modifierOnlyMap().renderOrnamentationToMap(makeScore([n]));

      expect(num(n, 'date.perf')).toBeCloseTo(1470.0);
      expect(num(n, 'duration.perf')).toBeCloseTo(300.0);
      expect(num(n, 'date.end.perf')).toBeCloseTo(1770.0); // 1440 + 30 + 300
    });

    it('should create duration.perf and date.end.perf when they are missing', () => {
      const n = makeNote('n1', 0, 60, {
        'ornament.date.offset': '30',
        'ornament.duration': '300',
        'date.perf': '1440',
      });
      modifierOnlyMap().renderOrnamentationToMap(makeScore([n]));

      expect(num(n, 'duration.perf')).toBeCloseTo(300.0);
      expect(num(n, 'date.end.perf')).toBeCloseTo(1770.0);
    });

    it('should leave notes without ornament attributes untouched', () => {
      const n = makePerformedNote('n1', 960, 60);
      modifierOnlyMap().renderOrnamentationToMap(makeScore([n]));

      expect(num(n, 'date.perf')).toBeCloseTo(960.0);
      expect(num(n, 'duration.perf')).toBeCloseTo(1440.0);
      expect(num(n, 'date.end.perf')).toBeCloseTo(2400.0);
      expect(num(n, 'velocity')).toBeCloseTo(100.0);
    });
  });

  describe('renderMillisecondsModifiersToMap', () => {
    const ornMap = () => OrnamentationMap.createOrnamentationMap();

    it('should do nothing when either argument is null', () => {
      expect(() => OrnamentationMap.renderMillisecondsModifiersToMap(null, null)).not.toThrow();
      expect(() =>
        OrnamentationMap.renderMillisecondsModifiersToMap(makeScore([]), null),
      ).not.toThrow();
      expect(() => OrnamentationMap.renderMillisecondsModifiersToMap(null, ornMap())).not.toThrow();
    });

    it('should skip notes without milliseconds.date', () => {
      const n = makeNote('n1', 0, 60, { 'ornament.milliseconds.date.offset': '-30' });
      OrnamentationMap.renderMillisecondsModifiersToMap(makeScore([n]), ornMap());

      expect(n.getAttribute('milliseconds.date')).toBeNull();
    });

    it('should offset milliseconds.date', () => {
      const n = makeNote('n1', 0, 60, {
        'milliseconds.date': '2000',
        'ornament.milliseconds.date.offset': '-30',
      });
      OrnamentationMap.renderMillisecondsModifiersToMap(makeScore([n]), ornMap());

      expect(num(n, 'milliseconds.date')).toBeCloseTo(1970.0);
    });

    it('should apply an absolute ornament.milliseconds.duration', () => {
      const n = makeNote('n1', 0, 60, {
        'milliseconds.date': '2000',
        'milliseconds.date.end': '3000',
        'ornament.milliseconds.date.offset': '-30',
        'ornament.milliseconds.duration': '100',
      });
      OrnamentationMap.renderMillisecondsModifiersToMap(makeScore([n]), ornMap());

      expect(num(n, 'milliseconds.date')).toBeCloseTo(1970.0);
      expect(num(n, 'milliseconds.date.end')).toBeCloseTo(2070.0); // 2000 - 30 + 100
    });

    it('should create milliseconds.date.end when it is missing', () => {
      const n = makeNote('n1', 0, 60, {
        'milliseconds.date': '2000',
        'ornament.milliseconds.duration': '250',
      });
      OrnamentationMap.renderMillisecondsModifiersToMap(makeScore([n]), ornMap());

      expect(num(n, 'milliseconds.date.end')).toBeCloseTo(2250.0);
    });

    it('should shift milliseconds.date.end when the note off shifts', () => {
      const n = makeNote('n1', 0, 60, {
        'milliseconds.date': '2000',
        'milliseconds.date.end': '3000',
        'ornament.milliseconds.date.offset': '30',
        'ornament.noteoff.shift': 'true',
      });
      OrnamentationMap.renderMillisecondsModifiersToMap(makeScore([n]), ornMap());

      expect(num(n, 'milliseconds.date')).toBeCloseTo(2030.0);
      expect(num(n, 'milliseconds.date.end')).toBeCloseTo(3030.0);
    });

    it('should keep milliseconds.date.end when the note off does not shift', () => {
      const n = makeNote('n1', 0, 60, {
        'milliseconds.date': '2000',
        'milliseconds.date.end': '3000',
        'ornament.milliseconds.date.offset': '30',
      });
      OrnamentationMap.renderMillisecondsModifiersToMap(makeScore([n]), ornMap());

      expect(num(n, 'milliseconds.date')).toBeCloseTo(2030.0);
      expect(num(n, 'milliseconds.date.end')).toBeCloseTo(3000.0); // unaltered
    });
  });

  describe('renderGlobalOrnamentationToParts', () => {
    it('should spread one ornament across the notes of all parts', () => {
      const a1 = makePerformedNote('a1', 0, 60);
      const a2 = makePerformedNote('a2', 0, 64);
      const b1 = makePerformedNote('b1', 0, 67);
      const partA = makePart([a1, a2]);
      const partB = makePart([b1]);

      const map = OrnamentationMap.createOrnamentationMap();
      map.setHeaders(makeHeader([arpeggioDef()]), null); // a global map has a global header
      map.addStyleSwitch(0, 'orn style');
      map.addOrnament(0, 'arpeggio', 2.0);

      OrnamentationMap.renderGlobalOrnamentationToParts([partA, partB], map);

      // apply() pools the notes of every part into a single chord sequence, so the
      // arpeggio runs across the ensemble rather than once per part
      expect(num(a1, 'ornament.date.offset')).toBeCloseTo(-22.0);
      expect(num(a2, 'ornament.date.offset')).toBeCloseTo(0.0);
      expect(num(b1, 'ornament.date.offset')).toBeCloseTo(22.0);

      expect(num(a1, 'ornament.dynamics')).toBeCloseTo(-2.0);
      expect(num(b1, 'ornament.dynamics')).toBeCloseTo(2.0);

      // only the modifier attributes are set here; the performance attributes come later
      expect(num(a1, 'date.perf')).toBeCloseTo(0.0);
      expect(num(a1, 'velocity')).toBeCloseTo(100.0);
    });

    it('should do nothing for a null or empty ornamentationMap', () => {
      const n = makePerformedNote('n1', 0, 60);
      const part = makePart([n]);

      OrnamentationMap.renderGlobalOrnamentationToParts([part], null);
      OrnamentationMap.renderGlobalOrnamentationToParts(
        [part],
        OrnamentationMap.createOrnamentationMap(),
      );

      expect(n.getAttribute('ornament.date.offset')).toBeNull();
    });

    it('should skip parts that have no dated/score subtree', () => {
      const bare = new Element('part');
      const datedOnly = new Element('part');
      datedOnly.appendChild(new Element('dated'));

      const map = OrnamentationMap.createOrnamentationMap();
      map.setHeaders(makeHeader([arpeggioDef()]), null);
      map.addStyleSwitch(0, 'orn style');
      map.addOrnament(0, 'arpeggio', 2.0);

      expect(() =>
        OrnamentationMap.renderGlobalOrnamentationToParts([bare, datedOnly], map),
      ).not.toThrow();
    });

    it('should do nothing for an empty map list', () => {
      const map = OrnamentationMap.createOrnamentationMap();
      map.setHeaders(makeHeader([arpeggioDef()]), null);
      map.addOrnament(0, 'arpeggio');

      expect(() => map.renderGlobalOrnamentationMap([])).not.toThrow();
    });
  });

  describe('unresolvable ornaments', () => {
    it('should not touch the notes when no header is available', () => {
      const n = makePerformedNote('n1', 0, 60);
      const score = makeScore([n]);

      const map = OrnamentationMap.createOrnamentationMap();
      map.addStyleSwitch(0, 'orn style');
      map.addOrnament(0, 'arpeggio', 2.0);
      map.renderGlobalOrnamentationMap([score]);

      expect(n.getAttribute('ornament.date.offset')).toBeNull();
      expect(n.getAttribute('ornament.dynamics')).toBeNull();
    });

    it('should skip ornaments that precede any style switch', () => {
      const early = makePerformedNote('early', 0, 60);
      const late = makePerformedNote('late', 960, 60);
      const score = makeScore([early, late]);

      const map = OrnamentationMap.createOrnamentationMap();
      map.setHeaders(null, makeHeader([arpeggioDef()]));
      map.addOrnament(0, 'arpeggio', 2.0); // before the style switch
      map.addOrnament(960, 'arpeggio', 2.0); // after the style switch
      map.addStyleSwitch(480, 'orn style');
      expect(map.getElement(1)!.getLocalName()).toBe('style');

      map.renderOrnamentationToMap(score);

      expect(early.getAttribute('ornament.date.offset')).toBeNull();
      expect(num(late, 'ornament.date.offset')).toBeCloseTo(22.0);
    });

    it('should skip ornaments under a style switch that names an unknown style', () => {
      const n = makePerformedNote('n1', 0, 60);
      const score = makeScore([n]);

      const map = OrnamentationMap.createOrnamentationMap();
      map.setHeaders(null, makeHeader([arpeggioDef()]));
      map.addStyleSwitch(0, 'no such style');
      map.addOrnament(0, 'arpeggio', 2.0);

      map.renderOrnamentationToMap(score);
      expect(n.getAttribute('ornament.date.offset')).toBeNull();
    });

    it('should skip ornaments whose name.ref matches no ornamentDef', () => {
      const n = makePerformedNote('n1', 0, 60);
      const score = makeScore([n]);

      const map = OrnamentationMap.createOrnamentationMap();
      map.setHeaders(null, makeHeader([arpeggioDef()]));
      map.addStyleSwitch(0, 'orn style');
      map.addOrnament(0, 'nosuchdef', 2.0);

      map.renderOrnamentationToMap(score);
      expect(n.getAttribute('ornament.date.offset')).toBeNull();
    });

    it('should skip an ornament that has no note to work on', () => {
      const n = makePerformedNote('n1', 0, 60);
      const score = makeScore([n]);

      const map = OrnamentationMap.createOrnamentationMap();
      map.setHeaders(null, makeHeader([arpeggioDef()]));
      map.addStyleSwitch(0, 'orn style');
      map.addOrnament(9600, 'arpeggio', 2.0); // no note at or after this date

      map.renderOrnamentationToMap(score);
      expect(n.getAttribute('ornament.date.offset')).toBeNull();
    });

    it('should fall back to the global header when the local one has no such style', () => {
      const n1 = makePerformedNote('n1', 0, 60);
      const n2 = makePerformedNote('n2', 0, 64);
      const score = makeScore([n1, n2]);

      const map = OrnamentationMap.createOrnamentationMap();
      map.setHeaders(makeHeader([arpeggioDef()]), okValue(Header.createHeader())); // empty local header
      map.addStyleSwitch(0, 'orn style');
      map.addOrnament(0, 'arpeggio', 2.0);

      map.renderOrnamentationToMap(score);

      expect(num(n1, 'ornament.date.offset')).toBeCloseTo(-22.0);
      expect(num(n2, 'ornament.date.offset')).toBeCloseTo(22.0);
    });
  });

  describe('OrnamentData.apply', () => {
    it('should return an empty list and change nothing without an ornamentDef', () => {
      const od = new OrnamentData();
      const n = makeNote('n1', 0, 60);

      expect(od.apply([[n]])).toEqual([]);
      expect(n.getAttribute('ornament.dynamics')).toBeNull();
      expect(n.getAttribute('ornament.date.offset')).toBeNull();
    });

    it('should apply both transformers of the def', () => {
      const od = new OrnamentData();
      od.ornamentDef = arpeggioDef();
      od.scale = 2.0;

      const n1 = makeNote('n1', 0, 60),
        n2 = makeNote('n2', 0, 64),
        n3 = makeNote('n3', 0, 67);
      expect(od.apply([[n1], [n2], [n3]])).toEqual([]);

      expect(num(n1, 'ornament.dynamics')).toBeCloseTo(-2.0);
      expect(num(n1, 'ornament.date.offset')).toBeCloseTo(-22.0);
      expect(num(n3, 'ornament.dynamics')).toBeCloseTo(2.0);
      expect(num(n3, 'ornament.date.offset')).toBeCloseTo(22.0);
    });

    it('should apply only the dynamics gradient when there is no temporal spread', () => {
      const def = okValue(OrnamentDef.createOrnamentDef('dynOnly'));
      def.setDynamicsGradientValues(-3.0, 3.0);

      const od = new OrnamentData();
      od.ornamentDef = def;
      od.scale = 1.0;

      const n1 = makeNote('n1', 0, 60),
        n2 = makeNote('n2', 0, 64);
      od.apply([[n1], [n2]]);

      expect(num(n1, 'ornament.dynamics')).toBeCloseTo(-3.0);
      expect(n1.getAttribute('ornament.date.offset')).toBeNull();
    });

    it('should apply only the temporal spread when there is no dynamics gradient', () => {
      const def = okValue(OrnamentDef.createOrnamentDef('spreadOnly'));
      def.setTemporalSpreadValues(-10.0, 20.0, FrameDomain.Ticks, 1.0, NoteOffShift.False);

      const od = new OrnamentData();
      od.ornamentDef = def;
      od.scale = 1.0;

      const n1 = makeNote('n1', 0, 60),
        n2 = makeNote('n2', 0, 64);
      od.apply([[n1], [n2]]);

      expect(num(n1, 'ornament.date.offset')).toBeCloseTo(-10.0);
      expect(num(n2, 'ornament.date.offset')).toBeCloseTo(10.0);
      expect(n1.getAttribute('ornament.dynamics')).toBeNull();
    });

    it('should add nothing for a def without transformers', () => {
      const od = new OrnamentData();
      od.ornamentDef = okValue(OrnamentDef.createOrnamentDef('plain'));

      const n = makeNote('n1', 0, 60);
      expect(od.apply([[n]])).toEqual([]);
      expect(n.getAttributeCount()).toBe(3); // xml:id, date, midi.pitch
    });

    it('should copy the xml element on clone', () => {
      const xml = new Element('ornament', Mpm.MPM_NAMESPACE);
      xml.addAttribute(new Attribute('date', '480'));
      xml.addAttribute(new Attribute('name.ref', 'turn'));

      const od = readOrnament(xml);
      const clone = od.clone();

      expect(clone.xml).not.toBeNull();
      expect(clone.xml).not.toBe(od.xml);
      expect(clone.xml!.getAttributeValue('name.ref')).toBe('turn');
    });

    it('should carry style and ornamentDef references over to the clone', () => {
      const od = new OrnamentData();
      od.style = createStyle('ornamentation', 'orn style');
      od.ornamentDef = arpeggioDef();

      const clone = od.clone();
      expect(clone.style).toBe(od.style);
      expect(clone.ornamentDef).toBe(od.ornamentDef);
    });
  });
});

// MPM v3 — note pool, repetitions, noteid (DESIGN.md D1, D7, D9, D12). The first suite here
// pins the v2 writer byte for byte, which is the contract the v3 additions fit around.

const MPM_NS = 'http://www.cemfi.de/mpm/ns/1.0';

/** parse an XML string into an element, the way a real document reaches the parser */
function parseElement(xml: string): Element {
  return new Builder().build(xml).getRootElement();
}

/** parse an `<ornament>` given as source text */
function ornamentElement(body: string): Element {
  return parseElement(`<ornament xmlns="${MPM_NS}" ${body}</ornament>`);
}

/**
 * Read an `<ornament>` element the way the renderer does — through
 * `OrnamentationMap.getOrnamentDataOf`, inside a map with a style in scope and a def the style
 * knows. Both are required: `getOrnamentDataOf` returns null for an ornament missing either,
 * and `apply` skips it.
 *
 * The five defs are every `name.ref` this file uses. They carry no transformers, because these
 * cases assert what was read off the element and not what it renders to.
 */
function readOrnament(element: Element): OrnamentData {
  const map = OrnamentationMap.createOrnamentationMap();
  map.setHeaders(
    null,
    makeHeader(
      ['arpeggio', 'spreadMs', 'trill', 'turn', 'upper turn'].map((name) =>
        okValue(OrnamentDef.createOrnamentDef(name)),
      ),
    ),
  );
  map.addStyleSwitch(0, 'orn style');
  map.addElement(element);
  // The `<style>` switch shares position 0 with a `date="0.0"` ornament, so scan rather than
  // assume an index — and throw rather than return null, so a refusal is loud.
  for (let i = 0; i < map.size(); ++i) {
    const od = map.getOrnamentDataOf(i);
    if (od !== null) return od;
  }
  throw new Error('getOrnamentDataOf refused the ornament');
}

/** {@link readOrnament} over an `<ornament>` given as source text. */
function ornamentDataOf(body: string): OrnamentData {
  return readOrnament(ornamentElement(body));
}

/** silence and capture console.error for one call */
function captureErrors(run: () => void): string[] {
  const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  try {
    run();
    return spy.mock.calls.map((args) => String(args[0]));
  } finally {
    spy.mockRestore();
  }
}

describe('addOrnament — v2 byte stability (DESIGN.md D6/D12)', () => {
  // Captured from the committed behaviour at `cd140e1`. Whole-string assertions, so attribute
  // order is pinned along with the values.
  const CASES: readonly (readonly [string, () => Element, string])[] = [
    [
      'required parameters only',
      () => {
        const m = OrnamentationMap.createOrnamentationMap();
        m.addOrnament(0.0, 'arpeggio');
        return m.getElement(0)!;
      },
      `<ornament xmlns="${MPM_NS}" date="0" name.ref="arpeggio" />`,
    ],
    [
      'scale, an ID list and an xml:id',
      () => {
        const m = OrnamentationMap.createOrnamentationMap();
        m.addOrnament(720.0, 'arpeggio', 20.0, ['n96', 'n97', 'n98'], 'orn1');
        return m.getElement(0)!;
      },
      `<ornament xmlns="${MPM_NS}" date="720" name.ref="arpeggio" scale="20" note.order="#n96 #n97 #n98" xml:id="orn1" />`,
    ],
    [
      'scale 1.0 omitted, empty id omitted, pitch keyword',
      () => {
        const m = OrnamentationMap.createOrnamentationMap();
        m.addOrnament(1440.0, 'trill', 1.0, ['ascending pitch'], '');
        return m.getElement(0)!;
      },
      `<ornament xmlns="${MPM_NS}" date="1440" name.ref="trill" note.order="ascending pitch" />`,
    ],
    [
      'scale 0.0 written',
      () => {
        const m = OrnamentationMap.createOrnamentationMap();
        m.addOrnament(2160.0, 'trill', 0.0, ['descending pitch'], null);
        return m.getElement(0)!;
      },
      `<ornament xmlns="${MPM_NS}" date="2160" name.ref="trill" scale="0" note.order="descending pitch" />`,
    ],
    [
      'ids normalised on write',
      () => {
        const m = OrnamentationMap.createOrnamentationMap();
        m.addOrnament(2880.0, 'trill', 1.0, ['#n1', ' n2 '], 'orn5');
        return m.getElement(0)!;
      },
      `<ornament xmlns="${MPM_NS}" date="2880" name.ref="trill" note.order="#n1 #n2" xml:id="orn5" />`,
    ],
  ];

  for (const [label, build, expected] of CASES) {
    it(`should write the v2 element byte-identically — ${label}`, () => {
      expect(build().toXML()).toBe(expected);
    });
  }

  it('should keep addOrnamentFromData on the v2 path for v2 data', () => {
    // an OrnamentData with no v3 field must produce exactly what the positional call does
    const data = new OrnamentData();
    data.date = 720.0;
    data.ornamentDefName = 'arpeggio';
    data.scale = 20.0;
    data.noteOrder = ['n96', 'n97', 'n98'];
    data.xmlId = 'orn1';

    const m = OrnamentationMap.createOrnamentationMap();
    m.addOrnamentFromData(data);
    expect(m.getElement(0)!.toXML()).toBe(
      `<ornament xmlns="${MPM_NS}" date="720" name.ref="arpeggio" scale="20" note.order="#n96 #n97 #n98" xml:id="orn1" />`,
    );
  });
});

describe('OrnamentData — v3 fields', () => {
  it('should default the v3 fields for a v2 ornament', () => {
    const od = ornamentDataOf('date="0.0" name.ref="arpeggio" note.order="#n1 #n2"/>');
    expect(od.notes).toEqual([]);
    expect(od.repetitions).toBe(0);
    expect(od.noteid).toBeNull();
    expect(od.getPrincipalNoteId()).toBeNull();
  });

  it('should read a note pool in document order', () => {
    // note.xml:60-64, the "upper turn"
    const od = ornamentDataOf(
      'noteid="#princNote1" date="0.0" name.ref="upper turn" note.order="#n2 #princNote1 #n3 #princNote1">' +
        '<note xml:id="n2" interval.chromatic="1.0"/>' +
        '<note xml:id="n3" interval.chromatic="-1.0"/>',
    );
    expect(od.notes.map((n) => n.id)).toEqual(['n2', 'n3']);
    expect(od.notes[0].pitchSpec).toEqual({ kind: 'chromatic', value: 1.0 });
    expect(od.notes[1].pitchSpec).toEqual({ kind: 'chromatic', value: -1.0 });
  });

  it('should store noteid raw and strip the # only for resolution', () => {
    // the schematron asserts @noteid[starts-with(., '#')], so the two spellings are not
    // interchangeable in the document; normalising on read would repair what a validator
    // rejects, and would change bytes the author wrote
    const withHash = ornamentDataOf('date="0.0" name.ref="trill" noteid="#princNote"/>');
    expect(withHash.noteid).toBe('#princNote');
    expect(withHash.getPrincipalNoteId()).toBe('princNote');

    const withoutHash = ornamentDataOf('date="0.0" name.ref="trill" noteid="princNote"/>');
    expect(withoutHash.noteid).toBe('princNote');
    expect(withoutHash.getPrincipalNoteId()).toBe('princNote');
  });

  it('should read repetitions', () => {
    // ornament.xml:66-72: repetitions="3" means the group is played FOUR times
    const od = ornamentDataOf('date="720.0" name.ref="trill" repetitions="3"/>');
    expect(od.repetitions).toBe(3);
  });

  it('should accept the -1 fill-the-frame extension', () => {
    // schema-invalid (minInclusive 0) but an established meico extension, DESIGN.md D9
    const od = ornamentDataOf('date="0.0" name.ref="trill" repetitions="-1"/>');
    expect(od.repetitions).toBe(-1);
  });

  it('should fall back to 0 for an unusable repeat count, and say so every time', () => {
    // D16 ruling, PARITY.md §6.8: `parseJavaDouble` rejects `''` as Java does, so an empty
    // attribute logs and takes the default rather than parsing as 0 through `Number`. Every
    // row here therefore logs.
    for (const value of ['many', '', '-2', 'NaN', '0x10']) {
      let od: OrnamentData | null = null;
      const messages = captureErrors(() => {
        od = ornamentDataOf(`date="0.0" name.ref="trill" repetitions="${value}"/>`);
      });
      expect(od!.repetitions).toBe(0);
      expect(messages.join('\n')).toContain('no usable repeat count');
    }
  });

  it('should read Java’s own numeric spellings of a repeat count', () => {
    // `3d` is a legal Java double literal where `Number('3d')` is NaN, so under D16 it is
    // three extra passes rather than an unusable value taking the default.
    const od = ornamentDataOf('date="0.0" name.ref="trill" repetitions="3d"/>');
    expect(od.repetitions).toBe(3);
  });

  it('should skip a pool note without an xml:id and log it', () => {
    let od: OrnamentData | null = null;
    const messages = captureErrors(() => {
      od = ornamentDataOf(
        'date="0.0" name.ref="turn" note.order="#n2">' +
          '<note xml:id="n2" interval.chromatic="1.0"/>' +
          '<note interval.chromatic="-1.0"/>',
      );
    });
    expect(od!.notes.map((n) => n.id)).toEqual(['n2']);
    expect(messages.join('\n')).toContain('no xml:id');
  });

  it('should ignore children that are not notes', () => {
    const od = ornamentDataOf(
      'date="0.0" name.ref="turn"><note xml:id="n2"/><comment/><note xml:id="n3"/>',
    );
    expect(od.notes.map((n) => n.id)).toEqual(['n2', 'n3']);
  });

  it('should read a large pool without pathological cost', { timeout: 2000 }, () => {
    // one forward pass over the children, so the cost is linear; pinned with a timeout
    // because it is a loop. The element is BUILT rather than parsed, so the measurement is
    // of the pool reader and not of the XML parser. Measured at ~2 ms for these 2000 notes;
    // the timeout is what caught the XPath-based first draft, which took 3158 ms here
    // because `allChildElements` serializes and re-parses the subtree (see the PERFORMANCE
    // NOTE on parseOrnamentNotePool).
    const ornament = new Element('ornament', MPM_NS);
    ornament.addAttribute(new Attribute('date', '0.0'));
    ornament.addAttribute(new Attribute('name.ref', 'trill'));
    for (let i = 0; i < 2000; ++i) {
      const child = new Element('note', MPM_NS);
      child.addAttribute(new Attribute('xml:id', XML_NS, `n${i}`));
      child.addAttribute(new Attribute('interval.chromatic', String(i % 12)));
      ornament.appendChild(child);
    }

    const od = readOrnament(ornament);
    expect(od.notes.length).toBe(2000);
    expect(od.notes[1999].id).toBe('n1999');
  });

  it('should keep note.order as written alongside the flat v2 view', () => {
    // the flat array is lossy by construction: stripping every '#' makes an id and a
    // repeat mark indistinguishable, so re-prefixing on the way out would write "#:|"
    const od = ornamentDataOf('date="0.0" name.ref="trill" note.order="|: #n1 #princNote :|"/>');
    expect(od.noteOrderText).toBe('|: #n1 #princNote :|');
    expect(od.noteOrder).toEqual(['|:', 'n1', 'princNote', ':|']);
    expect(od.clone().noteOrderText).toBe('|: #n1 #princNote :|');
  });

  it('should leave noteOrderText null when the attribute is absent', () => {
    const od = ornamentDataOf('date="0.0" name.ref="trill"/>');
    expect(od.noteOrderText).toBeNull();
  });

  it('should keep note.order verbatim, untrimmed', () => {
    const od = ornamentDataOf('date="0.0" name.ref="trill" note.order=" #n1 #n2 "/>');
    expect(od.noteOrderText).toBe(' #n1 #n2 ');
    expect(od.noteOrder).toEqual(['n1', 'n2']); // the v2 view trims, as it always has
  });

  it('should carry the v3 fields through clone', () => {
    const od = ornamentDataOf(
      'date="0.0" name.ref="turn" noteid="#p" repetitions="2"><note xml:id="n2"/>',
    );
    const c = od.clone();
    expect(c.noteid).toBe('#p');
    expect(c.repetitions).toBe(2);
    expect(c.notes.map((n) => n.id)).toEqual(['n2']);
    // the array is copied, the notes are shared — the same depth as style/ornamentDef
    expect(c.notes).not.toBe(od.notes);
    expect(c.notes[0]).toBe(od.notes[0]);
  });
});

describe('OrnamentationMap — reading v3 ornaments', () => {
  function v3Map(): OrnamentationMap {
    const map = OrnamentationMap.createOrnamentationMap();
    map.setHeaders(null, makeHeader([arpeggioDef()]));
    map.addStyleSwitch(0, 'orn style');
    return map;
  }

  it('should surface the v3 fields through getOrnamentDataOf', () => {
    const map = v3Map();
    map.addOrnament({
      date: 720,
      nameRef: 'arpeggio',
      noteid: '#princNote',
      repetitions: 3,
      noteOrder: '|: #n1 #princNote :|',
      notes: [new OrnamentNote('n1', { kind: 'chromatic', value: 1.0 })],
      id: 'orn-v3',
    });

    const od = map.getOrnamentDataOf(map.size() - 1)!;
    expect(od.noteid).toBe('#princNote');
    expect(od.getPrincipalNoteId()).toBe('princNote');
    expect(od.repetitions).toBe(3);
    expect(od.notes.map((n) => n.id)).toEqual(['n1']);
    expect(od.noteOrder).toEqual(['|:', 'n1', 'princNote', ':|']);
  });

  it('should leave the v3 fields at their defaults for a v2 ornament', () => {
    const map = v3Map();
    map.addOrnament(0, 'arpeggio', 2.0, ['n1', 'n2']);

    const od = map.getOrnamentDataOf(map.size() - 1)!;
    expect(od.notes).toEqual([]);
    expect(od.repetitions).toBe(0);
    expect(od.noteid).toBeNull();
  });

  /**
   * The DESIGN.md D6 gate diverts an ornament carrying v3 attributes off the v2 path entirely,
   * so the v2 arpeggio markers are precisely what must not appear.
   *
   * All three claims are asserted, because any two of them can hold while the ornament is
   * half-rendered: none of the v2 numbers moved, no marker was written, and the ornament was
   * skipped rather than half-played. The same ornament with a `note.order` it can actually
   * play is pinned next to it.
   */
  it('should divert an ornament with v3 attributes off the v2 path (D6)', () => {
    const n1 = makePerformedNote('n1', 0, 60);
    const n2 = makePerformedNote('n2', 0, 64);
    const n3 = makePerformedNote('n3', 0, 67);
    const score = makeScore([n1, n2, n3]);

    const map = OrnamentationMap.createOrnamentationMap();
    map.setHeaders(null, makeHeader([arpeggioDef()]));
    map.addStyleSwitch(0, 'orn style');
    map.addOrnament({
      date: 0,
      nameRef: 'arpeggio',
      scale: 2.0,
      noteid: '#n1',
      repetitions: 3,
      notes: [new OrnamentNote('aux', { kind: 'chromatic', value: 1.0 })],
    });

    map.renderOrnamentationToMap(score);

    // none of the v2 arpeggio's numbers (-22 / 0 / +22 and 98 / 102) was produced
    for (const note of [n1, n2, n3]) {
      expect(note.getAttributeValue('ornament.date.offset')).toBeNull();
      expect(note.getAttributeValue('ornament.dynamics')).toBeNull();
      expect(num(note, 'velocity')).toBeCloseTo(100.0);
    }
    expect(num(n1, 'date.perf')).toBeCloseTo(0.0);
    expect(num(n2, 'date.perf')).toBeCloseTo(0.0);
    expect(num(n3, 'date.perf')).toBeCloseTo(22.0 - 22.0);
    // and it generated nothing either: with a pool but no note.order there is no sequence to
    // play, so the v3 renderer logs and skips (D7/D9)
    expect(score.getAllElementsOfType('note').length).toBe(3);
  });

  it('should render the same ornament as notes once it names a v3 note.order', () => {
    // arpeggioDef's frame is v2: frame.start -22, frameLength 44, ticks, noteoff.shift false.
    // Principal n1 (60, date 0, duration 1440): start = -22, length = 44, two slots,
    // intensity 1 ⇒ onsets 0 + (-22) = -22 and 0 + (-22 + 44) = 22. The first ends at
    // 1440 (noteoff.shift false) so it straddles tick 0 and is clamped to [0, 1440); the
    // second runs [22, 1440). The pool note aux is +1 chromatic ⇒ 61.
    const n1 = makePerformedNote('n1', 0, 60);
    const score = makeScore([n1, makePerformedNote('n2', 0, 64)]);

    const map = OrnamentationMap.createOrnamentationMap();
    map.setHeaders(null, makeHeader([arpeggioDef()]));
    map.addStyleSwitch(0, 'orn style');
    map.addOrnament({
      date: 0,
      nameRef: 'arpeggio',
      scale: 2.0,
      noteid: '#n1',
      noteOrder: '[ #aux ] #n1',
      notes: [new OrnamentNote('aux', { kind: 'chromatic', value: 1.0 })],
    });

    map.renderOrnamentationToMap(score);

    const notes = score.getAllElementsOfType('note').map((e) => e.getValue());
    // n2 is untouched, n1 is replaced by the two generated notes
    expect(notes.map((note) => note.getAttributeValue('midi.pitch'))).toEqual(['64', '61', '60']);
    expect(notes.map((note) => note.getAttributeValue('date'))).toEqual(['0', '0', '22']);
    expect(notes[2].getAttributeValue('xml:id')).toBe('n1');
    expect(notes[1].getAttributeValue('ornament.generated')).toBe('true');
  });
});

/**
 * `RenderOptions.expandOrnaments` (DESIGN.md D15) at its point of use.
 *
 * The default is resolved here, inside `src/mpm/`, and not at the facade
 * (ARCHITECTURE.md §2.4) — which is exactly why it needs a test here: a caller that hands
 * over no context at all, as every existing call site and every fixture does, must still
 * expand. `movementSampleMaxStep` is the precedent this follows.
 */
describe('OrnamentationMap — expandOrnaments (D15)', () => {
  /** The score + map of the v3 case above, which generates two notes out of one principal. */
  function v3Case(): { score: GenericMap; map: OrnamentationMap } {
    const score = makeScore([makePerformedNote('n1', 0, 60), makePerformedNote('n2', 0, 64)]);
    const map = OrnamentationMap.createOrnamentationMap();
    map.setHeaders(null, makeHeader([arpeggioDef()]));
    map.addStyleSwitch(0, 'orn style');
    map.addOrnament({
      date: 0,
      nameRef: 'arpeggio',
      scale: 2.0,
      noteid: '#n1',
      noteOrder: '[ #aux ] #n1',
      notes: [new OrnamentNote('aux', { kind: 'chromatic', value: 1.0 })],
    });
    return { score, map };
  }

  const ctx = (expandOrnaments?: boolean): RenderContext => ({
    options: expandOrnaments === undefined ? {} : { expandOrnaments },
    streamOrdinal: 0,
  });

  it('should expand with no context, which is what every existing call site passes', () => {
    const { score, map } = v3Case();
    map.renderOrnamentationToMap(score);
    expect(score.getAllElementsOfType('note').length).toBe(3);
  });

  it('should expand for a context that does not mention the option', () => {
    const { score, map } = v3Case();
    map.renderOrnamentationToMap(score, ctx());
    expect(score.getAllElementsOfType('note').length).toBe(3);
  });

  it('should expand for expandOrnaments: true', () => {
    const { score, map } = v3Case();
    map.renderOrnamentationToMap(score, ctx(true));
    expect(score.getAllElementsOfType('note').length).toBe(3);
  });

  it('should leave the score untouched for expandOrnaments: false', () => {
    const { score, map } = v3Case();
    const warnings = captureErrors(() => map.renderOrnamentationToMap(score, ctx(false)));

    // The two score notes and nothing else, with the principal still carrying its own id and
    // pitch: the ornament did not run at all rather than running and being undone.
    const notes = score.getAllElementsOfType('note').map((e) => e.getValue());
    expect(notes.map((note) => note.getAttributeValue('xml:id'))).toEqual(['n1', 'n2']);
    expect(notes.map((note) => note.getAttributeValue('midi.pitch'))).toEqual(['60', '64']);
    // Not one marker of either generation, and no complaint logged: skipping is the
    // instruction being followed, not a failure to render.
    for (const note of notes) {
      expect(note.getAttributeValue('ornament.generated')).toBeNull();
      expect(note.getAttributeValue('ornament.date.offset')).toBeNull();
      expect(note.getAttributeValue('ornament.dynamics')).toBeNull();
    }
    expect(warnings).toEqual([]);
  });

  it('should not write note.order.perf back onto a skipped ornament', () => {
    // The gate sits *before* prepareOrnament, which writes `note.order.perf` onto the
    // `<ornament>` element for downstream visibility (D7). Suppressed means the MPM comes back
    // exactly as it went in.
    const { score, map } = v3Case();
    map.renderOrnamentationToMap(score, ctx(false));
    const ornament = map.getAllElementsOfType('ornament')[0].getValue();
    expect(ornament.getAttributeValue('note.order.perf')).toBeNull();

    const expanded = v3Case();
    expanded.map.renderOrnamentationToMap(expanded.score, ctx(true));
    expect(
      expanded.map
        .getAllElementsOfType('ornament')[0]
        .getValue()
        .getAttributeValue('note.order.perf'),
    ).not.toBeNull();
  });

  it('should leave a v2 ornament alone whichever way the option is set', () => {
    // The flag suppresses *expansion*, and a v2 ornament expands nothing — it writes markers
    // onto notes that already exist. Both renders must produce the v2 arpeggio's own numbers.
    const markers = (expandOrnaments: boolean) => {
      const notes = [
        makePerformedNote('n1', 0, 60),
        makePerformedNote('n2', 0, 64),
        makePerformedNote('n3', 0, 67),
      ];
      const score = makeScore(notes);
      const map = OrnamentationMap.createOrnamentationMap();
      map.setHeaders(null, makeHeader([arpeggioDef()]));
      map.addStyleSwitch(0, 'orn style');
      map.addOrnament(0, 'arpeggio', 2.0, null, null);
      map.renderOrnamentationToMap(score, ctx(expandOrnaments));
      return notes.map((note) => [num(note, 'date.perf'), num(note, 'velocity')]);
    };

    expect(markers(false)).toEqual(markers(true));
    // and it really did ornament: the arpeggio's -22 / 0 / +22 spread, folded into date.perf
    expect(markers(false).map(([date]) => date)).toEqual([-22, 0, 22]);
  });
});

describe('addOrnament — the v3 options form (DESIGN.md D12)', () => {
  function firstElement(build: (m: OrnamentationMap) => void): Element {
    const m = OrnamentationMap.createOrnamentationMap();
    build(m);
    return m.getElement(0)!;
  }

  it('should write the canonical v3 shape', () => {
    // ornament.xml:70-72, the trill exemplum — attribute order is the v2 order with
    // noteid after name.ref and repetitions after note.order
    const e = firstElement((m) =>
      m.addOrnament({
        date: 720.0,
        nameRef: 'trill',
        noteid: '#princNote',
        noteOrder: '|: #n1 #princNote :|',
        repetitions: 3,
        notes: [new OrnamentNote('n1', { kind: 'chromatic', value: 1.0 })],
      }),
    );
    expect(e.toXML()).toBe(
      `<ornament xmlns="${MPM_NS}" date="720" name.ref="trill" noteid="#princNote" scale="0" note.order="|: #n1 #princNote :|" repetitions="3">` +
        `<note xml:id="n1" interval.chromatic="1" />` +
        `</ornament>`,
    );
  });

  it('should always write scale, defaulting to the spec value 0.0', () => {
    // ≠ the v2 writer, which omits scale="1.0" while every reader defaults a missing
    // scale to 0.0 — writing 1.0 and reading it back would silently mute the gradient
    expect(firstElement((m) => m.addOrnament({ date: 0, nameRef: 'trill' })).toXML()).toBe(
      `<ornament xmlns="${MPM_NS}" date="0" name.ref="trill" scale="0" />`,
    );
    expect(
      firstElement((m) => m.addOrnament({ date: 0, nameRef: 'trill', scale: 1.0 })).toXML(),
    ).toBe(`<ornament xmlns="${MPM_NS}" date="0" name.ref="trill" scale="1" />`);
  });

  it('should omit repetitions when it is 0', () => {
    // ≠ the reference implementation, which stamps repetitions="0" onto every ornament
    const e = firstElement((m) => m.addOrnament({ date: 0, nameRef: 'trill', repetitions: 0 }));
    expect(e.getAttribute('repetitions')).toBeNull();
  });

  it('should write repetitions="-1" for the fill-the-frame extension', () => {
    const e = firstElement((m) => m.addOrnament({ date: 0, nameRef: 'trill', repetitions: -1 }));
    expect(e.getAttributeValue('repetitions')).toBe('-1');
  });

  it('should accept the v2 array shape for note.order', () => {
    const e = firstElement((m) =>
      m.addOrnament({ date: 0, nameRef: 'arpeggio', noteOrder: ['n1', '#n2'] }),
    );
    expect(e.getAttributeValue('note.order')).toBe('#n1 #n2');
  });

  it('should accept a pitch keyword through the array shape', () => {
    const e = firstElement((m) =>
      m.addOrnament({ date: 0, nameRef: 'arpeggio', noteOrder: ['ascending pitch'] }),
    );
    expect(e.getAttributeValue('note.order')).toBe('ascending pitch');
  });

  it('should omit note.order for an empty list', () => {
    const e = firstElement((m) => m.addOrnament({ date: 0, nameRef: 'arpeggio', noteOrder: [] }));
    expect(e.getAttribute('note.order')).toBeNull();
  });

  it('should write the pool in the given order', () => {
    const e = firstElement((m) =>
      m.addOrnament({
        date: 0,
        nameRef: 'turn',
        notes: [
          new OrnamentNote('n3', { kind: 'chromatic', value: -1.0 }),
          new OrnamentNote('n2', { kind: 'midi', value: 64 }),
        ],
      }),
    );
    const children = e.getChildElements('note');
    expect(children.size()).toBe(2);
    expect(children.get(0).getAttribute('id', XML_NS)!.getValue()).toBe('n3');
    expect(children.get(1).getAttribute('id', XML_NS)!.getValue()).toBe('n2');
  });

  it('should keep the map sorted by date like the v2 form', () => {
    const m = OrnamentationMap.createOrnamentationMap();
    m.addOrnament({ date: 1440, nameRef: 'trill' });
    m.addOrnament({ date: 0, nameRef: 'trill' });
    m.addOrnament(720, 'trill');
    expect([0, 1, 2].map((i) => m.getElement(i)!.getAttributeValue('date'))).toEqual([
      '0',
      '720',
      '1440',
    ]);
  });

  it('should round-trip a v3 ornament through OrnamentData', () => {
    const m = OrnamentationMap.createOrnamentationMap();
    m.addOrnament({
      date: 720,
      nameRef: 'trill',
      noteid: '#princNote',
      noteOrder: '|: #n1 #princNote :|',
      repetitions: 3,
      scale: 20.0,
      notes: [new OrnamentNote('n1', { kind: 'chromatic', value: 1.0 })],
      id: 'orn3',
    });
    const source = m.getElement(0)!.toXML();

    const od = readOrnament(m.getElement(0)!);
    const m2 = OrnamentationMap.createOrnamentationMap();
    m2.addOrnamentFromData(od);

    expect(m2.getElement(0)!.toXML()).toBe(source);
  });

  it('should route addOrnamentFromData to the v3 form for each v3 marker on its own', () => {
    const base = (): OrnamentData => {
      const d = new OrnamentData();
      d.date = 0;
      d.ornamentDefName = 'trill';
      return d;
    };

    const withNoteid = base();
    withNoteid.noteid = '#p';
    const withRepetitions = base();
    withRepetitions.repetitions = 2;
    const withPool = base();
    withPool.notes = [new OrnamentNote('n1', { kind: 'midi', value: 60 })];

    for (const data of [withNoteid, withRepetitions, withPool]) {
      const m = OrnamentationMap.createOrnamentationMap();
      m.addOrnamentFromData(data);
      // The v2 form omits scale only at 1.0, so what discriminates the two writers here is the
      // v3 attribute itself plus scale being present for a default-constructed (0.0) datum.
      expect(m.getElement(0)!.getAttributeValue('scale')).toBe('0');
    }
  });
});

describe('OrnamentationMap — the duplicated millisecond pass', () => {
  /**
   * `Performance` carries a private static copy of
   * {@link OrnamentationMap.renderMillisecondsModifiersToMap}, and that copy is the one the
   * pipeline runs; this class's is Java-parity code no fixture reaches (architecture brief
   * §2.5, `docs/history/refactor/log.md:2376-2401`). The duplication stays deliberately, and
   * nothing else keeps the two bodies in step.
   *
   * The guard is two assertions, because either alone can pass while the copies have diverged:
   * source-text equality would not notice `parseFloat` versus `Number`-shaped semantics if
   * both were spelled the same way, and behavioural equality on one input would not notice a
   * branch neither input reaches.
   */
  describe('parity between the two copies of renderMillisecondsModifiersToMap', () => {
    /** A method body, brace to brace, cut out of the TypeScript source. */
    const methodBody = (relativePath: string, signature: string): string => {
      const source = readFileSync(
        join(dirname(fileURLToPath(import.meta.url)), '../../..', relativePath),
        'utf-8',
      );
      const at = source.indexOf(signature);
      expect(at, `${signature} not found in ${relativePath}`).toBeGreaterThanOrEqual(0);
      const start = source.indexOf('{', source.indexOf('): void', at));
      let depth = 0;
      let end = start;
      for (; end < source.length; ++end) {
        if (source[end] === '{') ++depth;
        else if (source[end] === '}' && --depth === 0) {
          ++end;
          break;
        }
      }
      return source.slice(start, end);
    };

    const performanceCopy = (): string =>
      methodBody(
        'src/mpm/elements/Performance.ts',
        'private static renderMillisecondsModifiersToMap',
      );
    const ornamentationCopy = (): string =>
      methodBody(
        'src/mpm/elements/maps/OrnamentationMap.ts',
        'static renderMillisecondsModifiersToMap',
      );

    it('has the same body in both files, token for token', () => {
      const collapse = (body: string) => body.replace(/\s+/g, ' ').trim();
      expect(collapse(performanceCopy())).toBe(collapse(ornamentationCopy()));
    });

    it('has the v3 fromend branch in both, character for character', () => {
      const branch = (body: string) => {
        const at = body.indexOf('const ornamentMillisecondsFromEndAtt');
        expect(at).toBeGreaterThanOrEqual(0);
        return body.slice(at, body.indexOf('const millisecondsDateEndAtt', at));
      };
      expect(branch(performanceCopy())).toBe(branch(ornamentationCopy()));
    });

    it('computes the same result from both, on an input that reaches every branch', () => {
      // One note per branch of the pass: a plain onset offset, an absolute duration, a
      // note-off shift, the v3 end-anchored offset, and one with no marker at all.
      const build = (): GenericMap => {
        const map = okValue(GenericMap.createGenericMap('score'));
        const note = (id: string, markers: Record<string, string>) => {
          const n = makeNote(id, 0, 60, {
            'milliseconds.date': '1000',
            'milliseconds.date.end': '2000',
            ...markers,
          });
          map.addElement(n);
          return n;
        };
        note('plain', {});
        note('offset', { 'ornament.milliseconds.date.offset': '-30' });
        note('absolute', {
          'ornament.milliseconds.date.offset': '-30',
          'ornament.milliseconds.duration': '250',
        });
        note('shift', {
          'ornament.milliseconds.date.offset': '-30',
          'ornament.noteoff.shift': 'true',
        });
        note('fromEnd', { 'ornament.milliseconds.fromend.offset': '-90' });
        note('fromEndShift', {
          'ornament.milliseconds.fromend.offset': '-90',
          'ornament.noteoff.shift': 'true',
        });
        note('fromEndAbsolute', {
          'ornament.milliseconds.fromend.offset': '-90',
          'ornament.milliseconds.duration': '250',
        });
        return map;
      };
      const read = (map: GenericMap): string[] =>
        map
          .getAllElementsOfType('note')
          .map(
            (e) =>
              `${e.getValue().getAttributeValue('xml:id')}:` +
              `${e.getValue().getAttributeValue('milliseconds.date')}/` +
              `${e.getValue().getAttributeValue('milliseconds.date.end')}`,
          );

      const viaOrnamentationMap = build();
      OrnamentationMap.renderMillisecondsModifiersToMap(
        viaOrnamentationMap,
        OrnamentationMap.createOrnamentationMap(),
      );

      const viaPerformance = build();
      // `private static`, so the cast is the only way in; it is a member of the emitted class
      // like any other.
      (
        Performance as unknown as {
          renderMillisecondsModifiersToMap: (
            map: GenericMap,
            ornamentationMap: OrnamentationMap | null,
          ) => void;
        }
      ).renderMillisecondsModifiersToMap(viaPerformance, OrnamentationMap.createOrnamentationMap());

      expect(read(viaPerformance)).toEqual(read(viaOrnamentationMap));
      // and the values are the ones the semantics call for, so this is not two wrongs agreeing
      expect(read(viaOrnamentationMap)).toEqual([
        'plain:1000/2000',
        'offset:970/2000',
        'absolute:970/1220',
        'shift:970/1970',
        'fromEnd:1910/2000',
        'fromEndShift:1910/2910',
        'fromEndAbsolute:1910/2160',
      ]);
    });
  });
});
