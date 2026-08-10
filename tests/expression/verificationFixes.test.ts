/**
 * One pin per W2-VERIFICATION finding, built from the finding's own reproduction.
 *
 * Every test here fails on the pre-fix engine — that is the entry criterion for being in this
 * file. The documents and the expected numbers are the verifiers', re-derived by hand rather
 * than copied from a run, so a regression fails with the same arithmetic the adversary used.
 *
 * They live apart from the per-dimension suites deliberately: a finding is a claim about a
 * defect, and a reader tracing "was F1 actually fixed, and how would we know" should not have
 * to reconstruct which of forty assertions was the one that mattered.
 */
import { describe, expect, it } from 'vitest';
import { ReportSink } from '../../src/expression/report.js';
import {
  exaggerate,
  globalDocument,
  logAroundCenter,
  noteKinds,
  notesOfKind,
  numberAt,
  textAt,
} from './applierFixtures.js';

describe('F1 (BLOCKER) — the pair-collapse refusal reaches def-side writes', () => {
  // §8's own reference fixture. μ = √(48·97) = 68.2348…; at s = 1.8 both the def `f` (97) and
  // the literal target (115) transform past the ceiling and clamp to 127, so the pair collapses
  // and the guard must refuse it. Before the fix the def write had already been flushed, and
  // the authored 97 → 115 crescendo shipped as a 127 → 115 DIMINUENDO while the report claimed
  // the pair was refused.
  const NAMED_LEVEL_PAIR = globalDocument(
    '<dynamicsStyles><styleDef name="D">' +
      '<dynamicsDef id="dp" name="p" value="48"/>' +
      '<dynamicsDef id="df" name="f" value="97"/>' +
      '</styleDef></dynamicsStyles>',
    '<dynamicsMap><style date="0.0" name.ref="D"/>' +
      '<dynamics id="m1" date="0.0" volume="p"/>' +
      '<dynamics id="m2" date="4.0" volume="f" transition.to="115"/>' +
      '</dynamicsMap>',
  );

  it('leaves BOTH endpoints authored when the pair would collapse', () => {
    const { root, performance } = exaggerate(NAMED_LEVEL_PAIR, { dynamics: 1.8 });
    expect(textAt(root, 'df', 'value')).toBe('97');
    expect(textAt(root, 'm2', 'transition.to')).toBe('115');
    expect(noteKinds(performance)).toContain('pair-collapse-refused');
  });

  it('never inverts the gesture — the direction of the authored crescendo survives', () => {
    const { root } = exaggerate(NAMED_LEVEL_PAIR, { dynamics: 1.8 });
    const level = numberAt(root, 'df', 'value');
    const target = numberAt(root, 'm2', 'transition.to');
    expect(target).toBeGreaterThan(level);
  });

  it('holds in the mirror arrangement, where the DEF is the target', () => {
    const MIRROR = globalDocument(
      '<dynamicsStyles><styleDef name="D">' +
        '<dynamicsDef id="dq" name="q" value="50"/>' +
        '<dynamicsDef id="dz" name="z" value="115"/>' +
        '</styleDef></dynamicsStyles>',
      '<dynamicsMap><style date="0.0" name.ref="D"/>' +
        '<dynamics id="m1" date="0.0" volume="q"/>' +
        '<dynamics id="m2" date="4.0" volume="97" transition.to="z"/>' +
        '</dynamicsMap>',
    );
    const { root, performance } = exaggerate(MIRROR, { dynamics: 4 });
    expect(textAt(root, 'm2', 'volume')).toBe('97');
    expect(textAt(root, 'dz', 'value')).toBe('115');
    expect(noteKinds(performance)).toContain('pair-collapse-refused');
  });

  it('propagates the refusal to every other pair resolving through the dropped def', () => {
    // `f` is named by two pairs. One collapses, so `f` is not written — and the OTHER pair must
    // not move its literal target either, or that gesture is half applied against a level that
    // stands still.
    const SHARED_DEF = globalDocument(
      '<dynamicsStyles><styleDef name="D">' +
        '<dynamicsDef id="dp" name="p" value="48"/>' +
        '<dynamicsDef id="df" name="f" value="97"/>' +
        '</styleDef></dynamicsStyles>',
      '<dynamicsMap><style date="0.0" name.ref="D"/>' +
        '<dynamics id="m1" date="0.0" volume="p"/>' +
        '<dynamics id="m2" date="4.0" volume="f" transition.to="115"/>' +
        '<dynamics id="m3" date="8.0" volume="f" transition.to="60"/>' +
        '</dynamicsMap>',
    );
    const { root, performance } = exaggerate(SHARED_DEF, { dynamics: 1.8 });
    expect(textAt(root, 'df', 'value')).toBe('97');
    expect(textAt(root, 'm3', 'transition.to')).toBe('60');
    expect(notesOfKind(performance, 'pair-collapse-refused').length).toBeGreaterThanOrEqual(2);
  });

  it('still transforms an unrelated def that no refused pair names', () => {
    const { root } = exaggerate(NAMED_LEVEL_PAIR, { dynamics: 1.8 });
    // `p` is named only by the constant instruction, so nothing about the refusal touches it.
    expect(numberAt(root, 'dp', 'value')).not.toBe(48);
  });

  it('control: the same document with literal levels was already correct', () => {
    const LITERAL = globalDocument(
      '',
      '<dynamicsMap>' +
        '<dynamics id="m1" date="0.0" volume="48"/>' +
        '<dynamics id="m2" date="4.0" volume="97" transition.to="115"/>' +
        '</dynamicsMap>',
    );
    const { root } = exaggerate(LITERAL, { dynamics: 1.8 });
    expect(textAt(root, 'm2', 'volume')).toBe('97');
    expect(textAt(root, 'm2', 'transition.to')).toBe('115');
  });
});

