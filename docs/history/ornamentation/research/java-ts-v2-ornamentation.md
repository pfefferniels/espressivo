# MPM v2 Ornamentation — exact semantics of the current Java reference and the TypeScript port

Research report for the MPM-v3-ornamentation program. Everything below is read from source; no
file in either tree was modified.

Trees:

- Java reference (read-only): `/Users/nielspfeffer/Projects/meico`
- TypeScript port (read-only, live refactor swarm): `/Users/nielspfeffer/Projects/meico-ts`

---

## 0. The one-paragraph model

An MPM v2 ornament never creates or deletes notes. It takes a set of *existing* MSM `<note>`
elements, orders them, and writes **marker attributes** (`ornament.*`) onto them. Two later passes
fold those markers into the real performance attributes: a tick-domain pass before the tempo map
runs, and a millisecond-domain pass after it. There are exactly two transformers — `dynamicsGradient`
(a linear velocity ramp across the ornament) and `temporalSpread` (a power-curve time spread across
the ornament) — and an `ornamentDef` may carry at most one of each.

---

## 1. `TemporalSpread` (v2)

Java: `src/meico/mpm/elements/styles/defs/OrnamentDef.java:202-493` (static inner class).
TypeScript: `src/mpm/elements/styles/defs/TemporalSpread.ts` (extracted into its own module by the
refactor; see §5).

### 1.1 Fields, defaults, XML attributes

| Field          | Java type              | Default              | XML attribute   | Notes |
| -------------- | ---------------------- | -------------------- | --------------- | ----- |
| `frameStart`   | `double` (public)      | `0.0`                | `frame.start`   | may be negative (pre-beat arpeggio) |
| `frameLength`  | `double` (**private**) | `0.0`                | `frameLength`   | clamped `Math.max(0.0, length)` in `setFrameLength` (`OrnamentDef.java:287-289`) |
| `frameDomain`  | `FrameDomain`          | `Ticks`              | `time.unit`     | see below |
| `intensity`    | `double` (public)      | `1.0`                | `intensity`     | exponent, unguarded |
| `noteOffShift` | `NoteOffShift`         | `False`              | `noteoff.shift` | see below |
| `id`           | `String` (private)     | `null`               | `xml:id`        | |

Note the inconsistent naming in the MPM schema itself: `frame.start` is dotted, `frameLength` is
camelCase. Both spellings are load-bearing.

Parsing is done by the `TemporalSpread(Element)` constructor **only** (`OrnamentDef.java:232-281`);
serialization by `generateXML()` **only** (`:406-448`), plus `setId` (`:464-484`) which writes
`xml:id` directly. There is no third site in either direction. §8 indexes every attribute against
its exact parse and serialize lines in both trees.

`FrameDomain` (`OrnamentDef.java:211-215`): `Ticks`, `Milliseconds`. A third value
`RelativeToNoteDuration` exists **as a commented-out enum constant** and a commented-out
`generateXML` case (`:214`, `:421-422`) — a documented-but-unimplemented v2 intent, and an obvious
v3 candidate.

`time.unit` → domain mapping (`OrnamentDef.java:235-249`), parse side:

- attribute absent → `Ticks`
- `"milliseconds"` → `Milliseconds`
- `"ticks"` **or any other value whatsoever** → `Ticks` (the `default:` case falls through to the
  `ticks` case, so a typo silently means ticks)

Serialize side (`:414-423`): `Ticks` writes nothing (default when absent), `Milliseconds` writes
`time.unit="milliseconds"`.

`NoteOffShift` (`:217-221`): `False`, `True`, `Monophonic`. **Yes — v2 Java already has
`Monophonic`**, fully implemented (`:365-378`), parsed from `noteoff.shift="monophonic"` (`:272-274`)
and serialized (`:435-437`). It is simply never exercised by any fixture.

Parse of `noteoff.shift` (`:263-276`) accepts exactly `"true"` / `"false"` / `"monophonic"`; any
other value leaves the default `False`.

### 1.2 Frame computation (`OrnamentDef.java:305-321`, TS `TemporalSpread.ts:92-108`)

Given `chordSequence` of length `n` (each entry is a list of simultaneous notes — see §3.3 for why
that list always has exactly one note in v2):

```
if n < 1: return                                     // nothing to do

for i = 0 .. n-2:                                    // every chord except the last
    dateOffset(i) = pow(i / (n - 1), intensity) * frameLength + frameStart

dateOffset(n-1)  = frameStart + frameLength          // the last chord, placed explicitly
```

Exact Java expression (`:313`):
`(Math.pow(((double) i) / (chordSequence.size() - 1), this.intensity) * this.frameLength) + this.frameStart`

The last chord is placed **outside the loop** (`:319-320`) with the literal expression
`this.frameStart + this.frameLength`, not by evaluating the formula at `i = n-1`. For `intensity == 1`
the two agree exactly; for other intensities `pow(1, x) == 1` so they still agree numerically, but
the operand order differs, and the out-of-loop call is what carries `previous` into the final
monophonic note-off adjustment. Do not fold it into the loop.

For `n == 1` the loop does not run at all and the single chord goes to `frameStart + frameLength`
(i.e. the *end* of the frame, not the start).

**Intensity semantics.** `intensity == 1` → even spacing. `> 1` → notes crowd toward the start of
the frame (slow start, fast finish). `< 1` → crowd toward the end. Two unguarded edge cases:
`intensity == 0` gives `pow(0,0) == 1` (Java and JS agree), so *every* note lands at
`frameStart + frameLength`; a negative intensity gives `pow(0, -k) == Infinity` for `i = 0`, so the
first note's offset is `Infinity` (again, Java and JS agree — `Math.pow(0.0, -1.0)` is
`Double.POSITIVE_INFINITY`, and `Infinity` in JS).

**Domain does not change the math.** `frameStart`/`frameLength` are read verbatim in whichever unit
`time.unit` names; there is no PPQ or tempo conversion anywhere in `TemporalSpread`. The domain
selects only *which attribute names* are written (`:333-346`):

| Domain         | date attribute                         | duration attribute                 |
| -------------- | -------------------------------------- | ---------------------------------- |
| `Ticks`        | `ornament.date.offset`                 | `ornament.duration`                |
| `Milliseconds` | `ornament.milliseconds.date.offset`    | `ornament.milliseconds.duration`   |

The date attribute is an **offset**; the duration attribute is an **absolute duration**. This
asymmetry is deliberate and is stated in the Java doc comment at `:324-331`.

**Offsets accumulate** (`:349-355`): if the attribute already exists, the new value is
`dateOffset + parseDouble(existing)` — so two ornaments hitting the same note stack. If absent it is
created.

### 1.3 `noteOffShift` behaviour (`OrnamentDef.java:358-381`)

Applied per chord, immediately after the date offset is written:

- **`False`** — nothing written; `setOrnamentDateAtts` returns `null` (so `previous` is cleared).
  Consequence downstream: with an onset shift and no `ornament.noteoff.shift` marker and no
  `ornament.duration`, the tick pass *shortens/lengthens the duration* and leaves the note end where
  it was (§4.2).
- **`True`** — every note of the chord gets `ornament.noteoff.shift="true"` (the attribute is
  **only ever created for the true case**, so its mere presence is the flag; there is no
  `="false"` spelling in output). Returns `null`. Downstream the end moves with the onset and the
  duration is preserved.
