# Algorithm Portfolio Survey — Performance Comparison

W0 deliverable, written 2026-08-10 by the algorithm-design agent. Companion to the
musicology/MIR survey and the codebase/corpora survey; those three feed `SURVEY.md`
and then `DESIGN.md`.

Everything here is implementation-aware: formulas were read out of this repository's
renderer, not out of the MPM spec, and the claims marked **[verified]** were checked
either numerically (a script under the session scratchpad) or against a cited source.
Claims marked **[assumed]** are design judgements I could not close in W0 and hand to
§6.

---

## §0. Method and what this survey commits to

The brief asked for a portfolio with verdicts. The portfolio is in §2. But the survey
also arrives at one structural claim that reorganizes the whole problem, and it is
fairer to the reader to state it up front than to reveal it in §3:

> **The unifying move.** Every comparable quantity in an MPM pair can be written as a
> non-negative *deviation density* over shared score time. The per-dimension distance
> is that density's integral; a "segment" is an interval of score time; the total
> distance is a weighted sum of integrals. Because integration is additive over
> disjoint intervals and summation is additive over dimensions, the
> dimension × segment attribution table is **exact by construction** — not
> approximately, not up to a residual. That table is the headline product symbolic
> comparison can offer that audio-based performance comparison structurally cannot.

The two consequences that shape every recommendation below: the aggregate must be an
L1-type weighted **sum** (L2 loses segment-additivity in the reported units), and the
instruction-level edit machinery must be kept **separate** from the metric, because
its cost function cannot be made both musically sensible and metric-valid at the same
time (§2.A.2, §2.A.3).

---

## §1. Problem formalization

### 1.1 The objects

An MPM document `D` is

```
D  = { performances }
P  = ⟨ ppq(P), global, parts[] ⟩
env ∈ { global } ∪ parts                        -- an "environment"
env = ⟨ header (style defs), dated (maps) ⟩
map = date-ordered sequence of instructions      -- 12 map types
I   = ⟨ type, date, attributes: name ⇀ ℝ ∪ Name ⟩
```

with the map types actually registered in this port ([`GenericMap.registerMapFactory`
call sites](../src/mpm/elements/maps/)):

`tempoMap`, `dynamicsMap`, `rubatoMap`, `articulationMap`,
`metricalAccentuationMap`, `ornamentationMap`, `asynchronyMap`, `movementMap`,
`imprecisionMap.timing`, `imprecisionMap.dynamics`, `imprecisionMap.toneduration`,
`imprecisionMap.tuning`.

An attribute value is either a number or a *name* resolved through the style def in
positional scope (`src/expression/styleScope.ts:197 resolveLevel`). Name indirection
must be resolved **before** comparison, and resolved the way the renderer resolves it
— positionally, not by date (`src/expression/datedView.ts:106 styleSwitchAt` documents
the divergence and why it matters). Two documents that spell the same tempo as
`bpm="Allegro"` and `bpm="132"` are identical performances and must compare equal.

### 1.2 Five levels of comparison

| Level | Object | Shared across a pair? | Distance kind |
|---|---|---|---|
| L0 attribute | one number in one scale space | — | `|T(x) − T(y)|` |
| L1 instruction | a date-ordered instruction sequence per map | no (differing counts) | alignment / edit |
| L2 curve | a piecewise function of score time per dimension | yes (after PPQ normalization) | function-space norm |
| L3 distribution | a parametric law per imprecision span | yes | Wasserstein |
| L4 aggregate | vector of per-dimension distances → scalar | — | weighted sum |
| L5 corpus | N × N matrix | — | clustering, embedding |

The structural fact from the brief — same piece ⇒ shared symbolic timeline — is what
makes **L2 the natural home of the metric** and demotes L1 from "the distance" to
"the explanation". Global time warping (DTW) is not merely unnecessary here; it is
*harmful*, because a warp would absorb precisely the rubato and asynchrony differences
that are the object of study.

### 1.3 The scale space `T`, made explicit **[verified]**

The expression module never exposes `T`. It exposes only the closed form of the
one-parameter exaggeration action `x ↦ C(x, s)`, in
`src/expression/transforms.ts`. But every one of those closed forms is
`C(x, s) = T⁻¹(s · T(x))`, so `T` is recoverable by inspection, uniquely up to a
positive constant factor:

| space (`ScaleSpace.kind`) | closed form `C(x,s)` | **`T(x)`** | `T⁻¹(u)` | range of `T` | neutral |
|---|---|---|---|---|---|
| `log-around-center` (μ) | `μ·(x/μ)^s` | `ln(x/μ)` | `μ·e^u` | ℝ | `μ` |
| `log-around-1` | `x^s` | `ln x` | `e^u` | ℝ | 1 |
| `logit(a,b)` | `a + (b−a)/(1+((b−x)/(x−a))^s)` | `ln((x−a)/(b−x))` | — | ℝ (±∞ at bounds) | `(a+b)/2` |
| `boundary-power-low` | `1 − (1−x)^s` | `ln(1−x)` | `1 − e^u` | **(−∞, 0]** | 0 |
| `boundary-power-high` | `x^s` | `ln x` | `e^u` | **(−∞, 0]** | 1 |
| `gain`, `gain-ordered` | `s·x` | `x` | `u` | ℝ | 0 |

Each row was checked by substituting into `applyScalar`'s `closedForm`
(`transforms.ts:186`) and confirming `T(C(x,s)) = s·T(x)`.

The one space with no row here is **`joint-trim`** (rubato's `lateStart`/`earlyEnd`,
`transforms.ts:476 jointTrimWindow`), which is not a scalar space at all: the pair is
transformed jointly as a window. It therefore has no scalar `T` and needs its own
local metric — see §6/Q11.

Three facts follow, and all three are load-bearing.

**(a) The local metric.** `d(x,y) = |T(x) − T(y)|` is a metric on each space's domain
(it is the pullback of the Euclidean metric on ℝ through an injection). For `gain`
spaces `T = id`, so distances are in the attribute's native unit (ms, MIDI velocity
units, cents). For level spaces they are in **nepers of log-ratio**.

**(b) The center cancels — the data-dependence worry does not arise at L0.**
For a level space,

```
d(x, y) = |ln(x/μ) − ln(y/μ)| = |ln(x/y)|
```

independent of `μ`. **[verified: algebraic]** So the fact that the expression module's
center is a data-dependent geometric mean does *not* leak into the pairwise metric.
This kills, at the local level, the metric-axiom hazard the brief flags for §5. (It
returns, in a different and benign form, at L4 — see §2.E.)

**(c) Compatibility with `exaggerateMpm`.** Exaggeration by factor `s` acts on
`T`-space as multiplication by `s`. Therefore for any two documents and any dimension,
`d(exagg_s(x), neutral) = |s| · d(x, neutral)`, and more usefully (§2.B.7):

> **Proposition 1.** Let `g(t) = T(f(t))` be a curve in `T`-space and let
> `exagg_s` be the expression module's operator with center `c`. Then the
> transformed curve is `g'(t) = c + s(g(t) − c)`, so the decomposition of §2.B.7
> transforms as: **level** `ℓ ↦ c + s(ℓ − c)` (affine), **gain** `σ ↦ |s|·σ`
> (multiplicative), **shape** `ĝ ↦ sign(s)·ĝ` (**invariant**).

This is exactly testable and should become a test in W3: exaggerating a document and
comparing it to its original must produce zero shape distance and a gain distance of
`|ln|s||`. It is the strongest available evidence that the two modules share one
mathematics.

**(d) The half-line spaces need a guard.** `boundary-power-low` has
`T(1) = ln(0) = −∞`. `curvature = 1` and `trim = 1` are *admissible* values in this
port (`transforms.ts:324`, and `§7.5` admits them as boundary fixed points). So the
comparison module will meet `T(x) = −∞` on legal input. See §4.

### 1.4 The registry is a licence table, not an inventory **[verified]**

`REGISTRY_ROWS` has **83 rows** across 15 dimensions (enumerated by running the module;
counts: tempo 3, tempoShape 1, dynamics 3, dynamicsShape 2, rubato 3, articulation 7,
accentuation 1, ornamentSpread 3, ornamentSpacing 1, ornamentDynamics 2, asynchrony 1,
imprecision{Timing,Dynamics,Duration} 18 each, pedalShape 2).

But the registry answers "may the engine *write* this?", and comparison must *read*
things the engine is forbidden to write. Confirmed gaps the comparison module must
cover itself:

- `tempo@beatLength` — not a row, but **required**: raw `bpm` is meaningless across
  differing beat units. `src/expression/levels.ts:72-76` gives the normalizer:
  compare `bpm · beatLength · 4` (quarter-note bpm).
- `rubato@frameLength` — not a row (the rubato rows are `intensity`, `lateStart`,
  `earlyEnd` only). It is **tick-valued**, so it is PPQ-sensitive.
- `movement@position` / `@transition.to` — only the two *shape* attributes are rows;
  the pedal levels themselves are not.
- `articulationDef@absoluteDuration`, `@absoluteVelocity`, `@detuneCents`,
  `@detuneHz` — explicitly in `EXCLUDED_ARTICULATION_LEVERS` (`registry.ts:986`).
- `imprecisionMap.tuning` — the whole domain is absent from the registry (only
  timing/dynamics/toneduration appear).
