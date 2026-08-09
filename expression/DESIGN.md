# Expression Transforms — Design

Status: W1 COMPLETE, panel-adjudicated. The W0 survey (SURVEY.md) is the evidence
base; the 4-lens adversarial panel's findings are archived verbatim in
REVIEW-FINDINGS.md; the conductor's adjudication A1–A14 (LOG.md, 2026-08-09) is
**binding** and supersedes any conflicting text here. §9 records the disposition
of every panel finding.

## 1. What "exaggeration" means here

The mpm-renderer formulas paper (tempo_exaggeration_formulas.tex) states the
principle once, for two cases; we adopt it as the *definition* for every dimension:

> Transform the quantity into an unbounded space in which its neutral point maps
> to 0, scale by the factor `s`, then map back.

Formally: each exaggerable attribute has a monotone bijection `T : D → ℝ` (or a
half-line) from its musical domain `D`, with `T(neutral) = 0`, and

    x' = T⁻¹( s · T(x) )

Instances (each is that one formula with a different `T`):

| scale space | T(x) | neutral | admissible s (A3) | used for |
|---|---|---|---|---|
| log around a mean μ | ln x − ln μ | μ (geometric mean) | ℝ | level pairs and def values: bpm↔transition.to, volume↔transition.to, tempoDef/dynamicsDef @value |
| log around 1 | ln x | 1 | ℝ | pure ratio gains: rubato intensity, relative articulation factors, ornament spacing intensity |
| logit(a,b) | ln((x−a)/(b−x)) | (a+b)/2 | ℝ | bounded proportions with interior neutral: meanTempoAt on (0,1), protraction on (−1,1) |
| gain (linear) | x | 0 | s ≥ 0 where an ordering or sign constraint exists (imprecision limit pairs, frame length, accentuation), else ℝ | signed offsets: asynchrony ms, accentuation scale, gradient endpoints, imprecision widths, absolute articulation deltas |
| boundary-power (lower) | ln(1−x) on [0,1) | 0 | **s ≥ 0** — T's range is the half-line (−∞,0], so s<0 leaves it and P3 fails | proportions whose neutral is the lower bound: dynamics/pedal curvature, the rubato window's total trim |
| boundary-power (upper) | ln x on (0,1] | 1 | s ≥ 0, same reason | proportions whose neutral is the upper bound. Retained for completeness; no registry row uses it standalone — rubato earlyEnd, its only candidate, is half of the joint trim (§7.6) |

**The admissible-s domain is registry data, not prose** (A3). Each row carries its
scale space's s-domain; a dimension's domain is the *intersection* over its rows;
a factor outside it is an `InvalidOptionError`, not a clamp. `s = 0` is admissible
everywhere and is implemented as the **closed form "write the neutral"** — never
as `0 · T(x)`, which is `0·∞ = NaN` at the boundary values (`protraction = ±1`,
`curvature = 1`) that §7 calls admissible.

### 1.1 Properties: what is guaranteed, and under what conditions

The panel's central correction was that these were theorems over ℝ asserted as
contracts over IEEE-754 doubles and over a pipeline that clamps and skips. They
are restated honestly.

- **P1 identity (A2)** — tested as **two** predicates, both against the canonical
  baseline: `exaggerate(mpm, {})` and `exaggerate(mpm, {every dimension: 1})`
  each equal `parse→serialize(mpm)` byte for byte. The second is the one that
  actually exercises the engine. It holds because `s === 1` **short-circuits at
  the dimension level** (the dimension is skipped, nothing is computed), with a
  defensive identity inside each transform as well — *not* because "the value is
  unchanged so the write is skipped": at `s = 1` the round trip through a scale
  space is not the identity in doubles (μ·(48/μ)¹ = 47.99999999999999 for
  μ = √(20·100); logit maps 0.3 → 0.30000000000000004).
  There is **no byte-level `input == output` contract**. `Element.wrap` drops
  `xmlns` at parse and `Element.toXML` re-emits it on every namespaced element,
  inflating a real fixture from 2444 to 4011 bytes — strict input==output is
  unreachable for *every* MPM regardless of what the applier does
  (REVIEW-FINDINGS.md:10-14).
- **P2 composition** — `exaggerate(s₁) ∘ exaggerate(s₂) = exaggerate(s₁·s₂)`,
  **exact only on the clamp-free subdomain and only to ~1 ULP** (A3). Property
  tests assert it numerically in the T-space with an epsilon, never on serialized
  bytes, and only when `report.clamps === 0`. Under clamping the computed center
  is no longer the image of the input population, so composition genuinely breaks
  (verified: 33% divergence on a clamping pair). The remedy is an output, not a
  proof: **every computed center is reported and can be passed back via
  `options.center`**, which restores exact composition by construction.
- **P3 domain closure** — `x ∈ D ⇒ x' ∈ D`, guaranteed by the transform rather
  than a clamp, **for s in the row's admissible domain**. For boundary-power that
  domain is `s ≥ 0`; this is mathematics, not taste.
- **P4 neutral fixed point** — `x = neutral ⇒ x' = neutral` for every s. Breaks
  only where a clamp fires (a center above the velocity ceiling).
- **P5a attribute-level** — `|T(x')| = s·|T(x)|`. This is a **definitional
  consequence** of the construction, true for every conceivable T; it is stated,
  not tested as a discovery (A12).
- **P5r render-level** — whether the *rendered* effect is monotone in s. This is
  the substantive property and it is **per row**, with an explicit verdict column
  in §7: `holds` | `saturates` | `non-monotone` | `cliff`. It fails in real
  places: articulation's affine velocity pair `v' = (v·r) + c` is non-monotone
  around s = 1 and a configuration that is exactly neutral at s = 1 is not a fixed
  point of it; `@absoluteDurationChange` saturates through the renderer's halving
  loop; clamped dynamics levels are constant in s.

**P1–P5 constrain the neutral, not the metric.** They hold automatically for
*any* monotone bijection with `T(neutral) = 0`, so the property suite cannot
validate a single registry choice — `meanTempoAt` could equally be log-around-1
on the renderer's own `exponent` parameter and would satisfy all five while
giving different numbers. The registry's content *is* the metric choice; §7 rows
carry the justification, and A14 adds per-row "expected direction" render tests
to the W3 plan because the property suite alone proves nothing about them.

### 1.2 The validation gate (A4)

A §1-level contract binding on every dimension, not a per-row note:

    read → validate(input domain) → transform → validate(output domain) → write

- A value failing the **input** predicate is **skipped and reported** — never
  transformed, never "repaired". The renderer does not enforce these domains, so
  real documents carry values that render benignly today and become NaN under
  exaggeration (`curvature="1.5"` at s=2.5 → `1−(−0.5)^2.5` = NaN;
  `meanTempoAt="1.5"` renders as a dropped transition today, and as NaN it
  poisons `date.perf` for the whole span). NaN escapes every renderer clamp,
  because every NaN comparison is false.
- A result failing the **output** predicate is a typed engine error, not a write.
- **Global invariant: the engine never writes a non-finite value**, pinned by a
  property test over adversarial XML.
- The gate **subsumes** the ornament-intensity epsilon floor, which is dropped
  (A4): `log-1` maps x>0 to x'>0 for every finite s, so the floor could only ever
  fire on an authored non-positive intensity — which the gate now skips and
  reports instead of silently editing a value the caller never asked to change.

Clamps exist only where the *musical* domain is narrower than `D`. They are
options with documented defaults (`velocityRange`, `minRubatoWindow` — §4), never
hardcoded constants, and every clamp event is reported.

### 1.3 Scope: where the neutral point of level attributes lives

The prototype exaggerated tempo/dynamics only *within* a transition pair. A map of
piecewise-constant instructions — the common case for mpmify-generated and
inferred performances, i.e. exactly mlign's inputs — is a total no-op under that
rule. Two scopes, **global** and **gesture** (A7; "local" is retired):

- **`global` (default)**: level values are exaggerated around a **performance-wide
  center** per dimension (§7.1, A5). Constant instructions move apart (section
  contrast grows); transitions steepen too, since the log-difference of any pair
  scales by `s` regardless of the center. The center may be overridden per
  dimension via `center: { tempo?, dynamics? }`; `center.tempo` is **quarter-note
  bpm**, the same space the transform works in.
- **`gesture`**: transition pairs are scaled around their **own** geometric mean;
  constant instructions and def values are **untouched**. Gain dimensions
  attenuate toward 0 as usual. This is what `spotlight` uses (D-I).

Why "local" had to go: it was specified as "the prototype's behaviour", but on the
dominant corpus it has no legal write site at all — levels are style names, D-C
forbids rewriting a name as a number, and the only numeric site is the def, which
is by construction performance-wide. `gesture` is well defined there because it
scales the pair's log-ratio, and a pair whose endpoints resolve to the same def is
simply a constant (inert, reported).

Both scopes satisfy P1–P5 under §1.1's conditions; in particular the chosen center
is invariant under the transform, so composition holds exactly in the clamp-free
subdomain in both. Shape parameters (`tempoShape`, `dynamicsShape`, `pedalShape`)
are scope-free.

Unweighted, because duration-weighting the last instruction requires knowing the
piece length, which the MPM alone does not contain (R1). Span-weighting was
proposed by the panel and **rejected** (A5, §9): it needs an arbitrary last-span
rule, and callers wanting another center pass `options.center` — which is always
echoed in the report.

## 2. Requirements

From the campaign charter (user directive):
- C1: generalize beyond the prototype's tempo/dynamics/rubato — decide per MPM
  attribute what exaggeration means, or record why it is excluded.
- C2: no magic numbers, no dead ends; idiomatic TS per house rules.

From mlign-57 (adopted 2026-08-09, see LOG.md):
- R1: pure document transform — MPM text in, MPM text out. No rendering, no
  extraction bundled. **Carve-out (A10):** an optional `msm?: XmlText` input may
  be supplied and is used **only** to compute report estimates, never to
  transform. Without it the dependent report fields are `null`.
- R2: deterministic — no RNG anywhere in the transform; a given (mpm, s-vector)
  always yields the same MPM bytes. **Render determinism is not claimed** (A11):
  the codebase is explicitly nondeterministic there (`shakePolyphonicPart` picks
  its keeper with a bare `Math.random()`), and `PerformOptions.seed` is not a
  reproducibility promise. mlign re-notified.
- R3: the s-vector is a plain record keyed by dimension name; missing keys mean
  identity; each dimension documents a meaningful sampling range (§8). Unknown
  keys and non-finite values are an `InvalidOptionError` (A11).
- R4: a companion report says which dimensions were actually present/transformed,
  so callers can skip no-op samples. **`report.totalWrites === 0` is the exact,
  cheap contract** for "this sample is a no-op".
- R5: symbolic invariance — the transform never touches note identities or
  symbolic dates; unit test asserts the invariant for arbitrary s. (The transform
  operates on the MPM only; the MSM is never a transform input. The test still
  asserts it end-to-end: perform(msm, exaggerate(mpm, s)) yields the same note-id
  set and symbolic dates as perform(msm, mpm).)
- R6 (restated per A10/A11 — the original one-line form was unachievable):
  velocity range safety is split into what the MPM can guarantee and what only the
  caller can judge.
  - **(a)** The transform clamps the dynamics *level* attributes
    (`dynamics@volume`, `@transition.to`, `dynamicsDef@value`) into
    `velocityRange`, an option defaulting to `{min: 1, max: 127}`, and counts
    every clamp event. The floor is **1, not mlign's stated 0**, because velocity
    0 is a note-off; mlign notified of the narrowing.
  - **(b)** For every other velocity-touching dimension — `accentuation`,
    `articulation`, `ornamentDynamics`, **`imprecisionDynamics`** — the report
    carries the **coefficients** of the velocity contribution,
    `{multiplicative, additive}`, not a scalar maximum. A scalar is undefinable
    for articulation, whose contribution is affine in the note's incoming velocity
    (`v' = (v·r) + c`); reporting `{multiplicative: max|r'−1|, additive: max|c'|}`
    lets the caller evaluate `v·m + a` against its own velocities without the
    engine inventing a bound.
  - **(c)** Cross-dimension overflow is the caller's call, made by combining those
    coefficients. Overflow is consequential: `Msm.fitVelocities` is a
    document-wide compression that rescales every other note once any single value
    leaves the range, and its scan cannot even be trusted to detect that.

From orn conductor (v3 surface):
- O1: ornament registry entries are written against main's surface now, with the
  v3 entries prepared in a clearly marked block to activate on rebase (§7.15).
  Both v3 questions were confirmed by the orn conductor on 2026-08-09.

## 3. Dimensions

