/**
 * Full XML equivalence: the complete augmented MSM output — all elements, all attributes,
 * all maps — compared against the Java reference.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { Msm } from '../../src/msm/Msm.js';
import { Mpm } from '../../src/mpm/Mpm.js';

const __dirname2 = dirname(fileURLToPath(import.meta.url));
const MEI_DIR = join(__dirname2, 'fixtures', 'mei');
const PERF_REF_DIR = join(__dirname2, 'fixtures', 'performance-reference');
const REF_DIR = join(__dirname2, 'fixtures', 'reference');

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

/** Minimal XML parser: good enough for MSM, which is straightforward single-line XML. */
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
    pos++;
    let tag = '';
    while (pos < xml.length && !/[\s/>]/.test(xml[pos])) tag += xml[pos++];

    const attrs: ParsedAttr[] = [];
    const children: ParsedElement[] = [];
    let text = '';

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
      let name = '';
      while (pos < xml.length && xml[pos] !== '=') name += xml[pos++];
      name = name.trim();
      pos++;
      const quote = xml[pos++];
      let value = '';
      while (pos < xml.length && xml[pos] !== quote) value += xml[pos++];
      pos++;
      attrs.push({ name, value });
    }

    while (pos < xml.length) {
      skipWhitespace();
      if (xml[pos] === '<' && xml[pos + 1] === '/') {
        pos += 2;
        while (pos < xml.length && xml[pos] !== '>') pos++;
        pos++;
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

/** Java writes doubles ("60.0") where TS may write "60", so numerics compare as numbers. */
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

/** Compares recursively, accumulating every difference into `diffs` rather than throwing. */
function compareElements(
  tsEl: ParsedElement,
  refEl: ParsedElement,
  path: string,
  diffs: string[],
  tolerance = 0.001,
): void {
  if (tsEl.tag !== refEl.tag) {
    diffs.push(`${path}: tag mismatch: TS="${tsEl.tag}" vs Java="${refEl.tag}"`);
    return;
  }

  const fullPath = `${path}/${tsEl.tag}`;

  const tsAttrMap = new Map(tsEl.attrs.map((a) => [a.name, a.value]));
  const refAttrMap = new Map(refEl.attrs.map((a) => [a.name, a.value]));

  for (const [name, refValue] of refAttrMap) {
    if (SKIP_ATTRS.has(name)) continue;
    if (RANDOM_ATTRS.has(name)) continue;

    const tsValue = tsAttrMap.get(name);
    if (tsValue === undefined) {
      // One side may spell an id with the namespace prefix where the other does not.
      const altName = name === 'id' ? 'xml:id' : name === 'xml:id' ? 'id' : null;
      if (altName && tsAttrMap.has(altName)) continue;
      diffs.push(`${fullPath}: missing attribute "${name}" (Java has "${refValue}")`);
      continue;
    }

    const refNum = normalizeNumericValue(refValue);
    const tsNum = normalizeNumericValue(tsValue);

    if (refNum !== null && tsNum !== null) {
      if (Math.abs(refNum - tsNum) > tolerance) {
        diffs.push(
          `${fullPath}@${name}: TS=${tsValue} vs Java=${refValue} (diff=${Math.abs(refNum - tsNum).toFixed(6)})`,
        );
      }
    } else if (tsValue !== refValue) {
      if (refValue === '' && tsValue === '') continue;
      diffs.push(`${fullPath}@${name}: TS="${tsValue}" vs Java="${refValue}"`);
    }
  }

  // An attribute the reference does not have is a difference from the reference: the loop
  // above only walks the reference's own attributes.
  for (const [name, tsValue] of tsAttrMap) {
    if (SKIP_ATTRS.has(name) || RANDOM_ATTRS.has(name)) continue;
    if (refAttrMap.has(name)) continue;
    if (name === 'xml:id' || name === 'id') continue; // handled by the alias rule above
    diffs.push(`${fullPath}: extra attribute "${name}"="${tsValue}" (Java has none)`);
  }

  // Attribute order is byte-visible in the output and, on this corpus, encodes which render
  // passes touched a note: a note under a rubato instruction gets `date.end.perf` earlier
  // than one that is not.
  const orderOf = (attrs: readonly { name: string; value: string }[]): string[] =>
    attrs.map((a) => a.name).filter((n) => !SKIP_ATTRS.has(n) && !RANDOM_ATTRS.has(n));
  const tsOrder = orderOf(tsEl.attrs);
  const refOrder = orderOf(refEl.attrs);
  if (tsOrder.length === refOrder.length && tsOrder.join(',') !== refOrder.join(',')) {
    diffs.push(
      `${fullPath}: attribute order TS=[${tsOrder.join(',')}] vs Java=[${refOrder.join(',')}]`,
    );
  }

  // Not one of the 16 performance-reference documents carries element text — an augmented MSM
  // is all attributes — so this cannot fire on today's corpus. It guards a silent failure: a
  // serializer that began emitting text where Java emits none would otherwise pass unchanged.
  // (`cross-validation` does check text, by string equality, and its MPM fixtures do carry
  // `<author>` and `<comment>` content.)
  if (tsEl.text.trim() !== refEl.text.trim()) {
    diffs.push(`${fullPath}: text "${tsEl.text.trim()}" vs Java "${refEl.text.trim()}"`);
  }

  if (tsEl.children.length !== refEl.children.length) {
    diffs.push(
      `${fullPath}: child count mismatch: TS=${tsEl.children.length} vs Java=${refEl.children.length}`,
    );
  }

  // A count mismatch is already reported; the pairwise walk covers the common prefix.
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

function runFullComparison(fixture: string): { diffs: string[]; tsXml: string; refXml: string } {
  const msm = new Msm(readFileSync(join(REF_DIR, `${fixture}.msm`), 'utf-8'));
  const mpm = new Mpm(readFileSync(join(REF_DIR, `${fixture}.mpm`), 'utf-8'));
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

// Every fixture must have a Java reference: a missing one is a failure, not a skip.
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

      const msm = new Msm(readFileSync(join(REF_DIR, `${fixture}.msm`), 'utf-8'));
      const mpm = new Mpm(readFileSync(join(REF_DIR, `${fixture}.mpm`), 'utf-8'));
      const perf = mpm.getAllPerformances()[0];

      const augmented = perf.perform(msm);
      const tsTree = parseXml(augmented.getRootElement()!.toXML());

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
    for (const fixture of ['dynamics', 'comprehensive']) {
      const refPath = join(PERF_REF_DIR, `${fixture}_augmented.msm`);
      expect(existsSync(refPath), `missing Java reference for ${fixture}`).toBe(true);

      const refXml = readFileSync(refPath, 'utf-8');
      if (!refXml.includes('channelVolumeMap')) continue;

      const msm = new Msm(readFileSync(join(REF_DIR, `${fixture}.msm`), 'utf-8'));
      const mpm = new Mpm(readFileSync(join(REF_DIR, `${fixture}.mpm`), 'utf-8'));
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

      const msm = new Msm(readFileSync(join(REF_DIR, `${fixture}.msm`), 'utf-8'));
      const mpm = new Mpm(readFileSync(join(REF_DIR, `${fixture}.mpm`), 'utf-8'));
      const perf = mpm.getAllPerformances()[0];

      const augmented = perf.perform(msm);
      const tsTree = parseXml(augmented.getRootElement()!.toXML());

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
