/**
 * AD-51.1's evaluator extension, stated once for every dimension that has cells.
 *
 * The aggregation refines segment boundaries to the roots of `p_D − τ_D` (AD-19/M9b), and it
 * takes the SHAPE of a partly covered cell from the sampler while keeping `mass` as the scale.
 * So the one property that matters is that the sampler and the mass are the same object seen
 * two ways: **the sampler's integral over the cell reproduces the cell's mass**. A sampler that
 * merely looked plausible would move a boundary without moving any mass, which is exactly the
 * inconsistency `aggregate.ts` warns about and which its own first draft committed.
 *
 * It is checked two ways, and the POINTWISE one is the load-bearing half. Each dimension's
 * sampler is compared against its definition — `|T_a(t) − T_b(t)|` over the row's JND, capped
 * where §4's cap applies — evaluated independently here from the curve readers. That is exact
 * and it is what an integral check cannot be: **a mean-density stand-in integrates to exactly
 * the cell's mass by construction**, so an integral alone could never have caught the very
 * fallback this extension exists to remove.
 *
 * The integral is checked as well, loosely, because it catches the one error the pointwise
 * check cannot: a sampler stated per TICK where the aggregation reads per QUARTER is off by a
 * factor of `ppq` in the integral and correct at no point at all. The tolerance is 1e-3
 * relative, which is honest about two things measured while writing this — a composite rule
 * smears the `|·|` corner the modules split at exactly (accentuation, 5.9e-4), and rubato's own
 * quadrature carries AD-34.1's documented residual at an `intensity = 0.5` boundary layer
 * (5.2e-4, inside the ruling's own band).
 *
 * Each dimension also gets a shape assertion. Six vary inside a cell; the two that do not —
 * asynchrony and imprecision — are piecewise constant BY CONSTRUCTION (§5.7, §5.9), and that is
 * asserted instead, since a varying sampler there would be the defect.
 */
import { describe, it, expect } from 'vitest';
import { readComparisonPair, readScopeMapViews } from '../../src/comparison/document.js';
import type { ComparisonDocument, ComparisonPair } from '../../src/comparison/document.js';
import { quarterBpmAt, readTempoSegments } from '../../src/comparison/tempoCurve.js';
import { tempoDistance } from '../../src/comparison/tempoDistance.js';
import { readDynamicsSegments, volumeAt } from '../../src/comparison/dynamicsCurve.js';
import { dynamicsDistance } from '../../src/comparison/dynamicsDistance.js';
import { displacementTicksAt, readRubatoSegments } from '../../src/comparison/rubatoCurve.js';
import { rubatoDistance } from '../../src/comparison/rubatoDistance.js';
import { offsetAt, readAsynchronySegments } from '../../src/comparison/asynchronyCurve.js';
import { asynchronyDistance } from '../../src/comparison/asynchronyDistance.js';
import {
  accentuationContributionAt,
  readAccentuationSegments,
} from '../../src/comparison/accentuationCurve.js';
import { accentuationDistance } from '../../src/comparison/accentuationDistance.js';
import { positionAt, readMovementSegments } from '../../src/comparison/pedalCurve.js';
import { pedalDistance } from '../../src/comparison/pedalDistance.js';
import { readImprecisionSpans } from '../../src/comparison/imprecisionLaws.js';
import { imprecisionDistance } from '../../src/comparison/imprecisionDistance.js';
import { comparisonRowFor, localDistance } from '../../src/comparison/registry.js';
import { isBottom } from '../../src/comparison/values.js';

const NS = 'http://www.cemfi.de/mpm/ns/1.0';
const WINDOW = { start: 0, end: 4 };

const doc = (mapName: string, body: string, header = ''): string =>
  `<mpm xmlns="${NS}"><performance name="p" pulsesPerQuarter="720">` +
  `<global><header>${header}</header><dated><${mapName}>${body}</${mapName}></dated></global>` +
  '</performance></mpm>';

