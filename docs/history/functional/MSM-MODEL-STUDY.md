# Milestone 6 — is the MSM model reachable, and what does it cost?

A read-only feasibility study. Nothing under `src/` or `tests/` was modified. Every number below
was measured on `functional-core` at `10e9f58`; the two negative controls were run in the
scratchpad against transpiled copies of the suites' own comparison functions (method in §6).

---

## Recommendation, and the number that drives it

**The number: 0.** A tightened attribute-order and extra-attribute check on the two
performed-MSM equivalence suites is **green today** — zero mismatches in element sequence,
attribute names, or attribute order across all 24 performed-MSM fixtures (16 on the
MEI→convert→perform path, 8 on the all-maps path). Right now those suites do **not** check
either, and I proved it: reversing the attribute order on every `<note>` of a reference file,
and adding a bogus attribute to every `<note>`, both leave the suites' own comparators
**green**, while a one-unit value change goes red.

So the recommendation is in two parts:

1. **Commit 0 — close the oracle before touching the model.** Make
   `full-xml-equivalence.test.ts` and `all-maps-equivalence.test.ts` compare the attribute-name
   *sequence* per element, not just the attribute set, and fail on an attribute the reference
   does not have. Two test files, no `src/` change, measured green at zero cost. This is
   exactly the class of gap the campaign has already deleted three normalisers for, and it is
   the gap that sits precisely where a model refactor is most likely to break: the model's
   `serialize` decides attribute order, and today nothing on the performed path would notice
   if it decided differently.

2. **Commit 1 — the model's read path only, as one shared reader.** `src/msm/model.ts` with
   `parse : Element -> Validation<MsmDocument, ParseError[]>` and `serialize : MsmDocument ->
   Element`, with the round-trip law asserted as a property over **all 82** MSM fixtures in
   `tests/` (the existing round-trip suite reaches only 16 of them, and 13 of the other 66 would
   fail it today — §2). This is worth doing on its own terms because **three independent
   read-only MSM projections already exist in `src/`, totalling ~610 lines with three different
   and mutually incompatible absence policies** (§5).

**What I am recommending against:** adopting the model on the render path in this milestone.
The honest answer to question 3 is **(a), with (b) as a separate later milestone and (c) as the
accurate description of the whole thing**: `Performance.perform` cannot fold over immutable
records without a second rewrite of three specific algorithms that are built on `Attribute`
*object identity*, not on values (§3). Milestone 5's phantom-typed fold does not help here — it
declares stage *ordering*, and the problem is *ownership*.

---

## 1. What the MSM domain actually is

### 1.1 Element vocabulary, measured against the corpus

Census over all **82 `.msm` files under `tests/`** (element occurrences):

| element | occurrences | notes |
| --- | --- | --- |
| `note` | 1965 | the only element MIDI export renders |
| `header` / `dated` | 191 / 191 | one pair per `<global>` and per `<part>` |
| `timeSignatureMap` / `timeSignature` | 127 / 126 | |
| `keySignatureMap` / `keySignature` / `accidental` | 122 / 76 / 52 | `accidental` is a grandchild |
| `part` / `score` | 109 / 109 | |
| `msm` / `global` | 82 / 82 | |
| `sectionMap` / `section` | 74 / 74 | |
| `sequencingMap` / `goto` | 57 / 18 | 39 sequencingMaps are empty |
| `markerMap` / `marker` | 50 / 22 | |
| `phraseMap` / **`phrase`** | 50 / **0** | |
| `pedalMap` / **`pedal`** | 50 / **0** | |
| `miscMap` / `tupletSpanMap` / **`tupletSpan`** | 50 / 25 / **0** | scratch space, deleted by the converter |
| `rest` | 33 | never rendered to MIDI |
| `channelVolumeMap` / `volume` | 12 / 12 | created by the render |
| `programChangeMap` / `programChange` | 11 / 11 | in 3 files, all in `tests/comparison/fixtures` |
| `positionMap` / `position` | 2 / 17 | created by the render |
| `lyrics` | 207 | 1 file; nothing in `src/` reads it |