describe('F2 — the end-marker duplicate is written in its OWN beat unit', () => {
  // Both sites denote 60 quarter-note bpm (60·1 and 30·2), which is why the duplicate is
  // detected at all. Before the fix the transition's denormalized value was written straight
  // into a half-note `@bpm`, so the two sites that shared one musical value ended up a factor
  // of 2 apart — moving in opposite directions.
  const HETEROGENEOUS_DUPLICATE = globalDocument(
    '',
    '<tempoMap>' +
      '<tempo id="t1" date="0.0" bpm="120" beatLength="0.25" transition.to="60"/>' +
      '<tempo id="t2" date="4.0" bpm="30" beatLength="0.5"/>' +
      '</tempoMap>',
  );

  it('re-normalizes into the duplicate’s own @beatLength', () => {
    const { root } = exaggerate(HETEROGENEOUS_DUPLICATE, { tempo: 2 }, { scope: 'gesture' });
    // Both endpoints are quarter-note instructions, so the pair is (120, 60) in quarter-note
    // space. The center is accumulated the way `geometricMean` accumulates it — `exp(Σln/n)`,
    // in population order — because `Math.sqrt(120·60)` differs from it in the last bits.
    const pairCenter = Math.exp((Math.log(120) + Math.log(60)) / 2);
    const targetQuarterNote = logAroundCenter(60, 2, pairCenter);
    expect(numberAt(root, 't1', 'transition.to')).toBe(targetQuarterNote);
    // The duplicate is a HALF-note instruction: the same musical value is half the number.
    expect(numberAt(root, 't2', 'bpm')).toBe(targetQuarterNote / 2);
  });

  it('keeps the two sites denoting one musical value, moving the same way', () => {
    const { root } = exaggerate(HETEROGENEOUS_DUPLICATE, { tempo: 2 }, { scope: 'gesture' });
    const targetQuarterNote = numberAt(root, 't1', 'transition.to') * 1;
    const duplicateQuarterNote = numberAt(root, 't2', 'bpm') * 2;
    expect(duplicateQuarterNote).toBe(targetQuarterNote);
    // Both moved DOWN from the authored 60 quarter-note bpm, as a ritardando should.
    expect(duplicateQuarterNote).toBeLessThan(60);
  });

  it('says so in the note when the two beat units differ', () => {
    const { performance } = exaggerate(HETEROGENEOUS_DUPLICATE, { tempo: 2 }, { scope: 'gesture' });
    expect(notesOfKind(performance, 'end-marker-moved')[0].detail).toContain('quarter-note bpm');
  });

  it('is unchanged where the two instructions share a beat unit', () => {
    const HOMOGENEOUS = globalDocument(
      '',
      '<dynamicsMap>' +
        '<dynamics id="g1" date="0.0" volume="60" transition.to="90"/>' +
        '<dynamics id="g2" date="4.0" volume="90"/>' +
        '</dynamicsMap>',
    );
    const { root } = exaggerate(HOMOGENEOUS, { dynamics: 0.5 }, { scope: 'gesture' });
    expect(numberAt(root, 'g2', 'volume')).toBe(numberAt(root, 'g1', 'transition.to'));
  });
});

