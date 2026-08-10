# Performance Comparison — Design

Status: W1 REVISION 2, panel-adjudicated.

**Provenance.** Revision 2 compiles the conductor's adjudication AD-1..AD-24
(LOG.md, 2026-08-10, "W1: panel adjudication AD-1..AD-24 [BINDING]") over the
four W1 panel reports — `panel/math.md` (M1–M19), `panel/renderer.md` (R1–R29),
`panel/api.md` (A1–A25), `panel/consumer.md` (C1–C17); `REVIEW-FINDINGS.md` is
the index. Ninety findings were filed and none was rejected. Revision 1 was
compiled from SURVEY.md's adjudications (A-Q1..A-Q11, A-B1..A-B5) over
survey-algo.md, survey-code.md and notes-conductor.md; those remain in force
except where a ruling supersedes them. **The adjudication is binding and
supersedes any conflicting text that survives in this document by error.**
Ruling IDs are cited inline in parentheses — `(AD-9)` — and finding IDs where
the finding's evidence is the reason a rule reads as it does. Sections that the
panel reversed carry one sentence saying so, because a reader who does not know
why a rule exists will eventually undo it.

survey-lit.md has since been delivered (2,600 lines, verified per its own §0
standard) and SURVEY.md §4 carries the conductor's synthesis; **AD-26 disposed of
every literature slot revision 2 carried**, and its amendments are compiled in
below. No pending-literature marker and no open item remains anywhere in this
document; the closing section records where each was settled.

---

## 1. What "comparing performances" means here

Two MPM documents (or two performances within documents) encode interpretations
of the same piece over a shared symbolic timeline. This module answers three
questions about them, and keeps them separate because they are different
questions:

1. **How far apart are the performances, and where, and in what?** — the
   _semantic_ level. Every expressive dimension is evaluated into the function
   over score time that **the renderer would perform**, and distances are
   computed between those functions. Two documents that encode the same tempo
   gesture as one continuous transition and as five steps tracing the same
   curve are CLOSE here, by construction.
2. **What sequence of edits turns document A into document B?** — the
   _syntactic_ level: a typed edit script over instructions, priced
   semantically and **sequentially** (§6). The same two documents are FAR here
   — and the report says so, because the gap between the two levels is itself a
   finding ("differently encoded, near-identically performed").
3. **How does a set of N performances organize?** — the _corpus_ level:
   distance matrices, clustering, embedding, all derived from level 1.

"The function the renderer would perform" is a promise with teeth, and the W1
renderer lens collected the cases where revision 1 broke it: a transition on a
map's last instruction is not performed at all (R1), an unresolvable level is
performed at a fabricated 100.0 (R2), `@loop` gates the rubato cycle (R3),
inline articulation duration levers do not compose (R4), a skipped `<tempo>`
re-times the following span at 100 qbpm (R6). §5 states the renderer's actual
semantics dimension by dimension; where the renderer is degenerate or absurd,
this module reproduces it and reports it rather than improving on it.

### 1.1 The central object: deviation densities

For one pair (A, B) and each comparison dimension `k` (§3), the engine produces
a non-negative **deviation density** `p_k(t) ≥ 0` over the shared,
PPQ-normalized score timeline, measured in **JND units per quarter note**
(§7.1). Everything the module reports is derived from these densities:

- per-dimension distance: `d_k = ∫ p_k(t) dt` (JND·quarters), also reported as
  the piece-length mean `d_k / L` (JND);
- the aggregate: `D = Σ_k ω_k d_k` with fixed documented weights (§7.2), and
  its mean `D / L`;
- ranked deviation segments: maximal-scoring segments of the thresholded
  **aggregate** density (§7.3, AD-19);
- the **exact attribution table**: for any partition S₁…S_m of the timeline,
  `c_{k,s} = ∫_{S_s} p_k` satisfies row sums = `d_k`, weighted column sums =
  segment contributions, grand total = `D`, with **zero residual** — because
  integration is additive over disjoint intervals and the aggregate is a
  weighted SUM, not a norm. Closure holds for _any_ partition; the thresholding
  in §7.3 only decides which partition is reported (AD-19, M9). This exactness
  is the module's headline capability; no audio- or MIDI-based comparison can
  decompose its distance by expressive dimension at all, let alone exactly.
  Every design choice that touches the metric is subordinate to preserving it
  (SURVEY A-Q2).

**The density is total on the window** (AD-1, AD-2). Revision 1 removed mass
from the domain in four places — unresolvable style spans, unmatched parts,
present-vs-absent replacement attributes, `timingBasis` mismatches — and the
math lens proved that each one destroys the triangle inequality, and destroys
it maximally: the zero set of a distance with a pair-dependent domain is not
transitive, so `d` is not a pseudo-metric at all and "modulo semantic
equivalence" has no referent (M1). Revision 2 removes nothing. Where a side has
no comparable value the row reads the distinguished symbol `⊥` and the capped
local metric of §4 prices it; where the renderer has no performed value the
span reads `⊥` and is reported as a `renderer-error` note.

**Two headline numbers, and which is which** (AD-23, C10). `D` in JND·quarters
is the _additive_ figure: it is what the attribution table decomposes and what
the clustering consumes, and it **scales with piece length**, so it is not
comparable across pieces of different length. `D / L` in JND is the _human_
figure: "these two performances are on average 1.4 JND apart" is a sentence a
musicologist can write, and it transfers across pieces. The report carries both,
the docs say which is which, and the length-dependence of `distance` is stated
in the report's own metadata.

### 1.2 The interpretive companion: level / gain / shape

One lemma serves twice (survey-algo §2.B.7): for curves in T-space over
`(time, dμ)` and equally for quantile functions over `([0,1], du)`,

    ‖h_A − h_B‖₂² = (ℓ_A − ℓ_B)² + (σ_A − σ_B)² + 2σ_Aσ_B(1 − r)
                      level           gain            shape

- curves: `d_level` ("is one globally faster/louder?"), `d_gain` ("is one's
  shaping more exaggerated?"), `d_shape` = √(2(1−r)) ("do they shape the same
  way?" — scale- and level-invariant, Sapp's correlation consumed as a
  component rather than offered as a rival metric);
- distributions: the same three terms are the W₂ decomposition
  (location / spread / distributional shape).

**Which measure** (AD-18, M8). The lemma needs a _probability_ measure and
§5.0's default weight `w ≡ 1` is not one. The decomposition is therefore
computed on the **normalized** measure `dμ = w dt / ∫_W w dt` (recomputed per
window and per invariance mode); the headline density is computed on the
**unnormalized** `w dt`, which is what makes `d_k` a mass in JND·quarters and
what makes the attribution table close. The two measures are named separately
everywhere they appear, because reading `ℓ_X = ∫ h_X dμ` against the
unnormalized measure silently changes `d_level`'s units from nepers to
neper·√quarters.

