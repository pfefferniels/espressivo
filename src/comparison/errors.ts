/**
 * The document layer's own throws, and why they are not the facade's classes.
 *
 * DESIGN.md §9.4 assigns the taxonomy explicitly: *"The interior owns the domain validators
 * (one definition of legality) and the facade wraps their throws in `InvalidOptionError`
 * with `{ cause }`."* So the selection rules live here, the typed facade surface stays in
 * `src/api/errors.ts`, and W3's `compareMpm` catches these and re-throws as
 * `InvalidOptionError` / `PerformanceNotFoundError` with the role-prefixed message §9.4
 * requires (`MPM a: …`, `MPM b: …`).
 *
 * They extend `MeicoError` from `src/xml/errors.js` rather than from `src/api/errors.js`
 * for the reason that file states in its own header: a layer-1 module may not import from
 * layer 6 (RULE M1), and re-rooting the hierarchy would give the facade a second root that
 * `instanceof` cannot see. `MeicoError` is the shared root precisely so interior layers can
 * throw something the facade can catch.
 *
 * Each class carries the structured fields the facade needs to build its message, rather
 * than a pre-formatted string: the facade knows the document role and the house prefix
 * convention, and asking it to parse a message back apart would be the thing §9.4's
 * "without parsing the message" clause rules out for the sibling case.
 */
import { MeicoError } from '../xml/errors.js';

/** Which of the two documents a problem is about — §9.4's role, carried structurally. */
export type ComparisonDocumentRole = 'a' | 'b';

/**
 * A document holds several performances and the caller named none.
 *
 * §9.4: *"multi-performance document, no selector — `InvalidOptionError` naming the
 * candidates"*. The candidate names travel on the error so the facade can list them; a
 * caller told only "ambiguous" has to go and read the file themselves.
 */
export class PerformanceSelectionAmbiguousError extends MeicoError {
  constructor(
    readonly role: ComparisonDocumentRole,
    /** Every `<performance>` name in document order; `''` for an unnamed one. */
    readonly candidates: readonly string[],
  ) {
    super(
      `performance selector required for document ${role}: ${String(candidates.length)} performances (${candidates
        .map((name) => JSON.stringify(name))
        .join(', ')})`,
    );
  }
}

/**
 * The named or indexed performance is not there — including the zero-performance document,
 * which §9.4 routes here on purpose (C8: *"users hand-building neutral documents hit this"*).
 */
export class PerformanceSelectionNotFoundError extends MeicoError {
  constructor(
    readonly role: ComparisonDocumentRole,
    readonly selector: string | number | null,
    readonly candidates: readonly string[],
  ) {
    super(
      selector === null
        ? `document ${role} contains no <performance>`
        : `document ${role} has no performance ${JSON.stringify(selector)} (${String(candidates.length)} available)`,
    );
  }
}

/**
 * A selector that is not a usable index or name at all — a negative or fractional number.
 *
 * §9.4 splits this from the not-found case (`InvalidOptionError` versus
 * `PerformanceNotFoundError`) because the caller could have known this one without reading
 * the document.
 */
export class PerformanceSelectorInvalidError extends MeicoError {
  constructor(
    readonly role: ComparisonDocumentRole,
    readonly selector: number,
  ) {
    super(
      `performance selector for document ${role} must be a non-negative integer or a name, got ${String(selector)}`,
    );
  }
}

/**
 * A resolved quarter-BPM that is not a positive number — §9.4's `qbpm ≤ 0` row (M11).
 *
 * It is a DOCUMENT error rather than a `⊥` span, and the split is §4's: `⊥` is for a value the
 * renderer performs and the comparison cannot read, while a non-positive tempo has no logarithm
 * at all — `T` is `−∞` at 0 and `NaN` below it, so every quantity downstream would be one of
 * those. AD-1's "compare what is performed" does not reach a document that states a tempo no
 * performance can have.
 */
export class NonPositiveTempoError extends MeicoError {
  constructor(
    readonly role: ComparisonDocumentRole,
    readonly qbpm: number,
    readonly dateTicks: number,
  ) {
    super(
      `document ${role} resolves a tempo of ${String(qbpm)} quarter-BPM at tick ` +
        `${String(dateTicks)}; a tempo must be a positive number`,
    );
  }
}
