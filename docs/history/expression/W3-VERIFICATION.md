# W3 adversarial verification — full findings (2 lenses, 2026-08-09)


## Agent a5f33be2f76c2c5c0

**Verdict:** PASS-WITH-FIXES. The facade is in good shape on everything LENS A puts weight on except one hole. The pipeline.ts refactor is a verbatim extraction — `requireXmlText`, `parseOrThrow` and `DocumentKind` moved into `src/api/parse.ts` character-for-character, `ParseError` is still used at pipeline.ts:66/70/195 so no import went stale, nothing outside pipeline.ts and expression.ts referenced the old privates, and the full suite is green at 3814 with `tsc -p tsconfig.json` and `tsc -p tsconfig.tests.json` clean (the one eslint hit, `src/index.ts:172`, is untouched pre-existing code). RULE F1/N4 hold well beyond what the facade test pins: I swept all 24 fixtures × s ∈ {0, 0.5, 2, 8} × {no msm, raw msm, performed msm} and found no non-plain prototype, no getter, no `undefined`, no non-finite number, and exact `JSON`/`structuredClone` round-trips throughout. F2 holds — the emitted `.d.ts` for `api/expression` and `api/types` mentions XomTypes only inside comments. R1's carve-out is structural as claimed: `toEngineOptions` enumerates exactly the five fields the interior's `ExaggerateOptions` declares, `applyExaggeration` receives only `(root, factors, thatObject)`, and a malformed `options.msm` throws `ParseError: MSM: …` at line 213, before `runEngine` at 215. E2 held under an escape fuzz of 21 hostile option bags (arrays, functions, null sub-options, getter-based TOCTOU, 1e308 factors) and 7 hostile documents (DTD, entities, duplicate maps, a 20k-child distribution list) — every failure came back a `MeicoError`, and every interior `throw` site in `src/expression/**` (applier.ts:716/1783/1801, levels.ts:197, options.ts:102, transforms.ts:407) sits inside either the `checkExaggerateOptions` or the `runEngine` catch. The exception, and the reason this is not a clean PASS, is `canonicalMpm`: it is re-exported raw from the interior, so it constructs a document without going through `parseOrThrow` and hands consumers `@xmldom/xmldom`'s own `ParseError` — not a `MeicoError` — for malformed, empty, non-string or wrong-rooted input, which is exactly the foreign-class trap the sibling entry point tests against. Fix that one and the remaining five are documentation and null-spelling hygiene.

### [MAJOR] `canonicalMpm` bypasses the facade's typed-error boundary — a foreign `@xmldom/xmldom` ParseError escapes to consumers (RULE E2)

- **Claim:** `src/api/expression.ts:63` publishes the interior `canonicalBaseline` verbatim (`export { canonicalBaseline as canonicalMpm } from '../expression/mpmDocument.js'`). That function (`src/expression/mpmDocument.ts:78-80`) calls `new Builder().build(text)` directly, with no `parseOrThrow` wrap and no root-element check. So the one §4 export that exists specifically to be called on the SAME text as `exaggerateMpm` throws a class that is neither `MeicoError` nor this package's `ParseError` — precisely the foreign-class trap `src/api/parse.ts:22-29` was written to close, and which `tests/api/expression-facade.test.ts:212-214` pins for the other entry point. W3 also silently falsified parse.ts's own load-bearing sentence, "Every construction of a document therefore goes through here."
- **Evidence:** Executed via scratch `tests/expression/scratch-lensa.test.ts` against `src/api/index.js`:
  canonicalMpm('certainly not xml') -> constructor `ParseError`, `instanceof MeicoError === false`, `instanceof api ParseError === false`, message `"missing root element"` (no `MPM: ` prefix).
  canonicalMpm(null)  -> same foreign class, message `"source is not a string"`.
  canonicalMpm(undefined) / canonicalMpm(42) -> same.
  canonicalMpm('')  and canonicalMpm('   ') -> foreign `ParseError: missing root element`, where `exaggerateMpm('', …)` gives the typed `ParseError: MPM: expected XML text, got nothing`.
  canonicalMpm('<msm/>') -> returns `"<msm />"` with no error, where `exaggerateMpm('<msm/>', …)` throws `ParseError: MPM: expected a <mpm> root element, found <msm>`.
