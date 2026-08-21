/**
 * `⊥` and the renderer-faithful reading of a level — the two places where this module
 * deliberately parts company with the expression engine.
 *
 * ## `⊥` is a value, not a gap
 *
 * DESIGN.md §5.0: *"The domain is total. Nothing is ever excluded from `[start, end]`.
 * Where a side has no comparable value the row reads `⊥`; where the renderer has no
 * performed value the span reads `⊥` on that side."* §4 prices `⊥` at `δ_row` from
 * everything and 0 from itself, so it must survive as far as the density layer rather than
 * being resolved to a number or dropped here. This layer only produces and carries the
 * marker; the causes that generate it from the renderer's own failures (§5.4's aborting
 * `accentuationPatternDef`, §5.7's NaN-poisoned asynchrony span) are the evaluators' to
 * detect, which is why {@link BottomCause} is open at this layer to exactly the one cause
 * a document reader can see.
 *
 * ## The renderer's fabricated 100.0 (R8 / AD-1 — this reverses the survey)
 *
 * `styleScope.readLevel` answers `def | literal | unresolvable`, and refuses to invent a
 * value for the third (`styleScope.ts:26-30`). That refusal is right for the *write*
 * transform it was built for: exaggerating around a level the author never wrote would
 * move every other level. It is wrong here, and importing it was the survey's error.
 *
 * The renderer does not refuse. `TempoStyle.getNumericBpmValueStatic:49-58` and
 * `DynamicsStyle.getNumericValueStatic:49-57` return **100.0** and log, so `volume="?"` and
 * `volume="100"` are performed identically — a fact the survey's reading hid — while
 * `volume="?"` against `volume="40"` is a difference an audience hears plainly, which it
 * also hid. A comparison of what is *performed* must therefore resolve to 100.0 and say so
 * through the `renderer-default-level` note channel, with no span excluded.
 */
import type { Element } from '../xml/XomTypes.js';
import { resolveLevel, type LevelDomain } from '../expression/styleScope.js';
import type { MpmEnvironment } from '../expression/mpmTree.js';

/**
 * Why a side has no comparable value.
 *
 * One member today, and a union rather than a bare string because §5.4 and §5.7 add
 * `renderer-error` variants in W2c and the report's note channel keys on the cause.
 */
export type BottomCause = 'renderer-error';

/** §4's `⊥`: priced at `δ_row` from everything, 0 from itself. */
export interface Bottom {
  readonly kind: 'bottom';
  readonly cause: BottomCause;
}

/**
 * A value that may be `⊥`.
 *
 * **Deliberately not `Result<T, BottomCause>`**, though it is the same two-arm shape and the
 * temptation is obvious. A `Result`'s failure arm means *this computation produced nothing*,
 * and every combinator over it is built on that meaning: `mapOk` skips it, `andThen`
 * short-circuits on it, `unwrapOr` substitutes for it. §5.0 says the opposite in as many words
 * — "the domain is total, nothing is ever excluded from `[start, end]`" — and §4 gives `⊥` its
 * own arithmetic, `δ_row` from everything and 0 from itself. It is a **member of the value
 * domain**, not the absence of one.
 *
 * So the danger is not that `Result` would be inexpressive; it is that it would be expressive
 * in the wrong direction. `mapOk(row, f)` over a `⊥` compiles, reads correctly, and silently
 * drops the `δ_row` the density layer is owed — which is the single defect this type was
 * introduced to make impossible. A domain-specific sum with an ugly-on-purpose name, whose only
 * eliminator is a `kind` switch every caller has to write out, is what keeps that honest.
 */
export type Valued<T> = { readonly kind: 'value'; readonly value: T } | Bottom;

export function valued<T>(value: T): Valued<T> {
  return { kind: 'value', value };
}

export function bottom(cause: BottomCause): Bottom {
  return { kind: 'bottom', cause };
}

export function isBottom<T>(value: Valued<T>): value is Bottom {
  return value.kind === 'bottom';
}

/**
 * The constant the renderer substitutes for a level it cannot resolve.
 *
 * 100.0 in **both** domains, and in the tempo case this is the raw `bpm` — the
 * `bpm · beatLength · 4` normalization to quarter-bpm happens downstream, exactly as R8
 * spells it ("100.0 for `bpm`, before the `beatLength·4` normalization").
 */
export const RENDERER_DEFAULT_LEVEL = 100.0;

/**
 * How a level string became a number — the three cases the report distinguishes.
 *
 * `renderer-default` is not a failure state: it is a faithful reading of what the renderer
 * performs, and it exists as its own kind only so the note channel can report the span.
 */
export type LevelSource = 'def' | 'literal' | 'renderer-default';

export interface ResolvedComparisonLevel {
  readonly value: number;
  readonly source: LevelSource;
  /** The attribute text as written, for the report's note. */
  readonly raw: string;
  /** The `<*Def>` the value came from, when `source === 'def'`; else null. */
  readonly def: Element | null;
}

/**
 * Resolve a `@bpm` / `@volume` / `@transition.to` level the way the renderer resolves it.
 *
 * Style lookup is delegated to `styleScope` and **must** be: §5.0's second shadowing rule
 * requires it, because a part header declaring `styleDef name="A"` hides the global `"A"`
 * entirely while leaving `"B"` visible, and a direct header scan gets that wrong in a way
 * that changes a rendered velocity rather than merely a lookup path
 * (`styleScope.ts:8-15`, `levels.ts:38-46`).
 *
 * A `def` whose own `@value` is non-finite is left as it is rather than being promoted to
 * the default: the renderer found a def and used its number, and `NaN` is what it used. The
 * evaluators decide what that does to a curve; inventing 100.0 for it here would report a
 * `renderer-default-level` note about a document that has no unresolvable level in it.
 */
export function resolveComparisonLevel(
  levelString: string,
  domain: LevelDomain,
  styleName: string | null,
  environment: MpmEnvironment,
  globalEnvironment: MpmEnvironment,
): ResolvedComparisonLevel {
  const reading = resolveLevel(levelString, domain, styleName, environment, globalEnvironment);
  // A `switch` on `kind`, and NOT `matchKind` — which is a keep, recorded rather than left to
  // look like an omission. The tree-wide argument is that a three-arm switch whose arms build
  // three differently-shaped records reads no better through a dispatch table, and the local one
  // is stronger: this file's own header spends a paragraph arguing that {@link Valued}'s only
  // eliminator must be a `kind` switch the caller writes out, because a combinator over it
  // "compiles, reads correctly, and silently drops the δ_row the density layer is owed". The
  // sibling union in the same file cannot take a combinator; adopting one HERE would put two
  // conventions in one file and make the ban on the other look like an oversight.
  switch (reading.kind) {
    case 'def':
      return { value: reading.value, source: 'def', raw: levelString, def: reading.def };
    case 'literal':
      return { value: reading.value, source: 'literal', raw: levelString, def: null };
    case 'unresolvable':
      return {
        value: RENDERER_DEFAULT_LEVEL,
        source: 'renderer-default',
        raw: levelString,
        def: null,
      };
  }
}
