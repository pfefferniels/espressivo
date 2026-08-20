/**
 * Full XML equivalence test: compares the COMPLETE augmented MSM output
 * (all elements, all attributes, all maps) between TypeScript and Java reference.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { Mei } from '../../src/mei/Mei.js';
import { Mei2MsmMpmConverter } from '../../src/mei/Mei2MsmMpmConverter.js';
import { Msm } from '../../src/msm/Msm.js';
import { Mpm } from '../../src/mpm/Mpm.js';
import { Performance } from '../../src/mpm/elements/Performance.js';

const __dirname2 = dirname(fileURLToPath(import.meta.url));
const MEI_DIR = join(__dirname2, 'fixtures', 'mei');
const PERF_REF_DIR = join(__dirname2, 'fixtures', 'performance-reference');

interface ParsedAttr {
  name: string;
  value: string;
}
interface ParsedElement {
  tag: string;
  attrs: ParsedAttr[];
  children: ParsedElement[];
  text: string;
}

/**
 * Minimal XML parser that extracts elements and attributes from XML string.
 * Good enough for MSM XML which is straightforward single-line XML.
 */
function parseXml(xml: string): ParsedElement {
  xml = xml.replace(/<\?xml[^?]*\?>/, '').trim();
  let pos = 0;

  function skipWhitespace() {
    while (pos < xml.length && /\s/.test(xml[pos])) pos++;
  }

  function parseElement(): ParsedElement {
    skipWhitespace();
    if (xml[pos] !== '<')
      throw new Error(`Expected '<' at pos ${pos}: ${xml.substring(pos, pos + 20)}`);
    pos++; // skip <
    let tag = '';
    while (pos < xml.length && !/[\s/>]/.test(xml[pos])) tag += xml[pos++];

    const attrs: ParsedAttr[] = [];
    const children: ParsedElement[] = [];
    let text = '';

    // parse attributes
    while (pos < xml.length) {
      skipWhitespace();
      if (xml[pos] === '/' && xml[pos + 1] === '>') {
        pos += 2;
        return { tag, attrs, children, text };
      }
      if (xml[pos] === '>') {
        pos++;
        break;
      }
      // parse attribute
      let name = '';
      while (pos < xml.length && xml[pos] !== '=') name += xml[pos++];
      name = name.trim();
      pos++; // skip =
      const quote = xml[pos++]; // skip opening quote
      let value = '';
      while (pos < xml.length && xml[pos] !== quote) value += xml[pos++];
      pos++; // skip closing quote
      attrs.push({ name, value });
    }

    // parse children and text
    while (pos < xml.length) {
      skipWhitespace();
      if (xml[pos] === '<' && xml[pos + 1] === '/') {
        // closing tag
        pos += 2;
        while (pos < xml.length && xml[pos] !== '>') pos++;
        pos++; // skip >
        break;
      }
      if (xml[pos] === '<') {
        children.push(parseElement());
      } else {
        while (pos < xml.length && xml[pos] !== '<') text += xml[pos++];
      }
    }
    return { tag, attrs, children, text };
  }

  return parseElement();
}

/**
 * Normalize a numeric value for comparison.
 * Java uses doubles ("60.0"), TS may use "60". We compare as numbers.
 */
function normalizeNumericValue(v: string): number | null {
  const n = parseFloat(v);
  return isNaN(n) ? null : n;
}

/** Attributes to skip in comparison (implementation-specific or random) */
const SKIP_ATTRS = new Set([
  'xml:id', // UUIDs may differ
  'uri', // file paths
  'file', // file paths
]);

/** Attributes whose values are random (imprecision) — skip value comparison */
const RANDOM_ATTRS = new Set(['tuning.offset']);

/**
 * Compare two parsed elements recursively, reporting all differences.
 */
