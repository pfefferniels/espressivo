/**
 * §6's edit path on the six curve dimensions — the DP meeting real maps.
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
import { DEFAULT_LAMBDA_DATE } from '../../src/comparison/eventAlignment.js';
import type { InvarianceMode } from '../../src/comparison/decomposition.js';
import { ADVERSARIAL_FAMILY, ADVERSARIAL_WINDOW } from './adversarialFamily.js';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');
const fixture = (name: string) => readFileSync(join(FIXTURES, `${name}.mpm`), 'utf-8');

const NO_INVARIANCE = Object.fromEntries(
  COMPARISON_DIMENSIONS.map((dimension) => [dimension, 'none']),
) as Record<ComparisonDimension, InvarianceMode>;

/** The six dimensions this wave's edit path covers; the rest return null by design. */
const CURVE_DIMENSIONS = [
  'tempo',
  'dynamics',
  'rubato',
  'asynchrony',
  'accentuation',
  'pedal',
] as const satisfies readonly ComparisonDimension[];

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
  options: { readonly b?: string; readonly window?: { start: number; end: number } } = {},
): Bench {
  const pair = readComparisonPair({
    a: textA,
    b: options.b,
    performanceA,
    performanceB,
    window: options.window ?? null,
  });
  const globalA = pair.a.scopes.find((scope) => scope.scope === 'global');
  const globalB = pair.b.scopes.find((scope) => scope.scope === 'global');
  if (globalA === undefined || globalB === undefined) throw new Error('no global scope');
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
): readonly DimensionEditScript[] {
  const scripts: DimensionEditScript[] = [];
  for (const dimension of CURVE_DIMENSIONS) {
    const script = editScriptForDimension(dimension, target.a, target.b, target.settings, options);
    if (script !== null) scripts.push(script);
  }
  return scripts;
}

const REFERENCE_PAIRS = [
  ['telemann-grave', 0, 1],
  ['vulpius-die-helle-sonn', 0, 1],
  ['albert-du-mein-einzig-licht', 0, 1],
] as const;

const VENDORED_PAIRS = [
  ['telemann-grave', 0, 1],
  ['telemann-grave', 0, 2],
  ['telemann-grave', 1, 2],
  ['vulpius-die-helle-sonn', 0, 1],
  ['vulpius-die-helle-sonn', 1, 2],
  ['albert-du-mein-einzig-licht', 0, 1],
] as const;

// ---------------------------------------------------------------------------

describe('the script’s endpoints are the documents', () => {
  it('reports directDistance equal to d_k on every vendored pair and curve dimension', () => {
    for (const [name, performanceA, performanceB] of VENDORED_PAIRS) {
      const target = bench(fixture(name), performanceA, performanceB);
      for (const dimension of CURVE_DIMENSIONS) {
        const script = editScriptForDimension(dimension, target.a, target.b, target.settings);
        expect(script).not.toBeNull();
        const evaluated = evaluateDimension(dimension, target.a, target.b, target.settings);
        // Not `toBeCloseTo`: `Φ(S(0,0))` is built from A's own instructions with A's own
        // resolution, so it is the same curve object shape the evaluator builds and the two
        // integrals are the same arithmetic. A near-miss here would mean the edit state is a
        // DIFFERENT document from the one the comparison reports on.
        expect(script?.script.directDistance).toBe(evaluated.distance);
      }
    }
  });

  it('returns null for the event and distribution dimensions rather than an empty script', () => {
    const target = bench(fixture('telemann-grave'), 0, 1);
    for (const dimension of COMPARISON_DIMENSIONS) {
      if ((CURVE_DIMENSIONS as readonly string[]).includes(dimension)) continue;
      expect(editScriptForDimension(dimension, target.a, target.b, target.settings)).toBeNull();
    }
  });
});

describe('§6.2’s theorems and §6.3’s verification, on real documents', () => {
  it('holds scriptCost ≥ d, replayedDelta ≥ d, and reaches B exactly', () => {
    let reworked = 0;
    let divergent = 0;
    for (const [name, performanceA, performanceB] of VENDORED_PAIRS) {
      const target = bench(fixture(name), performanceA, performanceB);
      for (const { script } of scriptsOf(target)) {
        const slack = 1 + 1e-9;
        expect(script.scriptCost).toBeGreaterThanOrEqual(script.directDistance / slack);
        expect(script.replayedDelta).toBeGreaterThanOrEqual(script.directDistance / slack);
        expect(script.replayResidual).toBe(0);
        expect(script.steps.reduce((total, step) => total + step.cost, 0)).toBeCloseTo(
          script.replayedDelta,
          9,
        );
        if (script.scriptCost > script.directDistance * slack) reworked += 1;
        if (Math.abs(script.replayedDelta - script.scriptCost) > 1e-9) divergent += 1;
      }
    }
    // Non-vacuity, and the two facts that make the triple three numbers on REAL data rather
    // than only on a random family: some scripts do real re-working, and the DP's path order
    // and the delivered date order do disagree.
    expect(reworked).toBeGreaterThan(0);
    expect(divergent).toBeGreaterThan(0);
  });

  it('anchors the Vulpius Baroque|Romantic scripts, where both facts show at once', () => {
    const target = bench(fixture('vulpius-die-helle-sonn'), 0, 1);
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

  it('anchors the Albert pair, whose deadpan performance is mostly deletions', () => {
    const target = bench(fixture('albert-du-mein-einzig-licht'), 0, 1);
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
    const target = bench(document, 'slow', 'fast', { window: { start: 0, end: 4 } });
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
    const target = bench(document, 'slow', 'slow', { window: { start: 0, end: 4 } });
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
    const target = bench(document, 'styled', 'plain', { window: { start: 0, end: 4 } });
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

    const target = bench(document, 'long', 'short', { window: { start: 0, end: 6 } });
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
      const localized = scriptsOf(target);
      const whole = scriptsOf(target, { localize: false });
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
    // in front of a change to the integrator's domain.
    for (const a of ADVERSARIAL_FAMILY)
      for (const b of ADVERSARIAL_FAMILY) {
        if (a === b) continue;
        const target = bench(a.mpm, 0, 0, {
          b: b.mpm,
          window: { start: ADVERSARIAL_WINDOW.start, end: ADVERSARIAL_WINDOW.end },
        });
        const localized = scriptsOf(target);
        const whole = scriptsOf(target, { localize: false });
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
