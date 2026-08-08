import { describe, it, expect } from 'vitest';
import { ImprecisionMap } from '../../../src/mpm/elements/maps/ImprecisionMap.js';
import { DistributionData } from '../../../src/mpm/elements/maps/data/DistributionData.js';
import { GenericMap } from '../../../src/mpm/elements/maps/GenericMap.js';
import { KeyValue } from '../../../src/supplementary/KeyValue.js';
import { Element, Attribute } from '../../../src/xml/XomTypes.js';
import { Mpm } from '../../../src/mpm/Mpm.js';

describe('ImprecisionMap', () => {
    // ---------------------------------------------------------------
    // Create an imprecision map
    // ---------------------------------------------------------------
    describe('createImprecisionMap', () => {
        it('should create an imprecision map with timing domain', () => {
            const map = ImprecisionMap.createImprecisionMap('timing');
            expect(map).not.toBeNull();
            expect(map!.getType()).toBe('imprecisionMap.timing');
        });

        it('should create an imprecision map with dynamics domain', () => {
            const map = ImprecisionMap.createImprecisionMap('dynamics');
            expect(map).not.toBeNull();
            expect(map!.getType()).toBe('imprecisionMap.dynamics');
        });

        it('should create an imprecision map with toneduration domain', () => {
            const map = ImprecisionMap.createImprecisionMap('toneduration');
            expect(map).not.toBeNull();
            expect(map!.getType()).toBe('imprecisionMap.toneduration');
        });

        it('should create an imprecision map with tuning domain', () => {
            const map = ImprecisionMap.createImprecisionMap('tuning');
            expect(map).not.toBeNull();
            expect(map!.getType()).toBe('imprecisionMap.tuning');
        });

        it('should create an imprecision map with empty domain', () => {
            const map = ImprecisionMap.createImprecisionMap('');
            expect(map).not.toBeNull();
            expect(map!.getType()).toBe('imprecisionMap');
        });

        it('should start with size 0', () => {
            const map = ImprecisionMap.createImprecisionMap('timing')!;
            expect(map.size()).toBe(0);
            expect(map.isEmpty()).toBe(true);
        });

        it('getDomain should return the domain string', () => {
            const map = ImprecisionMap.createImprecisionMap('timing')!;
            expect(map.getDomain()).toBe('timing');
        });

        it('getDomain for empty domain returns empty string', () => {
            const map = ImprecisionMap.createImprecisionMap('')!;
            expect(map.getDomain()).toBe('');
        });
    });

    // ---------------------------------------------------------------
    // Detune unit
    // ---------------------------------------------------------------
    describe('detuneUnit', () => {
        it('should set and get detune unit', () => {
            const map = ImprecisionMap.createImprecisionMap('tuning')!;
            map.setDetuneUnit('cents');
            expect(map.getDetuneUnit()).toBe('cents');
        });

        it('should convert "Hertz" to "Hz"', () => {
            const map = ImprecisionMap.createImprecisionMap('tuning')!;
            map.setDetuneUnit('Hertz');
            expect(map.getDetuneUnit()).toBe('Hz');
        });

        it('should return empty string when no detune unit set', () => {
            const map = ImprecisionMap.createImprecisionMap('tuning')!;
            expect(map.getDetuneUnit()).toBe('');
        });
    });

    // ---------------------------------------------------------------
    // Add distribution - uniform
    // ---------------------------------------------------------------
    describe('addDistributionUniform', () => {
        it('should add a uniform distribution', () => {
            const map = ImprecisionMap.createImprecisionMap('timing')!;
            const index = map.addDistributionUniform(0, -10, 10);
            expect(index).toBeGreaterThanOrEqual(0);
            expect(map.size()).toBe(1);
        });

        it('should store attributes correctly', () => {
            const map = ImprecisionMap.createImprecisionMap('timing')!;
            const index = map.addDistributionUniform(0, -20, 30);
            const elem = map.getElement(index)!;

            expect(elem.getLocalName()).toBe('distribution.uniform');
            expect(elem.getAttributeValue('date')).toBe('0');
            expect(elem.getAttributeValue('limit.lower')).toBe('-20');
            expect(elem.getAttributeValue('limit.upper')).toBe('30');
        });

        it('should store optional seed', () => {
            const map = ImprecisionMap.createImprecisionMap('timing')!;
            const index = map.addDistributionUniform(0, -10, 10, 42);
            const elem = map.getElement(index)!;

            expect(elem.getAttributeValue('seed')).toBe('42');
        });

        it('should not store seed if null', () => {
            const map = ImprecisionMap.createImprecisionMap('timing')!;
            const index = map.addDistributionUniform(0, -10, 10, null);
            const elem = map.getElement(index)!;

            expect(elem.getAttribute('seed')).toBeNull();
        });
    });

    // ---------------------------------------------------------------
    // Add distribution - gaussian
    // ---------------------------------------------------------------
    describe('addDistributionGaussian', () => {
        it('should add a gaussian distribution', () => {
            const map = ImprecisionMap.createImprecisionMap('timing')!;
            const index = map.addDistributionGaussian(0, 5.0, -20, 20);
            expect(index).toBeGreaterThanOrEqual(0);
            expect(map.size()).toBe(1);
        });

        it('should store attributes correctly', () => {
            const map = ImprecisionMap.createImprecisionMap('timing')!;
            const index = map.addDistributionGaussian(100, 3.5, -15, 15);
            const elem = map.getElement(index)!;

            expect(elem.getLocalName()).toBe('distribution.gaussian');
            expect(elem.getAttributeValue('date')).toBe('100');
            expect(elem.getAttributeValue('deviation.standard')).toBe('3.5');
            expect(elem.getAttributeValue('limit.lower')).toBe('-15');
            expect(elem.getAttributeValue('limit.upper')).toBe('15');
        });

        it('should store optional seed', () => {
            const map = ImprecisionMap.createImprecisionMap('timing')!;
            const index = map.addDistributionGaussian(0, 5, -10, 10, 99);
            const elem = map.getElement(index)!;

            expect(elem.getAttributeValue('seed')).toBe('99');
        });
    });

    // ---------------------------------------------------------------
    // Add distribution - triangular
    // ---------------------------------------------------------------
    describe('addDistributionTriangular', () => {
        it('should add a triangular distribution', () => {
            const map = ImprecisionMap.createImprecisionMap('timing')!;
            const index = map.addDistributionTriangular(0, -10, 10, 0, -5, 5);
            expect(index).toBeGreaterThanOrEqual(0);
            expect(map.size()).toBe(1);
        });

        it('should store all attributes correctly', () => {
            const map = ImprecisionMap.createImprecisionMap('timing')!;
            const index = map.addDistributionTriangular(50, -20, 20, 5, -15, 15);
            const elem = map.getElement(index)!;

            expect(elem.getLocalName()).toBe('distribution.triangular');
            expect(elem.getAttributeValue('date')).toBe('50');
            expect(elem.getAttributeValue('limit.lower')).toBe('-20');
            expect(elem.getAttributeValue('limit.upper')).toBe('20');
            expect(elem.getAttributeValue('mode')).toBe('5');
            expect(elem.getAttributeValue('clip.lower')).toBe('-15');
            expect(elem.getAttributeValue('clip.upper')).toBe('15');
        });

        it('should store optional seed', () => {
            const map = ImprecisionMap.createImprecisionMap('timing')!;
            const index = map.addDistributionTriangular(0, -10, 10, 0, -5, 5, 123);
            const elem = map.getElement(index)!;

            expect(elem.getAttributeValue('seed')).toBe('123');
        });
    });

    // ---------------------------------------------------------------
    // Add distribution - brownian noise
    // ---------------------------------------------------------------
    describe('addDistributionBrownianNoise', () => {
        it('should add a brownian noise distribution', () => {
            const map = ImprecisionMap.createImprecisionMap('timing')!;
            const index = map.addDistributionBrownianNoise(0, 2.0, -10, 10, 100);
            expect(index).toBeGreaterThanOrEqual(0);
            expect(map.size()).toBe(1);
        });

        it('should store all attributes correctly', () => {
            const map = ImprecisionMap.createImprecisionMap('timing')!;
            const index = map.addDistributionBrownianNoise(0, 3.5, -20, 20, 500);
            const elem = map.getElement(index)!;

            expect(elem.getLocalName()).toBe('distribution.correlated.brownianNoise');
            expect(elem.getAttributeValue('stepWidth.max')).toBe('3.5');
            expect(elem.getAttributeValue('limit.lower')).toBe('-20');
            expect(elem.getAttributeValue('limit.upper')).toBe('20');
            expect(elem.getAttributeValue('milliseconds.timingBasis')).toBe('500');
        });

        it('should store optional seed', () => {
            const map = ImprecisionMap.createImprecisionMap('timing')!;
            const index = map.addDistributionBrownianNoise(0, 2, -10, 10, 100, 77);
            const elem = map.getElement(index)!;

            expect(elem.getAttributeValue('seed')).toBe('77');
        });
    });

    // ---------------------------------------------------------------
    // Add distribution - compensating triangle
    // ---------------------------------------------------------------
    describe('addDistributionCompensatingTriangle', () => {
        it('should add a compensating triangle distribution', () => {
            const map = ImprecisionMap.createImprecisionMap('timing')!;
            const index = map.addDistributionCompensatingTriangle(0, 0.8, -10, 10, -5, 5, 200);
            expect(index).toBeGreaterThanOrEqual(0);
            expect(map.size()).toBe(1);
        });

        it('should store all attributes correctly', () => {
            const map = ImprecisionMap.createImprecisionMap('timing')!;
            const index = map.addDistributionCompensatingTriangle(0, 0.75, -15, 15, -10, 10, 300);
            const elem = map.getElement(index)!;

            expect(elem.getLocalName()).toBe('distribution.correlated.compensatingTriangle');
            expect(elem.getAttributeValue('degreeOfCorrelation')).toBe('0.75');
            expect(elem.getAttributeValue('limit.lower')).toBe('-15');
            expect(elem.getAttributeValue('limit.upper')).toBe('15');
            expect(elem.getAttributeValue('clip.lower')).toBe('-10');
            expect(elem.getAttributeValue('clip.upper')).toBe('10');
            expect(elem.getAttributeValue('milliseconds.timingBasis')).toBe('300');
        });

        it('should clamp negative degreeOfCorrelation to 0', () => {
            const map = ImprecisionMap.createImprecisionMap('timing')!;
            const index = map.addDistributionCompensatingTriangle(0, -0.5, -10, 10, -5, 5, 200);
            const elem = map.getElement(index)!;

            // Math.max(-0.5, 0) = 0
            expect(elem.getAttributeValue('degreeOfCorrelation')).toBe('0');
        });
    });

    // ---------------------------------------------------------------
    // Add distribution - list
    // ---------------------------------------------------------------
    describe('addDistributionList', () => {
        it('should add a list distribution', () => {
            const map = ImprecisionMap.createImprecisionMap('timing')!;
            const listElem = new Element('distribution.list', Mpm.MPM_NAMESPACE);
            const index = map.addDistributionList(0, listElem, 500);
            expect(index).toBeGreaterThanOrEqual(0);
            expect(map.size()).toBe(1);
        });

        it('should set date and milliseconds.timingBasis on the element', () => {
            const map = ImprecisionMap.createImprecisionMap('timing')!;
            const listElem = new Element('distribution.list', Mpm.MPM_NAMESPACE);
            const index = map.addDistributionList(100, listElem, 750);

            const elem = map.getElement(index)!;
            expect(elem.getAttributeValue('date')).toBe('100');
            expect(elem.getAttributeValue('milliseconds.timingBasis')).toBe('750');
        });
    });

    // ---------------------------------------------------------------
    // getDistributionDataOf
    // ---------------------------------------------------------------
    describe('getDistributionDataOf', () => {
        it('should return null for an empty map', () => {
            const map = ImprecisionMap.createImprecisionMap('timing')!;
            expect(map.getDistributionDataOf(0)).toBeNull();
        });

        it('should return null for negative index', () => {
            const map = ImprecisionMap.createImprecisionMap('timing')!;
            map.addDistributionUniform(0, -10, 10);
            expect(map.getDistributionDataOf(-1)).toBeNull();
        });

        it('should return DistributionData for a uniform distribution', () => {
            const map = ImprecisionMap.createImprecisionMap('timing')!;
            map.addDistributionUniform(0, -10, 10, 42);

            const dd = map.getDistributionDataOf(0);
            expect(dd).not.toBeNull();
            expect(dd!.type).toBe('distribution.uniform');
            expect(dd!.lowerLimit).toBe(-10);
            expect(dd!.upperLimit).toBe(10);
            expect(dd!.seed).toBe(42);
            expect(dd!.startDate).toBe(0);
        });

        it('should return DistributionData for a gaussian distribution', () => {
            const map = ImprecisionMap.createImprecisionMap('timing')!;
            map.addDistributionGaussian(50, 3.5, -15, 15, 99);

            const dd = map.getDistributionDataOf(0);
            expect(dd).not.toBeNull();
            expect(dd!.type).toBe('distribution.gaussian');
            expect(dd!.standardDeviation).toBe(3.5);
            expect(dd!.lowerLimit).toBe(-15);
            expect(dd!.upperLimit).toBe(15);
            expect(dd!.seed).toBe(99);
        });

        it('should return DistributionData for a triangular distribution', () => {
            const map = ImprecisionMap.createImprecisionMap('timing')!;
            map.addDistributionTriangular(0, -20, 20, 5, -15, 15);

            const dd = map.getDistributionDataOf(0);
            expect(dd).not.toBeNull();
            expect(dd!.type).toBe('distribution.triangular');
            expect(dd!.mode).toBe(5);
            expect(dd!.lowerClip).toBe(-15);
            expect(dd!.upperClip).toBe(15);
        });

        it('should return DistributionData for brownian noise', () => {
            const map = ImprecisionMap.createImprecisionMap('timing')!;
            map.addDistributionBrownianNoise(0, 2.5, -10, 10, 500, 77);

            const dd = map.getDistributionDataOf(0);
            expect(dd).not.toBeNull();
            expect(dd!.type).toBe('distribution.correlated.brownianNoise');
            expect(dd!.maxStepWidth).toBe(2.5);
            expect(dd!.millisecondsTimingBasis).toBe(500);
            expect(dd!.seed).toBe(77);
        });

        it('should return DistributionData for compensating triangle', () => {
            const map = ImprecisionMap.createImprecisionMap('timing')!;
            map.addDistributionCompensatingTriangle(0, 0.8, -10, 10, -5, 5, 300);

            const dd = map.getDistributionDataOf(0);
            expect(dd).not.toBeNull();
            expect(dd!.type).toBe('distribution.correlated.compensatingTriangle');
            expect(dd!.degreeOfCorrelation).toBe(0.8);
        });

        it('should set endDate to MAX_VALUE for last distribution', () => {
            const map = ImprecisionMap.createImprecisionMap('timing')!;
            map.addDistributionUniform(0, -10, 10);

            const dd = map.getDistributionDataOf(0)!;
            expect(dd.endDate).toBe(Number.MAX_VALUE);
        });

        it('should set endDate to start of next distribution', () => {
            const map = ImprecisionMap.createImprecisionMap('timing')!;
            map.addDistributionUniform(0, -10, 10);
            map.addDistributionGaussian(480, 5, -20, 20);

            const dd = map.getDistributionDataOf(0)!;
            expect(dd.endDate).toBe(480);
        });

        it('should handle out-of-bounds index by clamping', () => {
            const map = ImprecisionMap.createImprecisionMap('timing')!;
            map.addDistributionUniform(0, -10, 10);

            const dd = map.getDistributionDataOf(100);
            expect(dd).not.toBeNull();
            expect(dd!.lowerLimit).toBe(-10);
        });

        it('round-trip: add then get preserves all values for uniform', () => {
            const map = ImprecisionMap.createImprecisionMap('timing')!;
            map.addDistributionUniform(200, -25, 30, 55);

            const dd = map.getDistributionDataOf(0)!;
            expect(dd.startDate).toBe(200);
            expect(dd.lowerLimit).toBe(-25);
            expect(dd.upperLimit).toBe(30);
            expect(dd.seed).toBe(55);
        });
    });

    // ---------------------------------------------------------------
    // DistributionData
    // ---------------------------------------------------------------
    describe('DistributionData', () => {
        it('should have correct default values', () => {
            const dd = new DistributionData();
            expect(dd.startDate).toBe(0.0);
            expect(dd.endDate).toBeNull();
            expect(dd.type).toBe('');
            expect(dd.standardDeviation).toBeNull();
            expect(dd.maxStepWidth).toBeNull();
            expect(dd.degreeOfCorrelation).toBeNull();
            expect(dd.mode).toBeNull();
            expect(dd.lowerLimit).toBeNull();
            expect(dd.upperLimit).toBeNull();
            expect(dd.lowerClip).toBeNull();
            expect(dd.upperClip).toBeNull();
            expect(dd.seed).toBeNull();
            expect(dd.millisecondsTimingBasis).toBeNull();
            expect(dd.distributionList).toEqual([]);
            expect(dd.xml).toBeNull();
            expect(dd.xmlId).toBeNull();
        });

        it('should have correct static type constants', () => {
            expect(DistributionData.UNIFORM).toBe('distribution.uniform');
            expect(DistributionData.GAUSSIAN).toBe('distribution.gaussian');
            expect(DistributionData.TRIANGULAR).toBe('distribution.triangular');
            expect(DistributionData.BROWNIAN).toBe('distribution.correlated.brownianNoise');
            expect(DistributionData.COMPENSATING_TRIANGLE).toBe('distribution.correlated.compensatingTriangle');
            expect(DistributionData.LIST).toBe('distribution.list');
        });

        it('should clone correctly', () => {
            const dd = new DistributionData();
            dd.startDate = 100;
            dd.endDate = 500;
            dd.type = DistributionData.GAUSSIAN;
            dd.standardDeviation = 5.0;
            dd.lowerLimit = -20;
            dd.upperLimit = 20;
            dd.seed = 42;
            dd.distributionList = [1, 2, 3, 4, 5];

            const clone = dd.clone();
            expect(clone.startDate).toBe(100);
            expect(clone.endDate).toBe(500);
            expect(clone.type).toBe(DistributionData.GAUSSIAN);
            expect(clone.standardDeviation).toBe(5.0);
            expect(clone.lowerLimit).toBe(-20);
            expect(clone.upperLimit).toBe(20);
            expect(clone.seed).toBe(42);
            expect(clone.distributionList).toEqual([1, 2, 3, 4, 5]);
        });

        it('clone should have independent distribution list', () => {
            const dd = new DistributionData();
            dd.distributionList = [1, 2, 3];

            const clone = dd.clone();
            clone.distributionList.push(4);

            expect(dd.distributionList).toEqual([1, 2, 3]);
            expect(clone.distributionList).toEqual([1, 2, 3, 4]);
        });

        it('clone should be independent of original for scalars', () => {
            const dd = new DistributionData();
            dd.lowerLimit = -10;
            dd.upperLimit = 10;

            const clone = dd.clone();
            clone.lowerLimit = -50;
            clone.upperLimit = 50;

            expect(dd.lowerLimit).toBe(-10);
            expect(dd.upperLimit).toBe(10);
        });

        it('getMinAndMaxValueInDistributionList with empty list returns null', () => {
            const dd = new DistributionData();
            expect(dd.getMinAndMaxValueInDistributionList()).toBeNull();
        });

        it('getMinAndMaxValueInDistributionList with single value', () => {
            const dd = new DistributionData();
            dd.distributionList = [5.0];

            const result = dd.getMinAndMaxValueInDistributionList();
            expect(result).not.toBeNull();
            expect(result!.getKey()).toBe(5.0);
            expect(result!.getValue()).toBe(5.0);
        });

        it('getMinAndMaxValueInDistributionList with multiple values', () => {
            const dd = new DistributionData();
            dd.distributionList = [3, -7, 12, 0, -3, 8];

            const result = dd.getMinAndMaxValueInDistributionList();
            expect(result).not.toBeNull();
            expect(result!.getKey()).toBe(-7);
            expect(result!.getValue()).toBe(12);
        });

        it('getMinAndMaxValueInDistributionList with all same values', () => {
            const dd = new DistributionData();
            dd.distributionList = [5, 5, 5];

            const result = dd.getMinAndMaxValueInDistributionList();
            expect(result).not.toBeNull();
            expect(result!.getKey()).toBe(5);
            expect(result!.getValue()).toBe(5);
        });

        it('getMinAndMaxValueInDistributionList with negative values only', () => {
            const dd = new DistributionData();
            dd.distributionList = [-1, -5, -2, -10, -3];

            const result = dd.getMinAndMaxValueInDistributionList();
            expect(result).not.toBeNull();
            expect(result!.getKey()).toBe(-10);
            expect(result!.getValue()).toBe(-1);
        });

        it('getMinAndMaxValueInDistributionList with fractional values', () => {
            const dd = new DistributionData();
            dd.distributionList = [0.1, -0.5, 0.9, 0.3];

            const result = dd.getMinAndMaxValueInDistributionList();
            expect(result).not.toBeNull();
            expect(result!.getKey()).toBeCloseTo(-0.5, 5);
            expect(result!.getValue()).toBeCloseTo(0.9, 5);
        });
    });

    // ---------------------------------------------------------------
    // renderImprecisionToMap
    // ---------------------------------------------------------------
    describe('renderImprecisionToMap', () => {
        it('null map is handled gracefully', () => {
            const map = ImprecisionMap.createImprecisionMap('timing')!;
            map.addDistributionUniform(0, -10, 10);
            // Should not throw
            map.renderImprecisionToMap(null, false);
        });

        it('empty map is handled gracefully', () => {
            const map = ImprecisionMap.createImprecisionMap('timing')!;
            const target = GenericMap.createGenericMap('positionMap')!;
            // Should not throw
            map.renderImprecisionToMap(target, false);
        });

        it('static renderImprecisionToMap with null imprecision map does nothing', () => {
            const target = GenericMap.createGenericMap('positionMap')!;
            // Should not throw
            ImprecisionMap.renderImprecisionToMap(target, null, false);
        });
    });

    // ---------------------------------------------------------------
    // GenericMap operations on ImprecisionMap
    // ---------------------------------------------------------------
    describe('GenericMap operations', () => {
        it('should support removeElement by index', () => {
            const map = ImprecisionMap.createImprecisionMap('timing')!;
            map.addDistributionUniform(0, -10, 10);
            map.addDistributionGaussian(480, 5, -20, 20);

            map.removeElement(0);
            expect(map.size()).toBe(1);
        });

        it('should support setId and getId', () => {
            const map = ImprecisionMap.createImprecisionMap('timing')!;
            expect(map.getId()).toBeNull();

            map.setId('impMap-1');
            expect(map.getId()).toBe('impMap-1');
        });

        it('should maintain sorted order', () => {
            const map = ImprecisionMap.createImprecisionMap('timing')!;
            map.addDistributionUniform(960, -10, 10);
            map.addDistributionGaussian(0, 5, -20, 20);
            map.addDistributionTriangular(480, -10, 10, 0, -5, 5);

            expect(map.size()).toBe(3);
            expect(map.getElement(0)!.getAttributeValue('date')).toBe('0');
            expect(map.getElement(1)!.getAttributeValue('date')).toBe('480');
            expect(map.getElement(2)!.getAttributeValue('date')).toBe('960');
        });
    });
});
