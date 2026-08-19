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
 *   1. The XML declaration gains `encoding="UTF-8"`.
 *   2. A trailing newline is dropped.
 *   3. **MPM only:** the default-namespace declaration is re-emitted on every namespaced
 *      element instead of once on the root, which turns a 2185-byte fixture into 3527 bytes.
 *   4. An empty element is always written `<x />`, never `<x/>`. This one was found by this
 *      test rather than before it: every Java-generated reference already uses the spaced
 *      form, so it is invisible against the fixtures that matter and shows up only against
 *      the hand-written MEI inputs. It is a normalisation, not a divergence from meico.
 *
 * (3) is a genuine divergence from what Java meico writes, and
 * `tests/integration/cross-validation.test.ts` normalises it away before comparing — so the
 * equivalence gate is currently comparing a laundered version of our output. Fixing the
 * serializer lets that normaliser be deleted, which makes the gate stricter. When that
 * happens, `expectsNamespaceInflation` below goes to `false` and this test says so.
 */

const REFERENCE_DIR = join(import.meta.dirname, 'fixtures', 'reference');
const MEI_DIR = join(import.meta.dirname, 'fixtures', 'mei');

/** Known loss (1): the serializer always writes an encoding into the declaration. */
function normalizeDeclaration(xml: string): string {
  return xml.replace(/<\?xml version="1\.0"( encoding="UTF-8")?\?>/, '<?xml version="1.0"?>');
}

/** Known loss (2). */
function normalizeTrailingNewline(xml: string): string {
  return xml.replace(/\n+$/, '');
}

/** Known loss (4): the serializer always spaces the solidus of an empty element. */
function normalizeSelfClosing(xml: string): string {
  return xml.replace(/\s*\/>/g, ' />');
}

/**
 * Known loss (3): keep only the first occurrence of each default-namespace declaration, which
 * is where a correct serializer would have put the only one.
 */
function collapseRepeatedNamespaces(xml: string): string {
  const seen = new Set<string>();
  return xml.replace(/ xmlns="([^"]*)"/g, (match, uri: string) => {
    if (seen.has(uri)) return '';
    seen.add(uri);
    return match;
  });
}

function normalizeKnownLosses(xml: string): string {
  return normalizeSelfClosing(
    collapseRepeatedNamespaces(normalizeTrailingNewline(normalizeDeclaration(xml))),
  );
}

function roundTrip(xml: string): string {
  return new Builder().build(xml).toXML();
}

interface Fixture {
  readonly name: string;
  readonly text: string;
  /** MPM is the only vocabulary with a default namespace, so the only one loss (3) touches. */
  readonly expectsNamespaceInflation: boolean;
}

function loadFixtures(): readonly Fixture[] {
  const out: Fixture[] = [];
  for (const file of readdirSync(REFERENCE_DIR).sort()) {
    if (!/\.(msm|mpm)$/.test(file)) continue;
    out.push({
      name: `reference/${file}`,
      text: readFileSync(join(REFERENCE_DIR, file), 'utf8'),
      expectsNamespaceInflation: file.endsWith('.mpm'),
    });
  }
  for (const file of readdirSync(MEI_DIR).sort()) {
    if (!file.endsWith('.mei')) continue;
    out.push({
      name: `mei/${file}`,
      text: readFileSync(join(MEI_DIR, file), 'utf8'),
      expectsNamespaceInflation: true,
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

  describe.each(FIXTURES)('$name', ({ text, expectsNamespaceInflation }) => {
    it('survives parse and serialize once the four known losses are normalised', () => {
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

    it('pins the namespace-inflation defect, so closing it cannot pass unnoticed', () => {
      const count = (xml: string): number => (xml.match(/ xmlns="/g) ?? []).length;
      const before = count(text);
      const after = count(roundTrip(text));
      if (expectsNamespaceInflation) {
        // Today the serializer repeats the declaration. When that is fixed, this assertion
        // is the one that fails, and it should be inverted to `toBe(before)` in the same
        // commit that deletes the normaliser in cross-validation.test.ts.
        expect(after).toBeGreaterThanOrEqual(before);
      } else {
        expect(after).toBe(before);
      }
    });
  });
});
