import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { Builder } from '../../src/xml/XomTypes.js';

/**
 * `serialize ∘ parse = id`, and the exact list of places it is not.
 *
 * The model layer replaces the live XOM tree with immutable data parsed from the document and
 * written back out, so everything downstream rests on the serializer being able to reproduce
 * its input. This file measures how far that holds, and pins the place it does not — so that
 * closing it is a deliberate, visible act rather than a silent change of output.
 *
 * Attribute order, child order, escaping, whitespace and the trailing newline all survive a
 * round trip byte for byte. One thing does not: an empty element is always written `<x />`,
 * never `<x/>`. Every Java-generated reference already uses the spaced form, so it is
 * invisible against the fixtures that matter and shows up only against the hand-written MEI
 * inputs. It is a normalisation, not a divergence from meico.
 *
 * Measured, and the conclusion is that it should stay. The corpus splits perfectly: all 295
 * empty elements across the 16 hand-written MEI inputs are `<x/>`, and all 1435 across the 72
 * Java-generated reference documents are `<x />`. Nothing writes both, so the normaliser is
 * absorbing an ambiguity rather than laundering a one-sided defect.
 *
 * The experiment: give `Element` a flag set by `Element.wrap`, so that an element that came out
 * of the parser serializes `<x/>` and a constructed one keeps `<x />`. `npm run gate` stays
 * green and every integration equivalence suite stays green — no MEI element's spacing leaks
 * into a Java-compared output. But 12 unit tests across 5 files go red on hard-coded ` />` in
 * expected strings, and with `normalizeSelfClosing` removed the loss changes sides: 32
 * reference documents fail where 16 MEI fixtures failed before. The DOM records no
 * per-element memory of how the source spelled the tag, so no flag derived from it can be
 * right for both corpora; only re-scanning the source text against a position locator could
 * be, and that is a lot of machinery for a space.
 *
 * And the direction of travel is wrong. XOM's own element model has no such memory either, so
 * Java's `Mei.writeMei()` on these same inputs emits ` />` too — the normalisation is meico's,
 * faithfully reproduced. (Inferred, not run: the corpus contains no Java-produced MEI to check
 * it against, only MSM and MPM.) Closing this would make `serialize ∘ parse = id` exact and
 * make the port less like the thing it is a port of. Left alone deliberately.
 */

const REFERENCE_DIR = join(import.meta.dirname, 'fixtures', 'reference');
const MEI_DIR = join(import.meta.dirname, 'fixtures', 'mei');

/** The one remaining known loss: the serializer always spaces the solidus of an empty element. */
function normalizeSelfClosing(xml: string): string {
  return xml.replace(/\s*\/>/g, ' />');
}

function normalizeKnownLosses(xml: string): string {
  return normalizeSelfClosing(xml);
}

function roundTrip(xml: string): string {
  return new Builder().build(xml).toXML();
}

interface Fixture {
  readonly name: string;
  readonly text: string;
}

function loadFixtures(): readonly Fixture[] {
  const out: Fixture[] = [];
  for (const file of readdirSync(REFERENCE_DIR).sort()) {
    if (!/\.(msm|mpm)$/.test(file)) continue;
    out.push({
      name: `reference/${file}`,
      text: readFileSync(join(REFERENCE_DIR, file), 'utf8'),
    });
  }
  for (const file of readdirSync(MEI_DIR).sort()) {
    if (!file.endsWith('.mei')) continue;
    out.push({
      name: `mei/${file}`,
      text: readFileSync(join(MEI_DIR, file), 'utf8'),
    });
  }
  return out;
}

const FIXTURES = loadFixtures();

describe('XML round trip', () => {
  it('auto-discovers the fixture corpus, so a new fixture is covered without editing this file', () => {
    // A missing corpus must be a failure rather than a silently empty suite.
    expect(FIXTURES.length).toBeGreaterThanOrEqual(40);
  });

  describe.each(FIXTURES)('$name', ({ text }) => {
    it('survives parse and serialize once the one known loss is normalised', () => {
      expect(normalizeKnownLosses(roundTrip(text))).toBe(normalizeKnownLosses(text));
    });

    it('is idempotent: a second round trip changes nothing at all', () => {
      // The losses are one-shot: without a fixed point here the model layer could never be
      // byte-stable.
      const once = roundTrip(text);
      expect(roundTrip(once)).toBe(once);
    });

    it('preserves attribute order exactly, with no normalisation', () => {
      const attributeRuns = (xml: string): readonly string[] =>
        [...xml.matchAll(/<[a-zA-Z][^>]*>/g)].map((m) =>
          [...m[0].matchAll(/([a-zA-Z_:][\w.:-]*)=/g)].map((a) => a[1]).join(','),
        );
      // The namespace declaration is the one attribute the serializer adds, so it is dropped
      // from both sides before comparing the order of the rest.
      const withoutXmlns = (runs: readonly string[]): readonly string[] =>
        runs.map((r) =>
          r
            .split(',')
            .filter((a) => a !== 'xmlns')
            .join(','),
        );
      expect(withoutXmlns(attributeRuns(roundTrip(text)))).toEqual(
        withoutXmlns(attributeRuns(text)),
      );
    });

    it('declares each namespace exactly as often as the source did', () => {
      // `Element.toXML` emits a default-namespace declaration only where the namespace
      // changes, so the count round-trips exactly rather than inflating per element.
      const count = (xml: string): number => (xml.match(/ xmlns="/g) ?? []).length;
      expect(count(roundTrip(text))).toBe(count(text));
    });
  });
});
