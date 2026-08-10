import { describe, it, expect } from 'vitest';
import { orderedEntries, styleNameAt, styleSwitchAt } from '../../src/expression/datedView.js';
import { parseMpmRoot, serializeMpmRoot } from '../../src/expression/mpmDocument.js';
import { GenericMap } from '../../src/mpm/elements/maps/GenericMap.js';
import { MPM_NAMESPACE } from '../../src/mpm/names.js';

/** A bare map document — the view is computed on the map element itself. */
function map(children: string): string {
  return `<tempoMap xmlns="${MPM_NAMESPACE}">${children}</tempoMap>`;
}

function viewIds(text: string): string[] {
  return orderedEntries(parseMpmRoot(text)).map((e) => e.element.getAttributeValue('id') ?? '?');
}

/**
 * The same map read through the real `GenericMap`, which is the behaviour the view exists to
 * reproduce. It is given its own parse because `GenericMap.parseData` REWRITES the tree it
 * is handed (`sortXml`, GenericMap.ts:157).
 */
function genericMapIds(text: string): string[] {
  const parsed = GenericMap.createGenericMap(parseMpmRoot(text));
  return parsed!.getAllElements().map((kv) => kv.getValue().getAttributeValue('id') ?? '?');
}

describe('datedView', () => {
  describe('orderedEntries', () => {
    it('sorts out-of-order children by @date', () => {
      expect(
        viewIds(map('<tempo id="c" date="2"/><tempo id="a" date="0"/><tempo id="b" date="1"/>')),
      ).toEqual(['a', 'b', 'c']);
    });

    it('keeps document order among equal dates', () => {
      expect(
        viewIds(map('<tempo id="a" date="0"/><tempo id="b" date="0"/><tempo id="c" date="0"/>')),
      ).toEqual(['a', 'b', 'c']);
    });

    it('interleaves an equal-dated late arrival after its equals, not before them', () => {
      expect(
        viewIds(map('<tempo id="a" date="0"/><tempo id="z" date="9"/><tempo id="b" date="0"/>')),
      ).toEqual(['a', 'b', 'z']);
    });

    it('excludes children without @date, and leaves them in the tree', () => {
      const text = map('<tempo id="a" date="1"/><tempo id="nodate"/><tempo id="b" date="0"/>');
      expect(viewIds(text)).toEqual(['b', 'a']);

      const root = parseMpmRoot(text);
      orderedEntries(root);
      // Position 1, exactly where the author put it — GenericMap's sortXml would have
      // stranded it at the end of the map.
      expect(root.getChildElements().get(1).getAttributeValue('id')).toBe('nodate');
    });

    it('excludes a <style> without @name.ref, and leaves it in the tree', () => {
      const text = map('<style id="s" date="0"/><tempo id="a" date="0"/>');
      expect(viewIds(text)).toEqual(['a']);
      expect(serializeMpmRoot(parseMpmRoot(text))).toContain('id="s" date="0" />');
    });

    it('puts a child whose @date does not parse at the front, as the insertion loop does', () => {
      // parseFloat('later') is NaN, every `date >= key` comparison against it is false, and
      // the loop therefore falls through to its initial index 0. A comparator-based sort
      // would not agree, and the placement decides which <style> is in scope after it.
      expect(
        viewIds(
          map('<tempo id="a" date="0"/><tempo id="nan" date="later"/><tempo id="b" date="1"/>'),
        ),
      ).toEqual(['nan', 'a', 'b']);
    });

    it('carries the document-order position, not the view position', () => {
      const entries = orderedEntries(
        parseMpmRoot(map('<tempo id="c" date="2"/><tempo id="a" date="0"/>')),
      );
      expect(entries.map((e) => e.documentIndex)).toEqual([1, 0]);
    });

    it('never mutates the document', () => {
      const text = map(
        '<tempo id="c" date="2"/>\n  <tempo id="nodate"/>\n  <tempo id="a" date="0"/>',
      );
      const root = parseMpmRoot(text);
      const before = serializeMpmRoot(root);
      orderedEntries(root);
      expect(serializeMpmRoot(root)).toBe(before);
    });

    it.each([
      ['already ordered', '<tempo id="a" date="0"/><tempo id="b" date="1"/>'],
      ['reversed', '<tempo id="b" date="1"/><tempo id="a" date="0"/>'],
      [
        'ties, a style and a dateless child',
        '<tempo id="c" date="2"/><tempo id="a" date="0"/><style id="s" date="0" name.ref="S"/>' +
          '<tempo id="nodate"/><tempo id="b" date="0"/><tempo id="d" date="3"/>',
      ],
      [
        'an unparseable date among the rest',
        '<tempo id="c" date="2"/><tempo id="a" date="0"/><tempo id="nan" date="later"/>' +
          '<tempo id="d" date="3"/>',
      ],
      ['a style without name.ref', '<style id="s" date="0"/><tempo id="a" date="0"/>'],
    ])('agrees with GenericMap.parseData: %s', (_label, children) => {
      const text = map(children);
      expect(viewIds(text)).toEqual(genericMapIds(text));
    });
  });

  describe('styleSwitchAt / styleNameAt', () => {
    const EQUAL_DATES = map(
      '<tempo id="before" date="0.0" bpm="f"/><style id="s" date="0.0" name.ref="MEI export"/>' +
        '<tempo id="after" date="0.0" bpm="f"/>',
    );

    it('gives an instruction BEFORE the switch no style, even at the same date', () => {
      // REVIEW-FINDINGS, "findStyleSwitchAt": positional scope, not date-based. getStyleAt
      // would hand this instruction the switch and resolve a different number.
      const entries = orderedEntries(parseMpmRoot(EQUAL_DATES));
      expect(entries.map((e) => e.element.getAttributeValue('id'))).toEqual([
        'before',
        's',
        'after',
      ]);
      expect(styleSwitchAt(entries, 0)).toBeNull();
      expect(styleNameAt(entries, 0)).toBeNull();
    });

    it('gives an instruction AFTER the switch that style', () => {
      const entries = orderedEntries(parseMpmRoot(EQUAL_DATES));
      expect(styleNameAt(entries, 2)).toBe('MEI export');
    });

    it('puts a switch in scope at its own position — the scan starts AT the index', () => {
      const entries = orderedEntries(parseMpmRoot(EQUAL_DATES));
      expect(styleNameAt(entries, 1)).toBe('MEI export');
    });

    it('takes the nearest preceding switch when several precede', () => {
      const entries = orderedEntries(
        parseMpmRoot(
          map(
            '<style date="0" name.ref="first"/><style date="1" name.ref="second"/>' +
              '<tempo id="a" date="2" bpm="120"/>',
          ),
        ),
      );
      expect(styleNameAt(entries, 2)).toBe('second');
    });

    it('distinguishes "no switch yet" from "a switch to nothing"', () => {
      const entries = orderedEntries(
        parseMpmRoot(map('<style date="0" name.ref=""/><tempo id="a" date="1" bpm="120"/>')),
      );
      expect(styleNameAt(entries, 1)).toBe('');
    });
  });
});
