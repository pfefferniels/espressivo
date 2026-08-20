# Parity ledger

espressivo is a TypeScript port of [meico](https://github.com/cemfi/meico) whose acceptance
criterion is not "works correctly" but **"produces the same bytes the Java reference produces"**.
Where correctness and equivalence disagree, equivalence wins — a port that silently improves on
its reference cannot be verified against it.

That rule has one carve-out, added on the maintainer's instruction in August 2026: an **obvious
bug** gets fixed rather than reproduced, provided the fix is proven not to move the bytes of any
reference fixture — or, where it does, provided the Java fork is patched and the affected ground
truth regenerated in the same step, so the port is never silently ahead of its reference.
Everything below is therefore one of four things — a bug fixed under that carve-out (§1), a
difference deliberately left in place (§2, §3), a behaviour that reads as a bug and is not
(§5), or a feature measured against a Java baseline the reference fork predates (§8). Nothing is
undocumented, and this file is the audit trail for
[README.md](README.md#equivalence-with-java-meico)'s equivalence claim.

**Two parts of the library are outside that frame entirely**, and each is separated out for
exactly that reason. The **expression module** (§7) implements a feature the Java reference does
not have at all, and is the shorter of the two: it transforms an MPM rather than applying one, and
touches no path the equivalence suites drive.

The other is **MPM v3 ornamentation** (§6), which implements a specification the Java reference does
not implement, so there is no output to be equivalent to. Its correctness standard is the spec plus
hand-computed vectors, not a reference file. Every fixture file in `tests/integration/fixtures/`
is untouched by it, and on the path the equivalence suites drive — `Mei2MsmMpmConverter` built
directly, which is where their references come from — nothing in §6 moves a byte, measured rather
than argued. There is exactly one place where §6 does change output against a Java reference, and
it is a default rather than a divergence: through the **facade**, `composite_advanced.mei`'s
`<trill>` becomes an ornament the reference has no counterpart for. §6.5 states that in full, and
states what makes the two paths agree again.

Java citations are `File.java:line` in
[pfefferniels/meico](https://github.com/pfefferniels/meico) (a fork of cemfi/meico); TypeScript
citations are paths in this repository. The refactor journal entries referenced as `[T…]` live
in `docs/history/refactor/log.md`.

**The evidence standard every "fixed" entry below meets.** A pipeline byte-probe — 5 deterministic
all-maps fixtures and all 16 MEI fixtures, each through MSM, MPM, augmented MSM, raw MIDI and
expressive MIDI, with generated UUIDs canonicalized — produces a transcript hash of
`169e964bd492bc6a256cea4cea9cfab748c0502da289bc4be03892ae7b726c1e` through the `TD2` wave. Every
fix here was measured on a clean build against a clean build of the commit before it, and all but
one **left that hash unchanged**.

The exception is the segment-end fix (`TD3`), which moves it by construction — it changes rendered
velocities. A fix in that class is shipped only with the reference moved underneath it in the same
step: the Java fork is patched, the affected ground truth is regenerated from the patched fork, and
the port's agreement with the _new_ reference is then measured directly. `TD3`'s entry below states
what that measurement returned, and the standing hash from `TD3` onwards is
`6e0124f58aa5375e7123d860d35d5116a52470efe1db7175159b9b2076d7b24b`.

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

Note what did **not** change: the `j > 0` scan still never examines entry 0 (§3).

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

### `AccentuationPatternDef.getAccentuationAt` — the segment-end bug

|                           |                                                                                                                                       |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Item                      | `TD3`, ground-truth regeneration approved 2026-08-09                                                                                  |
| Java                      | `pfefferniels/meico@1d662105`, "Fix getAccentuationAt segment-end selection (dead condition)" — `AccentuationPatternDef.java:316-320` |
| TypeScript                | `src/mpm/elements/styles/defs/AccentuationPatternDef.ts` — `getAccentuationAt` at `:261`, the corrected guard at `:272`               |
| Guard tests               | `tests/mpm/elements/styles/defs/AccentuationPatternDef.test.ts`, `tests/mpm/elements/styles/Styles.test.ts`                           |
| Reachable from a fixture? | **Yes** — `metrical_accentuation` and `all_maps`, both regenerated                                                                    |

`segmentEnd` is meant to become the _next_ accentuation's beat, so that each transition ramps to
its own segment's end. Upstream's guard reads `i > this.accentuations.size() - 1`, but the loop
starts at `size - 1` and only counts down, so **the condition can never hold**. `segmentEnd`
therefore stayed at `length + 1.0` and every ramp ran to the end of the whole pattern, flattening
the interpolation of all but the last accentuation. The Java comment on that line — "if it is
between two accentuations" — describes the test the code fails to make.

**The asymmetry in the fix is deliberate, and is the part worth reading twice.** Only an
accentuation that _has_ a successor gets the next one's beat; for the **last** accentuation the
guard does not fire and `segmentEnd` keeps `length + 1.0`, so the final segment still ramps to the
pattern end. That is not an oversight left in the correction — it is what `i < size - 1` means, and
the fork's probe (`mpmify/ml/java/AccentFixProbe.java`) prints the same
`0.05547850208044383` = 40/**721** for the last segment before and after the patch, where 721 is
`2880 + 1 - 2160` and not `2880 - 2160`. A "tidier" fix that also moved the last segment's end
would diverge from the reference.

**Why this one needed the fork patched first.** Unlike every other entry in §1, this fix moves
fixture bytes, and the pre-existing ground truth stored the _buggy_ value:
`all-maps-reference/metrical_accentuation_augmented.msm` contained `velocity="100.0003471017008"`
= `100 + 1/2881`, against the corrected `100.00138888888888` = `100 + 1/720`. So the repair is the
`T20b` pattern — patch the fork, regenerate, mirror — landing as one gated item. The Java side is
`meico@1d662105`; the ground truth was regenerated from that commit by `GenerateAllMapsReference`.

**What the regeneration moved, categorized.** Of the 40 generated all-maps files, 23 were
byte-identical, 13 differed only in UUIDs, two were the charter-exempt nondeterministic
`imprecision_timing_augmented.msm` and `imprecision_timing_expressive.mid`, and exactly **two**
carried a semantic change — and in both it was `note@velocity` and nothing else:

- `metrical_accentuation_augmented.msm`: four distinct values, `100 + k/2881` → `100 + k/720` for
  k = 1..4 (the pattern's anchors are 720 ticks apart).
- `all_maps_augmented.msm`: eight values, each moved by exactly `k/720 - k/2881` for k = 1..4,
  matching to within 1e-14. `all_maps` carries its own four-anchor pattern, so it is the same bug
  in a second document.

Both were confirmed to be the fix rather than run-to-run noise by generating twice from the same
classes (identical apart from UUIDs) and once from a rebuilt pre-fix `AccentuationPatternDef`
(reproducing exactly the committed values).

**Agreement with the new reference, measured.** Running the equivalence gate's own comparison over
all eight all-maps fixtures, the maximum absolute deviation between the port and the regenerated
Java reference across the 863 attributes it compares is **exactly 0** — the suite passes even with
the tolerance set to zero. Reverting the one character reintroduces eight `note@velocity`
diffs of 1.04e-3 to 4.17e-3 in `metrical_accentuation`.

**The tolerance blind spot this bug exposed, stated because it outlived the bug.**
`tests/integration/all-maps-equivalence.test.ts` compares numeric attributes with a tolerance of
**0.01**, and the largest divergence this bug produced is 4.17e-3. The **equivalence gate** is
therefore green on a tree with the bug reintroduced and the corrected ground truth in place —
measured, not hypothesized. A green verify was never evidence for this fix, and the istanbul branch map was
not either: it showed the guard as a dead branch, which proves only that the _buggy_ condition
never fires, not that no fixture reaches the _fixed_ one. What does the work is the unit tests: the
same reverted tree fails four of them, in both the direct and the parse path.

### `Element.toXML` declared the default namespace on every element instead of once

`src/xml/XomTypes.ts`. The serializer emitted `xmlns="…"` for every element carrying a
namespace URI, where Java XOM emits it only where the namespace changes — in practice once, on
the root. A 2185-byte reference MPM came back out at 3527 bytes with the declaration repeated
32 times.

**It was invisible because the gate was laundering it.** `cross-validation.test.ts` carried a
normaliser that collapsed the repeats on both sides before comparing, so the suite compared a
cleaned-up version of our output rather than our output. The normaliser has been deleted and
the suite now compares the raw bytes; with the defect deliberately reinstated, 80 tests across
the round-trip and cross-validation suites go red, where before it went entirely unnoticed.

The rule now applied is the one XML specifies: a default-namespace declaration is emitted only
when an element's namespace differs from the one it inherits. Three consequences, the third of
which means the old behaviour was not merely verbose but wrong:

- the root of a namespaced document still declares, having inherited nothing;
- a child in its parent's namespace declares nothing;
- a child with **no** namespace inside a namespaced parent emits `xmlns=""`, undeclaring it.
  Without that the child would silently inherit its parent's namespace on reparse.

A prefixed element declares its own prefix and leaves the default namespace in scope untouched.

**One normaliser in that suite remains, and is load-bearing:** Java writes `720.0` where this
port writes `720`. Measured — removing it turns 24 of cross-validation's 48 tests red. It is
the same kind of divergence, with a blast radius across every numeric attribute in the tree
rather than one line in the serializer, and is left for its own change.

### `Attribute.detach()` was a silent no-op on everything that came out of the parser

|                           |                                                                                                                                                         |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Item                      | `TD4`                                                                                                                                                   |
| Java                      | `nu.xom.Attribute.detach()` — XOM removes the attribute from its parent unconditionally; an attribute in a parsed XOM document always knows its element |
| TypeScript                | `src/xml/XomTypes.ts` — `Element.wrap` at `:389`, the parent wiring at `:418`, `Attribute.detach` at `:264`                                             |
| Guard tests               | `tests/xml/XomTypes.test.ts` (9), `tests/mpm/elements/styles/defs/OrnamentDef.test.ts` (4), `tests/xml/AbstractXmlSubtree.test.ts` (1)                  |
| Reachable from a fixture? | **No** — no conversion or rendering path detaches a parser-sourced attribute; proven by probe, see below                                                |

A port bug, and the second half of one that was only ever half fixed. This layer emulates XOM on
top of `@xmldom/xmldom`, and it keeps its own parent pointers rather than reading the DOM's.
`Element.wrap` sets `_xomParent` on every child element and text node it creates (`:429`, `:435`)
but did not set it on the attributes it creates — while `Attribute.detach` acts only
`if (this._xomParent)`. So `detach()` on any attribute that came out of the parser did nothing at
all, silently, and the attribute stayed in the serialized XML.

The `Attribute.detach` override itself dates to the pre-refactor baseline (`62c125f`), where it
fixed the same defect for **constructed** elements: `XomNode.detach`, which it overrides, searches
child nodes only, so before that override a detached attribute survived serialization in every
case. `Element.addAttribute` sets the parent, so the override worked from the day it was written —
for attributes the code had built itself. Nothing set the parent on the parser's side, so parsed
documents kept the bug for another year. The two halves are now symmetric: **every** attribute
that sits on an element carries `_xomParent`, whichever route put it there.

**The live consequence.** `AbstractXmlSubtree.setId(null)`, and the private copies of it in
`TemporalSpread` and `DynamicsGradient`, remove an `xml:id` by detaching its attribute. For any
MPM subtree read from a file that removal did not happen: the object reported `getId() === null`
while the serialized XML still carried the old `xml:id`. The same shape reached
`Author.setNumber(null)`. All of them are fixed by the one assignment, and all are now pinned by
tests.

**Why the parent is assigned directly rather than routed through `addAttribute`.** `addAttribute`
would also set the parent, but it first removes any same-named attribute, and its lookup
(`getAttribute(name, undefined)`) matches on **local name or qualified name**. Adding a plain `id`
to an element that already carries `xml:id` therefore deletes the `xml:id` — measured, not
inferred: `addAttribute('xml:id')` then `addAttribute('id')` leaves an element with **one**
attribute, while the parser's direct push leaves both. Routing `wrap` through it would have
introduced silent attribute loss on any document with a local-name collision across namespaces.
No fixture has one (0 collisions over 10 368 attributes on 3 020 elements across all four fixture
directories), which makes it worse rather than better — an unexercised corruption is one no test
would have caught. The direct assignment also cannot reorder anything, and attribute storage order
is byte-visible in serialization.

**Evidence that fixture bytes cannot move.** The standing pipeline probe returns
`6e0124f58aa5375e7123d860d35d5116a52470efe1db7175159b9b2076d7b24b` on both builds, with the two
JSON transcripts `diff`-clean. A wider TD4-specific probe — 306 hashed checks over **88** fixture
files: MEI conversion, both reference sets performed from parsed MSM+MPM, augmented MSM, raw and
expressive MIDI, plus parse/serialize identity, `copy`, `fixDuplicateIds`, `removeAllAttributes`
and `removeAllElements` — moves **exactly** the 64 checks that detach a parsed attribute on
purpose, and not one of the other 242. On the old build those 64 all hash to the _unchanged_
document, which is the bug stated as a measurement.

### Two map reads that skipped attributes Java reads, and the fixture blind spot that hid them

|                           |                                                                                                                                                                                                                         |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Item                      | `E1`/`E2` — reported from outside the refactor programme, by the mpmify v4 data-generation campaign                                                                                                                     |
| Java                      | `ArticulationMap.java:310-356`, `DynamicsMap.java:344-350`                                                                                                                                                              |
| TypeScript                | `src/mpm/elements/maps/ArticulationMap.ts`, `getArticulationDataOf`; `src/mpm/elements/maps/DynamicsMap.ts`, `getDynamicsDataOf`                                                                                        |
| Guard tests               | `tests/mpm/elements/ArticulationMap.test.ts`, "reads the inline numeric modifiers" (6); `tests/mpm/elements/DynamicsMap.test.ts`, "reads curvature and protraction" (4) + "addDynamics clamps the curve parameters" (3) |
| Reachable from a fixture? | **No** — for a reason worth reading, see below                                                                                                                                                                          |

Two port bugs of the same shape: a map's `get…DataOf` stopped short of attributes its Java
counterpart reads, so the values were silently dropped on the way in.

`getArticulationDataOf` read the identifying fields and stopped. The twelve numeric modifiers an
`<articulation>` may carry itself — `absoluteVelocity`, `relativeVelocity`,
`absoluteVelocityChange`, `absoluteDuration`, `absoluteDurationChange`, `relativeDuration`,
`absoluteDelay`, `absoluteDurationMs`, `absoluteDurationChangeMs`, `absoluteDelayMs`,
`detuneCents`, `detuneHz` — were never read, so every one of them kept its neutral default and an
inline articulation rendered as the **identity**. `ArticulationData`'s own XML constructor parses
all twelve; it is simply not the path the map takes. `getDynamicsDataOf` had the same omission in
its transition branch: `curvature` and `protraction` were never read, leaving both null, so every
transition rendered on the straight Bézier whatever curve the document asked for. Both now read
what Java reads, in Java's order, and the two curve parameters pass the boundary guards Java
applies (`curvature` into `[0, 1]`, `protraction` into `[-1, 1]`) on the way in — and, matching
`DynamicsMap.java:91-163,225-230`, on the way out through `addDynamics` and `addDynamicsFromData`
too, the latter writing the corrected value back into the caller's `DynamicsData` as Java does.

**The fixture blind spot, which is the part worth keeping.** Both defects survived the whole
certification programme because the fixtures cannot express them. Every `<articulation>` in
`tests/integration/fixtures` carries `name.ref` and `noteid` and nothing else, and every
`<dynamics>` with a `transition.to` carries `curvature="0.0" protraction="0.0"` — which is what
the fields default to anyway. So the reference corpus agreed with a port that read neither, and
kept agreeing. The gap was found from outside, by generating MPM documents with literal non-zero
values and comparing the two renderers directly. The guard tests above therefore build their XML
rather than reach for a fixture, and that is deliberate: a fixture cannot pin this.

**Evidence.** The TD4-era verifier probe — 407 hashed checks: all 16 MEI fixtures through MSM,
MPM, augmented MSM, raw and expressive MIDI; all 16 reference MSM+MPM pairs performed from disk;
6 all-maps fixtures; and the XML-layer operations over 88 fixture files — returns
`528b234043d64d532428c72a176d34ca2d6e1e1831428f4bee3cafe1e64b2175` on both builds, so no fixture
byte moves and the standing transcript hash above is untouched. That is only meaningful with a
driven control, because a probe blind to the fix would report the same thing: injecting inline
modifiers into every `<articulation>` of the reference MPMs moves all three fixtures that have
articulations and none of the one that does not, and replacing `curvature="0.0" protraction="0.0"`
with a real curve moves all three that have transitions and not the one that does not. The
instrument sees the fix; the fixtures do not exercise it.

**End to end.** A 40-piece pilot of generated MPM documents that _do_ carry these attributes
(mpmify `ml/node/generate_v4.mjs`, seed 20260809, all six v4 maps), rendered by both this port and
the Java fork and compared field by field — 124 134 scalar comparisons — goes from **3169
differing values, 3133 of them outside the libm envelope** to **37 differing, 0 outside it**.
Velocity, the field E1 and E2 both land on, goes from 2408 of 4513 disagreeing to **0**;
`milliseconds.date.end` from 735 (725 out of envelope) to 11, all within envelope and at most
2 ULP. What is left is only the `pow`/`log` divergence between Java's fdlibm and macOS' libm on
millisecond fields, and that attribution is itself controlled: the same 40 pieces with tempo
transitions and rubato stripped — the configuration with no `pow`/`log` on the render path at
all — compare **bit-exact, 124 134 comparisons, 0 differing**.

**Still `parseFloat`, not `parseJavaDouble`.** Both reads take the same shape as the def parsers
P1 fixed, but a def can be skipped by the factory above it and a map entry cannot, so there is
nowhere for a `NumberFormatError` to go. These are two of the map-level reads P1's closing note
lists as open.

### `Builder.build` — a UTF-8 BOM no longer rejects the document

|                           |                                                                                    |
| ------------------------- | ---------------------------------------------------------------------------------- |
| Item                      | `CMP1` (comparison campaign W2 item #1)                                            |
| Java                      | `XmlBase.java:99`, `:128`, `:162`; `mei/Helper.java:1042`, `:1061`                 |
| TypeScript                | `src/xml/XomTypes.ts` — `stripByteOrderMark`, applied in `Builder.build`           |
| Guard tests               | `tests/xml/XomTypes.test.ts` (Builder), `tests/api/bom-tolerance.test.ts` (facade) |
| Reachable from a fixture? | No — no fixture carries a BOM; reached from the MPM format's own sample corpus     |

A port bug fixed _toward_ Java, in the same sense as `Msm.getMinimalPPQ` above: Java accepts
these documents and the port did not.

**Why Java accepts them.** Every Java entry point hands XOM **bytes** —
`builder.build(new ByteArrayInputStream(xml.getBytes(StandardCharsets.UTF_8)))`
(`XmlBase.java:99`, and identically in `Helper.java:1042`/`:1061`), `builder.build(inputStream)`
(`:128`), or `builder.build(file)` (`:162`). XOM parses all three through a SAX/Xerces
`XMLReader`, and for a byte stream a leading `EF BB BF` is the UTF-8 encoding signature of
XML 1.0 §4.3.3 and Appendix F: it is consumed while determining the encoding, before the
document entity begins. Nothing in Java ever sees it as content.

**Why the port did not.** `Builder.build` takes a `string` and calls
`DOMParser.parseFromString`. By then the bytes have been decoded, and the signature has become
a U+FEFF **character** sitting in front of the XML declaration. `@xmldom/xmldom` treats that as
content outside the root and raises a fatal error — `processing instruction at position 1 is an
xml declaration which is only at the start of the document` — so the whole document is refused.
The divergence is an artefact of parsing characters where Java parses bytes; it is not a
decision either side made about BOMs.

**Where the fix goes, and why not higher up.** In `Builder.build`, which is the one choke point
every document passes through: `XmlBase`'s constructor for `Mei`/`Msm`/`Mpm`
(`src/xml/XmlBase.ts:56-59`), and the expression layer's two raw parses
(`src/expression/mpmDocument.ts:52`, `src/expression/msmFacts.ts:80`) which deliberately bypass
those classes under DESIGN.md D-A. The obvious alternative, `src/api/parse.ts`, cannot do it:
`parseOrThrow` receives an already-bound `() => parse(text)` closure and never sees the text, so
normalising there would have meant changing its signature and would still have covered only the
facade — leaving the expression engine, and any future module that follows its raw-`Builder`
discipline, still unable to read a BOM'd file.

**Exactly one leading mark is removed.** U+FEFF is only a signature at position 0; anywhere else
it is ZERO WIDTH NO-BREAK SPACE and is ordinary character data, which the guard tests pin. A
_run_ of marks is not stripped either: the second one is content, content before the declaration
is an error, and Java rejects that case too — so over-normalising it would open a new divergence
in the course of closing one.

**Not reachable from any fixture, and reached constantly outside them.** No file under
`tests/integration/fixtures/**` carries a BOM, which is why the port could refuse them for as
long as it did. Three of the six encodings in the MPM format's own sample corpus do carry one,
including both of its multi-performance documents (Telemann _Grave_ TWV 51-D7 with Baroque/Fast/
Romantic, and Vulpius _Die helle Sonn_ with Baroque/Romantic/Amateur) — the only real
multi-performance MPM available to the comparison campaign, and the reason the item was pulled
forward. All four BOM-affected sample files parse after the fix; before it, three of them threw.

**Evidence.** `npm run verify` green at 4005 tests, up from 3992 — the 13 added are all new
assertions, and no existing test changed. Because the fix only ever removes a character that
made the parse throw, no document that parsed before can parse differently now: the guard tests
assert equality of downstream products (`canonicalMpm`, `performMsm`, `convertMeiToMsmMpm`)
between BOM'd and un-BOM'd input rather than merely asserting that parsing succeeded, which is
what would catch a mark that survived into the tree.

### `processSlur` ignored `@staff`, so every slur was a global instruction

`src/mei/Mei2MsmMpmConverter.ts`'s `processSlur` carried the comment _"Simplified -- the full
implementation handles plist, tstamp2, endid, staff assignment, etc."_ and did exactly one of the
three things `Mei2MsmMpmConverter.java:2960-3130` does: it built a `slur` entry and put it in the
**global** `miscMap`, unconditionally. Java routes on the association attribute — `part`, else
`staff` — and only the unassociated (or `%all`) case is global. A `staff`-bearing slur is
**local**: one entry per named staff, in that staff's part `miscMap`, and a staff number matching
no MSM part contributes nothing at all. The `plist` branch, which marks the named notes directly
and produces no map entry, was missing outright, as was the `startid`/`endid` inference that fills
in `@staff` and then `@layer` when both endpoints share one.

The consequence was that a slur confined to one staff was applied to **every** part, and that a
slur pointing at a staff that does not exist was applied everywhere instead of being dropped.

Invisible in all sixteen MEI fixtures, because each one's slurs either carry no `@staff` or carry
a `@staff` that matches the only part present — global and local coincide there. It became visible
the moment §8's `layersToStaffs` renumbered the staffs underneath such a slur: `articulations.mei`
and `comprehensive.mei` then gained four `legato` articulations apiece that the Java reference does
not have. That is what a dangling `@staff` is supposed to produce — nothing.

**Fixed**, by porting the method in full. The evidence standard is met in both directions: the
complete suite (**4062 tests, 90 files**) passes unchanged, so no reference fixture moves a byte,
and §8's sixteen-fixture equivalence suite goes green, which is the direct measurement of the
behaviour the fix restores. Attribute append order in both branches follows Java's exactly — it
_is_ the fixture bytes — and is commented as such at the site.

## 2. Frozen divergences

Known, journaled, and deliberately **not** repaired. None is reachable from the MEI/MSM ⇒ MIDI
pipeline **on a well-formed document** — the one exception is `IMP1` below, which is reachable
only from defective imprecision input and where both sides destroy the performance by different
means. The first three come from capability gaps in the XML layer rather than from choices; the
fourth is a choice, and is the one place where this port returns something Java's own code
computes and then throws away.

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
- **`OrnamentationMap.getOrnamentDataOf` returns the data Java computes and discards.**
  `OrnamentationMap.java:144-206` clamps the index, resolves the style by scanning backwards for
  the nearest `<style>` switch, looks up the def, and fills in `name.ref`, date, `note.order`,
  `scale` and `xml:id` — and then, at `:205`, **returns `null` unconditionally**. There is no
  `return od;` anywhere in the method, and no Java caller exists; the whole body is dead. The
  port (`src/mpm/elements/maps/OrnamentationMap.ts`) returns the object instead.

  Reproducing "always null" would mean shipping a public method that cannot do anything, and the
  method is genuinely useful to a consumer editing MPM — which is what the class API is for. It
  is left as a divergence rather than promoted to §1 because there is no bug to fix on the Java
  side: the code is unreachable there, so nothing observable in meico is wrong. **Unreachable
  from rendering here too** — `apply()` re-reads the same data inline so that it can carry the
  style forward across entries — so no fixture, probe or performance can see it; it is visible
  only to a caller who invokes it. Eighteen unit tests in
  `tests/mpm/elements/OrnamentationMap.test.ts` pin the returned shape, including the v3 fields.
  Flagged by the ornamentation programme's v2 semantics survey (ORN-1 §3.2/§5.3) as the last
  ornamentation divergence this ledger had not recorded; recorded now.

### `IMP1` — an imprecision map the reference CRASHES on renders NaN-poisoned output here

| Item                      | `IMP1` (comparison campaign, W3a cut 4)                                                                                                                   |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Java                      | `RandomNumberProvider.java:163-166` (`setSeed` clears `series`), `:262-272` (`getValue`), `:370-398` (both correlated draws)                              |
| TypeScript                | `src/supplementary/RandomNumberProvider.ts:186-190`, `:272-284`, `:355-381`                                                                               |
| Guard tests               | `tests/comparison/imprecisionLaws.test.ts` — the `⊥ routes` block                                                                                         |
| Reachable from a fixture? | No fixture; reachable from any document that writes `@seed` on a correlated distribution or on a `<distribution.list>`, or an empty `<distribution.list>` |

**Failure-mode divergence on defective input.** Three imprecision inputs make the reference
throw and make this port emit `NaN`. Both outcomes destroy the performance; neither side is
"right", which is why this is frozen rather than queued.

`setSeed` clears `series` in both codebases, and `series` is not a cache:

- For `brownianNoise` and `compensatingTriangle` it holds the walk's current value.
  `ImprecisionMap` seeds it through `doHandover` and calls `setSeed` **afterwards**
  (`ImprecisionMap.java:601-620`, ported at `ImprecisionMap.ts:319-354`), so the next draw
  reads the last element of an empty list. Java's `ArrayList.get(-1)` throws
  `IndexOutOfBoundsException`; JavaScript's `series[-1]` is `undefined`, and
  `undefined + step` is `NaN`.
- For `distribution.list`, `series` **is the list** (`rand.series = list`, ported as
  `[...list]`), so clearing it leaves an empty one. Java computes `index % series.size()` on
  `int`s and throws `ArithmeticException: / by zero`; JavaScript's `index % 0` is `NaN` and
  `series[NaN]` is `undefined`. The same divide reaches an **empty** `<distribution.list>` with
  no `@seed` at all, which is the commoner way in.

Measured end to end through `performMsm`: a `brownianNoise` carrying `seed="99"` gives
`milliseconds.date="NaN"` on every note, while the same document without the seed performs
ordinary numbers; a `<distribution.list>` behaves identically.

**Why it is frozen.** Repairing it means choosing a behaviour neither codebase has. Reordering
`setSeed` before `doHandover` would change every seeded correlated rendering — the numbers, not
just the failure — and `RandomNumberProvider`'s own class doc records that the count and order
of draws is part of the output. Throwing to match Java would turn a NaN into an exception on
the same defective input without making either document renderable. The comparison module needs
neither: it prices such a span `⊥` (§5.9, AD-1/R24 — the renderer has no performed value), which
is correct against both codebases.

---

### Numbers are written `720`, not `720.0` — accepted, not a defect

Java's `Double.toString` keeps the fractional zero on a whole number; JavaScript's
`String(number)` does not. Every numeric attribute this port writes therefore differs from the
reference by a trailing `.0` — **1488 occurrences** across the reference corpus, concentrated
in `@date` (397), `@midi.pitch` (242), `@duration` (238), `@octave` (227) and `@accidentals`
(227).

**This is a deliberate, permanent divergence, decided by the repository owner (2026-08-20).**
The two spellings parse to the same double, nothing downstream distinguishes them, and the
shorter form is the better one. A Java-double formatter at every numeric write was considered
and rejected: it would add a formatting layer to the whole output path to reproduce a
difference nobody wants.

`tests/integration/cross-validation.test.ts` keeps one normaliser for it. That normaliser is
therefore _not_ the blind-spot kind — it forgives a difference that has been examined and
accepted, which is exactly what a normaliser is for. Removing it reds 24 of that suite's 48
tests, and should not be removed.

**One latent case this does not cover, recorded because no fixture reaches it.** Java switches
`Double.toString` to scientific notation at `>= 1e7` (and `< 1e-3`), where JavaScript does not
until `1e21`. So a `date` of 12345678 would be `1.2345678E7` in Java and `12345678` here — a
difference the `="N.0"` normaliser does not match, which would surface as a red test rather
than as silent drift. At 720 ppq that threshold is about **3472 bars of 4/4**, so it is
reachable by a long score even though the corpus tops out at `date="23040"`. If it ever fires,
this entry is the explanation; the fix would be to accept the JavaScript spelling there too and
widen the normaliser.

---

## 3. Bug-for-bug preservations

Behaviours that look like defects and are reproduced anyway. Unlike §1's entries these are not
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

### `attribute()` matched qualified names, and it reached the MIDI bytes — FIXED

`src/xml/tree.ts`. Java's `Helper.getAttribute` (`Helper.java:346-359`) tries three lookups,
the first being XOM's `Element.getAttribute(String)` — which matches a **local** name in no
namespace. This port's one-argument `Element.getAttribute` also matches the _qualified_ name,
so step one hit where Java's missed, and `getAttributeValue('xml:id', n)` returned an id where
`Helper.getAttributeValue("xml:id", n)` returns `""`.

**Two call sites depended on it and both were byte-visible.** `Msm.ts` writes that value into
the raw-MIDI text event, and `AsynchronyMap.ts:93` appends it to `@modified`.

Java's own references settle which side is right, and they are unambiguous: **all 105
`modified` attributes under `all-maps-reference/` are `modified=""`**, and
`articulations_raw.mid` carries **twelve `FF 01 00`** — twelve text events of length zero,
where this port emitted `n1`, `n2` and so on. Measured across the corpus: **524 text events in
22 fixtures**.

It was invisible because `midi-byte-equivalence.test.ts` compared a meta event's type byte and
nothing else. Two people found that gap independently on the same day, from opposite ends.

**Fixed in `attribute()`, deliberately not in `Element.getAttribute`.** Removing the qualified
match from the XOM emulation also passes the byte gate, which is what makes it a tempting
one-liner — and it reds 30 tests, `Mei2MsmMpmConverter`'s failures being _counts_ rather than
ids, because the converter reads qualified names structurally. `attribute()` is the
transcription of `Helper.getAttribute`, so that is where the fidelity belongs; the XOM
emulation keeps its convenience for every other caller.

Consequences recorded where they land: `tests/msm/navigationEquivalence.test.ts` now scopes its
agreement claim to unqualified names and pins the intended disagreement, and the 24 `@modified`
values in `fixtures-multi-instruction/asynchrony_augmented.msm` were rewritten to `""` — only
those, so every other byte of that snapshot is still the pre-rewrite build's.

**One judgement call left open for the repository owner.** This makes the port emit _less_
information than it did: `@modified` no longer says which asynchrony instructions touched a
note, and the raw MIDI text events no longer carry note ids. Both are strictly more useful
full than empty. The decision here was that an accidental, undocumented divergence hidden by
an oracle gap should be closed rather than kept — but this is the same class of call as
`720.0` versus `720`, where the shorter, non-Java spelling was deliberately kept. If the
richer output is wanted, reverting is one line in `attribute()` plus this entry rewritten as a
preserved divergence.

### `GenericMap.sort()` is not a sort

`src/mpm/elements/maps/GenericMap.ts`. The pass computes the leftmost index an element should
move to and then **swaps** the two positions; an insertion sort shifts the intervening elements
right instead. Run against the code as written, `[2,3,1]` becomes `[1,3,2]`, `[1,3,2,0]` becomes
`[0,2,3,1]`, and `[5,4,3,2,1]` becomes `[1,5,4,3,2]` — none of them sorted, and not stable
either. Java does the same thing (`GenericMap.java`,
`Collections.swap(this.elements, i, moveToIndex)`), so this is inherited rather than a port
defect. It does get simple cases right, which is why it has never looked broken: an arrangement
with a single displaced element belonging at the end comes out sorted, and that is exactly the
case the existing unit test covers.

**Why it never fires.** Not for the reason an earlier draft of this entry gave. The index is
keyed on `@date`, the _symbolic_ date, and that is correct: `parseData` builds every key from
`@date`, every lookup on the index is symbolic, and `ArticulationMap` compares `getKey()`
against an articulation's symbolic `@date`. Keying it on `@date.perf` would break every
symbolic lookup in the renderer. There is no attribute mismatch to repair.

It never fires because its one caller cannot perturb what it re-checks. `ArticulationMap`'s
`if (mapTimingChanged) map.sort()` runs after articulating notes, and articulation writes
`@date.perf`, `@duration.perf` and `@velocity` — never `@date`. The keys really are unchanged
and the array really is already ordered, so the pass finds nothing to swap. The call is a no-op
by construction, here and in Java, where `ArticulationMap.java:479` is likewise the only
`sort()` call in the entire `mpm` package.

The defect would surface only if `sort()` were called after `@date` itself had been edited on
elements already in the map. Nothing does that. Preserved on the same grounds as the rest of
this section, and now pinned by a unit test that asserts the unsorted result on purpose, so
that anyone repairing it has to do so deliberately.

**Measured, 2026-08-20, rather than only argued.** The paragraphs above reason that the call is
a no-op by construction; that reasoning had never been checked against the corpus. Instrumenting
`sort()` to compare the key sequence before and after itself, and running the whole of
`tests/integration` and `tests/mpm`: **28 calls, 26 of them no-ops.** The two that reorder
anything are both in `tests/mpm/elements/GenericMap.test.ts` — the test that edits `@date` by
hand, and the test that pins this very defect — and the second produces `100,200,300 -> 1,3,2`,
i.e. a sort whose output is not sorted, exactly as described above. Across every MEI fixture,
every all-maps fixture and every render in the suite, `sort()` never once changes an order.

Two consequences worth stating plainly. First, deleting `if (mapTimingChanged) map.sort()`
outright leaves the entire suite green (2796 tests in `tests/mpm` + `tests/integration`) — so
**the suite cannot protect this call**, and it belongs on the fixture-coverage gap list next to
`<pedal>` and `subNoteDynamics`. Second, the call is not merely unnecessary here, it is a
loaded gun: if a future change ever did write `@date` mid-render, this would fire and produce a
_wrongly_ ordered map rather than a correctly ordered one. Anyone adding such a write must fix
the sort first.

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
  failure into typed errors — see `src/api/errors.ts`. The two interior errors §1 introduces do
  not weaken that rule: `NumberFormatError` is thrown exactly where Java throws, and
  `OutOfRangeError` only for an index no series can have.

---

## 6. MPM v3 ornamentation — spec-derived, not Java-verified

Everything above compares two implementations of the same thing. This section describes the one
feature where there is no second implementation to compare against: the **MPM v3 ornamentation
model** — discrete auxiliary notes, note pools, the `note.order` grammar with chords and
repetition groups, `repetitions`, `alignment`, per-value unit suffixes, and MEI ornament-sign
expansion.

Upstream cemfi/meico does not implement it either, so there is nothing on that side to compare
against and nothing the fork removed: `OrnamentationMap.java`, `OrnamentData.java` and
`OrnamentationStyle.java` are **byte-identical between upstream master and the verified fork**.
The single difference anywhere in the ornamentation classes runs the other way — upstream has a
ten-line `OrnamentDef.clone()` that the fork lacks, added upstream in `4d7cf1cb` (v0.11.11), nine
releases after the fork's branch point. It is live code, not a dead-code fix: upstream calls it
from `GenericStyle.merge()` (`GenericStyle.java:270,279`), a method the fork does not have at
all. Neither side reads a note pool, and a `<trill>` in an MEI file reaches its MPM as nothing at
all in both. So for this feature the port is not behind its reference or ahead of it — it is
somewhere the reference does not go, and **"produces the same bytes" is unavailable as a
criterion**.

**What replaces it.** Every number this feature produces is derived by hand from the
specification before it is asserted, and the derivation is written above the assertion — the
arithmetic in `tests/integration/ornamentation-v3.test.ts` and
`tests/mpm/elements/maps/ornamentInstantiation.test.ts` is the readable part of this section's
claim. The v3 inputs live in their own directory, `tests/integration/fixtures-v3/` (nine
hand-authored MSM + MPM pairs), kept apart from the Java-generated ground truth in
`tests/integration/fixtures/`, which the whole feature leaves untouched.

The one thing that _is_ measured against the old standard is that **v3 changes nothing about
v2**, and it is measured at every wave rather than argued: the pipeline byte probe returns
`ed158a07d553f9346b958e8943b98c3b8c55a046f4fb4061654567e864e8757f` over 1284 checks and its
companion `0b58d5a4c281914e605de46eb44be54e223d1eb7b08724702eca1ac703ca8c7c` over 83, both
identical to the values the pre-ornamentation tree produced; and a call tracer wrapping every
map class's render entry points over the eight all-maps fixtures produces a byte-identical
557-call transcript on both builds. A v2 document takes the v2 code path untouched — the
detection that decides this triggers only on features v2 cannot express — and
`fixtures-v3/v2-passthrough` is a v2 document performed through the v3 build to prove the gate
is not vacuous.

### 6.1 Provenance: which documents this implements

|                    |                                                                                                                                                 |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Specification      | [axelberndt/MPM](https://github.com/axelberndt/MPM) `develop` @ **`1de00bb`** (v3.0.2). Pinned, because v3.0.1 is the only published release    |
| Order of authority | schematrons > attribute-definition tables > ODD prose > figures                                                                                 |
| Reference impl     | LarsEngeln/meico `develop` @ **`3deb141c`** = open PR [cemfi/meico#31](https://github.com/cemfi/meico/pull/31) — unmerged, unreviewed, no tests |
| How it is used     | consulted where the spec is silent, adopted formula by formula, **never wholesale**                                                             |
| Corpus             | real MPM encodings decide reader lenience — the strict schematrons reject the format's own sample files                                         |

The reference implementation was audited before any of it was adopted (24-item spec-fidelity
table, 29-item defect catalogue, in `docs/history/ornamentation/research/lars-v3-implementation.md`), and the
audit's headline is why §6.2 exists at all: **the PR cannot read a spec-conformant v3 file**. Its
pool child element is `ornamentNote`, which no spec release defines; its `frameLength` parser
throws on the unit suffix the schematron requires; and its v2 ornamentation path is commented
out. Adopting it as ground truth would have meant reproducing that.

### 6.2 Where this deliberately diverges from the reference implementation

Each of these is a decision recorded in `docs/history/ornamentation/DESIGN.md` (the `D…` numbers below) and
pinned by tests. They are divergences from an unreviewed pull request, not from a release.

- **D1 — the pool child is `<note>`, not `<ornamentNote>`.** The spec's `note.xml` names `note`;
  `ornamentNote` is a pre-release name that was reverted and appears in no release. The reference
  reads the pool under that old name while its own MEI converter writes `<note>`, so its
  `od.notes` is always empty — which costs it nothing by itself, because its renderer reads the
  children directly rather than through that field. The damage appears in the case the name is
  actually used: a document whose children really are `ornamentNote` has them cloned under that
  name, and the transformer phase indexes only `note` and `rest`, so every lookup returns null,
  both transformers are skipped, and the generated elements never reach MIDI export either —
  a seven-note cluster stacked on one instant, silent. `note` is also now accepted by
  `Mpm.isInNamespace`, which was already a deliberate superset of Java's vocabulary (§1).
  _Pinned:_ `tests/mpm/elements/maps/data/OrnamentNote.test.ts`, `tests/mpm/Mpm.test.ts`.
- **D3 — unit suffixes are parsed, and a suffix-less value still reads.** This is the reference's
  worst defect, and it is worth stating at full strength: `frameLength="80%"` — the spec's own
  spelling — reaches a bare `Double.parseDouble`, whose `NumberFormatException` propagates out of
  the `TemporalSpread` constructor and out of `OrnamentDef.parseData` into
  `createOrnamentDef`'s `catch` (`OrnamentDef.java:62-71`). That prints a stack trace and returns
  null, so the **whole `ornamentDef` is dropped and every `<ornament>` referencing it is skipped**
  (`OrnamentationMap.java:593-595`): a spec-valid v3 file loses all of its ornaments. Here the
  suffix is the grammar (`^-?[0-9]+(\.[0-9]+)?(ms|%|ticks)$`),
  with three documented leniencies for the corpus the schematron rejects: a suffix-less value
  takes the legacy `time.unit` if the element still carries one and ticks otherwise, and
  `frame.start` is accepted as the old name of `frame.offset`. Reading is lenient, writing is
  canonical v3. _Pinned:_ `tests/mpm/elements/styles/defs/TemporalValue.test.ts`,
  `tests/mpm/elements/styles/defs/OrnamentDef.test.ts`, and end to end on
  `fixtures-v3/legacy-timeunit`.
- **D4 — `%` resolves against the principal note's TICK duration**, where the reference uses its
  millisecond duration. Three reasons, in the order they carry weight: the ODD's pipeline
  assigns only "milliseconds modifiers" to the post-tempo pass and a percentage is not one;
  Berndt's ruling on MPM issue #55 is that tick-domain ornaments are "tempo dependent … we can
  use the tempo and rubato models to refine its timing", which only tick-domain placement gives;
  and the guidelines' own figure derives the percentage from notated duration. The audible
  consequence is that a `50%` trill breathes with rubato instead of being pinned to wall-clock
  time. _Pinned:_ `fixtures-v3/turn-atstart` and the `%`-frame vectors.
- **D5 — two phases, not one.** The reference moved all ornamentation after tempo rendering. Here
  note _instantiation_ and tick/`%` spacing happen in the symbolic phase, and only millisecond
  frames go through the existing v2 millisecond pass. This is what lets generated notes flow
  through tempo, articulation, asynchrony and imprecision like any other note, and what lets a
  dynamics gradient reach `velocity` at all — in the reference it cannot, because velocity is
  already fixed by then. One millisecond marker is new (`ornament.milliseconds.fromend.offset`,
  for an end-aligned millisecond frame whose anchor does not exist before the tempo pass); it
  lands in both copies of the duplicated millisecond pass, and three tests compare the two copies
  token for token so they cannot drift. _Pinned:_ `tests/mpm/elements/maps/ornamentInstantiation.test.ts`,
  `fixtures-v3/atend-ms`.
- **D9 — `repetitions` plays every group `r + 1` times.** The reference reuses its
  fill-the-frame loop with a note budget and charges the non-repeated slots against it, so
  `#a |: #b #c :| #d` with `repetitions="2"` gives six slots where the spec's own wording ("three
  times … so it is played four times") gives eight. Multiple repeat groups each expand; the
  reference supports one. _Pinned:_ `tests/mpm/elements/maps/data/ornamentExpansion.test.ts`.
- **D9 — dedup never reaches inside a chord.** Consecutive duplicate pitches are dropped (unless
  the whole sequence is one pitch, which preserves tremolos), but the reference's "last note"
  cursor persists across `[` and `]`, so it mutilates chords. Ours treats a chord as one slot
  throughout. The one consequence worth knowing: `[ #x #x ]` keeps both notes, i.e. two identical
  pitches at one onset survive into the MIDI.
- **D9 — the tremolo exception is decided over the expanded sequence**, not over the pool. The
  reference's pool-based test misfires whenever the pool holds notes `note.order` never uses, and
  the spec says pool order and membership carry no meaning.
- **D8 — `interval.diatonic` is resolved against the MSM key signature**, at render time, where
  the reference resolves diatonic steps up in the MEI layer and writes halftones. Ours does both:
  the MEI expander keeps the steps diatonic in the MPM (so an MPM-authored document works too),
  and the renderer resolves them against the part's own `keySignatureMap`, falling back to the
  global one and then to C major. _Pinned:_ `fixtures-v3/diatonic-key` (two sharps ⇒ D major:
  74 − 1 ⇒ 73, 74 + 2 ⇒ 78, 74 + 7 ⇒ 86; a key-blind reading gives 77 for the middle one).
  **PARITY NOTE at the site:** this reading counts sharps with `> 0`, not the `> 1.0` of
  `Msm.parseKeySignatureMap`, whose comparison is a Java-inherited bug that counts no sharp at
  all (`Msm.java:1148-1157`). That bug is preserved where it is, because the reference MIDI was
  generated with it; reproducing it here would put a trill in the wrong key, and no fixture and
  no Java output binds this new code.
- **D12 — serialization is generation-preserving**, and the two writer divergences below follow
  from it. A document parsed as v2 (or built through the v2 API) serializes exactly as it does
  today — that is what keeps the all-maps fixtures byte-green — while anything v3 serializes
  canonically.
  - **`scale` is always written.** The reference omits it at `1.0`, but the attribute's schema
    default is `0.0`, which multiplies every dynamics gradient to nothing — so its omission is a
    round-trip bug that silently deletes the gradient it just wrote.
  - **`repetitions` is written only when it is not `0`.** The reference stamps `repetitions="0"`
    onto ornaments that have no repeat group at all, including v2 ones.
- **D9/D17 — the `repetitions="-1"` fill sentinel is accepted but never authored.** It is an
  undocumented meico extension (schema-invalid: the attribute's minimum is 0) meaning "fill the
  frame", one note per 150 ms. It is honoured on read, and only for a frame whose length is in
  milliseconds — a tick or `%` frame has no millisecond budget before the tempo pass, so the
  sentinel is logged and the ornament skipped. Two further nuances: the budget is measured over
  the **frame**, where the reference measures the principal's millisecond duration; and the MEI
  expander does **not** emit the sentinel the way the reference does for every repeat barline,
  because every def it authors is `ticks` or `%`, where the sentinel would silence the ornament
  it was meant to fill.
- **Termination is structural, not defensive.** The reference's `note.order` tokenizer fails to
  advance its index on a token without `#` and hangs forever; its expansion loop can allocate
  without bound. Here the tokenizer is one forward pass over a fixed array, the expansion
  computes pass counts arithmetically and refuses anything over a million slots before allocating,
  the diagnostics per value are capped, and the cases that can actually loop carry explicit
  per-test timeouts so that a regression fails the suite instead of hanging it: 2 of the 62 `it(`
  declarations in the pure expansion suite — 125 runtime cases via `it.each` — (the two that
  expand to the million-slot ceiling), 6 of 48 in the
  `note.order` parser's, 12 of 85 in the renderer's, and **all 45** of the integration suite's,
  which times every case on principle. The rest inherit the 30-second global timeout.

### 6.3 Semantics the specification does not fix, decided here

- **An end-aligned MILLISECOND frame drops its principal's head, deliberately.** A tick or `%`
  frame aligned `at end` shortens the principal and leaves it sounding up to where the figure
  starts. A millisecond frame cannot: it is anchored at a millisecond end that does not exist
  until the tempo pass, so the principal is removed whole and only the figure sounds. On the
  fixture, 90 of the principal's 1000 ms survive as the figure and 910 are dropped.
  **The alternative was considered and rejected:** leave the principal at its full length and let
  the figure overlay its end. That reading doubles the pitch for most of the note and contradicts
  what every other alignment does — an ornament _replaces_ its principal here. Carving the head
  properly would need a second new millisecond marker (a duration measured back from an end
  nobody knows yet); the option is documented and left open. What the code does instead is
  **say so**: it logs which ornament, and how much of the note is left, computed from the same
  spacing function that writes the markers rather than from a formula of its own. _Pinned:_
  `ornamentInstantiation.test.ts` (the warning fires for `at end`, is silent for `at start`, and
  names 90 ms for the standard vector and 30 ms at `intensity="0"`, where every slot piles at the
  frame's end).
- **A frame that abuts its principal's end produces a zero-length final note.** In
  `fixtures-v3/turn-atend` the last slot is pinned at the frame end, the frame ends where the
  principal ends, and `monophonic` measures the last duration to that same point: 1440 − 1440 = 0.
  It is the spec's own arithmetic rather than a defect, so it is pinned as `0` rather than
  tolerated as a range. MIDI export emits the note-on and note-off at the same tick; nothing is
  dropped and every synthesizer reads it as an immediate release.
- **The principal's `xml:id` goes to the head leftover or to the heir — never to both.** When an
  end-aligned tick frame leaves a head, that leftover _is_ the principal and keeps its id; when
  the principal is consumed whole, the id moves to the first generated note the expansion sourced
  from it, so `goto`/`marker` wiring and MEI id links survive. An earlier draft gave it to both,
  which produced two elements with the same `xml:id` — not a valid document. The ruling is
  structural: carving reports whether the principal survived, and the id assignment is the
  exclusive branch of that answer. _Pinned at both levels_, and in both directions:
  `ornamentInstantiation.test.ts` and `ornamentation-v3.test.ts`.
- **A carved head is marked.** The surviving leftover is the one note an ornament _alters_
  without generating, and it used to carry nothing to say so — which made the facade's
  `ornamented` contract ("generated by **or altered by** an ornament") false on exactly that
  path. It now carries `ornament.carved="true"` plus `ornament.ref` when the ornament has an id,
  and deliberately none of the positional provenance below: it occupies no slot in the expanded
  sequence, and it is the anchor rather than pointing at one. That the predicate is complete is
  measured rather than reasoned: performing all nine v3 fixtures with `expandOrnaments` off and
  on, and comparing every surviving score note's pitch, date, duration, velocity and millisecond
  times between the two runs, finds **nine altered notes, all nine reporting `ornamented: true`
  with a ref, and no altered-but-unmarked note anywhere**.
- **Attribute order on a generated note is fixed here, not inherited.** Nothing in Java writes
  these elements, so nothing binds the order; it is `date`, `midi.pitch`, `duration`, the
  performance attributes, then the provenance family last. One visible consequence: a generated
  note's `xml:id` sits where the principal's copy had it — after inherited attributes such as
  `velocity` — while a hand-authored MSM note carries it first. No fixture and no schema cares,
  and the alternative (rebuilding the attribute list) would reorder attributes the copy is meant
  to preserve.
- **Numbers are written the way this port writes every number.** `String(x)` gives `"0ticks"` and
  `"50%"` where Java's `Double.toString` would give `"0.0ticks"` and `"50.0%"`. Both satisfy the
  schematron. This is the port-wide textual divergence (`research/java-ts-v2-ornamentation.md`
  §5.3), applied consistently rather than specially.

### 6.4 The provenance attributes

Generated notes carry their own bookkeeping, so that a consumer can join a performed note back to
the score without parsing `note.order` and without depending on generated identifiers. None of
these exists in MPM v2 or in the reference implementation, and none can appear in a v2 document's
output. They are additive, and two downstream projects (an ML supervision pipeline and a
score-performance alignment tool) key on them by agreement.

| Attribute            | On                               | Value                                                                                                |
| -------------------- | -------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `ornament.generated` | every generated note             | `"true"` — this note did not exist in the score                                                      |
| `ornament.carved`    | a surviving head leftover only   | `"true"` — this note was in the score and an ornament shortened it                                   |
| `ornament.ref`       | both of the above                | the `<ornament>`'s `xml:id`, when it has one                                                         |
| `ornament.source`    | generated notes                  | the `note.order` token this note resolved from — a pool id, the principal's, or another score note's |
| `ornament.slot`      | generated notes                  | 0-based position in the **expanded** sequence, after dedup and landing                               |
| `ornament.pass`      | repeat-group notes only          | 0-based repetition pass; absent elsewhere, which is how "not repeated" is spelled                    |
| `ornament.anchor`    | generated notes with a principal | the `xml:id` the principal had **before** the ornament replaced it                                   |

Two of them are worth a sentence each. `ornament.slot` numbers the expansion, not the survivors:
when a note is dropped for ending at or before tick 0, the remaining notes keep their original
indices and the sequence has a gap — provenance has to stay true to what it describes.
`ornament.anchor` exists because the join would otherwise not be total: an ornament whose
`note.order` never names its principal, and which leaves no leftover, would erase that id from
the document entirely. `ornament.anchor` is written only when the principal has an `xml:id` of
its own — with nothing to point at, the attribute is absent rather than empty.

The seven attributes reach the facade as six plain fields on `PerformedNote`: `ornamented` is a
`boolean` and is `false`, never `null`, when a note carries none of the markers (it answers "did
an ornament touch this note", and the answer is no); `ornamentRef`, `ornamentSource`,
`ornamentSlot`, `ornamentPass` and `ornamentAnchor` are `null` for absence. Six rather than seven
because `ornament.generated` and `ornament.carved` are two of the markers behind the one boolean,
not fields of their own. _Pinned:_ `tests/api/pipeline.test.ts`, `tests/api/plain-data.test.ts`.

### 6.5 MEI ornament signs: expanded by the facade, not by the converter

`<trill>`, `<mordent>` and `<turn>` (with their SMuFL and `@altsym` aliases) expand into MPM v3
ornaments — a pool, a `note.order` from the standard ornament dictionary, and an `<ornamentDef>`
in an `"MEI export"` style. **Which entry point you use decides whether that happens:**

- `new Mei2MsmMpmConverter(…).convert(mei)` — the class API — does **not** expand. Default `false`.
- `convertMeiToMsmMpm(mei, options)` — the facade — **does**, unless `expandOrnaments: false`.

That asymmetry mirrors Java's own layering, where expansion is a document pre-pass in
`Mei.exportMsmMpm` and the converter itself never expands. It is also what keeps the four
auto-discovering MEI equivalence suites meaningful: they all drive the converter directly, and
they compare against Java references that contain no expansion. **State the setting on both sides
and the two paths agree byte for byte** — that is asserted, with a non-vacuity check that they
genuinely diverge at the facade default (`tests/integration/mei-ornament-expansion.test.ts`, the
last describe; and the round-trip gate `tests/api/facade-equivalence.test.ts`).

**One fixture is therefore Java-verified on one path and spec-derived on the other.**
`tests/integration/fixtures/mei/composite_advanced.mei:105` carries
`<trill xml:id="tr1" staff="1" startid="#n20"/>`, and its Java reference
`fixtures/reference/composite_advanced.mpm` has **no `ornamentationMap`** — upstream meico ignores
the sign. Through the direct converter this port agrees with that reference exactly, as it always
has. Through the facade it writes an ornament the reference has no counterpart for, on the part
that owns staff 1 (`Oboe`, `n=1`) rather than on the global map. It is the one place in the corpus
where the two paths diverge, and it does so by design.

`<arpeg>` is **not** governed by any of this: it has always converted to a **v2** ornament and
still does. What is asserted, on a purpose-built arpeggio MEI because no fixture has one, is that
the whole MPM and the whole MSM are byte-identical with the flag **off** and with it **left at
its default** — which is the on state, since the facade reads `?? true` — with generated ids
canonicalized and a non-vacuity check that the arpeggio is really in both.

Out of scope, and named so the absence is not mistaken for a defect: `<ornam>` and `@altsym` are
not wired to the dictionary (the dictionary module already normalizes the names they would use).

### 6.6 Two flags named `expandOrnaments`

They act at different stages and compose, and the shared name is deliberate — it is the same
question asked twice.

- **`ConvertOptions.expandOrnaments`** (default `true` at the facade) decides whether MEI ornament
  signs are ever _written into the MPM_.
- **`PerformOptions.expandOrnaments`** (default `true`) decides whether the v3 ornaments already
  in an MPM _generate their notes_ during rendering. With it off, the ornaments stay in the
  document — a consumer still reads them — and the score performs without them; no
  `note.order.perf` is written either, so nothing records an expansion that did not happen.

Neither flag touches MPM **v2** ornaments. A v2 ornament generates no notes in the first place —
it shifts and shades notes the score already has — so there is nothing to suppress, and those
notes still report `ornamented: true`. Suppressing them would be a much larger promise ("perform
the score without its ornamentation") and is not what either flag says.

### 6.7 Generated identifiers are not reproducible across runs

Every generated ornament note draws a fresh `meico_<uuid>` (`addUUID`, the codebase's own
generator), so **any ornament-bearing input renders to MIDI that differs run to run in its note
identifiers** — the same property §4 records for the converter's generated ids, now reachable from
performance rather than only from conversion. Tests canonicalize the ids by first-occurrence
order, which is strictly stronger than deleting them: it keeps id-to-id wiring verifiable. Nothing
else about the output moves; expansion and rendering draw no random values, and the provenance
attributes above are id-independent by construction, which is why the two downstream consumers
were asked to key on them.

Deriving the ids from the ornament and slot instead (`<ornament id>_<slot>`, say) would make
renders reproducible byte for byte. It is a real option, it is not taken here, and taking it later
would be a small isolated change — but it is a change to identifiers that consumers may already
have stored, so it belongs in a release note rather than in a patch.

### 6.8 `parseJavaDouble` in v3 parse code, and the one exemption

§1's `P1` entry replaced `parseFloat` with `parseJavaDouble` in the five def classes, because
`parseFloat` and `Double.parseDouble` disagree about _failure_. New v3 parse code follows the same
rule — the D16 ruling, amended into DESIGN.md and journaled in `docs/history/ornamentation/LOG.md` — with one
deliberate exemption:

- **Exempt: `TemporalValue`** (`frame.offset`, `frameLength`). Its grammar is the spec's own
  regex, which admits only plain decimal literals — no hex, no exponent, no `d`/`f` suffix, no
  spelled-out `Infinity`. That is exactly the set of forms on which `Number`, `parseFloat` and
  `Double.parseDouble` differ, so on this grammar the three are the same function. Not argued but
  measured: a Java 17 harness running the same regex plus `Double.parseDouble` over a 481-input
  corpus (pseudo-random decimals up to 18 integer and 20 fractional digits, the 2^53 tie
  neighbourhood, 1e308/1e309, 309- and 1000-digit strings, 324-digit subnormals, the classic
  `2.2250738585072012e-308` hang input, signed zeros, the spec's own examples, and 37 rejects)
  agrees with this module on **443 values bit-compared, with 0 acceptance mismatches and 0 bit
  mismatches**. Swapping the parser here would change nothing except the number of code paths.
- **Not exempt: the pool note's pitch attributes and `@repetitions`.** These have no grammar to
  lean on — `midi.pitch` is an unconstrained attribute value — so the choice of parser is
  observable on malformed input, and they read through `parseJavaDouble`. The differences are
  real and pinned: an **empty** attribute (`midi.pitch=""`) is rejected instead of reading as
  `0`, which had been silently inventing the principal's own pitch; `0x10` is rejected as Java
  rejects it, where `Number` would have read 16; and Java's own `1d`/`1f` type suffixes are
  accepted. `NaN` and `Infinity` spelled out are accepted by the parser, exactly as Java accepts
  them, and then rejected by this port's own finiteness check — a pitch or a repeat count must be
  a number a note can be played at. A rejected pool note is logged and skipped (never thrown, per
  the v3 error policy); a rejected `repetitions` falls back to the schema default `0` with a log.
  _Pinned:_ `tests/mpm/elements/maps/data/OrnamentNote.test.ts`,
  `tests/mpm/elements/OrnamentationMap.test.ts`.

The MSM attribute reads inside the renderer stay on `parseFloat`, which is what every other
renderer in this port uses for MSM note attributes; `P1`'s closing note lists that family as open
and this feature does not change it.

### 6.9 Degenerate frames produce no notes, rather than impossible ones

The v3 renderer feeds the **v2** spacing engine, and inherits its two unguarded edges on purpose:
`intensity="0"` puts every slot at the end of the frame (`pow(0, 0)` is 1), and a negative
intensity sends the first slot to `Infinity`. In v2 those inputs could only ever write a marker
_attribute_ onto a note the score already had. v3 turns positions into elements, so the same input
materialized a real `<note date="Infinity" duration="NaN">` that flowed into the augmented MSM and
on into the MIDI export.

A note whose computed date or end is not finite is now dropped at creation, with one log line per
ornament naming how many of its notes went and why. Dropping is the only available reading —
there is no note at an infinite date — and it follows the shape of the existing rule that drops a
note ending at or before tick 0. The guard is per note, not per ornament: with an unreadable
`intensity` the pinned last slot still lands at `start + length`, which never touches intensity,
and it is kept. _Pinned:_ `ornamentInstantiation.test.ts`, "non-finite positions are dropped, not
written into the score (W9)", at the renderer; and `tests/integration/ornamentation-v3.test.ts`,
"a negative intensity reaches neither the augmented MSM nor the MIDI export", which drives the
same construction through the real pipeline and asserts the two documents named above — the
augmented MSM and the exported MIDI — come out clean.

---

## 7. The expression module — espressivo-only, prototype-inspired

`src/expression/**` and the `exaggerateMpm` / `spotlightMpm` facade entry points are outside the
equivalence frame for a simpler reason than §6's: **the Java reference has no such feature at all.**
meico applies an MPM to a score; it does not transform the MPM. There is no Java output to be
byte-identical to, so this module makes no parity claim of any kind, and nothing in it is
reachable from the conversion or rendering paths the equivalence suites drive.

**Where the ideas come from, and what that does not mean.** The design descends from a Java
prototype outside meico — `meicotools`, in the `mpm-renderer` project — whose `ModifyService`,
`Shader` and `PerformService` first posed the question this module answers. That prototype is the
**idea source, not a parity target**, and the distinction was made explicitly at the start of the
work: it is unpublished exploratory code, its numbers are undocumented, and reproducing it
faithfully would mean reproducing decisions its own author never wrote down. Five differences are
worth naming because each is a place where matching the prototype would have been the easier
option:

- **Articulation is implemented.** The prototype declared `relativeDuration` and
  `relativeVelocity` fields, wired them through its weight vector, and never applied them to a
  document. Here `articulation` is a full dimension covering both ratios and six absolute offsets —
  which is also why the prototype's two weights collapse onto one in `PROTOTYPE_WEIGHTS`, taking
  the lower of the two.
- **The magic constants are gone.** `Shader.bringOut`'s hardcoded `0.1` is now the required
  `attenuation` option; the eight tuned weights `getDefaultWeights()` applied invisibly to every
  render that asked for exaggeration — with no parameter to inspect them or turn them off
  (`PerformService.java:92-95`) — are now the exported `PROTOTYPE_WEIGHTS` preset, documented as
  one person's heuristic, with no weighting as the default. Both changes are the same principle: a
  number that changes what a caller hears is either derived, or an option, or a named preset —
  never a literal in a private method.
- **The preset's correspondence is documented against the prototype's _levers_, not its field
  names.** The two diverge in three places, and reading the names would credit the prototype with
  controls it never had: its `dynamics` field never touched `@curvature`/`@protraction`
  (`ModifyService.java:227-245`), its `temporalSpread` field scaled `@frameLength` and never
  `@intensity` (`:291-317`), and its `dynamicsGradient` field in fact multiplied `ornament@scale`
  (`:320-327`), an attribute this port excludes as a dead lever. The weights on `dynamicsShape`,
  `ornamentSpacing` and `ornamentDynamics` are therefore this port's decision — taken so a preset
  has no invisible holes across dimensions the design split after the vector was tuned — and
  `src/expression/weights.ts` records which of the fifteen are inherited and which are decided.
- **Selection failures are errors.** The prototype's shader skipped an unresolvable id with a bare
  `continue` and ignored an element type it had no mapping for. A selection of nothing but
  `<style>` switches therefore derived an empty spare set and damped **every** dimension — a
  flattened performance returned as a successful "bring out". `spotlightMpm` raises
  `SelectionNotFoundError` listing every offender instead, and an empty spare set is the identity.
- **`Isolation.contextualize` is not ported.** Isolation and excerpt rendering are out of scope,
  and the prototype's implementation additionally confuses a date with a volume. Neither the
  feature nor the bug is here.

Three prototype capabilities are simply not here at all: plain `Increase` scaling (a different
operation — it shifts the mean rather than the contrast, so it is provided only if a concrete
consumer asks for it), the sketchiness exponent curves (a UI recipe rather than library semantics,
composable from `factors` by any caller that wants them), and `humanize` (it _adds_ imprecision
instructions rather than transforming existing ones, and the consumer driving this work needs
determinism). DESIGN §5 is the full ledger with the reasoning for each.

**What replaces byte equivalence as the standard.** The mathematics: every dimension is a monotone
bijection into a space where the attribute's neutral maps to 0, and the properties that follow
(identity at `s = 1`, composition, domain closure, the neutral as a fixed point) are property-tested
rather than asserted. Because those properties hold for _any_ such bijection and so validate no
particular choice, each of the fifteen dimensions additionally carries an expected-direction test
at the strongest deterministically observable level — rendered where the rendered effect is
deterministic, written-attribute where a PRNG stands in the way. The reasoning behind every
inclusion, exclusion and metric choice is in
[docs/history/expression/DESIGN.md](https://github.com/pfefferniels/espressivo/blob/main/expression/DESIGN.md) —
a repository document, not part of the npm package; §5 of that document is the prototype-feature
ledger this section summarizes, and §9 records the adversarial review that shaped it.

**What it does not touch.** The transform never writes a `@date`, never adds or removes an element
or an attribute, and is deterministic — no RNG, so §4's nondeterminism caveat does not extend here.
The one place its output can move a symbolic date is through the renderer rather than the
document: `ornamentSpread` and `ornamentSpacing` on an MPM **v3** ornament that generates notes
into a tick-resolved frame, where the renderer derives the generated notes' geometry from the very
frame those dimensions scale. That boundary is stated in the facade's own documentation, pinned in
both directions by `tests/integration/expression-transform.test.ts`, and is a property of §6's
model rather than of this one.

---

## 8. `Mei.layersToStaffs` — a backport from a newer upstream than the reference fork

`Mei.layersToStaffs()` splits every multi-layer MEI `staff` into one single-layer `staff` per
layer, so the conversion emits **one MSM `part` per MEI layer** rather than one per staff. Without
it the voices of a keyboard or divisi staff are merged into a single part and share one MIDI
channel and one instrument; with it each voice becomes independently addressable, which is what
per-voice performance rendering needs.

It is **not** part of the conversion pipeline. `Mei2MsmMpmConverter` never calls it, the default
output is unchanged, and unlike the three passes in `convertMei` it is not undone by the `cleanup`
flag — it mutates the instance, so a caller who needs the original clones first. Nothing in this
section is reachable unless a caller invokes the method.

### 8.1 Why it is not in the reference fork

The method is upstream `meico.mei.Mei.layersToStaffs()`, added in **cemfi/meico v0.11.10** and
amended in **v0.11.12** ("to ensure that the sequence of elements within a `measure` does not get
mixed up" — the fix that inserts each new staff at the original's position instead of appending it
to the end of the measure; upstream's superseded `appendChild` line is still there, commented out).
The Java fork this port is measured against, [pfefferniels/meico](https://github.com/pfefferniels/meico)
at `1d662105`, is **v0.11.2** and predates both. So there is no method in the reference to be
byte-equivalent to, and §0's rule needed a construction rather than an exemption.

### 8.2 How ground truth was obtained anyway

The fork's sources were copied to a scratch directory, upstream's `layersToStaffs()` was spliced
into that **copy** verbatim (the two files' import blocks are identical, so it compiles unchanged),
and the copy was compiled into its own output directory per the proof-harness discipline — the
read-only fork's git state and class files are untouched, and `src/resources` was copied alongside
so `InstrumentsDictionary` finds `instuments.dict` and MIDI program changes are real. Everything
_around_ the spliced method is therefore the v0.11.2 converter the rest of this ledger measures,
not v0.11.14's; the two later converter changes in that range (grace-note handling in
`indexNotesAndChords` and `processSlur`) are deliberately **not** in the build, so the only
difference from the standard reference generator is the pass under test.

A companion generator applies the pass and exports MSM + MPM. Its output is committed as
`tests/integration/fixtures-layers-to-staffs/` — a **sibling** of `fixtures/`, not a child, because
CHARTER invariant 2 freezes `tests/integration/fixtures/**` against additions as well as edits, and
`fixtures-v3/` set the precedent for a reference set that arrives with a new feature. The frozen
directory is bit-for-bit untouched by this work; the MEI inputs are read from it and nothing is
written back. The new set is driven by
`tests/integration/layers-to-staffs-equivalence.test.ts`, which auto-discovers every
`fixtures/mei/*.mei` on the same terms as the other suites: strict string equality after the
normalizations `cross-validation.test.ts` uses, and a missing reference is a failure, not a skip.

**Result: all sixteen fixtures agree, MSM and MPM, 48 assertions.** Two MPM disagreements found on
the first run were traced to the port's `processSlur` stub rather than to this pass — the same
disagreement reproduces when Java's _own_ transformed MEI is fed through both converters with the
pass applied to neither — and are fixed in §1.

### 8.3 The numbering scheme, and two upstream behaviours reproduced

New staffs are numbered by **string concatenation** of the original values, `staff@n + layer@n`;
staff 2 layer 1 becomes staff `21`. A staff with no `@n` contributes `1000000`, a layer with no
`@n` contributes `<its index> * 1000000`, and each moved layer is renumbered `@n="1"`. Every
`staffDef` is regenerated as a deep copy of the one its original staff referenced — so clef, key,
transposition and instrument carry over — renumbered, appended to the copy's original container,
and the originals detached; the copies are appended in ascending **numeric** order of the new `@n`.

Two consequences are reproduced rather than repaired, both pinned by unit tests:

- **The scheme is ambiguous.** Staff 1 / layer 11 and staff 11 / layer 1 both yield `111`, and
  then collide into one `staffDef` and one part. Upstream has no separator; adding one would move
  every generated number and put the port ahead of the reference for no gain the caller asked for.
- **An `oStaff` holding `oLayer` children is dropped.** The staff query matches `staff` and
  `oStaff`, but the inner query moves only `layer` children, and the original is detached
  unconditionally — so an ossia staff encoded with `oLayer` yields no replacement and disappears.
  Callers with ossia content should not run this pass on it.

Control events are **not** renumbered either: a `<slur staff="1">` still says `staff="1"` after the
staffs become `11` and `12`, and is then dropped as a dangling reference. That is upstream's
behaviour, it is now also this port's (§1), and it is the sharpest edge of the feature.

### 8.4 The return value Java discards

Java declares `public void layersToStaffs()`. It builds a `newStaffN → origStaffN` table
internally — it needs one, to regenerate each `staffDef` from the right original — and then drops
it when the method returns. The port **returns** that table instead, widened to carry the layer as
well: one `Map<string, StaffProvenance>` per `mdiv`, in `getAllMdivs()` order.

This changes no XML, no fixture byte and no behaviour; it stops discarding something already
computed. The same shape of divergence is already in §2 (`OrnamentationMap.getOrnamentDataOf`
returns the data Java computes and then unconditionally discards), and the justification is
stronger here, because §8.3's numbering is **lossy**: `111` alone cannot tell you whether it came
from staff 1 / layer 11 or staff 11 / layer 1, so without the table a consumer cannot map an MSM
part back to the voice it represents. Requested by a downstream consumer whose schema codes part
numbers as small integers with "part 1 = top voice", for which the concatenated numbers are
otherwise uninterpretable.

The maps are per-`mdiv` rather than merged for the same reason: the numbering is unique only
within one movement, so merging would silently collapse two movements' staff `1`. An `mdiv` with
no `score` contributes an empty map rather than being skipped, keeping the result index-aligned
with `getAllMdivs()`.

### 8.5 The one deliberate hardening

Java orders the regenerated `staffDef`s through a `TreeMap<Integer, …>` keyed by
`Integer.parseInt(newStaffN)`, which throws `NumberFormatException` on a non-integer `@n`. MEI
types `staff/@n` and `layer/@n` as `data.INT` (`att.nInteger`), so a conforming encoding cannot
reach it. The port sorts such entries last instead of throwing: strictly more useful than a crash,
and unobservable on any schema-valid input.

### 8.6 `XmlBase.fixDuplicateIds`

`layersToStaffs` ends by calling it, because the `staffDef` copies carry the originals' `xml:id`s.
It is a straight port of `XmlBase.java:448` — first occurrence keeps its id, every later one is
reassigned `meico_<uuid>` — and that asymmetry is what keeps the original's references valid while
the copies move. It draws a UUID per duplicate and so is not idempotent in the ids it produces,
only in the property it establishes. It existed in the fork already; only this port lacked it.
