/**
 * The prelude: the vocabulary this codebase is being rewritten in.
 *
 * A leaf in the layering (`eslint.config.js`'s `LAYER_ZONES`) — it imports nothing from the
 * library, and everything may import it.
 *
 * Every name is exported flat and every name is self-describing, so a call site reads without
 * a namespace prefix and a symbol can be grepped for across the tree. That is why the result
 * combinators are `mapOk` / `recover` / `matchResult` / `partitionResults` rather than the
 * bare `map` / `orElse` / `match` / `partition` a namespaced module would have used: those
 * four words mean something else in almost every file that would import them.
 *
 * ```ts
 * import { filterMap, presentOrError, traverse, matchKind } from '../prelude/index.js';
 * ```
 */

export type { Result, Ok, Err, AnyResult, OkOf, ErrOf } from './result.js';
export {
  ok,
  err,
  isOk,
  isErr,
  mapOk,
  mapErr,
  andThen,
  recover,
  unwrapOr,
  unwrapOrElse,
  matchResult,
  traverse,
  sequence,
  partitionResults,
  collect,
  attempt,
} from './result.js';

export {
  isPresent,
  isAbsent,
  mapPresent,
  flatMapPresent,
  keepIf,
  orDefault,
  orCompute,
  firstPresent,
  bothPresent,
  compact,
  presentOrError,
  normalize,
} from './option.js';

export type { NonEmptyArray } from './seq.js';
export {
  isNonEmpty,
  head,
  last,
  elementAt,
  filterMap,
  partitionWith,
  groupBy,
  chunkBy,
  foldl,
  scanl,
  zipWith,
  pairwise,
  windows,
  unfold,
  stableSortBy,
  partitionPoint,
  lowerBoundBy,
  upperBoundBy,
  insertionIndexBy,
} from './seq.js';

export { fromEntriesExact, mapValues } from './record.js';
export { assertNever, matchKind, matchOn } from './match.js';
export { pipe, flow, identity } from './fn.js';
export type { Brand, Unbrand } from './newtype.js';
export { refiner, unsafeBrand } from './newtype.js';
