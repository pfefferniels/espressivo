# Expression transforms: turning a performance up

> **An espressivo addition.** Java meico applies an MPM to a score; it does not transform the MPM.
> There is no Java output to be byte-identical to, so this module makes no parity claim of any
> kind, and nothing in it is reachable from the conversion or rendering paths the equivalence
> suites drive. The ideas descend from an unpublished Java prototype (`mpm-renderer`'s
> `ModifyService` / `Shader` / `PerformService`) which was treated as an **idea source, not a
> parity target** — [PARITY.md §7](../PARITY.md) names the five places this deliberately departs
> from it.
>
> Back to the [README](../README.md).

An MPM says how a piece is played. `exaggerateMpm` and `spotlightMpm` edit that document
parametrically — **MPM text in, MPM text out**, nothing rendered and nothing extracted — so you can
sample a family of performances from one encoding, damp everything but the phrase you are
studying, or drive a single "how expressive?" slider.

```ts
import { readFileSync } from 'node:fs';
import { exaggerateMpm, spotlightMpm } from 'espressivo';

const mpmText = readFileSync('performance.mpm', 'utf8');

// Every tempo and dynamics deviation, further from neutral.
const { mpm, report } = exaggerateMpm(mpmText, { factors: { tempo: 1.6, dynamics: 1.4 } });

// Damp everything the selected instructions do not govern, to a quarter.
const brought = spotlightMpm(mpmText, { ids: ['t2', 'dyn4'], attenuation: 0.25 });
// brought.spared === ['tempo', 'tempoShape', 'dynamics', 'dynamicsShape']
```

## Options

The first field of each is **required**:

- **`ExaggerateOptions`** — `factors` (required), plus `performance` (name or index; **omitted
  transforms all of them**, unlike `performMsm`), `scope` (`'global'`, the default, exaggerates
  levels around a performance-wide centre so a piecewise-constant map grows section contrast;
  `'gesture'` scales each transition pair around its own mean and leaves constants alone),
  `center`, `velocityRange` (default `{ min: 1, max: 127 }` — the floor is 1 because velocity 0 is
  a note-off), `minRubatoWindow`, and `msm`, which fills in the report's estimates and reaches
  nothing else.
- **`SpotlightOptions`** — `ids` and `attenuation` (both required), plus `performance`. There is no
  `scope`: spotlight is always `'gesture'`, because under `'global'` damping a background level
  pulls it _toward_ the centre and re-levels quiet material louder.

## What `s` means

Each exaggerable attribute is mapped into a space where its _neutral_ value is
0, scaled by `s`, and mapped back — a log space around a mean for tempo and dynamics levels, a
logit for bounded proportions, a plain gain for signed offsets. So `s = 1` is the identity, `s > 1`
pushes further from neutral, `s < 1` pulls toward it, and `s = 0` writes the neutral itself.
Fifteen dimensions scale independently (`EXPRESSION_DIMENSIONS` is the list) and a missing key
means 1. `weightedFactors(s, weights)` expands one scalar into all fifteen, and
`PROTOTYPE_WEIGHTS` is a documented heuristic preset rather than a default.

## What is guaranteed

Two invariances, of different strength — and the distinction matters if you
are generating training data:

- **Structural (R5a), universal.** The result has the same skeleton as `canonicalMpm(input)`: no
  `@date` is ever written, no element and no attribute is added or removed. Only numeric attribute
  values change; the report says which dimensions were written and how many writes each made, and
  names every site it refused, clamped, skipped or found inert. Compare against
  `canonicalMpm(input)` and not against your own bytes — parsing and re-serializing re-emits an
  `xmlns` declaration on every namespaced element, which inflates a real 2444-byte fixture to 3972
  bytes before the transform touches anything. That is why `canonicalMpm` is exported: it is the
  baseline any byte comparison has to be made against, and the identity transform returns it
  exactly.
- **Symbolic (R5b), qualified.** Performing the result against the same MSM yields the same notes —
  same **symbolic** dates, durations and pitches, and the same ids for the notes the score already
  had; only milliseconds, velocities and control changes move. Notes that an MPM v3 ornament
  _generates_ are matched by position and date rather than by id: they draw a fresh random
  `meico_<uuid>` on every render, so two renders of the _same untransformed_ document already
  disagree on those ids. The guarantee holds for every MPM v2 document and for every v3 document
  whose ornament frames are in milliseconds. It does **not** hold for `ornamentSpread` or
  `ornamentSpacing` on a v3 ornament that _generates_ notes into a tick-resolved frame, because the
  renderer derives those notes' geometry from the very frame those two dimensions scale. Hold them
  at 1 if you need the guarantee unconditionally.

Every run returns a report beside the document: which dimensions were transformed, skipped or
inert, which sites were clamped, the computed centers (pass one back to make composition exact),
and per-document sampling bounds. `report.totalWrites === 0` is the exact test for "this sample is
a no-op". The transform is deterministic — no RNG anywhere — and never writes a non-finite value.

## Cookbook: one slider of your own

A named "sketchiness" or "energy" curve is a UI recipe, not
library semantics, so none ships — but composing one is the point of `weightedFactors`, whose
expansion is `sᵈ = 1 + wᵈ·(s − 1)`. A missing weight passes `s` through unchanged, `w = 0` pins its
dimension at the identity, and `s = 1` is the identity for any weights at all. The weights below
are a **heuristic** — nothing here derives them:

```ts
import { exaggerateMpm, weightedFactors, type ExaggerationWeights } from 'espressivo';

// Looser and more uneven, without redrawing the dynamic plan or moving generated notes.
const SKETCHY: ExaggerationWeights = {
  imprecisionTiming: 1.8,
  imprecisionDynamics: 1.4,
  imprecisionDuration: 1.2,
  asynchrony: 1.3,
  rubato: 1.2,
  tempo: 0.6,
  tempoShape: 1,
  articulation: 0.6,
  accentuation: 0.8,
  dynamics: 0.4,
  dynamicsShape: 0.4,
  pedalShape: 0,
  // 0 pins these three at the identity, which is what keeps R5b unconditional.
  ornamentSpread: 0,
  ornamentSpacing: 0,
  ornamentDynamics: 0,
};

const { mpm, report } = exaggerateMpm(mpmText, { factors: weightedFactors(1.5, SKETCHY) });

// Faster as well as looser: levels are scaled around a center, so moving the center moves all
// of them with it — override the one the previous run reported rather than raising `tempo`.
const faster = exaggerateMpm(mpmText, {
  factors: weightedFactors(1.5, SKETCHY),
  center: { tempo: (report.performances[0].centers.tempo ?? 100) * 1.1 },
});
```

A weight above 1 can drive a factor negative below `s = 1` — `weightedFactors(0.3, {rubato: 1.5})`
is about −0.05 — and `exaggerateMpm` rejects that, naming the dimension. Keeping the slider inside
the admissible range is the caller's job; §8 of the design document has the per-dimension ranges.

## The full model

The per-attribute registry and the reasoning behind every inclusion and exclusion
are in
[docs/history/expression/DESIGN.md](https://github.com/pfefferniels/espressivo/blob/main/docs/history/expression/DESIGN.md)
(a repository document — the npm package does not carry it); the relationship to the Java-era
prototype these ideas came from is in [PARITY.md §7](../PARITY.md).
