# Comparing performances: how far apart, and where

> **An espressivo addition.** Java meico applies an MPM to a score; it has no notion of comparing
> two performances. There is no reference behaviour to be byte-equivalent to, so this module makes
> no parity claim of any kind and is reachable from nothing the equivalence suites drive. It is
> verified against its own design document and against the MPM format's vendored sample corpus.
>
> Back to the [README](../README.md).

Performer identity is carried first by **articulation and melody lead**, then by tempo, with
dynamics last — the finding the Stamatatos & Widmer line of work keeps arriving at. Those top two
are precisely what an audio-derived tempo-and-loudness curve cannot see, and precisely what an MPM
carries losslessly: the articulation map says what each note does to its own length and attack, and
the asynchrony map says which voice arrives first. `compareMpm` compares two performances across
all eleven of those channels at once, and says not only how far apart they are but _where_ and _in
what_.

As far as a verified literature survey (2026) and a targeted 2025–26 re-sweep could establish, this
is the first **exact, additively-decomposable comparison of symbolic performance-directive
encodings**: prior work compares _rendered_ parameter sequences — beat-level curves, per-note MIDI
features, or their distributions — where the decomposition by expressive dimension is
approximate at best and usually unavailable. The claim is deliberately narrow (performance
comparison as such is a century old); what is new is that the difference decomposes _exactly_, by
dimension and by score passage, with zero residual.

```ts
import { readFileSync } from 'node:fs';
import { compareMpm } from 'espressivo';

const grave = readFileSync('telemann-grave.mpm', 'utf8');
const score = readFileSync('telemann-grave.msm', 'utf8');

const { report } = compareMpm({
  a: grave,
  performanceA: 'Baroque',
  performanceB: 'Romantic',
  msm: score,
});

report.aggregate.distance; // 8397.60  JND·quarters — the mathematical total
report.aggregate.mean; //    41.16   JND — the human headline (C10)
report.dimensions.tempo.distance; // 1755.47 of it is tempo
report.segments[0]; //       where the largest concentration of difference is
report.table.cells; //       the closing table: every dimension × every segment, and it closes
```

Nothing is rendered and nothing is extracted: two MPM documents in, one plain-data report out.

## The numbers are real, and one of them corrected the design

The vendored corpus is the MPM format's own sample encodings. Telemann's _Grave_ carries three
readings of one piece, and they come out where you would expect — Baroque and Romantic close,
Fast far from both:

| pair               | aggregate distance | mean |
| ------------------ | -----------------: | ---: |
| Baroque ↔ Romantic |            8397.60 | 41.2 |
| Baroque ↔ Fast     |           24941.06 |  122 |
| Fast ↔ Romantic    |           26174.72 |  128 |

Vulpius's _Die helle Sonn_ was expected to behave the same way, and it does not. Its two
historical readings are **not** the near pair; Romantic and Amateur are, at 2939.66 against
8849.39 and 10294.50. The reason is in the document rather than in the metric, and the report says
so without being asked: `tempo`, `rubato` and `articulation` are **exactly zero** between Romantic
and Amateur — three whole dimensions of two different performances comparing at 0, because they
really do share those maps — and everything that separates them sits in `imprecisionTiming`,
`imprecisionDynamics` and `asynchrony`. The Amateur reading _is_ the Romantic one with
imprecision and asynchrony added. An expected ordering would have passed on an implementation
computing almost anything; an exact zero across three dimensions with large structured values on
three others can only come out of readers that agree with the document.

## What the number is

Every dimension is compared as a **function of score time**, not as a list of instructions. Two
documents that spell the same performed curve differently — a global map against a part-local one,
an explicit neutral instruction against an absent map, five steps against one transition — compare
at exactly 0, and the report says _encoded differently, performed the same_ in a note. The
distance is the integral of the pointwise difference:

```
d_k = ∫ |T(A(t)) − T(B(t))| / jnd_k  dt        D = Σ_k ω_k d_k
```

- `T` is the dimension's **scale space** — the natural logarithm for tempo and dynamics levels,
  the identity for velocities and milliseconds, so that a ratio is a difference where a ratio is
  what the ear hears. Every reported log quantity carries the unit `'nepers'`; multiply by
  `1/ln 2` to read it as log₂. **MPM stores BPM, a rate**, so a positive signed tempo difference
  means A is _faster_ — the opposite of the seconds-per-beat convention much of the literature
  uses.
