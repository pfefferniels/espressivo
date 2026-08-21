import { describe, it, expect } from 'vitest';
import * as EventMaker from '../../src/midi/EventMaker.js';
import { shortData1, shortData2, messageStatus } from '../../src/midi/MidiTypes.js';
import type { ShortMessage } from '../../src/midi/MidiTypes.js';

/**
 * In Java, `new ShortMessage(...)` and `new MetaMessage(...)` throw
 * `InvalidMidiDataException` for out-of-range arguments. This port does not validate; it
 * masks — `channelMessage` ends in `data1 & 0x7f` and `MidiEvent`'s constructor is two
 * assignments — so every `EventMaker.createX` is total and none of them returns null.
 *
 * Hostile arguments therefore produce an event, and produce it by masking. Reintroduce
 * validation and the first blocks throw while the masked values in the last one change.
 */
describe('EventMaker is total', () => {
  const hostile = [-1, 0, 200, 99999, -99999];

  it.each(hostile)('createNoteOn/Off survive out-of-range arguments (%i)', (n) => {
    expect(EventMaker.createNoteOn(n, n, n, n)).toBeDefined();
    expect(EventMaker.createNoteOff(n, n, n, n)).toBeDefined();
  });

  it.each(hostile)('the meta-message makers survive them too (%i)', (n) => {
    expect(EventMaker.createProgramChange(n, n, n)).toBeDefined();
    expect(EventMaker.createControlChange(n, n, n, n)).toBeDefined();
    expect(EventMaker.createKeySignature(n, n)).toBeDefined();
    expect(EventMaker.createTimeSignature(n, n, n)).toBeDefined();
    expect(EventMaker.createTempo(n, n, n)).toBeDefined();
    expect(EventMaker.createChannelPrefix(n, n)).toBeDefined();
    expect(EventMaker.createMidiPortEvent(n, n)).toBeDefined();
  });

  it('the text makers survive an empty name and an unmatched one', () => {
    expect(EventMaker.createTrackName(0, '')).toBeDefined();
    expect(EventMaker.createInstrumentName(0, '\u{1F3BB} ünïcode')).toBeDefined();
    expect(EventMaker.createTextEvent(0, '')).toBeDefined();
    expect(EventMaker.createMarker(0, '')).toBeDefined();
    expect(EventMaker.createProgramChangeByName(0, 0, '')).toBeDefined();
    expect(EventMaker.createProgramChangeByName(0, 0, 'zzzzz not an instrument')).toBeDefined();
  });

  it('is total because it masks, not because it clamps — 200 becomes 72', () => {
    // Java throws here. Velocity is clamped (200 -> 127); pitch is not (200 -> 72).
    const event = EventMaker.createNoteOn(0, 0, 200, 200);
    const message = event.getMessage() as ShortMessage;
    expect(shortData1(message)).toBe(200 & 0x7f); // 72
    expect(shortData2(message)).toBe(127);
    // and the channel nibble wraps rather than rejecting
    expect(messageStatus(EventMaker.createNoteOn(20, 0, 60, 64).getMessage())).toBe(
      0x90 | (20 & 0x0f),
    );
  });
});
