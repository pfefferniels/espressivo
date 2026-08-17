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
  canonicalLocalDistance,
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
import { compareMpm, performMsm, type XmlText } from '../../src/api/index.js';
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
  'imprecisionTiming',
  'imprecisionDynamics',
  'imprecisionDuration',
];

/**
 * The §3 dimensions with no rows yet — **now empty**, and asserted empty rather than deleted.
 *
 * A `skip` would have announced the gap; this asserted it, which is the difference between a
 * note and a gate: each cut had to edit this line before its rows could land. Cut 1 removed
 * `accentuation` and `pedal`, cut 2 `articulation`, cut 3 `ornamentation`, and cut 4 the three
 * imprecision domains — which closes it. The empty assertion stays because it is now the
 * stronger statement: every one of §3's eleven dimensions has rows, and a future dimension
 * added to `COMPARISON_DIMENSIONS` without rows fails here immediately.
 */
const UNCOVERED_DIMENSIONS: readonly ComparisonDimension[] = [];

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
    // EVERY imprecision row is conditional, and that is the rule rather than a coincidence:
    // §5.9's laws are geometries, so what each attribute does depends on which of its
    // siblings are present — an absent limit is the number 0, an absent clip collapses the
    // whole law to δ₀, an absent mode is 0, and an absent degreeOfCorrelation is ⊥. Listing
    // sixty-three keys here would hide that behind a wall of strings.
    const imprecisionRows = COMPARISON_REGISTRY_ROWS.filter((row) =>
      row.key.startsWith('imprecision'),
    );
    // 75 = three domains x (2 uniform + 3 gaussian + 5 triangular + 4 brownian +
    // 6 compensating + 1 measurement@value + 4 inert timingBasis rows).
    expect(imprecisionRows).toHaveLength(75);
    expect(imprecisionRows.filter((row) => row.liveness !== 'always')).toHaveLength(75);
    expect(
      conditional
        .filter((row) => !row.key.startsWith('imprecision'))
        .map((row) => row.key)
        .sort(),
    ).toEqual([
      'articulation/articulation@absoluteDuration',
      'articulation/articulation@absoluteDurationChange',
      'articulation/articulation@relativeDuration',
      'dynamics/dynamics@curvature',
      'dynamics/dynamics@protraction',
      'dynamics/dynamics@subNoteDynamics',
      'dynamics/dynamics@transition.to',
      'ornamentation/dynamicsGradient@transition.from',
      'ornamentation/ornament@note.order',
      'ornamentation/ornament@repetitions',
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
  /**
   * Every imprecision row's domain is `Number.isFinite` — a width in ms or velocity units has
   * no bound to violate — so one sample pair serves all sixty-three, and spelling them out
   * one by one would pin nothing extra. The one exception is stated below it.
   */
  const imprecisionLegal = Object.fromEntries(
    COMPARISON_JND_KEYS.filter((key) => key.startsWith('imprecision')).map((key) => [
      key,
      key.endsWith('@degreeOfCorrelation') ? [-4, 0.5, 1, 2, 1e6] : [-1e6, -30, 0, 30, 1e6],
    ]),
  );

  const imprecisionIllegal = Object.fromEntries(
    COMPARISON_JND_KEYS.filter((key) => key.startsWith('imprecision')).map((key) => [
      key,
      // `degreeOfCorrelation = 0` is the ⊥ condition the row states itself: the compensating
      // step divides by it, so every draw after the first is NaN (measured).
      key.endsWith('@degreeOfCorrelation')
        ? [0, NaN, Infinity, -Infinity]
        : [NaN, Infinity, -Infinity],
    ]),
  );

  const legal: Readonly<Record<string, readonly number[]>> = {
    ...imprecisionLegal,
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
    // The {0,1} encoding of the two enumerated orderings (AD-41.1).
    'ornamentation/ornament@note.order': [0, 1],
    // A count, plus meico's documented -1 "fill the frame" extension.
    'ornamentation/ornament@repetitions': [-1, 0, 1, 7],
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
    ...imprecisionIllegal,
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
    'ornamentation/ornament@note.order': [0.5, -1, 2, NaN],
    // -1 is the extension; -2 is simply not a repeat count, and the renderer logs and uses 0.
    'ornamentation/ornament@repetitions': [-2, NaN, Infinity],
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
        'imprecisionTiming',
        'imprecisionDynamics',
        'imprecisionDuration',
      ]),
    );
    expect(inScope.length).toBeGreaterThan(10);
  });

  it('gives every live expression row a comparison row in the same scale space', () => {
    for (const row of inScope) {
      const elements = row.sites.map((site) => site.element);
      // The DIMENSION is part of the match, and cut 4 is why: `<distribution.uniform>` appears
      // identically in three imprecision maps, so `element@attribute` names three comparison
      // rows rather than one. That non-uniqueness is the documented reason §4 puts the
      // dimension in the key at all, and a superset check that ignored it would count three
      // candidates and fail on a registry that is correct.
      const dimensions = COMPARISON_DIMENSIONS.filter((candidate) =>
        (EXPRESSION_DIMENSION_CORRESPONDENCE[candidate] as readonly string[]).includes(
          row.dimension,
        ),
      );
      const candidates = COMPARISON_REGISTRY_ROWS.filter(
        (comparison) =>
          comparison.attribute === row.attribute &&
          elements.includes(comparison.element) &&
          dimensions.includes(comparison.dimension),
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

  /**
   * §4's whole-inventory partition (R9), finally assertable.
   *
   * The skip this replaces said "needs rows for accentuation, articulation, ornamentation,
   * pedal and the three imprecision dimensions before the partition can close". Cut 4 was the
   * last of them, so it closes here.
   *
   * The inventory is `survey-code.md` §1.2's map table, transcribed as data: for every map,
   * every attribute the RENDERER actually reads, with its source citation. The property is
   * that each one lands in exactly one of three buckets — a registry row, an `inert` row, or a
   * §4 exclusion — and never in two or none. A missing attribute is the failure this exists to
   * catch: it is the one shape of gap that no other test can see, because a dimension with
   * nine of its ten attributes looks complete from the inside.
   */
  const READ_ATTRIBUTES: readonly (readonly [ComparisonDimension | null, string, string])[] = [
    // [dimension | null for a map with no comparison dimension, element, attribute]
    ['tempo', 'tempo', 'bpm'],
    ['tempo', 'tempo', 'beatLength'],
    ['tempo', 'tempo', 'transition.to'],
    ['tempo', 'tempo', 'meanTempoAt'],
    ['dynamics', 'dynamics', 'volume'],
    ['dynamics', 'dynamics', 'transition.to'],
    ['dynamics', 'dynamics', 'curvature'],
    ['dynamics', 'dynamics', 'protraction'],
    ['dynamics', 'dynamics', 'subNoteDynamics'],
    ['rubato', 'rubato', 'frameLength'],
    ['rubato', 'rubato', 'loop'],
    ['rubato', 'rubato', 'intensity'],
    ['rubato', 'rubato', 'lateStart'],
    ['rubato', 'rubato', 'earlyEnd'],
    ['articulation', 'articulation', 'absoluteDuration'],
    ['articulation', 'articulation', 'absoluteDurationChange'],
    ['articulation', 'articulation', 'relativeDuration'],
    ['articulation', 'articulation', 'absoluteDurationMs'],
    ['articulation', 'articulation', 'absoluteDurationChangeMs'],
    ['articulation', 'articulation', 'absoluteVelocityChange'],
    ['articulation', 'articulation', 'absoluteVelocity'],
    ['articulation', 'articulation', 'relativeVelocity'],
    ['articulation', 'articulation', 'absoluteDelayMs'],
    ['articulation', 'articulation', 'absoluteDelay'],
    ['articulation', 'articulation', 'detuneCents'],
    ['articulation', 'articulation', 'detuneHz'],
    ['accentuation', 'accentuationPattern', 'scale'],
    ['accentuation', 'accentuationPattern', 'loop'],
    ['accentuation', 'accentuationPattern', 'stickToMeasures'],
    ['ornamentation', 'ornament', 'note.order'],
    ['ornamentation', 'ornament', 'scale'],
    ['ornamentation', 'ornament', 'repetitions'],
    ['asynchrony', 'asynchrony', 'milliseconds.offset'],
    ['pedal', 'movement', 'position'],
    ['pedal', 'movement', 'transition.to'],
    ['pedal', 'movement', 'curvature'],
    ['pedal', 'movement', 'protraction'],
    ['pedal', 'movement', 'controller'],
    // §1.2's ornament pool children, which no §5 section gives a row.
    ['ornamentation', 'note', 'midi.pitch'],
    ['ornamentation', 'note', 'interval.chromatic'],
    ['ornamentation', 'note', 'interval.diatonic'],
    // The <style> switch, present in every map.
    [null, 'style', 'name.ref'],
    [null, 'style', 'defaultArticulation'],
    // The imprecision maps' own attribute, and per distribution the attributes its own
    // provider CONSUMES.
    //
    // Not everything `DistributionData` parses: it reads all thirteen unconditionally
    // regardless of type (§1.2 says so), so `<distribution.uniform>` carries a parsed
    // `clip.lower` that no uniform provider is ever handed. Listing the parsed set would
    // demand rows for attributes that cannot affect a performance, which is the opposite of
    // what this partition is for. The consumed set is read off the factory calls at
    // `ImprecisionMap.ts:295-347`.
    [null, 'imprecisionMap', 'detuneUnit'],
    ...(['imprecisionTiming', 'imprecisionDynamics', 'imprecisionDuration'] as const).flatMap(
      (dimension) =>
        (
          [
            [
              'distribution.uniform',
              ['seed', 'limit.lower', 'limit.upper', 'milliseconds.timingBasis'],
            ],
            [
              'distribution.gaussian',
              [
                'seed',
                'deviation.standard',
                'limit.lower',
                'limit.upper',
                'milliseconds.timingBasis',
              ],
            ],
            [
              'distribution.triangular',
              [
                'seed',
                'limit.lower',
                'limit.upper',
                'mode',
                'clip.lower',
                'clip.upper',
                'milliseconds.timingBasis',
              ],
            ],
            [
              'distribution.correlated.brownianNoise',
              ['seed', 'stepWidth.max', 'limit.lower', 'limit.upper', 'milliseconds.timingBasis'],
            ],
            [
              'distribution.correlated.compensatingTriangle',
              [
                'seed',
                'degreeOfCorrelation',
                'limit.lower',
                'limit.upper',
                'clip.lower',
                'clip.upper',
                'milliseconds.timingBasis',
              ],
            ],
            ['distribution.list', ['seed', 'milliseconds.timingBasis']],
            ['measurement', ['value']],
          ] as const
        ).flatMap(([element, attributes]) =>
          attributes.map((attribute): readonly [ComparisonDimension, string, string] => [
            dimension,
            element,
            attribute,
          ]),
        ),
    ),
  ];

  /**
   * §4's exclusion walk, as a predicate — every clause with the reason §4 gives it.
   *
   * `@date` is the axis. `xml:id` and `@noteid` are identity — `@noteid` is named explicitly
   * because it is spelled without `.ref` and the pattern would miss it (AD-15/R16). The
   * name-valued attributes go to the structural finding channel by the `@controller`
   * precedent (AD-36.3) — naming a thing is an identity claim, not a magnitude — and the pool
   * `<note>` children are the same case one level down: they say WHICH pitches an ornament
   * generates.
   *
   * `*.ref` is NOT here any more. AD-55.1 moved the two def-naming attributes to
   * {@link RESOLVED_ATTRIBUTES}, because "identity" was the reason a whole renderer-true
   * mechanism went unpriced, and every member of both non-row buckets now carries an executable
   * reason ({@link CLASSIFICATION_PROBES}).
   *
   * `@seed` is §4's own exclusion and it stays one, but its stated RATIONALE is now known to
   * be wrong for two of the six families: "changes no distribution law" holds for the four
   * i.i.d. ones and fails for `brownianNoise` and `compensatingTriangle`, where `setSeed`
   * clears the series `doHandover` had just seeded and every note in the span vanishes
   * (measured). The reader prices those spans `⊥`; the DESIGN sentence is the conductor's to
   * amend, and this comment is here so the gap is not silently inherited.
   */
  const EXCLUDED_ATTRIBUTES: ReadonlyMap<string, string> = new Map([
    ['controller', 'name-valued: the structural finding channel, AD-36.3'],
    ['seed', '§4: not a magnitude — but see the note above on the correlated families'],
    ['detuneUnit', 'the tuning domain is inert (R9b): nothing reads tuning.offset back'],
    ['midi.pitch', 'names WHICH note an ornament generates — an identity claim (AD-41.1)'],
    ['interval.chromatic', 'the same, as an interval'],
    ['interval.diatonic', 'the same, as an interval'],
  ]);

  /**
   * The partition's THIRD bucket: **live, with no row of its own** (AD-55.1).
   *
   * An attribute that names a def is not an exclusion and it is not a row either — it is an
   * indirection whose MAGNITUDES are priced on the def's rows, one resolution away. Filing one
   * with the exclusions was CAPITAL-1's mechanism: `@defaultArticulation` carried the reason
   * "identity: names an articulationDef", which is true of the NAME and says nothing about
   * whether anything resolves it — and for a whole wave nothing did, so three documents at
   * 50/100/mixed durations compared at `D = 0` while the partition test passed.
   *
   * A member of this bucket owes the same debt an exclusion does ({@link CLASSIFICATION_PROBES}),
   * in the strong direction: changing it must MOVE a reported distance.
   */
  const RESOLVED_ATTRIBUTES: ReadonlyMap<string, string> = new Map([
    ['name.ref', 'live: the def it names is read and the def’s own rows are priced'],
    [
      'defaultArticulation',
      'live (AD-55.1): the def it names governs every un-articulated note in the span, and the ' +
        'step function is priced per cell on the same rows an atom is priced on',
    ],
  ]);

  it('every attribute of the survey-code §1.2 inventory appears exactly once (R9)', () => {
    for (const [dimension, element, attribute] of READ_ATTRIBUTES) {
      const excluded = EXCLUDED_ATTRIBUTES.has(attribute);
      const resolved = RESOLVED_ATTRIBUTES.has(attribute);
      const row =
        dimension === null
          ? null
          : (comparisonRowAt(dimension, element, attribute) as ComparisonRegistryRow | null);
      // Exactly one bucket of THREE (AD-55.1). Two would mean the exclusion walk and the table
      // disagree; none would mean an attribute the renderer reads is priced nowhere and
      // reported nowhere.
      const buckets = [row !== null, excluded, resolved].filter(Boolean).length;
      expect(
        `${String(dimension)}/${element}@${attribute}: row=${String(row !== null)} ` +
          `excluded=${String(excluded)} resolved=${String(resolved)} buckets=${String(buckets)}`,
      ).toBe(
        `${String(dimension)}/${element}@${attribute}: row=${String(!excluded && !resolved)} ` +
          `excluded=${String(excluded)} resolved=${String(resolved)} buckets=1`,
      );
    }
  });

  it('the axis and the identity attributes are excluded everywhere, by rule not by omission', () => {
    // §4's four universal exclusions, checked against the table rather than trusted: none of
    // them may have a row in any dimension.
    for (const attribute of ['date', 'xml:id', 'name.ref', 'noteid'])
      expect(
        COMPARISON_REGISTRY_ROWS.filter((row) => row.attribute === attribute).map((r) => r.key),
      ).toEqual([]);
  });

  it('no registry row is missing from the inventory either (the partition closes both ways)', () => {
    // The other direction, which is what makes it a partition rather than a coverage check: a
    // row for an attribute no renderer reads would be pricing a difference that is never
    // performed. Def-site rows are exempt — §1.2 is the MAP inventory, and the defs are §1.3.
    const inventory = new Set(
      READ_ATTRIBUTES.map(
        ([dimension, element, attribute]) => `${String(dimension)}/${element}@${attribute}`,
      ),
    );
    const defElements = new Set([
      'tempoDef',
      'dynamicsDef',
      'accentuationPatternDef',
      'accentuation',
      'dynamicsGradient',
      'temporalSpread',
    ]);
    const orphans = COMPARISON_REGISTRY_ROWS.filter(
      (row) => !defElements.has(row.element) && !inventory.has(row.key),
    ).map((row) => row.key);
    expect(orphans).toEqual([]);
  });

  // -------------------------------------------------------------------------------------
  // AD-55.1's standing obligation: the classification call is itself a renderer claim
  // -------------------------------------------------------------------------------------

  /**
   * Every non-row attribute, with the CHANNEL its performed effect reaches the report through
   * and a probe that shows the channel fires.
   *
   * This is the obligation AD-55.1 attaches to the partition, and it is the check that would
   * have caught CAPITAL-1 the day the classification was written. The partition is only as
   * strong as its three-way call, and until now nothing cross-checked a call against the
   * renderer: `@defaultArticulation` was filed as an exclusion, the filing was never executed,
   * and a document at half duration throughout scored 0.
   *
   * Three channels, each with its own falsifiable shape:
   *
   * - `'priced'` — the magnitudes are priced one resolution away, or the span reads `⊥`.
   *   A pair differing only in this attribute must move `D`.
   * - `'reported'` — the difference is real but is not an expressive magnitude, so §3's
   *   structural channel carries it. `D` must be 0 **and** a note must name it. A channel that
   *   fires no note is not a channel, which is how `@controller`'s came to be wired at all.
   * - `'out-of-scope'` — the difference is confined to a quantity outside the eleven
   *   dimensions. `D` must be 0, and a RENDERER probe must show where the difference went.
   *
   * Every probe runs an EXPLICIT window: these documents are two instructions long, so a
   * pair-derived window would end at the last date and integrate over nothing — which is a real
   * property of §5.0 and not a defect, but it would make every probe here vacuously 0.
   */
  const PROBE_WINDOW = { start: 0, end: 4 };

  const mpm = (header: string, dated: string): XmlText =>
    (`<?xml version="1.0" encoding="UTF-8"?>` +
      `<mpm xmlns="http://www.cemfi.de/mpm/ns/1.0">` +
      `<performance name="P" pulsesPerQuarter="720">` +
      `<global><header>${header}</header><dated>${dated}</dated></global>` +
      `</performance></mpm>`) as XmlText;

  const ARTICULATION_STYLES =
    '<articulationStyles><styleDef name="S">' +
    '<articulationDef name="stacc" relativeDuration="0.5"/>' +
    '<articulationDef name="ten" relativeDuration="1.2"/>' +
    '</styleDef></articulationStyles>';

  const articulation = (styleAttributes: string, atomRef: string) =>
    mpm(
      ARTICULATION_STYLES,
      `<articulationMap><style date="0.0" name.ref="S" ${styleAttributes}/>` +
        `<articulation date="360.0" name.ref="${atomRef}"/></articulationMap>`,
    );

  const movement = (controller: string) =>
    mpm(
      '',
      `<movementMap><movement date="0.0" position="0.0" controller="${controller}"/>` +
        '<movement date="720.0" position="1.0"/></movementMap>',
    );

  const brownian = (seed: string) =>
    mpm(
      '',
      `<imprecisionMap.timing><distribution.correlated.brownianNoise date="0.0" ` +
        `stepWidth.max="10.0" limit.lower="-30.0" limit.upper="30.0" ${seed}/>` +
        '</imprecisionMap.timing>',
    );

  // Seeded, because the out-of-scope probe compares two RENDERED documents and an unseeded
  // uniform draws from Math.random(): without it the probe would measure the RNG (§9.6, R2).
  const imprecisionUnit = (unit: string) =>
    mpm(
      '',
      `<imprecisionMap.timing detuneUnit="${unit}">` +
        '<distribution.uniform date="0.0" seed="7" limit.lower="-30.0" limit.upper="30.0"/>' +
        '</imprecisionMap.timing>',
    );

  const ORNAMENT_STYLES =
    '<ornamentationStyles><styleDef name="O"><ornamentDef name="arp">' +
    '<temporalSpread frameStart="-20.0" frameLength="40.0"/>' +
    '</ornamentDef></styleDef></ornamentationStyles>';

  const poolNote = (attributes: string) =>
    mpm(
      ORNAMENT_STYLES,
      '<ornamentationMap><style date="0.0" name.ref="O"/>' +
        `<ornament date="0.0" name.ref="arp" noteid="#n0" note.order="#p0">` +
        `<note xml:id="p0" ${attributes}/></ornament></ornamentationMap>`,
    );

  /** One note, so a pool note stated as an interval has a principal to be relative to. */
  const POOL_MSM =
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<msm title="probe" pulsesPerQuarter="720"><global><header/><dated/></global>' +
    '<part name="P" number="1" midi.channel="0" midi.port="0"><header/><dated><score>' +
    '<note date="0.0" midi.pitch="60.0" duration="720.0" xml:id="n0"/>' +
    '</score></dated></part></msm>';

  interface ClassificationProbe {
    readonly attribute: string;
    readonly channel: 'priced' | 'reported' | 'out-of-scope';
    readonly a: XmlText;
    readonly b: XmlText;
    /** For `'reported'`: a substring the note must contain. */
    readonly names?: string;
  }

  const CLASSIFICATION_PROBES: readonly ClassificationProbe[] = [
    // --- resolved (live, no row of its own) ---------------------------------------------
    {
      attribute: 'name.ref',
      channel: 'priced',
      a: articulation('', 'stacc'),
      b: articulation('', 'ten'),
    },
    {
      attribute: 'defaultArticulation',
      channel: 'priced',
      a: articulation('defaultArticulation="stacc"', 'stacc'),
      b: articulation('', 'stacc'),
    },
    // --- excluded -----------------------------------------------------------------------
    {
      // `setSeed` clears the series `doHandover` seeded, so the span reads ⊥ and the cap binds:
      // the exclusion is real (the seed is not a magnitude) and the effect is priced anyway.
      attribute: 'seed',
      channel: 'priced',
      a: brownian('seed="99"'),
      b: brownian(''),
    },
    {
      attribute: 'controller',
      channel: 'reported',
      a: movement('sustain'),
      b: movement('soft'),
      names: "'soft'",
    },
    {
      attribute: 'detuneUnit',
      channel: 'out-of-scope',
      a: imprecisionUnit('cents'),
      b: imprecisionUnit('Hz'),
    },
    {
      attribute: 'midi.pitch',
      channel: 'out-of-scope',
      a: poolNote('midi.pitch="60.0"'),
      b: poolNote('midi.pitch="72.0"'),
    },
    {
      attribute: 'interval.chromatic',
      channel: 'out-of-scope',
      a: poolNote('interval.chromatic="1.0"'),
      b: poolNote('interval.chromatic="7.0"'),
    },
    {
      attribute: 'interval.diatonic',
      channel: 'out-of-scope',
      a: poolNote('interval.diatonic="1.0"'),
      b: poolNote('interval.diatonic="4.0"'),
    },
  ];

  it('every non-row attribute carries a renderer-checked reason (AD-55.1)', () => {
    const owed = [...EXCLUDED_ATTRIBUTES.keys(), ...RESOLVED_ATTRIBUTES.keys()].sort();
    const probed = CLASSIFICATION_PROBES.map((probe) => probe.attribute).sort();
    // The debt itself, before any probe runs: a new exclusion with no probe is the exact
    // omission CAPITAL-1 was, and it fails here rather than three waves later.
    expect(probed).toEqual(owed);
  });

  for (const probe of CLASSIFICATION_PROBES)
    it(`@${probe.attribute}'s channel fires: ${probe.channel}`, () => {
      const { report } = compareMpm({ a: probe.a, b: probe.b, window: PROBE_WINDOW });

      if (probe.channel === 'priced') {
        // A resolved indirection that resolves to nothing scores 0, which is CAPITAL-1.
        expect(report.aggregate.distance).toBeGreaterThan(0);
        return;
      }

      expect(report.aggregate.distance).toBe(0);
      if (probe.channel === 'reported') {
        const naming = report.notes.filter((note) => note.message.includes(probe.names ?? ''));
        expect(naming.length).toBeGreaterThan(0);
        return;
      }

      // 'out-of-scope': the renderer DOES perform a difference, and the probe says where it
      // went. Anything but the named quantity would mean the exclusion is hiding a magnitude.
      const perform = (source: XmlText) =>
        String(performMsm({ msm: POOL_MSM as XmlText, mpm: source }));
      if (probe.attribute === 'detuneUnit') {
        expect(perform(probe.a)).toBe(perform(probe.b));
        return;
      }
      const pitches = (source: XmlText) => perform(source).match(/midi\.pitch="[^"]*"/g) ?? [];
      expect(pitches(probe.a)).not.toEqual(pitches(probe.b));
      expect(perform(probe.a).replace(/midi\.pitch="[^"]*"/g, '')).toBe(
        perform(probe.b).replace(/midi\.pitch="[^"]*"/g, ''),
      );
    });
});

/**
 * §7.4's canonicalization inside §4's metric, pinned at the FUNCTION rather than through a
 * dimension — because no shipped row that reaches this function lives in a log space today.
 *
 * `canonicalLocalDistance` places the shift and the scale between `forwardInSpace` and the cap,
 * i.e. in T-space, which is the only placement §7.4's table licenses: a log space's level is a
 * multiplicative factor, and subtracting a mean from the raw BPM is not the same transform as
 * subtracting it from the logarithm. Every row currently routed through here is `gain`, where
 * `T` is the identity and the two placements coincide — so the distinction is real, invisible
 * from any dimension, and therefore pinned here. Same move as RG-2's: when a property stops
 * being observable at one layer, the evidence goes down a layer rather than away.
 */
describe('§4’s metric under §7.4’s canonicalization', () => {
  const bpm = () => rowFor('tempo/tempo@bpm');
  const offset = () => rowFor('asynchrony/asynchrony@milliseconds.offset');
  const identity = { shift: 0, scale: 1 };

  it('applies the shift in T-SPACE, not to the raw value', () => {
    const row = bpm();
    const canonical = {
      a: { shift: Math.log(120), scale: 1 },
      b: { shift: Math.log(60), scale: 1 },
    };
    const measured = canonicalLocalDistance(row, valued(120), valued(60), canonical).distance;
    // Both sides sit exactly at their own level, so the canonicalized difference is 0.
    expect(measured).toBeCloseTo(0, 12);
    // Subtracting the same numbers from the RAW values instead is a different answer, which is
    // the error this placement exists to prevent.
    const rawCanonicalized =
      Math.abs(
        forwardInSpace(row.space, 120 - Math.log(120)) -
          forwardInSpace(row.space, 60 - Math.log(60)),
      ) / row.jnd;
    expect(rawCanonicalized).toBeGreaterThan(1);
  });

  it('scales in T-space too, and reduces to localDistance under the identity pair', () => {
    const row = bpm();
    // 120 against 118 is well under §4's cap, so the doubling is visible; 120 against 60 is
    // already capped at 2·δ_row and doubling a capped value would say nothing.
    const scaled = canonicalLocalDistance(row, valued(120), valued(118), {
      a: { shift: 0, scale: 2 },
      b: { shift: 0, scale: 2 },
    }).distance;
    expect(scaled).toBeCloseTo(2 * localDistance(row, valued(120), valued(118)).distance, 9);
    expect(
      canonicalLocalDistance(row, valued(120), valued(60), { a: identity, b: identity }),
    ).toEqual(localDistance(row, valued(120), valued(60)));
  });

  it('keeps d(x, x) = 0 only when both sides carry the SAME canonicalization', () => {
    const row = offset();
    const same = { a: { shift: 5, scale: 1 }, b: { shift: 5, scale: 1 } };
    expect(canonicalLocalDistance(row, valued(20), valued(20), same).distance).toBe(0);
    // Under 'level' two documents holding one value really are at different distances from
    // their own means — that is the mode, not a defect.
    const different = { a: { shift: 5, scale: 1 }, b: { shift: -5, scale: 1 } };
    expect(canonicalLocalDistance(row, valued(20), valued(20), different).distance).toBeCloseTo(
      10 / row.jnd,
      12,
    );
  });

  it('leaves ⊥ at δ_row whatever the canonicalization is', () => {
    const row = bpm();
    const canonical = { a: { shift: 3, scale: 7 }, b: { shift: -2, scale: 0.5 } };
    expect(canonicalLocalDistance(row, bottom('renderer-error'), valued(60), canonical)).toEqual({
      distance: row.delta,
      capped: true,
    });
    expect(
      canonicalLocalDistance(row, bottom('renderer-error'), bottom('renderer-error'), canonical)
        .distance,
    ).toBe(0);
  });
});
