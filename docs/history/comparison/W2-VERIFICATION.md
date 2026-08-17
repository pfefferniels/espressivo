# W2 — Independent Adversarial Verification

Commissioned under AD-32.3. Scope: `src/comparison/**`, the forward-`T` block of
`src/expression/transforms.ts`, `tests/comparison/**` and the `tests/expression/transforms.test.ts`
additions, across `4211f58..2ac8c59`, against DESIGN.md as amended by AD-1..AD-32.

The verifier wrote none of this code. Every renderer claim below was checked against
`src/mpm/elements/maps/**` **read directly** and then **executed** — not against the comparison
module's comments and not against DESIGN's citations. Seventeen probe scripts were run against a
fresh `npm run build`; the numbers quoted are their output. No working-tree file was modified;
`npm run verify` at the close: **98 files, 4283 passed, 1 skipped, `git status` clean.**

---

## Verdict summary

| #   | audit area                | verdict                                                              |
| --- | ------------------------- | -------------------------------------------------------------------- |
| 1   | Renderer-truth spot audit | **FINDINGS** — 2 CAPITAL, 1 MAJOR (8 of 11 behaviours pass)          |
| 2   | Test-vacuity hunt         | **FINDINGS** — 2 MAJOR, 1 MINOR                                      |
| 3   | Metric-property audit     | **FINDINGS** — 1 CAPITAL, 1 MAJOR (cap placement itself: PASS)       |
| 4   | Numerical audit           | **FINDINGS** — 1 CAPITAL (shared with area 1), rest PASS             |
| 5   | Design-coverage audit     | **FINDINGS** — 1 MAJOR, 3 MINOR                                      |
| 6   | House rules               | **FINDINGS** — 1 MINOR (lint, determinism, layering otherwise clean) |

**Overall: GATE-BLOCK.** Three CAPITAL and four MAJOR findings. The must-fix list is at the end.

---

## 1. Renderer-truth spot audit

Eleven pinned behaviours were re-derived from the renderer source and then executed against a
constructed document, with the evaluator's answer compared side by side.

### PASS (8)

| behaviour                                                                        | how verified                                                                             | result                                                                                                                                                                                                                       |
| -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tempo degenerate table, all four rows                                            | `TempoMap.ts:137-158` read; four documents built and evaluated                           | `transition.to == bpm` → 60; **`meanTempoAt ≤ 0` → 120, i.e. `transition.to`**; `meanTempoAt ≥ 1` → 60; absent `meanTempoAt` → linear ramp (75 / 90 / 105 across the span). Evaluator matches to 1e-9 at every probe.        |
| Skip gap at 100 qbpm (AD-9i)                                                     | `renderTempoToMap` executed; millisecond output read                                     | Notes at 900/1080 ticks → 750/900 ms ⇒ local rate **100.0000 qbpm**. The performance genuinely runs backwards (note@720 → 1000 ms, note@900 → 750 ms), exactly as §5.1 says. Evaluator: 100.                                 |
| Pre-first region at 100 qbpm (AD-9ii)                                            | same                                                                                     | rate on `[0,1440)` = **100.0000 qbpm**, then 60. Evaluator matches.                                                                                                                                                          |
| Trailing transition inert, tempo (AD-8)                                          | `renderTempoToMap` on a lone `bpm=120 transition.to=90`                                  | flat **120.0000 qbpm**. Evaluator: constant 120, no synthetic breakpoint.                                                                                                                                                    |
| Trailing transition inert, dynamics (AD-8)                                       | `renderDynamicsToMap`                                                                    | every note velocity **40** under a trailing `volume=40 transition.to=100`. Evaluator: 40.                                                                                                                                    |
| Dynamics `@curvature`/`@protraction` default **0.0**, not movement's 0.4 (AD-13) | `renderDynamicsToMap` with/without the attributes                                        | no-attrs ≡ explicit `0/0` (`40, 49.9905, 60, 70.0095`) and both differ from `0.4/0.4` (`40, 42.3235, 50.8509, 67.5630`). Clamp verified: `curvature="5"` renders **identically** to `curvature="1"` and logs the correction. |
| Rubato `@loop` defaults to FALSE (AD-10)                                         | `renderRubatoToMap`, δ read off `date.perf`                                              | no `@loop`: δ = `0, −135, −180, −135, 0, 0, 0, 0`; `loop="true"`: `0, −135, −180, −135, 0, −135, −180, −135`. Evaluator reproduces both **tick for tick**.                                                                   |
| Renderer-default 100.0 for unresolvable levels (R8)                              | `TempoStyle.getNumericBpmValueStatic:49-58`, `DynamicsStyle.getNumericValueStatic:49-57` | both return `100.0` and log. `values.ts` reverses the survey correctly.                                                                                                                                                      |

Two further facts confirmed while checking: the ideal-Bézier decision (§5.0 rule 3) is real and
measurable — at a quarter of a 4-quarter span the renderer's `tForDate` gives `49.9905` where the
ideal curve gives `50.000000`; and `<style>` transparency holds for `tempoMap`, `dynamicsMap` and
`rubatoMap`, because all three `getEndDate`s name-test **and** all three `get*DataOf`s reject a
`<style>` through `GenericMap.resolveEntryIndex:469-473`.

### CAPITAL-1 — a `<style>` in an `asynchronyMap` opens a `⊥` span, not a neutral gap