- `jnd_k` is a just-noticeable difference, so `d_k` is in **JND·quarters** and `mean` is in
  **JND**: "about 41 just-noticeable differences, sustained". Tempo's is `ln(1.025)` — Friberg &
  Sundberg's verified 2.5 % relative threshold — and asynchrony's is 30 ms; the rest are
  documented conventions and every one is overridable through `options.jnd`.
- `ω_k = 1` by default. That weights dimensions as JND-integrals, which is honest but is not the
  same as weighting them by importance; `options.weights` is where a different view goes, and
  `compareMpmCorpus`'s `normalization: 'corpus'` derives one from the corpus itself.

**`mean` is the human headline and `distance` is the mathematical total.** Quote the mean. A
distance is proportional to how long the piece is and to how many parts the score has, so two
distances from different pieces are not comparable and the module will not pretend otherwise —
that is what the corpus-level percentile context exists for.

**What is a distance and what is not.** `distance`, `mean`, the closing table and the matrices are
distances: they satisfy the metric axioms under a piece-derived window, and `window.metricGuarantee`
tells you which kind you have. `meanSigned`, `levelSigned`, `direction`, `cumulativeDrift` and the
profile's signed series are **descriptors**: they say which side is faster or louder, they enter no
distance, and they do not satisfy the triangle inequality.

## The glossary: level, gain, shape

Each curve dimension is also decomposed into three interpretable numbers, which is where a
comparison stops being a score and starts being a description. In musicians' terms:

- **level** — _are they in the same place?_ One performance is simply faster, or louder, than the
  other, all the way through. `decomposition.level` on tempo is the size of that offset in nepers;
  `levelSigned` says which way. A 1905 roll read 10 % fast against the same roll read correctly is
  pure level: `level = ln(1.1) ≈ 0.095`, `gain = 0`, `shape = 0`.
- **gain** — _is one of them doing more?_ Same shape of gesture, further from the mean. A
  ritardando to half tempo against the same ritardando to three-quarters is pure gain: both slow
  down in the same places, one twice as much. `gain` is the difference of the two curves' standard
  deviations about their own means.
- **shape** — _are they doing the same thing at the same time?_ `shape = √(2(1 − r))`, where `r`
  is the correlation of the two curves. Two performances that both use the same amount of rubato,
  in different places, have `level = 0`, `gain = 0` and `shape` near its maximum of 2. A performer
  who slows into every cadence against one who slows out of them is the pure-shape case.

The three close: `level² + gain² + 2σ_Aσ_B(1 − r) = ‖A − B‖²` on the normalized measure, and the
report carries the closing check so a plausible-looking value that does not close is visible
rather than silent.

## The window, and what the guarantee is conditional on

Every integral runs over one window, and which one is a fact about your inputs rather than a
setting to forget. Supply an `msm` and the window is the score's own end — `window.rule === 'msm'`,
`metricGuarantee === 'unconditional'`. Supply neither `msm` nor `window` and the module falls back
to the later of the two documents' last instruction dates, stamps `'pair-derived'` and
`'window-restricted'`, and **those numbers must not be assembled into a matrix**: a window that
varies with the pair makes each cell a value of a different function, and the triangle inequality
between three such numbers means nothing. `compareMpmCorpus` derives one window for the whole
matrix for exactly this reason.

`report.comparability.suspectPair` is the other half of the same care: it fires when the two
documents look like different pieces — lengths outside a `[0.8, 1.25]` band, or no shared part
number, or a score end that truncates most of what an MPM encodes. It is worded as a question and
names its numbers, because "these two files may not be the same piece" is a judgement the reader
has to make.

## `diffMpm`: what would you have to change?

Where `compareMpm` answers _how far apart_, `diffMpm` answers _what would you have to change to
turn one into the other, and what does each change cost_. The two are one mathematics: an op's
cost is an integral of the same density the distance reports, so the edit list is ranked in the
units the distance is quoted in.

