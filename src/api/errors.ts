/**
 * The facade's error types (ARCHITECTURE.md RULE E2).
 *
 * The interior (L0–L5) keeps Java's logs-and-returns-null behaviour bug-for-bug (RULE E1);
 * the facade is where that turns into something a caller can branch on. Every function in
 * {@link module:api/pipeline} converts an interior `null`-meaning-failure into one of these
 * and never returns `null` itself.
 *
 * `MeicoError` and `MissingNodeError` are **re-exported**, not redeclared: `MissingNodeError`
 * is thrown from `src/xml/tree.ts` (RULE N2a) and a layer-1 module may not import from layer
 * 6, so both live in `src/xml/errors.ts`. Declaring a second `MeicoError` here would give the
 * facade a root that `instanceof` cannot see from the interior — which is exactly what
 * `src/xml/errors.ts`'s own comment warns T13 about.
 */
export { MeicoError, MissingNodeError } from '../xml/errors.js';

import { MeicoError } from '../xml/errors.js';

/**
 * The input is not well-formed XML, its root element is not the expected one, or an
 * attribute the MSM schema requires to be numeric does not parse as a number.
 */
export class ParseError extends MeicoError {}

/**
 * The document parsed, but there is nothing to work with: an MEI with no convertible
 * movement, an MSM that carries no performance attributes (RULE E3), or a render that
 * produced no MIDI.
 */
export class EmptyDocumentError extends MeicoError {}

/** The requested performance — by name or by index — is not in the MPM. */
export class PerformanceNotFoundError extends MeicoError {}

/**
 * An option value is outside its domain: `ppq <= 0`, a non-finite `seed`, a
 * `movementSampleMaxStep` that is not positive, or a `PerformOptions` field passed where
 * nothing is performed.
 */
export class InvalidOptionError extends MeicoError {}
