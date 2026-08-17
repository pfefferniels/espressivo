# W0 Survey — Codebase Foundations and Available MPM Corpora

Author: `survey-code` agent. Date: 2026-08-10. Branch `compare-campaign`, worktree
`/Users/nielspfeffer/Projects/meico-ts-compare`, HEAD `930cdd1` (off main@9974ba3).

Scope: sections 1–8 as commissioned, plus §9 "Design constraints and reuse plan".
Every claim carries a `file:line` citation. Paths are relative to the worktree root
unless absolute. Facts marked **[measured]** were obtained by running code or shell
probes during this survey, not by reading.

---

## 0. Executive orientation — the five facts that move the design

Read these first; the rest is evidence.

1. **Curves are evaluable at arbitrary dates without a MIDI render, but only with the
   full style wiring.** `TempoMap.getTempoAt(date)` and `DynamicsData.getDynamicsAt(date)`
   are public and pure-ish, and constructing a map on a `copy()` of its element leaves the
   original document byte-identical **[measured]**. But a map constructed without
   `setHeaders(...)` resolves every *named* level (`bpm="Andante"`) to the renderer's
   100.0 default, silently. See §3.
2. **The corpus is transition-dense, not step-dense.** `transition.to` appears in 95/121,
   42/43 and 100/100 files of the three large real corpora; `curvature`/`protraction` in
   40/43 and 100/100 **[measured]**. Any metric that models a performance as a step
   function of instructions will be wrong on most real input. See §6.
3. **No in-repo fixture has more than one `<performance>`.** All 33 have exactly one. The
   only genuine multi-performance documents on this machine are three of the six official
   MPM sample encodings — and three of those six are unparseable by this port because of a
   UTF-8 BOM **[measured]**. See §5.3, §6.2, §8.3.
4. **The expression registry is a reusable *scale-space* foundation but not a reusable
   *coverage* foundation.** It is a licence-to-write list; it deliberately excludes `@date`,
   `rubato@frameLength`, `movement@position`, the whole `imprecisionMap.tuning` domain and
   every enum/structural attribute. A comparison module needs all of those. See §2.1, §1.6.
5. **Lint fails repo-wide at HEAD (1046 errors) and is deliberately not in the verify
   gate.** A new module must land at zero problems of its own; it cannot be gated on the
   repo count. See §7.4.

---

## 1. MPM data model (`src/mpm/**`)

### 1.1 Document shape

`<mpm>` → `<performance>`\* → (`<global>` | `<part>`\*) → `<header>` (style collections)
+ `<dated>` (maps).

The vocabulary is a single import-free leaf module, `src/mpm/names.ts` — namespace
`http://www.cemfi.de/mpm/ns/1.0` (`names.ts:18`), six `*Styles` collection names
(`names.ts:21-26`), thirteen map names (`names.ts:29-41`). It imports nothing by design;
`names.ts:8-11` records that adding an import re-opens the `Mpm ⇄ maps` cycle for all 31
element modules (RULE M3).

Environment discovery is **by name shape over the descendant axis, last-one-wins**, not by
an allow-list of children:

- maps: `localName.includes('Map') || localName === 'score'` (`Dated.ts:63`)
- style collections: `localName.includes('Styles')` (`Header.ts:75-79`)

This is why `imprecisionMap.timing` needs no special case — the domain is part of the local
name (`ImprecisionMap.ts:15-17`) — and why an unknown `gestureMap` (which occurs once in the
real corpus, §6.1) parses as a plain `GenericMap` rather than being rejected
(`GenericMap.ts:71-75`, `Dated.ts:63-74`).

### 1.2 Map inventory

Universal to every map: `@date` on every child (`GenericMap.ts:144-145,155`) — a child
without one is **skipped and never indexed**; `<style>` without `@name.ref` likewise
(`GenericMap.ts:146`). `@xml:id` on the map element (`GenericMap.ts:158`). `attribute()`
resolves a bare name, then the element namespace, then the `xml:` namespace
(`tree.ts:400-413`), so `attribute('id', e)` reads `xml:id`.

| map | instruction element(s) | attributes the reader actually reads |
|---|---|---|
| `<style>` (in every map) | `style` | `date` [num] `GenericMap.ts:144`; `name.ref` [ref] `:146,:495,:501`; `defaultArticulation` [ref] **articulationMap only** `ArticulationMap.ts:162-166,238-246` |
| `tempoMap` | `tempo` | `date` [num] `TempoMap.ts:122`; `bpm` [ref-or-num, **mandatory**] `:118-119,131-132`; `beatLength` [num, **mandatory** — absent ⇒ whole instruction dropped] `:120-121,125`; `transition.to` [ref-or-num] `:133-136`; `meanTempoAt` [num] `:141-143`; `xml:id` `:126-127` |
| `dynamicsMap` | `dynamics` | `date` `DynamicsMap.ts:155`; `volume` [ref-or-num, **mandatory**] `:162-165`; `transition.to` [ref-or-num] `:166-169`; `curvature` [num, clamped 0..1] `:170-172`; `protraction` [num, clamped ±1] `:173-175`; `subNoteDynamics` [bool] `:182-183`; `xml:id` `:158-159` |
| `rubatoMap` | `rubato` | `date` `RubatoMap.ts:106`; `name.ref` [ref] `:114-117`; `frameLength` [num, mandatory after def fallback] `:120-123`; `loop` [bool] `:124-125`; `intensity` [num] `:126-128`; `lateStart` [num] `:129-131`; `earlyEnd` [num] `:132-134`; `xml:id` `:109-110` |
| `articulationMap` | `articulation` | `date` `ArticulationMap.ts:114`; `xml:id` `:115-116`; `noteid` [ref, first char stripped] `:117-118`; `name.ref` `:120-123`; **twelve numerics** — `absoluteDuration` `:136`, `absoluteDurationChange` `:137`, `relativeDuration` `:138`, `absoluteDurationMs` `:139`, `absoluteDurationChangeMs` `:140-141`, `absoluteVelocityChange` `:142`, `absoluteVelocity` `:143`, `relativeVelocity` `:144`, `absoluteDelayMs` `:145`, `absoluteDelay` `:146`, `detuneCents` `:147`, `detuneHz` `:148` |
| `metricalAccentuationMap` | `accentuationPattern` | `date` `MetricalAccentuationMap.ts:70`; `name.ref` [**mandatory**] `:64-66`; `scale` [num, **mandatory**] `:67-69`; `xml:id` `:73-74`; `loop` [bool] `:75-76`; `stickToMeasures` [bool] `:77-78` |
| `ornamentationMap` | `ornament` (+ `<note>` pool children) | `date` `OrnamentationMap.ts:276,461`; `name.ref` [**mandatory**] `:268-270,455-457`; `note.order` [string] `:278-283,490-500`; `scale` [num] `:284-285,463-464`; `xml:id` `:286-287`; `noteid` [ref] `:308-309`; `repetitions` [num] `:310-312`; pool `<note>`: `midi.pitch`/`interval.chromatic`/`interval.diatonic` [num] `OrnamentNote.ts:134-136` |
| `asynchronyMap` | `asynchrony` | `date` `AsynchronyMap.ts:71,78`; `milliseconds.offset` [num] `:45,:74`; `xml:id` `:69`. **No style lookup at all.** |
| `movementMap` | `movement` | `date` `MovementMap.ts:94`; `xml:id` `:97-98`; `position` [num, absent ⇒ inherits previous `transition.to`] `:99-109,143-151`; `transition.to` [num] `:110-111`; `curvature` [num] `:116-117`; `protraction` [num] `:118-119`; `controller` [string] `:120-121`. **No style lookup.** |
| `imprecisionMap` (bare) | `distribution.*`, `measurement` | Same attribute set as the four variants, but **renders nothing**: `getDomain()` returns `''` (`ImprecisionMap.ts:84-87`) and the domain switch falls through (`:275-276`). Still parsed and indexed (`:659`). |
| `imprecisionMap.timing` / `.dynamics` / `.toneduration` / `.tuning` | `distribution.uniform`, `.gaussian`, `.triangular`, `.correlated.brownianNoise`, `.correlated.compensatingTriangle`, `.list` (+ `measurement`) | On the map: `detuneUnit` [string] `ImprecisionMap.ts:96`. Per distribution (`DistributionData.ts`): `date` `:56-57`; `xml:id` `:59-60`; `seed` [num] `:62-63`; `limit.lower` `:65-66`; `limit.upper` `:68-69`; `clip.lower` `:71-72`; `clip.upper` `:74-75`; `mode` `:77-78`; `deviation.standard` `:80-82`; `milliseconds.timingBasis` `:84-86`; `degreeOfCorrelation` `:88-90`; `stepWidth.max` `:92-93`; `<measurement>@value` `:95-100`. Domains selected `ImprecisionMap.ts:262-274` |

Factory registration is per-module side effect (`ArticulationMap.ts:351`,
`AsynchronyMap.ts:116`, `MetricalAccentuationMap.ts:184`, `MovementMap.ts:215`,
`OrnamentationMap.ts:732`, `RubatoMap.ts:244`, `TempoMap.ts:412`, `DynamicsMap.ts:294`,
`ImprecisionMap.ts:659-671`) — which is why `package.json`'s `sideEffects` list names
`./dist/mpm/elements/maps/*.js` (§4.3).

### 1.3 Style-def system

Two-level index: style type → style name → `GenericStyle` (`Header.ts:40`), built by
`addStyleType` whose switch picks the subclass (`Header.ts:108-129`), falling back to plain
`GenericStyle` (`:128`). Defs inside a `styleDef` are keyed by name, **last wins**
(`Header.ts:131`, `GenericStyle.ts:57-63`); a def whose factory throws is skipped without
displacing an earlier valid one (`GenericStyle.ts:60-63`). `styleDef@name` is mandatory
(`GenericStyle.ts:39-42`). Lookup: `Header.getStyleDef(type, name)` (`Header.ts:157-161`).

