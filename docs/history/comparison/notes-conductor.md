# Conductor position notes (pre-survey, 2026-08-10)

Written BEFORE reading the W0 survey deliverables, so that synthesis has an
independent position to test against. Not binding; DESIGN.md supersedes.

## N1. Two comparison levels, both first-class, cleanly separated

- **Semantic (curve) level** — the musicological primary. Each dimension is
  evaluated into a function over score time (per performance, per part where
  applicable); distances are computed between functions. Robust to encoding
  differences: one continuous transition vs. five stepwise instructions that
  trace the same curve must come out near-identical. The user's U3 ("where are
  the major deviations, sorted") lives HERE: a musicologist cares about
  performed difference, not encoding difference.
- **Syntactic (instruction/edit) level** — the user's U2 edit path. Per-map
  date-ordered sequence alignment with typed operations (insert / delete /
  substitute, possibly consolidate / fragment à la Mongeau–Sankoff, since
  "one transition ↔ several steps" is exactly fragmentation). Deliverable is a
  typed edit script with per-op costs, sortable by cost. Useful for editors
  (mpm-desk), encoding forensics, provenance — NOT as the primary
  interpretation distance, because it confounds encoding with performance.

The design must say this explicitly: the two levels answer different
questions and may legitimately disagree (semantically-near, syntactically-far
documents). A test pins that disagreement as intended behavior.

## N2. The metric foundation is the expression registry's T-spaces

Local attribute distance = |T(x) − T(y)| in the row's scale space. This makes
comparison and exaggeration mathematically coherent: exaggeration multiplies
T-values by s, so d(mpm, exaggerate(mpm, s)) should scale predictably with
|s−1| — a cross-module property test that pins both engines at once.
Caveat found by direct reading: transforms.ts exposes only the combined
T⁻¹(s·T(x)) operations, not forward T alone; comparison needs pure forward
maps per scale space (tiny; either new functions in comparison/ or an
extension to transforms.ts — decide at design time; prefer extending
transforms.ts so the bijections live in ONE place).
Level attributes (tempo/dynamics) have a run-time center in exaggeration;
for comparison the center must NOT be pair-dependent per-document normalization
without care — see N5.

## N3. The timing formalization

Each performance induces a monotone time map φ: score ticks → performance time
(tempo ∘ rubato; asynchrony/articulation shift individual onsets). Two views:
- local: instantaneous log-tempo difference ln(bpm_A(t)/bpm_B(t)) — the
  "momentary disagreement" curve; integrates to a timing distance.
- cumulative: φ_A vs φ_B after duration normalization — captures where one
  performance is AHEAD, not just faster; different musical meaning.
Literature (to be confirmed by survey-lit) mostly works with local
(IOI/beat-level tempo); offer local as default, cumulative as an option only
if a concrete question needs it (YAGNI otherwise).

## N4. Exact decomposition is the headline feature

Audio-based comparison cannot decompose a difference by expressive dimension;
MPM comparison can, exactly. Design the aggregate so decomposition is exact:
per-dimension distance = integral over score time of a pointwise deviation
density δ_d(t) ≥ 0; aggregate = Σ_d w_d · D_d. Then
"segment [t1,t2] contributes X% of dimension d's distance, and dimension d
contributes Y% of the total" are exact statements, and the ranked-deviations
view (U3) is just the segments of the density profile ranked by mass.
Both L1 (∫|δ|) and squared-L2 (∫δ²) are additive over time; choose at design
time (L1 more robust/interpretable; L2 peak-emphasizing).

## N5. Normalization discipline (metricity)

- Anything pair-dependent in the metric breaks comparability across a corpus
  matrix (and can break the triangle inequality). Normalization constants are
  design-time data (per-dimension scale constants, documented), or explicit
  corpus-level options — never silently derived per pair.
- PPQ normalization is mandatory before any date comparison.
- Style defs are resolved to numeric values before comparison (two documents
  with different def names but equal resolved values are semantically equal).
- Serialization/canonicalization differences must be invisible:
  d(A, canonicalMpm(A)) = 0 is a pinned property.

## N6. Corpus level

Pairwise per-dimension distance matrices + aggregate matrix; agglomerative
clustering (deterministic tie-breaks, linkage as option) producing a plain-data
dendrogram/merge tree; classical MDS/PCoA embedding via a small deterministic
eigen-solver, with explained-variance + negative-eigenvalue mass reported
honestly. Possibly per-performance "profile" summaries (deviation-from-
corpus-medoid per dimension) for "who is extreme in what" questions.
Clustering/embedding output is DATA; drawing is the consumer's job (mpm-desk /
an artifact demo).

## N7. Structural alignment questions for design

- Part matching between documents (by number? name? count mismatch policy).
- Performance selection (documents can hold several performances) — same
  selector semantics as the expression facade.
- Discrete-event dimensions (ornamentation, asynchrony instructions) need
  event matching (small assignment problem by date + T-space cost), not curves.
- Imprecision maps are distribution-valued: closed-form 1D Wasserstein between
  the distribution families at matched dates.
- Maps absent in one document: the absent side reads as the neutral curve
  (registry neutral), so "A has rubato, B has none" is a REAL distance, not an
  error — and reported as an asymmetry note.

## N8. Properties to pin in tests

- d(A,A) = 0; symmetry bit-exact; triangle inequality sampled on fixture
  triples (per-dimension and aggregate).
- d(A, canonicalMpm(A)) = 0.
- Encoding invariance: transition re-encoded as dense steps → semantic
  distance ≈ 0 (below a documented bound), edit distance large — both pinned.
- Cross-module: d(mpm, exaggerateMpm(mpm, s)) monotone in |ln s| for the
  dimensions exercised; spotlight reduces distance only outside the spotlight
  selection. (Exact scaling laws per scale space where derivable.)
- Determinism: identical inputs → identical bytes of report JSON.

## N9. Consumers to design for

- mpmify: inferred-MPM vs ground-truth-MPM evaluation metric (their loss/QA).
- mpm-desk: side-by-side interpretation comparison UI; edit script could drive
  a "morph A into B" review flow; Welte-Mignon roll interpretation studies.
- mlign: augmentation QA (is the exaggerated sample actually distant?).
- The historical-musicology story (survey-lit to sharpen): comparing rolls /
  schools / eras with dimension-exact attribution is the novel capability.
