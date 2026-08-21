import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { Mei } from '../../src/mei/Mei.js';
import { Mei2MsmMpmConverter } from '../../src/mei/Mei2MsmMpmConverter.js';
import { Msm } from '../../src/msm/Msm.js';
import { Mpm } from '../../src/mpm/Mpm.js';

/**
 * The `<pedal>` element, against Java — a path with no other fixture coverage.
 *
 * All 50 `pedalMap`s in the 82 MSM files under `tests/` are empty. Not one `<pedal>` element
 * exists elsewhere in the corpus, so `processPedal`, the two deferred-resolution lists it
 * feeds, and every render stage that touches a pedalMap are no-ops corpus-wide, and the byte
 * gate cannot protect a refactor in any of them. This suite is that gate.
 *
 * See `fixtures-pedal/PROVENANCE.md` for how the references were generated and why the fixture
 * covers the four MEI spellings it does. The short version: each takes a different route
 * through `processPedal` — a plain `@tstamp`, a `@startid`/`@endid` span resolved through the
 * `endids` deferred list, a `@tstamp2` span resolved through the `tstamp2s` deferred list, and
 * a `@staff`-scoped entry that must land in the part's map rather than the global one.
 *
 * One normaliser, the one `cross-validation.test.ts` keeps for the same reason: Java's
 * `Double.toString` writes `720.0` where JavaScript's `String(number)` writes `720`, an
 * examined and accepted difference (PARITY.md). Nothing else is forgiven — not attribute
 * order, not the XML declaration, not the trailing newline, not the namespace declaration.
 */
const HERE = dirname(fileURLToPath(import.meta.url));
const FIX = join(HERE, 'fixtures-pedal');
const read = (name: string): string => readFileSync(join(FIX, name), 'utf-8');

/** Java's `Double.toString` keeps the fractional zero; `String(number)` does not. */
const normalize = (xml: string): string => xml.replace(/="(-?\d+)\.0"/g, '="$1"');

/** Every `<pedal …>` open tag, in document order, exactly as serialized. */
const pedalTags = (xml: string): string[] => [...xml.matchAll(/<pedal [^>]*>/g)].map((m) => m[0]);

describe('<pedal> against the Java reference', () => {
  let msmXml: string;
  let mpmXml: string;

  beforeAll(() => {
    const mei = Mei.fromXml(read('pedal.mei'));
    mei.setFile('pedal.mei');
    const result = new Mei2MsmMpmConverter(720, true, false, true).convert(mei);
    const msms = result.key;
    const mpms = result.value;
    expect(msms.length).toBe(1);
    expect(mpms.length).toBe(1);
    msmXml = msms[0]!.toXML();
    mpmXml = mpms[0]!.toXML();
  });

  it('converts MEI to MSM byte for byte', () => {
    expect(normalize(msmXml)).toBe(normalize(read('pedal.msm')));
  });

  it('converts MEI to MPM byte for byte', () => {
    expect(normalize(mpmXml)).toBe(normalize(read('pedal.mpm')));
  });

  it('produces five pedals, not an empty pedalMap', () => {
    // The assertion the rest of the file rests on: a fixture that silently produced no
    // `<pedal>` would pass every byte comparison above against a reference that also had
    // none, and prove nothing at all.
    const tags = pedalTags(msmXml);
    expect(tags).toHaveLength(5);
    expect(pedalTags(read('pedal.msm'))).toHaveLength(5);
  });

  it('resolves both span forms — @endid and @tstamp2 — to the same dates as Java', () => {
    const ours = pedalTags(msmXml).map(normalize);
    const theirs = pedalTags(read('pedal.msm')).map(normalize);
    expect(ours).toEqual(theirs);

    // Named explicitly, because these two are the deferred-resolution lists and a refactor
    // that dropped either would still produce five pedals.
    expect(ours.join('')).toContain('xml:id="ped3"');
    expect(ours.some((t) => t.includes('ped3') && t.includes('date.end="7200"'))).toBe(true);
    expect(ours.some((t) => t.includes('ped5') && t.includes('date.end="10080"'))).toBe(true);
  });

  it('puts the @staff-scoped pedal in the part, not in the global map', () => {
    // `processPedal` routes on `@part`, then `@staff`. Java's reference has four pedals under
    // <global> and one under <part>; a port that ignored the attribute would have five and
    // zero, and every date would still match.
    const globalPart = msmXml.slice(msmXml.indexOf('<global>'), msmXml.indexOf('<part '));
    const partPart = msmXml.slice(msmXml.indexOf('<part '));
    expect(pedalTags(globalPart)).toHaveLength(4);
    expect(pedalTags(partPart)).toHaveLength(1);
    expect(pedalTags(partPart)[0]).toContain('xml:id="ped4"');
  });

  it('renders the pedalMap through perform() byte for byte', () => {
    const msm = new Msm(read('pedal.msm'));
    const mpm = new Mpm(read('pedal.mpm'));
    const performance = mpm.getAllPerformances()[0]!;
    const augmented = performance.perform(msm);

    expect(normalize(augmented.toXML())).toBe(normalize(read('pedal_augmented.msm')));
  });

  it('gives every pedal the performance attributes the render pass writes', () => {
    // No other fixture reaches the render stages that touch a pedalMap, so this states what
    // they must produce rather than trusting the byte comparison to notice.
    const msm = new Msm(read('pedal.msm'));
    const mpm = new Mpm(read('pedal.mpm'));
    const augmented = mpm.getAllPerformances()[0]!.perform(msm);
    const tags = pedalTags(augmented.toXML());

    expect(tags).toHaveLength(5);
    for (const tag of tags) {
      expect(tag).toContain('date.perf=');
      expect(tag).toContain('milliseconds.date=');
      expect(tag).toContain('modified=');
    }
    // ...and both spans keep their end through the pass.
    expect(tags.filter((t) => t.includes('milliseconds.date.end='))).toHaveLength(2);
  });
});
