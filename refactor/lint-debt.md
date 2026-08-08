# Lint debt (as of T11)

> Updated after **T11** (midi cluster). Counts below are the *current*
> `npm run lint` output; the T2 baseline is kept in the headline table for comparison.

Snapshot of every ESLint violation left in the tree after T2's safe auto-fixes, grouped by
the Phase 2/3 item that owns the files. This is **input for those items**, not a to-do list
for anyone else: each item pays down its own cluster as part of its normal work.

Config: `eslint.config.js` — typescript-eslint `strict` + `stylistic` (non-type-checked),
plus `eqeqeq`, `no-var`, `prefer-const`, `prefer-template`,
`@typescript-eslint/explicit-module-boundary-types`, `@typescript-eslint/prefer-for-of`,
and `no-param-reassign` (warn). Reproduce with `npm run lint`.

**`npm run lint` is not part of `npm run verify`** and must not be added to it until this
debt is near zero — a red gate that everyone learns to ignore is worse than no gate.

## Headline numbers

| | count | after T3 | after T4 | after T5 | after T6 | after T7 | after T8 | after T9 | after T10 | after T11 |
|---|---|---|---|---|---|---|---|---|---|---|
| Violations before T2 | 2104 | | | | | | | | | |
| Auto-fixed in T2 (semantics-preserving only) | 345 | | | | | | | | | |
| **Remaining debt (errors)** | **1759** | **1437** | **1437** | **1431** | **1389** | **1368** | **1347** | **1336** | **1306** | **1294** |
| `no-param-reassign` warnings (separate, see below) | 40 | 35 | **30** | 30 | **28** | **20** | 20 | **18** | 18 | **5** |
| Files affected (≥1 error) | 90 of 118 | 81 of 105 | 81 of 105 | 81 of 105 | 75 of 105 | 75 of 105 | 75 of 105 | 75 of 105 | 75 of 105 | **74 of 105** |
| Still auto-fixable | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |

> The T8 and T9 columns were added in T9; before that the table stopped at T7 while the
> prose below already carried the T8 numbers. Both columns are measured with
> `eslint -f json` over `src/**` + `tests/**` on a `git archive` of the respective tree,
> splitting errors from warnings (they are reported together, which has misled two
> earlier entries).

T11 cleared 12 of the midi cluster's 33 errors (33 → 21) and **all 13 of its warnings**
(13 → 0), which is 13 of the 18 left in the whole tree. Measured: **1299 problems (1294
errors, 5 warnings)**. It reconciles exactly — errors −12, warnings −13, and the per-file
comparison over the whole repo shows movement in **exactly the four cluster files**:
`Midi.ts` 23+3w → 14, `MidiTypes.ts` 6+3w → 6, `EventMaker.ts` 3+7w → 1,
`InstrumentsDictionary.ts` 1 → **0**. One file reached zero, so "files affected" drops
75 → 74 for the first time since T6. **`prefer-for-of` is now at zero repo-wide** — the
third rule fully retired rather than deferred, after `no-this-alias` (T5) and
`explicit-module-boundary-types` (T10); the midi cluster happened to own all 6 remaining
sites. See the T11 section below.

T10 cleared 30 of the mei cluster's 682 errors (682 → 652) and left the warning column
untouched (it had none). Measured: **1324 problems (1306 errors, 18 warnings)**. It
reconciles exactly — errors −30, and the per-file comparison over the whole repo shows
movement in **exactly three files**, the cluster's own: `Mei.ts` 31 → 29, `Helper.ts`
96 → 70, `Mei2MsmMpmConverter.ts` 555 → 553. No file reached zero, so the "files affected"
row is flat at 75. Note the −30 is a *net* figure: it includes one deliberately **added**
`no-non-null-assertion`, explained in the T10 section below. See that section for what was
cleared and what was deliberately not.

T9 cleared 11 of the msm cluster's 132 errors (132 → 121) and both of its warnings.
Measured: **1354 problems (1336 errors, 18 warnings)**. It reconciles exactly — errors
−11, warnings −2, and the per-file comparison over the whole repo shows movement in
**exactly one file**, `src/msm/Msm.ts` (116+2w → 105+0w). No file reached zero, so the
"files affected" row is flat at 75. See the T9 section below.

T4 touched only `src/supplementary/**`, which carried **zero errors** going in, so the error
column is flat by construction. What it cleared is the warning column: all 5
`no-param-reassign` in `RandomNumberProvider.ts` (35 → 30). Measured, not estimated:
`npm run lint` → `1467 problems (1437 errors, 30 warnings)`.

T5 cleared 6 of the xml cluster's 15 errors (15 → 9, see the T5 section below) and left the
warning column untouched. Measured: `npm run lint` → `1461 problems (1431 errors, 30
warnings)`; `eslint -f json` confirms 81 files still carry ≥1 error, because both xml files
retain deferred violations rather than reaching zero.

T7 cleared 21 of the maps cluster's 171 errors (171 → 150) and 8 of its 11 warnings (11 → 3).
Measured: `npm run lint` → `1388 problems (1368 errors, 20 warnings)`. It reconciles exactly —
errors −21, warnings −8, and nothing moved outside the cluster (verified by comparing per-file
`eslint -f json` output over the whole repo on both trees). No file reached zero, so the
"files affected" row is flat at 75; every maps file still carries either a non-null assertion
or the unused `Attribute` import. See the T7 section below for what was cleared and what was
deliberately not.

T6 cleared 42 of the styles cluster's 103 errors (103 → 61) and both of its warnings.
Measured: `npm run lint` → `1417 problems (1389 errors, 28 warnings)`. It reconciles exactly
— errors −42, warnings −2, and nothing moved outside the cluster. Six files dropped to zero
errors (81 → 75 files with ≥1 error): the six style subclasses `ArticulationStyle`,
`DynamicsStyle`, `MetricalAccentuationStyle`, `OrnamentationStyle`, `RubatoStyle`,
`TempoStyle`. See the T6 section below for what was cleared and what was deliberately not.

T2 predicted "306 sit in modules T3 deletes, real Phase 2 debt ~1453". T3 removed **322**
errors and **5** warnings; the delta reconciles exactly:

| n | source |
|---|---|
| 306 | the 8 deleted modules listed in the T3 table below |
| 1 | `src/supplementary/InputStream2StringConverter.ts` — booked under T4, also deleted |
| 1 | `src/mei/Mei.ts` — `no-require-imports`, the `require()` in the removed `exportMusicXml()` |
| 14 | the three dead out-of-scope stubs removed late in T3 (`Midi.exportMsm`, `Msm.exportChroma`, `Msm.exportPitches`) and their 4 unit tests |
| 5 warnings | all `src/mei/Mei2MusicXmlConverter.ts` |

> **Correction (see the `[T3] worker — correction` entry in log.md).** An earlier revision of
> this file reported **1451** errors. That figure was measured *before* the three dead stubs
> above were removed, and it is the number that got committed in `67b407e` — it understated
> the improvement by 14. The table now reflects the tree as actually committed, re-measured
> with `eslint -f json` on a clean `git archive` of HEAD.

## By rule

Counts are post-T3; the T2 column shows what the deletions absorbed.

