# W3 — Independent Adversarial Verification

Commissioned under AD-54.6. Scope: everything since the W2 re-gate — `b9444cf..bc7a2f6` — i.e.
W3a cuts 1–4 (accentuation, pedal, articulation + the event aligner, ornamentation, imprecision ×3)
and W3b (aggregation, canonical table, invariance plumbing, the eleven-dimension driver, the §9
facade with `compareMpm`, P-C2/P-C11/P-C5). The W2 substrate was re-audited only where W3 changed
it.

The verifier wrote none of this code. Every renderer claim below was checked against
`src/mpm/**` read directly and then **executed through `Performance.perform` / `performMsm`**, per
AD-43.1's tightened standard — never against a map-level probe, never against the comparison
module's comments, never against DESIGN's citations. Numeric references were derived from the
definitions or measured against `mpmath` at 60–80 dps; a closed form copied from the module's own
test file was not accepted as independent.

No working-tree file was modified. Twelve falsifiability patches were applied with
`patch → run → git checkout --`, each verified to leave `git status` clean. `npm run verify` at the
open and at the close: **117 files, 4996 passed, 0 skipped, `git status` clean.**

---

## Verdict summary

| #   | audit area                | verdict                                                                        |
| --- | ------------------------- | ------------------------------------------------------------------------------ |
| 1   | Renderer-truth spot audit | **FINDINGS** — 1 CAPITAL, 1 MAJOR (18 of 19 pinned behaviours reproduce exactly) |
| 2   | Metric-property audit     | **FINDINGS** — 1 CAPITAL, 1 MAJOR, 1 MINOR (closure, caps and ⊥ all PASS)      |
| 3   | Numerical audit           | **FINDINGS** — 1 CAPITAL, 2 MAJOR, 3 MINOR (W₁/W₂/ρ otherwise machine-precise) |
| 4   | Test-vacuity hunt         | **PASS** — 12 of 12 probes falsifiable, the conductor's included               |
| 5   | Design-coverage walk      | **FINDINGS** — 2 CAPITAL, 12 MAJOR, 12 MINOR (one pre-declared by the author) |
| 6   | House rules               | **FINDINGS** — 1 CAPITAL, 2 MAJOR, 2 MINOR (determinism + plain-data PASS)     |

**Overall: GATE-BLOCK.** Six CAPITAL and eighteen MAJOR findings. The must-fix list is at the end.

The wave's renderer archaeology is, once again, overwhelmingly right — nineteen pinned behaviours
were re-derived and executed and eighteen reproduce to the character. The failures are not in what
the readers *learned*; they are in what reaches the number: a whole renderer-true mechanism that no
evaluator consumes, a per-part multiplier driven by the wrong document, and a support hull that is
wrong where the module deliberately supports the input.

---

## 1. Renderer-truth spot audit

Nineteen pinned behaviours across the seven new dimensions were re-derived from the renderer source
and then executed on documents I constructed, through `performMsm`. Probes:
`scratchpad/rt/p1b.mjs`, `p6-orn.mjs`, `p7-imp.mjs`, `p7b.mjs`, `p8-parts.mjs`, `p9-pedal.mjs`,
`p10-acc.mjs`.

### PASS (18)

| ruling                | probe                                                  | measured                                                                        |
| --------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------- |
| AD-37.1 retroactive default | switch@720 `stacc`; switch@1440; two switches      | `50,50,50,50` / `50,50,50` / `120,120,50,50` — the first switch's default governs from tick 0 |
| AD-37.2 disposition table | no-`@defaultArticulation`; unknown def; unresolvable style; none | `50,50,100,100` / `50,50,100,100`+warning / `50,50,50,50` / `100,100,100,100` — two cancellers, one continuer |
| AD-37.2b atom shadows default | default `stacc` + atom `ten`@360               | `50,120,50,50`                                                                  |
| AD-37.3 velocity composes | `absVel=80 relVel=0.5 absVelChg=7` on 64           | **47** — the levers chain, exactly as ruled                                     |
| AD-37.3 duration one-lever | `absDurChg=10 relDur=0.5 absDur=600` on 100       | **110** — `absoluteDurationChange` alone fires                                  |
| AD-37.4 atoms compose | `relDur 0.5` + `relDur 0.25` vs `relDur 0.125`         | `12.5` both; offset-through-factor `55`; replacement wipes `600`                |
| AD-37.5 unresolvable `@name.ref` | def missing vs present, `relDur=1.2`            | `120` / `60` — inline modifiers survive, opposite to §5.4                       |
| AD-40.1 `@scale` gates half | no `@scale` vs `scale="1.0"`, gradient + spread   | velocities `100,100,100` with onsets `−22/0/22`; then `80,100,120` with the same onsets — gates the gradient **entirely**, never the spread |
| AD-40.2 performed pair | `(−20,20)×1` vs `(−10,10)×2`                          | identical performance, `d_ornamentation = 0`                                    |
| AD-43.1 global map performs | part-local vs `<global>` ornamentationMap        | `80/100/120` from **both** — the inversion of 404fd57 is correct                |
| AD-44.1/45.1 gradients compose | `(−20,20)+(−10,30)` vs `(−30,50)`; asc+desc vs `(10,10)` | identical performance, `d = 0` in both, direction included                |
| AD-45.2 equal-intensity spreads compose | `(−22,44)+(−100,200)` vs `(−122,244)`   | identical performance, `d = 0`                                                  |
| AD-44 defect 2 | `transition.from="-20"` alone                                | `80,80,80` — `transition.to` defaults to `transition.from`, not to 0            |
| AD-44 defect 4 | `repetitions="0"` added                                      | `80/100/120` → `100/100/100` — presence alone deletes the performance           |
| AD-49.1 one rule | absent `limit.upper` / absent `deviation` / absent `mode` vs explicit `0` | **bit-identical** rendered documents in all three                     |
| AD-49.1 single absent limit | `limit.lower="-30"` alone                         | `0, 698.251007, 1431.593686, 2138.203421` ≡ explicit `(−30, 0)`, and **≠** the both-absent δ₀ `0,720,1440,2160` |
| AD-47 clip-less triangular | vs no map at all                                   | `0,720,1440,2160` — exactly δ₀, never `NaN`                                     |
| AD-49.2 seven ⊥ routes | each executed                                          | empty list → `NaN,NaN,NaN,NaN`; `limit.lower="abc"` → all `NaN`; compensatingTriangle without `degreeOfCorrelation` → `0,NaN,NaN,NaN` ("first note fine, every later note NaN", verbatim) and `="0"` → `11.409,NaN,NaN,NaN`; brownian+`seed="99"` → all `NaN` (without it: performs); list+`seed="99"` → all `NaN`; `timingBasis="0"` → **throws `OutOfRangeError`** |
| AD-52.2 unmatched part | MSM parts 1+2, MPM global `volume=40`, part 1 at `110`   | velocities **`110,40`** — the unmatched part takes the GLOBAL map, not the neutral 100 |
| AD-35 trailing resurrection | none / trailing `<style>` / leading `<style>`     | `17` events to `720` / **`34`** to `1.7976931348623157e308` / `17` to `720` — the guard counts entries |
| AD-12 tsDate anchoring | TS 4/4@0 vs 4/4@1440 vs 3/4@0 vs none                  | `120,120,90,90,120,120,90,90` / `120,120,120,120,90,90,120,120` / `120,120,90,120,120,90,120,120` / ≡ 4/4@0 — the pattern really does anchor to the signature's date |

