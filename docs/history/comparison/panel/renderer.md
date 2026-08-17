# W1 panel — RENDERER FIDELITY lens

Prosecuting DESIGN.md §1 ("Every expressive dimension is evaluated into the function over
score time that **the renderer would perform**") against `src/mpm/elements/maps/**` and
`src/expression/**`. Every finding below was read in the source AND executed against the
shipped renderer; the transcripts quoted are real output, not reasoning.

Severity key — **CAPITAL**: the design as written computes a function the renderer
demonstrably does not perform, on documents that exist in this repository's corpus.
**MAJOR**: disagreement on plausible documents, or a §5 rule that is unimplementable /
unstated as given. **MINOR**: imprecision that will bite a W2 implementer.

Verification harness: `vite-node` probes constructing the real map classes from XML and
calling the real `render*ToMap` / `get*At` entry points. Kept out of the repo (scratchpad);
every probe is reproducible from the code excerpts cited.

---

## CAPITAL

### R1 — A transition on the LAST instruction of a map is not performed at all

> §5.1 "Piecewise per instruction span: constant, or the renderer's power transition
> `bpm₀ + (bpm₁−bpm₀)·u^e`"
> §5.3 "constant instructions and cubic-Bézier transitions"
> §5.0 "Refinement grid. Sorted union of both documents' breakpoints … instruction dates,
> **transition ends** …"

**Code.** `TempoMap.getEndDate` (`TempoMap.ts:166-175`) returns `Number.MAX_VALUE` when no
later `<tempo>` exists. `DynamicsMap.getEndDate` (`DynamicsMap.ts:187-193`) and
`MovementMap.getEndDate` (`MovementMap.ts:153-159`) do the same. `getTempoAtStatic`
(`TempoMap.ts:217`) then computes `u = (date − startDate) / (1.797e308 − startDate)`, so
`u^e ≈ 0` and the tempo stays pinned at `bpm₀` for every date in any real window;
`DynamicsData.getTForDate` → `tForDate` (`bezier.ts:57-78`) with `s = 1.797e308` returns
`t ≈ 1e-153`, and `(3−2t)t²Δ + volume` is `volume` to the last bit.

**Executed.**

```
--- E1: trailing transition, no closing instruction ---     (bpm 60 → transition.to 120)
  date 180 -> bpm 60      date 360 -> bpm 60      date 540 -> bpm 60
--- E1b: same, WITH a closing instruction at 720 ---
  date 180 -> bpm 75      date 360 -> bpm 90      date 540 -> bpm 105
--- D1: trailing dynamics transition ---                     (volume 40 → transition.to 100)
  WITHOUT closing instruction -> velocities: [ '40', '40', '40', '40' ]
  with    closing instruction -> velocities: [ '40', '54.98…', '70', '85.01…' ]
```

**Real corpus data.** `tests/integration/fixtures/all-maps-reference/all_maps.mpm` ends
both maps exactly this way:

```xml
<tempo    date="2880.0" bpm="120" transition.to="90"  beatLength="0.25" meanTempoAt="0.5"/>
<dynamics date="2880.0" volume="80" transition.to="110" curvature="0.0" protraction="0.0"/>
```

Both are the last entry of their map. The reference-rendered ground truth
`all_maps_augmented.msm` carries velocities 82.3 / 83.2 / 78.7 / 79.6 for the notes at
2880 / 3600 / 4320 / 5040 — scattered around the constant 80 by imprecision, nowhere near
a ramp to 110. §5.1/§5.3 as written would compute a ritardando 120→90 and a crescendo
80→110 across the entire tail of this document. That is the design's headline dimension
inventing the single most audible gesture in the file.

**Repair.** State the rule explicitly: *an instruction whose span has no successor is
performed as a constant at its own `bpm`/`volume`/`position`; its `@transition.to`,
`@meanTempoAt`, `@curvature`, `@protraction` are inert and must be reported as an inert
difference (R9b), never as curve shape.* The refinement grid must NOT insert a synthetic
transition end at the window end. Add a fixture pair differing only in a trailing
`@transition.to` and pin `d_tempo = 0` with an inert-difference note.

---

### R2 — R8 excludes exactly the span the renderer performs at a definite, computable value

> R8 "an unresolvable level is reported and its span EXCLUDED from that dimension's
> density (both sides, symmetric exclusion — **never a fabricated 100.0**)"

**Code.** `TempoStyle.getNumericBpmValueStatic` (`TempoStyle.ts:49-58`) and
`DynamicsStyle.getNumericValueStatic` (`DynamicsStyle.ts:49-57`) both end:

```ts
const val = parseFloat(tempoString);
if (!isNaN(val)) return val;
console.error(`Failed to convert tempo string … No tempoDef, no number format.`);
return 100.0;
```

The renderer *literally fabricates 100.0*. The parenthetical in R8 is not merely a
different policy from the renderer's — it names the renderer's actual behaviour and
forbids it.

**Executed.**

```
--- E2: unresolvable bpm style name (no styleDef) ---
  bpm="Allegro" at 100 -> 100
  bpm="?"       at 100 -> 100          ← MEI's placeholder, named in styleScope.ts:30
  bpm="120bpm"  at 100 -> 120          ← parseFloat leniency, correctly mirrored by styleScope
```

**Disagreement scenario.** A is a Welte/MEI export carrying `volume="?"` (or `bpm="+"`,
`"-"`); B spells the same passage `volume="100"`. The renderer performs the two
*identically* (velocity 100 both sides). The design excludes the span on both sides,
reports an asymmetry note, and silently drops real comparable length from `d_dynamics`.
The converse is worse: A `volume="?"` (performs 100) vs B `volume="40"` is a 1.4-neper
difference the audience hears plainly, and the design reports it as excluded.

Note the provenance of the rule: `src/expression/styleScope.ts:25-30` states the 100.0
refusal, and it is *correct there* — a write transform must not invent a level the author
never wrote. A read/compare module has the opposite obligation. Inheriting the expression
rationale verbatim (SURVEY R8 "[Rationale: fabricating the renderer default invents
differences]") imports a write-side constraint into a read-side product.

**Repair.** For the comparison module, `unresolvable` resolves to the renderer's own
constant — 100.0 qbpm-of-`beatLength·4` for tempo, velocity 100.0 for dynamics — and is
reported as a `renderer-default-level` note carrying the span length, NOT excluded.
Keep exclusion only where the renderer genuinely has no value to perform (R21 below).
If the panel prefers to keep exclusion, §1's "the function the renderer would perform"
must be downgraded to "the function the document determines", and the report must say so.

---

### R3 — `<rubato>` `@loop` is absent by default, and the design's warp assumes it is always on

> §5.2 "within each frame of length `frameLength` from the instruction's date, `δ = …`,
> `τ = (t − t₀) mod frameLength`. Frame boundaries join the refinement grid."
> §4 exclusions: "enums and **booleans** … equality checked, difference = structural
> finding, since no meaningful magnitude exists"

**Code.** `RubatoData.loop = false` (`RubatoData.ts:37`) is the default;
`RubatoMap.getRubatoDataOf` only overwrites it when the attribute is present
(`RubatoMap.ts:124-125`). `renderRubatoToMap` then breaks out of the span at the first
frame boundary when `loop` is off (`RubatoMap.ts:199-203`):

```ts
if (mapEntry.getKey() >= rd.endDate! ||
    (!rd.loop && mapEntry.getKey() >= rd.startDate + rd.frameLength!)) break;
```

The `mod` in the design's formula is exactly the repetition `loop` controls. With `loop`
off, the warp applies to `[t₀, t₀+frameLength)` and the remainder of the span is the
identity.

**Executed** (frameLength 360, intensity 2, span 0..1440, notes at 0/180/360/540/720/900):

```
  loop absent  -> [ 0, 90, 360, 540, 720, 900 ]     ← only the first frame warped
  loop="true"  -> [ 0, 90, 360, 450, 720, 810 ]
```

**Real corpus data.** `tests/**` contains `<rubato date="0.0" frameLength="720.0"
lateStart="0.25" earlyEnd="0.75"/>` — no `@loop` — and `<rubato id="r1" date="0.0"
intensity="1.5" loop="false"/>`. Under §5.2 the first of these produces a cyclic
displacement across its whole span; the renderer warps 720 ticks and stops.

Compounding it, §4 routes `loop` to the boolean-exclusion bucket ("no meaningful magnitude
exists"). `@loop` is the single most consequential attribute on a `<rubato>` after
`@frameLength`: flipping it changes the performed displacement on every frame but the
first. Filing it as a structural finding means two documents differing only in `@loop`
score `d_rubato = 0`.

**Repair.** `@loop` enters the rubato curve evaluator as a first-class parameter
(`δ ≡ 0` outside `[t₀, t₀+frameLength)` when off). The same applies to
`accentuationPattern/@loop` (`MetricalAccentuationMap.ts:157-161`, same `break` shape) and
therefore to §5.4. Move both out of §4's boolean bucket; the bucket is only sound for
booleans the renderer does not read (there are none in this list — see also R18).

---

### R4 — Inline `<articulation>` duration attributes do not compose; the design sums them

> §5.5 "matched atoms contribute `Σ_rows |T(x_A) − T(x_B)|/jnd_row`"
> §5.5 "Rows and spaces: relative factors in log-around-1 (nepers),
> `absoluteDurationChange` (quarters, ppqSensitive) …"

**Code.** `ArticulationData.articulateNote` (`ArticulationData.ts` — the `duration.perf`
block) reads `duration` ONCE up front and every branch computes from that original value,
overwriting the previous branch's write. The class doc says so in as many words:

> "`duration` is read once, up front, and every branch computes from that original value
> rather than from what the previous branch wrote — so `absoluteDuration`,
> `relativeDuration` and `absoluteDurationChange` do not compose, the last one to fire
> simply overwrites."

`absoluteDurationMs` short-circuits the entire tick branch. The expression registry
already encodes the resulting precedence (`registry.ts`, `INLINE_DURATION_PRECEDENCE`):
`absoluteDurationChange > relativeDuration > absoluteDuration`, **"On `<articulationDef>`
they DO compose, so this rule is keyed on the element, never on the attribute name."**

**Executed** (note `duration.perf="90"`):

```
<articulation date="0"   relativeDuration="0.5" absoluteDurationChange="10"/>  -> 100
<articulation date="180" relativeDuration="0.5"/>                              ->  45
```

`relativeDuration="0.5"` on the first note is **entirely inert** — 90+10 = 100, not 45+10.

**Disagreement scenario.** A: `<articulation relativeDuration="0.5"
absoluteDurationChange="10"/>`. B: `<articulation relativeDuration="0.9"
absoluteDurationChange="10"/>`. Both perform duration 100. The design charges
`|ln 0.5 − ln 0.9| / jnd_relDur` ≈ 0.59 nepers of deviation for a difference no listener
can hear because the renderer never applies either factor.

**Repair.** §5.5 must resolve the *effective* duration modifier per atom before pricing:
on an inline `<articulation>`, exactly one of the three tick rows is live (by the registry's
own precedence, and none at all when `absoluteDurationMs` is present); on an
`<articulationDef>` all of them compose. The comparison registry needs an element-keyed
"live row" resolution step, not a flat `Σ_rows`. This is R9's inert-row machinery applied
*conditionally*, which the current R9 text does not admit ("an explicitly inert row
(renderer provably ignores it)" is stated as a static property of a row).

---

### R5 — `defaultArticulation` and explicit articulations are mutually exclusive; the design adds them

> §5.5 "every row's profile **is a step function** (styled, date-governed defaults via
> `defaultArticulation` + styleScope) **or an atom** (instruction targeting a date /
> `noteid.ref`)"

**Code.** `ArticulationMap.renderArticulationToMap_noMillisecondModifiers`
(`ArticulationMap.ts:262-284`):

```ts
const artics = noteArtics.get(mapEntry.getValue());
if (artics !== undefined) { for (const artic of artics) …; continue; }   // ← continue
// otherwise apply the default articulation
```

The class doc states it: *"a note with explicit articulations gets those and **only**
those — the default is deliberately not also applied"*.

**Executed** (style `defaultArticulation="stacc"` ×0.5, explicit `ten` ×1.2 at date 360,
notes of duration 100 at 0/360/720):

```
  durations -> [ '50', '120', '50' ]
```

The note at 360 is 120, not 60. The default is suppressed, not composed.

**Disagreement scenario.** Any document with both a `defaultArticulation` and explicit
articulations — the ordinary case. The design's model is `profile = step(t) ⊕ atoms`; the
renderer's is `profile(t) = atoms(t) where atoms exist, else step(t)`. At every atom date
the design double-charges: it prices the step-function difference *and* the atom
difference on notes where only the atom is performed. `d_articulation` is inflated by the
default's whole contribution at exactly the dates the composer bothered to mark.

Two further mechanics of the same block the design does not model:
`defaultArticulations` is built from style switches whose `styleDef` resolves
(`ArticulationMap.ts:231-236`, `if (aStyle === null) continue;` — an unresolvable style
switch leaves the *previous* default in force), and a style switch carrying **no**
`@defaultArticulation` pushes a `null` that **cancels** the default from that date
(`ArticulationMap.ts:239-243`).

**Repair.** §5.5 evaluates one articulation profile per part as a single function:
`atoms` shadow the styled default at their own dates (all notes at that date for a
date-targeted instruction; the referenced note only for a `noteid` one). The default's
step function is defined by the resolved style-switch list including its cancel-to-null
entries.

---

### R6 — A renderer-skipped tempo instruction does not "contribute nothing"; it re-times the following span at 100 qbpm

> §5.1 "A tempo instruction the renderer would skip contributes nothing and is reported
> (A-B2)."
> §6.2 "inserting a renderer-skipped or no-op instruction costs exactly 0 and is marked
> `free`"

**Mechanism, precisely** (the brief asked): `TempoMap.getTempoDataOf` returns `null` iff
`@bpm` is absent (`TempoMap.ts:118-119`) **or** `@beatLength` is absent
(`TempoMap.ts:120-121`). So survey-code's "no `@beatLength` ⇒ skipped" names the right
line. But `getEndDate` (`TempoMap.ts:166-175`) scans for the next element whose local name
is `tempo` **regardless of whether it parses**, so the skipped instruction still
terminates the previous span. `renderTempoToMap` then `continue`s past it
(`TempoMap.ts:277-278`), and the next valid instruction's inner loop hits
`TempoMap.ts:297-298`:

```ts
if (mapEntry.getKey() <= td.startDate)
  milliseconds = TempoMap.computeDiffTiming(date, ppq, null);   // = 600·date/ppq
```

— every note between the skipped instruction and the next valid one is timed at the
no-tempo default of 100 quarter-bpm, **as an absolute time from zero**, with no
`startDateMilliseconds` accumulation.

**Executed** (ppq 360; instructions at 0 `bpm=60 beatLength=0.25`, 720 `bpm=180` **no
beatLength**, 1440 `bpm=60 beatLength=0.25`; notes at 0/360/720/1080/1440):

```
  ms dates: [ '0', '1000', '2000', '1800', '2400' ]
  (a pure 60bpm map would give 0,1000,2000,3000,4000)
```

The performance goes **backwards**: the note at tick 1080 sounds 200 ms *before* the note
at tick 720. The skipped instruction contributes an enormous, audible, non-monotonic
timing artifact.

The same mechanism gives the rule for **before the first tempo instruction**:

```
--- T2: notes BEFORE the first tempo instruction (first <tempo> at date 720) ---
  ms dates: [ '0', '600', '1200', '2200' ]   ← 600 ms/quarter = 100 qbpm on [0, 720)
```

**Repair.** §5.1's skip rule becomes: a skipped `<tempo>` ends the preceding instruction's
span and the interval `[skipDate, nextValidDate)` is performed at 100 qbpm. The same
constant governs `[0, firstValidTempoDate)`. Both must be in the curve and in the
refinement grid. §6.2's "inserting a renderer-skipped instruction costs exactly 0" is
false and its `free` test will fail; the correct statement is that inserting one costs the
area between the previous tempo and 100 qbpm over the orphaned span.

(`DynamicsMap` has the mirror-image rule with a different constant: notes before the
current instruction get a flat `velocity="100.0"`, `DynamicsMap.ts:251-253`.)

---

### R7 — Triangular and uniform imprecision without their clip/limit attributes is a total no-op

> §5.9 "uniform `[lower,upper]`, … triangular (lower, upper, mode) **clipped** (atoms at
> clip values, handled natively by the quantile representation)"
> §5.9 "Headline density: `W₁(law_A(t), law_B(t)) / jnd` per span"

**Code.** `DistributionData` leaves every numeric field `null` when its attribute is absent
(`DistributionData.ts:37-47` initializers; the constructor only assigns on presence).
`ImprecisionMap.renderImprecisionToMap` passes them straight through
(`ImprecisionMap.ts:309-317`) into `RandomNumberProvider`, whose `clip`
(`RandomNumberProvider.ts:~334`) is

```ts
private clip(d: number): number {
  if (d > this.highCut) return this.highCut;      // highCut is null → d > 0 → returns null
  if (d < this.lowCut) return this.lowCut;
  return d;
}
```

and whose uniform draw is `nextRandom() * (upperLimit − lowerLimit) + lowerLimit` = 0 when
both are null. There is **no default** for `limit.*`, `clip.*`, `deviation.standard` or
`mode` anywhere in the read path.

**Executed** (timing domain, notes at ms 0/300/600/900):

```
--- I1: triangular, limit.lower=-30 limit.upper=30 mode=0 ---
  clips ABSENT  -> ms: [ '0', '300', '600', '900' ]                    ← no imprecision at all
  clips present -> ms: [ '3.20…', '300.81…', '591.21…', '900.02…' ]
--- I2 ---
  uniform  with no limits    -> ms: [ '0', '300', '600', '900' ]       ← no-op
  gaussian with no limits    -> ms: [ '2.10…', '290.15…', '608.99…' ]  ← UNtruncated N(0,σ)
```

The three families degrade three different ways: uniform to a point mass at 0, triangular
to a point mass at 0 (the clip swallows every draw), gaussian to the *untruncated* law
(rejection never accepts, the 10 000-attempt escape hatch at
`RandomNumberProvider.ts:~316` breaks and returns a plain draw).

**Disagreement scenario.** A carries `<distribution.triangular limit.lower="-30"
limit.upper="30" mode="0"/>`, B carries `<distribution.triangular limit.lower="-5"
limit.upper="5" mode="0"/>`; neither has clips. The renderer performs both as *no
imprecision whatsoever* — identical performances. The design computes
`W₁(Tri(−30,30,0), Tri(−5,5,0)) ≈ 8.3 ms` of density across the whole span.

**Repair.** §5.9 gains an explicit degenerate table keyed on which attributes are present:
absent `limit.*` ⇒ uniform/brownian collapse to δ₀; absent `clip.*` ⇒ triangular /
compensatingTriangle collapse to δ₀; absent `limit.*` on gaussian ⇒ the untruncated law;
absent `deviation.standard` ⇒ δ₀. Each is a *law*, so the W₁/W₂ machinery handles it —
this is a reading rule, not new math. (Flag for the conductor: these collapses arise from
`null` flowing into `number` fields, which may be a port artifact relative to Java's
primitives. It is nonetheless what *this* renderer performs, which is what §1 promises.)

---

### R8 — Metrical accentuation phase is anchored at the time signature, not the instruction; and the MSM-less case is exactly computable

> §5.4 "Without an MSM: **beat positions inside a pattern cycle are well-defined relative
> to the instruction's own cycle**; both sides' patterns are compared over the lcm of
> their cycle lengths and **the mean per-beat |Δ| spreads uniformly over the governed
> span** — documented as the MSM-less approximation … flagged in the report
> (`beatsExact: false`)."

**Code.** `MetricalAccentuationMap.renderMetricalAccentuationToMap`
(`MetricalAccentuationMap.ts:162-165`):

```ts
if (md.stickToMeasures)
  beat = 1.0 + ((mapEntry.getKey() - tsDate) % tickLengthOfOneMeasure) / ticksPerBeat;
else beat = 1.0 + ((mapEntry.getKey() - tsDate) % patternLengthTicks) / ticksPerBeat;
```

Both branches subtract **`tsDate`**, the date of the time-signature entry in force — never
`md.startDate`. With no `timeSignatureMap` the initialisers at
`MetricalAccentuationMap.ts:124-129` give `tsDate = 0, 4/4, ticksPerBeat = ppq,
measure = 4·ppq`, and `patternLengthTicks = length·4·ppq/denominator`
(`MetricalAccentuationMap.ts:134`). `stickToMeasures` defaults to **true**
(`MetricalAccentuationData.ts:31`).

**Executed** (pattern P, length 4, values 10/0/5/0 on beats 1..4, scale 1, ppq 360,
**no `timeSignatureMap` at all**, notes at 360/720/1080/1440 with velocity 64):

```
  instruction at date 0   -> velocities: [ '64', '69', '64', '74' ]
  instruction at date 360 -> velocities: [ '64', '69', '64', '74' ]     ← identical
```

Two things fall out. (a) Moving the instruction by a beat changes nothing — the phase is
the barline's, not the instruction's, so the design's stated basis for the MSM-less
approximation is factually wrong. (b) The renderer's answer without any time-signature
information is **completely determined** (4/4 from date 0): the per-date accentuation
contribution is `scale · patternDef.getAccentuationAt(1 + (t mod 4·ppq)/ppq)`, an exact
piecewise-linear function of score time. The design invents a lossy "mean |Δ| spread
uniformly" approximation, and a `beatsExact: false` flag, for a case the renderer answers
exactly.

Worse for the metric: two documents whose patterns are identical but whose instructions
sit at different dates perform **identically** (same phase), yet §5.4's per-instruction
cycle model would give them different phases and a nonzero `d_accentuation`.

**Repair.** §5.4 drops the approximation. Without an MSM, evaluate the exact renderer
default (`tsDate = 0`, 4/4, `ticksPerBeat = ppq`, `patternLengthTicks =
length·4·ppq/denominator`) and report `timeSignatureSource: 'renderer-default'`. With an
MSM, walk the real `timeSignatureMap` with the same forward-only rule
(`MetricalAccentuationMap.ts:140-155`), recomputing `ticksPerBeat`, measure length and
`patternLengthTicks` at each change. Honour `@stickToMeasures` (default **true**) and
`@loop` (default **false**, see R3). The pattern's own interpolation must be
`AccentuationPatternDef.getAccentuationAt` verbatim, including the deliberate segment-end
asymmetry documented at `AccentuationPatternDef.ts` (`getAccentuationAt`'s doc block):
`i < length−1` ⇒ segment ends at the next accentuation's beat; the **last** accentuation's
segment runs to `length + 1.0`. Also: value 0 before the first accentuation; `transition.to`
at/after `length + 1.0`; exact `value` on an accentuation's own beat.

---

### R9 — `movementMap` spans are not per-controller, and the last movement is never rendered

> §5.8 "Position curve on [0,1] **per controller** via the shared Bézier machinery;
> controllers matched by name/number, mismatch = structural finding."

**Code.** `MovementMap.getEndDate` (`MovementMap.ts:153-159`) scans for the next element
whose local name is `movement` — with **no `@controller` test**. `renderMovementToMap`
(`MovementMap.ts:174-183`) iterates the map flat and renders
`movementIndex < this.size() - 1` only:

```ts
if (movementMap !== null && movementIndex < this.size() - 1 && md.startDate >= 0)
  MovementMap.generateMovement(md, movementMap, ctx);
```

**Executed** (`sustain` at 0 → 1, `soft` at 360 → 0, `sustain` at 720):

```
  sustain md endDate -> 360        ← the SOFT movement's date terminates the sustain span
  curvature          -> 0.4
  total position events: 34
  single-movement map -> positionMap size: 0
```

**Disagreement scenario.** A encodes sustain and soft pedal interleaved in one
`movementMap` (the natural encoding — one map, `@controller` distinguishes them); B
encodes only sustain with the same values. In A the renderer truncates every sustain
transition at the next *soft* event; the design evaluates two independent per-controller
curves and computes a sustain curve A never performs. Separately, a `movementMap` with a
single `<movement>` renders **zero** controller events, and the last movement of any map is
never a performed span — the same class of error as R1 but total rather than partial.

**Repair.** §5.8 evaluates the movement curve on the map's *flat* span structure (next
`<movement>` of any controller), tagging each span with its own `@controller`; the last
entry contributes no span. Two further reading rules belong in §5.8, all in
`MovementMap.getMovementDataOf` / `MovementData`:
`@curvature` defaults to **0.4** (`MovementData.ts:29`) — *not* 0.0 as in `DynamicsData`
(`DynamicsData.ts:39-40`, defaulted lazily to 0.0 in
`computeInnerControlPointsXPositions`), so §5.8's "shared Bézier machinery" must not share
a default; a `<movement>` with no `@position` inherits the previous movement's
`@transition.to`, and the inheritance loop is `j > 0` so entry 0 is never examined and the
inherited value is 0 (`MovementMap.getPreviousPosition`, PARITY-noted as deliberate); a
movement whose predecessor has no `@transition.to` is **skipped entirely**; movements at
negative dates are skipped.

---

## MAJOR

### R10 — The tempo degenerate-collapse list loses *which* constant is performed

> §5.1 "with the renderer's degenerate-case collapses to constant (missing/equal
> `transition.to`, `meanTempoAt ∉ (0,1)`) transliterated exactly (TempoMap.ts:137-158,
> 213-223)"

