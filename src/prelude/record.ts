/**
 * Total records, built so that their totality is a theorem rather than an assertion.
 *
 * The tree has seventeen places that build a `Record<K, V>` over a closed key vocabulary and
 * then tell the compiler about it with a cast. They come in two shapes, and only one of them
 * is honest:
 *
 * ```ts
 * // (a) safe but unprovable — the keys really are all of K, and the compiler cannot see it
 * Object.fromEntries(DIMENSIONS.map((d) => [d, f(d)])) as Record<Dimension, V>
 *
 * // (b) a lie for the duration of the next few lines — the object IS empty when the cast runs
 * const out = {} as Record<Dimension, V>;
 * for (const d of DIMENSIONS) out[d] = f(d);
 * ```
 *
 * Shape (b) is the one that costs something. Between the cast and the end of the loop the type
 * is simply false, and nothing stops a `return` from landing in the middle of it — nor an
 * `if (…) continue` from skipping a key, which is a `undefined` handed to a consumer whose type
 * says it cannot be. That has to be caught by review, every time, forever.
 *
 * {@link fromEntriesExact} is both shapes' replacement. It takes the key list and a function of
 * one key, so the record cannot be missing a key: there is no window in which it is incomplete,
 * and no way to skip one. The single cast is here, once, where the loop that discharges it is
 * three lines above it — and where it is a genuine theorem, because `K` is inferred FROM the
 * key list. The vocabularies this is used with are declared the way that makes it airtight,
 * `type Dimension = (typeof DIMENSIONS)[number]`, so "the list covers the type" is true by
 * construction rather than by maintenance.
 *
 * Neither helper is `Object.fromEntries`-based. Assigning into an accumulator is what the call
 * sites already did, it allocates no intermediate entry array, and several of these run inside
 * an `N²/2` corpus loop where that array would be the only cost the refactor added.
 */

/**
 * A record over exactly `keys`, with `value(key)` under each.
 *
 * ```ts
 * const weights = fromEntriesExact(COMPARISON_DIMENSIONS, (dimension) => defaults[dimension]);
 * ```
 *
 * Pass the vocabulary constant, never a filtered or narrowed list: the return type promises a
 * key for every member of `K`, and `K` is whatever the argument's element type says it is.
 */
export function fromEntriesExact<K extends string, V>(
  keys: Iterable<K>,
  value: (key: K) => V,
): Record<K, V> {
  const out: Partial<Record<K, V>> = {};
  for (const key of keys) out[key] = value(key);
  // Sound: every key of `K` was just assigned, because `K` is the element type of `keys`.
  return out as Record<K, V>;
}

/**
 * A record with the same keys as `record` and `f` applied to each value.
 *
 * The sibling for the case where the vocabulary arrives as an existing total record rather than
 * as a key list — `epsilonRecord`'s defensive copy of `EPSILON_FIGURES`, say. Totality is the
 * argument's: `Object.keys` of a `Record<K, V>` enumerates exactly `K`.
 */
export function mapValues<K extends string, A, B>(
  record: Readonly<Record<K, A>>,
  f: (value: A, key: K) => B,
): Record<K, B> {
  const out: Partial<Record<K, B>> = {};
  // `Object.keys` is typed `string[]` whatever it is given, so the narrowing goes through
  // `unknown`. What it asserts is the argument type's own claim, nothing more.
  for (const key of Object.keys(record) as unknown as readonly K[]) out[key] = f(record[key], key);
  return out as Record<K, B>;
}
