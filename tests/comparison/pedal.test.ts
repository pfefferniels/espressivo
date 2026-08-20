/**
 * The pedal (movement) curve and its density — DESIGN.md §5.8, as amended by AD-35.
 *
 * The load-bearing test is again the **differential** one: the renderer is run for real and its
 * emitted `<position>` events are compared against `positionAt` at their own dates. That checks
 * three things at once that no hand-written expectation could — the span structure, the ideal
 * Bézier against the renderer's own sampled points, and the 127-scaling — and it is the only
 * kind of test that would have caught the two spec-was-wrong CAPITALs of W2.
 *
 * The second load-bearing test is the **trailing-style resurrection** (AD-35), pinned as a
 * fixture with both halves the ruling names: the event count and range the renderer really
 * produces, and the window-bounded pricing the comparison puts on it.
 */
import { describe, it, expect } from 'vitest';
import { Builder } from '../../src/xml/XomTypes.js';
import '../../src/mpm/Mpm.js';
import { MovementMap } from '../../src/mpm/elements/maps/MovementMap.js';
import { readComparisonPair, readScopeMapViews } from '../../src/comparison/document.js';
import type { ComparisonDocument, ComparisonPair } from '../../src/comparison/document.js';
import {
  DEFAULT_MOVEMENT_CURVATURE,
  PEDAL_NEUTRAL_POSITION,
  UNBOUNDED_END_TICKS,
  neutralPedalCurve,
  pedalSegmentAt,
  positionAt,
  readMovementSegments,
  type PedalCurve,
} from '../../src/comparison/pedalCurve.js';
import { pedalDistance, pedalGridTicks } from '../../src/comparison/pedalDistance.js';
import { PEDAL_POSITION_JND_RATIO, comparisonRowFor } from '../../src/comparison/registry.js';
import { isBottom } from '../../src/comparison/values.js';

const NS = 'http://www.cemfi.de/mpm/ns/1.0';
const PPQ = 720;

const doc = (map: string) =>
  `<mpm xmlns="${NS}"><performance name="p" pulsesPerQuarter="${String(PPQ)}">` +
  `<global><header/><dated><movementMap>${map}</movementMap></dated></global>` +
  '</performance></mpm>';

const curveOf = (pair: ComparisonPair, side: 'a' | 'b'): PedalCurve => {
  const document: ComparisonDocument = pair[side];
  const scope = document.scopes.find((candidate) => candidate.scope === 'global');
  if (scope === undefined) throw new Error('no global scope');
  return readMovementSegments(
    readScopeMapViews(scope).get('movementMap') ?? null,
    document.scaleFactor,
  );
};

const curveFor = (map: string): PedalCurve => curveOf(readComparisonPair({ a: doc(map) }), 'a');

/** The renderer's own `<position>` events for the same map body, as `[date, position]`. */
function rendererEvents(map: string): readonly (readonly [number, number])[] {
  const xml = new Builder().build(`<movementMap xmlns="${NS}">${map}</movementMap>`);
  const movementMap = MovementMap.createMovementMap(xml.getRootElement());
  const rendered = movementMap.ok ? movementMap.value.renderMovementToMap() : null;
  if (rendered === null) return [];
  return rendered
    .getXml()
    .getChildElements()
    .toArray()
    .map(
      (element) =>
        [
          parseFloat(element.getAttributeValue('date')!),
          // The renderer scales the normalized position into MIDI's 0..127 on the way out.
          parseFloat(element.getAttributeValue('value')!) / 127,
        ] as const,
    );
}

const windowOf = (endQuarters: number) => ({ start: 0, end: endQuarters });

