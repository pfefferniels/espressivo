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

## [infra] conductor — push unblocked, origin in sync (2026-08-08)

User approved pushes (allow rule `Bash(git push origin *)` added to project
settings via the mpm-desk-integration session). Pending pushes flushed:
763546b..b10d1cd on ts-idiomatic. Push-after-verified-commit is now active in
the conductor cycle. Force-push remains disallowed (charter + rule scope).

## [T2] worker

Tooling baseline (ESLint flat config + Prettier), safe auto-fixes, one-time format,
lint-debt inventory, and the tests-typecheck hole closed.

### Config decisions

- **`eslint.config.js`**: flat config, `js.configs.recommended` +
  typescript-eslint `strict` + `stylistic` (**non**-type-checked), `eslint-config-prettier`
  last. Added on top: `eqeqeq`, `no-var`, `prefer-const`, `prefer-template`,
  `explicit-module-boundary-types`, `prefer-for-of`. `tests/**` relaxes
  `no-non-null-assertion` + `explicit-module-boundary-types` only.
- **Type-aware linting deliberately NOT enabled**, but measured (see lint-debt.md):
  4442 violations, 7s wall — the cost objection is not real, only the sequencing one.
  Its most valuable rules (`no-unnecessary-condition` 112,
  `no-unnecessary-type-assertion` 126, `prefer-nullish-coalescing` 75) all depend on
  the null-vs-undefined policy T12 owes. **Recommend switching to the type-checked
  presets in T12/T18.**
- **`eqeqeq` has no `{ null: 'ignore' }` exemption** so every loose comparison stays
  visible in the debt report until T12 rules on null semantics.
- **`npm run lint` is NOT in `npm run verify`** and must not be added until the debt is
  near zero. Verify = `build && typecheck:tests && vitest run`.
- **Prettier**: printWidth 100, tabWidth 2, singleQuote, semi, trailingComma all, LF.
  `.prettierignore` covers `dist/ coverage/ node_modules/ package-lock.json`,
  `tests/integration/fixtures/` (invariant 2) and **`refactor/`** (so `npm run format`
  never reflows this journal).
- **`tsconfig.tests.json`**: `extends` the main config, `noEmit`, `rootDir: "."`,
  includes `src/ tests/ vitest.config.ts`. `declaration`/`sourceMap` off (they conflict
  with `noEmit`). Scripts added: `typecheck:tests`, `lint`, `lint:fix`, `format`,
  `format:check`.

### The tests-typecheck hole was real: 11 latent type errors

`tsc -p tsconfig.tests.json` on the untouched tree failed with 11 errors in 4 files —
the suite has been passing over code that does not typecheck. Fixed minimally
(all type-level, no assertion touched):

- `tests/integration/cross-validation.test.ts` — `beforeAll` used but never imported
  (worked only via `globals: true`). Added to the `vitest` import.
- `tests/integration/performance-equivalence.test.ts` (6) — `parseFloat(x!)` where `x`
  is already `number` (`extractNoteStructure` returns numbers via `normalizeNum`).
  Dropped the redundant `parseFloat`. Identity for every finite number: JS guarantees
  Number→String→Number round-trip fidelity, and NaN/Infinity round-trip too.
- `tests/mpm/elements/AsynchronyMap.test.ts` (3), `RubatoMap.test.ts` (1) —
  `parseFloat(getAttributeValue(...))` where the getter returns `string | null`.
  Added `!` (erased at runtime, zero behavior change).

**Invariant 3 sign-off requested**: two of these files are integration tests. Both edits
are mechanical and assertion-preserving — same comparisons, same tolerances, no
normalization or discovery glob touched. Full formatting-normalized diff of `tests/`
is 37 added / 39 removed lines and contains **zero** assertion changes.

### Auto-fixed vs debt

| | count |
|---|---|
| Violations before | 2104 |
| **Auto-fixed** | **345** |
| **Remaining debt** | **1759** (0 still auto-fixable) |

Auto-fixes were applied through a **temporary scoped config** (`eslint.autofix.config.js`,
deleted after use) enabling exactly five rules, so `--fix` could not touch anything else:
`prefer-template` 189, `no-inferrable-types` 119, `array-type` 14, `prefer-const` 13,
`consistent-generic-constructors` 10.

Four of the five are type-erased and cannot affect runtime. `prefer-template` is the only
one with runtime semantics; cleared three ways: (a) `src/` contains **zero** custom
`valueOf` / `Symbol.toPrimitive`, so `+` and template coercion are identical for every
value in this codebase; (b) all 9 sites where a `+` ended up inside `${...}` correctly kept
the arithmetic (`${i + 1}`, never `${i}1`); (c) only 3 sites produced back-to-back
interpolations, each read and confirmed. All 13 `prefer-const` sites read individually —
all single-assignment locals with initializers.

