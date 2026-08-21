/**
 * Exhaustive dispatch over discriminated unions: {@link matchKind} where the dispatch is a
 * value, {@link assertNever} where a value arrived from outside the type system.
 *
 * Neither is a replacement for `switch`. A plain `switch` over a union is already checked on
 * `src/` from two directions — `@typescript-eslint/switch-exhaustiveness-check` names the
 * missing case, and `noImplicitReturns` refuses a return-exhaustive switch that a new arm can
 * fall out of (TS2366) — so converting statements wholesale buys no guarantee and costs one:
 * a handler table allocates N closures per call, where a `switch` is a jump table. Seven
 * `switch (law.kind)` sites sit inside `src/comparison`'s numeric integration, per quadrature
 * node.
 *
 * {@link matchKind} earns its place where the table is built once and read as a value.
 */

/**
 * Assert that a value has been narrowed away entirely. Reachable only for a value that came
 * from outside the type system — parsed JSON, an `any` from a dependency — since an uncovered
 * arm is a compile error at every correctly written call site.
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
