import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { Mei } from '../../src/mei/Mei.js';
import { Mei2MsmMpmConverter } from '../../src/mei/Mei2MsmMpmConverter.js';

const __dirname2 = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(__dirname2, 'fixtures');
const MEI_DIR = join(FIXTURES, 'mei');
const REF_DIR = join(FIXTURES, 'reference');

/**
 * Normalize XML for comparison:
 * - Replace generated UUIDs (meico_xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx) with a placeholder
 * - Remove the metadata comment (contains filename and version which may differ)
 * - Normalize numeric formatting (Java doubles vs TS numbers)
 */
/**
 * Canonicalize generated meico UUIDs by first-occurrence order (UUID_1, UUID_2, ...)
 * so that random per-run ids compare equal while references to them
 * (e.g. goto/@target.id -> marker/@xml:id) remain verifiably isomorphic.
 */
function canonicalizeUuids(xml: string): string {
  const map = new Map<string, string>();
  return xml.replace(/meico_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, (m) => {
    if (!map.has(m)) map.set(m, `meico_UUID_${map.size + 1}`);
    return map.get(m)!;
  });
}

/**
 * What this comparison forgives, and why each one is not a blind spot.
 *
 * **A normaliser applied to BOTH sides can only ever hide a difference, never reveal one.** So
 * each entry here has to earn its place by naming something genuinely incomparable, and this
 * suite has been audited on exactly that basis. It carried five; **four** were hiding real
 * divergences from Java output and are gone:
 *
 * - a bare `.trim()` on the end of the chain, which was not in this list at all when the first
 *   four entries were audited — the audit checked the normalisers it could see. It forgave a
 *   missing trailing newline: all 32 Java reference documents end with one and this port's
 *   `Document.toXML` emitted none. Fixed in the serializer; removing the `.trim()` without
 *   that fix reds 32 tests, so it was load-bearing, and `xml-round-trip.test.ts` dropped a
 *   known loss at the same time.
 * - the default-namespace declaration, re-emitted on every namespaced element (fixed in
 *   `Element.toXML`; reinstating the defect now reds 64 tests)
 * - the XML declaration, hardcoded with `encoding="UTF-8"` where Java writes none (fixed in
 *   `Document.toXML`)
 * - the metadata `<comment>`, forgiven for a "version string differs" that does not differ —
 *   removing it changed nothing, so it was masking exactly zero. If the package version is
 *   ever bumped, that comment's text WILL change and this suite will red. That is correct:
 *   bumping the version does change generated output byte for byte, and the person doing it
 *   should see that rather than have it normalised away.
 *
 * What remains is genuinely incomparable, or genuinely open:
 *
 * - **generated UUIDs** — nondeterministic by construction, canonicalised by first-occurrence
 *   order rather than deleted, so `goto/@target.id` to `marker/@xml:id` wiring stays checkable
 * - **resource URIs** — file paths, which depend on where the fixture lives
 * - **`="720.0"` versus `="720"`** — a genuine difference in output, and an **accepted** one.
 *   Java's `Double.toString` keeps the fractional zero and JavaScript's `String(number)` does
 *   not. The repository owner decided (2026-08-20) that the shorter spelling is the better
 *   one: both parse to the same double, nothing downstream distinguishes them, and a
 *   Java-double formatter at every numeric write would add a layer to the whole output path to
 *   reproduce a difference nobody wants. So this line stays, and unlike the three deleted
 *   above it is not hiding anything — it forgives a difference that has been examined and
 *   accepted, which is what a normaliser is for. Removing it reds 24 of the 48 tests.
 *   PARITY.md carries the decision, and one latent case it does not cover: Java switches to
 *   scientific notation at `>= 1e7` where JavaScript waits until `1e21`, which no fixture
 *   reaches but a long score would.
 */
function normalizeXml(xml: string): string {
  return (
    canonicalizeUuids(xml)
      // Replace generated UUIDs in xml:id attributes
      .replace(
        /xml:id="[^"]*_meico_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"/g,
        'xml:id="UUID_PLACEHOLDER"',
      )
      // Normalize resource URIs (filenames may have paths)
      .replace(/uri="[^"]*\.(mei|msm|mpm)"/g, 'uri="NORMALIZED.$1"')
      // Normalize numeric formatting: "0.0" → "0", "720.0" → "720", "-5.0" → "-5" (Java uses doubles, TS uses numbers)
      .replace(/="(-?\d+)\.0"/g, '="$1"')
  );
}

// Discover test cases from MEI files
const meiFiles = readdirSync(MEI_DIR).filter((f) => f.endsWith('.mei'));

describe('Cross-validation: TypeScript port vs Java reference', () => {
  for (const meiFile of meiFiles) {
    const baseName = meiFile.replace('.mei', '');

    describe(baseName, () => {
      let actualMsms: any[];
      let actualMpms: any[];

      beforeAll(() => {
        const meiXml = readFileSync(join(MEI_DIR, meiFile), 'utf-8');
        const mei = Mei.fromXml(meiXml);
        mei.setFile(meiFile);
        const converter = new Mei2MsmMpmConverter(720, true, false, true);
        const result = converter.convert(mei);
        actualMsms = result.getKey();
        actualMpms = result.getValue();
      });

      it('should produce 1 MSM and 1 MPM', () => {
        expect(actualMsms.length).toBe(1);
        expect(actualMpms.length).toBe(1);
      });

      it('MSM output should match Java reference', () => {
        const refMsm = readFileSync(join(REF_DIR, `${baseName}.msm`), 'utf-8');
        const actualMsmXml = actualMsms[0].toXML();

        expect(normalizeXml(actualMsmXml)).toBe(normalizeXml(refMsm));
      });

      it('MPM output should match Java reference', () => {
        const refMpm = readFileSync(join(REF_DIR, `${baseName}.mpm`), 'utf-8');
        const actualMpmXml = actualMpms[0].toXML();

        expect(normalizeXml(actualMpmXml)).toBe(normalizeXml(refMpm));
      });
    });
  }
});
