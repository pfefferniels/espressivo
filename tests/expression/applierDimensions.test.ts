/**
 * The thirteen non-level dimensions: §7.3, §7.5 through §7.14.
 *
 * One describe per §7 subsection, and every expectation is the section's own arithmetic
 * written out — `1 − (1−x)^s` for a curvature, the joint trim's ratio split for a rubato
 * window — so that a change to a scale space fails here with a number rather than with a
 * tolerance.
 */
import { describe, expect, it } from 'vitest';
import {
  boundaryPowerLow,
  exaggerate,
  globalDocument,
  logAroundOne,
  logit,
  firstNoteOfKind,
  noteKinds,
  notesOfKind,
  numberAt,
  textAt,
} from './applierFixtures.js';

describe('tempoShape — @meanTempoAt (§7.3)', () => {
  const SHAPED = globalDocument(
    '',
    '<tempoMap>' +
      '<tempo id="t1" date="0.0" bpm="120" beatLength="0.25" transition.to="60" meanTempoAt="0.25"/>' +
      '<tempo id="t2" date="4.0" bpm="90" beatLength="0.25" meanTempoAt="0.4"/>' +
      '</tempoMap>',
  );

  it('moves the mean position on a logit over (0,1)', () => {
    const { root } = exaggerate(SHAPED, { tempoShape: 2 });
    // DESIGN §7.3's own worked example: 0.25 at s = 2 gives 0.1.
    expect(numberAt(root, 't1', 'meanTempoAt')).toBe(logit(0.25, 2, 0, 1));
    expect(numberAt(root, 't1', 'meanTempoAt')).toBeCloseTo(0.1, 12);
  });

  it('is inert without @transition.to — there is no transition to reshape', () => {
    const { root, performance } = exaggerate(SHAPED, { tempoShape: 2 });
    expect(textAt(root, 't2', 'meanTempoAt')).toBe('0.4');
    expect(performance.dimensions.tempoShape.sitesInert).toBe(1);
    expect(noteKinds(performance)).toContain('constant-instruction');
  });

  it('refuses a result that saturates onto an exact bound rather than writing the cliff', () => {
    const EXTREME = globalDocument(
      '',
      '<tempoMap><tempo id="t1" date="0.0" bpm="120" beatLength="0.25" ' +
        'transition.to="60" meanTempoAt="0.99"/></tempoMap>',
    );
    const { root, performance } = exaggerate(EXTREME, { tempoShape: 8 });
    expect(textAt(root, 't1', 'meanTempoAt')).toBe('0.99');
    expect(noteKinds(performance)).toContain('saturation-refused');
    expect(performance.dimensions.tempoShape.state).toBe('skipped');
  });

  it('skips an out-of-domain input rather than repairing it (§1.2)', () => {
    const BROKEN = globalDocument(
      '',
      '<tempoMap><tempo id="t1" date="0.0" bpm="120" beatLength="0.25" ' +
        'transition.to="60" meanTempoAt="1.5"/></tempoMap>',
    );
    const { root, performance } = exaggerate(BROKEN, { tempoShape: 2 });
    expect(textAt(root, 't1', 'meanTempoAt')).toBe('1.5');
    expect(noteKinds(performance)).toContain('out-of-domain-input');
  });
});

describe('dynamicsShape — @curvature and @protraction (§7.5)', () => {
  const SWELL = globalDocument(
    '',
    '<dynamicsMap>' +
      '<dynamics id="d1" date="0.0" volume="60" transition.to="90" curvature="0.3" protraction="0.5"/>' +
      '<dynamics id="d2" date="4.0" volume="90" curvature="0.3"/>' +
      '<dynamics id="d3" date="8.0" volume="70" transition.to="70" protraction="0.5"/>' +
      '</dynamicsMap>',
  );

  it('scales curvature by boundary-power and protraction by logit(−1,1)', () => {
    const { root } = exaggerate(SWELL, { dynamicsShape: 2 });
    // §8's dynamicsShape row: an authored 0.3 becomes 0.51 at s = 2.
    expect(numberAt(root, 'd1', 'curvature')).toBe(boundaryPowerLow(0.3, 2));
    expect(numberAt(root, 'd1', 'curvature')).toBeCloseTo(0.51, 12);
    expect(numberAt(root, 'd1', 'protraction')).toBe(logit(0.5, 2, -1, 1));
  });

  it('is inert on a constant instruction, whichever way the document says constant', () => {
    const { root, performance } = exaggerate(SWELL, { dynamicsShape: 2 });
    expect(textAt(root, 'd2', 'curvature')).toBe('0.3');
    expect(textAt(root, 'd3', 'protraction')).toBe('0.5');
    expect(performance.dimensions.dynamicsShape.sitesInert).toBe(2);
  });

  it('treats a def name equal on both endpoints as constant', () => {
    const NAMED = globalDocument(
      '<dynamicsStyles><styleDef name="D"><dynamicsDef name="p" value="48"/></styleDef>' +
        '</dynamicsStyles>',
      '<dynamicsMap><style date="0.0" name.ref="D"/>' +
        '<dynamics id="d1" date="0.0" volume="p" transition.to="p" curvature="0.3"/>' +
        '</dynamicsMap>',
    );
    const { root, performance } = exaggerate(NAMED, { dynamicsShape: 2 });
    expect(textAt(root, 'd1', 'curvature')).toBe('0.3');
    expect(performance.dimensions.dynamicsShape.state).toBe('inert');
  });

  it('leaves the whole dimension absent when the document carries no curve parameters', () => {
    const PLAIN = globalDocument(
      '',
      '<dynamicsMap><dynamics id="d1" date="0.0" volume="60"/></dynamicsMap>',
    );
    const { performance } = exaggerate(PLAIN, { dynamicsShape: 2 });
    expect(performance.dimensions.dynamicsShape.state).toBe('absent');
  });
});

