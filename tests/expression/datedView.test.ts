import { describe, it, expect } from 'vitest';
import { okValue } from '../support/result.js';
import {
  orderedEntries,
  styleNameAt,
  styleNamesOf,
  styleSwitchAt,
} from '../../src/expression/datedView.js';
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
  const parsed = okValue(GenericMap.createGenericMap(parseMpmRoot(text)));
  return parsed.getAllElements().map((kv) => kv.getValue().getAttributeValue('id') ?? '?');
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

  describe('styleNamesOf', () => {
    /**
     * `styleNamesOf` is `styleNameAt` for every position in one forward pass — a `scanl`
     * where the caller (`readScopeMapViews`) used to run the per-index backwards scan once
     * per index, quadratically. Its whole contract is that it answers what the per-index
     * function answers, so that is what is asserted: element-for-element agreement, over
     * every case the block above establishes separately.
     *
     * The `+ 1` inside is where an off-by-one would live — `scanl` is seed-first, so the
     * state for position `i` is `states[i + 1]`. These cases are chosen to catch a slip in
     * either direction: `before` must NOT see the switch that shares its date, `s` and
     * `after` must.
     */
    const cases: readonly (readonly [string, string])[] = [
      ['no styles at all', '<tempo id="a" date="0" bpm="120"/><tempo id="b" date="1" bpm="130"/>'],
      [
        'a switch between two instructions',
        '<tempo id="a" date="0" bpm="120"/><style date="1" name.ref="s1"/><tempo id="b" date="2" bpm="130"/>',
      ],
      [
        'co-dated switch — positional scope',
        '<tempo id="before" date="0.0" bpm="f"/><style id="s" date="0.0" name.ref="MEI export"/>' +
          '<tempo id="after" date="0.0" bpm="f"/>',
      ],
      [
        'several switches, nearest preceding wins',
        '<style date="0" name.ref="first"/><style date="1" name.ref="second"/>' +
          '<tempo id="a" date="2" bpm="120"/>',
      ],
      [
        'a switch to nothing, which is not "no switch yet"',
        '<style date="0" name.ref=""/><tempo id="a" date="1" bpm="120"/>',
      ],
      ['a map with a single instruction', '<tempo id="a" date="0" bpm="120"/>'],
    ];

    it.each(cases)('agrees with styleNameAt at every index: %s', (_label, children) => {
      const entries = orderedEntries(parseMpmRoot(map(children)));
      expect(entries.length).toBeGreaterThan(0);
      expect(styleNamesOf(entries)).toEqual(
        entries.map((_entry, index) => styleNameAt(entries, index)),
      );
    });

    it('answers an empty view with an empty list, reading no state', () => {
      expect(styleNamesOf(orderedEntries(parseMpmRoot(map(''))))).toEqual([]);
    });

    it('keeps "no switch yet" as null rather than collapsing it to the empty string', () => {
      // The two absences the per-index docstring insists stay distinguishable, now across
      // the whole array: index 0 has no switch, index 1 has a switch to nothing.
      const entries = orderedEntries(
        parseMpmRoot(map('<tempo id="a" date="0" bpm="120"/><style date="1" name.ref=""/>')),
      );
      expect(styleNamesOf(entries)).toEqual([null, '']);
    });
  });
});
