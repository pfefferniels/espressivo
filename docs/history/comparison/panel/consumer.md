# W1 Panel — Consumer / Musicology Lens

Lens: does the design actually answer the questions its intended users bring to
it? Attacks are workflow-grounded: for each finding, a named consumer
(mpmify, mpm-desk, mlign, historical-performance researcher), the concrete task
they sit down to do, and the point at which the design as written stops serving
them.

Severity: **CAPITAL** = a charter requirement U1–U4 is not actually delivered, or
a primary consumer cannot use the module for its stated purpose. **MAJOR** = a
realistic core workflow needs awkward contortions, or an output is misleading to
its audience. **MINOR** = friction, missing convenience, documentation debt.

Two findings (C6, C7) are backed by measurements taken on the real corpora during
this review; the commands and numbers are quoted inline so the conductor can
re-run them.

Read: DESIGN.md (full), CAMPAIGN.md, SURVEY.md, survey-lit-welte.md,
survey-code.md §6/§6.4, survey-algo.md §2.D–2.E, notes-conductor.md.

---

## C1 — CAPITAL — The deviation profile, the design's own "central object", is never exported

**User / workflow.** mpm-desk: an interpretation-analysis GUI for Welte rolls that
"will visualize comparisons". Its core screen is not a dendrogram — it is the
piece on the x-axis with the two performances' disagreement drawn over it, and a
detail view where the user zooms to a passage and sees *the two tempo curves
overlaid*. Also the historical researcher, who publishes exactly this figure
(Gottschewski's whole *Zeitgestaltung* method is graphed time-course analysis;
survey-lit-welte §6 cites "Graphic Analysis of Recorded Interpretations" by name).

**What fails.** §1.1 declares `p_k(t)` "the central object … Everything the module
reports is derived from these densities". §9's `ComparisonResult.report` then
lists `window`, `ppq`, `parts`, `dimensions`, `aggregate`, `segments`, `table`,
`decomposition`, `cumulativeDrift`, `notes`, `epsilon`. The densities are not
there. Neither are the two evaluated curves `g_A`, `g_B` that produced them.
The module computes both sides' curves on an exact common-refinement grid
(§5.0), integrates them, and then throws away everything except the integrals
and the segment boxes.

The consequence is not cosmetic. mpm-desk can draw a summary strip (segment
ranges from `segments`, per-dimension mass from `table`) but cannot draw the
profile inside a segment, cannot draw the two curves, and cannot render any
figure at finer resolution than "ranked segment". To get those it must
re-implement curve evaluation against the renderer's map classes — which means
re-deriving tempo power transitions, Bézier dynamics, the rubato warp and the
style resolution, and doing so with the renderer's dishonest 100.0 default
instead of the module's honest `styleScope` exclusion (R8). survey-code §6.4
holds this up as the module's structural advantage over mpmify ("mpmify had to
reimplement meico's curve math in Python … a TS comparison module gets the real
implementation for free — a genuine advantage to preserve"). Not exporting the
profile gives the advantage straight back.

notes-conductor N6's ruling ("Clustering/embedding output is DATA; drawing is
the consumer's job") is right and this finding does not contest it. The
complaint is the opposite: the *data* needed to draw is the one data product
missing. N4 already frames U3 as "the segments of the density profile ranked by
mass" — the profile is in the conductor's own mental model; it just never
reached §9.

**Repair (smallest).** Add an opt-in profile export to `CompareMpmOptions` and
`ComparisonResult`:

```ts
readonly profile?: {                     // omit ⇒ null in the result
  readonly dimensions?: readonly ComparisonDimension[];  // default: all
  readonly grid?: 'refinement' | { readonly step: number };  // quarters
} | null;
// →
readonly profiles: Record<ComparisonDimension, {
  readonly dates: readonly number[];        // quarters, left edges
  readonly density: readonly number[];      // p_k, JND per quarter
  readonly signed: readonly number[];       // see C2
  readonly valueA: readonly number[] | null;  // T-space curve, null for
  readonly valueB: readonly number[] | null;  //   event/distribution dims
  readonly space: string; readonly unit: string;
}> | null;
```

The refinement grid is already built and both curves are already evaluated on
it; this is a retention decision, not new mathematics. Gate it behind the option
so the default report stays small and the corpus product (N² pairs) never
materializes N² profiles. Cap `{ step }` grids the way §8 caps scape bins.

---

## C2 — CAPITAL — Every reported quantity is |Δ|; a researcher cannot ask who is slower, only that they differ