**Four fields, not three** (AD-18). The report carries `level = |ℓ_A − ℓ_B|`,
`gain = |σ_A − σ_B|`, `shape = √(2(1−r))` **or null**, and `r` **or null**,
plus the closing check `‖h_A − h_B‖₂²`. `level`, `gain` and `shape` are
square-_roots_; the identity is in squares. The degenerate convention is written
down rather than left to an implementer: **the shape term := 0 when
`σ_A σ_B = 0`**, so the identity stays exact while `shape` and `r` are `null`
and the window is marked `shapeless` — a boolean companion so consumers branch
on a flag rather than on a null (C14). `r` on a constant window is never 0.
**`σ = 0` is recognized structurally, never by float equality** (AD-32,
M18's lesson recurring): a constant curve integrated by quadrature carries
variance ~1e−31, not 0, so the test is variance below
`(SPREAD_NOISE_FLOOR · scale)²` with `SPREAD_NOISE_FLOOR = 1e−12` relative to
the curve's own scale — 17 orders of margin to the measured quadrature noise
below and to the smallest musically meaningful spread (0.1% tempo variation,
σ ≈ 1e−3) above. Variance is computed as `∫(h−ℓ)²`, never `∫h² − ℓ²`, whose
cancellation catastrophically loses a small spread against a large mean —
the ORDINARY tempo-curve case, not a corner.

This table is L²-family, the headline is L1-family (A-Q4 as amended: W₁ feeds
the aggregate, W₂ feeds this table). The two are **never mixed**: the report
labels the decomposition an interpretive product whose components do NOT sum to
the headline distance.

### 1.3 Cross-module coherence (Proposition 1, corrected)

Revision 1 asserted that `exaggerateMpm` acts on comparison curves as
`g ↦ c + s(g − c)` for every shared dimension. That is false wherever the
renderer interpolates, and the math lens measured the failure: a 60→120 tempo
transition exaggerated by `s = 2` about 60 produces 150 qbpm at the midpoint
where the affine law predicts 135, giving `d_shape = 8.56·10⁻²` against a
pinned `ε ≈ 10⁻¹²` and `σ_B/σ_A = 1.93` against a claimed 2 (M4). Since
survey-code measured `transition.to` in 79–100 % of real files, P-C5 as written
could not pass on the corpus.

> **Proposition 1 (corrected, AD-6).** `exaggerateMpm(s)` acts on each registry
> row's value as multiplication by `s` in that row's T-space — i.e. **at the
> curve's breakpoints**. Consequently, for a dimension whose comparison curve
> is `T⁻¹` applied pointwise to a **piecewise-constant** family of row values
> all transformed with the same `s`, the T-space curve satisfies
> `g ↦ c + s(g − c)`, whence `shape` is invariant, `gain ↦ |s|·gain`,
> `level ↦ c + s(level − c)`. For dimensions whose renderer interpolates in a
> space other than T (tempo, dynamics, rubato, pedal), the law holds **at the
> breakpoints only**; the interpolated interior is not the affine image and
> `d_shape > 0` in general.

Two corollaries the property test must respect (AD-6): monotonicity is in
**|1 − s|**, not `|ln s|` — for a piecewise-constant curve
`d(mpm, exagg_s(mpm)) = |1 − s|·∫|g − c|`, and the two orders disagree across
`s = 1`; and `s < 0` is excluded from every invariance claim, because it gives
`r = −1` and hence `d_shape = 2`. The test's `factors` vector must pin every
shape knob (`tempoShape`, `dynamicsShape`, `ornamentSpacing`, …) to 1, since
`meanTempoAt` moves the exponent `e` and changes the curve's shape for a second,
independent reason. P-C5 splits into three parts accordingly (§10). This is
still the strongest evidence the two engines are one mathematics — it is just
true.

### 1.4 What this module is not

The literature survey ends in three prohibitions, and they are stated here rather
than buried in the README because each names a claim the products above could
easily be mistaken for (AD-26.6, survey-lit §7):

1. **Not a quality judge.** Timing and dynamics together account for only
   **9–18 % of the variance in aesthetic ratings** of real recordings (Repp 1999
   III; the figure is 53 % for synthesized performances, which is precisely the
   gap). A large `D` means two performances differ, never that one is worse. No
   product ranks performances by merit and none ever will.
2. **Not a perceptual-similarity model.** Nothing in the literature supports one
   for whole performances. JND normalization makes the units _perceptually
   scaled_ — a difference below one JND is not a difference (survey-lit L5) — and
   that is a much weaker claim than predicting what a listener would call similar.
   The §7.3 equivalence block is the honest form of the strong claim: it says
   what fraction of the deviation is below threshold, not what anyone will hear.
3. **Never a single number.** Peter et al. (2023, DLfM) showed experimentally,
   with a listening test, that a single MSE-style distance between performances
   flips its ranking depending on which reference is chosen and cannot reliably
   separate expert from randomised playing; Liebman, Ornoy & Chor (2012)
   quantified the cost of the obvious shortcut — **r = 0.12 for a concatenated
   heterogeneous feature vector against 0.40–0.42 for the two best single
   families**. That is the evidence base for this design's shape: per-dimension
   distances first, the aggregate second and always beside its decomposition, and
   per-family disagreement reported as a _result_ rather than averaged away. A
   caller who quotes `aggregate.distance` alone has discarded the finding.

Dimension-level non-goals are stated where the dimension is defined — §5.7 for
asynchrony's per-note and register limits — and §11 makes the whole set a W4
documentation obligation.

---

## 2. Requirements

From the charter (U1–U6) and the standing constraints (G1–G6), refined:

- **R1 Pure readers.** Text in, plain data out. No input document is ever
  mutated (MPM classes constructed only on `Element.copy()`; the primary
  reading layer is the expression document layer, which never writes). No
  output document exists — this module writes no MPM.

- **R2 Determinism.** Identical inputs yield identical output bytes
  (JSON-serialized reports). No PRNG on any path; imprecision maps are compared
  analytically, never by sampling. All ties broken by documented rules (§6.4,
  §7.3, §8). Symmetry is bit-exact: `compare(a,b)` and `compare(b,a)` agree to
  the last bit on every number (sorted-union grids, |x−y| cells, date-ordered
  Neumaier summation). Three mechanical conditions make that true rather than
  hoped-for: the sign-change bracket update is written as a sign _comparison_
  (`sign(f(m)) === sign(f(a))`), never `f(m) > 0`, since `f ↦ −f` is exact in
  IEEE754 and inverts both tests consistently (M16); `-0` is normalized to `+0`
  at the report boundary (AD-21, A20); and every array and record in the report
  has a total order independent of which document is `a` (§9, A9).

- **R3 Metric honesty, conditionally stated.** The _defined_ per-dimension `d_k`
  and any fixed-weight aggregate satisfy identity, symmetry and the triangle
  inequality on the space of documents (modulo semantic equivalence) **given a
  piece-derived window** (AD-4): an MSM score end, an explicit `options.window`,
  or the corpus-shared window. The no-MSM pairwise fallback (max last dated
  instruction over both documents) is retained for convenience and is
  _not_ metric: with `A = {60@0}`, `B = {60@0, 120@100}`, `C = {60@0, 60@200}`
  the three windows differ and `d(B,C) ≤ d(A,B) + d(A,C)` reads `100·ln2 ≤ 0`
  (M2). Such runs are stamped `windowRule: 'pair-derived'` and
  `metricGuarantee: 'window-restricted'`, and the docs state plainly that those
  numbers must not be assembled into a matrix. The `d_k / L` mean carries the
  same caveat. The invariance modes of §7.4 additionally require a
  piece-derived or corpus-shared window, because per-document centering is a
  canonicalization only for a fixed window.
  The local metric on every row is **capped**, `min(|T(x)−T(y)|/jnd, 2δ_row)`,
  with `⊥` at distance `δ_row` from everything and 0 from itself (§4, AD-2).
  Pair-dependent normalization is forbidden and unimplemented; corpus-level
  normalization is opt-in and stamps its derived constants. The _computed_
  values are quadrature evaluations of the defined objects with a **per-family**
  accuracy record, not one global ε (§5.0, AD-17).

- **R4 Exact decomposition.** The dimension × segment table closes with zero
  residual (§1.1). Closure is a consequence of countable additivity and holds
  for any partition of the window; the reported partition is the ranked segments
  plus an explicit below-threshold remainder column (AD-19).

- **R5 Level separation, as theorems.** Semantic distance and edit script are
  separate products with a reported relationship. Because the script is priced
  **sequentially** (§6.2, AD-5), `scriptCost ≥ d_curve` and `reworking ≥ 0` are
  theorems of the L¹ triangle inequality rather than aspirations; revision 1's
  pricing-against-A rule made both false, and the DP actively preferred the
  scripts that broke them (M3). A no-op encoding difference costs 0 by pricing,
  not by special-casing — but "no-op" now means zero _sequential_ cost, which is
  the only reading consistent with what the renderer performs.

- **R6 Absence is neutral, not missing.** A map absent on one side compares
  against the neutral curve (identity warp, 0 offset, no-op pattern); the
  dimension is never dropped (a pair-dependent dimension set would break R3).
  The rule extends in two directions the panel required:
  - **to parts** (AD-3, M1b): an unmatched part is compared against the neutral
    curve, not excluded, and the document-level aggregation rule is a **SUM over
    the union of both documents' parts** (matched pairs + unmatched-vs-neutral).
    A mean over matched parts would be the pair-dependent-domain disease again.
  - **to the region before the first instruction** (AD-9ii, R11): the neutral
    specification is per dimension and includes the renderer's
    pre-first-instruction constants — tempo 100 qbpm on `[0, firstValidTempo)`,
    dynamics velocity 100 before the first `<dynamics>`. A left-extension of the
    first instruction, the obvious implementation, is wrong.
    The asymmetry is reported as a structural note.

- **R7 MSM optional.** All core products work from MPM text alone. An optional
  `msm` input adds: the piece-derived window, note-density weighting,
  note-anchored articulation resolution against real note lists, **measure /
  beat mapping** (AD-23, C3), and estimate refinements — each degrading to a
  documented default without it, reported as such (three-state: value / null
  "this MSM cannot answer" / not requested). An MSM is **part of the metric**
  here, not a report-only side input as in the expression facade: it moves the
  window, the weight function and articulation resolution, so `msmUsed` is
  stamped in every report (A11).

- **R8 Renderer-faithful resolution** (AD-1; **this reverses revision 1**).
  Style-name levels resolve through the expression `styleScope`
  (def / literal / unresolvable). An _unresolvable_ tempo or dynamics level
  resolves to **the renderer's own fabricated constant** — 100.0 for `bpm`
  (before the `beatLength·4` normalization) and velocity 100.0 for `volume` —
  and is reported as a `renderer-default-level` note carrying the span length.
  No span is excluded. Revision 1 forbade exactly this, quoting `styleScope`'s
  refusal to invent a level the author never wrote; that refusal is correct for
  a _write_ transform and importing it into a _read_ product was the error
  (R2). The renderer literally returns 100.0
  (`TempoStyle.getNumericBpmValueStatic:49-58`,
  `DynamicsStyle.getNumericValueStatic:49-57`), so `volume="?"` and
  `volume="100"` are performed identically and revision 1 hid that agreement,
  while `volume="?"` against `volume="40"` is a 1.4-neper difference an audience
  hears plainly and revision 1 hid that too.
  Exclusion survives nowhere. Where the renderer has **no performed value at
  all** — an unresolvable `accentuationPatternDef` name, which aborts the render
  with a `TypeError` (R21); an `<asynchrony>` with no `@milliseconds.offset`,
  which poisons its whole span with NaN (R24) — the span reads `⊥` and is
  reported as a `renderer-error` note, priced by the capped metric (R3, §4).

- **R9 Full read coverage.** Every numeric attribute of every map/def the MPM
  model carries is either (a) a comparison-registry row feeding a dimension,
  (b) an **inert** row that contributes zero and is reported when it differs, or
  (c) an enumerated exclusion with a one-line rationale. No silent gaps: a W2
  test walks the full attribute inventory (survey-code §1.2) against the
  registry. Inertness is **not always a static property of a row** (AD-11, R4):
  on an inline `<articulation>` exactly one duration lever is live and the
  others are inert, while on an `<articulationDef>` they compose, so the
  registry carries element-keyed _conditional liveness_ alongside the static
  inert bucket.

- **R10 Scale.** N up to **256** performances (AD-23, C17 — the `Daten` corpus
  is 121 files and mlign's is 200; revision 1's ~100 sat below both), maps up to
  ~5k instructions: O(n²) per pair and O(N²) pairs are acceptable; nothing worse
  than O(N³) total (clustering) without journaled justification. The ceiling is
  an explicit option (`maxItems`, default 256), not a number in prose. Two grid
  bounds are part of the budget rather than consequences of it: rubato frame
  boundaries are capped (§5.2, AD-10), because `frameLength="1"` is legal and
  would produce 1.7 M boundaries per instruction per part (R25); and the
  refinement grid is bounded below by the tick, since nothing finer is
  meaningful.

---

## 3. Comparison dimensions

The semantic unit is the **map domain**, not the exaggeration knob: a curve
already integrates what expression splits into level and shape knobs (the tempo
curve contains `meanTempoAt`'s effect), and the §1.2 decomposition recovers the
interpretive split analytically. Eleven contributing dimensions:

| dimension             | primary object                                        | space of the curve              | notes                                                                                                 |
| --------------------- | ----------------------------------------------------- | ------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `tempo`               | quarter-bpm curve over score time                     | log (nepers)                    | `bpm·beatLength·4` normalization; power transitions, skip re-timing and the degenerate table per §5.1 |
| `rubato`              | displacement curve `warp(t) − t`                      | gain, quarters                  | transliterated cyclic warp, **gated by `@loop`**; PPQ-normalized                                      |
| `dynamics`            | volume curve per part                                 | log (nepers)                    | ideal cubic Bézier (§5.0); renderer-default levels per R8                                             |
| `accentuation`        | resolved per-beat accent contribution                 | gain, velocity units            | phase anchored at the **time signature**; exact without an MSM                                        |
| `articulation`        | per-attribute step/event profiles with atom shadowing | per-row space                   | multi-attribute dimension; conditional row liveness (R9)                                              |
| `ornamentation`       | date-matched discrete events                          | per-row space                   | the alignment DP _is_ the distance (§5.6)                                                             |
| `asynchrony`          | ms-offset step curve per part                         | gain, ms                        | NaN-poisoned spans read `⊥`                                                                           |
| `pedal`               | movement position curve + shape                       | gain on [0,1] (`ratio`)         | flat span structure across controllers (§5.8)                                                         |
| `imprecisionTiming`   | distribution-valued curve                             | native ms                       | W₁ density; W₂ interpretive                                                                           |
| `imprecisionDynamics` | distribution-valued curve                             | native velocity                 | same                                                                                                  |
| `imprecisionDuration` | distribution-valued curve                             | native (ratio/ms per attribute) | same                                                                                                  |

**Row aggregation is SUM** (AD-20, M12). A multi-attribute dimension's `d_k` is
the sum over its rows and over its atoms — stated here as a rule, not as an
aside in a table cell, because §7.2's default weights depend on it.

Plus two non-contributing channels:

- **structural findings**: unmatched parts (compared against neutral, R6, but
  still reported), global-vs-part encoding mismatches, renderer-skipped
  instructions, mechanism switches (`@subNoteDynamics`, §5.3), count
  mismatches, `%`-vs-absolute unit mismatches without an MSM — reported, never
  folded into a distance (A-Q6, A-B2);
- **inert content**: attributes the renderer provably ignores — zero density,
  reported when the documents differ there (R9b). The inventory is corrected by
  AD-15: `imprecisionMap.tuning.offset` (written by
  `ImprecisionMap.ts:438-441`, read by nothing) **and**
  `articulation@detuneCents` / `@detuneHz`, which revision 1 wrongly gave live
  comparison rows and wrongly called neutral-less — they default to 0.0 and are
  written onto the MSM note and read by nothing (R14). Also inert _by position_:
  the transition attributes of a map's last instruction (§5.1, AD-8) and
  `@subNoteDynamics` on a map's last instruction (§5.3).

**Dimension-set stability, honestly stated** (AD-22, A13). Revision 1 claimed an
inert row could flip to a twelfth dimension "without an API break". It cannot:
the exported union widens (breaking every exhaustive `switch`), every full
`Record<ComparisonDimension, …>` gains a key, and — decisively — `D = Σ ω_k d_k`
gains a term, so **every previously reported distance changes**, including
P-C9's pinned regression anchors and any published figure. The correct contract:
promoting an inert row to a dimension is **additive in the list and breaking for
consumers**, scheduled as a major version with the anchors regenerated. What the
exported list buys is that the change is _mechanically enumerable_ — one test
walks `COMPARISON_DIMENSIONS` and no consumer hard-codes eleven names.

Correspondence to the 15 expression dimensions (for the §1.3 test):
tempo ⊇ {tempo, tempoShape}; dynamics ⊇ {dynamics, dynamicsShape};
rubato ↔ rubato; articulation ↔ articulation; accentuation ↔ accentuation;
ornamentation ⊇ {ornamentSpread, ornamentSpacing, ornamentDynamics};
asynchrony ↔ asynchrony; imprecision* ↔ imprecision*; pedal ⊇ pedalShape.
Exported as a frozen data table so the cross-module test enumerates it rather
than hard-coding it (A25).

---

## 4. The comparison registry (L0)

Its own table in `src/comparison/registry.ts`, reusing the `ScaleSpace`
vocabulary and shape of `RegistryRow` but NOT extending `REGISTRY_ROWS`
(A-Q9: a read requirement must not widen the write licence). Each row:

    { dimension, element, attribute, sites, space, valueDomain,  // as expression
      key: `${dimension}/${element}@${attribute}`,   // the public row key (A1)
      unit: 'nepers' | 'quarters' | 'ms' | 'velocity' | 'cents' | 'ratio'
            | 'percent' | 'dimensionless',
      jnd: number,             // §7.1 constant in `unit`; [literature] or
                               // [convention] tag carried in `notes`
      delta: number,           // δ_row, the metric cap, in JND units (AD-2)
      plausibleRange: readonly [number, number] | null,   // §5.0, C6
      role: 'curve-level' | 'curve-shape' | 'step' | 'event' | 'distribution'
            | 'process' | 'inert' | 'structural',
      liveness: 'always' | { element: string, rule: string },   // AD-11, R9
      ppqSensitive: boolean,   // tick-valued → rescale by lcm factor (§5.0)
      notes: string }

**The row key** (AD-22, A1). Revision 1 typed `options.jnd` as
`Partial<Record<string, number>>` "per REGISTRY row key" and never defined the
key. The expression registry's own `siteKey` is `element@attribute`, and its
shipped comment says that pair is **not** unique — `<distribution.uniform>`
appears identically in three maps and therefore three dimensions; and across
the live registry `transition.to` occurs ×3, `curvature` ×2, `protraction` ×2,
`intensity` ×2, `value` ×2. So the comparison key is
`` `${dimension}/${element}@${attribute}` ``, the closed vocabulary is exported
as `COMPARISON_JND_KEYS` with a compile-time type, and `options.jnd` is
`Partial<Record<ComparisonJndKey, number>>` so a misspelling fails to compile
rather than silently doing nothing (the failure mode `ExaggerateOptions.factors`
exists to prevent). Unknown, non-finite or non-positive values are an
`InvalidOptionError`; a zero JND divides.

**The capped local metric** (AD-2, M1, M11). Every row's value space is extended
by a distinguished symbol `⊥`, and the local metric — on the row's
JND-normalized scale — is

    d_row(x, y) = min( |T(x) − T(y)| / jnd_row , 2·δ_row )
    d_row(x, ⊥) = δ_row      d_row(⊥, ⊥) = 0

`δ_row` is registry data in JND units, default **10** [convention]: "an
incomparable value counts as ten JNDs, and no single instant counts as more than
twenty". Four things fall out of one mechanism: (i) truncation of a metric is a
metric, so the axioms survive; (ii) `T`'s infinite boundary values become finite
without a separate clamp constant; (iii) "no comparable value" gets a
metric-safe price instead of a hole in the domain; (iv) the density stays total,
so R4's exact decomposition is untouched. Cap events are reported (`capped`
note kind). The instances: replacement attributes present-vs-absent — narrowed
by R14 to `absoluteDuration`, `absoluteDurationMs`, `absoluteVelocity` — and
renderer-error spans (R8).

**Where `T` is infinite on legal input** (M11), enumerated so no implementer
rediscovers it: `boundary-power-low` at `x = 1` (`ln(1−x) = −∞`, e.g.
`curvature = 1`); `boundary-power-high` at `x = 0`; `logit(−1,1)` at both bounds
(`protraction = ±1`); `log-around-*` and the bare logarithm at `x = 0`. All are
legal values in this port (`transforms.ts:324`, expression §7.5's boundary fixed
points). The cap makes each finite. The one case the cap cannot rescue is
`qbpm ≤ 0`, where `ln` is `NaN` rather than signed-infinite: that is a typed
error on the document (§9), not a distance.

- Forward maps `T(x)` per scale space are added to
  **`src/expression/transforms.ts`**, next to the closed forms they must agree
  with (survey-algo §5-reuse; a property test pins `T(C(x,s)) = s·T(x)` for
  every space). `log-around-center` collapses to the bare logarithm: the center
  cancels in every difference (SURVEY §1.2). These exported members' only
  consumer is `src/comparison/**`, and they live in `expression/` deliberately —
  they must sit beside the closed forms they are property-tested against (A24).
- **Superset property, tested:** every live expression-registry row has a
  comparison row with the same scale space; every attribute in the full
  survey-code §1.2 inventory appears exactly once across rows / inert /
  exclusions (R9).
- The `jnd` column carries a per-row provenance tag, settled by AD-26.2.
  **`asynchrony` = 30 ms is [literature]**: the 30 ms perceptual threshold for
  onset asynchrony is the Vernon 1936 → Goebl 2001 tradition, and the field's
  operational definition of "simultaneous" — the 35 ms chord-clustering window —
  sits just above it (survey-lit §1.1, §2). **Every other default ships
  [convention]** per AD-24, with survey-lit's _partial_ support named in the
  row's `notes` rather than promoted to a citation: for tempo, the >2 %
  local-slowing threshold that Widmer's rule learner uses to call a ritardando,
  and Sundberg, Friberg & Frydén (1991)'s finding that musicians' preferred
  k-values sit close to the threshold of perceptibility — which is the empirical
  form of this module's own rule that **differences below one JND are not
  differences** (survey-lit L5). Values are overridable via options while
  remaining the documented default. `delta` (δ_row) and `κ` (§7.1) are documented
  [convention] registry constants and are **not** caller-overridable in v1 of the
  module, to be revisited on consumer demand (AD-25.7).
- **`plausibleRange`** (AD-23, C6) is a per-row band on the **resolved** value,
  checked once per document, never on the difference — so it is a per-document
  descriptor and cannot make the metric pair-dependent. Its override option is
  keyed on `ComparisonJndKey`, the same closed row vocabulary as `jnd`
  (AD-25.8). See §5.0.

**Exclusions (R9c)** — each with a rationale:

- `@date` itself: it is the axis, priced through densities and the edit path's
  date component, not a row.
- `xml:id` and `*.ref`: identity, not quantity. **`@noteid` is named explicitly**
  (AD-15, R16/R29): it is spelled `noteid`, not `noteid.ref`, so the `*.ref`
  pattern does not catch it and the R9 inventory walk would have reported a gap.
- Enums and non-numeric booleans: equality checked, difference = structural
  finding, since no meaningful magnitude exists. **`@loop` leaves this bucket**
  (AD-10, R3): it is read by the rubato and accentuation curve evaluators and is
  the single most consequential attribute on a `<rubato>` after `@frameLength`;
  filing it as a structural finding made two documents differing only in `@loop`
  score `d_rubato = 0`. `@stickToMeasures` likewise enters the accentuation
  evaluator (§5.4). The bucket is sound only for booleans the renderer does not
  read.
- `@seed`: changes no distribution law; reported as an inert difference.

**Rows added by AD-15** that revision 1 omitted: `ornament@scale`,
`ornament@repetitions` (`-1` is the documented meico extension "fill the frame";
any other unusable value falls back to 0), `ornament@note.order` (two read
paths, v2 flat and v3 grammar), and the two v3 frame attributes revision 1
missed, `frame.offset` and `time.unit` (R18). Parse note for fixture handling:
`accentuationPatternDef@length` is **mutated on parse** — a missing `@length` is
added to the element with the default 4.0 — so the attribute is never observably
absent downstream, and §5.4 states the 4.0 default rather than relying on it
(R29).

---

## 5. Semantic evaluation, per dimension (L1–L3)

### 5.0 Common machinery

**Timeline.** Dates from both documents are rescaled to `lcm(ppq_A, ppq_B)` with
integer factors (exact in IEEE754), then reported in quarters. Every
`ppqSensitive` registry row's value rescales by the same factor; `*Ms` and other
absolute-time attributes never do. `ppq.fallbackUsed` (A21) means exactly one
thing: a document declared no `@pulsesPerQuarter` and the documented default was
assumed; the assumed value is stamped alongside it.

**Window** (AD-4). The comparison window is `[start, end]`, `start = 0` unless
the caller supplies one. `end` is, in precedence order: the MSM score end
(`windowRule: 'msm'`); an explicit `options.window` (`'explicit'`); the
corpus-shared window (`'corpus'`); otherwise the max over both documents of the
last dated instruction (`'pair-derived'`). The first three are **piece-derived**
and carry `metricGuarantee: 'unconditional'`; the fourth carries
`'window-restricted'` and the documented prohibition on assembling such numbers
into a matrix (R3). One window per pair, and one window per CORPUS (§8), so
matrix entries are values of one function. The corpus window is
_corpus_-dependent — adding an item moves `end` and therefore every entry — the
same reproducibility caveat already carried for `normalization: 'corpus'`. The
window and the rule that chose it are stamped in the report.

**The domain is total** (AD-1, AD-2). Nothing is ever excluded from `[start,
end]`. Where a side has no comparable value the row reads `⊥`; where the
renderer has no performed value the span reads `⊥` on that side. Both are priced
by §4's capped metric and reported through the notes channel with the causes
`renderer-error`, `renderer-default-level` or `capped`.

**Densities are measures.** `p_k` = an absolutely continuous part (curves, step
functions, distribution spans) plus **atoms** at event dates (articulation
events, ornaments). Cells of the refinement carry both; the attribution table
sums both; everything still closes exactly. Prose says "density" throughout; the
report schema calls the atoms `events`.

**Refinement grid.** Sorted union of both documents' breakpoints for the
dimension — instruction dates, transition ends _where a transition is actually
performed_ (AD-8), skip dates and the first valid instruction date (AD-9),
rubato frame boundaries subject to §5.2's cap, imprecision span edges under the
next-entry-of-any-kind rule (AD-14) — deduplicated exactly in integer lcm-ticks.
The grid is bounded below by the tick.

**Quadrature** (AD-17, M6, M7, R20). Step cells are integrated exactly. Continuous
cells use fixed-order Gauss–Legendre (order 10) under three rules that revision 1
lacked:

1. _Tempo cells are integrated on an equal-mass graded mesh_ (**AD-28.1**, which
   supersedes AD-17's substitution). `e = ln 0.5 / ln(meanTempoAt)` ranges over
   `(0, ∞)` on legal input, and GL-10 on `ln(bpm₀ + Δ·u^e)` loses accuracy at
   **both** ends — measured relative error 1.9·10⁻⁵ at `e = 0.5` and 2.7·10⁻⁴ at
   `e = 150` (M6). That diagnosis stands; the remedy has been replaced, because
   the one AD-17 prescribed was **measured and falsified**. The substitution
   `u = z^{1/e}`, `du = (1/e) z^{1/e−1} dz` does remove the singularity for
   `e < 1`, but for `e > 1` it drives the Jacobian exponent `1/e − 1` negative
   and _creates_ a `z → 0` singularity the original integrand never had:
   measured relative error 3.5·10⁻² at `meanTempoAt = 0.7`, **3.9·10⁻¹ at 0.9**,
   9.2·10⁻¹ at 0.99, and at `e = 150` a result outside the bounds of the
   function being integrated. That is the entire late-weighted-ritardando half
   of the range, including AD-17's own cited `meanTempoAt = 0.93`.
   The ruled scheme is a **graded mesh**: panels at `u = (k/K)^{1/e}` for
   `k = 0 … K`, `K = max(2, ⌈log₂ e⌉ + 2)`, GL-10 on each panel. Each panel
   carries equal mass in `z = u^e`, so the mesh concentrates into the boundary
   layer at `u = 1` exactly when `e` is large and spreads out when it is small.
   It transforms nothing, so it has no Jacobian and no singularity to create.
   **One scheme for the whole legal range, no regime branching.** Measured worst
   relative error 3.3·10⁻⁶ over `meanTempoAt ∈ [0.02, 0.99]` (2.9·10⁻⁵ at
   0.999), against naive GL-10's 4.4·10⁻⁵ (2.9·10⁻⁴) — about a factor of ten
   better everywhere and worse nowhere.
   The floor in `max(2, ·)` is not cosmetic: `⌈log₂ e⌉ + 2` is 0 at `e = 0.23`
   and negative below it, so the bare formula asks for no mesh at all across the
   whole `e < 1` regime.
   The falsified substitution is retained in `quadrature.ts` **solely** as a
   pinned counterexample, under failing-by-design assertions, so that it cannot
   quietly return.
2. _Sign changes are bracketed by structure, not by endpoint signs._ Bisection
   can only find a crossing it has a bracket for, and `g_A − g_B` can cross
   **twice** inside one cell with equal endpoint signs — two legal tempo
   transitions (72.6→132.6 at `e = 2` versus 60→120 at `e = 1`) cross at
   `u = 0.3` and `u = 0.7` and revision 1's mechanism integrates the cell whole,
   with relative error 1.48·10⁻², ten orders past the advertised ε, silently
   (M7). For power-vs-power tempo cells the difference has a single interior
   critical point `u* = (qΔ_b / pΔ_a)^{1/(p−q)}` (for `p ≠ q`); split there and
   the two branches are monotone, so the existing bisection (fixed 50 iterations,
   sign-comparison bracket update per R2) is complete and correct.
   2b. _Bézier-pair cells are subdivided_ (**AD-30**). Two Bézier segments over one
   span can cross more than once and the bisection resolves one crossing per
   sub-interval, so a single-interval reading integrates such a cell low. There is
   no closed-form critical point as there is for power-vs-power, so completeness is
   bought by fixed equal subdivision into `K` pieces of any cell where BOTH sides
   are live transitions. **`K = 16`, per AD-31, which supersedes AD-30's
   `K = 4` on measurement.** For `40→80` at
   `curvature 0.9, protraction 0.9` against `38→84` at `curvature 0,
protraction 0.9` — control points in range, `x(t)` monotone — the difference
   crosses at `x = 0.598, 0.914, 0.984`; the last two are 0.07 apart, land in one
   quarter, and `K ∈ {1,2,4}` all give 6.5·10⁻² relative error, `K = 8` gives
   4.8·10⁻², `K = 16` gives 2.7·10⁻⁸. Strong protraction skews the curve toward one
   end and clusters the crossings there, which is where an equal subdivision is
   relatively coarsest; AD-30's "negligible-by-construction" curvature argument does
   not survive it: the argument is about the smoothstep in `t`, while the
   clustering happens in `x` after the monotone reparametrization.
   2c. _Frame-aligned rubato cells split at a structural `u*`_ (**AD-33.3b**). `δ` is a
   saw-tooth — it rises across the frame from `L·lateStart` and drops to
   `L·(earlyEnd − 1)` at the wrap — so `δ_A − δ_B` routinely starts and ends a
   cell with the SAME sign while crossing zero twice between, and a cell with no
   split is integrated as `|∫ f|` instead of `∫ |f|` with the lobes cancelling.
   Measured over 3906 legal frame-aligned pairs, the unsplit reading was wrong by
   > 0.1 % on **59.6 %** of them, worst case total cancellation. Within one shared
   > frame `Δδ(x) = L·[α·x^p − β·x^q + (ls_A − ls_B)]` with `α = ee_A − ls_A`,
   > `β = ee_B − ls_B`; its derivative has exactly one positive root, so the
   > difference has one interior stationary point and at most two zeros — the same
   > structure rule 2 solves for tempo. Split at
   > `u* = (q·β / (p·α))^{1/(p−q)}` via `powerCriticalPoint`, arguments canonically
   > ordered per AD-33.2. Where the two frames differ in length or phase there is no
   > shared coordinate, and the fallback is fixed `K = 16` subdivision.
   > **Fixed subdivision alone is not adequate here** — it leaves 226 pairs wrong at
   > `K = 16` and 62 at `K = 32`, against 10 for the structural split — which is why
   > rubato gets rule 2c rather than rule 2b's device. Residual after both repairs:
   > 10 of 3906 pairs wrong by >0.1 %, worst 1.68·10⁻³ relative.
3. _The defined dynamics/pedal curve is the ideal cubic Bézier._ `tForDate`
   (`bezier.ts:57-78`) stops at a **1-tick tolerance in the date domain**, so
   `date ↦ volume` is a staircase with thousands of treads across a long cell and
   GL-10 cannot approach 1e−12 against it (R20). The _defined_ object is the
   smooth ideal Bézier, on which GL-10 converges; `tForDate` is the renderer's
   approximation of that object and is used only in the §6.3 replay, with the
   divergence bounded and documented as `|Δvolume| ≤ |v′(t)| · 1 tick / |x′(t)|`.

Accuracy is reported as a **per-family record over five families**, not one
global ε (AD-17; five rather than the ruling's four per AD-25.6): a single
constant cannot be true of `step` dimensions (exact), `tempo` (quadrature after
the substitution above), `bezier` (quadrature against the _ideal_ object, whose
error model is the `tForDate` divergence bound of rule 3 and not tempo's
substitution — which is why it is its own family), `imprecision`
(special-function — the Φ/Φ⁻¹ rational approximations, currently Acklam at
`|err| < 1.15·10⁻⁹`) and `drift` (the renderer's own Simpson rule at one
sub-interval per sixteenth) simultaneously.

**Sign probes are half-open** (AD-33.3a). Because curves are right-continuous, a cell's
right endpoint carries the NEXT cell's value across a discontinuity, so `bisectSignChange`
probes it at its **left limit**; the GL-10 nodes are untouched, being strictly interior
already. Latent in tempo and dynamics, whose curves are monotone within a span; decisive in
rubato, where it alone takes the >0.1 % failures from 2328 of 3906 to 280.

**Curve reading is right-continuous** (A-B1): the value at an instruction's date
is that instruction's value. Divergence from `TempoMap`'s strict-before reading
is measure zero and documented. For **atoms** it is not measure zero, so the rule
is stated where atoms are introduced and not only where curves are (R27):
**an atom is charged to the span it opens** (right-continuous), matching A-B1.
Three conventions coexist in the renderer itself — `TempoMap.getTempoDataAt` is
strictly-before, `DynamicsMap.getDynamicsDataAt` is at-or-before,
`renderTempoToMap` breaks on `key > endDate` — and a W2 implementer will meet
all three.

**Per-part resolution** (A-Q6, AD-3). Every dimension is evaluated per part after
global/part map resolution. A global-vs-part-local _encoding_ difference with
identical resolved curves is distance 0 plus a structural note — which is
correct: it is not performed. Parts are matched by `@number` (with `@name`
reported when it disagrees); **unmatched parts are compared against the neutral
curve** and reported as structural notes (R6), and the document-level rule is a
SUM over the union of parts. Documents that are global-only on both sides
evaluate once, not per part.

**Two shadowing rules, not one** (AD-16, R22). _Maps_ shadow wholesale: a
part-local map replaces the global one entirely, and an **empty** part-local
`<dynamicsMap/>` is non-null and shadows too (`Performance.resolvePartMaps:603-632`;
a part with no MPM counterpart inherits the global set entire; a part with no
`<dated>` is skipped). _Style defs_ do not: `GenericMap.getStyle:506-514` falls
back local → global **per style name**, so a part header declaring
`styleDef name="A"` hides the global `"A"` entirely, defs and all, with no
per-def merge, while leaving the global `"B"` visible. Resolution **must** go
through `styleScope` (`styleScope.findStyleDef:103-120`), never through a direct
header scan; `levels.ts:38-46` documents the trap verbatim.

**Span ends resolve per map type** (AD-14ii, R12; corrected AD-29). **Five**
maps scan forward for the next element of their _own_ local name (`TempoMap`,
`DynamicsMap`, `RubatoMap`, `MetricalAccentuationMap`, `MovementMap` — each
tests `getLocalName()`, e.g. `TempoMap.getEndDate:166-175`), and `<style>`
switches never terminate their spans. **Two** maps end a span on **any** next
entry, whatever it is: `ImprecisionMap` (gaps are real and carry no law at
all, §5.9) and `AsynchronyMap` (`this.elements[asynIndex + 1].getKey()` with
no local-name test — §5.7, verified against source). Rev 2 of this document
listed `AsynchronyMap` on the same-name side while §5.7 stated the any-entry
rule; the renderer settles it for §5.7, and the contradiction is journaled
(AD-29). A `<style>` between two `<asynchrony>` entries therefore ends the
first span **and opens a `⊥` span, not a neutral gap** (AD-33.1, correcting
AD-29's own amendment text). The missing name test does more than end the span:
`asynIndex` iterates over every entry including the `<style>` and reads
`parseFloat(getAttributeValue('milliseconds.offset', …))` off it, which is
`parseFloat('')` = `NaN`, so `Math.max(0, ms + NaN)` is `NaN` and every note in
that span **vanishes from the MIDI export** — bit for bit R24's condition,
reached through a foreign element. Priced as neutral it was out by a factor of
30 on the disputed span and emitted no note; priced as `⊥` it costs `δ_row`
per quarter and reports `renderer-error`. Observable on ordinary documents that
switch styles mid-piece.

**Weight.** `w(t) = 1` (score ticks) by default; `w` = MSM note density (from the
score, never from either performance — symmetric, hence metric-safe, AD-3) as an
option. The decomposition of §1.2 normalizes it; the headline does not (AD-18).

**Plausibility** (AD-23, C6). Every registry row with a `plausibleRange` is
checked once per document against its **resolved** value; a violation emits a
`plausibility` note `{ document, dimension, date, resolvedValue, range, hint }`
and **does not alter the distance** — no clamping, no exclusion, so R3 is
untouched. The initial [convention] bands: tempo `qbpm ∈ [10, 400]`,
dynamics/velocity `∈ [0, 127]`, pedal position `∈ [0, 1]`, asynchrony
`|offset| ≤ 1000 ms`; all overridable exactly like `jnd`. This channel exists
because of a measured failure on the campaign's own flagship file: of the 121
`.mpm` files in the `Daten` corpus, three write `beatLength` in **ticks** rather
than as a whole-note fraction, and two of them are `Hofmann (1927).mpm`
(`bpm='21' beatLength='2160'` at `ppq='720'`). Compared against a well-formed
roll this yields `|ln(181000) − ln(37)| ≈ 8.5` nepers ≈ **170 JND sustained
across the whole window** — a large, exact, confidently decomposed number whose
true finding is "these two files disagree about what `beatLength` means", and
which revision 1 had no channel to say.

**Comparability** (AD-23, C7). §1's precondition — the two documents encode the
same piece — is untestable and is not made an error; refusing to compare would
be worse. Instead the report ships the evidence:
`comparability { lastDateA, lastDateB, lengthRatio, ppqA, ppqB, partCountA,
partCountB, partNumbersMatched, instructionCountA, instructionCountB }`, plus a
`length-mismatch` note _worded as a question_ when `lengthRatio` falls outside a
documented `[0.8, 1.25]` band, and the same check against the score end when an
MSM is supplied. Without this, the pair-derived window silently absorbs a length
mismatch: a 30-bar piece against a 200-bar piece is compared against neutral for
85 % of the timeline (correctly, per R6) and reads as "very different
interpretations". At corpus level the same notes aggregate into `suspectPairs`
(§8), so a 121-file glob shows the user their folder is heterogeneous before
they read a dendrogram of it.

### 5.1 tempo

Curve: `g(t) = ln(qbpm(t))`, `qbpm = bpm · beatLength · 4`. Piecewise per
instruction span: constant, or the renderer's power transition
`bpm₀ + (bpm₁ − bpm₀)·u^e`, `e = ln 0.5 / ln(meanTempoAt)`
(`TempoMap.ts:137-158, 213-223`). Density `|g_A − g_B| / jnd_tempo`.

**Base and direction, pinned** (AD-26.1). The internal `T` stays the **natural**
logarithm — coherence with `expression/transforms.ts`'s closed forms is a design
invariant, and JND normalization makes the reported _distances_ base-free anyway
— so every reported log quantity is tagged `'nepers'` in §9's result shapes. The
literature's own primitive is log₂ (Desain & Honing 1993 endorse log explicitly
as "a first step towards the use of subjective magnitudes"; partitura and
Cancino-Chacón 2018 use base 2), so the docs give the conversion once and
plainly: **multiply a nepers figure by `1/ln 2 ≈ 1.4427` to read it as log₂**
(survey-lit L2). Direction is pinned in the type docs, because the field mixes
the two conventions freely: **MPM stores BPM, a _rate_, so a positive log
difference means A is FASTER**. A beat period is a duration, so in the
seconds-per-beat convention partitura uses, positive means _slower_; the two are
reciprocal and Cancino-Chacón et al. 2018 §4.3 names the resulting
incomparability outright (survey-lit L3). Stating it once here and in the
`DimensionComparison` doc comment is the whole fix.

**Trailing transitions are inert** (AD-8, R1). `TempoMap.getEndDate:166-175`
returns `Number.MAX_VALUE` when no later `<tempo>` exists, so
`u = (date − start)/(1.8e308 − start) ≈ 0` and the tempo stays pinned at `bpm₀`
for every date in any real window. **An instruction with no successor of its
map-relevant kind performs as a CONSTANT at its own `bpm`**; its
`@transition.to` and `@meanTempoAt` are inert and are reported as inert
differences when they differ, never as curve shape. The refinement grid must
**not** insert a synthetic transition end at the window end. This is not a
corner: `tests/integration/fixtures/all-maps-reference/all_maps.mpm` ends its
tempo map with `<tempo date="2880.0" bpm="120" transition.to="90" …/>`, and
revision 1 would have computed a ritardando 120→90 across the whole tail —
inventing the most audible gesture in the file, against a reference rendering
that shows no such thing.

**Skipped instructions re-time the following span** (AD-9i, R6). `getTempoDataOf`
returns `null` iff `@bpm` or `@beatLength` is absent (`TempoMap.ts:118-121`), but
`getEndDate` scans for the next element named `tempo` **regardless of whether it
parses**, so the skipped instruction still ends the previous span; the render
then `continue`s past it and the next valid instruction's inner loop times every
intervening note at the no-tempo default via
`computeDiffTiming(date, ppq, null)` — 100 quarter-bpm, as an absolute time from
zero. Executed, the performance goes **backwards**: with instructions at 0
(60 qbpm), 720 (`bpm=180`, no `beatLength`) and 1440 (60 qbpm), the note at tick
1080 sounds 200 ms _before_ the note at tick 720. So: **a skipped `<tempo>` ends
the preceding span, and `[skipDate, nextValidDate)` performs at 100 qbpm**; the
same constant governs `[0, firstValidTempoDate)` (AD-9ii, R11). Both are in the
curve and in the grid. Revision 1's "a skipped instruction contributes nothing"
and §6.2's "inserting one costs exactly 0 and is `free`" were both false; §6.2's
sequential pricing now gets this right automatically (AD-5).

The renderer's _absolute-time_ quirk — the non-monotone millisecond dates that
this mechanism produces — is reproduced **only** in the `cumulativeDrift`
secondary, never in the tempo curve.

**Degenerate table** (AD-9iii, R10). Revision 1 said "collapses to constant",
which is wrong on half the cases by a factor of 2 in the obvious example:

| case                                                          | performed                                                                               |
| ------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `@transition.to` equal to `@bpm`                              | constant at **`bpm`**                                                                   |
| `meanTempoAt ≤ 0`                                             | constant at **`transition.to`** (`TempoMap.ts:144-151` reassigns `bpm := transitionTo`) |
| `meanTempoAt ≥ 1`                                             | constant at **`bpm`**                                                                   |
| `@meanTempoAt` absent, `@transition.to` present and differing | **linear ramp**, `meanTempoAt = 0.5`, `e = 1.0` (`TempoMap.ts:155-158`)                 |

Each is pinned by a fixture (§10). A `<tempo>` carrying no `@transition.to` at
all is simply a constant span; a `<tempo>` missing `@bpm` or `@beatLength` is a
_skip_, not a collapse.

**`cumulativeDrift`** is a clearly-labelled secondary output computed with the
renderer's own Simpson integration (`computeMillisecondsForTempoTransition:392-409`)
on a copied map — the millisecond map is NOT the tempo metric, being a
cumulative-drift artifact. Its shape is `{ secondsA, secondsB, difference,
ratio, maxAbsMs }` (AD-23, C13): the literature's canonical statistic is a
**ratio** — Flury's finding, relayed by Hagmann, that Welte transfers run ~12 %
longer than disc recordings of the same interpretation — and revision 1 reported
only the difference, from which the ratio cannot be formed. Both totals come
from the same integration already being run. Under unknown roll speed (§7.4) the
ratio is the meaningful figure and the absolute totals are not.

### 5.2 rubato

Curve: displacement `δ(t) = warp(t) − t` in quarters, from the transliterated
cyclic warp (`RubatoMap.ts:166-173`): within each frame of length `frameLength`
from the instruction's date,
`δ = frameLength·((τ/frameLength)^intensity·(earlyEnd − lateStart) + lateStart) − τ`,
`τ = (t − t₀) mod frameLength`. Neutral: `δ ≡ 0`. Density
`|δ_A − δ_B| / jnd_rubato` (jnd in quarters). `frameLength` is ppqSensitive.

**`@loop` gates the cycle** (AD-10, R3). `RubatoData.loop` defaults to **false**
(`RubatoData.ts:37`) and `renderRubatoToMap` breaks out of the span at the first
frame boundary when it is off (`RubatoMap.ts:199-203`). The `mod` in the formula
above _is_ the repetition `@loop` controls. So: **when `@loop` is off, the warp
applies on `[t₀, t₀ + frameLength)` and `δ ≡ 0` on the remainder of the span.**
Executed on a 1440-tick span with `frameLength = 360`, `intensity = 2`: loop
absent warps only the first frame, `loop="true"` warps all four. The repo's own
fixtures carry `<rubato date="0.0" frameLength="720.0" lateStart="0.25"
earlyEnd="0.75"/>` with no `@loop`, which revision 1 would have warped cyclically
across its whole span.

**Frame-boundary cap** (AD-10, R25; value ratified AD-31.2). Boundaries per
rubato instruction = 1 when `@loop` is off;
`min(⌈span / frameLength⌉, RUBATO_FRAME_BOUNDARY_CAP)` when on, with
`RUBATO_FRAME_BOUNDARY_CAP = 1024` [convention] — it clears every musically
plausible frame (a 200-quarter piece on a sixteenth-note frame needs 800)
while cutting the pathological `frameLength="1"` case by three orders — and
a `grid-truncated` note when it bites. When it bites, the warp is still
evaluated exactly; only the grid stops subdividing, so the cost is quadrature
resolution, never a wrong curve. Without the cap `frameLength="1"` — legal —
gives 1.7 M boundaries per instruction per part, and R10's budget is
expressed in instructions, which does not bound this.

**Skipped instructions leave a neutral gap with a breakpoint** (AD-16, R23).
`getRubatoDataOf` returns `null` when neither the element nor a referenced
`rubatoDef` supplies `frameLength` ("without a frame there is nothing to warp,
so that case is a hard reject rather than a default"), but `getEndDate` scans for
the next `<rubato>` regardless of validity — so the skipped element **still ends
the preceding span**, leaving an unwarped gap. Revision 1's neutral covered the
gap's value but never said the gap exists, and its grid placed no breakpoint
there.

**Defaults and clamps** (AD-16, R23). Absent `@intensity` / `@lateStart` /
`@earlyEnd` with no def fall back to `RubatoData`'s initializers **1.0 / 0.0 /
1.0** — the identity warp. The boundary clamps at `RubatoMap.ts:136-141`
(`lateStart` floored at 0, `earlyEnd` capped at 1, an inverted or empty window
reset to the full frame `0..1`) are applied **before** the curve is evaluated, or
`earlyEnd < lateStart` documents compare as inverted warps the renderer never
performs. The edit path prices `(lateStart, earlyEnd)` as L1 on the endpoints
(A-Q10), NOT the joint-trim parametrization — two windows with equal total trim
but different placement are different performances — but the _density_ uses the
clamped pair.

**The neutral warp is special-cased** (AD-21, M18). When
`intensity === 1 && lateStart === 0 && earlyEnd === 1`, the evaluator returns
`δ ≡ 0` without arithmetic. `Math.pow(x,1) === x` holds, but
`frameLength·(τ/frameLength) − τ` does not round-trip for all integer pairs —
`(22, 15)` gives `−1.78·10⁻¹⁵`, `(25, 7)` gives `+8.88·10⁻¹⁶` — so P-C8's
"exactly 0" would fail on a fixture that happens to pick such a pair. The same
guard applies wherever an algebraically-neutral parametrization is promised
"exactly 0".

### 5.3 dynamics

Curve per part: `g(t) = ln(volume(t))`, volume from constant instructions and
cubic-Bézier transitions. The **defined** curve is the ideal Bézier (§5.0,
AD-17); `bezier.ts`'s `tForDate` bisection is the renderer's own 1-tick-tolerance
approximation of it and is used in the §6.3 replay only. Levels resolve via
`styleScope`, with unresolvable ones taking the renderer's velocity 100.0 (R8).
Neutral: velocity 100 before the first instruction and for a wholly absent map
(AD-9ii, `DynamicsMap.ts:251-253`). Density `|g_A − g_B| / jnd_dynamics`.

**Trailing transitions are inert** here too (AD-8, R1):
`DynamicsMap.getEndDate:187-193` has the same `MAX_VALUE` shape, and executed, a
trailing `volume=40 transition.to=100` performs a flat 40. `all_maps.mpm` ends
its dynamics map with `<dynamics date="2880.0" volume="80" transition.to="110" …/>`
and the reference rendering shows velocities scattered around 80, not a
crescendo to 110.

**A `<dynamics>` with no `@volume` is a SKIP** (AD-33.4). `getDynamicsDataOf`
rejects it (`DynamicsMap.ts:162-163`), but `getEndDate:187-193` scans for the
next element _named_ `dynamics` regardless of whether it parses, so the
volume-less element still ends the previous span; `renderDynamicsToMap` then
`continue`s past it and the next valid instruction's inner loop pins every note
in the gap to `velocity="100.0"` (`DynamicsMap.ts:251-253`). Same shape as
tempo's AD-9i, same constant, a different mechanism: **`[skipDate,
nextValidDate)` performs velocity 100**, and `[0, firstValidDate)` likewise.
Reading it as "the previous span simply continues" is wrong by
`|ln 60 − ln 100| = 0.511` nepers — 5.36 JND — held across the whole gap. An
unresolvable _level_ is still not a skip; R8 makes it the renderer's 100.0.

**Defaults and clamps** (AD-16, R17). `@curvature` and `@protraction` both
default to **0.0** for `<dynamics>` (`DynamicsData.computeInnerControlPointsXPositions`),
are read only in the transition branch (`DynamicsMap.ts:170-181`), and are
clamped to `[0,1]` and `[−1,1]` respectively on the way in
(`clampCurvature` / `clampProtraction`). `<movement>` differs — 0.4 — so the
"shared Bézier machinery" must not share a default (§5.8, AD-13).

**`@subNoteDynamics` switches the rendering mechanism** (AD-16, R17). On a
sub-note span every note is pinned to `velocity="100.0"` and the shape is emitted
as a channel-volume (CC 7) curve; on an ordinary span the shape is carried by
per-note velocity and CC 7 is pinned to 100. Two documents identical but for this
flag are distance 0 under the date-axis curve while driving two different MIDI
mechanisms with different time resolution and timbral behaviour. It is therefore
a **structural finding with a stated rationale**, not a generic boolean; it is
**inert on a map's last instruction** (the same `size()-1` guard as R1); and a
leading sub-note span leaves notes before `startDate` with no `velocity`
attribute at all, which is noted rather than modelled.

Sub-note gradient attributes belong to `ornamentation`, not here.

### 5.4 accentuation

Resolved object: the per-beat velocity contribution
`scale · patternDef.getAccentuationAt(beat)`, where

    stickToMeasures (default TRUE):  beat = 1 + ((t − tsDate) mod measureTicks) / ticksPerBeat
    otherwise:                       beat = 1 + ((t − tsDate) mod patternLengthTicks) / ticksPerBeat

**Phase anchors at the TIME SIGNATURE, never at the instruction** (AD-12, R8).
Both branches of `MetricalAccentuationMap.ts:162-165` subtract `tsDate`, the date
of the time-signature entry in force — never `md.startDate`. Executed with no
`timeSignatureMap` at all, moving the instruction from date 0 to date 360 changes
**nothing**: the velocities are identical. Two documents whose patterns agree but
whose instructions sit at different dates perform identically, and revision 1's
per-instruction cycle model would have given them different phases and a nonzero
`d_accentuation`.

**The MSM-less approximation is DROPPED** (AD-12). Revision 1 spread a mean
per-beat `|Δ|` uniformly over the governed span and flagged `beatsExact: false`,
for a case the renderer answers **exactly**: with no time-signature information
the initialisers give `tsDate = 0`, 4/4, `ticksPerBeat = ppq`,
`measureTicks = 4·ppq`, and `patternLengthTicks = length·4·ppq/denominator`
(`MetricalAccentuationMap.ts:124-134`), so the contribution is an exact
piecewise-linear function of score time. Without an MSM, evaluate that and report
`timeSignatureSource: 'renderer-default'`. With an MSM, walk the real
`timeSignatureMap` with the same forward-only rule (`:140-155`), recomputing
`ticksPerBeat`, measure length and `patternLengthTicks` at each change, and
report `timeSignatureSource: 'msm'`.

**Honour `@stickToMeasures` (default true) and `@loop` (default false)** (AD-12,
AD-10) — the latter with the same one-frame-then-identity semantics as §5.2,
from the identical `break` shape at `MetricalAccentuationMap.ts:157-161`.

**Pattern interpolation is `AccentuationPatternDef.getAccentuationAt` verbatim**
(AD-12), including its deliberate asymmetry: for `i < length−1` a segment ends at
the next accentuation's beat, while the **last** accentuation's segment runs to
`length + 1.0`; the value is 0 before the first accentuation; `transition.to`
governs at and after `length + 1.0`; and an accentuation's own beat takes its
`value` exactly. `@length` defaults to 4.0 (and is written onto the element at
parse time, AD-15).

**Unresolvable patterns are `⊥`, not merely unresolvable** (AD-1, R21).
`getMetricalAccentuationDataOf` returns a non-null datum with
`accentuationPatternDef = null` when the style resolves but the def name does
not, and the render then dereferences it unguarded — executed,
`TypeError: Cannot read properties of null (reading 'getLength')`: **the whole
performance render throws**. There is no performed function to compare, so the
span reads `⊥` on that side and is reported `renderer-error`. Separately, an
`accentuationPattern` before the map's first `<style>` switch is silently skipped
even with a perfectly good `name.ref` (`:89`) — a renderer skip, reported as one.
This is the one place revision 1's exclusion instinct was right, and the design
must say _which_ unresolvables are which: tempo and dynamics levels have a
performed value (R8), accentuation patterns do not.

Pattern def internals (`accentuation@beat` / `@value` / `@transition.from` /
`@transition.to`) are registry rows (gain, velocity units).

### 5.5 articulation

Multi-attribute dimension. Rows and spaces: relative factors in log-around-1
(nepers), `absoluteDurationChange` (quarters, ppqSensitive),
`absoluteDurationChangeMs` / `absoluteDelayMs` (ms), `absoluteDelay` (quarters),
`absoluteVelocityChange` (velocity).

**Atoms shadow the styled default; they do not add to it** (AD-11ii, R5).
`ArticulationMap.renderArticulationToMap_noMillisecondModifiers:262-284`
`continue`s after applying a note's explicit articulations, and the class doc says
so: _"a note with explicit articulations gets those and only those — the default
is deliberately not also applied"_. Executed with `defaultArticulation="stacc"`
(×0.5) and an explicit `ten` (×1.2) at date 360, durations are 50 / **120** / 50 —
not 60. Revision 1's model was `profile = step(t) ⊕ atoms`; the renderer's is
`profile(t) = atoms(t) where atoms exist, else step(t)`, so revision 1
double-charged at exactly the dates the composer bothered to mark. The default's
step function is built from the resolved style-switch list and includes its two
non-obvious mechanics: an unresolvable style switch leaves the _previous_ default
in force (`:231-236`), and a switch carrying **no** `@defaultArticulation` pushes
a `null` that **cancels** the default from that date (`:239-243`).

**Exactly one duration lever is live per inline atom** (AD-11i, R4).
`ArticulationData.articulateNote` reads `duration` once up front and every branch
computes from that original value, overwriting the previous branch's write —
they do not compose, and `absoluteDurationMs` short-circuits the tick branch
entirely. The precedence is the expression registry's own
`INLINE_DURATION_PRECEDENCE`: **`absoluteDurationChange > relativeDuration >
absoluteDuration`, and none of them when `absoluteDurationMs` is present**. On an
`<articulationDef>` they DO compose, so the rule is keyed on the **element**,
never on the attribute name. Executed: `relativeDuration="0.5"` alongside
`absoluteDurationChange="10"` on a 90-tick note performs 100, i.e. the
`relativeDuration` is entirely inert — and revision 1 charged 0.59 nepers for a
difference in a factor the renderer never applies. The comparison registry
therefore carries element-keyed **conditional liveness** (R9), and the atom's
effective modifier is resolved before pricing, not summed over rows.

**`absoluteDurationChange` is priced on its raw value** (AD-11iii, R15), and
documented as a **document-level** rather than performed quantity, because the
renderer's map is nonlinear and note-dependent: it applies only when
`duration > 0`, then halves the change until the result is positive
(`durNew = duration + change / 2^k`). Executed, `−200` on a 90-tick note performs
40, not −110 and not 0. An MSM refinement hook is noted (§9's estimate
three-state) since `k` depends on the note; the negative branch cannot be refined
without one at all.

**Two kinds of atom** (AD-7, R16). _Date-targeted_: an atom at `@date` applying
to all notes there (`getAllElementsAt`, exact equality), charged to the span it
opens (§5.0). _`noteid`-targeted_: the attribute is `noteid` (not `noteid.ref`),
its value has its **first character stripped unconditionally** (it assumes
`#id`), the articulation lands on the _note_ wherever the note is — a date
mismatch is a warning and it is applied anyway — and an id resolving to nothing
is **dropped entirely**. So: without an MSM, compare by id and report
`datePositionKnown: false`; with an MSM, place the atom at the referenced note's
date; unresolvable ids are dropped, as the renderer drops them.

Matched atoms contribute `Σ_live-rows d_row(x_A, x_B)` under §4's capped metric;
unmatched atoms their deviation from neutral. Matching is by the alignment DP of
§5.6 with opportunistic id-pinning — never by an exact-date pre-pass (AD-7).

**Replacement attributes** `absoluteDuration`, `absoluteDurationMs` and
`absoluteVelocity` have no neutral: present-vs-present compares in native units,
and **present-vs-absent reads `⊥`** (AD-2) rather than being a structural
finding, since a structural finding contributes 0 and gives `A=2, B=absent,
C=100` the zero-set violation `d(A,B) = d(B,C) = 0 < d(A,C)` (M1c). With an MSM
the present-vs-absent case refines to a real magnitude against the note's own
duration (R7). `detuneCents` / `detuneHz` are **not** in this list: they default
to 0.0 and are inert (§3, AD-15, R14).

### 5.6 ornamentation

Discrete events. **The alignment DP is the semantic distance** (AD-7, M5), and
its objective is one functional including the date term:

    minimize  Σ_matched ( Σ_rows d_row(x_A, x_B) + λ_date·|Δdate| )
            + Σ_unmatched  deviation-from-neutral

over monotone alignments. Revision 1 pre-matched events sharing an exact date and
then ran the DP; that pin is not closed under composition of alignments and
breaks the triangle inequality for any `λ_date > 0` (M5's three-document
counterexample survives every value of the constant). It is deleted: an
exact-date match is already free of date cost, so the DP selects it whenever it
is optimal, and where it is not optimal the pin was wrong. Revision 1 also
defined the matched-event contribution _without_ a date term while §6.2 priced
event ops _with_ one — a non-minimal functional evaluated at the argmin of a
different one, which has no metric argument at all, and which priced a matched
ornament displaced by half a bar at zero. `λ_date` is now stated here, in §5.6,
as part of the semantic definition.

**Opportunistic id-pinning stays** (AD-7): `xml:id` / `noteid` equality is an
identity match and is transitive whenever all three documents carry ids, so it
composes and is metric-safe — unlike date pinning, which is transitive only when
all three documents happen to share the date.

**Matched events at different dates spread their mass** (AD-7, M17). When
`a@d_A` matches `b@d_B` with `d_A ≠ d_B`, the pair's mass is spread **uniformly
over `[min(d_A,d_B), max(d_A,d_B)]`**. Placing it at `d_A` (or `d_B`) would put
the atom in different segments under `compare(a,b)` and `compare(b,a)`, so the
attribution table's columns would differ between the two directions and P-C2's
"bit-identical modulo the a/b swap" would be false — the swap is not a field
swap, it is a different table. Spreading is symmetric, keeps the total, keeps the
table closing, and makes the `λ_date` term visible in the timeline rather than
teleporting it. `κ` (§7.1) carries units of **quarters**, which is what makes an
atom's contribution commensurable with JND·quarters of sustained deviation.

Matched events compare their resolved def content row-wise:
`temporalSpread@frame.start` / `@frameLength` as the geometric pair,
`@frame.offset` and `@time.unit` as the two rows revision 1 omitted (AD-15,
R18); `@intensity` log-around-1; `dynamicsGradient@transition.from` /
`@transition.to` velocity gain; `@repetitions` and `@note.order` (AD-15, R28).

**`ornament@scale` is a linear velocity-unit row with neutral 0.0** (AD-15,
R19) — not a log gain. `DEFAULT_ORNAMENT_SCALE = 0.0` and
`OrnamentData.scale = 0.0` are the port's documented, deliberate choice: _"an
`<ornament>` without a `scale` is specified to produce no dynamics effect at all,
which reads as a bug and is not one."_ A gain space maps neutral to 1.0 and sends
0.0 to −∞, so revision 1's classification was wrong twice. R6's absence-is-neutral
resolves to **0.0** here. Fixture caution: the v2 writer omits `scale` when it is
1.0 while every reader defaults a missing `scale` to 0.0, so a v2 round trip
changes the performed value — any fixture derived by round-tripping is exposed.

**Three unit cases, not two** (AD-16, R18). `TemporalValue`'s domains are
`ticks | milliseconds | relative`, and `%` ⇒ `relative` has **no** absolute
length without the MSM note it ornaments. So: `%`-vs-`%` compares **in percent**
(a genuine common unit, `unit: 'percent'`); `%`-vs-absolute is a structural
finding without an MSM, and is resolved against the principal note's duration
with one.

v3 note-generating ornaments are compared by the same attribute rows; the
_generated notes_ are a render artifact with per-render random ids and are never
compared (R5b lesson from the expression campaign; verified — note generation
lives on the render path only, so a pure reader never sees them, R28).

### 5.7 asynchrony

Per-part step curve of `milliseconds.offset`; density `|Δ| / jnd_asynchrony`
(ms). Exact integration.

**A missing `@milliseconds.offset` poisons the span** (AD-1, R24).
`renderAsynchronyToMap` reads the offset with `parseFloat(getAttributeValue(…))`
and `getAttributeValue` returns `''` for a missing attribute, so the offset is
`NaN`; executed, every note in the span gets `milliseconds.date="NaN"` and
vanishes from the MIDI export. The map also takes the next dated child with **no
local-name test**, so any non-`<asynchrony>` entry ends the span **and opens a `⊥` span** (AD-33.1). R6's
absence-is-neutral covers an absent _map_, not a present instruction with an
absent offset, and treating it as 0 would compute a performance the renderer does
not produce: the span reads **`⊥`** and is reported `renderer-error` (AD-2).

Two further mechanics (R24): the shifted start is floored at 0 and the shifted
end at `startDateMs + 1` ("zero-length notes vanish from the MIDI output"), so
the offset is not a pure translation near the start of the piece or on very short
notes.

**Non-goals** (AD-23, C15), stated because the lit survey raises exactly the
questions this dimension cannot answer. What it compares is precisely the encoded
**per-part offset over time**. It therefore cannot answer per-note melody-lead
distributions (Goebl's literature) or any register-partitioned hypothesis —
including Hagmann's "künstliches Arpeggio" question, whether a roll's asynchrony
is intentional or forced by the two-zone dynamic split — because MPM carries
neither per-note data nor pitch here. Both would need rendered note events, i.e.
the MSM plus a render. This is a scope boundary, recorded as an enumerated
non-goal rather than left to be discovered.

### 5.8 pedal (movement)

Position curve on [0,1] via the shared Bézier machinery. Space: **gain on [0,1]**
(`unit: 'ratio'`) — NOT logit: 0 and 1 are the most common authored values and
logit sends them to ±∞ for a quantity whose musical meaning (pedal depth
fraction) is already linear. `@curvature` / `@protraction` shape the curve and
are therefore not separate rows at the semantic level (the curve contains them);
they remain rows for the edit path's substitution pricing, in the spaces
expression assigns (boundary-power-low / logit(−1,1)), finite under §4's cap.

**Spans are flat, not per-controller** (AD-13, R9). `MovementMap.getEndDate:153-159`
scans for the next element named `movement` with **no `@controller` test**, so a
`soft` entry terminates a `sustain` span. The curve is therefore evaluated on the
map's **flat** span structure — the next `<movement>` of _any_ controller ends a
span — with each span tagged by its own `@controller`. Revision 1's independent
per-controller curves compute a sustain gesture the renderer never performs
whenever the two pedals interleave in one map, which is the natural encoding.

**The last movement contributes no span at all**, and a `movementMap` with a
single `<movement>` renders **zero** controller events
(`renderMovementToMap:174-183` renders `movementIndex < size() − 1` only) — the
same class of error as AD-8's trailing transitions, but total rather than
partial.

**The asymmetry with §5.1/§5.3 is the renderer's own, and is not to be
"fixed"** (AD-25.9). A trailing `<tempo>` or `<dynamics>` performs as a
**constant at its own value**, because `TempoMap.getEndDate:166-175` and
`DynamicsMap.getEndDate:187-193` return `Number.MAX_VALUE` and the transition is
therefore evaluated at `u ≈ 0` for every real date — the span exists and is
pinned at the start value. A trailing `<movement>` performs **nothing at all**,
because `renderMovementToMap:174-183` guards the render loop with
`movementIndex < size() − 1` and never enters it — the span does not exist. Two
different mechanisms, two different outcomes; a future editor who reads the two
sections side by side will take one for a typo of the other, and both citations
are here so that reading is closed off.

Three further reading rules (AD-13): `@curvature` defaults to **0.4**
(`MovementData.ts:29`), _not_ dynamics' 0.0 — the shared Bézier machinery must
not share a default; a `<movement>` with no `@position` inherits the previous
movement's `@transition.to`, and the inheritance loop is `j > 0` so entry 0 is
never examined and the inherited value is 0 (PARITY-noted as deliberate); a
movement whose predecessor carries no `@transition.to` is **skipped entirely**;
and movements at negative dates are skipped.

Controllers are matched by name/number for the structural channel; a mismatch is
a structural finding.

### 5.9 imprecision (timing / dynamics / duration)

Per domain, the object over time is a probability law, piecewise constant over
spans. **Spans end at the next entry of ANY kind** (AD-14ii, R12) — imprecision
is the one map with that rule (`ImprecisionMap.getDistributionDataOf:206-216`:
"A distribution is therefore ended by any element in the map, not only by another
distribution") — and **every gap is a δ₀ span**, a real interval with no
imprecision at all. Executed: with a distribution at 0, a `<style>` at 360 and
another distribution at 1080, the notes at 360 and 720 are unperturbed.

**Degenerate table** (AD-14i, R7). There is no default for `limit.*`, `clip.*`,
`deviation.standard` or `mode` anywhere in the read path — absent attributes stay
`null` and flow into the provider — so three families degrade three different
ways, and revision 1 computed ~8.3 ms of density per quarter between two
triangular distributions that the renderer performs as _no imprecision
whatsoever_:

| family                                         | missing attribute             | law actually performed                                                                                    |
| ---------------------------------------------- | ----------------------------- | --------------------------------------------------------------------------------------------------------- |
| `distribution.uniform`                         | `limit.lower` / `limit.upper` | **δ₀** (the draw is `0·(null−null)+null` = 0)                                                             |
| `distribution.correlated.brownianNoise`        | `limit.*`                     | **δ₀**                                                                                                    |
| `distribution.triangular`                      | `clip.lower` / `clip.upper`   | **δ₀** (the clip swallows every draw)                                                                     |
| `distribution.correlated.compensatingTriangle` | `clip.*`                      | **δ₀**                                                                                                    |
| `distribution.gaussian`                        | `limit.*`                     | **untruncated `N(0, σ)`** (rejection never accepts; the 10 000-attempt escape hatch returns a plain draw) |
| any                                            | `deviation.standard`          | **δ₀**                                                                                                    |

Each collapse is a _law_, so the W₁/W₂ machinery handles it: this is a reading
rule, not new mathematics.

**The Gaussian is modelled as the mixture it is** (AD-14iv, M13):

    L = (1 − q^N)·TruncNormal(0, σ; lo, hi) + q^N·N(0, σ),   N = 10000,
    q = P(outside limits)

Its CDF is a convex combination of two available CDFs, so W₁ costs nothing extra.
The mixture is not pedantry: at `limit.lower == limit.upper` — a natural way to
author "no imprecision here" — `q = 1` exactly, the renderer always emits an
unconditioned draw, the truncated law's normalizer `Φ(hi/σ) − Φ(lo/σ)` is 0 and
the quantile formula is `0/0`. Revision 1 would have reported distance 0 between
a document performing full Gaussian noise and one performing none.

**Headline density** (AD-14v, M14). The density at `t` is `W₁` between the two
laws prevailing at `t`, in JND per quarter; `d_k` is its integral, so a
difference contributes **in proportion to how long it is performed**.
survey-algo's per-span normalization ("W₂ divided over the span they govern") is
**superseded**: A's and B's spans differ, so "the span" is pair-dependent, the
result is not the integral of a fixed density, and it makes a difference lasting
one bar equal to the same difference lasting the whole piece. A fixture pins the
span-length proportionality (§10).

Accuracy per family, honestly (M13a): exact, from closed-form piecewise-polynomial
CDFs, for uniform / triangular / clipped / list — the atoms at clip values break
continuity but not polynomiality, and the crossings are roots of a quadratic;
**quadrature at the special-function ε** for any span involving a Gaussian, since
`Φ` is not a polynomial and locating the sign changes of `F_A − F_B` needs
transcendental root-finding. §5.0's per-family `epsilon` record reports this
rather than claiming 1e−12 across the board.

**Interpretive table**: W₂'s location / spread / shape three-term decomposition
(closed forms for clean family pairs incl. the ρ-table constants `7√2/10` and
`√(3/π)`, both re-derived independently by the math lens and confirmed to 12
digits; quantile quadrature with breakpoint-aware nodes for truncated / clipped /
list cases; Φ / Φ⁻¹ via Cody/Acklam rational approximations, hard-coded with
re-derivation tests).

**Correlated families** (`brownianNoise`, `compensatingTriangle`): marginal
W₁/W₂ PLUS `stepWidth.max` / `degreeOfCorrelation` as gain rows in a separate
`processParameters` component, with the explicit statement that the marginal does
not characterize the process (A-B3).

**`milliseconds.timingBasis` is never a reason to exclude** (AD-14iii, R13).
Revision 1 excluded the span on a mismatch; but `timingBasis` enters only as
`index = msDate / basis` handed to the provider, and for `uniform`, `gaussian`,
`triangular` and `list` the draws are i.i.d. along that index — so the basis
changes _which_ pseudorandom value a note gets (a per-render artifact this module
refuses to model) and leaves the **marginal law identical**. So: i.i.d. families
compare marginals and report the basis difference as an **inert** note;
correlated families, where the basis genuinely sets the step rate per unit time,
fold it into `processParameters` as a numeric row. No exclusion anywhere. Note
also that an absent `timingBasis` is _derived_ — from `upper − lower` (uniform /
gaussian / brownian), `upperClip − lowerClip` (both triangles), or the list's
range — **only in the timing domain**, else 100.0, and 100.0 also when the
derivation is ≤ 0; so "absent on one side" is usually not a mismatch at all.

**This section compares the DECLARED law** (AD-14vi, R26). Inside a chord the
renderer keeps one note of each simultaneity on its drawn offset and re-rolls the
others through a triangular `shake` on `[offset/2, offset]`, so the marginal law
actually performed by a chord member is a mixture depending on the MSM's
simultaneity structure. That is a render-path artifact outside a pure reader's
object; §1's "the function the renderer would perform" is qualified here, in one
sentence, rather than quietly violated.

Tuning domain: inert (R9b) until the renderer reads it.

---

## 6. The edit path (side channel)

### 6.1 Object and guarantee

Per (part, map type): both instruction sequences date-ordered by the `datedView`
rules; a DP alignment produces a typed script of ops

    { op: 'insert' | 'delete' | 'substitute'        // W3
        | 'fragment' | 'consolidate',               // W3+ (A-Q5)
      map, part, site: ComparisonSiteRef,
      dateA: number | null, dateB: number | null,
      measureA / measureB: MeasurePosition | null,  // C3, MSM only
      attributes: readonly { key, name, valueA, valueB, deltaJnd }[],
      cost: number,                                 // JND·quarters
      free: boolean,                                // zero SEQUENTIAL cost
      applicationIndex: number,                     // position in date order
      costRank: number }                            // position in cost order

**The array is delivered in application (date) order, and every op carries both
orders** (AD-23, C5). U2 asks for an edit _path_, and a path is ordered by where
you walk it: a reader following along in the score walks it in score order, while
revision 1's single cost-descending sort scattered bar 3, bar 47, bar 12, bar 9
down the page. Since §6.2 now prices the script _as applied in date order_
(AD-5), date order is also the order in which the numbers mean something. U3's
"what matters most" is served by `costRank` on each op and by `topByCost`,
indices into the date-ordered array in cost-descending order. Both views cost one
integer per op.

Ops carry concrete values, so the script is machine-applicable in principle; an
`applyEditScript` writer is deliberately NOT shipped until a consumer asks
(YAGNI; mpm-desk is the expected asker; journaled as future work). That the
script is a _reading_ artifact rather than an executable one is what makes its
legibility the product rather than a nicety.

`site` is a declared `ComparisonSiteRef` (A18), not the "SiteRef-like locator" of
revision 1 — "_X_-like" is not a specification.

### 6.2 Pricing is sequential

    scriptCost = Σ_i ‖Φ(M_i) − Φ(M_{i−1})‖₁     over the script applied in
                                                 date order, M_0 = A, M_n = B

where `Φ` is the dimension's density representation and `‖·‖₁` the same weighted
L¹ integral the semantic level uses (AD-5, M3). This telescopes correctly, so

- `scriptCost ≥ d_curve` is a **theorem** (L¹ triangle inequality), and
- `reworking = scriptCost − d_curve ≥ 0` is a theorem too.

Revision 1 priced each op against the **original** A-context and called that an
upper bound on the shortest-path cost. It is not; it can strictly _under_-estimate,
because an op that is a no-op in A's context does real work once earlier ops have
been applied. The math lens's counterexample is minimal and the DP _prefers_ it:
`A = {I@0 bpm=60, J@5 bpm=60}` (a legal no-op restatement — exactly the case A-B2
elevates to a principle) against `B = {I@0 bpm=120}`. Substituting `I` in A's
context changes only `[0,5)`, priced `5·ln2`; deleting `J` in A's context changes
nothing, priced 0 and marked `free`. Total `5·ln2 = d_curve / 2`, so R5's
inequality fails by a factor of two and `reworking` is negative. Sequentially the
same script costs `5·ln2 + 5·ln2 = d_curve`, `reworking = 0`, which is also the
musically right answer. The state the DP needs (the prevailing value at the op's
date) is determined by the DP cell, so this stays inside the `O(nm·q)` budget.

Consequences, all tested:

- **`free` means zero _sequential_ cost** — not zero cost against A. A-B2's
  guarantee ("a no-op encoding difference costs 0 by pricing, not by
  special-casing") survives with the correct referent.
- **Inserting a renderer-skipped tempo instruction is NOT free** (AD-5, AD-9):
  it re-times the orphaned span at 100 qbpm, and the sequential price charges the
  area between the previous tempo and 100 qbpm over that span. Revision 1
  asserted the opposite and its `free` test would have failed.
- Consolidating five steps into one transition costs the area between staircase
  and ramp.
- Event ops are priced by the §5.6 functional, date term included — one
  functional for the semantic level and the script, which is what "consistent by
  construction" was supposed to mean.

### 6.3 Verification by replay

After traceback the engine replays the script against A's curve representation
and reports `replayedDelta` = **the sequential total** actually achieved (AD-5).
Revision 1 called it "achieved distance to B", which for a complete script is
_identically_ `d_curve` — a recomputation, not a third quantity, so the reported
"triple" advertised two numbers as three. The triple is now genuinely three
numbers: `(d_k` — the lower bound; `scriptCost` — the DP's estimate;
`replayedDelta` — the achieved sequential total`)`, all three exact up to the
per-family quadrature ε. The replay is the one place `tForDate`'s 1-tick
staircase is used rather than the ideal Bézier (§5.0, AD-17), because the replay
is a statement about the renderer's own arithmetic.

### 6.4 Determinism and mirroring

Traceback precedence `substitute > delete > insert`, then lowest source index.
That precedence is deterministic but **not transposition-covariant**: transposing
the inputs maps "delete `a_i`" to "insert `a_i`", so at a tied cell the `A→B` run
takes its delete branch and the `B→A` run takes _its_ delete branch, which is the
mirror of the first run's **insert** branch — and survey-algo §2.H is explicit
that equal-cost `insert-then-delete` vs `delete-then-insert` ties are structural,
not accidental (M16). So the script is **computed once in a canonical
orientation and INVERTED for the other direction** (swap insert↔delete,
`dateA`↔`dateB`, `valueA`↔`valueB`), which makes mirroring true by construction
while the precedence rule keeps its determinism role (AD-21).

**The canonical orientation is content-derived** (AD-25.4), not label-derived:
compare the two sides' **canonical serializations** — the `canonicalMpm` bytes of
each selected performance's document, then the performance selector as a string —
in lexicographic (code-unit) order, and compute the script in that orientation.
Equal bytes mean identical documents, so the orientation is irrelevant. This is
deterministic and needs no labels, which matters because `compareMpm(a, b)` and
`compareMpm(b, a)` present the _same_ role names in both directions: a rule keyed
on the roles `'a'` and `'b'` would not distinguish the two calls at all, and the
pairwise entry point takes no caller labels to key on instead.

Ties in the delivered order are broken by the total order of §9
(`cost desc, part, map, dateA ?? dateB asc, site`), and `−0` is normalized to
`+0` before serialization (AD-21, A20).

### 6.5 What the script is not

`boundary_prf` is derivable from it and will not equal mpmify's numbers (AD-23,
C12). With A = inferred and B = truth, substitutes are matched boundaries,
deletes spurious inferred instructions, inserts missed truth instructions, so
`P = S/(S+D)`, `R = S/(S+I)`, and `|dateA − dateB| ≤ tol` is a post-filter. But
mpmify's matcher is greedy-nearest with an explicit tolerance while this one is a
cost-minimizing DP that may prefer a large-date-shift substitution over an
insert+delete pair on semantic grounds, so the figures are comparable in trend
and **not equal**. P/R/F1 therefore stay out of the report — survey-code §6.4 is
right that a symmetric metric must not inherit `boundary_prf`'s precision/recall
asymmetry uncritically — and the derivation ships as a cookbook recipe with that
caveat stated. `opCounts` per (part, map) is shipped so the derivation is a
division rather than a scan.

---

## 7. Aggregation, thresholds, segments (L4)

### 7.1 JND units, the cap constant, and the event constant

Every registry row carries `jnd`, the just-noticeable difference in the row's
unit; densities are dimensionless multiples of JND. Values are [literature] where
survey-lit provides a citation, else [convention]; all overridable via
`options.jnd` (a closed key vocabulary, §4) while the defaults stay the
documented reference. The defaults, with their AD-26.2 tags:

| row                   | default                 | tag                                                                                                                                                                                                          |
| --------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `asynchrony`          | **30 ms**               | **[literature]** — the onset-asynchrony detection threshold of the Vernon 1936 → Goebl 2001 tradition; the 35 ms chord-clustering window the field uses as its operational "simultaneous" sits just above it |
| `tempo`               | ln(1.05) ≈ 0.049 nepers | [convention]; partial support noted in the row — the >2 % local-slowing threshold used to classify a ritardando, and Sundberg/Friberg/Frydén 1991's near-threshold preferred k-values                        |
| `dynamics`            | ln(1.10) nepers         | [convention] — survey-lit L6 records that four loudness conventions coexist in the literature with no shared scale, so this is a declared choice, not a measurement                                          |
| `rubato` displacement | ~1/16 quarter           | [convention]                                                                                                                                                                                                 |
| `velocity`            | ~3 MIDI units           | [convention]                                                                                                                                                                                                 |

Revision 2 carried `asynchrony 20 ms` as a guess; 30 ms is the literature's
figure and supersedes it. The general principle behind the whole column is
survey-lit L5: **a difference below one JND is not a difference**, which is the
empirical content of §7.3's `τ = 1` threshold.

`δ_row` (§4) is the metric cap in JND units, default 10 [convention].

`κ` weights event atoms per dimension [convention], making one 1-JND event equal
`κ` quarters of 1-JND sustained deviation; default `κ = 1`. **`κ` carries units
of quarters** (AD-7, M17) — that is what makes an atom's contribution
commensurable with a JND·quarter of sustained deviation, and it was unstated in
revision 1.

### 7.2 Weights

`D = Σ_k ω_k d_k`; default `ω_k = 1` for every dimension. **The justification is
corrected** (AD-20, M12). Revision 1 said JND normalization "has already made
dimensions commensurable, so unequal default weights would be a second, hidden
opinion". JND normalization makes each _row_ commensurable; it does not make each
_dimension_ commensurable, because `d_k` is a SUM over the dimension's rows and
atoms (§3). `d_articulation` accumulates over seven rows and every note-anchored
atom in the piece while `d_tempo` accumulates over one curve, so two documents
differing by one JND uniformly in every attribute produce `d_k` proportional to
each dimension's row and event count. `ω_k = 1` therefore **is** an opinion — it
up-weights row-rich, event-rich dimensions — and it is kept because it is
defensible and metric-safe, not because it is neutral. To give the reader the
lever, the report carries the **per-row breakdown** for every dimension
alongside `d_k`, so a caller can see what `ω = 1` is actually weighting.

Callers pass `options.weights` (validated keys, ≥ 0, finite); the report echoes
the effective weight vector. `normalization: 'corpus'` (corpus level only)
derives a single constant vector from the whole matrix and stamps it.
Pair-dependent weights are forbidden and unimplemented (R3).

### 7.3 Segments and the closing table

**Columns come from the aggregate density** (AD-19, M9a). Revision 1 scored cells
per dimension `k`, which yields eleven different segment sets, while the table
needs **one** column set shared by all rows and the report carries a single
`segments` list — as written the table was not defined. The segment pass runs on
`p_D(t) = Σ_k ω_k p_k(t)` against `τ_D = Σ_k ω_k τ_k`. Per-dimension segment
lists may ship as a secondary, explicitly non-closing product.

**Cell score is mass, not a sample** (AD-19, M9c):

    score(c) = (mass of p_D in c) − τ_D · w(c)

With atoms in the measure a cell has no point density, so revision 1's
`w_c·(p_D(c) − τ)` was undefined; and zero-width cells (co-dated instructions are
legal) behave correctly under the mass form, since the score is the atom mass and
`τ·0 = 0`.

**Boundaries are root-refined** (AD-19, M9b). `p_D` is continuous inside a cell
for tempo and dynamics, so `p_D − τ_D` changes sign at interior points and
cell-quantized segment edges can be many bars from the true crossing. The roots
of `p_D − τ_D` join the grid for the segment pass, reusing §5.0's bracketing
machinery.

**Ruzzo–Tompa, and what it does and does not decide.** Its maximal segments are
canonical as a _set_ — a segment extended by a zero-score cell contains a proper
subsequence of equal score and therefore fails maximality, so boundary zeros are
never absorbed and the set is unique (the math lens attacked this and it held).
But the **ranking** is by a different functional from the score that produced the
set, and two segments can have equal mass, so the tie rule is documented (AD-19,
M9d): **mass descending, ties by earliest start, then by shortest length**.

**Threshold** `τ_k = 1` JND (by construction of the units; per-dimension override
possible).

**Zero-weight dimensions** (AD-19). A dimension with `ω_k = 0` is excluded from
`p_D` — the aggregate density it does not contribute to — but its `d_k`, mean and
per-row breakdown are still computed and reported, and the table still closes,
because the table closes over _weighted_ rows. This is what makes §7.4's
dimension-selective recipe work.

**The table closes for any partition** (AD-19, R4). Stated plainly because
revision 1's "because" proved less than it claimed: for **any** partition
`{S_s}` of the window, `Σ_s ∫_{S_s} p_k = d_k` by countable additivity, and
`Σ_k ω_k Σ_s c_{k,s} = D` because `D` is a weighted sum. Ruzzo–Tompa only decides
_which_ partition is reported. Saying this protects the headline capability from
being entangled with the thresholding. Rows = dimensions, columns = ranked
segments + one below-threshold remainder column; residual pinned numerically to
~1e−12·D with compensated summation.

**Segment shape** (AD-23, C4). U3's word is "complexity/difficulty/distance", and
mass — `length × mean excess` — is a defensible reading of _distance_ and an
indefensible reading of _difficulty_: a forty-bar drift at 1.2 JND outranks a
two-bar shock at 6 JND, always. Revision 1 left the per-segment shape undefined,
so `peak` — precisely the statistic the "biggest moment" reading needs — was
recoverable from no shipped product. Each segment therefore carries
`{ start, end, length, mass, peak, mean }` (AD-23) plus `meanSigned` and
`direction` (C2, §7.5) and `measure` (C3). Mass stays the documented default
order — it is the order that makes the table's column sums monotone — and the
docs state in one sentence what each alternative reading means musically.
Shipping the fields is cheaper than shipping a `segmentRanking` knob, and a
caller sorting an array needs no API.

**The equivalence block** (AD-23, C11). The JND threshold is this module's
methodological answer to Hall's prohibition ("it can be misleading to attack a
music roll with a ruler"), and the sentence a scholar wants — "93 % of the
weighted deviation mass is below the perceptual threshold" — was a division the
user had to find and perform. The report derives it, from numbers already
present:

    equivalence {
      subThresholdMassFraction,          // remainder column ÷ D
      aboveThresholdLengthFraction,      // Σ segment lengths ÷ window length
      byDimension: Record<dim, { subThresholdMassFraction,
                                 aboveThresholdLengthFraction }>
    }

with a documented sentence template in the README so the phrasing is consistent
across papers that use it. This also serves mlign directly: "is the augmented
sample actually distinguishable?" is `aboveThresholdLengthFraction > 0`.

### 7.4 Invariance modes

Reproducing-roll corpora carry structural uncertainty: absolute roll speed is
often unknowable (Hall, _Pianola Journal_ 22; Hagmann 1984 — see
survey-lit-welte.md), which multiplies tempo by an unknown constant = adds an
unknown constant in log space. Comparing such sources at face value invents level
differences no scholar can defend. Per dimension,
`invariance: 'none' | 'level' | 'level-gain'`:

- `'none'` (default): density on the raw T-space curves.
- `'level'`: each document's curve is centered by its own window mean before
  differencing.
- `'level-gain'`: centered and σ-normalized per document — pure shape comparison
  in L1 form.

All three are metric-safe because the canonicalization is **per-document** and,
per AD-4, the window is piece-derived or corpus-shared; under a pair-derived
window they inherit M2's defect and are not metric.

**Defined per curve-valued ROW, not per dimension** (AD-20, M10). A dimension's
mode applies to all of its curve-valued rows, each centered by its own window
mean. This is what makes the option meaningful for multi-attribute dimensions,
where "the window mean" of a sum of rows in nepers, quarters, ms and velocity
units is not a quantity.

**Distribution dimensions**: `'level'` is a **location shift of the law** —
subtract the span-weighted mean of the laws' means — which is meaningful and
cheap (AD-20).

**Event dimensions**: `'level'` and `'level-gain'` are an `InvalidOptionError`
(AD-20). There is no curve to center.

**`σ = 0` under `'level-gain'`** (AD-20): the canonical curve is identically 0
and the dimension is marked `shapeless`. A constant curve is _completely
ordinary_ in this data, so revision 1's silence here was a division by zero on
the most common input in the corpus.

**`'level-gain'` and P-C5 are mutually exclusive** and documented as such: under
`'level-gain'`, `d(mpm, exaggerateMpm(mpm, s)) = 0` for every `s > 0`.

**What each mode removes, per scale space** (AD-23, C9) — because §7.4's
justification is exactly right for log spaces and silently wrong elsewhere:

| space                                                                                                     | `'level'` removes                                                                          | `'level-gain'` removes                 |
| --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | -------------------------------------- |
| log (tempo, dynamics)                                                                                     | a multiplicative factor (roll speed, volume calibration)                                   | additionally a dilation of the gesture |
| linear / gain (asynchrony ms, imprecision ms, `absoluteDelayMs`, `absoluteDurationChangeMs`, pedal ratio) | an additive **offset only** — the factor survives, since `c·x − mean(c·x) = c(x − mean x)` | the multiplicative factor              |

A roll read 10 % slower has all its inter-onset offsets stretched 10 %, so the
same physical uncertainty that `'level'` removes from tempo stays in asynchrony
and imprecision-timing while the report stamps `invariance: 'level'` on all of
them as though they were equivalent. The report therefore emits a note when
`'level'` is applied to a linear-space dimension, in plain words: _this removed
an offset, not a scale factor_. Given that asynchrony-as-artifact is one of the
three questions survey-lit-welte flags as design-shaping, this is the wrong
dimension to get quietly wrong. The W4 Welte cookbook recipe spells out the
roll-pair setting: `'level'` on tempo and dynamics, and either `'level-gain'` or
weight 0 on the ms-valued dimensions, with the trade-off named.

**Dimension-selective comparison** (e.g. timing-only, excluding possibly-editorial
Welte dynamics — Hall PJ 14, Reinhart PJ 16) is `weights: { dynamics: 0, … }`; a
zero-weight dimension is still computed and reported, only excluded from `D` and
from the aggregate density (§7.3).

### 7.5 Signed descriptors

Every quantity above is `|Δ|`, and a researcher's sentences are directional:
"Hofmann stretches the approach to the reprise where Lamond drives through it";
Hall's central question is whether a roll is "an eccentric old-fashioned
interpretation at the correct speed, or a conventional approach at the wrong
one". Revision 1 computed `g_A − g_B` at every cell and discarded the sign at
every level except §1.2's single global `d_level`, which cannot answer _where_
one is faster: a performance slower in the first half and faster in the second
reports `level ≈ 0` and large segments, indistinguishable from one that disagrees
in magnitude but agrees in direction everywhere.

The signed integral is therefore retained as a **descriptor** (AD-23, C2), never
as a distance — it enters no `d_k`, no `D`, no table cell and no matrix, so R3
and R4 are untouched:

- each segment gains `meanSigned` (∫(g_A − g_B)·w over the segment ÷ its length,
  in the row's T-space unit) and `direction: 'a-greater' | 'b-greater' | 'mixed'`
  (`'mixed'` when the signed integral's magnitude is below a documented fraction
  — 0.5 [convention] — of the absolute one, i.e. the segment changes sign inside
  itself);
- each `DimensionComparison` gains `meanSigned` over the window, and the
  decomposition carries `levelSigned` beside `level`;
- the profile export (§9) carries the signed series;
- `CorpusResult.profiles` carries the signed per-dimension deviation from the
  medoid, so "who is extreme in what, **and in which direction**" is answerable.

The docs state once, prominently, that signed descriptors are not distances and
do not satisfy the triangle inequality — the same labelling discipline §1.2
applies to the decomposition.

---

## 8. Corpus level (L5)

- **Input.** `items: readonly { mpm: XmlText; performance?: string | number;
label?: string }[]`. An item naming no performance in a multi-performance
  document EXPANDS to one item per performance (labels `«docLabel»:«perfName»`)
  — the natural reading of the official multi-performance samples. `docLabel` is
  `label ?? \`items[${i}]\``(AD-22, A8); labels are **required unique after
expansion**, and duplicates are an`InvalidOptionError`naming every colliding
label and the item indices that produced it. Uniqueness is not pedantry: PAM
medoids are the one product whose entire value is naming a real performer, and
two documents legitimately labelled`"Welte 1905"`each holding a performance
called`"default"`make "the most typical Hofmann" ambiguous.`N ≤ 256`(R10),
as the explicit`maxItems` option.
- **Every cross-reference in `CorpusResult` is by index into `labels`** (A8) —
  `dendrogram`, `medoids`, `clusters`, `seriationOrder`, `profiles`, `scape` —
  and `labels` is the only place a string appears; a consumer joins them itself.
  The expansion's provenance ships as
  `items: readonly { itemIndex: number; performance: string }[]` so a row maps
  back to the input item it came from.
- **One window, one option set, one weight/jnd/invariance vector** for the entire
  matrix (window end = max over items, or MSM end) — every matrix entry is a
  value of ONE function (R3), and the shared window is piece-derived in the sense
  of AD-4 even when derived from the items, because it does not vary with the
  pair. One MSM for the whole matrix. All stamped in the result via the shared
  `ComparisonSettings` echo (§9).
- **Matrices** (AD-22, A4). **Full row-major `N²`**, `Record<ComparisonDimension,
readonly number[]>` plus an aggregate, with an explicit `n` field; index
  arithmetic `m[i*n + j]`, and the pinned assertions
  `m[i*n+j] === m[j*n+i]` bit-for-bit and `m[i*n+i] === 0`. Revision 1 said
  "packed row-major, symmetric", which names two incompatible layouts — packed
  conventionally means the strict upper triangle at `N(N−1)/2` entries — with no
  index function and no reading that satisfies both; a consumer indexing
  `i*n + j` against a packed array reads a different pair's distance and reports
  it as fact. At R10's ceiling the full form costs 256²×8 ≈ 520 kB per matrix,
  needs no helper, and survives `JSON.stringify` unchanged.
- **Clustering.** Agglomerative via Lance–Williams: `average` (UPGMA, default),
  `single`, `complete`, `weighted`, `ward.D2` (docs state: the recurrence is
  valid on non-Euclidean input, the minimum-variance interpretation is not).
  Ties: merge the pair whose `(min label, max label)` is lexicographically
  smallest; children ordered by smallest contained label. Dendrogram as plain
  data `{ merges: [{left, right, height, size}], order }` in the SciPy/hclust
  convention. Flat clustering: PAM k-medoids (medoids are real performances —
  "the most typical Hofmann"), BUILD/SWAP ties by lowest label; silhouette per k
  as guidance, with `silhouetteReliable: false` at N < 20 (A22 — the caveat gets
  a field rather than living in prose).
- **Every tie rule is LABEL-based, and the corpus products are therefore
  permutation-invariant** (AD-25.2, reversing AD-22's first branch in favour of
  the panel's second). Index-based tie rules are a function of the caller's item
  order, and exact ties are _structural_ here, not measure-zero: P-C1 guarantees
  `compare(A, A)` is exactly 0, R6's never-drop rule makes `both-neutral`
  dimensions produce large blocks of exactly-equal distances, and item expansion
  makes duplicate content easy to introduce by accident. Under index rules a tie
  that resolved to `(0,3)` before a permutation can resolve to `(1,2)` after — a
  _different merge_, not a relabeling. Since labels are already required unique
  after expansion, keying every tie on the label instead — merge ties, child
  order, PAM BUILD/SWAP, and the eigenvector sign ties below — makes the products
  genuinely permutation-invariant, so P-C6's corpus clause is **full
  permutation-equivariance**: permuting `items` permutes the matrices and
  relabels the dendrogram, and nothing else changes. The comparison is code-unit
  order (`<`), never `localeCompare`, which is locale-dependent and would break
  R2's byte-identity across environments.
- **Embedding.** Classical MDS: double-centering + cyclic Jacobi (fixed sweep
  order, stop at off-diagonal norm ≤ 1e−12·‖B‖). Report the FULL eigenvalue
  spectrum, explained variance over Σ|λ| (never Σλ⁺), and negative-eigenvalue
  mass as the "how non-Euclidean is this?" figure. Eigenvector signs fixed
  (largest-magnitude component positive, ties by lowest **label**, AD-25.2).
  Seriation = order by first MDS coordinate.
- **Degenerate corpora** (AD-21, AD-22, A3, M19). `N = 0` and `N = 1` are legal,
  not errors, and every corpus product has a stated value for them. When
  `Σ|λ| = 0` — the same document listed twice, or a corpus of semantically
  identical performances, which is exactly what this module exists to detect —
  `explainedVariance` entries are `null` and a `degenerate: true` flag is set,
  rather than `0/0`. Silhouette with `max(a,b) = 0` is 0, by the convention
  already adopted for singleton clusters.
- **Profiles.** Per performance: per-dimension distance to the corpus medoid and
  to the corpus mean-distance — "who is extreme in what" as data — with the
  signed companion of §7.5.
- **`suspectPairs`** (AD-23, C7): the pairs whose comparability check (§5.0)
  fired, surfaced at corpus level so a heterogeneous folder announces itself
  before the dendrogram is read. This matters more as N grows, because a 200-file
  glob is where nobody inspects the inputs by hand.
- **Corpus-average pseudo-performance (opt-in, AD-26.3).**
  `corpusAverage?: boolean` adds one synthetic item to the matrix: the
  per-dimension pointwise mean of the corpus's evaluated curves, labelled
  `'«corpus average»'` and flagged `synthetic: true` in `items` so no consumer
  mistakes it for a performance. Sapp (2007) is the precedent — the average
  absorbs "minor and random relationships between performances" so only genuinely
  distinctive matches survive — and it converts the corpus into the
  _deviation-from-norm_ comparison that survey-lit L4 records as the single most
  replicated methodological result in the field (Stamatatos & Widmer 2005:
  82.5 % identification against the norm versus 52.5 % against the score). Plain
  data, off by default, and stamped in the settings echo when on.
- **Per-piece percentile context (opt-in, AD-26.3).** `noiseFloor?: boolean`
  annotates each pair distance with where it sits in _this corpus's_ own
  distribution: `{ percentile, corpusMedian, corpusIqr, noiseFloor }`, the noise
  floor being the bottom half of the ranked distances in Sapp's sense. The
  motivation is survey-lit L10 — a raw number is **not portable across pieces**;
  the modal correlation between two _random_ performances is 0.67 for Mazurka
  17/4 and 0.87 for 68/3, so "two MPM files alone cannot tell you whether 0.8 is
  close." This is context, never a rescaling: the matrices themselves are
  untouched, so R3 and every metric guarantee stand.
- **Scape (opt-in, W4+).** Binned multi-scale view (≤ 256 bins, prefix-sum
  implementation, bin count in the report): per (window center, size), either a
  pair's distance or the corpus argmin/argmax performer (Sapp's variant).
- **`normalization: 'corpus'`** — written out as a formula, since a stamped
  constant nobody can reproduce is not a stamp (M19, AD-25.5):

      normalizationConstants[k] = median{ d_k(i,j) : d_k(i,j) ≠ 0 }   over the matrix
      ω_k = 1 / normalizationConstants[k]

  i.e. each dimension is rescaled so that its **median nonzero distance is 1**,
  which is what makes a corpus-normalized aggregate compare dimensions on the
  spread they actually exhibit in _this_ corpus rather than on their JND scales.
  A dimension whose nonzero set is **empty** — `pedal` across a corpus of
  harpsichord rolls, say — yields `normalizationConstants[k] = null` and falls
  back to the fixed default `ω_k`, stamped (AD-22, A3d). Default remains fixed
  JND weights, and the derived vector is corpus-dependent with the same
  reproducibility caveat the corpus window carries.

---

## 9. API (facade, house rules F1/F2/F2a/F5/E2/N1/N4/N5)

Interior `src/comparison/**` (plain `Error` internally); facade
`src/api/comparison.ts`, re-exported from `src/api/index.ts` and member-by-member
from `src/index.ts`. All entry points take ONE named-parameter object: two
interchangeable MPM texts make positional args a hazard (F5). This is a
deliberate divergence from `performMsm`'s documents-plus-options shape, and it
carries one obligation — **the options echo enumerates its scalar fields exactly
and never the document texts `a`, `b`, `items[].mpm`** (AD-22, A12; the one-bag
form and this echo rule are confirmed by AD-25.3 against the panel's proposed
two-argument alternative), since echoing "options" would copy the entire corpus
into the result and then deep-copy it again to satisfy I3(b).

Revision 1's §9 was a prose sketch where the campaign's precedent is a
declaration; nine api-lens findings were instances of that one gap. Revision 2
declares the surface.

### 9.1 Vocabulary

```ts
export const COMPARISON_DIMENSIONS = Object.freeze([
  'tempo',
  'rubato',
  'dynamics',
  'accentuation',
  'articulation',
  'ornamentation',
  'asynchrony',
  'pedal',
  'imprecisionTiming',
  'imprecisionDynamics',
  'imprecisionDuration',
] as const);
export type ComparisonDimension = (typeof COMPARISON_DIMENSIONS)[number];

/** `${dimension}/${element}@${attribute}` — §4. The closed override vocabulary. */
export const COMPARISON_JND_KEYS = Object.freeze([
  'tempo/tempo@bpm',
  'tempo/tempo@transition.to' /* … */,
] as const);
export type ComparisonJndKey = (typeof COMPARISON_JND_KEYS)[number];

export type InvarianceMode = 'none' | 'level' | 'level-gain';
export type WindowRule = 'msm' | 'explicit' | 'corpus' | 'pair-derived';
export type MetricGuarantee = 'unconditional' | 'window-restricted';
export type DimensionState = 'compared' | 'both-neutral';
export type TimeSignatureSource = 'msm' | 'renderer-default';

export type ComparisonNoteKind =
  | 'structural' // §3: unmatched part, encoding mismatch, mechanism switch
  | 'renderer-default-level' // R8/AD-1: unresolvable level performed at 100.0
  | 'renderer-error' // R8/AD-1: ⊥ span — renderer aborts or emits NaN
  | 'renderer-skip' // AD-9: instruction the renderer skips
  | 'inert-difference' // R9b: documents differ in an attribute nothing reads
  | 'capped' // AD-2: the local metric's cap bound
  | 'grid-truncated' // AD-10: rubato frame-boundary cap bound
  | 'estimate-degradation' // R7: an MSM-dependent refinement was unavailable
  | 'option-unusable' // A10: an explicitly-set option could not be honoured
  | 'invariance-space' // C9: 'level' on a linear-space dimension
  | 'plausibility' // C6: a resolved value outside its plausible range
  | 'length-mismatch'; // C7: the same-piece heuristic fired
```

`COMPARISON_DIMENSIONS` is **frozen** (AD-22, A25), for the reason
`EXPRESSION_DIMENSIONS` is: the ESM re-export hands a consumer the same object
the option validator reads, so unfrozen, a `push` from outside would widen this
package's notion of a legal dimension process-wide; `as const` stops that at
compile time only. Same for `COMPARISON_JND_KEYS` and the §3 correspondence
table.

### 9.2 Options

```ts
/** The knobs that define the metric. Shared so a corpus and a pair can be
 *  configured identically, and so §8's "one option set for the matrix" has a
 *  name to be stamped under (A5). */
export interface ComparisonSettings {
  /** Quarters. `start < end`, both finite, `start >= 0` (A16). Omit for §5.0's rule. */
  readonly window?: { readonly start: number; readonly end: number };
  readonly weights?: Partial<Record<ComparisonDimension, number>>; // ≥ 0, finite
  readonly jnd?: Partial<Record<ComparisonJndKey, number>>; // > 0, finite
  readonly plausibleRange?: Partial<Record<ComparisonJndKey, readonly [number, number]>>;
  readonly invariance?: Partial<Record<ComparisonDimension, InvarianceMode>>;
  /** Requires `msm`; setting it true without one is reported (A10). */
  readonly noteDensityWeight?: boolean;
}

export interface CompareMpmOptions extends ComparisonSettings {
  readonly a: XmlText;
  /** Omit to compare two performances **inside `a`** (C16). */
  readonly b?: XmlText;
  readonly performanceA?: string | number; // required if the document is multi-perf
  readonly performanceB?: string | number;
  /** Part of the metric, not a report-only side input: it moves the window,
   *  the weight function and articulation resolution (A11). */
  readonly msm?: XmlText;
  /** Opt-in retention of the evaluated curves and densities (C1). */
  readonly profile?: {
    readonly dimensions?: readonly ComparisonDimension[]; // default: all
    readonly grid?: 'refinement' | { readonly step: number }; // quarters; step-capped
  };
}

export interface DiffMpmOptions extends CompareMpmOptions {
  readonly moves?: boolean; // fragment/consolidate ops; W3+, default true
}

export interface CompareCorpusOptions extends ComparisonSettings {
  readonly items: readonly {
    readonly mpm: XmlText;
    readonly performance?: string | number;
    readonly label?: string;
  }[];
  readonly msm?: XmlText; // one MSM for the whole matrix
  readonly maxItems?: number; // default 256 (R10, C17)
  readonly normalization?: 'fixed' | 'corpus'; // default 'fixed'
  readonly linkage?: 'average' | 'single' | 'complete' | 'weighted' | 'ward.D2';
  readonly k?: number; // PAM clusters; omit = none
  readonly embeddingAxes?: number; // default 2
  readonly scape?: { readonly bins: number }; // omit for no scape (A2)
  /** Add the corpus-average pseudo-performance as an extra item (AD-26.3). */
  readonly corpusAverage?: boolean; // default false
  /** Annotate pair distances with this corpus's own percentile context (AD-26.3). */
  readonly noiseFloor?: boolean; // default false
}

export function compareMpm(options: CompareMpmOptions): ComparisonResult;
export function diffMpm(options: DiffMpmOptions): DiffResult;
export function compareMpmCorpus(options: CompareCorpusOptions): CorpusResult;

/** The documented empty performance, so nobody hand-rolls the null baseline (C8). */
export function neutralMpm(options?: { readonly ppq?: number }): XmlText;
```

`scape` loses revision 1's `| null` (AD-22, A2): RULE N4 says every _input_
option is `?:` and never `null`, and RULE N1 forbids `null` meaning "use the
default" — `k` on the neighbouring line already used the compliant spelling.

`b` is optional and defaults to `a` (AD-23, C16). The campaign's own P-C9
fixtures — Telemann _Grave_, Vulpius, Albert — are the only real
multi-performance documents in existence, and revision 1 made the pairwise entry
point stricter than its corpus sibling for exactly the case the fixtures are
built on. The multi-performance-without-selector error still covers the ambiguous
case, so the strictness that matters is retained.

### 9.3 Results

```ts
export interface ComparisonSiteRef {
  readonly document: 'a' | 'b';
  readonly scope: 'global' | 'part';
  readonly partIndex: number | null;
  readonly container: string; // 'dynamicsMap', 'dynamicsStyles/MEI export', …
  readonly date: number | null; // quarters; null when absent/unparseable
  readonly index: number; // position among element children, document order
  readonly attribute: string;
  readonly xmlId: string | null;
}

export interface MeasurePosition {
  // C3; null everywhere without an MSM
  readonly number: number;
  readonly beat: number;
}

export interface ComparisonNote {
  readonly kind: ComparisonNoteKind;
  readonly dimension: ComparisonDimension | null;
  readonly document: 'a' | 'b' | null;
  readonly itemIndex: number | null; // corpus level
  readonly site: ComparisonSiteRef | null;
  readonly startQuarters: number | null;
  readonly endQuarters: number | null;
  readonly message: string;
}

export interface Decomposition {
  // AD-18; interpretive, non-summing
  /** The T-space unit of `level`/`levelSigned`/`gain`: 'nepers' for the log
   *  dimensions (tempo, dynamics), 'quarters'/'ms'/'velocity'/'ratio' elsewhere.
   *  Natural log throughout; ×1/ln 2 ≈ 1.4427 to read as log₂ (AD-26.1). */
  readonly unit: string;
  readonly level: number; // |ℓ_A − ℓ_B|, in `unit`
  readonly levelSigned: number; // ℓ_A − ℓ_B, in `unit`; > 0 ⇒ A faster/louder
  readonly gain: number; // |σ_A − σ_B|, in `unit`
  readonly shape: number | null; // √(2(1−r)), dimensionless; null iff shapeless
  readonly r: number | null; // dimensionless; null iff shapeless
  readonly shapeless: boolean; // σ_A·σ_B === 0 (C14)
  readonly l2Squared: number; // in `unit`²; shape term := 0 when shapeless
}

export interface DimensionComparison {
  readonly state: DimensionState; // 'excluded' no longer exists (AD-1)
  readonly distance: number; // JND·quarters
  readonly mean: number | null; // JND; null iff L === 0 (A3)
  /** The T-space unit of `meanSigned` — 'nepers' for tempo/dynamics (natural
   *  log; ×1/ln 2 for log₂). MPM stores BPM, a RATE: on tempo a positive
   *  `meanSigned` means A is faster, the opposite of the seconds-per-beat
   *  convention partitura and much of the literature use (AD-26.1). */
  readonly unit: string;
  readonly meanSigned: number | null; // in `unit`; descriptor, never a distance (C2)
  readonly weight: number;
  readonly invariance: InvarianceMode;
  readonly rows: readonly {
    // the per-row breakdown ω=1 needs (AD-20)
    readonly key: ComparisonJndKey;
    readonly distance: number; // JND·quarters
    readonly unit: string; // the row's own unit — 'nepers', 'ms', …
    readonly jnd: number; // in `unit`
    readonly delta: number; // δ_row, in JND units
  }[];
  readonly events: {
    readonly matched: number;
    readonly unmatchedA: number;
    readonly unmatchedB: number;
    readonly mass: number;
  };
  readonly bottomLengthQuarters: number; // window length reading ⊥ on either side
  readonly cappedCells: number;
  readonly decomposition: Decomposition | null; // null iff the dimension has no curve
  readonly timeSignatureSource: TimeSignatureSource | null; // accentuation only (AD-12)
  readonly datePositionKnown: boolean; // false when noteid atoms lack an MSM (AD-7)
}

export interface ComparisonSegment {
  readonly startQuarters: number;
  readonly endQuarters: number;
  readonly lengthQuarters: number;
  readonly measure: { readonly start: MeasurePosition; readonly end: MeasurePosition } | null;
  readonly mass: number; // JND·quarters
  readonly peak: number; // JND per quarter
  readonly mean: number; // JND per quarter
  readonly peakAtQuarters: number;
  /** Aggregate-derived (AD-19), so this is in JND per quarter, NOT a T-space
   *  unit; the per-dimension signed figure with its own unit is on
   *  `DimensionComparison` (AD-26.1). */
  readonly meanSigned: number;
  readonly direction: 'a-greater' | 'b-greater' | 'mixed';
  readonly rank: number;
}

export interface AttributionTable {
  // rows × (segments + remainder), row-major
  readonly dimensions: readonly ComparisonDimension[]; // COMPARISON_DIMENSIONS order
  readonly columnCount: number; // segments.length + 1
  readonly cells: readonly number[]; // unweighted c_{k,s}; length = 11 × columnCount
  readonly rowSums: readonly number[]; // = d_k
  readonly columnSums: readonly number[]; // weighted
  readonly total: number; // = D
  readonly residual: number; // pinned ≤ 1e−12·D
}

export interface ComparisonReport {
  /** Provenance: the fully resolved settings, never the documents (A12). */
  readonly inputs: {
    readonly settings: Required<ComparisonSettings>; // defaults filled in
    readonly jnd: Record<ComparisonJndKey, number>; // the effective vector (A1/A11)
    readonly msmUsed: boolean;
    /**
     * The per-family accuracy record, in BOTH units (AD-28.2). `relative` is the classical
     * quadrature figure; `jnd` is the same error expressed on the dimension's own perceptual
     * scale, and it is the one that states whether the number is fit for purpose — the metric
     * requirement is JND-scale exactness, and the relative figures are numerical hygiene
     * above it. Naive GL-10 was already at 9.7e-3 JND on tempo before AD-28 replaced it; the
     * graded mesh is at 5.4e-4. Reporting only `relative` invites a reader to think 1e-6 is
     * a requirement rather than a comfort.
     */
    readonly epsilon: Record<
      'step' | 'tempo' | 'bezier' | 'imprecision' | 'drift',
      { readonly relative: number; readonly jnd: number }
    >;
  };
  readonly window: {
    readonly startQuarters: number;
    readonly endQuarters: number;
    readonly rule: WindowRule;
    readonly metricGuarantee: MetricGuarantee;
  };
  readonly ppq: {
    readonly a: number;
    readonly b: number;
    readonly lcm: number;
    readonly fallbackUsed: boolean;
    readonly assumed: number | null;
  };
  readonly parts: readonly {
    readonly numberA: number | null;
    readonly numberB: number | null;
    readonly nameA: string | null;
    readonly nameB: string | null;
    readonly matched: boolean;
  }[];
  readonly comparability: {
    // C7
    readonly lastDateA: number;
    readonly lastDateB: number;
    readonly lengthRatio: number;
    readonly ppqA: number;
    readonly ppqB: number;
    readonly partCountA: number;
    readonly partCountB: number;
    readonly partNumbersMatched: boolean;
    readonly instructionCountA: number;
    readonly instructionCountB: number;
  };
  readonly measures:
    | readonly {
        // C3; null without an MSM
        readonly number: number;
        readonly startQuarters: number;
        readonly timeSignature: { readonly numerator: number; readonly denominator: number };
      }[]
    | null;
  readonly dimensions: Record<ComparisonDimension, DimensionComparison>;
  readonly aggregate: {
    readonly distance: number; // D, JND·quarters — additive, length-dependent
    readonly mean: number | null; // D / L, JND — the human headline (C10)
    readonly weights: Record<ComparisonDimension, number>;
    readonly normalization: 'fixed' | 'corpus';
  };
  readonly segments: readonly ComparisonSegment[];
  readonly remainder: { readonly mass: number }; // the below-threshold column
  readonly table: AttributionTable;
  readonly equivalence: {
    // C11
    readonly subThresholdMassFraction: number;
    readonly aboveThresholdLengthFraction: number;
    readonly byDimension: Record<
      ComparisonDimension,
      {
        readonly subThresholdMassFraction: number;
        readonly aboveThresholdLengthFraction: number;
      }
    >;
  };
  readonly cumulativeDrift: {
    // C13; null iff tempo is ⊥ on both sides
    readonly secondsA: number;
    readonly secondsB: number;
    readonly difference: number;
    readonly ratio: number;
    readonly maxAbsMs: number;
  } | null;
  readonly profiles: Record<
    ComparisonDimension,
    {
      // C1; null unless requested
      readonly dates: readonly number[]; // quarters, left edges
      readonly density: readonly number[]; // p_k, JND per quarter
      readonly signed: readonly number[]; // C2
      readonly valueA: readonly number[] | null; // T-space curve; null for
      readonly valueB: readonly number[] | null; //   event/distribution dimensions
      readonly space: string;
      readonly unit: string;
    }
  > | null;
  readonly notes: readonly ComparisonNote[];
}

export interface ComparisonResult {
  readonly report: ComparisonReport;
}
```

**Null-conditions, each stated** (AD-22, A22): `decomposition` is null exactly
when the dimension has no curve-valued representation (the event dimensions and,
outside the W₂ table, the distribution dimensions); `shape`/`r` are null one level
in, exactly when `shapeless` is true. `cumulativeDrift` is null exactly when the
tempo dimension reads `⊥` on both sides — R6 makes it computable whenever either
side has any tempo information, and a zero weight does not suppress it.
`profiles` is null exactly when `options.profile` was omitted. `measures` is null
exactly when no MSM was supplied.

```ts
export interface EditOp {
  readonly op: 'insert' | 'delete' | 'substitute' | 'fragment' | 'consolidate';
  readonly map: string;
  readonly part: number | null;
  readonly site: ComparisonSiteRef;
  readonly dateA: number | null;
  readonly dateB: number | null;
  readonly measureA: MeasurePosition | null;
  readonly measureB: MeasurePosition | null;
  readonly attributes: readonly {
    readonly key: ComparisonJndKey;
    readonly name: string;
    readonly valueA: number | string | null;
    readonly valueB: number | string | null;
    readonly deltaJnd: number;
  }[];
  readonly cost: number; // JND·quarters, sequential (§6.2)
  readonly free: boolean; // cost === 0 *by pricing* (§6.2)
  readonly applicationIndex: number; // position in date order (C5)
  readonly costRank: number; // position in cost-descending order (C5)
}

export interface EditScript {
  readonly part: number | null;
  readonly map: string;
  readonly ops: readonly EditOp[]; // date order (C5)
  readonly topByCost: readonly number[]; // indices into `ops`, cost desc
  readonly opCounts: {
    readonly insert: number;
    readonly delete: number;
    readonly substitute: number;
    readonly fragment: number;
    readonly consolidate: number;
    readonly free: number;
  }; // C12
}

export interface DiffReport {
  readonly inputs: ComparisonReport['inputs']; // same provenance block (A14)
  readonly window: ComparisonReport['window'];
  readonly ppq: ComparisonReport['ppq'];
  readonly parts: ComparisonReport['parts'];
  readonly scripts: readonly EditScript[];
  readonly dimensions: Record<
    ComparisonDimension,
    {
      readonly dCurve: number | null; // null for the event-shaped dimensions
      readonly scriptCost: number;
      readonly replayedDelta: number;
      readonly reworking: number; // ≥ 0 by theorem (AD-5)
    }
  >;
  readonly notes: readonly ComparisonNote[];
}
export interface DiffResult {
  readonly report: DiffReport;
}
```

`free` is defined precisely (A14): **cost 0 by pricing**, i.e. the op's sequential
contribution is zero because the renderer performs the same function before and
after it — never "cost 0 by coincidence of rounding". `dCurve` is `number | null`
because R5's guarantee is a statement about curve-shaped dimensions; the
curve-shaped list is exported data, and the null case is the event-shaped
dimensions.

```ts
export interface CorpusResult {
  readonly n: number; // A4
  readonly labels: readonly string[]; // unique, A8
  readonly items: readonly {
    readonly itemIndex: number;
    readonly performance: string;
    readonly synthetic: boolean;
  }[]; // AD-26.3
  readonly matrices: {
    readonly aggregate: readonly number[]; // N², row-major
    readonly byDimension: Record<ComparisonDimension, readonly number[]>;
  };
  readonly dendrogram: {
    readonly merges: readonly {
      readonly left: number;
      readonly right: number;
      readonly height: number;
      readonly size: number;
    }[];
    readonly order: readonly number[];
  };
  readonly medoids: readonly number[] | null; // indices into labels
  readonly clusters: readonly number[] | null; // per item, cluster index
  readonly silhouette: readonly number[] | null;
  readonly silhouetteReliable: boolean; // false at N < 20 (A22)
  readonly embedding: {
    readonly coordinates: readonly number[]; // N × axes, row-major
    readonly eigenvalues: readonly number[];
    readonly explainedVariance: readonly (number | null)[]; // null iff Σ|λ| = 0
    readonly degenerate: boolean; // A3b
    readonly negativeEigenvalueMass: number;
    readonly axes: number;
  };
  readonly seriationOrder: readonly number[];
  readonly profiles: readonly {
    readonly toMedoid: Record<ComparisonDimension, number>;
    readonly toMedoidSigned: Record<ComparisonDimension, number>;
    readonly toMeanDistance: number;
  }[];
  readonly normalizationConstants: Record<ComparisonDimension, number | null> | null;
  /** AD-26.3; null unless `noiseFloor` was requested. Context, not a rescaling —
   *  `matrices` is unaffected, so R3's guarantees are untouched. */
  readonly context: {
    readonly percentile: readonly number[]; // N², row-major, aggregate distances
    readonly corpusMedian: number;
    readonly corpusIqr: number;
    readonly noiseFloor: number; // Sapp's bottom-half boundary
  } | null;
  readonly suspectPairs: readonly {
    readonly i: number;
    readonly j: number;
    readonly reason: ComparisonNoteKind;
  }[]; // C7
  readonly scape: { readonly bins: number; readonly cells: readonly number[] } | null;
  readonly settings: Required<ComparisonSettings>; // the echo, documents excluded
  readonly notes: readonly ComparisonNote[];
}
```

### 9.4 Errors

New typed classes extending `MeicoError`, in `src/api/errors.ts`:

- `InvalidOptionError` (existing) — see the validation table below.
- `PerformanceNotFoundError` (existing) — same semantics as the expression
  facade; **messages additionally name the document role**, because two are in
  play (AD-22, A6).
- **`ComparisonEngineError`** (new, empty body per the house pattern) — the
  attribution table fails to close, symmetry is violated. Revision 1 reused
  `EngineInvariantError`, whose shipped documentation promises _"no document can
  provoke it"_ and names `minRubatoWindow` as the only input that can; under
  comparison a pathological pair absolutely can, so reuse would ship two false
  sentences in the file consumers read to decide what to catch — and P-C5 runs
  both engines in one expression, where a caught error must say which engine
  broke without parsing the message (AD-22, A15).
- Parse failures surface via `parseOrThrow`.

**Every error names the offending document** (A6). The message prefix carries a
role, not just the kind: `MPM a: …`, `MPM b: …`,
`MPM items[7] "Hofmann 1905": …`. `DocumentKind` itself is unchanged, so the two
existing facades' messages are unaffected. With ~256 documents in an `items`
array, an error naming none of them sends the caller bisecting their own corpus.

**Validation table** (A16, A17, A23). Options are validated **before any document
is parsed** — a caller who both misspells a dimension and hands over a malformed
document is told about the misspelling, because that is the error they can act on
and the other may not even be theirs. Documents are then parsed in the order `a`,
`b`, `msm` (corpus: `items` in index order, then `msm`), so the first failure
reported is the earliest one. The interior owns the domain validators (one
definition of legality) and the facade wraps their throws in `InvalidOptionError`
with `{ cause }`; the interior option object is built **field by field**, never a
spread.

| option                                                  | domain                                                       | on violation                                                                                              |
| ------------------------------------------------------- | ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| `window`                                                | `{start, end}` both finite, `0 ≤ start < end`                | `InvalidOptionError`                                                                                      |
| `weights` keys                                          | in `COMPARISON_DIMENSIONS`                                   | `InvalidOptionError` naming all offenders                                                                 |
| `weights` values                                        | finite, ≥ 0                                                  | `InvalidOptionError`                                                                                      |
| `jnd` / `plausibleRange` keys                           | in `COMPARISON_JND_KEYS`                                     | `InvalidOptionError` naming all offenders                                                                 |
| `jnd` values                                            | finite, > 0 (a zero JND divides)                             | `InvalidOptionError`                                                                                      |
| `invariance` values                                     | in the union; `'level'`/`'level-gain'` on an event dimension | `InvalidOptionError` (AD-20)                                                                              |
| `performanceA` / `performanceB` / `items[].performance` | non-negative integer, or a name; index in bounds             | `InvalidOptionError` / `PerformanceNotFoundError`, spelled exactly as `selectPerformance` spells it (A17) |
| multi-performance document, no selector                 | —                                                            | `InvalidOptionError` naming the candidates                                                                |
| document with **zero** performances                     | —                                                            | `PerformanceNotFoundError` (C8 — users hand-building neutral documents hit this)                          |
| `k`                                                     | integer, `1 ≤ k ≤ N`                                         | `InvalidOptionError`                                                                                      |
| `embeddingAxes`                                         | integer, `1 ≤ axes ≤ N−1`                                    | `InvalidOptionError`                                                                                      |
| `scape.bins`                                            | integer, `1 ≤ bins ≤ 256`                                    | `InvalidOptionError`                                                                                      |
| `maxItems` / `items.length`                             | integer ≥ 0; `items.length ≤ maxItems`                       | `InvalidOptionError`                                                                                      |
| duplicate labels after expansion                        | —                                                            | `InvalidOptionError` naming every collision and its item indices (A8)                                     |
| `linkage` / `normalization`                             | in their unions (JS callers)                                 | `InvalidOptionError`                                                                                      |
| resolved `qbpm ≤ 0`                                     | —                                                            | `InvalidOptionError` on the document (M11)                                                                |

**An explicitly-set option that cannot be honoured splits by knowability**
(AD-25.1, resolving A10):

- **Unusable given the OTHER OPTIONS alone ⇒ `InvalidOptionError`.** The caller
  could have known without reading a document: `noteDensityWeight: true` with no
  `msm` is the case, and it throws. The expression facade's reason applies
  unchanged — a caller who _set_ the option asked a question, and answering it
  with a full, plausible, differently-weighted report hides a typo behind a
  valid-looking result.
- **Unusable only given DOCUMENT CONTENT ⇒ a typed `option-unusable` note.**
  `invariance: 'level'` on a dimension that turns out to be absent from both
  documents is the case: the caller could not have known when they wrote the
  option bag, so the module degrades and says so, per R7's philosophy.

R7's three-state degradation continues to govern fields the caller did **not**
request.

### 9.5 Determinism of the serialization

- **Key order is pinned** (A9): objects are emitted in schema order, and every
  `Record<ComparisonDimension, …>` is built by iterating `COMPARISON_DIMENSIONS`
  (`Object.fromEntries(COMPARISON_DIMENSIONS.map(…))`, the shipped expression
  precedent), never by iterating a document — a record built by document traversal
  reorders under the a/b swap.
- **Every array has a total order independent of which document is `a`** (A9):
  `parts` by matched `@number` then `@name` (code-unit order, never
  `localeCompare`); `notes` by `(kind, dimension, startQuarters, site)` with a
  stated final tiebreak; `segments` by `(mass desc, start asc, length asc)`;
  `scripts` by `(part, map)`; ops by application index.
- **The a/b swap map is explicit** (A9), and is separate from the **sign-negating**
  fields, which are not a swap: `ppq.a`/`ppq.b`, `dateA`/`dateB`,
  `valueA`/`valueB`, `measureA`/`measureB`, the per-part pairing entries and the
  `document` role on notes and sites swap; `levelSigned`, `meanSigned` and
  `cumulativeDrift.difference` **negate**, `cumulativeDrift.ratio` **inverts**,
  and `direction` maps `'a-greater' ↔ 'b-greater'`.
- **The serializer is pinned**: P-C2 compares `JSON.stringify(report)` with no
  replacer and no indentation.
- `-0` is normalized to `+0` at the report boundary (`x === 0 ? 0 : x`), so
  `Object.is`-based assertions and the JSON round trip agree (A20, AD-21).

### 9.6 Finiteness discipline

Every numeric field is finite or `null`, and the reachable NaN paths are closed by
rule rather than by hope (AD-22, A3):

- `L = 0` (both documents' only instructions at date 0) ⇒ every `mean` is `null`,
  with a typed note. A caller-supplied zero-length window is an
  `InvalidOptionError` instead (§9.4).
- `Σ|λ| = 0` ⇒ `explainedVariance` entries `null` and `embedding.degenerate` true.
- `normalization: 'corpus'` with an empty nonzero set for dimension _k_ ⇒
  `normalizationConstants[k] = null`, `ω_k` falls back to the fixed default,
  stamped.
- `max(a,b) = 0` in the silhouette ⇒ `s(i) = 0`.

P-C11 (§10) walks every result of every fixture pair and of the degenerate
corpora through the same finiteness walker as `tests/api/plain-data.test.ts`.

### 9.7 Config work (A24)

Stated here so W2 does not rediscover it. The new `comparison` eslint zone must
be fenced in **both** directions — `eslint.config.js:35-38` states the rule
itself: _"Fencing only the downward direction would leave the new layer
half-enforced."_ So the zone forbids `**/midi/**`, `**/msm/**`, `**/mei/**`,
`**/musicxml/**`, `**/mpm/**` **with two negations** — `!**/mpm/names.js` and
`!**/mpm/elements/maps/data/bezier.js` — it **permits** `**/expression/**`, and
`'**/comparison/**'` is added to the `forbidden` list of all six existing zones,
the `expression` zone included, since comparison sits above it.
`src/expression/` gains exported members whose only consumer is comparison (§4's
forward `T` maps), deliberately, because they must sit next to the closed forms
they are property-tested against.

The `bezier.ts` carve-out is safe, measured: `package.json`'s `sideEffects` lists
`./dist/mpm/elements/maps/*.js`, and the compiled bezier module is
`dist/mpm/elements/maps/data/bezier.js` — one directory deeper, so the glob does
not match it and it is declared side-effect-free to bundlers; it also imports
nothing, so importing it drags in neither `Mpm.js` nor the map modules whose
`registerMapFactory` side effects are why that list exists.

`vitest.config.ts`'s coverage `include` is a curated list, not a glob over
`src/**`, so `'src/comparison/**/*.ts'` must be named explicitly.

Type names are prefixed to avoid collisions in the single barrel, which already
exports `ReportNote`, `ReportNoteKind`, `SiteRef`, `SiteState` and
`DimensionReport` (A18).

---

## 10. Properties (the test contract)

- **P-C1 identity/canonical**: every number in `compare(A, A)` and
  `compare(A, canonicalMpm(A))` is exactly 0, under `Object.is` after the `-0`
  normalization of §9.5 (A20).
- **P-C2 symmetry**: `compare(a,b)` vs `compare(b,a)` — bit-identical
  `JSON.stringify` output modulo the explicit swap/negation map of §9.5.
- **P-C3 triangle, adversarially** (AD-21, M15): a dedicated fixture family whose
  members pairwise exercise **every former M1 instance** — an unresolvable style
  name, an unmatched part, a present-vs-absent replacement attribute, a
  `timingBasis` mismatch, a renderer-error span — plus M5's shared-date event
  triples, with the three windows asserted equal (or the test run under a
  piece-derived window). The assertion is
  `d(A,C) ≤ (d(A,B) + d(B,C))·(1 + 1e−9)`, per dimension and aggregate —
  **relative, not the additive `+ 3ε` revision 2 carried**. Quadrature error
  scales with the magnitude of the integral, so an absolute epsilon is the wrong
  shape and fails correct code: measured on the Telemann anchors, whose three
  tempo curves are pointwise ordered and therefore sit at the triangle's
  _equality_ case, the slack is 7.3·10⁻⁷ absolute on a quantity of ≈ 5975 —
  1.2·10⁻¹⁰ relative, pure quadrature. Any `3ε` small enough to be meaningful on
  a short window fails on a long one. Revision 1's version additionally drew its
  triples from a corpus run, which shares one window and therefore could not
  express the failures it was meant to catch.
- **P-C3b zero-set transitivity** (AD-21): `d(A,B) = 0 ∧ d(B,C) = 0 ⟹
d(A,C) = 0`. The cheapest possible detector for every M1-class defect; it would
  have caught all four.
- **P-C4 encoding invariance**: a transition re-encoded as dense steps from the
  same curve: semantic distance ≤ the documented staircase bound, shrinking with
  step count, while `diffMpm` cost is large — both pinned in ONE test that states
  the module's central distinction.
- **P-C5 cross-module, in three parts** (AD-6): (i) **exact law** on
  constant-only fixtures for all shared dimensions, with `factors` pinning every
  shape knob to 1, `s > 0`, and monotonicity in **|1 − s|**; (ii) **breakpoint-level
  law** on transition-bearing fixtures, tested on the sampled breakpoint values;
  (iii) a **measured** `d_shape` bound on transitions, pinned as a regression
  anchor rather than asserted to be zero. `s < 0` is outside the claim.
- **P-C6 determinism**: two runs → byte-identical JSON; transposed input →
  mirrored diff script (by construction, §6.4); corpus permutation → permuted
  matrices and a **relabeled dendrogram, and nothing else** — full
  permutation-equivariance, asserted on a deliberately tie-rich corpus (a
  duplicated document, a `both-neutral` dimension) rather than only on tie-free
  inputs, since label-based tie-breaking makes the tied case the interesting one
  (AD-25.2).
- **P-C7 closure**: table residual ≤ 1e−12·D on every fixture pair, and closure
  asserted on a second, arbitrary partition of the window to pin AD-19's
  "any partition" statement.
- **P-C8 neutral-encoding equivalence**: an explicit neutral instruction (rubato
  intensity 1, lateStart 0, earlyEnd 1; asynchrony 0 ms) ≡ absent map: dimension
  distance exactly 0 — exactly, thanks to §5.2's special case (M18) — plus the
  structural note.
- **P-C9 real-data sanity**: Telemann _Grave_ — d(Baroque, Romantic) <
  d(Baroque, Fast) and < d(Fast, Romantic); Vulpius similar; values pinned as
  regression anchors (not as truths).
- **P-C10 registry coverage**: superset-of-expression property; full attribute
  inventory partitioned into rows / inert / exclusions with none missing (R9),
  including `@noteid`, `@loop`, `@stickToMeasures`, `@repetitions`,
  `@note.order`, `frame.offset`, `time.unit`; forward-T agreement
  `T(C(x,s)) = s·T(x)` per space; conditional-liveness rows resolve per element.
- **P-C11 finiteness** (AD-22, A3d): every number in every result of every
  fixture pair and of the degenerate corpora — N = 0, N = 1, duplicated document,
  all-zero weights, both-neutral dimension, zero-mass corpus — is finite or null,
  through the same plain-data walker the expression facade uses.

**Fixture obligations named by the rulings.** Each is a pinned pair or triple
under `tests/comparison/fixtures/` (NEW tree; the immutable
`tests/integration/fixtures/**` is untouched):

- **trailing transition** (AD-8): two documents differing only in a trailing
  `@transition.to` ⇒ `d_tempo = 0` plus an inert-difference note; `all_maps.mpm`
  is the real-corpus witness. Same for dynamics and for a single-`<movement>` map.
- **tempo degenerate table** (AD-9): one fixture per row of §5.1's four-case
  table, plus a skipped-`<tempo>` pair pinning the 100-qbpm orphaned span and a
  pre-first-instruction pair.
- **loop on/off** (AD-10): rubato and accentuation pairs differing only in
  `@loop`, pinning a nonzero distance; plus a `gridTruncated` case.
- **accentuation phase** (AD-12): two documents whose patterns agree and whose
  instruction dates differ ⇒ distance 0; and an MSM-bearing pair pinning the
  forward-only `timeSignatureMap` walk.
- **articulation shadowing and precedence** (AD-11): a `defaultArticulation` +
  explicit-articulation pair pinning shadowing (not addition); an inline
  `relativeDuration` + `absoluteDurationChange` pair pinning that the
  `relativeDuration` is inert; the same attributes on an `<articulationDef>`
  pinning that they compose.
- **imprecision degenerate table** (AD-14): one fixture per row of §5.9's table,
  including the `limit.lower == limit.upper` Gaussian that revision 1 priced at
  distance 0.
- **span proportionality** (AD-14v): the same imprecision difference over a
  one-bar span and over the whole piece, pinning the ratio.
- **shadowing pins** (AD-16): an **empty** part-local map shadowing a populated
  global one; a part header whose `styleDef name="A"` hides the global `"A"`
  while leaving `"B"` visible.
- **movement flat spans** (AD-13): interleaved `sustain`/`soft` in one map,
  pinning the truncated sustain span and the 0.4 curvature default.
- **ornament scale** (AD-15): absent `@scale` ≡ 0.0, pinning that absence
  produces no dynamics effect.
- **plausibility** (C6): the tick-valued `beatLength` case, pinning the note and
  pinning that the distance is unchanged by it.
- **multi-performance** fixtures derived from the official samples, with
  provenance and license note.

---

## 11. Wave plan (compiled from this design)

- **W2 — substrate**: comparison registry + forward `T` in `transforms.ts`
  (including `delta`, `plausibleRange`, the row key vocabulary and the
  conditional-liveness machinery); document reading/normalization (ppq lcm,
  parts, styleScope-routed style resolution, window rule + stamps); curve
  evaluators against the **renderer truths** of §5 — tempo power curve with the
  degenerate table, the skip/pre-first constants and inert trailing transitions;
  dynamics/pedal ideal Bézier; rubato warp with `@loop` gating, clamps and the
  frame cap; step dimensions; the quadrature spec of §5.0 (`u = z^{1/e}`
  substitution, `u*` bracketing, sign-comparison bisection); densities and `d_k`
  for tempo/dynamics/rubato/asynchrony including `⊥` and the capped metric;
  metric-property tests on that subset (P-C3b from the start); the fixture tree
  above. Layer-zone + coverage-include config edits per §9.7.
- **W3 — full pairwise**: remaining dimensions (accentuation with time-signature
  anchoring, articulation with shadowing and liveness, ornamentation with the
  shared aligner and the one functional, imprecision W₁/W₂ with the degenerate
  table, mixture Gaussian and process params, pedal flat spans); aggregation,
  root-refined segments, the closing table on the aggregate density, the
  four-field decomposition on the normalized measure, invariance modes per row,
  the equivalence block, signed descriptors, plausibility and comparability
  channels; `compareMpm` facade + `ComparisonEngineError` + the validation table;
  P-C1..P-C11 complete; the three-part cross-module test.
- **W4 — diff + corpus**: `diffMpm` (DP, sequential pricing, replay verification,
  canonical-order-plus-inversion mirroring; fragment/consolidate after plain
  ops); `compareMpmCorpus` (N² matrices with `n`, UPGMA + linkages, PAM,
  silhouette + reliability flag, MDS/Jacobi with the degenerate guards,
  seriation, profiles incl. signed, corpus normalization with the M19 formula
  written out, `suspectPairs`, the corpus-average pseudo-performance and the
  noise-floor context of AD-26.3); scape opt-in; README section, **glossary**
  (AD-23, C14 — one worked example per decomposition component in performance
  terms) and **cookbook**: the Welte timing-only recipe with the per-space
  invariance trade-off (C9), the neutral-baseline ratio recipe requiring
  `invariance: 'level'` and explaining why `'none'` measures the wrong thing
  (C8), the `boundary_prf` derivation with its non-equivalence caveat (C12), and
  the enumerated **non-goals** paragraphs of §1.4 (plus asynchrony's per-note and
  register limits, C15, and cross-piece comparison of `distance`, C10).
  Four further documentation obligations from the literature (AD-26.4), recorded
  here so they cannot be dropped:
  - **The P1 interpolation answer.** Desain & Honing's standing objection —
    never interpolate between measured events — targets _measured event data_.
    MPM curves are **parametric specifications**, continuous by definition, so
    this module compares shape functions and interpolates nothing. That is
    exactly the representation Todd's kinematic models, Repp's parabolic ritard
    and Molina-Solana's (w, q) fitting all have to _recover_ by fitting, and it
    is free here (survey-lit G5). One paragraph, in the README, before anyone
    raises it.
  - **The G2 framing paragraph.** Performer identity is carried first by
    **articulation and melody lead**, then tempo, with dynamics last (the
    Stamatatos & Widmer 2005 line of work) — and the top two are precisely what
    audio-derived tempo/loudness traditions cannot see and what MPM carries
    losslessly. This is the scientific argument for the module's existence and
    belongs in the README's opening, not in a footnote.
  - **The Hudson earlier-vs-later-rubato recipe.** Hudson's typology is
    definitionally a statement about the relationship between the asynchrony
    channel and the tempo channel, which MPM separates natively; Goebl, Flossmann
    & Widmer (2010) supply the working detector (30 ms threshold plus a
    density-based run criterion). A cookbook recipe that yields "these two
    performances differ mainly in earlier rubato, localised at bars 17–24" speaks
    the historians' language in a way no correlation coefficient does — survey-lit
    calls it the highest-value single deliverable for the Welte use case (G4). If
    the detector is cheap on top of the existing channels, ship it as a derived
    report note as well as a recipe.
  - **Provenance trust profiles as documented weight presets.** A roll-derived
    document's dynamics are unreliable while its note ordering is not (Bausch;
    Hall's six-factor decomposition), and its melody lead is confounded by
    velocity (Goebl 2001; Hagmann's _künstliches Arpeggio_). Ship named weight
    presets — meico export / hand-authored / roll-derived / alignment-fitted —
    as documented data over the existing `weights` and `invariance` knobs, with
    no new mechanism. TimeToAlign's `MatchClaim` certainty field (TISMIR 2026) is
    the citable precedent for encoding provenance-conditioned trust (G7).
- **W5 — audit**: adversarial verification, coverage/lint gates, PARITY note
  (none expected — new module), campaign report, merge `--no-ff`. Plus one
  literature obligation (AD-26.5): **re-sweep 2025–26 ISMIR/TISMIR before the
  README ships the novelty claim** — survey-lit's sweep is complete through 2024
  and explicitly flags PianoBind and "Pianist Transformer" (arXiv:2512.02652) as
  unverified. The claim text is A-Q11's narrow phrasing, citing survey-lit G1
  (no MPM–MPM distance, no MPM-based analytical study, no musical analogue of
  SSIM for any performance representation): **the first exact, additively
  decomposable comparison of symbolic performance-directive encodings**. If the
  sweep finds prior art, the claim narrows or goes; it does not ship unverified.

---

**No open literature slots remain.** survey-lit.md was delivered on 2026-08-10
and AD-26 disposed of all four slots revision 2 carried: the JND values and their
provenance tags are settled in §4 and §7.1 (asynchrony 30 ms [literature],
everything else [convention] with partial support named in the row notes —
AD-26.2); the units question is settled in §5.1 and stamped through §9's result
shapes (natural log internally, `'nepers'` tags, the ×1/ln 2 conversion and the
BPM-as-rate direction pinned — AD-26.1); product priorities produced two new
opt-in corpus enrichments in §8 (AD-26.3) and four W4 documentation obligations
in §11 (AD-26.4); the README framing and novelty claim are settled as A-Q11's
narrow phrasing with a mandatory W5 re-sweep before shipping (AD-26.5); and the
three prohibitions the survey ends on are now §1.4 (AD-26.6). The
evaluation-on-real-corpora design remains W5's own work item, not a literature
gap.

**No open items remain either.** Revision 2's nine flags were disposed of by AD-25
(LOG.md, 2026-08-10) and the resolutions are compiled into the sections above:
the knowability split for unhonourable options (§9.4, AD-25.1); label-based
tie-breaking throughout the corpus products with full permutation-equivariance
restored (§8, §10 P-C6, AD-25.2); the one-option-bag echo confirmed (§9,
AD-25.3); content-derived canonical orientation for the edit path (§6.4,
AD-25.4); the corpus-normalization formula `ω_k = 1 / median(nonzero d_k)`
(§8, AD-25.5); and the three confirmations — five epsilon families (§5.0,
AD-25.6), non-overridable `δ_row`/`κ` (§4, AD-25.7), `ComparisonJndKey`-keyed
`plausibleRange` (§4, AD-25.8) — plus the renderer-asymmetry sentence at the
movement section (§5.8, AD-25.9).
