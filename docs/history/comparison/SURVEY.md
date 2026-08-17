# W0 Survey Synthesis — Performance Comparison

Status: technical synthesis COMPLETE (survey-algo + survey-code + conductor
notes); musicological synthesis §4 PENDING survey-lit. Adjudications here are
[DECISION]-grade and cross-referenced from LOG.md; DESIGN.md is the binding
spec compiled from them.

Inputs: `survey-algo.md` (algorithm portfolio, 1338 lines),
`survey-code.md` (codebase + corpora, 1174 lines), `notes-conductor.md`
(pre-survey conductor position), `survey-lit.md` (pending).

## §1. Where the two technical surveys independently converge

Both surveys were tasked separately and did not see each other's work. They
agree, with independent evidence, on every load-bearing point:

1. **The expression registry is a write licence, not read coverage.**
   Comparison builds its own registry reusing the `ScaleSpace` vocabulary and
   `valueDomain` predicates, with a superset-property test. (algo §1.4/Q9;
   code §1.7/§9.6.)
2. **The center cancels.** Level-space distance is `|ln(x/y)|`, center-free —
   the per-document geometric mean never enters a pairwise difference, so the
   symmetry/metricity hazard dissolves at L0. Corroborated by mpmify's
   `curve_rmse` using bare `log2 bpm`. (algo §1.3b; code §9.2.)
3. **Curves are the primary object; instructions are the edit-path product.**
   Real corpora are transition-dominated (`transition.to` in 79–100% of files
   across three corpora). The tempo curve, not the millisecond map, is the
   timing object — the ms map is a cumulative integral that measures drift.
   (algo §1.6/Q1; code §6.2/§9.6, measured end-to-end on the Telemann
   3-performance document with musically sensible results.)
4. **The reading layer is the expression document layer** (mpmDocument /
   mpmTree / datedView / styleScope), which is honest about unresolvable
   levels where the renderer fabricates 100.0. Curve *shape* math is evaluated
   via the pure `bezier.ts` leaf plus transliterated tempo/rubato evaluators;
   real map classes constructed only on `Element.copy()` and only where
   transliteration is risky (Simpson ms integration). (algo §5-reuse;
   code §3.7/§9.1–9.2.)
5. **Determinism is designed, not hoped for**: sorted-union refinement grids,
   date-ordered compensated summation, documented tie-breaks in DP traceback /
   clustering / eigenvector signs, no PRNG on any output path (imprecision
   compared analytically, not by sampling). (algo §4; code §7.3.)

## §2. Conductor adjudications [DECISION]

Rulings on survey-algo §6's open questions and survey-code's flagged
conflicts. Binding for DESIGN.md; supersedable only by a later dated LOG
entry.

- **A-Q1 Headline metric = curve (semantic) distance.** The edit path is the
  explanatory side-channel with a rigorous relationship to it
  (script cost ≥ curve distance; slack = "re-working"). Adopted as proposed.
- **A-Q2 Aggregate = L1 weighted sum.** Exact dimension × segment
  decomposition is the module's headline capability; only L1 delivers it.
  The L²-based level/gain/shape table is a separate, clearly-labelled
  interpretive product that does NOT sum to the headline number. Adopted.