The citation is right; the prose is not. `TempoMap.ts:144-151` distinguishes two
directions:

```ts
if (td.meanTempoAt <= 0.0) { td.bpm = td.transitionTo; td.transitionTo = null; }  // → the TARGET
else if (td.meanTempoAt >= 1.0) { td.transitionTo = null; }                       // → the SOURCE
```

Executed: `bpm=60 transition.to=120 meanTempoAt="0"` performs a constant **120**;
`meanTempoAt="1"` performs a constant **60**. "Collapses to constant" implemented as
"drop the transition, keep `bpm`" is wrong on half of the cases, by a factor of 2 in this
example.

Two more items missing from the same list: `@meanTempoAt` **absent** with a differing
`@transition.to` is a real transition with `meanTempoAt = 0.5, exponent = 1.0` — a linear
ramp (`TempoMap.ts:155-158`), consistent with the design's `e = ln0.5/ln(mta)` but worth
stating since it is written as a direct assignment; and `@bpm`/`@beatLength` absent is a
*skip*, not a collapse (R6).

**Repair.** Replace the parenthetical with the four-case table:
equal `transition.to` ⇒ constant at `bpm`; `meanTempoAt ≤ 0` ⇒ constant at
`transition.to`; `meanTempoAt ≥ 1` ⇒ constant at `bpm`; `meanTempoAt` absent ⇒ linear
ramp. Pin each with a fixture.

