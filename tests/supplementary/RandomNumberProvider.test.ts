import { describe, it, expect } from 'vitest';
import { RandomNumberProvider } from '../../src/supplementary/RandomNumberProvider.js';

// Helper: generate a batch of values and return them
function generateValues(provider: RandomNumberProvider, count: number): number[] {
    const values: number[] = [];
    for (let i = 0; i < count; i++) {
        values.push(provider.getValue(i));
    }
    return values;
}

// ---------------------------------------------------------------------------
// Distribution type constants
// ---------------------------------------------------------------------------
describe('RandomNumberProvider – constants', () => {
    it('should have the expected distribution type constants', () => {
        expect(RandomNumberProvider.DISTRIBUTION_UNIFORM).toBe(0);
        expect(RandomNumberProvider.DISTRIBUTION_GAUSSIAN).toBe(1);
        expect(RandomNumberProvider.DISTRIBUTION_TRIANGULAR).toBe(2);
        expect(RandomNumberProvider.DISTRIBUTION_CORRELATED_BROWNIANNOISE).toBe(3);
        expect(RandomNumberProvider.DISTRIBUTION_CORRELATED_COMPENSATING_TRIANGLE).toBe(4);
        expect(RandomNumberProvider.DISTRIBUTION_LIST).toBe(5);
    });
});

// ---------------------------------------------------------------------------
// Uniform distribution
// ---------------------------------------------------------------------------
describe('RandomNumberProvider – uniform distribution', () => {
    it('should create with correct distribution type', () => {
        const rng = RandomNumberProvider.createRandomNumberProvider_uniformDistribution(-1, 1);
        expect(rng.getDistributionType()).toBe(RandomNumberProvider.DISTRIBUTION_UNIFORM);
    });

    it('should store lower and upper limits', () => {
        const rng = RandomNumberProvider.createRandomNumberProvider_uniformDistribution(-5, 5);
        expect(rng.getLowerLimit()).toBe(-5);
        expect(rng.getUpperLimit()).toBe(5);
    });

    it('should generate values within limits', () => {
        const rng = RandomNumberProvider.createRandomNumberProvider_uniformDistribution(0, 10);
        const values = generateValues(rng, 100);
        for (const v of values) {
            expect(v).toBeGreaterThanOrEqual(0);
            expect(v).toBeLessThanOrEqual(10);
        }
    });

    it('should produce repeatable results after setSeed', () => {
        const rng1 = RandomNumberProvider.createRandomNumberProvider_uniformDistribution(0, 100);
        rng1.setSeed(42);
        const values1 = generateValues(rng1, 20);

        const rng2 = RandomNumberProvider.createRandomNumberProvider_uniformDistribution(0, 100);
        rng2.setSeed(42);
        const values2 = generateValues(rng2, 20);

        expect(values1).toEqual(values2);
    });
});

// ---------------------------------------------------------------------------
// Gaussian distribution
// ---------------------------------------------------------------------------
describe('RandomNumberProvider – Gaussian distribution', () => {
    it('should create with correct distribution type', () => {
        const rng = RandomNumberProvider.createRandomNumberProvider_gaussianDistribution(1.0, -3, 3);
        expect(rng.getDistributionType()).toBe(RandomNumberProvider.DISTRIBUTION_GAUSSIAN);
    });

    it('should store standard deviation and limits', () => {
        const rng = RandomNumberProvider.createRandomNumberProvider_gaussianDistribution(2.5, -10, 10);
        expect(rng.getStandardDeviation()).toBe(2.5);
        expect(rng.getLowerLimit()).toBe(-10);
        expect(rng.getUpperLimit()).toBe(10);
    });

    it('should generate values within limits', () => {
        const rng = RandomNumberProvider.createRandomNumberProvider_gaussianDistribution(1.0, -5, 5);
        rng.setSeed(123);
        const values = generateValues(rng, 100);
        for (const v of values) {
            expect(v).toBeGreaterThanOrEqual(-5);
            expect(v).toBeLessThanOrEqual(5);
        }
    });
});

// ---------------------------------------------------------------------------
// Triangular distribution
// ---------------------------------------------------------------------------
describe('RandomNumberProvider – triangular distribution', () => {
    it('should create with correct distribution type', () => {
        const rng = RandomNumberProvider.createRandomNumberProvider_triangularDistribution(-1, 1, 0, -0.5, 0.5);
        expect(rng.getDistributionType()).toBe(RandomNumberProvider.DISTRIBUTION_TRIANGULAR);
    });

    it('should store mode and cut parameters', () => {
        const rng = RandomNumberProvider.createRandomNumberProvider_triangularDistribution(-10, 10, 2, -5, 5);
        expect(rng.getMode()).toBe(2);
        expect(rng.getLowCut()).toBe(-5);
        expect(rng.getHighCut()).toBe(5);
        expect(rng.getLowerLimit()).toBe(-10);
        expect(rng.getUpperLimit()).toBe(10);
    });

    it('should generate values within cut boundaries', () => {
        const rng = RandomNumberProvider.createRandomNumberProvider_triangularDistribution(-10, 10, 0, -3, 3);
        rng.setSeed(99);
        const values = generateValues(rng, 100);
        for (const v of values) {
            expect(v).toBeGreaterThanOrEqual(-3);
            expect(v).toBeLessThanOrEqual(3);
        }
    });
});

