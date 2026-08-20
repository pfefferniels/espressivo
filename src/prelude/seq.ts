/**
 * Named algorithms over sequences — the vocabulary that replaces raw loops.
 *
 * `src/` carries 809 `for` loops, 42 `while` loops, 543 `let` declarations and 383 `.push`
 * calls (measured 2026-08-20; the figures this header opened with — 862 / 46 / 540 / 407 —
 * were taken before the uptake pass). Most are one of a handful of shapes wearing different
 * variable names: map-and-filter in one pass, group by a key, fold with a running total, scan
 * a sorted array for a boundary. Written out, each is a place an off-by-one can hide; named,
 * each is a thing the reader already knows.
 *
 * **The admission criterion is Sean Parent's own.** Using an algorithm must not make the call
 * site worse — so this module holds the shapes this codebase actually contains, and nothing
 * added for completeness. There is no `gather`, no `slide`, no lens, no transducer.
 *
 * **The criterion cuts both ways, and it has been measured against.** Three independent
 * surveys of `src/` (comparison, mpm+msm, expression+xml+midi) went looking for each shape by
 * hand. Call sites outside this module, as of 2026-08-20:
 *
 *     elementAt 133   pairwise 25   filterMap 20   numberAt 19   zipWith 10
 *     withNext 9      optionAt 7    matchKind 7    groupBy 6     elementAtOrNull 6
 *     upperBoundBy 4  foldl 4       lowerBoundBy 2 scanl 2       partitionWith 1
 *     insertionIndexBy 1
 *     chunkBy 0       windows 0     unfold 0       stableSortBy 0
 *
 * The four zeroes are not a backlog; each was looked for and is not there.
 *
 * - `chunkBy` — runs of CONSECUTIVE elements sharing a key. Every span builder in the tree is
 *   "one instruction opens one span", never "consecutive instructions sharing a key form one";
 *   MPM span ends are decided by the next entry's DATE, which is {@link withNext}, not by a
 *   key changing. `aggregate.maximalScoringRuns` looks like it and is Ruzzo–Tompa.
 * - `windows` — every fixed-size walk in the tree is size 2, i.e. `pairwise` or `withNext`.
 * - `unfold` — the one linked-list walk (`tree.getAllPreviousSiblingElements`) reads better as
 *   a `while`: a seed/step split returning a tuple is harder to follow than "walk back,
 *   collecting", and the spread needed to keep the mutable return type costs an array.
 * - `stableSortBy` — the tree already spreads before sorting at ~35 sites and sorts only
 *   freshly-built local arrays at the rest. Nothing mutates a caller's array, so there is no
 *   mistake left for it to prevent; renaming those sites would buy a name and no safety.
 * - `partitionWith`'s single use is real, but its two candidate sites both declined it for the
 *   same reason: it does not NARROW. `parts.matchScopes` would still need `filterMap` for the
 *   half whose key must be non-null, and `selection.resolveSelection`'s two halves have
 *   DIFFERENT types, which is `partitionResults`, not this.
 *
 * If a future pass finds a real site for one of the four, good. If not, they should go — this
 * module's whole claim is that it is stocked from the code rather than from a catalogue.
 *
 * **On allocation.** Every function here allocates one output array and no intermediates,
 * because the rendering path was just made linear (commit `980ae7e`) and must stay that way.
 * {@link filterMap} exists precisely so that `.map(...).filter(...)` — two arrays — becomes
 * one. Where a caller needs to fuse further, it should fold.
 */

/** A sequence that is known to have a first element, so `head` needs no null check. */
export type NonEmptyArray<T> = readonly [T, ...(readonly T[])];

/*
 * A NOTE ON THE `as` CASTS BELOW — there are ten, and they are the only ones in this module.
 *
 * `noUncheckedIndexedAccess` is on, so `xs[i]` is `T | undefined`. In each case below the
 * index is in range by a proof the type system cannot state: `last` reads the final slot of a
 * type that guarantees a first one; `zipWith` bounds `i` by the shorter length; `pairwise`
 * starts at 1; the two bound searches probe an index `partitionPoint` derived from
 * `xs.length`. For an unconstrained `T` there is no narrowing that expresses this — a runtime
 * check would be dead code, and constraining the element type would stop these working over
 * sequences that may legitimately hold `null` or `undefined`, which several callers need.
 *
 * Three of the ten are a different proof: `chunkBy`, `scanl` and `groupBy` each BUILD a
 * sequence they know to be non-empty — a chunk opens as `[x]`, a scan starts from its seed, a
 * bucket is created as `[x]` — and say so in their return type. The cast is what carries that
 * from the construction to the signature, and it earns its place at every call site, which
 * would otherwise need a guard that can never fire to read a first element.
 *
 * They are concentrated here on purpose. This module implements the algorithms whose whole
 * job is to let the rest of the tree stop indexing; absorbing ten proofs in one leaf is what
 * bought zero across fifteen directories. If you are tempted to copy the pattern outward, the
 * answer is almost certainly `filterMap`, `pairwise`, `zipWith` or `elementAt` instead.
 */
