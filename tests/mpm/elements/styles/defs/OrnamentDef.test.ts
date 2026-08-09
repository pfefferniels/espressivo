import { describe, it, expect } from 'vitest';
import { OrnamentDef } from '../../../../../src/mpm/elements/styles/defs/OrnamentDef.js';
import { DynamicsGradient } from '../../../../../src/mpm/elements/styles/defs/DynamicsGradient.js';
import {
  TemporalSpread,
  FrameDomain,
  NoteOffShift,
} from '../../../../../src/mpm/elements/styles/defs/TemporalSpread.js';
import { Element, Attribute, Builder } from '../../../../../src/xml/XomTypes.js';
import { Mpm } from '../../../../../src/mpm/Mpm.js';

const XML_NS = 'http://www.w3.org/XML/1998/namespace';

/** build a bare MSM note element */
function makeNote(id: string, attrs: Record<string, string> = {}): Element {
  const n = new Element('note');
  n.addAttribute(new Attribute('xml:id', XML_NS, id));
  for (const [k, v] of Object.entries(attrs)) n.addAttribute(new Attribute(k, v));
  return n;
}

/** numeric attribute read-back */
function num(e: Element, name: string): number {
  return parseFloat(e.getAttributeValue(name)!);
}

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

// ==========================================================================
//  DynamicsGradient
// ==========================================================================
describe('DynamicsGradient', () => {
  describe('construction', () => {
    it('should default both transition values to 0', () => {
      const dg = new DynamicsGradient();
      expect(dg.transitionFrom).toBe(0.0);
      expect(dg.transitionTo).toBe(0.0);
      expect(dg.getId()).toBeNull();
    });

    it('toXml should be empty as long as no XML was generated', () => {
      expect(new DynamicsGradient().toXml()).toBe('');
    });

    it('should parse transition.from and transition.to from XML', () => {
      const xml = new Element('dynamicsGradient', Mpm.MPM_NAMESPACE);
      xml.addAttribute(new Attribute('transition.from', '-1.0'));
      xml.addAttribute(new Attribute('transition.to', '1.0'));

      const dg = new DynamicsGradient(xml);
      expect(dg.transitionFrom).toBe(-1.0);
      expect(dg.transitionTo).toBe(1.0);
    });

    it('should assume constant dynamics when transition.to is absent', () => {
      // Java OrnamentDef.DynamicsGradient(Element): a missing transition.to
      // means constant dynamics, so transitionTo takes over transitionFrom.
      const xml = new Element('dynamicsGradient', Mpm.MPM_NAMESPACE);
      xml.addAttribute(new Attribute('transition.from', '7.5'));

      const dg = new DynamicsGradient(xml);
      expect(dg.transitionFrom).toBe(7.5);
      expect(dg.transitionTo).toBe(7.5);
    });

    it('should keep transition.from at 0 when only transition.to is given', () => {
      const xml = new Element('dynamicsGradient', Mpm.MPM_NAMESPACE);
      xml.addAttribute(new Attribute('transition.to', '12.0'));

      const dg = new DynamicsGradient(xml);
      expect(dg.transitionFrom).toBe(0.0);
      expect(dg.transitionTo).toBe(12.0);
    });

    it('should parse xml:id from XML', () => {
      const xml = new Element('dynamicsGradient', Mpm.MPM_NAMESPACE);
      xml.addAttribute(new Attribute('xml:id', XML_NS, 'dg-1'));

      expect(new DynamicsGradient(xml).getId()).toBe('dg-1');
    });
  });

  describe('apply', () => {
    it('should spread the gradient linearly over the chord sequence', () => {
      // mirrors the "arpeggio" ornament of the Java reference fixture at date 1440
      // (dynamicsGradient -1..1, scale 2): the three notes get -2, 0, +2
      const dg = new DynamicsGradient();
      dg.transitionFrom = -1.0;
      dg.transitionTo = 1.0;

      const n1 = makeNote('n1'),
        n2 = makeNote('n2'),
        n3 = makeNote('n3');
      dg.apply([[n1], [n2], [n3]], 2.0);

      expect(num(n1, 'ornament.dynamics')).toBeCloseTo(-2.0);
      expect(num(n2, 'ornament.dynamics')).toBeCloseTo(0.0);
      expect(num(n3, 'ornament.dynamics')).toBeCloseTo(2.0);
    });

    it('should yield a constant offset when transitionFrom equals transitionTo', () => {
      const dg = new DynamicsGradient();
      dg.transitionFrom = 5.0;
      dg.transitionTo = 5.0;

      const notes = [makeNote('a'), makeNote('b'), makeNote('c')];
      dg.apply(
        notes.map((n) => [n]),
        1.0,
      );

      for (const n of notes) expect(num(n, 'ornament.dynamics')).toBeCloseTo(5.0);
    });

    it('should scale the whole gradient', () => {
      const dg = new DynamicsGradient();
      dg.transitionFrom = -4.0;
      dg.transitionTo = 4.0;

      const n1 = makeNote('n1'),
        n2 = makeNote('n2'),
        n3 = makeNote('n3');
      dg.apply([[n1], [n2], [n3]], 0.5);

      expect(num(n1, 'ornament.dynamics')).toBeCloseTo(-2.0);
      expect(num(n2, 'ornament.dynamics')).toBeCloseTo(0.0);
      expect(num(n3, 'ornament.dynamics')).toBeCloseTo(2.0);
    });

    it('should produce a zero gradient for scale 0', () => {
      // this is what an ornament without a scale attribute does, because
      // OrnamentData.scale defaults to 0.0 (see the reference fixture, orn1/orn3)
      const dg = new DynamicsGradient();
      dg.transitionFrom = -1.0;
      dg.transitionTo = 1.0;

      const n1 = makeNote('n1'),
        n2 = makeNote('n2'),
        n3 = makeNote('n3');
      dg.apply([[n1], [n2], [n3]], 0.0);

      for (const n of [n1, n2, n3]) expect(num(n, 'ornament.dynamics')).toBe(0);
    });

    it('should use transitionTo for a single-chord sequence', () => {
      const dg = new DynamicsGradient();
      dg.transitionFrom = -1.0;
      dg.transitionTo = 3.0;

      const n = makeNote('n1');
      dg.apply([[n]], 2.0);

      expect(num(n, 'ornament.dynamics')).toBeCloseTo(6.0); // transitionTo * scale
    });

    it('should do nothing for an empty chord sequence', () => {
      const dg = new DynamicsGradient();
      dg.transitionFrom = -1.0;
      dg.transitionTo = 1.0;
      expect(() => dg.apply([], 1.0)).not.toThrow();
    });

    it('should give every note of a chord the same dynamics value', () => {
      const dg = new DynamicsGradient();
      dg.transitionFrom = 0.0;
      dg.transitionTo = 10.0;

      const low = makeNote('low'),
        mid = makeNote('mid'),
        high = makeNote('high');
      dg.apply([[low], [mid, high]], 1.0);

      expect(num(mid, 'ornament.dynamics')).toBeCloseTo(10.0);
      expect(num(high, 'ornament.dynamics')).toBeCloseTo(10.0);
    });

    it('should add to an already present ornament.dynamics attribute', () => {
      const dg = new DynamicsGradient();
      dg.transitionFrom = 2.0;
      dg.transitionTo = 2.0;

      const n = makeNote('n1', { 'ornament.dynamics': '5' });
      dg.apply([[n]], 1.0);

      expect(num(n, 'ornament.dynamics')).toBeCloseTo(7.0); // 5 + 2
    });
  });

  describe('generateXML', () => {
    it('should omit transition.from when it is 0.0', () => {
      const dg = new DynamicsGradient();
      const xml = dg.generateXML();

      expect(xml.getLocalName()).toBe('dynamicsGradient');
      expect(xml.getAttribute('transition.from')).toBeNull();
    });

    it('should omit transition.to when it equals transition.from', () => {
      const dg = new DynamicsGradient();
      dg.transitionFrom = 3.0;
      dg.transitionTo = 3.0;
      const xml = dg.generateXML();

      expect(xml.getAttributeValue('transition.from')).toBe('3');
      expect(xml.getAttribute('transition.to')).toBeNull();
    });

    it('should write both values when they differ', () => {
      const dg = new DynamicsGradient();
      dg.transitionFrom = -1.0;
      dg.transitionTo = 1.0;
      const xml = dg.generateXML();

      expect(xml.getAttributeValue('transition.from')).toBe('-1');
      expect(xml.getAttributeValue('transition.to')).toBe('1');
    });

    it('getXml should generate the XML lazily', () => {
      const dg = new DynamicsGradient();
      dg.transitionFrom = 2.0;

      expect(dg.toXml()).toBe('');
      expect(dg.getXml().getLocalName()).toBe('dynamicsGradient');
      expect(dg.toXml()).not.toBe('');
    });

    it('should survive an XML round trip', () => {
      const dg = new DynamicsGradient();
      dg.transitionFrom = -0.5;
      dg.transitionTo = 0.5;

      const reparsed = new DynamicsGradient(dg.generateXML());
      expect(reparsed.transitionFrom).toBe(-0.5);
      expect(reparsed.transitionTo).toBe(0.5);
    });
  });

  describe('setId', () => {
    it('should store the id and put it into the XML', () => {
      const dg = new DynamicsGradient();
      dg.setId('dg-7');

      expect(dg.getId()).toBe('dg-7');
      expect(dg.getXml().getAttribute('id', XML_NS)!.getValue()).toBe('dg-7');
    });

    it('should overwrite an id that is already present', () => {
      const xml = new Element('dynamicsGradient', Mpm.MPM_NAMESPACE);
      xml.addAttribute(new Attribute('xml:id', XML_NS, 'old'));

      const dg = new DynamicsGradient(xml);
      dg.setId('new');

      expect(dg.getId()).toBe('new');
      expect(xml.getAttribute('id', XML_NS)!.getValue()).toBe('new');
    });

    it('should detach the id from the XML when set to null', () => {
      const xml = new Element('dynamicsGradient', Mpm.MPM_NAMESPACE);
      xml.addAttribute(new Attribute('xml:id', XML_NS, 'dg-1'));

      const dg = new DynamicsGradient(xml);
      expect(dg.getId()).toBe('dg-1');

      dg.setId(null);
      expect(dg.getId()).toBeNull();
      expect(xml.getAttribute('id', XML_NS)).toBeNull();
    });

    it('should tolerate setId(null) when there is no id at all', () => {
      const dg = new DynamicsGradient();
      expect(() => dg.setId(null)).not.toThrow();
      expect(dg.getId()).toBeNull();
    });
  });
});