| def | class | attributes and parse defaults |
|---|---|---|
| `tempoDef` | `TempoDef` | `value` [num, **mandatory**] `TempoDef.ts:41-48`; absent ⇒ throw ⇒ def skipped |
| `dynamicsDef` | `DynamicsDef` | `value` [num, **mandatory**] `DynamicsDef.ts:36-41` |
| `articulationDef` | `ArticulationDef` | the same twelve numerics as `<articulation>` `ArticulationDef.ts:55-72`; field defaults `:19-30` (`relativeDuration` 1.0, `relativeVelocity` 1.0, the rest 0.0 or null). **Never written back.** |
| `rubatoDef` | `RubatoDef` | `frameLength` [**mandatory**] `RubatoDef.ts:37-39`; `intensity` default 1.0 `:28`; `lateStart` 0.0 `:27`; `earlyEnd` 1.0 `:28`. **Written back — see §1.5.** |
| `ornamentDef` | `OrnamentDef` | `alignment` [enum `at start`/`at end`, default `at start`] `:27,:67-76`; children `dynamicsGradient` / `temporalSpread`, last of each wins `:47-56` |
| `accentuationPatternDef` | `AccentuationPatternDef` | `length` [num, default 4.0] `:26,:36-45`; `<accentuation>` children: `beat` [mandatory per child] `:48-49`, `value` (default 0.0) `:52-54`, `transition.from` (default = `value`) `:56-59`, `transition.to` (default = `transition.from`) `:61-64`. **`length` written back and children reordered — see §1.5.** |

Sub-elements of `ornamentDef`:
`dynamicsGradient` — `transition.from` (default 0.0), `transition.to` (default =
`transition.from`) (`DynamicsGradient.ts:19-29`).
`temporalSpread` — generation-branched (`TemporalSpread.ts:253,112-119`); v2 reads
`time.unit`/`frame.start`/`frameLength` as bare doubles (`:262-268`), v3 reads
`frame.offset` (alias `frame.start`) and `frameLength` as unit-suffixed values (`:309-319`)
with defaults `{0.0,'ticks'}` (`:75`) and `{100.0,'relative'}` (`:82`). Both:
`intensity` (default 1.0) `:236,273-274`; `noteoff.shift` [enum `false`/`true`/`monophonic`,
default `false`] `:237,275-285`; `alignment` `:289-297`. Negative frame length is clamped
one-sided (`:322-324` v2, `:185-191` v3).

### 1.4 `pulsesPerQuarter`

Default **720**, `Performance.ts:134`. Read in `parseData` at `Performance.ts:196-203`;
**if absent, the attribute is added to the live element** (`:198-199`). Parsed with a
radix-less `parseInt` and unvalidated, so a non-numeric value yields `NaN` (`:202`).
Getters `:298-303`, setter writes through `:304-310`.

Map math depending on it: `Msm.convertPPQ` rescales the whole MSM clone
(`Performance.ts:434`); tempo→ms (`TempoMap.ts:246`, `computeMillisecondsForNoTempo`
`:365-367`, `computeMillisecondsForConstantTempo` `:368-374`); metrical-accentuation beat
arithmetic (`MetricalAccentuationMap.ts:123,128,134,152-154`). Nothing else in `src/mpm/**`
reads it.

**Comparison consequence:** ppq is per-`<performance>`, and two performances of the same
piece may declare different values (the official corpus has both 720 and 480, §6.2). Any
cross-performance date comparison must normalize to a common tick grid or to quarter notes
first.

### 1.5 Parse-time document mutation — the read-only module's hazard list

Merely constructing the MPM classes rewrites the document. Complete list:

| site | mutation |
|---|---|
| `Performance.ts:196-200` | adds `pulsesPerQuarter="720"` when absent |
| `Performance.ts:205-208` | appends an empty `<global>` when absent |
| `Global.ts:56-59`, `:64-67` | appends empty `<header>` / `<dated>` |
| `Part.ts:92-96`, `:113-116`, `:121-124` | adds `name=""`; appends empty `<header>` / `<dated>` |
| `Header.ts:101` → `:143-147` | a **duplicate `*Styles` collection DELETES the earlier one** |
| `Header.ts:134-138` | a `*Styles` element not directly under `<header>` is **detached and re-appended** at the end |
| `Dated.ts:93` → `:111-117` | a **duplicate map of the same type DELETES the earlier one** |
| `Dated.ts:101-106` | a map element parented elsewhere is **detached and re-appended** |
| `GenericMap.ts:157` → `sortXml` `:167-174` | **every indexed child of every map is removed and re-inserted in date order**; skipped children (no `@date`; `<style>` without `@name.ref`) are not re-inserted and **drift to the end** |
| `RubatoDef.ts:41-44,58-62,63-67` | adds `intensity="1"`, `lateStart="0"`, `earlyEnd="1"` when absent |
| `RubatoDef.ts:49-55`, `:72-73` | **respells values already present**: `intensity="1.0"` → `"1"`, `"0"` → `"0.01"` (`:194-198`); `lateStart`/`earlyEnd` rewritten **unconditionally** through the clamp (`:211-230`) |
| `AccentuationPatternDef.ts:36-40` | adds `length="4"` when absent |
| `AccentuationPatternDef.ts:67` → `:192-199` | **reorders `<accentuation>` children by `@beat`** |
| `RelatedResource.ts:52-60`, `Author.ts:63-65`, `Comment.ts:52-54` | metadata: adds `uri=""`/`type=""`, appends empty text nodes |

Render-time, one write goes back into the *MPM* rather than the MSM clone:
`ornamentInstantiation.ts:307-311` writes `note.order.perf` onto the `<ornament>` element
(fired from `OrnamentationMap.ts:478`, skipped only when `expandOrnaments` is false `:476`).

This table is the entire justification for D-A (§2) and for the copy-before-construct
recipe in §3.4.

### 1.6 Part-local vs global shadowing — and it differs between styles and maps

**Style defs shadow per (type, name), WITH fallback.** `GenericMap.getStyle`
(`GenericMap.ts:506-514`): local header first (`:509-510`), global consulted only if the
local lookup returned null (`:511-512`); empty/null name short-circuits (`:507`). Because
`Header.getStyleDef` returns null for a missing *name* as well as a missing *type*
(`Header.ts:157-161`), a part header declaring `tempoStyles` without the referenced name
still falls through to global.

But the expression module documents a sharper reading of the same code
(`styleScope.ts:8-15`): the fallback is at `styleDef` granularity, so a part that redeclares
`<styleDef name="MEI export">` with one `<dynamicsDef name="p">` **shadows the global
`"MEI export"` wholesale** — a level of `"f"` under it resolves to no def at all and falls
through to `parseFloat("f")`. Both statements are true; the second is the one that changes
rendered numbers.

**Maps shadow per TYPE, WHOLESALE, with NO fallback.** `Performance.resolvePartMaps`
(`Performance.ts:603-632`) is `dated.getMap(TYPE) ?? globalMaps.<field>` per field. A
part-local `tempoMap` **replaces** the global one entirely for that part, including for
dates the local map does not cover. The four imprecision domains shadow independently
(`:619-630`). Complement: `getAllMsmPartsAffectedByGlobalMap` (`:789-810`) removes from a
global map's reach every MSM part whose MPM part declares its own map of that type.

### 1.7 What the expression registry does NOT cover

`REGISTRY_ROWS` (`registry.ts:730-740`) is 83 rows and is a **licence-to-write** list, not a
coverage list (`registry.ts:11-15`). Imprecision rows are generated for three domains only
(`registry.ts:660-674`), so **`imprecisionMap.tuning` has no rows at all**.

Excluded but *named* as read-only constants (the applier has a symbol for each):
`beatLength` (`registry.ts:896`), ornament `scale` (`:904`), `milliseconds.timingBasis`
(`:911`), `time.unit` (`:932`), `noteoff.shift` (`:953`), `subNoteDynamics` (`:962`), `loop`
(`:974`), `stickToMeasures` (`:975`), the five `EXCLUDED_ARTICULATION_LEVERS`
(`:986-997` — `absoluteDuration`, `absoluteDurationMs`, `absoluteVelocity`, `detuneCents`,
`detuneHz`), and `INERT_IMPRECISION_MAP` (`:914`).

Excluded and **not named anywhere** — the comparison module must build these fresh:

- **`@date` on every instruction of every map and on `<style>`** (`GenericMap.ts:144`). Zero
  registry coverage; it is the map key and it is the axis an edit distance runs along.
- `rubato@frameLength` (`RubatoMap.ts:120-121`) and `rubatoDef@frameLength`
  (`RubatoDef.ts:37-39`) — the registry's only `frameLength` row is `temporalSpread`
  (`registry.ts:525-539`), a different quantity.
- `accentuationPatternDef@length` (`:36-45`); `accentuation@beat`/`@value`/
  `@transition.from`/`@transition.to` (`:48-63`) — excluded by §7.8/D-C for degree-1
  homogeneity with `@scale` (`registry.ts:483-487`).
- `ornament@repetitions` (`OrnamentationMap.ts:310-312`); pool-note `midi.pitch`,
  `interval.chromatic`, `interval.diatonic` (`OrnamentNote.ts:134-136`).
- `distribution.*@seed` (`DistributionData.ts:62-63`); `@degreeOfCorrelation` (`:88-90`).
- **Every** distribution attribute under `imprecisionMap.tuning` (`DistributionData.ts:65-100`).
- `movement@position` and `movement@transition.to` (`MovementMap.ts:99-111`) — excluded
  under D-G by prose only (`registry.ts:724-725`).
- `ornamentDef@alignment` (`OrnamentDef.ts:67-76`), `temporalSpread@alignment`
  (`TemporalSpread.ts:289-297`).
- All structural/identity attributes: `name.ref`, `defaultArticulation`, `noteid`,
  `note.order`, `controller`, `detuneUnit`, `name`, `xml:id`,
  `performance@pulsesPerQuarter`, `part@number`/`@midi.channel`/`@midi.port`.

---

## 2. Expression module (`src/expression/**`) — what to reuse

19 modules, 8 265 lines. None is exported from the package barrel: `src/index.ts` exports
only the facade functions (`src/index.ts:62-69`), so **every module below is interior-only
and reachable by a sibling interior module by direct import.** The eslint layer zone for
`expression` forbids importing `src/mpm/**` except `names.js` (`eslint.config.js:79-100`).

### 2.1 Verdict table

