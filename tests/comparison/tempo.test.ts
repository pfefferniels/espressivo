/**
 * The tempo curve and its distance, plus the first real regression anchors.
 *
 * Two kinds of test. Inline documents pin the four renderer behaviours that decide the curve and
 * that no fixture exercises together — the degenerate table, the inert trailing transition, the
 * skip gap, the pre-first default. The vendored Telemann document pins actual numbers, because a
 * curve that is right in every unit test can still be wired up wrongly, and the shape
 * (Baroque and Romantic close, Fast far from both) is a claim about the world that a synthetic
 * fixture cannot make.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { readComparisonPair, readScopeMapViews } from '../../src/comparison/document.js';
import type { ComparisonDocument, ComparisonPair } from '../../src/comparison/document.js';
import {
  NO_TEMPO_QUARTER_BPM,
  neutralTempoCurve,
  quarterBpmAt,
  readTempoSegments,
  type TempoCurve,
} from '../../src/comparison/tempoCurve.js';
import { refinementGridTicks, tempoDistance } from '../../src/comparison/tempoDistance.js';
import { TEMPO_JND_NEPERS } from '../../src/comparison/registry.js';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');
const TELEMANN = readFileSync(join(FIXTURES, 'telemann-grave.mpm'), 'utf-8');

/** A one-performance document carrying just a global tempoMap. */
const tempoDoc = (map: string, header = '', ppq = '720') =>
  `<mpm xmlns="http://www.cemfi.de/mpm/ns/1.0"><performance name="p" pulsesPerQuarter="${ppq}">` +
  `<global><header>${header}</header><dated><tempoMap>${map}</tempoMap></dated></global>` +
  `</performance></mpm>`;

/** The global-scope tempo curve of one side of a pair. */
const curveOf = (pair: ComparisonPair, side: 'a' | 'b'): TempoCurve => {
  const document: ComparisonDocument = pair[side];
  const scope = document.scopes.find((candidate) => candidate.scope === 'global');
  if (scope === undefined) throw new Error('no global scope');
  return readTempoSegments(
    readScopeMapViews(scope).get('tempoMap') ?? null,
    document.scaleFactor,
    scope.environment,
    document.performance.global,
  );
};

/** Read one inline document's curve without a pair. */
const curveFor = (map: string, header = ''): TempoCurve => {
  const pair = readComparisonPair({ a: tempoDoc(map, header) });
  return curveOf(pair, 'a');
};

describe('tempo curve: the degenerate table', () => {
  const tempo = (extra: string) =>
    `<tempo date="0.0" bpm="60" beatLength="0.25" ${extra}/><tempo date="2880.0" bpm="60" beatLength="0.25"/>`;

  it('performs a transition.to equal to bpm as a constant at bpm', () => {
    const curve = curveFor(tempo('transition.to="60" meanTempoAt="0.5"'));
    expect(quarterBpmAt(curve, 1440)).toBe(60);
  });

  it('performs meanTempoAt <= 0 as a constant at TRANSITION.TO, not at bpm', () => {
    // TempoMap.ts:144-151 reassigns bpm := transitionTo, so reading the row as "collapses to a
    // constant [at bpm]" is wrong by a factor of two here.
    const curve = curveFor(tempo('transition.to="120" meanTempoAt="0"'));
    expect(quarterBpmAt(curve, 0)).toBe(120);
    expect(quarterBpmAt(curve, 1440)).toBe(120);
  });

  it('performs meanTempoAt >= 1 as a constant at bpm', () => {
    const curve = curveFor(tempo('transition.to="120" meanTempoAt="1"'));
    expect(quarterBpmAt(curve, 1440)).toBe(60);
  });

  it('performs an absent meanTempoAt with a differing transition.to as a linear ramp', () => {
    const curve = curveFor(tempo('transition.to="120"'));
    // e = 1, so the midpoint of the span is the midpoint of the tempi.
    expect(quarterBpmAt(curve, 1440)).toBeCloseTo(90, 10);
  });

  it('bends the ramp when meanTempoAt is interior', () => {
    const curve = curveFor(tempo('transition.to="120" meanTempoAt="0.25"'));
    // e = ln0.5/ln0.25 = 0.5, so at u = 0.5 the tempo is 60 + 60*sqrt(0.5) ≈ 102.4
    expect(quarterBpmAt(curve, 1440)).toBeCloseTo(60 + 60 * Math.sqrt(0.5), 10);
  });
});