const pairOf = (mapName: string, a: string, b: string, header = ''): ComparisonPair =>
  readComparisonPair({
    a: doc(mapName, a, header),
    b: doc(mapName, b, header),
    window: WINDOW,
  });

const viewOf = (pair: ComparisonPair, side: 'a' | 'b', mapName: string) => {
  const document: ComparisonDocument = pair[side];
  const scope = document.scopes.find((candidate) => candidate.scope === 'global');
  if (scope === undefined) throw new Error('no global scope');
  return {
    view: readScopeMapViews(scope).get(mapName) ?? null,
    scaleFactor: document.scaleFactor,
    environment: scope.environment,
    global: document.performance.global,
  };
};

/** A composite Simpson rule with `2n` panels — the independent reference. */
function simpson(f: (x: number) => number, a: number, b: number, panels = 500): number {
  if (!(b > a)) return 0;
  const h = (b - a) / (2 * panels);
  let total = f(a) + f(b);
  for (let i = 1; i < 2 * panels; ++i) total += (i % 2 === 1 ? 4 : 2) * f(a + i * h);
  return (total * h) / 3;
}

interface Cell {
  readonly startQuarters: number;
  readonly endQuarters: number;
  readonly mass: number;
  readonly densityAt: (quarters: number) => number;
}

const PROBES = [0.05, 0.2, 0.35, 0.5, 0.65, 0.8, 0.95];

/** Interior probe positions of one cell, in quarters. */
function probesOf(cell: Cell): readonly number[] {
  const length = cell.endQuarters - cell.startQuarters;
  return PROBES.map((u) => cell.startQuarters + u * length);
}

/**
 * The property: the sampler is the integrand, pointwise, and its integral is the mass.
 *
 * @param definition the dimension's own density at a position in quarters, computed here from
 *   the curve readers rather than from the distance module — an independent statement of the
 *   same definition, which is the only kind of agreement worth asserting.
 */
function checkCells(
  cells: readonly Cell[],
  distance: number,
  definition: (quarters: number) => number,
): void {
  expect(cells.length).toBeGreaterThan(0);
  let total = 0;
  let integrated = 0;
  for (const cell of cells) {
    for (const quarters of probesOf(cell))
      expect(cell.densityAt(quarters)).toBeCloseTo(definition(quarters), 12);
    integrated += simpson(cell.densityAt, cell.startQuarters, cell.endQuarters);
    total += cell.mass;
  }
  expect(total).toBeCloseTo(distance, 9);
  expect(Math.abs(integrated - distance) / Math.max(Math.abs(distance), 1e-9)).toBeLessThan(1e-3);
}

/** True where the sampler is not constant across some cell. */
function varies(cells: readonly Cell[]): boolean {
  return cells.some((cell) => {
    const samples = probesOf(cell).map((quarters) => cell.densityAt(quarters));
    return Math.max(...samples) - Math.min(...samples) > 1e-9;
  });
}

