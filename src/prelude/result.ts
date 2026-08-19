/**
 * A computation that either produced a value or explained why it did not.
 *
 * The codebase's incumbent idiom for failure is Java's: log the reason to the console and
 * return `null`. There are 49 bare `console.error(e); return null` sites, and every one of them
 * destroys the only copy of the explanation — the caller receives an absence and cannot find
 * out what happened. A `Result` is the same control flow with the reason kept as a value, so a
 * caller may inspect it, aggregate it, or hand it to the facade to turn into a typed error.
 *
 * The shape is the one `src/expression/transforms.ts` already arrived at independently — a
 * boolean-literal `ok` discriminant over two readonly arms — so that module's `TransformResult`
 * is this type under another name and folds into it rather than competing with it.
 *
 * **Data-first, not point-free.** Every combinator takes the `Result` as its first argument
 * (`mapOk(r, f)`, not `map(f)(r)`). TypeScript infers data-first far better, the call sites read
 * as sentences, and a curried mirror of every function would be exactly the combinator zoo Sean
 * Parent's rule warns against: using an algorithm must not make the call site worse.
 *
 * **Why the signatures say `R extends AnyResult` instead of `Result<A, E>`.** TypeScript cannot
 * infer type arguments *through* a union target: given `mapOk(r, (a) => …)` with the plain
 * signature `mapOk<A, B, E>(r: Result<A, E>, …)` and an `r` whose declared type is the union
 * `Ok<number> | Err<string>`, both constituents contain inference positions, so inference gives
 * up and hands the callback an `unknown`. Taking the whole result as one parameter and pulling
 * the arms back out with {@link OkOf}/{@link ErrOf} — conditional types, which *do* distribute
 * over a union — makes `(a) => …` land as `number` with no annotation at the call site. The
 * signatures are the price; the call sites are the point.
 */

/** The success arm. */
export interface Ok<out A> {
  readonly ok: true;
  readonly value: A;
}

/** The failure arm, carrying the reason rather than printing it. */
export interface Err<out E> {
  readonly ok: false;
  readonly error: E;
}

export type Result<A, E> = Ok<A> | Err<E>;

/** The upper bound of every `Result`, for combinators that accept any of them. */
export type AnyResult = Result<unknown, unknown>;

/** The success type of a result — `number` for `Result<number, string>`. */
export type OkOf<R> = R extends Ok<infer A> ? A : never;

/** The failure type of a result — `string` for `Result<number, string>`. */
export type ErrOf<R> = R extends Err<infer E> ? E : never;

export function ok<A>(value: A): Ok<A> {
  return { ok: true, value };
}

export function err<E>(error: E): Err<E> {
  return { ok: false, error };
}

export function isOk<R extends AnyResult>(r: R): r is Extract<R, { readonly ok: true }> {
  return r.ok;
}

export function isErr<R extends AnyResult>(r: R): r is Extract<R, { readonly ok: false }> {
  return !r.ok;
}

/** Apply `f` to the value, leaving a failure untouched. */
export function mapOk<R extends AnyResult, B>(r: R, f: (a: OkOf<R>) => B): Result<B, ErrOf<R>> {
  return r.ok ? ok(f(r.value as OkOf<R>)) : (r as Err<ErrOf<R>>);
}

/** Apply `f` to the error, leaving a success untouched — for adding context as it propagates. */
export function mapErr<R extends AnyResult, F>(r: R, f: (e: ErrOf<R>) => F): Result<OkOf<R>, F> {
  return r.ok ? (r as Ok<OkOf<R>>) : err(f(r.error as ErrOf<R>));
}

/** Sequence a second fallible step. The monadic bind; short-circuits on the first failure. */
export function andThen<R extends AnyResult, B, E2>(
  r: R,
  f: (a: OkOf<R>) => Result<B, E2>,
): Result<B, ErrOf<R> | E2> {
  return r.ok ? f(r.value as OkOf<R>) : (r as Err<ErrOf<R>>);
}

/** Recover from a failure with a second attempt. */
export function recover<R extends AnyResult, A2, F>(
  r: R,
  f: (e: ErrOf<R>) => Result<A2, F>,
): Result<OkOf<R> | A2, F> {
  return r.ok ? (r as Ok<OkOf<R>>) : f(r.error as ErrOf<R>);
}