**Nothing was fixed that could change semantics.** Per the constraint, all 44 `eqeqeq`
were left alone — and ESLint could not have fixed them anyway (its `eqeqeq` fixer refuses
when an operand may be nullish, so `--fix` was never a risk). All 44 turn out to be the
`x == null` idiom and all 44 live in `src/mei/Helper.ts`; not one is a coercive
comparison. Details and the per-item breakdown are in **`refactor/lint-debt.md`**.

### Formatting is provably semantics-neutral

Rather than ask a reviewer to eyeball a 26k-line reformat, this is mechanical:
built `dist/` before and after the prettier pass and compared the emitted JS as **ASTs**
(TypeScript parser, positions/trivia stripped, parens unwrapped, literals compared by
value) — **72 / 72 emitted `.js` files AST-identical**. Byte comparison alone was not
enough: prettier normalized `"` → `'` and removed redundant parens, both of which reach
the emit. Comparator sensitivity was control-tested against the pre-auto-fix build, where
it correctly flagged the 19 files `prefer-template` touched.
Script kept at `<scratchpad>/ast-compare.mjs`; it is reusable for any future
formatting-only commit.

### Files touched

72 `src/` files (all of them) and 44 `tests/` files — formatting only, except the 11 type
fixes above and the 2 restored directives below. New: `eslint.config.js`,
`.prettierrc.json`, `.prettierignore`, `tsconfig.tests.json`, `refactor/lint-debt.md`.
`package.json` gains 5 scripts + 5 devDeps (eslint, @eslint/js, typescript-eslint,
prettier, eslint-config-prettier). `tests/integration/fixtures/**` untouched — verified
directly (`git diff 62c125f -- tests/integration/fixtures/` is empty).

### Surprises

1. **ESLint 9 silently deleted two `/* eslint-disable */` directives.** Under the scoped
   auto-fix config those rules were off, so the directives counted as *unused* and
   ESLint 9 (which reports unused disable directives by default) removed them under
   `--fix`. They live in `src/mei/Mei2MsmMpmConverter.ts` and `src/mpm/Mpm.ts` and were
   hiding 22 `no-explicit-any`. **Both restored** — dropping a suppression changes what
   the lint gate reports, which is not a formatting change. Recorded in lint-debt.md
   instead (real `no-explicit-any` count is 86, not 64). Caught only because the
   before/after rule histograms disagreed by 22; worth remembering that a scoped
   `--fix` config has this side effect.
2. **Prettier was not idempotent on one file.** `tests/integration/performance-equivalence.ts`
   needed a second `--write` to reach a fixed point (a long inline return-type object
   literal). `npm run format:check` is now clean; if a future formatting change reports
   drift immediately after `npm run format`, just run it twice.
3. **`tsc` emit is not formatting-independent** — it preserves much of the source line
   structure, so 69/72 emitted files differed byte-wise after a purely cosmetic change.
   Hence the AST comparison above. Do not use `diff dist/` as a neutrality check.
4. **`src/supplementary/InputStream2StringConverter.ts`** has a lint violation but is
   in neither T4's stated scope nor the coverage include list. Possible T3 deletion
   candidate. DISCOVERED, unresolved.

### ⚠ Coverage: invariant 7's statement floor is no longer comparable — conductor decision needed

`npm run test:coverage` after T2: **85.03 / 85.73 / 94.11 / 85.03**
(baseline was 86.69 / 85.73 / 94.11 / 86.69). Statements/lines are **1.66pp below the
86% floor** in invariant 7.

**No coverage was lost.** Branch (85.73) and function (94.11) coverage are *identical*
to baseline, to the digit, and all 2113 tests still pass. The v8 provider measures
statements/lines by source range, so reflowing 26k lines changes the denominator.

Proven, not asserted: re-ran coverage on the **baseline source formatted with the same
prettier config and nothing else** (no auto-fixes, no type fixes) in a throwaway tree —
**84.88 / 85.73 / 94.11 / 84.88**. Formatting alone accounts for the entire drop; the
auto-fixes actually moved statements *up* from 84.88 to 85.03.

**Conductor: invariant 7 needs re-anchoring before the Phase 1 audit.** Recommend
setting `coverageBaseline.statements`/`lines` to **85.03** and noting that branch and
function coverage are the formatting-invariant comparators (they must stay at 85.73 /
94.11). Leaving the 86.69 figure in `state.json` will fail every future phase-end audit
for a reason that has nothing to do with test quality. I did not edit `state.json` —
that is the conductor's file.

### Handoff notes