- **`Monophonic`** — no `ornament.noteoff.shift` is written. Instead the *previous* chord is
  retro-shortened so it ends exactly where this chord begins:

  ```
  for each note prev in previousChord:
      if prev has no <dateAttName>: skip it
      newDuration = dateOffset(currentChord) - parseDouble(prev.<dateAttName>)
      prev.<durAttName> = newDuration        // overwrite if present, else create
  ```

  and returns the current chord so it becomes `previous` for the next call. Note the arithmetic uses
  the *accumulated* offset attribute value on `prev`, not the offset that was computed for it — so a
  stacked ornament changes the monophonic durations. The **last** chord of the sequence never gets a
  duration this way (nothing follows it), so it keeps its original length. A single-chord sequence
  gets no duration at all (`previous` is null on the only call).

  Because `Monophonic` writes an *absolute* `ornament.duration` / `ornament.milliseconds.duration`,
  it takes the absolute-duration branch downstream (§4.2, §4.3), which wins over `noteoff.shift`.

### 1.4 Serialization (`:406-448`)

Only non-default values are written: `frame.start` when `!= 0.0`, `frameLength` when `!= 0.0`,
`time.unit` only for milliseconds, `intensity` when `!= 1.0`, `noteoff.shift` only for
true/monophonic, `xml:id` when non-empty. A neutral spread round-trips as a bare
`<temporalSpread/>`.

---

## 2. `DynamicsGradient` (v2)

Java: `OrnamentDef.java:499-653`. TypeScript: `src/mpm/elements/styles/defs/DynamicsGradient.ts`.

### 2.1 Fields and XML

| Field            | Default | XML attribute     |
| ---------------- | ------- | ----------------- |
| `transitionFrom` | `0.0`   | `transition.from` |
| `transitionTo`   | `0.0`   | `transition.to`   |
| `id`             | `null`  | `xml:id`          |

Parse rule with teeth (`:521-525`): if `transition.to` is **absent**, it is set to
`transitionFrom` — "constant dynamics" — *not* to 0. Serialization mirrors this: `transition.to` is
omitted whenever it equals `transition.from` (`:597-598`).

As with `TemporalSpread`, the only parse site is the `DynamicsGradient(Element)` constructor
(`OrnamentDef.java:514-530`) and the only serialize sites are `generateXML()` (`:591-608`) and
`setId` (`:624-644`). See §8 for the full index.

### 2.2 Interpolation (`OrnamentDef.java:538-550`, TS `DynamicsGradient.ts:38-50`)

```
n = chordSequence.length

if n > 1:
    constFac     = (scale * (transitionTo - transitionFrom)) / (n - 1)
    fromVelocity = transitionFrom * scale
    for k = 0 .. n-1:
        ornamentDynamics(k) = constFac * k + fromVelocity
elif n == 1:
    ornamentDynamics(0) = transitionTo * scale      // NOTE: transitionTo, not transitionFrom
```

`scale` comes from the `<ornament scale="…">` attribute (§3.2). The single-chord case using
`transitionTo` is a real asymmetry with the `n > 1` case (whose `k = 0` term is `transitionFrom * scale`);
it is pinned by a TS unit test on purpose.

The value is **relative to the basic dynamics** and lands in `ornament.dynamics`, accumulating if
already present (`:557-567`):
`ornament.dynamics = newValue + parseDouble(existing)`.

### 2.3 Where the value ends up

`ornament.dynamics` is **added to `velocity`** in the tick pass (§4.2), i.e. it is an additive
velocity offset in MIDI velocity units, applied *after* the dynamics map has set the base velocity
and *before* dynamics imprecision. It is never clamped to 0..127 here.

### 2.4 The `scale` trap (important, and pinned by the fixture)

`OrnamentData.scale` defaults to **`0.0`** (`OrnamentData.java:25`; TS `OrnamentData.ts:28`), while
`OrnamentationMap.addOrnament(...)` defaults its `scale` parameter to **`1.0`** and *omits* the
attribute when `scale == 1.0` (`OrnamentationMap.java:91-92`). So:

> An `<ornament>` element with no `scale` attribute renders with `scale = 0.0`, which multiplies the
> entire dynamics gradient to zero.

This is not theory — it is exactly what the reference fixture shows: `orn1` and `orn3` have no
`scale`, and every note they touch carries `ornament.dynamics="0.0"` and an unchanged
`velocity="100.0"` (§6). Worse, the MEI importer sets `od.scale = 0.0` explicitly
(`Mei2MsmMpmConverter.java:2044`), and since `0.0 != 1.0` the attribute *is* written, so every
MEI-derived arpeggio in existence carries `scale="0.0"` and gets no dynamics gradient at all,
despite `createDefaultOrnamentDef("arpeggio")` defining one. Any v3 work must decide deliberately
whether to keep this (backward parity) or repair it (and regenerate ground truth).

---

## 3. `OrnamentationMap`

Java: `src/meico/mpm/elements/maps/OrnamentationMap.java`. TS:
`src/mpm/elements/maps/OrnamentationMap.ts`.

### 3.1 `<ornament>` element shape

Written by `addOrnament(date, nameRef, scale, noteOrder, id)` (`:86-112`):

- `date` (always), `name.ref` (always)
- `scale` only when `!= 1.0`
- `note.order` — either the literal string `ascending pitch` / `descending pitch` (the *first* such
  entry in the list wins and the loop breaks), or a space-separated `#id` list built by
  `" #" + nid.trim().replace("#","")`
- `xml:id` when non-empty

`addOrnament(OrnamentData)` (`:129-137`) prefers `data.ornamentDef.getName()` over
`data.ornamentDefName`, and errors out with `-1` when both are missing.

### 3.2 `getOrnamentDataOf(int index)` — dead in Java, alive in TS

`OrnamentationMap.java:144-206` clamps the index, builds a fully populated `OrnamentData` (name.ref,
style lookup by scanning backwards for the nearest `<style>` switch, def lookup, date, xml, note.order,
scale, xml:id) — **and then returns `null` unconditionally at `:205`.** There is no `return od;`
anywhere in the method. The whole body is dead code, and `grep` confirms **no Java caller exists**.

The TS port (`OrnamentationMap.ts:101-127`) returns `od`. This is a silent behavioural divergence
that **is not recorded in `PARITY.md`** (the only ornamentation entry there is the global-guard one,
§5.3). It is unreachable from the render path — `apply()` re-reads the same data inline so it can
carry the style forward across entries — so it changes nothing observable in a performance, but it
is an API-visible difference and 10 TS unit tests pin the TS behaviour.

### 3.3 `apply(maps)` — the core (Java `:284-408`, TS `:196-309`)

1. **Guard**: with no local *and* no global header, log an error and return (no style lookup
   possible).
2. **Index all notes by ID** across *all* maps in `maps` (`:294-301`), using the `id` attribute. This
   is what lets a global ornament's `note.order` name notes in several parts at once.
3. **Walk the map entries in index order.** A `<style>` entry rebinds the current style: local header
   first, then global header as fallback (`:310-316`). An `<ornament>` before the first style switch
   is skipped outright — no style, no way to resolve `name.ref`.
4. **Read the ornament**: `name.ref` → `od.ornamentDefName`; `style.getDef(name)` → `od.ornamentDef`
   (skip if unknown); `od.date = elements[i].key`; `scale` if present (else 0.0, §2.4). `xml` and
   `xmlId` are deliberately *not* populated on this path (commented out at `:335`, `:341-343`).
