# meico-ts Idiomatic Refactor — Swarm Charter

Mission: transform meico-ts from a verbatim Java port into clean, idiomatic TypeScript —
locally (code style) and architecturally — while preserving **absolute end-to-end
equivalence** with the Java reference (`/Users/nielspfeffer/Projects/meico`) for the
MEI / MSM+MPM ⇒ expressive MIDI pipeline.

This file is the constitution. Every agent reads it FIRST. All coordination happens
through files in `refactor/` + git history — never through agent memory.

## Non-negotiable invariants

1. **Verify gate**: `npm run verify` (build + full vitest suite) must be green before
   every commit. No exceptions, no `--skip`, no test exclusion.
2. **Ground truth is immutable**: nothing under `tests/integration/fixtures/**` may be
   modified, deleted, or added to (Java-generated references + MEI fixtures). If you
   think a fixture is wrong, STOP and write a `BLOCKED` log entry.
3. **Integration equivalence tests** (`tests/integration/*.test.ts`) may change only
   *mechanically* (imports, renamed API calls). Never weaken normalization,
   assertions, or auto-discovery. Any change there requires explicit verifier
   sign-off with justification logged.
4. **Unit tests** may be rewritten to fit new APIs, but assertion strength must be
   preserved (same behaviors checked, not fewer).
5. **One work item = one commit** on branch `ts-idiomatic`, message
   `refactor(<id>): <title>`. Never commit on `main`.
6. **Red → revert**: if verify is red after ≤2 fix rounds, `git restore .` /
   `git checkout -- .` back to last green, mark the item `blocked` in state.json
   with notes, move on.
7. **Coverage floor**: scoped coverage (vitest.config.ts include list) must not drop
   below the baseline (86% statements) at each phase end.
8. **Java repo is read-only.** Never touch `/Users/nielspfeffer/Projects/meico`.
9. **File deletion**: use `git rm` (never bare `rm`) so deletions are tracked and
   permission-safe.
10. **Formatting commits are separate from logic commits** (T2 may produce a pure
    reformat commit; later items must not mix mass-reformat with logic changes).

## Known parity subtleties (do not "fix" these)

- Java bugs are ported bug-for-bug deliberately (e.g. `AccentuationPatternDef.
  getAccentuationAt` segment-end behavior). Behavior parity beats correctness.
- Imprecision map output is nondeterministic — the suite already handles this;
  never add byte-comparison for it.
- Generated `meico_<uuid>` IDs are canonicalized by the tests; goto→marker wiring is
  verified through that. Keep ID-generation call order stable or tests will tell you.
- Circular-import hazard: importing `GenericStyle.js` deeply throws — import `Mpm`
  first. Eliminating this properly is item T18; until then don't reorder imports
  blindly.
- XML serialization must stay byte-identical after the tests' normalization. The
  XomTypes layer's attribute ordering and namespace handling are load-bearing.

## Roles

- **Conductor** (main session): advances the state machine in `state.json`,
  dispatches workers/verifiers, commits on PASS, reverts on FAIL, keeps itself alive
  via scheduled wakeups. Never edits src/ itself.
- **Worker** (refactor team, fresh agent per item): implements exactly one queue item.
- **Verifier** (testing team, fresh agent per item, independent context): gates the
  worker's output. Adversarial by design — its job is to find reasons to FAIL.
- **Architect** (one-off, item T12): produces `refactor/ARCHITECTURE.md`.

## Context hygiene (by design, not by discipline)

No long-lived agents. Every worker/verifier starts with a fresh context, reads this
charter + its item + the tail of `log.md`, and writes everything the next agent needs
back to disk before finishing. Knowledge lives in: `CHARTER.md` (rules),
`state.json` (queue), `log.md` (journal + handoff notes), `ARCHITECTURE.md` (design,
from T12 on), and git history. If an agent's context degrades, it is killed and the
item re-dispatched fresh — the disk state makes that lossless.

## Worker protocol

1. Read CHARTER.md, your item in state.json, last ~3 entries of log.md, and
   ARCHITECTURE.md if it exists.
2. Implement the item. Stay strictly inside its file scope; if you discover needed
   work outside scope, note it in log.md (`DISCOVERED:` line) instead of doing it.
3. Run `npm run verify`. Fix until green (max 2 rounds).
4. Append a log.md entry: what changed, why, surprises, handoff notes.
5. Final report: `READY <id>` + 5-line summary, or `BLOCKED <id>` + reason.
6. Do NOT commit — the conductor commits after verification.

## Verifier protocol

1. Read CHARTER.md + the item + the worker's log entry.
2. Independently run `npm run verify` (never trust the worker's claim).
3. Review `git diff` (working tree vs last green commit) for:
   a. behavior drift (logic changes hiding inside "style" changes),
   b. test weakening (deleted/loosened assertions, narrowed discovery globs),
   c. invariant violations (fixtures touched, integration tests semantically changed).
4. Spot-check: for risky diffs, write a throwaway probe test in scratchpad (not in
   tests/) exercising old-vs-new behavior.
5. Verdict: `PASS <id>` or `FAIL <id>: <reasons>` + log.md entry.

## Conductor cycle (runs on every wakeup / agent completion)

1. Read state.json. Check running agents (ListAgents / task notifications).
2. If a worker finished READY → dispatch verifier. If BLOCKED → revert tree, mark
   item blocked, dispatch next item's worker.
3. If a verifier said PASS → commit (`refactor(<id>): ...`), update state.json
   (status done, lastGreenCommit), dispatch next item's worker.
4. If FAIL → one fix round: SendMessage the worker with the reasons (its context is
   resumable). Second FAIL → revert, mark blocked, move on.
5. If queue empty in current phase → phase-end audit (coverage vs floor, log review),
   then advance phase. After the final item: write final report, notify user, stop
   scheduling wakeups.
6. Always: update state.json + log.md, then ScheduleWakeup (fallback ~1800s) with the
   conductor prompt. Work serially — one worker in flight at a time (file-cluster
   parallelism only if two items touch provably disjoint files AND both are Phase 2
   local-idiom items).

## Commands

- Verify: `npm run verify` (added in T1; until then `npm run build && npx vitest run`)
- Coverage: `npm run test:coverage` (scoped; see vitest.config.ts include list)
- Reference regeneration: NOT needed for refactoring (fixtures are fixed). Commands
  live in the project memory file `meico-ts-proof-harness.md` if ever needed.
