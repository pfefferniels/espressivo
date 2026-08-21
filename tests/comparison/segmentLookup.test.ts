/**
 * `coveringSegmentAt` — the half-open rule at the one tick where it is decidable.
 *
 * The three `*SegmentAt` readers that share `segments.ts` used to be linear scans and are now a
 * binary search. Two negative controls on that change were run and one of them came back
 * **green**: relaxing the containment test from `ticks < endTicks` to `ticks <= endTicks` left
 * all 1343 tests in `tests/comparison` passing.
 *
 * The root cause, measured rather than guessed. On a CONTIGUOUS timeline the relaxation is
 * invisible: at `ticks === segment.endTicks` the next segment starts at exactly that tick, so
 * `upperBoundBy − 1` lands on the NEXT segment and the expired one is never the candidate. The
 * two spellings can only disagree where a segment is followed by a **gap** — and gaps exist in
 * exactly two of these curves, opened by an instruction the renderer SKIPS. Nothing in the suite
 * evaluated a curve at the first tick of such a gap.
 *
 * That tick is not hypothetical. `accentuationDistance` and `rubatoDistance` call their
 * `*SegmentAt` at `cellStart`, and a cell starts at a grid breakpoint — and every skipped
 * instruction contributes its own date as a breakpoint precisely so the gap it opens gets a cell
 * boundary. So the first tick of a gap IS a probe point, on every comparison of a document with
 * a skipped instruction in it. Under `<=` the expired segment answers there, which for
 * accentuation means the cell inherits the previous span's `⊥`-ness (`accentuationDistance`
 * reads `?.pattern.kind === 'bottom'` off exactly that call) and reports a `⊥` length no
 * renderer performs.
 *
 * The cases below therefore probe each curve at a segment's own `endTicks` with a gap after it,
 * and at the two non-finite ticks the module header reasons about.
 */
import { describe, it, expect } from 'vitest';
import { readComparisonPair, readScopeMapViews } from '../../src/comparison/document.js';
import type { ComparisonDocument, ComparisonPair } from '../../src/comparison/document.js';
import {
  accentuationSegmentAt,
  readAccentuationSegments,
} from '../../src/comparison/accentuationCurve.js';
import { readRubatoSegments, rubatoSegmentAt } from '../../src/comparison/rubatoCurve.js';
import { pedalSegmentAt, readMovementSegments } from '../../src/comparison/pedalCurve.js';

const NS = 'http://www.cemfi.de/mpm/ns/1.0';
const PPQ = 720;

const doc = (mapName: string, body: string, header = '') =>
  `<mpm xmlns="${NS}"><performance name="p" pulsesPerQuarter="${String(PPQ)}">` +
  `<global><header>${header}</header><dated><${mapName}>${body}</${mapName}></dated></global>` +
  '</performance></mpm>';

const scopeOf = (pair: ComparisonPair) => {
  const document: ComparisonDocument = pair.a;
  const scope = document.scopes.find((candidate) => candidate.scope === 'global');
  if (scope === undefined) throw new Error('no global scope');
  return { document, scope };
};

const ACCENTUATION_STYLES =
  '<metricalAccentuationStyles><styleDef name="M">' +
  '<accentuationPatternDef name="p" length="4.0"><accentuation beat="1" value="20"/>' +
  '</accentuationPatternDef></styleDef></metricalAccentuationStyles>';

/** A valid instruction at 0, a SKIPPED one at 720, a valid one at 1440. */
const accentuationCurve = () => {
  const { document, scope } = scopeOf(
    readComparisonPair({
      a: doc(
        'metricalAccentuationMap',
        '<style date="0.0" name.ref="M"/>' +
          '<accentuationPattern date="0.0" name.ref="p" scale="1.0"/>' +
          // No @name.ref: getMetricalAccentuationDataOf returns null and the renderer skips it,
          // so this instruction ends the span above and opens a gap rather than a segment.
          '<accentuationPattern date="720.0" scale="1.0"/>' +
          '<accentuationPattern date="1440.0" name.ref="p" scale="1.0"/>',
        ACCENTUATION_STYLES,
      ),
    }),
  );
  return readAccentuationSegments(
    readScopeMapViews(scope).get('metricalAccentuationMap') ?? null,
    document.scaleFactor,
    scope.environment,
    document.performance.global,
  );
};

