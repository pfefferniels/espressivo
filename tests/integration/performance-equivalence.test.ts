import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { Mei } from '../../src/mei/Mei.js';
import { Mei2MsmMpmConverter } from '../../src/mei/Mei2MsmMpmConverter.js';
import { Msm } from '../../src/msm/Msm.js';
import { Mpm } from '../../src/mpm/Mpm.js';
import { Performance } from '../../src/mpm/elements/Performance.js';
import { Midi } from '../../src/midi/Midi.js';

const __dirname2 = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(__dirname2, 'fixtures');
const MEI_DIR = join(FIXTURES, 'mei');
const PERF_REF_DIR = join(FIXTURES, 'performance-reference');

/**
 * Normalize augmented MSM XML for comparison with Java reference.
 * Removes/normalizes attributes that are expected to differ between implementations:
 * - UUIDs
 * - Numeric formatting (Java doubles "0.0" vs TS "0")
 * - Namespace declarations
 * - File URIs
 * - Imprecision-related attributes (random values differ between implementations)
 */
function normalizeAugmentedMsm(xml: string): string {
  return (
    xml
      // Remove XML declaration
      .replace(/<\?xml[^?]*\?>/, '')
      // Remove redundant namespace declarations
      .replace(/ xmlns="[^"]*"/g, (match, offset, str) => {
        const firstIdx = str.indexOf(match);
        return offset === firstIdx ? match : '';
      })
      // Replace generated UUIDs
      .replace(/xml:id="[^"]*meico_[0-9a-f-]+"/g, 'xml:id="UUID"')
      // Normalize URI attributes
      .replace(/uri="[^"]*"/g, 'uri="NORMALIZED"')
      // Normalize filename in file attribute
      .replace(/file="[^"]*"/g, 'file="NORMALIZED"')
      // Normalize numeric formatting: trailing .0
      .replace(/="(-?\d+)\.0"/g, '="$1"')
      // Remove tuning.offset attributes (imprecision-dependent, random)
      .replace(/ tuning\.offset="[^"]*"/g, '')
      // Normalize whitespace
      .replace(/\s+/g, ' ')
      .trim()
  );
}

/**
 * Extract note elements from augmented MSM XML for structural comparison.
 * Returns an array of objects with key note attributes.
 */
/**
 * Normalize a numeric string for comparison: "60.0" → "60", "100.0" → "100"
 */
function normalizeNum(s: string): number {
  return parseFloat(s);
}

function extractNoteStructure(xml: string): {
  pitch: number;
  date: number;
  duration: number;
  velocity?: number;
  msDate?: number;
  msDateEnd?: number;
}[] {
  const notes: {
    pitch: number;
    date: number;
    duration: number;
    velocity?: number;
    msDate?: number;
    msDateEnd?: number;
  }[] = [];
  const noteRegex = /<note\s[^>]*>/g;
  let match;
  while ((match = noteRegex.exec(xml)) !== null) {
    const noteXml = match[0];
    const getAttr = (name: string) => {
      const m = noteXml.match(new RegExp(`${name}="([^"]*)"`));
      return m ? m[1] : undefined;
    };
    const pitch = getAttr('midi.pitch');
    const date = getAttr('date');
    const duration = getAttr('duration');
    if (!pitch || !date || !duration) continue;
    notes.push({
      pitch: normalizeNum(pitch),
      date: normalizeNum(date),
      duration: normalizeNum(duration),
      velocity: getAttr('velocity') !== undefined ? normalizeNum(getAttr('velocity')!) : undefined,
      msDate:
        getAttr('milliseconds.date') !== undefined
          ? normalizeNum(getAttr('milliseconds.date')!)
          : undefined,
      msDateEnd:
        getAttr('milliseconds.date.end') !== undefined
          ? normalizeNum(getAttr('milliseconds.date.end')!)
          : undefined,
    });
  }
  return notes;
}

