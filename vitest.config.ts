import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    testTimeout: 30000,
    coverage: {
      // Scope: this port exists for MEI / MSM+MPM => MIDI rendering.
      // Format conversions (MusicXML, MIDI->MSM, MEI->MusicXML), audio,
      // playback, chroma/pitches and SVG are explicitly out of scope.
      // T14 mechanical path update: `Meico.ts` became `version.ts` (RULE M6) and
      // `mei/Helper.ts` dissolved into `xml/`, `music/`, `msm/dateMap.ts`,
      // `mei/mpmNoteIds.ts` and `compat/` (§8.2). Same code, same scope — the `xml/**`
      // and `msm/**` globs already cover their share.
      include: [
        'src/version.ts',
        'src/mei/Mei.ts',
        'src/mei/mpmNoteIds.ts',
        'src/mei/Mei2MsmMpmConverter.ts',
        'src/msm/**/*.ts',
        'src/mpm/**/*.ts',
        'src/midi/Midi.ts',
        'src/midi/MidiTypes.ts',
        'src/midi/EventMaker.ts',
        'src/midi/InstrumentsDictionary.ts',
        'src/xml/**/*.ts',
        'src/music/**/*.ts',
        'src/compat/**/*.ts',
        'src/supplementary/KeyValue.ts',
        'src/supplementary/RandomNumberProvider.ts',
      ],
    },
  },
});
