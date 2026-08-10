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
can *see* exaggeration as a uniform dilation — a testable property linking the
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

[FINDING] The fix is parity-RESTORING, not a divergence. Java hands XOM *bytes*
at every entry point (`XmlBase.java:99,128,162`; `mei/Helper.java:1042,1061`),
and XOM's SAX/Xerces reader consumes a leading `EF BB BF` as the XML 1.0
§4.3.3 / Appendix F encoding signature before the document entity begins. This
port parses a decoded *string*, where the same bytes are a U+FEFF character in
front of the declaration, which `@xmldom/xmldom` refuses fatally. The
divergence was an artefact of characters-vs-bytes, not a decision either side
made. PARITY.md §1 entry `CMP1` records this with the Java citations.

Scope discipline: exactly one leading mark is stripped. Interior U+FEFF is
ZERO WIDTH NO-BREAK SPACE and is preserved; a *run* of marks is left alone
because the second is content, content before the declaration is an error, and
Java rejects that too — stripping the run would open a divergence while closing
one. One test assumption of mine was wrong and was corrected against measured
behaviour rather than kept: a stray BOM with NO xml declaration is a *non-fatal*
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
three of them threw before. Telemann *Grave* (Baroque/Fast/Romantic) and
Vulpius *Die helle Sonn* (Baroque/Romantic/Amateur) are readable, so the
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
+ dendrogram equality on tie-free inputs, index-tie dependence documented
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
minimal.mpm (589 B, no maps — the degenerate case). Both tick grids (720 and
480) are represented, which the cross-ppq normalization work will need.

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
