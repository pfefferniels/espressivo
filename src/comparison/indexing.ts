/**
 * The one checked read this module's random access is allowed to use.
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

function outOfRange(index: number, length: number, what: string): never {
  throw new RangeError(
    `comparison: index ${String(index)} is outside ${what}, which has ${String(length)} entries`,
  );
}
