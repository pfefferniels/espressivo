/**
 * The facade's plain-data guarantee — the charter's acceptance criterion for T13, spelled out
 * as ARCHITECTURE.md RULE F1 and RULE I3.
 *
 * Three mechanical tests over representative results, plus the two the charter names by hand:
 * a return value survives `postMessage` to another thread, and equal inputs produce values
 * that share no references, so React-style `===` memoization behaves.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { MessageChannel } from 'worker_threads';
import {
  convertMeiToMsmMpm,
  extractPerformanceData,
  listPerformances,
  performMsm,
  performMsmToData,
  renderExpressiveMidi,
  renderMidi,
} from '../../src/api/index.js';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), '..', 'integration', 'fixtures');
const mei = (name: string) => readFileSync(join(FIXTURES, 'mei', `${name}.mei`), 'utf-8');
const allMaps = (name: string, ext: 'msm' | 'mpm') =>
  readFileSync(join(FIXTURES, 'all-maps-reference', `${name}.${ext}`), 'utf-8');

/** A movement with notes, sub-note dynamics and a movement (position) stream. */
const movementInput = { msm: allMaps('movement', 'msm'), mpm: allMaps('movement', 'mpm') };
const meiMovement = () => convertMeiToMsmMpm(mei('comprehensive'), { sourceName: 'x.mei' })[0];

/**
 * Every facade return type, each produced by a fresh call so the "two calls" tests can ask
 * for the same value twice. `json` is false for the `Uint8Array` payloads, which RULE F3
 * exempts from the JSON leg.
 */
const samples: { name: string; call: () => unknown; json: boolean }[] = [
  { name: 'convertMeiToMsmMpm', call: () => convertMeiToMsmMpm(mei('simple_notes')), json: true },
  { name: 'listPerformances', call: () => listPerformances(meiMovement().mpm), json: true },
  { name: 'performMsm', call: () => performMsm(movementInput), json: true },
  { name: 'performMsmToData', call: () => performMsmToData(movementInput), json: true },
  {
    name: 'extractPerformanceData',
    call: () => extractPerformanceData(performMsm(movementInput)),
    json: true,
  },
  { name: 'renderMidi', call: () => renderMidi({ msm: movementInput.msm }), json: false },
  { name: 'renderExpressiveMidi', call: () => renderExpressiveMidi(movementInput), json: false },
];

/**
 * Every node of a facade value, with a readable path for the failure message.
 *
 * The `seen` guard is not decoration. Plain data is a tree, so a repeated reference cannot
 * occur — but the thing this file exists to catch is a live XomTypes node, whose parent and
 * child pointers form a cycle, and a `yield*` walk over a cycle never overflows the stack: it
 * allocates generator frames until the process dies. A gate that hangs is worse than none
 * (measured — it cost this item one 10-minute negative-control run).
 */
function* nodes(
  value: unknown,
  path = '$',
  seen = new Set<unknown>(),
): Generator<[string, unknown]> {
  yield [path, value];
  if (value === null || typeof value !== 'object' || seen.has(value)) return;
  seen.add(value);

  if (Array.isArray(value)) {
    for (const [i, item] of value.entries()) yield* nodes(item, `${path}[${i}]`, seen);
  } else if (!(value instanceof Uint8Array)) {
    for (const [key, item] of Object.entries(value)) yield* nodes(item, `${path}.${key}`, seen);
  }
}

/** The structural half of RULE F1: only the permitted types, and nothing with behaviour. */
function checkPlainData(value: unknown): void {
  for (const [path, node] of nodes(value)) {
    if (node === null || ['string', 'number', 'boolean'].includes(typeof node)) {
      // `NaN`/`Infinity` are not JSON round-trip stable — `JSON.stringify` writes `null`.
      if (typeof node === 'number') expect(Number.isFinite(node), `${path} is finite`).toBe(true);
      continue;
    }

    expect(typeof node, `${path} is not a function or symbol`).toBe('object');
    expect(node instanceof Map || node instanceof Set, `${path} is not a Map/Set`).toBe(false);

    const prototype = Object.getPrototypeOf(node) as unknown;
    const plain =
      prototype === Object.prototype || prototype === Array.prototype || node instanceof Uint8Array; // RULE F3: the one sanctioned class, for binary payloads
    expect(plain, `${path} is a plain object, array or Uint8Array`).toBe(true);

    // RULE N4: no `undefined` anywhere, because `JSON.stringify` drops those properties.
    // Getters would also survive neither `structuredClone` nor a worker boundary.
    for (const key of Object.keys(node as object)) {
      const descriptor = Object.getOwnPropertyDescriptor(node, key)!;
      expect(descriptor.get, `${path}.${key} is a data property, not a getter`).toBeUndefined();
      expect(descriptor.value, `${path}.${key} is not undefined`).not.toBeUndefined();
    }
  }
}