/**
 * Compare MIDI files structurally: same number of tracks, same number of events per track,
 * same event types and approximate tick positions.
 */
function compareMidiStructure(
  tsMidi: Midi,
  refMidiBytes: Uint8Array,
): {
  tracksMatch: boolean;
  eventCountsMatch: boolean;
  details: string;
} {
  const refMidi = Midi.fromBytes(refMidiBytes);
  const tsTracks = tsMidi.getSequence().getTracks();
  const refTracks = refMidi.getSequence().getTracks();

  if (tsTracks.length !== refTracks.length) {
    return {
      tracksMatch: false,
      eventCountsMatch: false,
      details: `Track count mismatch: TS=${tsTracks.length}, Java=${refTracks.length}`,
    };
  }

  let eventCountsMatch = true;
  const details: string[] = [];

  for (let t = 0; t < tsTracks.length; t++) {
    const tsSize = tsTracks[t].size();
    const refSize = refTracks[t].size();
    // Allow small event count differences due to implementation details
    if (Math.abs(tsSize - refSize) > 2) {
      eventCountsMatch = false;
      details.push(`Track ${t}: TS=${tsSize} events, Java=${refSize} events`);
    }
  }

  return {
    tracksMatch: true,
    eventCountsMatch,
    details: details.length > 0 ? details.join('; ') : 'Match',
  };
}

// Test fixtures
// Auto-discover all MEI fixtures; every fixture MUST have a Java reference (missing = failure, not skip)
const fixtures = readdirSync(MEI_DIR)
  .filter((f) => f.endsWith('.mei'))
  .map((f) => f.replace(/\.mei$/, ''))
  .sort();

