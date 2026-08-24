/**
 * The document layer's own throws, kept out of the facade's classes.
 *
 * *"The interior owns the domain validators (one definition of legality) and
 * the facade wraps their throws in `InvalidOptionError` with `{ cause }`."* So the selection
 * rules live here, the typed facade surface stays in `src/api/errors.ts`, and `compareMpm`
 * re-throws these with the role-prefixed message (`MPM a: …`, `MPM b: …`).
 *
 * They extend `MeicoError` from `src/xml/errors.js`: a layer-1 module may not import from
 * layer 6 (RULE M1), and re-rooting the hierarchy would give the facade a second root that
 * `instanceof` cannot see. Each class carries structured fields rather than a pre-formatted
 * string, so the facade builds its message without parsing one back apart.
 */
import { MeicoError } from '../xml/errors.js';

/** Which of the two documents a problem is about — the role, carried structurally. */
export type ComparisonDocumentRole = 'a' | 'b';

/**
 * A document holds several performances and the caller named none.
 *
 * *"multi-performance document, no selector — `InvalidOptionError` naming the
 * candidates"*. The names travel on the error so the facade can list them.
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
 * which is routed here on purpose (*"users hand-building neutral documents hit this"*).
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
 * This is split from the not-found case (`InvalidOptionError` versus
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
 * A resolved quarter-BPM that is not a positive number — the `qbpm ≤ 0` row.
 *
 * A DOCUMENT error rather than a `⊥` span, by the split: `⊥` is for a value the renderer
 * performs and the comparison cannot read, while a non-positive tempo has no logarithm at all
 * — `T` is `−∞` at 0 and `NaN` below it, so every quantity downstream would be one of those.
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

/**
 * Two corpus items reduced to one label after expansion.
 *
 * Every tie in the products is broken on a label, and a PAM medoid's whole value is
 * naming a real performer, so two documents both labelled `"Welte 1905"` would make "the most
 * typical Hofmann" ambiguous. The message names every collision and the item indices that
 * produced it, since with ~256 items an error naming none sends the caller bisecting their corpus.
 */
export class CorpusLabelCollisionError extends MeicoError {
  constructor(readonly collisions: ReadonlyMap<string, readonly number[]>) {
    super(
      `corpus labels must be unique after expansion; ${String(collisions.size)} collide: ${[
        ...collisions,
      ]
        .map(([label, indices]) => `"${label}" from items ${indices.join(', ')}`)
        .join('; ')}`,
    );
  }
}

/** More items than `maxItems` allows — the ceiling, raised to 256 for the Daten corpus. */
export class CorpusSizeError extends MeicoError {
  constructor(
    readonly count: number,
    readonly maxItems: number,
  ) {
    super(
      `the corpus expands to ${String(count)} items, past maxItems = ${String(maxItems)}; ` +
        'raise maxItems or narrow the corpus',
    );
  }
}

/**
 * A `k` or an `embeddingAxes` outside its domain, checked after the item expansion.
 *
 * The bound depends on the EXPANDED count, which the facade cannot know without reading the
 * documents — a multi-performance item becomes several. Still the knowable branch rather
 * than a degradation note: a silently clamped `k` would answer a different question.
 */
export class CorpusOptionRangeError extends MeicoError {
  constructor(
    readonly option: string,
    readonly value: number,
    readonly limit: number,
    readonly expanded: number,
  ) {
    super(
      `${option} = ${String(value)} is outside [1, ${String(limit)}] for a corpus that expands ` +
        `to ${String(expanded)} items`,
    );
  }
}
