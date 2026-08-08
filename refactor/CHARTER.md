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
7. **Coverage invariant, v3** (2026-08-08; supersedes the ratio floor — rationale in
   [T3] verifier entry pt. 4 + [T3] correction). Ratio floors punish honest
   deletions and honest code-shrinking rewrites, so the phase-end audit checks:
   a. **Functions ≥ 94.0%** (bit-stable, format-insensitive anchor).
   b. **Uncovered scoped statements must not grow** beyond the phase-start count
      + 25 budget without per-hunk journaled justification (catches new
      unexercised code and lost test power; immune to deletions and shrinkage).
   c. **Test count decreases only with journaled justification** (tests of removed
      behavior; never weakened tests of kept behavior).
   d. Statements% and branch% are reported as indicators only (branch has ±0.02
      RNG run-noise; line-derived metrics rebase on mass reformats by construction).
   The conductor records phase-start counts in state.json at each phase start.
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

## Design direction: immutable-friendly (user directive, 2026-08-08)

The refactored codebase should be friendly to immutable usage patterns. Pragmatic
reading — equivalence still beats purity:

- **Type-level immutability everywhere it's free**: `readonly` fields/properties,
  `readonly T[]` / `ReadonlyMap` in signatures that don't mutate, `as const` for
  static data tables (e.g. InstrumentsDictionary), tuples over mutable pairs.
  These are zero-runtime-risk and belong in Phase 2 items already.
- **Don't mutate inputs**: functions must not modify their arguments unless
  mutation IS their documented purpose (e.g. rendering maps into an MSM). Public
  API (T13 facade): inputs treated as immutable, outputs freshly created, no
  internal mutable state leaked.
- **No shared mutable statics/singletons** in the target architecture.
- **Explicit mutation boundaries**: the XML document tree (XomTypes) is inherently
  mutable and load-bearing for parity — do NOT force persistent data structures on
  it. Instead, ARCHITECTURE.md (T12) must define WHERE mutation is allowed (the
  conversion/rendering core) and keep everything outside those boundaries
  immutable-friendly.
- **No allocation-heavy immutability in hot rendering loops** if it risks behavior
  or serious perf drift; note such spots in log.md instead.
- **Facade outputs are plain data — this is the acceptance criterion, not just
  `readonly`.** The T13 facade's model surface (notes, maps, instructions —
  whatever downstream apps consume) must be plain, JSON-serializable,
  structured-clone-safe values. The two concrete tests: (a) a facade return value
  survives `postMessage` to a Web Worker; (b) change produces a new value, so
  React-style referential-equality memoization works. A `readonly` wrapper around
  a live XomTypes/XML node fails both and does NOT satisfy this directive. XML is
  an interior representation, entered and exited only at parse/serialize
  boundaries; XomTypes types must never appear in a facade signature. (Why: the
  downstream plan is to migrate mpm-desk off mpm-ts onto this facade — that only
  works if the model layer is plain data.)

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

## Agent craft notes (hard-won, follow them)

- The session scratchpad is SHARED by all swarm agents. Always use an item-unique
  subdirectory (`t7base/`, `t9verify/`, …); `git archive` over an existing dir
  MERGES silently. Verify extracted baselines with
  `git show <sha>:<path> | diff - <scratch>/<path>` spot checks.
- `cd` persists across a compound bash command — a later stage can silently run in
  the wrong tree. Prefer absolute paths or `(cd … && …)` subshells for per-tree
  build/diff work.
- Redirecting output into a directory created in the SAME parallel tool batch
  (`mkdir X` + `cmd > X/log`) races — the command can silently run nothing while
  reporting exit 0. Create directories in a prior step.
- Emitted-JS diffing (build both trees, diff dist/) is the standard evidence for
  "type-level only" claims; pipeline byte-probes (fixtures → MSM/MPM/MIDI hashes
  on both builds) are the standard evidence for serialization/rendering claims.
  Reusable probes live in the scratchpad (t5verify/probe.mjs, probe2.mjs — take a
  dist dir as argv[1]). For "comments-only" claims, t8verify/toks2.mjs emits a
  JSDoc-pruned token stream — a 0-line token diff is proof that survives
  reformatting; better than prettier-cancellation for comment-heavy diffs.
- Per-file BRANCH coverage deltas in untouched files are NOT a signal: two coverage
  runs on an identical tree move ~4 files' branch totals (proven in [T8] verifier).
  Only statement/function movements in files you touched are evidence.

## Worker protocol

1. Read CHARTER.md, your item in state.json, last ~3 entries of log.md, and
   ARCHITECTURE.md if it exists.
2. Implement the item. Stay strictly inside its file scope; if you discover needed
   work outside scope, note it in log.md (`DISCOVERED:` line) instead of doing it.
3. Run `npm run verify`. Fix until green (max 2 rounds).
4. Append a log.md entry: what changed, why, surprises, handoff notes.
5. Final report: `READY <id>` + 5-line summary, or `BLOCKED <id>` + reason.
6. Do NOT commit — the conductor commits after verification.
7. **TREE FREEZE after READY**: once you have reported READY, you may not touch the
   working tree again — no edits, no "one more improvement", not even reversing your
   own earlier call. If you realize something after READY, SendMessage the conductor
   and wait; unreviewed post-READY edits poison the verified commit (this happened:
   see the [T3] correction entry).

## Verifier protocol

1. Read CHARTER.md + the item + the worker's log entry.
2. Independently run `npm run verify` (never trust the worker's claim).
3. Review `git diff` (working tree vs last green commit) for:
   a. behavior drift (logic changes hiding inside "style" changes),
   b. test weakening (deleted/loosened assertions, narrowed discovery globs),
   c. invariant violations (fixtures touched, integration tests semantically changed).
4. Spot-check: for risky diffs, write a throwaway probe test in scratchpad (not in
   tests/) exercising old-vs-new behavior.
   For reformat-heavy diffs, `--ignore-all-space` is NOT sufficient (prettier moves
   line boundaries): cancel formatting exactly instead — `git archive` the base
   commit into a scratch tree, run the same prettier config over it, diff that
   against the working tree, then classify every remaining hunk (see [T2] verifier
   entry for the worked example).
5. Verdict: `PASS <id>` or `FAIL <id>: <reasons>` + log.md entry.

## Conductor cycle (runs on every wakeup / agent completion)

1. Read state.json. Check running agents (ListAgents / task notifications).
2. If a worker finished READY → dispatch verifier. If BLOCKED → revert tree, mark
   item blocked, dispatch next item's worker.
3. If a verifier said PASS → **first reconcile the manifest**: `git status
   --porcelain` must match the file set the verifier's log entry reviewed (same
   paths, same counts; refactor/ bookkeeping excepted). ANY unexplained delta →
   do not commit; dispatch a delta review instead. Then commit (`refactor(<id>): ...`), push
   (`git push origin ts-idiomatic`), update state.json (status done,
   lastGreenCommit), dispatch next item's worker. Push only after a verified
   commit — never push an unverified working tree, never force-push. If the
   push fails (offline, auth), log it and continue; retry on the next cycle.
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

- Remote: `origin` → github.com/pfefferniels/espressivo. Push `ts-idiomatic`
  after every verified commit (conductor cycle step 3). Only the conductor
  pushes — workers and verifiers never do.
- Verify: `npm run verify` (added in T1; until then `npm run build && npx vitest run`)
- Coverage: `npm run test:coverage` (scoped; see vitest.config.ts include list)
- Reference regeneration: NOT needed for refactoring (fixtures are fixed). Commands
  live in the project memory file `meico-ts-proof-harness.md` if ever needed.