describe('positionAt agrees with the renderer at its own sampled points', () => {
  const CASES: readonly (readonly [string, string])[] = [
    [
      'the ordinary release',
      '<movement date="0.0" position="1.0" transition.to="0.0"/>' +
        '<movement date="720.0" position="0.0"/>',
    ],
    [
      'shaped by curvature and protraction',
      '<movement date="0.0" position="0.0" transition.to="1.0" curvature="0.9" protraction="-0.6"/>' +
        '<movement date="1440.0" position="1.0"/>',
    ],
    [
      'protraction on the other side, and a partial depth',
      '<movement date="0.0" position="0.25" transition.to="0.85" curvature="0.1" protraction="0.7"/>' +
        '<movement date="360.0" position="0.85"/>',
    ],
    [
      'three spans, the middle one constant',
      '<movement date="0.0" position="1.0" transition.to="0.4"/>' +
        '<movement date="360.0" position="0.4"/>' +
        '<movement date="1080.0" position="0.4" transition.to="0.0"/>' +
        '<movement date="1440.0" position="0.0"/>',
    ],
    [
      'a soft-pedal movement ending a sustain span (flat spans, AD-13)',
      '<movement date="0.0" position="1.0" transition.to="0.0" controller="sustain"/>' +
        '<movement date="360.0" position="0.2" controller="soft"/>' +
        '<movement date="720.0" position="0.4"/>',
    ],
  ];

  it.each(CASES)('matches every emitted event: %s', (_label, map) => {
    const curve = curveFor(map);
    const events = rendererEvents(map);
    expect(events.length).toBeGreaterThan(2);

    // At a span boundary the renderer emits TWICE at the same date — the ending span's exact
    // end point and the opening span's start point — and on a flat map those two can even be
    // on different controllers (`sustain` closing, `soft` opening). Right-continuity (A-B1)
    // says the opening span governs, so the event to compare against at a repeated date is the
    // LAST one, which is what the renderer's own date-ordered insertion leaves there.
    const lastPerDate = new Map<number, number>();
    for (const [date, position] of events) lastPerDate.set(date, position);

    for (const [date, position] of lastPerDate) {
      const mine = positionAt(curve, date);
      expect(isBottom(mine)).toBe(false);
      if (isBottom(mine)) throw new Error('unreachable');
      // 1e-9 is the ideal inversion's own accuracy (dynamicsCurve's idealCurveParameter doc);
      // the renderer's sample is an exact curve point, so any larger gap is a real disagreement
      // about the curve and not about the inversion.
      expect(mine.value, `at ${String(date)}`).toBeCloseTo(position, 9);
    }
  });

  it('is the IDEAL curve, not the renderer’s one-tick staircase', () => {
    // Between two sampled points the renderer has no value at all; the comparison object does,
    // and it is the smooth Bézier (§5.0 rule 3). Monotone descent is the checkable consequence.
    const curve = curveFor(
      '<movement date="0.0" position="1.0" transition.to="0.0"/>' +
        '<movement date="720.0" position="0.0"/>',
    );
    let previous = 1.1;
    for (let ticks = 0; ticks <= 720; ticks += 7) {
      const value = positionAt(curve, ticks);
      if (isBottom(value)) throw new Error('unreachable');
      expect(value.value).toBeLessThanOrEqual(previous);
      previous = value.value;
    }
  });
});