describe('rubato — intensity and the joint trim (§7.6, RESOLVED-2, A6)', () => {
  // `r` is fully inherited by one element and PARTIALLY overridden by another; `q` carries no
  // window at all. The partial override is what A6 excludes both sites for.
  const RUBATO = globalDocument(
    '<rubatoStyles><styleDef name="S">' +
      '<rubatoDef id="defR" name="r" frameLength="720" intensity="1.5" lateStart="0.1" earlyEnd="0.9"/>' +
      '<rubatoDef id="defQ" name="q" frameLength="720" intensity="2.0"/>' +
      '</styleDef></rubatoStyles>',
    '<rubatoMap><style date="0.0" name.ref="S"/>' +
      '<rubato id="r1" date="0.0" name.ref="r" lateStart="0.85"/>' +
      '<rubato id="r2" date="4.0" name.ref="q" intensity="1.2" lateStart="0.4" earlyEnd="0.6"/>' +
      '</rubatoMap>',
  );

  it('scales every intensity it finds, on the def and on the element alike', () => {
    const { root } = exaggerate(RUBATO, { rubato: 2 });
    expect(numberAt(root, 'defR', 'intensity')).toBe(logAroundOne(1.5, 2));
    expect(numberAt(root, 'defQ', 'intensity')).toBe(logAroundOne(2, 2));
    expect(numberAt(root, 'r2', 'intensity')).toBe(logAroundOne(1.2, 2));
  });

  it('transforms a self-contained window through its total trim, split on the kept ratio', () => {
    const { root } = exaggerate(RUBATO, { rubato: 2 });
    const head = 0.4;
    const tail = 1 - 0.6;
    const total = head + tail;
    const trimmed = 1 - Math.pow(1 - total, 2);
    expect(numberAt(root, 'r2', 'lateStart')).toBe(trimmed * (head / total));
    expect(numberAt(root, 'r2', 'earlyEnd')).toBe(1 - trimmed * (tail / total));
  });

  it('excludes BOTH sites of a cross-site window and names the element', () => {
    const { root, performance } = exaggerate(RUBATO, { rubato: 2 });
    expect(textAt(root, 'r1', 'lateStart')).toBe('0.85');
    expect(textAt(root, 'defR', 'lateStart')).toBe('0.1');
    expect(textAt(root, 'defR', 'earlyEnd')).toBe('0.9');
    expect(notesOfKind(performance, 'cross-site-rubato-window')).toHaveLength(1);
    expect(firstNoteOfKind(performance, 'cross-site-rubato-window').attribute).toBe('lateStart');
  });

  it('never touches @frameLength, which has no neutral (§7.16)', () => {
    const { root } = exaggerate(RUBATO, { rubato: 2 });
    expect(textAt(root, 'defR', 'frameLength')).toBe('720');
  });

  it('transforms a def window that no element partially overrides', () => {
    const INHERITED = globalDocument(
      '<rubatoStyles><styleDef name="S">' +
        '<rubatoDef id="d" name="r" intensity="1.0" lateStart="0.2" earlyEnd="0.8"/>' +
        '</styleDef></rubatoStyles>',
      '<rubatoMap><style date="0.0" name.ref="S"/>' +
        '<rubato id="r1" date="0.0" name.ref="r"/></rubatoMap>',
    );
    const { root } = exaggerate(INHERITED, { rubato: 2 });
    const head = 0.2;
    const tail = 1 - 0.8;
    const total = head + tail;
    const trimmed = 1 - Math.pow(1 - total, 2);
    expect(numberAt(root, 'd', 'lateStart')).toBe(trimmed * (head / total));
    expect(numberAt(root, 'd', 'earlyEnd')).toBe(1 - trimmed * (tail / total));
  });

  it('reports §8’s per-document guard bound', () => {
    const { performance } = exaggerate(RUBATO, { rubato: 2 });
    // The only trimmed site is r2, whose total trim is 0.8.
    expect(performance.bounds.rubatoMaxS).toBe(Math.log(1e-6) / Math.log(1 - 0.8));
  });

  it('saturates smoothly rather than crossing, at an s that would cross without the guard', () => {
    // Without A6's clamp, s = 16 on a (.45,.55) window makes lateStart >= earlyEnd, which both
    // renderer paths answer by resetting the window to (0,1) — no rubato at all.
    const TIGHT = globalDocument(
      '',
      '<rubatoMap><rubato id="r1" date="0.0" lateStart="0.45" earlyEnd="0.55"/></rubatoMap>',
    );
    const { root } = exaggerate(TIGHT, { rubato: 16 });
    const lateStart = numberAt(root, 'r1', 'lateStart');
    const earlyEnd = numberAt(root, 'r1', 'earlyEnd');
    // The guard clamps the TOTAL trim to `1 − minRubatoWindow`; the two bounds are then
    // rounded independently off that total, so the surviving window is `minRubatoWindow` to
    // within a few ULP rather than exactly. What is exact is the ordering — the property the
    // renderer's inclusive `lateStart >= earlyEnd` reset turns on.
    expect(lateStart).toBeLessThan(earlyEnd);
    expect(earlyEnd - lateStart).toBeCloseTo(1e-6, 12);
  });

  it('skips a window the gate rejects instead of repairing it', () => {
    const BROKEN = globalDocument(
      '',
      '<rubatoMap><rubato id="r1" date="0.0" lateStart="0.9" earlyEnd="0.4"/></rubatoMap>',
    );
    const { root, performance } = exaggerate(BROKEN, { rubato: 2 });
    expect(textAt(root, 'r1', 'lateStart')).toBe('0.9');
    expect(noteKinds(performance)).toContain('out-of-domain-input');
  });
});

