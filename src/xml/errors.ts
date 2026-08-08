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
 * Nothing on the parity-frozen conversion path throws either of these: the interior keeps
 * Java's logs-and-returns-null behaviour (RULE E1).
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
