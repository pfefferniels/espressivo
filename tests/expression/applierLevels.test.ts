/**
 * The two level dimensions: DESIGN §7.1's center population, §7.2/§7.4's rows, §1.3's scopes.
 *
 * Every expectation here is computed from the hand-derived center with the same closed form
 * the engine uses, so the assertions are exact rather than approximate. That is deliberate:
 * an ULP-level disagreement between the engine's `μ·(x/μ)^s` and a test's `x^s·μ^(1−s)` would
 * pass an epsilon comparison while proving that P2 (composition to ~1 ULP) had been given up.
 */
import { describe, expect, it } from 'vitest';
import { canonicalBaseline } from '../../src/expression/mpmDocument.js';
import {
  exaggerate,
  globalDocument,
  logAroundCenter,
  noteKinds,
  notesOfKind,
  numberAt,
  textAt,
} from './applierFixtures.js';

/** The engine's own accumulation order: `exp(Σ ln xᵢ / n)`, summed in population order. */
function geomean(...values: readonly number[]): number {
  const logSum = values.reduce((sum, value) => sum + Math.log(value), 0);
  return Math.exp(logSum / values.length);
}

describe('applyExaggeration — tempo (§7.2)', () => {
  // Three surviving level sites in three different shapes: a def named from a quarter-note
  // instruction, a literal on a HALF-note instruction, and a def named from a quarter-note
  // instruction that also carries a transition target. The target is transformed and excluded
  // from the population, which is the whole point of §7.1's third rule.
  const MIXED = globalDocument(
    '<tempoStyles><styleDef name="T">' +
      '<tempoDef id="allegro" name="Allegro" value="120"/>' +
      '<tempoDef id="adagio" name="Adagio" value="60"/>' +
      '</styleDef></tempoStyles>',
    '<tempoMap><style date="0.0" name.ref="T"/>' +
      '<tempo id="t1" date="0.0" bpm="Allegro" beatLength="0.25"/>' +
      '<tempo id="t2" date="4.0" bpm="90" beatLength="0.5"/>' +
      '<tempo id="t3" date="8.0" bpm="Adagio" beatLength="0.25" transition.to="80"/>' +
      '</tempoMap>',
  );

  // Population in walk order: the literal first (90 half-note bpm = 180 quarter-note bpm),
  // then the referenced defs in first-reference order. `@transition.to`'s 80 is NOT in it.
  const CENTER = geomean(180, 120, 60);

  it('computes the center in quarter-note-normalized space over defs and literals alike', () => {
    const { performance } = exaggerate(MIXED, { tempo: 2 });
    expect(performance.centers.tempo).toBe(CENTER);
    expect(performance.centers.dynamics).toBeNull();
  });

  it('writes the def value, never the name the instruction carries (D-C)', () => {
    const { root } = exaggerate(MIXED, { tempo: 2 });
    expect(textAt(root, 't1', 'bpm')).toBe('Allegro');
    expect(numberAt(root, 'allegro', 'value')).toBe(logAroundCenter(120, 2, CENTER));
    expect(numberAt(root, 'adagio', 'value')).toBe(logAroundCenter(60, 2, CENTER));
  });

  it('maps a literal back through its own @beatLength', () => {
    const { root } = exaggerate(MIXED, { tempo: 2 });
    // Normalized to 180, transformed there, then divided by this instruction's own 0.5·4.
    expect(numberAt(root, 't2', 'bpm')).toBe(logAroundCenter(180, 2, CENTER) / 2);
    expect(textAt(root, 't2', 'beatLength')).toBe('0.5');
  });

  it('transforms @transition.to although it is excluded from the population', () => {
    const { root } = exaggerate(MIXED, { tempo: 2 });
    expect(numberAt(root, 't3', 'transition.to')).toBe(logAroundCenter(80, 2, CENTER));
  });

  it('reports §8’s deviation ratio from the population, not from the written values', () => {
    const { performance } = exaggerate(MIXED, { tempo: 2 });
    expect(performance.bounds.tempoDeviationRatio).toBe(Math.max(180 / CENTER, CENTER / 60));
  });

  it('skips a def reached from instructions with different @beatLength', () => {
    const HETEROGENEOUS = globalDocument(
      '<tempoStyles><styleDef name="T"><tempoDef id="d" name="Allegro" value="120"/>' +
        '</styleDef></tempoStyles>',
      '<tempoMap><style date="0.0" name.ref="T"/>' +
        '<tempo id="t1" date="0.0" bpm="Allegro" beatLength="0.25"/>' +
        '<tempo id="t2" date="4.0" bpm="Allegro" beatLength="0.5"/>' +
        '<tempo id="t3" date="8.0" bpm="100" beatLength="0.25"/>' +
        '</tempoMap>',
    );
    const { root, performance } = exaggerate(HETEROGENEOUS, { tempo: 2 });
    expect(noteKinds(performance)).toContain('heterogeneous-beat-length');
    expect(numberAt(root, 'd', 'value')).toBe(120);
    // The skipped def is out of the population too, so the center is the surviving literal
    // alone — which `geometricMean` returns exactly, without a log round trip.
    expect(performance.centers.tempo).toBe(100);
    expect(numberAt(root, 't3', 'bpm')).toBe(100);
  });
});