function compareElements(
  tsEl: ParsedElement,
  refEl: ParsedElement,
  path: string,
  diffs: string[],
  tolerance = 0.001,
): void {
  // Compare tag
  if (tsEl.tag !== refEl.tag) {
    diffs.push(`${path}: tag mismatch: TS="${tsEl.tag}" vs Java="${refEl.tag}"`);
    return;
  }

  const fullPath = `${path}/${tsEl.tag}`;

  // Compare attributes
  const tsAttrMap = new Map(tsEl.attrs.map((a) => [a.name, a.value]));
  const refAttrMap = new Map(refEl.attrs.map((a) => [a.name, a.value]));

  // Check all reference attributes exist in TS
  for (const [name, refValue] of refAttrMap) {
    if (SKIP_ATTRS.has(name)) continue;
    if (RANDOM_ATTRS.has(name)) continue;

    const tsValue = tsAttrMap.get(name);
    if (tsValue === undefined) {
      // Some attributes may use namespace prefix in one but not the other
      const altName = name === 'id' ? 'xml:id' : name === 'xml:id' ? 'id' : null;
      if (altName && tsAttrMap.has(altName)) continue;
      diffs.push(`${fullPath}: missing attribute "${name}" (Java has "${refValue}")`);
      continue;
    }

    // Compare values
    const refNum = normalizeNumericValue(refValue);
    const tsNum = normalizeNumericValue(tsValue);

    if (refNum !== null && tsNum !== null) {
      if (Math.abs(refNum - tsNum) > tolerance) {
        diffs.push(
          `${fullPath}@${name}: TS=${tsValue} vs Java=${refValue} (diff=${Math.abs(refNum - tsNum).toFixed(6)})`,
        );
      }
    } else if (tsValue !== refValue) {
      // String comparison for non-numeric values
      if (refValue === '' && tsValue === '') continue; // both empty
      diffs.push(`${fullPath}@${name}: TS="${tsValue}" vs Java="${refValue}"`);
    }
  }

  // An attribute the reference does not have is a difference from the reference. This loop
  // used to have an EMPTY BODY — it iterated, found the extras, and dropped them, under a
  // comment saying they were "not necessarily an error". Measured: adding a bogus attribute
  // to every <note> of a reference file leaves this comparator green. It is an error now.
  for (const [name, tsValue] of tsAttrMap) {
    if (SKIP_ATTRS.has(name) || RANDOM_ATTRS.has(name)) continue;
    if (refAttrMap.has(name)) continue;
    if (name === 'xml:id' || name === 'id') continue; // handled by the alias rule above
    diffs.push(`${fullPath}: extra attribute "${name}"="${tsValue}" (Java has none)`);
  }

  // ...and the ORDER of the attributes, which nothing checked either. Reversing the
  // attribute order on every <note> of a reference file also left this comparator green,
  // because both sides go into a `Map` keyed on name and only the reference's is iterated.
  // Order is byte-visible in the output and, on this corpus, it encodes which render passes
  // touched a note: a note under a rubato instruction gets `date.end.perf` earlier than one
  // that is not. Measured green across all 16 fixtures at the time of writing.
  const orderOf = (attrs: readonly { name: string; value: string }[]): string[] =>
    attrs.map((a) => a.name).filter((n) => !SKIP_ATTRS.has(n) && !RANDOM_ATTRS.has(n));
  const tsOrder = orderOf(tsEl.attrs);
  const refOrder = orderOf(refEl.attrs);
  if (tsOrder.length === refOrder.length && tsOrder.join(',') !== refOrder.join(',')) {
    diffs.push(
      `${fullPath}: attribute order TS=[${tsOrder.join(',')}] vs Java=[${refOrder.join(',')}]`,
    );
  }

  // Compare children count
  if (tsEl.children.length !== refEl.children.length) {
    diffs.push(
      `${fullPath}: child count mismatch: TS=${tsEl.children.length} vs Java=${refEl.children.length}`,
    );
    // Still try to compare what we can
  }

  // Compare children pairwise
  const maxChildren = Math.min(tsEl.children.length, refEl.children.length);
  for (let i = 0; i < maxChildren; i++) {
    compareElements(tsEl.children[i], refEl.children[i], `${fullPath}[${i}]`, diffs, tolerance);
  }
}

/**
 * Canonicalize generated meico UUIDs by first-occurrence order (UUID_1, UUID_2, ...).
 * Random per-run ids differ between TS and Java, but references to them (e.g.
 * goto/@target.id -> marker/@xml:id) must stay isomorphic — consistent renaming
 * preserves and verifies that wiring.
 */
function canonicalizeUuids(xml: string): string {
  const map = new Map<string, string>();
  return xml.replace(/meico_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, (m) => {
    if (!map.has(m)) map.set(m, `meico_UUID_${map.size + 1}`);
    return map.get(m)!;
  });
}

/**
 * Run the TS pipeline and compare full augmented MSM against Java reference.
 */
function runFullComparison(fixture: string): { diffs: string[]; tsXml: string; refXml: string } {
  const meiXml = readFileSync(join(MEI_DIR, `${fixture}.mei`), 'utf-8');
  const mei = Mei.fromXml(meiXml);
  mei.setFile(`${fixture}.mei`);
  const converter = new Mei2MsmMpmConverter(720, true, false, true);
  const result = converter.convert(mei);
  const msm = result.getKey()[0];
  const mpm = result.getValue()[0];
  const performance = mpm.getAllPerformances()[0];

  const augmented = performance.perform(msm);
  const tsXml = canonicalizeUuids(augmented.getRootElement()!.toXML());
  const refXml = canonicalizeUuids(
    readFileSync(join(PERF_REF_DIR, `${fixture}_augmented.msm`), 'utf-8'),
  );

  const tsTree = parseXml(tsXml);
  const refTree = parseXml(refXml);
  const diffs: string[] = [];
  compareElements(tsTree, refTree, '', diffs);

  return { diffs, tsXml, refXml };
}

// Auto-discover all MEI fixtures; every fixture MUST have a Java reference (missing = failure, not skip)
const fixtures = readdirSync(MEI_DIR)
  .filter((f) => f.endsWith('.mei'))
  .map((f) => f.replace(/\.mei$/, ''))
  .sort();

