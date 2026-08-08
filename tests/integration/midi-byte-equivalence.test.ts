/**
 * MIDI byte-level equivalence tests.
 * Compares TS MIDI output event-by-event against Java reference MIDI files.
 * Tests both MEI-based and programmatic (all-maps) fixtures.
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
import { ShortMessage, MetaMessage } from '../../src/midi/MidiTypes.js';

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
}

function extractEvents(midi: Midi): MidiEventInfo[][] {
  const tracks: MidiEventInfo[][] = [];
  for (const track of midi.getSequence().getTracks()) {
    const events: MidiEventInfo[] = [];
    for (let i = 0; i < track.size(); i++) {
      const event = track.get(i);
      const msg = event.getMessage();
      const info: MidiEventInfo = { tick: event.getTick(), type: 'other' };

      if (msg instanceof ShortMessage) {
        info.channel = msg.getChannel();
        info.data1 = msg.getData1();
        info.data2 = msg.getData2();
        switch (msg.getCommand()) {
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
      } else if (msg instanceof MetaMessage) {
        info.type = 'meta';
        info.metaType = msg.getType();
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

  for (let t = 0; t < tsEvents.length; t++) {
    const tsTrack = tsEvents[t];
    const refTrack = refEvents[t];

    // Filter out end-of-track meta events for comparison (always present but may differ in placement)
    const tsFiltered = tsTrack.filter((e) => !(e.type === 'meta' && e.metaType === 0x2f));
    const refFiltered = refTrack.filter((e) => !(e.type === 'meta' && e.metaType === 0x2f));

    if (tsFiltered.length !== refFiltered.length) {
      diffs.push(`Track ${t} event count: TS=${tsFiltered.length} vs Java=${refFiltered.length}`);
      // Still compare what we can
    }

    const len = Math.min(tsFiltered.length, refFiltered.length);
    for (let i = 0; i < len; i++) {
      const te = tsFiltered[i];
      const re = refFiltered[i];

      if (te.type !== re.type) {
        diffs.push(`Track ${t} event ${i}: type TS=${te.type} vs Java=${re.type}`);
        continue;
      }

      if (Math.abs(te.tick - re.tick) > tickTolerance) {
        diffs.push(`Track ${t} event ${i} (${te.type}): tick TS=${te.tick} vs Java=${re.tick}`);
      }

      if (te.type === 'noteOn' || te.type === 'noteOff') {
        if (te.channel !== re.channel)
          diffs.push(`Track ${t} event ${i}: channel TS=${te.channel} vs Java=${re.channel}`);
        if (te.data1 !== re.data1)
          diffs.push(`Track ${t} event ${i}: pitch TS=${te.data1} vs Java=${re.data1}`);
        if (te.type === 'noteOn' && te.data2 !== re.data2)
          diffs.push(`Track ${t} event ${i}: velocity TS=${te.data2} vs Java=${re.data2}`);
      } else if (te.type === 'controlChange') {
        if (te.data1 !== re.data1)
          diffs.push(`Track ${t} event ${i}: CC# TS=${te.data1} vs Java=${re.data1}`);
        if (te.data2 !== re.data2)
          diffs.push(`Track ${t} event ${i}: CC value TS=${te.data2} vs Java=${re.data2}`);
      } else if (te.type === 'meta') {
        if (te.metaType !== re.metaType)
          diffs.push(`Track ${t} event ${i}: metaType TS=${te.metaType} vs Java=${re.metaType}`);
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
      const refMidi = new Midi(refBytes);

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
      const refMidi = new Midi(refBytes);

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
      const refMidi = new Midi(refBytes);

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
      const refMidi = new Midi(refBytes);

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
    const refMidi = new Midi(refBytes);

    const tsEvents = extractEvents(tsMidi);
    const refEvents = extractEvents(refMidi);
    const diffs = compareEvents(tsEvents, refEvents);

    if (diffs.length > 0)
      expect.fail(`${diffs.length} MIDI differences:\n${diffs.map((d) => `  - ${d}`).join('\n')}`);
  });
});