describe('articulation — the seven live modifiers (§7.7, D-B)', () => {
  const ARTICULATION = globalDocument(
    '<articulationStyles><styleDef name="A">' +
      '<articulationDef id="stacc" name="stacc" absoluteDurationMs="160" absoluteVelocityChange="-5"/>' +
      '<articulationDef id="ten" name="ten" relativeDuration="0.9" relativeVelocity="1.1" ' +
      'absoluteVelocityChange="12"/>' +
      '</styleDef></articulationStyles>',
    '<articulationMap><style date="0.0" name.ref="A"/>' +
      '<articulation id="a1" date="0.0" relativeDuration="0.8" absoluteDurationChange="-100"/>' +
      '<articulation id="a2" date="1.0" relativeDuration="0.8" absoluteDelayMs="-30"/>' +
      '</articulationMap>',
  );

  it('scales ratios in log space and offsets as gains', () => {
    const { root } = exaggerate(ARTICULATION, { articulation: 2 });
    expect(numberAt(root, 'ten', 'relativeDuration')).toBe(logAroundOne(0.9, 2));
    expect(numberAt(root, 'ten', 'relativeVelocity')).toBe(logAroundOne(1.1, 2));
    expect(numberAt(root, 'ten', 'absoluteVelocityChange')).toBe(24);
    expect(numberAt(root, 'a2', 'absoluteDelayMs')).toBe(-60);
  });

  it('reports the unreachable component of a lopsided site, and leaves it alone', () => {
    const { root, performance } = exaggerate(ARTICULATION, { articulation: 2 });
    expect(textAt(root, 'stacc', 'absoluteDurationMs')).toBe('160');
    expect(numberAt(root, 'stacc', 'absoluteVelocityChange')).toBe(-10);
    expect(firstNoteOfKind(performance, 'articulation-component-excluded').attribute).toBe(
      'absoluteDurationMs',
    );
    // F8: this document ALSO holds fully-reachable sites, and §4-as-amended orders
    // `transformed > partial`, so the dimension as a whole reads `transformed`. The
    // partial-only case is pinned separately.
    expect(performance.dimensions.articulation.state).toBe('transformed');
  });

  it('honours inline duration precedence: the loser is inert, not written', () => {
    const { root, performance } = exaggerate(ARTICULATION, { articulation: 2 });
    expect(textAt(root, 'a1', 'relativeDuration')).toBe('0.8');
    expect(numberAt(root, 'a1', 'absoluteDurationChange')).toBe(-200);
    expect(noteKinds(performance)).toContain('inline-duration-precedence');
    // The same attribute on a def COMPOSES rather than losing, so it is written there.
    expect(numberAt(root, 'a2', 'relativeDuration')).toBe(logAroundOne(0.8, 2));
  });

  it('discloses the non-monotone affine velocity pair where a site carries both halves', () => {
    const { performance } = exaggerate(ARTICULATION, { articulation: 2 });
    expect(noteKinds(performance)).toContain('articulation-affine-velocity-pair');
  });

  it('scales @absoluteDelay and @absoluteDurationChangeMs on the INLINE element too', () => {
    // §7.7 keys composition on the element, so def and inline are separate sites for every
    // row. These two are the pair the rest of the suite writes only on a `<articulationDef>`;
    // neither is in the inline duration-precedence chain, so both simply scale as gains.
    const INLINE = globalDocument(
      '',
      '<articulationMap>' +
        '<articulation id="i1" date="0.0" absoluteDelay="-120" absoluteDurationChangeMs="-45"/>' +
        '</articulationMap>',
    );
    const { root, performance } = exaggerate(INLINE, { articulation: 2 });
    expect(numberAt(root, 'i1', 'absoluteDelay')).toBe(-240);
    expect(numberAt(root, 'i1', 'absoluteDurationChangeMs')).toBe(-90);
    expect(performance.dimensions.articulation.writes).toBe(2);
    expect(noteKinds(performance)).not.toContain('inline-duration-precedence');
  });

  it('reports R6(b) coefficients rather than clamping the velocity', () => {
    const { performance } = exaggerate(ARTICULATION, { articulation: 2 });
    expect(performance.dimensions.articulation.velocityCoefficients).toEqual({
      multiplicative: Math.abs(logAroundOne(1.1, 2) - 1),
      additive: 24,
    });
  });
});

describe('accentuation — the single site (§7.8, D-C)', () => {
  const PATTERN = globalDocument(
    '<metricalAccentuationStyles><styleDef name="M">' +
      '<accentuationPatternDef id="def" name="p4" length="4">' +
      '<accentuation beat="1" value="20"/>' +
      '<accentuation beat="3" value="-10" transition.to="5"/>' +
      '</accentuationPatternDef></styleDef></metricalAccentuationStyles>',
    '<metricalAccentuationMap><style date="0.0" name.ref="M"/>' +
      '<accentuationPattern id="p1" date="0.0" name.ref="p4" scale="1.0"/>' +
      '</metricalAccentuationMap>',
  );

  it('writes "0" for s = 0 and never deletes the mandatory attribute', () => {
    const { root } = exaggerate(PATTERN, { accentuation: 0 });
    expect(textAt(root, 'p1', 'scale')).toBe('0');
  });

  it('scales as a gain', () => {
    const { root } = exaggerate(PATTERN, { accentuation: 2.5 });
    expect(numberAt(root, 'p1', 'scale')).toBe(2.5);
  });

  it('leaves the degree-1 def triple alone, so no factor is ever applied twice', () => {
    const { root, xml } = exaggerate(PATTERN, { accentuation: 2.5 });
    expect(textAt(root, 'def', 'length')).toBe('4');
    expect(xml).toContain('value="20"');
    expect(xml).toContain('transition.to="5"');
  });

  it('estimates velocity from the def’s own anchors and flags the beats as unverifiable', () => {
    const { performance } = exaggerate(PATTERN, { accentuation: 2.5 });
    // The largest declared amplitude is 20; the fallback is |scale'| × that (A10).
    expect(performance.dimensions.accentuation.velocityCoefficients).toEqual({
      multiplicative: 0,
      additive: 50,
    });
    expect(performance.estimates.beatsUnverifiable).toBe(true);
    expect(noteKinds(performance)).toContain('accentuation-beats-unverifiable');
  });
});