The container child order is fixed and *is* the serialised order — nothing sorts `<dated>`.
Global (`Msm.createMsm`, `Msm.ts:278-285`): `timeSignatureMap, keySignatureMap, markerMap,
sectionMap, phraseMap, sequencingMap, pedalMap, miscMap`. Part (`Msm.makePartFromString`,
`Msm.ts:483-492`): `timeSignatureMap, keySignatureMap, markerMap, sequencingMap, pedalMap,
phraseMap, miscMap(→tupletSpanMap), score`. The two orders differ, and both are Java's.

### 1.2 Which attributes are required, and which are not

This is where the corpus contradicts the reference fixtures, and it matters for the model.
Across all 1965 notes:

| attribute | notes carrying it | verdict |
| --- | --- | --- |
| `date`, `duration`, `midi.pitch`, `pitchname`, `accidentals` | 1965 / 1965 | required in practice |
| `octave` | 993 / 1965 | **optional** — absent from every note in the 4 `tests/comparison/fixtures` scores and both multi-instruction fixtures |
| `xml:id` | 1288 / 1965 | **optional** — `bach-bwv1007-minuet2`, `telemann-grave`, `vulpius-die-helle-sonn` carry none |
| `velocity` | 1130 / 1965 | present on *input* documents too, not only rendered ones |
| `date.end` | 0 on notes; 452 on `section` | notes carry `duration`, not `date.end` |

A model whose `Note` makes `octave` or `xml:id` required would reject three of the five
`tests/comparison/fixtures` scores. Those are real third-party MSMs and are the only
non-Java-generated MSM inputs in the tree.

`Msm.processScore` reads a note's `xml:id` and tolerates its absence — differently in each
branch (`'unknown'` in the expressive branch, `''` in the symbolic one, `Msm.ts:1328` and
`:1352`), which is Java's asymmetry and is pinned.

### 1.3 Written by one stage, read by another

The stage boundaries in MSM are attribute-shaped, not element-shaped:

| attribute | written by | read by |
| --- | --- | --- |
| `date`, `date.end`, `duration` | `Mei2MsmMpmConverter`; rewritten wholesale by `Msm.convertPPQ` | `GenericMap`'s entry key (`@date`), every render pass' span test, `Msm.exportMidi`, `Msm.getEndDate` |
| `date.perf`, `duration.perf`, `date.end.perf` | `Performance.addPerformanceTimingAttributes`, then rubato / articulation / ornamentation / tempo | rubato, articulation, ornamentation, tempo |
| `milliseconds.date`, `milliseconds.date.end` | tempo, then asynchrony / articulation-ms / ornamentation-ms / imprecision | `Msm.readMillisecondsDateFromElement` — the single read point of the whole expressive export |
| `velocity` | dynamics, then accentuation, articulation, ornamentation, imprecision-dynamics | `Msm.processScore`, `Msm.fitVelocities` |
| `modified` | seeded empty by `addModifiedAttributes`, appended to by `AsynchronyMap` and `ArticulationData` (`addToListAttribute`) | nothing in `src/` — bookkeeping for a human |
| `articulation.absoluteDelayMs` / `.absoluteDurationMs` / `.absoluteDurationChangeMs` | `ArticulationData`/`ArticulationDef` (symbolic half) | `ArticulationMap.renderArticulationToMap_millisecondModifiers`, which **deletes** them |
| `ornament.*` (7 v2 + 7 v3 names) | `TemporalSpread`, `DynamicsGradient`, `ornamentInstantiation` | `OrnamentationMap.renderAllNonmillisecondsModifiersToMap`, `Performance.renderMillisecondsModifiersToMap`, `api/pipeline.ts`'s reader |
| `tuning.offset`, `detuneCents`, `detuneHz` | imprecision-tuning, articulation | **nothing** — no reader anywhere in `src/`, and zero occurrences in any fixture |

### 1.4 Correlated nullable fields — where a sum type would be structural

Four, in decreasing order of payoff:

1. **`<score>` children are `note | rest`.** Every pass that cares writes
   `if (e.getLocalName() !== 'note') continue` — 8 sites across `DynamicsMap` (3),
   `Performance` (1), `ArticulationMap` (1), plus `getAllElementsOfType('note')` in
   `OrnamentationMap`. A `rest` has no `midi.pitch` and no `velocity`; a `note` always does.
   Today both are `Element`.

