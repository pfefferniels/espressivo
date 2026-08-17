/**
 * §6's edit path on all eleven dimensions — the DP meeting real maps.
 *
 * `editScript.test.ts` checks the search; this file checks that what it searches over is the
 * documents. Four claims, each with a test that can fail:
 *
 * 1. `S(0,0)` and `S(n,m)` really ARE `A` and `B`, so `directDistance` is the `d_k` the
 *    comparison reports. That is one assertion and it covers the whole edit-state machinery —
 *    the mixed view, the per-entry resolution, the span rules — because any of them being wrong
 *    moves the endpoints.
 * 2. §6.2's two theorems and §6.3's verification, on real documents rather than on a toy `Φ`.
 * 3. Resolution TRAVELS with the instruction: two performances whose `<tempo>` elements are
 *    byte-identical and whose `styleDef`s differ compare at a real distance, and the replay
 *    still lands on B.
 * 4. The localization is EXACT: `affectedTicks`' interval gives bit-identical totals to
 *    integrating over the whole window, over the vendored corpus and the adversarial family.
 *    This is the AD-30/AD-31 lesson applied before the fact — the argument for the interval is
 *    in `editState.ts`, and the argument is not the evidence.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { readComparisonPair } from '../../src/comparison/document.js';
import {
  editScriptForDimension,
  evaluateDimension,
  type DimensionEditScript,
  type DimensionSettings,
  type ScopeSide,
} from '../../src/comparison/dimensions.js';
import { COMPARISON_DIMENSIONS, type ComparisonDimension } from '../../src/comparison/registry.js';
import { EPSILON_FAMILY_OF } from '../../src/comparison/report.js';
import { epsilonRecord } from '../../src/comparison/compare.js';
import { DEFAULT_LAMBDA_DATE } from '../../src/comparison/eventAlignment.js';
import type { InvarianceMode } from '../../src/comparison/decomposition.js';
import { ADVERSARIAL_FAMILY, ADVERSARIAL_WINDOW } from './adversarialFamily.js';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');
const fixture = (name: string) => readFileSync(join(FIXTURES, `${name}.mpm`), 'utf-8');

const NO_INVARIANCE = Object.fromEntries(
  COMPARISON_DIMENSIONS.map((dimension) => [dimension, 'none']),
) as Record<ComparisonDimension, InvarianceMode>;

interface Bench {
  readonly a: ScopeSide;
  readonly b: ScopeSide;
  readonly settings: DimensionSettings;
}

/** One pair's global scope, which is the scope every vendored document's maps live in. */
function bench(
  textA: string,
  performanceA: number | string,
  performanceB: number | string,
  options: {
    readonly b?: string;
    readonly window?: { start: number; end: number };
    /** Which scope to evaluate; the default is the global one every vendored map lives in. */
    readonly scopeIndex?: number;
  } = {},
): Bench | null {
  const pair = readComparisonPair({
    a: textA,
    b: options.b,
    performanceA,
    performanceB,
    window: options.window ?? null,
  });
  const index = options.scopeIndex ?? 0;
  const globalA = pair.a.scopes[index] as (typeof pair.a.scopes)[number] | undefined;
  const globalB = pair.b.scopes[index] as (typeof pair.b.scopes)[number] | undefined;
  // Null rather than a throw: the vendored documents carry different part counts, and a loop
  // over scope indices should skip the ones a document does not have.
  if (globalA === undefined || globalB === undefined) return null;
  return {
    a: { role: 'a', document: pair.a, scope: globalA },
    b: { role: 'b', document: pair.b, scope: globalB },
    settings: {
      window: pair.window,
      ticksPerQuarter: pair.ppq.lcm,
      jnd: {},
      invariance: NO_INVARIANCE,
      beatGrid: null,
      lambdaDate: DEFAULT_LAMBDA_DATE,
    },
  };
}

