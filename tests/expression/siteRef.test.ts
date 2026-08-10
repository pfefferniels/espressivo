import { describe, it, expect } from 'vitest';
import { orderedEntries, styleNameAt } from '../../src/expression/datedView.js';
import { parseMpmRoot } from '../../src/expression/mpmDocument.js';
import { readPerformances } from '../../src/expression/mpmTree.js';
import {
  defContainerLabel,
  defSiteRef,
  instructionSiteRef,
  siteRefOf,
  type SiteRef,
} from '../../src/expression/siteRef.js';
import { resolveLevel } from '../../src/expression/styleScope.js';
import { DYNAMICS_MAP, DYNAMICS_STYLE } from '../../src/mpm/names.js';
import { globalEnvironment, partEnvironment, performanceDocument } from './rawFixtures.js';

const STYLES =
  '<dynamicsStyles><styleDef name="MEI export">' +
  '<dynamicsDef name="p" value="48"/><dynamicsDef name="f" value="97"/>' +
  '</styleDef></dynamicsStyles>';

/** An out-of-order map, so document order and view order are provably different. */
const DOCUMENT = performanceDocument(
  globalEnvironment(
    STYLES,
    '<dynamicsMap>' +
      '<dynamics xml:id="late" date="2.0" volume="97"/>' +
      '<style date="0.0" name.ref="MEI export"/>' +
      '<dynamics date="1.0" volume="p"/>' +
      '</dynamicsMap>',
  ),
);

/** Every `<dynamics>` of the global dynamicsMap, as (entry, view index) pairs. */
function instructions(text: string) {
  const performance = readPerformances(parseMpmRoot(text))[0];
  const map = performance.global.maps.get(DYNAMICS_MAP)!;
  const entries = orderedEntries(map);
  return {
    performance,
    entries,
    dynamics: entries
      .map((entry, index) => ({ entry, index }))
      .filter(({ entry }) => entry.element.getLocalName() === 'dynamics'),
  };
}

