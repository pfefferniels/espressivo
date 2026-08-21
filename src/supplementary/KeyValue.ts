/**
 * A mutable key/value pair.
 *
 * Java has no tuple type, so `meico.supplementary.KeyValue` filled that gap and the port
 * inherited it as a class. TypeScript says the same thing structurally, so the class is gone:
 * an object type needs no runtime representation, and `pair.key` reads as well as
 * `pair.getKey()` did at the ~280 sites across `mei/`, `mpm/` and `msm/` that only read a pair.
 *
 * A tuple `[K, V]` would have said it too. The eight sites that mutate a pair in place are
 * what settled it for named fields: `entry.key = date` names what moved, `entry[0] = date`
 * does not.
 */
export interface KeyValue<K, V> {
  key: K;
  value: V;
}
