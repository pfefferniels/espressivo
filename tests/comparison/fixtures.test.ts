/**
 * The comparison campaign's third-party fixtures, pinned at the level the public API can
 * currently reach.
 *
 * No comparison engine exists yet, so this asserts only what is already assertable: that every
 * vendored document parses through the facade, and that the performances the corpus advertises
 * are the performances the parser finds. That is not a placeholder — it is the property the
 * rest of the campaign depends on, and it was false until `4211f58`: three of these files carry
 * a UTF-8 BOM and were rejected outright before that commit (PARITY.md §1, `CMP1`).
 *
 * Keeping the fixtures byte-faithful is what gives this file its value. A synthetic BOM in a
 * string literal tests the strip; a real corpus file tests the strip *and* everything else the
 * document happens to do — single-quoted attributes, `ppq` 480, missing `xml:id`, whatever the
 * authors actually wrote. See `fixtures/PROVENANCE.md` for the licence and the
 * do-not-reformat policy.
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
 * Every vendored MPM with the facts `PROVENANCE.md` records for it.
 *
 * `performances` is spelled out in full rather than counted, because the names are the thing a
 * comparison report will key on and a silent reordering would otherwise pass.
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
      // Guards the PROVENANCE policy itself. If someone strips or adds a BOM on disk, this
      // fails here rather than silently weakening the regression pin below.
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
      // Idempotent after one application — the same baseline property the expression engine's
      // identity claims are made against (`expression/mpmDocument.ts`).
      expect(canonicalMpm(canonical as XmlText)).toBe(canonical);
    });

    it(`declares pulsesPerQuarter="${ppq}"`, () => {
      expect(canonicalMpm(text)).toContain(`pulsesPerQuarter="${ppq}"`);
    });
  });

  it('supplies at least two genuinely multi-performance documents', () => {
    // The campaign's reason for vendoring at all: nothing under
    // tests/integration/fixtures/** has more than one <performance>.
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
    // contain the disagreement rather than only being said to.
    expect(new Set(FIXTURE_CORPUS.map((fixture) => fixture.ppq))).toEqual(new Set(['720', '480']));
  });

  it('still parses every fixture when the BOM is removed', () => {
    // Tolerance, not dependence: the strip must be a no-op for documents that never had one.
    for (const { name, performances } of FIXTURE_CORPUS) {
      const text = mpm(name);
      // Sliced rather than regex-replaced: a literal U+FEFF inside a RegExp trips
      // `no-irregular-whitespace`, and this also mirrors the implementation under test.
      const stripped = (text.startsWith(BOM) ? text.slice(BOM.length) : text) as XmlText;
      expect(listPerformances(stripped).map((performance) => performance.name)).toEqual([
        ...performances,
      ]);
    }
  });
});
