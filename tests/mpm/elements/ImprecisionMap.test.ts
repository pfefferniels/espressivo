import { describe, it, expect } from 'vitest';
import {
  ImprecisionMap,
  type DistributionSpan,
} from '../../../src/mpm/elements/maps/ImprecisionMap.js';
import {
  DISTRIBUTION_BROWNIAN,
  DISTRIBUTION_COMPENSATING_TRIANGLE,
  DISTRIBUTION_GAUSSIAN,
  DISTRIBUTION_LIST,
  DISTRIBUTION_LOCAL_NAME,
  DISTRIBUTION_TRIANGULAR,
  DISTRIBUTION_UNIFORM,
  minAndMaxOfDistributionList,
  parseDistribution,
  type Distribution,
} from '../../../src/mpm/elements/maps/data/distribution.js';
import { GenericMap } from '../../../src/mpm/elements/maps/GenericMap.js';
import { KeyValue } from '../../../src/supplementary/KeyValue.js';
import { Element, Attribute } from '../../../src/xml/XomTypes.js';
import { Mpm } from '../../../src/mpm/Mpm.js';

/**
 * Narrow inside a test without an `!` or a cast.
 *
 * `expect(...)` cannot narrow a type, so a suite that reads a discriminated union either
 * asserts its way past the discriminant or restates it. This states it once: the call is a
 * real runtime check (a wrong `kind` fails the test here rather than as a confusing
 * `undefined` three lines later) *and* a type guard, so the arm's own fields are reachable
 * with no assertion at all.
 */
function assume(condition: boolean, message = 'assumption failed'): asserts condition {
  if (!condition) throw new Error(message);
}

/** The span at `index`, or a test failure saying there was none. */
function spanOf(map: ImprecisionMap, index: number): DistributionSpan {
  const r = map.distributionAt(index);
  assume(r.ok, `expected a distribution at index ${String(index)}`);
  return r.value;
}