Two further facts confirmed while checking. `PerformOptions.seed` — the API-level base seed —
reproduces the `@seed` poisoning on the correlated and list families (all four notes `NaN` where an
unseeded render performs normally), because it is injected into distributions that carry no `@seed`
of their own. That is outside the comparison module (the comparison never calls `performMsm`), so it
is context rather than a gate finding, but it means PARITY `IMP1`'s reach includes an ordinary API
option and not only an authored attribute. And the articulation suite's renderer evidence is taken
from `renderArticulationToMap_noMillisecondModifiers` at the **map level**
(`articulation.test.ts:63-83`), which AD-43.1 tightened against; I re-ran every one of its claims
through the full pipeline and all of them hold, so this is a discipline note, not a defect.

### CAPITAL-1 — the default-articulation step function never reaches the distance

`src/comparison/articulationDefault.ts` is imported by **nothing in `src/`**:

```
$ grep -rn "articulationDefault" src tests | grep -v "src/comparison/articulationDefault.ts:"
tests/comparison/articulation.test.ts:30:} from '../../src/comparison/articulationDefault.js';
```

The module AD-37.1 and AD-37.2 were ruled about — the retroactive window, the three-way disposition
table, `cancelCause`, eight renderer-verified tests — is consumed only by its own test file.
`articulationDistance.ts` reads `articulationAtoms.ts` and nothing else, so `d_articulation` is the
alignment optimum over `<articulation>` atoms and the `<style>@defaultArticulation` step function
contributes zero.

Executed (`scratchpad/rt/p3-default.mjs`), three documents differing only in their default:

```
renderer CANCEL    : 50,50,100.0,100.0      (2nd <style> carries no @defaultArticulation)
renderer CONTINUE  : 50,50,50,50            (2nd <style> is unresolvable; previous default holds)
renderer NODEFAULT : 100.0,100.0,100.0,100.0

CANCEL vs CONTINUE   : D = 0   nonzero dimensions: NONE   notes: NONE
CANCEL vs NODEFAULT  : D = 0   nonzero dimensions: NONE
CONTINUE vs NODEFAULT: D = 0   nonzero dimensions: NONE
```

Every note at half duration against every note at full duration — `|ln 2| = 0.693` nepers, i.e.
**7.27 JND on every note in the piece** — and the report says the two documents are identical, in
all eleven dimensions, with no note in the channel.

**It is live on the vendored corpus.** `albert-du-mein-einzig-licht.mpm` declares
`defaultArticulation="nonlegato"` in both performances, and the two `nonlegato` defs are different
attributes in different units — `absoluteDurationChangeMs="-96.0"` (line 26) against
`absoluteDurationChange="-60.0"` (line 228). Measured through the pipeline
(`scratchpad/rt/p4b.mjs`):

```
notes: 150 | duration.perf differing: 150 | sounding-ms differing: 150
first 8 duration.perf  Axel Berndt : 720,720,1440,1440,1080,360,720,720
first 8 duration.perf  Like a robot: 660,660,1380,1380,1020,300,660,660
d_articulation on the REAL Albert pair = 92.23341974836613
articulation events = {"matched":0,"unmatchedA":67,"unmatchedB":0,"mass":92.233...}
```

All 150 notes are shortened differently and every JND of the reported 92.23 comes from the 67
dropped `<articulation>` atoms. Not one comes from the default, which is the only articulation
instruction the "robot" performance has at all.

**Why the partition test did not catch it.** `@defaultArticulation` *is* in the R9 inventory
(`tests/comparison/registry.test.ts:794`) — it is classified as an **exclusion**:

```ts
// tests/comparison/registry.test.ts:876
['defaultArticulation', 'identity: names an articulationDef (§4 *.ref in substance)'],
```

That is the `@controller` precedent (AD-36.3) applied to an attribute that is not an identity claim:
it selects *which def governs every note in a span*, and the defs carry magnitudes. It is exactly the
reasoning AD-41.1 and cut 3's DEFECT 9 rejected for `@note.order` — "filing the pair as a structural
finding scored two documents that invert an arpeggio at `d_ornamentation = 0`" — reappearing one
dimension over. So the partition test passes on a wrong classification, which is the deeper lesson:
the partition is only as strong as its three-way call, and nothing cross-checks a call of
"exclusion" against the renderer.

**Smallest repair.** Two parts, and the second is the cheap one. (a) Reclassify
`<style>@defaultArticulation` from exclusion to a live row and give `d_articulation` a second
component: the default step function is a piecewise-constant curve over the note map, so it prices
like any other step reading — `localDistance` per cell on the resolved def's effective modifier,
sustained over the cell, summed with the alignment optimum. `articulationDefault.ts` already returns
exactly the step list this needs (`steps[]` with `startTicks`/`endTicks`/`def`), which is why the
module was written. (b) Add a partition-test obligation that every *exclusion* carries a
renderer-checked reason — an attribute is an exclusion only if changing it changes no performed
value, which is a one-probe claim and false here.

---

## 2. Metric-property audit

### PASS — the cap, the ⊥ routes and the closing table

`localDistance` is correctly constructed: `⊥` against a value costs `row.delta` and the value–value
branch caps at `2 · row.delta` (`registry.ts:2347-2351`, `:2361`). Every ⊥-capable dimension reaches
the cap — the six curve/distribution readings integrate through `integrateCappedAbsolute` or the
`Math.min` cell form, and asynchrony and the event dimensions go through `localDistance` per cell or
per row, which caps by construction.

Executed at the facade with a **⊥ document as the middle term** (`scratchpad/rt/p11-metric.mjs`):

```
asynchrony         d(X,Y)=100.0000  d(X,⊥)= 55.0000  d(⊥,Y)= 55.0000  TRIANGLE OK
pedal              d(X,Y)= 36.0000  d(X,⊥)= 50.0000  d(⊥,Y)= 50.0000  TRIANGLE OK
rubato             d(X,Y)= 35.1720  d(X,⊥)= 50.0000  d(⊥,Y)= 50.0000  TRIANGLE OK
imprecisionTiming  d(X,Y)=100.0000  d(X,⊥)= 50.0000  d(⊥,Y)= 50.0000  TRIANGLE OK
```

AD-36.2 holds where the wave extended it, rubato's four new routes included.

**AD-19's closing table closes, independently recomputed** on all seven vendored pairs
(`scratchpad/rt/p12b.mjs` — I re-added every cell rather than reading `residual`):

```
telemann Baroque|Fast      D=22357.0626  table.total=22357.0626  closure_rel=1.63e-16
telemann Baroque|Romantic  D= 6493.6010  table.total= 6493.6010  closure_rel=0.00e+0
telemann Fast|Romantic     D=21686.7196  table.total=21686.7196  closure_rel=0.00e+0
vulpius  Baroque|Romantic  D= 8849.3905  table.total= 8849.3905  closure_rel=0.00e+0
vulpius  Baroque|Amateur   D=10294.4974  table.total=10294.4974  closure_rel=0.00e+0
vulpius  Romantic|Amateur  D= 2939.6596  table.total= 2939.6596  closure_rel=1.55e-16
albert   Axel|Robot        D= 8929.5188  table.total= 8929.5188  closure_rel=0.00e+0
rowSum error ≤ 0  colSum error ≤ 1.82e-12
```

AD-19's ≤ `1e-12·D` pin is met with four orders to spare, on real corpora with atoms and parts.
**P-C2 survives unequal part sets in both directions** (MSM 3 parts, `b` shadowing part 1:
`d(A,B) = d(B,A) = 18.073709332905647` exactly, aggregate likewise), and **zero-set transitivity
holds** across a ppq change and a `tempoDef` indirection (`d(X,Y)=d(Y,Z)=d(X,Z)=0`).

**AD-50.3's all-three-middles repair is real and load-bearing.** Removing §4's cap fails the
FAMILY's triangle test and not only the dedicated one:

