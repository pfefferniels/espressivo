import { describe, it, expect } from 'vitest';
import { OrnamentationMap } from '../../../src/mpm/elements/maps/OrnamentationMap.js';
import { OrnamentData } from '../../../src/mpm/elements/maps/data/OrnamentData.js';
import { GenericMap } from '../../../src/mpm/elements/maps/GenericMap.js';
import { Element, Attribute } from '../../../src/xml/XomTypes.js';
import { Mpm } from '../../../src/mpm/Mpm.js';
import { Header } from '../../../src/mpm/elements/Header.js';
import { OrnamentationStyle } from '../../../src/mpm/elements/styles/OrnamentationStyle.js';
import { OrnamentDef } from '../../../src/mpm/elements/styles/defs/OrnamentDef.js';
import { FrameDomain, NoteOffShift } from '../../../src/mpm/elements/styles/defs/TemporalSpread.js';

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
  const score = GenericMap.createGenericMap('score')!;
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
  const def = OrnamentDef.createOrnamentDef('arpeggio')!;
  def.setDynamicsGradientValues(-1.0, 1.0);
  def.setTemporalSpreadValues(-22.0, 44.0, FrameDomain.Ticks, 1.0, NoteOffShift.False);
  return def;
}

/** the "spreadMs" ornamentDef of the Java reference fixture (ornamentation.mpm) */
function spreadMsDef(): OrnamentDef {
  const def = OrnamentDef.createOrnamentDef('spreadMs')!;
  def.setDynamicsGradientValues(-0.5, 0.5);
  def.setTemporalSpreadValues(-30.0, 60.0, FrameDomain.Milliseconds, 2.0, NoteOffShift.True);
  return def;
}

/** a header carrying an ornamentationStyle named "orn style" with the given defs */
function makeHeader(defs: OrnamentDef[], styleName = 'orn style'): Header {
  const header = Header.createHeader()!;
  const style = OrnamentationStyle.createOrnamentationStyle(styleName)!;
  for (const d of defs) style.addDef(d);
  header.addStyleDef(Mpm.ORNAMENTATION_STYLE, style);
  return header;
}

