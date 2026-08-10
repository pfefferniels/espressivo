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