---

### R11 — The region before the first instruction is the renderer's default, not the first instruction's value

Covered mechanically in R6. §5.0's only continuity rule is "Curve reading is
right-continuous … the value at an instruction's date is that instruction's value", which
says nothing about `[0, firstInstructionDate)`. A left-extension of the first instruction
— the obvious implementation — disagrees with the renderer whenever the first `<tempo>` or
`<dynamics>` is not at date 0. Confirmed: 600 ms/quarter (100 qbpm) before the first
tempo, `velocity="100.0"` before the first dynamics (`DynamicsMap.ts:251-253`).

**Repair.** State the pre-first-instruction constants per dimension in §5.0 and make them
part of the neutral curve definition in R6 (which currently only covers a *wholly absent*
map).

---

### R12 — Imprecision spans are ended by ANY map entry, and the design's grid does not know it

> §5.0 "Refinement grid. Sorted union of both documents' breakpoints for the dimension
> (instruction dates, transition ends, rubato frame boundaries …, **imprecision span
> edges**)"
> §5.9 "piecewise constant over **instruction spans**"

`ImprecisionMap.getDistributionDataOf` (`ImprecisionMap.ts:206-216`) is the one map whose
end date is the immediately following entry *whatever it is* — its own doc says
"A distribution is therefore ended by any element in the map, not only by another
distribution." Every other map (`TempoMap.ts:166-175`, `DynamicsMap.ts:187-193`,
`RubatoMap.ts:145-150`, `MetricalAccentuationMap.ts:92-98`, `MovementMap.ts:153-159`)
scans for its own local name.