describe('tempo curve: trailing transitions are inert', () => {
  it('performs the LAST instruction as a constant whatever its transition says', () => {
    const curve = curveFor(
      '<tempo date="0.0" bpm="60" beatLength="0.25"/>' +
        '<tempo date="2880.0" bpm="120" beatLength="0.25" transition.to="90" meanTempoAt="0.5"/>',
    );
    // getEndDate is MAX_VALUE there, so u ≈ 0 for every real date: a flat 120, not a rit.
    expect(quarterBpmAt(curve, 2880)).toBe(120);
    expect(quarterBpmAt(curve, 100000)).toBe(120);
    expect(curve.notes.some((note) => note.kind === 'inert-transition')).toBe(true);
  });

  it('inserts no synthetic breakpoint for the inert transition', () => {
    const curve = curveFor(
      '<tempo date="0.0" bpm="60" beatLength="0.25"/>' +
        '<tempo date="2880.0" bpm="120" beatLength="0.25" transition.to="90"/>',
    );
    expect(curve.breakpointsTicks).toEqual([0, 2880]);
  });
});

describe('tempo curve: skips and the pre-first region', () => {
  it('performs [0, firstValidDate) at the no-tempo default of 100 qbpm', () => {
    const curve = curveFor('<tempo date="1440.0" bpm="60" beatLength="0.25"/>');
    expect(quarterBpmAt(curve, 0)).toBe(NO_TEMPO_QUARTER_BPM);
    expect(quarterBpmAt(curve, 1439)).toBe(NO_TEMPO_QUARTER_BPM);
    expect(quarterBpmAt(curve, 1440)).toBe(60);
  });

  it('opens a 100-qbpm gap where an instruction is skipped, and reports the skip', () => {
    // The middle instruction has no @beatLength, so getTempoDataOf returns null — but
    // getEndDate still ends the previous span at its date.
    const curve = curveFor(
      '<tempo date="0.0" bpm="60" beatLength="0.25"/>' +
        '<tempo date="720.0" bpm="180"/>' +
        '<tempo date="1440.0" bpm="60" beatLength="0.25"/>',
    );
    expect(quarterBpmAt(curve, 0)).toBe(60);
    expect(quarterBpmAt(curve, 719)).toBe(60);
    expect(quarterBpmAt(curve, 720)).toBe(NO_TEMPO_QUARTER_BPM);
    expect(quarterBpmAt(curve, 1439)).toBe(NO_TEMPO_QUARTER_BPM);
    expect(quarterBpmAt(curve, 1440)).toBe(60);
    expect(curve.notes.filter((note) => note.kind === 'renderer-skip')).toHaveLength(1);
  });

  it('treats a missing @bpm as a skip too', () => {
    const curve = curveFor(
      '<tempo date="0.0" beatLength="0.25"/><tempo date="720.0" bpm="60" beatLength="0.25"/>',
    );
    expect(quarterBpmAt(curve, 0)).toBe(NO_TEMPO_QUARTER_BPM);
    expect(quarterBpmAt(curve, 720)).toBe(60);
  });
});

