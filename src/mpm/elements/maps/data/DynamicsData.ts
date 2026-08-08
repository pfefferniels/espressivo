import { Attribute, Element } from '../../../../xml/XomTypes.js';
import type { DynamicsStyle } from '../../styles/DynamicsStyle.js';
import type { DynamicsDef } from '../../styles/defs/DynamicsDef.js';

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

  constructor(xml?: Element) {
    if (xml === undefined) return;

    this.xml = xml;
    this.startDate = parseFloat(xml.getAttributeValue('date')!);

    const volumeAtt = xml.getAttribute('volume');
    if (volumeAtt !== null) {
      const val = parseFloat(volumeAtt.getValue());
      if (!isNaN(val)) {
        this.volume = val;
      } else {
        this.volumeString = volumeAtt.getValue();
      }
    }

    const transitionToAtt = xml.getAttribute('transition.to');
    if (transitionToAtt !== null) {
      const val = parseFloat(transitionToAtt.getValue());
      if (!isNaN(val)) {
        this.transitionTo = val;
      } else {
        this.transitionToString = transitionToAtt.getValue();
      }
    }

    const curvatureAtt = xml.getAttribute('curvature');
    if (curvatureAtt !== null) this.curvature = parseFloat(curvatureAtt.getValue());

    const protractionAtt = xml.getAttribute('protraction');
    if (protractionAtt !== null) this.protraction = parseFloat(protractionAtt.getValue());

    const subNoteDynamicsAtt = xml.getAttribute('subNoteDynamics');
    if (subNoteDynamicsAtt !== null)
      this.subNoteDynamics = subNoteDynamicsAtt.getValue() === 'true';

    const id = xml.getAttribute('id', 'http://www.w3.org/XML/1998/namespace');
    if (id !== null) this.xmlId = id.getValue();
  }

  clone(): DynamicsData {
    const c = new DynamicsData();
    c.xml = this.xml === null ? null : (this.xml.copy() as Element);
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
   * Derive the x-positions of the Bézier's two inner control points from `curvature`
   * and `protraction`, caching them in `x1`/`x2`.
   *
   * Not a pure read: it also **defaults `curvature`/`protraction` to 0.0 in place** if
   * they were still null, so calling it changes what a later `clone()` copies. The
   * `protraction === 0.0` early return is not just an optimisation — the general
   * formula divides by `protraction`.
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
   * Invert the Bézier's x-component: find the curve parameter `t` whose x lands on
   * `date`. There is no closed form, so this is a binary search that halves its step
   * (`tt`) each round and stops once x is within 1 tick of the target.
   *
   * RENDERING MATH — every operation and its order is load-bearing. The nested form
   * `((u * t + v) * t + w) * t * s` is Horner's scheme and must not be expanded; in
   * floating point it does not equal the expanded polynomial. The loop's exit
   * condition depends bit-for-bit on those results, so a "simplification" here can
   * change the iteration count and shift every rendered dynamics value.
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

  getDynamicsAt(date: number): number {
    if (date < this.startDate || this.isConstantDynamics()) return this.volume!;
    if (date >= this.endDate!) return this.transitionTo!;

    const t = this.getTForDate(date);
    return (3.0 - 2.0 * t) * t * t * (this.transitionTo! - this.volume!) + this.volume!;
  }

  private getDateDynamics(t: number): number[] {
    const result = [0.0, 0.0];
    const x1_3 = 3.0 * this.x1!;
    const x2_3 = 3.0 * this.x2!;
    const u = x1_3 - x2_3 + 1.0;
    const v = -6.0 * this.x1! + x2_3;
    result[0] = ((u * t + v) * t + x1_3) * t * (this.endDate! - this.startDate) + this.startDate;
    result[1] = (3.0 - 2.0 * t) * t * t * (this.transitionTo! - this.volume!) + this.volume!;
    return result;
  }

  /**
   * Sample the transition densely enough that no two consecutive samples differ in
   * volume by more than `maxStepSize`, and return the samples as `[date, volume]` pairs.
   *
   * The subdivision is adaptive: the `while` inserts a midpoint between `i` and `i+1`
   * and re-tests the *same* pair, so a single gap is halved repeatedly until it is
   * small enough. Both `ts` and `series` are spliced in lockstep, and the outer loop's
   * `ts.length - 1` bound is re-read every iteration — it must stay a plain indexed
   * `for`, because the collection grows underneath it.
   */
  getSubNoteDynamicsSegment(maxStepSize: number): number[][] {
    if (this.x1 === null) this.computeInnerControlPointsXPositions();

    const ts: number[] = [0.0, 1.0];
    const series: number[][] = [];
    series.push(this.getDateDynamics(0.0));
    series.push(this.getDateDynamics(1.0));

    for (let i = 0; i < ts.length - 1; ++i) {
      while (Math.abs(series[i + 1][1] - series[i][1]) > maxStepSize) {
        const t = (ts[i] + ts[i + 1]) * 0.5;
        ts.splice(i + 1, 0, t);
        series.splice(i + 1, 0, this.getDateDynamics(t));
      }
    }

    return series;
  }
}