Executed: with `distribution.uniform` at 0, a `<style>` at 360 and another distribution at
1080, `getDistributionDataOf(0).endDate === 360`, and the notes at 360 and 720 are
**unperturbed** — a real gap with no law at all, not a continuation.

**Repair.** §5.9's span structure reads the imprecision map's *entry* list, not its
distribution list, and inserts a δ₀ (no-imprecision) span for every gap. Say explicitly in
§5.0 that "an instruction governs until the next" resolves per map type — same-local-name
for six maps, next-entry-of-any-kind for imprecision — and that `<style>` switches never
terminate a span in the six.

---

### R13 — `milliseconds.timingBasis` mismatch is not a reason to exclude an i.i.d. span

> §5.9 "`milliseconds.timingBasis` mismatch between the sides: structural finding, span
> excluded (no common basis to compare in)."

`timingBasis` enters only as `index = msDate / dd.millisecondsTimingBasis` handed to
`RandomNumberProvider.getValue(index)` (`ImprecisionMap.ts:398-401` and the three parallel
branches). For `uniform`, `gaussian`, `triangular` and `list` the provider's draws are
i.i.d. along the index (`RandomNumberProvider.nextDouble`), so `timingBasis` changes
*which* pseudorandom value a given note gets — a per-render artifact the design already
refuses to model (R2 determinism, "imprecision maps are compared analytically, never by
sampling") — and leaves the **marginal law identical**. Excluding the span discards
comparable content and, since the exclusion is symmetric, distorts both documents.

For `correlated.brownianNoise` / `correlated.compensatingTriangle` the basis genuinely sets
the step rate per unit time and a mismatch is real.

Also unstated: `timingBasis` absent is *derived* — from `upper−lower` (uniform / gaussian /
brownian), `upperClip−lowerClip` (both triangles), the list's range — **only in the timing
domain**, else 100.0, and 100.0 also when the derivation is ≤ 0
(`ImprecisionMap.ts:357-380`). So "absent on one side" is usually not a mismatch at all.

**Repair.** Make the rule family-dependent: i.i.d. families compare their marginals and
report the basis difference as an inert difference; correlated families keep the exclusion
(or fold the basis into the `processParameters` component §5.9 already defines).

---

### R14 — `detuneCents`/`detuneHz` get live comparison rows though the renderer provably ignores them

> §5.5 "The replacement attributes `absoluteDuration`/`absoluteVelocity` (**and
> `detuneCents`/`detuneHz`**) have NO neutral: present-vs-present compares `|Δ|` in native
> units; present-vs-absent is a structural finding"
> §3 "inert content: attributes the renderer provably ignores (imprecisionMap.tuning
> today)"

