/**
 * The registry as data: DESIGN.md §7's rows, §7.16's exclusions, and the two derivations the
 * applier depends on (a dimension's admissible s-domain, a distribution's atomic group).
 *
 * The exclusion suite is the one worth reading twice. §7.16 is documentation and not data, so
 * "excluded" cannot be asserted by looking something up — it can only be asserted by looking
 * something up and getting nothing. Every entry below is an attribute a plausible
 * implementation would have written, and each has a specific reason it must not.
 */
import { describe, expect, it } from 'vitest';
import {
  DISTRIBUTION_ELEMENTS,
  EXCLUDED_ARTICULATION_LEVERS,
  EXPRESSION_DIMENSIONS,
  IMPRECISION_DIMENSION_MAPS,
  REGISTRY_ROWS,
  bindRowSpace,
  factorDomainOf,
  imprecisionGroupAttributes,
  rowFor,
  rowForIn,
  rowsOf,
  scaleSpaceTagOf,
  siteKindsOf,
} from '../../src/expression/registry.js';
import { SCALE_SPACE_FACTOR_DOMAINS } from '../../src/expression/transforms.js';
import { elementAt } from '../../src/prelude/index.js';

describe('the dimension vocabulary (§3, A9)', () => {
  it('is exactly the fifteen of dimension set v2, with no duplicates', () => {
    expect(EXPRESSION_DIMENSIONS).toHaveLength(15);
    expect(new Set(EXPRESSION_DIMENSIONS).size).toBe(15);
  });

  it('gives every dimension at least one live attribute', () => {
    for (const dimension of EXPRESSION_DIMENSIONS) {
      expect(rowsOf(dimension).length).toBeGreaterThan(0);
    }
  });

  it('assigns every row to a declared dimension and at least one site', () => {
    for (const row of REGISTRY_ROWS) {
      expect(EXPRESSION_DIMENSIONS).toContain(row.dimension);
      expect(row.sites.length).toBeGreaterThan(0);
    }
  });
});

describe('site discipline (§7, D-C)', () => {
  it('puts the level pair on the instruction and the level itself on the def', () => {
    expect(siteKindsOf(rowFor('tempo', 'bpm')!)).toBe('instruction');
    expect(siteKindsOf(rowFor('tempoDef', 'value')!)).toBe('def');
    expect(siteKindsOf(rowFor('dynamics', 'transition.to')!)).toBe('instruction');
  });

  it('covers both sites for the families that carry the same attributes on each', () => {
    expect(siteKindsOf(rowFor('rubato', 'intensity')!)).toBe('both');
    expect(siteKindsOf(rowFor('articulation', 'relativeVelocity')!)).toBe('both');
  });

  it('puts accentuation on the instruction and the ornament gradient on the def', () => {
    // The invariant is "one site per degree-1 product", not "always the instruction": for
    // accentuation the def triple is the degree-1 partner, for the gradient it is `@scale`.
    expect(siteKindsOf(rowFor('accentuationPattern', 'scale')!)).toBe('instruction');
    expect(siteKindsOf(rowFor('dynamicsGradient', 'transition.from')!)).toBe('def');
  });
});

describe('§7.1 — the center population is a registry property', () => {
  it('marks exactly the two prevailing levels and the two def values', () => {
    const inPopulation = REGISTRY_ROWS.filter((row) => row.inCenterPopulation).map(
      (row) =>
        `${elementAt(row.sites, 0, `the sites of @${row.attribute}`).element}@${row.attribute}`,
    );
    expect(inPopulation.sort()).toEqual([
      'dynamics@volume',
      'dynamicsDef@value',
      'tempo@bpm',
      'tempoDef@value',
    ]);
  });

  it('excludes @transition.to although it is a level row of the same dimension', () => {
    expect(rowFor('tempo', 'transition.to')!.inCenterPopulation).toBe(false);
    expect(rowFor('dynamics', 'transition.to')!.inCenterPopulation).toBe(false);
  });
});

