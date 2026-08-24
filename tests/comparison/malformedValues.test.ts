/**
 * MINOR-4 — the malformed-value table, ruled by the renderer.
 *
 * Three legal-but-malformed inputs where the comparison could repair what the renderer does not.
 * Every claim is measured through `performMsm`, and the measurements do not all agree
 * with the verification report that raised them.
 *
 * | input | the report predicted | the renderer does | the comparison reads |
 * | --- | --- | --- | --- |
 * | `curvature="abc"` on a `<dynamics>` transition | `velocity="NaN"` | performs the MIDPOINT of the two endpoints as a constant | a constant at the midpoint |
 * | `intensity="abc"` on a `<rubato>` with a def | keeps NaN, does not consult the def | keeps NaN, `date.perf="NaN"` over the warped frame | `⊥` over the warped frame |
 * | `frameLength="0"` with `@loop` | NaN warped dates | `date.perf="NaN"` over the whole span | `⊥` over the whole span |
 *
 * The first row is the interesting one: the prediction was `⊥`, and the renderer performs a
 * definite, audible constant. `tForDate` starts at `t = 0.5` and loops
 * `while (Math.abs(diffX) >= 1.0)`, which `NaN` fails, so `t` never moves — and the value
 * fraction at `t = 0.5` is `(3 − 2t)t² = 0.5` for EVERY shape. A `⊥` there would price a
 * performance the renderer gives perfectly well at `δ_row`.
 *
 * The two rubato rows DO reach `⊥`, which is what makes the capped integrator forced for
 * that dimension, as it already is for accentuation and pedal.
 */
import { describe, it, expect } from 'vitest';
import { performMsm } from '../../src/api/pipeline.js';
import { compareMpm } from '../../src/api/index.js';
import { readComparisonPair, readScopeMapViews } from '../../src/comparison/document.js';
import { readDynamicsSegments, volumeAt } from '../../src/comparison/dynamicsCurve.js';
import {
  isRubatoBottomAt,
  readRubatoSegments,
  rubatoBottomSpans,
} from '../../src/comparison/rubatoCurve.js';

const NS = 'http://www.cemfi.de/mpm/ns/1.0';
const PPQ = 720;

/** Four notes, one per quarter — enough to see where a span's behaviour changes. */
const MSM = `<?xml version="1.0" encoding="UTF-8"?>
<msm xmlns="http://www.cemfi.de/msm/ns/1.0" title="t" pulsesPerQuarter="${PPQ}">
  <global><dated/></global>
  <part name="p" number="1" midi.channel="0" midi.port="0"><dated><score>
    <note xml:id="n1" date="0.0" midi.pitch="60.0" duration="720.0"/>
    <note xml:id="n2" date="720.0" midi.pitch="62.0" duration="720.0"/>
    <note xml:id="n3" date="1440.0" midi.pitch="64.0" duration="720.0"/>
    <note xml:id="n4" date="2160.0" midi.pitch="65.0" duration="720.0"/>
  </score></dated></part>
</msm>`;

const doc = (dated: string, header = ''): string =>
  `<mpm xmlns="${NS}"><performance name="p" pulsesPerQuarter="${String(PPQ)}">` +
  `<global><header>${header}</header><dated>${dated}</dated></global>` +
  '<part name="p" number="1" midi.channel="0" midi.port="0"><header/><dated/></part>' +
  '</performance></mpm>';

/** What the renderer performs, per note — the only evidence this file accepts. */
function performed(dated: string, header = ''): readonly { velocity: string; date: string }[] {
  const out = performMsm({ msm: MSM, mpm: doc(dated, header) });
  return [...out.matchAll(/<note\b[^>]*>/g)].map((match) => {
    const read = (name: string): string =>
      new RegExp(`\\s${name}="([^"]*)"`).exec(match[0])?.[1] ?? '-';
    return { velocity: read('velocity'), date: read('date\\.perf') };
  });
}

const scopeOf = (mpm: string, container: string) => {
  const pair = readComparisonPair({ a: mpm });
  const scope = pair.a.scopes.find((candidate) => candidate.scope === 'global');
  if (scope === undefined) throw new Error('no global scope');
  return {
    view: readScopeMapViews(scope).get(container) ?? null,
    scaleFactor: pair.a.scaleFactor,
    environment: scope.environment,
    global: pair.a.performance.global,
  };
};

// ---------------------------------------------------------------------------
// Row 1: an unusable @curvature / @protraction on a dynamics transition
// ---------------------------------------------------------------------------