describe('applyExaggeration — the skip set precedes the center (§7.1, A5)', () => {
  const WITH_CASUALTIES = globalDocument(
    '',
    '<tempoMap>' +
      '<tempo id="t1" date="0.0" bpm="120" beatLength="0.25"/>' +
      '<tempo id="t2" date="4.0" bpm="?" beatLength="0.25"/>' +
      '<tempo id="t3" date="8.0" bpm="200"/>' +
      '<tempo id="t4" date="12.0" bpm="80" beatLength="0.25"/>' +
      '</tempoMap>',
  );

  it('excludes an unresolvable placeholder and a beatLength-less instruction from the center', () => {
    const { performance } = exaggerate(WITH_CASUALTIES, { tempo: 2 });
    expect(performance.centers.tempo).toBe(geomean(120, 80));
  });

  it('leaves both casualties byte-identical and names each in the report', () => {
    const { root, performance } = exaggerate(WITH_CASUALTIES, { tempo: 2 });
    expect(textAt(root, 't2', 'bpm')).toBe('?');
    expect(textAt(root, 't3', 'bpm')).toBe('200');
    expect(noteKinds(performance)).toEqual(
      expect.arrayContaining(['unresolvable-level', 'missing-beat-length']),
    );
    expect(performance.dimensions.tempo.sitesSkipped).toBe(1);
    expect(performance.dimensions.tempo.sitesInert).toBe(1);
  });

  it('transforms the survivors around the center the survivors produced', () => {
    const { root } = exaggerate(WITH_CASUALTIES, { tempo: 2 });
    const center = geomean(120, 80);
    expect(numberAt(root, 't1', 'bpm')).toBe(logAroundCenter(120, 2, center));
    expect(numberAt(root, 't4', 'bpm')).toBe(logAroundCenter(80, 2, center));
  });

  it('reports the dimension INERT, not skipped, when the population comes out empty', () => {
    // R-W2-5/#10: an empty population is a refusal from `geometricMean`, and the honest verdict
    // for the dimension is that this document gives it nothing to work on — even though the
    // placeholder that emptied the population was itself counted as a per-site skip.
    const NOTHING_SURVIVES = globalDocument(
      '',
      '<tempoMap><tempo id="t1" date="0.0" bpm="+" beatLength="0.25"/></tempoMap>',
    );
    const { performance } = exaggerate(NOTHING_SURVIVES, { tempo: 2 });
    expect(performance.centers.tempo).toBeNull();
    expect(performance.dimensions.tempo.state).toBe('inert');
    expect(noteKinds(performance)).toContain('no-center');
    expect(performance.totalWrites).toBe(0);
  });

  it('says absent — not inert — when the document carries no map of that kind at all', () => {
    const NO_TEMPO_MAP = globalDocument(
      '',
      '<dynamicsMap><dynamics id="d1" date="0.0" volume="60"/></dynamicsMap>',
    );
    const { performance } = exaggerate(NO_TEMPO_MAP, { tempo: 2 });
    expect(performance.dimensions.tempo.state).toBe('absent');
    expect(noteKinds(performance)).not.toContain('no-center');
  });

  it('keeps a non-finite def value out of the population, not merely out of the writes', () => {
    // LOG W2 finding 4: `parseJavaDouble` accepts Java's `NaN` literal, so a resolved def can
    // carry a non-finite value. The gate rejects it into the skip set BEFORE the center is
    // computed — if it reached the population the center would be `NaN` and every level would
    // then fail, which is the difference between one reported skip and a dead dimension.
    const NAN_DEF = globalDocument(
      '<tempoStyles><styleDef name="T"><tempoDef id="bad" name="Broken" value="NaN"/>' +
        '</styleDef></tempoStyles>',
      '<tempoMap><style date="0.0" name.ref="T"/>' +
        '<tempo id="t1" date="0.0" bpm="Broken" beatLength="0.25"/>' +
        '<tempo id="t2" date="4.0" bpm="120" beatLength="0.25"/>' +
        '<tempo id="t3" date="8.0" bpm="80" beatLength="0.25"/>' +
        '</tempoMap>',
    );
    const { root, performance } = exaggerate(NAN_DEF, { tempo: 2 });
    expect(performance.centers.tempo).toBe(geomean(120, 80));
    expect(textAt(root, 'bad', 'value')).toBe('NaN');
    expect(noteKinds(performance)).toContain('out-of-domain-input');
    expect(numberAt(root, 't2', 'bpm')).toBe(logAroundCenter(120, 2, geomean(120, 80)));
  });
});