5. **Choose and order the notes** (`:346-397`) — two branches:
   - **`note.order` is an explicit ID list**: split on whitespace after stripping `#`, look each ID up
     in the note index, and build the chord sequence **in list order**. IDs that match no note are
     silently dropped (the sequence just gets shorter). `noteOrderAscending = 0`, and no sort runs.
     An empty list `continue`s to the next ornament. A `// TODO: parse brackets to create "sub-chords"`
     sits here (`:359`) — the syntax for grouping notes into real chords is unimplemented.
   - **Otherwise** (attribute absent, or `ascending pitch`, or `descending pitch`): collect **every
     `note` element at exactly `od.date`** from every map in `maps` (`getAllElementsAt`), skip if
     empty, then sort by pitch:
     `((int) Math.signum(pitch1 - pitch2)) * finalNoteOrderAscending`, with the direction `+1` for
     ascending (also the default when the attribute is absent) and `-1` for descending. The pitch read
     is `midi.pitch` of the chord's **first** note.
6. **Apply** via `od.apply(chordSequence)` and add any returned notes to `maps.get(0)` — a loop that
   is **dead by construction**, because `OrnamentData.apply` always returns an empty list (§3.5).

**Chords are never actually built in v2.** Both branches wrap each note in its own single-element
list (`chord.add(note); chordSequence.add(chord);`). The `ArrayList<ArrayList<Element>>` type is the
seam for a future feature; today "chord" always means "one note". Every per-chord loop in
`TemporalSpread` and `DynamicsGradient` therefore iterates exactly once. This matters for v3: the
data structure already supports simultaneities, nothing produces them.

Sort stability: Java's `List.sort` is TimSort (stable) and JS `Array.prototype.sort` is spec-stable
since ES2019, so equal pitches keep document order in both.

### 3.4 Entry points and where each is used

| Entry point | Java | Called from |
| --- | --- | --- |
| `static renderGlobalOrnamentationToParts(parts, map)` | `:214-231` | `Performance.perform` (global stage). Collects each part's `dated/score` into a `GenericMap` and calls `renderGlobalOrnamentationMap`. Guard: `map == null || map.isEmpty()` |
| `renderGlobalOrnamentationMap(maps)` | `:239-244` | the above; just `apply(maps)` |
| `static renderOrnamentationToMap(map, ornMap)` | `:252-255` | `Performance.perform` (per-part, symbolic stage) |
| `renderOrnamentationToMap(map)` | `:264-275` | **`apply([map])` only when `getLocalHeader() != null`** — i.e. a *local* map applies here, a *global* map was already applied in the global stage and must not be applied twice. Then always `renderAllNonmillisecondsModifiersToMap(map)` |
| `private renderAllNonmillisecondsModifiersToMap(map)` | `:419-467` | the above |
| `static renderMillisecondsModifiersToMap(map, ornMap)` | `:477-511` | `Performance.perform` (per-part, millisecond stage) |

The local/global double-application guard is the `getLocalHeader() != null` test at `:268`. If a part
falls back to the global ornamentation map (because it has none of its own), the tick pass still runs
for it — it just consumes markers written during the global stage.

### 3.5 `OrnamentData.apply` (Java `:93-112`, TS `OrnamentData.ts:88-102`)

```
chordsToAdd = []                       // always returned empty
if ornamentDef == null: return chordsToAdd
tempChordSequence = new ArrayList<>(chordSequence)     // SHALLOW copy — protects nothing
if dynamicsGradient != null: dynamicsGradient.apply(tempChordSequence, scale)
if temporalSpread   != null: temporalSpread.apply(tempChordSequence)
return chordsToAdd
```

**Transformer order is gradient-then-spread**, and it is observable: it fixes the attribute insertion
order on the note (`ornament.dynamics` before `ornament.date.offset`), which the reference augmented
MSM shows verbatim. The shallow copy shares both the inner lists and the `Element` objects with the
caller, so the mutation is fully visible outside. A `// TODO` at `:101-103` marks this as the place
where note-generating ornaments would be built — that TODO is the v3 seam.

---

## 4. The note-attribute plumbing and the pipeline order

### 4.1 Order of map application in `Performance.perform` (Java `Performance.java:385-556`)

**Global stage** (`:411-426`):

1. collect global MSM maps (keySignature, timeSignature, section, sequencing, marker, pedal)
2. **`OrnamentationMap.renderGlobalOrnamentationToParts(...)`** ← `:419`, *before* any `.perf`
   attributes exist on part notes and before rubato/tempo
3. per map: rubato, then tempo (interleaved in one loop)
4. pedal map: asynchrony, then timing imprecision

**Per-part stage** (`:429-556`), for each MSM part, in this exact order:

1. `DynamicsMap.renderDynamicsToMap(score, …)` → velocities; may yield a new `channelVolumeMap`
2. `MovementMap.renderMovementToMap(...)` → may yield a new `positionMap`
3. `MetricalAccentuationMap.renderMetricalAccentuationToMap(...)`
4. `ArticulationMap.renderArticulationToMap_noMillisecondModifiers(...)`
5. `RubatoMap.renderRubatoToMap(m)` for every collected map
6. **`OrnamentationMap.renderOrnamentationToMap(score, ornamentationMap)`** ← `:527` (local `apply`
   if local map, then the tick-domain modifier pass)
7. `TempoMap.renderTempoToMap(m, ppq, tempoMap)` for every collected map ← **the symbolic → ms
   crossing**
8. pedal map: asynchrony, timing imprecision
9. `channelVolumeMap`: tempo, asynchrony (deliberately no rubato)
10. `positionMap`: tempo, asynchrony (deliberately no rubato)
11. score: asynchrony
12. `ArticulationMap.renderArticulationToMap_millisecondModifiers(score, …)`
13. **`OrnamentationMap.renderMillisecondsModifiersToMap(score, ornamentationMap)`** ← `:550`
14. imprecision: timing, dynamics, toneduration, tuning (in that order)

So ornamentation sits **after rubato and before tempo** in the symbolic domain, and **after
articulation's millisecond half and before all imprecision** in the millisecond domain. Both
ornamentation passes therefore see velocities already set by dynamics, and their velocity changes are
still subject to dynamics imprecision afterwards.

The TS pipeline (`src/mpm/elements/Performance.ts`) reproduces this order exactly:
`renderGlobalOrnamentation` at `:483`, the tick pass at `:715`
(`mpm.ornamentation.renderOrnamentationToMap(score)`), the ms pass at `:768`.

### 4.2 Tick-domain pass — `renderAllNonmillisecondsModifiersToMap` (Java `:419-467`)

For every `note` in the map:

**(a) dynamics**

```
if note has ornament.dynamics and note has velocity:
    velocity = parseDouble(velocity) + parseDouble(ornament.dynamics)
```

If `velocity` is missing the ornament dynamics is silently dropped (there is no base to add to).
`ornament.dynamics` itself is *not* removed — it stays on the note and appears in the augmented MSM.

**(b) timing** — only if `ornament.date.offset` **and** `date.perf` are both present:

```
datePerf   = parseDouble(date.perf)                    // read BEFORE any write
offset     = parseDouble(ornament.date.offset)
date.perf  = datePerf + offset                          // written now

if ornament.duration present:                           // absolute duration wins outright
    duration.perf  = ornament.duration                  // verbatim string copy, or created
    date.end.perf  = datePerf + offset + parseDouble(ornament.duration)   // or created
elif ornament.noteoff.shift present:                    // presence == "true"
    if date.end.perf present:
        date.end.perf = parseDouble(date.end.perf) + offset               // duration preserved
    // if date.end.perf is absent, nothing happens at all
else:                                                   // noteoff.shift == false
    if duration.perf present:
        duration.perf = parseDouble(duration.perf) - offset               // end preserved
    // date.end.perf untouched
```

