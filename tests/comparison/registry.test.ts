/**
 * W2a — comparison/DESIGN.md §4's registry as data, and §4's capped local metric.
 *
 * Three of these suites test a table against itself, which is worth defending. The key
 * vocabulary is duplicated *by design* — §4 wants a closed union a misspelled `options.jnd`
 * key fails to compile against, and a union cannot be derived from a runtime array — so
 * "the union and the rows agree" is a real invariant with a real failure mode, and it is
 * asserted in both directions. The same goes for the `${dimension}/${element}@${attribute}`
 * spelling, which a type can constrain but not compute.
 *
 * The superset suite is the one that will change. It is §4's "every live expression-registry
 * row has a comparison row with the same scale space", scoped to the dimensions that have rows
 * and carrying the list of those that do not — so each W3 cut shrinks that list by making this
 * test fail, rather than by remembering to.
 *
 * **No RNG** (R2). Every sweep is a loop over a fixed grid.
 */
import { describe, it, expect } from 'vitest';
import {
  ASYNCHRONY_JND_MS,
  COMPARISON_DIMENSIONS,
  COMPARISON_JND_KEYS,
  COMPARISON_REGISTRY_ROWS,
  DEFAULT_DELTA_JND,
  EXPRESSION_DIMENSION_CORRESPONDENCE,
  TEMPO_JND_NEPERS,
  comparisonRowAt,
  comparisonRowFor,
  comparisonRowsOf,
  localDistance,
} from '../../src/comparison/registry.js';
import type { ComparisonDimension, ComparisonRegistryRow } from '../../src/comparison/registry.js';
import { bottom, valued } from '../../src/comparison/values.js';
import {
  EXPRESSION_DIMENSIONS,
  REGISTRY_ROWS,
  scaleSpaceTagOf,
} from '../../src/expression/registry.js';
import type { RegistryRow, RowSpace } from '../../src/expression/registry.js';
import { forwardInSpace } from '../../src/expression/transforms.js';

/** The §3 dimensions with rows: W2's four, plus the two W3a cut 1 brought. */
const COVERED_DIMENSIONS: readonly ComparisonDimension[] = [
  'tempo',
  'rubato',
  'dynamics',
  'accentuation',
  'articulation',
  'ornamentation',
  'asynchrony',
  'pedal',
];

/**
 * The §3 dimensions with no rows yet, named so each W3 cut must edit this line.
 *
 * A `skip` would announce the gap; this asserts it, which is the difference between a note
 * and a gate: adding articulation rows fails this test until the name is removed here. Cut 1
 * removed `accentuation` and `pedal` from it, which is what the gate is for.
 */
const UNCOVERED_DIMENSIONS: readonly ComparisonDimension[] = [
  'imprecisionTiming',
  'imprecisionDynamics',
  'imprecisionDuration',
];

function rowFor(key: (typeof COMPARISON_JND_KEYS)[number]): ComparisonRegistryRow {
  return comparisonRowFor(key);
}

describe('the dimension vocabulary (§3, §9.1, AD-22)', () => {
  it('is exactly §9.1’s eleven, in §9.1’s order, with no duplicates', () => {
    expect([...COMPARISON_DIMENSIONS]).toEqual([
      'tempo',
      'rubato',
      'dynamics',
      'accentuation',
      'articulation',
      'ornamentation',
      'asynchrony',
      'pedal',
      'imprecisionTiming',
      'imprecisionDynamics',
      'imprecisionDuration',
    ]);
    expect(new Set(COMPARISON_DIMENSIONS).size).toBe(11);
  });

  it('is frozen, because the ESM re-export hands out the validator’s own object', () => {
    expect(Object.isFrozen(COMPARISON_DIMENSIONS)).toBe(true);
    expect(Object.isFrozen(COMPARISON_JND_KEYS)).toBe(true);
    expect(Object.isFrozen(EXPRESSION_DIMENSION_CORRESPONDENCE)).toBe(true);
    expect(Object.isFrozen(COMPARISON_REGISTRY_ROWS)).toBe(true);
  });

  it('partitions all fifteen expression dimensions exactly once (§3’s table)', () => {
    const mapped = COMPARISON_DIMENSIONS.flatMap(
      (dimension) => EXPRESSION_DIMENSION_CORRESPONDENCE[dimension],
    );
    expect(mapped).toHaveLength(EXPRESSION_DIMENSIONS.length);
    expect([...mapped].sort()).toEqual([...EXPRESSION_DIMENSIONS].sort());
  });

  it('states §3’s containments where a comparison curve absorbs two expression knobs', () => {
    expect(EXPRESSION_DIMENSION_CORRESPONDENCE.tempo).toEqual(['tempo', 'tempoShape']);
    expect(EXPRESSION_DIMENSION_CORRESPONDENCE.dynamics).toEqual(['dynamics', 'dynamicsShape']);
    expect(EXPRESSION_DIMENSION_CORRESPONDENCE.ornamentation).toEqual([
      'ornamentSpread',
      'ornamentSpacing',
      'ornamentDynamics',
    ]);
    expect(EXPRESSION_DIMENSION_CORRESPONDENCE.pedal).toEqual(['pedalShape']);
  });
});

