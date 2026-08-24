import { describe, it, expect, vi } from 'vitest';
import { errOf, okValue } from '../../../../support/result.js';
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

describe('OrnamentDef', () => {
  describe('createOrnamentDef', () => {
    it('should create a named def without transformers', () => {
      const def = okValue(OrnamentDef.createOrnamentDef('trill'));

      expect(def).not.toBeNull();
      expect(def.getName()).toBe('trill');
      expect(def.getTemporalSpread()).toBeNull();
      expect(def.getDynamicsGradient()).toBeNull();
      expect(def.getXml()!.getLocalName()).toBe('ornamentDef');
    });

    it('should parse both transformers from XML', () => {
      const def = okValue(
        OrnamentDef.createOrnamentDef(
          ornamentDefXml(
            'arpeggio',
            { 'transition.from': '-1.0', 'transition.to': '1.0' },
            { 'frame.start': '-22.0', frameLength: '44.0' },
          ),
        ),
      );

      expect(def.getName()).toBe('arpeggio');
      expect(def.getDynamicsGradient()!.transitionFrom).toBe(-1.0);
      expect(def.getDynamicsGradient()!.transitionTo).toBe(1.0);
      expect(def.getTemporalSpread()!.frameStart).toBe(-22.0);
      expect(def.getTemporalSpread()!.getFrameLength()).toBe(44.0);
    });

    it('should parse a def that only has a dynamicsGradient', () => {
      const def = okValue(
        OrnamentDef.createOrnamentDef(
          ornamentDefXml('swell', { 'transition.from': '-3.0', 'transition.to': '3.0' }),
        ),
      );

      expect(def.getDynamicsGradient()).not.toBeNull();
      expect(def.getTemporalSpread()).toBeNull();
    });

    it('should skip child elements that are no known transformer', () => {
      const xml = ornamentDefXml('weird', null, { frameLength: '10.0' });
      xml.appendChild(new Element('somethingElse', Mpm.MPM_NAMESPACE));

      const def = okValue(OrnamentDef.createOrnamentDef(xml));
      expect(def.getTemporalSpread()).not.toBeNull();
      expect(def.getDynamicsGradient()).toBeNull();
    });

    it('reports a missing name attribute rather than printing it', () => {
      const xml = new Element('ornamentDef', Mpm.MPM_NAMESPACE);
      expect(errOf(OrnamentDef.createOrnamentDef(xml))).toMatchObject({
        kind: 'malformedDef',
        what: 'OrnamentDef',
      });
    });
  });

  describe('setTemporalSpread', () => {
    it('should set the transformer and add it to the XML', () => {
      const def = okValue(OrnamentDef.createOrnamentDef('arp'));
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
      const def = okValue(OrnamentDef.createOrnamentDef('arp'));
      def.setTemporalSpreadValues(0.0, -5.0, FrameDomain.Ticks, 1.0, NoteOffShift.False);

      expect(def.getTemporalSpread()!.getFrameLength()).toBe(0.0);
    });

    it('should keep only one temporalSpread element when set twice', () => {
      const def = okValue(OrnamentDef.createOrnamentDef('arp'));
      def.setTemporalSpreadValues(-22.0, 44.0, FrameDomain.Ticks, 1.0, NoteOffShift.False);
      def.setTemporalSpreadValues(-30.0, 60.0, FrameDomain.Milliseconds, 2.0, NoteOffShift.True);

      expect(def.getXml()!.getChildElements('temporalSpread').size()).toBe(1);
      expect(def.getTemporalSpread()!.frameStart).toBe(-30.0);
      expect(def.getTemporalSpread()!.frameDomain).toBe(FrameDomain.Milliseconds);
    });

    it('should remove the transformer and its XML when set to null', () => {
      const def = okValue(OrnamentDef.createOrnamentDef('arp'));
      def.setTemporalSpreadValues(-22.0, 44.0, FrameDomain.Ticks, 1.0, NoteOffShift.False);
      def.setTemporalSpread(null);

      expect(def.getTemporalSpread()).toBeNull();
      expect(def.getXml()!.getChildElements('temporalSpread').size()).toBe(0);
    });
  });

  describe('setDynamicsGradient', () => {
    it('should set the transformer and add it to the XML', () => {
      const def = okValue(OrnamentDef.createOrnamentDef('arp'));
      def.setDynamicsGradientValues(-1.0, 1.0);

      expect(def.getDynamicsGradient()!.transitionFrom).toBe(-1.0);
      expect(def.getDynamicsGradient()!.transitionTo).toBe(1.0);
      expect(def.getXml()!.getChildElements('dynamicsGradient').size()).toBe(1);
    });

    it('should keep only one dynamicsGradient element when set twice', () => {
      const def = okValue(OrnamentDef.createOrnamentDef('arp'));
      def.setDynamicsGradientValues(-1.0, 1.0);
      def.setDynamicsGradientValues(-0.5, 0.5);

      expect(def.getXml()!.getChildElements('dynamicsGradient').size()).toBe(1);
      expect(def.getDynamicsGradient()!.transitionFrom).toBe(-0.5);
    });

    it('should remove the transformer and its XML when set to null', () => {
      const def = okValue(OrnamentDef.createOrnamentDef('arp'));
      def.setDynamicsGradientValues(-1.0, 1.0);
      def.setDynamicsGradient(null);

      expect(def.getDynamicsGradient()).toBeNull();
      expect(def.getXml()!.getChildElements('dynamicsGradient').size()).toBe(0);
    });

    it('should keep both transformers side by side', () => {
      const def = okValue(OrnamentDef.createOrnamentDef('arp'));
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
      const def = okValue(OrnamentDef.createDefaultOrnamentDef('arpeggio'));

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
      const def = okValue(OrnamentDef.createDefaultOrnamentDef('arpeg'));
      expect(def.getTemporalSpread()!.getFrameLength()).toBe(44.0);
    });

    it('should match the name case-insensitively and trimmed', () => {
      const def = okValue(OrnamentDef.createDefaultOrnamentDef('  Arpeggio '));

      expect(def.getName()).toBe('  Arpeggio '); // the name is kept verbatim
      expect(def.getDynamicsGradient()).not.toBeNull();
      expect(def.getTemporalSpread()).not.toBeNull();
    });

    it('should leave an unknown ornament name without transformers', () => {
      const def = okValue(OrnamentDef.createDefaultOrnamentDef('trill'));

      expect(def.getName()).toBe('trill');
      expect(def.getDynamicsGradient()).toBeNull();
      expect(def.getTemporalSpread()).toBeNull();
    });
  });

  it('should survive an XML round trip through createOrnamentDef', () => {
    const def = okValue(OrnamentDef.createDefaultOrnamentDef('arpeggio'));
    const reparsed = okValue(OrnamentDef.createOrnamentDef(def.getXml()!));

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
//  Both classes remove their id by detaching the attribute, which only reaches the
//  document if the attribute knows its parent; otherwise the stale xml:id stays in
//  the serialized MPM.
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
    const def = okValue(OrnamentDef.createOrnamentDef(xml));

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

// ==========================================================================
//  MPM v3 — TemporalSpread () and OrnamentDef.alignment
//
//  Everything below is additive to the v2 suites above: a v2 document must parse
//  and serialize exactly as it does without v3, which the first suite here nails
//  down byte for byte.
// ==========================================================================

const MPM_NS = 'http://www.cemfi.de/mpm/ns/1.0';

/** parse an XML string into an element, the way a real document reaches the parser */
function parseElement(xml: string): Element {
  return new Builder().build(xml).getRootElement();
}

/** parse a `<temporalSpread>` given as source text */
function spread(attributes: string): TemporalSpread {
  return new TemporalSpread(parseElement(`<temporalSpread xmlns="${MPM_NS}" ${attributes}/>`));
}

/**
 * Silence and capture console.error for one call. `OrnamentDef.parseData` and
 * `TemporalSpread` warn about out-of-range and unparseable v3 values and then repair them,
 * which is a different species from the factory's "this def is unreadable, skip it" and is
 * still reported through `console.error`.
 */
function captureErrors(run: () => void): string[] {
  const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  try {
    run();
    return spy.mock.calls.map((args) => String(args[0]));
  } finally {
    spy.mockRestore();
  }
}

describe('TemporalSpread — v2 byte stability ()', () => {
  // A temporalSpread showing no v3 marker parses and re-serializes exactly as it does
  // without v3. Asserted as whole strings rather than attribute by attribute, so that
  // attribute order — byte-visible in the Java fixture comparison — is pinned too.
  const CASES: readonly (readonly [string, string])[] = [
    // a bare spread stays bare: every value is at its v2 default
    ['', `<temporalSpread xmlns="${MPM_NS}" />`],
    // the "arpeggio" def of the Java reference fixture; note "-22.0" -> "-22", the
    // port-wide String(x) vs Java Double.toString divergence, unchanged here
    [
      'frame.start="-22.0" frameLength="44.0"',
      `<temporalSpread xmlns="${MPM_NS}" frame.start="-22" frameLength="44" />`,
    ],
    // frame.start="0.0" is dropped on write (only non-default values are written)
    [
      'frame.start="0.0" frameLength="300.0" time.unit="milliseconds"',
      `<temporalSpread xmlns="${MPM_NS}" frameLength="300" time.unit="milliseconds" />`,
    ],
    // the "spreadMs" def of the Java reference fixture, with every attribute set
    [
      'frame.start="-30.0" frameLength="60.0" time.unit="milliseconds" intensity="2.0" noteoff.shift="true" xml:id="ts-1"',
      `<temporalSpread xmlns="${MPM_NS}" frame.start="-30" frameLength="60" time.unit="milliseconds" intensity="2" noteoff.shift="true" xml:id="ts-1" />`,
    ],
    // a negative frameLength is clamped to 0 on read and 0 is not written
    [
      'frameLength="-10.0" noteoff.shift="monophonic"',
      `<temporalSpread xmlns="${MPM_NS}" noteoff.shift="monophonic" />`,
    ],
    // every explicitly spelled default disappears on the round trip
    [
      'frame.start="5" frameLength="0.0" time.unit="ticks" intensity="1.0" noteoff.shift="false"',
      `<temporalSpread xmlns="${MPM_NS}" frame.start="5" />`,
    ],
    [
      'frame.start="-22.0" frameLength="44.0" intensity="0.5" noteoff.shift="monophonic" xml:id="x"',
      `<temporalSpread xmlns="${MPM_NS}" frame.start="-22" frameLength="44" intensity="0.5" noteoff.shift="monophonic" xml:id="x" />`,
    ],
  ];

  for (const [attributes, expected] of CASES) {
    it(`should re-serialize <temporalSpread ${attributes}/> byte-identically`, () => {
      expect(spread(attributes).generateXML().toXML()).toBe(expected);
    });
  }

  it('should report every v2 spread as v2-sourced', () => {
    for (const [attributes] of CASES) expect(spread(attributes).getSourceFormat()).toBe('v2');
  });

  it('should leave the v3 accessors null on a v2 spread', () => {
    // the documented invariant: the two readings never both hold state
    const ts = spread('frame.start="-22.0" frameLength="44.0"');
    expect(ts.getFrameOffset()).toBeNull();
    expect(ts.getFrameLengthValue()).toBeNull();
  });

  it('should not treat an alignment attribute as a v3 marker', () => {
    // alignment is v3-only but is not a frame value and is never serialized here, so a
    // spread carrying nothing else stays v2 and keeps its v2 bytes (D2)
    const ts = spread('frame.start="-22.0" frameLength="44.0" alignment="at end"');
    expect(ts.getSourceFormat()).toBe('v2');
    expect(ts.generateXML().toXML()).toBe(
      `<temporalSpread xmlns="${MPM_NS}" frame.start="-22" frameLength="44" />`,
    );
  });
});

describe('TemporalSpread — v3 parsing (PARITY.md §6.2 D3)', () => {
  it('should read per-value unit suffixes', () => {
    // the spec's own temporalSpread exemplum (temporalSpread.xml:45-48): the two frame
    // values are in different domains, which is what v3 added
    const ts = spread('frame.offset="-100.0ms" frameLength="200.0ticks" intensity="1.4"');

    expect(ts.getSourceFormat()).toBe('v3');
    expect(ts.getFrameOffset()).toEqual({ value: -100.0, domain: 'milliseconds' });
    expect(ts.getFrameLengthValue()).toEqual({ value: 200.0, domain: 'ticks' });
    expect(ts.intensity).toBe(1.4);
  });

  it('should read a relative frameLength', () => {
    // ornamentDef.xml:57-59, the "upper turn": frame.offset="0" frameLength="100.0%"
    const ts = spread('frame.offset="0" frameLength="100.0%"');
    expect(ts.getFrameOffset()).toEqual({ value: 0, domain: 'ticks' });
    expect(ts.getFrameLengthValue()).toEqual({ value: 100.0, domain: 'relative' });
  });

  it('should default a suffix-less value to ticks', () => {
    // the real corpus writes frame.offset without a suffix;
    // frame.offset is a v3 marker in its own right, so this is a v3 element
    const ts = spread('frame.offset="0.0" frameLength="300.0"');
    expect(ts.getSourceFormat()).toBe('v3');
    expect(ts.getFrameOffset()).toEqual({ value: 0, domain: 'ticks' });
    expect(ts.getFrameLengthValue()).toEqual({ value: 300, domain: 'ticks' });
  });

  it('should honour a legacy time.unit for suffix-less values', () => {
    // "Reger - Moment Musical op 13 no 4.mpm" writes exactly this, and it is what the
    // attribute descriptions still point at although v3 deleted the attribute
    const ts = spread('frame.offset="0.0" frameLength="300.0" time.unit="milliseconds"');
    expect(ts.getFrameOffset()).toEqual({ value: 0, domain: 'milliseconds' });
    expect(ts.getFrameLengthValue()).toEqual({ value: 300, domain: 'milliseconds' });
  });

  it('should honour time.unit="relative"', () => {
    // wider than the v2 reader, which has no relative domain at all — reachable only
    // from the v3 path, so it cannot move a v2 byte
    const ts = spread('frame.offset="50.0" time.unit="relative"');
    expect(ts.getFrameOffset()).toEqual({ value: 50, domain: 'relative' });
  });

  it('should fall back to ticks for an unknown time.unit', () => {
    const ts = spread('frame.offset="7.0" time.unit="furlongs"');
    expect(ts.getFrameOffset()).toEqual({ value: 7, domain: 'ticks' });
  });

  it('should let a per-value suffix win over time.unit', () => {
    const ts = spread('frame.offset="12ms" frameLength="80%" time.unit="ticks"');
    expect(ts.getFrameOffset()).toEqual({ value: 12, domain: 'milliseconds' });
    expect(ts.getFrameLengthValue()).toEqual({ value: 80, domain: 'relative' });
  });

  it('should default frameLength to 100% on a bare v3 spread', () => {
    // temporalSpread.xml:38 — the v3 default is "the whole principal note", where the
    // v2 default (0.0) is "no frame at all"
    const ts = spread('frame.offset="0ticks"');
    expect(ts.getFrameLengthValue()).toEqual({ value: 100, domain: 'relative' });
  });

  it('should default frame.offset to 0.0ticks when only frameLength is v3', () => {
    // att.time.frame.xml:16
    const ts = spread('frameLength="50%"');
    expect(ts.getSourceFormat()).toBe('v3');
    expect(ts.getFrameOffset()).toEqual({ value: 0, domain: 'ticks' });
  });

  it('should read frame.start as an alias of frame.offset once anything marks the element v3', () => {
    // PARITY.md §6.2 D3: any v3 marker makes the whole instance v3.
    // "frame.start" is v2's spelling, but a suffixed frameLength is a v3 marker, so the
    // element is v3 and its frame.start value is read through D3's alias.
    const ts = spread('frame.start="-22.0" frameLength="44%"');
    expect(ts.getSourceFormat()).toBe('v3');
    expect(ts.getFrameOffset()).toEqual({ value: -22, domain: 'ticks' });
    expect(ts.getFrameLengthValue()).toEqual({ value: 44, domain: 'relative' });
    // and the v2 numeric fields stay at their initialisers — they are not authoritative
    expect(ts.frameStart).toBe(0.0);
    expect(ts.getFrameLength()).toBe(0.0);
    expect(ts.frameDomain).toBe(FrameDomain.Ticks);
  });

  it('should prefer frame.offset over frame.start when both are present', () => {
    const ts = spread('frame.offset="10ticks" frame.start="-99.0"');
    expect(ts.getFrameOffset()).toEqual({ value: 10, domain: 'ticks' });
  });

  it('should clamp a negative v3 frameLength while keeping its domain', () => {
    const messages = captureErrors(() => {
      const ts = spread('frame.offset="0ticks" frameLength="-50%"');
      expect(ts.getFrameLengthValue()).toEqual({ value: 0, domain: 'relative' });
    });
    expect(messages.join('\n')).toContain('negative frameLength');
  });

  it('should treat an unparseable v3 value as absent rather than destroying the def', () => {
    // PARITY.md §6.2 D3, diverging from the reference implementation, whose
    // NumberFormatException on "80%" drops the whole ornamentDef and with it every
    // ornament referring to it
    let ts: TemporalSpread | null = null;
    const messages = captureErrors(() => {
      ts = spread('frame.offset="abcticks" frameLength="60%" intensity="2.0"');
    });
    expect(ts!.getFrameOffset()).toEqual({ value: 0, domain: 'ticks' }); // the default
    expect(ts!.getFrameLengthValue()).toEqual({ value: 60, domain: 'relative' }); // unharmed
    expect(ts!.intensity).toBe(2.0); // and the rest of the element survives
    expect(messages.join('\n')).toContain('no MPM v3 temporal value');
  });

  it('should treat a malformed value marked v3 by its SUFFIX ALONE as absent', () => {
    // The suffix half of detectSourceFormat: the only v3 marker in this element is the
    // trailing "%", which is why the probe is a format test and not a validity test.
    // Without it "abc%" would slide back onto the v2 path, where parseFloat("abc%") is NaN,
    // setFrameLength's Math.max(0, NaN) is NaN, and generateXML would write a silent
    // frameLength="NaN" with no diagnostic at all.
    let ts: TemporalSpread | null = null;
    const messages = captureErrors(() => {
      ts = spread('frameLength="abc%"');
    });
    expect(ts!.getSourceFormat()).toBe('v3');
    expect(ts!.getFrameLengthValue()).toEqual({ value: 100, domain: 'relative' }); // the default
    expect(ts!.getFrameOffset()).toEqual({ value: 0, domain: 'ticks' });
    expect(messages.join('\n')).toContain('no MPM v3 temporal value');
    // and no NaN leaked into the v2 reading or into the output
    expect(ts!.getFrameLength()).toBe(0.0);
    expect(ts!.generateXML().toXML()).toBe(
      `<temporalSpread xmlns="${MPM_NS}" frame.offset="0ticks" frameLength="100%" />`,
    );
  });

  it('should treat a malformed frame.start marked v3 by its suffix as absent', () => {
    // the twin on the offset side: "xx ticks" carries the suffix, so the element is v3 and
    // the value is reported and dropped, rather than becoming frame.start="NaN"
    let ts: TemporalSpread | null = null;
    const messages = captureErrors(() => {
      ts = spread('frame.start="xx ticks" frameLength="44.0"');
    });
    expect(ts!.getSourceFormat()).toBe('v3');
    expect(ts!.getFrameOffset()).toEqual({ value: 0, domain: 'ticks' }); // the default
    expect(ts!.getFrameLengthValue()).toEqual({ value: 44, domain: 'ticks' }); // suffix-less
    expect(messages.join('\n')).toContain('no MPM v3 temporal value');
    expect(ts!.frameStart).toBe(0.0);
    expect(ts!.generateXML().toXML()).toBe(
      `<temporalSpread xmlns="${MPM_NS}" frame.offset="0ticks" frameLength="44ticks" />`,
    );
  });

  it('should treat an out-of-range v3 value as absent', () => {
    // 309 legal digits are schema-valid and overflow to Infinity, which would serialize
    // as the unreadable "Infinityticks"; TemporalValue hands that decision here
    const messages = captureErrors(() => {
      const ts = spread(`frameLength="${'9'.repeat(309)}%"`);
      expect(ts.getFrameLengthValue()).toEqual({ value: 100, domain: 'relative' });
    });
    expect(messages.join('\n')).toContain('out of range');
  });

  it('should keep reading intensity, noteoff.shift and xml:id on the v3 path', () => {
    const ts = spread(
      'frame.offset="0ticks" intensity="0.25" noteoff.shift="monophonic" xml:id="v3-1"',
    );
    expect(ts.intensity).toBe(0.25);
    expect(ts.noteOffShift).toBe(NoteOffShift.Monophonic);
    expect(ts.getId()).toBe('v3-1');
  });

  it('should read an alignment attribute without owning it', () => {
    // D2: the reference implementation puts alignment on temporalSpread, the spec puts it
    // on ornamentDef. It is read here and surfaced; OrnamentDef decides.
    expect(spread('alignment="at end"').getParsedAlignment()).toBe('at end');
    expect(spread('alignment="at start"').getParsedAlignment()).toBe('at start');
    expect(spread('frame.offset="0ticks"').getParsedAlignment()).toBeNull();
  });

  it('should reject an alignment value outside the closed value list', () => {
    const messages = captureErrors(() => {
      expect(spread('alignment="at the end"').getParsedAlignment()).toBeNull();
    });
    expect(messages.join('\n')).toContain('no legal alignment');
  });
});

describe('TemporalSpread — v3 serialization (PARITY.md §6.2 D12)', () => {
  it('should write canonical v3 with unit suffixes and no time.unit', () => {
    const ts = spread('frame.offset="-100.0ms" frameLength="200.0ticks"');
    // formatTemporalValue writes String(x), so "-100.0ms" comes back as "-100ms" — the
    // same port-wide number-formatting divergence the v2 path shows
    expect(ts.generateXML().toXML()).toBe(
      `<temporalSpread xmlns="${MPM_NS}" frame.offset="-100ms" frameLength="200ticks" />`,
    );
  });

  it('should drop a legacy time.unit it consumed on read', () => {
    const ts = spread('frame.offset="0.0" frameLength="300.0" time.unit="milliseconds"');
    // v3 removed the attribute from every element; the domain now travels in the values
    expect(ts.generateXML().toXML()).toBe(
      `<temporalSpread xmlns="${MPM_NS}" frame.offset="0ms" frameLength="300ms" />`,
    );
  });

  it('should re-emit a frame.start alias as frame.offset', () => {
    // the mixed-spelling ruling, on the write side
    const ts = spread('frame.start="-22.0" frameLength="44%"');
    expect(ts.generateXML().toXML()).toBe(
      `<temporalSpread xmlns="${MPM_NS}" frame.offset="-22ticks" frameLength="44%" />`,
    );
  });

  it('should write both frame attributes even when they carry their defaults', () => {
    // unlike the v2 writer, which omits a 0.0. In v3 the value carries the domain, so an
    // omitted frameLength would read back as the 100% default instead of 0% — the exact
    // round-trip bug the reference implementation has
    const ts = spread('frame.offset="0ticks" frameLength="0%"');
    expect(ts.generateXML().toXML()).toBe(
      `<temporalSpread xmlns="${MPM_NS}" frame.offset="0ticks" frameLength="0%" />`,
    );
  });

  it('should keep intensity, noteoff.shift and xml:id in their v2 positions', () => {
    const ts = spread(
      'frame.offset="360ticks" frameLength="50%" intensity="1.4" noteoff.shift="true" xml:id="ts-9"',
    );
    expect(ts.generateXML().toXML()).toBe(
      `<temporalSpread xmlns="${MPM_NS}" frame.offset="360ticks" frameLength="50%" intensity="1.4" noteoff.shift="true" xml:id="ts-9" />`,
    );
  });

  it('should never write alignment', () => {
    // D2: alignment is serialized on ornamentDef only
    const ts = spread('frame.offset="0ticks" alignment="at end"');
    expect(ts.generateXML().getAttribute('alignment')).toBeNull();
  });

  it('should round-trip a canonical v3 element to a fixpoint', () => {
    const source = `<temporalSpread xmlns="${MPM_NS}" frame.offset="-30.5ms" frameLength="80%" intensity="2" noteoff.shift="monophonic" />`;
    const once = new TemporalSpread(parseElement(source)).generateXML().toXML();
    const twice = new TemporalSpread(parseElement(once)).generateXML().toXML();
    expect(twice).toBe(once);
    // ... and it is already canonical, so the first pass changed nothing either
    expect(once).toBe(source);
  });
});

describe('TemporalSpread — the v3 API (PARITY.md §6.2 D12)', () => {
  it('should turn a programmatic spread v3 by setting a frame offset', () => {
    const ts = new TemporalSpread();
    expect(ts.getSourceFormat()).toBe('v2');

    ts.setFrameOffset({ value: 360, domain: 'ticks' });
    expect(ts.getSourceFormat()).toBe('v3');
    // the companion value takes its spec default rather than staying null
    expect(ts.getFrameLengthValue()).toEqual({ value: 100, domain: 'relative' });
    expect(ts.generateXML().toXML()).toBe(
      `<temporalSpread xmlns="${MPM_NS}" frame.offset="360ticks" frameLength="100%" />`,
    );
  });

  it('should turn a programmatic spread v3 by setting a frame length', () => {
    const ts = new TemporalSpread();
    ts.setFrameLengthValue({ value: 50, domain: 'relative' });
    expect(ts.getFrameOffset()).toEqual({ value: 0, domain: 'ticks' });
    expect(ts.generateXML().toXML()).toBe(
      `<temporalSpread xmlns="${MPM_NS}" frame.offset="0ticks" frameLength="50%" />`,
    );
  });

  it('should clamp a negative length set through the v3 API', () => {
    const ts = new TemporalSpread();
    captureErrors(() => ts.setFrameLengthValue({ value: -20, domain: 'milliseconds' }));
    expect(ts.getFrameLengthValue()).toEqual({ value: 0, domain: 'milliseconds' });
  });

  it('should switch a v2-parsed spread over to v3 output when the v3 API is used', () => {
    const ts = spread('frame.start="-22.0" frameLength="44.0"');
    expect(ts.getSourceFormat()).toBe('v2');
    ts.setFrameOffset({ value: -22, domain: 'ticks' });
    expect(ts.getSourceFormat()).toBe('v3');
    expect(ts.generateXML().toXML()).toBe(
      `<temporalSpread xmlns="${MPM_NS}" frame.offset="-22ticks" frameLength="100%" />`,
    );
  });
});

describe('OrnamentDef — alignment ()', () => {
  /** parse an `<ornamentDef>` given as source text */
  function def(body: string): OrnamentDef {
    return okValue(
      OrnamentDef.createOrnamentDef(
        parseElement(`<ornamentDef xmlns="${MPM_NS}" name="turn" ${body}</ornamentDef>`),
      ),
    );
  }

  it('should default to "at start" and to the v2 source format', () => {
    const d = okValue(OrnamentDef.createOrnamentDef('trill'));
    expect(d.getAlignment()).toBe('at start');
    expect(d.getSourceFormat()).toBe('v2');
  });

  it('should read alignment from the ornamentDef element', () => {
    // ornamentDef.xml:57 — <ornamentDef name="upper turn" alignment="at end">
    const d = def('alignment="at end">');
    expect(d.getAlignment()).toBe('at end');
    expect(d.getSourceFormat()).toBe('v3');
  });

  it('should read alignment from a temporalSpread child (reference-implementation form)', () => {
    const d = def('><temporalSpread alignment="at end"/>');
    expect(d.getAlignment()).toBe('at end');
    expect(d.getSourceFormat()).toBe('v3');
  });

  it('should let the ornamentDef attribute win over the temporalSpread one', () => {
    const d = def('alignment="at start"><temporalSpread alignment="at end"/>');
    expect(d.getAlignment()).toBe('at start');
  });

  it('should fall back to the temporalSpread value when the def attribute is malformed', () => {
    // a malformed value is not a value: it is logged and treated as absent, which leaves
    // the well-formed one on the spread in force rather than silently forcing the default
    let d: OrnamentDef | null = null;
    const messages = captureErrors(() => {
      d = def('alignment="AT END"><temporalSpread alignment="at end"/>');
    });
    expect(d!.getAlignment()).toBe('at end');
    expect(messages.join('\n')).toContain('no legal alignment');
  });

  it('should fall back to the default when both attributes are malformed', () => {
    let d: OrnamentDef | null = null;
    captureErrors(() => {
      d = def('alignment="left"><temporalSpread alignment="right"/>');
    });
    expect(d!.getAlignment()).toBe('at start');
    // ... but the def still knows it was written as v3, because the attribute was there
    expect(d!.getSourceFormat()).toBe('v3');
  });

  it('should become v3-sourced when its temporalSpread is', () => {
    const d = def('><temporalSpread frame.offset="0ticks"/>');
    expect(d.getSourceFormat()).toBe('v3');
    expect(d.getAlignment()).toBe('at start');
  });

  it('should stay v2-sourced for a v2 def', () => {
    const d = def('><temporalSpread frame.start="-22.0" frameLength="44.0"/>');
    expect(d.getSourceFormat()).toBe('v2');
  });

  it('should write alignment onto the ornamentDef element and only for "at end"', () => {
    const d = okValue(OrnamentDef.createOrnamentDef('turn'));
    d.setAlignment('at end');

    expect(d.getSourceFormat()).toBe('v3');
    expect(d.getXml()!.getAttributeValue('alignment')).toBe('at end');

    d.setAlignment('at start'); // the schema default: written as absence
    expect(d.getAlignment()).toBe('at start');
    expect(d.getXml()!.getAttribute('alignment')).toBeNull();
  });

  it('should overwrite an alignment the document already carried', () => {
    const d = def('alignment="at end">');
    d.setAlignment('at end');
    expect(d.getXml()!.getAttributeValue('alignment')).toBe('at end');
    d.setAlignment('at start');
    expect(d.getXml()!.getAttribute('alignment')).toBeNull();
  });

  it('should never put alignment on the temporalSpread', () => {
    const d = okValue(OrnamentDef.createOrnamentDef('turn'));
    d.setTemporalSpreadValues(0.0, 44.0, FrameDomain.Ticks, 1.0, NoteOffShift.False);
    d.setAlignment('at end');

    expect(d.getTemporalSpread()!.generateXML().getAttribute('alignment')).toBeNull();
    expect(d.getXml()!.getAttributeValue('alignment')).toBe('at end');
  });

  it('should keep an adopted alignment when the temporalSpread is replaced', () => {
    // the spread element is regenerated by setTemporalSpread and a regenerated spread
    // never carries alignment, so a def that adopted its alignment from the old spread
    // would lose it unless it re-asserts what it owns
    const d = def('><temporalSpread alignment="at end"/>');
    expect(d.getAlignment()).toBe('at end');

    d.setTemporalSpreadValues(0.0, 44.0, FrameDomain.Ticks, 1.0, NoteOffShift.False);
    expect(d.getAlignment()).toBe('at end');
    expect(d.getXml()!.getAttributeValue('alignment')).toBe('at end');
    expect(d.getTemporalSpread()!.getXml().getAttribute('alignment')).toBeNull();
  });

  it('should not touch a v2 def when its temporalSpread is replaced', () => {
    const d = def('><temporalSpread frame.start="-22.0" frameLength="44.0"/>');
    d.setTemporalSpreadValues(-30.0, 60.0, FrameDomain.Milliseconds, 2.0, NoteOffShift.True);
    expect(d.getXml()!.getAttribute('alignment')).toBeNull();
    expect(d.getSourceFormat()).toBe('v2');
  });

  it('should leave a parsed alignment where the document wrote it', () => {
    // Parsing never mutates the caller's tree, so a reference-style document keeps its
    // attribute on the spread until setAlignment canonicalises it. The model value is right
    // either way.
    const source = `<ornamentDef xmlns="${MPM_NS}" name="turn"><temporalSpread alignment="at end"/></ornamentDef>`;
    const d = okValue(OrnamentDef.createOrnamentDef(parseElement(source)));
    expect(d.getAlignment()).toBe('at end');
    // untouched: the child keeps the attribute, and the def element has none of its own.
    // (The serializer restates the namespace on the child and writes ` />`.)
    expect(d.getXml()!.toXML()).toBe(
      `<ornamentDef xmlns="${MPM_NS}" name="turn"><temporalSpread alignment="at end" /></ornamentDef>`,
    );
    expect(d.getXml()!.getAttribute('alignment')).toBeNull();

    // calling the v3 API is what canonicalises it onto the ornamentDef
    d.setAlignment('at end');
    expect(d.getXml()!.getAttributeValue('alignment')).toBe('at end');
  });
});