| module | exported surface | reuse verdict |
|---|---|---|
| `registry.ts` (1058) | `EXPRESSION_DIMENSIONS`, `RegistryRow`, `rowFor`, `rowForIn`, `rowsOf`, `bindRowSpace`, `factorDomainOf`, `siteKindsOf`, `scaleSpaceTagOf`, `imprecisionGroupAttributes`, ~20 named constants | **Reuse the scale-space assignment; do NOT reuse the row set as coverage.** See §2.2. |
| `transforms.ts` (579) | `ScaleSpace`, `ScaleSpaceTag`, `FactorDomain`, `TransformResult`, `SCALE_SPACE_FACTOR_DOMAINS` + per-space transforms | **Reuse the `ScaleSpace` type and its domains; the transforms themselves are `s`-parameterized exaggeration, not distance.** A distance needs `T(x)` alone — see §2.2. |
| `datedView.ts` (127) | `DatedEntry`, `orderedEntries`, `styleSwitchAt`, `styleNameAt` | **Reuse verbatim.** Renderer-faithful ordering including the NaN-to-front behaviour (`datedView.ts:17-27`) and positional style scope (`:81-105`). Comparison needs exactly this. |
| `mpmTree.ts` (176) | `MpmEnvironment`, `PerformanceView`, `readPerformances`, `environmentsOf` | **Reuse verbatim.** `readPerformances(root)` already returns *all* performances in document order (`:130-150`) — the multi-performance entry point comparison needs, for free. |
| `styleScope.ts` (211) | `LevelDomain`, `LEVEL_DOMAINS`, `ResolvedStyleDef`, `LevelReading`, `findStyleDef`, `readDefValue`, `readLevel`, `resolveLevel` | **Reuse verbatim, and prefer it over the renderer classes.** It returns `'def' | 'literal' | 'unresolvable'` (`:63-74`) instead of the renderer's silent 100.0 default — see §3.3. |
| `mpmDocument.ts` (80) | `parseMpmDocument`, `parseMpmRoot`, `serializeMpmDocument`, `serializeMpmRoot`, `canonicalBaseline` | **Reuse verbatim.** The raw-`Builder` parse discipline (D-A) and the canonical baseline. |
| `temporalValue.ts` (209) | `TemporalSuffix`, `TemporalDomain`, `TemporalText`, `parseTemporalText`, `formatTemporalText`, `resolveTemporalDomain`, `FrameFormat`, `detectFrameFormat`, `v3FrameOffsetAttribute` | **Reuse verbatim** for any v3 ornament dimension. Per-element generation detection (`:187-194`) is exactly what comparison needs to compare a v2 and a v3 spread. |
| `msmFacts.ts` (162) | `MsmNote`, `MsmPart`, `MsmFacts`, `parseMsmRoot`, `readMsmFacts`, `shortestNoteInTicks`, `shortestNoteInMilliseconds` | **Reuse verbatim** if comparison takes an optional MSM. Note `readMsmFacts` gives `ppq` + per-part notes with symbolic *and* (when performed) millisecond extents (`:39-51`). |
| `attributes.ts` (80) | `numberToString`, `readAttributeValue`, `readNumericAttributeValue`, `writeAttributeValue`, `writeNumericAttributeValue` | **Reuse the two readers.** The writers are irrelevant to a read-only module. |
| `siteRef.ts` (149) | `SiteRef`, `defContainerLabel`, `instructionSiteRef`, `defSiteRef`, `siteRefOf` | **Reuse the type and the constructors.** `SiteRef` is already the plain-data locator a ranked-deviation report needs (`:25-38`), and `:11-17` records that `xmlId` is absent from 7 of 16 reference fixtures — the reason `index` is the load-bearing field. |
| `selection.ts` (232) | `SELECTABLE_TYPES`, `SELECTABLE_IMPRECISION_MAPS`, `resolveSelection` | Reuse only if comparison gains an id-scoped mode. |
| `levels.ts` (975) | `applyLevelDimension` | **Do not reuse** — it is the two-pass write path. Its *center* computation (§7.1) is worth reading as prior art for a per-performance normalization. |
| `estimates.ts` (482) | `estimatesFromMsm` | Reference only. |
| `gate.ts`, `options.ts`, `report.ts`, `weights.ts`, `applier.ts` | see §4 for `report.ts`'s accumulator shape | Write-path; reference only. `report.ts`'s `DimensionAccumulator`/`ReportSink` (`:258`,`:453`) are a good template for a per-dimension comparison accumulator. |

### 2.2 What the registry hard-codes that comparison must generalize

The presumptive plan (CAMPAIGN.md G5, LOG.md `[DECISION]`) is
`d(x,y) = |T(x) − T(y)|` in the registry's scale spaces. The survey's verdict: **sound as a
per-attribute local distance, insufficient as the metric foundation.** Five concrete gaps.

1. **`T` is not exported.** `transforms.ts` exposes the *composed* operation
   `x' = T⁻¹(s·T(x))` per space, not `T` itself. A distance needs the forward map alone.
   Extracting `T` per `ScaleSpace` is a small, well-defined new module — and it must handle
   the two spaces where `T` is not a scalar function at all: `joint-trim`
   (`registry.ts:130-137`, a pair transform on `(lateStart, earlyEnd)`) and `level`, whose
   center is a **run-time property of the performance** (`registry.ts:118-124`,
   `bindRowSpace` `:830-841`).
2. **The `level` center is per-document, which breaks symmetry.** For tempo and dynamics
   the space is `log-around-center` where the center is that performance's own geometric
   mean over the center population (`registry.ts:150-154`). Two performances have two
   different centers, so `|T_A(x) − T_B(y)|` is not a distance between comparable
   quantities and is not symmetric under swapping A and B. Comparison must either fix a
   shared center per pair/corpus, or drop the center entirely — note that for a *difference*
   the center cancels: `ln(x/μ) − ln(y/μ) = ln(x/y)`. **`log-around-center` and
   `log-around-1` induce the same distance**, which is the clean resolution and is
   independently corroborated by mpmify's `curve_rmse` using bare `log2(bpm)` (§6.4).
3. **`inCenterPopulation` and `p5r` are exaggeration concepts with no comparison meaning**
   (`registry.ts:145-162`). `p5r` verdicts (`'holds' | 'saturates' | 'non-monotone' |
   'cliff'`, `:103`) describe monotonicity of a *rendered* effect in `s`; they say nothing
   about whether an attribute difference is perceptually large.
4. **Row coverage excludes the comparison module's primary axis.** `@date` has no row
   (§1.7). An edit distance between two performances is largely about *where* instructions
   are, not only what value they carry.
5. **Rows are keyed by `(element, attribute)` and are not unique across dimensions.**
   `rowFor` returns first-wins for the imprecision family (`registry.ts:781-796`); a caller
   needing the right dimension must use `rowForIn` (`:798-809`). A comparison walk over
   imprecision maps must use the dimension-qualified lookup.

**What is genuinely reusable and valuable:** the *assignment* of each attribute to a scale
space — that `relativeDuration` is a ratio, `absoluteDelay` a signed gain, `curvature` a
boundary-power quantity on `[0,1]`, `meanTempoAt` a logit on `(0,1)` — together with each
row's `valueDomain` predicate (`registry.ts:161`) which is exactly the input gate a
comparison reader needs to decide "this value is not comparable, report and skip".

---

## 3. Curve evaluation without a MIDI render — **feasible, with three caveats**

This was the commission's pivotal question. It was settled empirically, not by reading.

### 3.1 The evaluators exist and are public

- **Tempo.** `TempoMap.getTempoAt(date): number` (`TempoMap.ts:181-184`) → `getTempoDataAt`
  (`:194-200`) → `getTempoAtStatic` (`:213-223`). The transition is a power curve whose
  exponent is `log(0.5)/log(meanTempoAt)` (`:177-179`), and `getTempoDataOf` normalizes
  three cases back to constant tempo (`:137-158`).
- **Tick→millisecond.** `TempoMap.computeDiffTiming(date, ppq, tempoData)` is `static` and
  public (`:358-363`), dispatching to `computeMillisecondsForNoTempo` (`:365-367`),
  `...ForConstantTempo` (`:368-374`) and `...ForTempoTransition` (`:392-409`) — Simpson's
  rule, since the duration is the integral of 1/tempo and has no closed form (`:375-391`).
  **This means a comparison module can build a full symbolic→ms map without any MSM or MIDI
  render**, using only the tempo map and a ppq.
- **Dynamics.** `DynamicsData.getDynamicsAt(date): number` (`DynamicsData.ts:140-146`) —
  a cubic Bézier with inner control points from `curvature`/`protraction`. Reached via
  `DynamicsMap.getDynamicsDataAt(date)` (`DynamicsMap.ts:127-133`).
- **Movement/pedal.** `MovementData` uses the same Bézier machinery (`bezier.ts:1-16`).
- **Rubato.** `RubatoMap.computeRubatoTransformation` is **`private static`**
  (`RubatoMap.ts:166-173`). Not reachable. It is four lines and its evaluation order is
  declared load-bearing (`:161-165`); a comparison module wanting a rubato warp must
  transliterate it, exactly as `datedView.ts` transliterates `GenericMap.parseData`.

### 3.2 The curvature math is already a pure, dependency-free module

`src/mpm/elements/maps/data/bezier.ts` **imports nothing** and is pure functions over plain
numbers (`bezier.ts:1-16`): `innerControlPointsXPositions` (`:27-47`), `tForDate`
(`:57-78`), `bezierPoint` (`:87-104`), `sampleSegment` (`:122-137`). RULE C3 created it for
exactly this reason (`ARCHITECTURE.md:785-802`). **A comparison module can evaluate every
dynamics and movement curve shape standalone by importing this one leaf** — subject to the
layer-zone question in §7.2. This is the cleanest single reuse in the whole survey.

### 3.3 Caveat 1 — the renderer's 100.0 default silently masks unresolved levels **[measured]**

Constructing a `TempoMap` from an element **without** `setHeaders(...)` makes every
style-resolved level fail. Measured on `tests/integration/fixtures/reference/tempo_dynamics_spans.mpm`,
whose first `<tempo>` is `bpm="Andante"`:

```
EXP5 tempo at 0 with NO headers wired: 100
EXP3 getTempoAt: 0:100.000  360:100.000  720:100.000 ... 5760:100.000
```

Every sample is the MPM default 100.0 bpm (`TempoMap.ts:214`), with a `console.error` per
call. Wiring `Header.createHeader(headerEl.copy())` + `map.setHeaders(header, null)` fixes it:

```
WIRED getTempoAt: 0:100.00  720:101.00  1440:101.00 ... 5760:101.00
  tempoDef Andante = 101.0   tempoDef Adagio = 60.0
```

Two consequences. First, **any comparison engine using the renderer classes must construct
and wire `Header` objects**, and `Header` construction is precisely what mutates
`rubatoDef`/`accentuationPatternDef` (§1.5). Second, the renderer **cannot distinguish
"unresolvable" from "authored 100 bpm"** — it returns 100.0 for both. `styleScope.readLevel`
returns a discriminated `'unresolvable'` instead (`styleScope.ts:63-74`, rationale
`:26-30`), which is strictly better for a comparison report: feeding a fabricated 100.0 into
a distance invents a difference the documents do not contain.

### 3.4 Caveat 2 — copy-before-construct is safe, construct-in-place is not **[measured]**

```
EXP1 construct-on-original mutates document: false     ← fixture-specific, NOT a guarantee
EXP2 construct-on-copy mutates original:    false      ← the guarantee
EXP3 evaluation mutates the (copied) map element: false
EXP4 original untouched: true
```