describe('ornamentation — spread, spacing and gradient (§7.9–§7.11)', () => {
  const ORNAMENTS = globalDocument(
    '<ornamentationStyles><styleDef name="O">' +
      '<ornamentDef name="arp">' +
      '<temporalSpread id="spread" frame.start="-22" frameLength="44" intensity="2.0"/>' +
      '<dynamicsGradient id="grad" transition.from="-1" transition.to="1"/>' +
      '</ornamentDef>' +
      '<ornamentDef name="dead"><dynamicsGradient id="dead" transition.from="5"/></ornamentDef>' +
      '</styleDef></ornamentationStyles>',
    '<ornamentationMap><style date="0.0" name.ref="O"/>' +
      '<ornament id="o1" date="0.0" name.ref="arp" scale="2"/>' +
      '<ornament id="o2" date="1.0" name.ref="dead"/>' +
      '</ornamentationMap>',
  );

  it('scales the frame as one geometric pair under one factor (§7.9)', () => {
    const { root } = exaggerate(ORNAMENTS, { ornamentSpread: 2 });
    expect(numberAt(root, 'spread', 'frame.start')).toBe(-44);
    expect(numberAt(root, 'spread', 'frameLength')).toBe(88);
  });

  it('scales the spacing exponent independently (§7.10)', () => {
    const { root } = exaggerate(ORNAMENTS, { ornamentSpacing: 2, ornamentSpread: 2 });
    expect(numberAt(root, 'spread', 'intensity')).toBe(logAroundOne(2, 2));
  });

  it('scales gradient endpoints as gains and reports leaving the nominal range (§7.11)', () => {
    const { root, performance } = exaggerate(ORNAMENTS, { ornamentDynamics: 3 });
    expect(numberAt(root, 'grad', 'transition.from')).toBe(-3);
    expect(numberAt(root, 'grad', 'transition.to')).toBe(3);
    expect(noteKinds(performance)).toContain('gradient-outside-nominal-range');
  });

  it('reports a gradient inert, and writes nothing, when every @scale is absent or zero', () => {
    const { root, performance } = exaggerate(ORNAMENTS, { ornamentDynamics: 3 });
    expect(textAt(root, 'dead', 'transition.from')).toBe('5');
    expect(noteKinds(performance)).toContain('ornament-scale-zero');
    expect(performance.dimensions.ornamentDynamics.sitesInert).toBe(1);
  });

  it('never materializes an absent @transition.to, and says so', () => {
    const { root, performance } = exaggerate(ORNAMENTS, { ornamentDynamics: 3 });
    expect(textAt(root, 'dead', 'transition.to')).toBeNull();
    expect(noteKinds(performance)).toContain('transition-to-absent');
  });

  it('reports the R6(b) additive contribution as the endpoint magnitude times @scale', () => {
    const { performance } = exaggerate(ORNAMENTS, { ornamentDynamics: 3 });
    expect(performance.dimensions.ornamentDynamics.velocityCoefficients).toEqual({
      multiplicative: 0,
      additive: 6,
    });
  });
});

