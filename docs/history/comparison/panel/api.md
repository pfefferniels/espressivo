# W1 panel — API / house-rules lens

Target: `comparison/DESIGN.md` §9 (API), §8 (corpus), and every report-shape / option /
error claim elsewhere in the design that those two sections cash out.

Method: each claim in §9 and §8 was read against (a) the binding rules in
`refactor/ARCHITECTURE.md`, (b) the verbatim restatement of those rules in
`comparison/survey-code.md` §4.2 and the checklist in §9.4, and (c) the *shipped* precedent —
`src/api/expression.ts`, `src/api/errors.ts`, `src/api/parse.ts`, `src/api/types.ts`,
`src/expression/registry.ts`, `src/expression/report.ts`, `src/index.ts`,
`tests/api/plain-data.test.ts`, `eslint.config.js`, `vitest.config.ts`, `package.json`.

Severities: **CAPITAL** = violates a binding rule, or is unimplementable/self-contradictory
as specified. **MAJOR** = inconsistent with precedent in a way that will bite consumers or
force a breaking change. **MINOR** = under-specification or friction.

Quoted DESIGN text is cited by line number in the W1 DRAFT read for this review
(`comparison/DESIGN.md`, 662 lines).

---

## CAPITAL

### A1 — `options.jnd`'s key format is never defined, and the only plausible key is provably ambiguous

**Claim.** `DESIGN.md:547`:

```ts
  readonly jnd?: Partial<Record<string, number>>;  // per REGISTRY row key
```

reinforced at `DESIGN.md:431-432`: *"all overridable via `options.jnd` (partial record,
**validated keys**) while the defaults stay the documented reference"*, and at
`DESIGN.md:198-199`: *"`[convention]` values are overridable via options while remaining the
documented default."*

**Rule / precedent.** `src/expression/registry.ts:756-758` defines the registry's own key:

```ts
function siteKey(elementLocalName: string, attribute: string): string {
  return `${elementLocalName}@${attribute}`;
}
```

— an **(element, attribute)** pair, not an attribute name. And even that pair is not unique:
`registry.ts:788-793` says so in the shipped code's own words —

> **The pair is unique for every row except the imprecision ones.** `<distribution.uniform>`
> appears identically in three maps and therefore in three dimensions … A caller that needs
> the right `dimension` must use {@link rowForIn}.

`rowForIn` (`registry.ts:799-810`) keys on `(dimension, element, attribute)`. The comparison
registry (`DESIGN.md:174-186`) copies the expression row shape — `{ dimension, attribute,
sites, … }` — so it inherits the ambiguity exactly.

