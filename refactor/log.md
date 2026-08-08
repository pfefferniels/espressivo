# Refactor journal

Append-only. Newest entries at the bottom. Every worker/verifier/conductor action that
matters lands here. Format: `## [<id>] <role> — <headline>` + body.

## [T0] conductor — infrastructure bootstrap (2026-08-08)

- git repo initialized (`main`), .gitignore (node_modules, dist, coverage).
- Baseline verified green before first commit: `tsc` clean, vitest 2113/2113 in 6.87s.
- Charter, state queue (T1–T23), this journal created.
- Work happens on branch `ts-idiomatic`; `main` preserves the verbatim-port state.
- Known stray: empty dir `src/mpm/{elements` (untracked, harmless; user may delete).
- Coverage baseline (scoped, from proof-harness session): 86.69% stmts / 85.73%
  branches / 94.11% funcs.
