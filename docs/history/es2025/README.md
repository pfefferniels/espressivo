# TypeScript 7 and ES2025

Working record of the toolchain bump and the feature-adoption pass that followed it.
Branch `chore/ts7-es2025`, based on `519dc18`.

The pass had two halves, and the second is the one worth reading. Moving the compiler
and the target is bookkeeping. Deciding **which of the newly-legal features this codebase
actually has a site for** — and writing down the ones it does not — is the part that
would otherwise have to be re-derived.

## The toolchain

| | before | after |
| --- | --- | --- |
| compiler | TypeScript 5.7 (JS) | **TypeScript 7.0.2** (native, Go) |
| `target` / `lib` | ES2022 | **ES2025** |
| `module` / `moduleResolution` | ES2022 / bundler | **nodenext** / **nodenext** |
| `engines.node` | `>=18.18.0` | **`>=22.0.0`** |

Three facts about the upgrade that were measured rather than assumed:

1. **It needed zero source changes.** TS 7.0.2 typechecks `src/` clean on the pre-existing
   tsconfig, and again after the ES2025/nodenext switch. Every relative import already
   carried its `.js`, which is what made `nodenext` a no-op to adopt — it only starts
   *checking* what was already true, and it resolves the way Node actually will rather
   than the way a bundler would, of which there is none.
