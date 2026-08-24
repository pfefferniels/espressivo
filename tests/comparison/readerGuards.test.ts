/**
 * Two reader guards, and the negative controls that found the suite blind to them.
 *
 * Deleting each guard — replacing its rejection test with `if (false) return null`, so every
 * malformed child survives into the reader's output — left `tests/comparison` green. Every
 * document the suite builds writes well-formed numerals, and so does the vendored corpus, so no
 * test ever handed either reader a child its guard could reject.
 *
 * ## 1. `readTimeSignatures` — `msm.ts`
 *
 * A `<timeSignature>` with an unusable `@numerator`/`@denominator` is DROPPED rather than
 * repaired. `measureGrid` skips a span whose length is not positive, so a `NaN` entry
 * contributes no measures — but it is still in `timeSignatures`, and two published things read
 * that array directly:
 *
 * - {@link beatGridOf} takes the FIRST entry as the accentuation phase anchor. A `NaN`
 *   numerator there is a phase anchor that makes every accentuation position `NaN`, in a
 *   dimension that reports a distance.
 * - `compare`'s `estimate-degradation` note counts `timeSignatures.length`, so a malformed entry
 *   makes a single-signature score report itself as a multi-signature one.
 *
 * ## 2. `readAccentuationPattern` — `accentuationCurve.ts`
 *
 * An `<accentuation>` with no `@beat` is skipped exactly as the parser skips it. A surviving
 * `NaN`-beat point poisons the dimension through {@link accentuationAt}'s backwards scan: both
 * of that scan's tests fail against `NaN` — `beatPosition === point.beat` and
 * `beatPosition > point.beat` are false — so the scan neither returns nor breaks, it records
 * `found = point` and walks on. Reach index 0 that way and `found` is the `NaN` point, whose
 * `(beatPosition − found.beat)` makes the contribution `NaN`. The early
 * `beatPosition < head(points).beat` return does not save it either, for the same reason.
 *
 * Each case is therefore asserted at the reader's own output AND at the consumer that would
 * carry the poison into a report field.
 */
import { describe, it, expect } from 'vitest';
import { Builder } from '../../src/xml/XomTypes.js';
import { beatGridOf, readComparisonMsm, parseMsmRoot } from '../../src/comparison/msm.js';
import { accentuationAt, readAccentuationPattern } from '../../src/comparison/accentuationCurve.js';

const PPQ = 720;
const NS = 'http://www.cemfi.de/mpm/ns/1.0';

/** An MSM whose global `timeSignatureMap` holds exactly the given `<timeSignature>` bodies. */
const msmWith = (...signatures: readonly string[]): string =>
  `<?xml version="1.0" encoding="UTF-8"?>` +
  `<msm title="guard" pulsesPerQuarter="${String(PPQ)}">` +
  `<global><header/><dated><timeSignatureMap>${signatures.join('')}</timeSignatureMap></dated></global>` +
  `<part name="p" number="1" midi.channel="0" midi.port="0"><header/><dated><score>` +
  `<note date="0.0" midi.pitch="60.0" duration="${String(PPQ * 32)}"/>` +
  `</score></dated></part>` +
  `</msm>`;

const readOf = (...signatures: readonly string[]) =>
  readComparisonMsm(parseMsmRoot(msmWith(...signatures)));

const GOOD = '<timeSignature date="0.0" numerator="3" denominator="4"/>';