describe('applyExaggeration — the exact-center branches (§7.1, R-W2-5/#9)', () => {
  // `geometricMean` returns a single-element population and an all-equal one EXACTLY, without
  // a log round trip. That is what protects the piecewise-constant corpus: the center is one of
  // the values, so `μ·(x/μ)^s` is `μ·1^s = μ` bit for bit, the written spelling is the one
  // already in the file, and the write is skipped. Were the center off by an ULP instead, every
  // constant instruction in every mpmify-generated performance would be rewritten at every s.

  it('writes nothing for a piecewise-constant map at s ≠ 1', () => {
    const ALL_EQUAL = globalDocument(
      '',
      '<dynamicsMap>' +
        '<dynamics id="d1" date="0.0" volume="60"/>' +
        '<dynamics id="d2" date="4.0" volume="60"/>' +
        '<dynamics id="d3" date="8.0" volume="60"/>' +
        '</dynamicsMap>',
    );
    const { xml, performance } = exaggerate(ALL_EQUAL, { dynamics: 2.5 });
    expect(performance.centers.dynamics).toBe(60);
    expect(performance.totalWrites).toBe(0);
    expect(xml).toBe(canonicalBaseline(ALL_EQUAL));
  });

  it('writes nothing for a single-level map, which is its own center', () => {
    const SINGLE = globalDocument(
      '',
      '<tempoMap><tempo id="t1" date="0.0" bpm="97.3" beatLength="0.25"/></tempoMap>',
    );
    const { xml, performance } = exaggerate(SINGLE, { tempo: 0.4 });
    expect(performance.centers.tempo).toBe(97.3);
    expect(performance.totalWrites).toBe(0);
    expect(xml).toBe(canonicalBaseline(SINGLE));
  });

  it('holds for named levels too, where the def is the whole population', () => {
    const NAMED_CONSTANT = globalDocument(
      '<dynamicsStyles><styleDef name="D"><dynamicsDef id="dp" name="p" value="48"/>' +
        '</styleDef></dynamicsStyles>',
      '<dynamicsMap><style date="0.0" name.ref="D"/>' +
        '<dynamics id="d1" date="0.0" volume="p"/>' +
        '<dynamics id="d2" date="4.0" volume="p"/>' +
        '</dynamicsMap>',
    );
    const { xml, performance } = exaggerate(NAMED_CONSTANT, { dynamics: 3 });
    expect(performance.centers.dynamics).toBe(48);
    expect(performance.totalWrites).toBe(0);
    expect(xml).toBe(canonicalBaseline(NAMED_CONSTANT));
  });
});