No test in `tests/api/expression-facade.test.ts` touches canonicalMpm's failure surface — it is used only as an oracle (lines 77, 87, 105, 423). `canonicalMpm` is on the published surface: `src/index.ts:62`.
- **Fix:** Stop re-exporting the interior function. Define in `src/api/expression.ts`:
```ts
export function canonicalMpm(mpm: XmlText): XmlText {
  return serializeMpmRoot(parseRoot('MPM', mpm, parseMpmRoot));
}
```
and give it `@throws {ParseError} the MPM is not well-formed, or has the wrong root element`. That reuses the existing `parseRoot` helper, makes the two entry points agree byte-for-byte on both the success and the failure path, and restores parse.ts's "every construction goes through here" invariant.

### [MINOR] DESIGN §2's amended R5a claims it is "pinned for every fixture pair × factor", but only its `@date` clause has a test

- **Claim:** R5a as newly written has three conjuncts: never writes `@date`, never adds or removes an element, never adds or removes an attribute — "True for every document, dimension and factor, and pinned for every fixture pair × factor." Only the first conjunct is pinned. The element and attribute clauses have no assertion anywhere. The property does in fact hold (I verified it), so this is an unpinned guarantee rather than a broken one — but the strongest, universal half of the split R5 rests on a coverage claim the suite does not back.
- **Evidence:** `tests/integration/expression-transform.test.ts:247-258` is the only document-level R5 test; its predicate is `datesIn()` at line 226, a `/\sdate(?:\.end)?="[^"]*"/g` match — it cannot observe an added/removed element or attribute. `grep -rn "R5a|adds or removes an attribute|attributeCount|same attribute set" tests/ src/` returns nothing.
I confirmed the property holds by scratch reproduction (`tests/expression/scratch-lensd.test.ts`): for all 24 `.mpm` fixtures under `tests/integration/fixtures/{reference,all-maps-reference}`, `exaggerateMpm(mpm, {factors: uniform(s)}).mpm.replace(/="[^"]*"/g,'=""')` equalled `canonicalMpm(mpm)` blanked the same way, for s ∈ {0, 0.25, 0.5, 2, 4, 8, 100} — 168 comparisons, all green.
Separately, `exaggerateMpm`'s JSDoc (`src/api/expression.ts:173-174`) tells consumers only "No `@date` is ever written"; the never-adds/removes-element/attribute half of the universal guarantee never reaches the reader of the API.
- **Fix:** Add the skeleton assertion to the R5 describe block (blank every attribute value with `/="[^"]*"/g` and compare against `canonicalMpm(mpm)`, per fixture × factor record) — it is three lines and covers both missing conjuncts. Then extend the JSDoc's R5 paragraph to state R5a in full rather than only its `@date` clause.

### [MINOR] `null` means "absent" for four facade options and "a value" for two — `performance: null` invents a performance name, `msm: null` throws

