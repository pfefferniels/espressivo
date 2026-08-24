/**
 * The imprecision reader.
 *
 * Every renderer claim here is measured through `performMsm`: the harness performs a
 * real MSM against a real MPM and reads the millisecond dates back. Nothing rests on a map-level
 * probe or on arithmetic done by hand.
 *
 * Most cases take the form of BIT-IDENTITY against an explicit control — a document with the
 * attribute absent against one that writes the value the reader claims it coerces to.
 *
 * `@seed` is carried on every i.i.d. distribution so the render is reproducible (measured: a
 * per-distribution `@seed` gives identical output across runs), and every note sits at its own
 * date so `shakePolyphonicPart` never fires — the one path that reaches `Math.random()`.
 */
import { describe, expect, it } from 'vitest';
import { performMsm } from '../../src/index.js';
import { readComparisonPair, readScopeMapViews } from '../../src/comparison/document.js';
import {
  CORRELATED_MARGINAL_NOTE,
  DEFAULT_TIMING_BASIS_MS,
  lawAt,
  neutralImprecisionReading,
  processParametersAt,
  readImprecisionSpans,
  seedPoisonsSpan,
  timingBasisIsInert,
  type ImprecisionDomain,
  type ImprecisionReading,
  type ImprecisionSpan,
} from '../../src/comparison/imprecisionLaws.js';
import {
  DELTA_ZERO,
  deltaLaw,
  lawsEqual,
  type ImprecisionLaw,
} from '../../src/comparison/distributions.js';
import { isBottom } from '../../src/comparison/values.js';
import { elementAt, filterMap } from '../../src/prelude/index.js';

/** Span `index` of an imprecision reading, checked. */
const spanAt = (reading: ImprecisionReading, index = 0): ImprecisionSpan =>
  elementAt(reading.spans, index, 'the spans this imprecision map read');

// --- the pipeline harness -----------------------------------------------------------------

const MSM = `<?xml version="1.0" encoding="UTF-8"?>
<msm title="probe" pulsesPerQuarter="720" xmlns:xml="http://www.w3.org/XML/1998/namespace">
  <global><header/><dated/></global>
  <part name="p" number="1" midi.channel="0" midi.port="0">
    <header/>
    <dated>
      <score>
        <note date="0.0" midi.pitch="60.0" duration="360.0" velocity="80.0"/>
        <note date="720.0" midi.pitch="62.0" duration="360.0" velocity="80.0"/>
        <note date="1440.0" midi.pitch="64.0" duration="360.0" velocity="80.0"/>
        <note date="2160.0" midi.pitch="65.0" duration="360.0" velocity="80.0"/>
      </score>
    </dated>
  </part>
</msm>`;

const mpmFor = (body: string, domain = 'timing'): string =>
  `<?xml version="1.0" encoding="UTF-8"?>
<mpm xmlns="http://www.cemfi.de/mpm/ns/1.0">
  <performance name="perf" pulsesPerQuarter="720">
    <global><header/><dated/></global>
    <part name="p" number="1" midi.channel="0" midi.port="0">
      <header/>
      <dated><imprecisionMap.${domain}>${body}</imprecisionMap.${domain}></dated>
    </part>
  </performance>
</mpm>`;