describe('applyExaggeration — dynamics (§7.4)', () => {
  const LADDER = globalDocument(
    '<dynamicsStyles><styleDef name="D">' +
      '<dynamicsDef id="dp" name="p" value="48"/>' +
      '<dynamicsDef id="df" name="f" value="97"/>' +
      '<dynamicsDef id="dff" name="ff" value="112"/>' +
      '</styleDef></dynamicsStyles>',
    '<dynamicsMap><style date="0.0" name.ref="D"/>' +
      '<dynamics id="m1" date="0.0" volume="p"/>' +
      '<dynamics id="m2" date="4.0" volume="f"/>' +
      '<dynamics id="m3" date="8.0" volume="ff"/>' +
      '</dynamicsMap>',
  );
  const CENTER = geomean(48, 97, 112);

  it('clamps into velocityRange and counts every clamp event (R6a)', () => {
    const { root, performance } = exaggerate(LADDER, { dynamics: 4 });
    expect(performance.dimensions.dynamics.clamps).toBe(2);
    // The counter and the note are two statements; assert both, or deleting the note passes.
    // Which LEVEL hit the ceiling is the detail that distinguishes `dynamics` from the four
    // coefficient dimensions, so the report has to keep naming it.
    const clamps = notesOfKind(performance, 'clamped');
    expect(clamps).toHaveLength(2);
    expect(clamps.every((note) => note.attribute === 'value')).toBe(true);
    expect(numberAt(root, 'dp', 'value')).toBe(logAroundCenter(48, 4, CENTER));
    expect(numberAt(root, 'df', 'value')).toBe(127);
    expect(numberAt(root, 'dff', 'value')).toBe(127);
  });

  it('names the two levels the clamp collapsed onto one value (§7.4 mergedLevels)', () => {
    const { performance } = exaggerate(LADDER, { dynamics: 4 });
    expect(performance.mergedLevels).toEqual([['f', 'ff']]);
    expect(noteKinds(performance)).toContain('merged-levels');
  });

  it('does not merge levels that stay below the ceiling', () => {
    const { performance } = exaggerate(LADDER, { dynamics: 1.2 });
    expect(performance.mergedLevels).toEqual([]);
    expect(performance.dimensions.dynamics.clamps).toBe(0);
  });

  it('honours a caller-supplied center and echoes it back', () => {
    const { root, performance } = exaggerate(LADDER, { dynamics: 2 }, { center: { dynamics: 64 } });
    expect(performance.centers.dynamics).toBe(64);
    expect(numberAt(root, 'dp', 'value')).toBe(logAroundCenter(48, 2, 64));
  });

  it('respects a caller-widened velocityRange', () => {
    const { root, performance } = exaggerate(
      LADDER,
      { dynamics: 4 },
      { velocityRange: { min: 1, max: 400 } },
    );
    expect(performance.dimensions.dynamics.clamps).toBe(0);
    expect(numberAt(root, 'dff', 'value')).toBe(logAroundCenter(112, 4, CENTER));
  });
});