describe('F3 — dynamicsShape uses the renderer’s 100.0 fallback for constancy', () => {
  it('treats two unresolvable endpoints as the constant the renderer sees', () => {
    // Before the map's first `<style>` switch neither name resolves, so `resolveLevel` gives
    // NaN for both — and `NaN === NaN` is false, so the engine used to call this a gesture and
    // write curve parameters the renderer provably never reads.
    const BOTH_UNRESOLVABLE = globalDocument(
      '',
      '<dynamicsMap><dynamics id="k1" date="0.0" volume="pp" transition.to="pp" ' +
        'curvature="0.4" protraction="0.2"/></dynamicsMap>',
    );
    const { root, performance } = exaggerate(BOTH_UNRESOLVABLE, { dynamicsShape: 2 });
    expect(textAt(root, 'k1', 'curvature')).toBe('0.4');
    expect(textAt(root, 'k1', 'protraction')).toBe('0.2');
    expect(performance.dimensions.dynamicsShape.sitesInert).toBe(2);
    expect(notesOfKind(performance, 'constant-instruction')).toHaveLength(2);
    expect(performance.totalWrites).toBe(0);
  });

  it('compares a resolvable endpoint against the fallback, not against NaN', () => {
    // The renderer reads `volume="100"` as 100 and the unresolvable target as 100 too, so this
    // is a constant instruction — even though only one side is a placeholder.
    const ONE_UNRESOLVABLE = globalDocument(
      '',
      '<dynamicsMap><dynamics id="k1" date="0.0" volume="100" transition.to="?" ' +
        'curvature="0.4"/></dynamicsMap>',
    );
    const { root, performance } = exaggerate(ONE_UNRESOLVABLE, { dynamicsShape: 2 });
    expect(textAt(root, 'k1', 'curvature')).toBe('0.4');
    expect(noteKinds(performance)).toContain('constant-instruction');
  });

  it('keeps the fallback OUT of the center population (§7.2)', () => {
    // The same placeholder must NOT become a 100.0 level: inventing one would move every level
    // the author did write. This is the half of the rule the fix must not break.
    const MIXED = globalDocument(
      '',
      '<dynamicsMap>' +
        '<dynamics id="m1" date="0.0" volume="?"/>' +
        '<dynamics id="m2" date="4.0" volume="60"/>' +
        '</dynamicsMap>',
    );
    const { performance } = exaggerate(MIXED, { dynamics: 2 });
    expect(performance.centers.dynamics).toBe(60);
    expect(noteKinds(performance)).toContain('unresolvable-level');
  });
});

describe('F4 — tempoShape honours the renderer’s degenerate-pair rule', () => {
  it('is inert when the endpoints resolve equal, though @transition.to is present', () => {
    const DEGENERATE = globalDocument(
      '',
      '<tempoMap><tempo id="k" date="0.0" bpm="120" beatLength="0.25" transition.to="120" ' +
        'meanTempoAt="0.25"/></tempoMap>',
    );
    const { root, performance } = exaggerate(DEGENERATE, { tempoShape: 2 });
    expect(textAt(root, 'k', 'meanTempoAt')).toBe('0.25');
    expect(performance.dimensions.tempoShape.state).toBe('inert');
    expect(noteKinds(performance)).toContain('constant-instruction');
  });

  it('sees through a def name to the same conclusion', () => {
    const NAMED = globalDocument(
      '<tempoStyles><styleDef name="T"><tempoDef name="A" value="120"/></styleDef></tempoStyles>',
      '<tempoMap><style date="0.0" name.ref="T"/>' +
        '<tempo id="k" date="0.0" bpm="A" beatLength="0.25" transition.to="A" ' +
        'meanTempoAt="0.25"/></tempoMap>',
    );
    const { root, performance } = exaggerate(NAMED, { tempoShape: 2 });
    expect(textAt(root, 'k', 'meanTempoAt')).toBe('0.25');
    expect(performance.dimensions.tempoShape.state).toBe('inert');
  });

  it('still transforms a genuine transition', () => {
    const REAL = globalDocument(
      '',
      '<tempoMap><tempo id="k" date="0.0" bpm="120" beatLength="0.25" transition.to="60" ' +
        'meanTempoAt="0.25"/></tempoMap>',
    );
    const { root } = exaggerate(REAL, { tempoShape: 2 });
    expect(numberAt(root, 'k', 'meanTempoAt')).toBeCloseTo(0.1, 12);
  });
});