describe('§1/A3 — a dimension’s s-domain is the intersection over its rows', () => {
  it('is non-negative wherever any row lives on a half-line or carries an ordering', () => {
    const nonNegative = EXPRESSION_DIMENSIONS.filter(
      (dimension) => factorDomainOf(dimension) === 'non-negative',
    );
    expect(nonNegative.sort()).toEqual([
      'accentuation',
      'dynamicsShape',
      'imprecisionDuration',
      'imprecisionDynamics',
      'imprecisionTiming',
      'ornamentSpread',
      'pedalShape',
      'rubato',
    ]);
  });

  it('constrains ornamentSpread through @frameLength alone, in either generation', () => {
    // Both offset spellings are signed gains admitting every real s; `@frameLength` is an
    // ordered one. The dimension scales the pair by ONE factor, so its domain is the stricter
    // of the two — which is also what §8's `0 … 4` sampling range assumes. v3 adds a spelling,
    // not a space: `@frame.offset` and its legacy alias `@frame.start` are the same row shape,
    // and `@frameLength` is literally one shared row (§7.15).
    for (const attribute of ['frame.start', 'frame.offset']) {
      expect(
        SCALE_SPACE_FACTOR_DOMAINS[scaleSpaceTagOf(rowFor('temporalSpread', attribute)!.space)],
      ).toBe('real');
    }
    expect(
      SCALE_SPACE_FACTOR_DOMAINS[scaleSpaceTagOf(rowFor('temporalSpread', 'frameLength')!.space)],
    ).toBe('non-negative');
    expect(factorDomainOf('ornamentSpread')).toBe('non-negative');
  });

  it('gives the two offset spellings the same space, domain and verdict (§7.15)', () => {
    // What differs between them is the value ENCODING and which generation writes them, and
    // neither is a row property — so a divergence here would mean the same musical quantity had
    // acquired two different transforms by accident.
    const v2 = rowFor('temporalSpread', 'frame.start')!;
    const v3 = rowFor('temporalSpread', 'frame.offset')!;
    expect(v3.dimension).toBe(v2.dimension);
    expect(v3.space).toEqual(v2.space);
    expect(v3.p5r).toBe(v2.p5r);
    expect(v3.inCenterPopulation).toBe(v2.inCenterPopulation);
    for (const value of [-22, 0, 44, 1e9]) {
      expect(v3.valueDomain(value)).toBe(v2.valueDomain(value));
    }
  });

  it('leaves the pure log and gain dimensions on all of ℝ', () => {
    expect(factorDomainOf('tempo')).toBe('real');
    expect(factorDomainOf('articulation')).toBe('real');
    expect(factorDomainOf('asynchrony')).toBe('real');
  });
});

describe('scale spaces bind at the right moment', () => {
  it('leaves the level rows unbound until a center exists', () => {
    const row = rowFor('tempo', 'bpm')!;
    expect(bindRowSpace(row.space, null)).toBeNull();
    expect(bindRowSpace(row.space, 96)).toEqual({ kind: 'log-around-center', center: 96 });
  });

  it('has no scalar form for the rubato window, which is a pair transform', () => {
    expect(bindRowSpace(rowFor('rubato', 'lateStart')!.space, null)).toBeNull();
    expect(bindRowSpace(rowFor('rubato', 'lateStart')!.space, 1)).toBeNull();
  });

  it('binds every other row without parameters', () => {
    expect(bindRowSpace(rowFor('dynamics', 'curvature')!.space, null)).toEqual({
      kind: 'boundary-power-low',
    });
    expect(bindRowSpace(rowFor('movement', 'protraction')!.space, null)).toEqual({
      kind: 'logit',
      lower: -1,
      upper: 1,
    });
  });
});

