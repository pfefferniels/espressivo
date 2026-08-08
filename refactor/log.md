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

## [T1] worker — baseline metrics (2026-08-08)

Added `"verify": "npm run build && vitest run"` to package.json scripts. That is the
only change; `refactor/state.json` was already dirty from the conductor marking T1
`in_progress`, and untracked `.claude/` predates this item.

**Verify gate is green.** `npm run verify` → tsc clean, 2113/2113 passing.

Test suite
- 44 test files / 2113 tests, all passing, 0 skipped.
- Split: 6 integration files / 251 tests (`tests/integration`), 38 unit files /
  1862 tests.
- Suite runtime: 4.8s wall for `vitest run` alone (vitest self-reported 3.9s;
  it reports the parallel wall clock, so the internal `collect`/`tests` figures
  ~9s/7s are summed across workers — don't compare those against wall time).
- Integration subset alone: 1.7s wall.

Build (tsc)
- Clean build (`rm -rf dist && tsc`): 1.70s / 1.77s on warm runs, 2.96s on the first
  cold run. 72 source files, 26 579 LOC in `src/`, 72 emitted `.js`.
- No `incremental`/tsbuildinfo in tsconfig.json, so every build is a full build —
  these numbers stay comparable for the whole refactor.

`npm run verify` end to end: **6.6s** wall (build + suite).
`npm run test:coverage`: 6.5s wall.

Scoped coverage (vitest.config.ts include list) — **the baseline for invariant 7**:

| Statements | Branches | Functions | Lines |
|---|---|---|---|
| 86.69% | 85.73% | 94.11% | 86.69% |

This reproduces the T0 figures exactly. Per top-level dir: `src/mei` 70.51 stmts (the
weakest, and the largest cluster — relevant to T10/T14/T15), `src/mpm` 82.65,
`src/xml` 92.51, `src/midi` 96.36, `src/msm` 97.12, `src/supplementary` 97.59.

Surprises / handoff notes
- **Per-directory branch coverage is mildly nondeterministic** across runs (e.g.
  `src/supplementary` 88.57 vs 88.40, `src/mpm/elements` 91.93 vs 91.36) — expected,
  `RandomNumberProvider` takes different branches per run. The **`All files` row was
  identical across three consecutive runs** (86.69 / 85.73 / 94.11 / 86.69), so the
  coverage-floor gate is safe to evaluate on the top-line only. Do not gate on a
  per-file/per-dir branch delta of a few tenths — that is noise, not regression.
- Two tests intentionally print to stderr on the happy path (`XmlBase.test.ts`
  "Empty document, cannot export.", `DynamicsMap.test.ts` "Cannot add dynamics,
  volume not specified.") and one logs a `processTicksAndRejections` stack. These are
  expected output from passing tests, not failures — don't "fix" them.
- Timings above are wall-clock on this machine under a normal load; treat the T23
  perf smoke as a sanity check for order-of-magnitude drift, not a strict budget.

## [T1] verifier — PASS (2026-08-08)

Independently re-ran everything; did not trust the worker's numbers.

- `npm run verify`: green. `tsc --noEmit` exit 0, no diagnostics. 44 files /
  2113 passed / 2113 total, 0 skipped.
- `npm run test:coverage` reproduces the baseline **exactly**: 86.69 / 85.73 /
  94.11 / 86.69. Matches `coverageBaseline` in state.json, so invariant 7 is
  anchored to a number I confirmed rather than an asserted one.
- Every other factual claim in the worker entry re-measured and correct: 72 source
  files, 26 579 LOC, 72 emitted `.js`, 6 integration files / 251 tests (so 38 unit
  files / 1862 tests), no `incremental`/`tsBuildInfoFile` in tsconfig.json.

Diff review vs 62c125f: exactly the three expected paths. `git diff 62c125f --
src/ tests/` is **empty**, so fixtures (invariant 2) and integration tests
(invariant 3) are untouched — verified directly, not inferred. package.json is a
one-line script addition; log.md is 50 insertions / 0 deletions (append-only held);
state.json is conductor bookkeeping only. No behavior drift, no test weakening.

**Adversarial spot-check — does the gate actually gate?** T1's whole deliverable is
the gate, so a `verify` that passes on a broken build would be worse than no gate.
Wrote a throwaway `src/__verify_probe__.ts` with a deliberate TS2322, ran
`npm run verify`: exit **2**, tsc reported the error, and **vitest never ran** —
`&&` short-circuits as intended. Probe and its `dist/` output removed; tree
re-verified green afterwards (2113/2113) and `git status` is back to the three
expected modifications.

DISCOVERED (not T1's problem, for a later item):
- `tsconfig.json` is `include: ["src/**/*"]`, `exclude: [..., "**/*.test.ts"]`, so
  the build step **does not typecheck test files**. The gate is real for src/, but
  from T4 onward ("unit tests adapted") a type-level breakage in a test can only
  surface as a vitest runtime failure, never as a tsc error. Worth folding into T2
  (lint over tests/) or T22.
- `.claude/scheduled_tasks.lock` (conductor wakeup bookkeeping) is untracked and
  **not** in .gitignore. Harmless now, but it would be swept into any future
  `git add -A`. Recommend adding `.claude/` to .gitignore.

## [infra] conductor — remote + push policy adopted; push blocked in this session (2026-08-08)

- Verified peer-session infra: `origin` = github.com/pfefferniels/espressivo, main +
  ts-idiomatic pushed and tracking; foreign commit 763546b touches only refactor/
  coordination files (charter steer edits incl. facade-plain-data acceptance).
- Bookkeeping committed (658b244): lastGreenCommit=763546b, espressivo rename queued
  into T22, plain-data acceptance mirrored into T13 details.
- `git push` is DENIED for this session by the permission classifier (tried twice:
  combined and standalone). Per push policy: logged, will retry next cycles.
  PENDING PUSH: ts-idiomatic is ahead of origin from 658b244 onward. Surfaced to
  user: they can allow `Bash(git push origin *)` in permissions, push manually, or
  pushes happen via the session that owns that capability. Never ask a peer to push
  what this session was denied (permission laundering).
