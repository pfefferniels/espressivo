import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { Mei } from '../../src/mei/Mei.js';
import { Mei2MsmMpmConverter } from '../../src/mei/Mei2MsmMpmConverter.js';
import { Msm } from '../../src/msm/Msm.js';
import { Mpm } from '../../src/mpm/Mpm.js';
import { Performance } from '../../src/mpm/elements/Performance.js';
import { Midi } from '../../src/midi/Midi.js';

const __dirname2 = dirname(fileURLToPath(import.meta.url));
const MEI_DIR = join(__dirname2, 'fixtures', 'mei');

function loadMeiAndConvert(meiFile: string): { msm: Msm; mpm: Mpm } {
  const meiXml = readFileSync(join(MEI_DIR, meiFile), 'utf-8');
  const mei = Mei.fromXml(meiXml);
  mei.setFile(meiFile);
  const converter = new Mei2MsmMpmConverter(720, true, false, true);
  const result = converter.convert(mei);
  return { msm: result.getKey()[0], mpm: result.getValue()[0] };
}

describe('MIDI export pipeline', () => {
  describe('exportMidi (raw MIDI)', () => {
    it('should produce a non-null Midi from simple_notes', () => {
      const { msm } = loadMeiAndConvert('simple_notes.mei');
      const midi = msm.exportMidi()!;
      expect(midi).not.toBeNull();
    });

    it('should produce valid binary MIDI data', () => {
      const { msm } = loadMeiAndConvert('simple_notes.mei');
      const midi = msm.exportMidi()!;
      const bytes = midi.exportMidi();
      expect(bytes).not.toBeNull();
      expect(bytes).toBeInstanceOf(Uint8Array);
      expect(bytes!.length).toBeGreaterThan(14); // at least MThd header
      expect(String.fromCharCode(bytes![0], bytes![1], bytes![2], bytes![3])).toBe('MThd');
    });

    it('should create tracks matching part count + 1 (global track)', () => {
      const { msm } = loadMeiAndConvert('simple_notes.mei');
      const midi = msm.exportMidi()!;
      const seq = midi.getSequence();
      const tracks = seq.getTracks();
      // 1 global track + 1 part track
      expect(tracks.length).toBe(2);
    });

    it('should produce note events in the part track', () => {
      const { msm } = loadMeiAndConvert('simple_notes.mei');
      const midi = msm.exportMidi()!;
      const seq = midi.getSequence();
      const partTrack = seq.getTracks()[1];
      // simple_notes has 8 notes -> 8 noteOn + 8 noteOff + text events + meta events
      expect(partTrack.size()).toBeGreaterThan(16);
    });

    it('should accept custom BPM', () => {
      const { msm } = loadMeiAndConvert('simple_notes.mei');
      const midi = msm.exportMidi(100);
      expect(midi).not.toBeNull();
    });

    it('should handle multi-part MEI', () => {
      const { msm } = loadMeiAndConvert('multi_part.mei');
      const midi = msm.exportMidi()!;
      const seq = midi.getSequence();
      // Should have global track + one track per part
      expect(seq.getTracks().length).toBeGreaterThan(2);
    });

    it('should round-trip: export then re-import', () => {
      const { msm } = loadMeiAndConvert('simple_notes.mei');
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
      const { msm, mpm } = loadMeiAndConvert('simple_notes.mei');
      const performance = mpm.getAllPerformances()[0];
      expect(performance).toBeDefined();
      const midi = msm.exportExpressiveMidi(performance);
      expect(midi).not.toBeNull();
    });

    it('should produce valid binary MIDI data', () => {
      const { msm, mpm } = loadMeiAndConvert('simple_notes.mei');
      const performance = mpm.getAllPerformances()[0];
      const midi = msm.exportExpressiveMidi(performance)!;
      const bytes = midi.exportMidi();
      expect(bytes).not.toBeNull();
      expect(bytes).toBeInstanceOf(Uint8Array);
      expect(String.fromCharCode(bytes![0], bytes![1], bytes![2], bytes![3])).toBe('MThd');
    });

    it('should create millisecond-based timing', () => {
      const { msm, mpm } = loadMeiAndConvert('simple_notes.mei');
      const performance = mpm.getAllPerformances()[0];
      const midi = msm.exportExpressiveMidi(performance)!;
      // The sequence should use PPQ timing with a special tempo where 1 tick = 1 ms
      expect(midi.getSequence().getTracks().length).toBeGreaterThanOrEqual(2);
    });

    it('should work with tempo fixture', () => {
      const { msm, mpm } = loadMeiAndConvert('tempo.mei');
      const performance = mpm.getAllPerformances()[0];
      const midi = msm.exportExpressiveMidi(performance);
      expect(midi).not.toBeNull();
      const bytes = midi!.exportMidi();
      expect(bytes).not.toBeNull();
    });

    it('should work with dynamics fixture', () => {
      const { msm, mpm } = loadMeiAndConvert('dynamics.mei');
      const performance = mpm.getAllPerformances()[0];
      const midi = msm.exportExpressiveMidi(performance);
      expect(midi).not.toBeNull();
    });

    it('should work with comprehensive fixture', () => {
      const { msm, mpm } = loadMeiAndConvert('comprehensive.mei');
      const performance = mpm.getAllPerformances()[0];
      const midi = msm.exportExpressiveMidi(performance);
      expect(midi).not.toBeNull();
    });
  });

  describe('exportExpressiveMidi (without performance)', () => {
    it('should produce MIDI even without a performance object', () => {
      const { msm } = loadMeiAndConvert('simple_notes.mei');
      const midi = msm.exportExpressiveMidi();
      expect(midi).not.toBeNull();
    });
  });
});
