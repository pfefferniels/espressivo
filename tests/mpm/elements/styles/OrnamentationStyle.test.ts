import { describe, it, expect } from 'vitest';
import { OrnamentationStyle } from '../../../../src/mpm/elements/styles/OrnamentationStyle.js';
import {
  OrnamentDef,
  FrameDomain,
  NoteOffShift,
} from '../../../../src/mpm/elements/styles/defs/OrnamentDef.js';
import { Element, Attribute } from '../../../../src/xml/XomTypes.js';
import { Mpm } from '../../../../src/mpm/Mpm.js';

const XML_NS = 'http://www.w3.org/XML/1998/namespace';

/** build an ornamentDef XML subtree with optional transformer children */
function ornamentDefXml(
  name: string,
  dg?: Record<string, string> | null,
  ts?: Record<string, string> | null,
): Element {
  const e = new Element('ornamentDef', Mpm.MPM_NAMESPACE);
  e.addAttribute(new Attribute('name', name));
  if (dg) {
    const c = new Element('dynamicsGradient', Mpm.MPM_NAMESPACE);
    for (const [k, v] of Object.entries(dg)) c.addAttribute(new Attribute(k, v));
    e.appendChild(c);
  }
  if (ts) {
    const c = new Element('temporalSpread', Mpm.MPM_NAMESPACE);
    for (const [k, v] of Object.entries(ts)) c.addAttribute(new Attribute(k, v));
    e.appendChild(c);
  }
  return e;
}

/** the styleDef of the Java reference fixture (ornamentation.mpm) */
function referenceStyleXml(): Element {
  const styleDef = new Element('styleDef', Mpm.MPM_NAMESPACE);
  styleDef.addAttribute(new Attribute('name', 'orn style'));
  styleDef.appendChild(
    ornamentDefXml(
      'arpeggio',
      { 'transition.from': '-1.0', 'transition.to': '1.0' },
      { 'frame.start': '-22.0', frameLength: '44.0' },
    ),
  );
  styleDef.appendChild(
    ornamentDefXml(
      'spreadMs',
      { 'transition.from': '-0.5', 'transition.to': '0.5' },
      {
        'frame.start': '-30.0',
        frameLength: '60.0',
        'time.unit': 'milliseconds',
        intensity: '2.0',
        'noteoff.shift': 'true',
      },
    ),
  );
  return styleDef;
}

