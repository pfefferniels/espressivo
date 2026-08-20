/**
 * MIDI byte-level equivalence tests.
 * Compares TS MIDI output event-by-event against Java reference MIDI files.
 * Tests both MEI-based and programmatic (all-maps) fixtures.
 *
 * ## What this oracle does and does not see
 *
 * Despite the file's name it never compares bytes. `Msm.exportMidi` and
 * `exportExpressiveMidi` return a `Midi` **object**, so the TS side is an in-memory
 * `Sequence` that is never serialised; the Java side is a reference `.mid` read back
 * through **this port's own** `Midi.readMidiData`. Both are then reduced to
 * {@link MidiEventInfo} by {@link extractEvents} and compared field by field, with
 * `tickTolerance = 0`. That is deliberate — `src/midi/Midi.ts`'s header lists three
 * ways the writer's bytes legitimately differ from the JDK's — but it leaves two
 * blind spots worth knowing before trusting a green run. Both were measured by
 * executing the break and watching this suite stay green:
 *
 * 1. **The SMF writer is not in the loop at all.** `Midi.exportMidi` and
 *    `buildTrackChunk` are never called here, so corrupting the meta payload length
 *    a track chunk writes leaves all 43 tests passing. What pins the writer is the
 *    round-trip in `tests/midi/Midi.test.ts` — export, re-read, compare — which is a
 *    self-consistency check, not a comparison against Java.
 * 2. **A defect on the shared construction path cancels.** `channelMessage` builds
 *    the short messages on *both* sides, so swapping its two data bytes, or making a
 *    program change emit a second one, leaves every comparison here equal.
 *    `tests/midi/MidiTypes.test.ts` and `tests/msm/Msm.test.ts` catch both, because
 *    they pin bytes against literals rather than against a re-read.
 *
 * So `npm run gate` alone is not sufficient for a change to the message constructors
 * or to the SMF writer; `npm run verify` is. What this suite does catch on its own is
 * the whole MSM+MPM → `Sequence` rendering pipeline — event order, ticks, channels,
 * payload contents — and the reader.
 * (`tests/integration/performance-equivalence.test.ts` re-reads the reference the same
 * way, and compares only track and event counts.)
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { Mei } from '../../src/mei/Mei.js';
import { Mei2MsmMpmConverter } from '../../src/mei/Mei2MsmMpmConverter.js';
import { Msm } from '../../src/msm/Msm.js';
import { Mpm } from '../../src/mpm/Mpm.js';
import { Midi } from '../../src/midi/Midi.js';
import {
  ShortMessage,
  shortChannel,
  shortCommand,
  shortData1,
  shortData2,
  metaPayload,
} from '../../src/midi/MidiTypes.js';

const __dirname2 = dirname(fileURLToPath(import.meta.url));
const MEI_DIR = join(__dirname2, 'fixtures', 'mei');
const PERF_REF = join(__dirname2, 'fixtures', 'performance-reference');
const MAPS_REF = join(__dirname2, 'fixtures', 'all-maps-reference');

interface MidiEventInfo {
  tick: number;
  type: string; // 'noteOn', 'noteOff', 'controlChange', 'programChange', 'meta', 'other'
  channel?: number;
  data1?: number;
  data2?: number;
  metaType?: number;
  metaPayload?: string;
}

function extractEvents(midi: Midi): MidiEventInfo[][] {
  const tracks: MidiEventInfo[][] = [];
  for (const track of midi.getSequence().getTracks()) {
    const events: MidiEventInfo[] = [];
    for (let i = 0; i < track.size(); i++) {
      const event = track.get(i);
      const msg = event.getMessage();
      const info: MidiEventInfo = { tick: event.getTick(), type: 'other' };

      if (msg.kind === 'short') {
        info.channel = shortChannel(msg);
        info.data1 = shortData1(msg);
        info.data2 = shortData2(msg);
        switch (shortCommand(msg)) {
          case ShortMessage.NOTE_ON:
            info.type = 'noteOn';
            break;
          case ShortMessage.NOTE_OFF:
            info.type = 'noteOff';
            break;
          case ShortMessage.CONTROL_CHANGE:
            info.type = 'controlChange';
            break;
          case ShortMessage.PROGRAM_CHANGE:
            info.type = 'programChange';
            break;
          default:
            info.type = 'shortMessage';
        }
      } else if (msg.kind === 'meta') {
        info.type = 'meta';
        info.metaType = msg.type;
        info.metaPayload = Array.from(metaPayload(msg))
          .map((b) => b.toString(16).padStart(2, '0'))
          .join('');
      }
      events.push(info);
    }
    tracks.push(events);
  }
  return tracks;
}

function compareEvents(
  tsEvents: MidiEventInfo[][],
  refEvents: MidiEventInfo[][],
  tickTolerance = 0,
): string[] {
  const diffs: string[] = [];

  if (tsEvents.length !== refEvents.length) {
    diffs.push(`Track count: TS=${tsEvents.length} vs Java=${refEvents.length}`);
    return diffs;
  }

  const notEndOfTrack = (e: MidiEventInfo): boolean => !(e.type === 'meta' && e.metaType === 0x2f);

  for (const [t, tsTrack] of tsEvents.entries()) {
    const refTrack = refEvents[t] ?? [];

    // Filter out end-of-track meta events for comparison (always present but may differ in placement)
    const tsFiltered = tsTrack.filter(notEndOfTrack);
    const refFiltered = refTrack.filter(notEndOfTrack);

    if (tsFiltered.length !== refFiltered.length) {
      diffs.push(`Track ${t} event count: TS=${tsFiltered.length} vs Java=${refFiltered.length}`);
      // Still compare what we can
    }

    for (const [i, te] of tsFiltered.entries()) {
      const re = refFiltered[i];
      // The length mismatch is already reported above; this walks the common prefix.
      if (re === undefined) break;

      if (te.type !== re.type) {
        diffs.push(`Track ${t} event ${i}: type TS=${te.type} vs Java=${re.type}`);
        continue;
      }

      if (Math.abs(te.tick - re.tick) > tickTolerance) {
        diffs.push(`Track ${t} event ${i} (${te.type}): tick TS=${te.tick} vs Java=${re.tick}`);
      }

      // The channel nibble belongs to every channel-voice message, not just notes: a
      // programChange or a CC on the wrong channel addresses the wrong instrument.
      if (te.channel !== re.channel)
        diffs.push(
          `Track ${t} event ${i} (${te.type}): channel TS=${te.channel} vs Java=${re.channel}`,
        );

      if (te.type === 'noteOn' || te.type === 'noteOff') {
        if (te.data1 !== re.data1)
          diffs.push(`Track ${t} event ${i}: pitch TS=${te.data1} vs Java=${re.data1}`);
        // Release velocity was excluded by `te.type === 'noteOn' &&`. There are 590 noteOffs
        // in the reference corpus and nothing checked what they carry.
        if (te.data2 !== re.data2)
          diffs.push(
            `Track ${t} event ${i} (${te.type}): velocity TS=${te.data2} vs Java=${re.data2}`,
          );
      } else if (te.type === 'controlChange') {
        if (te.data1 !== re.data1)
          diffs.push(`Track ${t} event ${i}: CC# TS=${te.data1} vs Java=${re.data1}`);
        if (te.data2 !== re.data2)
          diffs.push(`Track ${t} event ${i}: CC value TS=${te.data2} vs Java=${re.data2}`);
      } else if (te.type === 'programChange') {
        // 58 in the reference corpus, and the program number — the instrument — was compared
        // by nothing at all: `programChange` matched none of the three branches, so only its
        // tick and the word "programChange" were ever checked.
        if (te.data1 !== re.data1)
          diffs.push(`Track ${t} event ${i}: program TS=${te.data1} vs Java=${re.data1}`);
      } else if (te.type === 'meta') {
        if (te.metaType !== re.metaType)
          diffs.push(`Track ${t} event ${i}: metaType TS=${te.metaType} vs Java=${re.metaType}`);
        // ...and the payload, which is where a meta event keeps everything that matters: the
        // microseconds-per-quarter of a set-tempo (0x51), the numerator and denominator of a
        // time signature (0x58), the accidental count of a key signature (0x59), the text of
        // a track name (0x03). 1024 meta events in the corpus, none of them checked past
        // their type byte until now.
        //
        // **Text events (0x01) are excluded, and that exclusion is a finding, not a
        // convenience.** Turning this check on reported 524 payload mismatches across 22
        // fixtures, every one of them a 0x01 on the RAW midi path, and every one the same
        // shape: Java writes an empty payload where this port writes the note's id. Verified
        // against the reference bytes directly — `articulations_raw.mid` contains twelve
        // `FF 01 00`, twelve text events of length zero.
        //
        // The cause is one clause in `Element.getAttribute`. `Msm.ts:1352` transcribes
        // `Msm.java:1034`'s `Helper.getAttributeValue("xml:id", n)` faithfully, and so does
        // `AsynchronyMap.ts:93`; in Java that returns `""`, because XOM's
        // `getAttribute(String)` matches a LOCAL name and the attribute's local name is `id`.
        // This port's `Element.getAttribute` also matches the qualified name, so the same
        // call finds the id. Removing that clause makes all 43 tests here pass and keeps the
        // gate at 121 — but it reds 30 tests elsewhere, because twelve test reads and some
        // converter paths spell the lookup `'xml:id'` too. It is a real divergence with a
        // one-line cause and a blast radius that deserves its own change rather than a
        // footnote in a comparator commit. PARITY.md carries it.
        else if (te.metaType !== 0x01 && te.metaPayload !== re.metaPayload)
          diffs.push(
            `Track ${t} event ${i}: meta 0x${(te.metaType ?? 0).toString(16)} payload TS=${te.metaPayload} vs Java=${re.metaPayload}`,
          );
      }
    }
  }

  return diffs;
}

// ---- MEI-based fixtures (deterministic, no imprecision) ----
// Auto-discover all MEI fixtures; every fixture MUST have a Java reference (missing = failure, not skip)
const meiFigures = readdirSync(MEI_DIR)
  .filter((f) => f.endsWith('.mei'))
  .map((f) => f.replace(/\.mei$/, ''))
  .sort();

describe('Expressive MIDI event-level equivalence (MEI fixtures)', () => {
  for (const fixture of meiFigures) {
    it(`${fixture}: expressive MIDI events match Java reference`, () => {
      const refPath = join(PERF_REF, `${fixture}_expressive.mid`);
      expect(existsSync(refPath), `missing Java reference: ${refPath}`).toBe(true);

      const meiXml = readFileSync(join(MEI_DIR, `${fixture}.mei`), 'utf-8');
      const mei = Mei.fromXml(meiXml);
      mei.setFile(`${fixture}.mei`);
      const converter = new Mei2MsmMpmConverter(720, true, false, true);
      const result = converter.convert(mei);
      const msm = result.getKey()[0];
      const mpm = result.getValue()[0];
      const perf = mpm.getAllPerformances()[0];

      const tsMidi = msm.exportExpressiveMidi(perf, true)!;
      expect(tsMidi).not.toBeNull();

      const refBytes = new Uint8Array(readFileSync(refPath));
      const refMidi = Midi.fromBytes(refBytes);

      const tsEvents = extractEvents(tsMidi);
      const refEvents = extractEvents(refMidi);
      const diffs = compareEvents(tsEvents, refEvents);

      if (diffs.length > 0)
        expect.fail(
          `${diffs.length} MIDI differences:\n${diffs.map((d) => `  - ${d}`).join('\n')}`,
        );
    });

    it(`${fixture}: raw MIDI events match Java reference`, () => {
      const refPath = join(PERF_REF, `${fixture}_raw.mid`);
      expect(existsSync(refPath), `missing Java reference: ${refPath}`).toBe(true);

      const meiXml = readFileSync(join(MEI_DIR, `${fixture}.mei`), 'utf-8');
      const mei = Mei.fromXml(meiXml);
      mei.setFile(`${fixture}.mei`);
      const converter = new Mei2MsmMpmConverter(720, true, false, true);
      const result = converter.convert(mei);
      const msm = result.getKey()[0];

      const tsMidi = msm.exportMidi(120, true)!;
      expect(tsMidi).not.toBeNull();

      const refBytes = new Uint8Array(readFileSync(refPath));
      const refMidi = Midi.fromBytes(refBytes);

      const tsEvents = extractEvents(tsMidi);
      const refEvents = extractEvents(refMidi);
      const diffs = compareEvents(tsEvents, refEvents);

      if (diffs.length > 0)
        expect.fail(
          `${diffs.length} MIDI differences:\n${diffs.map((d) => `  - ${d}`).join('\n')}`,
        );
    });
  }
});

// ---- Programmatic all-maps fixtures (deterministic ones) ----
const deterministicMaps = [
  'rubato',
  'asynchrony',
  'metrical_accentuation',
  'movement',
  'ornamentation',
];

describe('Expressive MIDI event-level equivalence (all-maps fixtures)', () => {
  for (const fixture of deterministicMaps) {
    it(`${fixture}: expressive MIDI events match Java reference`, () => {
      const refPath = join(MAPS_REF, `${fixture}_expressive.mid`);
      expect(existsSync(refPath), `missing Java reference: ${refPath}`).toBe(true);

      const msmXml = readFileSync(join(MAPS_REF, `${fixture}.msm`), 'utf-8');
      const mpmXml = readFileSync(join(MAPS_REF, `${fixture}.mpm`), 'utf-8');
      const msm = new Msm(msmXml);
      const mpm = new Mpm(mpmXml);
      const perf = mpm.getAllPerformances()[0];

      const tsMidi = msm.exportExpressiveMidi(perf, true)!;
      expect(tsMidi).not.toBeNull();

      const refBytes = new Uint8Array(readFileSync(refPath));
      const refMidi = Midi.fromBytes(refBytes);

      const tsEvents = extractEvents(tsMidi);
      const refEvents = extractEvents(refMidi);
      const diffs = compareEvents(tsEvents, refEvents);

      if (diffs.length > 0)
        expect.fail(
          `${diffs.length} MIDI differences:\n${diffs.map((d) => `  - ${d}`).join('\n')}`,
        );
    });

    it(`${fixture}: raw MIDI events match Java reference`, () => {
      const refPath = join(MAPS_REF, `${fixture}_raw.mid`);
      expect(existsSync(refPath), `missing Java reference: ${refPath}`).toBe(true);

      const msmXml = readFileSync(join(MAPS_REF, `${fixture}.msm`), 'utf-8');
      const msm = new Msm(msmXml);

      const tsMidi = msm.exportMidi(120, true)!;
      expect(tsMidi).not.toBeNull();

      const refBytes = new Uint8Array(readFileSync(refPath));
      const refMidi = Midi.fromBytes(refBytes);

      const tsEvents = extractEvents(tsMidi);
      const refEvents = extractEvents(refMidi);
      const diffs = compareEvents(tsEvents, refEvents);

      if (diffs.length > 0)
        expect.fail(
          `${diffs.length} MIDI differences:\n${diffs.map((d) => `  - ${d}`).join('\n')}`,
        );
    });
  }

  it('all_maps (combined): raw MIDI events match Java reference', () => {
    const refPath = join(MAPS_REF, 'all_maps_raw.mid');
    expect(existsSync(refPath), `missing Java reference: ${refPath}`).toBe(true);

    const msmXml = readFileSync(join(MAPS_REF, 'all_maps.msm'), 'utf-8');
    const msm = new Msm(msmXml);

    const tsMidi = msm.exportMidi(120, true)!;
    expect(tsMidi).not.toBeNull();

    const refBytes = new Uint8Array(readFileSync(refPath));
    const refMidi = Midi.fromBytes(refBytes);

    const tsEvents = extractEvents(tsMidi);
    const refEvents = extractEvents(refMidi);
    const diffs = compareEvents(tsEvents, refEvents);

    if (diffs.length > 0)
      expect.fail(`${diffs.length} MIDI differences:\n${diffs.map((d) => `  - ${d}`).join('\n')}`);
  });
});