`Element.copy()` before construction leaves the source tree byte-identical in every trial,
including on the real 3-performance Telemann file (§3.6). Construct-in-place happened not to
change bytes on this fixture only because its map children were already date-sorted and
contiguous — `sortXml` (`GenericMap.ts:167-174`) is a no-op in that case. On a map whose
children are out of order, or which has a dateless child, it is not (`GenericMap.ts:120-129`,
`datedView.ts:1-16`). **Do not generalize EXP1.**

Note also that evaluation itself mutates the `TempoData` object — `getTempoAtStatic` fills
`exponent` lazily and the code declares this intentional (`TempoMap.ts:206-212`) — but
`TempoData` is created fresh per `getTempoDataOf` call, so no document state is touched.

### 3.5 Caveat 3 — the sampling boundary is strict-before, so date 0 reads the default **[measured]**

`getTempoDataAt` searches with `getElementIndexBefore(date)` (`TempoMap.ts:195`), which is
**strictly** before (`GenericMap.ts:315-328`). So sampling at exactly an instruction's date
returns the *previous* instruction's tempo, and sampling at date 0 — where essentially every
real document places its first `<tempo>` — falls through to `i = -1` and returns the 100.0
default. This is visible in every curve of the Telemann measurement below: all three
performances read 100.0 at sample 0 and their true tempo from sample 1 onward. A comparison
module that samples on a uniform grid starting at 0 will inject a spurious identical first
point into every performance, damping every distance. Either sample at `date + ε`, or use
`getElementIndexBeforeAt` semantics, or drop the first sample.

(By contrast `DynamicsMap.getDynamicsDataAt` uses `getElementIndexBeforeAt` — inclusive —
`DynamicsMap.ts:128`. **The two maps disagree on this boundary.**)

### 3.6 End-to-end proof on real multi-performance data **[measured]**

Telemann, *Grave* TWV 51-D7, three performances in one document, sampled every 720 ticks
(one quarter) over 199 common points, using copy-then-wire-then-`getTempoAt`:

```
Baroque    ppq=720 instructions=7 lastDate=142560
Fast       ppq=720 instructions=7 lastDate=142560
Romantic   ppq=720 instructions=7 lastDate=142560
original document untouched: true

pairwise RMS log2 tempo distance:
  Baroque <-> Fast:     1.0726
  Baroque <-> Romantic: 0.1084
  Fast    <-> Romantic: 0.9720

first 12 samples each:
  Baroque    100.0 58.0 58.0 58.0 ...
  Fast       100.0 123.0 123.0 123.0 ...
  Romantic   100.0 62.0 62.0 62.0 ...
```

The numbers are musically sensible — Baroque (58) and Romantic (62) are near-neighbours at
0.108, Fast (123) is ~1.0 away from both, i.e. roughly a factor of two — which is the
strongest available evidence that the log-tempo sampled-curve distance is a workable
foundation. The date-0 artifact of §3.5 is visible as the leading 100.0 in all three rows.

### 3.7 Verdict on D-A compatibility

Constructing MPM classes **on a copy** does not contradict D-A. D-A's prohibition
(`expression/DESIGN.md:627-641`, `mpmDocument.ts:1-36`) exists because the expression engine
must report *which bytes it changed*, and an inherited parse-time edit makes that
impossible. A comparison module writes no bytes at all, so the only requirement is that the
caller's document is not perturbed — which `copy()` guarantees **[measured]**. Two honest
costs: (a) the copies allocate, and on the 121-file Daten corpus that is a per-pair cost;
(b) the renderer's 100.0 default (§3.3) is a *semantic* divergence from `styleScope`, not
just a performance one.

**Recommended split:** read the document with the expression layer (`mpmDocument` →
`mpmTree` → `datedView` → `styleScope`), which is honest about unresolvable values and never
touches the tree; and evaluate *curve shape* with the pure `bezier.ts` functions plus a
transliterated tempo/rubato evaluator. Fall back to constructing real map objects on copies
only where transliteration would be genuinely risky — principally
`computeMillisecondsForTempoTransition`'s Simpson integration (`TempoMap.ts:392-409`), whose
comment forbids reassociating the sum.

---

## 4. API and facade conventions

### 4.1 Where the rules live

There is **no rule index or table of contents**; the section-prefix letter is the namespace.
`grep -n "^\*\*RULE" refactor/ARCHITECTURE.md` enumerates **47** definitions, all at column 1
as `**RULE <ID> (short title).**`. Reading instructions `ARCHITECTURE.md:6-27`, with the
precedence rule at `:25-27`: *"Charter invariants are not restated here; they win over
anything below."*

| prefix | section | file:line |
|---|---|---|
| M (module map) | §1.2 | `ARCHITECTURE.md:58` |
| F (facade) | §2.1/§2.2 | `:196`, `:261` |
| N (null-vs-undefined) | §3 | `:581` |
| C (class-vs-function) | §4 | `:761` |
| I (immutability) | §5 | `:857` |
| E (errors) | §6 | `:961` |
| U (units/brands) | §7 | `:1023` |
| R / D-A…D-I / A1…A11 | expression campaign | `expression/DESIGN.md:162`, `:625` |

### 4.2 The rules a comparison facade must satisfy — verbatim

**RULE F1 (plain data), `ARCHITECTURE.md:204-220`:**
> Every facade input and output is a value that survives `structuredClone` and `postMessage`
> unchanged. The permitted types are: `string`, `number`, `boolean`, `null`, `Uint8Array`,
> plain object literals, and arrays of those. No class instances, no `Map`/`Set`, no
> functions, no getters, and — the charter's explicit prohibition — **no XomTypes type
> (`Element`, `Attribute`, `Document`, `Nodes`, `Elements`, `Text`, `Builder`) may appear in
> any facade signature**, not even behind `readonly`.

**RULE F2 (XML crosses as text), `:222-227`:**
> MEI, MSM and MPM documents enter and leave the facade as XML **strings**. … a string is
> plain data by construction, it makes F1 free, it makes RULE I3 (never mutate inputs) free,
> and it keeps the XML interior genuinely interior.

**RULE F2a (which serializer), `:229-239`:** every facade function returning document text
produces it with **`getRootElement().toXML()`**, never `Document.toXML()`.

**RULE F5 (named parameters), `:407-411`:**
> `renderExpressiveMidi({ msm, mpm })`, not `renderExpressiveMidi(msm, mpm)`. Two XML strings
> are interchangeable to the type system; the object keys are what make swapping them
> impossible.

F5 is directly load-bearing for comparison, whose arguments are two or more
interchangeable MPM strings.

**RULE E2 (error taxonomy), `:977-991`:**
> The facade converts every interior `null`-meaning-failure into a thrown typed error and
> **never returns `null` itself** (consistent with N4). Every error carries the offending
> document kind and, where cheap, the element name — never a stack of interior XomTypes
> objects.

**RULE N4 (no `undefined` in outputs), `:685-693`:**
> In `src/api/types.ts`, every field of every *output* type is always present; absence is
> `null`. Every *input* option is `?:` and is never `null`. Reason: `JSON.stringify`
> silently drops `undefined` properties … the check must cover **both** files.

**RULE N1 (the meaning split), `:588-597`:** `null` = "the domain says there is nothing
here"; `undefined` = "the caller did not supply this". Never interchangeable.

**RULE N5 (`x == null` stays), `:695-700`:** `eqeqeq` is relaxed to
`['error','always',{null:'ignore'}]`; "any worker who 'fixes' a `== null` to `=== null` has
introduced a bug."

**RULE M1 (dependency direction), `:97-102`:** `src/mpm/**` must not import `src/mei/**`;
`src/msm/**` must not import `src/mpm/**`/`src/mei/**` except `import type`; leaves import
nothing from higher layers.

**RULE I3 (facade guarantees), `:887-890`:** never mutates inputs; every return freshly
allocated (`!==` at every level between two equal-input calls); survives `structuredClone`.

**RULE C3, `:785-802`** created `bezier.ts` as pure functions — the §3.2 reuse.

**RULE R2 (determinism), `expression/DESIGN.md:174-178`:** *"deterministic — no RNG anywhere
in the transform; a given (mpm, s-vector) always yields the same MPM bytes. Render
determinism is not claimed."*

**Charter acceptance criterion, `CHARTER.md:103-113`:** facade outputs must survive
`postMessage` to a Web Worker and support referential-equality memoization; *"A `readonly`
wrapper around a live XomTypes/XML node fails both."*
**Charter invariant 1, `CHARTER.md:13-14`:** *"`npm run verify` … must be green before every
commit. No exceptions, no `--skip`, no test exclusion."*

### 4.3 Facade template (`src/api/expression.ts` is the model)

**Error hierarchy.** The root lives in the XML layer, not `src/api/` — `MeicoError`
(`src/xml/errors.ts:18`), `MissingNodeError` (`:26`), `NumberFormatError` (`:34`),
`OutOfRangeError` (`:49`) — because `MissingNodeError` is thrown from `src/xml/tree.ts` and
a layer-1 module may not import layer 6 (`src/xml/errors.ts:4-9`). `src/api/errors.ts`
**re-exports** rather than redeclares (`:15`), then adds `ParseError` (`:23`),
`EmptyDocumentError` (`:30`), `PerformanceNotFoundError` (`:33`), `InvalidOptionError`
(`:41`), `SelectionNotFoundError` (`:60`), `EngineInvariantError` (`:85`).

**Every class has an empty body — no `code` field, no `name` override, no error-code
system.** Detail is carried by (a) the message, always prefixed with the document kind
(`DocumentKind = 'MEI' | 'MSM' | 'MPM'`, `src/api/parse.ts:13`), and (b) the ES2022 `cause`
option (`parse.ts:34-37`, `expression.ts:185,303,548`). Multi-offender errors are one throw
with a bulleted list, not fail-fast (`expression.ts:504-512`, rationale `errors.ts:43-58`).

**Entry-function shape** (`src/api/expression.ts:252-268`) — validate, parse, optional side
input, run, return a fresh literal:

```ts
export function exaggerateMpm(mpm: XmlText, options: ExaggerateOptions): ExaggerationResult {
  checkExaggerateOptions(options);

  const root = parseRoot('MPM', mpm, parseMpmRoot);
  const facts = options.msm == null ? null : readMsm(options.msm);

  const report = transform(root, options);

  return {
    mpm: serializeMpmRoot(root),
    report: facts === null ? report : withEstimates(root, report, facts),
  };
}
```

