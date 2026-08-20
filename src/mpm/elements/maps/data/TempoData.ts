/**
 * A tempo instruction on its way *into* a `tempoMap` — the argument
 * {@link TempoMap.addTempo} serializes, and nothing else.
 *
 * ## Why this is not {@link ../data/tempo.ts Tempo}
 *
 * Reading a `<tempo>` and writing one are not the same job, and the Java class that does
 * both (meico.mpm.elements.maps.data.TempoData) pays for it with eleven nullable fields
 * that no single caller fills in. This half is the *unresolved* one, and unresolved is not
 * a defect here: `Mei2MsmMpmConverter.parseTempo` builds tempo instructions whose `@bpm` is
 * the literal string `"?"` and whose `@transition.to` is `"-"` or `"+"` — placeholders that
 * a later pass rewrites once the neighbouring instruction is known. There is no number to
 * put in a `bpm: number`, and demanding one would mean inventing one. The other half, the
 * one the renderer reads back out, resolved every name to a number before it ever reached
 * arithmetic, so it is a two-armed sum with no nulls at all; it lives in `tempo.ts`.
 *
 * ## Why it is still a mutable class
 *
 * `parseTempo` assembles it across some sixty lines of branching — `@mm`, then
 * `@midi.bpm`, then `@midi.mspb`, then the element's text, then `@label`, each overwriting
 * the last — and `addTempoToMpm` then rewrites `bpmString` again from the *preceding*
 * instruction's `@transition.to`. That is field-at-a-time construction, and turning it into
 * a `readonly` record means rewriting the MEI converter, which belongs to a different pass.
 * The nulls that remain are therefore genuine optionality on the write side: `addTempo`
 * branches on every one of them and omits the attribute it cannot fill.
 *
 * ## What was dropped
 *
 * `xml`, `style`, `styleName`, `exponent`, `startDateMilliseconds` and `isConstantTempo()`
 * were all read-side apparatus that no writer touched. Java's `clone()` deliberately omits
 * `startDateMilliseconds` (it is per-render scratch space, so a clone is expected to start
 * without it); with the field gone from this half entirely, so is the hazard the note
 * warned about.
 *
 * Port of the write half of meico.mpm.elements.maps.data.TempoData.
 */
export class TempoData {
  /** `xml:id` to stamp on the emitted element, or null to emit none. */
  xmlId: string | null = null;

  /** `@date`, in ticks. */
  startDate = 0.0;
  /**
   * Where the instruction stops. Not serialized by `addTempo` — the MEI converter reads it
   * back and writes `@date.end` itself, falling through to `@tstamp2` or `@endid` when it
   * is null, which is why null has to stay expressible.
   */
  endDate: number | null = null;

  /**
   * `@bpm` as it should be written: a number, a style-relative name, or one of MEI
   * export's placeholders. Preferred over {@link bpm} on the way out, so the original
   * wording round-trips.
   */
  bpmString: string | null = null;
  /** A numeric `@bpm`, used only when {@link bpmString} is null. Both null is an error. */
  bpm: number | null = null;

  /** `@transition.to` as it should be written; null emits no transition at all. */
  transitionToString: string | null = null;
  /** A numeric `@transition.to`, used only when {@link transitionToString} is null. */
  transitionTo: number | null = null;

  /** `@beatLength` as a fraction of a whole note. Always written. */
  beatLength = 0.25;

  /** `@meanTempoAt`; null emits no attribute, which the reader takes as a linear ramp. */
  meanTempoAt: number | null = null;

  clone(): TempoData {
    const c = new TempoData();
    c.xmlId = this.xmlId;
    c.startDate = this.startDate;
    c.endDate = this.endDate;
    c.bpmString = this.bpmString;
    c.bpm = this.bpm;
    c.transitionToString = this.transitionToString;
    c.transitionTo = this.transitionTo;
    c.beatLength = this.beatLength;
    c.meanTempoAt = this.meanTempoAt;
    return c;
  }
}