export function unwrapOr<R extends AnyResult, D>(r: R, fallback: D): OkOf<R> | D {
  return r.ok ? (r.value as OkOf<R>) : fallback;
}

export function unwrapOrElse<R extends AnyResult, D>(r: R, f: (e: ErrOf<R>) => D): OkOf<R> | D {
  return r.ok ? (r.value as OkOf<R>) : f(r.error as ErrOf<R>);
}

/**
 * Collapse both arms to one type.
 *
 * Prefer this to `if (r.ok) … else …` where the two branches produce the same kind of thing: it
 * is an expression, so the result can be `const`, and forgetting an arm is a type error rather
 * than an `undefined` at runtime.
 */
export function matchResult<R extends AnyResult, T>(
  r: R,
  handlers: { readonly ok: (a: OkOf<R>) => T; readonly err: (e: ErrOf<R>) => T },
): T {
  return r.ok ? handlers.ok(r.value as OkOf<R>) : handlers.err(r.error as ErrOf<R>);
}

/**
 * Map each element through a fallible function, stopping at the first failure.
 *
 * The all-or-nothing counterpart to {@link partitionResults}. Use it where one bad element
 * invalidates the whole batch; use {@link collect} where you want every reason at once.
 */
export function traverse<A, R extends AnyResult>(
  xs: Iterable<A>,
  f: (a: A, index: number) => R,
): Result<readonly OkOf<R>[], ErrOf<R>> {
  const out: OkOf<R>[] = [];
  let index = 0;
  for (const x of xs) {
    const r = f(x, index++);
    if (!r.ok) return r as Err<ErrOf<R>>;
    out.push(r.value as OkOf<R>);
  }
  return ok(out);
}

/** {@link traverse} with the function already applied. */
export function sequence<R extends AnyResult>(
  rs: Iterable<R>,
): Result<readonly OkOf<R>[], ErrOf<R>> {
  return traverse(rs, (r) => r);
}

/**
 * Split a batch into what succeeded and what did not, keeping both.
 *
 * This is the shape the interior's parsing actually wants: a malformed element is skipped and
 * the document is still built, so neither arm alone is the answer.
 */
export function partitionResults<R extends AnyResult>(
  rs: Iterable<R>,
): { readonly values: readonly OkOf<R>[]; readonly errors: readonly ErrOf<R>[] } {
  const values: OkOf<R>[] = [];
  const errors: ErrOf<R>[] = [];
  for (const r of rs) {
    if (r.ok) values.push(r.value as OkOf<R>);
    else errors.push(r.error as ErrOf<R>);
  }
  return { values, errors };
}

/**
 * Map each element through a fallible function, reporting **every** failure rather than the
 * first — the accumulating applicative, as opposed to {@link traverse}'s monadic bind.
 *
 * This is what a validator should use: telling a caller that their options object has one bad
 * field, then a second bad field on the next run, is a worse experience than telling them both.
 */
export function collect<A, R extends AnyResult>(
  xs: Iterable<A>,
  f: (a: A, index: number) => R,
): Result<readonly OkOf<R>[], readonly ErrOf<R>[]> {
  const values: OkOf<R>[] = [];
  const errors: ErrOf<R>[] = [];
  let index = 0;
  for (const x of xs) {
    const r = f(x, index++);
    if (r.ok) values.push(r.value as OkOf<R>);
    else errors.push(r.error as ErrOf<R>);
  }
  return errors.length === 0 ? ok(values) : err(errors);
}

/**
 * Run a function that may throw and capture the throw as a value.
 *
 * The boundary adapter, not a licence to keep throwing: it exists so that third-party code and
 * the XOM layer can be called from `Result`-shaped code without a bare `try` at every site.
 * `unknown` is deliberate — a `catch` binding genuinely is unknown, and pretending it is an
 * `Error` is how "cannot read property of undefined" reaches a user.
 */
export function attempt<A>(f: () => A): Result<A, unknown> {
  try {
    return ok(f());
  } catch (e) {
    return err(e);
  }
}