- **Claim:** The engine's `resolveOptions` normalises absence with `??` (`src/expression/options.ts:109,118,131,136,146`), so `scope`, `center`, `velocityRange`, `minRubatoWindow` and `performance` all treat `null` as absent. The facade's two own guards use strict `=== undefined` instead: `exaggerateMpm` line 213 (`options.msm === undefined ? null : readMsm(options.msm)`) and `requireSelectedPerformance` line 261 (`if (selector === undefined || …) return`). The result is that one option bag has two different meanings for `null`, and for `performance` the facade contradicts the engine within a single call — the engine treats `null` as "no selector, transform all", while the facade's guard treats it as a name selector and reports a name the caller never wrote.
- **Evidence:** Executed via scratch `tests/expression/scratch-lense.test.ts`:
  exaggerateMpm('<mpm xmlns=…/>', {factors:{tempo:2}, performance: undefined}) -> ok, `report.performances === []` (R4's no-op answer)
  exaggerateMpm('<mpm xmlns=…/>', {factors:{tempo:2}, performance: null})      -> `PerformanceNotFoundError: MPM: no performance named 'null'`
  (on a document that DOES have a performance, `performance: null` transforms it — i.e. the engine read `null` as "all" — so the two readings differ only in the error path, which is where it is least visible.)
  exaggerateMpm(mpm, {factors:{tempo:2}, msm: undefined}) -> ok, estimates null
  exaggerateMpm(mpm, {factors:{tempo:2}, msm: null})      -> `ParseError: MSM: expected XML text, got nothing`
These are the untyped-JS callers the module explicitly caters to — `checkExaggerateOptions` (lines 128-140) exists for exactly that audience.
- **Fix:** Use `== null` in both places (`eslint.config.js` blesses that idiom explicitly under `eqeqeq: ['error','always',{null:'ignore'}]`, and ARCHITECTURE RULE N5 names it load-bearing): `if (options.msm == null)` and `if (selector == null || report.performances.length > 0) return;`. That makes `null` mean "absent" uniformly across the whole option bag and removes the fabricated `'null'` in the message.

### [MINOR] `EngineInvariantError` is documented as "not a condition of the caller's input", yet its only reachable trigger is a caller option the validator accepts

- **Claim:** `src/api/errors.ts:44-47` (new in W3) states in bold: "**This is a bug in the library, not a condition of the caller's input**", and `exaggerateMpm`'s `@throws` line repeats "a bug to report". But the sole way to reach it is `minRubatoWindow` below ~1.1e-16 — a caller-supplied option value that `resolveOptions` (`src/expression/options.ts:132`) validates as in-domain because its domain is the whole open interval (0,1). The same module's header (lines 27-30) already knows the real floor: the guard is "chosen far below any audible window and far above the ~2⁻⁵³ at which the split's own rounding would decide the answer". So the option validator blesses a value it documents as below the guard's working range, and the caller is then told to file a library bug. (The *reachability* is adjudicated in §4 and LOG; what is not adjudicated is that the InvalidOptionError domain and the EngineInvariantError docstring contradict each other.)
- **Evidence:** Executed via scratch `tests/expression/scratch-lensc.test.ts` on a single-`<rubato>` document with `factors: {rubato: 2000}`:
  minRubatoWindow=1e-17   -> EngineInvariantError
  minRubatoWindow=1e-16   -> ok
  minRubatoWindow=1.1e-16 -> ok
  minRubatoWindow=2e-16 / 1e-15 -> ok
A sweep of 42 document/factor combinations over degenerate rubato windows ([0,1e-300], [1e-300,1], [0.5±1e-15], [0,1], [0.999999999,1], [0,1e-16], [1-1e-16,1]) × s ∈ {1e-6, 0.5, 2, 1e6, 1e12, 1e300} at the DEFAULT `minRubatoWindow` produced no throw at all — confirming no document alone can reach the class. Mechanically: `jointTrimWindow` (`src/expression/transforms.ts:521`) computes `Math.min(rawTrim, 1 - minWindow)`, and `1 - minWindow` only rounds to exactly 1 for `minWindow < 2⁻⁵³`.
- **Fix:** Pick one of the two contracts. Either tighten the option's validated domain in `resolveOptions` to the range where the guard can actually guard (`minRubatoWindow > Number.EPSILON`, message naming the IEEE reason) and let the sub-epsilon case be the `InvalidOptionError` it really is — accepting that `EngineInvariantError` then becomes defensive again and §4's REACHABLE note needs restating; or keep the wide domain and reword errors.ts so it does not promise the caller their input is innocent.

### [MINOR] `exaggerateMpm`'s `@throws {InvalidOptionError}` enumeration omits reachable causes that the facade's own tests pin

- **Claim:** The JSDoc (`src/api/expression.ts:200-203`) lists seven causes: unknown dimension key, non-finite factor, out-of-domain factor, inverted or non-positive `velocityRange`, `minRubatoWindow` outside (0,1), non-positive `center`, non-integer/negative `performance` index. It omits an unknown `scope`, a non-object `options`, and a non-object `factors` — all three of which are reachable, typed, and already pinned. RULE E2's "every documented throw reachable" has an inverse the lens asks for, and this is where the surface under-documents itself.
- **Evidence:** Reachable and pinned but undocumented: `tests/api/expression-facade.test.ts:285` (`scope: 'local'` → `unknown scope: "local"`), :295-299 (`{}` → `options.factors must be a record…`; `undefined` → `options must be an object…`). Thrown from `src/expression/options.ts:114-116` and `src/api/expression.ts:134-140` respectively. `center` is also rejected for non-finite, not only non-positive (`src/expression/options.ts:169`).
- **Fix:** Extend the `@throws {InvalidOptionError}` clause to "…an unknown `scope`, an `options` value that is not an object or whose `factors` is not a record, a `center` that is not a positive finite number, …".

### [MINOR] DESIGN §4's newly added error block names `SelectionNotFoundError`, a class that does not exist

- **Claim:** The error paragraph W3 added to §4 opens "Errors (RULE E2). Beyond InvalidOptionError and SelectionNotFoundError:". No `SelectionNotFoundError` exists in `src/api/errors.ts` or anywhere in the tree; the intended class, `PerformanceNotFoundError`, is defined two lines below in the same block. Since §4 is the export contract this wave is verified against, a name in it that nothing exports is a live mismatch in the check "everything §4 names is exported".
- **Evidence:** `docs/history/expression/DESIGN.md` §4, in the `git diff` hunk added by this wave (`+// Errors (RULE E2). Beyond InvalidOptionError and SelectionNotFoundError:`). `grep -rn "SelectionNotFoundError" src/ tests/` → no matches. `src/api/errors.ts` declares exactly: `ParseError`, `EmptyDocumentError`, `PerformanceNotFoundError`, `InvalidOptionError`, `EngineInvariantError`, plus re-exported `MeicoError`/`MissingNodeError`.
- **Fix:** Replace `SelectionNotFoundError` with `ParseError` in that sentence (the two errors §4 means "beyond" are the ones already specified above the block), or drop the name.


## Agent a622033f569dbc99e

**Verdict:** PASS-WITH-FIXES. The 188 tests are green (verified by execution) and most of what LENS B was sent to refute survives refutation: the EngineInvariantError control genuinely shares document AND factor with its subject (only `minRubatoWindow` differs), so it is a real control; the differing-ppq case has teeth — I inverted the ratio at `src/expression/estimates.ts:314` to `facts.ppq / performancePpq(performance)` and the test failed with `expected +0 to be 1`, then restored and diffed the file byte-identical; the four A14 sweeps are strictly monotone over ≥3 factors with well-separated readings and intact s=0 rationales, and `assertMonotone`'s `values[0] > 0` precondition makes a flat or empty metric impossible to pass; facade identity and determinism are byte-equality against `canonicalMpm`, which is an independent `serializeMpmRoot(parseMpmRoot(text))` (`mpmDocument.ts:78-80`) and therefore not tautological; the two R5 boundary controls are non-trivially invariant (I confirmed the v2 fixture's ornament moves milliseconds by ±18ms→±37ms at s=2 while every `date/duration` holds, and that `spread-ms` really does generate notes); and I found no length-unasserted loops or conditionally-skipped expects that could go empty. What does not survive is the headline pin itself: on `turn-atstart`, `turn-atend` and `trill-repetitions` the R5 render-level invariance test transforms a document that the engine writes nothing into — output byte-identical to `canonicalMpm` at every factor — so 18 of its 90 parameterised cases assert the baseline against itself, and the file's own stated anti-vacuity discipline does not reach them because the companion \"really changed\" test uses the unreduced factor record. Combined with R5a's structural half being pinned on one fixture at one factor against a DESIGN sentence promising \"every fixture pair × factor\", and A14's \"per-row\" obligation delivered for 4 rows of 15, the wave's three headline claims are each pinned more narrowly than they are written. None of this is evidence the engine is wrong — every probe I ran found the implementation behaving as designed — so these are test-and-text fixes, not code fixes, and finding 1's fix (one `totalWrites > 0` assertion plus a v3 fixture carrying a non-ornament map) is small enough to land inside W3. Housekeeping note: I deleted my own scratch file, but `tests/expression/scratch-lensa.test.ts`, `scratch-lensb.test.ts` and `scratch-lensc.test.ts` remain untracked in the tree — a sibling agent overwrote the `scratch-lensb.test.ts` path with its own LENS A probes mid-run, so I left all three alone; confirm they are gone before this wave is committed.

