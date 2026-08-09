import { describe, it, expect } from 'vitest';
import {
  numberToString,
  readAttributeValue,
  readNumericAttributeValue,
  writeAttributeValue,
  writeNumericAttributeValue,
} from '../../src/expression/attributes.js';
import { parseMpmRoot, serializeMpmRoot } from '../../src/expression/mpmDocument.js';
import { Attribute } from '../../src/xml/XomTypes.js';
import { MPM_NAMESPACE } from '../../src/mpm/names.js';

const TEMPO = `<tempo xmlns="${MPM_NAMESPACE}" date="0.0" bpm="120" beatLength="0.25" />`;

describe('attributes', () => {
  describe('numberToString', () => {
    it.each([
      [240, '240'],
      [97.5, '97.5'],
      [0.1 + 0.2, '0.30000000000000004'],
      [-0, '0'],
      [1e21, '1e+21'],
      [NaN, 'NaN'],
    ])('formats %p as %p, matching String()', (value, expected) => {
      expect(numberToString(value)).toBe(expected);
    });

    it('is the same spelling the MPM def classes write', () => {
      // TempoDef.setValue / DynamicsDef.setValue both go through String(value), so a value
      // written by the engine and the same value written by the classes agree byte for byte.
      expect(numberToString(1 / 3)).toBe(String(1 / 3));
    });
  });

  describe('writeAttributeValue', () => {
    it('preserves the attribute position in the serialized element', () => {
      const tempo = parseMpmRoot(TEMPO);
      expect(writeAttributeValue(tempo, 'bpm', '240')).toBe(true);
      expect(serializeMpmRoot(tempo)).toBe(
        `<tempo xmlns="${MPM_NAMESPACE}" date="0.0" bpm="240" beatLength="0.25" />`,
      );
    });

    it('keeps the byte order date < bpm < beatLength after several writes', () => {
      const tempo = parseMpmRoot(TEMPO);
      writeAttributeValue(tempo, 'beatLength', '0.5');
      writeAttributeValue(tempo, 'bpm', '240');
      writeAttributeValue(tempo, 'date', '1.0');
      const out = serializeMpmRoot(tempo);
      expect(out.indexOf('date=')).toBeLessThan(out.indexOf('bpm='));
      expect(out.indexOf('bpm=')).toBeLessThan(out.indexOf('beatLength='));
    });

    it('is why addAttribute is banned: that path MOVES the attribute to the end', () => {
      // The contrast this helper exists for (XomTypes.ts:492-500). Not a claim about the
      // engine — a pin on the behaviour that would silently rewrite the fixture bytes.
      const tempo = parseMpmRoot(TEMPO);
      tempo.addAttribute(new Attribute('bpm', '240'));
      expect(serializeMpmRoot(tempo)).toBe(
        `<tempo xmlns="${MPM_NAMESPACE}" date="0.0" beatLength="0.25" bpm="240" />`,
      );
    });

    it('refuses an absent attribute and creates nothing', () => {
      const tempo = parseMpmRoot(TEMPO);
      expect(writeAttributeValue(tempo, 'transition.to', '90')).toBe(false);
      expect(serializeMpmRoot(tempo)).toBe(TEMPO);
    });

    it('escapes the value on serialization without touching the others', () => {
      const tempo = parseMpmRoot(TEMPO);
      writeAttributeValue(tempo, 'bpm', 'a & b < c "d"');
      expect(serializeMpmRoot(tempo)).toContain('bpm="a &amp; b &lt; c &quot;d&quot;"');
    });

    it('reaches an attribute in the XML namespace under its bare name', () => {
      const element = parseMpmRoot(
        `<tempo xmlns="${MPM_NAMESPACE}" xmlns:xml="http://www.w3.org/XML/1998/namespace" xml:id="t1" bpm="120" />`,
      );
      expect(readAttributeValue(element, 'id')).toBe('t1');
      expect(writeAttributeValue(element, 'id', 't2')).toBe(true);
      expect(serializeMpmRoot(element)).toContain('xml:id="t2"');
    });
  });

  describe('writeNumericAttributeValue', () => {
    it('routes through numberToString', () => {
      const tempo = parseMpmRoot(TEMPO);
      writeNumericAttributeValue(tempo, 'bpm', 0.1 + 0.2);
      expect(readAttributeValue(tempo, 'bpm')).toBe('0.30000000000000004');
    });
  });

  describe('reads', () => {
    it('returns null for an absent attribute and the raw text otherwise', () => {
      const tempo = parseMpmRoot(TEMPO);
      expect(readAttributeValue(tempo, 'bpm')).toBe('120');
      expect(readAttributeValue(tempo, 'transition.to')).toBeNull();
    });

    it('reads numbers with parseFloat leniency, and NaN for absent', () => {
      const element = parseMpmRoot(`<tempo xmlns="${MPM_NAMESPACE}" bpm="120bpm" />`);
      expect(readNumericAttributeValue(element, 'bpm')).toBe(120);
      expect(readNumericAttributeValue(element, 'beatLength')).toBeNaN();
    });
  });
});
