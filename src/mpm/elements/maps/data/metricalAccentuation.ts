import type { AccentuationPatternDef } from '../../styles/defs/AccentuationPatternDef.js';

/**
 * One `<accentuationPattern>` as the renderer places it: where the pattern starts, how far
 * it reaches, how hard it is applied, and what it counts its beats against.
 *
 * ## Why this is a record and not a class
 *
 * `MetricalAccentuationData` was a mutable class with a `clone()` and ten fields, six of
 * them nullable. Unlike its siblings it never had a *write* half to justify that: Java's
 * `MetricalAccentuationMap.addAccentuationPattern(MetricalAccentuationData)` overload was
 * never ported, so `addAccentuationPattern` here takes plain arguments and nothing in the
 * tree ever built one of these to serialize. Every instance came from
 * `getMetricalAccentuationDataOf`, went straight into the render loop, and was discarded —
 * so `clone()` had no caller, and the six nulls described states the one producer cannot
 * produce.
 *
 * Four of the six are gone with the fields: `xml`, `xmlId`, `style` and `styleName` were
 * set on every datum and read by nobody after the reader itself. Of the remaining two,
 * `endDate` is `GenericMap.nextDateOfType`, which answers `Number.MAX_VALUE` rather than
 * null for a last instruction, and `accentuationPatternDefName` is rejected by the reader
 * when the attribute is missing — both are total here.
 *
 * ## The one null that stays, and why it must
 *
 * {@link accentuationPatternDef} is nullable, and that is not laxity: **an unresolvable
 * pattern name aborts the whole performance render, and that is the specified behaviour.**
 * Java's `getMetricalAccentuationDataOf` returns a datum with a null def whenever the style
 * resolves but `style.getDef(name)` does not
 * (MetricalAccentuationMap.java:224-228 — the comment there claims the opposite, the code
 * does not check), and `renderMetricalAccentuationToMap` then calls
 * `md.accentuationPatternDef.getLength()` unguarded and throws a NullPointerException.
 *
 * So the parity-correct behaviour is a **crash**, not a skip, and the two are not
 * interchangeable: an `<accentuationPattern>` with no `<style>` in scope IS skipped
 * silently, and the comparison module measures the difference — `src/comparison/
 * accentuationCurve.ts` reports the unresolvable-def case as `⊥` (ruling R21) and the
 * no-style case as an ordinary renderer skip, quoting the exact `TypeError: Cannot read
 * properties of null (reading 'getLength')` that this port raises. Making the field
 * non-nullable would mean either rejecting the instruction here — turning the crash into a
 * skip, which would silently render documents Java refuses — or fabricating a def. Both
 * change what the renderer does; keeping the null does not.
 *
 * `MetricalAccentuationMap.renderMetricalAccentuationToMap` therefore aborts on it, with an
 * explicit `throw` that raises the very `TypeError` the unguarded dereference used to —
 * same class, same message, same line. It was a documented `!` until the functional-core
 * campaign; the assertion existed only to let the next line throw, which is a branch.
 *
 * Port of meico.mpm.elements.maps.data.MetricalAccentuationData, restructured.
 */
export interface MetricalAccentuation {
  /** `@date`, in ticks — where the pattern is placed. */
  readonly startDate: number;
  /**
   * Where the instruction stops being in force: the next `<accentuationPattern>`'s date,
   * or `Number.MAX_VALUE` when there is none (`GenericMap.nextDateOfType`).
   */
  readonly endDate: number;
  /**
   * `@name.ref` — the `accentuationPatternDef` this instruction asks for.
   *
   * Kept beside the resolved {@link accentuationPatternDef} rather than folded into it,
   * because when the def is null the name is the only record of what was asked for. The
   * same argument keeps `localName` on `distribution.ts`'s unknown-family arm.
   */
  readonly accentuationPatternDefName: string;
  /**
   * The def {@link accentuationPatternDefName} resolved to, or null where the style is in
   * scope but carries no def by that name. See the header: null here aborts the render.
   */
  readonly accentuationPatternDef: AccentuationPatternDef | null;
  /** `@scale` — the factor each accentuation is multiplied by before being added. */
  readonly scale: number;
  /** `@loop`; false means the pattern applies once and the rest of the span is untouched. */
  readonly loop: boolean;
  /**
   * `@stickToMeasures`, default true — whether beats are counted from each measure start
   * (so the pattern re-aligns at every barline) or from the instruction's own date.
   */
  readonly stickToMeasures: boolean;
}
