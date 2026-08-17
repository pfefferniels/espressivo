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
      // T21 mechanical removal: `src/compat/**` no longer exists (§8.10 deleted the module
      // wholesale), so its glob would match nothing.
      // T13 mechanical additions: `src/api/**` is the new public facade (§2) and
      // `src/units.ts` is the brand module T19a added, which matched no glob (its
      // DISCOVERED note asked for exactly this). Both are in scope by definition — the
      // facade IS the MEI/MSM+MPM => MIDI surface.
      // TD2 mechanical addition: `src/supplementary/parseJavaDouble.ts` is the strict numeric
      // parser every def now reads its attributes through, so it sits on the MPM parse path
      // and is in scope by definition. `src/supplementary/` is listed file by file rather
      // than by glob, so a new module there is invisible to the coverage invariant until it
      // is named — which is why this line exists.
      // W2 addition (expression-transform campaign): `src/expression/**` is the exaggeration
      // engine — MPM text in, MPM text out. It is the same MEI/MSM+MPM surface this list
      // already scopes, entered from the writing end rather than the rendering one: it reads
      // the MPM vocabulary through the same def and style semantics the renderer uses, and a
      // divergence there produces a document the rest of this port then renders wrongly.
      // W2 addition (performance-comparison campaign): `src/comparison/**` reads two MPM
      // documents and writes none. It is in scope for the same reason `src/expression/**` is
      // — it reads the MPM vocabulary through the same def and style semantics the renderer
      // uses, and a divergence there misreports what this port would render. Named
      // explicitly because this list is curated, not a glob (comparison/DESIGN.md §9.7).
      include: [
        'src/version.ts',
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
