# Equivalence with Java meico

> How the port's correctness is enforced, and the eight places where it deliberately departs from
> the reference. The complete ledger — every divergence, every bug reproduced on purpose, with Java
> line citations — is [PARITY.md](../PARITY.md).
>
> Back to the [README](../README.md).

The port's correctness criterion is not "passes its tests", it is **"produces what meico
produces"**. That is enforced mechanically:

- **Java-generated ground truth.** `tests/integration/fixtures/` holds 16 MEI inputs and the
  reference output the Java library produces for each: MSM + MPM (32 files), augmented MSM plus
  raw and expressive MIDI (48 files), and 40 programmatically built per-map fixtures covering
  rubato, asynchrony, metrical accentuation, movement, imprecision and a combined case. These
  files are **immutable** — regenerating them is a governed act with its own provenance record.
- **Seven equivalence suites** compare against them: MEI ⇒ MSM/MPM cross-validation, full XML
  equivalence of the augmented MSM, performance equivalence, per-map equivalence, MIDI **byte**
  equivalence event by event, the MIDI export pipeline, and the layer-splitting pass (whose
  reference set lives beside the frozen one, in `tests/integration/fixtures-layers-to-staffs/`,
  and is generated the same way — see [PARITY.md §8](../PARITY.md)).
  They auto-discover every `.mei` fixture, so a missing reference is
  a **failure, not a skip**, and they canonicalize generated `meico_<uuid>` identifiers by
  first-occurrence order — which keeps `goto` → `marker` wiring verifiable rather than deleting it.
- **5434 tests across 126 files**, run as a gate (`npm run verify` = clean build + typecheck of the
  test sources + the full suite) before every single commit of the refactor that produced this
  codebase, and of every campaign since.
- **Byte probes for every refactor.** Beyond the suite, each structural change was proven with a
  pipeline probe: all fixtures pushed through MSM, MPM, augmented MSM, raw MIDI and expressive
  MIDI on both the old and the new tree, hashed, and compared — plus emitted-JavaScript diffs to
  show that "style-only" changes were style-only.
- **Negative controls.** Where a claim was load-bearing, the inverse was tested too: deliberately
  mutating the new code had to _break_ the probe, so that a green result proves the probe can see
  the thing it claims to check. Roughly a dozen such mutations are recorded in the journal, and the
  `AccentuationPatternDef` control is why we know a one-character "fix" there moves fixture bytes —
  which is why that fix shipped only once the Java fork had been patched and the affected ground
  truth regenerated from it.

## Running the gate

The whole byte surface is four suites, and they run in **about 2.5 seconds**:

```sh
npm run gate
```

That is `cross-validation` (MEI ⇒ MSM/MPM), `full-xml-equivalence` (the augmented MSM),
`midi-byte-equivalence` (event by event, `tickTolerance = 0`) and `all-maps-equivalence` (the 40
programmatic per-map fixtures) — 121 tests covering MSM+MPM text, augmented MSM, raw MIDI and
expressive MIDI, from both MEI input and programmatic MSM+MPM input. Their comparison strengths
differ and the difference matters: **`cross-validation` is the only strict string-equality
suite**, so it is the one that catches attribute order and numeric formatting; the others
compare per-attribute with a tolerance, or event by event.

Use it to iterate. It is not a substitute for `npm run verify` (clean build, typecheck of the
test sources, all 5750 tests), which stays the gate before every commit — and note that
`verify` does **not** run the formatter, so `npx prettier --check .` is a separate step.

There is deliberately no separate pipeline-probe script in the repo: the byte gate _is_ the
suite, which is why the suites auto-discover their fixtures and treat a missing reference as a
failure rather than a skip.

## The one accepted difference in generated output

Java's `Double.toString` writes `720.0` where JavaScript's `String(number)` writes `720`, so
every numeric attribute this port generates differs from the reference by a trailing `.0` —
1488 occurrences across the corpus, mostly `@date`, `@midi.pitch`, `@duration`, `@octave` and
`@accidentals`.

