/**
 * The checked reads this module's random access is allowed to use.
 *
 * Four functions, and the choice between them is a statement about what a MISS would mean:
 *
 * | function            | element type            | on a miss |
 * |---------------------|-------------------------|-----------|
 * | {@link elementAt}   | never nullish           | throws    |
 * | {@link numberAt}    | a numeric buffer        | throws    |
 * | {@link optionAt}    | may legitimately be null| throws    |
 * | {@link elementAtOrNull} | never nullish       | `null`    |
 *
 * The first three are for an index this directory computed itself; the last is for one that
 * arrived from a caller, where a miss is an answer rather than a defect.
 *
 * ## Why a reader rather than an algorithm
 *
 * Most indexed loops in this tree are an algorithm wearing a `for`, and `src/prelude/seq.ts`
 * names them: a loop that reads `xs[i]` and pushes is `filterMap`, one that reads `xs[i]` and
 * `xs[i + 1]` is `pairwise`, one that carries a running total is `foldl`. Those are the right
 * answer wherever they fit, and this module is deliberately NOT a substitute for them.
 *
 * What is left over is genuine random access: a flat `N²` matrix cell in `embedding.ts`, a
 * dynamic-programming table entry in `eventAlignment.ts`, a curve breakpoint reached through an
 * index the caller computed. There the index arithmetic IS the algorithm, and Sean Parent's own
 * admission criterion — using an algorithm must not make the call site worse — rules out
 * dressing it up. `noUncheckedIndexedAccess` still types every one of those reads
 * `T | undefined`, so each needs an answer, and there are only three:
 *
 * - a guard per site, which `@typescript-eslint/no-unnecessary-condition` deletes as
 *   unreachable for as long as the flag is off in `tsconfig.json`;
 * - a non-null assertion per site, which is the thing the campaign exists to remove;
 * - one checked reader, used everywhere, that says what a miss would mean.
 *
 * ## Why it throws
 *
 * Every caller here indexes with an index it computed from the sequence's own length — a loop
 * bound, a matrix stride, an index stored by an earlier pass over the same array. A miss is
 * therefore a defect in this directory's arithmetic and never a property of the documents being
 * compared, so there is no value that would be the right answer to substitute. The comparison
 * module's outputs are distances, spectra and edit costs: a silently defaulted `0` becomes a
 * plausible-looking number that no consumer can distinguish from a real one, which is precisely
 * the failure mode `errors.ts` exists to prevent at the document boundary. A `RangeError` naming
 * the index, the length and the sequence is the honest alternative.
 *
 * A caller for whom absence is a real domain condition — the end of a curve, a part with no
 * counterpart — must NOT use this. That caller wants `T | null` and the prelude's option
 * combinators, or a `Result` from `errors.ts`.
 */

/**
 * `xs[index]`, with the out-of-range case named instead of asserted away.
 *
 * `what` is the sequence's role in the caller's own words, and it is required because the
 * message is the entire value of this function over a `!`: "index 42 outside a 12-entry
 * eigenvector column" locates a bug that "cannot read property of undefined" does not.
 *
 * The element type is constrained to exclude `null` and `undefined` so that the `??` really does
 * test presence: for a sequence that may legitimately hold nullish elements, this function would
 * report a false miss, and such a sequence should be read with the option combinators instead.
 */
export function elementAt<T extends NonNullable<unknown>>(
  xs: readonly T[],
  index: number,
  what: string,
): T {
  return xs[index] ?? outOfRange(index, xs.length, what);
}

/**
 * `xs[index]`, or `null` where the index misses.
 *
 * The counterpart to {@link elementAt}, for the callers whose index came from OUTSIDE: a
 * `performance: 7` in a caller's option bag is a question about the document, and "there is no
 * seventh performance" is an answer to it rather than a defect in this directory's arithmetic.
 * Those callers get `null` and decide; the ones indexing with their own loop bounds get the
 * throw.
 *
 * `.at()` is deliberately not used for this. It reads a NEGATIVE index from the end, so
 * `performance: -1` would silently select the last performance instead of missing.
 */
export function elementAtOrNull<T extends NonNullable<unknown>>(
  xs: readonly T[],
  index: number,
): T | null {
  return xs[index] ?? null;
}

/**
 * As {@link elementAt}, for a sequence whose elements may legitimately be `null`.
 *
 * `OrderedMapView.styleNames` is the case this exists for: it is index-aligned with `entries`
 * and `null` there means "no `<style>` in scope yet", which is a real reading rather than an
 * absence. `??` therefore cannot distinguish a present null from a missing entry, so the bounds
 * are tested directly — and a read past the end still throws, because a `styleNames` shorter
 * than the entries it is aligned with is a bug in the view builder and not a document without
 * styles.
 */
export function optionAt<T>(xs: readonly (T | null)[], index: number, what: string): T | null {
  if (index < 0 || index >= xs.length) outOfRange(index, xs.length, what);
  return xs[index] ?? null;
}

/**
 * As {@link elementAt}, for a numeric buffer — a `Float64Array`, an `Int8Array`, or a plain
 * `number[]` used as one.
 *
 * A separate name because a typed array is not an `Array` and satisfies no `readonly T[]`
 * parameter, and the DP tables of `editScript.ts` are typed arrays for the reason typed arrays
 * exist: `(n+1) × (m+1)` doubles allocated once rather than `n+1` boxed rows.
 */
export function numberAt(
  buffer: { readonly [index: number]: number; readonly length: number },
  index: number,
  what: string,
): number {
  return buffer[index] ?? outOfRange(index, buffer.length, what);
}

function outOfRange(index: number, length: number, what: string): never {
  throw new RangeError(
    `comparison: index ${String(index)} is outside ${what}, which has ${String(length)} entries`,
  );
}
