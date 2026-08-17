# Performance Comparison — Campaign Charter

Started 2026-08-10. Conductor session. Branch `compare-campaign`, worktree
`../meico-ts-compare`. Record lives in `comparison/` (this dir), following the
`expression/` and `ornamentation/` campaign conventions.

## Mission (user directive, 2026-08-10, verbatim intent)

Extend espressivo with a module for comparing two or more MPM files — i.e.
comparing performances/interpretations. The user's sketch of wants:

- U1: compare two **or more** MPM performances (typically of the same piece).
- U2: something like an **edit distance** — a *real edit path* to get from one
  performance to the other.
- U3: a **sorted** view of where the most major deviations between two
  performances are — paths from A to B ranked by complexity/difficulty/distance.
- U4: distance metrics usable for **clustering/visualization** of
  similarity/dissimilarity across many performances.
- U5: the design must be grounded in **current research interests in
  computational and historical musicology** (performance analysis), with the
  conductor acting as computational/mathematical/algorithmic expert.
- U6: full autonomy, multi-agent, unlimited time budget. No user questions
  mid-campaign; decisions are journaled (LOG.md) before execution, reported
  after (per meico-swarm-governance).

## Standing constraints (inherited from repo governance)

- G1: `npm run verify` green before every commit; fixtures under
  `tests/integration/fixtures/**` are immutable ground truth.
- G2: This is a NEW module (like `expression/`), not a Java port — no Java
  parity obligation, but it must not perturb the ported pipeline. PARITY.md
  untouched unless the ported code is touched (it should not be).
- G3: House API rules (ARCHITECTURE.md): text-in/text-out facade in
  `src/api`, typed errors, no `undefined` in outputs (null for absence), plain-
  data reports, determinism. Interior module in `src/comparison/` (naming TBD
  at design time).
- G4: Zero new runtime dependencies unless journaled with rationale.
- G5: Reuse before reinvention: the expression module's attribute registry
  (scale spaces T with musical neutral points, 82 rows) is the presumptive
  per-attribute metric foundation; the D-A document-handling discipline
  (raw Builder parse, renderer-faithful ordered views, positional style scope)
  is the presumptive reading layer. Divergence from either must be argued.
- G6: One work item = one commit on `compare-campaign`,
  message `feat(comparison): …` / `chore(comparison): …`. Merge to main
  (--no-ff) only after the final audit passes.

## Waves

- W0 — Survey: three parallel surveys (musicology/MIR literature; algorithm
  portfolio; codebase foundations + available MPM corpora) → SURVEY.md.
- W1 — Design: DESIGN.md (semantics, metric definitions, API), then an
  adversarial multi-lens review panel; conductor adjudicates; adjudications
  are binding → REVIEW-FINDINGS.md + LOG entries.
- W2 — Core engine: per-dimension comparison substrate (document reading,
  normalization, per-map instruction alignment, curve/function evaluation).
- W3 — Pairwise products: distance report, edit path, ranked deviation
  segments; facade + typed errors; tests incl. metric-property suite.
- W4 — Corpus products: distance matrix, clustering, low-dimensional embedding
  for visualization; docs + README section.
- W5 — Final audit: adversarial verification of the whole module, lint/
  coverage gates, campaign report, merge.

Wave boundaries may be re-cut by the conductor; re-cuts are journaled.

## Coordination

All coordination through files in `comparison/` + git history, never agent
memory. LOG.md is append-only, newest entry last, every entry dated.
Verification reports are archived verbatim as `W<n>-VERIFICATION.md`.
