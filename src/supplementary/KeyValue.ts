export class KeyValue<K, V> {
  private key: K;
  private value: V;

  constructor(key: K, value: V) {
    this.key = key;
    this.value = value;
  }

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
