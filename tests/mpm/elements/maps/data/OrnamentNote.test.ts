import { describe, it, expect, vi } from 'vitest';
import { OrnamentNote } from '../../../../../src/mpm/elements/maps/data/OrnamentNote.js';
import { Builder, Element } from '../../../../../src/xml/XomTypes.js';

const MPM_NS = 'http://www.cemfi.de/mpm/ns/1.0';

/** parse an XML string into an element, the way a real document reaches the parser */
function parseElement(xml: string): Element {
  return new Builder().build(xml).getRootElement();
}

/** parse a pool `<note>` given as source text */
function note(attributes: string): OrnamentNote | null {
  return OrnamentNote.fromXml(parseElement(`<note xmlns="${MPM_NS}" ${attributes}/>`));
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

describe('OrnamentNote', () => {
  describe('pitch specification (DESIGN.md D8)', () => {
    it('should read midi.pitch as an absolute pitch', () => {
      const n = note('xml:id="n1" midi.pitch="64"')!;
      expect(n.id).toBe('n1');
      expect(n.pitchSpec).toEqual({ kind: 'midi', value: 64 });
    });

    it('should read interval.chromatic as a halftone interval', () => {
      // note.xml:60-70, the "upper turn": <note xml:id="n2" interval.chromatic="1.0"/>
      expect(note('xml:id="n2" interval.chromatic="1.0"')!.pitchSpec).toEqual({
        kind: 'chromatic',
        value: 1.0,
      });
      expect(note('xml:id="n3" interval.chromatic="-1.0"')!.pitchSpec).toEqual({
        kind: 'chromatic',
        value: -1.0,
      });
    });

    it('should read a microtonal interval.chromatic', () => {
      // the attribute is typed double precisely so quarter tones are expressible
      expect(note('xml:id="q" interval.chromatic="0.5"')!.pitchSpec).toEqual({
        kind: 'chromatic',
        value: 0.5,
      });
    });

    it('should read interval.diatonic as a scale-step interval', () => {
      expect(note('xml:id="d" interval.diatonic="-1"')!.pitchSpec).toEqual({
        kind: 'diatonic',
        value: -1,
      });
    });

    it('should default a note with no pitch attribute to a zero chromatic interval', () => {
      // the schematron is `count(...) le 1`, so ZERO pitch attributes is legal, and the
      // attribute defaults then leave the note at the principal note's pitch
      expect(note('xml:id="plain"')!.pitchSpec).toEqual({ kind: 'chromatic', value: 0.0 });
    });
  });

  describe('mutual exclusion (schematron note-pitch-mutual-exclusion)', () => {
    it('should let midi.pitch win over both intervals, with a warning', () => {
      let n: OrnamentNote | null = null;
      const messages = captureErrors(() => {
        n = note('xml:id="x" midi.pitch="60" interval.chromatic="2.0" interval.diatonic="1"');
      });
      expect(n!.pitchSpec).toEqual({ kind: 'midi', value: 60 });
      expect(messages.join('\n')).toContain('more than one');
      expect(messages.join('\n')).toContain('midi.pitch');
    });

    it('should let interval.chromatic win over interval.diatonic, with a warning', () => {
      let n: OrnamentNote | null = null;
      const messages = captureErrors(() => {
        n = note('xml:id="x" interval.chromatic="2.0" interval.diatonic="1"');
      });
      expect(n!.pitchSpec).toEqual({ kind: 'chromatic', value: 2.0 });
      expect(messages.join('\n')).toContain('interval.chromatic');
    });

    it('should not warn for a single pitch attribute', () => {
      const messages = captureErrors(() => {
        expect(note('xml:id="x" interval.diatonic="2"')).not.toBeNull();
      });
      expect(messages).toEqual([]);
    });
  });

  describe('rejected notes (RULE E1 — log and skip, never throw)', () => {
    it('should skip a note without an xml:id', () => {
      // note.order addresses pool notes by id, so an anonymous pool note is unreachable
      let n: OrnamentNote | null = null;
      const messages = captureErrors(() => {
        n = note('interval.chromatic="1.0"');
      });
      expect(n).toBeNull();
      expect(messages.join('\n')).toContain('no xml:id');
    });

    it('should skip a note whose pitch value is not a number', () => {
      let n: OrnamentNote | null = null;
      const messages = captureErrors(() => {
        n = note('xml:id="bad" midi.pitch="sixty-four"');
      });
      expect(n).toBeNull();
      expect(messages.join('\n')).toContain('no number');
    });

    it('should skip a note whose pitch value is empty', () => {
      // INVERTED in W9, deliberately, by the D16 ruling (PARITY.md §6.8): this used to assert
      // the opposite of its own title. `Number('')` is 0, so an empty attribute silently read
      // as "no alteration" — a pitch the document never stated, invented from nothing.
      // `parseJavaDouble` rejects the empty string exactly as `Double.parseDouble` does, so the
      // note now takes the same route as every other unreadable pitch: logged and skipped.
      let n: OrnamentNote | null = null;
      const messages = captureErrors(() => {
        n = note('xml:id="empty" interval.chromatic=""');
      });
      expect(n).toBeNull();
      expect(messages.join('\n')).toContain('no number');
    });

    it('should never throw on malformed input', () => {
      captureErrors(() => {
        expect(() => note('midi.pitch="NaN"')).not.toThrow();
        expect(() => note('xml:id="a" midi.pitch="Infinity"')).not.toThrow();
        expect(() => note('xml:id="b" interval.diatonic="1 2 3"')).not.toThrow();
      });
    });

    /**
     * The three spellings where `parseJavaDouble` and the `Number` this used to call disagree
     * (D16's W9 ruling — `midi.pitch` has no grammar, so the choice of parser is observable):
     *
     * | value    | `Number`   | `Double.parseDouble` | here |
     * | -------- | ---------- | -------------------- | ---- |
     * | `""`     | 0          | throws               | skipped (above) |
     * | `"0x10"` | 16         | throws               | skipped |
     * | `"1d"`   | NaN        | 1.0                  | 1 |
     *
     * `"NaN"` and `"Infinity"` are accepted by both parsers and rejected by this port's own
     * finiteness check instead — a pitch must be a number a note can sound at.
     */
    it('should follow Double.parseDouble where it and Number disagree (D16)', () => {
      let hex: OrnamentNote | null = null;
      let suffixed: OrnamentNote | null = null;
      let nan: OrnamentNote | null = null;
      let infinite: OrnamentNote | null = null;
      const messages = captureErrors(() => {
        hex = note('xml:id="hex" midi.pitch="0x10"');
        suffixed = note('xml:id="suffixed" interval.chromatic="1d"');
        nan = note('xml:id="nan" midi.pitch="NaN"');
        infinite = note('xml:id="inf" midi.pitch="Infinity"');
      });

      // Java rejects hexadecimal integer literals; Number would have read 16 as a pitch
      expect(hex).toBeNull();
      // Java's own type suffix: a value Number could not read at all
      expect(suffixed!.pitchSpec).toEqual({ kind: 'chromatic', value: 1 });
      // parsed by both, and refused here — the finiteness check is what refuses them
      expect(nan).toBeNull();
      expect(infinite).toBeNull();
      expect(messages.filter((line) => line.includes('no number'))).toHaveLength(3);
    });
  });

  describe('serialization', () => {
    it('should write xml:id first and then the one pitch attribute', () => {
      const n = new OrnamentNote('n1', { kind: 'chromatic', value: 1.0 });
      // canonical spec form; String(1.0) is "1", the port's number formatting throughout
      expect(n.generateXML().toXML()).toBe(
        `<note xmlns="${MPM_NS}" xml:id="n1" interval.chromatic="1" />`,
      );
    });

    it('should write each pitch kind under its own attribute name', () => {
      expect(new OrnamentNote('a', { kind: 'midi', value: 64 }).generateXML().toXML()).toBe(
        `<note xmlns="${MPM_NS}" xml:id="a" midi.pitch="64" />`,
      );
      expect(new OrnamentNote('b', { kind: 'diatonic', value: -2 }).generateXML().toXML()).toBe(
        `<note xmlns="${MPM_NS}" xml:id="b" interval.diatonic="-2" />`,
      );
    });

    it('should restate a defaulted pitch rather than omit it', () => {
      // a `<note xml:id="p"/>` decays to chromatic 0 and is written back with the
      // attribute spelled out, so that state in equals state out. No Java reference
      // writes this element, so no byte precedent binds the choice.
      const n = note('xml:id="p"')!;
      expect(n.generateXML().toXML()).toBe(
        `<note xmlns="${MPM_NS}" xml:id="p" interval.chromatic="0" />`,
      );
    });

    it('should round-trip a canonical element to a fixpoint', () => {
      const source = `<note xmlns="${MPM_NS}" xml:id="n4" interval.chromatic="1" />`;
      const once = OrnamentNote.fromXml(parseElement(source))!.generateXML().toXML();
      expect(once).toBe(source);
      expect(OrnamentNote.fromXml(parseElement(once))!.generateXML().toXML()).toBe(once);
    });

    it('should normalise a mutually exclusive note to the winning attribute', () => {
      let n: OrnamentNote | null = null;
      captureErrors(() => {
        n = note('xml:id="x" midi.pitch="60" interval.diatonic="1"');
      });
      expect(n!.generateXML().toXML()).toBe(
        `<note xmlns="${MPM_NS}" xml:id="x" midi.pitch="60" />`,
      );
    });
  });

  describe('element caching (RULE C1a)', () => {
    it('should keep the parsed element until it is regenerated', () => {
      // the source spelling survives a plain read, exactly as TemporalSpread's does
      const source = `<note xmlns="${MPM_NS}" interval.chromatic="1.0" xml:id="n2"/>`;
      const n = OrnamentNote.fromXml(parseElement(source))!;
      expect(n.getXml().getAttributeValue('interval.chromatic')).toBe('1.0');
      expect(n.generateXML().getAttributeValue('interval.chromatic')).toBe('1');
    });

    it('should generate its element lazily for a note built in code', () => {
      const n = new OrnamentNote('n1', { kind: 'midi', value: 72 });
      expect(n.toXml()).toBe('');
      expect(n.getXml().getLocalName()).toBe('note');
      expect(n.toXml()).not.toBe('');
    });

    it('should put the generated element in the MPM namespace', () => {
      const n = new OrnamentNote('n1', { kind: 'midi', value: 72 });
      expect(n.getXml().getNamespaceURI()).toBe(MPM_NS);
    });
  });
});