describe('the AD-35 resurrection: a trailing <style> renders the last movement', () => {
  const MOVEMENTS =
    '<movement date="0.0" position="1.0" transition.to="0.0"/>' +
    '<movement date="720.0" position="0.5" transition.to="0.0"/>';
  const TRAILING_STYLE = '<style date="1080.0" name.ref="S"/>';

  it('is a renderer fact first: the event count and range both change', () => {
    const without = rendererEvents(MOVEMENTS);
    const with_ = rendererEvents(MOVEMENTS + TRAILING_STYLE);

    // Measured, and pinned so a future renderer change has to face it.
    expect(without).toHaveLength(17);
    expect(Math.max(...without.map(([date]) => date))).toBe(720);

    expect(with_).toHaveLength(26);
    expect(Math.max(...with_.map(([date]) => date))).toBe(Number.MAX_VALUE);
  });

  it('needs an entry AFTER the last movement — leading and middle styles change nothing', () => {
    const leading = rendererEvents(`<style date="0.0" name.ref="S"/>${MOVEMENTS}`);
    const middle = rendererEvents(
      '<movement date="0.0" position="1.0" transition.to="0.0"/>' +
        '<style date="360.0" name.ref="S"/>' +
        '<movement date="720.0" position="0.5" transition.to="0.0"/>',
    );
    expect(leading).toHaveLength(17);
    expect(middle).toHaveLength(17);
    // Which is the whole content of "the guard counts ENTRIES": only an entry past the last
    // movement moves `size() - 1` past it.
  });

  it('reads the resurrected movement as a real span with an unbounded end (AD-35 a/b)', () => {
    const plain = curveFor(MOVEMENTS);
    const resurrected = curveFor(MOVEMENTS + TRAILING_STYLE);

    // Without the trailing entry the last movement contributes no span: what governs after 720
    // is the HOLD at the previous span's target, not the movement's own 0.5.
    const held = positionAt(plain, 1440);
    if (isBottom(held)) throw new Error('unreachable');
    expect(held.value).toBe(0);
    expect(pedalSegmentAt(plain, 1440)?.source).toBe('hold');
    expect(plain.notes.some((note) => note.kind === 'trailing-movement')).toBe(true);

    // With it, the movement is a performed transition whose end is the renderer's own sentinel.
    const segment = pedalSegmentAt(resurrected, 1440);
    expect(segment?.source).toBe('movement');
    expect(segment?.endTicks).toBe(UNBOUNDED_END_TICKS);
    expect(resurrected.notes.some((note) => note.kind === 'resurrected-movement')).toBe(true);
  });

  it('prices it inside the window: flat at @position, which is AD-25.9 by another route', () => {
    const resurrected = curveFor(MOVEMENTS + TRAILING_STYLE);
    // u ~ 1e-305 for every real date, so the transition performs at its start value — and the
    // difference from an exactly-flat 0.5 is far below anything the metric resolves.
    for (const ticks of [721, 1440, 100000, 1e9]) {
      const value = positionAt(resurrected, ticks);
      if (isBottom(value)) throw new Error('unreachable');
      expect(value.value).toBeCloseTo(0.5, 12);
    }

    const pair = readComparisonPair({
      a: doc(MOVEMENTS + TRAILING_STYLE),
      b: doc(MOVEMENTS),
      window: windowOf(4),
    });
    const distance = pedalDistance(
      curveOf(pair, 'a'),
      curveOf(pair, 'b'),
      pair.window,
      pair.ppq.lcm,
    );
    // The two documents agree up to 720 and differ by 0.5 of travel from there to the window
    // end (3 quarters): 0.5 / 0.1 JND × 3 quarters.
    expect(distance.distance).toBeCloseTo((0.5 / PEDAL_POSITION_JND_RATIO) * 3, 8);
    expect(Number.isFinite(distance.distance)).toBe(true);
  });
});

describe('the timeline is emitted events, and an event holds', () => {
  it('is 0 before the first event — the pedal has never been pressed', () => {
    const curve = curveFor(
      '<movement date="720.0" position="1.0" transition.to="0.0"/>' +
        '<movement date="1440.0" position="0.0"/>',
    );
    const value = positionAt(curve, 0);
    if (isBottom(value)) throw new Error('unreachable');
    expect(value.value).toBe(PEDAL_NEUTRAL_POSITION);
    expect(pedalSegmentAt(curve, 0)?.source).toBe('lead-in');
  });

  it('holds the last emitted value across a SKIPPED movement’s interval', () => {
    // The renderer emits nothing between 0 and 720 here: the movement at 360 has no @position
    // and its predecessor no @transition.to, so it is dropped — but it still ends the first
    // span. Executed against the renderer below.
    const map =
      '<style date="0.0" name.ref="S"/>' +
      '<movement date="0.0" position="1.0"/>' +
      '<movement date="360.0"/>' +
      '<movement date="720.0" position="0.5" transition.to="0.1"/>' +
      '<movement date="1080.0" position="0.0"/>';
    const events = rendererEvents(map);
    expect(events.filter(([date]) => date > 0 && date < 720)).toHaveLength(0);

    const curve = curveFor(map);
    for (const ticks of [0, 100, 359, 360, 719]) {
      const value = positionAt(curve, ticks);
      if (isBottom(value)) throw new Error('unreachable');
      expect(value.value, `at ${String(ticks)}`).toBe(1);
    }
    expect(pedalSegmentAt(curve, 500)?.source).toBe('hold');
    expect(curve.notes.some((note) => note.kind === 'renderer-skip')).toBe(true);
  });

  it('holds a transition’s target after the span, not the next movement’s position', () => {
    const curve = curveFor(
      '<movement date="0.0" position="1.0" transition.to="0.25"/>' +
        '<movement date="720.0" position="0.9"/>',
    );
    // The last movement is the last ENTRY, so its 0.9 is never performed; 0.25 holds.
    const value = positionAt(curve, 2000);
    if (isBottom(value)) throw new Error('unreachable');
    expect(value.value).toBe(0.25);
  });

  it('is neutral everywhere for an absent map (R6)', () => {
    const curve = neutralPedalCurve();
    const value = positionAt(curve, 12345);
    if (isBottom(value)) throw new Error('unreachable');
    expect(value.value).toBe(PEDAL_NEUTRAL_POSITION);
    expect(readMovementSegments(null, 1).segments).toEqual(curve.segments);
  });
});

