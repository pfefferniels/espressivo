# Performance Comparison — Design

Status: W1 DRAFT (pre-panel). Compiled from SURVEY.md's adjudications
(A-Q1..A-Q11, A-B1..A-B5, binding) over survey-algo.md, survey-code.md and
notes-conductor.md. Sections marked [PENDING-LIT] await survey-lit and must be
resolved before the W1 panel convenes.

## 1. What "comparing performances" means here

Two MPM documents (or two performances within documents) encode
interpretations of the same piece over a shared symbolic timeline. This module
answers three questions about them, and keeps them separate because they are
different questions:

1. **How far apart are the performances, and where, and in what?** — the
   *semantic* level. Every expressive dimension is evaluated into the function
   over score time that the renderer would perform; distances are computed
   between functions. Two documents that encode the same tempo gesture as one
   continuous transition and as five steps tracing the same curve are CLOSE
   here, by construction.
2. **What sequence of edits turns document A into document B?** — the
   *syntactic* level: a typed edit script over instructions, priced
   semantically (§6). The same two documents are FAR here — and the report
   says so, because the gap between the two levels is itself a finding
   ("differently encoded, near-identically performed").
3. **How does a set of N performances organize?** — the *corpus* level:
   distance matrices, clustering, embedding, all derived from level 1.

### 1.1 The central object: deviation densities

For one pair (A, B) and each comparison dimension `k` (§3), the engine
produces a non-negative **deviation density** `p_k(t) ≥ 0` over the shared,
PPQ-normalized score timeline, measured in **JND units per quarter note**
(§7.1). Everything the module reports is derived from these densities:

- per-dimension distance: `d_k = ∫ p_k(t) dt` (JND·quarters), also reported
  as the piece-length mean `d_k / L` (JND);
- the aggregate: `D = Σ_k ω_k d_k` with fixed documented weights (§7.2);
- ranked deviation segments: maximal-scoring segments of the thresholded
  density (§7.3);
- the **exact attribution table**: for any partition S₁…S_m of the timeline,
  `c_{k,s} = ∫_{S_s} p_k` satisfies row sums = `d_k`, weighted column sums =
  segment contributions, grand total = `D`, with **zero residual** — because
  integration is additive over disjoint intervals and the aggregate is a
  weighted SUM, not a norm. This exactness is the module's headline
  capability; no audio- or MIDI-based comparison can decompose its distance
  by expressive dimension at all, let alone exactly. Every design choice that
  touches the metric is subordinate to preserving it (SURVEY A-Q2).

### 1.2 The interpretive companion: level / gain / shape

One lemma serves twice (survey-algo §2.B.7): for curves in T-space over
`(time, w·dt)` and equally for quantile functions over `([0,1], du)`,

    ‖h_A − h_B‖₂² = (ℓ_A − ℓ_B)² + (σ_A − σ_B)² + 2σ_Aσ_B(1 − r)
                      level           gain            shape

- curves: `d_level` ("is one globally faster/louder?"), `d_gain` ("is one's
  shaping more exaggerated?"), `d_shape` = √(2(1−r)) ("do they shape the same
  way?" — scale- and level-invariant, Sapp's correlation consumed as a
  component rather than offered as a rival metric);
- distributions: the same three terms are the W₂ decomposition
  (location / spread / distributional shape).

This table is L²-family, the headline is L1-family (A-Q4 as amended: W₁ feeds
the aggregate, W₂ feeds this table). The two are **never mixed**: the report
labels the decomposition as an interpretive product whose components do NOT
sum to the headline distance. `r` on a constant window is `null` and the
window marked shapeless — never 0.

### 1.3 Cross-module coherence (Proposition 1)

`exaggerateMpm` acts on T-space curves as `g ↦ c + s(g − c)`. Therefore, for
every dimension the two modules share: exaggeration by `s` leaves `d_shape`
at 0, multiplies gain by |s|, moves level affinely — and
`compare(mpm, exaggerate(mpm, s))` must measure exactly that. This is a
pinned W3 property test and the strongest evidence the two engines are one
mathematics.

## 2. Requirements

From the charter (U1–U6) and the standing constraints (G1–G6), refined:

- **R1 Pure readers.** Text in, plain data out. No input document is ever
  mutated (MPM classes constructed only on `Element.copy()`; the primary
  reading layer is the expression document layer, which never writes).
  No output document exists — this module writes no MPM.
- **R2 Determinism.** Identical inputs yield identical output bytes
  (JSON-serialized reports). No PRNG on any path; imprecision maps are
  compared analytically, never by sampling. All ties broken by documented
  rules (§6.4, §8). Symmetry is bit-exact: `compare(a,b)` and `compare(b,a)`
  agree to the last bit on every number (sorted-union grids, |x−y| cells,
  date-ordered Neumaier summation).