Three things are load-bearing: `datePerf` is captured before the write; the absolute-duration branch
recomputes the end from the saved values rather than re-reading the attribute it just rewrote; and
`duration.perf` receives the `ornament.duration` **string verbatim** (no reformatting) in the
absolute branch.

Note the practical consequence for MSM: an MSM note has `duration` but no `date.end`, so at this
point `date.end.perf` usually does **not** exist yet — `TempoMap.renderTempoToMap` creates it from
`date.perf + duration.perf` at `TempoMap.java:414-418`. That is why in the reference fixture the
false-shift notes end up with a modified `duration.perf` and a `date.end.perf` equal to the original
end (§6.3).

### 4.3 Millisecond-domain pass — `renderMillisecondsModifiersToMap` (Java `:477-511`)

For every `note`, skipping any without `milliseconds.date`:

```
msDate = parseDouble(milliseconds.date)                 // read BEFORE any write
msOff  = 0.0
if ornament.milliseconds.date.offset present:
    msOff = parseDouble(it)
    milliseconds.date = msDate + msOff

if ornament.milliseconds.duration present:              // absolute duration wins
    milliseconds.date.end = msDate + msOff + parseDouble(ornament.milliseconds.duration)   // or created
elif ornament.noteoff.shift present:                    // presence == "true"
    if milliseconds.date.end present:
        milliseconds.date.end = parseDouble(milliseconds.date.end) + msOff
// else: milliseconds.date.end is left completely alone (the duration absorbs the shift)
```

`msOff` staying `0.0` when there is no offset marker is what lets the absolute-duration expression
serve both cases with one formula. Same three rules as §4.2 about read-before-write ordering.

### 4.4 Summary of the temporary attributes

| Attribute | Written by | Read by | Meaning |
| --- | --- | --- | --- |
| `ornament.dynamics` | `DynamicsGradient.apply` | tick pass (§4.2) | additive velocity offset, accumulates |
| `ornament.date.offset` | `TemporalSpread.apply` (Ticks) | tick pass | onset offset in ticks, accumulates |
| `ornament.duration` | `TemporalSpread.setOrnamentDateAtts` (Ticks + Monophonic) | tick pass | **absolute** duration in ticks |
| `ornament.milliseconds.date.offset` | `TemporalSpread.apply` (Milliseconds) | ms pass (§4.3) | onset offset in ms, accumulates |
| `ornament.milliseconds.duration` | `TemporalSpread.setOrnamentDateAtts` (Ms + Monophonic) | ms pass | **absolute** duration in ms |
| `ornament.noteoff.shift` | `TemporalSpread` (`True` only) | both passes | presence == true; never written as `"false"` |

**None of these are ever deleted.** There is a commented-out cleanup block in `Performance.perform`
(`Performance.java:558-561`), so every `ornament.*` marker survives into the augmented MSM and is
visible in the reference fixtures. Any v3 change to marker naming is therefore a visible
output-format change, not an internal detail.

`OrnamentData` also declares `xml`, `xmlId`, `styleName`, `style`, `ornamentDefName`, `ornamentDef`,
`date`, `scale`, `noteOrder`, plus a `clone()` (`OrnamentData.java:67-82`) that deep-copies `xml` and
`noteOrder` but shares `style` and `ornamentDef` by reference. `clone()` is used by the MEI importer
when one `<arpeg>` fans out to several parts (`Mei2MsmMpmConverter.java:2132`).

---

## 5. TS port state

### 5.1 Faithfulness

The port is faithful line-for-line in the render path. `TemporalSpread.apply`,
`setOrnamentDateAtts`, `DynamicsGradient.apply`, `OrnamentData.apply`, `OrnamentationMap.apply`,
and both modifier passes reproduce the Java arithmetic, operand order, branch structure and
attribute-name choices exactly. Several sites carry explicit `FROZEN` / "do not reassociate" comments
naming the refactor items ([T7], [T19]) that own the floating-point order.

### 5.2 API shape after the idiomatic refactor

| Java | TypeScript |
| --- | --- |
| `OrnamentDef.TemporalSpread` (static inner class) | `src/mpm/elements/styles/defs/TemporalSpread.ts` — **own module** |
| `OrnamentDef.DynamicsGradient` (static inner class) | `src/mpm/elements/styles/defs/DynamicsGradient.ts` — **own module** |
| `TemporalSpread.FrameDomain` (Java enum) | `enum FrameDomain { Ticks = 'ticks', Milliseconds = 'milliseconds' }` (string enum) |
| `TemporalSpread.NoteOffShift` | `enum NoteOffShift { False = 'false', True = 'true', Monophonic = 'monophonic' }` |
| `createOrnamentDef(String)` / `(Element)` overloads | same names, TS overload pair |
| `setTemporalSpread(TemporalSpread)` / `setTemporalSpread(5 args)` overloads | `setTemporalSpread(ts)` and **`setTemporalSpreadValues(...)`** (renamed, no overloading) |
| `setDynamicsGradient(dg)` / `(from, to)` | `setDynamicsGradient(dg)` and **`setDynamicsGradientValues(from, to)`** |
| `addOrnament(OrnamentData)` | **`addOrnamentFromData(data)`** (renamed) |
| `createOrnamentationStyle(name)` / `(name,id)` / `(Element)` | one overload pair, `id` optional |
| static factories returning null on error | unchanged (`console.error` + `return null`) |

The module split was an explicit refactor decision (ARCHITECTURE.md §"T14/T-list": importing either
transformer used to drag `OrnamentDef` in). Both transformer classes are deliberately **not** part of
the `AbstractXmlSubtree` hierarchy — their `getXml()` lazily *generates and caches*, and moving them
would turn that into a plain field read, silently serializing programmatically built transformers as
nothing (documented at `TemporalSpread.ts:26-33`).

`GenericMap` gained protected helpers the port uses here: `clampEntryIndex`, `resolveEntryIndex`
(clamp + local-name test), `findStyleSwitchAt`, `findStyleNameAt` — the last two replacing Java's
inline backwards scan.

### 5.3 Known TS-side divergences

1. **`getOrnamentDataOf` returns data instead of always-null** (§3.2). Real, API-visible,
   unreachable from rendering, **undocumented in PARITY.md**. Worth a journal entry regardless of
   what v3 does.
2. **Global ornamentation guard** — `Performance.renderGlobalOrnamentation` (`Performance.ts:506`)
   tests only for `null` where `OrnamentationMap.java:215` tests `null || isEmpty()`. Recorded in
   `PARITY.md` §3 "Frozen divergences" as benign: with no ornament entries the apply loop runs zero
   times, and the only observable difference (an error log when neither header is set) cannot happen
   for a global map because a `Global` always has a `Header`.