- `npm run verify` green: tsc clean, tests typecheck clean, **2113/2113 passing**,
  ~8.0s wall (was 6.6s; the added `typecheck:tests` step is the difference).
- Phase 2 workers: read `refactor/lint-debt.md` **before** starting your cluster — it is
  indexed by item id, and it flags the two things not to bulk-fix
  (`no-non-null-assertion`, `prefer-nullish-coalescing`) plus the 3 `no-fallthrough` in
  `Performance.ts` that may be a real bug rather than style.
- `src/mei/Mei2MsmMpmConverter.ts` carries 555 violations = 32% of all remaining debt.
  T10's "split into ≤3 sub-rounds" note is well founded.
- **586 Java-style `getX()`/`setX()` accessors, 0 native TS accessors** (census in
  lint-debt.md). No lint rule covers this. Because these getters are used pervasively
  *inside* the port, converting them is a whole-tree mechanical change, not a per-item
  one — **T12 should rule on it explicitly, and it may deserve its own item.**
- Run `npm run format` before any commit from here on; `npm run format:check` is the
  cheap guard.

### [T2] addendum — immutable-friendly direction folded in

Steer received after the main T2 work: codify the CHARTER.md immutable-friendly direction
in the style baseline, `no-param-reassign` as WARN not error, no heavy functional-style
plugins, no `readonly` annotation in `src/` (Phase 2/3 work). Done as a config +
documentation change only — **no source file was touched**, so T2 stays a pure
formatting/tooling commit.

- `eslint.config.js`: added `'no-param-reassign': 'warn'` with a comment recording *why*
  it is warn — the charter grants the conversion/rendering core an explicit mutation
  boundary, so some violations are legitimate and T12 must draw that line first.
  **40 warnings, 0 new errors** (error count still exactly 1759), so the rule cannot turn
  lint red on its own. Left at the default `props: false`: `props: true` would flag
  `renderXToMap(map)`-style writes, which are the documented purpose here.
- `refactor/lint-debt.md`: new **"Immutable-friendly direction — measured baseline"**
  section with the 40 warnings by file, plus a preview of three rules that were measured
  and deliberately **not** enabled:
  - `prefer-readonly` **38** (all `src/`) — recommend enabling in Phase 2; private fields
    never reassigned after construction, zero runtime risk, the charter's "free" case.
  - `no-param-reassign { props: true }` **97** (95 `src/`) — the extra 57 are mutations
    *through* a parameter, i.e. the actual "don't mutate inputs" number for T12.
  - `prefer-readonly-parameter-types` **805** (679 `src/`) — do not enable, it would
    drown every other signal.
  Also recorded: the charter's facade "plain data / structured-clone-safe" criterion is
  **not expressible as a lint rule** (no rule distinguishes a `readonly` wrapper around a
  live XomTypes node from plain data), so T13 needs the two behavioural tests the charter
  names instead. Same for "no shared mutable statics" — `no-extraneous-class` (15) is only
  a partial proxy; T12/T21 must audit module-level mutable state by hand.

`npm run verify` re-run after the change: still green, 2113/2113. Prettier clean.

## [T2] verifier

**Verdict: PASS.** Every worker claim independently reproduced; no behavior drift found.

### Gate

`npm run verify` → exit 0. The chain genuinely runs all three stages (echoed by npm:
`tsc` → `tsc -p tsconfig.tests.json` → `vitest run`). **44/44 files, 2113/2113 passed,
0 skipped, 0 todo**, tsc clean at both stages. Confirmed `npm run lint` is **not** in
`verify`, per the worker's sequencing decision.

**The new typecheck gate is real, not decorative** — proved rather than assumed: dropped a
throwaway `tests/__verify_probe__.ts` containing `const n: number = "not a number"`,
`typecheck:tests` failed with TS2322, probe deleted, tree restored (124 entries before and
after). A gate that checks nothing would have passed.

### How the diff was actually reviewed

`git diff --ignore-all-space` is **not** sufficient here and should not be trusted for a
prettier commit: prettier changes line *boundaries*, so whitespace-insensitive diff still
reported 11470/6366 across 106 files. Instead the formatting was cancelled out exactly:
extracted `1c3a44d` via `git archive` into a scratch tree, ran the *same* prettier config
over it, then diffed that against the working tree. What remains is precisely the
non-formatting delta — **472 removed / 370 added lines across 41 src + 11 test files**.
Every one of those hunks was classified and read. (Method is reusable; recommend it for any
future reformat item.)

Classification of the src delta — 100% accounted for, nothing unclassified:

| category | blocks | runtime risk |
|---|---|---|
| `prefer-template` | 180 | only category with any; see below |
| `no-inferrable-types` | 66 | none — annotations are erased |
| `prefer-const` | 13 | none — tsc rejects a wrong one |
| `consistent-generic-constructors` | 11 | none — `Map<K,V> = new Map()` → `new Map<K,V>()` |
| `array-type` | 3 | none — `Array<T>` → `T[]` |

`prefer-template` audited by hand, focused on the 72 blocks where arithmetic sits adjacent
to a concatenation. **Zero re-association bugs**: every rewrite either preserves the
original expression whole inside `${...}` (`${Date.now() - startTime}`, `${staffIdx + 1}`,
`${indent + row}`) or concatenates onto a leading string literal, where `+` was already
string concatenation. Includes the two spots the charter flags as load-bearing —
`meico_repetition_${reps}_${prevId}` ID generation (same string, same call order) and
XomTypes' `` `</${this.getQualifiedName()}>` `` serialization.

### Adversarial checks (things a worker could have hidden)

- **`==` → `===`: zero.** No equality operator appears or disappears anywhere in the real
  diff. Independently confirmed the characterization: all **44** `eqeqeq` violations are in
  `src/mei/Helper.ts` and all 44 match `[!=]= null` — 0 coercive comparisons. Claim holds.
- **No new lint suppressions.** The real diff contains no added *or* removed
  `eslint-disable`. The two directives are byte-identical to `1c3a44d`
  (`Mei2MsmMpmConverter.ts:32`, `Mpm.ts:71`) — the "deliberately restored" claim nets to
  zero, i.e. the debt report is not being flattered.
- **No test weakening.** `vitest.config.ts` is **unchanged** vs baseline, so neither the
  discovery globs nor the coverage include list moved.
- **Fixtures untouched (invariant 2), confirmed twice**: `git diff 1c3a44d --stat --
  tests/integration/fixtures/` is empty, *and* the scratch-tree comparison shows no fixture
  file differing. `.prettierignore` excludes the directory. (Nit: the worker's log cites
  `62c125f` for this check, not the last-green `1c3a44d` — stale hash; re-verified against
  the correct baseline, conclusion unaffected.)
- **File count reconciles exactly**: 119 modified = 72 `src/` + 44 `tests/` +
  `package.json` + `package-lock.json` + `refactor/log.md`; 5 untracked are the new config
  files. No stray edit hiding in the count.

### Invariant 3 — SIGN-OFF GRANTED

Four integration test files carry non-formatting changes (worker's entry names two; the
other two are trivial and were reviewed anyway). All are type-level and
assertion-preserving — **no comparison, tolerance, normalization or discovery glob was
touched**:

- `cross-validation.test.ts` — added `beforeAll` to the `vitest` import. Verified
  `beforeAll` was **already used at baseline (line 65) but never imported**; it only ran
  because `vitest.config.ts` sets `globals: true`. A latent type error the new gate
  surfaced. Import-only.
- `performance-equivalence.test.ts` — dropped `parseFloat` around 6 already-`number`
  values. **Verified at the source, not taken on trust**: `msDate`/`msDateEnd`/`velocity`
  are populated via `normalizeNum()`, which *is* `parseFloat(s)`, so the removed call was a
  double-parse. Identity for all finite numbers (Number→String→Number round-trips exactly)
  and for NaN/Infinity. Surrounding truthiness guards and both `toBeLessThan(1.0)` /
  `(2.0)` tolerances are unchanged.
- `full-xml-equivalence.test.ts` / `midi-byte-equivalence.test.ts` — `tolerance: number =
  0.001` → `tolerance = 0.001` and `tickTolerance: number = 0` → `= 0`. Same default
  values, inferred type identical, zero runtime effect.

### Remaining checks

- **Prettier idempotent**: ran `npm run format` again — `git status` byte-identical before
  and after (hash match). The worker's surprise #2 (needed two passes) is resolved.
- **`refactor/` is prettier-ignored**: `log.md` shows 192 insertions / **0 deletions** —
  appended, never reflowed.
- **lint-debt.md is accurate**: `npm run lint` → `1799 problems (1759 errors, 40 warnings)`,
  an *exact* match to its headline table, not merely within tolerance. ESLint prints no
  "potentially fixable" line, confirming "still auto-fixable: 0".

### Notes for later items (not T2 defects)

1. `src/mpm/{elements/` — an **empty** directory tree (`maps/data}`, `metadata}`,
   `styles/defs}`) left by an old brace-expansion typo. Dated 20 March, i.e. it predates
   both this item and the baseline commit, and it holds no files, so git never tracked it.
   Harmless but confusing when globbing `src/mpm/**`; worth a `rmdir` during T7/T8.
2. The scratch-tree "cancel out the formatting" technique above is the right review tool for
   any future formatting-only commit — noted since T2 is not the last one.
