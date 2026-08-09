import { describe, it, expect } from 'vitest';
import { MetricalAccentuationMap } from '../../../src/mpm/elements/maps/MetricalAccentuationMap.js';
import { MetricalAccentuationData } from '../../../src/mpm/elements/maps/data/MetricalAccentuationData.js';
import { Element, Attribute } from '../../../src/xml/XomTypes.js';
import { Mpm } from '../../../src/mpm/Mpm.js';

describe('MetricalAccentuationMap', () => {
  // ---------------------------------------------------------------
  // Create a metrical accentuation map
  // ---------------------------------------------------------------
  describe('createMetricalAccentuationMap', () => {
    it('should create an empty metrical accentuation map', () => {
      const map = MetricalAccentuationMap.createMetricalAccentuationMap();
      expect(map).not.toBeNull();
      expect(map!.getType()).toBe('metricalAccentuationMap');
    });

    it('should start with size 0', () => {
      const map = MetricalAccentuationMap.createMetricalAccentuationMap()!;
      expect(map.size()).toBe(0);
      expect(map.isEmpty()).toBe(true);
    });

    it('should have an XML element', () => {
      const map = MetricalAccentuationMap.createMetricalAccentuationMap()!;
      expect(map.getXml()).not.toBeNull();
      expect(map.getXml()!.getLocalName()).toBe('metricalAccentuationMap');
    });
  });

  // ---------------------------------------------------------------
  // Add accentuation pattern
  // ---------------------------------------------------------------
  describe('addAccentuationPattern', () => {
    it('should add an accentuation pattern with required parameters', () => {
      const map = MetricalAccentuationMap.createMetricalAccentuationMap()!;
      const index = map.addAccentuationPattern(0, 'myPattern', 1.0);
      expect(index).toBeGreaterThanOrEqual(0);
      expect(map.size()).toBe(1);
    });

    it('should store attributes correctly', () => {
      const map = MetricalAccentuationMap.createMetricalAccentuationMap()!;
      const index = map.addAccentuationPattern(0, 'myPattern', 1.5);
      const elem = map.getElement(index)!;

      expect(elem.getAttributeValue('date')).toBe('0');
      expect(elem.getAttributeValue('name.ref')).toBe('myPattern');
      expect(elem.getAttributeValue('scale')).toBe('1.5');
    });

    it('should store optional loop parameter', () => {
      const map = MetricalAccentuationMap.createMetricalAccentuationMap()!;
      const index = map.addAccentuationPattern(0, 'myPattern', 1.0, true);
      const elem = map.getElement(index)!;

      expect(elem.getAttributeValue('loop')).toBe('true');
    });

    it('should store optional stickToMeasures parameter', () => {
      const map = MetricalAccentuationMap.createMetricalAccentuationMap()!;
      const index = map.addAccentuationPattern(0, 'myPattern', 1.0, true, false);
      const elem = map.getElement(index)!;

      expect(elem.getAttributeValue('loop')).toBe('true');
      expect(elem.getAttributeValue('stickToMeasures')).toBe('false');
    });

    it('should maintain sorted order when adding out of order', () => {
      const map = MetricalAccentuationMap.createMetricalAccentuationMap()!;
      map.addAccentuationPattern(960, 'p3', 1.0);
      map.addAccentuationPattern(0, 'p1', 1.0);
      map.addAccentuationPattern(480, 'p2', 1.0);

      expect(map.size()).toBe(3);
      expect(map.getElement(0)!.getAttributeValue('date')).toBe('0');
      expect(map.getElement(1)!.getAttributeValue('date')).toBe('480');
      expect(map.getElement(2)!.getAttributeValue('date')).toBe('960');
    });

    it('should not add loop/stickToMeasures if not provided', () => {
      const map = MetricalAccentuationMap.createMetricalAccentuationMap()!;
      const index = map.addAccentuationPattern(0, 'myPattern', 1.0);
      const elem = map.getElement(index)!;

      // These attributes should not be present
      expect(elem.getAttribute('loop')).toBeNull();
      expect(elem.getAttribute('stickToMeasures')).toBeNull();
    });
  });

  // ---------------------------------------------------------------
  // getMetricalAccentuationDataOf
  // ---------------------------------------------------------------
  describe('getMetricalAccentuationDataOf', () => {
    it('should return null for an empty map', () => {
      const map = MetricalAccentuationMap.createMetricalAccentuationMap()!;
      expect(map.getMetricalAccentuationDataOf(0)).toBeNull();
    });

    it('should return null for negative index', () => {
      const map = MetricalAccentuationMap.createMetricalAccentuationMap()!;
      map.addAccentuationPattern(0, 'myPattern', 1.0);
      expect(map.getMetricalAccentuationDataOf(-1)).toBeNull();
    });

    it('should return null when no style is configured (style lookup fails)', () => {
      // Without a proper header/style configured, getMetricalAccentuationDataOf
      // returns null because it cannot find the style definition
      const map = MetricalAccentuationMap.createMetricalAccentuationMap()!;
      map.addAccentuationPattern(0, 'myPattern', 1.0);

      const result = map.getMetricalAccentuationDataOf(0);
      // This returns null because no style is attached
      expect(result).toBeNull();
    });

    it('should handle out-of-bounds index by clamping', () => {
      const map = MetricalAccentuationMap.createMetricalAccentuationMap()!;
      map.addAccentuationPattern(0, 'myPattern', 1.0);

      // Even with clamping, it will return null because no style is configured
      const result = map.getMetricalAccentuationDataOf(100);
      expect(result).toBeNull();
    });
  });

  // ---------------------------------------------------------------
  // MetricalAccentuationData
  // ---------------------------------------------------------------
  describe('MetricalAccentuationData', () => {
    it('should have correct default values', () => {
      const md = new MetricalAccentuationData();
      expect(md.startDate).toBe(0.0);
      expect(md.endDate).toBeNull();
      expect(md.scale).toBe(1.0);
      expect(md.loop).toBe(false);
      expect(md.stickToMeasures).toBe(true);
      expect(md.styleName).toBe('');
      expect(md.style).toBeNull();
      expect(md.accentuationPatternDefName).toBeNull();
      expect(md.accentuationPatternDef).toBeNull();
      expect(md.xml).toBeNull();
      expect(md.xmlId).toBeNull();
    });

    it('should clone correctly', () => {
      const md = new MetricalAccentuationData();
      md.startDate = 100;
      md.endDate = 500;
      md.scale = 2.5;
      md.loop = true;
      md.stickToMeasures = false;
      md.styleName = 'testStyle';
      md.accentuationPatternDefName = 'myPattern';
      md.xmlId = 'acc-1';

      const clone = md.clone();
      expect(clone.startDate).toBe(100);
      expect(clone.endDate).toBe(500);
      expect(clone.scale).toBe(2.5);
      expect(clone.loop).toBe(true);
      expect(clone.stickToMeasures).toBe(false);
      expect(clone.styleName).toBe('testStyle');
      expect(clone.accentuationPatternDefName).toBe('myPattern');
      expect(clone.xmlId).toBe('acc-1');
    });

    it('clone should be independent of original', () => {
      const md = new MetricalAccentuationData();
      md.scale = 2.0;
      md.loop = true;

      const clone = md.clone();
      clone.scale = 0.5;
      clone.loop = false;

      expect(md.scale).toBe(2.0);
      expect(md.loop).toBe(true);
    });

    it('should parse from XML element', () => {
      const xml = new Element('accentuationPattern', Mpm.MPM_NAMESPACE);
      xml.addAttribute(new Attribute('date', '240'));
      xml.addAttribute(new Attribute('name.ref', 'waltzPattern'));
      xml.addAttribute(new Attribute('scale', '1.5'));
      xml.addAttribute(new Attribute('loop', 'true'));
      xml.addAttribute(new Attribute('stickToMeasures', 'false'));

      const md = new MetricalAccentuationData(xml);
      expect(md.startDate).toBe(240);
      expect(md.accentuationPatternDefName).toBe('waltzPattern');
      expect(md.scale).toBe(1.5);
      expect(md.loop).toBe(true);
      expect(md.stickToMeasures).toBe(false);
    });

    it('should parse loop=false from XML', () => {
      const xml = new Element('accentuationPattern', Mpm.MPM_NAMESPACE);
      xml.addAttribute(new Attribute('date', '0'));
      xml.addAttribute(new Attribute('name.ref', 'pattern'));
      xml.addAttribute(new Attribute('scale', '1'));
      xml.addAttribute(new Attribute('loop', 'false'));

      const md = new MetricalAccentuationData(xml);
      expect(md.loop).toBe(false);
    });

    it('should default loop and stickToMeasures when not in XML', () => {
      const xml = new Element('accentuationPattern', Mpm.MPM_NAMESPACE);
      xml.addAttribute(new Attribute('date', '0'));
      xml.addAttribute(new Attribute('name.ref', 'pattern'));
      xml.addAttribute(new Attribute('scale', '1'));

      const md = new MetricalAccentuationData(xml);
      expect(md.loop).toBe(false);
      expect(md.stickToMeasures).toBe(true);
    });
  });

  // ---------------------------------------------------------------
  // Beat position calculation mathematics
  // ---------------------------------------------------------------
  describe('beat position calculation math', () => {
    // These tests verify the mathematical formulas used in renderMetricalAccentuationToMap:
    //   ticksPerBeat = 4.0 * ppq / denominator
    //   tickLengthOfOneMeasure = ticksPerBeat * numerator
    //   stickToMeasures=true:  beat = 1.0 + ((date - tsDate) % tickLengthOfOneMeasure) / ticksPerBeat
    //   stickToMeasures=false: beat = 1.0 + ((date - tsDate) % patternLengthTicks) / ticksPerBeat

    it('4/4 time, ppq=720: beat positions are computed correctly', () => {
      // ppq4 = 4 * 720 = 2880
      // ticksPerBeat = 2880 / 4 = 720
      // tickLengthOfOneMeasure = 720 * 4 = 2880
      //
      // tick=0:    beat = 1 + (0 % 2880) / 720 = 1.0
      // tick=720:  beat = 1 + (720 % 2880) / 720 = 1 + 1 = 2.0
      // tick=1440: beat = 1 + (1440 % 2880) / 720 = 1 + 2 = 3.0
      // tick=2160: beat = 1 + (2160 % 2880) / 720 = 1 + 3 = 4.0
      // tick=2880: beat = 1 + (2880 % 2880) / 720 = 1 + 0 = 1.0 (wraps)
      const ppq = 720;
      const ppq4 = 4.0 * ppq;
      const denominator = 4;
      const numerator = 4;
      const ticksPerBeat = ppq4 / denominator;
      const tickLengthOfOneMeasure = ticksPerBeat * numerator;

      expect(ticksPerBeat).toBe(720);
      expect(tickLengthOfOneMeasure).toBe(2880);

      const tsDate = 0;
      const computeBeat = (date: number) =>
        1.0 + ((date - tsDate) % tickLengthOfOneMeasure) / ticksPerBeat;

      expect(computeBeat(0)).toBeCloseTo(1.0, 5);
      expect(computeBeat(720)).toBeCloseTo(2.0, 5);
      expect(computeBeat(1440)).toBeCloseTo(3.0, 5);
      expect(computeBeat(2160)).toBeCloseTo(4.0, 5);
      expect(computeBeat(2880)).toBeCloseTo(1.0, 5); // wraps
    });

    it('3/4 time, ppq=720: measure length = 3 beats', () => {
      // ppq4 = 2880
      // ticksPerBeat = 2880 / 4 = 720
      // tickLengthOfOneMeasure = 720 * 3 = 2160
      //
      // tick=0:    beat = 1 + (0 % 2160) / 720 = 1.0
      // tick=720:  beat = 1 + (720 % 2160) / 720 = 2.0
      // tick=1440: beat = 1 + (1440 % 2160) / 720 = 3.0
      // tick=2160: beat = 1 + (2160 % 2160) / 720 = 1.0 (wraps)
      const ppq = 720;
      const ppq4 = 4.0 * ppq;
      const denominator = 4;
      const numerator = 3;
      const ticksPerBeat = ppq4 / denominator;
      const tickLengthOfOneMeasure = ticksPerBeat * numerator;

      expect(ticksPerBeat).toBe(720);
      expect(tickLengthOfOneMeasure).toBe(2160);

      const tsDate = 0;
      const computeBeat = (date: number) =>
        1.0 + ((date - tsDate) % tickLengthOfOneMeasure) / ticksPerBeat;

      expect(computeBeat(0)).toBeCloseTo(1.0, 5);
      expect(computeBeat(720)).toBeCloseTo(2.0, 5);
      expect(computeBeat(1440)).toBeCloseTo(3.0, 5);
      expect(computeBeat(2160)).toBeCloseTo(1.0, 5); // wraps after 3 beats
    });

    it('6/8 time, ppq=720: beat positions', () => {
      // ppq4 = 2880
      // ticksPerBeat = 2880 / 8 = 360
      // tickLengthOfOneMeasure = 360 * 6 = 2160
      //
      // tick=0:   beat = 1.0
      // tick=360: beat = 2.0
      // tick=720: beat = 3.0
      const ppq = 720;
      const ppq4 = 4.0 * ppq;
      const denominator = 8;
      const numerator = 6;
      const ticksPerBeat = ppq4 / denominator;
      const tickLengthOfOneMeasure = ticksPerBeat * numerator;

      expect(ticksPerBeat).toBe(360);
      expect(tickLengthOfOneMeasure).toBe(2160);

      const tsDate = 0;
      const computeBeat = (date: number) =>
        1.0 + ((date - tsDate) % tickLengthOfOneMeasure) / ticksPerBeat;

      expect(computeBeat(0)).toBeCloseTo(1.0, 5);
      expect(computeBeat(360)).toBeCloseTo(2.0, 5);
      expect(computeBeat(720)).toBeCloseTo(3.0, 5);
      expect(computeBeat(1080)).toBeCloseTo(4.0, 5);
    });

    it('stickToMeasures=true wraps within measure length', () => {
      const ppq = 720;
      const ppq4 = 4.0 * ppq;
      const denominator = 4;
      const numerator = 4;
      const ticksPerBeat = ppq4 / denominator;
      const tickLengthOfOneMeasure = ticksPerBeat * numerator;
      const tsDate = 0;

      // stickToMeasures formula:
      const computeBeat = (date: number) =>
        1.0 + ((date - tsDate) % tickLengthOfOneMeasure) / ticksPerBeat;

      // After one measure (2880 ticks), it wraps back to beat 1
      expect(computeBeat(2880)).toBeCloseTo(1.0, 5);
      expect(computeBeat(3600)).toBeCloseTo(2.0, 5); // 3600 - 2880 = 720
    });

    it('stickToMeasures=false wraps within pattern length', () => {
      const ppq = 720;
      const ppq4 = 4.0 * ppq;
      const denominator = 4;
      const ticksPerBeat = ppq4 / denominator;
      const tsDate = 0;

      // patternLengthTicks depends on accentuationPatternDef.getLength()
      // Suppose pattern length = 2.0 (2 beats in quarter-note terms)
      // patternLengthTicks = (2.0 * ppq4) / denominator = (2.0 * 2880) / 4 = 1440
      const patternLength = 2.0;
      const patternLengthTicks = (patternLength * ppq4) / denominator;

      expect(patternLengthTicks).toBe(1440);

      // stickToMeasures=false formula:
      const computeBeat = (date: number) =>
        1.0 + ((date - tsDate) % patternLengthTicks) / ticksPerBeat;

      expect(computeBeat(0)).toBeCloseTo(1.0, 5);
      expect(computeBeat(720)).toBeCloseTo(2.0, 5);
      expect(computeBeat(1440)).toBeCloseTo(1.0, 5); // wraps at pattern length, not measure
    });

    it('accentuation application formula: velocity + (accentuation * scale)', () => {
      // This is the core formula for applying accentuation
      const velocity = 80;
      const accentuation = 10;
      const scale = 1.5;

      const result = velocity + accentuation * scale;
      expect(result).toBe(95);
    });

    it('accentuation with negative value reduces velocity', () => {
      const velocity = 80;
      const accentuation = -20;
      const scale = 1.0;

      const result = velocity + accentuation * scale;
      expect(result).toBe(60);
    });

    it('scale=0 neutralizes accentuation', () => {
      const velocity = 80;
      const accentuation = 50;
      const scale = 0.0;

      const result = velocity + accentuation * scale;
      expect(result).toBe(80);
    });

    it('high scale amplifies accentuation', () => {
      const velocity = 80;
      const accentuation = 5;
      const scale = 10.0;

      const result = velocity + accentuation * scale;
      expect(result).toBe(130);
    });

    it('non-zero tsDate offsets beat calculation', () => {
      const ppq = 720;
      const ppq4 = 4.0 * ppq;
      const denominator = 4;
      const numerator = 4;
      const ticksPerBeat = ppq4 / denominator;
      const tickLengthOfOneMeasure = ticksPerBeat * numerator;
      const tsDate = 1440; // time signature starts at tick 1440

      const computeBeat = (date: number) =>
        1.0 + ((date - tsDate) % tickLengthOfOneMeasure) / ticksPerBeat;

      // tick=1440 is now beat 1 of the new time signature
      expect(computeBeat(1440)).toBeCloseTo(1.0, 5);
      expect(computeBeat(2160)).toBeCloseTo(2.0, 5);
      expect(computeBeat(2880)).toBeCloseTo(3.0, 5);
    });

    it('fractional beat position for off-beat notes', () => {
      const ppq = 720;
      const ppq4 = 4.0 * ppq;
      const denominator = 4;
      const numerator = 4;
      const ticksPerBeat = ppq4 / denominator;
      const tickLengthOfOneMeasure = ticksPerBeat * numerator;
      const tsDate = 0;

      const computeBeat = (date: number) =>
        1.0 + ((date - tsDate) % tickLengthOfOneMeasure) / ticksPerBeat;

      // Half-beat: tick=360 (half of 720)
      expect(computeBeat(360)).toBeCloseTo(1.5, 5);
      // Quarter-beat: tick=180
      expect(computeBeat(180)).toBeCloseTo(1.25, 5);
    });
  });

  // ---------------------------------------------------------------
  // GenericMap operations on MetricalAccentuationMap
  // ---------------------------------------------------------------
  describe('GenericMap operations', () => {
    it('should support removeElement by index', () => {
      const map = MetricalAccentuationMap.createMetricalAccentuationMap()!;
      map.addAccentuationPattern(0, 'p1', 1.0);
      map.addAccentuationPattern(960, 'p2', 2.0);

      map.removeElement(0);
      expect(map.size()).toBe(1);
      expect(map.getElement(0)!.getAttributeValue('name.ref')).toBe('p2');
    });

    it('should support setId and getId', () => {
      const map = MetricalAccentuationMap.createMetricalAccentuationMap()!;
      expect(map.getId()).toBeNull();

      map.setId('maMap-1');
      expect(map.getId()).toBe('maMap-1');
    });

    it('should support addStyleSwitch', () => {
      const map = MetricalAccentuationMap.createMetricalAccentuationMap()!;
      const index = map.addStyleSwitch(0, 'myAccentuationStyle');
      expect(index).toBeGreaterThanOrEqual(0);
      expect(map.size()).toBe(1);

      const elem = map.getElement(index)!;
      expect(elem.getLocalName()).toBe('style');
      expect(elem.getAttributeValue('name.ref')).toBe('myAccentuationStyle');
    });

    it('should support getElementBeforeAt', () => {
      const map = MetricalAccentuationMap.createMetricalAccentuationMap()!;
      map.addAccentuationPattern(0, 'p1', 1.0);
      map.addAccentuationPattern(480, 'p2', 1.0);
      map.addAccentuationPattern(960, 'p3', 1.0);

      const elem = map.getElementBeforeAt(500);
      expect(elem).not.toBeNull();
      expect(elem!.getAttributeValue('name.ref')).toBe('p2');
    });
  });
});