describe('ornamentation v3 — the TemporalValue frame (§7.15)', () => {
  /** A `<temporalSpread>` with the given attributes, referenced by a live `<ornament>`. */
  function withSpread(attributes: string, ornamentAttributes = 'scale="1"'): string {
    return globalDocument(
      '<ornamentationStyles><styleDef name="O"><ornamentDef name="trill">' +
        `<temporalSpread id="spread" ${attributes}/>` +
        '</ornamentDef></styleDef></ornamentationStyles>',
      '<ornamentationMap><style date="0.0" name.ref="O"/>' +
        `<ornament id="o1" date="0.0" name.ref="trill" ${ornamentAttributes}/>` +
        '</ornamentationMap>',
    );
  }

  describe('the frame is still one geometric pair, and the unit spelling survives it', () => {
    it.each([
      [
        'both bounds in ticks',
        'frame.offset="-22.0ticks" frameLength="44ticks"',
        '-44ticks',
        '88ticks',
      ],
      ['two clocks in one frame', 'frame.offset="22ms" frameLength="90%"', '44ms', '180%'],
      [
        'suffix-less, which is what the sample corpus writes',
        'frame.offset="-22.0" frameLength="44"',
        '-44',
        '88',
      ],
      ['the legacy alias under a v3 marker', 'frame.start="-22.0" frameLength="44%"', '-44', '88%'],
      [
        'a fractional millisecond value',
        'frame.offset="20.5ms" frameLength="10.5ms"',
        '41ms',
        '21ms',
      ],
    ])('%s', (_label, attributes, offset, length) => {
      const { root } = exaggerate(withSpread(attributes), { ornamentSpread: 2 });
      const offsetAttribute = attributes.includes('frame.offset') ? 'frame.offset' : 'frame.start';
      expect(textAt(root, 'spread', offsetAttribute)).toBe(offset);
      expect(textAt(root, 'spread', 'frameLength')).toBe(length);
    });

    it('scales a percentage by a fractional factor without touching its unit', () => {
      const { root } = exaggerate(withSpread('frame.offset="0%" frameLength="80%"'), {
        ornamentSpread: 1.5,
      });
      expect(textAt(root, 'spread', 'frameLength')).toBe('120%');
      // 0 is the gain neutral, so the offset is numerically unchanged — and therefore not
      // rewritten at all, spelling included.
      expect(textAt(root, 'spread', 'frame.offset')).toBe('0%');
    });

    it('carries a negative offset through to zero at s = 0 without an IEEE minus sign', () => {
      const { root } = exaggerate(withSpread('frame.offset="-22.0ms" frameLength="44ms"'), {
        ornamentSpread: 0,
      });
      expect(textAt(root, 'spread', 'frame.offset')).toBe('0ms');
      expect(textAt(root, 'spread', 'frameLength')).toBe('0ms');
    });

    it('keeps a negative offset negative, and the frame’s geometry, as s grows', () => {
      const { root } = exaggerate(withSpread('frame.offset="-22.0ticks" frameLength="44ticks"'), {
        ornamentSpread: 3,
      });
      expect(textAt(root, 'spread', 'frame.offset')).toBe('-66ticks');
      expect(textAt(root, 'spread', 'frameLength')).toBe('132ticks');
    });

    it('writes nothing at all at s = 1, in v3 spelling as in v2', () => {
      const { root, report } = exaggerate(withSpread('frame.offset="-22.0ms" frameLength="80%"'), {
        ornamentSpread: 1,
      });
      expect(report.totalWrites).toBe(0);
      expect(textAt(root, 'spread', 'frame.offset')).toBe('-22.0ms');
      expect(textAt(root, 'spread', 'frameLength')).toBe('80%');
    });
  });

  describe('what the v3 frame refuses, and why', () => {
    it('refuses the whole pair when @frameLength is absent — v3’s default is 100%, not 0', () => {
      const { root, performance } = exaggerate(withSpread('frame.offset="-22.0ticks"'), {
        ornamentSpread: 2,
      });
      expect(textAt(root, 'spread', 'frame.offset')).toBe('-22.0ticks');
      expect(performance.dimensions.ornamentSpread.sitesSkipped).toBe(1);
      expect(firstNoteOfKind(performance, 'atomic-group-skipped').detail).toContain('100%');
    });

    it('does NOT refuse an absent offset, whose v3 default 0.0ticks IS the neutral', () => {
      const { root, performance } = exaggerate(withSpread('frameLength="44%"'), {
        ornamentSpread: 2,
      });
      expect(textAt(root, 'spread', 'frameLength')).toBe('88%');
      expect(performance.dimensions.ornamentSpread.sitesSkipped).toBe(0);
    });

    it('refuses a value the v3 grammar rejects rather than sliding it onto parseFloat', () => {
      // parseFloat("80abc") is 80, so the v2 path would have written a well-formed "160".
      const { root, performance } = exaggerate(
        withSpread('frame.offset="0ticks" frameLength="80abc"'),
        { ornamentSpread: 2 },
      );
      expect(textAt(root, 'spread', 'frameLength')).toBe('80abc');
      expect(textAt(root, 'spread', 'frame.offset')).toBe('0ticks');
      expect(firstNoteOfKind(performance, 'atomic-group-skipped').detail).toContain(
        'no MPM v3 temporal value',
      );
    });

    it('refuses a negative @frameLength in v3 for the same reason as in v2', () => {
      // The v3 regex admits the sign, and the v3 reader clamps it to 0 exactly as the v2
      // setter does — so the engine refuses rather than repairing, in both generations.
      const { root, performance } = exaggerate(
        withSpread('frame.offset="0ticks" frameLength="-10ticks"'),
        { ornamentSpread: 2 },
      );
      expect(textAt(root, 'spread', 'frameLength')).toBe('-10ticks');
      expect(performance.dimensions.ornamentSpread.sitesSkipped).toBe(1);
    });

    it('leaves a shadowed @frame.start exactly as found, and says why', () => {
      const { root, performance } = exaggerate(
        withSpread('frame.offset="-22.0ticks" frame.start="-11.0" frameLength="44ticks"'),
        { ornamentSpread: 2 },
      );
      expect(textAt(root, 'spread', 'frame.offset')).toBe('-44ticks');
      expect(textAt(root, 'spread', 'frame.start')).toBe('-11.0');
      expect(firstNoteOfKind(performance, 'frame-alias-shadowed').attribute).toBe('frame.start');
    });
  });

  describe('the report’s unit note', () => {
    it('names each value’s own domain on a v3 spread', () => {
      const { performance } = exaggerate(withSpread('frame.offset="22ms" frameLength="90%"'), {
        ornamentSpread: 2,
      });
      const note = firstNoteOfKind(performance, 'frame-time-unit');
      expect(note.detail).toContain('@frame.offset = milliseconds');
      expect(note.detail).toContain('@frameLength = relative');
      expect(note.attribute).toBe('frame.offset');
    });

    it('names where a suffix-less value’s domain came from', () => {
      const { performance } = exaggerate(
        withSpread('frame.offset="22" frameLength="90" time.unit="milliseconds"'),
        { ornamentSpread: 2 },
      );
      const note = firstNoteOfKind(performance, 'frame-time-unit');
      expect(note.detail).toContain('@frame.offset = milliseconds (no suffix, so the legacy');
      expect(note.detail).toContain('@frameLength = milliseconds');
    });

    it('falls back to ticks, and says so, with neither suffix nor @time.unit', () => {
      const { performance } = exaggerate(withSpread('frame.offset="22" frameLength="90"'), {
        ornamentSpread: 2,
      });
      expect(firstNoteOfKind(performance, 'frame-time-unit').detail).toContain(
        'no suffix and no @time.unit, so the ticks default',
      );
    });

    it('keeps the v2 enum wording for a v2 spread', () => {
      const { performance } = exaggerate(
        withSpread('frame.start="-22" frameLength="44" time.unit="milliseconds"'),
        { ornamentSpread: 2 },
      );
      const note = firstNoteOfKind(performance, 'frame-time-unit');
      expect(note.detail).toContain('@time.unit = "milliseconds"');
      expect(note.attribute).toBe('time.unit');
    });
  });

  describe('the two dimensions v3 did not change', () => {
    it('scales @intensity on a v3 spread exactly as on a v2 one (§7.10 restated)', () => {
      // Verified in the code: TemporalSpread reads @intensity with the same parseFloat outside
      // its v2/v3 branch, so it never carries a unit suffix in either generation.
      const V3 = withSpread('frame.offset="-22.0ticks" frameLength="44ticks" intensity="2.0"');
      const V2 = withSpread('frame.start="-22.0" frameLength="44" intensity="2.0"');
      const v3Intensity = numberAt(
        exaggerate(V3, { ornamentSpacing: 2 }).root,
        'spread',
        'intensity',
      );
      expect(v3Intensity).toBe(logAroundOne(2, 2));
      expect(numberAt(exaggerate(V2, { ornamentSpacing: 2 }).root, 'spread', 'intensity')).toBe(
        v3Intensity,
      );
    });

    it('reads @noteoff.shift the same way in both generations', () => {
      const { performance } = exaggerate(
        withSpread('frame.offset="0ticks" frameLength="44ticks" noteoff.shift="monophonic"'),
        { ornamentSpread: 2 },
      );
      expect(firstNoteOfKind(performance, 'frame-noteoff-shift').detail).toContain('LENGTHENS');
    });

    it('scales gradient endpoints on a v3 document with no v3 branch of its own (§7.11)', () => {
      // DynamicsGradient has no v3 reading at all — same attributes, same parseFloat, same
      // absent-@transition.to default — so the v2 rows govern both generations unchanged.
      const V3_GRADIENT = globalDocument(
        '<ornamentationStyles><styleDef name="O"><ornamentDef name="trill">' +
          '<temporalSpread frame.offset="0ticks" frameLength="50%"/>' +
          '<dynamicsGradient id="grad" transition.from="-0.5" transition.to="0.5"/>' +
          '</ornamentDef></styleDef></ornamentationStyles>',
        '<ornamentationMap><style date="0.0" name.ref="O"/>' +
          '<ornament id="o1" date="0.0" name.ref="trill" scale="1"/></ornamentationMap>',
      );
      const { root } = exaggerate(V3_GRADIENT, { ornamentDynamics: 2 });
      expect(numberAt(root, 'grad', 'transition.from')).toBe(-1);
      expect(numberAt(root, 'grad', 'transition.to')).toBe(1);
    });

    it('keeps @scale absent≙0 in v3 too — what changed is that the v3 WRITER always emits it', () => {
      const gradient = (ornamentAttributes: string): string =>
        globalDocument(
          '<ornamentationStyles><styleDef name="O"><ornamentDef name="trill">' +
            '<temporalSpread frame.offset="0ticks" frameLength="50%"/>' +
            '<dynamicsGradient id="grad" transition.from="0.5" transition.to="0.5"/>' +
            '</ornamentDef></styleDef></ornamentationStyles>',
          '<ornamentationMap><style date="0.0" name.ref="O"/>' +
            `<ornament id="o1" date="0.0" name.ref="trill" ${ornamentAttributes}/>` +
            '</ornamentationMap>',
        );
      // An explicit 0 — the v3 writer's default — is as dead as an absent one.
      const zero = exaggerate(gradient('scale="0"'), { ornamentDynamics: 2 });
      expect(zero.performance.dimensions.ornamentDynamics.sitesInert).toBe(1);
      expect(textAt(zero.root, 'grad', 'transition.from')).toBe('0.5');
      // And the case that makes the dimension live at all in a v3 corpus.
      const live = exaggerate(gradient('scale="1"'), { ornamentDynamics: 2 });
      expect(live.performance.dimensions.ornamentDynamics.sitesInert).toBe(0);
      expect(numberAt(live.root, 'grad', 'transition.from')).toBe(1);
    });
  });

  it('reads each <temporalSpread> in its own generation within one performance', () => {
    const MIXED = globalDocument(
      '<ornamentationStyles><styleDef name="O">' +
        '<ornamentDef name="old"><temporalSpread id="v2" frame.start="-22.0" frameLength="44" ' +
        'time.unit="milliseconds" intensity="2.0"/></ornamentDef>' +
        '<ornamentDef name="new"><temporalSpread id="v3" frame.offset="-22.0ms" ' +
        'frameLength="80%" intensity="2.0"/></ornamentDef>' +
        '</styleDef></ornamentationStyles>',
      '<ornamentationMap><style date="0.0" name.ref="O"/>' +
        '<ornament id="o1" date="0.0" name.ref="old" scale="1"/>' +
        '<ornament id="o2" date="1.0" name.ref="new" scale="1"/>' +
        '</ornamentationMap>',
    );
    const { root, performance } = exaggerate(MIXED, { ornamentSpread: 2, ornamentSpacing: 2 });
    // The v2 spread keeps its bare doubles; the v3 one keeps both of its units.
    expect(textAt(root, 'v2', 'frame.start')).toBe('-44');
    expect(textAt(root, 'v2', 'frameLength')).toBe('88');
    expect(textAt(root, 'v3', 'frame.offset')).toBe('-44ms');
    expect(textAt(root, 'v3', 'frameLength')).toBe('160%');
    // One shared dimension, two sites, both transformed.
    expect(performance.dimensions.ornamentSpread.sitesTransformed).toBe(2);
    expect(performance.dimensions.ornamentSpread.sitesSkipped).toBe(0);
    // And one unit note per generation, each in its own wording.
    const units = notesOfKind(performance, 'frame-time-unit').map((note) => note.detail);
    expect(units[0]).toContain('@time.unit = "milliseconds"');
    expect(units[1]).toContain('v3 per-value units');
  });
});

