import { describe, it, expect } from 'vitest';
import { okValue } from '../../support/result.js';
import { MetricalAccentuationMap } from '../../../src/mpm/elements/maps/MetricalAccentuationMap.js';
import { Mpm } from '../../../src/mpm/Mpm.js';
import { GenericMap } from '../../../src/mpm/elements/maps/GenericMap.js';
import { Element, Attribute } from '../../../src/xml/XomTypes.js';

describe('MetricalAccentuationMap', () => {
  describe('createMetricalAccentuationMap', () => {
    it('should create an empty metrical accentuation map', () => {
      const map = MetricalAccentuationMap.createMetricalAccentuationMap();
      expect(map).not.toBeNull();
      expect(map!.getType()).toBe('metricalAccentuationMap');
    });

    it('should start with size 0', () => {
      const map = MetricalAccentuationMap.createMetricalAccentuationMap();
      expect(map.size()).toBe(0);
      expect(map.isEmpty()).toBe(true);
    });

    it('should have an XML element', () => {
      const map = MetricalAccentuationMap.createMetricalAccentuationMap();
      expect(map.getXml()).not.toBeNull();
      expect(map.getXml()!.getLocalName()).toBe('metricalAccentuationMap');
    });
  });

  describe('addAccentuationPattern', () => {
    it('should add an accentuation pattern with required parameters', () => {
      const map = MetricalAccentuationMap.createMetricalAccentuationMap();
      const index = map.addAccentuationPattern(0, 'myPattern', 1.0);
      expect(index).toBeGreaterThanOrEqual(0);
      expect(map.size()).toBe(1);
    });

    it('should store attributes correctly', () => {
      const map = MetricalAccentuationMap.createMetricalAccentuationMap();
      const index = map.addAccentuationPattern(0, 'myPattern', 1.5);
      const elem = map.getElement(index)!;

      expect(elem.getAttributeValue('date')).toBe('0');
      expect(elem.getAttributeValue('name.ref')).toBe('myPattern');
      expect(elem.getAttributeValue('scale')).toBe('1.5');
    });

    it('should store optional loop parameter', () => {
      const map = MetricalAccentuationMap.createMetricalAccentuationMap();
      const index = map.addAccentuationPattern(0, 'myPattern', 1.0, true);
      const elem = map.getElement(index)!;

      expect(elem.getAttributeValue('loop')).toBe('true');
    });

    it('should store optional stickToMeasures parameter', () => {
      const map = MetricalAccentuationMap.createMetricalAccentuationMap();
      const index = map.addAccentuationPattern(0, 'myPattern', 1.0, true, false);
      const elem = map.getElement(index)!;

      expect(elem.getAttributeValue('loop')).toBe('true');
      expect(elem.getAttributeValue('stickToMeasures')).toBe('false');
    });

    it('should maintain sorted order when adding out of order', () => {
      const map = MetricalAccentuationMap.createMetricalAccentuationMap();
      map.addAccentuationPattern(960, 'p3', 1.0);
      map.addAccentuationPattern(0, 'p1', 1.0);
      map.addAccentuationPattern(480, 'p2', 1.0);

      expect(map.size()).toBe(3);
      expect(map.getElement(0)!.getAttributeValue('date')).toBe('0');
      expect(map.getElement(1)!.getAttributeValue('date')).toBe('480');
      expect(map.getElement(2)!.getAttributeValue('date')).toBe('960');
    });

    it('should not add loop/stickToMeasures if not provided', () => {
      const map = MetricalAccentuationMap.createMetricalAccentuationMap();
      const index = map.addAccentuationPattern(0, 'myPattern', 1.0);
      const elem = map.getElement(index)!;

      expect(elem.getAttribute('loop')).toBeNull();
      expect(elem.getAttribute('stickToMeasures')).toBeNull();
    });
  });

  describe('getMetricalAccentuationDataOf', () => {
    it('should return null for an empty map', () => {
      const map = MetricalAccentuationMap.createMetricalAccentuationMap();
      expect(map.getMetricalAccentuationDataOf(0)).toBeNull();
    });

    it('should return null for negative index', () => {
      const map = MetricalAccentuationMap.createMetricalAccentuationMap();
      map.addAccentuationPattern(0, 'myPattern', 1.0);
      expect(map.getMetricalAccentuationDataOf(-1)).toBeNull();
    });

    it('should return null when no style is configured (style lookup fails)', () => {
      // With no `<style>` switch in scope there is no styleDef to resolve against, and the
      // reader answers null rather than a partly built datum.
      const map = MetricalAccentuationMap.createMetricalAccentuationMap();
      map.addAccentuationPattern(0, 'myPattern', 1.0);

      const result = map.getMetricalAccentuationDataOf(0);
      expect(result).toBeNull();
    });

    it('should handle out-of-bounds index by clamping', () => {
      const map = MetricalAccentuationMap.createMetricalAccentuationMap();
      map.addAccentuationPattern(0, 'myPattern', 1.0);

      // Still null: the clamped index lands on the same style-less instruction.
      const result = map.getMetricalAccentuationDataOf(100);
      expect(result).toBeNull();
    });
  });

  describe('getMetricalAccentuationDataOf reads the instruction', () => {
    // A `<style>` switch and a resolvable styleDef are both required: the reader returns
    // null when `getStyle` finds nothing, which the describe above already pins.
    const mapWith = (instructions: string): MetricalAccentuationMap => {
      const mpm = new Mpm(
        `<mpm xmlns="${Mpm.MPM_NAMESPACE}"><performance name="p" pulsesPerQuarter="720">` +
          '<global><header><metricalAccentuationStyles><styleDef name="s">' +
          '<accentuationPatternDef name="waltzPattern" length="3.0">' +
          '<accentuation beat="1.0" value="1.0" transitionTo="1.0" />' +
          '</accentuationPatternDef>' +
          '<accentuationPatternDef name="pattern" length="4.0">' +
          '<accentuation beat="1.0" value="1.0" transitionTo="1.0" />' +
          '</accentuationPatternDef>' +
          '</styleDef></metricalAccentuationStyles></header><dated>' +
          `<metricalAccentuationMap><style date="0.0" name.ref="s" />${instructions}` +
          '</metricalAccentuationMap></dated></global></performance></mpm>',
      );
      return mpm
        .getAllPerformances()[0]
        .getGlobal()!
        .getDated()!
        .getMap('metricalAccentuationMap') as MetricalAccentuationMap;
    };

    // Entry 0 is the <style> switch, so the first instruction is entry 1.
    it('reads date, name.ref, scale, loop and stickToMeasures off the instruction', () => {
      const md = mapWith(
        '<accentuationPattern date="240.0" name.ref="waltzPattern" scale="1.5"' +
          ' loop="true" stickToMeasures="false" />',
      ).getMetricalAccentuationDataOf(1)!;

      expect(md.startDate).toBe(240);
      expect(md.accentuationPatternDefName).toBe('waltzPattern');
      expect(md.scale).toBe(1.5);
      expect(md.loop).toBe(true);
      expect(md.stickToMeasures).toBe(false);
      // The def's own name, not merely a non-null def: this is what pins that the resolution
      // landed on the right one of the styleDef's two patterns.
      expect(md.accentuationPatternDef).not.toBeNull();
      expect(md.accentuationPatternDef?.getName()).toBe('waltzPattern');
    });

    it('reads loop=false when the attribute says so', () => {
      const md = mapWith(
        '<accentuationPattern date="0.0" name.ref="pattern" scale="1.0" loop="false" />',
      ).getMetricalAccentuationDataOf(1)!;
      expect(md.loop).toBe(false);
    });

    it('defaults loop to false and stickToMeasures to true when neither is present', () => {
      const md = mapWith(
        '<accentuationPattern date="0.0" name.ref="pattern" scale="1.0" />',
      ).getMetricalAccentuationDataOf(1)!;
      expect(md.loop).toBe(false);
      expect(md.stickToMeasures).toBe(true);
    });

    // Without this case the suite cannot tell reading the value from noticing the attribute's
    // presence: with only `stickToMeasures="false"` and the absent case, rewriting the read as
    // `md.stickToMeasures = stmAtt === null` stays green.
    it('reads stickToMeasures=true when the attribute says so, not merely by its absence', () => {
      const md = mapWith(
        '<accentuationPattern date="0.0" name.ref="pattern" scale="1.0" stickToMeasures="true" />',
      ).getMetricalAccentuationDataOf(1)!;
      expect(md.stickToMeasures).toBe(true);
    });

    /**
     * The reader does NOT require the def to resolve — and that is the parity-carrying
     * half of its contract, not an oversight.
     *
     * Java returns a datum with a null `accentuationPatternDef` here and
     * `renderMetricalAccentuationToMap` dereferences it unguarded, so the whole render dies
     * with a NullPointerException; `src/comparison/accentuationCurve.ts` reports the case as
     * `⊥` and distinguishes it from the silent skip an instruction with no `<style>` in
     * scope gets. Nothing else pins either half: a `return null` added to this reader — which
     * would turn the abort into a skip and render documents the reference refuses — leaves the
     * whole suite and `npm run gate` green.
     */
    it('returns a datum with a NULL def when the name does not resolve, rather than skipping', () => {
      const md = mapWith(
        '<accentuationPattern date="0.0" name.ref="nosuch" scale="1.0" />',
      ).getMetricalAccentuationDataOf(1);
      expect(md).not.toBeNull();
      expect(md!.accentuationPatternDefName).toBe('nosuch');
      expect(md!.accentuationPatternDef).toBeNull();
    });

    it('and the render then ABORTS on it, naming getLength, exactly as Java NPEs', () => {
      const map = mapWith('<accentuationPattern date="0.0" name.ref="nosuch" scale="1.0" />');
      const score = okValue(GenericMap.createGenericMap('score'));
      const note = new Element('note', Mpm.MPM_NAMESPACE);
      note.addAttribute(new Attribute('date', '0.0'));
      note.addAttribute(new Attribute('velocity', '64.0'));
      score.addElement(note);

      expect(() => map.renderMetricalAccentuationToMap(score, null, 720)).toThrow(/getLength/);
      // and the velocity is untouched, because the abort happens before any note is reached
      expect(note.getAttributeValue('velocity')).toBe('64.0');
    });

    it('renders velocity + accentuation * scale where the def DOES resolve', () => {
      const map = mapWith(
        '<accentuationPattern date="0.0" name.ref="pattern" scale="2.5" loop="true" />',
      );
      const score = okValue(GenericMap.createGenericMap('score'));
      const note = new Element('note', Mpm.MPM_NAMESPACE);
      note.addAttribute(new Attribute('date', '0.0'));
      note.addAttribute(new Attribute('velocity', '64.0'));
      score.addElement(note);

      map.renderMetricalAccentuationToMap(score, null, 720);
      // beat 1 of `pattern` accentuates by 1.0, scaled by 2.5
      expect(note.getAttributeValue('velocity')).toBe('66.5');
    });
  });

  describe('beat position calculation math', () => {
    // The beat arithmetic of `renderMetricalAccentuationToMap`, in ticks, beats 1-based:
    //   ticksPerBeat = 4.0 * ppq / denominator
    //   tickLengthOfOneMeasure = ticksPerBeat * numerator
    //   beat = 1.0 + ((date - tsDate) % wrap) / ticksPerBeat
    // where `wrap` is tickLengthOfOneMeasure for stickToMeasures=true and patternLengthTicks
    // for stickToMeasures=false.

    it('4/4 time, ppq=720: beat positions are computed correctly', () => {
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

      const computeBeat = (date: number) =>
        1.0 + ((date - tsDate) % tickLengthOfOneMeasure) / ticksPerBeat;

      expect(computeBeat(2880)).toBeCloseTo(1.0, 5);
      expect(computeBeat(3600)).toBeCloseTo(2.0, 5); // 3600 - 2880 = 720
    });

    it('stickToMeasures=false wraps within pattern length', () => {
      const ppq = 720;
      const ppq4 = 4.0 * ppq;
      const denominator = 4;
      const ticksPerBeat = ppq4 / denominator;
      const tsDate = 0;

      // `accentuationPatternDef.getLength()` is in quarter notes; a length of 2.0 is
      // (2.0 * ppq4) / denominator = 1440 ticks.
      const patternLength = 2.0;
      const patternLengthTicks = (patternLength * ppq4) / denominator;

      expect(patternLengthTicks).toBe(1440);

      const computeBeat = (date: number) =>
        1.0 + ((date - tsDate) % patternLengthTicks) / ticksPerBeat;

      expect(computeBeat(0)).toBeCloseTo(1.0, 5);
      expect(computeBeat(720)).toBeCloseTo(2.0, 5);
      expect(computeBeat(1440)).toBeCloseTo(1.0, 5); // wraps at pattern length, not measure
    });

    it('accentuation application formula: velocity + (accentuation * scale)', () => {
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
      const tsDate = 1440;

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

  describe('GenericMap operations', () => {
    it('should support removeElement by index', () => {
      const map = MetricalAccentuationMap.createMetricalAccentuationMap();
      map.addAccentuationPattern(0, 'p1', 1.0);
      map.addAccentuationPattern(960, 'p2', 2.0);

      map.removeElementAt(0);
      expect(map.size()).toBe(1);
      expect(map.getElement(0)!.getAttributeValue('name.ref')).toBe('p2');
    });

    it('should support setId and getId', () => {
      const map = MetricalAccentuationMap.createMetricalAccentuationMap();
      expect(map.getId()).toBeNull();

      map.setId('maMap-1');
      expect(map.getId()).toBe('maMap-1');
    });

    it('should support addStyleSwitch', () => {
      const map = MetricalAccentuationMap.createMetricalAccentuationMap();
      const index = map.addStyleSwitch(0, 'myAccentuationStyle');
      expect(index).toBeGreaterThanOrEqual(0);
      expect(map.size()).toBe(1);

      const elem = map.getElement(index)!;
      expect(elem.getLocalName()).toBe('style');
      expect(elem.getAttributeValue('name.ref')).toBe('myAccentuationStyle');
    });

    it('should support getElementBeforeAt', () => {
      const map = MetricalAccentuationMap.createMetricalAccentuationMap();
      map.addAccentuationPattern(0, 'p1', 1.0);
      map.addAccentuationPattern(480, 'p2', 1.0);
      map.addAccentuationPattern(960, 'p3', 1.0);

      const elem = map.getElementBeforeAt(500);
      expect(elem).not.toBeNull();
      expect(elem!.getAttributeValue('name.ref')).toBe('p2');
    });
  });
});