function scriptsOf(
  target: Bench,
  options: { readonly localize?: boolean } = {},
  dimensions: readonly ComparisonDimension[] = COMPARISON_DIMENSIONS,
): readonly DimensionEditScript[] {
  return dimensions.map((dimension) =>
    editScriptForDimension(dimension, target.a, target.b, target.settings, options),
  );
}

/** For the tests that name one scope and must have it. */
function requireBench(...args: Parameters<typeof bench>): Bench {
  const target = bench(...args);
  if (target === null) throw new Error('no such scope');
  return target;
}

const REFERENCE_PAIRS = [
  ['telemann-grave', 0, 1],
  ['vulpius-die-helle-sonn', 0, 1],
  ['albert-du-mein-einzig-licht', 0, 1],
] as const;

/**
 * The relative band the theorem is asserted in — quadrature, not slack.
 *
 * `1e-4` covers the worst measured shortfall on the vendored corpus (rubato, Telemann part 2,
 * `7.51e-5`); every other dimension's worst is below `1e-6` (dynamics `8.60e-7`, the rest
 * exactly 0). Both figures are asserted, so the band cannot quietly absorb a regression.
 *
 * The band is a TEST tolerance and not the published record. AD-60.1 gave rubato an epsilon
 * family of its own, and the assertions below are made against that record rather than against
 * this constant — a dimension whose integrator changes shape has to be re-filed, not absorbed.
 */
const QUADRATURE_BAND = 1e-4;

/**
 * The dimensions whose transitions are integrated over `affectedTicks`' interval.
 *
 * `pedal` is out because `getPreviousPosition` scans BACKWARDS over entry indices (PARITY P2);
 * `articulation` because AD-37.1's default step function is retroactive over `[0, firstSwitch)`
 * and its value after an interval is governed by the last switch at or before it, neither of
 * which the interval bounds; `ornamentation` because its map SCOPE is a whole-map property that
 * a mixed state does not have.
 */
const LOCALIZING_DIMENSIONS = COMPARISON_DIMENSIONS.filter(
  (dimension) => !['pedal', 'articulation', 'ornamentation'].includes(dimension),
);

// ---------------------------------------------------------------------------

