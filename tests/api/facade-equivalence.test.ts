/**
 * The facade produces exactly what the class API produces — and, because the facade
 * serializes and re-parses between stages while the class API does not, this is at the same
 * time ARCHITECTURE.md §8.4's required **RULE F2 round-trip gate**:
 * `convert → serialize → re-parse → perform` must be byte-identical to `convert → perform`.
 *
 * The T12 review measured 0 divergences over the 16 MEI fixtures, so a failure here means
 * T13 introduced one, not that the boundary design was wrong.
 *
 * This is not a Java-equivalence test — `tests/integration/**` owns that, still through the
 * class API — and it deliberately compares against the classic path rather than the fixtures,
 * so it stays a *facade* gate and cannot be satisfied by weakening ground truth.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { Mpm } from '../../src/mpm/Mpm.js';
import { Mei } from '../../src/mei/Mei.js';
import { Mei2MsmMpmConverter } from '../../src/mei/Mei2MsmMpmConverter.js';
import { Msm } from '../../src/msm/Msm.js';
import {
  convertMeiToMsmMpm,
  performMsm,
  renderExpressiveMidi,
  renderMidi,
} from '../../src/api/index.js';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), '..', 'integration', 'fixtures');
const MEI_DIR = join(FIXTURES, 'mei');
const MAPS_DIR = join(FIXTURES, 'all-maps-reference');

const meiFixtures = readdirSync(MEI_DIR)
  .filter((f) => f.endsWith('.mei'))
  .map((f) => f.replace(/\.mei$/, ''))
  .sort();

const mapFixtures = readdirSync(MAPS_DIR)
  .filter((f) => f.endsWith('.msm') && !f.endsWith('_augmented.msm'))
  .map((f) => f.replace(/\.msm$/, ''))
  .sort();

/**
 * Generated `meico_<uuid>` ids differ between two runs of the same conversion by design, so
 * they are renumbered in first-occurrence order — the same quotient the integration suite
 * takes. Nothing else is normalized: everything else must match byte for byte.
 */
function canonicalise(xml: string): string {
  const seen = new Map<string, string>();
  return xml.replace(/meico_[0-9a-f-]+/g, (id) => {
    if (!seen.has(id)) seen.set(id, `UUID${seen.size}`);
    return seen.get(id)!;
  });
}

/** Element names in order plus the set of attribute names — for the nondeterministic maps. */
function structure(xml: string): string {
  return `${(xml.match(/<[a-zA-Z.]+/g) ?? []).join(',')}|${[
    ...new Set(xml.match(/[a-zA-Z.:]+="/g) ?? []),
  ]
    .sort()
    .join(',')}`;
}

const hex = (bytes: Uint8Array) => Buffer.from(bytes).toString('hex');

describe('facade == classic class API (RULE F2 round trip)', () => {
  for (const fixture of meiFixtures) {
    it(`${fixture}: same MSM, MPM, augmented MSM and MIDI bytes`, () => {
      const meiText = readFileSync(join(MEI_DIR, `${fixture}.mei`), 'utf-8');

      // --- classic: objects all the way through, no serialization in between
      const mei = Mei.fromXml(meiText);
      mei.setFile(`${fixture}.mei`);
      const converted = new Mei2MsmMpmConverter(720, true, false, true).convert(mei);
      const classicMsm = converted.getKey()[0];
      const classicMpm = converted.getValue()[0];
      const classicPerformance = classicMpm.getAllPerformances()[0];

      // --- facade: XML text at every boundary
      const movements = convertMeiToMsmMpm(meiText, { sourceName: `${fixture}.mei` });

      expect(movements).toHaveLength(converted.getKey().length);
      expect(canonicalise(movements[0].msm)).toBe(
        canonicalise(classicMsm.getRootElement()!.toXML()),
      );
      expect(canonicalise(movements[0].mpm)).toBe(
        canonicalise(classicMpm.getRootElement()!.toXML()),
      );
      expect(movements.map((m) => m.title)).toEqual(converted.getKey().map((m) => m.getTitle()));

      expect(canonicalise(performMsm(movements[0]))).toBe(
        canonicalise(classicPerformance.perform(classicMsm).getRootElement()!.toXML()),
      );
      expect(hex(renderExpressiveMidi(movements[0]))).toBe(
        hex(classicMsm.exportExpressiveMidi(classicPerformance, true)!.exportMidi()!),
      );
      expect(hex(renderMidi({ msm: movements[0].msm }))).toBe(
        hex(classicMsm.exportMidi(120, true)!.exportMidi()!),
      );
    });
  }

  it('reproduces the file-less converter branch when sourceName is omitted', () => {
    const meiText = readFileSync(join(MEI_DIR, 'dynamics.mei'), 'utf-8');
    const classic = new Mei2MsmMpmConverter(720, true, false, true).convert(Mei.fromXml(meiText));

    expect(canonicalise(convertMeiToMsmMpm(meiText)[0].mpm)).toBe(
      canonicalise(classic.getValue()[0].getRootElement()!.toXML()),
    );
  });

  it('threads every ConvertOption through to the converter', () => {
    const meiText = readFileSync(join(MEI_DIR, 'repeats_endings.mei'), 'utf-8');

    // Each option is checked against a classic converter built with the same flag, which
    // proves the threading without needing a fixture that exercises the flag's semantics —
    // no fixture has the ten parts `dontUseChannel10` would need, for instance.
    for (const [options, args] of [
      [{ ppq: 480 }, [480, true, false, true]],
      [{ dontUseChannel10: false }, [720, false, false, true]],
      [{ ignoreExpansions: true }, [720, true, true, true]],
      [{ cleanup: false }, [720, true, false, false]],
    ] as [Parameters<typeof convertMeiToMsmMpm>[1], [number, boolean, boolean, boolean]][]) {
      const mei = Mei.fromXml(meiText);
      mei.setFile('repeats_endings.mei');
      const classic = new Mei2MsmMpmConverter(...args).convert(mei);

      expect(
        canonicalise(
          convertMeiToMsmMpm(meiText, { ...options, sourceName: 'repeats_endings.mei' })[0].msm,
        ),
        `option ${JSON.stringify(options)}`,
      ).toBe(canonicalise(classic.getKey()[0].getRootElement()!.toXML()));
    }
  });

  for (const fixture of mapFixtures) {
    const nondeterministic = fixture.startsWith('imprecision');

    it(`${fixture}: same augmented MSM${nondeterministic ? ' (structurally — imprecision)' : ''}`, () => {
      const msmText = readFileSync(join(MAPS_DIR, `${fixture}.msm`), 'utf-8');
      const mpmText = readFileSync(join(MAPS_DIR, `${fixture}.mpm`), 'utf-8');

      const classic = new Mpm(mpmText)
        .getAllPerformances()[0]
        .perform(new Msm(msmText))
        .getRootElement()!
        .toXML();
      const facade = performMsm({ msm: msmText, mpm: mpmText });

      // The charter forbids byte comparison of imprecision output; it is random per run.
      if (nondeterministic) expect(structure(facade)).toBe(structure(classic));
      else {
        expect(canonicalise(facade)).toBe(canonicalise(classic));
        expect(hex(renderExpressiveMidi({ msm: msmText, mpm: mpmText }))).toBe(
          hex(
            new Msm(msmText)
              .exportExpressiveMidi(new Mpm(mpmText).getAllPerformances()[0], true)!
              .exportMidi()!,
          ),
        );
      }
    });
  }
});
