import { OutOfRangeError } from '../xml/errors.js';
import { elementAt } from '../prelude/seq.js';

/**
 * Random numbers drawn from one of the distributions MPM's imprecision maps use.
 * Port of `meico.supplementary.RandomNumberProvider`.
 *
 * **The numerics here are load-bearing, not incidental.** `getValue(i)` memoises into
 * `series`, so every consumer reading an imprecision map sees one fixed sequence per
 * provider, and `setSeed()` makes that sequence reproducible. Changing an expression, the
 * order of operations, or how many times `nextRandom()` is called per value changes the
 * numbers a performance renders. That goes double for the two correlated distributions,
 * where each value is derived from its predecessor and a single extra draw shifts
 * everything after it. Treat this file as numerics rather than as style.
 */
export class RandomNumberProvider {
  /**
   * The largest index {@link getValue} will serve.
   *
   * An index is an allocation, not just a lookup: the series memoises one double per index up
   * to the one asked for. Measured without the guard: 10^7 costs 178 ms and 236 MB, 10^8 costs
   * 1.7 s and 1.5 GB, and 10^9 spends 1.9 s allocating before V8 refuses to grow the array and
   * throws a bare `RangeError: Invalid array length`. Ten million is therefore the last index
   * that is merely expensive, and it is already far beyond any real document — at the default
   * 100 ms timing basis it stands for 10^9 ms, about eleven days of music, where a real
   * document reaches an index in the hundreds.
   */
  static readonly MAX_INDEX = 10_000_000;

  static readonly DISTRIBUTION_UNIFORM = 0;
  static readonly DISTRIBUTION_GAUSSIAN = 1;
  static readonly DISTRIBUTION_TRIANGULAR = 2;
  static readonly DISTRIBUTION_CORRELATED_BROWNIANNOISE = 3;
  static readonly DISTRIBUTION_CORRELATED_COMPENSATING_TRIANGLE = 4;
  static readonly DISTRIBUTION_LIST = 5;

  private readonly distributionType: DistributionType;

  /** Values already drawn, in order; `getValue(i)` extends it on demand and reads it back. */
  private series: number[] = [];

  private lowCut = 0;
  private highCut = 0;
  private standardDeviation = 0;

  private lowerLimit = 0;
  private upperLimit = 0;
  private maxStepWidth = 0;
  private mode = 0;
  private degreeOfCorrelation = 0;

  /** Mulberry32 state. Seeded at random unless `setSeed()` pins it. Never 0. */
  private seed = Math.floor(Math.random() * 2147483647) || 1;
  private hasSpare = false;
  private spare = 0;

  private constructor(distributionType: DistributionType) {
    this.distributionType = distributionType;
  }

