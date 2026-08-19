/**
 * Named algorithms over sequences — the vocabulary that replaces raw loops.
 *
 * `src/` carries 862 `for` loops, 46 `while` loops, 540 `let` declarations and 407 `.push`
 * calls. Most are one of a handful of shapes wearing different variable names: map-and-filter
 * in one pass, group by a key, fold with a running total, scan a sorted array for a boundary.
 * Written out, each is a place an off-by-one can hide; named, each is a thing the reader
 * already knows.
 *
 * **The admission criterion is Sean Parent's own.** Using an algorithm must not make the call
 * site worse — so this module holds the shapes this codebase actually contains, and nothing
 * added for completeness. There is no `gather`, no `slide`, no lens, no transducer.
 *
 * **On allocation.** Every function here allocates one output array and no intermediates,
 * because the rendering path was just made linear (commit `980ae7e`) and must stay that way.
 * {@link filterMap} exists precisely so that `.map(...).filter(...)` — two arrays — becomes
 * one. Where a caller needs to fuse further, it should fold.
 */

/** A sequence that is known to have a first element, so `head` needs no null check. */
export type NonEmptyArray<T> = readonly [T, ...(readonly T[])];

export function isNonEmpty<T>(xs: readonly T[]): xs is NonEmptyArray<T> {
  return xs.length > 0;
}

export function head<T>(xs: NonEmptyArray<T>): T {
  return xs[0];
}

export function last<T>(xs: NonEmptyArray<T>): T {
  // Non-emptiness is carried by the type, which index signatures cannot see.
  return xs[xs.length - 1];
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

/** Bucket by a derived key, preserving encounter order within each bucket. */
export function groupBy<A, K>(xs: Iterable<A>, key: (a: A) => K): ReadonlyMap<K, readonly A[]> {
  const out = new Map<K, A[]>();
  for (const x of xs) {
    const k = key(x);
    const bucket = out.get(k);
    if (bucket === undefined) out.set(k, [x]);
    else bucket.push(x);
  }
  return out;
}

/**
 * Split into runs of consecutive elements that share a key — the *ordered* sibling of
 * {@link groupBy}, which is what a date-sorted instruction list usually wants.
 */
export function chunkBy<A, K>(xs: Iterable<A>, key: (a: A) => K): readonly NonEmptyArray<A>[] {
  const out: A[][] = [];
  let current: A[] | null = null;
  let currentKey: K | null = null;
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
 * This is the shape of every "running quantity over musical time" loop — a running date, a
 * running tempo, an accumulated tick offset — which today is written as a `let` outside a
 * `for` and read back after it. `scanl` makes the states a value, so they can be zipped
 * against the events that produced them.
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
  for (let i = 0; i < n; ++i) out[i] = f(as[i], bs[i], i);
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
  for (let i = 1; i < xs.length; ++i) out.push([xs[i - 1], xs[i]]);
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
  return partitionPoint(xs.length, (i) => key(xs[i]) < target);
}

/**
 * The first index whose key is **greater than** `target` — `std::upper_bound`.
 * Returns `xs.length` when no key is larger.
 */
export function upperBoundBy<A>(xs: readonly A[], key: (a: A) => number, target: number): number {
  return partitionPoint(xs.length, (i) => key(xs[i]) <= target);
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