describe('OrnamentationMap', () => {
  // ---------------------------------------------------------------
  // Create an ornamentation map
  // ---------------------------------------------------------------
  describe('createOrnamentationMap', () => {
    it('should create an empty ornamentation map', () => {
      const map = OrnamentationMap.createOrnamentationMap();
      expect(map).not.toBeNull();
      expect(map!.getType()).toBe('ornamentationMap');
    });

    it('should start with size 0', () => {
      const map = OrnamentationMap.createOrnamentationMap()!;
      expect(map.size()).toBe(0);
      expect(map.isEmpty()).toBe(true);
    });

    it('should have an XML element', () => {
      const map = OrnamentationMap.createOrnamentationMap()!;
      expect(map.getXml()).not.toBeNull();
      expect(map.getXml()!.getLocalName()).toBe('ornamentationMap');
    });
  });

  // ---------------------------------------------------------------
  // Add ornament
  // ---------------------------------------------------------------
  describe('addOrnament', () => {
    it('should add an ornament with required parameters only', () => {
      const map = OrnamentationMap.createOrnamentationMap()!;
      const index = map.addOrnament(0, 'trill');
      expect(index).toBeGreaterThanOrEqual(0);
      expect(map.size()).toBe(1);
    });

    it('should store date and name.ref', () => {
      const map = OrnamentationMap.createOrnamentationMap()!;
      const index = map.addOrnament(240, 'mordent');
      const elem = map.getElement(index)!;

      expect(elem.getLocalName()).toBe('ornament');
      expect(elem.getAttributeValue('date')).toBe('240');
      expect(elem.getAttributeValue('name.ref')).toBe('mordent');
    });

    it('should not store scale if it is 1.0 (default)', () => {
      const map = OrnamentationMap.createOrnamentationMap()!;
      const index = map.addOrnament(0, 'trill', 1.0);
      const elem = map.getElement(index)!;

      expect(elem.getAttribute('scale')).toBeNull();
    });

    it('should store scale if not 1.0', () => {
      const map = OrnamentationMap.createOrnamentationMap()!;
      const index = map.addOrnament(0, 'trill', 2.0);
      const elem = map.getElement(index)!;

      expect(elem.getAttributeValue('scale')).toBe('2');
    });

    it('should store note.order with individual note IDs', () => {
      const map = OrnamentationMap.createOrnamentationMap()!;
      const index = map.addOrnament(0, 'trill', 1.0, ['note1', 'note2', 'note3']);
      const elem = map.getElement(index)!;

      const noteOrder = elem.getAttributeValue('note.order');
      expect(noteOrder).not.toBeNull();
      expect(noteOrder).toContain('#note1');
      expect(noteOrder).toContain('#note2');
      expect(noteOrder).toContain('#note3');
    });

    it('should store note.order with ascending pitch', () => {
      const map = OrnamentationMap.createOrnamentationMap()!;
      const index = map.addOrnament(0, 'trill', 1.0, ['ascending pitch']);
      const elem = map.getElement(index)!;

      expect(elem.getAttributeValue('note.order')).toBe('ascending pitch');
    });

    it('should store note.order with descending pitch', () => {
      const map = OrnamentationMap.createOrnamentationMap()!;
      const index = map.addOrnament(0, 'trill', 1.0, ['descending pitch']);
      const elem = map.getElement(index)!;

      expect(elem.getAttributeValue('note.order')).toBe('descending pitch');
    });

    it('should not store note.order if null', () => {
      const map = OrnamentationMap.createOrnamentationMap()!;
      const index = map.addOrnament(0, 'trill', 1.0, null);
      const elem = map.getElement(index)!;

      expect(elem.getAttribute('note.order')).toBeNull();
    });

    it('should store xml:id if provided', () => {
      const map = OrnamentationMap.createOrnamentationMap()!;
      const index = map.addOrnament(0, 'trill', 1.0, null, 'orn-1');
      const elem = map.getElement(index)!;

      const idAttr = elem.getAttribute('id', 'http://www.w3.org/XML/1998/namespace');
      expect(idAttr).not.toBeNull();
      expect(idAttr!.getValue()).toBe('orn-1');
    });

    it('should not store xml:id if null', () => {
      const map = OrnamentationMap.createOrnamentationMap()!;
      const index = map.addOrnament(0, 'trill', 1.0, null, null);
      const elem = map.getElement(index)!;

      expect(elem.getAttribute('id', 'http://www.w3.org/XML/1998/namespace')).toBeNull();
    });

    it('should not store xml:id if empty string', () => {
      const map = OrnamentationMap.createOrnamentationMap()!;
      const index = map.addOrnament(0, 'trill', 1.0, null, '');
      const elem = map.getElement(index)!;

      expect(elem.getAttribute('id', 'http://www.w3.org/XML/1998/namespace')).toBeNull();
    });

    it('should maintain sorted order when adding out of order', () => {
      const map = OrnamentationMap.createOrnamentationMap()!;
      map.addOrnament(960, 'mordent');
      map.addOrnament(0, 'trill');
      map.addOrnament(480, 'turn');

      expect(map.size()).toBe(3);
      expect(map.getElement(0)!.getAttributeValue('date')).toBe('0');
      expect(map.getElement(1)!.getAttributeValue('date')).toBe('480');
      expect(map.getElement(2)!.getAttributeValue('date')).toBe('960');
    });
  });

  // ---------------------------------------------------------------
  // addOrnamentFromData
  // ---------------------------------------------------------------
  describe('addOrnamentFromData', () => {
    it('should return -1 if no ornamentDef and no ornamentDefName', () => {
      const map = OrnamentationMap.createOrnamentationMap()!;
      const od = new OrnamentData();
      od.date = 0;
      od.ornamentDef = null;
      od.ornamentDefName = null;

      const index = map.addOrnamentFromData(od);
      expect(index).toBe(-1);
      expect(map.size()).toBe(0);
    });

    it('should add ornament with ornamentDefName', () => {
      const map = OrnamentationMap.createOrnamentationMap()!;
      const od = new OrnamentData();
      od.date = 100;
      od.ornamentDefName = 'trill';
      od.scale = 1.5;

      const index = map.addOrnamentFromData(od);
      expect(index).toBeGreaterThanOrEqual(0);
      expect(map.size()).toBe(1);
    });
  });

  // ---------------------------------------------------------------
  // getOrnamentDataOf
  // ---------------------------------------------------------------
  describe('getOrnamentDataOf', () => {
    it('should return null for an empty map', () => {
      const map = OrnamentationMap.createOrnamentationMap()!;
      expect(map.getOrnamentDataOf(0)).toBeNull();
    });

    it('should return null for negative index', () => {
      const map = OrnamentationMap.createOrnamentationMap()!;
      map.addOrnament(0, 'trill');
      expect(map.getOrnamentDataOf(-1)).toBeNull();
    });

    it('should return null when no style is configured', () => {
      // Without a proper header/style configured, getOrnamentDataOf returns null
      const map = OrnamentationMap.createOrnamentationMap()!;
      map.addOrnament(0, 'trill');

      const result = map.getOrnamentDataOf(0);
      expect(result).toBeNull();
    });
  });

  // ---------------------------------------------------------------
  // OrnamentData
  // ---------------------------------------------------------------
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

    it('should construct from XML element', () => {
      const xml = new Element('ornament', Mpm.MPM_NAMESPACE);
      xml.addAttribute(new Attribute('date', '480'));
      xml.addAttribute(new Attribute('name.ref', 'turn'));
      xml.addAttribute(new Attribute('scale', '2.5'));

      const od = new OrnamentData(xml);
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

      expect(new OrnamentData(xml).xmlId).toBe('orn-xml-1');
    });

    it('should leave xmlId null when the XML has no xml:id', () => {
      const xml = new Element('ornament', Mpm.MPM_NAMESPACE);
      xml.addAttribute(new Attribute('date', '0'));
      xml.addAttribute(new Attribute('name.ref', 'trill'));

      expect(new OrnamentData(xml).xmlId).toBeNull();
    });

    it('should leave scale at 0.0 when the XML has no scale', () => {
      const xml = new Element('ornament', Mpm.MPM_NAMESPACE);
      xml.addAttribute(new Attribute('date', '960'));
      xml.addAttribute(new Attribute('name.ref', 'trill'));

      const od = new OrnamentData(xml);
      expect(od.scale).toBe(0.0);
      expect(od.date).toBe(960);
    });

    it('should parse note.order from XML - individual IDs', () => {
      const xml = new Element('ornament', Mpm.MPM_NAMESPACE);
      xml.addAttribute(new Attribute('date', '0'));
      xml.addAttribute(new Attribute('name.ref', 'trill'));
      xml.addAttribute(new Attribute('note.order', '#note1 #note2'));

      const od = new OrnamentData(xml);
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

      const od = new OrnamentData(xml);
      expect(od.noteOrder).not.toBeNull();
      expect(od.noteOrder!.length).toBe(1);
      expect(od.noteOrder![0]).toBe('ascending pitch');
    });

    it('should parse note.order from XML - descending pitch', () => {
      const xml = new Element('ornament', Mpm.MPM_NAMESPACE);
      xml.addAttribute(new Attribute('date', '0'));
      xml.addAttribute(new Attribute('name.ref', 'trill'));
      xml.addAttribute(new Attribute('note.order', 'descending pitch'));

      const od = new OrnamentData(xml);
      expect(od.noteOrder).not.toBeNull();
      expect(od.noteOrder!.length).toBe(1);
      expect(od.noteOrder![0]).toBe('descending pitch');
    });
  });

  // ---------------------------------------------------------------
  // renderOrnamentationToMap / static wrappers
  // ---------------------------------------------------------------
  describe('render methods', () => {
    it('renderOrnamentationToMap with null map does not throw', () => {
      const map = OrnamentationMap.createOrnamentationMap()!;
      map.addOrnament(0, 'trill');
      // Should not throw
      map.renderOrnamentationToMap(null);
    });

    it('static renderOrnamentationToMap with null ornamentation map does not throw', () => {
      const target = GenericMap.createGenericMap('positionMap')!;
      // Should not throw
      OrnamentationMap.renderOrnamentationToMap(target, null);
    });

    it('static renderMillisecondsModifiersToMap with null does not throw', () => {
      OrnamentationMap.renderMillisecondsModifiersToMap(null, null);
    });
  });

  // ---------------------------------------------------------------
  // GenericMap operations on OrnamentationMap
  // ---------------------------------------------------------------
  describe('GenericMap operations', () => {
    it('should support removeElement by index', () => {
      const map = OrnamentationMap.createOrnamentationMap()!;
      map.addOrnament(0, 'trill');
      map.addOrnament(960, 'mordent');

      map.removeElement(0);
      expect(map.size()).toBe(1);
      expect(map.getElement(0)!.getAttributeValue('name.ref')).toBe('mordent');
    });

    it('should support setId and getId', () => {
      const map = OrnamentationMap.createOrnamentationMap()!;
      expect(map.getId()).toBeNull();

      map.setId('ornMap-1');
      expect(map.getId()).toBe('ornMap-1');
    });

    it('should support addStyleSwitch', () => {
      const map = OrnamentationMap.createOrnamentationMap()!;
      const index = map.addStyleSwitch(0, 'myOrnStyle');
      expect(index).toBeGreaterThanOrEqual(0);
      expect(map.size()).toBe(1);

      const elem = map.getElement(index)!;
      expect(elem.getLocalName()).toBe('style');
      expect(elem.getAttributeValue('name.ref')).toBe('myOrnStyle');
    });

    it('should support getElementBeforeAt', () => {
      const map = OrnamentationMap.createOrnamentationMap()!;
      map.addOrnament(0, 'trill');
      map.addOrnament(480, 'mordent');
      map.addOrnament(960, 'turn');

      const elem = map.getElementBeforeAt(500);
      expect(elem).not.toBeNull();
      expect(elem!.getAttributeValue('name.ref')).toBe('mordent');
    });
  });

  // ---------------------------------------------------------------
  //  getOrnamentDataOf with a resolvable style
  // ---------------------------------------------------------------
  describe('getOrnamentDataOf with a style', () => {
    function mapWithStyle(): OrnamentationMap {
      const map = OrnamentationMap.createOrnamentationMap()!;
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
      const map = OrnamentationMap.createOrnamentationMap()!;
      const header = makeHeader([arpeggioDef()]);
      const second = OrnamentationStyle.createOrnamentationStyle('late style')!;
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
      const map = OrnamentationMap.createOrnamentationMap()!;
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

  // ---------------------------------------------------------------
  //  Ornament rendering - parity with the Java reference fixture
  //  tests/integration/fixtures/all-maps-reference/ornamentation*.
  // ---------------------------------------------------------------
  describe('renderOrnamentationToMap', () => {
    it('should apply a tick arpeggio exactly as the Java reference does', () => {
      // reference fixture, orn1: <ornament date="0.0" name.ref="arpeggio"/>
      // over n1/n2/n3 (pitches 60/64/67, duration 1440, velocity 100)
      const n1 = makePerformedNote('n1', 0, 60);
      const n2 = makePerformedNote('n2', 0, 64);
      const n3 = makePerformedNote('n3', 0, 67);
      const score = makeScore([n1, n2, n3]);

      const map = OrnamentationMap.createOrnamentationMap()!;
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

      const map = OrnamentationMap.createOrnamentationMap()!;
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

      const map = OrnamentationMap.createOrnamentationMap()!;
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

      const map = OrnamentationMap.createOrnamentationMap()!;
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

      const map = OrnamentationMap.createOrnamentationMap()!;
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

      const map = OrnamentationMap.createOrnamentationMap()!;
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

      const map = OrnamentationMap.createOrnamentationMap()!;
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

      const map = OrnamentationMap.createOrnamentationMap()!;
      map.setHeaders(null, makeHeader([arpeggioDef()]));
      map.addStyleSwitch(0, 'orn style');
      map.addOrnament(0, 'arpeggio', 2.0, ['ascending pitch']);

      map.renderOrnamentationToMap(score);

      expect(num(low, 'ornament.date.offset')).toBeCloseTo(-22.0);
      expect(num(high, 'ornament.date.offset')).toBeCloseTo(22.0);
    });

    it('should do nothing for a null map', () => {
      const map = OrnamentationMap.createOrnamentationMap()!;
      map.setHeaders(null, makeHeader([arpeggioDef()]));
      expect(() => map.renderOrnamentationToMap(null)).not.toThrow();
    });

    it('should only render the modifiers when there is no local header', () => {
      // a global ornamentationMap has already been applied via
      // renderGlobalOrnamentationMap, so apply() must not run a second time
      const n = makePerformedNote('n1', 0, 60);
      n.addAttribute(new Attribute('ornament.date.offset', '-22'));
      const score = makeScore([n]);

      const map = OrnamentationMap.createOrnamentationMap()!;
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

  // ---------------------------------------------------------------
  //  Rendering the modifier attributes into performance attributes
  // ---------------------------------------------------------------
  describe('non-milliseconds modifier rendering', () => {
    /** an ornamentationMap without headers only renders modifiers, it does not apply ornaments */
    function modifierOnlyMap(): OrnamentationMap {
      return OrnamentationMap.createOrnamentationMap()!;
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

  // ---------------------------------------------------------------
  //  renderMillisecondsModifiersToMap
  // ---------------------------------------------------------------
  describe('renderMillisecondsModifiersToMap', () => {
    const ornMap = () => OrnamentationMap.createOrnamentationMap()!;

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

  // ---------------------------------------------------------------
  //  Global ornamentation
  // ---------------------------------------------------------------
  describe('renderGlobalOrnamentationToParts', () => {
    it('should spread one ornament across the notes of all parts', () => {
      const a1 = makePerformedNote('a1', 0, 60);
      const a2 = makePerformedNote('a2', 0, 64);
      const b1 = makePerformedNote('b1', 0, 67);
      const partA = makePart([a1, a2]);
      const partB = makePart([b1]);

      const map = OrnamentationMap.createOrnamentationMap()!;
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
        OrnamentationMap.createOrnamentationMap()!,
      );

      expect(n.getAttribute('ornament.date.offset')).toBeNull();
    });

    it('should skip parts that have no dated/score subtree', () => {
      const bare = new Element('part');
      const datedOnly = new Element('part');
      datedOnly.appendChild(new Element('dated'));

      const map = OrnamentationMap.createOrnamentationMap()!;
      map.setHeaders(makeHeader([arpeggioDef()]), null);
      map.addStyleSwitch(0, 'orn style');
      map.addOrnament(0, 'arpeggio', 2.0);

      expect(() =>
        OrnamentationMap.renderGlobalOrnamentationToParts([bare, datedOnly], map),
      ).not.toThrow();
    });

    it('should do nothing for an empty map list', () => {
      const map = OrnamentationMap.createOrnamentationMap()!;
      map.setHeaders(makeHeader([arpeggioDef()]), null);
      map.addOrnament(0, 'arpeggio');

      expect(() => map.renderGlobalOrnamentationMap([])).not.toThrow();
    });
  });

  // ---------------------------------------------------------------
  //  Ornaments that cannot be resolved
  // ---------------------------------------------------------------
  describe('unresolvable ornaments', () => {
    it('should not touch the notes when no header is available', () => {
      const n = makePerformedNote('n1', 0, 60);
      const score = makeScore([n]);

      const map = OrnamentationMap.createOrnamentationMap()!;
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

      const map = OrnamentationMap.createOrnamentationMap()!;
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

      const map = OrnamentationMap.createOrnamentationMap()!;
      map.setHeaders(null, makeHeader([arpeggioDef()]));
      map.addStyleSwitch(0, 'no such style');
      map.addOrnament(0, 'arpeggio', 2.0);

      map.renderOrnamentationToMap(score);
      expect(n.getAttribute('ornament.date.offset')).toBeNull();
    });

    it('should skip ornaments whose name.ref matches no ornamentDef', () => {
      const n = makePerformedNote('n1', 0, 60);
      const score = makeScore([n]);

      const map = OrnamentationMap.createOrnamentationMap()!;
      map.setHeaders(null, makeHeader([arpeggioDef()]));
      map.addStyleSwitch(0, 'orn style');
      map.addOrnament(0, 'nosuchdef', 2.0);

      map.renderOrnamentationToMap(score);
      expect(n.getAttribute('ornament.date.offset')).toBeNull();
    });

    it('should skip an ornament that has no note to work on', () => {
      const n = makePerformedNote('n1', 0, 60);
      const score = makeScore([n]);

      const map = OrnamentationMap.createOrnamentationMap()!;
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

      const map = OrnamentationMap.createOrnamentationMap()!;
      map.setHeaders(makeHeader([arpeggioDef()]), Header.createHeader()!); // empty local header
      map.addStyleSwitch(0, 'orn style');
      map.addOrnament(0, 'arpeggio', 2.0);

      map.renderOrnamentationToMap(score);

      expect(num(n1, 'ornament.date.offset')).toBeCloseTo(-22.0);
      expect(num(n2, 'ornament.date.offset')).toBeCloseTo(22.0);
    });
  });

  // ---------------------------------------------------------------
  //  OrnamentData.apply
  // ---------------------------------------------------------------
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
      const def = OrnamentDef.createOrnamentDef('dynOnly')!;
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
      const def = OrnamentDef.createOrnamentDef('spreadOnly')!;
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
      od.ornamentDef = OrnamentDef.createOrnamentDef('plain')!;

      const n = makeNote('n1', 0, 60);
      expect(od.apply([[n]])).toEqual([]);
      expect(n.getAttributeCount()).toBe(3); // xml:id, date, midi.pitch
    });

    it('should copy the xml element on clone', () => {
      const xml = new Element('ornament', Mpm.MPM_NAMESPACE);
      xml.addAttribute(new Attribute('date', '480'));
      xml.addAttribute(new Attribute('name.ref', 'turn'));

      const od = new OrnamentData(xml);
      const clone = od.clone();

      expect(clone.xml).not.toBeNull();
      expect(clone.xml).not.toBe(od.xml);
      expect(clone.xml!.getAttributeValue('name.ref')).toBe('turn');
    });

    it('should carry style and ornamentDef references over to the clone', () => {
      const od = new OrnamentData();
      od.style = OrnamentationStyle.createOrnamentationStyle('orn style');
      od.ornamentDef = arpeggioDef();

      const clone = od.clone();
      expect(clone.style).toBe(od.style);
      expect(clone.ornamentDef).toBe(od.ornamentDef);
    });
  });
});
