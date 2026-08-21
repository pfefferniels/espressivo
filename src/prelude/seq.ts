/**
 * Named algorithms over sequences — the vocabulary that replaces raw loops.
 *
 * Most loops in the tree are one of a handful of shapes wearing different variable names:
 * map-and-filter in one pass, group by a key, fold with a running total, scan a sorted array
 * for a boundary. Written out, each is a place an off-by-one can hide.
 *
 * Admission is by call site: this module holds the shapes the codebase actually contains, and
 * nothing added for completeness. There is no `gather`, no `slide`, no lens, no transducer.
 * Four more were searched for across the tree and not found, and are absent on purpose:
 *
 * - `chunkBy` — runs of consecutive elements sharing a key. Every span builder here is "one
 *   instruction opens one span", and MPM span ends are decided by the next entry's date, which
 *   is {@link withNext}. `aggregate.maximalScoringRuns` resembles it and is Ruzzo–Tompa.
 * - `windows` — every fixed-size walk in the tree is size 2: {@link pairwise} or
 *   {@link withNext}.
 * - `unfold` — the one linked-list walk reads better as a `while`, and the spread needed to
 *   keep the return type costs an array.
 * - `stableSortBy` — nothing here sorts a caller's array in place, so it would prevent no
 *   mistake.
 */

/** A sequence that is known to have a first element, so `head` needs no null check. */
export type NonEmptyArray<T> = readonly [T, ...(readonly T[])];

/*
 * The `as` casts below — eight, and the only ones in this module — discharge two proofs.
 *
 * Six are in-range proofs the type system cannot state under `noUncheckedIndexedAccess`, which
 * makes `xs[i]` a `T | undefined`: `last` reads the final slot of a type that guarantees a
 * first one, `zipWith` bounds `i` by the shorter length, `pairwise` starts at 1, and the bound
 * searches probe an index derived from `xs.length`. A runtime check would be dead code, and
 * constraining `T` would stop these working over sequences that legitimately hold `null` or
 * `undefined`.
 *
 * The other two are construction proofs: `scanl` starts from its seed and `groupBy` creates
 * each bucket as `[x]`, so both return non-empty sequences and say so in their return type.
 *
 * The proofs are concentrated here so that the rest of the tree can stop indexing. Outside
 * this module the answer is `filterMap`, `pairwise`, `zipWith` or `elementAt`.
 */
export function isNonEmpty<T>(xs: readonly T[]): xs is NonEmptyArray<T> {
  return xs.length > 0;
}

export function head<T>(xs: NonEmptyArray<T>): T {
  return xs[0];
}

export function last<T>(xs: NonEmptyArray<T>): T {
  // `at(-1)`, not `xs[xs.length - 1]`: the negative index IS "from the end", so there is no
  // length arithmetic left to get wrong. The cast is unchanged and is the one the note above
  // covers — `at` returns `T | undefined` for the same reason `[]` does, and `NonEmptyArray`
  // is the proof it cannot be `undefined` here.
  return xs.at(-1) as T;
}

/**
 * Checked random access, for the reads that survive the algorithms — where the index came from
 * a computation rather than from iterating.
 *
 * The alternatives, `!` and `as T`, assert the bound instead of checking it and fail several
 * frames from the mistake as "cannot read property of undefined". The message is the value
 * here: "index 42 outside a 12-entry eigenvector column" locates the bug.
 *
 * Prefer not needing them. A loop that reads `xs[i]` and pushes is {@link filterMap}; one that
 * reads `xs[i]` and `xs[i + 1]` is {@link pairwise}; one walking two sequences together is
 * {@link zipWith}.
 */
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
  // `=== undefined` and not `?? outOfRange(…)`: the two differ for a sequence that lies about
  // its element type, and this tree has one. `RandomNumberProvider.series` is declared
  // `number[]` and holds `null` on a documented degenerate path — a triangular distribution
  // with both limits absent returns `upperLimit`, i.e. `null` — which coerces to 0 downstream
  // and produces the delta-0 that `tests/comparison/imprecisionLaws.test.ts` pins. `??` would
  // read that legitimate null as a miss and throw.
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

/**
 * The last element satisfying the predicate, or `null`. A backwards scan, named.
 *
 * The scan is `Array.prototype.findLast` (ES2023) rather than the descending `for` loop this
 * used to hold. That loop had to write `if (x !== undefined && predicate(x))` — a guard that
 * `noUncheckedIndexedAccess` demanded and that could never fire, because `i` was bounded by
 * `xs.length`. Handing the index back to the engine deletes the index, so it deletes the
 * guard with it, and the element type no longer has to promise it is non-nullish to keep the
 * two absences apart.
 *
 * What survives is the `?? null`: the platform reports a miss as `undefined` and this module
 * reports it as `null`, which is the convention every option combinator here is built on.
 */