### [MAJOR] The R5 render-level invariance pin is vacuous on all three v3 tick-frame fixtures — 18 of 90 cases compare a byte-identical document against itself

- **Claim:** `tests/integration/expression-transform.test.ts:236-245` excludes `symbolicallyMoving` from the factor record before transforming. For `turn-atstart`, `turn-atend` and `trill-repetitions` (PAIRS lines 126-128), removing `ornamentSpread`/`ornamentSpacing` leaves **no dimension that writes anything at any factor**, so the assertion `symbolicShape(perform(exaggerated)) toEqual symbolicShape(baseline)` renders the canonical baseline twice and compares it to itself. The file's own docstring (lines 8-10) states the opposite discipline — "every case also proves the document moved, by the report's own `totalWrites` and by a rendered difference" — and that guarantee does not hold here, because the companion "really changed" describe (line 267-273) uses the FULL `uniformFactors(2)`, i.e. exactly the two dimensions the invariance test removed. The consequence is that R5b's v3 half — "holds for v3 documents whose ornament frames are millisecond-resolved" — is pinned only for the three ornament dimensions and never for tempo, dynamics, rubato, articulation, accentuation, asynchrony, imprecision or pedalShape on any v3 document at all.
- **Evidence:** Executed probe (scratch test, since deleted). `report.totalWrites` after `without(uniformFactors(s), ['ornamentSpread','ornamentSpacing'])`, for the six FACTOR_RECORDS:

```
turn-atstart       1.5=0  dyn2=0  0.25=0  2=0  6=0  0=0
turn-atend         1.5=0  dyn2=0  0.25=0  2=0  6=0  0=0
trill-repetitions  1.5=0  dyn2=0  0.25=0  2=0  6=0  0=0
```

Stronger, at the byte level — `expect(exaggerateMpm(mpm, {factors: without(uniform(s), ORN)}).mpm).toBe(canonicalMpm(mpm))` PASSED for all three fixtures at s ∈ {0, 0.25, 2, 6}. The document under test is literally the baseline.

And per-dimension writes at full `uniform(2)` across the whole v3 fixture set:

```
spread-ms          total=5  ornamentSpread=2 ornamentSpacing=1 ornamentDynamics=2
v2-passthrough     total=4  ornamentSpread=2 ornamentDynamics=2
turn-atstart       total=2  ornamentSpread=2
turn-atend         total=2  ornamentSpread=2
trill-repetitions  total=2  ornamentSpread=2
```

No non-ornament dimension writes on any v3 fixture in PAIRS. (The R5a `@date` test at lines 247-257 is NOT affected — it sweeps the full factor records and is genuinely non-vacuous on these pairs.)
- **Fix:** Add `expect(report.totalWrites, 'the invariance case must have moved something').toBeGreaterThan(0)` inside the per-factor `it` at line 238 — it will fail today for exactly these three pairs, which is the point. Then give the R5b v3 claim real content: extend one v3 generating fixture (or add a fourth) with a non-ornament map — a second `<tempo>` instruction and an `<articulationMap>` are enough — so that the reduced factor record has live writes and the "v3 minus the two timing dimensions is invariant" claim is actually exercised.

### [MAJOR] R5a's "pinned for every fixture pair × factor" overclaims: only the @date third is swept; the add/remove-element and add/remove-attribute thirds sit on one fixture at one factor