`AsynchronyMap` is the one map with **no** name test — AD-29 got that right. What AD-29 did not
follow through is what the missing test _does_. `renderAsynchronyToMap:67-74` iterates
`asynIndex` over **every** entry, including the `<style>`, and reads
`parseFloat(getAttributeValue('milliseconds.offset', asynElement))` off it. For a `<style>` that
is `parseFloat('')` = `NaN`, and `Math.max(0.0, ms + NaN)` is `NaN`.

Executed (`<asynchrony date=0 offset=−30/><style date=720 name.ref=X/><asynchrony date=1440 offset=20/>`):

```
note@0    ms.date = 0        note@720   ms.date = NaN
note@360  ms.date = 690      note@1080  ms.date = NaN
                             note@1440  ms.date = 2900
```

Every note in the style-opened span gets `milliseconds.date="NaN"` and **vanishes from the MIDI
export** — bit for bit the R24/AD-1 condition the module already implements for a `<asynchrony>`
with no `@milliseconds.offset`, reached through a different element.

`src/comparison/asynchronyCurve.ts:90-92` says the opposite: _"It contributes no segment, so the
gap performs the neutral 0 ms."_ Measured cost of that, on a one-quarter style gap against a
document holding 10 ms:

```
d(styled, small)  = 0.3333 JND·quarters     <- what the module reports
d(bottom, small)  = 20     JND·quarters     <- the SAME renderer condition, priced correctly
```

The correct price is `δ_row` = 10 JND per quarter. The module is out by a factor of 30 on the
disputed span and emits **no `renderer-error` note at all**.

DESIGN is wrong here too: §5.0's corrected paragraph (lines 686-688) says the `<style>` "opens a
neutral gap", and §5.7 says the same. `spanEnds.ts:84-85` says "lawless gap", which is closer, but
the evaluator reads lawless as neutral. `rubatoAsynchrony.test.ts:271-287` pins the wrong
behaviour by name (`'lets a <style> end the span and open a neutral gap'`).

**Smallest repair.** In `readAsynchronySegments`, replace the `continue` at line 92 with a
`⊥` segment: a non-`<asynchrony>` entry pushes `{ startTicks, endTicks, offset: bottom('renderer-error') }`
and a note, exactly as the missing-offset branch below it already does. One `if` becomes an
`else`. DESIGN §5.0's and §5.7's "neutral gap" sentences need amending in the same edit, and the
test's assertions flip from `0` to `isBottom(...) === true`.

### CAPITAL-2 — see §3 (P-C2) and §4; and MAJOR-1 below

### MAJOR-1 — a `<dynamics>` with no `@volume` is a **skip**, not a no-op

`dynamicsCurve.ts:161-165` states: _"Unlike tempo there is no skip case … An instruction with no
`@volume` at all is dropped from the curve and the previous span simply continues, because nothing
re-times around it."_ That reasoning is wrong, and so is the curve.

`DynamicsMap.getEndDate:187-193` scans for the next element **named** `dynamics` regardless of
whether it parses, so the volume-less element still ends the previous span; `renderDynamicsToMap`
then `continue`s past it, and the next valid instruction's inner loop hits
`if (mapEntry.getKey() < dd.startDate) { velocity = '100.0' }` (line 251-253) for every note in the
gap. Same shape as tempo's AD-9i, same constant, different mechanism.

Executed (`volume=60 @0`, no-`@volume` `<dynamics>` @720, `volume=90` @1440):

```
renderer   note@0 = 60   note@360 = 60   note@720 = 100.0  note@1080 = 100.0  note@1440 = 90
evaluator  60            60              60                60                 90
```

`|ln 60 − ln 100| = 0.511` nepers = 5.36 JND, held for the whole gap, on every affected document.

`dynamics.test.ts:83-90` (`'drops a <dynamics> with no @volume without re-timing anything'`) pins
the wrong value.

**Smallest repair.** In `readDynamicsSegments`, stop dropping the volume-less element at line 182.
Keep it in `raws` with a null volume, and give it the tempo reader's treatment: emit a
`NEUTRAL_VELOCITY` segment from its date to the next **valid** instruction's date, plus a
`renderer-skip` note. `readTempoSegments:292-308` is the template, line for line. §5.3 needs a
"skipped instructions" paragraph stating the rule and its `DynamicsMap.ts:251-253` citation.

---

## 2. Test-vacuity hunt

Twelve substantive tests were checked by reconstructing what the assertion would report if the
implementation under test were removed. Two are unfalsifiable as written.

### MAJOR-2 — the rubato inverted-window clamp test cannot fail

`rubatoAsynchrony.test.ts:149-156`:

```ts
it('resets an inverted window to the full frame, performing no warp', () => {
  const curve = rubatoFor(
    '<rubato date="0.0" frameLength="720.0" lateStart="0.8" earlyEnd="0.2" loop="true"/> …',
  );
  expect(displacementTicksAt(curve, 360)).toBe(0);
});
```

With `clampWindow`'s inverted-window reset deleted, the evaluator would compute
`δ = L·(x^1·(ee − ls) + ls) − τ` at `x = 0.5`, which is `0.5·L·(ee + ls − 1)`. The fixture picks
`ls = 0.8`, `ee = 0.2` — **summing to exactly 1** — so the unclamped warp is _also_ exactly 0 at
the one point the test probes. Measured with the clamp removed: `0` (not a residual; exactly zero).

The sibling test at line 158-164 (`lateStart="-5" earlyEnd="9"`) **is** falsifiable — unclamped it
gives 1080 — so the floor and cap are genuinely pinned. Only the inverted-window reset, which the
module doc calls "the final rule … that matters most", is untested.

