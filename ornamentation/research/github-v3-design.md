# MPM v3 Ornamentation — Design Rationale, Semantics, and Implementation Status

Research date: 2026-08-09. Sources: `axelberndt/MPM` (develop @ `1de00bb`), `cemfi/meico`, `LarsEngeln/meico`, `axelberndt/MPM-Toolbox`, GitHub search.

Local clones for follow-up work:
- `…/scratchpad/orn-research/clones/MPM` (develop = v3.0.2)
- `…/scratchpad/orn-research/clones/meico` (cemfi master, v0.11.14 — **v2 only**)
- `…/scratchpad/orn-research/clones/meico-lars` (LarsEngeln develop @ `3deb141` — **the v3 renderer**)
- `…/scratchpad/orn-research/clones/MPM-Toolbox` (master — **v2 only**)

---

## 0. Headline: a reference implementation exists, but only as an unmerged PR

**`cemfi/meico` PR #31 "v0.12.0"** — https://github.com/cemfi/meico/pull/31

| | |
|---|---|
| Author | LarsEngeln |
| Opened | 2026-08-06 (3 days before this research) |
| State | **open**, not draft, `mergeable_state: clean`, **zero review comments** |
| Head | `LarsEngeln:develop` @ `3deb141c7f4dc34631060ccf9396e7a00ae2494d` |
| Base | `cemfi:master` |
| Size | 21 files, +3962 / −233, 1 commit |

Companion **PR #32** (`LarsEngeln:meicoApp` → `cemfi:meicoApp`, +34/−25) adapts the CLI: "adds a flag to prevent expanding/processing ornaments".

PR #31 body (verbatim, abridged to the load-bearing items):

> Introduced MEI ornament expansions and their conversion to MPM ornamentation.
> - adds the possibility to expand ornaments a MEI by adding notes to be played as `<supplied>`. Mainly this is for rendering via MPM.
> - introduces an ornaments.dict(ionary) (congruent with the instruments.dict) that is used by the MeiInstructifier
> - extends ornamentData to match MPM's ornament model
> - adds TemporalValue as class that interfaces temporal domains to handle dates and durations
> - adds standard OrnamentDef's for basic ornaments
> - adds the use of relative framestart and framelength for temporalSpread of ornaments
> - adds support for (measured) tremolo rendering
> - **adds support for multiple ornaments applied to the same principal note with options to place (render) these at the start or at the end of the principal note**
> - adds a guard that an exported midi files have no negative date occur, as this could result with an ornament at the very beginning, which may lead to a midi files that cannot be interpreted by other software
> - adds preventing leftovers notes if they are too short (e.g. due to numeric/rounding)
> - prevents expanding ornaments multiple times
> - adds articulations to generated notes of the rendered ornaments
> - **applies ornament rendering to be fully "measured" (in ms) after Tempo-rendering**
> - adds support for fioritura's (ornamental runs), in MEI these are displayed as `<graceGrp>` besides a `<space>`

New/changed files (all paths relative to repo root):

| Status | Path | Δ |
|---|---|---|
| added | `src/meico/mpm/elements/TemporalValue.java` | +549 |
| modified | `src/meico/mpm/elements/maps/OrnamentationMap.java` | +752/−86 |
| modified | `src/meico/mpm/elements/styles/defs/OrnamentDef.java` | +245/−48 |
| modified | `src/meico/mpm/elements/maps/data/OrnamentData.java` | +37/−10 |
| added | `src/meico/mei/MeiOrnamentExpander.java` | +740 |
| added | `src/meico/mei/OrnamentExpansion.java` | +136 |
| added | `src/resources/ornaments.dict` | +42 |
| added | `src/meico/xml/RichElement.java` | +335 |
| added | `src/meico/mei/MeiElement.java` / `src/meico/msm/MsmElement.java` | +86 / +104 |
| added | `src/meico/supplementary/Stopwatch.java` | +67 |
| modified | `src/meico/mei/Mei2MsmMpmConverter.java` | +433/−34 |
| modified | `src/meico/mei/Helper.java` | +212/−15 |
| modified | `src/meico/mpm/elements/Performance.java`, `maps/ArticulationMap.java`, `maps/GenericMap.java`, `msm/Msm.java` | small |

### Everything else is v2-only

