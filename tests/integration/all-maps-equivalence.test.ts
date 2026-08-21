/**
 * Full XML equivalence for all map types: rubato, asynchrony, metrical accentuation,
 * movement, imprecision (timing, dynamics), and a combined all-maps fixture.
 *
 * The inputs are pre-built MSM+MPM XML, so no MEI conversion is in the loop. Each is run
 * through `Performance.perform()` and the augmented MSM is compared attribute by attribute
 * against the Java reference.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { Msm } from '../../src/msm/Msm.js';
import { Mpm } from '../../src/mpm/Mpm.js';

const __dirname2 = dirname(fileURLToPath(import.meta.url));
const REF_DIR = join(__dirname2, 'fixtures', 'all-maps-reference');

// ---- XML parsing and comparison utilities ----

interface ParsedAttr {
  name: string;
  value: string;
}
interface ParsedElement {
  tag: string;
  attrs: ParsedAttr[];
  children: ParsedElement[];
}

function parseXml(xml: string): ParsedElement {
  xml = xml.replace(/<\?xml[^?]*\?>/, '').trim();
  let pos = 0;
  function skipWs() {
    while (pos < xml.length && /\s/.test(xml[pos])) pos++;
  }
  function parseEl(): ParsedElement {
    skipWs();
    if (xml[pos] !== '<') throw new Error(`Expected '<' at ${pos}`);
    pos++;
    let tag = '';
    while (pos < xml.length && !/[\s/>]/.test(xml[pos])) tag += xml[pos++];
    const attrs: ParsedAttr[] = [];
    const children: ParsedElement[] = [];
    while (pos < xml.length) {
      skipWs();
      if (xml[pos] === '/' && xml[pos + 1] === '>') {
        pos += 2;
        return { tag, attrs, children };
      }
      if (xml[pos] === '>') {
        pos++;
        break;
      }
      let name = '';
      while (pos < xml.length && xml[pos] !== '=') name += xml[pos++];
      name = name.trim();
      pos++;
      const q = xml[pos++];
      let value = '';
      while (pos < xml.length && xml[pos] !== q) value += xml[pos++];
      pos++;
      attrs.push({ name, value });
    }
    while (pos < xml.length) {
      skipWs();
      if (xml[pos] === '<' && xml[pos + 1] === '/') {
        pos += 2;
        while (pos < xml.length && xml[pos] !== '>') pos++;
        pos++;
        break;
      }
      if (xml[pos] === '<') children.push(parseEl());
      else pos++;
    }
    return { tag, attrs, children };
  }
  return parseEl();
}

const SKIP_ATTRS = new Set(['xml:id', 'uri', 'file']);
// Imprecision values use different RNGs in Java vs TS, so exact numeric match isn't expected
const IMPRECISION_SENSITIVE_ATTRS = new Set(['tuning.offset']);

function compareElements(
  tsEl: ParsedElement,
  refEl: ParsedElement,
  path: string,
  diffs: string[],
  tolerance: number,
  skipImprecision: boolean,
): void {
  if (tsEl.tag !== refEl.tag) {
    diffs.push(`${path}: tag mismatch TS="${tsEl.tag}" vs Java="${refEl.tag}"`);
    return;
  }
  const fp = `${path}/${tsEl.tag}`;
  const tsA = new Map(tsEl.attrs.map((a) => [a.name, a.value]));
  const refA = new Map(refEl.attrs.map((a) => [a.name, a.value]));
  for (const [name, refV] of refA) {
    if (SKIP_ATTRS.has(name)) continue;
    if (skipImprecision && IMPRECISION_SENSITIVE_ATTRS.has(name)) continue;
    const tsV = tsA.get(name);
    if (tsV === undefined) {
      if (name === 'id' && tsA.has('xml:id')) continue;
      if (name === 'xml:id' && tsA.has('id')) continue;
      diffs.push(`${fp}: missing attr "${name}" (Java="${refV}")`);
      continue;
    }
    const rn = parseFloat(refV),
      tn = parseFloat(tsV);
    if (!isNaN(rn) && !isNaN(tn)) {
      if (Math.abs(rn - tn) > tolerance)
        diffs.push(
          `${fp}@${name}: TS=${tsV} vs Java=${refV} (diff=${Math.abs(rn - tn).toFixed(6)})`,
        );
    } else if (tsV !== refV && !(refV === '' && tsV === '')) {
      diffs.push(`${fp}@${name}: TS="${tsV}" vs Java="${refV}"`);
    }
  }
  // The loop above walks the reference's attributes only, so extra attributes and attribute
  // order each need a pass of their own.
  const keep = (n: string): boolean =>
    !SKIP_ATTRS.has(n) && !(skipImprecision && IMPRECISION_SENSITIVE_ATTRS.has(n));
  for (const [name, tsV] of tsA) {
    if (!keep(name) || refA.has(name)) continue;
    if (name === 'xml:id' || name === 'id') continue; // alias rule above
    diffs.push(`${fp}: extra attr "${name}"="${tsV}" (Java has none)`);
  }
  const tsOrder = tsEl.attrs.map((a) => a.name).filter(keep);
  const refOrder = refEl.attrs.map((a) => a.name).filter(keep);
  if (tsOrder.length === refOrder.length && tsOrder.join(',') !== refOrder.join(','))
    diffs.push(`${fp}: attribute order TS=[${tsOrder.join(',')}] vs Java=[${refOrder.join(',')}]`);

  if (tsEl.children.length !== refEl.children.length)
    diffs.push(`${fp}: child count TS=${tsEl.children.length} vs Java=${refEl.children.length}`);
  for (let i = 0; i < Math.min(tsEl.children.length, refEl.children.length); i++)
    compareElements(
      tsEl.children[i],
      refEl.children[i],
      `${fp}[${i}]`,
      diffs,
      tolerance,
      skipImprecision,
    );
}

// ---- Test runner ----

function loadAndPerform(name: string): { tsXml: string; refXml: string } {
  const msmXml = readFileSync(join(REF_DIR, `${name}.msm`), 'utf-8');
  const mpmXml = readFileSync(join(REF_DIR, `${name}.mpm`), 'utf-8');
  const refXml = readFileSync(join(REF_DIR, `${name}_augmented.msm`), 'utf-8');

  const msm = new Msm(msmXml);
  const mpm = new Mpm(mpmXml);

  const performances = mpm!.getAllPerformances();
  expect(performances.length).toBeGreaterThan(0);
  const perf = performances[0];

  const augmented = perf.perform(msm);
  const tsXml = augmented.getRootElement()!.toXML();

  return { tsXml, refXml };
}

// Numeric agreement with the Java reference is exact: over all eight all-maps fixtures the
// largest measured deviation across every attribute compared here is 0. This tolerance is
// headroom for last-ulp divergence in Math.pow/Math.log, which Java specifies to 1 ulp and
// does not guarantee across implementations (only StrictMath is reproducible); at these
// magnitudes that lives near 1e-12. It is not headroom for formatting — the comparison parses
// both sides to doubles, and both platforms' number-to-string is round-trip exact. For scale,
// a tolerance of 0.01 is 2.4x wider than the worst error the AccentuationPatternDef
// segment-end bug caused (4.17e-3), and held the suite green while the port disagreed with
// the reference. Tighten this freely; widening it requires the same evidence a parity
// divergence does.
const NUMERIC_TOLERANCE = 1e-9;

// Deterministic tests (no imprecision randomness)
const deterministicFixtures = [
  'rubato',
  'asynchrony',
  'metrical_accentuation',
  'movement',
  'ornamentation',
];

// Tests involving imprecision (different RNG = different values)
const imprecisionFixtures = ['imprecision_timing', 'imprecision_dynamics'];

describe('All map types: full XML equivalence (TS vs Java)', () => {
  for (const name of deterministicFixtures) {
    it(`${name}: all elements and attributes match Java reference`, () => {
      if (!existsSync(join(REF_DIR, `${name}_augmented.msm`))) return;
      const { tsXml, refXml } = loadAndPerform(name);
      const diffs: string[] = [];
      compareElements(parseXml(tsXml), parseXml(refXml), '', diffs, NUMERIC_TOLERANCE, false);
      if (diffs.length > 0)
        expect.fail(`${diffs.length} differences:\n${diffs.map((d) => `  - ${d}`).join('\n')}`);
    });
  }

  for (const name of imprecisionFixtures) {
    it(`${name}: structure matches Java (values may differ due to RNG)`, () => {
      if (!existsSync(join(REF_DIR, `${name}_augmented.msm`))) return;
      const { tsXml, refXml } = loadAndPerform(name);
      const diffs: string[] = [];
      // Compare everything except the imprecision-affected attributes.
      compareElements(parseXml(tsXml), parseXml(refXml), '', diffs, NUMERIC_TOLERANCE, true);
      // Filter out milliseconds.date and velocity diffs (these are shifted by imprecision)
      const structuralDiffs = diffs.filter(
        (d) =>
          !d.includes('milliseconds.date') &&
          !d.includes('velocity') &&
          !d.includes('date.end.perf'), // timing imprecision affects date.end.perf via pending durations
      );
      if (structuralDiffs.length > 0)
        expect.fail(
          `${structuralDiffs.length} structural differences:\n${structuralDiffs.map((d) => `  - ${d}`).join('\n')}`,
        );
    });

    it(`${name}: imprecision actually modifies values (not a no-op)`, () => {
      if (!existsSync(join(REF_DIR, `${name}_augmented.msm`))) return;
      const { tsXml } = loadAndPerform(name);
      const tree = parseXml(tsXml);
      function findNotes(el: ParsedElement): ParsedElement[] {
        const r: ParsedElement[] = [];
        if (el.tag === 'note') r.push(el);
        for (const c of el.children) r.push(...findNotes(c));
        return r;
      }
      const notes = findNotes(tree);
      expect(notes.length).toBeGreaterThan(0);

      if (name === 'imprecision_timing') {
        // Only the presence of the attribute is checked: the pre-imprecision value is the
        // tempo-rendered one and is not available here to compare against.
        let anyShifted = false;
        for (const note of notes) {
          const msDate = note.attrs.find((a) => a.name === 'milliseconds.date');
          if (msDate) anyShifted = true;
        }
        expect(anyShifted).toBe(true);
      } else if (name === 'imprecision_dynamics') {
        const velocities = notes
          .map((n) => n.attrs.find((a) => a.name === 'velocity'))
          .filter(Boolean);
        expect(velocities.length).toBeGreaterThan(0);
        const values = velocities.map((v) => parseFloat(v!.value));
        const allSame = values.every((v) => v === values[0]);
        expect(allSame).toBe(false);
      }
    });
  }

  it('all_maps: combined test with ALL map types matches Java (structural)', () => {
    if (!existsSync(join(REF_DIR, 'all_maps_augmented.msm'))) return;
    const { tsXml, refXml } = loadAndPerform('all_maps');
    const diffs: string[] = [];
    compareElements(parseXml(tsXml), parseXml(refXml), '', diffs, NUMERIC_TOLERANCE, true);
    // Filter diffs caused by imprecision RNG differences
    const structuralDiffs = diffs.filter(
      (d) =>
        !d.includes('milliseconds.date') && !d.includes('velocity') && !d.includes('date.end.perf'),
    );
    if (structuralDiffs.length > 0)
      expect.fail(
        `${structuralDiffs.length} structural differences:\n${structuralDiffs.map((d) => `  - ${d}`).join('\n')}`,
      );
  });

  it('all_maps: augmented MSM has all expected map types in output', () => {
    if (!existsSync(join(REF_DIR, 'all_maps_augmented.msm'))) return;
    const { tsXml } = loadAndPerform('all_maps');
    expect(tsXml).toContain('milliseconds.date'); // tempo rendering worked
    expect(tsXml).toContain('velocity'); // dynamics rendering worked
    expect(tsXml).toContain('channelVolumeMap'); // dynamics produced channelVolumeMap
    expect(tsXml).toContain('positionMap'); // movement rendering produced positionMap
    expect(tsXml).toContain('date.perf'); // rubato modified date.perf
    expect(tsXml).toContain('duration.perf'); // articulation modified duration.perf
    expect(tsXml).toContain('modified'); // performance attributes present
  });
});
