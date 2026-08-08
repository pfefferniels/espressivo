import { Attribute, Element } from '../../../../xml/XomTypes.js';

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
  position: number | null = 0.0;
  transitionTo: number | null = null;
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
      this.position = parseFloat(positionAttr.getValue());
    }

    const transitionToAtt = xml.getAttribute('transition.to');
    if (transitionToAtt !== null) {
      this.transitionTo = parseFloat(transitionToAtt.getValue());
    }

    const curvatureAtt = xml.getAttribute('curvature');
    if (curvatureAtt !== null) this.curvature = parseFloat(curvatureAtt.getValue());

    const protractionAtt = xml.getAttribute('protraction');
    if (protractionAtt !== null) this.protraction = parseFloat(protractionAtt.getValue());

    const id = xml.getAttribute('id', 'http://www.w3.org/XML/1998/namespace');
    if (id !== null) this.xmlId = id.getValue();

    // PARITY NOTE — this is a bug, and it is a bug in the Java reference, so it stays.
    // MovementData.java:64-66 reads the `controller` attribute and assigns it to
    // `this.xmlId`, not to `this.controller`; it also looks the attribute up in the
    // xml: namespace, where `controller` never lives. Both mistakes are reproduced
    // verbatim. The visible consequences: `controller` keeps its "sustain" default no
    // matter what the XML says, and (because the lookup never matches) `xmlId` is not
    // actually clobbered either. Populating `controller` correctly would change which
    // MIDI controller every rendered movement targets. See CHARTER.md, "Known parity
    // subtleties" — behaviour parity beats correctness.
    const controllerAttr = xml.getAttribute('controller', 'http://www.w3.org/XML/1998/namespace');
    if (controllerAttr !== null) this.xmlId = controllerAttr.getValue();
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
   * Byte-for-byte the same computation as
   * {@link DynamicsData.computeInnerControlPointsXPositions}, including the in-place
   * defaulting of null `curvature`/`protraction` to 0.0. Kept duplicated rather than
   * shared because the two classes are independent ports; unifying them is a
   * model-layer decision (T16), not a local idiom.
   */
  private computeInnerControlPointsXPositions(): void {
    if (this.curvature === null) this.curvature = 0.0;
    if (this.protraction === null) this.protraction = 0.0;

    if (this.protraction === 0.0) {
      this.x1 = this.curvature;
      this.x2 = 1.0 - this.curvature;
      return;
    }

    this.x1 =
      this.curvature +
      ((Math.abs(this.protraction) + this.protraction) / (2.0 * this.protraction) -
        (Math.abs(this.protraction) / this.protraction) * this.curvature) *
        this.protraction;
    this.x2 =
      1.0 -
      this.curvature +
      ((this.protraction - Math.abs(this.protraction)) / (2.0 * this.protraction) +
        (Math.abs(this.protraction) / this.protraction) * this.curvature) *
        this.protraction;
  }

  /**
   * Invert the Bézier's x-component to find the curve parameter `t` for `date`.
   * Identical in form and in floating-point behaviour to
   * {@link DynamicsData.getTForDate} — see the note there. RENDERING MATH: Horner's
   * scheme, evaluation order load-bearing, do not expand or reassociate.
   */
  private getTForDate(date: number): number {
    if (date === this.startDate) return 0.0;
    if (date === this.endDate) return 1.0;
    if (this.x1 === null) this.computeInnerControlPointsXPositions();

    const s = this.endDate! - this.startDate;
    date = date - this.startDate;
    const u = 3.0 * this.x1! - 3.0 * this.x2! + 1.0;
    const v = -6.0 * this.x1! + 3.0 * this.x2!;
    const w = 3.0 * this.x1!;

    let t = 0.5;
    let diffX = ((u * t + v) * t + w) * t * s - date;
    for (let tt = 0.25; Math.abs(diffX) >= 1.0; tt *= 0.5) {
      if (diffX > 0.0) t -= tt;
      else t += tt;
      diffX = ((u * t + v) * t + w) * t * s - date;
    }
    return t;
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

  private getDatePosition(t: number): number[] {
    if (this.transitionTo === null) return [this.startDate, this.position!];

    const result = [0.0, 0.0];
    const x1_3 = 3.0 * this.x1!;
    const x2_3 = 3.0 * this.x2!;
    const u = x1_3 - x2_3 + 1.0;
    const v = -6.0 * this.x1! + x2_3;
    const frameStart = this.startDate;
    const frameLength = this.endDate! - this.startDate;

    result[0] = ((u * t + v) * t + x1_3) * t * frameLength + frameStart;
    result[1] = (3.0 - 2.0 * t) * t * t * (this.transitionTo - this.position!) + this.position!;

    return result;
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
   */
  getMovementSegment(maxStepSize: number): number[][] {
    if (this.x1 === null) this.computeInnerControlPointsXPositions();

    const ts: number[] = [0.0, 1.0];
    const series: number[][] = [];
    series.push(this.getDatePosition(0.0));
    series.push(this.getDatePosition(1.0));

    for (let i = 0; i < ts.length - 1; ++i) {
      while (Math.abs(series[i + 1][1] - series[i][1]) > maxStepSize) {
        const t = (ts[i] + ts[i + 1]) * 0.5;
        ts.splice(i + 1, 0, t);
        series.splice(i + 1, 0, this.getDatePosition(t));
      }
    }

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
