import { expect } from 'vitest';
import type { GenericMap } from '../../src/mpm/elements/maps/GenericMap.js';

/**
 * The law every `get<X>OptionsOf` owes its `add<X>`:
 *
 * > for any element `add<X>` produced, feeding `get<X>OptionsOf` back to `add<X>` produces the
 * > same element — same attributes, same values, same order, same bytes.
 *
 * One assertion rather than a field-by-field comparison on purpose. A field list has to be kept
 * in step with the options type by hand, and the failure it cannot catch is the one that
 * matters: an attribute the reader forgot, which no assertion about the fields it *did* read
 * will ever mention. Comparing the serialized element catches an omission, a misspelling, a
 * value that changed spelling, and a reordering, without naming any of them in advance.
 *
 * Attribute order comes out of `add<X>` both times, so this does not pin the order the writer
 * chose — the writer's own docstring does that. What it pins is that reading and re-writing
 * does not disturb it.
 *
 * **Name both type arguments** — `expectOptionsRoundTrip<TempoMap, AddTempoOptions>({…})`.
 * `O` appears in a parameter position on `add` and so cannot be inferred; left to itself it
 * lands on `unknown` and every sample typechecks against nothing.
 */
export function expectOptionsRoundTrip<M extends GenericMap, O>(spec: {
  /** A fresh, empty map. Called once per sample, so no sample can see another's elements. */
  readonly makeMap: () => M;
  readonly add: (map: M, options: O) => number;
  readonly read: (map: M, index: number) => O | null;
  /**
   * The options to try. Cover every optional field at least once, present and absent — an
   * attribute nothing exercises is an attribute this law says nothing about.
   *
   * `NoInfer`, so a caller who forgets the type arguments gets an error naming `unknown`
   * rather than one about a sample: without it `O` widens to the union of these literals, each
   * with its absent fields typed exactly `undefined`, and `read`'s honest `number | undefined`
   * then fails to assign to an `undefined` some *other* sample happened to pin.
   */
  readonly samples: readonly NoInfer<O>[];
}): void {
  for (const options of spec.samples) {
    const written = spec.makeMap();
    const index = spec.add(written, options);
    const original = written.getElement(index);
    expect(original, `add did not yield an element for ${JSON.stringify(options)}`).not.toBeNull();

    const read = spec.read(written, index);
    expect(read, `read back nothing for ${JSON.stringify(options)}`).not.toBeNull();

    const rewritten = spec.makeMap();
    const reindex = spec.add(rewritten, read as O);
    const copy = rewritten.getElement(reindex);

    expect(copy?.toXML(), `round trip changed ${JSON.stringify(options)}`).toBe(original?.toXML());
  }
}
