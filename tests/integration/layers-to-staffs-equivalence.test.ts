/**
 * Equivalence suite for {@link Mei.layersToStaffs}, the pass that gives every MEI `layer`
 * its own MSM `part`.
 *
 * Same standard as `cross-validation.test.ts` — strict string equality of the MSM and MPM
 * against Java-generated ground truth, after the normalizations that absorb the two
 * implementations' serializer differences — and the same discovery rule: every
 * `fixtures/mei/*.mei` is driven, and a missing reference is a failure rather than a skip.
 *
 * The ground truth was generated from the Java fork (`meico@1d662105`) with upstream's
 * `Mei.layersToStaffs()` spliced in verbatim from cemfi/meico v0.11.14, since the pass
 * postdates the fork's v0.11.2 baseline. See PARITY.md §4.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { Mei } from '../../src/mei/Mei.js';
import { Mei2MsmMpmConverter } from '../../src/mei/Mei2MsmMpmConverter.js';
import type { Msm } from '../../src/msm/Msm.js';
import type { Mpm } from '../../src/mpm/Mpm.js';

const __dirname2 = dirname(fileURLToPath(import.meta.url));
const MEI_DIR = join(__dirname2, 'fixtures', 'mei');
// A sibling of `fixtures/`, not a child: CHARTER invariant 2 freezes `fixtures/**` against
// additions as well as edits, and `fixtures-v3/` set the precedent for a new reference set.
const REF_DIR = join(__dirname2, 'fixtures-layers-to-staffs');

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
 * Kept in step with `cross-validation.test.ts`'s function of the same name — which it had
 * stopped being.
 *
 * That suite shed four normalisers as the defects they were hiding got fixed: the XML
 * declaration hardcoded with `encoding="UTF-8"`, the default-namespace declaration re-emitted
 * on every namespaced element, a `<comment>` normaliser masking exactly zero, and a trailing
 * `.trim()` covering a missing final newline. This one kept all four, and its comment claiming
 * otherwise is how that went unnoticed.
 *
 * Measured before removing them: each of the four can be deleted on its own with all 48 tests
 * still green, and all four together likewise. They were masking nothing here either — the
 * serializer fixes reached this suite too, it just never dropped the scaffolding.
 *
 * What is left is what `cross-validation` kept, and for the same reasons: UUIDs canonicalised
 * by first-occurrence order rather than deleted, so `goto/@target.id` to `marker/@xml:id`
 * wiring stays checkable; resource URIs, which are file paths; and `="720.0"` versus `="720"`,
 * the one examined and accepted difference from Java's `Double.toString`.
 */
function normalizeXml(xml: string): string {
  return canonicalizeUuids(xml)
    .replace(
      /xml:id="[^"]*_meico_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"/g,
      'xml:id="UUID_PLACEHOLDER"',
    )
    .replace(/uri="[^"]*\.(mei|msm|mpm)"/g, 'uri="NORMALIZED.$1"')
    .replace(/="(-?\d+)\.0"/g, '="$1"');
}

const meiFiles = readdirSync(MEI_DIR).filter((f) => f.endsWith('.mei'));

describe('layersToStaffs: TypeScript port vs Java reference', () => {
  for (const meiFile of meiFiles) {
    const baseName = meiFile.replace('.mei', '');

    describe(baseName, () => {
      let msms: Msm[];
      let mpms: Mpm[];

      beforeAll(() => {
        const mei = Mei.fromXml(readFileSync(join(MEI_DIR, meiFile), 'utf-8'));
        mei.setFile(meiFile);
        mei.layersToStaffs();
        const result = new Mei2MsmMpmConverter(720, true, false, true).convert(mei);
        msms = result.getKey();
        mpms = result.getValue();
      });

      it('has a Java reference', () => {
        expect(existsSync(join(REF_DIR, `${baseName}.msm`))).toBe(true);
        expect(existsSync(join(REF_DIR, `${baseName}.mpm`))).toBe(true);
      });

      it('MSM matches the Java reference', () => {
        const ref = readFileSync(join(REF_DIR, `${baseName}.msm`), 'utf-8');
        expect(normalizeXml(msms[0].toXML())).toBe(normalizeXml(ref));
      });

      it('MPM matches the Java reference', () => {
        const ref = readFileSync(join(REF_DIR, `${baseName}.mpm`), 'utf-8');
        expect(normalizeXml(mpms[0].toXML())).toBe(normalizeXml(ref));
      });
    });
  }
});