A *dimension* is the user-facing unit of exaggeration — coarser than an attribute,
finer than a map. **Dimension set v2: fifteen** (A9). The panel showed the v1 nine
were drawn along implementation lines in four places, fusing musically orthogonal
levers under one factor; each split below is a lever a caller demonstrably wants
to move independently.

| dimension | attributes covered | transform(s) | scope-aware |
|---|---|---|---|
| `tempo` | `tempo@bpm` ↔ `@transition.to`, `tempoDef@value` | map-geomean-log | yes |
| `tempoShape` | `tempo@meanTempoAt` | logit(0,1) | no |
| `dynamics` | `dynamics@volume` ↔ `@transition.to`, `dynamicsDef@value` | map-geomean-log | yes |
| `dynamicsShape` | `dynamics@curvature`, `@protraction` | boundary-power(low); logit(−1,1) | no |
| `rubato` | `rubato`/`rubatoDef` `@intensity`; `@lateStart` + `@earlyEnd` as one joint trim | log-1; boundary-power(low) on the total trim | no |
| `articulation` | `articulationDef` + inline: `@relativeDuration`, `@relativeVelocity`; `@absoluteDurationChange`, `@absoluteDurationChangeMs`, `@absoluteDelay`, `@absoluteDelayMs`, `@absoluteVelocityChange` | log-1; gain | no |
| `accentuation` | `accentuationPattern@scale` — the single site (D-C) | gain | no |
| `ornamentSpread` | `temporalSpread@frame.start` + `@frameLength` as one geometric pair | gain | no |
| `ornamentSpacing` | `temporalSpread@intensity` | log-1 | no |
| `ornamentDynamics` | `dynamicsGradient@transition.from`/`@transition.to` | gain | no |
| `asynchrony` | `asynchrony@milliseconds.offset` | gain | no |
| `imprecisionTiming` | width-like attributes of `imprecisionMap.timing` distributions | gain | no |
| `imprecisionDynamics` | width-like attributes of `imprecisionMap.dynamics` distributions | gain | no |
| `imprecisionDuration` | width-like attributes of `imprecisionMap.toneduration` distributions | gain | no |
| `pedalShape` | `movement@curvature`, `@protraction` | boundary-power(low); logit(−1,1) | no |

Why each split (panel evidence, §9):

- **`tempo`/`tempoShape` and `dynamics`/`dynamicsShape`** — level contrast and
  curve shape are orthogonal levers, and the v1 merge left no mechanism by which a
  caller could widen dynamic contrast while holding the swell's trajectory fixed.
  At the v1 dynamics maximum a curvature of 0.3 became 0.59 as an unavoidable side
  effect of asking for louder contrast.
- **`ornamentSpread`/`ornamentSpacing`** — v1's §8 already prescribed two ranges in
  two distributions for one factor, which `ExaggerationFactors` cannot express.
  Frame width is a gain on ticks/ms; spacing intensity is an exponent.
- **`imprecisionTiming`/`Dynamics`/`Duration`** — four perceptually incommensurable
  domains under one factor, with the v1 range derived from only two. "Loose
  timing, steady velocities" is an ordinary request the v1 vector could not
  express. **Tuning imprecision is excluded** (§7.16): nothing in the codebase
  reads `tuning.offset`, so it is inert by construction — reported, not offered as
  a knob that provably cannot be heard.
- **`pedalShape`** — new, and it **overturns D-G for the shape pair only**. The
  movement curve parameters are not controller state; they are mathematically the
  identical Bézier pair as `dynamics@curvature`/`@protraction`, share the same
  `bezier.ts` code and the same cancellation proof of neutrality at (0,0), and the
  survey rates them "a genuine expressive axis" — they move the instant at which
  the pedal crosses the receiver's on/off threshold, i.e. half-pedalling and
  pedal-lift speed. `@position`/`@transition.to` stay excluded under D-G as
  written.

**Preset mapping (D-H).** The prototype's eight-value weight vector predates this
set. Its documented correspondence onto v2: tempo→`tempo` (1.0, and `tempoShape`
inherits it), dynamics→`dynamics` (1.1, `dynamicsShape` inherits),
rubato→`rubato` (0.2), accentuation→`accentuation` (1.3),
temporalSpread→`ornamentSpread` **and** `ornamentSpacing` (1.5),
dynamicsGradient→`ornamentDynamics` (0.3), relativeDuration + relativeVelocity→
`articulation` (0.2/0.3, the lower taken — articulation is perceptually violent);
`asynchrony`, the three imprecision dimensions and `pedalShape` are new and
default to 1.0. A caller who wants one knob uses the preset; the split costs them
nothing.

Explicitly excluded, each with a one-line rationale and citation in §7.16:
movement `@position`/`@transition.to` (D-G), articulation's neutral-less
`absolute*` replacements (D-B), pitch/interval attributes (R5's spirit; also
inert — no consumer exists), `ornament@scale` (RESOLVED-6), tuning-domain
imprecision (inert), dates, `@beatLength`, `rubato@frameLength`, `@seed`,
`@milliseconds.timingBasis`, `@degreeOfCorrelation`, and every enum/boolean.

## 4. API sketch (facade, RULE F1/F2 conform)

Written out rather than sketched, because W2's applier hard-codes whatever this
leaves unsaid (A10/A11).

```ts
// src/api — text in, text out, typed errors, no undefined in outputs

export const EXPRESSION_DIMENSIONS = [
  'tempo', 'tempoShape', 'dynamics', 'dynamicsShape', 'rubato', 'articulation',
  'accentuation', 'ornamentSpread', 'ornamentSpacing', 'ornamentDynamics',
  'asynchrony', 'imprecisionTiming', 'imprecisionDynamics', 'imprecisionDuration',
  'pedalShape',
] as const;
export type ExpressionDimension = (typeof EXPRESSION_DIMENSIONS)[number];

export type ExaggerationFactors = {
  readonly [D in ExpressionDimension]?: number; // missing = 1 = identity (R3)
};

export interface ExaggerateOptions {
  readonly factors: ExaggerationFactors;
  readonly performance?: string | number;  // omitted ⇒ ALL performances (A11)
  readonly scope?: 'global' | 'gesture';   // default 'global'
  readonly center?: { readonly tempo?: number; readonly dynamics?: number };
  readonly velocityRange?: { readonly min: number; readonly max: number }; // default {1,127}
  readonly minRubatoWindow?: number;       // default 1e-6 (A6, IEEE saturation guard)
  readonly msm?: XmlText;                  // report estimates ONLY (R1 carve-out)
}

// Validation before anything is parsed: unknown keys in `factors`, non-finite
// factors, a factor outside its dimension's admissible s-domain (§1), or an
// out-of-order velocityRange all throw InvalidOptionError naming the offender.

export function exaggerateMpm(mpm: XmlText, options: ExaggerateOptions): ExaggerationResult;

export interface ExaggerationResult {
  readonly mpm: XmlText;
  readonly report: ExaggerationReport;
}

/** Locates one site as plain data. `index` (position among the container's
 *  element children) is the only locator that always exists; `xmlId` and `date`
 *  are conveniences — 7 of 16 reference fixtures carry no xml:id at all. */
export interface SiteRef {
  readonly scope: 'global' | 'part';
  readonly partIndex: number | null;
  readonly container: string;        // 'dynamicsMap' | 'dynamicsStyles/MEI export' | …
  readonly date: number | null;
  readonly index: number;
  readonly attribute: string;
  readonly xmlId: string | null;
}

export type SiteState =
  | 'absent'       // no such attribute/element exists in this performance
  | 'inert'        // present, but the renderer gives it no effect
  | 'transformed'  // written
  | 'partial'      // some components reachable, others excluded (articulation)
  | 'skipped';     // failed the validation gate or a site-discipline rule

export interface DimensionReport {
  readonly requestedFactor: number | null;
  readonly state: SiteState;
  readonly sitesTransformed: number;
  readonly sitesSkipped: number;
  readonly sitesInert: number;
  readonly writes: number;
  readonly clamps: number;
  /** R6(b). Null where the dimension does not touch velocity. */
  readonly velocityCoefficients: { readonly multiplicative: number; readonly additive: number } | null;
}

export interface ReportNote {
  readonly kind: ReportNoteKind;   // closed union, one per §7 obligation
  readonly dimension: ExpressionDimension | null;
  readonly site: SiteRef;
  readonly detail: string;
}

export interface PerformanceReport {
  readonly performance: { readonly index: number; readonly name: string };
  readonly dimensions: Record<ExpressionDimension, DimensionReport>; // full record, N4
  readonly centers: { readonly tempo: number | null; readonly dynamics: number | null };
  readonly bounds: { readonly tempoMaxS: number | null; readonly rubatoMaxS: number | null };
  readonly mergedLevels: readonly (readonly [string, string])[]; // clamp-collapsed named defs
  readonly notes: readonly ReportNote[];
  readonly totalWrites: number;
}

export interface ExaggerationReport {
  readonly appliedFactors: Record<ExpressionDimension, number>;
  readonly performances: readonly PerformanceReport[];
  readonly totalWrites: number;   // R4's contract: 0 ⇒ this sample is a no-op
}
// Every numeric field is finite or null (RULE F1's JSON round-trip, RULE N4).

export function spotlightMpm(mpm: XmlText, options: SpotlightOptions): SpotlightResult;

export interface SpotlightOptions {
  readonly ids: readonly string[];
  readonly attenuation: number;   // (0,1], single scalar (A8)
  readonly performance?: string | number;
}

export interface SpotlightResult {
  readonly mpm: XmlText;
  readonly report: ExaggerationReport;
  readonly spared: readonly ExpressionDimension[];
  readonly resolvedIds: readonly {
    readonly id: string;
    readonly element: string;
    readonly dimensions: readonly ExpressionDimension[];
  }[];
}
```

Interior: `src/expression/` — transforms (pure functions on numbers), registry
(attribute → scale space + neutral + domain predicate + s-domain + P5r verdict),
walkers (raw child-element walkers per D-A), applier.

## 5. Prototype features and their fates

| prototype | fate |
|---|---|
| Exaggerate (tempo/dynamics/meanTempoAt/rubato/temporalSpread/gradients/accentuation) | KEPT, generalized per §1; articulation actually implemented |
| Shader.bringOut(0.1) | KEPT as `spotlight`, attenuation explicit, `gesture` scope (D-I) |
| getDefaultWeights() magic profile | becomes an optional named preset, documented as heuristic, mapped onto the v2 dimensions (§3); default is NO weighting |
| Increase (tempo/dynamics/imprecision plain scaling) | subsumed: plain scaling is a different operation (shifts the mean, not the contrast) — provided as `scaleMpm` ONLY if a concrete consumer needs it; else dropped (YAGNI) |
| sketchiness curves | DROPPED from core; the exponents are a UI recipe, not library semantics. Documented as a cookbook example composing the primitives |
| humanize (add imprecision map) | DEFERRED: it *adds* instructions rather than transforming them, and mlign needs determinism; revisit on demand |
| Isolation.* | OUT OF SCOPE (charter) |

## 6. Decisions from the W0 survey and the W1 panel (binding for the registry)

