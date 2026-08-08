/**
 * This class provides random numbers based on the specified distribution.
 * Port of meico.supplementary.RandomNumberProvider
 */
export class RandomNumberProvider {
  static readonly DISTRIBUTION_UNIFORM = 0;
  static readonly DISTRIBUTION_GAUSSIAN = 1;
  static readonly DISTRIBUTION_TRIANGULAR = 2;
  static readonly DISTRIBUTION_CORRELATED_BROWNIANNOISE = 3;
  static readonly DISTRIBUTION_CORRELATED_COMPENSATING_TRIANGLE = 4;
  static readonly DISTRIBUTION_LIST = 5;

  private distributionType: number;
  private series: number[] = [];

  private lowCut = 0;
  private highCut = 0;
  private standardDeviation = 0;

  private lowerLimit = 0;
  private upperLimit = 0;
  private maxStepWidth = 0;
  private mode = 0;
  private degreeOfCorrelation = 0;

  // Simple seeded random number generator (Mulberry32)
  private _seed: number;
  private _hasSpare = false;
  private _spare = 0;

  private constructor(distributionType: number) {
    this.distributionType = distributionType;
    this._seed = Math.floor(Math.random() * 2147483647) || 1; // ensure non-zero
  }

  private nextRandom(): number {
    // Mulberry32 PRNG for reproducibility with seed
    let t = (this._seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  private nextGaussianRandom(): number {
    // Box-Muller transform
    if (this._hasSpare) {
      this._hasSpare = false;
      return this._spare;
    }

    let u: number, v: number, s: number;
    do {
      u = this.nextRandom() * 2 - 1;
      v = this.nextRandom() * 2 - 1;
      s = u * u + v * v;
    } while (s >= 1 || s === 0);

    s = Math.sqrt((-2 * Math.log(s)) / s);
    this._spare = v * s;
    this._hasSpare = true;
    return u * s;
  }

  static createRandomNumberProvider_uniformDistribution(
    lowerLimit: number,
    upperLimit: number,
  ): RandomNumberProvider {
    const rand = new RandomNumberProvider(RandomNumberProvider.DISTRIBUTION_UNIFORM);
    rand.lowerLimit = lowerLimit;
    rand.upperLimit = upperLimit;
    return rand;
  }

  static createRandomNumberProvider_gaussianDistribution(
    standardDeviation: number,
    lowerLimit: number,
    upperLimit: number,
  ): RandomNumberProvider {
    const rand = new RandomNumberProvider(RandomNumberProvider.DISTRIBUTION_GAUSSIAN);
    rand.standardDeviation = standardDeviation;
    rand.lowerLimit = lowerLimit;
    rand.upperLimit = upperLimit;
    return rand;
  }

  static createRandomNumberProvider_triangularDistribution(
    lowerLimit: number,
    upperLimit: number,
    mode: number,
    lowCut: number,
    highCut: number,
  ): RandomNumberProvider {
    const rand = new RandomNumberProvider(RandomNumberProvider.DISTRIBUTION_TRIANGULAR);
    rand.lowerLimit = lowerLimit;
    rand.upperLimit = upperLimit;
    rand.mode = mode;
    rand.lowCut = lowCut;
    rand.highCut = highCut;
    return rand;
  }

  static createRandomNumberProvider_brownianNoiseDistribution(
    maxStepWidth: number,
    lowerLimit: number,
    upperLimit: number,
  ): RandomNumberProvider {
    const rand = new RandomNumberProvider(
      RandomNumberProvider.DISTRIBUTION_CORRELATED_BROWNIANNOISE,
    );
    rand.maxStepWidth = maxStepWidth;
    rand.lowerLimit = lowerLimit;
    rand.upperLimit = upperLimit;

    const scaleFactor = rand.upperLimit - rand.lowerLimit;
    const firstValue = rand.nextRandom() * scaleFactor + rand.lowerLimit;
    rand.series.push(firstValue);

    return rand;
  }

  static createRandomNumberProvider_compensatingTriangleDistribution(
    degreeOfCorrelation: number,
    lowerLimit: number,
    upperLimit: number,
    lowCut: number,
    highCut: number,
  ): RandomNumberProvider {
    const rand = new RandomNumberProvider(
      RandomNumberProvider.DISTRIBUTION_CORRELATED_COMPENSATING_TRIANGLE,
    );
    rand.degreeOfCorrelation = degreeOfCorrelation;
    rand.lowerLimit = lowerLimit;
    rand.upperLimit = upperLimit;
    rand.lowCut = lowCut;
    rand.highCut = highCut;

    const scaleFactor = rand.highCut - rand.lowCut;
    const firstValue = rand.nextRandom() * scaleFactor + rand.lowCut;
    rand.series.push(firstValue);

    return rand;
  }

  static createRandomNumberProvider_distributionList(list: number[]): RandomNumberProvider {
    const rand = new RandomNumberProvider(RandomNumberProvider.DISTRIBUTION_LIST);
    rand.series = [...list];
    return rand;
  }

  getDistributionType(): number {
    return this.distributionType;
  }

  setSeed(seed: number): void {
    this._seed = seed;
    this._hasSpare = false;
    this.series = [];
  }

  getLowCut(): number {
    return this.lowCut;
  }

  getHighCut(): number {
    return this.highCut;
  }

  getStandardDeviation(): number {
    return this.standardDeviation;
  }

  getLowerLimit(): number {
    return this.lowerLimit;
  }

  getUpperLimit(): number {
    return this.upperLimit;
  }

  getMaxStepWidth(): number {
    return this.maxStepWidth;
  }

  getMode(): number {
    return this.mode;
  }

  getDegreeOfCorrelation(): number {
    return this.degreeOfCorrelation;
  }

  setInitialValue(value: number): void {
    switch (this.distributionType) {
      case RandomNumberProvider.DISTRIBUTION_CORRELATED_BROWNIANNOISE:
        if (value > this.upperLimit) value = this.upperLimit;
        else if (value < this.lowerLimit) value = this.lowerLimit;
        break;
      case RandomNumberProvider.DISTRIBUTION_CORRELATED_COMPENSATING_TRIANGLE:
        value = this.clip(value);
        break;
      default:
        return;
    }
    this.series = [];
    this.series.push(value);
  }

  getValue(index: number): number {
    index = Math.max(0, index);
    if (index !== Math.floor(index)) return this.getValueDouble(index);
    index = Math.floor(index);

    if (this.distributionType === RandomNumberProvider.DISTRIBUTION_LIST)
      return this.series[index % this.series.length];

    while (this.series.length <= index) this.nextDouble();
    return this.series[index];
  }

  getValueDouble(index: number): number {
    const intex = Math.floor(index);
    const rest = index - intex;
    const a = this.getValue(intex);

    if (rest <= 0.0) return a;

    const b = this.getValue(intex + 1);
    return a + (b - a) * rest;
  }

  private nextDouble(): number {
    let d = 0.0;
    switch (this.distributionType) {
      case RandomNumberProvider.DISTRIBUTION_UNIFORM:
        d = this.nextRandom() * (this.upperLimit - this.lowerLimit) + this.lowerLimit;
        break;
      case RandomNumberProvider.DISTRIBUTION_GAUSSIAN: {
        let attempts = 0;
        do {
          d = this.nextGaussianRandom() * this.standardDeviation;
          if (++attempts > 10000) break; // safety limit
        } while (!this.withinLimits(d));
        break;
      }
      case RandomNumberProvider.DISTRIBUTION_TRIANGULAR:
        d = this.clip(this.triangularDistribution(this.lowerLimit, this.upperLimit, this.mode));
        break;
      case RandomNumberProvider.DISTRIBUTION_CORRELATED_BROWNIANNOISE:
        d = this.brownianNoiseDistribution();
        break;
      case RandomNumberProvider.DISTRIBUTION_CORRELATED_COMPENSATING_TRIANGLE:
        d = this.clip(this.compensatingTriangleDistribution());
        break;
    }

    this.series.push(d);
    return d;
  }

  private clip(d: number): number {
    if (d > this.highCut) return this.highCut;
    if (d < this.lowCut) return this.lowCut;
    return d;
  }

  private withinLimits(d: number): boolean {
    return d <= this.upperLimit && d >= this.lowerLimit;
  }

  private triangularDistribution(lowerLimit: number, upperLimit: number, mode: number): number {
    if (upperLimit === lowerLimit) return upperLimit;
    const scale = upperLimit - lowerLimit;
    const ca = mode - lowerLimit;
    const F = ca / scale;
    const rand = this.nextRandom();
    if (rand < F) return lowerLimit + Math.sqrt(rand * scale * ca);
    return upperLimit - Math.sqrt((1 - rand) * scale * (upperLimit - mode));
  }

  private compensatingTriangleDistribution(): number {
    const prevRandomNum = this.series[this.series.length - 1];
    const newLowerLimit =
      prevRandomNum - (prevRandomNum - this.lowerLimit) / this.degreeOfCorrelation;
    const newUpperLimit =
      prevRandomNum + (this.upperLimit - prevRandomNum) / this.degreeOfCorrelation;
    let result = this.triangularDistribution(newLowerLimit, newUpperLimit, prevRandomNum);

    if (result < this.lowerLimit) result = this.lowerLimit;
    if (result > this.upperLimit) result = this.upperLimit;

    return result;
  }

  private brownianNoiseDistribution(): number {
    let result: number;
    let attempts = 0;
    do {
      result =
        this.series[this.series.length - 1] + (this.nextRandom() - 0.5) * 2.0 * this.maxStepWidth;
      if (++attempts > 10000) {
        result = Math.max(this.lowerLimit, Math.min(this.upperLimit, result));
        break;
      }
    } while (!this.withinLimits(result));
    return result;
  }
}