```
× P-C3 triangle inequality — asynchrony > holds for every triple with EVERY member as the middle term
× the family reaches the paths the wave could not see > reaches the cap
  Tests  2 failed | 126 passed
```

### CAPITAL-2 — the per-part sum counts MPM `<part>` elements, not what performs

AD-53.2 ratified the per-part SUM with the justification that "the per-part sum counts what is
performed". It does not. It counts `<part>` elements in the **MPM**, and the renderer does not.

Executed (`scratchpad/rt/p14b.mjs`). One MSM with three parts; two MPMs carrying only a global
`tempoMap` (120 against 90); `k` = the number of **empty** `<part>` elements added to both MPMs:

```
perform(a,k=0) === perform(a,k=3) ?  true          <- byte-identical performed MSM
perform(b,k=0) === perform(b,k=3) ?  true

 k=0  d_tempo=  23.301064   D=  23.301064   parts=[null]
 k=1  d_tempo=  23.301064   D=  23.301064   parts=[null,1]
 k=2  d_tempo=  46.602128   D=  46.602128   parts=[null,1,2]
 k=3  d_tempo=  69.903192   D=  69.903192   parts=[null,1,2,3]
```

Adding `<part><header/><dated/></part>` — which the renderer provably ignores, since the performed
documents are byte-identical — **triples the reported distance**. That is the module's central
promise failing at the level of a pair: two pairs whose documents perform identically, scored 3×
apart.

The converse is the same bug from the other side. At `k = 1` the MSM's parts 2 and 3 have no MPM
counterpart, so under AD-52.2 — which this wave ruled renderer-true and which I confirmed in §1 —
they inherit the global map and the renderer performs it three times. The comparison counts it
**once**. The counting is neither "MPM scopes" nor "what performs" consistently: it is `max(1, k)`.

This is not a corner. `multi_part.mpm` and `composite_advanced.mpm` in the repo's own fixtures both
declare parts with an empty `<dated/>`. And the ratified Telemann pin — "a three-part document whose
parts all inherit one global `tempoMap` scores exactly 3× the global-only pair" — is measuring this
artifact: the 3 is the MPM's part-element count, and the same document with those elements removed
performs identically and scores 1×. Every headline number in AD-53's table (`22357.06`, `6493.60`,
`21686.72`) carries the factor.

**Smallest repair.** Drive the part scopes from the **MSM's** part list when an MSM is supplied —
which is what `renderParts` iterates and therefore what performs — pairing each MSM part with its
MPM counterpart or, when there is none, with that document's global scope (AD-52.2's rule, already
implemented one level down). With no MSM there is no part count to use and the present MPM-driven
count is the only available reading; that case should stamp the `estimate-degradation` note the
driver already has. Either way the rule belongs in §7.5 in one sentence, because AD-53.2's
justification currently names a quantity the code does not compute.

### MAJOR-1 — the metric-property suite covers six of the eleven dimensions

`tests/comparison/metricProperties.test.ts:41-48`:

```ts
const DIMENSIONS = ['tempo','dynamics','asynchrony','accentuation','pedal','imprecisionTiming'];
```

P-C1/P-C2/P-C3/P-C3b never run on **rubato**, **articulation**, **ornamentation**,
**imprecisionDynamics** or **imprecisionDuration**. Two of those absences matter:

- **articulation and ornamentation are the two event dimensions**, whose distance is an *argmin over
  monotone alignments*. That is the only construction in the module where the triangle inequality is
  a structural question rather than a numerical one, and AD-42.3's justification for
  deviation-from-neutral pricing is precisely a metric argument — "gap(a) ≤ sub(a,b) + gap(b) is the
  T-space triangle inequality anchored at neutral". That argument is made in prose and tested
  nowhere.
- **rubato gained its first four ⊥ routes in this very wave** (W3b part 9) and the capped integrator
  with them. It has one dedicated triangle test with a ⊥ middle term and no family coverage.

I searched for a violation rather than assuming one. Over 30 pseudo-random articulation documents
(24 360 ordered triples, `scratchpad/rt/p15-event-metric.mjs`) and 6 ornamentation members including
a `@time.unit`-mismatched ⊥ member (`p16-orn-metric.mjs`):

```
ARTICULATION   P-C1 violations: 0   P-C2 worst asymmetry: 0   P-C3 worst violation: 0 (none)
ORNAMENTATION  P-C1 violations: 0   P-C2 worst asymmetry: 0   P-C3 worst violation: 0 (none)
```

So this is a **blind spot, not a live defect** — the properties appear to hold. But the family exists
because "a family that merely CONTAINS a hazard is not a family that REACHES it" (AD-50.3), and the
five uncovered dimensions include the two whose metric status is argued rather than computed.

**Smallest repair.** Extend `DIMENSIONS` to all eleven and extend `ADVERSARIAL_FAMILY` with one
member per uncovered failure surface: an articulation anchor set that forces a non-trivial alignment,
an ornament with a `@time.unit` ⊥, and a rubato ⊥ member (the wave already built all three fixtures
elsewhere).

### MINOR-1 — the below-threshold remainder is a negative mass

`report.remainder.mass` is negative on four of the seven vendored pairs:

```
telemann Baroque|Fast     remainder.mass = -1.825996    (Σ segment mass 22358.8886 > D 22357.0626)
telemann Fast|Romantic    remainder.mass = -1.452385
vulpius  Romantic|Amateur remainder.mass = -0.001170
albert   Axel|Robot       remainder.mass = -0.030741
```

§7.3's remainder is the mass of the below-threshold region; a mass is non-negative. It goes negative
because it is computed by subtraction from the row total (which is what makes closure exact — the
right choice) while the segments' own mass carries the root-refinement's quadrature error. The
magnitude is ~8e-5 of `D`, so no headline number is wrong, but it is a caller-visible field holding
an impossible value, and P-C11's walker cannot see it because it is finite. **Repair:** clamp at 0
and carry the clamped magnitude as a diagnostic, or state the sign convention in §7.3 and §9.3.

---

## 3. Numerical audit

Independent references throughout: `mpmath` at 60–80 dps for Φ/Φ⁻¹, the *renderer's* own sampler
(`RandomNumberProvider.ts:335-353`) for the clipped laws, and closed forms derived from
`W₁ = ∫₀¹|Q_A − Q_B| du` rather than copied from the module's tests.

### PASS — the Wasserstein core is genuinely machine-precise

```
W₁  vs 23 closed forms I derived      ≤ 2.842e-16 relative   [published ≤ 3.6e-16 on six — honest]
W₁  symmetry |d(A,B) − d(B,A)|          0.0 over 47 pairs
W₂  uniform identity (da²+da·db+db²)/3 ≤ 3.662e-16          [identity re-derived before testing]
W₂  §1.2 closing identity              4.1017e-14 relative over 169 ordered pairs, MY 13-law family
W₂  moments (σ)                        ≤ 1.455e-15          [published ≤ 1.5e-15 — holds]
ρ(U,T) vs 7√2/10                       bit-exact (difference exactly 0)
ρ(U,N) vs √(3/π)                       1.02e-15 … 1.25e-15  [published 1.1e-15 — honest]
Φ   worst absolute over z ∈ [−37, 37]  1.9181e-16           [published 1.7e-15 — 8.9× conservative]
Φ⁻¹ round trip                         8.3267e-15           [pinned < 1e-13 — holds]
P-C5 worst |ratio − 1|                 2.554e-15 over 7 dimensions [pinned 1e-9 — holds]
```