// ==========================================================================
//  TemporalSpread
// ==========================================================================
describe('TemporalSpread', () => {
  describe('construction', () => {
    it('should have the documented default values', () => {
      const ts = new TemporalSpread();
      expect(ts.frameStart).toBe(0.0);
      expect(ts.getFrameLength()).toBe(0.0);
      expect(ts.frameDomain).toBe(FrameDomain.Ticks);
      expect(ts.intensity).toBe(1.0);
      expect(ts.noteOffShift).toBe(NoteOffShift.False);
      expect(ts.getId()).toBeNull();
    });

    it('should clamp a negative frame length to 0', () => {
      const ts = new TemporalSpread();
      ts.setFrameLength(-50.0);
      expect(ts.getFrameLength()).toBe(0.0);
    });

    it('should accept a positive frame length', () => {
      const ts = new TemporalSpread();
      ts.setFrameLength(44.0);
      expect(ts.getFrameLength()).toBe(44.0);
    });

    it('should parse a full attribute set from XML', () => {
      // the "spreadMs" ornamentDef of the Java reference fixture
      const xml = new Element('temporalSpread', Mpm.MPM_NAMESPACE);
      xml.addAttribute(new Attribute('frame.start', '-30.0'));
      xml.addAttribute(new Attribute('frameLength', '60.0'));
      xml.addAttribute(new Attribute('time.unit', 'milliseconds'));
      xml.addAttribute(new Attribute('intensity', '2.0'));
      xml.addAttribute(new Attribute('noteoff.shift', 'true'));
      xml.addAttribute(new Attribute('xml:id', XML_NS, 'ts-1'));

      const ts = new TemporalSpread(xml);
      expect(ts.frameStart).toBe(-30.0);
      expect(ts.getFrameLength()).toBe(60.0);
      expect(ts.frameDomain).toBe(FrameDomain.Milliseconds);
      expect(ts.intensity).toBe(2.0);
      expect(ts.noteOffShift).toBe(NoteOffShift.True);
      expect(ts.getId()).toBe('ts-1');
    });

    it('should default to the ticks domain when time.unit is absent', () => {
      const xml = new Element('temporalSpread', Mpm.MPM_NAMESPACE);
      xml.addAttribute(new Attribute('frameLength', '44.0'));

      expect(new TemporalSpread(xml).frameDomain).toBe(FrameDomain.Ticks);
    });

    it('should map time.unit="ticks" to the ticks domain', () => {
      const xml = new Element('temporalSpread', Mpm.MPM_NAMESPACE);
      xml.addAttribute(new Attribute('time.unit', 'ticks'));

      expect(new TemporalSpread(xml).frameDomain).toBe(FrameDomain.Ticks);
    });

    it('should parse noteoff.shift="monophonic"', () => {
      const xml = new Element('temporalSpread', Mpm.MPM_NAMESPACE);
      xml.addAttribute(new Attribute('noteoff.shift', 'monophonic'));

      expect(new TemporalSpread(xml).noteOffShift).toBe(NoteOffShift.Monophonic);
    });

    it('should parse noteoff.shift="false"', () => {
      const xml = new Element('temporalSpread', Mpm.MPM_NAMESPACE);
      xml.addAttribute(new Attribute('noteoff.shift', 'false'));

      expect(new TemporalSpread(xml).noteOffShift).toBe(NoteOffShift.False);
    });

    it('should clamp a negative frameLength coming from XML', () => {
      const xml = new Element('temporalSpread', Mpm.MPM_NAMESPACE);
      xml.addAttribute(new Attribute('frameLength', '-10.0'));

      expect(new TemporalSpread(xml).getFrameLength()).toBe(0.0);
    });
  });

  describe('apply', () => {
    it('should spread the chords evenly across the frame at intensity 1', () => {
      // "arpeggio" of the Java reference fixture: frame.start -22, frameLength 44
      // over three notes gives the offsets -22, 0, +22
      const ts = new TemporalSpread();
      ts.frameStart = -22.0;
      ts.setFrameLength(44.0);

      const n1 = makeNote('n1'),
        n2 = makeNote('n2'),
        n3 = makeNote('n3');
      ts.apply([[n1], [n2], [n3]]);

      expect(num(n1, 'ornament.date.offset')).toBeCloseTo(-22.0);
      expect(num(n2, 'ornament.date.offset')).toBeCloseTo(0.0);
      expect(num(n3, 'ornament.date.offset')).toBeCloseTo(22.0);
    });

    it('should bend the spread according to the intensity exponent', () => {
      // "spreadMs" of the Java reference fixture: frame.start -30, frameLength 60,
      // intensity 2 over three notes gives -30, -15, +30
      //   i=0 -> 0^2 * 60 - 30 = -30
      //   i=1 -> 0.5^2 * 60 - 30 = -15
      //   last is always frameStart + frameLength = 30
      const ts = new TemporalSpread();
      ts.frameStart = -30.0;
      ts.setFrameLength(60.0);
      ts.intensity = 2.0;
      ts.frameDomain = FrameDomain.Milliseconds;

      const n7 = makeNote('n7'),
        n8 = makeNote('n8'),
        n9 = makeNote('n9');
      ts.apply([[n7], [n8], [n9]]);

      expect(num(n7, 'ornament.milliseconds.date.offset')).toBeCloseTo(-30.0);
      expect(num(n8, 'ornament.milliseconds.date.offset')).toBeCloseTo(-15.0);
      expect(num(n9, 'ornament.milliseconds.date.offset')).toBeCloseTo(30.0);
    });

    it('should use the ticks attribute names in the ticks domain', () => {
      const ts = new TemporalSpread();
      ts.setFrameLength(40.0);

      const n = makeNote('n1');
      ts.apply([[n]]);

      expect(n.getAttribute('ornament.date.offset')).not.toBeNull();
      expect(n.getAttribute('ornament.milliseconds.date.offset')).toBeNull();
    });

    it('should place a single chord at the end of the frame', () => {
      const ts = new TemporalSpread();
      ts.frameStart = 10.0;
      ts.setFrameLength(40.0);

      const n = makeNote('n1');
      ts.apply([[n]]);

      expect(num(n, 'ornament.date.offset')).toBeCloseTo(50.0);
    });

    it('should do nothing for an empty chord sequence', () => {
      const ts = new TemporalSpread();
      ts.setFrameLength(44.0);
      expect(() => ts.apply([])).not.toThrow();
    });

    it('should give every note of a chord the same offset', () => {
      const ts = new TemporalSpread();
      ts.frameStart = -20.0;
      ts.setFrameLength(40.0);

      const a = makeNote('a'),
        b = makeNote('b'),
        c = makeNote('c');
      ts.apply([[a], [b, c]]);

      expect(num(b, 'ornament.date.offset')).toBeCloseTo(20.0);
      expect(num(c, 'ornament.date.offset')).toBeCloseTo(20.0);
    });

    it('should add to an already present offset attribute', () => {
      const ts = new TemporalSpread();
      ts.frameStart = 5.0;
      ts.setFrameLength(0.0);

      const n = makeNote('n1', { 'ornament.date.offset': '10' });
      ts.apply([[n]]);

      expect(num(n, 'ornament.date.offset')).toBeCloseTo(15.0);
    });

    it('should not touch note offs when noteOffShift is False', () => {
      const ts = new TemporalSpread();
      ts.frameStart = -22.0;
      ts.setFrameLength(44.0);
      ts.noteOffShift = NoteOffShift.False;

      const n1 = makeNote('n1'),
        n2 = makeNote('n2');
      ts.apply([[n1], [n2]]);

      for (const n of [n1, n2]) {
        expect(n.getAttribute('ornament.noteoff.shift')).toBeNull();
        expect(n.getAttribute('ornament.duration')).toBeNull();
      }
    });

    it('should mark every note when noteOffShift is True', () => {
      // matches orn3 of the Java reference fixture
      const ts = new TemporalSpread();
      ts.frameStart = -30.0;
      ts.setFrameLength(60.0);
      ts.noteOffShift = NoteOffShift.True;

      const n1 = makeNote('n1'),
        n2 = makeNote('n2'),
        n3 = makeNote('n3');
      ts.apply([[n1], [n2], [n3]]);

      for (const n of [n1, n2, n3]) {
        expect(n.getAttributeValue('ornament.noteoff.shift')).toBe('true');
        expect(n.getAttribute('ornament.duration')).toBeNull();
      }
    });

    it('should cut each note at the next one when noteOffShift is Monophonic', () => {
      // offsets are 0, 30, 60 -> each note but the last gets an absolute
      // duration reaching exactly up to its successor
      const ts = new TemporalSpread();
      ts.frameStart = 0.0;
      ts.setFrameLength(60.0);
      ts.noteOffShift = NoteOffShift.Monophonic;

      const n1 = makeNote('n1'),
        n2 = makeNote('n2'),
        n3 = makeNote('n3');
      ts.apply([[n1], [n2], [n3]]);

      expect(num(n1, 'ornament.date.offset')).toBeCloseTo(0.0);
      expect(num(n2, 'ornament.date.offset')).toBeCloseTo(30.0);
      expect(num(n3, 'ornament.date.offset')).toBeCloseTo(60.0);

      expect(num(n1, 'ornament.duration')).toBeCloseTo(30.0);
      expect(num(n2, 'ornament.duration')).toBeCloseTo(30.0);
      expect(n3.getAttribute('ornament.duration')).toBeNull(); // the last note keeps its own duration
    });

    it('should use the milliseconds duration name for a monophonic ms spread', () => {
      const ts = new TemporalSpread();
      ts.frameStart = 0.0;
      ts.setFrameLength(100.0);
      ts.frameDomain = FrameDomain.Milliseconds;
      ts.noteOffShift = NoteOffShift.Monophonic;

      const n1 = makeNote('n1'),
        n2 = makeNote('n2');
      ts.apply([[n1], [n2]]);

      expect(num(n1, 'ornament.milliseconds.duration')).toBeCloseTo(100.0);
      expect(n1.getAttribute('ornament.duration')).toBeNull();
    });

    it('should not set a duration on a monophonic single-chord sequence', () => {
      const ts = new TemporalSpread();
      ts.setFrameLength(50.0);
      ts.noteOffShift = NoteOffShift.Monophonic;

      const n = makeNote('n1');
      ts.apply([[n]]);

      expect(num(n, 'ornament.date.offset')).toBeCloseTo(50.0);
      expect(n.getAttribute('ornament.duration')).toBeNull();
    });
  });

  describe('generateXML', () => {
    it('should omit all attributes that carry their default value', () => {
      const xml = new TemporalSpread().generateXML();

      expect(xml.getLocalName()).toBe('temporalSpread');
      expect(xml.getAttribute('frame.start')).toBeNull();
      expect(xml.getAttribute('frameLength')).toBeNull();
      expect(xml.getAttribute('time.unit')).toBeNull(); // ticks is the default
      expect(xml.getAttribute('intensity')).toBeNull(); // 1.0 is the default
      expect(xml.getAttribute('noteoff.shift')).toBeNull(); // false is the default
    });

    it('should write the non-default attributes', () => {
      const ts = new TemporalSpread();
      ts.frameStart = -30.0;
      ts.setFrameLength(60.0);
      ts.frameDomain = FrameDomain.Milliseconds;
      ts.intensity = 2.0;
      ts.noteOffShift = NoteOffShift.True;
      const xml = ts.generateXML();

      expect(xml.getAttributeValue('frame.start')).toBe('-30');
      expect(xml.getAttributeValue('frameLength')).toBe('60');
      expect(xml.getAttributeValue('time.unit')).toBe('milliseconds');
      expect(xml.getAttributeValue('intensity')).toBe('2');
      expect(xml.getAttributeValue('noteoff.shift')).toBe('true');
    });

    it('should write noteoff.shift="monophonic"', () => {
      const ts = new TemporalSpread();
      ts.noteOffShift = NoteOffShift.Monophonic;

      expect(ts.generateXML().getAttributeValue('noteoff.shift')).toBe('monophonic');
    });

    it('getXml should generate the XML lazily', () => {
      const ts = new TemporalSpread();
      ts.setFrameLength(44.0);

      expect(ts.toXml()).toBe('');
      expect(ts.getXml().getLocalName()).toBe('temporalSpread');
      expect(ts.toXml()).not.toBe('');
    });

    it('should survive an XML round trip', () => {
      const ts = new TemporalSpread();
      ts.frameStart = -22.0;
      ts.setFrameLength(44.0);
      ts.intensity = 0.5;
      ts.noteOffShift = NoteOffShift.Monophonic;

      const reparsed = new TemporalSpread(ts.generateXML());
      expect(reparsed.frameStart).toBe(-22.0);
      expect(reparsed.getFrameLength()).toBe(44.0);
      expect(reparsed.intensity).toBe(0.5);
      expect(reparsed.noteOffShift).toBe(NoteOffShift.Monophonic);
      expect(reparsed.frameDomain).toBe(FrameDomain.Ticks);
    });
  });

  describe('setId', () => {
    it('should store the id and put it into the XML', () => {
      const ts = new TemporalSpread();
      ts.setId('ts-7');

      expect(ts.getId()).toBe('ts-7');
      expect(ts.getXml().getAttribute('id', XML_NS)!.getValue()).toBe('ts-7');
    });

    it('should overwrite an id that is already present', () => {
      const xml = new Element('temporalSpread', Mpm.MPM_NAMESPACE);
      xml.addAttribute(new Attribute('xml:id', XML_NS, 'old'));

      const ts = new TemporalSpread(xml);
      ts.setId('new');

      expect(ts.getId()).toBe('new');
      expect(xml.getAttribute('id', XML_NS)!.getValue()).toBe('new');
    });

    it('should detach the id from the XML when set to null', () => {
      const xml = new Element('temporalSpread', Mpm.MPM_NAMESPACE);
      xml.addAttribute(new Attribute('xml:id', XML_NS, 'ts-1'));

      const ts = new TemporalSpread(xml);
      ts.setId(null);

      expect(ts.getId()).toBeNull();
      expect(xml.getAttribute('id', XML_NS)).toBeNull();
    });

    it('should tolerate setId(null) when there is no id at all', () => {
      const ts = new TemporalSpread();
      expect(() => ts.setId(null)).not.toThrow();
      expect(ts.getId()).toBeNull();
    });
  });
});