**Parse guard** (`expression.ts:84-93`) — `requireXmlText` then `parseOrThrow` then a root
local-name check. **Error wrapping** (`:295-306`) wraps interior throws in
`EngineInvariantError` with `{ cause }`.

**Three-layer option validation, all before the document is parsed:** (1) `unknown`-widened
guards for JS callers (`:157-170`, `:466-496` — required because
`no-unnecessary-condition` would delete a guard against the declared type, `:158-162`);
(2) delegation to the interior's own validators so there is one definition of legality
(`:189-193`, rationale `:150-155`); (3) field-by-field construction of the interior option
object, **never a spread** (`:133-141`, rationale `:127-131`). Ordering is a stated contract
(`:146-148`).

**Results** are plain object literals, all fields `readonly`, arrays `readonly T[]`, absence
`| null`, interior arrays copied out before crossing (`:423-429`). Unit-carrying output
numbers are branded (`types.ts:22,282-292`); inputs never are.

**`src/api/index.ts:19-22`, complete:**
```ts
export * from './errors.js';
export * from './expression.js';
export * from './pipeline.js';
export type * from './types.js';
```

### 4.4 Export policy and packaging

`src/index.ts` lists the facade **member by member, not `export *`** — the policy comment
(`src/index.ts:46-52`) explains that `./api/index.js` re-exports
`MeicoError`/`MissingNodeError`, which the barrel already exports from `./xml/errors.js`,
and two star exports of one name are ambiguous. Scope statement `src/index.ts:1-5`.
`src/expression/**` internals are deliberately absent from the barrel.

`package.json`: `"type": "module"` (`:23`); `exports` has **no `./api` subpath** (`:26-32`);
`sideEffects` is `["./dist/mpm/Mpm.js", "./dist/mpm/elements/maps/*.js"]` (`:33-36`);
`engines.node >= 18.18.0` (`:37-39`);
`"verify": "npm run build && npm run typecheck:tests && vitest run"` (`:58`) — **lint is not
in it**. Runtime dependencies are three, all XML-layer: `@xmldom/xmldom`, `uuid`, `xpath`
(`:60-64`). Campaign G4 forbids *new* runtime dependencies without a journaled rationale
(`comparison/CAMPAIGN.md:41`).

---

## 5. Tests

### 5.1 Organization and the gate

| dir | test files |
|---|---|
| `tests/api/` | 6 |
| `tests/expression/` | 17 (+2 helper modules) |
| `tests/integration/` | 10 |
| `tests/mei/` 4 · `tests/midi/` 4 · `tests/mpm/` 2 · `tests/msm/` 5 · `tests/music/` 3 · `tests/supplementary/` 3 · `tests/xml/` 6 | |

`vitest.config.ts` is short: `globals: true`, `testTimeout: 30000`, no environment/pool
settings, **no coverage thresholds**. The coverage `include` is a **curated file-and-glob
list**, not `src/**` — 21 entries (`vitest.config.ts` include block), each addition
documented by a comment naming the campaign that added it. `src/expression/**/*.ts` was
added by the expression campaign's W2 with a four-line rationale.

> **Constraint:** `src/comparison/**` is **not** auto-included. The config's own comment
> makes the point about `src/supplementary/`: *"listed file by file rather than by glob, so
> a new module there is invisible to the coverage invariant until it is named — which is why
> this line exists."* Adding the glob is a required work item.

### 5.2 The property-suite template

`tests/expression/exaggerationProperties.test.ts` (533 lines) is the model. Its header
(`:1-13`) states the three honesty rules a metric-property suite should copy:

> - **P1 identity (A2)** is a BYTE claim, and it is made against the canonical baseline —
>   `serialize(parse(t))` — never against the input. …
> - **P2 composition** is a NUMERIC claim with an epsilon, made only where nothing clamped.
>   Under clamping it genuinely breaks … and the remedy is an output rather than a proof …
> - **A4's global invariant** — the engine never writes a non-finite value — is asserted by
>   sweeping deliberately hostile XML, because that is the only place it can fail.

Inputs are **not** randomly generated: there is no PRNG and no fuzzer. The suite builds one
hand-authored document reaching all fifteen dimensions (`EVERY_DIMENSION`, `:31-46`
docstring + `:47-80`), deliberately clamp-free and refusal-free so composition can be
asserted across the whole surface, with **values spelled non-canonically on purpose**
(`"0.30"`, `"1.40"`, `"-22.0"`) so that a byte assertion can detect a missing `s === 1`
short-circuit (`:38-45`). Fixtures are shared through `tests/expression/applierFixtures.ts`
(124 lines: `exaggerate`, `globalDocument`, `numberAt`, `textAt`) and
`rawFixtures.ts` (41 lines).

For a comparison campaign this is the right shape: **state each metric axiom
(identity, symmetry, triangle inequality, invariance under a no-op rewrite) as a named
property, over a small set of hand-authored documents chosen so the property is not vacuous,
plus a hostile sweep for the never-NaN invariant.**

### 5.3 Fixture inventory — 33 `.mpm` files

All 33 share `xmlns="http://www.cemfi.de/mpm/ns/1.0"`, **ppq = 720**, and **exactly one
`<performance>`**. Every one has a same-basename `.msm` sibling; there are no exceptions.

**`tests/integration/fixtures/reference/` (16)** — MEI-derived, `<performance name="MEI
export performance">`, generated by meico v0.11.2.

| file | bytes | maps (instruction counts) | styleDefs | trans.to | notes |
|---|---|---|---|---|---|
| `articulations.mpm` | 2185 | articulationMap (articulation 9, style 1) | articulationStyles: 8 articulationDef | 0 | full articulation vocabulary; `defaultArticulation`; 4 UUID `xml:id` |
| `composite_advanced.mpm` | 1749 | tempo 1, dynamics 3, articulation 1 | 3 styleDefs | 1 | **2 parts** (Oboe, Bassoon); one hairpin with curvature+protraction |
| `comprehensive.mpm` | 3180 | tempo 3, dynamics 7, articulation 8 | 3 styleDefs | 3 | largest reference; tempo transition w/ `meanTempoAt="0.5"`; open-ended `transition.to="-"` |
| `dynamics.mpm` | 1239 | dynamics 7 | dynamicsStyles: 3 defs | 2 | `f→ff` + open-ended `ff→"-"`, both with curvature/protraction |
| `instruments.mpm` | 1379 | **global** tempo 1; **2 part-level** dynamicsMaps (2 total) | 2 styleDefs | 0 | **3 parts**; global-vs-part map split; third part has empty `<dated/>` |
| `keys_accidentals.mpm` | 569 | none | none | 0 | skeleton |
| `layers_beams.mpm` | 557 | none | none | 0 | skeleton |
| `multi_part.mpm` | 1828 | tempo 1, 2 dynamicsMaps (4), articulation 1 | 3 styleDefs | 1 | **2 parts**, per-part dynamics |
| `repeats_endings.mpm` | 566 | none | none | 0 | skeleton |
| `rests_meters.mpm` | 557 | none | none | 0 | skeleton |
| `simple_notes.mpm` | 552 | none | none | 0 | skeleton |
| `tempo_dynamics_spans.mpm` | 1702 | tempo 4, dynamics 5 | tempoStyles (2), dynamicsStyles (3) | 3 | **the canonical continuous-span fixture**; also the non-monotone-ms defect carrier (§7.5) |
| `tempo.mpm` | 991 | tempo 3 | tempoStyles: 3 defs | 0 | three discrete steps, no transitions |
| `ties_dots.mpm` | 548 | none | none | 0 | skeleton |
| `transposing_octave.mpm` | 671 | none | none | 0 | skeleton, **2 parts** |
| `tuplets.mpm` | 543 | none | none | 0 | byte-smallest of all 33 |

**`tests/integration/fixtures/all-maps-reference/` (8)** — built programmatically by Java
`GenerateAllMapsReference`, `<performance name="test performance">`, 1 part each.

| file | bytes | maps (instruction counts) | notes |
|---|---|---|---|
| `all_maps.mpm` | 2444 | tempo 2, dynamics 2, articulation 2, rubato 1, asynchrony 2, accentuationPattern 1, movement 1, imprecisionMap.timing + .dynamics (distribution.uniform 2) | **every map type in one file**; 7 `transition.to` (1 tempo `120→90`, 1 dynamics `80→110`, 1 movement, 4 `<accentuation>`); numeric levels; `xmlns=""` quirk on `<movementMap>`; zero `xml:id` |
| `asynchrony.mpm` | 490 | tempo 1, asynchrony 2 | offsets +50.0 / −30.0; no styles, no `xml:id` |
| `imprecision_dynamics.mpm` | 575 | tempo 1, dynamics 1, imprecisionMap.dynamics (gaussian) | σ=5.0, ±15, `seed="42"`; **nondeterministic — never byte-compared** |
| `imprecision_timing.mpm` | 482 | tempo 1, imprecisionMap.timing (uniform) | ±20, `seed="42"`; the one pair Java itself cannot reproduce bit-exactly |
| `metrical_accentuation.mpm` | 1146 | tempo 1, dynamics 1, accentuationPattern 1 | 4 `<accentuation>` beats each with `transition.from/to`; `loop`+`stickToMeasures` true |
| `movement.mpm` | 694 | tempo 1, movement 2 | **pedal/CC fixture**; `controller="sustain"`, 1.0→0.0 and 0.0→1.0, `curvature="0.4"` |
| `ornamentation.mpm` | 1386 | tempo 1, dynamics 1, ornament 4 | **MPM v2 ornamentation**; 3 ornamentDef; `temporalSpread` with `time.unit="milliseconds"`, `noteoff.shift="true"` |
| `rubato.mpm` | 469 | tempo 1, rubato 1 | `frameLength="2880.0" intensity="0.5" lateStart="0.0" earlyEnd="1.0" loop="true"` |

**`tests/integration/fixtures-v3/` (9)** — hand-authored MPM **v3** ornamentation; all have
tempo 1 + dynamics 1 + ornamentationMap + 1 ornamentationStyles styleDef.

