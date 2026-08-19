import { describe, it, expect, vi } from 'vitest';
import { TempoDef } from '../../../../../src/mpm/elements/styles/defs/TempoDef.js';
import { Element, Attribute } from '../../../../../src/xml/XomTypes.js';
import { Mpm } from '../../../../../src/mpm/Mpm.js';

/**
 * Reference: meico/src/meico/mpm/elements/styles/defs/TempoDef.java
 * and its base class AbstractDef.java (the AbstractDef behaviour is exercised
 * through TempoDef because AbstractDef itself is abstract).
 */
function tempoDefElement(attributes: Record<string, string>): Element {
  const e = new Element('tempoDef', Mpm.MPM_NAMESPACE);
  for (const [name, value] of Object.entries(attributes))
    e.addAttribute(new Attribute(name, value));
  return e;
}

/** Runs body with console.error silenced; the factories log before returning null. */
function quiet<T>(body: () => T): T {
  const err = vi.spyOn(console, 'error').mockImplementation(() => {});
  try {
    return body();
  } finally {
    err.mockRestore();
  }
}

describe('TempoDef', () => {
  describe('createTempoDef from name and value', () => {
    it('stores name and value and builds a tempoDef element', () => {
      const td = TempoDef.createTempoDef('Allegro', 147.0)!;
      expect(td).not.toBeNull();
      expect(td.getName()).toBe('Allegro');
      expect(td.getValue()).toBe(147.0);
      expect(td.getXml()!.getLocalName()).toBe('tempoDef');
      expect(td.getXml()!.getNamespaceURI()).toBe(Mpm.MPM_NAMESPACE);
      expect(td.getXml()!.getAttributeValue('name')).toBe('Allegro');
      expect(td.getXml()!.getAttributeValue('value')).toBe('147');
    });

    it('has no id unless one is set', () => {
      const td = TempoDef.createTempoDef('Largo', 50.0)!;
      expect(td.getId()).toBeNull();
    });
  });

  describe('createTempoDef from xml', () => {
    it('reads name and value off the element', () => {
      const td = TempoDef.createTempoDef(tempoDefElement({ name: 'Presto', value: '189.0' }))!;
      expect(td.getName()).toBe('Presto');
      expect(td.getValue()).toBe(189.0);
    });

    it('keeps the very element it was built from', () => {
      const xml = tempoDefElement({ name: 'Presto', value: '189.0' });
      const td = TempoDef.createTempoDef(xml)!;
      expect(td.getXml()).toBe(xml);
    });

    it('picks up an existing xml:id', () => {
      const xml = tempoDefElement({ name: 'Presto', value: '189.0' });
      xml.addAttribute(new Attribute('xml:id', 'http://www.w3.org/XML/1998/namespace', 'tempo-1'));
      const td = TempoDef.createTempoDef(xml)!;
      expect(td.getId()).toBe('tempo-1');
    });

    it('returns null when the value attribute is missing', () => {
      const err = vi.spyOn(console, 'error').mockImplementation(() => {});
      expect(TempoDef.createTempoDef(tempoDefElement({ name: 'Presto' }))).toBeNull();
      expect(err).toHaveBeenCalled();
      err.mockRestore();
    });

    it('returns null when the name attribute is missing', () => {
      const err = vi.spyOn(console, 'error').mockImplementation(() => {});
      expect(TempoDef.createTempoDef(tempoDefElement({ value: '120.0' }))).toBeNull();
      expect(err).toHaveBeenCalled();
      err.mockRestore();
    });

    it('returns null for a null element', () => {
      const err = vi.spyOn(console, 'error').mockImplementation(() => {});
      expect(TempoDef.createTempoDef(null as unknown as Element)).toBeNull();
      expect(err).toHaveBeenCalled();
      err.mockRestore();
    });

    it('reads an element that is not named tempoDef', () => {
      // Java renames such an element (TempoDef.java:78-80); the port cannot, because its
      // Element class has no setLocalName. The parsed values are the same either way.
      const foreign = new Element('somethingElse', Mpm.MPM_NAMESPACE);
      foreign.addAttribute(new Attribute('name', 'Presto'));
      foreign.addAttribute(new Attribute('value', '189.0'));
      const td = TempoDef.createTempoDef(foreign)!;
      expect(td.getName()).toBe('Presto');
      expect(td.getValue()).toBe(189.0);
    });
  });

  // `parseData` is the parser the static factories call — the forwarding override that
  // used to sit in front of it is gone. Re-applying it to a second element is not a path
  // production takes; what the test is for is the parse itself, and re-application is
  // simply the only way to observe it separately from construction.
  describe('parseData', () => {
    it('re-reads name, value and xml when applied to another element', () => {
      const td = TempoDef.createTempoDef('Allegro', 147.0)!;
      const other = tempoDefElement({ name: 'Largo', value: '50.0' });
      (td as unknown as { parseData(xml: Element): void }).parseData(other);

      expect(td.getName()).toBe('Largo');
      expect(td.getValue()).toBe(50.0);
      expect(td.getXml()).toBe(other);
    });
  });

  describe('setName (AbstractDef)', () => {
    it('renames the def in the object and in the xml', () => {
      const td = TempoDef.createTempoDef('Allegro', 147.0)!;
      (td as unknown as { setName(name: string): void }).setName('Allegro molto');
      expect(td.getName()).toBe('Allegro molto');
      expect(td.getXml()!.getAttributeValue('name')).toBe('Allegro molto');
    });
  });

  describe('setValue', () => {
    it('updates the field and the xml attribute', () => {
      const td = TempoDef.createTempoDef('Allegro', 147.0)!;
      td.setValue(132.5);
      expect(td.getValue()).toBe(132.5);
      expect(td.getXml()!.getAttributeValue('value')).toBe('132.5');
    });
  });

  describe('id handling (AbstractDef)', () => {
    it('adds an xml:id attribute in the XML namespace', () => {
      const td = TempoDef.createTempoDef('Allegro', 147.0)!;
      td.setId('tempo-allegro');
      expect(td.getId()).toBe('tempo-allegro');
      const idAtt = td.getXml()!.getAttribute('id', 'http://www.w3.org/XML/1998/namespace');
      expect(idAtt).not.toBeNull();
      expect(idAtt!.getValue()).toBe('tempo-allegro');
    });

    it('overwrites an existing id instead of adding a second attribute', () => {
      const td = TempoDef.createTempoDef('Allegro', 147.0)!;
      td.setId('first');
      const countAfterFirst = td.getXml()!.getAttributeCount();
      td.setId('second');
      expect(td.getId()).toBe('second');
      expect(td.getXml()!.getAttributeCount()).toBe(countAfterFirst);
    });

    it('clears the id when set to null', () => {
      const td = TempoDef.createTempoDef('Allegro', 147.0)!;
      td.setId('tempo-allegro');
      td.setId(null);
      expect(td.getId()).toBeNull();
    });

    it('tolerates clearing an id that was never set', () => {
      const td = TempoDef.createTempoDef('Allegro', 147.0)!;
      td.setId(null);
      expect(td.getId()).toBeNull();
    });
  });

  describe('getDefaultTempo', () => {
    // Values are taken verbatim from TempoDef.java:123-141.
    const table: [string, number][] = [
      ['grave', 42.0],
      ['largo', 50.0],
      ['lento', 51.0],
      ['adagio', 79.0],
      ['larghetto', 69.0],
      ['adagietto', 66.0],
      ['andante', 101.0],
      ['andantino', 80.0],
      ['maestoso', 88.0],
      ['moderato', 106.0],
      ['allegretto', 110.0],
      ['animato', 121.0],
      ['allegro', 147.0],
      ['assai', 145.0],
      ['vivace', 164.0],
      ['presto', 189.0],
      ['prestissimo', 206.0],
    ];

    for (const [descriptor, bpm] of table) {
      it(`maps "${descriptor}" to ${bpm}`, () => {
        expect(TempoDef.getDefaultTempo(descriptor)).toBe(bpm);
      });
    }

    it('falls back to 100 bpm for an unknown descriptor', () => {
      expect(TempoDef.getDefaultTempo('schnell')).toBe(100.0);
    });

    it('trims and lowercases the descriptor before matching', () => {
      expect(TempoDef.getDefaultTempo('  GRAVE  ')).toBe(42.0);
      expect(TempoDef.getDefaultTempo('Vivace')).toBe(164.0);
    });

    it('matches on substrings, so qualified descriptors still resolve', () => {
      expect(TempoDef.getDefaultTempo('molto adagio')).toBe(79.0);
    });

    it('resolves ambiguous descriptors in the order the checks are written', () => {
      // "moderato" is tested before "allegro", so the slower reading wins.
      expect(TempoDef.getDefaultTempo('Allegro moderato')).toBe(106.0);
      // "allegro" is tested before "assai", so 147 wins over 145.
      expect(TempoDef.getDefaultTempo('Allegro assai')).toBe(147.0);
    });
  });

  describe('createDefaultTempoDef', () => {
    it('names the def after the descriptor and resolves its bpm value', () => {
      const td = TempoDef.createDefaultTempoDef('Andante')!;
      expect(td.getName()).toBe('Andante');
      expect(td.getValue()).toBe(101.0);
    });

    it('uses the 100 bpm fallback for unknown descriptors', () => {
      const td = TempoDef.createDefaultTempoDef('irgendwas')!;
      expect(td.getValue()).toBe(100.0);
    });
  });
  // PARITY.md, "Fixed bugs", P1. Java's Double.parseDouble throws on a malformed value
  // (TempoDef.java:88) and createTempoDef turns that into null, so the style skips the def.
  // The port used parseFloat and kept a NaN-valued def instead.
  describe('malformed value attribute', () => {
    it('returns null instead of a NaN-valued def', () => {
      const td = quiet(() => TempoDef.createTempoDef(tempoDefElement({ name: 'x', value: 'abc' })));
      expect(td).toBeNull();
    });

    it('rejects a value parseFloat would have silently truncated', () => {
      // parseFloat('120bpm') === 120; Double.parseDouble throws.
      const td = quiet(() =>
        TempoDef.createTempoDef(tempoDefElement({ name: 'x', value: '120bpm' })),
      );
      expect(td).toBeNull();
    });

    it('still parses a well-formed neighbour', () => {
      const td = TempoDef.createTempoDef(tempoDefElement({ name: 'x', value: '120' }))!;
      expect(td.getValue()).toBe(120);
    });
  });
});