describe('F5 — the §7.16 "read it" obligations are discharged as report channels', () => {
  it('reports the ornament frame’s unit and noteoff regime on every transformed spread', () => {
    const SPREAD = globalDocument(
      '<ornamentationStyles><styleDef name="O"><ornamentDef name="arp">' +
        '<temporalSpread id="s" frame.start="-22" frameLength="44" time.unit="milliseconds" ' +
        'noteoff.shift="monophonic"/></ornamentDef></styleDef></ornamentationStyles>',
      '<ornamentationMap><style date="0.0" name.ref="O"/>' +
        '<ornament date="0.0" name.ref="arp" scale="1"/></ornamentationMap>',
    );
    const { performance } = exaggerate(SPREAD, { ornamentSpread: 2 });
    expect(notesOfKind(performance, 'frame-time-unit')[0].detail).toContain('milliseconds');
    expect(notesOfKind(performance, 'frame-noteoff-shift')[0].detail).toContain('LENGTHENS');
  });

  it('reports the sub-note dynamics regime, where the velocityRange clamp is the wrong model', () => {
    const SUB_NOTE = globalDocument(
      '',
      '<dynamicsMap><dynamics id="d1" date="0.0" volume="60" transition.to="90" ' +
        'subNoteDynamics="true"/></dynamicsMap>',
    );
    const { performance } = exaggerate(SUB_NOTE, { dynamics: 2 });
    expect(noteKinds(performance)).toContain('sub-note-dynamics');
  });

  it('does not report it for an ordinary instruction', () => {
    const PLAIN = globalDocument(
      '',
      '<dynamicsMap><dynamics id="d1" date="0.0" volume="60" transition.to="90"/></dynamicsMap>',
    );
    expect(noteKinds(exaggerate(PLAIN, { dynamics: 2 }).performance)).not.toContain(
      'sub-note-dynamics',
    );
  });

  it('reports the span flags that decide where a scaled accent lands', () => {
    const PATTERN = globalDocument(
      '<metricalAccentuationStyles><styleDef name="M">' +
        '<accentuationPatternDef name="p4" length="4"><accentuation beat="1" value="20"/>' +
        '</accentuationPatternDef></styleDef></metricalAccentuationStyles>',
      '<metricalAccentuationMap><style date="0.0" name.ref="M"/>' +
        '<accentuationPattern id="p1" date="0.0" name.ref="p4" scale="1" loop="true"/>' +
        '</metricalAccentuationMap>',
    );
    const { performance } = exaggerate(PATTERN, { accentuation: 2 });
    const spans = notesOfKind(performance, 'span-flags');
    expect(spans).toHaveLength(1);
    // The asymmetry a caller cannot guess: @loop defaults false, @stickToMeasures defaults TRUE.
    expect(spans[0].detail).toContain('defaults to TRUE');
  });

  it('reports rubato’s span flag, which is never inherited from the def', () => {
    const RUBATO = globalDocument(
      '',
      '<rubatoMap><rubato id="r1" date="0.0" intensity="1.5" loop="false"/></rubatoMap>',
    );
    const { performance } = exaggerate(RUBATO, { rubato: 2 });
    expect(notesOfKind(performance, 'span-flags')[0].detail).toContain('span cutoff');
  });
});

