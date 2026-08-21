/**
 * A rubato instruction on its way *into* a `rubatoMap` — the argument
 * {@link RubatoMap.addRubato} serializes, and nothing else.
 *
 * ## Why this is not {@link ../data/rubato.ts Rubato}
 *
 * Writing a `<rubato>` and reading one back are different jobs with different type
 * requirements, and the Java class that does both pays for it with nullable fields that no
 * single caller fills in. On the way *out*, null is meaningful and load-bearing: a
 * `<rubato name.ref="myDef" loop="true"/>` is a complete, legal instruction that spells out
 * none of the four numbers, because they come from the def. `addRubato` therefore branches
 * on each field and omits the attribute it has nothing for.
 *
 * On the way *in*, none of them can be null — `frameLength` is resolved from the element or
 * the def or the instruction is rejected outright, and the other three fall back to the
 * identity warp. That half is `rubato.ts`, and it has one null in the whole type: the
 * `Rubato | null` that `resolveRubato` returns.
 *
 * ## What was dropped
 *
 * `xml`, `style`, `styleName`, `rubatoDef` and `endDate` were read-side apparatus that no
 * writer touched — `addRubato` never serializes an end date, since a rubato's span is
 * defined by the *next* instruction rather than by an attribute. `clone()` went with them:
 * it had no caller anywhere in `src/`, and with the read half now a `readonly` record there
 * is nothing left for a defensive copy to defend against.
 *
 * Port of the write half of meico.mpm.elements.maps.data.RubatoData.
 */
export class RubatoData {
  /** `xml:id` to stamp on the emitted element, or null to emit none. */
  xmlId: string | null = null;

  /** `@date`, in ticks. */
  startDate = 0.0;

  /** `@name.ref` — the `rubatoDef` to inherit from; null emits no reference. */
  rubatoDefString: string | null = null;

  /** `@frameLength`; null emits no attribute, leaving the def to supply the frame. */
  frameLength: number | null = null;
  /**
   * `@intensity`, `@lateStart`, `@earlyEnd`; null emits no attribute.
   *
   * Initialised to the identity warp rather than to null, because that is what the reader
   * will fall back to for a missing one — writing these defaults out explicitly and
   * leaving them off produce the same rendered result.
   */
  intensity: number | null = 1.0;
  lateStart: number | null = 0.0;
  earlyEnd: number | null = 1.0;

  /** `@loop`. Always written. */
  loop = false;
}
