/**
 * Function composition.
 *
 * Deliberately three functions and no more. The combinators here exist to let a sequence of
 * named steps read top to bottom instead of inside out; anything further — currying, partial
 * application helpers, point-free plumbing — makes TypeScript's inference worse and the call
 * site harder to read, which is the opposite of the point.
 */

/**
 * Feed a value through a chain of functions, left to right.
 *
 * The overload list stops where the longest chain in the tree does. `Performance.renderPart` is
 * a seven-stage fold whose state changes type at most of its boundaries — that is the point of
 * it, since the type at each boundary is what pins the render stages in their order — and an
 * arity that could not express it would push that pipeline into a bespoke local combinator,
 * which is the outcome this module exists to prevent. Each overload is one line and costs
 * nothing at runtime; the implementation has been variadic all along.
 */
export function pipe<A>(a: A): A;
export function pipe<A, B>(a: A, ab: (a: A) => B): B;
export function pipe<A, B, C>(a: A, ab: (a: A) => B, bc: (b: B) => C): C;
export function pipe<A, B, C, D>(a: A, ab: (a: A) => B, bc: (b: B) => C, cd: (c: C) => D): D;
export function pipe<A, B, C, D, E>(
  a: A,
  ab: (a: A) => B,
  bc: (b: B) => C,
  cd: (c: C) => D,
  de: (d: D) => E,
): E;
export function pipe<A, B, C, D, E, F>(
  a: A,
  ab: (a: A) => B,
  bc: (b: B) => C,
  cd: (c: C) => D,
  de: (d: D) => E,
  ef: (e: E) => F,
): F;
export function pipe<A, B, C, D, E, F, G>(
  a: A,
  ab: (a: A) => B,
  bc: (b: B) => C,
  cd: (c: C) => D,
  de: (d: D) => E,
  ef: (e: E) => F,
  fg: (f: F) => G,
): G;
export function pipe<A, B, C, D, E, F, G, H>(
  a: A,
  ab: (a: A) => B,
  bc: (b: B) => C,
  cd: (c: C) => D,
  de: (d: D) => E,
  ef: (e: E) => F,
  fg: (f: F) => G,
  gh: (g: G) => H,
): H;
export function pipe(a: unknown, ...fns: readonly ((x: unknown) => unknown)[]): unknown {
  let acc = a;
  for (const f of fns) acc = f(acc);
  return acc;
}

/** Compose functions into a new function, left to right. {@link pipe} without the value. */
export function flow<A extends readonly unknown[], B>(ab: (...a: A) => B): (...a: A) => B;
export function flow<A extends readonly unknown[], B, C>(
  ab: (...a: A) => B,
  bc: (b: B) => C,
): (...a: A) => C;
export function flow<A extends readonly unknown[], B, C, D>(
  ab: (...a: A) => B,
  bc: (b: B) => C,
  cd: (c: C) => D,
): (...a: A) => D;
export function flow(
  ab: (...a: readonly unknown[]) => unknown,
  ...rest: readonly ((x: unknown) => unknown)[]
): (...a: readonly unknown[]) => unknown {
  return (...a) => {
    let acc = ab(...a);
    for (const f of rest) acc = f(acc);
    return acc;
  };
}

export function identity<A>(a: A): A {
  return a;
}