- `accentuationPatternDef` contents (`accentuation@beat`, `@value`,
  `@transition.to`), ornament def internals, `seed`,
  `milliseconds.timingBasis`, `degreeOfCorrelation`, `distribution.list` bodies.

**Recommendation.** Build a *comparison registry* that reuses the `RegistryRow` shape
and the `ScaleSpace` vocabulary but is its own table, with an explicit
`comparable: true/false` column and a `unit: 'ticks' | 'ms' | 'ratio' | 'level' |
'cents' | 'dimensionless'` column that the expression registry has no need for. Assert
in a test that every expression row has a comparison row (superset property). Do not
extend `REGISTRY_ROWS` in place — that would let comparison needs silently widen the
write licence.

### 1.5 PPQ normalization

`pulsesPerQuarter` is an attribute of `<performance>`, default 720
(`Performance.ts:196-202`). The renderer converts the *MSM* to the performance's ppq
(`Performance.ts:433 cloneForRender → clone.convertPPQ`); MPM dates are already in
the performance's own ppq and are never rescaled. So comparison must rescale itself.

Scale every date to `L = lcm(ppq_A, ppq_B)` rather than to either document's ppq or to
a fixed constant: `k_X = L / ppq_X` is then a positive **integer**, and integer dates
scale exactly in IEEE754 (no rounding, hence no asymmetry). Rescale, with the same
factor, every tick-valued attribute — at minimum `rubato@frameLength`,
`articulation@absoluteDurationChange`, `@absoluteDelay` (the non-`Ms` spellings),
`temporalSpread@frame.start`/`@frame.offset`/`@frameLength` when their unit is
`ticks`. **Do not** rescale `*Ms`, `milliseconds.offset`, `deviation.standard` in the
timing domain, or `milliseconds.timingBasis` — these are absolute times.

MPM v3 attaches units to values (`ticks` / `ms` / `%`); this port already models that
as `TemporalValue` (`src/mpm/elements/styles/defs/TemporalValue.ts`,
`src/expression/temporalValue.ts`) — reuse it rather than re-deriving unit handling.

### 1.6 The renderer's functions, exactly **[verified — read from source]**

**Tempo** (`TempoMap.ts:213-223`) — a closed-form power curve in normalized position:

```
u(t)   = (t − t₀)/(t₁ − t₀)
bpm(t) = bpm₀ + (bpm₁ − bpm₀) · u^e ,      e = ln(0.5)/ln(meanTempoAt),  e = 1 if absent
```

with `meanTempoAt ≤ 0` and `≥ 1` degenerating to constant tempo (`TempoMap.ts:144-157`).
The tick→millisecond map is *not* closed-form: it is Simpson's rule on `1/bpm`
(`TempoMap.ts:392-409`), one sub-interval per sixteenth note.

**Consequence for comparison.** Compare the **tempo curve `bpm(t)`**, not the
millisecond map. The curve is exact, symmetric, and PPQ-normalizable; the millisecond
map is a *cumulative integral*, so a single early tempo difference displaces every
later timestamp and the resulting "distance" measures accumulated drift, not
interpretation. (Cumulative displacement is a legitimate *secondary* descriptor —
"by how many seconds do the performances diverge?" — and should be offered as one,
clearly labelled, not as the tempo metric.)

**Dynamics** (`bezier.ts`) — a cubic Bézier, evaluated parametrically:

```
x(t) = ((u·t + v)·t + 3x₁)·t·(t₁ − t₀) + t₀        u = 3x₁ − 3x₂ + 1,  v = −6x₁ + 3x₂
y(t) = (3 − 2t)·t²·(to − from) + from               (i.e. smoothstep; y-controls 0,0,1,1)
```

with `(x₁, x₂)` derived from `curvature`/`protraction`
(`bezier.ts:27-47`). There is **no closed form for `t(date)`**: `tForDate`
(`bezier.ts:57-78`) is a bisection that stops when `|Δx| < 1` — **one tick**. So the
renderer's own dynamics curve has ~1-tick date resolution; nothing finer than a tick
is meaningful, which usefully bounds any sampling grid from below.

**Rubato** (`RubatoMap.ts:166-172`) — a cyclic local time warp:

```
localDate = (t − t₀) mod frameLength
warp(t)   = t + frameLength·( (localDate/frameLength)^intensity ·(earlyEnd − lateStart) + lateStart ) − localDate
```

This one *is* a displacement function of score time — the natural curve for rubato is
`warp(t) − t` in ticks, which is already a `gain`-space (linear) quantity.

**Imprecision** (`RandomNumberProvider.ts:306-352`) —

- `distribution.uniform` → `U[limit.lower, limit.upper]`.
- `distribution.gaussian` → `N(0, deviation.standard)` **truncated** to
  `[limit.lower, limit.upper]` by rejection, with a 10 000-attempt escape hatch that
  can emit an out-of-limits value.
- `distribution.triangular` → triangular`(lower, upper, mode)` then **clipped** to
  `[clip.lower, clip.upper]`. Clipping inside the support creates **point masses**.
  The sampler is literally inverse-CDF (`triangularDistribution`, line 345), so the
  quantile function is available in closed form directly from this code.
- `distribution.correlated.brownianNoise`, `.compensatingTriangle` — **Markov
  processes**, not i.i.d. laws: `compensatingTriangleDistribution` derives each
  sample's limits from the previous sample. Their marginals do not characterize them.
- `distribution.list` — an explicit empirical list.

---

## §2. The portfolio

### 2.A — Instruction level

#### A.1 Date-keyed positional join (the baseline)

*Definition.* Group both maps' instructions by (map type, normalized date); compare
group-wise; unmatched groups are pure insert/delete.

*Complexity.* `O(n + m)` after the sort that `orderedEntries` already performs.

*Metric properties.* A sum of per-date local metrics plus a symmetric gap term — a
pseudo-metric, trivially.

*Failure modes on this data.* Brittle in exactly the case the brief names: a
ritardando written as one transition in A and five steps in B shares no dates, so
every instruction is an insert or a delete and the "distance" saturates. Also
brittle to a one-tick date difference.

*Verdict.* **Recommend as the substrate, not as the answer.** It is the cheapest
correct thing, it is what the L2 layer needs anyway (breakpoint collection), and it
should be the fallback when a map's alignment is trivially exact. Do not ship it as
the headline distance.

#### A.2 Weighted Levenshtein on instruction sequences

*Definition.* Wagner–Fischer over the date-ordered sequences of one map type, with

```
sub(a,b) = Σ_k w_k · |T_k(a_k) − T_k(b_k)|  +  λ·δ(date_a, date_b)
gap(a)   = γ + Σ_k w_k · |T_k(a_k) − T_k(neutral_k)|      (= γ + Σ_k w_k·|T_k(a_k)|)
```

*Complexity.* `O(nm)` time; `O(min(n,m))` space for the cost, `O(nm)` for a traceback
(or `O(n+m)` via Hirschberg at 2× time). With `n, m ≲ 2000` this is ≤ 4·10⁶ cells per
map per pair — trivially affordable, and comfortably so even at 4950 pairs (`N = 100`).

*Metric properties — the analysis the brief asked for.*

The classical theorem: if `ρ` is a metric on the extended alphabet `Σ ∪ {ε}`, the
induced edit distance is a metric on `Σ*`. The three conditions that actually bite are

1. `ρ(a,b) = ρ(b,a)` and `ρ(a,a) = 0`;
2. `ρ(a,b) ≤ ρ(a,ε) + ρ(ε,b)` — substituting is never dearer than delete-then-insert;
3. `ρ(a,ε) ≤ ρ(a,b) + ρ(b,ε)`.

Now analyse the brief's candidate gap cost, `gap(a) = distance of a from neutral`:

- **Condition 3 holds for free.** `Σ|T(a)| ≤ Σ|T(a) − T(b)| + Σ|T(b)|` is the
  triangle inequality in ℝ, componentwise. ✔
- **Condition 2 fails as soon as a date term is present.** Take `a`, `b` both
  *neutral* in every attribute but at different dates. Then
  `ρ(a,b) = λ·δ(date) > 0` while `ρ(a,ε) + ρ(ε,b) = 2γ`. With `γ = 0` this is an
  outright violation; with `γ > 0` it is a violation for any pair further apart than
  `2γ/λ`. ✘
- **The fix, and it is clean.** Bound the date metric: use
  `δ(x,y) = min(|x − y|, Δ_max)` with `λ·Δ_max ≤ 2γ`. `δ` is still a metric (a
  truncated metric is a metric), and condition 2 becomes
  `Σ|T(a)−T(b)| + λδ ≤ Σ|T(a)| + Σ|T(b)| + 2γ`, which now holds termwise. ✔
  Set cross-*type* substitution to exactly `ρ(a,ε) + ρ(ε,b)` (rather than `∞`), which
  preserves the metric and makes cross-type substitution never strictly preferable.

  > **Proposition 2.** With `gap(a) = γ + Σ_k w_k|T_k(a_k)|`, `γ > 0`, a truncated
  > date metric with `λ·Δ_max ≤ 2γ`, and cross-type substitution priced at
  > `gap(a) + gap(b)`, the weighted Levenshtein distance is a genuine metric on
  > instruction sequences.