describe('siteRef', () => {
  describe('instructionSiteRef', () => {
    it('locates a site by DOCUMENT order, not by the date-stable view order', () => {
      const { performance, dynamics } = instructions(DOCUMENT);
      // View order is style(0.0), dynamics(1.0), dynamics(2.0); document order puts the
      // 2.0 instruction first. The locator has to name the file, not the reading.
      expect(dynamics.map(({ index }) => index)).toEqual([1, 2]);
      expect(
        dynamics.map(
          ({ entry }) =>
            instructionSiteRef(performance.global, DYNAMICS_MAP, entry, 'volume').index,
        ),
      ).toEqual([2, 0]);
    });

    it('fills every field of DESIGN §4', () => {
      const { performance, dynamics } = instructions(DOCUMENT);
      const site = instructionSiteRef(
        performance.global,
        DYNAMICS_MAP,
        dynamics[1].entry,
        'volume',
      );
      expect(site).toEqual<SiteRef>({
        scope: 'global',
        partIndex: null,
        container: 'dynamicsMap',
        date: 2,
        index: 0,
        attribute: 'volume',
        xmlId: 'late',
      });
    });

    it('reports a null xmlId when the element carries none', () => {
      const { performance, dynamics } = instructions(DOCUMENT);
      expect(
        instructionSiteRef(performance.global, DYNAMICS_MAP, dynamics[0].entry, 'volume').xmlId,
      ).toBeNull();
    });

    it('reports a non-finite @date as null, never as NaN', () => {
      // RULE N4: every numeric field of a report is finite or null.
      const text = performanceDocument(
        globalEnvironment('', '<dynamicsMap><dynamics date="later" volume="97"/></dynamicsMap>'),
      );
      const { performance, dynamics } = instructions(text);
      expect(
        instructionSiteRef(performance.global, DYNAMICS_MAP, dynamics[0].entry, 'volume').date,
      ).toBeNull();
    });

    it('carries the part scope and index for a part site', () => {
      const text = performanceDocument(
        globalEnvironment(STYLES, '') +
          partEnvironment(
            '',
            '<dynamicsMap><dynamics date="0.0" volume="97"/></dynamicsMap>',
            'A',
            1,
          ) +
          partEnvironment(
            '',
            '<dynamicsMap><dynamics date="0.0" volume="48"/></dynamicsMap>',
            'B',
            2,
          ),
      );
      const performance = readPerformances(parseMpmRoot(text))[0];
      const part = performance.parts[1];
      const entry = orderedEntries(part.maps.get(DYNAMICS_MAP)!)[0];
      expect(instructionSiteRef(part, DYNAMICS_MAP, entry, 'volume')).toMatchObject({
        scope: 'part',
        partIndex: 1,
      });
    });

    it('is stable across two independent parses of the same text', () => {
      const first = instructions(DOCUMENT);
      const second = instructions(DOCUMENT);
      expect(
        first.dynamics.map(({ entry }) =>
          instructionSiteRef(first.performance.global, DYNAMICS_MAP, entry, 'volume'),
        ),
      ).toEqual(
        second.dynamics.map(({ entry }) =>
          instructionSiteRef(second.performance.global, DYNAMICS_MAP, entry, 'volume'),
        ),
      );
    });

    it('is plain data — no XOM node reaches the report', () => {
      const { performance, dynamics } = instructions(DOCUMENT);
      const site = instructionSiteRef(
        performance.global,
        DYNAMICS_MAP,
        dynamics[0].entry,
        'volume',
      );
      expect(structuredClone(site)).toEqual(site);
    });
  });

  describe('defSiteRef', () => {
    it('labels the container as collection/styleDef and indexes among the defs', () => {
      const { performance, entries, dynamics } = instructions(DOCUMENT);
      const reading = resolveLevel(
        dynamics[0].entry.element.getAttributeValue('volume')!,
        'dynamics',
        styleNameAt(entries, dynamics[0].index),
        performance.global,
        performance.global,
      );
      expect(reading.kind).toBe('def');
      if (reading.kind !== 'def') return;

      expect(
        defSiteRef(reading.environment, DYNAMICS_STYLE, reading.styleDef, reading.def, 'value'),
      ).toEqual<SiteRef>({
        scope: 'global',
        partIndex: null,
        container: 'dynamicsStyles/MEI export',
        date: null,
        index: 0,
        attribute: 'value',
        xmlId: null,
      });
    });

    it('builds the label from the parts', () => {
      expect(defContainerLabel(DYNAMICS_STYLE, 'MEI export')).toBe('dynamicsStyles/MEI export');
    });
  });

  describe('siteRefOf', () => {
    it('locates an arbitrary child of a container the caller holds', () => {
      const text = performanceDocument(
        globalEnvironment(
          '',
          '<imprecisionMap.timing><distribution.uniform xml:id="d1" date="0.0" limit.lower="-1" limit.upper="1"/></imprecisionMap.timing>',
        ),
      );
      const performance = readPerformances(parseMpmRoot(text))[0];
      const map = performance.global.maps.get('imprecisionMap.timing')!;
      const distribution = map.getChildElements().get(0);
      expect(
        siteRefOf(performance.global, 'imprecisionMap.timing', map, distribution, 'limit.upper'),
      ).toEqual<SiteRef>({
        scope: 'global',
        partIndex: null,
        container: 'imprecisionMap.timing',
        date: 0,
        index: 0,
        attribute: 'limit.upper',
        xmlId: 'd1',
      });
    });

    it('reports -1 rather than throwing when the element is not in the container', () => {
      const performance = readPerformances(parseMpmRoot(DOCUMENT))[0];
      const map = performance.global.maps.get(DYNAMICS_MAP)!;
      const collection = performance.global.styleCollections.get(DYNAMICS_STYLE)!;
      expect(siteRefOf(performance.global, 'dynamicsMap', map, collection, 'name').index).toBe(-1);
    });
  });
});