describe('applyExaggeration — gesture scope (§1.3, A7, D-I)', () => {
  const WITH_END_MARKER = globalDocument(
    '',
    '<dynamicsMap>' +
      '<dynamics id="g1" date="0.0" volume="60" transition.to="90"/>' +
      '<dynamics id="g2" date="4.0" volume="90"/>' +
      '<dynamics id="g3" date="8.0" volume="70"/>' +
      '</dynamicsMap>',
  );
  const PAIR_CENTER = geomean(60, 90);

  it('scales a pair around its own geomean and reports no performance-wide center', () => {
    const { root, performance } = exaggerate(
      WITH_END_MARKER,
      { dynamics: 0.5 },
      { scope: 'gesture' },
    );
    expect(performance.centers.dynamics).toBeNull();
    expect(numberAt(root, 'g1', 'volume')).toBe(logAroundCenter(60, 0.5, PAIR_CENTER));
    expect(numberAt(root, 'g1', 'transition.to')).toBe(logAroundCenter(90, 0.5, PAIR_CENTER));
  });

  it('moves the MEI end-marker duplicate with the transition endpoint (§7.2/A7)', () => {
    const { root, performance } = exaggerate(
      WITH_END_MARKER,
      { dynamics: 0.5 },
      { scope: 'gesture' },
    );
    expect(numberAt(root, 'g2', 'volume')).toBe(logAroundCenter(90, 0.5, PAIR_CENTER));
    expect(noteKinds(performance)).toContain('end-marker-moved');
  });

  it('CHARACTERIZES: it steps over a <dynamics> the renderer treats as a span boundary', () => {
    /**
     * A pinned divergence, not a ratified rule — see `markEndMarkerDuplicates`' docstring.
     *
     * "The next instruction" is the next CLASSIFIED one, and an element carrying neither
     * `@volume` nor `@transition.to` classifies away. The renderer does not ignore it: it
     * ENDS the previous span with it (AD-33.4). Measured through `performMsm` on five notes,
     * the same map with and without a bare `<dynamics/>` in the middle performs
     *
     *     without:  60, 67.49…, 75, 82.51…, 90     (one ramp)
     *     with:     60, 75, 100.0, 100.0, 90
     *
     * so the later constant is separated from the transition endpoint by a discontinuity the
     * document already contains. It is nevertheless still detected and moved, which this pins.
     *
     * The test is written to FAIL if that is ever changed, deliberately: the change is a §7.2
     * ruling (tempo must keep stepping over a `<tempo>` without `@beatLength`, which the
     * renderer really does ignore), and it should be made with this test going red rather than
     * discovered afterwards.
     */
    const bareBetween = globalDocument(
      '',
      '<dynamicsMap>' +
        '<dynamics id="g1" date="0.0" volume="60" transition.to="90"/>' +
        '<dynamics id="gx" date="2.0"/>' +
        '<dynamics id="g2" date="4.0" volume="90"/>' +
        '</dynamicsMap>',
    );
    const { root, performance } = exaggerate(bareBetween, { dynamics: 0.5 }, { scope: 'gesture' });

    expect(noteKinds(performance)).toContain('end-marker-moved');
    expect(numberAt(root, 'g2', 'volume')).toBe(logAroundCenter(90, 0.5, PAIR_CENTER));
    // Non-vacuous: `g2` really did move, and it moved to the transition endpoint's new value.
    expect(numberAt(root, 'g2', 'volume')).not.toBe(90);
    expect(numberAt(root, 'g2', 'volume')).toBe(numberAt(root, 'g1', 'transition.to'));
  });

  it('leaves an unrelated constant instruction alone and reports it inert', () => {
    const { root, performance } = exaggerate(
      WITH_END_MARKER,
      { dynamics: 0.5 },
      { scope: 'gesture' },
    );
    expect(textAt(root, 'g3', 'volume')).toBe('70');
    expect(noteKinds(performance)).toContain('constant-instruction');
  });

  it('leaves def values untouched and reports why', () => {
    const NAMED = globalDocument(
      '<dynamicsStyles><styleDef name="D"><dynamicsDef id="dp" name="p" value="48"/>' +
        '</styleDef></dynamicsStyles>',
      '<dynamicsMap><style date="0.0" name.ref="D"/>' +
        '<dynamics id="m1" date="0.0" volume="p" transition.to="90"/>' +
        '</dynamicsMap>',
    );
    const { root, performance } = exaggerate(NAMED, { dynamics: 0.5 }, { scope: 'gesture' });
    expect(numberAt(root, 'dp', 'value')).toBe(48);
    expect(textAt(root, 'm1', 'transition.to')).toBe('90');
    expect(noteKinds(performance)).toEqual(
      expect.arrayContaining(['untouched-in-gesture', 'unwritable-level-site']),
    );
  });

  it('refuses a pair whose endpoints would collapse onto one value (D-I)', () => {
    // s = 0 writes the neutral, which for a pair is its own geomean at BOTH endpoints — and
    // `transitionTo === volume` is the renderer's exact-float test for a constant instruction,
    // so the gesture would be deleted rather than attenuated.
    const { root, performance } = exaggerate(
      WITH_END_MARKER,
      { dynamics: 0 },
      { scope: 'gesture' },
    );
    expect(noteKinds(performance)).toContain('pair-collapse-refused');
    expect(textAt(root, 'g1', 'volume')).toBe('60');
    expect(textAt(root, 'g1', 'transition.to')).toBe('90');
  });
});