/** {@link spanOf} without the end date. */
function distributionOf(map: ImprecisionMap, index: number): Distribution {
  return spanOf(map, index).distribution;
}

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
  // distributionAt
  // ---------------------------------------------------------------
  describe('distributionAt', () => {
    it('should fail with `noEntry` for an empty map', () => {
      const map = ImprecisionMap.createImprecisionMap('timing')!;
      const r = map.distributionAt(0);
      assume(!r.ok);
      expect(r.error.kind).toBe('noEntry');
    });

    it('should fail with `noEntry` for a negative index', () => {
      const map = ImprecisionMap.createImprecisionMap('timing')!;
      map.addDistributionUniform(0, -10, 10);
      const r = map.distributionAt(-1);
      assume(!r.ok);
      expect(r.error.kind).toBe('noEntry');
    });

    it('should fail with `notADistribution` for an entry that is not one', () => {
      const map = ImprecisionMap.createImprecisionMap('timing')!;
      map.addStyleSwitch(0, 'some style');

      const r = map.distributionAt(0);
      assume(!r.ok);
      assume(r.error.kind === 'notADistribution');
      expect(r.error.localName).toBe('style');
    });

    it('should fail with `unknownFamily` for an unrecognised distribution.* name', () => {
      const map = ImprecisionMap.createImprecisionMap('timing')!;
      const e = new Element('distribution.wibble', Mpm.MPM_NAMESPACE);
      e.addAttribute(new Attribute('date', '0.0'));
      e.addAttribute(new Attribute('milliseconds.timingBasis', '250.0'));
      map.addElement(e);

      const r = map.distributionAt(0);
      assume(!r.ok);
      assume(r.error.kind === 'unknownFamily');
      expect(r.error.localName).toBe('distribution.wibble');
      // The payload is load-bearing, not diagnostic: it is what a following correlated
      // distribution hands over from. See the ImprecisionMap doc.
      expect(r.error.millisecondsTimingBasis).toBe(250);
    });

    it('should read a uniform distribution', () => {
      const map = ImprecisionMap.createImprecisionMap('timing')!;
      map.addDistributionUniform(0, -10, 10, 42);

      const d = distributionOf(map, 0);
      expect(d.kind).toBe('uniform');
      assume(d.kind === 'uniform');
      expect(d.lowerLimit).toBe(-10);
      expect(d.upperLimit).toBe(10);
      expect(d.seed).toBe(42);
      expect(d.startDate).toBe(0);
    });

    it('should read a gaussian distribution', () => {
      const map = ImprecisionMap.createImprecisionMap('timing')!;
      map.addDistributionGaussian(50, 3.5, -15, 15, 99);

      const d = distributionOf(map, 0);
      expect(d.kind).toBe('gaussian');
      assume(d.kind === 'gaussian');
      expect(d.standardDeviation).toBe(3.5);
      expect(d.lowerLimit).toBe(-15);
      expect(d.upperLimit).toBe(15);
      expect(d.seed).toBe(99);
    });

    it('should read a triangular distribution', () => {
      const map = ImprecisionMap.createImprecisionMap('timing')!;
      map.addDistributionTriangular(0, -20, 20, 5, -15, 15);

      const d = distributionOf(map, 0);
      expect(d.kind).toBe('triangular');
      assume(d.kind === 'triangular');
      expect(d.mode).toBe(5);
      expect(d.lowerClip).toBe(-15);
      expect(d.upperClip).toBe(15);
    });

    it('should read a brownian noise distribution', () => {
      const map = ImprecisionMap.createImprecisionMap('timing')!;
      map.addDistributionBrownianNoise(0, 2.5, -10, 10, 500, 77);

      const d = distributionOf(map, 0);
      expect(d.kind).toBe('brownian');
      assume(d.kind === 'brownian');
      expect(d.maxStepWidth).toBe(2.5);
      expect(d.millisecondsTimingBasis).toBe(500);
      expect(d.seed).toBe(77);
    });

    it('should read a compensating triangle distribution', () => {
      const map = ImprecisionMap.createImprecisionMap('timing')!;
      map.addDistributionCompensatingTriangle(0, 0.8, -10, 10, -5, 5, 300);

      const d = distributionOf(map, 0);
      expect(d.kind).toBe('compensatingTriangle');
      assume(d.kind === 'compensatingTriangle');
      expect(d.degreeOfCorrelation).toBe(0.8);
    });

    it('should read a distribution list from its measurement children', () => {
      const map = ImprecisionMap.createImprecisionMap('timing')!;
      const listElem = new Element(DISTRIBUTION_LIST, Mpm.MPM_NAMESPACE);
      for (const v of ['-3.5', '0.0', '7.25']) {
        const m = new Element('measurement', Mpm.MPM_NAMESPACE);
        m.addAttribute(new Attribute('value', v));
        listElem.appendChild(m);
      }
      // A measurement with no @value is skipped rather than parsed as NaN.
      listElem.appendChild(new Element('measurement', Mpm.MPM_NAMESPACE));
      map.addDistributionList(0, listElem, 400);

      const d = distributionOf(map, 0);
      expect(d.kind).toBe('list');
      assume(d.kind === 'list');
      expect(d.distributionList).toEqual([-3.5, 0, 7.25]);
      expect(d.millisecondsTimingBasis).toBe(400);
    });

    it('should set endDate to MAX_VALUE for the last distribution', () => {
      const map = ImprecisionMap.createImprecisionMap('timing')!;
      map.addDistributionUniform(0, -10, 10);

      expect(spanOf(map, 0).endDate).toBe(Number.MAX_VALUE);
    });

    it('should set endDate to the start of the next distribution', () => {
      const map = ImprecisionMap.createImprecisionMap('timing')!;
      map.addDistributionUniform(0, -10, 10);
      map.addDistributionGaussian(480, 5, -20, 20);

      expect(spanOf(map, 0).endDate).toBe(480);
    });

    it('should handle out-of-bounds index by clamping', () => {
      const map = ImprecisionMap.createImprecisionMap('timing')!;
      map.addDistributionUniform(0, -10, 10);

      const d = distributionOf(map, 100);
      assume(d.kind === 'uniform');
      expect(d.lowerLimit).toBe(-10);
    });

    it('round-trip: add then get preserves all values for uniform', () => {
      const map = ImprecisionMap.createImprecisionMap('timing')!;
      map.addDistributionUniform(200, -25, 30, 55);

      const d = distributionOf(map, 0);
      assume(d.kind === 'uniform');
      expect(d.startDate).toBe(200);
      expect(d.lowerLimit).toBe(-25);
      expect(d.upperLimit).toBe(30);
      expect(d.seed).toBe(55);
    });
  });

  // ---------------------------------------------------------------
  // parseDistribution
  //
  // What the retired `new DistributionData()` no-argument constructor used to pin — that
  // every numeric parameter starts out null — is pinned here against the case that
  // actually occurs, an element that declares nothing. The old test could only observe the
  // field initialisers; this observes the parser.
  // ---------------------------------------------------------------
  describe('parseDistribution', () => {
    const bare = (localName: string): Element => new Element(localName, Mpm.MPM_NAMESPACE);

    it('leaves every absent parameter null, and startDate at 0', () => {
      const r = parseDistribution(bare(DISTRIBUTION_TRIANGULAR));
      expect(r.ok).toBe(true);
      assume(r.ok && r.value.kind === 'triangular');
      const d = r.value;
      expect(d.startDate).toBe(0.0);
      expect(d.seed).toBeNull();
      expect(d.millisecondsTimingBasis).toBeNull();
      expect(d.lowerLimit).toBeNull();
      expect(d.upperLimit).toBeNull();
      expect(d.mode).toBeNull();
      expect(d.lowerClip).toBeNull();
      expect(d.upperClip).toBeNull();
    });

    it('leaves an empty distribution list empty rather than null', () => {
      const r = parseDistribution(bare(DISTRIBUTION_LIST));
      assume(r.ok && r.value.kind === 'list');
      expect(r.value.distributionList).toEqual([]);
      expect(r.value.millisecondsTimingBasis).toBeNull();
    });

    it('reads a malformed numeric attribute as NaN rather than rejecting it', () => {
      const e = bare(DISTRIBUTION_UNIFORM);
      e.addAttribute(new Attribute('limit.lower', 'abc'));
      const r = parseDistribution(e);
      assume(r.ok && r.value.kind === 'uniform');
      expect(Number.isNaN(r.value.lowerLimit)).toBe(true);
    });

    it('keeps the source element, which the correlated handover reads its date off', () => {
      const e = bare(DISTRIBUTION_BROWNIAN);
      const r = parseDistribution(e);
      assume(r.ok);
      expect(r.value.xml).toBe(e);
    });

    it('should have the correct local names for the six families', () => {
      expect(DISTRIBUTION_UNIFORM).toBe('distribution.uniform');
      expect(DISTRIBUTION_GAUSSIAN).toBe('distribution.gaussian');
      expect(DISTRIBUTION_TRIANGULAR).toBe('distribution.triangular');
      expect(DISTRIBUTION_BROWNIAN).toBe('distribution.correlated.brownianNoise');
      expect(DISTRIBUTION_COMPENSATING_TRIANGLE).toBe(
        'distribution.correlated.compensatingTriangle',
      );
      expect(DISTRIBUTION_LIST).toBe('distribution.list');
    });

    it('maps every kind to its local name and back', () => {
      expect(DISTRIBUTION_LOCAL_NAME).toEqual({
        uniform: DISTRIBUTION_UNIFORM,
        gaussian: DISTRIBUTION_GAUSSIAN,
        triangular: DISTRIBUTION_TRIANGULAR,
        brownian: DISTRIBUTION_BROWNIAN,
        compensatingTriangle: DISTRIBUTION_COMPENSATING_TRIANGLE,
        list: DISTRIBUTION_LIST,
      });
      for (const [kind, localName] of Object.entries(DISTRIBUTION_LOCAL_NAME)) {
        const r = parseDistribution(new Element(localName, Mpm.MPM_NAMESPACE));
        assume(r.ok);
        expect(r.value.kind).toBe(kind);
      }
    });
  });

  // ---------------------------------------------------------------
  // minAndMaxOfDistributionList
  // ---------------------------------------------------------------
  describe('minAndMaxOfDistributionList', () => {
    it('with an empty list returns null', () => {
      expect(minAndMaxOfDistributionList([])).toBeNull();
    });

    it('with a single value', () => {
      expect(minAndMaxOfDistributionList([5.0])).toEqual({ min: 5.0, max: 5.0 });
    });

    it('with multiple values', () => {
      expect(minAndMaxOfDistributionList([3, -7, 12, 0, -3, 8])).toEqual({ min: -7, max: 12 });
    });

    it('with all same values', () => {
      expect(minAndMaxOfDistributionList([5, 5, 5])).toEqual({ min: 5, max: 5 });
    });

    it('with negative values only', () => {
      expect(minAndMaxOfDistributionList([-1, -5, -2, -10, -3])).toEqual({ min: -10, max: -1 });
    });

    it('with fractional values', () => {
      const result = minAndMaxOfDistributionList([0.1, -0.5, 0.9, 0.3]);
      expect(result).not.toBeNull();
      expect(result!.min).toBeCloseTo(-0.5, 5);
      expect(result!.max).toBeCloseTo(0.9, 5);
    });
  });

  // ---------------------------------------------------------------
  // renderImprecisionToMap
  // ---------------------------------------------------------------
  describe('renderImprecisionToMap', () => {
    // -------------------------------------------------------------
    // The predecessor asymmetry.
    //
    // A correlated distribution continues its predecessor's sequence, indexing the draw on
    // the predecessor's timing basis. Which entry counts as "the predecessor" is not
    // uniform, and the difference is inherited verbatim from the class this file's subject
    // replaced: an entry that is not a distribution at all left `dd = ddPrev` standing,
    // while an unrecognised `distribution.*` name did NOT — it became `ddPrev` itself,
    // carrying its own unresolved (here: absent) timing basis into the division.
    //
    // Dividing by that absent basis is `x / null`, which is Infinity, which
    // `RandomNumberProvider.requireUsableIndex` rejects. So the asymmetry is observable as
    // "throws" versus "does not throw", and these two tests are each other's control.
    // -------------------------------------------------------------
    const handoverProbe = (middle: 'unknown' | 'style'): (() => void) => {
      const map = ImprecisionMap.createImprecisionMap('timing')!;
      map.addDistributionBrownianNoise(0, 2, -10, 10, 500, 7);
      if (middle === 'unknown') {
        const foo = new Element('distribution.wibble', Mpm.MPM_NAMESPACE);
        foo.addAttribute(new Attribute('date', '720'));
        map.addElement(foo);
      } else {
        map.addStyleSwitch(720, 'some style');
      }
      map.addDistributionBrownianNoise(1440, 2, -10, 10, 500, 9);
      // The handover reads the successor's own `milliseconds.date`, which the renderer
      // stamps on before this map runs.
      map.getElement(2)!.addAttribute(new Attribute('milliseconds.date', '2000'));

      const target = GenericMap.createGenericMap('positionMap')!;
      return () => {
        map.renderImprecisionToMap(target, false);
      };
    };

    it('an unrecognised distribution.* replaces the correlated handover partner', () => {
      expect(handoverProbe('unknown')).toThrow(/not a usable index/);
    });

    it('a non-distribution entry leaves the correlated handover partner standing', () => {
      expect(handoverProbe('style')).not.toThrow();
    });

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