Both ρ constants were re-derived from scratch before comparison and both reproduce. No code fast
path exists (`RHO_UNIFORM_*` appears in `src/` only at its declarations, `distributions.ts:812,822`),
which is AD-49.5 as ruled. The Gaussian mixture edges are correct **and renderer-faithful for the
right reason**: `lo == hi` and `lo > hi` both yield the untruncated `N(center, σ)` because
`d ≤ L && d ≥ L` is a probability-zero event and `d ≤ −30 && d ≥ 30` is never true — the module
matches the renderer rather than guessing a convention. `ClippedLaw`'s atoms match a 4·10⁶-draw
Monte Carlo of the renderer's own procedure to ≤ 1.03e-7 (the stream's discretization floor), and the
quantile is a genuine generalized inverse over 17 laws × 200 001 nodes with zero monotonicity
violations.

P-C5 reruns clean (39 passed) and the three exceptions are exactly the ratified anchors: rubato
**0.79988477478049869**, dynamics past the velocity clamp **0.76085268807818307**, pedal `d = 0` for
every factor. Every skip is caused by a *reported* site — nothing is silently swallowed.

### CAPITAL-3 — `triangularSupport` is wrong when the mode lies outside the limits, and it reaches shipped reports

`src/comparison/distributions.ts:369-370` leaves the branch `fraction` unclamped:

```ts
const lo = fraction >= 1 ? law.lower : law.upper - Math.sqrt(scale * aboveMode * (1 - fraction));
const hi = fraction <= 0 ? law.upper : law.lower + Math.sqrt(scale * belowMode * fraction);
```

For `mode > upper` the rising branch runs to `u = 1`, so the true supremum is
`lower + √(scale·belowMode)`; the code returns the **mode itself**. Against the renderer's own
sampler:

| law            | module support   | sampler actually reaches |
| -------------- | ---------------- | ------------------------ |
| T(−30, 30, 99) | [−30, **99**]    | [−30, **57.977270**]     |
| T(0, 1, 1000)  | [0, **1000**]    | [0, **31.622777**]       |

The CDF itself is right (`Math.min/max` clamps it, and the module's headline claim against the
textbook formula is verified: `F(30) = 0.4651162790697674`, not 1). The damage is that the true
support endpoint — where the integrand kinks — never enters `cdfBreakpoints` (`:687-690`), so GL-10
straddles it:

```
W₁  T(−30,30,99)  vs δ₀           shipped 30.977459211857905  true 30.977094589809564  rel 1.177e-05
W₁  T(0,1,1000)   vs δ₀           shipped 21.306735147091828  true 21.081851067789195  rel 1.067e-02
W₁  T(−30,30,1000) vs T(−30,30,0) shipped 135.74127617616963  true 135.73070526208071  rel 7.788e-05
```

**It reaches the facade.** `imprecisionLaws.ts:471` passes `mode` through unclamped, so with clips
present the law survives canonicalization:

```
facade d(mode=99,   mode=0) = 7.6405007510690846   (correct hull 7.6404035185228585, rel 1.27e-05)
facade d(mode=1000, mode=0) = 23.506652283351304   (correct hull 23.504821692032248, rel 7.79e-05)
```

That is 3.3·10¹⁰ times the `imprecision` family epsilon the same report publishes. A mode outside the
limits is not a malformed input the module rejects — §5.9's own rewritten `triangularCdf` exists
*because* the renderer admits it.

**Smallest repair**, verified to restore machine precision (rel 1.69e-16 and 4.59e-16) and to leave
the mode-inside behaviour bit-identical:

```ts
const rise = Math.min(1, Math.max(0, fraction));
const lo = fraction >= 1 ? law.lower : law.upper - Math.sqrt(scale * aboveMode * (1 - rise));
const hi = fraction <= 0 ? law.upper : law.lower + Math.sqrt(scale * belowMode * rise);
```

Secondary consequence: the overstated hull stops `clippedLaw` (`:270`) collapsing a clip that is
vacuous in truth, so `lawsEqual(base, clipped)` is `false` where the laws are equal. `W₁` between them
is still exactly 0, so P-C1 survives; the canonicalization promise does not.

### MAJOR-2 — the `imprecision` epsilon record is falsified twice over

`src/comparison/compare.ts:106-124`, surfaced at `report.inputs.epsilon`:

```
imprecision: { relative: 3.6e-16, jnd: 3.6e-16 }   // "W₁ against six closed forms, Φ at 1.7e-15"
```

(i) By CAPITAL-3 the worst measured relative error is **1.18e-5** on a law the reader constructs
unclamped — optimistic by 3.3·10¹⁰×. (ii) Independently of that defect, `W₁` is computed as
`∫|F_A − F_B| dx` over the union support, so a small answer is a small difference of large integrals
and the *relative* figure is not what is machine-precise:

| pair                                | exact W₁ | abs err  | rel err       | err/support |
| ----------------------------------- | -------- | -------- | ------------- | ----------- |
| U(−30,30) vs U shifted 6            | 6.0e+0   | 1.78e-15 | 2.96e-16      | 2.96e-17    |
| U(−30,30) vs U shifted 6e-6         | 6.0e-6   | 2.30e-16 | **3.83e-11**  | 3.83e-18    |
| U(−30,30) vs U shifted 6e-12        | 6.0e-12  | 2.10e-16 | **3.50e-05**  | 3.50e-18    |
| N(0,100) vs N(0,100(1−1e-10))       | 7.98e-9  | 6.68e-15 | **8.38e-07**  | 5.57e-18    |

The quantity that really is at machine precision is the error **relative to the laws' support scale**
(≤ 2.96e-17), and that is not what the field publishes. The comment also cites Φ at 1.7e-15 as
backing for a 3.6e-16 figure — the cited contributor is 4.7× the published family epsilon.
**Repair:** land CAPITAL-3's clamp, then restate the field against the support scale or add the
caveat that the relative figure applies to well-separated pairs and the JND figure is the operative
one.

### MAJOR-3 — `standardNormalQuantile` loses seven orders in the right tail, and its pin cannot see it

| p            | relative error vs mpmath |
| ------------ | ------------------------ |
| 1e-13        | 1.41e-17                 |
| 1 − 1e-13    | **1.124e-09**            |
| worst left   | 2.51e-15                 |
| worst right  | **1.1238e-09** (4.5e5× asymmetry) |

The Halley residual at `distributions.ts:523` is `standardNormalCdf(x) − p`, which cancels completely
as `p → 1`, so the correction is noise and Acklam's raw 1.15e-9 survives. The doc at `:474-479` claims
the step "takes it to the CDF's own accuracy" and that this "is pinned as a round trip" — but the
round trip at `:144-147` measures `|Φ(Q(p)) − p| / p`, which in the right tail is **exactly 0.000e+00**
at every probe, and the test's `p`-list stops at 0.999999. The metric is blind there by construction.
Downstream impact is contained today (W₂'s end panels reach only `u = 1 − 1e-12`, and σ still lands at
1.44e-15), so this is a claim-and-pinning defect rather than a wrong shipped number. **Repair:**
compute the residual complementarily for `x > 0` (`(1 − p) − Φ(−x)`, negated), reusing the
left-tail-accurate branch, and add `p = 1 − 10^-k` to the round-trip list with the check on `1 − p`.

### MINOR (3)

- **MINOR-2 — the published Φ left-tail relative figure is optimistic** because the reference it was
  measured against could not see the error. `distributions.test.ts:80` scans only `x ∈ [−8, 8]`
  against a GL-10 composite; within that range the true worst is **7.33e-14**, not 4.9e-14, and to
  −37σ it is **2.28e-13**. The peak sits just under `ERFC_CONTINUED_FRACTION_LIMIT = 2` (`:389`),
  where `1 − erfSeries` still cancels ~2 digits. The asserted tolerance (`:101`, `< 1e-10`) is 2000×
  looser than the published figure, so nothing defends it. (For the record, the 2.6e-3 relative error
  at z = −38.375 is the *subnormal representation floor*, not the algorithm.)