2. **typescript-eslint does not support the TS ≥ 7.0 API** (typescript-eslint#10940). It
   fails loudly at load, not subtly. The 7.0 release notes prescribe installing 6.x
   alongside, which is what `package.json` does:

   ```jsonc
   "@typescript/native": "npm:typescript@^7.0.2",        // npx tsc  -> 7.0.2
   "typescript": "npm:@typescript/typescript6@^6.0.2"    // npx tsc6 -> 6.0.3
   ```

   ESLint resolves `typescript`, gets the 6.0 API, and runs unchanged at its ratcheted 27
   findings.
3. **TS 7 and TS 6 agree exactly on this codebase.** Checked because
   `scripts/strict-ratchet.mjs` shells out to `npx tsc` and scrapes stderr, so a
   formatting change would have silently zeroed it. Both compilers produce byte-identical
   diagnostic formatting *and an identical finding set* — 397 findings under
   `--noUncheckedIndexedAccess` on `tsconfig.tests.json`, same files, same positions, same
   codes. The baseline stayed comparable and did not need re-saving.

   The ratchet was hardened anyway, because that failure mode is real for the *next*
   compiler: a non-zero exit with no parsed lines now throws instead of reporting zero.
   A silent zero reads exactly like a clean sweep, and a `--save` in that state would bake
   an all-zero baseline in.

### Compiler flags

Three came on at **zero measured cost** — `noUnusedParameters`,
`noPropertyAccessFromIndexSignature`, `noUncheckedSideEffectImports`. TS 7 also defaults
`types` to `[]`, which `tsconfig.json` now states explicitly rather than inherits: `src/`
genuinely reaches for no ambient global, and nothing here should be able to acquire one by
having `@types/node` merely present in `node_modules`.

Four stay off, each with its cost written into `tsconfig.json` beside it:

| flag | cost | why not |
| --- | --- | --- |
| `exactOptionalPropertyTypes` | 15 (was 26) | all still option bags forwarded field by field; fixing them means adding `\| undefined` to ~15 declarations, which loosens the types the flag exists to tighten |
| `erasableSyntaxOnly` | 45 | every one is a `constructor(readonly x: T)` parameter property, in 14 files. Clearing them is strictly more code, to buy running `src/` through a type-stripper — and this package ships compiled `dist` |
| `noUnusedLocals` | 1 | `Msm.computeSemicircleCompression` is unused here because it is unused in `Msm.java:846`, and is retained with that note so the trees stay comparable. The flag would force deleting parity evidence |
| `isolatedDeclarations` | 385 | `declaration` already emits them correctly |

## What was adopted, and where

Every one of these replaced something the tree was **already hand-writing**. None was
added to demonstrate a feature.

| feature | edition | sites | what it replaced |
| --- | --- | --- | --- |
| `toSorted` | ES2023 | 10 | `[...filterMap(…)].sort(cmp)`, where the spread existed *only* to produce a mutable array for `.sort` to be legal on |
| `toReversed` | ES2023 | 2 | `[...CONST].reverse()` on the Gauss-Legendre mirrors — copy-then-mutate on a frozen constant |
| `findLast` | ES2023 | 1 | `seq.findLast`'s descending `for` loop |
| `findLastIndex` | ES2023 | 4 | descending `for` loops that each fell out of the bottom onto a hand-seeded `-1`/`0` |
| `Array.prototype.with` | ES2023 | 1 | `const t = [...xs]; t[i] = v;` in the k-medoids swap trial |
| `at(-1)` | ES2022 | 1 | `xs[xs.length - 1]` in `seq.last` |
| `Map.groupBy` | ES2024 | 1 | `seq.groupBy`'s bucket loop |
| `Iterator.prototype.find` | ES2025 | 1 | a `for..of` with a mid-loop `return` over a lazy generator |
| `Iterator.prototype.toArray` | ES2025 | 3 | `[...X.keys()]` |

### The two that are more than a spelling change

**`toSorted` on `ReadonlyArray`.** `src/comparison/msm.ts` carried the reason in a comment:
`filterMap` returns `readonly T[]`, which has no `.sort`, so the tree spelled the sort
`[...filterMap(…)].sort(cmp)` — the array literal existing purely to escape `readonly`.
ES2023 declares `toSorted` on `ReadonlyArray` itself, so the wrapper is gone and the copy
is the sort's own.

The comment counted "~35 sites". That number turns out to be mostly a different thing:
most of those spread a `Set` or a `.values()` iterator, which `toSorted` does not reach and
where the spread is doing real work. The compiler picked them apart — the codemod was
applied to all of them and each rejection put back — leaving 10. Recorded because "~35"
will otherwise read as 25 missed sites.

**`Iterator.prototype.find` on the converter's tie walk.** This is the one feature the
codebase was visibly waiting for. `reverseDescendantElements` is a generator, and the
comment above its call site explains why at length: eager, the search was a
serialise-reparse-sort of the whole accumulated score once per tied note. Lazy, it stops at
the first hit. But *consuming* it still meant a hand-written `for..of` with a `return` in
the middle — because before the iterator helpers, every array method meant materialising
the sequence first, which is the exact cost the generator exists to avoid. `find` pulls one
element at a time and stops at the first hit.

Not a new algorithm: permission to use a known one on a sequence the codebase had
deliberately refused to materialise.

### The `findLastIndex` four, and why they are on-philosophy

`docs/history/strict/mei.md` sets a preference order for an indexed read: **stop indexing**
first, options second, narrowing third — `!` and `as T` never. Each of these four deletes
an `elementAt` checked read *because it deletes the index being checked*, reaching the top
of that order via the platform rather than via a prelude algorithm.

Two of them (`GenericMap.insertionIndexFor`, `expression/datedView.ts`) carry a comment
insisting the scan is deliberately **linear from the end and not a bisection**, because
`parseFloat` answers NaN for a malformed `@date`, NaN compares false against everything,
and the resulting order is serialized. `findLastIndex` *is* linear-from-the-end, so the code
now says what the comment says, and `-1 + 1 === 0` is the same front-insertion the
fall-through produced.

`AccentuationPatternDef.addAccentuationToArrayList` is the one whose result is
byte-visible, flagged as such by the fix-bugs session. It got a differential check rather
than an argument: 200 000 random insertion sequences over that method's exact shape,
lengths 0–8, drawn from a pool containing `NaN`, `+0`, `-0`, `±Infinity` and duplicate
keys, comparing old loop against new on both the resulting array (by `Object.is`, so `-0`
and `+0` cannot pass for each other) and every returned index. Zero mismatches. (`Object.is`
rather than `===` is load-bearing: a `-0`/`+0` divergence passes `===` silently.)

**The distinction that makes all four of these safe, and that is easy to get wrong.** The
hazard in this neighbourhood is **linear scan vs binary search** — not hand-rolled vs
library. One `NaN` in the array breaks the ordering `partitionPoint`'s invariant needs, so a
bisection can split where the linear scan simply walks past (`x >= NaN` is false, so the scan
keeps going left). That is the divergence the docstrings defend against, and it is
byte-visible because the order is serialized.

`findLastIndex` is the *same linear backwards scan* — same direction, same predicate, same
four boundary cases. Replacing one of these scans with `partitionPoint`, `upperBoundBy` or
`insertionIndexBy` is a different and **not** safe change, and remains off-limits without
regeneration and a parity ruling. Tracked as issue #8, where the better question is also
recorded: whether `NaN` should reach that array at all, given `parseJavaDouble` accepts the
literal `NaN` exactly as `Double.parseDouble` does. Settling that removes the hazard rather
than documenting it.

## What was looked for and is deliberately absent

This half exists so the next person does not go looking again, or worse, manufactures a
call site to justify a feature.

- **`Set.prototype.union` / `intersection` / `difference` / `isSubsetOf` / `isDisjointFrom`
  (ES2025)** — no site. Every candidate is `array.filter(v => set.has(v))`: the receiver is
  an **array** and the caller wants array order back. A `Set` method would change the result
  type and lose the ordering, to buy nothing.
- **`Promise.try` (ES2025), `Promise.withResolvers` (ES2024), `Array.fromAsync` (ES2024)** —
  no site, and there cannot be one: `src/` contains no `new Promise`, no `async` and no
  `await`. The library is entirely synchronous.
- **RegExp `v` flag (ES2024), duplicate named capture groups (ES2025), `RegExp.escape`
  (ES2025)** — no site. Every regex in `src/` is trivial ASCII (`/\s+/`, `/#/g`, the XML
  entity escapes, `/[fFdD]$/`), there are no named groups, and there is no `new RegExp` at
  all. `RegExp.escape` is also not in Node 23.8.
- **`Object.groupBy` (ES2024)** — no site; every `reduce` in the tree is a numeric sum, not
  a grouping. `Map.groupBy` has the one grouping there is.
- **`Float16Array` / `Math.f16round` (ES2025)** — no site, and not in Node 23.8 either.
- **Import attributes (ES2025)** — no JSON or CSS import in `src/`.
- **`toSpliced` (ES2023)** — no site; the tree's 32 `.splice` calls all mutate on purpose.
- **`using` / `await using` (TS 5.2)** — no disposable resource. No file handles, no sockets.

## What was measured

`scripts/bench.mjs`, A/B on one machine, base `src/` vs new `src/` on the identical TS 7
build, interleaved to expose drift: **no detectable change.** Totals ran 33.5–43.2 ms for
the new tree and 34.2–56 ms for the base, which is the same distribution — the spread is
machine load, not code. `Map.groupBy` was microbenchmarked separately against the loop it
replaced, at 200 000 elements over 997 keys, and is *faster* (4.2 ms vs 4.9 ms median).

A cautionary note for anyone reading a bench number off this branch: an early run reported
**+298% and REGRESSED across every fixture**, at a moment when the machine's load average
was 42. The same code at normal load reported −9%. `scripts/bench.mjs`'s own header says it
is not a unit test and flaps under load; that is not a hedge. The vitest
`Timeout calling "onTaskUpdate"` errors are the same phenomenon — identical code produced 2
on one run and 4 on the next.

## Verification

`npm run gate` (121 byte-equivalence tests against the Java reference) and the full suite
(6280) are green at every commit on the branch. No MIDI byte moved, which is the property
that matters: this pass was required to be entirely byte-neutral, and every commit was
checked against the Java-generated fixtures rather than against itself.