- **The `γ = 0` variant is a *pseudo*-metric, and that is arguably what we want.**
  With `γ = 0` and no date term, inserting an instruction that does nothing
  (`<dynamics volume="mf"/>` where `mf` already prevails) costs exactly zero, so
  documents differing only by no-op instructions sit at distance 0. That is the
  musically correct identification and precisely the "syntactically different,
  semantically identical" collapse the brief wants. Pseudo-metrics are fine for
  hierarchical clustering, k-medoids, silhouette, and classical MDS.
- **The real objection to `|T| − neutral| ` as a gap cost is different, and it is
  serious.** *Neutral is not prevailing.* Deleting `<tempo bpm="60">` from a slow
  movement is charged the full `|ln(60/μ)|` even though the instruction merely
  restates the ambient tempo. The cost measures "how unusual is this instruction in
  the abstract", not "how much does removing it change the performance". The two
  diverge exactly where musicologists care.

*Verdict.* **Offer, with the metric-safe cost design (Proposition 2), but do not make
it the headline.** It is the right tool for *homogeneous* maps where instructions are
genuinely atomic (asynchrony offsets, articulation instructions) and where no
fragmentation is expected. Its cost function's failure to model *effect* is what A.6
fixes.

#### A.3 Mongeau–Sankoff (fragmentation / consolidation)