- **MINOR-3 — P-C5's non-vacuity comment overstates its assertion.** `crossModule.test.ts:221-222`
  says "at least three factors on each side of 1 really were unsaturated" but asserts
  `checked ≥ 3` on the total, and `FACTORS = [0.25, 0.5, 1.5, 2, 4]` has only two values below 1, so
  "three on each side" is arithmetically impossible. Measured per fixture: dynamics reaches 3/5 with
  exactly one factor above 1. The guard is real but weaker than advertised.
- **MINOR-4 — two dimensions are absent from the P-C5 record.** `imprecisionDynamics` and
  `imprecisionDuration` are never exercised, while the LOG's "seven of the eleven … the three
  exceptions" framing implies ten are accounted for.

---

## 4. Test-vacuity hunt

Twelve substantive W3 tests were checked by patching the implementation they pin, running the
affected suite, and restoring with `git checkout --`. Every patch was verified to apply, and the tree
was verified clean after each.

| #   | patch                                                                | suite                              | result       |
| --- | -------------------------------------------------------------------- | ---------------------------------- | ------------ |
| 1   | `clip()` passes the draw through when the clip bounds are null       | `imprecisionDegenerate.test.ts`    | **1 failed** |
| 2   | the alignment DP never takes the `match` move                        | `eventAlignment.test.ts`           | 10 failed    |
| 3   | `composeAnchors` returns its input uncomposed                        | `ornamentation.test.ts`            | 3 failed     |
| 4   | the retroactive window removed (`startTicks: step.dateTicks`)        | `articulation.test.ts`             | 2 failed     |
| 5   | §4's cap removed (`cap = +Infinity`)                                 | metric/registry/imprecision        | 4 failed     |
| 6   | tempo's `densityAt` replaced by a stand-in                           | `densityAt.test.ts`                | 1 failed     |
| 7   | Ruzzo–Tompa absorbs boundary zeros (`score >= 0`)                    | `aggregate.test.ts`                | 3 failed     |
| 8   | canonicalization applied to the raw value, not in T-space            | `registry` + `invariance`          | 2 failed     |
| 9   | the drift ratio no longer inverts under swap                         | `properties.test.ts`               | 7 failed     |
| 10  | event `cappedCells` forced to 0 (the AD-2 defect P-C5 found)         | `crossModule.test.ts`              | 2 failed     |
| 11  | P-C3 reverted to ONE fixed middle term                               | `metricProperties.test.ts`         | 6 failed     |
| 12  | §4's cap removed, family triangle test only                          | `metricProperties.test.ts`         | 2 failed     |

**All twelve are falsifiable. No survivors.** This is the strongest area of the wave.

**The conductor-authored test passes its extra-weight audit.** `imprecisionDegenerate.test.ts`
carries AD-54.6's special scrutiny and it earns its place: making `clip()` a passthrough when the
bounds are absent — the exact mechanism AD-47 pinned — fails its single test. Its non-vacuity control
(`expect(c).not.toEqual(b)`) is a real control and not decorative.

One observation on it, **MINOR-5**: the test renders `withClips` with no `@seed` and no
`PerformOptions.seed`, so that arm draws from `Math.random()` and the test is not deterministic. The
assertion it guards is robust (continuous draws collide with probability ~0), but a `Math.random()`
dependency sits oddly in a suite that pins byte-identity elsewhere, and #12 above shows the campaign
knows the difference. Passing a fixed `seed` to the `withClips` render costs nothing and removes it.

Two blind spots worth naming even though the tests themselves are sound:

- **The P-C2 swap-map test exercises symmetric content only.** Its six pairs are all *same-document*
  pairs plus `neutralMpm`, and on every one of them the report is genuinely mirror-symmetric. The
  aligner's tie-break asymmetry (§6, MAJOR-6) appears only on *cross-document* pairs, which the
  fixture list does not contain — so the test is real but its corpus cannot reach the one asymmetry
  that exists.
- **P-C11's walker is thorough and its coverage is honest** — it is the finiteness discipline, and it
  found nothing because there is nothing to find (§6 confirms with an independent walker). It cannot
  see MINOR-1's negative mass, because a negative mass is finite.

---

## 5. Design-coverage walk

### CAPITAL-4 — AD-51.1's ruled report field `cellQuantizedDimensions` was never surfaced

AD-51.1 **[BINDING]** (`LOG.md:3232-3240`) keeps the optional-`densityAt` machinery as "(i) the
graceful path … and (ii) **the honest report field** naming approximate boundaries wherever they
occur." The field exists only on the internal `SegmentPass` (`aggregate.ts:135`, populated at `:364`)
and is dropped at the report boundary: `grep -rn cellQuantizedDimensions src/` hits `aggregate.ts`
alone, `compare.ts` never reads it, and `ComparisonReport` (`report.ts:200-275`) has no such member.
Probed top-level keys: `inputs, window, ppq, parts, comparability, measures, dimensions, aggregate,
segments, remainder, table, equivalence, cumulativeDrift, profiles, notes`.

A binding ruling's named deliverable is absent from the shipped surface. **Repair:** add
`readonly cellQuantizedDimensions: readonly ComparisonDimension[]` beside `segments`, wire
`pass.cellQuantizedDimensions` through `compare.ts`, and add the field to §9.3.

### CAPITAL-5 — C7's MSM arm is unimplemented, and its absence is silent

§5.0/C7 (`DESIGN.md:770-772`) requires the length-mismatch check "**and the same check against the
score end when an MSM is supplied**". No such check exists: `SUSPECT_LENGTH_RATIO` is consulted only
at `compare.ts:338`, against a `lengthRatio` that `document.ts:322` computes from the two MPMs alone.
Probed with the Telemann MPM (last date 198 quarters) against the **Vulpius** MSM (score end 54
quarters):

```
MPM last date 198   window from MSM 54   rule msm
length-mismatch note fired? false        suspectPair? false
```

73 % of the piece is silently truncated by a mismatched score and the report says nothing — which is
exactly the hazard C7 was adopted (AD-23) to catch. **Repair:** extend the `suspectPair` predicate
with `msm !== null && min(lastDate, msmEnd)/max(lastDate, msmEnd) < band`.

### MAJOR findings (12)