**This is accepted, not outstanding.** The two spellings parse to the same double, nothing
downstream distinguishes them, and the shorter one is better; reproducing Java's would mean a
formatting layer over the whole output path. The equivalence suite normalises it, and that is
the _only_ normaliser in `cross-validation` that forgives a real difference — the other two
cover generated UUIDs and file paths, which are genuinely incomparable. Three further
normalisers were deleted in August 2026 once it turned out they were hiding defects rather than
forgiving differences: a repeated `xmlns`, a hardcoded `encoding="UTF-8"`, and a metadata
comment that did not actually differ.

So "produces what meico produces" means, precisely: **byte-identical apart from the trailing
`.0` on whole numbers, generated identifiers, and file paths.**

## What this does not claim

Imprecision output is nondeterministic by design and is never byte-compared (see
[PARITY.md §4](../PARITY.md)); a short list of behaviours on malformed or unreachable input still
differs from the reference — those are enumerated in [PARITY.md §2](../PARITY.md) rather than
fixed; and the four features listed in the README as additions are outside the claim entirely,
because the Java library has no counterpart to be equivalent to:
[MPM v3 ornamentation](ornamentation.md) ([PARITY.md §6](../PARITY.md)), the
[expression transforms](expression.md) ([PARITY.md §7](../PARITY.md)), the
[comparison module](comparison.md), and the facade itself. Ornamentation is verified against the
specification and hand-computed vectors instead, in its own fixture directory — including the proof
that it moves no byte of anything above. [`Mei.layersToStaffs`](layers-to-staffs.md) is a third
case again: it exists upstream but postdates the reference fork, so ground truth for it was
constructed rather than exempted ([PARITY.md §8](../PARITY.md)).

## Where this deliberately differs from Java

The reference is the specification, so its bugs are reproduced rather than corrected. The
exception is an **obvious** bug, which is fixed provided the fix is proven not to move the bytes of
any reference fixture:

1. **The articulation hang is fixed.** `ArticulationData.articulateNote`'s
   `absoluteDurationChange` branch never terminates in Java (`ArticulationData.java:197`); the port
   uses the spelling Java's own `ArticulationDef.java:420-423` gives the same computation.
2. **The `movementMap` fixes are mirrored** from the maintained fork, and the reference fixtures
   were regenerated from it.
3. **`Msm.getMinimalPPQ` was repaired toward Java**, which uses integer division where the port
   had used float division.
4. **Both spellings of the two `Mpm.isInNamespace` typos are accepted** — the corrections as well
   as Java's `'accentuation '` and `'dynamcisGradient'`, so the vocabulary is a superset of the
   reference's.
5. **Malformed numeric attributes skip the def** instead of yielding one whose value is `NaN`,
   matching what `Double.parseDouble` plus Java's factory `catch` already did.
6. **A movement that cannot inherit a position is skipped**, where Java throws a
   `NullPointerException` and the port used to render it at position 0.
7. **The random-number provider rejects an unusable index** — `NaN`, infinite, or absurdly large —
   instead of overflowing the stack or allocating without bound, as both Java and the port did.
8. **The default namespace is declared once, not on every element.** `Element.toXML` emitted
   `xmlns` for every namespaced element where Java emits it only where the namespace changes,
   inflating a 2185-byte MPM to 3527. The equivalence suite had a normaliser that hid it, so
   this fix also **deleted the normaliser** — the suite now compares raw bytes on that
   question, and reinstating the defect turns 80 tests red.

9. **`AccentuationPatternDef.getAccentuationAt` ramps each segment to the next accentuation**,
   where a guard that can never hold (`i > size - 1`) made every segment ramp to the end of the
   whole pattern. This is the one fix that moves fixture bytes, so it shipped the way entry 2 did:
   the fork was patched first and the affected ground truth regenerated from it.

Full accounts, with Java line citations and the evidence for each, are in
[PARITY.md](../PARITY.md) — along with the differences left in place and the Java bugs reproduced
on purpose.