describe('the reading rules §5.8 states', () => {
  it('defaults @curvature to 0.4 and NOT to dynamics’ 0.0 (AD-13)', () => {
    const shaped = curveFor(
      `<movement date="0.0" position="0.0" transition.to="1.0" curvature="${String(DEFAULT_MOVEMENT_CURVATURE)}"/>` +
        '<movement date="720.0" position="1.0"/>',
    );
    const unshaped = curveFor(
      '<movement date="0.0" position="0.0" transition.to="1.0"/>' +
        '<movement date="720.0" position="1.0"/>',
    );
    const flat = curveFor(
      '<movement date="0.0" position="0.0" transition.to="1.0" curvature="0.0"/>' +
        '<movement date="720.0" position="1.0"/>',
    );
    const at = (curve: PedalCurve, ticks: number) => {
      const value = positionAt(curve, ticks);
      if (isBottom(value)) throw new Error('unreachable');
      return value.value;
    };
    // The absent attribute performs as 0.4, which is a different curve from 0.0.
    expect(at(unshaped, 180)).toBe(at(shaped, 180));
    expect(at(unshaped, 180)).not.toBe(at(flat, 180));
  });

  it('inherits a missing @position from the previous @transition.to — and skips entry 0', () => {
    // PARITY P2: the inheritance scan is `j > 0`, so the movement at 360 inherits 0 rather
    // than the 0.25 that entry 0 ends at. Put ANY entry in front and it inherits 0.25.
    const body =
      '<movement date="0.0" position="1.0" transition.to="0.25"/>' +
      '<movement date="360.0" transition.to="0.9"/>' +
      '<movement date="720.0" position="0.5"/>';
    const at = (map: string, ticks: number) => {
      const value = positionAt(curveFor(map), ticks);
      if (isBottom(value)) throw new Error('unreachable');
      return value.value;
    };
    expect(at(body, 360)).toBe(0);
    expect(at(`<style date="0.0" name.ref="S"/>${body}`, 360)).toBe(0.25);

    // And the renderer agrees, which is the only reason this deliberate defect is kept.
    const withoutStyle = rendererEvents(body).filter(([date]) => date === 360);
    const withStyle = rendererEvents(`<style date="0.0" name.ref="S"/>${body}`).filter(
      ([date]) => date === 360,
    );
    expect(Math.min(...withoutStyle.map(([, position]) => position))).toBe(0);
    expect(Math.min(...withStyle.map(([, position]) => position))).toBeCloseTo(0.25, 12);
  });

  it('skips a movement at a negative date, and holds across it', () => {
    const curve = curveFor(
      '<movement date="-360.0" position="1.0" transition.to="0.0"/>' +
        '<movement date="0.0" position="0.6" transition.to="0.0"/>' +
        '<movement date="720.0" position="0.0"/>',
    );
    const value = positionAt(curve, 0);
    if (isBottom(value)) throw new Error('unreachable');
    expect(value.value).toBe(0.6);
    expect(
      curve.notes.some((note) => note.kind === 'renderer-skip' && note.detail.includes('negative')),
    ).toBe(true);
  });

  it('clamps an out-of-range position rather than refusing it (EventMaker.ts:536)', () => {
    const curve = curveFor(
      '<movement date="0.0" position="1.7" transition.to="-0.4"/>' +
        '<movement date="720.0" position="0.0"/>',
    );
    const start = positionAt(curve, 0);
    const end = positionAt(curve, 719.9);
    if (isBottom(start) || isBottom(end)) throw new Error('unreachable');
    expect(start.value).toBe(1);
    expect(end.value).toBeCloseTo(0, 3);
    expect(curve.notes.some((note) => note.kind === 'clamped-position')).toBe(true);
  });

  it('reports a controller the MIDI export does not know, without pricing it', () => {
    const curve = curveFor(
      '<movement date="0.0" position="1.0" transition.to="0.0" controller="portamento"/>' +
        '<movement date="720.0" position="0.0"/>',
    );
    expect(curve.notes.some((note) => note.kind === 'foreign-controller')).toBe(true);
    expect(curve.controllers).toEqual(['portamento']);
  });
});