describe('the edit path over the vendored corpus', () => {
  /**
   * ONE walk, three claims, because they are claims about the same scripts and the walk is the
   * expensive part: every part scope of the three documents' primary pairs, then the global
   * scope of the remaining pairs.
   */
  const WALK: readonly (readonly [string, number, number, readonly number[]])[] = [
    ['telemann-grave', 0, 1, [0, 1]],
    ['vulpius-die-helle-sonn', 0, 1, [0, 1]],
    ['albert-du-mein-einzig-licht', 0, 1, [0, 1]],
    ['telemann-grave', 0, 2, [0]],
    ['telemann-grave', 1, 2, [0]],
    ['vulpius-die-helle-sonn', 1, 2, [0]],
  ];

  it('has the documents as its endpoints and satisfies §6.2 and §6.3 throughout', () => {
    let nonzero = 0;
    let reworked = 0;
    let divergent = 0;
    const shortfall = new Map<ComparisonDimension, number>();

    for (const [name, performanceA, performanceB, scopes] of WALK)
      for (const scopeIndex of scopes) {
        const target = bench(fixture(name), performanceA, performanceB, { scopeIndex });
        if (target === null) continue;
        for (const dimension of COMPARISON_DIMENSIONS) {
          const { script } = editScriptForDimension(dimension, target.a, target.b, target.settings);
          const evaluated = evaluateDimension(dimension, target.a, target.b, target.settings);
          const where = { name, scopeIndex, dimension };

          // CLAIM 1 — `S(0,0)` and `S(n,m)` really ARE `A` and `B`. Not `toBeCloseTo`: the edit
          // state is A's own instructions read through A's own resolution, so it is the same
          // object the evaluator builds and the two integrals are the same arithmetic. A
          // near-miss would mean the edit path is describing a DIFFERENT document — which is
          // exactly what the event dimensions did until their readers took the per-entry
          // resolution: `d_articulation` was 926.67 against a `directDistance` of 770.67,
          // because B's instructions were being read through A's articulationStyles.
          expect({ ...where, d: script.directDistance }).toEqual({
            ...where,
            d: evaluated.distance,
          });

          // CLAIM 2 — §6.2's theorems, in a RELATIVE band sized to the quadrature rather than
          // to a hope. Both sides are integrals; W2c's P-C3 needed the same shape for the same
          // reason ("an absolute epsilon fails a correct implementation"), and the measured
          // worst case is asserted below rather than left inside the tolerance.
          const slack = 1 + QUADRATURE_BAND;
          expect(script.scriptCost).toBeGreaterThanOrEqual(script.directDistance / slack);
          expect(script.replayedDelta).toBeGreaterThanOrEqual(script.directDistance / slack);

          // CLAIM 3 — §6.3's verification, and the closure of the delivered costs.
          expect(script.replayResidual).toBe(0);
          expect(script.steps.reduce((total, step) => total + step.cost, 0)).toBeCloseTo(
            script.replayedDelta,
            9,
          );

          if (evaluated.distance > 0) {
            nonzero += 1;
            shortfall.set(
              dimension,
              Math.max(
                shortfall.get(dimension) ?? 0,
                (script.directDistance - script.scriptCost) / script.directDistance,
              ),
            );
          }
          if (script.scriptCost > script.directDistance * slack) reworked += 1;
          if (Math.abs(script.replayedDelta - script.scriptCost) > 1e-9) divergent += 1;
        }
      }

    // [MEASURED] Where the band is actually needed, and by how much. `rubato` is the only
    // dimension that comes near it, and AD-60.1 ruled that a FAMILY OF ITS OWN — not the band —
    // is where that fact belongs: `rubatoDistance` integrates a warp displacement through
    // AD-33.3b's rule 2c (structural `u*` split plus a K = 16 mesh), so the `step` family's
    // "no quadrature in the time domain at all, exact 0" was false of it.
    //
    // The assertion is made against the PUBLISHED record rather than against a hand-typed
    // figure, which is what makes it a pin on the record and not only on the engine: a consumer
    // doing `inputs.epsilon[EPSILON_FAMILY_OF[k]]` — the lookup that mapping is exported for —
    // must find the shortfall inside its family's stamped epsilon. Under the shipped-before-fix
    // filing (`rubato: 'step'`, ε = 0) this measured 7.51e-5 read as a theorem violation, which
    // is the CAPITAL-1 regression this pin exists to catch.
    const published = epsilonRecord();
    const rubatoShortfall = shortfall.get('rubato') ?? 0;
    expect(EPSILON_FAMILY_OF.rubato).toBe('rubato');
    expect(rubatoShortfall).toBeLessThan(published.rubato.relative);
    // …and OUTSIDE the `step` figure, so a re-filing under `step` cannot pass this test.
    expect(rubatoShortfall).toBeGreaterThan(published.step.relative);
    // This walk's own worst, asserted on its own so the published band cannot absorb a
    // regression. It is Telemann part 1 at 2.21e-5, NOT the corpus worst — the walk carries
    // scopes 0 and 1 for the primary pairs, and part 2's 7.51e-5 is pinned by its own test
    // below, which reaches every part scope for one dimension instead of every dimension for
    // two scopes.
    expect(rubatoShortfall).toBeLessThan(1e-4);
    expect(rubatoShortfall).toBeGreaterThan(1e-6);

    // The `step` family's exact-0 claim, asserted on its GENUINELY exact members only — which
    // is what AD-60.1 preserved by moving rubato out rather than by widening `step`'s figure.
    // Every other family's members are checked against their own published figure, so a
    // dimension whose integrator changes shape has to be re-filed rather than absorbed.
    for (const [dimension, worst] of shortfall) {
      const family = EPSILON_FAMILY_OF[dimension];
      if (family === 'step')
        expect({ dimension, worst }).toEqual({ dimension, worst: published.step.relative });
      else
        expect({ dimension, within: worst < published[family].relative }).toEqual({
          dimension,
          within: true,
        });
    }

    // Non-vacuity: an implementation returning 0 everywhere satisfies claim 1, and the two
    // facts that make the triple three numbers are asserted on REAL data rather than only on a
    // random family — some scripts do real re-working, and the DP's path order and the
    // delivered date order do disagree.
    // 39 of the walk's (pair, scope, dimension) triples carry a nonzero d_k.
    expect(nonzero).toBeGreaterThan(30);
    expect(reworked).toBeGreaterThan(0);
    expect(divergent).toBeGreaterThan(0);
  });

  /**
   * AD-60.1's sixth epsilon family, pinned on the case that motivated it.
   *
   * The walk above spends its budget on eleven dimensions over two scopes; this spends a much
   * smaller one on ONE dimension over every part scope, which is where the corpus's worst
   * shortfall lives (Telemann part 2, 7.51e-5 — cut A3's STOP-AND-REPORT figure).
   *
   * The point is not the number, it is which epsilon the number has to answer to. Before
   * AD-60.1 rubato was filed under `step`, whose published figure is an exact `0` because a
   * piecewise-constant reading needs no time-domain quadrature; but `rubatoDistance` integrates
   * a warp DISPLACEMENT through AD-33.3b's rule 2c (structural `u*` split plus a K = 16 mesh),
   * which AD-34.1 measured at 2.718e-4. So a consumer doing the `EPSILON_FAMILY_OF` lookup the
   * mapping is exported for read this perfectly correct 7.51e-5 as a theorem violation, and the
   * ulp-level noise on a clean pair as one too. The wrong thing was the published record.
   */
  it('answers to its OWN epsilon: rubato’s worst real shortfall is inside AD-34.1’s figure', () => {
    const pair = readComparisonPair({
      a: fixture('telemann-grave'),
      performanceA: 0,
      performanceB: 1,
      window: null,
    });
    let worst = 0;
    let scopesWithRubato = 0;
    for (let index = 0; index < pair.a.scopes.length; index += 1) {
      const target = bench(fixture('telemann-grave'), 0, 1, { scopeIndex: index });
      if (target === null) continue;
      const { script } = editScriptForDimension('rubato', target.a, target.b, target.settings);
      if (script.directDistance <= 0) continue;
      scopesWithRubato += 1;
      worst = Math.max(worst, (script.directDistance - script.scriptCost) / script.directDistance);
    }

    // The maps live in the parts, not the global scope — all three parts carry rubato.
    expect(scopesWithRubato).toBe(3);

    const published = epsilonRecord();
    // [MEASURED] Telemann part 2: d = 476.22531733 against scriptCost = 476.18955454.
    expect(worst).toBeCloseTo(7.51e-5, 7);
    // Inside its own family's published figure…
    expect(worst).toBeLessThan(published.rubato.relative);
    // …and OUTSIDE the `step` figure it used to be filed under, which is the whole finding: a
    // re-filing under `step` (ε = 0) makes this measurement read as `scriptCost < d`.
    expect(worst).toBeGreaterThan(published.step.relative);
    expect(EPSILON_FAMILY_OF.rubato).toBe('rubato');
  });

  it('anchors the Vulpius Baroque|Romantic scripts, where both facts show at once', () => {
    const target = requireBench(fixture('vulpius-die-helle-sonn'), 0, 1);
    const byDimension = new Map(scriptsOf(target).map((entry) => [entry.dimension, entry.script]));

    const tempo = byDimension.get('tempo');
    expect(tempo?.directDistance).toBeCloseTo(631.161302, 6);
    expect(tempo?.scriptCost).toBeCloseTo(631.161302, 6);
    // The date order costs MORE than the DP's path order here — the same op set, applied in the
    // order a reader walks the score. Neither dominates in general, which is why both ship.
    expect(tempo?.replayedDelta).toBeCloseTo(663.367553, 6);
    expect(tempo?.opCounts).toMatchObject({ substitute: 4, delete: 1, insert: 3 });

    const dynamics = byDimension.get('dynamics');
    // Genuine re-working: no monotone script reaches B for `d_dynamics`, so `scriptCost` sits
    // above the lower bound by 0.99 JND·quarters and `reworking` is that gap.
    expect(dynamics?.directDistance).toBeCloseTo(158.677254, 6);
    expect(dynamics?.scriptCost).toBeCloseTo(159.671848, 6);
    expect(dynamics?.replayedDelta).toBeCloseTo(169.375996, 6);
  });

  it('anchors the event and distribution dimensions, where re-working is 0 by construction', () => {
    // Telemann part 1: `d_articulation` is the alignment optimum PLUS AD-55.1's default step
    // function, and ONE script over the map's entries prices both — the atoms from its
    // `<articulation>` elements, the steps from its `<style>` switches.
    const telemann = requireBench(fixture('telemann-grave'), 0, 1, { scopeIndex: 1 });
    const articulation = editScriptForDimension(
      'articulation',
      telemann.a,
      telemann.b,
      telemann.settings,
    ).script;
    expect(articulation.directDistance).toBeCloseTo(926.666667, 6);
    // scriptCost EQUALS the lower bound, and that is §6.2's "consistent by construction"
    // arriving as a measurement: the §5.6 functional is a sum over events, so applying one op
    // changes exactly one event's contribution and no monotone script can do better or worse.
    expect(articulation.scriptCost).toBeCloseTo(926.666667, 6);
    expect(articulation.replayedDelta).toBeCloseTo(926.666667, 6);
    expect(articulation.steps).toHaveLength(25);

    // Vulpius carries the only imprecision maps in the corpus that perform anything.
    const vulpius = requireBench(fixture('vulpius-die-helle-sonn'), 0, 1);
    const timing = editScriptForDimension(
      'imprecisionTiming',
      vulpius.a,
      vulpius.b,
      vulpius.settings,
    ).script;
    expect(timing.directDistance).toBeCloseTo(1108.3263889, 6);
    expect(timing.scriptCost).toBeCloseTo(1108.3263889, 6);
    expect(timing.steps).toHaveLength(1);
  });

  it('anchors the Albert pair, whose deadpan performance is mostly deletions', () => {
    const target = requireBench(fixture('albert-du-mein-einzig-licht'), 0, 1);
    const byDimension = new Map(scriptsOf(target).map((entry) => [entry.dimension, entry.script]));
    expect(byDimension.get('tempo')?.opCounts).toMatchObject({ substitute: 1, delete: 14 });
    expect(byDimension.get('dynamics')?.opCounts).toMatchObject({ delete: 10, insert: 0 });
    expect(byDimension.get('asynchrony')?.directDistance).toBeCloseTo(1013.333333, 6);
  });
});