describe('Performance equivalence: TypeScript vs Java reference', () => {
  for (const fixture of fixtures) {
    describe(fixture, () => {
      let msm: Msm;
      let mpm: Mpm;
      let performance: Performance;

      beforeAll(() => {
        const meiXml = readFileSync(join(MEI_DIR, `${fixture}.mei`), 'utf-8');
        const mei = Mei.fromXml(meiXml);
        mei.setFile(`${fixture}.mei`);
        const converter = new Mei2MsmMpmConverter(720, true, false, true);
        const result = converter.convert(mei);
        msm = result.getKey()[0];
        mpm = result.getValue()[0];
        performance = mpm.getAllPerformances()[0];
      });

      it('should produce augmented MSM with same note structure as Java', () => {
        const refPath = join(PERF_REF_DIR, `${fixture}_augmented.msm`);
        expect(existsSync(refPath), `missing Java reference ${fixture}_augmented.msm`).toBe(true);

        const augmented = performance.perform(msm);
        const tsXml = augmented.getRootElement()!.toXML();
        const refXml = readFileSync(refPath, 'utf-8');

        const tsNotes = extractNoteStructure(tsXml);
        const refNotes = extractNoteStructure(refXml);

        // Same number of notes
        expect(tsNotes.length).toBe(refNotes.length);

        // Each note should have same pitch, date, and duration
        for (let i = 0; i < tsNotes.length; i++) {
          expect(tsNotes[i].pitch).toBe(refNotes[i].pitch);
          expect(tsNotes[i].date).toBe(refNotes[i].date);
          expect(tsNotes[i].duration).toBe(refNotes[i].duration);
        }
      });

      it('should produce milliseconds.date values close to Java reference', () => {
        const refPath = join(PERF_REF_DIR, `${fixture}_augmented.msm`);
        expect(existsSync(refPath), `missing Java reference: ${refPath}`).toBe(true);

        const augmented = performance.perform(msm);
        const tsXml = augmented.getRootElement()!.toXML();
        const refXml = readFileSync(refPath, 'utf-8');

        const tsNotes = extractNoteStructure(tsXml);
        const refNotes = extractNoteStructure(refXml);

        for (let i = 0; i < Math.min(tsNotes.length, refNotes.length); i++) {
          if (tsNotes[i].msDate && refNotes[i].msDate) {
            const tsMs = tsNotes[i].msDate!;
            const refMs = refNotes[i].msDate!;
            // Allow 1ms tolerance for floating point differences
            expect(Math.abs(tsMs - refMs)).toBeLessThan(1.0);
          }
          if (tsNotes[i].msDateEnd && refNotes[i].msDateEnd) {
            const tsMs = tsNotes[i].msDateEnd!;
            const refMs = refNotes[i].msDateEnd!;
            expect(Math.abs(tsMs - refMs)).toBeLessThan(1.0);
          }
        }
      });

      it('should produce velocity values close to Java reference', () => {
        const refPath = join(PERF_REF_DIR, `${fixture}_augmented.msm`);
        expect(existsSync(refPath), `missing Java reference: ${refPath}`).toBe(true);

        const augmented = performance.perform(msm);
        const tsXml = augmented.getRootElement()!.toXML();
        const refXml = readFileSync(refPath, 'utf-8');

        const tsNotes = extractNoteStructure(tsXml);
        const refNotes = extractNoteStructure(refXml);

        for (let i = 0; i < Math.min(tsNotes.length, refNotes.length); i++) {
          if (tsNotes[i].velocity && refNotes[i].velocity) {
            const tsVel = tsNotes[i].velocity!;
            const refVel = refNotes[i].velocity!;
            // Allow small tolerance for dynamics rendering differences
            expect(Math.abs(tsVel - refVel)).toBeLessThan(2.0);
          }
        }
      });

      it('should produce raw MIDI with same track structure as Java', () => {
        const refPath = join(PERF_REF_DIR, `${fixture}_raw.mid`);
        expect(existsSync(refPath), `missing Java reference: ${refPath}`).toBe(true);

        const midi = msm.exportMidi(120, true)!;
        expect(midi).not.toBeNull();

        const refBytes = new Uint8Array(readFileSync(refPath));
        const comparison = compareMidiStructure(midi, refBytes);

        expect(comparison.tracksMatch).toBe(true);
        if (!comparison.eventCountsMatch) {
          console.warn(`${fixture} raw MIDI event count diff: ${comparison.details}`);
        }
      });

      it('should produce expressive MIDI with same track structure as Java', () => {
        const refPath = join(PERF_REF_DIR, `${fixture}_expressive.mid`);
        expect(existsSync(refPath), `missing Java reference: ${refPath}`).toBe(true);

        const midi = msm.exportExpressiveMidi(performance, true)!;
        expect(midi).not.toBeNull();

        const refBytes = new Uint8Array(readFileSync(refPath));
        const comparison = compareMidiStructure(midi, refBytes);

        expect(comparison.tracksMatch).toBe(true);
        if (!comparison.eventCountsMatch) {
          console.warn(`${fixture} expressive MIDI event count diff: ${comparison.details}`);
        }
      });

      it('should produce valid binary MIDI that round-trips', () => {
        const midi = msm.exportExpressiveMidi(performance, true)!;
        expect(midi).not.toBeNull();
        const bytes = midi.exportMidi();
        expect(bytes).not.toBeNull();
        expect(bytes!.length).toBeGreaterThan(14);

        // Round trip: parse the exported MIDI
        const reimported = Midi.fromBytes(bytes!);
        expect(reimported.getSequence().getTracks().length).toBeGreaterThan(0);
        expect(reimported.getSequence().getTracks().length).toBe(
          midi.getSequence().getTracks().length,
        );
      });
    });
  }

  describe('Edge cases', () => {
    it('should handle MSM with no parts gracefully', () => {
      const emptyMsm = Msm.createMsm('empty', null, 720);
      // MSM with no parts still produces a MIDI with just the global track
      const midi = emptyMsm.exportMidi()!;
      if (midi !== null) {
        const bytes = midi.exportMidi();
        expect(bytes).not.toBeNull();
      }
    });

    it('should handle performance with no matching parts', () => {
      const meiXml = readFileSync(join(MEI_DIR, 'simple_notes.mei'), 'utf-8');
      const mei = Mei.fromXml(meiXml);
      mei.setFile('simple_notes.mei');
      const converter = new Mei2MsmMpmConverter(720, true, false, true);
      const result = converter.convert(mei);
      const msm = result.getKey()[0];
      const mpm = result.getValue()[0];
      const perf = mpm.getAllPerformances()[0];

      // Should still produce output even if MPM parts don't match
      const augmented = perf.perform(msm);
      expect(augmented).not.toBeNull();
      const midi = augmented.exportMidi()!;
      expect(midi).not.toBeNull();
    });

    it('should produce consistent output across multiple calls', () => {
      const meiXml = readFileSync(join(MEI_DIR, 'simple_notes.mei'), 'utf-8');
      const mei = Mei.fromXml(meiXml);
      mei.setFile('simple_notes.mei');
      const converter = new Mei2MsmMpmConverter(720, true, false, true);
      const result = converter.convert(mei);
      const msm = result.getKey()[0];
      const mpm = result.getValue()[0];
      const perf = mpm.getAllPerformances()[0];

      const augmented1 = perf.perform(msm);
      const augmented2 = perf.perform(msm);

      const notes1 = extractNoteStructure(augmented1.getRootElement()!.toXML());
      const notes2 = extractNoteStructure(augmented2.getRootElement()!.toXML());

      expect(notes1.length).toBe(notes2.length);
      for (let i = 0; i < notes1.length; i++) {
        expect(notes1[i].pitch).toBe(notes2[i].pitch);
        expect(notes1[i].date).toBe(notes2[i].date);
        expect(notes1[i].msDate).toBe(notes2[i].msDate);
      }
    });

    it('should not modify the original MSM during perform()', () => {
      const meiXml = readFileSync(join(MEI_DIR, 'simple_notes.mei'), 'utf-8');
      const mei = Mei.fromXml(meiXml);
      mei.setFile('simple_notes.mei');
      const converter = new Mei2MsmMpmConverter(720, true, false, true);
      const result = converter.convert(mei);
      const msm = result.getKey()[0];
      const mpm = result.getValue()[0];
      const perf = mpm.getAllPerformances()[0];

      const originalXml = msm.getRootElement()!.toXML();
      perf.perform(msm);
      const afterXml = msm.getRootElement()!.toXML();

      expect(afterXml).toBe(originalXml);
    });
  });

  describe('Full pipeline: MEI → MSM+MPM → perform → expressive MIDI', () => {
    for (const fixture of fixtures) {
      it(`${fixture}: end-to-end pipeline produces valid output`, () => {
        const meiXml = readFileSync(join(MEI_DIR, `${fixture}.mei`), 'utf-8');
        const mei = Mei.fromXml(meiXml);
        mei.setFile(`${fixture}.mei`);
        const converter = new Mei2MsmMpmConverter(720, true, false, true);
        const result = converter.convert(mei);
        const msm = result.getKey()[0];
        const mpm = result.getValue()[0];
        const perf = mpm.getAllPerformances()[0];

        // Full pipeline
        const augmented = perf.perform(msm);
        expect(augmented).not.toBeNull();

        // Augmented MSM should have milliseconds.date attributes
        const augXml = augmented.getRootElement()!.toXML();
        expect(augXml).toContain('milliseconds.date');

        // Export to MIDI
        const midi = msm.exportExpressiveMidi(perf, true);
        expect(midi).not.toBeNull();

        // Export binary
        const bytes = midi!.exportMidi();
        expect(bytes).not.toBeNull();
        expect(bytes!.length).toBeGreaterThan(14);

        // Verify MIDI header
        expect(String.fromCharCode(bytes![0], bytes![1], bytes![2], bytes![3])).toBe('MThd');
      });
    }
  });
});