export function isNonEmpty<T>(xs: readonly T[]): xs is NonEmptyArray<T> {
  return xs.length > 0;
}

export function head<T>(xs: NonEmptyArray<T>): T {
  return xs[0];
}

export function last<T>(xs: NonEmptyArray<T>): T {
  return xs[xs.length - 1] as T;
}

/**
 * Checked random access.
 *
 * For the reads that survive the algorithms — where the index came from a computation rather
 * than from iterating. Under `noUncheckedIndexedAccess` those are the sites that cannot be
 * typed away, and the two dishonest answers are `!` and `as T`: both assert the bound instead
 * of checking it, and both fail somewhere else entirely when the assertion is wrong, usually
 * as "cannot read property of undefined" several frames from the mistake. The message is the
 * whole value here — "index 42 outside a 12-entry eigenvector column" locates a bug that
 * "cannot read property of undefined" does not.
 *
 * These lived in three places before this — `src/comparison/indexing.ts`, `src/mei/indexing.ts`
 * and here — each written independently because `no-unnecessary-condition` deletes any guard
 * written against an indexed read while the flag is still off, so a generic helper is the only
 * thing that survives both states. Two of the three authors believed a layer boundary stopped
 * them importing this one. It does not: the prelude is a leaf and no zone forbids it.
 *
 * **Prefer not needing them.** A loop that reads `xs[i]` and pushes is {@link filterMap}; one
 * that reads `xs[i]` and `xs[i + 1]` is {@link pairwise}; one walking two sequences together
 * is {@link zipWith}. Reach for these only once those do not fit.
 */
// These test `xs[index] === undefined` and NOT `xs[index] ?? outOfRange(...)`. The two agree
// for every type the signature admits and differ for one that lies about itself, which this
// tree contains: `RandomNumberProvider.series` is declared `number[]` and holds `null` on a
// documented degenerate path, where the null coerces to 0 and yields the delta-0 that
// `tests/comparison/imprecisionLaws.test.ts` pins. `??` reads that legitimate null as a miss
// and throws; three tests caught it when this file briefly used it.
//
// This block carried an `eslint-disable` for `no-unnecessary-condition` until
// `noUncheckedIndexedAccess` was turned on, because the rule resolves against the project
// config and read the comparison as impossible while the flag was off. The flag is on; the
// comparisons are necessary; the disable is gone.
function outOfRange(index: number, length: number, what: string): never {
  throw new RangeError(
    `index ${String(index)} is outside ${what}, which has ${String(length)} entries`,
  );
}

/**
 * `xs[index]`, or a `RangeError` naming the index, the bound and the sequence.
 *
 * The element type excludes `null` and `undefined` so that the presence test means what it
 * says: over a sequence that may legitimately hold nullish elements this would report a false
 * miss, and such a sequence wants {@link optionAt} or the option combinators instead.
 */
export function elementAt<T extends NonNullable<unknown>>(
  xs: readonly T[],
  index: number,
  what: string,
): T {
  // `=== undefined`, deliberately, and NOT `?? outOfRange(...)`. The two agree for every type
  // the signature admits, and differ for one that lies about itself — which this codebase
  // contains. `RandomNumberProvider.series` is declared `number[]` and genuinely holds `null`
  // on a documented degenerate path: a triangular distribution whose limits are both absent
  // hits `upperLimit === lowerLimit` and returns `upperLimit`, i.e. `null`. That null then
  // coerces to 0 in the arithmetic downstream, which IS the delta-0 that
  // `tests/comparison/imprecisionLaws.test.ts` pins — and `NaN` would not be equivalent,
  // because `null + 5` is 5 where `NaN + 5` is NaN. A `??` test reads that legitimate null as
  // a miss and throws. Three tests caught it.
  const value = xs[index];
  if (value === undefined) outOfRange(index, xs.length, what);
  return value;
}