| count | (was T2) | rule | notes |
|---|---|---|---|
| 1104 | 1333 | `no-non-null-assertion` | The dominant Java-ism. See below — do not bulk-fix. |
| 94 | 106 | `unified-signatures` | Java-style overload sets that collapse to one optional/union signature. |
| 72 | 104 | `no-unused-vars` | Mostly unused params in ported signatures + a few dead locals. |
| 54 | 59 | `no-empty-function` | Almost entirely test stubs. |
| 44 | 44 | `eqeqeq` | All 44 are the `== null` idiom, all in `Helper.ts`. See below. |
| 34 | 64 | `no-explicit-any` | 22 of these are hidden behind two file-level suppressions (see below). |
| 11 | 12 | `prefer-for-of` | Index loops that never use the index. |
| 10 | 11 | `explicit-module-boundary-types` | Exported members with inferred return types. |
| 5 | 15 | `no-extraneous-class` | Static-only "utility" classes → plain module functions. Feeds T14. |
| 3 | 4 | `no-require-imports` | `require()` survivals in `src/mei/` — the remaining 3 are the `Mei2MsmMpmConverter` lazy import (T18's cycle) and 2 in `Helper.ts`. |
| 3 | **0, DONE (T8)** | `no-fallthrough` | ~~`Performance.ts`~~ — **misattributed; all 3 were in `Mpm.isInNamespace`** (`Performance.ts` has no `switch` at all). Verified intentional against `Mpm.java:193-255` and cleared with documenting comments, not `break`s. See the [T8] entry. |
| 2 | 2 | `no-unsafe-function-type` | Bare `Function` type in tests. |
| 1 | 1 | `no-this-alias` | (`no-case-declarations` is gone — its only site was a deleted module.) |

T5's −6 came out of this table as: `prefer-for-of` 11 → 8, `no-unused-vars` 72 → 71,
`no-explicit-any` 34 → 33, `no-this-alias` 1 → **0** (the rule now has no site left in the
tree). The other rows are unchanged.

T7's −21 came out as: `unified-signatures` 77 → **57** (−20) and `prefer-for-of` 8 → **7** (−1),
plus `no-param-reassign` 28 → **20** in the warning column. No other row moved. Current
per-rule totals, measured repo-wide with `eslint -f json` on the post-T7 tree:
`no-non-null-assertion` 1079, `no-unused-vars` 71, `unified-signatures` 57, `no-empty-function`
54, `eqeqeq` 44, `no-explicit-any` 33, `explicit-module-boundary-types` 10, `prefer-for-of` 7,
`no-extraneous-class` 5, `no-require-imports` 3, `no-fallthrough` 3, `no-unsafe-function-type`
2, `no-this-alias` 0, plus 20 `no-param-reassign` warnings. (These sum to 1368 errors.)

T8's −21 came out as: `no-explicit-any` 33 → **24** (−9), `unified-signatures` 57 → **50**
(−7), `no-fallthrough` 3 → **0** (−3), `explicit-module-boundary-types` 10 → **8** (−2),
`no-extraneous-class` 5 → **4** (−1), and `no-unused-vars` 71 → **72** (**+1**, explained in
the [T8] section below). Post-T8 totals, measured repo-wide with `eslint -f json` on the
working tree: `no-non-null-assertion` 1079, `no-unused-vars` 72, `no-empty-function` 54,
`unified-signatures` 50, `eqeqeq` 44, `no-explicit-any` 24, `explicit-module-boundary-types`
8, `prefer-for-of` 7, `no-extraneous-class` 4, `no-require-imports` 3,
`no-unsafe-function-type` 2, `no-fallthrough` 0, `no-this-alias` 0, plus 20
`no-param-reassign` warnings. (These sum to **1347** errors.)

T9's −11 came out as: `unified-signatures` 50 → **44** (−6), `no-unused-vars` 72 → **68**
(−4), `no-extraneous-class` 4 → **3** (−1), plus `no-param-reassign` 20 → **18** in the
warning column. No other row moved. Post-T9 totals, measured repo-wide with
`eslint -f json` on the working tree: `no-non-null-assertion` 1079, `no-unused-vars` 68,
`no-empty-function` 54, `eqeqeq` 44, `unified-signatures` 44, `no-explicit-any` 24,
`explicit-module-boundary-types` 8, `prefer-for-of` 7, `no-extraneous-class` 3,
`no-require-imports` 3, `no-unsafe-function-type` 2, `no-fallthrough` 0, `no-this-alias` 0,
plus 18 `no-param-reassign` warnings. (These sum to **1336** errors.)

T10's −30 came out as: `no-explicit-any` 24 → **12** (−12), `no-unused-vars` 68 → **58**
(−10), `explicit-module-boundary-types` 8 → **0** (−8), `prefer-for-of` 7 → **6** (−1), and
`no-non-null-assertion` 1079 → **1080** (**+1**, deliberate — see the T10 note below). The
warning column did not move. **`explicit-module-boundary-types` now has no site left
anywhere in the tree**, the second rule to be fully retired (after `no-this-alias` in T5)
rather than merely deferred. Post-T10 totals, measured repo-wide with `eslint -f json` on
the working tree: `no-non-null-assertion` 1080, `no-unused-vars` 58, `no-empty-function` 54,
`eqeqeq` 44, `unified-signatures` 44, `no-explicit-any` 12, `prefer-for-of` 6,
`no-extraneous-class` 3, `no-require-imports` 3, `no-unsafe-function-type` 2,
`explicit-module-boundary-types` 0, `no-fallthrough` 0, `no-this-alias` 0, plus 18
`no-param-reassign` warnings. (These sum to **1306** errors.)

T11's −12 came out as: `prefer-for-of` 6 → **0** (−6), `unified-signatures` 44 → **40**
(−4) and `no-unused-vars` 58 → **56** (−2), plus `no-param-reassign` 18 → **5** in the
warning column. No other row moved. Post-T11 totals, measured repo-wide with
`eslint -f json` on the working tree: `no-non-null-assertion` 1080, `no-unused-vars` 56,
`no-empty-function` 54, `eqeqeq` 44, `unified-signatures` 40, `no-explicit-any` 12,
`no-extraneous-class` 3, `no-require-imports` 3, `no-unsafe-function-type` 2,
`prefer-for-of` 0, `explicit-module-boundary-types` 0, `no-fallthrough` 0, `no-this-alias`
0, plus 5 `no-param-reassign` warnings. (These sum to **1294** errors.)

T6's −42 came out as: `no-non-null-assertion` 1104 → **1079** (−25), `unified-signatures`
94 → **77** (−17). *(Befores corrected by conductor per verifier-T6's re-measurement; the
worker's sentence said 1102/96, contradicting this file's own By-rule baselines.)* No other row moved. (The two rows T5 touched had already shifted the post-T3 numbers
in that column; the current per-rule totals, measured repo-wide with `eslint -f json` on the
post-T6 tree, are `no-non-null-assertion` 1079, `unified-signatures` 77, `no-unused-vars` 71,
`no-empty-function` 54, `eqeqeq` 44, `no-explicit-any` 33, `explicit-module-boundary-types`
10, `prefer-for-of` 8, `no-extraneous-class` 5, `no-require-imports` 3, `no-fallthrough` 3,
`no-unsafe-function-type` 2, `no-this-alias` 0, plus 28 `no-param-reassign` warnings.)

## Three things to read before paying any of this down

**1. `no-non-null-assertion` (1333) is a symptom, not the disease.** The port maps Java's
implicitly-nullable returns onto TS types that are honestly `T | null`, and then asserts
`!` at every call site. Mechanically deleting the `!`s will not compile, and mechanically
adding guards will change behavior where the value really can be null. The fix is the
**null-vs-undefined policy that T12 owes ARCHITECTURE.md** — narrow the *return types*
(e.g. `getFirstChildElement` returning `Element | null` vs a throwing variant), and the
assertions disappear on their own. Treat the per-file counts below as a difficulty
estimate for each Phase 2 item, not as a work queue.

**2. All 44 `eqeqeq` violations are `x == null` / `x != null`, and all 44 are in
`src/mei/Helper.ts`.** Not one is a coercive comparison like `x == 0` or `x == '1'` —
verified by reading every site. In TypeScript `x == null` is the correct, idiomatic test
for "null **or** undefined", and it is load-bearing here: the XOM-emulation layer returns
`null` in some paths and `undefined` in others, so rewriting these to `=== null` would
silently change behavior. **T2 deliberately left every one unfixed** (ESLint could not
auto-fix them either — its `eqeqeq` fixer refuses when either operand may be nullish, so
`--fix` was never a risk here). T10 should resolve them *after* T12 sets the null policy;
the likely outcome is relaxing the rule to `['error', 'always', { null: 'ignore' }]` rather
than editing 44 correct comparisons.

**3. ~~Two~~ ONE file-level suppression is hiding 19 `no-explicit-any` violations**, in
`src/mei/Mei2MsmMpmConverter.ts`:

```
/* eslint-disable @typescript-eslint/no-explicit-any */
```

They predate this ESLint config, so they never actually suppressed anything until now.
T2's scoped `--fix` pass removed them as "unused directives" and they were **deliberately
restored**, because dropping a suppression changes what the lint gate reports and that is
not a formatting change.

**T8 discharged its half**: the `src/mpm/Mpm.ts` suppression is gone, and its 3 `any`s are
now real types (`addMetadata(author: Author | null, comment: Comment | null,
relatedResources: RelatedResource[] | null)`, matching Java's signature). `src/mei/
Mei2MsmMpmConverter.ts` is **T10's** and is the only `eslint-disable` left anywhere in
`src/` — `grep -rn "eslint-disable" src/` returns exactly one line.

Real `no-explicit-any` count, measured with `eslint --no-inline-config` rather than
estimated: **55 → 43** across T8 (the 9 visible ones it fixed plus Mpm.ts's 3 suppressed).
Of the 43, 19 are still behind that one directive. (The old "86" figure predates T3's
module deletions and was never re-measured; ignore it.)

## By owning item

Counts are violations, not files.

### T3 — modules deleted — 306 → **0, DONE**
`no-non-null-assertion` 229, `no-unused-vars` 28, `no-explicit-any` 26,
`unified-signatures` 12, `no-extraneous-class` 9, `no-case-declarations` 1, `prefer-for-of` 1

All eight files below were removed by `git rm` in T3, so this debt is retired, not deferred.

| n | file |
|---|---|
| 230 | `src/mei/Mei2MusicXmlConverter.ts` |
| 25 | `src/midi/Midi2MsmConverter.ts` |
| 19 | `src/musicxml/MusicXml.ts` |
| 19 | `src/musicxml/MusicXml2MsmMpmConverter.ts` |
| 7 | `src/audio/Audio.ts` |
| 4 | `src/svg/Svg.ts` |
| 1 | `src/pitches/FeatureVector.ts` |
| 1 | `src/svg/SvgCollection.ts` |

### T4 — supplementary — 1 → **0, DONE**
Was `no-extraneous-class` 1 in `src/supplementary/InputStream2StringConverter.ts`, flagged
at T2 as "not in T4's scope, not in the coverage include list, may be a T3 deletion
candidate — **DISCOVERED, unresolved**". T3 **resolved it**: the file was referenced by
nothing at all (not even `index.ts`), so it was deleted. T4 therefore started from zero
errors and ends at zero: `eslint src/supplementary tests/supplementary` is **silent**.

T4's actual payment was in the two non-error categories:

| category | before T4 | after T4 |
|---|---|---|
| `no-param-reassign` (warn) | 5, all `RandomNumberProvider.ts` | **0** |
| `prefer-readonly` (previewed, not enabled) | 1, `RandomNumberProvider.distributionType` | **0** |
| `getX()`/`setX()` accessor census | 18 | **18 — deliberately unchanged, see below** |

The accessor count is untouched **on purpose**. This file's own note (below) says the
accessor conversion is API-breaking and that **T12 should rule on it before T4–T11 start
converting**; T4 honoured that. `RandomNumberProvider`'s accessor surface is unusually cheap
to convert whenever that ruling lands — only 4 call sites outside its own cluster, all in
`ImprecisionMap.ts` (`getLowerLimit`/`getUpperLimit` ×2 each); the other seven getters and
both setters are reached only from `tests/supplementary/`. `KeyValue` is the opposite
extreme: ~80 call sites across `mei/`, `mpm/` and `msm/`.

### T5 — xml — 15 → **9, DONE (did not reach zero, deliberately)**
Was: `no-non-null-assertion` 6, `prefer-for-of` 3, `no-unused-vars` 2, `unified-signatures` 2,
`no-explicit-any` 1, `no-this-alias` 1 — `XmlBase.ts` 8, `XomTypes.ts` 7.
Now: `XmlBase.ts` 7, `XomTypes.ts` 2.

**Cleared (6):** 3 `prefer-for-of` (index loops over xmldom `NamedNodeMap`/`NodeList` and a
sibling scan → `for..of Array.from(...)`; a bare `for..of` does *not* typecheck because `lib`
is `["ES2022","DOM"]` without `DOM.Iterable`), 1 `no-explicit-any` (the `as any` in
`Element.query` → the xpath package's own `isElement`/`isAttribute`/`isTextNode` guards, which
also retired a `as globalThis.Attr` cast), 1 `no-this-alias` (`let result = this` descent loop
extracted into a module-local `descendChildElementPath`), 1 `no-unused-vars` (unused `Nodes`
import in `XmlBase.ts`).

**Deferred (9), each because clearing it exceeds this item's scope — not because it is hard:**

| n | rule | why it stayed |
|---|---|---|
| 6 | `no-non-null-assertion` | 5 `XmlBase.ts`, 1 `XomTypes.ts` (`doc.documentElement!`). Per this file's own guidance, the fix is narrowing return types under **T12**'s null policy; adding guards would change behavior on paths that cannot be proven unreachable. |
| 2 | `unified-signatures` | `Attribute`'s 2-arg/3-arg and `XmlBase`'s no-arg/`Document` constructor overload pairs. Collapsing either is a **public signature change**, forbidden by T5's scope. **T17**'s call. |
| 1 | `no-unused-vars` | `XmlBase.validate(_schema?)` — removing the parameter is a public signature change, and the config has no `argsIgnorePattern`, so the underscore does not suppress it. |

So the earlier "T5 can plausibly reach zero" was wrong: 3 of the 15 were public API surface
that only T12/T17 can touch, and 6 are the codebase-wide null-assertion story.

`prefer-readonly` in this cluster: **7 → 0** (6 private fields marked `readonly`, and dead
`Element._ownerDocument` deleted).

### T6 — mpm styles + defs — 103 → 61 (DONE, partially paid down)

Going in: `no-non-null-assertion` 86, `unified-signatures` 17, plus 2 `no-param-reassign`
warnings (the warnings were missing from the earlier revision of this table, which counted
errors only — the cluster's true total was 105 problems, not 103).

Coming out: **61, all of them `no-non-null-assertion`.** Per file:

| n before | n after | file |
|---|---|---|
| 20 (+2 warn) | 12 | `src/mpm/elements/styles/defs/RubatoDef.ts` |
| 17 | 15 | `src/mpm/elements/styles/defs/ArticulationDef.ts` |
| 15 | 11 | `src/mpm/elements/styles/defs/AccentuationPatternDef.ts` |
| 14 | 11 | `src/mpm/elements/styles/defs/OrnamentDef.ts` |
| 9 | 5 | `src/mpm/elements/styles/GenericStyle.ts` |
| 4 | 3 | `src/mpm/elements/styles/defs/TempoDef.ts` |
| 3 | 1 | `src/mpm/elements/styles/defs/AbstractDef.ts` |
| 3 | 3 | `src/mpm/elements/styles/defs/DynamicsDef.ts` |
| 3 | **0** | `ArticulationStyle`, `DynamicsStyle`, `MetricalAccentuationStyle`, `OrnamentationStyle`, `RubatoStyle`, `TempoStyle` |

**Cleared (42 errors + 2 warnings):**

| n | rule | how |
|---|---|---|
| 25 | `no-non-null-assertion` | `this.getXml()!` inside `parseData`/`parseDataInternal` bodies replaced by the `xml` parameter (23), plus 2 inside the dead `if (this.getXml()!.getLocalName() …)` blocks deleted in TempoDef/RubatoDef. Not a guard and not a weakening: `AbstractXmlSubtree.setXml` stores the reference verbatim and `getXml` returns it, so after `super.parseData(xml)` the two expressions are the *same object*. Provably identical, zero emitted-JS risk. |
| 17 | `unified-signatures` | 10 overload pairs that differ only by an optional parameter, collapsed: the 7 `createXStyle(name)` / `(name, id)` pairs, `createAccentuationPatternDef(name, length)` / `(…, id)`, and the `constructor()` / `constructor(xml)` pairs of `TemporalSpread` and `DynamicsGradient`. Emits **nothing** — verified absent from the emitted-JS diff — and every existing call site still typechecks. The 9 remaining `string \| Element` messages were **not** collapsed (see below). |
| 2 warn | `no-param-reassign` | `RubatoDef.setLateStart` / `setEarlyEnd`, rewritten to a `let value` local exactly as [T4] did in `RandomNumberProvider`. The clamp is deliberately **not** `Math.max`: the two disagree on `-0`, which a probe confirmed (13 transcript checks flip if you use `Math.max`). |

**Deferred (61), all `no-non-null-assertion`, all the same shape:** `this.getXml()!` outside
a parse body (in setters, `addDef`, `sortXml`, …) plus a handful of `getAttribute(…)!`.
Deferred for the reason [T5] already recorded and this file already prescribes: the fix is
narrowing `AbstractXmlSubtree.getXml()`'s return type under **T12**'s null policy, not adding
guards here. A throwing accessor would turn today's `TypeError` into a different error on a
path this item cannot prove unreachable, which is a behavior change smuggled into a style
item. **T16** owns the model-layer follow-through.

`prefer-readonly` in this cluster: **1 → 0**. Measured with one config over both trees
(`prefer-readonly` alone, `projectService: true`, `src/` only): src-total **12 → 11**, and
the single cluster site was `AccentuationPatternDef.accentuations`, now `readonly`. Only one
field in the whole cluster qualified — everything else is either reassigned during parsing
(`GenericStyle.defs`, `AbstractDef.id`, every numeric def field) or public and mutable by
design (`TemporalSpread.frameStart` and friends). **T7–T11 should budget against 11.**

**Not collapsed on purpose — 9 `unified-signatures` of the `string | Element` kind**
(the 7 styles' `createXStyle(xml)`, `createArticulationDef`, `createOrnamentDef`). Merging
`(name: string)` with `(xml: Element)` into `(nameOrXml: string | Element)` would erase the
one place the API states that these factories have two distinct construction modes, and for
the 7 styles it would additionally make `createXStyle(element, 'id')` typecheck while the
implementation silently ignores the id. That is a real loss of type safety in exchange for a
lint number. **T16**'s call when it redesigns the factory surface.

### T7 — mpm maps + data — 171 → 150 (DONE, partially paid down)

Going in: `no-non-null-assertion` 140, `unified-signatures` 23, `no-unused-vars` 7,
`prefer-for-of` 1, plus 11 `no-param-reassign` warnings — 182 problems in total.

Coming out: **150 errors + 3 warnings.** Per file (errors, warnings):

| before | after | file |
|---|---|---|
| 32 (+2 warn) | 32 | `src/mpm/elements/maps/ImprecisionMap.ts` |
| 24 (+1 warn) | 23 (+1 warn) | `src/mpm/elements/maps/data/MovementData.ts` |
| 22 (+1 warn) | 21 (+1 warn) | `src/mpm/elements/maps/data/DynamicsData.ts` |
| 17 | 14 | `src/mpm/elements/maps/GenericMap.ts` |
| 17 (+1 warn) | 15 | `src/mpm/elements/maps/TempoMap.ts` |
| 12 (+1 warn) | 11 | `src/mpm/elements/maps/RubatoMap.ts` |
| 7 (+1 warn) | 6 | `src/mpm/elements/maps/DynamicsMap.ts` |
| 6 | 5 | `src/mpm/elements/maps/data/OrnamentData.ts` |
| 5 (+1 warn) | 4 | `src/mpm/elements/maps/MetricalAccentuationMap.ts` |
| 4 (+1 warn) | 3 | `src/mpm/elements/maps/MovementMap.ts` |
| 4 (+1 warn) | 3 (+1 warn) | `src/mpm/elements/maps/OrnamentationMap.ts` |
| 4 | 3 | `src/mpm/elements/maps/data/MetricalAccentuationData.ts` |
| 4 | 3 | `src/mpm/elements/maps/data/TempoData.ts` |
| 3 (+1 warn) | 2 | `src/mpm/elements/maps/ArticulationMap.ts` |
| 3 | 1 | `src/mpm/elements/maps/AsynchronyMap.ts` |
| 3 | 2 | `src/mpm/elements/maps/data/RubatoData.ts` |
| 2 | 1 | `src/mpm/elements/maps/data/ArticulationData.ts` |
| 2 | 1 | `src/mpm/elements/maps/data/DistributionData.ts` |

(The "after" errors column sums to 150 and the warnings to 3 — checked, not asserted.)

**Cleared (21 errors + 8 warnings):**

| n | rule | how |
|---|---|---|
| 20 | `unified-signatures` | 8 `createXMap()` / `(xml: Element)` factory pairs and 8 data-class `constructor()` / `constructor(xml)` pairs collapsed onto an optional parameter, plus `TempoMap.addTempo`'s 5-arg/6-arg pair, plus `GenericMap`'s two redundant `protected constructor` overloads (a third overload already declared the full `string \| Element` union, so the first two were pure duplication). Emits **nothing** — all 8 `data/*.js` are byte-identical between the two builds, which is the proof. |
| 1 | `prefer-for-of` | `AsynchronyMap.renderAsynchronyToMap`'s inner loop. The index was used only to index the array, and `mapEntries` is not mutated inside the loop (the `done` removal pass runs after it), so iteration order is identical. |
| 8 warn | `no-param-reassign` | The 7 `getXDataOf(index)` clamps (`if (index >= n) index = n - 1` → `const i = … ? … : index`, then a consistent rename through each body) and `ImprecisionMap.setDetuneUnit`. The `if`→ternary is provably equivalent: the condition has no side effects. |

**Deferred (150 errors + 3 warnings), by reason:**

| n | rule | why it stayed |
|---|---|---|
| 140 | `no-non-null-assertion` | Same story [T5] and [T6] already recorded and this file prescribes: the fix is narrowing return types under **T12**'s null policy, not adding guards. Adding guards inside rendering code would be a behaviour change smuggled into a style item, and this is the cluster where that is least acceptable. |
| 7 | `no-unused-vars` | All 7 are `'Attribute' is defined but never used` — an unused *specifier* in an otherwise-used import statement, one in each `data/` file. **T7 was instructed to keep import statements byte-identical** (the maps' import order is load-bearing for the circular-import hazard and for map-factory registration), so not one import line was touched. Whoever lifts that freeze can clear all 7 mechanically; verify with an emitted-JS diff, since tsc's elision of unused specifiers is what makes it safe. |
| 3 | `unified-signatures` | `GenericMap.createGenericMap` and `ImprecisionMap.createImprecisionMap` (`string \| Element`) and `GenericMap.removeElement` (`number \| Element`). All three are the kind [T6] deliberately preserved: genuinely distinct construction/removal modes, where the signature is the only place that says so. **T16**'s call. |
| 2 warn | `no-param-reassign` | `DynamicsData.getTForDate` and `MovementData.getTForDate` reassign `date` inside the Bézier inversion. Untouched on purpose — that is floating-point rendering math under a hard bit-identity requirement, and the reward is one lint warning. |
| 1 warn | `no-param-reassign` | `OrnamentationMap.getOrnamentDataOf`'s index clamp, the one site of the 8 not converted. Deliberate: T7's brief froze OrnamentationMap's method bodies after this session's hard-won parity fixes, and the emitted-JS diff confirms that file's only change is the `parseData` removal. |

`prefer-readonly` in this cluster: **0 of the 11 remaining `src/` sites are here** — measured with
the same one-rule config over both trees (`prefer-readonly` alone, `projectService: true`,
`src/` only): src-total **11 → 11**. Every private field in the cluster is genuinely reassigned
(`x1`/`x2` are lazy caches, `id`/`globalHeader`/`localHeader` are set after construction), so
there was nothing free to take. ~~**T8–T11 still budget against 11.**~~

**[T8] re-measurement: the `src/` total is 9, not 11.** Running the same one-rule config
over T8's `git archive` of the pre-T8 tree gives **9** (`midi/MidiTypes.ts` 5,
`mei/Mei2MsmMpmConverter.ts` 2, `midi/InstrumentsDictionary.ts` 1,
`mpm/elements/Dated.ts` 1) — so either the "11" was measured on a different tree state or
two sites were resolved without being logged. T8 took the one site in its scope
(`Dated.maps`, only ever `.set`/`.delete`/`.clear`-ed, never reassigned), leaving
**9 → 8**. Nothing else in this cluster is free: every other private field is assigned in
`parseData` or a setter rather than in the constructor, which `readonly` forbids.
~~**T9–T11 budget against 8, and should re-measure rather than trust either figure.**~~

> **[T9] re-measurement: the post-T8 tree reads 9, not 8** — same one-rule config, run on a
> byte-verified `git archive` of `fb31d34`. The whole difference is
> `mei/Mei2MsmMpmConverter.ts`, which T8 counted as 2 and T9 counts as 3;
> `mpm/elements/Dated.ts` is indeed cleared in both readings. T9 itself takes none (no
> qualifying field in the msm cluster), so the figure is **9 → 9**. This is now the third
> entry in a row where the absolute disagrees with its predecessor while the *delta* is
> solid, which is about as clear a signal as this file can give: **measure, never
> inherit.** T10–T11 budget against 9.

### T8 — mpm core — 212 → **191, DONE**
Before: `no-non-null-assertion` 169, `unified-signatures` 21, `no-explicit-any` 9,
`no-unused-vars` 7, `no-fallthrough` 3, `explicit-module-boundary-types` 2,
`no-extraneous-class` 1.
After: `no-non-null-assertion` 169, `unified-signatures` 14, `no-unused-vars` 8.

| before | after | file |
|---|---|---|
| 74 | 70 | `src/mpm/elements/Performance.ts` |
| 36 | 32 | `src/mpm/elements/metadata/Metadata.ts` |
| 26 | 21 | `src/mpm/Mpm.ts` (~~+3 suppressed `any`~~ — suppression removed) |
| 20 | 19 | `src/mpm/elements/Part.ts` |
| 17 | 12 | `src/mpm/elements/Dated.ts` |
| 17 | 16 | `src/mpm/elements/Header.ts` |
| 9 | 8 | `src/mpm/elements/Global.ts` |
| 6 | 6 | `src/mpm/elements/metadata/RelatedResource.ts` |
| 4 | 4 | `src/mpm/elements/metadata/Author.ts` |
| 3 | 3 | `src/mpm/elements/metadata/Comment.ts` |

**⚠ CORRECTION — the 3 `no-fallthrough` were never in `Performance.ts`.** That file
contains no `switch` statement at all. All three are in `Mpm.isInNamespace`
(`src/mpm/Mpm.ts`), at the three blank-line group boundaries of its case table. Whoever
wrote the original row guessed; anyone re-deriving a per-file count from this document
should re-measure rather than trust it.

They are **not** a bug. `Mpm.java:193-255` has the identical table, in the identical
order, with the identical blank-line grouping: every case is empty and falls through to a
single `return true`, so the switch is a membership test, not a dispatch. (ESLint flags
only the three cases that follow a blank line; adjacent empty cases it accepts silently.)
Cleared with `// falls through — <group>` comments naming each group, never a `break`.
The whole 54-name table plus 13 near-miss negatives is now probed name by name; two
negative controls confirm the probe catches a real break at those sites.

**Cleared (21 errors), and 3 suppressed `any` on top of that:**

| n | rule | how |
|---|---|---|
| 9 | `no-explicit-any` | 4 in `Dated` (`(this.global as any).getHeader()` ×2, `(this.part as any).getHeader()` ×2 — the assertions were vestigial; `Global`/`Part` are `import type`d and expose `getHeader()` publicly), 4 in `Metadata.createMetadata`'s duck-type guards (`'getNumber' in (arg1 as any)` → `'getNumber' in arg1`; the union narrows on its own after the null guard), 1 in `Performance.perform` (`(globalOrnamentationMap as any).renderGlobalOrnamentationMap(...)` — that method is public on `OrnamentationMap`). All are type assertions, which erase: proven by `Performance.js` and `Global.js` being byte-identical between builds, and `Dated.js`/`Metadata.js` differing only in the two unrelated hunks below. |
| 7 | `unified-signatures` | 5 factory overload pairs collapsed onto an optional parameter — `createHeader`, `createDated`, `createGlobal` (`()`/`(xml)`), `createPart` (4-arg/5-arg), `createPerformance` (1/2/3-arg, which cleared 3 at once because the remaining `(xml: Element)` overload no longer unifies with it either). Overload signatures emit nothing; the `.d.ts` diff shows each pair becoming one strictly-wider signature, and the project-wide declared-member set is unchanged at 1154. |
| 3 | `no-fallthrough` | Documenting comments, as above. |
| 2 | `explicit-module-boundary-types` | `Mpm.addMetadata`'s `author`/`comment` parameters, typed from `any` to `Author \| null` / `Comment \| null`. |
| 1 | `no-extraneous-class` | `Mpm.ts`'s module-local `Helper` class (5 static methods, never exported) became module functions. Three of the five — `getAttribute`, `getAttributeValue`, `getFilenameWithoutExtension` — were **dead**: `getAttribute` had exactly one caller, `getAttributeValue`, which had none. Java's `Mpm.java` likewise calls only the two survivors (`Mpm.java:160,165`). Deleted, which is also why the function count fell by 3 (all 3 uncovered). |
| +3 | *(suppressed)* `no-explicit-any` | The file-level `eslint-disable` in `Mpm.ts` and the 3 `any`s it hid. Never counted in the 212, so they do not appear in the −21. |

**Deferred (191 errors), by reason:**

| n | rule | why it stayed |
|---|---|---|
| 169 | `no-non-null-assertion` | Same story every entry since [T5] records: the fix is narrowing return types under **T12**'s null policy, not adding guards. `Performance.perform` alone holds a large share of them, and adding guards inside the rendering pipeline is exactly the behaviour-change-disguised-as-style this item must not make. |
| 14 | `unified-signatures` | Genuinely distinct modes, per the [T6]/[T7] precedent, each documented at the site: `Mpm`'s 3-way constructor (`()` / `Document` / XML `string`), `Mpm.getPerformance` and `removePerformance` (`number \| string` / `Performance \| string`), `Header.addStyleType` (`string \| Element`), `Performance.getPart` (by number / by name / by channel+port — `getPart(1)` and `getPart(1, 0)` ask different questions), and the 6 from `Metadata.createMetadata`, which dispatches on the argument's **shape** (duck-typed `getName`+`getNumber` vs `getText`), so the overloads are the only place that behaviour is stated. **T16**'s call. |
| 8 | `no-unused-vars` | 6 are unused *specifiers* inside import statements T8 was required to keep byte-identical (`Nodes`/`Elements` in `Mpm.ts`, `Header` in `Dated.ts`, `Attribute` in `Header.ts`/`Metadata.ts`, `KeyValue` in `Performance.ts` — the last mirrors Java, where `KeyValue` is used only in a commented-out cleanup loop, `Performance.java:549`). 1 is `Mpm.writeMpmString`'s `_filename`, kept for API compatibility and needing an `argsIgnorePattern: '^_'` in the ESLint config, which belongs to whoever owns the config, not here. **This row grew by 1**: deleting the dead `Helper.getAttribute` orphaned the `Attribute` specifier in `Mpm.ts`, and the import freeze forbids pruning it. Clearing all 6 is free whenever the freeze lifts — tsc already elides every one of them, so `dist/mpm/Mpm.js` opens with `import { Element, Document } from '../xml/XomTypes.js';` in **both** builds. Verify with an emitted-JS diff. |

### T9 — msm — 132 → **121, DONE (partially paid down)**

Going in: `no-non-null-assertion` 114, `unified-signatures` 12, `no-unused-vars` 5,
`no-extraneous-class` 1, plus 2 `no-param-reassign` warnings — 134 problems in total.
(137 → 132 in T3: `Msm.ts` lost the `exportChroma`/`exportPitches` dead stubs, which
carried `no-explicit-any` and `explicit-module-boundary-types` violations.)

Coming out: **121 errors, 0 warnings.** Per file:

| before | after | file |
|---|---|---|
| 116 (+2 warn) | 105 | `src/msm/Msm.ts` |
| 9 | 9 | `src/msm/Goto.ts` |
| 7 | 7 | `src/msm/AbstractMsm.ts` |

**Cleared (11 errors + 2 warnings):**

| n | rule | how |
|---|---|---|
| 6 | `unified-signatures` | The `exportMidi` and `exportExpressiveMidi` overload sets. `exportExpressiveMidi`'s three (`()` / `(perf)` / `(perf, genPC)`) collapse onto one optional-parameter signature; `exportMidi`'s four collapse to **two** — `(generateProgramChanges: boolean)` is kept separate because its single argument means something else than `exportMidi(90)` does, exactly the distinction [T6] preserved for `string \| Element`. Overload signatures emit nothing: `dist/msm/Msm.js` is unaffected by this change, and the `.d.ts` diff shows each set becoming one strictly wider signature. `exportMidi(false)`, `exportMidi(90.0)` and `exportMidi(90.0, false)` are all exercised by `tests/msm/Msm.test.ts` and all still typecheck. |
| 4 | `no-unused-vars` | Four unused `catch` bindings (`catch (ex)` ×2 in `getTitle`/`getPPQ`, `catch (e)` in `makeInitialTempo`, `catch (error)` in `parseMarkerMap`) → optional catch binding, `catch {`. None of the four was read; ES2022 is the emit target, so the binding simply disappears. |
| 1 | `no-extraneous-class` | `Msm.ts`'s module-local `Helper` class (9 static methods, never exported) became module functions, the same conversion [T8] did in `Mpm.ts`. `getFirstChildElement`'s `Element`-form branch was **dead** — all four call sites pass a name — and `cloneElementImpl` was a private half of `cloneElement`; both went, which is where the function and statement counts move. |
| 2 warn | `no-param-reassign` | `fitVelocities`'s `min`/`max` swap, rewritten as two ternaries on the same side-effect-free condition and a consistent rename through the body, exactly as [T4]/[T6]/[T7] did elsewhere. Not `Math.min`/`Math.max`: those disagree with a swap on `-0`, the trap [T6] recorded. |

**Deferred (121), by reason:**

| n | rule | why it stayed |
|---|---|---|
| 114 | `no-non-null-assertion` | The story every entry since [T5] records: the fix is narrowing return types under **T12**'s null policy, not adding guards. `Msm.ts` holds 101 of them, most in the MIDI rendering methods, where a guard would be a behaviour change disguised as style. |
| 6 | `unified-signatures` | The two 3-way constructors — `Msm()` / `(Document)` / `(xml: string)` and the identical set on `AbstractMsm`. Kept and documented at both sites for the reason [T8] kept `Mpm`'s: three distinct things to start from, not one optional parameter. **T16**'s call. |
| 1 | `no-unused-vars` | `Msm.writeMsmString`'s `_filename`, kept for API compatibility with Java's `writeMsm(String)`. Needs `argsIgnorePattern: '^_'` in `eslint.config.js`, which belongs to whoever owns the config — the same site [T8] flagged for `Mpm.writeMpmString`. Two of these now; worth doing. |

`prefer-readonly` in this cluster: **0 sites, nothing to take.** Measured with the [T8]
verifier's one-rule config over both trees: `src/` total **9 → 9**
(`midi/MidiTypes.ts` 5, `mei/Mei2MsmMpmConverter.ts` 3, `midi/InstrumentsDictionary.ts` 1).
`Msm.CONTROL_CHANGE_DENSITY` is already `private static readonly`; `Goto`'s fields are all
public and genuinely mutated (`counter` by `isActive`), and `AbstractMsm` has no fields.

> ⚠ That 9 is one more than the **8** [T8] recorded for the *same tree state*, and the
> difference is entirely `mei/Mei2MsmMpmConverter.ts` (3 here, 2 there). Consistent with
> this file's standing warning that `prefer-readonly` absolutes drift between measurement
> runs — compare deltas within one config, and re-measure rather than inherit. **T10–T11
> budget against a measured 9, and note 3 of them are T10's own file.**

### T10 — mei — 682 → **652** (the big one; local idioms done, structure deferred)
Was `no-non-null-assertion` 577, `eqeqeq` 44, `no-unused-vars` 29, `no-explicit-any` 12,
`explicit-module-boundary-types` 8, `unified-signatures` 7, `no-require-imports` 3,
`no-extraneous-class` 1, `prefer-for-of` 1 —
`Mei2MsmMpmConverter.ts` 555 (+19 suppressed `any`), `Helper.ts` 96, `Mei.ts` 31.

Now **652**: `no-non-null-assertion` 578, `eqeqeq` 44, `no-unused-vars` 19,
`unified-signatures` 7, `no-require-imports` 3, `no-extraneous-class` 1 —
`Mei2MsmMpmConverter.ts` 553 (+**1** suppressed `any`, down from 19), `Helper.ts` 70,
`Mei.ts` 29. `no-explicit-any`, `explicit-module-boundary-types` and `prefer-for-of` are at
**zero** in this cluster; the middle one is now at zero repo-wide.

**What T10 cleared**

| n | rule | how |
|---|---|---|
| 12 | `no-explicit-any` | `Helper`'s XSLT/transformer stub parameters and returns → `unknown`, which accepts every argument those (test-only) call sites pass, plus `(globalThis as any).process` → `(globalThis as { process?: unknown }).process`. All erase to identical JS; the `Helper.d.ts` token diff is exactly 9 `any`→`unknown`. |
| 10 | `no-unused-vars` | 5 unused imports (`Builder`, `Elements`, `Nodes`, `XomNode` in `Helper.ts`; `Nodes` in the converter — all already elided from the emitted JS), 2 dead locals in removed port wreckage, 2 unused destructuring bindings replaced by `Map.keys()`, 1 unused `const index` on a call kept for its side effect. |
| 8 | `explicit-module-boundary-types` | 7 fell out of the `unknown` change above; the 8th was `msmCleanupSingle(msm: any)` → `msm: Msm`. |
| 1 | `prefer-for-of` | `Helper.prettyXml`'s index loop over a freshly `split` array. The `== null` guard inside is preserved verbatim, so `eqeqeq` does not move. |

**What T10 deliberately did not clear**

| n | rule | why it stayed |
|---|---|---|
| 578 | `no-non-null-assertion` | 548 of them in the converter alone — the single largest block of debt left in the repo. The fix is narrowing return types under **T12**'s null policy, not sprinkling guards: in this cluster a guard is a behaviour change, because today's TypeError on a malformed document would become a silent no-op. |
| 44 | `eqeqeq` | Every one is the `== null` idiom in `Helper.ts`, untouched by instruction — **T12** owns the null policy and these are its input, not style noise. |
| 19 | `no-unused-vars` | Almost all are **unused parameters on stub signatures** kept for API compatibility (`validateAgainstSchema`, the four XSLT stubs, `processClefDis`, the four `process*Rpt` handlers). They cannot be silenced from inside `src/mei/`: they need `argsIgnorePattern: '^_'` in `eslint.config.js`. Several already carry a `_` prefix in anticipation. **[T8], [T9] and now [T10] have all asked for this one-line config change** — whoever owns the config should just do it. |
| 7 | `unified-signatures` | `Mei`'s 3-way constructor and `Helper`'s name-first/name-last overload sets. Same reasoning [T8] and [T9] recorded for `Mpm`/`Msm`: these are genuinely different things to start from, and collapsing them changes the API. **T16**'s call. Documented at both sites. |
| 3 | `no-require-imports` | Unchanged by instruction: 1 is `Mei.exportMsmMpm`'s lazy converter import (**T18**'s cycle; it is CommonJS in an ESM package and therefore throws, which `tests/mei/Mei.test.ts` asserts) and 2 are `Helper.writeStringToFile`'s `fs`/`path`. |
| 1 | `no-extraneous-class` | `Helper` is static-only. Converting it to module functions is **T14**, ~300 call sites deep. Its utility groups and their invariants are now documented on the class comment as input for that. |

**The +1 `no-non-null-assertion`, stated plainly.** Typing `msmCleanupSingle(msm: any)` as
`msm: Msm` turns `msm.getRootElement()` (which returns `Element | null`) into a type error.
The three options were: keep `any`, add a guard (a behaviour change), or `!`. T10 took the
`!` — the idiom `XmlBase` itself uses for this exact call three times over — and documented
it at the site. Net for the file is still −2.

**The last `any`, and why the file-level suppression survives.**
`Mei2MsmMpmConverter.ts` keeps `/* eslint-disable @typescript-eslint/no-explicit-any */`,
still the only `eslint-disable` in the tree, for **one** remaining site (down from 19):
`relatedResources` in `makeMovement`. `RelatedResource.createRelatedResource` returns
`RelatedResource | null`; `Mpm.addMetadata` takes `RelatedResource[] | null`. The honest
element type does not fit the consumer, and fixing that means changing a signature in
`mpm/`. **DISCOVERED, unresolved** — whichever item owns that call (T13/T16) can then delete
the suppression outright and this cluster reaches zero `no-explicit-any`.

Separately, T10's cleanup left **`XomTypes.Element.setNamespaceURI` with no caller in
`src/` or `tests/`** — its only invocation was a discarded local in dead code. It shows as a
function-coverage movement in an untouched file (72/74 → 71/74). **DISCOVERED**: T17 should
either delete it or give it a unit test.

### T11 — midi — 33 → **21, DONE (and 13 → 0 warnings)**

Going in: `no-non-null-assertion` 14, `unified-signatures` 10, `prefer-for-of` 6,
`no-unused-vars` 2, `no-extraneous-class` 1, plus **13 `no-param-reassign` warnings** —
46 problems, and the cluster held 13 of the tree's 18 warnings and all 6 of its remaining
`prefer-for-of`. (37 → 33 in T3: `Midi.ts` lost the `exportMsm` dead stub, which carried
`no-explicit-any`, `explicit-module-boundary-types` and 2 `no-unused-vars` for its two
ignored parameters.)

Coming out: **21 errors, 0 warnings.** Per file (errors, warnings):

| before | after | file |
|---|---|---|
| 23 (+3 warn) | 14 | `src/midi/Midi.ts` |
| 6 (+3 warn) | 6 | `src/midi/MidiTypes.ts` |
| 3 (+7 warn) | 1 | `src/midi/EventMaker.ts` |
| 1 | **0** | `src/midi/InstrumentsDictionary.ts` |

**Cleared (12 errors + 13 warnings):**

| n | rule | how |
|---|---|---|
| 6 | `prefer-for-of` | All six sites, and with them the rule's last site in the tree. Two in `Midi.noteOns2NoteOffs`/`noteOffs2NoteOns` (`for (let t …) sequence.getTracks()[t]` → `for (const track of sequence.getTracks())`), three byte-copy loops in `Midi.buildTrackChunk` and one in `EventMaker.byteArrayToInt` (`for (let j …) bytes.push(data[j])` → `for (const byte of data)`). A `for..of` over a `Uint8Array` visits the same values in the same index order, so the write sequence is unchanged — proven byte-for-byte by the probes, not argued. |
| 4 | `unified-signatures` | Two overload *pairs*, which the rule reports as 4 messages: `InstrumentsDictionary.getProgramChange(name)` / `(name, distanceMethod)` and `Midi`'s `constructor(sequence)` / `(sequence, midifile)`, each collapsed onto one optional parameter that accepts exactly the same call shapes. Overload signatures emit nothing; the `.d.ts` token diff shows each pair becoming one signature and the `.js` is untouched. |
| 2 | `no-unused-vars` | The unused `MidiMessage` specifier in `Midi.ts`'s import (tsc already elided it — the emitted import line is **byte-identical**, the [T8] precedent rather than [T10]'s trailing-comma case) and `EventMaker.createProgramChangeByName`'s unread `catch (e)` → optional catch binding, as [T9] did four times in `Msm.ts`. |
| 13 warn | `no-param-reassign` | Every one in the cluster, in five shapes: the three velocity/controller clamps (`if (v > 127) v = 127; else if (v < 0) v = 0;` → one `const` ternary), `EventMaker.intToByteArray`'s `value = value \| 0` → `const int32`, and the two VLQ encoders' `if (value < 0) value = 0` → `let rest = value < 0 ? 0 : value`. **Not `Math.min`/`Math.max`** — the trap [T6] recorded, and the reason a 413-entry adversarial probe over NaN, ±0, ±Infinity and fractional inputs was run against both builds before this was accepted. |

**Deferred (21), by reason:**

| n | rule | why it stayed |
|---|---|---|
| 14 | `no-non-null-assertion` | 10 `this.sequence!` in `Midi.ts`, 4 narrowing assertions in `MidiTypes`' `ShortMessage`/`MetaMessage` constructors. The story every entry since [T5] records: the fix is narrowing return types under **T12**'s null policy. Here a guard would be a real behaviour change — `Midi.getSequence()` returning null instead of throwing would turn a `TypeError` into a silent wrong answer in `Msm.exportMidi`. |
| 4 | `unified-signatures` | `Midi`'s remaining 4 are the union merges — `number \| Sequence \| Uint8Array` — which are genuinely different things to construct from, per the [T6]/[T8]/[T9] precedent. Merging them would additionally make `new Midi(bytes, 'file.mid')` typecheck while the implementation silently drops the filename. Documented at the site. **T16**'s call. |
| 2 | `unified-signatures` | `ShortMessage`'s `(status, data1, data2)` / `(command, channel, data1, data2)` pair. The first argument means something different in each — a whole status byte versus a command nibble — and merging them would make a 2-argument call typecheck, which the implementation mis-handles (it falls into the single-status-byte branch and drops the second argument). Documented at the site. |
| 1 | `no-extraneous-class` | `EventMaker` is static-only. Converting it to module functions is a **T14**-shaped change, ~60 call sites deep in `Msm.ts` alone, and `EventMaker.X` is how Java's `EventMaker` reads. |

`prefer-readonly` in this cluster: **6 → 0**, the whole of T11's share. Measured with the
[T8] verifier's one-rule config over both trees: `src/` total **8 → 2**
(`MidiTypes.ts` 5 → 0: `MidiEvent.message`, `Track.events`, `Sequence.divisionType`/
`resolution`/`tracks`; `InstrumentsDictionary.ts` 1 → 0: `dict`). The 2 left are both
`Mei2MsmMpmConverter.ts` (`ignoreExpansions`, `cleanup`). Every one of the six erases:
`MidiTypes.js` differs from base by nothing but the VLQ rewrite, and the six `readonly`
keywords appear only in the `.d.ts`.

> **The `prefer-readonly` absolute drift is explained — stop treating it as noise.**
> [T7] read 11, [T8] read 8, [T9] and [T10] read 9, and this file has warned three times
> to compare deltas rather than absolutes. Running the config and reading its **messages**
> rather than its count: it emits **9 messages on the pre-T11 tree, of which only 8 are
> `prefer-readonly`**. The ninth is `Unused eslint-disable directive` at
> `Mei2MsmMpmConverter.ts:32` — the bare single-rule config does not enable
> `no-explicit-any`, so the file-level suppression there reports as unused. Whoever
> counted messages got 9, whoever filtered by `ruleId` got 8. Filter by `ruleId`.

### T13 — facade — 1
`no-extraneous-class` 1 — `src/Meico.ts`.

### tests — 88
`no-empty-function` 54, `no-unused-vars` 20, `no-explicit-any` 12,
`no-unsafe-function-type` 2. Concentrated in `tests/mei/Mei.test.ts` (24),
`tests/mpm/Mpm.test.ts` (10), `tests/mei/Helper.test.ts` (7).
(93 → 88 in T3: the 4 removed stub tests took 5 `vi.spyOn(...).mockImplementation(() => {})`
`no-empty-function` sites with them, all in `tests/midi/Midi.test.ts`.)
Adapt alongside the source item that owns each area. `no-non-null-assertion` and
`explicit-module-boundary-types` are already off for `tests/**`.

## Style decisions with no ESLint rule behind them

`state.json` T2 also codifies "no `getX()`/`setX()` Java accessors" and "prefer array
methods". No lint rule expresses either, so here is the census instead
(`grep` over `src/`, method declarations):

| | count |
|---|---|
| `getX()` declarations | 403 |
| `setX()` declarations | 183 |
| **total Java-style accessors** | **586** |
| native TS `get`/`set` accessors currently used | **0** |

By directory: `src/mei` 244, `src/mpm` 191, `src/midi` 34, `src/xml` 34, `src/msm` 21,
`src/supplementary` 18. Most frequent: `getValue` 14, `getXml` 13, `setValue` 12,
`setId`/`getId` 12 each, `getType` 9, `getPart` 9.

**This is the single biggest idiom change in Phase 2 and it is API-breaking**, so T12 should
rule on it explicitly before T4–T11 start converting: property/accessor everywhere, or
keep `getX()` where the tests and the Java parity story depend on call-order visibility.
Note `getXml()`/`getValue()` etc. are used pervasively *inside* the port, so a rename is a
whole-tree mechanical change, not a per-item one — it may deserve its own item.

## What type-aware linting would add (measured, not enabled)

Preview run with `strictTypeChecked` + `stylisticTypeChecked` over `tsconfig.tests.json`:
**4442 violations, 7s wall** — so the cost objection to type-aware linting is not real, only
the sequencing one. Rules that appear only with type information:

| count | rule | why it matters here |
|---|---|---|
| 151 | `no-unsafe-member-access` | fallout from the `any`s above |
| 127 | `restrict-template-expressions` | non-string values in template literals |
| 126 | `no-unnecessary-type-assertion` | **`!` that the compiler already knows is redundant — the cheapest slice of the 1333** |
| 112 | `no-unnecessary-condition` | **null checks that can never fire — direct evidence for T12's null policy** |
| 100 / 93 / 39 / 4 | `no-unsafe-call` / `-assignment` / `-argument` / `-return` | same `any` root cause |
| 75 | `prefer-nullish-coalescing` | `\|\|` → `??`; **semantics-changing where `0`/`''` are valid values — never bulk-fix** |
| 46 | `no-confusing-void-expression` | |
| 32 | `dot-notation` | |
| 15 | `prefer-optional-chain` | `a && a.b` → `a?.b`; **also semantics-changing for falsy-not-nullish `a`** |

Recommendation: **switch the config to the type-checked presets as part of T12/T18**, once
the null policy exists. `no-unnecessary-condition` and `no-unnecessary-type-assertion` in
particular turn the vague "1333 `!`s" problem into a precise, mechanically-checkable one.

## Immutable-friendly direction — measured baseline

Per the CHARTER.md section added 2026-08-08. T2 is a pure formatting/tooling item, so it
codifies the direction in lint config and **measures** it; it annotates no `readonly` in
`src/` and adds no functional-style plugin. That is Phase 2/3 work.

**Enabled now**: `no-param-reassign` at **`warn`** (default `props: false`) — **30 warnings**
after T4 (35 after T3, was 40), zero new errors, so it cannot turn the lint output red on
its own.

| n | file |
|---|---|
| 7 | `src/midi/EventMaker.ts` |
| ~~5~~ | ~~`src/mei/Mei2MusicXmlConverter.ts`~~ — deleted in T3, the full −5 |
| ~~5~~ | ~~`src/supplementary/RandomNumberProvider.ts`~~ — cleared in T4, the full −5 |
| 3 | `src/midi/Midi.ts`, 3 `src/midi/MidiTypes.ts` |
| ~~2~~ | ~~`src/mpm/elements/maps/ImprecisionMap.ts`~~ — cleared in T7, the full −2 |
| ~~2~~ | ~~`src/mpm/elements/styles/defs/RubatoDef.ts`~~ (cleared in T6), ~~`src/msm/Msm.ts`~~ — cleared in T9, the full −2 (`fitVelocities`'s `min`/`max` swap) |
| 1 | 9 further map/data files — **6 of them cleared in T7**, 3 remain (both `getTForDate`s and `OrnamentationMap`); 2 integration tests |

> **Post-T9 warning total is 18** (was 20 after T7/T8), measured per file: `src/midi/**`
> 13 (`EventMaker.ts` 7, `Midi.ts` 3, `MidiTypes.ts` 3 — **T11**'s), `src/mpm/**` 3 (the
> two `getTForDate` Bézier inversions and `OrnamentationMap`, all three deliberately left
> by [T7]), integration tests 2. **`src/msm/**` is at zero.**

> **Post-T11 the total is 5**, and `src/midi/**` joins `src/msm/**` at zero: T11 cleared
> all 13 of its warnings. What is left is exactly the 3 `src/mpm/**` sites [T7] documented
> as deliberate (both `getTForDate` Bézier inversions and `OrnamentationMap`) plus the 2 in
> integration tests, which no source item may touch. In other words **every remaining
> `no-param-reassign` warning in the tree is one a previous item examined and kept on
> purpose** — the column is now a decision record, not a backlog, and it should not be
> driven to zero before T12 draws the mutation boundary.

It is `warn` and not `error` on purpose: the charter grants the conversion/rendering core
an **explicit mutation boundary**, so a share of these are legitimate and only T12 can draw
the line. Do not "fix" them to zero before ARCHITECTURE.md exists.

**Measured but NOT enabled** (one-off preview, config not kept):

| rule | total | src only | verdict |
|---|---|---|---|
| `prefer-readonly` | 38 | 38 → **17** | **Enable in Phase 2.** Private fields never reassigned after construction — exactly the charter's "type-level immutability where it's free", zero runtime risk, small enough to clear per item. **The 38 is a T2-tree figure and was never refreshed by T3** — see the correction below. |
| `no-param-reassign` `{ props: true }` | 97 | 95 | The 57 beyond the 40 above are *mutations through* a parameter — i.e. the literal "don't mutate inputs" signal. **This is the number T12 should reason about** when drawing the mutation boundary; many will be the sanctioned `renderXToMap(map)` case. |
| `prefer-readonly-parameter-types` | 805 | 679 | **Do not enable.** Confirms its reputation; 679 in `src/` would drown every other signal. The facade's plain-data acceptance criterion (T13) is a better instrument than this rule. |
| `require-array-sort-compare` | 1 | 0 | Only site is in a test. No `.sort()`-without-comparator bug in `src/`. |

> **`prefer-readonly` update (T6).** Re-measured with one config over the T6 baseline
> (`dbc63eb`) and the post-T6 tree: **12 → 11** in `src/`. Chain of record so far:
> `fc81fc5` (T2) 38 → `20e94c2` (post-T3) 18 → post-T4 17 → T5's config read 19/12 on its
> two trees → post-T6 **11**. The T4 and T5 configs disagreed by 2 on the same tree, so
> compare deltas rather than absolutes across entries; within a single config the T6 delta
> is 12 → 11. ~~**T7–T11 budget against 11.**~~ **Post-T11: 2 in `src/`, both in
> `Mei2MsmMpmConverter.ts`** — and the recurring ±1 in this chain is finally diagnosed in
> the T11 section above (a non-`prefer-readonly` message the bare config also emits).

> **`prefer-readonly` correction (T4).** The 38 above is real but *stale*: it was measured on
> T2's tree, and T3 then deleted eight modules without re-running the preview. Re-measured on
> three trees with one config (`prefer-readonly` alone, `projectService: true`, `src/` only):
> **`fc81fc5` (T2's tree) = 38 — reproduces the recorded figure exactly**, `20e94c2` (post-T3,
> T4's baseline) = **18**, working tree (post-T4) = **17**. So T3's deletions absorbed 20 of
> them and T4 cleared 1 (`RandomNumberProvider.distributionType`). **T5–T11 should budget
> against 17, not 38.** The same staleness likely affects the other three rows in this table,
> which T4 did not re-measure — treat all four as T2-tree figures until someone re-runs them.

Note the charter's facade criterion — plain, structured-clone-safe data — is **not** a lint
property at all: no rule can tell a `readonly` wrapper around a live XomTypes node from
plain data. T13 needs the two behavioural tests the charter names (survives `postMessage`;
new value per change) rather than a lint rule.

Also unenforceable by lint, and worth restating from the charter: "no shared mutable
statics/singletons". The 15 `no-extraneous-class` hits are a partial proxy — every
static-only utility class is a candidate — but T12/T21 have to audit module-level mutable
state by hand.