**User / workflow.** The historical-performance researcher's sentences are
directional, always. "Hofmann stretches the approach to the reprise where Lamond
drives through it." "The Welte transfer runs ~12% longer than the disc" (Flury,
via Hagmann — survey-lit-welte §3). Hall's central question is *directional
attribution*: "an eccentric old-fashioned interpretation at the correct speed, or
a conventional approach at the wrong one?" (PJ 22). Also mpmify: "did inference
over- or under-shoot the truth's rubato?" is a debugging question, and the sign
is the answer.

**What fails.** §1.1 defines `p_k(t) ≥ 0`; §5.1–5.9 define every density as
`|g_A − g_B| / jnd`. §7.3's segments rank the thresholded density; §9's
`segments` and `table` carry mass. §8's `profiles` give "per-dimension distance
to the corpus medoid" — a magnitude again. The sign is computed and discarded at
every level.

The one exception is §1.2's `d_level = (ℓ_A − ℓ_B)`, which is signed and gives
the global direction per dimension. That is real but it is a single scalar per
dimension for the whole window: it answers "is one globally faster" and cannot
answer "**where** is one faster", which is the question U3 is about. A
performance that is slower in the first half and faster in the second reports
`level ≈ 0` and large segments, and the report cannot distinguish that from
"they disagree in magnitude but agree in direction everywhere".

**Repair (smallest).** The engine already forms `g_A − g_B` before taking `|·|`.
Retain its integral alongside the absolute one, as a *descriptor* — it never
enters `d_k`, `D`, the table or any matrix, so R3/R4 are untouched:

