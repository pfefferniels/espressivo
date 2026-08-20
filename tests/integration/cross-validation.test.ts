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

function normalizeXml(xml: string): string {
  return (
    canonicalizeUuids(xml)
      // Remove metadata comment element (version string differs)
      .replace(/<comment>[^<]*<\/comment>/, '<comment>NORMALIZED</comment>')
      // Replace generated UUIDs in xml:id attributes
      .replace(
        /xml:id="[^"]*_meico_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"/g,
        'xml:id="UUID_PLACEHOLDER"',
      )
      // Normalize resource URIs (filenames may have paths)
      .replace(/uri="[^"]*\.(mei|msm|mpm)"/g, 'uri="NORMALIZED.$1"')
      // Normalize numeric formatting: "0.0" → "0", "720.0" → "720", "-5.0" → "-5" (Java uses doubles, TS uses numbers)
      .replace(/="(-?\d+)\.0"/g, '="$1"')
      // Trim
      .trim()
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
