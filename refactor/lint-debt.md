# Lint debt (as of T3)

> Updated after **T3** (out-of-scope module excision). Counts below are the *current*
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

| | count | after T3 |
|---|---|---|
| Violations before T2 | 2104 | |
| Auto-fixed in T2 (semantics-preserving only) | 345 | |
| **Remaining debt (errors)** | **1759** | **1437** |
| `no-param-reassign` warnings (separate, see below) | 40 | 35 |
| Files affected (≥1 error) | 90 of 118 | 81 of 105 |
| Still auto-fixable | 0 | 0 |

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
| 3 | 3 | `no-fallthrough` | `Performance.ts` switch cases — **verify each is intentional before touching**. |
| 2 | 2 | `no-unsafe-function-type` | Bare `Function` type in tests. |
| 1 | 1 | `no-this-alias` | (`no-case-declarations` is gone — its only site was a deleted module.) |

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

**3. Two file-level suppressions are hiding 22 `no-explicit-any` violations**, in
`src/mei/Mei2MsmMpmConverter.ts` (19) and `src/mpm/Mpm.ts` (3):

```
/* eslint-disable @typescript-eslint/no-explicit-any */
```

They predate this ESLint config, so they never actually suppressed anything until now.
T2's scoped `--fix` pass removed them as "unused directives" and they were **deliberately
restored**, because dropping a suppression changes what the lint gate reports and that is
not a formatting change. T8 and T10 should delete them and type the `any`s properly. Real
`no-explicit-any` count once they go: **86**.

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

### T4 — supplementary — 1 → **0**
Was `no-extraneous-class` 1 in `src/supplementary/InputStream2StringConverter.ts`, flagged
at T2 as "not in T4's scope, not in the coverage include list, may be a T3 deletion
candidate — **DISCOVERED, unresolved**". T3 **resolved it**: the file was referenced by
nothing at all (not even `index.ts`), so it was deleted. T4 now starts from zero debt.

### T5 — xml — 15
`no-non-null-assertion` 6, `prefer-for-of` 3, `no-unused-vars` 2, `unified-signatures` 2,
`no-explicit-any` 1, `no-this-alias` 1 — `XmlBase.ts` 8, `XomTypes.ts` 7.
The cleanest cluster in the codebase; T5 can plausibly reach zero.

### T6 — mpm styles + defs — 103
`no-non-null-assertion` 84, `unified-signatures` 19

| n | file |
|---|---|
| 20 | `src/mpm/elements/styles/defs/RubatoDef.ts` |
| 17 | `src/mpm/elements/styles/defs/ArticulationDef.ts` |
| 15 | `src/mpm/elements/styles/defs/AccentuationPatternDef.ts` |
| 14 | `src/mpm/elements/styles/defs/OrnamentDef.ts` |
| 9 | `src/mpm/elements/styles/GenericStyle.ts` |
| 4 | `src/mpm/elements/styles/defs/TempoDef.ts` |
| 3 each | `ArticulationStyle`, `DynamicsStyle`, `MetricalAccentuationStyle`, `OrnamentationStyle`, `RubatoStyle`, `TempoStyle`, `defs/AbstractDef`, `defs/DynamicsDef` |

### T7 — mpm maps + data — 171
`no-non-null-assertion` 140, `unified-signatures` 23, `no-unused-vars` 7, `prefer-for-of` 1

| n | file |
|---|---|
| 32 | `src/mpm/elements/maps/ImprecisionMap.ts` |
| 24 | `src/mpm/elements/maps/data/MovementData.ts` |
| 22 | `src/mpm/elements/maps/data/DynamicsData.ts` |
| 17 | `src/mpm/elements/maps/GenericMap.ts` |
| 17 | `src/mpm/elements/maps/TempoMap.ts` |
| 12 | `src/mpm/elements/maps/RubatoMap.ts` |
| 7 | `src/mpm/elements/maps/DynamicsMap.ts` |
| ≤6 | `data/OrnamentData`, `MetricalAccentuationMap`, `MovementMap`, `OrnamentationMap`, `data/MetricalAccentuationData`, `data/TempoData`, `ArticulationMap`, `AsynchronyMap`, `data/RubatoData`, `data/ArticulationData`, `data/DistributionData` |

### T8 — mpm core — 212
`no-non-null-assertion` 169, `unified-signatures` 21, `no-explicit-any` 9,
`no-unused-vars` 7, `no-fallthrough` 3, `explicit-module-boundary-types` 2,
`no-extraneous-class` 1