- every segment gains `meanSigned` (∫(g_A−g_B)·w over the segment ÷ its length,
  in the row's T-space unit) and `direction: 'a-greater' | 'b-greater' | 'mixed'`
  (mixed when the signed integral's magnitude is below some documented fraction
  of the absolute one — say 0.5 — i.e. the segment changes sign inside itself);
- every `DimensionComparison` gains `meanSigned` over the window;
- the profile export (C1) carries the signed series;
- `CorpusResult.profiles` gains the signed per-dimension deviation from the
  medoid, so "who is extreme in what, and in which direction" is answerable.

Document once, prominently, that signed descriptors are not distances and do not
satisfy the triangle inequality — the same labelling discipline §1.2 already
applies to the decomposition.

---

## C3 — MAJOR — Everything is dated in quarters; no consumer can find the passage in the score

**User / workflow.** A musicologist reads "the largest deviation is segment 1"
and immediately asks "where is that in the score?" They think in bars and beats.
mpm-desk labels its x-axis in bars. Every figure in the Welte literature is
captioned with bar numbers (Howat's Cathédrale engloutie metre argument, Bärtsch's
op. 15/2 comparison, Köpp's Debussy analyses — all bar-indexed).

**What fails.** §5.0 normalizes dates to lcm ticks and reports "in quarters".
§9's `segments`, the ops' `dateA`/`dateB`, `excludedSpans` and `window` are all
in quarters, and nothing else. R7 enumerates what an optional MSM buys —
note-density weighting, note-anchored articulation resolution, estimate
refinements — and measure mapping is not on the list, even though the MSM is the
one input that carries it. (Verified: `src/msm/Msm.ts` builds and reads a
`timeSignatureMap` — lines 280, 487, 1162–1175, 1520–1530 — so bar numbers are a
prefix-sum away whenever `msm` is supplied.)

So every consumer post-processes the report to make it legible, each
reimplementing pickup-bar handling and mid-piece metre changes, inconsistently.
A report that every consumer must post-process to be readable by its intended
audience is a design gap, not a consumer inconvenience.

**Repair (smallest).** Extend R7's MSM-optional list with measure mapping, and
follow the three-state rule already specified there (value / null "this MSM
cannot answer" / not requested):

- `report.measures: readonly { number, startQuarters, timeSignature: {numerator,
  denominator} }[] | null` — one entry per bar, derived from the MSM's
  `timeSignatureMap`, `null` without an MSM;
- every dated item (`segments`, `excludedSpans`, `window`, and `DiffResult`
  ops) gains `measureA`/`measure` as `{ number, beat } | null`.

Quarters remain the canonical axis and the only thing the math uses; measures are
a presentation annotation. This is one prefix-sum over an input the design
already accepts.

---

## C4 — MAJOR — U3 asks for "complexity/difficulty"; the design ships mass, and does not let the user re-rank

**User / workflow.** "Show me the most striking differences" is the first thing
anyone does with a comparison. Two candidate answers: the *biggest moment* (a
two-bar passage where the performances are 6 JND apart — a jarring, citable
difference) and the *biggest region* (forty bars at 1.2 JND — a sustained,
barely-perceptible drift). These are different musical findings and different
users want them ranked differently.

**What fails.** §7.3: Ruzzo–Tompa segments "ranked by integral mass". Mass is
`length × mean excess`, so the forty-bar drift outranks the two-bar shock,
always. The charter's word (U3) is "complexity/difficulty/distance" — mass is a
defensible reading of "distance" and an indefensible reading of "difficulty".

Worse, the user cannot re-rank. §9 specifies `segments` only as "(ranked, +
remainder row)" — the per-segment shape is undefined. Length is presumably
derivable from the segment's bounds and per-dimension mass from `table`, so
mean is recoverable; **peak is not recoverable from any shipped product**, and
peak is precisely the statistic the "biggest moment" reading needs. With the
profile also unexported (C1), there is no path to it at all.

**Repair (smallest).** Specify the segment shape in §9 and carry the three
statistics, so ranking becomes the caller's choice rather than the module's
opinion:

```ts
segments: readonly {
  readonly startQuarters: number; readonly endQuarters: number;
  readonly measure: { start, end } | null;          // C3
  readonly mass: number;        // JND·quarters — the current ranking key
  readonly peak: number;        // max weighted density in the segment, JND
  readonly mean: number;        // mass / length, JND
  readonly meanSigned: number;  // C2
  readonly peakAtQuarters: number;                  // where the peak is
  readonly byDimension: Record<ComparisonDimension, number>;  // = the table column
  readonly dominantDimension: ComparisonDimension;
}[];
```

Keep mass as the documented default order (it is the one that makes the table's
column sums monotone) and state in the docs that `peak` / `mean` are provided
for re-ranking, with one sentence on what each reading means musically. No
`segmentRanking` option is needed — shipping the fields is cheaper than shipping
a knob, and a caller sorting an array needs no API.

---

## C5 — MAJOR — U2 asks for an edit *path*; the design ships a cost-ranked *list*

**User / workflow.** mpm-desk's "morph A into B" review flow (notes-conductor
N9), and the encoding-forensics user asking "what did the editor do to this
roll?". Both read the script front to back with the score open.

**What fails.** §6.1 ships the ops "sorted by `cost` descending (U2/U3)". That
single sort serves U3 (what matters most) and silently drops U2's own word:
a *path* is ordered by where you walk it, and a reader following along in the
score walks it in score order. Cost-descending order scatters bar 3, bar 47,
bar 12, bar 9 down the page. Combined with C3 (dates in quarters only), the
script as specified is a list of numbers a user must sort and translate before
it says anything.

The design is aware the script is a *reading* artifact rather than an executable
one — §6.1 explicitly does not ship `applyEditScript` — which makes legibility
the whole point of the product, not a secondary concern.

**Repair (smallest).** Cost order and score order are the same array with two
sort keys. Give each op both, and let §9 state which array the report exposes:

- each op gains `costRank: number` (0-based, its position in the
  cost-descending order) and the array is delivered in **date order**
  (`dateB ?? dateA`, then the §6.4 traceback precedence for ties);
- the per-(part, map) script gains `topByCost: readonly number[]` — indices into
  the date-ordered array, in cost-descending order.

Both views cost one integer per op, neither requires recomputation, and the
"real edit path" reads as a path.

---

## C6 — MAJOR — No plausibility channel: the brief's own flagship roll produces a confident, meaningless number

**User / workflow.** The Welte researcher's first real run: compare
`Hofmann (1927).mpm` — the Josef Hofmann roll, named in the brief as the
historical case — against another roll transcription in the same corpus
(`lamond.mpm`, Frederic Lamond, also a Welte artist).

**What fails, measured.** `beatLength` in MPM is a whole-note fraction; the
renderer's own arithmetic confirms it (`src/mpm/elements/maps/TempoMap.ts:373`,
`15000·(date−start)/(bpm·beatLength·ppq)` — a quarter at 60 qbpm with
`beatLength=0.25`, `ppq=720` gives exactly 1000 ms), and §5.1's
`qbpm = bpm · beatLength · 4` encodes the same convention. Measured over the 121
`.mpm` files in `/Users/nielspfeffer/Downloads/Daten`:

| beatLength convention | files |
|---|---|
| spec fraction (≤ 1) | 109 |
| **tick-valued (> 1)** | **3** — both `Hofmann (1927).mpm` copies + `unknown performance(82).mpm` |
| no `beatLength` | 9 |

`Hofmann (1927).mpm` carries `bpm='21' beatLength='2160'` (and one `4320`) at
`ppq='720'` — i.e. beat lengths written in *ticks* (2160 ticks = 3 quarters =
0.75 whole notes). Under the spec convention those resolve to
`qbpm = 21·2160·4 ≈ 181,000` up to `35·4320·4 ≈ 605,000`. `lamond.mpm` is
well-formed (`beatLength="0.5"`, bpm 18.6–24.4 → 37–49 qbpm).