```ts
import { diffMpm } from 'espressivo';

const { report } = diffMpm({
  a: grave,
  performanceA: 'Baroque',
  performanceB: 'Romantic',
  msm: score,
});

for (const script of report.scripts) {
  for (const index of script.topByCost.slice(0, 3)) {
    const op = script.ops[index];
    console.log(op.op, script.map, `bar ${op.measureA?.number ?? '?'}`, op.cost.toFixed(1));
  }
}

report.dimensions.tempo.reworking; // how much MORE the script costs than d_tempo
```

Ops are delivered in **score order** and each carries its rank in cost order, because those are
two different readings and both are wanted: a reader following along in the score walks the first,
and "what matters most" is the second. Each op names the attributes it changes with their values
on both sides and the difference in JND.

Three numbers come back per dimension and they are three numbers, not one reported thrice:
`dCurve` is the distance — a lower bound — `scriptCost` is what the cheapest monotone script
costs when each edit is priced against the state the previous edits left behind, and
`replayedDelta` is what that same edit list costs applied in score order. **`reworking =
scriptCost − dCurve` is the interesting one**: it is how much the edit path has to undo itself,
and it is `≥ 0` as a theorem rather than as an observation.

## `compareMpmCorpus`: a folder of performances

```ts
import { compareMpmCorpus } from 'espressivo';

const { report } = compareMpmCorpus({
  items: rolls.map((mpm, index) => ({ mpm, label: names[index] })),
  msm: score,
  k: 3,
  noiseFloor: true,
});

report.labels[report.medoids![0]]; // the most typical performance of cluster 0
report.matrices.aggregate[i * report.n + j]; // full N², row-major, bit-symmetric
report.embedding.coordinates; // classical MDS, N × 2 by default
report.context!.percentile[i * report.n + j]; // where this pair sits in THIS corpus
```

An item that names no performance in a multi-performance document expands to one item per
performance. Labels are required unique after that expansion, and the module refuses a collision
rather than resolving it: the medoid is the one product whose entire value is naming a real
performer, and two rows both called `"Welte 1905"` make "the most typical Hofmann" ambiguous.

Three honesty fields, all reported always:

- **`embedding.negativeEigenvalueMass`** — how non-Euclidean the corpus is. An `L¹`-type distance
  generally is, so the MDS plot is a projection of something that does not live in a plane, and
  this number says how much was lost. `explainedVariance` is computed over `Σ|λ|`, never over
  `Σλ⁺`, which would flatter the result by pretending the negative mass is not there. It is
  SIGNED: a negative share is an axis with a negative eigenvalue — an imaginary direction, whose
  coordinates are all zero because only a positive eigenvalue is embedded. Reading it as a
  magnitude would credit an axis that is not there with variance it does not carry.
- **`silhouetteReliable`** — `false` below twenty items, where the silhouette is noisy enough to
  inform a choice of `k` but not to decide one.
- **`suspectPairs`** — the comparability check, surfaced at corpus level so a heterogeneous folder
  announces itself before the dendrogram is read. This matters more as `N` grows, because a
  200-file glob is where nobody inspects the inputs by hand.

`linkage: 'ward.D2'` is offered and carries a caveat worth reading: the Lance–Williams recurrence
remains **valid** on a non-Euclidean dissimilarity, but Ward's minimum-variance **interpretation**
does not — and this distance is generally not Euclidean. The output is a well-defined hierarchy
whose usual story does not apply. `'average'` (UPGMA) is the default and its merge heights read
directly as mean inter-cluster distance in the reported units.

## Scapes: every position, every timescale

`scape: { bins: 32 }` returns the aggregate difference over every sub-window at once — Sapp's
timescape, which is how the field reads a comparison. The triangle is internally consistent by
construction: a cell is the sum of any partition of itself, so comparing a phrase-length cell
against the bars beneath it is meaningful rather than approximate, and the top cell _is_
`aggregate.distance`.

```ts
import { compareMpm, scapeIndex } from 'espressivo';

const { report } = compareMpm({ a, b, msm: score, scape: { bins: 32 } });
const cells = report.scape!.cells;
cells[scapeIndex(32, 1, 0)]; // the first bin alone
cells[scapeIndex(32, 8, 4)]; // eight bins starting at the fifth
```