- **Claim:** `docs/history/expression/DESIGN.md:187-190` states R5a as three conjuncts — "never writes `@date`, never adds or removes an element, and never adds or removes an attribute" — and then asserts it is "pinned for every fixture pair × factor". The facade suite pins only the first conjunct. The structural conjuncts are pinned nowhere in the two new files; the only pin in the repo is `tests/expression/exaggerationProperties.test.ts:490-499`, which runs on a single `ADVERSARIAL` fixture at a single factor (s = 2). Since R5a is the requirement W3 newly minted to carry what R5b gave up, an unpinned two-thirds of it is a live gap, not a stylistic one.
- **Evidence:** `tests/integration/expression-transform.test.ts:247-257` — the only per-pair × per-factor structural pin — matches with `datesIn = (mpm) => mpm.match(/\sdate(?:\.end)?="[^"]*"/g)` and asserts array equality against the s=1 canonical form. Nothing counts elements or attributes. Grep for the structural pin returns exactly one hit repo-wide:

```
tests/expression/exaggerationProperties.test.ts:490:  it('leaves every element and attribute in place — nothing is created or deleted', () => {
    const { xml } = exaggerate(ADVERSARIAL, uniformFactors(2));
    expect(collectAttributes(xml).size).toBe(collectAttributes(canonicalBaseline(ADVERSARIAL)).size);
    expect(xml.match(/<[a-zA-Z]/g)?.length).toBe(canonicalBaseline(ADVERSARIAL).match(/<[a-zA-Z]/g)?.length);
```

One fixture, one factor — against a DESIGN sentence promising 15 pairs × 6 factors.
- **Fix:** Two lines inside the existing per-pair `it` at `expression-transform.test.ts:247`: capture `canonicalMpm(pair.mpm)`'s attribute-name multiset and `<`-tag count once, then assert both are unchanged for each of the six factor records — reusing the same `for (const [, factors] of FACTOR_RECORDS)` loop that is already there. Alternatively narrow the DESIGN sentence to what is pinned; do not leave the claim broader than the test.

### [MAJOR] A14 is adjudicated "per-row" but only 4 of 15 dimensions get a rendered-direction sweep, and the 11 without one are covered solely by the document-level tests A14 says prove nothing

- **Claim:** `docs/history/expression/DESIGN.md:89` and LOG A14 both word the obligation as **per-row** "expected direction" render tests, and the reason given at DESIGN.md:84-88 is that P1–P5 hold for any monotone bijection with the right neutral, so only a render validates a registry metric choice. The A14 describe (`tests/integration/expression-transform.test.ts:395-480`) sweeps four dimensions: tempo, dynamics, articulation, asynchrony. There is no rendered-direction sweep for tempoShape, dynamicsShape, rubato, accentuation, ornamentSpread, ornamentSpacing, ornamentDynamics, imprecisionTiming, imprecisionDynamics, imprecisionDuration or pedalShape. Several of those are precisely the rows whose metric was contested during registry compilation — OPEN-2's joint trim reparameterisation for rubato, the boundary-power spaces for tempoShape/dynamicsShape/pedalShape — so they are the rows A14 exists for. `tests/expression/applierDimensions.test.ts` does cover all of them, but at the document level (attribute values, report states), which is the exact class of evidence DESIGN.md:84-88 rules insufficient. Nothing in either of the two newest LOG entries records a decision to narrow A14 to four rows.
- **Evidence:** The four sweeps and their readings, all verified genuinely monotone and non-degenerate by direct execution (so this is a coverage finding, not a soundness one — the four that exist are sound):

```
tempoContrast        0:1.0000000000000007  0.5:1.4142  1:2  1.8:3.4822
dynamicsSpread       0.25:16.67  0.5:34.44  1:75  1.6:99.87  (2:104.53  3:112.97)
articulationSpread   0:0  0.5:28.83  1:55  2:101
asynchronyDeviation  strictly increasing over [0.5,1,2], linear check at 2× passes
```