/** A valid instruction at 0, a SKIPPED one at 720 (no @frameLength), a valid one at 1440. */
const rubatoCurve = () => {
  const { document, scope } = scopeOf(
    readComparisonPair({
      a: doc(
        'rubatoMap',
        '<rubato date="0.0" frameLength="360.0" lateStart="0.25" earlyEnd="0.75"/>' +
          '<rubato date="720.0"/>' +
          '<rubato date="1440.0" frameLength="360.0" lateStart="0.25" earlyEnd="0.75"/>',
      ),
    }),
  );
  return readRubatoSegments(
    readScopeMapViews(scope).get('rubatoMap') ?? null,
    document.scaleFactor,
    scope.environment,
    document.performance.global,
  );
};

const pedalCurve = () => {
  const { document, scope } = scopeOf(
    readComparisonPair({
      a: doc(
        'movementMap',
        // The leading <style> is what makes the movement at 0 entry ONE, so that
        // `getPreviousPosition`'s `j > 0` bound can reach it — see below.
        '<style date="0.0" name.ref="x"/>' +
          '<movement date="0.0" position="1.0"/>' +
          // A SKIPPED movement: no @position, and its predecessor carries no @transition.to to
          // inherit one from, so `getMovementDataOf` returns null and it renders nothing. But
          // `getEndDate` still finds it, so the span above ends at 720 while nothing new is
          // emitted — the previous value HOLDS from 720 (§5.8).
          '<movement date="720.0"/>' +
          '<movement date="1440.0" position="0.5"/>' +
          // An entry after the last <movement>, so that movement is not the last ENTRY and is
          // not excluded by AD-35's `movementIndex < size() - 1` guard.
          '<style date="2160.0" name.ref="y"/>',
      ),
    }),
  );
  return readMovementSegments(
    readScopeMapViews(scope).get('movementMap') ?? null,
    document.scaleFactor,
  );
};

describe('the segment lookup is half-open: [start, end)', () => {
  it('accentuation: the span ends AT its endTicks, and the gap after it has no segment', () => {
    const curve = accentuationCurve();
    // The shape the rest of this case rests on: a span [0, 720) and a span [1440, ∞), with the
    // skipped instruction's date opening a gap between them.
    expect(curve.segments.map((segment) => [segment.startTicks, segment.endTicks])).toEqual([
      [0, 720],
      [1440, Number.POSITIVE_INFINITY],
    ]);

    expect(accentuationSegmentAt(curve, 719.999)?.startTicks).toBe(0);
    // The tick under test. `<= endTicks` answers with the expired span here.
    expect(accentuationSegmentAt(curve, 720)).toBeNull();
    expect(accentuationSegmentAt(curve, 1439.999)).toBeNull();
    expect(accentuationSegmentAt(curve, 1440)?.startTicks).toBe(1440);
  });

  it('rubato: the same, on a curve whose skipped instruction leaves an unwarped gap', () => {
    const curve = rubatoCurve();
    expect(curve.segments.map((segment) => [segment.startTicks, segment.endTicks])).toEqual([
      [0, 720],
      [1440, Number.POSITIVE_INFINITY],
    ]);

    expect(rubatoSegmentAt(curve, 719.999)?.startTicks).toBe(0);
    expect(rubatoSegmentAt(curve, 720)).toBeNull();
    expect(rubatoSegmentAt(curve, 1439.999)).toBeNull();
    expect(rubatoSegmentAt(curve, 1440)?.startTicks).toBe(1440);
  });

  it('pedal: a span ends at its endTicks and the HOLD takes over at exactly that tick', () => {
    const curve = pedalCurve();
    // The pedal timeline has no gaps — a skipped movement leaves a hold — so the boundary tick
    // must land on the hold and never on the span that has just expired.
    expect(pedalSegmentAt(curve, 719.999)?.source).toBe('movement');
    expect(pedalSegmentAt(curve, 720)?.source).toBe('hold');
    expect(pedalSegmentAt(curve, 1439.999)?.source).toBe('hold');
    expect(pedalSegmentAt(curve, 1440)?.source).toBe('movement');
  });

  it('answers null before the first segment and at the two non-finite ticks', () => {
    const accentuation = accentuationCurve();
    const rubato = rubatoCurve();
    const pedal = pedalCurve();
    for (const at of [
      accentuationSegmentAt(accentuation, -1),
      accentuationSegmentAt(accentuation, Number.NaN),
      accentuationSegmentAt(accentuation, Number.POSITIVE_INFINITY),
      rubatoSegmentAt(rubato, -1),
      rubatoSegmentAt(rubato, Number.NaN),
      rubatoSegmentAt(rubato, Number.POSITIVE_INFINITY),
      pedalSegmentAt(pedal, -1),
      pedalSegmentAt(pedal, Number.NaN),
      pedalSegmentAt(pedal, Number.POSITIVE_INFINITY),
    ])
      expect(at).toBeNull();
  });
});
