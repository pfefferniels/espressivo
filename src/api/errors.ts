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
 * A `spotlight` selection could not be turned into a set of spared dimensions: at least one
 * `xml:id` names nothing in the document, or names an element type that governs no
 * exaggeration dimension.
 *
 * The message lists **every** offender with its kind, `unresolved` or `unmappable`, and the run
 * does not happen (DESIGN.md D-I/A8). Both halves of that are deliberate. Reporting only the
 * first offender would make fixing a stale selection an iteration; running anyway on the ids
 * that did resolve would be the prototype's worst defect, which discarded unresolvable ids with
 * a bare `continue` and, for a selection of nothing but `<style>` switches, quietly attenuated
 * **every** dimension — a flattened performance returned as a successful spotlight.
 *
 * It is a caller error rather than a document condition: an id the caller holds no longer
 * points where they think it does, which is worth knowing before it becomes a rendered result.
 * `spotlightMpm(mpm, { ids: [], … })` is the way to ask for no selection, and it returns the
 * canonical document rather than raising this.
 */
export class SelectionNotFoundError extends MeicoError {}

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
