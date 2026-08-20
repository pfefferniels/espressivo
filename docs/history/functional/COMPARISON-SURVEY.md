# `src/comparison` — loop-shape and algorithm survey

Produced by a survey agent on 2026-08-20 against tree `f55caa3`, and reproduced here verbatim
in substance because **the first copy existed only as a message to an agent outside the
conductor's session and was very nearly lost.** That was a process error in how the run was set
up, not a fault of the survey. Anything a survey finds goes in a file.

**Every line number below is "as at `f55caa3`" and will have drifted.** Every entry came from a
direct read, not from memory; the eight `filterMap` sites were re-verified immediately before
the agent's worktree was deleted. Items already done by other work are marked.

## Status at the time of filing

- **Item 9 (`anchorsOf`) — DONE**, commit `abe3758`. It was the survey's best find and is worth
  reading as a finished example: the function was quadratic (`anchors.find(...)` per atom) and
  its own docstring justified that with *"an array keeps that visible instead of relying on a
  second structure to remember it"* — a premise that is **factually wrong**, because JS `Map`
  preserves insertion order by specification. The code now carries that correction in place of
  the false claim.
- **The `measureGrid` accumulator — DONE**, commit `d3f4104`. Reported separately by the same
  agent; see PARITY-adjacent notes in that commit. The agent independently identified
  `rubatoCurve.ts:375`'s multiply-from-anchor as the sibling that does it correctly, which is
  the same one the fix cites.
- `corpus.collisions` was taken by `2fa2ebb`; the `raws` loops in tempoCurve / rubatoCurve /
  accentuationCurve / dynamicsCurve, `imprecisionLaws.listValues`, `editScript`'s replay-flag
  spans and `contextOf`'s percentile count were reported done by another agent.

## A. Actionable — direct read, no argument found against

`filterMap`, eight sites, each checked for FP reassociation, NaN behaviour, output-position
dependence and hot-path allocation:

1. `dimensions.ts:233-239` `coveredLength` — `.map().filter().sort()`, three arrays, and the map
   recomputes `Math.max`/`Math.min` for elements the filter discards. Surviving set and pre-sort
   order provably identical, so the `total +=` sequence is bit-for-bit unchanged.
2. `rubatoCurve.ts:442-447` `rubatoBottomSpans` — `.filter().map()` carrying `as number` on 446;
   the `=== null` test narrows it away. `filterMap` already imported at line 44.
3. `parts.ts:201-204` `matchScopes`/`numbered` — same shape, same cast (`scope.number as number`).
4. `aggregate.ts:378-386` `cellQuantizedDimensions` — `.filter().map()`; the field is already
   `readonly ComparisonDimension[]` at line 160.
5. `msm.ts:146-156` `readTimeSignatures` — push-with-skip. **Sort at 156.**
6. `accentuationCurve.ts:148-169` `readAccentuationPattern` — push-with-skip over
   `<accentuation>` children. **Sort at 169.**
7. `diff.ts:433-458` `attributeDeltas` — three `continue` guards, one push. **Sort at 458.**
8. `ornamentationDistance.ts:322` `composedSpread` — `.filter(s => !isBottom(s)).map(...)`, and
   line 321 already returned on `spreads.some(isBottom)`, so **the filter provably drops
   nothing**: two arrays, neither doing work.

> **The caveat on 5, 6 and 7.** `filterMap` returns `readonly T[]`, which has no `.sort`, so each
> forces a decision about the sort that follows. The tree's existing idiom
> `[...filterMap(...)].sort(cmp)` works. Do not let someone hit that type error and back the
> whole edit out.

10. `parts.ts:196-241` `matchScopes` — `partsA` filtered twice for complementary predicates
    (`number !== null` inside `numbered`, `number === null` at 229); `partsB` likewise. One
    `partitionWith` per side removes both. **Against:** it restructures `numbered` to take the
    `yes` half, and the A-block-before-B-block order at 226-228 is what makes the result
    symmetric under an a/b swap — that must survive.
11. `pedalCurve.ts:211-221` `inheritedPosition` — `for (const entry of entries.slice(1, index)
    .reverse())` returning on the first `movement`. That is `findLast` on the slice, and it drops
    one of two allocations. The `slice` already isolates the walk, so `reverse()` was never a
    mutation hazard, and the `j > 0` bound the docstring makes load-bearing lives in
    `slice(1, …)`, untouched.
12. `ornamentationDistance.ts:337-341` `composeAnchors` — `groups.set(key, [...(groups.get(key)
    ?? []), index])` **rebuilds the whole bucket per append, O(m²) per pool.** `groupBy`'s body
    is the linear form. **Against:** the key is `poolKey(atom, index)` and needs the index, which
    `groupBy`'s key function does not take. See E24.

