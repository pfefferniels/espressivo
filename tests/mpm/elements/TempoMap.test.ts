import { describe, it, expect } from 'vitest';
import { okValue } from '../../support/result.js';
import { TempoMap } from '../../../src/mpm/elements/maps/TempoMap.js';
import { TempoData } from '../../../src/mpm/elements/maps/data/TempoData.js';
import {
  resolveTempo,
  type ConstantTempo,
  type Tempo,
  type TransitioningTempo,
} from '../../../src/mpm/elements/maps/data/tempo.js';
import { GenericMap } from '../../../src/mpm/elements/maps/GenericMap.js';
import { Element, Attribute } from '../../../src/xml/XomTypes.js';

/**
 * Narrow a read tempo to the transitioning arm, failing the test if it is not one.
 *
 * Stands in for the `td.isConstantTempo()` assertions the old tests made: the predicate is
 * now the discriminant, so "is a transition" and "has a `transitionTo` to read" are one
 * check instead of two, and the second one no longer needs a `!`.
 */
function expectTransitioning(tempo: Tempo | null): TransitioningTempo {
  if (tempo === null || tempo.kind !== 'transitioning')
    throw new Error(`expected a transitioning tempo, got ${JSON.stringify(tempo)}`);
  return tempo;
}

/** As {@link expectTransitioning}, for the constant arm. */
function expectConstant(tempo: Tempo | null): ConstantTempo {
  if (tempo === null || tempo.kind !== 'constant')
    throw new Error(`expected a constant tempo, got ${JSON.stringify(tempo)}`);
  return tempo;
}

/**
 * A constant tempo built by hand, for the millisecond computations that take one directly.
 *
 * `endDate` defaults to `Number.MAX_VALUE` — what `GenericMap.nextDateOfType` answers for a
 * last instruction, and what the constant-tempo formula ignores.
 */
function constantTempo(o: {
  startDate: number;
  endDate?: number;
  beatLength: number;
  bpm: number;
}): ConstantTempo {
  return {
    kind: 'constant',
    startDate: o.startDate,
    endDate: o.endDate ?? Number.MAX_VALUE,
    beatLength: o.beatLength,
    bpmString: String(o.bpm),
    bpm: o.bpm,
  };
}

/** A transitioning tempo built by hand, for the Simpson's-rule tests. */
function transitioningTempo(o: {
  startDate: number;
  endDate: number;
  beatLength: number;
  bpm: number;
  transitionTo: number;
  meanTempoAt: number;
  exponent: number;
}): TransitioningTempo {
  return {
    kind: 'transitioning',
    startDate: o.startDate,
    endDate: o.endDate,
    beatLength: o.beatLength,
    bpmString: String(o.bpm),
    bpm: o.bpm,
    transitionToString: String(o.transitionTo),
    transitionTo: o.transitionTo,
    meanTempoAt: o.meanTempoAt,
    exponent: o.exponent,
  };
}