3. **Duplicated millisecond pass.** `Performance.ts` has its own `private static
   renderMillisecondsModifiersToMap` (`:877-918`) that is character-identical to
   `OrnamentationMap.renderMillisecondsModifiersToMap` (`:419-461`), because `Performance.ts` only
   *type*-imports the map classes and so cannot call their statics. **The pipeline calls the
   `Performance` copy; the `OrnamentationMap` copy is reached by no fixture and only by unit tests.**
   Nothing enforces that the two stay in sync. Kept deliberately per ARCHITECTURE.md §8.10 ("it is
   the Java-parity code path; deleting it makes a future parity comparison harder"), and collapsing
   them is a declined [T19] ruling. **For v3 this is a live trap: any change to the ms pass must be
   made in two files.**
4. **Missing-`midi.pitch` behaviour differs.** Java's sort comparator does
   `Double.parseDouble(Helper.getAttributeValue("midi.pitch", …))`, and `getAttributeValue` returns
   `""` for a missing attribute → `NumberFormatException` aborts the whole render. TS's
   `getAttributeValue` also returns `''`, but `parseFloat('')` is `NaN` → `Math.sign(NaN)` is `NaN` →
   the comparator returns `NaN`, which V8 treats as 0, so the order is silently left as collected.
   Undocumented; no fixture reaches it.
5. **Number formatting.** TS writes attribute values with `String(x)` where Java writes
   `String.valueOf(double)` / `Double.toString(double)` — so TS emits `"-22"`, `"0"`, `"22"` where
   Java emits `"-22.0"`, `"0.0"`, `"22.0"`. This is invisible to the integration tests (they compare
   numerically, §6.4) but is a genuine textual difference in the emitted MSM/MPM. Note the working
   tree has a new `src/supplementary/parseJavaDouble.ts` for the *read* direction; PARITY.md §P1
   explicitly says the render-time reads in `TemporalSpread` / `DynamicsGradient` are **not** covered
   by it and remain `parseFloat`.
6. **`noteoff.shift="false"` parse.** Java has an explicit `case "false"` that assigns `False`; TS
   omits the case because the field already defaults to `False`. Behaviourally identical, pinned by a
   TS test.

### 5.4 What the TS unit tests pin

`tests/mpm/elements/OrnamentationMap.test.ts` (1322 lines, ~100 cases) and
`tests/mpm/elements/styles/defs/OrnamentDef.test.ts` (839 lines) between them pin:

- **`DynamicsGradient`**: linear spread, constant gradient when from == to, scaling, **zero gradient
  for scale 0**, single-chord uses `transitionTo`, empty sequence is a no-op, all notes of a chord get
  the same value, accumulation onto an existing attribute, `generateXML` omission rules, XML round
  trip, `setId` including detach-on-null.
- **`TemporalSpread`**: documented defaults, negative-length clamping (both setter and XML),
  even spread at intensity 1, the intensity exponent bending, ticks vs milliseconds attribute names,
  single chord placed at the frame *end*, empty sequence no-op, chord-wide identical offsets,
  offset accumulation, `NoteOffShift.False` leaving note-offs alone, `True` marking every note,
  **`Monophonic` cutting each note at the next one**, the milliseconds duration name under
  monophonic, and monophonic single-chord writing no duration.
- **`OrnamentDef`**: parse of both transformers, unknown children ignored, null on missing `name`,
  set/replace/remove of each transformer with only one child surviving, the arpeggio default
  (`-1.0/1.0` gradient, `-22.0/44.0/Ticks/1.0/False` spread) plus the `arpeg` alias and
  case-insensitive trimmed matching, unknown name yielding a transformer-less def.
- **`OrnamentationMap`**: the `addOrnament` attribute-omission rules, sorted insertion,
  `getOrnamentDataOf` including the index clamp and the `0.0` scale default, **four tests that
  reproduce the reference fixture's ornaments "exactly as the Java reference does"** (tick arpeggio,
  scaled descending arpeggio, ms spread not touching tick timing, ms modifiers), explicit
  `note.order` ID lists across dates, unresolvable references being skipped, ID refs matching no note
  being dropped, the tick and ms modifier passes in isolation (every branch: no velocity, no
  `date.perf`, absolute duration, note-off shift with and without `date.end.perf`, attribute
  creation when missing), global ornamentation across parts, ornaments before any style switch,
  unknown style / unknown def, no notes at the date, global-header fallback, and `OrnamentData.apply`
  returning empty with each transformer combination.

---

## 6. The fixtures

`tests/integration/fixtures/all-maps-reference/ornamentation.{mpm,msm}` and
`ornamentation_augmented.msm` (Java-generated ground truth), plus `ornamentation_raw.mid` and
`ornamentation_expressive.mid`.

### 6.1 `ornamentation.mpm` (the ornamentation part, reformatted for reading)

```xml
<performance name="test performance" pulsesPerQuarter="720">
 <global>
  <header>
   <ornamentationStyles>
    <styleDef name="orn style">
     <ornamentDef name="arpeggio">
      <dynamicsGradient transition.from="-1.0" transition.to="1.0"/>
      <temporalSpread frame.start="-22.0" frameLength="44.0"/>
     </ornamentDef>
     <ornamentDef name="spreadMs">
      <dynamicsGradient transition.from="-0.5" transition.to="0.5"/>
      <temporalSpread frame.start="-30.0" frameLength="60.0"
                      time.unit="milliseconds" intensity="2.0" noteoff.shift="true"/>
     </ornamentDef>
     <ornamentDef name="spreadMsNoShift">
      <temporalSpread frame.start="-40.0" frameLength="80.0" time.unit="milliseconds"/>
     </ornamentDef>
    </styleDef>
   </ornamentationStyles>
  </header>
  <dated>
   <tempoMap><tempo date="0.0" bpm="120" beatLength="0.25"/></tempoMap>
   <ornamentationMap>
    <style    date="0.0"    name.ref="orn style"/>
    <ornament date="0.0"    name.ref="arpeggio"                                        xml:id="orn1"/>
    <ornament date="1440.0" name.ref="arpeggio" scale="2.0" note.order="descending pitch" xml:id="orn2"/>
    <ornament date="2880.0" name.ref="spreadMs"                                        xml:id="orn3"/>
    <ornament date="4320.0" name.ref="spreadMsNoShift"                                 xml:id="orn4"/>
   </ornamentationMap>
  </dated>
 </global>
 <part name="Piano" number="1" midi.channel="0" midi.port="0">
  <header/>
  <dated><dynamicsMap><dynamics date="0.0" volume="100"/></dynamicsMap></dated>
 </part>
</performance>
```

Note the ornamentationMap is **global**, and the part has no local one — so the global path
(`renderGlobalOrnamentationToParts`) writes the markers and the per-part path only renders them.

`ornamentation.msm` holds 12 notes, four triads at dates 0 / 1440 / 2880 / 4320, each note
`duration="1440.0"`, pitches 60/64/67, 62/65/69, 64/67/71, 65/69/72, ids `n1`…`n12`.

### 6.2 Representative augmented output

