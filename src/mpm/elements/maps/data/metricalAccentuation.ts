import type { AccentuationPatternDef } from '../../styles/defs/AccentuationPatternDef.js';

/**
 * One `<accentuationPattern>` as the renderer places it: where the pattern starts, how far
 * it reaches, how hard it is applied, and what it counts its beats against.
 *
 * ## The one null, and why it must stay
 *
 * {@link accentuationPatternDef} is nullable because an unresolvable pattern name aborts the
 * whole performance render, and that is the specified behaviour. Java's
 * `getMetricalAccentuationDataOf` returns a datum with a null def whenever the style resolves
 * but `style.getDef(name)` does not (MetricalAccentuationMap.java:224-228 — the comment there
 * claims the opposite, the code does not check), and `renderMetricalAccentuationToMap` then
 * calls `md.accentuationPatternDef.getLength()` unguarded and throws a NullPointerException.
 *
 * So the parity-correct behaviour is a crash, not a skip, and the two are not
 * interchangeable: an `<accentuationPattern>` with no `<style>` in scope IS skipped silently,
 * and `src/comparison/accentuationCurve.ts` measures the difference — the unresolvable-def
 * case as `⊥` (ruling R21), the no-style case as an ordinary renderer skip, quoting the exact
 * `TypeError: Cannot read properties of null (reading 'getLength')` that this port raises.
 * `MetricalAccentuationMap.renderMetricalAccentuationToMap` raises it with an explicit
 * `throw`: same class, same message, same line. Making the field non-nullable would mean
 * either rejecting the instruction here — turning the crash into a skip, which would render
 * documents Java refuses — or fabricating a def.
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
   * because when the def is null the name is the only record of what was asked for.
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