- **A-Q4 (amended) Imprecision: W₁ in the aggregate, W₂ in the
  interpretive table.** The survey recommended W₂ everywhere and flagged its
  own wrinkle (an L²-derived quantity inside an L1 sum). The amendment
  restores full symmetry between the two report families:
  *headline products are L1-family everywhere* (curves: ∫|Δg|;
  distributions: W₁, which is additive-friendly and native-unit), and
  *interpretive products are L2-family everywhere* (curves: level/gain/shape
  lemma; distributions: W₂'s identical three-term decomposition). One
  mathematics per table, no mixing. W₂ closed forms and the ρ-table ship for
  the interpretive product; W₁ piecewise-polynomial CDF integration ships for
  the aggregate.
- **A-Q3 Weights: fixed JND-unit constants by default**, documented as
  conventions; corpus normalization opt-in with derived constants stamped
  into the report; pair normalization forbidden and unimplemented. JND
  values to be grounded in survey-lit's perception citations where they
  exist, else labelled [convention].
- **A-Q5 Fragment/consolidate moves: ship in W3+, repriced semantically**,
  after plain insert/delete/substitute works. With curve-change pricing they
  are presentation sugar, not semantic necessity.
- **A-Q6 Parts: per-part distance vectors; parts matched by number (name as
  corroboration); unmatched parts and global-vs-part encoding mismatches are
  structural findings, never silently folded into the distance.**
  Aggregation to document level by documented rule (uniform by default,
  MSM note-count weighting as an option).
- **A-Q7 MSM optional.** Everything core works from the MPM alone; dependent
  features degrade to documented defaults and say so in the report (the
  expression module's `estimates` pattern).
- **A-Q8 Scape/multi-scale product: W4+, opt-in, bin-capped** (≤256 windows),
  prefix-sum implementation. Priority to be revisited when survey-lit lands
  (Sapp's scapes are central to the field's practice; if the lit survey
  confirms, this becomes a committed W4 deliverable rather than stretch).
- **A-Q9 Separate comparison registry** with superset-property test. Adopted.
- **A-Q10 Rubato:** primary = displacement curve `warp(t) − t` (gain space,
  tick units, PPQ-normalized); attribute-level metric for the edit path =
  L1 on `(lateStart, earlyEnd)` endpoints. Adopted.
- **A-Q11 Novelty claim: held open** until survey-lit reports. If confirmed,
  the claim is the narrow one: "first exact, additively-decomposable
  comparison of symbolic performance-directive encodings".
- **A-B1 Sampling boundary (code §3.5, the strict-vs-inclusive conflict):
  comparison defines its curves as right-continuous** — the value AT an
  instruction's date is that instruction's value. Rationale: (i) the
  difference from either renderer reading is measure-zero and cannot move any
  integral; (ii) it eliminates the date-0 spurious-default artifact
  (all real documents start at date 0, which strict-before reads as the
  100.0 default); (iii) it matches DynamicsMap's inclusive reading, and where
  the two renderer maps disagree with each other there is no parity to
  preserve. Documented divergence-from-renderer note in the module docs;
  point-evaluation outputs (sampled curves in reports) state the convention.
- **A-B2 Renderer-skipped instructions (code §7.5's
  tempo-without-beatLength case): the semantic level follows the renderer**
  (the curve is what would be performed; the skipped instruction contributes
  nothing) **and the skip is reported** as a document note, exactly like the
  expression gate's skip-and-report. The edit path prices such an
  instruction's insertion/deletion at its curve change — zero — so the two
  levels stay consistent by construction; the op still appears in the script
  (cost 0) so the syntactic difference is visible, and the report note says
  why it is free.
- **A-B3 Correlated imprecision families:** compare marginals by W₁/W₂ AND
  the process parameters (`stepWidth.max`, `degreeOfCorrelation`) as ordinary
  gain-space attributes in a separate `processParameters` component; state in
  the report that the marginal does not characterize the process. Full
  process distance recorded as out of scope.
- **A-B4 Absent maps mean neutral, not missing.** A missing rubatoMap is
  neutral rubato (identity warp); the dimension is compared against the
  neutral curve and never dropped — dropping would make the dimension set
  pair-dependent (the §2.E hazard through the back door). An `absent`
  site-state note reports the asymmetry.
- **A-B5 Note-anchored instructions** (articulation `noteid.ref`,
  ornament `noteOrder`): when both documents reference score note ids they
  share the score's id vocabulary and matching is exact by id; when ids are
  absent (100/100 mpmify corpus files) matching is positional by date. The
  design specifies the fallback chain id → (date, position) explicitly.

## §3. The resulting architecture (compiled into DESIGN.md)

Six layers, each plain-data, each independently testable:

    L0 comparison registry: (element, attribute) → scale space T, forward
       maps added next to the closed forms in transforms.ts; local metric
       |T(x) − T(y)|, center-free for levels
    L1 document normalization: PPQ → lcm (integer factors, exact); style
       resolution via styleScope; global/part resolution; v3 units via
       TemporalValue; part matching
    L2 per-dimension deviation density p_k(t) ≥ 0 on the shared timeline
       (curves via common-refinement Gauss–Legendre with sign-change
       bisection; step dimensions exact; imprecision W₁ spread over its
       governing span)
    L3 per-dimension distances d_k = ∫p_k + L2-family interpretive
       decomposition (level/gain/shape; W₂ three-term for distributions)
    L4 aggregate D = Σ ω_k d_k (fixed documented JND weights; corpus
       normalization opt-in; pair normalization forbidden) + exact
       dimension × segment table (Ruzzo–Tompa segments + below-threshold
       remainder row; the table closes with zero residual)
    L5 corpus: N×N per-dimension + aggregate matrices → UPGMA default
       (single/complete/WPGMA/Ward.D2 with documented caveat), PAM,
       silhouette; classical MDS via cyclic Jacobi with eigenvalue spectrum,
       Σ|λ|-based explained variance and negative-mass reported; MDS-first-
       coordinate seriation
    side channel: semantic-cost edit DP (ops priced by the curve change they
       cause; replay verification; d_curve ≤ scriptCost with meaningful
       slack; deterministic traceback precedence substitute > delete >
       insert, lowest source index)

Cross-module property (Proposition 1): exaggerateMpm(s) fixes shape, scales
gain by |s|, moves level affinely — a W3 test pinning both engines to one
mathematics.

## §4. Musicological synthesis — PENDING survey-lit

Slots to fill when the literature survey lands:
- JND constants with citations (tempo discrimination, asynchrony detection,
  loudness) for the default weight vector; each labelled [literature] or
  [convention].
- Product priorities from actual musicological practice (scape priority,
  which report views researchers read first, the Welte-Mignon use case).
- The novelty claim (A-Q11) and how the README states it.
- Validation practice: how the field would evaluate this metric (agreement
  with known schools/eras clustering, performer identity, etc.) — shapes the
  W5 evaluation-on-real-corpora section.

---

## §4 (filled 2026-08-10) Musicological synthesis — from survey-lit.md

The full evidence base is comparison/survey-lit.md (2,600 lines, verified
per its §0 standard) + survey-lit-welte.md. Adjudication AD-26 (LOG.md)
disposes of its lessons; the load-bearing outcomes:

1. **Novelty (A-Q11 CONFIRMED, G1):** no MPM–MPM distance, no MPM-based
   analytical study, no musical analogue of SSIM for any performance
   representation. The narrow claim stands: first exact, additively-
   decomposable comparison of symbolic performance-directive encodings.
   Caveat: 2025–26 ISMIR/TISMIR sweep incomplete (PianoBind, Pianist
   Transformer unverified) — W5 re-sweeps before the README ships the claim.
2. **The scientific argument (G2):** performer identity is carried most by
   articulation and melody lead, then tempo, dynamics last (Stamatatos &
   Widmer 2005 line of work) — the top two are precisely what audio-derived
   tempo/loudness traditions cannot see and MPM carries losslessly.
3. **Interpolation objection pre-answered (P1/G5):** Desain & Honing's
   "never interpolate between events" targets measured event data; MPM
   curves are parametric SPECIFICATIONS, continuous by definition — the
   module compares shape functions, exactly the representation Todd/Repp/
   Molina-Solana had to recover by fitting. Docs must state this.
4. **Corpus calibration (L4/L10/L15/G8):** raw pairwise numbers are not
   portable across pieces; the corpus product gains a noise-floor/percentile
   context and an optional corpus-average pseudo-performance; deviation-
   from-corpus-norm beats deviation-from-score for discrimination.
5. **Units (L2/L3):** internal T stays natural-log (coherence with
   exaggerateMpm is a design invariant); every reported log quantity is
   unit-tagged ('nepers') with the ×1/ln 2 conversion documented
   (partitura's log₂ convention); BPM = rate (positive = faster) pinned in
   the type docs against the beat-period convention.
6. **JND grounding (L5):** asynchrony 30 ms is [literature]-grade
   (Vernon 1936 → Goebl 2001 tradition; 35 ms chord-clustering as the
   operational "simultaneous"); the remaining defaults ship [convention]
   per AD-24 with the survey's partial support cited in registry notes.
7. **Roll scholarship alignment (L8/L9):** scale-invariant timing for
   roll-derived documents + global tempo as its own reported channel —
   exactly the invariance-mode + drift-channel design; validated.
8. **New W4-scope products from the field's own questions:** the
   Hudson-typology "earlier vs later rubato" report note (Goebl-Flossmann-
   Widmer detector; highest-value Welte deliverable, G4); provenance trust
   profiles as documented weight presets (roll-derived ⇒ dynamics
   distrusted; TimeToAlign MatchClaim certainty as citable precedent, G7);
   scape priority confirmed (L16, Sapp).
9. **What the module must NOT claim to be:** a quality judge, a perceptual
   similarity model, or a single number (Peter et al. 2023 DLfM shows MSE
   comparison of performances is experimentally unreliable; the per-family
   vector with consensus views is the defensible shape — L11/L12).