*Definition.* Levenshtein plus two moves: **fragmentation** (one element of A matched
against `k` consecutive elements of B) and **consolidation** (the converse), bounded
by some `K`. Introduced for melodic comparison; the operations are explicitly
distinguished from both indels and from time-warping compressions/expansions
([Mongeau & Sankoff 1990](https://link.springer.com/chapter/10.1007/978-3-642-33412-2_47)).

*Why it is the obvious candidate here.* "A encodes a ritardando as one continuous
transition where B uses five stepwise instructions" is *literally* a consolidation of
degree 5. No other classical string algorithm names this move.

*Complexity.* `O(nmK)` with a running-sum formulation, `O(nmK²)` naively. Affordable.

*Metric properties — the finding that changes the verdict.* Mongeau–Sankoff's output
is widely and wrongly described as an edit distance. Giraud et al., *What does the
Mongeau–Sankoff algorithm compute?* ([HAL hal-02340896](https://inria.hal.science/hal-02340896),
2019), argue that the recurrence computes an optimal **alignment**, and that
alignment is a *restricted* case of edition: the move set does not compose, so one
cannot fragment and then further edit the resulting fragments. The standard metric
proof for edit distances runs through composition of edit scripts (that is what gives
the triangle inequality), so **the composition failure removes the proof**, and I found
no source that repairs it. Treat MS-cost as **not known to satisfy the triangle
inequality**, and do not feed it to Ward or to classical MDS as if it were a metric.

*Failure modes on this data.* Beyond the metric question: choosing `K`, and pricing a
fragmentation. The natural price ("how well do the `k` steps approximate the one
transition?") is a *curve* question, not an attribute-vector question — which is the
tell that the problem belongs one level up.

*Verdict.* **Reject as the metric. Offer the move set — repriced — inside the edit
path (A.6).** The insight (fragment/consolidate are first-class musical moves) is
right and should survive; the recurrence's cost algebra should not.

#### A.4 Tree edit distance (Zhang–Shasha, APTED) over the XML

*Definition.* Ordered tree edit distance over the whole document tree.

*Complexity.* Zhang–Shasha is `O(n²m²)` time, `O(nm)` space; RTED/APTED achieve
`O(n³)` worst case ([Pawlik & Augsten](https://tree-edit-distance.dbresearch.uni-salzburg.at/)).
For a 2000-node document that is `1.6·10¹³` (ZS) or `8·10⁹` (APTED) operations **per
pair** — and there may be 4950 pairs. This is the one place in the survey where
complexity alone is disqualifying.

*Does tree structure add value here?* Honestly: **no.** MPM's hierarchy is shallow
(`performance → global|part → dated → map → instruction`) and **fixed**: the levels
are named, not discovered. A tree edit distance spends its entire generality
rediscovering a schema we already know, and it will happily "explain" a difference as
a subtree relabel that no musicologist would recognize (e.g. matching a `tempoMap`
against a `dynamicsMap` because their children align cheaply). Per-map sequence
alignment, keyed by the known type, encodes the schema as a *constraint* instead —
strictly more information, at `O(nm)`.

The one thing tree distance would buy is the **global↔part** axis: A putting a
dynamics map on `global` where B puts identical maps on each part. That is a real
comparison problem, but it is a *normalization* problem with a direct solution
(resolve each part's effective map by the renderer's own fallback —
`Performance.ts:441 resolveGlobalMaps` / `resolvePartMaps` — and compare the
resolved per-part maps), not a search problem.

*Verdict.* **Reject**, on both value and complexity. Record the global/part
normalization as the thing it would have been used for, and solve that directly.

#### A.5 XML diff literature (X-Diff, XyDiff, structural similarity)

*Assessment.* This literature optimizes for *change detection between versions of one
document*, with identity heuristics (ids, hashing subtrees) and unordered-tree
semantics ([X-Diff](https://research.cs.wisc.edu/niagara/papers/xdiff.pdf)). Two MPM
files by different performers are not versions of one document; they share a schema
and a timeline, not a lineage. The output would be an XML change script whose atoms
(`insert attribute`, `move subtree`) are the wrong vocabulary — the user asked for
musical operations.

*Verdict.* **Reject.** One idea worth stealing: `xml:id`-based matching. If two
documents genuinely descend from a common ancestor and preserve ids, an id match is
free ground truth for the alignment. Support it opportunistically (**if both sides
carry the same `xml:id`, pin the alignment there**), never depend on it.

#### A.6 Semantic edit cost: price an operation by the curve change it causes ★

*Definition.* Keep Levenshtein's DP and Mongeau–Sankoff's move set, but define every
operation's cost as **the L1 change in the T-space curve that the operation
produces**:

```
cost(op) = ∫ w(t) · | T(f_before(t)) − T(f_after(t)) | dt
```

Since an instruction governs only the span from its own date to the next instruction's
date, `f_before` and `f_after` differ only on a bounded interval, so each cost is a
*local* integral — cheap, and computable with the same quadrature the L2 layer needs.

*Why this is the right cost.*

- Inserting a no-op instruction costs **exactly 0**, with no tuning constant. The
  "neutral ≠ prevailing" defect of A.2 disappears: the cost measures effect, not
  abstract unusualness.
- Consolidating five steps into one transition costs **exactly the area between the
  staircase and the ramp** — small when they approximate the same gesture, large when
  they do not. The fragmentation problem is solved *by the cost function*, so
  Mongeau–Sankoff's special moves become an optimization convenience rather than a
  semantic necessity.
- Date shifts are priced automatically and correctly: moving a dynamics instruction
  from tick 960 to 1000 costs the area of the resulting 40-tick discrepancy. No `λ`,
  no `Δ_max`, no truncation hack.

*Metric properties.*

> **Proposition 3.** Let `Φ: maps → L¹` send a map to its T-space curve. Give the edit
> graph a vertex per map and an edge per invertible edit operation, weighted
> `‖Φ(M) − Φ(M′)‖₁`. The induced shortest-path distance `d_edit` is a metric
> (shortest-path metrics are metrics; edit operations are invertible, so weights are
> symmetric), and by the triangle inequality in L¹,
> `d_edit(A,B) ≥ ‖Φ(A) − Φ(B)‖₁ = d_curve(A,B)`, with equality iff some edit script is
> "monotone" in L¹.

So the edit path is a **witness whose cost upper-bounds the curve distance**, and the
slack `d_edit − d_curve ≥ 0` is itself meaningful: it measures how much *re-working*
(as opposed to net change) separates the two encodings. That is a genuinely new
quantity and it answers U3's "difficulty" framing better than a raw edit count.

*Honest caveats.* (i) The exact `d_edit` is a shortest path over an exponentially
large graph; the DP computes an *upper bound* on it, because the DP prices each
operation against the **original** A-context rather than against the evolving
intermediate. (ii) Consequently the DP's number is an upper bound on an upper bound.
**Mitigation, and it is cheap and exact:** after the DP produces a script, *replay*
the script and report the achieved `‖Φ(A) − Φ(B)‖₁` alongside the script cost. The
report then carries a true lower bound (the curve distance), the script's nominal
cost, and the replay's verification — all three exact.

*Complexity.* `O(nm·q)` where `q` is quadrature points per affected span — i.e.
Levenshtein times a small constant.

*Verdict.* **Recommend as the edit-path engine.** This is the survey's main
algorithmic proposal at L1.

---

### 2.B — Curve / semantic level

Throughout: `g_X(t) = T(f_X(t))` is document X's curve for one dimension in T-space,
over normalized score time `t ∈ [0, T]`, with a weight `w(t) ≥ 0`, `∫w = 1`.

**Choice of `w`: score ticks, not seconds. [decided]** Weighting by *performed
seconds* would make `d(A,B) ≠ d(B,A)` (whose seconds?). Weighting by ticks is
symmetric and shared. A note-density weight derived from the **MSM score** (not from
either performance) is also symmetric and is a legitimate option for "musical
salience"; expose it, default it off.

#### B.1 Sampling-grid L1 / L2

*Definition.* Sample both curves on a grid, sum `|Δ|` or `Δ²` with cell weights.

*Sampling-density pitfall — the real one.* A regular grid systematically
**under-samples transitions and over-samples plateaus**, and worse, it can miss a
narrow instruction entirely (a `<dynamics>` governing 30 ticks between two grid points
at 240-tick spacing contributes nothing). Since MPM curves are piecewise smooth with
*known* breakpoints, a regular grid is simply the wrong grid.

*Fix.* Build the **common refinement**: the sorted union of both documents' breakpoints
(instruction dates, plus rubato frame boundaries, which recur every `frameLength`).
Integrate cell by cell. The refinement is symmetric in (A,B) by construction.

*Verdict.* **Recommend the common-refinement grid; reject the fixed regular grid.**
Bound the refinement from below at 1 tick (§1.6: the renderer's own dynamics
resolution).

#### B.2 Exact piecewise integration vs. quadrature

*Assessment, per map type.*

- **Tempo.** `g(t) = ln(bpm₀ + (bpm₁−bpm₀)u^e)`. `∫|Δg|` has **no elementary closed
  form** for general `e` — and none even for `e = 1`, because of the logarithm.
- **Dynamics.** The curve is parametric with no closed-form `t(date)`; a closed-form
  integral in `date` does not exist. (One could integrate in the Bézier parameter
  with the Jacobian `dx/dt`, which is polynomial — but the *other* document's curve
  is a different parametrization, so the integrand is still not elementary.)
- **Rubato displacement.** Piecewise `u^intensity` — closed form exists per cell
  before the absolute value.
- **Asynchrony, articulation, imprecision parameters.** Piecewise **constant** —
  exact trivially.

So: exact integration is available for the step-function dimensions and unavailable
for the two most important continuous ones.

*Recommendation.* **Gauss–Legendre of fixed order per refinement cell** (order 7–10 is
ample for these smooth integrands), with two refinements: (i) subdivide cells where
`e < 1`, since `u^e` has unbounded derivative at `u = 0`; (ii) for **L1**, locate sign
changes of `g_A − g_B` inside each cell by bisection to a documented tolerance and
integrate the sign-constant sub-cells separately — otherwise `|·|` introduces a kink
the quadrature does not see and the error is first-order.

*On the metric-vs-implementation question.* Define the metric as the **true integral**
and the implementation as an `ε`-accurate evaluation of it. Then the triangle
inequality holds *exactly for the defined object* and to within `3ε` for the computed
one. This is the honest framing, and it is strictly better than the tempting
alternative of "define the metric as the quadrature", which would make `d` depend on
the pair-specific grid and put the axioms genuinely at risk. Target `ε ≈ 10⁻¹²`
relative; state it in the report.

#### B.3 Area between curves

Identical to L1. Named separately in the literature; no separate treatment needed.
**Recommend** (it *is* the recommendation), and note that "area between the tempo
curves, in neper·ticks" is a directly reportable, musically legible quantity.

#### B.4 1-D Wasserstein on curves — where it is meaningful and where it is not

*The meaningless use.* Treating a tempo curve as a distribution over the value axis
and computing `W₁` between A's and B's tempo *histograms*. This discards **when**
entirely: a performance that accelerates through the first half and one that
decelerates through it have identical tempo histograms and `W₁ = 0`. Since "when" is
the entire content of performance analysis, this is not a near-miss — it is the exact
inverse of what is wanted. The confusion is easy to fall into because `W₁` is
*defined* as an integral of a difference and looks like an area-between-curves.

*The meaningful uses.* Three, and they are worth having:

1. **Imprecision distributions** (§2.C) — the object genuinely *is* a probability law.
2. **Cross-piece comparison.** When two performances are of *different* pieces, there
   is no shared timeline and every method in §2.B is unavailable. A time-blind
   "tempo vocabulary" descriptor (`W₂` between the time-weighted distributions of
   `ln bpm`) is then the right tool, and it addresses a real musicological question
   ("does this performer always use this range of rubato?").
3. **Distributions of derived event-level quantities** — e.g. the distribution of
   per-note asynchrony offsets.

*Verdict.* **Reject for curves-over-time; recommend for §2.C; offer as a clearly
labelled time-blind descriptor for the cross-piece case.**

#### B.5 Fréchet distance

*Definition.* Min over monotone reparametrizations of the max pointwise distance.
Discrete Fréchet is `O(nm)`.

*Assessment.* Two disqualifying properties. (i) It **reparametrizes time** — the same
objection as DTW, and stronger here, because a rubato difference *is* a
reparametrization and Fréchet would report it as free. (ii) It is a **max** norm: one
instant of disagreement dominates and the extent of a difference is invisible, which
is the opposite of the ranked-segments product U3 asks for.

*Verdict.* **Reject.**

#### B.6 Correlation-based dissimilarity and scale invariance

*Definition.* `d_corr = 1 − r` (or `√(2(1−r))`, see below), with `r` the Pearson
correlation of the two curves over a window; Spearman for the rank variant.

*The musicological stake, stated precisely.* Is a uniformly-faster performance "the
same interpretation"? **Correlation says yes; L2 says no; both answers are wanted.**
The brief is right that this must be a *decomposition*, not a choice — and §2.B.7
delivers exactly that, so correlation should not be offered as a *rival* metric but
consumed as the shape component.

*Precedent.* Sapp's Mazurka-project scape plots use Pearson `r` on beat-level tempo
and loudness sequences as the per-cell operation
([Sapp, ISMIR 2007](https://ismir2007.ismir.net/proceedings/ISMIR2007_p497_sapp.pdf),
eq. 3). Two details from that paper are directly relevant. (i) To combine tempo and
dynamics into one sequence, Sapp *z-scores dynamics onto tempo's mean and sd*
(eqs. 7–8) — a **data-dependent normalization of exactly the kind §2.E warns about**;
it is defensible for a visualization that discards the correlation values anyway, and
not defensible for a distance matrix. (ii) Sapp's conclusion that tempo data is "a
superposition of several types of performance features" (low-frequency phrasing vs.
high-frequency metrical pattern) and that these should be separated is an independent
argument for both the decomposition (B.7) and the multi-scale view (B.8).

*Failure modes.* `r` is undefined when either curve is constant over the window — and
constant tempo over a window is *completely ordinary* in this data. Rank correlation
is degenerate in the same case and additionally destroys magnitude information that
the T-space already encodes correctly. Windows with few effective degrees of freedom
give `r` values that are noise.

*Verdict.* **Do not offer `1 − r` as a standalone distance** (it is not a metric;
`√(2(1−r))` is, on the unit sphere of centered curves, which is exactly the shape
component below). **Consume it as `d_shape`.** Define `r` as undefined → report `null`
and mark the window as shapeless, never `0`. Offer Spearman as an option, off by
default, with the constancy caveat documented.

#### B.7 ★ The level / gain / shape decomposition

> **Lemma (used twice).** Let `h_A, h_B ∈ L²(Ω, μ)` with `μ` a probability measure.
> Write `ℓ_X = ∫h_X dμ`, `σ_X = ‖h_X − ℓ_X‖₂`, `ĥ_X = (h_X − ℓ_X)/σ_X`, and
> `r = ⟨ĥ_A, ĥ_B⟩`. Then
>
> ```
> ‖h_A − h_B‖₂²  =  (ℓ_A − ℓ_B)²  +  (σ_A − σ_B)²  +  2 σ_A σ_B (1 − r)
>                     └─ level ─┘     └─ gain ──┘     └──── shape ────┘
> ```
>
> *Proof.* Split `h_X = ℓ_X + σ_X ĥ_X`. The constant and the centered part are
> orthogonal, giving `(ℓ_A−ℓ_B)² + ‖σ_Aĥ_A − σ_Bĥ_B‖²`; expand the second term as
> `σ_A² + σ_B² − 2σ_Aσ_B r` and complete the square. ∎

Applied to **curves** on `(time, w dt)`, this is the decomposition the brief asks for:

- `d_level = |ℓ_A − ℓ_B|` — for tempo, exactly `|ln(geometric-mean-tempo ratio)|`:
  "is one performance globally faster?"
- `d_gain = |σ_A − σ_B|` (or `|ln(σ_A/σ_B)|` for a scale-free reading) — "is one
  performance's shaping more exaggerated?"
- `d_shape = √(2(1−r))` — "do they shape the *same way*?", scale- and level-invariant,
  and a genuine metric on the unit sphere.

Applied to **quantile functions** on `([0,1], du)`, the *same lemma* gives the
Wasserstein-2 decomposition of §2.C. This is not an analogy: `W₂` **is** the `L²`
distance between quantile functions, so one theorem covers both levels. That
unification is the reason to prefer this decomposition over any of the ad-hoc
level/shape splits in the MIR literature.

*Proposition 1 (§1.3) attaches to this directly*: the expression module's
`exaggerateMpm(s)` fixes shape, scales gain by `|s|`, and moves level affinely.

*Verdict.* **Recommend as the primary interpretive product**, computed per dimension
and per window. Report the three components *and* `r`; do not collapse them.

*Caveat to state in the docs.* The decomposition is `L²`-based (Pythagoras needs an
inner product), whereas the headline scalar is `L¹`-based (§2.E). These are two
different numbers serving two different purposes, and the report must label them as
such rather than implying the components sum to the headline distance.

#### B.8 Multi-scale / scape variants

*Definition.* Compute any of the above over every contiguous window `[i, j]`, and
display as a triangle indexed by (window center, window size) — Sapp's timescape.

*Complexity.* `O(n²)` windows; with prefix sums over the refinement cells, each
window's `ℓ`, `σ`, `r`, and `L¹` integral is `O(1)`, so the whole scape is `O(n²)`
time and space. At `n` = a few hundred windows that is fine; at `n` = 2000 breakpoints
it is 4·10⁶ cells per dimension per pair, which is too much to ship by default.

*Recommendation.* Provide the scape over a **coarsened** window index (e.g. measures,
or a fixed `n_w ≤ 256` bins), as an *opt-in* product with the bin count in the report.
Prefix sums make it cheap; the naive recomputation is `O(n⁴)` and must be avoided.
Note that Sapp's own displays throw the correlation values away and keep only the
argmax performer — for a corpus product (U4) that variant is the more informative one
and costs the same.

*Verdict.* **Offer** (W4 or later). Not on the critical path.

---

### 2.C — Distribution level (imprecision maps)

Every imprecision parameter sits in a `gain` space (§1.4 enumeration), i.e. `T = id`,
so distances here are in the parameter's **native unit** (ms for timing, velocity
units for dynamics, cents for tuning). That is what lets §2.E aggregate them with
everything else without a unit conversion.

#### C.1 Wasserstein-2 — recommended

*Definition.* `W₂²(μ,ν) = ∫₀¹ (Q_μ(u) − Q_ν(u))² du`.

*Closed forms.* **[verified numerically]**

- **Two uniforms.** With `Δa = a₁−a₂`, `Δb = b₁−b₂`:
  `W₂² = (Δa² + Δa·Δb + Δb²)/3`. Checked against 4·10⁶-point quadrature on
  `U[−3,5]` vs `U[1,2]`: both give `4.333333333`.
- **Two Gaussians (untruncated).** `W₂² = (m₁−m₂)² + (σ₁−σ₂)²` — the standard result,
  and the Lemma's specialization at `r = 1`.
- **Any two location-scale families.** `W₂² = (Δm)² + (Δσ)² + 2σ₁σ₂(1 − ρ)` where
  `ρ = ∫₀¹ Z₁(u)Z₂(u) du` depends **only on the pair of families**, not on their
  parameters. This is the Lemma applied to quantile functions, and it is the same
  three-term level/gain/shape split as §2.B.7.

  The constants, computed and then identified in closed form:

  | family pair | `ρ` | closed form |
  |---|---|---|
  | uniform ↔ uniform (etc., same family) | 1 | — |
  | uniform ↔ symmetric triangular | 0.989949493661 | `7√2/10` |
  | uniform ↔ Gaussian | 0.977205023806 | `√(3/π)` |
  | symmetric triangular ↔ Gaussian | ≈ 0.9962947 (±10⁻⁷) | (no elementary form found) |

  The first two were identified in closed form after the quadrature matched them to
  eight digits; the third is quoted at the accuracy my midpoint quadrature actually
  achieved (the same run reproduced the Gaussian's unit variance only to 3·10⁻⁷, which
  bounds the error). If it is used, recompute it once offline with Gauss–Legendre on a
  tail-splitting substitution and hard-code the constant with a test that re-derives it.

  Verified end-to-end: `U[−3,5]` vs. symmetric triangular on `[0,4]` gives
  `3.266666667` by both direct quadrature and the three-term formula.

*The complication this data actually presents.* MPM's families are **not** clean
location-scale families: the Gaussian is *truncated* by `limit.lower/upper` and the
triangular is *clipped* by `clip.lower/upper`, which creates **atoms**. So the ρ-table
is a fast path for the untruncated/unclipped case, and the general method must be
**quantile-function quadrature** — which is available, because every family here has a
closed-form quantile:

- uniform: `Q(u) = lo + (hi−lo)u`;
- triangular: exactly the renderer's own sampler
  (`RandomNumberProvider.ts:345-352`), then composed with the clip (which flattens `Q`
  at the clip values — atoms are handled natively by a quantile representation);
- truncated normal:
  `Q(u) = σ·Φ⁻¹(Φ(lo/σ) + u·(Φ(hi/σ) − Φ(lo/σ)))`, needing `Φ` and `Φ⁻¹` —
  see §5 for the dependency-free rational approximations;
- `distribution.list`: the empirical quantile, a step function.

Quadrature must place nodes at the quantile breakpoints (mode, clips, list steps),
where `Q` has a derivative singularity (`√` behaviour at the triangular's ends).

*Metric properties.* `W₂` is a metric on distributions with finite second moment
(standard). Atoms and support mismatch are no obstacle.

*Verdict.* **Recommend**, with the closed forms as fast paths and quantile quadrature
as the general method. Report the three components (location / spread / shape), which
line up with the curve decomposition.

#### C.2 Wasserstein-1

`W₁ = ∫|F_μ(x) − F_ν(x)| dx`, with piecewise-polynomial CDFs for uniform and
triangular. Cheaper, more robust, in the same native units, and — relevantly for §2.E
— **additive-friendly** since the headline aggregate is L1. It lacks the clean
three-way decomposition.

*Verdict.* **Offer as an option**; recommend `W₂` as the default because of the
decomposition's alignment with §2.B.7. Flag for §6.

#### C.3 KL / Jensen–Shannon / Hellinger

*Assessment.* KL is not symmetric and not a metric, so it fails the L4/L5 contract
immediately. Worse, on this data it is **infinite in the ordinary case**: uniform on
`[−30,30]` vs. uniform on `[−20,20]` have mismatched supports, and clipped triangulars
carry atoms that no density-based divergence handles at all. Jensen–Shannon repairs
symmetry and finiteness (and `√JS` is a metric) but still needs a common dominating
measure that atoms break, and it is not expressible in the parameters' native units,
so it cannot join the §2.E sum.

*Verdict.* **Reject all three.** Note the support-mismatch argument explicitly in the
docs — it is the single clearest reason a reader might otherwise expect KL.

#### C.4 The correlated distributions

`brownianNoise` and `compensatingTriangle` are **stochastic processes with memory**,
not laws. Comparing marginals ignores `stepWidth.max` and `degreeOfCorrelation`, which
are exactly what distinguishes "jittery" from "drifting" imprecision.

*Recommendation.* Compare the marginal by `W₂` **and** compare the correlation
parameters as ordinary `gain`-space attributes, reporting them as a separate
`processParameters` component. Do **not** claim the marginal distance characterizes
these families — say so in the report. A full process distance (e.g. between the
induced Gaussian processes' covariance kernels) is out of scope and should be recorded
as such.

---

### 2.D — Ranked deviation segments (U3)

The input is, per dimension, a non-negative **deviation density** `p_k(t) ≥ 0` over
score time whose integral is `d_k`. (§0: this exists for every dimension — curves give
`w(t)|g_A−g_B|`; step dimensions give piecewise-constant densities; imprecision spans
give `W₂` divided over the span they govern.)

#### D.1 Threshold + Ruzzo–Tompa ★ recommended

*Definition.* Fix a per-dimension **just-noticeable-difference** threshold `τ_k`.
Score each refinement cell `c` as `x_c = w_c·(p_k(c) − τ_k)` — positive where the
difference exceeds perceptual relevance, negative where it does not. Run
[Ruzzo–Tompa](https://en.wikipedia.org/wiki/Ruzzo%E2%80%93Tompa_algorithm) to find all
maximal-scoring segments.

*Why this and not the alternatives.* Ruzzo–Tompa's output set is **unique and
well-defined** — it is characterized by maximality, not selected by a search with ties.
That gives determinism *without any tie-breaking convention*, which is worth a great
deal given §4. It is `O(n)` time and space. And the threshold is not a free
hyperparameter dressed up as science: `τ_k` is a **perceptual constant** with a
literature (≈5% for tempo, ≈20–30 ms for onset asynchrony), documented and
overridable.

*Complexity.* `O(n)` after the profile is built.

*Verdict.* **Recommend.**

#### D.2 Top-k maximum-sum segments

*Assessment.* The `k`-disjoint-maximum-subarray problem is solvable in `O(n)` to
`O(n log n)`, but it needs `k` as an input and its answer *changes* with `k` (the best
3 are not the first 3 of the best 5, in general). Ruzzo–Tompa instead returns the
canonical set and lets the caller take the top `k` **after** sorting by score — which
is stable under changing `k`.

*Verdict.* **Reject in favour of D.1**, whose output is a superset that can be
truncated.

#### D.3 Changepoint detection (PELT, binary segmentation)

*Assessment — the necessity question the brief asks.* PELT is exact optimal
partitioning with pruning, `O(n)` under conditions
([Killick et al.](https://arxiv.org/pdf/1101.1438)); binary segmentation is greedy and
approximate. Both are designed for **noisy** signals where changepoints must be
*inferred* against a statistical model.

Our difference profile is **piecewise constant or piecewise smooth with known
breakpoints and no observation noise**. Every changepoint is already in the common
refinement — we do not need to infer them, we have them. Running PELT here would
impose a penalty parameter (BIC/AIC) whose statistical justification is vacuous when
the noise model is "there is no noise", and would *merge* cells that differ, on the
grounds that the merge is cheaper than the penalty. That is a loss of exactness for
nothing.

*Verdict.* **Reject.** Record the reasoning, because "we should use changepoint
detection" is the obvious suggestion a reviewer will make. The one case where a
changepoint method would earn its place is a *smoothed* profile at scape resolution
(B.8), where binning does introduce something noise-like; note that and move on.

#### D.4 Exact attribution ★

Let `S₁ … S_m` be the segments (from D.1, or any partition of `[0,T]`), and let

```
c_{k,s} = ∫_{S_s} p_k(t) dt      (≥ 0)
```

Then, with fixed per-dimension weights `ω_k` (§2.E):

```
Σ_s c_{k,s} = d_k              (row sums = per-dimension distances)
Σ_k ω_k c_{k,s} = contribution of segment s
Σ_k ω_k Σ_s c_{k,s} = D(A,B)   (grand total = the headline distance)
```

This holds **exactly**, as an identity, because integration is additive over disjoint
intervals and the aggregate is a sum. No residual term, no "unexplained" bucket. The
report is a contingency table that adds up, and every cell is clickable to a time
range and a dimension.

*The one constraint this imposes on the rest of the design*: the aggregate must be an
L1-type weighted **sum** of integrals. If §2.E chose `√(Σω_k d_k²)`, the row sums
would still be exact but the grand total would not be the sum of the cells. This is
why §2.E recommends L1. Segments must also **partition** the timeline — Ruzzo–Tompa's
maximal segments are disjoint but do not cover, so the report must carry an explicit
"below threshold" remainder row for the table to close.

---

### 2.E — Aggregation across heterogeneous dimensions

#### The metric algebra

> **Proposition 4.** If each `d_k` is a (pseudo-)metric on the set of documents and
> `ω_k ≥ 0` are **constants**, then `D = Σ_k ω_k d_k` is a (pseudo-)metric.
> Likewise `√(Σ_k ω_k d_k²)` is a metric. Neither survives if `ω` depends on the
> *pair*.

*The pair-dependence hazard, stated exactly.* Suppose `ω_k(A,B) = 1/d̄_k(A,B)` (a
per-pair z-score or range normalization). Then `D(A,B)`, `D(A,C)`, `D(B,C)` are
computed with three different weight vectors — they are values of three *different*
functions. The triangle inequality is not merely at risk; it is not even a
well-posed question, because there is no single function to test. Concretely, a pair
that happens to differ only in tempo gets tempo up-weighted to dominate, while a pair
differing only in articulation gets articulation up-weighted — and the two numbers are
then compared as if commensurable. **This must be forbidden outright**, not made an
option with a warning.

*Corpus-dependence is a different and much milder thing.* If `ω_k = 1/median_{pairs}
d_k` computed over the whole corpus, `ω` is a single constant vector for the entire
matrix. `D` is then a metric — a *rescaled* one, but a metric — and every axiom
holds. What it loses is **cross-corpus comparability**: `D(A,B)` changes when a third
performance is added. That is a real cost, and it is a reproducibility cost, not a
correctness cost.

*Recommendation.* Three-tier, explicit:

1. **Default: fixed, documented constants.** Express every dimension in
   just-noticeable-difference units, so that `d_k = 1` means "one JND". Starting
   values (**[assumed]** — conventions, and they must be labelled as conventions in
   the docs, not presented as findings): tempo `ln(1.05) ≈ 0.0488` neper;
   dynamics `ln(1.05)`; asynchrony `20` ms; imprecision widths `20` ms / equivalent.
   These make `D` reproducible, corpus-independent, and comparable across studies.
2. **Opt-in: corpus normalization**, which **stamps the derived constants into the
   report** so any number can be recomputed. Labelled `normalization: "corpus"`.
3. **Forbidden: pair normalization.** Not an option; not implemented.

#### Expose the vector, not just the scalar

The scalar exists because clustering needs one number. Everything else — the ranked
segments, the decomposition, the report a musicologist actually reads — is better
served by the vector `(d_tempo, d_dynamics, d_rubato, …)`. **Recommendation: the
per-dimension vector is the primary return value; the scalar is a derived field
carrying its weight vector with it.** A caller doing clustering should be able to
supply its own weights without recomputing anything, which the vector makes free.

#### Missing dimensions

If A has a `rubatoMap` and B has none, "no rubato map" means *neutral rubato*, not
*missing data* — the renderer's fallback is the identity. So compare against the
neutral curve rather than dropping the dimension. Dropping it would make `D`
pair-dependent through the dimension set, re-introducing the §2.E hazard by the back
door. **This is important and easy to get wrong.**

---

### 2.F — Clustering from a distance matrix

`N` is 2–100, so every algorithm here is cheap and the selection criteria are
determinism and validity, not speed.

**Agglomerative hierarchical, Lance–Williams update.** One `O(N³)` naive
implementation (`N=100` → 10⁶ operations) covers single, complete, average (UPGMA),
weighted (WPGMA), and Ward.D2 via the parameter table. ~80 lines.

- **Average (UPGMA): recommend as default.** Makes no Euclidean assumption, is stable,
  and its merge heights are directly interpretable as mean inter-cluster distance in
  the reported units.
- **Complete: offer.** Compact clusters; heights are "worst-case distance within".
- **Single: offer, warn.** Chaining is severe with performance data, where a
  continuum of interpretations is the norm.
- **Ward.D2: offer, warn precisely.** **[verified]** The Lance–Williams recurrence
  remains *valid* for non-Euclidean dissimilarities — Székely & Rizzo (2005) and
  Strauss & von Maltitz (2017) prove the update formula still holds — but the
  **inertia interpretation is meaningless** when `D` is not Euclidean
  ([Murtagh & Legendre 2014](https://www.numericalecology.com/Reprints/Murtagh_Legendre_J_Class_2014.pdf);
  [applicability analysis](https://arxiv.org/pdf/1909.10923)). Since our `D` is an
  L1-type sum and is generally **not** Euclidean, Ward's output is a well-defined
  hierarchy whose usual "minimum variance" story does not apply. Ship it with that
  sentence in the docs and with `ward.D2` (squared-distance) semantics named
  explicitly, since `ward.D` vs `ward.D2` is a classic silent-wrong-answer trap.

**k-medoids / PAM.** `O(k(N−k)²)` per SWAP iteration. Its exemplars are real
performances — "the most typical Rubinstein" — which is musicologically more useful
than a centroid that corresponds to no recording. **Recommend as the flat-clustering
option.** Determinism: BUILD and SWAP both have ties; break every tie by **lowest
document index**, and document it.

**Silhouette.** `s(i) = (b−a)/max(a,b)`, valid on any dissimilarity, `O(N²)` per
labelling. Convention: singleton clusters get `s = 0`. **Recommend** as the `k`
selection aid, with the caveat that at `N < 20` silhouette is noisy and should inform
rather than decide.

**Determinism requirements (all of F).** Merge-order ties are *common* here, not
exotic: identical performances, or documents differing only by no-op instructions,
produce exact zeros and exact duplicate distances. Rules: (i) among equal minimal
distances, merge the pair with the lexicographically smallest `(min index, max
index)`; (ii) within a merged node, order children by smallest contained index;
(iii) never depend on `Map`/`Set` iteration order for anything that reaches output.

**Dendrogram as plain data.** `{ merges: [{left, right, height, size}], order:
number[] }` with leaves as negative or tagged indices — the SciPy/`hclust` linkage
convention, which every downstream plotting tool already understands. No classes, no
cycles, JSON-serializable, which the house `plain-data reports` rule (G3) requires
anyway.

---

### 2.G — Embedding for visualization

**Classical MDS / PCoA — recommend.** `B = −½ J D⁽²⁾ J` with `J = I − 11ᵀ/N`, then
eigendecompose `B`. For symmetric `N ≤ 100`, the **cyclic Jacobi rotation** method is
~50 lines, needs no external library, converges quadratically, and is deterministic
if the sweep order is fixed. Coordinates are `x_i = √λ_j · v_{ij}`.

*Handling non-Euclidean `D` honestly.* Our `D` will generally produce **negative
eigenvalues**. The literature's advice is to keep the top positive eigenvalues and
check that negative ones are small in magnitude
([cmdscale docs](https://www.mathworks.com/help/stats/cmdscale.html); note also that
taking *all* positive eigenvectors is provably suboptimal —
[arXiv:1402.2703](https://arxiv.org/pdf/1402.2703)). **Report, always:** the full
eigenvalue spectrum, the explained variance of the retained axes computed over
`Σ|λ|` (not over `Σλ⁺`, which flatters the result), and the **negative-eigenvalue
mass** `Σ|λ⁻| / Σ|λ|` as an explicit "how non-Euclidean is this?" figure. If that
mass exceeds a documented fraction, say so in the report rather than silently
plotting.

*Sign determinism.* Eigenvectors are defined up to sign. Fix it: flip each so that
its largest-magnitude component is positive; break a tie on equal magnitudes by lowest
index. Without this, two runs produce mirror-image plots.

**t-SNE / UMAP — reject.** Four reasons, in order of decisiveness. (i) **`N` = 2–100
is far too small**: neighbour-embedding methods need perplexity/`n_neighbors` well
below `N`, and at `N = 20` there is no valid setting — the output is an artefact of
the hyperparameter. (ii) **Stochastic**: random initialization and (for t-SNE)
negative sampling put a PRNG on the output path, which collides head-on with the
determinism requirement. (iii) They preserve *neighbourhoods*, not distances, so the
axes and the inter-cluster gaps are not interpretable — and interpretability is the
entire point of a musicological plot. (iv) UMAP's algorithm is substantial
(fuzzy simplicial sets, spectral init, SGD) and would be a large dependency-free
implementation burden for a result we would then have to caveat.

**Seriation for heatmaps — recommend the cheap version.** Optimal leaf ordering
(Bar-Joseph) is `O(N³)` and affordable at `N ≤ 100`, but the far simpler option is to
order by the **first classical-MDS coordinate**, which is deterministic, `O(N log N)`
after the MDS we are computing anyway, and produces a good ordering for a distance
heatmap. **Recommend MDS-coordinate seriation; offer optimal leaf ordering as an
upgrade** if the dendrogram view needs it.

---

### 2.H — The edit path as a deliverable (U2, U3)

*Structure.* A typed script, each entry carrying its own cost:

```
{ op: 'insert' | 'delete' | 'substitute' | 'fragment' | 'consolidate' | 'move',
  map, part, dateFrom, dateTo, attributes: [...], cost, curveDelta }
```

with `cost` from A.6 (the local curve integral) and `curveDelta` the verified replay
value. Sorting by `cost` descending is then exactly U3's "sorted view of where the
most major deviations are", and it is *commensurable with the distance* because both
are integrals of the same density.

*Is the optimal path unique?* **No** — emphatically not, and the ties are structural
rather than accidental. Three sources: (i) `insert-then-delete` vs `delete-then-insert`
at equal cost; (ii) a substitution priced exactly at `gap(a)+gap(b)` (which is exactly
what §2.A.2's cross-type rule creates) ties with the indel pair; (iii) genuinely equal
attribute deltas across symmetric instructions. So the traceback **must** have a
documented deterministic rule. Recommended precedence, applied at every DP cell:
**substitute > delete > insert**, and among equal-cost same-op choices, lowest source
index first. State it in the docs as a *convention*, and add a test that a
transposed input yields the mirrored script.

*Reporting.* Report the triple: `d_curve` (lower bound, the metric), `scriptCost` (the
DP's number), and `replayedDelta` (exact verification). If `scriptCost` exceeds
`d_curve` materially, that slack is the "re-working" quantity of Proposition 3 and is
worth surfacing as its own field rather than hiding.

---

### 2.I — What the surrounding literature already offers (§9 of the brief)

Brief notes, since the musicology survey covers this ground in depth:

- **Sapp, "Comparative Analysis of Multiple Musical Performances" (ISMIR 2007)** —
  the scape/timescape construction, Pearson `r` per sub-sequence, argmax-performer
  colouring. The direct ancestor of §2.B.8, and the source of the
  data-dependent-normalization caution in §2.B.6.
- **Partitura + the match-file format**
  ([arXiv:2206.01104](https://arxiv.org/pdf/2206.01104), and Peter et al.'s note-level
  ASAP alignments, TISMIR 2023) — the established route for *audio/MIDI* performance
  comparison: align notes to a score, then compare per-note expressive parameters.
  **The relevant contrast for us:** that work spends most of its machinery on
  *obtaining* the alignment, because a recording gives you no symbolic structure. MPM
  gives it for free. Our comparison should therefore not imitate their pipeline; it
  should occupy the position their pipeline is trying to reach, and go further —
  which is exactly what the exact decomposition (§2.D.4) is.
- **Mongeau & Sankoff (1990)** and **Giraud et al. (2019)** — as analysed in §2.A.3.
- Nothing found in 2018–2026 that computes a distance between two *symbolic
  performance-directive encodings* (MPM, or comparable). The nearest neighbours all
  compare *rendered* parameter sequences. If that survives the musicology survey's
  check, it is a novelty claim worth making carefully in the README.

---

## §3. Recommended architecture

A five-layer stack. Each layer's output is plain data; each layer is independently
testable; the metric properties are established layer by layer.

```
L0  scale spaces           T per attribute (§1.3), from a comparison registry (§1.4)
       ↓                   local metric |T(x) − T(y)|, center-free for level spaces
L1  document normalization PPQ → lcm; style-def resolution (positional);
       ↓                   global/part map resolution; v3 unit resolution
L2  per-dimension density  p_k(t) ≥ 0 over shared score time
       ↓                     · curves      → w(t)·|g_A − g_B|      (§2.B.1–B.3)
       ↓                     · step maps   → piecewise constant
       ↓                     · imprecision → W₂ per span / span width  (§2.C.1)
L3  per-dimension distance d_k = ∫ p_k(t) dt          — a pseudo-metric each
       ↓                   + decomposition (level, gain, shape)  (§2.B.7)
L4  aggregate              D = Σ_k ω_k d_k, ω fixed & documented   (§2.E)
       ↓                   + exact dimension × segment table       (§2.D.4)
L5  corpus                 N×N matrix → UPGMA / PAM / silhouette  (§2.F)
                                      → classical MDS + spectrum   (§2.G)

  (side channel, not on the metric path)
    edit path              semantic-cost DP (§2.A.6) → typed script sorted by cost,
                           with d_curve ≤ scriptCost, verified by replay  (§2.H)
```

**The exact-decomposition property, spelled out.** For any partition
`S₁ … S_m` of normalized score time and the fixed weights `ω_k`:

```
D(A,B) = Σ_k Σ_s ω_k · c_{k,s}          c_{k,s} = ∫_{S_s} p_k(t) dt ≥ 0
```

Row sums give per-dimension distances, column sums give per-segment contributions, the
grand total is the reported distance, and there is **no residual**. This holds because
(a) each `d_k` is an integral of a non-negative density over the shared timeline,
(b) integration is additive over disjoint intervals, and (c) the aggregate is a
weighted sum, not a norm. Requirements (a)–(c) are constraints on the design, and each
is honoured above: (a) is why the imprecision distance is divided over its governing
span, (b) is why segments must partition (Ruzzo–Tompa's segments plus an explicit
below-threshold remainder), and (c) is why L4 is L1 and not L2.

**What is deliberately *not* unified.** The `level/gain/shape` decomposition is
`L²`-based and does **not** sum to `D`. It is an interpretive product with its own
exact identity (the Lemma). The report must present the two as two tables, not as one.

---

## §4. Determinism and numerical-robustness checklist

**Ties.**
- Refinement-grid construction: sort breakpoints, then dedupe with an exact `===`
  comparison after PPQ scaling (integers, so exact).
- Equal-dated instructions: reuse `orderedEntries` (`datedView.ts:61`), whose
  insertion loop is already the renderer's — including its `NaN`-date behaviour
  (a malformed date sorts to the **front**). Do not substitute a comparator sort.
- DP traceback: `substitute > delete > insert`, lowest source index (§2.H).
- Agglomerative merges: lexicographic `(min index, max index)` (§2.F).
- PAM BUILD/SWAP: lowest index (§2.F).
- Eigenvector signs: largest-magnitude component positive (§2.G).
- Ruzzo–Tompa needs no tie rule — its output set is canonical (§2.D.1).

**Symmetry — is `d(A,B) == d(B,A)` bit-exactly?** It can be, and it should be an
enforced test, but only if three things hold:
1. the refinement grid is built from a **sorted union**, so it is literally the same
   array of cells in both directions;
2. per-cell terms are `|x − y|`, which is bit-exact symmetric in IEEE754;
3. the **summation order is fixed by date**, not by document. Floating-point addition
   is not commutative-associative in the sense that matters — summing cells in A-order
   vs B-order gives different low bits. Sum in ascending date order, always.
   (For extra safety, use Neumaier compensated summation; it is 6 lines and removes
   the question.)
Where symmetry *cannot* be bit-exact (any quadrature whose node placement depends on a
document-specific subdivision), **symmetrize explicitly** by computing the canonical
order from `sort([idA, idB])` — never by averaging, which hides the bug.

**NaN / Inf guards** — the specific ones this data produces:
- `T(x) = ln(1−x) = −∞` at `curvature = 1` / `trim = 1`, which are **legal values**
  (§1.3d). Clamp `T` at a documented finite bound and **report the clamp** in the
  output, rather than propagating `−∞` into a sum.
- `logit` at `protraction = ±1` → `±∞`, same treatment, same legality.
- `parseFloat` returns `NaN` for absent-or-malformed; the renderer is *lenient*
  (`"120bpm"` → 120, `attributes.ts:64`). Comparison must read values the same lenient
  way, or it will disagree with the renderer about what the document says.
- Division by zero span: `endDate === startDate` (co-dated instructions are legal).
  Zero-width cells contribute zero and must be skipped **before** the division.
- `r` undefined on a constant window → `null`, never `0` (§2.B.6).
- `1/bpm` at `bpm ≤ 0`: the domain gate rejects it, but a comparison reading an
  unrendered document will meet it. Refuse the dimension with a typed error rather
  than producing a number.

**PPQ.** `lcm` scaling with integer factors (§1.5). Assert `k_X` integral; if a `ppq`
is non-integer or absent, fall back to 720 exactly as `Performance.ts:196-202` does,
and record the fallback.

**Reproducibility.** No PRNG anywhere on the output path — which is one more reason
for the §2.G rejection of t-SNE/UMAP, and a reason to compare imprecision maps
*analytically* (§2.C) rather than by sampling them. Sampling would be the natural
first instinct and would be non-deterministic exactly where the data is most
interesting.

---

## §5. Pure-TS implementability

Zero new runtime dependencies is achievable for the whole stack. Sketches at the level
of "an implementer can write this without further research":

- **Gauss–Legendre quadrature.** Hard-code nodes/weights for `n = 7` and `n = 10` on
  `[−1,1]` as `readonly number[]`; affine-map to each cell. ~20 lines. No root-finding
  at runtime; include a test that reproduces the nodes via Newton on Legendre
  polynomials so the constants are auditable.
- **Bisection for L1 sign changes.** Fixed 50 iterations or `|b−a| < 1e−12·span`,
  whichever first — a fixed iteration cap keeps it deterministic. ~15 lines.
- **`Φ` and `Φ⁻¹`** (truncated-normal quantiles, §2.C). `Φ` via an Abramowitz–Stegun
  7.1.26-style rational `erf`, or the higher-accuracy Cody algorithm; `Φ⁻¹` via
  Acklam's rational approximation (|err| < 1.15·10⁻⁹) optionally refined by one
  Halley step to ~1e−15. ~40 lines total, self-contained, deterministic. (I used the
  Acklam form to verify §2.C's constants; it is the right level of accuracy here.)
- **Ruzzo–Tompa.** The standard linear scan with the `(I, L, R)` arrays. ~40 lines.
- **Levenshtein / semantic-cost DP with traceback.** Two rolling rows for cost plus a
  backpointer matrix for the path; `Int8Array` backpointers keep memory small at
  `n·m = 4·10⁶`. ~120 lines including the fragment/consolidate extension.
- **Lance–Williams agglomerative.** Distance matrix as a `Float64Array` in packed
  upper-triangular form; a coefficient table per linkage. ~80 lines.
- **PAM.** BUILD + SWAP, straightforward. ~70 lines.
- **Classical MDS with cyclic Jacobi.** Double-centering (~15 lines) plus Jacobi
  rotations on a symmetric `N×N` (~60 lines): sweep over off-diagonals in fixed
  `(i,j)` order, rotate to annihilate, stop when the off-diagonal Frobenius norm falls
  below `1e−12·‖B‖`. Deterministic and exact enough for `N ≤ 100` by a wide margin.
- **Compensated (Neumaier) summation.** ~8 lines; use it for every reported total.

Nothing here needs a matrix library, an optimizer, or an RNG. Total new numerical code
is roughly 500 lines, all testable in isolation against closed-form cases.

**Reuse (G5), concretely.** `datedView.orderedEntries` / `styleSwitchAt` /
`styleNameAt` for ordered views and positional style scope; `styleScope.resolveLevel`
for name→number indirection; `transforms.ts`'s space definitions as the source of `T`
(add forward maps *there*, next to the closed forms they must agree with, so a change
to one is visibly a change to the other); `bezier.tForDate`/`bezierPoint` for the
dynamics curve, so comparison speaks about the curve the renderer actually renders;
`TemporalValue` for v3 units; `Performance.resolveGlobalMaps`/`resolvePartMaps` for
global↔part resolution.

---

## §6. Open design questions for the conductor

Each with my recommendation, so none of these blocks W1.

**Q1. Is the headline metric the curve distance or the edit distance?**
→ **Curve distance.** It is a true metric with a proof, it needs no tuning constants,
and it is the object the exact decomposition attaches to. The edit path stays as the
*explanatory* product (U2/U3) with its cost reported alongside `d_curve`, and
Proposition 3 gives the two a rigorous relationship rather than leaving them as rival
numbers.

**Q2. L1 or L2 as the aggregating norm?**
→ **L1.** Exact segment-additivity in the reported units (§2.D.4) is the headline
feature and only L1 gives it. Offer the L2-based level/gain/shape split as a labelled
second table, not as a competing total.

**Q3. Fixed JND weights, or corpus normalization, by default?**
→ **Fixed**, with corpus normalization opt-in and its derived constants stamped into
every report. Pair normalization forbidden outright (§2.E). The JND constants are
conventions and must be documented as conventions — I would rather ship a defensible
convention than an undefended data-dependent number.

**Q4. `W₂` or `W₁` for imprecision?**
→ **`W₂`**, because its three-term decomposition is *the same theorem* as the curve
decomposition (§2.B.7 Lemma), which keeps the whole design on one mathematics. `W₁` as
an option. Revisit if the L1 aggregate's mixing of an `L²`-derived component starts to
look inconsistent in practice — that is a real if minor wrinkle, and it is the one
place where my two recommendations pull against each other.

**Q5. Do we ship Mongeau–Sankoff's fragment/consolidate moves in W3?**
→ **Yes, but repriced** (§2.A.6), and only after plain insert/delete/substitute works.
The moves are a *presentation* win (an edit script that says "consolidated 5 steps
into 1 transition" reads far better than 5 deletes and an insert), and with semantic
costs they are optimization sugar rather than semantic necessity — so they can land
late without changing any number.

**Q6. Per-part or whole-document distance?**
→ **Per-part vectors, aggregated to document level by a documented rule** (weighted by
part note-count from the MSM, if an MSM is available; uniformly otherwise). Two
documents with different part *counts* need an explicit rule; I recommend comparing
only parts matched by `name`/`number`, and reporting unmatched parts as a separate
structural finding rather than folding them into the distance — folding them in would
make the dimension set pair-dependent (§2.E).

**Q7. What happens with no MSM (no score)?**
→ Everything in §2.B–§2.E works from the MPM alone, since the timeline is symbolic.
The MSM is needed only for note-density weighting and for articulation dimensions that
reference note durations. **Recommend: MSM optional**, with the dependent features
degrading to documented defaults and saying so in the report.

**Q8. How much of the scape (B.8) ships, and when?**
→ **W4 at the earliest, opt-in, bin-capped.** It is the most attractive
visualization in the survey and the least essential to correctness; building it before
the exact-decomposition table is finished would be optimizing the demo over the
contribution.

**Q9. Comparison registry: superset table or extend `REGISTRY_ROWS`?**
→ **Separate table** with a superset-property test (§1.4). Extending the expression
registry to satisfy comparison would widen the write licence as a side effect of a
read requirement, which is exactly the kind of coupling the campaign's G5 divergence
rule exists to catch.

**Q10. What is the local metric for rubato's `joint-trim` pair (§1.3)?**
→ **L1 on the endpoints:** `|Δ lateStart| + |Δ earlyEnd|`. It is a metric on ℝ²
(hence on the window), it is symmetric between the two ends, and it needs no new
theory. The alternative — reusing the expression module's total-trim parametrization
(`lateStart + (1 − earlyEnd)` in `boundary-power-low`) — collapses two windows with
the same total trim but different placement onto distance 0, which is wrong for
comparison even though it is right for exaggeration. Note that in the recommended
architecture rubato is in any case compared primarily as a **displacement curve**
(§1.6), where the window's effect is measured directly; the attribute-level metric
matters only for the edit path.

**Q11. Does the module claim novelty?**
→ **[assumed]** — pending the musicology survey. My literature check found no prior
work computing distances between symbolic *performance-directive* encodings; if that
holds, the claim to make is narrow and defensible: not "first performance comparison"
(plainly false) but "first exact, additively-decomposable comparison of symbolic
performance encodings" — and the exactness is the part that is genuinely unavailable
to audio-based methods.

---

### Sources

- [Mongeau & Sankoff — melodic comparison / consolidation & fragmentation](https://link.springer.com/chapter/10.1007/978-3-642-33412-2_47)
- [Giraud et al., *What does the Mongeau–Sankoff algorithm compute?*](https://inria.hal.science/hal-02340896)
- [Sapp, *Comparative Analysis of Multiple Musical Performances*, ISMIR 2007](https://ismir2007.ismir.net/proceedings/ISMIR2007_p497_sapp.pdf)
- [The match file format (Partitura ecosystem)](https://arxiv.org/pdf/2206.01104)
- [Partitura: A Python Package for Symbolic Music Processing](https://arxiv.org/pdf/2206.01071)
- [Murtagh & Legendre, *Ward's Hierarchical Agglomerative Clustering Method*](https://www.numericalecology.com/Reprints/Murtagh_Legendre_J_Class_2014.pdf)
- [Applicability and interpretability of Ward's hierarchical clustering](https://arxiv.org/pdf/1909.10923)
- [Killick et al., *Optimal detection of changepoints with a linear computational cost* (PELT)](https://arxiv.org/pdf/1101.1438)
- [Ruzzo–Tompa algorithm](https://en.wikipedia.org/wiki/Ruzzo%E2%80%93Tompa_algorithm)
- [Tree edit distance — RTED/APTED](https://tree-edit-distance.dbresearch.uni-salzburg.at/)
- [X-Diff: change detection for XML documents](https://research.cs.wisc.edu/niagara/papers/xdiff.pdf)
- [The Normalized Edit Distance with Uniform Operation Costs Is a Metric](https://arxiv.org/pdf/2201.06115)
- [cmdscale — classical MDS and negative eigenvalues](https://www.mathworks.com/help/stats/cmdscale.html)
- [Taking all positive eigenvectors is suboptimal in classical MDS](https://arxiv.org/pdf/1402.2703)
- [2-Wasserstein distance via quantile functions](https://www.bioconductor.org/packages/devel/bioc/vignettes/waddR/inst/doc/wasserstein_metric.html)