| n | file |
|---|---|
| 74 | `src/mpm/elements/Performance.ts` (incl. all 3 `no-fallthrough`) |
| 36 | `src/mpm/elements/metadata/Metadata.ts` |
| 26 | `src/mpm/Mpm.ts` (+3 suppressed `any`) |
| 20 | `src/mpm/elements/Part.ts` |
| 17 | `src/mpm/elements/Dated.ts` |
| 17 | `src/mpm/elements/Header.ts` |
| 9 | `src/mpm/elements/Global.ts` |
| ≤6 | `metadata/RelatedResource`, `metadata/Author`, `metadata/Comment` |

The 3 `no-fallthrough` in `Performance.ts` are the only violations in this whole report
that could be reporting a **real bug** rather than a style issue. Check them against the
Java source before changing anything — deliberate fallthrough is likely, but confirm.

### T9 — msm — 132
`Msm.ts` 116, `Goto.ts` 9, `AbstractMsm.ts` 7. (137 → 132 in T3: `Msm.ts` lost the
`exportChroma`/`exportPitches` dead stubs, which carried `no-explicit-any` and
`explicit-module-boundary-types` violations.)

### T10 — mei — 682 (the big one)
`no-non-null-assertion` 577, `eqeqeq` 44, `no-unused-vars` 29, `no-explicit-any` 12,
`explicit-module-boundary-types` 8, `unified-signatures` 7, `no-require-imports` 3,
`no-extraneous-class` 1, `prefer-for-of` 1 —
`Mei2MsmMpmConverter.ts` 555 (+19 suppressed `any`), `Helper.ts` 96, `Mei.ts` 31.

(683 → 682 in T3: `Mei.ts` lost the `require()` in the deleted `exportMusicXml()`. The one
remaining `require()` in `Mei.ts` is the `Mei2MsmMpmConverter` lazy import that dodges the
import cycle — that one is **T18's** to remove, not T10's, and it is currently broken in
ESM, see the note in `tests/mei/Mei.test.ts`.)

`Mei2MsmMpmConverter.ts` alone is 38% of the entire remaining debt. T10's own note about
splitting into ≤3 sub-rounds looks right.

### T11 — midi — 33
`Midi.ts` 23, `MidiTypes.ts` 6, `EventMaker.ts` 3, `InstrumentsDictionary.ts` 1.
(37 → 33 in T3: `Midi.ts` lost the `exportMsm` dead stub, which carried `no-explicit-any`,
`explicit-module-boundary-types` and 2 `no-unused-vars` for its two ignored parameters.)

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

**Enabled now**: `no-param-reassign` at **`warn`** (default `props: false`) — **35 warnings**
after T3 (was 40), zero new errors, so it cannot turn the lint output red on its own.

| n | file |
|---|---|
| 7 | `src/midi/EventMaker.ts` |
| ~~5~~ | ~~`src/mei/Mei2MusicXmlConverter.ts`~~ — deleted in T3, the full −5 |
| 5 | `src/supplementary/RandomNumberProvider.ts` |
| 3 | `src/midi/Midi.ts`, 3 `src/midi/MidiTypes.ts` |
| 2 | `src/mpm/elements/maps/ImprecisionMap.ts`, `src/mpm/elements/styles/defs/RubatoDef.ts`, `src/msm/Msm.ts` |
| 1 | 9 further map/data files, 2 integration tests |

It is `warn` and not `error` on purpose: the charter grants the conversion/rendering core
an **explicit mutation boundary**, so a share of these are legitimate and only T12 can draw
the line. Do not "fix" them to zero before ARCHITECTURE.md exists.

**Measured but NOT enabled** (one-off preview, config not kept):

| rule | total | src only | verdict |
|---|---|---|---|
| `prefer-readonly` | 38 | 38 | **Enable in Phase 2.** Private fields never reassigned after construction — exactly the charter's "type-level immutability where it's free", zero runtime risk, small enough to clear per item. |
| `no-param-reassign` `{ props: true }` | 97 | 95 | The 57 beyond the 40 above are *mutations through* a parameter — i.e. the literal "don't mutate inputs" signal. **This is the number T12 should reason about** when drawing the mutation boundary; many will be the sanctioned `renderXToMap(map)` case. |
| `prefer-readonly-parameter-types` | 805 | 679 | **Do not enable.** Confirms its reputation; 679 in `src/` would drown every other signal. The facade's plain-data acceptance criterion (T13) is a better instrument than this rule. |
| `require-array-sort-compare` | 1 | 0 | Only site is in a test. No `.sort()`-without-comparator bug in `src/`. |

Note the charter's facade criterion — plain, structured-clone-safe data — is **not** a lint
property at all: no rule can tell a `readonly` wrapper around a live XomTypes node from
plain data. T13 needs the two behavioural tests the charter names (survives `postMessage`;
new value per change) rather than a lint rule.

Also unenforceable by lint, and worth restating from the charter: "no shared mutable
statics/singletons". The 15 `no-extraneous-class` hits are a partial proxy — every
static-only utility class is a candidate — but T12/T21 have to audit module-level mutable
state by hand.