describe('the row key (§4, A1)', () => {
  it('spells every key `${dimension}/${element}@${attribute}`', () => {
    for (const row of COMPARISON_REGISTRY_ROWS) {
      expect(row.key).toBe(`${row.dimension}/${row.element}@${row.attribute}`);
    }
  });

  it('is unique per row, which `element@attribute` alone is not', () => {
    const keys = COMPARISON_REGISTRY_ROWS.map((row) => row.key);
    expect(new Set(keys).size).toBe(keys.length);
    // The reason the dimension is in the key at all: four rows share this pair across the
    // table, and more will once the imprecision family lands.
    const transitionTargets = COMPARISON_REGISTRY_ROWS.filter(
      (row) => row.attribute === 'transition.to',
    );
    expect(transitionTargets.map((row) => row.dimension)).toEqual([
      'tempo',
      'dynamics',
      'accentuation',
      'ornamentation',
      'pedal',
    ]);
  });

  it('agrees with COMPARISON_JND_KEYS in both directions', () => {
    expect([...COMPARISON_JND_KEYS].sort()).toEqual(
      COMPARISON_REGISTRY_ROWS.map((row) => row.key).sort(),
    );
    for (const key of COMPARISON_JND_KEYS) {
      expect(comparisonRowFor(key).key).toBe(key);
    }
  });

  it('names a dimension that exists, and covers every dimension claimed as covered', () => {
    for (const row of COMPARISON_REGISTRY_ROWS) {
      expect(COMPARISON_DIMENSIONS).toContain(row.dimension);
      expect(row.sites.length).toBeGreaterThan(0);
    }
    for (const dimension of COVERED_DIMENSIONS) {
      expect(comparisonRowsOf(dimension).length).toBeGreaterThan(0);
    }
  });

  it('looks a row up by (dimension, element, attribute) and answers null off the table', () => {
    expect(comparisonRowAt('tempo', 'tempo', 'bpm')?.key).toBe('tempo/tempo@bpm');
    expect(comparisonRowAt('dynamics', 'dynamics', 'transition.to')?.key).toBe(
      'dynamics/dynamics@transition.to',
    );
    // The right answer for every §4 exclusion — a row is the licence to price something.
    expect(comparisonRowAt('tempo', 'tempo', 'date')).toBeNull();
    expect(comparisonRowAt('rubato', 'rubato', 'name.ref')).toBeNull();
    // And the pair is dimension-scoped: `transition.to` is not a tempo attribute of <dynamics>.
    expect(comparisonRowAt('tempo', 'dynamics', 'transition.to')).toBeNull();
  });
});

