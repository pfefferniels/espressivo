/**
 * P-C5 — the cross-module property: `compareMpm` and `exaggerateMpm` are ONE mathematics.
 *
 * §1.3's Proposition 1, as AD-6 corrected it. Exaggeration acts multiplicatively in T-space **at
 * row values**: a factor `s` maps a value `v` to `n + s(v − n)` around its dimension's neutral
 * `n`, so the T-space distance from the original is `|1 − s|·|v − n|` — proportional to `|1 − s|`
 * and to the document's own deviation from neutral. The comparison integrates exactly that
 * quantity. If the two modules did not share their scale spaces, their neutrals and their
 * transforms, this would not hold to nine decimal places for anything.
 *
 * The statement is made WITHOUT the centre appearing anywhere, which is what makes it a test of
 * the two modules rather than of a third quantity nobody exports:
 *
 *     d(A, C(A, s)) = |1 − s| · d(A, C(A, 0))
 *
 * `C(A, 0)` is the document flattened onto its own neutral, so the right-hand side is the
 * document's whole deviation from neutral as the comparison measures it. AD-6's three parts:
 *
 * 1. **exact** on constant-only fixtures, every shape knob at 1, `s > 0`, monotone in `|1 − s|`;
 * 2. **breakpoint-level** on transition-bearing fixtures, on the written row values;
 * 3. a **measured** `d_shape` bound on transitions, pinned as a regression anchor rather than
 *    asserted to be zero — because the renderer interpolates in raw space between breakpoints
 *    and the affine law does not survive that.
 *
 * `s < 0` is outside the claim (§1.3: `r = −1` there) and is not tested.
 */
import { describe, it, expect } from 'vitest';
import { compareMpm, exaggerateMpm } from '../../src/api/index.js';
import type { ComparisonDimension } from '../../src/api/index.js';
import type { ExpressionDimension } from '../../src/api/index.js';

const NS = 'http://www.cemfi.de/mpm/ns/1.0';
const WINDOW = { start: 0, end: 8 };

const doc = (body: string, header = ''): string =>
  `<mpm xmlns="${NS}"><performance name="p" pulsesPerQuarter="720">` +
  `<global><header>${header}</header><dated>${body}</dated></global></performance></mpm>`;

/** `d_k(A, B)` over the shared window. */
const distance = (a: string, b: string, dimension: ComparisonDimension): number =>
  compareMpm({ a, b, window: WINDOW }).report.dimensions[dimension].distance;

const exaggerate = (mpm: string, dimensions: readonly ExpressionDimension[], s: number): string =>
  exaggerateMpm(mpm, {
    factors: Object.fromEntries(dimensions.map((dimension) => [dimension, s])),
  }).mpm;

/**
 * The note kinds that mean **the written value is not the affine image** of the original.
 *
 * The law is a statement about `v ↦ n + s(v − n)`. Where the transform saturates a bound,
 * refuses a write or leaves a domain, it has written something else on purpose — and the
 * exaggeration report NAMES every such site, which is what makes "the law holds wherever the
 * transform is unsaturated" a testable claim rather than a hedge.
 */
const BOUNDED_KINDS = new Set([
  'clamped',
  'saturation-refused',
  'pair-collapse-refused',
  'out-of-domain-input',
  'non-finite-result',
  'merged-levels',
  'no-center',
]);

/**
 * Whether EITHER module reports that it stopped being affine on this run.
 *
 * Two ways out of the law, and both are reported rather than inferred. The TRANSFORM saturates a
 * bound, refuses a write or leaves a domain, and names the site. The METRIC's own cap binds
 * (§4: `min(|T(x) − T(y)|, 2·δ_row)`), which truncates a difference the transform made
 * faithfully — at `s = 4` an accentuation scale of 1.5 becomes 6, and 90 velocity units of
 * difference is past the 60 the cap allows. Neither is a defect and both are the modules doing
 * what they were built to do; what would be a defect is a test that hid them.
 */
function lawIsUnreachable(
  fixture: {
    readonly mpm: string;
    readonly expression: readonly ExpressionDimension[];
    readonly comparison: ComparisonDimension;
  },
  s: number,
): boolean {
  const { report, mpm } = exaggerateMpm(fixture.mpm, {
    factors: Object.fromEntries(fixture.expression.map((dimension) => [dimension, s])),
  });
  for (const [, value] of walk(report)) {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) continue;
    const kind = (value as { readonly kind?: unknown }).kind;
    if (typeof kind === 'string' && BOUNDED_KINDS.has(kind)) return true;
  }
  const comparison = compareMpm({ a: fixture.mpm, b: mpm, window: WINDOW }).report;
  return comparison.dimensions[fixture.comparison].cappedCells > 0;
}