describe('tempo curve: levels and normalization', () => {
  it('normalizes to quarter-bpm through beatLength', () => {
    // A half-note beat at 60 bpm is 120 quarter-bpm.
    const curve = curveFor('<tempo date="0.0" bpm="60" beatLength="0.5"/>');
    expect(quarterBpmAt(curve, 0)).toBe(120);
  });

  it('resolves a named level through its styleDef', () => {
    const curve = curveFor(
      '<style date="0.0" name.ref="T"/><tempo date="0.0" bpm="Andante" beatLength="0.25"/>',
      '<tempoStyles><styleDef name="T"><tempoDef name="Andante" value="101.0"/></styleDef></tempoStyles>',
    );
    expect(quarterBpmAt(curve, 0)).toBe(101);
  });

  it('performs an unresolvable level at the renderer default and reports it', () => {
    const curve = curveFor('<tempo date="0.0" bpm="Allegrissimo" beatLength="0.25"/>');
    expect(quarterBpmAt(curve, 0)).toBe(100);
    expect(curve.notes.some((note) => note.kind === 'renderer-default-level')).toBe(true);
  });

  it('reads right-continuously: the value AT an instruction date is that instruction', () => {
    const curve = curveFor(
      '<tempo date="0.0" bpm="60" beatLength="0.25"/><tempo date="720.0" bpm="90" beatLength="0.25"/>',
    );
    expect(quarterBpmAt(curve, 720)).toBe(90);
    expect(quarterBpmAt(curve, 719.999)).toBeCloseTo(60, 6);
  });

  it('is 100 qbpm everywhere for an absent map (absence is neutral)', () => {
    const neutral = neutralTempoCurve();
    expect(quarterBpmAt(neutral, 0)).toBe(100);
    expect(quarterBpmAt(neutral, 99999)).toBe(100);
    expect(readTempoSegments(null, 1, {} as never, {} as never).segments).toHaveLength(1);
  });
});

describe('the refinement grid', () => {
  const pairOf = (mapA: string, mapB: string) =>
    readComparisonPair({ a: tempoDoc(mapA), b: tempoDoc(mapB) });

  it('is the sorted union of both documents’ breakpoints, clipped to the window', () => {
    const pair = pairOf(
      '<tempo date="0.0" bpm="60" beatLength="0.25"/><tempo date="1440.0" bpm="90" beatLength="0.25"/>',
      '<tempo date="0.0" bpm="60" beatLength="0.25"/><tempo date="720.0" bpm="80" beatLength="0.25"/>',
    );
    const grid = refinementGridTicks(
      curveOf(pair, 'a'),
      curveOf(pair, 'b'),
      pair.window,
      pair.ppq.lcm,
    );
    expect(grid).toEqual([0, 720, 1440]);
  });

  it('is identical under swapping the documents', () => {
    const forward = pairOf(
      '<tempo date="0.0" bpm="60" beatLength="0.25"/><tempo date="1440.0" bpm="90" beatLength="0.25"/>',
      '<tempo date="0.0" bpm="60" beatLength="0.25"/><tempo date="720.0" bpm="80" beatLength="0.25"/>',
    );
    const reverse = pairOf(
      '<tempo date="0.0" bpm="60" beatLength="0.25"/><tempo date="720.0" bpm="80" beatLength="0.25"/>',
      '<tempo date="0.0" bpm="60" beatLength="0.25"/><tempo date="1440.0" bpm="90" beatLength="0.25"/>',
    );
    expect(
      refinementGridTicks(
        curveOf(forward, 'a'),
        curveOf(forward, 'b'),
        forward.window,
        forward.ppq.lcm,
      ),
    ).toEqual(
      refinementGridTicks(
        curveOf(reverse, 'a'),
        curveOf(reverse, 'b'),
        reverse.window,
        reverse.ppq.lcm,
      ),
    );
  });
});

