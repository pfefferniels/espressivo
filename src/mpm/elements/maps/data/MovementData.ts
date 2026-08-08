import { Attribute, Element } from '../../../../xml/XomTypes.js';

/**
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

  constructor();
  constructor(xml: Element);
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