/**
 * `xs[index]`, or `null` where the index misses.
 *
 * For callers whose index came from OUTSIDE — a `performance: 7` in an option bag is a
 * question about the document, and "there is no seventh performance" answers it rather than
 * indicating a defect.
 */
export function elementAtOrNull<T extends NonNullable<unknown>>(
  xs: readonly T[],
  index: number,
): T | null {
  return xs[index] ?? null;
}

/**
 * `xs[index]` over a sequence whose elements may legitimately be `null`.
 *
 * A read past the end still throws — the two absences are different questions, and collapsing
 * them is what loses the distinction {@link elementAt} exists to keep.
 */
export function optionAt<T>(xs: readonly (T | null)[], index: number, what: string): T | null {
  if (index < 0 || index >= xs.length) outOfRange(index, xs.length, what);
  return xs[index] ?? null;
}

/**
 * As {@link elementAt}, for a numeric buffer — a `Float64Array`, an `Int8Array`, or a plain
 * `number[]` used as one.
 *
 * A separate name because a typed array is not an `Array` and satisfies no `readonly T[]`
 * parameter, and a DP table is a typed array for the reason typed arrays exist: one allocation
 * rather than a boxed row per line.
 */
export function numberAt(
  buffer: { readonly [index: number]: number; readonly length: number },
  index: number,
  what: string,
): number {
  const value = buffer[index];
  if (value === undefined) outOfRange(index, buffer.length, what);
  return value;
}

/** The last element satisfying the predicate, or `null`. A backwards scan, named. */
export function findLast<T extends NonNullable<unknown>>(
  xs: readonly T[],
  predicate: (x: T) => boolean,
): T | null {
  for (let i = xs.length - 1; i >= 0; --i) {
    const x = xs[i];
    if (x !== undefined && predicate(x)) return x;
  }
  return null;
}

/** Remove and return `xs[index]`, or `null` where the index misses. Mutates. */
export function removeAt<T extends NonNullable<unknown>>(xs: T[], index: number): T | null {
  if (index < 0 || index >= xs.length) return null;
  const [removed] = xs.splice(index, 1);
  return removed ?? null;
}

/**
 * Map and filter in one pass: `f` returns `null` for the elements to drop.
 *
 * The single most common loop shape in this tree — "walk the children, parse each, skip the
 * ones that do not apply, collect the rest" — and the reason `.map().filter()` should be rare:
 * that spelling builds an intermediate array and then makes the reader prove the filter
 * narrowed the type.
 */
export function filterMap<A, B>(
  xs: Iterable<A>,
  f: (a: A, index: number) => B | null,
): readonly B[] {
  const out: B[] = [];
  let index = 0;
  for (const x of xs) {
    const y = f(x, index++);
    if (y !== null) out.push(y);
  }
  return out;
}

/** Split by a predicate, keeping both halves and their order. */
export function partitionWith<A>(
  xs: Iterable<A>,
  predicate: (a: A, index: number) => boolean,
): { readonly yes: readonly A[]; readonly no: readonly A[] } {
  const yes: A[] = [];
  const no: A[] = [];
  let index = 0;
  for (const x of xs) (predicate(x, index++) ? yes : no).push(x);
  return { yes, no };
}

/**
 * Bucket by a derived key, preserving encounter order within each bucket.
 *
 * **Both orders are guaranteed, and callers depend on both.** Within a bucket, the order is
 * the order the elements were met. Across buckets, it is the order the keys were FIRST met —
 * `Map` iteration order is insertion order by specification (ECMA-262, `%Map.prototype%`
 * `[@@iterator]`), not an implementation detail. That is worth stating because a call site in
 * `src/comparison` was written as an array-plus-linear-search specifically to avoid "relying
 * on a second structure to remember" the order, which cost it a quadratic scan for a
 * guarantee it already had.
 *
 * A bucket is created as `[x]` and only ever grown, so it cannot be empty — and unlike
 * {@link chunkBy}, whose chunks carry the same invariant, this signature used to hide it.
 * Saying `NonEmptyArray` means a caller reading the group's first element does not need a
 * guard that can never fire or a checked read that can never miss. The cast is the same one
 * `chunkBy` makes, for the same reason, and it is covered by the note at the top of this file.
 */