**Smallest repair.** Probe off the frame midpoint, or pick a window whose bounds do not sum to 1
(`lateStart="0.9" earlyEnd="0.3"` at `t = 360` gives `−72` unclamped, `0` clamped), and assert
both endpoints of the frame rather than one interior point.

### MAJOR-3 — no rubato distance test varies `lateStart`/`earlyEnd`

Every rubato distance test builds from one constant,
`WARP = 'frameLength="720.0" intensity="2.0"'`, and varies only `@intensity`. That leaves
`lateStart = 0`, `earlyEnd = 1` throughout — and in exactly that family `δ_A − δ_B` vanishes at
both frame ends and is single-signed between them, so it is the one parameter family in which
CAPITAL-3 below **cannot** occur. The blind spot and the defect are the same shape.

**Smallest repair.** Add the window bounds to the fixture matrix. A single pair with
`lateStart`/`earlyEnd` set on both sides would have failed loudly.

### MINOR-1 — three assertions that cannot fail

- `decomposition.test.ts:159-166` — `expect(typeof result.shapeless).toBe('boolean')`. The field is
  typed `readonly shapeless: boolean`; TypeScript already guarantees this and no implementation
  change can break it.
- `decomposition.test.ts:42-47` — "never returns a negative variance": `curveMoments` ends in
  `Math.max(0, …)` followed by the noise-floor snap, so the assertion is a restatement of the line
  above it rather than a probe of it.
- `tempo.test.ts:308`, `dynamics.test.ts:356` — "is deterministic: two runs agree bit for bit"
  calls the same pure function twice with the same arguments. It can only fail on ambient state,
  which the `Math.random`/`Date.now` grep already rules out. Harmless, but it is not the
  determinism property R2 asks for; the byte-identical-JSON form arrives with the facade in W3.

### Non-vacuity confirmed (a note in the authors' favour)

The tests the campaign log flags as near-misses were checked and are sound: the M18 neutral-warp
pins use `(22, 15)` and `(25, 7)`, the integer pairs that genuinely fail to round-trip, so removing
the guard fails them; the Bézier midpoint-invariance test is correctly recorded as a _property_
with the bending test moved to a quarter of the span; the `tForDate` agreement test carries its own
"they really do differ" companion; the K=4-insufficiency evidence survives at the quadrature layer
where the constant being correct cannot hide it; and P-C3b carries an explicit non-vacuity test.

---

## 3. Metric-property audit

### PASS — cap placement, and the axioms on the `⊥`/cap family

The question posed was whether `min(d, 2δ)` is applied to a metric or mixed with uncapped terms.
It is applied correctly: `asynchronyDistance:87-89` evaluates `localDistance` **pointwise per
cell** and multiplies by the cell length, so what is integrated is a metric on the value space
(truncation of a metric is a metric; `d(x,⊥) = δ`, `d(⊥,⊥) = 0` satisfies the triangle against it),
and an integral of a pointwise metric against a fixed measure is a metric. No capped and uncapped
terms are summed anywhere — the curve dimensions integrate their curve and consume only `row.jnd`,
which §4 and §5.1 both license.

Verified rather than assumed. A seven-member adversarial family (`⊥` span, cap-triggering 100000 ms,
small value, negative value, style-opened gap, absent map, mixed `⊥`+cap) was run over all 343
ordered triples under a **shared explicit window**:

```
P-C3 triangle: 0 violations of 343 triples (worst excess 0)
symmetry:      0 asymmetric pairs of 49
d(⊥,⊥) = 0    d(absent,absent) = 0
```

`registry.test.ts:413` pins the same property at the row level on a sampled grid. This area's
mechanism is sound.

### CAPITAL-3 — P-C2 bit-exact symmetry is broken on power-vs-power tempo cells

The summation path is clean: the grid is a `Set` that is numerically sorted (order-independent),
`splitPoints` are deduplicated and sorted inside `integrateAbsolute`, `CompensatedSum` negates
exactly under `f ↦ −f`, and `bisectSignChange` compares sign **tokens** so the bracket update
mirrors (M16). The authors got all of that right.

The leak is in `tempoDistance.criticalPointTicks:114-129`, which passes the two segments to
`powerCriticalPoint` **in document order**:

```ts
const u = powerCriticalPoint(a.qbpm1 - a.qbpm0, a.exponent, b.qbpm1 - b.qbpm0, b.exponent);
```

Swapping the documents computes `(p·Δ_a / (q·Δ_b))^{1/(q−p)}` instead of
`(q·Δ_b / (p·Δ_a))^{1/(p−q)}`. Those are algebraically equal and **not** equal in IEEE754: the two
ratios are separately-rounded reciprocals, and `Math.pow` is not reciprocal-symmetric. Random
sweep of 400 000 argument sets: **17 587 of 149 696 non-null results (11.7 %) differ by one ulp.**

That ulp moves the split point, which moves the GL-10 abscissae, which changes the reported bits.
End to end, on two ordinary transitions over the same span —
`A: bpm 40 → 90, meanTempoAt 0.9` against `B: bpm 45 → 85, meanTempoAt 0.1`:

```
forward  d_tempo = 81.9461003454375
reverse  d_tempo = 81.94610034543747        Object.is(...) === false
```

The _number_ is right to 15 digits (3.5e-16 relative); what fails is the invariant. §10's P-C2 and
R2 state bit-exactness as a contract — the entire Neumaier/`signOf`/fixed-iteration apparatus
exists to honour it — and W3's byte-identical-`JSON.stringify` test will fail on any corpus
containing two transitions over a shared span.

