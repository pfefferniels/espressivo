/**
 * `weightedFactors` and `PROTOTYPE_WEIGHTS` — DESIGN.md D-H's lerp, and the prototype's tuned
 * vector kept as data.
 *
 * Two kinds of claim. The algebra is verifiable — `s = 1` is the identity for any weights,
 * `w = 0` pins a dimension, `w = 1` passes the scalar through — and is tested as such. The
 * preset is a heuristic that nothing derives, so the only honest test of it is that the
 * numbers are the ones the prototype had and that the correspondence onto the fifteen
 * dimensions is the one §3 documents: a pin against drift, not a validation.
 *
 * The last block tests the public `weightedFactors` rather than this module's, because the two
 * are different functions — the interior throws a plain `Error` and the facade exists to turn
 * that into an `InvalidOptionError` (RULE E2).
 */
import { describe, it, expect } from 'vitest';
import {
  InvalidOptionError,
  MeicoError,
  PROTOTYPE_WEIGHTS as PUBLIC_PROTOTYPE_WEIGHTS,
  canonicalMpm,
  exaggerateMpm,
  weightedFactors as publicWeightedFactors,
  type XmlText,
} from '../../src/api/index.js';
import { applyExaggeration } from '../../src/expression/applier.js';
import { parseMpmRoot, serializeMpmRoot } from '../../src/expression/mpmDocument.js';
import { EXPRESSION_DIMENSIONS, type ExpressionDimension } from '../../src/expression/registry.js';
import {
  IDENTITY_WEIGHT,
  PROTOTYPE_WEIGHTS,
  weightedFactors,
  type ExaggerationWeights,
} from '../../src/expression/weights.js';
import { MPM_NAMESPACE } from '../../src/mpm/names.js';
import { elementAt } from '../../src/prelude/index.js';

const IDENTITY_RECORD: Record<ExpressionDimension, number> = Object.fromEntries(
  EXPRESSION_DIMENSIONS.map((dimension) => [dimension, 1]),
) as Record<ExpressionDimension, number>;

/**
 * Two maps, one weighted by the preset and one not, so a run can show the damping as an
 * ordering between two attributes of the same document rather than as a bare number.
 */
const DOCUMENT =
  `<mpm xmlns="${MPM_NAMESPACE}"><performance name="P"><global><header/><dated>` +
  '<rubatoMap><rubato id="r" date="0.0" frameLength="720.0" intensity="0.5"/></rubatoMap>' +
  '<asynchronyMap><asynchrony id="a" date="0.0" milliseconds.offset="20.0"/></asynchronyMap>' +
  '</dated></global></performance></mpm>';

describe('weightedFactors: the algebra D-H specifies', () => {
  it.each<[string, ExaggerationWeights]>([
    ['no weights at all', {}],
    ['the prototype preset', PROTOTYPE_WEIGHTS],
    ['a zero weight', { rubato: 0 }],
    ['an overdriving weight', { accentuation: 4.5 }],
    ['a negative weight', { tempo: -2 }],
  ])('s = 1 is the identity record under %s', (_why, weights) => {
    expect(weightedFactors(1, weights)).toEqual(IDENTITY_RECORD);
  });

  it.each([0, 0.25, 1, 1.6, 3])('w = 0 pins its dimension to 1 at s = %s', (s) => {
    expect(weightedFactors(s, { rubato: 0 }).rubato).toBe(1);
  });

  it.each([0, 0.25, 1.6, 3])('w = 1 passes s straight through at s = %s', (s) => {
    expect(weightedFactors(s, { tempo: IDENTITY_WEIGHT }).tempo).toBe(s);
    // …and so does a missing key, which is what makes the default "no weighting".
    expect(weightedFactors(s, {}).tempo).toBe(s);
  });

  it('interpolates linearly between 1 and s', () => {
    // 1 + 0.2·(2 − 1) = 1.2: the prototype's rubato at a slider of 2.
    expect(weightedFactors(2, { rubato: 0.2 }).rubato).toBeCloseTo(1.2, 12);
    expect(weightedFactors(0.5, { rubato: 0.2 }).rubato).toBeCloseTo(0.9, 12);
    expect(weightedFactors(3, { accentuation: 1.3 }).accentuation).toBeCloseTo(3.6, 12);
  });

  it('returns every dimension, so the record says what the run will apply', () => {
    expect(Object.keys(weightedFactors(2, { tempo: 0.5 })).sort()).toEqual(
      [...EXPRESSION_DIMENSIONS].sort(),
    );
  });

  it('lets a weight above 1 drive a factor negative, and leaves the domain rule to the engine', () => {
    // Documented rather than clamped: `ornamentSpread`'s scale space runs over a half-line, so
    // −0.05 is outside its admissible domain and `exaggerateMpm` rejects it by name. This
    // function cannot know which dimensions have a half-line.
    expect(weightedFactors(0.3, { ornamentSpread: 1.5 }).ornamentSpread).toBeCloseTo(-0.05, 12);
  });

  it.each<[string, number, ExaggerationWeights]>([
    ['a non-finite scalar', NaN, {}],
    ['an infinite scalar', Infinity, {}],
    ['a non-finite weight', 2, { tempo: NaN }],
    ['an unknown dimension', 2, { tempoShapes: 0.5 } as ExaggerationWeights],
  ])('rejects %s', (_why, s, weights) => {
    expect(() => weightedFactors(s, weights)).toThrow(Error);
  });

  it('names the offender in the message, which is the part a facade cannot reconstruct', () => {
    expect(() => weightedFactors(2, { rubatoo: 1 } as ExaggerationWeights)).toThrow(/rubatoo/);
    expect(() => weightedFactors(2, { rubato: NaN })).toThrow(/rubato/);
  });
});