describe('resolution travels with the instruction (AD-40.2)', () => {
  // Two performances whose `<tempo>` elements are BYTE-IDENTICAL and whose `tempoStyles` differ.
  // Nothing in the map says what the tempo is; the styleDef does.
  const NS = 'http://www.cemfi.de/mpm/ns/1.0';
  const performance = (name: string, bpm: string) =>
    `<performance name="${name}" pulsesPerQuarter="720">` +
    `<global><header><tempoStyles><styleDef name="s"><tempoDef name="t" value="${bpm}"/>` +
    '</styleDef></tempoStyles></header>' +
    '<dated><tempoMap><style date="0.0" name.ref="s"/>' +
    '<tempo date="0.0" bpm="t" beatLength="0.25"/></tempoMap></dated></global></performance>';
  const document = `<mpm xmlns="${NS}">${performance('slow', '60')}${performance('fast', '120')}</mpm>`;

  it('prices a difference that lives entirely in the header', () => {
    const target = requireBench(document, 'slow', 'fast', { window: { start: 0, end: 4 } });
    const script = editScriptForDimension('tempo', target.a, target.b, target.settings)?.script;

    // The two maps are identical text, so a reading that resolved B's instruction through A's
    // header would price this at 0 and the replay would never reach B.
    expect(script?.directDistance).toBeGreaterThan(0);
    expect(script?.replayResidual).toBe(0);
    // 4 quarters at `|ln 2|` over the tempo JND — the whole window, both instructions being at 0.
    expect(script?.directDistance).toBeCloseTo((4 * Math.LN2) / Math.log(1.025), 6);
    // The script reaches the lower bound: AD-5's tie again, since a path that removes A's tempo
    // and inserts B's telescopes through the renderer's no-tempo default at exactly the same
    // total as one that substitutes it (`ln(100/60) + ln(120/100) = ln 2`). The step COUNT is
    // therefore not the thing to assert — two scripts of different lengths cost the same.
    expect(script?.scriptCost).toBeCloseTo(script?.directDistance ?? -1, 9);
  });

  it('is non-vacuous: the same document against ITSELF is free throughout', () => {
    const target = requireBench(document, 'slow', 'slow', { window: { start: 0, end: 4 } });
    const script = editScriptForDimension('tempo', target.a, target.b, target.settings)?.script;
    expect(script?.directDistance).toBe(0);
    expect(script?.scriptCost).toBe(0);
    expect(script?.steps.every((step) => step.free)).toBe(true);
  });
});

