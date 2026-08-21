/**
 * The comparison campaign's third-party fixtures. Three of them carry a UTF-8 BOM, which the
 * parser rejected outright before `4211f58` (PARITY.md §1, `CMP1`).
 *
 * The fixtures are byte-faithful on purpose. A synthetic BOM in a string literal tests the
 * strip; a real corpus file tests the strip and everything else the document happens to do —
 * single-quoted attributes, `ppq` 480, missing `xml:id`, whatever the authors actually wrote.
 * See `fixtures/PROVENANCE.md` for the licence and the do-not-reformat policy.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { canonicalMpm, listPerformances, type XmlText } from '../../src/api/index.js';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');
const mpm = (name: string) => readFileSync(join(FIXTURES, `${name}.mpm`), 'utf-8') as XmlText;

/** U+FEFF — what a UTF-8 BOM decodes to once the bytes have become a string. */
const BOM = '﻿';

/**
 * Every vendored MPM with the facts `PROVENANCE.md` records for it. `performances` is spelled
 * out rather than counted: the names are what a comparison report keys on, so a silent
 * reordering would otherwise pass.
 */
const FIXTURE_CORPUS = [
  {
    name: 'telemann-grave',
    bom: true,
    ppq: '720',
    performances: ['Baroque', 'Fast', 'Romantic'],
  },
  {
    name: 'vulpius-die-helle-sonn',
    bom: true,
    ppq: '480',
    performances: ['Baroque', 'Romantic', 'Amateur'],
  },
  {
    name: 'albert-du-mein-einzig-licht',
    bom: false,
    ppq: '720',
    performances: ['Axel Berndt', 'Like a robot'],
  },
  {
    name: 'bach-bwv1007-minuet2',
    bom: true,
    ppq: '480',
    performances: ['like Heinrich Schiff'],
  },
  { name: 'aller-augen', bom: false, ppq: '720', performances: ['My Performance'] },
  { name: 'minimal', bom: false, ppq: '720', performances: ['a performance'] },
] as const;

describe('comparison fixtures', () => {
  describe.each(FIXTURE_CORPUS)('$name', ({ name, bom, ppq, performances }) => {
    const text = mpm(name);

    it(`is byte-faithful: BOM ${bom ? 'present' : 'absent'} as vendored`, () => {
      // A BOM stripped or added on disk fails here rather than weakening the pin below.
      expect(text.startsWith(BOM)).toBe(bom);
    });

    it('parses and reports its performances, in document order', () => {
      expect(listPerformances(text).map((performance) => performance.name)).toEqual([
        ...performances,
      ]);
    });

    it('round-trips through the canonical serializer without a stray U+FEFF', () => {
      const canonical = canonicalMpm(text);
      expect(canonical).not.toContain(BOM);
      expect(canonical.length).toBeGreaterThan(0);
      // Idempotent after one application — the baseline the expression engine's identity
      // claims are made against (`expression/mpmDocument.ts`).
      expect(canonicalMpm(canonical as XmlText)).toBe(canonical);
    });

    it(`declares pulsesPerQuarter="${ppq}"`, () => {
      expect(canonicalMpm(text)).toContain(`pulsesPerQuarter="${ppq}"`);
    });
  });

  it('supplies at least two genuinely multi-performance documents', () => {
    // The reason for vendoring at all: nothing under tests/integration/fixtures/** has more
    // than one <performance>.
    const multi = FIXTURE_CORPUS.filter((fixture) => fixture.performances.length > 1);
    expect(multi.map((fixture) => fixture.name)).toEqual([
      'telemann-grave',
      'vulpius-die-helle-sonn',
      'albert-du-mein-einzig-licht',
    ]);
    expect(multi.every((fixture) => listPerformances(mpm(fixture.name)).length > 1)).toBe(true);
  });

  it('covers both tick grids the corpus uses', () => {
    // A comparison across these fixtures has to normalize ppq, so the corpus must actually
    // contain the disagreement.
    expect(new Set(FIXTURE_CORPUS.map((fixture) => fixture.ppq))).toEqual(new Set(['720', '480']));
  });

  it('still parses every fixture when the BOM is removed', () => {
    for (const { name, performances } of FIXTURE_CORPUS) {
      const text = mpm(name);
      // Sliced rather than regex-replaced: a literal U+FEFF inside a RegExp trips
      // `no-irregular-whitespace`.
      const stripped = (text.startsWith(BOM) ? text.slice(BOM.length) : text) as XmlText;
      expect(listPerformances(stripped).map((performance) => performance.name)).toEqual([
        ...performances,
      ]);
    }
  });
});
