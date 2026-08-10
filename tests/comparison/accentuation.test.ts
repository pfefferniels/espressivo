/**
 * The metrical-accentuation curve — DESIGN.md §5.4.
 *
 * The load-bearing test here is the **differential** one: `accentuationAt` is a
 * transliteration of `AccentuationPatternDef.getAccentuationAt`, so it is checked against the
 * real thing across a beat sweep rather than against hand-computed expectations. A
 * transliteration tested only against numbers I worked out myself would pin my reading of the
 * renderer, which is exactly the failure mode that produced two of W2's three CAPITALs.
 *
 * The renderer class is constructed on a `copy()`, because parsing an `accentuationPatternDef`
 * adds `length="4"` and reorders its children (`AccentuationPatternDef.ts:36-40`, `:192-199`)
 * — the mutation R1 forbids on a caller's document and which is precisely why the comparison
 * reader reads the element raw.
 */
import { describe, it, expect } from 'vitest';
import { Builder } from '../../src/xml/XomTypes.js';
import '../../src/mpm/Mpm.js';
import { AccentuationPatternDef } from '../../src/mpm/elements/styles/defs/AccentuationPatternDef.js';
import { readComparisonPair, readScopeMapViews } from '../../src/comparison/document.js';
import type { ComparisonDocument, ComparisonPair } from '../../src/comparison/document.js';
import {
  DEFAULT_PATTERN_LENGTH,
  accentuationAt,
  accentuationContributionAt,
  beatAt,
  neutralAccentuationCurve,
  readAccentuationPattern,
  readAccentuationSegments,
  rendererDefaultBeatGrid,
  type AccentuationCurve,
} from '../../src/comparison/accentuationCurve.js';
import { isBottom } from '../../src/comparison/values.js';

const NS = 'http://www.cemfi.de/mpm/ns/1.0';

const defXml = (body: string, length = '4.0') =>
  `<accentuationPatternDef xmlns="${NS}" name="p" length="${length}">${body}</accentuationPatternDef>`;

const parseDef = (xml: string) => new Builder().build(xml).getRootElement();

const doc = (map: string, header: string) =>
  `<mpm xmlns="${NS}"><performance name="p" pulsesPerQuarter="720">` +
  `<global><header>${header}</header><dated><metricalAccentuationMap>${map}` +
  '</metricalAccentuationMap></dated></global></performance></mpm>';

const styles = (defs: string) =>
  `<metricalAccentuationStyles><styleDef name="M">${defs}</styleDef></metricalAccentuationStyles>`;

const curveOf = (pair: ComparisonPair, side: 'a' | 'b'): AccentuationCurve => {
  const document: ComparisonDocument = pair[side];
  const scope = document.scopes.find((candidate) => candidate.scope === 'global');
  if (scope === undefined) throw new Error('no global scope');
  return readAccentuationSegments(
    readScopeMapViews(scope).get('metricalAccentuationMap') ?? null,
    document.scaleFactor,
    scope.environment,
    document.performance.global,
  );
};

const curveFor = (map: string, header: string): AccentuationCurve =>
  curveOf(readComparisonPair({ a: doc(map, header) }), 'a');