describe('every cell-bearing dimension exposes the integrand it integrated (AD-51.1)', () => {
  it('tempo: a power transition against a constant', () => {
    const pair = pairOf(
      'tempoMap',
      '<tempo date="0.0" bpm="60" beatLength="0.25" transition.to="120" meanTempoAt="0.7"/>' +
        '<tempo date="2880.0" bpm="120" beatLength="0.25"/>',
      '<tempo date="0.0" bpm="90" beatLength="0.25"/>',
    );
    const read = (side: 'a' | 'b') => {
      const parts = viewOf(pair, side, 'tempoMap');
      return readTempoSegments(parts.view, parts.scaleFactor, parts.environment, parts.global);
    };
    const result = tempoDistance(read('a'), read('b'), pair.window, pair.ppq.lcm);
    const [curveA, curveB] = [read('a'), read('b')];
    checkCells(result.cells, result.distance, (quarters) => {
      const ticks = quarters * pair.ppq.lcm;
      return (
        Math.abs(Math.log(quarterBpmAt(curveA, ticks)) - Math.log(quarterBpmAt(curveB, ticks))) /
        result.jnd
      );
    });
    expect(varies(result.cells)).toBe(true);
  });

  it('dynamics: a Bézier transition against a constant', () => {
    const pair = pairOf(
      'dynamicsMap',
      '<dynamics date="0.0" volume="60" transition.to="120" curvature="0.4"/>' +
        '<dynamics date="2880.0" volume="120"/>',
      '<dynamics date="0.0" volume="90"/>',
    );
    const read = (side: 'a' | 'b') => {
      const parts = viewOf(pair, side, 'dynamicsMap');
      return readDynamicsSegments(parts.view, parts.scaleFactor, parts.environment, parts.global);
    };
    const result = dynamicsDistance(read('a'), read('b'), pair.window, pair.ppq.lcm);
    const [curveA, curveB] = [read('a'), read('b')];
    checkCells(result.cells, result.distance, (quarters) => {
      const ticks = quarters * pair.ppq.lcm;
      return (
        Math.abs(Math.log(volumeAt(curveA, ticks)) - Math.log(volumeAt(curveB, ticks))) / result.jnd
      );
    });
    expect(varies(result.cells)).toBe(true);
  });

  it('rubato: two looping warps of different intensity', () => {
    const pair = pairOf(
      'rubatoMap',
      '<rubato date="0.0" frameLength="720.0" intensity="2.0" loop="true"/>',
      '<rubato date="0.0" frameLength="720.0" intensity="0.5" loop="true"/>',
    );
    const read = (side: 'a' | 'b') => {
      const parts = viewOf(pair, side, 'rubatoMap');
      return readRubatoSegments(parts.view, parts.scaleFactor, parts.environment, parts.global);
    };
    const result = rubatoDistance(read('a'), read('b'), pair.window, pair.ppq.lcm);
    const [curveA, curveB] = [read('a'), read('b')];
    checkCells(result.cells, result.distance, (quarters) => {
      const ticks = quarters * pair.ppq.lcm;
      const displacement = displacementTicksAt(curveA, ticks) - displacementTicksAt(curveB, ticks);
      return Math.abs(displacement / pair.ppq.lcm) / result.jnd;
    });
    expect(varies(result.cells)).toBe(true);
  });

  it('asynchrony: a step curve, whose density is constant per cell by construction', () => {
    const pair = pairOf(
      'asynchronyMap',
      '<asynchrony date="0.0" milliseconds.offset="-20.0"/>' +
        '<asynchrony date="1440.0" milliseconds.offset="40.0"/>',
      '<asynchrony date="0.0" milliseconds.offset="10.0"/>',
    );
    const read = (side: 'a' | 'b') => {
      const parts = viewOf(pair, side, 'asynchronyMap');
      return readAsynchronySegments(parts.view, parts.scaleFactor);
    };
    const result = asynchronyDistance(read('a'), read('b'), pair.window, pair.ppq.lcm);
    const [curveA, curveB] = [read('a'), read('b')];
    const row = comparisonRowFor('asynchrony/asynchrony@milliseconds.offset');
    checkCells(result.cells, result.distance, (quarters) => {
      const ticks = quarters * pair.ppq.lcm;
      return localDistance(row, offsetAt(curveA, ticks), offsetAt(curveB, ticks)).distance;
    });
    expect(varies(result.cells)).toBe(false);
  });

  it('accentuation: two patterns of different length', () => {
    const header =
      '<metricalAccentuationStyles><styleDef name="M">' +
      '<accentuationPatternDef name="p" length="4.0">' +
      '<accentuation beat="1" value="20" transition.to="-5"/>' +
      '<accentuation beat="3" value="-10" transition.to="8"/>' +
      '</accentuationPatternDef>' +
      '<accentuationPatternDef name="q" length="3.0">' +
      '<accentuation beat="1" value="6" transition.to="6"/>' +
      '<accentuation beat="2.5" value="-14" transition.to="2"/>' +
      '</accentuationPatternDef>' +
      '</styleDef></metricalAccentuationStyles>';
    const pattern = (name: string) =>
      '<style date="0.0" name.ref="M"/>' +
      `<accentuationPattern date="0.0" name.ref="${name}" scale="1.0" loop="true"/>`;
    const pair = pairOf('metricalAccentuationMap', pattern('p'), pattern('q'), header);
    const read = (side: 'a' | 'b') => {
      const parts = viewOf(pair, side, 'metricalAccentuationMap');
      return readAccentuationSegments(
        parts.view,
        parts.scaleFactor,
        parts.environment,
        parts.global,
      );
    };
    const result = accentuationDistance(read('a'), read('b'), pair.window, pair.ppq.lcm);
    const [curveA, curveB] = [read('a'), read('b')];
    const row = comparisonRowFor('accentuation/accentuationPattern@scale');
    checkCells(result.cells, result.distance, (quarters) => {
      const ticks = quarters * pair.ppq.lcm;
      const x = accentuationContributionAt(curveA, ticks, pair.ppq.lcm);
      const y = accentuationContributionAt(curveB, ticks, pair.ppq.lcm);
      if (isBottom(x) || isBottom(y)) throw new Error('the fixture is ⊥-free by construction');
      return Math.min(Math.abs(x.value - y.value) / result.jnd, 2 * row.delta);
    });
    expect(varies(result.cells)).toBe(true);
  });

  it('pedal: a Bézier movement against a held position', () => {
    const pair = pairOf(
      'movementMap',
      '<movement date="0.0" position="0.0" transition.to="1.0" curvature="0.4"/>' +
        '<movement date="2880.0" position="1.0"/>',
      '<movement date="0.0" position="0.5"/><movement date="2880.0" position="0.5"/>',
    );
    const read = (side: 'a' | 'b') => {
      const parts = viewOf(pair, side, 'movementMap');
      return readMovementSegments(parts.view, parts.scaleFactor);
    };
    const result = pedalDistance(read('a'), read('b'), pair.window, pair.ppq.lcm);
    const [curveA, curveB] = [read('a'), read('b')];
    const row = comparisonRowFor('pedal/movement@position');
    checkCells(result.cells, result.distance, (quarters) => {
      const ticks = quarters * pair.ppq.lcm;
      const x = positionAt(curveA, ticks);
      const y = positionAt(curveB, ticks);
      if (isBottom(x) || isBottom(y)) throw new Error('the fixture is ⊥-free by construction');
      return Math.min(Math.abs(x.value - y.value) / result.jnd, 2 * row.delta);
    });
    expect(varies(result.cells)).toBe(true);
  });

  it('imprecision: two uniform laws, whose density is constant per cell by construction', () => {
    const uniform = (date: string, lower: number, upper: number) =>
      `<distribution.uniform date="${date}" limit.lower="${String(lower)}" ` +
      `limit.upper="${String(upper)}" milliseconds.timingBasis="300"/>`;
    const pair = pairOf(
      'imprecisionMap.timing',
      uniform('0.0', -30, 30) + uniform('1440.0', -10, 10),
      uniform('0.0', -5, 5),
    );
    const read = (side: 'a' | 'b') => {
      const parts = viewOf(pair, side, 'imprecisionMap.timing');
      return readImprecisionSpans(parts.view, 'imprecisionTiming', parts.scaleFactor);
    };
    const result = imprecisionDistance(read('a'), read('b'), pair.window, pair.ppq.lcm);
    // The two components §5.9 sums, read off the cell they were computed for: this dimension's
    // reading is piecewise constant, so its "definition at a point" IS the covering cell's.
    const cellAt = (quarters: number) =>
      result.cells.find(
        (cell) => quarters >= cell.startQuarters && quarters < cell.endQuarters,
      ) ?? result.cells[result.cells.length - 1];
    checkCells(result.cells, result.distance, (quarters) => {
      const cell = cellAt(quarters);
      return cell.density + cell.processDensity;
    });
    expect(varies(result.cells)).toBe(false);
  });
});