Not caught because every P-C2 test in the wave compares two **constants** (`tempo.test.ts:244`,
`dynamics.test.ts:285`) or two same-frame rubato intensities, none of which reaches
`criticalPointTicks` at all.

**Smallest repair.** Canonicalise the argument order before the call — order the two segments by
`(exponent, qbpm1 − qbpm0)` and always pass the smaller first. Verified: the same 400 000-set sweep
gives **0 asymmetric results of 149 729**. Add a P-C2 test on a power-vs-power pair; the one above
reproduces in two lines.

### MAJOR-4 — P-C3's adversarial fixture family does not exist

§10 requires "a dedicated fixture family whose members pairwise exercise **every former M1
instance** — an unresolvable style name, an unmatched part, a present-vs-absent replacement
attribute, a `timingBasis` mismatch, a renderer-error span — plus M5's shared-date event triples,
with the three windows asserted equal".

What exists is three triangle tests, each on three **pointwise-ordered constants**
(`tempo.test.ts:256`, `dynamics.test.ts:294`) or three intensities (`rubatoAsynchrony.test.ts:225`).
Pointwise-ordered members sit at the triangle's _equality_ case, so the assertion can only fail on
quadrature error exceeding 1e-9 relative — it tests the quadrature, not the metric. None of them
touches `⊥`, the cap, a renderer default, or an unmatched part. No triangle test exists on the
asynchrony dimension at all, which is the only W2 dimension that carries `⊥` and the cap.

I ran the missing test (results under "PASS" above) and it holds, so this is a **coverage** gap
rather than a live defect — but it is the gap that let CAPITAL-1 and CAPITAL-3 through, and P-C3b
has the same shape: it runs on three encodings of one _constant_ tempo curve and never enters the
`⊥` or capped paths it is advertised as the cheapest detector for.

**Smallest repair.** Promote the seven-member family used above into `tests/comparison/` as the
P-C3/P-C3b fixture family, run under an explicit shared window, and add at least one
power-vs-power tempo member so the family reaches `criticalPointTicks`.

---

## 4. Numerical audit

### PASS

- **Graded-mesh panel count.** `gradedPanelCount:196-198` is `Math.max(2, Math.ceil(Math.log2(e)) + 2)`
  — AD-28.1's formula including the `max(2, ·)` floor that the ruling's bare expression omits.
  The production path (`gradedBoundariesIn:87-104`) places panels at
  `startTicks + (k/K)^{1/e}·span`, which is the same placement `integrateGradedPower:223-235` uses,
  and grades in the **transition's** u-coordinate rather than the cell's — the subtlety the module
  doc flags, implemented as documented.
- **K = 16 for Bézier-pair cells** (AD-31), applied only where both sides are live transitions, with
  the K=4 insufficiency pinned at the quadrature layer where the constant being correct cannot
  hide it (`dynamics.test.ts:399-424`).
- **Neumaier on every reported total.** The only `+=` occurrences in `src/comparison/**` are the
  two inside the compensator itself (`quadrature.ts:53`, `71`) and an integer counter
  (`document.ts:216`). Every distance, mean and moment goes through `CompensatedSum`.
- **`SPREAD_NOISE_FLOOR`** is applied inside `curveMoments`, so it reaches **both** `σ_A` and `σ_B`
  and the `'level-gain'` canonicalisation through the same `moments` object; there is no second
  path that could bypass it. The AD-32.1 rationale checks out: it is relative to the curve's own
  scale (`Math.max(1, |mean|)`), and variance is computed as `∫(h−ℓ)²`, never `∫h² − ℓ²`.
- **Decomposition identity.** Expanding `∫(a−b)²dμ` confirms `(ℓ_A−ℓ_B)² + (σ_A−σ_B)² + 2σ_Aσ_B(1−r)`
  closes with `r` defined as it is here; the shapeless branch's `level² + gain²` is also exact
  (with `σ_B = 0`, `cov = 0` and the two agree).

### CAPITAL-3 (continued) — and the finding that dominates this area

The single largest numerical defect in the wave is in the rubato dimension and is reported in full
below, because it is simultaneously a renderer-truth-adjacent, numerical and test-coverage failure.

### CAPITAL-4 — `rubatoDistance` cancels sign changes and reports a distance 5000× too small

`rubatoDistance:79` calls `integrateAbsolute(difference, cellStart, cellEnd)` with **no split
points whatsoever**. §5.0 gives tempo a structural critical point (rule 2) and Bézier pairs a fixed
subdivision (rule 2b); the rubato family was given neither, and it needs one more than either of
them, because δ is a **saw-tooth**: it rises across the frame from `L·lateStart` and drops to
`L·(earlyEnd − 1)` at the wrap, so `δ_A − δ_B` routinely starts and ends a cell with the _same_
sign while crossing zero twice in between. `bisectSignChange` then finds no bracket and the cell is
integrated as `|∫ f|` instead of `∫ |f|`, with the two lobes cancelling.

Minimal reproduction — two entirely ordinary, legal `<rubato>` instructions:

```xml
A: <rubato date="0.0" frameLength="720.0" intensity="0.6"  lateStart="0.10" earlyEnd="0.50" loop="true"/>
B: <rubato date="0.0" frameLength="720.0" intensity="2.5"  lateStart="0.15" earlyEnd="0.85" loop="true"/>
```

