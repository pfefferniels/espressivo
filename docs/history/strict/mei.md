# `--noUncheckedIndexedAccess` in `src/mei/**`

Working record of the pass that cleared the MEI layer under
`--noUncheckedIndexedAccess`: 67 errors to 0, in two commits, with no non-null
assertion added anywhere. The counts are the ones `scripts/strict-ratchet.mjs`
reports for `src/mei`.

The rule the pass worked under: an indexed read that the flag types
`T | undefined` gets an *answer*, never a silencer. In falling order of
preference —

1. stop indexing (the loop was an algorithm from `src/prelude/seq.ts` wearing a
   `for`);
2. handle the absence with the option combinators;
3. narrow where the compiler can follow it — give the value a type that carries
   its own length, destructure, iterate.

`!` and `as T` are not answers. `src/mei` held the tree's largest concentration
of non-null assertions (544 of 814 when the pass began), so adding to it to buy
a green compiler would have been a net loss.

## The linting constraint, which shaped nearly every decision

**`@typescript-eslint/no-unnecessary-condition` is on for `src/**` and reads the
project `tsconfig.json`, where the flag is OFF.** A guard written directly
against an indexed read — `xs[i] !== undefined`, `xs[i] ?? fallback` — therefore
compiles clean under the flag and is then deleted by the linter as provably dead
without it. That rules out per-site guards entirely, and it is why the leftover
genuine random access goes through the *generic* checked reader in
`src/mei/indexing.ts`: a type parameter is opaque to the rule, so the `??`
inside `elementAt` survives, and it survives in one place instead of nine.

The rule is not uniformly conservative about type parameters, either. `xs[i] ??
…` on a `T extends NonNullable<unknown>` passes; `const x = xs[i]; if (x !==
undefined)` on the same `T` is reported as "the types have no overlap". So the
helper's own body reads through `elementAt` rather than guarding.

## Counts

| point | strict errors in `src/mei` | eslint (repo) | `!` in `src/mei` | `!` in `src`|
| --- | --- | --- | --- | --- |
| start | 67 | 970 | 544 | 814 |
| after `1a32011` | 57 | 966 | 537 | 807 |
| after `eb4ad80` | 0 | 959 | 535 | 805 |

Twelve sites became an algorithm; four narrowed in place; nine now read through
`indexing.ts`. Nothing was left failing.

Measurement of the `!` counts is `grep -rEho '[A-Za-z0-9_$)\]]!($|[^=])'` over
`--include='*.ts'`, which is one higher than the campaign's own figure for this
directory (544 against 543); the discrepancy is a constant, so the deltas hold.

## Performance

`scripts/bench.mjs --check` was unusable while this ran: several agents share
this box and the load average sat above 50 on 8 cores, so wall-clock medians
flapped by ±25% *including on stages this pass did not touch* (`render`
"regressed" in one run, and no line of `src/midi` was edited). Three consecutive
`--check` runs on identical code gave REGRESSED / no regression / REGRESSED.

What was used instead: an **interleaved A/B** of two built dists in one process,
alternating which arm goes first per round, measuring `process.cpuUsage()` rather
than wall time, median of 21 rounds. It found a real regression the noisy tool
could not have distinguished, and then confirmed its removal:

| case | first attempt | after the two reverts below |
| --- | --- | --- |
| synthetic 2000 notes | 1.135 | 0.969 |
| synthetic 2000 notes, tupleted | 1.036 | 0.979 |
| comprehensive.mei | 0.911 | 0.917 |
| keys_accidentals.mei | 1.028 | 1.021 |

The cause was per-element allocation on the converter's two hottest paths, and
two loops of the `findLast` shape are therefore deliberately **not** written with
it:

- `getEndid` runs for *every element of the score* (`convertElement` calls
  `checkEndid` before dispatch), so a `findIndex` predicate is one closure per
  element;
- `computeDuration`'s tuplet-span scan runs for every note, so `for..of` over a
  reversed array is one iterator per note.

Both keep an index walk and read through `elementAt`. The third `findLast` site —
the accidental lookup in `computePitch` — also runs per note and measured free,
so it stays a search. `src/mei/indexing.ts` carries this reasoning next to the
function.

The stated bench gate was run once the box quietened (1-minute load average
under 6): **no regression** — real fixtures at −8% TOTAL, the 2000-note synthetic
convert at 65.1 ms against a 75.4 ms baseline, and both µs/note columns holding
flat at ×1.2 across 250→2000 notes.

Worth knowing for whoever runs it next: the synthetic block of `bench.mjs` times
each size **once** (`timeMs(f, 1)`), where the fixture block takes a median of
three. Under any load at all the single sample is the noisiest number the script
prints, and it is also the one that decides the SUPERLINEAR verdict — two runs
ten minutes apart on this same commit gave "×2.7 SUPERLINEAR" and "×1.2 linear
enough". Re-run it before believing it.

## Negative controls

Every load-bearing behavioural change gets one: break it, run the suite, record
what went red. A control that comes back GREEN is the valuable kind — it says the
oracle cannot see the thing, and that is worth more than the change that
prompted it.

`gate` is `npm run gate`, the 121 byte tests; `full` is the whole 6038-test
suite. Controls green at the gate were re-run in full.

