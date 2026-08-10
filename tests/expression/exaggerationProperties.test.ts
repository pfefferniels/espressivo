/**
 * DESIGN.md §1.1's properties, asserted the way §1.1 says they may honestly be asserted.
 *
 * - **P1 identity (A2)** is a BYTE claim, and it is made against the canonical baseline —
 *   `serialize(parse(t))` — never against the input. `Element.wrap` drops `xmlns` at parse and
 *   `Element.toXML` re-emits it on every namespaced element, so strict `input == output` is
 *   unreachable for every MPM whatever the applier does.
 * - **P2 composition** is a NUMERIC claim with an epsilon, made only where nothing clamped.
 *   Under clamping it genuinely breaks — the computed center stops being the image of the
 *   input population — and the remedy is an output rather than a proof: the reported center,
 *   passed back through `options.center`, restores composition by construction.
 * - **A4's global invariant** — the engine never writes a non-finite value — is asserted by
 *   sweeping deliberately hostile XML, because that is the only place it can fail.
 */
import { describe, expect, it } from 'vitest';
import { applyExaggeration } from '../../src/expression/applier.js';
import {
  canonicalBaseline,
  parseMpmRoot,
  serializeMpmRoot,
} from '../../src/expression/mpmDocument.js';
import {
  EXPRESSION_DIMENSIONS,
  rowFor,
  type ExaggerationFactors,
  type RowSpace,
} from '../../src/expression/registry.js';
import type { ReportNoteKind } from '../../src/expression/report.js';
import { parseTemporalText } from '../../src/expression/temporalValue.js';
import { exaggerate, globalDocument, numberAt, textAt } from './applierFixtures.js';

/**
 * A document that reaches every one of the fifteen dimensions.
 *
 * Deliberately clamp-free and refusal-free: the levels sit far below the velocity ceiling and
 * every ratio is positive, which is what lets the composition suite run over the whole surface
 * rather than over one map. One value — `curvature="0.990"` — sits deliberately CLOSE to its
 * bound, so the conditioned tolerance's amplification term is load-bearing here and not only in
 * `transforms.test.ts`.
 *
 * **Many values are spelled non-canonically on purpose** (`"0.30"`, `"1.40"`, `"-22.0"`). A
 * value whose text differs from `String(Number(v))` is rewritten by any transform that touches
 * it, even one that returns the number unchanged — which is exactly what makes the two byte
 * assertions below able to detect a missing `s === 1` short-circuit. With canonically spelled
 * values they would pass with the short-circuit deleted.
 */