At corpus level the same option gives Sapp's other variant: per cell, **which** performance is
closest to the corpus medoid there — who plays most typically at that place and that timescale.

## Cookbook

**Timing only, for a piano roll.** A Welte roll's speed is structurally uncertain: the reproducing
piano's tempo depends on the playback machine, so the absolute rate is not a property of the
performance. Compare in a level-invariant tempo space and give the dynamics no weight:

```ts
const { report } = compareMpm({
  a: roll1905,
  b: roll1927,
  msm: score,
  invariance: { tempo: 'level' },
  weights: { dynamics: 0, imprecisionDynamics: 0 },
});
```

The trade-off is per space, and it is not symmetric. On tempo, which is a **log** space,
`'level'` removes a multiplicative factor — a roll read 10 % fast compares at exactly 0 against
the same roll read correctly. On asynchrony, which is **linear**, the same mode removes a constant
lag but leaves a 10 % _stretch_ standing, because `c·x − mean(c·x) = c(x − mean x)`. Ask for it on
a linear dimension and the report says so in plain words, as an `invariance-space` note: _"this
dimension's scale space is linear, so invariance 'level' removed an OFFSET, not a scale factor"_.

**How far is this from deadpan?** `neutralMpm()` is the documented empty performance, so nobody
has to hand-roll the null baseline:

```ts
import { compareMpm, neutralMpm } from 'espressivo';

const { report } = compareMpm({ a: performance, b: neutralMpm({ ppq: 720 }), msm: score });
report.aggregate.mean; // the whole deviation from neutral, in JND
```

That is the denominator for "how expressive is this, relative to that": compare two performances
against the same neutral and take the ratio. Use `invariance: 'level'` on tempo if the question is
about _shaping_ rather than about tempo choice — with `'none'` a performance that is simply fast
scores as expressive, which is measuring the wrong thing.

**Boundary precision and recall.** With `a` inferred and `b` ground truth, `diffMpm`'s op counts
give a `boundary_prf`-style figure directly: substitutions are matched boundaries, deletions are
spurious inferred instructions, insertions are missed true ones.

```ts
const { opCounts } = report.scripts.find((s) => s.map === 'tempoMap')!;
const precision = opCounts.substitute / (opCounts.substitute + opCounts.delete);
const recall = opCounts.substitute / (opCounts.substitute + opCounts.insert);
```

**These will not equal mpmify's numbers, and the difference is not a bug.** mpmify's matcher is
greedy-nearest with an explicit date tolerance; this one is a cost-minimizing DP that may prefer a
large-date-shift substitution over an insert-and-delete pair on semantic grounds. The figures are
comparable in trend and not in value, which is why they are a recipe here rather than a field in
the report — a symmetric metric should not inherit precision/recall's asymmetry uncritically. Add
`|op.dateA − op.dateB| <= tol` as a post-filter if you want the tolerance back.

**Earlier or later rubato?** Hudson's typology — does the melody arrive _before_ the beat is
stretched, or after — is definitionally a statement about the relationship between the asynchrony
channel and the tempo channel, and MPM separates them natively where an audio study has to
disentangle them. Goebl, Flossmann & Widmer's working detector is a 30 ms threshold, and 30 ms is
already this module's asynchrony JND:

```ts
const { report } = compareMpm({ a, b, msm: score });

// Does melody lead separate them at all? `meanSigned` is in ms, and 30 ms is the threshold.
const lead = report.dimensions.asynchrony.meanSigned ?? 0;
const separates = Math.abs(lead) >= 30;

// Where is it concentrated? The closing table attributes every segment to the dimensions that
// made it. Rows are `table.dimensions`; columns are the segments, then the below-threshold
// remainder — so a share is a cell over its column's sum.
const row = report.table.dimensions.indexOf('asynchrony');
const ranked = report.segments
  .map((segment, column) => ({
    segment,
    share:
      report.table.columnSums[column] === 0
        ? 0
        : report.table.cells[row * report.table.columnCount + column] /
          report.table.columnSums[column],
  }))
  .sort((x, y) => y.share - x.share);

const top = ranked[0];
if (separates && top.segment.measure)
  console.log(
    `melody lead ${lead.toFixed(0)} ms; ${(top.share * 100).toFixed(0)} % of the difference in ` +
      `bars ${top.segment.measure.start.number}–${top.segment.measure.end.number}`,
  );
```

