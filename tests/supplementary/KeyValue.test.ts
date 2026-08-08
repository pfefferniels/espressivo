import { describe, it, expect } from 'vitest';
import { KeyValue } from '../../src/supplementary/KeyValue.js';

describe('KeyValue', () => {
    it('should store and retrieve key and value', () => {
        const kv = new KeyValue<string, number>('duration', 4);
        expect(kv.getKey()).toBe('duration');
        expect(kv.getValue()).toBe(4);
    });

    it('should set a new key and return it', () => {
        const kv = new KeyValue<string, string>('a', 'b');
        const result = kv.setKey('c');
        expect(result).toBe('c');
        expect(kv.getKey()).toBe('c');
    });

    it('should set a new value and return it', () => {
        const kv = new KeyValue<string, number>('x', 1);
        const result = kv.setValue(42);
        expect(result).toBe(42);
        expect(kv.getValue()).toBe(42);
    });

    it('should work with complex types', () => {
        const kv = new KeyValue<number[], Map<string, number>>(
            [1, 2, 3],
            new Map([['a', 1]])
        );
        expect(kv.getKey()).toEqual([1, 2, 3]);
        expect(kv.getValue().get('a')).toBe(1);
    });

    it('should allow null values', () => {
        const kv = new KeyValue<string | null, number | null>(null, null);
        expect(kv.getKey()).toBeNull();
        expect(kv.getValue()).toBeNull();
    });

    it('should handle boolean key/value', () => {
        const kv = new KeyValue<boolean, boolean>(true, false);
        expect(kv.getKey()).toBe(true);
        expect(kv.getValue()).toBe(false);
    });

    it('should be independently mutable for key and value', () => {
        const kv = new KeyValue<number, number>(0, 0);
        kv.setKey(10);
        kv.setValue(20);
        expect(kv.getKey()).toBe(10);
        expect(kv.getValue()).toBe(20);
    });
});
