/**
 * Combinators over `T | null` — absence as a value, without boxing it.
 *
 * **Why not a `Maybe<T>` wrapper.** Haskell's `Maybe` earns its allocation because Haskell has
 * no null. TypeScript does, the DOM speaks it natively, and this codebase already assigns it a
 * precise meaning: `null` is "the domain says there is nothing here", `undefined` is "the
 * caller did not supply this" (ARCHITECTURE.md RULE N1). Wrapping that in a `Some`/`None`
 * object would add an allocation per lookup on a rendering path that has just been made linear
 * (commit `980ae7e`), and would need unwrapping at every DOM boundary. So the representation
 * stays `T | null` and only the *vocabulary* changes: these functions are what a `Maybe` API
 * would give you, over the union TypeScript already narrows correctly.
 *
 * What this replaces is the `x !== null ? f(x) : null` ladder — and, more importantly, the 716
 * non-null assertions that stand where someone knew a value was present and had no way to say
 * so. {@link presentOrError} is the way to say so.
 */
import { err, ok, type Result } from './result.js';

export function isPresent<T>(x: T | null): x is T {
  return x !== null;
}

/** The negation. Needs no type parameter — a guard narrows the argument's own declared type. */
export function isAbsent(x: unknown): x is null {
  return x === null;
}

/** Apply `f` if there is something to apply it to. Haskell's `fmap` over `Maybe`. */
export function mapPresent<T, U>(x: T | null, f: (t: T) => U): U | null {
  return x === null ? null : f(x);
}

/** As {@link mapPresent}, where `f` may itself find nothing. The bind; flattens one level. */
export function flatMapPresent<T, U>(x: T | null, f: (t: T) => U | null): U | null {
  return x === null ? null : f(x);
}

/** Keep the value only where it satisfies the predicate. Haskell's `mfilter`. */
export function keepIf<T>(x: T | null, predicate: (t: T) => boolean): T | null {
  return x !== null && predicate(x) ? x : null;
}

export function orDefault<T>(x: T | null, fallback: T): T {
  return x === null ? fallback : x;
}

/** As {@link orDefault}, but the fallback is only computed when it is needed. */
export function orCompute<T>(x: T | null, fallback: () => T): T {
  return x === null ? fallback() : x;
}

/**
 * The first argument that is present, or null.
 *
 * The MPM lookup order — a part's own map, else the global one — is exactly this, written
 * today as nested ternaries or an `if` cascade at every site that needs it.
 */
export function firstPresent<T>(...xs: readonly (T | null)[]): T | null {
  for (const x of xs) if (x !== null) return x;
  return null;
}

/** Both, or neither. Lets a pair of lookups be narrowed in one step instead of two. */
export function bothPresent<A, B>(a: A | null, b: B | null): readonly [A, B] | null {
  return a === null || b === null ? null : [a, b];
}

/**
 * Drop the absent elements, narrowing the element type. Haskell's `catMaybes`.
 *
 * Prefer this to `.filter((x) => x !== null)`, which TypeScript does not narrow without a
 * type predicate, and which therefore leaves a `(T | null)[]` for the next reader to assert
 * their way out of.
 */
export function compact<T>(xs: Iterable<T | null>): readonly T[] {
  const out: T[] = [];
  for (const x of xs) if (x !== null) out.push(x);
  return out;
}

/**
 * Turn a domain absence into an explained failure.
 *
 * This is the honest replacement for `!`. Where the old code wrote `firstChildElement('dated',
 * root)!` — asserting a fact it could not prove — the new code names the fact and what it means
 * for it to be false, and the caller decides.
 */
export function presentOrError<T, E>(x: T | null, makeError: () => E): Result<T, E> {
  return x === null ? err(makeError()) : ok(x);
}

/**
 * Collapse `undefined` into `null`.
 *
 * The one place the two spellings are allowed to meet: at a boundary where an optional
 * parameter (`undefined`, "not supplied") becomes stored state (`null`, "nothing here").
 * Keeping this as a named function rather than `?? null` marks those boundaries so they can be
 * found.
 */
export function normalize<T>(x: T | null | undefined): T | null {
  return x ?? null;
}