2. **The four render phases are a real sum, currently a phantom.** `Performance.ts:75-77`
   declares `type Phase = 'symbolic' | 'displaced' | 'milliseconds'` as a `declare const`
   phantom with no runtime existence. The corresponding data distinction is exact and
   observable: before `addPerformanceTimingAttributes` a note has none of `date.perf`,
   `duration.perf`, `date.end.perf`; after the tempo pass it has `milliseconds.date` and
   `milliseconds.date.end`. Reference `simple_notes_augmented.msm` shows the full set. A model
   would make `Note<'raw'>` / `Note<'symbolic'>` / `Note<'milliseconds'>` carry different
   fields instead of the same fields sometimes-null. **This is the single largest structural win
   available**, and it is also what makes the render rewrite hard (§3).

3. **`Goto` (`src/msm/Goto.ts`, 221 lines).** Seven mutable public fields, a throwing
   constructor, and three correlated ones: `targetDate` comes from `@target.date` *or* from the
   resolved `target` marker's `@date`; `targetId` may be empty; `target` may be unresolvable.
   The documented contract is "either a usable `target.date` or a resolvable `target.id`, else
   throw" — a two-armed sum written as three nullable fields plus an exception. 9 of `src/msm`'s
   112 non-null assertions are here.

4. **`XmlBase.data: Document | null` — the two-phase construction itself.** `new Msm()` yields
   an object with no document; `Msm.ts` then writes `getRootElement()!` **19 times** and guards
   with `isEmpty()` in 3 places (plus 1 in `AbstractMsm`). This is the "half-built object" the
   milestone description names.

For scale, `src/msm`'s 112 non-null assertions break down roughly as (textual classification,
±8 against the authoritative eslint count of 112):

| shape | count | killed by |
| --- | --- | --- |
| `getAttributeValue(…)!` | ~35 | typed records with required fields |
| `getFirstChildElement(…)!` | ~34 | a typed `msm → part → dated → score` spine |
| `getRootElement()!` | ~20 | a non-nullable root / `parse` returning `Validation` |
| `getAttribute(…)!` | ~8 | typed records |
| other | ~15 | mixed |

A full model kills roughly 90 of 112. A non-nullable root alone kills ~20.

---

## 2. Does the round-trip law hold for MSM today?

**At the XOM layer, yes — and better than the existing suite claims, but over a smaller
corpus than the tree contains.**

`tests/integration/xml-round-trip.test.ts` (193 tests) auto-discovers only
`fixtures/reference/*.{msm,mpm}` and `fixtures/mei/*.mei` — **48 fixtures, of which 16 are
MSM**. It pins two known losses: a dropped trailing newline, and `<x/>` normalised to `<x />`.

Measured, `Builder().build(text).toXML()` over every `.msm` file in `tests/`:

| corpus | files | exact | needs newline normaliser only | needs self-closing too | fails |
| --- | --- | --- | --- | --- | --- |
| `fixtures/{reference,performance-reference,all-maps-reference}` | 48 | 0 | **48** | 0 | 0 |
| all `.msm` under `tests/` | 82 | 0 | 64 | 5 | **13** |

So: **on the 48 Java-generated MSM fixtures the law holds exactly, modulo the trailing
newline. The self-closing normaliser is not needed by a single MSM fixture** — it exists only
for the hand-written MEI inputs, as that file's own comment says.

The 13 failures are all outside the round-trip suite's discovery, and all three causes are
serializer-level, not model-level:

- **10 files lose XML comments.** `Element.wrap` keeps only `nodeType` 1 and 3
  (`XomTypes.ts:481,486`); comments, PIs and CDATA are dropped. 9 of the 10 are
  `tests/integration/fixtures-v3/*.msm`, whose provenance header is a comment;
  `telemann-grave.msm` has a `<!-- Violin -->` inside a `programChangeMap`.
- **1 file loses a BOM** (`vulpius-die-helle-sonn.msm`).
- **2 files gain an XML declaration** they did not have
  (`fixtures-multi-instruction/*_augmented.msm`). `Document.toXML()` adds one; the byte-compared
  path uses `getRootElement().toXML()` (RULE F2a), which does not.