Two errors in one sentence. (a) They *do* have a neutral: `ArticulationData.detuneCents =
0.0` / `detuneHz = 0.0` are field initializers (`ArticulationData.ts`), and
`articulateNote` guards on `!== 0.0` — absent is exactly 0.0. (b) They are inert. Grepping
the whole of `src/` for consumers:

```
src/mpm/elements/maps/ArticulationMap.ts:147-148   ad.detuneCents/detuneHz  (read from XML)
src/expression/registry.ts:992-996                 "`@detuneCents` is written onto the MSM
                                                    note and read by nothing"
```

The attribute is written onto the note and never read again — the identical situation to
`tuning.offset`, which the design correctly classifies as inert (verified: the only
mentions of `tuning.offset` in `src/` are its writer `ImprecisionMap.ts:438-441` and two
comments in `expression/` saying nothing reads it).

**Repair.** Move `detuneCents`/`detuneHz` to the R9b inert-row bucket alongside
`imprecisionMap.tuning`, with the same "flips to a dimension if a future port renders it"
note. Remove them from the "no neutral" sentence, which should list only
`absoluteDuration`, `absoluteDurationMs` and `absoluteVelocity` — the three the expression
registry's `EXCLUDED_ARTICULATION_LEVERS` names for exactly this reason.

---

### R15 — `absoluteDurationChange` is nonlinear and conditional; the design prices it as a linear row

`ArticulationData.articulateNote` applies it only when `duration > 0.0`, and then halves
the change until the result is positive:

```ts
let durNew = duration + this.absoluteDurationChange;
for (let reduce = 2.0; durNew <= 0.0; reduce *= 2.0)
  durNew = duration + this.absoluteDurationChange / reduce;
```

Executed: duration 90, `absoluteDurationChange="-200"` ⇒ performed duration **40**
(90−200 ≤ 0; 90−100 ≤ 0; 90−50 = 40). Not −110, and not clamped to 0 either.

So the row's map from attribute to performed quantity is `x ↦ d + x/2^k` with `k` the
smallest exponent making it positive — piecewise, and *note-dependent*. A: −200 and
B: −150 both perform 40 on a 90-tick note (90−150/2 = 15 — no: 90−75 = 15; different).
The point stands the other way: A: −200 (⇒ 40) vs B: −110 (⇒ 90−55 = 35) is a 5-tick
difference, while §5.5 charges `|−200 − (−110)| = 90` quarters-worth of deviation.

