# `fixtures-pedal/` — provenance

Java-generated ground truth for the `<pedal>` element, which **no fixture under
`tests/integration/fixtures/` contains**: all 50 `pedalMap`s in the 82 MSM files of this
repository are empty, so every render stage that touches a pedal was a no-op corpus-wide and
the byte gate could not protect any of them.

Generated 2026-08-21 from `meico@1d662105` — the same fork commit as every other reference
family in this repo, so this set is comparable with them.

    javac -nowarn -cp "externals/*" -d <scratch> $(find src/meico -name '*.java')
    cp -R src/resources <scratch>/resources        # InstrumentsDictionary reads these
    javac -cp "<scratch>:externals/*" -d <scratch> src/tools/GenerateReference.java \
                                                    src/tools/GeneratePerformanceReference.java
    java -cp "<scratch>:externals/*" GenerateReference            <mei-dir> <out>
    java -cp "<scratch>:externals/*" GeneratePerformanceReference <mei-dir> <out>

It lives in a **sibling** of `fixtures/` rather than inside it because CHARTER invariant 2
freezes `fixtures/**` against additions as well as edits. `fixtures-v3/`,
`fixtures-layers-to-staffs/` and `fixtures-multi-instruction/` set that precedent.

`pedal.mei` is written for this purpose and covers the four ways MEI can place a pedal, chosen
because each takes a different route through `processPedal`:

| id              | form                            | what it exercises                                                         |
| --------------- | ------------------------------- | ------------------------------------------------------------------------- |
| `ped1` / `ped2` | `@tstamp`                       | the plain instant, down and up                                            |
| `ped3`          | `@startid` + `@endid`           | a span whose end is resolved from a note id — the `endids` deferred list  |
| `ped4`          | `@tstamp` + `@staff`            | staff scope, so the entry goes to the PART's pedalMap, not the global one |
| `ped5`          | `@tstamp` + `@tstamp2` (`1m+3`) | a span measured in measures — the `tstamp2s` deferred list                |

All five resolve in Java, and the part-scoped one really does land in the part's map: the
reference `pedal.msm` carries four `<pedal>` under `<global>` and one under `<part>`.