describe('F6 — every number in the report is finite or null (RULE F1)', () => {
  it('rejects an overflowing ornamentDynamics coefficient and names the site', () => {
    // Each attribute passes its own `anyFinite` gate; it is their PRODUCT that overflows.
    const HUGE_GRADIENT = globalDocument(
      '<ornamentationStyles><styleDef name="O"><ornamentDef name="arp">' +
        '<dynamicsGradient id="g" transition.from="-1e300" transition.to="1e300"/>' +
        '</ornamentDef></styleDef></ornamentationStyles>',
      '<ornamentationMap><style date="0.0" name.ref="O"/>' +
        '<ornament date="0.0" name.ref="arp" scale="1e300"/></ornamentationMap>',
    );
    const { performance } = exaggerate(HUGE_GRADIENT, { ornamentDynamics: 2 });
    const coefficients = performance.dimensions.ornamentDynamics.velocityCoefficients!;
    expect(Number.isFinite(coefficients.additive)).toBe(true);
    expect(noteKinds(performance)).toContain('non-finite-result');
  });

  it('rejects an overflowing accentuation coefficient and names the site', () => {
    const HUGE_ACCENT = globalDocument(
      '<metricalAccentuationStyles><styleDef name="M">' +
        '<accentuationPatternDef name="p" length="4"><accentuation beat="1" value="1e300"/>' +
        '</accentuationPatternDef></styleDef></metricalAccentuationStyles>',
      '<metricalAccentuationMap><style date="0.0" name.ref="M"/>' +
        '<accentuationPattern id="p1" date="0.0" name.ref="p" scale="1e300"/>' +
        '</metricalAccentuationMap>',
    );
    const { performance } = exaggerate(HUGE_ACCENT, { accentuation: 2 });
    const coefficients = performance.dimensions.accentuation.velocityCoefficients!;
    expect(Number.isFinite(coefficients.additive)).toBe(true);
    expect(noteKinds(performance)).toContain('non-finite-result');
  });

  it('still writes the document — the estimate is what is withheld, not the transform', () => {
    const HUGE_ACCENT = globalDocument(
      '<metricalAccentuationStyles><styleDef name="M">' +
        '<accentuationPatternDef name="p" length="4"><accentuation beat="1" value="1e300"/>' +
        '</accentuationPatternDef></styleDef></metricalAccentuationStyles>',
      '<metricalAccentuationMap><style date="0.0" name.ref="M"/>' +
        '<accentuationPattern id="p1" date="0.0" name.ref="p" scale="2"/>' +
        '</metricalAccentuationMap>',
    );
    const { root } = exaggerate(HUGE_ACCENT, { accentuation: 2 });
    expect(numberAt(root, 'p1', 'scale')).toBe(4);
  });
});

describe('F8 — state precedence is transformed > partial (§4 as amended)', () => {
  const LOPSIDED_AND_WHOLE = globalDocument(
    '<articulationStyles><styleDef name="A">' +
      '<articulationDef id="whole" name="whole" relativeVelocity="1.2"/>' +
      '<articulationDef id="half" name="half" relativeVelocity="1.2" absoluteVelocity="100"/>' +
      '</styleDef></articulationStyles>',
    '<articulationMap><style date="0.0" name.ref="A"/></articulationMap>',
  );

  it('reads transformed when one site was fully reachable', () => {
    const { performance } = exaggerate(LOPSIDED_AND_WHOLE, { articulation: 2 });
    expect(performance.dimensions.articulation.state).toBe('transformed');
    // Both sites were written, partial included: the counter reports writes, the state reports
    // reachability.
    expect(performance.dimensions.articulation.sitesTransformed).toBe(2);
  });

  it('reads partial only when EVERY written site had a component out of reach', () => {
    const ONLY_LOPSIDED = globalDocument(
      '<articulationStyles><styleDef name="A">' +
        '<articulationDef id="stacc" name="stacc" absoluteDurationMs="160" ' +
        'absoluteVelocityChange="-5"/></styleDef></articulationStyles>',
      '<articulationMap><style date="0.0" name.ref="A"/></articulationMap>',
    );
    const { performance } = exaggerate(ONLY_LOPSIDED, { articulation: 2 });
    expect(performance.dimensions.articulation.state).toBe('partial');
    expect(performance.dimensions.articulation.sitesTransformed).toBe(1);
  });
});

describe('F9 — transition-to-absent fires only when @transition.to is the missing one', () => {
  it('stays silent for a gradient carrying only @transition.to', () => {
    const ONLY_TARGET = globalDocument(
      '<ornamentationStyles><styleDef name="O"><ornamentDef name="arp">' +
        '<dynamicsGradient id="g" transition.to="1.0"/></ornamentDef></styleDef>' +
        '</ornamentationStyles>',
      '<ornamentationMap><style date="0.0" name.ref="O"/>' +
        '<ornament date="0.0" name.ref="arp" scale="1.0"/></ornamentationMap>',
    );
    const { performance } = exaggerate(ONLY_TARGET, { ornamentDynamics: 2 });
    expect(noteKinds(performance)).not.toContain('transition-to-absent');
  });

  it('still fires for a gradient carrying only @transition.from', () => {
    const ONLY_SOURCE = globalDocument(
      '<ornamentationStyles><styleDef name="O"><ornamentDef name="arp">' +
        '<dynamicsGradient id="g" transition.from="0.5"/></ornamentDef></styleDef>' +
        '</ornamentationStyles>',
      '<ornamentationMap><style date="0.0" name.ref="O"/>' +
        '<ornament date="0.0" name.ref="arp" scale="1.0"/></ornamentationMap>',
    );
    const { performance } = exaggerate(ONLY_SOURCE, { ornamentDynamics: 2 });
    expect(noteKinds(performance)).toContain('transition-to-absent');
  });
});