D-A **Full-raw applier (rewritten per A1).** The applier parses with a raw
`new Builder().build(text)` and **never** constructs `Mpm`. This is not a
preference: `new Mpm(text)` runs the mutating def parsers in the **constructor**
(`Header.parseData`'s eager `addStyleType` loop), so the v1 clause "never *itself*
instantiates the def parsers" promised a relief that did not exist. Verified
baseline mutations of `new Mpm(text)` → `writeMpm()`, with no map or header call
anywhere: `rubatoDef` gains `intensity="1" lateStart="0" earlyEnd="1"` **and has
present values rewritten** (`"1.0"` → `"1"`); `accentuationPatternDef` gains
`length="4"`; `GenericMap.parseData` ends in an unconditional `sortXml()` that
reorders map children, exiles dateless children to the end and hoists every
instruction in front of all whitespace; `Performance` adds `pulsesPerQuarter` and
an empty `<global>`; `Global` appends empty `<header>`/`<dated>`; `Part` adds
`name=""`; `Dated.addMap`/`Header.addStyleType` **delete** duplicate
maps/style-collections. `Builder` is verified non-mutating — def attributes and
whitespace intact.

The applier therefore replicates, rather than borrows, four renderer behaviours:

- **Date-stable child ordering as an internal view** — a stable sort by
  `parseFloat(@date)` preserving document order for ties, computed in memory and
  **never written back**.
- **Positional style scope** — `findStyleSwitchAt` semantics: scan backwards *by
  array position* over that view. Never `getStyleAt`, which is date-based and
  disagrees at equal dates (a `<style>` at the same date as a preceding
  instruction is in scope for the former but not the latter, and the two readings
  differ by 3 velocity units on an ordinary MEI export).
- **Whole-styleDef shadowing** — part-local header first, then global, as a whole
  styleDef, never a per-def merge.
- **Renderer numeric semantics** — def lookup **first**, then `parseFloat`, then
  the fallback. A strict `Number()`/regex classifier is wrong twice:
  `bpm="120bpm"` renders as 120, and `<tempoDef name="120" value="60"/>` shadows
  the numeric reading of `bpm="120"`.

Navigation uses `getChildElements`/`getFirstChildElement` only. **`Element.query`
is banned**: it serializes the subtree with `toXML()`, re-parses it with
DOMParser and maps hits back by child-index path — O(document) per call.

Writes go through `attribute(name, el).setValue(...)`, which mutates only
`Attribute._value` and is order-preserving; **never**
`el.addAttribute(new Attribute(...))`, which removes-then-pushes and moves the
attribute to the end of the serialized list.

P1 is contracted as §1.1 states: canonical-baseline equality under both
predicates. There is no Tier 2 (A2).

D-B **Neutral-less attributes are excluded.** articulationDef/@absoluteDuration,
@absoluteDurationMs, @absoluteVelocity default to "leave the note alone"; their
neutral lives in the MSM, unreachable under R1. Excluded, registry-documented.
The *consequence* is now reported rather than merely noted: a def whose only
duration lever is excluded is reported `partial`, never `transformed` (§7.7).

D-C **Site discipline against double application.** Where a dimension is
homogeneous degree-1 across a def×scale product, exactly ONE of the two factors is
the transform site. For accentuation that site is the instruction's `@scale` and
defs are untouched (the instruction is the per-use lever, the def is shared). For
ornamentDynamics the rule inverts and the site is the *def's* gradient endpoints,
because the corresponding `@scale` is a dead lever — absent≙0 and hardcoded 0.0 by
the MEI converter. The invariant is "one site per degree-1 product", not "always
the instruction". Where defs ARE the levels (named dynamics/tempo levels "p",
"Allegretto"), the def's `@value` is transformed, deduped by def identity,
respecting part-header shadowing; numeric instruction values are transformed
directly; the two sites are disjoint in the renderer's resolution, so no s² is
possible. Placeholder strings ("+", "-", "?") and unresolvable names are skipped
and *reported*.

D-D **Domain-closed transforms beat clamps** (SURVEY finding: 4 cliff-clamps in
the renderer). Interior-neutral bounded values use the generalized logit on their
(a,b) with neutral (a+b)/2 — meanTempoAt on (0,1), dynamics/pedal protraction on
(−1,1). Boundary-neutral values use boundary-power. The test for "bounded" is
whether the *renderer* enforces the bound, not whether the spec names one:
dynamicsGradient endpoints were listed here on the strength of their nominal
[−1,1] and are gains, because nothing anywhere enforces that range and the values
are additive velocity units (RESOLVED-5). Only true musical ceilings (the
`velocityRange` option on dynamics *level* attributes; R6(a)) clamp, and every
clamp event is counted in the report. Domain closure is conditional on the row's
admissible s-domain (§1, A3) — it is not free for s < 0.

D-E **Positive extents are gains.** temporalSpread frameLength (and v3
frame.offset as signed gain), imprecision width attributes, asynchrony offsets:
x' = s·x (T = identity, neutral 0). The prototype's collection-geomean for
frameLength is dropped — it is an exact no-op for single-def styles (the common
case) and couples unrelated defs.

D-F **Imprecision scales jointly** across all width-like attributes of a
distribution, excluding milliseconds.timingBasis and @seed. Degree-1 homogeneity
was measured exact to 4e-15 — but that exactness holds for **explicit-basis
distributions only** (RESOLVED-7). The pre-existing NaN defect (@seed on
correlated distributions) is out of scope — reported upstream, not worked around.
Per A9 the grouping is unchanged but now sits inside three per-domain dimensions.

D-G **Movement position excluded; shape admitted (amended per A9).** Pedal
*position* is controller state, not a deviation from a neutral performance, and
canonical pedal maps are exact 0.0/1.0 where every candidate transform has a
pole — `@position`/`@transition.to` stay excluded. The *curve parameters* are a
different quantity and are now the `pedalShape` dimension (§3, §7.14): the panel's
twin-of-dynamics argument overturns the v1 exclusion, which had carried
`@position`'s rationale onto attributes it does not describe. The v1
counter-argument ("quantized away — ~17 events regardless of curvature") misread
the survey: 17 is the event *count*; curvature changes *which* of those events
first crosses the receiver's threshold, a shift of whole sample intervals.

D-H **Weights are data, not defaults.** `weightedFactors(s, weights)` implements
the prototype's lerp sᵈ = 1 + wᵈ(s−1); the tuned vector ships as a named exported
preset (documented heuristic) mapped onto the v2 dimensions per §3.
`exaggerateMpm` itself takes only the explicit factors record.

D-I **Spotlight (rewritten per A7/A8).** Dimension-wise: selected instruction
types keep s=1, every other dimension gets the caller's required `attenuation`.

- **Scope is `gesture`** — the only scope that delivers spotlight's stated intent.
  Under `global` the attenuation pulls every level toward the performance-wide
  center, so unselected *quiet* material is re-levelled **louder** (verified: a p
  at 48 in a {48,48,97} map renders at 59.3 under attenuation 0.1) — the inverse
  of "damp the background". Under `gesture` the pair geomean is held fixed,
  constants and defs are untouched, and levels do not move.
- **`attenuation ∈ (0,1]`**, one scalar. 0 is excluded because on a transition pair
  it collapses the endpoints onto their geomean and `transitionTo === bpm` is the
  renderer's exact-float constant-instruction test — the gesture would be
  *deleted*, not attenuated.
- **Pair-collapse guard**: after transforming a pair, if
  `String(to') === String(bpm')` the write is **refused and reported**.
- **Piecewise-constant maps**: level dimensions are inert under `gesture` and are
  reported `inert` with the reason, never silently claimed as transformed.
- **End-marker duplicate is HANDLED, not merely reported**: when a constant
  instruction at the next date duplicates the transition's `transition.to`, it
  moves with the transformed endpoint. It is the same musical value, not an
  independent lever, so D-C's one-site rule is not violated.
- **Selection errors** (A8): `ids: []` ⇒ identity, zero writes, report says so
  (survey verdict 20). Any id that resolves to no element, **or** resolves to an
  element whose type maps to no dimension, ⇒ a new
  `SelectionNotFoundError extends MeicoError` listing **every** offender. An empty
  derived spare-set is identity, never total suppression — that was the
  prototype's worst defect and `<movement>`/`<style>` selections reach it by an
  ordinary caller mistake.

Type → dimension mapping (part of this decision, updated for the §3 splits):

| element type | dimensions spared |
|---|---|
| `tempo` | `tempo`, `tempoShape` |
| `dynamics` | `dynamics`, `dynamicsShape` |
| `rubato` | `rubato` |
| `articulation` | `articulation` |
| `accentuationPattern` | `accentuation` |
| `ornament` | `ornamentSpread`, `ornamentSpacing`, `ornamentDynamics` |
| `asynchrony` | `asynchrony` |
| `distribution.*` | the imprecision dimension of its map's domain |
| `movement` | `pedalShape` |
| `style`, and any other type | none ⇒ `SelectionNotFoundError` |

## 7. Registry

Compiled from SURVEY.md (W0) and revised under the panel adjudication (A1–A14).
One table per dimension, then the v3-ornamentation block (§7.15), then every
excluded attribute (§7.16). Every numeric attribute the survey found appears in
exactly one row.

**Reading the columns.** *transform* uses the §1 vocabulary. *neutral* is the
value at which the **renderer** becomes the identity — never a spec default and
never a missing-data fallback. *domain + citation* gives the mathematical domain,
where (if anywhere) it is enforced, and the SURVEY line that proves it; the domain
is also the **input predicate** the §1.2 validation gate applies. *P5r* is the
render-level monotonicity verdict (A12): `holds` | `saturates` | `non-monotone` |
`cliff`. *notes* lists only what the implementation must honour.

**Every family's hazards inherit the §1.2 validation gate**: an out-of-domain
input is skipped and reported, never transformed and never repaired, and no
non-finite value is ever written. Rows do not restate it.

**✔ RESOLVED rows** mark the seven conflicts raised against the compiled registry
and decided by the conductor before being written back (LOG.md). Where the panel
subsequently amended a resolution, the block carries a **Panel amendment** line.

### 7.1 The center algorithm (A5) — shared by `tempo` and `dynamics`

Stated once, here, because three panel findings turned on its under-determination
and §8's bounds depend on it.

> **Population = exactly the distinct element sites the run will transform.**
> Compute the skip set FIRST (string levels that resolve to no def, unresolvable
> placeholders, heterogeneous-`@beatLength` defs, anything failing the validation
> gate). Then the population is: every numeric level attribute on its own element
> (`@bpm`, `@volume`) counted **once**, plus every `<tempoDef>`/`<dynamicsDef>`
> `@value` that at least one in-scope level string references, counted **once**
> per def element. `@transition.to` is **excluded from the population** — it is a
> target, not a prevailing level — while remaining fully transformed. Unreferenced
> defs are excluded and not transformed. The center is the unweighted geometric
> mean over that population, computed per performance and per dimension; tempo in
> quarter-note-normalized space (`bpm·beatLength·4`).

Three properties this buys, each of which the v1 wording lost:

- **Center invariance ⇒ P2.** Population and transform-site set coincide, so the
  recomputed center on the output equals the input center to one ULP. The v1
  population contained values at sites the run skips, which broke P2 by 26% on a
  heterogeneous-beatLength document.
- **Refactoring invariance.** A def contributes once regardless of reference count,
  so a name↔literal refactoring of the same performance yields the same center.
  The v1 population counted a def once as a def *plus* once per referencing
  instruction, making the "unweighted" mean silently reference-count-weighted.
- **Gestures do not displace levels.** Excluding `transition.to` stops a later
  ritardando target from pulling the center down and thereby speeding up the
  opening constant tempo. The pair still steepens by exactly s regardless of the
  center, so no expressive power is lost.

Span-weighting was proposed and **rejected** (§9): it requires an arbitrary rule
for the final instruction's span, which is the same objection that rules out
duration-weighting. Callers wanting another center pass `options.center`
(`center.tempo` is quarter-note bpm); the effective center is always reported.

### 7.2 `tempo`

