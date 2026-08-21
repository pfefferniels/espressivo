import { describe, it, expect } from 'vitest';
import { okValue } from '../../support/result.js';
import {
  ImprecisionMap,
  providerFor,
  resolveTimingBasis,
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
import { Builder, Element, Attribute } from '../../../src/xml/XomTypes.js';
import { RandomNumberProvider } from '../../../src/supplementary/RandomNumberProvider.js';
import { Mpm } from '../../../src/mpm/Mpm.js';

/**
 * Narrow inside a test without an `!` or a cast: `expect(...)` cannot narrow a type, so this
 * is both a runtime check — a wrong `kind` fails here rather than as an `undefined` three
 * lines later — and a type guard onto the union arm's own fields.
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
      const map = ImprecisionMap.createImprecisionMap('timing');
      expect(map.size()).toBe(0);
      expect(map.isEmpty()).toBe(true);
    });

    it('getDomain should return the domain string', () => {
      const map = ImprecisionMap.createImprecisionMap('timing');
      expect(map.getDomain()).toBe('timing');
    });

    it('getDomain for empty domain returns empty string', () => {
      const map = ImprecisionMap.createImprecisionMap('');
      expect(map.getDomain()).toBe('');
    });
  });

  describe('detuneUnit', () => {
    it('should set and get detune unit', () => {
      const map = ImprecisionMap.createImprecisionMap('tuning');
      map.setDetuneUnit('cents');
      expect(map.getDetuneUnit()).toBe('cents');
    });

    it('should convert "Hertz" to "Hz"', () => {
      const map = ImprecisionMap.createImprecisionMap('tuning');
      map.setDetuneUnit('Hertz');
      expect(map.getDetuneUnit()).toBe('Hz');
    });

    it('should return empty string when no detune unit set', () => {
      const map = ImprecisionMap.createImprecisionMap('tuning');
      expect(map.getDetuneUnit()).toBe('');
    });
  });

  describe('addDistributionUniform', () => {
    it('should add a uniform distribution', () => {
      const map = ImprecisionMap.createImprecisionMap('timing');
      const index = map.addDistributionUniform(0, -10, 10);
      expect(index).toBeGreaterThanOrEqual(0);
      expect(map.size()).toBe(1);
    });

    it('should store attributes correctly', () => {
      const map = ImprecisionMap.createImprecisionMap('timing');
      const index = map.addDistributionUniform(0, -20, 30);
      const elem = map.getElement(index)!;

      expect(elem.getLocalName()).toBe('distribution.uniform');
      expect(elem.getAttributeValue('date')).toBe('0');
      expect(elem.getAttributeValue('limit.lower')).toBe('-20');
      expect(elem.getAttributeValue('limit.upper')).toBe('30');
    });

    it('should store optional seed', () => {
      const map = ImprecisionMap.createImprecisionMap('timing');
      const index = map.addDistributionUniform(0, -10, 10, 42);
      const elem = map.getElement(index)!;

      expect(elem.getAttributeValue('seed')).toBe('42');
    });

    it('should not store seed if null', () => {
      const map = ImprecisionMap.createImprecisionMap('timing');
      const index = map.addDistributionUniform(0, -10, 10, null);
      const elem = map.getElement(index)!;

      expect(elem.getAttribute('seed')).toBeNull();
    });
  });

  describe('addDistributionGaussian', () => {
    it('should add a gaussian distribution', () => {
      const map = ImprecisionMap.createImprecisionMap('timing');
      const index = map.addDistributionGaussian(0, 5.0, -20, 20);
      expect(index).toBeGreaterThanOrEqual(0);
      expect(map.size()).toBe(1);
    });

    it('should store attributes correctly', () => {
      const map = ImprecisionMap.createImprecisionMap('timing');
      const index = map.addDistributionGaussian(100, 3.5, -15, 15);
      const elem = map.getElement(index)!;

      expect(elem.getLocalName()).toBe('distribution.gaussian');
      expect(elem.getAttributeValue('date')).toBe('100');
      expect(elem.getAttributeValue('deviation.standard')).toBe('3.5');
      expect(elem.getAttributeValue('limit.lower')).toBe('-15');
      expect(elem.getAttributeValue('limit.upper')).toBe('15');
    });

    it('should store optional seed', () => {
      const map = ImprecisionMap.createImprecisionMap('timing');
      const index = map.addDistributionGaussian(0, 5, -10, 10, 99);
      const elem = map.getElement(index)!;

      expect(elem.getAttributeValue('seed')).toBe('99');
    });
  });

  describe('addDistributionTriangular', () => {
    it('should add a triangular distribution', () => {
      const map = ImprecisionMap.createImprecisionMap('timing');
      const index = map.addDistributionTriangular(0, -10, 10, 0, -5, 5);
      expect(index).toBeGreaterThanOrEqual(0);
      expect(map.size()).toBe(1);
    });

    it('should store all attributes correctly', () => {
      const map = ImprecisionMap.createImprecisionMap('timing');
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
      const map = ImprecisionMap.createImprecisionMap('timing');
      const index = map.addDistributionTriangular(0, -10, 10, 0, -5, 5, 123);
      const elem = map.getElement(index)!;

      expect(elem.getAttributeValue('seed')).toBe('123');
    });
  });

  describe('addDistributionBrownianNoise', () => {
    it('should add a brownian noise distribution', () => {
      const map = ImprecisionMap.createImprecisionMap('timing');
      const index = map.addDistributionBrownianNoise(0, 2.0, -10, 10, 100);
      expect(index).toBeGreaterThanOrEqual(0);
      expect(map.size()).toBe(1);
    });

    it('should store all attributes correctly', () => {
      const map = ImprecisionMap.createImprecisionMap('timing');
      const index = map.addDistributionBrownianNoise(0, 3.5, -20, 20, 500);
      const elem = map.getElement(index)!;

      expect(elem.getLocalName()).toBe('distribution.correlated.brownianNoise');
      expect(elem.getAttributeValue('stepWidth.max')).toBe('3.5');
      expect(elem.getAttributeValue('limit.lower')).toBe('-20');
      expect(elem.getAttributeValue('limit.upper')).toBe('20');
      expect(elem.getAttributeValue('milliseconds.timingBasis')).toBe('500');
    });

    it('should store optional seed', () => {
      const map = ImprecisionMap.createImprecisionMap('timing');
      const index = map.addDistributionBrownianNoise(0, 2, -10, 10, 100, 77);
      const elem = map.getElement(index)!;

      expect(elem.getAttributeValue('seed')).toBe('77');
    });
  });

  describe('addDistributionCompensatingTriangle', () => {
    it('should add a compensating triangle distribution', () => {
      const map = ImprecisionMap.createImprecisionMap('timing');
      const index = map.addDistributionCompensatingTriangle(0, 0.8, -10, 10, -5, 5, 200);
      expect(index).toBeGreaterThanOrEqual(0);
      expect(map.size()).toBe(1);
    });

    it('should store all attributes correctly', () => {
      const map = ImprecisionMap.createImprecisionMap('timing');
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
      const map = ImprecisionMap.createImprecisionMap('timing');
      const index = map.addDistributionCompensatingTriangle(0, -0.5, -10, 10, -5, 5, 200);
      const elem = map.getElement(index)!;

      expect(elem.getAttributeValue('degreeOfCorrelation')).toBe('0');
    });
  });

  describe('addDistributionList', () => {
    it('should add a list distribution', () => {
      const map = ImprecisionMap.createImprecisionMap('timing');
      const listElem = new Element('distribution.list', Mpm.MPM_NAMESPACE);
      const index = map.addDistributionList(0, listElem, 500);
      expect(index).toBeGreaterThanOrEqual(0);
      expect(map.size()).toBe(1);
    });

    it('should set date and milliseconds.timingBasis on the element', () => {
      const map = ImprecisionMap.createImprecisionMap('timing');
      const listElem = new Element('distribution.list', Mpm.MPM_NAMESPACE);
      const index = map.addDistributionList(100, listElem, 750);

      const elem = map.getElement(index)!;
      expect(elem.getAttributeValue('date')).toBe('100');
      expect(elem.getAttributeValue('milliseconds.timingBasis')).toBe('750');
    });
  });

  describe('distributionAt', () => {
    it('should fail with `noEntry` for an empty map', () => {
      const map = ImprecisionMap.createImprecisionMap('timing');
      const r = map.distributionAt(0);
      assume(!r.ok);
      expect(r.error.kind).toBe('noEntry');
    });

    it('should fail with `noEntry` for a negative index', () => {
      const map = ImprecisionMap.createImprecisionMap('timing');
      map.addDistributionUniform(0, -10, 10);
      const r = map.distributionAt(-1);
      assume(!r.ok);
      expect(r.error.kind).toBe('noEntry');
    });

    it('should fail with `notADistribution` for an entry that is not one', () => {
      const map = ImprecisionMap.createImprecisionMap('timing');
      map.addStyleSwitch(0, 'some style');

      const r = map.distributionAt(0);
      assume(!r.ok);
      assume(r.error.kind === 'notADistribution');
      expect(r.error.localName).toBe('style');
    });

    it('should fail with `unknownFamily` for an unrecognised distribution.* name', () => {
      const map = ImprecisionMap.createImprecisionMap('timing');
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
      const map = ImprecisionMap.createImprecisionMap('timing');
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
      const map = ImprecisionMap.createImprecisionMap('timing');
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
      const map = ImprecisionMap.createImprecisionMap('timing');
      map.addDistributionTriangular(0, -20, 20, 5, -15, 15);

      const d = distributionOf(map, 0);
      expect(d.kind).toBe('triangular');
      assume(d.kind === 'triangular');
      expect(d.mode).toBe(5);
      expect(d.lowerClip).toBe(-15);
      expect(d.upperClip).toBe(15);
    });

    it('should read a brownian noise distribution', () => {
      const map = ImprecisionMap.createImprecisionMap('timing');
      map.addDistributionBrownianNoise(0, 2.5, -10, 10, 500, 77);

      const d = distributionOf(map, 0);
      expect(d.kind).toBe('brownian');
      assume(d.kind === 'brownian');
      expect(d.maxStepWidth).toBe(2.5);
      expect(d.millisecondsTimingBasis).toBe(500);
      expect(d.seed).toBe(77);
    });

    it('should read a compensating triangle distribution', () => {
      const map = ImprecisionMap.createImprecisionMap('timing');
      map.addDistributionCompensatingTriangle(0, 0.8, -10, 10, -5, 5, 300);

      const d = distributionOf(map, 0);
      expect(d.kind).toBe('compensatingTriangle');
      assume(d.kind === 'compensatingTriangle');
      expect(d.degreeOfCorrelation).toBe(0.8);
    });

    it('should read a distribution list from its measurement children', () => {
      const map = ImprecisionMap.createImprecisionMap('timing');
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
      const map = ImprecisionMap.createImprecisionMap('timing');
      map.addDistributionUniform(0, -10, 10);

      expect(spanOf(map, 0).endDate).toBe(Number.MAX_VALUE);
    });

    it('should set endDate to the start of the next distribution', () => {
      const map = ImprecisionMap.createImprecisionMap('timing');
      map.addDistributionUniform(0, -10, 10);
      map.addDistributionGaussian(480, 5, -20, 20);

      expect(spanOf(map, 0).endDate).toBe(480);
    });

    it('should handle out-of-bounds index by clamping', () => {
      const map = ImprecisionMap.createImprecisionMap('timing');
      map.addDistributionUniform(0, -10, 10);

      const d = distributionOf(map, 100);
      assume(d.kind === 'uniform');
      expect(d.lowerLimit).toBe(-10);
    });

    it('round-trip: add then get preserves all values for uniform', () => {
      const map = ImprecisionMap.createImprecisionMap('timing');
      map.addDistributionUniform(200, -25, 30, 55);

      const d = distributionOf(map, 0);
      assume(d.kind === 'uniform');
      expect(d.startDate).toBe(200);
      expect(d.lowerLimit).toBe(-25);
      expect(d.upperLimit).toBe(30);
      expect(d.seed).toBe(55);
    });
  });

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

  /**
   * A distribution element from its XML text, so that the six families' attribute sets can
   * be written the way a document writes them rather than assembled attribute by attribute.
   */
  const elementFromXml = (xml: string): Element => new Builder().build(xml).getRootElement();

  // Six positional factory signatures. Nothing downstream notices a triangular built with
  // its `mode` and `clip.lower` the wrong way round — it still draws plausible numbers — so
  // the parameters are read back off the provider rather than inferred from a rendered date.
  describe('providerFor', () => {
    const provider = (xml: string): RandomNumberProvider => {
      const parsed = parseDistribution(elementFromXml(xml));
      assume(parsed.ok);
      return providerFor(parsed.value, null, null);
    };

    it('uniform: the two limits', () => {
      const p = provider('<distribution.uniform limit.lower="-20" limit.upper="30"/>');
      expect(p.getDistributionType()).toBe(RandomNumberProvider.DISTRIBUTION_UNIFORM);
      expect(p.getLowerLimit()).toBe(-20);
      expect(p.getUpperLimit()).toBe(30);
    });

    it('gaussian: the deviation and the two limits', () => {
      const p = provider(
        '<distribution.gaussian deviation.standard="3.5" limit.lower="-15" limit.upper="15"/>',
      );
      expect(p.getDistributionType()).toBe(RandomNumberProvider.DISTRIBUTION_GAUSSIAN);
      expect(p.getStandardDeviation()).toBe(3.5);
      expect(p.getLowerLimit()).toBe(-15);
      expect(p.getUpperLimit()).toBe(15);
    });

    it('triangular: limits, mode and the two clips, each in its own slot', () => {
      const p = provider(
        '<distribution.triangular limit.lower="-20" limit.upper="20" mode="5" clip.lower="-15" clip.upper="12"/>',
      );
      expect(p.getDistributionType()).toBe(RandomNumberProvider.DISTRIBUTION_TRIANGULAR);
      expect(p.getLowerLimit()).toBe(-20);
      expect(p.getUpperLimit()).toBe(20);
      expect(p.getMode()).toBe(5);
      expect(p.getLowCut()).toBe(-15);
      expect(p.getHighCut()).toBe(12);
    });

    it('brownian noise: the step width and the two limits', () => {
      const p = provider(
        '<distribution.correlated.brownianNoise stepWidth.max="2.5" limit.lower="-10" limit.upper="11"/>',
      );
      expect(p.getDistributionType()).toBe(
        RandomNumberProvider.DISTRIBUTION_CORRELATED_BROWNIANNOISE,
      );
      expect(p.getMaxStepWidth()).toBe(2.5);
      expect(p.getLowerLimit()).toBe(-10);
      expect(p.getUpperLimit()).toBe(11);
    });

    it('compensating triangle: the correlation, the limits and the two clips', () => {
      const p = provider(
        '<distribution.correlated.compensatingTriangle degreeOfCorrelation="0.8" limit.lower="-10" limit.upper="11" clip.lower="-5" clip.upper="6"/>',
      );
      expect(p.getDistributionType()).toBe(
        RandomNumberProvider.DISTRIBUTION_CORRELATED_COMPENSATING_TRIANGLE,
      );
      expect(p.getDegreeOfCorrelation()).toBe(0.8);
      expect(p.getLowerLimit()).toBe(-10);
      expect(p.getUpperLimit()).toBe(11);
      expect(p.getLowCut()).toBe(-5);
      expect(p.getHighCut()).toBe(6);
    });

    it('list: the measurements become the series, read cyclically', () => {
      const p = provider(
        '<distribution.list><measurement value="-3"/><measurement value="7"/></distribution.list>',
      );
      expect(p.getDistributionType()).toBe(RandomNumberProvider.DISTRIBUTION_LIST);
      expect(p.getValue(0)).toBe(-3);
      expect(p.getValue(1)).toBe(7);
      expect(p.getValue(2)).toBe(-3);
    });

    // An absent parameter must reach the provider as `null`, not as 0: the null is what makes
    // a clip-less triangular perform exactly no imprecision (`clip()` returns it, and the
    // write-back's `attValue + null` is `attValue`), and it is what
    // `src/comparison/imprecisionLaws.ts` tabulates its degenerate table from. `?? 0` here
    // would also change a strict `upperLimit === lowerLimit` in the triangular draw.
    it('hands an absent parameter through as null, not as 0', () => {
      const p = provider('<distribution.triangular limit.lower="-20" limit.upper="20"/>');
      expect(p.getMode()).toBeNull();
      expect(p.getLowCut()).toBeNull();
      expect(p.getHighCut()).toBeNull();
      // ... and the declared ones are still numbers, so this is not vacuous.
      expect(p.getLowerLimit()).toBe(-20);
    });
  });

  // Tested here rather than through a rendered date: the comparison module keeps its own
  // independent copy of this derivation (`src/comparison/imprecisionLaws.ts`), so a test that
  // reads a timing basis through that reader cannot see a mistake in this one.
  describe('resolveTimingBasis', () => {
    const basisOf = (xml: string, isTiming = true): number => {
      const parsed = parseDistribution(elementFromXml(xml));
      assume(parsed.ok);
      return resolveTimingBasis(parsed.value, isTiming);
    };

    it('uses a declared basis verbatim', () => {
      expect(basisOf('<distribution.uniform milliseconds.timingBasis="250"/>')).toBe(250);
    });

    it('uses a declared basis verbatim even when it is zero or negative', () => {
      // Deliberate: the `<= 0` fallback below guards the DERIVED value only. A declared 0
      // makes the index infinite and the render throw, which is the ⊥ route
      // `src/comparison/imprecisionLaws.ts` documents.
      expect(basisOf('<distribution.uniform milliseconds.timingBasis="0"/>')).toBe(0);
      expect(basisOf('<distribution.uniform milliseconds.timingBasis="-40"/>')).toBe(-40);
    });

    it('derives from the LIMITS for uniform, gaussian and brownian noise', () => {
      expect(basisOf('<distribution.uniform limit.lower="-30" limit.upper="30"/>')).toBe(60);
      expect(basisOf('<distribution.gaussian limit.lower="-5" limit.upper="20" mode="999"/>')).toBe(
        25,
      );
      expect(
        basisOf('<distribution.correlated.brownianNoise limit.lower="-4" limit.upper="6"/>'),
      ).toBe(10);
    });

    it('derives from the CLIPS for triangular and compensating triangle', () => {
      // The limits are deliberately a different width from the clips, so a derivation that
      // reached for the wrong pair would produce the wrong number rather than the same one.
      expect(
        basisOf(
          '<distribution.triangular limit.lower="-100" limit.upper="100" clip.lower="-30" clip.upper="30"/>',
        ),
      ).toBe(60);
      expect(
        basisOf(
          '<distribution.correlated.compensatingTriangle limit.lower="-100" limit.upper="100" clip.lower="-8" clip.upper="8"/>',
        ),
      ).toBe(16);
    });

    it('derives from the extent of the measurements for a list', () => {
      expect(
        basisOf(
          '<distribution.list><measurement value="-3"/><measurement value="7"/><measurement value="1"/></distribution.list>',
        ),
      ).toBe(10);
    });

    it('falls back to 100 outside the timing domain, whatever the spread', () => {
      expect(basisOf('<distribution.uniform limit.lower="-30" limit.upper="30"/>', false)).toBe(
        100,
      );
    });

    it('falls back to 100 where the derivation comes out at zero or below', () => {
      expect(basisOf('<distribution.uniform/>')).toBe(100);
      expect(basisOf('<distribution.uniform limit.lower="30" limit.upper="-30"/>')).toBe(100);
      expect(basisOf('<distribution.list/>')).toBe(100);
      expect(basisOf('<distribution.triangular limit.lower="-30" limit.upper="30"/>')).toBe(100);
    });

    it('keeps a NaN derivation rather than falling back', () => {
      // `NaN <= 0` is false, so the fallback does not catch it — the incumbent's behaviour,
      // and the one `RandomNumberProvider.requireUsableIndex` is there to reject.
      expect(basisOf('<distribution.uniform limit.lower="abc" limit.upper="30"/>')).toBeNaN();
    });
  });

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

  describe('renderImprecisionToMap', () => {
    // The predecessor asymmetry, inherited from the incumbent.
    //
    // A correlated distribution continues its predecessor's sequence, indexing the draw on
    // the predecessor's timing basis. Which entry counts as the predecessor is not uniform:
    // an entry that is not a distribution at all leaves `dd = ddPrev` standing, while an
    // unrecognised `distribution.*` name becomes `ddPrev` itself and carries its own
    // unresolved (here absent) timing basis into the division.
    //
    // Dividing by that absent basis is `x / null`, i.e. Infinity, which
    // `RandomNumberProvider.requireUsableIndex` rejects. The asymmetry is therefore visible
    // as throws versus does not throw, and the two tests are each other's control.
    const handoverProbe = (middle: 'unknown' | 'style'): (() => void) => {
      const map = ImprecisionMap.createImprecisionMap('timing');
      map.addDistributionBrownianNoise(0, 2, -10, 10, 500, 7);
      // Both middles go in through `addElement`, which places by date. `addStyleSwitch` would
      // not do: its first-at-date insertion falls through to index 0 for a date later than
      // every existing entry (pinned in GenericMap.test.ts), which would move the middle entry
      // out from between the two distributions this probe needs it between.
      const middleElement =
        middle === 'unknown'
          ? new Element('distribution.wibble', Mpm.MPM_NAMESPACE)
          : new Element('style', Mpm.MPM_NAMESPACE);
      if (middle === 'style') middleElement.addAttribute(new Attribute('name.ref', 'a style'));
      middleElement.addAttribute(new Attribute('date', '720'));
      map.addElement(middleElement);
      map.addDistributionBrownianNoise(1440, 2, -10, 10, 500, 9);
      // The handover reads the successor's own `milliseconds.date`, which the renderer
      // stamps on before this map runs.
      map.getElement(2)!.addAttribute(new Attribute('milliseconds.date', '2000'));

      const target = okValue(GenericMap.createGenericMap('positionMap'));
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

    /**
     * The pending-duration drain stops at the FIRST entry that does not fit, and does not
     * skip it to reach the ones behind it.
     *
     * `milliseconds.date.end` offsets are parked while a distribution's span is walked and
     * drained after it, as the leading run of ends that fall inside the span. The run is a
     * prefix: an end reaching past the span blocks everything queued behind it, and both it
     * and they are handed to the NEXT distribution. Draining past the blocker instead would
     * splice a *different* entry off the front — one that was never offset — so one note
     * would keep its unperturbed end and another would collect two offsets.
     *
     * Nothing else pins that. The corpus reaches this drain — removing it fails the
     * multi-instruction byte test — but never reaches the stop: turning the `break` into a
     * `continue` leaves the whole suite green. The shape it needs is two overlapping notes
     * inside one span, the longer one first, and the corpus has none.
     *
     * A one-value `distribution.list` makes every offset exactly +100, so the two arms are
     * arithmetic rather than statistical: 5000 -> 5100 and 500 -> 600 under the prefix rule,
     * against 5000 unchanged and 500 -> 700 under the other.
     */
    it('the pending-duration drain stops at the first end past the span (prefix, not filter)', () => {
      const constantOffset = (): Element => {
        const list = new Element(DISTRIBUTION_LIST, Mpm.MPM_NAMESPACE);
        const measurement = new Element('measurement', Mpm.MPM_NAMESPACE);
        measurement.addAttribute(new Attribute('value', '100'));
        list.appendChild(measurement);
        return list;
      };
      const map = ImprecisionMap.createImprecisionMap('timing');
      map.addDistributionList(0, constantOffset(), 1);
      map.addDistributionList(1000, constantOffset(), 1);

      const target = okValue(GenericMap.createGenericMap('positionMap'));
      const note = (date: string, msDate: string, msEnd: string): Element => {
        const e = new Element('note', Mpm.MPM_NAMESPACE);
        e.addAttribute(new Attribute('date', date));
        e.addAttribute(new Attribute('milliseconds.date', msDate));
        e.addAttribute(new Attribute('milliseconds.date.end', msEnd));
        target.addElement(e);
        return e;
      };
      // Both onsets are inside the first span (which ends at 1000); only the second note's
      // END is. The first note is the blocker.
      const long = note('0', '0', '5000');
      const short = note('100', '100', '500');

      map.renderImprecisionToMap(target, false);

      expect(long.getAttributeValue('milliseconds.date')).toBe('100');
      expect(short.getAttributeValue('milliseconds.date')).toBe('200');
      expect(long.getAttributeValue('milliseconds.date.end')).toBe('5100');
      expect(short.getAttributeValue('milliseconds.date.end')).toBe('600');
    });

    it('null map is handled gracefully', () => {
      const map = ImprecisionMap.createImprecisionMap('timing');
      map.addDistributionUniform(0, -10, 10);
      map.renderImprecisionToMap(null, false);
    });

    it('empty map is handled gracefully', () => {
      const map = ImprecisionMap.createImprecisionMap('timing');
      const target = okValue(GenericMap.createGenericMap('positionMap'));
      map.renderImprecisionToMap(target, false);
    });

    it('static renderImprecisionToMap with null imprecision map does nothing', () => {
      const target = okValue(GenericMap.createGenericMap('positionMap'));
      ImprecisionMap.renderImprecisionToMap(target, null, false);
    });
  });

  describe('GenericMap operations', () => {
    it('should support removeElement by index', () => {
      const map = ImprecisionMap.createImprecisionMap('timing');
      map.addDistributionUniform(0, -10, 10);
      map.addDistributionGaussian(480, 5, -20, 20);

      map.removeElementAt(0);
      expect(map.size()).toBe(1);
    });

    it('should support setId and getId', () => {
      const map = ImprecisionMap.createImprecisionMap('timing');
      expect(map.getId()).toBeNull();

      map.setId('impMap-1');
      expect(map.getId()).toBe('impMap-1');
    });

    it('should maintain sorted order', () => {
      const map = ImprecisionMap.createImprecisionMap('timing');
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