`assertMonotone` (lines 385-393) is a correct strict test: it asserts `values[0] > 0` first, so a document where the dimension found nothing cannot pass, and then strict `>` pairwise. All four use ≥3 factors and each keeps its s=0 rationale (tempo asserts `tempoContrast(0) ≈ 1`; articulation asserts spread(0) ≈ 0; asynchrony uses s=0 as its neutral baseline; dynamics has its own dedicated s=0 pair-collapse test at lines 429-442). The gap is which rows have one at all.

Note in particular `renderedShape`'s own docstring (lines 205-210) singles out pedalShape as "the one dimension that renders exclusively into control changes" — and pedalShape has no A14 sweep.
- **Fix:** Either add sweeps for the contested rows — rubato (window width vs s on the `rubato` fixture), pedalShape (control-change value spread on `movement`, the reading `renderedShape` already extracts), and the two shape rows — or record an explicit conductor ruling in LOG.md narrowing A14 from "per-row" to "one row per scale-space family" and name which four families the chosen dimensions represent. Right now the DESIGN text and the delivered suite disagree with nothing adjudicating between them.

### [MINOR] `all_maps` is excluded from the R5 anti-vacuity control on a rationale that is empirically false for that fixture

- **Claim:** `tests/integration/expression-transform.test.ts:120` marks `all_maps` `deterministicRender: false`, and the file docstring (lines 23-30) justifies it: "a document carrying an `imprecisionMap` renders differently every time". That is not true of this fixture — both of its distributions carry an explicit `seed="42"`, and its single part never reaches the `Math.random()` keeper pick in `shakePolyphonicPart`. The effect is that the widest document in the corpus (nine maps: tempo transition, rubato, dynamics transition, accentuation, articulation, asynchrony, movement, imprecision×2) is silently dropped from the R5 suite's ONLY anti-vacuity assertion — the "really changed" describe at line 267 filters on this flag.
- **Evidence:** Rendered `all_maps` 12 times in one process and hashed `[velocity, milliseconds.date, milliseconds.end]` per note: **1 distinct result over 12 runs**. The fixture's own markup (`tests/integration/fixtures/all-maps-reference/all_maps.mpm`) carries `<distribution.uniform date="0.0" limit.lower="-10.0" limit.upper="10.0" seed="42"/>` and `<distribution.uniform … limit.lower="-5.0" limit.upper="5.0" seed="42"/>`. `src/api/types.ts:126` confirms a per-distribution `seed` in the MPM always wins over the unseeded path. The bare `Math.random()` calls are at `ImprecisionMap.ts:531,540,554`, inside the polyphonic-keeper branch this monophonic part never enters.
- **Fix:** Drop `{ deterministicRender: false }` from line 120 (the `Pair.deterministicRender` field then has no user left and can go with it), or, if the exclusion is meant as a hedge against a fixture that might one day lose its seeds, narrow the docstring to "a document carrying an UNSEEDED imprecision distribution, or a polyphonic part reaching `shakePolyphonicPart`'s keeper pick" and record why this fixture is treated as if it were one.

### [MINOR] Both R5 boundary controls pin a write for ornamentSpread only, though the exception they bound names two dimensions and both fixtures have a live ornamentSpacing site

- **Claim:** The exception R5b carves out is `ornamentSpread`/`ornamentSpacing` jointly, and the divergence test (lines 297-318) correctly pins both. The two controls that bound it (lines 355-360 millisecond frame, lines 362-367 v2 frame) assert only `dimensions.ornamentSpread.writes > 0` before claiming invariance. Since both run `uniformFactors(2)`, `ornamentSpacing` does write in both — but nothing asserts it, so a regression that turned `ornamentSpacing` into a no-op on these documents would leave both controls green while they claim to bound a dimension they no longer touch. The asymmetry is unnecessary: both fixtures have a live `@intensity` site.
- **Evidence:** Executed with `{ ornamentSpacing: 2 }` alone (no other dimension in the record):