describe('accentuationAt agrees with the renderer, bit for bit', () => {
  const PATTERNS: readonly (readonly [string, string])[] = [
    [
      'canonical four-beat',
      defXml(
        '<accentuation beat="1" value="20" transition.from="0.0" transition.to="1.0"/>' +
          '<accentuation beat="2" value="-10" transition.from="0.0" transition.to="1.0"/>' +
          '<accentuation beat="3" value="10" transition.from="0.0" transition.to="1.0"/>' +
          '<accentuation beat="4" value="-10" transition.from="0.0" transition.to="1.0"/>',
      ),
    ],
    ['single accentuation', defXml('<accentuation beat="1" value="15"/>')],
    [
      'the defaulting chain (from falls back to value, to falls back to from)',
      defXml(
        '<accentuation beat="1" value="12"/><accentuation beat="2.5" value="-4" transition.to="7"/>',
      ),
    ],
    [
      'accentuations out of order in the source',
      defXml(
        '<accentuation beat="3" value="5" transition.to="9"/>' +
          '<accentuation beat="1" value="-2" transition.to="4"/>',
        '3.0',
      ),
    ],
    [
      'first accentuation after beat 1',
      defXml('<accentuation beat="2" value="8" transition.to="-3"/>'),
    ],
  ];

  it.each(PATTERNS)('matches getAccentuationAt across a beat sweep: %s', (_label, xml) => {
    const element = parseDef(xml);
    const mine = readAccentuationPattern(element);
    // copy(): constructing the def adds @length and reorders children.
    const renderer = AccentuationPatternDef.createAccentuationPatternDef(element.copy());
    expect(renderer).not.toBeNull();

    for (let beat = 0; beat <= 6.02; beat += 0.01) {
      const position = Math.round(beat * 100) / 100;
      expect(accentuationAt(mine, position), `beat ${String(position)}`).toBe(
        renderer!.getAccentuationAt(position),
      );
    }
  });

  it('reproduces the segment-end ASYMMETRY, which is the whole reason it is transliterated', () => {
    // For an accentuation with a successor the segment ends at the next beat; for the LAST
    // one it runs to length + 1. Upstream cemfi/meico's guard can never hold, so every
    // segment ran to the pattern end and all but the last interpolation was flattened.
    const pattern = readAccentuationPattern(
      parseDef(
        defXml(
          '<accentuation beat="1" value="0" transition.from="0" transition.to="10"/>' +
            '<accentuation beat="2" value="0" transition.from="0" transition.to="10"/>',
        ),
      ),
    );
    // First segment [1,2): ramps 0 -> 10 over ONE beat, so it is half way at beat 1.5.
    expect(accentuationAt(pattern, 1.5)).toBeCloseTo(5, 12);
    // Last segment [2, 5): ramps 0 -> 10 over THREE beats, so it is a third of the way at 3.
    expect(accentuationAt(pattern, 3)).toBeCloseTo(10 / 3, 12);
  });

  it('takes @value exactly on a beat, not @transition.from', () => {
    const pattern = readAccentuationPattern(
      parseDef(defXml('<accentuation beat="1" value="20" transition.from="0" transition.to="1"/>')),
    );
    expect(accentuationAt(pattern, 1)).toBe(20);
    // Immediately after, it is on the ramp from transition.from = 0.
    expect(accentuationAt(pattern, 1.0001)).toBeLessThan(1);
  });

  it('is 0 before the first accentuation and transition.to at and after length + 1', () => {
    const pattern = readAccentuationPattern(
      parseDef(defXml('<accentuation beat="2" value="8" transition.to="-3"/>')),
    );
    expect(accentuationAt(pattern, 1)).toBe(0);
    expect(accentuationAt(pattern, 1.99)).toBe(0);
    expect(accentuationAt(pattern, 5)).toBe(-3);
    expect(accentuationAt(pattern, 99)).toBe(-3);
  });

  it('defaults @length to 4', () => {
    const element = new Builder()
      .build(
        `<accentuationPatternDef xmlns="${NS}" name="p"><accentuation beat="1" value="1"/></accentuationPatternDef>`,
      )
      .getRootElement();
    expect(readAccentuationPattern(element).length).toBe(DEFAULT_PATTERN_LENGTH);
  });
});

describe('the beat grid anchors at the TIME SIGNATURE, not the instruction (AD-12)', () => {
  const grid = rendererDefaultBeatGrid();
  const pattern = readAccentuationPattern(
    parseDef(defXml('<accentuation beat="1" value="20"/><accentuation beat="3" value="-10"/>')),
  );
  const segment = {
    startTicks: 0,
    endTicks: Number.POSITIVE_INFINITY,
    scale: 1,
    stickToMeasures: true,
    loop: true,
    pattern: { kind: 'value' as const, value: pattern },
  };

  it('uses the renderer defaults with no time signature: 4/4 at date 0', () => {
    expect(grid).toEqual({ tsDate: 0, numerator: 4, denominator: 4, source: 'renderer-default' });
    // ticksPerBeat = 4*720/4 = 720, so tick 720 is beat 2.
    expect(beatAt(0, segment, pattern, grid, 720)).toBe(1);
    expect(beatAt(720, segment, pattern, grid, 720)).toBe(2);
    expect(beatAt(2880, segment, pattern, grid, 720)).toBe(1); // next measure
  });

  it('gives IDENTICAL velocities when the instruction moves, which is the whole point', () => {
    // Both branches subtract tsDate, never md.startDate. An instruction at 360 performs the
    // same contribution at every date as one at 0; a per-instruction cycle model would give
    // them different phases and a spurious nonzero distance.
    const header = styles(
      '<accentuationPatternDef name="p" length="4.0">' +
        '<accentuation beat="1" value="20"/><accentuation beat="3" value="-10"/>' +
        '</accentuationPatternDef>',
    );
    const atZero = curveFor(
      '<style date="0.0" name.ref="M"/><accentuationPattern date="0.0" name.ref="p" scale="1.0" loop="true"/>',
      header,
    );
    const atLater = curveFor(
      '<style date="0.0" name.ref="M"/><accentuationPattern date="360.0" name.ref="p" scale="1.0" loop="true"/>',
      header,
    );
    for (const ticks of [720, 1080, 1440, 2160, 2880]) {
      const a = accentuationContributionAt(atZero, ticks, 720);
      const b = accentuationContributionAt(atLater, ticks, 720);
      expect(a.kind).toBe('value');
      expect(b.kind).toBe('value');
      if (a.kind === 'value' && b.kind === 'value') expect(a.value).toBe(b.value);
    }
  });

  it('cycles on the MEASURE under stickToMeasures and on the PATTERN without it', () => {
    const shortPattern = readAccentuationPattern(
      parseDef(defXml('<accentuation beat="1" value="1"/>', '2.0')),
    );
    const sticky = { ...segment, pattern: { kind: 'value' as const, value: shortPattern } };
    const loose = { ...sticky, stickToMeasures: false };
    // measure = 4 beats = 2880 ticks; pattern = 2 beats = 1440 ticks.
    expect(beatAt(1440, sticky, shortPattern, grid, 720)).toBe(3);
    expect(beatAt(1440, loose, shortPattern, grid, 720)).toBe(1);
  });
});

