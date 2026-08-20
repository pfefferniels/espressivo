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

/**
 * The same quotient as {@link canonicalise}, taken over MIDI bytes instead of XML.
 *
 * meico writes each note's `xml:id` into the track as a text meta event, so a note that got a
 * generated `meico_<uuid>` id puts that uuid in the byte stream — and a v3 ornament's generated
 * notes get exactly those (DESIGN.md D10; the same nondeterminism W6 canonicalises in
 * `tests/integration/ornamentation-v3.test.ts`). Two runs of the same conversion therefore
 * differ in those bytes by design, and only in those bytes.
 *
 * The replacement is **length-preserving** — `meico_` plus 36 characters, in and out — because a
 * meta event is length-prefixed (`ff 01 2a …`). Renumbering to a shorter string would leave the
 * prefix lying about the payload and desynchronise every following byte, turning a normalisation
 * into corruption. The `latin1` round trip is what makes that byte-for-character equivalence
 * hold for the non-ASCII bytes around it.
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
      // The fifth argument is `expandOrnaments`, and it is spelled out because the two sides
      // default it differently ON PURPOSE: the facade turns MEI ornament expansion on, the bare
      // converter leaves it off so that tests/integration can keep comparing against Java
      // references that contain no expansion (Mei2MsmMpmConverter.expandOrnaments). This gate
      // asks whether the same settings produce the same bytes across the serialization boundary,
      // so both sides state the setting rather than inheriting two different defaults. Passing
      // `true` is also what makes composite_advanced's trill — a v3 ornament with a note pool and
      // a repeat group in note.order — actually travel through this round trip.
      const converted = new Mei2MsmMpmConverter(720, true, false, true, true).convert(mei);
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
        hex(classicMsm.exportExpressiveMidi(classicPerformance, true)!.exportMidi()),
      );
      expect(hex(renderMidi({ msm: movements[0].msm }))).toBe(
        hex(classicMsm.exportMidi(120, true)!.exportMidi()),
      );
    });
  }

  it('the MIDI canonicalisation erases generated ids and nothing else', () => {
    // A guard on the helper above, in W6's shape ("the canonicalisation is not vacuous"): a
    // normalisation strong enough to hide a real regression would make every comparison in this
    // file pass for the wrong reason.
    const expressiveMidiOf = (fixture: string) =>
      renderExpressiveMidi(
        convertMeiToMsmMpm(readFileSync(join(MEI_DIR, `${fixture}.mei`), 'utf-8'), {
          sourceName: `${fixture}.mei`,
        })[0],
      );
    const raw = (bytes: Uint8Array) => Buffer.from(bytes).toString('hex');

    // composite_advanced carries a <trill>, so the facade expands it and its generated notes draw
    // a fresh uuid on every run — the raw bytes of two identical conversions really do differ.
    const first = expressiveMidiOf('composite_advanced');
    const second = expressiveMidiOf('composite_advanced');
    expect(raw(first)).not.toBe(raw(second));
    expect(hex(first)).toBe(hex(second));

    // The quotient is still fine enough to separate two genuinely different performances, and
    // length-preserving enough to leave the streams the size they were.
    expect(hex(first)).not.toBe(hex(expressiveMidiOf('simple_notes')));
    expect(hex(first)).toHaveLength(raw(first).length);
  });

  it('reproduces the file-less converter branch when sourceName is omitted', () => {
    const meiText = readFileSync(join(MEI_DIR, 'dynamics.mei'), 'utf-8');
    // Fifth argument as above: match the facade's setting rather than the converter's default.
    const classic = new Mei2MsmMpmConverter(720, true, false, true, true).convert(
      Mei.fromXml(meiText),
    );

    expect(canonicalise(convertMeiToMsmMpm(meiText)[0].mpm)).toBe(
      canonicalise(classic.getValue()[0].getRootElement()!.toXML()),
    );
  });

  it('threads every ConvertOption through to the converter', () => {
    const meiText = readFileSync(join(MEI_DIR, 'repeats_endings.mei'), 'utf-8');

    // Each option is checked against a classic converter built with the same flag, which
    // proves the threading without needing a fixture that exercises the flag's semantics —
    // no fixture has the ten parts `dontUseChannel10` would need, for instance.
    //
    // Every row states `expandOrnaments` explicitly, in fifth place. The facade always passes it
    // (defaulting it to true) while the bare converter defaults it to false, so a row that left
    // it off would be comparing two different configurations and would only pass by the accident
    // that repeats_endings.mei carries no ornament sign.
    for (const [options, args] of [
      [{ ppq: 480 }, [480, true, false, true, true]],
      [{ dontUseChannel10: false }, [720, false, false, true, true]],
      [{ ignoreExpansions: true }, [720, true, true, true, true]],
      [{ cleanup: false }, [720, true, false, false, true]],
      [{ expandOrnaments: false }, [720, true, false, true, false]],
    ] as [
      Parameters<typeof convertMeiToMsmMpm>[1],
      [number, boolean, boolean, boolean, boolean],
    ][]) {
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
              .exportMidi(),
          ),
        );
      }
    });
  }
});
