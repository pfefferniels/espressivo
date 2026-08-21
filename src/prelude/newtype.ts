/**
 * Branded types with checked constructors, for new code.
 *
 * `src/units.ts` brands five quantities without constructors, because RULE U2 requires it to
 * emit no JavaScript at all. The cost is that its brands can only be applied with `as`, which
 * documents an intention and checks nothing: `parseFloat(s) as Ticks` brands a `NaN` as
 * happily as a tick count. This module supplies the missing half — the brand together with the
 * proof obligation. It is not imported by the parity-frozen arithmetic.
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
 * that type carries the predicate as a proof and no reader downstream need re-check it.
 */
export function refiner<Base, Name extends string, E>(
  predicate: (value: Base) => boolean,
  makeError: (value: Base) => E,
): (value: Base) => Result<Brand<Base, Name>, E> {
  return (value) => (predicate(value) ? ok(value as Brand<Base, Name>) : err(makeError(value)));
}

/**
 * Apply a brand without checking it — the escape hatch, named so it can be grepped where `as`
 * could not be. Only for an invariant established by construction a line or two above;
 * anywhere else use {@link refiner} and handle the failure.
 */
export function unsafeBrand<Base, Name extends string>(value: Base): Brand<Base, Name> {
  return value as Brand<Base, Name>;
}