describe('PROTOTYPE_WEIGHTS: the correspondence §3 documents, pinned against drift', () => {
  it('carries all fifteen dimensions, so nothing is silently defaulted', () => {
    expect(Object.keys(PROTOTYPE_WEIGHTS).sort()).toEqual([...EXPRESSION_DIMENSIONS].sort());
  });

  it.each<[string, ExpressionDimension, number]>([
    ['tempo → tempo', 'tempo', 1.0],
    ['tempo → tempoShape (A9 split it after the vector was tuned)', 'tempoShape', 1.0],
    ['dynamics → dynamics', 'dynamics', 1.1],
    ['dynamics → dynamicsShape', 'dynamicsShape', 1.1],
    ['rubato → rubato', 'rubato', 0.2],
    ['accentuation → accentuation', 'accentuation', 1.3],
    ['temporalSpread → ornamentSpread', 'ornamentSpread', 1.5],
    ['temporalSpread → ornamentSpacing', 'ornamentSpacing', 1.5],
    ['dynamicsGradient → ornamentDynamics', 'ornamentDynamics', 0.3],
  ])('%s = %s', (_why, dimension, weight) => {
    expect(PROTOTYPE_WEIGHTS[dimension]).toBe(weight);
  });

  it("collapses the prototype's two articulation fields onto the LOWER of the two", () => {
    // 0.2 (relativeDuration) and 0.3 (relativeVelocity) became one dimension here, and §3 takes
    // the smaller: articulation is the most violent lever in the set, since s = 2 on a
    // relativeDuration of 0.7 leaves 0.49 — half the note gone.
    expect(PROTOTYPE_WEIGHTS.articulation).toBe(0.2);
  });

  it.each<ExpressionDimension>([
    'asynchrony',
    'imprecisionTiming',
    'imprecisionDynamics',
    'imprecisionDuration',
    'pedalShape',
  ])('%s is unweighted, because the prototype had no such field', (dimension) => {
    // Pinned against the literal 1, like the nine tuned rows above, rather than against
    // IDENTITY_WEIGHT: asserting `PROTOTYPE_WEIGHTS[d] === IDENTITY_WEIGHT` where the constant
    // is defined as IDENTITY_WEIGHT is a tautology that survives redefining it — setting
    // IDENTITY_WEIGHT = 2 leaves such a block green.
    expect(PROTOTYPE_WEIGHTS[dimension]).toBe(1);
  });

  it('spells the neutral weight 1, which is what makes the row above a real constraint', () => {
    expect(IDENTITY_WEIGHT).toBe(1);
  });

  it.each<[ExpressionDimension, number, string]>([
    ['dynamicsShape', 1.1, 'the prototype had no dynamics curve-shape lever at all'],
    ['ornamentSpacing', 1.5, 'the prototype scaled @frameLength only, never @intensity'],
    ['ornamentDynamics', 0.3, "the prototype's field of that name scaled ornament@scale"],
  ])('%s takes %s by decision rather than by inheritance', (dimension, weight) => {
    // These three are weighted although the prototype had no corresponding lever (verified
    // against ModifyService.java); why each is non-neutral anyway is in the constant's own
    // documentation. Pinned so that the numbers and that rationale have to move together.
    expect(PROTOTYPE_WEIGHTS[dimension]).toBe(weight);
    expect(PROTOTYPE_WEIGHTS[dimension]).not.toBe(1);
  });

  it('damps a weighted dimension relative to an unweighted one at the same scalar', () => {
    const factors = weightedFactors(2, PROTOTYPE_WEIGHTS);
    expect(factors.rubato).toBeLessThan(factors.tempo ?? 0);
    expect(factors.accentuation).toBeGreaterThan(factors.tempo ?? 0);
    expect(factors.asynchrony).toBe(2);
  });
});