```xml
<!-- orn1: tick arpeggio, no scale -> gradient contributes 0 -->
<note xml:id="n1" date="0.0" midi.pitch="60.0" duration="1440.0"
      ornament.dynamics="0.0" ornament.date.offset="-22.0"
      date.perf="-22.0" duration.perf="1462.0" modified="" velocity="100.0"
      milliseconds.date="-18.333333333333332"
      date.end.perf="1440.0" milliseconds.date.end="1000.0"/>

<!-- orn2: scale=2.0, descending -> n6 opens, n4 closes -->
<note xml:id="n4" date="1440.0" midi.pitch="62.0" duration="1440.0"
      ornament.dynamics="2.0" ornament.date.offset="22.0"
      date.perf="1462.0" duration.perf="1418.0" modified="" velocity="102.0"
      milliseconds.date="1015.2777777777778"
      date.end.perf="2880.0" milliseconds.date.end="2000.0"/>
<note xml:id="n6" ... ornament.dynamics="-2.0" ornament.date.offset="-22.0"
      date.perf="1418.0" duration.perf="1462.0" velocity="98.0"
      milliseconds.date="984.7222222222222" date.end.perf="2880.0" milliseconds.date.end="2000.0"/>

<!-- orn3: ms spread, intensity 2, noteoff.shift=true -->
<note xml:id="n7" date="2880.0" midi.pitch="64.0" duration="1440.0"
      ornament.dynamics="0.0" ornament.milliseconds.date.offset="-30.0"
      ornament.noteoff.shift="true"
      date.perf="2880.0" duration.perf="1440.0" velocity="100.0"
      milliseconds.date="1970.0" date.end.perf="4320.0" milliseconds.date.end="2970.0"/>
<note xml:id="n8" ... ornament.milliseconds.date.offset="-15.0" milliseconds.date="1985.0"
      milliseconds.date.end="2985.0"/>
<note xml:id="n9" ... ornament.milliseconds.date.offset="30.0"  milliseconds.date="2030.0"
      milliseconds.date.end="3030.0"/>

<!-- orn4: ms spread, no gradient at all, noteoff.shift absent -->
<note xml:id="n10" ornament.milliseconds.date.offset="-40.0"
      milliseconds.date="2960.0" milliseconds.date.end="4000.0"/>   <!-- end NOT moved -->
<note xml:id="n11" ornament.milliseconds.date.offset="0.0"  milliseconds.date="3000.0"
      milliseconds.date.end="4000.0"/>
<note xml:id="n12" ornament.milliseconds.date.offset="40.0"  milliseconds.date="3040.0"
      milliseconds.date.end="4000.0"/>
```

### 6.3 Every number verified against the formulas

- **orn1** (`arpeggio`, no `scale`): gradient `scale = 0` ⇒ `constFac = 0`, `fromVelocity = 0` ⇒ all
  `ornament.dynamics = 0.0`, velocities unchanged at 100. Spread `n = 3`, intensity 1: `-22`, `0`,
  `+22`. `noteoff.shift` false ⇒ `duration.perf = 1440 − offset` = 1462 / 1440 / 1418, and
  `date.end.perf` stays 1440 for all three. **The fixture pins the `scale`-defaults-to-0 bug.**
- **orn2** (`scale="2.0"`, `descending pitch`): order n6(69), n5(65), n4(62).
  `constFac = (2·(1−(−1)))/2 = 2`, `fromVelocity = −1·2 = −2` ⇒ `−2, 0, +2` ⇒ velocities 98 / 100 / 102.
  Spread offsets `−22, 0, +22` in that same order ⇒ n6 shifts early, n4 late.
- **orn3** (`spreadMs`, intensity 2): `(0/2)²·60−30 = −30`; `(1/2)²·60−30 = −15`; last `= −30+60 = +30`.
  `noteoff.shift="true"` ⇒ ends move by the same offsets: base ms 2000/3000 ⇒ 1970/2970,
  1985/2985, 2030/3030. Tick attributes untouched.
- **orn4** (`spreadMsNoShift`, no gradient): no `ornament.dynamics` attribute is created at all.
  Offsets `−40, 0, +40`; note-off does not shift ⇒ `milliseconds.date.end` stays 4000 for all three,
  so the durations absorb the shift.
- **The `-18.333…` / `+18.333…` millisecond values are a TempoMap quirk, not an ornamentation one.**
  `TempoMap.renderTempoToMap` decides the conversion by the map entry's **symbolic key**, not by
  `date.perf`: `if (mapEntry.getKey() <= td.startDate) milliseconds = computeDiffTiming(date, ppq, null)`
  (`TempoMap.java:401-402`). Notes n1–n3 have key `0.0`, equal to the tempo instruction's start date,
  so they are converted with **no tempo data** — `computeMillisecondsForNoTempo = 600·date/ppq`
  (`:532-534`, i.e. the default 100 bpm) ⇒ `±22 · 600/720 = ±18.3333`. Notes n4–n12 (keys > 0) use the
  real 120 bpm rate `500/720` ⇒ 984.72 / 1015.28 / 2000 / etc. Their `date.end.perf` values (key-independent,
  resolved via `pendingDurations`) use the tempo, hence n1's end is 1000 ms. Any v3 work that moves
  ornament onsets across a tempo instruction inherits this discontinuity.

### 6.4 Which tests consume the fixtures, and how strictly

| Test | What it does | Tolerance |
| --- | --- | --- |
| `tests/integration/all-maps-equivalence.test.ts` | `ornamentation` is in the **deterministic** list. Loads `.msm` + `.mpm`, runs `Performance.perform`, walks the tree comparing every element and attribute against `ornamentation_augmented.msm` | numeric attrs: `Math.abs(ref − ts) > 0.01` fails; non-numeric: exact string; `xml:id`/`uri`/`file` skipped; child **count and order** compared |
| `tests/integration/midi-byte-equivalence.test.ts` | `ornamentation` in the deterministic all-maps list: `exportExpressiveMidi` vs `ornamentation_expressive.mid`, and `exportMidi(120)` vs `ornamentation_raw.mid`, compared **event by event** | event-level, effectively exact |

Normalization worth knowing: the attribute comparison is a **name-keyed map lookup**, so attribute
*order* on an element is not pinned — but the `0.01` numeric tolerance is loose enough to hide small
divergences (PARITY.md §2 documents exactly this happening for the metrical-accentuation segment-end
bug, where a 0.00104 divergence passes a green suite). Do not treat a green run as proof of exact
parity for v3 changes; regenerate ground truth instead.

There is **no `ornamentation.mei`** in `tests/integration/fixtures/mei/`, so the MEI `<arpeg>` →
ornamentationMap path (§7.3) has no integration coverage at all.

---

## 7. Surprises, bugs, dead code, asymmetries

1. **`getOrnamentDataOf` always returns `null` in Java** (`OrnamentationMap.java:205`) — 60 lines of
   fully written, entirely dead code, with no caller anywhere in meico. The TS port silently fixed it.
2. **`scale` defaults to `0.0`, not `1.0`** (`OrnamentData.java:25`), while the writer omits the
   attribute when it equals `1.0`. Any ornament without an explicit `scale` renders with **no dynamics
   gradient at all**. The MEI importer hard-codes `od.scale = 0.0` (`Mei2MsmMpmConverter.java:2044`),
   so this is the *normal* case for real documents, not an edge case. Pinned by the reference fixture.
3. **`OrnamentData.apply` always returns an empty list**, so the note-adding loop in
   `OrnamentationMap.apply` (`:402-406`) is dead by construction in both trees. It is the declared
   seam for note-generating ornaments (trills, mordents, turns) — exactly what v3 needs — and both
   trees carry comments warning against "simplifying" it away.
4. **Chords are never grouped.** `ArrayList<ArrayList<Element>>` is always a list of singletons; the
   `// TODO: parse brackets to create "sub-chords"` at `:359` is unimplemented. The transformers are
   already written to handle multi-note chords correctly (they loop over the inner list), so building
   real chords is a change to the *collection* code only.
5. **`FrameDomain.RelativeToNoteDuration` is commented out** in the enum (`OrnamentDef.java:214`) with
   a matching commented-out serialization case — a v2-era design intent left in the source.
6. **`noteoff.shift` has no "false" spelling in output.** Absence means false. If v3 adds a fourth
   mode, the presence-is-truth convention in both modifier passes has to change in lockstep.