**Consequence for the model.** The serialize side is cheap *if* the model keeps an ordered
attribute list per element and an ordered child list — which is what `Element` already is. It is
not cheap if the model serialises records field-by-field in a declared order, because seven
distinct note attribute orders appear in the rendered corpus:

```
267  xml:id,date,midi.pitch,pitchname,accidentals,octave,duration,date.perf,duration.perf,modified,velocity,milliseconds.date,date.end.perf,milliseconds.date.end
 68  xml:id,date,midi.pitch,pitchname,accidentals,octave,duration
 48  xml:id,date,midi.pitch,pitchname,accidentals,duration,date.perf,…                     (no octave)
 16  xml:id,date,…,velocity,date.end.perf,milliseconds.date,milliseconds.date.end          (date.end.perf EARLIER)
  6  …,ornament.dynamics,ornament.date.offset,date.perf,…
  3  …,ornament.dynamics,ornament.milliseconds.date.offset,ornament.noteoff.shift,date.perf,…
  3  …,ornament.milliseconds.date.offset,date.perf,…
```

Row 4 occurs in exactly two files, `rubato_augmented.msm` and `all_maps_augmented.msm` — the two
with a rubatoMap. `RubatoMap.renderRubatoToMap` (`RubatoMap.ts:202`) adds `date.end.perf` when a
note has `duration.perf` but no end date, and rubato runs *before* tempo, so a note under a
rubato instruction gets `date.end.perf` earlier than one that does not. **The attribute order
encodes which passes touched the note.** That is verified against the data, not inferred.

Whether that matters is answered in §6: it matters for the converter's MSM output, which is
byte-gated, and today it does not matter for the performed MSM, which is not.

---

## 3. The mutation census — the crux

### 3.1 The passes

`Performance.perform` is a 4-stage document fold; stages 3 and 4 are themselves folds. Counted
as *renderer invocations against MSM elements*: **5 per document** (clone+convertPPQ, collect
global, distribute global ornamentation, global rubato+tempo interleaved over 6 maps, global
asynchrony+imprecision on the pedalMap) plus **21 per part**:

| # | stage | what it writes into |
| --- | --- | --- |
| 1 | `collectPartMaps` → `addPerformanceTimingAttributes` | every element of 8 maps |
| 2 | `collectPartMaps` → `addModifiedAttributes` | every element of 8 maps |
| 3 | `renderPartVoices` → dynamics | score notes; **creates** `<channelVolumeMap>` |
| 4 | `renderPartVoices` → movement | **creates** `<positionMap>` |
| 5 | `renderPartAccentuation` | score notes |
| 6 | `renderPartArticulation` (symbolic) | score notes; **`map.sort()`** |
| 7 | `renderPartRubato` | every element of the 8 collected maps |
| 8 | `renderPartOrnamentation` | score notes; **inserts new `<note>` elements** |
| 9 | `renderPartTiming` (tempo) | every element of the 8 collected maps |
| 10–22 | `renderPartMilliseconds` | 13 calls: asynchrony+imprecisionTiming on pedalMap; tempo+asynchrony on channelVolumeMap; tempo+asynchrony on positionMap; asynchrony, articulation-ms, ornamentation-ms and four imprecision maps on the score |

### 3.2 What it writes

**31 distinct attributes at ~110 write sites across 15 files (~5,700 lines).**

