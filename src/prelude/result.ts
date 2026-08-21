/**
 * A computation that either produced a value or explained why it did not.
 *
 * The idiom this replaces is Java's — log the reason, return `null` — which destroys the only
 * copy of the explanation. A `Result` keeps it as a value, so a caller can inspect it,
 * aggregate it, or hand it to the facade to turn into a typed error.
 *
 * Combinators are data-first: `mapOk(r, f)`, never `map(f)(r)`. There is no curried mirror.
 *
 * They take `R extends AnyResult` rather than `Result<A, E>` because TypeScript cannot infer
 * type arguments *through* a union target — both constituents of `Ok<number> | Err<string>`
 * contain inference positions, so inference gives up and the callback receives `unknown`.
 * Taking the whole result as one parameter and projecting the arms back out with
 * {@link OkOf}/{@link ErrOf}, conditional types that do distribute over a union, makes the
 * callback parameter land as `number` unannotated.
 */

/** The success arm. */
export interface Ok<out A> {
  readonly ok: true;
  readonly value: A;
}

/** The failure arm. */
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

/** Apply `f` to the error, leaving a success untouched, to add context as it propagates. */
export function mapErr<R extends AnyResult, F>(r: R, f: (e: ErrOf<R>) => F): Result<OkOf<R>, F> {
  return r.ok ? (r as Ok<OkOf<R>>) : err(f(r.error as ErrOf<R>));
}

/** Sequence a second fallible step, short-circuiting on the first failure. */
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
 * Collapse both arms to one type. Preferable to `if (r.ok) … else …` where both branches
 * produce the same kind of thing: it is an expression, so the result can be `const`, and a
 * missing arm is a type error rather than an `undefined` at runtime.
 */
export function matchResult<R extends AnyResult, T>(
  r: R,
  handlers: { readonly ok: (a: OkOf<R>) => T; readonly err: (e: ErrOf<R>) => T },
): T {
  return r.ok ? handlers.ok(r.value as OkOf<R>) : handlers.err(r.error as ErrOf<R>);
}

/**
 * Map each element through a fallible function, stopping at the first failure. Use it where
 * one bad element invalidates the batch; {@link collect} to get every reason at once,
 * {@link partitionResults} to keep the good ones.
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
 * Split a batch into what succeeded and what did not, keeping both — the shape parsing wants,
 * where a malformed element is skipped and the document is still built.
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
 * Map each element through a fallible function, reporting every failure rather than only the
 * first. What validation wants: one run should name all the bad fields, not the next one each
 * time.
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
 * Run a function that may throw and capture the throw as a value, so that third-party code and
 * the XOM layer can be called from `Result`-shaped code without a bare `try` at every site.
 * The error type is `unknown` because a `catch` binding genuinely is.
 */
export function attempt<A>(f: () => A): Result<A, unknown> {
  try {
    return ok(f());
  } catch (e) {
    return err(e);
  }
}