describe('asynchrony — @milliseconds.offset (§7.12)', () => {
  it('scales exactly linearly', () => {
    const OFFSETS = globalDocument(
      '',
      '<asynchronyMap><asynchrony id="a1" date="0.0" milliseconds.offset="-20"/>' +
        '<asynchrony id="a2" date="4.0" milliseconds.offset="50"/></asynchronyMap>',
    );
    const { root } = exaggerate(OFFSETS, { asynchrony: 3 });
    expect(numberAt(root, 'a1', 'milliseconds.offset')).toBe(-60);
    expect(numberAt(root, 'a2', 'milliseconds.offset')).toBe(150);
  });
});

describe('imprecision — atomic per-distribution groups (§7.13, D-F, RESOLVED-7)', () => {
  const IMPRECISION = globalDocument(
    '',
    '<imprecisionMap.timing>' +
      '<distribution.uniform id="u" date="0.0" limit.lower="-10" limit.upper="10"/>' +
      '<distribution.gaussian id="g" date="4.0" deviation.standard="5" limit.lower="-15" ' +
      'limit.upper="15" milliseconds.timingBasis="100"/>' +
      '<distribution.list id="l" date="8.0"><measurement id="m1" value="3"/>' +
      '<measurement id="m2" value="-4"/></distribution.list>' +
      '</imprecisionMap.timing>' +
      '<imprecisionMap.dynamics>' +
      '<distribution.triangular id="t" date="0.0" limit.lower="-8" limit.upper="8" mode="0" ' +
      'clip.lower="-6" clip.upper="6"/>' +
      '</imprecisionMap.dynamics>' +
      '<imprecisionMap.tuning>' +
      '<distribution.uniform id="tune" date="0.0" limit.lower="-1" limit.upper="1"/>' +
      '</imprecisionMap.tuning>',
  );

  it('scales every width-like attribute of a distribution together', () => {
    const { root } = exaggerate(IMPRECISION, { imprecisionTiming: 2 });
    expect(numberAt(root, 'u', 'limit.lower')).toBe(-20);
    expect(numberAt(root, 'u', 'limit.upper')).toBe(20);
    expect(numberAt(root, 'g', 'deviation.standard')).toBe(10);
    expect(numberAt(root, 'g', 'limit.lower')).toBe(-30);
    expect(numberAt(root, 'g', 'limit.upper')).toBe(30);
  });

  it('scales a measurement list as one group on its children', () => {
    const { root } = exaggerate(IMPRECISION, { imprecisionTiming: 2 });
    expect(numberAt(root, 'm1', 'value')).toBe(6);
    expect(numberAt(root, 'm2', 'value')).toBe(-8);
  });

  it('keeps the three domains independent', () => {
    const { root } = exaggerate(IMPRECISION, { imprecisionDynamics: 3 });
    expect(textAt(root, 'u', 'limit.upper')).toBe('10');
    expect(numberAt(root, 't', 'limit.upper')).toBe(24);
    expect(numberAt(root, 't', 'clip.upper')).toBe(18);
    expect(numberAt(root, 't', 'mode')).toBe(0);
  });

  it('never writes a clip that scaled to 0 away — an absent clip is a silent no-op', () => {
    const { root } = exaggerate(IMPRECISION, { imprecisionDynamics: 0 });
    expect(textAt(root, 't', 'clip.lower')).toBe('0');
    expect(textAt(root, 't', 'clip.upper')).toBe('0');
  });

  it('flags a timing distribution whose sampling basis is derived from the scaled attributes', () => {
    const { performance } = exaggerate(IMPRECISION, { imprecisionTiming: 2 });
    const flagged = notesOfKind(performance, 'derived-timing-basis');
    // The uniform and the list lack `@milliseconds.timingBasis`; the gaussian declares one.
    expect(flagged).toHaveLength(2);
  });

  it('reports the tuning domain inert and leaves it byte-identical', () => {
    const { root, performance } = exaggerate(IMPRECISION, {
      imprecisionTiming: 2,
      imprecisionDynamics: 2,
      imprecisionDuration: 2,
    });
    expect(textAt(root, 'tune', 'limit.upper')).toBe('1');
    expect(noteKinds(performance)).toContain('tuning-domain-inert');
  });

  it('skips the WHOLE distribution when one attribute of its group fails the gate', () => {
    const BROKEN = globalDocument(
      '',
      '<imprecisionMap.timing><distribution.uniform id="u" date="0.0" limit.lower="-10" ' +
        'limit.upper="wide"/></imprecisionMap.timing>',
    );
    const { root, performance } = exaggerate(BROKEN, { imprecisionTiming: 2 });
    expect(textAt(root, 'u', 'limit.lower')).toBe('-10');
    expect(textAt(root, 'u', 'limit.upper')).toBe('wide');
    expect(noteKinds(performance)).toContain('atomic-group-skipped');
    expect(performance.totalWrites).toBe(0);
  });

  it('reports imprecisionDynamics as an R6(b) dimension', () => {
    const { performance } = exaggerate(IMPRECISION, { imprecisionDynamics: 3 });
    expect(performance.dimensions.imprecisionDynamics.velocityCoefficients).toEqual({
      multiplicative: 0,
      additive: 24,
    });
    expect(performance.dimensions.imprecisionTiming.velocityCoefficients).toBeNull();
  });
});