| attribute | onto | written by |
| --- | --- | --- |
| `date`, `date.end`, `duration` | every dated element in the document | `Msm.convertPPQ` (stage 1, XPath rewrite) |
| `date.perf` | every element of every collected map | `Performance.ts:442`; rewritten by `RubatoMap:188`, `ArticulationData:109`, `ArticulationDef:387`, `OrnamentationMap:607`; created on generated notes by `ornamentInstantiation:1056` |
| `duration.perf` | elements with `@duration` | `Performance.ts:447`; rewritten by `ArticulationData` ×3, `ArticulationDef` ×3, `OrnamentationMap:615/635`; created at `ornamentInstantiation:1057` |
| `date.end.perf` | elements with `@date.end` | `Performance.ts:450`, `RubatoMap:202/216`, `TempoMap:283`, `Performance.ts:1102`, `OrnamentationMap:621/622/629`, `ornamentInstantiation:1058` |
| `milliseconds.date` | every element of every collected map | `TempoMap:227/272`, `Performance.ts:1094`; rewritten by `AsynchronyMap:102`, `ArticulationMap:363`, `OrnamentationMap:701/722`, `Performance.ts:1158/1179`, `ImprecisionMap:806` |
| `milliseconds.date.end` | as above | `TempoMap:234/306`, `Performance.ts:1097/1103/1193`, `AsynchronyMap:117`, `ArticulationMap:364`, `OrnamentationMap:735/736/743`, `ImprecisionMap:807` |
| `velocity` | score notes | `DynamicsMap:236/257/263/299`, `Performance.ts:874`, `MetricalAccentuationMap:171`, `ArticulationData` ×3, `ArticulationDef` ×3, `OrnamentationMap:597`, `ImprecisionMap:807` |
| `modified` | every element of every collected map | `Performance.ts:457` (empty), then list-append at `AsynchronyMap:104/119` and `ArticulationData` ×11 |
| `articulation.absoluteDelayMs`, `.absoluteDurationMs`, `.absoluteDurationChangeMs` | score notes | `ArticulationData`, `ArticulationDef`; **removed** by `ArticulationMap:346/353/360` |
| `detuneCents`, `detuneHz` | score notes | `ArticulationData:199/203`, `ArticulationDef:412/413` |
| `tuning.offset` | score notes | `ImprecisionMap:644` (created), `:807` (written) |
| `ornament.dynamics` | score notes | `DynamicsGradient:59/63` |
| `ornament.date.offset`, `ornament.duration` | score notes | `TemporalSpread:444/445/461/465` (ticks domain) |
| `ornament.milliseconds.date.offset`, `ornament.milliseconds.duration` | score notes | `TemporalSpread` (ms domain) |
| `ornament.milliseconds.fromend.offset` | score notes | `ornamentInstantiation:906/907` |
| `ornament.noteoff.shift` | score notes | `TemporalSpread:452`, `ornamentInstantiation:910` |
| `ornament.generated`, `.ref`, `.source`, `.slot`, `.pass`, `.anchor`, `.carved` | generated / carved notes | `ornamentInstantiation:1060-1071`, `:1234/1238` |
| `midi.pitch` | generated notes | `ornamentInstantiation:1052` |

### 3.3 Structural mutation, not just attributes

Six kinds, all on the score or the part's `<dated>`:

1. `<channelVolumeMap>` appended to `<dated>` with generated `<volume>` children
   (`Performance.ts:880`).
2. `<positionMap>` appended to `<dated>` with generated `<position>` children
   (`Performance.ts:887`).
3. New `<note>` elements inserted into the score: `owner.addElement(note)`
   (`ornamentInstantiation.ts:672`).
4. `note.removeChildren()` on a copied principal (`ornamentInstantiation.ts:1044`).
5. Attribute removal: 3 `articulation.*Ms` markers, plus the `NOT_INHERITED` sweep on a copied
   principal (`ornamentInstantiation.ts:1047`).
6. `map.sort()` after articulation (`ArticulationMap.ts:311`) — an insertion sort over both the
   index and the XML.
7. `addUUID(note)` on every generated note — a UUID generator running mid-render.

### 3.4 The three algorithms that make (b) impossible today

The render does not just write attributes; **three algorithms hold `Attribute` objects as
handles and write to them later, after the elements have gone out of scope.** A record has no
such identity.

| where | handle | why it exists |
| --- | --- | --- |
| `RubatoMap.ts:172` | `pendingDurations: KeyValue<number, Attribute>[]` | a note's end may fall under a later rubato than its start |
| `TempoMap.ts:245` | `KeyValue<number, number>` (a map *index*) | benign — this one would port straight across |
| `ImprecisionMap.ts:542-543` | `pendingDurations` **and** `offsets: Map<number, KeyValue<number, Attribute>[]>` | the whole draw-shake-apply algorithm: every draw is parked against an attribute handle, the offsets are then mutated in place by `shakeOffsets` / `shakeTimingOffsets`, and only `addOffsetsToAttributes` (`:798`) writes anything |
| `Msm.ts:1627` | `KeyValue<number, Attribute>[]` over the whole document | `fitVelocities` → `computePartwiseCompression`, on the **MIDI export** path, not perform |