| id       | finding                                                                                                                                                                                                                       | evidence                                                                             |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| MAJOR-4  | `equivalence.byDimension[k].aboveThresholdLengthFraction` **is not a fraction** — it divides a sum over all part scopes by one window length, so it exceeds 1. §7.3's mandated sentence template would print "300 % of the window". | `aggregate.ts:693`; telemann tempo **3.0000**, albert dynamics 3.0000, vulpius 1.3333. The only test (`aggregate.test.ts:465`) uses one synthetic scope and pins 0.5 |
| MAJOR-5  | §7.1's **tempo JND row contradicts binding AD-27.6** and the shipped constant by 2×: DESIGN says `ln(1.05)` `[convention]`, code ships `ln(1.025)` `[literature]`                                                              | `DESIGN.md:1765` vs `registry.ts:251`; AD-27.6 at `LOG.md:661-664`                    |
| MAJOR-6  | The **notes comparator is not total**, and does not use the key §9.5 names (`site`). Four Albert notes tie on all five sort keys with four distinct serializations; their order is decided by sort stability                     | `compare.ts:929-937`; §9.5 at `DESIGN.md:2689`. P-C2 cannot catch it — `properties.test.ts:111-118` re-sorts with the same partial comparator |
| MAJOR-7  | `SUSPECT_LENGTH_RATIO = 0.5` contradicts §5.0's documented `[0.8, 1.25]` band; a 1.67× length mismatch passes silently, and no test pins either number                                                                          | `compare.ts:147` vs `DESIGN.md:770-771`; ratios 0.79 and 0.60 → `suspectPair=false`   |
| MAJOR-8  | `PROFILE_MAX_POINTS = 4096` is undeclared anywhere in DESIGN or the LOG, and silently coarsens a caller's explicit `grid.step` by 48× while reusing the `grid-truncated` note kind, whose §9.1 gloss means something else       | `compare.ts:150`, `:1067-1077`; requested step 0.001 → actual 0.04835                 |
| MAJOR-9  | §9.5's "key order is pinned (A9)" has **no test**; both tests that touch key sets `.sort()` them first, and P-C2 only compares the engine against itself                                                                        | `aggregate.test.ts:440`, `compare.test.ts:458`                                        |
| MAJOR-10 | Three binding §5.6 amendments **never landed in DESIGN**: AD-44.1/45.1 (gradients compose, direction included), AD-44.2/45.2 (equal-intensity spreads sum), AD-40.3 (single-note pool performs `transition.to`)                 | implemented and tested (`ornamentation.test.ts:512-561`); absent from `DESIGN.md` §5.6 (1180-1289) |
| MAJOR-11 | `meanSigned` is **averaged** over part scopes while `distance` is **summed**, with no field or note saying so and no ruling covering it (AD-53.3 ratified three merge decisions; this is an unratified fourth)                    | `compare.ts:536-541`; telemann `mean = 8.605` against `meanSigned = −0.0708`          |
| MAJOR-12 | AD-8's trailing transition ships as a `structural` note, not the **`inert-difference`** kind §9.1 defines and §10 names as a fixture obligation; the kind is emitted from exactly one site, for articulation atoms               | `DESIGN.md:2156`, `:2818`; `dimensions.ts:771`                                        |
| MAJOR-13 | §10's **P-C8 has no test anywhere** and its note half does not fire: an explicit neutral instruction against an absent map gives distance 0 (correct) with **no structural note** (required)                                     | `DESIGN.md:2796-2799`; `grep -rlo 'P-C8' tests/` → nothing                             |
| MAJOR-14 | §10's **P-C6 (determinism) has no test at the pairwise path**. The property holds (§6 verified byte-identity across processes), but nothing pins it, so a future `Map`-iteration regression in the report builder is uncaught     | `DESIGN.md:2786`; `tests/api/determinism.test.ts` never mentions `compareMpm`         |
| MAJOR-15 | `DESIGN.md:704-706`'s global-vs-part-local structural note is not emitted: identical `<tempoMap>` placed globally in `a` and part-locally in `b` gives distance 0 and **no note**; no test covers it                             | probe: `note kinds: (none)`                                                           |

### §9.3 completeness and §9.4 validation — both walked row by row

Every §9.3 field was probed on a real fixture pair and is **present with a sane value** —
`dimensions` in `COMPARISON_DIMENSIONS` order, `aggregate`, `segments` with the six promised members
plus four more, `table`, `decomposition` with its null-conditions honoured (null for the two event
dimensions; `shape`/`r` null iff shapeless), all twelve note kinds reachable, `cumulativeDrift`
(surviving `weights:{tempo:0}` as §9.3 requires), `equivalence`, opt-in `profiles` (null when
omitted), signed descriptors, the five-family `epsilon`, `window.rule`/`metricGuarantee`,
`ppq.fallbackUsed` + `unusableDeclaration`, AD-39.1's id-anchored window-exemption statement, C9's
`invariance-space` note, AD-52.3b's `estimate-degradation` note, the `L = 0` typed note,
`datePositionKnown`, `cappedCells` — **with the single exception of `cellQuantizedDimensions`**
(CAPITAL-4) and the out-of-domain values in `equivalence` (MAJOR-4).

§9.4's table is **implemented row for row with the correct error types and the correct ordering**,
which is the wave's best-specified surface. Verified by probe: options are validated before any
document is parsed (a non-XML `a` together with a misspelled dimension yields the misspelling); the
documents are parsed `a`, `b`, `msm` with role-precise prefixes (`MPM a:` / `MPM b:` / `MSM:`); every
unknown-key message names *all* offenders; `invariance` on an event dimension is rejected with AD-20
cited while `asynchrony`/`imprecisionTiming` are correctly allowed; `qbpm ≤ 0` reports the document
and the tick. Gaps are minor: a missing `a` is a `ParseError` rather than an `InvalidOptionError` and
its message says "got nothing" for `a: 42`; and three things the facade validates
(`plausibleRange`'s value domain, `profile.dimensions`, `profile.grid.step`) have no §9.4 row.

### §7 and §5.4–§5.9

§7.1's provenance tags are complete **and tested row by row** (`registry.test.ts:189-195`) — only the
tempo *value* diverges (MAJOR-5), and the table lists 5 of the 8 shipped constants. §7.2's
zero-weight handling is specified and correct (a zeroed dimension keeps its `d_k` and its row in the
table, `residual` stays 0, `cumulativeDrift` survives). §7.3's tie rule and arbitrary-partition
closure are implemented and tested. §7.4's three modes, per-row centering, event-dimension rejection
and `σ = 0 → shapeless` all hold.

The §5.4–§5.9 sweep found every stated obligation implemented and tested except the DESIGN-currency
gaps in MAJOR-10. The delegated amendments that **did** land, verified present:
AD-49.1/.2/.3/.4/.5/.6/.7/.8, AD-40.1 (reciprocal both ways), AD-41.1, AD-44.3, AD-52.3a.

### MINOR findings (11)

`λ_date`'s value is nowhere in DESIGN although §5.6 claims to state it (`DESIGN.md:1197`; ships as
`DEFAULT_LAMBDA_DATE = 16`); §7.1's table omits `PEDAL_POSITION_JND_RATIO`,
`ARTICULATION_DURATION_JND_NEPERS` and `UNNORMALIZED_JND`; AD-27.2's delegated §9.3 edit for
`unusableDeclaration` never landed; `comparability.suspectPair` is undeclared in §9.3;
`inputs.settings` is `ResolvedComparisonSettings`, not §9.3's `Required<ComparisonSettings>`;
`epsilon.imprecision.relative` reports only the best of its family (see MAJOR-2); no dimension →
epsilon-family map exists although two modules' docs refer to "this dimension's entry"; §9.5's
`parts` "then `@name`" tiebreak is unimplemented (AD-27.3 superseded it); §9.4 lacks rows for three
validated options; a missing `a` has no §9.4 row; `DEFAULT_PPQ = 720` is not in DESIGN.

Undeclared behaviour beyond the MAJORs is limited to `Math.max(length, 1e-12)` in `unionDecomposition`
(`compare.ts:640`) — harmless but untraceable. The numeric-fallback sweep found nothing that silently
substitutes a value.

### MINOR-8 — `compareMpm`'s `@throws` still promises a throw that cannot happen [PRE-DECLARED]

**Recorded as a pre-declared known finding, not a discovery.** The author reported it immediately
post-handoff and deliberately left it unfixed rather than write past the accepted boundary and move
this audit's range — the right call, and the reason it is listed here rather than treated as an
escape.

Verified as declared. `src/api/comparison.ts:169` names `` `noteDensityWeight` without an `msm` ``
among the `InvalidOptionError` causes, but AD-52.3a removed the option from `ComparisonSettings`,
from the validator and from `ResolvedComparisonSettings` in `bc7a2f6`. The identifier now survives in
exactly two places in the whole tree:

```
$ grep -rn "noteDensityWeight" src/ tests/
src/api/comparison.ts:21:  * ## `noteDensityWeight` is not here (AD-52.3a)
src/api/comparison.ts:169: *   no selector, `noteDensityWeight` without an `msm`, or a document resolving a tempo ≤ 0
```

So one file states the contract two ways: the module header at `:21` correctly explains the absence,
and the `@throws` block 148 lines below still promises the throw. Doc-only — no code path is
affected, and MINOR is the right severity. It is slightly more than cosmetic only because the
`@throws` block is what an IDE surfaces at the call site while the module header is not, so the
reading a caller actually gets is the stale one.

**Repair:** delete the eight words from `:169`. No test or DESIGN change is implied; §9.2 and §9.4
were already amended under the delegation.

---

## 6. House rules

### PASS — plain data, determinism across processes, and layering

An **independently written** walker (`Reflect.ownKeys` including symbols and non-enumerables,
accessor detection, array-hole detection, ancestor-stack cycle guard) over **25 `compareMpm` results
and ~52 000 nodes** found **zero violations**: no `undefined`, `NaN`, `±Infinity`, `-0` (by
`Object.is`), `Map`, `Set`, `Date`, `RegExp`, TypedArray, function, bigint, symbol, or non-plain
prototype. Coverage: all three multi-`<performance>` fixtures paired every way, plus
document-against-itself, against `neutralMpm`, all-zero weights, `-0` weights, and a 0.001-quarter
window, with and without `msm` and profiles. The walker was self-tested against 13 planted defects
and caught all 13.

Cross-process determinism holds — three real pairs, separate `node` processes, `JSON.stringify`
sha256 byte-identical:

```
telemann Baroque|Romantic  59b306bb…  52738 B
vulpius  Baroque|Amateur   ba1e541a…  89433 B
albert   Axel|Robot        83ce9323…  87874 B
```

No `Math.random`, `Date.now`, `new Date`, `performance.now`, `crypto` or `uuid` in
`src/comparison/**` or `src/api/comparison.ts` (the two grep hits are JSDoc describing the
*renderer*). Layering is clean: `'**/api/**'` **did** land in the comparison zone
(`eslint.config.js:144`, MINOR-5 from W2 discharged), zero `src/comparison → src/api` edges exist, and
a negative control in a scratchpad copy confirms the zone rejects `../api/comparison.js`,
`../mpm/Mpm.js` and `../msm/Msm.js` while permitting the `bezier.js` carve-out.

### CAPITAL-6 — `localeCompare` makes a shipped distance depend on the host locale

`src/comparison/articulationDistance.ts:235`:

```ts
.sort((x, y) => x.dateTicks - y.dateTicks || (x.id ?? '').localeCompare(y.id ?? ''));
```

The same module bans this by name 700 lines away — `compare.ts:940`: *"Code-unit order, never
`localeCompare` — the report must not depend on a locale (§9.5)."* It is reachable end to end. Two
documents with two articulation anchors per side at one date and disjoint id sets (so the aligner's
id-pin path cannot fire and pairing falls back to list position):

```
LC_ALL=en_US.UTF-8   'ä' vs 'z' = -1   d_articulation =  0
LC_ALL=de_DE.UTF-8   'ä' vs 'z' = -1   d_articulation =  0
LC_ALL=sv_SE.UTF-8   'ä' vs 'z' = +1   d_articulation = 13.468737284729558
LC_ALL=da_DK.UTF-8   'ä' vs 'z' = +1   d_articulation = 13.468737284729558
```

Report sha256 `e428c077…` against `7883c68f…`. This is a **distance**, not a descriptor. ASCII is
affected too (`'a'.localeCompare('B') === -1` where code-unit order says `+1`; likewise `'x_1'` vs
`'x-1'`), and it also moves under small-icu/no-icu Node builds and ICU/CLDR upgrades. The vendored
corpus is stable only because every `@noteid` in it is a lowercase `meico_<uuid>`, where collation and
code-unit order coincide — which is precisely why the determinism suite does not see it.

**Repair:** replace with the code-unit comparison the sibling module already uses:

```ts
const xi = x.id ?? '', yi = y.id ?? '';
return x.dateTicks - y.dateTicks || (xi < yi ? -1 : xi > yi ? 1 : 0);
```

### MAJOR-16 — `.prettierignore` exempts the whole wave; 28 unformatted files ship

`.prettierignore:39` is `comparison/`, with **no root anchor**. Gitignore semantics match at any
depth, so it swallows `src/comparison/**` and `tests/comparison/**` as well as the campaign-record
directory it was written for. The wave's own rewrite of that file documents this exact hazard three
lines above, for the sibling entry — *"The old `/expression/` entry needed a root anchor to avoid also
catching src/expression/ and tests/expression/"* — and `comparison/` never got the anchor.

```
$ npx prettier --check src/comparison/ tests/comparison/
All matched files use Prettier code style!          # vacuous: every file is ignored

$ npx prettier --ignore-path <empty> --check "src/comparison/**/*.ts" "tests/comparison/**/*.ts"
[warn] Code style issues found in 28 files.
```

All 28 are files this wave touched, and the drift is real (`aggregate.ts` 22 lines, `compare.ts` 17,
`properties.test.ts` 31; `aggregate.ts:360` is 105 characters against a `printWidth` of 100).
`npm run verify` is `build && typecheck:tests && vitest run` — it runs neither `lint` nor
`format:check`, so nothing in the gate can see this. The unanchored entry predates `b9444cf`, but the
wave rewrote the file with the anchoring lesson in the same diff and shipped 28 files behind it.
**Repair:** `comparison/` → `/comparison/`, then `npm run format`.

### MAJOR-17 — the alignment DP's tie-break is not swap-symmetric

All eleven `dimensions.*.distance`, `aggregate.distance/mean` and `events.mass` are invariant on
every pair tested, and all seven *same-document* real pairs are fully clean. On **cross-document**
pairs these caller-visible fields are neither invariant nor mirrored:

```
aller-augen | bach   events (matched, unmatchedA, unmatchedB)
   compareMpm(a,b) = [0, 35, 396]        compareMpm(b,a) = [18, 378, 17]
   segments[0].peak = 265.50309883313116  vs  266.6948172174056   (same mass, mean, peakAtQuarters)
albert | bach        [9, 58, 330]  vs  [40, 299, 27]
```

The event totals agree both ways, so the mass integral is preserved and only the *matching* differs.
Root cause: `eventAlignment.ts` `solve()`'s strict `match → dropA → dropB` cascade. Its comment says
the order "is fixed and strict" — but *fixed* is not *symmetric*: at an equal-cost tie, swapping `a`
and `b` selects the mirror-image optimum, a different alignment of identical cost. `matched` and
`segments[].peak` are shipped fields that contradict themselves under argument order, and §9.5's P-C2
promise is about the whole report, not only its distances. **Repair:** break equal-cost ties on a
symmetric key — prefer `match`, then the drop whose event has the smaller `dateTicks`, then the
smaller `id` in code-unit order.

For calibration, the full leaf classification on telemann (with profiles, all eleven dimensions) is
`invariant=2027 mirrored=202 signflip=189 reciprocal=1 unexplained=0`, and vulpius
`2646/159/89/1/0` — every non-invariant field is legitimately document-ordered and correctly
mirrored. The asymmetry above is the only unexplained one.

### MINOR (2)

- **MINOR-6 — `src/index.ts:224` lints.** `@typescript-eslint/no-unnecessary-condition`, and it is
  **pre-existing**: the same error appears at `:184` in a scratchpad extract of `b9444cf`. The wave
  only shifted it by 40 lines. (Repo-wide `eslint .` reports 1054 problems, all outside the wave's
  scope and all pre-existing; `lint` is not in `verify`.) `tests/midi/Midi.test.ts` is the one
  genuinely unformatted file outside the wave, last touched at `67b407e`.
