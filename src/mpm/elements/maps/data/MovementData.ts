import { Attribute, Element } from '../../../../xml/XomTypes.js';
import type { Normalized } from '../../../../units.js';
import { bezierPoint, innerControlPointsXPositions, sampleSegment, tForDate } from './bezier.js';

/**
 * All data needed to compute a continuous controller movement (pedal, and anything
 * else addressed by `controller`) over one span of the timeline — a single MPM
 * `<movement>` element plus the `endDate` only {@link MovementMap} knows.
 *
 * Shares its Bézier machinery with {@link DynamicsData}: `position` → `transitionTo`
 * shaped by `curvature`/`protraction`, with `x1`/`x2` computed lazily. The difference
 * is the output range — {@link getMovementSegment} scales to MIDI's 0-127 at the end.
 *
 * Port of meico.mpm.elements.maps.data.MovementData
 */
export class MovementData {
  xml: Element | null = null;
  xmlId: string | null = null;

  startDate = 0.0;
  /** Normalized 0..1; {@link getMovementSegment} scales it to 0..127 on the way out. */
  position: Normalized | null = 0.0 as Normalized;
  /** Normalized 0..1, like {@link position}. */
  transitionTo: Normalized | null = null;
  endDate: number | null = null;
  controller = 'sustain';

  curvature: number | null = 0.4;
  protraction: number | null = 0.0;

  private x1: number | null = null;
  private x2: number | null = null;

  constructor(xml?: Element) {
    if (xml === undefined) return;

    this.xml = xml;
    this.startDate = parseFloat(xml.getAttributeValue('date')!);

    const positionAttr = xml.getAttribute('position');
    if (positionAttr !== null) {
      this.position = parseFloat(positionAttr.getValue()) as Normalized;
    }

    const transitionToAtt = xml.getAttribute('transition.to');
    if (transitionToAtt !== null) {
      this.transitionTo = parseFloat(transitionToAtt.getValue()) as Normalized;
    }

    const curvatureAtt = xml.getAttribute('curvature');
    if (curvatureAtt !== null) this.curvature = parseFloat(curvatureAtt.getValue());

    const protractionAtt = xml.getAttribute('protraction');
    if (protractionAtt !== null) this.protraction = parseFloat(protractionAtt.getValue());

    const id = xml.getAttribute('id', 'http://www.w3.org/XML/1998/namespace');
    if (id !== null) this.xmlId = id.getValue();

    // `controller` is a plain attribute in no namespace. Until 2026-08-08 the reference
    // — and therefore this port — looked it up in the xml: namespace, where it never
    // lives, and assigned the result to `xmlId`; `controller` was consequently stuck on
    // its "sustain" default no matter what the XML said. Fixed in MovementData.java:64-66
    // and mirrored here (item T20b); the ground truth was regenerated from the fixed
    // reference, so this is now the parity behaviour, not a divergence from it.
    const controllerAttr = xml.getAttribute('controller');
    if (controllerAttr !== null) this.controller = controllerAttr.getValue();
  }

  clone(): MovementData {
    const c = new MovementData();
    c.xml = this.xml === null ? null : (this.xml.copy() as Element);
    c.xmlId = this.xmlId;
    c.startDate = this.startDate;
    c.position = this.position;
    c.transitionTo = this.transitionTo;
    c.curvature = this.curvature;
    c.protraction = this.protraction;
    c.controller = this.controller;
    c.x1 = this.x1;
    c.x2 = this.x2;
    return c;
  }

  isConstantMovement(): boolean {
    return this.transitionTo === null;
  }

  /**
   * Cache the x-positions of the Bézier's two inner control points in `x1`/`x2`, and
   * default null `curvature`/`protraction` to 0.0 in place on the way — see the note on
   * {@link DynamicsData.computeInnerControlPointsXPositions}, which this mirrors exactly.
   */
  private computeInnerControlPointsXPositions(): void {
    if (this.curvature === null) this.curvature = 0.0;
    if (this.protraction === null) this.protraction = 0.0;

    [this.x1, this.x2] = innerControlPointsXPositions(this.curvature, this.protraction);
  }

  /** Invert the Bézier's x-component to find the curve parameter `t` for `date`. */
  private getTForDate(date: number): number {
    if (date === this.startDate) return 0.0;
    if (date === this.endDate) return 1.0;
    if (this.x1 === null) this.computeInnerControlPointsXPositions();

    return tForDate(this.x1!, this.x2!, this.startDate, this.endDate!, date);
  }

  getPositionAt(date: number): number {
    if (date <= this.startDate || this.position === null) {
      return this.position!;
    }
    if (date >= this.endDate!) {
      return this.transitionTo!;
    }

    const t = this.getTForDate(date);
    return (3.0 - 2.0 * t) * t * t * (this.transitionTo! - this.position!) + this.position!;
  }

  /** A constant movement has no curve to evaluate: every `t` yields the start point. */
  private getDatePosition(t: number): number[] {
    if (this.transitionTo === null) return [this.startDate, this.position!];

    return bezierPoint(
      this.x1!,
      this.x2!,
      this.startDate,
      this.endDate!,
      this.position!,
      this.transitionTo,
      t,
    );
  }

  /**
   * Sample the movement as `[date, value]` pairs, subdividing adaptively until no two
   * consecutive samples differ by more than `maxStepSize` (same lockstep splice as
   * {@link DynamicsData.getSubNoteDynamicsSegment}).
   *
   * Two things happen only here. The start point is **unshifted onto the front and the
   * end point pushed onto the back after** the subdivision, so the series deliberately
   * begins and ends with an exact, unsampled endpoint — and the first pair is therefore
   * duplicated whenever the sampled t=0 point coincides with it. Then every value is
   * scaled by 127 into the MIDI controller range, mutating the tuples in place.
   *
   * @param maxStepSize in the **normalized 0..1** position domain — the domain the
   *   subdivision compares against, not the 0..127 one the result is scaled into.
   *   Feeding it a 0..127 threshold is the 16129 bug of ARCHITECTURE.md §7.
   * @returns `[date, value]` pairs where `value` is already `Midi7Bit` (0..127) and
   *   `date` is symbolic ticks. Deliberately left `number[][]` rather than branded
   *   tuples (RULE U4a): this is the method's own working array, spliced and mutated in
   *   place, and a `readonly` tuple type would forbid exactly that.
   */
  getMovementSegment(maxStepSize: Normalized): number[][] {
    if (this.x1 === null) this.computeInnerControlPointsXPositions();

    const series = sampleSegment(maxStepSize, (t) => this.getDatePosition(t));

    const beginning: number[] = [this.startDate, this.position!];
    series.unshift(beginning);

    if (this.transitionTo !== null) {
      const end: number[] = [this.endDate!, this.transitionTo];
      series.push(end);
    }

    for (const tuple of series) {
      tuple[1] *= 127;
    }

    return series;
  }
}