describe('a <style> is an instruction, because the any-entry maps perform it', () => {
  // `asynchronyMap` reads an offset off ANY next entry with no local-name test, so a `<style>`
  // between two `<asynchrony>` elements ends the first span and NaN-poisons its own (AD-33.1) —
  // the span reads `⊥`. An edit sequence that dropped `<style>` entries would therefore have
  // `S(0,0) ≠ A`, which nothing in the vendored corpus happens to exhibit: no vendored
  // asynchronyMap carries a style. Found by a negative control that failed to fail.
  const NS = 'http://www.cemfi.de/mpm/ns/1.0';
  const performance = (name: string, styled: boolean) =>
    `<performance name="${name}" pulsesPerQuarter="720"><global><dated><asynchronyMap>` +
    `<asynchrony date="0.0" milliseconds.offset="10"/>${
      styled ? '<style date="720.0" name.ref="s"/>' : ''
    }<asynchrony date="1440.0" milliseconds.offset="20"/>` +
    `</asynchronyMap></dated></global></performance>`;
  const document = `<mpm xmlns="${NS}">${performance('styled', true)}${performance('plain', false)}</mpm>`;

  it('keeps the edit state’s endpoints equal to the documents', () => {
    const target = requireBench(document, 'styled', 'plain', { window: { start: 0, end: 4 } });
    const script = editScriptForDimension('asynchrony', target.a, target.b, target.settings);
    const evaluated = evaluateDimension('asynchrony', target.a, target.b, target.settings);
    expect(script?.script.directDistance).toBe(evaluated.distance);
    expect(script?.script.replayResidual).toBe(0);
    // Non-vacuity: the `<style>` really is the whole difference, and it is priced.
    expect(evaluated.distance).toBeGreaterThan(0);
    expect(script?.script.steps.some((step) => step.a?.entry.element.getLocalName() === 'style'));
  });
});

