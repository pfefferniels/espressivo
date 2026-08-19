/**
 * Function composition.
 *
 * Deliberately three functions and no more. The combinators here exist to let a sequence of
 * named steps read top to bottom instead of inside out; anything further — currying, partial
 * application helpers, point-free plumbing — makes TypeScript's inference worse and the call
 * site harder to read, which is the opposite of the point.
 */

/** Feed a value through a chain of functions, left to right. */
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