describe('F10 — a pitch lever makes an articulation site partial too', () => {
  it('reports a site carrying @detuneCents beside a transformed lever as partial', () => {
    const DETUNED = globalDocument(
      '<articulationStyles><styleDef name="A">' +
        '<articulationDef id="d" name="d" relativeVelocity="1.2" detuneCents="20"/>' +
        '</styleDef></articulationStyles>',
      '<articulationMap><style date="0.0" name.ref="A"/></articulationMap>',
    );
    const { root, performance } = exaggerate(DETUNED, { articulation: 2 });
    expect(textAt(root, 'd', 'detuneCents')).toBe('20');
    expect(performance.dimensions.articulation.state).toBe('partial');
    expect(notesOfKind(performance, 'articulation-component-excluded')[0].attribute).toBe(
      'detuneCents',
    );
  });
});

describe('F11 — the population is built from gate-surviving values (A5)', () => {
  // bpm and beatLength are each finite and positive; their PRODUCT underflows to 0. Gating the
  // raw value let the site into the population, where `geometricMean` refused it and the whole
  // dimension went inert with a note that never named the offender.
  const UNDERFLOWING_PRODUCT = globalDocument(
    '',
    '<tempoMap>' +
      '<tempo id="h1" date="0.0" bpm="120" beatLength="0.25"/>' +
      '<tempo id="h2" date="1.0" bpm="60" beatLength="0.25"/>' +
      '<tempo id="bad" date="2.0" bpm="1e-320" beatLength="1e-320"/>' +
      '</tempoMap>',
  );

  it('skips the offending site and names it, instead of inerting the dimension', () => {
    const { performance } = exaggerate(UNDERFLOWING_PRODUCT, { tempo: 2 });
    const refusals = notesOfKind(performance, 'out-of-domain-input');
    expect(refusals).toHaveLength(1);
    expect(refusals[0].attribute).toBe('bpm');
    expect(refusals[0].detail).toContain('normalized');
    expect(noteKinds(performance)).not.toContain('no-center');
  });

  it('computes the center from the survivors and transforms them', () => {
    const { root, performance } = exaggerate(UNDERFLOWING_PRODUCT, { tempo: 2 });
    const center = Math.exp((Math.log(120) + Math.log(60)) / 2);
    expect(performance.centers.tempo).toBe(center);
    expect(numberAt(root, 'h1', 'bpm')).toBe(center * Math.pow(120 / center, 2));
    expect(numberAt(root, 'h2', 'bpm')).toBe(center * Math.pow(60 / center, 2));
    expect(textAt(root, 'bad', 'bpm')).toBe('1e-320');
  });

  it('does the same on the def side, where the normalizer is the referencing beatLength', () => {
    const OVERFLOWING_DEF = globalDocument(
      '<tempoStyles><styleDef name="T"><tempoDef id="big" name="Big" value="1e308"/>' +
        '</styleDef></tempoStyles>',
      '<tempoMap><style date="0.0" name.ref="T"/>' +
        '<tempo id="t1" date="0.0" bpm="Big" beatLength="1e300"/>' +
        '<tempo id="t2" date="4.0" bpm="90" beatLength="0.25"/>' +
        '</tempoMap>',
    );
    const { root, performance } = exaggerate(OVERFLOWING_DEF, { tempo: 2 });
    expect(textAt(root, 'big', 'value')).toBe('1e308');
    expect(performance.centers.tempo).toBe(90);
    expect(noteKinds(performance)).toContain('out-of-domain-input');
  });
});

describe('MINOR — the report hands out copies, never the sink’s interior', () => {
  it('cannot be grown through the array it returned', () => {
    // CHARTER: "outputs freshly created, no internal mutable state leaked". `readonly
    // ReportNote[]` is a compile-time claim only — the runtime one is that the accumulating
    // array never escapes, so a caller holding the result as `unknown[]` cannot push into the
    // sink and have the next reader see it.
    const sink = new ReportSink();
    sink.note('identity-factor', 'tempo', null, 'first');
    sink.mergeLevels('f', 'ff');

    const notes = sink.notes;
    const merged = sink.mergedLevels;
    (notes as unknown as { push: (value: unknown) => void }).push({ kind: 'forged' });
    (merged as unknown as { push: (value: unknown) => void }).push(['forged', 'forged']);

    expect(sink.notes).toHaveLength(1);
    expect(sink.mergedLevels).toHaveLength(1);
  });
});