`ImprecisionMap.shakeTimingOffsets` is the worst case: at `:725` and `:738` it goes
`entry.getValue().getParent()` — **from an attribute handle back up to its owning element**, to
read that note's `midi.pitch` so that two voices on the same pitch keep the same offset. To
express that over records you need an explicit address (part → map → entry → attribute name),
i.e. a lens, which is a rewrite of the algorithm's data structure rather than a substitution.

### 3.5 The honest answer

**(a) — read path only, in this milestone.** The model can parse an MSM into records and the
existing readers can be unified onto it (§5). The render cannot fold over immutable records
without:

- rewriting `ImprecisionMap`'s offsets algorithm (821 lines, the file with the strictest
  randomness contract in the port — RULE F7 seeds are derived from a call ordinal, so any
  change to the number or order of draws is byte-visible in the MIDI);
- rewriting `RubatoMap`'s pending-durations pass;
- replacing `GenericMap`'s `elements: KeyValue<number, Element>[]` live index, which is the
  substrate all nine map classes are written against;
- giving `ornamentInstantiation` an insertion API over an immutable score;
- and giving `ArticulationMap` a sort that returns a new score.

That is a second rewrite of `perform`, in the same sense milestone 5 was the first. It should be
its own milestone with its own charter, and **milestone 5's `Phase` machinery does not reduce
its cost**: `At<S, P>` states which stage may run when, and the obstacle here is which value
owns what.

---

## 4. The test ripple

`tests/` is 66,507 lines and (per the brief) 6,122 tests.

### 4.1 Directly moving

| file | tests | lines | MSM-API sites | XOM-nav lines |
| --- | --- | --- | --- | --- |
| `tests/msm/Msm.test.ts` | 96 | 1195 | **204** | 174 |
| `tests/msm/MsmSequencing.test.ts` | 32 | 531 | 39 | 54 |
| `tests/msm/Goto.test.ts` | 33 | 338 | 0 | 13 |
| `tests/msm/AbstractMsm.test.ts` | 29 | 319 | 48 | 46 |
| `tests/msm/dateMap.test.ts` | 6 | 79 | 0 | 3 |
| `tests/midi/Midi.test.ts` | 74 | 1156 | 57 | 0 |
| `tests/mpm/elements/Performance.test.ts` | 54 | 843 | 59 | 80 |
| **total** | **324** | **4461** | **407** | **370** |

324 tests is **5.3 %** of the suite; 4,461 lines is **6.7 %** of `tests/`.

`tests/msm/` alone is 196 tests over 2,462 lines and would move essentially wholesale.
`tests/msm/Msm.test.ts` is the densest file in the repo for this: 204 MSM-API call sites in
1,195 lines, one every 5.9 lines.

### 4.2 Mechanical only (charter rule 3)

31 `new Msm(` call sites across 10 test files; `tests/integration/*.test.ts` change only for
imports and renamed calls. `tests/api/pipeline.test.ts` (49 tests, 842 lines) has **zero** direct
XOM navigation — it goes through the facade, so a model behind the facade is invisible to it.
Same for all 16 `tests/expression/*` files except 5 incidental lines.

### 4.3 Does the standing estimate hold?

**Partly, and less than for earlier milestones.** src side: `src/msm` is 2,360 lines; the render
path that reads MSM is ~5,700 more. Test side: 4,461 lines moving directly. So for the *read
path only* slice, the ratio is roughly 1 : 1.8 (src : tests) — the test side is the slower half,
but not by the margin the campaign's earlier milestones saw, because the facade (`tests/api/`,
891 lines, 64 tests) and the whole expression suite are already insulated from the
representation. If the render path were included, the src side would dominate.

---

## 5. The smallest valuable slice

### 5.1 The duplication that justifies it

**Three read-only MSM projections already exist in `src/`, each navigating
`part → dated → score → note` with its own private `noteElements` helper:**