So `compareMpm({a: hofmann, b: lamond})` computes
`|ln(181000) − ln(37)| ≈ 8.5` nepers ÷ `jnd_tempo ≈ 0.049` ≈ **170 JND, sustained
across the entire window**. The report returns a large, exact, confidently
decomposed number; §7.3's segmentation returns one segment covering the piece;
the aggregate is swamped. Nothing in the report says the word "suspicious". The
true finding — "these two files disagree about what `beatLength` means" — is
invisible, and the user's plausible reaction is to believe the tool.

The design has channels for *encoding* pathologies (R8 unresolvable levels, R9b
inert rows, A-B2 renderer skips) and for degraded estimates (R7). It has no
channel for a well-formed instruction whose **resolved value is musically
impossible**, and §9's `notes` kinds — structural finding, exclusion, inert
difference, renderer skip, estimate degradation — contain no such kind. This is
the gap between "the file parses" and "the file means something".

**Repair (smallest).** Add a `plausibility` note kind and a documented per-space
plausible range on the comparison registry (`plausibleRange: [lo, hi] | null`),
checked once per document on the *resolved* curve, never on the difference:

- tempo `qbpm ∈ [10, 400]`, dynamics/velocity `∈ [0, 127]`, pedal position
  `∈ [0, 1]`, asynchrony `|offset| ≤ 1000 ms` — all [convention], all overridable
  exactly like `jnd`;
- a violation emits `{ kind: 'plausibility', document: 'a' | 'b', dimension,
  date, resolvedValue, range, hint }` where `hint` names the likely cause
  ("`beatLength` > 1 suggests tick-valued beat lengths; the format expects a
  whole-note fraction");
- **the distance is not altered** — no clamping, no exclusion. R3 and the
  metric are untouched; this is a per-document descriptor, so it is not
  pair-dependent.

Cost is one range check per instruction. The payoff is that the design's
flagship musicological workflow stops silently lying on the corpus the
musicological story is built on.

---

## C7 — MAJOR — Nothing checks that the two documents are performances of the same piece

**User / workflow.** Anyone with a corpus folder. The `Daten` corpus is 121 MPM
files in one directory named by performer and by export index
(`Hofmann (1927)`, `lamond`, `export(1..18)`, `unknown performance(N)`) — and,
measured here, they are *not* all the same piece: file sizes run 560 B to 27.9 KB
and `lamond.mpm` ends at date 19440 while others differ by orders of magnitude.
The natural first action is to glob the folder into `compareMpmCorpus`.

**What fails.** §1 states the precondition — two documents "encode
interpretations of the same piece over a shared symbolic timeline" — and nothing
downstream ever tests it. §5.0's window rule takes `end` = max over both
documents of the last dated instruction, which *silently absorbs* a length
mismatch: comparing a 30-bar piece against a 200-bar piece gives a window of 200
bars in which one document is compared against its own neutral for 85% of the
timeline (R6, correctly), producing a large distance that reads as "very
different interpretations" rather than "different pieces". §9's `parts` reports
pairings and unmatched parts, but part numbers match trivially across unrelated
pieces. The corpus product then clusters the folder by *piece* while its labels
and documentation say *interpretation*.

**Repair (smallest).** No new precondition and no new error — the module cannot
know the piece, and refusing to compare would be worse. Ship the evidence and
one heuristic note:

- `report.comparability: { lastDateA, lastDateB, lengthRatio, ppqA, ppqB,
  partCountA, partCountB, partNumbersMatched, instructionCountA,
  instructionCountB }`;
- a `structural` note of kind `'length-mismatch'` when
  `lengthRatio` falls outside a documented band (say `[0.8, 1.25]`), worded as a
  question — "the documents' dated extents differ by 3.4×; are these the same
  piece?" — not as an error;
- when `msm` is supplied, the same check against the score end, which is the
  authoritative answer.

For `compareMpmCorpus`, surface the same note per pair and add
`report.suspectPairs` so a 121-file glob shows the user their folder is
heterogeneous before they read a dendrogram of it.

---

## C8 — MAJOR — mpmify's null-baseline normalization works only via an undocumented trick, and the obvious route gives a wrong denominator

**User / workflow.** mpmify evaluates inferred-vs-truth. Every metric in
`ml/python/evaluate.py` is reported against `constant_baseline(rec)` — "a single
constant tempo that maps total beats to total performed seconds" (survey-code
§6.4). The question the ratio answers is the one that matters to them: *how much
of the truth's expression did inference actually capture?* Concretely they want
`d(inferred, truth) / d(neutral, truth)`.

**What fails.** The numerator is `compareMpm`. The denominator needs a neutral
reference document, and the design never mentions one. R6 gives the semantics
("absence is neutral, not missing"), so a map-less MPM *is* the neutral
reference — and I verified it parses and round-trips: a four-line
`<mpm><performance name='neutral' pulsesPerQuarter='720'><global><header/>
<dated/></global></performance></mpm>` passes `canonicalMpm` cleanly (as does a
performance with no `<global>` at all, and an `<mpm>` with **no performance**,
which §9's error list does not cover — it specifies `InvalidOptionError` for
*more than one* performance without a selector and says nothing about zero).

