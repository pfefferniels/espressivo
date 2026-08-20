# `--noUncheckedIndexedAccess` in `src/mei/**`

Working journal of the pass that cleared the MEI layer under
`--noUncheckedIndexedAccess`. Appended to as the work happened; the counts are
the ones `scripts/strict-ratchet.mjs` reports for `src/mei`.

The rule the pass worked under: an indexed read that the flag types
`T | undefined` gets an *answer*, never a silencer. In falling order of
preference —

1. stop indexing (the loop was an algorithm from `src/prelude/seq.ts` wearing a
   `for`);
2. handle the absence with the option combinators;
3. narrow where the compiler can follow it — destructure, or iterate.

`!` and `as T` are not answers. `src/mei` held the tree's largest concentration
of non-null assertions (544 of 814 when the pass began), so adding to it to buy
a green compiler would have been a net loss.

One constraint shaped nearly every decision: **`@typescript-eslint/no-unnecessary-condition`
is on for `src/` and reads the project `tsconfig.json`, where the flag is
OFF.** So a guard written directly against an indexed read — `xs[i] !== undefined`,
`xs[i] ?? fallback` — compiles clean under the flag and is then deleted by the
linter as provably dead without it. That rules out per-site guards entirely and
is why the leftover genuine random access goes through a *generic* checked
reader: a generic element type is opaque to the rule, so the `??` inside it
survives, and it survives in exactly one place instead of forty.

## Counts

| point | strict errors in `src/mei` | eslint (repo) | `!` in `src/mei` |
| --- | --- | --- | --- |
| start | 67 | 970 | 544 |

## Negative controls

Every load-bearing behavioural change gets one: break it, run the suite, record
what went red. A control that comes back GREEN is the valuable kind — it says
the oracle cannot see the thing, and that is worth more than the change.

### NC-1 — `Mei.computeMinimalPPQ`, the minimum

`return smallest > d ? d : smallest` → `return smallest`, i.e. the fold never
takes the smaller duration and the method always answers 1.

- `npm run gate` (121 byte tests): **GREEN**.
- full `vitest run`: **RED**, 2 tests — `tests/mei/Mei.test.ts > computeMinimalPPQ
  > should compute higher PPQ for shorter note values` and
  `tests/api/pipeline.test.ts > honours ppq as a floor`.

The green half is the finding. The byte fixtures are all converted at
`ppq = 720`, which is finer than anything any of them needs, so `minPPQ` never
wins the `minPPQ > this.ppq` comparison and the whole method is inert on the
byte path. Cross-validation cannot see this function at all; only the two unit
tests can.

### NC-2 — the export-naming rule

`exportName` forced to its indexed arm, so a lone movement is named
`<stem>-0.msm` instead of `<stem>.msm`.

- full `vitest run`: **RED**, 1 test — `tests/api/pipeline.test.ts > sets both
  the relatedResource URI and the comment text from sourceName (§8.4)`.

Only one test covers the singleton/series split, and it covers it through the
MPM metadata rather than directly.