```
grid for the 1-quarter window: [0, 720]           (one cell — correct, the frame boundary is at 720)
Δδ(0) = −36.000   Δδ(720) = −36.000               same sign: bisection finds no bracket
Δδ interior:  u=0.05:+11.4  u=0.4:+79.2  u=0.8:−72.6  u=0.95:−200.1

TRUE   ∫|δ_A − δ_B| over the cell = 51437.4526
MODULE ∫ (as reported)            =    10.1914          relative error 9.998e−1

d_rubato reported = 0.000315 JND·quarters      true value = 1.587576 JND·quarters
```

This is not a corner. Over a sweep of **3906 legal frame-aligned rubato pairs** (intensity
∈ {0.25 … 6}, seven `lateStart`/`earlyEnd` windows on each side), **2328 — 59.6 % — are wrong by
more than 0.1 % relative, and the worst case is 100 % (total cancellation).** It is §5.0 rule 2's
own documented failure mode (M7, "ten orders past the advertised ε, silently"), reproduced verbatim
in the one dimension no rule was written for.

**Two causes, and both must be fixed.** Measured separately over the same 3906-pair sweep against a
2·10⁵-point Simpson reference:

| variant                                   | pairs wrong by >0.1 % | worst relative error |
| ----------------------------------------- | --------------------- | -------------------- |
| as shipped                                | 2328                  | 1.00e+0              |
| fixed subdivision K=4                     | 840                   | 1.59e−1              |
| fixed subdivision K=16                    | 226                   | 1.62e−2              |
| structural `u*` split only                | 1558                  | 9.93e−1              |
| **left-limit endpoint only**              | 280                   | 1.00e+0              |
| **left-limit endpoint + structural `u*`** | **10**                | **1.68e−3**          |

1. **`integrateAbsolute` probes `f` at the closed right endpoint of the cell**, but every curve
   reader in this module is right-continuous by A-B1, so `f(cellEnd)` is the _next_ cell's value
   across a discontinuity. `bisectSignChange` therefore brackets on a sign that does not belong to
   the interval it is searching. This is latent in tempo and dynamics too (any cell whose right
   edge is a breakpoint); it is benign there only because those curves are monotone within a span,
   and the measured dynamics accuracy (2.7e−8 against Simpson) confirms it is not currently biting.
2. **No completeness device for the rubato family.** Within a shared frame,
   `Δδ(x) = L·[α·x^p − β·x^q + (ls_A − ls_B)]` with `α = ee_A − ls_A`, `β = ee_B − ls_B`. Its
   derivative has exactly one positive root, so it has exactly one interior stationary point and at
   most two zeros — the _same_ structure §5.0 rule 2 already solves for tempo, with
   `u* = (q·β / (p·α))^{1/(p−q)}`. Splitting there leaves two monotone branches and makes the
   existing bisection complete.

Note that fixed subdivision alone is **not** an adequate remedy here (K=32 still leaves 62 pairs
wrong): rubato needs the structural split, not AD-31's device.

**Smallest repair.** (a) Give `integrateAbsolute` a half-open convention — evaluate the right
endpoint at its left limit when probing signs, leaving the GL-10 nodes untouched (they are already
interior). (b) Add a `criticalPointTicks` analogue to `rubatoDistance` for frame-aligned cells,
reusing `powerCriticalPoint` with `(L·(ee−ls), intensity)` per side, canonically ordered per
CAPITAL-3; fall back to fixed subdivision where the two frames differ. This needs a ruling —
§5.0 gains a rule 2c and §5.2 a sentence — because it changes every published rubato number.

### MINOR-2 — `−0` normalisation

None is present in `src/comparison/**`, and none is currently needed: every reported scalar passes
through `Math.abs` or a non-negative accumulator, so no `−0` is produced today (checked on the
zero-distance paths). §9.5's normaliser and P-C1's `Object.is` assertion are W3 obligations; noting
it so W3 does not assume W2 did it.

---

## 5. Design-coverage audit

Walked §5.0, §5.1, §5.2, §5.3, §5.7, §1.2, §7.4, §4 and §10 against §11's W2 scope line.

**Implemented and checked:** ppq lcm normalisation with integer factors and the third
"declared-but-unusable" state (AD-27.2); window precedence **explicit > msm > corpus > pair-derived**
per AD-27.1 with both stamps, and the degenerate `end ≤ start` guard; part matching by `@number`
with the unmatched-against-neutral rule and the AD-27.5 discard rule; both shadowing rules,
`styleScope`-routed (AD-16, pinned at `document.test.ts:295` and `:570`); the refinement grid as a
sorted union in ticks with the window bounds always present; §4's row shape including `delta`,
`plausibleRange`, `ppqSensitive`, conditional liveness and the closed `ComparisonJndKey`
vocabulary; the capped local metric; forward `T` with `T(C(x,s)) = s·T(x)`; the four evaluators;
the four densities; §1.2's four fields plus the closing check on the normalised measure; §7.4's
three modes per curve with the log-vs-linear trap pinned (`decomposition.test.ts:192`).

**Correctly deferred** (§11 assigns them to W3, not gaps): the plausibility and comparability
_channels_ (§4's `plausibleRange` data is present and tested; nothing consumes it yet, which is
right), signed descriptors, aggregation and the closing table, the `'level'`-on-a-linear-space
report note, and the `§9` typed error for `qbpm ≤ 0` — no W2 code guards it, so a document with
`bpm="0"` currently yields `−Infinity` through `Math.log`; that is W3's validation table, but it
should be on W3's list explicitly.