describe('accentuation spans: loop, skips and ⊥', () => {
  const HEADER = styles(
    '<accentuationPatternDef name="p" length="4.0">' +
      '<accentuation beat="1" value="20"/><accentuation beat="3" value="-10"/>' +
      '</accentuationPatternDef>',
  );

  const contribution = (curve: AccentuationCurve, ticks: number) => {
    const value = accentuationContributionAt(curve, ticks, 720);
    return value.kind === 'value' ? value.value : NaN;
  };

  it('is 0 everywhere for an absent map (R6)', () => {
    expect(contribution(neutralAccentuationCurve(), 1000)).toBe(0);
  });

  it('applies one pattern then falls silent when @loop is off (default)', () => {
    const curve = curveFor(
      '<style date="0.0" name.ref="M"/><accentuationPattern date="0.0" name.ref="p" scale="1.0"/>',
      HEADER,
    );
    // patternLengthTicks = 4 * 4 * 720 / 4 = 2880.
    expect(contribution(curve, 0)).toBe(20);
    expect(contribution(curve, 2879)).not.toBe(0);
    expect(contribution(curve, 2880)).toBe(0);
    expect(contribution(curve, 5000)).toBe(0);
  });

  it('keeps applying when @loop is true', () => {
    const curve = curveFor(
      '<style date="0.0" name.ref="M"/><accentuationPattern date="0.0" name.ref="p" scale="1.0" loop="true"/>',
      HEADER,
    );
    expect(contribution(curve, 2880)).toBe(20);
    expect(contribution(curve, 5760)).toBe(20);
  });

  it('scales the contribution', () => {
    const curve = curveFor(
      '<style date="0.0" name.ref="M"/><accentuationPattern date="0.0" name.ref="p" scale="2.5" loop="true"/>',
      HEADER,
    );
    expect(contribution(curve, 0)).toBe(50);
  });

  it('reads an unresolvable pattern name as ⊥, because the render THROWS (R21)', () => {
    const curve = curveFor(
      '<style date="0.0" name.ref="M"/><accentuationPattern date="0.0" name.ref="nosuch" scale="1.0"/>',
      HEADER,
    );
    expect(isBottom(accentuationContributionAt(curve, 0, 720))).toBe(true);
    expect(curve.notes.some((note) => note.kind === 'renderer-error')).toBe(true);
  });

  it('SKIPS an instruction with no style in scope, even with a valid @name.ref', () => {
    // No <style> switch before it: getMetricalAccentuationDataOf returns null and the
    // renderer skips it silently. A skip, not a ⊥ — nothing throws.
    const curve = curveFor('<accentuationPattern date="0.0" name.ref="p" scale="1.0"/>', HEADER);
    expect(contribution(curve, 0)).toBe(0);
    expect(curve.notes.some((note) => note.kind === 'renderer-skip')).toBe(true);
    expect(curve.notes.some((note) => note.kind === 'renderer-error')).toBe(false);
  });

  it('SKIPS an instruction missing @scale or @name.ref', () => {
    const noScale = curveFor(
      '<style date="0.0" name.ref="M"/><accentuationPattern date="0.0" name.ref="p"/>',
      HEADER,
    );
    expect(contribution(noScale, 0)).toBe(0);
    expect(noScale.notes.some((note) => note.kind === 'renderer-skip')).toBe(true);
  });

  it('reports which time-signature source it used', () => {
    const curve = curveFor(
      '<style date="0.0" name.ref="M"/><accentuationPattern date="0.0" name.ref="p" scale="1.0"/>',
      HEADER,
    );
    expect(curve.timeSignatureSource).toBe('renderer-default');
  });

  it('treats stickToMeasures as TRUE by default — the one boolean that is not false', () => {
    const curve = curveFor(
      '<style date="0.0" name.ref="M"/><accentuationPattern date="0.0" name.ref="p" scale="1.0"/>',
      HEADER,
    );
    expect(curve.segments[0].stickToMeasures).toBe(true);
    const explicit = curveFor(
      '<style date="0.0" name.ref="M"/><accentuationPattern date="0.0" name.ref="p" scale="1.0" stickToMeasures="false"/>',
      HEADER,
    );
    expect(explicit.segments[0].stickToMeasures).toBe(false);
  });
});
