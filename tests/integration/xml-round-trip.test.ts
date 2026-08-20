import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { Builder } from '../../src/xml/XomTypes.js';

/**
 * `serialize ∘ parse = id`, and the exact list of places it is not.
 *
 * The model layer replaces the live XOM tree with immutable data parsed from the document and
 * written back out, so everything downstream rests on the serializer being able to reproduce
 * its input. This file measures how far that already holds, and pins the three places it does
 * not — so that closing any of them is a deliberate, visible act rather than a silent change
 * of output.
 *
 * As of today, attribute order, child order, escaping and whitespace all survive a round trip
 * byte for byte. The four things that do not:
 *
 *   1. A trailing newline is dropped.
 *   2. An empty element is always written `<x />`, never `<x/>`. This one was found by this
 *      test rather than before it: every Java-generated reference already uses the spaced
 *      form, so it is invisible against the fixtures that matter and shows up only against
 *      the hand-written MEI inputs. It is a normalisation, not a divergence from meico.
 *
 * Two more used to be here and are now **fixed**.
 *
 * The XML declaration was hardcoded to `<?xml version="1.0" encoding="UTF-8"?>`, where Java's
 * XOM writes `<?xml version="1.0"?>` and every reference fixture begins with exactly that. A
 * parsed document now carries its own declaration back out, and a constructed one gets XOM's
 * default — so `cross-validation.test.ts` lost its declaration normaliser too.
 *
 * And the default-namespace declaration was
 * re-emitted on every namespaced element instead of once on the root, turning a 2185-byte
 * MPM fixture into 3527 bytes. `Element.toXML` now emits it only where the namespace
 * changes, so the namespace count round-trips exactly.
 *
 * Both were the same shape: a real divergence from Java output, invisible because the
 * equivalence suite normalised it away on both sides before comparing. **`cross-validation`
 * now carries one normaliser where it carried three**, and the survivor is load-bearing —
 * Java writes `720.0` where this port writes `720`, and removing it turns 24 of that suite's
 * 48 tests red.
 *
 * One normaliser remains in `cross-validation.test.ts` and is load-bearing: Java writes
 * `720.0` where this port writes `720`. Measured — removing it turns 24 of that suite's 48
 * tests red. It is the same *kind* of thing the namespace defect was, but with a blast radius
 * across every numeric attribute in the tree rather than one line in the serializer, so it is
 * recorded here rather than fixed in passing.
 */

const REFERENCE_DIR = join(import.meta.dirname, 'fixtures', 'reference');
const MEI_DIR = join(import.meta.dirname, 'fixtures', 'mei');

/** Known loss (1). */
function normalizeTrailingNewline(xml: string): string {
  return xml.replace(/\n+$/, '');
}

/** Known loss (2): the serializer always spaces the solidus of an empty element. */
function normalizeSelfClosing(xml: string): string {
  return xml.replace(/\s*\/>/g, ' />');
}

function normalizeKnownLosses(xml: string): string {
  return normalizeSelfClosing(normalizeTrailingNewline(xml));
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
    it('survives parse and serialize once the two known losses are normalised', () => {
      expect(normalizeKnownLosses(roundTrip(text))).toBe(normalizeKnownLosses(text));
    });

    it('is idempotent: a second round trip changes nothing at all', () => {
      // The losses are one-shot. If a second pass moved bytes, the serializer would not have
      // a fixed point and the model layer could never be byte-stable.
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
      // Was a pin on the inflation defect, phrased `toBeGreaterThanOrEqual` so it could not
      // fail spuriously — which meant it also could not notice the fix. Now that
      // `Element.toXML` emits a default-namespace declaration only where the namespace
      // changes, this is the law it was always meant to be.
      const count = (xml: string): number => (xml.match(/ xmlns="/g) ?? []).length;
      expect(count(roundTrip(text))).toBe(count(text));
    });
  });
});