On the vendored Albert _Du mein einzig Licht_, whose two readings are an expressive one and a
deliberately deadpan "Like a robot", that prints a **475 ms** lead carrying **33 %** of the
difference — an unmistakable answer in the historians' own terms, where a correlation coefficient
would say only that the two are far apart.

Two honest limits. **The localisation is only as fine as the segmentation**, and on this corpus
every pair yields a single segment spanning the whole piece: with `ω = 1` the entire piece is
above the one-JND threshold, so there is nothing to localise _within_. Narrow the window, or
down-weight the dimensions that are saturating it, to see the segmentation split. And this is a
recipe rather than a report field because deciding _earlier_ against _later_ needs the asynchrony
attributed to the melody voice specifically, while the report sums over the score's parts rather
than separating them — a limitation stated here rather than papered over with a plausible note.

**Trusting an encoding as far as it deserves.** Where a document came from should change what you
weigh, and the knobs for that already exist — these are documented data, not library semantics,
and nothing here derives them:

```ts
// A roll-derived encoding: the note ordering is trustworthy, the dynamics are not, and the
// melody lead is confounded by velocity (Goebl 2001; Hagmann's künstliches Arpeggio).
const ROLL_DERIVED = {
  weights: { dynamics: 0.2, imprecisionDynamics: 0.2, accentuation: 0.3, asynchrony: 0.5 },
  invariance: { tempo: 'level' as const },
};

// An alignment-fitted encoding: onsets are as good as the alignment, so timing is trustworthy
// and everything the fitter had to invent is not.
const ALIGNMENT_FITTED = {
  weights: { ornamentation: 0, pedal: 0, accentuation: 0.5 },
};

// A hand-authored encoding: every channel is deliberate; weigh them equally.
const HAND_AUTHORED = {};
```

TimeToAlign's `MatchClaim` certainty field is the citable precedent for encoding
provenance-conditioned trust this way — the trust belongs to the source, so it belongs in the
weights rather than in the metric.

## What this is not

Three prohibitions, and they are the survey's rather than this document's:

- **Not a quality judge.** The distance says two performances differ, never that one is better.
  Peter et al. (2023) is the standing demonstration that "distance from a norm" and "quality" are
  different axes, and nothing here measures the second.
- **Not a perceptual model.** JND normalization makes the dimensions commensurable; it does not
  make the total a prediction about what a listener will notice. A constant JND is a stated
  simplification, and a real one: Repp's 1992/1995 position-variance work shows that the
  perception of musical time is warped by structure — thresholds dip exactly where expressive
  lengthening typically occurs — so a difference of 1 JND at a phrase boundary and 1 JND mid-bar
  are not equally audible. Position-dependent thresholds are enumerated future work, not silently
  absent.
- **Not a single number.** `D` exists because a metric needs a total, but the products worth
  reading are the per-dimension rows, the segments, and the decomposition. Liebman et al. (2012)
  is the standing warning against collapsing performance similarity onto one axis.

**Asynchrony's limits, specifically** (`asynchronyMap` is one offset per part, per span): it
models a part-level lead or lag, not per-note melody lead within a chord, and not the
register-dependent asynchrony a real pianist produces. A document that encodes the first will be
compared exactly; a study that needs the second needs note-level data this format does not carry.

**On interpolating between measured events.** Desain & Honing's standing objection — never
interpolate a curve through measured onsets — targets _measured event data_, and it is right. It
does not apply here: an MPM curve is a **parametric specification**, continuous by definition and
authored as such, so this module compares shape functions and interpolates nothing. That is
exactly the representation Todd's kinematic models, Repp's parabolic ritard and Molina-Solana's
`(w, q)` fitting all have to _recover_ by fitting, and it is free here.

## The full model

The eleven dimensions, the per-attribute registry, the renderer-truth readings each one is
compiled from, and the reasoning behind every inclusion and exclusion are in
[docs/history/comparison/DESIGN.md](https://github.com/pfefferniels/espressivo/blob/main/docs/history/comparison/DESIGN.md)
(a repository document; the npm package does not carry it).