describe('⊥ — where there is no date ↦ position function at all (§4, §5.8)', () => {
  const bottomAt = (map: string, ticks: number) => isBottom(positionAt(curveFor(map), ticks));

  it('reads an out-of-domain @curvature as ⊥, because x(t) stops being monotone', () => {
    const map =
      '<movement date="0.0" position="0.0" transition.to="1.0" curvature="1.5"/>' +
      '<movement date="720.0" position="1.0"/>';
    expect(bottomAt(map, 360)).toBe(true);

    // The renderer fact behind the ruling. The emitted map is a GenericMap and inserts by
    // date, so the backwards dates do not survive as an ordering defect — they survive as a
    // VALUE defect: sorted by date, an authored 0 → 1 ramp no longer ascends. There is no
    // date ↦ position function here, which is exactly what §4's domain gate is for.
    const positions = rendererEvents(map).map(([, position]) => position);
    const ascending = positions.every(
      (position, index) => index === 0 || position >= positions[index - 1],
    );
    expect(ascending).toBe(false);
  });

  it('lets a badly shaped span emit events OUTSIDE it — the ⊥ is a floor on the damage', () => {
    // At curvature 4 the sampler puts events at −202 and at 922 for a span of [0, 720]: the
    // ⊥ span models the interval the movement owns, and does not model this leakage. Reported
    // rather than modelled, and pinned here so the claim stays true.
    const dates = rendererEvents(
      '<movement date="0.0" position="0.0" transition.to="1.0" curvature="4"/>' +
        '<movement date="720.0" position="1.0"/>',
    ).map(([date]) => date);
    expect(Math.min(...dates)).toBeLessThan(0);
    expect(Math.max(...dates)).toBeGreaterThan(720);
  });

  it('reads an out-of-domain @protraction the same way, and leaves the rest of the map alone', () => {
    const map =
      '<movement date="0.0" position="0.0" transition.to="1.0" protraction="-2.5"/>' +
      '<movement date="720.0" position="1.0" transition.to="0.0"/>' +
      '<movement date="1440.0" position="0.0"/>';
    expect(bottomAt(map, 100)).toBe(true);
    expect(bottomAt(map, 900)).toBe(false);
  });

  it('reads an unparseable @transition.to as ⊥ and not as a constant movement', () => {
    // isConstantMovement tests for null, so "later" is a transition towards NaN.
    const map =
      '<movement date="0.0" position="1.0" transition.to="later"/>' +
      '<movement date="720.0" position="0.0"/>';
    expect(bottomAt(map, 360)).toBe(true);
    expect(curveFor(map).notes.some((note) => note.kind === 'renderer-error')).toBe(true);
  });

  it('propagates ⊥ into the hold it leaves behind', () => {
    const map =
      '<movement date="0.0" position="0.0" transition.to="1.0" curvature="9"/>' +
      '<movement date="720.0" position="1.0"/>';
    // The events that span emitted are the ones whose dates cannot be trusted, so what the
    // controller holds afterwards is not knowable either.
    expect(bottomAt(map, 1440)).toBe(true);
  });
});