describe('MINOR-4 row 1: an unusable @curvature performs the MIDPOINT, not NaN', () => {
  const ramp = (shape: string) =>
    `<dynamicsMap><dynamics date="0.0" volume="40.0" transition.to="120.0" ${shape}/>` +
    '<dynamics date="2880.0" volume="120.0"/></dynamicsMap>';

  it('performs a definite constant, which refutes the report’s NaN prediction', () => {
    // The usable shape ramps; the unusable one holds the arithmetic midpoint of 40 and 120.
    expect(performed(ramp('curvature="0.4"')).map((note) => note.velocity)).toEqual([
      '40',
      '50.83075387403369',
      '80',
      '109.16924612596631',
    ]);
    expect(performed(ramp('curvature="abc"')).map((note) => note.velocity)).toEqual([
      '40',
      '80',
      '80',
      '80',
    ]);
    // …and `@protraction` is the same mechanism through the other control point.
    expect(performed(ramp('protraction="abc"')).map((note) => note.velocity)).toEqual([
      '40',
      '80',
      '80',
      '80',
    ]);
  });

  it('reads as a constant at the midpoint, and reports it', () => {
    const parts = scopeOf(doc(ramp('curvature="abc"')), 'dynamicsMap');
    const curve = readDynamicsSegments(
      parts.view,
      parts.scaleFactor,
      parts.environment,
      parts.global,
    );
    for (const ticks of [1, 720, 1440, 2160, 2879])
      expect(volumeAt(curve, ticks)).toBeCloseTo(80, 9);
    expect(curve.notes.map((note) => note.kind)).toContain('degenerate-shape');
  });

  it('is a real difference from the repaired reading a curvature of 0 would give', () => {
    const window = { start: 0, end: 4 };
    // A repaired reading is a smoothstep ramp; the renderer's is a constant. Comparing the two
    // documents measures the gap between them — under the repair the answer would be 0.
    const report = compareMpm({
      a: doc(ramp('curvature="abc"')),
      b: doc(ramp('curvature="0"')),
      window,
    }).report;
    expect(report.dimensions.dynamics.distance).toBeGreaterThan(1);
  });

  it('is not ⊥: the dimension carries no cap and no bottom length', () => {
    const window = { start: 0, end: 4 };
    const report = compareMpm({
      a: doc(ramp('curvature="abc"')),
      b: doc(ramp('curvature="0.4"')),
      window,
    }).report;
    expect(report.dimensions.dynamics.bottomLengthQuarters).toBe(0);
    expect(report.dimensions.dynamics.cappedCells).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Rows 2 and 3: a rubato warp the renderer computes as NaN
// ---------------------------------------------------------------------------

const RUBATO_STYLES =
  '<rubatoStyles><styleDef name="R">' +
  '<rubatoDef name="D" frameLength="720.0" intensity="2.0" lateStart="0.0" earlyEnd="1.0"/>' +
  '</styleDef></rubatoStyles>';

const rubatoMap = (body: string) => `<rubatoMap>${body}</rubatoMap>`;
const withStyle = (body: string) => rubatoMap(`<style date="0.0" name.ref="R"/>${body}`);

const rubatoCurveFor = (dated: string, header = '') => {
  const parts = scopeOf(doc(dated, header), 'rubatoMap');
  return readRubatoSegments(parts.view, parts.scaleFactor, parts.environment, parts.global);
};

describe('MINOR-4 row 2: a present-but-unusable @intensity is NOT inherited from the def', () => {
  it('performs the def’s warp when the attribute is absent, and NaN when it is unusable', () => {
    const inherited = performed(withStyle('<rubato date="0.0" name.ref="D"/>'), RUBATO_STYLES);
    expect(inherited.map((note) => note.date)).toEqual(['0', '720.0', '1440.0', '2160.0']);

    // `getRubatoDataOf` tests the attribute's PRESENCE: a present-but-unusable value keeps its
    // NaN and the def is never consulted for it.
    const poisoned = performed(
      withStyle('<rubato date="0.0" name.ref="D" intensity="abc"/>'),
      RUBATO_STYLES,
    );
    // Only the FIRST FRAME is warped — `@loop` defaults false — so only the note inside it dies.
    expect(poisoned.map((note) => note.date)).toEqual(['NaN', '720.0', '1440.0', '2160.0']);
  });

  it('reads ⊥ over the warped frame and nothing after it', () => {
    const curve = rubatoCurveFor(
      withStyle('<rubato date="0.0" name.ref="D" intensity="abc"/>'),
      RUBATO_STYLES,
    );
    expect(rubatoBottomSpans(curve)).toEqual([{ startTicks: 0, endTicks: 720 }]);
    expect(isRubatoBottomAt(curve, 0)).toBe(true);
    expect(isRubatoBottomAt(curve, 719)).toBe(true);
    expect(isRubatoBottomAt(curve, 720)).toBe(false);
    expect(curve.notes.map((note) => note.kind)).toContain('renderer-error');
  });

  it('prices the ⊥ frame at δ_row per quarter, which is what the design asks for', () => {
    const report = compareMpm({
      a: doc(withStyle('<rubato date="0.0" name.ref="D" intensity="abc"/>'), RUBATO_STYLES),
      b: doc(withStyle('<rubato date="0.0" name.ref="D"/>'), RUBATO_STYLES),
      window: { start: 0, end: 4 },
    }).report;
    // δ_row = 10 JND over the one warped quarter, and 0 over the three unwarped ones.
    expect(report.dimensions.rubato.distance).toBeCloseTo(10, 9);
    expect(report.dimensions.rubato.bottomLengthQuarters).toBeCloseTo(1, 9);
    expect(report.dimensions.rubato.cappedCells).toBeGreaterThan(0);
  });
});

describe('MINOR-4 row 3: @frameLength that the renderer cannot use', () => {
  it('poisons the whole span when it is 0 and @loop is on', () => {
    const zero = rubatoMap('<rubato date="0.0" frameLength="0.0" intensity="2.0" loop="true"/>');
    expect(performed(zero).map((note) => note.date)).toEqual(['NaN', 'NaN', 'NaN', 'NaN']);
    const curve = rubatoCurveFor(zero);
    expect(isRubatoBottomAt(curve, 0)).toBe(true);
    expect(isRubatoBottomAt(curve, 2160)).toBe(true);
  });

  it('poisons nothing when it is 0 and @loop is off — the guard breaks on the first note', () => {
    const zero = rubatoMap('<rubato date="0.0" frameLength="0.0" intensity="2.0"/>');
    expect(performed(zero).map((note) => note.date)).toEqual(['0.0', '720.0', '1440.0', '2160.0']);
    expect(rubatoBottomSpans(rubatoCurveFor(zero))).toEqual([]);
  });

  it('poisons the whole span when it is UNUSABLE, with or without @loop', () => {
    // `!loop && date >= start + NaN` is false, so the guard never breaks and every note in the
    // span is warped — which is why an unusable frame length is worse than a zero one.
    const unusable = rubatoMap('<rubato date="0.0" frameLength="abc" intensity="2.0"/>');
    expect(performed(unusable).map((note) => note.date)).toEqual(['NaN', 'NaN', 'NaN', 'NaN']);
    const curve = rubatoCurveFor(unusable);
    expect(isRubatoBottomAt(curve, 2160)).toBe(true);
  });

  it('performs the identity for a NEGATIVE frame length, which is not ⊥', () => {
    const negative = rubatoMap(
      '<rubato date="0.0" frameLength="-720.0" intensity="2.0" loop="true"/>',
    );
    expect(performed(negative).map((note) => note.date)).toEqual(['0', '720', '1440', '2160']);
    expect(rubatoBottomSpans(rubatoCurveFor(negative))).toEqual([]);
  });

  it('poisons the whole span when an unusable @lateStart survives the renderer’s clamps', () => {
    // `NaN < 0`, `NaN > 1` and `NaN >= earlyEnd` are all false, so the clamps leave it alone.
    const poisoned = rubatoMap(
      '<rubato date="0.0" frameLength="720.0" lateStart="abc" loop="true"/>',
    );
    expect(performed(poisoned).map((note) => note.date)).toEqual(['NaN', 'NaN', 'NaN', 'NaN']);
    expect(isRubatoBottomAt(rubatoCurveFor(poisoned), 1440)).toBe(true);
  });
});

describe('rubato’s first ⊥ route forces its capped integrator', () => {
  it('keeps the triangle inequality with a ⊥ document as the middle term', () => {
    const window = { start: 0, end: 4 };
    // A frame of FOUR quarters, not one: the displacement is bounded by the frame length, and
    // over a one-quarter frame it cannot reach the 20 JND the cap sits at (1/16-quarter JND ×
    // at most one quarter is 16). Over four it reaches ~50, where an uncapped integral breaks
    // the inequality with a ⊥ in the middle.
    const warp = (intensity: string) =>
      doc(
        rubatoMap(`<rubato date="0.0" frameLength="2880.0" intensity="${intensity}" loop="true"/>`),
      );
    const a = warp('0.05');
    const c = warp('20');
    const b = doc(rubatoMap('<rubato date="0.0" frameLength="0.0" intensity="2.0" loop="true"/>'));
    const d = (x: string, y: string) =>
      compareMpm({ a: x, b: y, window }).report.dimensions.rubato.distance;
    expect(d(a, c)).toBeLessThanOrEqual((d(a, b) + d(b, c)) * (1 + 1e-9));
  });
});
