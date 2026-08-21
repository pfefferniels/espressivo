import { matchKind } from '../../../../prelude/index.js';
import type { AccentuationPatternDef } from './AccentuationPatternDef.js';
import type { ArticulationDef } from './ArticulationDef.js';
import type { DynamicsDef } from './DynamicsDef.js';
import type { OrnamentDef } from './OrnamentDef.js';
import type { RubatoDef } from './RubatoDef.js';
import type { TempoDef } from './TempoDef.js';

/**
 * The six MPM `*Def` elements, as a sum type.
 *
 * ## What this replaced
 *
 * `abstract class AbstractDef extends AbstractXmlSubtree`, with six subclasses. Its whole
 * contribution was one field and the two accessors over it:
 *
 * ```ts
 * protected name!: Attribute;
 * getName() { return this.name.getValue(); }
 * protected setName(n: string) { this.name.setValue(n); }
 * ```
 *
 * — no dispatch (the six forwarding `parseData` overrides were folded away in `953913e`,
 * which found every one of them unreachable), and a definite-assignment marker holding the
 * whole thing up. What is left of the base is {@link requireDefName}, a function each def's
 * factory calls *before* constructing, so the attribute is a `readonly` constructor
 * parameter and the state the `!` was papering over does not exist.
 *
 * ## Why the arms are classes and not records
 *
 * The rest of this campaign turns parsed XML into immutable records
 * (`maps/data/distribution.ts` is the pattern). These six stay classes, and the reason is
 * that they are not *readings* of a document — they are **editors of one**. `RubatoDef`
 * writes three defaulted attributes back onto the caller's element while parsing;
 * `ArticulationDef` has twelve setters whose write order is byte-visible (`addAttribute` is
 * remove-then-append in XomTypes, so re-setting an existing attribute moves it to the end of
 * the serialized list — the sibling defs use in-place `setValue` and do not);
 * `AccentuationPatternDef` re-inserts children to keep them sorted; `OrnamentDef.setAlignment`
 * adds or removes an attribute depending on the value. A record would have to be rebuilt into
 * the live tree on every one of those, and the tree is the single source of truth
 * (`AbstractXmlSubtree`). So: one live XML subtree per def, and the sum type over the six is
 * what a base class was pretending to be.
 *
 * ## What the discriminant buys
 *
 * `Style<'generic'>` — the fallback for a `…Styles` collection this port does not recognise —
 * holds defs of no particular kind, and before this its def type was the base class, so a
 * reader got a bare `getName()` and nothing else. Now it holds a `Def` and a reader can
 * {@link matchDef} its way to the right accessors, exhaustively. Everywhere else the kind is
 * static and the discriminant is simply free.
 */
export type Def =
  TempoDef | DynamicsDef | ArticulationDef | AccentuationPatternDef | RubatoDef | OrnamentDef;

/** The six `kind` discriminants, as spelled on the classes themselves. */
export type DefKind = Def['kind'];

/**
 * Dispatch over a def whose kind is not statically known, with a complete handler table.
 *
 * A thin alias for the prelude's {@link matchKind}, pinned to {@link Def} so the table is
 * checked against exactly these six and a seventh def would be a compile error at every call
 * site rather than a silent fall-through.
 */
export function matchDef<R>(
  def: Def,
  handlers: { readonly [K in DefKind]: (arm: Extract<Def, { readonly kind: K }>) => R },
): R {
  return matchKind(def, handlers);
}