// ==========================================================================
//  TempoMap Tests
// ==========================================================================
describe('TempoMap', () => {
  // ---------------------------------------------------------------
  //  Construction
  // ---------------------------------------------------------------
  describe('createTempoMap', () => {
    it('should create an empty tempo map', () => {
      const map = TempoMap.createTempoMap();
      expect(map).not.toBeNull();
      expect(map!.getType()).toBe('tempoMap');
    });

    it('should start with size 0', () => {
      const map = TempoMap.createTempoMap();
      expect(map.size()).toBe(0);
      expect(map.isEmpty()).toBe(true);
    });

    it('should have an XML element', () => {
      const map = TempoMap.createTempoMap();
      expect(map.getXml()).not.toBeNull();
      expect(map.getXml()!.getLocalName()).toBe('tempoMap');
    });
  });

  // ---------------------------------------------------------------
  //  addTempo
  // ---------------------------------------------------------------
  describe('addTempo', () => {
    it('should add a constant tempo instruction', () => {
      const map = TempoMap.createTempoMap();
      const index = map.addTempo(0, '120', 0.25);
      expect(index).toBeGreaterThanOrEqual(0);
      expect(map.size()).toBe(1);
    });

    it('should add tempo at the correct date', () => {
      const map = TempoMap.createTempoMap();
      map.addTempo(0, '100', 0.25);
      map.addTempo(960, '140', 0.25);

      expect(map.size()).toBe(2);
      expect(map.getFirstElement()!.getAttributeValue('date')).toBe('0');
      expect(map.getFirstElement()!.getAttributeValue('bpm')).toBe('100');
      expect(map.getLastElement()!.getAttributeValue('date')).toBe('960');
      expect(map.getLastElement()!.getAttributeValue('bpm')).toBe('140');
    });

    it('should add a tempo with transition', () => {
      const map = TempoMap.createTempoMap();
      const index = map.addTempo(0, '120', '140', 0.25, 0.5);
      expect(index).toBeGreaterThanOrEqual(0);

      const elem = map.getElement(index)!;
      expect(elem.getAttributeValue('bpm')).toBe('120');
      expect(elem.getAttributeValue('transition.to')).toBe('140');
      expect(elem.getAttributeValue('meanTempoAt')).toBe('0.5');
      expect(elem.getAttributeValue('beatLength')).toBe('0.25');
    });

    it('should add a tempo with transition and id', () => {
      const map = TempoMap.createTempoMap();
      const index = map.addTempo(0, '120', '140', 0.25, 0.5, 'tempo-1');

      const elem = map.getElement(index)!;
      const idAttr = elem.getAttribute('id', 'http://www.w3.org/XML/1998/namespace');
      expect(idAttr).not.toBeNull();
      expect(idAttr!.getValue()).toBe('tempo-1');
    });

    it('should add a tempo from TempoData', () => {
      const map = TempoMap.createTempoMap();
      const td = new TempoData();
      td.startDate = 0;
      td.bpm = 120;
      td.bpmString = '120';
      td.beatLength = 0.25;

      const index = map.addTempo(td);
      expect(index).toBeGreaterThanOrEqual(0);
      expect(map.size()).toBe(1);
    });

    it('should add TempoData with transition', () => {
      const map = TempoMap.createTempoMap();
      const td = new TempoData();
      td.startDate = 0;
      td.bpm = 60;
      td.bpmString = '60';
      td.transitionTo = 120;
      td.transitionToString = '120';
      td.beatLength = 0.25;
      td.meanTempoAt = 0.5;

      const index = map.addTempo(td);
      const elem = map.getElement(index)!;
      expect(elem.getAttributeValue('bpm')).toBe('60');
      expect(elem.getAttributeValue('transition.to')).toBe('120');
      expect(elem.getAttributeValue('meanTempoAt')).toBe('0.5');
    });

    it('should maintain sorted order when adding out of order', () => {
      const map = TempoMap.createTempoMap();
      map.addTempo(960, '140', 0.25);
      map.addTempo(0, '100', 0.25);
      map.addTempo(480, '120', 0.25);

      expect(map.size()).toBe(3);
      expect(map.getElement(0)!.getAttributeValue('date')).toBe('0');
      expect(map.getElement(1)!.getAttributeValue('date')).toBe('480');
      expect(map.getElement(2)!.getAttributeValue('date')).toBe('960');
    });
  });

  // ---------------------------------------------------------------
  //  getTempoDataOf
  // ---------------------------------------------------------------
  describe('getTempoDataOf', () => {
    it('should return null for an empty map', () => {
      const map = TempoMap.createTempoMap();
      expect(map.getTempoDataOf(0)).toBeNull();
    });

    it('should return null for negative index', () => {
      const map = TempoMap.createTempoMap();
      map.addTempo(0, '120', 0.25);
      expect(map.getTempoDataOf(-1)).toBeNull();
    });

    it('should return TempoData for a valid constant tempo', () => {
      const map = TempoMap.createTempoMap();
      map.addTempo(0, '120', 0.25);

      const td = map.getTempoDataOf(0)!;
      expect(td).not.toBeNull();
      expect(td.startDate).toBe(0);
      expect(td.bpm).toBe(120);
      expect(td.beatLength).toBe(0.25);
      expect(td.bpmString).toBe('120');
    });

    it('should detect a constant tempo correctly', () => {
      const map = TempoMap.createTempoMap();
      map.addTempo(0, '120', 0.25);

      const td = expectConstant(map.getTempoDataOf(0));
      // The old assertion was `isConstantTempo() === true` plus `transitionTo === null`.
      // On the constant arm there is no `transitionTo` to be null, which the second
      // assertion now checks structurally rather than by value.
      expect(td.kind).toBe('constant');
      expect('transitionTo' in td).toBe(false);
    });

    it('should handle out-of-bounds index by clamping', () => {
      const map = TempoMap.createTempoMap();
      map.addTempo(0, '120', 0.25);

      const td = map.getTempoDataOf(100);
      expect(td).not.toBeNull();
      expect(td!.bpm).toBe(120);
    });

    it('should set endDate to MAX_VALUE for the last tempo instruction', () => {
      const map = TempoMap.createTempoMap();
      map.addTempo(0, '120', 0.25);

      const td = map.getTempoDataOf(0)!;
      expect(td.endDate).toBe(Number.MAX_VALUE);
    });

    it('should set endDate to the start of the next tempo instruction', () => {
      const map = TempoMap.createTempoMap();
      map.addTempo(0, '100', 0.25);
      map.addTempo(960, '140', 0.25);

      const td = map.getTempoDataOf(0)!;
      expect(td.endDate).toBe(960);
    });

    it('should retrieve multiple tempo instructions', () => {
      const map = TempoMap.createTempoMap();
      map.addTempo(0, '100', 0.25);
      map.addTempo(480, '120', 0.25);
      map.addTempo(960, '140', 0.25);

      const td0 = map.getTempoDataOf(0)!;
      expect(td0.bpm).toBe(100);
      expect(td0.endDate).toBe(480);

      const td1 = map.getTempoDataOf(1)!;
      expect(td1.bpm).toBe(120);
      expect(td1.endDate).toBe(960);

      const td2 = map.getTempoDataOf(2)!;
      expect(td2.bpm).toBe(140);
      expect(td2.endDate).toBe(Number.MAX_VALUE);
    });

    it('should correctly parse a transition tempo instruction', () => {
      const map = TempoMap.createTempoMap();
      map.addTempo(0, '60', '120', 0.25, 0.5);
      map.addTempo(720, '120', 0.25); // endpoint

      const td = expectTransitioning(map.getTempoDataOf(0));
      expect(td.bpm).toBe(60);
      expect(td.transitionTo).toBe(120);
      expect(td.meanTempoAt).toBe(0.5);
      expect(td.endDate).toBe(720);
    });

    it('should set exponent to 1.0 for meanTempoAt = 0.5 (linear)', () => {
      const map = TempoMap.createTempoMap();
      map.addTempo(0, '60', '120', 0.25, 0.5);
      map.addTempo(720, '120', 0.25);

      const td = expectTransitioning(map.getTempoDataOf(0));
      expect(td.exponent).toBeCloseTo(1.0, 10);
    });

    it('should convert to constant tempo if transitionTo equals bpm', () => {
      const map = TempoMap.createTempoMap();
      map.addTempo(0, '120', '120', 0.25, 0.5);

      // the transition is dropped since the target equals the tempo
      const td = expectConstant(map.getTempoDataOf(0));
      expect(td.bpm).toBe(120);
    });

    it('should convert to constant bpm at transitionTo when meanTempoAt <= 0', () => {
      const map = TempoMap.createTempoMap();
      map.addTempo(0, '60', '120', 0.25, 0);

      // meanTempoAt <= 0 means: instantly jump to transitionTo, and stay there — the
      // target becomes the tempo, in both its numeric and its written form.
      const td = expectConstant(map.getTempoDataOf(0));
      expect(td.bpm).toBe(120);
      expect(td.bpmString).toBe('120');
    });

    it('should convert to constant bpm at original bpm when meanTempoAt >= 1', () => {
      const map = TempoMap.createTempoMap();
      map.addTempo(0, '60', '120', 0.25, 1.0);

      // meanTempoAt >= 1 means: never reach transitionTo, stay at bpm
      const td = expectConstant(map.getTempoDataOf(0));
      expect(td.bpm).toBe(60);
      expect(td.bpmString).toBe('60');
    });

    it('should set default meanTempoAt to 0.5 when transition has no meanTempoAt attribute', () => {
      const map = TempoMap.createTempoMap();
      // Manually create a tempo element with transition.to but NO meanTempoAt
      const e = new Element('tempo', 'http://www.cemfi.de/mpm/ns/1.0');
      e.addAttribute(new Attribute('date', '0'));
      e.addAttribute(new Attribute('bpm', '60'));
      e.addAttribute(new Attribute('transition.to', '120'));
      e.addAttribute(new Attribute('beatLength', '0.25'));
      map.addElement(e);
      map.addTempo(720, '120', 0.25);

      const td = expectTransitioning(map.getTempoDataOf(0));
      expect(td.meanTempoAt).toBe(0.5);
      expect(td.exponent).toBeCloseTo(1.0, 10);
    });
  });

  // ---------------------------------------------------------------
  //  computeExponent (tested indirectly via getTempoDataOf)
  // ---------------------------------------------------------------
  describe('computeExponent', () => {
    it('exponent for meanTempoAt=0.5 is exactly 1.0', () => {
      const map = TempoMap.createTempoMap();
      map.addTempo(0, '60', '120', 0.25, 0.5);
      map.addTempo(720, '120', 0.25);

      const td = expectTransitioning(map.getTempoDataOf(0));
      // ln(0.5)/ln(0.5) = 1.0
      expect(td.exponent).toBeCloseTo(1.0, 10);
    });

    it('exponent for meanTempoAt=0.3 is ln(0.5)/ln(0.3)', () => {
      const map = TempoMap.createTempoMap();
      map.addTempo(0, '60', '120', 0.25, 0.3);
      map.addTempo(720, '120', 0.25);

      const td = expectTransitioning(map.getTempoDataOf(0));
      const expected = Math.log(0.5) / Math.log(0.3);
      expect(td.exponent).toBeCloseTo(expected, 10);
      // Verify the approximate value (ln(0.5)/ln(0.3) ≈ 0.57571...)
      expect(td.exponent).toBeGreaterThan(0.57);
      expect(td.exponent).toBeLessThan(0.58);
    });

    it('exponent for meanTempoAt=0.7 is ln(0.5)/ln(0.7)', () => {
      const map = TempoMap.createTempoMap();
      map.addTempo(0, '60', '120', 0.25, 0.7);
      map.addTempo(720, '120', 0.25);

      const td = expectTransitioning(map.getTempoDataOf(0));
      const expected = Math.log(0.5) / Math.log(0.7);
      expect(td.exponent).toBeCloseTo(expected, 10);
      // Verify the approximate value (ln(0.5)/ln(0.7) ≈ 1.9433...)
      expect(td.exponent).toBeGreaterThan(1.94);
      expect(td.exponent).toBeLessThan(1.95);
    });

    it('exponent for meanTempoAt=0.1', () => {
      const map = TempoMap.createTempoMap();
      map.addTempo(0, '60', '120', 0.25, 0.1);
      map.addTempo(720, '120', 0.25);

      const td = expectTransitioning(map.getTempoDataOf(0));
      const expected = Math.log(0.5) / Math.log(0.1);
      expect(td.exponent).toBeCloseTo(expected, 10);
    });

    it('exponent for meanTempoAt=0.9', () => {
      const map = TempoMap.createTempoMap();
      map.addTempo(0, '60', '120', 0.25, 0.9);
      map.addTempo(720, '120', 0.25);

      const td = expectTransitioning(map.getTempoDataOf(0));
      const expected = Math.log(0.5) / Math.log(0.9);
      expect(td.exponent).toBeCloseTo(expected, 10);
    });
  });

  // ---------------------------------------------------------------
  //  getTempoAt
  // ---------------------------------------------------------------
  describe('getTempoAt', () => {
    it('returns 100 bpm default for an empty map', () => {
      const map = TempoMap.createTempoMap();
      expect(map.getTempoAt(0)).toBe(100.0);
      expect(map.getTempoAt(500)).toBe(100.0);
    });

    it('returns constant bpm for dates strictly after the tempo instruction', () => {
      const map = TempoMap.createTempoMap();
      map.addTempo(0, '120', 0.25);

      // getTempoAt uses getElementIndexBefore (strictly before), so at date=0
      // there is nothing strictly before 0, and getTempoDataAt returns null -> default 100.
      expect(map.getTempoAt(0)).toBe(100.0); // default: nothing strictly before date 0
      expect(map.getTempoAt(1)).toBe(120.0);
      expect(map.getTempoAt(500)).toBe(120.0);
      expect(map.getTempoAt(10000)).toBe(120.0);
    });

    it('returns bpm at startDate for transition', () => {
      const map = TempoMap.createTempoMap();
      map.addTempo(0, '60', '120', 0.25, 0.5);
      map.addTempo(720, '120', 0.25);

      // At the very start of the transition, tempo should be 60 bpm
      // getTempoAt uses getElementIndexBefore which is strictly before, so at date=0 there is no tempo before it.
      // The getTempoDataAt method iterates backward from getElementIndexBefore(date) which for date 0 returns -1.
      // Then getTempoDataOf(-1) returns null, so it defaults to 100.
      // Actually, looking at the code: for i = -1 it calls getTempoDataOf(-1) which returns null. The loop starts at i = getElementIndexBefore(0) = -1, goes down to -1. So it calls getTempoDataOf(-1) once, gets null, and the loop ends.
      // This means at date=0 with the first tempo at date=0, getTempoAt(0) returns 100.0 (default)!
      // That's because getElementIndexBefore(0) returns -1 (no element STRICTLY before 0).
      // At date=1, getElementIndexBefore(1) returns 0, so it would find the tempo.
      // This is the expected behavior for this implementation.
      expect(map.getTempoAt(0)).toBe(100.0); // default because nothing strictly before date 0
    });

    it('returns the transition tempo at midpoint for linear transition (meanTempoAt=0.5)', () => {
      const map = TempoMap.createTempoMap();
      map.addTempo(0, '60', '120', 0.25, 0.5);
      map.addTempo(720, '120', 0.25);

      // At midpoint (date=360), with linear exponent 1.0:
      // result = (360 - 0) / (720 - 0) = 0.5
      // result = pow(0.5, 1.0) = 0.5
      // tempo = 0.5 * (120 - 60) + 60 = 0.5 * 60 + 60 = 90
      expect(map.getTempoAt(360)).toBeCloseTo(90.0, 5);
    });

    it('returns transitionTo at endDate for transition', () => {
      const map = TempoMap.createTempoMap();
      map.addTempo(0, '60', '120', 0.25, 0.5);
      map.addTempo(720, '120', 0.25);

      // At the endDate (720), getTempoAtStatic returns transitionTo
      // But getTempoAt(720) uses getElementIndexBefore(720) which returns 1 (the tempo at 720),
      // then getTempoDataOf(1) gives the second tempo instruction (120 bpm constant).
      // So it returns 120. Actually, let's verify through the code path:
      // getElementIndexBefore(720) finds element strictly before 720. Elements are at 0 and 720.
      // Element at index 0 has key 0 < 720, element at index 1 has key 720 = 720 (not < 720).
      // So getElementIndexBefore(720) = 0.
      // getTempoDataOf(0) is the first tempo (60->120 transition, endDate=720).
      // getTempoAtStatic(720, td): date == td.endDate, so returns td.transitionTo = 120.
      expect(map.getTempoAt(720)).toBeCloseTo(120.0, 5);
    });

    it('returns correct tempo for accelerando (meanTempoAt=0.3)', () => {
      const map = TempoMap.createTempoMap();
      map.addTempo(0, '60', '120', 0.25, 0.3);
      map.addTempo(720, '120', 0.25);

      // At midpoint (360):
      // result = (360-0)/(720-0) = 0.5
      // exponent = ln(0.5)/ln(0.3) ≈ 0.5753641
      // result = pow(0.5, 0.5753641) ≈ 0.672...
      // tempo = 0.672 * (120-60) + 60 = 0.672 * 60 + 60 ≈ 100.3
      // With meanTempoAt < 0.5, the curve reaches the mean tempo earlier,
      // so at midpoint, the tempo should be closer to transitionTo (120).
      const exponent = Math.log(0.5) / Math.log(0.3);
      const t = Math.pow(0.5, exponent);
      const expectedTempo = t * (120 - 60) + 60;
      expect(map.getTempoAt(360)).toBeCloseTo(expectedTempo, 3);
      // The tempo at midpoint should be > 90 (the linear midpoint)
      expect(map.getTempoAt(360)).toBeGreaterThan(90.0);
    });

    it('returns correct tempo for ritardando (meanTempoAt=0.7)', () => {
      const map = TempoMap.createTempoMap();
      map.addTempo(0, '60', '120', 0.25, 0.7);
      map.addTempo(720, '120', 0.25);

      // At midpoint:
      // exponent = ln(0.5)/ln(0.7) ≈ 1.9434164
      // result = pow(0.5, 1.943) ≈ 0.260
      // tempo = 0.260 * 60 + 60 ≈ 75.6
      // With meanTempoAt > 0.5, the curve reaches the mean later, so
      // at midpoint the tempo is closer to startBpm (60).
      const exponent = Math.log(0.5) / Math.log(0.7);
      const t = Math.pow(0.5, exponent);
      const expectedTempo = t * (120 - 60) + 60;
      expect(map.getTempoAt(360)).toBeCloseTo(expectedTempo, 3);
      // The tempo at midpoint should be < 90 (the linear midpoint)
      expect(map.getTempoAt(360)).toBeLessThan(90.0);
    });

    it('handles multiple tempo instructions with correct lookup', () => {
      const map = TempoMap.createTempoMap();
      map.addTempo(0, '100', 0.25);
      map.addTempo(480, '140', 0.25);
      map.addTempo(960, '80', 0.25);

      // Date 240 is in the first tempo region (100 bpm constant)
      expect(map.getTempoAt(240)).toBe(100.0);
      // Date 720 is in the second tempo region (140 bpm constant)
      expect(map.getTempoAt(720)).toBe(140.0);
      // Date 1200 is in the third tempo region (80 bpm constant)
      expect(map.getTempoAt(1200)).toBe(80.0);
    });
  });

  // ---------------------------------------------------------------
  //  computeMillisecondsForConstantTempo
  // ---------------------------------------------------------------
  describe('computeMillisecondsForConstantTempo (via computeDiffTiming)', () => {
    // Formula: (15000 * (date - startDate)) / (bpm * beatLength * ppq)
    // For quarter-note basis (beatLength = 0.25):
    //   ms = (15000 * date) / (bpm * 0.25 * ppq)

    it('120 bpm, ppq=720, date=720: should be 500ms', () => {
      // 15000 * (720-0) / (120 * 0.25 * 720) = 15000 * 720 / (21600) = 10800000 / 21600 = 500
      const td = constantTempo({ startDate: 0, bpm: 120, beatLength: 0.25 });

      const ms = TempoMap.computeDiffTiming(720, 720, td);
      expect(ms).toBeCloseTo(500.0, 10);
    });

    it('120 bpm, ppq=720, date=1440: should be 1000ms', () => {
      const td = constantTempo({ startDate: 0, bpm: 120, beatLength: 0.25 });

      const ms = TempoMap.computeDiffTiming(1440, 720, td);
      expect(ms).toBeCloseTo(1000.0, 10);
    });

    it('120 bpm, ppq=720, date=0: should be 0ms', () => {
      const td = constantTempo({ startDate: 0, bpm: 120, beatLength: 0.25 });

      const ms = TempoMap.computeDiffTiming(0, 720, td);
      expect(ms).toBeCloseTo(0.0, 10);
    });

    it('60 bpm, ppq=720, date=720: one beat at 60bpm = 1000ms', () => {
      // 15000 * 720 / (60 * 0.25 * 720) = 10800000 / 10800 = 1000
      const td = constantTempo({ startDate: 0, bpm: 60, beatLength: 0.25 });

      const ms = TempoMap.computeDiffTiming(720, 720, td);
      expect(ms).toBeCloseTo(1000.0, 10);
    });

    it('240 bpm, ppq=720, date=720: one beat at 240bpm = 250ms', () => {
      const td = constantTempo({ startDate: 0, bpm: 240, beatLength: 0.25 });

      const ms = TempoMap.computeDiffTiming(720, 720, td);
      expect(ms).toBeCloseTo(250.0, 10);
    });

    it('120 bpm, ppq=480, date=480: should be 500ms (standard MIDI ppq)', () => {
      // 15000 * 480 / (120 * 0.25 * 480) = 7200000 / 14400 = 500
      const td = constantTempo({ startDate: 0, bpm: 120, beatLength: 0.25 });

      const ms = TempoMap.computeDiffTiming(480, 480, td);
      expect(ms).toBeCloseTo(500.0, 10);
    });

    it('half-note basis (beatLength=0.5), 120 bpm, ppq=720, date=1440: 500ms', () => {
      // beatLength 0.5 = half note. 120 half-notes per minute = 2 half-notes per second.
      // 1440 ticks = 2 quarter notes = 1 half note at ppq=720.
      // 1 half note at 120 halves/min = 0.5 sec = 500ms.
      // Formula: 15000 * 1440 / (120 * 0.5 * 720) = 21600000 / 43200 = 500
      const td = constantTempo({ startDate: 0, bpm: 120, beatLength: 0.5 });

      const ms = TempoMap.computeDiffTiming(1440, 720, td);
      expect(ms).toBeCloseTo(500.0, 10);
    });

    it('non-zero startDate: offset is subtracted', () => {
      // With startDate=360, date=1080: effective duration = 720 ticks
      // 15000 * (1080-360) / (120 * 0.25 * 720) = 15000*720/21600 = 500
      const td = constantTempo({ startDate: 360, bpm: 120, beatLength: 0.25 });

      const ms = TempoMap.computeDiffTiming(1080, 720, td);
      expect(ms).toBeCloseTo(500.0, 10);
    });
  });

  // ---------------------------------------------------------------
  //  computeMillisecondsForNoTempo (null tempoData)
  // ---------------------------------------------------------------
  describe('computeDiffTiming with null tempoData (no tempo = 100 bpm default)', () => {
    // Formula for no tempo: (600 * date) / ppq
    // This is equivalent to 100 bpm with quarter-note basis:
    // ms = (15000 * date) / (100 * 0.25 * ppq) = (15000 * date) / (25 * ppq) = (600 * date) / ppq

    it('ppq=720, date=720: should be 600ms', () => {
      const ms = TempoMap.computeDiffTiming(720, 720, null);
      expect(ms).toBeCloseTo(600.0, 10);
    });

    it('ppq=720, date=0: should be 0ms', () => {
      const ms = TempoMap.computeDiffTiming(0, 720, null);
      expect(ms).toBeCloseTo(0.0, 10);
    });

    it('ppq=720, date=1440: should be 1200ms', () => {
      const ms = TempoMap.computeDiffTiming(1440, 720, null);
      expect(ms).toBeCloseTo(1200.0, 10);
    });

    it('ppq=480, date=480: should be 600ms', () => {
      const ms = TempoMap.computeDiffTiming(480, 480, null);
      expect(ms).toBeCloseTo(600.0, 10);
    });
  });

  // ---------------------------------------------------------------
  //  computeMillisecondsForTempoTransition (Simpson's rule)
  // ---------------------------------------------------------------
  describe('computeMillisecondsForTempoTransition (via computeDiffTiming)', () => {
    it('linear transition 60->120 bpm over 720 ticks at ppq=720, verify with analytical', () => {
      // For a linear transition (exponent=1.0), the tempo at tick t is:
      //   bpm(t) = 60 + (120-60)*(t/720) = 60 + 60*t/720
      //
      // The time to traverse from 0 to 720 ticks is:
      //   integral from 0 to 720 of (1/bpm(t)) * (15000 / (beatLength * ppq)) dt
      //   = (15000 / (0.25 * 720)) * integral from 0 to 720 of 1/(60 + 60*t/720) dt
      //
      // Let u = 60 + 60*t/720, du = (60/720) dt, dt = 720/60 du = 12 du
      // When t=0: u=60; t=720: u=120
      // integral = 12 * integral from 60 to 120 of 1/u du = 12 * ln(120/60) = 12 * ln(2)
      //
      // ms = (15000 / 180) * 12 * ln(2) = (15000 * 12 * ln(2)) / 180
      //    = (180000 * ln(2)) / 180 = 1000 * ln(2) ≈ 693.147...
      const td = transitioningTempo({
        startDate: 0,
        endDate: 720,
        bpm: 60,
        transitionTo: 120,
        beatLength: 0.25,
        meanTempoAt: 0.5,
        exponent: 1.0,
      });

      const ms = TempoMap.computeDiffTiming(720, 720, td);
      const analytical = 1000.0 * Math.log(2);
      // Simpson's rule should be very close to the analytical result
      expect(ms).toBeCloseTo(analytical, 0);
      // More precisely, within 1ms
      expect(Math.abs(ms - analytical)).toBeLessThan(1.0);
    });

    it('linear transition 120->60 bpm (deceleration) over 720 ticks at ppq=720', () => {
      // By symmetry of the integral, same total time as 60->120
      // integral of 1/(120 - 60*t/720) from 0 to 720
      // = integral of 1/(120(1 - t/1440)) from 0 to 720
      // Let u = 120 - 60*t/720, du = -60/720 dt, dt = -12 du
      // When t=0: u=120; t=720: u=60
      // integral = -12 * integral from 120 to 60 of 1/u du = 12 * ln(120/60) = 12 * ln(2)
      // Same result: ms = 1000 * ln(2)
      const td = transitioningTempo({
        startDate: 0,
        endDate: 720,
        bpm: 120,
        transitionTo: 60,
        beatLength: 0.25,
        meanTempoAt: 0.5,
        exponent: 1.0,
      });

      const ms = TempoMap.computeDiffTiming(720, 720, td);
      const analytical = 1000.0 * Math.log(2);
      expect(ms).toBeCloseTo(analytical, 0);
      expect(Math.abs(ms - analytical)).toBeLessThan(1.0);
    });

    it('partial transition: linear 60->120 bpm, compute at midpoint (date=360)', () => {
      // At the midpoint of a linear transition, tempo = 90 bpm.
      // integral from 0 to 360 of 1/(60 + 60*t/720) dt * (15000/(0.25*720))
      // = (15000/180) * integral from 0 to 360 of 1/(60+t/12) dt
      // Let u = 60+t/12, du = 1/12 dt, dt = 12 du
      // When t=0: u=60; t=360: u=60+30=90
      // = (15000/180) * 12 * integral from 60 to 90 of 1/u du
      // = (15000/180) * 12 * ln(90/60) = 1000 * ln(1.5)
      // ≈ 1000 * 0.405465... ≈ 405.465
      const td = transitioningTempo({
        startDate: 0,
        endDate: 720,
        bpm: 60,
        transitionTo: 120,
        beatLength: 0.25,
        meanTempoAt: 0.5,
        exponent: 1.0,
      });

      const ms = TempoMap.computeDiffTiming(360, 720, td);
      const analytical = 1000.0 * Math.log(1.5);
      expect(ms).toBeCloseTo(analytical, 0);
    });

    it('non-linear transition with meanTempoAt=0.3, endDate to full', () => {
      // No simple analytical form, but we can verify:
      // 1) The result is positive
      // 2) The result is different from the linear case
      const td = transitioningTempo({
        startDate: 0,
        endDate: 720,
        bpm: 60,
        transitionTo: 120,
        beatLength: 0.25,
        meanTempoAt: 0.3,
        exponent: Math.log(0.5) / Math.log(0.3),
      });

      const msNonLinear = TempoMap.computeDiffTiming(720, 720, td);
      expect(msNonLinear).toBeGreaterThan(0);

      // Compare with linear
      const tdLinear = transitioningTempo({
        startDate: 0,
        endDate: 720,
        bpm: 60,
        transitionTo: 120,
        beatLength: 0.25,
        meanTempoAt: 0.5,
        exponent: 1.0,
      });

      const msLinear = TempoMap.computeDiffTiming(720, 720, tdLinear);
      // With meanTempoAt < 0.5, tempo rises faster, so total time should be less
      expect(msNonLinear).toBeLessThan(msLinear);
    });

    it('non-linear transition with meanTempoAt=0.7, total time should be more than linear', () => {
      const td = transitioningTempo({
        startDate: 0,
        endDate: 720,
        bpm: 60,
        transitionTo: 120,
        beatLength: 0.25,
        meanTempoAt: 0.7,
        exponent: Math.log(0.5) / Math.log(0.7),
      });

      const msNonLinear = TempoMap.computeDiffTiming(720, 720, td);

      const tdLinear = transitioningTempo({
        startDate: 0,
        endDate: 720,
        bpm: 60,
        transitionTo: 120,
        beatLength: 0.25,
        meanTempoAt: 0.5,
        exponent: 1.0,
      });

      const msLinear = TempoMap.computeDiffTiming(720, 720, tdLinear);
      // With meanTempoAt > 0.5, tempo rises slower, so total time should be more
      expect(msNonLinear).toBeGreaterThan(msLinear);
    });

    it('Simpson rule precision for constant-like transition (same bpm values)', () => {
      // If bpm == transitionTo the reader builds the constant arm, so a datum built by
      // hand with a very small difference is what exercises the integration path.
      const td = transitioningTempo({
        startDate: 0,
        endDate: 720,
        bpm: 120,
        transitionTo: 120.001,
        beatLength: 0.25,
        meanTempoAt: 0.5,
        exponent: 1.0,
      });

      const ms = TempoMap.computeDiffTiming(720, 720, td);
      // Should be very close to constant 120 bpm: 500ms
      expect(ms).toBeCloseTo(500.0, 0);
    });
  });

  // ---------------------------------------------------------------
  //  TempoData
  // ---------------------------------------------------------------
  describe('TempoData', () => {
    it('default values', () => {
      const td = new TempoData();
      expect(td.startDate).toBe(0);
      expect(td.endDate).toBeNull();
      expect(td.bpm).toBeNull();
      expect(td.bpmString).toBeNull();
      expect(td.transitionTo).toBeNull();
      expect(td.transitionToString).toBeNull();
      expect(td.beatLength).toBe(0.25);
      expect(td.meanTempoAt).toBeNull();
      expect(td.xmlId).toBeNull();
    });

    it('clone produces a deep copy', () => {
      const td = new TempoData();
      td.startDate = 100;
      td.endDate = 200;
      td.bpm = 120;
      td.bpmString = '120';
      td.transitionTo = 140;
      td.transitionToString = '140';
      td.beatLength = 0.5;
      td.meanTempoAt = 0.3;
      td.xmlId = 'test-id';

      const clone = td.clone();
      expect(clone.startDate).toBe(100);
      expect(clone.endDate).toBe(200);
      expect(clone.bpm).toBe(120);
      expect(clone.bpmString).toBe('120');
      expect(clone.transitionTo).toBe(140);
      expect(clone.transitionToString).toBe('140');
      expect(clone.beatLength).toBe(0.5);
      expect(clone.meanTempoAt).toBe(0.3);
      expect(clone.xmlId).toBe('test-id');

      // Modifying clone should not affect original
      clone.bpm = 999;
      expect(td.bpm).toBe(120);
    });

    // Migrated from a `new TempoData(e)` that no production path ever called. Same
    // element, same five assertions, pointed at the reader the renderer uses — plus the
    // three fields the dead constructor could not produce and that make the difference
    // between a datum that renders and one that does not: `bpmString` (which the
    // constructor NULLED for a numeric bpm, and which `addTempo(TempoData)` prefers on
    // the way back out, so the round-trip was not byte-stable), `exponent` (never set at
    // all, so a declared transition had no curve), and `endDate`.
    it('reads the same element through getTempoDataOf, and resolves what the raw parse could not', () => {
      const map = TempoMap.createTempoMap();
      const e = new Element('tempo');
      e.addAttribute(new Attribute('date', '100'));
      e.addAttribute(new Attribute('bpm', '120'));
      e.addAttribute(new Attribute('beatLength', '0.25'));
      e.addAttribute(new Attribute('transition.to', '140'));
      e.addAttribute(new Attribute('meanTempoAt', '0.3'));
      map.addElement(e);

      const td = expectTransitioning(map.getTempoDataOf(0));
      expect(td.startDate).toBe(100);
      expect(td.bpm).toBe(120);
      expect(td.beatLength).toBe(0.25);
      expect(td.transitionTo).toBe(140);
      expect(td.meanTempoAt).toBe(0.3);

      expect(td.bpmString).toBe('120');
      expect(td.transitionToString).toBe('140');
      expect(td.exponent).toBeCloseTo(Math.log(0.5) / Math.log(0.3), 10);
      expect(td.endDate).toBe(Number.MAX_VALUE);
    });
  });

  // ---------------------------------------------------------------
  //  resolveTempo — the normalisation, unit-tested directly
  // ---------------------------------------------------------------
  /**
   * These replace the four `isConstantTempo()` unit tests that used to sit above.
   *
   * That predicate answered three questions at once (`transitionTo == null || bpm == null
   * || transitionTo == bpm`) about a record that could be in any state; the arms answer
   * them once, at read time, so the thing worth testing is the read. One of the four old
   * cases — "null bpm counts as constant" — described a state `resolveTempo` cannot
   * produce, and the last test here is what makes that true rather than merely asserted.
   */
  describe('resolveTempo', () => {
    const span = { startDate: 0, endDate: 720, beatLength: 0.25 };

    it('no @transition.to at all is the constant arm', () => {
      const t = resolveTempo(span, '120', null, null, null);
      expect(t).toEqual({ kind: 'constant', ...span, bpmString: '120', bpm: 120 });
    });

    it('a @transition.to equal to @bpm is the constant arm', () => {
      expect(resolveTempo(span, '120', '120', '0.5', null).kind).toBe('constant');
    });

    it('a differing @transition.to is the transitioning arm, with its exponent', () => {
      const t = expectTransitioning(resolveTempo(span, '60', '120', '0.3', null));
      expect(t.transitionTo).toBe(120);
      expect(t.meanTempoAt).toBe(0.3);
      expect(t.exponent).toBeCloseTo(Math.log(0.5) / Math.log(0.3), 10);
    });

    it('an absent @meanTempoAt is a linear ramp', () => {
      const t = expectTransitioning(resolveTempo(span, '60', '120', null, null));
      expect(t.meanTempoAt).toBe(0.5);
      expect(t.exponent).toBe(1.0);
    });

    it('@meanTempoAt <= 0 collapses onto the target, written form included', () => {
      const t = expectConstant(resolveTempo(span, '60', '120', '0', null));
      expect(t.bpm).toBe(120);
      expect(t.bpmString).toBe('120');
    });

    it('@meanTempoAt >= 1 collapses onto the original tempo', () => {
      const t = expectConstant(resolveTempo(span, '60', '120', '1.0', null));
      expect(t.bpm).toBe(60);
      expect(t.bpmString).toBe('60');
    });

    /**
     * `NaN <= 0` and `NaN >= 1` are both false, so a malformed `@meanTempoAt` falls
     * through both collapses into the transition arm and poisons the exponent. Pinned
     * because it is the one place a `<tempo>` can still carry a non-number, and because a
     * `?? 0.5` "tidy-up" here would silently retime every document that has one.
     */
    it('a malformed @meanTempoAt transitions along a NaN exponent', () => {
      const t = expectTransitioning(resolveTempo(span, '60', '120', 'nonsense', null));
      expect(t.meanTempoAt).toBeNaN();
      expect(t.exponent).toBeNaN();
    });

    /**
     * The claim the two arms rest on: neither `bpm` nor `transitionTo` can be absent,
     * because an unresolvable name is resolved to 100.0 rather than to null. The old
     * `isConstantTempo` treated a null `bpm` as constant and the constant path then
     * divided by it.
     */
    it('an unresolvable name resolves to 100.0, never to an absence', () => {
      const t = expectConstant(resolveTempo(span, 'Allegro', null, null, null));
      expect(t.bpm).toBe(100.0);
      expect(t.bpmString).toBe('Allegro');
    });
  });

  // ---------------------------------------------------------------
  //  GenericMap operations on TempoMap
  // ---------------------------------------------------------------
  describe('GenericMap operations', () => {
    it('should support removeElement by index', () => {
      const map = TempoMap.createTempoMap();
      map.addTempo(0, '100', 0.25);
      map.addTempo(960, '140', 0.25);

      map.removeElement(0);
      expect(map.size()).toBe(1);
      expect(map.getElement(0)!.getAttributeValue('bpm')).toBe('140');
    });

    it('should support getElementBeforeAt', () => {
      const map = TempoMap.createTempoMap();
      map.addTempo(0, '100', 0.25);
      map.addTempo(480, '120', 0.25);
      map.addTempo(960, '140', 0.25);

      const elem = map.getElementBeforeAt(500);
      expect(elem).not.toBeNull();
      expect(elem!.getAttributeValue('bpm')).toBe('120');
    });

    it('should support addStyleSwitch', () => {
      const map = TempoMap.createTempoMap();
      const index = map.addStyleSwitch(0, 'myTempoStyle');
      expect(index).toBeGreaterThanOrEqual(0);
      expect(map.size()).toBe(1);

      const elem = map.getElement(index)!;
      expect(elem.getLocalName()).toBe('style');
      expect(elem.getAttributeValue('name.ref')).toBe('myTempoStyle');
    });

    it('should support setId and getId', () => {
      const map = TempoMap.createTempoMap();
      expect(map.getId()).toBeNull();

      map.setId('tempoMap-1');
      expect(map.getId()).toBe('tempoMap-1');
    });
  });

  // ---------------------------------------------------------------
  //  Edge cases and integration
  // ---------------------------------------------------------------
  describe('edge cases', () => {
    it('constant tempo timing: multiple beats', () => {
      // 4 beats at 120 bpm = 2 seconds = 2000ms
      const td = constantTempo({ startDate: 0, bpm: 120, beatLength: 0.25 });

      const ms = TempoMap.computeDiffTiming(4 * 720, 720, td);
      expect(ms).toBeCloseTo(2000.0, 10);
    });

    it('very slow tempo: 30 bpm, one beat', () => {
      // 1 beat at 30 bpm = 2 seconds = 2000ms
      const td = constantTempo({ startDate: 0, bpm: 30, beatLength: 0.25 });

      const ms = TempoMap.computeDiffTiming(720, 720, td);
      expect(ms).toBeCloseTo(2000.0, 10);
    });

    it('very fast tempo: 480 bpm, one beat', () => {
      // 1 beat at 480 bpm = 0.125 sec = 125ms
      const td = constantTempo({ startDate: 0, bpm: 480, beatLength: 0.25 });

      const ms = TempoMap.computeDiffTiming(720, 720, td);
      expect(ms).toBeCloseTo(125.0, 10);
    });
  });

  /**
   * The `tempoMap === null` branch of the static entry point: with no tempo instructions
   * anywhere, the millisecond attributes are the `.perf` ones copied across verbatim.
   *
   * Added because a negative control found it unguarded — skipping the branch's first map
   * entry entirely left all 6032 tests and `npm run gate` green. It is reachable in
   * production (`Performance` passes `mpm.tempo`, which is null for a performance that
   * declares no `tempoMap`), so this is a gap in the oracle rather than dead code.
   */
  describe('renderTempoToMap with no tempoMap at all', () => {
    const noteMap = (): GenericMap => {
      const map = okValue(GenericMap.createGenericMap('score'));
      for (const [date, dur] of [
        [0, 100],
        [100, 50],
      ]) {
        const e = new Element('note');
        e.addAttribute(new Attribute('date', String(date)));
        e.addAttribute(new Attribute('date.perf', String(date)));
        e.addAttribute(new Attribute('duration.perf', String(dur)));
        map.addElement(e);
      }
      return map;
    };

    it('copies date.perf to milliseconds.date on every entry, first one included', () => {
      const map = noteMap();
      TempoMap.renderTempoToMap(map, 720, null);
      expect(
        map.getAllElements().map((e) => e.getValue().getAttributeValue('milliseconds.date')),
      ).toEqual(['0', '100']);
    });

    it('derives date.end.perf from duration.perf and mirrors it into milliseconds.date.end', () => {
      const map = noteMap();
      TempoMap.renderTempoToMap(map, 720, null);
      const values = map
        .getAllElements()
        .map((e) => [
          e.getValue().getAttributeValue('date.end.perf'),
          e.getValue().getAttributeValue('milliseconds.date.end'),
        ]);
      expect(values).toEqual([
        ['100', '100'],
        ['150', '150'],
      ]);
    });

    it('prefers an existing date.end.perf over recomputing it from the duration', () => {
      const map = okValue(GenericMap.createGenericMap('score'));
      const e = new Element('note');
      e.addAttribute(new Attribute('date', '0'));
      e.addAttribute(new Attribute('date.perf', '0'));
      e.addAttribute(new Attribute('date.end.perf', '77'));
      e.addAttribute(new Attribute('duration.perf', '100'));
      map.addElement(e);

      TempoMap.renderTempoToMap(map, 720, null);
      expect(e.getAttributeValue('milliseconds.date.end')).toBe('77');
      expect(e.getAttributeValue('date.end.perf')).toBe('77');
    });
  });
});