function* walk(value: unknown, path = '$'): Generator<[string, unknown]> {
  yield [path, value];
  if (value === null || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    for (const [index, item] of value.entries()) yield* walk(item, `${path}[${String(index)}]`);
    return;
  }
  for (const [key, item] of Object.entries(value)) yield* walk(item, `${path}.${key}`);
}

// ---------------------------------------------------------------------------
// The fixtures: constant-only, every shape knob at its own identity
// ---------------------------------------------------------------------------

const CONSTANT_FIXTURES: readonly {
  readonly name: string;
  readonly comparison: ComparisonDimension;
  readonly expression: readonly ExpressionDimension[];
  readonly mpm: string;
}[] = [
  {
    name: 'tempo — a log space, two constant levels',
    comparison: 'tempo',
    expression: ['tempo'],
    mpm: doc(
      '<tempoMap><tempo date="0.0" bpm="60" beatLength="0.25"/>' +
        '<tempo date="2880.0" bpm="120" beatLength="0.25"/></tempoMap>',
    ),
  },
  {
    name: 'dynamics — a log space, inside the velocity range',
    comparison: 'dynamics',
    expression: ['dynamics'],
    mpm: doc(
      '<dynamicsMap><dynamics date="0.0" volume="40.0"/>' +
        '<dynamics date="2880.0" volume="100.0"/></dynamicsMap>',
    ),
  },
  {
    name: 'asynchrony — a linear space, two constant offsets',
    comparison: 'asynchrony',
    expression: ['asynchrony'],
    mpm: doc(
      '<asynchronyMap><asynchrony date="0.0" milliseconds.offset="-20.0"/>' +
        '<asynchrony date="2880.0" milliseconds.offset="40.0"/></asynchronyMap>',
    ),
  },
  {
    name: 'accentuation — a scaled pattern, no transition inside it',
    comparison: 'accentuation',
    expression: ['accentuation'],
    mpm: doc(
      '<metricalAccentuationMap><style date="0.0" name.ref="M"/>' +
        '<accentuationPattern date="0.0" name.ref="p" scale="1.5" loop="true"/>' +
        '</metricalAccentuationMap>',
      '<metricalAccentuationStyles><styleDef name="M">' +
        '<accentuationPatternDef name="p" length="4.0">' +
        '<accentuation beat="1" value="20" transition.to="20"/>' +
        '<accentuation beat="3" value="-10" transition.to="-10"/>' +
        '</accentuationPatternDef></styleDef></metricalAccentuationStyles>',
    ),
  },
  {
    // An EVENT dimension: the alignment matches the same anchors on both sides, so the optimum
    // is the row-wise sum and the law survives the DP untouched.
    name: 'articulation — an event dimension, through the alignment',
    comparison: 'articulation',
    expression: ['articulation'],
    mpm: doc(
      '<articulationMap><articulation date="0.0" relativeDuration="0.5" relativeVelocity="1.4"/>' +
        '<articulation date="1440.0" relativeDuration="1.3"/></articulationMap>',
    ),
  },
  {
    name: 'ornamentation — three expression dimensions, one comparison dimension',
    comparison: 'ornamentation',
    expression: ['ornamentSpread', 'ornamentSpacing', 'ornamentDynamics'],
    mpm: doc(
      '<ornamentationMap><style date="0.0" name.ref="O"/>' +
        '<ornament date="0.0" name.ref="g" scale="1.0"/></ornamentationMap>',
      '<ornamentationStyles><styleDef name="O"><ornamentDef name="g">' +
        '<dynamicsGradient transition.from="-20.0" transition.to="20.0"/>' +
        '<temporalSpread frame.start="-22.0" frameLength="44.0" intensity="1.0"/>' +
        '</ornamentDef></styleDef></ornamentationStyles>',
    ),
  },
  {
    // A DISTRIBUTION dimension: `W₁` between two uniform laws is linear in their parameters, so
    // the affine law survives the Wasserstein integral as well as the pointwise metric.
    name: 'imprecisionTiming — a distribution dimension, through W₁',
    comparison: 'imprecisionTiming',
    expression: ['imprecisionTiming'],
    mpm: doc(
      '<imprecisionMap.timing>' +
        '<distribution.uniform date="0.0" limit.lower="-30.0" limit.upper="30.0" ' +
        'milliseconds.timingBasis="300"/>' +
        '<distribution.uniform date="2880.0" limit.lower="-5.0" limit.upper="15.0" ' +
        'milliseconds.timingBasis="300"/></imprecisionMap.timing>',
    ),
  },
  // W3 MINOR-4: the record's "seven of the eleven … the three exceptions" framing implies ten
  // dimensions are accounted for, and these two were exercised nowhere. They are separate
  // expression dimensions reading separate maps, so "timing works" is not evidence about either.
  {
    name: 'imprecisionDynamics — the velocity domain, its own map and its own factor',
    comparison: 'imprecisionDynamics',
    expression: ['imprecisionDynamics'],
    mpm: doc(
      '<imprecisionMap.dynamics>' +
        '<distribution.uniform date="0.0" limit.lower="-12.0" limit.upper="12.0"/>' +
        '<distribution.uniform date="2880.0" limit.lower="-3.0" limit.upper="6.0"/>' +
        '</imprecisionMap.dynamics>',
    ),
  },
  {
    name: 'imprecisionDuration — the toneduration domain, likewise',
    comparison: 'imprecisionDuration',
    expression: ['imprecisionDuration'],
    mpm: doc(
      '<imprecisionMap.toneduration>' +
        '<distribution.uniform date="0.0" limit.lower="-40.0" limit.upper="40.0" ' +
        'milliseconds.timingBasis="300"/>' +
        '<distribution.uniform date="2880.0" limit.lower="-8.0" limit.upper="20.0" ' +
        'milliseconds.timingBasis="300"/></imprecisionMap.toneduration>',
    ),
  },
];

