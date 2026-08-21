import type { AnyResult, ErrOf, OkOf } from '../../src/prelude/index.js';

/**
 * Assertions for the `Result`-returning factories.
 *
 * Stronger than the `!` they replace, which silences a failure without testing it: a factory
 * that quietly started failing surfaces three lines later as `Cannot read properties of null`,
 * in a test whose name has nothing to do with it. {@link okValue} fails at the call and says
 * what the factory said.
 *
 * They take the whole result as one type parameter and project the arms with `OkOf` / `ErrOf`
 * for the reason `src/prelude/result.ts` gives: TypeScript cannot infer type arguments through
 * a union target, so `okValue<A, E>(r: Result<A, E>): A` would hand every call site an
 * `unknown`.
 */

/** The value of a result that must have succeeded, or a failure naming the reason it did not. */
export function okValue<R extends AnyResult>(r: R): OkOf<R> {
  if (!r.ok) throw new Error(`expected a value, got the error ${JSON.stringify(r.error)}`);
  return r.value as OkOf<R>;
}

/** The reason of a result that must have failed. */
export function errOf<R extends AnyResult>(r: R): ErrOf<R> {
  if (r.ok) throw new Error(`expected an error, got the value ${String(r.value)}`);
  return r.error as ErrOf<R>;
}

/**
 * The library error a `*Def` factory refused with — `MpmParseError`'s `malformedDef` payload.
 *
 * Two assertions in one: the result failed, and it failed on the def arm. It then hands back
 * the cause, so a test can tell a `MissingNodeError` (this document is incomplete) from a
 * `NumberFormatError` (this value is not a Java double) — the distinction PARITY.md P1 is
 * about, and one `expect(def).toBeNull()` cannot make.
 *
 * The local structural type does the narrowing: `ErrOf<R>` is the whole `MpmParseError` union,
 * and `tests/support` may not import the arm type without pulling `src/mpm` into every file
 * that wants an assertion.
 */
export function defCause<R extends AnyResult>(r: R): unknown {
  const e = errOf(r) as { readonly kind?: unknown; readonly cause?: unknown };
  if (e.kind !== 'malformedDef')
    throw new Error(`expected a malformedDef failure, got ${JSON.stringify(e)}`);
  return e.cause;
}
