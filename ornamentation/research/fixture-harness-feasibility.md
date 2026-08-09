# ORN-7: v3 fixture-generation feasibility from LarsEngeln/meico@develop

**Date:** 2026-08-09 · **Wall-clock cost:** ~12 minutes (10:55–11:07 CEST), including clone copy, two full compiles, four render runs and the diff analysis.
**Probe workspace (kept intact for reuse):** `/private/tmp/claude-501/-Users-nielspfeffer-Projects-meico-ts/5d7ca67d-74f7-491c-a4c3-06867b04b872/scratchpad/orn-fixture-probe/`
**Subject:** `LarsEngeln/meico` @ `3deb141c7f4dc34631060ccf9396e7a00ae2494d` ("v0.12.0"), copied from the orn-research clone; HEAD verified.
**Baseline for comparison:** Niels' `meico` @ `1d662105`, and the committed fixtures in `meico-ts-orn/tests/integration/fixtures/all-maps-reference/`.

---

## Verdict in one paragraph

Compiling Lars' branch and driving it with Niels' reference-generation tools **works** — the harness is mechanically feasible and is already running in the probe workspace. But the branch **cannot currently generate usable ornamentation fixtures of either generation**. v2 ornamentation is rendered as a complete no-op (every `ornament.*` attribute disappears; all timings and velocities come out unmodified), and the v3 note-pool path only produces correct output if the ornament's child notes are named `note` — with the schema-plausible name `ornamentNote` that Lars' own `OrnamentData` parser expects, the transformers silently do nothing. Adopting fixtures from this commit would bake both defects into our reference set. Recommendation: **do not generate adoption fixtures from `3deb141c`**; keep the harness warm and re-run it against a later Lars commit (or a locally patched build) once the wiring defects below are fixed upstream.

---

## 1. Compile status: PASS

| Step | Result |
|---|---|
| `javac` version | 17.0.1 (Zulu17.30) — same JDK Niels uses |
| meico sources | 96 `.java` files under `src/meico` |
| First compile | **10 errors** — all `javax.xml.bind` (`JAXBException`, `JAXBElement`) in `MusicXml.java` / `Mei2MusicXmlConverter.java` |
| Fix | Copied `jaxb-api-2.2.3.jar` from `/Users/nielspfeffer/Projects/meico/externals/` into the probe's `externals/` (Lars' clone ships 11 jars; Niels' tree has 15, incl. jaxb + jackson) |
| Second compile | **clean**, 93 class files |

The missing jar is a packaging gap in Lars' clone, not a code defect, and it only affects MusicXML export — which is out of scope for meico-ts anyway. Commands:

```
javac -nowarn -cp "externals/*" -d out/production/meico @sources.txt
javac -nowarn -cp "meico-lars/out/production/meico:meico-lars/externals/*" -d out/tools tools/*.java
```

`src/resources` (`instuments.dict`, `ornaments.dict`, `minimal.mei`) must be copied into the output dir alongside the classes.

## 2. Tool adaptation

`GenerateReference.java` and `GeneratePerformanceReference.java` compile against Lars' tree **unmodified**. `GenerateAllMapsReference.java` produced 16 errors and needed three classes of change (full diff saved at `<workspace>/tools-adaptation.diff`, 90 lines):