describe('the columns §4 adds to the expression shape', () => {
  it('gives every row a positive finite jnd — a zero JND divides (§4)', () => {
    for (const row of COMPARISON_REGISTRY_ROWS) {
      expect(Number.isFinite(row.jnd)).toBe(true);
      expect(row.jnd).toBeGreaterThan(0);
    }
  });

  it('gives every row the documented δ_row of 10 JND (§4, AD-25.7)', () => {
    for (const row of COMPARISON_REGISTRY_ROWS) {
      expect(row.delta).toBe(DEFAULT_DELTA_JND);
    }
  });

  it('carries a provenance tag in every row’s notes (§7.1, AD-26.2/AD-27.6)', () => {
    for (const row of COMPARISON_REGISTRY_ROWS) {
      expect(`${row.key}: ${/\[literature\]|\[convention\]/.test(row.notes)}`).toBe(
        `${row.key}: true`,
      );
    }
  });

  it('applies AD-27.6’s upgraded constants', () => {
    // ln(1.025), Friberg & Sundberg 1995's relative regime — not revision 2's ln(1.05).
    expect(TEMPO_JND_NEPERS).toBeCloseTo(0.0246926, 7);
    expect(rowFor('tempo/tempo@bpm').jnd).toBe(TEMPO_JND_NEPERS);
    expect(rowFor('tempo/tempo@bpm').notes).toContain('[literature]');
    expect(ASYNCHRONY_JND_MS).toBe(30);
    expect(rowFor('asynchrony/asynchrony@milliseconds.offset').notes).toContain('[literature]');
    // The 6 ms absolute floor below ~240 ms IOI is a note obligation on the ms-domain row.
    expect(rowFor('asynchrony/asynchrony@milliseconds.offset').notes).toContain('6 ms');
    // Dynamics stays [convention], with the corpus-derivation path named rather than a
    // fabricated dB threshold.
    expect(rowFor('dynamics/dynamics@volume').notes).toContain('[convention]');
    expect(rowFor('dynamics/dynamics@volume').notes).toContain('corpus');
  });

  it('orders every plausible band and states §5.0’s four (C6)', () => {
    for (const row of COMPARISON_REGISTRY_ROWS) {
      if (row.plausibleRange == null) continue;
      expect(row.plausibleRange[0]).toBeLessThan(row.plausibleRange[1]);
    }
    expect(rowFor('tempo/tempo@bpm').plausibleRange).toEqual([10, 400]);
    expect(rowFor('dynamics/dynamics@volume').plausibleRange).toEqual([0, 127]);
    expect(rowFor('asynchrony/asynchrony@milliseconds.offset').plausibleRange).toEqual([
      -1000, 1000,
    ]);
  });

  it('bands the resolved RAW value, not the JND’s own unit', () => {
    // The trap the type doc names: a tempo row's jnd is in nepers and its band in quarter-bpm.
    const bpm = rowFor('tempo/tempo@bpm');
    expect(bpm.unit).toBe('nepers');
    expect(bpm.plausibleRange).toEqual([10, 400]);
    // And plausibility is not comparability: velocity 0 is inside the band and outside the
    // logarithm's domain, so it is a plausible value with no comparable quantity.
    const volume = rowFor('dynamics/dynamics@volume');
    expect(volume.plausibleRange?.[0]).toBe(0);
    expect(volume.valueDomain(0)).toBe(false);
  });

  it('marks exactly the tick-valued row ppqSensitive (§5.0)', () => {
    const sensitive = COMPARISON_REGISTRY_ROWS.filter((row) => row.ppqSensitive).map((r) => r.key);
    // Every row whose value is a TICK count, and no other. §5.5's four are the articulation
    // levers written in ticks at the performance ppq; its millisecond siblings are not, which
    // is the distinction the column exists to keep.
    expect(sensitive).toEqual([
      'rubato/rubato@frameLength',
      'articulation/articulation@absoluteDurationChange',
      'articulation/articulation@absoluteDelay',
      'articulation/articulation@absoluteDuration',
      'ornamentation/temporalSpread@frame.start',
      'ornamentation/temporalSpread@frame.offset',
      'ornamentation/temporalSpread@frameLength',
    ]);
    // `*Ms` and whole-note fractions never rescale — beatLength is the one a reader expects
    // to, and §5.0 says it does not.
    expect(rowFor('tempo/tempo@beatLength').ppqSensitive).toBe(false);
    expect(rowFor('asynchrony/asynchrony@milliseconds.offset').ppqSensitive).toBe(false);
  });

  it('states a conditional liveness against the row’s own element (§4, AD-11)', () => {
    for (const row of COMPARISON_REGISTRY_ROWS) {
      if (row.liveness === 'always') continue;
      expect(row.liveness.element).toBe(row.element);
      expect(row.liveness.rule.length).toBeGreaterThan(20);
    }
    // AD-8's trailing-transition rule reaches both level dimensions; §5.8's ENTRY-index rule
    // is a different mechanism with a different outcome and reaches all four pedal rows.
    const conditional = COMPARISON_REGISTRY_ROWS.filter((row) => row.liveness !== 'always');
    expect(conditional.map((row) => row.key).sort()).toEqual([
      'articulation/articulation@absoluteDuration',
      'articulation/articulation@absoluteDurationChange',
      'articulation/articulation@relativeDuration',
      'dynamics/dynamics@curvature',
      'dynamics/dynamics@protraction',
      'dynamics/dynamics@subNoteDynamics',
      'dynamics/dynamics@transition.to',
      'ornamentation/dynamicsGradient@transition.from',
      'ornamentation/ornament@scale',
      'pedal/movement@curvature',
      'pedal/movement@position',
      'pedal/movement@protraction',
      'pedal/movement@transition.to',
      'tempo/tempo@meanTempoAt',
      'tempo/tempo@transition.to',
    ]);
  });

  it('keeps §5.8’s entry-index rule distinct from AD-8’s trailing rule (AD-35)', () => {
    const movement = rowFor('pedal/movement@transition.to').liveness;
    const dynamics = rowFor('dynamics/dynamics@transition.to').liveness;
    expect(movement).not.toBe('always');
    expect(dynamics).not.toBe('always');
    if (movement === 'always' || dynamics === 'always') throw new Error('unreachable');
    // The distinction §5.8's contrast paragraph exists to protect: entries, not instructions.
    expect(movement.rule).toContain('LAST ENTRY');
    expect(movement.rule).toContain('AD-35');
    expect(dynamics.rule).not.toContain('ENTRY');
  });

  it('does NOT share a Bézier default between <dynamics> and <movement> (AD-13)', () => {
    // The one-line reading error §5.8 exists to prevent: same machinery, different defaults.
    const movement = rowFor('pedal/movement@curvature');
    expect(movement.notes).toContain('0.4');
    expect(rowFor('dynamics/dynamics@curvature').notes).toContain('clamped');
    // And <movement> has no clamps at all, which is why its domain gate takes the span to ⊥.
    if (movement.liveness === 'always') throw new Error('unreachable');
    expect(movement.liveness.rule).toContain('never clamped');
  });

  it('files @subNoteDynamics as structural — a mechanism switch, never a distance (§5.3)', () => {
    expect(rowFor('dynamics/dynamics@subNoteDynamics').role).toBe('structural');
    // @loop is the opposite ruling and the row exists to record it: AD-10 took it OUT of the
    // structural bucket, because two documents differing only in it scored d_rubato = 0.
    expect(rowFor('rubato/rubato@loop').role).not.toBe('structural');
  });
});

