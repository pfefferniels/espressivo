# The functional-core campaign — what happened, and what is left

Branch `functional-core`, opened 2026-08-19. The ask, from the repository owner: bring the
architecture closer to a functional approach with a strong type system, make the code smell
less like Java and more like something Sean Parent would sign off on — **down to the level of
individual expressions, not only the architecture**. The only hard gate: byte-equivalence with
the Java reference, and the test suite.

This file is the record. `ARCHITECTURE.md`'s superseding box says which of the old rules this
overturned; `PARITY.md` is the live divergence ledger. Neither is repeated here.

## The numbers

| | branch point | now |
| --- | --- | --- |
| ESLint findings in `src/` | 1053 | 94 |
| `src/` directories at zero | 5 of 10 | 8 of 10 |
| non-null assertions in `src/` | 841 | 42 |
| `noUncheckedIndexedAccess` in `src/` | 885 errors, flag off | 0, **flag on** |
| `for (let …)` loops in `src/` | 337 | 199 |
| converter ambient cursors | 8 | 0 |
| tests | 5480 | 6204 |
| `convertMeiToMsmMpm`, 4000-note score | 32,100 ms | 235 ms |

200 commits, 249 files.

## The diagnosis, and whether it held up

The opening claim was that **the live XOM DOM being the domain model is the root cause**, and
that everything else — 841 non-null assertions, two-phase construction, 63 `extends` edges, a
static mutable factory registry — follows from it. The evidence offered was that all 953 of
`src/`'s ESLint findings sat in the five Java-idiom layers and the five functional layers had
none.

That held up, and the distribution held up in reverse as the work went on: the findings drained
in the order the layers were touched, and `src/msm` — the one layer nobody had touched — became
the worst directory in the repo at 126 while everything around it fell. It is now at zero.

## What got done

**Milestones 1–5, 7, 8 of the plan.** `src/prelude/` (1088 lines) is the campaign's vocabulary:
`Result`, the accumulating `collect`, combinators over `T | null` rather than a boxed `Maybe`,
the ordered-lookup family that replaced four hand-rolled binary searches, `matchKind` for
exhaustive dispatch. The MPM class hierarchies are discriminated unions with dispatch tables,
and the static factory registry and its `sideEffects` entries are gone.
`Mei2MsmMpmConverter`'s eight ambient cursors are one threaded `WalkContext` across 58 methods
and 219 call sites, and its 532 non-null assertions are zero. `noUncheckedIndexedAccess` is on
repo-wide for `src/`, cleared directory by directory against a one-way ratchet, and cleared by
**removing the indexing** — zero `!` and zero `as` were added across the whole of it.

**`Performance.perform` is a fold, and six of its ordering rules are compile errors.** `Timed<T>`
generalised into `At<S, P>` over three phases, so hoisting a millisecond pass above the tempo
pass now fails to compile. Each of the six was verified by breaking it. Two justifications
already in the codebase turned out to be false and were corrected in place.

## Milestone 6 — the MSM model — is deliberately NOT done

The plan called for `parse : Element -> Validation<Model, ParseError[]>` and
`serialize : Model -> Element` for MSM, as had worked for MPM. A read-only study
(`MSM-MODEL-STUDY.md`) measured what that would cost and the answer is no, for a reason nobody
had before it was looked for:

> The render holds `Attribute` **objects as handles** and writes through them after the
> elements have gone out of scope. `ImprecisionMap.shakeTimingOffsets` goes
> `entry.getValue().getParent()` — from an attribute handle back up to its owning element — to
> read that note's `midi.pitch` so two voices on the same pitch keep the same offset.

A record has no such identity. So `perform` cannot fold over immutable records without a second
rewrite of `ImprecisionMap` (821 lines, under the strictest randomness contract in the port:
seeds derive from a call ordinal, so any change to draw order is byte-visible), `RubatoMap`'s
pending-durations pass, and `GenericMap`'s live index. The plan assumed MSM was like MPM — a
document you parse, hold, and serialize. It is a mutable substrate that 21 render passes write
into, and that was not knowable before the census.

Building the model without adopting it was also rejected, and the study's own argument for it
did not survive checking: it counted three independent MSM readers, but `src/comparison/msm.ts`
imports `readMsmFacts`, calls it, and holds the result as a field. Two readers, not three. A
model nothing uses would be a *fourth* reading of the document — the incidental-data-structure
problem this campaign exists to remove.

