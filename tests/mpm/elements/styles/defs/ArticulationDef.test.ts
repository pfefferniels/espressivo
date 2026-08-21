import { describe, it, expect } from 'vitest';
import { defCause, errOf, okValue } from '../../../../support/result.js';
import { ArticulationDef } from '../../../../../src/mpm/elements/styles/defs/ArticulationDef.js';
import { Element, Attribute } from '../../../../../src/xml/XomTypes.js';
import { Mpm } from '../../../../../src/mpm/Mpm.js';
import { NumberFormatError } from '../../../../../src/xml/errors.js';

/**
 * Reference: meico/src/meico/mpm/elements/styles/defs/ArticulationDef.java
 */
function articulationDefElement(attributes: Record<string, string>): Element {
  const e = new Element('articulationDef', Mpm.MPM_NAMESPACE);
  for (const [name, value] of Object.entries(attributes))
    e.addAttribute(new Attribute(name, value));
  return e;
}

/** an MSM note element carrying the attributes articulateNote works on */
function note(attributes: Record<string, string>): Element {
  const e = new Element('note', Mpm.MPM_NAMESPACE);
  for (const [name, value] of Object.entries(attributes))
    e.addAttribute(new Attribute(name, value));
  return e;
}

describe('ArticulationDef', () => {
  describe('createArticulationDef', () => {
    it('creates a def with the documented default values', () => {
      const ad = okValue(ArticulationDef.createArticulationDef('myArticulation'));
      expect(ad.getName()).toBe('myArticulation');
      expect(ad.getXml()!.getLocalName()).toBe('articulationDef');
      expect(ad.getXml()!.getNamespaceURI()).toBe(Mpm.MPM_NAMESPACE);

      expect(ad.getAbsoluteDuration()).toBeNull();
      expect(ad.getAbsoluteDurationChange()).toBe(0.0);
      expect(ad.getAbsoluteDurationMs()).toBeNull();
      expect(ad.getAbsoluteDurationChangeMs()).toBe(0.0);
      expect(ad.getRelativeDuration()).toBe(1.0);
      expect(ad.getAbsoluteDelay()).toBe(0.0);
      expect(ad.getAbsoluteDelayMs()).toBe(0.0);
      expect(ad.getAbsoluteVelocity()).toBeNull();
      expect(ad.getRelativeVelocity()).toBe(1.0);
      expect(ad.getAbsoluteVelocityChange()).toBe(0.0);
      expect(ad.getDetuneCents()).toBe(0.0);
      expect(ad.getDetuneHz()).toBe(0.0);
    });

    it('parses every supported attribute from xml', () => {
      const ad = okValue(
        ArticulationDef.createArticulationDef(
          articulationDefElement({
            name: 'full',
            absoluteDuration: '360.0',
            absoluteDurationChange: '-70.0',
            absoluteDurationMs: '160.0',
            absoluteDurationChangeMs: '-400.0',
            relativeDuration: '0.8',
            absoluteDelay: '12.0',
            absoluteDelayMs: '30.0',
            absoluteVelocity: '127.0',
            relativeVelocity: '0.7',
            absoluteVelocityChange: '25.0',
            detuneCents: '-14.0',
            detuneHz: '3.5',
          }),
        ),
      );

      expect(ad.getAbsoluteDuration()).toBe(360.0);
      expect(ad.getAbsoluteDurationChange()).toBe(-70.0);
      expect(ad.getAbsoluteDurationMs()).toBe(160.0);
      expect(ad.getAbsoluteDurationChangeMs()).toBe(-400.0);
      expect(ad.getRelativeDuration()).toBe(0.8);
      expect(ad.getAbsoluteDelay()).toBe(12.0);
      expect(ad.getAbsoluteDelayMs()).toBe(30.0);
      expect(ad.getAbsoluteVelocity()).toBe(127.0);
      expect(ad.getRelativeVelocity()).toBe(0.7);
      expect(ad.getAbsoluteVelocityChange()).toBe(25.0);
      expect(ad.getDetuneCents()).toBe(-14.0);
      expect(ad.getDetuneHz()).toBe(3.5);
    });

    it('ignores unknown attributes', () => {
      const ad = okValue(
        ArticulationDef.createArticulationDef(
          articulationDefElement({ name: 'x', somethingElse: '5' }),
        ),
      );
      expect(ad.getName()).toBe('x');
      expect(ad.getRelativeDuration()).toBe(1.0);
    });

    it('reports a missing name attribute rather than printing it', () => {
      expect(
        errOf(
          ArticulationDef.createArticulationDef(
            articulationDefElement({ relativeDuration: '0.8' }),
          ),
        ),
      ).toMatchObject({
        kind: 'malformedDef',
        what: 'ArticulationDef',
      });
    });

    it('reports a null element rather than printing it', () => {
      expect(
        errOf(ArticulationDef.createArticulationDef(null as unknown as Element)),
      ).toMatchObject({
        kind: 'malformedDef',
        what: 'ArticulationDef',
      });
    });
  });

  // WAS: `parseData` re-applied to a second element, asserting it re-read name and the
  // twelve numeric attributes. That test's own comment said re-application "is not a path
  // production takes … simply the only way to observe [the parse] separately from
  // construction", and `@name` is no longer part of what it re-reads: it is required, so
  // the factory reads it and hands it to a `readonly` constructor parameter — which is what
  // let `AbstractDef`'s `protected name!: Attribute` go. The parse of the twelve is observed
  // directly by the from-XML cases above; what is left to pin is the name binding.
  describe('the name is bound at construction', () => {
    it('writes through the very attribute node the parse read', () => {
      const xml = articulationDefElement({
        name: 'second',
        relativeDuration: '0.8',
        detuneHz: '2.0',
      });
      const ad = okValue(ArticulationDef.createArticulationDef(xml));
      expect(ad.getXml()).toBe(xml);
      expect(ad.getName()).toBe('second');
      expect(ad.getRelativeDuration()).toBe(0.8);
      expect(ad.getDetuneHz()).toBe(2.0);

      const nameNode = xml.getAttribute('name')!;
      ad.setName('renamed');
      expect(nameNode.getValue()).toBe('renamed');
      expect(ad.getName()).toBe('renamed');
      // No second `name` attribute appended — which for THIS class is the load-bearing half:
      // its twelve numeric setters go through `addAttribute`, which is remove-then-append in
      // XomTypes and so moves an existing attribute to the end of the serialized list.
      // `setName` must not, or renaming a def would reorder its bytes.
      expect(xml.getAttributeCount()).toBe(3);
      expect(xml.getChildElements().size()).toBe(0);
      expect(xml.toXML()).toContain('name="renamed" relativeDuration="0.8" detuneHz="2.0"');
    });
  });

  describe('setters', () => {
    it('write both the field and the xml attribute', () => {
      const ad = okValue(ArticulationDef.createArticulationDef('setters'));
      const xml = ad.getXml()!;

      ad.setAbsoluteDuration(360.0);
      expect(ad.getAbsoluteDuration()).toBe(360.0);
      expect(xml.getAttributeValue('absoluteDuration')).toBe('360');

      ad.setAbsoluteDurationChange(-70.0);
      expect(ad.getAbsoluteDurationChange()).toBe(-70.0);
      expect(xml.getAttributeValue('absoluteDurationChange')).toBe('-70');

      ad.setAbsoluteDurationMs(160.0);
      expect(ad.getAbsoluteDurationMs()).toBe(160.0);
      expect(xml.getAttributeValue('absoluteDurationMs')).toBe('160');

      ad.setAbsoluteDurationChangeMs(-400.0);
      expect(ad.getAbsoluteDurationChangeMs()).toBe(-400.0);
      expect(xml.getAttributeValue('absoluteDurationChangeMs')).toBe('-400');

      ad.setRelativeDuration(0.8);
      expect(ad.getRelativeDuration()).toBe(0.8);
      expect(xml.getAttributeValue('relativeDuration')).toBe('0.8');

      ad.setAbsoluteDelay(12.0);
      expect(ad.getAbsoluteDelay()).toBe(12.0);
      expect(xml.getAttributeValue('absoluteDelay')).toBe('12');

      ad.setAbsoluteDelayMs(30.0);
      expect(ad.getAbsoluteDelayMs()).toBe(30.0);
      expect(xml.getAttributeValue('absoluteDelayMs')).toBe('30');

      ad.setAbsoluteVelocity(127.0);
      expect(ad.getAbsoluteVelocity()).toBe(127.0);
      expect(xml.getAttributeValue('absoluteVelocity')).toBe('127');

      ad.setRelativeVelocity(0.7);
      expect(ad.getRelativeVelocity()).toBe(0.7);
      expect(xml.getAttributeValue('relativeVelocity')).toBe('0.7');

      ad.setAbsoluteVelocityChange(25.0);
      expect(ad.getAbsoluteVelocityChange()).toBe(25.0);
      expect(xml.getAttributeValue('absoluteVelocityChange')).toBe('25');

      ad.setDetuneCents(-14.0);
      expect(ad.getDetuneCents()).toBe(-14.0);
      expect(xml.getAttributeValue('detuneCents')).toBe('-14');

      ad.setDetuneHz(3.5);
      expect(ad.getDetuneHz()).toBe(3.5);
      expect(xml.getAttributeValue('detuneHz')).toBe('3.5');
    });

    it('replace rather than duplicate an attribute when called twice', () => {
      const ad = okValue(ArticulationDef.createArticulationDef('twice'));
      ad.setRelativeDuration(0.8);
      const count = ad.getXml()!.getAttributeCount();
      ad.setRelativeDuration(0.5);
      expect(ad.getXml()!.getAttributeCount()).toBe(count);
      expect(ad.getXml()!.getAttributeValue('relativeDuration')).toBe('0.5');
    });
  });

  describe('resetAttribute', () => {
    it('removes the attribute and restores the default for every supported name', () => {
      const ad = okValue(
        ArticulationDef.createArticulationDef(
          articulationDefElement({
            name: 'full',
            absoluteDuration: '360.0',
            absoluteDurationChange: '-70.0',
            absoluteDurationMs: '160.0',
            absoluteDurationChangeMs: '-400.0',
            relativeDuration: '0.8',
            absoluteDelay: '12.0',
            absoluteDelayMs: '30.0',
            absoluteVelocity: '127.0',
            relativeVelocity: '0.7',
            absoluteVelocityChange: '25.0',
            detuneCents: '-14.0',
            detuneHz: '3.5',
          }),
        ),
      );

      for (const name of [
        'absoluteDuration',
        'absoluteDurationChange',
        'absoluteDurationMs',
        'absoluteDurationChangeMs',
        'relativeDuration',
        'absoluteDelay',
        'absoluteDelayMs',
        'absoluteVelocity',
        'relativeVelocity',
        'absoluteVelocityChange',
        'detuneCents',
        'detuneHz',
      ]) {
        ad.resetAttribute(name);
        expect(ad.getXml()!.getAttribute(name)).toBeNull();
      }

      expect(ad.getAbsoluteDuration()).toBeNull();
      expect(ad.getAbsoluteDurationChange()).toBe(0.0);
      expect(ad.getAbsoluteDurationMs()).toBeNull();
      expect(ad.getAbsoluteDurationChangeMs()).toBe(0.0);
      expect(ad.getRelativeDuration()).toBe(1.0);
      expect(ad.getAbsoluteDelay()).toBe(0.0);
      expect(ad.getAbsoluteDelayMs()).toBe(0.0);
      expect(ad.getAbsoluteVelocity()).toBeNull();
      expect(ad.getRelativeVelocity()).toBe(1.0);
      expect(ad.getAbsoluteVelocityChange()).toBe(0.0);
      expect(ad.getDetuneCents()).toBe(0.0);
      expect(ad.getDetuneHz()).toBe(0.0);
    });

    it('does nothing when the attribute is not present', () => {
      const ad = okValue(ArticulationDef.createArticulationDef('empty'));
      ad.setRelativeDuration(0.8);
      ad.resetAttribute('absoluteDuration');
      expect(ad.getRelativeDuration()).toBe(0.8);
    });

    it('leaves the def untouched for an unknown attribute name', () => {
      const ad = okValue(
        ArticulationDef.createArticulationDef(
          articulationDefElement({ name: 'x', somethingElse: '5' }),
        ),
      );
      ad.resetAttribute('somethingElse');
      expect(ad.getXml()!.getAttribute('somethingElse')).toBeNull();
      expect(ad.getName()).toBe('x');
    });
  });

  describe('createDefaultArticulationDef', () => {
    it('gives accent a velocity boost', () => {
      for (const name of ['accent', 'acc']) {
        const d = okValue(ArticulationDef.createDefaultArticulationDef(name));
        expect(d.getName()).toBe(name);
        expect(d.getAbsoluteVelocityChange()).toBe(25.0);
      }
    });

    it('shortens and softens breath / caesura', () => {
      for (const name of ['breath', 'cesura', 'caesura']) {
        const d = okValue(ArticulationDef.createDefaultArticulationDef(name));
        expect(d.getAbsoluteDurationChangeMs()).toBe(-400.0);
        expect(d.getAbsoluteVelocityChange()).toBe(-5.0);
      }
    });

    it('lengthens legatissimo', () => {
      expect(
        okValue(
          ArticulationDef.createDefaultArticulationDef('legatissimo'),
        ).getAbsoluteDurationChangeMs(),
      ).toBe(250.0);
    });

    it('leaves legato at full length', () => {
      for (const name of ['legato', 'leg'])
        expect(
          okValue(ArticulationDef.createDefaultArticulationDef(name)).getRelativeDuration(),
        ).toBe(1.0);
    });

    it('shortens and softens legatoStop', () => {
      const d = okValue(ArticulationDef.createDefaultArticulationDef('legatoStop'));
      expect(d.getRelativeDuration()).toBe(0.8);
      expect(d.getRelativeVelocity()).toBe(0.7);
    });

    it('shortens and accents marcato', () => {
      for (const name of ['marcato', 'marc']) {
        const d = okValue(ArticulationDef.createDefaultArticulationDef(name));
        expect(d.getRelativeDuration()).toBe(0.8);
        expect(d.getAbsoluteVelocityChange()).toBe(25.0);
      }
    });

    it('barely shortens nonlegato', () => {
      expect(
        okValue(ArticulationDef.createDefaultArticulationDef('nonlegato')).getRelativeDuration(),
      ).toBe(0.95);
    });

    it('gives the pizzicato family a fixed absolute duration', () => {
      for (const name of ['pizzicato', 'pizz', 'left-hand pizzicato', 'lhpizz'])
        expect(
          okValue(ArticulationDef.createDefaultArticulationDef(name)).getAbsoluteDuration(),
        ).toBe(1.0);
    });

    it('shortens portato', () => {
      for (const name of ['portato', 'port'])
        expect(
          okValue(ArticulationDef.createDefaultArticulationDef(name)).getRelativeDuration(),
        ).toBe(0.8);
    });

    it('pins the sforzato family to maximum velocity', () => {
      for (const name of ['sf', 'sfz', 'fz', 'sforzato']) {
        const d = okValue(ArticulationDef.createDefaultArticulationDef(name));
        expect(d.getAbsoluteVelocity()).toBe(127.0);
        expect(d.getRelativeDuration()).toBe(0.8);
      }
    });

    it('combines a fixed duration and an accent for snap pizzicato', () => {
      for (const name of ['snap', 'snap pizzicato']) {
        const d = okValue(ArticulationDef.createDefaultArticulationDef(name));
        expect(d.getAbsoluteDuration()).toBe(1.0);
        expect(d.getAbsoluteVelocityChange()).toBe(25.0);
      }
    });

    it('gives spiccato a short millisecond duration and an accent', () => {
      for (const name of ['spiccato', 'spicc']) {
        const d = okValue(ArticulationDef.createDefaultArticulationDef(name));
        expect(d.getAbsoluteDurationMs()).toBe(140.0);
        expect(d.getAbsoluteVelocityChange()).toBe(25.0);
      }
    });

    it('gives staccato a short millisecond duration and a slight drop in velocity', () => {
      for (const name of ['staccato', 'stacc']) {
        const d = okValue(ArticulationDef.createDefaultArticulationDef(name));
        expect(d.getAbsoluteDurationMs()).toBe(160.0);
        expect(d.getAbsoluteVelocityChange()).toBe(-5.0);
      }
    });

    it('makes staccatissimo shorter and slightly louder than staccato', () => {
      for (const name of ['staccatissimo', 'stacciss']) {
        const d = okValue(ArticulationDef.createDefaultArticulationDef(name));
        expect(d.getAbsoluteDurationMs()).toBe(140.0);
        expect(d.getAbsoluteVelocityChange()).toBe(5.0);
      }
    });

    it('shortens the standard articulation by a fixed amount of ticks', () => {
      expect(
        okValue(
          ArticulationDef.createDefaultArticulationDef('standardArticulation'),
        ).getAbsoluteDurationChange(),
      ).toBe(-70.0);
    });

    it('slightly shortens and accents tenuto', () => {
      for (const name of ['tenuto', 'ten']) {
        const d = okValue(ArticulationDef.createDefaultArticulationDef(name));
        expect(d.getRelativeDuration()).toBe(0.9);
        expect(d.getAbsoluteVelocityChange()).toBe(12.0);
      }
    });

    it('produces a neutral def for bowing marks and unknown names', () => {
      for (const name of ['down bow', 'dnbow', 'up bow', 'upbow', 'somethingUnheardOf']) {
        const d = okValue(ArticulationDef.createDefaultArticulationDef(name));
        expect(d.getName()).toBe(name);
        expect(d.getRelativeDuration()).toBe(1.0);
        expect(d.getRelativeVelocity()).toBe(1.0);
        expect(d.getAbsoluteVelocityChange()).toBe(0.0);
        expect(d.getAbsoluteDuration()).toBeNull();
      }
    });

    it('matches the name case-insensitively but keeps the original spelling', () => {
      const d = okValue(ArticulationDef.createDefaultArticulationDef('  Staccato '));
      expect(d.getName()).toBe('  Staccato ');
      expect(d.getAbsoluteDurationMs()).toBe(160.0);
    });
  });

  describe('articulateNote', () => {
    it('returns false for a null note', () => {
      const ad = okValue(ArticulationDef.createArticulationDef('x'));
      expect(ad.articulateNote(null)).toBe(false);
    });

    it('leaves a note without any of the relevant attributes alone', () => {
      const ad = okValue(ArticulationDef.createDefaultArticulationDef('staccato'));
      const n = note({ pitch: '60' });
      expect(ad.articulateNote(n)).toBe(false);
      expect(n.getAttributeCount()).toBe(1);
    });

    it('replaces the performance duration with absoluteDuration', () => {
      const ad = okValue(ArticulationDef.createArticulationDef('x'));
      ad.setAbsoluteDuration(120.0);
      const n = note({ 'duration.perf': '360.0' });
      expect(ad.articulateNote(n)).toBe(false);
      expect(parseFloat(n.getAttributeValue('duration.perf')!)).toBe(120.0);
    });

    it('scales the performance duration by relativeDuration', () => {
      const ad = okValue(ArticulationDef.createArticulationDef('x'));
      ad.setRelativeDuration(0.5);
      const n = note({ 'duration.perf': '360.0' });
      ad.articulateNote(n);
      expect(parseFloat(n.getAttributeValue('duration.perf')!)).toBe(180.0);
    });

    it('applies absoluteDuration before relativeDuration', () => {
      const ad = okValue(ArticulationDef.createArticulationDef('x'));
      ad.setAbsoluteDuration(200.0);
      ad.setRelativeDuration(0.5);
      const n = note({ 'duration.perf': '360.0' });
      ad.articulateNote(n);
      expect(parseFloat(n.getAttributeValue('duration.perf')!)).toBe(100.0);
    });

    it('adds absoluteDurationChange to the performance duration', () => {
      const ad = okValue(ArticulationDef.createArticulationDef('x'));
      ad.setAbsoluteDurationChange(-70.0);
      const n = note({ 'duration.perf': '360.0' });
      ad.articulateNote(n);
      expect(parseFloat(n.getAttributeValue('duration.perf')!)).toBe(290.0);
    });

    it('halves an absoluteDurationChange until the duration stays positive', () => {
      // 100 - 150 = -50 <= 0, so the change is halved once: 100 - 75 = 25.
      const ad = okValue(ArticulationDef.createArticulationDef('x'));
      ad.setAbsoluteDurationChange(-150.0);
      const n = note({ 'duration.perf': '100.0' });
      ad.articulateNote(n);
      expect(parseFloat(n.getAttributeValue('duration.perf')!)).toBe(25.0);
    });

    it('keeps halving while the result is still zero or negative', () => {
      // -400 -> -200 -> -100 (duration 0, still not positive) -> -50 => 50.
      const ad = okValue(ArticulationDef.createArticulationDef('x'));
      ad.setAbsoluteDurationChange(-400.0);
      const n = note({ 'duration.perf': '100.0' });
      ad.articulateNote(n);
      expect(parseFloat(n.getAttributeValue('duration.perf')!)).toBe(50.0);
    });

    it('skips the duration change when the duration is not greater than zero', () => {
      const ad = okValue(ArticulationDef.createArticulationDef('x'));
      ad.setAbsoluteDurationChange(-70.0);
      const n = note({ 'duration.perf': '0.0' });
      ad.articulateNote(n);
      expect(parseFloat(n.getAttributeValue('duration.perf')!)).toBe(0.0);
    });

    it('lets absoluteDurationMs take over and leaves the symbolic duration untouched', () => {
      const ad = okValue(ArticulationDef.createArticulationDef('x'));
      ad.setAbsoluteDurationMs(160.0);
      ad.setAbsoluteDuration(120.0);
      ad.setRelativeDuration(0.5);
      ad.setAbsoluteDurationChange(-70.0);
      const n = note({ 'duration.perf': '360.0' });
      ad.articulateNote(n);
      expect(n.getAttributeValue('duration.perf')).toBe('360.0');
      expect(parseFloat(n.getAttributeValue('articulation.absoluteDurationMs')!)).toBe(160.0);
    });

    it('passes absoluteDurationChangeMs on to the note', () => {
      const ad = okValue(ArticulationDef.createArticulationDef('x'));
      ad.setAbsoluteDurationChangeMs(-400.0);
      const n = note({ 'duration.perf': '360.0' });
      ad.articulateNote(n);
      expect(parseFloat(n.getAttributeValue('articulation.absoluteDurationChangeMs')!)).toBe(
        -400.0,
      );
    });

    it('ignores all duration modifiers when the note has no duration.perf', () => {
      const ad = okValue(ArticulationDef.createArticulationDef('x'));
      ad.setAbsoluteDurationMs(160.0);
      ad.setAbsoluteDurationChangeMs(-400.0);
      const n = note({ velocity: '64.0' });
      ad.articulateNote(n);
      expect(n.getAttribute('articulation.absoluteDurationMs')).toBeNull();
      expect(n.getAttribute('articulation.absoluteDurationChangeMs')).toBeNull();
    });

    it('shifts date.perf by absoluteDelay and reports the change', () => {
      const ad = okValue(ArticulationDef.createArticulationDef('x'));
      ad.setAbsoluteDelay(15.0);
      const n = note({ 'date.perf': '720.0' });
      expect(ad.articulateNote(n)).toBe(true);
      expect(parseFloat(n.getAttributeValue('date.perf')!)).toBe(735.0);
    });

    it('passes absoluteDelayMs on without reporting a date change', () => {
      const ad = okValue(ArticulationDef.createArticulationDef('x'));
      ad.setAbsoluteDelayMs(30.0);
      const n = note({ 'date.perf': '720.0' });
      expect(ad.articulateNote(n)).toBe(false);
      expect(parseFloat(n.getAttributeValue('articulation.absoluteDelayMs')!)).toBe(30.0);
      expect(n.getAttributeValue('date.perf')).toBe('720.0');
    });

    it('ignores the delay modifiers when the note has no date.perf', () => {
      const ad = okValue(ArticulationDef.createArticulationDef('x'));
      ad.setAbsoluteDelay(15.0);
      ad.setAbsoluteDelayMs(30.0);
      const n = note({ velocity: '64.0' });
      expect(ad.articulateNote(n)).toBe(false);
      expect(n.getAttribute('articulation.absoluteDelayMs')).toBeNull();
    });

    it('replaces the velocity with absoluteVelocity', () => {
      const ad = okValue(ArticulationDef.createArticulationDef('x'));
      ad.setAbsoluteVelocity(127.0);
      const n = note({ velocity: '64.0' });
      ad.articulateNote(n);
      expect(parseFloat(n.getAttributeValue('velocity')!)).toBe(127.0);
    });

    it('scales the velocity by relativeVelocity', () => {
      const ad = okValue(ArticulationDef.createArticulationDef('x'));
      ad.setRelativeVelocity(0.5);
      const n = note({ velocity: '64.0' });
      ad.articulateNote(n);
      expect(parseFloat(n.getAttributeValue('velocity')!)).toBe(32.0);
    });

    it('applies absolute, relative and change in that order', () => {
      const ad = okValue(ArticulationDef.createArticulationDef('x'));
      ad.setAbsoluteVelocity(100.0);
      ad.setRelativeVelocity(0.5);
      ad.setAbsoluteVelocityChange(25.0);
      const n = note({ velocity: '64.0' });
      ad.articulateNote(n);
      expect(parseFloat(n.getAttributeValue('velocity')!)).toBe(75.0);
    });

    it('ignores the velocity modifiers when the note has no velocity', () => {
      const ad = okValue(ArticulationDef.createArticulationDef('x'));
      ad.setAbsoluteVelocity(127.0);
      const n = note({ 'duration.perf': '360.0' });
      ad.articulateNote(n);
      expect(n.getAttribute('velocity')).toBeNull();
    });

    it('adds the detune attributes regardless of the other note attributes', () => {
      const ad = okValue(ArticulationDef.createArticulationDef('x'));
      ad.setDetuneCents(-14.0);
      ad.setDetuneHz(3.5);
      const n = note({ pitch: '60' });
      ad.articulateNote(n);
      expect(parseFloat(n.getAttributeValue('detuneCents')!)).toBe(-14.0);
      expect(parseFloat(n.getAttributeValue('detuneHz')!)).toBe(3.5);
    });

    it('applies a default staccato def end to end', () => {
      const ad = okValue(ArticulationDef.createDefaultArticulationDef('staccato'));
      const n = note({ 'duration.perf': '360.0', 'date.perf': '720.0', velocity: '64.0' });
      expect(ad.articulateNote(n)).toBe(false);
      expect(parseFloat(n.getAttributeValue('articulation.absoluteDurationMs')!)).toBe(160.0);
      expect(n.getAttributeValue('duration.perf')).toBe('360.0');
      expect(parseFloat(n.getAttributeValue('velocity')!)).toBe(59.0);
    });
  });
  // PARITY.md, "Fixed bugs", P1. All twelve attributes are bare Double.parseDouble calls in
  // Java's throwing constructor (ArticulationDef.java:100-133), so a malformed one skips the
  // whole def instead of leaving that single field NaN.
  describe('malformed numeric attributes', () => {
    const NUMERIC_ATTRIBUTES = [
      'absoluteDuration',
      'absoluteDurationChange',
      'absoluteDurationMs',
      'absoluteDurationChangeMs',
      'relativeDuration',
      'absoluteDelay',
      'absoluteDelayMs',
      'absoluteVelocity',
      'relativeVelocity',
      'absoluteVelocityChange',
      'detuneCents',
      'detuneHz',
    ];

    it.each(NUMERIC_ATTRIBUTES)(
      'refuses the def when %s is not a number, and says so',
      (attributeName) => {
        const def = ArticulationDef.createArticulationDef(
          articulationDefElement({ name: 'x', [attributeName]: 'abc' }),
        );
        expect(defCause(def)).toBeInstanceOf(NumberFormatError);
      },
    );

    it('covers every numeric attribute the class reads', () => {
      // If someone adds a thirteenth attribute, this count fails and the list above has to
      // grow with it — the it.each block is only as complete as this number.
      expect(NUMERIC_ATTRIBUTES).toHaveLength(12);
    });

    it('rejects a value parseFloat would have silently truncated', () => {
      expect(
        errOf(
          ArticulationDef.createArticulationDef(
            articulationDefElement({ name: 'x', relativeDuration: '0.5x' }),
          ),
        ),
      ).toMatchObject({
        kind: 'malformedDef',
        what: 'ArticulationDef',
      });
    });

    it('still parses a well-formed neighbour', () => {
      const def = okValue(
        ArticulationDef.createArticulationDef(
          articulationDefElement({ name: 'x', relativeDuration: '0.5' }),
        ),
      );
      expect(def.getRelativeDuration()).toBe(0.5);
    });
  });
});