describe('valueDomain — the comparability gate on a RESOLVED value (§4)', () => {
  const legal: Readonly<Record<string, readonly number[]>> = {
    'tempo/tempo@bpm': [1e-6, 0.25, 60, 120, 1e6],
    'tempo/tempo@beatLength': [1 / 32, 0.25, 1, 4],
    'tempo/tempo@transition.to': [1, 90, 400],
    'tempo/tempo@meanTempoAt': [1e-9, 0.25, 0.5, 0.93, 1 - 1e-9],
    'tempo/tempoDef@value': [1, 120],
    'rubato/rubato@frameLength': [1e-6, 0.5, 720, 4320],
    'rubato/rubato@intensity': [1e-6, 0.5, 1, 2, 100],
    'rubato/rubato@lateStart': [0, 0.25, 0.999],
    'rubato/rubato@earlyEnd': [1e-9, 0.75, 1],
    'rubato/rubato@loop': [0, 1],
    'dynamics/dynamics@volume': [1e-6, 40, 100, 127],
    'dynamics/dynamics@transition.to': [1, 110],
    'dynamics/dynamics@curvature': [0, 0.4, 1],
    'dynamics/dynamics@protraction': [-1, -0.5, 0, 0.5, 1],
    'dynamics/dynamics@subNoteDynamics': [0, 1],
    'dynamics/dynamicsDef@value': [1, 80],
    // An accentuation SUBTRACTS as readily as it adds, so every velocity row here is signed.
    'accentuation/accentuationPattern@scale': [-50, 0, 1, 20, 1e6],
    'accentuation/accentuationPattern@loop': [0, 1],
    'accentuation/accentuationPattern@stickToMeasures': [0, 1],
    'accentuation/accentuationPatternDef@length': [1e-6, 3, 4, 16],
    'accentuation/accentuation@beat': [1, 2.5, 4],
    'accentuation/accentuation@value': [-20, 0, 20],
    'accentuation/accentuation@transition.from': [-10, 0, 10],
    'accentuation/accentuation@transition.to': [-10, 0, 10],
    'articulation/articulation@relativeDuration': [1e-6, 0.5, 1, 1.2],
    'articulation/articulation@relativeVelocity': [1e-6, 0.75, 1, 2],
    'articulation/articulation@absoluteDurationChange': [-720, 0, 10, 720],
    'articulation/articulation@absoluteDurationChangeMs': [-400, 0, 40],
    'articulation/articulation@absoluteDelay': [-360, 0, 30],
    'articulation/articulation@absoluteDelayMs': [-25, 0, 25],
    'articulation/articulation@absoluteVelocityChange': [-40, 0, 20.5],
    'articulation/articulation@absoluteDuration': [0, 600, 1440],
    'articulation/articulation@absoluteDurationMs': [0, 160],
    'articulation/articulation@absoluteVelocity': [0, 88.5, 127],
    'articulation/articulation@detuneCents': [-50, 0, 14],
    'articulation/articulation@detuneHz': [-3.5, 0, 3.5],
    'ornamentation/ornament@scale': [0, 1, 20],
    'ornamentation/dynamicsGradient@transition.from': [-20, 0, 20],
    'ornamentation/dynamicsGradient@transition.to': [-20, 0, 20],
    'ornamentation/temporalSpread@frame.start': [-240, 0, 240],
    'ornamentation/temporalSpread@frame.offset': [-240, 0, 240],
    'ornamentation/temporalSpread@frameLength': [0, 240, 1440],
    'ornamentation/temporalSpread@intensity': [1e-6, 1, 4],
    'asynchrony/asynchrony@milliseconds.offset': [-1e6, -30, 0, 30, 1e6],
    // 0.0 and 1.0 are the canonical authored pedal positions, which is why §5.8 refuses a logit.
    'pedal/movement@position': [0, 0.4, 1],
    'pedal/movement@transition.to': [0, 0.5, 1],
    'pedal/movement@curvature': [0, 0.4, 1],
    'pedal/movement@protraction': [-1, 0, 0.5, 1],
  };

  const illegal: Readonly<Record<string, readonly number[]>> = {
    // ln 0 = −∞ and ln(negative) = NaN — §4's one case the cap cannot rescue.
    'tempo/tempo@bpm': [0, -1, NaN, Infinity, -Infinity],
    'tempo/tempo@beatLength': [0, -0.25, NaN, Infinity],
    'tempo/tempo@transition.to': [0, -90, NaN, Infinity],
    // The closed bounds are §5.1's degenerate cases: a constant span, not a curve shape.
    'tempo/tempo@meanTempoAt': [0, 1, -0.5, 1.5, NaN, Infinity],
    'tempo/tempoDef@value': [0, -1, NaN],
    // A resolved 0 divides in τ/frameLength; expression's write-side [0,∞) is wider.
    'rubato/rubato@frameLength': [0, -720, NaN, Infinity],
    'rubato/rubato@intensity': [0, -2, NaN, Infinity],
    'rubato/rubato@lateStart': [-0.1, 1, 1.5, NaN, Infinity],
    'rubato/rubato@earlyEnd': [0, -0.5, 1.5, NaN, Infinity],
    'rubato/rubato@loop': [-1, 0.5, 2, NaN, Infinity],
    'dynamics/dynamics@volume': [0, -40, NaN, Infinity],
    'dynamics/dynamics@transition.to': [0, -110, NaN],
    'dynamics/dynamics@curvature': [-0.1, 1.1, NaN, Infinity],
    'dynamics/dynamics@protraction': [-1.1, 1.1, NaN, Infinity],
    'dynamics/dynamics@subNoteDynamics': [-1, 0.5, NaN],
    'dynamics/dynamicsDef@value': [0, -80, NaN, Infinity],
    'accentuation/accentuationPattern@scale': [NaN, Infinity, -Infinity],
    'accentuation/accentuationPattern@loop': [-1, 0.5, NaN],
    'accentuation/accentuationPattern@stickToMeasures': [-1, 0.5, NaN],
    // A pattern of zero or negative length gives a cycle nothing can be evaluated against.
    'accentuation/accentuationPatternDef@length': [0, -4, NaN, Infinity],
    'accentuation/accentuation@beat': [NaN, Infinity, -Infinity],
    'accentuation/accentuation@value': [NaN, Infinity],
    'accentuation/accentuation@transition.from': [NaN, -Infinity],
    'accentuation/accentuation@transition.to': [NaN, Infinity],
    // A relative factor is a RATIO: 0 and below leave the logarithm's domain, and a
    // relativeVelocity of 0 is a silenced note rather than a neutral one.
    'articulation/articulation@relativeDuration': [0, -0.5, NaN, Infinity],
    'articulation/articulation@relativeVelocity': [0, -1, NaN, Infinity],
    'articulation/articulation@absoluteDurationChange': [NaN, Infinity, -Infinity],
    'articulation/articulation@absoluteDurationChangeMs': [NaN, Infinity],
    'articulation/articulation@absoluteDelay': [NaN, -Infinity],
    'articulation/articulation@absoluteDelayMs': [NaN, Infinity],
    'articulation/articulation@absoluteVelocityChange': [NaN, Infinity],
    'articulation/articulation@absoluteDuration': [NaN, Infinity],
    'articulation/articulation@absoluteDurationMs': [NaN, -Infinity],
    'articulation/articulation@absoluteVelocity': [NaN, Infinity],
    'articulation/articulation@detuneCents': [NaN, Infinity],
    'articulation/articulation@detuneHz': [NaN, -Infinity],
    'ornamentation/ornament@scale': [NaN, Infinity],
    'ornamentation/dynamicsGradient@transition.from': [NaN, Infinity],
    'ornamentation/dynamicsGradient@transition.to': [NaN, -Infinity],
    'ornamentation/temporalSpread@frame.start': [NaN, Infinity],
    'ornamentation/temporalSpread@frame.offset': [NaN, -Infinity],
    'ornamentation/temporalSpread@frameLength': [NaN, Infinity],
    // A ratio: 0 and below leave the logarithm's domain.
    'ornamentation/temporalSpread@intensity': [0, -1, NaN, Infinity],
    'asynchrony/asynchrony@milliseconds.offset': [NaN, Infinity, -Infinity],
    // Outside [0,1] the MIDI export clamps, so the RESOLVED value never leaves the domain;
    // these are the unresolvable ones, and NaN is the one the clamp cannot repair.
    'pedal/movement@position': [-0.1, 1.1, NaN, Infinity],
    'pedal/movement@transition.to': [-0.1, 1.1, NaN, Infinity],
    // Out of range these make x(t) non-monotone, which is the ⊥ §5.8 names.
    'pedal/movement@curvature': [-0.1, 1.1, NaN, Infinity],
    'pedal/movement@protraction': [-1.1, 1.1, NaN, Infinity],
  };

  it('accepts every sampled legal value', () => {
    for (const key of COMPARISON_JND_KEYS) {
      for (const value of legal[key] ?? []) {
        expect(`${key} @ ${value}: ${rowFor(key).valueDomain(value)}`).toBe(
          `${key} @ ${value}: true`,
        );
      }
    }
  });

  it('rejects every sampled illegal value, non-finite included', () => {
    for (const key of COMPARISON_JND_KEYS) {
      for (const value of illegal[key] ?? []) {
        expect(`${key} @ ${value}: ${rowFor(key).valueDomain(value)}`).toBe(
          `${key} @ ${value}: false`,
        );
      }
    }
  });

  it('samples both sides for every row, so a new row cannot arrive untested', () => {
    for (const key of COMPARISON_JND_KEYS) {
      expect(`${key}: ${(legal[key] ?? []).length > 0}`).toBe(`${key}: true`);
      expect(`${key}: ${(illegal[key] ?? []).length > 0}`).toBe(`${key}: true`);
    }
  });

  it('keeps T finite on every sampled legal value except §4’s enumerated boundaries', () => {
    const infiniteAtBoundary = new Set([
      'dynamics/dynamics@curvature', // ln(1 − 1) at the authored curvature = 1
      'dynamics/dynamics@protraction', // logit(−1,1) at ±1
      'pedal/movement@curvature', // the same two spaces, the same two boundaries
      'pedal/movement@protraction',
    ]);
    for (const key of COMPARISON_JND_KEYS) {
      const row = rowFor(key);
      for (const value of legal[key] ?? []) {
        const forward = forwardInSpace(row.space, value);
        expect(Number.isNaN(forward)).toBe(false);
        if (!infiniteAtBoundary.has(key)) {
          expect(`${key} @ ${value}: ${Number.isFinite(forward)}`).toBe(`${key} @ ${value}: true`);
        }
      }
    }
  });
});