describe('§7’s input predicates', () => {
  it('narrows meanTempoAt to the OPEN unit interval its space would admit closed', () => {
    const row = rowFor('tempo', 'meanTempoAt')!;
    expect(row.valueDomain(0.5)).toBe(true);
    expect(row.valueDomain(0)).toBe(false);
    expect(row.valueDomain(1)).toBe(false);
  });

  it('admits the boundary fixed points §7.5 and §7.14 declare admissible', () => {
    expect(rowFor('dynamics', 'curvature')!.valueDomain(1)).toBe(true);
    expect(rowFor('movement', 'protraction')!.valueDomain(-1)).toBe(true);
    expect(rowFor('movement', 'protraction')!.valueDomain(1)).toBe(true);
  });

  it('rejects the degeneracies §7.6 and §7.10 name', () => {
    expect(rowFor('rubato', 'intensity')!.valueDomain(0)).toBe(false);
    expect(rowFor('temporalSpread', 'intensity')!.valueDomain(-1)).toBe(false);
  });

  it('rejects a non-finite value in every row without exception (A4)', () => {
    for (const row of REGISTRY_ROWS) {
      expect(row.valueDomain(NaN)).toBe(false);
      expect(row.valueDomain(Infinity)).toBe(false);
      expect(row.valueDomain(-Infinity)).toBe(false);
    }
  });

  it('lets a gain row take any finite sign, since nothing enforces a range', () => {
    const gradient = rowFor('dynamicsGradient', 'transition.from')!;
    expect(gradient.valueDomain(-5)).toBe(true);
    expect(gradient.valueDomain(5)).toBe(true);
  });
});

describe('§7.13 — the imprecision groups', () => {
  it('repeats the same six distributions across the three domains', () => {
    expect(DISTRIBUTION_ELEMENTS).toHaveLength(6);
    for (const dimension of [
      'imprecisionTiming',
      'imprecisionDynamics',
      'imprecisionDuration',
    ] as const) {
      expect(IMPRECISION_DIMENSION_MAPS[dimension]).toBeDefined();
      expect(imprecisionGroupAttributes(dimension, 'distribution.uniform')).toEqual([
        'limit.lower',
        'limit.upper',
      ]);
      expect(imprecisionGroupAttributes(dimension, 'distribution.gaussian')).toEqual([
        'deviation.standard',
        'limit.lower',
        'limit.upper',
      ]);
      expect(imprecisionGroupAttributes(dimension, 'distribution.triangular')).toHaveLength(5);
      expect(
        imprecisionGroupAttributes(dimension, 'distribution.correlated.brownianNoise'),
      ).toEqual(['stepWidth.max', 'limit.lower', 'limit.upper']);
      expect(
        imprecisionGroupAttributes(dimension, 'distribution.correlated.compensatingTriangle'),
      ).toEqual(['limit.lower', 'limit.upper', 'clip.lower', 'clip.upper']);
    }
  });

  it('excludes @degreeOfCorrelation from the compensating triangle’s group', () => {
    // A shape parameter with neutral 1.0, not a width. Asserted by name rather than by
    // length, which a substitution would slip past.
    for (const dimension of [
      'imprecisionTiming',
      'imprecisionDynamics',
      'imprecisionDuration',
    ] as const) {
      expect(
        imprecisionGroupAttributes(dimension, 'distribution.correlated.compensatingTriangle'),
      ).not.toContain('degreeOfCorrelation');
    }
  });

  it('puts the measurement list’s group on the child, not on the distribution', () => {
    expect(imprecisionGroupAttributes('imprecisionTiming', 'distribution.list')).toEqual([]);
    expect(imprecisionGroupAttributes('imprecisionTiming', 'measurement')).toEqual(['value']);
  });

  it('needs the dimension to disambiguate a shared (element, attribute) pair', () => {
    // The one place `rowFor` is ambiguous: the same distribution appears in three maps, so the
    // space and the domain agree while the dimension does not.
    const anonymous = rowFor('distribution.uniform', 'limit.lower')!;
    const timing = rowForIn('imprecisionTiming', 'distribution.uniform', 'limit.lower')!;
    const duration = rowForIn('imprecisionDuration', 'distribution.uniform', 'limit.lower')!;
    expect(timing.dimension).toBe('imprecisionTiming');
    expect(duration.dimension).toBe('imprecisionDuration');
    expect(anonymous.space).toEqual(timing.space);
    expect(rowForIn('imprecisionTiming', 'distribution.uniform', 'mode')).toBeNull();
  });
});