describe('P-C5 (i): the EXACT law on constant-only fixtures', () => {
  const FACTORS = [0.25, 0.5, 1.5, 2, 4];

  for (const fixture of CONSTANT_FIXTURES) {
    describe(fixture.name, () => {
      const flattened = exaggerate(fixture.mpm, fixture.expression, 0);
      const deviation = distance(fixture.mpm, flattened, fixture.comparison);

      it('has a nonzero deviation from its own neutral, so the law is not about zero', () => {
        expect(deviation).toBeGreaterThan(1e-6);
      });

      it('scores |1 − s| × its deviation from neutral, wherever the transform is unsaturated', () => {
        let below = 0;
        let above = 0;
        for (const s of FACTORS) {
          // A factor that saturates a bound, or a difference §4's cap truncates, is outside the
          // law — and BOTH modules say so in their reports, so the skip is a reported fact
          // rather than a convenience.
          if (lawIsUnreachable(fixture, s)) continue;
          const measured = distance(
            fixture.mpm,
            exaggerate(fixture.mpm, fixture.expression, s),
            fixture.comparison,
          );
          expect(measured / (Math.abs(1 - s) * deviation), `s = ${String(s)}`).toBeCloseTo(1, 9);
          if (s < 1) below += 1;
          else above += 1;
        }
        // Non-vacuity, stated so that it is arithmetically possible (W3 MINOR-3). The comment
        // used to claim "at least three factors on each side of 1", which `FACTORS` cannot
        // deliver — it has two values below 1 — while the assertion was on the TOTAL, so a
        // fixture unsaturated on one side only passed a claim about both. What is really
        // asserted, and what matters, is that the law is exercised on BOTH sides of the
        // identity: `|1 − s|` and `|ln s|` agree in sign but not in shape, and a one-sided
        // check cannot tell AD-6's law from its rival.
        expect(below, 'no unsaturated factor below s = 1').toBeGreaterThanOrEqual(1);
        expect(above, 'no unsaturated factor above s = 1').toBeGreaterThanOrEqual(1);
        expect(below + above).toBeGreaterThanOrEqual(3);
      });

      it('is exactly 0 at s = 1, which is the identity (P-C1)', () => {
        const identity = exaggerate(fixture.mpm, fixture.expression, 1);
        expect(distance(fixture.mpm, identity, fixture.comparison)).toBe(0);
      });

      it('is monotone in |1 − s|, not in |ln s| (AD-6)', () => {
        const measured = FACTORS.filter((s) => !lawIsUnreachable(fixture, s))
          .map((s) => ({
            spread: Math.abs(1 - s),
            value: distance(
              fixture.mpm,
              exaggerate(fixture.mpm, fixture.expression, s),
              fixture.comparison,
            ),
          }))
          .sort((x, y) => x.spread - y.spread);
        for (let i = 1; i < measured.length; ++i)
          expect(measured[i].value).toBeGreaterThanOrEqual(measured[i - 1].value * (1 - 1e-9));
      });
    });
  }
});