**Repair.** Either price the row on its raw value and *say* it is a document-level rather
than performed quantity, or (better, and R7-consistent) refine it against the note's real
duration when an MSM is supplied — the design already has the R7 three-state hook for
exactly this ("with MSM: refined to a real magnitude against the note's own duration").
Note the negative branch cannot be refined without the MSM at all, since `k` depends on
the note.

---

### R16 — `noteid`-targeted articulations are attached to a note, not to a date

> §5.5 "an atom (instruction targeting a date / **`noteid.ref`**)"
> §5.5 "Atoms match by `noteid.ref` when both sides carry ids …, else positionally by date"

Three corrections. (a) The attribute is `noteid`, not `noteid.ref`
(`ArticulationData.ts` constructor; `ArticulationMap.ts:117-118`) — relevant because §4's
exclusion list covers "`xml:id`/`*.ref`" and would not catch it in the R9 inventory walk.
(b) Its value has its **first character stripped unconditionally**
(`ArticulationMap.ts:118`, `nidAtt.getValue().substring(1)` — it assumes `#id`), so a
`noteid` written without `#` silently loses a character and matches nothing. (c) The atom
lands on the *note*, wherever the note is, not at the instruction's `@date`
(`ArticulationMap.ts:199-205`): a date mismatch is a `console.error` warning and the
articulation is applied anyway; and if the id resolves to nothing the instruction is
**dropped entirely** (`if (index < 0) continue;`).

Consequence for §5.5: without an MSM the module cannot know whether a `noteid` atom is
performed at all, nor at what date. The design's atom-at-`@date` model is therefore only
correct for date-targeted instructions.

**Repair.** Split the two atom kinds in §5.5. Date-targeted: an atom at `@date` applying to
all notes there (`map.getAllElementsAt(ad.date)`, exact equality). `noteid`-targeted:
without an MSM, compare by id and report `datePositionKnown: false`; with an MSM, place
the atom at the referenced note's date and drop unresolvable ids (matching the renderer).

---

### R17 — `subNoteDynamics` switches the rendering *mechanism*, and is ignored on the last instruction

> §3 "`dynamics` … sub-note dynamics = what the renderer computes"
> §4 exclusions: booleans ⇒ structural finding

`DynamicsMap.renderDynamicsToMap:223`:

```ts
if (dd.subNoteDynamics && dynamicsIndex < this.size() - 1) { … }
```

On a sub-note span every note is pinned to `velocity="100.0"` and the shape is emitted as
a **channel-volume (CC 7) curve** (`DynamicsMap.ts:225-232`, `generateSubNoteDynamics`);
on an ordinary span the shape is carried by per-note velocity and CC 7 is pinned to 100.
Two documents with identical `volume`/`transition.to`/`curvature` and differing only in
`@subNoteDynamics` are, under §5.3's date-axis curve, distance 0 — but they drive two
different MIDI mechanisms with different time resolution (continuous vs one sample per
note onset) and different timbral behaviour. And on the **last** instruction the attribute
is inert regardless of its value (same `size()-1` guard as R1/R9).

Also unmodelled: on a sub-note span, notes *before* `dd.startDate` are `continue`d rather
than given the 100.0 default (`DynamicsMap.ts:228-229`), so a leading sub-note instruction
leaves earlier notes with **no `velocity` attribute at all**.

**Repair.** §5.3 states the mechanism switch, prices it as a structural finding *with a
rationale* (not as a generic boolean), and marks `@subNoteDynamics` inert on a map's last
instruction. Add `curvature`/`protraction` defaults explicitly: both **0.0** for
`<dynamics>` (`DynamicsData.computeInnerControlPointsXPositions`), read only in the
transition branch (`DynamicsMap.ts:170-181`) and clamped to `[0,1]` / `[−1,1]` on the way
in (`DynamicsMap.clampCurvature`/`clampProtraction`) — cf. R9's 0.4 for `<movement>`.

---

### R18 — `%`-domain v3 temporal values have no magnitude in quarters or ms

> §5.6 "`temporalSpread@frame.start`/`@frameLength` as the geometric pair **in quarters or
> ms per v3 unit via TemporalValue**"

`TemporalValue`'s domains are `ticks | milliseconds | relative`, with `%` ⇒ `relative`
(`src/expression/temporalValue.ts:52-59, 121`), and the port's own note says resolving a
relative value "against a principal note's duration is the renderer's job". A `%` frame has
**no** absolute length without the MSM note it ornaments. §5.6 offers only two units and
does not name the third, so a document pair mixing `frameLength="80%"` against
`frameLength="80ticks"` has no defined comparison and R7's three-state degradation is not
wired for it.

Also correct the attribute inventory while here: the v3 frame attributes are
`frame.offset`, `frame.start`, `frameLength`, `time.unit`
(`src/expression/registry.ts:932-943`) — §5.6 names two of the four.

**Repair.** §5.6 gains a third unit case: relative values compare against each other in
percent (a genuine common unit), and relative-vs-absolute is a structural finding without
an MSM / resolved against the principal note's duration with one.

---

### R19 — `<ornament>` `@scale` defaults to 0.0, so a "gain" space has the wrong neutral

> §5.6 "`ornament@scale` velocity gain — a read row here despite being write-excluded in
> expression"

`DEFAULT_ORNAMENT_SCALE = 0.0` (`OrnamentationMap.ts:64`), `OrnamentData.scale = 0.0`
(`OrnamentData.ts:121`), and the doc at `OrnamentationMap.ts:59-61` is explicit: *"It is
`0.0`, not `1.0`: an `<ornament>` without a `scale` is specified to produce no dynamics
effect at all, which reads as a bug and is not one."* It reaches the renderer as
`gradient.apply(tempChordSequence, this.scale)` (`OrnamentData.ts:275, 300`).

A gain / log-around-1 space maps neutral to 1.0 and sends 0.0 to −∞. Whatever `@scale`'s
correct space is, `absent ≡ 0.0` must be its neutral, and R6's "absence is neutral" rule
must resolve to 0.0 here — not to the 1.0 that "gain" implies. Note also the writer/reader
asymmetry documented at `OrnamentationMap.ts:181-183`: the v2 writer omits `scale` when it
is 1.0 while every reader defaults a missing `scale` to 0.0, so a v2 round trip changes the
performed value. Any fixture the module derives by round-tripping is exposed to this.

**Repair.** Fix the neutral to 0.0 and re-derive the space from how `DynamicsGradient.apply`
consumes it (velocity-additive scaling, so a linear velocity-unit row, not a log gain).

---

### R20 — R3's ε ≈ 1e−12 is unreachable against the function §5.3 says to evaluate

> R3 "The *computed* values are ε-accurate quadrature evaluations of the defined objects
> (target relative ε ≈ 1e−12)"
> §5.3 "evaluated with `bezier.ts` (`tForDate` bisection **at the renderer's own 1-tick
> resolution**; nothing finer than a tick is meaningful, which bounds the grid from below)"
> §5.0 "Continuous cells are integrated by fixed-order Gauss–Legendre (order 10)"

