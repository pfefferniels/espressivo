/**
 * How the facade says "this option is out of domain" — as a value, not as a throw.
 *
 * Every facade entry point validates its whole option bag before it parses a byte.
 * A validator that *returns* its verdict rather than throwing it buys three things a
 * `check…(options): void` cannot: the checks compose, so one surface can be described as
 * another's rows minus four; a validator can hand back what it resolved instead of making the
 * engine resolve the same bag again; and the failure policy belongs to the composition —
 * {@link allOf} for first-failure, the prelude's `collect` where every offender at once is
 * worth the different message — rather than to each leaf.
 *
 * The error payload is a bare `string`: the sentence {@link InvalidOptionError} will carry,
 * and nothing else. Every consumer of these values is `orInvalidOption`, which turns the
 * payload into a message and forgets the rest, so any extra field would be write-only.
 *
 * What is checked here is the **domain**, not the type (RULE E4). The domain predicates are
 * total by construction — `Number.isFinite`, `Number.isInteger`, `Array.isArray` and
 * `includes` all reject a non-number without coercing it — so a wrong type falls into the
 * domain row it was already going to fail. The one thing that needs stating is {@link readable}:
 * a check that *reads a field* has to establish that the field can be read first, or it faults
 * before its own domain row runs.
 */
import {
  andThen,
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
 * the behaviour: `spotlightMpm`'s selection, where the design says every offender or no run at all.
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
 * An optional nested option object, narrowed to something whose fields can actually be read.
 *
 * This is what makes a check that reads a field **total** (RULE E4). `checkWindow` and friends
 * are domain checks — "start before end", "bins in [1,256]" — but they have to reach the field
 * to say so, and `window.start` on a non-object faults before the domain row runs. Absent stays
 * absent; anything else must be readable or it is rejected here, one level at a time.
 *
 * The reject sentence names the field rather than the domain, because at this point nothing
 * about the domain has been established — `window: 3` has no `start` to be out of range.
 */
export function readable<T extends object>(
  name: string,
  value: T | undefined,
): Result<T | undefined, OptionProblem> {
  if (value === undefined) return ok(undefined);
  const opaque: unknown = value;
  return typeof opaque !== 'object' || opaque === null
    ? err(`${name} must be an object, got ${describeValue(opaque)}`)
    : ok(value);
}

/** What arrived, in the one word a reject sentence can carry. */
export function describeValue(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'an array';
  return `a ${typeof value}`;
}

/** Run `check` on a nested option object once {@link readable} has established it can be read. */
export function checkNested<T extends object>(
  name: string,
  value: T | undefined,
  check: (value: T) => Checked,
): Checked {
  return andThen(readable(name, value), (bag) => (bag === undefined ? accepted : check(bag)));
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
 * `Object.entries` widens to `[string, unknown]` because the value predicate is a domain
 * predicate and domain predicates are total: they take what is there and say whether it is in
 * range, without a type test in front of them.
 */
export function checkKeyedRecord(
  name: string,
  record: object | undefined,
  vocabulary: ReadonlySet<string>,
  unknownKeys: (keys: readonly string[]) => OptionProblem,
  checkEntry: (key: string, value: unknown) => Checked,
): Checked {
  return checkNested(name, record, (present) => {
    const unrecognized = Object.keys(present).filter((key) => !vocabulary.has(key));
    if (unrecognized.length > 0) return rejected(unknownKeys(unrecognized));
    return mapOk(
      traverse(
        Object.entries(present) as readonly (readonly [string, unknown])[],
        ([key, value]) => (value === undefined ? accepted : checkEntry(key, value)),
      ),
      () => undefined,
    );
  });
}

/**
 * {@link readable}, applied to the outermost bag — where the field being read is every option.
 *
 * It is the same rule and not a separate courtesy: everything downstream reads fields off this
 * object, so a check sequence that starts anywhere else starts with a fault. The problem
 * sentence is the caller's rather than this module's because the outermost bag is the one whose
 * required fields can be named ("at least `a`"), and naming them is the whole message.
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
