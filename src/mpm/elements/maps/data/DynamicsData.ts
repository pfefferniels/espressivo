/**
 * A dynamics instruction on its way *into* a `dynamicsMap` — the argument
 * {@link DynamicsMap.addDynamicsFromData} serializes, and nothing else.
 *
 * ## Why this is not {@link ../data/dynamics.ts Dynamics}
 *
 * Same split as `TempoData` / `tempo.ts`, and for the same reason.
 * `Mei2MsmMpmConverter.parseDynamics` builds instructions whose `@volume` is the literal
 * string `"?"` and whose `@transition.to` is `"-"` or `"+"` — placeholders a later pass
 * rewrites once the neighbouring instruction is known — and assembles them field by field
 * across some eighty lines of branching. There is no number to put in a `volume: number`
 * there, and no point at which the object is finished. The read half resolves every name to a
 * number and every absent curve parameter to 0.0 before any arithmetic sees it; it lives in
 * `dynamics.ts`.
 *
 * The nulls here are genuine optionality on the write side: `addDynamicsFromData` branches on
 * every one of them and omits the attribute it cannot fill.
 *
 * ## Mutable on purpose, in two directions
 *
 * Besides the MEI converter's field-at-a-time assembly, `addDynamicsFromData` writes the
 * clamped `curvature`/`protraction` back into the object it was given, so that a caller
 * reusing it does not keep a value the document does not carry. That is Java's behaviour
 * (`DynamicsMap.java`) and it is pinned by a test.
 *
 * Port of the write half of meico.mpm.elements.maps.data.DynamicsData.
 */
export class DynamicsData {
  /** `xml:id` to stamp on the emitted element, or null to emit none. */
  xmlId: string | null = null;

  /** `@date`, in ticks. */
  startDate = 0.0;
  /**
   * Where the instruction stops. Not serialized by `addDynamicsFromData` — the MEI
   * converter reads it back and writes `@date.end` itself, falling through to `@tstamp2`
   * or `@endid` when it is null.
   */
  endDate: number | null = null;

  /**
   * `@volume` as it should be written: a number, a style-relative name, or one of MEI
   * export's placeholders. Preferred over {@link volume} on the way out.
   */
  volumeString: string | null = null;
  /** A numeric `@volume`, used only when {@link volumeString} is null. Both null is an error. */
  volume: number | null = null;

  /** `@transition.to` as it should be written; null emits no transition at all. */
  transitionToString: string | null = null;
  /** A numeric `@transition.to`, used only when {@link transitionToString} is null. */
  transitionTo: number | null = null;

  /** `@curvature`; null emits no attribute. Clamped in place on the way out. */
  curvature: number | null = null;
  /** `@protraction`; null emits no attribute. Clamped in place on the way out. */
  protraction: number | null = null;

  /** `@subNoteDynamics`; only `true` is ever written. */
  subNoteDynamics = false;

  clone(): DynamicsData {
    const c = new DynamicsData();
    c.xmlId = this.xmlId;
    c.startDate = this.startDate;
    c.endDate = this.endDate;
    c.volumeString = this.volumeString;
    c.volume = this.volume;
    c.transitionToString = this.transitionToString;
    c.transitionTo = this.transitionTo;
    c.curvature = this.curvature;
    c.protraction = this.protraction;
    c.subNoteDynamics = this.subNoteDynamics;
    return c;
  }
}