| module | type | lines | absence policy |
| --- | --- | --- | --- |
| `src/api/pipeline.ts` | `PerformanceData` / `PerformedPart` / `PerformedNote` (in `api/types.ts`) | ~180 of 560 | **throws** `ParseError` naming the attribute; `EmptyDocumentError` when unperformed |
| `src/expression/msmFacts.ts` | `MsmFacts` / `MsmPart` / `MsmNote` | 162 | **`NaN`** for an unparseable number; `null` for a missing ms pair |
| `src/comparison/msm.ts` | `ComparisonMsm` / `MsmPartScope` / `MeasureEntry` | 272 | **`null`** |

That is ~610 lines and three incompatible readings of the same document. `api/types.ts`'s
`PerformedNote` is already a `readonly` record with branded units (`Ticks`, `Milliseconds`,
`Midi7Bit`) — this is the model, three-quarters built, in the wrong place and three times over.

None of the three can `serialize`. Each is a *projection*: they drop rests, all maps except
`channelVolumeMap` / `positionMap` / `timeSignatureMap` / `sectionMap`, the header, the
`.perf` attributes, `modified`, and `pitchname` / `octave` / `accidentals`.

### 5.2 The slice

**`src/msm/model.ts`: `parse : Element -> Validation<MsmDocument, ParseError[]>` and
`serialize : MsmDocument -> Element`, total, accumulating, side-effect-free, with
`serialize ∘ parse = id` asserted over all 82 MSM fixtures.**

The model is the §1.1 vocabulary: root, `global`, `part`, `header`, `dated`, the twelve map
kinds, and `ScoreEvent = Note | Rest` as a discriminated union. Phases as a type parameter
(§1.4.2). `Goto` as a two-armed sum, folded in from `src/msm/Goto.ts`.

**Cost:** ~700–900 lines of new `src/msm/model.ts` plus a property test file. No consumer
migrates in this commit. Green by construction — nothing existing changes.

**What it does NOT get, stated plainly:**

- It does not remove a single non-null assertion. `Msm.ts` still exists and still writes
  `getRootElement()!` 19 times. The ratchet does not move.
- It does not touch `Performance.perform`, `GenericMap`, or any of the nine map classes.
- It does not unify the three existing readers — that is commit 2, and it is *not* mechanical,
  because the three absence policies are load-bearing and separately tested
  (`tests/comparison/malformedValues.test.ts`, 266 lines; `tests/api/plain-data.test.ts`,
  10 tests). Merging them changes behaviour and needs its own measurement.
- It does not make `serialize ∘ parse = id` hold for the 13 fixtures that lose comments, a BOM,
  or gain a declaration — those are `XomTypes` defects (§2) and should be fixed there or
  declared out of scope, not papered over in the model.

### 5.3 Why not the alternatives

- **`Goto` first** (221 lines, 9 non-null assertions, 33 tests, one production call site, off
  the byte-compared path since nothing in `src/` calls `resolveSequencingMaps`): the cleanest
  possible demonstration of the idiom inside `src/msm/`, and genuinely a two-hour commit. But it
  buys 9 of 112 assertions and no structural change. **Worth doing as a warm-up if the model
  slice is judged too large; not worth doing instead of it.**
- **Non-nullable root first** (`XmlBase.data`): buys ~20 assertions but `XmlBase` is shared with
  `Mei` and `Mpm`, which two other agents are editing right now. Wrong week.
- **Model + render together:** see §3.5.

---

## 6. Method, and what I could not verify

### 6.1 The negative controls I ran

I transpiled `all-maps-equivalence.test.ts`, `full-xml-equivalence.test.ts` and
`cross-validation.test.ts` into the scratchpad with a single appended `export` line each,
stubbed the `vitest` import, and drove **their own comparison functions** with mutated inputs.
No file in the repo was modified.

| mutation applied to a reference `_augmented.msm` | `all-maps` | `full-xml` | `cross-validation` |
| --- | --- | --- | --- |
| identity | green | green | green |
| attribute order reversed on every `<note>` | **green** | **green** | RED |
| one bogus attribute added to every `<note>` | **green** | **green** | RED |
| one numeric value changed by 1 | RED | RED | — |

The last row is the control's control: the harness does fail when it should.

So the performed-MSM suites compare attributes through a `Map` keyed on name, iterating the
*reference's* attributes only (`all-maps-equivalence.ts:101`, `full-xml-equivalence.ts:141`);
`full-xml-equivalence.ts:172-178` has an explicitly empty "extra attributes" loop with a comment
saying it is "not necessarily an error". The converter-output suite compares normalised strings
and is therefore order-exact.

