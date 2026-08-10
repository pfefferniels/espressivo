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