- **`cemfi/meico` master (v0.11.14, 2026-07-14)**: `src/meico/mpm/elements/styles/defs/OrnamentDef.java:245` reads `Helper.getAttribute("time.unit", xml)` and `:261` reads `Helper.getAttribute("frame.start", xml)`. `OrnamentData` has only `xml, xmlId, styleName, style, ornamentDefName, ornamentDef, date, scale, noteOrder` — no note pool, no `repetitions`, no `noteid`. Classes present: `mpm/elements/maps/OrnamentationMap.java`, `mpm/elements/maps/data/OrnamentData.java`, `mpm/elements/styles/OrnamentationStyle.java`, `mpm/elements/styles/defs/OrnamentDef.java` (inner classes `TemporalSpread`, `TemporalSpread.NoteOffShift`, `TemporalSpread.FrameDomain`, `DynamicsGradient`). Branches: `master`, `meicoApp` only.
- **`axelberndt/MPM-Toolbox` master (v0.1.42, 2026-07-14)**: has ornament GUI (`gui/mpmEditingTools/editDialogs/OrnamentEditor.java`, `OrnamentDefEditor.java`, `ornament/NoteOrderComponent.java`, `ornament/Note.java`, `ornamentDef/TemporalSpreadComponent.java`, `ornamentDef/DynamicsGradientComponent.java`) but `TemporalSpreadComponent.java` still labels its fields `// frame.start`, `// frame.length`, `// time domain / frame domain / time.unit` and has a "time.unit chooser". Zero occurrences of `frame.offset`, `repetitions`, `interval.chromatic`. Its 2026 commits are only meico version bumps (`f2e93ce` v0.1.42, `571e2dd` v0.1.40) plus an unrelated spectrogram PR (#22 from LarsEngeln, merged 2026-05-06). Branches: `master`, `Runtime-Environments`.
- **`LarsEngeln/MPM-Toolbox`** fork, pushed 2026-07-15 — not inspected in depth; the upstream Toolbox has no v3 work, so a Toolbox-side v3 editor may be in progress there.
- **GitHub code search**: `"frame.offset" ornamentDef` → 0 hits. `"note.order" mpm` → 0 hits. `temporalSpread noteoff.shift` → 0 hits. `ornamentationMap` → hits only in `cemfi/meico` and **`pfefferniels/meico-wasm`** (a C++ port of the Java v2 model: `include/mpm/elements/maps/OrnamentationMap.h` "Ported from Java meico.mpm.elements.maps.OrnamentationMap", `src/mpm/elements/maps/OrnamentationMap.cpp`). Code search does not index the open PR branch, which is why it finds nothing v3.
- **Personal repos**: `LarsEngeln` owns `CritList` (critical-listening annotations, 2026-03-06), `filter` (C++, 2020), plus forks of `meico` (2026-08-06 ← the v3 work), `MPM` (2026-07-16), `MPM-Toolbox` (2026-07-15). No separate renderer. `axelberndt` has `Digital-Performance-Edition` (2026-08-08), `flowscore` (TypeScript score viewer, 2025-11-06), `Arpeggiatorum` (2024) — none implement MPM ornamentation.

---

## 1. Version and versioning mechanics

### There is no version marker in an MPM document

- **Namespace is unchanged across v1/v2/v3**: every `elementSpec` in `src/specs/` carries `ns="http://www.cemfi.de/mpm/ns/1.0"`, including the brand-new `note.xml` and the modified `ornament.xml`. `mpm.xml` remarks: *"It is customary to specify the MPM namespace `http://www.cemfi.de/mpm/ns/1.0` on it, using the `xmlns` attribute."*
- **`<mpm>` has no `version` attribute.** `src/specs/mpm.xml` declares content `metadata?` + `performance+` and an empty `attList`. `<performance>` carries only `name` and `pulsesPerQuarter`.
- Consequence: **v2 vs v3 detection must be structural (duck-typing)**. Reliable positive markers of v3, in decreasing order of strength:
  1. `<note>` child elements inside `<ornament>` (element did not exist before v3);
  2. `@repetitions` on `<ornament>`;
  3. `@alignment` on `<temporalSpread>` (or `<ornamentDef>` — see §3.1);
  4. `@frame.offset` on `<temporalSpread>` (v2 used `@frame.start`);
  5. a unit suffix (`ms` / `%` / `ticks`) inside `@frame.offset` / `@frameLength`;
  6. grouping/repetition tokens `[ ] | |: :| :|:` inside `@note.order`.
  Negative markers of v2: `@frame.start`, `@time.unit`.
- Note that v2 and v3 markers **co-occur in practice** — see §4.

### Release/branch state

| Ref | Content |
|---|---|
| tag/release `v3.0.1` (`c50e4223`, 2026-06-11) | the only v3 GitHub *release*; assets `mpm.rng`, `mpm.rnc`, `mpm.xsd`, `mpm.pdf` |
| branch `master` | `c50e4223` = **v3.0.1** |
| branch `develop` | `1de00bb` = **v3.0.2**, ahead by 3 files (`src/mpm.odd`, `src/specs/note.xml`, `src/specs/ornament.xml`) |
| branch `gh-pages` | `0b4dbe12`, built 2026-07-20 from v3.0.2 |
| tag `v3.0.2` | **does not exist**; no release published for it |

So the `@noteid`-on-`<ornament>` addition (v3.0.2) is live in the rendered docs and on `develop`, but **not** in any downloadable schema. A consumer validating against the published `mpm.rng` would reject `<ornament noteid="…">`.

### PR/version history

| PR | Date | Author | Content |
|---|---|---|---|
| #74 "Extending the support for ornaments" | 2026-04-24 → merged 2026-05-05 | LarsEngeln | the whole v3.0.0 feature set |
| #75 "Ready for DocsGeneration" | 2026-06-11 | LarsEngeln | schematron ns, closing tag, exemplum IDs, xinclude for `note` |
| #76 / #77 / #78 | 2026-06-11 | LarsEngeln / axelberndt | v3.0.0 docs + develop↔master sync |
| #79 / #80 / #81 "v3.0.1 hardening note's definition" | 2026-06-11 | LarsEngeln / axelberndt | `midi.pitch` optional; pitch mutual-exclusion schematron; principal-note-in-`note.order` schematron |
| #82 / #83 "v3.0.2" | 2026-07-13 → merged 2026-07-20 | LarsEngeln | link ornament to an MSM element |

**Every one of these PRs has zero issue comments, zero review comments, and zero submitted reviews.** The only review trace is commit `71c1980` "adds changes according to feedback, thereby improving terms, wording, and explicitness" on PR #74 — the feedback itself happened off-GitHub (Berndt and Engeln are co-located at TU Dresden / Detmold). **There is no GitHub discussion record resolving the semantics.** Everything semantic must come from the ODD prose, the schematrons, and the reference implementation.

Naming drift worth noting: PR #82's body says *"adds `correspondence` to `ornament`"*, but what landed is `@noteid` (via `att.reference.noteid`). The ODD changelog for 3.0.2 reads *"Adds `noteid` to `ornament` to explicitly link it to a MSM element."* The reference implementation keeps `correspondence` as the internal field name reading the `noteid` attribute (`OrnamentationMap.java:216`: `od.correspondence = Helper.getAttributeValue("noteid", xml);`).

---

## 2. Design rationale — issue #55 "Arpeggiation" (the origin thread)

https://github.com/axelberndt/MPM/issues/55 — opened by **pfefferniels** 2021-09-06, closed; 8 comments, last 2022-11-14 ("This MPM update is by now fully integrated in the API (meico) and MPM Toolbox"). This thread produced **v2.1.3**, not v3, but it fixes the intent of `temporalSpread`/`dynamicsGradient` and it is the issue the guidelines link to.

Decisions stated there that still govern the model:

- Berndt, 2021-09-14 — scope split that v3 later reversed:
  > "We need a naming convention, i.e., unique names to differentiate a "oneshot" arpeggio (every note is played once) from a "continuously repeated" arpeggio (the notes are played multiple times). **We will develop a model for the "oneshot" version. The "continuous" version is rather a subject to either tremolo-like techniques or ornamentation; both are rather extensive extensions to MPM not addressed here.**"
  v3's `@repetitions` is exactly that deferred "continuous" case.
- Berndt, 2021-09-14 — the arpeggio applies to *simultaneous onsets only*:
  > "Arpeggiation can be applied to a series of synchronous notes/sound events. — In fact, only the onsets are notated at the same time. Durations can differ."
- Berndt, 2021-09-14 — `noteoff.shift` rationale:
  > "The note offset dates may — remain unaffected by the arpeggiation or — be shifted in parallel with the onset delay (e.g. hand rolls over the keyboard)."
- Berndt, 2021-10-01 — **the preceding note is explicitly out of scope**:
  > "What happens with the preceding note? For a monophonic instrument it must be shortened by the amount of negative delay that the arpeggio introduces. Polyphonic instruments do not have this restriction. **We leave it up to the editor to decide this and adapt the preceding note via `articulation`.**"
- Berndt, 2021-10-01 — units rationale:
  > "The speed of a broken chord can be absolute (in milliseconds) or tempo dependent (in ticks). In the latter case we can use the tempo and rubato models to refine its timing…"
- Berndt, 2021-12-06 target code — the open question that v3 answers:
  > "If the ornament does not edit but replace the original notes, can I repeat it for a number of times over the ornament time frame? With this I could make an arpeggio into a tremolo only by repeating it."
  and the chord-grouping question:
  > "How about grouping of elements? Maybe with brackets in the noteids list `(id1 id2) (id3 id4)`."
  v3 chose `[ … ]` rather than parentheses.
- The dynamics gradient is grounded in Repp 1997 ("Some Observations on Pianists' Timing of Arpeggiated Chords") and Lebert/Faisst 1871 via Peres da Costa, quoted by pfefferniels 2021-09-06.

### Open issue #73 "Default ornamentation style?" (pfefferniels, 2025-02-06, **still open**)

Requests a `defaultOrnamentation` on `<style>` parallel to `defaultArticulation`, for early-20th-century recordings that arpeggiate nearly every chord. Berndt's reply, 2025-02-07, is a live constraint on the v3 design:

> "Hm, a `defaultOrnamentation` sounds dangerous, esp. since **the ornamentation part of MPM is still in its infancy and we don't know what formalisms will come to enable more complex (e.g. melodic) ornaments.** I would feel less worried if I knew that we would not put any obstacles in our way that become insurmountable later without breaking backward compatibility."

He proposes `<imprecisionMap.timing>` with `distribution.correlated.brownianNoise` and disjoint `limit.lower`/`limit.upper` per hand as the workaround, and notes a known defect:

> "In the current implementation of the performance rendering algorithm **the shake/arpeggiation order is not retained by the shaking mechanic**, i.e. left hand does not necessarily always start with the lowest note and the right hand does not necessarily end with the highest. But this is solvable …"

There is **no `defaultOrnamentation` in v3** — the request remains unimplemented.

---

## 3. Semantics from the v3 spec (mpm.odd + specs/)

### 3.1 The frame

Guidelines, `src/mpm.odd:684-689` (the `temporalSpread` gloss), verbatim:

> "This transformer spaces the notes of an ornament within a given time frame. The timing of the ornament's notes is specified by a power function. **The time frame starts at the principal note's initial date + `frame.offset` and ends at the principal note's initial date + `frame.offset` + `frameLength`.**
> The unit of `frame.offset` and the `frameLength` can be "ticks" (default), "milliseconds", or "relative" (in percent), as specified individually by the given inline unit (e.g. "360ticks", "20.5ms", "80%").
> The note's spacing can be further refined by the attribute `intensity` which sets the course of a power function (default is 1.0 for an equidistant spacing).
> The spaced notes' length can undergo further treatment via `noteoff.shift`. **By default `noteoff.shift` is `false`, so that all ornament notes (e.g. of an arppegiated chord) end at the principal note's noteOff, thereby forming a chord. Setting `noteoff.shift` to `true`, all ornament notes have the duration of the principal note. Those notes that start later in the ornament will end later (as the principal note) accordingly. If `noteoff.shift` is set to "monophonic", the notes' durations are shortened, so they are played sequentially and non-overlapping.**
> With `alignment` the ornament can be placed at the start of the principal note with `"at start"` (default) or at the end with `"at end"`.
> **Multiple ornaments can be applied to the same prinipal note and are spaced sequentially.**"

`att.temporalSpread.xml` adds the operative definition of monophonic:

> "The value monophonic refers to a temporal spread in which **the note offset of one note coincides with the note onset of the next note**."

**`alignment` is declared on `ornamentDef`, not on `temporalSpread`.** This contradicts the changelog, PR #74, PR #77 and the guidelines prose, all of which say "Added `@alignment` to `temporalSpread`". The actual `attDef ident="alignment"` lives in `src/specs/ornamentDef.xml:180-189` (closed value list `at start` | `at end`, default `at start`, desc "Defines whether the ornament is rendered at the start or at the end of the note"), and `att.temporalSpread` contains only `noteoff.shift`. The `ornamentDef.xml` exemplum uses it as `<ornamentDef name="upper turn" alignment="at end">`. **The reference implementation reads it off `temporalSpread`** (`OrnamentDef.java:348`, inside the `TemporalSpread(Element xml)` constructor). A robust reader should accept it on both.

**The multi-ornament overflow rule was written and then commented out.** `src/mpm.odd:689` contains, inside an XML comment:

> `<!--If multiple ornaments for one principal note want to use more time than the principal note has, they are shortend according to their ratio (e.g. "80%" and "40%" wanted lenghts result in "66.6%" and "33.3%" effective lenghts for keeping the ratio of 2:1). Although, an overlength should never happen. -->`

So the spec deliberately leaves overflow **unspecified** — but the reference implementation *does* implement proportional scaling (`OrnamentationMap.java:767` "proportional scaling if total exceeds principal note duration").

### 3.2 Units — the rules contradict each other

| Source | Rule for `frame.offset` | Rule for `frameLength` |
|---|---|---|
| `att.time.frame.xml` desc | "given as a double **optionally** by a unit suffix: `ms`, `%`, or `ticks`. **If no unit is provided the unit falls back to the value of `time.unit`**." default `0.0ticks` | — |
| `att.time.frame.xml` schematron | `^-?[0-9]+(\.[0-9]+)?(ms|%|ticks)$` — **suffix mandatory** | — |
| `att.time.frameLength.xml` desc | — | "**optionally** followed by a unit suffix… If no unit is provided the unit **need to be specified by `time.unit`**." |
| `att.time.frameLength.xml` schematron | — | `^-?[0-9]+(\.[0-9]+)?(ms|%|ticks)?$` — **suffix optional** |
| `temporalSpread.xml` override (`mode="change"`, same constraint ident) | — | `^-?[0-9]+(\.[0-9]+)?(ms|%|ticks)$` — **suffix mandatory**, default `100%` |

Additional consequences of those regexes: no leading-dot form (`.5`), no exponent form (`1e3`), and `frameLength` may syntactically be negative even though v2.1.4/v2.1.5 established `minInclusive 0.0`.

**`@time.unit` is a dangling reference.** `src/specs/att.time.unit.xml` still exists (values `ticks` | `milliseconds` | `relative`, default `ticks`), but `grep -rn 'memberOf key="att.time.unit"' src/` returns **zero hits** — no element is a member of the class any more. `temporalSpread` is memberOf `att.id`, `att.temporalSpread`, `att.time.frame`, `att.time.frameLength`, `model.ornamentDefContent` only. So the fallback that both attribute descriptions point to **cannot be expressed in a schema-valid v3 document**, matching the changelog ("removed the attribute `@time.unit` since it is no longer needed") but not the surviving prose.

**What "relative" is relative to is never stated in the spec.** The reference implementation resolves it as a percentage of the principal note's duration in milliseconds (`OrnamentDef.java:403-417`): it scans the chord sequence for the first note yielding `milliseconds.date.end − milliseconds.date >= 0` and multiplies `value * 0.01 * d`. Both `frameLength` and `frame.offset` are scaled by the same `d`.

### 3.3 `note.order` grammar

`src/mpm.odd:735`:

> "With `note.order` (optional) we can specify which notes in the current scope and note pool are part of the ornament and in which sequence. Possible values are "ascending pitch" (orders all notes at `date` by increasing pitch), "descending pitch" (opposite of "ascending pitch"), or a space separated list of note ID references as in the above code example. **In the space separated list of note ID references, chords (notes to be played at the same time) are defined within "["/"]" (e.g. "[ #n97 #98 ]"), and a repetition group, that is repeated `repetitions` times, is defined with "|:"/":|" (e.g. "|: #n95 #96 :|"). These annotation symbols are space sparated as well.**"

The schematron in `att.note.order.xml` is the authoritative token list and it is **wider than the prose**:

```
. eq 'descending pitch' or . eq 'ascending pitch' or
(every $i in tokenize(., '\s+') satisfies
   (starts-with($i, '#') or $i = ('[', ']', '|', '|:', ':|', ':|:')))
```

So `|` (bare barline) and `:|:` (end-repeat immediately followed by start-repeat) are legal but undocumented in prose. Note the schematron tokenizes on whitespace and requires each token to be *exactly* a bracket or to start with `#` — therefore the unspaced form `[#id1 #id2]` used in `att.note.order.xml`'s own `<desc>` is **invalid against its own constraint**. Follow the guidelines: brackets are separate space-separated tokens.

Chords in `note.order` are groups of ornament notes that share one onset within the spread; the ordering values `ascending pitch` / `descending pitch` sort *all notes at the ornament's `date`* by pitch — the v2 arpeggio behaviour, preserved.

### 3.4 `repetitions`

`src/specs/ornament.xml:48-57`:

> "This attributes describes a programmatic expansion of the ornament. In the `note.order` the repetition groups can be specified by `|:` and `:|`. The attribute `repetitions` defines how many times the repetition-group is to be repeated within the time frame of the ornament. **A value of `0` (default) repetitions indicates that the repetition-group is played only once**"

Datatype `integer`, `minInclusive 0`, default `0`. The exemplum removes any doubt:

> "The third `ornament` applies a half tone (#n1) trill to the note (#princNote), **repeating the trill pattern three times within the time frame of the ornament. So, it is played four times.**"

**Total plays = `repetitions` + 1.** Confirmed in code: `OrnamentationMap.java:419`
`maxNotes = (Double.parseDouble(repetitions) + 1.0) * rptNotesAmount; // play at least once ("+ 1.0"), if no repetition ("repetitions == 0")`.

### 3.5 The note pool and pitch resolution

`src/specs/note.xml` — `<note>` is empty, memberOf `att.id` only, with three optional attributes:

| attribute | datatype | default | notes |
|---|---|---|---|
| `midi.pitch` | integer, `minInclusive 0` | none | "the most explicit" |
| `interval.chromatic` | double | `0.0` | "the more general interval specification", in chromatic halftone steps |
| `interval.diatonic` | integer | `0` | "context-sensitive", in diatonic steps |

Schematron `note-pitch-mutual-exclusion`: `count(@midi.pitch | @interval.chromatic | @interval.diatonic) le 1` — **at most one** may be set. Note `le 1` permits **zero**, in which case the defaults leave the note at the principal note's pitch.

`interval.chromatic` is a **double**, so quarter-tone and microtonal alterations are expressible. **How `interval.diatonic` resolves against key/scale is nowhere specified** — the spec only calls it "context-sensitive". The reference implementation sidesteps this at the MPM layer: `MeiOrnamentExpander` resolves diatonic steps in MEI (`Helper.java:991` "Shifts MEI note diatonically by a given number of steps") and writes the result into an MSM-side `intm` attribute in halfsteps, e.g. `note.set("intm", String.valueOf(halfsteps) + "hs")` (`MeiOrnamentExpander.java:337, 530`).

Pool ordering carries no meaning — `src/specs/ornament.xml:78-79`:

> "If the `ornament` has a pool of `note`s as children, these notes can be referenced in the `note.order` attribute for usage, **but could also stay unused**. Within the pool of notes, **the order of these note elements have no semantic meaning**, as the order is determined by the `note.order` attribute."

### 3.6 Principal-note identification (v3.0.1 + v3.0.2)

`src/specs/ornament.xml:80`, the decisive passage:

> "The `ornament` does need a `noteid` attribute as reference to the principal note (or element) to which the ornament applies. **If not providing a `noteid`, the `note.order` does need to contain an ID reference to a MSM note that is treated as the corresponding principal note. If no such note is found, all `note`'s need an explicit `midi.pitch`, or the ornament cannot be rendered correctly.**"

Schematron `ornament-principal-note-ref` (role `warning`, not error): either `@noteid` is present and starts with `#`, or some token of `note.order` starting with `#` does **not** match any child `<note>/@xml:id`.

So the resolution order for a renderer is: (1) `@noteid`; (2) the first `note.order` reference that is not a pool note; (3) fall back to absolute `midi.pitch` on every pool note; (4) otherwise unrenderable. The reference implementation implements only (1): `OrnamentationMap.java:342-349` reads `noteid`, and if the principal note is not found it copies `note.order` verbatim into a new `note.order.perf` attribute and **skips the ornament**.

### 3.7 `dynamicsGradient`

Unchanged in v3. `transition.from` / `transition.to`, both double in [−1.0, 1.0], both defaulting to `0.0`, "Either `transition.to` or `transition.from` or both must be present." Scaled to velocity by `<ornament>/@scale` (double, default `0.0`, same function as in `accentuationPattern`). Guidelines: "Following the same concept as metrical accentuation this can feature a constant or linear course… where 1.0 means maximum accentuation and −1.0 maximum restraint." The sequence position of a note in `note.order` determines its position on the linear ramp.

### 3.8 Where ornamentation sits in the rendering pipeline

`src/mpm.odd:620-625` lists ornamentation twice — **"ornamentation (dynamics and non-milliseconds modifiers)"** early, and **"ornamentation (milliseconds modifiers)"** later. The pipeline overview at `:260`/`:268` likewise splits "Ornamentation (symbolic timing modifiers)" from "Ornamentation (physical timing modifiers)". The reference implementation reports it moved further in this direction: *"applies ornament rendering to be fully 'measured' (in ms) after Tempo-rendering"*, and `applyNotesToMaps` is documented as *"meant to be applied before all other transformations, as it will add new notes to the map which might be processed by the other transformations as well"* (`OrnamentationMap.java:330-331`). Two distinct phases: **note generation first**, **temporal spread after tempo**.

### 3.9 Rendered documentation (gh-pages)

https://axelberndt.github.io/MPM/ is a Nuxt/Vue site (`doc_generator/`, `transformer.py`) generated mechanically from `src/mpm.odd` + `src/specs/*.xml`. gh-pages was last built 2026-07-20 from v3.0.2. **It adds no prose beyond the ODD source** — the generator only transforms. Read the ODD; the site has nothing extra.

---

## 4. Reference-implementation semantics that the spec does not state

From `LarsEngeln/meico@3deb141` (PR #31). These are the de-facto answers a compatible renderer needs.

**Backward compatibility is built in.** `OrnamentDef.java:314-317`:
```java
Attribute start = Helper.getAttribute("frame.offset", xml);
if (start == null) {
    start = Helper.getAttribute("frame.start", xml);
}
```
and `:293` still honours `time.unit` as the domain for *both* frame values. So the implementation reads v2 and v3 documents with one code path. It also still **writes** `time.unit` on serialization (`:602-614`).

**`frameLength` does not actually accept unit suffixes in the implementation.** `frame.offset` is parsed by `TemporalValue.setValue(String)` (suffix-aware: `ms` → Milliseconds, `%` → Relative, `ticks` → Ticks), but `:321-323` does `this.setFrameLength(Double.parseDouble(length.getValue()))` — a bare `Double.parseDouble` that throws on `"100%"` or `"200ms"`. `frameLength`'s domain therefore comes only from `time.unit` or the `100.0 Relative` default (`:268`). This is a gap against the spec, and a likely early divergence point for any port.

**`alignment="at end"` positions the frame as** `start = principalDuration − length + start` (`OrnamentDef.java:431-446`), where `principalDuration` is the first non-null `duration` attribute found in the chord sequence. With `frame.offset="0"` the ornament ends exactly at the principal note's end. The override is skipped when an effective frame start was injected by multi-ornament distribution.

**Multiple ornaments on one principal note** (`OrnamentationMap.java:663-772`): grouped by principal note, split into "front" (not at-end) and "end" (at-end) lists **preserving map order**, then "proportional scaling if total exceeds principal note duration", then front ornaments applied sequentially from the start. This implements the rule the spec commented out.

**`repetitions="-1"` is an undocumented sentinel for "fill the frame"** (`OrnamentationMap.java:417-425`): when set, `maxNotes = ceil((milliseconds.date.end − milliseconds.date) / 150)` — a hard-coded 150 ms per repetition note. The spec's datatype is `minInclusive 0`, so `-1` is schema-invalid; treat it as a meico extension.

**`:|:` is normalised before tokenising** (`OrnamentationMap.java:353`): `note.order.replaceAll(":\\|:", ":| |:")`, confirming it means "end this repeat group, start the next".

**Repetition expansion lands back on the principal note.** After expanding the group, if the note at the repeat start has `intm == "0.0hs"` (i.e. is the principal pitch) the implementation appends one more copy so the figure resolves onto the principal note (`:432-439`), commenting "always land on principal note of the repetition, might add doubles -> need to sanitize".

**Consecutive duplicate pitches are dropped** (`:476`): "sanitze double notes, which can occur due to repetitions; if the note is the same as the last one, we can skip it, as it would be redundant" — but only when the pool does not consist entirely of one pitch (`hasSamePitches`), which preserves genuine tremolo/repeated-note ornaments.

**A derived attribute `note.order.perf` is written back** onto each `<ornament>` holding the fully expanded, repetition-resolved, `#`-stripped order. Downstream rendering (`:600`) reads `note.order.perf`, not `note.order`.

**Standard ornament definitions ship as data**, in `src/resources/ornaments.dict` — diatonic alteration sequences keyed by MEI/SMuFL name, using the same `|:`/`:|` tokens:

```
% trill
# trill
|: 0 1 :|

% upper turn
# upper turn
1 0 -1 0

% lower turn
# lower turn
-1 0 1 0

% upper mordent
# upper mordent
0 1 0

% lower mordent
# lower mordent
0 -1 0

% trill with mordent
# trill with mordent
|: 0 1 :| 0 -1 0

% double cadence lower prefix
# ornamentPrecompDoubleCadenceLowerPrefix
-1 0 |: 1 0 :|
```
Values are **diatonic** steps; SMuFL glyph names (or a lowercased space-separated form without the `ornament`/`ornamentPrecomp` prefix) are accepted as aliases.

---

## 5. Real-world v3 files are not schema-valid

The repo's own sample encoding `sample encodings/Max Reger - Moment Musical (MPM Toolbox Tutorial)/Reger - Moment Musical op 13 no 4.mpm` was mechanically updated by commit `4920516` (the `frame.start` → `frame.offset` rename) and now reads:

```xml
<temporalSpread frame.offset="-22.0" frameLength="44.0"/>
...
<temporalSpread frame.offset="0.0" frameLength="300.0" time.unit="milliseconds"/>
...
<ornament date="4860.0" name.ref="arpeggio" scale="0.0" note.order="#n96 #n97 #n98"/>
```

That is the v3 attribute name with **no unit suffixes** and a **`time.unit` that no element may legally carry**. The guidelines' own first code example (`src/mpm.odd:719`) has the same defect: `<temporalSpread frame.offset="0.0" frameLength="300.0" time.unit="milliseconds" intensity="0.5" noteoff.shift="false"/>`. And `ornamentDef.xml`'s exemplum writes `frame.offset="0"` — no suffix, violating its own mandatory-suffix schematron.

`ornamentationMap.xml`'s exemplum is staler still, using `noteids="id1 id3 id2 id4"` — an attribute that exists in no attribute class in v3 (it was superseded by `note.order` back in v2.1.3).

**Practical consequence:** a v3 reader must tolerate unit-less frame values and honour `@time.unit` when present, exactly as the reference implementation does. Treating the schematrons as hard requirements would reject the format's own sample corpus.

---

## 6. Consolidated ambiguity list

| # | Question | Status |
|---|---|---|
| 1 | Is `alignment` on `ornamentDef` or `temporalSpread`? | **Spec says `ornamentDef`; changelog, PR text and guidelines prose say `temporalSpread`; reference impl reads `temporalSpread`.** Accept both. |
| 2 | Is a unit suffix mandatory? | Contradictory across three schematrons. Real files omit it. Treat as optional, fall back to `@time.unit`, then `ticks`. |
| 3 | What is `%` relative to? | Unstated. Impl: principal note's **millisecond** duration; applied to both `frameLength` and `frame.offset`. |
| 4 | Multiple ornaments exceeding the note duration? | Rule written then **commented out** of the spec. Impl: proportional scaling, front group sequential from start, at-end group anchored at end. |
| 5 | How does `interval.diatonic` resolve? | Unspecified ("context-sensitive"). Impl resolves it upstream in MEI and carries halfsteps in an MSM `intm` attribute. |
| 6 | `repetitions` count semantics | Resolved: plays = `repetitions` + 1. |
| 7 | `|` and `:|:` tokens | Legal per schematron, undocumented in prose. `:|:` = `:|` + `|:`. `|` is accepted and ignored by the impl. |
| 8 | Duplicate pitch across a repeat boundary | Unspecified. Impl drops consecutive same-pitch notes unless the whole pool is one pitch. |
| 9 | v2 vs v3 document detection | **No namespace change, no version attribute.** Structural detection only. |
| 10 | Does the principal note itself sound? | Only if its ID appears in `note.order`. Both trill examples list `#princNote` explicitly. |
