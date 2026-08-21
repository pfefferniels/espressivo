# functional-core — shared agent brief

You are one agent in a campaign that is turning `espressivo` (a 61.5k-line TypeScript port of
the Java library *meico*) from Java-in-TypeScript into a functional core with a strong type
system — the standard being roughly "what Sean Parent would sign off on". Read this file
first, then your own charter.

## Where the campaign stands

Eight milestones; seven are landed on branch `functional-core`. `src/prelude/` exists and is
the campaign's vocabulary. The class hierarchies in `src/mpm` are discriminated unions with
dispatch tables. `Mei2MsmMpmConverter`'s eight ambient cursors are one threaded `WalkContext`.
`Performance.perform` is a fold whose stage ordering is enforced by phantom types.
`noUncheckedIndexedAccess` is ON repo-wide for `src/`.

Measured, on this branch versus the branch point:

| axis | before | now |
| --- | --- | --- |
| ESLint findings in `src/` | 1051 | 255 |
| non-null assertions | 841 | ~170 |
| indexed `for (let i = 0` loops | 118 | 65 |
| converter ambient cursors | 8 | 0 |
| tests | 5480 | 6122 |

`src/msm` is now the single worst directory (126 findings, 112 of them non-null assertions).
That is not a coincidence: it is the last layer nobody has touched.

## Non-negotiable invariants

1. **The gate is byte-equivalence with Java.** `npm run verify` (build + `typecheck:tests` +
   `strict:check` + all 6122 tests) must be green before every commit. No exceptions, no
   `.skip`, no narrowing the test selection to make it pass.
2. **Ground truth is immutable.** Nothing under `tests/integration/fixtures/**` may be
   modified, deleted, or added to — those are Java-generated reference bytes. If you believe a
   fixture is wrong, STOP and report it; do not edit it.
3. **Integration equivalence tests** (`tests/integration/*.test.ts`) change only mechanically
   (imports, renamed calls). Never weaken a normaliser, an assertion, or auto-discovery.
   **A normaliser applied to both sides can only ever hide a difference** — this campaign has
   already deleted three that were hiding real divergences from Java. Adding one requires
   explicit sign-off from the conductor with a measured justification.
4. **Unit tests may be rewritten to fit new APIs; assertion strength may not be weakened.**
   Same behaviours checked, not fewer. If a rewrite drops a test, say which and why.
5. **Restructure the data; never the arithmetic.** Floating-point expression shape is
   load-bearing here and the codebase knows it (`bezier.ts`'s header explains why Horner's
   scheme is not equal to the expanded polynomial). Move arithmetic verbatim, character for
   character. If you must move an expression, add a bit-identity probe over ~10^4
   pseudo-random inputs plus a negative control that reassociates it and goes red.
6. **Red → revert.** If verify is red after two fix rounds, `git restore .` back to green,
   report `BLOCKED`, move on. Do not leave the tree red.

## The evidence standard — this is the part that matters

**A green test suite is not evidence that your change is correct. It is evidence only if you
have shown the suite can go red.** For every load-bearing claim you make, run a *negative
control*: deliberately break the thing you are claiming, and prove a test fails.

A control that comes back **green is a finding, not a formality** — it means the oracle has a
gap. This campaign has found ~30 of them that way, including: an imprecision function that
could return `value * 7 + 3` with all 6064 tests green; a Damerau-Levenshtein transposition
rule that could be deleted with 236/236 green; and a `<pedal>` code path with no fixture
coverage at all because no fixture in the corpus contains a single `<pedal>` element. When a
control comes back green, **measure the root cause** and write the test that closes it. Do not
guess at the reason, and do not report it as "probably not covered".

Related, learned the hard way this session: **a plausible explanation that arrives before you
have looked is worse than no explanation.** Six failing assertions were diagnosed as
"concurrent-load timeouts" without anyone reading the test names. All six were real breakage.
Read the actual failure before you theorise about it.

## Working rules

- Branch: work on `functional-core` in your own worktree; one logical change per commit.
- Commit messages are prose, not changelogs. Say what changed, what it bought, what you
  measured, and what you could NOT verify. Negative results belong in the message.
- Fast inner loop: `npm run gate` (4 suites, 121 tests, ~2 s) is the byte-equivalence probe.
  Run the full `npm run verify` before you commit.
- `npm run verify` does NOT check formatting. Run `npx prettier --check .` separately.
- `npm run bench --check` guards the render path; a 137x win on `convertMeiToMsmMpm` was
  bought earlier in this campaign and must not be given back.
- Do not add `!` or `as` to clear a type error. The whole point is that the error is real.
  Every `as` that survives needs a comment naming the proof.
- If a function has zero call sites, delete it rather than porting it — but say in the commit
  message that you looked, and where.
- **Report what you did not do.** Scope you dropped, claims you could not verify, controls
  that came back green and why. A report that is all wins is not trusted.