/**
 * RULE I3(b): freshly allocated at every level, so `===` memoization sees a change.
 * Cycle-guarded for the same reason {@link nodes} is.
 */
function checkNoSharedReferences(
  a: unknown,
  b: unknown,
  path = '$',
  seen = new Set<unknown>(),
): void {
  if (a === null || typeof a !== 'object' || seen.has(a)) return;
  seen.add(a);

  expect(a, `${path} is a fresh object, not the previous call's`).not.toBe(b);

  if (Array.isArray(a) && Array.isArray(b)) {
    for (const [i, item] of a.entries()) checkNoSharedReferences(item, b[i], `${path}[${i}]`, seen);
  } else if (!(a instanceof Uint8Array)) {
    for (const [key, item] of Object.entries(a))
      checkNoSharedReferences(item, (b as Record<string, unknown>)[key], `${path}.${key}`, seen);
  }
}

/** A real structured-clone hop between threads, which is what `postMessage` does. */
async function throughPostMessage<T>(value: T): Promise<T> {
  const { port1, port2 } = new MessageChannel();
  try {
    const received = new Promise<T>((resolve) => port2.once('message', resolve));
    port1.postMessage(value);
    return await received;
  } finally {
    port1.close();
    port2.close();
  }
}

describe('facade outputs are plain data (RULE F1)', () => {
  for (const { name, call, json } of samples) {
    describe(name, () => {
      it('contains only the permitted plain-data types', () => {
        checkPlainData(call());
      });

      // `checkPlainData` opens the three round-trip legs as a fail-fast precondition, not as
      // a duplicate assertion: cloning and deep-comparing a value that accidentally contains
      // a live XML node walks the whole document twice and takes minutes, so without it a
      // regression would hang the suite instead of reporting it (measured, see the note on
      // `nodes`). The round-trip assertion itself is unchanged.
      it('survives structuredClone unchanged', () => {
        const value = call();
        checkPlainData(value);
        expect(structuredClone(value)).toEqual(value);
      });

      it('survives postMessage to another thread unchanged', async () => {
        const value = call();
        checkPlainData(value);
        expect(await throughPostMessage(value)).toEqual(value);
      });

      if (json)
        it('survives a JSON round trip unchanged', () => {
          const value = call();
          checkPlainData(value);
          expect(JSON.parse(JSON.stringify(value)) as unknown).toEqual(value);
        });
    });
  }

  it('carries the MIDI bytes across a worker boundary as bytes (RULE F3)', async () => {
    const bytes = renderExpressiveMidi(movementInput);
    const cloned = await throughPostMessage(bytes);

    expect(cloned).toBeInstanceOf(Uint8Array);
    expect(Array.from(cloned.subarray(0, 4))).toEqual(Array.from(bytes.subarray(0, 4)));
    expect(cloned).toEqual(bytes);
  });

  it('never exposes an XomTypes node, not even one level down', () => {
    // The failure this forbids: a `readonly` wrapper around a live XML node would satisfy the
    // type system, pass a shallow eyeball check, and fail both tests above.
    const data = performMsmToData(movementInput);
    for (const [path, node] of nodes(data)) {
      if (node !== null && typeof node === 'object')
        expect(
          'getLocalName' in node || 'toXML' in node || 'getDomNode' in node,
          `${path} is not an XML node`,
        ).toBe(false);
    }
  });
});

describe('facade outputs support referential-equality memoization (RULE I3)', () => {
  for (const { name, call } of samples) {
    it(`${name}: two calls with equal inputs are value-equal but share no references`, () => {
      const first = call();
      const second = call();
      expect(second).toEqual(first);
      checkNoSharedReferences(first, second);
    });
  }

  it('a changed input produces a value that is not equal, so `===` memoization invalidates', () => {
    const a = performMsmToData(movementInput);
    const b = performMsmToData({ msm: allMaps('rubato', 'msm'), mpm: allMaps('rubato', 'mpm') });
    expect(b).not.toEqual(a);
  });

  it('holds for the nested milliseconds object, which is the deepest node', () => {
    const first = performMsmToData(movementInput).parts[0].notes[0].milliseconds;
    const second = performMsmToData(movementInput).parts[0].notes[0].milliseconds;
    expect(second).toEqual(first);
    expect(second).not.toBe(first);
  });
});
