# Parity ledger

espressivo is a TypeScript port of [meico](https://github.com/cemfi/meico) whose acceptance
criterion is not "works correctly" but **"produces the same bytes the Java reference produces"**.
Where correctness and equivalence disagree, equivalence wins — the port reproduces the
reference's bugs on purpose, because a port that silently improves on its reference cannot be
verified against it.

This file is the complete list of places where that rule was applied, plus the three places
where it was deliberately broken. It is the audit trail for
[README.md](README.md#equivalence-with-java-meico)'s equivalence claim: everything here is
either a reproduced Java behaviour or a journaled, approved divergence. Nothing is
undocumented.

Java citations are `File.java:line` in
[pfefferniels/meico](https://github.com/pfefferniels/meico) (a fork of cemfi/meico); TypeScript
citations are paths in this repository. The refactor journal entries referenced as `[T…]` live
in `refactor/log.md`.

---

## 1. Deliberate divergences

Three, each approved and journaled before it was implemented. Everything else in this file is
a behaviour the port reproduces rather than changes.

### #1 — `ArticulationData.articulateNote` no longer hangs

|                           |                                                                |
| ------------------------- | -------------------------------------------------------------- |
| Item                      | `TD1`, approved 2026-08-08 (ARCHITECTURE.md §6.3 row P3, §8.0) |
| Java                      | `ArticulationData.java:197`                                    |
| TypeScript                | `src/mpm/elements/maps/data/ArticulationData.ts:193-215`       |
| Reachable from a fixture? | No — no fixture carries `absoluteDurationChange`               |

Java writes the `absoluteDurationChange` loop as
`for (double reduce = 2.0; durNew >= 0.0; reduce *= 2.0)` with no guard, **and that loop never
terminates**: `reduce` doubles to `Infinity`, `durNew` converges back to the unchanged
`duration`, and `>= 0.0` stays true forever. The comment on that same Java line — "as long as
the duration change causes the duration to become 0.0 or negative" — describes the inverse
test, so the code contradicts its author's stated intent.

The port instead uses the spelling Java's own `ArticulationDef.java:420-423` gives the same
computation (mirrored in `src/mpm/elements/styles/defs/ArticulationDef.ts:355-363`): **both**
the `duration > 0.0` guard **and** `durNew <= 0.0`. Both are needed. With `<=` alone and no
guard, a note whose `duration.perf` is zero or negative plus a negative change still spins
forever — and a zero `duration.perf` is not hypothetical, the reference output
`tests/integration/fixtures/performance-reference/composite_advanced_augmented.msm` carries
one.

Why this one was repaired when P1/P2/P4 below were not: those are quality-of-implementation
issues on _malformed_ input. This one hangs the renderer on **well-formed** MPM — a document
using `<articulation absoluteDurationChange="…">` produces no output and no error, forever.

**Second observable consequence, stated so it is not discovered later.** The branch ends with
`addToListAttribute(note, 'modified', …)`, which `ArticulationDef`'s equivalent does not have.
It now sits _inside_ the guard, so a note with `duration.perf <= 0` and a non-zero
`absoluteDurationChange` no longer gets its `modified` list entry. That is serialization-visible
and deliberate: announcing a modification on a note whose duration was provably not touched is
worse. Two unit tests assert the absence directly, so the choice is pinned rather than
incidental.

**Evidence** ([TD1] worker and verifier entries): zero fixtures reach the branch
(`grep -rl absoluteDurationChange tests/integration/fixtures` ⇒ 0 files); a full pipeline
byte-probe over both trees — 5 deterministic all-maps fixtures and all 16 MEI fixtures through
MSM, MPM, augmented MSM, raw MIDI and expressive MIDI — produced transcript sha
`169e964bd492bc6a256cea4cea9cfab748c0502da289bc4be03892ae7b726c1e` on **both** sides; and three
negative controls, of which the decisive one is that the comparison-only fix (`<=` without the
guard) passes every other assertion and **still hangs**.

### #2 — The movement fixes, mirrored from the Java fork

|            |                                                                                        |
| ---------- | -------------------------------------------------------------------------------------- |
| Item       | `T20b`, ground-truth regeneration user-approved 2026-08-08                             |
| Java       | `pfefferniels/meico@1b3711f0`, "Fix movementMap XML round-trip and rendering fidelity" |
| TypeScript | `src/mpm/elements/maps/MovementMap.ts`, `src/mpm/elements/maps/data/MovementData.ts`   |

This is a divergence from **upstream cemfi/meico**, not from the reference the port is verified
against: the fork fixed five things about `movementMap`, the port mirrors all five, and the
Java-generated reference fixtures were **regenerated from the fixed fork** so that the
equivalence suite tests the corrected behaviour.

1. `MovementData`'s XML constructor reads `controller` as a plain, no-namespace attribute.
2. `addMovement(MovementData)` serializes `controller` (after `protraction`, before `xml:id`).
3. `getMovementDataOf` parses `curvature`, `protraction` and `controller`.
4. The movement sampling step became a knob instead of a literal (see D1 below).
5. The reference generator's movement cases use normalized 0..1 positions — see
   ARCHITECTURE.md §7 for the double-scaling bug this uncovered (fixtures had stored
   16129 = 127 × 127).

**Ground-truth provenance.** Every `tests/integration/fixtures/**` file involving movement
derives from `meico@1b3711f0`. A durable snapshot of the same changes as a patch on the
preceding commit `450193e4` exists at
`/Users/nielspfeffer/Projects/mpmify/ml/patches/meico-movement-fixes-on-450193e4.patch`,
sha256 `3c5fc1b22b5f0312b649bd33e0ac85d31bc36d43759fd005ed287c81ac9704f5`.

**D1, a structural sub-divergence with no behavioural effect.** Java's fix added a mutable
static `MovementMap.movementSampleMaxStep = 0.1`. Shared mutable statics are prohibited by the
immutability policy (ARCHITECTURE.md RULE I5), so the port moved the knob to
`RenderOptions.movementSampleMaxStep` (`src/mpm/RenderOptions.ts`), reachable from the facade as
`PerformOptions.movementSampleMaxStep`. The default is unchanged and every fixture is generated
with it, so output is byte-identical. **Corollary for anyone regenerating fixtures: leave the
Java static at its default**, or the references stop matching.

### #3 — `Msm.getMinimalPPQ`: a port bug fixed _toward_ Java

|            |                                                            |
| ---------- | ---------------------------------------------------------- |
| Item       | `T9b`                                                      |
| Java       | `Msm.java:254-279` (integer division at `:262` and `:270`) |
| TypeScript | `src/msm/Msm.ts`                                           |

A divergence discovered in the port and closed, not opened. Java declares both `ppq` and
`subdivs` as `int` (`:255`, `:261`, `:269`), so `ppq / subdivs` truncates; the port used float
division, which agrees with Java only while `subdivs` divides `ppq` evenly — exactly the region
the five pre-existing unit tests lived in. With ppq 720 and duration 22, Java returns 32 and the
port returned 1. Fixed with `Math.trunc` at both sites; every expected value in the seven added
tests was produced by **running the Java arithmetic** (a standalone replica of `Msm.java:254-279`
compiled and run with `javac`/`java`), not by observing the TypeScript.

The method has **zero callers in `src/`** — Java's only caller is `exportPitches`, which is out
of scope and was removed — so no fixture path could reach the change.

---

## 2. Frozen divergences

Known, journaled, and deliberately **not** repaired. Every one is confined to a malformed-input
or unreachable path; repairing them would change behaviour on inputs the reference handles
differently, with no fixture to prove the change safe.

| #   | Divergence                                                                                                                                                                                                | Where                                                                                                                                                    | Why frozen                                                                                                          |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| P1  | `parseFloat` yields `NaN` where Java's `Double.parseDouble` **throws**, so a malformed `value="abc"` produces a `NaN`-valued def that is _kept_, where Java's factory returns null and the style skips it | every `parseFloat` in the port; found in `TempoDef`, `DynamicsDef`, `RubatoDef`, `AccentuationPatternDef` and all 12 `ArticulationDef` attributes ([T6]) | codebase-wide; no fixture exercises it; fixing it changes output on malformed input                                 |
| P2  | `getPreviousPosition` yields 0 where Java throws a `NullPointerException` on a `<movement>` with no `transition.to`                                                                                       | `src/mpm/elements/maps/MovementMap.ts:120-132` ([T7])                                                                                                    | same family as P1                                                                                                   |
| P4  | `RandomNumberProvider.getValue(NaN)` recurses to a stack overflow and `getValue(Infinity)` hangs                                                                                                          | `src/supplementary/RandomNumberProvider.ts` ([T4])                                                                                                       | **present identically in Java** — this is bug-for-bug, not a divergence in behaviour, only in how alarming it looks |

Three smaller ones, all from capability gaps in the XML layer rather than from choices:

- **The `setLocalName` family.** Java renames an element in place when parsing a foreign one
  (`GenericMap.setType`, `ImprecisionMap.setDomain`, and the `tempoDef` / `rubatoDef` /
  `articulationDef` factories). The XomTypes layer has no `setLocalName` — xmldom nodes cannot
  be renamed in place — so a def parsed from a differently named element keeps that name and
  serializes under it. All five sites carry a `PARITY NOTE`; none is reachable from the
  MEI/MSM ⇒ MIDI pipeline, since the styles only ever feed the factories correctly named
  children.
- **`RelatedResource.setType` whitespace class.** Mirrors `RelatedResource.java:110`'s
  `replaceAll("\\s+", "")`, but JavaScript's `\s` also matches non-ASCII whitespace (NBSP,
  U+2028, …) where Java's default `\s` is the six ASCII characters. A type containing exotic
  whitespace would be stripped here and kept there. Same family as P1; no fixture reaches it.
- **Global ornamentation guard.** `Performance.renderGlobalOrnamentation` tests only for null
  where `OrnamentationMap.java:215` tests `(map == null) || map.isEmpty()`, so an _empty_ global
  `ornamentationMap` reaches the render path here and returns early there. Benign and reasoned
  through at the site: with no ornament entries the apply loop runs zero times, and the one
  observable difference (an error logged when neither header is set) cannot occur for a global
  map, because a `Global` always has a `Header`.

---

## 3. Bug-for-bug preservations

Java behaviours that look like defects, are defects, and are reproduced exactly. **Do not "fix"
these** — each one is load-bearing for the reference fixtures, and several are pinned by unit
tests that assert the wrong-looking value on purpose.

### `AccentuationPatternDef.getAccentuationAt` — the segment-end bug

`AccentuationPatternDef.java:317` / `src/mpm/elements/styles/defs/AccentuationPatternDef.ts:222`.
`segmentEnd` is meant to become the _next_ accentuation's beat, so that each transition ramps to
its own segment's end. The guard that would do it reads `i > this.accentuations.length - 1`, but
the loop starts at `length - 1` and only counts down, so **the condition can never hold**.
`segmentEnd` therefore stays at `length + 1.0` and every ramp runs to the end of the whole
pattern, flattening the interpolation of all but the last accentuation. The intended test was
presumably `i < this.accentuations.length - 1`; the Java comment on that line ("if it is between
two accentuations") says as much.

Corroborated three ways ([T6] verifier): the method is byte-identical to its pre-refactor form,
the istanbul branch map still shows the guard as a **dead branch**, and a negative control that
"fixes" the one character moves the fixture pipeline's hashes.

### `ArticulationData` duration modifiers overwrite, they do not compose

`src/mpm/elements/maps/data/ArticulationData.ts:145-153`. `duration` is read **once**, up front,
and every branch computes from that original value rather than from what the previous branch
wrote — so `absoluteDuration`, `relativeDuration` and `absoluteDurationChange` do not compose;
the last one to fire simply overwrites. This survived DELIBERATE DIVERGENCE #1 intact (the
guard tests the hoisted local, and the attribute is deliberately not re-read) and a unit test
pins it: `relativeDuration=0.5` plus `absoluteDurationChange=-70` on `duration.perf=200` yields
**130**, computed from the original 200, not from the 100 that `relativeDuration` just wrote.

### Off-by-one loop bounds, both kept

- `MovementMap.getPreviousPosition` runs `j > 0`, not `j >= 0`, so **entry 0 is never
  examined**: a movement inheriting its position from the very first entry in the map gets 0
  instead of that entry's `transition.to` (`MovementMap.java:200`).
- `TempoMap.getTempoDataAt` runs down to `-1`, not to `0` (`TempoMap.java:181`). The extra round
  calls `getTempoDataOf(-1)`, which returns null immediately — one wasted call rather than a
  bug, kept for parity.

### Two Java typos in `Mpm.isInNamespace`

`Mpm.java:214` has `'accentuation '` **with a trailing space**, and `Mpm.java:218` misspells
`dynamicsGradient` as `'dynamcisGradient'`. Both are reproduced verbatim, because "fixing"
either would accept a name the reference rejects and reject one it accepts.

`tests/mpm/Mpm.test.ts` pins all four facts — both misspellings accepted, both corrections
rejected — so a well-meaning edit to the vocabulary fails the suite. That guard is newer than the
preservation it protects: until T22 the only evidence was a scratch-tree probe from [T8], and
correcting both typos passed the full suite. It now fails exactly this test.

### `TempoData.clone` omits `startDateMilliseconds`

Java's `TempoData.clone()` omits it too. It is scratch space that `TempoMap.renderTempoToMap`
fills in per rendering pass, so a clone is expected to start out without it; copying it would
diverge.

---

## 4. Nondeterminism — why some outputs are never byte-compared

Not divergences, but part of the equivalence claim's shape, and the reason two fixture families
are excluded from byte comparison.

- **Imprecision rendering is nondeterministic even with a fixed seed.** Where two imprecision
  offsets land on the same `milliseconds.date`, the interior picks which one keeps its value
  with a bare `Math.random()` and re-rolls the rest through an unseeded generator — faithfully,
  from `ImprecisionMap.java:845,894`. A seeded render is therefore reproducible only while no
  two offsets share a date, which for polyphonic input is often false. The facade's
  `PerformOptions.seed` documents exactly this. **Never add byte comparison for imprecision
  output** (charter rule); the suite excludes it, as do all pipeline probes.
- **Generated `meico_<uuid>` identifiers** differ per run by construction. The equivalence
  suites canonicalize them by first-occurrence order, which is stronger than deleting them: it
  keeps `goto` → `marker` wiring verifiable. Keep ID-generation call order stable, or the tests
  will say so.

---

## 5. What is _not_ a divergence

Two behaviours that reliably read as bugs on first encounter and are neither:

- **The last movement in a `movementMap` is not rendered** (`movementIndex < size() - 1`). A
  movement is a transition _towards_ the next one, so the final entry has no span to cover and
  only serves as the target the previous transition aims at. Movements at a negative date are
  skipped as well.
- **The library logs to the console during conversion and rendering**, including
  `Failed to convert dynamics string "-" to double.` on perfectly ordinary input. That is
  Java's logs-and-returns-null error policy (ARCHITECTURE.md RULE E1), reproduced deliberately;
  the interior never throws where Java logs. The facade is the layer that converts interior
  failure into typed errors — see `src/api/errors.ts`.