| file | bytes | ornaments/defs | notes |
|---|---|---|---|
| `atend-ms.mpm` | 2076 | 1 / `spreadMsEnd` `alignment="at end"` | `frame.offset="-30.0ms" frameLength="60.0ms"` |
| `diatonic-key.mpm` | 1926 | 1 / `diatonicTurn` | `interval.diatonic` vs MSM key sig; `frameLength="50%"`, `noteoff.shift="monophonic"` |
| `legacy-timeunit.mpm` | 3740 | 3 / 3 defs | **largest of all 33**; suffix-less v3 values, the `frame.start` alias, legacy `time.unit` |
| `multi-ornament.mpm` | 2309 | 2 / `front`+`back` | two ornaments on one principal; 100% and 50% frames |
| `spread-ms.mpm` | 2099 | 1 / `spreadMs` | ms frame into the unchanged v2 marker engine; 1 `transition.to` is a `dynamicsGradient` |
| `trill-repetitions.mpm` | 1614 | 1 / `trill` | repeat group `\|: #n1 #P :\|` `repetitions="3"`; mixed `360ticks` + `50%` |
| `turn-atend.mpm` | 1603 | 1 / `turn` `at end` | figure-2 turn |
| `turn-atstart.mpm` | 1711 | 1 / `turn` `at start` | figure-1 turn, `%` frame |
| `v2-passthrough.mpm` | 1712 | 2 / `arpeggio` | **a v2 document on the v2 path through the v3 build** |

**Flagged lists.**
(a) **More than one `<performance>`: NONE** — `ornamentation-v3.test.ts:93` even asserts
`expect(performances).toHaveLength(1)`.
(b) Tempo/dynamics transitions — 6: `comprehensive`, `tempo_dynamics_spans`, `dynamics`,
`composite_advanced`, `multi_part`, `all_maps`. (A bare `grep transition.to=` also matches
`metrical_accentuation`, `movement`, `ornamentation`, `spread-ms`, `v2-passthrough`, but
those are `<accentuation>`, `<movement>` and `<dynamicsGradient>` attributes.)
(c) Rubato — 2: `rubato.mpm`, `all_maps.mpm`.
(d) Ornaments — 10: `ornamentation.mpm` and all 9 of `fixtures-v3/`. **Zero in
`fixtures/reference/`**, asserted deliberately at `mei-ornament-expansion.test.ts:423`.
(e) Imprecision — 3: `imprecision_timing`, `imprecision_dynamics`, `all_maps`. **No fixture
uses `distribution.triangular`, `.list`, `.correlated.*` or `<measurement>`.**
(f) Metrical accentuation — 2: `metrical_accentuation`, `all_maps`.
(g) Movement/pedal — 2: `movement`, `all_maps`.

**Ground truth.** `all-maps-reference/` additionally carries 8 `_augmented.msm`, 8
`_raw.mid`, 8 `_expressive.mid`. `fixtures-v3/` has **none** — deliberate, because Java does
not implement MPM v3. Regeneration commands are **not in the repo**;
`CHARTER.md:230-231` points to the memory file
`~/.claude/projects/-Users-nielspfeffer-Projects-meico-ts/memory/meico-ts-proof-harness.md`
(`GenerateReference`, `GeneratePerformanceReference`, `GenerateAllMapsReference`, plus the
classpath-shadowing gotcha). Fixtures are immutable (`README.md:396`); fork HEAD
`meico@1d662105` (`PARITY.md:327`).

### 5.4 Existing two-document comparison: none

No fixture and no test compares two MPM documents or asserts across two performances of one
document. The closest existing shapes are the byte-equivalence suites
(`full-xml-equivalence.test.ts`, `all-maps-equivalence.test.ts`,
`midi-byte-equivalence.test.ts`), which compare *one* produced document against a *Java*
reference — a one-sided identity check, not a distance. **The comparison campaign starts
from zero here, and will need to author its own multi-performance fixtures** (§9).

---

## 6. Real MPM corpora **[all measured]**

454 `.mpm` files exist on this machine outside the two meico-ts checkouts. Four corpora
matter.

### 6.1 Inventory

| corpus | files | size (min/median/max) | provenance |
|---|---|---|---|
| `/Users/nielspfeffer/Downloads/Daten` | 121 | 0.1 / 7.0 / 207.6 KB (2.94 MB) | **"Measuring Early Records" project** — metadata says *"generated using the MPM interpolation tool"*. Filenames include `Hofmann (1927).mpm` (Josef Hofmann piano roll), `unknown performance(N).mpm`, `export(N).mpm`. Historical-recording transcriptions. |
| `/Users/nielspfeffer/Downloads/Projekte_und_Sammlungen` | 43 | 0.1 / 108.1 / 121.1 KB (3.92 MB) | `export(N).mpm` siblings of the above; the **largest documents** in the whole survey |
| `/Users/nielspfeffer/Projects/MPM/sample encodings` | 6 | 0.6 / 30.5 / 47.0 KB | **the official MPM format sample corpus** — hand-authored interpretations |
| `/Users/nielspfeffer/Projects/mpmify/ml/data/debug_v4` + `debug_v4_exact` | 100 + 100 | 3.0 / 5.8 / 9.1 KB | **algorithmically inferred** performances, mpmify ML training/debug output |

Map usage, by number of files containing the map:

| corpus | tempo | dynamics | articulation | rubato | asynchrony | ornament. | metr.acc. | movement |
|---|---|---|---|---|---|---|---|---|
| Daten (121) | 114 | 110 | 104 | 34 | 28 | **89** | 9 | 10 |
| Projekte (43) | 41 | 40 | 33 | 40 | – | **42** | 40 | 38 |
| MPM samples (6) | 5 | 5 | 5 | 4 | 3 | – | 2 | – |
| mpmify v4 (100) | 100 | 100 | 100 | 59 | 100 | – | – | 100 |

One `gestureMap` + `gestureStyles` occurs in a single Daten file — **a map type not in
`names.ts`**, which parses as a plain `GenericMap` (§1.1). Comparison must not choke on it.

### 6.2 The decisive statistic — transitions and curves are the norm, not the exception

Quote-agnostic attribute presence, by number of files:

| attribute | Daten (121) | Projekte (43) | MPM samples (6) | mpmify v4 (100) |
|---|---|---|---|---|
| `transition.to` | **95** | **42** | 5 | **100** |
| `meanTempoAt` | 74 | 41 | 5 | 95 |
| `curvature` | 17 | **40** | 5 | **100** |
| `protraction` | 42 | **40** | 5 | **100** |
| `frameLength` | 97 | 42 | 4 | 59 |
| `intensity` | 33 | 41 | 4 | 59 |
| `lateStart` / `earlyEnd` | 13 / 12 | 38 / – | 2 / 2 | 59 / 59 |
| `relativeDuration` | 89 | 33 | 5 | 100 |
| `scale` (ornament) | 88 | 42 | 2 | – |
| `frame.start` | 84 | 42 | – | – |
| `frame.offset` (v3) | **0** | 0 | 0 | 0 |
| `note.order` | 87 | 42 | – | – |
| `milliseconds.offset` | 14 | – | 3 | 100 |
| `position` (movement) | 10 | 38 | – | 100 |
| `xml:id` | 102 | 42 | 2 | **0** |

Three conclusions.

1. **A step-function model of performance is wrong for this corpus.** 79%, 98% and 100% of
   the three big corpora use `transition.to`. Curve evaluation (§3) is a core requirement,
   not an enhancement.
2. **v3 ornamentation has zero real-world adoption** — `frame.offset` occurs in **0 of 454**
   files. v2 `frame.start` is universal where ornamentation appears at all. The v3 support
   in `temporalValue.ts` is worth reusing for correctness but should not drive priorities.
3. **`xml:id` is common but not universal, and absent from an entire corpus** (0/100 in
   mpmify). Instruction identity must be positional/date-based, never id-based — which is
   exactly what `SiteRef` already decided (`siteRef.ts:11-17`).

ppq: 720 dominates (279 occurrences) with 480 appearing 4 times in Daten and in 2 of the 6
official samples. Only 1 of 121 Daten files omits `pulsesPerQuarter` entirely.

### 6.3 Multi-performance documents — where they actually are

| file | performances | names |
|---|---|---|
| `MPM/sample encodings/Georg P. Telemann - Grave - TWV 51-D7/Telemann - Grave.mpm` | **3** | Baroque, Fast, Romantic |
| `MPM/sample encodings/Melchior Vulpius - Die helle Sonn/Die helle Sonn.mpm` | **3** | Baroque, Romantic, Amateur |
| `MPM/sample encodings/Heinrich Albert - Du mein einzig Licht/Albert - Du mein einzig Licht.mpm` | **2** | Axel Berndt, Like a robot |
| everything else (Daten 120/121, Projekte 43/43, mpmify 200/200, all 33 fixtures) | 1 | |

These three files are the only ground-truth multi-performance documents available, and they
are **exactly the intended use case**: the same piece interpreted in named contrasting
styles. They are the natural source for the campaign's fixtures. Telemann's three
performances carry 21 `<tempo>`, 60 `<dynamics>`, 171 `<articulation>`, 39 `<rubato>`, 4
`<asynchrony>`, 33 `<accentuationPattern>` and 19 `<style>` switches between them.

**Caveat (§8.3): three of the six official samples, including Telemann and Vulpius, carry a
UTF-8 BOM that this port's `Builder` refuses outright.**

### 6.4 Prior art: mpmify's evaluation pipeline

mpmify is TypeScript for its transformer library (`src/`, depends on `mpm-ts` as
`file:../mpm-ts`) with a **Python** ML/analysis stack under `ml/`. Its evaluation entry
point is `/Users/nielspfeffer/Projects/mpmify/ml/python/evaluate.py` (389 lines), header:

> Evaluation: curve-space + render-space metrics, vs a constant-tempo baseline.
> - curve RMSE: log2 BPM sampled every 90 ticks, predicted vs ground-truth map
> - render RMSE: per-note onset error (ms) when re-rendering the predicted map with the exact
>   meico math, after aligning at t=0
> - baseline: single constant tempo that maps total beats to total performed seconds

Its four metrics:

- `curve_rmse(map_a, map_b, total_ticks, step=90)` — `sqrt(mean((log2 bpm_a(t) − log2
  bpm_b(t))²))` on a uniform tick grid. **This is independent corroboration of the log-space
  plan, arrived at without reference to the expression registry**, and it uses no center —
  bare `log2`, consistent with §2.2 point 2.
- `render_rmse(pred_map, rec)` — RMS onset error in ms against actual performed onsets.
- `boundary_prf(pred_map, gt_map, tol_ticks=PPQ)` — precision/recall/F1 of instruction
  boundaries under greedy nearest matching within ±1 quarter. **This is an alignment metric
  and is directly relevant to U2/U3's edit path.**
- `constant_baseline(rec)` — a single constant tempo fitted to total beats / total seconds,
  used as the null model every metric is reported against.

Also present: `ml/analysis/identifiability.py` (883 lines), `ml/analysis/mdl.py`,
`ml/analysis/vienna_ceiling.py` (822 lines), `ml/python/perf_chain.py` /
`perf_chain_v4.py`, `ml/python/tempo_math.py`, `rubato_math.py`, `movement_math.py`.

