/**
 * Combinators over `T | null` — absence as a value, without boxing it.
 *
 * There is no `Maybe<T>` wrapper because the union already carries the meaning: `null` is "the
 * domain says there is nothing here", `undefined` is "the caller did not supply this"
 * (ARCHITECTURE.md RULE N1). A `Some`/`None` object would cost an allocation per lookup on the
 * rendering path and would need unwrapping at every DOM boundary. Only the vocabulary changes:
 * these are what a `Maybe` API would give you, over a union TypeScript already narrows.
 *
 * They replace the `x !== null ? f(x) : null` ladder, and — through {@link presentOrError} —
 * the non-null assertions that stand where someone knew a value was present and could not
 * say so.
 */
import { err, ok, type Result } from './result.js';

export function isPresent<T>(x: T | null): x is T {
  return x !== null;
}

/** The negation. Needs no type parameter: a guard narrows the argument's own declared type. */
export function isAbsent(x: unknown): x is null {
  return x === null;
}

/** Apply `f` if there is something to apply it to. */
export function mapPresent<T, U>(x: T | null, f: (t: T) => U): U | null {
  return x === null ? null : f(x);
}

/** As {@link mapPresent}, where `f` may itself find nothing. Flattens one level. */
export function flatMapPresent<T, U>(x: T | null, f: (t: T) => U | null): U | null {
  return x === null ? null : f(x);
}

/** Keep the value only where it satisfies the predicate. */
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
 * The first argument that is present, or null. The MPM lookup order — a part's own map, else
 * the global one — is this.
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
 * Drop the absent elements, narrowing the element type. Preferable to
 * `.filter((x) => x !== null)`, which without a type predicate leaves a `(T | null)[]` for the
 * next reader to assert their way out of.
 */
export function compact<T>(xs: Iterable<T | null>): readonly T[] {
  const out: T[] = [];
  for (const x of xs) if (x !== null) out.push(x);
  return out;
}

/**
 * Turn a domain absence into an explained failure — the replacement for `!`. `firstChildElement('dated', root)!`
 * asserts a fact it cannot prove; this names the fact, names what its being false means, and
 * lets the caller decide.
 */
export function presentOrError<T, E>(x: T | null, makeError: () => E): Result<T, E> {
  return x === null ? err(makeError()) : ok(x);
}

/**
 * Collapse `undefined` into `null` — the one place the two spellings may meet, where an
 * optional parameter ("not supplied") becomes stored state ("nothing here"). Named rather than
 * spelled `?? null` so those boundaries can be grepped for.
 */
export function normalize<T>(x: T | null | undefined): T | null {
  return x ?? null;
}
