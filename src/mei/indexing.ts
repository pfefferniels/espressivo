/**
 * The three reads this directory's leftover random access is allowed to use.
 *
 * Nearly every indexed loop in the MEI converter turned out to be an algorithm wearing a
 * `for`, and `src/prelude/seq.ts` names those: the backwards scan that takes a maximum is
 * `foldl`, the walk that collects and skips is `filterMap`, the pair of index-aligned arrays
 * is one array of pairs. Those are the right answer and this module is deliberately not a
 * substitute for them — it exists for what is left over, which in `src/mei/**` is exactly
 * three shapes:
 *
 * | function              | the shape | on a miss |
 * |-----------------------|-----------|-----------|
 * | {@link elementAt}     | a position an invariant in this file guarantees — `split('m+')[1]` of a value that was parked *because* it contains `m+` | throws |
 * | {@link findLast}      | the most recent entry satisfying a predicate; ES2023's `Array.prototype.findLast`, which `"lib": ["ES2022"]` does not have | `null` |
 * | {@link removeAt}      | take one entry out of a worklist and use it, where the index came from a search that may have failed | `null` |
 *
 * ## Why a checked reader rather than a guard per site
 *
 * `@typescript-eslint/no-unnecessary-condition` is enabled for `src/**` and reads the project
 * `tsconfig.json`, where `noUncheckedIndexedAccess` is still OFF. A guard written directly
 * against an indexed read — `xs[i] !== undefined`, `xs[i] ?? fallback` — therefore compiles
 * clean under the flag and is then deleted by the linter as provably dead without it. The
 * only spellings that survive both are a non-null assertion, which is the thing this campaign
 * exists to remove, and a *generic* helper: a type parameter is opaque to the rule, so the
 * `??` inside these functions stands, and it stands in one place instead of forty.
 *
 * ## Why {@link elementAt} throws
 *
 * Its callers index with a position this file's own arithmetic produced — the second half of
 * a string that was split on the separator it was parked for, the three values
 * `computePitch` appends together or not at all, the sole `work` of a list whose length was
 * just tested. A miss is a defect here and never a property of the MEI being converted, so
 * there is no substitute value that would be the right answer: the converter's output is a
 * score, and a silently defaulted `''` becomes a note with an empty pitch name that no
 * downstream stage can tell from a real one. A `RangeError` naming the index, the length and
 * the sequence is the honest alternative.
 *
 * A caller for whom absence is a real property of the *document* — an optional attribute, a
 * span with no end — must not use this. That caller wants `T | null` and the option
 * combinators in `src/prelude/option.ts`.
 *
 * This is `src/comparison/indexing.ts`'s idea, re-derived rather than imported: the two
 * directories are on opposite sides of a layer boundary that `eslint.config.js`'s
 * `LAYER_ZONES` enforces, and the messages name their own module so a stack trace says which
 * one threw.
 */

/**
 * `xs[index]`, with the out-of-range case named instead of asserted away.
 *
 * `what` is the sequence's role in the caller's own words, and it is required because the
 * message is the entire value of this function over a `!`: "index 1 outside a parked tstamp2
 * split on 'm+'" locates a bug that "cannot read property of undefined" does not.
 *
 * The element type excludes `null` and `undefined` so that the `??` really does test
 * presence; a sequence that may legitimately hold nullish elements would report a false miss
 * here and should be read with the option combinators instead.
 */
export function elementAt<T extends NonNullable<unknown>>(
  xs: readonly T[],
  index: number,
  what: string,
): T {
  return xs[index] ?? outOfRange(index, xs.length, what);
}

/**
 * The **last** element satisfying `predicate`, or `null`.
 *
 * This is `Array.prototype.findLast`, which is ES2023 and so not in this project's
 * `"lib": ["ES2022"]` — with `null` for the miss rather than `undefined`, because in this
 * codebase `null` is "the domain says there is nothing here" (ARCHITECTURE.md RULE N1) and
 * a worklist with no matching entry is exactly that.
 *
 * It lives here rather than in `src/prelude/seq.ts` because the prelude's admission criterion
 * is that a shape occur across the tree, and today it is this directory's — three loops that
 * count an index down, act on the first match and `break`. Written as a search, each stops
 * being a place an off-by-one can hide.
 *
 * The scan really is backwards, not a forwards scan that keeps the last hit: `findLast` must
 * evaluate `predicate` on as few elements as the loop it replaces, since one of its three
 * call sites — the accidental lookup in `computePitch` — runs once per note.
 *
 * Two loops of exactly this shape are NOT written with it, and the reasons are measured
 * rather than aesthetic: `getEndid` runs for every element of the score and
 * `computeDuration`'s tuplet-span scan runs for every note, so the predicate closure would
 * become an allocation per element on the two hottest paths the converter has. Those two keep
 * their index walk and read through {@link elementAt}. `scripts/bench.mjs` is the arbiter;
 * `docs/history/strict/mei.md` records the A/B.
 */
export function findLast<T extends NonNullable<unknown>>(
  xs: readonly T[],
  predicate: (x: T) => boolean,
): T | null {
  // Every index this produces comes from the sequence's own length, so the read goes through
  // {@link elementAt} rather than a guard: a guard here would be one `@typescript-eslint/no-unnecessary-condition`
  // deletes while the flag is off in `tsconfig.json`, which is the whole reason this module exists.
  for (let i = xs.length - 1; i >= 0; --i) {
    const x = elementAt(xs, i, 'the sequence being searched backwards');
    if (predicate(x)) return x;
  }
  return null;
}

/**
 * Remove the entry at `index` and return it, or `null` if there is nothing there.
 *
 * For the deferred worklists (`endids`, `tstamp2s`): an entry is found by a search that
 * answers `-1` when it fails, and `splice(-1, 1)` would silently remove the *last* entry
 * instead of none, which is why the bounds are tested here rather than at each call site.
 */
export function removeAt<T extends NonNullable<unknown>>(xs: T[], index: number): T | null {
  if (index < 0 || index >= xs.length) return null;
  return xs.splice(index, 1)[0] ?? null;
}

function outOfRange(index: number, length: number, what: string): never {
  throw new RangeError(
    `mei: index ${String(index)} is outside ${what}, which has ${String(length)} entries`,
  );
}