Two things worth taking from this. First, **mpmify had to reimplement meico's curve math in
Python** (`tempo_math.TempoTimeline`, `PerfChain`) to evaluate at all; a TS comparison module
inside meico-ts gets the real implementation for free — a genuine advantage to preserve.
Second, mpmify's framing is **inferred-vs-truth (asymmetric, one map is "predicted")**,
whereas this campaign's U1/U4 is **symmetric performance-vs-performance**. The metrics
transfer but the framing does not; a symmetric metric must not inherit `boundary_prf`'s
precision/recall asymmetry uncritically. Nothing in mpmify needs to be superseded — it lives
in a different repo and a different language — but `curve_rmse`'s exact definition is worth
being *compatible* with, so results can be cross-checked.

---

## 7. Constraints inventory

### 7.1 TypeScript

`tsconfig.json:2-19`: `target`/`module` **ES2022**, `moduleResolution: "bundler"`,
`lib: ["ES2022","DOM"]`, `strict: true`, `declaration`+`declarationMap`+`sourceMap`,
`skipLibCheck`, `forceConsistentCasingInFileNames`, `resolveJsonModule`.
**`strict: true` is the only strictness flag** — no `noUncheckedIndexedAccess`, no
`exactOptionalPropertyTypes`, no `noImplicitOverride`, no `noUnusedLocals`.
**`verbatimModuleSyntax` and `isolatedModules` are both OFF.** Imports use `.js` specifiers
naming `.ts` files. `tsconfig.tests.json` is a `noEmit` project covering `src/**`,
`tests/**` and `vitest.config.ts`, run as `typecheck:tests` inside `verify`.

### 7.2 ESLint — the layer zone is a required work item

`import/no-cycle` (`eslint.config.js:229`):
```js
'import/no-cycle': ['error', { maxDepth: Infinity, ignoreExternal: true }],
```
scoped to `src/**/*.ts` (`:202`), with resolver settings (`:204-218`) whose failure mode is
a **silent pass** (`:205-213`).

Layer zones are generated from a `LAYER_ZONES` table (`:40-101`) into
`@typescript-eslint/no-restricted-imports` (`:233-241`). Six zones exist: `leaves`, `midi`,
`msm`, `mpm`, `mei`, `expression`. The `expression` zone (`:79-100`) is the model:

```js
forbidden: [
  '**/midi/**', '**/msm/**', '**/mei/**', '**/musicxml/**', '**/mpm/**',
  '!**/mpm/names.js',
],
```

> **There is no zone for `src/api/**` and none for `src/comparison/**`.** A new interior
> module must add its own entry **and** add `'**/comparison/**'` to the `forbidden` list of
> every renderer zone below it — the config says so itself at `:35-38`: *"Fencing only the
> downward direction would leave the new layer half-enforced."*

This is the decision point for §3.2's `bezier.ts` reuse: importing
`src/mpm/elements/maps/data/bezier.ts` from `src/comparison/**` requires the new zone to
carve out that path the way `expression` carves out `names.js` — a one-line negation, with
the justification that `bezier.ts` imports nothing (`bezier.ts:1-16`) and so cannot drag the
mutating parse path in behind it. **Recommend making that carve-out explicitly and
narrowly**, rather than transliterating a fourth copy of the Bézier math.

Other rules: `eqeqeq: ['error','always',{null:'ignore'}]` (`:123`),
`@typescript-eslint/explicit-module-boundary-types: 'error'` (`:127` — every exported
function must annotate its return type), `prefer-template`, `prefer-for-of`, `no-var`,
`prefer-const`. Type-aware block for `src/**/*.ts` only (`:178-197`): `prefer-readonly`,
`no-unnecessary-condition`, `no-unnecessary-type-assertion`, `no-param-reassign: error`.
Presets: `js.configs.recommended` → `tseslint.configs.strict` → `stylistic` → `prettier`
(`:113-115,243`). Ignores `dist/**`, `coverage/**`, `node_modules/**`,
`tests/integration/fixtures/**` (`:104-110`).

**Not configured:** `import/extensions`, `complexity`, `max-lines`, `naming-convention`,
`no-undefined`. RULE N4 has **no lint enforcement** — it is review plus the grep the rule
itself specifies.

### 7.3 Determinism and zero-dependency

RULE R2 (`expression/DESIGN.md:174-178`) — no RNG in the transform; a given input always
yields the same bytes. Render determinism is explicitly *not* claimed because
`shakePolyphonicPart` uses a bare `Math.random()`. RULE F7 (`ARCHITECTURE.md:557-559`) — a
`seed` in the MPM always wins; `options.seed` only supplies one where the MPM has none.
Campaign G4 (`comparison/CAMPAIGN.md:41`) forbids new runtime dependencies without a
journaled rationale; the three existing ones are all XML-layer.

**Comparison is inherently deterministic** (it writes nothing and reads no RNG), so R2 is
free — *unless* W4's clustering/embedding introduces k-means or t-SNE/UMAP, which are
randomly initialized. Any such algorithm needs an explicit, documented seed parameter and a
determinism test of the shape `ARCHITECTURE.md:561-577` mandates.

### 7.4 Lint status at HEAD — **still failing, by policy** **[measured]**

`npm run lint` exits 1 with **1048 problems (1046 errors, 2 warnings)** across 83 files.
By rule: `no-non-null-assertion` 836, `no-unnecessary-condition` 56, `no-empty-function` 55,
`no-unused-vars` 42, `unified-signatures` 34, `no-explicit-any` 12, `no-undef` 9,
`no-param-reassign` 2, `no-unsafe-function-type` 2.
By area: `src/mei/**` 557, `src/mpm/**` 227, `src/msm/**` 127, `src/midi/**` 22,
`src/xml/**` 13, `src/index.ts` 1, `tests/**` 89, `ornamentation/tools/*.mjs` 12.

**`src/api/**`, `src/expression/**`, `src/music/**`, `src/supplementary/**`, `src/units.ts`
and `src/version.ts` have ZERO problems** — every file the two recent campaigns added is
clean.

The governing policy is `refactor/lint-debt.md:48-50`:
> **`npm run lint` is not part of `npm run verify`** and must not be added to it until this
> debt is near zero — a red gate that everyone learns to ignore is worse than no gate.

`npx tsc --noEmit -p tsconfig.json` **passes with zero diagnostics** **[measured]**.

**Practical constraint: the new module must land at zero lint problems of its own; it cannot
be gated on the repo-wide count.**

### 7.5 The two pre-existing defects

**(a) Seeded correlated imprecision renders NaN.** `expression/LOG.md:596-601`:
> **Seeded correlated imprecision renders NaN.** A `@seed` on a `distribution.correlated.*`
> renders NaN for every affected note (`src/mpm/elements/maps/ImprecisionMap.ts:352`, where a
> declared seed is set on the provider; SURVEY.md:3646-3657). Out of scope by D-F, and the
> reason no fixture here builds on seeded correlated distributions.

Line 352 is `if (dd.seed !== null) random.setSeed(dd.seed);` inside the per-distribution
setup (`ImprecisionMap.ts:349-355`) — reseeding a correlated provider after construction
discards the state its first value depends on. Also recorded at `expression/DESIGN.md:1495-1497`:
*"Do not build fixtures on seeded `distribution.correlated.*`."*
**Comparison impact: low** — no corpus file and no fixture uses `distribution.correlated.*`
(§5.3(e), §6.2). Comparison reads distribution *parameters* and never samples, so it is
unaffected.

**(b) Non-monotone millisecond map.** `expression/LOG.md:602-604`:
> **`tempo_dynamics_spans.mpm` renders a non-monotone millisecond map under ANY tempo
> change**, because its `beatLength`-less `<tempo>` is skipped by the renderer. Reproduced
> with the expression engine uninvolved.

Confirmed structurally: its third `<tempo date="8640.0" bpm="Adagio">` carries **no
`beatLength`** **[measured]**, and `getTempoDataOf` returns null without it
(`TempoMap.ts:120-121`), so the renderer skips the instruction entirely.
**Comparison impact: real.** A skipped instruction is invisible to `getTempoAt` but *visible*
in the document. A comparison module reading the document sees four tempo instructions; one
evaluating the curve sees three. Both readings are defensible and they disagree — the module
must pick one, state it, and report the skip.

(c) A third item in the same list, `expression/LOG.md:605-613`, is the lint status of §7.4.

---

## 8. Version and format coverage

### 8.1 There is no version marker in MPM

`temporalValue.ts:170-172`: *"MPM documents carry no version marker at all (same namespace,
no `@version`), so the generation is inferred from two structural markers."* Detection is
**per `<temporalSpread>` element, not per document** (`detectFrameFormat`,
`temporalValue.ts:187-194`): `@frame.offset` present ⇒ v3; any unit suffix (`ms`/`%`/`ticks`)
on `@frame.start` or `@frameLength` ⇒ v3; otherwise v2. `@alignment` is v3-only but
deliberately **not** a marker (`:183-185`). A single performance may hold a v2 and a v3
spread side by side, each keeping its own reading (`:178-180`).

### 8.2 v2 vs v3 differences that matter

| | v2 | v3 |
|---|---|---|
| frame offset | `frame.start`, bare double | `frame.offset` (alias `frame.start` still read), unit-suffixed |
| frame length | `frameLength`, bare double, absent default 0.0 | `frameLength`, unit-suffixed, absent default **100% of the principal note** |
| unit | one `@time.unit` for the element | per value (`ms` / `%` / `ticks`); suffix-less falls back to a sibling `@time.unit`, then ticks (`resolveTemporalDomain`, `temporalValue.ts:152-162`) |
| alignment | – | `@alignment` = `at start` / `at end` |
| note generation | markers only | note-generating ornaments (turns, trills, repeat groups) |
| `dynamicsGradient` | unchanged between generations — `registry.ts:565-569` records that v3 *"replaces"* it in the spec but the code has no v3 branch at all | same |
| `intensity` | unchanged; parsed with the same `parseFloat` outside the v2/v3 branch, so it never carries a suffix (`registry.ts:550-553`) | same |

The v3 number grammar is narrower than `parseFloat`: no leading-dot, no exponent, no `+`,
no `Infinity`/`NaN`, no surrounding whitespace (`temporalValue.ts:69-83`). That gap is why
generation must be decided *before* a value is read: `parseFloat("80%")` is `80`, so a v3
value read on the v2 path scales and re-serializes as `"120"`, silently deleting the unit
(`:74-78`).

**Real-world weight: zero.** `frame.offset` occurs in 0 of 454 corpus files (§6.2). v3
exists only in the 9 hand-authored `fixtures-v3/` documents.