describe('Full XML equivalence: augmented MSM (TS vs Java)', () => {
  for (const fixture of fixtures) {
    it(`${fixture}: ALL elements and ALL attributes match Java reference`, () => {
      const refPath = join(PERF_REF_DIR, `${fixture}_augmented.msm`);
      expect(
        existsSync(refPath),
        `missing Java reference ${fixture}_augmented.msm — regenerate with GeneratePerformanceReference`,
      ).toBe(true);

      const { diffs } = runFullComparison(fixture);

      if (diffs.length > 0) {
        const report = diffs.map((d) => `  - ${d}`).join('\n');
        expect.fail(`${diffs.length} differences found:\n${report}`);
      }
    });
  }
});

describe('Attribute-level coverage audit', () => {
  it('should verify all performance-specific attributes are present on notes', () => {
    // Check that the TS output actually produces all expected performance attributes
    const expectedNoteAttrs = [
      'date',
      'midi.pitch',
      'duration',
      'date.perf',
      'duration.perf',
      'date.end.perf',
      'milliseconds.date',
      'milliseconds.date.end',
      'velocity',
      'modified',
    ];

    for (const fixture of fixtures) {
      const refPath = join(PERF_REF_DIR, `${fixture}_augmented.msm`);
      expect(existsSync(refPath), `missing Java reference for ${fixture}`).toBe(true);

      const meiXml = readFileSync(join(MEI_DIR, `${fixture}.mei`), 'utf-8');
      const mei = Mei.fromXml(meiXml);
      mei.setFile(`${fixture}.mei`);
      const converter = new Mei2MsmMpmConverter(720, true, false, true);
      const result = converter.convert(mei);
      const msm = result.getKey()[0];
      const mpm = result.getValue()[0];
      const perf = mpm.getAllPerformances()[0];

      const augmented = perf.perform(msm);
      const tsTree = parseXml(augmented.getRootElement()!.toXML());

      // Find all note elements in the tree
      function findNotes(el: ParsedElement): ParsedElement[] {
        const notes: ParsedElement[] = [];
        if (el.tag === 'note') notes.push(el);
        for (const child of el.children) notes.push(...findNotes(child));
        return notes;
      }

      const notes = findNotes(tsTree);
      expect(notes.length).toBeGreaterThan(0);

      for (const note of notes) {
        const attrNames = new Set(note.attrs.map((a) => a.name));
        for (const expected of expectedNoteAttrs) {
          expect(
            attrNames.has(expected),
            `${fixture}: note missing attribute "${expected}". Has: ${[...attrNames].join(', ')}`,
          ).toBe(true);
        }
      }
    }
  });

  it('should verify channelVolumeMap is present when dynamics are rendered', () => {
    // dynamics and comprehensive fixtures should have a channelVolumeMap
    for (const fixture of ['dynamics', 'comprehensive']) {
      const refPath = join(PERF_REF_DIR, `${fixture}_augmented.msm`);
      expect(existsSync(refPath), `missing Java reference for ${fixture}`).toBe(true);

      const refXml = readFileSync(refPath, 'utf-8');
      if (!refXml.includes('channelVolumeMap')) continue;

      const meiXml = readFileSync(join(MEI_DIR, `${fixture}.mei`), 'utf-8');
      const mei = Mei.fromXml(meiXml);
      mei.setFile(`${fixture}.mei`);
      const converter = new Mei2MsmMpmConverter(720, true, false, true);
      const result = converter.convert(mei);
      const msm = result.getKey()[0];
      const mpm = result.getValue()[0];
      const perf = mpm.getAllPerformances()[0];

      const augmented = perf.perform(msm);
      const tsXml = augmented.getRootElement()!.toXML();
      expect(tsXml).toContain('channelVolumeMap');
    }
  });

  it('should verify global sectionMap gets performance timing attributes', () => {
    for (const fixture of fixtures) {
      const refPath = join(PERF_REF_DIR, `${fixture}_augmented.msm`);
      expect(existsSync(refPath), `missing Java reference for ${fixture}`).toBe(true);

      const meiXml = readFileSync(join(MEI_DIR, `${fixture}.mei`), 'utf-8');
      const mei = Mei.fromXml(meiXml);
      mei.setFile(`${fixture}.mei`);
      const converter = new Mei2MsmMpmConverter(720, true, false, true);
      const result = converter.convert(mei);
      const msm = result.getKey()[0];
      const mpm = result.getValue()[0];
      const perf = mpm.getAllPerformances()[0];

      const augmented = perf.perform(msm);
      const tsTree = parseXml(augmented.getRootElement()!.toXML());

      // Find sectionMap > section elements in global
      function findSections(el: ParsedElement): ParsedElement[] {
        const sections: ParsedElement[] = [];
        if (el.tag === 'section') sections.push(el);
        for (const child of el.children) sections.push(...findSections(child));
        return sections;
      }

      const sections = findSections(tsTree);
      for (const section of sections) {
        const attrNames = new Set(section.attrs.map((a) => a.name));
        expect(attrNames.has('date.perf'), `${fixture}: section missing date.perf`).toBe(true);
        expect(
          attrNames.has('milliseconds.date'),
          `${fixture}: section missing milliseconds.date`,
        ).toBe(true);
        expect(attrNames.has('modified'), `${fixture}: section missing modified`).toBe(true);
      }
    }
  });
});