7. **`Monophonic` is implemented but untested by any fixture** — Java-side and TS-side alike. It is
   the only path that writes `ornament.duration` / `ornament.milliseconds.duration`, i.e. the only
   path that exercises the absolute-duration branches of §4.2 and §4.3 in a real render. TS unit tests
   cover it; no integration fixture does.
8. **The millisecond pass exists twice in the TS tree** and only the `Performance.ts` copy is
   reachable from `perform` (§5.3 item 3). Nothing detects drift.
9. **Tick-domain and millisecond-domain spreads are mutually blind.** A `Ticks` spread writes
   `ornament.date.offset` and is consumed before tempo; a `Milliseconds` spread writes
   `ornament.milliseconds.date.offset` and is consumed after. Two ornaments on the same note, one in
   each domain, compose without either knowing about the other — and the tick one is subject to tempo
   scaling while the ms one is not.
10. **`ornament.*` markers are never cleaned up** (the cleanup block in `Performance.perform` is
    commented out, `Performance.java:558-561`), so they are part of the observable augmented-MSM
    output and are pinned by the reference fixtures.
11. **A global ornament reaches only parts without their own ornamentationMap**
    (`getAllMsmPartsAffectedByGlobalMap`), but within those parts it collects notes across **all** of
    them at once — so one global `<ornament>` at a date arpeggiates the union of all affected parts'
    notes at that date, sorted by pitch across part boundaries. That is intended, and it is why the
    note index is built over all maps.
12. **Java aborts the whole render on a note missing `midi.pitch`** during the pitch sort
    (`NumberFormatException` out of `Double.parseDouble("")`); TS silently keeps the collected order
    (§5.3 item 4).
13. **`intensity <= 0` is unguarded** in both trees: `0` collapses every note onto the frame end,
    negative values produce an `Infinity` offset for the first note.
14. **Java's MPM element whitelist misspells `dynamicsGradient`.** `Mpm.isInNamespace`
    (`Mpm.java:193-254`) lists `case "ornamentDef": case "temporalSpread": case "dynamcisGradient":`
    — `dynamcis`, transposed (`:216-218`). The correctly spelled `dynamicsGradient` is **not** in the
    Java whitelist. TS reproduces the typo *and* adds the correct spelling alongside it
    (`Mpm.ts:205-208`, with the reason in the comment at `:173`), so the two trees answer differently
    for a correctly spelled element name. The only Java caller is `GenericMap.java:37`, which uses it
    to decide whether a map element gets the MPM namespace, so nothing in the ornamentation path is
    affected today — but a v3 compat layer that reuses this whitelist inherits the typo.
15. **The MEI importer's arpeggio ordering is deferred**: `<arpeg plist="…" order="up|down">` parks the
    `note.order` attribute on `arpeggiosToSort` and re-sorts it by `@pnum` at the end of the mdiv,
    once pitches are known (`Mei2MsmMpmConverter.java:2085-2091, :2113-2114`; TS
    `src/mei/Mei2MsmMpmConverter.ts:756-777`). `order="nonarp"` is dropped entirely (`:2032-2033`).
    An `<arpeg>` with no `part`/`staff` (or `%all`) becomes a *global* ornament with a style switch to
    a generated style named `"MEI export"`; otherwise one local ornament per named staff, with cloned
    `OrnamentData` and uniquified `xml:id`s.

---

## 8. Complete XML touchpoint index (for the v3 compat layer)