describe('applyExaggeration — the s === 1 short-circuit (A2)', () => {
  const DOCUMENT = globalDocument(
    '',
    '<dynamicsMap><dynamics id="m1" date="0.0" volume="60.0" transition.to="90"/></dynamicsMap>',
  );

  it('does not walk the dimension, so a respelled value stays respelled', () => {
    // `60.0` parses to 60 and spells back as `60`, so a transform-then-write at s = 1 would
    // change bytes without changing any number. The short-circuit is what stops that.
    const { root, performance } = exaggerate(DOCUMENT, { dynamics: 1 });
    expect(textAt(root, 'm1', 'volume')).toBe('60.0');
    expect(performance.totalWrites).toBe(0);
    expect(performance.dimensions.dynamics.state).toBe('skipped');
    expect(performance.notes.some((note) => note.kind === 'identity-factor')).toBe(true);
  });

  it('reports a missing key as requestedFactor null and an applied factor of 1', () => {
    const { report, performance } = exaggerate(DOCUMENT, { dynamics: 2 });
    expect(performance.dimensions.tempo.requestedFactor).toBeNull();
    expect(report.appliedFactors.tempo).toBe(1);
    expect(report.appliedFactors.dynamics).toBe(2);
  });
});

describe('applyExaggeration — performance selection (A11)', () => {
  const TWO = canonicalBaseline(
    globalDocument(
      '',
      '<dynamicsMap><dynamics id="a" date="0.0" volume="60"/></dynamicsMap>',
      'A',
    ).replace(
      '</performance></mpm>',
      '</performance><performance name="B"><global><header/><dated>' +
        '<dynamicsMap><dynamics id="b" date="0.0" volume="80"/></dynamicsMap>' +
        '</dated></global></performance></mpm>',
    ),
  );

  it('visits every performance by default', () => {
    const { report } = exaggerate(TWO, { dynamics: 2 });
    expect(report.performances.map((performance) => performance.performance.name)).toEqual([
      'A',
      'B',
    ]);
  });

  it('narrows to one performance by name, leaving the other byte-identical', () => {
    const { root, report } = exaggerate(TWO, { dynamics: 2 }, { performance: 'B' });
    expect(report.performances).toHaveLength(1);
    expect(textAt(root, 'a', 'volume')).toBe('60');
    // A single-member population IS its own center, so the transform is the identity there.
    expect(textAt(root, 'b', 'volume')).toBe('80');
  });

  it('narrows by index', () => {
    const { report } = exaggerate(TWO, { dynamics: 2 }, { performance: 0 });
    expect(report.performances[0].performance.name).toBe('A');
  });

  it('produces an empty, zero-write run for a selector that matches nothing', () => {
    const { report } = exaggerate(TWO, { dynamics: 2 }, { performance: 'nonexistent' });
    expect(report.performances).toEqual([]);
    expect(report.totalWrites).toBe(0);
  });
});