So the capability exists but is reachable only by a user who infers it from R6.
Worse, the obvious attempt is **misleading**: under the default
`invariance: 'none'`, comparing against a map-less document measures the truth's
distance from the renderer's default constant **100 qbpm** (§5.1). If the truth
sits at 60 qbpm, the denominator is dominated by `|ln(100/60)| ≈ 0.51` nepers
of pure level offset — an arbitrary constant with no relation to expression —
and the ratio silently understates how much expression inference captured. The
*correct* recipe is `invariance: { tempo: 'level', dynamics: 'level', … }`, under
which the neutral curve centers to zero and the distance becomes
`∫|g_truth − mean(g_truth)|` — exactly mpmify's constant-tempo null baseline in
L1 form, and independent of which constant the neutral document happens to name.
That equivalence is a genuinely elegant result of this design, and it is
currently written down nowhere.

**Repair (smallest).** Two lines of API and a cookbook entry:

- export `NEUTRAL_MPM: XmlText` (or `neutralMpm(options?: { ppq?: number })`) —
  the documented empty performance, so nobody hand-rolls it;
- a README/cookbook recipe "distance against the null baseline" that states the
  ratio, **requires** `invariance: 'level'` for the log-space dimensions, and
  explains in one sentence why `'none'` measures the wrong thing here;
- while in §9's error list: specify the zero-performance case (it should be
  `PerformanceNotFoundError` or `InvalidOptionError`, not an interior crash) —
  users building neutral documents by hand will hit it.

Optionally, later: a `baseline: 'neutral'` flag that returns `d_k` against
neutral in the same call, so the ratio needs one invocation rather than two. Not
required — the recipe is enough.

---

## C9 — MAJOR — `invariance: 'level'` removes the roll-speed factor only in log spaces; §7.4 advertises it generally

**User / workflow.** The Welte researcher follows §7.4, which is written for
them: roll speed is structurally unknowable (Hall PJ 22; Hagmann 1984), so they
set `invariance: 'level'` and compare two rolls.

**What fails.** §7.4's justification is exactly right for log-space dimensions:
an unknown speed factor `c` multiplies tempo, adds `ln c` in log space, and
per-document centering removes it exactly. Tempo and dynamics are safe.

But the same physical uncertainty acts **multiplicatively on the ms-valued
dimensions too** — a roll read 10% slower has all its inter-onset offsets
stretched 10% — and those dimensions live in linear/gain spaces (§3: asynchrony
"gain, ms"; `imprecisionTiming` "native ms"; §5.5's `absoluteDelayMs` /
`absoluteDurationChangeMs`). In a linear space, centering subtracts a mean:
`c·x − mean(c·x) = c(x − mean x)`. The factor **survives**. Only `'level-gain'`
removes it there — and that also normalizes away real magnitude, which is a
genuine analytical cost the researcher should be choosing knowingly.

