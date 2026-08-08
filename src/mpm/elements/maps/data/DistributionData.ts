import { Attribute, Element } from '../../../../xml/XomTypes.js';
import { KeyValue } from '../../../../supplementary/KeyValue.js';

/**
 * All data needed to drive one imprecision distribution over a span of the timeline —
 * a single MPM `distribution.*` element plus the `endDate` only {@link ImprecisionMap}
 * knows.
 *
 * One class covers all six distribution kinds, discriminated at runtime by {@link type}
 * against the string constants below (which are also the elements' local names). Each
 * kind reads its own subset of the numeric fields and leaves the rest null —
 * `standardDeviation` is Gaussian-only, `mode`/`lowerClip`/`upperClip` are for the
 * triangular kinds, `maxStepWidth` and `degreeOfCorrelation` for the correlated ones,
 * and `distributionList` for the explicit list. Every field is parsed unconditionally
 * regardless of type, so a mis-typed element simply yields nulls rather than an error.
 *
 * `millisecondsTimingBasis` is the sampling grid: it converts a note's milliseconds date
 * into the index handed to the random number provider, which is what makes correlated
 * distributions reproducible along the timeline.
 *
 * Port of meico.mpm.elements.maps.data.DistributionData
 */
export class DistributionData {
  static readonly UNIFORM = 'distribution.uniform';
  static readonly GAUSSIAN = 'distribution.gaussian';
  static readonly TRIANGULAR = 'distribution.triangular';
  static readonly BROWNIAN = 'distribution.correlated.brownianNoise';
  static readonly COMPENSATING_TRIANGLE = 'distribution.correlated.compensatingTriangle';
  static readonly LIST = 'distribution.list';

  xml: Element | null = null;
  xmlId: string | null = null;
  startDate = 0.0;
  endDate: number | null = null;

  type = '';

  standardDeviation: number | null = null;
  maxStepWidth: number | null = null;
  degreeOfCorrelation: number | null = null;
  mode: number | null = null;
  lowerLimit: number | null = null;
  upperLimit: number | null = null;
  lowerClip: number | null = null;
  upperClip: number | null = null;
  seed: number | null = null;
  millisecondsTimingBasis: number | null = null;
  distributionList: number[] = [];

  constructor(xml?: Element) {
    if (xml === undefined) return;

    this.xml = xml;
    this.type = xml.getLocalName();

    const date = xml.getAttribute('date');
    if (date !== null) this.startDate = parseFloat(date.getValue());

    const id = xml.getAttribute('id', 'http://www.w3.org/XML/1998/namespace');
    if (id !== null) this.xmlId = id.getValue();

    const seedAttr = xml.getAttribute('seed');
    if (seedAttr !== null) this.seed = parseInt(seedAttr.getValue());

    const lowerLimitAttr = xml.getAttribute('limit.lower');
    if (lowerLimitAttr !== null) this.lowerLimit = parseFloat(lowerLimitAttr.getValue());

    const upperLimitAttr = xml.getAttribute('limit.upper');
    if (upperLimitAttr !== null) this.upperLimit = parseFloat(upperLimitAttr.getValue());

    const lowerClipAttr = xml.getAttribute('clip.lower');
    if (lowerClipAttr !== null) this.lowerClip = parseFloat(lowerClipAttr.getValue());

    const upperClipAttr = xml.getAttribute('clip.upper');
    if (upperClipAttr !== null) this.upperClip = parseFloat(upperClipAttr.getValue());

    const modeAttr = xml.getAttribute('mode');
    if (modeAttr !== null) this.mode = parseFloat(modeAttr.getValue());

    const standardDeviationAttr = xml.getAttribute('deviation.standard');
    if (standardDeviationAttr !== null)
      this.standardDeviation = parseFloat(standardDeviationAttr.getValue());

    const millisecondsTimingBasisAttr = xml.getAttribute('milliseconds.timingBasis');
    if (millisecondsTimingBasisAttr !== null)
      this.millisecondsTimingBasis = parseFloat(millisecondsTimingBasisAttr.getValue());

    const degreeOfCorrelationAttr = xml.getAttribute('degreeOfCorrelation');
    if (degreeOfCorrelationAttr !== null)
      this.degreeOfCorrelation = parseFloat(degreeOfCorrelationAttr.getValue());

    const maxStepWidthAttr = xml.getAttribute('stepWidth.max');
    if (maxStepWidthAttr !== null) this.maxStepWidth = parseFloat(maxStepWidthAttr.getValue());

    const measurements = xml.getChildElements('measurement');
    for (let i = 0; i < measurements.size(); i++) {
      const measurement = measurements.get(i);
      const value = measurement.getAttribute('value');
      if (value !== null) this.distributionList.push(parseFloat(value.getValue()));
    }
  }

  clone(): DistributionData {
    const c = new DistributionData();
    c.xml = this.xml === null ? null : (this.xml.copy() as Element);
    c.xmlId = this.xmlId;
    c.startDate = this.startDate;
    c.endDate = this.endDate;
    c.type = this.type;
    c.standardDeviation = this.standardDeviation;
    c.maxStepWidth = this.maxStepWidth;
    c.degreeOfCorrelation = this.degreeOfCorrelation;
    c.mode = this.mode;
    c.lowerLimit = this.lowerLimit;
    c.upperLimit = this.upperLimit;
    c.lowerClip = this.lowerClip;
    c.upperClip = this.upperClip;
    c.seed = this.seed;
    c.millisecondsTimingBasis = this.millisecondsTimingBasis;
    c.distributionList = [...this.distributionList];
    return c;
  }

  getMinAndMaxValueInDistributionList(): KeyValue<number, number> | null {
    if (this.distributionList.length === 0) return null;

    let min = this.distributionList[0];
    let max = min;

    for (const d of this.distributionList) {
      if (d < min) min = d;
      else if (d > max) max = d;
    }

    return new KeyValue(min, max);
  }
}
