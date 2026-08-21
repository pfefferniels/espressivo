import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    // High rather than absent. Under the concurrent load this repo is developed with, a tight
    // timeout fires on a different test each run and reads as a regression rather than as
    // contention. A timeout still has a job: PARITY.md records a non-terminating loop
    // inherited from Java, so a hang is a real failure mode here. 120s is far above the
    // slowest honest test (~6s).
    testTimeout: 120000,
    // Agent worktrees live under `.claude/worktrees/` inside the repo. Without this the suite
    // discovers every checkout's copy of `tests/**` and runs one green tree plus whatever a
    // half-finished branch is doing.
    exclude: ['**/node_modules/**', '**/dist/**', '.claude/worktrees/**'],
    coverage: {
      // Scope: this port exists for MEI / MSM+MPM => MIDI rendering. Everything that reads
      // the MPM vocabulary through the same def and style semantics as the renderer is in
      // scope — the expression transform, which writes such documents, and the comparison
      // module, which reads two of them — because a divergence there misrenders or
      // misreports. Out of scope, deliberately: format conversions (MusicXML, MIDI->MSM,
      // MEI->MusicXML), audio, playback, chroma/pitches and SVG.
      //
      // The list is curated, not a glob (comparison/DESIGN.md §9.7). `src/supplementary/` in
      // particular is named file by file, so a new module there is invisible to the coverage
      // invariant until someone adds it here.
      include: [
        'src/version.ts',
        // The prelude is in scope by definition: it is the vocabulary every other module in
        // this list is being rewritten in, so a gap in its coverage is a gap in all of them.
        'src/prelude/**/*.ts',
        'src/units.ts',
        'src/api/**/*.ts',
        'src/comparison/**/*.ts',
        'src/expression/**/*.ts',
        'src/mei/Mei.ts',
        'src/mei/mpmNoteIds.ts',
        'src/mei/Mei2MsmMpmConverter.ts',
        'src/mei/MeiOrnamentExpander.ts',
        'src/mei/ornamentsDict.ts',
        'src/msm/**/*.ts',
        'src/mpm/**/*.ts',
        'src/midi/Midi.ts',
        'src/midi/MidiTypes.ts',
        'src/midi/EventMaker.ts',
        'src/midi/InstrumentsDictionary.ts',
        'src/xml/**/*.ts',
        'src/music/**/*.ts',
        'src/supplementary/KeyValue.ts',
        'src/supplementary/parseJavaDouble.ts',
        'src/supplementary/RandomNumberProvider.ts',
      ],
    },
  },
});
