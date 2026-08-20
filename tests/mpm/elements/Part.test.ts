import { describe, it, expect } from 'vitest';
import { errOf, okValue } from '../../support/result.js';
import { Part } from '../../../src/mpm/elements/Part.js';
import { Mpm } from '../../../src/mpm/Mpm.js';
import { Element, Attribute } from '../../../src/xml/XomTypes.js';

/**
 * Reference: meico/src/meico/mpm/elements/Part.java
 *
 * **Why this file is new.** `Part.createPart` has three required attributes and threw a
 * distinct message for each; every one of those three throws was caught by the factory,
 * printed, and flattened onto one `null`. Nothing in the suite reached any of them — the 20
 * existing `createPart` call sites all use the four-argument from-scratch form, which writes
 * all three itself and cannot fail. So the three rejections had no test at all, and the
 * conversion to `Result` could have dropped any of them silently.
 *
 * `src/comparison/parts.ts` documents its behaviour in terms of exactly this rejection
 * ("`number` missing or empty, `Part.createPart` turns that into null"), so it is a fact
 * another module depends on and it should not have been unpinned.
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

    // The three rejections, each naming which attribute was at fault. Before the conversion
    // all three produced the same `null` plus one line on stderr, so a caller could not tell
    // them apart and neither could a test.
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
      expect(errOf(Part.createPart(null as unknown as Element))).toEqual({
        kind: 'noElement',
        what: 'Part',
      });
    });

    /**
     * The one observable side effect of a rejected part, pinned so it cannot drift.
     *
     * `readFrom` writes `name=""` onto the caller's element **before** it validates `number`,
     * so a `<part>` with neither comes back mutated and still fails. That ordering is the
     * incumbent's, it is visible from outside, and the tidy fix — validate everything, then
     * mutate — would change what a caller's document looks like after a failed parse.
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
     * A `<part>` whose `<dated>` cannot be read is fatal; the reason travels with it.
     *
     * `Dated.createDated` rejects only a null element, which typed code cannot produce, so
     * the arm is reached here through the `childFailed` path that `Global` and `Part` share
     * and which nothing else in the suite covers.
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
});