| attribute | transform | neutral | domain + citation | P5r | notes |
|---|---|---|---|---|---|
| `tempo@bpm` | map-geomean-log | performance-wide center per §7.1 | ℝ>0, enforced nowhere — SURVEY.md:49-54 | holds | classify by def-lookup-first then `parseFloat` (D-A); transform in quarter-note-normalized space; `gesture` scope leaves this untouched |
| `tempo@transition.to` | map-geomean-log, same center; `gesture`: pair geomean | `to == bpm` is the renderer's own no-effect state — SURVEY.md:101-108 | ℝ>0, unvalidated; degenerate pairs deleted at parse — SURVEY.md:96-99 | cliff | **excluded from the center population** (§7.1) but transformed; pair-collapse guard: refuse+report when `String(to')===String(bpm')` |
| `tempoDef@value` | map-geomean-log | the same center (defs share it) | ℝ>0; strict parse, malformed def silently dropped — SURVEY.md:225-230 | holds | dedupe by def identity; part header shadows global; **skip + report** a def referenced from instructions with heterogeneous `@beatLength` — no single normalization factor exists |
| ✔ RESOLVED-1 | — | — | — | — | one performance-wide center, shared by defs; algorithm in §7.1 |

**✔ RESOLVED-1 — the global center is undefined for def values.** §1.3 defines the
default center as a geometric mean of level values, but named levels do not live
in the map: `bpm`/`transition.to` may hold a `tempoDef` name, and name-valued
levels are the MEI-export norm for dynamics (SURVEY.md:882-887). Two consequences
neither §1.3 nor D-C settled. (a) A map whose levels are all names has an empty
numeric level population, so it has no center unless names are resolved through
the style first. (b) One def is reachable from the global map and from any number
of part maps (SURVEY.md:241-249, SURVEY.md:1364-1366), each with a different
geomean, so "the def's center" is ambiguous the moment two referencing maps
disagree.

**Decision (conductor, 2026-08-09, LOG.md):** the center is **performance-wide per
dimension**, not per map — the geometric mean over style-resolved levels with
element-identity dedupe, shared by defs and instructions alike, computed in
quarter-note-normalized space for tempo. A single center per (performance,
dimension) is invariant under the transform, which is what makes P2 exact.

**Panel amendment (A5):** the population is now an **explicit algorithm** (§7.1),
because the decision's wording was under-determined in three ways that each
changed every number written. Three changes: the skip set is computed **first**
so the population and the transform-site set coincide (v1 included values at
sites the run skips, breaking P2 by 26% on a heterogeneous-`@beatLength`
document); each def counts **once** rather than once per reference plus once as a
def (v1's "unweighted" mean was silently reference-count-weighted, so a
name↔literal refactoring of the same performance changed the output); and
`@transition.to` is **excluded from the population** while remaining transformed
(v1 let a later ritardando target pull the center down and thereby speed up the
opening constant tempo). Span-weighting was proposed and rejected — see §9.

*String levels.* `bpm`/`transition.to` may hold a def name or an MEI placeholder
`'+'`, `'-'`, `'?'`; unresolvable values fall back to 100.0 with only a
`console.error` (SURVEY.md:388-391). Skip and report; rewriting a name as a number
is forbidden — it severs the style linkage the def-side transform depends on.

*Commensurability.* Raw `bpm` values of instructions with different `@beatLength`
are not comparable; the center is computed on `bpm·beatLength·4` and each value
mapped back through its own factor (SURVEY.md:81-83, SURVEY.md:183-188). A
`tempoDef` borrows the referencing instruction's `@beatLength`, so a def reached
from instructions whose values differ cannot be normalized and is skipped.

*Inert instructions.* A `<tempo>` without `@beatLength` is skipped by the renderer
entirely (SURVEY.md:432-435) and a transition on the last instruction integrates
over an effectively infinite span (SURVEY.md:404-409). Report `inert`.

*Aliasing.* Do **not** resolve part maps through `Performance.resolvePartMaps`:
walk `global/dated` and each `part/dated` and take only the map elements
physically present there. Under D-A's architecture a part without a `<tempoMap>`
simply has none, so the v1 "global map visited once per part" hazard does not
arise. Element-identity dedupe is required on the **def** side only.

### 7.3 `tempoShape`

| attribute | transform | neutral | domain + citation | P5r | notes |
|---|---|---|---|---|---|
| `tempo@meanTempoAt` | logit(0,1) | 0.5 (`exponent = 1.0`) — SURVEY.md:138-144 | open (0,1); out-of-range **reinterpreted**, not clamped — SURVEY.md:130-136 | cliff | transform only when `@transition.to` is present, else report `inert`; **output clamp to [ε, 1−ε]** required — the logit saturates to exactly 1.0 at s ≈ 8 for 0.99, and 0/1 are semantic cliffs that turn the instruction into a constant tempo at the *other* endpoint |

*The epsilon is an output clamp, not an input guard.* The survey stated it as
mandatory; v1 dropped it believing the logit's openness sufficed, which holds in ℝ
and not in doubles (`1/(1+exp(−z))` returns exactly 1.0 once z ≳ 36.7). Reaching
it is reported — it marks the point past which further s does nothing.

*Metric choice.* logit over the position, not log-1 over the renderer's own
`exponent = ln0.5/ln x`: both satisfy P1–P5 and give different numbers (x=0.25 at
s=2 gives 0.1 vs 0.0625). The position is the perceptually even parameter — it is
*where in the span* the mean tempo falls — and it is what the format exposes.

### 7.4 `dynamics`

| attribute | transform | neutral | domain + citation | P5r | notes |
|---|---|---|---|---|---|
| `dynamics@volume` | map-geomean-log | performance-wide center per §7.1; `center.dynamics` may override | unbounded ℝ at parse; MIDI range enforced only downstream — SURVEY.md:463-471 | saturates | clamp to `velocityRange` (R6a) and count; `gesture` scope leaves this untouched |
| `dynamics@transition.to` | map-geomean-log, same center; `gesture`: pair geomean | `to == volume` is `isConstantDynamics` — SURVEY.md:519-525 | as `@volume`; its **presence** is the switch into the transition branch — SURVEY.md:513-517 | saturates | **excluded from the center population**, still transformed; never materialize or drop it; the MEI end-marker duplicate moves with it (D-I) |
| `dynamicsDef@value` | map-geomean-log | the same center (defs share it) | unbounded ℝ; malformed literal ⇒ def silently dropped — SURVEY.md:619-623 | saturates | the **correct** lever for name-valued volumes (the MEI norm); dedupe by def identity; blast radius is the whole styleDef; clamp collapse reported via `mergedLevels` |
| ✔ RESOLVED-1 | — | — | — | — | center algorithm in §7.1 |
| ✔ RESOLVED-4 | — | — | — | — | R6 split: clamp the levels here, report coefficients elsewhere |

**✔ RESOLVED-4 — R6/D-D cannot bound the rendered velocity.** D-D clamps the
dynamics level attributes and R6 originally asked that dynamics exaggeration keep
velocities in MIDI range on the data path. But velocity is a shared bus: after
`DynamicsMap` writes `@velocity`, metrical accentuation **adds**
`accentuation·scale`, articulation multiplies and offsets it, ornamentation adds
`ornament.dynamics`, and imprecision offsets it again, in a fixed pass order
(SURVEY.md:917-924). Every one of those addends is unbounded, and the final value
depends on MSM note data the transform never sees (R1). The overflow consequence
is not local: `Msm.fitVelocities` is a document-wide piecewise-linear compression
that silently rescales every other note once any single value leaves the range —
and its scan cannot even be trusted to detect that (SURVEY.md:859-869).

**Decision (conductor, 2026-08-09, LOG.md):** R6 is restated in §2 as three parts —
clamp the *level* attributes only, report per-dimension velocity-offset estimates
elsewhere, and leave cross-dimension overflow to the caller, informed by the
report. A per-attribute bound would be a number invented to look safe, precisely
the magic constant C2 forbids.

**Panel amendment (A10/A11):** three corrections. The estimate becomes
**coefficients** `{multiplicative, additive}` rather than a scalar maximum,
because for articulation the contribution is affine in the note's incoming
velocity and no finite MPM-only maximum exists. **`imprecisionDynamics` joins the
reporting set** — v1's enumeration omitted it although §7.13 documents it as the
fifth unclamped velocity contributor, so a caller summing the report was summing
an incomplete set. And the range itself becomes the **`velocityRange` option**
(default `{min:1, max:127}`) rather than a constant in the requirement text; the
floor of 1 is documented (velocity 0 is a note-off) and mlign was notified that it
narrows their stated [0,127].

*Clamping merges named levels.* The clamp bites only at the top, so two adjacent
named levels converge and can become identical — on the reference fixture both `f`
and `ff` clamp to the ceiling at s ≈ 4, after which every note marked f and every
note marked ff renders at one velocity. The exaggeration would *destroy* a dynamic
distinction rather than widen it, and P2/P5 fail there. The report's `mergedLevels`
names any pair of defs in one styleDef whose transformed values became equal, so a
caller can reject the sample.

*Sub-note spans get a third range regime.* With `@subNoteDynamics="true"` the
values become CC 7 curve points, which `fitVelocities` never scans, which are
hard-clipped at 0..127 by the MIDI writer and unclamped on the data path
(SURVEY.md:870-874). The attribute is excluded (§7.16) but must be **read**.

*Unreachable levels.* Notes before the first instruction are hardcoded to 100.0 and
an unterminated transition never reaches its `transition.to`
(SURVEY.md:930-934). Whether such notes exist is MSM knowledge, so this is
reported only when `options.msm` is supplied; otherwise the field is `null`.

### 7.5 `dynamicsShape`

| attribute | transform | neutral | domain + citation | P5r | notes |
|---|---|---|---|---|---|
| `dynamics@curvature` | boundary-power(low) | 0.0 — proved linear by Bézier cancellation — SURVEY.md:549-561 | [0,1] inclusive, clamped on the map API only, never on the document — SURVEY.md:542-547 | holds | inert on constant instructions ⇒ report `inert`, do not write — SURVEY.md:888-892; `x = 1` is an admissible fixed point (closed form, not `0·∞`) |
| `dynamics@protraction` | logit(−1,1) | 0.0 — branch condition *and* continuous limit — SURVEY.md:588-598 | [−1,1] inclusive, clamped on the map API only — SURVEY.md:582-586 | holds | same inertness rule; ±1 are admissible boundary fixed points via the closed form |

*Why this is a dimension of its own.* Both are a pure time reparameterization whose
output can never leave `[volume, transition.to]`, so no s can push a velocity out
of range — they are the only range-safe dynamics attributes, and their perceptual
scale is unrelated to loudness contrast. Fusing them with `dynamics` meant a caller
asking for wider contrast unavoidably got a late-blooming swell.

*Inertness is `inert`, not `absent`.* These attributes are physically present and
merely force-zeroed by the renderer on a constant instruction. A consumer diffing
reports must be able to distinguish "the document does not use curvature" from
"the document uses curvature where it does nothing".

### 7.6 `rubato`

| attribute | transform | neutral | domain + citation | P5r | notes |
|---|---|---|---|---|---|
| `rubato@intensity` | log-1 | 1.0 — identity for every frameLength — SURVEY.md:974-985 | (0,∞); enforced on the **def** path only, never on the element — SURVEY.md:965-972 | holds | the gate rejects ≤0 inputs (0 collapses the frame to an instant, <0 gives `Infinity` dates) rather than repairing them |
| `rubato@lateStart` | joint trim: `t = ls + (1−ee)`, boundary-power(low) on `t`, split on preserved ratio | 0.0 (lower bound of its own domain) — SURVEY.md:1022-1028 | [0,1) and `< earlyEnd`; clamped on map and def paths — SURVEY.md:1014-1020 | holds (with the A6 guard); `cliff` without it | resolve the **effective** window per element before transforming; guard below |
| `rubato@earlyEnd` | joint trim (same pair) | 1.0 (upper bound) — SURVEY.md:1062-1067 | (0,1] and `> lateStart`; clamped on map and def paths — SURVEY.md:1054-1060 | as `@lateStart` | `0 ≤ ls < ee ≤ 1` is the renderer's monotonicity guarantee, not defensive noise — SURVEY.md:1075-1080 |
| `rubatoDef@intensity` | log-1 | 1.0 — SURVEY.md:1193-1196 | (0,∞), **enforced** here — SURVEY.md:1187-1191 | holds | must be covered: a document of bare `<rubato name.ref=…/>` has no element attributes at all; dedupe by def identity |
| `rubatoDef@lateStart` | joint trim | 0.0 — SURVEY.md:1222-1225 | [0,1), `< earlyEnd`; enforced — SURVEY.md:1216-1220 | as above | write both bounds atomically; `setLateStart` alone silently refuses |
| `rubatoDef@earlyEnd` | joint trim | 1.0 — SURVEY.md:1251-1255 | (0,1], `> lateStart`; enforced — SURVEY.md:1246-1250 | as above | as above |
| ✔ RESOLVED-2 | — | — | — | — | joint trim, now with the restored saturation guard |
| ✔ RESOLVED-3 | — | — | — | — | P1 is canonical-baseline only; Tier 2 dropped entirely |

**✔ RESOLVED-2 — the (lateStart, earlyEnd) pair breaks P3.** §1 assigned the two
bounds independent boundary-power maps and P3 claimed domain closure came from the
transform rather than a clamp. That holds per attribute and fails for the pair:
the bounds are jointly constrained (`0 ≤ ls < ee ≤ 1`) and the independent maps
cross at s solving `ee^s + (1−ls)^s = 1` — s ≈ 1.36 for a trimmed window (.4/.6),
s ≈ 6.6 for a light one (.1/.9). Past that, **both** renderer paths silently reset
the pair to (0.0, 1.0) (SURVEY.md:1035-1041, SURVEY.md:1367-1374): the
exaggeration does not saturate, it jumps discontinuously to *no window effect at
all*.

**Decision (conductor, 2026-08-09, LOG.md): joint trim reparameterization.**
Transform head trim `a = lateStart` and tail trim `b = 1 − earlyEnd` through their
sum `t = a + b` with boundary-power(low), then split on the preserved ratio. The
neutral (0,1) is fixed, `t` composes exactly, and P5 is restored.

**Panel amendment (A6):** the survey's second half — which v1 dropped on the
grounds that crossing was "gone by construction" — is **restored**, because the ℝ
proof fails in IEEE-754. Once `(1−t)^s < 2⁻⁵⁴`, `1 − (1−t)^s` rounds to exactly
1.0, the split returns `a' + b' = 1`, and the renderer's *inclusive*
`lateStart >= earlyEnd` test trips the very reset cliff the trim exists to remove
(verified at s=16 for ls .45/ee .55). So: `t'` is clamped to
`1 − minRubatoWindow`, `ls' < ee'` is asserted before any write, and §8 regains
the per-document bound as a report field. Second correction: skipping a
cross-site partial override does **not** prevent the crossing, because the def is
still transformed and inheritance resolves per attribute — the def must be
excluded from the trim instead, and the report must name the element.

**The A6 guard (restored).** `t'` is clamped to `min(t', 1 − minRubatoWindow)`
before the ratio split, with `minRubatoWindow` an option defaulting to 1e-6 and
documented as an **IEEE saturation guard**, not a musical bound. `ls' < ee'` is
then asserted on the computed pair before any write; failure is a typed engine
error, because the renderer's response to a crossed pair is a silent total reset to
(0,1). Without the clamp the ℝ proof fails in doubles: once `(1−t)^s < 2⁻⁵⁴`,
`1 − (1−t)^s` rounds to exactly 1.0 and the split returns `a' + b' = 1`, which
trips the renderer's inclusive `lateStart >= earlyEnd` test — the exact cliff the
joint trim exists to remove (verified at s=16 for ls .45/ee .55).

**Cross-site overrides bind the def, not just the element.** Skipping a partially
overriding element does not prevent the crossing, because the def is still
transformed and inheritance resolves *per attribute*: a def (0.1, 0.9) with an
element supplying `lateStart="0.85"` has effective window (0.85, 0.9), and
transforming the def alone to (0.18, 0.82) crosses it. So: resolve every
referencing element's effective window first; **exclude a def from the joint trim
when any referencing element partially overrides it**, and report naming the
element, not only the def.

**✔ RESOLVED-3 — P1's "strict input==output" clause is unreachable for def-bearing
documents.** D-A originally claimed the module "never instantiates the def parsers
that mutate the document on parse" and contracted P1 with a strict
`input == output` tier for documents carrying no self-mutating def. The survey
showed those parsers run as part of ordinary style parsing:
`RubatoDef.parseDataInternal` adds `intensity`/`lateStart`/`earlyEnd` when absent
(SURVEY.md:1394-1401) and a missing `accentuationPatternDef@length` is added as
`length="4"` (SURVEY.md:2472-2476).

**Decision (conductor, 2026-08-09, LOG.md):** a two-tier contract — canonical
baseline equality universally, strict `input == output` only for documents without
self-mutating defs, that exception pinned by a test.

**Panel amendment (A2): Tier 2 is dropped entirely, not qualified.** Three
independent refutations. The predicate was wrong on its own terms — `RubatoDef`
also **rewrites values that are present** (`intensity="1.0"` → `"1"`), so every
Java-meico-written def diverges regardless of omissions. The trigger is the
**constructor**, not an API call, so no access discipline avoids it. And
decisively, strict input==output is unreachable for *every* MPM whatever the
applier does: `Element.wrap` drops `xmlns` at parse and `Element.toXML` re-emits
it on every namespaced element, inflating a real Tier-2-eligible fixture from 2444
to 4011 bytes. P1 is therefore recontracted in §1.1 around the canonical baseline
alone, with **two** predicates (`{}` and every-dimension-1) and an explicit
`s === 1` short-circuit — because the v1 justification, "a write happens only when
the value differs", is itself false in doubles.

*Traversal.* Visit every `rubatoStyles` def once and every `<rubato>` element once,
scaling only attributes **physically present** on each site — but compute effective
windows first, per the paragraph above. Where neither site supplies a value the
`RubatoData` defaults 1.0/0.0/1.0 are themselves the neutral, so the transform is
the identity there by construction.

*Parse leniency split.* The def path throws on a malformed literal and drops the
whole def; the element path uses bare `parseFloat`, where `'abc'` becomes NaN and
`'12abc'` becomes 12 (SURVEY.md:1388-1393). The gate catches both.

### 7.7 `articulation`

Both sites carry all twelve attributes: `<articulationDef>` (named) and inline
`<articulation>`. The transform is per-attribute; the **composition semantics
differ by element**.

| attribute | transform | neutral | domain + citation | P5r | notes |
|---|---|---|---|---|---|
| `@relativeDuration` | log-1 | 1.0 — exact-equality guard *and* arithmetic — SURVEY.md:1469-1475 | (0,∞) musically; enforced nowhere — SURVEY.md:1464-1467 | holds | neutral ≡ absent (serializer omits at 1.0); inert when a sibling `@absoluteDurationChange` is non-zero on the same **inline** element |
| `@relativeVelocity` | log-1 | 1.0 — SURVEY.md:1752-1756 | (0,∞); unenforced — SURVEY.md:1748-1750 | **non-monotone** | affine with `@absoluteVelocityChange`: rendered `v' = v·r^s + s·c` is not monotone in s, and a pair that cancels at s=1 is *not* a fixed point — see below |
| `@absoluteDurationChange` | gain | 0.0 — guard skips the branch — SURVEY.md:1507-1511 | signed ticks at the performance PPQ; unbounded, unenforced — SURVEY.md:1500-1505 | **saturates** | the renderer's halving loop plateaus for negative values; the plateau is note-dependent and not predictable from the document |
| `@absoluteDurationChangeMs` | gain | 0.0 — SURVEY.md:1580-1585 | signed ms; unbounded; only the pass-two commit guard — SURVEY.md:1576-1578 | **cliff** | best-behaved at the attribute level; the shared pass-two guard is a cliff, not a clamp |
| `@absoluteDelay` | gain | 0.0 — no write **and** no re-sort — SURVEY.md:1648-1653 | signed ticks; unbounded, unenforced — SURVEY.md:1644-1646 | holds | cleanest lever: moves both note edges; large values trigger `map.sort()` and can reorder simultaneous instructions |
| `@absoluteDelayMs` | gain | 0.0 — SURVEY.md:1683-1687 | signed ms; unbounded, unenforced — SURVEY.md:1680-1681 | **cliff** | moves the onset but **not** the end ⇒ shortens the note; past the remaining length the shared commit guard discards it entirely |
| `@absoluteVelocityChange` | gain | 0.0 — SURVEY.md:1718-1721 | signed velocity offset; bounded only by the document-wide `fitVelocities` — SURVEY.md:1712-1716 | **non-monotone** | the idiomatic accent lever (meico defaults ±25, +12, ±5); reported as R6(b) coefficients, not clamped |
| ✔ RESOLVED-4 | — | — | — | — | velocity offsets are reported as coefficients, not clamped (§7.4) |

**The affine velocity pair is non-monotone, and the design says so.**
`@relativeVelocity` and `@absoluteVelocityChange` compose as `v' = (v·r) + c`;
exaggerating r by log-1 and c by gain under one factor gives rendered
`f(s) = v·r^s + s·c`. With v=100, r=0.5, c=+50 — a configuration that is *exactly
neutral* at s=1 — f(0.5)=95.7, f(1)=100, f(2)=125: monotonicity fails around s=1
and the neutral configuration is not a fixed point, so P4 fails at the render too.
The panel's proposed net-deviation transform (scale the composite and re-split) was
**rejected** (§9): it needs the note's incoming velocity, which is MSM data R1
forbids. The disposition is disclosure — this row, the P5r column, and a report
note when a site carries both.

**Composition is keyed on the element, not the attribute name.** On
`<articulationDef>` the three tick-duration attributes **compose**. On inline
`<articulation>` the original duration is read once up front, so they do **not** —
the last non-neutral one overwrites, precedence `absoluteDurationChange >
relativeDuration > absoluteDuration` (SURVEY.md:1979-1992).

**D-B's exclusions make this dimension lopsided, and that is reported.** On a def
carrying an excluded *duration* attribute and an included *velocity* one — meico's
own `stacc` (`absoluteDurationMs="160"`, `absoluteVelocityChange="-5"`) —
exaggeration scales the velocity and freezes the duration, so "more staccato"
renders as "softer", never "shorter". Every articulation site therefore reports
which **components** were reachable, and a site whose only duration lever is
excluded is `partial`, never `transformed`. The sanctioned migration is editorial
and outside this transform: rewrite `@absoluteDurationMs` to
`@relativeDuration`/`@absoluteDurationChangeMs` first (SURVEY.md:1629-1631).

*The millisecond commit guard is a shared cliff.* Pass two commits only if
`dateNew < endNew`; if an exaggerated value inverts the note, **all three** ms
modifiers are discarded and the note reverts to its unexaggerated date *and* end
(SURVEY.md:2003-2009). The v1 "clamp against a configured minimum note length" is
**demoted to report-only cliff risk** (A11) — the clamp needs the note's rendered
length, which is MSM data.

*Cross-element voiding.* A def carrying `@absoluteDurationMs` replaces the end date
outright at ms time, so exaggerating an inline `@relativeDuration` on such a note
is inaudible (SURVEY.md:2018-2026).

*Write discipline.* Every neutral guard is exact float equality and every write
goes through `String(v)`. Never round-trip through `ArticulationData` →
`addArticulationFromData`: that serializer drops nine of the twelve modifiers.

*Test discipline.* This family is a fixture blind spot — every `<articulation>` in
the integration corpus carries only `name.ref` and `noteid`, so all twelve numeric
modifiers went unread through the entire certification programme
(SURVEY.md:2083-2090). Guard tests must build their XML.

### 7.8 `accentuation`

| attribute | transform | neutral | domain + citation | P5r | notes |
|---|---|---|---|---|---|
| `accentuationPattern@scale` | gain, s ≥ 0 | 0.0 — proved at the render site (`velocity + accentuation·scale`) — SURVEY.md:2122-2130 | any signed ℝ; enforced nowhere; **mandatory** (absent ⇒ the whole instruction is dropped) — SURVEY.md:2115-2120, SURVEY.md:2445-2450 | **saturates** (past the range ceiling, via `fitVelocities`) | never express neutrality by deleting the attribute — write `"0"`; s<0 inverts the accent contour (a musical inversion, not an exaggeration); the def triple stays untouched or s² |
| ✔ RESOLVED-4 | — | — | — | — | reported as R6(b) coefficients, not clamped (§7.4) |

*The velocity estimate is document-relative unless an MSM is supplied.* The exact
form needs the beat argument `1 + ((noteDate − tsDate) % measureTicks)/beatTicks`,
whose inputs come from the MSM's `timeSignatureMap` and score. Without
`options.msm` the report gives `|scale'| · max|getAccentuationAt(b)|` over the
def's **own declared `@beat` anchors** plus `beatsUnverifiable: true` (A10).

*Why the def triple is out.* `getAccentuationAt` is positively homogeneous of
degree 1 in (`@value`, `@transition.from`, `@transition.to`), so scaling the triple
by s is **exactly** equivalent to scaling `@scale` by s (SURVEY.md:2451-2455).
Touching both applies s². D-C picks `@scale`: it is per-instruction, whereas one
def is addressed from any number of instructions in any part. The triple is
available only as a separate opt-in "reshape" knob, scaled atomically, never
materializing an absent attribute.

*Documented no-ops the report must catch.* Real documents put raw tick values in
`@beat`/`@length`, rendering a nearly flat ramp (SURVEY.md:2503-2510); with
`stickToMeasures="true"` anchors beyond the measure are never reached.

*Formatting.* Every write goes through `String(x)`, which prints `4.0` as `"4"`;
s = 1 must be "do not touch the attribute" (the §1.1 short-circuit).

### 7.9 `ornamentSpread`

| attribute | transform | neutral | domain + citation | P5r | notes |
|---|---|---|---|---|---|
| `temporalSpread@frame.start` | gain — **same factor as `@frameLength`** | 0.0 (full identity only with `frameLength` = 0 too) — SURVEY.md:2573-2580 | unbounded ℝ, negative idiomatic; enforced nowhere — SURVEY.md:2568-2571 | **cliff** (see below) | the frame `[start, start+length]` is a geometric pair; scaling length alone drags the centroid late |
| `temporalSpread@frameLength` | gain, s ≥ 0 | 0.0 — SURVEY.md:2609-2614 | [0,∞); one-sided `Math.max(0,·)` in the setter — SURVEY.md:2604-2607 | **cliff** | D-E: the prototype's collection-geomean is dropped; a negative value collapses the spread to a point instead of reversing it |

*The cliff.* With `@noteoff.shift` absent the whole offset is absorbed by
`duration.perf` with no floor, so a large s can drive a note's duration negative
(SURVEY.md:2588-2590). The cap is note-length dependent, i.e. MSM data: without
`options.msm` the report carries the frame magnitude and flags cliff risk rather
than a bound.

*Branch on the unit before choosing s.* `@time.unit` decides whether the frame
numbers are PPQ-relative ticks (tempo-relative) or absolute milliseconds, folded in
before and after the tempo map respectively (SURVEY.md:2795-2813). Excluded as an
enum but load-bearing for the factor.

*`@noteoff.shift` modulates the sign.* Absent ⇒ duration absorbs the offset;
`"true"` ⇒ the note end moves with the onset (the safe mode); `"monophonic"` ⇒
widening the frame **lengthens** notes — the opposite sign (SURVEY.md:2826-2846).

*Single-element edge case.* A lone note is placed at `frameStart + frameLength`, so
exaggeration amplifies a displacement on notes never meant to be spread.

*Mutation lane.* `TemporalSpread`/`DynamicsGradient` are deliberately not
`AbstractXmlSubtree`: public fields do not write through, `getXml()`
**materializes** an element as a side effect, and `OrnamentDef` parses duplicate
children last-one-wins. D-A's raw applier avoids all of it.

### 7.10 `ornamentSpacing`

| attribute | transform | neutral | domain + citation | P5r | notes |
|---|---|---|---|---|---|
| `temporalSpread@intensity` | log-1 | 1.0 (`pow(x,1) = x`, even spacing) — SURVEY.md:2640-2645 | exponent, (0,∞); enforced nowhere — SURVEY.md:2635-2638 | holds | the §1.2 gate rejects ≤0 inputs; the **epsilon floor is dropped** (A4) — `log-1` cannot produce a non-positive result from a positive input, so the floor could only have edited an authored value |

*Why separate from the frame.* It is the *spacing curve* of the roll (>1 crowds the
start, <1 crowds the end), an exponent, not a width. Sampling s=3 to widen a roll
would otherwise drive the fixture's authored intensity 2.0 to 8.0, piling the whole
ornament onto its end.

### 7.11 `ornamentDynamics`

| attribute | transform | neutral | domain + citation | P5r | notes |
|---|---|---|---|---|---|
| `dynamicsGradient@transition.from` | gain — no clamp | 0.0 — additive contribution of 0 — SURVEY.md:2672-2677 | **unbounded ℝ in fact**; [−1,1] is convention only, enforced nowhere — SURVEY.md:2667-2670 | holds (inert when `@scale` is 0) | the single site (RESOLVED-6); out-of-[−1,1] results reported informationally, not corrected |
| `dynamicsGradient@transition.to` | gain — no clamp | 0.0 absolute; **defaults to `@transition.from` when absent**, not to 0 — SURVEY.md:2701-2711 | as `@transition.from` | as above | never scale a `transition.to` that is not physically present: a flat `+5` offset would silently become a ramp; single-chord ornaments are governed entirely by this endpoint |
| ✔ RESOLVED-5 | — | — | — | — | endpoints are gains: renderer semantics beat the nominal domain |
| ✔ RESOLVED-6 | — | — | — | — | endpoints are the single site; `ornament@scale` excluded (§7.16) |

**✔ RESOLVED-5 — logit(−1,1) is the identity on the corpus's only real gradient.**
*(The conflict as compiled: D-D named the endpoints an interior-neutral logit case,
and O1 specified "linear in [−1,1] with clamp". D-D now carries the amendment.)*
The survey settles the factual half: the domain is **not** enforced anywhere —
bare `parseFloat`, no clamp at parse, at use, or at the velocity fold-in — and the
values are plain velocity units **added** to velocity, a signed-offset space, not
a bounded proportion (SURVEY.md:2667-2670). Decisively, the built-in arpeggio def
ships `(−1, +1)`, exactly the nominal bounds (SURVEY.md:2679-2683); under
logit(−1,1) those are poles and therefore fixed points, so the dimension would be
the identity on every default arpeggio.

**Decision (conductor, 2026-08-09, LOG.md): the endpoints are gains** —
`T = identity`, neutral 0, **no clamp**; a result outside [−1,1] is reported
informationally. This also restores internal consistency: §1's own scale-space
table already listed these endpoints under *linear*; it was D-D that diverged.

**Panel amendment: none.** The orn conductor confirmed on 2026-08-09 that v3
enforces the range nowhere either, so the divergence from O1's "with clamp" is
settled in favour of the gain reading on both surfaces (§7.15).

**✔ RESOLVED-6 — this dimension applies s² as specified.** The rendered
contribution is `constFac·n + from·scale` with `constFac = scale·(to−from)/(n−1)`:
homogeneous of degree 1 in the endpoints **and** in `@scale`
(SURVEY.md:2672-2677, SURVEY.md:2737-2747). §3 as drafted and O1 both listed
endpoints *and* `ornament@scale` under one dimension, so one factor s would
multiply the rendered velocity offset by s² — exactly the double application
D-C's site discipline exists to prevent.

**Decision (conductor, 2026-08-09, LOG.md): the endpoints are the single site;
`ornament@scale` is EXCLUDED** (§7.16). It is the degree-1 partner, and it is a
dead lever — absent≙0 and hardcoded 0.0 by the MEI converter — so no factor can
move it off zero.

**Panel amendment (A9):** the decision stands but **its rationale was wrong and is
corrected**. v1 argued "with RESOLVED-5 turning the endpoints into gains, the
def-side site is now the one that actually responds on real documents". It is not:
every term of the contribution carries `@scale` as a factor, so `scale = 0` zeroes
the offset regardless of the endpoints, and scaling them is exactly as dead as
scaling `@scale` would be. The true rationale is narrower — the endpoints are the
only site that is not the degree-1 partner — and the inertness becomes a
first-class report state rather than a claim the design contradicted elsewhere in
the same document.

**This dimension is inert on the dominant corpus, and that is a first-class report
state.** The rendered contribution is `constFac·n + from·scale` with
`constFac = scale·(to−from)/(n−1)` — every term carries `@scale`, which is absent≙0
and hardcoded 0.0 by the MEI converter for every arpeggio (three of four
`<ornament>` entries in the reference fixture carry no `@scale`). So scaling the
endpoints is exactly as dead as scaling `@scale` would be; RESOLVED-6's original
rationale ("the def-side site actually responds on real documents") was wrong and
is corrected in its Panel amendment. `ornamentDynamics` is reported `inert`
whenever every referencing `<ornament>` has `@scale` absent or 0, so callers skip
the sample instead of generating identity documents. Making it live requires
**seeding** a non-zero scale — an editorial document edit, deliberately *not*
smuggled into `s`; if a consumer needs it, it arrives as an explicit
`seedOrnamentScale?: number` option, not as part of this dimension.

*Velocity reporting.* R6(b) coefficients: `{multiplicative: 0,
additive: max(|from'|, |to'|) · scale}`, zero wherever `@scale` is.

*Stacking.* Both transformers **add** to whatever `ornament.*` marker a note
carries, so overlapping ornaments stack; the estimate is per-def and therefore a
lower bound where ornaments overlap.

*Unreachable entries.* An ornament before the first `<style>` entry, or whose
`name.ref` does not resolve, is skipped outright (SURVEY.md:3008-3013).

### 7.12 `asynchrony`

| attribute | transform | neutral | domain + citation | P5r | notes |
|---|---|---|---|---|---|
| `asynchrony@milliseconds.offset` | gain | 0.0 — "no instruction" ≡ offset 0, and the only consumption sites are additions — SURVEY.md:3077-3082 | signed ms, unbounded; enforced nowhere; a missing attribute yields NaN — SURVEY.md:3072-3075 | **saturates** | exactly linear in the document; render-side one-sided floors only: negative offsets floor at t=0 near the start and short notes floor at start+1 ms |

*Interaction with `tempo`.* Asynchrony is fixed in milliseconds while tempo
exaggeration rescales the millisecond timeline, so the same offset becomes
relatively larger as the tempo is exaggerated slower (SURVEY.md:422-427). P2 holds
per dimension; the audible result of combining the two does not compose.

### 7.13 `imprecisionTiming`, `imprecisionDynamics`, `imprecisionDuration`

Three dimensions, one registry table: the rows are identical in shape and differ
only in which `imprecisionMap.*` they live in and therefore in their units
(ms / velocity units / ms of note length). Per D-F the width-like attributes of
**one distribution** scale as a single atomic group.

| attribute (per distribution) | transform | neutral | domain + citation | P5r | notes |
|---|---|---|---|---|---|
| `uniform@limit.lower` + `@limit.upper` | gain, atomic pair, s ≥ 0 | 0.0 each (`d = r·(upper−lower)+lower`) — SURVEY.md:3211-3216 | domain units; ordering enforced nowhere — SURVEY.md:3206-3209 | holds | exact: joint scaling scales every drawn value by exactly s — SURVEY.md:3218-3222 |
| `gaussian@deviation.standard` + `@limit.lower` + `@limit.upper` | gain, atomic **triple**, s ≥ 0 | 0.0 each; the neutral *configuration* is all three at 0 — SURVEY.md:3280-3283 | limits are **rejection** bounds, not a support parameterisation — SURVEY.md:3275-3278 | holds | scaling the deviation alone changes the truncation ratio and desynchronizes the whole sequence — SURVEY.md:3259-3264 |
| `triangular@limit.*`/`@mode`/`@clip.*` | gain, atomic **five**, s ≥ 0 | 0.0 each — SURVEY.md:3317-3320 | domain units; clips are de-facto **required** — SURVEY.md:3374-3380 | holds | exact to 4e-15; never drop a clip attribute that scaled to 0 (absent clips render the whole distribution a silent no-op) |
| `brownianNoise@stepWidth.max` + `@limit.*` | gain, atomic **triple**, s ≥ 0 | 0.0 each; 0 stepWidth alone means "constant offset", not "no imprecision" — SURVEY.md:3417-3422 | ≥0 per step / reflecting walls — SURVEY.md:3414-3415 | holds | scaling the step alone raises the wall-rejection rate and desynchronizes |
| `compensatingTriangle@limit.*`/`@clip.*` | gain, atomic **four** (`@degreeOfCorrelation` fixed), s ≥ 0 | 0.0 each — SURVEY.md:3505-3506 | domain units; the clips also seed the first value — SURVEY.md:3536-3539 | holds | exact to 3e-15 with `doc` fixed |
| `list/measurement@value` | gain, whole list atomic | 0.0 — values returned verbatim — SURVEY.md:3578-3579 | verbatim values; no limits/clips/mode apply — SURVEY.md:3572-3576 | holds | PRNG-free ⇒ the ideal deterministic fixture family |
| ✔ RESOLVED-7 | — | — | — | — | scale anyway; exactness claimed for explicit-basis distributions only; re-indexing reported |

**✔ RESOLVED-7 — the timing domain re-indexes the random sequence when scaled.**
D-F rests on measured degree-1 homogeneity ("exact to 4e-15"), which the survey
confirms — *except* on one path. In the **timing** domain an absent
`milliseconds.timingBasis` is derived from exactly the attributes being scaled:
`upper−lower` (uniform / gaussian / brownianNoise), `clip.upper−clip.lower` (both
triangular kinds), `max−min` of the measurement list. Scaling them rescales the
sampling grid and re-indexes the whole sequence, so the rendered offsets are
**not** s× the originals (measured: ±20 → ±40 gave 4.04 → 8.09 at index 0 but
1.05 → −11.1 at index 1) (SURVEY.md:3185-3193, SURVEY.md:3674-3683).

**Decision (conductor, 2026-08-09, LOG.md): scale anyway, weaken the claim, flag
it.** D-F's exactness is narrowed to explicit-basis distributions; such
distributions are still scaled, since excluding them would silently drop the most
common shape of authored timing imprecision; and the report carries a
derived-basis re-indexing flag. `materializeTimingBasis` is recorded as a possible
future option, not v1 — it is a document edit beyond scaling.

**Panel amendment (A11):** the decision's closing claim that "R2 determinism is
untouched — a given (mpm, s) still yields the same bytes and, for a fixed seed,
the same render" is **half wrong, and the render half is cut**. The MPM-bytes
half stands. The render half is contradicted by the codebase: all render call
sites pass `shakePolyphonicPart = true` and pick the keeper with a bare
`Math.random()`, the facade's own types say seeding "is not a promise of
reproducible output", and the charter forbids byte-comparing imprecision output
(SURVEY.md:3728-3735). R2 in §2 now claims MPM determinism only, and mlign was
re-notified because their augmentation loop may have been designed around
per-sample render reproducibility.

*`s ≥ 0` is an API constraint, not a preference.* s<0 inverts every lower/upper
pair; s=0 is well-defined and means "remove all imprecision"
(SURVEY.md:3692-3697).

*Per-domain differences that justify the split.* **Timing** floors the result at 0.
**Duration (toneduration) has no floor at all**, so a scaled negative offset can
push `milliseconds.date.end` before `milliseconds.date` and the MIDI writer emits
the note-off there anyway — its cap is note-length dependent (MSM data, reported as
cliff risk). **Dynamics** offsets are unclamped in the map, bite only after the
dynamics pass has written `@velocity`, and are an R6(b) reporting dimension
(`{multiplicative: 0, additive: max|scaled width|}`).

*Validate on the document, never on rendered bytes.* All call sites shake
polyphonic parts with a bare `Math.random()`, so realized deviation for
simultaneous notes is 0.5–1.0× the scaled value — monotone in s but damped
(SURVEY.md:3728-3735).

*Pre-existing defect, out of scope (D-F).* A `@seed` on either correlated
distribution renders NaN for every affected note (SURVEY.md:3646-3657). Do not
build fixtures on seeded `distribution.correlated.*`.

### 7.14 `pedalShape`

New in v2 (A9). Same Bézier pair as §7.5, in `movementMap`.

| attribute | transform | neutral | domain + citation | P5r | notes |
|---|---|---|---|---|---|
| `movement@curvature` | boundary-power(low) | 0.0 — same cancellation proof as the dynamics twin — SURVEY.md:3900-3921 | [0,1] by monotonicity; **enforced nowhere in this family** — SURVEY.md:4044-4050 | holds | this family has **no clamps of its own**, which is precisely why the domain-closed transform is required (D-D); `x = 1` is a fixed point |
| `movement@protraction` | logit(−1,1) | 0.0 — branch condition *and* continuous limit — SURVEY.md:3945-3952 | [−1,1] by monotonicity; unenforced — SURVEY.md:3935-3943 | holds | the best-behaved attribute in the family: signed, symmetric, neutral at 0, notated dates untouched (R5-safe) |

*Musical reading.* These move the instant at which the pedal level crosses the
receiver's on/off point — half-pedalling and pedal-lift speed — without touching
any date. Out-of-range values do not throw; they push a Bézier control point
outside [0,1], the date component stops being monotone and the sampler emits
`<position>` events whose dates go backwards, which `GenericMap` then silently
reorders. The validation gate is load-bearing here.

*Inert cases the report must carry.* The **last map entry is never rendered** (a
movement is a transition *towards* the next one), a movement with no
`transition.to` renders as a degenerate three-event stack, and a flat segment
(`transition.to === position`) makes both parameters unobservable
(SURVEY.md:4058-4066). All three are `inert`.

*Corpus note.* Nothing in the pipeline generates a `movementMap` — they come only
from hand-authored or mpmify-generated MPM — so this dimension is exercised by a
narrow, externally-produced corpus. The reference fixture carries
`curvature="0.4" protraction="0.0"`.

### 7.15 v3 ornamentation block — ACTIVATES ON `ornamentation-v3` REBASE

> **Status: DORMANT.** Written against the ornamentation-v3 surface, **not** live
> on `main`. On rebase, activate these rows and retire the `main` rows they
> replace. Until then the v2 rows are authoritative.

| attribute | transform | neutral | replaces (v2) | notes |
|---|---|---|---|---|
| `frame.offset` (TemporalValue) | gain — signed offset | 0.0 | **replaces** `temporalSpread@frame.start` (§7.9) | O1: signed gain; keep paired with `frameLength` under the `ornamentSpread` factor |
| `frameLength` (TemporalValue) | gain, s ≥ 0 | 0.0 | **replaces** `temporalSpread@frameLength` (§7.9) | the v2 one-sided `Math.max(0,·)` rationale still applies |
| `intensity` | log-1 | 1.0 | **restates** `temporalSpread@intensity` (§7.10) | `ornamentSpacing`; epsilon floor dropped per A4 — the §1.2 gate covers it |
| `dynamicsGradient` endpoints | gain — no clamp, out-of-[−1,1] reported informationally | 0.0 | **replaces** the v2 rows in §7.11 | **orn-conductor CONFIRMED 2026-08-09**: v3 enforces [−1,1] nowhere, at parse or render, so the gain reading carries forward unchanged |
| `ornament@scale` | **EXCLUDED** | — | **replaces** the v2 row, also excluded (§7.16) | **orn-conductor CONFIRMED**; nuance: the v3 *writer* always serializes `@scale`, so the absent≙0 dead-lever case is v2/MEI-specific — the degree-1 s² argument (D-C) is what keeps it excluded in v3 |
| `repetitions`, pool attributes | EXCLUDED | — | (new in v3) | O1: they select *which* material is generated, not how large a deviation is |

The TemporalValue typing is the only structural change: `frame.offset` and
`frameLength` carry their unit with them instead of deferring to a sibling
`@time.unit` enum, which removes §7.9's "branch on the unit" hazard from the
applier. §8's sampling ranges still distinguish tick-domain from ms-domain
magnitudes.

### 7.16 Excluded

Every remaining numeric attribute the survey found, with the reason it carries no
`T` with `T(neutral) = 0`. "Read it" means the applier must consult it even though
it never writes it.

| attribute | why excluded | citation |
|---|---|---|
| `tempo@beatLength` | unit declaration, not a quantity: scaling it by k is indistinguishable from scaling bpm by 1/k. **Read it** — the center is computed on `bpm·beatLength·4` | SURVEY.md:183-188 |
| `tempoDef` descriptor table / `TempoData.exponent` | derived cache of `@meanTempoAt`, no XML representation; also a mutation trap | SURVEY.md:268-273 |
| `tempo@date.end` | transient MEI-conversion working attribute, never read by the renderer, stripped before the document is finished | SURVEY.md:283-295 |
| `performance@pulsesPerQuarter` | resolution declaration; changing it rescales the whole timeline. Note `new Mpm()` *adds* it when absent — a D-A baseline mutation | SURVEY.md:305-314 |
| `dynamics@subNoteDynamics` | boolean mode switch. **Read it** — it selects a different (harsher, CC-based) range regime for the same s | SURVEY.md:653-666 |
| `channelVolumeMap/volume@value` | render **output**, not an MPM input (R1) | SURVEY.md:785-798 |
| `rubato@frameLength`, `rubatoDef@frameLength` | no neutral exists — it cancels out of the identity case for every value, so P4 is undefined; it conflates displacement magnitude with wobble rate and, with `loop=false`, doubles as the span cutoff | SURVEY.md:1103-1122 |
| `rubato@loop` | boolean. **Read it** — it decides whether `frameLength` is a pure period or also a span boundary, and it is never inherited from the def | SURVEY.md:1162-1175 |
| `articulation(Def)@absoluteDuration` | D-B: a replacement, not a deviation — neutral is the attribute's **absence**, and its effective neutral lives in the MSM (R1). Drives the `partial` report state (§7.7) | SURVEY.md:1544-1560 |
| `articulation(Def)@absoluteDurationMs` | D-B: same category error; it also short-circuits the tick-duration branch and replaces the end date outright. This is the staccato-family lopsidedness lever | SURVEY.md:1615-1631 |
| `articulation(Def)@absoluteVelocity` | D-B: replacement, neutral = absent; the only meico default using it is sforzato = 127, already at the ceiling | SURVEY.md:1784-1798 |
| `articulation(Def)@detuneCents` | pitch attribute per §3/R5. Linear-0 in principle, but **inert** — written onto the MSM note and read by nothing. Revisit as its own `intonation` dimension on demand, never inside `articulation` | SURVEY.md:1824-1832, SURVEY.md:2044-2049 |
| `articulation(Def)@detuneHz` | pitch attribute per §3/R5, and weaker: Hz is not a perceptually linear pitch unit, so linear scaling exaggerates low notes far more than high ones | SURVEY.md:1855-1862 |
| `accentuation@value`, `@transition.from`, `@transition.to` | D-C: homogeneous degree 1 with `accentuationPattern@scale`, so scaling both is exactly s². Available only as a separate opt-in "reshape" knob, scaled atomically | SURVEY.md:2179-2188, SURVEY.md:2451-2455 |
| `accentuationPatternDef@length` | no neutral: a loop period and ramp-segment end; scaling it moves *when* accents land. Note the parser *adds* `length="4"` when absent — a D-A baseline mutation | SURVEY.md:2262-2273 |
| `accentuation@beat` | position, no neutral; editing it can reorder anchors and desynchronize the def from its own XML child order | SURVEY.md:2291-2299 |
| `accentuationPattern@loop`, `@stickToMeasures` | booleans. **Read them** — they decide the span and which beat number the pattern is evaluated at; their absent-defaults differ (false vs **true**) | SURVEY.md:2351-2386 |
| `ornament@scale` | RESOLVED-6: the degree-1 **partner** of the gradient endpoints, so scaling both applies s² (D-C admits one site per product); and a **dead lever** — absent≙0, hardcoded 0.0 by the MEI converter. **Read it** — a zero scale makes the whole gradient inert (§7.11). Never materialize it where absent | SURVEY.md:2733-2756, SURVEY.md:2937-2943 |
| `temporalSpread@time.unit` | enum. **Read it** — it decides the magnitude scale and which render pass consumes the value | SURVEY.md:2795-2813 |
| `temporalSpread@noteoff.shift` | enum. **Read it** — it decides which attribute absorbs the scaled offset, and flips the *sign* of the effect on note length | SURVEY.md:2826-2846 |
| `imprecisionMap.tuning@*` (all width attributes) | A9: the tuning domain is **write-only** in this codebase — nothing reads `tuning.offset`, so the whole domain is inert by construction. Reported present-but-inert rather than offered as a knob that provably cannot be heard | SURVEY.md:3722-3727 |
| `imprecisionMap.tuning@detuneUnit` | free string, never read by the renderer. Carry it through verbatim | SURVEY.md:3103-3112 |
| `distribution.*@seed` | selects *which* realisation is drawn, not how large it is; it is also the only thing making a render reproducible | SURVEY.md:3143-3154 |
| `distribution.*@milliseconds.timingBasis` | sampling grain, not a magnitude; 100.0 is a fallback, not a neutral. Excluded per D-F — but an absent one is derived from the scaled attributes, so scaling proceeds and the report flags the re-indexing (RESOLVED-7) | SURVEY.md:3178-3193 |
| `…compensatingTriangle@degreeOfCorrelation` | shape parameter with neutral 1.0: it changes the temporal smoothness of the noise, not the size of any deviation. If ever exposed, log-around-1 on (0,∞) with a hard guard rejecting ≤ 0 | SURVEY.md:3480-3491 |
| `movement@position`, `@transition.to` | D-G (unamended for these two): controller state, not a deviation. The sharper reason — canonical pedal maps are exact 0.0/1.0, where both log-around-geomean and logit have poles, so the transform is the **identity** on precisely the documents that dominate the corpus | SURVEY.md:3814-3837 |
| `@date` on `<tempo>`, `<dynamics>`, `<rubato>`, `<articulation>`, `<accentuationPattern>`, `<ornament>`, `<asynchrony>`, `<distribution.*>`, `<movement>`, and every `<style>` switch | R5: a timeline coordinate has no neutral. Mechanically it is also the map's cached sort key, and moving one date re-partitions its neighbours' spans | SURVEY.md:209-214, SURVEY.md:2318-2321, SURVEY.md:3053-3061 |
| `ornament.date.offset`, `ornament.duration`, `ornament.milliseconds.*`, `ornament.dynamics`, `ornament.noteoff.shift` | renderer intermediate **markers** written onto MSM notes, not MPM inputs (R1) | SURVEY.md:2995-3001 |
| `movementSampleMaxStep` | not an attribute — a `RenderOptions` field. Listed so it is never registered | SURVEY.md:4126-4130 |

## 8. Sampling ranges (R3)

Re-derived under the final rules (A13). These are **sampling guidance**; the API
rejects only what §1's admissible-s domains forbid. Where a bound is a judgement
call rather than a derivation, it says so. Two bounds are **per-document** and are
returned in `report.bounds` rather than baked in as constants.

| dimension | range | distribution | derived from |
|---|---|---|---|
| `tempo` | **0.5 … 2** | log-uniform | Re-derived in **global-scope** terms — the v1 range (0.25…4) was inherited from the prototype's *local* semantics, where the scaled quantity is the small log-ratio inside one transition, and was arithmetically wrong by ~a factor of 2 in the exponent. Under global scope the scaled quantity is a section's deviation from the center, routinely a factor 1.4–2.2. For a document whose largest level deviation from the center is a factor r, the s keeping every level inside a musical window [lo,hi] is **s ≤ min(ln(hi/c), ln(c/lo)) / ln r**; on the built-in ladder (r ≈ 2.2, window [10,400]) that is s ≈ 1.8. Verified failure of the old bound: on `tempo.mpm` (120/80/160, center ≈ 115) s = 4 renders 26.7 and 427 bpm. The per-document bound is reported as `bounds.tempoMaxS` |
| `tempoShape` | 0.5 … 2 | log-uniform | The logit saturates to exactly 1.0 — deleting the transition — at s ≈ 8 for an authored 0.99, s ≈ 16.75 for 0.9. The ε output clamp (§7.3) makes larger s safe but inert, so the useful range ends well below it; 2 is the point at which a 0.25 mean-position reaches 0.1, already an extreme back-loading |
| `dynamics` | 0.5 … 1.75 | log-uniform | Under §7.1's population (each site once, `transition.to` excluded) a p(48)…f(97) map centers at √(48·97) ≈ 68 and reaches the 127 ceiling at **s ≈ 1.76** — so the clamp, and the `mergedLevels` risk, begin just above the range. The v1 figure of 1.8 was quoted for a population the v1 rule never produced (it gave ≈ 90 and a clamp at s ≈ 1.64); the algorithm and the arithmetic now agree |
| `dynamicsShape` | 0.5 … 2 | log-uniform | Range-safe by construction (pure time reparameterization), so the bound is perceptual, not mechanical: at s = 2 an authored curvature 0.3 becomes 0.51, a pronounced late bloom; beyond that the swell reads as a step. Its own row now, so asking for this no longer requires asking for louder dynamics |
| `rubato` | 0.5 … 2.5 | log-uniform | Intensity: the prototype's clamp [0.1, 5.0] is reached from a typical authored 0.5…2.0 at s ≈ 2.3. Window: the joint trim saturates smoothly, but only because of the A6 guard — the per-document cliff bound (the s at which `t'` would reach `1 − minRubatoWindow`) is restored and returned as `bounds.rubatoMaxS` |
| `articulation` | 0.5 … 2 | log-uniform | Ratios: meico's defaults sit at 0.7…1.0; s = 2 takes 0.8 → 0.64 and 0.7 → 0.49, i.e. half the note gone. Offsets: breath −400 ms doubles to −800 ms at s = 2, where the pass-two commit cliff starts discarding whole notes. A cliff-avoidance bound, not a taste bound — and P5r `non-monotone` on the velocity pair means s is not a reliable dial there at all |
| `accentuation` | 0 … 2.5 | uniform | s<0 flips the accent contour (inversion, not exaggeration). Fixture patterns carry ±20 velocity units at scale 1; ×2.5 = ±50, which on an mf (83) is the last step before the ceiling and the global `fitVelocities` compression. s=0 is meaningful ("flatten the metre") but must be written as `"0"`, never by deleting the mandatory attribute |
| `ornamentSpread` | 0 … 4 | uniform | The built-in arpeggio frame is (−22, +44) ticks ≈ 37 ms at 100 bpm / PPQ 720; ×4 ≈ 147 ms, a slow but idiomatic roll. The real cap is note-length dependent (§7.9's cliff) and is reported rather than baked in. In the **milliseconds** frame domain the same s is absolute rather than tempo-relative — halve it, or sample against the value |
| `ornamentSpacing` | 0.5 … 2 | log-uniform | The fixture's authored intensity is already 2.0; s = 2 gives 4.0, at which the whole ornament piles onto its end. Separated from the frame precisely because these two bounds and distributions differ |
| `ornamentDynamics` | 0 … 3 | uniform | Endpoints are velocity units added to velocity; the arpeggio default ±1 times a typical `@scale` of 1 is ±1 velocity unit, so even s = 3 is subtle — the range is wide because the quantity is small. **Usually inert**: `@scale` is 0.0 on every MEI arpeggio, and the report says so per §7.11 |
| `asynchrony` | 0 … 3 | uniform | Authored offsets are ±5…±60 ms; past ≈±150 ms the part stops reading as "ahead of/behind the beat" and becomes an echo. For a document whose largest \|offset\| is m ms, prefer s ≤ 150/m; 3 holds for the typical 50 ms authoring maximum |
| `imprecisionTiming` | 0 … 3 | uniform | Typical widths 3–15 ms; ×3 is the edge of "human but sloppy". Realized deviation in dense polyphony is damped to 0.5–1.0× by the unseeded shake, so the audible range is narrower than the documented one |
| `imprecisionDynamics` | 0 … 3 | uniform | Typical widths 2–8 velocity units; ×3 ≈ ±24, which against a mf is audible unevenness without inverting the dynamic contour. Own row because velocity units and ms are incommensurable |
| `imprecisionDuration` | 0 … 2 | uniform | Lower than its siblings for a mechanical reason: the toneduration domain has **no floor**, so a scaled negative offset can push a note's end before its start and the MIDI writer emits it anyway. The safe cap is note-length dependent and reported as cliff risk |
| `pedalShape` | 0.5 … 2 | log-uniform | Same space as `dynamicsShape` and the same perceptual argument; additionally quantized by the sampler (`movementSampleMaxStep` default 0.1 ⇒ ~17 events for a 0→1 ramp), so sub-sample reshaping is invisible and s beyond 2 buys nothing audible |
| `spotlight` attenuation | **(0, 1]** | uniform | D-I's single scalar. 1 is identity (no attenuation); the prototype used 0.1; 0.5 halves every gesture in log space and still leaves the background legible. **0 is excluded by the option's domain**, not by a per-dimension rule: under `gesture` scope it would collapse a transition pair onto its geomean and trip the renderer's exact-float constant test, deleting the gesture. The pair-collapse guard (D-I) catches the same hazard for small-but-nonzero attenuation |

*Weights, not ranges, differentiate dimensions in a preset.* D-H's
`weightedFactors(s, weights)` implements `sᵈ = 1 + wᵈ(s−1)`, so a preset expresses
"rubato is perceptually violent, damp it" as `w = 0.2` rather than as a narrower
range. The ranges above are for **direct** sampling of the factors record (R3).

*Two bounds are computed per document, not sampled blind* — `bounds.tempoMaxS` and
`bounds.rubatoMaxS`, plus the note-length-dependent cliff risks for
`ornamentSpread` and `imprecisionDuration`, which require `options.msm` to quantify
and are otherwise flagged qualitatively. A sample exceeding a document-specific
bound is reported, not silently produced.

## 9. Panel findings disposition

All four lenses returned SOUND-WITH-FIXES. Every finding is listed with its
disposition and the adjudication item that carries it. Only two were rejected.

| finding (REVIEW-FINDINGS.md) | disposition | A-item |
|---|---|---|
| Tier 2 unreachable for every MPM (xmlns re-emission) | adopted — Tier 2 deleted | A2 |
| "self-mutating def" predicate wrong (present values rewritten) | adopted — predicate moot once Tier 2 is gone; the rewrite joins D-A's baseline list | A1, A2 |
| D-A's "never itself instantiates" is decorative (constructor runs them) | adopted — full-raw `Builder`, clause deleted | A1 |
| `GenericMap.sortXml()` mutates child order and whitespace | adopted — baseline list + date-stable internal view | A1 |
| Style scope is positional `findStyleSwitchAt`, not date-based | adopted — D-A replicates it; `getStyleAt` banned | A1 |
| Center population under-determined in three ways | adopted — explicit algorithm in §7.1 | A5 |
| Numeric classifier must be def-lookup-first then `parseFloat` | adopted — specified verbatim in D-A | A1 |
| `Element.query` is O(subtree) per call | adopted — banned on per-instruction paths | A1 |
| Six further parse-time mutations | adopted — D-A's baseline list | A1 |
| §7.1 global-map aliasing hazard does not exist under D-A | adopted — *Aliasing* note rewritten | A1 |
| Three report obligations need MSM data R1 forbids | adopted — optional `msm?` carve-out, fields null without it | A10 |
| R6(b) undefined for articulation, omits imprecision | adopted — coefficients `{multiplicative, additive}`, imprecisionDynamics added | A10 |
| Spotlight scope specified three ways, both answers broken | adopted — new `gesture` scope | A7 |
| `ExaggerationReport` is a comment, not a type | adopted — full types in §4 | A10 |
| No site-identity vocabulary | adopted — `SiteRef` | A10 |
| `absent` used for present-but-unreachable | adopted — glossary; those rows now say `inert` | A10 |
| CAMPAIGN invariant 6 / P1 byte-identity false at the facade | adopted — P1 recontracted; the CAMPAIGN.md amendment is the conductor's | A2 |
| RESOLVED-7's seeded-render claim is false | adopted — clause cut from R2, mlign re-notified | A11 |
| D-I error semantics contradict the survey verdict | adopted — three cases + `SelectionNotFoundError` | A8 |
| One `attenuation` scalar cannot satisfy the split validity rule | adopted — attenuation ∈ (0,1] + pair-collapse guard | A8 |
| §8's "s ≤ 0 where a log space needs positivity" is false | adopted — per-scale-space s-domains in the registry | A3 |
| Three unnamed constants (min note length, ε, [1,127]) | adopted — `velocityRange` option; min-note-length demoted to report-only; ε dropped | A4, A11 |
| Unknown factor keys silently identity | adopted — `InvalidOptionError` + `EXPRESSION_DIMENSIONS` | A11 |
| Center double-counts defs, occurrence-weighted | adopted — §7.1 population | A5 |
| `center.tempo` has no stated unit | adopted — quarter-note bpm, stated in §1.3 and §7.1 | A5 |
| Report numbers can be NaN | adopted — every numeric field finite or null | A10 |
| Result type omits applied factors / performance / write count | adopted — §4 report; `SpotlightResult` gains `spared`/`resolvedIds` | A10, A11 |
| Spotlight is a no-op on the dominant corpus under local scope | adopted — `gesture` scope; level dims reported inert | A7 |
| §8 tempo range arithmetically inconsistent | adopted — 0.5…2 + per-document bound formula | A13 |
| RESOLVED-6's rationale refuted by its own §8 row | adopted — rationale corrected; inertness is a report state | A9 |
| Centre contaminated by transition targets and duplicates | **adapted** — `transition.to` excluded from the population and defs counted once; **span-weighting REJECTED**: it needs an arbitrary rule for the final instruction's span, the same objection that rules out duration-weighting, and callers wanting another centre pass `options.center` | A5 |
| `local` scope has no legal write site on named levels | adopted — `local` retired in favour of `gesture` | A7 |
| §3 merges level contrast with curve shape | adopted — `tempoShape`, `dynamicsShape` split out | A9 |
| `ornamentTiming` needs two ranges in two spaces | adopted — `ornamentSpread` / `ornamentSpacing` | A9 |
| `imprecision` fuses four incommensurable domains | adopted — three per-domain dimensions; tuning excluded as inert | A9 |
| `movement@curvature`/`@protraction` wrongly excluded | adopted — new `pedalShape`; D-G amended for the shape pair only | A9 |
| D-B makes articulation lopsided on the staccato family | adopted — `partial` report state + component reachability | A10 |
| D-I never states the type→dimension mapping | adopted — mapping table is part of D-I | A8 |
| Clamp can merge distinct named levels | adopted — `mergedLevels` report field | A10 |
| R6(a) clamp destroys center invariance | adopted — P2 stated conditionally; centers reported and re-acceptable | A3 |
| No input-domain validation gate | adopted — §1.2, a §1-level contract | A4 |
| Center includes values at skipped sites | adopted — skip set computed first (§7.1) | A5 |
| Joint trim saturates to 1.0 in IEEE-754 | adopted — `minRubatoWindow` guard + pre-write assertion | A6 |
| Skipping a partial override does not prevent crossing | adopted — effective windows resolved first; def excluded and the element named | A6 |
| s < 0 escapes the domain on boundary-power rows | adopted — per-scale-space s-domains | A3 |
| P1 false without an explicit s === 1 short-circuit | adopted — dimension-level short-circuit + both test predicates | A2 |
| P5 names two different properties | **adapted** — P5a/P5r split with a per-row verdict column; **the net-deviation articulation transform REJECTED**: it needs the note's incoming velocity, which is MSM data and therefore forbidden by R1 | A12 |
| P2 exact only to ~1 ULP | adopted — stated numerically with an epsilon, tested on parsed numbers | A3 |
| Center double-counts defs against references | adopted — one entry per def element (§7.1) | A5 |
| meanTempoAt drops the mandatory epsilon guard | adopted — ε restored as a reported output clamp | A3 |
| P1–P5 cannot validate any registry choice | adopted — stated in §1.1; per-row metric justifications; per-row render tests added to W3 | A14 |