describe('the localized norm is exact, not an approximation', () => {
  it('keeps the span BEFORE the change, which a transition makes load-bearing', () => {
    // Deleting an instruction extends its predecessor's span, and if that predecessor is a
    // TRANSITION its shape changes over its own span too — so the affected interval starts at
    // the PREDECESSOR's date, not at the change's. Nothing in the vendored corpus exercises
    // this (a negative control moving the bound one instruction to the right passed the whole
    // corpus pin), so the case is built.
    const NS = 'http://www.cemfi.de/mpm/ns/1.0';
    const performance = (name: string, middle: boolean) =>
      `<performance name="${name}" pulsesPerQuarter="720"><global><dated><tempoMap>` +
      `<tempo date="0.0" bpm="60" beatLength="0.25" transition.to="120"/>${
        middle ? '<tempo date="1440.0" bpm="90" beatLength="0.25"/>' : ''
      }<tempo date="2880.0" bpm="90" beatLength="0.25"/>` +
      `</tempoMap></dated></global></performance>`;
    const document = `<mpm xmlns="${NS}">${performance('long', true)}${performance('short', false)}</mpm>`;

    const target = requireBench(document, 'long', 'short', { window: { start: 0, end: 6 } });
    const localized = editScriptForDimension('tempo', target.a, target.b, target.settings);
    const whole = editScriptForDimension('tempo', target.a, target.b, target.settings, {
      localize: false,
    });
    expect(localized?.script.scriptCost).toBe(whole?.script.scriptCost);
    expect(localized?.script.replayedDelta).toBe(whole?.script.replayedDelta);
    // Non-vacuity: the deletion really does change the ramp over `[0, 2)`, so a bound that
    // started at the change would lose mass rather than lose nothing.
    expect(whole?.script.scriptCost).toBeGreaterThan(0);
  });

  it('gives bit-identical totals to the whole-window form on the vendored corpus', () => {
    // One pair per document rather than all six: the whole-window reference is the expensive
    // half (it is what the localization exists to avoid) and the three documents differ in the
    // maps they carry, which is what the pin is about. The other three pairs run localized in
    // every test above.
    for (const [name, performanceA, performanceB] of REFERENCE_PAIRS) {
      const target = bench(fixture(name), performanceA, performanceB);
      if (target === null) continue;
      const localized = scriptsOf(target, {}, LOCALIZING_DIMENSIONS);
      const whole = scriptsOf(target, { localize: false }, LOCALIZING_DIMENSIONS);
      expect(localized).toHaveLength(whole.length);
      for (const [index, entry] of localized.entries()) {
        const reference = whole[index];
        expect(entry.dimension).toBe(reference.dimension);
        expect(entry.script.scriptCost).toBe(reference.script.scriptCost);
        expect(entry.script.replayedDelta).toBe(reference.script.replayedDelta);
        expect(entry.script.directDistance).toBe(reference.script.directDistance);
        expect(entry.script.steps.map((step) => step.cost)).toEqual(
          reference.script.steps.map((step) => step.cost),
        );
      }
    }
  });

  it('gives bit-identical totals over the adversarial family', () => {
    // Every member against every other, under the family's own explicit window — the standing
    // policy of AD-33.5, which puts `⊥`, the cap, renderer defaults, skips and unbounded spans
    // in front of a change to the integrator's domain. Restricted to the dimensions that
    // LOCALIZE: for `pedal`, `articulation` and `ornamentation` the two modes are the same code
    // path by construction, so including them would add cost and assert nothing.
    // Unordered pairs: the claim is that two INTEGRATION DOMAINS agree, which is symmetric in
    // the pair, and P-C2's orientation properties are `properties.test.ts`'s subject.
    for (const [i, a] of ADVERSARIAL_FAMILY.entries())
      for (const b of ADVERSARIAL_FAMILY.slice(i + 1)) {
        const target = requireBench(a.mpm, 0, 0, {
          b: b.mpm,
          window: { start: ADVERSARIAL_WINDOW.start, end: ADVERSARIAL_WINDOW.end },
        });
        const localized = scriptsOf(target, {}, LOCALIZING_DIMENSIONS);
        const whole = scriptsOf(target, { localize: false }, LOCALIZING_DIMENSIONS);
        for (const [index, entry] of localized.entries())
          expect({
            dimension: entry.dimension,
            hazard: `${a.name} | ${b.name}`,
            scriptCost: entry.script.scriptCost,
            replayedDelta: entry.script.replayedDelta,
          }).toEqual({
            dimension: whole[index].dimension,
            hazard: `${a.name} | ${b.name}`,
            scriptCost: whole[index].script.scriptCost,
            replayedDelta: whole[index].script.replayedDelta,
          });
      }
  });
});