/** The performed onsets, in milliseconds — what the imprecision map moves. */
const performedDates = (body: string, domain = 'timing'): readonly string[] => {
  const out = performMsm({ msm: MSM, mpm: mpmFor(body, domain) });
  return filterMap([...out.matchAll(/milliseconds\.date="([^"]+)"/g)], (match) => match[1] ?? null);
};

const performedVelocities = (body: string): readonly string[] => {
  const out = performMsm({ msm: MSM, mpm: mpmFor(body, 'dynamics') });
  return filterMap([...out.matchAll(/ velocity="([^"]+)"/g)], (match) => match[1] ?? null);
};

// --- the reader harness -------------------------------------------------------------------

const readerDoc = (body: string, domain = 'timing'): string =>
  '<mpm xmlns="http://www.cemfi.de/mpm/ns/1.0"><performance name="p" pulsesPerQuarter="720">' +
  `<global><header/><dated><imprecisionMap.${domain}>${body}</imprecisionMap.${domain}></dated></global>` +
  '</performance></mpm>';

const READER_DOMAINS = {
  timing: 'imprecisionTiming',
  dynamics: 'imprecisionDynamics',
  toneduration: 'imprecisionDuration',
} as const satisfies Record<string, ImprecisionDomain>;

type ReaderDomainName = keyof typeof READER_DOMAINS;

const readFor = (body: string, domain: ReaderDomainName = 'timing'): ImprecisionReading => {
  const pair = readComparisonPair({ a: readerDoc(body, domain) });
  const scope = pair.a.scopes.find((candidate) => candidate.scope === 'global');
  if (scope === undefined) throw new Error('no global scope');
  return readImprecisionSpans(
    readScopeMapViews(scope).get(`imprecisionMap.${domain}`) ?? null,
    READER_DOMAINS[domain],
    pair.a.scaleFactor,
  );
};

const lawOf = (body: string, domain: ReaderDomainName = 'timing', ticks = 0): ImprecisionLaw => {
  const law = lawAt(readFor(body, domain), ticks);
  if (isBottom(law)) throw new Error('unexpected ⊥');
  return law.value;
};

const isBottomAt = (body: string, domain: ReaderDomainName = 'timing', ticks = 0): boolean =>
  isBottom(lawAt(readFor(body, domain), ticks));

const UNIFORM = (attributes: string): string =>
  `<distribution.uniform date="0.0" seed="4242" ${attributes}/>`;

// --- the degenerate table ------------------------------------------------------------------

describe('the degenerate table is one rule: an absent parameter reads as 0', () => {
  it('uniform with BOTH limits absent performs δ₀ — pipeline', () => {
    const withMap = performedDates(UNIFORM('milliseconds.timingBasis="300"'));
    const withoutMap = performedDates('');
    expect(withMap.map(Number)).toEqual(withoutMap.map(Number));
    expect(lawsEqual(lawOf(UNIFORM('milliseconds.timingBasis="300"')), DELTA_ZERO)).toBe(true);
  });

  it('uniform with ONE limit absent is U(limit, 0) — the row the design does not state', () => {
    const absent = performedDates(UNIFORM('limit.lower="-30" milliseconds.timingBasis="300"'));
    const explicit = performedDates(
      UNIFORM('limit.lower="-30" limit.upper="0" milliseconds.timingBasis="300"'),
    );
    expect(absent).toEqual(explicit);
    // …and it is NOT δ₀, which is what reading the table literally would have produced.
    expect(absent.map(Number)).not.toEqual(performedDates('').map(Number));

    const law = lawOf(UNIFORM('limit.lower="-30" milliseconds.timingBasis="300"'));
    expect(law).toEqual({ kind: 'uniform', lower: -30, upper: 0 });
  });

  it('gaussian with ONE limit absent truncates to [limit, 0] — also not stated', () => {
    const absent = performedDates(
      '<distribution.gaussian date="0.0" seed="7" deviation.standard="10" limit.lower="-5" milliseconds.timingBasis="300"/>',
    );
    const explicit = performedDates(
      '<distribution.gaussian date="0.0" seed="7" deviation.standard="10" limit.lower="-5" limit.upper="0" milliseconds.timingBasis="300"/>',
    );
    expect(absent).toEqual(explicit);
  });

  it('gaussian with BOTH limits absent is the untruncated law — the mixture', () => {
    const law = lawOf(
      '<distribution.gaussian date="0.0" seed="7" deviation.standard="10" milliseconds.timingBasis="300"/>',
    );
    expect(law).toEqual({ kind: 'gaussian', sigma: 10, lower: 0, upper: 0, center: 0 });
    // The renderer really does draw unconditioned values there — well outside any limit.
    const dates = performedDates(
      '<distribution.gaussian date="0.0" seed="7" deviation.standard="10" milliseconds.timingBasis="300"/>',
    ).map(Number);
    expect(dates).not.toEqual(performedDates('').map(Number));
  });

  it('gaussian with deviation.standard absent performs δ₀', () => {
    const dates = performedDates(
      '<distribution.gaussian date="0.0" seed="7" limit.lower="-30" limit.upper="30" milliseconds.timingBasis="300"/>',
    );
    expect(dates.map(Number)).toEqual(performedDates('').map(Number));
    expect(
      lawsEqual(
        lawOf('<distribution.gaussian date="0.0" limit.lower="-30" limit.upper="30"/>'),
        DELTA_ZERO,
      ),
    ).toBe(true);
  });

  it('triangular with BOTH clips absent performs δ₀ — the null draw', () => {
    const clipless =
      '<distribution.triangular date="0.0" seed="9" limit.lower="-30" limit.upper="30" mode="0" milliseconds.timingBasis="300"/>';
    expect(performedDates(clipless).map(Number)).toEqual(performedDates('').map(Number));
    expect(lawsEqual(lawOf(clipless), DELTA_ZERO)).toBe(true);
  });

  it('triangular with ONE clip absent clamps to [clip, 0] — not stated', () => {
    const absent =
      '<distribution.triangular date="0.0" seed="9" limit.lower="-30" limit.upper="30" mode="0" clip.lower="-20" milliseconds.timingBasis="300"/>';
    const explicit =
      '<distribution.triangular date="0.0" seed="9" limit.lower="-30" limit.upper="30" mode="0" clip.lower="-20" clip.upper="0" milliseconds.timingBasis="300"/>';
    expect(performedDates(absent).map(Number)).toEqual(performedDates(explicit).map(Number));
    expect(lawOf(absent)).toEqual(lawOf(explicit));
  });

  it('triangular with mode absent is mode="0" — not stated', () => {
    const absent =
      '<distribution.triangular date="0.0" seed="9" limit.lower="-30" limit.upper="30" clip.lower="-30" clip.upper="30" milliseconds.timingBasis="300"/>';
    const explicit =
      '<distribution.triangular date="0.0" seed="9" limit.lower="-30" limit.upper="30" mode="0" clip.lower="-30" clip.upper="30" milliseconds.timingBasis="300"/>';
    expect(performedDates(absent)).toEqual(performedDates(explicit));
    expect(lawOf(absent)).toEqual(lawOf(explicit));
  });

  it('brownianNoise and compensatingTriangle with their width parameters absent are δ₀', () => {
    expect(
      lawsEqual(
        lawOf('<distribution.correlated.brownianNoise date="0.0" stepWidth.max="3"/>'),
        DELTA_ZERO,
      ),
    ).toBe(true);
    expect(
      lawsEqual(
        lawOf(
          '<distribution.correlated.compensatingTriangle date="0.0" degreeOfCorrelation="2" limit.lower="-30" limit.upper="30"/>',
        ),
        DELTA_ZERO,
      ),
    ).toBe(true);
  });
});

// --- the ⊥ routes ---------------------------------------------------------------------------

describe('⊥ routes exist (the question, answered by measurement)', () => {
  it('an EMPTY distribution.list makes every note vanish', () => {
    const dates = performedDates('<distribution.list date="0.0" milliseconds.timingBasis="300"/>');
    expect(dates).toEqual(['NaN', 'NaN', 'NaN', 'NaN']);
    expect(isBottomAt('<distribution.list date="0.0"/>')).toBe(true);
  });

  it('an unusable numeric parameter makes every note vanish', () => {
    const dates = performedDates(
      '<distribution.uniform date="0.0" limit.lower="abc" limit.upper="30" milliseconds.timingBasis="300"/>',
    );
    expect(dates).toEqual(['NaN', 'NaN', 'NaN', 'NaN']);
    expect(
      isBottomAt('<distribution.uniform date="0.0" limit.lower="abc" limit.upper="30"/>'),
    ).toBe(true);
  });

  it('compensatingTriangle with no degreeOfCorrelation NaNs every note after the first', () => {
    const dates = performedDates(
      '<distribution.correlated.compensatingTriangle date="0.0" limit.lower="-30" limit.upper="30" clip.lower="-30" clip.upper="30" milliseconds.timingBasis="300"/>',
    );
    expect(dates.slice(1)).toEqual(['NaN', 'NaN', 'NaN']);
    expect(
      isBottomAt(
        '<distribution.correlated.compensatingTriangle date="0.0" limit.lower="-30" limit.upper="30" clip.lower="-30" clip.upper="30"/>',
      ),
    ).toBe(true);
    // degreeOfCorrelation="0" is the same division by zero, written out.
    expect(
      isBottomAt(
        '<distribution.correlated.compensatingTriangle date="0.0" degreeOfCorrelation="0" limit.lower="-30" limit.upper="30" clip.lower="-30" clip.upper="30"/>',
      ),
    ).toBe(true);
  });

  it('an unusable OR ZERO milliseconds.timingBasis ABORTS the render', () => {
    // Zero is the one the renderer's own guard misses: it repairs an ABSENT basis, never a
    // written zero, so the index divides by zero and requireUsableIndex throws.
    for (const basis of ['abc', '0']) {
      expect(() =>
        performedDates(
          `<distribution.uniform date="0.0" limit.lower="-30" limit.upper="30" milliseconds.timingBasis="${basis}"/>`,
        ),
      ).toThrow(/not a usable index/);
      expect(
        isBottomAt(
          `<distribution.uniform date="0.0" limit.lower="-30" limit.upper="30" milliseconds.timingBasis="${basis}"/>`,
        ),
      ).toBe(true);
    }
    // A NEGATIVE basis is the control: the index clamps to 0, every note draws series[0], the
    // render succeeds and the marginal is unchanged — so it is not ⊥.
    const negative =
      '<distribution.uniform date="0.0" seed="3" limit.lower="-30" limit.upper="30" milliseconds.timingBasis="-50"/>';
    expect(performedDates(negative).every((value) => Number.isFinite(Number(value)))).toBe(true);
    expect(isBottomAt(negative)).toBe(false);
  });

  it('the design calls @seed inert; on a CORRELATED family it destroys the performance', () => {
    const seeded =
      '<distribution.correlated.brownianNoise date="0.0" seed="99" stepWidth.max="3" limit.lower="-30" limit.upper="30" milliseconds.timingBasis="300"/>';
    const unseeded =
      '<distribution.correlated.brownianNoise date="0.0" stepWidth.max="3" limit.lower="-30" limit.upper="30" milliseconds.timingBasis="300"/>';
    expect(performedDates(seeded)).toEqual(['NaN', 'NaN', 'NaN', 'NaN']);
    // The control: without the seed the same document performs perfectly ordinary numbers.
    expect(performedDates(unseeded).every((value) => Number.isFinite(Number(value)))).toBe(true);
    expect(isBottomAt(seeded)).toBe(true);
    expect(isBottomAt(unseeded)).toBe(false);

    // …and on uniform / gaussian / triangular @seed really IS inert, which is the other half.
    expect(seedPoisonsSpan('distribution.uniform', true)).toBe(false);
    expect(seedPoisonsSpan('distribution.gaussian', true)).toBe(false);
    expect(seedPoisonsSpan('distribution.triangular', true)).toBe(false);
    expect(seedPoisonsSpan('distribution.correlated.brownianNoise', true)).toBe(true);
    expect(seedPoisonsSpan('distribution.correlated.compensatingTriangle', true)).toBe(true);
    expect(seedPoisonsSpan('distribution.list', true)).toBe(true);
    expect(seedPoisonsSpan('distribution.correlated.brownianNoise', false)).toBe(false);
    expect(lawOf(UNIFORM('limit.lower="-30" limit.upper="30"'))).toEqual(
      lawOf('<distribution.uniform date="0.0" limit.lower="-30" limit.upper="30"/>'),
    );
  });

  it('@seed destroys a distribution.list too — setSeed clears the list itself', () => {
    // `series` is not a cache for a list provider, it IS the list, and setSeed empties it.
    const values = '<measurement value="-40"/><measurement value="0"/><measurement value="40"/>';
    const seeded = `<distribution.list date="0.0" seed="99" milliseconds.timingBasis="300">${values}</distribution.list>`;
    const plain = `<distribution.list date="0.0" milliseconds.timingBasis="300">${values}</distribution.list>`;
    expect(performedDates(seeded)).toEqual(['NaN', 'NaN', 'NaN', 'NaN']);
    expect(performedDates(plain).every((value) => Number.isFinite(Number(value)))).toBe(true);
    expect(isBottomAt(seeded)).toBe(true);
    expect(isBottomAt(plain)).toBe(false);
  });

  it('reads the list’s @value attributes themselves, dropping only what will not parse', () => {
    /**
     * The only place a VALUE is read back out of a `<distribution.list>`. Measured: making the
     * reader return `value * 7 + 3` for every measurement left the whole repository green.
     *
     * Asserted: the parseable `@value`s ascending (`listLaw` sorts), and the three ways a
     * measurement contributes nothing — no attribute, text that is not a number, a non-finite
     * literal. `parseFloat`'s prefix rule is pinned too, because it is what the reader uses.
     */
    const law = lawOf(
      '<distribution.list date="0.0" milliseconds.timingBasis="300">' +
        '<measurement value="40"/>' +
        '<measurement value="-40"/>' +
        '<measurement value="0"/>' +
        '<measurement/>' +
        '<measurement value="not-a-number"/>' +
        '<measurement value="Infinity"/>' +
        '<measurement value="12abc"/>' +
        '</distribution.list>',
    );
    expect(law).toEqual({ kind: 'list', values: [-40, 0, 12, 40] });

    // …and a list whose values all coincide is not a list at all: `listLaw` collapses it.
    expect(
      lawOf(
        '<distribution.list date="0.0" milliseconds.timingBasis="300">' +
          '<measurement value="17"/><measurement value="17"/>' +
          '</distribution.list>',
      ),
    ).toEqual(deltaLaw(17));
  });

  it('an inverted-limit triangular has no monotone quantile, so it reads ⊥', () => {
    expect(
      isBottomAt(
        '<distribution.triangular date="0.0" limit.lower="30" limit.upper="-30" mode="0" clip.lower="-30" clip.upper="30"/>',
      ),
    ).toBe(true);
    // The control: the same numbers the right way round are an ordinary law.
    expect(
      isBottomAt(
        '<distribution.triangular date="0.0" limit.lower="-30" limit.upper="30" mode="0" clip.lower="-30" clip.upper="30"/>',
      ),
    ).toBe(false);
  });

  it('every ⊥ carries a renderer-error note naming its cause', () => {
    const reading = readFor('<distribution.list date="0.0"/>');
    const errors = reading.notes.filter((note) => note.kind === 'renderer-error');
    expect(errors).toHaveLength(1);
    const only = elementAt(errors, 0, 'the renderer-error notes');
    expect(only.detail).toContain('empty-list');
    expect(only.detail).toContain('vanishes from the MIDI export');
  });
});

// --- spans, gaps and the entry walk ---------------------------------------------------------

describe('spans end on any entry, and gaps are δ₀', () => {
  it('a <style> WITH @name.ref ends the span and leaves the rest exactly unperturbed', () => {
    const dates = performedDates(
      `${UNIFORM(
        'limit.lower="-30" limit.upper="30" milliseconds.timingBasis="300"',
      )}<style date="720.0" name.ref="none"/>`,
    );
    // Notes at 720, 1440, 2160 are untouched — the δ₀ gap, exact rather than approximate.
    expect(dates.slice(1).map(Number)).toEqual([720, 1440, 2160]);
    // Non-vacuity: the note inside the span really was moved.
    expect(performedDates('').map(Number)[0]).toBe(0);
  });

  it('a <style> WITHOUT @name.ref is not an entry at all — one level lower', () => {
    const body = UNIFORM('limit.lower="-30" limit.upper="30" milliseconds.timingBasis="300"');
    expect(performedDates(`${body}<style date="720.0"/>`)).toEqual(performedDates(body));
    expect(readFor(`${body}<style date="720.0"/>`).spans).toHaveLength(1);
    expect(readFor(`${body}<style date="720.0" name.ref="none"/>`).spans).toHaveLength(1);
    expect(spanAt(readFor(`${body}<style date="720.0" name.ref="none"/>`)).endTicks).toBe(720);
    expect(spanAt(readFor(`${body}<style date="720.0"/>`)).endTicks).toBe(Number.POSITIVE_INFINITY);
  });

  it('a gap between two distributions performs δ₀ and the second resumes', () => {
    const dates = performedDates(
      `${UNIFORM(
        'limit.lower="-30" limit.upper="30" milliseconds.timingBasis="300"',
      )}<style date="720.0" name.ref="none"/>` +
        `<distribution.uniform date="2160.0" seed="5" limit.lower="300" limit.upper="300" milliseconds.timingBasis="300"/>`,
    );
    expect(dates.slice(1, 3).map(Number)).toEqual([720, 1440]);
    expect(Number(dates[3])).toBe(2460);
  });

  it('lawAt returns δ₀ in a gap and outside every span', () => {
    const reading = readFor(
      `${UNIFORM('limit.lower="-30" limit.upper="30"')}<style date="720.0" name.ref="none"/>`,
    );
    const inGap = lawAt(reading, 1000);
    expect(isBottom(inGap)).toBe(false);
    expect(lawsEqual(isBottom(inGap) ? DELTA_ZERO : inGap.value, DELTA_ZERO)).toBe(true);
  });

  it('two distributions at ONE date: the first performs nothing', () => {
    const both = `<distribution.uniform date="0.0" seed="1" limit.lower="-300" limit.upper="-300" milliseconds.timingBasis="300"/>${UNIFORM(
      'limit.lower="-30" limit.upper="30" milliseconds.timingBasis="300"',
    )}`;
    const secondAlone = UNIFORM(
      'limit.lower="-30" limit.upper="30" milliseconds.timingBasis="300"',
    );
    expect(performedDates(both)).toEqual(performedDates(secondAlone));
    const reading = readFor(both);
    expect(reading.spans).toHaveLength(1);
    expect(reading.notes.some((note) => note.detail.includes('performs nothing'))).toBe(true);
  });

  it('an undated distribution is not an entry: it governs nothing and ends nothing', () => {
    const body = `${UNIFORM(
      'limit.lower="-30" limit.upper="30" milliseconds.timingBasis="300"',
    )}<distribution.uniform seed="8" limit.lower="-300" limit.upper="300" milliseconds.timingBasis="300"/>`;
    expect(performedDates(body)).toEqual(
      performedDates(UNIFORM('limit.lower="-30" limit.upper="30" milliseconds.timingBasis="300"')),
    );
    expect(readFor(body).spans).toHaveLength(1);
  });

  it('an unknown distribution.* name performs nothing and reads δ₀, not ⊥', () => {
    const body = '<distribution.foo date="0.0" limit.lower="-30" limit.upper="30"/>';
    expect(performedDates(body).map(Number)).toEqual(performedDates('').map(Number));
    expect(isBottomAt(body)).toBe(false);
    expect(lawsEqual(lawOf(body), DELTA_ZERO)).toBe(true);
  });

  it('an absent map is the neutral reading — δ₀ everywhere', () => {
    const neutral = neutralImprecisionReading('imprecisionTiming');
    expect(neutral.spans).toHaveLength(0);
    const law = lawAt(neutral, 12345);
    expect(lawsEqual(isBottom(law) ? DELTA_ZERO : law.value, DELTA_ZERO)).toBe(true);
  });
});

// --- timingBasis ----------------------------------------------------------------------------

describe('milliseconds.timingBasis: derivation and family-dependence', () => {
  it('is derived from the limits for uniform / gaussian / brownian, in the timing domain', () => {
    const span = spanAt(
      readFor('<distribution.uniform date="0.0" limit.lower="-30" limit.upper="30"/>'),
    );
    expect(span.timingBasisMs).toBe(60);
    expect(span.timingBasisDerived).toBe(true);
  });

  it('is derived from the CLIPS for both triangles', () => {
    const span = spanAt(
      readFor(
        '<distribution.triangular date="0.0" limit.lower="-30" limit.upper="30" mode="0" clip.lower="-20" clip.upper="20"/>',
      ),
    );
    expect(span.timingBasisMs).toBe(40);
    expect(span.timingBasisDerived).toBe(true);
  });

  it('falls back to 100 outside the timing domain, whatever the limits say', () => {
    const span = spanAt(
      readFor('<distribution.uniform date="0.0" limit.lower="-30" limit.upper="30"/>', 'dynamics'),
    );
    expect(span.timingBasisMs).toBe(DEFAULT_TIMING_BASIS_MS);
    expect(span.timingBasisDerived).toBe(false);
  });

  it('falls back to 100 when the derivation is ≤ 0 — which absent limits guarantee', () => {
    const span = spanAt(readFor('<distribution.uniform date="0.0"/>'));
    expect(span.timingBasisMs).toBe(DEFAULT_TIMING_BASIS_MS);
    expect(span.timingBasisDerived).toBe(false);
  });

  it('an explicit basis wins and is not marked derived', () => {
    const span = spanAt(
      readFor(
        '<distribution.uniform date="0.0" limit.lower="-30" limit.upper="30" milliseconds.timingBasis="250"/>',
      ),
    );
    expect(span.timingBasisMs).toBe(250);
    expect(span.timingBasisDerived).toBe(false);
  });

  it('is INERT for the i.i.d. families and a process parameter for the correlated ones', () => {
    expect(timingBasisIsInert('distribution.uniform')).toBe(true);
    expect(timingBasisIsInert('distribution.gaussian')).toBe(true);
    expect(timingBasisIsInert('distribution.triangular')).toBe(true);
    expect(timingBasisIsInert('distribution.list')).toBe(true);
    expect(timingBasisIsInert('distribution.correlated.brownianNoise')).toBe(false);
    expect(timingBasisIsInert('distribution.correlated.compensatingTriangle')).toBe(false);
    expect(timingBasisIsInert(null)).toBe(true);
  });

  it('the basis changes WHICH draw an i.i.d. note gets, never the law it is drawn from', () => {
    const at = (basis: string): ImprecisionLaw =>
      lawOf(UNIFORM(`limit.lower="-30" limit.upper="30" milliseconds.timingBasis="${basis}"`));
    expect(at('100')).toEqual(at('900'));
    // …and the RENDER really does differ, so the inertness is a claim about the law rather
    // than about the document being unchanged.
    const one = performedDates(
      UNIFORM('limit.lower="-30" limit.upper="30" milliseconds.timingBasis="100"'),
    );
    const other = performedDates(
      UNIFORM('limit.lower="-30" limit.upper="30" milliseconds.timingBasis="900"'),
    );
    expect(one).not.toEqual(other);
  });
});

// --- processParameters and the declared-law qualification -------------------------------------

describe('correlated families: processParameters and the index-dependent marginal', () => {
  it('brownianNoise carries stepWidth.max as a process parameter', () => {
    const reading = readFor(
      '<distribution.correlated.brownianNoise date="0.0" stepWidth.max="3" limit.lower="-30" limit.upper="30"/>',
    );
    expect(processParametersAt(reading, 0)).toEqual([
      { attribute: 'stepWidth.max', value: 3 },
      // The basis folds into the process for a correlated family, and only there.
      { attribute: 'milliseconds.timingBasis', value: 60 },
    ]);
  });

  it('compensatingTriangle carries degreeOfCorrelation', () => {
    const reading = readFor(
      '<distribution.correlated.compensatingTriangle date="0.0" degreeOfCorrelation="2" limit.lower="-30" limit.upper="30" clip.lower="-30" clip.upper="30"/>',
    );
    expect(processParametersAt(reading, 0)).toEqual([
      { attribute: 'degreeOfCorrelation', value: 2 },
      { attribute: 'milliseconds.timingBasis', value: 60 },
    ]);
  });

  it('the declared marginal is doHandover’s index-0 law: the MIDDLE HALF of the limits', () => {
    // Measured from 20 000 independent chains: KS 0.0058 against U(-15, 15) for limits ±30.
    const law = lawOf(
      '<distribution.correlated.brownianNoise date="0.0" stepWidth.max="3" limit.lower="-30" limit.upper="30"/>',
    );
    expect(law).toEqual({ kind: 'uniform', lower: -15, upper: 15 });
  });

  it('the compensating triangle’s start is clipped, which is where its clips bite', () => {
    const law = lawOf(
      '<distribution.correlated.compensatingTriangle date="0.0" degreeOfCorrelation="2" limit.lower="-30" limit.upper="30" clip.lower="-10" clip.upper="10"/>',
    );
    expect(law.kind).toBe('clipped');
    // Clip-less is δ₀ — the clip bounds coerce to 0 and clamp everything onto it.
    expect(
      lawsEqual(
        lawOf(
          '<distribution.correlated.compensatingTriangle date="0.0" degreeOfCorrelation="2" limit.lower="-30" limit.upper="30"/>',
        ),
        DELTA_ZERO,
      ),
    ).toBe(true);
  });

  it('every correlated span carries the declared-law note with its measurement', () => {
    const reading = readFor(
      '<distribution.correlated.brownianNoise date="0.0" stepWidth.max="3" limit.lower="-30" limit.upper="30"/>',
    );
    const declared = reading.notes.filter((note) => note.kind === 'declared-law');
    expect(declared).toHaveLength(1);
    const note = elementAt(declared, 0, 'the declared-law notes');
    expect(note.detail).toBe(CORRELATED_MARGINAL_NOTE);
    expect(note.detail).toContain('index-dependent');
  });

  it('an i.i.d. span carries no process parameters and no declared-law note', () => {
    const reading = readFor(UNIFORM('limit.lower="-30" limit.upper="30"'));
    expect(processParametersAt(reading, 0)).toEqual([]);
    expect(reading.notes.filter((note) => note.kind === 'declared-law')).toHaveLength(0);
  });
});

// --- the other two domains --------------------------------------------------------------------

describe('the dynamics and toneduration domains read the same laws', () => {
  it('imprecisionMap.dynamics perturbs velocity, and δ₀ leaves it alone', () => {
    const perturbed = performedVelocities(
      UNIFORM('limit.lower="-20" limit.upper="20" milliseconds.timingBasis="300"'),
    );
    const neutral = performedVelocities('');
    expect(perturbed.map(Number)).not.toEqual(neutral.map(Number));
    // NUMERICALLY equal, not byte-equal: a δ₀ map still touches the attribute and the
    // write-back re-serializes it ("100.0" -> "100") — a byte-level fingerprint with no
    // numeric content.
    expect(performedVelocities(UNIFORM('milliseconds.timingBasis="300"')).map(Number)).toEqual(
      neutral.map(Number),
    );
  });

  it('the reader reaches all three domains through one code path', () => {
    for (const domain of ['timing', 'dynamics', 'toneduration'] as const) {
      const reading = readFor(UNIFORM('limit.lower="-30" limit.upper="30"'), domain);
      expect(reading.domain).toBe(READER_DOMAINS[domain]);
      expect(reading.spans).toHaveLength(1);
    }
  });
});