describe('§4’s capped local metric', () => {
  const bpm = () => rowFor('tempo/tempo@bpm');
  const offset = () => rowFor('asynchrony/asynchrony@milliseconds.offset');

  it('is |T(x) − T(y)| / jnd below the cap', () => {
    // A 2.5 % tempo difference is one JND, which is what the constant means.
    expect(localDistance(bpm(), valued(100), valued(102.5)).distance).toBeCloseTo(1, 12);
    expect(localDistance(offset(), valued(0), valued(30)).distance).toBeCloseTo(1, 12);
    expect(localDistance(offset(), valued(-15), valued(15)).distance).toBeCloseTo(1, 12);
  });

  it('is 0 on the diagonal, including where T is infinite', () => {
    for (const key of COMPARISON_JND_KEYS) {
      const row = rowFor(key);
      expect(localDistance(row, valued(1), valued(1)).distance).toBe(0);
    }
    // `curvature = 1` is an authored value where T = −∞; ∞ − ∞ would be NaN.
    const curvature = rowFor('dynamics/dynamics@curvature');
    expect(localDistance(curvature, valued(1), valued(1)).distance).toBe(0);
    expect(forwardInSpace(curvature.space, 1)).toBe(-Infinity);
  });

  it('is symmetric', () => {
    for (const [x, y] of [
      [60, 120],
      [0.1, 0.9],
      [-30, 45],
    ] as const) {
      for (const key of COMPARISON_JND_KEYS) {
        const row = rowFor(key);
        if (!row.valueDomain(x) || !row.valueDomain(y)) continue;
        expect(localDistance(row, valued(x), valued(y))).toEqual(
          localDistance(row, valued(y), valued(x)),
        );
      }
    }
  });

  it('caps at 2·δ_row, which is what makes T’s infinite boundaries finite', () => {
    const curvature = rowFor('dynamics/dynamics@curvature');
    const capped = localDistance(curvature, valued(0.5), valued(1));
    expect(capped.distance).toBe(2 * DEFAULT_DELTA_JND);
    expect(capped.capped).toBe(true);
    // And an ordinary large difference caps too, rather than dominating the aggregate.
    const far = localDistance(bpm(), valued(1e-6), valued(1e6));
    expect(far.distance).toBe(2 * DEFAULT_DELTA_JND);
    expect(far.capped).toBe(true);
  });

  it('prices ⊥ at δ_row from a value and 0 from itself (AD-2)', () => {
    const row = offset();
    const missing = bottom('renderer-error');
    expect(localDistance(row, missing, valued(0))).toEqual({
      distance: DEFAULT_DELTA_JND,
      capped: true,
    });
    expect(localDistance(row, valued(0), missing)).toEqual({
      distance: DEFAULT_DELTA_JND,
      capped: true,
    });
    expect(localDistance(row, missing, missing)).toEqual({ distance: 0, capped: false });
  });

  it('satisfies the triangle inequality on the sampled grid, cap included', () => {
    const grid = [0.05, 0.5, 1, 2, 30, 100, 1e5];
    for (const key of COMPARISON_JND_KEYS) {
      const row = rowFor(key);
      const values = grid.filter((x) => row.valueDomain(x));
      for (const x of values) {
        for (const y of values) {
          for (const z of values) {
            const direct = localDistance(row, valued(x), valued(z)).distance;
            const via =
              localDistance(row, valued(x), valued(y)).distance +
              localDistance(row, valued(y), valued(z)).distance;
            // Truncation of a metric is a metric — §4's first consequence of the one cap.
            expect(`${key} ${x},${y},${z}: ${direct <= via + 1e-12}`).toBe(
              `${key} ${x},${y},${z}: true`,
            );
          }
        }
      }
    }
  });

  it('is always finite and never negative, which P-C11 needs of every reported number', () => {
    const grid = [-1e6, -1, 0, 0.5, 1, 1e6];
    for (const key of COMPARISON_JND_KEYS) {
      const row = rowFor(key);
      for (const x of grid) {
        for (const y of grid) {
          if (!row.valueDomain(x) || !row.valueDomain(y)) continue;
          const { distance } = localDistance(row, valued(x), valued(y));
          expect(Number.isFinite(distance)).toBe(true);
          expect(distance).toBeGreaterThanOrEqual(0);
          expect(distance).toBeLessThanOrEqual(2 * DEFAULT_DELTA_JND);
        }
      }
    }
  });
});

