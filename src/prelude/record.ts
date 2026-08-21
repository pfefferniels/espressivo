/**
 * Total records over a closed key vocabulary, built so that their totality is a theorem rather
 * than an assertion.
 *
 * The shape these replace is `const out = {} as Record<Dimension, V>` followed by a loop that
 * fills it: between the cast and the end of the loop the type is false, and nothing stops an
 * early `return`, or an `if (…) continue` that skips a key and hands a consumer an `undefined`
 * its type says cannot happen. {@link fromEntriesExact} takes the key list and a function of
 * one key instead, so there is no window in which the record is incomplete and no way to skip
 * a key. Its single cast is discharged by the loop three lines above it, and `K` is inferred
 * from the key list — with vocabularies declared as `type Dimension = (typeof DIMENSIONS)[number]`,
 * "the list covers the type" holds by construction.
 *
 * Neither helper goes through `Object.fromEntries`: assigning into an accumulator allocates no
 * intermediate entry array, and several call sites sit inside an `N²/2` corpus loop.
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
 * For the case where the vocabulary arrives as an existing total record rather than as a key
 * list. Totality is the argument's: `Object.keys` of a `Record<K, V>` enumerates exactly `K`.
 */
export function mapValues<K extends string, A, B>(
  record: Readonly<Record<K, A>>,
  f: (value: A, key: K) => B,
): Record<K, B> {
  const out: Partial<Record<K, B>> = {};
  // `Object.keys` is typed `string[]` whatever it is given, so the narrowing goes through
  // `unknown`. It asserts the argument type's own claim, nothing more.
  for (const key of Object.keys(record) as unknown as readonly K[]) out[key] = f(record[key], key);
  return out as Record<K, B>;
}