describe('readTimeSignatures drops what it cannot use', () => {
  it('keeps a well-formed entry — the control that says the rejections below are selective', () => {
    const msm = readOf(GOOD);
    expect(msm.timeSignatures).toEqual([{ startQuarters: 0, numerator: 3, denominator: 4 }]);
    expect(beatGridOf(msm, PPQ)).toEqual({
      tsDate: 0,
      numerator: 3,
      denominator: 4,
      source: 'msm',
    });
  });

  it.each([
    ['an unparseable @numerator', '<timeSignature date="0.0" numerator="x" denominator="4"/>'],
    ['an absent @numerator', '<timeSignature date="0.0" denominator="4"/>'],
    ['an unparseable @denominator', '<timeSignature date="0.0" numerator="3" denominator="y"/>'],
    ['an absent @denominator', '<timeSignature date="0.0" numerator="3"/>'],
    ['a zero @numerator', '<timeSignature date="0.0" numerator="0" denominator="4"/>'],
    ['a zero @denominator', '<timeSignature date="0.0" numerator="3" denominator="0"/>'],
    ['a negative @numerator', '<timeSignature date="0.0" numerator="-3" denominator="4"/>'],
    ['a negative @denominator', '<timeSignature date="0.0" numerator="3" denominator="-4"/>'],
    ['an unparseable @date', '<timeSignature date="soon" numerator="3" denominator="4"/>'],
    ['an absent @date', '<timeSignature numerator="3" denominator="4"/>'],
  ])('drops a <timeSignature> with %s', (_what, signature) => {
    expect(readOf(signature).timeSignatures).toEqual([]);
  });

  it('falls back to the renderer default when every entry is unusable', () => {
    const msm = readOf('<timeSignature date="0.0" numerator="NaN" denominator="4"/>');
    expect(msm.timeSignatures).toEqual([]);
    // 4/4 at 0 — the same answer an MSM with no map at all gets.
    expect(msm.measures[0]).toEqual({
      number: 1,
      startQuarters: 0,
      timeSignature: { numerator: 4, denominator: 4 },
    });
    // …and no phase anchor at all, rather than one built from the rejected entry.
    expect(beatGridOf(msm, PPQ)).toBeNull();
  });

  it('anchors the phase to the first USABLE entry, not the first entry', () => {
    // The malformed entry is earlier in document order and at an earlier date, so a reader
    // that kept it would hand `beatGridOf` a NaN numerator.
    const msm = readOf(
      '<timeSignature date="0.0" numerator="?" denominator="4"/>',
      '<timeSignature date="1440.0" numerator="7" denominator="8"/>',
    );
    expect(msm.timeSignatures).toEqual([{ startQuarters: 2, numerator: 7, denominator: 8 }]);
    expect(beatGridOf(msm, PPQ)).toEqual({
      tsDate: 2 * PPQ,
      numerator: 7,
      denominator: 8,
      source: 'msm',
    });
  });

  it('does not let a malformed entry inflate the signature COUNT', () => {
    const msm = readOf(GOOD, '<timeSignature date="2880.0" numerator="four" denominator="4"/>');
    expect(msm.timeSignatures).toHaveLength(1);
  });

  it('puts no NaN into any published measure field', () => {
    const msm = readOf(GOOD, '<timeSignature date="2880.0" numerator="3" denominator="zero"/>');
    expect(msm.measures.length).toBeGreaterThan(4);
    for (const measure of msm.measures)
      expect({
        finiteStart: Number.isFinite(measure.startQuarters),
        finiteNumber: Number.isFinite(measure.number),
        signature: measure.timeSignature,
      }).toEqual({
        finiteStart: true,
        finiteNumber: true,
        signature: { numerator: 3, denominator: 4 },
      });
  });
});

const defOf = (body: string, length = '4.0') =>
  readAccentuationPattern(
    new Builder()
      .build(
        `<accentuationPatternDef xmlns="${NS}" name="p" length="${length}">${body}</accentuationPatternDef>`,
      )
      .getRootElement(),
  );

describe('readAccentuationPattern drops an <accentuation> with no usable @beat', () => {
  it('keeps well-formed points — the control that says the rejections below are selective', () => {
    const pattern = defOf(
      '<accentuation beat="1" value="20"/><accentuation beat="3" value="-10"/>',
    );
    expect(pattern.points.map((point) => point.beat)).toEqual([1, 3]);
  });

  it.each([
    ['an absent @beat', '<accentuation value="20"/>'],
    ['an unparseable @beat', '<accentuation beat="downbeat" value="20"/>'],
    ['an empty @beat', '<accentuation beat="" value="20"/>'],
  ])('drops an <accentuation> with %s', (_what, body) => {
    expect(defOf(body).points).toEqual([]);
  });

  it('drops only the unusable child, keeping the rest in beat order', () => {
    const pattern = defOf(
      '<accentuation beat="3" value="-10"/>' +
        '<accentuation value="99"/>' +
        '<accentuation beat="1" value="20"/>',
    );
    expect(pattern.points.map((point) => point.beat)).toEqual([1, 3]);
  });

  it('leaves the contribution finite where an unguarded NaN point would poison it', () => {
    // With the beat-less child kept, `accentuationAt` walks past it (neither of its two tests
    // holds against NaN), reaches index 0 with `found` set to the NaN point, and returns NaN
    // from `beatPosition − found.beat`.
    const pattern = defOf('<accentuation value="99"/><accentuation beat="1" value="20"/>');
    const sampled = [0.5, 1, 1.5, 2, 3.25, 4, 4.99].map((beat) => accentuationAt(pattern, beat));
    expect(sampled.every((value) => Number.isFinite(value))).toBe(true);
    // …and it is the surviving point's own contribution, not merely something finite.
    expect(accentuationAt(pattern, 1)).toBe(20);
  });

  it('reports the neutral 0 when the ONLY child is unusable', () => {
    // An empty point list contributes nothing, which is the answer an absent map gives too.
    const pattern = defOf('<accentuation value="99"/>');
    expect(pattern.points).toEqual([]);
    expect(accentuationAt(pattern, 2.5)).toBe(0);
  });
});
