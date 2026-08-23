/**
 * The facade produces exactly what the class API produces — and, because the facade serializes
 * and re-parses between stages while the class API does not, this is at the same time
 * ARCHITECTURE.md §8.4's required RULE F2 round-trip gate: `convert → serialize → re-parse →
 * perform` must be byte-identical to `convert → perform`.
 *
 * This is not a Java-equivalence test — `tests/integration/**` owns that, still through the
 * class API — and it deliberately compares against the classic path rather than the fixtures,
 * so it stays a facade gate and cannot be satisfied by weakening ground truth.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { Mpm } from '../../src/mpm/Mpm.js';
import { Mei } from '../../src/mei/Mei.js';
import { Mei2MsmConverter } from '../../src/mei/Mei2MsmConverter.js';
import { Msm } from '../../src/msm/Msm.js';
import {
  convertMeiToMsm,
  performMsm,
  renderExpressiveMidi,
  renderMidi,
} from '../../src/api/index.js';

import { elementAt } from '../../src/prelude/index.js';
import type { MovementDocuments } from '../../src/api/index.js';

/** Movement `index` of a conversion, checked — as `pipeline.test.ts` reads it. */
const movementAt = (movements: readonly MovementDocuments[], index = 0): MovementDocuments =>
  elementAt(movements, index, 'the converted movement list');

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), '..', 'integration', 'fixtures');
const MEI_DIR = join(FIXTURES, 'mei');
const REF_DIR = join(FIXTURES, 'reference');
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

/**
 * The same quotient as {@link canonicalise}, taken over MIDI bytes instead of XML.
 *
 * meico writes each note's `xml:id` into the track as a text meta event, so a v3 ornament's
 * generated notes put their `meico_<uuid>` ids in the byte stream (DESIGN.md D10). Two runs of
 * the same conversion differ in those bytes by design, and only in those.
 *
 * The replacement is length-preserving — `meico_` plus 36 characters, in and out — because a
 * meta event is length-prefixed (`ff 01 2a …`): a shorter string would leave the prefix lying
 * about the payload and desynchronise every following byte. The `latin1` round trip is what
 * makes byte-for-character equivalence hold for the non-ASCII bytes around it.
 */
const hex = (bytes: Uint8Array) => {
  const seen = new Map<string, string>();
  const canonical = Buffer.from(bytes)
    .toString('latin1')
    .replace(/meico_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, (id) => {
      if (!seen.has(id)) seen.set(id, `meico_${String(seen.size).padStart(36, '0')}`);
      return seen.get(id)!;
    });
  return Buffer.from(canonical, 'latin1').toString('hex');
};