`tForDate` (`bezier.ts:57-78`) is a fixed-start dyadic bisection that stops at
`Math.abs(diffX) >= 1.0` — a **1-tick tolerance in the x (date) domain**. Its output is a
dyadic rational, so `date ↦ t` is a staircase and `date ↦ volume` is a staircase with
treads of order one tick, not a smooth cubic. Gauss–Legendre of order 10 on a cell spanning
thousands of ticks integrates a function with thousands of jump discontinuities; its error
is O(tread height), nowhere near 1e−12, and refining the grid to tick resolution is exactly
what R10's scale budget forbids.

The design cannot have both: either evaluate the *ideal* Bézier (smooth, GL-10 converges,
ε achievable, agrees with the renderer only to within a tick horizontally) or evaluate
`tForDate` (bit-exact renderer agreement, ε meaningless). Pick one, say which, and state
the other as the documented approximation.

**Repair.** Recommend the ideal Bézier for the density, with `tForDate` reserved for the
`§6.3` replay and any bit-exactness claim, plus a stated bound on the divergence
(`|Δvolume| ≤ |v′(t)| · 1 tick / |x′(t)|`). Then R3's ε is a statement about the *defined*
object, which is what R3 already says it is — the contradiction is only in §5.3's
parenthetical.

---

### R21 — An unresolvable `accentuationPatternDef` name aborts the render

`MetricalAccentuationMap.getMetricalAccentuationDataOf` returns a non-null
`MetricalAccentuationData` with `accentuationPatternDef = null` when the style resolves but
the def name does not (`MetricalAccentuationMap.ts:84-88`), and the render then
dereferences it unguarded (`MetricalAccentuationMap.ts:134`):

```ts
let patternLengthTicks = (md.accentuationPatternDef!.getLength() * ppq4) / tsDenominator;
```

Executed: `TypeError: Cannot read properties of null (reading 'getLength')` — the whole
performance render throws.

Separately, `getMetricalAccentuationDataOf` returns `null` when **no `<style>` switch is in
scope** (`MetricalAccentuationMap.ts:89`), so an `accentuationPattern` before the map's
first `<style>` is silently skipped even with a perfectly good `name.ref`.

This is the one place R8's "unresolvable ⇒ report and exclude" is genuinely right — there
is no performed function to compare. But the design must say *which* unresolvables are
which: tempo/dynamics levels have a performed value (R2), accentuation patterns do not.

**Repair.** §5.4 excludes spans whose pattern name or style does not resolve, and reports
them as `renderer-error` (not merely `unresolvable`) since the renderer aborts rather than
degrades. §5.0's exclusion machinery gains that second cause.

---

### R22 — Maps shadow wholesale, style *defs* do not; §5.0 states only the first

> §5.0 "every dimension is evaluated per part after global/part map resolution (a
> part-local map replaces the global one wholesale, as the renderer does)"

**Verified correct for maps.** `Performance.resolvePartMaps` (`Performance.ts:603-632`) is
a per-field `(dated.getMap(X)) ?? globalMaps.X`. `Dated.getMap` returns the map object
whenever the element exists, so an **empty** part-local `<dynamicsMap/>` is non-null and
*does* shadow the global one wholesale — the design's word "wholesale" covers it, and a W2
fixture should pin it. A part with no MPM counterpart inherits the global set entire
(`Performance.ts:604`), and a part with no `<dated>` is skipped (`Performance.ts:574-575`).

**Not stated, and different.** `GenericMap.getStyle` (`GenericMap.ts:506-514`) falls back
local → global **per style name**:

```ts
if (this.getLocalHeader() !== null) style = localHeader.getStyleDef(styleType, styleName);
if (style === null && this.getGlobalHeader() !== null) style = globalHeader.getStyleDef(…);
```

So a part header declaring `styleDef name="A"` does not hide the global `styleDef
name="B"`; but a part header declaring `styleDef name="A"` hides the global `"A"`
**entirely**, defs and all, with no per-def merge. The expression layer implements exactly
this (`styleScope.findStyleDef`, `styleScope.ts:103-120`, candidates
`[environment, globalEnvironment]`, first hit wins whole), and its module doc spells the
consequence out (`styleScope.ts:8-15`). Since §5.5/§5.3/§5.1 all resolve through
`styleScope`, the behaviour is inherited correctly — but §5.0 currently reads as if one
resolution rule covers both, and a W2 implementer scanning headers directly (rather than
asking `resolveLevel`) will get it wrong. `levels.ts:38-46` documents that trap verbatim.

**Repair.** One sentence in §5.0 stating the two rules and requiring the styleScope route.

---

### R23 — A `<rubato>` with no `frameLength` is skipped but still terminates the previous span