### MINOR-3 — undeclared behaviour and stale spec text

- **`spanEnds.ts` is never consulted by an evaluator.** `document.ts` attaches `spanEndRule` to
  every `OrderedMapView`, and no evaluator reads it; each re-derives the rule inline.
  `asynchronyCurve.ts:15` states the reverse — _"The span rule is taken from `spanEnds.ts` rather
  than re-derived here"_ — and the module imports nothing from it. The table is right; the claim
  that it is load-bearing is not.
- **`spanEnds.ts`'s module header still tells the pre-AD-29 story.** Lines 4-8 say "six maps scan
  forward … `ImprecisionMap` is the exception", which the table's own comment at line 56 corrects to
  "FIVE, not the six". The header is the first thing a W3 implementer reads.
- **`integrateGradedPower` is exported, tested and never called in production.** `tempoDistance`
  reconstructs the mesh through `gradedBoundariesIn` + `integrateAbsolute`. I verified the panel
  placement is identical, so this is a traceability rather than a numerical issue — but AD-28.1's
  3.3e−6 figure is measured on a function the shipped path does not use, and a future edit to one
  will not be caught by the other's test.
- **DESIGN §5.0's window paragraph still lists MSM before explicit** (lines 539-542). AD-27.1
  superseded it and the code follows the ruling, but the binding document still reads the old way.

### MINOR-4 — malformed-value divergences from the renderer

Three legal-but-malformed inputs where the comparison repairs what the renderer does not:

- `curvature="abc"` / `protraction="abc"`: `DynamicsMap.clampCurvature` passes `NaN` through both
  comparisons, so the renderer builds `NaN` control points and emits `velocity="NaN"`;
  `dynamicsCurve.clamp:94-97` returns `0`.
- `<rubato intensity="abc" name.ref="D"/>`: `RubatoMap.getRubatoDataOf:126-128` keeps the `NaN` and
  does **not** consult the def; `rubatoCurve.inherited:167-172` falls back to the def.
- `frameLength="0"` with `loop="true"`: `computeRubatoTransformation`'s `% 0` gives `NaN` warped
  dates (the same vanish-from-MIDI condition as CAPITAL-1); `readRawRubato:175` treats it as a skip
  and performs a neutral gap.

None is realistic input and none needs fixing this wave, but all three are the `⊥` class and should
be recorded so W3's validation table can decide them together rather than one at a time.

---

## 6. House rules

**PASS:** `npx eslint src/comparison tests/comparison` — clean, exit 0. No `Date.now`, `Math.random`,
`performance.now` or `new Date` anywhere in `src/comparison/**`. No `undefined` in an exported
_result_ type — the six matches are local `as … | undefined` narrowings and internal function
parameters. `ReadonlyMap` appears in `OrderedMapView` and `ComparisonScope`, which also carry live
`Element` objects and are plainly not report shapes; nothing to fix, but §9.3's shapes must not
inherit them.

The `mpm/…/bezier.js` gitignore staircase (§9.7) was negative-controlled and works: importing
`src/mpm/elements/maps/GenericMap.js` from `src/comparison/` errors with the zone's message, while
`bezier.js` is allowed. The W2a log's finding about the inert single negation is confirmed fixed.

### MINOR-5 — the comparison zone does not fence `src/api`

The zone's own `why` says `src/comparison/**` may use `src/xml/**`, `src/supplementary/**`,
`src/expression/**`, the MPM name constants and the Bézier math "**and nothing else**", but
`**/api/**` is absent from its `forbidden` list. Negative-controlled: a file under
`src/comparison/` importing `'../api/index.js'` passes lint silently.

Nothing violates it today (no `src/comparison` file imports `src/api`), but `src/api/index.ts`
transitively reaches `Mpm.js`, whose constructor is exactly the mutating parse the zone exists to
keep out — and W3 is the wave that builds the facade and creates the temptation.

**Smallest repair.** Add `'**/api/**'` to the `comparison` zone's `forbidden` array.

---

## Wave verdict

**GATE-BLOCK.**

### Must fix before W3

| id        | severity                 | finding                                                                                                                                         | site                                                                         |
| --------- | ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| CAPITAL-1 | wrong number, ×30        | `<style>` in an `asynchronyMap` opens a `⊥` span (renderer emits `NaN`), not a neutral gap                                                      | `asynchronyCurve.ts:90-92`; DESIGN §5.0/§5.7; `rubatoAsynchrony.test.ts:271` |
| CAPITAL-3 | broken invariant         | P-C2 bit-exactness fails on power-vs-power tempo cells — `powerCriticalPoint` called in document order                                          | `tempoDistance.ts:114-129`                                                   |
| CAPITAL-4 | wrong number, ×5000      | `rubatoDistance` cancels sign changes: closed-endpoint sign probe on right-continuous curves, plus no completeness device for the rubato family | `rubatoDistance.ts:79`; `quadrature.ts:330-358`; DESIGN §5.0                 |
| MAJOR-1   | wrong on plausible input | a `<dynamics>` with no `@volume` is a skip performing velocity 100, not a no-op                                                                 | `dynamicsCurve.ts:161-182`; `dynamics.test.ts:83`; DESIGN §5.3               |
| MAJOR-2   | unfalsifiable test       | the inverted-window clamp test probes the one point where the unclamped warp is also 0                                                          | `rubatoAsynchrony.test.ts:149-156`                                           |
| MAJOR-3   | blind spot               | no rubato distance test varies `lateStart`/`earlyEnd` — the family in which CAPITAL-4 cannot appear                                             | `rubatoAsynchrony.test.ts:196-233`                                           |
| MAJOR-4   | weaker than its name     | P-C3's adversarial fixture family does not exist; all three triangle tests use pointwise-ordered members                                        | `tempo.test.ts:256`, `dynamics.test.ts:294`, `rubatoAsynchrony.test.ts:225`  |

