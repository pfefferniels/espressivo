/**
 * The library's error hierarchy.
 *
 * `MeicoError` is the single root ARCHITECTURE.md RULE E2 specifies for the public facade;
 * it lives here rather than in `src/api/errors.ts` because `MissingNodeError` is thrown from
 * `src/xml/tree.ts` (RULE N2a) and a layer-1 module may not import from layer 6 (RULE M1).
 * When T13 creates `src/api/errors.ts` it must **re-export** these two and declare its own
 * `ParseError`/`EmptyDocumentError`/… on top — redeclaring `MeicoError` there would give the
 * facade a second root that `instanceof` cannot see.
 *
 * Nothing on the parity-frozen conversion path throws any of these: the interior keeps
 * Java's logs-and-returns-null behaviour (RULE E1). The two errors TD2 added are the
 * documented exceptions, and both are confined to input Java itself refuses — see
 * PARITY.md, "Fixed bugs".
 */

/** Base class for every error this library raises deliberately. */
export class MeicoError extends Error {}

/**
 * Thrown by the `require*` accessors in {@link module:xml/tree} when the node they were
 * asked for is absent. The non-throwing siblings (`firstChildElement`, `attribute`,
 * `parentElement`) return `null` instead and are the right choice wherever absence is a
 * possible outcome rather than a broken invariant.
 */
export class MissingNodeError extends MeicoError {}

/**
 * The library's `NumberFormatException`: an attribute value that has to be numeric is not a
 * Java double literal. Thrown by {@link module:supplementary/parseJavaDouble} on the def
 * parse path, where the surrounding `create*` factory catches it, logs it and returns null —
 * so the malformed def is skipped exactly as it is in Java (PARITY.md, "Fixed bugs", P1).
 */
export class NumberFormatError extends MeicoError {}

/**
 * A numeric argument lies outside the range its callee can serve — the library's analogue of
 * the built-in `RangeError`. It extends {@link MeicoError} rather than `RangeError` so that
 * `instanceof MeicoError` keeps catching everything the library raises deliberately, which is
 * this module's whole reason for existing.
 *
 * Thrown by {@link RandomNumberProvider}'s index guards for a `NaN`, infinite or absurdly
 * large index. Unguarded, those fail in three different ways rather than one: `NaN` overflows
 * the stack, `Infinity` and huge finite indices allocate for seconds before dying with a bare
 * `RangeError`, and `-Infinity` quietly returns the first value in the series. The third is
 * the reason the guard tests finiteness rather than only screening for the two loud failures
 * — a silently wrong index is worse than one that throws (PARITY.md, "Fixed bugs", P4).
 */
export class OutOfRangeError extends MeicoError {}
