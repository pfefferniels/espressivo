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
 * A normaliser applied to both sides can only ever hide a difference, never reveal one, so
 * each entry has to earn its place by naming something genuinely incomparable:
 *
 * - generated UUIDs — nondeterministic by construction, canonicalised by first-occurrence
 *   order rather than deleted, so `goto/@target.id` to `marker/@xml:id` wiring stays checkable
 * - resource URIs — file paths, which depend on where the fixture lives
 * - `="720.0"` versus `="720"` — a genuine difference in output, and an accepted one. Java's
 *   `Double.toString` keeps the fractional zero and JavaScript's `String(number)` does not.
 *   The repository owner decided (2026-08-20) that the shorter spelling is the better one:
 *   both parse to the same double, nothing downstream distinguishes them, and a Java-double
 *   formatter at every numeric write would add a layer to the whole output path to reproduce
 *   a difference nobody wants. Removing this line reds 24 of the 48 tests. PARITY.md carries
 *   the decision, and one latent case it does not cover: Java switches to scientific notation
 *   at `>= 1e7` where JavaScript waits until `1e21`, which no fixture reaches but a long score
 *   would.
 *
 * The metadata `<comment>` is not forgiven. If the package version is bumped its text changes
 * and this suite reds, which is correct: the bump does change generated output byte for byte,
 * and the person doing it should see that rather than have it normalised away.
 */
function normalizeXml(xml: string): string {
  return (
    canonicalizeUuids(xml)
      .replace(
        /xml:id="[^"]*_meico_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"/g,
        'xml:id="UUID_PLACEHOLDER"',
      )
      .replace(/uri="[^"]*\.(mei|msm|mpm)"/g, 'uri="NORMALIZED.$1"')
      // "0.0" → "0", "720.0" → "720", "-5.0" → "-5"
      .replace(/="(-?\d+)\.0"/g, '="$1"')
  );
}

const meiFiles = readdirSync(MEI_DIR).filter((f) => f.endsWith('.mei'));

describe('Cross-validation: TypeScript port vs Java reference', () => {
  for (const meiFile of meiFiles) {
    const baseName = meiFile.replace('.mei', '');

    describe(baseName, () => {
      let actualMsms: any[];

      beforeAll(() => {
        const meiXml = readFileSync(join(MEI_DIR, meiFile), 'utf-8');
        const mei = Mei.fromXml(meiXml);
        mei.setFile(meiFile);
        actualMsms = new Mei2MsmMpmConverter(720, true, false, true).convert(mei);
      });

      it('should produce 1 MSM', () => {
        expect(actualMsms.length).toBe(1);
      });

      it('MSM output should match Java reference', () => {
        const refMsm = readFileSync(join(REF_DIR, `${baseName}.msm`), 'utf-8');
        const actualMsmXml = actualMsms[0].toXML();

        expect(normalizeXml(actualMsmXml)).toBe(normalizeXml(refMsm));
      });
    });
  }
});