  private nextRandom(): number {
    // Mulberry32 PRNG for reproducibility with seed
    let t = (this.seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  private nextGaussianRandom(): number {
    // Polar form of the Box-Muller transform: it yields two normal deviates per pass, so
    // the second is kept as the spare and returned by the next call.
    if (this.hasSpare) {
      this.hasSpare = false;
      return this.spare;
    }

    let u: number;
    let v: number;
    let s: number;
    do {
      u = this.nextRandom() * 2 - 1;
      v = this.nextRandom() * 2 - 1;
      s = u * u + v * v;
    } while (s >= 1 || s === 0);

    s = Math.sqrt((-2 * Math.log(s)) / s);
    this.spare = v * s;
    this.hasSpare = true;
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

  static createRandomNumberProvider_distributionList(
    list: readonly number[],
  ): RandomNumberProvider {
    const rand = new RandomNumberProvider(RandomNumberProvider.DISTRIBUTION_LIST);
    rand.series = [...list];
    return rand;
  }

  getDistributionType(): DistributionType {
    return this.distributionType;
  }

  /** Pins the sequence, discarding everything drawn so far — including a correlated
   * distribution's factory-supplied starting value, which must then be restored with
   * {@link setInitialValue}. */
  setSeed(seed: number): void {
    this.seed = seed;
    this.hasSpare = false;
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

  /** Restarts a correlated distribution's series from `value`. No-op for the others. */
  setInitialValue(value: number): void {
    let initialValue: number;
    switch (this.distributionType) {
      case RandomNumberProvider.DISTRIBUTION_CORRELATED_BROWNIANNOISE:
        if (value > this.upperLimit) initialValue = this.upperLimit;
        else if (value < this.lowerLimit) initialValue = this.lowerLimit;
        else initialValue = value;
        break;
      case RandomNumberProvider.DISTRIBUTION_CORRELATED_COMPENSATING_TRIANGLE:
        initialValue = this.clip(value);
        break;
      // The uncorrelated distributions have no series to restart, which is what the
      // docstring's "No-op for the others" means. Enumerated so that "the others" is a
      // closed list the compiler checks rather than a phrase.
      case RandomNumberProvider.DISTRIBUTION_UNIFORM:
      case RandomNumberProvider.DISTRIBUTION_GAUSSIAN:
      case RandomNumberProvider.DISTRIBUTION_TRIANGULAR:
      case RandomNumberProvider.DISTRIBUTION_LIST:
        return;
    }
    this.series = [initialValue];
  }

  /**
   * Reject an index no series can have, before it is used for anything.
   *
   * A **pure precondition**: it draws nothing, memoises nothing and touches no field, so the
   * sequence a valid caller sees is bit-for-bit what it was without the guard. That property
   * is the point — see this class's opening note on the numerics being load-bearing.
   *
   * @throws {OutOfRangeError} for `NaN`, `±Infinity` or an index above {@link MAX_INDEX}
   */
  private static requireUsableIndex(index: number, method: string): void {
    if (Number.isFinite(index) && index <= RandomNumberProvider.MAX_INDEX) return;
    throw new OutOfRangeError(
      `RandomNumberProvider.${method}: ${String(index)} is not a usable index (expected a finite value of at most ${String(RandomNumberProvider.MAX_INDEX)}).`,
    );
  }

  /**
   * The value at `index`, drawing and memoising as far as needed to reach it. A fractional
   * index is interpolated by {@link getValueDouble}; a negative one is clamped to 0.
   *
   * @throws {OutOfRangeError} for a non-finite or absurdly large index. The unguarded
   *   behaviour differs by class, all measured on Node 23.8: `NaN` recursed with
   *   {@link getValueDouble} until the stack overflowed; `Infinity` and huge finite indices
   *   allocated for seconds and then died with a bare `RangeError: Invalid array length`
   *   naming neither method nor index; and `-Infinity` was **not** pathological at all — it
   *   clamped to 0 and quietly returned `series[0]`, while `getValueDouble(-Infinity)`
   *   returned `NaN`. That last class is rejected anyway, and deliberately: an index that
   *   silently means "the first value" is a wrong answer dressed as a right one, which is
   *   worse than an error. See PARITY.md, "Fixed bugs", P4.
   */
  getValue(index: number): number {
    RandomNumberProvider.requireUsableIndex(index, 'getValue');

    const clampedIndex = Math.max(0, index);
    if (clampedIndex !== Math.floor(clampedIndex)) return this.getValueDouble(clampedIndex);
    const wholeIndex = Math.floor(clampedIndex);

    if (this.distributionType === RandomNumberProvider.DISTRIBUTION_LIST)
      // An EMPTY list makes this `index % 0`, i.e. NaN, and the read is out of range. The
      // `?? NaN` is behaviour-preserving, NOT a repair: the incumbent returned `undefined`
      // wearing the type `number`, and NaN is what every caller's arithmetic and every
      // comparison already made of it.
      //
      // It is deliberately not a throw, though Java's `index % series.size()` on an `int`
      // throws ArithmeticException here. The NaN is a DOCUMENTED bottom route that the
      // comparison module models and pins — `imprecisionLaws.test.ts` asserts that an empty
      // `<distribution.list>` makes every note's date NaN, and `isBottomAt` reports it as
      // bottom. Refusing instead would delete a modelled degeneracy, not fix a defect.
      return this.series[wholeIndex % this.series.length] ?? Number.NaN;

    // In range by construction — the loop fills the series up to `wholeIndex` — but the
    // construction is a loop condition, which a type cannot follow.
    while (this.series.length <= wholeIndex) this.nextDouble();
    return elementAt(this.series, wholeIndex, 'random series draw');
  }

  /**
   * Linear interpolation between the values either side of a fractional index.
   *
   * @throws {OutOfRangeError} as {@link getValue}. A fractional index at exactly
   *   {@link MAX_INDEX} also throws, from the lookup of its interpolation partner one place
   *   further on — the boundary is the last index that can be *drawn*.
   */
  getValueDouble(index: number): number {
    RandomNumberProvider.requireUsableIndex(index, 'getValueDouble');

    const wholeIndex = Math.floor(index);
    const rest = index - wholeIndex;
    const a = this.getValue(wholeIndex);

    if (rest <= 0.0) return a;

    const b = this.getValue(wholeIndex + 1);
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
      case RandomNumberProvider.DISTRIBUTION_LIST:
        // Unreachable, and now provably so rather than by argument: a list distribution
        // draws from `series` directly in `getValue`, which returns before it can reach the
        // loop that calls this method, and `getValue` is the only caller. Naming the case
        // leaves `d` at 0.0 exactly as falling out of the switch did, and lets
        // `switch-exhaustiveness-check` vouch for the other five.
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
    // NOT non-empty by construction, though the factories do push a first value: `setSeed`
    // clears `series` — its own doc says so — so any document that puts a `@seed` on a
    // correlated distribution reaches this with an empty series. NaN then propagates through
    // the whole performance, which `imprecisionLaws.test.ts` pins as a bottom route.
    const prevRandomNum = this.series[this.series.length - 1] ?? Number.NaN;
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
        (this.series[this.series.length - 1] ?? Number.NaN) +
        (this.nextRandom() - 0.5) * 2.0 * this.maxStepWidth;
      if (++attempts > 10000) {
        result = Math.max(this.lowerLimit, Math.min(this.upperLimit, result));
        break;
      }
    } while (!this.withinLimits(result));
    return result;
  }
}

/**
 * The `RandomNumberProvider.DISTRIBUTION_*` constants as a type, so a provider cannot be
 * built for a number that names no distribution.
 */
export type DistributionType =
  | typeof RandomNumberProvider.DISTRIBUTION_UNIFORM
  | typeof RandomNumberProvider.DISTRIBUTION_GAUSSIAN
  | typeof RandomNumberProvider.DISTRIBUTION_TRIANGULAR
  | typeof RandomNumberProvider.DISTRIBUTION_CORRELATED_BROWNIANNOISE
  | typeof RandomNumberProvider.DISTRIBUTION_CORRELATED_COMPENSATING_TRIANGLE
  | typeof RandomNumberProvider.DISTRIBUTION_LIST;