export function groupBy<A, K>(xs: Iterable<A>, key: (a: A) => K): ReadonlyMap<K, NonEmptyArray<A>> {
  const out = new Map<K, A[]>();
  for (const x of xs) {
    const k = key(x);
    const bucket = out.get(k);
    if (bucket === undefined) out.set(k, [x]);
    else bucket.push(x);
  }
  return out as unknown as ReadonlyMap<K, NonEmptyArray<A>>;
}

/**
 * Split into runs of consecutive elements that share a key — the *ordered* sibling of
 * {@link groupBy}, which is what a date-sorted instruction list usually wants.
 */
export function chunkBy<A>(xs: Iterable<A>, key: (a: A) => unknown): readonly NonEmptyArray<A>[] {
  const out: A[][] = [];
  let current: A[] | null = null;
  let currentKey: unknown = null;
  for (const x of xs) {
    const k = key(x);
    if (current === null || k !== currentKey) {
      current = [x];
      currentKey = k;
      out.push(current);
    } else {
      current.push(x);
    }
  }
  return out as unknown as readonly NonEmptyArray<A>[];
}

/** Left fold. Named so that a loop whose only job is to accumulate stops looking like control flow. */
export function foldl<A, B>(xs: Iterable<A>, seed: B, step: (acc: B, a: A, index: number) => B): B {
  let acc = seed;
  let index = 0;
  for (const x of xs) acc = step(acc, x, index++);
  return acc;
}

/**
 * A fold that keeps every intermediate state, seed first.
 *
 * **NARROWED, 2026-08-20.** This used to claim it was "the shape of every running quantity
 * over musical time loop — a running date, a running tempo, an accumulated tick offset". A
 * survey went through those loops and the claim is false as stated: `Midi.buildTrackChunk`'s
 * `lastTick`, `Sequence.getMicrosecondLength`'s tempo integration and the applier's running
 * maximum all want only the FINAL state, or write side effects per step. Those are `foldl`,
 * or a loop, and `scanl` would make each of them worse.
 *
 * The distinguishing question is not "is there a running quantity" but **"does anything read
 * the intermediate states?"** — and where the answer is yes, the payoff is usually more than
 * vocabulary. `datedView.styleNamesOf` is the one site found: "the `<style>` in scope at view
 * position i" is a running quantity whose every state is wanted, and its caller was getting
 * them by re-running a backwards scan once per index, quadratically. As a `scanl` it is one
 * forward pass.
 *
 * Note the seed-first indexing when zipping states back against the elements that produced
 * them: `out[i + 1]` is the state AFTER consuming `xs[i]`, and `out[0]` is the seed.
 */
export function scanl<A, B>(
  xs: Iterable<A>,
  seed: B,
  step: (acc: B, a: A, index: number) => B,
): NonEmptyArray<B> {
  const out: B[] = [seed];
  let acc = seed;
  let index = 0;
  for (const x of xs) {
    acc = step(acc, x, index++);
    out.push(acc);
  }
  return out as unknown as NonEmptyArray<B>;
}

/** Combine two sequences elementwise, stopping at the shorter. */
export function zipWith<A, B, C>(
  as: readonly A[],
  bs: readonly B[],
  f: (a: A, b: B, index: number) => C,
): readonly C[] {
  const n = Math.min(as.length, bs.length);
  const out: C[] = new Array<C>(n);
  for (let i = 0; i < n; ++i) out[i] = f(as[i] as A, bs[i] as B, i);
  return out;
}

/**
 * Each element paired with its successor.
 *
 * "How long until the next onset", "does this instruction reach the next one" and every other
 * gap computation in the renderer is a `pairwise`, written today as a loop that indexes `i`
 * and `i + 1` and has to special-case the end.
 */
export function pairwise<A>(xs: readonly A[]): readonly (readonly [A, A])[] {
  const out: (readonly [A, A])[] = [];
  for (let i = 1; i < xs.length; ++i) out.push([xs[i - 1] as A, xs[i] as A]);
  return out;
}