1. **`MovementMap` / `MovementData` do not exist on Lars' branch.** Both `src/meico/mpm/elements/maps/MovementMap.java` and `.../data/MovementData.java` are absent. I deleted `generateMovementTest()` and the movementMap block inside `generateAllMapsTest()`. Consequence: the `movement*` fixtures cannot be regenerated from this branch at all, and `all_maps` loses its movement contribution. Lars' branch also carries files Niels' tree lacks: `TemporalValue`, `MsmElement`, `RichElement`, `MeiOrnamentExpander`, `OrnamentExpansion`, `MeiElement`, `AttributesWithIds`, `Stopwatch`.
2. **`TemporalSpread.FrameDomain` → `TemporalValue.Domain`.** The nested enum was replaced by a general-purpose `meico.mpm.elements.TemporalValue` type with domains `Unknown | Relative | Milliseconds | Ticks`. Two call sites, plus one import.
3. **`OrnamentationMap.addOrnament` signature change.** The 5-arg `(date, nameRef, scale, noteOrder, id)` overload is gone; the new form is `(date, nameRef, scale, noteOrder, childNotes, repetitions, id, correspondence)`. Four call sites; I passed `childNotes=null, repetitions=0, correspondence=null` (0 is what Lars' own 2-arg convenience overload passes).

None of these adaptations changes semantics for the maps under test, so the diffs in §3 are attributable to Lars' branch, with the single exception noted for `positionMap`.

## 3. Smoke test A — v2 regression: **DRIFT, and worse than drift**

Method: ran the adapted `GenerateAllMapsReference` into a fresh dir, normalized both sides (canonicalize all UUIDs by first-occurrence order, pretty-print), and diffed against the committed fixtures. A second run confirmed which differences are nondeterminism rather than drift.

### 3a. What is clean

- **All input `.msm` files: byte-identical.** Only the root `xml:id` UUID differs, which the normalizer handles.
- **All non-ornamentation input `.mpm` files: byte-identical** (rubato, asynchrony, metrical_accentuation, imprecision ×2).
- **All non-ornamentation augmented MSMs: numerically byte-identical** once the one serialization change below is ignored. Every `date.perf`, `duration.perf`, `velocity`, `milliseconds.date` value matches the committed fixture exactly. Rubato, asynchrony, metrical accentuation and imprecision-dynamics rendering math is unchanged.
- **Determinism:** a second run reproduced run 1 exactly for every file except `imprecision_timing_augmented.msm` (16 lines self-differing). That matches the known note that imprecision output is nondeterministic even with a fixed seed — its 14-line diff vs. the fixture is *not* drift. Ornamentation output is fully deterministic, so its diffs are real.

### 3b. Serialization change affecting every augmented MSM

The empty `modified=""` attribute is no longer emitted. The committed fixtures carry it 10–27 times per augmented file; Lars' output has zero occurrences anywhere. Harmless semantically, but it breaks naive byte comparison on **every** augmented fixture.

### 3c. `positionMap` — an artifact of my adaptation, not drift

`all_maps_augmented.msm` differs by exactly one line: the fixture has `<positionMap/>` and Lars' output does not. `positionMap` is produced by movementMap rendering, which I removed in the adaptation. Not attributable to Lars.

### 3d. Ornamentation MPM serialization drift (3 changes)

```diff
-<temporalSpread frame.start="-22.0" frameLength="44.0"/>
+<temporalSpread frame.start="-22.0" frameLength="66.0" time.unit="ticks"/>
...
-<ornament date="0.0" name.ref="arpeggio" xml:id="orn1"/>
+<ornament date="0.0" name.ref="arpeggio" repetitions="0" xml:id="orn1"/>
```

1. **The built-in `arpeggio` default changed: `frameLength` 44.0 → 66.0.** `OrnamentDef.createDefaultOrnamentDef` now sets `setTemporalSpread(-22.0, 66.0, Ticks, 1.0, NoteOffShift.False)` where Niels' tree sets `-22.0, 44.0`. Lars also added ~10 further named presets (mordent, fioritura, grace acc/unacc, turn delayed, tremolo, …) and changed the fallback default to `(0, 80, Relative, 0.9, Monophonic)`.
2. **`time.unit="ticks"` is now written explicitly** instead of being omitted as the default.
3. **`repetitions` is serialized unconditionally** on every ornament element (`addOrnament` line 132 has no guard), so v2 ornaments that never had the attribute now carry `repetitions="0"`.

Note an asymmetry worth flagging for the port: `OrnamentData(Element xml)` **does not parse `repetitions` at all**. The value is read only in `applyNotesToMaps` via `ornament.get("repetitions")`, so `OrnamentData` round-trips lose it.

### 3e. The headline finding: v2 ornamentation renders as a complete no-op

`ornamentation_augmented.msm` is not merely drifted — the ornamentation is **entirely absent**. Fixture (Niels) vs. Lars, first note:

```diff
-<note xml:id="n1" date="0.0" midi.pitch="60.0" … duration="1440.0"
-      ornament.dynamics="0.0" ornament.date.offset="-22.0"
-      date.perf="-22.0" duration.perf="1462.0" velocity="100.0"
-      milliseconds.date="-18.333333333333332" …/>
+<note date="0.0" midi.pitch="60.0" … duration="1440.0"
+      date.perf="0.0" duration.perf="1440.0" velocity="100.0"
+      milliseconds.date="0.0" … xml:id="n1"/>
```

Across all 12 notes: every `ornament.dynamics`, `ornament.date.offset`, `ornament.milliseconds.date.offset` and `ornament.noteoff.shift` attribute is gone; every `date.perf` equals the unornamented value; every velocity is a flat 100. The arpeggio spread, the ms-domain spreads and the noteoff-shift behaviour all vanish. No exception, no warning on stderr — it fails silently.

**Root cause** (`src/meico/mpm/elements/maps/OrnamentationMap.java`):

- `renderGlobalOrnamentationMap()` is stubbed out — its body is `return new HashMap<>(); // this.apply(maps);` (line 286).
- In `renderOrnamentationToMap()`, `//addedNotes = this.apply(maps);` (318) and `//this.sanitizeOverlaps(map);` (323) are commented out.
- `Performance.java:481` has `// globalOrnamentationMap.applyNotesToMaps(m);` commented out too.
- The only live call to `apply()` is from `renderMillisecondsModifiersToMap()` (line 1119), which `Performance.perform()` invokes at line 602 — **after** `renderAllNonmillisecondsModifiersToMap()` at line 582. So even when `apply()` does add modifier attributes, the pass that would consume them into `.perf` attributes has already run.
- Independently, `applyNotesToMaps()` requires `ornament.get("noteid")` to resolve a principal note; when it is null the ornament is `continue`d (line 345). v2 ornaments have no `noteid`, so they are skipped unconditionally.

Both conditions hold for v2 ornaments, so v2 ornamentation on this branch is inert by construction, not by accident of my test inputs.

**Consequence for the backward-parity plan:** we cannot use `3deb141c` to prove that our v2 ornamentation behaviour is preserved. It would "prove" that ornamentation does nothing.

## 4. Smoke test B — v3 capability: **runs, partially works, one blocking defect**

Inputs hand-written in `<workspace>/v3/`: `v3trill.msm` (one part, ppq 720, three notes, principal `n3` = E4 for 1440 ticks) and `v3trill.mpm` with a global `ornamentationMap`. Driver: `<workspace>/tools/GenerateFromMsmMpm.java` (new, 65 lines — loads an MSM+MPM pair, calls `Performance.perform`, writes augmented MSM + expressive/raw MIDI; mirrors `GeneratePerformanceReference`'s flow).

Ornament under test:

```xml
<ornamentDef name="trill">
  <dynamicsGradient transition.from="1.0" transition.to="-1.0"/>
  <temporalSpread frame.offset="0.0" frameLength="50" time.unit="relative" noteoff.shift="monophonic"/>
</ornamentDef>
...
<ornament date="1440.0" name.ref="trill" scale="2.0" noteid="n3"
          note.order="|: #x1 #p1 :|" repetitions="2" xml:id="orn1">
  <ornamentNote xml:id="x1" midi.pitch="64.0" interval.chromatic="0" intm="0.0hs"/>
  <ornamentNote xml:id="p1" midi.pitch="65.0" interval.chromatic="1" intm="1.0hs"/>
</ornament>
```

### 4a. Syntax findings

- **`frameLength="50%"` throws.** `TemporalSpread(Element)` line 323 parses it with a bare `Double.parseDouble`, so the percent suffix from the spec draft raises `NumberFormatException`. The exception is printed and **swallowed** — parsing continues with a defaulted spread, so a mistyped unit degrades silently. The working spelling is `frameLength="50" time.unit="relative"`. `TemporalValue` does know a `%` domain string, but `frameLength` never routes through it.
- **`frame.offset` is accepted**, with `frame.start` retained as a fallback (lines 314–318). `time.unit` accepts `milliseconds | relative | ticks`. `noteoff.shift` accepts `true | false | monophonic`.
- **`interval.chromatic` is not read by the renderer.** Pitch comes exclusively from `midi.pitch` on the child element; `interval.chromatic` only appears in `Mei2MsmMpmConverter`. It is carried through to the output as an inert attribute. `intm="0.0hs"` *is* consulted, to decide whether to append a final landing note on the principal pitch.

### 4b. Result with `<ornamentNote>` children — pool expands, transformers no-op

No exception. The note pool expanded correctly: 7 notes alternating 64/65 (`repetitions="2"` → `(2+1)×2 = 6`, plus one trailing principal-pitch note from the `intm="0.0hs"` landing rule). But every generated note is identical in time and dynamics:

```xml
<ornamentNote intm="0.0hs" interval.chromatic="0" midi.pitch="64.0" xml:id="meico_c6710643"
  date="1440.0" duration="1440.0" date.perf="1440.0" duration.perf="1440.0" velocity="100.0"
  milliseconds.date="1000.0" date.end.perf="2880.0" milliseconds.date.end="2000.0"/>
<ornamentNote intm="1.0hs" interval.chromatic="1" midi.pitch="65.0" xml:id="meico_8a5facf5"
  date="1440.0" duration="1440.0" date.perf="1440.0" duration.perf="1440.0" velocity="100.0"
  milliseconds.date="1000.0" date.end.perf="2880.0" milliseconds.date.end="2000.0"/>
<!-- …5 more, all with identical timing… -->
```

Zero `ornament.*` attributes anywhere in the file. The result is a 7-note cluster stacked on one instant, on top of an unmodified principal note — not a trill. Worse, the generated elements are named `ornamentNote` in the MPM namespace, and MSM→MIDI export reads `getChildElements("note")` (`Msm.java:446`), so they never reach MIDI: expressive MIDI came out at 106 bytes vs. 102 raw, i.e. still three notes.

**Root cause:** `applyNotesToMaps` clones each child element as-is, preserving its `ornamentNote` name. The transformer phase then resolves `note.order.perf` references through `getNotes()` (line 674), which indexes **only** elements of type `note` and `rest`. Every lookup returns null, `chordSequence` stays empty, and line 647 `if (chordSequence.isEmpty()) continue;` skips both transformers. This is an internal inconsistency in the branch: `OrnamentData(Element xml)` line 67 reads children via `getChildElements("ornamentNote")`, so the two halves of the implementation disagree on the element name.

### 4c. Result with `<note>` children — the pipeline works end to end

Renaming the two child elements to `note` (everything else unchanged) makes the full chain fire:

```xml
<note intm="0.0hs" midi.pitch="64.0" xml:id="meico_6f0cb414" date="1440.0" duration="1440.0"
  velocity="100.0" milliseconds.date="1000.0" milliseconds.date.end="1071.4285714285713"
  ornament.dynamics="2.0" ornament.milliseconds.date.offset="0.0"
  ornament.milliseconds.duration="71.42857142857143"/>
<note intm="1.0hs" midi.pitch="65.0" xml:id="meico_bc7129b9" date="1440.0" duration="1440.0"
  velocity="100.0" milliseconds.date="1071.4285714285713" milliseconds.date.end="1142.8571428571427"
  ornament.dynamics="1.3333333333333335" ornament.milliseconds.date.offset="71.42857142857143"
  ornament.milliseconds.duration="71.42857142857143"/>
<!-- …notes 3–6, offsets 142.86 / 214.29 / 285.71 / 357.14 ms… -->
<note intm="0.0hs" midi.pitch="64.0" date="1440.0" duration="1440.0" velocity="100.0"
  milliseconds.date="1428.5714285714284" milliseconds.date.end="1500.0"
  ornament.dynamics="-2.0" ornament.milliseconds.date.offset="428.57142857142856"
  ornament.milliseconds.duration="71.42857142857144" xml:id="meico_9f5ce296"/>
<note … xml:id="n3_split0" milliseconds.date="1940.0" milliseconds.date.end="2440.0"/>
```

Everything behaves as designed: the 7 notes are spread evenly over 1000–1500 ms (the `50%`-relative frame of the principal's 1000 ms duration), each 71.43 ms long; `ornament.dynamics` ramps linearly 2.0 → −2.0, confirming `transition.from/to` × `scale=2.0`; `noteoff.shift="monophonic"` yields `ornament.milliseconds.duration` so each note ends exactly where the next begins. Expressive MIDI grew to 146 bytes, so the notes now reach MIDI.

Two observations to carry into ORN-5/ORN-6:

- **Ticks-domain performance attributes are never updated.** All seven notes keep `date.perf="1440.0"` and `duration.perf="1440.0"`; only the milliseconds domain is spread. That follows from `apply()` running inside the milliseconds pass, after the ticks pass. Any fixture we take from this branch would encode ticks/milliseconds inconsistency.
- **The principal-note split looks wrong.** `n3` becomes `n3_split0` at `milliseconds.date="1940.0"`, `milliseconds.date.end="2440.0"` — starting 440 ms after the trill ends and running 440 ms past the principal note's original 2000 ms end. Worth confirming against Lars before treating any split behaviour as reference.

### 4d. Robustness notes

`applyNotesToMaps` reads `ornament.get("note.order").replaceAll(...)` unguarded after resolving a principal note, and does `children.get(0)` without an emptiness check — an ornament carrying a `noteid` but no `note.order`, or none with no children, should NPE / throw `IndexOutOfBoundsException`. Not exercised here; flagged for the port's error handling.

## 5. Recommended harness shape

The harness itself is sound and worth keeping. Concretely:

1. **Keep the probe workspace** (path above) as the ready-to-run rig: `meico-lars/` with `out/production/meico` built, `externals/` completed with `jaxb-api`, `out/tools` with all four tools, `normalize.py`, and the `v3/` inputs. Rebuilding from cold is ~10 s of `javac`.
2. **Add `GenerateFromMsmMpm` to Niels' `src/tools/`.** It is branch-agnostic (only `Msm`, `Mpm`, `Performance`, `Midi`), it compiles against both trees unmodified, and hand-written MSM+MPM inputs are the right shape for v3 fixtures — v3 ornaments need `noteid` correspondences and child note pools that the programmatic `GenerateAllMapsReference` builder API expresses awkwardly. Fixtures then live as committed `.msm`/`.mpm` input pairs plus generated `_augmented.msm` / `_expressive.mid`, which also makes the inputs reviewable in the PR.
3. **Normalize before comparing.** `normalize.py` canonicalizes all UUIDs by first-occurrence order and pretty-prints. Additionally strip `modified=""` if we ever diff Lars' output against Niels'. Never byte-compare `imprecision_timing*` — confirmed nondeterministic across runs on this branch too.
4. **Keep the v2 and v3 fixture sets in separate directories** with separate provenance stamps (repo + commit SHA per directory). The two generations currently require different meico builds, and that is unlikely to change soon.
5. **Do not adopt fixtures from `3deb141c`.** Re-run this harness against a later Lars commit and gate adoption on three checks: (a) v2 ornamentation reproduces the committed `ornamentation_augmented.msm` modulo the known `arpeggio` default and `repetitions`/`time.unit` serialization changes; (b) `<ornamentNote>` children produce spread and gradient without renaming; (c) ticks-domain `.perf` attributes are updated alongside milliseconds.
6. **If we need v3 reference data before upstream fixes land**, the two-line local patch is viable — rename cloned children to `note` in `applyNotesToMaps` (or index `ornamentNote` in `getNotes`) — but any fixture so produced must be stamped as *our patched build*, not as upstream reference, and the ticks-domain gap would remain.

## 6. Reproduction commands

```bash
W=/private/tmp/claude-501/-Users-nielspfeffer-Projects-meico-ts/5d7ca67d-74f7-491c-a4c3-06867b04b872/scratchpad/orn-fixture-probe
cd $W/meico-lars && find src/meico -name '*.java' > $W/sources.txt
javac -nowarn -cp "externals/*" -d out/production/meico @$W/sources.txt
cp -R src/resources out/production/meico/
cd $W && javac -nowarn -cp "meico-lars/out/production/meico:meico-lars/externals/*" -d out/tools tools/*.java

# smoke test A
java -cp "out/tools:meico-lars/out/production/meico:meico-lars/externals/*" GenerateAllMapsReference gen/all-maps
# smoke test B
java -cp "out/tools:meico-lars/out/production/meico:meico-lars/externals/*" GenerateFromMsmMpm v3/v3trill.msm v3/v3trill.mpm gen/v3
```