## B. Needs a negative control before it moves

13. `accentuationCurve.ts:203-213` `accentuationAt` — a backwards scan reading `points[i]` and
    `points[i+1]`. It is `upperBoundBy(points, p => p.beat, beatPosition) - 1`; the tie case was
    verified by hand and both forms land on the **last** point of a tied run. **Against — a real
    behavioural difference at NaN.** Today a NaN `beatPosition` never fires the `>` test, the
    loop runs to the end and the interpolation returns NaN; under `upperBoundBy` the bound is 0,
    the index is −1, and it returns 0. `beatPosition` comes from `beatAt(...)` at line 427, tick
    arithmetic that can produce NaN. Also: `points` is sorted only because
    `readAccentuationPattern` sorts it — the type does not enforce it.
14. `msm.ts:222-227` `measurePositionAt` — same shape, same NaN split (last measure + `beat: NaN`
    today, `null` under `upperBoundBy`). Call sites `compare.ts:1017-1018` and `diff.ts:403-404`
    guard on `!== null` but not on finiteness.
15. `scape.ts:198-208` `binOf` — a linear scan over `edges.slice(1)`, **allocating a slice per
    call**, called once per atom in `binnedMass`. `Math.min(count - 1, partitionPoint(count,
    i => numberAt(edges, i + 1, EDGES) <= quarters))` preserves the "last bin is CLOSED at the
    window end" rule that `bin === count - 1` encodes, and line 203 already rejects out of range.
    **Against:** at `width === 0` every edge collapses to one value — still non-decreasing, so the
    bound holds, but re-derive rather than assume.

## C. Keeps, with the argument — as valuable as the actionable list

16. `aggregate.ts:554-559` `maximalScoringRuns` — the backwards scan for "last `k` with
    `L_k < candidate.leftTotal`" over a strictly-increasing list is a textbook `partitionPoint`
    **and it should stay a scan**: the comment at 551-553 states the qualifying run is usually the
    last, so the loop exits on its first comparison where a binary search always costs log n.
    Worse, a NaN score poisons `cumulative`, destroying the sortedness a binary search assumes.
    **Name `partitionPoint` in that comment as the considered-and-rejected alternative**, because
    a future reader will re-propose it.
17. The **`*SegmentAt` family** — six linear scans inside Gauss-Legendre quadrature, the genuine
    hot path: `accentuationCurve.ts:397-400`, `rubatoCurve.ts:399-402`, `pedalCurve.ts:516-519`,
    `dynamicsCurve.ts:401-404`, `articulationDefault.ts:224-227` and `:236-239`. **Decisive
    against, as written:** they differ in *which* covering segment they return — accentuation and
    rubato take the **first**, pedal and dynamics take the **last** — so one `upperBoundBy(…) - 1`
    reproduces two and not the other two, and none if segments overlap. `tempoCurve.ts:354` sorts
    by start tick but nothing asserts non-overlap. **If someone proves non-overlap, this is the
    largest performance item in the module.**
18. `clustering.ts:550-562` `silhouette` — two independent reasons to keep: `groupBy` returns
    `ReadonlyMap<K, readonly A[]>`, blocking the in-place bucket sort at 562; and it buckets item
    **indices** off `clusters.entries()`, so `groupBy` would hand back `[item, cluster]` tuples
    that all four read sites must destructure.
19. `values.ts:120-141` `resolveComparisonLevel` — part of the tree-wide `matchKind` keep. The
    local reason is worth recording: the file's own docstring at line 64 argues against
    combinator elimination for the sibling `Valued` union in as many words.
20. `embedding.ts:459-483` `seriationOrder` — double `.sort` on a locally-built array; falls under
    the settled `stableSortBy` keep. The comment at 473-474 spends a line asserting the stability
    a named helper would have carried.

## D. Performance, not loop shape

21. `tempoCurve.ts:313` and `dynamicsCurve.ts:299` — `raws.slice(index + 1).find(...)` **inside
    the loop over `raws`**: O(n²) plus an allocation per iteration. `raws.find((c, i) => i > index
    && …)` is the same answer with no slice.
22. `pedalCurve.ts:226` `endTicksOf` — same shape, `entries.slice(index + 1)`, called once per
    movement from the loop at 346.
23. Dead code: `ornamentationDistance.ts:322`'s filter, per item 8.

## E. Two prelude gaps

24. **`groupBy` has no index parameter**, where `filterMap`, `partitionWith` and `foldl` all do.
    It blocked two sites independently (item 12 needs `poolKey(atom, index)`; `silhouette` buckets
    indices). Two data points is not a mandate, but it is the only prelude signature that lost a
    site.
