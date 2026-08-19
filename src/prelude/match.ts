/**
 * Exhaustive dispatch over discriminated unions.
 *
 * A sum type is only as good as the guarantee that every arm is handled. A `switch` with a
 * `default` gives no such guarantee — adding an arm compiles, and the new case silently takes
 * the default. This module offers the two ways to get the guarantee back: {@link assertNever}
 * for a `switch` that must stay a statement, and {@link matchKind} for the common case, where
 * the handler table is a `Record` keyed by the discriminant and a missing key is a type error
 * at the *definition*, not a lint finding.
 *
 * The tree has 68 `switch` statements against only 29 exhaustiveness checks. That gap is where
 * a future arm will be dropped.
 */

/**
 * Assert that a value has been narrowed away entirely.
 *
 * Reached only if the union gained an arm that the caller's `switch` does not cover, which is
 * a compile error at every correctly-written call site — so the runtime throw is for the case
 * where the value came from outside the type system (parsed JSON, an `any` from a dependency).
 */
export function assertNever(x: never, context = 'value'): never {
  throw new Error(`Unhandled ${context}: ${JSON.stringify(x)}`);
}

/**
 * Dispatch on a `kind` discriminant with a complete handler table.
 *
 * ```ts
 * const ms = matchKind(instruction, {
 *   tempo: (t) => tempoToMilliseconds(t),
 *   rubato: (r) => rubatoToMilliseconds(r),
 * });
 * ```
 *
 * Omitting an arm fails to typecheck, and the handler receives the arm already narrowed, so
 * there is no cast and no second `if` inside the branch.
 */
export function matchKind<T extends { readonly kind: string }, R>(
  value: T,
  handlers: { readonly [K in T['kind']]: (arm: Extract<T, { readonly kind: K }>) => R },
): R {
  const handler = handlers[value.kind as T['kind']];
  return handler(value as Extract<T, { readonly kind: T['kind'] }>);
}

/** As {@link matchKind}, for unions discriminated by a field named something other than `kind`. */
export function matchOn<D extends string, T extends Readonly<Record<D, string>>, R>(
  value: T,
  discriminant: D,
  handlers: { readonly [K in T[D]]: (arm: Extract<T, Readonly<Record<D, K>>>) => R },
): R {
  const handler = handlers[value[discriminant]];
  return handler(value as Extract<T, Readonly<Record<D, T[D]>>>);
}