const EVERY_DIMENSION = globalDocument(
  '<dynamicsStyles><styleDef name="D"><dynamicsDef id="dp" name="p" value="40"/>' +
    '<dynamicsDef id="df" name="f" value="70"/></styleDef></dynamicsStyles>' +
    '<tempoStyles><styleDef name="T"><tempoDef id="tallegro" name="Allegro" value="120"/>' +
    '</styleDef></tempoStyles>' +
    '<rubatoStyles><styleDef name="R"><rubatoDef id="rdef" name="r" frameLength="720" ' +
    'intensity="1.40" lateStart="0.15" earlyEnd="0.85"/></styleDef></rubatoStyles>' +
    '<articulationStyles><styleDef name="A"><articulationDef id="adef" name="ten" ' +
    'relativeDuration="0.90" relativeVelocity="1.10" absoluteDurationChange="-40.0" ' +
    'absoluteDurationChangeMs="-12.0" absoluteDelay="8.0" absoluteDelayMs="5" ' +
    'absoluteVelocityChange="7"/></styleDef></articulationStyles>' +
    '<metricalAccentuationStyles><styleDef name="M"><accentuationPatternDef id="mdef" ' +
    'name="p4" length="4"><accentuation beat="1" value="15"/></accentuationPatternDef>' +
    '</styleDef></metricalAccentuationStyles>' +
    '<ornamentationStyles><styleDef name="O"><ornamentDef name="arp">' +
    '<temporalSpread id="spread" frame.start="-22.0" frameLength="44" intensity="1.60"/>' +
    '<dynamicsGradient id="grad" transition.from="-1" transition.to="1"/>' +
    '</ornamentDef>' +
    // The v3 reading of the same dimensions (§7.15), in the same performance as its v2 twin:
    // unit-suffixed values on both bounds, spelled non-canonically for the same reason as
    // everything else here.
    '<ornamentDef name="trill">' +
    '<temporalSpread id="v3spread" frame.offset="-22.0ms" frameLength="80%" intensity="1.30"/>' +
    '</ornamentDef>' +
    '</styleDef></ornamentationStyles>',
  '<tempoMap><style date="0.0" name.ref="T"/>' +
    '<tempo id="t1" date="0.0" bpm="Allegro" beatLength="0.25"/>' +
    '<tempo id="t2" date="4.0" bpm="90" beatLength="0.25" transition.to="70" meanTempoAt="0.40"/>' +
    '</tempoMap>' +
    '<dynamicsMap><style date="0.0" name.ref="D"/>' +
    '<dynamics id="d1" date="0.0" volume="p"/>' +
    '<dynamics id="d2" date="4.0" volume="55" transition.to="70" curvature="0.990" protraction="0.20"/>' +
    '</dynamicsMap>' +
    '<rubatoMap><style date="0.0" name.ref="R"/><rubato id="r1" date="0.0" name.ref="r"/></rubatoMap>' +
    '<articulationMap><style date="0.0" name.ref="A"/>' +
    '<articulation id="a1" date="0.0" relativeVelocity="1.20" absoluteVelocityChange="6.0"/>' +
    '</articulationMap>' +
    '<metricalAccentuationMap><style date="0.0" name.ref="M"/>' +
    '<accentuationPattern id="p1" date="0.0" name.ref="p4" scale="1.5"/>' +
    '</metricalAccentuationMap>' +
    '<ornamentationMap><style date="0.0" name.ref="O"/>' +
    '<ornament id="o1" date="0.0" name.ref="arp" scale="2"/>' +
    '<ornament id="o2" date="2.0" name.ref="trill" scale="1"/></ornamentationMap>' +
    '<asynchronyMap><asynchrony id="y1" date="0.0" milliseconds.offset="-18.0"/></asynchronyMap>' +
    '<imprecisionMap.timing><distribution.uniform id="u" date="0.0" limit.lower="-9.0" ' +
    'limit.upper="9.0" milliseconds.timingBasis="100"/></imprecisionMap.timing>' +
    '<imprecisionMap.dynamics><distribution.gaussian id="gd" date="0.0" ' +
    'deviation.standard="4.0" limit.lower="-8.0" limit.upper="8"/></imprecisionMap.dynamics>' +
    '<imprecisionMap.toneduration><distribution.uniform id="ud" date="0.0" ' +
    'limit.lower="-11" limit.upper="11"/></imprecisionMap.toneduration>' +
    '<movementMap><movement id="v1" date="0.0" position="0.0" transition.to="1.0" ' +
    'curvature="0.35" protraction="0.20"/>' +
    '<movement id="v2" date="8.0" position="1.0" transition.to="0.0"/></movementMap>',
);

/** Every dimension at the same factor — the vector the composition suite scales. */
function uniformFactors(factor: number): ExaggerationFactors {
  return Object.fromEntries(
    EXPRESSION_DIMENSIONS.map((dimension) => [dimension, factor]),
  ) as ExaggerationFactors;
}

/**
 * Every attribute of a serialized document, keyed by `elementIndex:localName@attribute`.
 *
 * Read off the text rather than the tree because `Element` exposes `getAttributeCount` but no
 * indexed accessor, and because the text is what the engine's contract is about. The key is
 * stable across a transform for the same reason the engine is auditable at all: it never
 * creates, deletes or reorders an element or an attribute, so the nth element of the output is
 * the nth element of the input.
 */