/**
 * A reporting gap this property FOUND, pinned where it was found.
 *
 * §4's cap binds inside `localDistance`, which the event dimensions call once per row — and the
 * event evaluations reported `cappedCells: 0` unconditionally, so a report could truncate a
 * difference at `2·δ_row` and say nothing about it. AD-2 requires cap events to be reported.
 * They are counted over the CHOSEN alignment rather than inside the cost function, because the
 * DP evaluates that function at every cell of its table and a counter there would report the
 * search rather than the answer.
 */
describe('AD-2’s cap events are reported by the event dimensions too', () => {
  const articulation = doc(
    '<articulationMap><articulation date="0.0" relativeDuration="0.5" relativeVelocity="1.4"/>' +
      '<articulation date="1440.0" relativeDuration="1.3"/></articulationMap>',
  );

  it('says nothing when no row is capped', () => {
    const { report } = compareMpm({
      a: articulation,
      b: exaggerate(articulation, ['articulation'], 1.5),
      window: WINDOW,
    });
    expect(report.dimensions.articulation.cappedCells).toBe(0);
    expect(
      report.notes.some((note) => note.kind === 'capped' && note.dimension === 'articulation'),
    ).toBe(false);
  });

  it('counts the anchors where it bound, and emits the note (AD-2)', () => {
    // At s = 4 the composed `relativeDuration` is 0.5⁴, i.e. |ln| = 2.08 nepers over a JND of
    // ln(1.10) — 21.8 JND on one row, past the 2·δ_row = 20 the cap allows.
    const { report } = compareMpm({
      a: articulation,
      b: exaggerate(articulation, ['articulation'], 4),
      window: WINDOW,
    });
    expect(report.dimensions.articulation.cappedCells).toBeGreaterThan(0);
    expect(
      report.notes.some((note) => note.kind === 'capped' && note.dimension === 'articulation'),
    ).toBe(true);
  });
});

/**
 * The three dimensions the law does NOT cover, each for a reason the design already records.
 *
 * Stating them as measurements rather than as absences is the point: an exception nobody has
 * measured is indistinguishable from a defect nobody has found.
 */