describe('imprecision — the two correlated families (§7.13, D-F)', () => {
  // The other four distributions appear in the corpus or in the block above; these two appear
  // in neither, so their 21 registry rows (3 + 4 attributes × 3 domains) had no behavioural
  // pin at all until this block. Both families are declared in all three maps, so every row
  // is written here.
  const CORRELATED_GROUP =
    '<distribution.correlated.brownianNoise id="%bn%" date="0.0" stepWidth.max="3.0" ' +
    'limit.lower="-10.0" limit.upper="10.0"/>' +
    '<distribution.correlated.compensatingTriangle id="%ct%" date="4.0" limit.lower="-8" ' +
    'limit.upper="8" clip.lower="-6" clip.upper="6" degreeOfCorrelation="0.7"/>';

  const inDomain = (suffix: string) =>
    CORRELATED_GROUP.replaceAll('%bn%', `bn-${suffix}`).replaceAll('%ct%', `ct-${suffix}`);

  const CORRELATED = globalDocument(
    '',
    `<imprecisionMap.timing>${inDomain('t')}</imprecisionMap.timing>` +
      `<imprecisionMap.dynamics>${inDomain('d')}</imprecisionMap.dynamics>` +
      `<imprecisionMap.toneduration>${inDomain('n')}</imprecisionMap.toneduration>`,
  );

  it('scales brownianNoise’s step width and both walls as one atomic triple', () => {
    const { root, performance } = exaggerate(CORRELATED, { imprecisionTiming: 2 });
    // The step alone would raise the wall-rejection rate and desynchronize the sequence.
    expect(numberAt(root, 'bn-t', 'stepWidth.max')).toBe(6);
    expect(numberAt(root, 'bn-t', 'limit.lower')).toBe(-20);
    expect(numberAt(root, 'bn-t', 'limit.upper')).toBe(20);
    expect(performance.dimensions.imprecisionTiming.writes).toBe(3 + 4);
  });

  it('scales compensatingTriangle’s walls and clips, and leaves @degreeOfCorrelation put', () => {
    const { root } = exaggerate(CORRELATED, { imprecisionDynamics: 2 });
    expect(numberAt(root, 'ct-d', 'limit.lower')).toBe(-16);
    expect(numberAt(root, 'ct-d', 'limit.upper')).toBe(16);
    expect(numberAt(root, 'ct-d', 'clip.lower')).toBe(-12);
    expect(numberAt(root, 'ct-d', 'clip.upper')).toBe(12);
    // A shape parameter whose neutral is 1.0, excluded from the group: scaling it would
    // change how strongly consecutive values compensate, which is not a width.
    expect(textAt(root, 'ct-d', 'degreeOfCorrelation')).toBe('0.7');
  });

  it('writes both families in all three domains, and keeps the domains independent', () => {
    const { root, performance } = exaggerate(CORRELATED, {
      imprecisionTiming: 2,
      imprecisionDynamics: 2,
      imprecisionDuration: 2,
    });
    for (const suffix of ['t', 'd', 'n']) {
      expect(numberAt(root, `bn-${suffix}`, 'stepWidth.max')).toBe(6);
      expect(numberAt(root, `ct-${suffix}`, 'clip.upper')).toBe(12);
    }
    // 3 + 4 attributes per domain, three domains: the 21 rows, all written.
    expect(performance.totalWrites).toBe(21);

    const { root: onlyDuration } = exaggerate(CORRELATED, { imprecisionDuration: 2 });
    expect(textAt(onlyDuration, 'bn-t', 'stepWidth.max')).toBe('3.0');
    expect(textAt(onlyDuration, 'bn-d', 'stepWidth.max')).toBe('3.0');
    expect(numberAt(onlyDuration, 'bn-n', 'stepWidth.max')).toBe(6);
  });

  it('skips a correlated group whole when one of its attributes fails the gate', () => {
    const BROKEN = globalDocument(
      '',
      '<imprecisionMap.timing><distribution.correlated.brownianNoise id="bn" date="0.0" ' +
        'stepWidth.max="3.0" limit.lower="-10.0" limit.upper="wide"/></imprecisionMap.timing>',
    );
    const { root, performance } = exaggerate(BROKEN, { imprecisionTiming: 2 });
    expect(textAt(root, 'bn', 'stepWidth.max')).toBe('3.0');
    expect(noteKinds(performance)).toContain('atomic-group-skipped');
    expect(performance.totalWrites).toBe(0);
  });
});