So a researcher who applies §7.4's stated recipe to a roll pair gets a
speed-invariant tempo comparison and a still-contaminated asynchrony and
imprecision-timing comparison, with the report stamping `invariance: 'level'` on
all of them as though they were equivalent. Given that asynchrony-as-artifact
(Hagmann's "künstliches Arpeggio") is one of the three questions
survey-lit-welte flags as design-shaping, this is the wrong dimension to get
quietly wrong.

**Repair (smallest).** Documentation plus one note; the capability is already
there (`invariance` is per-dimension).

- §7.4 gains a table stating what each mode removes **per scale space**:
  log spaces — `'level'` removes a multiplicative factor, `'level-gain'` also
  removes a dilation of the gesture; linear/gain spaces — `'level'` removes an
  additive offset only, `'level-gain'` is required for a multiplicative one;
- the report emits a note when `'level'` is applied to a linear-space dimension,
  in the plain words "this removed an offset, not a scale factor";
- the Welte cookbook recipe (§11's W4 item) spells out the roll-pair setting:
  `'level'` on tempo/dynamics, and either `'level-gain'` or weight 0 on the
  ms-valued dimensions, with the trade-off named.

---

## C10 — MAJOR — The headline number is in units no reader can interpret, and it grows with the piece

**User / workflow.** Anyone quoting a result. "How different are these two
performances?" → one number, in a paper, a GUI header, a QA threshold.

**What fails.** §1.1/§7.2 make `D = Σ ω_k d_k` the headline, in **JND·quarters**.
Two problems, both consumer-facing.

First, nobody can interpret "148.3 JND·quarters". A JND is a perceptual unit and
a quarter is a time unit; their product is an integrated perceptual excess with
no everyday referent. The design does compute the legible quantity —
§9's `aggregate.mean` (JND) — but never says which one is for humans and which
is for the mathematics.

Second and more serious: `D` **scales with piece length**. A ten-minute piece
scores higher than a three-minute one at identical interpretive disagreement.
Users *will* compare `D` across pieces — a corpus of rolls is a corpus of
different works — and the comparison is meaningless. Nothing in the design warns.
(`mean = D / L` is length-normalized and is the number that transfers across
pieces; the design's own §1.1 offers it per dimension but the framing never
promotes it.)

**Repair (smallest).** A framing decision plus one documentation obligation, no
new computation:

- state in §9 and in the README that `mean` (JND) is the **reported** figure —
  "these performances are on average 1.4 JND apart" is a sentence a musicologist
  can write — and `distance` (JND·quarters) is the **additive** figure that the
  attribution table and the clustering consume;
- add one sentence to the docs and one line to the report's own metadata:
  `aggregate.distance` is length-dependent and is not comparable across pieces
  of different length; `aggregate.mean` is;
- have mpm-desk-facing docs show the mean in the header and the table in
  JND·quarters, so the two never appear side by side without their units.

---

## C11 — MINOR — The anti-ruler defense is claimed but never stated in the report

**User / workflow.** The researcher writing the cautious sentence Hall's
prohibition demands ("it can be misleading to attack a music roll with a ruler",
survey-lit-welte §4): *these two performances are perceptually equivalent except
in three places*.

**What fails.** SURVEY §4 / survey-lit-welte item 4 make JND-thresholded
reporting the module's methodological answer to Hall, and §7.3 provides the
mechanism (a below-threshold remainder column). But the report ships the
remainder as a table cell only. The sentence the scholar wants — "93% of the
weighted deviation mass is below the perceptual threshold" — is a division the
user must find and perform, and most will instead quote the big number and
reproduce exactly the over-precision Hall warns against.

**Repair (smallest).** One derived block, entirely from numbers already present:

```ts
equivalence: {
  readonly subThresholdMassFraction: number;   // remainder column ÷ D
  readonly aboveThresholdLengthFraction: number; // Σ segment lengths ÷ window
  readonly byDimension: Record<ComparisonDimension,
    { subThresholdMassFraction: number; aboveThresholdLengthFraction: number }>;
}
```

plus a documented sentence template in the README so the phrasing is consistent
across papers that use it. This also serves mlign directly: "is the augmented
sample actually distinguishable?" is `aboveThresholdLengthFraction > 0`.

---

## C12 — MINOR — `boundary_prf` is derivable from the diff product, but nobody is told how, and it will not match mpmify's numbers

**User / workflow.** mpmify replacing `evaluate.py`'s
`boundary_prf(pred, gt, tol_ticks=PPQ)` — precision/recall/F1 of instruction
placement under greedy nearest matching within ±1 quarter (survey-code §6.4).

**What fails.** Nothing structurally: with A = inferred and B = truth, §6.1's ops
give it — substitutes are matched boundaries, deletes are spurious inferred
instructions, inserts are missed truth instructions, so
`P = S/(S+D)`, `R = S/(S+I)`. The ops carry `dateA`/`dateB`, so a tolerance
filter is a post-processing pass. But (a) this derivation appears nowhere, and
(b) the numbers **will not equal** mpmify's: their matcher is greedy-nearest with
an explicit tolerance, ours is a cost-minimizing DP that may prefer a
large-date-shift substitution over an insert+delete pair (or the reverse) on
semantic-cost grounds. A consumer who assumes equivalence and sees different F1
will file a bug against the wrong module.

survey-code §6.4's caution is right and should be kept — "a symmetric metric must
not inherit `boundary_prf`'s precision/recall asymmetry uncritically" — so P/R/F1
should *not* become a first-class report field. A recipe is the correct shape.

**Repair (smallest).** A cookbook entry: the derivation above, the
`|dateA − dateB| ≤ tol` post-filter for tolerance-based matching, and one
explicit paragraph stating that the DP's alignment is cost-optimal rather than
nearest-neighbour, so the figures are comparable in trend but not equal to
`evaluate.py`'s. If W4 finds it cheap, add `opCounts: { insert, delete,
substitute, free }` per (part, map) to `DiffResult` so the derivation is a
division rather than a scan.

---

## C13 — MINOR — `cumulativeDrift` gives the difference but not the two totals, so the literature's canonical statistic is not directly available

**User / workflow.** Reproducing Flury's finding, which Hagmann relays and which
is the single most-quoted quantitative claim in the roll-fidelity literature:
Welte transfers average **~12% longer** than disc recordings of the same
interpretation (survey-lit-welte §3, Busoni op. 15/2: Welte 441 vs Columbia
L 1432 — and §5 names exactly these roll-vs-disc pairs as the field's validation
cases, i.e. the module's natural evaluation corpus).

**What fails.** §5.1 offers `cumulativeDrift { secondsAtEnd, maxAbsMs }`.
`secondsAtEnd` is a *difference*; the claim is a *ratio*. Without either
document's own total duration the user cannot form `T_B / T_A`, and the ratio is
the form the literature states and the only form that is scale-free.

**Repair (smallest).** Two fields:
`cumulativeDrift { secondsA, secondsB, secondsAtEnd, ratio, maxAbsMs }`, with
`ratio = secondsB / secondsA`. Both totals come from the same Simpson
integration already being run on the copied map. Add one docs sentence noting
that under unknown roll speed (C9) the ratio is the meaningful figure and the
absolute totals are not.

---

## C14 — MINOR — The interpretive decomposition's vocabulary is not the audience's

**User / workflow.** A musicologist reads `decomposition: { level, gain, shape,
r }` for the tempo dimension.

**What fails.** "Level" reads fine. "Gain" is an audio-engineering word for what
§1.2 defines as the standard deviation of the log-tempo curve — a musician would
call it *how much the tempo moves*, and will otherwise guess "volume". "Shape"
with `r = 0.87` needs a translation the design does not commit to: what
correlation of 0.87 means about two rubato gestures is not obvious even to
readers comfortable with correlations. §1.2 correctly labels the block
"interpretive" and pins `r = null` on constant windows (good — never 0), but
labelling something interpretive is an invitation to interpret it, and no
interpretation is supplied.

**Repair (smallest).** Keep the field names (they are the mathematics, and
renaming would break the §1.3 correspondence with `exaggerateMpm`'s vocabulary)
and add:

- a `shapeless: boolean` companion to `r === null`, so consumers branch on a
  flag rather than on a null;
- a README glossary with one worked example per component, in performance terms:
  "`level = 0.29` nepers on tempo means A is about 34% faster overall";
  "`gain_A = 0.12`, `gain_B = 0.04` means A's tempo moves three times as far from
  its own average as B's — A shapes, B holds steady"; "`r = 0.87` means they
  push and pull at the same places, and the remaining difference is how much,
  not where."

This is a docs obligation, and it should be written into §11's W4 item so it
cannot be dropped.

---

## C15 — MINOR — Asynchrony: isolation works, but the melody-lead and two-zone questions are out of reach and the design should say so

**User / workflow.** Two questions from the literature. Hagmann's: is the
asynchrony in this roll intentional, or a "künstliches Arpeggio" forced by the
two-zone dynamic split (survey-lit-welte §3)? Goebl's melody-lead literature: what
is the *distribution* of per-note onset asynchronies, and does the melody lead?

**What fails.** Isolation itself is fine — §7.4 keeps zero-weight dimensions
computed and reported, so a researcher reads `d_asynchrony` on its own without
zeroing anything. The limit is upstream, in what MPM encodes: §5.7 compares a
per-part step curve of `milliseconds.offset`. That is a *part-level* offset over
time, not per-note data, and it carries no pitch — so neither the two-zone
hypothesis (which is a claim about keyboard *register*, i.e. pitch) nor a
per-note melody-lead distribution can be answered from the MPM alone. Both would
need rendered note events with pitches, i.e. the MSM plus a render.

That is a correct scope boundary, not a defect. The defect is that the design
does not state it, while survey-lit-welte flags asynchrony-as-artifact as a
design-shaping finding — which sets up a reader to expect more than §5.7
delivers.

**Repair (smallest).** One paragraph in the module docs, next to §5.7: what the
asynchrony dimension compares (encoded per-part offsets, exactly), what it
therefore cannot answer (per-note melody-lead distributions; any
register-partitioned hypothesis), and the honest pointer that those require
rendered events and are out of scope for a pure MPM reader. Record it as an
enumerated non-goal rather than leaving it to be discovered.

---

## C16 — MINOR — The most likely first call is more awkward than it needs to be

**User / workflow.** The very first thing anyone runs, and the campaign's own
P-C9 fixture: Telemann *Grave*, Baroque vs Romantic — two performances **inside
one document**. Same for Vulpius and Albert; survey-code §6.3 confirms these
three files are the only real multi-performance documents in existence, and
§11's W2 makes them the fixture corpus.

**What fails.** §9 requires both `a` and `b`, so the call is

```ts
compareMpm({ a: text, b: text, performanceA: 'Baroque', performanceB: 'Romantic' });
```

— the same text passed twice. Not broken, and the explicitness has a defense
(F5's hazard argument about two interchangeable MPM texts is sound). But §8's
corpus entry point already handles this case gracefully, by expanding a single
item into one per performance; the pairwise entry point is stricter than its
sibling for the case the fixtures are built on.

**Repair (smallest).** Make `b` optional and default it to `a`:
`compareMpm({ a, performanceA: 'Baroque', performanceB: 'Romantic' })`. The
existing multi-performance-without-selector error already covers the ambiguous
case, so the strictness that matters is retained; this only removes the
duplicated argument when both selectors are present. One line in the option
normalizer, one sentence in the docs.

---

## C17 — MINOR — The stated corpus scale is below both named consumer corpora

**User / workflow.** mlign's augmentation QA over the mpmify output (200 files),
and any sweep of the `Daten` corpus (121 files).

**What fails.** R10 and §8 both state "N ≤ ~100". The two real corpora a
consumer would point at this module are 121 and 200 (survey-code §6.1). It is
unclear from the design whether ~100 is a hard limit (an `InvalidOptionError`)
or performance guidance — and the difference decides whether the corpus product
covers its own consumers' data. Nothing gives a user a way to predict runtime
either: at O(N²) pairs, 200 files is 19,900 comparisons, and whether that is a
coffee break or an overnight run is not knowable from the design.

**Repair (smallest).** State it. If guidance: say "guidance, not a limit", and
give one measured per-pair cost in the docs once W3 exists, so a user can
multiply. If a limit is wanted for safety, make it an explicit option with a
documented default (`maxItems?: number`) rather than a number in prose. Either
way, §8 should note that C7's heterogeneity check matters more as N grows,
because a 200-file glob is where nobody inspects the inputs by hand.

---

## Summary table

| # | Severity | One line |
|---|---|---|
| C1 | CAPITAL | The deviation profile — §1.1's "central object" — is absent from §9's result; mpm-desk cannot draw the comparison |
| C2 | CAPITAL | Every quantity is \|Δ\|; only the global `level` term is signed, so "where is Hofmann slower?" is unanswerable |
| C3 | MAJOR | All dates in quarters; no measure/beat mapping though the optional MSM carries `timeSignatureMap` |
| C4 | MAJOR | U3's "difficulty" ships as mass only; `peak` is unavailable from any product, so re-ranking is impossible |
| C5 | MAJOR | U2's "edit path" is delivered cost-sorted, never in score order |
| C6 | MAJOR | No plausibility channel: the brief's `Hofmann (1927)` roll (tick-valued `beatLength`) yields ~170 JND of silent nonsense |
| C7 | MAJOR | Nothing checks the same-piece precondition; §5.0's window rule absorbs length mismatches into "very different interpretations" |
| C8 | MAJOR | mpmify's null-baseline ratio needs an undocumented neutral document, and the default invariance gives a wrong denominator |
| C9 | MAJOR | `invariance: 'level'` removes roll speed only in log spaces; the ms-valued dimensions stay contaminated under §7.4's own recipe |
| C10 | MAJOR | Headline `D` is in uninterpretable JND·quarters and scales with piece length; the design never says `mean` is the human figure |
| C11 | MINOR | No equivalence statement, so the JND/anti-ruler defense is claimed but never stated in the report |
| C12 | MINOR | `boundary_prf` is derivable from the ops but undocumented, and will not equal mpmify's greedy matcher |
| C13 | MINOR | `cumulativeDrift` reports the difference, not the two totals, so Flury's "12% longer" ratio isn't formable |
| C14 | MINOR | `gain` / `r` have no committed translation for the musicologists they are aimed at |
| C15 | MINOR | Asynchrony's real limits (no per-note, no pitch) are unstated while the lit survey raises exactly those questions |
| C16 | MINOR | Comparing two performances in one document requires passing the same text twice |
| C17 | MINOR | `N ≤ ~100` sits below both named consumer corpora (121, 200) and is not marked limit-vs-guidance |

## What this lens found working

Recorded so adjudication does not over-correct. Dimension-selective comparison
via zero weights, with zero-weight dimensions still computed and reported (§7.4),
is exactly what the Welte dynamics-may-be-editorial debate needs and is better
than a dimension-drop would have been. R6's absence-is-neutral is the right call
and is what makes C8's repair a two-line change rather than a redesign. §7.4's
per-document canonicalization is the correct answer to Hall's speed question for
the dimension that matters most (tempo), and the fact that it also reproduces
mpmify's constant-tempo null baseline exactly (C8) is a genuine result worth
stating in the README. The corpus product's honesty about non-Euclidean
structure (full spectrum, `Σ|λ|` explained variance, negative-eigenvalue mass)
is better practice than most published MDS in this field. And PAM medoids being
real performances — "the most typical Hofmann" — is the right primitive for the
questions this literature asks.
