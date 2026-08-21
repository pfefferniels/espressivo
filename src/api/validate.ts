/**
 * How the facade says "this option is out of domain" — as a value, not as a throw.
 *
 * Every facade entry point validates its whole option bag before it parses a byte (§4, §9.4,
 * A23). A validator that *returns* its verdict rather than throwing it buys three things a
 * `check…(options): void` cannot: the checks compose, so one surface can be described as
 * another's rows minus four; a validator can hand back what it resolved instead of making the
 * engine resolve the same bag again; and the failure policy belongs to the composition —
 * {@link allOf} for first-failure, the prelude's `collect` where every offender at once is
 * worth the different message — rather than to each leaf.
 *
 * The error payload is a bare `string`: the sentence {@link InvalidOptionError} will carry,
 * and nothing else. Every consumer of these values is `orInvalidOption`, which turns the
 * payload into a message and forgets the rest, so any extra field would be write-only.
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
 * First-failure and not the prelude's accumulating `collect`, because these messages are a
 * published part of the facade's contract — `tests/api/**` reads them, and so do callers — and
 * a multi-line list is a different contract. `collect` is used where accumulation is already
 * the behaviour: `spotlightMpm`'s selection, where A8 says every offender or no run at all.
 *
 * The arguments are values, so every check *runs* even after one has failed. That is safe
 * because all of them are total pure functions of an already-narrowed field. Where a check
 * would fault on input an earlier one rejects (a `null` bag, a non-array `items`), the caller
 * sequences with `andThen` instead.
 */
export function allOf(...checks: readonly Checked[]): Checked {
  return mapOk(sequence(checks), () => undefined);
}

/**
 * The vocabulary-plus-values shape that four of the comparison validators share: a record whose
 * keys must come from a closed set, and whose present values must each satisfy a predicate.
 *
 * Shared by the comparison validators for `weights`, `jnd`, `plausibleRange` and `invariance`,
 * which differ only in the two message sentences and the value predicate.
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
 * Read as `unknown` deliberately: the guard exists for callers arriving from JavaScript, where
 * the parameter type guarantees nothing, and comparing against the declared type would let the
 * compiler prove it dead and the linter delete it. Without it a missing required field fails
 * with a `TypeError` from inside `Object.keys` instead of with this module's own error type.
 *
 * It returns the bag rather than nothing so that it chains with `andThen`, which every caller
 * needs because their later checks read fields off it.
 */
export function requireOptionBag<T>(bag: T, problem: OptionProblem): Result<T, OptionProblem> {
  const opaque: unknown = bag;
  return typeof opaque !== 'object' || opaque === null ? err(problem) : ok(bag);
}

/**
 * The facade's boundary: the validated value, or the typed error a caller catches (RULE E2).
 *
 * The one construction site for `InvalidOptionError` across the whole surface: carrying the
 * problem as a value up to here is what keeps the decision to make it an exception at the
 * edge, next to the `@throws` clause that documents it, rather than in each leaf predicate.
 */
export function orInvalidOption<R extends AnyResult>(result: R): OkOf<R> {
  return unwrapOrElse(result, (problem): never => {
    throw new InvalidOptionError(String(problem));
  });
}