describe('d_pedal', () => {
  const distanceOf = (a: string, b: string, endQuarters: number) => {
    const pair = readComparisonPair({ a: doc(a), b: doc(b), window: windowOf(endQuarters) });
    return pedalDistance(curveOf(pair, 'a'), curveOf(pair, 'b'), pair.window, pair.ppq.lcm);
  };

  const DOWN_THEN_UP =
    '<movement date="0.0" position="1.0" transition.to="0.0"/>' +
    '<movement date="720.0" position="0.0"/>';

  it('is exactly 0 against itself (P-C1)', () => {
    expect(distanceOf(DOWN_THEN_UP, DOWN_THEN_UP, 4).distance).toBe(0);
  });

  it('prices a constant depth difference as the flat rectangle it is', () => {
    const a = '<movement date="0.0" position="1.0"/><movement date="2880.0" position="1.0"/>';
    const b = '<movement date="0.0" position="0.5"/><movement date="2880.0" position="0.5"/>';
    // 0.5 of travel over 4 quarters, at 0.1 travel per JND.
    expect(distanceOf(a, b, 4).distance).toBeCloseTo((0.5 / PEDAL_POSITION_JND_RATIO) * 4, 9);
  });

  it('prices a full-travel difference at δ_row per quarter — the calibration the JND was set by', () => {
    const down = '<movement date="0.0" position="1.0"/><movement date="2880.0" position="1.0"/>';
    const up = '<movement date="0.0" position="0.0"/><movement date="2880.0" position="0.0"/>';
    const row = comparisonRowFor('pedal/movement@position');
    expect(distanceOf(down, up, 1).distance).toBeCloseTo(row.delta, 9);
    // Which also means the cap has NOT bound: δ_row is half of it.
    expect(distanceOf(down, up, 1).capped).toBe(false);
  });

  it('prices a ⊥ span at δ_row per quarter and reports the cap', () => {
    const broken =
      '<movement date="0.0" position="0.0" transition.to="1.0" curvature="4"/>' +
      '<movement date="2880.0" position="1.0"/>';
    const fine =
      '<movement date="0.0" position="0.0" transition.to="1.0"/>' +
      '<movement date="2880.0" position="1.0"/>';
    const result = distanceOf(broken, fine, 4);
    expect(result.capped).toBe(true);
    expect(result.distance).toBeCloseTo(comparisonRowFor('pedal/movement@position').delta * 4, 9);
  });

  it('is 0 between two ⊥ spans, which is what makes ⊥ a value and not a hole', () => {
    const broken =
      '<movement date="0.0" position="0.0" transition.to="1.0" curvature="4"/>' +
      '<movement date="2880.0" position="1.0"/>';
    expect(distanceOf(broken, broken, 4).distance).toBe(0);
  });

  it('reports a controller mismatch structurally, never as a distance (§5.8)', () => {
    const sustain =
      '<movement date="0.0" position="1.0" controller="sustain"/>' +
      '<movement date="2880.0" position="1.0"/>';
    const soft =
      '<movement date="0.0" position="1.0" controller="soft"/>' +
      '<movement date="2880.0" position="1.0"/>';
    const result = distanceOf(sustain, soft, 4);
    expect(result.distance).toBe(0);
    expect(result.controllerFindings).toEqual([
      { onlyIn: 'a', controller: 'sustain' },
      { onlyIn: 'b', controller: 'soft' },
    ]);
  });

  it('puts every breakpoint of both curves on the grid', () => {
    const pair = readComparisonPair({
      a: doc(DOWN_THEN_UP),
      b: doc(
        '<movement date="0.0" position="0.4" transition.to="0.9"/>' +
          '<movement date="360.0" position="0.9"/>',
      ),
      window: windowOf(4),
    });
    const grid = pedalGridTicks(curveOf(pair, 'a'), curveOf(pair, 'b'), pair.window, pair.ppq.lcm);
    expect(grid[0]).toBe(0);
    expect(grid[grid.length - 1]).toBe(4 * PPQ);
    expect(grid).toContain(360);
    expect(grid).toContain(720);
  });

  it('is symmetric to the last bit (P-C2)', () => {
    const a = DOWN_THEN_UP;
    const b =
      '<movement date="0.0" position="0.3" transition.to="0.8" curvature="0.8" protraction="0.5"/>' +
      '<movement date="1440.0" position="0.8" transition.to="0.1"/>' +
      '<movement date="2160.0" position="0.1"/>';
    const forward = distanceOf(a, b, 4).distance;
    const reverse = distanceOf(b, a, 4).distance;
    expect(Object.is(forward, reverse)).toBe(true);
  });
});