describe('P-C5 (i): where the law does not reach, and why', () => {
  it('rubato: expression trims the WINDOW jointly, the comparison prices the displacement', () => {
    const rubato = doc(
      '<rubatoMap><rubato date="0.0" frameLength="720.0" intensity="2.0" loop="true"/>' +
        '</rubatoMap>',
    );
    const deviation = distance(rubato, exaggerate(rubato, ['rubato'], 0), 'rubato');
    const measured = distance(rubato, exaggerate(rubato, ['rubato'], 2), 'rubato');
    // §4's flag 2: expression's rubato window rows are `joint-trim` and the comparison prices
    // the window as L1 on the ENDPOINTS (§5.2/A-Q10), a documented substitution rather than the
    // same space. The displacement curve is also not affine in `@intensity`. The deviation is
    // real, bounded and pinned; it is not drift.
    expect(measured / deviation).toBeCloseTo(0.799884775, 6);
  });

  it('dynamics: the law holds until the velocity clamp saturates the transform', () => {
    const dynamics = doc(
      '<dynamicsMap><dynamics date="0.0" volume="40.0"/>' +
        '<dynamics date="2880.0" volume="100.0"/></dynamicsMap>',
    );
    const deviation = distance(dynamics, exaggerate(dynamics, ['dynamics'], 0), 'dynamics');
    // At s = 2 the upper level would land past 127 and `velocityRange` clamps it, so the
    // transform is no longer affine and neither is the distance. The clamp is R6(a)'s and the
    // exaggeration report names every site it bound.
    const clamped = distance(dynamics, exaggerate(dynamics, ['dynamics'], 2), 'dynamics');
    expect(clamped / (1 * deviation)).toBeCloseTo(0.760852688, 6);
    expect(clamped).toBeLessThan(deviation);
  });

  it('pedal: expression carries no pedal LEVEL dimension for the law to act on', () => {
    const pedal = doc(
      '<movementMap><movement date="0.0" position="0.2"/>' +
        '<movement date="2880.0" position="0.9"/>' +
        '<movement date="5760.0" position="0.4"/></movementMap>',
    );
    // §3's correspondence maps `pedal ⊇ {pedalShape}` and nothing else: the fifteen expression
    // dimensions have no `pedal` level, so a factor moves the curvature and not the position.
    // The law is vacuous here rather than false, and this is the measurement that says so.
    expect(distance(pedal, exaggerate(pedal, ['pedalShape'], 0), 'pedal')).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// (ii) and (iii): transitions
// ---------------------------------------------------------------------------

const TRANSITION = doc(
  '<tempoMap><tempo date="0.0" bpm="60" beatLength="0.25" transition.to="120" meanTempoAt="0.5"/>' +
    '<tempo date="2880.0" bpm="90" beatLength="0.25"/></tempoMap>',
);

/** Every `@bpm` and `@transition.to` a tempo map writes, in document order. */
function tempoRowValues(mpm: string): readonly number[] {
  return [...mpm.matchAll(/<tempo\b[^>]*>/g)].flatMap((match) =>
    [/\sbpm="([^"]*)"/, /\stransition\.to="([^"]*)"/]
      .map((pattern) => pattern.exec(match[0])?.[1])
      .filter((value): value is string => value !== undefined)
      .map((value) => Number.parseFloat(value)),
  );
}

describe('P-C5 (ii): the BREAKPOINT-level law on a transition-bearing fixture', () => {
  /**
   * Stated on DIFFERENCES of log row values, which cancels the centre.
   *
   * `ln v' = ln n + s(ln v − ln n)` for every row value `v`, so for any two of them
   * `ln v₁' − ln v₂' = s(ln v₁ − ln v₂)` and `n` disappears. §4's own flag 1 records that the
   * collapse of `log-around-center` to the bare logarithm is a property of DIFFERENCES; this is
   * that collapse used as the test it licenses.
   */
  it('scales every difference of log row values by exactly s', () => {
    const original = tempoRowValues(TRANSITION);
    expect(original).toEqual([60, 120, 90]);
    for (const s of [0.5, 1.5, 2]) {
      const scaled = tempoRowValues(exaggerate(TRANSITION, ['tempo'], s));
      expect(scaled).toHaveLength(original.length);
      for (let i = 1; i < original.length; ++i) {
        const before = Math.log(original[i]) - Math.log(original[0]);
        const after = Math.log(scaled[i]) - Math.log(scaled[0]);
        expect(after / before).toBeCloseTo(s, 9);
      }
    }
  });

  it('leaves the shape knobs alone, which is what makes the row values the whole story', () => {
    for (const s of [0.5, 2])
      expect(exaggerate(TRANSITION, ['tempo'], s)).toContain('meanTempoAt="0.5"');
  });
});

describe('P-C5 (iii): the measured d_shape bound on transitions', () => {
  const at = (s: number) => distance(TRANSITION, exaggerate(TRANSITION, ['tempo'], s), 'tempo');

  /**
   * The exact law FAILS here, by a measured amount, and that is the finding rather than a defect.
   *
   * Exaggeration is multiplicative at the breakpoints; the renderer interpolates between them in
   * RAW space, so the exaggerated curve is not the affine image of the original curve anywhere
   * except at its row values. `s = 0.5` and `s = 1.5` have the same `|1 − s|` and would score
   * identically under the exact law; they do not, and the ratio is the bound.
   */
  it('pins the deviation for an equal-|1 − s| pair', () => {
    expect(at(1.5) / at(0.5)).toBeCloseTo(1.06296023, 6);
  });

  it('pins the deviation for a doubled |1 − s|', () => {
    expect(at(2) / at(0.5)).toBeCloseTo(2.18740836, 6);
  });

  it('is a SMALL deviation, so the law is a good approximation rather than a wrong one', () => {
    // Both bounds are within 10 % of the exact law's prediction, on a transition spanning the
    // whole window with a factor-of-two tempo change in it — about as hard a case as the corpus
    // offers. A reader may use the exact law as an estimate; the report's numbers are the
    // integral, not the estimate.
    expect(Math.abs(at(1.5) / at(0.5) - 1)).toBeLessThan(0.1);
    expect(Math.abs(at(2) / at(0.5) / 2 - 1)).toBeLessThan(0.1);
  });

  it('collapses to the exact law when the transition is removed from the same document', () => {
    const constants = TRANSITION.replace(' transition.to="120" meanTempoAt="0.5"', '');
    const deviation = distance(constants, exaggerate(constants, ['tempo'], 0), 'tempo');
    // The same two factors, the same two levels, no interpolation between them: exact again.
    expect(
      distance(constants, exaggerate(constants, ['tempo'], 1.5), 'tempo') /
        distance(constants, exaggerate(constants, ['tempo'], 0.5), 'tempo'),
    ).toBeCloseTo(1, 9);
    expect(
      distance(constants, exaggerate(constants, ['tempo'], 2), 'tempo') / deviation,
    ).toBeCloseTo(1, 9);
  });
});