`RubatoMap.getRubatoDataOf` returns `null` when neither the element nor a referenced
`rubatoDef` supplies `frameLength` (`RubatoMap.ts:120-123` — "without a frame there is
nothing to warp, so that case is a hard reject rather than a default"), verified. But
`getEndDate` (`RubatoMap.ts:145-150`) scans for the next `<rubato>` regardless of validity,
so the skipped element still ends the preceding instruction's span, leaving an unwarped
gap. §5.2's "Neutral: `δ ≡ 0`" covers the gap's *value* but the design never says a
skipped instruction creates one, and its refinement grid would not place a breakpoint
there.

Positively verified while here, and worth pinning as fixtures since §5.2 depends on them:
absent `@intensity`/`@lateStart`/`@earlyEnd` with no def fall back to
`RubatoData`'s initializers **1.0 / 0.0 / 1.0** (`RubatoData.ts:33-35`), i.e. the identity
warp — executed, dates unchanged. And the boundary clamps at `RubatoMap.ts:136-141`
(`lateStart` floored at 0, `earlyEnd` capped at 1, an inverted or empty window reset to the
full frame `0..1`) must be applied *before* the curve is evaluated, or `earlyEnd < lateStart`
documents compare as inverted warps the renderer never performs. §5.2's edit-path note
correctly prices `(lateStart, earlyEnd)` as L1 on the endpoints, but the *density* must use
the clamped pair.

---

### R24 — `<asynchrony>` with no `@milliseconds.offset` poisons its whole span with NaN

`AsynchronyMap.renderAsynchronyToMap` (`AsynchronyMap.ts:~73`) reads the offset with
`parseFloat(getAttributeValue('milliseconds.offset', asynElement))`, and
`getAttributeValue` returns `''` for a missing attribute (`src/xml/tree.ts:435-439`), so
the offset is `NaN`. It also takes `this.getElement(asynIndex)` with **no local-name test**
and computes `asynEndDate` from the next *entry* of any kind, so any non-`<asynchrony>`
dated child does the same.

Executed:

```
  ms: [ 'NaN', 'NaN', '1180', '1780' ]
```

Every note in the span gets `milliseconds.date="NaN"` and vanishes from the MIDI export.
§5.7 ("Per-part step curve of `milliseconds.offset`; density `|Δ|/jnd_asynchrony`") has no
rule for it: R6's "absence is neutral" covers an absent *map*, not a present instruction
with an absent offset. Treating it as 0 would compute a performance the renderer does not
produce.

**Repair.** §5.7 reports a `renderer-error` and excludes the span, on the R21 pattern.
Two more §5.7 mechanics to state: the shifted start is floored at 0 and the shifted end at
`startDateMs + 1` (`AsynchronyMap.ts` — "zero-length notes vanish from the MIDI output"),
so the offset is not a pure translation near the start of the piece or on very short notes.

---

### R25 — R10's scale budget is not satisfiable for looping rubato as §5.0 specifies the grid

> §5.0 "rubato frame boundaries **enumerated across the window**"
> R10 "maps up to ~5k instructions: O(n²) per pair … N up to ~100"

The frame-boundary count is `window / frameLength`, which no document attribute bounds.
`tests/**` carries `frameLength="720"` at ppq 720 (one boundary per quarter); a 20-minute
roll at 120 bpm is ~2 400 quarters, so ~2 400 boundaries — fine. But `frameLength="1"` is
legal and gives 1.7 M boundaries per instruction per part; with `N = 100` (4 950 pairs)
the grid alone is ~10^10 cells. R10's budget is expressed in *instructions*, and the
rubato grid is not a function of the instruction count.

R3 mitigates it: `@loop` is false by default (R3), and a non-looping instruction has
exactly **one** frame, hence one interior boundary. So the explosion is confined to
`loop="true"` instructions — which is precisely why R3 must be fixed first.

**Repair.** State the bound: boundaries per rubato instruction = 1 when `@loop` is off,
`min(⌈span/frameLength⌉, cap)` when on, with an explicit `cap` (and a reported
`gridTruncated` flag when it bites), or refuse `frameLength` below one tick as an
`InvalidOptionError`-class document finding.

---

## MINOR

### R26 — The declared imprecision law is not the per-note law inside a chord

`renderImprecisionToMap` is called with `shakePolyphonicPart = true` for part maps
(`Performance.ts` per-part path; `false` only for the global pedal map,
`Performance.ts:549-550`). `shakeOffsets` / `shakeTimingOffsets`
(`ImprecisionMap.ts:536-596`) keep one note of each simultaneity on its drawn offset and
re-roll the others through `shake` (`ImprecisionMap.ts:608-625`) — a triangular draw on
`[offset/2, offset]`, same sign, biased smaller — with same-pitch notes forced to share.
Both use bare `Math.random()`. So the marginal law actually performed by a chord member is
a mixture, not the declared law, and it depends on the MSM's simultaneity structure.

This does not break anything the design claims *as long as* §5.9 says it compares the
**declared** law rather than "what the renderer performs" (§1). Add the sentence.

### R27 — Right-continuity: the renderer's own accessors disagree with each other

§5.0/A-B1 says the divergence from "`TempoMap`'s strict-before reading" is measure zero.
Verified and true, but note there are three different conventions in play, and a W2
implementer will meet all of them: `TempoMap.getTempoDataAt` uses
`getElementIndexBefore` (strictly before — so `getTempoAt(0)` returns **100.0** even with a
`<tempo>` at date 0; executed, every E1/E3 row above shows it);
`DynamicsMap.getDynamicsDataAt` uses `getElementIndexBeforeAt` (at-or-before, i.e.
right-continuous); and `renderTempoToMap`'s span loop breaks on `key > td.endDate`, so a
note exactly on a boundary is timed by the **previous** instruction
(`TempoMap.ts:294`). For the *density* all three are measure zero. For **atoms** they are
not: §5.0 places articulation and ornament atoms at instruction dates, and which span an
atom's deviation is charged to under A-B1 must be fixed by one stated rule. Recommend:
atoms are charged to the span they open (right-continuous), matching the design's own
A-B1 choice, and say so where §5.0 introduces atoms rather than only where it introduces
curves.

### R28 — v3 generated notes: the design's claim is implementable, verified

> §5.6 "the *generated notes* are a render artifact with per-render random ids and are
> never compared"

Verified: note generation lives in `ornamentInstantiation.ts` / `OrnamentData.apply`, on
the render path only (`Performance.renderPartSymbolic`'s ornamentation pass); a pure reader
of the MPM text never sees them. The rule is well-posed as stated. Two additions for the
row inventory: `@repetitions` (`OrnamentData.ts:54-63` — `-1` is a documented meico
extension meaning "fill the frame", any other unusable value falls back to 0) and
`@note.order`, whose v2 flat form and v3 grammar are read by two different paths
(`OrnamentationMap.ts:278-283` vs `:305-306`, `noteOrderText`); neither appears in §5.6's
row list, and R9 requires every attribute to be a row, an inert row, or an enumerated
exclusion.

### R29 — Two naming/inventory nits that will fail the R9 walk

`@noteid` is not `*.ref` (R16a) and so escapes §4's `xml:id`/`*.ref` exclusion.
`accentuationPatternDef/@length` is mutated on parse — a missing `@length` is **added to
the element** with the default 4.0 (`AccentuationPatternDef.parseDataInternal`) — which is
harmless for a reader but means the attribute is never observably absent downstream; §5.4's
"cyclic over the pattern's `@length` beats" should state the 4.0 default explicitly rather
than relying on it.

---

## Verified-correct claims (recorded so the panel does not re-litigate them)

- **§5.0 map shadowing**: part-local maps replace global ones wholesale, empty ones
  included (`Performance.ts:603-632`). Style *defs* differ — see R22.
- **§5.9 tuning inertness**: `tuning.offset` is written by `ImprecisionMap.ts:438-441` and
  read by nothing in `src/`. The inert classification is right.
- **§5.2 rubato defaults**: intensity 1.0 / lateStart 0.0 / earlyEnd 1.0 when absent with
  no def ⇒ identity warp (executed). §5.2's neutral is correct for that case.
- **styleScope leniency**: `parseFloat` semantics, so `bpm="120bpm"` renders as 120 and a
  `<tempoDef name="120" value="60"/>` makes `bpm="120"` render as 60 — the expression
  `styleScope` mirrors both (`styleScope.ts:17-23`, executed for the first). Reusing it for
  R2's resolution is the right call; only its 100.0 refusal must be reversed.
- **§5.6 generated notes** — see R28.
- **§5.1 Simpson secondary output**: `computeMillisecondsForTempoTransition`
  (`TempoMap.ts:392-409`) is genuinely the renderer's own integration and is safe to reuse
  on a copied map for `cumulativeDrift`, as §5.1 proposes.