describe('§7.16 — an excluded attribute has no row, because a row is a licence to write', () => {
  it.each([
    ['tempo', 'beatLength', 'a unit declaration; scaling it by k is scaling bpm by 1/k'],
    ['tempo', 'date.end', 'a transient MEI-conversion working attribute'],
    ['dynamics', 'subNoteDynamics', 'a boolean mode switch, read for its range regime'],
    ['rubato', 'frameLength', 'no neutral: it cancels out of the identity case for every value'],
    ['rubato', 'loop', 'a boolean, and never inherited from the def'],
    ['rubatoDef', 'frameLength', 'the def side of the same non-neutral quantity'],
    ['articulationDef', 'absoluteDuration', 'D-B: a replacement whose neutral lives in the MSM'],
    ['articulation', 'absoluteDurationMs', 'D-B: the staccato-family lopsidedness lever'],
    ['articulation', 'absoluteVelocity', 'D-B: a replacement, neutral = absent'],
    ['articulation', 'detuneCents', 'a pitch attribute per R5, and inert besides'],
    ['articulation', 'detuneHz', 'a pitch attribute, and Hz is not perceptually linear'],
    ['accentuation', 'value', 'D-C: the degree-1 partner of accentuationPattern@scale'],
    ['accentuation', 'transition.to', 'the same triple'],
    ['accentuation', 'beat', 'a position, with no neutral'],
    ['accentuationPatternDef', 'length', 'a loop period; scaling it moves WHEN accents land'],
    ['accentuationPattern', 'loop', 'a boolean, read for the span it decides'],
    ['accentuationPattern', 'stickToMeasures', 'a boolean whose absent-default is true'],
    ['ornament', 'scale', 'RESOLVED-6: the degree-1 partner, and a dead lever'],
    ['temporalSpread', 'time.unit', 'an enum, read to know the magnitude scale'],
    ['temporalSpread', 'noteoff.shift', 'an enum that flips the SIGN of the effect'],
    ['distribution.uniform', 'seed', 'it selects which realisation is drawn, not how large'],
    ['distribution.uniform', 'milliseconds.timingBasis', 'a sampling grain, not a magnitude'],
    ['distribution.correlated.compensatingTriangle', 'degreeOfCorrelation', 'neutral 1.0 shape'],
    ['movement', 'position', 'D-G: controller state, not a deviation from a neutral'],
    ['movement', 'transition.to', 'D-G: the same, and exact 0.0/1.0 is a pole for every candidate'],
    ['tempo', 'date', 'R5: a timeline coordinate has no neutral'],
    ['dynamics', 'date', 'R5'],
    ['performance', 'pulsesPerQuarter', 'a resolution declaration'],
  ])('has no row for %s@%s (%s)', (element, attribute) => {
    expect(rowFor(element, attribute)).toBeNull();
  });

  it('still names the articulation levers it must READ to classify a site partial', () => {
    // F10: all FIVE §7.16 exclusions of this element, not only D-B's three replacements. The
    // ratified rule is "an excluded component beside a transformed one", and the two pitch
    // levers are excluded components of the same element.
    expect(EXCLUDED_ARTICULATION_LEVERS).toEqual([
      'absoluteDuration',
      'absoluteDurationMs',
      'absoluteVelocity',
      'detuneCents',
      'detuneHz',
    ]);
    for (const lever of EXCLUDED_ARTICULATION_LEVERS) {
      expect(rowFor('articulationDef', lever)).toBeNull();
    }
  });
});