// ==========================================================================
//  OrnamentDef
// ==========================================================================
describe('OrnamentDef', () => {
  describe('createOrnamentDef', () => {
    it('should create a named def without transformers', () => {
      const def = OrnamentDef.createOrnamentDef('trill')!;

      expect(def).not.toBeNull();
      expect(def.getName()).toBe('trill');
      expect(def.getTemporalSpread()).toBeNull();
      expect(def.getDynamicsGradient()).toBeNull();
      expect(def.getXml()!.getLocalName()).toBe('ornamentDef');
    });

    it('should parse both transformers from XML', () => {
      const def = OrnamentDef.createOrnamentDef(
        ornamentDefXml(
          'arpeggio',
          { 'transition.from': '-1.0', 'transition.to': '1.0' },
          { 'frame.start': '-22.0', frameLength: '44.0' },
        ),
      )!;

      expect(def.getName()).toBe('arpeggio');
      expect(def.getDynamicsGradient()!.transitionFrom).toBe(-1.0);
      expect(def.getDynamicsGradient()!.transitionTo).toBe(1.0);
      expect(def.getTemporalSpread()!.frameStart).toBe(-22.0);
      expect(def.getTemporalSpread()!.getFrameLength()).toBe(44.0);
    });

    it('should parse a def that only has a dynamicsGradient', () => {
      const def = OrnamentDef.createOrnamentDef(
        ornamentDefXml('swell', { 'transition.from': '-3.0', 'transition.to': '3.0' }),
      )!;

      expect(def.getDynamicsGradient()).not.toBeNull();
      expect(def.getTemporalSpread()).toBeNull();
    });

    it('should skip child elements that are no known transformer', () => {
      const xml = ornamentDefXml('weird', null, { frameLength: '10.0' });
      xml.appendChild(new Element('somethingElse', Mpm.MPM_NAMESPACE));

      const def = OrnamentDef.createOrnamentDef(xml)!;
      expect(def.getTemporalSpread()).not.toBeNull();
      expect(def.getDynamicsGradient()).toBeNull();
    });

    it('should return null when the name attribute is missing', () => {
      const xml = new Element('ornamentDef', Mpm.MPM_NAMESPACE);
      expect(OrnamentDef.createOrnamentDef(xml)).toBeNull();
    });
  });

  describe('setTemporalSpread', () => {
    it('should set the transformer and add it to the XML', () => {
      const def = OrnamentDef.createOrnamentDef('arp')!;
      def.setTemporalSpreadValues(-22.0, 44.0, FrameDomain.Ticks, 1.0, NoteOffShift.False);

      const ts = def.getTemporalSpread()!;
      expect(ts.frameStart).toBe(-22.0);
      expect(ts.getFrameLength()).toBe(44.0);
      expect(ts.frameDomain).toBe(FrameDomain.Ticks);
      expect(ts.intensity).toBe(1.0);
      expect(ts.noteOffShift).toBe(NoteOffShift.False);
      expect(def.getXml()!.getChildElements('temporalSpread').size()).toBe(1);
    });

    it('should clamp a negative frame length', () => {
      const def = OrnamentDef.createOrnamentDef('arp')!;
      def.setTemporalSpreadValues(0.0, -5.0, FrameDomain.Ticks, 1.0, NoteOffShift.False);

      expect(def.getTemporalSpread()!.getFrameLength()).toBe(0.0);
    });

    it('should keep only one temporalSpread element when set twice', () => {
      const def = OrnamentDef.createOrnamentDef('arp')!;
      def.setTemporalSpreadValues(-22.0, 44.0, FrameDomain.Ticks, 1.0, NoteOffShift.False);
      def.setTemporalSpreadValues(-30.0, 60.0, FrameDomain.Milliseconds, 2.0, NoteOffShift.True);

      expect(def.getXml()!.getChildElements('temporalSpread').size()).toBe(1);
      expect(def.getTemporalSpread()!.frameStart).toBe(-30.0);
      expect(def.getTemporalSpread()!.frameDomain).toBe(FrameDomain.Milliseconds);
    });

    it('should remove the transformer and its XML when set to null', () => {
      const def = OrnamentDef.createOrnamentDef('arp')!;
      def.setTemporalSpreadValues(-22.0, 44.0, FrameDomain.Ticks, 1.0, NoteOffShift.False);
      def.setTemporalSpread(null);

      expect(def.getTemporalSpread()).toBeNull();
      expect(def.getXml()!.getChildElements('temporalSpread').size()).toBe(0);
    });
  });

  describe('setDynamicsGradient', () => {
    it('should set the transformer and add it to the XML', () => {
      const def = OrnamentDef.createOrnamentDef('arp')!;
      def.setDynamicsGradientValues(-1.0, 1.0);

      expect(def.getDynamicsGradient()!.transitionFrom).toBe(-1.0);
      expect(def.getDynamicsGradient()!.transitionTo).toBe(1.0);
      expect(def.getXml()!.getChildElements('dynamicsGradient').size()).toBe(1);
    });

    it('should keep only one dynamicsGradient element when set twice', () => {
      const def = OrnamentDef.createOrnamentDef('arp')!;
      def.setDynamicsGradientValues(-1.0, 1.0);
      def.setDynamicsGradientValues(-0.5, 0.5);

      expect(def.getXml()!.getChildElements('dynamicsGradient').size()).toBe(1);
      expect(def.getDynamicsGradient()!.transitionFrom).toBe(-0.5);
    });

    it('should remove the transformer and its XML when set to null', () => {
      const def = OrnamentDef.createOrnamentDef('arp')!;
      def.setDynamicsGradientValues(-1.0, 1.0);
      def.setDynamicsGradient(null);

      expect(def.getDynamicsGradient()).toBeNull();
      expect(def.getXml()!.getChildElements('dynamicsGradient').size()).toBe(0);
    });

    it('should keep both transformers side by side', () => {
      const def = OrnamentDef.createOrnamentDef('arp')!;
      def.setDynamicsGradientValues(-1.0, 1.0);
      def.setTemporalSpreadValues(-22.0, 44.0, FrameDomain.Ticks, 1.0, NoteOffShift.False);

      expect(def.getXml()!.getChildElements('dynamicsGradient').size()).toBe(1);
      expect(def.getXml()!.getChildElements('temporalSpread').size()).toBe(1);
    });
  });

  describe('createDefaultOrnamentDef', () => {
    it('should build the arpeggio default', () => {
      // Java OrnamentDef.createDefaultOrnamentDef: dynamicsGradient(-1, 1) plus
      // temporalSpread(-22, 44, ticks, 1, false) - as in the reference fixture
      const def = OrnamentDef.createDefaultOrnamentDef('arpeggio')!;

      expect(def.getName()).toBe('arpeggio');
      expect(def.getDynamicsGradient()!.transitionFrom).toBe(-1.0);
      expect(def.getDynamicsGradient()!.transitionTo).toBe(1.0);

      const ts = def.getTemporalSpread()!;
      expect(ts.frameStart).toBe(-22.0);
      expect(ts.getFrameLength()).toBe(44.0);
      expect(ts.frameDomain).toBe(FrameDomain.Ticks);
      expect(ts.intensity).toBe(1.0);
      expect(ts.noteOffShift).toBe(NoteOffShift.False);
    });

    it('should accept the "arpeg" alias', () => {
      const def = OrnamentDef.createDefaultOrnamentDef('arpeg')!;
      expect(def.getTemporalSpread()!.getFrameLength()).toBe(44.0);
    });

    it('should match the name case-insensitively and trimmed', () => {
      const def = OrnamentDef.createDefaultOrnamentDef('  Arpeggio ')!;

      expect(def.getName()).toBe('  Arpeggio '); // the name is kept verbatim
      expect(def.getDynamicsGradient()).not.toBeNull();
      expect(def.getTemporalSpread()).not.toBeNull();
    });

    it('should leave an unknown ornament name without transformers', () => {
      const def = OrnamentDef.createDefaultOrnamentDef('trill')!;

      expect(def.getName()).toBe('trill');
      expect(def.getDynamicsGradient()).toBeNull();
      expect(def.getTemporalSpread()).toBeNull();
    });
  });

  it('should survive an XML round trip through createOrnamentDef', () => {
    const def = OrnamentDef.createDefaultOrnamentDef('arpeggio')!;
    const reparsed = OrnamentDef.createOrnamentDef(def.getXml()!)!;

    expect(reparsed.getName()).toBe('arpeggio');
    expect(reparsed.getDynamicsGradient()!.transitionFrom).toBe(-1.0);
    expect(reparsed.getDynamicsGradient()!.transitionTo).toBe(1.0);
    expect(reparsed.getTemporalSpread()!.frameStart).toBe(-22.0);
    expect(reparsed.getTemporalSpread()!.getFrameLength()).toBe(44.0);
  });
});

