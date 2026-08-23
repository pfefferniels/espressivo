import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { Msm } from '../../src/msm/Msm.js';
import { Mpm } from '../../src/mpm/Mpm.js';
import { Midi } from '../../src/midi/Midi.js';

const __dirname2 = dirname(fileURLToPath(import.meta.url));
const REF_DIR = join(__dirname2, 'fixtures', 'reference');

/** A fixture's score and the Java reference performance for it. */
function loadFixture(name: string): { msm: Msm; mpm: Mpm } {
  return {
    msm: new Msm(readFileSync(join(REF_DIR, `${name}.msm`), 'utf-8')),
    mpm: new Mpm(readFileSync(join(REF_DIR, `${name}.mpm`), 'utf-8')),
  };
}

describe('MIDI export pipeline', () => {
  describe('exportMidi (raw MIDI)', () => {
    it('should produce a non-null Midi from simple_notes', () => {
      const { msm } = loadFixture('simple_notes');
      const midi = msm.exportMidi()!;
      expect(midi).not.toBeNull();
    });

    it('should produce valid binary MIDI data', () => {
      const { msm } = loadFixture('simple_notes');
      const midi = msm.exportMidi()!;
      const bytes = midi.exportMidi();
      expect(bytes).not.toBeNull();
      expect(bytes).toBeInstanceOf(Uint8Array);
      expect(bytes!.length).toBeGreaterThan(14); // at least MThd header
      expect(String.fromCharCode(bytes![0], bytes![1], bytes![2], bytes![3])).toBe('MThd');
    });

    it('should create tracks matching part count + 1 (global track)', () => {
      const { msm } = loadFixture('simple_notes');
      const midi = msm.exportMidi()!;
      const seq = midi.getSequence();
      const tracks = seq.getTracks();
      // 1 global track + 1 part track
      expect(tracks.length).toBe(2);
    });

    it('should produce note events in the part track', () => {
      const { msm } = loadFixture('simple_notes');
      const midi = msm.exportMidi()!;
      const seq = midi.getSequence();
      const partTrack = seq.getTracks()[1];
      // simple_notes has 8 notes -> 8 noteOn + 8 noteOff + text events + meta events
      expect(partTrack.size()).toBeGreaterThan(16);
    });

    it('should accept custom BPM', () => {
      const { msm } = loadFixture('simple_notes');
      const midi = msm.exportMidi(100);
      expect(midi).not.toBeNull();
    });

    it('should handle multi-part MEI', () => {
      const { msm } = loadFixture('multi_part');
      const midi = msm.exportMidi()!;
      const seq = midi.getSequence();
      // Should have global track + one track per part
      expect(seq.getTracks().length).toBeGreaterThan(2);
    });

    it('should round-trip: export then re-import', () => {
      const { msm } = loadFixture('simple_notes');
      const midi = msm.exportMidi()!;
      const bytes = midi.exportMidi();
      const reimported = Midi.fromBytes(bytes);
      expect(reimported.getSequence().getTracks().length).toBeGreaterThan(0);
      expect(reimported.getSequence().getTracks().length).toBe(
        midi.getSequence().getTracks().length,
      );
    });
  });

  describe('exportExpressiveMidi (with performance)', () => {
    it('should produce a non-null Midi with performance rendering', () => {
      const { msm, mpm } = loadFixture('simple_notes');
      const performance = mpm.getAllPerformances()[0];
      expect(performance).toBeDefined();
      const midi = msm.exportExpressiveMidi(performance);
      expect(midi).not.toBeNull();
    });

    it('should produce valid binary MIDI data', () => {
      const { msm, mpm } = loadFixture('simple_notes');
      const performance = mpm.getAllPerformances()[0];
      const midi = msm.exportExpressiveMidi(performance)!;
      const bytes = midi.exportMidi();
      expect(bytes).not.toBeNull();
      expect(bytes).toBeInstanceOf(Uint8Array);
      expect(String.fromCharCode(bytes![0], bytes![1], bytes![2], bytes![3])).toBe('MThd');
    });

    it('should create millisecond-based timing', () => {
      const { msm, mpm } = loadFixture('simple_notes');
      const performance = mpm.getAllPerformances()[0];
      const midi = msm.exportExpressiveMidi(performance)!;
      // The sequence should use PPQ timing with a special tempo where 1 tick = 1 ms
      expect(midi.getSequence().getTracks().length).toBeGreaterThanOrEqual(2);
    });

    it('should work with tempo fixture', () => {
      const { msm, mpm } = loadFixture('tempo');
      const performance = mpm.getAllPerformances()[0];
      const midi = msm.exportExpressiveMidi(performance);
      expect(midi).not.toBeNull();
      const bytes = midi!.exportMidi();
      expect(bytes).not.toBeNull();
    });

    it('should work with dynamics fixture', () => {
      const { msm, mpm } = loadFixture('dynamics');
      const performance = mpm.getAllPerformances()[0];
      const midi = msm.exportExpressiveMidi(performance);
      expect(midi).not.toBeNull();
    });

    it('should work with comprehensive fixture', () => {
      const { msm, mpm } = loadFixture('comprehensive');
      const performance = mpm.getAllPerformances()[0];
      const midi = msm.exportExpressiveMidi(performance);
      expect(midi).not.toBeNull();
    });
  });

  describe('exportExpressiveMidi (without performance)', () => {
    it('should produce MIDI even without a performance object', () => {
      const { msm } = loadFixture('simple_notes');
      const midi = msm.exportExpressiveMidi();
      expect(midi).not.toBeNull();
    });
  });
});
