# Performance Comparison — Campaign Log

Append-only. Newest entry LAST. Every entry dated. Decisions marked [DECISION]
are binding until superseded by a later dated entry.

---

## 2026-08-10 — Campaign start

Conductor session opened on user directive (see CAMPAIGN.md Mission). Worktree
`../meico-ts-compare` created on branch `compare-campaign` off main@9974ba3
(the expression-campaign merge). Task board #1–#9 mirrors the wave plan.

[DECISION] Campaign record dir named `comparison/`; interior module will live
in `src/comparison/` unless W1 design finds a better name. Rationale: parallels
`expression/` ↔ `src/expression/`.

[DECISION] W0 runs as three parallel surveys (literature, algorithms, codebase)
by background agents writing `comparison/survey-{lit,algo,code}.md`; the
conductor synthesizes SURVEY.md and keeps design authorship. Rationale:
identical to the expression campaign's W0 shape, which worked; surveys are
independent so parallelism is free.

[DECISION] Presumptive metric foundation is the expression registry's scale
spaces (per-attribute T with musical neutral): local attribute distance
d(x,y) = |T(x) − T(y)| in the same space exaggeration scales. This makes
comparison and exaggeration mathematically coherent (an exaggeration by s
moves every attribute a predictable T-space distance, so the comparison module
can _see_ exaggeration as a uniform dilation — a testable property linking the
two modules). W1 must confirm or amend per dimension; the surveys are tasked
with attacking this presumption.

Agents launched 2026-08-10: survey-lit, survey-algo, survey-code (background).

## 2026-08-10 — W0 progress

survey-algo delivered (comparison/survey-algo.md, task #2 complete). Headline
recommendations received: L1 aggregate over per-dimension deviation-density
integrals (exact dimension × segment attribution); curve-change pricing for
edit ops; separate read-registry superset (not an extension of REGISTRY_ROWS);
Mongeau–Sankoff rejected as metric (alignment, not composable edit distance);
compare tempo CURVE not millisecond map (cumulative drift artifact); UPGMA
default + Ward caveat; pair-level normalization prohibited. Full adjudication
deferred to SURVEY.md synthesis when survey-lit and survey-code land.

## 2026-08-10 — W0 progress (2)

survey-code delivered (comparison/survey-code.md, task #3 complete). Three
findings CONTRADICT the presumptive-plan LOG entry and are provisionally
accepted pending synthesis: (1) expression registry is a write-licence, not
read coverage — comparison builds its own superset registry reusing scale-space
assignments + valueDomain predicates; (2) level distance uses center-free
ln(x/y) (per-document geomean centers would break symmetry; corroborated by
mpmify evaluate.py's bare log2 bpm); (3) curves are the primary comparison
object on real corpora (transition.to in 95/121, 42/43, 100/100 files) —
instruction alignment is the secondary edit-path product. Corpus: 454 real
.mpm files inventoried; only real multi-performance docs are 3/6 official
samples, two blocked by BOM-intolerant Builder → BOM tolerance in
src/api/parse.ts adopted as W2 work item #1. getTempoAt strict-before vs
getDynamicsAt inclusive boundary disagreement flagged for W1 ruling.
tempo_dynamics_spans third <tempo> lacking @beatLength: reader sees 4, curve
evaluator sees 3 — W1 must pick a reading and report the skip.

## 2026-08-10 — W2 item #1: UTF-8 BOM tolerance (task #10, survey-code)

Pulled forward of W1 because it is design-independent and unblocks the only
real multi-performance corpus.

[DECISION] The fix lives in `Builder.build` (`src/xml/XomTypes.ts`), NOT in
`src/api/parse.ts` as the previous entry and the task assignment presumed.
Rationale: `parseOrThrow` receives an already-bound `() => parse(text)` closure
and never sees the text, so normalising there would require changing its
signature AND would still cover only the facade. There are exactly three
`.build(` call sites in `src/` — `XmlBase.ts:56-59` (the Mei/Msm/Mpm classes,
i.e. the whole render pipeline), `expression/mpmDocument.ts:52` and
`expression/msmFacts.ts:80` — and the latter two deliberately bypass those
classes under D-A. `Builder.build` is the single point all three share, so it
is the only place that covers the expression facade and the future comparison
module as well as the pipeline. Verified by grep, not assumed.

[FINDING] The fix is parity-RESTORING, not a divergence. Java hands XOM _bytes_
at every entry point (`XmlBase.java:99,128,162`; `mei/Helper.java:1042,1061`),
and XOM's SAX/Xerces reader consumes a leading `EF BB BF` as the XML 1.0
§4.3.3 / Appendix F encoding signature before the document entity begins. This
port parses a decoded _string_, where the same bytes are a U+FEFF character in
front of the declaration, which `@xmldom/xmldom` refuses fatally. The
divergence was an artefact of characters-vs-bytes, not a decision either side
made. PARITY.md §1 entry `CMP1` records this with the Java citations.

Scope discipline: exactly one leading mark is stripped. Interior U+FEFF is
ZERO WIDTH NO-BREAK SPACE and is preserved; a _run_ of marks is left alone
because the second is content, content before the declaration is an error, and
Java rejects that too — stripping the run would open a divergence while closing
one. One test assumption of mine was wrong and was corrected against measured
behaviour rather than kept: a stray BOM with NO xml declaration is a _non-fatal_
xmldom error (content silently dropped), so only the declaration case threw.

Tests (13 new, no existing test changed): `tests/xml/XomTypes.test.ts` gains 5
Builder cases — BOM'd == un-BOM'd serialization, BOM without declaration, BOM +
single-quoted attributes, interior U+FEFF preserved, exactly-one-stripped.
`tests/api/bom-tolerance.test.ts` is new, 8 cases across all three document
kinds, asserting equality of a downstream product (`canonicalMpm`,
`listPerformances`, `exaggerateMpm`, `performMsm`, `convertMeiToMsmMpm`) rather
than merely that parsing succeeded — a mark that survived into the tree would
parse fine and corrupt the output. Nothing was added under
`tests/integration/fixtures/**` (charter invariant #2); test input is inline.

Gate: `npm run verify` green, 4005 tests (was 3992). `npx eslint` on the three
touched files reports 4 errors, all proven pre-existing by re-running the same
lint with the changes stashed — byte-identical output. The new file has zero.

Real-corpus check: all four BOM-affected official sample encodings now parse;
three of them threw before. Telemann _Grave_ (Baroque/Fast/Romantic) and
Vulpius _Die helle Sonn_ (Baroque/Romantic/Amateur) are readable, so the
campaign's multi-performance inputs are unblocked.

NOT done, per the lead's instruction: no fixture work for the multi-performance
samples. Where comparison fixtures live is a W1 ruling (charter forbids
additions under `tests/integration/fixtures/**`), and the licensing/provenance
of the official samples needs a design-time note.

## 2026-08-10 — W0 synthesis: technical adjudications

SURVEY.md written (technical synthesis complete; §4 musicology pending
survey-lit, still running ~1h). [DECISION] block A-Q1..A-Q11 + A-B1..A-B5
recorded there — binding for DESIGN.md. Notable conductor amendments over the
surveys' own recommendations:

- A-Q4 amended: W₁ (not W₂) enters the L1 aggregate for imprecision;
  W₂'s three-term decomposition goes to the interpretive table. Restores
  one-mathematics-per-table symmetry (headline = L1 family everywhere,
  interpretive = L2 family everywhere) and dissolves survey-algo's
  self-flagged wrinkle.
- A-B1: comparison curves are right-continuous (inclusive at instruction
  dates) — measure-zero divergence from TempoMap's strict-before reading,
  which the two renderer maps don't even agree on between themselves; kills
  the date-0 spurious-default artifact survey-code measured.
- A-B2: renderer-skipped instructions cost zero in the edit path BY
  construction (semantic pricing), appear in the script anyway, and are
  reported — the two levels stay consistent without a special case.

## 2026-08-10 — W1: DESIGN.md draft complete; panel convened

DESIGN.md committed (f29179e), 662 lines: 11 map-domain dimensions,
deviation-density formalization (measures: continuous + atoms), exact
attribution table, L1-headline/L2-interpretive family separation, semantic
edit pricing with replay verification, corpus products, API sketch,
P-C1..P-C10, wave plan. [PENDING-LIT]: JND constants, product priorities,
novelty claim, W5 evaluation design.

[DECISION] Invariance modes added (§7.4): per-dimension
'none'|'level'|'level-gain' via PER-DOCUMENT canonicalization (metric-safe —
never pair-dependent). Motivated directly by the Welte fidelity literature
(roll speed structurally uncertain ⇒ level-invariant tempo comparison is a
musicological requirement; archived in survey-lit-welte.md). Zero-weight
dimensions remain computed+reported, excluded only from D.

[DECISION] W1 panel convened NOW, before survey-lit closes, because the
structural design is lit-independent; a focused second pass will cover
lit-dependent slots if the lit survey moves anything. Four lenses:
math-rigor, renderer-fidelity, api-house-rules, consumer-musicology.
Findings → REVIEW-FINDINGS.md verbatim; conductor adjudication binding.

## 2026-08-10 — W1: panel adjudication AD-1..AD-24 [BINDING]

All four lenses delivered (90 findings; archive: comparison/panel/*, index:
REVIEW-FINDINGS.md). Rulings below are binding; DESIGN.md rev 2 is compiled
from them. Finding IDs refer to panel files. NO finding is rejected; where a
lens offered alternatives the chosen branch is stated.

AD-1 (R2, R21, R24, M1a — semantic ground truth). The semantic level
evaluates THE FUNCTION THE RENDERER PERFORMS. Unresolvable tempo/dynamics
levels resolve to the renderer's own fabricated constant (100.0), reported as
a `renderer-default-level` note — R8's exclusion rule is REVERSED (it imported
a write-side constraint into a read-side product). Spans where the renderer
has NO performed value (accentuation pattern-name failure = render abort, R21;
asynchrony NaN poisoning, R24) read the distinguished value ⊥ (AD-2), reported
as `renderer-error` notes. No span is ever excluded from the domain.

AD-2 (M1, M11, R21, R24 — total domain, capped local metric). The local
metric on every row is d_row(x,y) = min(|T(x)−T(y)|, 2·δ_row), with
d_row(x,⊥) = δ_row, d_row(⊥,⊥) = 0. δ_row is registry data in JND units,
default 10 [convention]. This (i) truncation preserves the metric axioms,
(ii) makes T's ±∞ boundary values (curvature=1, protraction=±1) finite
without a separate clamp, (iii) gives no-comparable-value cases a metric-safe
price, (iv) keeps the density total so R4's exact decomposition is untouched.
Cap events are reported (`capped` note kind). Instances: absolute replacement
attributes present-vs-absent (narrowed by R14 to absoluteDuration/
absoluteDurationMs/absoluteVelocity), renderer-error spans.

AD-3 (M1b, A-Q6 completion — parts). Unmatched parts are NOT excluded: they
compare against the neutral curve (R6 applied to parts), reported as
structural notes. Document-level aggregation rule: SUM over the union of both
documents' parts (matched pairs + unmatched-vs-neutral). MSM note-count
weighting remains an option and is piece-derived, hence metric-safe.

AD-4 (M2, M10iv — the window). Metric guarantees are conditional on a
PIECE-DERIVED window: MSM score end, explicit options.window, or the
corpus-shared window. The no-MSM pairwise fallback (max last instruction
date) is retained for convenience and stamped `windowRule: 'pair-derived'`,
`metricGuarantee: 'window-restricted'`; docs state such numbers must not be
assembled into matrices. d_k/L mean carries the same caveat. Invariance
modes additionally require a piece-derived/corpus-shared window for R3.

AD-5 (M3 — sequential edit pricing). scriptCost = Σ_i ‖Φ(M_i) − Φ(M_{i−1})‖₁
over the script applied in date order (M_0 = A, M_n = B). scriptCost ≥
d_curve and reworking ≥ 0 become THEOREMS (L¹ triangle inequality).
`free` = zero SEQUENTIAL cost. replayedDelta = the sequential total (the
verification quantity); the reported triple is (d_k, scriptCost as DP
estimate, replayedDelta as achieved). R6-renderer interplay: inserting a
skipped tempo instruction is NOT free (it re-times the orphaned span at 100
qbpm, AD-9) — the sequential price gets this right automatically.

AD-6 (M4 — corrected Proposition 1). Exaggeration acts multiplicatively in
T-space AT ROW VALUES (breakpoints); renderers interpolate in raw space, so
the affine curve law holds exactly only for piecewise-constant spans. P-C5
splits: (i) exact law on constant-only fixtures (factors pinning every shape
knob to 1, s > 0, monotone in |1−s| — NOT |ln s|); (ii) breakpoint-level law
on transition-bearing fixtures; (iii) measured d_shape bound on transitions
pinned as regression anchor. s < 0 excluded from the invariance claims
(r = −1 there).

AD-7 (M5, M17, R16 — events). No exact-date pre-pinning: the alignment DP
(monotone, unbalanced, neutral-gap costs) IS the semantic event distance, and
its objective INCLUDES λ_date·|Δdate| (one functional, stated in §5.6).
Opportunistic id-pinning stays (transitive ⇒ metric-safe). Matched events at
different dates: mass spread uniformly over [min(dA,dB), max(dA,dB)] (M17
option ii — symmetric, table closes, λ_date visible in the timeline). Atoms
charge to the span they open (right-continuous, R27). noteid-targeted
articulations (attribute is `noteid`, value `#`-stripped, note-anchored):
without MSM compared by id with datePositionKnown: false; with MSM placed at
the note's date; unresolvable ids dropped as the renderer drops them (R16).
κ carries units of quarters (M17).

AD-8 (R1 — trailing transitions). An instruction with no successor of its
map-relevant kind performs as a CONSTANT; its transition/shape attributes are
inert (reported as inert differences when they differ). No synthetic
transition end at the window end. Fixture pinned (all_maps.mpm tail is the
real-corpus witness). Movement: the LAST movement entry contributes no span
at all; single-movement maps render nothing (R9).

AD-9 (R6, R11, R10 — tempo curve truth). (i) A skipped <tempo> (missing
@bpm or @beatLength) ends the previous span; [skipDate, nextValid) performs
at 100 qbpm; same constant on [0, firstValid). Both in curve + grid. The
renderer's absolute-time quirk (non-monotone ms) is reproduced ONLY in the
renderer-Simpson cumulativeDrift secondary, never in the tempo curve.
(ii) Pre-first-instruction defaults per dimension are part of the neutral
spec: tempo 100 qbpm, dynamics velocity 100 (R11). (iii) Degenerate table
(R10): equal transition.to ⇒ constant at bpm; meanTempoAt ≤ 0 ⇒ constant at
TRANSITION.TO; meanTempoAt ≥ 1 ⇒ constant at bpm; meanTempoAt absent ⇒
linear ramp (e = 1). Each pinned by fixture.

AD-10 (R3, R25 — loop gating). @loop (default FALSE) gates cyclic repetition
in rubato AND accentuationPattern: off ⇒ one frame warped/applied, identity
after. @loop leaves the boolean-exclusion bucket and both curve evaluators.
Loop=true frame-boundary count capped: min(⌈span/frameLength⌉, cap),
cap [convention] with `gridTruncated` note when it bites.

AD-11 (R4, R5, R15 — articulation truth). (i) Inline <articulation> duration
levers do not compose: exactly one tick row is live per atom
(INLINE_DURATION_PRECEDENCE: absoluteDurationChange > relativeDuration >
absoluteDuration; none when absoluteDurationMs present); on <articulationDef>
they compose. The registry gains conditional-liveness machinery (R9's inert
concept, applied per element). (ii) Atoms SHADOW the styled default at their
dates (never add); default step function includes cancel-to-null switches and
unresolvable-switch carryover. (iii) absoluteDurationChange priced on its raw
value, documented as a document-level quantity; MSM refinement hook noted
(the halving loop is note-dependent).

AD-12 (R8 — accentuation truth). The MSM-less approximation is DROPPED: the
renderer's no-time-signature answer is exact (tsDate 0, 4/4, ticksPerBeat =
ppq, patternLengthTicks = length·4·ppq/denominator); with MSM, walk the real
timeSignatureMap forward-only. Phase anchors at the TIME SIGNATURE, never the
instruction. Honour @stickToMeasures (default true) and @loop (default
false). Pattern interpolation = AccentuationPatternDef.getAccentuationAt
verbatim including the segment-end asymmetry, 0 before the first
accentuation, value-on-beat exactness. timeSignatureSource reported.

AD-13 (R9 — movement truth). Flat span structure (next <movement> of ANY
controller ends a span), spans tagged with their controller; curvature
default 0.4 (NOT dynamics' 0.0); missing @position inherits previous
@transition.to (entry 0 never examined ⇒ 0); predecessor without
@transition.to ⇒ instruction skipped; negative dates skipped.

AD-14 (R7, R12, R13, M13, M14, R26 — imprecision truth). (i) Degenerate
table keyed on attribute presence: absent limits ⇒ uniform/brownian δ₀;
absent clips ⇒ triangular/compensating δ₀; gaussian without limits ⇒
UNtruncated law; absent deviation.standard ⇒ δ₀. (ii) Spans end at the next
map entry of ANY kind; gaps are δ₀ spans. (iii) timingBasis: i.i.d. families
compare marginals, basis difference = inert note; correlated families fold
basis into processParameters as a numeric row (no exclusion anywhere).
(iv) Gaussian modeled as the exact mixture (1−q^N)·TruncNormal + q^N·Normal,
N = 10000 (kills the 0/0, degrades correctly). (v) Density = W₁ between the
laws prevailing at t, per quarter — duration-proportional; survey-algo's
per-span normalization is superseded; fixture pins proportionality.
(vi) §5.9 states it compares the DECLARED law (chord-shake mixture is a
render-path artifact outside the reader's object, R26).

AD-15 (R14, R19, R28, R29 — inventory corrections). detuneCents/detuneHz →
inert bucket (written to notes, read by nothing — verified). ornament@scale:
linear velocity-unit row with NEUTRAL 0.0 (not a log gain; absent ≡ 0.0
produces no effect; v2 writer/reader asymmetry noted for fixtures).
@repetitions (−1 = fill-frame extension) and @note.order (two v2/v3 read
paths) become rows. `noteid` named explicitly in the exclusion walk (not
covered by *.ref); accentuationPatternDef@length parse-mutation noted for
fixture handling.

AD-16 (R17, R18, R22, R23 — remaining §5 truths). subNoteDynamics: mechanism
switch = structural finding with stated rationale; inert on the last
instruction; leading sub-note span leaves earlier notes velocity-less
(noted). Dynamics curvature/protraction defaults 0.0 + input clamps stated;
movement's differ (AD-13). v3 `%` values: third unit case — %-vs-% compares
in percent, %-vs-absolute is structural without MSM / resolved with one.
Shadowing: maps wholesale, styleDefs whole-def-by-name via styleScope route
(mandatory). Rubato: skipped (frameLength-less) instruction terminates the
previous span leaving a neutral gap WITH breakpoint; defaults 1.0/0.0/1.0 =
identity; boundary clamps applied BEFORE evaluation.

AD-17 (M6, M7, R20 — quadrature spec). Tempo cells: substitution u = z^(1/e)
makes the integrand smooth for ALL e (both singular ends die); interior
sign-change bracketing at the closed-form critical point u* per cell, then
bisection on monotone branches. Dynamics/pedal: the DEFINED curve is the
ideal cubic Bézier (smooth); GL-10 converges; tForDate's 1-tick staircase is
the renderer's approximation OF that object and is used only in replay;
divergence bound documented. epsilon becomes a per-family record in the
report (step: exact; tempo: quadrature; imprecision: special-function;
drift: renderer-Simpson).

AD-18 (M8 — decomposition measure). Decomposition computed on normalized
dμ = w dt/∫w; headline on unnormalized w dt; both named. Report four fields
(level, gain, shape|null, r|null) + the closing identity check with
"shape term := 0 when σ_Aσ_B = 0" convention; sqrt-vs-squares stated.

AD-19 (M9 — one canonical table). Segment columns from the AGGREGATE density
p_D = Σω_k p_k vs τ_D = Σω_k τ_k; per-dimension segment lists are secondary,
non-closing products. Cell score = (mass in cell) − τ·w(cell) (atom-correct;
zero-width cells correct). Roots of p_D − τ_D join the grid for the segment
pass (reusing AD-17 machinery). Ranking: mass desc, tie by earliest start,
then shortest. Closure holds for ANY partition (stated plainly — the
thresholding only selects which partition is reported). Zero-weight
dimensions: excluded from p_D (weight 0) but their d_k rows still reported
(table closes over weighted rows).

AD-20 (M10, M12 — invariance + weights). Invariance defined per curve-valued
ROW (dimension's mode applies to all its curve rows); distribution
dimensions: 'level' = location shift of the law (subtract span-weighted mean
of means); event dimensions: 'level'/'level-gain' is InvalidOptionError.
'level-gain' with σ = 0 ⇒ canonical 0 curve + shapeless mark. ω = 1 default
kept but justified honestly (it weights dimensions as JND-integrals, which
have different row counts); row-aggregation rule = SUM stated in §3;
per-row breakdown reported.

AD-21 (M15, M16, M18, M19 — properties). P-C3 gains adversarial fixture
families exercising every former M1 instance + P-C3b zero-set transitivity.
Edit path computed once in canonical order sort([labelA, labelB]) and
INVERTED for the mirror (mirroring true by construction). −0 normalized to
+0 before serialization. Degenerate-corpus guards: N=1, all-equal, zero-mass
⇒ nulls per A3's discipline.

AD-22 (A1–A25 — API). All repairs adopted as proposed. Highlights:
jnd keys = `${dimension}/${element}@${attribute}`, exported closed vocabulary
COMPARISON_JND_KEYS + compile-time type; ComparisonSettings shared interface
extended by both option types; scape?: without null; finiteness discipline
(L=0 ⇒ mean null; Σ|λ|=0 ⇒ explainedVariance nulls + degenerate flag; empty
nonzero set ⇒ normalizationConstants[k] null with fixed-ω fallback) + P-C11
plain-data/finiteness walker property; matrices full row-major N² with `n`
field and pinned bit-symmetry; errors carry document identity ('a'|'b'|item
index) — new typed classes extending MeicoError, no EngineInvariantError
reuse (A15): ComparisonEngineError added; corpus labels required unique after
expansion (InvalidOptionError on duplicates; defaults defined); serialized
key order pinned (schema order; dimension records in COMPARISON_DIMENSIONS
order — A9); P-C6's corpus clause weakened to matrix permutation-equivariance

- dendrogram equality on tie-free inputs, index-tie dependence documented
  (A7); options echo excludes document texts (A12); dimension-set stability
  promise corrected to "additive, breaking for Record consumers, major-version
  note" (A13); DiffMpmOptions/DiffResult fully declared incl. provenance
  (A14/A19); explicitly-requested-but-unusable options get typed notes (A10);
  msm presence stamped (A11); window validated start<end finite ≥0, and
  consistency with §5.0 stated (A16); performance selector validation mirrors
  expression facade incl. index bounds (A17); no name collisions in the barrel;
  SiteRef-like replaced by a declared ComparisonSiteRef (A18); validation and
  parse order contract stated (A23); exact eslint zone text + verified
  sideEffects note for bezier.ts (A24); COMPARISON_DIMENSIONS frozen (A25).

AD-23 (C1–C17 — products). All repairs adopted. Highlights: opt-in profile
export (grid, both T-space curves, density; per-dimension; step-capped) —
C1; signed integral + per-segment meanSigned as DESCRIPTORS never distances
— C2; measure mapping from MSM (three-state) — C3; segments carry
{mass, peak, mean, length, start, end} — C4; ops carry application index AND
cost rank — C5; plausibleRange per registry row + plausibility notes (the
Hofmann-roll defense) — C6; same-piece heuristic + suspectPairs — C7;
neutral-baseline recipe in cookbook + defined semantics of comparing against
a minimal MPM — C8; per-dimension invariance-applicability documented — C9;
mean (JND) is the human headline, D the mathematical total, both reported,
docs say which is which — C10; equivalence block (above-threshold length
fraction etc., the anti-ruler statement as data) — C11; opCounts per
(part,map) + boundary_prf cookbook with non-equivalence caveat — C12; drift
{secondsA, secondsB, difference, ratio, maxAbsMs} — C13; glossary docs
obligation in W4 — C14; asynchrony non-goals paragraph (melody lead,
two-zone) — C15; `b` optional defaulting to `a` (within-document comparison
of two performances) — C16; R10 scale raised to N ≤ 256 to cover the Daten
corpus (121) — C17.

AD-24 (process). DESIGN.md rev 2 is compiled from AD-1..AD-23 by a
dedicated rewrite agent under conductor review; the panel reports are the
diff record. survey-lit remains open for JND values ([PENDING-LIT] tags
stay); the JND defaults ship [convention] if the lit survey cannot ground
them.

## 2026-08-10 — W2 item #2: comparison fixtures + provenance (task #11, survey-code)

Acting on the W1 ruling that comparison fixtures live in a new tree. Created
`tests/comparison/fixtures/` with 11 vendored files (6 .mpm + 5 paired .msm,
~308 KB) — the complete XML half of the MPM format's own sample-encoding
corpus. `tests/integration/fixtures/**` untouched (charter invariant #2).

[FINDING] LICENCE VERIFIED, VENDORING PERMITTED — no blocker, so I proceeded to
commit as authorised. Upstream https://github.com/axelberndt/MPM publishes
under BOTH BSD 2-Clause ("Copyright 2020 Axel Berndt") AND CC BY 4.0. Verified
twice: the LICENSE file in the local checkout (a fork, pfefferniels/MPM at
b9c9707) and the same file fetched from upstream master. Upstream README
"License Information" states it in prose. Both are permissive, non-copyleft,
no share-alike; both require only notice retention + attribution, which
`fixtures/PROVENANCE.md` discharges in full (BSD notice/conditions/disclaimer
quoted verbatim; CC BY creator, notice, licence link, disclaimer, and an
explicit "unmodified" statement).

[NOTE, pre-existing, not created by this item] espressivo itself has NO LICENSE
file and no `license` field; README §License says meico is GPL v3, this port is
a derivative, and the licence decision is "pending an explicit decision by the
repository owner". That gap is unaffected here: BSD-2 is GPL-compatible, CC BY
4.0 is one-way compatible with GPLv3, and these are test DATA — parsed by the
suite, never linked, and excluded from the published package by package.json's
`files` list (dist, src, PARITY.md only). Flagging for the owner, not blocking.

[DECISION] Files are byte-faithful; only NAMES were changed (lowercase-hyphen
ASCII, since the originals carry spaces/commas/mixed case). Contents verified
with `cmp` at copy time and SHA-256 of all 11 recorded in PROVENANCE.md. The
UTF-8 BOM on three files is PRESERVED deliberately: it is the exact byte
pattern that made them unparseable before 4211f58, so keeping it turns these
into a regression pin for BOM tolerance against real data rather than a
synthetic string. PROVENANCE.md carries an explicit do-not-reformat policy.

Corpus: telemann-grave (3 perf: Baroque/Fast/Romantic, BOM, ppq 720 — the
primary fixture), vulpius-die-helle-sonn (3 perf: Baroque/Romantic/Amateur,
BOM, ppq 480), albert-du-mein-einzig-licht (2 perf: Axel Berndt / "Like a
robot" — expressive vs deadpan, no BOM, so it controls for the BOM variable),
bach-bwv1007-minuet2 (1 perf, densest articulation at 204, BOM, ppq 480),
aller-augen (1 perf, the only file with substantial xml:id coverage at 60),
minimal.mpm (589 B, no maps — the degenerate case). Both tick grids (720 and 480) are represented, which the cross-ppq normalization work will need.

Tests: `tests/comparison/fixtures.test.ts`, 27 assertions. Per fixture — BOM
present/absent exactly as vendored (guards the byte-faithfulness policy
itself), performance names in document order via listPerformances, canonical
round-trip with no stray U+FEFF plus idempotence, and the declared ppq. Plus
three corpus-level tests: at least two genuinely multi-performance documents,
both tick grids present, and every fixture still parsing with the BOM removed
(tolerance, not dependence). Kept to parsing + listPerformances since no
comparison engine exists yet.

[DECISION] Added `tests/comparison/fixtures/` to `.prettierignore`, mirroring
the existing `tests/integration/fixtures/` entry. Two reasons, both hard:
Prettier infers no parser for .mpm/.msm and ERRORS on them, so `format:check`
over the repo would have started failing; and a reformat would destroy the
BOM and single-quoted attributes these fixtures exist to pin.

Gate: `npm run verify` green, 4032 tests (was 4005). eslint and prettier clean
on the new test file. One self-inflicted lint error was caught and fixed rather
than suppressed — a literal U+FEFF inside a RegExp trips
`no-irregular-whitespace`; replaced with a startsWith/slice that also mirrors
the implementation under test.

Not copied, deliberately: the .mp3 renderings, .pdf/.png scores, .mid, one
.mei and the MPM-Toolbox .mpr project files. None is needed to compare
performances and the audio/scores are large; source path is recorded so a
later item can fetch them.

## 2026-08-10 — W1: flag resolutions AD-25 [BINDING]

design-rewrite delivered rev 2 (2222 lines) with 9 flags. Rulings:

AD-25.1 (flag 1, A10): split by knowability. An option unusable given the
OTHER OPTIONS alone (noteDensityWeight without msm) is InvalidOptionError —
the caller could have known. An option unusable only given DOCUMENT CONTENT
(invariance 'level' on a dimension absent from both documents) degrades with
a typed note per R7's philosophy.

AD-25.2 (flag 2, A7): REVERSED to the panel's second option — label-based
tie-breaking everywhere in corpus products (lexicographic label order for
merge ties, PAM ties, eigenvector sign ties; labels are already required
unique). P-C6's corpus clause is RESTORED to full permutation-equivariance:
permuting items permutes matrices and relabels the dendrogram, nothing else.

AD-25.3 (flag 3, A12): confirmed as transcribed (one option bag; echo
enumerates scalar fields, never document texts).

AD-25.4 (flag 4): canonical orientation for the pairwise edit path is
CONTENT-DERIVED: compare the canonical serializations (canonicalMpm bytes of
the selected performance's document, then the performance selector as a
string) lexicographically; equal bytes ⇒ identical documents, orientation
irrelevant. Deterministic, no labels needed.

AD-25.5 (flag 5, M19): corpus normalization is ω_k = 1 / median(nonzero
d_k over the matrix), i.e. dimensions are rescaled so their median nonzero
distance is 1; empty nonzero set ⇒ ω_k = fixed default and
normalizationConstants[k] = null. Written out in §8.

AD-25.6 (flag 6): APPROVED — five epsilon families (step, tempo, bezier,
imprecision, drift); the bezier family's error model is the ideal-curve
divergence, correctly split from tempo's substitution quadrature.

AD-25.7 (flag 7): APPROVED — δ_row and κ are non-overridable documented
constants in v1 of the module; revisit on consumer demand.

AD-25.8 (flag 8): APPROVED — plausibleRange keyed on ComparisonJndKey.

AD-25.9 (flag 9): both rules stand as ruled; DESIGN gains one sentence at
the movement section noting the trailing-instruction asymmetry (tempo/
dynamics constant vs movement no-span) is the RENDERER's own asymmetry,
with both code citations, so no future editor "fixes" it.

## 2026-08-10 — W0 closed: survey-lit delivered; lit adjudication AD-26 [BINDING]

survey-lit.md landed (2,600 lines, verified-per-item standard, honest §7
unverified list; the resumed agent triaged exactly as instructed). SURVEY.md
§4 filled. Rulings on its lessons:

AD-26.1 Units: internal T stays NATURAL LOG (coherence with expression
transforms is a design invariant; JND normalization makes distances
base-free). Every reported log quantity carries an explicit unit tag
('nepers'); docs give the log₂ conversion and pin BPM-as-rate direction
(L2/L3).
AD-26.2 JND registry tags: asynchrony 30 ms [literature]; all other
defaults [convention] with survey-lit's partial support cited in row notes.
[PENDING-LIT] markers in DESIGN close accordingly.
AD-26.3 §8 corpus enrichments: optional corpus-average pseudo-performance
item (L15); per-piece percentile/noise-floor context on pair distances in
corpus reports (L10); both opt-in, plain data.
AD-26.4 Docs obligations added to W4: the P1 interpolation answer (curves
are specifications, not interpolated measurements — G5's argument); the G2
framing paragraph; the Hudson earlier-vs-later-rubato recipe (G4, W4
cookbook; a derived report note if cheap); provenance trust profiles as
documented weight presets citing TimeToAlign MatchClaim certainty (G7).
AD-26.5 README novelty claim: the narrow claim as A-Q11 phrased it,
citing G1; W5 MUST re-sweep 2025–26 (PianoBind, arXiv:2512.02652) before
shipping it.
AD-26.6 Non-goals paragraph gains the survey's three prohibitions (quality
judge, perceptual model, single number — with the Peter et al. 2023 and
Liebman et al. 2012 citations).

W0 is now fully closed (tasks #1, #4). W2 in flight (w2a registry/config,
survey-code document layer).

## 2026-08-10 — W2b: comparison document layer (task #13, survey-code)

`src/comparison/` document layer landed. Seven modules, 44 tests, no curve
evaluation and no densities (W2c), no `src/api` change, no registry dependency.

[DECISION] Module layout (the brief left it to me): `ppq.ts` (grid + lcm),
`values.ts` (⊥ marker + renderer-default level), `spanEnds.ts` (span law as
data), `parts.ts` (scopes, wholesale map resolution, matching), `window.ts`
(precedence + stamps), `errors.ts` (interior throws), `document.ts`
(orchestrator `readComparisonPair`). Small modules over one file, matching the
expression module's granularity; each is independently testable and the two
shadowing rules end up in visibly different files, which is the point.

[DECISION] NO registry dependency at all, so w2a and w2b are order-independent.
The brief allowed a type-only import from `./registry.js`, but at the time I
started that file did not exist and a type-only import of a missing module
fails `tsc`, which is in the verify gate. Nothing in a document layer needs a
registry row: rows are about attributes and scale spaces, which is W2c's
question. w2a's registry.ts landed in the shared worktree mid-item and the
final verify covers both.

[DECISION] Interior error classes (`errors.ts`) extending `MeicoError` from
`src/xml/errors.js`, NOT the facade's `InvalidOptionError` /
`PerformanceNotFoundError`. §9.4 assigns exactly this split — "the interior owns
the domain validators … and the facade wraps their throws in
`InvalidOptionError` with `{ cause }`" — and an interior import from `src/api`
would be an upward dependency against RULE M1. Each class carries structured
fields (`role`, `candidates`, `selector`) so W3's facade can build the
role-prefixed message without parsing a string back apart.

Renderer fidelity, verified by negative control rather than asserted:

- Reversing the map-shadowing order fails exactly the empty-map-shadows test.
- Reverting AD-1 (unresolvable level → NaN instead of 100.0) fails exactly the
  three renderer-default tests, including the one pinning that `volume="?"` and
  `volume="100"` agree.
  Both controls were run by patching, testing and restoring; neither test passes
  for the wrong reason.

[DECISION, needs conductor confirmation] A `<part>` missing `@number`,
`@midi.channel` or `@midi.port` is EXCLUDED from matching, not compared against
neutral. `Part.parseData:90-105` throws on it, `Part.createPart` returns null
and `Performance.parseData:213-219` continues past it, so nothing in it is ever
performed; comparing it against neutral would charge a document for material
the renderer discards. §5.0 states the governing principle for the neighbouring
case in so many words — a difference that "is not performed" is distance 0 plus
a structural note — so this follows the design rather than extending it, but
R6's "unmatched parts are compared against the neutral curve" does not
distinguish the two cases and the conductor may want it spelled out.

OPEN QUESTIONS for the conductor (implemented as noted, all one-line changes):

1. §5.0 lists the MSM score end ABOVE `options.window` in the precedence chain,
   so an explicit window is ignored when an MSM is supplied. Implemented as
   written. Most option systems let the explicit value win, and §9.4's
   knowability split would make the ignored window an `option-unusable` note
   rather than a silent override. Confirm the ordering is intended.
2. A21 says `ppq.fallbackUsed` means "exactly one thing: a document declared no
   `@pulsesPerQuarter`". A document that declares an UNUSABLE one
   (`pulsesPerQuarter="lots"`, or `"0"`) is neither that case nor usable.
   Implemented as a third state — value falls back to 720, `declared` stays
   true, and the raw text is carried as `unusableDeclaration` — so the A21
   stamp keeps its exact meaning. Needs a home in the §9.3 report shape.
3. Parts with no usable `@number` cannot be matched. Implemented as one
   unmatched row each, A-side block before B-side block so the order is
   symmetric under swapping the documents (R2). Not specified anywhere.
4. `b` omitted with two performances in `a` and no selectors still raises the
   ambiguity error. §9.2 says the multi-performance-without-selector error
   "still covers the ambiguous case"; a two-performance document is arguably
   unambiguous. Kept strict.

Gate: `npm run verify` green, 92 files / 4093 tests (was 4032; +44 mine, the
remainder w2a's in-flight registry and forward-T work, which was uncommitted in
the shared worktree and passes). eslint and prettier clean on all eight files I
touched; `src/comparison/registry.ts` currently reports one unused-variable
error and one prettier warning, both w2a's and deliberately not touched by me.
Staged file by file rather than by directory for the same reason.

## 2026-08-10 — AD-27: W2b rulings, JND upgrade, session-limit restart [BINDING]

Session limit interrupted w2a mid-item (uncommitted registry/transforms/
config work preserved in tree) and survey-code post-delivery; user directed
continuation after reset. survey-lit's final quality pass (post-commit)
added §4.0 (JND provenance table) and §6.0 (open-question verdicts);
committed now.

Rulings on W2b's four open questions + one decision (survey-code report,
commit 518fc89):
AD-27.1 Window precedence REORDERED: options.window > MSM end >
pair-derived fallback. An explicit window is the caller's deliberate,
fixed choice (metric-safe); when an MSM is also present and its end
differs, a note records the MSM end. §5.0's MSM-first ordering is
superseded.
AD-27.2 ppq third state APPROVED as implemented (declared-but-unusable:
falls back to 720, declared=true, unusableDeclaration carries raw text);
field joins §9.3's report shape.
AD-27.3 Number-less parts as one-unmatched-row-each with A-before-B
symmetric ordering: APPROVED.
AD-27.4 Two-performance document with b omitted and no selectors: STRICT
(ambiguity error) — explicitness over cuteness; a typo'd selector must
never silently become "compare the two".
AD-27.5 CONFIRMED: parts the renderer discards at parse (missing
number/channel/port) are excluded with a structural note, NOT
neutral-compared — AD-1's what-is-performed principle governs; R6's
neutral rule applies only to parts the renderer accepts.

JND upgrade from survey-lit §4.0 (supersedes the AD-26.2 values):
AD-27.6 tempo JND = ln(1.025) ≈ 0.0247 nepers [literature: Friberg &
Sundberg 1995, relative regime >240ms IOI, training-independent]. The 6ms
absolute floor below ~240ms becomes a registry-note + docs obligation for
ms-domain timing rows (no new W2 machinery). Asynchrony 30ms [literature]
stands (Hirsh 15-20 / Goebl 30 / Nakamura 35 band documented). Dynamics
stays [convention] with the corpus-derivation path named as the honest
alternative (Jesteadt cited but unread-at-source; no fabricated dB JND).
AD-27.7 Repp 1992/1995 position-variance caveat ("perception of musical
time is warped by structure" — thresholds dip exactly where expressive
lengthening typically occurs) becomes a docs obligation: constant-JND
thresholding is a stated simplification; position-dependent thresholds are
enumerated future work, not silently absent.
AD-27.8 Scapes PROMOTED from stretch to committed W4 deliverable
(survey-lit §6.0 A-Q8 verdict: central to the field's practice).

## 2026-08-10 — W2a: forward `T`, comparison registry subset, layer config

Built (one commit):

1. **Forward maps in `src/expression/transforms.ts`** (§4's placement, A24):
   `forwardLogAroundOne`, `forwardLogAroundCenter`, `forwardLogit`,
   `forwardBoundaryPowerLow`, `forwardBoundaryPowerHigh`, `forwardGain`, and the
   `forwardInSpace` dispatch. They are the one block in that module that returns a
   non-finite number on legal input, deliberately: §4's cap is registry data the
   caller holds, so the boundaries return ±Infinity and the CALLER caps. Property
   test pins `T(C(x,s)) = s·T(x)` over the existing `SPACES` grid, at the infinite
   boundary values for every `s > 0`, and at `s = 0` as the branch it is.
2. **`src/comparison/registry.ts`** — §4's table for the four W2 dimensions:
   17 rows (tempo 5, rubato 5, dynamics 6, asynchrony 1), the frozen eleven-name
   `COMPARISON_DIMENSIONS`, the frozen §3 correspondence table, the frozen W2
   `COMPARISON_JND_KEYS`, and §4's capped local metric `localDistance` (see flag 8).
3. **Config**: the `comparison` eslint zone plus `'**/comparison/**'` in all six
   existing zones' forbidden lists; `'src/comparison/**/*.ts'` in vitest coverage.

AD-27.6 applied: tempo rows carry `ln(1.025)` **[literature]** (Friberg &
Sundberg 1995) in place of revision 2's `ln(1.05)` [convention]; the asynchrony
row carries 30 ms [literature] with the Hirsh 15–20 / Goebl 30 / Nakamura 35
band and the **6 ms absolute floor** stated as a note obligation (that row is
already absolute, so it costs no machinery — the obligation binds any future row
that reads a timing difference as a ratio); the dynamics rows stay [convention]
with corpus derivation named as the honest alternative and no dB figure asserted.

Flagged, not resolved silently:

1. **§4's two sentences about `log-around-center` cannot both be literal.**
   "A property test pins `T(C(x,s)) = s·T(x)` for every space" and "log-around-center
   collapses to the bare logarithm" are jointly false for bare `ln`: with `T = ln`
   the identity picks up a `(1−s)·ln μ` term. Implemented both in their own sense —
   `forwardLogAroundCenter` is the space's true bijection `ln(x/μ)` and satisfies
   the identity; the collapse is pinned as a property of _differences_
   (`T_μ(x) − T_μ(y) = ln x − ln y` for every μ), which is what §4's own qualifier
   says. Comparison's level rows therefore carry `log-around-1`, i.e. the operational
   collapse, for survey-code §2.2's reason: two documents bring two centers.
2. **§4's superset property, "the same scale space", cannot be literal for two
   families.** Expression's level rows are `log-around-center` and its rubato window
   rows are `joint-trim`; comparison uses `log-around-1` (flag 1) and `gain`
   (§5.2/A-Q10 prices the window as L1 on the ENDPOINTS, not through the trim
   reparametrization). The test carries both substitutions as named, cited
   equivalences rather than normalizing them away.
3. **§4's row shape has no representation for a boolean evaluator input.**
   AD-10 mandates a row for `@loop` — filing it structural made two documents
   differing only in it score `d_rubato = 0` — but a boolean has no scale space, no
   unit and no JND. Implemented as `gain` over `{0,1}` with `jnd 1 [convention]` and
   a note that the row carries no independent metric (its difference is priced
   through the displacement curve it opens). W3 meets the same problem with
   `@stickToMeasures` and should either ratify this or add a gate role. Note
   `@subNoteDynamics` is NOT this case: §5.3 makes it `structural` explicitly.
4. **§9.7's bezier carve-out as written is INERT.** ESLint builds an `ignore`
   (gitignore) matcher from the pattern group, and gitignore cannot re-include a
   file whose parent directory is excluded — so `'**/mpm/**'` plus
   `'!**/mpm/elements/maps/data/bezier.js'` silently keeps the import blocked.
   Measured by negative control, then fixed with gitignore's own staircase idiom
   (re-include each ancestor, re-exclude its contents). Control re-run: `Mpm.js`,
   `elements/GenericMap.js`, `maps/TempoMap.js` and `maps/data/TempoData.js` all
   error; `bezier.js`, `names.js` and `expression/transforms.js` are allowed. The
   carve-out is included this wave because §9.7 specifies it as part of the zone,
   not staged by wave; nothing imports bezier yet.
5. **§4's infinite-`T` enumeration overlaps its own NaN case.** It lists
   "`log-around-*` and the bare logarithm at `x = 0`" among the ±∞ values and
   separately says `qbpm ≤ 0` is NaN. Mathematically `ln 0 = −∞` (capped) and
   `ln x < 0` is NaN (a typed document error). Implemented that way and documented;
   DESIGN's wording could be tightened to `qbpm < 0`.
6. **Rows with no §7.1 constant.** meanTempoAt, curvature, protraction, rubato
   intensity/lateStart/earlyEnd and the two booleans get `jnd = 1 [convention]`,
   i.e. **reported unnormalized in their own `T`-space unit**, rather than an
   invented perceptual constant. survey-lit §4.0 supports this directly: "Tempo-curve
   shape parameters — no JND constant exists (shape parameters are not a perceptual
   scale)". None of these rows carries its dimension's curve, so the constant never
   enters a §5 density; only §6's per-attribute `deltaJnd` reads it.
7. **A `beatLength` plausibility band would catch §5.0's own motivating example
   more directly** than `qbpm ∈ [10,400]` does — the Hofmann (1927) files write
   `beatLength` in ticks. §5.0 names exactly four [convention] bands, so a fifth was
   not invented; the `beatLength` row carries `plausibleRange: null` and the note
   explains that the unit mismatch surfaces through `@bpm`'s band. W3/lit call.
8. **Scope addition, flagged for relocation if wanted**: §4's capped local metric
   `localDistance` is implemented here rather than left unassigned, because §4
   defines the registry and its metric as one unit and the row data is inert without
   it. It consumes W2b's `Valued<number>`/`Bottom` rather than a second spelling of
   `⊥`.

Also exported: the four §7.1 JND constants by name, so an evaluator takes its
curve JND from a symbol rather than deciding which row "is" the curve.

Verify: build + typecheck:tests green; 93 test files, 4126 passed, 1 skipped
(the skip is the W3 inventory-partition scaffold). Run excludes W2c's in-flight
`tests/comparison/quadrature.test.ts`, which is untracked in the shared worktree
and not part of this commit.

## 2026-08-10 — AD-28: quadrature ruling (supersedes AD-17's substitution) [BINDING]

survey-code's W2c stop-and-report MEASURED AD-17's u = z^(1/e) substitution
and falsified it for e > 1: the Jacobian exponent 1/e − 1 goes negative and
creates a z→0 singularity the original integrand never had (39% error at
meanTempoAt 0.9; result outside the integrand's own bounds at e = 150) —
precisely the late-weighted-ritardando half that matters. The panel's
diagnosis of naive GL-10 stands; its remedy is inverted. Full table in the
report; failing-by-design pins keep the substitution from returning.

AD-28.1 Scheme (b) adopted: equal-mass graded mesh in z — panels at
u = (k/K)^(1/e), K = ceil(log2 e) + 2, GL-10 per panel — ONE scheme for the
whole legal range, no regime branching; measured worst 3.3e-6 relative,
best 6e-14. The substitution is dropped everywhere; DESIGN §5.0's
quadrature rule 1 is amended accordingly (edit executed by survey-code in
the W2c commit under this ruling; substitution text replaced, falsification
noted with the measurement).
AD-28.2 Epsilon reframing adopted: the per-family accuracy record states
BOTH relative error and JND-unit error; docs state the metric requirement
is JND-scale exactness (naive GL-10's worst case was already 4.8e-3 JND)
and the ~1e-6..1e-12 figures are numerical hygiene above it.
AD-28.3 Commit policy: quadrature.ts + tests commit NOW standalone (green,
import-free, licenses the table by Newton re-derivation); the rest of W2c
lands as a second commit. Two commits for W2c, journaled here.

## 2026-08-10 — W2c part 1: numerical core, under AD-28 (task #14, survey-code)

First of the two commits AD-28.3 authorises. `src/comparison/quadrature.ts`
(import-free) + 41 tests. Task #14 STAYS OPEN: the grid, the four evaluators,
the densities and the property suite are the second commit.

Delivered: Neumaier summation (array + streaming), GL-10 with the table at full
double precision, `integrateGradedPower` (AD-28.1's ruled scheme),
`gradedPanelCount`, `powerCriticalPoint`, sign-COMPARISON bisection at a fixed
50 iterations (M16-safe), `integrateAbsolute` with structural split points, and
`integrateSubstitutedPower` retained ONLY as the pinned counterexample.

DESIGN §5.0 quadrature rule 1 rewritten under AD-28.1, as that ruling directs:
the substitution text is replaced by the graded mesh, the falsification is
recorded with its measurements, and the `max(2, ·)` floor is written into the
spec — `⌈log₂ e⌉ + 2` is 0 at e = 0.23 and negative below it, so the bare
formula asks for no mesh at all across the whole e < 1 regime. The floor was in
the measured prototype, so the 3.3e-6 figure the ruling quotes is already the
floored function's.

[CORRECTION to AD-28.2's arithmetic, not to its ruling] AD-28.2 cites naive
GL-10's worst case as 4.8e-3 JND. That was my figure and it used
TEMPO_JND_NEPERS = ln(1.05) from DESIGN rev 2; AD-27.6 had already halved it to
ln(1.025) (Friberg & Sundberg 1995), which doubles every JND-unit figure.
Corrected: over meanTempoAt ∈ [0.02, 0.99] naive's worst is 9.7e-3 JND and the
graded mesh's is 5.4e-4 JND; at 0.999 they are 4.8e-2 and 4.7e-3. The
conclusion AD-28.2 draws — that JND-scale exactness is the requirement and both
schemes clear it — is unchanged, and the gap between the schemes is unaffected.
The corrected numbers are in the module docs and pinned by a test rather than
left in prose.

Auditability test as commissioned: an independent Newton re-derivation of P10's
roots and weights from the Chebyshev initial guess, agreeing to 1e-15. That is
what licenses hard-coding the table — one that derived itself at run time would
be self-consistent with its own typo. Also pinned end to end: M7's
double-crossing cell (72.6→132.6 at e=2 vs 60→120 at e=1) crosses at u=0.3 and
0.7 with EQUAL endpoint signs, so bisection alone finds nothing; the critical
point splits at 0.5, both roots are then found, and `integrateAbsolute` lands
within 1e-9 relative where the naive whole-cell rule is off by >1e-3.

Gate: 41/41 tests, eslint and prettier clean on both files, `tsc` clean.
`npm run verify` deliberately not re-run for this commit — the module imports
nothing and nothing imports it yet, so it cannot affect another suite; the full
gate runs on the W2c part 2 commit that wires it in.

## 2026-08-10 — W2c part 2a: grid + tempo end to end (task #14, survey-code)

Task #14 STAYS OPEN. This is the tempo dimension complete — curve, grid,
density, distance, real anchors — plus the two owed edits. Dynamics, rubato and
asynchrony are NOT in it; see "what remains" below. Splitting again rather than
holding a large half-finished commit: tempo is the dimension the other three
are shaped against, and the anchors it produces are the campaign's first real
numbers, so landing it separately makes the next three reviewable against
something concrete.

AD-27.1 applied: `window.ts` precedence is now explicit > msm > corpus >
pair-derived, and the W2b test that pinned MSM-first is swapped for two — one
pinning that explicit wins, one pinning that the MSM still wins when no explicit
window is given.

DESIGN §9.3's epsilon record rewritten per AD-28.2: each of the five families
now carries `{ relative, jnd }` rather than one number, with the reason stated —
reporting only `relative` invites a reader to think 1e-6 is a requirement rather
than a comfort, when the requirement is JND-scale exactness.

`tempoCurve.ts` implements §5.1's four renderer behaviours, each pinned:
(1) trailing transitions inert (AD-8) — the last `<tempo>` performs as a
constant and inserts NO synthetic breakpoint, so `all_maps.mpm`'s trailing
`transition.to="90"` from 120 is not read as a ritardando; (2) a skipped
instruction still ends the previous span and opens a 100-qbpm gap to the next
VALID instruction (AD-9i); (3) `[0, firstValidDate)` at 100 qbpm (AD-9ii);
(4) the degenerate table (AD-9iii) including the row that matters — `meanTempoAt
<= 0` is a constant at TRANSITION.TO, not at bpm, which "collapses to a
constant" gets wrong by a factor of two.

`tempoDistance.ts` is the grid and the integral. The lead's integration note is
implemented and commented at the point of use: when a cell covers only part of a
transition because the other document's breakpoint splits it, the graded mesh is
computed in the TRANSITION's u-coordinate and then intersected with the cell —
grading in the cell's coordinate would put the panels away from the boundary
layer they exist to track and silently lose AD-28.1's accuracy. Only the row's
`jnd` is consumed; `localDistance` is not summed over curve rows (w2a's note and
§4's own wording).

FIRST REAL NUMBERS — Telemann Grave, tempo, window 198 quarters, pair-derived:
Baroque <-> Fast 5975.4491 JND*qn (147.5494 nepers*qn) mean 30.18 JND
Baroque <-> Romantic 556.5371 JND*qn ( 13.7424 nepers*qn) mean 2.81 JND
Fast <-> Romantic 5418.9120 JND*qn (133.8071 nepers*qn) mean 27.37 JND
P-C9's shape holds: Baroque/Romantic is the near pair by an order of magnitude.
The mean reads as ln(123/58) sustained, which is the right physical size for
58 vs 123 qbpm. Anchors are pinned in BOTH units — the nepers figure survives a
JND revision, and TEMPO_JND_NEPERS has already halved once under AD-27.6.

[FINDING, method not defect] P-C3's triangle test needs a RELATIVE tolerance.
The three Telemann curves are pointwise ordered, so the true relation is exact
EQUALITY, and the measured slack is 7.3e-7 absolute on a quantity of ~5975 —
1.2e-10 relative, i.e. pure quadrature error. An absolute epsilon of 1e-9 fails
a correct implementation. Both triangle tests use `<= (sum) * (1 + 1e-9)`.

Gate: `npm run verify` GREEN, 95 files / 4198 passed + 1 skipped (was 4126).
30 new tempo tests + 1 net new window test. eslint and prettier clean on all six
files touched.

WHAT REMAINS in task #14: dynamics (ideal Bézier via bezier.ts, 0.0 defaults and
clamps, trailing-constant, subNoteDynamics structural finding), rubato
(transliterated warp, @loop gating + frame cap + gridTruncated, clamps before
evaluation, skip-gap neutral spans), asynchrony (step curve, NaN-poisoned spans
to ⊥ renderer-error); the level/gain/shape decomposition (AD-18) and invariance
modes (AD-20); and the rest of the property suite — P-C3b zero-set transitivity,
loop on/off, capped-metric/⊥ behaviour. The substrate they need is now in.

## 2026-08-10 — DESIGN contradiction found: asynchronyMap's span-end rule

Found while starting the asynchrony evaluator. **DESIGN contradicts itself and
W2b's committed `spanEnds.ts` followed the wrong half.** Fixed in this commit.

§5.0's table lists `AsynchronyMap` among the six maps that "scan forward for the
next element of their _own_ local name". §5.7 says the opposite in the same
document: the map "takes the next dated child with **no local-name test**, so
any non-`<asynchrony>` entry ends the span".

The renderer settles it, and §5.7 is right:

    // AsynchronyMap.renderAsynchronyToMap
    const asynEndDate = asynIndex < this.elements.length - 1
      ? this.elements[asynIndex + 1].getKey()   // the next ENTRY, whatever it is
      : Number.MAX_VALUE;

There is no name test. `GenericMap.parseData:145-146` indexes every dated child
including `<style>` — it drops only a `<style>` carrying no `@name.ref` — so
`elements[i+1]` really can be a style switch. The contrast is decisive rather
than inferential: `TempoMap.getEndDate:166-175` DOES test
`getLocalName() === 'tempo'`, so the codebase contains both rules and they look
different in the source.

Observable consequence: a `<style>` between two `<asynchrony>` elements ends the
first one's span and opens a gap that carries no law (the §5.9 situation), where
the same-local-name reading keeps the first offset applying straight through it.
On a document that switches articulation style mid-piece — ordinary in the
official corpus — that is a real difference in what is compared.

[FOR THE CONDUCTOR] §5.0's table needs amending to say FIVE maps, with
`asynchronyMap` moved to the any-entry side alongside the imprecision maps. I
have NOT edited §5.0 myself: unlike AD-28.1, no ruling delegates this one to me,
and the sentence is load-bearing for AD-14ii/R12. The code and its test now
follow §5.7; the spec is what is out of step.

Gate: `npm run verify` green, 95 files / 4199 passed + 1 skipped. Full gate run
before committing, per the conductor's standing instruction that there is no
leaf exemption.

## 2026-08-10 — AD-29: §5.0 span-end contradiction resolved (five/two, not six/one)

survey-code found DESIGN §5.0 and §5.7 contradicting each other on
AsynchronyMap's span-end rule and settled it against the renderer source:
NO local-name test (elements[asynIndex+1] directly), unlike TempoMap's
explicit getLocalName() check. §5.0 amended by the conductor: FIVE same-name
maps, TWO any-entry maps (imprecision + asynchrony). Code/tests were fixed
first (74c83f1, renderer-cited); the committed W2b had followed the wrong
half of the spec. Also reaffirmed here as ruling: the split-commit cadence
supersedes AD-28.3's two-commit wording (green, gated, pushed increments).

## 2026-08-10 — W2c part 2b: dynamics curve and distance (task #14, survey-code)

Task #14 still open; rubato and asynchrony remain, plus the decomposition,
invariance modes and the rest of the property suite. Split-commit cadence per
the conductor's message of this date, which supersedes AD-28.3's two-commit
wording.

DESIGN §10's P-C3 wording patched in this commit under the conductor's
instruction: `d(A,C) <= d(A,B) + d(B,C) + 3ε` becomes the RELATIVE form
`<= (d(A,B) + d(B,C))·(1 + 1e−9)`, with the reason — quadrature error scales
with the magnitude of the integral, so an absolute epsilon is the wrong shape
and fails correct code. The Telemann measurement is quoted as the evidence:
pointwise-ordered curves sit at the triangle's equality case and the slack was
7.3e-7 absolute on ≈5975, i.e. 1.2e-10 relative.

`dynamicsCurve.ts` integrates the IDEAL Bézier (§5.0 rule 3 / R20), not
`tForDate`. `idealCurveParameter` inverts the same cubic by 50 bisections to
machine precision where `tForDate` stops at a ONE-TICK tolerance in the date
domain — on a 4-bar transition at 720 ppq that is 1 part in 11 520, and the
resulting staircase is what rule 3 forbids integrating against.

Conductor's watch-item honoured: the tForDate agreement test asserts the
documented bound AND separately asserts that the two really do differ, so it
cannot pass by accident of a coarse fixture. P-C4's encoding test builds its
dense steps by sampling the IDEAL curve, so it measures encoding invariance
rather than the renderer's staircase.

[FINDING, real property not defect] With `protraction = 0` the inner control
points are `(c, 1−c)`, the cubic is antisymmetric about `t = 0.5`, and
`x(0.5) = 0.5` EXACTLY for every curvature — so the date-midpoint volume is
invariant under curvature and cannot move however hard the curve is bent. This
file's first draft probed exactly there and its curvature test passed for the
wrong reason. Now pinned as its own test, and the bending test probes a quarter
of the span instead.

[FINDING, conditioning limit, measured and bounded] At `curvature = 1` — an
admissible boundary value — control points are `(1, 0)`, so
`x'(t) = 3(2t−1)²` VANISHES at `t = 0.5`. `x` is still matched to machine
precision but the inverse is stationary, so a cube-root loss leaves `t` good to
~1e-5 and the value fraction carries that into ~6e-4 volume units. More
iterations do not help. In JND terms ~2e-5, far below the metric's resolution,
so it is documented in the module and pinned as a bound rather than chased.
Every interior curvature is exact to 1e-9.

`@subNoteDynamics` is implemented as §5.3 requires — structural, never a curve
difference: the date-axis curves are identical, the distance is exactly 0, the
mechanism switch is reported, and it is inert on the map's last instruction.
Also pinned: trailing transitions inert (AD-8), curvature/protraction default
0.0 and NOT movement's 0.4 (AD-13), clamps on the way in, neutral velocity 100
before the first instruction and for an absent map, right-continuity.

[LIMITATION, recorded not hidden] `dynamicsDistance` supplies no structural
split points. Two Bézier segments over one span can in principle cross more than
once, and `integrateAbsolute` resolves one crossing per sub-interval. Unlike
tempo there is no closed-form critical point and §5.0 mandates the bracketing
device only for the power-vs-power family, so a multi-crossing dynamics cell
integrates slightly low. Stated in the module doc; if it matters the remedy is
tempo's, at the difference's stationary point, and it needs a ruling.

Gate: `npm run verify` GREEN before committing, 96 files / 4230 passed + 1
skipped (was 4199). 31 new dynamics tests. eslint and prettier clean.

## 2026-08-10 — AD-30: Bézier-pair cell subdivision [BINDING]

survey-code recorded (part 2b) that dynamicsDistance supplies no structural
split points: two Bézier segments can cross twice in one cell and
integrateAbsolute then integrates slightly LOW; §5.0 mandated bracketing
only for the power-vs-power family, and Bézier-vs-Bézier has no closed-form
critical point. Ruling: fixed K=4 equal subdivision of any cell where BOTH
sides are non-constant Bézier segments, each sub-interval getting the usual
one-crossing resolution — deterministic, structure-blind in the graded-mesh
spirit, cost confined to those cells. A deliberately double-crossing pair
becomes a pinned test demonstrating the subdivision catches what a
single-interval reading misses; the residual risk (≥3 crossings inside one
quarter of a cell) is documented as negligible-by-construction with the
smoothstep's curvature bound. DESIGN §5.0 sentence amended by survey-code
in the rubato/asynchrony commit under this ruling.

## 2026-08-10 — W2c part 2c: rubato + asynchrony, and AD-30 measured insufficient

Task #14 still open: the level/gain/shape decomposition (AD-18), invariance
modes (AD-20) and the remaining property tests (P-C3b zero-set transitivity)
are the final batch, which is the one thing that genuinely belongs together.

RUBATO (`rubatoCurve.ts`, `rubatoDistance.ts`). Displacement δ(t) = warp(t) − t
in quarters. All four §5.2 behaviours pinned: @loop gates the cycle and defaults
to FALSE, so an unflagged instruction warps only its FIRST frame and δ ≡ 0
across the rest of the span (negative-controlled — removing the gate fails
exactly two tests); a skipped instruction leaves an unwarped gap that still
carries a breakpoint (R23); clamps run BEFORE evaluation, so an inverted window
resets to the full frame and performs no warp; and the neutral parametrization
(1 / 0 / 1) returns exactly 0 without arithmetic per M18 — pinned on the (22,15)
and (25,7) integer pairs that do not round-trip.

[DECISION, needs ratification] §5.2's frame-boundary cap is a [convention] slot
DESIGN leaves unfilled. Set to 1024, exported as RUBATO_FRAME_BOUNDARY_CAP. It
clears every musically plausible frame — a 200-quarter piece warped on a
sixteenth needs 800 — while cutting the pathological frameLength="1" case by
three orders. When it bites, a grid-truncated note is emitted and the warp is
still evaluated exactly; only the refinement grid stops subdividing, so the
effect is quadrature resolution rather than a wrong curve.

ASYNCHRONY (`asynchronyCurve.ts`, `asynchronyDistance.ts`). Step curve in ms,
integrated EXACTLY — every cell is constant, so this dimension's epsilon is 0 in
both units. It is the one W2 dimension that uses localDistance rather than
integrating a curve, because ⊥ has no value to subtract: a missing
@milliseconds.offset makes the renderer emit NaN and the notes vanish from the
MIDI export, so the span reads ⊥ and is priced at δ_row (R24/AD-1). Pinned: ⊥
against a value costs δ_row per quarter, ⊥ against ⊥ costs 0, and a runaway
difference caps at 2·δ_row. The AD-29 any-entry span rule is pinned too — a
<style> between two <asynchrony> elements ends the span and opens a neutral gap.

[MEASURED DEFECT — AD-30's K = 4 IS INSUFFICIENT] AD-30 was ruled on my part-2b
report and assumed ≥3 crossings inside one quarter of a cell to be
negligible-by-construction from the smoothstep's bounded curvature. Measurement
refutes that. For 40→80 at curvature 0.9 / protraction 0.9 against 38→84 at
curvature 0 / protraction 0.9 — control points inside [0,1], x(t) monotone,
nothing degenerate — the log difference crosses at x = 0.598, 0.914, 0.984. The
last two are 0.07 apart and fall in the SAME quarter, so K = 4 cannot bracket
them. Against a 4·10^5-point Simpson reference:

    K = 1, 2, 4  ->  6.5e-2 relative error
    K = 8        ->  4.8e-2
    K = 16       ->  2.7e-8

Strong protraction is the mechanism: it skews the curve toward one end and
clusters the crossings there, which is exactly where an equal subdivision has
its coarsest relative resolution. K = 4 is IMPLEMENTED AS RULED; the
insufficiency is pinned by a failing-by-design test asserting the 5–8 % band, is
written into DESIGN §5.0 rule 2b with the sweep, and an amendment to K = 16 is
requested. A single-crossing pair is separately pinned as accurate to 1e-6, so
the test records what K = 4 does buy as well as what it does not.

DESIGN §5.0 gains rule 2b under AD-30, carrying both the ruling and the
measurement.

Gate: `npm run verify` GREEN before committing — 4257 passed + 1 skipped. 25 new
rubato/asynchrony tests, 2 new dynamics tests. eslint and prettier clean.


## 2026-08-10 — AD-31: K=16 (supersedes AD-30's K=4); rubato cap ratified [BINDING]

survey-code implemented AD-30 as ruled, then measured it insufficient:
strong protraction clusters crossings in x after reparametrization (three
crossings at 0.598/0.914/0.984 on an ordinary non-degenerate pair; K=4 →
6.5e-2 relative error, K=16 → 2.7e-8). The smoothstep-curvature argument
lives in t; the clustering lives in x — AD-30's negligibility claim did not
reach there. AD-31.1: K = 16 for Bézier-pair cells, as measured; the K=4
insufficiency stays pinned failing-by-design and §5.0 rule 2b carries the
sweep. AD-31.2: RUBATO_FRAME_BOUNDARY_CAP = 1024 RATIFIED [convention]
(clears every musical frame; pathological frameLength=1 cut three orders;
when it bites only grid resolution degrades, never the curve, and
gridTruncated reports it). Process note: implement-as-ruled + pin-the-
failure + report is exactly the governance this campaign wants — twice now
the measurement has beaten the argument (AD-28, AD-31), which is the reason
the campaign measures.

## 2026-08-10 — AD-31 applied: K = 16 in code, sweep re-pinned (task #14, survey-code)

Small follow-up commit. AD-31 landed while part 2c was in flight, so c851922
shipped the ruled-at-the-time K = 4 with the insufficiency pinned
failing-by-design; this commit brings the code to the ruling.

BEZIER_PAIR_SUBDIVISIONS is now 16. DESIGN §5.0 rule 2b updated to state K = 16
per AD-31 and to say where AD-30's argument went wrong: the curvature bound is
about the smoothstep in t, while the clustering happens in x after the monotone
reparametrization, which is where the argument does not reach.

The pin is RESTRUCTURED rather than deleted, per AD-31.1's "the K=4
insufficiency stays pinned". A failing-by-design test asserting ~6% error would
now itself fail, so the evidence moved DOWN a layer: the triple-crossing pair is
asserted accurate at the distance layer (<1e-6), and a separate test integrates
the same difference function directly through integrateAbsolute with 3 interior
splits (K=4) versus 15 (K=16), asserting >5% and <1e-6 respectively. That
survives the constant being correct and is the record a future change to it has
to face.

Residual risk is stated without being argued away: a pair crossing three or more
times inside a SIXTEENTH of a cell would still be under-resolved. That is far
outside anything the sweep produced, but the same style of argument is what
AD-30 got wrong, so it is recorded rather than dismissed.

Gate: `npm run verify` green before committing, 4258 passed + 1 skipped. eslint
and prettier clean.

## 2026-08-10 — W2c closing batch: decomposition, invariance, P-C3b (task #14, survey-code)

W2c COMPLETE. `decomposition.ts` + 25 tests. Task #14 can close.

DECOMPOSITION (§1.2 / AD-18). level / gain / shape on the NORMALIZED measure
dmu = w dt / int_W w dt, with the headline density left on the unnormalized
w dt — the two are named separately in the module because reading l_X against
the unnormalized measure silently changes d_level's unit from nepers to
neper*sqrt(quarters). Four fields plus the closing check, and the closing
identity is what every test asserts: if level^2 + gain^2 + 2*sigma_A*sigma_B*(1-r)
does not equal ||h_A - h_B||_2^2 then one of the four is wrong, and a
plausible-looking number would not reveal which.

Variance is computed as int (h - l)^2 dmu, NOT as int h^2 dmu - l^2. The second
form is shorter and catastrophically cancels on a curve whose mean dwarfs its
spread — a tempo curve at ln 60 ~ 4.1 with a 0.01-neper spread is exactly that
shape, and it is the common case rather than a corner.

[FINDING — §1.2's degenerate test is not implementable as written] §1.2 says
"the shape term := 0 when sigma_A sigma_B = 0". Measured: a genuinely constant
curve integrated by quadrature has variance ~7.9e-31, so sigma ~ 8.9e-16 and the
equality test NEVER fires. Consequences if left: shape and r reported for a
curve with no shape, and 'level-gain' dividing by a noise term. This is M18's
lesson recurring in a second place — an algebraically-neutral quantity has to be
recognized structurally, not by an equality test on floating point.

[DECISION, needs ratification] SPREAD_NOISE_FLOOR = 1e-12, relative to the
curve's own scale; variance below (floor*scale)^2 snaps to exactly 0, so every
downstream `sigma === 0` test fires as §1.2 intends. Margin is 17 orders on both
sides: the measured floor for a ln 60 constant is 2e-16 relative, while the
smallest musically meaningful spread — a 0.1% tempo variation — is sigma ~ 1e-3.
Nothing real lives in between. Same shape of guard as M18's, and flagged for the
same reason.

INVARIANCE MODES (§7.4 / AD-20). 'none' / 'level' / 'level-gain', per document
and per curve-valued row. §7.4's table is PINNED rather than merely described:
'level' removes a multiplicative factor in a log space (a roll read 10% faster
is distance 0 after centring) but only an additive OFFSET in a linear one, since
c*x - mean(c*x) = c(x - mean x) leaves the factor standing — that trap gets its
own test. 'level-gain' on a constant curve returns the zero curve rather than
dividing by zero, and isShapelessUnder reports it; a constant curve is the most
common input in this corpus, so that path is ordinary rather than exceptional.

P-C3b ZERO-SET TRANSITIVITY (AD-21). d(A,B) = 0 and d(B,C) = 0 implies
d(A,C) = 0, run on three genuinely different ENCODINGS of one performed curve: a
bare constant, the same value reached through a styleDef with a <style> switch,
and the same value written with a redundant middle instruction. All three
pairwise distances are exactly 0. Extended to the inert trailing transition
(AD-8), which must stay inside the zero set. Includes a NON-VACUITY test — the
same machinery gives a nonzero distance for a real difference — without which
every assertion would pass on an implementation that returns 0.

Gate: `npm run verify` green before committing, 4283 passed + 1 skipped (was
4258). eslint and prettier clean. W2's four evaluators, grid, quadrature,
densities, decomposition and invariance are now all in and gated.


## 2026-08-10 — AD-32: spread floor ratified; W2 wave gate opened [BINDING]

AD-32.1 SPREAD_NOISE_FLOOR = 1e-12 (relative to the curve's own scale)
RATIFIED — §1.2's "σ_A σ_B = 0" is a structural recognition, never a float
equality (measured quadrature noise on a constant curve: σ ≈ 9e-16;
smallest musical spread ≈ 1e-3 — 17 orders of margin on both sides). §1.2
amended by the conductor, including the ∫(h−ℓ)² anti-cancellation form.
AD-32.2 §5.2's cap slot filled with the ratified 1024 (AD-31.2).
AD-32.3 W2c complete (1f2844c, task #14 closed; 4283 tests green). The W2
wave gate opens: an independent adversarial verification of src/comparison/**
+ its tests against DESIGN's W2 scope, archived as W2-VERIFICATION.md, on
whose adjudication W3 opens.

## 2026-08-10 — AD-33: W2 gate verdict GATE-BLOCK; fix-wave rulings [BINDING]

W2-VERIFICATION.md archived (independent verifier; 3 CAPITAL, 4 MAJOR,
5 MINOR; "the wave tested its evaluators far harder than it tested its
integrator"). Rulings:

AD-33.1 (CAPITAL-1) ACCEPTED: a non-<asynchrony> entry in an asynchronyMap
opens a ⊥ (renderer-error) span — the renderer NaN-poisons it, the exact
R24 condition through a different element. CONDUCTOR ERROR acknowledged:
AD-29's own amendment text wrote "neutral gap" into §5.0/§5.7 without
following the missing name test through to what the renderer DOES with the
foreign entry; the verifier's probe corrects it. Both DESIGN sentences
amended in the fix commit; test assertions flip to isBottom.
AD-33.2 (CAPITAL-3) ACCEPTED: canonicalize powerCriticalPoint argument
order (by (exponent, Δqbpm), smaller first) — sweep-verified 0/149729
asymmetric; power-vs-power P-C2 test added.
AD-33.3 (CAPITAL-4) RULED: BOTH repairs adopted — (a) integrateAbsolute
gains the half-open convention (right endpoint sign-probed at its LEFT
limit; curves are right-continuous per A-B1, so the closed probe reads the
next cell's value — latent in tempo/dynamics, biting in rubato);
(b) §5.0 gains rule 2c: frame-aligned rubato cells split at the structural
u* (powerCriticalPoint on (L·(ee−ls), intensity) per side, canonically
ordered per AD-33.2), fixed K=16 subdivision fallback for differing
frames. Measured: 10/3906 pairs wrong >0.1%, worst 1.68e-3 relative —
documented as the residual with the sweep. Changes every published rubato
number; no real-data rubato anchors were pinned yet, so no anchor churn.
AD-33.4 (MAJOR-1) ACCEPTED: volume-less <dynamics> = skip performing
velocity 100 to the next valid instruction (renderer-true, tempo's AD-9i
template); §5.3 gains the paragraph with the DynamicsMap.ts:251-253 cite.
AD-33.5 (MAJOR-2/3/4 + MINOR-1) ACCEPTED: repair the unfalsifiable tests;
add the lateStart/earlyEnd-varying rubato distance family; PROMOTE the
verifier's seven-member adversarial fixture family (⊥, cap,
renderer-default, unmatched part, timingBasis, replacement-attr,
power-vs-power) as the standing P-C3/P-C3b family under an explicit shared
window. STANDING TEST POLICY adopted: every future integrator-touching
change runs against the adversarial family, not constants.
AD-33.6 (MINOR-3/5) in the fix wave: spanEnds.ts dead-code resolution
(wire it or remove it — no dead ends), stale headers, unused
integrateGradedPower resolution, '**/api/**' added to the comparison
eslint zone. MINOR-2 (−0) and MINOR-4 (malformed-value table) assigned to
W3 scope explicitly.
AD-33.7 Fix wave assigned to survey-code (code owner; findings carry
executable repros); w2-verify re-verifies the fix commit(s) scoped to the
findings; gate re-runs on its verdict.

## 2026-08-10 — W2 fix wave 1/3: renderer truth (CAPITAL-1, MAJOR-1) [survey-code]

AD-33.1 and AD-33.4, the two findings where the module computed a curve the
renderer does not perform.

CAPITAL-1. A non-<asynchrony> entry now opens a ⊥ (renderer-error) span. The
verifier's probe is decisive: asynIndex iterates over EVERY entry including the
<style>, reads parseFloat(getAttributeValue('milliseconds.offset', …)) off it =
parseFloat('') = NaN, and Math.max(0, ms + NaN) is NaN — so every note in that
span vanishes from the MIDI export, bit for bit R24's condition through a
foreign element. Priced as neutral it was out by a factor of 30 (0.333 vs 20
JND·quarters on the repro) and emitted no note at all. One `if` became an
`else`. DESIGN §5.0's AD-29 paragraph and §5.7 both amended; the test that
pinned the wrong behaviour by name now asserts isBottom and δ_row pricing.

MAJOR-1. A volume-less <dynamics> is a SKIP, not a no-op. getEndDate scans for
the next element NAMED dynamics regardless of whether it parses, so the
volume-less element still ends the previous span, and renderDynamicsToMap then
pins every note in the gap to velocity 100 (DynamicsMap.ts:251-253). Same shape
as tempo's AD-9i, same constant, different mechanism. Implemented on the tempo
reader's template line for line, including that a LEADING skip extends the
pre-first neutral to the first VALID instruction. §5.3 gains the paragraph with
the citation. Was wrong by |ln 60 − ln 100| = 0.511 nepers = 5.36 JND across
every affected gap.

Both were undetectable from inside the module: the evaluators were tested
against what the spec said, and in both cases the spec said the wrong thing.
That is the verifier's summary judgement — "the wave tested its evaluators far
harder than it tested its integrator" — arriving one layer earlier than it was
aimed.

Gate: `npm run verify` green before committing. eslint and prettier clean.

## 2026-08-10 — W2 fix wave 2/3: the integrator (CAPITAL-3, CAPITAL-4) [survey-code]

The verifier's summary — "the wave tested its evaluators far harder than it
tested its integrator" — is exactly right, and these are the two findings that
prove it.

CAPITAL-3 (AD-33.2). powerCriticalPoint's arguments are now canonically ordered
by (exponent, Δqbpm) smaller-first, via orderPowerSegments. Document order made
the swapped call compute (p·Δ_a/(q·Δ_b))^{1/(q−p)} instead of
(q·Δ_b/(p·Δ_a))^{1/(p−q)} — algebraically equal, NOT equal in IEEE754, because
they are separately-rounded reciprocals and Math.pow is not reciprocal-symmetric.
The one-ulp difference moves the split point, the GL-10 abscissae, and the
reported bits. Added the P-C2 power-vs-power test the wave never had: every
existing P-C2 test compared two CONSTANTS and so never reached
criticalPointTicks at all.

CAPITAL-4 (AD-33.3), both repairs.
(a) integrateAbsolute's sign probe is now HALF-OPEN: the right endpoint is
probed at its left limit, because every curve here is right-continuous (A-B1) and
the closed probe reads the next cell's value across a discontinuity. GL-10 nodes
untouched — they are strictly interior already. leftLimitOf uses a relative step
(|high|·eps) rather than a fixed epsilon, since tick abscissae reach 1e5 where a
fixed 1e-9 rounds back to high; it falls back to the midpoint on an interval
about one ulp wide, because returning `high` there would reinstate the closed
probe this exists to avoid.
(b) §5.0 gains rule 2c: frame-aligned rubato cells split at the structural u*,
powerCriticalPoint on (L·(ee−ls), intensity) per side, canonically ordered per
AD-33.2, with fixed K=16 subdivision where frames differ in length OR PHASE — the
phase check is mine; equal frameLength alone does not give a shared x coordinate.

RE-MEASURED SWEEP (my grid: 8 intensities x 7 windows per side, 3080 ordered
pairs; the report's grid gave 3906):
    as shipped before this commit : 59.6% wrong by >0.1%, worst 1.00e+0
    after both repairs            : 4 of 3080 wrong by >0.1%, worst 1.778e-3
The report's post-repair figure was 10/3906 worst 1.68e-3 — same residual, same
order, on a slightly different grid. Recorded as the residual per AD-33.3.

DESIGN: §5.0 gains rule 2c and a half-open-probe paragraph; both carry the
measurements.

Gate: `npm run verify` green before committing, 4286 passed + 1 skipped. eslint
and prettier clean.

## 2026-08-10 — W2 fix wave 3/3: tests and hygiene (MAJOR-2/3/4, MINOR-1/3/5) [survey-code]

MAJOR-2. The inverted-window clamp test was unfalsifiable: ls=0.8/ee=0.2 sum to
exactly 1, and the UNCLAMPED warp is then also exactly 0 at the midpoint the test
probed. Now ls=0.9/ee=0.3 (which gives −72 unclamped) and it asserts across the
whole frame rather than one interior point.

MAJOR-3. Added a rubato distance family varying lateStart/earlyEnd. The old
family left ls=0/ee=1 throughout, which is the ONE parameter family in which
CAPITAL-4's cancellation cannot occur — the blind spot and the defect were the
same shape. The new test pins the report's own repro: it loops the same warp over
4 quarters, so the expected value is 4 × the report's single-frame 1.5876 =
6.3503, which the repaired integrator reports; before the repair it read 0.00126,
three and a half orders low.

MAJOR-4. Promoted the adversarial family into
tests/comparison/adversarialFamily.ts + metricProperties.test.ts as the standing
P-C3/P-C3b family (AD-33.5), under an EXPLICIT shared window so R3's guarantee is
unconditional. EIGHT members, not the seven specified: criticalPointTicks fires
only when BOTH sides are transitions, so one power member leaves that path
unreached by every PAIR in the family. I found this by negative control — with
seven members, reverting AD-33.2 did NOT fail the family, only the dedicated
test. With the eighth it does. That is the difference between a family that
covers the path and one that merely contains a member which touches it.
39 tests: P-C1/P-C2/P-C3/P-C3b across tempo, dynamics and asynchrony, plus a
non-degeneracy test (every pair distinguishable) so the file cannot pass on an
implementation returning 0.

MINOR-1. Removed the two assertions that restate their implementation
(non-negative variance, typeof boolean) and replaced the second with one that
pins what actually needed pinning — that `shapeless` tracks the DATA rather than
the argument position, checked on both orders.

MINOR-3. spanEnds.ts is now load-bearing rather than a dead end: it gains
assertSpanEndRule, and the three curve readers call it at entry, so the table and
the readers cannot diverge silently — which is what "the span rule is taken from
spanEnds.ts" claimed while nothing imported it. Stale header rewritten for
AD-29/AD-33.1 (five same-name maps, two any-entry, and what the foreign entry
DOES). integrateGradedPower and the shipped tempo path now share
gradedPanelBounds, so AD-28.1's measured function and the shipped mesh are one
piece of code — they agreed by inspection before, and agreement by inspection is
not a property. DESIGN §5.0's window paragraph corrected to AD-27.1's order.

MINOR-5. '**/api/**' added to the comparison eslint zone, negative-controlled
both ways: a src/comparison file importing '../api/index.js' now errors with the
zone's own rationale, and everything else still lints clean.

Gate: `npm run verify` green before committing, 4326 passed + 1 skipped (was
4285). eslint and prettier clean. W2 fix wave complete across 0dc3e39, ebc2c4f
and this commit.


## 2026-08-10 — AD-34: RE-GATE PASS; W2 CLOSED; W3 opened [BINDING]

Re-verification appended to W2-VERIFICATION.md: all 3 CAPITAL + 4 MAJOR
confirmed repaired (probes re-run; revert-proofs where regression was
possible). Both beyond-spec extensions RATIFIED (the eighth family member
"better test design than the ruling asked for"; phase-aware frame
alignment correct). Four new MINORs, none affecting a reported number:
AD-34.1 RG-3 refinement ADOPTED — rule 2c emits BOTH split-point sets
[u*, K=16] (measured 0/3906 wrong, worst 2.718e-4; AD-33.3b's preference
ordering had been derived from the pre-half-open-probe table, so the
documented residual was a choice, not a limit — it now goes to zero, and
rule 2c's structural claim stands alongside the mesh rather than instead
of it). RG-1/RG-2/RG-4 one-liners accepted as reported.
AD-34.2 The RG closing item (RG-1..RG-4 + §5.0 residual sentence update)
is the final W2 commit, assigned to survey-code.
AD-34.3 W2 is CLOSED on that commit's green push. W3 OPENS: W3a remaining
seven dimensions (accentuation, articulation, ornamentation aligner,
pedal, imprecision ×3 — renderer-truth per DESIGN §5.4-§5.6/§5.8/§5.9);
then W3b aggregation/segments/closing table/facade; then W3c property
completion + cross-module P-C5. MINOR-2 (−0) and MINOR-4 (malformed-value
table) are W3b scope as previously assigned.

## 2026-08-10 — W2 RG closing commit: RG-1..RG-4 + AD-34.1 [survey-code]

RG-1. rubatoCurve is the fourth reader and now calls assertSpanEndRule too, so
MINOR-3's property holds for all four rather than three.

AD-34.1 / RG-3. Rule 2c now emits BOTH split sets, [...u*, ...K=16], rather than
preferring one. RG-3's re-measurement is decisive: the original ordering was
derived from a table taken with the CLOSED sign probe still in place, and once
AD-33.3a landed the ordering inverted — u* alone leaves 4 of 3906 wrong by >0.1%
(worst 1.400e-3) where K=16 alone leaves 0 (worst 2.718e-4). Both worst cases are
intensity = 0.25, whose x^0.25 has an infinite slope at x=0: a boundary layer a
two-panel structural split leaves inside one GL-10 panel and a sixteen-panel mesh
confines. That is the tempo graded mesh's own phenomenon arriving in a dimension
nobody had looked for it in.
Re-measured on my grid after the change: 0 of 3080 wrong by >0.1%, worst
4.688e-4, worst case intensity=0.25 — same conclusion and same diagnosis as the
verifier's 0/3906 at 2.718e-4. DESIGN §5.0 rule 2c's residual sentence now reads
zero, with both grids quoted.

RG-2, with one deviation reported rather than worked around. RG-2 asked for a
regression test that fails if the structural split is deleted. AD-34.1 makes that
impossible AT THE DISTANCE LEVEL: emitting both sets means u* changes no reported
number, which is precisely RG-3's finding. So the device is pinned DIRECTLY —
rubatoCriticalPointTicks is exported and tested for its closed-form value, its
bit-exact canonical ordering under swapping, and its three declines (differing
frame LENGTH, differing PHASE, neutral side). Same move as the K=4 evidence when
the constant became correct: when a property stops being observable at one layer,
the evidence goes down a layer rather than away.

RG-4. adversarialFamily.ts's seventh-member hazard string no longer claims to be
"the ONLY member that reaches criticalPointTicks" — the eighth member exists
precisely because that is false, and it now says the two are load-bearing as a
PAIR.

Gate: `npm run verify` green before committing, 4331 passed + 1 skipped (was
4326). eslint and prettier clean.


## 2026-08-10 — AD-35: §5.8 trailing-movement rule is conditional [BINDING]

survey-code's renderer-source-first reading (W3a cut 1) falsified §5.8's
"the last movement contributes no span": renderMovementToMap's guard
`movementIndex < size() - 1` counts EVERY dated entry, <style> included, so
a TRAILING <style> resurrects the final <movement> with getEndDate =
MAX_VALUE — a real performed transition across the entire remaining
timeline (executed: 17 vs 34 position events; leading <style> changes
nothing, confirming index arithmetic as the mechanism). Same hazard class
as CAPITAL-1/AD-29: musical-object wording vs entry-index computation.

Rulings, all three as proposed:
AD-35.1 The pedal reader excludes the LAST ENTRY of the map, not the last
<movement> — renderer-exact.
AD-35.2 A resurrected span is a real performed transition, compared as
one; the comparison window bounds it naturally (every integral runs over
[start, end]).
AD-35.3 §5.8's AD-25.9 contrast paragraph gains the THIRD state — span
exists AND is unbounded — so the tempo/dynamics ("pinned at start") vs
movement ("no span") dichotomy cannot be over-generalized. §5.8 amendments
delegated to survey-code in the cut-1 commit under this ruling.
AD-35.4 STANDING HAZARD CLASS named for the remaining cuts: every span,
guard, and termination rule in §5.4-§5.6/§5.9 must be checked against
"does the renderer count entries or musical objects here?" — imprecision
(any-entry spans) and ornamentation are the likeliest recurrence sites.
Accentuation confirmed clean against source (§5.4 matches, incl. tsDate
anchoring and the segment-end asymmetry).

## 2026-08-10 — W3a cut 1, part 1: accentuation CURVE (task #7, survey-code)

PARTIAL by design, and labelled as such. This is the accentuation curve evaluator
only: no density, no registry rows, no decomposition/invariance wiring, no
adversarial-family extension. Those and the PEDAL half follow. Committed at this
boundary because the curve is green, gated and verified against the renderer, and
because pedal is blocked on a design question (below) that should not hold it.

RENDERER-TRUTH VERIFIED BY DIFFERENTIAL TEST, not by hand-computed expectations.
accentuationAt is a transliteration of AccentuationPatternDef.getAccentuationAt,
so it is checked against the REAL class across a 0..6.02 beat sweep at 0.01
granularity on five pattern shapes — canonical four-beat, single accentuation,
the defaulting chain, out-of-order source, late first beat. 3015 samples, ZERO
mismatches, exact equality (not toBeCloseTo). A transliteration tested only
against numbers I worked out myself would pin my READING of the renderer, which
is the failure mode behind two of W2's three CAPITALs.

The renderer class is constructed on a copy() in the test, because parsing an
accentuationPatternDef adds length="4" and reorders its children — the mutation
R1 forbids, and exactly why the comparison reader reads the element raw.

§5.4 checked against source and found CORRECT in every particular: the segment-end
asymmetry (i < points.length - 1), tuple order [beat, value, transition.from,
transition.to] with from falling back to value and to falling back to from, 0
before the first accentuation, transition.to at and after length+1, @value taken
exactly on a beat, tsDate anchoring in both stickToMeasures branches, and the
renderer-default 4/4 initialisers. No contradiction — unlike §5.8.

Two behaviours pinned that §5.4 states and that are easy to get backwards:
stickToMeasures defaults TRUE (the one boolean here whose absent-default is not
false), and an unresolvable pattern NAME is ⊥ because the render dereferences a
null def and throws, while an instruction with no style in scope is a SKIP because
nothing throws — same document, two different dispositions, and §5.4 exists partly
to say which is which.

Gate: `npm run verify` green before committing, 4352 passed + 1 skipped (was
4331). eslint and prettier clean. 21 new tests.

BLOCKED, reported as msg 40f0a55e: §5.8's "the last movement contributes no span
at all" is conditional on the last ENTRY being that movement, because
renderMovementToMap guards with `movementIndex < this.size() - 1` and both sides
count every dated entry including <style>. Measured: trailing <style> gives 34
position events over [0..1.8e308] where none gives 17 over [0..720]. Awaiting a
ruling on the entry-index reading and on how the unbounded third state is priced.


## 2026-08-10 — W3a cut 1, part 2: pedal curve, both densities, rows (task #7, survey-code)

Cut 1 closed. AD-35 unblocked the pedal half and all three of its readings are
implemented as ruled: (a) the render guard is stated over ENTRY indices, (b) a
resurrected span is a real performed transition bounded by the window, (c) §5.8's
contrast paragraph now carries three states. §5.8 amended in this commit under
AD-35.3, with a table replacing the two-way contrast.

RESURRECTION RE-MEASURED, and my pre-ruling figure was wrong in its detail. The
earlier report said "34 events over [0..1.8e308] against 17 over [0..720]". Run
again on a pinned fixture: **26 events over [0, 1.7976931348623157e308] against
17 over [0, 720]**. The mechanism is exactly as reported — a trailing <style>
moves `size() - 1` past the last movement — but the resurrected span is only
resurrected when it is a TRANSITION; a trailing movement with no @transition.to
resurrects as a constant and emits three events at its own date, which is where
the earlier count came from. Leading and middle <style> switches change nothing,
which is the whole content of "the guard counts entries". Both halves pinned.

[DECISION, reported for ratification] §5.8 IS SILENT ON WHAT HAPPENS OUTSIDE A
SPAN, and this commit fills the gap from renderer truth rather than by choice.
renderMovementToMap annotates nothing; it builds a positionMap and
Msm.parsePositionMap:1422-1454 turns EVERY <position> into a MIDI control change,
unthinned, with no reset anywhere. A control change persists until the next one,
so: the pedal is UP (0) before the first event — which is also why R6's neutral
for an absent map is 0 — the last emitted value HOLDS to the end of the window
after the last rendered span, and a SKIPPED movement leaves a hold rather than a
gap, because getEndDate ends the previous span at it whether or not it parses.
Executed and pinned: a constant position="1.0" at 0, an unreadable movement at 360
and a transition at 720 emit nothing between 0 and 720, and the pedal sits at 1.0
across the whole interval. Modelling the tail as 0 would claim a pedal lift the
performance never makes.

AD-35.4's hazard class has a SECOND instance in the same section, found while
implementing: getPreviousPosition's inheritance scan is `j > 0` over ENTRY
indices, so a movement inheriting from the map's first entry gets 0 instead of
that entry's @transition.to — and inserting a leading <style> changes the
inherited position from 0 to 0.25 on the same document. Renderer-verified in both
directions and pinned as a test. PARITY.md already carries the defect (P2); what
is new is that it is entry-index-shaped, i.e. the same class AD-35.4 names.

⊥ FOR PEDAL IS THE NON-MONOTONE DATE COMPONENT. <movement> has no clamps, so
outside [0,1] × [−1,1] the inner control points leave the unit square, x(t) stops
being monotone and there is no date ↦ position function to integrate: §4's domain
gate takes the span. Measured at curvature="1.5": sorted by date, an authored
0 → 1 ramp no longer ascends. At curvature="4" the sampler puts events at −202 and
at 922 ticks for a span of [0, 720], so the ⊥ span is a FLOOR on the damage, not
an exact account — stated in §5.8 and pinned rather than papered over. Position
values are the opposite case: EventMaker.createControlChange:536 clamps into
0..127, so an out-of-range @position performs at the bound and compares as
performed, which is §4's "resolved" working as designed.

[DECISION] THE POINTWISE DENSITY IS CAPPED AT 2·δ_row FOR BOTH NEW DIMENSIONS,
and this is forced rather than chosen. Tempo and dynamics integrate |Δ|/jnd
uncapped and are metric doing so because neither can reach ⊥. Accentuation and
pedal both can (an aborting accentuationPatternDef, a non-monotone x), and §4
prices ⊥ at δ_row from every value — so an uncapped value-value pair breaks the
triangle inequality the moment a ⊥ document is the middle term:
d(x,⊥) + d(⊥,y) = 2δ while d(x,y) grows without bound. quadrature.ts gains
integrateCappedAbsolute, which resolves the corner the cap introduces the same way
integrateAbsolute resolves the corner at a root — bisect, split, integrate — and
reports whether the cap bound anywhere. integrateAbsolute was refactored onto the
shared piece-splitter so the two agree by construction, which is tested.

d_accentuation IS EXACT. The curve is piecewise affine in score time, so once the
grid carries every breakpoint — instruction dates, cycle wraps, each
accentuation's beat, the length+1 switch, the @loop-off cutoff — GL-10 is exact
per cell. Verified against a 240 000-sample trapezoid reference computed WITHOUT
the breakpoint machinery: agreement to 4 decimals on a four-beat pattern against a
three-beat one over eight quarters. That test is the real check on breakpoint
completeness; a missing breakpoint shows up there and nowhere else.

TWELVE REGISTRY ROWS, and w2a's skip-list shrank in the same commit as required:
UNCOVERED_DIMENSIONS is down from seven to five (articulation, ornamentation, the
three imprecision domains). Eight accentuation rows (@scale carrying the curve,
@loop and @stickToMeasures as booleans-with-rows on AD-10's test, the def's
@length, and the four pattern internals) and four pedal rows (@position carrying
the curve, @transition.to, @curvature, @protraction). NO @controller row, by
design: the value is a NAME and §4's metric is on numbers, so a mismatch goes
through the structural channel — pedalDistance.controllerFindings — exactly as
§5.8 asks. The name still matters and is reported: Msm.ts:1445 maps only sustain
and soft, and every other name falls through to controller 0, which is BANK
SELECT rather than a pedal.

[DECISION] TWO NEW JND CONSTANTS, both [convention] with the alternative named.
ACCENTUATION_VELOCITY_JND = 3 velocity units is §7.1's own velocity row applied to
the one dimension whose curve is already in velocity units (T is the identity).
PEDAL_POSITION_JND_RATIO = 0.1 of full travel is calibrated so that the extreme
authored difference prices at exactly δ_row: canonical pedal maps are exact
0.0/1.0, so full-down against full-up is 1.0/0.1 = 10 JND, the same price §4 puts
on an incomparable value — pedal therefore cannot dominate D on the strength of
its own scale. The 1/127 quantization floor (Msm.ts:1441 rounds position·127) is
carried as a docs obligation on the row, like asynchrony's 6 ms floor, and NOT as
machinery: the defined object is the ideal curve (§5.0 rule 3) and quantization
belongs to the §6.3 replay. Also added: a row for accentuationPatternDef@length,
which §5.4 does not enumerate — it is live twice over (the last accentuation's
segment ends at length+1, and under stickToMeasures="false" it is the whole cycle)
and AD-15 records that the parser writes the default onto the element. Flagged for
ratification.

ADVERSARIAL FAMILY 8 → 12, per the standing policy that each cut extends it with
the failure surfaces it opens: the two new dimensions' ordinary case, one member
per new ⊥ route (aborting def; non-monotone date component), and AD-35's unbounded
resurrected span — the only member whose span end is Number.MAX_VALUE. The metric
suite now runs P-C1/P-C2/P-C3/P-C3b over FIVE dimensions and twelve members: 220
triples, all green, with distance memoized on the ORDERED pair so P-C2 stays a
real computation rather than a cache lookup.

Decomposition/invariance wired for both dimensions via accentuationSampler and
pedalSampler, which return NULL on a window carrying a ⊥ span rather than
substituting a number: §1.2 takes moments, ⊥ has nothing to contribute to a mean
or a variance, and any stand-in would be read back as a pedal position. T is the
identity for both, so level and gain come out in travel fractions and velocity
units respectively — unlike tempo and dynamics, whose moments are in nepers.

Gate: `npm run verify` green before committing (4447 passed + 1 skipped, was
4352); eslint and prettier clean on every touched file. 95 new tests.

## 2026-08-10 — AD-36: cut-1 ratifications [BINDING]

d21f94b accepted (95 tests; AD-35 implemented; family 8→12; five-dimension
metric suite, 220 triples; skip-list 7→5). Ratifications:
AD-36.1 Outside-span pedal semantics as renderer truth: control changes
persist — pedal 0 before the first event, last value HOLDS to window end,
skipped movements leave holds not gaps (Msm.parsePositionMap unthinned, no
reset). The decide-without-stopping was correct under its stated test
(renderer determines; DESIGN merely silent).
AD-36.2 Capped pointwise density (integrateCappedAbsolute) for ⊥-capable
dimensions RATIFIED as forced: uncapped value-value integration alongside
δ-priced ⊥ breaks the triangle inequality with a ⊥ middle term. Shared
piece-splitter identity tested. W2's uncapped tempo/dynamics stand — they
cannot reach ⊥ (AD-1 renderer-defaults) — and the rule is now structural:
any future ⊥ route into a dimension forces the capped integrator.
AD-36.3 ACCENTUATION_VELOCITY_JND = 3, PEDAL_POSITION_JND_RATIO = 0.1
[convention] with stated calibrations; the accentuationPatternDef@length
row (live twice over) is ratified scope; @controller stays a finding-
channel, not a row (BANK SELECT fall-through documented). The 26-vs-34
self-correction and the second entry-index instance (getPreviousPosition
j>0, PARITY P2, now hazard-class-tagged) are noted with approval.
Cut 2 (articulation) proceeds.

## 2026-08-10 — AD-37: cut-2 rulings — articulation renderer truths [BINDING]

survey-code's §5.5 stop-and-report (all measured, tree clean). Rulings:

AD-37.1 The default step function is RETROACTIVE: its value on
[0, firstSwitchDate) is the FIRST switch's default — the renderer's
forward-only index starts at 0 unchecked against its own date (hazard
class instance #3, new shape: "index 0 used before its date arrives").
§5.5 amended; fixture pins the retroactive window on both switch
positions measured.
AD-37.2 The disposition table gains its third row: unresolvable STYLE ⇒
previous default continues; switch WITHOUT the attribute ⇒ cancel; switch
with UNKNOWN def name ⇒ cancel-with-warning. Two cancellers, one
continuer — all three pinned.
AD-37.3 Liveness precedence is a DURATION-ONLY rule; velocity levers
COMPOSE in source order (re-read after each write: absoluteVelocity →
relativeVelocity → absoluteVelocityChange). §5.5 states both; pricing
compares EFFECTIVE modifiers — the single live duration lever's effect,
and the composed velocity affine (r, c) in their spaces.
AD-37.4 Atoms COMPOSE ACROSS atoms per note in map order; the semantic
object is the per-anchor COMPOSED effective modifier, not the individual
atom. Consequence pinned as an encoding-invariance test: two stacked
relativeDuration atoms vs one atom carrying their product ⇒ distance 0.
Alignment operates on composed per-anchor effects.
AD-37.5 An atom's unresolvable @name.ref: def silently ignored, inline
modifiers still apply — the atom compares AS PERFORMED (no ⊥). §5.5
states this explicitly AGAINST §5.4's opposite accentuation disposition
(cross-referenced both ways) so neither is inferred from the other.
AD-37.6 Sequencing option (a) RATIFIED: the event aligner moves INTO cut
2 as its own module (dimension-neutral interface, W4-diff reuse in mind),
articulation is its first consumer, ornamentation (cut 3) its second —
two consumers before the interface freezes. No throwaway matcher.

## 2026-08-10 — W3a cut 2, part 1: articulation rows + atom liveness (task #7, survey-code)

PARTIAL by design. This is §5.5's first half only: the twelve registry rows and the
per-atom liveness resolution. NOT here, and both blocked on rulings reported as msg
e71940cd: the default-articulation step function (the renderer's default reaches
BACKWARDS, below) and the matching of atoms between documents (§5.5 delegates it to
§5.6's alignment DP, which is cut 3's module — the dependency runs the wrong way
round and I asked for a sequencing ruling).

RENDERER-SOURCE-FIRST READING, per the standing directive, and it found a
contradiction before a line was written. renderArticulationToMap_noMillisecondModifiers
walks the note map with a forward-only `defaultArticulationIndex` that starts at 0 and
is NEVER TESTED AGAINST ITS OWN DATE: the `while` only advances when the NEXT switch's
date has passed. So defaultArticulations[0] governs every note before the first
<style> switch. Executed on notes at 0/360/720/1080 with a single switch at 720
carrying defaultArticulation="stacc" (x0.5): durations [50,50,50,50]. With the switch
at 1440 and notes at 0/720/1440: [50,50,50]. The first switch's default is retroactive
over the whole map. §5.5's "step function built from the resolved style-switch list"
reads as having no value before its first step — the natural implementation, and wrong
by |ln 0.5| = 0.693 nepers held over the entire pre-switch region. AD-35.4's hazard
class in a third instance and a new shape: not "entries or musical objects" but "index
0 is used without checking that its date has arrived".

THREE MORE RENDERER FACTS §5.5 DOES NOT STATE, all executed:
(1) A switch naming an UNKNOWN def CANCELS the default — [50,50,100,100], identical to
    the no-@defaultArticulation case and opposite to the unresolvable-STYLE case, which
    leaves the previous default in force ([50,50,50,50]). §5.5 enumerates two of the
    three dispositions; two of the three cancel.
(2) The VELOCITY levers COMPOSE while the duration levers do not. articulateNote
    re-reads @velocity after each write: 64 with absoluteVelocity=80,
    relativeVelocity=0.5, absoluteVelocityChange=7 performs 47. AD-11i's one-lever rule
    is a DURATION rule and does not generalise.
(3) Atoms compose ACROSS atoms in map order: two <articulation> at one date with
    relativeDuration 0.5 and 0.25 perform 12.5, not 25 or 50; a noteid atom and a
    date-targeted atom on the same note both apply.
And one that bears on ⊥: an atom whose @name.ref cannot resolve is NOT dropped — the
def is ignored and the inline modifiers still apply (120 on a 100-tick note for
name.ref="stacc" relativeDuration="1.2" with the def missing, 60 with it present).
That is the OPPOSITE disposition from §5.4's accentuation, where no style in scope
skips the whole instruction.

Re-confirmed unchanged from §5.5: inline precedence absoluteDurationChange >
relativeDuration > absoluteDuration with absoluteDurationMs short-circuiting all three
(0.5 with +10 performs 110 inline, 60 on a def); absoluteDurationChange=-200 on a
100-tick note performs 50; noteid strips its first character unconditionally, so
noteid="n0" addresses "0"; an unresolvable noteid is dropped; a noteid whose note sits
at another date is applied anyway with a warning; absoluteDelay moves date.perf and the
map is re-sorted.

TWELVE ROWS, and the skip-list shrank again in the same commit: UNCOVERED_DIMENSIONS is
5 -> 4 (ornamentation and the three imprecision domains). Seven rows mirror expression's
articulation rows one-for-one (so the superset property holds with both sites on each,
as expression has them); three are §5.5's REPLACEMENT attributes, which have no
expression row because they are not exaggerable and whose present-vs-absent case is ⊥
(AD-2/M1c); two are the detune pair, filed role 'inert' (R14) so that the inertness is
stated rather than inferred from an absence. All twelve are role 'event', the first rows
in the table that are.

[DECISION, reported] Two JND reuses and one new constant. ARTICULATION_DURATION_JND_
NEPERS = ln(1.10) [convention] for @relativeDuration, and deliberately NOT the tempo
constant: Friberg & Sundberg's verified 2.5% is a threshold on INTER-ONSET intervals,
whose deviations accumulate against a tracked beat, while a single note's sounding
length has no such reference — borrowing it would report duration differences as three
times more salient than the evidence supports. @relativeVelocity takes DYNAMICS_JND_
NEPERS because it is a velocity RATIO and that constant is exactly "a 10% velocity
change". The tick-valued rows take RUBATO_DISPLACEMENT_JND_QUARTERS (1/16 quarter) and
are ppqSensitive; the ms rows take ASYNCHRONY_JND_MS, which is [literature] for
@absoluteDelayMs (it IS the onset-shift quantity) and [convention] for the two duration
ms rows, where the tag travels with the borrowing.

[DECISION, reported] Identifier rename: ACCENTUATION_VELOCITY_JND -> VELOCITY_JND.
AD-36.3 ratified the constant's value and calibration, both unchanged; §7.1 states ONE
velocity JND and three dimensions now draw on it (§5.4's contribution, §5.5's
@absoluteVelocityChange and @absoluteVelocity), so naming it for the dimension that
needed it first was about to become misleading. Also added 'hz' to ComparisonUnit, for
@detuneHz.

Gate: `npm run verify` green before committing (4465 passed + 1 skipped, was 4447);
eslint and prettier clean. 18 new tests, every liveness claim checked against the real
renderer over a note map rather than against the reader alone.

## 2026-08-10 — W3a cut 2, part 2: the default step function (task #7, survey-code)

AD-37.1 and AD-37.2 implemented as ruled, and §5.5 amended in this commit for
AD-37.1/2/3/5 — the sections now carry the retroactive window, the three-row
disposition table, the velocity-composition rule with its measured 47, the
per-anchor composition rule with its encoding-invariance obligation, and the
unresolvable-@name.ref disposition cross-referenced BOTH WAYS with §5.4 (which
gained the reciprocal sentence), so neither section can be inferred from the other.

src/comparison/articulationDefault.ts: the step function, with the first step's
startTicks pinned at 0 rather than at its switch's date and the switch date kept
separately as firstSwitchTicks, so the retroactive window is legible in the data
rather than merely applied. Three dispositions distinguished by cancelCause
('no-attribute' | 'unknown-def') against a switch that never enters the list at
all.

Eight new tests, each asserting the RENDERER first and the reader second, over a
row of four 100-tick notes: [50,50,50,50] for the retroactive switch at 720,
[50,50,50] for one at 1440 with notes at 0/720/1440, [120,120,50,50] for two
switches, [50,50,100,100] for both cancelling dispositions, [50,50,50,50] for the
unresolvable style, [100,100,100,100] when no switch survives, and [50,120,50,50]
for the atom-shadows-default rule. The last is AD-11ii/R5 re-pinned here because
the step function is what it shadows.

Still to come in cut 2, now unblocked by AD-37.6: the dimension-neutral event
aligner as its own module, the per-anchor composed effective modifier (AD-37.3/4),
and the pricing that consumes both. The aligner's second consumer is cut 3's
ornamentation, which is why it is being built to a dimension-neutral interface
rather than to articulation's shape.

Gate: `npm run verify` green before committing (4473 passed + 1 skipped, was
4465); eslint and prettier clean.

## 2026-08-10 — W3a cut 2, part 3: the event aligner (task #7, survey-code)

AD-37.6 implemented: src/comparison/eventAlignment.ts, dimension-neutral as ruled.
Nothing in it knows what an articulation or an ornament is — the caller supplies
`matched`, `unmatched` and `lambdaDate`, the module supplies the argmin over monotone
alignments. Articulation is its first consumer (next commit); ornamentation is its
second, in cut 3, which is the point of freezing the interface only after two.

THE DATE TERM IS INSIDE THE MINIMAND, which is M5's correction carried into code:
`alignEvents` adds `λ_date·|Δdate|` to the matched cost itself, so the functional that
is minimized is the functional that is reported. Revision 1 minimized one and reported
another, which priced a matched ornament displaced by half a bar at zero.

TESTED ON THE OBJECTIVE, NOT ON AN ALIGNMENT. The load-bearing test enumerates every
monotone alignment by brute force and checks the DP found the minimum, on six shapes
including empty-vs-nonempty. Asserting "these two match" would pin one optimum out of
several equal ones and would pass on an implementation minimizing the wrong thing.

Id-pinning as ruled: equal non-null ids are an identity match, applied as a HARD
constraint (a pinned event may match only its partner and may never be dropped);
unequal ids do NOT forbid a match, because a rename is not a different event. Two
sub-cases the ruling did not have to state and which the module decides explicitly:
a DUPLICATED id takes the first claimant on each side, and a CROSSING pin set — the
same two ids in opposite order, which no monotone alignment can honour — falls back to
the unpinned optimum WHOLESALE and reports `pinsHonoured: false`. Partial honouring
would make the answer depend on which subset was tried; silently resolving it either
way would be a decision made in the dark. Both pinned as tests.

[DECISION, reported for ratification] DEFAULT_LAMBDA_DATE = 16 per quarter
[convention]. §5.6 states that λ_date belongs to the semantic definition but leaves
its VALUE open, and the module takes it as a caller parameter precisely so the value
is not baked into the aligner. The proposed default reuses the calibration the design
already has for a displacement in score time: RUBATO_DISPLACEMENT_JND_QUARTERS is 1/16
quarter (§7.1), so λ = 1/(1/16) = 16 makes a displacement of exactly one rubato JND
cost exactly one JND here. The alternative — a number chosen to make some corpus behave
— is what §7.1 exists to avoid.

Ties are broken match > dropA > dropB, strictly, so the argmin is a function of the
inputs alone; bit-exact symmetry remains a property of the caller's cost, which is
where it belongs.

Gate: `npm run verify` green before committing; eslint and prettier clean. 20 new tests.

## 2026-08-10 — AD-38: cut-2 ratifications (aligner defaults, JND identifiers) [BINDING]

69cd5b5/23a4b41/bb57982 accepted. Ratifications:
AD-38.1 DEFAULT_LAMBDA_DATE = 16 per quarter [convention], calibrated so a
displacement of one rubato JND (1/16 quarter) costs one JND — coupled to an
existing constant, not fitted to a corpus; λ_date stays a caller parameter
with only the default in the module.
AD-38.2 VELOCITY_JND rename ratified (one velocity JND, three consumer
dimensions); 'hz' unit added; ARTICULATION_DURATION_JND_NEPERS = ln(1.10)
[convention] ratified WITH its argument — Friberg & Sundberg's 2.5% is an
IOI threshold against a tracked beat and does not transfer to single-note
sounding length; borrowing it would overstate duration salience 3x.
AD-38.3 Aligner sub-cases ratified as pinned: duplicated id ⇒ first
claimant on each side; crossing pin set ⇒ WHOLESALE fallback to the
unpinned optimum + pinsHonoured: false (partial honouring would be
subset-order-dependent; silent resolution would be a decision in the
dark). The objective-not-alignment test discipline (brute-force
enumeration vs DP optimum) is noted as the correct way to test an argmin.
Remaining in cut 2: composed effective modifiers + articulation pricing.

## 2026-08-10 — W3a cut 2, part 4: composed modifiers and d_articulation — CUT 2 CLOSED

AD-37.3 and AD-37.4 implemented, and with them cut 2 is complete: rows, atom
liveness, default step function, aligner, composed modifiers, distance.

EVERY EFFECT IS AN AFFINE MAP WITH AN OPTIONAL REPLACEMENT ANCHOR —
`x -> (replacement ?? x) * factor + offset`. @absoluteDuration/@absoluteVelocity set
the replacement, @relativeDuration/@relativeVelocity the factor,
@absoluteDurationChange/@absoluteVelocityChange the offset, and the composition of two
such maps is another one. That is why this is the canonical form and not a
convenience: AD-37.4's encoding-invariance obligation falls out BY CONSTRUCTION rather
than by a special case, because two stacked relativeDuration atoms and one atom
carrying their product both reduce to {null, 0.125, 0}. Pinned as a test that checks
the RENDERER first — both documents really do perform the same note — so the
invariance is a fact about the performance and not about my algebra.

Two composition consequences pinned against the renderer rather than asserted: an
earlier offset is carried THROUGH a later factor (change +10 then x0.5 performs 55,
and the composed form is {null, 0.5, 5}), and a later replacement wipes everything
before it (x0.5 then absoluteDuration=600 performs 600).

Anchors are dates OR ids and do NOT merge without an MSM. Both kinds can reach the
same note — executed, they compose there — but deciding WHICH note needs the MSM, so
the id-anchored ones carry datePositionKnown: false, which is §5.5's own instruction.
An id-anchored anchor is also never dropped by the window: it has no known date, and
dropping it would silently forgive a difference the renderer performs somewhere.

d_articulation IS the alignment's optimum, per §5.6 — this module's job is to supply
the two costs and hand the argmin's value back, not to compute a second number beside
it. Replacement attributes present on one side only are priced ⊥ = δ_row, which closes
M1c's zero-set violation (A=2, B=absent, C=100); the detune pair is reported through
inertFindings and contributes 0, which is R9b's rule and the reason those two rows
exist at all.

Gate: `npm run verify` green before committing (4506 passed + 1 skipped, was 4493);
eslint and prettier clean. 13 new tests, 39 in the articulation suite overall.

CUT 2 IS CLOSED. Cut 3 (ornamentation) is next, and the aligner is waiting for it as
its second consumer — the interface does not freeze until it has served both.

## 2026-08-10 — AD-39: cut 2 closed; id-anchor window exemption ratified

09611f4 accepted; cut 2 closed (four commits, 59 new tests across the
suites, skip-list at 4). The affine-with-replacement canonical form
`x ↦ (replacement ?? x)·factor + offset` is noted as the right closed
form — encoding invariance by construction, renderer-verified.
AD-39.1 RATIFIED: id-anchored anchors are never dropped by the window
(unknown date; dropping would forgive a performed difference). Symmetric,
deterministic, conservative. One obligation added: the report must STATE
that id-anchored content is window-exempt, so a caller narrowing the
window knows those atoms persist (facade/W3b picks this up in the
report-shape work).
Cut 3 (ornamentation) proceeds; the aligner meets its second consumer.

## 2026-08-10 — AD-40: ornament @scale gates half the ornament [BINDING]

Cut-3 stop-and-report (fourth §5-vs-renderer divergence in four
dimensions; provenance note: panel R19 flagged @scale's 0.0 default and
AD-15 ratified the row, but the rev-2 compilation absorbed it into §5.6
incompletely — the gating behavior was never stated). Rulings:

AD-40.1 @scale IS a registry row on <ornament>: linear velocity-unit
space (per AD-15/R19 — it multiplies a velocity offset; gain-ordered per
the shipped s-domain vocabulary), NEUTRAL 0.0, liveness "gates
dynamicsGradient ENTIRELY, defaults to 0, does NOT gate temporalSpread".
§5.4 and §5.6 cross-reference each other for the same-name @scale
attributes with different dispositions (skip-whole-instruction vs
zero-one-half), as §5.4/§5.5 already do for unresolvable names.
AD-40.2 The gradient's COMPARED OBJECT is the resolved performed pair
(from·scale, to·scale) — @scale is not independently priced; two
encodings of one performed ramp compare equal. This and AD-37.3 are now
one NAMED PRINCIPLE for the remaining work: "price the resolved performed
effect, never the attribute tuple."
AD-40.3 Single-note pool performs transition.to (renderer truth), priced
as such, pool size reported. The ramp distributes over the ornamented
POOL (notes at the ornament's date / note.order list), not score time —
§5.6 states it with the three measured facts (single-note = to;
date-pooling; before-first-style skip mirroring §5.4 against §5.5's
opposite, cross-referenced).
AD-40.4 The clean hazard check is RECORDED: no size()-1 guard in
ornamentationMap (no AD-35 analogue), and the local-header gate resolves
globally as measured — negative results are evidence too.
Unblocked halves proceed meanwhile as proposed.

## 2026-08-10 — W3a cut 3, part 1: ornamentation rows (task #7, survey-code)

AD-40's unblocked half. Seven rows; UNCOVERED_DIMENSIONS is 4 -> 3 (the three
imprecision domains). Six mirror expression's ornament rows one-for-one so the
superset property holds; the seventh is @scale, which AD-40.1 restored.

@scale carries its GATING behaviour in the liveness column, which is the part the
rev-2 compilation lost: it gates <dynamicsGradient> entirely, defaults to 0.0, and
does NOT gate <temporalSpread>. The notes carry the measurement (0/0/0 without it,
-20/0/+20 with scale="1.0", spread applying either way) and the CONTRAST with §5.4's
mandatory accentuationPattern@scale, where the same attribute name absent skips the
whole instruction instead of zeroing half of it.

Two liveness facts pinned in the rows rather than left to the evaluator:
@transition.from is live only where the pool holds MORE THAN ONE chord, and
@transition.to is `always` because a single-note pool performs IT — the else-branch
of DynamicsGradient.apply, measured at 20 from a -20 -> +20 gradient. A reader
implementing "interpolate across the pool" writes the start value or an average
there and is wrong both times, which is why the asymmetry sits in the table.

@frame.start and @frame.offset are two rows for one quantity in two spellings (v3
renamed it, v2's name survives as the accepted alias) because a report must name
which spelling a document used — @frame.offset's mere presence is what makes a
<temporalSpread> v3 and changes how the frame is parsed. @frameLength is the
geometric pair of @frame.start and is a separate row here although expression scales
them together: "the frame is wider" and "the frame starts earlier" are different
findings, and a comparison exists to say which.

@intensity takes ARTICULATION_DURATION_JND_NEPERS rather than a fourth invented
ratio constant: what it reshapes is the spacing of onsets inside a fixed window,
which is the same kind of quantity as a note's sounding length.

STILL TO COME in cut 3: the ornament reader (pool resolution, the performed pair
(from*scale, to*scale) per AD-40.2, the before-first-style skip), the distance
through the aligner as its SECOND consumer, and §5.6/§5.4's mutual cross-reference.
One row is deliberately NOT here and is reported as an open question: @note.order,
which §5.6 enumerates but whose value is a NAME ("ascending pitch") or an id list.
§5.8's @controller precedent (AD-36.3) sends name-valued attributes to the finding
channel; the two enumerated orderings could instead be a boolean01 row like @loop.
Not invented at the tail of a session — asked.

Gate: `npm run verify` green before committing (4506 passed + 1 skipped); eslint and
prettier clean.

## 2026-08-10 — AD-41: @note.order ruling; cut-3 handoff [BINDING]

c477433 accepted (7 ornamentation rows, skip-list at 3; the liveness
asymmetry of transition.from/to in the table where a future editor trips).
AD-41.1 @note.order: the two enumerated orderings ("ascending pitch" /
"descending pitch") are a boolean01 gain row — a genuine binary that
changes which note receives which gradient step; an EXPLICIT ID LIST is a
structural finding, not a row value — naming notes is an identity claim,
not a magnitude (the @controller argument, AD-36.3). @repetitions lands
with the reader as planned.
AD-41.2 HANDOFF GRANTED with thanks on the record: survey-code (W0 §code
survey, BOM fix, fixtures, W2b, W2c, the whole W2 fix wave, W3a cuts 1-3a
— and four renderer-truth divergences caught before a wrong number ever
shipped) hands cut 3's remainder to a fresh context. State: everything
committed/pushed/green at c477433, tree clean, LOG carries the full
remaining spec. Successor scope: cut 3 remainder (ornament reader with
pool resolution + performed pair per AD-40.2, before-first-style skip,
distance through the aligner AS SECOND CONSUMER with an interface-change
report if neutrality fails, §5.6/§5.4 cross-reference, @note.order per
AD-41.1, @repetitions row, adversarial-family + skip-list updates), then
cut 4 (imprecision ×3 per §5.9 + AD-14), under ALL standing policies:
LOG-first, renderer-source-first with stop-and-report, AD-35.4 hazard
check, AD-40.2 performed-effect principle, negative controls +
differential tests, capped density for ⊥-capable dimensions (AD-36.2),
green/gated/pushed serial cadence.

## 2026-08-10 — AD-42: handoff state correction; draft adoption; unmatched-ornament pricing [BINDING]

w3-dims found two untracked post-handoff drafts (ornamentAtoms.ts,
ornamentationDistance.ts, mtimes 2 min after the AD-41 commit) — AD-41.2's
"tree clean" was true at commit time and stale two minutes later; the
predecessor wrote briefly past its own handoff. Corrections and rulings:

AD-42.1 survey-code is STOOD DOWN explicitly (no further writes under
src/comparison/**); w3-dims OWNS both draft files as of this ruling.
AD-42.2 Adoption-as-unverified-input RATIFIED: audit every claim against
the renderer, keep what survives, rewrite what does not, attribute the
draft in the LOG entry. Zero tests + the four-of-four divergence record
make any other treatment indefensible.
AD-42.3 UNMATCHED-ORNAMENT PRICING RULED (the draft's flat ⊥ is wrong on
both design and metric grounds): an absent ornament has a GENUINE NEUTRAL
— no ornament performs nothing — so unmatched events price at
deviation-from-neutral PER ROW in the row's own space (|T(x)|/jnd;
gradient's performed pair vs (0,0); frame vs no-frame), which is both
§5.6's original text and the construction under which the alignment is a
metric (gap(a) ≤ sub(a,b) + gap(b) is the T-space triangle inequality
anchored at neutral). ⊥ stays reserved for AD-2's narrow incomparable
list; a missing <temporalSpread> is neutral, not incomparable. Content-
dependent drop costs restore what the flat constant destroyed: the
alignment's sensitivity to what the dropped ornament actually performs.
AD-42.4 NaN GUARD NOW, not W3b: every numeric read in the ornament path
takes a finite-guard; unusable values go the skip-and-report route (the
expression gate's philosophy). MINOR-4's full malformed-value TABLE stays
W3b scope; NaN reaching localDistance is not a table question.
AD-42.5 @note.order and @repetitions land per AD-41.1 as already ruled;
the draft's finding-channel-only treatment of note.order is superseded.

## 2026-08-10 — W3a cut 3, part 2: ornament reader, distance, aligner's 2nd consumer

AD-40 implemented in full. THE ALIGNER'S INTERFACE SURVIVED ITS SECOND CONSUMER
UNCHANGED — not one line of eventAlignment.ts was touched. Articulation anchors carry
a composed affine modifier; ornaments carry a resolved gradient and frame; the aligner
sees only { dateTicks, id } plus three cost fields and never learns the difference.
That was AD-37.6's whole bet and it paid.

AD-40.2's principle in code: the gradient arrives at the distance layer as
(from*scale, to*scale), so @scale is unpriceable on its own by construction. The
encoding-invariance test checks the RENDERER first — (-20,20)x1 and (-10,10)x2 write
identical ornament.dynamics markers — and then asserts distance 0.

FIFTH §5-VS-RENDERER DIVERGENCE, and the biggest so far: A GLOBAL ornamentationMap
PERFORMS NOTHING AT ALL. renderOrnamentationToMap gates the entire application on
getLocalHeader() !== null, and Dated.addMap:94-97 binds
`localHeader = this.part === null ? null : this.part.getHeader()` — so a map in
<global> has a null local header BY CONSTRUCTION and not one of its ornaments is ever
applied. Measured with identical content and identical styles: the same ornament
writes ornament.dynamics -20/0/+20 from a part and null/null/null from <global>. A
part-local map works whether its styles sit in the part header or the global one; only
the MAP's own scope decides.

Reported, not resolved: the inner apply() tests `localHeader === null && globalHeader
=== null`, which is the check the outer gate looks like it meant to make, so this may
be a PORT BUG rather than reference behaviour. If Java applies global ornamentation
maps this belongs in PARITY.md and the comparison must follow the reference instead —
I cannot check the Java source from here. Implemented as renderer-truth in the
meantime (global scope -> no atoms, cause reported as 'global-scope-inert') because
that is what THIS renderer performs, and pinned with a test that fails the moment the
gate changes. AD-36.1's decide-without-stopping test applies: the renderer determines
it and DESIGN is silent. But the port-bug question is the conductor's to settle.

Pool sizing is honest about the MSM: only an explicit @note.order id list sizes the
pool from the document, so poolSize is null otherwise and BOTH gradient endpoints are
priced. Assuming a single-note pool would silently drop @transition.from from every
ornament in the corpus, which is the wrong direction to guess in.

A <temporalSpread> or <dynamicsGradient> present on one side only reads ⊥ per family,
not a difference from a zero-width frame: there is no "unspread frame" the document
meant, and pricing it at 0 reopens M1c. Frames in different @time.unit domains are
incommensurable and also read ⊥ — a millisecond frame and a tick frame are not a big
difference, they are not comparable.

Still open and NOT invented: @note.order as a row. §5.6 enumerates it, but its value is
a NAME or an id list; §5.8's @controller precedent (AD-36.3) sends name-valued
attributes to the finding channel. Implemented as a structural FINDING for now
(reported, contributes 0) with the question put to the conductor.

Gate: `npm run verify` green before committing (4523 passed + 1 skipped, was 4506);
eslint and prettier clean. 17 new tests.

## 2026-08-10 — AD-43: global ornamentation performs; 404fd57 audit commission [BINDING]

survey-code's 404fd57 (pushed post-stand-down — message-crossing artifact,
no fault; work quality otherwise high, aligner neutrality confirmed
unchanged by its second consumer) reported a "fifth divergence": global
ornamentationMaps perform nothing. CONDUCTOR'S JAVA CHECK INVERTS IT:
both codebases route global maps through a DEDICATED PATH —
OrnamentationMap.java:230/:239 renderGlobalOrnamentationMap, ported at
Performance.ts:483 → OrnamentationMap.ts:346 — and the :268 local-header
gate is correct in BOTH because globals take the other path ("global ones
were already processed", Java's own comment). The probe called the
map-level method directly and missed the pipeline. Rulings:

AD-43.1 Global ornamentationMaps PERFORM (cross-part pools are their
stated purpose); §5.6 states the global semantics; NO PARITY entry (port
matches reference); 404fd57's contrary pin is DEFECT #1 for the audit.
The AD-36.1 decide-without-stopping test is TIGHTENED by this case:
"the renderer determines" means the PIPELINE, not the nearest method —
map-level probes must be confirmed through Performance.perform before
they license a no-op claim.
AD-43.2 w3-dims's commission REVISED: audit 404fd57 as unverified input
(supersedes the draft-audit commission; the drafts are subsumed by the
commit). Known audit heads: (i) AD-43.1's reversal, with an end-to-end
differential test through the perform pipeline; (ii) the sub-element
absence question — decision rule: if an absent <temporalSpread>/
<dynamicsGradient> performs identically to some neutral parameterization
(renderer-checked, pipeline-level), price deviation-from-neutral; if no
parameterization reproduces absence, ⊥ stands. @time.unit domain
mismatch stays ⊥ regardless (genuinely incomparable). (iii) AD-42.3's
whole-ornament unmatched pricing — verify 404fd57 implements
deviation-from-neutral, not the draft's flat ⊥. (iv) @note.order
enumerated pair as boolean01 row (AD-41.1) — 404fd57 ships finding-only.
Fix what fails, keep what survives, attribute honestly. Then cut 4.
AD-43.3 survey-code's stand-down is FINAL and enforced: no further
commits or pushes under any circumstances; anything in flight is
abandoned; w3-dims owns all of cut 3/4 territory. Not censure —
sequencing: two writers on one territory is the failure mode.

## 2026-08-10 — AD-44: ornamentation audit rulings [BINDING]

w3-dims's 404fd57 audit: AD-43.1 independently confirmed; AD-43.2(ii)
answered by measurement (absence reproduced exactly by a neutral
parameterization for BOTH sub-elements ⇒ deviation-from-neutral, ⊥ only
for @time.unit domain mismatch); six new defects (transition.to defaults
to transition.from — the writer's common encoding; the v2/v3 spread split
with three sub-defects incl. unit-suffix v3 detection and parseFloat
dropping "%"; @repetitions/@noteid as v3 GATES where presence of a no-op
value changes the performance; missing finite guards; poolSize unused;
scope-dependent unresolvable-<style> disposition — hazard instance #5:
"failed lookup assigns over the carried value, but only when the local
header exists"). All measured through performMsm. Rulings:

AD-44.1 STACKED GRADIENTS COMPOSE per anchor: renderer-verified addition
(setOrnamentDynamicsAtt adds; summed endpoints = summed ramp over a
shared pool). The per-anchor composed gradient is the compared object —
AD-37.4's articulation treatment, extended.
AD-44.2 STACKED SPREADS stay INDIVIDUAL aligner events: no composite
exists in the renderer's own vocabulary (two spreads of different
intensity do not sum to a spread). Obligation: MEASURE stacked spreads
through the pipeline once and document the finding; stacking detected ⇒
report note; the residual encoding sensitivity (one spread vs two halves)
is a DOCUMENTED limitation with the measurement attached, not a silent
one.
AD-44.3 FRAME PRICING per AD-40.2, as proposed: the compared object is
the RESOLVED PERFORMED frame — a v3-shaped frame on a v2-shaped ornament
performs no spread and compares as no spread; §5.6's three-unit-case
paragraph is RESCOPED to v3-shaped ornaments (where % resolves against
the principal's duration, MSM-dependent per R7) and gains the renderer's
actual v3-detection rule (frame.offset OR unit suffix on either frame
attribute). This is a §5.6-vs-renderer disagreement resolved for the
renderer — divergence #5 by the campaign's count, correctly not coded
around.
AD-44.4 AD-40.3 implemented in its L=1-airtight form (id-list pool ≤ L;
for L=1 transition.from is never performed under either reading).
AD-44.5 The two-commit plan is RATIFIED as proposed, incl. the honest
attribution of the adopted draft's sound parts (structure, aligner reuse,
@scale resolution). Cut 4 after.

## 2026-08-10 — Coordination: docs-declutter branch; W5 merge obligations

Peer session delivered branch docs-declutter (dcdecb9, off main, unpushed):
refactor/ARCHITECTURE.md → ARCHITECTURE.md (repo root, byte-identical,
verified 100% renames); campaign records → docs/history/<campaign>/ with
the convention written into docs/history/README.md (incl. a citation-
repoint perl command with a load-bearing lookbehind). W5 MERGE OBLIGATIONS
recorded now so the audit cannot miss them:
1. Land this campaign's record at docs/history/comparison/ IF docs-
   declutter has merged to main by then; else land at comparison/ and note
   the pending move. Either way the record follows the stated convention.
2. Re-point this branch's refactor/ARCHITECTURE.md and expression/*.md
   citations (src/comparison/**, comparison/**) using the recorded perl
   command; check Markdown links by hand (the sweep skips URLs).
3. Keep /ARCHITECTURE.md in .prettierignore through the merge (a prettier
   reflow would silently invalidate every line anchor while staying green).
4. refactor/state.json now lives at docs/history/refactor/state.json
   (kept — carries T13 acceptance criteria + mpmify consumer requests that
   tests/api/determinism.test.ts cites).
CONVENTION EFFECTIVE NOW for new campaign code: cite ARCHITECTURE.md BARE
(never refactor/ARCHITECTURE.md) — correct post-merge, zero fixup.

## 2026-08-10 — W3a cut 3 audit: 404fd57 repaired against the pipeline (w3-dims)

AD-43.2's commission. Nine defects found, eight repaired here, one referred. **Every renderer
claim in this commit is measured through `Performance.perform`**, per AD-43.1's tightened
standard — the test file's harness performs a real MSM against a real MPM and reads the notes
back, and no assertion in it rests on a map-level probe or on arithmetic I did myself.

ATTRIBUTION (AD-42.2). 404fd57's structure is kept and is good: the reader/distance split, the
aligner reuse, the resolution of `(from·scale, to·scale)` at read time so `@scale` is
unpriceable downstream, and the notes channel. What follows replaces its readings, not its shape.

**DEFECT 1 — AD-43.1's reversal.** The `global-scope-inert` gate returned zero atoms for any map
in `<global>`. Removed. Measured through the pipeline with identical content: a global map and a
part-local map both perform 80/100/120. Negative-controlled — restoring the gate fails three
tests.

**DEFECT 2 — `@transition.to` defaults to `@transition.from`, not to 0.** `DynamicsGradient.ts:25`.
Measured: a def carrying only `transition.from="-20"` performs 80/80/80, where the shipped
reading predicts 80/90/100. This is the common encoding, not a corner — `generateXML:86` omits
`transition.to` whenever it equals `transition.from`, so every round-tripped flat gradient is
spelled this way.

**DEFECT 3 — the v2/v3 `<temporalSpread>` split, three ways wrong.** v3-ness was detected by
`@frame.offset` alone, where `detectSourceFormat` also fires on a UNIT SUFFIX on either frame
attribute; `parseFloat("100%")` read 100 and dropped the unit; and — the decisive one — a
v3-sourced spread on a v2-SHAPED ornament **performs nothing at all**, because
`TemporalSpread.apply` reads the v2 fields and those keep their `0.0` initialisers. Measured:
`frame.start="-22.0" frameLength="44.0"` gives onsets −22/0/22; `frame.offset="-22ticks"
frameLength="44ticks"` gives 0/0/0, and the renderer logs that it will "spread nothing". Pricing
that as a −22/44 frame is attribute-tuple pricing, which AD-40.2 forbids. The full table is now
in the module doc: four cells, one of them dead, and the dead cell is modelled as the NEUTRAL
frame because that is exactly what it performs.

**DEFECT 4 — `@repetitions` and `@noteid` are v3 SHAPE GATES.** `isV3Ornament` fires on the mere
presence of `@repetitions` (any value, the schema default `0` included) or `@noteid`, and the v3
engine skips an ornament with no `@note.order`. Measured: adding `repetitions="0"` takes an
ornament from 80/100/120 to 100/100/100. Two documents differing only by an attribute that reads
as a no-op perform completely differently, and compared identical before this commit. The reader
now carries `shape` and emits no atom for a skipped ornament.

**DEFECT 5 — no finite guards (AD-42.4).** Now guarded at every numeric read.

**DEFECT 6 — `⊥` for an absent sub-element (AD-42.3, AD-43.2ii).** Answered by the test AD-43.2ii
sets: an absent `<dynamicsGradient>` performs exactly what `(0,0)` performs and an absent
`<temporalSpread>` exactly what `frame.start="0" frameLength="0"` performs, both measured through
the pipeline. A neutral parameterization reproduces absence, so absence has a neutral and prices
as a deviation from it. Unmatched ornaments now cost deviation-from-neutral per row, so a drop's
price depends on what the dropped ornament performs — a test pins that a ±40 gradient costs more
to drop than a ±1 one, which the flat `⊥` made equal. `@time.unit` domain mismatch stays `⊥` as
ruled.

**DEFECT 7 — AD-40.3 documented but not implemented.** `poolBound` was computed and never read.
A one-note pool now collapses BOTH families, and the second half is new: `DynamicsGradient.apply`
hands a lone chord `transitionTo·scale` and never looks at `transitionFrom`, and
`TemporalSpread.apply` places a lone chord at `frameStart + frameLength` OUTSIDE its loop, so the
frame becomes a rigid shift and `@intensity` goes inert. Both pinned against the renderer; a def
differing only in `@transition.from` now compares equal on a one-note pool, because it performs
identically. `poolBound` is honestly named an upper bound: an id naming no note contributes
nothing (measured — a one-ghost-id list performs nothing), so a list of length L gives a pool of
size ≤ L. At L = 1 the collapse is sound in both worlds, which is the only case it is used in.

**DEFECT 8 — the style is CARRIED, and a failed switch differs by SCOPE.** `OrnamentationMap.apply`
assigns `style = localHeader.getStyleDef(…)` unconditionally when a local header exists, so a
failed lookup overwrites the carried style with null; with no local header that assignment never
runs and the guarded global lookup fires only while `style` is still null. `Part.parseData:113-118`
creates a header for every part, so part-local maps always take the first branch and `<global>`
maps always the second. Measured end to end: a `<style>` naming a nonexistent style SKIPS every
later ornament in a part-local map (100/100) and changes nothing in a global one (80/120). And
the stronger consequence, also measured: **in a global map every `<style>` after the first
successful one is ignored outright**, valid or not. AD-35.4's hazard class in a fifth shape — a
failed lookup assigns over the carried value, but only when the local header exists. Both
branches are reproduced; the reader no longer resolves per entry.

**DEFECT 9 — the two missing rows.** `@note.order` is now the boolean01 gain row AD-41.1 ruled,
justified by measurement as well as by ruling: ascending performs 80/100/120 and descending
120/100/80, so filing the pair as a structural finding scored two documents that invert an
arpeggio at `d_ornamentation = 0`. Absent ≡ ascending, which is the renderer's own initialiser.
An explicit id list stays a finding (naming notes is an identity claim). `@repetitions` is a
count row admitting meico's `-1` fill-frame extension. `UNCOVERED_DIMENSIONS` is unchanged at
three — the imprecision domains — since ornamentation already had rows.

[DECISION, needs ratification] AD-42.4 routes unusable values to skip-and-report. Measured, the
renderer does not skip for two of them: `scale="abc"` writes **velocity NaN** onto every note in
the pool and a v2 `frameLength="abc"` writes **date.perf NaN** — R24's exact condition, which
AD-1 and AD-33.1 price at `⊥` because the note vanishes from the MIDI export. Those two take `⊥`
and the rest take the renderer's own fallback (`parseOrnamentRepetitions` logs and returns 0;
`readV3FrameValue` logs and applies the v3 default). Implementing the ruling's route literally
would price a note-destroying document at zero, so this departs from its wording and reports the
measurement instead.

[FLAGGED, implemented renderer-true pending AD-44] §5.6's three-unit-case paragraph presumes a
`%` frame is a comparable quantity. It is — on a v3-SHAPED ornament, where the frame resolves
against the principal note (measured: notes laid out at 0/180/360/540/720 from `frameLength="100%"`
over a 720-tick principal). On a v2-shaped ornament a `%` frame performs nothing, so it is not a
unit question at all. Implemented as the resolved performed effect under AD-40.2 and reported for
rescoping rather than coded around.

[REFERRED, not decided] Stacked ornaments at one date COMPOSE additively — two identical
ornaments over one pool perform 60/100/140, because `setOrnamentDynamicsAtt` adds to the existing
marker. That is AD-37.4's situation, and without the same treatment two documents encoding one
ramp as one ornament or as two half-ornaments compare unequal. Gradients compose closed-form over
a shared pool; spreads with differing `@intensity` do not. Left uncomposed pending a ruling
rather than half-solved.

A transliteration was unavoidable: the comparison zone may not import `TemporalValue.ts`, so the
v3 value grammar is copied and differential-tested against the real `parseTemporalValueLenient`
over a 23-case corpus including every rejection form. Same discipline as §5.4's `accentuationAt`.

Every repair is negative-controlled: reverting the `transition.to` default, the dead frame cell,
the pool collapse, the shape gate, the scope branch, the finite guard and the global gate each
fails its own tests and nothing else (1, 1, 3, 2, 2, 2, 3 tests respectively), and the file
restores green.

Gate: `npm run verify` green before committing — 104 files, 4545 passed + 1 skipped (was 4523 +
1). 39 tests in the ornamentation suite, replacing 17. eslint and prettier clean on all five
touched files.

## 2026-08-10 — W3a cut 3 closed: AD-44 implemented (w3-dims)

AD-44.1, AD-44.2's measurement obligation, and AD-40.1's delegated DESIGN edit. Cut 3 is
complete: rows, reader, distance, aligner's second consumer, and the §5.4/§5.6 cross-reference.

**AD-44.1 — stacked gradients compose, and the law has a second half the ruling did not need to
state.** `composeAnchors` groups atoms by anchor and sums endpoints, measured: `(-20,20)` stacked
with `(-10,30)` performs 70/110/150, identical to a single `(-30,50)`. The second half is
DIRECTION. A `descending pitch` ornament ramps over the same pool backwards, so it contributes
SWAPPED endpoints — measured, ascending `(-20,20)` stacked with descending `(-10,30)` performs a
flat 110/110/110, which is exactly the single gradient `(10,10)`, and the composition is closed
under it because the reversal is an index reflection rather than a different shape. Composition
is confined to a SHARED pool: the pitch-ordered forms and an absent `@note.order` all take "every
note at this date" and compose; an explicit id list names its own notes and composes only with an
identical list; a v3-shaped ornament generates its own notes and never composes. Spreads stay
individual events per AD-44.2, so the composed gradient rides on the group's first atom and the
rest keep their frames under a neutral gradient — which is what makes an ornament that carried
only a gradient collapse away for free, and therefore what makes the two encodings compare equal.

**AD-44.2's measurement obligation, discharged — and it NARROWS the ruling's premise.** AD-44.2
rests on "two spreads of different intensity do not sum to a spread", which is true and now
pinned: `(-22,44)` stacked with `(0,360, intensity 3)` performs onsets −22/45/382, which is no
single frame. But EQUAL-intensity spreads DO sum: `(-22,44)` stacked with `(-100,200)` performs
−122/0/122, exactly the single frame `(-122,244)`, because the offsets are affine in the same
index. So the composite exists for the commoner case and the residual encoding sensitivity is
narrower than the ruling assumed. Implemented AS RULED — spreads stay individual events — with
both measurements pinned and the residual pinned as its own test: two documents that PERFORM
identically compare unequal, which is AD-44.2's documented limitation carrying its evidence
rather than its prose. If the conductor wants the equal-intensity case composed, the law is
`frameStart` and `frameLength` add and `@intensity` is the guard; it is a one-branch change.

[SELF-CORRECTION, found by the failing test rather than by review] Composition exposed a
double-count in the neutral counterpart. `@note.order` has NO performed effect of its own — it
orders the pool the ramp runs over, exactly as `@loop` shapes the curve it opens, which is §4's
own argument for that row. Zeroing it in the neutral counterpart charged a dropped ornament one
JND for having been ascending, on top of the ramp whose magnitude was already priced, and charged
a gradient composed away under AD-44.1 for an ordering whose whole effect had moved into the
composite. The counterpart now keeps it. `@repetitions` is deliberately NOT treated the same way:
a dropped v3 figure really is a missing repetition count.

DESIGN edits, both delegated by AD-40.1/AD-41.1 to this commit and no wider: §5.6 gains the
`@scale` gating paragraph with the AD-40.2 performed-pair rule and the explicit contrast with
§5.4, plus the `@note.order` boolean01/id-list wording with its measurement; §5.4 gains the
reciprocal sentence, so neither section can be inferred from the other. **AD-44.3's rescoping of
§5.6's three-unit-case paragraph is NOT in this commit** — that ruling names no editor and the
standing rule leaves DESIGN amendments with the conductor. The code already implements it; the
prose is the conductor's to align, and it is asked for in my report.

Negative controls: disabling composition fails 2 tests, removing the endpoint swap fails 1,
ignoring pool identity fails 1; the file restores green each time.

Gate: `npm run verify` green before committing — 4552 passed + 1 skipped (was 4545). 46 tests in
the ornamentation suite. eslint and prettier clean on every touched file.

## 2026-08-10 — AD-45: cut 3 closed; composition law completed [BINDING]

e7ad6b7 + f9b6081 accepted (85 tests across the two, all repairs
negative-controlled per-defect; the @note.order neutral-counterpart
self-correction found by a failing test is noted with approval).

AD-45.1 AD-44.1's law gains its measured second half: DIRECTION is part
of the composition (descending = index reflection, swapped endpoints;
ascending (-20,20) + descending (-10,30) = flat (10,10), performed
110/110/110).
AD-45.2 AD-44.2 AMENDED on the new measurement: EQUAL-INTENSITY spreads
compose (frameStart/frameLength add when @intensity matches — measured
(-22,44)+(-100,200) = (-122,244) exactly). The one-branch composition is
ADOPTED for cut 4's window: the pinned residual currently violates
encoding invariance for the commoner case, and the module's central
promise (identical performances compare equal) outranks the convenience
of uniform treatment. Unequal intensities stay individual events with
the documented, evidence-carrying limitation as shipped.
AD-45.3 §5.6 edits DELEGATED to w3-dims's next commit: the AD-44.3
three-unit-case rescope (v3-shaped ornaments only; v3 detection =
frame.offset OR unit suffix) AND one added sentence stating the v3 gate
out loud: the presence of @repetitions or @noteid makes an ornament
v3-shaped, and a v3-shaped ornament without v3 @note.order performs
NOTHING — an attribute whose presence deletes the performance. The
decide-without-stopping route taken there was correct (renderer
determines, DESIGN silent, pipeline evidence attached).
Cut 4 (imprecision ×3) proceeds.

## 2026-08-10 — AD-45.2/45.3 executed; cut 3 fully discharged (w3-dims)

The two items AD-45 delegated to this commit, so that nothing ruled is left undone before cut 4.

**AD-45.2 — equal-intensity frames now compose.** `TemporalSpread.apply` writes slot `i` of `n`
at `(i/(n−1))^intensity·L + s` and ADDS it to any offset already there, so with one shared
exponent the sum is `(i/(n−1))^intensity·(L₁+L₂) + (s₁+s₂)` — another frame of the same shape.
`composedSpread` sums `frameStart` and `frameLength` across an anchor when `@intensity` AND the
domain match, and declines otherwise. The residual test INVERTS accordingly: the two documents
that perform onsets −122/0/122 either way now compare at distance 0, where the shipped version
pinned them unequal. Unequal intensities keep the documented limitation, and its test now pins
the mechanism directly — two frames survive composition rather than one sum and one neutral —
so the evidence survives the constant becoming correct, which is the move RG-2 and the K=4 pin
established.

**AD-45.3 — the two §5.6 edits**, executed under the explicit delegation and no wider. §5.6 gains
the shape paragraph, stating out loud that `@repetitions`/`@noteid` presence makes an ornament
v3-shaped and that a v3-shaped ornament without `@note.order` performs NOTHING, with the measured
80/100/120 → 100/100/100. And the three-unit-case paragraph is rescoped to v3-shaped ornaments,
carrying why: `TemporalSpread.apply` reads the v2 fields, so on a v2-shaped ornament a v3 frame
spreads nothing (measured −22/0/22 against 0/0/0 for the same numbers), and v3 detection is the
renderer's own rule — `@frame.offset` OR a unit suffix on either frame attribute.

Negative controls: removing the intensity guard fails 1 test, disabling frame composition fails 1.

Gate: `npm run verify` green before committing — 4553 passed + 1 skipped (was 4552). 47 tests in
the ornamentation suite. eslint and prettier clean.

[CUT 4 HANDOFF NOTE — the renderer study is done and recorded so it is not repeated.] §5.9's
degenerate table is confirmed against `RandomNumberProvider` by execution on five of six rows,
and ONE ROW'S MECHANISM IS DIFFERENT FROM WHAT THE TABLE SAYS. Measured, eight draws each:
uniform with `limit.*` absent gives `[0,0,0,…]`; gaussian with `deviation.standard` absent gives
`[0,…]`; brownian with `limit.*` absent gives `[0,…]`; compensatingTriangle with `clip.*` absent
gives `[0,…]`; gaussian with `limit.*` absent gives real unconditioned draws
(`2.99, −2.32, −6.3, …`), which is AD-14iv's untruncated `N(0,σ)` exactly. But **triangular with
`clip.*` absent returns `null`, not `0`** — `clip(d)` compares against `highCut`/`lowCut`, which
are `null`, so every draw takes a branch returning `null`, and the field is typed `number` while
holding it. The performed effect is still δ₀ because `ms + null` is `ms` in JS arithmetic, so the
table's CONCLUSION stands; the mechanism does not, and it is a trap for exactly the finite-guard
discipline AD-42.4 just imposed — a reader checking `Number.isFinite` sees `null`, not a number,
and must not route it to `⊥`. Whether any path stringifies it (`parseFloat(String(null))` = NaN)
is unverified and is the first thing cut 4 should check in `ImprecisionMap.applyTo`.

## 2026-08-10 — AD-46: w3-dims handoff; cut-4 commission [BINDING]

adb9c4a accepted — everything ruled through AD-45 is implemented, nothing
delegated outstanding; the inverted residual test (identical performances
now compare at 0) and the mechanism-level relocation of the
unequal-intensity limitation are both the campaign's established
evidence-preservation move. w3-dims's tenure: the 404fd57 audit (9
defects, 8 repaired + 1 referred), cut 3 closure, AD-45 implementation —
4523 → 4553 tests, every claim pipeline-measured, every repair
negative-controlled. HANDOFF GRANTED at the clean pushed boundary,
explicitly for the AD-42 reason (no half-written module in a shared
worktree).

CUT-4 COMMISSION (successor): §5.9 + AD-14 in full (W₁ closed forms;
Gaussian as the AD-14iv mixture; W₂ three-term with ρ-table fast paths +
re-derivation pins; quantile quadrature with breakpoint-aware nodes;
Φ/Φ⁻¹ per Acklam with re-derivation tests; timingBasis family-dependence;
processParameters; ~20 registry rows closing the skip-list to ZERO;
capped-density check per AD-36.2). INHERITANCES (verified by w3-dims,
recorded here): (1) the degenerate table executes as ruled EXCEPT the
triangular-clip mechanism — absent clip.* yields draws of NULL (typed
number), δ₀ only because ms + null coerces; FIRST TASK: trace whether any
path stringifies it (parseFloat(String(null)) = NaN ⇒ genuine ⊥) through
ImprecisionMap.applyTo end to end before writing the reader. (2)
DistributionData initialises every parameter to null — the degenerate
table's whole mechanism. (3) AD-29's any-entry span rule is in
spanEnds.ts, but AD-35.4's hazard question has NOT been asked of §5.9's
remaining guards — ask it of every one; ornamentation yielded two fresh
instances.

## 2026-08-10 — Capacity event: weekly limit; resumption plan

Both live workers (w3-dims post-handoff, w3-imp freshly commissioned) hit
the ACCOUNT WEEKLY limit at 20:54 (resets 2026-08-16 02:00 Europe/Berlin);
the fresh spawn died before its first action, so new agent spawns are
capped too — delegation is unavailable until the reset. Campaign state at
this boundary: HEAD 2dc4d37 pushed, tree clean, verify green 4553+1;
W3a cuts 1-3 CLOSED across ten dimensions; cut 4 (imprecision ×3) fully
specified by AD-46's commission + inheritances and NOT started.

RESUMPTION PLAN (for any future session or the conductor's own hand):
1. Cut 4 exactly per AD-46 (the commission prompt is reproduced in the
   w3-imp spawn; its content is AD-46 + standing policies).
2. Then W3b: aggregation/segments/closing table (§7, AD-19), facade
   (§9 as adjudicated incl. MINOR-2 −0 normalization and MINOR-4's
   malformed-value table), P-C5 cross-module test, W3 wave gate
   (independent verification agent, with EXTRA weight on any cut the
   conductor implements personally — self-review is not review).
3. Then W4 (diff, corpus, scape) and W5 (audit, docs obligations incl.
   AD-26.4/AD-27.7, novelty re-sweep AD-26.5, merge per the docs-declutter
   obligations journaled above).
CONDUCTOR MAY implement cut 4 personally in the interim (small, frequent,
green/gated/pushed commits; the W3 gate then audits it with independent
eyes after the reset).

## 2026-08-10 — Coordination update: docs-declutter tip moved

dcdecb9 → 14edf1f (second commit repoints refactor/state.json citations
the first pass missed; journals only, anchors hold). All four journaled
W5 obligations stand. Repoint command CORRECTED (add state.json to the
alternation; docs/history/README.md carries the fixed version and
excludes itself from the sweep — mirror that exclusion). Their
test-merge of docs-declutter into layers-to-staffs is clean (4059 green):
the de-clutter merge waits only on the user's decision.

## 2026-08-10 — AD-47: cut-4 first task answered by execution; conductor at the wheel

Delegation capped until 2026-08-16 (weekly limit); the conductor executed
AD-46's first task personally. ANSWER, measured through performMsm on a
chord-bearing part map (pinned as tests/comparison/imprecisionDegenerate.
test.ts, with a non-vacuity control): the clip-less triangular performs
EXACTLY no imprecision — the null draw coerces arithmetically
(attValue + null = attValue), String() wraps only the finite sum, NO path
stringifies the raw null (no parseFloat(String(null)) NaN route), the
chord shake path is equally benign (shake(null) lands 0), and the only
render effect is a byte-level re-serialization fingerprint ("0.0" → "0")
with no numeric content. CONSEQUENCE for the cut-4 reader: the degenerate
table stands as ruled — clip-less triangular/compensating declare δ₀, NO
⊥ from this route; the finite-guard discipline must treat null as
"parameter absent" (δ₀ path), never route it to ⊥.

Coordination: docs-declutter is authorized and landing on main —
the docs/history/comparison/ landing spot is CONFIRMED, the W5
contingency is dropped; after their push, compare-campaign is one merge
behind main and the conductor will merge main in and re-measure the
eslint.config.js/.prettierignore conflict surface personally (keep
/ARCHITECTURE.md in .prettierignore — load-bearing).

## 2026-08-11 — Coordination: main = 7709080; merge deferred to settled main

docs-declutter landed (main 9974ba3 → 7709080; docs/history/ convention
live; AD-47's contingency fully discharged). layers-to-staffs merges into
main shortly, so main will move again — [DECISION] the conductor measures
the compare-campaign↔main conflict surface ONCE against the settled main
(after the layer→part ping), not against 7709080; measuring against a
base about to go stale is the peer's twice-burned trap, adopted as our
lesson without paying for it. Cut-4 implementation continues meanwhile
(conductor's hand; merge and citation sweep are independent of it).

## 2026-08-16 — AD-48: resumption after weekly reset; main absorbed [BINDING]

Delegation capacity restored; USER DIRECTIVE: subagents run on OPUS 5,
never Fable — enforced belt-and-braces (explicit model param on every
spawn; the global CLAUDE_CODE_SUBAGENT_MODEL=opus setting points the same
way). Rulings and state:

AD-48.1 Settled main (b37abcf: docs-declutter + layers-to-staffs) merged
into compare-campaign (dc81ab0). Conflicts: .prettierignore (both sides
kept; `comparison/` ADDED with the docs/history/ rationale — hand-formatted
journals, keeps repo-wide format:check viable for the wave gate) and
PARITY.md (purely additive, both sections kept: CMP1 + processSlur).
eslint.config.js auto-merged. Verify green on the merged tree: 4624 + 1.
AD-48.2 Citation policy for the new layout: HISTORICAL campaign records
(LOG, panel reports, surveys) keep contemporaneous paths — the de-clutter
convention's own precedent; only the LIVE charter repoints (done:
CAMPAIGN.md G3 → bare ARCHITECTURE.md). Code cited bare already.
AD-48.3 The conductor's cut-4 stage-1 draft (distributions.ts, written
during the capacity gap, TWO KNOWN TYPE ERRORS, zero tests) is relocated
to comparison/drafts/distributions.draft.ts as DECLARED unverified input
for the resumed cut-4 worker — the AD-42.2 treatment, self-applied: audit
every claim, keep what survives, rewrite what does not, attribute
honestly. It never entered a gated commit as src.

## 2026-08-16 — W3a cut 4, part 1: the renderer study, and §5.9's law mathematics (w3-imp)

AD-46's commission, resumed under AD-48.3. This commit is the DISTRIBUTION MATHEMATICS only —
`src/comparison/distributions.ts` + 51 tests. The reader, the density, the registry rows and
the adversarial family follow. The conductor's draft is deleted here, superseded; the audit
verdicts are below, per AD-42.2.

**THE RENDERER STUDY, done first and recorded so it is not repeated.** Every claim executed,
the pipeline-level ones through `performMsm` per AD-43.1. Nine findings, five of which §5.9
does not state and two of which contradict it.

1. **ONE RULE GENERATES THE WHOLE DEGENERATE TABLE: an absent parameter reads as 0.**
   `DistributionData` leaves every absent attribute `null`, the provider assigns it into a
   `number`-typed field, and JS coerces `null` to 0 in arithmetic and in relational
   comparison. Every row of §5.9's table follows, and so do rows it does not have. Measured
   bit-for-bit against explicit controls: uniform with `limit.upper` absent draws **exactly**
   what `limit.upper="0"` draws; gaussian with `limit.upper` absent is **exactly** the
   truncation to `[lower, 0]`; triangular with `mode` absent is **exactly** `mode="0"`.
   §5.9's table is therefore right about the case it names — BOTH limits absent — and silent
   about the far commoner one. **A single absent limit is not δ₀ at all**; it is a genuine
   law of half the authored width.
2. **`⊥` ROUTES INTO §5.9 EXIST — so AD-36.2 forces the capped density.** Four, all measured
   through `performMsm`, all producing `milliseconds.date="NaN"` and therefore notes that
   vanish from the MIDI export (R24's exact condition):
   (a) an EMPTY `distribution.list` (`series[i % 0]` is `series[NaN]` = `undefined`);
   (b) any unusable numeric parameter (`limit.lower="abc"` → NaN through every draw);
   (c) `compensatingTriangle` with `degreeOfCorrelation` absent or `0` — the division
   `(prev − lower)/degree` is ±∞, the triangular of infinite limits is NaN, and the clip
   passes NaN through (measured: first note fine, every later note NaN);
   (d) an unusable `milliseconds.timingBasis` (`"abc"`, `"0"`) makes the index NaN or ∞ and
   `RandomNumberProvider.requireUsableIndex` THROWS — the whole render aborts.
   AD-47's answer stands untouched: a NULL draw is the δ₀ path and must never be routed to ⊥.
   The finite-guard discipline has to distinguish `null` (absent ⇒ 0) from `NaN` (unusable
   ⇒ ⊥), which is exactly the trap AD-45's handoff note flagged.
3. **`@seed` ON A CORRELATED FAMILY DESTROYS THE PERFORMANCE — §4 says it is inert.**
   `doHandover` seeds the walk's first value through `setInitialValue`, and `setSeed` runs
   AFTERWARDS and CLEARS the series (`RandomNumberProvider.ts:186-190`). The next draw reads
   `series[series.length − 1]` on an empty array. Measured end to end: a `brownianNoise` with
   `seed="99"` gives `milliseconds.date="NaN"` on **every** note; without the seed the same
   document performs normally. §4's exclusion list says "`@seed`: changes no distribution law;
   reported as an inert difference" — true for the four i.i.d. families, **false for the two
   correlated ones**, where it is the difference between a performance and no notes at all.
   PARITY: Java has the identical ordering (`ImprecisionMap.java:601-620`,
   `RandomNumberProvider.java:163-166`) but `ArrayList.get(-1)` throws
   `IndexOutOfBoundsException` rather than yielding `undefined`, so the reference CRASHES
   where this port emits NaN. Both destroy the performance; the mechanisms differ. Flagged for
   the conductor as a PARITY.md question, not blocking — this cut prices the span `⊥` either
   way, which is what "no performed value" means (AD-1/R21).
4. **THE CORRELATED HANDOVER IS UNREACHABLE FOR AUTHORED DOCUMENTS.** `getHandoverValue`
   reads `attribute('milliseconds.date', ddNext.xml)` off the `<distribution.*>` ELEMENT.
   Nothing in the pipeline ever writes that attribute onto an MPM map entry — verified by
   grepping every `milliseconds.date` write in `src/`; they all target MSM map entries. So the
   handover always returns null, `doHandover` always takes its `Math.random()` branch, and
   **every correlated span starts fresh and independent of its predecessor**. That simplifies
   the reader decisively: a span's law is a function of its own attributes alone.
5. **THE CORRELATED FAMILIES HAVE NO SINGLE MARGINAL — measured, not argued.** Sampling the
   marginal at index `j` from 20 000 INDEPENDENT chains (a time average over one chain
   measures the same thing only after mixing, and its error is autocorrelation rather than
   sampling):
   - `brownianNoise` from the FACTORY start is Uniform(lower, upper) at every index — KS
     0.005–0.012 against a 0.0096 noise floor at that sample size. That is the rejection
     walk's stationary law and it is provable: a symmetric proposal with reject-if-outside
     satisfies detailed balance against the uniform.
   - But the renderer does not use the factory start. `doHandover`'s fallback overwrites it
     with `Math.random()·(R/2) + lower + R/4`, i.e. **Uniform over the MIDDLE HALF**. Measured
     at index 0 with limits ±30: KS 0.0058 against U(−15, 15). The walk then diffuses outward
     and reaches U(−30, 30) only after ~1000 indices at `stepWidth.max=3` (KS 0.0145, σ 16.92
     against 17.32), or ~10 at `stepWidth.max=30`.
   - `compensatingTriangle` is index-0 uniform over the same middle half, then CONTRACTS:
     σ 8.69 → 8.30 at `degreeOfCorrelation=2`, → 4.91 at 5, and EXPANDS to 20.76 with atoms at
     both limits at 0.5. Its stationary spread is a function of `degreeOfCorrelation` and has
     no closed form.
   §5.9's "compare marginals" therefore names a quantity that does not exist for these two
   families as a single law. The next commit's reader has to choose one and say so; the
   choice, the measurement and the request for ratification go with it.
6. **`<style>` ENDS AN IMPRECISION SPAN ONLY IF IT CARRIES `@name.ref`** — AD-35.4's hazard
   question, answered on the entry list itself. `GenericMap.parseData:143-146` skips a child
   with no `@date` AND a `<style>` with no `@name.ref`, so the ENTRY LIST the any-entry rule
   indexes is already filtered. Measured: a `<style name.ref="none">` at 720 leaves the notes
   at 720/1440/2160 exactly unperturbed (the δ₀ gap §5.9 promises); the same `<style>` with
   the attribute REMOVED performs bit-identically to no style at all. Same for an undated
   `<distribution.uniform>`: invisible, governs nothing, ends nothing.
7. **Two distributions at ONE date: the first governs a zero-width span and performs nothing**
   — its `endDate` is its own `startDate`, so the note loop breaks immediately. Measured with
   a first distribution that would have shifted everything by −300 ms: bit-identical to the
   second alone.
8. **A domain-less `<imprecisionMap>` and an unknown `distribution.*` name both perform
   nothing** (the domain switch's `default: return`, the type switch's `default: continue`).
   Both measured identical to no map at all. `spanEnds.ts` already carries the bare
   `imprecisionMap` for its span rule, which is right — it has entries even though it renders
   nothing.
9. **The tuning domain is inert, confirmed and now cited.** `renderImprecisionToMap` really
   does write `tuning.offset` (`ImprecisionMap.ts:435-444`), so "until the renderer reads it"
   is the wrong test; the right one is whether anything reads it back, and nothing does —
   `src/expression/applier.ts:1496` and `selection.ts:28` record the same verified finding for
   the write side. §5.9's "Tuning domain: inert (R9b)" stands, on better evidence.

**DRAFT AUDIT (AD-42.2), block by block.** The draft's two known type errors were real
(`gauss10` and `NeumaierSum` do not exist — they are `gaussLegendre10` and `CompensatedSum`
with a `.total` getter; and `bisectSignChange` returns `number | null`, which the draft pushed
into a `number[]` and returned as a `number`). Zero of its claims had been checked.

- **Law union — KEPT in shape, REWRITTEN in substance.** Five laws is the right vocabulary.
  But the draft folded clipping into `TriangularLaw`'s parameters, where the renderer composes
  it (`this.clip(this.triangularDistribution(…))`); it is now a `ClippedLaw` WRAPPER, which
  then also serves the compensating triangle and the correlated start value, and whose atoms
  at the bounds fall out of one implementation. `GaussianLaw`'s `number | null` limits are
  gone: an absent limit reads as 0 (finding 1) and the mixture then produces the untruncated
  law with no null branch. `Delta0Law` became a point mass at any value, which the degenerate
  geometries need.
- **`phi()` — REJECTED.** Abramowitz–Stegun 7.1.26 at `|ε| < 7.5·10⁻⁸`, which misses §5.0's
  own epsilon claim for this family by five orders; the draft's own comment called it
  "refined below the special-function ε", which it is not. Replaced by an all-positive
  confluent series below `z = 2` and a continued fraction above it. **Measured 1.7·10⁻¹⁵
  absolute and 4.9·10⁻¹⁴ relative in the left tail**, against a composite GL-10 quadrature of
  the density that shares no coefficient with it. A hard-coded Cody table was written first
  and thrown away: its correctness would have rested on forty transcribed digits.
- **`phiInv()` — KEPT.** Acklam's coefficients survive (§5.0's record names them, and they
  are the half of the pair that was right). The Halley step is now skipped where the density
  underflows, since the correction there is 0/0 rather than small; the round trip is pinned at
  `1e-13` relative rather than asserted in prose.
- **`triangularCdf` — REWRITTEN, defect found.** The draft's textbook formula returns 1 for
  `x ≥ upper`, which is FALSE when `mode > upper`: the renderer's branch fraction then exceeds
  1, only the rising branch runs, and the true CDF at `upper` is `span/ca < 1`. Measured, a
  `mode="99"` triangular on `±30` draws values up to ~58. The CDF is now written as the
  inverse of the renderer's own two-branch quantile, so the two cannot disagree.
- **`wasserstein1` — mechanism REJECTED, framing KEPT.** The x-domain choice is right and is
  now measured exact. The draft's crossing search probed at quarters and hand-rolled what
  `integrateAbsolute(f, a, b, splitPoints)` already does. Replaced: structural split points
  are the quadratic's vertex from a three-point fit — exact for the polynomial families, where
  `F_A − F_B` really is a quadratic between breakpoints — PLUS a K=16 subdivision, both
  emitted, per AD-34.1's "both sets, never one".
- **`quantile` — REWRITTEN for list and triangular.** The draft's list quantile
  `floor(u·n)` is the wrong generalized inverse (it is `ceil(u·n) − 1`); its triangular
  clamped into the clip inside the law rather than through the wrapper; its Gaussian branch
  returned `bisectSignChange`'s possible null as a number.
- **`wasserstein2Decomposition` — structure KEPT, panels and floor REWRITTEN.** The panel /
  integrate / four-field / AD-32-floor structure is sound and is kept. Two defects: the tail
  refinement fired only for Gaussians, but the TRIANGULAR's quantile has infinite DERIVATIVE
  at `u = 0` (`Q = lo + √(u·s·a)`), which measured σ for `T(−30, 30, 0)` as 12.24716 against
  the closed form `30/√6 = 12.24745` and put `ρ(uniform, triangular)` 6.7·10⁻⁶ off `7√2/10` —
  refinement is now unconditional, and costs nothing on the families with no singularity
  because GL-10 is exact on their quantiles anyway. And the draft's noise-floor scale included
  `sigmaA, sigmaB` in its own `Math.max`, making the floor that decides whether σ is 0 depend
  on σ; the scale is now the means alone.
- **`supportHull` — REWRITTEN.** The draft's triangular support assumed the clip bounds it
  (wrong for a mode outside the limits) and always spent ±12σ on a Gaussian even when the
  truncation is live. Restricting a pure truncated normal to `[lower, upper]` and the σ-mesh
  to ±6σ took `W₁` between two Gaussians from **7.07 ms to 1.57 ms per call with every closed
  form unchanged at machine precision**.
- **`lawsEqual`, `cdfBreakpoints`, the `q^N`-in-log-space mixture weight, the identity
  short-circuit, and the x-domain/u-domain split — KEPT.** The mixture weight in particular is
  exactly right and is the draft's best block: `q^10000` underflows below `q ≈ 0.9977` and the
  log form says so out loud.

**MEASURED, and these are §9.3's `imprecision` family**: `Φ` 1.7·10⁻¹⁵ absolute / 4.9·10⁻¹⁴
left-tail relative; `W₁` against six closed forms ≤ 3.6·10⁻¹⁶ relative — machine precision,
**Gaussian-vs-δ₀ included at 1.9·10⁻¹⁶**; `W₂` moments ≤ 1.5·10⁻¹⁵; `ρ(U, T)` bit-exact
against `7√2/10`; `ρ(U, N)` 1.1·10⁻¹⁵ against `√(3/π)`; §1.2's closing identity 4.1·10⁻¹⁴
relative over all 64 ordered pairs of a nine-law family.

**BOTH ρ CONSTANTS RE-DERIVED INDEPENDENTLY** before they were compared to anything, and the
derivations are in the test file rather than in a citation: `ρ(U, T) = (7/60)·√72 = 7√2/10`
from `∫₀¹(u−½)Q_T(u)du = 2(1/8 − 1/15) = 7/60` with `σ_U = 1/√12`, `σ_T = 1/√6`; and
`ρ(U, N) = √12/(2√π) = √(3/π)` from `E[X·Φ(X)] = 1/(2√π)`.

[DECISION, reported] The ρ constants are **test references, not code fast paths**, which
deviates from §5.9's "closed forms for clean family pairs". Reason: one code path cannot
disagree with itself, and a closed form that LICENSES the general quadrature is worth more
than one that bypasses it — the same argument that makes `quadrature.ts` re-derive its GL-10
table in a test rather than at run time. The quadrature reproduces both constants to the
last bit and to 1.1·10⁻¹⁵ respectively, which is the evidence a fast path would have hidden.

[DECISION, reported] **An inverted-limit triangular (`limit.lower > limit.upper`) has no
law**, and `triangularLaw` returns null so the caller reads `⊥`. This is §5.8's pedal
precedent rather than a new rule: with the limits inverted the renderer's two branches run in
opposite directions, so `u ↦ x(u)` is not monotone and there is no distribution function to
integrate — measured, the "quantile" jumps DOWN by 132 at `u = 0.5`. Exactly the disposition a
non-monotone pedal date component gets (AD-35).

Gate: `npm run verify` GREEN before committing — 107 files, 4675 passed + 1 skipped (was
4624 + 1). 51 new tests. eslint and prettier clean on both files. The draft is deleted in this
commit, superseded by what the audit kept.

## 2026-08-16 — AD-49: cut-4 commit-1 rulings [BINDING]

8a4177b accepted (51 tests; the draft audit's verdicts — incl. rejecting
the conductor's own Φ block at five orders past the claimed ε — are the
AD-42.2 discipline working without regard to authorship, which is the
point). Rulings:

AD-49.1 (finding 1) The degenerate table GENERALIZES: absent parameter ≡ 0
(one rule, all rows) — and gains the single-absent-limit rows the table
was silent on (absent limit.upper ≡ limit.upper="0" etc., measured
bit-identical). §5.9 table amendment DELEGATED to the reader commit.
AD-49.2 (finding 2) Four measured ⊥ routes ⇒ AD-36.2's capped density is
FORCED for all three imprecision dimensions; the guard distinguishes null
(absent ⇒ 0, AD-47) from NaN (unusable ⇒ ⊥). The timingBasis
OutOfRangeError abort joins the renderer-error causes.
AD-49.3 (finding 3) @seed on a correlated family: PARITY ENTRY YES —
delegated to the reader commit. Classification: failure-mode divergence on
defective input (Java crashes IndexOutOfBoundsException; port renders
NaN-poisoned output; both destroy the performance). §4's @seed sentence
gains the correlated-family exception (same delegation). Comparison
prices the span ⊥ either way, as proposed.
AD-49.4 (finding 5, the open question) RATIFIED: the correlated families'
declared marginal is the INDEX-0 construction (Uniform over the middle
half of [limit.lower, limit.upper]; clipped for compensatingTriangle) —
exact at a point every span has, document-determined, renderer-sourced;
the stationary envelope is exact only asymptotically (measured ~1000-index
mixing at stepWidth 3, which real spans may never approach). Ship with
processParameters + the index-dependence report note as proposed; the
mixing-time measurement goes into the module doc as the reason index-0
won.
AD-49.5 (decision a) RATIFIED: the ρ constants are TEST REFERENCES, never
code fast paths — one code path cannot disagree with itself, and the
closed form that LICENSES the general quadrature is worth more than one
that bypasses it (the GL-table re-derivation precedent). §5.9 wording
tweak delegated.
AD-49.6 (decision b) RATIFIED: inverted-limit triangular declares NO law
and reads ⊥ (non-monotone inverse, measured −132 jump) — the AD-35
precedent applied, not a new rule.
AD-49.7 (finding 6) Hazard instance #6 recorded: a <style> ends an
imprecision span only WITH @name.ref (parseData filters before indexing);
§5.9's span-rule wording gains it (delegated). Findings 4 and 7–9
accepted as measured (handover unreachable ⇒ spans independent;
zero-width first span at duplicate dates; domain-less/unknown-name maps
perform nothing; tuning inert on write-but-never-read evidence).
AD-49.8 The §5.0 epsilon record supersession is accepted (measured
Φ 1.7e-15 abs / W₁ ≤ 3.6e-16 rel / ρ bit-exact and 1.1e-15) — record
update delegated alongside the other §5.9 amendments.

## 2026-08-16 — W3a cut 4, part 2: the imprecision reader (w3-imp)

`src/comparison/imprecisionLaws.ts` + 39 tests, every renderer claim measured through
`performMsm` per AD-43.1. The density, the distances, the registry rows and the adversarial
family are the next commit; the reader is separable and is the half the renderer study
licenses directly.

THE DEGENERATE TABLE IS IMPLEMENTED AS ONE RULE, not six cases — an absent parameter reads as
the number 0 — and the decisive test form is BIT-IDENTITY against an explicit control rather
than an assertion about shape. A document with `limit.upper` absent performs, byte for byte,
what the same document with `limit.upper="0"` performs. That fails on any difference at all,
which "the offsets look uniform" would not.

THREE ROWS §5.9's TABLE DOES NOT HAVE, all measured, all genuine laws rather than collapses:
a single absent limit gives `U(limit, 0)` (uniform) or truncation to `[limit, 0]` (gaussian);
a single absent clip clamps to `[clip, 0]`; an absent `mode` is `mode="0"`. §5.9 is right about
the case it names — BOTH limits absent — and silent about the commoner one. Reading the table
literally is a real defect and is pinned as such: the negative control that collapses any
single-absent-limit uniform to δ₀ fails exactly the test that names the row.

SIX ⊥ ROUTES, so AD-36.2's capped density is FORCED for these three dimensions. Five were in
the renderer study; the sixth the tests found:

**`@milliseconds.timingBasis="0"` aborts the render**, and the renderer's own guard misses it.
That guard lives inside `if (millisecondsTimingBasis === null)`, so it repairs an ABSENT basis
and never a written zero; the index then divides by zero, `requireUsableIndex` rejects `±∞`
and throws. A NEGATIVE basis is the control and is deliberately NOT ⊥: the index goes
negative, `getValue` clamps it to 0, every note draws `series[0]`, and the marginal is
unchanged — the same class of render artifact as AD-14iii's ordinary basis effect. Both
measured.

AD-35.4's HAZARD QUESTION, ASKED OF EVERY GUARD IN THE §5.9 PATH. Five guards, five answers,
all executed:
1. `GenericMap.parseData:143-146` — ENTRIES, and the entry list is FILTERED before any index
   is taken: no `@date` and a `<style>` without `@name.ref` are both dropped. Consequence
   measured: `<style name.ref="none">` at 720 leaves every later note exactly unperturbed
   (the δ₀ gap), while the SAME element with the attribute removed performs bit-identically to
   no style at all. This is the hazard class one level below where AD-46 asked it — not "does
   the guard count entries" but "which children became entries".
2. `getDistributionDataOf:212` — ENTRIES (`elements[i+1]`), which is the any-entry rule
   already in `spanEnds.ts` and asserted at reader entry.
3. The `impIndex` loop — ENTRIES; a non-distribution entry restores the previous `dd` and
   continues, which is what makes a gap a gap.
4. `mapIndex` is NOT reset between distributions — one shared forward walk over the note map.
   Sound because entries are date-sorted, but it makes two distributions at ONE date visible:
   the first has `endDate === startDate`, the note loop breaks immediately, and it performs
   nothing. Measured with a first distribution that would have shifted everything by −300 ms:
   bit-identical to the second alone.
5. The domain switch's `default: return` and the type switch's `default: continue` — a
   domain-less `<imprecisionMap>` and an unknown `distribution.*` name both perform nothing.
   The unknown name reads δ₀ and a structural note, NOT ⊥: nothing is destroyed, nothing is
   applied.

GAPS ARE δ₀ AND ASYNCHRONY'S ARE ⊥, and the contrast is now pinned in both directions. Same
structural situation — a foreign entry inside a span-bearing map — and opposite dispositions,
because `asynchronyMap` READS an offset off the foreign element and gets NaN (AD-33.1) while
`imprecisionMap` simply has no distribution for the interval and applies nothing.

[DECISION, needs ratification] THE CORRELATED FAMILIES DECLARE THEIR INDEX-0 LAW: uniform over
the MIDDLE HALF of `[limit.lower, limit.upper]`, clipped where the family clips. This is a
decide-without-stopping under AD-36.1's test — the renderer determines it and §5.9 is silent,
because §5.9 says "compare marginals" and the measurement shows there is no single marginal to
compare. `doHandover`'s fallback is the whole mechanism: `Math.random()·(R/2) + lower + R/4`.
Measured from 20 000 INDEPENDENT chains per index (a time average over one chain measures the
same thing only after mixing, and its error is autocorrelation rather than sampling): KS
0.0058 against `U(−15, 15)` for limits ±30, against a 0.0096 noise floor at that sample size.
The alternative — the stationary envelope `Uniform(lower, upper)` — is exact for
`brownianNoise` only asymptotically (~1000 indices at `stepWidth.max = 3`) and never for
`compensatingTriangle`, which contracts instead (σ 8.30 at `degreeOfCorrelation` 2, 4.91 at 5)
or expands to 20.76 with atoms at both limits at 0.5. The index-0 law is exact at an index
every span has, is determined by the document alone, and is read off the renderer rather than
modelled. `stepWidth.max` and `degreeOfCorrelation` carry the process as `processParameters`
rows, which is what makes A-B3's "the marginal does not characterize the process" a finding
here rather than a caveat — and the whole measurement ships as a `declared-law` note on every
correlated span.

§5.9's DECLARED-LAW SENTENCE GAINS TWO MORE, both measured and both the same kind of
render-path artifact as the chord shake: `distribution.list` is not sampled at all
(`getValue(i)` is `series[i % n]`, and a FRACTIONAL index INTERPOLATES between neighbours, so
the performed values are not in general list members), and the correlated marginal depends on
the index. All three depend on where a note falls rather than on what the document declares.

TIMING BASIS: derivation implemented as `ImprecisionMap.ts:356-380` has it (limits for
uniform/gaussian/brownian, CLIPS for both triangles, range for the list, timing domain only,
fallback 100.0 for everything else and for any derivation ≤ 0) — and the one-rule reading
explains why the fallback catches so much: absent limits derive `0 − 0 = 0`, which is ≤ 0.
Family-dependence per AD-14iii: inert for the four i.i.d. families (pinned as "the law is
identical while the RENDER genuinely differs", so the inertness is a claim about the law rather
than about the document being unchanged), a `processParameters` row for the two correlated
ones — where the measurement above makes it more than a formality, since the marginal really
does depend on the index the basis sets.

NEGATIVE CONTROLS, five, each failing exactly its own tests and restoring green: reading the
degenerate table literally (1 test), dropping the `@seed` check (1), declaring the full limit
range instead of the middle half (1), dropping the zero-basis ⊥ route (1), and switching the
span rule from any-entry to same-local-name (2).

Gate: `npm run verify` GREEN before committing — 108 files, 4714 passed + 1 skipped (was
4675 + 1). eslint and prettier clean.

## 2026-08-16 — W3a cut 4, part 3: density, decomposition, invariance, 75 rows — CUT 4 CLOSED (w3-imp)

`src/comparison/imprecisionDistance.ts` + 31 tests, the imprecision registry rows, the
adversarial family 12 → 17, and **UNCOVERED_DIMENSIONS is now empty**. Cut 4 is complete;
every one of §3's eleven dimensions has rows and a density.

**AD-36.2 ANSWERED, AND THE ANSWER IS "CAPPED".** The commission asks whether any `⊥` route
exists into these dimensions. Seven do, all measured through `performMsm`: an unusable numeric
parameter, an empty `distribution.list`, `degreeOfCorrelation` absent or 0, an unusable
`milliseconds.timingBasis`, an explicit `timingBasis="0"`, `@seed` on a correlated family,
`@seed` on a list, and an inverted-limit triangular. So the pointwise density is capped, and
the module doc says so with the reason rather than leaving a reader to infer it. **The cap is a
`Math.min` rather than `integrateCappedAbsolute`**, and that is not a shortcut: both readings
are piecewise CONSTANT in `t`, so once the grid carries every span edge the integral over a
cell is `density × length` — exact, with no quadrature in the time domain at all — and the
corner `integrateCappedAbsolute` exists to resolve does not exist here. Every numerical error
in this dimension lives inside `W₁`, where it is measured per family.

**A SEVENTH ⊥ ROUTE, FOUND BY THE REGISTRY'S OWN PARTITION TEST rather than by looking.**
Writing the R9 inventory forced the question "which attributes does each distribution's
provider actually consume?", and following `@seed` through the list factory answered it:
`setSeed` clears `series`, and for `distribution.list` **`series` IS the list**
(`createRandomNumberProvider_distributionList` assigns `series = [...list]`). Measured: a
`<distribution.list>` with `seed="99"` gives `milliseconds.date="NaN"` on every note; without
it the same document performs normally. So the §4 divergence reported in part 1 is WIDER than
reported — `@seed` is inert for `uniform`, `gaussian` and `triangular`, and destroys the
performance for the other **three** of six families, by two different mechanisms through one
line. `seedPoisonsCorrelatedSpan` is renamed `seedPoisonsSpan` accordingly.

**75 REGISTRY ROWS, not the commission's estimated ~20**, and the count is forced rather than
chosen: §4's superset property needs one comparison row per live expression row, and
`expression/registry.ts` generates 54 for these three dimensions (three domains × six
distribution groups). Add the two `process` rows §5.9 requires and the four inert
`milliseconds.timingBasis` rows the partition needs, and it is 75. The scale space is
`gain-ordered` on both sides, so **the superset property holds here LITERALLY** — no documented
substitution, unlike the level and rubato-window families.

The rows are generated by a per-element factory rather than one table-driven `flatMap`, for a
reason worth recording: iterating a union-typed table lets TypeScript form
`${dimension}/${anyElement}@${anyAttribute}` — the cross product — and demand keys for
combinations no element has. Generic in element and attribute, with the return type left to
INFERENCE so the check lands at the call site (a generic body is checked against its
constraint, where the template proves nothing), a misspelled attribute is a compile error.
Negative-controlled: misspelling `stepWidth.max` really does fail `tsc`.

**THE SKIP-LIST IS CLOSED AND THE R9 PARTITION TEST IS UN-SKIPPED.** `UNCOVERED_DIMENSIONS` is
`[]` and is asserted empty rather than deleted — it is now the stronger statement, since a
future dimension added without rows fails immediately. The `it.skip` that had been waiting
since W2 ("needs rows for accentuation, articulation, ornamentation, pedal and the three
imprecision dimensions") is implemented: `survey-code.md` §1.2's map inventory as data, with
every attribute the renderer READS required to land in exactly one of rows / inert / exclusions
— and asserted in BOTH directions, so a row for an attribute nothing reads fails too. It listed
the attributes each provider CONSUMES rather than the thirteen `DistributionData` parses
unconditionally; making that distinction is what surfaced the list-seed defect.

Two more partition consequences, both recorded in the test rather than in prose: the ornament
pool's `<note>` `@midi.pitch` / `@interval.*` are exclusions by the `@controller` precedent
(AD-36.3 — naming which notes is an identity claim), and `@detuneUnit` is an exclusion because
the tuning domain is inert (R9b), now on better evidence than §5.9's wording — the renderer
DOES write `tuning.offset`, and the reason the domain is inert is that nothing reads it back
(`expression/applier.ts:1496` records the same finding from the write side).

**THREE COMPONENTS, TWO OF THEM DISTANCES.** The marginal (`W₁/jnd`, capped); `processParameters`
(`stepWidth.max`, `degreeOfCorrelation`, and the timing basis for correlated families only),
priced through §4's capped metric per row and sustained over the cell exactly as the marginal
is; and §1.2's `W₂` decomposition, interpretive and never in `d_k`. A parameter present on one
side only is `⊥` rather than a deviation from a neutral, which is the OPPOSITE disposition from
AD-42.3's ornament sub-elements and for a stated reason: `stepWidth.max = 0` is a definite
behaviour (a frozen walk, correlation 1), so absence has no neutral to be a deviation from.

The decomposition integrates §1.2's lemma cellwise on the NORMALIZED measure — `level² =
∫(ℓ_A − ℓ_B)² dμ` and so on — so the identity closes pointwise and therefore under the
integral, and the residual is quadrature-free because the cells are constant. A `⊥` cell drops
out of the decomposition while keeping its `δ_row` in the headline: `⊥` has no moments to
contribute, which is the same split `accentuationSampler` and `pedalSampler` make.

**§7.4's INVARIANCE, and the one reading nothing settles.** `'level'` is AD-20's location shift
of the law and is implemented as ruled. `'level-gain'` is §7.4's own words ("centered and
σ-normalized per document") read literally, which for a law is `X ↦ (X − ℓ)/σ` — but **AD-20
names the distribution case only for `'level'`, and the renderer does not determine this one**,
so it is NOT a decide-without-stopping and is flagged for ratification rather than settled
here. A document with no spread is left unscaled and marked shapeless (AD-20's `σ = 0` rule).

Both modes rest on `affineLaw`, which FOLDS every law kind instead of wrapping it — which is
why `GaussianLaw` gained a `center` field. With a wrapper, a canonicalized law would be a
different shape of object from the reader's, and `W₁`'s breakpoints, `W₂`'s panels and
`lawsEqual`'s identity fast path would each need a case for it; folding keeps `d(A, A) = 0`
exact after canonicalization, which is what P-C3 under an invariance mode actually needs.

**ADVERSARIAL FAMILY 12 → 17**, per the standing policy: the ordinary uniform law; a Gaussian
span ended by a `<style>` (the special-function path AND the δ₀ gap, whose contrast with
`asynchronyMap`'s NaN-poisoned gap is now testable in one family); the empty-list `⊥`; a
`brownianNoise` whose declared marginal is exactly the plain member's while its process differs;
and a law wide enough that §4's cap binds.

**AND THE FAMILY'S OWN TRIANGLE TEST WAS CHECKING ONE INEQUALITY IN THREE.** `adversarialTriples`
returns an unordered triple and the P-C3 test always took the third member as the middle, so
each triple asserted one of the three inequalities it stands for. Cut 4 found it by negative
control: removing §4's cap failed only the dedicated test and NO pair in the family, because the
cap binds only when a `⊥` member sits BETWEEN two laws whose uncapped distance exceeds `2·δ_row`
— an arrangement that depended on the family's array order. The test now checks all three middle
assignments (the distances are memoized, so it costs nothing), and with the wide member present
removing the cap fails the FAMILY's triangle test across the whole suite. That is the eighth
member's lesson recurring: a family that merely CONTAINS a hazard is not a family that reaches
it. **This strengthens all six dimensions, not only cut 4's.**

§10's SPAN-PROPORTIONALITY FIXTURE (AD-14v) is pinned as the RATIO rather than as two numbers,
because the ratio is the claim: the same difference over one bar and over the whole piece
scales exactly 2, and a quarter against four scales exactly 4. Also pinned: the mass is the
closed-form `W₁ = 15 ms` times the duration over the JND, so the number is checked against
mathematics and not against itself.

NEGATIVE CONTROLS, each failing exactly its own tests and restoring green: removing §4's cap
(1 dedicated test, plus the family's P-C3 once the wide member exists); dropping the
`processParameters` component (4, including the family's non-degeneracy — which is what proves
the `imprecision-process` member load-bearing); replacing duration-proportional mass with
survey-algo's superseded per-span normalization (7, including the family's P-C3); and the
compile-time key check (a deliberate typo fails `tsc`).

Gate: `npm run verify` GREEN before committing — 109 files, **4794 passed, 0 skipped** (was
4714 + 1 skipped). eslint and prettier clean on all ten touched files.

OPEN FOR RATIFICATION, carried from parts 1–3: (a) the ρ constants as test references rather
than code fast paths; (b) the inverted-limit triangular reading `⊥`; (c) the correlated
families' declared marginal (the index-0 middle-half law); (d) `'level-gain'` for distribution
dimensions; (e) the `@seed` PARITY question — this port emits NaN where the reference throws
`IndexOutOfBoundsException`, and §4's exclusion rationale is wrong for three of six families.

## 2026-08-16 — AD-49's delegated amendments executed; cut-4 scope corrections (w3-imp)

AD-49 landed while cut 4's parts 2 and 3 were in flight, so its delegations arrive in one
follow-up commit rather than inside the commits they name. Nothing ruled is left undone.

**PARITY.md gains `IMP1`** (AD-49.3), in §2 as ruled — a failure-mode divergence on defective
input. And it is WIDER than AD-49.3 could know: the ruling covers the correlated pair, and cut
4's part 3 found the same line reaching `distribution.list` through a different mechanism.
`setSeed` clears `series`; for the correlated families that is the walk's current value, and for
a list **it is the list**. Java throws `IndexOutOfBoundsException` in the first case and
`ArithmeticException: / by zero` in the second (`index % series.size()` on `int`s with size 0);
this port yields `undefined` and then `NaN` in both. The same divide reaches an EMPTY
`<distribution.list>` with no `@seed` at all, which is the commoner way in. Frozen with the
reason stated: repairing it means choosing a behaviour neither codebase has, and reordering
`setSeed` before `doHandover` would change the numbers of every seeded correlated rendering,
which `RandomNumberProvider`'s own class doc forbids doing casually. §2's opening sentence is
amended, since `IMP1` is the one entry there that IS reachable from the pipeline.

**DESIGN amendments, all six delegated ones**, and no wider:

- §4's `@seed` exclusion (AD-49.3) now names the exception and its scope: inert for `uniform`,
  `gaussian` and `triangular`; `⊥` for the other **three**.
- §5.0's epsilon record (AD-49.8) carries the measured figures and says what the superseded
  `1.15·10⁻⁹` actually was — Acklam's figure for `Φ⁻¹` alone, which is still the `Φ⁻¹` used.
- §5.9's degenerate table (AD-49.1) states the one rule that generates it and gains the four
  single-absent rows as their own table, with "only BOTH limits absent gives δ₀" spelled out.
- §5.9's span rule (AD-49.7) gains the `@name.ref` filter, the zero-width duplicate-date span,
  the undated distribution, and the δ₀-versus-`⊥` contrast with `asynchronyMap`.
- §5.9's interpretive paragraph (AD-49.5) states the ρ constants as test references with the
  reason, and adds the unconditional quantile-tail refinement with the measurement that forced
  it (σ 12.24716 against `30/√6`).
- §5.9's correlated paragraph (AD-49.4) carries the index-0 ruling with the mixing-time
  measurement as the reason it won, the `processParameters` membership of the timing basis, the
  `⊥`-not-neutral rule for a one-sided process parameter, and the unreachable handover.

Two more §5.9 sentences follow from measurements already accepted: the declared-law
qualification gains `distribution.list`'s cycling-and-interpolating read, and the tuning
domain's inertness is restated on its real evidence — the renderer DOES write `tuning.offset`,
and what makes the domain inert is that nothing reads it back.

**SCOPE CORRECTIONS to my own earlier reports**, so the record is not left overstating:

1. Part 1 and part 2 said SIX `⊥` routes and named `@seed` as a two-family problem. It is
   **seven** and `@seed` reaches **three of six** families. Part 3's LOG entry has the corrected
   count; this entry is where the earlier two are corrected.
2. AD-46 estimated "~20 registry rows". The delivered number is **75**, and the difference is
   not scope creep: §4's superset property needs one comparison row per live expression row and
   `expression/registry.ts` generates 54 for these three dimensions, to which §5.9's process
   rows and the partition's inert `timingBasis` rows add 21.
3. The commission's "global pedal path false" is not what the renderer does:
   `Performance.ts:550` and `:756` both pass `shakePolyphonicPart = true`, as do all four
   score-map calls at `:775-781`. Every call site in the port passes `true`. This changes
   nothing in cut 4 — the chord shake is outside the compared object either way (§5.9, R26) —
   but it is a factual correction to the commission's own description.

Gate: `npm run verify` GREEN — 4794 passed, 0 skipped, unchanged by this commit (documentation
and ledger only). prettier clean on DESIGN.md, PARITY.md and LOG.md.

## 2026-08-16 — AD-50: cut 4 CLOSED, W3a COMPLETE; W3b commission [BINDING]

aecf49f + fa706f7 + 6d5f6da accepted. W3a is COMPLETE: eleven dimensions
live, 75 imprecision rows (superset-forced, not scope creep), skip-list
empty and asserted, R9 partition un-skipped and bidirectional, 4794
passed with ZERO skipped. Dispositions:

AD-50.1 The @seed three-family expansion is accepted (list's series IS
the seed-cleared state; empty list same route; Java ArithmeticException vs
port NaN — PARITY IMP1 as landed). The registry partition test finding it
is the argument for the partition test, on the record.
AD-50.2 Seven ⊥ routes ⇒ capped density CONFIRMED; the Math.min form is
CORRECT (piecewise-constant readings make the cell integral density ×
length exactly — the corner integrateCappedAbsolute resolves does not
exist here; module doc carries the reason).
AD-50.3 The P-C3 all-three-middles repair + the cap-binding family member
are accepted with emphasis: a suite defect affecting all dimensions,
found by negative control, fixed at the family level. Standing lesson
re-recorded: a family that merely CONTAINS a hazard is not one that
REACHES it.
AD-50.4 (item d) RATIFIED AS IMPLEMENTED: 'level-gain' for distribution
dimensions is §7.4's literal reading — X ↦ (X − ℓ)/σ per document — a
genuine per-document canonicalization, metric-safe by the curve argument,
with the AD-32 floor/shapeless discipline. Not an error case: the
construction §7.4 names is well-defined here and musically meaningful
(scatter-shape comparison). AD-20's silence was a gap, not a prohibition.
AD-50.5 The two record corrections (six→seven routes, two→three families;
the commission's wrong "global pedal path false" — conductor's error,
Performance.ts:550/:756 pass true) are accepted; corrected records
outrank unblemished ones.
AD-50.6 affineLaw folding (GaussianLaw gains `center`), the ratio-form
proportionality pin, and the cellwise-lemma decomposition are ratified as
landed.

W3B COMMISSION (imp-cut4 continues; hand off at a clean boundary if
context runs low — the campaign norm): §7 aggregation (D = Σω_k d_k,
weights/JND options, zero-weight handling, invariance plumbing);
AD-19's canonical table (aggregate-density segments via Ruzzo–Tompa,
below-threshold remainder, closure pinned ≤ 1e-12·D); the §9 facade AS
ADJUDICATED (ComparisonSettings; b defaults to a; selectors + errors
carrying document identity; COMPARISON_JND_KEYS export; full report
shapes — dimensions record in COMPARISON_DIMENSIONS order, aggregate,
segments with {mass,peak,mean,length,start,end}, closing table,
decomposition, notes channel, drift, equivalence block, opt-in profile
export, signed descriptors, per-family epsilon record, windowRule/
metricGuarantee stamps; finiteness discipline with P-C11 walker;
serialization order pinned; −0 normalization MINOR-2; malformed-value
table MINOR-4; options echo without document texts); src/index.ts +
src/api exports per §9.7; P-C2 byte-identity at facade level; P-C5
cross-module test in AD-6's three-part split. Then the W3 wave gate
(independent verifier).

## 2026-08-16 — W3b part 1: §7 aggregation and AD-19's closing table (w3-imp)

`src/comparison/aggregate.ts` + 28 tests. Pure mathematics over a DECLARED density interface,
deliberately touching no evaluator: it can be gated on its own, and it cannot leave a
cross-module change half-written if this context has to hand off.

**THE DENSITY IS A MEASURE, and the interface says so.** §5.0's `p_k` is an absolutely
continuous part plus ATOMS at event dates, and `DimensionDensity` carries both because the
table has to sum both. Flattening atoms into an average density would put an articulation
event's mass in the wrong column, which is not a rounding choice — atoms are exactly where the
mass is concentrated. AD-7's spreading rule gets the same treatment: a matched pair at
differing dates is not a point mass but a uniform contribution over `[min(dA,dB), max(dA,dB)]`,
so `DensityAtom` carries an interval and a true atom is the coincident case.

`κ` (§7.1) is implemented for the first time — `EVENT_KAPPA_QUARTERS = 1`, and the UNIT is its
whole content: an alignment's optimum is in JND, the table is in JND·quarters, and κ is the
bridge that lets an atom and a cell share a column.

**RUZZO–TOMPA IS TESTED AGAINST A BRUTE-FORCE ENUMERATION, and the reference was wrong first.**
The discipline is `eventAlignment.test.ts`'s: asserting "these are the segments" pins one
answer and passes on an implementation that optimizes the wrong thing. Writing the reference
exposed that I had paraphrased maximality rather than stated it. Ruzzo & Tompa's condition (2)
is "no proper supersequence THAT ITSELF SATISFIES (1) scores at least as much", and the
qualifier is load-bearing: on `[1, −2, 3]` the subsequence `[0,0]` scoring 1 sits inside
`[0,2]` scoring 2, but `[0,2]` contains `[2,2]` scoring 3 and so is not a competitor —
`[0,0]` survives. My first reference dropped the qualifier and accused a correct algorithm.
Both now agree on thirteen hand-picked shapes and 400 random sequences.

The canonicity §7.3 claims is pinned directly: `[0, 5, 0]` gives `[1,1]` and never `[0,2]`,
because a run extended by a zero-score cell contains a proper subsequence of equal score and
fails maximality. That is the property the math lens attacked and it holds.

**A DESIGN INCONSISTENCY I WROTE AND THE TEST CAUGHT.** `DensityCell` carries `mass` (the
authority) and an optional `densityAt` (the shape, for root refinement). My first `massIn`
pro-rated a partly covered cell BY LENGTH while the root refinement used the sampler — so a
boundary could move without any mass moving, which is exactly the inconsistency the module's
own doc comment warns about, written by me two hundred lines earlier. The root-refinement test
found no segment at all where the density plainly crosses the threshold. Repaired the way that
keeps both guarantees: the sub-interval's share is `∫ p / ∫_cell p` RESCALED to `mass`, so the
shape comes from the sampler and the scale from the authority, and the row sums still reproduce
`d_k` exactly whatever the sampler's own quadrature error.

**[LIMITATION, reported not hidden] ROOT REFINEMENT NEEDS A POINTWISE DENSITY THAT NO SHIPPED
EVALUATOR EXPOSES.** AD-19/M9b requires segment boundaries at the ROOTS of `p_D − τ_D` because
a cell-quantized edge can sit many bars from the crossing. All eight `*Distance` modules return
cells carrying `mass` only. `densityAt` is therefore optional, and where it is absent the
cell's mean density stands in and `SegmentPass.cellQuantizedDimensions` **names** the
dimensions that fell back — so a report can say which boundaries are approximate instead of
implying all are exact. The remedy is for each `*Distance` module to hand back the integrand it
already evaluates; that is a cross-module change and belongs with the wiring, not here.

TWO MORE STRUCTURAL FINDINGS for whoever wires the dimensions in, recorded now so they are not
rediscovered:

1. **The event dimensions expose no atom placement.** `articulationDistance` and
   `ornamentationDistance` return a scalar plus counts — no per-anchor mass, no dates. AD-19's
   table cannot close without them, and AD-7's spreading rule needs both dates of a matched
   pair. `eventAlignment` already returns `pairs`/`unmatchedA`/`unmatchedB`, so the costs and
   dates are recoverable; exposing them is a required extension to the cut-2/cut-3 modules.
2. **`peak` on a zero-width (atom) segment.** Reported as the continuous part's peak, i.e. 0,
   rather than as `Infinity`: a point mass has unbounded density and §9.6's finiteness
   discipline admits no such field. The atom is visible in `mass`, which is where it belongs.

C11's equivalence block ships with one deviation from a literal reading, stated in the code:
the PER-DIMENSION `aboveThresholdLengthFraction` is measured against that dimension's OWN
threshold rather than copied from the aggregate segments. Copied, it would be identical for
every dimension and say nothing; §7.3 licenses exactly this as the secondary, explicitly
non-closing per-dimension product, and it is a descriptor measured at cell resolution.

NEGATIVE CONTROLS, four, each failing exactly its own tests and restoring green: dropping the
root refinement (1); pro-rating a sampled cell by length (1 — the same test, which is the point,
since the two halves of that repair are one property); letting Ruzzo–Tompa absorb boundary
zeros (3); computing the remainder column by re-integration rather than by subtraction from the
row total (2, both closure tests).

Gate: `npm run verify` GREEN before committing — 110 files, 4822 passed, 0 skipped (was 4794).
eslint and prettier clean.

REMAINING IN W3B, in the order I would take them: the event-dimension atom placement (finding
1 above); a per-part dimension driver producing `DimensionDensity` for all eleven; the §9
facade with its report shapes, validation table, serialization order, −0 normalization and
finiteness walker; `src/index.ts` + `src/api` exports; P-C2 byte-identity; P-C5's three-part
split.

## 2026-08-16 — AD-51: W3b part 1 accepted; two rulings; handoff granted [BINDING]

2c2a4f0 accepted (aggregation + canonical table; κ implemented for the
first time; the Ruzzo–Tompa maximality-qualifier self-catch and the
massIn shape-vs-scale repair are both on the record as the discipline
working). Rulings:

AD-51.1 densityAt: the EVALUATOR EXTENSION is ruled (each *Distance
module hands back the integrand it already evaluates), because AD-19
adjudicated exact root-refined boundaries and the integrand exists in
every module — the extension is exposure, not new mathematics. The
shipped optional-densityAt machinery with cellQuantizedDimensions STAYS
as (i) the graceful path for any future dimension that genuinely lacks a
pointwise density and (ii) the honest report field naming approximate
boundaries wherever they occur. Successor takes it after the event-atom
extension.
AD-51.2 Event atom placement: REQUIRED extension to the cut-2/cut-3
modules (per-anchor masses + both dates of matched pairs, recoverable
from eventAlignment's existing returns) — AD-19's table cannot close and
AD-7's spreading rule cannot run without it. Item 1 for the successor,
as recommended.
AD-51.3 HANDOFF GRANTED at 2c2a4f0 (clean, pushed, green 4822+0).
imp-cut4's tenure: cut 4 in four commits (the Wasserstein substrate at
machine precision, the reader with nine renderer findings, 75 rows
closing the inventory, PARITY IMP1) plus W3b part 1 — and the P-C3
family repair that strengthened every dimension. The scoping instinct
(pure math over a declared interface, no half-written cross-module
change) is the AD-42 lesson internalized. Successor commission: task #1's
order — event-atom extension, densityAt extension, eleven-dimension
driver, §9 facade as adjudicated, exports, P-C2/P-C11/P-C5.

## 2026-08-16 — W3b part 2: the event-atom extension (AD-51.2) (w3b-facade)

AD-51's item 1, and the smallest change that makes AD-19's table closable: the two event
dimensions now hand back WHERE their mass sits, not only how much of it there is.

**THE DECOMPOSITION LIVES IN THE ALIGNER, because the placement rule is dimension-neutral.**
`eventAlignment.ts` gains `EventCharge` (the optimum taken apart per event: the DP's three
moves, each carrying the term it contributed) and `chargeAtoms` (AD-7's spreading rule applied
to those charges). Nothing in either knows what an articulation or an ornament is — the same
bet AD-37.6 made and won with the second consumer, extended to a third question.

The charges are **recomputed from the chosen alignment rather than accumulated inside the DP**.
That is deliberate: what is reported is then literally the same expression the recurrence
minimized, evaluated at its own argmin, so a future edit to the recurrence cannot leave the
report describing a functional the DP no longer uses. The cost is one extra evaluation of the
cost functions per event, which is what M5's correction already pays for at every DP cell.

AD-7 IMPLEMENTED WHERE IT BELONGS: a matched pair at differing dates spreads uniformly over
`[min(dA,dB), max(dA,dB)]` — so `λ_date` is visible in the timeline rather than teleported to
whichever document is `a` — and a point mass is the coincident case of the same rule, not a
second one. Pinned in both directions, including that swapping the documents mirrors the
placement and preserves every mass bit for bit.

[DECISION, needs ratification] **AN ANCHOR OF UNKNOWN DATE POSITION SPREADS OVER THE WHOLE
WINDOW.** §5.5's id-anchored articulation without an MSM is the case: AD-39.1 says the atom is
never dropped, so its mass is real and has to land in the table somewhere, and DESIGN does not
say where. Three placements were available and two of them assert something false — pinning it
to the written `@date` claims a position §5.5 explicitly says is not known (the renderer applies
the atom to its note wherever that note is, and warns when the dates disagree), and dropping it
forgives a difference the renderer performs. A uniform spread over the window is the only
placement that adds no information, it keeps the table closing by construction, and it is
symmetric. `datePositionKnown` travels with the atom AND on the dimension result, so AD-39.1's
"the report must STATE that id-anchored content is window-exempt" has its data.

The atoms sum to the alignment's own optimum to within summation order — the DP accumulates
along its path and the caller sums the list — which is pinned at 1e-9 rather than asserted, and
is why `distance` is left as the DP's cost rather than replaced by the sum: the semantic
definition is the argmin (§5.6), and a decomposition that redefined it would be a second
number claiming to be the first.

NEGATIVE CONTROLS, both failing exactly their own tests and restoring green: deleting the
unknown-position branch fails 3 (the id-anchored placement at both layers); charging a matched
pair to its `a`-side date instead of spreading fails 4.

Gate: `npm run verify` GREEN before committing — 110 files, 4839 passed, 0 skipped (was 4822).
17 new tests. eslint and prettier clean on all six touched files.

## 2026-08-16 — W3b part 3: the densityAt extension (AD-51.1) (w3b-facade)

Every cell-bearing dimension now hands back the integrand it already evaluated, so AD-19's
segment boundaries root-refine exactly instead of falling back to cell resolution. Seven
modules, one field, and the whole content of the change is that it is the SAME function the
quadrature saw rather than a second one written to look like it.

The shipped optional-`densityAt` machinery and `cellQuantizedDimensions` STAY, as AD-51.1
directs: they are the graceful path for any future dimension that genuinely has no pointwise
density, and the honest report field wherever a boundary is approximate. With all seven wired
the list is empty on every ordinary document, which is the difference between a promise and a
measurement.

Per dimension the sampler is exactly what the module integrates and nothing more: tempo and
dynamics `|ln A − ln B|/jnd`; rubato the displacement difference converted to quarters first,
as its integrand already is; asynchrony and imprecision constant across the cell BY
CONSTRUCTION (§5.7, §5.9 — the grid carries every span edge, which is also why those two
integrate exactly); accentuation and pedal the CAPPED integrand `min(|·|/jnd, 2·δ_row)`, the
same `Math.min` `integrateCappedAbsolute` applies, so the two cannot drift.

**THE TEST IS POINTWISE, AND THAT IS THE POINT.** The obvious property — the sampler's integral
reproduces the cell's mass — is satisfied EXACTLY by the mean-density stand-in this extension
exists to remove, since `mean = mass / length` by definition. An integral check could therefore
never have caught the fallback. So each dimension's sampler is checked against its DEFINITION,
evaluated independently in the test from the curve readers (`quarterBpmAt`, `volumeAt`,
`displacementTicksAt`, `offsetAt`, `accentuationContributionAt`, `positionAt`), at seven
interior probes per cell to 1e-12. The integral is asserted as well, loosely, because it is what
catches the one error the pointwise check cannot: a sampler stated per TICK where the
aggregation reads per QUARTER is off by a factor of `ppq` in the integral and correct at no
point at all.

[MEASURED, both while writing that tolerance] The 1e-3 relative integral band is honest about
two real effects rather than chosen to pass: a composite Simpson reference SMEARS the `|·|`
corner that `integrateAbsolute` splits at exactly (accentuation, 5.9e-4 — the module is right
and the reference is not), and rubato's own quadrature carries AD-34.1's documented residual at
an `intensity = 0.5` boundary layer (5.2e-4, inside that ruling's own measured band). Both were
found by the test failing at 1e-5 and diagnosed against a converging reference sequence before
the tolerance moved.

NEGATIVE CONTROLS, each failing exactly its own test and restoring green: replacing tempo's
sampler with the cell's mean density (1); stating dynamics' sampler per tick instead of per
quarter (1).

Gate: `npm run verify` GREEN before committing — 111 files, 4846 passed, 0 skipped (was 4839).
7 new tests. eslint and prettier clean across `src/comparison` and `tests/comparison`.

## 2026-08-16 — AD-52: W3b rulings — unmatched parts renderer-true [BINDING]

67f10a7 + 300c4f8 accepted (event atoms with charges recomputed at the
argmin; densityAt with the pointwise test that the mean-density stand-in
could never satisfy; the two tolerance moves diagnosed against a
converging reference BEFORE the band moved — the discipline in its
mature form). Rulings:

AD-52.1 RATIFIED: an anchor with unknown date position spreads uniformly
over the WHOLE WINDOW — the only placement that asserts nothing false,
keeps closure by construction, and is symmetric; datePositionKnown
travels on atom and dimension result and feeds AD-39.1's required
statement.
AD-52.2 AD-3's unmatched-part MECHANISM IS SUPERSEDED by the measured
renderer truth: an unmatched part resolves to that document's GLOBAL
maps (resolvePartMaps returns globalMaps for a null MPM part — executed:
velocity 40, not neutral 100, 9.6 JND of error under the old rule); R6's
neutral applies one level later, exactly when the global map is absent
too — which degenerates to AD-3's rule for part-only documents. The
hazard class's latest instance; the probe is pinned; the driver
implements renderer-true with the reading in its module doc. AD-44.3 is
the governing precedent, correctly cited.
AD-52.3 Driver scope calls: (a) noteDensityWeight is REMOVED from the v1
facade surface (an option whose only behavior is to throw is worse than
absent; unknown keys already error; §9 amendment delegated to the facade
commit; the w(t) plumbing is journaled future work — adding the key back
is non-breaking). (b) MSM support ships as proposed (window end,
measures, note counts, single-TS beat grid) with AD-12's multi-TS
forward walk recorded as a NAMED, adjudicated obligation deferred
visibly — estimate-degradation note in reports, board item for W4/W5,
never silent.
AD-52.4 The §7.4 invariance plumbing as its own commit before the driver
is endorsed (per-document (shift, scale) reaching the integrands).

## 2026-08-16 — W3b part 4: §7.4's invariance reaches the integrand (w3b-facade)

AD-50's W3B commission names "invariance plumbing" and this is what it turned out to be: the
six curve dimensions integrated RAW curves and had no way to see a canonicalization at all, so
a mode could have canonicalized `decomposition` while `d_k` — the number a caller reads —
stayed on the raw pair, and the report would have stamped an invariance the headline never saw.
Only `imprecisionDistance` took a mode, because §5.9's reader was written after §7.4.

**THE CANONICALIZATION BECOMES DATA.** `CurveCanonicalization` is `{shift, scale}` in T-space,
`canonicalizationFor(mode, moments)` resolves §7.4's three modes against one document's own
moments, and `applyInvariance` is REDEFINED THROUGH IT — so the curve form (which the
decomposition uses) and the integrand form (which the distance uses) are one construction and
cannot drift. Each of tempo, dynamics, rubato, asynchrony, accentuation and pedal takes a
trailing `CanonicalPair` defaulting to the identity, so every existing call site is unchanged
and every shipped number is unchanged.

**THE SHIFT LANDS IN T-SPACE, AND THAT IS THE WHOLE CORRECTNESS QUESTION.** §7.4's own table
says a log space's `'level'` removes a MULTIPLICATIVE factor, which is a subtraction only after
the logarithm; subtracting a mean from a raw BPM is a different transform entirely. So
`registry.ts` gains `canonicalLocalDistance`, which applies the shift and the scale between
`forwardInSpace` and §4's cap, and `localDistance` is now that function under the identity pair
— one definition, not two.

[MEASURED GAP, closed by moving the evidence down a layer] The T-space placement is currently
UNREACHABLE from any dimension: the only row that goes through the capped metric per cell is
asynchrony's, whose space is `gain`, where `T` is the identity and both placements coincide. I
found this by negative control — swapping `canonicalValue(forwardInSpace(x))` for
`forwardInSpace(canonicalValue(x))` passed all 41 registry tests and both dimension suites. The
distinction is real and invisible, so it is pinned at the FUNCTION in `registry.test.ts`, on a
log-space row, together with the raw-canonicalized reading it must differ from. Same move as
RG-2's and the K=4 pin: when a property stops being observable at one layer, the evidence goes
down a layer rather than away.

[SELF-CORRECTION, found by an existing test] Refactoring `applyInvariance` through the shared
data first broke `decomposition.test.ts`'s AD-20 case. The old code returned `() => 0` for
`σ = 0` under `'level-gain'`; the refactor left the scale at 1 and returned `v − ℓ`, which on a
constant curve is 8.9e-16 rather than 0. AD-20's rule is stronger than "do not divide by zero":
the canonical curve IS the zero curve. Encoded as `scale = 0`, with `canonicalValue` returning a
literal `+0` for that case rather than computing the product — `0·(v − ℓ)` is `−0` wherever the
centred value is negative, which §9.5's `−0` normalization would then have to undo, and `NaN` at
the infinite `T`-values §4 admits.

§7.4's LINEAR-SPACE TRAP is pinned in both directions, which is the reason the test file exists
at all: on tempo (log) `'level'` scores a 10 % faster reading of the same gesture at exactly
zero; on asynchrony (linear) the same mode removes a constant 25 ms lag but leaves a 10 %
STRETCH standing, measurably. A test that only checked tempo would have reported the mode as
working and shipped C9's trap unnoticed. The measurement is the evidence behind §7.4's obligation
that the report say so in plain words, which the facade will carry as the `invariance-space` note.

Also pinned: `T` of a power transition is NOT affine in its endpoints' logs, so two tempo ramps
that look like a dilation of one another are a different SHAPE once the renderer interpolates —
the first draft of the `'level-gain'` fixture was wrong for that reason and the corrected fixture
uses steps, with the reason kept in the test.

NEGATIVE CONTROLS, each failing exactly its own tests and restoring green: dropping the
canonicalization from tempo's integrand (3); applying it to the raw value instead of in T-space
(2, at the registry layer — and 0 anywhere else, which is the finding above).

Gate: `npm run verify` GREEN before committing — 112 files, 4860 passed, 0 skipped (was 4846).
14 new tests. eslint and prettier clean across `src/comparison` and `tests/comparison`.

## 2026-08-16 — W3b part 5: the eleven-dimension driver (w3b-facade)

`src/comparison/{dimensions,compare,report,msm,plausibility,drift}.ts` + 31 tests. The eleven
dimensions become a comparison: one window, one settings record, one aggregate density, one
closing table, and the campaign's first end-to-end numbers across all of §3.

**ONE INTERFACE, THREE SHAPES.** `dimensions.ts` puts every dimension behind
`DimensionEvaluation`, so §7's aggregation, §9's report and the profile export are written once
rather than eleven times. The three genuinely different shapes §3 names — curve, event,
distribution — are three functions, and the six curve dimensions share one `CurvePlan` record
each. Nothing above that file has ever heard of a `TempoCurve`.

**A DESIGN-VS-RENDERER DIVERGENCE, MEASURED THROUGH THE PIPELINE, AND IT IS AD-3's.** AD-3 says
an unmatched part "compares against the neutral curve (R6 applied to parts)". The renderer does
something else: `renderParts` iterates over the **MSM's** parts and calls
`resolvePartMaps(mpmPart, globalMaps)`, whose first line is `if (mpmPart === null) return
globalMaps` — so an MSM part with no MPM counterpart inherits the GLOBAL maps wholesale.
Executed end to end through `performMsm`: an MPM with a global `dynamicsMap` at volume 40 and a
part 1 shadowing it at 110, against an MSM with parts 1 and 2, performs part 1's notes at
velocity 110 and part 2's at **40** — not at the neutral 100. The console says so too ("No MPM
part found that corresponds to MSM part 2").

R6 is being applied one level too early: an absent MAP is the neutral curve, and what a part
with no counterpart has is not an absent map but the global one. Implemented renderer-true — a
missing part takes that document's global scope, which degenerates to AD-3's rule exactly when
the global map is absent too — with the pipeline probe pinned as a test and the reading stated
in the module header. **The negative control fails on REAL DATA**: reverting to the neutral
reading breaks two Vulpius anchors as well as the synthetic case, so this is not a corner.
Reported for ratification; the difference is |ln(100/40)| = 9.6 JND sustained over a whole part.

**MASS IS ADDITIVE AND A MEAN IS NOT**, which is the whole content of merging the part scopes.
Cells and atoms concatenate and the aggregate density is their sum — overlapping cells are what
`p_k(t) = Σ_parts p_{k,part}(t)` MEANS — while §1.2's decomposition is taken over the DISJOINT
UNION of the parts' curves (part `p` on `[p·L, (p+1)·L)`), which is exact, needs no
representative part, and degenerates correctly when every part inherits one global map. Pinned:
a three-part document whose parts all inherit one global `tempoMap` scores exactly 3× the
global-only pair, because the renderer performs that map three times.

[DEFECT FOUND BY THAT MERGE, in shipped code] `aggregate.ts`'s `pointwiseDensityAt` RETURNED the
first covering cell instead of summing. With one scope per dimension the two agree; with parts
they do not, and `massIn` was already summing — so the root refinement would have seen a
fraction of the density the mass reports. That is the module's own shape-versus-scale
inconsistency one level down, and it is repaired with the reason recorded. Negative-controlled at
the profile layer, where the same summation is visible directly.

**§7.4's INVARIANCE IS DEGRADED, NOT THROWN, WHERE THE DOCUMENT DECIDES** (AD-25.1): a mode
requested for a window carrying a `⊥` span has no moments to canonicalize against, and a mode
requested for a dimension neither document carries removes nothing. Both emit `option-unusable`
and fall back to `'none'`. C9's linear-space sentence ships as the `invariance-space` note, in
plain words, with the measurement behind it from the previous commit.

**THE SMALL MODULES.** `msm.ts` reads the score end, the global `timeSignatureMap`, the measure
grid and the note count — and states its own shortfall: AD-12's forward-only walk needs the
accentuation evaluator to take a grid FUNCTION, which is a cut-1 extension, so a single time
signature is exact and several earn an `estimate-degradation` note naming the limitation.
`plausibility.ts` is C6's channel as a dimension-neutral document walk over the registry's own
`sites`/`plausibleRange` — ~60 lines rather than eleven hooks — and it produces §9.3's site
reference as a by-product. `drift.ts` is C13, integrating `60/qbpm` on the tempo dimension's own
graded mesh (`gradedBoundariesIn` is exported for it, so the drift and the distance see one
mesh), with the divergence from §5.1's "renderer-Simpson" stated rather than hidden: reproducing
the renderer's own accumulator means importing it, which §9.7's zone forbids.

**FIRST REAL NUMBERS ACROSS ALL ELEVEN DIMENSIONS.**

    Telemann Grave, MSM window 204 quarters, all eleven dimensions, ω = 1
      Baroque <-> Fast      22357.06  |  Baroque <-> Romantic   6493.60  |  Fast <-> Romantic  21686.72
    Vulpius, MSM window 54 quarters
      Baroque <-> Romantic   8849.39  |  Baroque <-> Amateur   10294.50  |  Romantic <-> Amateur  2939.66

P-C9's shape holds for Telemann and **§10's expectation of Vulpius is CORRECTED by measurement**.
"Vulpius similar" predicts the two historical readings as the near pair; they are not, and the
reason is in the document rather than in the metric — the Amateur reading is the ROMANTIC one
with imprecision and asynchrony added. Its tempo, rubato and articulation rows against Romantic
are EXACTLY zero, three whole dimensions of two different performances comparing at 0 because
they really do share their maps, and everything separating them sits in `imprecisionTiming`,
`imprecisionDynamics` and `asynchrony`. That is a better test than the ordering the design asked
for: an expected ordering would pass on an implementation computing almost anything, while an
exact zero across three dimensions with a large nonzero on three others can only come out of
readers that agree with the document.

NEGATIVE CONTROLS, each failing exactly its own tests and restoring green: the neutral reading of
an unmatched part (3, two of them on real data); dropping the event atoms from the density (1 —
the closure test, which is what the atoms exist for); a first-covering-cell profile density
instead of the sum (1).

Gate: `npm run verify` GREEN before committing — 113 files, 4891 passed, 0 skipped (was 4860).
31 new tests. eslint and prettier clean across `src/comparison` and `tests/comparison`.

REMAINING IN W3B: the §9 facade with its validation table, typed errors and −0 normalization;
`src/index.ts` + `src/api` exports; P-C2 byte-identity at facade level; P-C11's walker; P-C5's
three-part split.

## 2026-08-16 — AD-53: driver accepted; Vulpius correction; interior decisions ratified [BINDING]

d916e9d + 0df387b accepted (invariance as data reaching the integrands
with the AD-20 scale=0 catch; the eleven-dimension driver; the
pointwiseDensityAt sum repair — the module's own shape-vs-scale lesson
one level down, negative-controlled). Note: the unmatched-part and
noteDensityWeight items in this report crossed with AD-52, which already
rules both (renderer-true implemented ✓; noteDensityWeight is REMOVED
from the surface, not shipped-as-throw — apply AD-52.3a in the facade
commit). Rulings on the rest:

AD-53.1 The Vulpius pin is RATIFIED and §10's expectation is corrected by
measurement: the Amateur reading IS the Romantic one plus imprecision/
asynchrony, so the near pair is Romantic–Amateur and three dimensions
compare at EXACT zero while three others carry the whole difference —
pinned as the sharper fact because an expected ordering passes on almost
anything while an exact three-dimension zero with structured nonzeros can
only come from readers that agree with the document. This is the
module's headline capability (exact decomposition) validated on real
data for the first time.
AD-53.2 The Telemann 3× accounting is accepted as renderer-true (three
parts each perform the global tempo deviation; the per-part sum counts
what is performed) and is pinned as its own test.
AD-53.3 The three interior decisions are RATIFIED as stated: §1.2
decomposition over the disjoint union of part curves; profile T-space
curves exported only where all parts agree (else null, density still
summed); ⊥ length across parts as MAX (a window fraction, not additive
mass).
AD-53.4 The unreachable-but-pinned T-space canonicalization placement
(RG-2's move at the function level) is noted with approval — a
correctness property pinned where no shipped row can currently reach it
is how it stays correct when one does.

## 2026-08-16 — W3b part 6: the §9 facade and the export surface (w3b-facade)

`src/api/comparison.ts` + `ComparisonEngineError` + the barrel wiring + 30 tests. `compareMpm`
is live and the module has a public surface for the first time.

**THE REPORT SHAPES ARE THE INTERIOR'S AND ARE RE-EXPORTED, NOT REDECLARED** — the precedent is
`ExaggerationReport`, which `api/types.ts` re-exports from `expression/report.ts` for the same
reason: the engine builds the shape, the facade hands it over unchanged (RULE F1), and a second
declaration would be a second thing to keep in step. What the facade OWNS is the option types,
the typed errors and the validation, i.e. the surface a caller can get wrong.

**§9.4's TABLE, WITH ITS ORDER AS A CONTRACT.** Options are validated before any document is
parsed, and a test pins that ordering by handing over a document that is not XML at all together
with a misspelled dimension: the caller is told about the misspelling, because that is the error
they can act on and the other may not even be theirs. Documents are then parsed `a`, `b`, `msm`,
each with its ROLE in the message — `MPM a:` / `MPM b:` / `MSM:` — which a single interior parse
could not say. `readComparisonPair` gained an `MpmSource = string | Element` so the facade's
parse is the ONLY one: passing the root through rather than the text is what keeps role-precise
errors from costing a second parse of a 300 KB document.

M11's `qbpm ≤ 0` row is implemented where the curve is built (`NonPositiveTempoError`, wrapped by
the facade): a transition between two positive endpoints stays positive, so the segments'
endpoints are the whole check.

[DECISION, reported] **`noteDensityWeight` THROWS IN BOTH BRANCHES**, with different reasons.
Without an `msm` it is AD-25.1's knowable case and the ruling already says `InvalidOptionError`.
WITH an `msm` it is not unknowable but UNIMPLEMENTED — the weight function `w(t)` would have to
reach all eleven dimensions' integrands — and the message says so. Returning an unweighted
report to a caller who asked for a weighted one would hide the gap behind a plausible-looking
result, which is the exact failure mode §9.4's own reasoning names for the first branch. A
silent degradation here would be worse than an error, and the error names the reason rather than
the option.

[FINDING — MINOR-2's normalizer is a GUARD, and the first test of it was VACUOUS] Deleting
`normalizeZeros` failed NOTHING on an identity comparison. The W2 verifier's MINOR-2 was right
that no shipped computation produces `-0`: every distance passes through `Math.abs` or a
non-negative accumulator, and a signed descriptor of an identical pair is `x − x`, which is `+0`
in IEEE754. The reachable path is the CALLER's — `-0` is a finite number `≥ 0`, so it passes the
weight validator and lands in the echoed weight vector, where `Object.is` assertions and the JSON
round trip would then disagree about a value the caller can see. The test is now pinned there,
with a working negative control, plus a standing walker asserting that nothing anywhere in a
report is `-0`. The vacuity is recorded in the test's own doc so the next reader does not have to
rediscover it.

`neutralMpm` (C8) ships: a `<performance>` with an empty `<dated>`, not a document with no
performance at all — the latter is a `PerformanceNotFoundError` by §9.4 and is exactly the
mistake the function exists to prevent. Pinned against the vendored `minimal.mpm`.

EXPORTS (§9.7): `export * from './comparison.js'` in `src/api/index.ts`; member by member from
`src/index.ts`, value exports and type exports listed separately. VERIFIED rather than assumed,
as the commission asks: there is NO `api` layer zone in `eslint.config.js` — the zones cover
`xml`/`midi`/`msm`/`mpm`/`mei`/`expression`/`comparison` and the facade sits above all of them —
so `src/api/comparison.ts` importing `src/comparison/**` is permitted, and the comparison zone's
own `'**/api/**'` entry (MINOR-5) still fences the reverse direction. `package.json`'s
`sideEffects` list is `["./dist/mpm/Mpm.js", "./dist/mpm/elements/maps/*.js"]`, a SINGLE-level
glob, and the only renderer file the comparison layer imports is
`mpm/elements/maps/data/bezier.js`, one directory deeper — so it is not marked side-effectful and
tree-shaking is unaffected. A21's `ppq.fallbackUsed` keeps its exact meaning and AD-27.2's third
state travels beside it as `unusableDeclaration: {a, b}`.

Gate: `npm run verify` GREEN before committing — 114 files, 4921 passed, 0 skipped (was 4891).
30 new tests. eslint and prettier clean on every touched file; `src/index.ts` reports one
`no-unnecessary-condition` error at `helperGetAllChildElements`, proven pre-existing by
re-running the same lint with the changes stashed (same error, same function, shifted line).

## 2026-08-16 — W3b part 7: P-C5, and a reporting gap it found (w3b-facade)

`tests/comparison/crossModule.test.ts` + 39 tests, and the cap-event reporting the property
exposed. This is the test that proves `compareMpm` and `exaggerateMpm` are ONE mathematics
rather than two that agree by inspection.

**THE LAW IS STATED WITHOUT THE CENTRE APPEARING ANYWHERE**, which is what makes it a test of
the two modules rather than of a third quantity neither exports:

    d(A, C(A, s)) = |1 − s| · d(A, C(A, 0))

`C(A, 0)` is the document flattened onto its own neutral, so the right-hand side is the
document's whole deviation from neutral AS THE COMPARISON MEASURES IT. If the two modules did
not share their scale spaces, their neutrals and their transforms, this would not hold to nine
decimal places for anything.

**IT HOLDS FOR SEVEN OF THE ELEVEN DIMENSIONS, INCLUDING THE EVENT AND DISTRIBUTION ONES.**
Measured at 1e-9 relative: tempo and dynamics (log spaces), asynchrony (linear), accentuation
(a scaled pattern), **articulation** — an event dimension, so the affine law survives the
alignment DP untouched, because the optimum matches the same anchors on both sides and is then
the row-wise sum — **ornamentation** (three expression dimensions behind one comparison
dimension), and **imprecisionTiming** — a distribution dimension, where the law survives the
WASSERSTEIN integral, `W₁` between two uniform laws being linear in their parameters. §1.3's
proposition was written about curves; it reaches further than that, and the measurement is what
says so.

THE THREE EXCEPTIONS ARE MEASURED RATHER THAN ASSERTED ABSENT, because an exception nobody has
measured is indistinguishable from a defect nobody has found:
- **rubato** deviates by a pinned 0.7999 at s = 2 — §4's flag 2 already records that expression's
  window rows are `joint-trim` while the comparison prices the window as L1 on the ENDPOINTS, a
  documented substitution rather than the same space, and the displacement curve is not affine in
  `@intensity` either;
- **dynamics past the velocity clamp** deviates by a pinned 0.7609 at s = 2, where R6(a)'s clamp
  saturates the transform;
- **pedal** is VACUOUS rather than false: §3's correspondence maps `pedal ⊇ {pedalShape}` and the
  fifteen expression dimensions carry no pedal LEVEL, so a factor moves the curvature and not the
  position. `d = 0` exactly, pinned as the measurement that says so.

**THE SKIP CONDITION IS A REPORTED FACT, NOT A CONVENIENCE.** A factor is outside the law when
either module says it stopped being affine: the TRANSFORM saturated a bound, refused a write or
left a domain (its report names every such site), or the METRIC's own cap bound — §4's
`min(|T(x) − T(y)|, 2·δ_row)` truncating a difference the transform made faithfully. Both are
read out of the two reports, and a non-vacuity assertion requires at least three unsaturated
factors per fixture so the skip cannot swallow the test.

[DEFECT FOUND BY THE PROPERTY, in shipped code] **The event dimensions reported `cappedCells: 0`
unconditionally.** §4's cap binds inside `localDistance`, which articulation and ornamentation
call once per row, and AD-2 requires cap events to be reported — so a report could truncate a
difference at `2·δ_row` and say nothing. Found because the law failed at `s = 4` and the report
gave no reason: the composed `relativeDuration` is `0.5⁴`, i.e. 21.8 JND on one row, past the 20
the cap allows. Both modules now count the anchors where the cap bound, and they count them over
the CHOSEN ALIGNMENT rather than inside the cost function — the DP evaluates that function at
every cell of its table, so a counter there would report the search rather than the answer.
Pinned in both directions (a run with no capped row says nothing; the s = 4 run counts and emits
the `capped` note) and negative-controlled.

AD-6's PARTS (ii) AND (iii). The breakpoint law is stated on DIFFERENCES of log row values, which
cancels the centre — §4's own flag 1 records that the collapse of `log-around-center` to the bare
logarithm is a property of differences, and this is that collapse used as the test it licenses.
Part (iii)'s `d_shape` bounds are measured and pinned: on a transition spanning the whole window
with a factor-of-two tempo change in it, two factors with the SAME `|1 − s|` score 1.06296023
apart and a doubled `|1 − s|` scores 2.18740836 rather than 2 — both inside 10 %, so the exact law
is a good estimate and the report's numbers are the integral rather than the estimate. Removing
the transition from the same document restores the law exactly, which is what makes the bound a
statement about interpolation rather than about the fixture.

Gate: `npm run verify` GREEN before committing — 115 files, 4960 passed, 0 skipped (was 4921).
39 new tests. eslint and prettier clean.

## 2026-08-16 — W3b part 8: P-C2 and P-C11 at the facade (w3b-facade)

`tests/comparison/properties.test.ts` + 24 tests, and §9.6's zero-length-window note. The two
properties that are about the REPORT rather than about a number in it.

**P-C2 IS ASSERTED ON `JSON.stringify`, WHICH IS WHAT §9.5 PINS.** Comparing distances would miss
an asymmetric segment ranking, an asymmetric note order, or a field carrying a document's
identity without swapping. The swap map is written out as CODE in the test — swap, negate,
invert, each a different operation on a different field — so a future field that needs mirroring
fails the test rather than quietly breaking the promise. Six pairs, including two documents at
different tick grids (720 against 480), a real document against `neutralMpm`, and the Albert
document whose two performances have UNEQUAL PART SETS. Plus a non-vacuity test asserting that
the un-mirrored reverse really does differ.

[FINDING — §9.5's "the ratio INVERTS" is true of the real number and NOT of the double.] The
mirror's first version computed `1/ratio` and failed byte-identity on the Albert pair by two
ulps: `1/(a/b)` is 1.0439297220611783 where `b/a` is 1.0439297220611785. The swap map's other
entries are permutations of stored fields, which are bit-exact by construction; `ratio` is
DERIVED from two fields that swap, so the mirror takes the quotient of the swapped seconds — the
same permutation of the same fields, and the arithmetic the engine performs. The inversion is the
statement; the quotient is the computation. Recorded in the test at the point it bit.

**P-C11 walks every number of every result** over the whole vendored corpus and seven degenerate
shapes §9.6 names: `L = 0`, all-zero weights, both-neutral everywhere, a document against itself,
a `⊥` span on both sides, an invariance mode on a dimension neither document carries, and a
profile over a window with no cells. Finite or null, no `undefined`, in every one.

§9.6's `L = 0` clause said "every mean is `null`, WITH A TYPED NOTE" and the note was missing —
the nulls were right and silent. Added, and pinned beside the nulls: a reader should not have to
infer a zero-length window from a field that is null for several possible reasons.

NEGATIVE CONTROLS, each failing exactly its own tests and restoring green: dropping the MESSAGE
tiebreak from the note sort, which leaves the order dependent on the array's own
orientation-dependent order (1 — the Albert pair, the only one with notes that tie on
`(kind, dimension, startQuarters, document)`); summing the `⊥` length across parts instead of
taking the maximum (1 — and that control found a GAP first: no test covered the rule, so one was
written before the control was run, which is the right order).

Gate: `npm run verify` GREEN before committing — 116 files, 4984 passed, 0 skipped (was 4960).
24 new tests. eslint and prettier clean.

## 2026-08-16 — W3b part 9: MINOR-4's malformed-value table, ruled by the renderer (w3b-facade)

`tests/comparison/malformedValues.test.ts` + 13 tests, and the two readers repaired. AD-33.6
assigned MINOR-4 to W3b with the instruction to "decide them together rather than one at a
time"; deciding them together is what makes one of the three answers different from what the
report that raised them predicted.

**THE TABLE, EVERY ROW MEASURED THROUGH `performMsm`:**

| input | the verifier predicted | the renderer does | now read as |
| --- | --- | --- | --- |
| `curvature="abc"` on a `<dynamics>` transition | `velocity="NaN"` | performs the MIDPOINT of the endpoints as a CONSTANT | a constant at the midpoint |
| `intensity="abc"` with a `rubatoDef` in scope | keeps NaN, ignores the def | keeps NaN, `date.perf="NaN"` over the warped frame | `⊥` over the warped frame |
| `frameLength="0"` with `@loop` | NaN warped dates | `date.perf="NaN"` over the whole span | `⊥` over the whole span |

**ROW 1 IS REFUTED, AND THE MECHANISM IS EXACT.** `clampCurvature` is two comparisons, `value <
0` and `value > 1`, and `NaN` fails both — so the control points really are `NaN`, as the report
says. But `tForDate` starts at `t = 0.5` and loops `while (Math.abs(diffX) >= 1.0)`, which `NaN`
also fails, so `t` never moves; and the value fraction at `t = 0.5` is `(3 − 2t)t² = 0.5` for
EVERY shape. Executed: 40 → 120 with `curvature="abc"` performs 40, 80, 80, 80 on notes at
0/720/1440/2160 — the arithmetic midpoint, held as a constant, with the two exact endpoints
(`getTForDate` short-circuits `t = 0` and `t = 1`) as single points of measure zero. Reading it
as `⊥` would have priced at `δ_row` a performance the renderer gives perfectly well; reading it
as a repaired `curvature = 0` — which is what shipped — gives a smoothstep RAMP where the
renderer holds a constant. Both are wrong and they are wrong in different directions.

**ROWS 2 AND 3 CONFIRM, and the rule behind them is sharper than the report's.**
`getRubatoDataOf` tests the attribute's PRESENCE, not its usability:
`if (att !== null) rd.x = parseFloat(...); else if (def) rd.x = def.getX();`. So a
present-but-unusable value keeps its `NaN` and the def is never consulted FOR THAT ATTRIBUTE —
which the shipped reader got backwards, silently performing the def's warp where the renderer
performs none. The same presence rule and the same `NaN`-survives-the-clamps mechanic reach
`@lateStart` and `@earlyEnd` (`NaN < 0`, `NaN > 1` and `NaN >= earlyEnd` are all false), which
the report did not name and which are now covered.

WHERE the poison lands is the render loop's own guard, `!loop && date >= startDate +
frameLength`, and three cases fall out of it, all measured:
- an UNUSABLE `@frameLength` poisons the WHOLE span even without `@loop`, because `NaN` fails
  the guard and every note in the span is warped — worse than a zero one;
- `frameLength="0"` poisons the whole span WITH `@loop` (`x % 0` is `NaN`) and NOTHING without
  it (the guard breaks on the first note), which is the existing skip-to-a-neutral-gap reading;
- a NEGATIVE `@frameLength` performs the IDENTITY on the dates the renderer visits — `%` takes
  the dividend's sign — so it is not `⊥` at all.

**AD-36.2 IS THEREFORE FORCED FOR RUBATO**, which is the consequence that makes this more than a
reader fix: rubato had no `⊥` route before, and now it has four. `rubatoDistance` moves from
`integrateAbsolute` to `integrateCappedAbsolute` and prices a `⊥` interval at `δ_row` per
quarter through `localDistance`, exactly as accentuation and pedal do. The triangle inequality
with a `⊥` document as the middle term is pinned — over a FOUR-quarter frame, because over a
one-quarter frame the displacement cannot reach the 20 JND the cap sits at and the test would
have passed uncapped (measured: it did, until the fixture was fixed).

PEDAL WAS CHECKED AND NEEDS NOTHING. `MovementData` uses the same `tForDate`, but the movement
path SAMPLES the curve instead of evaluating it per note, so a `NaN` control point produces
events with `date="null"` — nothing is placed at all — and `pedalCurve` already reads that as
`⊥` through §5.8's non-monotone-date rule. One `NaN`, two renderer paths, two dispositions, and
the comparison already had both right.

NEGATIVE CONTROLS, each failing exactly its own tests and restoring green: repairing an unusable
`@curvature` to 0 (2); inheriting a present-but-unusable rubato attribute from the def (4);
removing the cap from the rubato integrand (1, after the fixture was strengthened to reach it).

Gate: `npm run verify` GREEN before committing — 117 files, 4997 passed, 0 skipped (was 4984).
13 new tests. eslint and prettier clean.

## 2026-08-16 — AD-52.3a applied: noteDensityWeight removed from the surface (w3b-facade)

The one ruling that crossed with a landed commit. AD-52.3a rules the option OUT of the v1
surface rather than shipped-as-throw, and the facade commit had already landed with the throw
in it; this is the follow-up the ruling names, and no code path is left advertising a capability
that is not there.

Removed from `ComparisonSettings`, from the validator, and from
`ResolvedComparisonSettings` — so the echoed settings record now has exactly the five fields the
run actually used. DESIGN §9.2 amended under the delegation, with the reason stated where the
option was declared: AD-3 keeps the MSM note-count weight as design intent, the weight function
`w(t)` has to reach all eleven dimensions' integrands, and adding the key back later is
non-breaking.

[PREMISE CORRECTION, reported rather than left standing] AD-52.3a's reasoning says "unknown keys
already error". That is true of the NESTED key vocabularies — `weights`, `jnd`, `plausibleRange`
and `invariance` all reject an unknown dimension or row key, naming every offender — and it is
NOT true of top-level option keys: `compareMpm` ignores an unrecognized field on the options bag,
exactly as `exaggerateMpm` and `performMsm` do. So after the removal a TypeScript caller who
writes `noteDensityWeight` fails to compile and a JavaScript caller is silently ignored, which
is the same treatment every other unknown top-level key gets in this package. The ruling's
CONCLUSION is unaffected — an absent option is better than one that only throws — but a
top-level unknown-key check would be a new policy across all three facades, so it is asked for
rather than invented here.

Gate: `npm run verify` GREEN — 4996 passed, 0 skipped (one test removed with the option, one
key-list assertion updated in each of the two suites that pinned the echo). eslint and prettier
clean; DESIGN.md prettier-clean.

## 2026-08-16 — AD-54: W3b COMPLETE; rulings; W3 wave gate convened [BINDING]

Nine w3b-fac commits accepted through bc7a2f6 (4996 + 0 skipped).
compareMpm is live. Highlights on the record: P-C5 stated centre-free
(d(A, C(A,s)) = |1−s|·d(A, C(A,0))) and MEASURED across seven dimensions
— surviving the alignment DP and the Wasserstein integral, which §1.3's
curve-scoped proposition never promised; the cappedCells defect it found
(unconditional 0 against AD-2) fixed at the alignment level; MINOR-4's
audit REFUTING the W2 verifier's NaN-curvature prediction with the
measured midpoint-constant mechanism; rubato's first ⊥ route forcing
AD-36.2 there, with the fixture sized so the cap can actually bind.

AD-54.1 The P-C5 exception list is RATIFIED as measured anchors (rubato
joint-trim substitution; dynamics velocity clamp; pedal level-vacuity
from §3's correspondence) — the AD-6 split anticipated exactly these.
AD-54.2 cappedCells in ANCHOR units for event dimensions: RATIFIED (the
unit their density is carried in).
AD-54.3 Top-level unknown option keys: FOLLOW THE PRECEDENT (ignored, as
exaggerateMpm and performMsm do; the nested vocabularies stay strict).
One facade diverging in strictness is worse than shared laxity; a
repo-wide tightening is a facade-family decision for the owner, noted as
future work, not campaign scope.
AD-54.4 The NaN-curvature midpoint-constant repair and the rubato
presence-not-usability def rule are accepted as renderer-true; both
supersede the corresponding W2-VERIFICATION §5 rows, and the record
notes the verifier's prediction was refuted by measurement — the
standard applies to verifiers too.
AD-54.5 w3b-fac's HANDOFF ACCEPTED at bc7a2f6. Tenure: event atoms,
densityAt, invariance-as-data, the eleven-dimension driver, the facade,
neutralMpm, P-C2/P-C11/P-C5, MINOR-2/4, the AD-3 correction, and the
first full-spectrum real numbers with the Vulpius validation. Six
tenures, one unbroken record standard.
AD-54.6 THE W3 WAVE GATE CONVENES: an independent Opus verifier over
b9444cf..bc7a2f6 (everything since the W2 re-gate) — renderer-truth spot
audit incl. the divergence rulings as implemented; test-vacuity hunt;
metric-property audit (capped/⊥ interactions, per-part summation, the
canonical table's closure); independent numerical audit of the
Wasserstein machinery; §5.4–§5.9/§7/§9 design-coverage walk; house rules
incl. the plain-data walker; and EXTRA weight on anything
conductor-authored (the imprecisionDegenerate probe test). Deliverable
W3-VERIFICATION.md with GATE-PASS/BLOCK; fixes and re-gate per the W2
pattern.

## 2026-08-16 — AD-55: W3 gate verdict GATE-BLOCK; fix-wave rulings [BINDING]

W3-VERIFICATION.md archived (6 CAPITAL, 18 MAJOR, ~18 MINOR; 18/19
renderer behaviours reproduce exactly; 12/12 falsifiability probes incl.
the conductor's test; the audit's own standard — mpmath references at
60-80 dps, nothing accepted from the module's own tests — is the gate
working as designed). Rulings on the four items needing more than a patch:

AD-55.1 (CAPITAL-1) RULED as the report's repair (a)+(b): the
defaultArticulation step function becomes a LIVE second component of
d_articulation — a piecewise-constant step reading priced by
localDistance on the resolved def's effective modifier per cell, summed
with the alignment optimum (articulationDefault.ts already returns the
step list; that is why it was written). @defaultArticulation is
RECLASSIFIED from exclusion to live. NEW STANDING OBLIGATION: every
partition-test EXCLUSION carries a renderer-checked reason — an
attribute is an exclusion only if changing it changes no performed
value; the classification call is itself a renderer claim and gets the
renderer standard.
AD-55.2 (CAPITAL-2) RULED as the report's repair: with an MSM, part
scopes are driven by the MSM's part list (each paired with its MPM
counterpart or the document's global scope per AD-52.2) — that is what
renderParts iterates and therefore what performs; without an MSM the
MPM-driven count stands WITH the estimate-degradation note. §7.5
sentence delegated to the fix commit. AD-53.2's justification is
SUPERSEDED (its 3× pin measured the artifact — empty <part> elements);
every multi-part anchor is re-pinned under the corrected rule in the fix
wave, and the fix commit's LOG entry records old → new numbers.
AD-55.3 (MAJOR-2) RULED: the imprecision epsilon's relative figure is
restated against the SUPPORT SCALE (the quantity that is machine-precise;
measured ≤ 3e-17), with the JND figure operative and the
well-separated-pairs caveat for the naive relative reading. Lands after
CAPITAL-3's clamp.
AD-55.4 (MAJOR-5) RULED: the CODE is authoritative — ln(1.025) per
AD-27.6; DESIGN §7.1's stale ln(1.05) row is corrected under delegation.
AD-55.5 All remaining findings are ACCEPTED with their proposed repairs:
CAPITAL-3 (verified clamp), CAPITAL-4 (surface the ruled field),
CAPITAL-5 (the MSM arm of suspectPair), CAPITAL-6 (code-unit sort — the
module's own ban applied to itself), MAJOR-1 (all eleven dimensions in
the metric suite + one family member per uncovered surface), MAJOR-17
(symmetric tie-break key), MAJOR-16 (/comparison/ anchor + npm run
format over the 28 files + repo-wide prettier --check joins the wave
gate NOW, not W5), MAJOR-4/6/7..15 and the should-fix MINORs as listed.
MINOR-8 was pre-declared by its author and is recorded as such.
AD-55.6 Fix wave assigned to a FRESH Opus worker (w3-fix) with
W3-VERIFICATION.md as its specification (the findings carry executable
evidence and verified repairs); w3-verify re-gates scoped to the
findings afterward, per the W2 pattern.

## 2026-08-16 — W3 fix cut 1: MAJOR-16, the prettierignore anchor (w3-fix)

[RE-CUT, journalled] The commission put MAJOR-16 fourth. It goes first instead, for one reason:
AD-55.5 puts repo-wide `npx prettier --check` in the pre-commit gate NOW, and until the anchor
lands that check is vacuous over `src/comparison/**` while failing on one pre-existing file
(`tests/midi/Midi.test.ts`, unformatted since 67b407e). Landing it first makes the gate real
from commit 1 and keeps the fix wave's own new code out of the 28-file reformat — otherwise
every later cut would write unformatted code that this commit then rewrites, and the reformat
would be entangled with the semantics after all.

`.prettierignore:27` `comparison/` → `/comparison/`. Gitignore semantics match at any depth, so
the unanchored spelling swallowed `src/comparison/` and `tests/comparison/` along with the
campaign-record directory it was written for. The file's own rewrite documents this exact hazard
three lines above, for the sibling `/expression/` entry, and this one never got the slash.
`npm run format` then reformatted 28 comparison sources plus the one file outside the wave.

Nothing else is in this commit: no line of it changes a value, and `npm run verify` reports the
same 4996 passed / 0 skipped before and after, which is the check that says so.

Gate: `npm run verify` GREEN — 117 files, 4996 passed, 0 skipped. `npx prettier --check .` clean
repo-wide for the first time. eslint clean on `src/comparison/` and `tests/comparison/`.

## 2026-08-16 — W3 fix cut 2: CAPITAL-1 and CAPITAL-2, the two semantic capitals (w3-fix)

Both rulings implemented, both verified against the renderer through the pipeline, and every
multi-part anchor re-pinned once rather than twice — which is why they share a commit.

**CAPITAL-1 / AD-55.1 — the default step function is now a live second component.**
`articulationDefault.ts` was imported by nothing in `src/`. `defaultArticulationDistance`
(`articulationDistance.ts`) prices the two curves' joint refinement: per cell, `localDistance` on
the resolved def's effective modifier — via the new `articulationDefAtom`, so the affine form and
the liveness rule are `articulationAtoms`' own and not a second reading — sustained over the cell,
summed with the alignment optimum. The step mass reaches §7 as CELLS and the alignment's as
ATOMS, which is §5.0's measure used by one dimension for both, and AD-19's table still closes
(residual 0.00e+0 on all seven vendored pairs, worst closure 3.64e-12 absolute on 24941).
A cancelled or absent default prices as the NEUTRAL modifier, never `⊥`.

Verified on the report's own three-document probe, through `performMsm` and then through the
facade — CANCEL 50,50,100,100 / CONTINUE 50,50,50,50 / NODEFAULT 100,100,100,100, and the three
pairwise distances are `|ln 2|/jnd` × 1, × 3 and × 4 quarters, which add up because they are
lengths of one step function. And on the REAL Albert pair: `d_articulation` 92.233 → 962.633,
the 870.4 being `(96/jnd_ms + (60/720)/jnd_quarters) × 64 quarters × 3 scopes` — the two
`nonlegato` defs are written in different units and §5.5 gives them different rows, so both fire.

**CAPITAL-1(b) — the exclusion obligation, and one defect it immediately found.**
The partition test's call is now THREE-way: row / excluded / **resolved** (live, no row of its
own — `@name.ref` and `@defaultArticulation`). `CLASSIFICATION_PROBES` gives every non-row
attribute a channel and an executable probe: `'priced'` must move `D`, `'reported'` must give
`D = 0` plus a note that names the difference, `'out-of-scope'` must give `D = 0` plus a RENDERER
probe showing where the performed difference went. A new exclusion with no probe fails the list
check before any probe runs.

[NEW FINDING, found by the obligation and fixed here] `@controller`'s stated channel did not
fire. AD-36.3 files it to "the structural finding channel", `PedalCurve.controllers` was computed
for exactly that, and `grep` says nothing outside `pedalCurve.ts` ever read it — so two documents
driving `sustain` and `soft` produced `D = 0` and no note at all. `controllerNotes` in
`dimensions.ts` emits it, silently for the ordinary `sustain`-only map. This is CAPITAL-1's shape
one dimension over, and it is the obligation working as AD-55.1 intended.

Also measured while probing, and left as it is because AD-41.1 already ruled it: the ornament
pool's `@midi.pitch` / `@interval.chromatic` / `@interval.diatonic` DO change a performed value —
the generated note's pitch, and nothing else, which the `'out-of-scope'` probe now pins by
diffing two rendered documents with the `midi.pitch` attributes masked out.

**CAPITAL-2 / AD-55.2 — part scopes are the score's.**
`scopeSides` takes an MSM. With one, the scopes are the rendered MSM parts (a part with no
`<dated>` is skipped, as `renderParts` skips it), each matched into both documents the way
`getCorrespondingPart` matches — `@number` first, then `@name`, which is the renderer's second
lookup and had no counterpart in the comparison before. A document with no counterpart for a
score part contributes its own global scope (AD-52.2, unchanged). Without an MSM the MPM-driven
count stands and carries an `estimate-degradation` note. `report.scopes = { rule, count }` states
the multiplier; `report.parts` keeps its meaning (the two MPMs' own part sets).

AD-53.2's 3× pin is replaced by three tests: the renderer probe (k = 0..3 empty MPM parts,
byte-identical performances), the comparison probe (k = 0..3, constant `D`), and the score-driven
3× (three MSM parts, 3 × the one-part number). Plus the `@name` fallback, which nothing pinned.

**Old → new anchors.** The vendored corpus's MSM part counts happen to equal its MPM part counts
(telemann 3, vulpius 4, albert 3), so no vendored number moved for CAPITAL-2; every move below is
CAPITAL-1's step component. Measured with the MSM supplied, as the suite pins them:

| pair | old D | new D | d_articulation old → new |
| --- | --- | --- | --- |
| telemann Baroque\|Fast | 22357.0626 | **24941.0626** | 75 → 2659 |
| telemann Baroque\|Romantic | 6493.6010 | **8397.6010** | 100 → 2004 |
| telemann Fast\|Romantic | 21686.7196 | **26174.7196** | 35 → 4523 |
| vulpius Baroque\|Romantic | 8849.3905 | 8849.3905 | 154.9056 (unchanged) |
| vulpius Baroque\|Amateur | 10294.4974 | 10294.4974 | 154.9056 (unchanged) |
| vulpius Romantic\|Amateur | 2939.6596 | 2939.6596 | 0 (unchanged) |
| albert Axel\|Robot | 8929.5188 | **9854.3188** | 92.2334 → 1017.0334 |

Vulpius is unchanged because its three performances share one `@defaultArticulation`; that the
Romantic\|Amateur articulation row is still EXACTLY 0 across both components is the check that
says the new component is not a constant added everywhere. `baroqueRomantic.aggregate.mean`
31.83137755 → 41.164710882.

**Negative controls**, each by patch → `vitest run` → restore, tree verified clean after each:

| repair reverted | fails |
| --- | --- |
| `defaultArticulationDistance` returns 0 | 4: the `@defaultArticulation` channel probe, both AD-55.1 distance tests, the Telemann pin |
| MSM-driven scopes disabled | 4: three AD-55.2 tests, the Telemann pin (its `scopes` assertion) |
| `controllerNotes` removed | 1: `@controller`'s channel probe |
| `defaultArticulation` back in `EXCLUDED_ATTRIBUTES` | 2: the partition test, the probe-debt list |

DESIGN amended under the AD-55 delegations: §5.5 gains "`d_articulation` has TWO components";
§5.0's per-part paragraph gains the MSM-driven rule and loses AD-3's superseded neutral-curve
wording; §7.2 gains the sentence that the scope count is `D`'s second multiplier; §9.3 gains
`scopes`. [RE-SITED, journalled] AD-55.2 delegates "the §7.5 sentence"; §7.5 is *Signed
descriptors*, and the sentence AD-55.2 supersedes physically lives in §5.0's per-part paragraph,
so the rule is written there with a cross-reference from §7.2 where `D = Σ ω_k d_k` is defined.
Writing a part-scope rule into the signed-descriptor section would have satisfied the citation
and hidden the correction.

Gate: `npm run verify` GREEN — 117 files, **5012 passed**, 0 skipped (4996 + 16). Repo-wide
`npx prettier --check .` clean; eslint clean on `src/comparison/` and `tests/comparison/`.

## 2026-08-16 — W3 fix cut 3: CAPITAL-3, 4, 5, 6 (and MAJOR-7 with CAPITAL-5) (w3-fix)

The four mechanical capitals, plus the one MAJOR that is the same constant as CAPITAL-5 and
would have been a second edit to the same line.

**CAPITAL-3 — `triangularSupport`'s branch fraction is clamped.** `distributions.ts:369-370`.
The fraction is the `u` at which the renderer's sampler switches branches; for `mode > upper` it
exceeds 1, so the rising branch runs to `u = 1` and the supremum is `lower + √(scale·belowMode)`
— which is where the sampler actually reaches. The verified one-line repair, measured against
the sampler's own formula: `T(−30,30,99)` hull `99` → **57.977270**, `T(0,1,1000)` hull `1000` →
**31.622777**. The damage was that the true endpoint, where the integrand kinks, never entered
`cdfBreakpoints`, so GL-10 straddled it; `W₁` restored to machine precision —
`T(0,1,1000)` vs δ₀ 21.30673514709183 → **21.08185106778919** (true 21.081851067789195, rel
2.4e-16, was 1.07e-2); `T(−30,30,99)` vs δ₀ 30.977459211857905 → **30.977094589809553** (rel
3.6e-16, was 1.18e-5). Mode-INSIDE behaviour is bit-identical. At the facade, measured before and
after on a triangular whose clips do not bound the overstated hull: `mode=99` 3.8202503755345423
→ 3.820201759261429 (rel 1.27e-05) and `mode=1000` 18.098836823489286 → 18.097427368277422
(rel 7.79e-05) — the report's two relative figures, reproduced. The secondary consequence is
fixed by the same line: `clippedLaw` now collapses a clip that is vacuous in truth, so
`lawsEqual(base, clipped)` is true for two laws that are equal.

Tested against an INDEPENDENT reference in the quantile domain — a 4096-panel composite Simpson
of `|Q(u)|`, which needs no support hull at all and therefore cannot inherit the same bug — and
against the sampler's two-branch formula evaluated at the extreme `u`.

**CAPITAL-4 — `cellQuantizedDimensions` reaches the report.** AD-51.1 named it and it lived only
on the internal `SegmentPass`. Surfaced beside `remainder`, added to §9.3. `EvaluationCell.densityAt`
is nullable again so AD-51.1's graceful path is reachable end to end rather than only inside
`aggregate.ts`, and `densityAtOf` falls back to the cell mean where it is null, as `aggregate.ts`
does one level up. The field is `[]` for every document this engine can produce, which is the
point of shipping it: a reader can tell "no boundary is approximate" from "nobody checked".

**CAPITAL-5 + MAJOR-7 — C7's second arm, at C7's documented band.** §5.0 asks for the length
check between the MPMs "and the same check against the score end when an MSM is supplied"; no
such check existed. `suspectPair` now tests the score end against BOTH documents' last dates.
Probed with the Telemann MPM (last date 198 quarters) against the Vulpius MSM (score end 54):
window 54, 73 % of the piece silently truncated, and the report now fires a `length-mismatch`
note naming both numbers. The band moves from `0.5` to **0.8** — §5.0's documented `[0.8, 1.25]`
read as a ratio — because the constant and the sentence describing it disagreed by 1.6× and
neither was pinned; a 1.67× mismatch passed silently before.

[MEASURED, reported rather than smoothed over] On the vendored corpus with their own scores the
new arm changes no verdict: telemann/bach/aller-augen stay quiet, vulpius was already flagged by
the part-number arm (`partNumbersMatched: false`, 4 parts against 3), and albert was already
flagged by the length arm — its "Like a robot" performance has no instruction after date 0, so
`lastDateB = 0` and every length-based arm fires on it. That is C7's known weakness, not a new
one: a "last dated instruction" is not a length, and a deadpan performance legitimately has none.
The note is worded as a question and names the three numbers, so a reader sees the 0 immediately.
The ruled repair is implemented as ruled; refining the proxy is a separate question.

**CAPITAL-6 — the anchor sort is code-unit order.** `articulationDistance.ts`. The module bans
`localeCompare` by name 700 lines away for the report, and the ban binds harder here because
this order is the aligner's INPUT and decides a distance. Reproduced end to end with two
documents carrying two anchors each at one date, disjoint id sets and different modifiers:

```
BEFORE  LC_ALL=en_US  d_articulation = 0.000000000   sha=97c9909a
BEFORE  LC_ALL=sv_SE  d_articulation = 14.545081795  sha=0f1807ca
AFTER   en_US / sv_SE / da_DK all: 14.545081795      sha=0f1807ca
```

Pinned at the ORDER rather than by running under two locales, which no in-process test can do —
ICU's collator is fixed at startup. The fixture ids are chosen so code-unit order and collation
disagree in every common locale ('B' before 'a' by code unit, after it by collation), and the
test asserts `'a'.localeCompare('B') < 0` as well, so a host whose ICU ever agreed would say so
rather than let the test go quietly vacuous.

**Negative controls**, each by patch → `vitest run` → restore:

| repair reverted | fails |
| --- | --- |
| the clamp (`rise = fraction`) | 3, all CAPITAL-3's own |
| `cellQuantizedDimensions` dropped from the report | 12: its own test plus every plain-data / P-C11 walker, which is what those walkers are for |
| the MSM arm disabled and the band back at 0.5 | 2: CAPITAL-5's and MAJOR-7's |
| back to `localeCompare` | 1, CAPITAL-6's own |

Gate: `npm run verify` GREEN — 117 files, **5019 passed**, 0 skipped. Repo-wide
`npx prettier --check .` clean; eslint clean on `src/comparison/` and `tests/comparison/`.

## 2026-08-16 — W3 fix cut 4: MAJOR-1, 2, 3, 4, 5, 6, 17 (w3-fix)

The seven MAJORs that change what is CHECKED or what is PUBLISHED. None moves a vendored
headline number — the seven anchors are bit-identical to cut 2's — which is itself the finding:
these were pins that could not see, records that were wrong, and one order that was not total.

**MAJOR-17 — the alignment tie-break is symmetric now, not merely fixed.** `eventAlignment.ts`'s
cascade `match → dropA → dropB` made the argmin a function of the inputs and, at an equal-cost
tie, selected the mirror image of what the swapped call selected. `preferredDrop` breaks the tie
on a key of the two EVENTS — smaller `dateTicks`, then smaller `id` in code-unit order — so both
orientations reach the same decision from their own side. Verified on the two cross-document
pairs the report named:

```
aller-augen | bach   events fwd [0,35,780]  rev [0,780,35]   (exact mirror)  peak identical
albert      | bach   events fwd [9,58,576]  rev [9,576,58]   (exact mirror)  peak identical
```

The residue — two events agreeing on date AND id — falls to `dropA` and is documented; it needs
equal cost as well, and equal non-null ids would have been PINNED rather than dropped.

**MAJOR-1 — the metric suite runs on all eleven dimensions.** `DIMENSIONS` is now literally
`COMPARISON_DIMENSIONS`, and the distance is taken through `evaluateDimension` — the driver's own
entry — rather than through hand-wired reader/distance pairs. A dimension therefore cannot be in
the report and absent here, and each dimension is checked over everything its `d_k` is made of
(articulation's two components included). Nine family members added, one per uncovered surface,
each shown to REACH it and not merely to contain it:

| member | reaches | measured |
| --- | --- | --- |
| `rubato-plain` / `rubato-bottom` | rubato's first ⊥ route, and the cap | `d(⊥, warp) = 40 = δ_row × 4` with the cap binding in all 4 cells |
| `articulation-anchors` / `-offset` | a NON-TRIVIAL alignment | matched 1, unmatchedA 3, unmatchedB 3 — the DP trades a match against drops |
| `articulation-default` | AD-55.1's step component alone | 23.70 against a document with no articulation map |
| `ornament-plain` / `-milliseconds` | §5.6's incomparable `@time.unit` pair | `2 × 2·δ_row = 40`, cap binding on both anchors |
| `imprecision-other-domains` (+`-bottom`) | the two imprecision domains with no member at all | dynamics 8.00, duration 1.96; both ⊥ arms at `δ_row × 4` |

[MEASURED while building it] The toneduration member first scored 0 against a document with no
such map, which is renderer-true and useless: absent `clip.*` read as 0 and collapse a triangular
to δ₀ (AD-49.1's degenerate table). The clips are explicit now, with the reason written down.

**MAJOR-2 / AD-55.3 — the imprecision epsilon says what it is relative TO.** The published
3.6e-16 was a naive `|Δ|/W₁` on well-separated pairs; two uniforms `6e-12` apart falsify it by
eleven orders while the ABSOLUTE error stays at one ulp of the support. Measured over 14 pairs
with closed forms derived from `∫₀¹|Q_A − Q_B| du`:

```
U(-30,30) vs shifted 6      exact 6.0e+0   abs 1.78e-15  naive 2.96e-16  per support 2.69e-17
U(-30,30) vs shifted 6e-6   exact 6.0e-6   abs 7.08e-16  naive 1.18e-10  per support 1.18e-17
U(-30,30) vs shifted 6e-12  exact 6.0e-12  abs 3.24e-16  naive 5.39e-05  per support 5.39e-18
```

The field now carries **3e-16 relative to the SUPPORT SCALE** — worst over the family, reached at
the point-mass pairs where the two readings coincide because the support degenerates to the
separation — with `jnd: 1.2e-16` operative and the well-separated caveat written at the constant.

[MEASUREMENT DIFFERS FROM THE RULING, reported] AD-55.3 records "measured ≤ 3e-17". That figure
is the verifier's uniform-only table, where the support (60) is ten times the answer. Over a
family that includes two point masses the same quantity is 3.0e-16, and publishing 3e-17 would
have been publishing a number this repository cannot reproduce. The ruling's SUBSTANCE — restate
against the support scale, keep the JND figure operative — is implemented exactly.

**MAJOR-3 — the Halley residual is complementary in the right tail.** `Φ(x) − p` cancels
completely as `p → 1`, so the correction was noise and Acklam's raw 1.15e-9 survived; the round
trip that pinned it is `|Φ(Q(p)) − p| / p`, which is exactly 0 there whatever `Q` returned.
`(1 − p) − Φ(−x)` has no cancellation in it: `1 − p` is exact by Sterbenz and `Φ(−x)` is the
left tail. Against `mpmath` at 60 dps, references computed for the DOUBLE the caller passes
(`fl(1 − 10⁻ᵏ)` is not the complement of `fl(10⁻ᵏ)`, and comparing both tails to one list of
magnitudes would charge the right tail 1 % of a reference it never claimed):

```
worst relative, k = 1..15   right tail 1.15e-15   left tail 1.15e-15    (was 1.12e-9 / 1.4e-17)
```

Two new pins: the mpmath table, and the round trip restated on `1 − p`.

**MINOR-2, in the same file** — the published Φ left-tail relative figure was 4.9e-14, measured
on a 0.01 grid that steps over the peak. The peak sits just under `ERFC_CONTINUED_FRACTION_LIMIT`
where `1 − erfSeries` still cancels two digits: measured **8.3e-14** on `[−8, 0]` and **2.3e-13**
to −37σ. The scan is refined to 0.002, the asserted tolerance moves from 1e-10 (2000× the figure
it was supposed to defend) to 3e-13, and a 19-point mpmath table pins the absolute figure at
≤ 3e-16 — the composite reference cannot go below its own 5 ulp above `x ≈ 6`, which is why the
old absolute assertion had to be relaxed to 2e-15 and the tight claim moved to the new table.

**MAJOR-4 — `aboveThresholdLengthFraction` is a fraction again.** It summed each cell's own
length, and a dimension evaluated over several part scopes carries one OVERLAPPING cell list per
scope, so telemann's tempo row reported 3.0000 and §7.3's mandated sentence would have printed
"300 % of the window". `aboveThresholdLength` measures the set `{t : p_k(t) > τ_k}` over the
union of the cell edges, summing the covering cells' densities exactly as `massIn` does. Telemann
tempo 3.0000 → **1.0**, albert dynamics 3.0000 → 1.0, vulpius 1.3333 → 0.9074; nothing outside
`[0, 1]` on any vendored pair. Not a clamp: a dimension above threshold on half the window still
reports 0.5 with three scopes, and three scopes at 0.4 JND/quarter — below threshold alone, above
it together — report 1.0.

**MAJOR-5 / AD-55.4 — DESIGN §7.1's tempo row.** `ln(1.05)` `[convention]` → `ln(1.025)`
`[literature]`, which is AD-27.6 and the shipped constant. The code was already pinned
(`registry.test.ts` asserts both the value and the `[literature]` tag); only the table was stale,
by a factor of two.

**MAJOR-6 — the notes comparator is total.** §9.5 names `site` and the comparator did not use it:
four Albert notes — one `@transition.to` plausibility finding raised in the global scope and in
each of three part scopes — tied on all five keys with four distinct serializations, and their
order was decided by sort stability. `compareNotes` is exported, takes the note's own
SERIALIZATION as the final tiebreak (so the order is total by construction rather than by an
argument that the earlier keys separate everything), and `properties.test.ts`'s mirror now sorts
with the ENGINE's comparator instead of a drifted copy — the copy is what let this hide, because
a partial order tidies its own ambiguity away under a re-sort. The totality is asserted directly.

**Negative controls**, each by patch → `vitest run` → restore:

| repair reverted | fails |
| --- | --- |
| the symmetric tie-break | 2: the two cross-document P-C2 pairs, and nothing else |
| §4's cap, with the ELEVEN-dimension suite | 3 — including **ornamentation**'s triangle test, which the six-dimension list could not have reached |
| the complementary Halley residual | 2, both MAJOR-3's |
| the falsified epsilon value | 1, MAJOR-2's |
| the per-cell length sum | 2, both MAJOR-4's |
| the serialization tiebreak | 2, both MAJOR-6's |

Gate: `npm run verify` GREEN — 117 files, **5235 passed**, 0 skipped (5019 + 216, most of them
the metric suite's 11 × 26 identity cases). Repo-wide `npx prettier --check .` clean; eslint clean
on `src/comparison/` and `tests/comparison/`. The seven vendored anchors are unchanged.

## 2026-08-16 — W3 fix cut 5: MAJOR-8..15 and the MINORs (w3-fix)

The last cut. Nine MAJORs and fourteen MINORs, none of which moves a vendored headline number —
the seven anchors are bit-identical to cut 2's. Most are DESIGN currency and pins for rules that
had none; four are behaviour.

**MAJOR-13 + MAJOR-15, one mechanism.** DESIGN states the same fact twice — §5.0's
"a global-vs-part-local encoding difference with identical resolved curves is distance 0 plus a
structural note" and §10's P-C8 "an explicit neutral instruction ≡ absent map: distance exactly
0 — plus the structural note" — and neither had any code. `encodingNotes` emits one note per
dimension when the two documents' map SIGNATURES differ (absent / global / part-local, per
evaluated scope) and the distance is exactly 0. Measured:

```
global vs part-local tempoMap              D=0  note fires (tempo)
explicit neutral rubato vs absent map      D=0  note fires (rubato)
explicit 0 ms asynchrony vs absent map     D=0  note fires (asynchrony)
identical documents                        D=0  silent
a real tempo difference                    D=65.68  silent
```

The two controls matter as much as the two cases: a note that fired on every pair would be worse
than none. What the note buys is that a zero becomes legible — "encoded the same" and "encoded
differently, performed the same" are the distinction a diff product exists to report.

**MAJOR-12 — `inert-difference` reaches more than one site.** §9.1's kind was emitted from
exactly one, while §10 names it as a fixture obligation for three: AD-8's trailing
`@transition.to` on tempo AND dynamics, AD-35's trailing `<movement>`, and (added here for the
same reason) AD-11i's shadowed duration lever. All were arriving as `structural`, which is the
channel for a difference that IS performed but is not a magnitude — the opposite claim.

**MAJOR-11 — `meanSigned` averages where `distance` sums**, now stated at both the site and the
report field. The two are right for opposite reasons: mass is additive across parts, a LEVEL is
not, and summing three parts' "A is 4 BPM faster" would report 12 BPM — a figure no part carries.
Same argument §1.2 makes for taking moments over the disjoint union, and the same shape as
`bottomLengthQuarters` taking a maximum.

**MAJOR-8 — `PROFILE_MAX_POINTS`** declared in §9.3 with its convention tag and its reasoning,
and §9.1's `grid-truncated` gloss widened to the two mechanisms that legitimately share it
(AD-10's rubato frame cap, C1's profile cap) instead of naming only one. The profile note now
states BOTH steps and the factor between them: an explicit 0.001 over a 198-quarter window is
coarsened 48×, and "the step was coarsened" left the caller to work that out.

**MAJOR-10 — three binding §5.6 amendments landed in DESIGN**, implemented and tested for two
waves while the section still described the atom rather than the composed effect: AD-44.1/45.1
(stacked gradients compose, DIRECTION included — ascending (−20,20) + descending (−10,30)
performs flat (10,10)), AD-44.2/45.2 (equal-intensity spreads compose, (−22,44)+(−100,200) =
(−122,244) exactly; unequal ones stay individual events with the documented limitation), and
AD-40.3/44.4 (a single-note pool performs `transition.to`, in its L=1-airtight form).

**MAJOR-9 — §9.5's key order is pinned by a test that can see it.** The two tests touching key
sets `.sort()`ed them first, which checks membership and says nothing about order, and P-C2
compares the engine against itself. The top-level order is written out as data and the
per-dimension records are checked against `COMPARISON_DIMENSIONS` UNSORTED — with an assertion
that the pinned order is NOT the sorted one, so the old technique could not have passed by luck.

**MAJOR-14 — P-C6 at the pairwise path**, over all eight P-C2 fixtures with profiles on.

**MAJOR-7** landed with CAPITAL-5 in cut 3; **MAJOR-16** was cut 1.

**MINORs.** MINOR-1 the remainder clamp, with `remainder.quadratureUnderflow` carrying what was
clamped (measured: 1.826 / 1.452 / 0.001170 / 0.030741 on the four vendored pairs the verifier
named, reproducing their figures) — a mass is non-negative and this one was not, invisibly to
P-C11 because a negative mass is finite. MINOR-2 folded into cut 4. MINOR-3 the P-C5 non-vacuity
claim, restated so it is arithmetically possible AND strengthened: it now asserts one unsaturated
factor on EACH side of the identity, which is what distinguishes AD-6's `|1 − s|` law from
`|ln s|`, where the old total-count assertion could pass one-sided. MINOR-4 the two missing
imprecision domains, as two new P-C5 fixtures. MINOR-5 the unseeded `withClips` arm, seeded.
MINOR-6 the one lint error in `src/`: `undefined` belongs in the implementation signature, which
is what makes the guard legal rather than an unnecessary condition. MINOR-7 the eslint zone's
`why` and `forbidden` made to agree (`**/music/**`, `**/units.js`), negative-controlled — an
import of `../units.js` from `src/comparison/values.ts` is now rejected — and the three implicit
single-key sorts documented where they are (deterministic, single-document, so no orientation can
leak through them). MINOR-8 the stale `@throws` line deleted.

Eleven design MINORs: `λ_date = 16` and `DEFAULT_PPQ = 720` stated in §7.1 with their reasoning;
the three missing JND constants added to §7.1's table, which now carries all eight;
`ppq.unusableDeclaration` (AD-27.2's delegated edit) and `comparability.suspectPair` declared in
§9.3; `inputs.settings` corrected to `ResolvedComparisonSettings` with the reason it is stronger
than `Required<ComparisonSettings>`; §9.5's superseded "then `@name`" parts tiebreak replaced by
AD-27.3's actual rule; four §9.4 rows added (`plausibleRange` values, `profile.dimensions`,
`profile.grid.step`, a missing `a`), each verified against the code before being written down.
`EPSILON_FAMILY_OF` makes two readers' "this dimension's entry in the per-family epsilon record"
an executable lookup instead of prose.

[BEYOND THE FINDING, reported] The shared `requireXmlText` guard said "got nothing" for `42` and
for `{}` as well as for an absent argument. It names what arrived now, which changes a message in
the expression facade's suite too — an untyped caller who passed the wrong variable is this
message's actual reader.

**Negative controls**, each by patch → `vitest run` → restore:

| repair reverted | fails |
| --- | --- |
| `encodingNotes` removed | 2, both P-C8/§5.0 tests |
| the three inert kinds back to `structural` | 1, MAJOR-12's |
| the remainder clamp | 1, MINOR-1's |
| `dimensions` built over a SORTED dimension list | 2: MAJOR-9's key-order pin and one facade test |
| `units.js` imported from `src/comparison/values.ts` | eslint rejects it (MINOR-7's zone, which permitted it before) |

Gate: `npm run verify` GREEN — 117 files, **5250 passed**, 0 skipped. Repo-wide
`npx prettier --check .` clean; eslint clean on `src/comparison/`, `tests/comparison/`,
`src/api/` and `src/index.ts`. The seven vendored anchors are unchanged.

## 2026-08-16 — AD-56: W3 fix wave COMPLETE; batched ratifications [BINDING]

Budget: RED / 29.1% used at 12.2% elapsed / THROTTLE (2026-08-16, credits
calibrated). Regime: single-agent serial work continues; re-gate is one
resumed agent; W4 deferred until W3 closes and paced against the window.

w3-fix's six commits (f778638..eb29665) accepted in full: every CAPITAL,
MAJOR and MINOR of W3-VERIFICATION.md addressed; verify 5250 + 0 skipped;
15 negative-control patches, each failing exactly its own tests. Batched
ratifications, all previously acknowledged in-channel:

AD-56.1 MAJOR-16 re-cut to FIRST ratified (the gate real from commit 1);
AD-55.2's "§7.5 sentence" RE-SITED to §5.0 with cross-reference — the
conductor's citation named the wrong section; the delegation's correct
reading was the worker's.
AD-56.2 AD-55.3's figure AMENDED: "≤ 3e-17" was the verifier's
uniform-only table; the reproducible support-scale figure over the
14-pair family incl. point masses is 3.0e-16, published as
{relative: 3e-16, jnd: 1.2e-16} with the falsified naive figure held by
an assertion. Substance of the ruling unchanged.
AD-56.3 The @controller dead channel (found by AD-55.1(b)'s
exclusion-verification obligation ON ITS FIRST RUN, fixed in-commit) is
recorded as the obligation's validation — same shape as CAPITAL-1, one
dimension over, caught by the rule it motivated.
AD-56.4 Anchors old → new recorded (all moves are CAPITAL-1's step
component; CAPITAL-2 moved nothing vendored because the corpus's MSM and
MPM part counts coincide): telemann B|F 22357.0626→24941.0626,
B|R 6493.6010→8397.6010 (mean 41.164710882), F|R 21686.7196→26174.7196,
albert 8929.5188→9854.3188, vulpius ×3 unchanged. The bit-identical
anchors across cuts 3-5 are the right headline: pins that could not see,
records that were wrong, numbers already true.
AD-56.5 MAJOR-13+15 unified as encodingNotes (both design statements, one
mechanism); MAJOR-12's three inert-difference sites; MAJOR-11's
sum-vs-average duality stated at site and field; MINOR-3 strengthened
beyond its ask (one unsaturated factor per side — the |1−s|-vs-|ln s|
discriminator). All ratified as landed.
AD-56.6 C7's length-proxy weakness stays DEFERRED to W5's report-quality
pass (AD-55-era deferral reaffirmed; the albert lastDate=0 case is
flagged by a question-worded note naming its numbers).
AD-56.7 The re-gate convenes: w3-verify RESUMED (its probes are its
context), scoped to the six commits against its own findings, RE-GATE
PASS/BLOCK verdict appended to W3-VERIFICATION.md.

## 2026-08-16 — AD-57: RE-GATE PASS; W3 CLOSED; W4 opened [BINDING]

Re-verification appended to W3-VERIFICATION.md: all 6 CAPITAL + 18 MAJOR +
MINORs confirmed repaired under the ORIGINAL probes with independently
re-derived references (mpmath 60 dps per-double; symbolic closed forms;
renderer-transcribed quantiles); the verifier recorded its own two failed
negative-control patches before the third falsified MAJOR-17's pin — the
standard applied to itself. The mathematics section stands: W₁ ≤ 2.84e-16
against 23 derived closed forms, table closure 1.6e-16 on real corpora
with atoms and parts, 52k report nodes clean, byte-identical across
processes.

AD-57.1 RV-MINOR-1 (cut-2 LOG narrative: 962.633/870.4/64 should read
1017.033/924.8/68 — self-inconsistent with its own commit's anchor table;
code, tests, anchors all correct) goes to W5 housekeeping. The LOG being
append-only, the correction lands as a dated erratum entry there, not an
edit.
AD-57.2 RV-OBS-1 adopted as recommended: DO NOT PRUNE the 26-member
family (332 metric tests in 1.44s; each member documents a distinct
hazard); the drop-each-member coverage check is W4's obligation when its
products extend the family.
AD-57.3 W3 IS CLOSED. The wave's arc: 4996 → 5250 tests, six capitals
(five wiring, one mathematical) found by independent audit and repaired
with per-defect negative controls, every corpus anchor either bit-stable
or moved by a ruled correction with old→new recorded.
AD-57.4 W4 OPENS under the budget regime (RED/THROTTLE, meico-ts high):
ONE Opus worker, serial cuts, the W3 cadence — not a fan-out. Scope per
the board's task #3: diffMpm (AD-5 sequential pricing, AD-25.4 canonical
orientation, replay verification, deterministic traceback, moves after
plain ops per A-Q5); compareMpmCorpus (label-keyed determinism AD-25.2,
UPGMA default + linkages with the Ward caveat, PAM, silhouette, classical
MDS with spectrum honesty per §8, seriation, profiles, corpus-average
pseudo-item + noise-floor context AD-26.3, ω = 1/median normalization
AD-25.5); scape opt-in (AD-27.8, ≤256 bins, prefix sums); the W4 docs
obligations (AD-26.4: P1 answer, G2 framing, Hudson recipe, provenance
presets; C8/C12/C14/C15). Family extension per AD-57.2's check.

## 2026-08-16 — W4 cut A1: the sequential-pricing DP (w4-products)

`src/comparison/editScript.ts` + 18 tests. §6's edit path as an algorithm over a DECLARED
interface, touching no dimension: it gates on its own and it cannot leave a cross-module change
half-written, which is AD-51's scoping lesson applied to the wave's largest product.

**THE DP CELL IS THE STATE, which is what makes AD-5's sequential pricing affordable.** §6.2
says "the state the DP needs is determined by the DP cell" and leaves the construction open. It
is `S(i, j) = b[0..j) ++ a[i..n)` — the prefix already converted, the suffix still A's — so
`S(0,0) = A`, `S(n,m) = B`, each of the three moves steps between two such states, and every
transition price is a function of `(cell, move)` alone. Φ is memoized per cell, so a fill costs
`(n+1)(m+1)` representations and `~3nm` norms rather than six representations per cell.

Sized against the corpus before it was written, because a full-state rebuild is only defensible
if the states are small: per (scope, map) the vendored documents carry **3–25 instructions** on
the curve maps and 50 at the outside (bach `tempoMap`); the one 205-entry map is `articulationMap`,
which §6.2 prices through the §5.6 alignment functional and not through this DP at all.

**AD-5's COUNTEREXAMPLE IS PINNED — AND IT HAS A STRUCTURAL TIE §6.2's NARRATIVE DOES NOT
MENTION.** On `A = {I@0 bpm=60, J@5 bpm=60}` against `B = {I@0 bpm=120}` the sequential total is
`10·ln2 = d_curve` with `reworking = 0`, and the against-A reading is refuted in the same test at
`5·ln2`, i.e. `d_curve/2` with reworking NEGATIVE. But §6.2 narrates "substitute I, delete J",
and the DP delivers "delete I, substitute J". Both cost exactly `10·ln2`, and not approximately:

    substitute I, then delete J : 5·ln2         + 5·ln2                 = 10·ln2
    delete I,     then subst. J : 5·ln(100/60)  + 5·ln(120/100) + 5·ln2 = 10·ln2

the second telescoping through the renderer's own no-tempo default (AD-9ii), which is why they
land on the same number rather than merely near it. §6.4's precedence keeps the substitute
branch at the last cell, and that branch is reached from the delete-first predecessor. This is
survey-algo §2.H's "the ties are structural rather than accidental" arriving at the first
example anyone will read. Both totals are pinned; which assignment the precedence picks is
pinned separately so a change to it is visible.

**THE TRIPLE IS THREE NUMBERS BECAUSE THE TWO ORDERS ARE TWO ORDERS.** The DP walks its path in
ALIGNMENT order; §6.1 delivers in DATE order. Measured over 4000 random pairs, the two differ in
**1146 of them (29 %)** — a delete at bar 40 really does precede an insert at bar 3 along a
minimal path. So `scriptCost` is the DP's own path total and `replayedDelta` is what the same op
set costs applied in the delivered order (§6.3), each op's reported `cost` is its REPLAY cost,
and `Σ ops.cost = replayedDelta` exactly. Both telescope from A to B, so both are `≥ d_curve`;
neither dominates the other. The date-order test runs over the family for that reason: pinned to
one hand-built pair it passed with the delivery sort DELETED, which a negative control found.

**§6.3's VERIFICATION IS AN EXACT ZERO, not a tolerance.** The replay's final state is `b`'s own
records in `b`'s own order, so `norm(Φ(final), Φ(B))` is `0` bit for bit and `replayResidual` is
shipped as a field rather than asserted internally — a future move kind that failed to reach B
is then visible instead of absorbed.

[DECISION, needs ratification] **A co-dated added instruction goes AFTER a surviving one**, and
the rule is renderer-derived rather than chosen: `datedView.orderedEntries` reproduces
`GenericMap.parseData`'s backwards insertion scan, which finds the last position whose date is
`<=` the new one, so an element added to a map lands after the children already at its date —
and since a co-dated predecessor governs a zero-width span, the added one performs. It matters
only where both sides coexist at one date, which the DP fill reaches and the replay does not
(the delivered order is date-then-move-rank and `delete` outranks `insert`, so at a shared date
A's instruction is gone before B's arrives). `editStateAt` is EXPORTED to pin it, because through
the DP the rule is observable only statistically: reversing the preference moves scripts on a
random family and moves nothing on any single hand-built pair. Same move as RG-2's and the K=4
pin — when a property stops being observable at one layer, the evidence goes down a layer.

The load-bearing test is `eventAlignment.test.ts`'s and `aggregate.test.ts`'s: brute-force
enumeration of every monotone alignment, each priced by a restatement of §6.2's definition that
shares no line with the DP, against the DP's optimum. The toy Φ is a step function in a log
space — `tempoDistance` with every transition removed — so the file exercises the DP's own
arithmetic without importing a dimension's.

NEGATIVE CONTROLS, four, each failing exactly its own tests and restoring green: the replay
priced against A rather than the evolving state (2 — AD-5's total and the closure); the
precedence flipped to `delete > substitute` (5); the co-dated side preference reversed (2 — the
brute-force family and the direct pin); the delivery re-sort deleted (1, after the date-order
test was moved onto the family; before that move it failed NOTHING, which is how the gap was
found).

Gate: `npm run verify` GREEN before committing — 118 files, **5268 passed**, 0 skipped (was
5250). Repo-wide `npx prettier --check .` clean; eslint clean on both files.

NEXT in cut A: the curve dimensions' `represent`/`norm` adapters. The shape is settled and one
refactor is implied — each curve reader splits into "resolve one instruction in ITS OWN document's
environment" and "assemble the resolved list into a curve", because an edit state mixes the two
documents' instructions and each must keep its own style resolution. That is AD-40.2's principle
("price the resolved performed effect, never the attribute tuple") and it is also what makes the
replay reach B exactly: an instruction moved into the other document performs what it performs,
not what that document's styleDefs would make of its name.

## 2026-08-16 — AD-58: W4 cut A1 rulings [BINDING]

bf29114 accepted (editScript.ts, dimension-neutral over EditPricing; the
DP cell IS the state S(i,j) = b[0..j) ++ a[i..n)). Dispositions:
AD-58.1 The §6.2-counterexample structural tie is RECORDED: the DP's
equal-cost "delete I, substitute J" (telescoping through AD-9ii's
no-tempo default) and the prose's "substitute I, delete J" both total
exactly 10·ln2 with reworking 0; both totals pinned, the choice pinned
separately. Nobody "fixes" the DP to match the narrative — the prose is
one optimal script of several, which is §2.H's tie warning made concrete
at the first example anyone reads.
AD-58.2 The triple's exact semantics ratified: scriptCost = DP path
total; replayedDelta = the op set replayed in delivered date order (path
order ≠ date order in 29% of random pairs — measured); per-op cost =
replay cost with Σ costs = replayedDelta exactly; replay residual is an
exact-0 FIELD, not an assert.
AD-58.3 RATIFIED (the flagged decision): a co-dated ADDED instruction
sorts AFTER a surviving one — renderer-derived (parseData's backwards
insertion scan via datedView), pinned at the exported editStateAt where
the rule is deterministically observable (through the DP only
statistically). RG-2's evidence-placement move, again.
AD-58.4 Cut-A2's implied refactor ENDORSED: curve readers split into
resolve-in-own-environment + assemble, because an edit state mixes both
documents' instructions and each must carry ITS OWN style resolution —
AD-40.2's principle, and the mechanism that makes replay reach B exactly.

## 2026-08-16 — W4 cut A2: the six curve dimensions price edit states (w4-products)

`src/comparison/editState.ts`, per-entry resolution in `document.ts` and the seven readers,
`CurvePlan` restructured around `readView`, `editScriptForDimension` — plus 11 tests. §6's edit
path now runs end to end on real documents for tempo, dynamics, rubato, asynchrony, accentuation
and pedal. The event and distribution dimensions return NULL rather than an empty script, which
is a later cut and is asserted so that "not computed" cannot read as "no differences".

**AN EDIT STATE IS AN `OrderedMapView`, so no reader gains a case for the edit path.** The
readers turned out to need almost nothing from a view — `entries` and `styleNames`, never
`element`, `mapName` or `spanEndRule` — so an intermediate state presents itself as the view
they already take, and §6.2's `Φ` is §5's own reader rather than a second reading of a map. The
one thing a MIXED view needs and a single-document one does not is per-entry resolution, which
is `entryResolutions` on the view: the tick `scaleFactor` (the two documents may declare
different `@pulsesPerQuarter`, and tick-VALUED attributes like `@frameLength` scale with it, not
only dates) and the pair of environments a symbolic level resolves against. Absent on every view
`readScopeMapViews` builds, so the whole comparison path is byte-identical — 1147 comparison
tests unchanged across the plumbing commit.

**RESOLUTION TRAVELS WITH THE INSTRUCTION, and that is what makes §6.3's replay exact.** AD-40.2
in a new place: an instruction carries what it PERFORMS in its own document, so the state after
the last op is `b`'s instructions with `b`'s resolutions — `B` itself — rather than "B's
instructions read through A's styleDefs", which would leave `replayedDelta` describing a document
neither side wrote. `replayResidual` is an exact **0** on every vendored pair and every curve
dimension. Pinned on a document whose two performances have BYTE-IDENTICAL `<tempo>` elements and
different `tempoDef`s: the difference lives entirely in the header, is priced at
`4·ln2 / ln(1.025)`, and a reading that resolved B's instruction through A's header would price
it at 0.

[DECISION, needs ratification] **Deleting a `<style>` switch does not re-resolve the instructions
after it.** A mixed map has no well-defined style scope — A's style names need not exist in B's
header — and §6.1 scopes a script to one (part, map) while `styleDef`s live in the header,
outside it. So a script cannot express a styleDef edit, and the reading that makes its endpoints
exactly `A` and `B` is the one where each instruction keeps its own resolution. Where two
documents differ ONLY in a styleDef the difference is still priced; it is attributed to the
instruction rather than to the header, and the report should say so.

[DECISION, needs ratification] **Every dated entry is an instruction, `<style>` included** —
§6.1's own words ("date-ordered by the `datedView` rules"), and not a formality: under the
any-entry span rule (AD-29, AD-14ii) a `<style>` ENDS a span, so a sequence that dropped it would
not perform what its document performs. A negative control dropping styles passed the entire
vendored corpus, because **no vendored `asynchronyMap` carries a style**; the fixture that makes
it observable was written before the control was re-run, which is the right order.

[DECISION, needs ratification] **Edit pricing is RAW, never canonicalized.** §7.4's invariance
modes rescale by a DOCUMENT's own moments, and an intermediate state is not a document — its
moments move as the script is applied, so a canonicalized `norm` would not be a fixed metric and
`scriptCost ≥ d_curve` would stop being AD-5's theorem. The `dCurve` reported beside a script is
therefore the identity one. What the facade should do when a caller passes `invariance` to
`diffMpm` is asked in cut A4, not decided here.

**THE LOCALIZED NORM: 6.4× FASTER AND BIT-IDENTICAL.** Two states of one transition differ by a
single instruction, so their curves agree outside a bounded interval and integrating over the
window computes zeros — measured, Vulpius Baroque|Romantic cost **2044 ms** for one scope, of
which dynamics alone was 1897 ms (K=16 Bézier subdivision × a 50-bisection inversion per node).
`affectedTicks` bounds the interval structurally: on the left the last unchanged instruction
BEFORE the change (not the change itself — its predecessor's span end moves and under AD-8 its
trailing-ness can flip), on the right the first unchanged instruction after it. Vulpius drops to
**320 ms**, Telemann 345 → 180 ms, and every reported number is unchanged bit for bit.

The argument is not the evidence (AD-30/AD-31's lesson, applied before the fact): the
unlocalized mode SHIPS behind `EditScriptOptions.localize` and the suite pins the two forms
bit-equal over the vendored corpus and over all 26×25 adversarial-family pairs. `pedal` is
excluded from localization by construction — `getPreviousPosition` scans BACKWARDS over entry
indices for an inherited `@transition.to` (PARITY P2, AD-35.4's hazard class), so a movement can
depend on an instruction before it and the left bound does not hold there.

**FIRST EDIT-PATH NUMBERS.** Vulpius Baroque|Romantic, global scope:

    tempo      d = 631.161302  scriptCost = 631.161302  replayedDelta = 663.367553  (4s/1d/3i)
    dynamics   d = 158.677254  scriptCost = 159.671848  replayedDelta = 169.375996  (14s/7d/6i)

Both facts the triple exists to carry, on one pair: dynamics shows genuine **re-working** (no
monotone script reaches B for `d_dynamics`, so `scriptCost` sits 0.99 JND·quarters above the
lower bound), and tempo shows the two ORDERS disagreeing (the same op set costs 663.37 applied
in the order a reader walks the score against 631.16 along the DP's path). Albert's deadpan
performance is 14 deletions and one substitution in tempo, 10 deletions in dynamics — the shape
you would predict from a performance that removes expression rather than changing it.

NEGATIVE CONTROLS, four, each failing exactly its own tests and restoring green: per-entry
resolution ignored (3); the localization's left bound moved to the change itself, dropping the
predecessor's span (5, including the transition-then-delete fixture built for it); the right
bound moved to the change (6); `<style>` entries dropped from the sequences (1, the fixture
above). Two of these failed NOTHING on the first attempt and the tests that make them bite were
written in response — the corpus does not happen to contain either hazard.

Gate: `npm run verify` GREEN before committing — 119 files, **5279 passed**, 0 skipped (was
5268). Repo-wide `npx prettier --check .` clean; eslint clean on `src/comparison`,
`tests/comparison`, `src/api` and `src/index.ts`.

## 2026-08-16 — AD-59: W4 cut A2 rulings [BINDING]

4de9420 accepted (edit path end-to-end on six curve dimensions; Φ is §5's
own reader via OrderedMapView — no second reading of any map; the
localization optimization ships with the unlocalized mode behind a flag
and a bit-equality pin over the corpus + all 650 family pairs; two
controls that failed-to-fail were given their fixtures BEFORE the tally —
the discipline stated as practiced). Rulings:

AD-59.1 RATIFIED (a): deleting a <style> switch does not re-resolve
subsequent instructions — resolution travels with the instruction, which
is the reading under which the endpoints are exactly A and B and the only
one a (part, map)-scoped script can express (styleDefs live outside the
scope). StyleDef-only differences remain priced, attributed to the
instructions that perform them; pinned at 4·ln2/ln(1.025) on the
byte-identical-elements fixture.
AD-59.2 RATIFIED (b): every dated entry is an instruction, <style>
included — §6.1 verbatim, load-bearing under the any-entry span rule.
AD-59.3 RATIFIED (c): edit pricing is RAW, never canonicalized — an
intermediate state is not a document, a document-moment rescaling is not
a fixed metric over states, and AD-5's theorem dies with it. AND THE A4
QUESTION IS RULED NOW: diffMpm REJECTS `invariance` (and any
canonicalization-implying option) with InvalidOptionError naming the
reason — the script is a raw-document product; invariant views belong to
compareMpm. AD-25.1's knowability split applies: unusable given the
options alone ⇒ error, never silent ignoring.
AD-59.4 Cut A3's hypothesis (event op cost = its EventCharge; Σ = the
alignment optimum with reworking 0) is endorsed AS A HYPOTHESIS to be
measured, per its own framing.

## 2026-08-17 — W4 cut A3: the remaining five dimensions, and two defects the theorem found

`editScriptForDimension` now returns a script for **all eleven dimensions**. The curve plan's
`readView` generalizes into an `EditPlan` — `represent` reads one state, `norm` is that
dimension's own `d_k` over a window — and the event and distribution dimensions fill it in
directly. No dimension needs a second reading of a map, which was the whole bet of cut A2's
shape and it held.

**§5.5's TWO COMPONENTS FALL OUT OF ONE SCRIPT.** `d_articulation` is the alignment optimum PLUS
AD-55.1's `@defaultArticulation` step function, and both are read off the same map — the atoms
from its `<articulation>` elements, the steps from its `<style>` switches. So one sequential
script over the map's entries prices both and `directDistance` is the whole `d_articulation`,
which is also the second reason (after AD-29's any-entry rule) that `<style>` switches have to
be in the edit sequence. Measured on Telemann part 1: `directDistance = scriptCost =
replayedDelta = 926.666667` over 25 ops. **Re-working is 0 for the event dimensions**, and that
is §6.2's "consistent by construction" arriving as a measurement rather than a claim: the §5.6
functional is a sum over events, so applying one op changes exactly one event's contribution.

**DEFECT 1 — the event readers never took the per-entry resolution, and `directDistance` said
so.** Cut A2 threaded `resolutionAt` through the seven curve/span readers and left
`articulationAtoms`, `articulationDefault` and `ornamentAtoms` for this cut. The consequence was
not subtle and the endpoint check caught it immediately: Telemann part 1 reported
`d_articulation = 926.67` against a `directDistance` of **770.67**, because `Φ(S(n,m))` was
reading B's instructions through A's `articulationStyles`. Threaded; the claim is now an exact
equality on every vendored (pair, scope, dimension) triple.

**DEFECT 2 — articulation cannot localize, and the theorem is how it announced itself.** With
`affectedTicks` applied, Telemann part 1 gave `scriptCost = 108.89` against a `directDistance`
of `926.67` — `scriptCost ≥ d` violated by a factor of eight. Diagnosed by removing the step
component from the norm and re-running: `scriptCost = directDistance` exactly on all three parts
(46.67 / 23.33 / 5.00), which identifies the STEP function rather than the alignment as the
cause. AD-37.1's default step is **retroactive** — its value on `[0, firstSwitchDate)` is the
FIRST switch's default — so editing a `<style>` reaches arbitrarily far LEFT; and its value after
an interval is governed by the last switch at or before it, which the interval's right bound (the
next unchanged INSTRUCTION, not the next unchanged SWITCH) need not contain. AD-35.4's hazard
class in a **seventh** instance, and a new shape: a reading that depends on an instruction
outside its own span in BOTH directions. `articulation` and `ornamentation` therefore do not
localize; the alignment half would, and that measurement is recorded so a future attempt has
something to face.

[STOP-AND-REPORT — a DESIGN-vs-implementation contradiction, with executed evidence]
**§9.3's per-family epsilon record files `rubato` in the `step` family, whose published figure is
an exact `0`.** The record's own words for that family are "piecewise-constant readings: the cell
integral is `density × length`, with no quadrature in the time domain at all". That is false for
rubato: `rubatoDistance` integrates a warp DISPLACEMENT through AD-33.3b's rule 2c — the
structural `u*` split plus a K = 16 mesh — and AD-34.1 measured that integrator's residual at
2.718e-4 relative. Measured here on real data, as the shortfall of `scriptCost` below `d`:

    telemann part 2 / rubato   d = 476.22531733   scriptCost = 476.18955454   7.51e-5
    telemann part 1 / rubato   d = 350.26776146   scriptCost = 350.26003225   2.21e-5
    telemann part 3 / rubato   d = 162.82001908   scriptCost = 162.81746979   1.57e-5
    vulpius  part 1 / dynamics d = 174.44139374   scriptCost = 174.44124366   8.60e-7

Every other dimension's worst is below 1e-6 and most are exactly 0. The localization is NOT the
cause and that was checked before anything else: localized and whole-window `scriptCost` are
BIT-IDENTICAL on every one of these, so the shortfall is quadrature in a telescoping sum of many
small integrals against one large one. In JND terms the worst is 0.036 JND·quarters over ~50
quarters, i.e. 7e-4 JND — far below the metric's own resolution, which is AD-28.2's point exactly.
**The number is fine; the published record is not.** Asking for a ruling because AD-25.6 approved
FIVE epsilon families and rubato needs either a sixth or a corrected figure; the code is
unchanged pending it, and the measurement is pinned so the record cannot drift further.

The theorem is asserted in a RELATIVE band of 1e-4 for that reason — W2c's P-C3 lesson ("an
absolute epsilon fails a correct implementation") — with the worst measured shortfall asserted
separately, so the band cannot quietly absorb a regression.

**ORNAMENTATION'S MAP SCOPE, decided so both endpoints stay exact.** `OrnamentationMap.apply`
branches on whether a local header exists (AD-44's defect 8), so the scope is a property of the
MAP and a mixed state has no single one. A state carrying any A instruction takes A's scope and a
state carrying none takes B's, which makes `S(0,0)` exactly `A` and `S(n,m)` exactly `B`;
`replayResidual` is the field that would show a document where the mixed states' choice mattered.
No vendored document has an `ornamentationMap`, so this is stated rather than measured.

NEGATIVE CONTROLS, three, each failing exactly its own tests and restoring green: the event
readers ignoring the per-entry resolution (2); articulation localization enabled (2); the
default-step component dropped from articulation's norm (2).

Gate: `npm run verify` GREEN — 119 files, **5278 passed**, 0 skipped. Repo-wide
`npx prettier --check .` clean; eslint clean on `src/comparison`, `tests/comparison`, `src/api`
and `src/index.ts`. [MEASURED, reported] The suite's own cost: `editDimensions.test.ts` walks a
real corpus with a DP per (pair, scope, dimension) and is 12.4 s of the 21 s total. It was 37.8 s
before the walk was merged into one pass and the localization pins were restricted to the
dimensions that localize — a pin over a code path both modes share asserts nothing.

## 2026-08-17 — AD-60: cut A3 rulings — sixth epsilon family [BINDING]

f3db06c accepted (all eleven dimensions carry a §6 script; event
reworking measured at exactly 0 — the §5.6 functional's per-event
additivity arriving as measurement; §5.5's two components falling out of
ONE script is the second justification for <style> in the edit sequence).

AD-60.1 (the requested ruling) The epsilon record GAINS A SIXTH FAMILY:
`rubato`, with AD-34.1's measured figure (2.718e-4 relative; the JND
figure alongside) — the `step` family's "no quadrature in the time
domain" claim is true of asynchrony/accentuation/imprecision spans and
FALSE of rubato, whose displacement integrates through rule 2c. The
record's exact-0 stays for the genuinely exact members. DESIGN §9.3
amendment delegated to the A4 facade commit. The band + separate
worst-shortfall assertion pattern is approved (a band that cannot absorb
a regression).
AD-60.2 Both in-cut fixes accepted: the per-entry resolution threading
(endpoint claim now exact equality on every vendored triple), and the
articulation localization IMPOSSIBILITY — hazard instance #7 (the
retroactive default reaches arbitrarily far left, and the interval's
right bound is the next unchanged INSTRUCTION, not switch). Localization
stays OFF for articulation with the 8× violation measurement recorded as
what any future attempt must face.
AD-60.3 RATIFIED: ornamentation's whole-map scope rule for mixed states
(any A instruction ⇒ A's scope; none ⇒ B's — endpoint exactness governs,
AD-59.1's reading extended). Obligation: pin it on a SYNTHETIC pair in
the A4 window — a stated rule with no observable is half a rule.
AD-60.4 The A4 invariance question was ruled before it was asked:
AD-59.3 — InvalidOptionError, knowability split, never silent. Crossed
messages; the LOG is the channel.

## 2026-08-17 — W4 cut A4: `diffMpm` is live (w4-products)

`src/comparison/diff.ts`, §9.3's `EditOp`/`EditScript`/`DiffReport` in `report.ts`, the facade
and the export surface, + 15 tests. The edit path has a public entry point for the first time.

**§6.4's ORIENTATION, and why it is the load-bearing part.** The traceback precedence
`substitute > delete > insert` is deterministic but not transposition-covariant, so two
independent runs are not mirrors of one another. The script is therefore computed ONCE in a
canonical order and inverted. The order is CONTENT-derived per AD-25.4 — `serializeMpmRoot(root)`
then the performance selector, compared in code-unit order — because `diffMpm(a, b)` and
`diffMpm(b, a)` present the same role names in both directions and a rule keyed on `'a'`/`'b'`
would not distinguish the two calls at all. `serializeMpmRoot` rather than `canonicalMpm`: the
comparison layer may not import `src/api` (MINOR-5's zone) and `canonicalMpm` is one line over it,
so the bytes are the same bytes.

P-C2 is asserted on `JSON.stringify` of the whole report against a swap map written out as CODE
— the discipline `properties.test.ts` established — so a future field that needs mirroring fails
the test rather than quietly breaking the promise. The mirror re-SORTS rather than reverses: the
delivered key is `dateA ?? dateB` and the inversion reads it off the other side, which is why
`invertSteps` recomputes the order instead of flipping the array.

**ATTRIBUTE DELTAS ARE A REGISTRY WALK**, `plausibility.ts`'s shape for `plausibility.ts`'s
reason: the rows already say which attributes each container's elements carry, and a
per-dimension list would be a second inventory to keep in step with the first. `deltaJnd` is
`localDistance`, which that function's own documentation names as "the §6 edit path's" attribute
metric, with an ABSENT attribute read as `⊥` and therefore priced at `δ_row`. Sorted descending,
so `attributes[0]` is what the op is most about and `site.attribute` names something worth
looking at rather than an arbitrary first field.

[DECISION, needs ratification] **`DiffMpmOptions` is `CompareMpmOptions` MINUS `invariance` and
`profile`**, where §9.2 declares a bare `extends`. `invariance` because §6.2's pricing must be
raw (cut A2's ruling request: an intermediate state is not a document, so a canonicalized `norm`
is not a fixed metric and AD-5's theorem fails); `profile` because a `DiffReport` has no profile
to retain. Removed from the SURFACE rather than shipped as a throw, which is AD-52.3a's own rule
— "an option whose only behaviour is to throw is worse than an absent one" — applied to a case
that ruling did not name. A TypeScript caller who writes either fails to compile; a JavaScript
caller is ignored, which is what every other unrecognized top-level key gets (AD-54.3).

`moves: true` earns an `option-unusable` note rather than being silently dropped: A-Q5's
fragment/consolidate ops land after the plain script has been through a wave gate, and a caller
who asked for them should be told they did not arrive.

[FOUND BY A TEST, in code written this cut] **`dCurve` and `compareMpm`'s `d_k` were two numbers.**
`dimensionComparison` sums its scopes with `CompensatedSum` and the first draft here used `+=`;
the vendored rubato rows differed in the last ulps. Repaired by summing the same way, so the two
are BIT-IDENTICAL rather than close — a diff whose lower bound disagreed with the comparison's
distance would be a product describing a different comparison. Negative-controlled by perturbing
the total by one `Number.EPSILON`, which fails exactly that test.

`dCurve` is `null` for the two EVENT-shaped dimensions, per §9.3: their `d_k` is an alignment
optimum rather than a curve integral, and calling it `dCurve` would name it as something it is
not. `replayResidual` ships as a field per dimension and is exactly 0 on every vendored pair.

NEGATIVE CONTROLS, three, each failing exactly its own tests and restoring green: the canonical
orientation removed, so each direction runs its own traceback (2 — P-C2 and the cost identity);
the site's document role left unswapped in the mirror (1); the compensated sum perturbed (1).

Gate: `npm run verify` GREEN — 120 files, **5293 passed**, 0 skipped (was 5278). Repo-wide
`npx prettier --check .` clean; eslint clean on `src/comparison`, `tests/comparison`, `src/api`
and `src/index.ts`.

[MEASURED, and acted on] The two W4 test files cost 12.4 s + 14.2 s of a 25 s suite. `diff.test.ts`
was 25 s until the property tests moved onto a 16-quarter window: P-C2 is a claim about SYMMETRY
and every field it touches is present in the first few bars, so a short window buys four pairs in
both directions where a full one bought one — with a full-window pair kept beside them so the
short one cannot be hiding a field. An earlier full-suite run reported `[vitest-worker]: Timeout
calling "onTaskUpdate"` with all 120 files passing, which is the runner losing its RPC under load
rather than a test failing; the trim is the response to it either way.

## 2026-08-17 — AD-61: cut A4 rulings; W4 order confirmed [BINDING]

baa4579 accepted — diffMpm live; the content-derived orientation with
whole-report swap-map P-C2; the dCurve/d_k bit-unification (a diff whose
bound disagreed with the comparison's own distance would describe a
different comparison — caught by test, negative-controlled at one
EPSILON); the suite-cost trim with the full-window pair kept beside the
short ones.

AD-61.1 RATIFIED and SUPERSEDING AD-59.3's form: DiffMpmOptions is
CompareMpmOptions MINUS invariance and profile — ABSENCE over throw,
AD-52.3a's rule applied to a case it did not name, and the stronger form
of the same ruling. §9.2's bare-extends declaration amends under
delegation in the next commit. `moves: true` earns option-unusable as
shipped.
AD-61.2 The "still open" rubato epsilon family was ruled in AD-60.1
while A4 was in flight (sixth family, AD-34.1's figure; §9.3 amendment
delegated) — crossed messages again; execute the delegation in the B
window.
AD-61.3 W4 ORDER CONFIRMED: B (corpus) → C (scape) → D (docs) → E
(family + drop-each-member check). A5 (fragment/consolidate moves) is
DEFERRED-BY-DEFAULT under the RED budget: it proceeds only if B–E close
with headroom, else it is journaled post-campaign work — A-Q5 called it
presentation sugar under semantic pricing, and the budget regime says
defer discretionary phases. Not silent: this entry is the record.

## 2026-08-17 — W4 cut B1: §8's corpus mathematics (w4-products)

`src/comparison/clustering.ts` and `src/comparison/embedding.ts` + 23 tests. Lance–Williams
agglomeration, PAM, silhouette, cyclic Jacobi, classical MDS and seriation — pure algorithms
over a declared matrix interface, touching no document. AD-51's scoping precedent again: it
gates on its own and it cannot leave a cross-module change half-written.

**EVERY ALGORITHM IS CHECKED AGAINST SOMETHING THAT IS NOT IT**, which is the discipline
`quadrature.ts`'s Newton re-derivation and `eventAlignment.ts`'s brute-force enumeration
established. `single`/`complete` against a brute-force min/max over member pairs on random
matrices; `average` against the mean inter-cluster distance; `ward.D2` against Ward's own closed
form on Euclidean data, `√(2·n_I·n_J/(n_I+n_J))·|c_I − c_J|`, which shares no line with the
recurrence; `pam` against an exhaustive search over every `k`-subset; `silhouette` against the
formula evaluated independently; `jacobiEigen` against `A = V Λ Vᵀ` and `VᵀV = I`; `classicalMds`
against the distances it is supposed to reproduce, on a planar point set; `doubleCentered`
against `−½ J D² J` built from explicit matrix products.

**TWO DEFECTS THE REFERENCES FOUND, both in the first draft:**

1. **§2.F's Lance–Williams coefficients for `single`/`complete` are not bit-exact.**
   `½a + ½b − ½|a−b|` IS the minimum in exact arithmetic and is NOT the same double: measured on
   a 4-item corpus, the nested form gave a final single-linkage height of `6.699999999999999`
   where the matrix entry it is supposed to BE reads `6.7`. A merge height is published data a
   consumer plots and compares against the matrix, so the implementation uses `Math.min`/
   `Math.max` — which is also the definition rather than a shortcut for it. The table's arithmetic
   form is kept for the three linkages where there is no closed form to prefer.

2. **PAM's BUILD + SWAP misses, and by more than a rounding.** Measured over 200 random corpora
   of 4–7 items: **12 misses, worst excess 41 %** against the exhaustive optimum. §8 makes the
   medoid the one corpus product whose entire value is naming a real performer — "the most
   typical Hofmann" — so a 41 % worse answer is a product defect and not a numerical one.

[DECISION, needs ratification] **PAM gains an EXHAUSTIVE pass below a documented limit.**
`PAM_EXHAUSTIVE_LIMIT = 200 000` subsets [convention]: each candidate costs `O(n·k)`, so that is
a few tens of millions of operations at the ceiling and instant on anything a hand-assembled
corpus produces. Every vendored corpus is covered outright, as is a 121-item folder at `k = 2`
(7 260 subsets); the same folder at `k = 3` is `2.9·10⁵` and falls back to BUILD + SWAP.
`Partition.exhaustive` reports WHICH, so a caller reads whether the medoid is the global optimum
rather than assuming it. §8 specifies PAM and does not specify this, which is why it is flagged:
it is strictly better where it applies and it changes no interface.

**AD-25.2 IS PINNED ON A TIE-RICH MATRIX**, which is the only place index-keyed rules and
label-keyed rules differ: every distance equal — what a corpus of `both-neutral` dimensions or a
duplicated document produces. The permuted corpus's dendrogram maps back through the permutation
to the straight one exactly, merge for merge and leaf for leaf. Negative-controlled by keying the
merge tie on the index, which fails it.

Classical MDS is honest about a non-Euclidean input in the three ways §8 requires, and the third
is pinned as a CONTRAST rather than as a value: on a 4-point metric no Euclidean space realizes
(three points mutually 2 apart with a fourth at distance 1 from each, where the circumradius is
`2/√3 ≈ 1.155`), explained variance over `Σ|λ|` is strictly less than the same figure over
`Σλ⁺`, so the choice of denominator is measurable rather than stylistic. Negative-controlled.

NEGATIVE CONTROLS, five, each failing exactly its own tests and restoring green: the arithmetic
LW form for single/complete (1); the exhaustive PAM pass removed (2); explained variance over
`Σλ⁺` (1); the merge tie keyed on the index (1); the eigenvector sign fixing removed (1).

Gate: `npm run verify` GREEN — 121 files, **5316 passed**, 0 skipped (was 5293). Repo-wide
`npx prettier --check .` clean; eslint clean.

NEXT in cut B: the driver and facade — item expansion with unique-label enforcement, one window
and one option set, the `N²` matrices with their pinned bit-symmetry, `normalization: 'corpus'`
by AD-25.5's median formula, profiles, `suspectPairs`, and AD-26.3's two opt-in enrichments.

## 2026-08-17 — AD-62: cut B1 — PAM exhaustive pass ratified [BINDING]

c915ee6 accepted (corpus mathematics with every algorithm checked against
something that is NOT it; the discipline found two first-draft defects:
Lance–Williams single/complete now literal Math.min/max because ½a+½b−½|a−b|
is the minimum in ℝ and not the same double — merge heights are published
data a consumer plots against the matrix — and PAM's BUILD+SWAP measured
missing the exhaustive optimum in 12/200 corpora, worst excess 41%).

AD-62.1 RATIFIED: PAM gains the exhaustive pass below
PAM_EXHAUSTIVE_LIMIT = 200000 subsets [convention], heuristic fallback
above, Partition.exhaustive reporting WHICH — the medoid product's whole
value is naming the right performer, and a 41% miss is a product defect.
Strict improvement, no interface change; §8's PAM sentence amends under
delegation in B2. The tie-rich AD-25.2 pin and the Σ|λ|-vs-Σλ⁺ contrast
pin are noted with approval — honesty requirements held by measurements,
not style.

## 2026-08-17 — W4 cut B2: `compareMpmCorpus` is live (w4-products)

`src/comparison/corpus.ts`, §9.3's `CorpusReport`, three interior error classes, the facade and
the export surface, + 19 tests. §8's corpus level over the vendored documents.

**THE MATRIX IS ONE FUNCTION, and that is the test that carries the file.** Every cell comes
from `compareInterior` — the same engine the pairwise facade uses, with the same options record
— so a corpus number and a pairwise number for the same two documents under the same window are
the SAME number, asserted cell by cell and dimension by dimension with `toEqual` rather than
`toBeCloseTo`. R3's "one window, one option set" is what makes a dendrogram mean anything, and
the window is derived ONCE (`corpusEndQuarters`, the maximum score end over the items) and handed
to every pairwise call, so no cell can pick a different one. Negative-controlled: a per-pair
window fails the window test.

Bit-symmetry is BY CONSTRUCTION rather than by an appeal to the metric: both triangles are
written from one computed number. Negative-controlled by perturbing the mirrored write by one
`Number.EPSILON`, which fails three tests including P-C6's.

**P-C6's CORPUS CLAUSE, asserted against a permuted RE-RUN** rather than against a stored
expectation: permuting `items` permutes the matrices and relabels the dendrogram — merge for
merge, leaf for leaf, and the seriation with them — and changes nothing else. That is AD-25.2's
label-keyed tie rule doing its work end to end, on top of cut B1's own pin at the algorithm
layer.

[DECISION, needs ratification] **An EXPLICIT `embeddingAxes` outside `[1, N−1]` errors; the
DEFAULT degrades.** §9.4's table gives the range without distinguishing the two, and taking it
literally makes the default invalid for a two-item corpus — a caller who never set the option
would be told they made a mistake they did not make. §9.4's own closing sentence governs it:
"R7's three-state degradation continues to govern fields the caller did NOT request." So an
unset `embeddingAxes` clamps to `min(2, max(1, N−1))` silently and an explicit one is the
knowable branch. Found by a test that could not have been written any other way — the default
threw.

[DECISION, needs ratification] **`k ≤ N` is checked AFTER expansion**, in the interior, and
translated to `InvalidOptionError` by the facade. The bound depends on the expanded count, which
the facade cannot know without reading the documents; it is still §9.4's knowable branch rather
than a degradation note, because the caller supplied both the corpus and the number.

AD-25.5's normalization is implemented as the formula rather than as a stamped constant, and the
test re-derives the median from the shipped per-dimension matrices instead of trusting the
constant. The per-dimension matrices are UNCHANGED by it — only the aggregate is rebuilt — which
is negative-controlled, because rescaling them too would silently redefine every `d_k` a caller
reads.

Profiles are taken against the CORPUS medoid, a single one obtained at `k = 1` whatever `k` the
caller asked for, which is §8's own phrase ("distance to the corpus medoid") and the reading
that makes "who is extreme in what" a statement about the whole corpus.

NOT IN THIS CUT, and both flagged rather than dropped: AD-26.3's `corpusAverage` pseudo-item and
AD-27.8's `scape`. The scape is cut C. The corpus average needs a decision I will not make
alone — §8 defines it as "the per-dimension POINTWISE MEAN of the corpus's evaluated curves",
and a mean curve is not a document, so its distance to each item cannot go through
`compareInterior` at all. The T-space samplers exist (`DimensionEvaluation.valueA`), so the
integral is computable, but it would be a SECOND integration path beside the eleven verified
per-dimension integrators — no caps, no `⊥` handling, no transition-aware split points — and a
synthetic row computed that way would sit in the same matrix as exact ones. Asked for a ruling
before building it.

NEGATIVE CONTROLS, four, each failing exactly its own tests and restoring green: a per-pair
window instead of the corpus-shared one (1); the mirrored write perturbed by one ulp (3); label
collisions permitted (1); normalization applied to the per-dimension matrices as well (1).

Gate: `npm run verify` GREEN — 122 files, **5335 passed**, 0 skipped (was 5316). Repo-wide
`npx prettier --check .` clean; eslint clean.

## 2026-08-17 — AD-63: corpusAverage removed from v1; B2 ratifications [BINDING]

c05d251 accepted — compareMpmCorpus live; the one-function matrix asserted
cell-by-cell with toEqual against pairwise calls; P-C6 against a permuted
RE-RUN; normalization rebuilding the aggregate only, negative-controlled.

AD-63.1 (the requested ruling) corpusAverage is REMOVED from the v1
surface — AD-26.3's ruling predates the implementation's discovery that a
mean curve is not a document: building it means a SECOND integration path
(no cap, no ⊥, no split points) whose synthetic rows would sit beside
eleven verified integrators in the same matrix, dendrogram, MDS and
medoid search. The absence-over-throw form (AD-52.3a/AD-61.1) applies.
What remains serves the same musicological need with verified numbers:
the medoid profiles name a REAL most-typical performance (Sapp's own
displays keep the argmax performer), and noiseFloor context stays (it
derives from the shipped matrices — no new integration). Post-campaign
route if a consumer asks: option (b), piecewise-constant dimensions exact
+ nulls elsewhere, journaled here. DESIGN §8/§9 amendments delegated to
cut C's commit.
AD-63.2 Both option decisions RATIFIED: explicit embeddingAxes out of
range errors while the DEFAULT degrades (§9.4's closing sentence governs;
found by a test the literal reading made unwritable), and k ≤ N checked
after expansion in the interior as the knowable branch.
AD-63.3 REMINDER WITH EMPHASIS: the rubato epsilon family was ruled in
AD-60.1 and re-pointed in AD-61.2 — it is NOT open. Execute the
delegation (sixth family, AD-34.1's figure, §9.3 amendment) in cut C's
commit; the worker's "still open" lines indicate the LOG entries since
AD-60 have not been re-read — re-read them before C.

## 2026-08-17 — W4 cut C: the scape, at both levels (w4-products)

`src/comparison/scape.ts` + 11 tests, wired into `compareMpm` and `compareMpmCorpus`. AD-27.8's
committed deliverable — survey-lit §6.0 promoted it from a stretch goal because the timescape is
how the field READS a comparison: the aggregate difference at every position and every timescale
at once, in one triangle.

**THE BINNING IS NOT `massIn`, and the difference was measured rather than assumed.**
`aggregate.massIn` apportions a partly-covered cell by integrating the dimension's own sampler
over the overlap, and GL-10 over two halves is not GL-10 over the whole — so a scape binned that
way came out **0.05 % below `aggregate.distance`** on the Telemann pair at 8 bins, and by a
DIFFERENT amount at every other bin count, which is what identifies quadrature rather than an
edge convention. The shipped binning apportions each density CELL across the bins it touches by
the shape its sampler gives and then RESCALES the shares to the cell's own `mass`, which is the
authority — `aggregate.ts`'s own shape-versus-scale rule, one level further out. The bins of one
cell then sum to that cell exactly, the bins of one dimension to `d_k`, and the top cell of the
triangle to `D`, which is pinned at 9 decimals. Negative-controlled: dropping the rescale fails
the closure at two bin counts.

Additivity — a cell is the sum of any partition of itself — is what a reader assumes when they
compare a phrase-length cell to the bars beneath it, and it is asserted at 1e-9 RELATIVE rather
than bit-exactly, because a cell is a difference of two running prefix totals and two such
differences do not recombine bit for bit. The binning conserves mass exactly; the cancellation is
the residue.

**A SECOND, INDEPENDENT ROUTE agrees**: running `compareMpm` over an explicitly narrowed window
re-reads the documents and rebuilds every dimension's own refinement grid for that window, where
the scape apportions the full-window cells. Worst divergence over four sub-windows is measured
and asserted at `< 1e-3` relative and `> 0` — far below the metric's JND resolution and inside
AD-34.1's documented rubato residual.

**§8's SECOND VARIANT ships too, and it was cheap.** The corpus scape is Sapp's: per cell, WHICH
item is closest to the corpus medoid — "who plays most typically here, at this timescale" — from
`N − 1` extra comparisons against the medoid alone, a `2/N` overhead on the matrix's own
`N(N−1)/2`. Every candidate row is the SAME prefix-summed density the pairwise product reports,
so the reduction introduces no arithmetic. Ties go to the lowest label, which is AD-25.2 reaching
the one corpus product that had not needed it. `kind: 'closest-to-medoid'` is in the DATA, not
in prose: an array of numbers whose meaning a reader has to guess is a different kind of defect
from a wrong number. The reduction is checked against the rows it reduces.

[DECISION, needs ratification] **`scape` is on the PAIRWISE surface as well as the corpus one.**
§9.2 declares it on `CompareCorpusOptions` only, while §8's own text names two variants —
"either a pair's distance or the corpus argmin/argmax performer". The first needs a pair, so it
lives on `CompareMpmOptions` and reports as `ComparisonReport.scape`. §9.4's `scape.bins` row is
implemented as written (integer in `[1, 256]`, out of range is an `InvalidOptionError`), so no
capping occurs and the `grid-truncated` note the commission anticipated has nothing to fire on.

**§9.5's KEY-ORDER PIN CAUGHT THE NEW FIELD**, which is what MAJOR-9 built it for: the top-level
order is written out as data, so adding `scape` failed the suite until the order was updated
deliberately. Recorded because a pin that fires on your own change is the pin working.

[MEASURED] The last bin's edge is pinned at the window end rather than left at
`start + count·width`, and the guard's job is narrower than it looks: for a density CELL the
rescale already protects the total, so what the pin saves is a POINT ATOM sitting exactly at the
window end, which an under-rounded last edge (`49 · (16/49) = 15.999999999999998`) would read as
outside the triangle. No vendored document places one there — a negative control on the pin
passed every corpus test in the file — so the evidence goes down a layer to `scapeOf` itself with
a hand-built density, and the control then bites. RG-2's move, third time in this wave.

NEGATIVE CONTROLS, three, each failing exactly its own tests and restoring green: the
mass-preserving rescale removed (2); the last-bin pin removed (1, after the function-level
fixture was written for it); the corpus reduction including the medoid itself (2).

Gate: `npm run verify` GREEN — 123 files, **5346 passed**, 0 skipped (was 5335). Repo-wide
`npx prettier --check .` clean; eslint clean.

## 2026-08-17 — AD-64: cut C ratified; CONSOLIDATED delegations for cut D [BINDING]

2e2e4e2 accepted: both scape variants; the mass-preservation finding
(binning apportions by sampler SHAPE rescaled to the cell's mass — the
shape-vs-scale rule one level out; 0.05% quadrature drift identified by
its bin-count dependence and eliminated); the independent narrowed-window
route; the corpus variant's closest-to-medoid at 2/N overhead with kind
in the DATA; the key-order pin catching its own author; the point-atom
evidence moved down a layer (RG-2's move, third time this wave).
AD-64.1 RATIFIED: scape on the pairwise surface as well as corpus —
§8's own two variants require it; §9.2 amendment joins the delegation
list below.
AD-64.2 COORDINATION CORRECTION, on the record: the worker's last two
reports list rulings as open that AD-60.1 (rubato sixth epsilon family)
and AD-63.1 (corpusAverage removed) closed. The LOG is in the shared
working tree; its tail was not re-read. The predecessor's rule is
re-imposed explicitly: THE LOG IS THE CHANNEL — re-read every entry
newer than your last report before composing the next one.
AD-64.3 CONSOLIDATED UNEXECUTED DELEGATIONS — all land in cut D's FIRST
commit, before the README work:
  (i)   §9.3: sixth epsilon family `rubato`, AD-34.1's figure (AD-60.1).
  (ii)  §8 + §9: corpusAverage removed from v1, medoid-profiles rationale,
        option (b) journaled as the consumer route (AD-63.1).
  (iii) §9.2: DiffMpmOptions = CompareMpmOptions minus invariance/profile
        (AD-61.1); scape on the pairwise surface (AD-64.1).
  (iv)  §8: the PAM exhaustive-pass sentence (AD-62.1).
  (v)   §5.6-adjacent: the ornamentation mixed-state scope rule's
        SYNTHETIC PIN (AD-60.3's obligation — a stated rule with no
        observable is half a rule).
Cut D then proceeds to the docs obligations as scoped in AD-57.4/AD-61.3.

## 2026-08-17 — W4 cut D: the documentation obligations, and two claims the tests refuted

README gains a ~370-line comparison section, and `tests/comparison/readmeRecipes.test.ts` gains 12
tests that EXECUTE it. §11's W4 obligations and AD-26.4's four are discharged; AD-26.5's novelty
claim is deliberately NOT shipped, because that ruling makes the 2025–26 re-sweep a precondition
and the sweep is W5's.

**THE RECIPES ARE TESTED, and that is not ceremony.** A cookbook entry reaches for report fields
by name — `table.columnSums`, `segment.measure.start.number`, `opCounts.substitute` — and a rename
anywhere in §9.3 would leave every one of them plausible and broken, which is the failure mode
review is worst at catching. So every recipe runs in the form the README prints it, and every
number the README quotes is asserted against the engine.

**TWO CLAIMS I WROTE WERE FALSE, and the tests found both before the commit:**

1. *"The report says which spaces you asked it of, as an `invariance-space` note."* It does not.
   The note fires where the mode means something a reader would NOT expect — on a LINEAR space,
   where `'level'` removes an offset rather than a factor — and asking for `'level'` on tempo, a
   log space, correctly says nothing. The README now quotes the note's own words and the test
   pins BOTH directions: present on `asynchrony`, absent on `tempo`.

2. *"That yields 'these two differ mainly in melody lead, localised at bars 17–24'."* Measured, the
   recipe as drafted found nothing at all. Two reasons, both now in the README: the `> 50 % of the
   column` criterion is wrong for real data — on Vulpius Romantic|Amateur asynchrony is 180.0 of
   2939.7, i.e. **6 %**, because imprecision dominates that pair — and **every vendored pair yields
   a SINGLE segment spanning the whole piece**, since with `ω = 1` the entire piece is above the
   one-JND threshold and there is nothing to localise within. The recipe now RANKS segments by
   asynchrony's share rather than thresholding at a half, and the worked example moved to the pair
   where the phenomenon is unmistakable: Albert *Du mein einzig Licht*, an expressive reading
   against a deliberately deadpan "Like a robot", prints a **475 ms** lead — sixteen times Goebl's
   30 ms threshold, which is the recipe's own criterion rather than a number chosen to work —
   carrying **33 %** of the difference. Both figures are asserted, and so is the single-segment
   limit, so the caveat cannot rot.

WHAT THE SECTION COVERS, obligation by obligation: G2's framing paragraph OPENS it, because it is
the scientific argument for the module's existence rather than a footnote — articulation and
melody lead carry performer identity first, and they are exactly what audio-derived traditions
cannot see. Then the real numbers with AD-53.1's Vulpius correction told as what it is: a design
expectation refuted by measurement, where three dimensions compare at EXACT zero and the report
says why without being asked. Then AD-26.1's units (nepers, the ×1/ln 2 conversion, BPM-as-rate
so a positive signed tempo difference means FASTER), C10's mean-versus-distance, the
distance-versus-descriptor split, C14's glossary (level/gain/shape with one worked example each,
in musicians' terms — "are they in the same place / is one doing more / are they doing the same
thing at the same time"), AD-4's window and its two stamps with the "must not be assembled into a
matrix" warning, C7's suspectPair, `diffMpm` with the three-number triple and `reworking` named as
the interesting one, `compareMpmCorpus` with the Ward.D2 caveat sentence and the three honesty
fields, and the scape at both levels.

The cookbook: C9's Welte timing-only recipe with the per-space trade-off; C8's neutral-baseline
recipe including the reason `'level'` belongs in it (with `'none'` a performance that is merely
fast scores as expressive, which measures the wrong thing); C12's `boundary_prf` derivation with
its non-equivalence caveat stated as a mechanism rather than a hedge (greedy-nearest with a
tolerance against a cost-minimizing DP); the Hudson recipe above; and AD-26.4/G7's four provenance
presets as documented DATA in the README rather than exported constants — §11's "as documented
data over the existing knobs, with no new mechanism", read literally.

The non-goals close it with survey-lit's own three prohibitions and their citations (Peter et al.
2023 on quality, Liebman et al. 2012 on the single number), AD-27.7's Repp position-variance
caveat as a stated simplification with its consequence spelled out, C15's asynchrony limits, and
the P1 interpolation answer — Desain & Honing's objection targets MEASURED event data and an MPM
curve is a parametric specification, so this module interpolates nothing and gets for free the
representation Todd, Repp and Molina-Solana all have to recover by fitting.

`scapeIndex` and `SCAPE_MAX_BINS` join the public surface, because the README's scape example
indexes a triangular packing and a consumer who has to reverse-engineer it will get it wrong.

Gate: `npm run verify` GREEN — 124 files, **5358 passed**, 0 skipped (was 5346). Repo-wide
`npx prettier --check .` clean; eslint clean.

## 2026-08-17 — AD-65: cut D ratified; conductor executes doc delegations; channel fault [BINDING]

cb32a88 accepted in full: the README with its recipes EXECUTED by tests —
including two of the author's own claims falsified before commit (the
invariance-space note's real firing rule; the Hudson recipe finding
NOTHING as drafted, recalibrated to rank by asynchrony share with the
Albert 475 ms lead as the honest worked example and the single-segment
limit asserted so the caveat cannot rot). The novelty claim correctly
withheld pending AD-26.5's W5 re-sweep. scapeIndex/SCAPE_MAX_BINS on the
surface ratified.

AD-65.1 CHANNEL FAULT recorded: w4-prod has referenced no ruling newer
than AD-57 and none of the conductor's six messages across five cuts —
the delegations of AD-60.1/61.1/62.1/63.1/64.1 went unexecuted despite
AD-64's explicit stop instruction. Whatever the transport cause, the
conductor has now EXECUTED the four doc-only delegations directly in this
commit (DESIGN §9.3 sixth epsilon family; §8 corpusAverage bullet
rewritten as removed with the AD-63.1 rationale; §9.2 DiffMpmOptions as
Omit<…,'invariance'|'profile'> + corpusAverage option line removed; §8
PAM exhaustive sentence) — doc-only, collision-free between the worker's
cuts, justified by two failed delivery cycles. REMAINING WITH THE WORKER:
the AD-60.3 synthetic pin (ornamentation mixed-state scope) and the §9.2
pairwise-scape surface line — both fold into cut E, and cut E does NOT
start until the worker ACKNOWLEDGES THIS ENTRY BY NUMBER in its next
report. If the next report again shows no rulings received, the conductor
partitions the remaining work differently.

## 2026-08-17 — W4 cuts E and A5: the family extension, AD-57.2's check, and A-Q5's moves

Two cuts in one commit because the second's evidence runs through the first's family.

### E — the family gains two, and AD-57.2's check is made re-runnable

`ADVERSARIAL_FAMILY` is **26 → 28**, and the two are a PAIR: `styled-level-slow` and
`styled-level-fast` carry byte-identical `<tempoMap>` bodies and different `tempoDef`s, so their
whole difference lives in the header. Nothing in the family reached that — every other member
states its levels as literals — and it is the surface §6's edit path opened (cut A2's "resolution
travels with the instruction"). It is metric-relevant as well as edit-relevant: two documents that
PERFORM different tempi must not compare at 0 whatever their map text says.

`tests/comparison/w4Family.test.ts` runs W4's products against the family, which is AD-33.5's
standing policy applied to two surfaces the metric suite cannot see because they are not
properties of `d_k`: §6.4's ORIENTATION (every member mirrored against two anchors, field by
field, 54 pairs) and §8's MATRIX DETERMINISM (a ten-member corpus that is genuinely tie-rich —
45 pairs, materially fewer distinct values, asserted — permuted and re-run).

**AD-57.2's drop-each-member check, and the first version of it measured nothing.** A hook on
`COMPARISON_DROP_MEMBER` makes the check re-runnable rather than a one-off patch, and the first
sweep reported "1 failed" for all 28 members — the one failure being the hook's own guard test,
which demanded an unset env. Fixed to assert the hook's BEHAVIOUR in both modes. The second sweep
then reported "0 failed" for all 28, which measures nothing either, and for a structural reason
worth stating: **dropping a member only shrinks the pair and triple loops, so it can never cause
a failure.** The question AD-57.2 is really asking is which member CATCHES a given defect, so the
check is a coverage sweep against a known one — §4's cap, the property the family exists for:

    §4's cap removed, full family                        3 failures
    …and with `capped` dropped                           2      ← sole catcher
    …and with `ornament-plain` dropped                   2      ← sole catcher
    …and with `ornament-milliseconds` dropped            2      ← sole catcher
    …and with any of the other 25 dropped                3

**Three of twenty-eight members are load-bearing for this defect, and they are exactly the three
the record predicts**: `capped`, which was built for it, and the ornamentation `⊥` pair AD-50.3
named when it recorded "removing §4's cap, with the ELEVEN-dimension suite, fails 3 — including
ornamentation's triangle test, which the six-dimension list could not have reached". The sweep
reproduces that count and says which members produce it.

That is also the argument for AD-57.2's "do not prune", made concrete: **load-bearing is relative
to a defect.** Twenty-five members contribute nothing to catching THIS one and each exists for a
different one, so a prune driven by any single sweep would delete the family. What the check is
for is knowing which member would notice, not shortening the list.

### A5 — A-Q5's `fragment` and `consolidate`

The DP gains two move kinds bounded at `MAX_MOVE_SPAN = 4` [convention], and they rank BELOW the
plain ops so a tie keeps the primitive. That makes the op kind a statement about the PRICE —
these instructions are best read as one gesture — rather than a claim about what the author did.
By the `L¹` triangle inequality a move is never dearer than the plain decomposition it replaces,
so enabling them can only LOWER `scriptCost`: the script moves toward the lower bound as its
vocabulary grows. `moves` is off by default and `EditOp.count` carries the group sizes, because an
op that said "consolidate" without saying how many would not be actionable.

**[MEASURED] The two kinds are wildly asymmetric, and the cause is structural.** Over 200 random
pairs: moves win in **114**, producing **120 fragments and 1 consolidate**. A fragment replaces
"substitute, then INSERT the rest", and the inserts overshoot — the first of a group governs a
span the later ones take back. A consolidate replaces "substitute, then DELETE the rest", and the
deletes do not overshoot, because after the substitution the value each deletion exposes is
already B's. Both branches fire, and `invertSteps` turns every fragment into a consolidate, so
the kind is reachable both ways. Pinned with the figures.

On REAL data the vocabulary buys a great deal: Telemann Baroque|Romantic over the score's own
window yields **11 fragments** and a script **6144.14 JND·quarters** cheaper; Baroque|Fast yields
9 and 2 and saves 4675.56. The shipped test uses a 32-quarter window (5 fragments, 1 consolidate,
88.22 saved) because the full-window call takes 22 s and timed out under a loaded runner — the
size is measured, and the full-window figures are recorded here so the trade is visible.

[FOUND BY A TEST, in code written this cut] **The mirror swapped `insert`/`delete` in `opCounts`
and left `fragment`/`consolidate` alone.** On Telemann Baroque|Fast the forward script had 9
fragments and 2 consolidates while the reverse reported 2 and 9 in its OPS and still 9 and 2 in
its COUNTS. `EditOp.count` had the same gap. Both repaired, and the byte-identity mirror test was
extended to a MOVED script — the counts-only version passed throughout the defect, which is why
the byte comparison is the one that completes the claim.

[MEASURED, and a fixture rebuilt because of it] A first draft asserted a consolidate on a
staircase collapsing onto one level. Measured, that ties: each plain op there changes a DISJOINT
interval, so the four of them sum to the direct distance exactly and there is no slack to
recover. The case is kept as a TIE fixture with its reason, and the move fixtures were rebuilt on
the shape that does have slack — one instruction becoming two, where the plain path passes
through a state that over-reaches for the rest of the window (one quarter against fifteen).

NEGATIVE CONTROLS, six across the two cuts, each failing exactly its own tests and restoring
green: moves ranked above the plain ops so a tie takes the move (2); the mirror's move counts
left unswapped (2); the replay not clearing a move's whole group on the A side (0 — a GAP, since
the toy family produces fragments whose A count is 1) and on the B side (1); `MAX_MOVE_SPAN`
raised to 64 (1).

Gate: `npm run verify` GREEN — 125 files, **5396 passed**, 0 skipped (was 5358). Repo-wide
`npx prettier --check .` clean; eslint clean on `src/comparison`, `tests/comparison`, `src/api`
and `src/index.ts`.

**W4's scope is now complete except `corpusAverage`**, which is held for the ruling requested at
cut B2: §8 defines it as the pointwise mean of the evaluated curves, which is not a document, so
its row cannot go through `compareInterior` and would need a second integration path beside the
eleven verified integrators.

## 2026-08-17 — AD-66: W4 COMPLETE and CLOSED; tenure ended; gate convened [BINDING]

Budget: RED / 35.7% at 14.6% elapsed / THROTTLE.

8789179 accepted — cuts E and A5: the AD-57.2 check matured through two
measured failures into the right question ("which member CATCHES a given
defect"), its sweep reproducing AD-50.3's predicted 3-failure count and
identifying the three producers; the load-bearing-is-relative-to-a-defect
insight is the definitive argument for AD-57.2's do-not-prune, now with
a re-runnable hook. Family 26 → 28 (the styled-level pair reaching §6's
styleDef surface). A5's moves landed within A-Q5's terms (after plain
ops; ranked below primitives; off by default) with the measured
fragment/consolidate asymmetry (120:1 over 200 random pairs) and a
6144-JND·quarter improvement on real data; the mirror's opCounts defect
was caught by extending byte-identity to a moved script — counts-only
passed throughout the defect, which is the lesson.

AD-66.1 The two genuinely new surface flags are RATIFIED: EditOp.count
(a move op without its group size is not actionable) and
CorpusReport.window. Everything else in the report's "open" list was
ruled cuts ago (AD-60..AD-64) and partly landed by the conductor's own
d98c735 — which 8789179 built on without touching, so the tree is
consistent even though the worker never saw the rulings.
AD-66.2 W4 IS CLOSED. corpusAverage is NOT open scope — AD-63.1 removed
it; the worker's hold is moot. All committed W4 products are live and
gated: diffMpm (with moves), compareMpmCorpus, both scape variants, the
executed-recipe docs, the family + coverage check.
AD-66.3 w4-prod's TENURE ENDS at its clean boundary, per AD-65's
commitment: the handshake failed a third time (no ruling after AD-57
ever acknowledged), so the remaining campaign work is repartitioned away
from this channel. On the record with equal weight: the tenure's WORK
was excellent throughout — eight green cuts, two products shipped, five
first-draft defects self-caught by its own discipline — the fault was
the channel, not the craft.
AD-66.4 THE W4 GATE CONVENES: a fresh Opus verifier over
87aa040..8789179 (all of W4 + the conductor's d98c735), the W2/W3 gate
methodology, with two mandated extra heads: (i) reconcile the shipped
surfaces against AD-58..AD-65's rulings — the worker never read them, so
the gate must check the code matches the rulings it was supposed to
implement (the conductor believes it does, by convergent reasoning — the
gate verifies); (ii) the README's executed recipes against the shipped
report shapes. Deliverable W4-VERIFICATION.md, GATE-PASS/BLOCK.

## 2026-08-17 — AD-67: W4 gate verdict GATE-BLOCK; fix-wave rulings [BINDING]

Postscript to AD-66 first: w4-prod's posthumous handshake discharged by
number, the fault owned as description-not-defence, three verified
reconciliation items pre-declared to the gate, and the A5
retrospective-licence note volunteered against its own interest — the
model for how a tenure that failed its channel can still close at the
record standard. The gate confirms AD-66.3's reading: the fault was the
channel, not the craft.

W4-VERIFICATION.md archived: 3 CAPITAL, 10 MAJOR, 13 MINOR; GATE-BLOCK.
The verdict does NOT rest on the pre-declared items — struck, it still
blocks on CAPITAL-2/3, the gate's own contribution: PAM's medoid set and
the embedding/seriation are not permutation-invariant on published
fields (order-dependent tie key; float-noise ties never reaching the
label branch; the sign anchor mirroring whole plots), traceable to a
tie-rule test on a tie-free corpus — the vacuity the family exists to
prevent, one level up. CONDUCTOR ACCOUNTABILITY on the record: CAPITAL-1's
DESIGN-vs-code contradiction was MANUFACTURED by the conductor's own
split execution of AD-60.1 (doc side landed, code side could not converge
by construction). The mechanism is now named: a delegation executed on
one side is worse than one executed on neither.

Rulings:
AD-67.1 CAPITAL-3(b): NARROW-WITH-DATA — relative-epsilon tie-breaks
(part a), plus embedding.degenerate carrying the repeated-eigenvalue
carve-out as DATA with the header's guarantee narrowed accordingly.
Canonicalizing degenerate eigenbases is deep numerics for a rare,
detectable case; honesty-as-data is the campaign's pattern.
AD-67.2 MAJOR-1's companion: every CompareMpmOptions field the diff
product does not CONSUME is Omitted (absence over throw, AD-61.1's form)
— the fixer determines consumption against the code and journals the
resulting Omit list.
AD-67.3 The conductor has executed the gate's two no-worker DESIGN edits
in this commit (MINOR-1's §9.2 pairwise-scape line; MINOR-3's orphan
comment removed).
AD-67.4 Fix wave: fresh Opus worker (w4-fix), W4-VERIFICATION.md §8's
must-fix list as specification, with the INSTITUTIONALIZED handshake:
every report opens by citing the newest AD read; work does not proceed
past a report that fails to. Re-gate by w4-verify scoped to the
findings afterward.

## 2026-08-17 — AD-67 erratum: the no-worker edits land in THIS commit

AD-67.3 claimed the two DESIGN edits landed in d1cad82; they did NOT —
the edit script's match failed and asserted before writing, while the
commit proceeded with the archive and journal. The claim was false for
one commit. Corrected here: §9.2 gains the pairwise-scape line (AD-64.1)
and the orphaned corpusAverage doc comment is removed (MINOR-3). The
conductor's own record is subject to the same standard it enforces:
stated-as-done must mean done, and this erratum is the cost of asserting
before verifying.

## 2026-08-17 — W4 fix cut 1: CAPITAL-1's sixth family, and MINOR-1..4 (w4-fix)

LOG read through AD-67 erratum. §8's item 1, with the MINOR-1..4 text divergences in the same
commit per the report's advice — they are the remainder of the same channel fault and the tree
should stop disagreeing with itself about what was ruled.

**CAPITAL-1 — AD-60.1's sixth epsilon family is now in the code.** `EpsilonFamily` gains
`'rubato'` (`report.ts:166`), `EPSILON_FAMILY_OF.rubato` repoints from `'step'` to `'rubato'`
(`report.ts:190`), and `EPSILON_FIGURES` gains `rubato: { relative: 2.718e-4, jnd: 7e-4 }`
(`compare.ts:147`). The `step` comment loses its claim to cover rubato and says instead which
members its exact `0` is a claim about — asynchrony, articulation, ornamentation. `epsilonRecord()`
is derived from the table and needed no change; `compare.test.ts:770`'s `step` pin is unaffected
because the exact 0 is still true of what remains.

[FLAGGED FOR RATIFICATION] AD-60.1 named the relative figure (AD-34.1's 2.718e-4) and said "the
JND figure alongside" without naming one. The `7e-4` shipped here is cut A3's own measurement,
converted the way the record's other rows convert: the worst real-data shortfall is 0.036
JND·quarters over ~50 quarters, i.e. 7e-4 JND — an order below the metric's resolution, which is
AD-28.2's whole point and the reason the number was fine while the record was wrong.

**The pin, and a correction to the gate report.** W4-VERIFICATION §2's repair note says
`editDimensions.test.ts` "already pins the 7.51e-5 real-data shortfall, so the assertion has a
measured figure to bind to". It does not: that test's WALK carries scopes `[0, 1]` for the primary
pairs, so the worst rubato shortfall it ever sees is Telemann **part 1** at 2.207e-5. Part 2's
7.51e-5 — cut A3's STOP-AND-REPORT figure and the corpus worst — was measured by no shipped test.
Verified by probe over every part scope of the Telemann pair: part 1 `2.207e-5`, part 2
`7.510e-5` (d = 476.22531733, scriptCost = 476.18955454), part 3 `1.566e-5`; the global scope
carries no rubato at all, since the maps live in the parts.

So the family is pinned twice and neither pin is the band:

- In the walk, against the PUBLISHED record rather than a hand-typed figure — the shortfall must
  be inside `epsilonRecord()[EPSILON_FAMILY_OF[k]].relative`, which is the exact lookup
  `EPSILON_FAMILY_OF` is exported for and the one a consumer performing `diffMpm`'s documented
  `≥ dCurve` check would do. Every `step`-family dimension is asserted at EXACTLY
  `published.step.relative`, so the family's zero is pinned on its genuinely exact members and a
  future re-filing has to face that rather than a `< 1e-6` band.
- In a new focused test (`301 ms`, one dimension over every part scope, against the walk's
  eleven dimensions over two), pinning the corpus worst at `7.51e-5` and asserting it is inside
  `published.rubato.relative` and OUTSIDE `published.step.relative`. That second assertion is the
  finding: under the shipped-before-fix filing this correct measurement read as a theorem
  violation, and so did ulp-level noise on a clean pair (vulpius rubato, 1.687e-16).

**MINOR-2 and MINOR-4, the stale text.** `DESIGN.md:2324`'s `moves` default corrected to FALSE
(A-Q5/AD-66.1; the code's reading was the ruled one). `dimensions.ts`' `EditPlan.localize` doc
rewritten: it claimed articulation "localizes only where every atom is DATE-anchored", which was
the first reason and is not the binding one — AD-60.2's retroactive default step reaches
arbitrarily far LEFT and its right bound is the next unchanged INSTRUCTION, so the doc now names
all three unconditional `false` dimensions with their own reasons and carries the 5.09× violation
measurement a future attempt has to face.

**MINOR-1 and MINOR-3's conductor halves verified, not redone** (AD-67.3 + erratum): §9.2 carries
the pairwise `scape` field at `DESIGN.md:2315-2317`, and the orphaned `corpusAverage` doc comment
is gone.

**MINOR-3's remainder** — `items[].synthetic`, whose only producer was the pseudo-performance
AD-63.1 removed. [FLAGGED FOR RATIFICATION: this is a surface reduction, not a text edit.] The
field could report nothing but `false` for every row of every corpus, which is AD-52.3a's rule
(`noteDensityWeight`) applied to a report shape rather than to an option: a flag that cannot vary
is not data. Removed from `report.ts`'s `CorpusReport`, from `corpus.ts:359`, from `DESIGN.md:2698`,
and `DESIGN.md:3038`'s W4 deliverable list stops naming the pseudo-performance as a deliverable.
`corpus.test.ts`'s `every(item => !item.synthetic)` — vacuously true, and the only reader —
becomes an assertion on the row's key list, which is what actually has something to say now.

NEGATIVE CONTROLS, three, each failing exactly its own tests and restoring green: re-filing
`rubato` under `step` (2 failed / 1274 passed in `tests/comparison`, both in
`editDimensions.test.ts` — the walk's and the focused pin's); zeroing the published `rubato`
figure (1 failed, `expected 0.00002206659004738242 to be less than 0`); restoring
`synthetic: false` (1 failed in `corpus.test.ts`).

Gate: `npm run verify` GREEN — 125 files, **5397 passed**, 0 skipped (5396 before; the focused
rubato pin is the one new test). Repo-wide `npx prettier --check .` clean; eslint clean on every
touched file.

## 2026-08-17 — AD-68: fix cut 1 ratifications [BINDING]

eee4b0b accepted — the handshake discipline works (report opens "LOG read
through AD-67 erratum"). CAPITAL-1 as ruled; and a measured CORRECTION TO
THE GATE REPORT itself: the pin it believed existed never reached
Telemann part 2 (the walk's scopes stopped at [0,1]), so the 7.51e-5
corpus-worst was measured by no shipped test until this cut's focused
pin — the standard applies to verifiers, third instance. The double pin
(walk against the published record + the focused part-2 test asserting
the figure inside rubato's family and OUTSIDE step's) is the right
shape: under the old filing a correct measurement read as a theorem
violation.
AD-68.1 RATIFIED: rubato family jnd = 7e-4 [convention], converted from
cut A3's own measurement the way the record's other rows convert.
AD-68.2 RATIFIED: items[].synthetic REMOVED — its only producer was
AD-63.1's removed pseudo-performance, so it could only ever say false;
AD-52.3a's absence rule applied to a report shape, which is a new and
correct extension of the form.

## 2026-08-17 — W4 fix cut 2: CAPITAL-2, the tie key that was index-ordered (w4-fix)

LOG read through AD-67 erratum (no entries newer than my cut-1 report). §8's item 2.

**The repair.** `exhaustiveMedoids`' tie key sorts the labels before joining
(`clustering.ts:282-286`). `walk` enumerates subsets in ascending INDEX order, so the shipped key
was the subset's labels *in the caller's own item order* — label-VALUED but index-ORDERED, which
reads as AD-25.2's rule and is not it. `bestKey` is now carried alongside `best` rather than
recomputed per candidate, and a `cost > bestCost` early return keeps the `O(k log k)` sort out of
the hot loop of a 2·10⁵-subset enumeration — only a tie needs a key.

**The heuristic's tie clauses, audited as the must-fix required — and they are already right.**
The audit is a measurement rather than a reading: `PAM_EXHAUSTIVE_LIMIT` puts BUILD + SWAP out of
reach of any corpus small enough to permute exhaustively, so the probe used `n = 30, k = 6`
(`C = 593775`, past the limit, `exhaustive: false` asserted) on tie-rich matrices with only three
distinct distances, 6 matrices × 8 random permutations. **0 disagreements out of 48**, on the
medoid SET and on the cluster assignment, both read back in labels. The reason: `partitionCost`
and `nearestMedoid` are set-valued given the medoid set (`nearestMedoid` returns a POSITION and
ties on the lowest label, and §8's unique-labels requirement means no two medoids can tie on the
label itself), BUILD compares candidates against a running best on a total order, and SWAP's
clause orders first by the OUT medoid's label and then by the IN candidate's. None of those
consults an index. The defect was confined to the one key that did.

**Pinned at both layers, and the facade pin has a minimal deterministic witness.**

- `corpusMath.test.ts`, all **24** permutations of the report's 4×4 two-block matrix with labels
  deliberately not in index order (`['L02','L00','L01','L03']`, `k = 2`), asserting `medoids`
  AND `clusters` in label space, plus a non-vacuity test proving the matrix really has 4
  cost-equal optima. Before the sort this produced TWO answers.
- `corpus.test.ts`, end to end through `compareMpmCorpus`: three vendored documents each listed
  twice at the same performance under two labels (three exact-0 off-diagonal cells, asserted),
  `k = 2`, `window {0,8}`. The permutation is not a sweep — it is **the first two items
  swapped**, which is the smallest thing a caller can do, and before the repair that swap alone
  changed the corpus's most typical performance from `B-vul-1` to `E-vul-2` with the exhaustive
  claim intact on both. [MEASURED] over all 720 orders of this corpus: 600 said
  `{A-tel-1, B-vul-1}`, 120 said `{A-tel-1, E-vul-2}`. Two facade calls, ~1 s, no randomness.

The wave's existing P-C6 test is left as it is and the new one sits beside it, because the two
say different things: that one asserts equivariance on a tie-FREE corpus with no `k`, where
`medoids` is null and the tie rule is never consulted. That is the blind spot, named in place.

NEGATIVE CONTROL: removing the `.sort()` fails exactly the two new tests and nothing else —
`tests/comparison` 2 failed / 1278 passed, `expected [ …(2) ] to have a length of 1 but got 2` at
the algorithm layer and `expected [ 'A-tel-1', 'E-vul-2' ] to deeply equal [ 'A-tel-1',
'B-vul-1' ]` at the facade. Restored byte-identical.

Gate: `npm run verify` GREEN — 125 files, **5401 passed**, 0 skipped (5397 before; 4 new tests).
Repo-wide `npx prettier --check .` clean; eslint clean on the three touched files.

## 2026-08-17 — W4 fix cut 3: CAPITAL-3, the tie rules that never reached their label branch (w4-fix)

LOG read through AD-68 (fix cut 1 ratifications). §8's item 3, under AD-67.1's NARROW-WITH-DATA.

**The diagnosis, in one sentence.** Every tie rule in `embedding.ts` tested `===` before falling
back to the label, and a permuted matrix runs Jacobi's rotations in a different sequence — so two
quantities equal in exact arithmetic arrive one ulp apart, the label branch is never reached, and
the published order follows the noise. The label rule was there; nothing could get to it.

**Part (a), the relative epsilons — at FOUR sites, one more than the report named.** A single
`TIE_EPSILON = 1e-9` [convention], sitting above the arithmetic (`jacobiEigen`'s own residuals are
`≤1.18e-11` and `≤3.78e-15`) and below anything a plot can show.

- `signOf` is now TWO passes: find the peak, then take the lowest-label component within
  `peak·(1−ε)` of it. The single-pass form compared against a RUNNING best, so the anchor was
  whichever component won by an ulp. The `square` fixture already in the suite is the witness —
  its four corners are at `±2` and their computed magnitudes are `1.99999999999999911`,
  `1.99999999999999978`, `2.00000000000000000`, `1.99999999999999933`, so the strict maximum is
  a corner of the OPPOSITE sign to the anchor. That is what mirrored whole plots.
- `seriationOrder` compares relatively, AND is seeded by sorting on the label first. The seed is
  the part the report did not ask for and it is what takes the residue to zero: an epsilon
  comparison is not transitive, so `sort`'s pivot choices can still see a near-tie chain, and
  seeding with the caller's INDEX order made even that outcome depend on the listing.
  `Array.prototype.sort` is stable, so the label seed survives every comparison returning 0.
- The eigenvalue ORDER (`values[y] - values[x] || compareVectorKeys`) had the identical defect one
  level up and the report did not name it: near-equal eigenvalues were ordered by rotation
  history, never by the vector key. Relative now, journalled as within AD-67.1's form.
- `compareVectorKeys`' own component comparison, likewise, relative to the two vectors' peak.

[MEASURED] the shipped `embedding.ts` against the repaired one on the same generator and seed,
20 corpora × 30 permutations = 600 cases: seriation disagreed **211** times, **15** axes came
back MIRRORED, worst relative coordinate displacement **2.0** (which is what a mirror is). All
three are **0**. Two refinements the measurement forced, both recorded because they are the
difference between a real assertion and a flattering one: a per-coordinate `Math.sign` test is
wrong (an item at the corpus centroid sits at `1e-17` and its sign carries nothing), so mirroring
is detected by comparing a whole axis against its own negation; and an axis is only counted at
all when its eigenvalue is material — a collinear corpus has `λ = [70.3, 2.08e-15, -1.11e-15]`,
and asking which way round its second axis points is not a question.

**Part (b), the carve-out as DATA.** `embedding.degenerate` is widened from `Σ|λ| = 0` to "the
eigenbasis is not unique": that condition OR a repeated eigenvalue at or across the retained cut
where at least one of the pair carries material variance. The old condition IMPLIES the new one
(all eigenvalues are then 0), so `DESIGN.md`'s stated invariant `Σ|λ| = 0 ⇒ degenerate` still
holds and this is a widening rather than a change of meaning. `explainedVariance`'s null-ness and
`negativeEigenvalueMass` stay on the narrow `Σ|λ| = 0` test, which is now named `zeroSpectrum` in
the code so the two conditions cannot drift back together.

The materiality qualification is what keeps the flag worth reading. Every real corpus has a tail
of near-zero eigenvalues mutually tied at any epsilon; their eigenvectors ARE arbitrary, but the
coordinates they produce are `√λ·v` at the noise floor. Flagging them would make `degenerate`
true for every corpus asked for `axes = N−1` and tell a reader nothing.

The gate's own example reproduces exactly: three documents each listed twice with equal
cross-document distances gives `λ = [9, 9, ~0, ~0, ~0, 0]`, `degenerate: true`, and — the
non-vacuity, asserted — **78 distinct coordinate sets and 6 distinct seriations over all 720
orders**. The flag is not decoration; it names a corpus whose plot genuinely has no orientation.

**Pinned** in `corpusMath.test.ts` (the 600-case sweep; the repeated-eigenvalue flag with its
instability; the narrowness check that an ordinary corpus is NOT flagged even at `axes = 4`; and
the `square`'s anchor rule restated with a non-vacuity test proving the anchor is not the strict
maximum) and in `corpus.test.ts` (the same two-item swap as CAPITAL-2, now through
`seriationOrder` and `embedding.coordinates`).

**DESIGN §8's P-C6 paragraph** carries both qualifications now: a tie key must be a key over the
SET rather than over the caller's listing (CAPITAL-2), every tie test is relative, and the exact
tie is out of scope of the guarantee with `embedding.degenerate` reporting it. §9.3's field
comment and §9.6's `Σ|λ| = 0` row say the implication is one-way.

NEGATIVE CONTROLS, four. Reverting `embedding.ts` wholesale fails exactly the 5 CAPITAL-3 tests
and nothing else (`tests/comparison`: 5 failed / 1280 passed). Then one per sub-repair:
seriation back to exact → 2 failed (the algorithm sweep and the facade pin); `signOf`'s threshold
back to the strict peak → 3 failed; `degenerate` back to the narrow flag → 1 failed. Each
restored byte-identical.

Gate: `npm run verify` GREEN — 125 files, **5406 passed**, 0 skipped (5401 before; 5 new tests).
Repo-wide `npx prettier --check .` clean; eslint clean on the three touched source/test files.

## 2026-08-17 — AD-69: fix cut 3 ratifications [BINDING]

2c93dfc accepted. AD-69.1 RATIFIED: part (a) at FOUR sites — the
eigenvalue ordering and compareVectorKeys carried the identical defect
one level above the two the gate named; within AD-67.1's form as
journalled. AD-69.2 RATIFIED: the beyond-ruling label-seed (stable sort
under a non-transitive epsilon comparator) — it is what takes the gate's
expected 146-case residue to ZERO, and the reasoning (epsilon comparisons
are not transitive; the seed must not be the caller's listing) joins the
campaign's determinism canon. AD-69.3 RATIFIED: embedding.degenerate
widened to eigenbasis-non-uniqueness with the materiality qualification,
zeroSpectrum split out so the two conditions cannot drift back together,
DESIGN's Σ|λ|=0 implication correctly one-way. The two measurement
refinements (whole-axis mirror detection; material-eigenvalue gating) are
noted as the difference between a real assertion and a flattering one —
on the record in those words.

## 2026-08-17 — W4 fix cut 4: a file the campaign's own tools could not read (w4-fix)

LOG read through AD-68 (fix cut 1 ratifications).

[NEW FINDING, not on §8's must-fix list — reported here because it was found while working
MAJOR-1, and it explains a gap in every review this file has had.]

**`src/comparison/diff.ts` contained two RAW NUL bytes and has been BINARY to git and grep since
`baa4579`.** Line 90's orientation key wrote its separator as the character itself rather than as
the escape ``, and the doc comment eleven lines above quoted it the same way. The string
this produces is correct and the mechanism is sound — a separator no XML serialization can
contain, so no selector can forge a key boundary. What is wrong is the file:

- `git diff` and `git show` classify it as binary. **`git diff --stat` reports
  `Bin 21151 -> 21695 bytes` and NOT ONE LINE of content** — so cut A4's and cut A5's diffs of
  this file, and this gate's own re-reading of `87aa040..8789179`, showed nothing textual for
  `diff.ts` at all. The 537 lines that implement §6.4's orientation, the mirror and the report
  assembly have never appeared in a reviewable diff.
- `grep` and `rg` skip it in SILENCE — exit 1, no output, no "binary file matches" line. A sweep
  over `src/comparison/**` returns clean while never having read this file. Found exactly that
  way: `grep -n "notes" src/comparison/diff.ts` returned nothing on a file the gate had just
  cited `notes` line numbers from.
- `file` calls it `data`.

Nothing else in `src/` or `tests/` outside `tests/integration/fixtures/**` carries a NUL; the
whole tracked tree was swept. `docs/history/ornamentation/tools/probe.mjs` has one and is a
closed campaign record, left alone.

*Repair:* both occurrences written as the escape, which is the identical string at runtime —
`clustering.ts` already writes the same separator that way, which is how the inconsistency is
visible at all. `file` now reports UTF-8 text, `git diff` shows lines, `grep` works. The module
doc says why the escape is mandatory here, so it cannot regress silently.

Landing ALONE, and before the MAJOR-1 work in the same file, deliberately: the point of the fix
is that the NEXT commit touching `diff.ts` shows up as text in review, and bundling it with a
semantic change would waste exactly that.

NEGATIVE CONTROL, of the only kind available: the change is semantics-preserving by construction
(an escape and a literal denote the same string), so the control is that the behaviour is
UNCHANGED — `npm run verify` reports the same 5406 passed before and after, and `diff.test.ts`'s
17 tests including the byte-identity mirror pass untouched. The orientation key is what those
tests exercise most directly.

Gate: `npm run verify` GREEN — 125 files, **5406 passed**, 0 skipped, identical to the previous
commit. Repo-wide `npx prettier --check .` clean; eslint clean on `src/comparison/diff.ts`.

## 2026-08-17 — AD-70: the NUL finding; diff-surface consumption ruled [BINDING]

bb6a361 accepted — a NEW finding off the must-fix list: raw NUL bytes in
src/comparison/diff.ts made the file BINARY to git/grep/file since
baa4579. Consequences named plainly: 537 lines implementing §6.4's
orientation, mirror and report assembly appeared in NO reviewable diff
across cuts A4/A5, were silently skipped by every grep sweep (exit 1, no
"binary file matches"), and the W4 gate's own re-reading of the range saw
nothing textual for the file. Found by the inconsistency being visible
at all only because clustering.ts writes the same separator escaped.
Landed alone, before other work in the file, so the next diff.ts change
is reviewable text; behaviour unchanged by construction (identical 5406,
byte-identity mirror untouched).

AD-70.1 STANDING GUARD ruled: a repo test asserting no tracked source
file under src/ or tests/ (fixtures excluded) contains a raw NUL — the
class of hole, not the instance, is what gets closed. Lands in the next
cut. AD-70.2 RE-GATE OBLIGATION: w4-verify must READ diff.ts IN FULL as
text — its 537 lines have never been reviewed by anyone but their
author.
AD-70.3 (the requested ruling) AD-67.2's determination RATIFIED as
proposed: Omit list 'invariance' | 'profile' | 'scape' | 'weights'
(structurally unconsumable); plausibleRange KEPT WITH CONSUMPTION —
DiffReport.notes populated by plausibilityFindings (an implausible @bpm
is exactly what the script prices a large op at), resolving MAJOR-5 in
the same stroke. MAJOR-1+5 as one cut, as proposed.

## 2026-08-17 — W4 fix cut 5: MAJOR-2 and MAJOR-3, the two corpus-math defects (w4-fix)

LOG read through AD-69 (fix cut 3 ratifications). §8's items 5 and 6. They share a commit because
they are independent one-line repairs in the two corpus-math modules and neither touches the
other's surface; MAJOR-1 is deliberately NOT here, for the reason cut 4's report gave.

**MAJOR-2 — a negative axis reported POSITIVE variance.** `explainedVariance` shipped
`Math.abs(eigenvalue) / total` while its own documentation said `λ_j / Σ|λ|`. The `Math.abs` is
gone. This is not a sign convention, it is the module's whole subject: an axis with a negative
eigenvalue is an IMAGINARY direction produced by a non-Euclidean corpus, only `eigenvalue > 0` is
embedded so its `coordinates` are all zero, and reporting it at `+1.8 %` says the opposite of
both facts. Measured through the public API on the vendored corpus at `embeddingAxes: 9 = n−1`
(legal): axes 7 and 8 have eigenvalues `−145738.84` and `−567987.33`, empty coordinates, and were
reported at `+0.004664811652368655` and `+0.018180149719632315` — **2.28 % of the variance
credited to two axes that are not there**.

The consequence for readers is stated rather than hidden: the shares now sum to `Σλ / Σ|λ|`,
which is BELOW 1 by exactly twice `negativeEigenvalueMass`, and that identity is asserted. A
consumer summing the shares to check they reach 1 was previously being told a comfortable
falsehood by the same `Math.abs`. `README.md`'s honesty-fields section and DESIGN §9.3's field
comment now both say SIGNED.

**MAJOR-3 — `Partition.exhaustive` was false, with a false published note, for 841 legal pairs.**
Both halves in one commit, which the report insisted on and the measurement below justifies.

`chooseCount` multiplied along the row up to `k`. `C(n, j)` is unimodal, so for `k` near `n` an
intermediate product blows the limit while the answer is tiny: `C(26, 24)` is 325 and `C(21, 21)`
is 1, and both reported `limit + 1`. Each such corpus silently gave up the global optimum for the
heuristic AND published `PAM's medoids are BUILD + SWAP's ... C(26, 24) is past the exhaustive
limit`, which is simply untrue. Now `Math.min(k, n − k)`, which is `C(n, k) = C(n, n − k)`.

The flag never lied in the dangerous direction — `exhaustive: true` meant a true global optimum
in all 2000 of the gate's verified cases — so this was a false NEGATIVE that gave up the answer
and then misdescribed why.

**The pruning guard is the other half, and [MEASURED] here rather than taken on trust.** Without
`if (n - start < k - chosen.length) return;` the walk visits `Σ_{j≤k} C(n, j)` nodes, so fixing
the count ALONE converts a false flag into a hang. Reproduced by applying the count fix and
removing the guard:

    n=21 k=21    guarded 3 ms      unguarded 71 ms
    n=26 k=24    guarded 5 ms      unguarded 2291 ms
    n=30 k=28    guarded 8 ms      unguarded 39329 ms      (4900×)

The gate measured 51054 ms for the last one; same phenomenon, different matrix. With the guard
the walk visits exactly `C(n, k)` leaves, which is what `PAM_EXHAUSTIVE_LIMIT` was always sizing.

**Pinned.** MAJOR-2 on the smallest corpus that has the shape (four points, three mutually 2
apart and a fourth at 1 — the triangle inequality holds and no Euclidean space realizes it), at
`axes = n` so the negative eigenvalue is retained: `λ₃ ≈ −0.25`, its share negative and equal to
`λ₃/Σ|λ|`, its coordinates all 0, and the sum identity above. The existing negative-mass test's
share assertion loses its own `Math.abs` and gains a note saying why it could not have caught
this: both axes it retains are positive, so it cannot tell the two readings apart.

MAJOR-3 on the three witnesses `(21,21)`, `(26,24)`, `(30,28)`, asserting `exhaustive: true`, and
the `(26,24)` answer checked against the global optimum computed by enumerating the two items to
EXCLUDE — `C(26,2) = 325` subsets, a different enumeration from the one the implementation runs.
Those cases are also the guard's own detector, and the test says so: unguarded, that test does not
fail, it stops.

NEGATIVE CONTROLS, three, each failing exactly its own test and restoring green: restoring
`Math.abs` in `explainedVariance` → 1 failed (`gives a negative axis a NEGATIVE share`);
`chooseCount` back to walking up to `k` → 1 failed (`is exhaustive for a k near n`); the count fix
with the guard removed → the timing table above, which is the control for the coupling rather
than for a value.

Gate: `npm run verify` GREEN — 125 files, **5408 passed**, 0 skipped (5406 before; 2 new tests).
Repo-wide `npx prettier --check .` clean; eslint clean on the three touched files.

## 2026-08-17 — W4 fix cut 6: MAJOR-1 and MAJOR-5, and AD-70.1's standing guard (w4-fix)

LOG read through AD-70 (the NUL finding; diff-surface consumption ruled). §8's items 4 and 10's
first third, as ONE cut per AD-70.3, plus AD-70.1's guard which that ruling assigned to this cut.

**AD-70.1's standing guard: `tests/repoHygiene.test.ts`.** A walk over `src/` and `tests/`,
skipping `fixtures` (the MIDI references are legitimately binary — a NUL is what a MIDI file is
made of), asserting no file carries a raw NUL and naming the file and LINE if one does. The class,
not the instance: every other guard in this suite catches a wrong answer, and a wrong answer
announces itself; this one catches a file that quietly stops being reviewable. It carries its own
non-vacuity — that the walk found more than 150 files, that `diff.ts` is among them, and that the
detector detects.

**MAJOR-1, per AD-70.3's ratified determination.** `DiffMpmOptions` now omits
`'invariance' | 'profile' | 'weights' | 'scape'`. The two new ones are structural, not incidental:
weights combine eleven dimensions into ONE aggregate and a `DiffReport` has no aggregate; the
scape is a scape OF the aggregate density, which the diff path also has none of.

**The half the report did not name, and it is half the defect.** A surface narrowed without its
VALIDATOR is the same fault pointed the other way. `diffMpm` called `checkCompareOptions`, so
after the `Omit` a JavaScript caller passing `scape: { bins: 0 }` would get an
`InvalidOptionError` about a key `DiffMpmOptions` does not declare — while AD-54.3 says an
unrecognized top-level key is IGNORED. `checkDiffOptions` validates exactly what the diff offers
(window, jnd, plausibleRange, the two selectors, `moves`), so the omitted four now get the same
silence `{ nonsense: 1 }` gets. Pinned in both directions: the four are byte-identically ignored
INCLUDING with illegal values, `compareMpm` still throws on the same illegal value (which is what
makes it a distinction rather than a tautology), and the fields the diff does declare are still
rejected when wrong.

**MAJOR-5, and `plausibleRange` earning its place.** `DiffReport.notes` was allocated, sorted and
never written to. Two kinds now fire, and which two is AD-70.3's consumption rule applied to the
report surface rather than to the options:

- `plausibility`, the kind AD-70.3 names. `plausibilityFindings` reads the two DOCUMENTS and
  nothing else — not the aggregate, not the weights, not the comparison — so the diff produces
  them from the same parse. [MEASURED] with a `[200, 400]` band on `tempo/tempo@bpm`: **56**
  notes, the same count `compareMpm` produces from the same two documents, and that equality is
  the argument for consumption over omission. Unasked, the default bands are wide enough that
  the corpus violates none.
- `estimate-degradation` for the MPM-derived scope rule. `DiffReport.scopes` reports
  `rule: 'mpm'` and DESIGN §9.3 says that rule carries the note; `compare.ts` emitted it and the
  diff did not, so the same fact about the same documents was stamped on one report and silent
  on the other. Same wording, because it is the same fact.

**Two latent defects the first note flushed out, in code that had never run.**

1. `invertReport` mapped the swap in place without re-sorting. §9.5 orders notes through
   `document` and through the serialized note, both of which the swap changes.
2. **Both mirror tests had the same hole, independently** — `diff.test.ts`'s `mirrorOf` and
   `w4Family.test.ts`'s left `site.document` UNSWAPPED and did not re-sort. They mirrored an
   empty array and agreed with anything. Corrected by re-deriving §9.5's order in the tests
   rather than by calling the engine's `sortNotes`, which is what keeps a mirror independent of
   the thing it checks.

**And the re-sort needed a corpus built for it, which is recorded because it nearly shipped
unexercised.** Removing `sortNotes` from `invertReport` left all 26 mirror assertions PASSING:
every plausibility message carries the attribute's value, the vendored performances never share
one at the same site, so no two notes ever tie on §9.5's key ahead of `document`. An unexercised
guard is an absent one by this campaign's own standard, so the case is CONSTRUCTED — two
documents whose date-0 `<tempo bpm="900">` is byte-identical and outside the DEFAULT band,
differing only later. Both sides then emit the same text at the same date, `document` is what
orders the pair, and mapping in place leaves the mirror holding `b, a` where §9.5 says `a, b`.
With that pair present the control fails as it should.

**DESIGN** carries the widened `Omit` with the per-field reasons and the validator's narrowing,
and §9.4's knowability-split paragraph now records that its own claim — "the pairwise entry point
has no instance of this branch in v1" — was FALSE for `diffMpm` between W4 and this wave, and why
widening the `Omit` rather than adding throws makes it literally true again.

NEGATIVE CONTROLS, five, each failing exactly its own tests and restoring green: the `Omit` back
to two fields with the wide validator → 1 failed; the diff's note production removed → 1 failed;
`invertReport` without the re-sort → 1 failed (the constructed pair, and NOTHING before it
existed — recorded above); `invertReport` without swapping `site.document` → 3 failed across both
mirror tests; and a NUL re-introduced into `diff.ts` → the hygiene guard fires, naming the file
and line, which is the control that matters most since it is the only proof AD-70.1's guard is
not itself decoration.

[NOTED] `git diff --stat` shows `src/comparison/diff.ts | 73 +++---` — LINES, for the first time
in this file's history. Cut 4's repair is doing what it was for.

Gate: `npm run verify` GREEN — **126 files**, **5413 passed**, 0 skipped (5408 before; one new
file, five new tests). Repo-wide `npx prettier --check .` clean; eslint clean on all five touched
files.

## 2026-08-17 — AD-71: fix cut 6 accepted; the validator-half principle

799f8af accepted (the standing NUL guard, proven by re-introduction;
MAJOR-1+5 as ruled). Two things join the canon: AD-71.1 the
VALIDATOR-HALF PRINCIPLE — a surface narrowed without its validator is
the same fault pointed the other way (post-Omit, an ignored key was
still being validated into an error about a field the type no longer
declares, against AD-54.3); checkDiffOptions validates exactly what the
diff offers, pinned in both directions with the illegal-value
distinction that keeps it from tautology. AD-71.2 the mirror tests had
been mirroring an EMPTY ARRAY ("which agrees with anything") — two
latent defects flushed by the first real note, the tests made
independent of the engine's own sortNotes, and the near-unexercised
in-place-swap guard given a CONSTRUCTED tie case rather than shipped on
the vendored corpus's accidental absence of ties. §9.4's own false claim
about itself is corrected in place with the reason. diff.ts shows LINES
in the diffstat for the first time in its history — cut 4 doing what it
was for.

## 2026-08-17 — W4 fix cut 7: MAJOR-4 and MAJOR-6 — and the tie CAPITAL-2 could not reach (w4-fix)

LOG read through AD-70 (the NUL finding; diff-surface consumption ruled). §8's items 7 and 8.

[NEW FINDING, CAPITAL-class, found BY item 8's work and fixed in the same cut — flagged for
ratification below.]

**MAJOR-4 — AD-60.3's synthetic pin exists, and the fixture took three tries.** The rule
(`containsA ? scopeOf(a) : scopeOf(b)`) is now pinned on a two-performance synthetic: the same
document, one performance holding its `ornamentationMap` in the PART and one under `<global>`,
read at the part scope where `mapIsPartLocal` answers differently for each. What makes the scope
observable is the style-carrying rule, which genuinely differs between the slots — a part-local
map carries each `<style>` switch forward, a global map ignores every switch after the first.

The three tries are recorded IN the test because the two that failed both look right:

1. **The same map bytes in both slots** — the shape the gate report suggested. "A read as part"
   and "B read as part" are then the same atoms, so inverting the rule to
   `containsA ? scopeOf(b) : scopeOf(a)` merely swaps the two arguments of a symmetric norm.
   Control PASSED.
2. **Two switches each, differing only in ornament dates.** The inverted reading pairs
   `720 with S` against `1440 with T` where the correct one pairs `720 with T` against
   `1440 with S` — same date gap, same style difference, same cost. Control PASSED again.
3. The shipped one: both maps carry two switches but differ in opening style, switch date and
   ornament count, which separates all FOUR readings the rule can produce —
   correct `28.000000000000004`, inverted `13.333333333333336`, forced-part `29.333333333333332`,
   forced-global `22.666666666666664`.

A fixture separating three of the four would have shipped looking complete. That is the shape of
the defect AD-60.3 was written about in the first place. Also required an EXPLICIT window: the
pair-derived one ends at the last instruction date, which put the very ornament the two slots
disagree about on the boundary and read 0.

**MAJOR-6 — `w4Family.test.ts` binds `adversarialMembers()` now, and a SKIP is the honest
report.** The obvious fix (route through the hook) is not enough on its own: a test that names a
member and finds it gone would then pass vacuously, which is the defect the gate found
(`DROP=styled-level-fast` reported 7 passed, including the test whose entire subject was
removed). Tests naming members guard with `it.skipIf`, so the sweep reports what actually
happened. Measured before and after:

    DROP=''                    7 passed              7 passed
    DROP=styled-level-fast     7 passed          →   6 passed | 1 skipped
    DROP=styled-level-slow     7 passed          →   6 passed | 1 skipped
    DROP=plain                 7 passed          →   6 passed | 1 skipped
    DROP=nonexistent-member    1 failed              1 failed   (the hook's own guard)

`requireMember` THROWS on an absence, so routing through the hook does not soften anything: only
the `skipIf` guard licenses a missing member. The corpus test's hard-coded 10-element permutation
became a derived stride and its `45 pairs` became `C(n,2)`, so a dropped member shrinks the
corpus instead of indexing off the end.

**And the finding that came out of it.** With `plain` dropped, the nine-item corpus FAILED
permutation-equivariance on the medoid set — after CAPITAL-2 was fixed. Diagnosed:

    straight  {bottom-span, capped, renderer-default-level}
    shuffled  {bottom-span, renderer-default-level, skips}

Five subsets attain the optimum `177.477686776`. In the straight corpus the winner and the
runner-up are BIT-EQUAL (`177.47768677583286490` both, difference exactly 0); in the permuted one
they differ by `2.842e-14`. **`partitionCost` summed each item's distance in the CALLER's item
order, and floating-point addition is not associative** — so a permuted corpus turns an exact tie
into a 1-ulp difference, `cost < bestCost` settles it, and AD-25.2's label key is never consulted.

CAPITAL-2 repaired the tie KEY. This is the tie itself not surviving to reach the key — the same
disease as CAPITAL-3's exact-equality tests, one level BELOW the gate's finding. Neither the gate
nor cut 2 could have caught it with the fixtures in hand: `corpusMath.test.ts`'s two-block witness
is integer-valued, and integer sums are exact in any order, which is exactly why that test passes
either way.

*Repair, and it is EXACT rather than an epsilon.* `partitionCost` sums in LABEL order — one
canonical sequence computed once per `pam` call and threaded down (it sits in the exhaustive
walk's hot loop, so a per-candidate sort would be `O(C(n,k)·n log n)`). The same numbers added in
the same sequence give bit-identical totals under every permutation, so the tie stays a tie and
the sorted-label key decides it as AD-25.2 says. An epsilon comparison would have tolerated the
noise; a canonical order removes it.

[FLAGGED FOR RATIFICATION] This is a CAPITAL-class defect off the must-fix list, in the area
CAPITAL-2 covers, and the repair changes a published number (`Partition.cost`) by ulps — in the
direction of making it permutation-invariant, which the report should be.

Pinned in `w4Family.test.ts` on the corpus that exhibited it: the matrix is taken from the
pipeline once and permuted directly under 45 orders (every rotation × five strides), asserting
ONE medoid set, with a non-vacuity test proving that corpus really has several cost-equal optima.

NEGATIVE CONTROLS, five, each failing exactly its own tests and restoring green. MAJOR-4: three
perturbations of the scope rule — inverted, forced-part, forced-global — each failing the new pin
with a different measured distance (13.33 / 29.33 / 22.67 against 28.00). The summation order:
`partitionCost` back to index order → 1 failed of 1294 in `tests/comparison`, exactly the new
permutation test. MAJOR-6's control is the sweep table above rather than an injection, since the
defect there was a test that could not fail.

Gate: `npm run verify` GREEN — 126 files, **5417 passed**, 0 skipped (5413 before; four new
tests). Repo-wide `npx prettier --check .` clean; eslint clean on the three touched files.

## 2026-08-17 — AD-72: cut 7 — canonical summation ratified [BINDING]

842e67b accepted. AD-72.1 RATIFIED (the off-list CAPITAL-class find):
partitionCost summed in the CALLER'S item order let float non-associativity
break exact ties under permutation ONE LEVEL BELOW CAPITAL-2's tie key —
bit-equal optima in one order, 2.8e-14 apart in another, the label key
never consulted; invisible to the integer-valued witness because integer
sums are exact in any order. The repair is ratified in its EXACT form —
label-order canonical summation, one sequence per pam call — over any
epsilon: an epsilon tolerates the noise, a canonical order removes it,
and summation order has been part of this campaign's determinism since
W2's own checklist (date-ordered Neumaier). The ulp movement of the
published Partition.cost is authorized: it moves toward
permutation-invariance. AD-72.2 RE-GATE HEAD ADDED: sweep for OTHER
caller-order summations feeding published values — the disease may have
siblings below other keys. AD-72.3 MAJOR-4's three-try fixture
(separating all FOUR readings where three-of-four would have shipped
looking complete) and MAJOR-6's skipIf-plus-requireMember discipline
(routing through the hook softened nothing) are accepted with the
tries recorded.

## 2026-08-17 — W4 fix cut 8: MAJOR-7 and MAJOR-8, the two vacuous tie rules (w4-fix)

LOG read through AD-71 (fix cut 6 accepted; the validator-half principle). §8's item 9.

**MAJOR-7 was already discharged by cuts 2 and 7 — verified rather than assumed, and recorded
with the measurement.** The gate measured both perturbations of `exhaustiveMedoids`' tie clause
failing NOTHING across all 124 W4 tests. Re-run against the tree as it now stands, over the whole
of `tests/comparison` (1294 tests):

    delete the tie clause  (first-enumerated wins)   3 failed   — was 0
    `cost <= bestCost`     (last-enumerated wins)    3 failed   — was 0
    invert the label direction (highest label wins)  2 failed   — was 0

The third is one I added rather than one the gate named, and it is the one that matters most for
the shape of the pin: the first two are caught by permutation-invariance alone, but a rule that
picks the lexicographically LARGEST tied subset is perfectly permutation-invariant and simply
publishes a different performer. Only a VALUE assertion catches that, and cut 2's
`expect(medoids).toEqual(['L00','L01'])` does — it reports `['L02','L03']` under the inversion.
An invariance test alone would have left half of AD-25.2 unpinned, which is worth saying plainly
because "the tie rule is tested" would have been true either way. No new test: three independent
controls on two existing ones is the pin, and a fourth assertion of the same fact would be
padding.

**MAJOR-8 — the replay's co-dated preference, pinned, and the module's prose corrected.**
`editStateAt`'s rule is pinned directly (AD-58.3); `stateFromFlags` carries the identical
comparator for the identical reason and reversing its `x.side - y.side` failed nothing.

The module said the case was unreachable: "the delivered order is date-then-move-rank and
`delete` outranks `insert`, so at a shared date A's instruction is gone before B's arrives".
That argument is correct for ONE instruction per side at a date and false as soon as a date
carries two — the DP substitutes one and DELETES the other, and the survivor is still there when
the insertion lands. The prose now says so, with the measurement.

[MEASURED] 4000 random pairs of the shape this file's generator produces, run under both rules
and compared: **668 differ** in `replayedDelta`. One pair in six. The witness pinned is the
SMALLEST of those 668, found by sorting the disagreements by size — two A instructions at one
date (210 and 202 bpm) against a single B instruction at the same date (108 bpm):

    shipped   replayedDelta = 5.635228232492866
    reversed  replayedDelta = 6.3343452321856075     (+12 %)

Pinned as a VALUE rather than as an ordering, because `stateFromFlags` is not exported and a test
reaching in to inspect its output would pin the implementation instead of the behaviour — the
same reasoning `editStateAt`'s own export note gives, applied to the function that could not be
exported without adding surface for a test's convenience.

The gate's own figures for this were fingerprint sums over a generator (365539.774112 against
362418.129030). A single minimal pair with an exact expected value is the stronger pin: it fails
with a readable number, it cannot drift with the generator, and it names the shape of the input
that reaches the case.

NEGATIVE CONTROLS, four, each failing exactly its own tests and restoring green: the three
MAJOR-7 perturbations tabulated above, and reversing `stateFromFlags`' side rule → 1 failed of
1295 in `tests/comparison`, `expected 6.3343452321856075 to be 5.635228232492866`.

Gate: `npm run verify` GREEN — 126 files, **5418 passed**, 0 skipped (5417 before; one new test).
Repo-wide `npx prettier --check .` clean; eslint clean on both touched files.

## 2026-08-17 — W4 fix cut 9: MAJOR-9 and MAJOR-10, the corpus surface (w4-fix)

LOG read through AD-71 (fix cut 6 accepted; the validator-half principle). §8's item 10, the
remaining two thirds.

**MAJOR-10 — `embeddingAxes` at `N ≤ 1`, where the domain is EMPTY.** The guard read
`n > 1 && axes > n - 1`, so exactly where NOTHING is legal it accepted everything: a one-item
corpus reported `axes === 7`, an empty one reported five all-null variance shares. Now
`axes > Math.max(0, n - 1)`, so an explicit value errors at `N ≤ 1` — AD-25.1's first branch,
since `items.length` sits in the same option bag and the caller could have known without reading
a document. The DEFAULT still degrades rather than erroring, which is §9.4's other half: a caller
who never set the option has made no mistake to be told about.

**MAJOR-9 — the corpus forwards every note kind now, and forwarding them verbatim would have
been the wrong fix.** The filter was `kind === 'length-mismatch'`, which made `capped`,
`plausibility`, `renderer-*`, `grid-truncated`, `invariance-space` and `estimate-degradation`
unobservable at the corpus facade, and made `plausibleRange` accepted-validated-and-inert there
since notes are its only product.

But the pairwise pass is `N(N−1)/2` comparisons and most notes are about a DOCUMENT, which sits
in `N−1` pairs. [MEASURED] on the five-item vendored corpus: **664 `structural` notes over 10
pairs, of which 654 name a document** — `O(N²)` copies of an `O(N)` fact. A 50-item folder would
have produced tens of thousands. So the notes are deduplicated on their content, keyed on
`(kind, dimension, itemIndex, site, span, message)`. Result on the same corpus: **104 notes**
against the 713 the ten reports carry between them, and with a `[200, 400]` band on
`tempo/tempo@bpm`, 254 plausibility notes — bounded by the DOCUMENTS rather than by `N²`.

Two decisions inside that, both about honesty rather than volume:

- **`document` is dropped and `itemIndex` replaces it.** `document: 'a' | 'b'` is PAIR-relative:
  the same file is `a` in one comparison and `b` in the next, so carrying it to the corpus level
  would be meaningless at best and wrong at worst. The old code set `itemIndex: i` on every
  forwarded note regardless of side — latent, since only `document: null` notes were forwarded,
  and now correct: `'a'` maps to `i`, `'b'` to `j`.
- **The label prefix follows what the note is ABOUT.** A note naming a document gets that item's
  label; a pair-scoped note whose content varied by pair gets both labels; a pair-scoped note
  whose content repeated for EVERY pair gets neither, because it is then a fact about the corpus
  and prefixing it with whichever pair was enumerated first would misattribute it. The
  MPM-scope-rule `estimate-degradation` note is the case that forced this: true of every
  comparison in the run.

NEGATIVE CONTROLS, three, each failing exactly its own tests and restoring green: restoring the
`length-mismatch`-only filter → 2 failed (the kind coverage and the `plausibleRange` liveness);
restoring the `n > 1` guard → 1 failed; defeating the dedupe so every pair-instance is forwarded
→ 1 failed, on the uniqueness assertion rather than on the count, so the control tests the
mechanism and not a magic number.

DESIGN §9.3's `CorpusResult.notes` now states the dedupe rule and the `itemIndex`-not-`document`
identity with the measured figures; §9.4's `embeddingAxes` row states the empty-domain case.

Gate: `npm run verify` GREEN — 126 files, **5421 passed**, 0 skipped (5418 before; three new
tests). Repo-wide `npx prettier --check .` clean; eslint clean on both touched files.

**§8's must-fix list is now closed except the MINORs.** CAPITAL-1/2/3, MAJOR-1..10 all landed,
plus two findings off the list (the NUL bytes, and the summation order that CAPITAL-2's tie key
could not reach). MINORs 5–13 remain, and MINORs 1–4 landed in cut 1.

## 2026-08-17 — AD-73: cut 9 ratifications; must-fix list closed to MINORs [BINDING]

2ed139a accepted — CAPITAL-1..3 and MAJOR-1..10 all landed, plus the two
off-list finds (the NUL bytes; the summation order below the tie key).
AD-73.1 RATIFIED: corpus notes drop pair-relative `document` for
`itemIndex` — 'a'/'b' cannot mean anything at corpus level, and the old
`itemIndex: i` regardless of side was latent only because nothing
document-scoped was forwarded. AD-73.2 RATIFIED: the attribution rule —
a note about a document carries that item's label; pair-varying content
carries both; content identical across EVERY pair carries neither,
because it is then a fact about the corpus and first-enumerated-pair
attribution would misattribute it (the MPM-scope-rule note forced the
distinction). The dedupe measurements (713 → 104; document-facts at
O(N) not O(N²)) and the defeat-the-dedupe control failing on the
UNIQUENESS assertion rather than a count are the mechanism-not-magic-
number standard. MAJOR-10's empty-domain repair (everything-legal
exactly where nothing was) accepted. MINORs 5–13 close the wave.

## 2026-08-17 — W4 fix cut 10: MINORs 5–13, and §8's list is closed (w4-fix)

LOG read through AD-71 (fix cut 6 accepted; the validator-half principle). The last of §8.

**MINOR-5 — the README is READ now.** The recipe file held its own copies of the README's
figures, so its docstring's claim that "the numbers the README quotes are asserted against the
engine" was true only of the copies. Every headline figure is extracted from the prose by an
anchored regex, and a missing anchor THROWS rather than defaulting — a test that silently stops
checking the documentation it exists to check is worse than no test. The gate's own control (five
figures rewritten: `8397.60→9999.99`, `1755.47→1111.11`, `24941.06→12345.67`, `475 ms→999 ms`,
`33 %→99 %`) now fails 3 tests where it failed 0.

**MINOR-6 — the mirror WITH an msm.** No shipped mirror test passed one, so `measureA`/`measureB`
were always null and `mirrorOf`'s swap of them was asserted against nothing. Now pinned, with the
non-vacuity that the fields are populated with an msm and null without.

**MINOR-7 — `replayResidual`, and an honest statement of what could NOT be closed.** The residual
is rebuilt independently: from the DELIVERED OPS alone, remove what the steps consume, add what
they produce, sort, and compare `Φ` against `Φ(B)` with the same `norm`. Over 60 random pairs it
also asserts every A instruction is consumed exactly once and every B instruction produced
exactly once — the bookkeeping the exactness actually rests on.

[MEASURED, and reported against my own repair] hard-coding `const replayResidual = 0` STILL fails
nothing, and it cannot be made to fail: the true residual is 0 for every input a correct engine
can produce, so no assertion on its VALUE can distinguish a computed 0 from a constant one. What
the new test closes is the structural half — that the final state really IS B — and that half is
now caught: dropping the last delivered op fails it (with 4 others), and making a step forget one
`bItem` fails it (with 4 others). The field remains self-reported and the module should not
pretend otherwise.

**MINOR-8 — key order for the two new shapes.** `ComparisonReport` was pinned and the shapes W4
added were not, though the existing pin's own comment records that it is what caught W4's `scape`
addition. `DiffReport`, its `dimensions` row, its `scripts` and their `ops`, and `CorpusReport`
with every opt-in product asked for — the widest shape, which is the `scape` lesson applied
before it bites again.

**MINOR-9 — the gate read a divergence that is not one, and the resolution is worth more than the
fix would have been.** DESIGN said `scripts` by `(part, map)`; `compareScripts` implements
`(part, map, dimension)`. Measured, they describe the same order: every `(part, map)` in a real
report carries EXACTLY ONE dimension's script, because the three imprecision dimensions live in
separately-named maps (`imprecisionMap.dynamics`, `.timing`, `.toneduration`) rather than sharing
one. So `(part, map)` is already total and `dimension` is a defensive key no input reaches. I had
already "corrected" DESIGN to `(part, map, dimension)` before measuring, and reverted it: the
DESIGN text was right. Both facts are now asserted — the delivered order, and the one-script-per-
bucket property that makes the third key unreachable — because a future map rename would break
the second silently.

**MINOR-10 — `callerIsCanonical`'s `<=`.** With `<`, a self-diff has equal keys, is judged
non-canonical, and comes back inverted with every `site.document` reading `'b'`. Still a valid
empty-cost script, which is why nothing noticed. Pinned on a self-diff with real ops.

**MINOR-11 — `negativeEigenvalueMass` at the noise floor, documented rather than clamped.**
Measured on regular simplices, which are exactly Euclidean: `0` at `k = 5, 6, 8, 10` and
`6.1e-17`, `2.3e-17` (the gate's own figure), `5.8e-17`, `4.7e-17` at `k = 3, 4, 7, 12`. Jacobi
leaves a zero eigenvalue at `±1e-16` with an arbitrary sign. Deliberately NOT clamped: a
threshold would have to be chosen and it would hide the small-but-real non-Euclideanness the
field exists to report. What is pinned is that it stays at the floor, not that it is zero.

**MINOR-12 — the scape "conserves mass EXACTLY" no longer says exactly.** It conserves to the
last ulp: at `bins = 1` the top cell reads `2526.4921488423447` against a `D` of
`2526.4921488423442`, worst relative gap `5.4e-16`. That is conservation in every sense a reader
of a triangle needs and it is not the word the header used.

**MINOR-13 — the latent ceiling is GONE rather than documented.** `jacobiEigen` spread `n²`
arguments into `Math.hypot` against V8's 105741-argument limit, so it threw `RangeError` at
`n ≥ 326` — verified directly against the old line, which throws where the new one returns 330
eigenvalues. `DEFAULT_MAX_ITEMS = 256` left 1.61× headroom, and a ceiling that depends on an
engine's argument limit is not one anyone can reason about. Accumulated instead, which is the
same number: `Math.hypot`'s scaling guards against overflow in the SQUARES, and these are
distance-matrix entries whose squares cannot overflow a double at any `n` this module accepts.

NEGATIVE CONTROLS, six, each failing exactly its own tests and restoring green: the README's five
figures rewritten → 3 failed; dropping the last delivered op → 5 failed incl. MINOR-7's;
a step forgetting one `bItem` → 5 failed incl. MINOR-7's; `Math.hypot(...a)` restored → 1 failed;
`callerIsCanonical` with `<` → 1 failed; and (recorded as a NON-failure, above) hard-coding the
residual, which still fails nothing and explains why.

Gate: `npm run verify` GREEN — 126 files, **5428 passed**, 0 skipped (5421 before; seven new
tests). Repo-wide `npx prettier --check .` clean; eslint clean on all seven touched files.

**§8's must-fix list is CLOSED.** 3 CAPITAL, 10 MAJOR, 13 MINOR, plus two findings off the list
(the NUL bytes that made `diff.ts` binary; the summation order that CAPITAL-2's tie key could not
reach) and one gate finding corrected on measurement (MINOR-9).