describe('applyExaggeration — refusals at level sites (§1.2, A3, A4)', () => {
  // `s = 400` around a center of 100 drives a level of 10 to `100·(0.1)^400`, which underflows
  // to exactly 0 in doubles. Zero is not an extreme velocity — it is off the domain of the log
  // space entirely, and writing it would be the "repair" §1.2 forbids.
  const UNDERFLOW = globalDocument(
    '<dynamicsStyles><styleDef name="D"><dynamicsDef id="dp" name="p" value="10"/>' +
      '</styleDef></dynamicsStyles>',
    '<dynamicsMap><style date="0.0" name.ref="D"/>' +
      '<dynamics id="m1" date="0.0" volume="p"/>' +
      '<dynamics id="m2" date="4.0" volume="10" transition.to="10"/>' +
      '</dynamicsMap>',
  );

  it('refuses a def value and an instruction level that underflow, and writes neither', () => {
    const { root, performance } = exaggerate(
      UNDERFLOW,
      { dynamics: 400 },
      { center: { dynamics: 100 } },
    );
    expect(textAt(root, 'dp', 'value')).toBe('10');
    expect(textAt(root, 'm2', 'volume')).toBe('10');
    expect(performance.totalWrites).toBe(0);
    expect(noteKinds(performance)).toContain('saturation-refused');
    expect(performance.dimensions.dynamics.sitesSkipped).toBeGreaterThan(0);
  });

  it('refuses a gesture pair the same way, atomically', () => {
    const TINY = globalDocument(
      '',
      '<dynamicsMap><dynamics id="g1" date="0.0" volume="1e-300" transition.to="1"/>' +
        '</dynamicsMap>',
    );
    const { root, performance } = exaggerate(TINY, { dynamics: 3 }, { scope: 'gesture' });
    expect(textAt(root, 'g1', 'volume')).toBe('1e-300');
    expect(textAt(root, 'g1', 'transition.to')).toBe('1');
    expect(performance.totalWrites).toBe(0);
  });

  it('leaves a surviving transition target INERT when the population left no center', () => {
    // The prevailing level is a placeholder, so nothing feeds the center — but the target is a
    // perfectly good number. Nothing is wrong with it; it is simply unreachable, which is what
    // `inert` means and `skipped` does not. The placeholder that emptied the population keeps
    // its own skip, so the counters still say what happened.
    const NO_CENTER = globalDocument(
      '',
      '<dynamicsMap><dynamics id="m1" date="0.0" volume="?" transition.to="90"/></dynamicsMap>',
    );
    const { root, performance } = exaggerate(NO_CENTER, { dynamics: 2 });
    expect(textAt(root, 'm1', 'transition.to')).toBe('90');
    expect(performance.centers.dynamics).toBeNull();
    expect(performance.dimensions.dynamics.state).toBe('inert');
    expect(performance.dimensions.dynamics.sitesSkipped).toBe(1);
    expect(performance.dimensions.dynamics.sitesInert).toBe(1);
  });
});

describe('applyExaggeration — gesture scope, the remaining shapes', () => {
  it('reports an explicitly equal pair as the constant instruction the renderer sees', () => {
    const EQUAL_PAIR = globalDocument(
      '',
      '<dynamicsMap><dynamics id="g1" date="0.0" volume="70" transition.to="70"/></dynamicsMap>',
    );
    const { root, performance } = exaggerate(EQUAL_PAIR, { dynamics: 0.5 }, { scope: 'gesture' });
    expect(textAt(root, 'g1', 'volume')).toBe('70');
    expect(performance.dimensions.dynamics.state).toBe('inert');
    expect(noteKinds(performance)).toContain('constant-instruction');
  });

  it('cannot move an end-marker duplicate that resolves through a def, and says so', () => {
    const NAMED_DUPLICATE = globalDocument(
      '<dynamicsStyles><styleDef name="D"><dynamicsDef id="df" name="f" value="90"/>' +
        '</styleDef></dynamicsStyles>',
      '<dynamicsMap><style date="0.0" name.ref="D"/>' +
        '<dynamics id="g1" date="0.0" volume="60" transition.to="90"/>' +
        '<dynamics id="g2" date="4.0" volume="f"/>' +
        '</dynamicsMap>',
    );
    const { root, performance } = exaggerate(
      NAMED_DUPLICATE,
      { dynamics: 0.5 },
      { scope: 'gesture' },
    );
    expect(textAt(root, 'g2', 'volume')).toBe('f');
    expect(numberAt(root, 'df', 'value')).toBe(90);
    expect(noteKinds(performance)).toContain('unwritable-level-site');
  });
});
