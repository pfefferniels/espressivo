/**
 * A mutable key/value pair.
 *
 * Java has no tuple type, so `meico.supplementary.KeyValue` filled that gap and the port
 * inherited it. TypeScript's `[K, V]` says the same thing in the type system, but the
 * pair's `getKey()`/`getValue()` shape is read at roughly eighty call sites across `mei/`,
 * `mpm/` and `msm/`, so swapping it out is a whole-tree change rather than a local one.
 *
 * Only eight of those call sites mutate a pair after construction; everything else treats
 * it as a read-only pair.
 */
export class KeyValue<K, V> {
  constructor(
    private key: K,
    private value: V,
  ) {}

  getKey(): K {
    return this.key;
  }

  getValue(): V {
    return this.value;
  }

  setKey(key: K): K {
    this.key = key;
    return this.key;
  }

  setValue(value: V): V {
    this.value = value;
    return this.value;
  }
}