describe('weightedFactors composes with the engine', () => {
  const run = (weights: ExaggerationWeights, s: number) => {
    const root = parseMpmRoot(DOCUMENT);
    const report = applyExaggeration(root, weightedFactors(s, weights));
    return { xml: serializeMpmRoot(root), report };
  };

  it('an all-ones scalar leaves the document exactly as the identity does', () => {
    const baseline = serializeMpmRoot(parseMpmRoot(DOCUMENT));
    const { xml, report } = run(PROTOTYPE_WEIGHTS, 1);
    expect(xml).toBe(baseline);
    expect(report.totalWrites).toBe(0);
  });

  it('a preset moves a damped dimension less than an undamped one at the same scalar', () => {
    // rubato's authored intensity is 0.5 in a log-around-1 space, so the preset's factor of 1.2
    // moves it less than the raw scalar's 2, while unweighted asynchrony takes the full 2.
    const weighted = run(PROTOTYPE_WEIGHTS, 2);
    const raw = run({}, 2);
    const intensity = (xml: string) => Number(/intensity="([^"]*)"/.exec(xml)?.[1]);
    const offset = (xml: string) => Number(/milliseconds\.offset="([^"]*)"/.exec(xml)?.[1]);

    expect(intensity(weighted.xml)).toBeGreaterThan(intensity(raw.xml));
    expect(intensity(weighted.xml)).toBeLessThan(0.5);
    expect(offset(weighted.xml)).toBe(offset(raw.xml));
    expect(offset(weighted.xml)).toBe(40);
  });

  it('a zero weight leaves its dimension byte-identical while its neighbour moves', () => {
    const { xml, report } = run({ rubato: 0 }, 2);
    expect(xml).toContain('intensity="0.5"');
    expect(xml).toContain('milliseconds.offset="40"');
    expect(
      elementAt(report.performances, 0, 'the report’s performances').dimensions.rubato.state,
    ).toBe('skipped');
  });
});

// ---------------------------------------------------------------------------
// The PUBLIC weightedFactors — a different function from the one above
// ---------------------------------------------------------------------------

/**
 * The facade export, whose only added behaviour is the typed-error boundary (RULE E2).
 *
 * Everything above imports `src/expression/weights.js`, which throws a plain `Error`, and so
 * leaves the wrapper at `src/api/expression.ts` untested: deleting its try/catch outright
 * leaves the rest of the suite green. These are the assertions that make it load-bearing.
 */