describe('tempo distance: metric properties on the W2 subset', () => {
  const distanceBetween = (mapA: string, mapB: string) => {
    const pair = readComparisonPair({ a: tempoDoc(mapA), b: tempoDoc(mapB) });
    return tempoDistance(curveOf(pair, 'a'), curveOf(pair, 'b'), pair.window, pair.ppq.lcm)
      .distance;
  };

  const CONSTANT_60 =
    '<tempo date="0.0" bpm="60" beatLength="0.25"/><tempo date="2880.0" bpm="60" beatLength="0.25"/>';
  const CONSTANT_120 =
    '<tempo date="0.0" bpm="120" beatLength="0.25"/><tempo date="2880.0" bpm="120" beatLength="0.25"/>';
  const CONSTANT_90 =
    '<tempo date="0.0" bpm="90" beatLength="0.25"/><tempo date="2880.0" bpm="90" beatLength="0.25"/>';

  it('identity: a document against itself is exactly 0', () => {
    expect(distanceBetween(CONSTANT_60, CONSTANT_60)).toBe(0);
  });

  it('symmetry: bit-exact under swapping', () => {
    expect(distanceBetween(CONSTANT_60, CONSTANT_120)).toBe(
      distanceBetween(CONSTANT_120, CONSTANT_60),
    );
  });

  it('is the closed-form value on two constants', () => {
    // |ln(120/60)| / jnd over 4 quarters
    const expected = (Math.log(2) / TEMPO_JND_NEPERS) * 4;
    expect(distanceBetween(CONSTANT_60, CONSTANT_120)).toBeCloseTo(expected, 9);
  });

  it('triangle inequality, to quadrature precision', () => {
    // The three constants are pointwise ordered, so this is the EQUALITY case and the only
    // slack is quadrature error. The tolerance is therefore relative — an absolute epsilon
    // on a quantity of magnitude 10^3 is meaningless.
    const ab = distanceBetween(CONSTANT_60, CONSTANT_120);
    const ac = distanceBetween(CONSTANT_60, CONSTANT_90);
    const cb = distanceBetween(CONSTANT_90, CONSTANT_120);
    expect(ab).toBeLessThanOrEqual((ac + cb) * (1 + 1e-9));
  });

  it('encoding invariance: a transition equals its dense step approximation', () => {
    // The module's central distinction: two documents that PERFORM the same curve are at
    // distance ~0 however differently they are written. A linear ramp 60→120 over 4 quarters
    // against 32 constant steps sampling the same ramp right-continuously.
    const ramp =
      '<tempo date="0.0" bpm="60" beatLength="0.25" transition.to="120"/>' +
      '<tempo date="2880.0" bpm="120" beatLength="0.25"/>';
    const steps = Array.from({ length: 32 }, (_, k) => {
      const date = (k * 2880) / 32;
      const bpm = 60 + (60 * k) / 32;
      return `<tempo date="${String(date)}.0" bpm="${String(bpm)}" beatLength="0.25"/>`;
    }).join('');

    const distance = distanceBetween(
      ramp,
      `${steps}<tempo date="2880.0" bpm="120" beatLength="0.25"/>`,
    );
    // Bounded ABOVE, because the two really are close; and bounded BELOW away from zero is
    // not asserted — a finer step set would converge, and pinning a floor would pin the
    // approximation error rather than the invariance.
    const rampAgainstFlat = distanceBetween(ramp, CONSTANT_60);
    expect(distance).toBeLessThan(rampAgainstFlat * 0.05);
  });

  it('prices an absent map against a present one rather than dropping the dimension', () => {
    const pair = readComparisonPair({
      a: tempoDoc(CONSTANT_120),
      b:
        '<mpm xmlns="http://www.cemfi.de/mpm/ns/1.0"><performance name="p" pulsesPerQuarter="720">' +
        '<global><header/><dated/></global></performance></mpm>',
    });
    const distance = tempoDistance(
      curveOf(pair, 'a'),
      curveOf(pair, 'b'),
      pair.window,
      pair.ppq.lcm,
    ).distance;
    // 120 qbpm against the neutral 100 qbpm, not 0 and not excluded.
    expect(distance).toBeGreaterThan(0);
    expect(distance).toBeCloseTo((Math.log(120 / 100) / TEMPO_JND_NEPERS) * 4, 6);
  });

  it('symmetry on a POWER-VS-POWER cell, which is where it broke', () => {
    // A symmetry test on two CONSTANTS never reaches criticalPointTicks. Passing the segments in
    // document order makes powerCriticalPoint compute separately-rounded reciprocals —
    // algebraically equal, not equal in IEEE754 — and 11.7 % of argument sets differ by one
    // ulp, which moves the split point, the GL-10 abscissae, and the reported bits. Hence the
    // canonical ordering.
    const a =
      '<tempo date="0.0" bpm="40" beatLength="0.25" transition.to="90" meanTempoAt="0.9"/>' +
      '<tempo date="2880.0" bpm="90" beatLength="0.25"/>';
    const b =
      '<tempo date="0.0" bpm="45" beatLength="0.25" transition.to="85" meanTempoAt="0.1"/>' +
      '<tempo date="2880.0" bpm="85" beatLength="0.25"/>';
    const forward = distanceBetween(a, b);
    const reverse = distanceBetween(b, a);
    expect(Object.is(forward, reverse)).toBe(true);
    // and the cell really is power-vs-power, not two collapsed constants
    expect(forward).toBeGreaterThan(0);
  });

  it('is deterministic: two runs agree bit for bit', () => {
    expect(distanceBetween(CONSTANT_60, CONSTANT_120)).toBe(
      distanceBetween(CONSTANT_60, CONSTANT_120),
    );
  });
});