describe('facade == classic class API (RULE F2 round trip)', () => {
  for (const fixture of meiFixtures) {
    it(`${fixture}: same MSM, MPM, augmented MSM and MIDI bytes`, () => {
      const meiText = readFileSync(join(MEI_DIR, `${fixture}.mei`), 'utf-8');

      // --- classic: objects all the way through, no serialization in between
      const mei = Mei.fromXml(meiText);
      mei.setFile(`${fixture}.mei`);
      const converted = new Mei2MsmConverter(720, true, false, true).convert(mei);
      const classicMsm = elementAt(converted, 0, 'the classic converter’s MSMs');
      // The performance is the Java reference's own: the converter derives none (PARITY.md §9).
      const classicMpm = new Mpm(readFileSync(join(REF_DIR, `${fixture}.mpm`), 'utf-8'));
      const classicPerformance = elementAt(
        classicMpm.getAllPerformances(),
        0,
        'the reference MPM’s performances',
      );

      // --- facade: XML text at every boundary
      const movements = convertMeiToMsm(meiText, { sourceName: `${fixture}.mei` });

      expect(movements).toHaveLength(converted.length);
      const first = movementAt(movements);
      expect(canonicalise(first.msm)).toBe(canonicalise(classicMsm.getRootElement()!.toXML()));
      expect(movements.map((m) => m.title)).toEqual(converted.map((m) => m.getTitle()));

      const mpmText = classicMpm.getRootElement()!.toXML();
      expect(canonicalise(performMsm({ msm: first.msm, mpm: mpmText }))).toBe(
        canonicalise(classicPerformance.perform(classicMsm).getRootElement()!.toXML()),
      );
      expect(hex(renderExpressiveMidi({ msm: first.msm, mpm: mpmText }))).toBe(
        hex(classicMsm.exportExpressiveMidi(classicPerformance, true)!.exportMidi()),
      );
      expect(hex(renderMidi({ msm: first.msm }))).toBe(
        hex(classicMsm.exportMidi(120, true)!.exportMidi()),
      );
    });
  }

  it('the MIDI canonicalisation erases generated ids and nothing else', () => {
    // A guard on the helper above: a normalisation strong enough to hide a real regression
    // would make every comparison in this file pass for the wrong reason.
    //
    // A v3 ornament is what draws a fresh `meico_<uuid>` per render — MEI ornament signs no
    // longer author one, since the converter writes no performance at all.
    const V3 = join(dirname(fileURLToPath(import.meta.url)), '..', 'integration', 'fixtures-v3');
    const expressiveMidiOf = (fixture: string) =>
      renderExpressiveMidi({
        msm: readFileSync(join(V3, `${fixture}.msm`), 'utf-8'),
        mpm: readFileSync(join(V3, `${fixture}.mpm`), 'utf-8'),
      });
    const raw = (bytes: Uint8Array) => Buffer.from(bytes).toString('hex');

    const first = expressiveMidiOf('turn-atstart');
    const second = expressiveMidiOf('turn-atstart');
    expect(raw(first)).not.toBe(raw(second));
    expect(hex(first)).toBe(hex(second));

    // Still fine enough to separate two different performances, and still length-preserving.
    expect(hex(first)).not.toBe(hex(expressiveMidiOf('trill-repetitions')));
    expect(hex(first)).toHaveLength(raw(first).length);
  });

  it('reproduces the file-less converter branch when sourceName is omitted', () => {
    const meiText = readFileSync(join(MEI_DIR, 'dynamics.mei'), 'utf-8');
    const classic = new Mei2MsmConverter(720, true, false, true).convert(Mei.fromXml(meiText));

    expect(canonicalise(movementAt(convertMeiToMsm(meiText)).msm)).toBe(
      canonicalise(elementAt(classic, 0, 'the classic converter’s MSMs').getRootElement()!.toXML()),
    );
  });

  it('threads every ConvertOption through to the converter', () => {
    const meiText = readFileSync(join(MEI_DIR, 'repeats_endings.mei'), 'utf-8');

    // Each option is checked against a classic converter built with the same flag, which proves
    // the threading without needing a fixture that exercises the flag's semantics — no fixture
    // has the ten parts `dontUseChannel10` would need, for instance.
    for (const [options, args] of [
      [{ ppq: 480 }, [480, true, false, true]],
      [{ dontUseChannel10: false }, [720, false, false, true]],
      [{ ignoreExpansions: true }, [720, true, true, true]],
      [{ cleanup: false }, [720, true, false, false]],
    ] as [Parameters<typeof convertMeiToMsm>[1], [number, boolean, boolean, boolean]][]) {
      const mei = Mei.fromXml(meiText);
      mei.setFile('repeats_endings.mei');
      const classic = new Mei2MsmConverter(...args).convert(mei);

      expect(
        canonicalise(
          movementAt(convertMeiToMsm(meiText, { ...options, sourceName: 'repeats_endings.mei' }))
            .msm,
        ),
        `option ${JSON.stringify(options)}`,
      ).toBe(
        canonicalise(
          elementAt(classic, 0, 'the classic converter’s MSMs').getRootElement()!.toXML(),
        ),
      );
    }
  });

  for (const fixture of mapFixtures) {
    const nondeterministic = fixture.startsWith('imprecision');

    it(`${fixture}: same augmented MSM${nondeterministic ? ' (structurally — imprecision)' : ''}`, () => {
      const msmText = readFileSync(join(MAPS_DIR, `${fixture}.msm`), 'utf-8');
      const mpmText = readFileSync(join(MAPS_DIR, `${fixture}.mpm`), 'utf-8');

      const classic = elementAt(
        new Mpm(mpmText).getAllPerformances(),
        0,
        'the classic MPM’s performances',
      )
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
              .exportMidi(),
          ),
        );
      }
    });
  }
});