```
spread-ms:      spacing-only totalWrites=1  ornamentSpacing.writes=1
ornamentation:  spacing-only totalWrites=1  ornamentSpacing.writes=1
```

Source: `spread-ms.mpm` carries `<temporalSpread frame.offset="-30.0ms" frameLength="60.0ms" intensity="2.0" …/>`; `ornamentation.mpm`'s `spreadMs` def carries `intensity="2.0"`. Registry `src/expression/registry.ts:537` confirms `ornamentSpacing` targets `<temporalSpread>@intensity`.

Separately verified that both controls ARE non-trivially invariant, which is the good news: at `ornamentSpread: 2` the v2 fixture's twelve notes keep every `date/duration` while their milliseconds move (e.g. `@-18.33` → `@-36.67`, `@2030` → `@2060`), and `spread-ms` generates two extra notes at 2880/1440 whose symbolic geometry is unchanged while their milliseconds shift `@1985→@1970`, `@2030→@2060`.
- **Fix:** Add `expect(report.performances[0].dimensions.ornamentSpacing.writes).toBeGreaterThan(0)` beside the existing spread assertion in both controls.

### [MINOR] Five error-surface cases assert only the class or only the message, not both — the two `options.msm` cases are the ones that matter

- **Claim:** The lens contract for RULE E2 is class AND message. Most cases meet it (the `rejects()` helper at lines 247-250 does both for every InvalidOptionError case; EngineInvariantError does both). Five do not: root-not-`<mpm>` (219-223, message only), empty/blank input (225-232, message only), non-string input (234-236, class only), both `options.msm` cases (238-243, message only), and PerformanceNotFound-by-index (319-323, message only). The `options.msm` pair is the consequential one: `parseRoot` is shared between MPM and MSM and the MSM path is new in this wave, so a refactor that routed MSM failures through `InvalidOptionError` — defensible-looking, since a bad `options.msm` IS an option — would keep both assertions green while breaking the documented `@throws {ParseError}` contract at `src/api/expression.ts:204-205`.
- **Evidence:** `tests/api/expression-facade.test.ts:239-242`:

```ts
expect(() => exaggerateMpm(SPANS, { factors, msm: '<msm' as XmlText })).toThrow(/^MSM: /);
expect(() => exaggerateMpm(SPANS, { factors, msm: '<mpm/>' as XmlText })).toThrow(
  /MSM: expected a <msm> root element, found <mpm>/,
);
```

No `toThrow(ParseError)`. Compare the sibling MPM case at 215-216, which does both. Same shape at 220-222 (root check), 229-231 (empty/blank), 320-322 (index).
- **Fix:** Add the missing half to each of the five — a `toThrow(ParseError)` / `toThrow(PerformanceNotFoundError)` line, or fold them into a small `rejects(kind, thunk, pattern)` helper mirroring the InvalidOptionError one at line 247 so the pairing cannot be forgotten again.

### [MINOR] `it.each` row order is inverted in the empty/blank ParseError case: two tests named apart only by whitespace, and the labels are dead parameters

- **Claim:** `tests/api/expression-facade.test.ts:225-232` passes rows `['', 'empty']` and `['   ', 'blank']` to a callback declared `(text) => …` with a title of `'rejects %s input as "got nothing"'`. Vitest spreads the row positionally, so both `%s` and `text` bind to index 0 — the input — and the human labels at index 1 are never read. The two resulting test names differ only in the number of spaces, which makes a failure report ambiguous and defeats the point of writing the labels at all.
- **Evidence:** Verbose runner output:

```
✓ … > ParseError > rejects  input as "got nothing" 0ms
✓ … > ParseError > rejects     input as "got nothing" 0ms
```

Every other `it.each` in the file puts the label first (`['not well-formed', '<mpm><performance></mpm>']` at 208-211, `['by name', 'Second']` at 402-404) and takes it as `_why` / `_how` — this one is the odd one out.
- **Fix:** Swap the columns to `[['empty', ''], ['blank', '   ']]` and take `(_why, text)`, matching the ParseError case three lines above it.