describe('Telemann regression anchors', () => {
  const anchor = (a: string, b: string) => {
    const pair = readComparisonPair({ a: TELEMANN, performanceA: a, performanceB: b });
    return tempoDistance(curveOf(pair, 'a'), curveOf(pair, 'b'), pair.window, pair.ppq.lcm);
  };

  const baroqueFast = anchor('Baroque', 'Fast');
  const baroqueRomantic = anchor('Baroque', 'Romantic');
  const fastRomantic = anchor('Fast', 'Romantic');

  it('has the shape the corpus advertises: Baroque and Romantic are the near pair', () => {
    expect(baroqueRomantic.distance).toBeLessThan(baroqueFast.distance);
    expect(baroqueRomantic.distance).toBeLessThan(fastRomantic.distance);
  });

  /**
   * Pinned in NEPERS·quarters as well as JND·quarters. The nepers figure is the physical
   * quantity and survives a JND revision; the JND figure is what a report shows, and it moves
   * with `TEMPO_JND_NEPERS`.
   */
  it('pins the measured values', () => {
    expect(baroqueFast.distance).toBeCloseTo(5975.4491, 3);
    expect(baroqueRomantic.distance).toBeCloseTo(556.5371, 3);
    expect(fastRomantic.distance).toBeCloseTo(5418.912, 3);

    expect(baroqueFast.distance * TEMPO_JND_NEPERS).toBeCloseTo(147.5494, 3);
    expect(baroqueRomantic.distance * TEMPO_JND_NEPERS).toBeCloseTo(13.7424, 3);
    expect(fastRomantic.distance * TEMPO_JND_NEPERS).toBeCloseTo(133.8071, 3);
  });

  it('reads as a plausible tempo ratio in the mean', () => {
    // Baroque ~58 qbpm against Fast ~123: ln(123/58) ≈ 0.75 nepers ≈ 30 JND, sustained.
    expect(baroqueFast.mean).not.toBeNull();
    expect((baroqueFast.mean ?? 0) * TEMPO_JND_NEPERS).toBeCloseTo(Math.log(123 / 58), 1);
  });

  it('satisfies the triangle inequality on real data, to quadrature precision', () => {
    expect(baroqueFast.distance).toBeLessThanOrEqual(
      (baroqueRomantic.distance + fastRomantic.distance) * (1 + 1e-9),
    );
  });

  it('is symmetric bit for bit on real data', () => {
    expect(anchor('Fast', 'Baroque').distance).toBe(baroqueFast.distance);
  });

  it('is exactly zero against itself on real data', () => {
    expect(anchor('Baroque', 'Baroque').distance).toBe(0);
  });
});