// ---------------------------------------------------------------------------
// Brownian noise distribution
// ---------------------------------------------------------------------------
describe('RandomNumberProvider – Brownian noise distribution', () => {
    it('should create with correct distribution type', () => {
        const rng = RandomNumberProvider.createRandomNumberProvider_brownianNoiseDistribution(0.5, -1, 1);
        expect(rng.getDistributionType()).toBe(RandomNumberProvider.DISTRIBUTION_CORRELATED_BROWNIANNOISE);
    });

    it('should store max step width', () => {
        const rng = RandomNumberProvider.createRandomNumberProvider_brownianNoiseDistribution(2.0, -5, 5);
        expect(rng.getMaxStepWidth()).toBe(2.0);
    });

    it('should generate values within limits', () => {
        const rng = RandomNumberProvider.createRandomNumberProvider_brownianNoiseDistribution(1.0, -10, 10);
        // Do NOT call setSeed() here; it clears the initial value the factory set.
        const values = generateValues(rng, 100);
        for (const v of values) {
            expect(v).toBeGreaterThanOrEqual(-10);
            expect(v).toBeLessThanOrEqual(10);
        }
    });

    it('should produce correlated (sequential) values', () => {
        const rng = RandomNumberProvider.createRandomNumberProvider_brownianNoiseDistribution(0.1, 0, 100);
        // Do NOT call setSeed() - it would clear the initial series value
        const values = generateValues(rng, 50);
        // Consecutive values should be close (within 2 * maxStepWidth)
        for (let i = 1; i < values.length; i++) {
            expect(Math.abs(values[i] - values[i - 1])).toBeLessThanOrEqual(0.2 + 1e-10);
        }
    });

    it('should respect setInitialValue', () => {
        const rng = RandomNumberProvider.createRandomNumberProvider_brownianNoiseDistribution(0.5, 0, 10);
        rng.setInitialValue(5);
        // The first value should be 5 (the initial value)
        expect(rng.getValue(0)).toBe(5);
    });

    it('setInitialValue should clip to upper limit', () => {
        const rng = RandomNumberProvider.createRandomNumberProvider_brownianNoiseDistribution(0.5, 0, 10);
        rng.setInitialValue(20);
        expect(rng.getValue(0)).toBe(10);
    });

    it('setInitialValue should clip to lower limit', () => {
        const rng = RandomNumberProvider.createRandomNumberProvider_brownianNoiseDistribution(0.5, 0, 10);
        rng.setInitialValue(-5);
        expect(rng.getValue(0)).toBe(0);
    });
});

// ---------------------------------------------------------------------------
// Compensating triangle distribution
// ---------------------------------------------------------------------------
describe('RandomNumberProvider – compensating triangle distribution', () => {
    it('should create with correct distribution type', () => {
        const rng = RandomNumberProvider.createRandomNumberProvider_compensatingTriangleDistribution(2.0, -1, 1, -0.5, 0.5);
        expect(rng.getDistributionType()).toBe(RandomNumberProvider.DISTRIBUTION_CORRELATED_COMPENSATING_TRIANGLE);
    });

    it('should store degree of correlation', () => {
        const rng = RandomNumberProvider.createRandomNumberProvider_compensatingTriangleDistribution(3.0, -5, 5, -3, 3);
        expect(rng.getDegreeOfCorrelation()).toBe(3.0);
    });

    it('should generate values within limits', () => {
        const rng = RandomNumberProvider.createRandomNumberProvider_compensatingTriangleDistribution(2.0, -10, 10, -5, 5);
        // Do NOT call setSeed() - it clears the initial series value required for correlated distributions
        const values = generateValues(rng, 100);
        for (const v of values) {
            expect(v).toBeGreaterThanOrEqual(-10);
            expect(v).toBeLessThanOrEqual(10);
        }
    });
});

// ---------------------------------------------------------------------------
// Distribution list
// ---------------------------------------------------------------------------
describe('RandomNumberProvider – distribution list', () => {
    it('should create with correct distribution type', () => {
        const rng = RandomNumberProvider.createRandomNumberProvider_distributionList([1, 2, 3]);
        expect(rng.getDistributionType()).toBe(RandomNumberProvider.DISTRIBUTION_LIST);
    });

    it('should return values from the list cyclically', () => {
        const rng = RandomNumberProvider.createRandomNumberProvider_distributionList([10, 20, 30]);
        expect(rng.getValue(0)).toBe(10);
        expect(rng.getValue(1)).toBe(20);
        expect(rng.getValue(2)).toBe(30);
        // Wraps around
        expect(rng.getValue(3)).toBe(10);
        expect(rng.getValue(4)).toBe(20);
        expect(rng.getValue(5)).toBe(30);
    });

    it('should handle a single-element list', () => {
        const rng = RandomNumberProvider.createRandomNumberProvider_distributionList([42]);
        expect(rng.getValue(0)).toBe(42);
        expect(rng.getValue(5)).toBe(42);
        expect(rng.getValue(100)).toBe(42);
    });
});

// ---------------------------------------------------------------------------
// getValueDouble – interpolation
// ---------------------------------------------------------------------------
describe('RandomNumberProvider – getValueDouble', () => {
    it('should interpolate between list values', () => {
        const rng = RandomNumberProvider.createRandomNumberProvider_distributionList([0, 10]);
        // At index 0.5, should be halfway between 0 and 10
        const val = rng.getValueDouble(0.5);
        expect(val).toBe(5);
    });

    it('should return exact value at integer indices', () => {
        const rng = RandomNumberProvider.createRandomNumberProvider_distributionList([100, 200]);
        expect(rng.getValueDouble(0)).toBe(100);
        expect(rng.getValueDouble(1)).toBe(200);
    });

    it('should interpolate at 0.25', () => {
        const rng = RandomNumberProvider.createRandomNumberProvider_distributionList([0, 100]);
        expect(rng.getValueDouble(0.25)).toBe(25);
    });
});