- **R3 Metric honesty.** The *defined* metrics are true (pseudo-)metrics:
  per-dimension `d_k` and any fixed-weight aggregate satisfy identity,
  symmetry, triangle inequality on the space of documents (modulo semantic
  equivalence). The *computed* values are ε-accurate quadrature evaluations
  of the defined objects (target relative ε ≈ 1e−12, stated in the report).
  Pair-dependent normalization is forbidden and unimplemented; corpus-level
  normalization is opt-in and stamps its derived constants into the report.
- **R4 Exact decomposition.** The dimension × segment table closes with zero
  residual (§1.1). Segments partition the timeline (ranked segments + an
  explicit below-threshold remainder row).
- **R5 Level separation.** Semantic distance and edit script are separate
  products with a reported relationship: `scriptCost ≥ d_curve` per
  dimension, slack surfaced as `reworking`. A no-op encoding difference costs
  0 in the script by pricing, not by special-casing.
- **R6 Absence is neutral, not missing.** A map absent on one side compares
  against the neutral curve (identity warp, 0 offset, no-op pattern); the
  dimension is never dropped (a pair-dependent dimension set would break R3).
  The asymmetry is reported as a note.
- **R7 MSM optional.** All core products work from MPM text alone. An
  optional `msm` input adds: note-density weighting option, note-anchored
  articulation resolution against real note lists, and estimate refinements —
  each degrading to a documented default without it, reported as such
  (three-state: value / null "this MSM cannot answer" / not requested).
- **R8 Honest resolution.** Style-name levels resolve through the expression
  styleScope (def / literal / unresolvable); an unresolvable level is
  reported and its span EXCLUDED from that dimension's density (both sides,
  symmetric exclusion — never a fabricated 100.0), with the excluded span
  length in the report. [Rationale: fabricating the renderer default invents
  differences; excluding asymmetrically breaks symmetry.]
- **R9 Full read coverage.** Every numeric attribute of every map/def the
  MPM model carries is either (a) a comparison-registry row feeding a
  dimension, (b) an explicitly inert row (renderer provably ignores it) that
  contributes zero and is reported when it differs, or (c) an enumerated
  exclusion with a one-line rationale. No silent gaps: a W2 test walks the
  full attribute inventory (survey-code §1.2) against the registry.
- **R10 Scale.** N up to ~100 performances, maps up to ~5k instructions:
  O(n²) per pair and O(N²) pairs are acceptable; nothing worse than O(N³)
  total (clustering) without journaled justification.

## 3. Comparison dimensions