- **MINOR-7 — the comparison eslint zone's `why` and its `forbidden` list disagree.** The `why` says
  the zone permits `src/xml`, `src/supplementary`, `src/expression`, the MPM name constants and the
  Bézier math "**and nothing else**", but `**/music/**` and `src/units.ts` are absent from
  `forbidden` and a probe importing them is not flagged. Zero live violations today. Also worth an
  explicit tiebreak: `tempoCurve.ts:340`, `accentuationCurve.ts:164` and `msm.ts:119` sort object
  arrays on a single numeric key, so simultaneous entries are ordered by sort stability — deterministic
  per input, but implicit.

---

## Wave verdict

**GATE-BLOCK.**

### Must fix before W4

| id        | severity                        | finding                                                                                                   | site                                                                     |
| --------- | ------------------------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| CAPITAL-1 | whole mechanism unpriced        | the default-articulation step function reaches no evaluator; three documents at 50/100/mixed durations compare `D = 0`; live on the Albert fixture across all 150 notes | `articulationDefault.ts` (unimported); `registry.test.ts:876` misclassifies `@defaultArticulation` as an exclusion |
| CAPITAL-2 | wrong number, up to N×          | the per-part sum counts MPM `<part>` elements, not what performs; adding empty parts triples `D` on byte-identical performances; AD-53.2's Telemann 3× pin measures the artifact | part-scope construction in `dimensions.ts`/`compare.ts`; §7.5             |
| CAPITAL-3 | wrong published number          | `triangularSupport` overstates the hull when `mode` lies outside the limits; reaches the facade at 1.3e-5 … 7.8e-5 relative | `distributions.ts:369-370`; `imprecisionLaws.ts:471`                      |
| CAPITAL-4 | binding ruling unimplemented    | AD-51.1's `cellQuantizedDimensions` report field was never surfaced                                        | `aggregate.ts:135,364`; `report.ts:200-275`; §9.3                        |
| CAPITAL-5 | silent 73 % truncation          | C7's MSM arm — the length check against the score end — does not exist                                     | `compare.ts:338`; `document.ts:322`; `DESIGN.md:770-772`                  |
| CAPITAL-6 | locale-dependent distance       | `localeCompare` in the articulation anchor sort; `d_articulation` 0 → 13.47 under `sv_SE`/`da_DK`          | `articulationDistance.ts:235` (banned by name at `compare.ts:940`)        |
| MAJOR-1   | untested central claim          | metric properties cover 6 of 11 dimensions; the two event dimensions and rubato's new ⊥ routes are unpinned (searched: no violation found) | `metricProperties.test.ts:41-48`                                          |
| MAJOR-2   | dishonest record                | the `imprecision` epsilon is falsified by CAPITAL-3 and by ordinary near-identical pairs                    | `compare.ts:119`                                                          |
| MAJOR-3   | blind pin                       | `standardNormalQuantile`'s right tail is 1.12e-9 and the round trip that pins it is exactly 0 there         | `distributions.ts:474-479`, `:523`; test `:144-147`                       |
| MAJOR-4   | out-of-domain shipped value     | `aboveThresholdLengthFraction` reaches 3.0                                                                  | `aggregate.ts:693`                                                        |
| MAJOR-5   | contradicts a binding ruling    | §7.1's tempo JND row is `ln(1.05)` against AD-27.6's and the code's `ln(1.025)`                             | `DESIGN.md:1765`                                                          |
| MAJOR-6   | non-total order                 | the notes comparator ties on four Albert notes and omits §9.5's `site` key                                  | `compare.ts:929-937`                                                      |
| MAJOR-16  | 28 unformatted files ship       | `.prettierignore`'s unanchored `comparison/` hides the whole wave from `format:check`                       | `.prettierignore:39`                                                      |
| MAJOR-17  | P-C2 broken on cross-doc pairs  | the alignment tie-break is orientation-dependent; `matched` and `segments[].peak` differ under swap          | `eventAlignment.ts` `solve()`                                             |

MAJOR-7 … MAJOR-15 (the remaining design-coverage items: the `[0.8, 1.25]` band, `PROFILE_MAX_POINTS`,
key-order and P-C6/P-C8 pinning, the three §5.6 amendments, `meanSigned`'s scope rule,
`inert-difference`, the global-vs-part-local note) are genuine and should land in the same fix wave,
but none of them changes a shipped number.

Four of these need a **ruling as well as a patch**: CAPITAL-1 (how the default step function enters
`d_articulation`, and the exclusion-classification obligation), CAPITAL-2 (the part-scope rule, which
changes every multi-part number the campaign has published, AD-53.2's pin included), MAJOR-2 (what the
epsilon record means), and MAJOR-5 (whether DESIGN or the code is authoritative — the code is right).

### Should fix, not blocking

MINOR-1 (negative remainder mass), MINOR-2 (the Φ left-tail figure), MINOR-3/4 (P-C5's non-vacuity
comment and its two missing dimensions), MINOR-5 (`imprecisionDegenerate`'s unseeded arm), MINOR-6/7
(the pre-existing lint error, the eslint zone's stated-vs-enforced drift and three implicit sort
orders), MINOR-8 (the stale `noteDensityWeight` `@throws` line — **pre-declared by the author**, not
a finding of this audit), and the eleven design MINORs in §5.

### What is sound

This wave's substrate survived a hostile read better than W2's did, and in the places that were
hardest to get right. **Eighteen of nineteen pinned renderer behaviours reproduce exactly** — the
retroactive default, all three articulation dispositions, the velocity chain at 47, `@scale` gating
the gradient and not the spread, the global ornamentation map that AD-43.1 inverted, stacked gradient
and spread composition including direction, `transition.to` defaulting to `transition.from`,
`repetitions="0"` deleting a performance, the one-rule degenerate table bit-for-bit, all seven ⊥
routes including the compensating triangle's "first note fine, every later note NaN", the unmatched
part inheriting the global map at velocity 40, the trailing-`<style>` resurrection to `1.797e308`,
and the accentuation pattern anchoring to the time signature's date. The renderer archaeology is the
campaign's strongest instrument and it is still sharp.

**The test suite is not vacuous.** Twelve falsifiability probes, twelve failures — including the
conductor-authored `imprecisionDegenerate.test.ts`, which earns its extra scrutiny. AD-50.3's
all-three-middles repair is load-bearing exactly as claimed: removing the cap fails the family's
triangle test, not just the dedicated one.

**The mathematics is real.** `W₁` matches 23 closed forms I derived to ≤ 2.84e-16, the `W₂` closing
identity holds to 4.10e-14 over 169 pairs of *my* law family, `ρ(U,T)` is bit-exact, Φ's absolute
error is 8.9× better than published, the Gaussian mixture edges are renderer-faithful for the right
reason, and the clipped-law atoms match a Monte Carlo of the renderer's own sampler to the
discretization floor. AD-19's table closes at 1.6e-16 on real corpora with atoms and parts. The cap
and the ⊥ pricing satisfy the triangle inequality on every ⊥-capable dimension with the cap visibly
binding. `compareMpm` returns plain data with no `undefined`, `NaN`, `Infinity` or `-0` anywhere in
52 000 nodes, and is byte-identical across processes.

The six CAPITALs are, with one exception, not errors of reading. They are errors of *wiring*: a
renderer-true module nothing imports, a multiplier taken from the wrong document, a report field a
binding ruling named and the shape omits, a check DESIGN specifies and no code performs, a comparator
one file forbids and another uses. The one exception, CAPITAL-3, is a genuine mathematical defect and
has a verified one-line repair.