### 8.3 Format quirks a comparison module must tolerate

1. **UTF-8 BOM — a hard parse failure. [measured]** 3 of the 6 official MPM sample encodings
   begin `ef bb bf` before `<?xml`. `Builder.build` throws:
   `ParseError: processing instruction at position 1 is an xml declaration which is only at
   the start of the document`. This blocks **both** genuine 3-performance documents. 0 of
   the other 264 corpus files are affected. Stripping a leading `﻿` makes them parse and
   evaluate correctly. **This is the single highest-value robustness fix available**, and it
   belongs at the facade's parse guard (`src/api/parse.ts`), not in the comparison module —
   it would fix `convertMeiToMsmMpm`/`performMsm` for the same files.
2. **Single-quoted attributes — 97 of 121 Daten files. [measured]** `<mpm xmlns='...'>`,
   `date='0.0'`. XML-legal and xmldom-transparent; harmless to the parse path, but fatal to
   any regex/grep-based reasoning (it invalidated this survey's own first census, §6.2) and
   it means a serialized round trip is never byte-equal to the input for those files.
   `canonicalBaseline` (`mpmDocument.ts:78-80`) already handles this correctly by comparing
   against `serialize(parse(t))`, never against the input.
3. **Missing `xml:id` — common and sometimes total.** 19/121 Daten, 4/6 official samples and
   **100/100 mpmify** files lack ids entirely; 7 of 16 reference fixtures too
   (`siteRef.ts:11-17`). Instruction identity must be `(container, documentIndex)` and/or
   `@date`, never an id.
4. **Malformed/unparseable `@date`.** Nothing validates it. `parseFloat` yields `NaN`, and
   `GenericMap.parseData`'s insertion loop puts a NaN-dated child at the **front**, where a
   comparator sort would leave it anywhere (`datedView.ts:17-27`). `datedView.orderedEntries`
   reproduces this exactly (`:61-79`) and comparison must use it rather than a sort.
5. **Java double literals.** Defs parse `@value` through `parseJavaDouble`, which **throws**
   on anything Java's `Double.parseDouble` rejects, and the factory turns that into a dropped
   def (`styleScope.ts:127-136`). Java's grammar accepts the literals `NaN` and `Infinity`,
   so `value="NaN"` yields a def the index holds with a NaN value (`:133-136`). Instruction
   attributes, by contrast, use bare `parseFloat`, so `bpm="120bpm"` renders as 120
   (`styleScope.ts:19-23`). **The two paths have different leniency and comparison must
   preserve the difference.** Spelling differences like `"1.0"` vs `"1"` are numerically
   equal but byte-different — relevant only if a byte-level edit script is produced.
6. **Named vs numeric levels.** `<tempoDef name="120" value="60"/>` makes `bpm="120"` render
   as **60** — the def wins over the numeral it looks like (`styleScope.ts:21-23`). MEI's
   `'+'`, `'-'` and `'?'` placeholders are unresolvable and land in the 100.0 fallback
   (`:26-30`). The official corpus writes named levels; mpmify writes numeric ones.
7. **Unknown map types.** A `gestureMap` exists in the wild (§6.1) and parses as a plain
   `GenericMap`. Comparison should report unknown maps rather than dropping or failing.
8. **`xmlns=""` on `<movementMap>`** with the namespace re-declared on each `<movement>`
   occurs in two fixtures (§5.3). Namespace-naive element matching would miss it.

---

## 9. Design constraints and reuse plan

### 9.1 Reuse verbatim (no new code)

| need | use |
|---|---|
| parse / serialize / canonical baseline | `expression/mpmDocument.ts` — the D-A raw-`Builder` discipline |
| enumerate performances, parts, maps, style collections | `expression/mpmTree.ts` — `readPerformances` already returns all performances in document order |
| renderer-faithful instruction ordering + positional style scope | `expression/datedView.ts` |
| resolve a level string honestly (`def` / `literal` / `unresolvable`) | `expression/styleScope.ts` — **prefer over the renderer's 100.0 default** |
| plain-data instruction locator | `expression/siteRef.ts` |
| v3 unit-suffixed values, per-element generation detection | `expression/temporalValue.ts` |
| optional MSM side input | `expression/msmFacts.ts` |
| attribute reads | `expression/attributes.ts` |
| cubic-Bézier curve shape | `src/mpm/elements/maps/data/bezier.ts` — import-free leaf; needs a narrow eslint carve-out (§7.2) |

### 9.2 Wrap (adapt existing code behind a new interface)

- **Per-attribute scale spaces.** Take `registry.ts`'s `(element, attribute) → RowSpace`
  assignment and each row's `valueDomain` predicate; add a new forward-only `T(x)` per
  `ScaleSpace` (`transforms.ts` exposes only the composed `T⁻¹(s·T(x))`). Collapse
  `log-around-center` to `log-around-1` for distance purposes — the center cancels in a
  difference, which removes the asymmetry of §2.2 point 2 and matches mpmify's bare `log2`.
- **Tempo evaluation.** Either transliterate `getTempoAtStatic` (`TempoMap.ts:213-223`) +
  the exponent (`:177-179`) + the three constant-collapse normalizations (`:137-158`), or
  construct a `TempoMap` on a `copy()` with wired headers. **Transliterate the shape math;
  reuse the real class only for `computeMillisecondsForTempoTransition`'s Simpson
  integration** (`:392-409`), whose comment forbids restructuring.
- **Rubato warp.** Must be transliterated — `computeRubatoTransformation` is private
  (`RubatoMap.ts:166-173`).
- **Report accumulation.** `expression/report.ts`'s `DimensionAccumulator` / `ReportSink`
  (`:258`, `:453`) are the right shape for per-dimension comparison accumulation.

### 9.3 Build fresh

- **Everything keyed on `@date`** — the registry has no row for it, and it is the axis U2's
  edit path and U3's ranked deviations run along.
- **Instruction alignment / matching** between two maps. mpmify's `boundary_prf` (greedy
  nearest within ±1 quarter) is the prior art; a symmetric edit distance needs a proper
  alignment (the algorithm survey's territory).
- **Dimensions the registry excludes but comparison needs**: `rubato@frameLength`,
  `accentuationPatternDef@length`, `accentuation@beat/@value/@transition.*`,
  `movement@position/@transition.to`, `ornament@repetitions`, pool-note intervals,
  `distribution.*@seed`/`@degreeOfCorrelation`, the whole `imprecisionMap.tuning` domain, and
  every enum/structural attribute (§1.7).
- **Cross-performance normalization**: differing ppq (§1.4), differing total length, and the
  part-identity question (a global map in A vs a part-local map in B — §1.6's wholesale
  replacement means these are not comparable instruction-for-instruction).
- **Multi-performance fixtures.** None exist in-repo (§5.3(a)). Derive them from the three
  official sample encodings (§6.3), BOM-stripped.

### 9.4 Hard constraints, as a checklist

1. Interior at `src/comparison/`; facade at `src/api/comparison.ts`, re-exported from
   `src/api/index.ts` (`export * from './comparison.js';`) **and member-by-member** from
   `src/index.ts` (never `export *` — `src/index.ts:46-52`).
2. Add a `LAYER_ZONES` entry for `src/comparison/**` in `eslint.config.js`, **and** add
   `'**/comparison/**'` to every renderer zone's `forbidden` list (`eslint.config.js:35-38`).
   If `bezier.ts` is imported, carve it out narrowly the way `expression` carves out
   `names.js`.
3. **Add `'src/comparison/**/*.ts'` to `vitest.config.ts`'s coverage `include`** — it is a
   curated list, not a glob over `src/**`.
4. Text in, text out (F2); `getRootElement().toXML()` if any document is returned (F2a);
   parse through `src/api/parse.ts`'s `requireXmlText` + `parseOrThrow`.
5. **Named-parameter object at the entry point (F5)** — `compareMpm({ a, b })` or
   `{ performances: [...] }`, never positional MPM strings.
6. Outputs: plain object literals, all fields `readonly`, arrays `readonly T[]`, absence
   `| null`, **no `undefined`** (N4), no `Map`/`Set`/class instances/XomTypes, freshly
   allocated, interior arrays copied out.
7. Errors: new classes `extends MeicoError` (imported from `../xml/errors.js`), empty
   bodies, messages prefixed `` `${kind}: …` ``, interior throws wrapped with `{ cause }`.
8. Never `new Mpm(text)`; never construct MPM classes on the caller's tree — only on
   `copy()` (§3.4). Never mutate the input.
9. Annotate every exported return type (`explicit-module-boundary-types`); `.js` import
   specifiers; `== null` for absence (N5); zero new lint problems; `npm run verify` green.
10. If W4 introduces a randomly-initialized algorithm, it needs an explicit seed and a
    determinism test (`ARCHITECTURE.md:561-577`).

### 9.5 Recommended early work items, in priority order

1. **BOM tolerance in `src/api/parse.ts`.** Unblocks the only real multi-performance corpus
   and fixes the existing pipeline for the same files. Small, isolated, independently
   valuable.
2. **Forward scale-space module** `T(x)` per `ScaleSpace`, with the center collapsed.
3. **A sampled-curve reader** (tempo, dynamics, movement) with an explicit, documented answer
   to §3.5's boundary question — and note that `TempoMap` and `DynamicsMap` currently
   *disagree* on inclusive-vs-strict.
4. **Multi-performance fixtures** derived from the official samples.
5. Only then the alignment/edit-distance work, which is the algorithm survey's domain.

### 9.6 Where this survey contradicts the presumptive plan

Three places, all in §2.2 and §6.2, stated plainly for the conductor's adjudication:

- **The registry is not a sufficient metric foundation.** It is a licence-to-write list that
  excludes `@date` — the comparison module's primary axis — plus roughly twenty further
  numeric attributes and the entire `imprecisionMap.tuning` domain. Reuse the scale-space
  *assignment*, not the row *set*.
- **`log-around-center` must be collapsed to `log-around-1` for distance.** The registry's
  center is a per-document quantity, so `|T_A(x) − T_B(y)|` with per-document centers is not
  symmetric. In a difference the center cancels; taking the bare log ratio is both correct
  and independently corroborated by mpmify's `curve_rmse`.
- **The "compare instructions" framing is wrong for this corpus.** With `transition.to` in
  79–100% of real files and `curvature`/`protraction` in up to 100%, a performance is a set
  of *curves*, not a set of steps. The primary comparison object should be the sampled
  curve; instruction-level alignment is the secondary, edit-path product.

The presumption that survives intact is the D-A reading discipline: the expression module's
document layer is exactly right for comparison, and §3 confirms it can be extended to curve
evaluation without violating anything it stands for.