The semantic unit is the **map domain**, not the exaggeration knob: a curve
already integrates what expression splits into level and shape knobs (the
tempo curve contains meanTempoAt's effect), and the §1.2 decomposition
recovers the interpretive split analytically. Eleven contributing dimensions:

| dimension | primary object | space of the curve | notes |
|---|---|---|---|
| `tempo` | quarter-bpm curve over score time | log (nepers) | bpm·beatLength·4 normalization; transitions via power curve, exact renderer math |
| `rubato` | displacement curve warp(t)−t | gain, quarters | transliterated cyclic warp; PPQ-normalized |
| `dynamics` | volume curve per part | log (nepers) | Bézier via bezier.ts; sub-note dynamics = what the renderer computes |
| `accentuation` | resolved per-beat accent contribution | gain, velocity units | pattern defs resolved positionally; scale applied |
| `articulation` | per-attribute step/event profiles | per-row space | multi-attribute dimension: rows aggregate in JND units (§7.1) |
| `ornamentation` | date-matched discrete events | per-row space | event matching §5.6; unmatched event = its deviation from neutral |
| `asynchrony` | ms-offset step curve per part | gain, ms | |
| `pedal` | movement position curve + shape | logit? → §5.8 rules | includes @position (read-licenced here though write-excluded in expression D-G) |
| `imprecisionTiming` | distribution-valued curve | native ms | W₁ density; W₂ interpretive |
| `imprecisionDynamics` | distribution-valued curve | native velocity | same |
| `imprecisionDuration` | distribution-valued curve | native (ratio/ms per attribute) | same |

Plus two non-contributing channels:
- **structural findings**: unmatched parts, global-vs-part encoding
  mismatches, renderer-skipped instructions, count mismatches — reported,
  never folded into a distance (A-Q6, A-B2);
- **inert content**: attributes the renderer provably ignores
  (imprecisionMap.tuning today) — zero density, reported when the documents
  differ there (R9b). If a future port renders tuning, the row flips from
  inert to a twelfth dimension without an API break (the dimension list is
  exported data).

Correspondence to the 15 expression dimensions (for the §1.3 test):
tempo⊇{tempo,tempoShape}; dynamics⊇{dynamics,dynamicsShape}; rubato↔rubato;
articulation↔articulation; accentuation↔accentuation;
ornamentation⊇{ornamentSpread,ornamentSpacing,ornamentDynamics};
asynchrony↔asynchrony; imprecision*↔imprecision*; pedal⊇pedalShape.
Exported as a data table so the cross-module test enumerates it rather than
hard-coding it.

## 4. The comparison registry (L0)

Its own table in `src/comparison/registry.ts`, reusing the `ScaleSpace`
vocabulary and shape of `RegistryRow` but NOT extending `REGISTRY_ROWS`
(A-Q9: a read requirement must not widen the write licence). Each row:

    { dimension, attribute, sites, space, valueDomain,   // as expression
      unit: 'nepers' | 'quarters' | 'ms' | 'velocity' | 'cents' | 'ratio'
            | 'dimensionless',
      jnd: number,            // §7.1 constant in `unit`; [literature] or
                              // [convention] tag carried in `notes`
      role: 'curve-level' | 'curve-shape' | 'step' | 'event' | 'distribution'
            | 'process' | 'inert' | 'structural',
      ppqSensitive: boolean,  // tick-valued → rescale by lcm factor (§5.1)
      notes: string }

- Forward maps `T(x)` per scale space are added to **`src/expression/
  transforms.ts`**, next to the closed forms they must agree with (survey-algo
  §5-reuse; a property test pins `T(C(x,s)) = s·T(x)` for every space).
  `log-around-center` collapses to the bare logarithm: the center cancels in
  every difference (SURVEY §1.2).
- **Superset property, tested:** every live expression-registry row has a
  comparison row with the same scale space; every attribute in the full
  survey-code §1.2 inventory appears exactly once across
  rows/inert/exclusions (R9).
- The `jnd` column is [PENDING-LIT] for the perceptual constants; every value
  ships with its tag, and [convention] values are overridable via options
  while remaining the documented default.

Exclusions (R9c) — each with rationale, initial list: `@date` itself (it is
the axis, priced through densities and the edit path's date component, not a
row); `xml:id`/`*.ref` (identity, not quantity); enums and booleans
(articulation styles' non-numeric attributes) — equality checked, difference
= structural finding, since no meaningful magnitude exists; `@seed` (changes
no distribution law; reported as inert-difference).

## 5. Semantic evaluation, per dimension (L1–L3)

### 5.0 Common machinery

- **Timeline.** Dates from both documents are rescaled to `lcm(ppq_A, ppq_B)`
  with integer factors (exact in IEEE754), then reported in quarters. Every
  `ppqSensitive` registry row's value rescales by the same factor; `*Ms` and
  other absolute-time attributes never do.
- **Window.** The comparison window is `[0, end]` with `end` = the MSM score
  end when an MSM is supplied, else the max over both documents of the last
  dated instruction; overridable via `options.window`. One window per
  pair — and one window per CORPUS (§8), so matrix entries are values of one
  function. The window and the rule that chose it are stamped in the report.
- **Densities are measures.** `p_k` = an absolutely continuous part (curves,
  step functions, distribution spans) plus **atoms** at event dates
  (articulation events, ornaments). Cells of the refinement carry both; the
  attribution table sums both; everything still closes exactly. Prose says
  "density" throughout; the report schema calls the atoms `events`.
- **Refinement grid.** Sorted union of both documents' breakpoints for the
  dimension (instruction dates, transition ends, rubato frame boundaries
  enumerated across the window, imprecision span edges), deduplicated
  exactly (integer lcm-ticks). Continuous cells are integrated by fixed-order
  Gauss–Legendre (order 10), subdividing tempo cells with exponent `e < 1`
  (unbounded derivative at cell start), and locating sign changes of
  `g_A − g_B` by bisection (fixed 50 iterations) so |·| never crosses a kink
  inside a quadrature cell. Step cells are integrated exactly.
- **Curve reading is right-continuous** (A-B1): the value at an instruction's
  date is that instruction's value. Divergence from `TempoMap`'s
  strict-before reading is measure-zero and documented.
- **Per-part resolution** (A-Q6): every dimension is evaluated per part
  after global/part map resolution (a part-local map replaces the global one
  wholesale, as the renderer does). A global-vs-part-local *encoding*
  difference with identical resolved curves is distance 0 plus a structural
  note — which is correct: it is not performed. Parts are matched by
  `@number` (with `@name` reported when it disagrees); unmatched parts are
  structural findings, excluded from all densities (never folded in, A-Q6).
  Documents that are global-only on both sides evaluate once, not per part.
- **Unresolvable levels** (R8): a span governed by a style name that
  `styleScope` reports `unresolvable` on EITHER side is excluded from that
  dimension's density on BOTH sides (symmetric), counted in
  `excludedSpans` with total length and cause.
- **Weight.** `w(t) = 1` (score ticks) by default; `w` = MSM note density
  (from the score, never from either performance — symmetric) as an option.

### 5.1 tempo

Curve: `g(t) = ln(qbpm(t))`, `qbpm = bpm · beatLength · 4`. Piecewise per
instruction span: constant, or the renderer's power transition
`bpm₀ + (bpm₁−bpm₀)·u^e`, `e = ln 0.5 / ln(meanTempoAt)`, with the renderer's
degenerate-case collapses to constant (missing/equal `transition.to`,
`meanTempoAt ∉ (0,1)`) transliterated exactly (TempoMap.ts:137-158, 213-223).
A tempo instruction the renderer would skip contributes nothing and is
reported (A-B2). Absent tempoMap ⇒ the renderer's default constant
(100 qbpm) as the neutral curve (R6). Density `|g_A − g_B| / jnd_tempo`.
The millisecond map is NOT the tempo metric (cumulative-drift artifact); a
`cumulativeDrift` descriptor (seconds apart at window end, plus max |Δms|)
is offered as a clearly-labelled secondary output, computed with the
renderer's own Simpson integration on a copied map.

### 5.2 rubato

Curve: displacement `δ(t) = warp(t) − t` in quarters, from the transliterated
cyclic warp (RubatoMap.ts:166-173): within each frame of length `frameLength`
from the instruction's date,
`δ = frameLength·((τ/frameLength)^intensity·(earlyEnd − lateStart) + lateStart) − τ`,
`τ = (t − t₀) mod frameLength`. Frame boundaries join the refinement grid.
Neutral: `δ ≡ 0`. Density `|δ_A − δ_B| / jnd_rubato` (jnd in quarters).
`frameLength` is ppqSensitive. The attribute-level metric for the edit path
prices `(lateStart, earlyEnd)` as L1 on the endpoints (A-Q10), NOT the
joint-trim parametrization (two windows with equal total trim but different
placement are different performances).

### 5.3 dynamics

Curve per part: `g(t) = ln(volume(t))`, volume from constant instructions and
cubic-Bézier transitions evaluated with `bezier.ts` (`tForDate` bisection at
the renderer's own 1-tick resolution; nothing finer than a tick is
meaningful, which bounds the grid from below). Degenerate collapses per
renderer. Levels resolve via styleScope (R8). Neutral: the renderer's
default level. Density `|g_A − g_B| / jnd_dynamics`. Sub-note gradient
attributes belong to `ornamentation`, not here.

### 5.4 accentuation

Resolved object: the per-beat velocity contribution
`scale · patternValue(beatPosition)`, cyclic over the pattern's `@length`
beats. With an MSM: beat positions computed against the time-signature map,
density = exact piecewise-constant `|Δ|/jnd_velocity` over time. Without an
MSM: beat positions inside a pattern cycle are well-defined relative to the
instruction's own cycle; both sides' patterns are compared over the lcm of
their cycle lengths and the mean per-beat |Δ| spreads uniformly over the
governed span — documented as the MSM-less approximation, symmetric by
construction, flagged in the report (`beatsExact: false`). Pattern def
internals (`accentuation@beat/@value/@transition.from/@transition.to`) are
registry rows (gain, velocity units).

### 5.5 articulation

Multi-attribute dimension; every row's profile is a step function (styled,
date-governed defaults via `defaultArticulation` + styleScope) or an atom
(instruction targeting a date / `noteid.ref`). Rows and spaces: relative
factors in log-around-1 (nepers), `absoluteDurationChange` (quarters,
ppqSensitive), `absoluteDurationChangeMs`/`absoluteDelayMs` (ms),
`absoluteDelay` (quarters), `absoluteVelocityChange` (velocity). Atoms match
by `noteid.ref` when both sides carry ids (same score ⇒ shared vocabulary),
else positionally by date (A-B5); matched atoms contribute
`Σ_rows |T(x_A) − T(x_B)|/jnd_row`, unmatched atoms their deviation from
neutral. The replacement attributes `absoluteDuration`/`absoluteVelocity`
(and `detuneCents`/`detuneHz`) have NO neutral: present-vs-present compares
`|Δ|` in native units; present-vs-absent is a structural finding (with MSM:
refined to a real magnitude against the note's own duration — R7 estimate).

### 5.6 ornamentation

Discrete events. Matching: by exact date, then by the alignment DP (§6) —
the event dimensions and the edit path share one aligner, so the semantic
distance and the script are consistent by construction. Matched events
compare their resolved def content row-wise (`temporalSpread@frame.start`/
`@frameLength` as the geometric pair in quarters or ms per v3 unit via
TemporalValue; `@intensity` log-around-1; `dynamicsGradient@transition.from`/
`@transition.to` velocity gain; `ornament@scale` velocity gain — a read row
here despite being write-excluded in expression). Unmatched events cost
their full deviation from neutral (no ornament). v3 note-generating
ornaments: compared by the same attribute rows; the *generated notes* are a
render artifact with per-render random ids and are never compared (R5b
lesson from the expression campaign).

### 5.7 asynchrony

Per-part step curve of `milliseconds.offset`; density `|Δ|/jnd_asynchrony`
(ms). Exact integration.

### 5.8 pedal (movement)

Position curve on [0,1] per controller via the shared Bézier machinery;
controllers matched by name/number, mismatch = structural finding. Space:
**gain on [0,1]** (`unit: 'ratio'`) — NOT logit: 0 and 1 are the most common
authored values and logit sends them to ±∞ for a quantity whose musical
meaning (pedal depth fraction) is already linear. `@curvature`/`@protraction`
shape the curve and are therefore not separate rows at the semantic level
(the curve contains them); they remain rows for the edit path's substitution
pricing, in the same spaces expression assigns (boundary-power-low /
logit(−1,1)).

### 5.9 imprecision (timing / dynamics / duration)

Per domain, the object over time is a probability law, piecewise constant
over instruction spans: uniform `[lower,upper]`, Gaussian(0, sd) truncated to
limits (rejection with escape hatch — modeled as the truncated law; the
escape hatch's leakage is a renderer artifact, noted in docs), triangular
(lower, upper, mode) clipped (atoms at clip values, handled natively by the
quantile representation), or an explicit `distribution.list` (empirical
quantile step function). Headline density: `W₁(law_A(t), law_B(t)) / jnd`
per span — piecewise-polynomial CDF integration, exact, native units.
Interpretive table: W₂'s location/spread/shape three-term decomposition
(closed forms for clean family pairs incl. the ρ-table constants `7√2/10`,
`√(3/π)`; quantile quadrature with breakpoint-aware nodes for
truncated/clipped/list cases; Φ/Φ⁻¹ via Cody/Acklam rational approximations,
hard-coded with re-derivation tests). Correlated families
(`brownianNoise`, `compensatingTriangle`): marginal W₁/W₂ PLUS
`stepWidth.max`/`degreeOfCorrelation` as gain rows in a separate
`processParameters` component, with the explicit statement that the marginal
does not characterize the process (A-B3). `milliseconds.timingBasis`
mismatch between the sides: structural finding, span excluded (no
common basis to compare in). Tuning domain: inert (R9b) until the renderer
reads it.

## 6. The edit path (side channel)

### 6.1 Object and guarantee

Per (part, map type): both instruction sequences date-ordered by the
datedView rules; a DP alignment produces a typed script

    { op: 'insert' | 'delete' | 'substitute',        // W3
          | 'fragment' | 'consolidate',              // W3+ (A-Q5)
      map, part, site: SiteRef-like locator,
      dateA: number | null, dateB: number | null,
      attributes: readonly { name, valueA, valueB, deltaJnd }[],
      cost: number,                                   // JND·quarters
      free: boolean }                                 // cost 0 — encoding-only

sorted by `cost` descending (U2/U3). Ops carry concrete values, so the
script is machine-applicable in principle; an `applyEditScript` writer is
deliberately NOT shipped until a consumer asks (YAGNI; mpm-desk is the
expected asker; journaled as future work).

### 6.2 Pricing

An op's cost is **the change it causes in the dimension's density** (A.6):
for curve maps, the local integral `∫ w·|T(f_before) − T(f_after)|/jnd` over
the affected span (computable with the same quadrature as L2); for event
maps, the row-wise T-space delta plus a date-shift term
`λ_date · |Δdate|` in quarters [convention]. Consequences, all tested:
inserting a renderer-skipped or no-op instruction costs exactly 0 and is
marked `free` (A-B2); consolidating five steps into one transition costs the
area between staircase and ramp; per dimension,
`scriptCost ≥ d_k − ε` with the slack reported as `reworking` — the amount
of re-encoding that separates the documents beyond their performed
difference (Proposition 3).

### 6.3 Verification by replay

After traceback, the engine replays the script against A's curve
representation and reports `replayedDelta` (achieved distance to B). The
report carries the triple (d_k lower bound, scriptCost, replayedDelta) — all
three exact up to quadrature ε.

### 6.4 Determinism

Traceback precedence `substitute > delete > insert`, then lowest source
index; a transposed input yields the mirrored script (pinned test). The DP
prices ops against the original A-context (upper bound on the true
shortest-path cost — stated honestly in docs; the replay makes the bound's
achieved value exact).

## 7. Aggregation, thresholds, segments (L4)

### 7.1 JND units

Every registry row carries `jnd`, the just-noticeable difference in the
row's unit; densities are dimensionless multiples of JND. Values are
[literature] where survey-lit provides a citation, else [convention]; all
overridable via `options.jnd` (partial record, validated keys) while the
defaults stay the documented reference. Initial candidates [PENDING-LIT]:
tempo ln(1.05) ≈ 0.049 nepers; dynamics ln(1.10)?; asynchrony 20 ms;
rubato displacement ~1/16 quarter; velocity ~3 MIDI units. Event atoms are
weighted by per-dimension event constants κ [convention] making one
1-JND event equal κ quarters of 1-JND sustained deviation; default κ = 1.

### 7.2 Weights

`D = Σ_k ω_k d_k`; default `ω_k = 1` for every dimension — the JND
normalization has already made dimensions commensurable, so unequal default
weights would be a second, hidden opinion. Callers pass `options.weights`
(validated keys, ≥ 0, finite); the report echoes the weight vector.
`normalization: 'corpus'` (corpus level only) derives a single constant
vector from the whole matrix and stamps it. Pair-dependent weights are
forbidden and unimplemented (R3).

### 7.3 Segments and the closing table

Threshold `τ = 1` JND (by construction of the units; per-dimension override
possible). Cell scores `w_c·(p_k(c) − τ)` feed Ruzzo–Tompa; its maximal
segments are canonical (no tie rules needed), ranked by integral mass. The
attribution table rows = dimensions, columns = ranked segments + one
below-threshold remainder column; the table CLOSES: row sums = d_k, weighted
column sums = segment contributions, grand total = D, residual 0 (R4, pinned
numerically to ~1e−12·D with compensated summation).

### 7.4 Invariance modes (motivated by the roll literature)

Reproducing-roll corpora carry structural uncertainty: absolute roll speed is
often unknowable (Hall, Pianola Journal 22; Hagmann 1984 — see
survey-lit-welte.md), which multiplies tempo by an unknown constant = adds an
unknown constant in log space. Comparing such sources at face value invents
level differences no scholar can defend. Per dimension,
`invariance: 'none' | 'level' | 'level-gain'`:

- `'none'` (default): density on the raw T-space curves.
- `'level'`: each document's curve is centered by its own window mean before
  differencing. Removes exactly an unknown constant factor (roll speed, an
  unknown volume calibration).
- `'level-gain'`: centered and σ-normalized per document — pure shape
  comparison in L1 form.

All three are metric-safe because the canonicalization is **per-document**
(each document maps to its canonical curve; the distance is computed between
canonicalized objects — a pseudo-metric on originals, never pair-dependent).
The mode is stamped per dimension in the report, and corpus products require
one mode per dimension across the whole matrix (R3). Dimension-selective
comparison (e.g. timing-only, excluding possibly-editorial Welte dynamics —
Hall PJ14, Reinhart PJ16) is `weights: { dynamics: 0, ... }`; a zero-weight
dimension is still computed and reported, only excluded from D and the table's
weighting.

## 8. Corpus level (L5)

- **Input.** `items: readonly { mpm: XmlText; performance?: string | number;
  label?: string }[]`. An item naming no performance in a multi-performance
  document EXPANDS to one item per performance (labels `«docLabel»:«perfName»`)
  — the natural reading of the official multi-performance samples. (Pairwise
  `compareMpm` is stricter: >1 performance and no selector is an
  `InvalidOptionError` naming the candidates.) N ≤ ~100 (R10).
- **One window, one option set, one weight/jnd/invariance vector** for the
  entire matrix (window end = max over items, or MSM end) — every matrix
  entry is a value of ONE function (R3). All stamped in the result.
- **Matrices.** Per-dimension and aggregate, full precision, exactly
  symmetric (each pair computed once in canonical order `sort([i,j])`),
  zero diagonal by construction.
- **Clustering.** Agglomerative via Lance–Williams: `average` (UPGMA,
  default), `single`, `complete`, `weighted`, `ward.D2` (docs state: the
  recurrence is valid on non-Euclidean input, the minimum-variance
  interpretation is not). Ties: merge the lexicographically smallest
  `(min index, max index)` pair; children ordered by smallest contained
  index. Dendrogram as plain data `{ merges: [{left, right, height, size}],
  order }` in the SciPy/hclust convention. Flat clustering: PAM k-medoids
  (medoids are real performances — "the most typical Hofmann"), BUILD/SWAP
  ties by lowest index; silhouette per k as guidance (noisy at N < 20,
  reported with that caveat).
- **Embedding.** Classical MDS: double-centering + cyclic Jacobi (fixed
  sweep order, stop at off-diagonal norm ≤ 1e−12·‖B‖). Report the FULL
  eigenvalue spectrum, explained variance over Σ|λ| (never Σλ⁺), and
  negative-eigenvalue mass as the "how non-Euclidean is this?" figure.
  Eigenvector signs fixed (largest-magnitude component positive, ties by
  lowest index). Seriation = order by first MDS coordinate.
- **Profiles.** Per performance: per-dimension distance to the corpus medoid
  and to the corpus mean-distance — "who is extreme in what" as data.
- **Scape (opt-in, W4+).** Binned multi-scale view (≤256 bins, prefix-sum
  implementation, bin count in the report): per (window center, size), either
  a pair's distance or the corpus argmin/argmax performer (Sapp's variant).
- **`normalization: 'corpus'`**: one constant ω vector derived from the
  matrix (per-dimension median of nonzero d_k), stamped; default remains
  fixed JND weights.

## 9. API (facade, house rules F1/F2/F2a/F5/E2/N1/N4/N5)

Interior `src/comparison/**` (plain `Error` internally); facade
`src/api/comparison.ts`, re-exported from `src/api/index.ts` and
member-by-member from `src/index.ts`. Layer zones and coverage `include`
updated per survey-code §9.4. All entry points take ONE named-parameter
object (two interchangeable MPM texts make positional args a hazard — F5).

```ts
export const COMPARISON_DIMENSIONS = [
  'tempo', 'rubato', 'dynamics', 'accentuation', 'articulation',
  'ornamentation', 'asynchrony', 'pedal',
  'imprecisionTiming', 'imprecisionDynamics', 'imprecisionDuration',
] as const;
export type ComparisonDimension = (typeof COMPARISON_DIMENSIONS)[number];

export interface CompareMpmOptions {
  readonly a: XmlText;
  readonly b: XmlText;
  readonly performanceA?: string | number;   // required if a is multi-perf
  readonly performanceB?: string | number;
  readonly msm?: XmlText;                    // R7: optional refinements
  readonly window?: { readonly start: number; readonly end: number }; // quarters
  readonly weights?: Partial<Record<ComparisonDimension, number>>;   // ≥0 finite
  readonly jnd?: Partial<Record<string, number>>;  // per REGISTRY row key
  readonly invariance?: Partial<Record<ComparisonDimension,
    'none' | 'level' | 'level-gain'>>;
  readonly noteDensityWeight?: boolean;      // needs msm; default false
}
export function compareMpm(options: CompareMpmOptions): ComparisonResult;

export function diffMpm(options: DiffMpmOptions): DiffResult;
// DiffMpmOptions = CompareMpmOptions minus corpus-only fields plus
//   { readonly moves?: boolean }  // fragment/consolidate ops, default true
//   (W3+; plain ops first)

export interface CompareCorpusOptions {
  readonly items: readonly {
    readonly mpm: XmlText;
    readonly performance?: string | number;
    readonly label?: string;
  }[];
  readonly msm?: XmlText;
  // window/weights/jnd/invariance as above — ONE set for the matrix
  readonly normalization?: 'fixed' | 'corpus';       // default 'fixed'
  readonly linkage?: 'average' | 'single' | 'complete' | 'weighted' | 'ward.D2';
  readonly k?: number;                               // PAM clusters; omit = none
  readonly embeddingAxes?: number;                   // default 2
  readonly scape?: { readonly bins: number } | null; // default null
}
export function compareMpmCorpus(options: CompareCorpusOptions): CorpusResult;

// Errors: InvalidOptionError (unknown dimension/jnd keys, non-finite or
// negative weights, bad window, multi-perf without selector);
// PerformanceNotFoundError (same semantics/messages as the expression
// facade); EngineInvariantError (table fails to close, symmetry violated —
// bugs, not caller mistakes). Parse failures surface via parseOrThrow.
```

Result shapes (all plain data, readonly, `null` for absence, JSON-safe;
every numeric finite or null):

- `ComparisonResult.report`: `window` (+rule), `ppq {a, b, lcm,
  fallbackUsed}`, `parts` (pairings + unmatched as structural),
  `dimensions: Record<ComparisonDimension, DimensionComparison>` (distance
  in JND·quarters, mean in JND, state `compared | both-neutral | excluded`,
  excluded spans with causes, event counts, applied invariance),
  `aggregate {distance, mean, weights, normalization}`, `segments` (ranked,
  + remainder row), `table` (the closing attribution matrix, residual
  reported), `decomposition: Record<dim, {level, gain, shape, r} | null>`
  (labelled interpretive, non-summing), `cumulativeDrift {secondsAtEnd,
  maxAbsMs} | null`, `notes` (typed kinds: structural finding, exclusion,
  inert difference, renderer skip, estimate degradation), `epsilon`.
- `DiffResult`: per (part, map) scripts with ops
  `{op, site, dateA, dateB, attributes[{name, valueA, valueB, deltaJnd}],
  cost, free}` sorted by cost desc; per-dimension `{dCurve, scriptCost,
  replayedDelta, reworking}`; the same `notes` channel.
- `CorpusResult`: `labels`, per-dimension + aggregate `matrices` (packed
  row-major, symmetric), `dendrogram`, `medoids/clusters/silhouette | null`,
  `embedding {coordinates, eigenvalues, explainedVariance,
  negativeEigenvalueMass, axes}`, `seriationOrder`, `profiles`,
  `normalizationConstants | null`, `scape | null`, options echo.

## 10. Properties (the test contract)

- **P-C1 identity/canonical**: every number in `compare(A, A)` and
  `compare(A, canonicalMpm(A))` is exactly 0.
- **P-C2 symmetry**: `compare(a,b)` vs `compare(b,a)` — bit-identical
  serialized reports (modulo the a/b field swap).
- **P-C3 triangle**: sampled fixture/corpus triples, per-dimension and
  aggregate, `d(A,C) ≤ d(A,B) + d(B,C) + 3ε`.
- **P-C4 encoding invariance**: a transition re-encoded as dense steps from
  the same curve: semantic distance ≤ documented bound (the staircase area,
  shrinking with step count), while `diffMpm` cost is large — both pinned in
  ONE test that states the module's central distinction.
- **P-C5 cross-module (Proposition 1)**: for clamp-free documents and shared
  dimensions, `compare(mpm, exaggerateMpm(mpm, s))` yields `shape ≈ 0`
  (≤ ε), gain scaled by |s| in T-space, level moved affinely; distance
  monotone in |ln s| where the registry's P5r says `holds`.
- **P-C6 determinism**: two runs → byte-identical JSON; transposed input →
  mirrored diff script; corpus permutation → permuted (not re-tie-broken)
  matrices, same dendrogram topology up to relabeling.
- **P-C7 closure**: table residual ≤ 1e−12·D on every fixture pair.
- **P-C8 neutral-encoding equivalence**: an explicit neutral instruction
  (rubato intensity 1, lateStart 0, earlyEnd 1; asynchrony 0ms) ≡ absent
  map: dimension distance exactly 0, plus the structural note.
- **P-C9 real-data sanity**: Telemann Grave — d(Baroque, Romantic) <
  d(Baroque, Fast) and < d(Fast, Romantic); Vulpius similar; values pinned
  as regression anchors (not as truths).
- **P-C10 registry coverage**: superset-of-expression property; full
  attribute inventory partitioned into rows/inert/exclusions with none
  missing (R9); forward-T agreement `T(C(x,s)) = s·T(x)` per space.

## 11. Wave plan (compiled from this design)

- **W2 — substrate**: comparison registry + forward T in transforms.ts;
  document reading/normalization (ppq lcm, parts, styles, window); curve
  evaluators (tempo power curve + degenerate collapses, dynamics/pedal
  Bézier via bezier.ts, rubato warp transliteration, step dimensions);
  densities + d_k for tempo/dynamics/rubato/asynchrony; metric-property
  tests on that subset; multi-performance fixtures derived from the official
  samples under `tests/comparison/fixtures/` (NEW tree — the immutable
  `tests/integration/fixtures/**` is untouched; provenance + license note
  required). Layer-zone + coverage-include config edits.
- **W3 — full pairwise**: remaining dimensions (accentuation, articulation,
  ornamentation with the shared aligner, imprecision W₁/W₂ + process
  params, pedal); aggregation, segments, closing table, decomposition,
  invariance modes; `compareMpm` facade + errors; P-C1..P-C10 complete;
  cross-module test.
- **W4 — diff + corpus**: `diffMpm` (DP, replay verification, deterministic
  traceback; fragment/consolidate after plain ops); `compareMpmCorpus`
  (matrices, UPGMA + linkages, PAM, silhouette, MDS/Jacobi, seriation,
  profiles, corpus normalization); scape opt-in; README section + cookbook
  (incl. the Welte timing-only recipe).
- **W5 — audit**: adversarial verification, coverage/lint gates, PARITY
  note (none expected — new module), campaign report, merge --no-ff.

[PENDING-LIT] slots: §7.1 JND values + citations; §3 priority notes if the
lit survey ranks products differently; README framing + novelty claim
(A-Q11); evaluation-on-real-corpora design for W5.
