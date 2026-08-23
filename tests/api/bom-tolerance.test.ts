/**
 * A UTF-8 byte-order mark must not change what any facade entry point produces.
 *
 * This is parity, not leniency. Java hands XOM bytes at every entry point (`XmlBase.java:99,162`,
 * `mei/Helper.java:1042,1061`) and XOM parses those through a SAX/Xerces `XMLReader`, for which
 * a leading `EF BB BF` is the UTF-8 encoding signature of XML 1.0 §4.3.3 / Appendix F: consumed
 * before the document entity begins, never content. This port parses a decoded string, so the
 * same bytes arrive as a U+FEFF character in front of the XML declaration and `@xmldom/xmldom`
 * rejects the document outright. The fix lives in `Builder.build` (`src/xml/XomTypes.ts`), the
 * one choke point `XmlBase` and the expression layer's raw parses pass through. Three of the six
 * encodings in the MPM format's own sample corpus carry a BOM.
 *
 * The assertion shape throughout is equality of a downstream product against the same input
 * without the mark — not merely "it parsed" — because a BOM that survived into the tree would
 * parse fine and corrupt the output.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  canonicalMpm,
  convertMeiToMsm,
  exaggerateMpm,
  listPerformances,
  performMsm,
  type XmlText,
} from '../../src/api/index.js';

/** U+FEFF — what a UTF-8 BOM decodes to once the bytes have become a string. */
const BOM = '﻿';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), '..', 'integration', 'fixtures');
const read = (...parts: string[]) => readFileSync(join(FIXTURES, ...parts), 'utf-8') as XmlText;

/** Tempo + dynamics only: no imprecision, no ornaments, so a render is deterministic. */
const SPANS_MPM = read('reference', 'tempo_dynamics_spans.mpm');
const SPANS_MSM = read('reference', 'tempo_dynamics_spans.msm');
const SIMPLE_MEI = read('mei', 'simple_notes.mei');

const withBom = (text: XmlText): XmlText => (BOM + text) as XmlText;

/**
 * Rewrite the `meico_<uuid>` ids the MEI converter draws to `generated-N` by first occurrence,
 * so two conversions of one document can be compared. They are the only thing that differs
 * between two runs.
 */
function canonicaliseGeneratedIds(xml: string): string {
  const seen = new Map<string, string>();
  return xml.replace(/meico_[0-9a-f-]{36}/g, (id) => {
    if (!seen.has(id)) seen.set(id, `generated-${seen.size + 1}`);
    return seen.get(id)!;
  });
}

describe('UTF-8 BOM tolerance at the facade', () => {
  describe('MPM', () => {
    it('canonicalMpm produces identical bytes with and without a BOM', () => {
      expect(canonicalMpm(withBom(SPANS_MPM))).toBe(canonicalMpm(SPANS_MPM));
    });

    it('listPerformances reports the same performances', () => {
      expect(listPerformances(withBom(SPANS_MPM))).toEqual(listPerformances(SPANS_MPM));
    });

    it('exaggerateMpm produces an identical document and report', () => {
      const options = { factors: { tempo: 1.5, dynamics: 1.5 } };
      expect(exaggerateMpm(withBom(SPANS_MPM), options)).toEqual(exaggerateMpm(SPANS_MPM, options));
    });

    it('leaves no U+FEFF anywhere in the output', () => {
      expect(canonicalMpm(withBom(SPANS_MPM))).not.toContain(BOM);
    });
  });

  describe('MSM', () => {
    it('performMsm renders identically whichever input carries the BOM', () => {
      const baseline = performMsm({ msm: SPANS_MSM, mpm: SPANS_MPM });

      expect(performMsm({ msm: withBom(SPANS_MSM), mpm: SPANS_MPM })).toBe(baseline);
      expect(performMsm({ msm: SPANS_MSM, mpm: withBom(SPANS_MPM) })).toBe(baseline);
      // Both at once: a BOM is a property of how a corpus was written out, not of one file.
      expect(performMsm({ msm: withBom(SPANS_MSM), mpm: withBom(SPANS_MPM) })).toBe(baseline);
    });
  });

  describe('MEI', () => {
    it('convertMeiToMsm produces an identical MSM', () => {
      const canonicalise = (documents: readonly { msm: XmlText }[]) =>
        documents.map((movement) => ({ msm: canonicaliseGeneratedIds(movement.msm) }));

      expect(canonicalise(convertMeiToMsm(withBom(SIMPLE_MEI)))).toEqual(
        canonicalise(convertMeiToMsm(SIMPLE_MEI)),
      );
    });
  });

  describe('the corpus spellings that co-occur with a BOM', () => {
    /**
     * Single-quoted attributes and a BOM travel together in the wild: 97 of the 121 files in
     * the "Measuring Early Records" corpus quote with apostrophes, and the BOM'd sample
     * encodings are hand-authored rather than serializer-written. Quoting is lexical and the
     * parser normalises it away, so the two spellings must agree byte for byte downstream.
     */
    const singleQuoted = ("<?xml version='1.0'?>\n" +
      "<mpm xmlns='http://www.cemfi.de/mpm/ns/1.0'>" +
      "<performance name='unknown performance' pulsesPerQuarter='720'>" +
      '<global><header/><dated>' +
      "<tempoMap><tempo date='0.0' bpm='72.0' beatLength='0.25'/></tempoMap>" +
      '</dated></global></performance></mpm>') as XmlText;

    const doubleQuoted = singleQuoted.replace(/'/g, '"') as XmlText;

    it('parses a BOM + single-quoted document to the same bytes as the double-quoted one', () => {
      expect(canonicalMpm(withBom(singleQuoted))).toBe(canonicalMpm(doubleQuoted));
    });

    it('reports the same performance list for both spellings', () => {
      expect(listPerformances(withBom(singleQuoted))).toEqual(listPerformances(doubleQuoted));
    });
  });
});