25. **The nine-copy idiom the prelude does not name.** MPM span ends are decided by the next
    entry's date, spelled `[...xs.slice(1).map(next => next.dateTicks), Infinity]` + `zipWith` at
    `accentuationCurve.ts:307`, `articulationDefault.ts:190`, `asynchronyCurve.ts:106`,
    `imprecisionLaws.ts:291`, `rubatoCurve.ts:290`, plus hand-rolled `nexts` at `msm.ts:192` and
    `pedalCurve.ts:396`, and `paired` at `tempoCurve.ts:298` and `dynamicsCurve.ts:284`.
    `pairwise` cannot serve it — it yields n−1 pairs and these need n with a sentinel.
    *(`withNext` was added for exactly this and now has call sites; the survey predates it.)*

    This is also why **`chunkBy` had zero uses and was right to delete**: it is the shape a reader
    mistakes for chunkBy, and the real chunkBy shape is absent — checked three ways: zero
    `current`/`previousKey` trackers in the module, every span builder is one-instruction-one-span,
    and `maximalScoringRuns` is Ruzzo–Tompa. `windows`: zero sites, every fixed-size walk here is
    size 2. `unfold`: zero — the four candidates are bounded counting loops or Newton iterations
    refining a float, not sequences built from a seed.

## F. Considered and rejected

**Multi-output loops** (two or three arrays, so `filterMap` cannot serve): `compare.ts:697-714`
`densityOf`; `compare.ts:1461-1473` `sharedCurves`; `msm.ts:108-114`; `pedalCurve.ts:254-353`;
`articulationAtoms.ts:266-330`; `ornamentAtoms.ts:439-628`; `articulationDefault.ts:121-183`;
`tempoCurve.ts:301-347`; `dynamicsCurve.ts:286-385`; `asynchronyCurve.ts:107-140`;
`imprecisionLaws.ts:292-320`.
**Output-position dependence:** `editState.ts:81-95` (`index: instructions.length`);
`compare.ts:898-903` (dedupe tests `x > last(grid)`).
**FP order:** `compare.ts:766-769` (Map of running sums, not buckets); `quadrature.ts:50-58`
`neumaierSum` (this *is* the compensation code); `drift.ts:72-79`; `corpus.ts:690-693` and
`:590-604` (deliberate label order, AD-72.1/72.2).
**Two accumulators:** `editState.ts:157-173`; `document.ts:276-292`; `clustering.ts:385-398`.
**Known keeps confirmed:** `corpus.ts:407-412/707-713`, `aggregate.ts:596-619`,
`embedding.ts:181-262`, `eventAlignment.ts:392-458`, `editScript.ts:412-509`.
**Not the shape:** `corpus.ts:108-152` `expand` (flatMap, one branch pushes N);
`document.ts:249-262` (`mapValues` over a Map, which the prelude has for `Record` only);
`plausibility.ts:57-99` (four nested loops; a nested filterMap allocates per entry);
`msm.ts:193-206` `measureGrid` (unfold cannot carry the bar counter nor return at MAX_MEASURES);
`clustering.ts:145-250` (two-cursor merge); first-match finds at `window.ts:81-90`,
`imprecisionLaws.ts:425-430`, `tempoCurve.ts:284`, `pedalCurve.ts:226-229`;
`pedalDistance.ts:102-105` (two set differences).
**Set-then-sort grid builders** (~14, the `[...set].sort()` shape where the spread IS the
materialization): `dimensions.ts:257-260`, `articulationDistance.ts:551-555`,
`aggregate.ts:432-461`, and the sibling readers.


---

## Addendum, 2026-08-21 — item 17 settled, and the survey corrects itself

The surveying agent re-read `src/comparison` at HEAD and **withdrew its own objection**, which
is the most useful thing in this document. Its original wording was: *"accentuation and rubato
take the FIRST covering segment, pedal and dynamics take the LAST, so one `upperBoundBy`
reproduces two and not the other two."* That framing does not survive the read. The readers do
differ — **but with disjoint segments the difference is unobservable**, because at most one
segment covers any tick. Item 17 is convertible for all six, not two.

**Four are provably disjoint.** In `accentuationCurve` and `rubatoCurve` every segment is
`[raw.dateTicks, next?.dateTicks ?? Infinity)` from `withNext(raws)`, and a skipped raw pushes
*nothing* — so the segments are a subsequence of the contiguous partition induced by consecutive
raw dates. Skips make gaps, never overlaps. Co-dated instructions give a zero-width `[d, d)`
that covers nothing, and the bound lands on the later real segment: same answer. `pedalCurve`'s
span-plus-hold abut by the ordering its own comment states, and the `UNBOUNDED_END_TICKS`
"resurrected movement" cannot overlap anything because the sentinel is only returned when no
later entry is named `movement`. `articulationDefault` is the same shape (read at `f55caa3`,
not re-read — treat as one step weaker).

