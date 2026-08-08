import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    testTimeout: 30000,
    coverage: {
      // Scope: this port exists for MEI / MSM+MPM => MIDI rendering.
      // Format conversions (MusicXML, MIDI->MSM, MEI->MusicXML), audio,
      // playback, chroma/pitches and SVG are explicitly out of scope.
      include: [
        'src/Meico.ts',
        'src/mei/Mei.ts',
        'src/mei/Helper.ts',
        'src/mei/Mei2MsmMpmConverter.ts',
        'src/msm/**/*.ts',
        'src/mpm/**/*.ts',
        'src/midi/Midi.ts',
        'src/midi/MidiTypes.ts',
        'src/midi/EventMaker.ts',
        'src/midi/InstrumentsDictionary.ts',
        'src/xml/**/*.ts',
        'src/supplementary/KeyValue.ts',
        'src/supplementary/RandomNumberProvider.ts',
      ],
    },
  },
});