function collectAttributes(xml: string): Map<string, string> {
  const found = new Map<string, string>();
  let elementIndex = 0;
  for (const tag of xml.matchAll(/<([a-zA-Z][\w.:-]*)((?:\s+[\w.:-]+\s*=\s*"[^"]*")*)/g)) {
    for (const attribute of tag[2].matchAll(/([\w.:-]+)\s*=\s*"([^"]*)"/g)) {
      found.set(`${elementIndex}:${tag[1]}@${attribute[1]}`, attribute[2]);
    }
    elementIndex += 1;
  }
  return found;
}

/**
 * An attribute value read as a finite number plus the unit it was wearing, or null when it is
 * not a number at all.
 *
 * Both sweeps below classify every attribute of a document into "a quantity the engine may have
 * computed" and "text it must have left alone", and MPM v3 put a third shape between them: a
 * number with a unit suffix (§7.15), which `Number` reads as `NaN` and which would therefore be
 * misfiled as text. `parseTemporalText` is the engine's own reader for that shape, so the
 * classification splits values exactly where the transform did — and `Number` still handles the
 * spellings the v3 grammar excludes but `parseFloat` accepts (`1e3`, `.5`).
 */
function numericPart(text: string): { readonly value: number; readonly suffix: string } | null {
  const temporal = parseTemporalText(text);
  if (temporal !== null && Number.isFinite(temporal.value)) return temporal;
  const value = Number(text);
  return Number.isFinite(value) ? { value, suffix: '' } : null;
}

describe('P1 identity (§1.1, A2)', () => {
  it('an empty factors record reproduces the canonical baseline byte for byte', () => {
    const { xml, report } = exaggerate(EVERY_DIMENSION, {});
    expect(xml).toBe(canonicalBaseline(EVERY_DIMENSION));
    expect(report.totalWrites).toBe(0);
  });

  it('every dimension explicitly at 1 reproduces it too — the predicate that exercises the engine', () => {
    const { xml, report } = exaggerate(EVERY_DIMENSION, uniformFactors(1));
    expect(xml).toBe(canonicalBaseline(EVERY_DIMENSION));
    expect(report.totalWrites).toBe(0);
  });

  it('holds over a v3 frame, which a real factor demonstrably does rewrite', () => {
    // Anti-vacuity for the two byte assertions above: the fixture's v3 spread is not inert, so
    // its bytes surviving `s = 1` is the short-circuit working rather than the engine never
    // reaching it. Both units are preserved across the scaling; only the numbers move.
    const { root } = exaggerate(EVERY_DIMENSION, { ornamentSpread: 2 });
    expect(textAt(root, 'v3spread', 'frame.offset')).toBe('-44ms');
    expect(textAt(root, 'v3spread', 'frameLength')).toBe('160%');
  });

  it('reports every dimension as requested-and-skipped under the short-circuit', () => {
    const { performance } = exaggerate(EVERY_DIMENSION, uniformFactors(1));
    for (const dimension of EXPRESSION_DIMENSIONS) {
      expect(performance.dimensions[dimension].requestedFactor).toBe(1);
      expect(performance.dimensions[dimension].state).toBe('skipped');
      expect(performance.dimensions[dimension].writes).toBe(0);
    }
  });
});

describe('R2 determinism', () => {
  it('two runs of the same (document, factors) produce byte-identical output', () => {
    const first = exaggerate(EVERY_DIMENSION, uniformFactors(1.4));
    const second = exaggerate(EVERY_DIMENSION, uniformFactors(1.4));
    expect(second.xml).toBe(first.xml);
    expect(second.report.totalWrites).toBe(first.report.totalWrites);
  });

  it('reports identical centers and bounds across runs', () => {
    const first = exaggerate(EVERY_DIMENSION, uniformFactors(1.4)).performance;
    const second = exaggerate(EVERY_DIMENSION, uniformFactors(1.4)).performance;
    expect(second.centers).toEqual(first.centers);
    expect(second.bounds).toEqual(first.bounds);
  });
});

describe('P2 composition on the clamp-free subdomain (§1.1, A3)', () => {
  const STEP = 1.3;
  const PRODUCT = STEP * STEP;

  /** Apply `factor`, serialize, and hand back the text — the input of the next application. */
  function step(
    text: string,
    factor: number,
  ): { readonly text: string; readonly clamps: number; readonly writes: number } {
    const root = parseMpmRoot(text);
    const report = applyExaggeration(root, uniformFactors(factor));
    const clamps = EXPRESSION_DIMENSIONS.reduce(
      (sum, dimension) => sum + report.performances[0].dimensions[dimension].clamps,
      0,
    );
    return { text: serializeMpmRoot(root), clamps, writes: report.totalWrites };
  }

  it('applies s twice to within the bound-conditioned tolerance of applying s² once', () => {
    const once = step(EVERY_DIMENSION, PRODUCT);
    const first = step(EVERY_DIMENSION, STEP);
    const twice = step(first.text, STEP);
    // The precondition §1.1 attaches to the claim: nothing clamped in either arrangement.
    expect(once.clamps).toBe(0);
    expect(first.clamps + twice.clamps).toBe(0);
    // …and the guard against a vacuous pass: a regression that made the engine write NOTHING
    // would leave every comparison below trivially satisfied.
    expect(once.writes).toBeGreaterThan(0);
    expect(first.writes).toBeGreaterThan(0);
    expect(twice.writes).toBeGreaterThan(0);

    const composed = collectAttributes(twice.text);
    const direct = collectAttributes(once.text);
    expect([...composed.keys()].sort()).toEqual([...direct.keys()].sort());

    let comparedNumbers = 0;
    for (const [key, composedText] of composed) {
      const directText = direct.get(key)!;
      const [, elementLocalName, attributeName] = /^\d+:([^@]+)@(.+)$/.exec(key)!;
      const row = rowFor(elementLocalName, attributeName);

      const composedValue = numericPart(composedText);
      const directValue = numericPart(directText);
      if (row === null || composedValue === null || directValue === null) {
        // Either not a live attribute at all — `@date`, `@beatLength`, every §7.16 exclusion —
        // or a level attribute holding a def NAME, which D-C forbids rewriting as a number.
        // In both cases the two arrangements must agree on the SPELLING, not just the value.
        expect(composedText).toBe(directText);
        continue;
      }
      comparedNumbers += 1;
      // A v3 unit composes by not moving at all: only the number is scaled, so a drift in the
      // suffix would be the engine rewriting a unit, which nothing in §7 licenses.
      expect(composedValue.suffix).toBe(directValue.suffix);
      expect(Math.abs(composedValue.value - directValue.value)).toBeLessThan(
        toleranceFor(row.space, directValue.value),
      );
    }
    // Guard against the comparison silently passing because it compared nothing.
    expect(comparedNumbers).toBeGreaterThan(20);
  });
});

/**
 * The tolerance one attribute's composition may drift by, CONDITIONED on how close the value
 * sits to a bound of its scale space (R-W2-5/#6).
 *
 * A flat epsilon would be wrong in both directions. In a bounded space the two arrangements
 * differ in where the cancellation happens: composing goes through an intermediate `y`, and
 * recovering `1 − y` from it loses precision as `eps/(1 − y)`, which the next exponentiation
 * then multiplies. So the admissible drift is amplified by the reciprocal of the distance to
 * the bound — strict for an interior curvature of 0.5, necessarily loose for one at 0.9999.
 * In an unbounded space no such cancellation exists and the drift is plainly relative.
 */
function toleranceFor(space: RowSpace, value: number): number {
  const base = 1e-12;
  const margin =
    space.kind === 'logit'
      ? Math.min(value - space.lower, space.upper - value)
      : space.kind === 'boundary-power-low' || space.kind === 'joint-trim'
        ? Math.min(1 - value, 1)
        : null;
  return margin === null
    ? base * Math.max(Math.abs(value), 1)
    : base / Math.max(margin, Number.EPSILON);
}

describe('P2 under clamping — the center is an output, not a proof (§1.1, A3)', () => {
  // Three named levels whose top one reaches the ceiling partway through, which is exactly the
  // configuration where the recomputed center stops being the image of the input population.
  const LADDER = globalDocument(
    '<dynamicsStyles><styleDef name="D">' +
      '<dynamicsDef id="dp" name="p" value="48"/>' +
      '<dynamicsDef id="df" name="f" value="97"/>' +
      '<dynamicsDef id="dff" name="ff" value="112"/>' +
      '</styleDef></dynamicsStyles>',
    '<dynamicsMap><style date="0.0" name.ref="D"/>' +
      '<dynamics date="0.0" volume="p"/><dynamics date="4.0" volume="f"/>' +
      '<dynamics date="8.0" volume="ff"/></dynamicsMap>',
  );
  const STEP = 1.5;
  const PRODUCT = STEP * STEP;
  const CENTER = exaggerate(LADDER, { dynamics: STEP }).performance.centers.dynamics!;

  function applyTo(text: string, factor: number, center?: number): string {
    const root = parseMpmRoot(text);
    applyExaggeration(
      root,
      { dynamics: factor },
      center === undefined ? {} : { center: { dynamics: center } },
    );
    return serializeMpmRoot(root);
  }

  it('breaks composition when each application recomputes its own center', () => {
    const once = parseMpmRoot(applyTo(LADDER, PRODUCT));
    const twice = parseMpmRoot(applyTo(applyTo(LADDER, STEP), STEP));
    // The clamped `ff` re-enters the second run's population at the ceiling rather than at its
    // true value, which moves the center and therefore every other level.
    expect(numberAt(twice, 'dp', 'value')).not.toBeCloseTo(numberAt(once, 'dp', 'value'), 6);
  });

  it('restores it exactly once the reported center is passed back', () => {
    const once = parseMpmRoot(applyTo(LADDER, PRODUCT, CENTER));
    const twice = parseMpmRoot(applyTo(applyTo(LADDER, STEP, CENTER), STEP, CENTER));
    for (const id of ['dp', 'df']) {
      const composed = numberAt(twice, id, 'value');
      const direct = numberAt(once, id, 'value');
      expect(Math.abs(composed - direct) / Math.abs(direct)).toBeLessThan(1e-12);
    }
  });

  it('cannot restore a level the ceiling already swallowed', () => {
    // Honesty check on the remedy: re-injecting the center fixes the *center*, not the clamp.
    const twice = parseMpmRoot(applyTo(applyTo(LADDER, STEP, CENTER), STEP, CENTER));
    expect(numberAt(twice, 'dff', 'value')).toBe(127);
  });
});

describe('A4 — the engine never writes a non-finite value', () => {
  /**
   * Every hostile shape a real document can carry: Java's own `NaN`/`Infinity` literals, which
   * `parseJavaDouble` ACCEPTS so that a def lookup can hand back a non-finite value; overflow
   * literals; `parseFloat`'s lenient prefixes; empty strings; values outside a bounded domain;
   * and the degeneracies each row's gate is supposed to reject.
   */
  const ADVERSARIAL = globalDocument(
    '<tempoStyles><styleDef name="T"><tempoDef name="Nan" value="NaN"/>' +
      '<tempoDef name="Inf" value="Infinity"/><tempoDef name="Zero" value="0"/>' +
      '<tempoDef name="Neg" value="-60"/></styleDef></tempoStyles>' +
      '<dynamicsStyles><styleDef name="D"><dynamicsDef name="huge" value="1e999"/>' +
      '<dynamicsDef name="tiny" value="1e-320"/></styleDef></dynamicsStyles>' +
      '<rubatoStyles><styleDef name="R"><rubatoDef name="bad" intensity="0" ' +
      'lateStart="0.9" earlyEnd="0.4"/></styleDef></rubatoStyles>' +
      '<articulationStyles><styleDef name="A"><articulationDef name="junk" ' +
      'relativeDuration="-1" relativeVelocity="abc" absoluteVelocityChange="1e999"/>' +
      '</styleDef></articulationStyles>' +
      '<ornamentationStyles><styleDef name="O"><ornamentDef name="arp">' +
      '<temporalSpread frame.start="" frameLength="-5" intensity="0"/>' +
      '<dynamicsGradient transition.from="NaN"/></ornamentDef>' +
      '<ornamentDef name="live"><temporalSpread frame.start="-22" frameLength="44" ' +
      'intensity="1.5" time.unit="ticks"/><dynamicsGradient transition.from="-1" ' +
      'transition.to="1"/></ornamentDef>' +
      // The v3 frame's own hostile shapes (§7.15). A 309-digit value is schema-VALID and
      // overflows to Infinity, so the parse succeeds and only the gate stands between it and
      // the document; a v3 spread with no @frameLength has a non-neutral absent bound; and a
      // live v3 spread keeps the sweep from proving the invariant by writing nothing.
      `<ornamentDef name="v3huge"><temporalSpread frame.offset="${'9'.repeat(309)}ticks" ` +
      'frameLength="44ticks"/></ornamentDef>' +
      '<ornamentDef name="v3half"><temporalSpread frame.offset="-22.0ticks"/></ornamentDef>' +
      '<ornamentDef name="v3live"><temporalSpread frame.offset="-22.0ms" frameLength="80%" ' +
      'intensity="1.5"/></ornamentDef>' +
      '</styleDef></ornamentationStyles>',
    '<tempoMap><style date="0.0" name.ref="T"/>' +
      '<tempo date="0.0" bpm="Nan" beatLength="0.25"/>' +
      '<tempo date="1.0" bpm="Inf" beatLength="0.25"/>' +
      '<tempo date="2.0" bpm="Zero" beatLength="0.25"/>' +
      '<tempo date="3.0" bpm="Neg" beatLength="0.25"/>' +
      '<tempo date="4.0" bpm="120bpm" beatLength="0"/>' +
      '<tempo date="later" bpm="90" beatLength="0.25" meanTempoAt="0"/>' +
      '<tempo date="6.0" bpm="90" beatLength="0.25" transition.to="" meanTempoAt="1"/>' +
      // Valid siblings (F7). Without them every hostile site is refused upstream, almost
      // nothing is written, and the sweep proves "nothing was written" rather than
      // "everything written was finite" — the opposite of what A4 needs. These two reach the
      // DENORMALIZED-tempo write path in particular, which no other fixture here exercises.
      '<tempo date="7.0" bpm="90" beatLength="0.5" meanTempoAt="0.4" transition.to="70"/>' +
      '<tempo date="8.0" bpm="120" beatLength="0.25"/>' +
      '</tempoMap>' +
      '<dynamicsMap><style date="0.0" name.ref="D"/>' +
      '<dynamics date="0.0" volume="huge" curvature="1.5" protraction="-3"/>' +
      '<dynamics date="1.0" volume="tiny" transition.to="-4" curvature="" protraction="1"/>' +
      '<dynamics date="2.0" volume="?" transition.to="0"/>' +
      // A live gesture, plus the end-marker duplicate that repeats its target as the next
      // prevailing level — gate.ts names that as one of the three paths computing a value the
      // transforms never see, and it was unreached by this fixture.
      '<dynamics date="3.0" volume="60" transition.to="80" curvature="0.3" protraction="0.2"/>' +
      '<dynamics date="4.0" volume="80"/></dynamicsMap>' +
      '<rubatoMap><style date="0.0" name.ref="R"/>' +
      '<rubato date="0.0" name.ref="bad" intensity="-2" lateStart="2" earlyEnd="-1"/>' +
      '<rubato date="1.0" name.ref="missing" intensity="abc"/>' +
      '<rubato date="2.0" intensity="1.5" lateStart="0.2" earlyEnd="0.8"/></rubatoMap>' +
      '<articulationMap><style date="0.0" name.ref="A"/>' +
      '<articulation date="0.0" relativeDuration="0" absoluteDelay="NaN" absoluteDelayMs=""/>' +
      '<articulation date="1.0" relativeVelocity="1.2" absoluteVelocityChange="6"/>' +
      '</articulationMap>' +
      '<metricalAccentuationMap><accentuationPattern date="0.0" name.ref="none" scale="abc"/>' +
      '<accentuationPattern date="1.0" name.ref="none" scale="1e999"/>' +
      '</metricalAccentuationMap>' +
      '<ornamentationMap><style date="0.0" name.ref="O"/>' +
      '<ornament date="0.0" name.ref="arp" scale="1e999"/>' +
      '<ornament date="1.0" name.ref="live" scale="2"/>' +
      '<ornament date="2.0" name.ref="v3huge" scale="1"/>' +
      '<ornament date="3.0" name.ref="v3half" scale="1"/>' +
      '<ornament date="4.0" name.ref="v3live" scale="1"/></ornamentationMap>' +
      '<asynchronyMap><asynchrony date="0.0" milliseconds.offset="Infinity"/>' +
      '<asynchrony date="1.0" milliseconds.offset="-3ms"/></asynchronyMap>' +
      '<imprecisionMap.timing><distribution.uniform date="0.0" limit.lower="NaN" ' +
      'limit.upper="10"/><distribution.list date="1.0"><measurement value="abc"/>' +
      '<measurement value="4"/></distribution.list>' +
      '<distribution.uniform date="2.0" limit.lower="-9" limit.upper="9" ' +
      'milliseconds.timingBasis="100"/></imprecisionMap.timing>' +
      '<imprecisionMap.tuning><distribution.uniform date="0.0" limit.lower="-1" ' +
      'limit.upper="1" detuneUnit="cents"/></imprecisionMap.tuning>' +
      '<movementMap><movement date="0.0" position="0.0" transition.to="1.0" curvature="1.5" ' +
      'protraction="2"/><movement date="4.0" position="0.0" transition.to="1.0" ' +
      'curvature="" protraction="-1.5"/>' +
      '<movement date="8.0" position="0.0" transition.to="1.0" curvature="0.35" ' +
      'protraction="0.2"/>' +
      '<movement date="12.0" position="1.0" transition.to="0.0" curvature="1" protraction="1"/>' +
      '</movementMap>',
  );

  const FACTOR_SWEEP = [0, 0.25, 1.5, 3, 40];

  it.each(FACTOR_SWEEP)('writes only finite values at s = %s', (factor) => {
    const before = collectAttributes(canonicalBaseline(ADVERSARIAL));
    const { xml, report } = exaggerate(ADVERSARIAL, uniformFactors(factor));
    const after = collectAttributes(xml);

    expect([...after.keys()].sort()).toEqual([...before.keys()].sort());
    let changed = 0;
    for (const [key, value] of after) {
      if (value === before.get(key)) continue;
      changed += 1;
      // Anything the engine CHANGED it also computed, so it must be a finite number — in v3
      // possibly one wearing a unit, which `Number` alone would read as `NaN` (§7.15).
      expect(numericPart(value) !== null, `${key} = ${value}`).toBe(true);
      expect(['NaN', 'Infinity', '-Infinity']).not.toContain(value);
    }
    // F7's anti-vacuity guard: the invariant is "everything written was finite", which a
    // document that refuses everything satisfies by writing nothing. Measured on the
    // pre-fix fixture this loop body ran TWICE at four of the five factors.
    expect(report.totalWrites).toBeGreaterThan(0);
    expect(changed).toBeGreaterThan(5);
  });

  it.each(FACTOR_SWEEP)('never touches a @date at s = %s (R5)', (factor) => {
    const before = collectAttributes(canonicalBaseline(ADVERSARIAL));
    const { xml } = exaggerate(ADVERSARIAL, uniformFactors(factor));
    for (const [key, value] of collectAttributes(xml)) {
      if (!key.endsWith('@date')) continue;
      expect(value).toBe(before.get(key));
    }
  });

  /** Every number anywhere in a value, with the path that reaches it. */
  function numbersIn(value: unknown, path = '$'): readonly (readonly [string, number])[] {
    if (typeof value === 'number') return [[path, value]];
    if (Array.isArray(value)) return value.flatMap((item, i) => numbersIn(item, `${path}[${i}]`));
    if (value !== null && typeof value === 'object') {
      return Object.entries(value).flatMap(([key, item]) => numbersIn(item, `${path}.${key}`));
    }
    return [];
  }

  it.each(FACTOR_SWEEP)('returns a report whose every number is finite at s = %s', (factor) => {
    // RULE F1's own words: "every numeric field is finite or null". The XML sweep above cannot
    // see this — the report carries derived estimates that never reach the document, and
    // `velocityCoefficients.additive` is a PRODUCT of two separately gated finite quantities.
    // `JSON.stringify(Infinity)` is `null`, so a violation silently corrupts the round trip
    // RULE F1 exists to guarantee.
    const { report } = exaggerate(ADVERSARIAL, uniformFactors(factor));
    const numbers = numbersIn(report);
    expect(numbers.length).toBeGreaterThan(50);
    for (const [path, value] of numbers) {
      expect(Number.isFinite(value), `${path} = ${value}`).toBe(true);
    }
  });

  it('returns a report that survives a JSON round trip unchanged (RULE F1)', () => {
    const { report } = exaggerate(ADVERSARIAL, uniformFactors(2));
    expect(JSON.parse(JSON.stringify(report))).toEqual(report);
  });

  it('leaves every element and attribute in place — nothing is created or deleted', () => {
    const { xml } = exaggerate(ADVERSARIAL, uniformFactors(2));
    expect(collectAttributes(xml).size).toBe(
      collectAttributes(canonicalBaseline(ADVERSARIAL)).size,
    );
    expect(xml.match(/<[a-zA-Z]/g)?.length).toBe(
      canonicalBaseline(ADVERSARIAL).match(/<[a-zA-Z]/g)?.length,
    );
  });

  it('names a reason for every site it declined, per dimension', () => {
    // The engine's stated contract (applier.ts) is a per-site correspondence, so assert one.
    // Counting ALL non-identity notes against the skip total leaves the informational kinds —
    // `constant-instruction`, `movement-inert`, `derived-timing-basis`, the span and frame
    // notes — as slack, and measured that slack was thirteen notes wide: thirteen skips could
    // have lost their reason entirely and the assertion would still have held.
    const refusalKinds = new Set<ReportNoteKind>([
      'out-of-domain-input',
      'saturation-refused',
      'non-finite-result',
      'unresolvable-level',
      'heterogeneous-beat-length',
      'pair-collapse-refused',
      'atomic-group-skipped',
      'unwritable-level-site',
      'articulation-component-excluded',
      'no-center',
    ]);
    for (const factor of FACTOR_SWEEP) {
      const { performance } = exaggerate(ADVERSARIAL, uniformFactors(factor));
      let anySkip = false;
      for (const dimension of EXPRESSION_DIMENSIONS) {
        const skipped = performance.dimensions[dimension].sitesSkipped;
        if (skipped === 0) continue;
        anySkip = true;
        const reasons = performance.notes.filter(
          (note) => note.dimension === dimension && refusalKinds.has(note.kind),
        );
        expect(reasons.length).toBeGreaterThanOrEqual(skipped);
      }
      expect(anySkip).toBe(true);
    }
  });
});