describe('the public weightedFactors types the interior errors (RULE E2)', () => {
  it.each<[string, number, ExaggerationWeights]>([
    ['a non-finite scalar', NaN, {}],
    ['an infinite scalar', Infinity, {}],
    ['a non-finite weight', 2, { tempo: NaN }],
    ['an unknown dimension', 2, { tempoShapes: 0.5 } as ExaggerationWeights],
  ])('rejects %s as an InvalidOptionError', (_why, s, weights) => {
    expect(() => publicWeightedFactors(s, weights)).toThrow(InvalidOptionError);
    // …and therefore as a MeicoError, which is what a caller catching the root branches on.
    expect(() => publicWeightedFactors(s, weights)).toThrow(MeicoError);
  });

  it.each<[string, number, ExaggerationWeights, RegExp]>([
    ['the unknown key', 2, { rubatoo: 1 } as ExaggerationWeights, /rubatoo/],
    ['the dimension whose weight is not finite', 2, { rubato: NaN }, /rubato/],
    ['the scalar', NaN, {}, /scalar must be finite/],
  ])('keeps %s in the message the interior wrote', (_why, s, weights, expected) => {
    expect(() => publicWeightedFactors(s, weights)).toThrow(expected);
  });

  it('preserves the interior error as `cause`, so the original is not lost', () => {
    try {
      publicWeightedFactors(2, { rubatoo: 1 } as ExaggerationWeights);
      expect.unreachable('the unknown key should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(InvalidOptionError);
      expect((error as Error).cause).toBeInstanceOf(Error);
      expect(((error as Error).cause as Error).message).toContain('rubatoo');
    }
  });

  it('computes the same record as the interior on the success path', () => {
    expect(publicWeightedFactors(1.6, PUBLIC_PROTOTYPE_WEIGHTS)).toEqual(
      weightedFactors(1.6, PROTOTYPE_WEIGHTS),
    );
  });

  it('re-exports the very same preset, not a copy that could drift', () => {
    expect(PUBLIC_PROTOTYPE_WEIGHTS).toBe(PROTOTYPE_WEIGHTS);
  });

  it('composes with exaggerateMpm, which is the round trip the docstring advertises', () => {
    const mpm = DOCUMENT as XmlText;
    // s = 1 through the preset is the identity, whatever the weights are…
    expect(
      exaggerateMpm(mpm, { factors: publicWeightedFactors(1, PUBLIC_PROTOTYPE_WEIGHTS) }).mpm,
    ).toBe(canonicalMpm(mpm));
    // …and s = 2 is not, with rubato damped by its 0.2 weight relative to unweighted asynchrony.
    const { mpm: moved, report } = exaggerateMpm(mpm, {
      factors: publicWeightedFactors(2, PUBLIC_PROTOTYPE_WEIGHTS),
    });
    expect(report.totalWrites).toBeGreaterThan(0);
    expect(moved).toContain('milliseconds.offset="40"');
    expect(Number(/intensity="([^"]*)"/.exec(moved)?.[1])).toBeGreaterThan(
      Number(/intensity="([^"]*)"/.exec(exaggerateMpm(mpm, { factors: { rubato: 2 } }).mpm)?.[1]),
    );
  });

  it('rejects a factor its own lerp produced but the engine will not accept', () => {
    // The documented division of labour: `weightedFactors` interpolates and does not police the
    // per-dimension admissible domains, so a weight above 1 with s < 1 yields a negative factor
    // that `exaggerateMpm` — not this function — rejects, naming the dimension.
    const factors = publicWeightedFactors(0.3, { ornamentSpread: 1.5 });
    expect(factors.ornamentSpread).toBeLessThan(0);
    expect(() => exaggerateMpm(DOCUMENT as XmlText, { factors })).toThrow(InvalidOptionError);
    expect(() => exaggerateMpm(DOCUMENT as XmlText, { factors })).toThrow(/ornamentSpread/);
  });

  it('hands both shared constants out frozen, so a consumer cannot widen the vocabulary', () => {
    // These are the same objects the engine reads, and `readonly`/`as const` are compile-time
    // only: unfrozen, `EXPRESSION_DIMENSIONS.push('bogus')` would make `{bogus: 2}` a legal
    // factor record process-wide, and a written `PROTOTYPE_WEIGHTS` would re-tune every run.
    expect(Object.isFrozen(EXPRESSION_DIMENSIONS)).toBe(true);
    expect(Object.isFrozen(PUBLIC_PROTOTYPE_WEIGHTS)).toBe(true);

    expect(() => (EXPRESSION_DIMENSIONS as unknown as string[]).push('bogus')).toThrow(TypeError);
    expect(() => {
      (PUBLIC_PROTOTYPE_WEIGHTS as unknown as Record<string, number>).tempo = 99;
    }).toThrow(TypeError);

    expect(EXPRESSION_DIMENSIONS).toHaveLength(15);
    expect(PUBLIC_PROTOTYPE_WEIGHTS.tempo).toBe(1);
    expect(() =>
      exaggerateMpm(DOCUMENT as XmlText, {
        factors: { bogus: 2 } as unknown as Record<ExpressionDimension, number>,
      }),
    ).toThrow(InvalidOptionError);
  });
});
