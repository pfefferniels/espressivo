import { describe, it, expect } from 'vitest';
import { parseMpmRoot, serializeMpmRoot } from '../../src/expression/mpmDocument.js';
import { environmentsOf, readPerformances } from '../../src/expression/mpmTree.js';
import {
  DYNAMICS_STYLE,
  IMPRECISION_MAP_TIMING,
  TEMPO_MAP,
  TEMPO_STYLE,
} from '../../src/mpm/names.js';
import {
  globalEnvironment,
  mpmDocument,
  partEnvironment,
  performanceDocument,
} from './rawFixtures.js';

const FULL = performanceDocument(
  globalEnvironment(
    '<tempoStyles><styleDef name="S"/></tempoStyles><dynamicsStyles><styleDef name="S"/></dynamicsStyles>',
    '<tempoMap><tempo date="0" bpm="120" beatLength="0.25"/></tempoMap>' +
      '<imprecisionMap.timing><distribution.uniform date="0"/></imprecisionMap.timing>',
  ) +
    partEnvironment('<dynamicsStyles><styleDef name="P"/></dynamicsStyles>', '<dynamicsMap/>') +
    partEnvironment('', '<articulationMap/>', 'B', 2),
);

describe('mpmTree', () => {
  describe('readPerformances', () => {
    it('reads performances in document order with their names', () => {
      const text = mpmDocument('<performance name="one"/><performance name="two"/>');
      expect(readPerformances(parseMpmRoot(text)).map((p) => [p.index, p.name])).toEqual([
        [0, 'one'],
        [1, 'two'],
      ]);
    });

    it('gives an unnamed performance the empty name rather than null', () => {
      expect(readPerformances(parseMpmRoot(mpmDocument('<performance/>')))[0].name).toBe('');
    });

    it('finds no performances in a document that has none', () => {
      expect(readPerformances(parseMpmRoot(mpmDocument('<metadata/>')))).toEqual([]);
    });

    it('scopes and indexes the environments', () => {
      const [performance] = readPerformances(parseMpmRoot(FULL));
      expect(environmentsOf(performance).map((e) => [e.scope, e.partIndex])).toEqual([
        ['global', null],
        ['part', 0],
        ['part', 1],
      ]);
    });
  });

  describe('maps', () => {
    it('indexes maps by element local name, imprecision domains included', () => {
      const [performance] = readPerformances(parseMpmRoot(FULL));
      expect([...performance.global.maps.keys()]).toEqual([TEMPO_MAP, IMPRECISION_MAP_TIMING]);
      expect(performance.global.maps.get(TEMPO_MAP)!.getLocalName()).toBe('tempoMap');
    });

    it('gives each part only the maps physically present in it', () => {
      const [performance] = readPerformances(parseMpmRoot(FULL));
      expect([...performance.parts[0].maps.keys()]).toEqual(['dynamicsMap']);
      expect([...performance.parts[1].maps.keys()]).toEqual(['articulationMap']);
    });

    it('keeps the LAST of two maps of the same type, and deletes neither', () => {
      // Dated.addMap removes the earlier map's element from the document (Dated.ts:93);
      // the view keeps the renderer's choice without performing the deletion.
      const text = performanceDocument(
        globalEnvironment('', '<tempoMap id="first"/><tempoMap id="second"/>'),
      );
      const root = parseMpmRoot(text);
      const [performance] = readPerformances(root);
      expect(performance.global.maps.get(TEMPO_MAP)!.getAttributeValue('id')).toBe('second');
      expect(serializeMpmRoot(root)).toContain('id="first"');
    });

    it('yields no maps when the environment has no <dated>, and appends none', () => {
      const text = performanceDocument('<global><header/></global>');
      const root = parseMpmRoot(text);
      const [performance] = readPerformances(root);
      expect(performance.global.dated).toBeNull();
      expect(performance.global.maps.size).toBe(0);
      expect(serializeMpmRoot(root)).not.toContain('dated');
    });
  });

  describe('style collections', () => {
    it('indexes collections by kind', () => {
      const [performance] = readPerformances(parseMpmRoot(FULL));
      expect([...performance.global.styleCollections.keys()]).toEqual([
        TEMPO_STYLE,
        DYNAMICS_STYLE,
      ]);
      expect([...performance.parts[0].styleCollections.keys()]).toEqual([DYNAMICS_STYLE]);
      expect(performance.parts[1].styleCollections.size).toBe(0);
    });

    it('discovers a collection by name shape, not by an allow-list', () => {
      // Header.parseData matches `contains(local-name(), 'Styles')` (Header.ts:75), which is
      // how a vendor-specific collection survives the parse.
      const text = performanceDocument(
        globalEnvironment('<vendorStyles><styleDef name="V"/></vendorStyles>', ''),
      );
      expect([...readPerformances(parseMpmRoot(text))[0].global.styleCollections.keys()]).toEqual([
        'vendorStyles',
      ]);
    });

    it('yields nothing when the environment has no <header>', () => {
      const text = performanceDocument('<global><dated/></global>');
      const [performance] = readPerformances(parseMpmRoot(text));
      expect(performance.global.header).toBeNull();
      expect(performance.global.styleCollections.size).toBe(0);
    });
  });

  describe('a performance without a <global>', () => {
    it('yields an empty global environment instead of throwing, and appends nothing', () => {
      const text = performanceDocument(partEnvironment('', '<dynamicsMap/>'));
      const root = parseMpmRoot(text);
      const [performance] = readPerformances(root);
      expect(performance.global.scope).toBe('global');
      expect(performance.global.maps.size).toBe(0);
      expect(performance.parts).toHaveLength(1);
      // Performance.parseData would have appended an empty <global> and a pulsesPerQuarter.
      expect(serializeMpmRoot(root)).not.toContain('<global');
      expect(serializeMpmRoot(root)).not.toContain('pulsesPerQuarter');
    });
  });
});
