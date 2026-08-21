import type { AnyResult, ErrOf, OkOf } from '../../src/prelude/index.js';

/**
 * Assertions for the `Result`-returning factories.
 *
 * These two replace the `!` that stood after every `create*` call while those factories
 * returned `T | null`, and they are deliberately **stronger** than what they replace. A `!`
 * silences the null without testing it: a factory that quietly started failing would surface
 * three lines later as `Cannot read properties of null`, in a test whose name has nothing to
 * do with the failure — or not at all, where the value was only passed on. {@link okValue}
 * fails at the call, and says what the factory said.
 *
 * The signatures take the whole result as one type parameter and pull the arms back out with
 * `OkOf` / `ErrOf`, for the reason `src/prelude/result.ts`'s header gives at length:
 * TypeScript cannot infer type arguments through a union target, so the obvious
 * `okValue<A, E>(r: Result<A, E>): A` hands every call site an `unknown`.
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
 * Two assertions in one, and both are new. `expect(def).toBeNull()` could not tell a rejected
 * def from any other route to null; it could not say WHICH of a def's several required
 * attributes was at fault; and it could not distinguish a `MissingNodeError` (this document is
 * incomplete) from a `NumberFormatError` (this value is not a Java double) — which is the
 * distinction PARITY.md P1 is about. This fails unless the result failed, unless the failure
 * is the def arm, and then hands the caller the error class to check.
 *
 * The local structural type is the narrowing: `ErrOf<R>` is the whole `MpmParseError` union
 * here, and `tests/support` may not import the arm type without pulling `src/mpm` into every
 * file that wants an assertion.
 */
export function defCause<R extends AnyResult>(r: R): unknown {
  const e = errOf(r) as { readonly kind?: unknown; readonly cause?: unknown };
  if (e.kind !== 'malformedDef')
    throw new Error(`expected a malformedDef failure, got ${JSON.stringify(e)}`);
  return e.cause;
}