describe('pedalShape — the movement curve (§7.14, D-G as amended by A9)', () => {
  const PEDAL = globalDocument(
    '',
    '<movementMap>' +
      '<movement id="v1" date="0.0" position="0.0" transition.to="1.0" curvature="0.4" protraction="0.5"/>' +
      '<movement id="v2" date="4.0" position="1.0" transition.to="1.0" curvature="0.4"/>' +
      '<movement id="v3" date="8.0" position="1.0" curvature="0.4"/>' +
      '<movement id="v4" date="12.0" position="0.0" transition.to="1.0" curvature="0.4"/>' +
      '</movementMap>',
  );

  it('scales the Bézier pair exactly as its dynamics twin does', () => {
    const { root } = exaggerate(PEDAL, { pedalShape: 2 });
    expect(numberAt(root, 'v1', 'curvature')).toBe(boundaryPowerLow(0.4, 2));
    expect(numberAt(root, 'v1', 'protraction')).toBe(logit(0.5, 2, -1, 1));
  });

  it('leaves @position and @transition.to alone — they stay excluded under D-G', () => {
    const { root } = exaggerate(PEDAL, { pedalShape: 2 });
    expect(textAt(root, 'v1', 'position')).toBe('0.0');
    expect(textAt(root, 'v1', 'transition.to')).toBe('1.0');
  });

  it('reports the three inert cases and writes none of them', () => {
    const { root, performance } = exaggerate(PEDAL, { pedalShape: 2 });
    expect(textAt(root, 'v2', 'curvature')).toBe('0.4'); // flat segment
    expect(textAt(root, 'v3', 'curvature')).toBe('0.4'); // no @transition.to
    expect(textAt(root, 'v4', 'curvature')).toBe('0.4'); // last entry, never rendered
    expect(notesOfKind(performance, 'movement-inert')).toHaveLength(3);
    expect(performance.dimensions.pedalShape.sitesInert).toBe(3);
  });
});

describe('the remaining §7 edge shapes', () => {
  it('treats @meanTempoAt on a beatLength-less <tempo> as inert, since nothing on it is read', () => {
    const NO_BEAT_LENGTH = globalDocument(
      '',
      '<tempoMap><tempo id="t1" date="0.0" bpm="120" transition.to="60" meanTempoAt="0.3"/>' +
        '</tempoMap>',
    );
    const { root, performance } = exaggerate(NO_BEAT_LENGTH, { tempoShape: 2 });
    expect(textAt(root, 't1', 'meanTempoAt')).toBe('0.3');
    expect(performance.dimensions.tempoShape.state).toBe('inert');
    expect(noteKinds(performance)).toContain('missing-beat-length');
  });

  it('reports an articulation site whose every lever is excluded, without writing anything', () => {
    const ALL_EXCLUDED = globalDocument(
      '<articulationStyles><styleDef name="A"><articulationDef id="rep" name="rep" ' +
        'absoluteDuration="480" absoluteVelocity="127"/></styleDef></articulationStyles>',
      '<articulationMap><style date="0.0" name.ref="A"/></articulationMap>',
    );
    const { root, performance } = exaggerate(ALL_EXCLUDED, { articulation: 2 });
    expect(textAt(root, 'rep', 'absoluteDuration')).toBe('480');
    expect(textAt(root, 'rep', 'absoluteVelocity')).toBe('127');
    expect(performance.totalWrites).toBe(0);
    expect(performance.dimensions.articulation.state).toBe('skipped');
    expect(notesOfKind(performance, 'articulation-component-excluded')).toHaveLength(2);
  });

  it('skips a live gradient endpoint that fails the gate, rather than writing a NaN', () => {
    const BROKEN_GRADIENT = globalDocument(
      '<ornamentationStyles><styleDef name="O"><ornamentDef name="x">' +
        '<dynamicsGradient id="g" transition.from="abc"/></ornamentDef></styleDef>' +
        '</ornamentationStyles>',
      '<ornamentationMap><style date="0.0" name.ref="O"/>' +
        '<ornament id="o1" date="0.0" name.ref="x" scale="1"/></ornamentationMap>',
    );
    const { root, performance } = exaggerate(BROKEN_GRADIENT, { ornamentDynamics: 2 });
    expect(textAt(root, 'g', 'transition.from')).toBe('abc');
    expect(performance.totalWrites).toBe(0);
    expect(performance.dimensions.ornamentDynamics.sitesSkipped).toBe(1);
  });

  it('reports a distribution that declares no width at all as inert', () => {
    const EMPTY_DISTRIBUTION = globalDocument(
      '',
      '<imprecisionMap.timing><distribution.uniform id="u" date="0.0"/></imprecisionMap.timing>',
    );
    const { performance } = exaggerate(EMPTY_DISTRIBUTION, { imprecisionTiming: 2 });
    expect(performance.dimensions.imprecisionTiming.state).toBe('inert');
    expect(performance.totalWrites).toBe(0);
  });
});

describe('the state precedence, where two counters disagree', () => {
  // The discriminating shape: no verdict, nothing transformed, one skip AND one inert site.
  // Every other fixture in the suite either has a dimension-level verdict or reaches the
  // `transformed` arm first, so swapping the last two branches of the derivation would be a
  // silent mutation — and mlign filters samples on exactly this field.
  const SKIP_AND_INERT = globalDocument(
    '',
    '<tempoMap>' +
      '<tempo id="t1" date="0.0" bpm="120" beatLength="0.25" transition.to="60" meanTempoAt="1.5"/>' +
      '<tempo id="t2" date="4.0" bpm="90" beatLength="0.25" meanTempoAt="0.4"/>' +
      '</tempoMap>',
  );

  it('reports skipped, because a gate refusal is actionable where inertness is not', () => {
    const { performance } = exaggerate(SKIP_AND_INERT, { tempoShape: 2 });
    expect(performance.dimensions.tempoShape.sitesSkipped).toBe(1);
    expect(performance.dimensions.tempoShape.sitesInert).toBe(1);
    expect(performance.dimensions.tempoShape.state).toBe('skipped');
  });

  it('reports inert only when nothing was skipped', () => {
    const INERT_ONLY = globalDocument(
      '',
      '<tempoMap><tempo id="t2" date="4.0" bpm="90" beatLength="0.25" meanTempoAt="0.4"/>' +
        '</tempoMap>',
    );
    const { performance } = exaggerate(INERT_ONLY, { tempoShape: 2 });
    expect(performance.dimensions.tempoShape.state).toBe('inert');
  });
});