/**
 * §4's superset property, at this wave's coverage.
 *
 * Two space substitutions are design-mandated rather than accidental, and the test names
 * them rather than normalizing them away silently:
 *
 * - `level` → `log-around-1`. Expression's level rows carry `log-around-center`, whose center
 *   is one performance's own geometric mean; two documents bring two centers, so a centered
 *   `T` is not symmetric under swapping them. The center cancels in every difference, so the
 *   two spaces induce the same metric — §4's "collapses to the bare logarithm", and
 *   survey-code §2.2's clean resolution.
 * - `joint-trim` → `gain`. §5.2/A-Q10 prices `(lateStart, earlyEnd)` as L1 on the ENDPOINTS
 *   and not through expression's joint-trim reparametrization, because two windows with equal
 *   total trim but different placement are different performances.
 */
function comparisonSpaceOfExpressionRow(space: RowSpace): string {
  const tag = scaleSpaceTagOf(space);
  if (tag === 'log-around-center') return 'log-around-1';
  if (tag === 'joint-trim') return 'gain';
  return tag;
}

describe('superset of the expression registry (§4, P-C10) — at this wave’s coverage', () => {
  const coveredExpressionDimensions = new Set(
    COVERED_DIMENSIONS.flatMap((dimension) => EXPRESSION_DIMENSION_CORRESPONDENCE[dimension]),
  );

  const inScope: readonly RegistryRow[] = REGISTRY_ROWS.filter((row) =>
    coveredExpressionDimensions.has(row.dimension),
  );

  it('has expression rows to check in the first place', () => {
    expect(coveredExpressionDimensions).toEqual(
      new Set([
        'tempo',
        'tempoShape',
        'rubato',
        'dynamics',
        'dynamicsShape',
        'accentuation',
        'articulation',
        'ornamentSpread',
        'ornamentSpacing',
        'ornamentDynamics',
        'asynchrony',
        'pedalShape',
      ]),
    );
    expect(inScope.length).toBeGreaterThan(10);
  });

  it('gives every live expression row a comparison row in the same scale space', () => {
    for (const row of inScope) {
      const elements = row.sites.map((site) => site.element);
      const candidates = COMPARISON_REGISTRY_ROWS.filter(
        (comparison) =>
          comparison.attribute === row.attribute && elements.includes(comparison.element),
      );
      expect(`${row.dimension}/${elements[0]}@${row.attribute}: ${candidates.length}`).toBe(
        `${row.dimension}/${elements[0]}@${row.attribute}: 1`,
      );
      const expected = comparisonSpaceOfExpressionRow(row.space);
      expect(`${candidates[0].key}: ${candidates[0].space.kind}`).toBe(
        `${candidates[0].key}: ${expected}`,
      );
    }
  });

  it('keeps the parameters of a parametrized space, not merely its tag', () => {
    const meanTempoAt = rowFor('tempo/tempo@meanTempoAt').space;
    expect(meanTempoAt).toEqual({ kind: 'logit', lower: 0, upper: 1 });
    const protraction = rowFor('dynamics/dynamics@protraction').space;
    expect(protraction).toEqual({ kind: 'logit', lower: -1, upper: 1 });
  });

  it('lists the dimensions still to come, and no others are silently empty', () => {
    const empty = COMPARISON_DIMENSIONS.filter(
      (dimension) => comparisonRowsOf(dimension).length === 0,
    );
    // When a cut adds rows for one of these, this assertion fails until the name is removed
    // from UNCOVERED_DIMENSIONS — which is the point, and is how cut 1 removed accentuation
    // and pedal. The full superset property (every live expression row, plus §4's
    // whole-inventory partition into rows / inert / exclusions) becomes assertable when this
    // list is empty.
    expect(empty).toEqual([...UNCOVERED_DIMENSIONS]);
    expect([...COVERED_DIMENSIONS, ...UNCOVERED_DIMENSIONS].sort()).toEqual(
      [...COMPARISON_DIMENSIONS].sort(),
    );
  });

  it.skip('every attribute of the survey-code §1.2 inventory appears exactly once (R9) — W3', () => {
    // Needs rows for accentuation, articulation, ornamentation, pedal and the three
    // imprecision dimensions before the partition into rows / inert / exclusions can close.
  });
});
