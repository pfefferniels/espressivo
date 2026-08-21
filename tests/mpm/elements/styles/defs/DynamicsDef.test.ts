import { describe, it, expect } from 'vitest';
import { defCause, errOf, okValue } from '../../../../support/result.js';
import { DynamicsDef } from '../../../../../src/mpm/elements/styles/defs/DynamicsDef.js';
import { Element, Attribute } from '../../../../../src/xml/XomTypes.js';
import { Mpm } from '../../../../../src/mpm/Mpm.js';
import { NumberFormatError } from '../../../../../src/xml/errors.js';

/**
 * Reference: meico/src/meico/mpm/elements/styles/defs/DynamicsDef.java
 */
function dynamicsDefElement(attributes: Record<string, string>): Element {
  const e = new Element('dynamicsDef', Mpm.MPM_NAMESPACE);
  for (const [name, value] of Object.entries(attributes))
    e.addAttribute(new Attribute(name, value));
  return e;
}

describe('DynamicsDef', () => {
  describe('createDynamicsDef from name and value', () => {
    it('stores name and value and builds a dynamicsDef element', () => {
      const dd = okValue(DynamicsDef.createDynamicsDef('forte', 97.0));
      expect(dd.getName()).toBe('forte');
      expect(dd.getValue()).toBe(97.0);
      expect(dd.getXml()!.getLocalName()).toBe('dynamicsDef');
      expect(dd.getXml()!.getNamespaceURI()).toBe(Mpm.MPM_NAMESPACE);
      expect(dd.getXml()!.getAttributeValue('value')).toBe('97');
    });
  });

  describe('createDynamicsDef from xml', () => {
    it('reads name and value off the element', () => {
      const dd = okValue(
        DynamicsDef.createDynamicsDef(dynamicsDefElement({ name: 'pp', value: '36.0' })),
      );
      expect(dd.getName()).toBe('pp');
      expect(dd.getValue()).toBe(36.0);
      expect(dd.getId()).toBeNull();
    });

    it('reports a missing value attribute rather than printing it', () => {
      expect(
        errOf(DynamicsDef.createDynamicsDef(dynamicsDefElement({ name: 'pp' }))),
      ).toMatchObject({
        kind: 'malformedDef',
        what: 'DynamicsDef',
      });
    });

    it('reports a missing name attribute rather than printing it', () => {
      expect(
        errOf(DynamicsDef.createDynamicsDef(dynamicsDefElement({ value: '36.0' }))),
      ).toMatchObject({
        kind: 'malformedDef',
        what: 'DynamicsDef',
      });
    });

    it('reports a null element rather than printing it', () => {
      expect(errOf(DynamicsDef.createDynamicsDef(null as unknown as Element))).toMatchObject({
        kind: 'malformedDef',
        what: 'DynamicsDef',
      });
    });
  });

  describe('the identity attributes are bound at construction', () => {
    it('writes through the very attribute nodes the parse read', () => {
      const xml = dynamicsDefElement({ name: 'pp', value: '36.0' });
      const dd = okValue(DynamicsDef.createDynamicsDef(xml));
      expect(dd.getXml()).toBe(xml);
      const nameNode = xml.getAttribute('name')!;
      const valueNode = xml.getAttribute('value')!;

      dd.setName('ppp');
      dd.setValue(12.0);
      expect(nameNode.getValue()).toBe('ppp');
      expect(valueNode.getValue()).toBe('12');
      expect(dd.getName()).toBe('ppp');
      expect(dd.getValue()).toBe(12.0);
      expect(xml.getAttributeCount()).toBe(2);
    });
  });

  describe('setValue', () => {
    it('updates the field and the xml attribute', () => {
      const dd = okValue(DynamicsDef.createDynamicsDef('forte', 97.0));
      dd.setValue(101.5);
      expect(dd.getValue()).toBe(101.5);
      expect(dd.getXml()!.getAttributeValue('value')).toBe('101.5');
    });
  });

  describe('getDefaultVolumeLevel', () => {
    // Values are taken verbatim from DynamicsDef.java:123-160.
    const table: [string, number][] = [
      ['pppp', 5.0],
      ['pianissimopianissimo', 5.0],
      ['ppp', 12.0],
      ['pianopianissimo', 12.0],
      ['pp', 36.0],
      ['pianissimo', 36.0],
      ['p', 48.0],
      ['piano', 48.0],
      ['mp', 64.0],
      ['mezzopiano', 64.0],
      ['mf', 83.0],
      ['mezzoforte', 83.0],
      ['f', 97.0],
      ['forte', 97.0],
      ['ff', 111.0],
      ['fortissimo', 111.0],
      ['fff', 120.0],
      ['fortefortissimo', 120.0],
      ['ffff', 125.0],
      ['fortissimofortissimo', 125.0],
      ['sf', 127.0],
      ['sfz', 127.0],
      ['fz', 127.0],
      ['sforzato', 127.0],
    ];

    for (const [dynamics, level] of table) {
      it(`maps "${dynamics}" to ${level}`, () => {
        expect(DynamicsDef.getDefaultVolumeLevel(dynamics)).toBe(level);
      });
    }

    it('falls back to 74 for an unknown dynamics string', () => {
      expect(DynamicsDef.getDefaultVolumeLevel('lauter')).toBe(74.0);
    });

    it('trims and lowercases before matching', () => {
      expect(DynamicsDef.getDefaultVolumeLevel('  Forte ')).toBe(97.0);
      expect(DynamicsDef.getDefaultVolumeLevel('MF')).toBe(83.0);
    });

    it('matches whole strings only, unlike the tempo lookup', () => {
      // "molto forte" is not the token "forte", so it falls through to the default.
      expect(DynamicsDef.getDefaultVolumeLevel('molto forte')).toBe(74.0);
    });
  });

  describe('createDefaultDynamicsDef', () => {
    it('names the def after the dynamics string and resolves its value', () => {
      const dd = okValue(DynamicsDef.createDefaultDynamicsDef('mf'));
      expect(dd.getName()).toBe('mf');
      expect(dd.getValue()).toBe(83.0);
    });

    it('uses the 74 fallback for unknown dynamics strings', () => {
      const dd = okValue(DynamicsDef.createDefaultDynamicsDef('irgendwas'));
      expect(dd.getValue()).toBe(74.0);
    });
  });
  // PARITY.md, "Fixed bugs", P1 — as DynamicsDef.java:88, a malformed value makes the
  // factory return null rather than yielding a def whose value is NaN.
  describe('malformed value attribute', () => {
    it('refuses a NaN-valued def, and says the value would not parse', () => {
      const dd = DynamicsDef.createDynamicsDef(dynamicsDefElement({ name: 'x', value: 'loud' }));
      expect(defCause(dd)).toBeInstanceOf(NumberFormatError);
    });

    it('rejects a value parseFloat would have silently truncated', () => {
      const dd = DynamicsDef.createDynamicsDef(dynamicsDefElement({ name: 'x', value: '97dB' }));
      expect(defCause(dd)).toBeInstanceOf(NumberFormatError);
    });

    it('still parses a well-formed neighbour', () => {
      const dd = okValue(
        DynamicsDef.createDynamicsDef(dynamicsDefElement({ name: 'x', value: '97' })),
      );
      expect(dd.getValue()).toBe(97);
    });
  });
});