// ==========================================================================
//  setId(null) on transformers that came out of the parser
//
//  Both classes remove their id by detaching the attribute. Until the attribute
//  carried its parent, that detach did nothing for anything parsed from a file and
//  the stale xml:id stayed in the serialized MPM.
// ==========================================================================
describe('setId(null) on parsed transformers', () => {
  const parse = (xml: string): Element => new Builder().build(xml).getRootElement();

  it('should drop a parsed DynamicsGradient id from the serialized XML', () => {
    const xml = parse(
      `<dynamicsGradient xmlns="${Mpm.MPM_NAMESPACE}" xml:id="dg-1" transition.from="-1.0" transition.to="1.0"/>`,
    );
    const dg = new DynamicsGradient(xml);
    expect(dg.getId()).toBe('dg-1');

    dg.setId(null);

    expect(dg.getId()).toBeNull();
    expect(xml.getAttribute('id', XML_NS)).toBeNull();
    expect(dg.toXml()).not.toContain('xml:id');
    expect(dg.toXml()).toContain('transition.from="-1.0"');
  });

  it('should drop a parsed TemporalSpread id from the serialized XML', () => {
    const xml = parse(
      `<temporalSpread xmlns="${Mpm.MPM_NAMESPACE}" xml:id="ts-1" frame.start="-22.0" frameLength="44.0"/>`,
    );
    const ts = new TemporalSpread(xml);
    expect(ts.getId()).toBe('ts-1');

    ts.setId(null);

    expect(ts.getId()).toBeNull();
    expect(xml.getAttribute('id', XML_NS)).toBeNull();
    expect(ts.toXml()).not.toContain('xml:id');
    expect(ts.toXml()).toContain('frame.start="-22.0"');
  });

  it('should drop the ids of both transformers of a parsed ornamentDef', () => {
    const xml = parse(
      `<ornamentDef xmlns="${Mpm.MPM_NAMESPACE}" name="arpeggio" xml:id="od-1">` +
        `<dynamicsGradient xml:id="dg-1" transition.from="-1.0" transition.to="1.0"/>` +
        `<temporalSpread xml:id="ts-1" frame.start="-22.0" frameLength="44.0"/>` +
        `</ornamentDef>`,
    );
    const def = OrnamentDef.createOrnamentDef(xml)!;

    def.getDynamicsGradient()!.setId(null);
    def.getTemporalSpread()!.setId(null);

    const serialized = def.getXml()!.toXML();
    expect(serialized).not.toContain('dg-1');
    expect(serialized).not.toContain('ts-1');
    // the def's own id is untouched, and so is every other attribute
    expect(serialized).toContain('xml:id="od-1"');
    expect(serialized).toContain('transition.from="-1.0"');
    expect(serialized).toContain('frameLength="44.0"');
  });

  it('should re-add an id after it was dropped from a parsed element', () => {
    const xml = parse(
      `<dynamicsGradient xmlns="${Mpm.MPM_NAMESPACE}" xml:id="dg-1" transition.from="-1.0"/>`,
    );
    const dg = new DynamicsGradient(xml);
    dg.setId(null);
    dg.setId('dg-2');

    expect(dg.getId()).toBe('dg-2');
    expect(xml.getAttribute('id', XML_NS)!.getValue()).toBe('dg-2');
    expect(dg.toXml()).toContain('xml:id="dg-2"');
    expect(dg.toXml()).not.toContain('dg-1');
  });
});
