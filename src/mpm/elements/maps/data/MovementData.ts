import type { Normalized } from '../../../../units.js';

/**
 * A movement instruction on its way *into* a `movementMap` — the argument
 * {@link MovementMap.addMovement} serializes, and nothing else.
 *
 * ## Why this is not {@link ../data/movement.ts Movement}
 *
 * Same split as its three siblings in this directory, though for a slightly different
 * reason: no MEI element maps to a `<movement>`, so nothing in `src/` builds one of these.
 * What keeps it is the `addMovement(data)` overload, whose nulls are exactly the "omit the
 * attribute" decisions a serializer has to be able to express — a `<movement>` may carry a
 * `@position` and no `@transition.to`, or neither, and the element that comes out has to
 * differ accordingly. The read half cannot express that and should not: there,
 * `@transition.to`'s absence is not a missing field but a *choice of arm*, which is what
 * `movement.ts` says.
 *
 * There is no end date to carry: `addMovement` never serializes one, because a movement's
 * span is defined by the *next* instruction rather than by an attribute.
 *
 * Port of the write half of meico.mpm.elements.maps.data.MovementData.
 */
export class MovementData {
  /** `xml:id` to stamp on the emitted element, or null to emit none. */
  xmlId: string | null = null;

  /** `@date`, in ticks. */
  startDate = 0.0;

  /** `@position`, normalized 0..1; null emits no attribute. */
  position: Normalized | null = 0.0 as Normalized;
  /** `@transition.to`, normalized 0..1; null emits no attribute, i.e. a constant movement. */
  transitionTo: Normalized | null = null;

  /** `@curvature`; null emits no attribute. 0.4 is the reader's default for an absent one. */
  curvature: number | null = 0.4;
  /** `@protraction`; null emits no attribute. */
  protraction: number | null = 0.0;

  /**
   * `@controller`. Always written, and non-nullable here where Java guards on
   * `data.controller != null` — see the note at `MovementMap.addMovement`, where the
   * attribute order this participates in is byte-visible.
   */
  controller = 'sustain';
}
