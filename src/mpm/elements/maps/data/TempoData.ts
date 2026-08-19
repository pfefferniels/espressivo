import type { Element } from '../../../../xml/XomTypes.js';
import type { TempoStyle } from '../../styles/style.js';

/**
 * All data needed to compute the tempo in force over one span of the timeline —
 * the flattened form of a single MPM `<tempo>` element plus the context that only
 * the surrounding {@link TempoMap} knows (its `endDate`, the style in scope).
 *
 * `bpm` and `transitionTo` each exist twice, as a string and as a number. The
 * string is what the XML said; it may be a literal number *or* a style-relative
 * name such as `"Allegro"`, which only a {@link TempoStyle} can resolve. The
 * numeric field holds the resolved value, or `null` while it is still unknown.
 * Serialization prefers the string, so round-tripping keeps the original wording.
 *
 * This is a **plain record with exactly one producer**. It does not parse XML — the port
 * used to carry a `constructor(xml)` transcribing `<tempo>`, but nothing called it and it
 * broke the very string/number pairing described above: for a NUMERIC `@bpm` it set `bpm`
 * and left `bpmString` NULL, so `TempoMap.addTempo(data)`, which prefers the string, wrote
 * the reparsed number back and lost the original wording; for a NON-numeric one it set the
 * string and left `bpm` null forever, where `getTempoDataOf` resolves it through the style.
 * Nor did it apply any of the three transition normalisations or compute `exponent`. Build
 * these with {@link TempoMap.getTempoDataOf}.
 *
 * Port of meico.mpm.elements.maps.data.TempoData
 */
export class TempoData {
  xml: Element | null = null;
  xmlId: string | null = null;

  styleName = '';
  style: TempoStyle | null = null;

  startDate = 0.0;
  startDateMilliseconds: number | null = null;
  endDate: number | null = null;

  bpmString: string | null = null;
  bpm: number | null = null;

  transitionToString: string | null = null;
  transitionTo: number | null = null;

  beatLength = 0.25;

  meanTempoAt: number | null = null;
  exponent: number | null = null;

  /**
   * PARITY NOTE: `startDateMilliseconds` is deliberately **not** copied — the Java
   * reference omits it too (TempoData.java `clone()`). It is scratch space that
   * {@link TempoMap.renderTempoToMap} fills in per rendering pass, so a clone is
   * expected to start out without it. Adding it here would diverge from the reference.
   */
  clone(): TempoData {
    const c = new TempoData();
    c.xml = this.xml === null ? null : this.xml.copy();
    c.xmlId = this.xmlId;
    c.styleName = this.styleName;
    c.style = this.style;
    c.startDate = this.startDate;
    c.endDate = this.endDate;
    c.bpmString = this.bpmString;
    c.bpm = this.bpm;
    c.transitionToString = this.transitionToString;
    c.transitionTo = this.transitionTo;
    c.beatLength = this.beatLength;
    c.meanTempoAt = this.meanTempoAt;
    c.exponent = this.exponent;
    return c;
  }

  isConstantTempo(): boolean {
    return this.transitionTo === null || this.bpm === null || this.transitionTo === this.bpm;
  }
}
