import { describe, it, expect } from 'vitest';
import { errOf, okValue } from '../../support/result.js';
import { Part } from '../../../src/mpm/elements/Part.js';
import { Mpm } from '../../../src/mpm/Mpm.js';
import { Element, Attribute } from '../../../src/xml/XomTypes.js';

/**
 * Reference: meico/src/meico/mpm/elements/Part.java
 *
 * `src/comparison/parts.ts` documents its own behaviour in terms of the rejection pinned
 * here — `number` missing or empty makes `Part.createPart` fail — so it is a contract
 * another module reads.
 */
function partElement(attributes: Record<string, string>): Element {
  const e = new Element('part', Mpm.MPM_NAMESPACE);
  for (const [name, value] of Object.entries(attributes))
    e.addAttribute(new Attribute(name, value));
  return e;
}

const COMPLETE = { name: 'Piano', number: '1', 'midi.channel': '0', 'midi.port': '0' };

describe('Part', () => {
  describe('createPart from an element', () => {
    it('reads the four identifying values', () => {
      const p = okValue(Part.createPart(partElement(COMPLETE)));
      expect(p.getName()).toBe('Piano');
      expect(p.getNumber()).toBe(1);
      expect(p.getMidiChannel()).toBe(0);
      expect(p.getMidiPort()).toBe(0);
    });

    it('fills a missing name in as empty rather than rejecting it', () => {
      const xml = partElement({ number: '1', 'midi.channel': '0', 'midi.port': '0' });
      const p = okValue(Part.createPart(xml));
      expect(p.getName()).toBe('');
      expect(xml.getAttributeValue('name')).toBe('');
    });

    it('creates the header and dated children a bare part lacks', () => {
      const p = okValue(Part.createPart(partElement(COMPLETE)));
      expect(p.getHeader()).not.toBeNull();
      expect(p.getDated()).not.toBeNull();
      expect(p.getXml()!.getFirstChildElement('header')).not.toBeNull();
      expect(p.getXml()!.getFirstChildElement('dated')).not.toBeNull();
    });

    it.each([
      ['number', { name: 'Piano', 'midi.channel': '0', 'midi.port': '0' }],
      ['midi.channel', { name: 'Piano', number: '1', 'midi.port': '0' }],
      ['midi.port', { name: 'Piano', number: '1', 'midi.channel': '0' }],
    ])('names %s when it is absent', (attribute, attributes) => {
      expect(errOf(Part.createPart(partElement(attributes)))).toEqual({
        kind: 'missingAttribute',
        what: 'Part',
        attribute,
      });
    });

    it.each(['number', 'midi.channel', 'midi.port'])(
      'names %s when it is present but empty',
      (attribute) => {
        expect(errOf(Part.createPart(partElement({ ...COMPLETE, [attribute]: '' })))).toEqual({
          kind: 'missingAttribute',
          what: 'Part',
          attribute,
        });
      },
    );

    it('reports a null element rather than printing it', () => {
      expect(errOf(Part.createPart(null))).toEqual({
        kind: 'noElement',
        what: 'Part',
      });
    });

    /**
     * `readFrom` writes `name=""` onto the caller's element before it validates `number`, so
     * a `<part>` with neither comes back mutated and still fails. Pinned because the tidy
     * fix — validate everything, then mutate — changes what a caller's document looks like
     * after a failed parse.
     */
    it('has already written the empty name onto the element it then rejects', () => {
      const xml = partElement({});
      expect(errOf(Part.createPart(xml))).toEqual({
        kind: 'missingAttribute',
        what: 'Part',
        attribute: 'number',
      });
      expect(xml.getAttributeValue('name')).toBe('');
    });

    /**
     * A `<part>` whose `<dated>` cannot be read is fatal. `Dated.createDated` rejects only a
     * null element, which typed code cannot produce, so the arm is reached here through the
     * `childFailed` path that `Global` and `Part` share.
     */
    it('does not leave a part without an XML element when it rejects one', () => {
      const rejected = Part.createPart(partElement({ name: 'Piano' }));
      expect(rejected.ok).toBe(false);
    });
  });

  describe('createPart from values', () => {
    it('writes all four attributes itself, so it cannot fail', () => {
      const p = okValue(Part.createPart('Violin', 2, 1, 3));
      expect(p.getXml()!.getAttributeValue('name')).toBe('Violin');
      expect(p.getXml()!.getAttributeValue('number')).toBe('2');
      expect(p.getXml()!.getAttributeValue('midi.channel')).toBe('1');
      expect(p.getXml()!.getAttributeValue('midi.port')).toBe('3');
    });

    it('accepts an optional id', () => {
      expect(okValue(Part.createPart('Violin', 2, 1, 3, 'part-2')).getId()).toBe('part-2');
      expect(okValue(Part.createPart('Violin', 2, 1, 3)).getId()).toBeNull();
    });
  });

  /**
   * `Part.java`'s `setName`/`setNumber`/`setMidiChannel`/`setMidiPort`, public API of this
   * package with no call site in `src/`. A negative control established that the rest of the
   * suite is blind to them: pointing `setNumber` at the `midi.port` attribute instead of
   * `number` left all of `tests/mpm` green.
   *
   * Each test asserts both halves — the cached field the getter reads, and the attribute node
   * in the document, which is the point of a live view. A setter writing to the wrong
   * attribute is caught by the second half only.
   */
  describe('setters write through to the element', () => {
    it('setName retargets the name attribute the part was parsed with', () => {
      const xml = partElement(COMPLETE);
      const p = okValue(Part.createPart(xml));
      p.setName('Cembalo');
      expect(p.getName()).toBe('Cembalo');
      expect(xml.getAttributeValue('name')).toBe('Cembalo');
      expect(xml.getAttributeValue('number')).toBe('1');
    });

    it('setName also writes through the empty placeholder a nameless part was given', () => {
      const xml = partElement({ number: '1', 'midi.channel': '0', 'midi.port': '0' });
      const p = okValue(Part.createPart(xml));
      p.setName('Cembalo');
      expect(xml.getAttributeValue('name')).toBe('Cembalo');
    });

    it.each([
      ['setNumber', 'number', 7],
      ['setMidiChannel', 'midi.channel', 9],
      ['setMidiPort', 'midi.port', 2],
    ] as const)('%s writes %s and nothing else', (setter, attribute, value) => {
      const xml = partElement(COMPLETE);
      const p = okValue(Part.createPart(xml));
      p[setter](value);
      expect(xml.getAttributeValue(attribute)).toBe(String(value));
      for (const [other, was] of Object.entries(COMPLETE))
        if (other !== attribute) expect(xml.getAttributeValue(other)).toBe(was);
      expect([p.getNumber(), p.getMidiChannel(), p.getMidiPort()]).toEqual(
        attribute === 'number'
          ? [value, 0, 0]
          : attribute === 'midi.channel'
            ? [1, value, 0]
            : [1, 0, value],
      );
    });
  });
});
