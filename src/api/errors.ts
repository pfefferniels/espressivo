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
 * `movementSampleMaxStep` that is not positive, an unknown exaggeration dimension, an
 * exaggeration factor outside its dimension's admissible domain, or a `PerformOptions` field
 * passed where nothing is performed.
 */
export class InvalidOptionError extends MeicoError {}

/**
 * The expression engine broke one of its own invariants — a guard that should have held did
 * not, so the run was abandoned rather than allowed to write a document nobody intends.
 *
 * It is a distinct type because it says something different from every other error here:
 * neither "your document is malformed" nor "your option is out of domain", but "an internal
 * guarantee failed". **No document can provoke it**, at any factor. Exactly one input can, and
 * naming it is the honest form of this contract:
 *
 * - **`ExaggerateOptions.minRubatoWindow` below about 2⁻⁵³.** DESIGN.md A6's guard clamps the
 *   rubato joint trim to `1 − minRubatoWindow`, then asserts the resulting window is still
 *   ordered (`lateStart < earlyEnd`) before writing it. Below the double epsilon,
 *   `1 − minRubatoWindow` rounds to exactly 1, the clamp stops clamping, and a saturating trim
 *   collapses the window onto a point. The option's own documentation (`options.ts`) states
 *   the range this falls out of — the default `1e-6` is chosen "far above the ~2⁻⁵³ at which
 *   the split's own rounding would decide the answer" — but its *validated* domain is the
 *   whole of (0,1), so such a value is accepted and then cannot be honoured.
 *
 * At the documented default, and anywhere inside the guard's working range, no combination of
 * document and factors reaches this class. Interior failures throw a plain `Error` by design —
 * `src/expression/**` has no typed-error vocabulary of its own, because the hierarchy lives
 * here — and this is where they become catchable.
 */
export class EngineInvariantError extends MeicoError {}