Three of these (CAPITAL-1, CAPITAL-4, MAJOR-1) require a DESIGN amendment as well as a code change,
and CAPITAL-4 changes every published rubato number, so it needs a ruling before the fix lands.

### Should fix, not blocking

MINOR-1 (three unfalsifiable assertions), MINOR-2 (`−0` normalisation is W3's), MINOR-3
(`spanEnds.ts` unused and its header stale; `integrateGradedPower` unused; DESIGN §5.0's window
ordering stale), MINOR-4 (three malformed-value divergences to decide together in W3's validation
table), MINOR-5 (`**/api/**` missing from the comparison eslint zone — cheap, and W3 is when it
starts to matter).

### What is sound

The wave's substrate is good work and most of it survived a hostile read. The renderer archaeology
is right on eight of the eleven behaviours audited, including the four that are genuinely
counter-intuitive (the `meanTempoAt ≤ 0` factor-of-two, the 100-qbpm skip gap, trailing inertness in
both dimensions, and `@loop` defaulting to false). The quadrature core is honest: the Newton
re-derivation licenses the hard-coded table, the graded mesh is implemented as ruled including the
floor the ruling omitted, Neumaier reaches every reported total, and the K=4-insufficiency evidence
is pinned where the constant cannot hide it. The capped metric's axioms hold on an adversarial
`⊥`/cap family the wave never tested. The `bezier.js` carve-out staircase works. Nothing in
`src/comparison` is non-deterministic and nothing lints.

The three CAPITAL findings share one root: **the wave tested its evaluators far harder than it
tested its integrator.** Every P-C2 and P-C3 test in W2 runs on constants or on the one parameter
family where the integrator's failure modes are invisible. Fixing the four items above matters less
than adopting the fixture family that would have found them.

---

# Re-verification — 2026-08-10

Scoped re-gate of the fix wave (`0dc3e39`, `ebc2c4f`, `b9444cf`) against AD-33, at HEAD `b9444cf`.
Not a re-opened audit: only the findings above, the two flagged extensions, and drift.

Method: every probe from the original report was re-run unchanged against a fresh `npm run build`,
so the numbers below are comparable line for line with the ones above. Each repair was additionally
**negative-controlled by reverting it** — patch, run the suite, `git checkout --`, confirm clean —
because a repair that no test protects is a repair that will not survive W3.

## Must-fix items: all seven confirmed repaired

| id            | evidence                                                                                                                                                                                                                                                                        | revert control                                                                                                                                     |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| **CAPITAL-1** | `d(styled, small)` = **10** (was 0.333), the same δ_row price as the `⊥`-by-missing-offset route; `d(styled, absent)` = **11**, which is exactly 2·0.3333 + 10 + 0.3333 by hand. The renderer probe is unchanged — it still NaN-poisons — and the evaluator now agrees with it. | —                                                                                                                                                  |
| **CAPITAL-3** | All five end-to-end power-vs-power pairs now bit-exact, including the report's repro (`81.94610034543747` both directions). The new rubato structural path is symmetric too: **0 asymmetric of 3969** pairs.                                                                    | Reverting `orderPowerSegments` fails **both** the dedicated test and the family's P-C2, the latter naming the report's exact values.               |
| **CAPITAL-4** | Repro pair now reports **1.587576** against a true 1.587576 (rel. err 4.8e−7; was 0.000315). My grid: **6 of 3906 wrong by >0.1 %, worst 1.54e−3** — cross-checks the fixer's 4/3080 worst 1.778e−3: same residual, same order, different grid.                                 | Reverting the half-open probe fails the new MAJOR-3 test (5.5559 against an expected 6.3503). Reverting rule 2c fails **nothing** — see RG-2/RG-3. |
| **MAJOR-1**   | Evaluator now `60, 60, 100, 100, 90, 90`, matching the renderer exactly; segments carry the `[720,1440) → 100` gap, and a leading skip correctly extends the pre-first neutral.                                                                                                 | —                                                                                                                                                  |
| **MAJOR-2**   | Bounds changed to `ls=0.9 / ee=0.3` (which do not sum to 1) and the assertion now sweeps the whole frame rather than one interior point.                                                                                                                                        | Removing the inverted-window reset fails it: `expected 648 to be +0`. The old fixture could not fail; this one does.                               |
| **MAJOR-3**   | A `lateStart`/`earlyEnd`-varying rubato distance test exists and pins the report's own repro at 4× the single-frame value.                                                                                                                                                      | It is the test that catches the half-open revert — it earns its place twice over.                                                                  |
| **MAJOR-4**   | `adversarialFamily.ts` + `metricProperties.test.ts`: 39 tests, eight members, one explicit shared window, a non-degeneracy test, and a self-guard on the member count.                                                                                                          | Dropping a member fails the self-guard; see extension (a) for the stronger control.                                                                |

The metric properties survive the changes: the seven-member `⊥`/cap/style probe still reports **0
triangle violations of 343 triples and 0 asymmetric pairs of 49**, now with the corrected pricing.

MINOR-1, MINOR-3 and MINOR-5 are resolved as ruled. `assertSpanEndRule` genuinely bites —
corrupting `TEMPO_MAP`'s entry throws
`span-end rule mismatch for <tempoMap>: spanEnds.ts says any-entry, the reader implements same-local-name`
at the reader's first call. The `**/api/**` ban is negative-controlled: an import of
`'../api/index.js'` from `src/comparison/` now errors with the zone's own rationale. MINOR-2 (`−0`)
and MINOR-4 (malformed values) are correctly **untouched** and left whole for W3 — no half-done drift.

## The two flagged extensions

**(a) The eighth family member — SOUND, and its claimed property verified in both directions.**
This is the one claim worth checking hardest, because it is an argument about test _design_ rather
than about code. It holds exactly as stated:

- eight members + AD-33.2 reverted → the family's P-C2 **fails**, on the pair
  `power-vs-power vs power-vs-power-2`, reporting `81.9461003454375 !== 81.94610034543747` — the
  report's repro, arriving inside the standing family;
- seven members + AD-33.2 reverted → the family's P-C2 **passes**. The only failure is the
  size self-guard.

So `criticalPointTicks` really is unreachable by any _pair_ of a seven-member family with one
transition member, and the eighth member is load-bearing rather than decorative. Going beyond the
ruled seven was the right call, and finding it by negative control rather than by argument is the
right method.

**(b) Phase-aware frame alignment — SOUND.** Equal `frameLength=720` with `startTicks` 0 against
360 (phases 0 and 360) is correctly refused by the congruence guard, falls back to K=16, and lands
at **1.18e−6 relative error** against an 8·10⁵-point Simpson reference over the full four-quarter
window, bit-exact under swapping. The guard earns its place: equal frame _length_ alone does not
give the two sides a shared `x`, so `u*` would be a split point for a coordinate neither curve is
expressed in. This was the fixer's own addition beyond AD-33.3b's text, and it is a correct one.

## New findings — four MINOR, none blocking

**RG-1 (MINOR) — the fourth curve reader is not wired to `spanEnds.ts`.** MINOR-3's property holds
for three of four readers: `tempoCurve`, `dynamicsCurve` and `asynchronyCurve` call
`assertSpanEndRule`; **`rubatoCurve.readRubatoSegments` does not**, although `RUBATO_MAP` is in the
table and the reader implements its rule inline exactly as the other three do. Corrupting
`RUBATO_MAP`'s entry is caught only by `document.test.ts`'s table-content test
(`'gives the span maps that really name-test the same-local-name rule'`) — which is the test anyone
deliberately changing the table would update, and at that moment the rubato reader diverges
silently. One line: `assertSpanEndRule(RUBATO_MAP, 'same-local-name')` at the top of
`readRubatoSegments`.

**RG-2 (MINOR) — AD-33.3b's structural split has no regression test.** Disabling
`rubatoCriticalPointTicks` (so every cell takes the K=16 fallback) passes **all 28 rubato tests and
all 39 family tests**. Rule 2c could be deleted in a refactor without a single failure.

**RG-3 (MINOR) — and, measured, the structural split is worse than the fallback it is preferred
over.** Over the same 3906 legal frame-aligned pairs, with the half-open probe in place throughout:

| split strategy                   | wrong by >0.1 % | worst relative error |
| -------------------------------- | --------------- | -------------------- |
| `u*` only (the shipped primary)  | 4               | 1.400e−3             |
| K=16 only (the shipped fallback) | **0**           | **2.718e−4**         |
| `u*` + K=16                      | **0**           | **2.718e−4**         |

Both worst cases are `intensity = 0.25` on one side — `x^0.25` has an infinite slope at `x = 0`, a
boundary layer that a two-panel structural split leaves inside a single GL-10 panel and that a
sixteen-panel mesh confines. It is the same phenomenon the tempo graded mesh exists for, arriving
in a dimension where nobody looked for it.

This is not a defect and not a regression — the shipped path is a 700× improvement on the
pre-repair state and its worst case is far below the metric's resolution. It is that **AD-33.3b's
preference ordering was derived from the original report's table, which was measured with the
closed probe still in place**; once AD-33.3a landed, the ordering no longer follows from the data,
and the residual AD-33.3 documents is avoidable. Smallest fix, and it preserves rule 2c's
structural claim rather than retracting it: emit **both** sets of split points
(`[...u*, ...K=16]`), which measures identically to the best option above and takes AD-33.3's
documented residual to zero. Worth a line in the ruling either way, since the residual is recorded
in DESIGN §5.0 as a measured property and it is now a choice rather than a limit.

**RG-4 (MINOR) — a stale hazard string.** `adversarialFamily.ts:110` still describes the seventh
member as "the ONLY member that reaches `criticalPointTicks`". The eighth member exists precisely
because that is false, and this is the sentence a future reader would cite to justify deleting it.

## Re-gate verdict

**RE-GATE PASS.** All three CAPITAL and all four MAJOR findings are confirmed repaired, each by
re-running the original probe and — where a repair could regress — by reverting it and watching a
test fail. Both beyond-spec extensions are sound, and the eighth family member in particular is a
better piece of test design than the ruling asked for. The four new findings are MINOR, cheap, and
none of them affects a reported number today: RG-1 and RG-4 are one-liners, and RG-2/RG-3 are a
ruling refinement that would improve an already-acceptable residual.

Tree at `b9444cf` otherwise untouched; `npm run verify` green.
