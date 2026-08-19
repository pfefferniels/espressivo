import type { Element } from '../../../../xml/XomTypes.js';
import type { DynamicsStyle } from '../../styles/style.js';
import type { DynamicsDef } from '../../styles/defs/DynamicsDef.js';
import { bezierPoint, innerControlPointsXPositions, sampleSegment, tForDate } from './bezier.js';

/**
 * All data needed to compute the dynamics over one span of the timeline — a single
 * MPM `<dynamics>` element plus the context only {@link DynamicsMap} knows (`endDate`,
 * the style in scope).
 *
 * A dynamics instruction is either **constant** (`volume` alone) or a **transition**
 * from `volume` to `transitionTo`. A transition is shaped by a cubic Bézier whose two
 * inner control points are derived from `curvature` and `protraction`; `x1`/`x2` cache
 * their x-positions and are computed lazily on first use.
 *
 * Like {@link TempoData}, `volume`/`transitionTo` exist as both a string (what the XML
 * said, possibly a style-relative name such as `"forte"`) and a resolved number.
 *
 * This is a **record plus its Bézier evaluation**, with exactly one producer. It does not
 * parse XML — the port used to carry a `constructor(xml)` transcribing `<dynamics>`, but
 * nothing called it and it produced objects {@link getDynamicsAt} is not written for. Two
 * ways: it split `volume` and `volumeString` the way {@link TempoData}'s dead constructor
 * split bpm (numeric => number only, name => string only and the number NULL FOREVER),
 * where {@link DynamicsMap.getDynamicsDataOf} always sets both and resolves the name
 * through the style; and it left a constant instruction's `transitionTo`, `curvature` and
 * `protraction` null, where the live reader deliberately fills them in (`transitionTo =
 * volume`, both curve parameters 0) so that `getDynamicsAt` has one code path rather than
 * a null branch. It also skipped the clamps the live reader applies to `curvature` and
 * `protraction`. Build these with `getDynamicsDataOf`.
 *
 * Port of meico.mpm.elements.maps.data.DynamicsData
 */
export class DynamicsData {
  xml: Element | null = null;
  xmlId: string | null = null;

  styleName = '';
  style: DynamicsStyle | null = null;
  dynamicsDefString: string | null = null;
  dynamicsDef: DynamicsDef | null = null;

  startDate = 0.0;
  endDate: number | null = null;

  volumeString: string | null = null;
  volume: number | null = null;

  transitionToString: string | null = null;
  transitionTo: number | null = null;

  curvature: number | null = null;
  protraction: number | null = null;
  subNoteDynamics = false;

  private x1: number | null = null;
  private x2: number | null = null;

  clone(): DynamicsData {
    const c = new DynamicsData();
    c.xml = this.xml === null ? null : this.xml.copy();
    c.xmlId = this.xmlId;
    c.styleName = this.styleName;
    c.style = this.style;
    c.dynamicsDefString = this.dynamicsDefString;
    c.dynamicsDef = this.dynamicsDef;
    c.startDate = this.startDate;
    c.endDate = this.endDate;
    c.transitionToString = this.transitionToString;
    c.transitionTo = this.transitionTo;
    c.volumeString = this.volumeString;
    c.volume = this.volume;
    c.curvature = this.curvature;
    c.protraction = this.protraction;
    c.subNoteDynamics = this.subNoteDynamics;
    c.x1 = this.x1;
    c.x2 = this.x2;
    return c;
  }

  isConstantDynamics(): boolean {
    return this.transitionTo === null || this.volume === null || this.transitionTo === this.volume;
  }

  /**
   * Cache the x-positions of the Bézier's two inner control points in `x1`/`x2`.
   *
   * Not a pure read: it also **defaults `curvature`/`protraction` to 0.0 in place** if
   * they were still null, so calling it changes what a later `clone()` copies. That
   * in-place write is why the defaulting stays here rather than moving into
   * {@link innerControlPointsXPositions} with the arithmetic.
   */
  private computeInnerControlPointsXPositions(): void {
    if (this.curvature === null) this.curvature = 0.0;
    if (this.protraction === null) this.protraction = 0.0;

    [this.x1, this.x2] = innerControlPointsXPositions(this.curvature, this.protraction);
  }

  /**
   * Invert the Bézier's x-component: find the curve parameter `t` whose x lands on
   * `date`. The endpoints are answered here rather than in {@link tForDate} because they
   * must be answered *before* the control points are computed at all.
   */
  private getTForDate(date: number): number {
    if (date === this.startDate) return 0.0;
    if (date === this.endDate) return 1.0;
    if (this.x1 === null) this.computeInnerControlPointsXPositions();

    return tForDate(this.x1!, this.x2!, this.startDate, this.endDate!, date);
  }

  getDynamicsAt(date: number): number {
    if (date < this.startDate || this.isConstantDynamics()) return this.volume!;
    if (date >= this.endDate!) return this.transitionTo!;

    const t = this.getTForDate(date);
    return (3.0 - 2.0 * t) * t * t * (this.transitionTo! - this.volume!) + this.volume!;
  }

  private getDateDynamics(t: number): number[] {
    return bezierPoint(
      this.x1!,
      this.x2!,
      this.startDate,
      this.endDate!,
      this.volume!,
      this.transitionTo!,
      t,
    );
  }

  /**
   * Sample the transition densely enough that no two consecutive samples differ in
   * volume by more than `maxStepSize`, and return the samples as `[date, volume]` pairs.
   *
   * Unlike {@link MovementData.getMovementSegment} this adds no exact endpoints and
   * applies no scaling — the raw {@link sampleSegment} series is the answer.
   */
  getSubNoteDynamicsSegment(maxStepSize: number): number[][] {
    if (this.x1 === null) this.computeInnerControlPointsXPositions();

    return sampleSegment(maxStepSize, (t) => this.getDateDynamics(t));
  }
}