describe('OrnamentationStyle', () => {
  // ---------------------------------------------------------------
  //  Construction from a name
  // ---------------------------------------------------------------
  describe('createOrnamentationStyle(name)', () => {
    it('should create an empty style', () => {
      const style = OrnamentationStyle.createOrnamentationStyle('orn style')!;

      expect(style).not.toBeNull();
      expect(style.getName()).toBe('orn style');
      expect(style.isEmpty()).toBe(true);
      expect(style.size()).toBe(0);
    });

    it('should build a styleDef XML element', () => {
      const style = OrnamentationStyle.createOrnamentationStyle('orn style')!;
      expect(style.getXml()!.getLocalName()).toBe('styleDef');
      expect(style.getXml()!.getAttributeValue('name')).toBe('orn style');
    });

    it('should have no id unless one is given', () => {
      expect(OrnamentationStyle.createOrnamentationStyle('orn style')!.getId()).toBeNull();
    });

    it('should accept an id', () => {
      const style = OrnamentationStyle.createOrnamentationStyle('orn style', 'style-1')!;

      expect(style.getId()).toBe('style-1');
      expect(style.getXml()!.getAttribute('id', XML_NS)!.getValue()).toBe('style-1');
    });
  });

  // ---------------------------------------------------------------
  //  Construction from XML
  // ---------------------------------------------------------------
  describe('createOrnamentationStyle(xml)', () => {
    it('should parse all ornamentDef children of the reference styleDef', () => {
      const style = OrnamentationStyle.createOrnamentationStyle(referenceStyleXml())!;

      expect(style.getName()).toBe('orn style');
      expect(style.size()).toBe(2);
      expect(style.isEmpty()).toBe(false);
      expect(style.getDef('arpeggio')).toBeDefined();
      expect(style.getDef('spreadMs')).toBeDefined();
    });

    it('should hand through the parsed transformer data of each def', () => {
      const style = OrnamentationStyle.createOrnamentationStyle(referenceStyleXml())!;

      const arpeggio = style.getDef('arpeggio')!;
      expect(arpeggio.getDynamicsGradient()!.transitionFrom).toBe(-1.0);
      expect(arpeggio.getDynamicsGradient()!.transitionTo).toBe(1.0);
      expect(arpeggio.getTemporalSpread()!.frameStart).toBe(-22.0);
      expect(arpeggio.getTemporalSpread()!.getFrameLength()).toBe(44.0);
      expect(arpeggio.getTemporalSpread()!.frameDomain).toBe(FrameDomain.Ticks);
      expect(arpeggio.getTemporalSpread()!.noteOffShift).toBe(NoteOffShift.False);

      const spreadMs = style.getDef('spreadMs')!;
      expect(spreadMs.getDynamicsGradient()!.transitionFrom).toBe(-0.5);
      expect(spreadMs.getTemporalSpread()!.frameDomain).toBe(FrameDomain.Milliseconds);
      expect(spreadMs.getTemporalSpread()!.intensity).toBe(2.0);
      expect(spreadMs.getTemporalSpread()!.noteOffShift).toBe(NoteOffShift.True);
    });

    it('should key the lookup table by the ornamentDef name', () => {
      const style = OrnamentationStyle.createOrnamentationStyle(referenceStyleXml())!;

      expect(style.getAllDefs().size).toBe(2);
      expect([...style.getAllDefs().keys()].sort()).toEqual(['arpeggio', 'spreadMs']);
      expect(style.getDef('arpeggio')!.getName()).toBe('arpeggio');
    });

    it('should parse an id from the styleDef XML', () => {
      const xml = referenceStyleXml();
      xml.addAttribute(new Attribute('xml:id', XML_NS, 'style-42'));

      expect(OrnamentationStyle.createOrnamentationStyle(xml)!.getId()).toBe('style-42');
    });

    it('should ignore non-ornamentDef children', () => {
      const xml = new Element('styleDef', Mpm.MPM_NAMESPACE);
      xml.addAttribute(new Attribute('name', 'mixed'));
      xml.appendChild(ornamentDefXml('arpeggio'));
      xml.appendChild(new Element('articulationDef', Mpm.MPM_NAMESPACE));

      const style = OrnamentationStyle.createOrnamentationStyle(xml)!;
      expect(style.size()).toBe(1);
      expect(style.getDef('arpeggio')).toBeDefined();
    });

    it('should produce an empty style for a styleDef without ornamentDefs', () => {
      const xml = new Element('styleDef', Mpm.MPM_NAMESPACE);
      xml.addAttribute(new Attribute('name', 'empty'));

      const style = OrnamentationStyle.createOrnamentationStyle(xml)!;
      expect(style.getName()).toBe('empty');
      expect(style.isEmpty()).toBe(true);
    });

    it('should return null when the name attribute is missing', () => {
      const xml = new Element('styleDef', Mpm.MPM_NAMESPACE);
      xml.appendChild(ornamentDefXml('arpeggio'));

      expect(OrnamentationStyle.createOrnamentationStyle(xml)).toBeNull();
    });
  });

  // ---------------------------------------------------------------
  //  Def management
  // ---------------------------------------------------------------
  describe('def management', () => {
    it('should add a def and make it retrievable by name', () => {
      const style = OrnamentationStyle.createOrnamentationStyle('orn style')!;
      const def = OrnamentDef.createDefaultOrnamentDef('arpeggio')!;
      style.addDef(def);

      expect(style.size()).toBe(1);
      expect(style.getDef('arpeggio')).toBe(def);
      expect(style.getXml()!.getChildElements('ornamentDef').size()).toBe(1);
    });

    it('should return undefined for an unknown def name', () => {
      const style = OrnamentationStyle.createOrnamentationStyle('orn style')!;
      expect(style.getDef('nope')).toBeUndefined();
    });

    it('should replace a def that is added under an existing name', () => {
      const style = OrnamentationStyle.createOrnamentationStyle('orn style')!;
      const first = OrnamentDef.createDefaultOrnamentDef('arpeggio')!;
      const second = OrnamentDef.createOrnamentDef('arpeggio')!;
      second.setDynamicsGradientValues(-9.0, 9.0);

      style.addDef(first);
      style.addDef(second);

      expect(style.size()).toBe(1);
      expect(style.getDef('arpeggio')).toBe(second);
      expect(style.getDef('arpeggio')!.getDynamicsGradient()!.transitionTo).toBe(9.0);
      expect(style.getXml()!.getChildElements('ornamentDef').size()).toBe(1);
    });

    it('should remove a def by name', () => {
      const style = OrnamentationStyle.createOrnamentationStyle('orn style')!;
      style.addDef(OrnamentDef.createDefaultOrnamentDef('arpeggio')!);
      style.removeDef('arpeggio');

      expect(style.isEmpty()).toBe(true);
      expect(style.getDef('arpeggio')).toBeUndefined();
      expect(style.getXml()!.getChildElements('ornamentDef').size()).toBe(0);
    });

    it('should ignore removal of an unknown def name', () => {
      const style = OrnamentationStyle.createOrnamentationStyle('orn style')!;
      style.addDef(OrnamentDef.createDefaultOrnamentDef('arpeggio')!);

      expect(() => style.removeDef('nope')).not.toThrow();
      expect(style.size()).toBe(1);
    });

    it('should hold several defs side by side', () => {
      const style = OrnamentationStyle.createOrnamentationStyle('orn style')!;
      style.addDef(OrnamentDef.createDefaultOrnamentDef('arpeggio')!);
      style.addDef(OrnamentDef.createOrnamentDef('trill')!);

      expect(style.size()).toBe(2);
      expect(style.getXml()!.getChildElements('ornamentDef').size()).toBe(2);
    });
  });

  // ---------------------------------------------------------------
  //  Round trip
  // ---------------------------------------------------------------
  it('should survive an XML round trip', () => {
    const style = OrnamentationStyle.createOrnamentationStyle('orn style')!;
    style.addDef(OrnamentDef.createDefaultOrnamentDef('arpeggio')!);

    const reparsed = OrnamentationStyle.createOrnamentationStyle(style.getXml()!)!;
    expect(reparsed.getName()).toBe('orn style');
    expect(reparsed.size()).toBe(1);

    const ts = reparsed.getDef('arpeggio')!.getTemporalSpread()!;
    expect(ts.frameStart).toBe(-22.0);
    expect(ts.getFrameLength()).toBe(44.0);
  });
});