**Two do overlap, harmlessly.** `tempoCurve` and `dynamicsCurve` push a skip gap running to the
*next valid* instruction, so two consecutive skips give `[d1, dv)` and `[d2, dv)`. Every
overlapping family shares its right endpoint, and only invalid raws can lie strictly inside a
gap — so nested-with-common-end preserves last-start-wins, which is the rule those two
`segmentAt`s implement.

**What actually blocks those two is not overlap but two clauses a bare bound drops:**

1. `if (ticks < segment.endTicks || !Number.isFinite(segment.endTicks))` — an Infinity-ended
   segment always counts as covering, so the containment test must carry the `!isFinite` arm.
2. `return found ?? (isNonEmpty(curve.segments) ? last(curve.segments) : null)` — when nothing
   covers, return the **last** segment rather than null. For `ticks` past the end that agrees
   with `upperBoundBy - 1`; for `ticks` *before* the first segment it does not. Likely
   unreachable (tempo pushes a `[0, firstValidDate)` segment and dates are non-negative), and
   the one thing to put a negative control on.

### The ordering assumption, which the survey flagged as unverified — checked

Everything above rests on `datedView`'s entries being date-ordered, which the survey could only
support from two comments. Read: `src/expression/datedView.ts:76-82` is an insertion loop
scanning backwards for the first `j` with `date >= entries[j].date`. It produces a
non-decreasing order **with one deliberate exception, documented at lines 19-27: a `NaN` date
falls through to `index = 0` and goes to the FRONT.**

So the assumption holds *except* for NaN, and a leading NaN makes the predicate
`key(xs[i]) <= target` **non-monotone**, which is exactly what `partitionPoint` assumes. That
looks like it should break the rewrite. It does not, and the reason is worth writing down:

> `partitionPoint` only ever probes index 0 once the search has narrowed to `[0, 1)`, and that
> requires `holds(mid)` to have been false for every `mid >= 1` — i.e. no later element
> satisfies the predicate. In that case the correct answer is "none", and both the bound and
> the linear scan return it. **A leading NaN can only be examined when it cannot change the
> answer.**

Confirmed by fuzz as well as by argument: 20,000 deterministic trials over non-decreasing
arrays with ties, out-of-range targets, and a leading NaN in half of them — `upperBoundBy(...) - 1`
and "last index whose key <= target" disagreed **zero** times.


## Addendum 2 — item 24 ruled: `groupBy` does not get an index parameter

The survey proposed it on the evidence of **two** blocked sites. Its author re-checked and found
the count was its own inflation; the real number is **zero**.

- **`silhouette` was never blocked by the index.** It buckets item *indices* keyed by cluster,
  so what it wants is a **value projection** — bucket something derived from the element rather
  than the element. An index parameter does not provide that: `groupBy(clusters, (cluster, item)
  => cluster)` still returns buckets of cluster values. It stays a keep for the two reasons
  already recorded, neither of which is the index.
- **`composeAnchors` is expressible today.** `groupBy` takes `Iterable<A>` (`seq.ts:251`) and
  `Array.prototype.entries()` is one, so `groupBy(atoms.entries(), ([index, atom]) =>
  poolKey(atom, index))` carries both halves in the tuple. Verified at HEAD by running it.

That form is **strictly better** than the parameter would have been. In
`ornamentationDistance.ts`, measured at HEAD: five `elementAt` calls go (354, 365, 366, 368,
380); `const [headIndex, headAtom] = head(members)` replaces `elementAt(members, 0,
POOL_MEMBERS)` with **no guard**, because `groupBy` returns a `NonEmptyArray`; and it fixes the
O(m²) bucket rebuild at line 344 that was the reason to reach for `groupBy` there at all — so
it closes items 12 and 24 together.

Against the prelude's own admission criterion — *the shapes this codebase actually contains,
and nothing added for completeness*, the rule that deleted `chunkBy`, `windows`, `unfold` and
`stableSortBy` for having zero call sites — zero blocked sites is a clear no.

**The technique generalises and is the durable part:** any "group a projection, keep the index"
site is `groupBy(xs.entries(), ([i, x]) => …)` with the signature as it stands. A genuine
*value mapper* would be a different function from an index parameter, and gets argued on its
own evidence if a third site ever wants one.