export function findLast<T extends NonNullable<unknown>>(
  xs: readonly T[],
  predicate: (x: T) => boolean,
): T | null {
  return xs.findLast(predicate) ?? null;
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
 * Both orders are guaranteed and callers depend on both. Within a bucket, elements keep the
 * order they were met in. Across buckets, keys keep the order they were first met in — `Map`
 * iteration order is insertion order by specification (ECMA-262, `%Map.prototype%`
 * `[@@iterator]`), not an implementation detail.
 *
 * A bucket is created as `[x]` and only grown, so the `NonEmptyArray` in the return type holds
 * and a caller reading a group's first element needs no guard.
 */
export function groupBy<A, K>(xs: Iterable<A>, key: (a: A) => K): ReadonlyMap<K, NonEmptyArray<A>> {
  // `Map.groupBy` (ES2024) is this function, in the engine. Both orders documented above are
  // its specified behaviour and not an accident of this implementation: it appends within a
  // bucket and creates a bucket on first sight of the key, so encounter order holds inside a
  // group and first-seen order holds across them. Keys are compared by SameValueZero, exactly
  // as `Map.prototype.set` did in the loop this replaces, so a `NaN` key still buckets with
  // itself and `0`/`-0` still collapse.
  //
  // The cast is the one the note at the top of this file describes, and it is now the only
  // thing this function does: a bucket the engine creates is created as `[x]` and only ever
  // grown, so it cannot be empty, and `NonEmptyArray` is how that reaches the call sites.
  return Map.groupBy(xs, key) as unknown as ReadonlyMap<K, NonEmptyArray<A>>;
}

/** Left fold, so that a loop whose only job is to accumulate stops looking like control flow. */
export function foldl<A, B>(xs: Iterable<A>, seed: B, step: (acc: B, a: A, index: number) => B): B {
  let acc = seed;
  let index = 0;
  for (const x of xs) acc = step(acc, x, index++);
  return acc;
}

/**
 * A fold that keeps every intermediate state, seed first.
 *
 * Only for a running quantity whose intermediate states are actually read; where just the
 * final state is wanted, that is {@link foldl}. `datedView.styleNamesOf` is the shape this
 * fits — "the `<style>` in scope at view position i" — and it replaces a backwards scan
 * re-run once per index.
 *
 * Seed-first indexing: `out[0]` is the seed, and `out[i + 1]` is the state after consuming
 * `xs[i]`.
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
 * "How long until the next onset" and every other gap computation in the renderer is a
 * `pairwise`, and the alternative is a loop that indexes `i` and `i + 1` and special-cases the
 * end.
 */
export function pairwise<A>(xs: readonly A[]): readonly (readonly [A, A])[] {
  const out: (readonly [A, A])[] = [];
  for (let i = 1; i < xs.length; ++i) out.push([xs[i - 1] as A, xs[i] as A]);
  return out;
}

/**
 * Each element paired with its successor, and the last one paired with `null`.
 *
 * Not {@link pairwise}, which yields `n − 1` pairs and drops the last element. A span reader
 * needs `n`: the last instruction is a span too, running to the end of time rather than to a
 * successor. Writing the end sentinel at the point of use — `next?.dateTicks ?? Infinity` —
 * says what it means, where an `Infinity` appended to an array does not.
 *
 * A `null` second element means "there is no successor", never "the successor is null": the
 * sequence's own elements are untouched, so a sequence that legitimately holds nulls still
 * reports its real last entry.
 */
export function withNext<A>(xs: readonly A[]): readonly (readonly [A, A | null])[] {
  const out: (readonly [A, A | null])[] = new Array<readonly [A, A | null]>(xs.length);
  for (let i = 0; i < xs.length; ++i)
    out[i] = [xs[i] as A, i + 1 < xs.length ? (xs[i + 1] as A) : null];
  return out;
}

/**
 * The first index at which the predicate stops holding, for a sequence already partitioned so
 * that every element satisfying it precedes every element that does not. `O(log n)`.
 *
 * C++'s `std::partition_point`, and the primitive underneath every binary search here —
 * including the four searches in `src/mpm/elements/maps/GenericMap.ts`, which are otherwise
 * separately-debugged variants of the same six lines.
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
 * `Track.add` inserts here rather than re-sorting, which is what keeps same-tick events in
 * insertion order.
 */
export function insertionIndexBy<A>(
  xs: readonly A[],
  key: (a: A) => number,
  target: number,
): number {
  return upperBoundBy(xs, key, target);
}