/**
 * Each element paired with its successor, and the last one paired with `null`.
 *
 * **This is the shape this codebase contains, and {@link pairwise} is not it.** `pairwise`
 * yields `n − 1` pairs and drops the last element; a span reader needs `n`, because the last
 * instruction is a span too — it just runs to the end of time instead of to a successor. That
 * difference is exactly what every one of those readers had to special-case, and nine of them
 * special-cased it by hand, in two spellings:
 *
 * ```ts
 * const nexts: readonly (T | null)[] = [...xs.slice(1), null];        // ×4
 * const endsAt = [...xs.slice(1).map((n) => n.dateTicks), Infinity];  // ×5
 * for (const [at, after] of zipWith(xs, nexts, (a, b) => [a, b] as const)) …
 * ```
 *
 * The second is the first composed with a projection and a default, so one primitive serves
 * both: `next?.dateTicks ?? Infinity` says at the point of USE what the sentinel means, where
 * an `Infinity` buried in an array-building expression did not. Both spellings also built a
 * whole intermediate array only to zip it away; this builds one.
 *
 * A `null` second element means "there is no successor", never "the successor is null" — the
 * sequence's own elements are untouched, so a sequence that legitimately holds nulls still
 * reports its real last entry correctly.
 *
 * It earns its place by this module's own criterion — nine call sites, none of them reachable
 * with anything already here — which is more evidence than `chunkBy`, `windows`, `unfold` and
 * `partitionWith` have between them.
 */
export function withNext<A>(xs: readonly A[]): readonly (readonly [A, A | null])[] {
  const out: (readonly [A, A | null])[] = new Array<readonly [A, A | null]>(xs.length);
  for (let i = 0; i < xs.length; ++i)
    out[i] = [xs[i] as A, i + 1 < xs.length ? (xs[i + 1] as A) : null];
  return out;
}

/** Overlapping windows of the given size; empty if the sequence is shorter than one window. */
export function windows<A>(xs: readonly A[], size: number): readonly (readonly A[])[] {
  if (size <= 0) return [];
  const out: (readonly A[])[] = [];
  for (let i = 0; i + size <= xs.length; ++i) out.push(xs.slice(i, i + size));
  return out;
}

/** Build a sequence from a seed, until the step returns null. The dual of {@link foldl}. */
export function unfold<S, A>(seed: S, step: (state: S) => readonly [A, S] | null): readonly A[] {
  const out: A[] = [];
  let state = seed;
  for (;;) {
    const next = step(state);
    if (next === null) return out;
    out.push(next[0]);
    state = next[1];
  }
}

/**
 * Sort without disturbing the order of equal elements, and without mutating the input.
 *
 * `Array.prototype.sort` is in-place, which makes it a mutation of whatever the caller passed;
 * it is specified as stable in modern engines, but the in-place part is the hazard here, since
 * a sorted view of someone else's array silently reorders theirs.
 */
export function stableSortBy<A>(xs: readonly A[], compare: (a: A, b: A) => number): readonly A[] {
  return xs.slice().sort(compare);
}

/**
 * The first index at which the predicate stops holding, for a sequence already partitioned so
 * that every element satisfying it precedes every element that does not. `O(log n)`.
 *
 * This is C++'s `std::partition_point`, and it is the primitive underneath every binary search
 * in this codebase. Expressing the four hand-written searches in
 * `src/mpm/elements/maps/GenericMap.ts` in terms of it is the point: each of those is a
 * separately-debugged variant of the same six lines, carrying a comment that says every
 * comparison is load-bearing and must not be touched.
 */
export function partitionPoint(length: number, holds: (index: number) => boolean): number {
  let low = 0;
  let high = length;
  while (low < high) {
    const mid = low + Math.floor((high - low) / 2);
    if (holds(mid)) low = mid + 1;
    else high = mid;
  }
  return low;
}

/**
 * The first index whose key is **not less than** `target` — `std::lower_bound`.
 * Returns `xs.length` when every key is smaller.
 */
export function lowerBoundBy<A>(xs: readonly A[], key: (a: A) => number, target: number): number {
  return partitionPoint(xs.length, (i) => key(xs[i] as A) < target);
}

/**
 * The first index whose key is **greater than** `target` — `std::upper_bound`.
 * Returns `xs.length` when no key is larger.
 */
export function upperBoundBy<A>(xs: readonly A[], key: (a: A) => number, target: number): number {
  return partitionPoint(xs.length, (i) => key(xs[i] as A) <= target);
}

/**
 * The index at which `x` must be inserted to keep `xs` sorted, placing it **after** any equal
 * element — the position a stable sort would have chosen.
 *
 * `Track.add` used to re-sort the whole track on every insert; commit `980ae7e` replaced that
 * with exactly this computation, written out by hand. This is that computation, named.
 */
export function insertionIndexBy<A>(
  xs: readonly A[],
  key: (a: A) => number,
  target: number,
): number {
  return upperBoundBy(xs, key, target);
}