**Concrete failure.** Attribute names collide across dimensions in the live registry
(measured over `src/expression/registry.ts`): `transition.to` ×3 (tempo, dynamics, ornament
`dynamicsGradient`), `curvature` ×2 (dynamics, pedal), `protraction` ×2 (dynamics, pedal),
`intensity` ×2 (rubato, ornament), `value` ×2 (tempoDef, dynamicsDef); every
`distribution.*` attribute appears in three imprecision dimensions. A caller writing
`jnd: { 'transition.to': 0.02 }` has expressed no determinate intent, and the module cannot
implement "validated keys" against a vocabulary that does not exist. Worse, `Partial<Record<
string, number>>` is not a type check at all: `Record<string, number>` already admits every
string, so TypeScript accepts `jnd: { tenpo: 1 }` silently — the exact failure mode
`ExaggerateOptions.factors` was designed to prevent (`src/api/types.ts:164-171`: *"an unknown
one is an `InvalidOptionError` rather than a silent identity, because the silent version is
undetectable to a caller who misspelled a key while sampling"*). And `Partial<Record<string,
X>>` introduces `X | undefined` into every value read.

**Repair.** (1) Define the key in §4 as a **string tag emitted by the comparison registry**,
`` `${dimension}/${element}@${attribute}` ``, and export the closed vocabulary as data:
`export const COMPARISON_JND_KEYS = [...] as const; export type ComparisonJndKey =
(typeof COMPARISON_JND_KEYS)[number];`. (2) Type the option
`Partial<Record<ComparisonJndKey, number>>` so misspellings fail at compile time as `weights`
already does. (3) State the runtime validation (unknown key, non-finite, ≤ 0 — a zero JND
divides) as `InvalidOptionError`, and state that the *effective* jnd vector is echoed in the
report (see A11). (4) If a dimension-level override is also wanted, give it a separate,
explicitly-named option rather than overloading one string space.

---

### A2 — `scape?: {…} | null` violates RULE N4's input clause

**Claim.** `DESIGN.md:572`:

```ts
  readonly scape?: { readonly bins: number } | null; // default null
```

**Rule.** `refactor/ARCHITECTURE.md:685-693`, RULE N4, quoted verbatim in
`comparison/survey-code.md` §4.2:

> In `src/api/types.ts`, every field of every *output* type is always present; absence is
> `null`. **Every *input* option is `?:` and is never `null`.**

and RULE N1 (`ARCHITECTURE.md:588-593`): *"A function … must not accept `null` to mean 'use
the default'. Optional parameters and optional object properties use `?:`."* The checklist
restates it: `survey-code.md` §9.4 item 6.

**Concrete failure.** `scape` is the only input option in §9 typed `| null`, and its stated
default is `null` — which is precisely the "null means use the default" that N1 forbids. It
also breaks the option-bag's own uniformity: `k` on the very next lines uses the compliant
spelling (`DESIGN.md:570`, *"omit = none"*). A caller who normalises their option bag by
spreading `{...defaults, ...user}` will hand `null` to some options and `undefined` to
others for the same meaning.

**Repair.** `readonly scape?: { readonly bins: number };` with the comment "omit for no
scape", exactly as `k` is spelled. Audit the rest of §9 for the same shape when the result
types are written out (A19) — N4 has no lint enforcement (`survey-code.md` §7.2: *"RULE N4
has **no lint enforcement** — it is review plus the grep the rule itself specifies"*), so
this is caught by review or not at all.

---

### A3 — the "every numeric finite or null" promise has at least four reachable NaN paths

**Claim.** `DESIGN.md:582-583`: *"Result shapes (all plain data, readonly, `null` for
absence, JSON-safe; **every numeric finite or null**)"*, and R2 (`DESIGN.md:88-89`):
*"Identical inputs yield identical output bytes (JSON-serialized reports)."*

**Rule.** RULE F1 (`ARCHITECTURE.md:204-220`) is enforced by a shipped, mechanical test —
`tests/api/plain-data.test.ts:127-128`:

```ts
      // `NaN`/`Infinity` are not JSON round-trip stable — `JSON.stringify` writes `null`.
      if (typeof node === 'number') expect(Number.isFinite(node), `${path} is finite`).toBe(true);
```

That test walks every node of a facade result. A comparison result added to it goes red on
any of the paths below.

**Concrete failures.**

1. **Zero-length window ⇒ `mean` is NaN.** §1.1 (`DESIGN.md:36-37`) defines the reported
   mean as `d_k / L`, and §9's report carries `mean` per dimension and in `aggregate`
   (`DESIGN.md:587-591`). §5.0 (`DESIGN.md:215-218`) sets `end` = *"the max over both
   documents of the last dated instruction"* when no MSM is given. Two documents whose only
   instructions sit at `date="0"` — a single `<tempo date="0" bpm="…">` each, entirely
   ordinary — give `end = 0`, so `L = 0` and `mean = 0/0 = NaN`. The same happens for any
   caller-supplied `window` with `start === end` (A16).
2. **Degenerate corpus ⇒ `explainedVariance` is NaN.** §8 (`DESIGN.md:510-511`): *"explained
   variance over `Σ|λ|` (never `Σλ⁺`)"*. A corpus in which every pair-distance is 0 —
   the same document listed twice, or two performances that canonicalise identically, which
   is exactly what P-C1 (`DESIGN.md:607-608`) pins as *"exactly 0"* — has `B = 0`, all
   eigenvalues 0, and `Σ|λ| = 0`. Every `explainedVariance` entry is `0/0`.
3. **All-zero weights ⇒ same, through the aggregate matrix.** §7.4 (`DESIGN.md:479-480`)
   *recommends* zero weights as the documented Welte recipe (`weights: { dynamics: 0, … }`),
   so an all-zero or nearly-all-zero vector is a typo away from a featured workflow, and the
   aggregate matrix becomes identically 0 with the same consequence as (2).
4. **`normalization: 'corpus'` on a both-neutral dimension.** `DESIGN.md:519-521`: *"one
   constant ω vector derived from the matrix (**per-dimension median of nonzero `d_k`**)"*.
   A dimension that is `both-neutral` across the whole corpus — R6 guarantees the dimension
   is *never dropped* (`DESIGN.md:108-110`), so this is the normal case for, say, `pedal` in
   a corpus of harpsichord rolls — has an **empty** nonzero set. The median of the empty set
   is undefined; whatever it becomes propagates into `normalizationConstants` and, if the
   constant is a divisor, into every aggregate number.

**Repair.** State a finiteness discipline in §9 and make it testable:
(a) `L = 0` ⇒ `mean: null` per dimension and in `aggregate`, with a typed note; or reject a
zero-length window as `InvalidOptionError` and define the no-dated-instruction case
explicitly (a documented minimum window, or an `EmptyDocumentError`-analogue).
(b) `Σ|λ| = 0` ⇒ `explainedVariance: readonly null[]` (or an all-zero vector with an
explicit `degenerate: true` flag) — pick one and say which.
(c) `normalization: 'corpus'` with an empty nonzero set for dimension *k* ⇒
`normalizationConstants[k] = null` and ω_k falls back to the fixed default, stamped.
(d) Add a property to §10: **P-C11 finiteness** — every number in every result of every
fixture pair and of the degenerate corpora (N=1, duplicated document, all-zero weights,
zero-length window) is finite, run through the same walker as
`tests/api/plain-data.test.ts:123-147`.

---

### A4 — `matrices` names two incompatible layouts and gives no index function

**Claim.** `DESIGN.md:600-601`: *"`CorpusResult`: `labels`, per-dimension + aggregate
`matrices` (**packed row-major, symmetric**)"*, against §8's *"Matrices. Per-dimension and
aggregate, full precision, **exactly symmetric** … **zero diagonal by construction**"*
(`DESIGN.md:495-497`).

**Rule.** RULE F1 permits `number[]`, so a flat array is the right *type*; the defect is that
"packed" and "row-major symmetric" are two different arrays. "Packed" conventionally means
the strict upper triangle, `N(N−1)/2` entries, indexed `i·N − i(i+1)/2 + (j−i−1)`; "row-major
symmetric with zero diagonal" means `N²` entries indexed `i·N + j`. There is no reading that
satisfies both. F2a's own heading is the governing lesson here (`ARCHITECTURE.md:229`):
*"'XML strings' is not a specification."*

**Concrete failure.** A consumer indexing `m[i * n + j]` against a packed array reads a
different pair's distance and reports it as fact; there is no length at which the two
layouts coincide for `N > 1`. `CorpusResult` also carries no `n` — the consumer must infer it
from `labels.length`, which A8 shows is not reliably a distinct-item count.

**Repair.** Choose one and write the index arithmetic into §9 as normative text. Recommended:
**full row-major `N²`**, because it costs at most 100×100×8 bytes ≈ 80 kB at R10's ceiling,
needs no index helper, survives `JSON.stringify` unchanged, and lets a consumer feed the
array straight to any matrix library. Add `readonly n: number` to `CorpusResult`, state
"`matrices.aggregate[i*n+j] === matrices.aggregate[j*n+i]` bit-for-bit and
`matrices.aggregate[i*n+i] === 0`", and make that a pinned assertion (it is R2's symmetry
claim at the corpus level and currently has no test named in §10). State the per-dimension
container too: `Record<ComparisonDimension, readonly number[]>`, a **full** record per A13's
precedent (`src/expression/report.ts:228`).

---

### A5 — `CompareCorpusOptions` declares `window`/`weights`/`jnd`/`invariance` in a comment, so the interface as written cannot accept them

**Claim.** `DESIGN.md:559-572`, the normative signature block:

```ts
export interface CompareCorpusOptions {
  readonly items: readonly { … }[];
  readonly msm?: XmlText;
  // window/weights/jnd/invariance as above — ONE set for the matrix
  readonly normalization?: 'fixed' | 'corpus';
  …
}
```

**Rule / precedent.** §2.2 of `ARCHITECTURE.md` is explicitly *normative* for the facade
(`ARCHITECTURE.md:1076`: *"§2.2's signature block is **normative**"*), and the campaign's own
checklist (`survey-code.md` §9.4 item 5) treats the entry-point signature as a hard
constraint. A commented-out field is not a field.

**Concrete failure.** As written, §8's central guarantee — *"**One window, one option set, one
weight/jnd/invariance vector** for the entire matrix … every matrix entry is a value of ONE
function (R3)"* (`DESIGN.md:492-494`) — has no API surface. A caller cannot request the Welte
timing-only recipe (`DESIGN.md:479-480`) at corpus level at all, which is the one corpus
recipe §11 promises for the W4 cookbook (`DESIGN.md:654-655`). This also hides a design
decision that must be made and stated: whether the shared knobs live in a nested
`readonly comparison?: SharedComparisonOptions` sub-object reused by all three entry points,
or are repeated field-by-field.

**Repair.** Factor the shared knobs into one declared, exported interface and *include* it in
both option types:

```ts
export interface ComparisonSettings {
  readonly window?: { readonly start: number; readonly end: number };
  readonly weights?: Partial<Record<ComparisonDimension, number>>;
  readonly jnd?: Partial<Record<ComparisonJndKey, number>>;   // A1
  readonly invariance?: Partial<Record<ComparisonDimension, InvarianceMode>>;
  readonly noteDensityWeight?: boolean;
}
export interface CompareMpmOptions extends ComparisonSettings { … }
export interface CompareCorpusOptions extends ComparisonSettings { … }
```

That also gives §8's "one option set for the matrix" a name to be stamped under, and gives
A11's echo a single shape.

---

## MAJOR

### A6 — the error vocabulary cannot say *which* document failed

**Claim.** `DESIGN.md:575-579`:

```
// Errors: InvalidOptionError (…); PerformanceNotFoundError (same semantics/messages as
// the expression facade); EngineInvariantError (…). Parse failures surface via parseOrThrow.
```

**Rule / precedent.** RULE E2 (`ARCHITECTURE.md:988-991`): *"Every error carries the offending
document kind and, where cheap, the element name."* The mechanism that carries it is
`src/api/parse.ts:13`:

```ts
export type DocumentKind = 'MEI' | 'MSM' | 'MPM';
```

used as the message prefix by `requireXmlText` (`parse.ts:18-19`), `parseOrThrow`
(`parse.ts:34-37`) and `parseRoot` (`src/api/expression.ts:84-93`). The expression facade's
`PerformanceNotFoundError` messages are `src/api/expression.ts:327-331`:

```ts
      ? `MPM: no performance at index ${selector}; the document has ${readPerformances(root).length}`
      : `MPM: no performance named '${selector}'`,
```

**Concrete failure.** With two MPM documents in play, *"same messages as the expression
facade"* is self-defeating: `ParseError: MPM: unclosed tag …` and
`PerformanceNotFoundError: MPM: no performance named 'Hofmann'` do not say whether `a` or `b`
is at fault, and the caller holds two strings that are interchangeable to the type system —
the very hazard F5 exists to close (`ARCHITECTURE.md:407-411`). At corpus level it is worse:
`items` may hold up to ~100 documents (`DESIGN.md:491`), and an error naming none of them
sends the caller bisecting their own corpus. E2's "offending document kind" is satisfied in
letter and defeated in substance.

**Repair.** Extend the message prefix with a **role**, not the kind alone, and say so in §9:
`MPM a: …`, `MPM b: …`, `MPM items[7] "Hofmann 1905": …`. Mechanically this is one optional
label parameter threaded through `parseRoot`/`requireXmlText`/`parseOrThrow` (or a
`DocumentRole` string concatenated onto `DocumentKind` at the call site — no change to
`DocumentKind` itself, so no effect on the existing two facades' messages). Then strike
*"same semantics/messages as the expression facade"* and replace it with *"same semantics;
messages additionally name the document role, because two are in play"*. Add one assertion
per error class to §10 pinning that the role appears in the message.

---

### A7 — P-C6's corpus-permutation promise contradicts §8's index-based tie rules

**Claim.** `DESIGN.md:621-624`, P-C6: *"corpus permutation → permuted (not re-tie-broken)
matrices, **same dendrogram topology up to relabeling**"* — against §8's tie rules
(`DESIGN.md:502-507`): *"Ties: merge the lexicographically smallest `(min index, max index)`
pair; children ordered by smallest contained index … BUILD/SWAP ties by lowest index"*, and
`DESIGN.md:512`: *"Eigenvector signs fixed (largest-magnitude component positive, **ties by
lowest index**)"*.

**Concrete failure.** Every tie rule in §8 is a function of the caller's item order.
Permuting `items` renumbers the indices, so a tie that resolved to `(0,3)` before can resolve
to `(1,2)` after — a *different merge*, hence a different dendrogram topology, not a
relabeling of the same one. The claim would be safe only if exact ties were unreachable, and
they are not: P-C1 (`DESIGN.md:607-608`) guarantees `compare(A, A)` is **exactly** 0, so a
corpus containing one document twice (or a document and its `canonicalMpm`, or two
performances that differ only in an inert row) produces exact zero ties; R6's never-drop rule
(`DESIGN.md:108-110`) makes `both-neutral` dimensions produce large blocks of exactly-equal
distances; and §8's own item-expansion (`DESIGN.md:487-489`) makes duplicate content easy to
introduce by accident. Ties here are structural, not measure-zero.

**Repair.** Two coherent options; take the second.
1. Weaken P-C6 to *"permutation-equivariant on corpora with no exact ties (asserted by the
   fixture), plus a pinned test that a tied corpus is stable under the documented index rule
   and therefore **not** permutation-invariant"* — honest but leaves a real trap.
2. **Make every tie rule label-based rather than index-based** — merge the pair whose
   `(min label, max label)` is lexicographically smallest; order children by smallest
   contained label; PAM BUILD/SWAP by lowest label; eigenvector sign ties by lowest label.
   With unique labels (A8) that *is* permutation-invariant, so P-C6 becomes true as written,
   and the promise survives the caller sorting their corpus differently between two runs.
   State the string comparison explicitly as code-unit order (`<`), not `localeCompare`,
   which is locale-dependent and would break R2's byte-identity across environments.

---

### A8 — corpus labels: never required unique, no default, and referenced by two different keys

**Claim.** `DESIGN.md:487-489`:

> `items: readonly { mpm: XmlText; performance?: string | number; label?: string }[]`. An item
> naming no performance in a multi-performance document EXPANDS to one item per performance
> (labels `«docLabel»:«perfName»`)

and `DESIGN.md:600-604`: `CorpusResult` carries `labels`, `dendrogram`, `medoids/clusters`,
`seriationOrder`, `profiles`.

**Concrete failures.**
1. `«docLabel»` is undefined when `label` is omitted — there is no fallback rule (index?
   `<performance name>`? empty string?), and `label` is optional.
2. Uniqueness is never required. Two items with no label, or two documents legitimately
   labelled `"Welte 1905"` holding a performance each called `"default"`, produce identical
   entries in `labels`. Nothing detects it.
3. The result mixes keys: `matrices` are index-keyed (A4), `dendrogram.merges` carry
   `{left, right}` (indices, per the SciPy convention §8 cites at `DESIGN.md:504-505`), while
   `medoids` are described in prose as *"real performances — 'the most typical Hofmann'"*
   (`DESIGN.md:506`), i.e. by label. A duplicate label makes "the most typical Hofmann"
   ambiguous in the one product whose entire value is that it names a real performer.
4. A7's repair depends on unique labels; without them, label-based tie-breaks are themselves
   ill-defined.

**Repair.** (a) Define `docLabel` explicitly: `label ?? \`items[${i}]\``. (b) Require
uniqueness **after expansion** and throw `InvalidOptionError` naming every colliding label
and the item indices that produced it — precedent for the all-offenders-at-once message shape
is `src/api/expression.ts:504-512` and its rationale at `src/api/errors.ts:43-58`. (c) State
that every cross-reference in `CorpusResult` (`dendrogram`, `medoids`, `clusters`,
`seriationOrder`, `profiles`, `scape`) is **by index into `labels`**, and that `labels` is the
only place a string appears; a consumer joins them itself. (d) Add the expansion's own
provenance to the result — `readonly items: readonly { itemIndex: number; performance: string
}[]` — so a caller can map a row back to the input item it was expanded from.

---

### A9 — P-C2's byte-identity promise has no ordering rules to stand on

**Claim.** `DESIGN.md:609-610`, P-C2: *"symmetry: `compare(a,b)` vs `compare(b,a)` —
**bit-identical serialized reports** (modulo the a/b field swap)"*, and R2
(`DESIGN.md:90-93`): *"Symmetry is bit-exact … agree to the last bit on every number."*

**Concrete failure.** R2 and P-C2 are argued entirely about *numbers* (sorted-union grids,
`|x−y|` cells, Neumaier summation). But a serialized report is bytes, and the report carries
arrays whose order comes from document traversal, none of which §9 orders:
`parts` (*"pairings + unmatched as structural"*, `DESIGN.md:586-587`), `excludedSpans`,
event counts/lists, `notes` (*"typed kinds: structural finding, exclusion, inert difference,
renderer skip, estimate degradation"*, `DESIGN.md:594-595`), and `segments` where §7.3 ranks
*"by integral mass"* (`DESIGN.md:453`) with no stated tiebreak — two segments of equal mass
are a coin flip. If any of these is emitted in A's walk order, `compare(b,a)` emits B's walk
order and the reports are not bit-identical, however exact the arithmetic is. The precedent
for walk-ordered note logs is `src/expression/report.ts:446-452` (*"the note log stays
append-only and in walk order"*) — a good rule for a one-document report and exactly the
wrong one here.

Two further gaps in the same claim: *"modulo the a/b field swap"* names no swap map (which
fields swap? `ppq.a`/`ppq.b`, `dateA`/`dateB`, `valueA`/`valueB`, the per-part pairing
entries, the sign of any signed quantity such as `level` in the §1.2 decomposition —
`d_level = ℓ_A − ℓ_B` **negates** under swap and is not a swap of fields at all); and
"bit-identical JSON" does not pin the serializer call (`JSON.stringify(report)` with no
replacer and no `space`), without which the test is comparing an unspecified encoding.

**Repair.** (a) Give every array field in §9 a **total order independent of which document is
`a`**: parts by matched `@number` then `@name` (code-unit order); `excludedSpans` by
`(start, end, dimension, cause)`; `notes` by `(kind, dimension, date, site)` with a stated
final tiebreak; `segments` by `(mass desc, start asc, end asc)`. (b) Write the a/b swap map
out as an explicit table in §9, and separate it from the **sign-negating** fields, which are
not a swap. (c) Pin the serializer: *"P-C2 compares `JSON.stringify(report)` with no replacer
and no indentation."* (d) Note that JS object key order is insertion order, so every `Record`
must be built by iterating `COMPARISON_DIMENSIONS` — the shipped precedent is
`src/expression/report.ts:438-443` (`Object.fromEntries(EXPRESSION_DIMENSIONS.map(…))`) —
and say so, because a record built by iterating the *document* would reorder under swap.

---

### A10 — an explicitly requested option that cannot be honoured is left unspecified

**Claim.** `DESIGN.md:550`: `readonly noteDensityWeight?: boolean;  // needs msm; default
false`, against R7 (`DESIGN.md:113-116`): *"each degrading to a documented default without it,
reported as such (three-state: value / null 'this MSM cannot answer' / not requested)"*.

**Precedent.** The expression facade rules on exactly this question and gives the reason —
`src/api/expression.ts:308-320`:

> A `performance` selector that matched nothing is an error here, not an empty run. … a
> caller who *named* a performance asked a question, and answering it with an unchanged
> document would hide a typo behind a valid-looking result.

**Concrete failure.** `noteDensityWeight: true` with no `msm` is a caller asking a question
the module cannot answer. R7's degrade-and-report rule was written for *fields the caller did
not request* (the estimates block, `src/api/types.ts:203-211`); silently applying it to an
explicitly-set boolean means a caller who forgot the MSM gets a full, plausible, differently-
weighted report with a note buried in `notes[]`. The same gap covers several more options
that §9's error list (`DESIGN.md:575-577`) does not mention: `invariance` set on a dimension
that ends up `excluded`; `k` on `compareMpmCorpus` when N is too small (A16); `jnd` keys for
rows that never occur in either document (arguably fine, but unstated).

**Repair.** State the rule once in §9 and apply it uniformly: **an option the caller set
explicitly and the module cannot honour is an `InvalidOptionError`; an option the caller did
not set degrades to the documented default and is reported.** Concretely,
`noteDensityWeight: true` without `msm` throws. Keep R7's three-state for the estimate fields
where it belongs, and say in §9 which fields it governs.

---

### A11 — `msm` changes the metric here, unlike its expression precedent, and is not stamped

**Claim.** `DESIGN.md:543`: `readonly msm?: XmlText;  // R7: optional refinements`, expanded
at R7 (`DESIGN.md:113-116`) to *"note-density weighting option, note-anchored articulation
resolution against real note lists, and estimate refinements"* — and, decisively, §5.0
(`DESIGN.md:215-217`): *"`end` = **the MSM score end when an MSM is supplied**, else the max
over both documents of the last dated instruction."*

**Precedent.** In the expression facade `msm` is a strictly report-only carve-out, and the
guarantee is structural, not documentary — `src/api/expression.ts:17-21`:

> **R1's carve-out, made mechanical.** `options.msm` is read for the report's estimates and
> for nothing else. The guarantee is not a promise in a comment: {@link toEngineOptions}
> builds the interior's option object field by field, so there is no path by which an MSM
> could reach a written byte.

**Concrete failure.** In comparison the MSM moves the window, changes the weight function and
changes articulation resolution — so `compareMpm({a, b})` and `compareMpm({a, b, msm})`
return **different distances for the same documents**. The comment `// R7: optional
refinements` reads as the expression carve-out and is not it. A consumer caching results, or
comparing a number from a paper against a number from their own run, has no field to check:
§9's report stamps `window` and its rule, `weights`, `normalization` and per-dimension
`invariance` (`DESIGN.md:585-592`) — but nothing says an MSM was used, and (see A1) nothing
echoes the effective `jnd` vector either, though both change every number in the report.

**Repair.** (a) Rewrite the §9 comment: *"an MSM changes the window, the weight function and
articulation resolution — it is part of the metric, not a report-only side input; contrast
`ExaggerateOptions.msm`."* (b) Add first-class provenance to `ComparisonResult.report`:
`readonly inputs: { readonly msmUsed: boolean; readonly noteDensityWeight: boolean;
readonly jnd: Record<ComparisonJndKey, number>; readonly epsilon: number }` — the full
effective vectors, not the caller's partials, so a report is self-describing. (c) State that
corpus comparison uses one MSM for the whole matrix (§8 implies it; §9 should say it) and
that mixing msm-derived and document-derived windows across a matrix is impossible by
construction.

---

### A12 — the "options echo" would copy every input document into the result

**Claim.** `DESIGN.md:604`: *"`normalizationConstants | null`, `scape | null`, **options
echo**."*

**Rule.** RULE F1 (`ARCHITECTURE.md:204-220`) and RULE I3(b) (`ARCHITECTURE.md:888-890`):
*"Every facade return value is freshly allocated: two calls with equal inputs return values
that are `!==` at every level"*, pinned by `tests/api/plain-data.test.ts:151-160`.

**Concrete failure.** The options object *contains the documents* — `CompareCorpusOptions.
items[].mpm` is the corpus itself, up to ~100 MPM files (`DESIGN.md:491`). An echo of
"options" either (i) duplicates the entire corpus into the result — turning a ~100 kB report
into a multi-megabyte one, all of which must be deep-copied to satisfy I3(b) and then
`structuredClone`d across a worker boundary; or (ii) is a *partial* echo, in which case which
fields are echoed is a contract nobody has written. The same ambiguity hits
`ComparisonResult` (which echoes `weights`, `window`, `normalization` but says nothing about
`a`/`b`).

The root cause is worth naming: §9 puts documents and tuning knobs in **one** bag
(`DESIGN.md:529-530`, *"All entry points take ONE named-parameter object"*). F5 does not
require that. The repo's actual precedent for a multi-document call is a **documents object
plus an options object** — `ARCHITECTURE.md:377-381`:

```ts
export function performMsm(
  input: { readonly msm: XmlText; readonly mpm: XmlText },
  options?: PerformOptions,
): XmlText;
```

which satisfies F5 identically (the keys are what stop a swap) while keeping the echo
trivially well-defined, keeping the *settings* object reusable across `compareMpm`/`diffMpm`/
`compareMpmCorpus` (A5), and matching `renderExpressiveMidi`'s shape that consumers already
know. §9's parenthetical justification — *"(two interchangeable MPM texts make positional
args a hazard — F5)"* — argues against **positional** arguments, which the two-arg form does
not use.

**Repair.** Prefer `compareMpm({ a, b }, settings?)`, `diffMpm({ a, b }, settings?)`,
`compareMpmCorpus({ items }, settings?)` — matching `performMsm`/`renderExpressiveMidi` — and
define the echo as `settings`, fully resolved (defaults filled in), never the documents. If
the one-bag form is kept anyway, §9 must (a) say so as a *deliberate* divergence from
`performMsm` with its reason, and (b) enumerate the echoed fields exactly, stating that
`a`/`b`/`items[].mpm` are excluded.

---

### A13 — "the row flips … to a twelfth dimension without an API break" is false

**Claim.** `DESIGN.md:159-162`:

> **inert content**: attributes the renderer provably ignores (`imprecisionMap.tuning` today)
> … If a future port renders tuning, the row flips from inert to a twelfth dimension
> **without an API break** (the dimension list is exported data).

**Rule / precedent.** `DESIGN.md:532-537` exports `COMPARISON_DIMENSIONS … as const` and
derives `type ComparisonDimension = (typeof COMPARISON_DIMENSIONS)[number]`; §9's report keys
a **full** record on it (`DESIGN.md:587-588`), matching
`src/expression/report.ts:228`: *"A full record, never a partial one (RULE N4): all fifteen
keys are always present."*

**Concrete failure.** Adding a twelfth member breaks three things at once. (i) The union type
widens, so every consumer with an exhaustive `switch` over `ComparisonDimension` — the shape
this design *encourages* by exporting the list as data — stops compiling; that is a semver-
major change for a published package. (ii) Every full `Record<ComparisonDimension, …>` in
every result gains a key, so a consumer validating report shape against a fixture fails.
(iii) Far more consequential: the aggregate `D = Σ_k ω_k d_k` (`DESIGN.md:38`) gains a term,
so **every previously reported distance changes** for any document pair that differs in
tuning — including P-C9's *"values pinned as regression anchors"* (`DESIGN.md:631`) and any
published figure. The exported-data property makes the *test* enumerable; it does not make
the change non-breaking.

**Repair.** Strike *"without an API break"*. Replace with the honest contract: *"promoting an
inert row to a dimension is a **breaking change** (the exported union widens, full records
gain a key, and every aggregate distance moves); it is scheduled as a major version with the
regression anchors regenerated. What the exported list buys is that the change is
**mechanically enumerable** — one test walks `COMPARISON_DIMENSIONS` and no consumer has to
hard-code eleven names."* Apply the same honesty to the other deferred surfaces §9 touches:
`applyEditScript` (`DESIGN.md:392-393`) is purely additive and safe; a **scape** promoted from
opt-in to default is not; cross-piece descriptors would need their own entry point rather than
a widened `ComparisonResult`, because widening a full record is the same break.

---

### A14 — `DiffResult` is under-specified against N4 and carries no provenance

**Claim.** `DESIGN.md:596-599`:

> `DiffResult`: per (part, map) scripts with ops `{op, site, dateA, dateB, attributes[…],
> cost, free}` sorted by cost desc; per-dimension `{dCurve, scriptCost, replayedDelta,
> reworking}`; the same `notes` channel.

**Rule.** RULE N4 (`ARCHITECTURE.md:685-693`) plus the full-record precedent
(`src/expression/report.ts:228`).

**Concrete failures.**
1. *"per-dimension"* does not say **full record or partial**. It must be
   `Record<ComparisonDimension, …>` with every key present (the precedent) — but then
   `dCurve` is meaningless for the event-shaped dimensions (`ornamentation`,
   `articulation`'s atoms), and R5 (`DESIGN.md:104-107`) states the guarantee
   `scriptCost ≥ d_curve` *per dimension* as if every dimension had one. Either `dCurve` is
   `number | null` with the null case defined, or the guarantee is restated as holding only
   for the curve-shaped dimensions and the list of those is exported data.
2. `DiffResult` reports costs in JND·quarters but stamps **none** of the settings that
   determine them: no `window`, no `weights`, no `jnd`, no `epsilon`, no `ppq`, no `parts`.
   The same numbers in `ComparisonResult` are stamped (`DESIGN.md:585-595`). Two `diffMpm`
   results from different jnd vectors are indistinguishable.
3. `free: boolean` and `cost: number` co-exist with no stated relation. §6.2
   (`DESIGN.md:402-403`) says an op that costs exactly 0 *"is marked `free`"* — so is `free`
   defined as `cost === 0`, i.e. redundant, or does it mean "cost 0 **by pricing**" as
   distinct from "cost 0 by coincidence"? The distinction is the whole point of R5's
   *"A no-op encoding difference costs 0 in the script by pricing, not by special-casing"*
   (`DESIGN.md:106-107`) and needs one sentence.
4. Sort stability: *"sorted by cost desc"* with no tiebreak, in a product whose determinism
   is promised bit-exact (P-C6). Equal-cost ops are common — every `free` op has cost 0.

**Repair.** Declare `DiffResult` as a real interface in §9 (see A19), with the same
provenance block as `ComparisonResult` (A11's `inputs`), a full per-dimension record with
`dCurve: number | null` and the null case defined, `free` defined precisely, and a total sort
order `(cost desc, part, map, dateA ?? dateB asc, site)`.

---

### A15 — reusing `EngineInvariantError` falsifies its shipped documentation

**Claim.** `DESIGN.md:577-579`: *"`EngineInvariantError` (table fails to close, symmetry
violated — bugs, not caller mistakes)."*

**Precedent.** `src/api/errors.ts:62-85` — the class is documented as the *expression*
engine's, and its contract is a strong, specific promise:

> The **expression engine** broke one of its own invariants … **No document can provoke it**,
> at any factor. Exactly one input can, and naming it is the honest form of this contract:
> - **`ExaggerateOptions.minRubatoWindow` below about 2⁻⁵³.** …

**Concrete failure.** Under comparison, a *document* absolutely can provoke it — a pathological
pair whose attribution table fails to close is exactly the case §9 names. So reuse makes two
shipped sentences false, and `errors.ts` is the file consumers read to decide what to catch.
Second bite: `P-C5` (`DESIGN.md:618-620`) runs `exaggerateMpm` and `compareMpm` in one
expression — the design's headline cross-module claim — and a caught `EngineInvariantError`
there cannot say which engine broke without parsing the message string.

**Repair.** Add `ComparisonInvariantError extends MeicoError` with an empty body, per the
house pattern (`survey-code.md` §4.3: *"Every class has an empty body — no `code` field, no
`name` override"*). Precedent for adding rather than overloading: the expression campaign
added `SelectionNotFoundError` (`errors.ts:60`) for its own new failure mode. Alternatively
generalise `EngineInvariantError`'s doc comment to cover both engines and keep the
minRubatoWindow paragraph as one of two named cases — but then §9 must say the edit is part
of the campaign, because leaving `errors.ts:73-79` as it stands is shipping a false comment.

---

### A16 — `window` is unvalidated and contradicts §5.0's own definition

**Claim.** `DESIGN.md:545`: `readonly window?: { readonly start: number; readonly end:
number }; // quarters`, against §5.0 (`DESIGN.md:214-220`): *"The comparison window is
`[0, end]` … overridable via `options.window`."*

**Concrete failures.** The prose defines a window that always starts at 0; the API accepts a
`start`. Nothing states what happens for: `start >= end`; non-finite or `NaN` bounds;
negative `start`; a window entirely outside both documents (all densities 0 — legal, or an
error?); a window that ends before the first instruction (with `invariance: 'level'`, whose
per-document centering is *"centered by its own window mean"*, `DESIGN.md:468-469` — the mean
of an empty window is A3's NaN again); fractional-quarter bounds landing inside an
integer-tick cell (representable, but the refinement grid is *"deduplicated exactly (integer
lcm-ticks)"*, `DESIGN.md:230-232`, so the rounding rule needs stating). At corpus level §8
says *"window end = max over items, or MSM end"* (`DESIGN.md:493`) and never says whether a
caller-supplied window overrides that or is rejected.

The same completeness gap applies to the rest of §9's options, and §9's error list
(`DESIGN.md:575-577`) enumerates only four causes: *"unknown dimension/jnd keys, non-finite or
negative weights, bad window, multi-perf without selector"*. Unlisted and needed: a
`performance*` index that is not a non-negative integer (A17); `k` non-integer, `< 1`, or
`> N`; `embeddingAxes` non-integer, `< 1`, or `> N−1`; `scape.bins` `< 1` or `> 256` (§8 caps
it at 256, `DESIGN.md:516`, with no stated behaviour above the cap); `items` empty (N = 0 —
what does a 0×0 matrix, an empty dendrogram, an MDS of nothing return?) and `N = 1` (a
1×1 zero matrix, a dendrogram with zero merges, `explainedVariance` of nothing — A3);
`linkage`/`normalization`/`invariance` values outside their unions when called from JS.

**Repair.** Write a **validation table** into §9 — one row per option: type guard, domain,
error class, message shape — the way `src/api/expression.ts`'s `@throws {InvalidOptionError}`
block enumerates all nine of its causes (`expression.ts:241-245`). Resolve the prose/API
mismatch by either dropping `start` (keeping §5.0's `[0, end]`) or generalising §5.0 to
`[start, end]` and restating the level-invariance mean over it. Define N = 0 and N = 1
explicitly — N = 1 in particular is *not* an error (a one-item corpus is a legitimate
degenerate) and every corpus product needs a stated value for it.

---

## MINOR

### A17 — the `performance*` index validation the expression facade insists on is missing

`DESIGN.md:541-542` declares `performanceA?: string | number` / `performanceB?`, and §9's
error list does not mention index validation. The expression facade validates it and says
why the two facades must agree — `src/api/expression.ts:172-180`:

> Spelled exactly as `selectPerformance` spells it, because the two must agree: a caller who
> narrows one facade by index and the other by the same index gets one answer.
> ```ts
> if (typeof options.performance === 'number') {
>   const index = options.performance;
>   if (!Number.isInteger(index) || index < 0)
>     throw new InvalidOptionError(`performance index must be a non-negative integer, got ${String(index)}`);
> ```

A caller doing `compareMpm({ a, b, performanceA: 1.5 })` must get the same message from this
facade as from `exaggerateMpm`. **Repair:** add it to §9's error enumeration verbatim, and
extend the same rule to `CompareCorpusOptions.items[].performance`.

---

### A18 — type-name collisions in the single barrel, and "SiteRef-like" is not a specification

`src/index.ts:78-112` already exports, into one flat namespace, the type names a comparison
report would reach for first: `ReportNote`, `ReportNoteKind`, `SiteRef`, `SiteState`,
`DimensionReport`. §9's report needs all five concepts (`DESIGN.md:594-595`'s typed `notes`
kinds; `DESIGN.md:587-590`'s per-dimension record). §6.1 (`DESIGN.md:383`) meanwhile types an
op's locator as *"`site: SiteRef-like locator`"* — which repeats the mistake F2a is named for
(`ARCHITECTURE.md:229`: *"'XML strings' is not a specification"*).

**Repair.** Prefix every comparison type (`ComparisonNote`, `ComparisonNoteKind`,
`DimensionComparison` — §9 already uses that one — `ComparisonSettings`, `CorpusProfile`), and
decide `site` explicitly: **reuse the exported `SiteRef`** (`src/expression/siteRef.ts`, already
a facade type at `src/api/types.ts:110`) if its shape fits, or declare a new named type. Also
check `DiffResult`/`CorpusResult`/`ComparisonResult` against the barrel for future collisions
— the expression campaign prefixed all of its (`ExaggerationResult`, `SpotlightResult`).

---

### A19 — `DiffMpmOptions` is defined by a subtraction of the empty set, and no result type is declared

`DESIGN.md:554-557`:

```
export function diffMpm(options: DiffMpmOptions): DiffResult;
// DiffMpmOptions = CompareMpmOptions minus corpus-only fields plus
//   { readonly moves?: boolean }
```

`CompareMpmOptions` (`DESIGN.md:539-551`) contains **no** corpus-only fields, so the
subtraction is vacuous. More importantly `DiffMpmOptions`, `ComparisonResult`, `DiffResult`
and `CorpusResult` are prose sketches, never declarations — yet
`@typescript-eslint/explicit-module-boundary-types` is `error` (`survey-code.md` §7.2) and
§9.4 item 1 requires member-by-member re-export from `src/index.ts`, which needs names.

**Repair.** Declare all four as exported interfaces in the design (or state explicitly that
§9's prose sketch is indicative and W3 owns the normative declaration — but then the panel
cannot review the report shape, so prefer declaring them now). Replace the subtraction with
`interface DiffMpmOptions extends CompareMpmOptions { readonly moves?: boolean }`.

---

### A20 — `-0` versus P-C1's "exactly 0"

P-C1 (`DESIGN.md:607-608`): *"every number in `compare(A, A)` and `compare(A, canonicalMpm(A))`
is **exactly 0**."* Vitest's `toBe` is `Object.is`, under which `-0 !== 0`; `JSON.stringify`
writes `-0` as `0`, so the JSON round-trip test would pass while `toBe(0)` fails, or vice
versa. Signed zeros arise easily here (`0 * -1`, `(a - b)` with `a === b === -0`, a centered
curve minus its own mean). The repo already treats sign-of-zero as a first-class hazard —
`ARCHITECTURE.md:808-810`, RULE C3's gate: *"requires bit-identical output including sign of
zero"*.

**Repair.** State in §10 whether P-C1 means `Object.is(x, 0)` or `x === 0`, and normalise
`-0` to `0` at the report boundary (`x === 0 ? 0 : x`) so both the assertion and the
serialization agree.

---

### A21 — `ppq.fallbackUsed` appears in the normative result and is defined nowhere

`DESIGN.md:585-586`: *"`ppq {a, b, lcm, fallbackUsed}`"*. §5.0's timeline paragraph
(`DESIGN.md:212-214`) describes the lcm rescale and mentions no fallback; the string
"fallback" occurs nowhere else in the design. A reader cannot tell whether it means "a
document declared no `pulsesPerQuarter` and a default was assumed", "the lcm exceeded a safe
integer and something was approximated", or something else — and each implies a different
consumer reaction.

**Repair.** Define it in §5.0 with its trigger and its consequence, or remove it. If it means
a missing `@pulsesPerQuarter`, say what value is assumed and cite the survey's finding
(`survey-code.md` §1.4).

---

### A22 — three `| null` fields with no stated null-condition

RULE N4 makes `null` mean *"the domain says there is nothing here"* (RULE N1,
`ARCHITECTURE.md:588-590`), so every null needs a determinate cause. Three in §9 do not have
one:

- `decomposition: Record<dim, {level, gain, shape, r} | null>` (`DESIGN.md:592-593`) — null
  when the dimension is `excluded`? `both-neutral`? distribution-valued? And §1.2
  (`DESIGN.md:68-69`) separately says *"`r` on a constant window is `null` and the window
  marked shapeless — never 0"*, so there are **two** nullable levels (`r` inside a present
  record, versus the whole record) and the design distinguishes them nowhere.
- `cumulativeDrift {secondsAtEnd, maxAbsMs} | null` (`DESIGN.md:593-594`) — null when? No
  tempo map on either side (but R6 says the neutral curve is used, so drift is computable)?
  Tempo excluded by R8? Zero-weight tempo?
- `medoids/clusters/silhouette | null` (`DESIGN.md:602`) — the slash notation leaves it
  unclear whether these are three independently-nullable fields (they must be, per N4:
  every field always present) or one nullable block; and §8's *"silhouette … noisy at N < 20,
  reported with that caveat"* (`DESIGN.md:507`) names a caveat with no field to live in.

**Repair.** For each: one sentence naming the exact condition, and — for the pairs — which
level nulls first. Give the silhouette caveat a field (`readonly silhouetteReliable: boolean`
or a typed note kind) rather than leaving it to prose.

---

### A23 — validation order and parse order are contracts, and both are unstated

The expression facade makes both explicit and gives the reason —
`src/api/expression.ts:143-148`:

> Validate every option **before the document is parsed**, per §4. The ordering is a
> contract, not an accident: a caller who both misspells a dimension and hands over a
> malformed document is told about the misspelling, because that is the error they can act on
> and the other one may not even be theirs.

With two documents there is a second ordering question the expression facade never faced:
when **both** `a` and `b` are malformed, which `ParseError` surfaces? §9 says only *"Parse
failures surface via `parseOrThrow`"* (`DESIGN.md:579`). Related: §9 does not say where
validation *lives* — the expression precedent delegates to the interior's own validators so
there is exactly one definition of legality (`expression.ts:150-155`, `:189-193`) and builds
the interior option object field by field, never a spread (`:127-141`).

**Repair.** State in §9: options validated before any parse; documents parsed in the order
`a`, `b`, `msm`, so the first failure reported is `a`'s; the interior owns the domain
validators and the facade wraps their throws in `InvalidOptionError` with `{ cause }`; the
interior option object is built field by field.

---

### A24 — config work: state the exact zone entry, and record the `sideEffects` fact as verified

§9 (`DESIGN.md:529-530`) says only *"Layer zones and coverage `include` updated per
survey-code §9.4"*, and §11 puts *"Layer-zone + coverage-include config edits"* at the end of
W2 (`DESIGN.md:645-646`). Three specifics are worth pinning in the design rather than
rediscovering in W2:

1. **The zone entry, both directions.** `eslint.config.js:35-38` states the rule itself:
   *"Fencing only the downward direction would leave the new layer half-enforced."* So the new
   `comparison` zone must forbid `**/midi/**`, `**/msm/**`, `**/mei/**`, `**/musicxml/**`,
   `**/mpm/**` **with two negations** — `!**/mpm/names.js` and
   `!**/mpm/elements/maps/data/bezier.js` — and `'**/comparison/**'` must be added to the
   `forbidden` list of **all six** existing zones, the `expression` zone
   (`eslint.config.js:79-100`) included, since comparison sits above it.
2. **Comparison imports `src/expression/**`.** §9.1 of the survey lists eight expression
   modules for verbatim reuse, and §4 (`DESIGN.md:187-190`) puts the forward `T(x)` maps
   *into* `src/expression/transforms.ts`. So the new zone must **permit** `**/expression/**`,
   and the design should say plainly that `src/expression/` gains exported members whose only
   consumer is comparison (with the stated reason: they must sit next to the closed forms
   they are property-tested against). Otherwise a W2 worker reads the expression zone's
   "nothing else" comment and puts them in the wrong file.
3. **The `bezier.ts` carve-out is safe, and that is checkable now.** `package.json:33-36`
   lists `sideEffects` as `["./dist/mpm/Mpm.js", "./dist/mpm/elements/maps/*.js"]`. The
   compiled bezier module is `dist/mpm/elements/maps/data/bezier.js` — one directory deeper,
   so the `maps/*.js` glob does **not** match it, and it is therefore declared side-effect-free
   to bundlers. It also imports nothing (verified: `src/mpm/elements/maps/data/bezier.ts` has
   zero `import` statements), so importing it drags in neither `Mpm.js` nor the map modules
   whose `registerMapFactory` side effects are the reason that list exists. Record this as
   measured in §4 or §11 — it is the one fact that makes the carve-out defensible, and it is
   cheap to state and expensive to re-derive later.

Also worth a line: `vitest.config.ts:31-52`'s `include` is *"a curated list, not a glob over
`src/**`"* (its own comment at `:21-25` records that a new `src/supplementary/` module was
invisible to the coverage invariant until named) — so `'src/comparison/**/*.ts'` must be
added, and the design should say the same about any new file added under `src/expression/`
(already covered by that directory's existing glob at `:35`).

---

### A25 — `COMPARISON_DIMENSIONS` drops the freeze the precedent explicitly justifies

`DESIGN.md:532-536` exports `COMPARISON_DIMENSIONS = [...] as const`. The precedent freezes
it, and says why — `src/expression/registry.ts:66-71`:

> Frozen because the ESM re-export hands a consumer the same object the option validator
> reads: unfrozen, a `push` from outside would widen this package's notion of a legal
> dimension process-wide. `as const` stops that at compile time only.
> ```ts
> export const EXPRESSION_DIMENSIONS = Object.freeze([
> ```

The reasoning transfers exactly: `COMPARISON_DIMENSIONS` is re-exported to consumers *and* is
what "unknown dimension key" is validated against (`DESIGN.md:575-576`), and §3
(`DESIGN.md:161-162`) leans on it being the exported source of truth for the cross-module
test.

**Repair.** `export const COMPARISON_DIMENSIONS = Object.freeze([...] as const);`. Same for
the dimension-correspondence table §3 exports (`DESIGN.md:169-170`) and for
`COMPARISON_JND_KEYS` if A1's repair is taken.

---

## Cross-cutting note (not a numbered finding)

Findings A1, A3, A4, A5, A9, A14, A16, A19 and A22 are all instances of one gap: §9 is a
*sketch* where the campaign's own precedent is a *declaration*. `src/api/types.ts` carries a
20-line header stating which rules govern it (`types.ts:1-21`) and then declares every field
with its unit, its null-condition and its default in JSDoc; `src/api/expression.ts` carries a
`@throws` block enumerating all nine `InvalidOptionError` causes (`:241-245`). The cheapest
single repair to this design is to write §9 as compilable TypeScript with that level of
per-field documentation before W2 opens — most of the findings above disappear in the act of
writing it, and the ones that do not (A6, A7, A8, A12, A13) are genuine design decisions that
should be adjudicated rather than discovered in W3.
