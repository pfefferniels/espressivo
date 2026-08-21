import { matchKind } from '../../../../prelude/index.js';
import type { AccentuationPatternDef } from './AccentuationPatternDef.js';
import type { ArticulationDef } from './ArticulationDef.js';
import type { DynamicsDef } from './DynamicsDef.js';
import type { OrnamentDef } from './OrnamentDef.js';
import type { RubatoDef } from './RubatoDef.js';
import type { TempoDef } from './TempoDef.js';

/**
 * The six MPM `*Def` elements, as a sum type. There is no base class; the `@name` every def
 * needs is read before construction by {@link requireDefName}, so each holds it as a `readonly`
 * constructor parameter.
 *
 * The arms are classes and not the immutable records the rest of this tree parses XML into,
 * because they are not *readings* of a document but **editors of one**. `RubatoDef` writes
 * three defaulted attributes back onto the caller's element while parsing; `ArticulationDef`
 * has twelve setters whose write order is byte-visible (`addAttribute` is remove-then-append in
 * XomTypes, so re-setting an existing attribute moves it to the end of the serialized list —
 * the sibling defs use in-place `setValue` and do not); `AccentuationPatternDef` re-inserts
 * children to keep them sorted; `OrnamentDef.setAlignment` adds or removes an attribute
 * depending on the value. A record would have to be rebuilt into the live tree on every one of
 * those, and the tree is the single source of truth (`AbstractXmlSubtree`).
 *
 * The discriminant earns its keep in `Style<'generic'>` — the fallback for a `…Styles`
 * collection this port does not recognise — where a reader can {@link matchDef} its way to the
 * right accessors exhaustively. Everywhere else the kind is static and the discriminant is free.
 */
export type Def =
  TempoDef | DynamicsDef | ArticulationDef | AccentuationPatternDef | RubatoDef | OrnamentDef;

/** The six `kind` discriminants, as spelled on the classes themselves. */
export type DefKind = Def['kind'];

/**
 * Dispatch over a def whose kind is not statically known. The prelude's {@link matchKind},
 * pinned to {@link Def}, so a seventh def is a compile error at every call site rather than a
 * silent fall-through.
 */
export function matchDef<R>(
  def: Def,
  handlers: { readonly [K in DefKind]: (arm: Extract<Def, { readonly kind: K }>) => R },
): R {
  return matchKind(def, handlers);
}
