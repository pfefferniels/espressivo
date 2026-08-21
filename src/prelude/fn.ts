/**
 * Function composition: three combinators, so that a sequence of named steps reads top to
 * bottom instead of inside out. Currying and point-free plumbing are deliberately absent —
 * both cost inference quality and call-site clarity.
 */

/**
 * Feed a value through a chain of functions, left to right.
 *
 * The overloads stop at the arity of the longest chain in the tree, `Performance.renderPart`,
 * whose stages are pinned in order by the type at each boundary. The implementation is
 * variadic.
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
