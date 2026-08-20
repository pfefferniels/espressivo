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
 * **CORRECTION, measured 2026-08-20 — the gap this module was sized for is already closed by
 * the toolchain, so do NOT convert the tree's `switch` statements wholesale.**
 *
 * This header used to say "68 `switch` statements against only 29 exhaustiveness checks — that
 * gap is where a future arm will be dropped". Two settings turned on since then make that
 * unreachable for a switch over a union, and both are errors on `src/`:
 *
 *   - `@typescript-eslint/switch-exhaustiveness-check` (eslint.config.js) — "Switch is not
 *     exhaustive. Cases not matched: …" the moment an arm is added. Currently zero findings.
 *   - `noImplicitReturns` (tsconfig.json) — an exhaustive-by-return switch with no `default`
 *     stops compiling when a new arm can fall out of the bottom: TS2366.
 *
 * Both were verified against a deliberately non-exhaustive three-arm probe: eslint named the
 * missing case and `tsc` refused the function. `src/` outside this module holds 51 `switch`
 * statements and zero `assertNever` calls, and that is not the debt it looks like — the
 * guarantee is being enforced upstream of the code rather than inside it.
 *
 * So {@link matchKind} earns its place where the dispatch is a VALUE (an arm-keyed table read
 * at a `const`, a lookup built once), not as a mechanical replacement for statements. The
 * mechanical version has a real cost: a handler table is an object of N closures allocated per
 * call, and seven of the tree's `switch (law.kind)` sites sit inside `src/comparison`'s numeric
 * integration, where that is per-quadrature-node. A `switch` is a jump table and allocates
 * nothing. {@link assertNever} likewise: it is for a value that arrived from outside the type
 * system — parsed JSON, an `any` from a dependency — where the compile-time proof does not
 * reach.
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