## The part that generalises: the oracle was weaker than the code

Roughly forty green negative controls across the campaign. The pattern behind most of them:
**a suite that looks like a byte gate but compares less than it appears to.**

- `full-xml-equivalence` and `all-maps-equivalence` loaded each side's attributes into a `Map`
  keyed on name and iterated the reference's. Reversing the attribute order on every `<note>`
  of a reference file left both green, and so did adding an attribute Java does not have —
  `full-xml-equivalence` had an extra-attribute loop with an **empty body**. Both now checked;
  cost, 24 fixtures, 0 mismatches. It matters because on this corpus **attribute order encodes
  which render passes touched a note**.
- `midi-byte-equivalence` — the suite that certifies the port's actual output — compared a meta
  event's **type byte and nothing else**. 1024 meta events in the corpus, so a wrong tempo, time
  signature, key signature or track name passed. `programChange` matched none of its three
  branches, so 58 instrument numbers were compared by nothing. `noteOff` velocity was excluded
  by a `te.type === 'noteOn' &&`. Two people found this gap independently on the same day.
- `performance-equivalence` carried a 25-line, eight-rule normaliser **that nothing called**.
  Found by auditing its rules one at a time and getting green on every single removal, which is
  not a result seven independent forgivenesses can produce.
- `cross-validation` shed five normalisers, four of which were hiding real divergences from
  Java. The fifth audit found the divergence the fourth had missed *because the fourth audited
  only the normalisers it could see* — a bare `.trim()` sat past the named ones and was covering
  a missing trailing newline on every document.

**Fixture coverage is the other half, and two of its gaps are now closed.** The corpus contained
no `<pedal>` element at all — all 50 `pedalMap`s empty — and set `subNoteDynamics` nowhere, so
every `channelVolumeMap` had exactly one entry at date 0. Both now have Java ground truth,
generated from `meico@1d662105` (the same fork commit as every other reference family) into
`fixtures-pedal/` and `fixtures-subnote-dynamics/`, each with its generator and provenance
committed alongside.

The pedal measurement is the one that shows why this mattered: **breaking the pedal path leaves
all 6204 existing tests green.** Routing every pedal to the global map regardless of `@staff` —
one line — passes the byte gate and the whole suite. So does deleting the `@endid` deferred
resolution. `subNoteDynamics` turned out narrower and the difference was worth measuring rather
than assuming: forcing it off leaves the gate green but reds two existing tests, one asserting
the attribute is *parsed* and one of milestone 5's ordering edges that incidentally depends on
it. So its reading was covered; its rendered output had never been compared to Java.

**What remains uncovered:** no fixture contains a `<phrase>`, a `<tupletSpan>`, or a malformed
`<part>` — though `Performance.readFrom` has documented that skip since the port was written —
and `programChangeMap` appears in no byte-compared MIDI fixture. The imprecision fixtures are
compared with imprecision-affected attributes filtered out, correctly, which makes every
RNG-draw-order edge unverifiable against the reference **by construction**. Where the gate
cannot reach, the tests have to be written first.

Turning the checks on found one real divergence: `attribute()` matched qualified names where
XOM matches local ones, so `getAttributeValue('xml:id', n)` returned an id where Java's
`Helper` returns `""`. 524 MIDI text events across 22 fixtures, and every one of Java's 105
`@modified` attributes empty against ours full. Fixed; see PARITY.md, which also leaves the
judgement call open, because the fix makes this port emit *less* information than it did.

## What is left

- `src/mpm` 70 findings, `src/xml` 14, `src/mei` 10. In progress.
- `tests/` is at 189 under `noUncheckedIndexedAccess`, opted out in `tsconfig.tests.json` and
  held monotonic by `scripts/strict-ratchet.mjs`.
- ~84 `console.*` in `src/`, nearly all the warn-and-repair species: the value continues, so
  converting one changes the success path too. A separate argument, not a sweep.
- The `Result`s that `Mpm.parseData` and friends now receive are flattened with
  `unwrapOr(…, null)`. The reason exists where a caller could be handed it; nothing hands it on.
- The MSM model, deferred above, and the render rewrite it would need.