And the cost of closing it: I ran the full MEI→convert→perform pipeline and the all-maps
pipeline from `dist/` and compared the element sequence, attribute-name sequence and attribute
order against every Java reference. **24 fixtures, 0 mismatches.**

### 6.2 Fixture-coverage gaps in the MSM surface

The following are exercised by hand-built unit tests but by **no fixture**, so the byte gate
cannot protect a refactor there:

| surface | fixture coverage | unit coverage |
| --- | --- | --- |
| `<pedal>` element | **0 in 82 MSM files** (50 `pedalMap`s, all empty) | `tests/msm/Msm.test.ts:418`, `tests/msm/MsmSequencing.test.ts:265`, `tests/mpm/elements/Performance.test.ts:679` |
| `<phrase>` element | **0** | none found |
| `<tupletSpan>` element | **0** (25 empty `tupletSpanMap`s) | none found |
| `programChangeMap` on the MIDI path | **0** in `tests/integration/fixtures/**`; 3 files in `tests/comparison/fixtures`, which drive the comparison engine, not `exportMidi` | `tests/msm/Msm.test.ts:913,931` |
| `subNoteDynamics` | **0** — all 12 `<volume>` entries in the corpus carry `mandatory="true"`, i.e. only the non-sub-note branch is reached | in `tests/mpm/elements/DynamicsMap.test.ts` |
| `tuning.offset`, `detuneCents`, `detuneHz` | **0** — and nothing in `src/` reads them | partial |
| v3 `ornament.generated` / `.carved` / `.slot` / `.pass` / `.anchor` / `.source` | **0** in any byte-compared MSM fixture | `tests/integration/ornamentation-v3.test.ts` (1476 lines) |
| `<positionMap>` | 2 files | |

The imprecision fixtures are compared with `tuning.offset` filtered out on both sides
(`IMPRECISION_SENSITIVE_ATTRS`), and `xml:id`, `uri`, `file` are skipped everywhere.

### 6.3 Marked unverified

- **I did not run `npm run verify` or `npm run gate`.** Two agents are editing `src/msm/` and
  `src/mpm/`+`src/mei/` concurrently; a suite run would report their tree, not the baseline.
  All pipeline measurements were taken from the committed `dist/`, which corresponds to `10e9f58`.
  *What would verify it:* a clean checkout of `10e9f58` in a worktree and `npm run verify`.
- **`map.sort()` after articulation looks unreachable as a reorder, and I did not run a
  control.** `GenericMap.sort()` re-keys from `@date` (`GenericMap.ts:250`); articulation only
  writes `date.perf`; no render pass writes `@date` after stage 1; and all 109 `<score>`
  elements in all 82 MSM fixtures are already in non-decreasing `@date` order (measured). So its
  only reachable effect is on an out-of-order input, of which the corpus has none. *What would
  verify it:* delete `if (mapTimingChanged) map.sort()` and run the full suite plus the 20
  traced render scenarios; a green result is the finding, not the formality.
- **The ~110 write-site count is a hand count** from reading all fifteen render-path files, not
  a mechanical one — a grep cannot separate a write onto an MSM note from the construction of an
  MPM instruction element, and in `ImprecisionMap.ts` 30 of 34 `addAttribute` calls are the
  latter. The 31-attribute list and the file/line references in §3.2 are exact; the site total
  is ±5.
- **The non-null-assertion breakdown in §1.4 is a textual classification** (120 regex matches
  against eslint's authoritative 112), so the per-shape counts are approximate. The total, the
  per-file split (Msm.ts 97, Goto.ts 9, AbstractMsm.ts 4, dateMap.ts 2) and the 126 total
  findings are exact.
- **I did not measure whether unifying the three readers is behaviour-preserving.** It is
  asserted in §5.2 that it is *not* mechanical; I have not measured how far apart they are.
- **`src/comparison/msm.ts` I read only its exported signatures**, not its full body, so its
  "null" absence policy is inferred from its interface shapes rather than from every branch.
- The seven note attribute orders in §2 are measured over the *augmented* fixtures only. I did
  not enumerate orders for non-note elements.
