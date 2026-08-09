# Parity ledger

espressivo is a TypeScript port of [meico](https://github.com/cemfi/meico) whose acceptance
criterion is not "works correctly" but **"produces the same bytes the Java reference produces"**.
Where correctness and equivalence disagree, equivalence wins — a port that silently improves on
its reference cannot be verified against it.

That rule has one carve-out, added on the maintainer's instruction in August 2026: an **obvious
bug** gets fixed rather than reproduced, provided the fix is proven not to move the bytes of any
reference fixture. Everything below is therefore one of four things — a bug fixed under that
carve-out (§1), one whose fix is approved but waits on the reference being patched first (§2), a
difference deliberately left in place (§3, §4), or a behaviour that reads as a bug and is not
(§6). Nothing is undocumented, and this file is the audit trail for
[README.md](README.md#equivalence-with-java-meico)'s equivalence claim.

Java citations are `File.java:line` in
[pfefferniels/meico](https://github.com/pfefferniels/meico) (a fork of cemfi/meico); TypeScript
citations are paths in this repository. The refactor journal entries referenced as `[T…]` live
in `refactor/log.md`.

**The evidence standard every "fixed" entry below meets.** A pipeline byte-probe — 5 deterministic
all-maps fixtures and all 16 MEI fixtures, each through MSM, MPM, augmented MSM, raw MIDI and
expressive MIDI, with generated UUIDs canonicalized — produces a transcript hash of
`169e964bd492bc6a256cea4cea9cfab748c0502da289bc4be03892ae7b726c1e`. Every fix here was measured on
a clean build against a clean build of the commit before it and **left that hash unchanged**. A
fix that moves it is not shipped; §2 holds the one that does.

---

## 1. Fixed bugs

Each of these was a defect in the Java reference or in the port. Each is fixed, guarded by tests
that fail if the fix is reverted, and proven not to touch fixture bytes.

### `ArticulationData.articulateNote` no longer hangs

|                           |                                                          |
| ------------------------- | -------------------------------------------------------- |
| Item                      | `TD1`, approved 2026-08-08 (ARCHITECTURE.md §6.3 row P3) |
| Java                      | `ArticulationData.java:197`                              |
| TypeScript                | `src/mpm/elements/maps/data/ArticulationData.ts:193-215` |
| Guard tests               | `tests/mpm/elements/ArticulationMap.test.ts`             |
| Reachable from a fixture? | No — no fixture carries `absoluteDurationChange`         |

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

This one was repaired long before the others because it hangs the renderer on **well-formed**
MPM: a document using `<articulation absoluteDurationChange="…">` produces no output and no
error, forever.

**Second observable consequence, stated so it is not discovered later.** The branch ends with
`addToListAttribute(note, 'modified', …)`, which `ArticulationDef`'s equivalent does not have.
It now sits _inside_ the guard, so a note with `duration.perf <= 0` and a non-zero
`absoluteDurationChange` no longer gets its `modified` list entry. That is serialization-visible
and deliberate: announcing a modification on a note whose duration was provably not touched is
worse. Two unit tests assert the absence directly, so the choice is pinned rather than
incidental.

**Evidence** ([TD1] entries): zero fixtures reach the branch
(`grep -rl absoluteDurationChange tests/integration/fixtures` ⇒ 0 files); the pipeline probe
hash is unchanged on both sides; and three negative controls, of which the decisive one is that
the comparison-only fix (`<=` without the guard) passes every other assertion and **still hangs**.

### `Msm.getMinimalPPQ` — a port bug fixed _toward_ Java

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

### The movement fixes, mirrored from the Java fork

|            |                                                                                        |
| ---------- | -------------------------------------------------------------------------------------- |
| Item       | `T20b`, ground-truth regeneration approved 2026-08-08                                  |
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

### The two Java typos in `Mpm.isInNamespace` are now accepted in both spellings

|             |                                                    |
| ----------- | -------------------------------------------------- |
| Item        | `TD2`                                              |
| Java        | `Mpm.java:214` and `Mpm.java:218`                  |
| TypeScript  | `src/mpm/Mpm.ts`, the `isInNamespace` switch       |
| Guard tests | `tests/mpm/Mpm.test.ts`, the `isInNamespace` block |

`Mpm.java:214` has `'accentuation '` **with a trailing space** and `Mpm.java:218` misspells
`dynamicsGradient` as `'dynamcisGradient'`, so the reference rejects both correct spellings.
The port now accepts **all four**: the corrections, because they are the names every schema and
every other tool writes, and the misspellings, because a document written by Java meico may
legitimately carry them.

Accepting both directions is what makes this safe. The vocabulary is a strict **superset** of
the reference's, so no name the reference accepts is rejected here; the only behavioural change
is that two names the reference wrongly rejected are now recognized. Deleting either typo would
be a regression, and a comment at each case label says so.

**Why the byte-probe is not the interesting evidence here.** `isInNamespace` has **zero callers
in `src/`** — it is a public utility for consumers of the library, and nothing in the MEI/MSM ⇒
MIDI pipeline consults it. The probe hash is unchanged, necessarily. Two tests carry the weight
instead: one asserts all four spellings are accepted, the other that near-misses
(`'accentuation  '`, `'dynamicsGradiant'`, …) are still rejected, so "accept both spellings"
cannot decay into "accept anything close". The first of those replaced a T22 test that pinned
the corrections as _rejected_ — that inversion is the deliberate half of this entry.

### P1 — malformed numeric attributes skip the def instead of producing a `NaN`-valued one

|             |                                                                                                                                                                |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Item        | `TD2` (ARCHITECTURE.md §6.3 row P1, found in [T6])                                                                                                             |
| Java        | `TempoDef.java:88`, `DynamicsDef.java:88`, `RubatoDef.java:135,148,153-154`, `AccentuationPatternDef.java:113,122-136,198-212`, `ArticulationDef.java:100-133` |
| TypeScript  | `src/supplementary/parseJavaDouble.ts` and the five def classes that call it                                                                                   |
| Guard tests | `tests/supplementary/parseJavaDouble.test.ts` + a malformed-input block in each of the five def test files                                                     |

`parseFloat` and `Double.parseDouble` agree about numbers and disagree about **failure**.
`parseFloat('abc')` is `NaN` and `parseFloat('12abc')` is `12`; Java throws
`NumberFormatException` for both, its `create*Def` factory catches that, logs and returns null,
and the enclosing style skips the def. The port kept a def whose value was `NaN`, which then
propagated silently into rendered tempo, dynamics, rubato and articulation.

The five def classes now read every numeric attribute through `parseJavaDouble`, which
implements the grammar published by `Double.valueOf`'s javadoc and throws `NumberFormatError`
otherwise. Nothing else about the parse paths changed, so a malformed def reaches exactly the
`catch` that Java's does and is skipped the same way. `AccentuationPatternDef.addAccentuationFromXml`
is the one site with no factory above it, and it propagates to its caller — which is what Java's
unchecked exception does from `addAccentuation(Element)`.

**One residual difference, chosen deliberately.** A hexadecimal float literal (`0x1.8p1`) is
legal input to `Double.parseDouble` and is rejected here, because accepting it needs a
hand-written decoder and no tool in this ecosystem emits one. Conversely `Number()` would have
accepted `0x10`, `0b101` and `0o17`, which Java rejects; the grammar check keeps those out. Both
directions are pinned by tests. `NaN` and `Infinity` spelled out as words are accepted, because
Java accepts them too — rejecting them would be a new divergence rather than a repair.

Every fixture is well-formed, so the probe hash is unchanged.

**Not covered by this entry**, and still `parseFloat`: the numeric reads in the map and data
classes, the render-time reads in `ArticulationDef.articulateNote` / `TemporalSpread` /
`DynamicsGradient`, and the def classes P1 did not name (`OrnamentDef`, `TemporalSpread`,
`DynamicsGradient`). Those are the same family and remain open — see the [TD2] worker entry's
DISCOVERED note.

### P2 — a movement that cannot inherit a position is skipped, not placed at 0

|             |                                                                        |
| ----------- | ---------------------------------------------------------------------- |
| Item        | `TD2` (ARCHITECTURE.md §6.3 row P2, found in [T7])                     |
| Java        | `MovementMap.java:200`                                                 |
| TypeScript  | `src/mpm/elements/maps/MovementMap.ts`, `getPreviousPosition`          |
| Guard tests | `tests/mpm/elements/MovementMap.test.ts`, "position inheritance" block |

A `<movement>` with no `position` inherits the preceding movement's `transition.to`. If that
preceding movement has no `transition.to` either, Java dereferences null and throws a
`NullPointerException` that aborts the entire render; the port silently used **0**, placing the
movement at "fully released" as though that were a real reading — a wrong pedal position
rendered into the MIDI with no signal that anything was missing.

Neither behaviour is defensible, so `getPreviousPosition` now returns null for that case and
`getMovementDataOf` logs and returns null, skipping **that one movement** while the rest of the
map renders. This is the interior's house policy for malformed input (ARCHITECTURE.md RULE E1,
logs-and-returns-null) and the same shape the def factories use, which is why it was preferred
over a typed throw: an aborted render is Java's behaviour and is worse than a skipped movement.

Note what did **not** change: the `j > 0` scan still never examines entry 0 (§4).

### P4 — `RandomNumberProvider` rejects an index it cannot serve

|             |                                                                          |
| ----------- | ------------------------------------------------------------------------ |
| Item        | `TD2` (ARCHITECTURE.md §6.3 row P4, found in [T4]/[T9])                  |
| Java        | present identically in `RandomNumberProvider.java` — this fixes both     |
| TypeScript  | `src/supplementary/RandomNumberProvider.ts`, `requireUsableIndex`        |
| Guard tests | `tests/supplementary/RandomNumberProvider.test.ts`, "index guards" block |

`getValue` and `getValueDouble` now reject a non-finite index, or one above
`RandomNumberProvider.MAX_INDEX` (10 million), with `OutOfRangeError`. The realistic route in is
arithmetic rather than a hand-written call: `ImprecisionMap` computes its index as
`milliseconds.date / millisecondsTimingBasis`, so one malformed date is enough.

**The rejected inputs did not all misbehave in the same way, and one of them did not misbehave at
all.** Measured on the unguarded build, Node 23.8:

| index       | unguarded behaviour                                                                                                                | guarded             |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| `NaN`       | `getValue` and `getValueDouble` call each other until the stack overflows — `RangeError: Maximum call stack size exceeded`         | `OutOfRangeError`   |
| `Infinity`  | draws and memoises without bound for ~3.4 s, then a bare `RangeError: Invalid array length`                                        | `OutOfRangeError`   |
| `1e12`      | same, ~1.9 s                                                                                                                       | `OutOfRangeError`   |
| `-Infinity` | **not pathological**: `Math.max(0, -Infinity)` is 0, so `getValue` returns `series[0]` in ~1 ms and `getValueDouble` returns `NaN` | `OutOfRangeError`   |
| `MAX_INDEX` | returns, 178 ms / 236 MB                                                                                                           | returns, same value |

The `-Infinity` row is the one worth stating plainly, because it is a behaviour change that was
not a repair of a crash: an infinite index used to quietly mean "the first value in the series",
and now it is an error. That is deliberate. A wrong answer dressed as a right one is worse than a
failure, the caller cannot tell the two apart, and the same arithmetic that produces `Infinity`
produces `-Infinity`. Testing `Number.isFinite` is also the honest spelling of the precondition —
screening only for the two loud failure modes would have left the quiet one in place.

`MAX_INDEX` is drawn from the cost curve rather than chosen: 10^7 costs 178 ms and 236 MB, 10^8
costs 1.7 s and 1.5 GB, and 10^9 spends 1.9 s allocating before V8 refuses to grow the array. The
limit sits at the last value that is merely expensive; at the default 100 ms timing basis it
stands for about eleven days of music, where a real document reaches an index in the hundreds.

For the record, the inherited description of this bug ([T4], ARCHITECTURE.md §6.3) says it
"hangs". On this runtime it does not: it allocates for a few seconds and then dies with an
untyped `RangeError`. The table above is what a re-run reproduces.

**The guards are pure preconditions, and that is the load-bearing claim**, because the number and
order of draws _is_ the rendered performance ([T4]). They allocate nothing, draw nothing and
touch no field. Proven rather than argued: a probe drawing 7,673 values across all five
distributions at three seeds — plus fractional, negative and zero indices — hashes identically on
the unguarded and guarded builds
(`82697d7bf7787eef7b28eff44b7933a5c699354df942001f8907538632bf0a46`). A unit test additionally
asserts that a rejected call leaves the following sequence bit-identical to a fresh provider's.

This diverges from Java deliberately, in the same direction as `TD1`: unusable-on-input beats
hangs-or-overflows.

---

## 2. Approved, pending ground-truth regeneration

One bug is **approved for repair and not yet shipped**, because fixing it in the port alone would
put the port out of agreement with the reference on a fixture that exists. It is listed separately
from §1 and from §4 on purpose: it is neither fixed nor preserved.

### `AccentuationPatternDef.getAccentuationAt` — the segment-end bug

|            |                                                                                                                                                          |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Status     | **FIX APPROVED, pending Java-side patch + ground-truth regeneration (`TD3`)**                                                                            |
| Java       | `AccentuationPatternDef.java:317`                                                                                                                        |
| TypeScript | `src/mpm/elements/styles/defs/AccentuationPatternDef.ts` — `getAccentuationAt` at `:262`, the guard to correct at `:273`; both unchanged, comment intact |
| Blocked by | `tests/integration/fixtures/all-maps-reference/metrical_accentuation_augmented.msm`                                                                      |

`segmentEnd` is meant to become the _next_ accentuation's beat, so that each transition ramps to
its own segment's end. The guard that would do it reads `i > this.accentuations.length - 1`, but
the loop starts at `length - 1` and only counts down, so **the condition can never hold**.
`segmentEnd` therefore stays at `length + 1.0` and every ramp runs to the end of the whole
pattern, flattening the interpolation of all but the last accentuation. The intended test was
`i < this.accentuations.length - 1`; the Java comment on that line ("if it is between two
accentuations") says as much.

**Why it is not simply fixed here, measured rather than argued.** The one-character correction —
`i < this.accentuations.length - 1` — was applied on a scratch tree and put
through the pipeline probe: the transcript hash moves from `169e964b…` to
`63c7faa5485217e78dc214b439a5b0ec106a5901b2728d4f509368810580921c`, with exactly one differing
entry — the `metrical_accentuation` all-maps fixture. Its Java-generated ground truth
`tests/integration/fixtures/all-maps-reference/metrical_accentuation_augmented.msm` stores
`velocity="100.0003471017008"`, which is `100 + 1/2881` — the buggy `segmentEnd` of
`length + 1 = 2881`. The corrected code produces `100.00138888888888`, which is `100 + 1/720`,
the next accentuation's beat. **The reference fixture pins the bug**, so fixing it would put the
port out of agreement with the reference on a document that exists.

Note for anyone who re-runs this: the full suite stays **green** with the fix applied, because
`tests/integration/all-maps-equivalence.test.ts` compares numeric attributes with a tolerance of
0.01 and the divergence is 0.00104. A green verify is therefore _not_ evidence that this fix is
safe. The istanbul branch map is not either — it shows the guard as a dead branch, which proves
only that the _buggy_ condition never fires, not that no fixture reaches the _fixed_ one.

**What happens next.** The repair is the `T20b` pattern: patch the Java fork,
regenerate the affected ground truth from it, then apply the one-character change here — three
steps that have to land together, which is why they are their own gated item rather than a
sub-round of `TD2`. Until `TD3` lands, the port keeps the buggy spelling, and the site comment in
`AccentuationPatternDef.ts` still says so.

---

## 3. Frozen divergences

Known, journaled, and deliberately **not** repaired. All three come from capability gaps in the
XML layer rather than from choices, and none is reachable from the MEI/MSM ⇒ MIDI pipeline.

- **The `setLocalName` family.** Java renames an element in place when parsing a foreign one
  (`GenericMap.setType`, `ImprecisionMap.setDomain`, and the `tempoDef` / `rubatoDef` /
  `articulationDef` factories). The XomTypes layer has no `setLocalName` — xmldom nodes cannot
  be renamed in place — so a def parsed from a differently named element keeps that name and
  serializes under it. All five sites carry a `PARITY NOTE`; none is reachable, since the
  styles only ever feed the factories correctly named children.
- **`RelatedResource.setType` whitespace class.** Mirrors `RelatedResource.java:110`'s
  `replaceAll("\\s+", "")`, but JavaScript's `\s` also matches non-ASCII whitespace (NBSP,
  U+2028, …) where Java's default `\s` is the six ASCII characters. A type containing exotic
  whitespace would be stripped here and kept there. No fixture reaches it. (`parseJavaDouble`
  deliberately avoids adding a second instance of this class — it trims Java's `[\x00-\x20]`
  by character code rather than calling `String.trim`.)
- **Global ornamentation guard.** `Performance.renderGlobalOrnamentation` tests only for null
  where `OrnamentationMap.java:215` tests `(map == null) || map.isEmpty()`, so an _empty_ global
  `ornamentationMap` reaches the render path here and returns early there. Benign and reasoned
  through at the site: with no ornament entries the apply loop runs zero times, and the one
  observable difference (an error logged when neither header is set) cannot occur for a global
  map, because a `Global` always has a `Header`.

---

## 4. Bug-for-bug preservations

Behaviours that look like defects and are reproduced anyway. Unlike §2's entry these are not
queued for repair: either the Java source leaves the intent genuinely ambiguous, or the "defect"
costs nothing. Several are pinned by unit tests that assert the wrong-looking value on purpose.

### `ArticulationData` duration modifiers overwrite, they do not compose

`src/mpm/elements/maps/data/ArticulationData.ts:145-153`. `duration` is read **once**, up front,
and every branch computes from that original value rather than from what the previous branch
wrote — so `absoluteDuration`, `relativeDuration` and `absoluteDurationChange` do not compose;
the last one to fire simply overwrites.

This one is preserved on **design-intent grounds rather than fixture grounds**, which is what
separates it from §1's entries: composing the modifiers is a defensible reading of the MPM
specification and so is overwriting them, and nothing in the Java source says which was meant.
A "fix" would be an interpretation, not a repair. It survived the `TD1` divergence intact (the
guard tests the hoisted local, and the attribute is deliberately not re-read) and a unit test
pins it: `relativeDuration=0.5` plus `absoluteDurationChange=-70` on `duration.perf=200` yields
**130**, computed from the original 200, not from the 100 that `relativeDuration` just wrote.

### Off-by-one loop bounds, both kept

- `MovementMap.getPreviousPosition` runs `j > 0`, not `j >= 0`, so **entry 0 is never
  examined**: a movement inheriting its position from the very first entry in the map gets 0
  instead of that entry's `transition.to` (`MovementMap.java:200`). Untouched by §1's P2 fix,
  which changes only what happens when the entry that _is_ examined has no `transition.to`, and
  pinned by its own test so the two cannot be confused.
- `TempoMap.getTempoDataAt` runs down to `-1`, not to `0` (`TempoMap.java:181`). The extra round
  calls `getTempoDataOf(-1)`, which returns null immediately — one wasted call rather than a
  bug, kept for parity.

### `TempoData.clone` omits `startDateMilliseconds`

Java's `TempoData.clone()` omits it too. It is scratch space that `TempoMap.renderTempoToMap`
fills in per rendering pass, so a clone is expected to start out without it; copying it would
diverge.

---

## 5. Nondeterminism — why some outputs are never byte-compared

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

## 6. What is _not_ a divergence

Two behaviours that reliably read as bugs on first encounter and are neither:

- **The last movement in a `movementMap` is not rendered** (`movementIndex < size() - 1`). A
  movement is a transition _towards_ the next one, so the final entry has no span to cover and
  only serves as the target the previous transition aims at. Movements at a negative date are
  skipped as well.
- **The library logs to the console during conversion and rendering**, including
  `Failed to convert dynamics string "-" to double.` on perfectly ordinary input. That is
  Java's logs-and-returns-null error policy (ARCHITECTURE.md RULE E1), reproduced deliberately;
  the interior never throws where Java logs. The facade is the layer that converts interior
  failure into typed errors — see `src/api/errors.ts`. The two interior errors §1 introduces do
  not weaken that rule: `NumberFormatError` is thrown exactly where Java throws, and
  `OutOfRangeError` only for an index no series can have.