| # | what was broken | gate | full |
| --- | --- | --- | --- |
| NC-1 | `computeMinimalPPQ`'s minimum: the fold never takes the smaller value | GREEN | RED (2) |
| NC-2 | export naming forced to its indexed arm (`x-0.msm` for a lone movement) | — | RED (1) |
| NC-3 | the `tstamp2` filter drops the entries it has just counted down | GREEN | **GREEN** |
| NC-3b | the `tstamp2` filter never resolves anything at all | — | RED (6) |
| NC-4 | the dynamics/tempo predecessor search takes the wrong side of `startDate` | RED (15) | — |
| NC-5 | the circle-of-fifths pair destructured `[name, pitch]` | RED (16) | — |
| NC-6 | the slur `plist` walked forwards, so the UUIDs are drawn in the other order | GREEN | **GREEN** |
| NC-7 | the tuplet-span scan walked forwards | GREEN | **GREEN** |
| NC-8 | `getOneMeasureLength` destructures the time signature the wrong way round | GREEN | RED (1) |
| NC-9 | `checkEndid` resolves only the first parked span per element | GREEN | **GREEN** |
| NC-10 | `processLayer`'s maximum defeated: sibling layers never raise the date | GREEN | **GREEN** |
| NC-11 | `mpmPostprocessingSingle` skips the last part | RED (7) | — |
| NC-12 | `processChoice`'s preference order reversed | GREEN | **GREEN** |
| NC-13 | `getEndid` always misses | RED (6) | — |
| NC-14 | the **local** measure time-signature rewrite uses the numerator as the denominator | GREEN | **GREEN** |
| NC-14b | the **global** one, same break | — | RED (3) |
| NC-15 | the ending number taken as the *last* integer in the label | GREEN | **GREEN** |
| NC-15b | the ending number never read at all (always 0) | — | **GREEN** |
| NC-16 | `computePitch`'s `[pitchname, accidental, octave]` permuted | RED (32) | — |
| NC-17 | the accidental search ignores pitch and octave | RED (8) | — |

### What the eight green controls say

Eight breaks the whole suite cannot see. None of them is a defect introduced
here — every one is a rewrite that provably preserves behaviour — but each names
a piece of the converter that no oracle covers, and that is what makes them worth
recording.

**NC-3 / NC-3b — the multi-measure `tstamp2` countdown is uncovered.** A parked
`tstamp2` is only parked when its measure count is 2 or more; NC-3b shows the
*resolving* branch is covered (`tempo_dynamics_spans` reds), NC-3 shows that
dropping every entry that still has measures to go is invisible. So no fixture
carries a `tstamp2` spanning more than one measure boundary, and the countdown
arm — the reason `tstamp2s` exists as a deferred list at all — is never exercised.

**NC-6 — the slur `plist` UUID draw order is uncovered.** The campaign brief
names `addSlurId`/`processNote` ordering as fixture-visible, and it is, but *not*
this loop: no fixture has a slur with a `plist` of three or more elements
carrying an `xml:id`, which is the only case where the direction changes which
note keeps the original id and which get `_meico_<uuid>` suffixes. The reverse
walk is preserved anyway; it just is not defended.

**NC-7 — the tuplet-span scan direction is uncovered.** Reversing it changes the
order of a floating-point multiplication chain, so it can only show up when two
tuplet spans are in force at once. No fixture nests tuplets.

**NC-9 — one `endid` per element is all any fixture needs.** No fixture has two
parked spans ending on the same note, so the loop in `checkEndid` — as opposed to
a single lookup — is undefended.

**NC-10 — layers of unequal length are uncovered.** `processLayer`'s maximum over
sibling layers' `currentDate` only matters when the layers of one staff end at
different dates. Defeating it entirely changes nothing, so no fixture has a staff
whose voices disagree about where the measure ends. This is the one worth a test.

**NC-12 — `choice` is uncovered.** Reversing the whole preference order
(`corr reg expan subst choice orig unclear sic abbr` becomes its mirror) changes
nothing, so no fixture contains a `<choice>` with more than one candidate child.

**NC-14 vs NC-14b — the *local* measure-length repair is uncovered, the global
one is not.** When a measure's real length disagrees with its time signature, the
converter rewrites the signature at that date and switches back after. NC-14b
reds on `rests_meters`, so the global map's rewrite is defended; NC-14 is green,
so the per-part arm — reached only when a *part* has its own `timeSignatureMap`
whose default measure length differs from the longest part's — is not.

**NC-15 / NC-15b — ending numbering is uncovered.** `extractAllIntegersFromString`
reduces `"1."`, `"1, 2"` and `"1-2"` to their first integer, and that number
decides the order of the `goto`s at one date. Replacing it with a constant `0`
changes nothing, so the `repeats_endings` fixture's voltas must already be in the
order their numbers would have produced.

**NC-8 is the near miss.** Swapping numerator and denominator in
`getOneMeasureLength` is invisible to all 121 byte tests and reds exactly one
test in the whole suite — `tests/comparison/readmeRecipes.test.ts`, a cookbook
example three layers above this code. The MEI byte suites do not reach
`getOneMeasureLength`.
