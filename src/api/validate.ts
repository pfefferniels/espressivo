/**
 * How the facade says "this option is out of domain" — as a value, not as a throw.
 *
 * Every facade entry point validates its whole option bag before it parses a byte (§4, §9.4,
 * A23), and until now each of the seventeen validators that does so was a `check…(options):
 * void` whose entire product was the exception it raised. Three things follow from that shape,
 * and all three cost something real:
 *
 * - **They cannot compose.** "This surface validates the same rows as that one, minus four" is
 *   a claim `checkDiffOptions` spends a paragraph making in prose, because there is no way to
 *   say it in code when the parts are statements rather than values.
 * - **They throw away what they computed.** `checkExaggerateOptions` called the engine's own
 *   resolvers purely for their throws and discarded both resolved objects, so the engine
 *   resolved the identical bag a second time three lines later. A validator that *returns* what
 *   it validated does not have that problem, and `resolveExaggerateOptions` is now that.
 * - **They fix the failure policy at the leaf.** A `throw` inside `checkWeights` decides, from
 *   the bottom of the tree, that the caller learns about one bad weight at a time. A returned
 *   {@link Checked} leaves that to the composition — {@link allOf} for first-failure, the
 *   prelude's `collect` where every offender at once is worth the different message.
 *
 * The error payload is a bare `string`: the sentence {@link InvalidOptionError} will carry, and
 * nothing else. A structured problem type was considered and rejected — every consumer of these
 * values is `orInvalidOption`, which turns the payload into a message and forgets everything
 * else, so any extra field would be write-only.
 */
import {
  err,
  mapOk,
  ok,
  sequence,
  traverse,
  unwrapOrElse,
  type AnyResult,
  type OkOf,
  type Result,
} from '../prelude/index.js';
import { InvalidOptionError } from './errors.js';

/** A rejected option, as the sentence {@link InvalidOptionError} will carry. */
export type OptionProblem = string;

/** A check that either found nothing wrong or has one sentence to say about why it did. */
export type Checked = Result<void, OptionProblem>;

/** Nothing wrong here. */
export const accepted: Checked = ok(undefined);

/** Something wrong here, and this is the sentence the caller gets. */
export function rejected(problem: OptionProblem): Checked {
  return err(problem);
}

/**
 * Every check must hold; the **first** problem is the one reported.
 *
 * First-failure and not the prelude's accumulating `collect`, deliberately. Reporting every bad
 * field at once is the better experience in the abstract, but these messages are a published
 * part of the facade's contract — `tests/api/**` reads them, and so do callers — and widening
 * one exception into a multi-line list is an API change nobody asked for as part of a
 * refactor. `collect` is used where accumulation is already the behaviour: `spotlightMpm`'s
 * selection, where A8 says every offender or no run at all.
 *
 * The arguments are values, so every check *runs* even after one has failed. That is safe
 * because all of them are total pure functions of an already-narrowed field — where a check
 * would fault on input an earlier one rejects (a `null` bag, a non-array `items`), the caller
 * sequences with `andThen` instead, which is exactly the distinction `andThen` exists to make.
 */
export function allOf(...checks: readonly Checked[]): Checked {
  return mapOk(sequence(checks), () => undefined);
}

/**
 * The vocabulary-plus-values shape that four of the comparison validators share: a record whose
 * keys must come from a closed set, and whose present values must each satisfy a predicate.
 *
 * Written four times before this — `weights`, `jnd`, `plausibleRange`, `invariance` — with the
 * same `Object.keys(…).filter(…)` and the same `Object.entries(…)` loop each time, differing
 * only in the two sentences and the value predicate. Those are the two parameters.
 *
 * An `undefined` value under a present key is skipped rather than rejected, because
 * `{ tempo: undefined }` is how an exactOptionalPropertyTypes-free caller spells "not supplied"
 * and every one of the four already read it that way.
 *
 * `Object.entries` widens to `[string, unknown]` deliberately: a JavaScript caller can put
 * anything under a known key, and comparing against the declared value type would let the
 * compiler prove the predicate dead and the linter delete it.
 */
export function checkKeyedRecord(
  record: object | undefined,
  vocabulary: ReadonlySet<string>,
  unknownKeys: (keys: readonly string[]) => OptionProblem,
  checkEntry: (key: string, value: unknown) => Checked,
): Checked {
  if (record === undefined) return accepted;
  const unrecognized = Object.keys(record).filter((key) => !vocabulary.has(key));
  if (unrecognized.length > 0) return rejected(unknownKeys(unrecognized));
  return mapOk(
    traverse(Object.entries(record) as readonly (readonly [string, unknown])[], ([key, value]) =>
      value === undefined ? accepted : checkEntry(key, value),
    ),
    () => undefined,
  );
}

/**
 * The guard every facade entry point opens with: the option bag is an object at all.
 *
 * Read as `unknown` deliberately, and this is the one comment the seventeen validators all
 * carried: the guard exists for callers arriving from JavaScript, where the parameter type
 * guarantees nothing, and comparing against the declared type would let the compiler prove it
 * dead and the linter delete it. Without it a missing required field fails with a `TypeError`
 * from inside `Object.keys` instead of with this module's own error type.
 *
 * It returns the bag rather than nothing so that it chains with {@link andThen} — which is what
 * the callers need, because every later check reads a field off it.
 */
export function requireOptionBag<T>(bag: T, problem: OptionProblem): Result<T, OptionProblem> {
  const opaque: unknown = bag;
  return typeof opaque !== 'object' || opaque === null ? err(problem) : ok(bag);
}

/**
 * The facade's boundary: the validated value, or the typed error a caller catches (RULE E2).
 *
 * One construction site for `InvalidOptionError` across the whole surface, where there were
 * some thirty. That is the point of carrying the problem as a value up to here — the decision
 * to make it an exception belongs at the edge, next to the `@throws` clause that documents it,
 * and not in each leaf predicate.
 */
export function orInvalidOption<R extends AnyResult>(result: R): OkOf<R> {
  return unwrapOrElse(result, (problem): never => {
    throw new InvalidOptionError(String(problem));
  });
}
