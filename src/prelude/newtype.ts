/**
 * Branded types with smart constructors.
 *
 * `src/units.ts` already brands five quantities and is required to emit nothing, which is why
 * it has no constructors: RULE U2 forbade them so that "type-level only" could be proved by a
 * zero-line emitted-JS diff. That was the right trade for a port under a byte-equivalence
 * gate, and it has a cost — a brand you can only apply with `as` documents an intention but
 * checks nothing, so `parseFloat(s) as Ticks` brands a `NaN` as happily as a tick count.
 *
 * This module is the other half, for new code: the brand plus the *proof obligation* that goes
 * with it. `src/units.ts` keeps its guarantee and is re-exported unchanged; nothing here is
 * imported by the parity-frozen arithmetic.
 */
import { err, ok, type Result } from './result.js';

declare const brand: unique symbol;

/** `Base`, distinguishable from every other `Brand` over the same base at compile time. */
export type Brand<Base, Name extends string> = Base & { readonly [brand]: Name };

/** Strip a brand, for the boundary where a branded value goes back to a plain one. */
export type Unbrand<T> = T extends Brand<infer Base, string> ? Base : T;

/**
 * Build a checked constructor for a branded type.
 *
 * ```ts
 * type Ppq = Brand<number, 'ppq'>;
 * const ppq = refiner<number, 'ppq', string>(
 *   (v) => Number.isInteger(v) && v > 0,
 *   (v) => `ppq must be a positive integer, got ${v}`,
 * );
 * ```
 *
 * The returned function is the only way to produce the type without an `as`, so a value of
 * that type carries the predicate as a proof: every reader downstream may rely on it without
 * re-checking, which is exactly the local reasoning a bare `number` cannot support.
 */
export function refiner<Base, Name extends string, E>(
  predicate: (value: Base) => boolean,
  makeError: (value: Base) => E,
): (value: Base) => Result<Brand<Base, Name>, E> {
  return (value) => (predicate(value) ? ok(value as Brand<Base, Name>) : err(makeError(value)));
}

/**
 * Apply a brand without checking it.
 *
 * The escape hatch, named so it can be grepped. Use it only where the invariant is established
 * by construction a line or two above; anywhere else, use {@link refiner} and handle the
 * failure. It exists because `as` is invisible and this is not.
 */
export function unsafeBrand<Base, Name extends string>(value: Base): Brand<Base, Name> {
  return value as Brand<Base, Name>;
}