Every place in either tree that reads or writes an ornamentation-related XML name. Line numbers are
as of Java `meico` (Niels' v2-era fork) and meico-ts branch `ts-idiomatic` at the time of writing.
A v3 compat layer that must keep reading and writing v2 documents has to account for all of these
and for nothing else — there is no fourth parse path hiding anywhere.

### 8.1 `<temporalSpread>` attributes

Java: sole parse site is the `TemporalSpread(Element xml)` constructor,
`src/meico/mpm/elements/styles/defs/OrnamentDef.java:232-281`. Sole serialize site is
`TemporalSpread.generateXML()`, `:406-448` (which also does `this.setXml(ts)` at `:446`, so it
*replaces* the cached element). `TemporalSpread.setId(String)` at `:464-484` writes/detaches `xml:id`
in place on whatever `getXml()` returns.

TS: `src/mpm/elements/styles/defs/TemporalSpread.ts` — constructor `:44-69`, `generateXML()`
`:188-205`, `setId()` `:217-234`.

| Attribute | Java parse | Java serialize | TS parse | TS serialize |
| --- | --- | --- | --- | --- |
| `time.unit` | `:235-249` (absent → `Ticks`; `"milliseconds"` → `Milliseconds`; **everything else → `Ticks`** via the shared `case "ticks": default:`) | `:414-423` (`Ticks` writes nothing; `Milliseconds` writes `time.unit="milliseconds"`) | `:47-49` (only `=== 'milliseconds'` tested; every other value leaves the `Ticks` default — same result, different shape) | `:194-195` |
| `frame.start` | `:251-253` (`Double.parseDouble`) | `:409-410`, **only when `!= 0.0`** | `:50-51` (`parseFloat`) | `:190-191` |
| `frameLength` | `:255-257` → `setFrameLength` at `:287-289`, which clamps `Math.max(0.0, …)` | `:411-412`, **only when `!= 0.0`** (reads the private field directly, so the clamped value) | `:52-53` → `setFrameLength` `:72-74` | `:192-193` |
| `intensity` | `:259-261` | `:425-426`, **only when `!= 1.0`** | `:54-55` | `:196` |
| `noteoff.shift` | `:263-276` (exactly `"true"` / `"false"` / `"monophonic"`; anything else keeps `False`) | `:428-438` (`False` writes nothing, `True` → `"true"`, `Monophonic` → `"monophonic"`) | `:56-66` (`'true'` / `'monophonic'`; the `'false'` case is omitted because it is the default) | `:197-200` |
| `xml:id` | `:278-280` via `Helper.getAttribute("id", xml)` (local-name match, namespace-agnostic) | `:440-444` — builds `new Attribute("id", …)` then `setNamespace("xml", …)`; also `setId` `:464-484` | `:67-68` via `attribute('id', xml)` | `:201-202` — `new Attribute('xml:id', XML_NS, …)`; also `setId` `:217-234` |

Note the read/write asymmetry that exists in **both** trees: `frame.start`, `frameLength` and
`intensity` are written only when non-default, so a spread parsed from a document that spells out
`intensity="1.0"` re-serializes without it. Element construction is `new Element("temporalSpread",
Mpm.MPM_NAMESPACE)` (Java `:407`) / `new Element('temporalSpread', MPM_NAMESPACE)` (TS `:189`).

### 8.2 `<dynamicsGradient>` attributes

Java: sole parse site `DynamicsGradient(Element)` `OrnamentDef.java:514-530`; serialize
`generateXML()` `:591-608`; `setId` `:624-644`.
TS: `src/mpm/elements/styles/defs/DynamicsGradient.ts` — constructor `:19-29`, `generateXML()`
`:82-92`, `setId()` `:104-121`.

| Attribute | Java parse | Java serialize | TS parse | TS serialize |
| --- | --- | --- | --- | --- |
| `transition.from` | `:517-519` | `:594-595`, **only when `!= 0.0`** | `:22-23` | `:84-85` |
| `transition.to` | `:521-525` — **absent ⇒ `transitionTo = transitionFrom`** | `:597-598`, **only when `!= transitionFrom`** | `:24-26` | `:86-87` |
| `xml:id` | `:527-529` | `:600-604`; also `setId` `:624-644` | `:27-28` | `:88-89`; also `setId` `:104-121` |

### 8.3 `<ornamentDef>` and `<ornamentationStyles>/<styleDef>`

| Name | Java | TS |
| --- | --- | --- |
| `<ornamentDef>` child dispatch (`dynamicsGradient` / `temporalSpread`; unknown children ignored, **last of a kind wins**) | `OrnamentDef.parseData` `:74-96` | `OrnamentDef.parseDataInternal` `:25-37` |
| `<ornamentDef>` element creation + `name` attribute | `OrnamentDef(String)` ctor `:23-27` | `createOrnamentDef` `:49-64` (`:53-54`) |
| local-name coercion to `"ornamentDef"` when parsing a foreign element | `:78-80` (`setLocalName`) | **absent** — the XomTypes layer cannot rename nodes; frozen divergence, PARITY.md §3 |
| `name` attribute of any def (required, throws when missing) | `AbstractDef.parseData` `:16-22` | `AbstractDef.ts:20-30` |
| child-`ornamentDef` indexing inside the style | `OrnamentationStyle.parseData` `:88-99` (`Helper.getAllChildElements("ornamentDef", …)`, `defs.put(od.getName(), od)`) | `OrnamentationStyle.ts:38-41` → `GenericStyle.parseDefs(xml, 'ornamentDef', …)` `GenericStyle.ts:57` |
| `styleDef` `name` / `xml:id` | `GenericStyle.parseData` `:98-104` | `GenericStyle.ts:36-46` |
| header dispatch for `ornamentationStyles` (parse) | `Header.java:138-139` | `Header.ts:124-125` |
| header dispatch for `ornamentationStyles` (create by name) | `Header.java:249-250` | `Header.ts:193-194` |
| the style-type string `"ornamentationStyles"` | `Mpm.ORNAMENTATION_STYLE`, `Mpm.java:30` | `ORNAMENTATION_STYLE`, `src/mpm/names.ts:22` |
| default def for a known ornament name (`arpeg`/`arpeggio` → gradient `-1.0/1.0`, spread `-22.0/44.0/Ticks/1.0/False`) | `OrnamentDef.createDefaultOrnamentDef` `:183-196` | `OrnamentDef.ts:131-141` |

Gradient-before-spread ordering in `createDefaultOrnamentDef` fixes the serialized child order
(`dynamicsGradient` then `temporalSpread`); both trees note it.

### 8.4 `<ornamentationMap>` and its `<ornament>` entries

| Name | Java | TS |
| --- | --- | --- |
| map type string `"ornamentationMap"` | `Mpm.ORNAMENTATION_MAP`, `Mpm.java:38` | `ORNAMENTATION_MAP`, `src/mpm/names.ts:30` |
| map instantiation from XML / by type | `Dated.java:133` and `:188` (switch cases) | **no switch** — `GenericMap.registerMapFactory('ornamentationMap', …)` at `OrnamentationMap.ts:464-466`, consumed by `GenericMap` `:67`. Architectural divergence: the TS registry is populated by module side effect via `maps/index.ts` |
| `type` coercion to `"ornamentationMap"` | `OrnamentationMap.parseData` `:72-75` (`setType`) | removed during the refactor (the `setLocalName` family, PARITY.md §3) |
| `<ornament>` **write** — `date`, `name.ref`, `scale` (only when `!= 1.0`), `note.order`, `xml:id` (only when non-empty) | `addOrnament(double,String,double,ArrayList,String)` `:86-112` | `addOrnament` `OrnamentationMap.ts:51-75` |
| `<ornament>` write from a data object | `addOrnament(OrnamentData)` `:129-137` | `addOrnamentFromData` `:77-90` |
| `<ornament>` **read** (accessor path) | `getOrnamentDataOf` `:144-206` — `name.ref` `:155`, style scan `:164-170`, `date` `:183`, `note.order` `:186-194`, `scale` `:196-198`, `xml:id` `:200-202`; **returns null regardless** `:205` | `getOrnamentDataOf` `:101-127` (same attributes, returns the data) |
| `<ornament>` **read** (render path — the one that matters) | `OrnamentationMap.apply` — `name.ref` `:326-329`, `date` `:334`, `scale` `:337-339`, `note.order` `:348-374` | `OrnamentationMap.apply` — `:243-245`, `:249`, `:251-252`, `:257-280` |
| `<style>` switch `name.ref` inside the map | `apply` `:310-316` (local header first, global fallback) | `:223-235` |
| standalone `<ornament>` → data parse (used by the MEI importer) | `OrnamentData(Element)` `:37-60` — `date`, `name.ref`, `scale`, `note.order`, `xml:id` | `OrnamentData.ts:31-51` |

`note.order` has the same three-way grammar at every one of those sites: the literal
`"ascending pitch"`, the literal `"descending pitch"`, or a whitespace-separated ID list with `#`
stripped (`replaceAll("#","").split("\\s+")` / `replace(/#/g,'').split(/\s+/)`). On the write side the
`#` is re-added (`" #" + id`).

### 8.5 The `ornament.*` note attributes (MSM side)

These are not MPM-schema attributes — they are temporaries written onto MSM `<note>` elements and
never cleaned up (§4.4), so they are part of the observable augmented-MSM output.

| Attribute | Written at (Java / TS) | Read at (Java / TS) |
| --- | --- | --- |
| `ornament.dynamics` | `DynamicsGradient.setOrnamentDynamicsAtt` `OrnamentDef.java:557-567` / `DynamicsGradient.ts:52-62` | `OrnamentationMap.renderAllNonmillisecondsModifiersToMap` `:424-430` / `OrnamentationMap.ts:333-340` |
| `ornament.date.offset` | `TemporalSpread.setOrnamentDateAtts` `:337-338` (name) + `:349-355` (value) / `TemporalSpread.ts:122-124`, `:133-138` | `:433-465` / `OrnamentationMap.ts:341-381` |
| `ornament.duration` | `:338` + `:365-378` (Monophonic only) / `TemporalSpread.ts:123`, `:146-165` | `:444-453` / `:352-362` |
| `ornament.milliseconds.date.offset` | `:341-342` + `:349-355` / `TemporalSpread.ts:126-128`, `:133-138` | `renderMillisecondsModifiersToMap` `:488-493` / **`Performance.ts:886-890`** (the live copy) and `OrnamentationMap.ts:429-434` (the unreachable twin) |
| `ornament.milliseconds.duration` | `:342` + `:365-378` / `TemporalSpread.ts:127`, `:146-165` | `:496-502` / `Performance.ts:894-904` and `OrnamentationMap.ts:437-446` |
| `ornament.noteoff.shift` | `:361-364` (**`True` only**) / `TemporalSpread.ts:142-145` | tick pass `:455` / `OrnamentationMap.ts:365`; ms pass `:504` / `Performance.ts:906` and `OrnamentationMap.ts:449` |

Attributes these passes mutate but do not own: `velocity`, `date.perf`, `duration.perf`,
`date.end.perf` (tick pass) and `milliseconds.date`, `milliseconds.date.end` (ms pass).

Because the TS millisecond pass exists twice (§5.3 item 3) and the pipeline calls the
`Performance.ts` copy, **every ms-domain attribute name above has two read sites in TS and one in
Java.** Any v3 rename must touch both.
