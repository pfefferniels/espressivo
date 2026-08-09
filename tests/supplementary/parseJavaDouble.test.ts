import { describe, it, expect } from 'vitest';
import { parseJavaDouble } from '../../src/supplementary/parseJavaDouble.js';
import { NumberFormatError, MeicoError } from '../../src/xml/errors.js';

/**
 * Reference: the grammar published by `java.lang.Double.valueOf`'s javadoc, which is what
 * `Double.parseDouble` accepts. See PARITY.md, "Fixed bugs", P1 — the port used `parseFloat`,
 * which disagrees with Java about *failure* rather than about numbers.
 */
describe('parseJavaDouble', () => {
  describe('values Java accepts', () => {
    it('parses the ordinary decimal shapes', () => {
      expect(parseJavaDouble('0', 'x')).toBe(0);
      expect(parseJavaDouble('147.0', 'x')).toBe(147);
      expect(parseJavaDouble('-0.5', 'x')).toBe(-0.5);
      expect(parseJavaDouble('+3', 'x')).toBe(3);
      expect(parseJavaDouble('.5', 'x')).toBe(0.5);
      expect(parseJavaDouble('5.', 'x')).toBe(5);
      expect(parseJavaDouble('1e3', 'x')).toBe(1000);
      expect(parseJavaDouble('1.5E-2', 'x')).toBe(0.015);
    });

    it("accepts Java's f/d type suffix, which Number() alone rejects", () => {
      expect(parseJavaDouble('1.5f', 'x')).toBe(1.5);
      expect(parseJavaDouble('1.5F', 'x')).toBe(1.5);
      expect(parseJavaDouble('2d', 'x')).toBe(2);
      expect(parseJavaDouble('2D', 'x')).toBe(2);
    });

    it('accepts the literal NaN and Infinity, as Double.parseDouble does', () => {
      // Java does NOT throw on these: a value="NaN" attribute yields a NaN-valued def there
      // too, so rejecting them here would be a new divergence rather than a repair.
      expect(parseJavaDouble('NaN', 'x')).toBeNaN();
      expect(parseJavaDouble('Infinity', 'x')).toBe(Infinity);
      expect(parseJavaDouble('-Infinity', 'x')).toBe(-Infinity);
      expect(parseJavaDouble('+Infinity', 'x')).toBe(Infinity);
    });

    it('overflows to Infinity rather than throwing, as Java does', () => {
      expect(parseJavaDouble('1e999', 'x')).toBe(Infinity);
    });

    it("trims Java's whitespace class, up to and including the space", () => {
      expect(parseJavaDouble('  12  ', 'x')).toBe(12);
      expect(parseJavaDouble('\t\n12\r', 'x')).toBe(12);
    });

    it('rejects the Unicode whitespace JS String.trim would have stripped', () => {
      // A no-break space is whitespace to `String.trim` but not to Java, so accepting it
      // would invent a second whitespace divergence on top of RelatedResource.setType's.
      expect('\u00a012\u2028'.trim()).toBe('12');
      expect(() => parseJavaDouble('\u00a012', 'x')).toThrow(NumberFormatError);
      expect(() => parseJavaDouble('12\u2028', 'x')).toThrow(NumberFormatError);
    });
  });

  describe('values Java rejects', () => {
    it('rejects text that is not a number at all', () => {
      expect(() => parseJavaDouble('abc', 'x')).toThrow(NumberFormatError);
      expect(() => parseJavaDouble('', 'x')).toThrow(NumberFormatError);
      expect(() => parseJavaDouble('   ', 'x')).toThrow(NumberFormatError);
      expect(() => parseJavaDouble('--3', 'x')).toThrow(NumberFormatError);
      expect(() => parseJavaDouble('1,5', 'x')).toThrow(NumberFormatError);
    });

    it('rejects trailing garbage, where parseFloat would have returned a prefix', () => {
      // This is the case that motivated the repair: parseFloat('12abc') === 12.
      expect(parseFloat('12abc')).toBe(12);
      expect(() => parseJavaDouble('12abc', 'x')).toThrow(NumberFormatError);
      expect(() => parseJavaDouble('1.5.5', 'x')).toThrow(NumberFormatError);
    });

    it('rejects the non-decimal literals Number() would have accepted', () => {
      expect(Number('0x10')).toBe(16);
      expect(() => parseJavaDouble('0x10', 'x')).toThrow(NumberFormatError);
      expect(() => parseJavaDouble('0b101', 'x')).toThrow(NumberFormatError);
      expect(() => parseJavaDouble('0o17', 'x')).toThrow(NumberFormatError);
    });

    it('names what it was parsing and quotes the offending text', () => {
      expect(() => parseJavaDouble('abc', 'tempoDef/@value')).toThrow(/tempoDef\/@value.*"abc"/);
    });

    it('throws inside the MeicoError hierarchy, so a facade catch sees it', () => {
      expect(() => parseJavaDouble('abc', 'x')).toThrow(MeicoError);
    });
  });

  /**
   * The one place this deliberately narrows on Java: a hexadecimal-float literal is legal
   * input to `Double.parseDouble` and is rejected here, because supporting it needs a
   * hand-written decoder and no tool in this ecosystem emits one. Pinned so the divergence
   * is a decision on the record rather than an oversight — see the module doc.
   */
  it('rejects hexadecimal float literals, the one documented narrowing on Java', () => {
    expect(() => parseJavaDouble('0x1.8p1', 'x')).toThrow(NumberFormatError);
  });
});
